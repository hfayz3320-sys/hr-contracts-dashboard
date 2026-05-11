// =============================================================================
// Domain types — mirror the future Cloudflare D1 schema.
// IdentityNumber (Iqama) is the PRIMARY matching key. EmployeeNumber is
// secondary/history only — one person can have multiple over time.
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

// Phase 3B — compact employee snapshot embedded in joined responses.
// See worker/src/db/employee-summary.ts for the server-side builder.
export type EmployeeSummary = {
  id: string;
  fullName: string;
  employeeNumber: string | null;
  /** First-two + masked + last-two digits, e.g. `12xxxxx34`. */
  identityNumberRedacted: string;
  department: string | null;
  jobTitle: string | null;
};

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
  // Populated when the endpoint is hit with `?includeEmployee=1`.
  employeeSummary?: EmployeeSummary | null;
  linkStatus?: LinkStatus;
};

export type InsuranceStatus = 'active' | 'expired' | 'missing';

export type Insurance = {
  id: string;
  employeeId?: string;
  identityNumber?: IdentityNumber;
  policyNumber: string;
  /**
   * Member/card number — group policies share one policyNumber across many
   * employees; memberNumber (e.g. BupaID) disambiguates them.
   */
  memberNumber?: string | null;
  provider: string;
  startDate: string;
  endDate: string | null;
  status: InsuranceStatus;
  matched: boolean;
  unmatchedReason?: 'no_identity_match' | 'no_employee_number_match' | 'name_only';
  createdAt: string;
  // Populated when the endpoint is hit with `?includeEmployee=1`.
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
  | 'missing_contract_fields';

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
  missing_contract_fields: 'Contract missing dates / type / file',
};
