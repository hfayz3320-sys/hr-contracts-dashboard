import { Hono } from 'hono';
import type { AppContext } from '../env';
import { listImportJobs, getImportJob, listImportJobItems } from '../db/repo-imports';
import { requireAuth } from '../lib/auth';

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
