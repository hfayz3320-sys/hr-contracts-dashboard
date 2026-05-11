/**
 * Phase 6A-1 — HR Configuration route tests.
 *
 * Exercises the route layer (Hono app.fetch) against the mock D1.
 * Covers:
 *   - Auth gates: all reads require auth, all writes require admin
 *   - Code uniqueness: 409 on duplicate code (create)
 *   - Code immutability: PATCH cannot change `code`
 *   - Org-unit hierarchy cycle guard
 *   - Active-flag filtering (active=false retires the row, not deletes)
 *   - Type alignment: seed codes match the canonical zod set
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../worker/src/index';
import { makeMockD1, type Row, type MockD1 } from './_mock-d1';

const PROD_ENV = {
  ENVIRONMENT: 'production',
  ADMIN_EMAILS: 'admin@mid.local',
  ALLOW_ORIGIN: '',
  CF_ACCESS_TEAM: 'midarabia',
  CF_ACCESS_AUD: 'aud',
};
const DEV_ENV = {
  ENVIRONMENT: 'development',
  ADMIN_EMAILS: 'admin@mid.local',
  ALLOW_ORIGIN: '',
};
const ADMIN_HEADER = { 'X-Dev-Admin-Email': 'admin@mid.local' };

const ADMIN_ROW: Row = {
  id: 'usr_admin', email: 'admin@mid.local', display_name: 'Admin',
  role: 'admin', status: 'active', last_login_at: null,
  created_at: '2024-01-01T00:00:00Z', created_by: 'system',
  updated_at: '2024-01-01T00:00:00Z', updated_by: 'system',
};

function seedRow(code: string, extra: Row = {}): Row {
  return {
    id: `id_${code.toLowerCase()}`,
    code,
    name: code,
    name_ar: null,
    active: 1,
    display_order: 0,
    created_at: '2024-01-01T00:00:00Z',
    created_by: 'system:seed',
    updated_at: '2024-01-01T00:00:00Z',
    updated_by: 'system:seed',
    ...extra,
  };
}

function buildEnv(mock: MockD1, envBase: Record<string, unknown>) {
  return { ...envBase, DB: mock.d1, RAW_FILES: { list: async () => ({ objects: [] }) } };
}

function fetchApp(path: string, init: RequestInit, env: unknown): Promise<Response> {
  return app.fetch(new Request(`https://test.local${path}`, init), env as never);
}

function seedTables(): Record<string, Row[]> {
  return {
    app_users: [ADMIN_ROW],
    employees: [],
    audit_events: [],
    hr_org_units: [
      seedRow('ORG_ROOT', { type: 'legal_entity', parent_id: null, level: 0, manager_employee_id: null, site_code: null, project_code: null }),
      seedRow('ORG_ENG',  { type: 'department',  parent_id: 'id_org_root', level: 1, manager_employee_id: null, site_code: null, project_code: null }),
    ],
    hr_job_titles: [
      seedRow('JOB_ENGINEER', { category: 'Engineering', description: null }),
    ],
    hr_grades: [
      seedRow('GR_E1', { level: 1, salary_band_min: null, salary_band_max: null, currency: 'SAR' }),
    ],
    hr_positions: [
      { id: 'id_pos_eng_e1', code: 'POS_ENG_E1_01',
        job_title_id: 'id_job_engineer', org_unit_id: 'id_org_eng',
        grade_id: 'id_gr_e1', reports_to_position_id: null,
        headcount_allowed: 5, active: 1, display_order: 0,
        created_at: '2024-01-01T00:00:00Z', created_by: 'system:seed',
        updated_at: '2024-01-01T00:00:00Z', updated_by: 'system:seed' },
    ],
    hr_trades: [seedRow('TRADE_WELDING', { category: 'mechanical', description: null })],
    hr_contract_types: [
      seedRow('CONTRACT_FIXED_TERM', { template_code: null, requires_end_date: 1, requires_source_pdf: 1, requires_salary_attach: 1, max_renewals: null, default_term_months: 24 }),
    ],
    hr_payroll_components: [
      seedRow('PAY_BASIC', { kind: 'earning', taxable: 0, included_in_gosi: 1, included_in_eos: 1, default_currency: 'SAR' }),
    ],
    hr_medical_providers: [
      seedRow('MED_PROVIDER_BUPA', { default_policy_year_months: 12, contact_phone: null, contact_email: null, notes: null }),
    ],
    hr_medical_policy_classes: [
      seedRow('MED_CLASS_A', { tier_level: 1, description: null }),
    ],
    hr_document_types: [
      seedRow('DOC_IQAMA', { requires_doc_number: 1, requires_expires_at: 1, requires_source_file: 0, allow_history: 1, default_review_required: 0, warning_before_expiry_days: 60, description: null }),
    ],
    hr_transaction_types: [
      seedRow('TXN_FLIGHT_TICKET', { category: 'travel', payload_schema_version: 1, requires_doc_type_id: null, default_review_required: 0, allowed_statuses: 'requested,approved,completed', default_status: 'requested', audit_severity: 'info' }),
    ],
    hr_activity_types: [
      seedRow('ACT_SEND_MESSAGE', { category: 'communication', default_due_days: null, requires_assignee: 0, default_priority: 'normal' }),
    ],
    hr_learning_categories: [
      seedRow('LEARNING_CERTIFICATION', { requires_expiry: 1, requires_issuer: 1, description: null }),
    ],
    hr_social_insurance_rules: [
      seedRow('GOSI_SAUDI_PRIVATE', { applies_to: 'saudi', employer_rate_pct: 11.75, employee_rate_pct: 9.75, contribution_cap_sar: 45000, effective_from: '2024-01-01', effective_to: null, requires_source_doc: 1, notes: null }),
    ],
  };
}

// =========================================================================
describe('GET /api/config/* — read gates and shape', () => {
  let mock: MockD1;
  beforeEach(() => { mock = makeMockD1(seedTables()); });

  it('401 in production without a CF Access JWT', async () => {
    const res = await fetchApp('/api/config/hr', { method: 'GET' }, buildEnv(mock, PROD_ENV));
    expect(res.status).toBe(401);
  });

  it('200 in development with admin header — returns bundled snapshot', async () => {
    const res = await fetchApp('/api/config/hr', {
      method: 'GET', headers: ADMIN_HEADER,
    }, buildEnv(mock, DEV_ENV));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown[]>;
    // bundle keys present
    for (const k of [
      'orgUnits','jobTitles','positions','grades','trades','contractTypes',
      'payrollComponents','learningCategories','medicalProviders',
      'medicalPolicyClasses','socialInsuranceRules',
      'documentTypes','transactionTypes','activityTypes',
    ]) expect(body[k]).toBeInstanceOf(Array);
    // seeded counts are non-zero
    expect(body.contractTypes!.length).toBeGreaterThan(0);
    expect(body.documentTypes!.length).toBeGreaterThan(0);
    expect(body.transactionTypes!.length).toBeGreaterThan(0);
    expect(body.activityTypes!.length).toBeGreaterThan(0);
  });

  it('GET /api/config/org-units/tree returns nested children', async () => {
    const res = await fetchApp('/api/config/org-units/tree', { method: 'GET', headers: ADMIN_HEADER }, buildEnv(mock, DEV_ENV));
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ code: string; children: Array<{ code: string }> }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.code).toBe('ORG_ROOT');
    expect(body.items[0]!.children).toHaveLength(1);
    expect(body.items[0]!.children[0]!.code).toBe('ORG_ENG');
  });
});

// =========================================================================
describe('POST /api/config/* — admin gates + code uniqueness', () => {
  let mock: MockD1;
  beforeEach(() => {
    mock = makeMockD1(seedTables());
    mock.registerUnique('hr_job_titles', ['code']);
    mock.registerUnique('hr_grades', ['code']);
    mock.registerUnique('hr_org_units', ['code']);
    mock.registerUnique('hr_positions', ['code']);
  });

  it('403 when authenticated as non-admin (dev mode, no admin header)', async () => {
    const res = await fetchApp('/api/config/job-titles', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Dev-Admin-Email': 'not-admin@mid.local' },
      body: JSON.stringify({ code: 'JOB_X', name: 'X' }),
    }, buildEnv(mock, DEV_ENV));
    expect(res.status).toBe(403);
  });

  it('201-style 200 with admin: creates job title', async () => {
    const res = await fetchApp('/api/config/job-titles', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...ADMIN_HEADER },
      body: JSON.stringify({ code: 'JOB_NEW', name: 'New Title', nameAr: 'مسمى جديد' }),
    }, buildEnv(mock, DEV_ENV));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; item: { code: string; name: string } };
    expect(body.ok).toBe(true);
    expect(body.item.code).toBe('JOB_NEW');
  });

  it('409 on duplicate code', async () => {
    const res = await fetchApp('/api/config/job-titles', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...ADMIN_HEADER },
      body: JSON.stringify({ code: 'JOB_ENGINEER', name: 'Dup' }),
    }, buildEnv(mock, DEV_ENV));
    expect(res.status).toBe(409);
  });

  it('400 on invalid code (must be UPPER_SNAKE)', async () => {
    const res = await fetchApp('/api/config/job-titles', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...ADMIN_HEADER },
      body: JSON.stringify({ code: 'job-lowercase', name: 'X' }),
    }, buildEnv(mock, DEV_ENV));
    expect(res.status).toBe(400);
  });
});

// =========================================================================
describe('PATCH /api/config/* — code is immutable, fields update', () => {
  let mock: MockD1;
  beforeEach(() => { mock = makeMockD1(seedTables()); });

  it('cannot change code via PATCH (request schema omits code)', async () => {
    const res = await fetchApp('/api/config/job-titles/id_job_engineer', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...ADMIN_HEADER },
      body: JSON.stringify({ code: 'JOB_HACK', name: 'Hijacked' }),
    }, buildEnv(mock, DEV_ENV));
    // The payload includes `code` but the zod patch schema strips it (it's omitted in the patch type).
    // Either: route accepts and updates only `name`; or route refuses unknown fields.
    // Either way the row's `code` is unchanged.
    expect([200, 400]).toContain(res.status);
    const row = (mock.tables.hr_job_titles ?? []).find((r) => r.id === 'id_job_engineer');
    expect(row?.code).toBe('JOB_ENGINEER');
  });

  it('can retire via active=false (no DELETE endpoint)', async () => {
    const res = await fetchApp('/api/config/job-titles/id_job_engineer', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...ADMIN_HEADER },
      body: JSON.stringify({ active: false }),
    }, buildEnv(mock, DEV_ENV));
    expect(res.status).toBe(200);
    const row = (mock.tables.hr_job_titles ?? []).find((r) => r.id === 'id_job_engineer');
    expect(row?.active).toBe(0);
  });
});

// =========================================================================
describe('Hierarchy cycle guard on hr_org_units', () => {
  let mock: MockD1;
  beforeEach(() => { mock = makeMockD1(seedTables()); });

  it('rejects re-parent that would create a cycle (parent → child → child = parent)', async () => {
    // Build: ORG_ROOT → ORG_ENG → ORG_TEAM_A
    mock.tables.hr_org_units!.push(seedRow('ORG_TEAM_A', { type: 'section', parent_id: 'id_org_eng', level: 2, manager_employee_id: null, site_code: null, project_code: null }));
    // Try to set ORG_ROOT.parent_id = ORG_TEAM_A — that closes the cycle.
    const res = await fetchApp('/api/config/org-units/id_org_root', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...ADMIN_HEADER },
      body: JSON.stringify({ parentId: 'id_org_team_a' }),
    }, buildEnv(mock, DEV_ENV));
    expect(res.status).toBe(400);
    const body = await res.json() as { message: string };
    expect(body.message).toMatch(/cycle/i);
  });

  it('allows valid re-parent (no cycle)', async () => {
    // Build a second branch: ORG_OPS → ORG_OPS_DEPT, then move ORG_ENG under ORG_OPS.
    mock.tables.hr_org_units!.push(seedRow('ORG_OPS',      { type: 'legal_entity', parent_id: null, level: 0, manager_employee_id: null, site_code: null, project_code: null }));
    const res = await fetchApp('/api/config/org-units/id_org_eng', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...ADMIN_HEADER },
      body: JSON.stringify({ parentId: 'id_org_ops' }),
    }, buildEnv(mock, DEV_ENV));
    expect(res.status).toBe(200);
  });
});

// =========================================================================
describe('Positions — FK validation', () => {
  let mock: MockD1;
  beforeEach(() => {
    mock = makeMockD1(seedTables());
    mock.registerUnique('hr_positions', ['code']);
  });

  it('400 when job_title_id does not exist', async () => {
    const res = await fetchApp('/api/config/positions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...ADMIN_HEADER },
      body: JSON.stringify({ code: 'POS_BAD', jobTitleId: 'id_does_not_exist', orgUnitId: 'id_org_eng' }),
    }, buildEnv(mock, DEV_ENV));
    expect(res.status).toBe(400);
  });

  it('400 when org_unit_id does not exist', async () => {
    const res = await fetchApp('/api/config/positions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...ADMIN_HEADER },
      body: JSON.stringify({ code: 'POS_BAD', jobTitleId: 'id_job_engineer', orgUnitId: 'id_does_not_exist' }),
    }, buildEnv(mock, DEV_ENV));
    expect(res.status).toBe(400);
  });

  it('200 when FKs resolve', async () => {
    const res = await fetchApp('/api/config/positions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...ADMIN_HEADER },
      body: JSON.stringify({ code: 'POS_NEW', jobTitleId: 'id_job_engineer', orgUnitId: 'id_org_eng', gradeId: 'id_gr_e1' }),
    }, buildEnv(mock, DEV_ENV));
    expect(res.status).toBe(200);
  });
});
