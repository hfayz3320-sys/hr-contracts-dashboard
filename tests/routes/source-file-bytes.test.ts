/**
 * Phase 11 hotfix — tests for GET /api/source-files/:hash/file.
 *
 * Used by /admin/import-review BEFORE commit so the admin can open the
 * uploaded PDF while editing extracted fields. Auth is admin-only
 * because the source file is the raw HR document (PII-adjacent) and the
 * pre-commit endpoint is reachable only through the admin module
 * anyway.
 */
import { describe, it, expect } from 'vitest';
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

const ADMIN: Row = {
  id: 'usr_admin', email: 'admin@mid.local', display_name: 'Admin',
  role: 'admin', status: 'active', employee_id: null,
  last_login_at: null,
  created_at: '2024-01-01T00:00:00Z', created_by: 'system',
  updated_at: '2024-01-01T00:00:00Z', updated_by: 'system',
};

interface FakeR2Obj {
  key: string; body: Uint8Array;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}
function makeFakeR2() {
  const objects = new Map<string, FakeR2Obj>();
  return {
    objects,
    put: async (key: string, bytes: ArrayBuffer, opts?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    }) => {
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

function fetchApp(path: string, init: RequestInit, env: unknown): Promise<Response> {
  return app.fetch(new Request(`https://test.local${path}`, init), env as never);
}

function makeMock(extra: Record<string, Row[]> = {}): MockD1 {
  return makeMockD1({
    app_users: [{ ...ADMIN }],
    source_files: [],
    audit_events: [],
    ...extra,
  });
}

const PDF_BYTES_SEED: Row[] = [{
  hash: 'sha-pre-commit-pdf',
  filename: 'fresh-contract.pdf',
  type: 'pdf',
  size: 10,
  uploaded_at: '2024-01-01T00:00:00Z',
  import_job_id: 'job_unfinished',
  parser_version: 'test',
  uploaded_by: 'admin@mid.local',
  extraction_confidence: 0.7,
  r2_object_key: 'contracts/sha-pre-commit-pdf/fresh-contract.pdf',
  r2_stored: 1,
}];

describe('GET /api/source-files/:hash/file — pre-commit PDF access', () => {
  it('requires authentication (401 in production without JWT)', async () => {
    const m = makeMock({ source_files: PDF_BYTES_SEED });
    const r2 = makeFakeR2();
    const env = { ...PROD_ENV, DB: m.d1, RAW_FILES: r2 };
    const res = await fetchApp('/api/source-files/sha-pre-commit-pdf/file', { method: 'GET' }, env);
    expect(res.status).toBe(401);
  });

  it('rejects non-admin actors with 403', async () => {
    const m = makeMock({ source_files: PDF_BYTES_SEED });
    const r2 = makeFakeR2();
    const env = { ...DEV_ENV, DB: m.d1, RAW_FILES: r2 };
    const res = await fetchApp(
      '/api/source-files/sha-pre-commit-pdf/file',
      { method: 'GET', headers: { 'X-Dev-Admin-Email': 'viewer@example.com' } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it('streams the source PDF bytes for an admin, writes audit row', async () => {
    const m = makeMock({ source_files: PDF_BYTES_SEED });
    const r2 = makeFakeR2();
    void r2.put(
      'contracts/sha-pre-commit-pdf/fresh-contract.pdf',
      new TextEncoder().encode('PDF_BYTES').buffer,
      { httpMetadata: { contentType: 'application/pdf' } },
    );
    const env = { ...DEV_ENV, DB: m.d1, RAW_FILES: r2 };

    const res = await fetchApp(
      '/api/source-files/sha-pre-commit-pdf/file',
      { method: 'GET', headers: { 'X-Dev-Admin-Email': 'admin@mid.local' } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('inline');
    expect(res.headers.get('content-disposition')).toContain('fresh-contract.pdf');
    expect(res.headers.get('cache-control')).toContain('private');
    expect(res.headers.get('cache-control')).toContain('no-store');
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(buf)).toBe('PDF_BYTES');

    const audits = (m.tables.audit_events ?? []).filter(
      (a) => a.action === 'contract_import.source_file_access',
    );
    expect(audits.length).toBe(1);
    expect(String(audits[0]!.details)).toContain('viewed');
    expect(String(audits[0]!.details)).toContain('fresh-contract.pdf');
  });

  it('?download=1 switches to attachment Content-Disposition + downloaded audit detail', async () => {
    const m = makeMock({ source_files: PDF_BYTES_SEED });
    const r2 = makeFakeR2();
    void r2.put(
      'contracts/sha-pre-commit-pdf/fresh-contract.pdf',
      new TextEncoder().encode('PDF_BYTES').buffer,
      { httpMetadata: { contentType: 'application/pdf' } },
    );
    const env = { ...DEV_ENV, DB: m.d1, RAW_FILES: r2 };
    const res = await fetchApp(
      '/api/source-files/sha-pre-commit-pdf/file?download=1',
      { method: 'GET', headers: { 'X-Dev-Admin-Email': 'admin@mid.local' } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const audits = (m.tables.audit_events ?? []).filter(
      (a) => a.action === 'contract_import.source_file_access',
    );
    expect(audits.length).toBe(1);
    expect(String(audits[0]!.details)).toContain('downloaded');
  });

  it('returns 404 when source_files row is missing', async () => {
    const m = makeMock(); // no source_files
    const r2 = makeFakeR2();
    const env = { ...DEV_ENV, DB: m.d1, RAW_FILES: r2 };
    const res = await fetchApp(
      '/api/source-files/sha-unknown/file',
      { method: 'GET', headers: { 'X-Dev-Admin-Email': 'admin@mid.local' } },
      env,
    );
    expect(res.status).toBe(404);
    // No audit row written for a 404 on the lookup — only successful
    // streams emit `contract_import.source_file_access`.
    expect((m.tables.audit_events ?? []).length).toBe(0);
  });

  it('returns 404 when source_files row exists but r2_object_key is null', async () => {
    const m = makeMock({
      source_files: [{
        ...PDF_BYTES_SEED[0]!,
        r2_object_key: null,
        r2_stored: 0,
      }],
    });
    const r2 = makeFakeR2();
    const env = { ...DEV_ENV, DB: m.d1, RAW_FILES: r2 };
    const res = await fetchApp(
      '/api/source-files/sha-pre-commit-pdf/file',
      { method: 'GET', headers: { 'X-Dev-Admin-Email': 'admin@mid.local' } },
      env,
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when the R2 object itself is missing (metadata says stored but bucket is empty)', async () => {
    const m = makeMock({ source_files: PDF_BYTES_SEED });
    // Note: NO r2.put() call here — metadata claims r2_stored=1 but the
    // bucket has no object.
    const r2 = makeFakeR2();
    const env = { ...DEV_ENV, DB: m.d1, RAW_FILES: r2 };
    const res = await fetchApp(
      '/api/source-files/sha-pre-commit-pdf/file',
      { method: 'GET', headers: { 'X-Dev-Admin-Email': 'admin@mid.local' } },
      env,
    );
    expect(res.status).toBe(404);
  });
});
