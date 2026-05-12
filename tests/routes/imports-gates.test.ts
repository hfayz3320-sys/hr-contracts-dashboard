/**
 * Phase 8 — auth gates on the admin import pipeline.
 *
 * Every /api/imports/* endpoint must reject:
 *   - unauthenticated callers in production (401)
 *   - X-Dev-Admin-Email in production (400) — that header is a dev-only
 *     mechanism and must never be honoured against prod
 *   - non-admin authenticated callers in dev (403)
 *
 * The auth middleware runs before the body validator, so we deliberately
 * post empty bodies — we want to assert the auth response, not the schema.
 */
import { describe, it, expect } from 'vitest';
import app from '../../worker/src/index';

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
  return {
    ...envOverride,
    DB: d1 as unknown,
    RAW_FILES: {
      list: async () => ({ objects: [] }),
      put: async () => ({}),
    } as unknown,
  };
}

async function req(path: string, init: RequestInit, env: Record<string, unknown>): Promise<Response> {
  return app.fetch(new Request(`https://test.local${path}`, init), env);
}

describe('Phase 8 · /api/imports/* — auth gates', () => {
  const cases: Array<{ name: string; method: string; path: string; body?: unknown }> = [
    {
      name: 'POST /api/imports/upload',
      method: 'POST',
      path: '/api/imports/upload',
      body: { type: 'employees', filename: 'x.xlsx', fileHash: 'a'.repeat(64), fileSize: 1 },
    },
    {
      name: 'POST /api/imports/dry-run',
      method: 'POST',
      path: '/api/imports/dry-run',
      body: { type: 'employees', filename: 'x.xlsx', rows: [] },
    },
    {
      name: 'POST /api/imports/commit',
      method: 'POST',
      path: '/api/imports/commit',
      body: { jobId: 'job_x' },
    },
  ];

  for (const tc of cases) {
    it(`${tc.name} → 401 in production without JWT`, async () => {
      const env = makeEnv(PROD_ENV);
      const res = await req(tc.path, {
        method: tc.method,
        headers: { 'content-type': 'application/json' },
        body: tc.body ? JSON.stringify(tc.body) : undefined,
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
        body: tc.body ? JSON.stringify(tc.body) : undefined,
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
        body: tc.body ? JSON.stringify(tc.body) : undefined,
      }, env);
      expect(res.status).toBe(403);
    });
  }
});

describe('Phase 8 · /api/imports/upload-raw — auth gates', () => {
  // upload-raw uses multipart/form-data; we still assert the auth gate fires
  // before any form parsing. The middleware runs first so an empty body
  // suffices for the 401/400/403 cases.
  it('POST /api/imports/upload-raw → 401 in production without JWT', async () => {
    const env = makeEnv(PROD_ENV);
    const res = await req('/api/imports/upload-raw', { method: 'POST' }, env);
    expect(res.status).toBe(401);
  });

  it('POST /api/imports/upload-raw → 400 in production with X-Dev-Admin-Email', async () => {
    const env = makeEnv(PROD_ENV);
    const res = await req('/api/imports/upload-raw', {
      method: 'POST',
      headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
    }, env);
    expect(res.status).toBe(400);
  });

  it('POST /api/imports/upload-raw → 403 in dev with non-admin email', async () => {
    const env = makeEnv(DEV_ENV);
    const res = await req('/api/imports/upload-raw', {
      method: 'POST',
      headers: { 'X-Dev-Admin-Email': 'viewer@example.com' },
    }, env);
    expect(res.status).toBe(403);
  });
});
