import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { AppContext } from './env';
import { healthRoutes } from './routes/health';
import { employeeRoutes } from './routes/employees';
import { contractRoutes } from './routes/contracts';
import { insuranceRoutes } from './routes/insurance';
import { importJobRoutes } from './routes/import-jobs';
import { reviewQueueRoutes } from './routes/review-queue';
import { auditRoutes } from './routes/audit-events';
import { importRoutes } from './routes/imports';
import { sourceFilesRoutes } from './routes/source-files';
import { meRoutes } from './routes/me';
import { userRoutes } from './routes/users';
import { debugRoutes } from './routes/debug';
import { employeeDocumentRoutes } from './routes/employee-documents';
import { employeeTransactionRoutes } from './routes/employee-transactions';
import { hrConfigRoutes } from './routes/hr-config';

const app = new Hono<AppContext>();

app.use('*', logger());

// CORS — frontend hits this Worker from a different port.
// `ALLOW_ORIGIN` (in wrangler.toml [vars]) is a comma-separated allow-list.
app.use('*', async (c, next) => {
  const allowList = (c.env.ALLOW_ORIGIN || 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((s) => s.trim());
  return cors({
    origin: (origin) => (allowList.includes(origin) ? origin : null),
    // PATCH is required by Phase 2D edit endpoints (employees/insurance/
    // contracts) and Phase 2E user-management endpoints. Without it,
    // browser preflight rejects the request before it reaches the worker
    // — and the silent Promise.allSettled fallback in the FE provider
    // would then map the failure to `[]`, indistinguishable from "DB
    // truly empty". Phase 3A makes the failure visible by listing PATCH
    // here and unfailing the FE diagnostics.
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Dev-Admin-Email',
      'Cf-Access-Authenticated-User-Email',
      'Cf-Access-Jwt-Assertion',
    ],
    credentials: false,
    maxAge: 600,
  })(c, next);
});

// Centralized error handler — never leak stack traces in prod.
app.onError((err, c) => {
  console.error('worker error', err);
  return c.json(
    {
      error: 'INTERNAL_ERROR',
      message: c.env.ENVIRONMENT === 'production' ? 'Internal server error' : String(err),
    },
    500,
  );
});

app.route('/', healthRoutes);
app.route('/', meRoutes);
app.route('/', userRoutes);
app.route('/', employeeRoutes);
app.route('/', contractRoutes);
app.route('/', insuranceRoutes);
app.route('/', importJobRoutes);
app.route('/', reviewQueueRoutes);
app.route('/', auditRoutes);
app.route('/', sourceFilesRoutes);
app.route('/', importRoutes);
app.route('/', debugRoutes);
// Phase 4A — Employee 360. The nested routes must mount BEFORE
// `employeeRoutes` does not own these paths, so order is informational only.
app.route('/', employeeDocumentRoutes);
app.route('/', employeeTransactionRoutes);
// Phase 6A-1 — HR configuration foundation.
app.route('/', hrConfigRoutes);

app.notFound((c) => c.json({ error: 'NOT_FOUND', message: 'No route matched' }, 404));

export default app;
