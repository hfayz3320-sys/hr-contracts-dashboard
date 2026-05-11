// =============================================================================
// API contract — zod schemas + inferred types. Single source of truth shared
// by the Vite frontend and the Cloudflare Worker. Both sides validate against
// these schemas at the boundary, so type-level and runtime checks never drift.
// =============================================================================
import { z } from 'zod';

// ---------- shared atoms ---------------------------------------------------

export const employeeStatusSchema = z.enum(['active', 'inactive']);
export const contractStatusSchema = z.enum(['active', 'expiring', 'expired']);
export const insuranceStatusSchema = z.enum(['active', 'expired', 'missing']);
export const importJobTypeSchema = z.enum(['employees', 'insurance', 'contracts']);
export const importJobStatusSchema = z.enum(['queued', 'running', 'review', 'committed', 'failed']);
export const reviewReasonSchema = z.enum([
  'missing_identity',
  'duplicate_identity',
  'conflicting_employee_number',
  'unmatched_contract',
  'unmatched_insurance',
  'low_confidence_extraction',
  'missing_contract_fields',
]);
export const reviewEntitySchema = z.enum(['employee', 'contract', 'insurance']);
export const reviewStatusSchema = z.enum(['open', 'resolved', 'dismissed']);
export const auditStatusSchema = z.enum(['ok', 'warning', 'error']);
export const importActionSchema = z.enum(['create', 'update', 'skip', 'review', 'error']);

// ---------- entity schemas -------------------------------------------------

export const employeeNumberHistoryEntrySchema = z.object({
  number: z.string(),
  from: z.string(),
  to: z.string().nullable(),
});

export const employeeSchema = z.object({
  id: z.string(),
  identityNumber: z.string(),
  fullName: z.string(),
  fullNameArabic: z.string().optional(),
  employeeNumberHistory: z.array(employeeNumberHistoryEntrySchema),
  department: z.string().optional(),
  jobTitle: z.string().optional(),
  nationality: z.string().optional(),
  dateOfBirth: z.string().optional(),
  hireDate: z.string().optional(),
  status: employeeStatusSchema,
  sourceFiles: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Phase 3B — compact employee snapshot embedded in joined responses.
// `identityNumberRedacted` is always masked (first2 + xxx + last2). Full
// identity goes only through the per-employee detail endpoint to admins.
export const employeeSummarySchema = z.object({
  id: z.string(),
  fullName: z.string(),
  employeeNumber: z.string().nullable(),
  identityNumberRedacted: z.string(),
  department: z.string().nullable(),
  jobTitle: z.string().nullable(),
});
export const linkStatusSchema = z.enum(['linked', 'unmatched']);

// Phase 3D — read-time data-quality flag for contracts. See
// `worker/src/lib/contract-quality.ts` for the canonical predicate.
export const contractDataQualityIssueSchema = z.enum([
  'duration_negative',
  'duration_over_3_years',
  'duration_under_30_days',
  'start_date_missing',
  'end_date_missing',
]);

export const contractSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  identityNumber: z.string(),
  contractType: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  status: contractStatusSchema,
  version: z.number().int().positive(),
  versionOf: z.string().optional(),
  fileHash: z.string(),
  filename: z.string(),
  // Phase 2D safety: confidence is REAL-typed in D1 and can legitimately
  // come back as a small float ≈1.0 with rounding error. Loosen the bound
  // so a value like 1.0000000001 doesn't fail the entire response. Values
  // significantly outside [0,1] are caught and reported by the schema-
  // health probe in /api/debug/counts instead.
  extractionConfidence: z.number().min(-0.001).max(1.001).optional(),
  notes: z.string().optional(),
  createdAt: z.string(),
  employeeSummary: employeeSummarySchema.nullable().optional(),
  linkStatus: linkStatusSchema.optional(),
  dataQualityIssue: contractDataQualityIssueSchema.optional(),
});

export const insuranceSchema = z.object({
  id: z.string(),
  employeeId: z.string().optional(),
  identityNumber: z.string().optional(),
  policyNumber: z.string(),
  memberNumber: z.string().optional(),
  provider: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  status: insuranceStatusSchema,
  matched: z.boolean(),
  unmatchedReason: z
    .enum(['no_identity_match', 'no_employee_number_match', 'name_only'])
    .optional(),
  createdAt: z.string(),
  employeeSummary: employeeSummarySchema.nullable().optional(),
  linkStatus: linkStatusSchema.optional(),
});

export const importJobSchema = z.object({
  id: z.string(),
  type: importJobTypeSchema,
  filename: z.string(),
  status: importJobStatusSchema,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  counts: z.object({
    created: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    review: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
  }),
  triggeredBy: z.string(),
});

export const reviewItemSchema = z.object({
  id: z.string(),
  reason: reviewReasonSchema,
  entity: reviewEntitySchema,
  description: z.string(),
  details: z.string(),
  createdAt: z.string(),
  status: reviewStatusSchema,
  importJobId: z.string().optional(),
});

export const auditEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  actor: z.string(),
  action: z.string(),
  target: z.string(),
  status: auditStatusSchema,
  details: z.string().optional(),
});

export const sourceFileSchema = z.object({
  hash: z.string(),
  filename: z.string(),
  type: z.enum(['xlsx', 'pdf']),
  size: z.number().int().nonnegative(),
  uploadedAt: z.string(),
  importJobId: z.string().optional(),
});

// ---------- list/page wrapper ----------------------------------------------

export const listResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
  });

// ---------- endpoints ------------------------------------------------------

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  version: z.string(),
  db: z.enum(['reachable', 'unreachable']),
  synthetic: z.boolean(),
  environment: z.string().optional(),
  r2: z.enum(['reachable', 'unreachable']).optional(),
  cfAccess: z.enum(['configured', 'not-configured']).optional(),
});

export const appUserRoleSchema = z.enum(['admin', 'hr_manager', 'viewer', 'disabled']);
export const appUserStatusSchema = z.enum(['active', 'disabled']);

export const meResponseSchema = z.object({
  email: z.string().email(),
  displayName: z.string(),
  role: appUserRoleSchema,
  isAdmin: z.boolean(),
  status: appUserStatusSchema,
  authProvider: z.literal('cloudflare_access'),
  lastLoginAt: z.string().nullable(),
});

export const appUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  role: appUserRoleSchema,
  status: appUserStatusSchema,
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string(),
});

export const appUsersListResponse = z.object({
  items: z.array(appUserSchema),
  total: z.number().int().nonnegative(),
});

export const employeesListResponse = listResponseSchema(employeeSchema);
export const employeeDetailResponse = z.object({
  employee: employeeSchema,
  contracts: z.array(contractSchema),
  insurance: z.array(insuranceSchema),
  audit: z.array(auditEventSchema),
});

export const contractsListResponse = listResponseSchema(contractSchema);
export const insuranceListResponse = listResponseSchema(insuranceSchema);
export const importJobsListResponse = listResponseSchema(importJobSchema);
export const reviewQueueListResponse = listResponseSchema(reviewItemSchema);
export const auditEventsListResponse = listResponseSchema(auditEventSchema);
export const sourceFilesListResponse = listResponseSchema(sourceFileSchema);

// ---------- import: upload / dry-run / commit ------------------------------

export const importPreviewItemSchema = z.object({
  rowIndex: z.number().int().nonnegative(),
  identityNumber: z.string().nullable(),
  resolvedAction: importActionSchema,
  targetId: z.string().optional(),
  reason: z.string().optional(),
  diff: z.record(z.object({ from: z.unknown(), to: z.unknown() })).optional(),
});

export const importJobItemSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  rowIndex: z.number().int(),
  identityNumber: z.string().nullable(),
  resolvedAction: importActionSchema.nullable(),
  targetId: z.string().nullable(),
  reason: z.string().nullable(),
  diff: z.record(z.object({ from: z.unknown(), to: z.unknown() })).nullable(),
  rawPayload: z.record(z.unknown()),
  committedAction: z.string().nullable(),
  committedAt: z.string().nullable(),
  committedTargetId: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

export const importJobItemsResponse = z.object({
  jobId: z.string(),
  items: z.array(importJobItemSchema),
});

export const importJobDetailResponse = z.object({
  job: importJobSchema.extend({
    sourceHash: z.string().nullable(),
    committedAt: z.string().nullable(),
    committedBy: z.string().nullable(),
  }),
});

// upload — pre-flight registration of a parsed file (rows are NOT sent here)
export const importUploadRequest = z.object({
  type: importJobTypeSchema,
  filename: z.string().min(1),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/i, 'expected sha256 hex'),
  fileSize: z.number().int().nonnegative(),
});

export const importUploadResponse = z.object({
  jobId: z.string(),
  isDuplicate: z.boolean(),
  sourceFile: sourceFileSchema,
});

// upload-raw — multipart endpoint that stores raw bytes in private R2.
// Worker recomputes the SHA-256 server-side and rejects if the client lied.
export const importUploadRawResponse = z.object({
  jobId: z.string(),
  isDuplicate: z.boolean(),
  sourceFile: sourceFileSchema,
  r2ObjectKey: z.string(),
});

// dry-run — structured rows already parsed in the browser
export const importDryRunRequest = z.object({
  jobId: z.string().optional(),
  type: importJobTypeSchema,
  filename: z.string(),
  fileHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
  rows: z.array(z.record(z.unknown())),
});

export const importDryRunResponse = z.object({
  jobId: z.string(),
  counts: z.object({
    created: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    review: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
  }),
  items: z.array(importPreviewItemSchema),
});

export const importCommitRequest = z.object({
  jobId: z.string().min(1),
});

export const importCommitResponse = z.object({
  jobId: z.string(),
  status: z.enum(['committed', 'failed']),
  counts: z.object({
    created: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    review: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
  }),
  alreadyCommitted: z.boolean(),
});

// ---------- review queue resolution ----------------------------------------

export const reviewResolveRequest = z.object({
  resolution: z.enum(['accept_create', 'accept_update', 'link_to_existing']),
  linkedEmployeeId: z.string().optional(),
  note: z.string().optional(),
});

export const reviewDismissRequest = z.object({
  reason: z.string().optional(),
});

export const reviewActionResponse = z.object({
  id: z.string(),
  status: reviewStatusSchema,
});

// ---------- entity PATCH (edit) schemas ------------------------------------

export const employeePatchRequest = z.object({
  fullName: z.string().min(1).optional(),
  fullNameArabic: z.string().nullable().optional(),
  identityNumber: z.string().min(5).optional(),
  employeeNumber: z.string().nullable().optional(),
  nationality: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  hireDate: z.string().nullable().optional(),
  status: employeeStatusSchema.optional(),
});
export const employeePatchResponse = z.object({
  ok: z.literal(true),
  employee: employeeSchema,
});

export const insurancePatchRequest = z.object({
  identityNumber: z.string().nullable().optional(),
  policyNumber: z.string().min(1).optional(),
  memberNumber: z.string().nullable().optional(),
  provider: z.string().min(1).optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  status: insuranceStatusSchema.optional(),
});
export const insurancePatchResponse = z.object({
  ok: z.literal(true),
  insurance: insuranceSchema,
});

export const contractPatchRequest = z.object({
  identityNumber: z.string().optional(),
  contractType: z.string().min(1).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: contractStatusSchema.optional(),
  notes: z.string().nullable().optional(),
});
export const contractPatchResponse = z.object({
  ok: z.literal(true),
  contract: contractSchema,
});

// ---------- Users CRUD ------------------------------------------------------

export const appUserCreateRequest = z.object({
  email: z.string().email(),
  displayName: z.string().nullable().optional(),
  role: appUserRoleSchema,
});
export const appUserPatchRequest = z.object({
  displayName: z.string().nullable().optional(),
  role: appUserRoleSchema.optional(),
  status: appUserStatusSchema.optional(),
});
export const appUserPatchResponse = z.object({
  ok: z.literal(true),
  user: appUserSchema,
});
export const appUserDeactivateRequest = z.object({
  reason: z.string().optional(),
});

// ---------- Review approve / reject -----------------------------------------

export const reviewApproveRequest = z.object({
  /**
   * Corrected entity field values supplied by the admin. Shape varies by
   * the review item's entity type — we accept an open record and the
   * worker validates per-entity.
   */
  correctedFields: z.record(z.unknown()),
  /** Optional human note retained on the resolution record. */
  note: z.string().optional(),
});
export const reviewRejectRequest = z.object({
  reason: z.string().min(2, 'Reject reason is required'),
});

// ---------- /api/debug/counts (Phase 3A — admin diagnostics) -----------------

export const debugCountsResponse = z.object({
  ok: z.literal(true),
  at: z.string(),
  db: z.object({
    employees: z.number().int().nonnegative(),
    employeesActive: z.number().int().nonnegative(),
    employeeNumberHistory: z.number().int().nonnegative(),
    contracts: z.number().int().nonnegative(),
    contractsActive: z.number().int().nonnegative(),
    contractsExpired: z.number().int().nonnegative(),
    insurance: z.number().int().nonnegative(),
    insuranceActive: z.number().int().nonnegative(),
    insuranceExpired: z.number().int().nonnegative(),
    insuranceMissing: z.number().int().nonnegative(),
    insuranceLinked: z.number().int().nonnegative(),
    reviewOpen: z.number().int().nonnegative(),
    reviewResolved: z.number().int().nonnegative(),
    reviewDismissed: z.number().int().nonnegative(),
    importJobs: z.number().int().nonnegative(),
    auditEvents: z.number().int().nonnegative(),
    sourceFiles: z.number().int().nonnegative(),
    appUsers: z.number().int().nonnegative(),
  }),
  schemaHealth: z.object({
    employeesMissingIdentity: z.number().int().nonnegative(),
    employeesMissingName: z.number().int().nonnegative(),
    contractsMissingHash: z.number().int().nonnegative(),
    contractsMissingFilename: z.number().int().nonnegative(),
    contractsConfidenceOutOfRange: z.number().int().nonnegative(),
    insuranceMissingPolicyNumber: z.number().int().nonnegative(),
    insuranceMissingStart: z.number().int().nonnegative(),
  }),
});

export type DebugCountsResponse = z.infer<typeof debugCountsResponse>;

// ---------- inferred types -------------------------------------------------

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type AppUser = z.infer<typeof appUserSchema>;
export type AppUsersListResponse = z.infer<typeof appUsersListResponse>;
export type AppUserRole = z.infer<typeof appUserRoleSchema>;
export type AppUserStatus = z.infer<typeof appUserStatusSchema>;
export type EmployeesListResponse = z.infer<typeof employeesListResponse>;
export type EmployeeDetailResponse = z.infer<typeof employeeDetailResponse>;
export type ContractsListResponse = z.infer<typeof contractsListResponse>;
export type InsuranceListResponse = z.infer<typeof insuranceListResponse>;
export type ImportJobsListResponse = z.infer<typeof importJobsListResponse>;
export type ReviewQueueListResponse = z.infer<typeof reviewQueueListResponse>;
export type AuditEventsListResponse = z.infer<typeof auditEventsListResponse>;
export type SourceFilesListResponse = z.infer<typeof sourceFilesListResponse>;
export type ImportUploadRequest = z.infer<typeof importUploadRequest>;
export type ImportUploadResponse = z.infer<typeof importUploadResponse>;
export type ImportUploadRawResponse = z.infer<typeof importUploadRawResponse>;
export type ImportDryRunRequest = z.infer<typeof importDryRunRequest>;
export type ImportDryRunResponse = z.infer<typeof importDryRunResponse>;
export type ImportCommitRequest = z.infer<typeof importCommitRequest>;
export type ImportCommitResponse = z.infer<typeof importCommitResponse>;
export type ImportJobDetailResponse = z.infer<typeof importJobDetailResponse>;
export type ImportJobItemsResponse = z.infer<typeof importJobItemsResponse>;
export type ImportJobItem = z.infer<typeof importJobItemSchema>;
export type ReviewResolveRequest = z.infer<typeof reviewResolveRequest>;
export type ReviewDismissRequest = z.infer<typeof reviewDismissRequest>;
export type ReviewActionResponse = z.infer<typeof reviewActionResponse>;
export type EmployeePatchRequest  = z.infer<typeof employeePatchRequest>;
export type EmployeePatchResponse = z.infer<typeof employeePatchResponse>;
export type InsurancePatchRequest  = z.infer<typeof insurancePatchRequest>;
export type InsurancePatchResponse = z.infer<typeof insurancePatchResponse>;
export type ContractPatchRequest  = z.infer<typeof contractPatchRequest>;
export type ContractPatchResponse = z.infer<typeof contractPatchResponse>;
export type AppUserCreateRequest    = z.infer<typeof appUserCreateRequest>;
export type AppUserPatchRequest     = z.infer<typeof appUserPatchRequest>;
export type AppUserPatchResponse    = z.infer<typeof appUserPatchResponse>;
export type AppUserDeactivateRequest = z.infer<typeof appUserDeactivateRequest>;
export type ReviewApproveRequest    = z.infer<typeof reviewApproveRequest>;
export type ReviewRejectRequest     = z.infer<typeof reviewRejectRequest>;

// ---------- endpoint catalogue ---------------------------------------------

export const API_PATHS = {
  health: '/api/health',
  me: '/api/me',
  users: '/api/users',
  user: (id: string) => `/api/users/${encodeURIComponent(id)}`,
  userDisable: (id: string) => `/api/users/${encodeURIComponent(id)}/disable`,
  userEnable: (id: string) => `/api/users/${encodeURIComponent(id)}/enable`,
  employees: '/api/employees',
  employee: (id: string) => `/api/employees/${encodeURIComponent(id)}`,
  contracts: '/api/contracts',
  insurance: '/api/insurance',
  importJobs: '/api/import-jobs',
  importJob: (id: string) => `/api/import-jobs/${encodeURIComponent(id)}`,
  importJobItems: (id: string) => `/api/import-jobs/${encodeURIComponent(id)}/items`,
  reviewQueue: '/api/review-queue',
  reviewResolve: (id: string) => `/api/review-queue/${encodeURIComponent(id)}/resolve`,
  reviewDismiss: (id: string) => `/api/review-queue/${encodeURIComponent(id)}/dismiss`,
  auditEvents: '/api/audit-events',
  sourceFiles: '/api/source-files',
  importsUpload: '/api/imports/upload',
  importsUploadRaw: '/api/imports/upload-raw',
  importsDryRun: '/api/imports/dry-run',
  importsCommit: '/api/imports/commit',
  // Phase 2D — entity PATCH endpoints (admin-only).
  employeePatch: (id: string) => `/api/employees/${encodeURIComponent(id)}`,
  insurancePatch: (id: string) => `/api/insurance/${encodeURIComponent(id)}`,
  contractPatch: (id: string) => `/api/contracts/${encodeURIComponent(id)}`,
  // Phase 2E — Users CRUD (admin-only) and Review approve/reject.
  userCreate: '/api/users',
  userPatch: (id: string) => `/api/users/${encodeURIComponent(id)}`,
  userDeactivate: (id: string) => `/api/users/${encodeURIComponent(id)}/deactivate`,
  reviewApprove: (id: string) => `/api/review-queue/${encodeURIComponent(id)}/approve`,
  reviewReject: (id: string) => `/api/review-queue/${encodeURIComponent(id)}/reject`,
  // Phase 3A — admin debug counts.
  debugCounts: '/api/debug/counts',
} as const;
