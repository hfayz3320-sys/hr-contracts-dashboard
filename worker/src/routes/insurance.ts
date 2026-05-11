import { Hono } from 'hono';
import type { AppContext } from '../env';
import {
  listInsurance,
  getInsuranceById,
  updateInsuranceFields,
} from '../db/repo-insurance';
import { findEmployeeByIdentity } from '../db/repo-employees';
import { requireAuth, requireAdmin, getActorEmail } from '../lib/auth';
import { writeAudit } from '../lib/audit';
import { insurancePatchRequest } from '@shared/api-contract';

export const insuranceRoutes = new Hono<AppContext>();

insuranceRoutes.use('/api/insurance', requireAuth);
insuranceRoutes.use('/api/insurance/*', requireAuth);

insuranceRoutes.get('/api/insurance', async (c) => {
  // Phase 3B — opt-in joined employee summary (?includeEmployee=1).
  const includeEmployee = c.req.query('includeEmployee') === '1';
  const result = await listInsurance(c.env, { includeEmployee });
  return c.json(result);
});

/**
 * PATCH /api/insurance/:id — admin-only edit of an insurance policy row.
 *
 * On identity-number change we also re-link `employee_id` (to the matching
 * employees row by identity) and recompute `matched`. That way fixing a
 * member's Iqama auto-attaches them to the right employee without a
 * separate "link" call.
 */
insuranceRoutes.patch('/api/insurance/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);

  const raw = await c.req.json().catch(() => null);
  const parsed = insurancePatchRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: 'BAD_REQUEST', message: 'Invalid patch payload', issues: parsed.error.issues },
      400,
    );
  }

  const before = await getInsuranceById(c.env, id);
  if (!before) return c.json({ error: 'NOT_FOUND', message: `Insurance ${id} not found` }, 404);
  const actor = (await getActorEmail(c)) ?? 'unknown';

  // If identityNumber was changed, re-resolve employee link + matched flag.
  let patchWithEmployee: Parameters<typeof updateInsuranceFields>[2] = { ...parsed.data };
  if (parsed.data.identityNumber !== undefined) {
    const newIdentity = parsed.data.identityNumber;
    if (newIdentity == null) {
      patchWithEmployee = { ...patchWithEmployee, employeeId: null, matched: false, unmatchedReason: 'no_identity_match' };
    } else {
      const emp = await findEmployeeByIdentity(c.env, newIdentity);
      patchWithEmployee = {
        ...patchWithEmployee,
        employeeId: emp?.id ?? null,
        matched: !!emp,
        unmatchedReason: emp ? undefined : 'no_identity_match',
      };
    }
  }
  await updateInsuranceFields(c.env, id, patchWithEmployee);

  const after = await getInsuranceById(c.env, id);
  if (!after) {
    return c.json({ error: 'INTERNAL_ERROR', message: 'Update succeeded but re-read failed' }, 500);
  }

  const changedFields = Object.keys(parsed.data).filter(
    (k) => (parsed.data as Record<string, unknown>)[k] !== undefined,
  );
  await writeAudit(c.env, {
    actor,
    action: 'insurance.patch',
    target: id,
    status: 'ok',
    details: `Updated ${changedFields.length} field(s): ${changedFields.join(', ')}`,
  });

  return c.json({ ok: true as const, insurance: after });
});
