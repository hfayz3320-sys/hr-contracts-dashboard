import { Hono } from 'hono';
import type { AppContext } from '../env';
import {
  listContracts,
  getContractById,
  updateContractFields,
} from '../db/repo-contracts';
import { findEmployeeByIdentity } from '../db/repo-employees';
import { requireAuth, requireAdmin, getActorEmail } from '../lib/auth';
import { writeAudit } from '../lib/audit';
import { contractPatchRequest } from '@shared/api-contract';

export const contractRoutes = new Hono<AppContext>();

contractRoutes.use('/api/contracts', requireAuth);
contractRoutes.use('/api/contracts/*', requireAuth);

contractRoutes.get('/api/contracts', async (c) => {
  // Phase 3B — opt-in joined employee summary. Caller adds ?includeEmployee=1
  // to receive each row's `employeeSummary` + `linkStatus`. Default is the
  // bare contract row for backward compatibility.
  const includeEmployee = c.req.query('includeEmployee') === '1';
  const result = await listContracts(c.env, { includeEmployee });
  return c.json(result);
});

/**
 * PATCH /api/contracts/:id — admin-only "Fix contract" action.
 *
 * Used by both the Contracts table edit drawer and the Review Queue
 * resolver when an admin corrects an extracted contract.
 *
 * If `identityNumber` changes, employee_id is re-resolved to the new
 * matching employee (if one exists).
 */
contractRoutes.patch('/api/contracts/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);

  const raw = await c.req.json().catch(() => null);
  const parsed = contractPatchRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: 'BAD_REQUEST', message: 'Invalid patch payload', issues: parsed.error.issues },
      400,
    );
  }
  const before = await getContractById(c.env, id);
  if (!before) return c.json({ error: 'NOT_FOUND', message: `Contract ${id} not found` }, 404);
  const actor = (await getActorEmail(c)) ?? 'unknown';

  let patchWithEmployee: Parameters<typeof updateContractFields>[2] = { ...parsed.data };
  if (parsed.data.identityNumber !== undefined && parsed.data.identityNumber !== before.identityNumber) {
    const emp = await findEmployeeByIdentity(c.env, parsed.data.identityNumber);
    if (emp) patchWithEmployee = { ...patchWithEmployee, employeeId: emp.id };
  }
  await updateContractFields(c.env, id, patchWithEmployee);

  const after = await getContractById(c.env, id);
  if (!after) {
    return c.json({ error: 'INTERNAL_ERROR', message: 'Update succeeded but re-read failed' }, 500);
  }

  const changedFields = Object.keys(parsed.data).filter(
    (k) => (parsed.data as Record<string, unknown>)[k] !== undefined,
  );
  await writeAudit(c.env, {
    actor,
    action: 'contract.patch',
    target: id,
    status: 'ok',
    details: `Updated ${changedFields.length} field(s): ${changedFields.join(', ')}`,
  });

  return c.json({ ok: true as const, contract: after });
});
