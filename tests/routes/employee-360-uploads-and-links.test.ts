/**
 * Phase 10 (followup) — tests for the three remaining actions:
 *
 *   - POST /api/employees/:id/documents/upload     (multipart → R2 + DB)
 *   - POST /api/employees/:id/transactions         (real CRUD)
 *   - POST /api/users (with employeeId)            (linked user)
 *   - GET  /api/employees/:id                      (linkedUser included)
 *
 * The mock D1 is the one in `_mock-d1.ts`. R2 is replaced with an in-memory
 * fake that records every put().
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../worker/src/index';
import { makeMockD1, type Row, type MockD1 } from './_mock-d1';

// ---- env --------------------------------------------------------------------

const DEV_ENV = {
  ENVIRONMENT: 'development',
  ADMIN_EMAILS: 'admin@mid.local',
  ALLOW_ORIGIN: '',
} as const;

const PROD_ENV = {
  ENVIRONMENT: 'production',
  ADMIN_EMAILS: 'admin@mid.local',
  CF_ACCESS_TEAM: 'midarabia',
  CF_ACCESS_AUD: 'aud',
  ALLOW_ORIGIN: 'https://example.com',
} as const;

// ---- fakes ------------------------------------------------------------------

interface FakeR2 {
  objects: Array<{
    key: string;
    bytes: ArrayBuffer;
    httpMetadata?: { contentType?: string };
    customMetadata?: Record<string, string>;
  }>;
  put: (
    key: string,
    bytes: ArrayBuffer,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ) => Promise<void>;
}

function makeFakeR2(): FakeR2 {
  const objects: FakeR2['objects'] = [];
  return {
    objects,
    put: async (key, bytes, options) => {
      objects.push({
        key,
        bytes,
        ...(options?.httpMetadata ? { httpMetadata: options.httpMetadata } : {}),
        ...(options?.customMetadata ? { customMetadata: options.customMetadata } : {}),
      });
    },
  };
}

const EMP_ROW: Row = {
  id: 'emp_alpha',
  identity_number: '2111111111',
  full_name: 'Alpha One',
  status: 'active',
  source_file_id: 'sha1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const ADMIN_ROW: Row = {
  id: 'usr_admin',
  email: 'admin@mid.local',
  display_name: 'Admin',
  role: 'admin',
  status: 'active',
  employee_id: null,
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
    employee_transactions: [],
    audit_events: [],
    ...extra,
  });
  m.registerPartialUnique(
    'employee_documents',
    ['employee_id', 'type'],
    (r) => r.is_current === 1,
  );
  m.registerUnique('app_users', ['email']);
  return m;
}

function buildEnv(mock: MockD1, fakeR2: FakeR2, envOverride: Record<string, unknown>) {
  return {
    ...envOverride,
    DB: mock.d1,
    RAW_FILES: fakeR2,
  };
}

function fetchApp(path: string, init: RequestInit, env: unknown): Promise<Response> {
  return app.fetch(new Request(`https://test.local${path}`, init), env as never);
}

function makeMultipart(file: { name: string; bytes: Uint8Array; type: string }, fields: Record<string, string>): FormData {
  const fd = new FormData();
  const blob = new Blob([file.bytes], { type: file.type });
  fd.append('file', blob, file.name);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

// ============================================================================
// Document upload
// ============================================================================

describe('Document upload — auth gates', () => {
  it('401 in production without JWT', async () => {
    const m = makeMock();
    const env = buildEnv(m, makeFakeR2(), PROD_ENV);
    const fd = makeMultipart(
      { name: 'iqama.pdf', bytes: new Uint8Array([1, 2, 3]), type: 'application/pdf' },
      { type: 'iqama' },
    );
    const res = await fetchApp('/api/employees/emp_alpha/documents/upload', {
      method: 'POST',
      body: fd,
    }, env);
    expect(res.status).toBe(401);
  });

  it('400 in production when X-Dev-Admin-Email is sent', async () => {
    const m = makeMock();
    const env = buildEnv(m, makeFakeR2(), PROD_ENV);
    const fd = makeMultipart(
      { name: 'iqama.pdf', bytes: new Uint8Array([1, 2, 3]), type: 'application/pdf' },
      { type: 'iqama' },
    );
    const res = await fetchApp('/api/employees/emp_alpha/documents/upload', {
      method: 'POST',
      headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
      body: fd,
    }, env);
    expect(res.status).toBe(400);
  });

  it('403 when authenticated as a non-admin (viewer/hr_manager) in dev', async () => {
    const m = makeMock();
    const env = buildEnv(m, makeFakeR2(), DEV_ENV);
    const fd = makeMultipart(
      { name: 'iqama.pdf', bytes: new Uint8Array([1, 2, 3]), type: 'application/pdf' },
      { type: 'iqama' },
    );
    const res = await fetchApp('/api/employees/emp_alpha/documents/upload', {
      method: 'POST',
      headers: { 'X-Dev-Admin-Email': 'viewer@example.com' },
      body: fd,
    }, env);
    expect(res.status).toBe(403);
  });
});

describe('Document upload — happy path', () => {
  let m: MockD1;
  let r2: FakeR2;
  let env: ReturnType<typeof buildEnv>;
  beforeEach(() => {
    m = makeMock();
    r2 = makeFakeR2();
    env = buildEnv(m, r2, DEV_ENV);
  });

  it('stores the file in R2 (private path), writes employee_documents metadata, writes audit event', async () => {
    const fd = makeMultipart(
      { name: 'iqama scan.pdf', bytes: new TextEncoder().encode('PDF_BYTES'), type: 'application/pdf' },
      { type: 'iqama', docNumber: 'IQ-001', expiresAt: '2099-01-01', notes: 'on file' },
    );
    const res = await fetchApp('/api/employees/emp_alpha/documents/upload', {
      method: 'POST',
      headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
      body: fd,
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      ok: boolean;
      document: { id: string; type: string; docNumber?: string; expiresAt?: string; notes?: string; metadata?: Record<string, unknown> };
      r2ObjectKey: string;
      sourceFileId: string;
    };
    expect(body.ok).toBe(true);
    expect(body.document.type).toBe('iqama');
    expect(body.document.docNumber).toBe('IQ-001');
    expect(body.document.expiresAt).toBe('2099-01-01');

    // R2 object exists in the private path. Never under `public/...`.
    expect(r2.objects).toHaveLength(1);
    expect(r2.objects[0]!.key).toMatch(/^employees\/emp_alpha\/doc-[^/]+\/iqama_scan\.pdf$/);
    expect(r2.objects[0]!.key).not.toMatch(/^public\//);
    expect(r2.objects[0]!.key).not.toContain('/public/');
    expect(body.r2ObjectKey).toBe(r2.objects[0]!.key);

    // Metadata wired through: r2 key + hash on the document row.
    expect(body.document.metadata).toBeDefined();
    expect(body.document.metadata!.r2ObjectKey).toBe(body.r2ObjectKey);
    expect(body.document.metadata!.fileHash).toMatch(/^[a-f0-9]{64}$/);
    // employee_documents row exists; sourceFileId column left null for direct uploads.
    expect(m.tables.employee_documents).toHaveLength(1);

    // Audit row written.
    const audits = (m.tables.audit_events ?? []).filter(
      (a) => a.action === 'employee_document.uploaded',
    );
    expect(audits.length).toBe(1);
    expect(String(audits[0]!.details)).toContain('r2:employees/emp_alpha/');
  });

  it('refuses an unknown document type with 400', async () => {
    const fd = makeMultipart(
      { name: 'x.pdf', bytes: new Uint8Array([1]), type: 'application/pdf' },
      { type: 'bogus_type' },
    );
    const res = await fetchApp('/api/employees/emp_alpha/documents/upload', {
      method: 'POST',
      headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
      body: fd,
    }, env);
    expect(res.status).toBe(400);
    expect(r2.objects).toHaveLength(0);
    expect(m.tables.employee_documents).toHaveLength(0);
  });

  it('refuses with 400 when `file` field is missing', async () => {
    const fd = new FormData();
    fd.append('type', 'iqama');
    const res = await fetchApp('/api/employees/emp_alpha/documents/upload', {
      method: 'POST',
      headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
      body: fd,
    }, env);
    expect(res.status).toBe(400);
    expect(r2.objects).toHaveLength(0);
  });

  it('does NOT write any path under public/', async () => {
    const fd = makeMultipart(
      { name: 'visa.pdf', bytes: new Uint8Array([1, 2]), type: 'application/pdf' },
      { type: 'visa' },
    );
    const res = await fetchApp('/api/employees/emp_alpha/documents/upload', {
      method: 'POST',
      headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
      body: fd,
    }, env);
    expect(res.status).toBe(200);
    for (const obj of r2.objects) {
      expect(obj.key.startsWith('public/')).toBe(false);
      expect(obj.key.includes('/public/')).toBe(false);
    }
  });
});

// ============================================================================
// Transaction CRUD
// ============================================================================

describe('Transaction creation — auth gates', () => {
  it('401 in production without JWT', async () => {
    const m = makeMock();
    const env = buildEnv(m, makeFakeR2(), PROD_ENV);
    const res = await fetchApp('/api/employees/emp_alpha/transactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'vacation', title: 'Annual', status: 'requested' }),
    }, env);
    expect(res.status).toBe(401);
  });

  it('403 when authenticated as non-admin (viewer/hr_manager) in dev', async () => {
    const m = makeMock();
    const env = buildEnv(m, makeFakeR2(), DEV_ENV);
    const res = await fetchApp('/api/employees/emp_alpha/transactions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Dev-Admin-Email': 'viewer@example.com',
      },
      body: JSON.stringify({ type: 'vacation', title: 'Annual', status: 'requested' }),
    }, env);
    expect(res.status).toBe(403);
  });
});

describe('Transaction creation — happy path', () => {
  it('writes employee_transactions row + audit event', async () => {
    const m = makeMock();
    const env = buildEnv(m, makeFakeR2(), DEV_ENV);
    const res = await fetchApp('/api/employees/emp_alpha/transactions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Dev-Admin-Email': 'admin@mid.local',
      },
      body: JSON.stringify({
        type: 'vacation',
        title: 'Annual leave 10 days',
        status: 'requested',
        effectiveDate: '2026-06-01',
        endDate: '2026-06-10',
      }),
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      ok: boolean;
      transaction: { id: string; type: string; title: string; status: string };
    };
    expect(body.ok).toBe(true);
    expect(body.transaction.type).toBe('vacation');
    expect(body.transaction.title).toBe('Annual leave 10 days');

    expect(m.tables.employee_transactions).toHaveLength(1);
    const audits = (m.tables.audit_events ?? []).filter(
      (a) => a.action === 'employee_transaction.created',
    );
    expect(audits.length).toBe(1);
  });
});

// ============================================================================
// Create user with employee_id linkage
// ============================================================================

describe('Create user — linked to employee', () => {
  it('writes app_users.employee_id (not a displayName tag) when employeeId is supplied', async () => {
    const m = makeMock();
    const env = buildEnv(m, makeFakeR2(), DEV_ENV);
    const res = await fetchApp('/api/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Dev-Admin-Email': 'admin@mid.local',
      },
      body: JSON.stringify({
        email: 'alpha.one@example.com',
        displayName: 'Alpha One',
        role: 'viewer',
        employeeId: 'emp_alpha',
      }),
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; user: { email: string; employeeId?: string | null; displayName: string | null } };
    expect(body.ok).toBe(true);
    expect(body.user.email).toBe('alpha.one@example.com');
    expect(body.user.employeeId).toBe('emp_alpha');
    // Display name is NOT a "(emp:<id>)" tagged string — the link is structural.
    expect(body.user.displayName).toBe('Alpha One');
    expect(body.user.displayName).not.toMatch(/\(emp:/);

    // The row in app_users carries employee_id, queryable by FK.
    const row = (m.tables.app_users ?? []).find((u) => u.email === 'alpha.one@example.com');
    expect(row).toBeDefined();
    expect(row!.employee_id).toBe('emp_alpha');
  });

  it('still works without employeeId (standalone admin / non-linked user)', async () => {
    const m = makeMock();
    const env = buildEnv(m, makeFakeR2(), DEV_ENV);
    const res = await fetchApp('/api/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Dev-Admin-Email': 'admin@mid.local',
      },
      body: JSON.stringify({
        email: 'external.admin@example.com',
        role: 'admin',
      }),
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { user: { employeeId: string | null } };
    expect(body.user.employeeId).toBeNull();
  });

  it('403 in dev when caller is not in ADMIN_EMAILS', async () => {
    const m = makeMock();
    const env = buildEnv(m, makeFakeR2(), DEV_ENV);
    const res = await fetchApp('/api/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Dev-Admin-Email': 'viewer@example.com',
      },
      body: JSON.stringify({
        email: 'someone@example.com',
        role: 'viewer',
        employeeId: 'emp_alpha',
      }),
    }, env);
    expect(res.status).toBe(403);
  });
});

// ============================================================================
// Employee 360 — linkedUser surfaced in the aggregate response
// ============================================================================

describe('Employee 360 — linkedUser', () => {
  it('returns the linked app_users row when one exists', async () => {
    const m = makeMock({
      app_users: [
        { ...ADMIN_ROW },
        {
          id: 'usr_alpha',
          email: 'alpha.one@example.com',
          display_name: 'Alpha One',
          role: 'viewer',
          status: 'active',
          employee_id: 'emp_alpha',
          last_login_at: null,
          created_at: '2024-01-01T00:00:00Z',
          created_by: 'admin@mid.local',
          updated_at: '2024-01-01T00:00:00Z',
          updated_by: 'admin@mid.local',
        },
      ],
    });
    const env = buildEnv(m, makeFakeR2(), DEV_ENV);
    const res = await fetchApp('/api/employees/emp_alpha', {
      method: 'GET',
      headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      linkedUser?: { email: string; role: string; employeeId: string | null } | null;
    };
    expect(body.linkedUser).toBeTruthy();
    expect(body.linkedUser!.email).toBe('alpha.one@example.com');
    expect(body.linkedUser!.role).toBe('viewer');
    expect(body.linkedUser!.employeeId).toBe('emp_alpha');
  });

  it('returns linkedUser: null when no app_users row points at the employee', async () => {
    const m = makeMock();
    const env = buildEnv(m, makeFakeR2(), DEV_ENV);
    const res = await fetchApp('/api/employees/emp_alpha', {
      method: 'GET',
      headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { linkedUser?: unknown };
    expect(body.linkedUser).toBeNull();
  });
});
