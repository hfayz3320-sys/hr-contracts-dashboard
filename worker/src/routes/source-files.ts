import { Hono } from 'hono';
import type { AppContext } from '../env';
import { listSourceFiles } from '../db/repo-source-files';
import { requireAuth } from '../lib/auth';

export const sourceFilesRoutes = new Hono<AppContext>();

sourceFilesRoutes.use('/api/source-files', requireAuth);

sourceFilesRoutes.get('/api/source-files', async (c) => {
  const result = await listSourceFiles(c.env);
  return c.json(result);
});
