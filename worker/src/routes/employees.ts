import { Hono } from 'hono';
import type { AppContext } from '../env';
import {
  getEmployee,
  listEmployees,
  updateEmployeeFields,
  setCurrentEmployeeNumber,
  insertEmployee,
  findEmployeeByIdentity,
} from '../db/repo-employees';
import { listContractsForEmployee } from '../db/repo-contracts';
import { listInsuranceForEmployee } from '../db/repo-insurance';
import { listAuditForTarget } from '../db/repo-audit';
import { listDocumentsForEmployee } from '../db/repo-employee-documents';
import { listTransactionsForEmployee } from '../db/repo-employee-transactions';
import { findAppUserByEmployeeId } from '../db/repo-users';
import {
  listTimelineForEmployee,
  listActivitiesForEmployee,
  listCompensationForEmployee,
  listLearningForEmployee,
} from '../db/repo-employee-360-actions';
import { computeEmployeeDataQuality } from '../lib/employee-data-quality';
import { requireAuth, requireAdmin, getActorEmail } from '../lib/auth';
import { writeAudit } from '../lib/audit';
import { newId } from '../lib/id';
import { employeePatchRequest, employeeManualCreateRequest } from '@shared/api-contract';

export const employeeRoutes = new Hono<AppContext>();

employeeRoutes.use('/api/employees', requireAuth);
employeeRoutes.use('/api/employees/*', requireAuth);

/**
 * POST /api/employees/manual — admin-only manual create.
 *
 * Match-key contract:
 *   - identityNumber is the only key. Lookup is exact.
 *   - If an employee already exists for that identity, the response
 *     returns `existing: true` plus the existing employee row. NO fields
 *     are mutated; the UI's job is to redirect the user to the existing
 *     profile instead of producing a duplicate.
 *   - If no employee exists, a new row is inserted (with `source_file_id`
 *     = sentinel "manual:<actor>" so the traceability column is never
 *     null) and `existing: false` is returned. Audit row uses
 *     `employee.manual_create`.
 *
 * EmployeeNumber stays history-only: the route appends to
 * employee_number_history when `employeeNumber` is supplied. It is never
 * stored on the employees row.
 *
 * Mounted BEFORE the `/:id` reads so the literal `/manual` path doesn't
 * resolve to a 404 lookup for an employee named "manual".
 */
employeeRoutes.post('/api/employees/manual', requireAdmin, async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = employeeManualCreateRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: 'BAD_REQUEST', message: 'Invalid manual-create payload', issues: parsed.error.issues },
      400,
    );
  }
  const actor = (await getActorEmail(c)) ?? 'unknown';

  const existing = await findEmployeeByIdentity(c.env, parsed.data.identityNumber);
  if (existing) {
    await writeAudit(c.env, {
      actor,
      action: 'employee.manual_create_blocked',
      target: existing.id,
      status: 'warning',
      details: `identity ${parsed.data.identityNumber} already exists — returned existing employee`,
    });
    return c.json({ ok: true as const, existing: true as const, employee: existing });
  }

  // No existing match → insert. Use a sentinel `source_file_id` so the
  // traceability column never carries a NULL for manually-created rows.
  const sourceFileId = `manual:${actor}`;
  const newEmployeeId = newId('emp');
  await insertEmployee(c.env, newEmployeeId, {
    identityNumber: parsed.data.identityNumber,
    fullName:
      parsed.data.fullName?.trim() ||
      parsed.data.fullNameArabic?.trim() ||
      parsed.data.identityNumber,
    fullNameArabic: parsed.data.fullNameArabic ?? null,
    jobTitle: parsed.data.jobTitle ?? null,
    department: parsed.data.department ?? null,
    nationality: parsed.data.nationality ?? null,
    mobile: parsed.data.mobile ?? null,
    notes: parsed.data.notes ?? null,
    status: parsed.data.status ?? 'active',
    sourceFileId,
  });

  if (parsed.data.employeeNumber) {
    const today = new Date().toISOString().slice(0, 10);
    await setCurrentEmployeeNumber(
      c.env, newEmployeeId, parsed.data.employeeNumber, today, sourceFileId,
    );
  }

  const created = await getEmployee(c.env, newEmployeeId);
  if (!created) {
    return c.json({ error: 'INTERNAL_ERROR', message: 'Insert succeeded but re-read failed' }, 500);
  }
  await writeAudit(c.env, {
    actor,
    action: 'employee.manual_create',
    target: created.id,
    status: 'ok',
    details:
      `Manually created employee ${created.id} (identity ${parsed.data.identityNumber})` +
      (parsed.data.employeeNumber ? `, employeeNumber=${parsed.data.employeeNumber}` : ''),
  });
  return c.json({ ok: true as const, existing: false as const, employee: created });
});

employeeRoutes.get('/api/employees', async (c) => {
  const result = await listEmployees(c.env);
  return c.json(result);
});

/**
 * GET /api/employees/:id — Phase 4A additively extended.
 *
 * Existing callers receive `{ employee, contracts, insurance, audit }`
 * unchanged. Phase 4A appends `documents`, `transactions`, and
 * `dataQuality` so the front end's Employee 360 view can render from a
 * single fetch. None of the new fields break older clients (extra keys
 * in a JSON body are tolerated by every consumer we control).
 *
 * `documents` / `transactions` will be EMPTY arrays until migration 0005
 * is applied and rows are written by the new routes — there is no
 * synthesis from contracts/insurance.
 */
employeeRoutes.get('/api/employees/:id', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const employee = await getEmployee(c.env, id);
  if (!employee) {
    return c.json({ error: 'NOT_FOUND', message: `Employee ${id} not found` }, 404);
  }
  // Pre-migration safety: if 0005 hasn't been applied yet, the document /
  // transaction queries throw "no such table". Catch and degrade to empty
  // arrays so the older 360 surface keeps working in environments that
  // haven't run the migration yet.
  const safeList = async <T,>(fn: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/no such table/i.test(msg)) return [];
      throw err;
    }
  };

  // Same idea as `safeList` but for a scalar query: returns null if the
  // employee_id column doesn't exist yet (i.e. migration 0007 hasn't
  // been applied). app_users.employee_id is the only new column on an
  // existing business table, so we guard the query that uses it.
  const safeOne = async <T,>(fn: () => Promise<T | null>): Promise<T | null> => {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/no such column|no such table/i.test(msg)) return null;
      throw err;
    }
  };

  const [
    contracts, insurance, audit, documents, transactions,
    timeline, activities, compensation, learning,
    linkedUser,
  ] = await Promise.all([
    listContractsForEmployee(c.env, id),
    listInsuranceForEmployee(c.env, id),
    listAuditForTarget(c.env, id),
    safeList(() => listDocumentsForEmployee(c.env, id)),
    safeList(() => listTransactionsForEmployee(c.env, id)),
    // Phase 10 additions — same pre-migration safety: migration 0007 may
    // not be applied yet on this environment. Fall back to empty arrays
    // until then so the existing surfaces keep working.
    safeList(() => listTimelineForEmployee(c.env, id)),
    safeList(() => listActivitiesForEmployee(c.env, id)),
    safeList(() => listCompensationForEmployee(c.env, id)),
    safeList(() => listLearningForEmployee(c.env, id)),
    safeOne(() => findAppUserByEmployeeId(c.env, id)),
  ]);

  const dataQuality = computeEmployeeDataQuality({
    employee,
    contracts,
    insurance,
    documents,
  });

  // Phase 11 — derive the "current contract" + current compensation total
  // at READ TIME. Old contracts stay as history; we don't destroy or
  // overwrite anything. The "current" contract is the one whose window
  // covers today, picked by latest end_date.
  const today = new Date().toISOString().slice(0, 10);
  const currentContract = pickCurrentContract(contracts, today);
  let currentCompensation: {
    currency: string;
    monthlyTotal: number;
    sourceContractId: string | null;
    lines: typeof compensation;
  } | null = null;
  if (compensation.length > 0) {
    const linesForCurrent = currentContract
      ? compensation.filter((l) => l.sourceContractId === currentContract.id)
      : [];
    const lines = linesForCurrent.length > 0
      ? linesForCurrent
      : compensation.filter((l) => l.frequency === 'monthly' &&
          (!l.effectiveTo || l.effectiveTo >= today));
    const monthlyTotal = lines
      .filter((l) => l.frequency === 'monthly')
      .reduce((s, l) => s + l.amount, 0);
    const currency = lines[0]?.currency ?? 'SAR';
    currentCompensation = {
      currency,
      monthlyTotal,
      sourceContractId: currentContract?.id ?? null,
      lines,
    };
  }

  return c.json({
    employee,
    contracts,
    insurance,
    audit,
    documents,
    transactions,
    dataQuality,
    // Phase 10 — always present, possibly empty arrays.
    timeline,
    activities,
    compensation,
    learning,
    // The app_users row linked to this employee, or null. Read by the
    // profile to show "Login: alice@example.com (hr_manager)" when set.
    linkedUser,
    // Phase 11 — derived view of "what is the current contract / salary"
    // so the FE summary card doesn't have to re-implement the lifecycle
    // rules.
    currentContract,
    currentCompensation,
  });
});

/**
 * Pick the contract whose window covers `today`, preferring the latest
 * end date. Mirrors the FE `splitContractsByLifecycle` "current" rule but
 * computed server-side once. Returns null when no contract covers today.
 */
function pickCurrentContract<T extends { startDate: string; endDate: string }>(
  contracts: T[],
  today: string,
): T | null {
  let best: T | null = null;
  for (const c of contracts) {
    if (!c.startDate || !c.endDate) continue;
    if (c.startDate <= today && c.endDate >= today) {
      if (!best || c.endDate > best.endDate) best = c;
    }
  }
  return best;
}

/**
 * PATCH /api/employees/:id — admin-only edit.
 *
 * Updates only the fields the client supplies (no partial-merge surprises).
 * Identity number is special-cased: it's the primary match key, so changing
 * it is allowed but audited prominently with old/new values redacted to
 * first-two/last-two digits.
 *
 * EmployeeNumber goes through history (closes the open row + appends new).
 */
employeeRoutes.patch('/api/employees/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);

  const raw = await c.req.json().catch(() => null);
  const parsed = employeePatchRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: 'BAD_REQUEST', message: 'Invalid patch payload', issues: parsed.error.issues },
      400,
    );
  }
  const before = await getEmployee(c.env, id);
  if (!before) {
    return c.json({ error: 'NOT_FOUND', message: `Employee ${id} not found` }, 404);
  }
  const actor = (await getActorEmail(c)) ?? 'unknown';

  // Apply field update (excludes employeeNumber which goes to history).
  const { employeeNumber, ...fieldsPatch } = parsed.data;
  await updateEmployeeFields(c.env, id, fieldsPatch);

  // Append to employee_number_history if the number changed.
  if (employeeNumber != null) {
    const fromDate = fieldsPatch.hireDate ?? new Date().toISOString().slice(0, 10);
    await setCurrentEmployeeNumber(c.env, id, employeeNumber, fromDate, '__edit__');
  }

  const after = await getEmployee(c.env, id);
  if (!after) {
    return c.json({ error: 'INTERNAL_ERROR', message: 'Update succeeded but re-read failed' }, 500);
  }

  // Audit. Identity-number changes are redacted to first2/last2.
  const changedFields: string[] = [];
  for (const k of Object.keys(parsed.data) as Array<keyof typeof parsed.data>) {
    if (k === 'identityNumber' && parsed.data[k] != null) {
      const oldI = before.identityNumber;
      const newI = parsed.data[k] as string;
      changedFields.push(`identityNumber: ${oldI.slice(0,2)}…${oldI.slice(-2)} → ${newI.slice(0,2)}…${newI.slice(-2)}`);
    } else if (parsed.data[k] !== undefined) {
      changedFields.push(String(k));
    }
  }
  await writeAudit(c.env, {
    actor,
    action: 'employee.patch',
    target: id,
    status: 'ok',
    details: `Updated ${changedFields.length} field(s): ${changedFields.join(', ')}`,
  });

  return c.json({ ok: true as const, employee: after });
});
