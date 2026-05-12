import { Hono } from 'hono';
import type { AppContext } from '../env';
import {
  getEmployee,
  listEmployees,
  updateEmployeeFields,
  setCurrentEmployeeNumber,
} from '../db/repo-employees';
import { listContractsForEmployee } from '../db/repo-contracts';
import { listInsuranceForEmployee } from '../db/repo-insurance';
import { listAuditForTarget } from '../db/repo-audit';
import { listDocumentsForEmployee } from '../db/repo-employee-documents';
import { listTransactionsForEmployee } from '../db/repo-employee-transactions';
import {
  listTimelineForEmployee,
  listActivitiesForEmployee,
  listCompensationForEmployee,
  listLearningForEmployee,
} from '../db/repo-employee-360-actions';
import { computeEmployeeDataQuality } from '../lib/employee-data-quality';
import { requireAuth, requireAdmin, getActorEmail } from '../lib/auth';
import { writeAudit } from '../lib/audit';
import { employeePatchRequest } from '@shared/api-contract';

export const employeeRoutes = new Hono<AppContext>();

employeeRoutes.use('/api/employees', requireAuth);
employeeRoutes.use('/api/employees/*', requireAuth);

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

  const [
    contracts, insurance, audit, documents, transactions,
    timeline, activities, compensation, learning,
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
  ]);

  const dataQuality = computeEmployeeDataQuality({
    employee,
    contracts,
    insurance,
    documents,
  });

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
  });
});

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
