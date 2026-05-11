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
