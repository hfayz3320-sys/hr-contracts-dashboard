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

employeeRoutes.get('/api/employees/:id', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const employee = await getEmployee(c.env, id);
  if (!employee) {
    return c.json({ error: 'NOT_FOUND', message: `Employee ${id} not found` }, 404);
  }
  const [contracts, insurance, audit] = await Promise.all([
    listContractsForEmployee(c.env, id),
    listInsuranceForEmployee(c.env, id),
    listAuditForTarget(c.env, id),
  ]);
  return c.json({ employee, contracts, insurance, audit });
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
