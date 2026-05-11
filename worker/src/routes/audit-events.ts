import { Hono } from 'hono';
import type { AppContext } from '../env';
import { listAuditEvents } from '../db/repo-audit';
import { requireAuth } from '../lib/auth';

export const auditRoutes = new Hono<AppContext>();

auditRoutes.use('/api/audit-events', requireAuth);

auditRoutes.get('/api/audit-events', async (c) => {
  const result = await listAuditEvents(c.env);
  return c.json(result);
});
