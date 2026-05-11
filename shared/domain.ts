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
  | 'low_confidence_extraction';

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

export const reviewReasonLabels: Record<ReviewReason, string> = {
  missing_identity: 'Missing IdentityNumber',
  duplicate_identity: 'Duplicate / conflicting identity',
  conflicting_employee_number: 'Same EmployeeNumber, different IdentityNumber',
  unmatched_contract: 'Contract not matched to a person',
  unmatched_insurance: 'Insurance not matched to a person',
  low_confidence_extraction: 'Low-confidence PDF extraction',
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
