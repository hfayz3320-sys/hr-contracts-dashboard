/**
 * Phase 11 — tests for manual employee create, import-item correction
 * PATCH, contract → compensation pipeline, and Employee 360 reflection.
 *
 * Mock D1 is the shared one in `_mock-d1.ts`. R2 is replaced with an
 * in-memory fake so the existing audit-event flow stays unaffected.
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

const ADMIN: Row = {
  id: 'usr_admin', email: 'admin@mid.local', display_name: 'Admin',
  role: 'admin', status: 'active', employee_id: null,
  last_login_at: null,
  created_at: '2024-01-01T00:00:00Z', created_by: 'system',
  updated_at: '2024-01-01T00:00:00Z', updated_by: 'system',
};

function makeMock(extra: Record<string, Row[]> = {}): MockD1 {
  const m = makeMockD1({
    employees: [],
    app_users: [{ ...ADMIN }],
    contracts: [],
    employee_compensation_lines: [],
    employee_number_history: [],
    audit_events: [],
    import_jobs: [],
    import_job_items: [],
    source_files: [],
    ...extra,
  });
  m.registerUnique('employees', ['identity_number']);
  m.registerUnique('app_users', ['email']);
  return m;
}

function fetchApp(path: string, init: RequestInit, env: unknown): Promise<Response> {
  return app.fetch(new Request(`https://test.local${path}`, init), env as never);
}

function buildEnv(mock: MockD1, override: Record<string, unknown>) {
  return {
    ...override,
    DB: mock.d1,
    RAW_FILES: { list: async () => ({ objects: [] }) },
  };
}

// ============================================================================
// Manual create
// ============================================================================

describe('POST /api/employees/manual', () => {
  it('401 in production without JWT', async () => {
    const m = makeMock();
    const env = buildEnv(m, PROD_ENV);
    const res = await fetchApp('/api/employees/manual', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identityNumber: '2099999999' }),
    }, env);
    expect(res.status).toBe(401);
  });

  it('400 in production when X-Dev-Admin-Email is sent', async () => {
    const m = makeMock();
    const env = buildEnv(m, PROD_ENV);
    const res = await fetchApp('/api/employees/manual', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Dev-Admin-Email': 'admin@mid.local',
      },
      body: JSON.stringify({ identityNumber: '2099999999' }),
    }, env);
    expect(res.status).toBe(400);
  });

  it('403 when authenticated as non-admin', async () => {
    const m = makeMock();
    const env = buildEnv(m, DEV_ENV);
    const res = await fetchApp('/api/employees/manual', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Dev-Admin-Email': 'viewer@example.com',
      },
      body: JSON.stringify({ identityNumber: '2099999999' }),
    }, env);
    expect(res.status).toBe(403);
  });

  it('rejects 400 when identityNumber is missing', async () => {
    const m = makeMock();
    const env = buildEnv(m, DEV_ENV);
    const res = await fetchApp('/api/employees/manual', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Dev-Admin-Email': 'admin@mid.local',
      },
      body: JSON.stringify({ fullName: 'No Identity Person' }),
    }, env);
    expect(res.status).toBe(400);
  });

  it('happy path — creates row + audit', async () => {
    const m = makeMock();
    const env = buildEnv(m, DEV_ENV);
    const res = await fetchApp('/api/employees/manual', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Dev-Admin-Email': 'admin@mid.local',
      },
      body: JSON.stringify({
        identityNumber: '2099999999',
        fullName: 'Phase11 Tester',
        fullNameArabic: 'محمد',
        jobTitle: 'Engineer',
        department: 'IT',
        mobile: '+966500000000',
        nationality: 'SA',
        notes: 'manual entry',
      }),
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      ok: boolean; existing: boolean;
      employee: { id: string; identityNumber: string; fullName: string };
    };
    expect(body.ok).toBe(true);
    expect(body.existing).toBe(false);
    expect(body.employee.identityNumber).toBe('2099999999');
    expect(m.tables.employees).toHaveLength(1);

    const audits = (m.tables.audit_events ?? []).filter(
      (a) => a.action === 'employee.manual_create',
    );
    expect(audits).toHaveLength(1);
  });

  it('duplicate identity returns existing — no second row, audit warning logged', async () => {
    const m = makeMock({
      employees: [{
        id: 'emp_existing',
        identity_number: '2099999999',
        full_name: 'Already Here',
        full_name_arabic: null,
        department: null, job_title: null, nationality: null,
        date_of_birth: null, hire_date: null,
        mobile: null, notes: null,
        status: 'active', source_file_id: 'sha-old',
        created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
      }],
    });
    const env = buildEnv(m, DEV_ENV);
    const res = await fetchApp('/api/employees/manual', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Dev-Admin-Email': 'admin@mid.local',
      },
      body: JSON.stringify({
        identityNumber: '2099999999',
        fullName: 'Duplicate Attempt',
      }),
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { existing: boolean; employee: { id: string; fullName: string } };
    expect(body.existing).toBe(true);
    expect(body.employee.id).toBe('emp_existing');
    // Existing row's name unchanged.
    expect(body.employee.fullName).toBe('Already Here');
    // Still only one employees row.
    expect(m.tables.employees).toHaveLength(1);
    const audits = (m.tables.audit_events ?? []).filter(
      (a) => a.action === 'employee.manual_create_blocked',
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]!.status).toBe('warning');
  });

  it('employee_number is appended to history, not stored on the employees row', async () => {
    const m = makeMock();
    const env = buildEnv(m, DEV_ENV);
    await fetchApp('/api/employees/manual', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Dev-Admin-Email': 'admin@mid.local',
      },
      body: JSON.stringify({
        identityNumber: '2099999998',
        fullName: 'With Employee Number',
        employeeNumber: 'EMP-001',
      }),
    }, env);
    const employeeRow = m.tables.employees?.find(
      (r) => r.identity_number === '2099999998',
    );
    expect(employeeRow).toBeDefined();
    // The employees table does NOT carry an employee_number column on
    // its own — that's secondary/history-only.
    expect(employeeRow!.employee_number).toBeUndefined();
    const history = m.tables.employee_number_history ?? [];
    expect(history.some((h) => h.number === 'EMP-001')).toBe(true);
  });
});

// ============================================================================
// Import item correction PATCH + contract → compensation commit
// ============================================================================

describe('PATCH /api/import-jobs/:id/items/:itemId — pre-commit corrections', () => {
  let m: MockD1;
  let env: ReturnType<typeof buildEnv>;
  beforeEach(() => {
    m = makeMock({
      employees: [{
        id: 'emp_a', identity_number: '2111111111', full_name: 'Alpha',
        full_name_arabic: null,
        department: null, job_title: null, nationality: null,
        date_of_birth: null, hire_date: null,
        mobile: null, notes: null,
        status: 'active', source_file_id: 'sha-emp',
        created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
      }],
      source_files: [{
        hash: 'sha-job-1',
        filename: 'contract.pdf',
        type: 'pdf',
        size: 100,
        uploaded_at: '2024-01-01T00:00:00Z',
        import_job_id: 'job_1',
        parser_version: 'test',
        uploaded_by: 'admin@mid.local',
        extraction_confidence: 0.5,
        r2_object_key: 'contracts/sha-job-1/contract.pdf',
        r2_stored: 1,
      }],
      import_jobs: [{
        id: 'job_1',
        type: 'contracts',
        filename: 'contract.pdf',
        source_hash: 'sha-job-1',
        status: 'review',
        idempotency_key: 'contracts:sha-job-1',
        started_at: '2024-01-01T00:00:00Z',
        finished_at: null,
        triggered_by: 'admin@mid.local',
        counts_created: 0, counts_updated: 0, counts_skipped: 0,
        counts_review: 1, counts_error: 0,
      }],
      import_job_items: [{
        id: 'item_1',
        job_id: 'job_1',
        row_index: 0,
        identity_number: '2111111111',
        raw_payload: JSON.stringify({
          identityNumber: '2111111111',
          contractType: 'permanent',
          startDate: '2025-01-01',
          endDate: '2026-01-01',
          fileHash: 'sha-job-1',
          filename: 'contract.pdf',
          basicSalary: 5000,
          housingAllowance: 1000,
        }),
        resolved_action: 'create',
        target_id: null,
        diff: null,
        reason: null,
        corrected_payload: null,
        committed_action: null,
        committed_at: null,
        committed_target_id: null,
        error_message: null,
      }],
    });
    env = buildEnv(m, DEV_ENV);
  });

  it('PATCH writes corrected_payload — entity rows are untouched', async () => {
    const res = await fetchApp('/api/import-jobs/job_1/items/item_1', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'X-Dev-Admin-Email': 'admin@mid.local',
      },
      body: JSON.stringify({
        corrections: { basicSalary: 6000, housingAllowance: 1500 },
      }),
    }, env);
    expect(res.status).toBe(200);
    // The contract table is still empty — PATCH does not mutate entities.
    expect(m.tables.contracts).toHaveLength(0);
    // The item row carries the corrections JSON.
    const item = m.tables.import_job_items![0]!;
    expect(typeof item.corrected_payload).toBe('string');
    const parsed = JSON.parse(item.corrected_payload as string) as Record<string, unknown>;
    expect(parsed.basicSalary).toBe(6000);
    expect(parsed.housingAllowance).toBe(1500);
    const audits = (m.tables.audit_events ?? []).filter(
      (a) => a.action === 'contract_import.review_updated',
    );
    expect(audits.length).toBe(1);
  });

  it('PATCH refused after job is committed (409)', async () => {
    m.tables.import_jobs![0]!.status = 'committed';
    const res = await fetchApp('/api/import-jobs/job_1/items/item_1', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'X-Dev-Admin-Email': 'admin@mid.local',
      },
      body: JSON.stringify({ corrections: { basicSalary: 9000 } }),
    }, env);
    expect(res.status).toBe(409);
  });

  it('PATCH requires admin (403 for non-admin)', async () => {
    const res = await fetchApp('/api/import-jobs/job_1/items/item_1', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'X-Dev-Admin-Email': 'viewer@example.com',
      },
      body: JSON.stringify({ corrections: { basicSalary: 1 } }),
    }, env);
    expect(res.status).toBe(403);
  });
});

// ============================================================================
// Commit pipeline — corrected values are used, new contract version is
// created, compensation lines are written and replace on re-commit.
// ============================================================================

describe('POST /api/imports/commit — corrected values + compensation lines', () => {
  let m: MockD1;
  let env: ReturnType<typeof buildEnv>;
  beforeEach(() => {
    m = makeMock({
      employees: [{
        id: 'emp_a', identity_number: '2111111111', full_name: 'Alpha',
        full_name_arabic: null,
        department: null, job_title: null, nationality: null,
        date_of_birth: null, hire_date: null,
        mobile: null, notes: null,
        status: 'active', source_file_id: 'sha-emp',
        created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
      }],
      source_files: [{
        hash: 'sha-c1',
        filename: 'contract.pdf',
        type: 'pdf',
        size: 100,
        uploaded_at: '2024-01-01T00:00:00Z',
        import_job_id: 'job_2',
        parser_version: 'test',
        uploaded_by: 'admin@mid.local',
        extraction_confidence: 0.5,
        r2_object_key: 'contracts/sha-c1/contract.pdf',
        r2_stored: 1,
      }],
      import_jobs: [{
        id: 'job_2',
        type: 'contracts',
        filename: 'contract.pdf',
        source_hash: 'sha-c1',
        status: 'review',
        idempotency_key: 'contracts:sha-c1',
        started_at: '2024-01-01T00:00:00Z',
        finished_at: null,
        triggered_by: 'admin@mid.local',
        counts_created: 0, counts_updated: 0, counts_skipped: 0,
        counts_review: 0, counts_error: 0,
      }],
      import_job_items: [{
        id: 'item_2',
        job_id: 'job_2',
        row_index: 0,
        identity_number: '2111111111',
        raw_payload: JSON.stringify({
          identityNumber: '2111111111',
          contractType: 'permanent',
          startDate: '2025-01-01',
          endDate: '2026-01-01',
          fileHash: 'sha-c1',
          filename: 'contract.pdf',
          basicSalary: 5000,            // parser value — will be overridden
          housingAllowance: 1000,       // parser value — will be overridden
          transportAllowance: 500,
        }),
        resolved_action: 'create',
        target_id: null,
        diff: null,
        reason: null,
        // User edited the basic salary upward to 6000 in the review screen.
        corrected_payload: JSON.stringify({ basicSalary: 6000, housingAllowance: 1500 }),
        committed_action: null,
        committed_at: null,
        committed_target_id: null,
        error_message: null,
      }],
    });
    env = buildEnv(m, DEV_ENV);
  });

  it('commit uses corrected basicSalary (not raw 5000) and writes compensation lines', async () => {
    const res = await fetchApp('/api/imports/commit', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Dev-Admin-Email': 'admin@mid.local',
      },
      body: JSON.stringify({ jobId: 'job_2' }),
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; counts: { created: number } };
    expect(body.status).toBe('committed');
    expect(body.counts.created).toBe(1);

    // One contract written.
    expect(m.tables.contracts).toHaveLength(1);
    const contract = m.tables.contracts![0]!;
    // Corrected values applied:
    expect(contract.basic_salary).toBe(6000);
    expect(contract.housing_allowance).toBe(1500);
    // Raw-only value (not overridden) preserved:
    expect(contract.transport_allowance).toBe(500);

    // Compensation lines written — basic + housing + transport.
    const lines = (m.tables.employee_compensation_lines ?? []).filter(
      (l) => l.employee_id === 'emp_a',
    );
    expect(lines.length).toBe(3);
    const basic = lines.find((l) => l.component_code === 'PAY_BASIC')!;
    expect(basic.amount).toBe(6000);
    expect(basic.source).toBe('contract');
    expect(basic.source_contract_id).toBe(contract.id);

    // Audit row for compensation.
    const audits = (m.tables.audit_events ?? []).filter(
      (a) => a.action === 'employee.compensation_updated',
    );
    expect(audits.length).toBe(1);
  });

  it('new contract import creates a new version row, never overwrites the old one', async () => {
    // Pre-seed an existing contract for the same employee + type. The new
    // import has a DIFFERENT file_hash so the UNIQUE constraint allows it,
    // and `insertContract` should bump the version from 1 to 2.
    m.tables.contracts!.push({
      id: 'ctr_v1',
      employee_id: 'emp_a',
      identity_number: '2111111111',
      contract_type: 'permanent',
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      status: 'expired',
      version: 1,
      version_of: null,
      file_hash: 'sha-old',
      filename: 'old.pdf',
      extraction_confidence: 0.9,
      notes: null,
      source_file_id: 'sha-old',
      created_at: '2024-01-01T00:00:00Z',
    });
    const res = await fetchApp('/api/imports/commit', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Dev-Admin-Email': 'admin@mid.local',
      },
      body: JSON.stringify({ jobId: 'job_2' }),
    }, env);
    expect(res.status).toBe(200);
    // Two contracts now — old + new (with version=2). Old row untouched.
    expect(m.tables.contracts).toHaveLength(2);
    const old = m.tables.contracts!.find((c) => c.id === 'ctr_v1')!;
    expect(old.status).toBe('expired');
    expect(old.end_date).toBe('2024-12-31');
    const fresh = m.tables.contracts!.find((c) => c.id !== 'ctr_v1')!;
    expect(fresh.version).toBe(2);
    expect(fresh.version_of).toBe('ctr_v1');
  });
});

// ============================================================================
// Employee 360 reflection — current contract + currentCompensation
// ============================================================================

describe('GET /api/employees/:id — currentContract + currentCompensation', () => {
  it('returns the contract whose window covers today + summed monthly total', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + 60 * 86400 * 1000).toISOString().slice(0, 10);
    const past   = new Date(Date.now() - 60 * 86400 * 1000).toISOString().slice(0, 10);
    const m = makeMock({
      employees: [{
        id: 'emp_x', identity_number: '2122222222', full_name: 'Beta',
        full_name_arabic: null,
        department: null, job_title: null, nationality: null,
        date_of_birth: null, hire_date: null,
        mobile: null, notes: null,
        status: 'active', source_file_id: 'sha-emp',
        created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
      }],
      contracts: [{
        id: 'ctr_old',
        employee_id: 'emp_x', identity_number: '2122222222',
        contract_type: 'permanent',
        start_date: past, end_date: past,  // already over
        status: 'expired', version: 1, version_of: null,
        file_hash: 'sha-old', filename: 'old.pdf',
        extraction_confidence: 0.9, notes: null,
        source_file_id: 'sha-old',
        created_at: '2024-01-01T00:00:00Z',
        basic_salary: 4000, currency: 'SAR',
      }, {
        id: 'ctr_now',
        employee_id: 'emp_x', identity_number: '2122222222',
        contract_type: 'permanent',
        start_date: today, end_date: future,
        status: 'active', version: 2, version_of: 'ctr_old',
        file_hash: 'sha-now', filename: 'now.pdf',
        extraction_confidence: 0.9, notes: null,
        source_file_id: 'sha-now',
        created_at: '2024-06-01T00:00:00Z',
        basic_salary: 6000, housing_allowance: 1500, currency: 'SAR',
      }],
      employee_compensation_lines: [{
        id: 'cmp_basic', employee_id: 'emp_x',
        component_code: 'PAY_BASIC', component_name: 'Basic salary',
        amount: 6000, currency: 'SAR', frequency: 'monthly',
        effective_from: today, effective_to: future,
        source: 'contract', notes: null,
        created_by: 'admin@mid.local', created_at: '2024-06-01T00:00:00Z',
        updated_at: '2024-06-01T00:00:00Z', updated_by: 'admin@mid.local',
        source_contract_id: 'ctr_now',
      }, {
        id: 'cmp_housing', employee_id: 'emp_x',
        component_code: 'PAY_HOUSING', component_name: 'Housing allowance',
        amount: 1500, currency: 'SAR', frequency: 'monthly',
        effective_from: today, effective_to: future,
        source: 'contract', notes: null,
        created_by: 'admin@mid.local', created_at: '2024-06-01T00:00:00Z',
        updated_at: '2024-06-01T00:00:00Z', updated_by: 'admin@mid.local',
        source_contract_id: 'ctr_now',
      }],
    });
    const env = buildEnv(m, DEV_ENV);
    const res = await fetchApp('/api/employees/emp_x', {
      method: 'GET',
      headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      contracts: Array<{ id: string }>;
      currentContract: { id: string; version: number } | null;
      currentCompensation: { monthlyTotal: number; currency: string; lines: unknown[] } | null;
    };
    // Old contract is still in the list — it's history, not deleted.
    expect(body.contracts.find((c) => c.id === 'ctr_old')).toBeTruthy();
    // Current = the one whose window covers today (latest end).
    expect(body.currentContract).toBeTruthy();
    expect(body.currentContract!.id).toBe('ctr_now');
    expect(body.currentContract!.version).toBe(2);
    // Monthly total = 6000 + 1500.
    expect(body.currentCompensation).toBeTruthy();
    expect(body.currentCompensation!.monthlyTotal).toBe(7500);
    expect(body.currentCompensation!.currency).toBe('SAR');
    expect(body.currentCompensation!.lines.length).toBe(2);
  });
});
