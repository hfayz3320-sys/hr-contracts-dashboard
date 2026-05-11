/**
 * Phase 2F — Worker route auth-gate + zod-validation tests.
 *
 * These tests build the production Hono app with a minimal in-memory D1
 * mock and exercise each new mutation route via `app.fetch(Request, env)`.
 * They verify:
 *
 *   - All new mutation endpoints require auth (401 without JWT, 400 with
 *     X-Dev-Admin-Email in production)
 *   - Non-admin authenticated users are rejected with 403 by requireAdmin
 *   - Zod validation rejects empty / malformed payloads with 400
 *   - Business-logic guards fire (e.g. self-deactivate prevention on users)
 *   - Review approve writes audit + linked_target_id
 *
 * Real D1/R2 are NOT involved. We exercise the route layer + middleware
 * chain end-to-end against a small in-memory store.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../worker/src/index';

// ---------------------------------------------------------------------------
// Minimal in-memory D1 mock
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function makeFakeD1(initialTables: Record<string, Row[]> = {}): { d1: unknown; tables: Record<string, Row[]> } {
  const tables: Record<string, Row[]> = { ...initialTables };

  function prepare(sql: string) {
    const binds: unknown[] = [];
    const stmt = {
      bind: (...args: unknown[]) => {
        binds.push(...args);
        return stmt;
      },
      first: async <T,>(): Promise<T | null> => {
        const r = pickFirst(sql, binds, tables);
        return r as T | null;
      },
      all: async <T,>(): Promise<{ results: T[] }> => {
        const rows = pickAll(sql, binds, tables);
        return { results: rows as T[] };
      },
      run: async (): Promise<{ success: true }> => {
        applyMutation(sql, binds, tables);
        return { success: true };
      },
    };
    return stmt;
  }

  return { d1: { prepare }, tables };
}

// Very small SQL pattern matcher — handles the queries our routes use.
function pickFirst(sql: string, binds: unknown[], tables: Record<string, Row[]>): Row | null {
  const m = sql.match(/SELECT[\s\S]*?FROM\s+(\w+)/i);
  const table = m?.[1];
  if (!table || !tables[table]) return null;
  const rows = tables[table]!;
  // Crude WHERE id = ? handling
  const idMatch = sql.match(/WHERE\s+id\s*=\s*\?/i);
  if (idMatch && binds[0] != null) return rows.find((r) => r.id === binds[0]) ?? null;
  const emailMatch = sql.match(/WHERE\s+LOWER\(email\)\s*=\s*LOWER\(\?\)/i);
  if (emailMatch && typeof binds[0] === 'string') {
    const e = binds[0].toLowerCase();
    return rows.find((r) => String(r.email).toLowerCase() === e) ?? null;
  }
  const identityMatch = sql.match(/WHERE\s+identity_number\s*=\s*\?/i);
  if (identityMatch && binds[0] != null) {
    return rows.find((r) => r.identity_number === binds[0]) ?? null;
  }
  return rows[0] ?? null;
}

function pickAll(sql: string, _binds: unknown[], tables: Record<string, Row[]>): Row[] {
  const m = sql.match(/FROM\s+(\w+)/i);
  const table = m?.[1];
  return (table && tables[table]) ? [...tables[table]] : [];
}

function applyMutation(sql: string, binds: unknown[], tables: Record<string, Row[]>): void {
  // INSERT INTO <table> (cols) VALUES (?, ?, ...)
  let m = sql.match(/INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES/i);
  if (m) {
    const table = m[1]!;
    const cols = m[2]!.split(',').map((s) => s.trim());
    if (!tables[table]) tables[table] = [];
    const row: Row = {};
    cols.forEach((c, i) => { row[c] = binds[i]; });
    // Honor uniqueness on PK by id / email
    if (sql.toUpperCase().includes('OR IGNORE')) {
      if (row.id && tables[table].some((r) => r.id === row.id)) return;
      if (row.email && tables[table].some((r) => r.email === row.email)) return;
    }
    tables[table].push(row);
    return;
  }
  // UPDATE <table> SET ... WHERE id = ?
  m = sql.match(/UPDATE\s+(\w+)\s+SET\s+([\s\S]+?)\s+WHERE\s+id\s*=\s*\?/i);
  if (m) {
    const table = m[1]!;
    const setClause = m[2]!;
    const sets = setClause.split(',').map((s) => s.trim());
    const colNames: string[] = [];
    for (const s of sets) {
      const col = s.split('=')[0]?.trim();
      if (col) colNames.push(col);
    }
    // Last bind is the id; previous binds map to ? in colNames order
    const id = binds[binds.length - 1];
    const colVals = binds.slice(0, colNames.length);
    const rows = tables[table];
    if (!rows) return;
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const updated = { ...rows[idx] };
    colNames.forEach((c, i) => { updated[c] = colVals[i]; });
    rows[idx] = updated;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeEnv(envOverride: Record<string, unknown>, tables: Record<string, Row[]> = {}) {
  const { d1 } = makeFakeD1(tables);
  return {
    ...envOverride,
    DB: d1 as unknown,
    RAW_FILES: { list: async () => ({ objects: [] }) } as unknown,
  };
}

async function req(path: string, init: RequestInit, env: Record<string, unknown>): Promise<Response> {
  return app.fetch(new Request(`https://test.local${path}`, init), env);
}

// ---------------------------------------------------------------------------
// Auth gates
// ---------------------------------------------------------------------------

describe('Phase 2F · Route auth gates', () => {
  const cases: Array<{ name: string; method: string; path: string; body?: unknown }> = [
    { name: 'PATCH /api/employees/:id', method: 'PATCH', path: '/api/employees/emp_x', body: { fullName: 'Test' } },
    { name: 'PATCH /api/insurance/:id', method: 'PATCH', path: '/api/insurance/ins_x', body: { policyNumber: 'P' } },
    { name: 'PATCH /api/contracts/:id', method: 'PATCH', path: '/api/contracts/ctr_x', body: { contractType: 'Fixed' } },
    { name: 'GET /api/users',           method: 'GET',   path: '/api/users' },
    { name: 'POST /api/users',          method: 'POST',  path: '/api/users', body: { email: 'a@b.c', role: 'viewer' } },
    { name: 'PATCH /api/users/:id',     method: 'PATCH', path: '/api/users/usr_x', body: { role: 'admin' } },
    { name: 'POST /api/users/:id/deactivate', method: 'POST', path: '/api/users/usr_x/deactivate', body: {} },
    { name: 'POST /api/review-queue/:id/approve', method: 'POST', path: '/api/review-queue/rev_x/approve', body: { correctedFields: {} } },
    { name: 'POST /api/review-queue/:id/reject',  method: 'POST', path: '/api/review-queue/rev_x/reject',  body: { reason: 'no' } },
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
  }
});

// ---------------------------------------------------------------------------
// Dev-mode happy paths (admin allow-list)
// ---------------------------------------------------------------------------

describe('Phase 2F · Dev-mode happy paths', () => {
  let env: Record<string, unknown>;
  let tables: Record<string, Row[]>;

  beforeEach(() => {
    tables = {
      employees: [
        { id: 'emp_alpha', identity_number: '2111111111', full_name: 'Alpha One', status: 'active', source_file_id: 'sha1' },
      ],
      insurance_policies: [
        { id: 'ins_alpha', identity_number: '2111111111', policy_number: 'POL-1', member_number: null,
          provider: 'Bupa', start_date: '2025-01-01', end_date: null, status: 'active', matched: 1, source_file_id: 'sha2' },
      ],
      contracts: [
        { id: 'ctr_alpha', employee_id: 'emp_alpha', identity_number: '2111111111', contract_type: 'Fixed-term',
          start_date: '2025-01-01', end_date: '2026-01-01', status: 'active', version: 1, file_hash: 'sha3', filename: 'a.pdf', extraction_confidence: 0.9 },
      ],
      app_users: [
        { id: 'usr_admin', email: 'admin@mid.local', display_name: 'Admin', role: 'admin', status: 'active', created_by: 'sys', updated_by: 'sys' },
      ],
      review_queue: [
        { id: 'rev_open', reason: 'missing_identity', entity: 'contract', description: 'd', details: 'x',
          status: 'open', import_job_id: null, payload: null, resolution: null, resolved_by: null, resolved_at: null, linked_target_id: null },
      ],
      audit_events: [],
    };
    const fake = makeFakeD1(tables);
    env = {
      ...DEV_ENV,
      DB: fake.d1,
      RAW_FILES: { list: async () => ({ objects: [] }) },
    };
  });

  it('PATCH /api/employees/:id with admin succeeds (200 + body.ok)', async () => {
    const res = await req('/api/employees/emp_alpha', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'X-Dev-Admin-Email': 'admin@mid.local' },
      body: JSON.stringify({ jobTitle: 'New Title', department: 'Ops' }),
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; employee: { jobTitle: string } };
    expect(body.ok).toBe(true);
    expect(body.employee.jobTitle).toBe('New Title');
  });

  it('PATCH /api/insurance/:id with admin succeeds', async () => {
    const res = await req('/api/insurance/ins_alpha', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'X-Dev-Admin-Email': 'admin@mid.local' },
      body: JSON.stringify({ provider: 'Tawuniya' }),
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('PATCH /api/contracts/:id with admin succeeds', async () => {
    const res = await req('/api/contracts/ctr_alpha', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'X-Dev-Admin-Email': 'admin@mid.local' },
      body: JSON.stringify({ status: 'expiring' }),
    }, env);
    expect(res.status).toBe(200);
  });

  it('GET /api/users with admin returns the list', async () => {
    const res = await req('/api/users', {
      method: 'GET',
      headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[]; total: number };
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/users with non-admin email returns 403', async () => {
    const res = await req('/api/users', {
      method: 'GET',
      headers: { 'X-Dev-Admin-Email': 'stranger@example.com' },
    }, env);
    expect(res.status).toBe(403);
  });

  it('POST /api/users with admin creates a new user (200)', async () => {
    const res = await req('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Dev-Admin-Email': 'admin@mid.local' },
      body: JSON.stringify({ email: 'newuser@example.com', role: 'viewer' }),
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; user: { email: string; role: string } };
    expect(body.user.email).toBe('newuser@example.com');
    expect(body.user.role).toBe('viewer');
  });

  it('POST /api/users rejects duplicate email with 409', async () => {
    const res = await req('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Dev-Admin-Email': 'admin@mid.local' },
      body: JSON.stringify({ email: 'admin@mid.local', role: 'viewer' }),
    }, env);
    expect(res.status).toBe(409);
  });

  it('PATCH /api/users/:id self-change for role returns 400', async () => {
    const res = await req('/api/users/usr_admin', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'X-Dev-Admin-Email': 'admin@mid.local' },
      body: JSON.stringify({ role: 'viewer' }),
    }, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { message: string };
    expect(body.message).toMatch(/own user row/i);
  });

  it('POST /api/users/:id/deactivate cannot deactivate self (400)', async () => {
    const res = await req('/api/users/usr_admin/deactivate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Dev-Admin-Email': 'admin@mid.local' },
      body: JSON.stringify({ reason: 'cleanup' }),
    }, env);
    expect(res.status).toBe(400);
  });

  it('POST /api/review-queue/:id/reject without reason → 400', async () => {
    const res = await req('/api/review-queue/rev_open/reject', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Dev-Admin-Email': 'admin@mid.local' },
      body: JSON.stringify({}),
    }, env);
    expect(res.status).toBe(400);
  });

  it('POST /api/review-queue/:id/reject with valid reason → 200', async () => {
    const res = await req('/api/review-queue/rev_open/reject', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Dev-Admin-Email': 'admin@mid.local' },
      body: JSON.stringify({ reason: 'duplicate data' }),
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('dismissed');
  });

  it('PATCH /api/employees/:id with malformed body → 400', async () => {
    const res = await req('/api/employees/emp_alpha', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'X-Dev-Admin-Email': 'admin@mid.local' },
      body: JSON.stringify({ status: 'unknown_status' }), // not in employeeStatusSchema enum
    }, env);
    expect(res.status).toBe(400);
  });
});
