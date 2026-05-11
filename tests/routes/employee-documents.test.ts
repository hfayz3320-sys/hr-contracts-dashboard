/**
 * Phase 4A A2 — employee_documents route tests.
 *
 * Coverage:
 *   - Auth gates (401 prod no JWT, 400 prod with dev header, 403 non-admin
 *     mutation)
 *   - CRUD happy paths (GET / POST / PATCH / DELETE)
 *   - Current-uniqueness: POST a second current of the same type demotes
 *     the previous current (partial UNIQUE INDEX semantics)
 *   - Soft-delete: DELETE returns the row with status='archived' and
 *     is_current=0; the row is NOT removed
 *   - computedStatus pipes correctly through the read path
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../worker/src/index';
import { makeMockD1, type Row, type MockD1 } from './_mock-d1';

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

function makeMock(extra: Record<string, Row[]> = {}): MockD1 {
  const m = makeMockD1({
    employees: [{ ...EMP_ROW }],
    app_users: [{ ...ADMIN_ROW }],
    employee_documents: [],
    audit_events: [],
    ...extra,
  });
  // Mirror the partial UNIQUE INDEX from migration 0005.
  m.registerPartialUnique(
    'employee_documents',
    ['employee_id', 'type'],
    (r) => r.is_current === 1,
  );
  return m;
}

// ===========================================================================
// Auth gates
// ===========================================================================

describe('employee-documents · auth gates', () => {
  it('GET /api/employees/:id/documents → 401 in production without JWT', async () => {
    const m = makeMock();
    const env = buildEnv(m, PROD_ENV_BASE);
    const res = await fetchApp(
      '/api/employees/emp_alpha/documents',
      { method: 'GET' },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('POST → 400 in production when X-Dev-Admin-Email is sent', async () => {
    const m = makeMock();
    const env = buildEnv(m, PROD_ENV_BASE);
    const res = await fetchApp(
      '/api/employees/emp_alpha/documents',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Dev-Admin-Email': 'admin@mid.local',
        },
        body: JSON.stringify({ type: 'iqama', docNumber: '1' }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it('POST → 403 when authenticated as non-admin', async () => {
    const m = makeMock();
    const env = buildEnv(m, DEV_ENV_BASE);
    const res = await fetchApp(
      '/api/employees/emp_alpha/documents',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Dev-Admin-Email': 'stranger@example.com',
        },
        body: JSON.stringify({ type: 'iqama', docNumber: '1' }),
      },
      env,
    );
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// CRUD happy paths
// ===========================================================================

describe('employee-documents · CRUD', () => {
  let m: MockD1;
  let env: ReturnType<typeof buildEnv>;
  beforeEach(() => {
    m = makeMock();
    env = buildEnv(m, DEV_ENV_BASE);
  });

  it('POST creates an active iqama; computedStatus = active', async () => {
    const res = await fetchApp(
      '/api/employees/emp_alpha/documents',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Dev-Admin-Email': 'admin@mid.local',
        },
        body: JSON.stringify({
          type: 'iqama',
          docNumber: '1234567890',
          expiresAt: '2099-01-01',
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      document: { type: string; status: string; computedStatus: string; isCurrent: boolean };
    };
    expect(body.ok).toBe(true);
    expect(body.document.type).toBe('iqama');
    expect(body.document.status).toBe('active');
    expect(body.document.computedStatus).toBe('active');
    expect(body.document.isCurrent).toBe(true);
    expect(m.tables.employee_documents).toHaveLength(1);
  });

  it('GET lists docs for the employee with computedStatus attached', async () => {
    // Seed one row directly so we can read it back.
    m.tables.employee_documents!.push({
      id: 'doc_seed',
      employee_id: 'emp_alpha',
      type: 'iqama',
      doc_number: '1234567890',
      issued_at: null,
      expires_at: '2099-01-01',
      status: 'active',
      is_current: 1,
      verified_at: null,
      verified_by: null,
      review_required: 0,
      review_reason: null,
      extraction_confidence: null,
      source_file_id: null,
      metadata: null,
      notes: null,
      created_at: '2024-01-01T00:00:00Z',
      created_by: 'seed',
      updated_at: '2024-01-01T00:00:00Z',
      updated_by: 'seed',
    });
    const res = await fetchApp(
      '/api/employees/emp_alpha/documents',
      {
        method: 'GET',
        headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ id: string; computedStatus: string }>;
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.items[0]!.id).toBe('doc_seed');
    expect(body.items[0]!.computedStatus).toBe('active');
  });

  it('PATCH updates a field and bumps updated_by', async () => {
    m.tables.employee_documents!.push({
      id: 'doc_seed',
      employee_id: 'emp_alpha',
      type: 'iqama',
      doc_number: '1234567890',
      issued_at: null,
      expires_at: '2099-01-01',
      status: 'active',
      is_current: 1,
      verified_at: null,
      verified_by: null,
      review_required: 0,
      review_reason: null,
      extraction_confidence: null,
      source_file_id: null,
      metadata: null,
      notes: null,
      created_at: '2024-01-01T00:00:00Z',
      created_by: 'seed',
      updated_at: '2024-01-01T00:00:00Z',
      updated_by: 'seed',
    });
    const res = await fetchApp(
      '/api/employees/emp_alpha/documents/doc_seed',
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'X-Dev-Admin-Email': 'admin@mid.local',
        },
        body: JSON.stringify({ notes: 'verified by HR' }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { document: { notes: string; updatedBy: string } };
    expect(body.document.notes).toBe('verified by HR');
    expect(body.document.updatedBy).toBe('admin@mid.local');
  });

  it('DELETE archives (status=archived, is_current=0); the row stays in the table', async () => {
    m.tables.employee_documents!.push({
      id: 'doc_seed',
      employee_id: 'emp_alpha',
      type: 'iqama',
      doc_number: '1234567890',
      issued_at: null,
      expires_at: '2099-01-01',
      status: 'active',
      is_current: 1,
      verified_at: null,
      verified_by: null,
      review_required: 0,
      review_reason: null,
      extraction_confidence: null,
      source_file_id: null,
      metadata: null,
      notes: null,
      created_at: '2024-01-01T00:00:00Z',
      created_by: 'seed',
      updated_at: '2024-01-01T00:00:00Z',
      updated_by: 'seed',
    });
    const res = await fetchApp(
      '/api/employees/emp_alpha/documents/doc_seed',
      {
        method: 'DELETE',
        headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      document: { computedStatus: string; isCurrent: boolean; status: string };
    };
    expect(body.document.status).toBe('archived');
    expect(body.document.isCurrent).toBe(false);
    // Computed status follows: archived wins, since is_current=0.
    expect(body.document.computedStatus).toBe('archived');
    // Row not deleted — preserved for 360.
    expect(m.tables.employee_documents).toHaveLength(1);
  });
});

// ===========================================================================
// Current-uniqueness (partial UNIQUE INDEX semantics)
// ===========================================================================

describe('employee-documents · current uniqueness', () => {
  it('creating a second current iqama supersedes the first', async () => {
    const m = makeMock();
    const env = buildEnv(m, DEV_ENV_BASE);
    // POST #1
    const r1 = await fetchApp(
      '/api/employees/emp_alpha/documents',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Dev-Admin-Email': 'admin@mid.local',
        },
        body: JSON.stringify({
          type: 'iqama',
          docNumber: 'OLD-1',
          expiresAt: '2099-01-01',
        }),
      },
      env,
    );
    expect(r1.status).toBe(200);

    // POST #2 — same type, new current. Should NOT throw UNIQUE; the
    // route must demote the first.
    const r2 = await fetchApp(
      '/api/employees/emp_alpha/documents',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Dev-Admin-Email': 'admin@mid.local',
        },
        body: JSON.stringify({
          type: 'iqama',
          docNumber: 'NEW-2',
          expiresAt: '2099-01-01',
        }),
      },
      env,
    );
    expect(r2.status).toBe(200);

    const rows = m.tables.employee_documents!;
    expect(rows).toHaveLength(2);
    const currents = rows.filter((r) => r.is_current === 1);
    expect(currents).toHaveLength(1);
    expect(currents[0]!.doc_number).toBe('NEW-2');
    const archived = rows.filter((r) => r.is_current === 0);
    expect(archived).toHaveLength(1);
    expect(archived[0]!.doc_number).toBe('OLD-1');
  });

  it('createrequest with isCurrent=false does NOT supersede anyone', async () => {
    const m = makeMock();
    const env = buildEnv(m, DEV_ENV_BASE);
    // Existing current row.
    m.tables.employee_documents!.push({
      id: 'doc_a',
      employee_id: 'emp_alpha',
      type: 'passport',
      doc_number: 'P-1',
      issued_at: null,
      expires_at: '2099-01-01',
      status: 'active',
      is_current: 1,
      verified_at: null,
      verified_by: null,
      review_required: 0,
      review_reason: null,
      extraction_confidence: null,
      source_file_id: null,
      metadata: null,
      notes: null,
      created_at: '2024-01-01T00:00:00Z',
      created_by: 'seed',
      updated_at: '2024-01-01T00:00:00Z',
      updated_by: 'seed',
    });
    const r2 = await fetchApp(
      '/api/employees/emp_alpha/documents',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Dev-Admin-Email': 'admin@mid.local',
        },
        body: JSON.stringify({
          type: 'passport',
          docNumber: 'P-2-history',
          expiresAt: '2010-01-01',
          isCurrent: false,
        }),
      },
      env,
    );
    expect(r2.status).toBe(200);

    const rows = m.tables.employee_documents!;
    expect(rows).toHaveLength(2);
    const currents = rows.filter((r) => r.is_current === 1);
    expect(currents).toHaveLength(1);
    expect(currents[0]!.doc_number).toBe('P-1');
  });
});

// ===========================================================================
// Computed status priority via the read path
// ===========================================================================

describe('employee-documents · computedStatus integration', () => {
  it('stored=active + expires_at past today → computedStatus=expired', async () => {
    const m = makeMock();
    const env = buildEnv(m, DEV_ENV_BASE);
    m.tables.employee_documents!.push({
      id: 'doc_expired',
      employee_id: 'emp_alpha',
      type: 'iqama',
      doc_number: '111',
      issued_at: null,
      expires_at: '2000-01-01',
      status: 'active',
      is_current: 1,
      verified_at: null,
      verified_by: null,
      review_required: 0,
      review_reason: null,
      extraction_confidence: null,
      source_file_id: null,
      metadata: null,
      notes: null,
      created_at: '1999-01-01T00:00:00Z',
      created_by: 'seed',
      updated_at: '1999-01-01T00:00:00Z',
      updated_by: 'seed',
    });
    const res = await fetchApp(
      '/api/employees/emp_alpha/documents',
      {
        method: 'GET',
        headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
      },
      env,
    );
    const body = (await res.json()) as {
      items: Array<{ id: string; status: string; computedStatus: string }>;
    };
    const row = body.items.find((d) => d.id === 'doc_expired');
    expect(row!.status).toBe('active'); // stored
    expect(row!.computedStatus).toBe('expired'); // computed
  });

  it('iqama missing doc_number → computedStatus=review_required', async () => {
    const m = makeMock();
    const env = buildEnv(m, DEV_ENV_BASE);
    m.tables.employee_documents!.push({
      id: 'doc_review',
      employee_id: 'emp_alpha',
      type: 'iqama',
      doc_number: null,
      issued_at: null,
      expires_at: '2099-01-01',
      status: 'active',
      is_current: 1,
      verified_at: null,
      verified_by: null,
      review_required: 0,
      review_reason: null,
      extraction_confidence: null,
      source_file_id: null,
      metadata: null,
      notes: null,
      created_at: '2024-01-01T00:00:00Z',
      created_by: 'seed',
      updated_at: '2024-01-01T00:00:00Z',
      updated_by: 'seed',
    });
    const res = await fetchApp(
      '/api/employees/emp_alpha/documents',
      {
        method: 'GET',
        headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
      },
      env,
    );
    const body = (await res.json()) as {
      items: Array<{ id: string; computedStatus: string }>;
    };
    const row = body.items.find((d) => d.id === 'doc_review');
    expect(row!.computedStatus).toBe('review_required');
  });
});

// ===========================================================================
// Zod validation
// ===========================================================================

describe('employee-documents · zod validation', () => {
  it('POST without `type` → 400', async () => {
    const m = makeMock();
    const env = buildEnv(m, DEV_ENV_BASE);
    const res = await fetchApp(
      '/api/employees/emp_alpha/documents',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Dev-Admin-Email': 'admin@mid.local',
        },
        body: JSON.stringify({ docNumber: '1' }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it('POST with unknown `type` → 400 (zod enum guard)', async () => {
    const m = makeMock();
    const env = buildEnv(m, DEV_ENV_BASE);
    const res = await fetchApp(
      '/api/employees/emp_alpha/documents',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Dev-Admin-Email': 'admin@mid.local',
        },
        body: JSON.stringify({ type: 'gibberish' }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it('POST against unknown employee → 404', async () => {
    const m = makeMock();
    const env = buildEnv(m, DEV_ENV_BASE);
    const res = await fetchApp(
      '/api/employees/emp_nope/documents',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Dev-Admin-Email': 'admin@mid.local',
        },
        body: JSON.stringify({ type: 'iqama', docNumber: '1', expiresAt: '2099-01-01' }),
      },
      env,
    );
    expect(res.status).toBe(404);
  });
});
