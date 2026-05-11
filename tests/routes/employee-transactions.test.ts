/**
 * Phase 4A A2 — employee_transactions route tests.
 *
 * Coverage:
 *   - Auth gates (401/400/403)
 *   - CRUD happy paths
 *   - Idempotency contract:
 *       null key + null key       → two distinct rows
 *       same key + same body      → 200 with existing row, no new insert
 *       same key + different body → 409, stored row unchanged
 *   - Per-type payload validation (flight_ticket has from/to)
 *   - Idempotency equality-keys list matches the canonical-keys export
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../worker/src/index';
import { makeMockD1, type Row, type MockD1 } from './_mock-d1';
import {
  canonicalIdempotencyBody,
  storedTransactionToComparable,
} from '../../worker/src/lib/idempotency';
import {
  employeeTransactionIdempotencyEqualityKeys,
  type EmployeeTransaction,
} from '../../shared/api-contract';

const DEV_ENV_BASE = {
  ENVIRONMENT: 'development',
  ADMIN_EMAILS: 'admin@mid.local',
  ALLOW_ORIGIN: '',
};
const PROD_ENV_BASE = {
  ENVIRONMENT: 'production',
  ADMIN_EMAILS: 'admin@mid.local',
  CF_ACCESS_TEAM: 'midarabia',
  CF_ACCESS_AUD: 'aud',
  ALLOW_ORIGIN: 'https://example.com',
};

function buildEnv(mock: MockD1, override: Record<string, unknown>) {
  return {
    ...override,
    DB: mock.d1,
    RAW_FILES: { list: async () => ({ objects: [] }) },
  };
}

function fetchApp(path: string, init: RequestInit, env: unknown): Promise<Response> {
  return app.fetch(new Request(`https://test.local${path}`, init), env as never);
}

const EMP_ROW: Row = {
  id: 'emp_alpha',
  identity_number: '2111111111',
  full_name: 'Alpha One',
  status: 'active',
  source_file_id: 'sha1',
};
const ADMIN_ROW: Row = {
  id: 'usr_admin',
  email: 'admin@mid.local',
  display_name: 'Admin',
  role: 'admin',
  status: 'active',
  last_login_at: null,
  created_at: '2024-01-01T00:00:00Z',
  created_by: 'system',
  updated_at: '2024-01-01T00:00:00Z',
  updated_by: 'system',
};

function makeMock(): MockD1 {
  const m = makeMockD1({
    employees: [{ ...EMP_ROW }],
    app_users: [{ ...ADMIN_ROW }],
    employee_transactions: [],
    audit_events: [],
  });
  m.registerUnique('employee_transactions', ['idempotency_key']);
  return m;
}

const ADMIN_HEADER = { 'X-Dev-Admin-Email': 'admin@mid.local' };
const JSON_HEADERS = { 'content-type': 'application/json', ...ADMIN_HEADER };

// ===========================================================================
// Auth gates
// ===========================================================================

describe('employee-transactions · auth gates', () => {
  it('GET → 401 in production without JWT', async () => {
    const m = makeMock();
    const env = buildEnv(m, PROD_ENV_BASE);
    const res = await fetchApp(
      '/api/employees/emp_alpha/transactions',
      { method: 'GET' },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('POST → 403 when authenticated as non-admin', async () => {
    const m = makeMock();
    const env = buildEnv(m, DEV_ENV_BASE);
    const res = await fetchApp(
      '/api/employees/emp_alpha/transactions',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Dev-Admin-Email': 'stranger@example.com',
        },
        body: JSON.stringify({ type: 'vacation', title: 'PTO', payload: { days: 5 } }),
      },
      env,
    );
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// CRUD happy paths
// ===========================================================================

describe('employee-transactions · CRUD', () => {
  let m: MockD1;
  let env: ReturnType<typeof buildEnv>;
  beforeEach(() => {
    m = makeMock();
    env = buildEnv(m, DEV_ENV_BASE);
  });

  it('POST creates a transaction (defaults: status=requested, version=1, reviewRequired=false)', async () => {
    const res = await fetchApp(
      '/api/employees/emp_alpha/transactions',
      {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          type: 'vacation',
          title: 'Annual leave 1-7 Aug',
          payload: { days: 7 },
          effectiveDate: '2026-08-01',
          endDate: '2026-08-07',
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      transaction: EmployeeTransaction;
    };
    expect(body.ok).toBe(true);
    expect(body.transaction.type).toBe('vacation');
    expect(body.transaction.status).toBe('requested');
    expect(body.transaction.payloadSchemaVersion).toBe(1);
    expect(body.transaction.reviewRequired).toBe(false);
    expect(m.tables.employee_transactions).toHaveLength(1);
  });

  it('GET lists transactions for the employee', async () => {
    m.tables.employee_transactions!.push({
      id: 'txn_seed',
      employee_id: 'emp_alpha',
      type: 'flight_ticket',
      status: 'completed',
      title: 'Ticket RUH→JED',
      effective_date: '2025-12-15',
      end_date: null,
      amount: 1200,
      currency: 'SAR',
      ref_number: 'PNR-ABC',
      payload: JSON.stringify({ from: 'RUH', to: 'JED' }),
      payload_schema_version: 1,
      metadata: null,
      source_file_id: null,
      review_required: 0,
      review_reason: null,
      idempotency_key: null,
      created_at: '2025-12-01T00:00:00Z',
      created_by: 'seed',
      updated_at: '2025-12-01T00:00:00Z',
      updated_by: 'seed',
    });
    const res = await fetchApp(
      '/api/employees/emp_alpha/transactions',
      { method: 'GET', headers: ADMIN_HEADER },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: EmployeeTransaction[]; total: number };
    expect(body.total).toBe(1);
    expect(body.items[0]!.title).toBe('Ticket RUH→JED');
    expect(body.items[0]!.payload).toEqual({ from: 'RUH', to: 'JED' });
  });

  it('PATCH updates status and bumps audit columns', async () => {
    m.tables.employee_transactions!.push({
      id: 'txn_seed',
      employee_id: 'emp_alpha',
      type: 'vacation',
      status: 'requested',
      title: 'Annual leave',
      effective_date: '2026-08-01',
      end_date: '2026-08-07',
      amount: null,
      currency: null,
      ref_number: null,
      payload: JSON.stringify({ days: 7 }),
      payload_schema_version: 1,
      metadata: null,
      source_file_id: null,
      review_required: 0,
      review_reason: null,
      idempotency_key: null,
      created_at: '2025-12-01T00:00:00Z',
      created_by: 'seed',
      updated_at: '2025-12-01T00:00:00Z',
      updated_by: 'seed',
    });
    const res = await fetchApp(
      '/api/employees/emp_alpha/transactions/txn_seed',
      {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ status: 'approved' }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { transaction: EmployeeTransaction };
    expect(body.transaction.status).toBe('approved');
    expect(body.transaction.updatedBy).toBe('admin@mid.local');
  });
});

// ===========================================================================
// Idempotency contract
// ===========================================================================

describe('employee-transactions · idempotency', () => {
  let m: MockD1;
  let env: ReturnType<typeof buildEnv>;
  beforeEach(() => {
    m = makeMock();
    env = buildEnv(m, DEV_ENV_BASE);
  });

  it('two POSTs with null idempotencyKey create two distinct rows', async () => {
    const body = {
      type: 'vacation' as const,
      title: 'Pi day off',
      payload: { days: 1 },
    };
    const r1 = await fetchApp(
      '/api/employees/emp_alpha/transactions',
      { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) },
      env,
    );
    const r2 = await fetchApp(
      '/api/employees/emp_alpha/transactions',
      { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) },
      env,
    );
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(m.tables.employee_transactions).toHaveLength(2);
  });

  it('same key + same body → 200 with existing row, no new insert', async () => {
    const body = {
      type: 'vacation' as const,
      title: 'Aug holiday',
      payload: { days: 7 },
      effectiveDate: '2026-08-01',
      endDate: '2026-08-07',
      idempotencyKey: 'idem-key-A',
    };
    const r1 = await fetchApp(
      '/api/employees/emp_alpha/transactions',
      { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) },
      env,
    );
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { transaction: EmployeeTransaction };
    const firstId = b1.transaction.id;

    const r2 = await fetchApp(
      '/api/employees/emp_alpha/transactions',
      { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) },
      env,
    );
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as { transaction: EmployeeTransaction };
    expect(b2.transaction.id).toBe(firstId);
    expect(m.tables.employee_transactions).toHaveLength(1);
  });

  it('same key + different body → 409 with stored row in the response', async () => {
    const body1 = {
      type: 'vacation' as const,
      title: 'Aug holiday',
      payload: { days: 7 },
      idempotencyKey: 'idem-key-B',
    };
    const r1 = await fetchApp(
      '/api/employees/emp_alpha/transactions',
      { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body1) },
      env,
    );
    expect(r1.status).toBe(200);

    const body2 = {
      ...body1,
      payload: { days: 9 }, // <-- DIFFERENT
    };
    const r2 = await fetchApp(
      '/api/employees/emp_alpha/transactions',
      { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body2) },
      env,
    );
    expect(r2.status).toBe(409);
    const b2 = (await r2.json()) as { error: string; transaction: EmployeeTransaction };
    expect(b2.error).toBe('CONFLICT');
    expect(b2.transaction.payload).toEqual({ days: 7 }); // stored row, unchanged
    expect(m.tables.employee_transactions).toHaveLength(1);
  });

  it('idempotency check ignores `metadata` (per the canonical list)', async () => {
    // Same canonical body, only `metadata` (which is excluded) differs.
    const a = {
      type: 'vacation' as const,
      title: 'Aug',
      payload: { days: 7 },
      idempotencyKey: 'idem-key-C',
      metadata: { tag: 'first' },
    };
    const b = {
      ...a,
      metadata: { tag: 'second' }, // excluded from equality
    };
    const r1 = await fetchApp(
      '/api/employees/emp_alpha/transactions',
      { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(a) },
      env,
    );
    expect(r1.status).toBe(200);
    const r2 = await fetchApp(
      '/api/employees/emp_alpha/transactions',
      { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(b) },
      env,
    );
    expect(r2.status).toBe(200); // metadata differs, but equality ignores it
    expect(m.tables.employee_transactions).toHaveLength(1);
  });
});

// ===========================================================================
// Per-type payload validation
// ===========================================================================

describe('employee-transactions · per-type payload', () => {
  it('flight_ticket without from/to in payload → 400', async () => {
    const m = makeMock();
    const env = buildEnv(m, DEV_ENV_BASE);
    const res = await fetchApp(
      '/api/employees/emp_alpha/transactions',
      {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          type: 'flight_ticket',
          title: 'Trip',
          payload: { pnr: 'XYZ' },
        }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it('flight_ticket with from/to passes', async () => {
    const m = makeMock();
    const env = buildEnv(m, DEV_ENV_BASE);
    const res = await fetchApp(
      '/api/employees/emp_alpha/transactions',
      {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          type: 'flight_ticket',
          title: 'Trip',
          payload: { from: 'RUH', to: 'JED', pnr: 'XYZ' },
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// Canonical key drift guard
// ===========================================================================

describe('idempotency canonical body', () => {
  it('canonical body uses exactly the exported equality-keys list', () => {
    const incoming = {
      type: 'vacation' as const,
      title: 'X',
      payload: { days: 1 },
      idempotencyKey: 'k',
      metadata: { tag: 'first' },
    };
    const canonical = JSON.parse(canonicalIdempotencyBody(incoming)) as Record<string, unknown>;
    expect(Object.keys(canonical).sort()).toEqual(
      [...employeeTransactionIdempotencyEqualityKeys].sort(),
    );
    // metadata MUST NOT appear
    expect(canonical).not.toHaveProperty('metadata');
    // idempotencyKey MUST NOT appear
    expect(canonical).not.toHaveProperty('idempotencyKey');
  });

  it('storedTransactionToComparable round-trips canonical equality', () => {
    const stored: EmployeeTransaction = {
      id: 'txn_1',
      employeeId: 'emp_alpha',
      type: 'vacation',
      status: 'requested',
      title: 'X',
      payload: { days: 1 },
      payloadSchemaVersion: 1,
      reviewRequired: false,
      createdAt: '2024-01-01T00:00:00Z',
      createdBy: 'a',
      updatedAt: '2024-01-01T00:00:00Z',
      updatedBy: 'a',
    };
    const incoming = {
      type: 'vacation' as const,
      status: 'requested' as const,
      title: 'X',
      payload: { days: 1 },
      payloadSchemaVersion: 1,
      reviewRequired: false,
    };
    expect(canonicalIdempotencyBody(incoming)).toBe(
      canonicalIdempotencyBody(storedTransactionToComparable(stored)),
    );
  });
});
