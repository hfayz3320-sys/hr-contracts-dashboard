/**
 * Phase 6A-1 — HR Configuration repository.
 *
 * D1 access layer for the 14 hr_* config tables. Pure data conversion;
 * route layer owns auth, validation, audit, and tree-cycle checks.
 *
 * Naming convention:
 *   * `list<EntityPlural>`     — SELECT list, ordered by display_order, code
 *   * `get<Entity>`            — by id
 *   * `getByCode<Entity>`      — by code (used by validation + idempotency)
 *   * `insert<Entity>`         — INSERT row with audit fields
 *   * `update<Entity>`         — UPDATE allowed fields; never updates `code`
 *
 * `code` immutability: enforced at the route layer (Patch requests omit
 * `code`). Repo doesn't write `code` on updates as a defense-in-depth measure.
 */
import type { Env } from '../env';
import type {
  HrOrgUnit, HrJobTitle, HrTrade, HrGrade, HrPosition,
  HrContractType, HrPayrollComponent,
  HrMedicalProvider, HrMedicalPolicyClass,
  HrDocumentType, HrTransactionType, HrActivityType,
  HrLearningCategory, HrSocialInsuranceRule,
} from '@shared/domain';

// ============================================================================
// Row-shape adapters (snake_case D1 → camelCase domain).
// ============================================================================

interface ConfigBaseRow {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  active: number;
  display_order: number;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}

function baseFromRow(r: ConfigBaseRow): Omit<HrOrgUnit,
  'type' | 'parentId' | 'level' | 'managerEmployeeId' | 'siteCode' | 'projectCode'
> {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    nameAr: r.name_ar,
    active: r.active === 1,
    displayOrder: r.display_order,
    createdAt: r.created_at,
    createdBy: r.created_by,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

// ============================================================================
// Org units
// ============================================================================

interface OrgUnitRow extends ConfigBaseRow {
  type: string;
  parent_id: string | null;
  level: number;
  manager_employee_id: string | null;
  site_code: string | null;
  project_code: string | null;
}

function rowToOrgUnit(r: OrgUnitRow): HrOrgUnit {
  return {
    ...baseFromRow(r),
    type: r.type as HrOrgUnit['type'],
    parentId: r.parent_id,
    level: r.level,
    managerEmployeeId: r.manager_employee_id,
    siteCode: r.site_code,
    projectCode: r.project_code,
  };
}

export async function listOrgUnits(env: Env): Promise<HrOrgUnit[]> {
  const res = await env.DB.prepare(
    `SELECT * FROM hr_org_units ORDER BY display_order, code`,
  ).all<OrgUnitRow>();
  return (res.results ?? []).map(rowToOrgUnit);
}
export async function getOrgUnit(env: Env, id: string): Promise<HrOrgUnit | null> {
  const r = await env.DB.prepare(`SELECT * FROM hr_org_units WHERE id = ?`).bind(id).first<OrgUnitRow>();
  return r ? rowToOrgUnit(r) : null;
}
export async function getOrgUnitByCode(env: Env, code: string): Promise<HrOrgUnit | null> {
  const r = await env.DB.prepare(`SELECT * FROM hr_org_units WHERE code = ?`).bind(code).first<OrgUnitRow>();
  return r ? rowToOrgUnit(r) : null;
}
export async function insertOrgUnit(
  env: Env,
  row: Omit<HrOrgUnit, 'id' | 'createdAt' | 'updatedAt' | 'level' | 'active' | 'displayOrder'> & {
    id: string;
    level: number;
    active?: boolean;
    displayOrder?: number;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO hr_org_units
      (id, code, name, name_ar, type, parent_id, level, manager_employee_id,
       site_code, project_code, active, display_order, created_by, updated_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    row.id, row.code, row.name, row.nameAr ?? null, row.type, row.parentId ?? null, row.level,
    row.managerEmployeeId ?? null, row.siteCode ?? null, row.projectCode ?? null,
    row.active === false ? 0 : 1,
    row.displayOrder ?? 0,
    row.createdBy, row.updatedBy,
  ).run();
}
export async function updateOrgUnit(
  env: Env,
  id: string,
  patch: Partial<Omit<HrOrgUnit, 'id' | 'code' | 'createdAt' | 'createdBy'>>,
  actor: string,
): Promise<void> {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.name !== undefined)            { sets.push('name = ?');                args.push(patch.name); }
  if (patch.nameAr !== undefined)          { sets.push('name_ar = ?');             args.push(patch.nameAr ?? null); }
  if (patch.type !== undefined)            { sets.push('type = ?');                args.push(patch.type); }
  if (patch.parentId !== undefined)        { sets.push('parent_id = ?');           args.push(patch.parentId ?? null); }
  if (patch.level !== undefined)           { sets.push('level = ?');               args.push(patch.level); }
  if (patch.managerEmployeeId !== undefined) { sets.push('manager_employee_id = ?'); args.push(patch.managerEmployeeId ?? null); }
  if (patch.siteCode !== undefined)        { sets.push('site_code = ?');           args.push(patch.siteCode ?? null); }
  if (patch.projectCode !== undefined)     { sets.push('project_code = ?');        args.push(patch.projectCode ?? null); }
  if (patch.active !== undefined)          { sets.push('active = ?');              args.push(patch.active ? 1 : 0); }
  if (patch.displayOrder !== undefined)    { sets.push('display_order = ?');       args.push(patch.displayOrder); }
  sets.push("updated_at = datetime('now')", 'updated_by = ?');
  args.push(actor, id);
  await env.DB.prepare(`UPDATE hr_org_units SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
}

// Build a level (depth) for a new node by walking parent chain.
export async function computeOrgUnitLevel(env: Env, parentId: string | null): Promise<number> {
  if (!parentId) return 0;
  let level = 0;
  let current: string | null = parentId;
  // Hard cap at 16 levels — UI also caps at 6; this prevents infinite loops
  // if a cycle ever slips past the application-level guard.
  for (let i = 0; i < 16 && current; i++) {
    level += 1;
    const r = await env.DB.prepare(`SELECT parent_id FROM hr_org_units WHERE id = ?`).bind(current).first<{ parent_id: string | null }>();
    if (!r) break;
    current = r.parent_id;
  }
  return level;
}

// Cycle guard — refuse a re-parent that would make `id` an ancestor of itself.
export async function wouldCreateOrgCycle(env: Env, id: string, newParentId: string | null): Promise<boolean> {
  if (!newParentId) return false;
  if (newParentId === id) return true;
  let current: string | null = newParentId;
  for (let i = 0; i < 16 && current; i++) {
    if (current === id) return true;
    const r = await env.DB.prepare(`SELECT parent_id FROM hr_org_units WHERE id = ?`).bind(current).first<{ parent_id: string | null }>();
    if (!r) return false;
    current = r.parent_id;
  }
  return false;
}

// ============================================================================
// Job titles
// ============================================================================

interface JobTitleRow extends ConfigBaseRow {
  category: string | null;
  description: string | null;
}
function rowToJobTitle(r: JobTitleRow): HrJobTitle {
  return { ...baseFromRow(r), category: r.category, description: r.description };
}
export async function listJobTitles(env: Env): Promise<HrJobTitle[]> {
  const res = await env.DB.prepare(`SELECT * FROM hr_job_titles ORDER BY display_order, code`).all<JobTitleRow>();
  return (res.results ?? []).map(rowToJobTitle);
}
export async function getJobTitle(env: Env, id: string): Promise<HrJobTitle | null> {
  const r = await env.DB.prepare(`SELECT * FROM hr_job_titles WHERE id = ?`).bind(id).first<JobTitleRow>();
  return r ? rowToJobTitle(r) : null;
}
export async function getJobTitleByCode(env: Env, code: string): Promise<HrJobTitle | null> {
  const r = await env.DB.prepare(`SELECT * FROM hr_job_titles WHERE code = ?`).bind(code).first<JobTitleRow>();
  return r ? rowToJobTitle(r) : null;
}
export async function insertJobTitle(
  env: Env,
  row: { id: string; code: string; name: string; nameAr?: string | null;
         category?: string | null; description?: string | null;
         displayOrder?: number; createdBy: string; updatedBy: string; },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO hr_job_titles
      (id, code, name, name_ar, category, description, display_order, created_by, updated_by)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).bind(
    row.id, row.code, row.name, row.nameAr ?? null, row.category ?? null, row.description ?? null,
    row.displayOrder ?? 0, row.createdBy, row.updatedBy,
  ).run();
}
export async function updateJobTitle(
  env: Env,
  id: string,
  patch: Partial<Omit<HrJobTitle, 'id' | 'code' | 'createdAt' | 'createdBy'>>,
  actor: string,
): Promise<void> {
  const sets: string[] = []; const args: unknown[] = [];
  if (patch.name !== undefined)         { sets.push('name = ?');          args.push(patch.name); }
  if (patch.nameAr !== undefined)       { sets.push('name_ar = ?');       args.push(patch.nameAr ?? null); }
  if (patch.category !== undefined)     { sets.push('category = ?');      args.push(patch.category ?? null); }
  if (patch.description !== undefined)  { sets.push('description = ?');   args.push(patch.description ?? null); }
  if (patch.active !== undefined)       { sets.push('active = ?');        args.push(patch.active ? 1 : 0); }
  if (patch.displayOrder !== undefined) { sets.push('display_order = ?'); args.push(patch.displayOrder); }
  sets.push("updated_at = datetime('now')", 'updated_by = ?');
  args.push(actor, id);
  await env.DB.prepare(`UPDATE hr_job_titles SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
}

// ============================================================================
// Grades
// ============================================================================

interface GradeRow extends ConfigBaseRow {
  level: number;
  salary_band_min: number | null;
  salary_band_max: number | null;
  currency: string;
}
function rowToGrade(r: GradeRow): HrGrade {
  return {
    ...baseFromRow(r),
    level: r.level,
    salaryBandMin: r.salary_band_min,
    salaryBandMax: r.salary_band_max,
    currency: r.currency,
  };
}
export async function listGrades(env: Env): Promise<HrGrade[]> {
  const res = await env.DB.prepare(`SELECT * FROM hr_grades ORDER BY level, code`).all<GradeRow>();
  return (res.results ?? []).map(rowToGrade);
}
export async function getGrade(env: Env, id: string): Promise<HrGrade | null> {
  const r = await env.DB.prepare(`SELECT * FROM hr_grades WHERE id = ?`).bind(id).first<GradeRow>();
  return r ? rowToGrade(r) : null;
}
export async function getGradeByCode(env: Env, code: string): Promise<HrGrade | null> {
  const r = await env.DB.prepare(`SELECT * FROM hr_grades WHERE code = ?`).bind(code).first<GradeRow>();
  return r ? rowToGrade(r) : null;
}
export async function insertGrade(
  env: Env,
  row: { id: string; code: string; name: string; nameAr?: string | null;
         level: number; salaryBandMin?: number | null; salaryBandMax?: number | null;
         currency?: string; displayOrder?: number; createdBy: string; updatedBy: string; },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO hr_grades
      (id, code, name, name_ar, level, salary_band_min, salary_band_max, currency, display_order, created_by, updated_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    row.id, row.code, row.name, row.nameAr ?? null, row.level,
    row.salaryBandMin ?? null, row.salaryBandMax ?? null, row.currency ?? 'SAR',
    row.displayOrder ?? 0, row.createdBy, row.updatedBy,
  ).run();
}
export async function updateGrade(
  env: Env,
  id: string,
  patch: Partial<Omit<HrGrade, 'id' | 'code' | 'createdAt' | 'createdBy'>>,
  actor: string,
): Promise<void> {
  const sets: string[] = []; const args: unknown[] = [];
  if (patch.name !== undefined)          { sets.push('name = ?');             args.push(patch.name); }
  if (patch.nameAr !== undefined)        { sets.push('name_ar = ?');          args.push(patch.nameAr ?? null); }
  if (patch.level !== undefined)         { sets.push('level = ?');            args.push(patch.level); }
  if (patch.salaryBandMin !== undefined) { sets.push('salary_band_min = ?');  args.push(patch.salaryBandMin ?? null); }
  if (patch.salaryBandMax !== undefined) { sets.push('salary_band_max = ?');  args.push(patch.salaryBandMax ?? null); }
  if (patch.currency !== undefined)      { sets.push('currency = ?');         args.push(patch.currency); }
  if (patch.active !== undefined)        { sets.push('active = ?');           args.push(patch.active ? 1 : 0); }
  if (patch.displayOrder !== undefined)  { sets.push('display_order = ?');    args.push(patch.displayOrder); }
  sets.push("updated_at = datetime('now')", 'updated_by = ?');
  args.push(actor, id);
  await env.DB.prepare(`UPDATE hr_grades SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
}

// ============================================================================
// Positions
// ============================================================================

// Positions deliberately omit `name`/`name_ar` — their identity is `code` +
// the (job_title × org_unit) they reference. UI labels are derived at render.
interface PositionRow {
  id: string;
  code: string;
  job_title_id: string;
  org_unit_id: string;
  grade_id: string | null;
  reports_to_position_id: string | null;
  headcount_allowed: number;
  active: number;
  display_order: number;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}
function rowToPosition(r: PositionRow): HrPosition {
  return {
    id: r.id,
    code: r.code,
    jobTitleId: r.job_title_id,
    orgUnitId: r.org_unit_id,
    gradeId: r.grade_id,
    reportsToPositionId: r.reports_to_position_id,
    headcountAllowed: r.headcount_allowed,
    active: r.active === 1,
    displayOrder: r.display_order,
    createdAt: r.created_at,
    createdBy: r.created_by,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}
export async function listPositions(env: Env): Promise<HrPosition[]> {
  const res = await env.DB.prepare(`SELECT * FROM hr_positions ORDER BY display_order, code`).all<PositionRow>();
  return (res.results ?? []).map(rowToPosition);
}
export async function getPosition(env: Env, id: string): Promise<HrPosition | null> {
  const r = await env.DB.prepare(`SELECT * FROM hr_positions WHERE id = ?`).bind(id).first<PositionRow>();
  return r ? rowToPosition(r) : null;
}
export async function getPositionByCode(env: Env, code: string): Promise<HrPosition | null> {
  const r = await env.DB.prepare(`SELECT * FROM hr_positions WHERE code = ?`).bind(code).first<PositionRow>();
  return r ? rowToPosition(r) : null;
}
export async function insertPosition(
  env: Env,
  row: { id: string; code: string;
         jobTitleId: string; orgUnitId: string;
         gradeId?: string | null; reportsToPositionId?: string | null;
         headcountAllowed?: number; displayOrder?: number;
         createdBy: string; updatedBy: string; },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO hr_positions
      (id, code, job_title_id, org_unit_id, grade_id, reports_to_position_id,
       headcount_allowed, display_order, created_by, updated_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    row.id, row.code, row.jobTitleId, row.orgUnitId,
    row.gradeId ?? null, row.reportsToPositionId ?? null,
    row.headcountAllowed ?? 1, row.displayOrder ?? 0,
    row.createdBy, row.updatedBy,
  ).run();
}
export async function updatePosition(
  env: Env,
  id: string,
  patch: Partial<Omit<HrPosition, 'id' | 'code' | 'createdAt' | 'createdBy'>>,
  actor: string,
): Promise<void> {
  const sets: string[] = []; const args: unknown[] = [];
  if (patch.jobTitleId !== undefined)          { sets.push('job_title_id = ?');           args.push(patch.jobTitleId); }
  if (patch.orgUnitId !== undefined)           { sets.push('org_unit_id = ?');            args.push(patch.orgUnitId); }
  if (patch.gradeId !== undefined)             { sets.push('grade_id = ?');               args.push(patch.gradeId ?? null); }
  if (patch.reportsToPositionId !== undefined) { sets.push('reports_to_position_id = ?'); args.push(patch.reportsToPositionId ?? null); }
  if (patch.headcountAllowed !== undefined)    { sets.push('headcount_allowed = ?');      args.push(patch.headcountAllowed); }
  if (patch.active !== undefined)              { sets.push('active = ?');                 args.push(patch.active ? 1 : 0); }
  if (patch.displayOrder !== undefined)        { sets.push('display_order = ?');          args.push(patch.displayOrder); }
  sets.push("updated_at = datetime('now')", 'updated_by = ?');
  args.push(actor, id);
  await env.DB.prepare(`UPDATE hr_positions SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
}

// ============================================================================
// Trades — same shape as job_titles
// ============================================================================

interface TradeRow extends ConfigBaseRow {
  category: string | null;
  description: string | null;
}
function rowToTrade(r: TradeRow): HrTrade {
  return { ...baseFromRow(r), category: r.category, description: r.description };
}
export async function listTrades(env: Env): Promise<HrTrade[]> {
  const res = await env.DB.prepare(`SELECT * FROM hr_trades ORDER BY display_order, code`).all<TradeRow>();
  return (res.results ?? []).map(rowToTrade);
}

// ============================================================================
// Contract types
// ============================================================================

interface ContractTypeRow extends ConfigBaseRow {
  template_code: string | null;
  requires_end_date: number;
  requires_source_pdf: number;
  requires_salary_attach: number;
  max_renewals: number | null;
  default_term_months: number | null;
}
function rowToContractType(r: ContractTypeRow): HrContractType {
  return {
    ...baseFromRow(r),
    templateCode: r.template_code,
    requiresEndDate: r.requires_end_date === 1,
    requiresSourcePdf: r.requires_source_pdf === 1,
    requiresSalaryAttach: r.requires_salary_attach === 1,
    maxRenewals: r.max_renewals,
    defaultTermMonths: r.default_term_months,
  };
}
export async function listContractTypes(env: Env): Promise<HrContractType[]> {
  const res = await env.DB.prepare(`SELECT * FROM hr_contract_types ORDER BY display_order, code`).all<ContractTypeRow>();
  return (res.results ?? []).map(rowToContractType);
}

// ============================================================================
// Payroll components
// ============================================================================

interface PayrollComponentRow extends ConfigBaseRow {
  kind: string;
  taxable: number;
  included_in_gosi: number;
  included_in_eos: number;
  default_currency: string;
}
function rowToPayrollComponent(r: PayrollComponentRow): HrPayrollComponent {
  return {
    ...baseFromRow(r),
    kind: r.kind as HrPayrollComponent['kind'],
    taxable: r.taxable === 1,
    includedInGosi: r.included_in_gosi === 1,
    includedInEos: r.included_in_eos === 1,
    defaultCurrency: r.default_currency,
  };
}
export async function listPayrollComponents(env: Env): Promise<HrPayrollComponent[]> {
  const res = await env.DB.prepare(`SELECT * FROM hr_payroll_components ORDER BY display_order, code`).all<PayrollComponentRow>();
  return (res.results ?? []).map(rowToPayrollComponent);
}

// ============================================================================
// Medical providers + classes
// ============================================================================

interface MedicalProviderRow extends ConfigBaseRow {
  default_policy_year_months: number | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
}
function rowToMedicalProvider(r: MedicalProviderRow): HrMedicalProvider {
  return {
    ...baseFromRow(r),
    defaultPolicyYearMonths: r.default_policy_year_months,
    contactPhone: r.contact_phone,
    contactEmail: r.contact_email,
    notes: r.notes,
  };
}
export async function listMedicalProviders(env: Env): Promise<HrMedicalProvider[]> {
  const res = await env.DB.prepare(`SELECT * FROM hr_medical_providers ORDER BY display_order, code`).all<MedicalProviderRow>();
  return (res.results ?? []).map(rowToMedicalProvider);
}

interface MedicalPolicyClassRow extends ConfigBaseRow {
  tier_level: number;
  description: string | null;
}
function rowToMedicalPolicyClass(r: MedicalPolicyClassRow): HrMedicalPolicyClass {
  return { ...baseFromRow(r), tierLevel: r.tier_level, description: r.description };
}
export async function listMedicalPolicyClasses(env: Env): Promise<HrMedicalPolicyClass[]> {
  const res = await env.DB.prepare(`SELECT * FROM hr_medical_policy_classes ORDER BY tier_level, code`).all<MedicalPolicyClassRow>();
  return (res.results ?? []).map(rowToMedicalPolicyClass);
}

// ============================================================================
// Document types
// ============================================================================

interface DocumentTypeRow extends ConfigBaseRow {
  requires_doc_number: number;
  requires_expires_at: number;
  requires_source_file: number;
  allow_history: number;
  default_review_required: number;
  warning_before_expiry_days: number | null;
  description: string | null;
}
function rowToDocumentType(r: DocumentTypeRow): HrDocumentType {
  return {
    ...baseFromRow(r),
    requiresDocNumber: r.requires_doc_number === 1,
    requiresExpiresAt: r.requires_expires_at === 1,
    requiresSourceFile: r.requires_source_file === 1,
    allowHistory: r.allow_history === 1,
    defaultReviewRequired: r.default_review_required === 1,
    warningBeforeExpiryDays: r.warning_before_expiry_days,
    description: r.description,
  };
}
export async function listDocumentTypes(env: Env): Promise<HrDocumentType[]> {
  const res = await env.DB.prepare(`SELECT * FROM hr_document_types ORDER BY display_order, code`).all<DocumentTypeRow>();
  return (res.results ?? []).map(rowToDocumentType);
}

// ============================================================================
// Transaction types
// ============================================================================

interface TransactionTypeRow extends ConfigBaseRow {
  category: string;
  payload_schema_version: number;
  requires_doc_type_id: string | null;
  default_review_required: number;
  allowed_statuses: string;
  default_status: string;
  audit_severity: string;
}
function rowToTransactionType(r: TransactionTypeRow): HrTransactionType {
  return {
    ...baseFromRow(r),
    category: r.category as HrTransactionType['category'],
    payloadSchemaVersion: r.payload_schema_version,
    requiresDocTypeId: r.requires_doc_type_id,
    defaultReviewRequired: r.default_review_required === 1,
    allowedStatuses: r.allowed_statuses.split(',').map((s) => s.trim()).filter(Boolean),
    defaultStatus: r.default_status,
    auditSeverity: r.audit_severity as HrTransactionType['auditSeverity'],
  };
}
export async function listTransactionTypes(env: Env): Promise<HrTransactionType[]> {
  const res = await env.DB.prepare(`SELECT * FROM hr_transaction_types ORDER BY display_order, code`).all<TransactionTypeRow>();
  return (res.results ?? []).map(rowToTransactionType);
}

// ============================================================================
// Activity types
// ============================================================================

interface ActivityTypeRow extends ConfigBaseRow {
  category: string;
  default_due_days: number | null;
  requires_assignee: number;
  default_priority: string;
}
function rowToActivityType(r: ActivityTypeRow): HrActivityType {
  return {
    ...baseFromRow(r),
    category: r.category as HrActivityType['category'],
    defaultDueDays: r.default_due_days,
    requiresAssignee: r.requires_assignee === 1,
    defaultPriority: r.default_priority as HrActivityType['defaultPriority'],
  };
}
export async function listActivityTypes(env: Env): Promise<HrActivityType[]> {
  const res = await env.DB.prepare(`SELECT * FROM hr_activity_types ORDER BY display_order, code`).all<ActivityTypeRow>();
  return (res.results ?? []).map(rowToActivityType);
}

// ============================================================================
// Learning categories
// ============================================================================

interface LearningCategoryRow extends ConfigBaseRow {
  requires_expiry: number;
  requires_issuer: number;
  description: string | null;
}
function rowToLearningCategory(r: LearningCategoryRow): HrLearningCategory {
  return {
    ...baseFromRow(r),
    requiresExpiry: r.requires_expiry === 1,
    requiresIssuer: r.requires_issuer === 1,
    description: r.description,
  };
}
export async function listLearningCategories(env: Env): Promise<HrLearningCategory[]> {
  const res = await env.DB.prepare(`SELECT * FROM hr_learning_categories ORDER BY display_order, code`).all<LearningCategoryRow>();
  return (res.results ?? []).map(rowToLearningCategory);
}

// ============================================================================
// Social insurance rules
// ============================================================================

interface SocialInsuranceRuleRow extends ConfigBaseRow {
  applies_to: string;
  employer_rate_pct: number | null;
  employee_rate_pct: number | null;
  contribution_cap_sar: number | null;
  effective_from: string;
  effective_to: string | null;
  requires_source_doc: number;
  notes: string | null;
}
function rowToSocialInsuranceRule(r: SocialInsuranceRuleRow): HrSocialInsuranceRule {
  return {
    ...baseFromRow(r),
    appliesTo: r.applies_to as HrSocialInsuranceRule['appliesTo'],
    employerRatePct: r.employer_rate_pct,
    employeeRatePct: r.employee_rate_pct,
    contributionCapSar: r.contribution_cap_sar,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    requiresSourceDoc: r.requires_source_doc === 1,
    notes: r.notes,
  };
}
export async function listSocialInsuranceRules(env: Env): Promise<HrSocialInsuranceRule[]> {
  const res = await env.DB.prepare(`SELECT * FROM hr_social_insurance_rules ORDER BY effective_from DESC, code`).all<SocialInsuranceRuleRow>();
  return (res.results ?? []).map(rowToSocialInsuranceRule);
}
