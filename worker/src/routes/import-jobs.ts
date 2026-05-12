import { Hono } from 'hono';
import type { AppContext } from '../env';
import {
  listImportJobs,
  getImportJob,
  listImportJobItems,
  getImportJobItem,
  updateImportJobItemCorrections,
} from '../db/repo-imports';
import { requireAuth, requireAdmin, getActorEmail } from '../lib/auth';
import { writeAudit } from '../lib/audit';
import { importJobItemPatchRequest } from '@shared/api-contract';

export const importJobRoutes = new Hono<AppContext>();

importJobRoutes.use('/api/import-jobs', requireAuth);
importJobRoutes.use('/api/import-jobs/*', requireAuth);

importJobRoutes.get('/api/import-jobs', async (c) => {
  const result = await listImportJobs(c.env);
  return c.json(result);
});

importJobRoutes.get('/api/import-jobs/:id', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const job = await getImportJob(c.env, id);
  if (!job) return c.json({ error: 'NOT_FOUND', message: `Job ${id} not found` }, 404);
  return c.json({ job });
});

importJobRoutes.get('/api/import-jobs/:id/items', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const items = await listImportJobItems(c.env, id);
  return c.json({ jobId: id, items });
});

/**
 * PATCH /api/import-jobs/:id/items/:itemId — admin-only.
 *
 * Stores the user's field edits as JSON on `import_job_items.corrected_payload`.
 * The commit pipeline merges these over `raw_payload` before applying, so
 * the committed row reflects the user's review, not the raw parser
 * output. Audit row: `contract_import.review_updated`.
 *
 * The route does NOT mutate the entity itself — that only happens at
 * /api/imports/commit. So PATCH-then-cancel leaves the entity tables
 * untouched.
 */
importJobRoutes.patch('/api/import-jobs/:id/items/:itemId', requireAdmin, async (c) => {
  const jobId = c.req.param('id');
  const itemId = c.req.param('itemId');
  if (!jobId || !itemId) {
    return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  }
  const job = await getImportJob(c.env, jobId);
  if (!job) return c.json({ error: 'NOT_FOUND', message: `Job ${jobId} not found` }, 404);
  if (job.status === 'committed') {
    return c.json({ error: 'CONFLICT', message: 'Job already committed; corrections not allowed' }, 409);
  }
  const item = await getImportJobItem(c.env, itemId);
  if (!item || item.jobId !== jobId) {
    return c.json({ error: 'NOT_FOUND', message: `Item ${itemId} not found for job ${jobId}` }, 404);
  }
  const raw = await c.req.json().catch(() => null);
  const parsed = importJobItemPatchRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: 'BAD_REQUEST', message: 'Invalid corrections payload', issues: parsed.error.issues },
      400,
    );
  }
  try {
    await updateImportJobItemCorrections(c.env, itemId, parsed.data.corrections);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/no such column/i.test(msg)) {
      return c.json(
        {
          error: 'NOT_IMPLEMENTED',
          message:
            'Database has not been migrated to 0009 yet. Apply migrations/0009_contract_compensation_and_corrections.sql first.',
        },
        503,
      );
    }
    throw err;
  }
  const actor = (await getActorEmail(c)) ?? 'unknown';
  await writeAudit(c.env, {
    actor,
    action: 'contract_import.review_updated',
    target: itemId,
    status: 'ok',
    details: `Edited ${Object.keys(parsed.data.corrections).length} field(s) on import item`,
  });
  const after = await getImportJobItem(c.env, itemId);
  return c.json({ ok: true as const, item: after });
});
