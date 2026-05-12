/**
 * Phase 10 — auth-gate tests for Employee 360 action endpoints.
 *
 * Asserts that every write endpoint requires authentication in production
 * (401 without JWT), refuses X-Dev-Admin-Email in production (400), and
 * rejects non-admin callers in dev (403). Behavioural CRUD with a real D1
 * is exercised at the route level in a follow-up (the mock D1 used here
 * is intentionally minimal — every prepared statement returns empty/null,
 * which is enough to surface auth misconfiguration but not enough to
 * verify INSERT round-tripping).
 */
import { describe, it, expect } from 'vitest';
import app from '../../worker/src/index';
import { makeMockD1 } from './_mock-d1';

type Row = Record<string, unknown>;

function makeFakeD1(initialTables: Record<string, Row[]> = {}): { d1: unknown } {
  const tables: Record<string, Row[]> = { ...initialTables };
  function prepare(_sql: string) {
    const stmt = {
      bind: () => stmt,
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    };
    return stmt;
  }
  return { d1: { prepare, tables } };
}

const PROD_ENV = {
  ENVIRONMENT: 'production',
  ADMIN_EMAILS: 'admin@mid.local',
  CF_ACCESS_TEAM: 'midarabia',
  CF_ACCESS_AUD: 'aud',
  ALLOW_ORIGIN: 'https://example.com',
};
const DEV_ENV = {
  ENVIRONMENT: 'development',
  ADMIN_EMAILS: 'admin@mid.local',
  ALLOW_ORIGIN: '',
};

function makeEnv(envOverride: Record<string, unknown>) {
  const { d1 } = makeFakeD1();
  return { ...envOverride, DB: d1 as unknown, RAW_FILES: {} as unknown };
}

async function req(path: string, init: RequestInit, env: Record<string, unknown>): Promise<Response> {
  return app.fetch(new Request(`https://test.local${path}`, init), env);
}

describe('Phase 10 — Employee 360 action endpoints: auth gates', () => {
  const writes: Array<{ name: string; path: string; method: string; body: unknown }> = [
    { name: 'POST /api/employees/:id/messages',     path: '/api/employees/emp_x/messages',     method: 'POST',  body: { body: 'hi' } },
    { name: 'POST /api/employees/:id/notes',        path: '/api/employees/emp_x/notes',        method: 'POST',  body: { body: 'note' } },
    { name: 'POST /api/employees/:id/activities',   path: '/api/employees/emp_x/activities',   method: 'POST',  body: { activityType: 'reminder', title: 't' } },
    { name: 'PATCH /api/employee-activities/:id',   path: '/api/employee-activities/act_x',    method: 'PATCH', body: { status: 'done' } },
    { name: 'POST /api/employees/:id/compensation', path: '/api/employees/emp_x/compensation', method: 'POST',  body: { componentCode: 'PAY_BASIC', componentName: 'Basic', amount: 1, currency: 'SAR', frequency: 'monthly', effectiveFrom: '2026-01-01' } },
    { name: 'POST /api/employees/:id/learning',     path: '/api/employees/emp_x/learning',     method: 'POST',  body: { recordType: 'certification', title: 'PMP' } },
  ];

  for (const tc of writes) {
    it(`${tc.name} → 401 in production without JWT`, async () => {
      const env = makeEnv(PROD_ENV);
      const res = await req(tc.path, {
        method: tc.method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(tc.body),
      }, env);
      expect(res.status).toBe(401);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('UNAUTHENTICATED');
    });

    it(`${tc.name} → 400 in production with X-Dev-Admin-Email`, async () => {
      const env = makeEnv(PROD_ENV);
      const res = await req(tc.path, {
        method: tc.method,
        headers: {
          'content-type': 'application/json',
          'X-Dev-Admin-Email': 'admin@mid.local',
        },
        body: JSON.stringify(tc.body),
      }, env);
      expect(res.status).toBe(400);
    });

    it(`${tc.name} → 403 in dev with non-admin email`, async () => {
      const env = makeEnv(DEV_ENV);
      const res = await req(tc.path, {
        method: tc.method,
        headers: {
          'content-type': 'application/json',
          'X-Dev-Admin-Email': 'viewer@example.com',
        },
        body: JSON.stringify(tc.body),
      }, env);
      expect(res.status).toBe(403);
    });
  }

  // Read endpoints: 401 without JWT in production.
  const reads = [
    '/api/employees/emp_x/timeline',
    '/api/employees/emp_x/activities',
    '/api/employees/emp_x/compensation',
    '/api/employees/emp_x/learning',
  ];
  for (const path of reads) {
    it(`GET ${path} → 401 in production without JWT`, async () => {
      const env = makeEnv(PROD_ENV);
      const res = await req(path, { method: 'GET' }, env);
      expect(res.status).toBe(401);
    });
  }
});

describe('Phase 10 — Employee 360 endpoint extension', () => {
  it('GET /api/employees/:id includes timeline / activities / compensation / learning keys (empty arrays if migration unapplied)', async () => {
    // Use the richer mock D1 so getEmployee resolves to the seeded row.
    const mock = makeMockD1({
      employees: [{
        id: 'emp_phase10', identity_number: '2099999999', full_name: 'Phase10 Tester',
        status: 'active', source_file_id: 'sha-test',
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      }],
    });
    const env = { ...DEV_ENV, DB: mock.d1 as unknown, RAW_FILES: {} as unknown };
    const res = await req('/api/employees/emp_phase10', {
      method: 'GET',
      headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('timeline');
    expect(body).toHaveProperty('activities');
    expect(body).toHaveProperty('compensation');
    expect(body).toHaveProperty('learning');
    // Empty mock tables for the Phase 10 entities → empty arrays.
    expect(body.timeline).toEqual([]);
    expect(body.activities).toEqual([]);
    expect(body.compensation).toEqual([]);
    expect(body.learning).toEqual([]);
  });
});
