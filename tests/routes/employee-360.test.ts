/**
 * Phase 4A A2 — GET /api/employees/:id Employee 360 aggregate test.
 *
 * Asserts:
 *   - Existing fields (employee/contracts/insurance/audit) are unchanged
 *     for back-compat
 *   - New additive fields appear: documents, transactions, dataQuality
 *   - Data quality computation picks up:
 *       * iqama_expired (current iqama, past expires_at)
 *       * contract_with_quality_flag (when contract has dataQualityIssue)
 *       * no_active_insurance (when none of the policies are active)
 *       * missing_date_of_birth (employee.dateOfBirth empty)
 */
import { describe, it, expect } from 'vitest';
import app from '../../worker/src/index';
import { makeMockD1, type Row, type MockD1 } from './_mock-d1';

const DEV_ENV_BASE = {
  ENVIRONMENT: 'development',
  ADMIN_EMAILS: 'admin@mid.local',
  ALLOW_ORIGIN: '',
};
const ADMIN_HEADER = { 'X-Dev-Admin-Email': 'admin@mid.local' };

function buildEnv(mock: MockD1) {
  return {
    ...DEV_ENV_BASE,
    DB: mock.d1,
    RAW_FILES: { list: async () => ({ objects: [] }) },
  };
}

function fetchApp(path: string, init: RequestInit, env: unknown): Promise<Response> {
  return app.fetch(new Request(`https://test.local${path}`, init), env as never);
}

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

describe('GET /api/employees/:id — Employee 360 aggregate', () => {
  it('returns existing fields AND additive documents/transactions/dataQuality', async () => {
    const m = makeMockD1({
      employees: [
        {
          id: 'emp_x',
          identity_number: '2999999999',
          full_name: 'Quality Test',
          full_name_arabic: null,
          department: 'Ops',
          job_title: 'Engineer',
          nationality: null, // → missing_nationality
          date_of_birth: null, // → missing_date_of_birth
          hire_date: null, // → missing_hire_date
          status: 'active',
        },
      ],
      employee_number_history: [
        // No `to: null` row → no_current_employee_number
        {
          id: 'enh_1',
          employee_id: 'emp_x',
          number: 'EMP-1',
          from_date: '2020-01-01',
          to_date: '2024-01-01',
        },
      ],
      contracts: [
        {
          id: 'ctr_x',
          employee_id: 'emp_x',
          identity_number: '2999999999',
          contract_type: 'Fixed',
          start_date: '2023-01-01',
          end_date: '2035-01-01', // ⇒ duration_over_3_years
          status: 'active',
          version: 1,
          version_of: null,
          file_hash: 'sha-x',
          filename: 'x.pdf',
          extraction_confidence: 0.9,
          notes: null,
          created_at: '2023-01-01T00:00:00Z',
        },
      ],
      insurance_policies: [
        {
          id: 'ins_x',
          employee_id: 'emp_x',
          identity_number: '2999999999',
          policy_number: 'P1',
          member_number: null,
          provider: 'Bupa',
          start_date: '2010-01-01',
          end_date: '2011-01-01', // expired
          status: 'active', // stored disagrees; computed will be 'expired'
          matched: 1,
          unmatched_reason: null,
          created_at: '2010-01-01T00:00:00Z',
        },
      ],
      employee_documents: [
        {
          id: 'doc_iqama',
          employee_id: 'emp_x',
          type: 'iqama',
          doc_number: '2999999999',
          issued_at: null,
          expires_at: '2000-01-01', // expired
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
        },
      ],
      employee_transactions: [
        {
          id: 'txn_a',
          employee_id: 'emp_x',
          type: 'vacation',
          status: 'completed',
          title: 'Annual leave',
          effective_date: '2025-01-01',
          end_date: '2025-01-05',
          amount: null,
          currency: null,
          ref_number: null,
          payload: JSON.stringify({ days: 5 }),
          payload_schema_version: 1,
          metadata: null,
          source_file_id: null,
          review_required: 0,
          review_reason: null,
          idempotency_key: null,
          created_at: '2024-12-15T00:00:00Z',
          created_by: 'seed',
          updated_at: '2024-12-15T00:00:00Z',
          updated_by: 'seed',
        },
      ],
      audit_events: [],
      app_users: [{ ...ADMIN_ROW }],
    });

    const res = await fetchApp(
      '/api/employees/emp_x',
      { method: 'GET', headers: ADMIN_HEADER },
      buildEnv(m),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      employee: { id: string };
      contracts: Array<{ id: string; dataQualityIssue?: string }>;
      insurance: Array<{ id: string; status: string }>;
      audit: unknown[];
      documents: Array<{ id: string; computedStatus: string }>;
      transactions: Array<{ id: string; title: string }>;
      dataQuality: { issues: string[]; reviewItemIds: string[] };
    };

    // Existing shape preserved
    expect(body.employee.id).toBe('emp_x');
    expect(body.contracts).toHaveLength(1);
    expect(body.insurance).toHaveLength(1);
    expect(Array.isArray(body.audit)).toBe(true);

    // Additive fields
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0]!.computedStatus).toBe('expired');
    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0]!.title).toBe('Annual leave');

    // Insurance status is computed; an end_date in 2011 must compute to expired
    expect(body.insurance[0]!.status).toBe('expired');

    // Contracts have a 12-year window → duration_over_3_years
    expect(body.contracts[0]!.dataQualityIssue).toBe('duration_over_3_years');

    // Data quality report
    const issues = body.dataQuality.issues;
    expect(issues).toContain('missing_date_of_birth');
    expect(issues).toContain('missing_nationality');
    expect(issues).toContain('missing_hire_date');
    expect(issues).toContain('no_current_employee_number');
    expect(issues).toContain('iqama_expired');
    expect(issues).toContain('no_active_contract');
    expect(issues).toContain('contract_with_quality_flag');
    expect(issues).toContain('no_active_insurance');
  });

  it('clean employee → empty dataQuality.issues except missing-data items', async () => {
    const today = new Date();
    const inOneYear = new Date(today);
    inOneYear.setUTCFullYear(today.getUTCFullYear() + 1);
    const inOneYearISO = inOneYear.toISOString().slice(0, 10);

    const m = makeMockD1({
      employees: [
        {
          id: 'emp_clean',
          identity_number: '2888888888',
          full_name: 'Clean',
          date_of_birth: '1990-01-01',
          nationality: 'SA',
          hire_date: '2020-01-01',
          status: 'active',
        },
      ],
      employee_number_history: [
        // Open (to_date = null) → no_current_employee_number does NOT fire
        {
          id: 'enh_x',
          employee_id: 'emp_clean',
          number: 'EMP-77',
          from_date: '2020-01-01',
          to_date: null,
        },
      ],
      contracts: [
        {
          id: 'ctr_clean',
          employee_id: 'emp_clean',
          identity_number: '2888888888',
          contract_type: 'Fixed',
          start_date: '2025-01-01',
          end_date: '2026-01-01', // 1-year, clean
          status: 'active',
          version: 1,
          version_of: null,
          file_hash: 'sha-c',
          filename: 'c.pdf',
          extraction_confidence: 0.9,
          notes: null,
          created_at: '2025-01-01T00:00:00Z',
        },
      ],
      insurance_policies: [
        {
          id: 'ins_clean',
          employee_id: 'emp_clean',
          identity_number: '2888888888',
          policy_number: 'P2',
          member_number: null,
          provider: 'Bupa',
          start_date: today.toISOString().slice(0, 10),
          end_date: inOneYearISO,
          status: 'active',
          matched: 1,
          unmatched_reason: null,
          created_at: today.toISOString(),
        },
      ],
      employee_documents: [],
      employee_transactions: [],
      audit_events: [],
      app_users: [{ ...ADMIN_ROW }],
    });

    const res = await fetchApp(
      '/api/employees/emp_clean',
      { method: 'GET', headers: ADMIN_HEADER },
      buildEnv(m),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      dataQuality: { issues: string[] };
    };
    expect(body.dataQuality.issues).toEqual([]);
  });

  it('back-compat: response keys include the original four plus the new three', async () => {
    const m = makeMockD1({
      employees: [
        {
          id: 'emp_min',
          identity_number: '2777777777',
          full_name: 'Minimal',
          status: 'active',
        },
      ],
      employee_number_history: [],
      contracts: [],
      insurance_policies: [],
      employee_documents: [],
      employee_transactions: [],
      audit_events: [],
      app_users: [{ ...ADMIN_ROW }],
    });
    const res = await fetchApp(
      '/api/employees/emp_min',
      { method: 'GET', headers: ADMIN_HEADER },
      buildEnv(m),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('employee');
    expect(body).toHaveProperty('contracts');
    expect(body).toHaveProperty('insurance');
    expect(body).toHaveProperty('audit');
    expect(body).toHaveProperty('documents');
    expect(body).toHaveProperty('transactions');
    expect(body).toHaveProperty('dataQuality');
  });
});
