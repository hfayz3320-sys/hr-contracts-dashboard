import { Hono } from 'hono';
import type { AppContext } from '../env';
import { listReviewQueue } from '../db/repo-imports';
import {
  getReviewItem,
  resolveReviewItem,
  dismissReviewItem,
} from '../db/repo-review';
import {
  reviewResolveRequest,
  reviewDismissRequest,
  reviewApproveRequest,
  reviewRejectRequest,
} from '@shared/api-contract';
import { requireAdmin, requireAuth, getActorEmail } from '../lib/auth';
import { writeAudit } from '../lib/audit';
import { findEmployeeByIdentity, updateEmployeeFields, insertEmployee } from '../db/repo-employees';
import { updateInsuranceFields } from '../db/repo-insurance';
import { updateContractFields } from '../db/repo-contracts';
import { newId } from '../lib/id';

export const reviewQueueRoutes = new Hono<AppContext>();

reviewQueueRoutes.use('/api/review-queue', requireAuth);
reviewQueueRoutes.use('/api/review-queue/*', requireAuth);

reviewQueueRoutes.get('/api/review-queue', async (c) => {
  const status = c.req.query('status');
  const narrowed: 'open' | 'resolved' | 'dismissed' | undefined =
    status === 'open' || status === 'resolved' || status === 'dismissed' ? status : undefined;
  const result = await listReviewQueue(c.env, narrowed ? { status: narrowed } : {});
  return c.json(result);
});

reviewQueueRoutes.post('/api/review-queue/:id/resolve', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const raw = await c.req.json().catch(() => ({}));
  const parsed = reviewResolveRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: 'BAD_REQUEST', message: 'Invalid request', issues: parsed.error.issues },
      400,
    );
  }
  const actor = (await getActorEmail(c)) ?? 'unknown';
  const existing = await getReviewItem(c.env, id);
  if (!existing) return c.json({ error: 'NOT_FOUND', message: `Review item ${id} not found` }, 404);
  if (existing.status !== 'open') {
    return c.json({ error: 'CONFLICT', message: `Review item is ${existing.status}, not open` }, 409);
  }
  await resolveReviewItem(c.env, id, parsed.data.resolution, actor, parsed.data.linkedEmployeeId);
  await writeAudit(c.env, {
    actor,
    action: 'review.resolve',
    target: id,
    status: 'ok',
    details: `${parsed.data.resolution}${parsed.data.note ? ' · ' + parsed.data.note : ''}`,
  });
  return c.json({ id, status: 'resolved' as const });
});

reviewQueueRoutes.post('/api/review-queue/:id/dismiss', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const raw = await c.req.json().catch(() => ({}));
  const parsed = reviewDismissRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: 'BAD_REQUEST', message: 'Invalid request', issues: parsed.error.issues },
      400,
    );
  }
  const actor = (await getActorEmail(c)) ?? 'unknown';
  const existing = await getReviewItem(c.env, id);
  if (!existing) return c.json({ error: 'NOT_FOUND', message: `Review item ${id} not found` }, 404);
  if (existing.status !== 'open') {
    return c.json({ error: 'CONFLICT', message: `Review item is ${existing.status}, not open` }, 409);
  }
  await dismissReviewItem(c.env, id, actor, parsed.data.reason);
  await writeAudit(c.env, {
    actor,
    action: 'review.dismiss',
    target: id,
    status: 'warning',
    details: parsed.data.reason ?? 'dismissed',
  });
  return c.json({ id, status: 'dismissed' as const });
});

/**
 * POST /api/review-queue/:id/approve
 *
 * Commits corrected fields into the target entity table:
 *   - employee  → insert or update employees row (identity-keyed)
 *   - insurance → update insurance_policies row referenced by the original payload
 *   - contract  → update contracts row referenced by the original payload
 *
 * On success marks the review item as 'resolved' with resolution='approved'
 * and `linked_target_id` pointing at the affected entity row. Audit logged.
 */
reviewQueueRoutes.post('/api/review-queue/:id/approve', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const raw = await c.req.json().catch(() => null);
  const parsed = reviewApproveRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: 'BAD_REQUEST', message: 'Invalid approve payload', issues: parsed.error.issues },
      400,
    );
  }
  const item = await getReviewItem(c.env, id);
  if (!item) return c.json({ error: 'NOT_FOUND', message: `Review item ${id} not found` }, 404);
  if (item.status !== 'open') {
    return c.json({ error: 'CONFLICT', message: `Review item is ${item.status}, not open` }, 409);
  }
  const actor = (await getActorEmail(c)) ?? 'unknown';
  const fields = parsed.data.correctedFields;

  let targetId: string | null = null;
  try {
    if (item.entity === 'employee') {
      const identity = strOf(fields.identityNumber);
      if (!identity) {
        return c.json({ error: 'BAD_REQUEST', message: 'identityNumber is required to approve an employee review' }, 400);
      }
      const existing = await findEmployeeByIdentity(c.env, identity);
      if (existing) {
        await updateEmployeeFields(c.env, existing.id, {
          fullName: strOf(fields.fullName) ?? undefined,
          department: strOf(fields.department),
          jobTitle: strOf(fields.jobTitle),
          nationality: strOf(fields.nationality),
          dateOfBirth: strOf(fields.dateOfBirth),
          hireDate: strOf(fields.hireDate),
          sourceFileId: '__review_approve__',
        });
        targetId = existing.id;
      } else {
        const created = await insertEmployee(c.env, newId('emp'), {
          identityNumber: identity,
          fullName: strOf(fields.fullName) ?? '(no name)',
          department: strOf(fields.department),
          jobTitle: strOf(fields.jobTitle),
          nationality: strOf(fields.nationality),
          dateOfBirth: strOf(fields.dateOfBirth),
          hireDate: strOf(fields.hireDate),
          status: 'active',
          sourceFileId: '__review_approve__',
        });
        targetId = created;
      }
    } else if (item.entity === 'insurance') {
      // Insurance review payload retains the original `row` shape with a memberNumber + identityNumber.
      // The target insurance_policies row may or may not exist yet. If admin provided enough fields,
      // we update by id when known, else we just record the resolution as "linked" without table mutation.
      const linkId = strOf(fields.linkedTargetId);
      if (linkId) {
        await updateInsuranceFields(c.env, linkId, {
          identityNumber: strOf(fields.identityNumber),
          policyNumber: strOf(fields.policyNumber),
          memberNumber: strOf(fields.memberNumber),
          provider: strOf(fields.provider),
          startDate: strOf(fields.startDate),
          endDate: strOf(fields.endDate),
          sourceFileId: '__review_approve__',
        });
        targetId = linkId;
      }
    } else if (item.entity === 'contract') {
      const linkId = strOf(fields.linkedTargetId);
      if (linkId) {
        await updateContractFields(c.env, linkId, {
          identityNumber: strOf(fields.identityNumber) ?? undefined,
          contractType: strOf(fields.contractType) ?? undefined,
          startDate: strOf(fields.startDate) ?? undefined,
          endDate: strOf(fields.endDate) ?? undefined,
          notes: strOf(fields.notes),
        });
        targetId = linkId;
      }
    }
  } catch (err) {
    await writeAudit(c.env, {
      actor,
      action: 'review.approve_failed',
      target: id,
      status: 'error',
      details: err instanceof Error ? err.message : String(err),
    });
    return c.json({ error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'approve failed' }, 500);
  }

  await resolveReviewItem(c.env, id, 'accept_update', actor, targetId ?? undefined);
  await writeAudit(c.env, {
    actor,
    action: 'review.approve',
    target: id,
    status: 'ok',
    details: `Approved ${item.entity} review → target=${targetId ?? '(no entity mutation)'}${parsed.data.note ? ' · ' + parsed.data.note : ''}`,
  });
  return c.json({ id, status: 'resolved' as const });
});

/**
 * POST /api/review-queue/:id/reject — admin rejects a review item with reason.
 * Modeled as a dismiss with required reason; preserves audit trail and
 * tags the resolution as 'rejected'.
 */
reviewQueueRoutes.post('/api/review-queue/:id/reject', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const raw = await c.req.json().catch(() => ({}));
  const parsed = reviewRejectRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: 'BAD_REQUEST', message: 'Reject reason is required', issues: parsed.error.issues },
      400,
    );
  }
  const actor = (await getActorEmail(c)) ?? 'unknown';
  const existing = await getReviewItem(c.env, id);
  if (!existing) return c.json({ error: 'NOT_FOUND', message: `Review item ${id} not found` }, 404);
  if (existing.status !== 'open') {
    return c.json({ error: 'CONFLICT', message: `Review item is ${existing.status}, not open` }, 409);
  }
  await dismissReviewItem(c.env, id, actor, `rejected: ${parsed.data.reason}`);
  await writeAudit(c.env, {
    actor,
    action: 'review.reject',
    target: id,
    status: 'warning',
    details: `Rejected: ${parsed.data.reason}`,
  });
  return c.json({ id, status: 'dismissed' as const });
});

function strOf(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}
