// =============================================================================
// Shared domain types — consumed by BOTH the Vite frontend (via @shared/*) and
// the Cloudflare Worker (via @shared/* through worker/tsconfig).
// IdentityNumber (Iqama) is the PRIMARY matching key. EmployeeNumber is
// secondary/history only.
// =============================================================================

export type IdentityNumber = string;

export type EmployeeStatus = 'active' | 'inactive';

export type Employee = {
  id: string;
  identityNumber: IdentityNumber;
  fullName: string;
  fullNameArabic?: string;
  employeeNumberHistory: EmployeeNumberHistoryEntry[];
  department?: string;
  jobTitle?: string;
  nationality?: string;
  dateOfBirth?: string;
  hireDate?: string;
  status: EmployeeStatus;
  sourceFiles: string[];
  createdAt: string;
  updatedAt: string;
};

export type EmployeeNumberHistoryEntry = {
  number: string;
  from: string;
  to: string | null;
};

/**
 * Compact employee snapshot embedded in joined responses (Phase 3B).
 *
 * The full Employee object carries fields a list-row never displays
 * (full source-file refs, full history, full audit columns). Embedding a
 * summary instead avoids triplicating payload size when the contracts
 * endpoint returns 328 rows + 328 employee blobs, and it keeps the
 * identity number redacted by default — only the admin "show full
 * identity" toggle on a detail drawer should ever surface the full
 * Iqama digits, and even then only via the /api/employees/:id endpoint.
 */
export type EmployeeSummary = {
  id: string;
  fullName: string;
  /** Current open employee-number history row's `number`, or null if none. */
  employeeNumber: string | null;
  /** First-two + last-two digits with middle masked (e.g. `12xxxxx34`). */
  identityNumberRedacted: string;
  department: string | null;
  jobTitle: string | null;
};

/** Whether the parent row resolves to an employee in `employees`. */
export type LinkStatus = 'linked' | 'unmatched';

export type ContractStatus = 'active' | 'expiring' | 'expired';

/**
 * Read-time data-quality flag for a single Contract row (Phase 3D).
 *
 * The original Phase 2C PDF parsers fall back to a "first two dates in
 * document order" positional pairing when labelled extraction fails. In
 * MoHRSD standardised contracts the document also contains the
 * employee's ID expiry, work-permit expiry, and other unrelated dates
 * — so the positional fallback often pairs the wrong two values,
 * producing impossible windows (negative duration, >5-year duration,
 * etc.). The status enum can't express "this row looks broken,
 * regardless of where today falls in the date window"; that's what
 * `dataQualityIssue` is for. The FE shows a "Review required" badge
 * whenever it is set, taking visual precedence over the (date-derived)
 * status badge.
 *
 *   duration_negative      — end_date strictly before start_date
 *   duration_over_3_years  — end_date − start_date > 3 years; MID's
 *                             standard fixed-term is 1 year
 *   duration_under_30_days — end_date − start_date < 30 days; almost
 *                             always a parser mis-pair, e.g. ID issue
 *                             date vs ID expiry date
 *   start_date_missing     — start_date is empty (NOT NULL constraint
 *                             prevents this in D1, but the type allows
 *                             belt-and-braces)
 *   end_date_missing       — end_date is empty
 */
export type ContractDataQualityIssue =
  | 'duration_negative'
  | 'duration_over_3_years'
  | 'duration_under_30_days'
  | 'start_date_missing'
  | 'end_date_missing';

export type Contract = {
  id: string;
  employeeId: string;
  identityNumber: IdentityNumber;
  contractType: string;
  startDate: string;
  endDate: string;
  status: ContractStatus;
  version: number;
  versionOf?: string;
  fileHash: string;
  filename: string;
  extractionConfidence?: number;
  notes?: string;
  createdAt: string;
  // Phase 3B — populated when the endpoint is called with `?includeEmployee=1`.
  // Both are absent on the bare contract list, so existing consumers are
  // unaffected. The Contracts page passes the flag and renders names from
  // `employeeSummary` instead of relying on a parallel employees fetch.
  employeeSummary?: EmployeeSummary | null;
  linkStatus?: LinkStatus;
  // Phase 3D — computed at read time. See ContractDataQualityIssue above.
  dataQualityIssue?: ContractDataQualityIssue;
};

export type InsuranceStatus = 'active' | 'expired' | 'missing';

export type Insurance = {
  id: string;
  employeeId?: string;
  identityNumber?: IdentityNumber;
  policyNumber: string;
  memberNumber?: string;
  provider: string;
  startDate: string;
  endDate: string | null;
  status: InsuranceStatus;
  matched: boolean;
  unmatchedReason?: 'no_identity_match' | 'no_employee_number_match' | 'name_only';
  createdAt: string;
  // Phase 3B — populated when `?includeEmployee=1`. See Contract.employeeSummary.
  employeeSummary?: EmployeeSummary | null;
  linkStatus?: LinkStatus;
};

export type ImportJobType = 'employees' | 'insurance' | 'contracts';
export type ImportJobStatus = 'queued' | 'running' | 'review' | 'committed' | 'failed';

export type ImportJob = {
  id: string;
  type: ImportJobType;
  filename: string;
  status: ImportJobStatus;
  startedAt: string;
  finishedAt: string | null;
  counts: {
    created: number;
    updated: number;
    skipped: number;
    review: number;
    error: number;
  };
  triggeredBy: string;
};

export type ReviewReason =
  | 'missing_identity'
  | 'duplicate_identity'
  | 'conflicting_employee_number'
  | 'unmatched_contract'
  | 'unmatched_insurance'
  | 'low_confidence_extraction'
  | 'missing_contract_fields'
  // Phase 8 — keep aligned with reviewReasonSchema in shared/api-contract.ts.
  | 'duration_negative'
  | 'unknown_template'
  | 'missing_full_name';

export type ReviewItemEntity = 'employee' | 'contract' | 'insurance';
export type ReviewItemStatus = 'open' | 'resolved' | 'dismissed';

export type ReviewItem = {
  id: string;
  reason: ReviewReason;
  entity: ReviewItemEntity;
  description: string;
  details: string;
  createdAt: string;
  status: ReviewItemStatus;
  importJobId?: string;
};

export type AuditStatus = 'ok' | 'warning' | 'error';

export type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  status: AuditStatus;
  details?: string;
};

export type SourceFile = {
  hash: string;
  filename: string;
  type: 'xlsx' | 'pdf';
  size: number;
  uploadedAt: string;
  importJobId?: string;
};

// =============================================================================
// Employee 360 — Phase 4A.
//
// Two new entities anchored on `employees(id)`:
//
//   EmployeeDocument    — Iqama / passport / visa / etc. with lifecycle
//                          (issued/expires/verified/archived/review).
//   EmployeeTransaction — generic HR ledger row (flight ticket, vacation,
//                          salary adjustment, warning, …) with per-type
//                          structured payload and idempotency-key support.
//
// Plus a computed EmployeeDataQualityReport that aggregates issues across
// all relations and exposes them to the FE for the new "Data Quality" tab.
//
// These types are STRUCTURAL only — no API client or repo here. Repos +
// routes ship in subsequent phases. The shapes are stable enough to commit
// because they map 1:1 to the 0005 schema.
// =============================================================================

/**
 * Stable enum of document types. Adding a new type requires a D1 migration
 * to extend the CHECK constraint, by intent — document categories are rare
 * and structural.
 */
export type EmployeeDocumentType =
  | 'iqama'
  | 'passport'
  | 'visa'
  | 'work_permit'
  | 'contract_pdf'
  | 'insurance_card'
  | 'medical_certificate'
  | 'driving_license'
  | 'other';

/** Lifecycle status — independent of `reviewRequired`. */
export type EmployeeDocumentStatus =
  | 'active'
  | 'expired'
  | 'archived'
  | 'review_required';

export type EmployeeDocument = {
  id: string;
  employeeId: string;
  type: EmployeeDocumentType;
  /** Identifier on the document; nullable until transcribed. NOT a match key. */
  docNumber?: string;
  /** ISO YYYY-MM-DD. */
  issuedAt?: string;
  /** ISO YYYY-MM-DD; drives expiry KPIs on the Dashboard. */
  expiresAt?: string;
  /**
   * Stored workflow state. Set manually by HR (active/archived) or by the
   * import pipeline at commit time. CAN DRIFT — once today crosses the
   * row's `expires_at`, the stored value is no longer the truth. UI and
   * dashboards MUST read `computedStatus` instead. This column is kept
   * for audit + manual workflow transitions.
   */
  status: EmployeeDocumentStatus;
  /**
   * Read-time computed value: the actual status to display today. Derived
   * from (status, isCurrent, reviewRequired, expiresAt, type-required
   * fields) by `computeEmployeeDocumentStatus()` in the worker. ALWAYS
   * use this field for UI badges, dashboard KPIs, and bulk operations.
   * See worker/src/lib/employee-document-status.ts for the canonical
   * logic.
   */
  computedStatus: EmployeeDocumentStatus;
  /** Is this the employee's CURRENT document of its type. Historical = false. */
  isCurrent: boolean;
  /** ISO datetime when an HR-manager confirmed the original. */
  verifiedAt?: string;
  /** Actor email of the verifier. */
  verifiedBy?: string;
  reviewRequired: boolean;
  reviewReason?: string;
  /** 0..1 — when the row was created by a parser/OCR. */
  extractionConfidence?: number;
  /** Pointer into `source_files.hash` (same R2 keyspace as contracts). */
  sourceFileId?: string;
  /** Type-specific extras (issuingCountry, visaClass, …) — JSON. */
  metadata?: Record<string, unknown>;
  notes?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

/**
 * Generic HR transaction. Canonical TYPE list is enforced at the API
 * boundary via zod (not in the D1 schema). Adding a new transaction type
 * is a code change in this file + the zod payload union; no D1 migration.
 */
export type EmployeeTransactionType =
  | 'flight_ticket'
  | 'iqama_renewal'
  | 'visa'
  | 'exit_re_entry'
  | 'vacation'
  | 'salary_adjustment'
  | 'allowance_change'
  | 'warning'
  | 'document_request'
  | 'contract_renewal_request'
  | 'insurance_update'
  | 'training'
  | 'transfer'
  | 'promotion'
  | 'termination'
  | 'medical_claim'
  | 'other';

export type EmployeeTransactionStatus =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type EmployeeTransaction = {
  id: string;
  employeeId: string;
  type: EmployeeTransactionType;
  status: EmployeeTransactionStatus;
  /** Short label visible in lists. */
  title: string;
  effectiveDate?: string;
  endDate?: string;
  amount?: number;
  currency?: string;
  refNumber?: string;
  /** Structured per-type body — schema in `shared/api-contract.ts`. */
  payload?: Record<string, unknown>;
  /** Bumped when the per-type payload schema changes incompatibly. */
  payloadSchemaVersion: number;
  /** Free-form admin extras that don't belong in `payload`. */
  metadata?: Record<string, unknown>;
  sourceFileId?: string;
  reviewRequired: boolean;
  reviewReason?: string;
  /** Optional opaque key for safe re-submission. UNIQUE globally when set. */
  idempotencyKey?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

/**
 * Read-time, computed in the worker — not stored. Surfaces aggregate
 * issues an HR admin should see on the Employee Profile "Data Quality"
 * tab. Each issue is a stable string code; FE renders human-readable
 * labels from a translation map.
 */
export type EmployeeDataQualityIssue =
  | 'missing_date_of_birth'
  | 'missing_nationality'
  | 'missing_hire_date'
  | 'no_current_employee_number'
  | 'iqama_expiring_soon_30d'
  | 'iqama_expired'
  | 'passport_expiring_soon_180d'
  | 'passport_expired'
  | 'no_active_contract'
  | 'no_active_insurance'
  | 'contract_with_quality_flag';

export type EmployeeDataQualityReport = {
  issues: EmployeeDataQualityIssue[];
  /** Open `review_queue` rows that target this employee. */
  reviewItemIds: string[];
};

/**
 * Full Employee 360 detail aggregate returned by GET /api/employees/:id
 * once Phase 4A ships. ADDITIVE: existing consumers see the same
 * `employee/contracts/insurance/audit` fields; new consumers can also
 * use `documents/transactions/dataQuality`.
 */
export type Employee360 = {
  employee: Employee;
  contracts: Contract[];
  insurance: Insurance[];
  documents: EmployeeDocument[];
  transactions: EmployeeTransaction[];
  audit: AuditEvent[];
  /** Computed; only present for admin / hr_manager callers. */
  dataQuality?: EmployeeDataQualityReport;
};

export const reviewReasonLabels: Record<ReviewReason, string> = {
  missing_identity: 'Missing IdentityNumber',
  duplicate_identity: 'Duplicate / conflicting identity',
  conflicting_employee_number: 'Same EmployeeNumber, different IdentityNumber',
  unmatched_contract: 'Contract not matched to a person',
  unmatched_insurance: 'Insurance not matched to a person',
  low_confidence_extraction: 'Low-confidence PDF extraction',
  missing_contract_fields: 'Contract missing required fields',
  // Phase 8 — lifecycle defects caught at import time.
  duration_negative: 'Contract end date before start date',
  unknown_template: 'PDF template not recognised',
  missing_full_name: 'Missing employee full name',
};

// ============================================================================
// Import resolution (Phase 2A: dry-run only)
// ============================================================================

export type ImportResolutionAction = 'create' | 'update' | 'skip' | 'review' | 'error';

export type ImportPreviewItem = {
  rowIndex: number;
  identityNumber: string | null;
  resolvedAction: ImportResolutionAction;
  targetId?: string;
  reason?: string;
  diff?: Record<string, { from: unknown; to: unknown }>;
};

export type ImportCounts = {
  created: number;
  updated: number;
  skipped: number;
  review: number;
  error: number;
};

// ============================================================================
// Phase 6A — HR Configuration foundation.
// Domain types are re-exported from api-contract.ts (single source of truth
// via zod schemas there). This keeps domain.ts as the FE-friendly import
// path while api-contract.ts owns the runtime validation.
// ============================================================================
export type {
  HrOrgUnit, HrOrgUnitNode,
  HrJobTitle, HrTrade, HrGrade, HrPosition,
  HrContractType, HrPayrollComponent,
  HrMedicalProvider, HrMedicalPolicyClass,
  HrDocumentType, HrTransactionType, HrActivityType,
  HrLearningCategory, HrSocialInsuranceRule,
  HrConfigBundle,
  HrOrgUnitCreateRequest, HrOrgUnitPatchRequest,
  HrJobTitleCreateRequest, HrJobTitlePatchRequest,
  HrPositionCreateRequest, HrPositionPatchRequest,
  HrGradeCreateRequest, HrGradePatchRequest,
} from './api-contract';
