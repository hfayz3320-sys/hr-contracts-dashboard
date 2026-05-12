/**
 * Hotfix tests for three production defects:
 *
 *   1. Contract PDF download              (GET /api/contracts/:id/file)
 *   2. Employee document download         (GET /api/employees/:id/documents/:docId/file)
 *   3. Timeline idempotency               (POST /api/employees/:id/{messages,notes}
 *                                          with `Idempotency-Key` header)
 *
 * Mock D1 is the standard one in `_mock-d1.ts`. R2 is a tiny in-memory
 * fake with both `put` (used by the upload test path) and `get` (used by
 * the download endpoints) so we can round-trip a real byte payload.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../worker/src/index';
import { makeMockD1, type Row, type MockD1 } from './_mock-d1';

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

// --- R2 fake ----------------------------------------------------------------

interface FakeR2Obj {
  key: string;
  body: Uint8Array;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

function makeFakeR2() {
  const objects = new Map<string, FakeR2Obj>();
  return {
    objects,
    put: async (
      key: string,
      bytes: ArrayBuffer,
      opts?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
    ) => {
      objects.set(key, {
        key,
        body: new Uint8Array(bytes),
        ...(opts?.httpMetadata ? { httpMetadata: opts.httpMetadata } : {}),
        ...(opts?.customMetadata ? { customMetadata: opts.customMetadata } : {}),
      });
    },
    get: async (key: string) => {
      const o = objects.get(key);
      if (!o) return null;
      // Cloudflare's R2ObjectBody has `.body` (ReadableStream), `.size`,
      // `.httpMetadata`, `.customMetadata`. We hand-roll the minimal shape
      // our `streamR2Object` helper actually reads.
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(o.body);
          controller.close();
        },
      });
      return {
        body: stream,
        size: o.body.byteLength,
        httpMetadata: o.httpMetadata,
        customMetadata: o.customMetadata,
      };
    },
  };
}

// --- common seed ------------------------------------------------------------

const EMP: Row = {
  id: 'emp_alpha', identity_number: '2111111111', full_name: 'Alpha One',
  status: 'active', source_file_id: 'sha-emp',
  created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
};
const ADMIN: Row = {
  id: 'usr_admin', email: 'admin@mid.local', display_name: 'Admin',
  role: 'admin', status: 'active', employee_id: null,
  last_login_at: null,
  created_at: '2024-01-01T00:00:00Z', created_by: 'system',
  updated_at: '2024-01-01T00:00:00Z', updated_by: 'system',
};

function fetchApp(path: string, init: RequestInit, env: unknown): Promise<Response> {
  return app.fetch(new Request(`https://test.local${path}`, init), env as never);
}

// ============================================================================
// Contract PDF download
// ============================================================================

describe('GET /api/contracts/:id/file', () => {
  function seed(): { mock: MockD1; r2: ReturnType<typeof makeFakeR2> } {
    const mock = makeMockD1({
      employees: [{ ...EMP }],
      app_users: [{ ...ADMIN }],
      contracts: [{
        id: 'ctr_x',
        employee_id: 'emp_alpha',
        identity_number: '2111111111',
        contract_type: 'permanent',
        start_date: '2024-01-01',
        end_date: '2025-01-01',
        status: 'active',
        version: 1,
        version_of: null,
        file_hash: 'sha-ctr-x',
        filename: 'contract.pdf',
        extraction_confidence: 0.9,
        notes: null,
        source_file_id: 'sha-ctr-x',
        created_at: '2024-01-01T00:00:00Z',
      }],
      source_files: [{
        hash: 'sha-ctr-x',
        filename: 'contract.pdf',
        type: 'pdf',
        size: 9,
        uploaded_at: '2024-01-01T00:00:00Z',
        import_job_id: null,
        parser_version: 'test',
        uploaded_by: 'admin@mid.local',
        extraction_confidence: 0.9,
        r2_object_key: 'contracts/sha-ctr-x/contract.pdf',
        r2_stored: 1,
      }],
      audit_events: [],
    });
    const r2 = makeFakeR2();
    void r2.put('contracts/sha-ctr-x/contract.pdf', new TextEncoder().encode('PDF_BYTES').buffer, {
      httpMetadata: { contentType: 'application/pdf' },
    });
    return { mock, r2 };
  }

  it('requires authentication (401 in production without JWT)', async () => {
    const { mock, r2 } = seed();
    const env = { ...PROD_ENV, DB: mock.d1, RAW_FILES: r2 };
    const res = await fetchApp('/api/contracts/ctr_x/file', { method: 'GET' }, env);
    expect(res.status).toBe(401);
  });

  it('streams the PDF bytes from R2 with correct headers + writes audit', async () => {
    const { mock, r2 } = seed();
    const env = { ...DEV_ENV, DB: mock.d1, RAW_FILES: r2 };
    const res = await fetchApp(
      '/api/contracts/ctr_x/file',
      { method: 'GET', headers: { 'X-Dev-Admin-Email': 'admin@mid.local' } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('inline');
    expect(res.headers.get('content-disposition')).toContain('contract.pdf');
    // Cache MUST be private + no-store — files are PII-adjacent.
    expect(res.headers.get('cache-control')).toContain('private');
    expect(res.headers.get('cache-control')).toContain('no-store');
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(buf)).toBe('PDF_BYTES');

    const audits = (mock.tables.audit_events ?? []).filter(
      (a) => a.action === 'contract.file_access',
    );
    expect(audits.length).toBe(1);
  });

  it('?download=1 switches to attachment Content-Disposition', async () => {
    const { mock, r2 } = seed();
    const env = { ...DEV_ENV, DB: mock.d1, RAW_FILES: r2 };
    const res = await fetchApp(
      '/api/contracts/ctr_x/file?download=1',
      { method: 'GET', headers: { 'X-Dev-Admin-Email': 'admin@mid.local' } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('attachment');
  });

  it('404 when source_files row has no r2_object_key', async () => {
    const { mock, r2 } = seed();
    // Clear R2 binding for this row.
    mock.tables.source_files![0]!.r2_object_key = null;
    mock.tables.source_files![0]!.r2_stored = 0;
    const env = { ...DEV_ENV, DB: mock.d1, RAW_FILES: r2 };
    const res = await fetchApp(
      '/api/contracts/ctr_x/file',
      { method: 'GET', headers: { 'X-Dev-Admin-Email': 'admin@mid.local' } },
      env,
    );
    expect(res.status).toBe(404);
  });

  it('404 when contract id does not exist', async () => {
    const { mock, r2 } = seed();
    const env = { ...DEV_ENV, DB: mock.d1, RAW_FILES: r2 };
    const res = await fetchApp(
      '/api/contracts/ctr_missing/file',
      { method: 'GET', headers: { 'X-Dev-Admin-Email': 'admin@mid.local' } },
      env,
    );
    expect(res.status).toBe(404);
  });
});

// ============================================================================
// Employee document download
// ============================================================================

describe('GET /api/employees/:id/documents/:docId/file', () => {
  it('requires authentication (401 in production without JWT)', async () => {
    const mock = makeMockD1({ employees: [{ ...EMP }], app_users: [{ ...ADMIN }], employee_documents: [], audit_events: [] });
    const r2 = makeFakeR2();
    const env = { ...PROD_ENV, DB: mock.d1, RAW_FILES: r2 };
    const res = await fetchApp('/api/employees/emp_alpha/documents/doc_x/file', { method: 'GET' }, env);
    expect(res.status).toBe(401);
  });

  it('uploaded document round-trips: upload then GET file returns the same bytes', async () => {
    const mock = makeMockD1({
      employees: [{ ...EMP }],
      app_users: [{ ...ADMIN }],
      employee_documents: [],
      audit_events: [],
    });
    mock.registerPartialUnique(
      'employee_documents',
      ['employee_id', 'type'],
      (r) => r.is_current === 1,
    );
    const r2 = makeFakeR2();
    const env = { ...DEV_ENV, DB: mock.d1, RAW_FILES: r2 };

    // Upload first.
    const blob = new Blob([new TextEncoder().encode('IQAMA_PDF_BYTES')], { type: 'application/pdf' });
    const fd = new FormData();
    fd.append('file', blob, 'iqama.pdf');
    fd.append('type', 'iqama');
    const up = await fetchApp(
      '/api/employees/emp_alpha/documents/upload',
      {
        method: 'POST',
        headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
        body: fd,
      },
      env,
    );
    expect(up.status).toBe(200);
    const upBody = await up.json() as { document: { id: string }; r2ObjectKey: string };
    const docId = upBody.document.id;
    // Sanity: the bytes are in our fake R2 under a private path.
    expect(upBody.r2ObjectKey).toMatch(/^employees\/emp_alpha\/doc-/);
    expect(r2.objects.size).toBe(1);

    // Now GET the file back.
    const get = await fetchApp(
      `/api/employees/emp_alpha/documents/${docId}/file`,
      { method: 'GET', headers: { 'X-Dev-Admin-Email': 'admin@mid.local' } },
      env,
    );
    expect(get.status).toBe(200);
    expect(get.headers.get('content-type')).toBe('application/pdf');
    expect(get.headers.get('content-disposition')).toContain('iqama.pdf');
    const buf = new Uint8Array(await get.arrayBuffer());
    expect(new TextDecoder().decode(buf)).toBe('IQAMA_PDF_BYTES');

    // An audit event was written for the access.
    const audits = (mock.tables.audit_events ?? []).filter(
      (a) => a.action === 'employee_document.file_access',
    );
    expect(audits.length).toBe(1);
  });

  it('refuses cross-employee access (doc belongs to a different employee → 404)', async () => {
    const mock = makeMockD1({
      employees: [{ ...EMP }, { ...EMP, id: 'emp_other', identity_number: '2222222222' }],
      app_users: [{ ...ADMIN }],
      employee_documents: [{
        id: 'doc_other',
        employee_id: 'emp_other',
        type: 'iqama',
        doc_number: null, issued_at: null, expires_at: null,
        status: 'active', is_current: 1,
        verified_at: null, verified_by: null,
        review_required: 0, review_reason: null,
        extraction_confidence: null,
        source_file_id: null,
        metadata: JSON.stringify({ r2ObjectKey: 'employees/emp_other/doc_other/file.pdf' }),
        notes: null,
        created_at: '2024-01-01T00:00:00Z', created_by: 'admin@mid.local',
        updated_at: '2024-01-01T00:00:00Z', updated_by: 'admin@mid.local',
      }],
      audit_events: [],
    });
    const r2 = makeFakeR2();
    const env = { ...DEV_ENV, DB: mock.d1, RAW_FILES: r2 };
    const res = await fetchApp(
      '/api/employees/emp_alpha/documents/doc_other/file',
      { method: 'GET', headers: { 'X-Dev-Admin-Email': 'admin@mid.local' } },
      env,
    );
    expect(res.status).toBe(404);
  });
});

// ============================================================================
// Timeline idempotency
// ============================================================================

describe('POST /api/employees/:id/notes — Idempotency-Key dedupe', () => {
  let mock: MockD1;
  let r2: ReturnType<typeof makeFakeR2>;
  let env: { DB: unknown; RAW_FILES: unknown; ENVIRONMENT: string; ADMIN_EMAILS: string; ALLOW_ORIGIN: string };
  beforeEach(() => {
    mock = makeMockD1({
      employees: [{ ...EMP }],
      app_users: [{ ...ADMIN }],
      employee_timeline_entries: [],
      audit_events: [],
    });
    mock.registerUnique('employee_timeline_entries', ['idempotency_key']);
    r2 = makeFakeR2();
    env = { ...DEV_ENV, DB: mock.d1, RAW_FILES: r2 };
  });

  async function postNote(key: string | null, body: string): Promise<Response> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'X-Dev-Admin-Email': 'admin@mid.local',
    };
    if (key) headers['Idempotency-Key'] = key;
    return fetchApp(
      '/api/employees/emp_alpha/notes',
      { method: 'POST', headers, body: JSON.stringify({ body }) },
      env,
    );
  }

  it('one POST creates exactly one timeline row and one audit row', async () => {
    const res = await postNote('idem-1', 'hello world');
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; entry: { id: string }; replayed?: boolean };
    expect(body.ok).toBe(true);
    expect(body.replayed).toBeFalsy();
    expect(mock.tables.employee_timeline_entries).toHaveLength(1);
    expect(mock.tables.audit_events?.filter((a) => a.action === 'employee.note')).toHaveLength(1);
  });

  it('same Idempotency-Key sent twice does NOT duplicate the row', async () => {
    const r1 = await postNote('idem-2', 'hello');
    const r2 = await postNote('idem-2', 'hello');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const b1 = await r1.json() as { entry: { id: string }; replayed?: boolean };
    const b2 = await r2.json() as { entry: { id: string }; replayed?: boolean };
    expect(b2.entry.id).toBe(b1.entry.id); // returned existing row
    expect(b2.replayed).toBe(true);
    expect(mock.tables.employee_timeline_entries).toHaveLength(1);
    // Audit written exactly once — replay does NOT emit a second audit row.
    expect(mock.tables.audit_events?.filter((a) => a.action === 'employee.note')).toHaveLength(1);
  });

  it('different Idempotency-Keys create distinct rows', async () => {
    const r1 = await postNote('idem-3a', 'first');
    const r2 = await postNote('idem-3b', 'second');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const b1 = await r1.json() as { entry: { id: string } };
    const b2 = await r2.json() as { entry: { id: string } };
    expect(b2.entry.id).not.toBe(b1.entry.id);
    expect(mock.tables.employee_timeline_entries).toHaveLength(2);
  });

  it('no Idempotency-Key still works and does NOT dedupe', async () => {
    await postNote(null, 'a');
    await postNote(null, 'b');
    expect(mock.tables.employee_timeline_entries).toHaveLength(2);
  });
});
