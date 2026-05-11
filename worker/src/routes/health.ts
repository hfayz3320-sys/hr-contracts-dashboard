import { Hono } from 'hono';
import type { AppContext } from '../env';

export const healthRoutes = new Hono<AppContext>();

// Health is the ONLY public endpoint. It exposes only environment metadata,
// never any HR or PII data.
healthRoutes.get('/api/health', async (c) => {
  let dbReachable = false;
  try {
    await c.env.DB.prepare('SELECT 1').first();
    dbReachable = true;
  } catch {
    dbReachable = false;
  }
  let r2Reachable = false;
  try {
    await c.env.RAW_FILES.list({ limit: 1 });
    r2Reachable = true;
  } catch {
    r2Reachable = false;
  }
  return c.json({
    ok: true as const,
    version: '0.3.1-phase-2b-corrected',
    db: dbReachable ? 'reachable' : 'unreachable',
    synthetic: false,
    environment: c.env.ENVIRONMENT,
    r2: r2Reachable ? 'reachable' : 'unreachable',
    cfAccess: c.env.CF_ACCESS_TEAM ? 'configured' : 'not-configured',
  });
});
