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
  // Phase 8 — explicit reasons for the contract PDF pipeline so the import
  // time enforces the same lifecycle rule as the read-time classifier
  // (`isContractReviewRequired`). Same vocabulary on both sides of the wire.
  'duration_negative',
  'unknown_template',
  'missing_full_name',
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
  // Phase 11 — manual-create form fields. Both nullable.
  mobile: z.string().optional(),
  email: z.string().optional(),
  passportNumber: z.string().optional(),
  notes: z.string().optional(),
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
  // Phase 11 — salary breakdown extracted from the source PDF.
  basicSalary: z.number().nullable().optional(),
  housingAllowance: z.number().nullable().optional(),
  transportAllowance: z.number().nullable().optional(),
  otherAllowances: z
    .array(z.object({ code: z.string(), name: z.string(), amount: z.number() }))
    .optional(),
  totalSalary: z.number().nullable().optional(),
  currency: z.string().optional(),
  contractNumber: z.string().nullable().optional(),
  executionDate: z.string().nullable().optional(),
  passportNumber: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  maritalStatus: z.string().nullable().optional(),
  birthDate: z.string().nullable().optional(),
  occupation: z.string().nullable().optional(),
  workLocation: z.string().nullable().optional(),
  mobile: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  bankName: z.string().nullable().optional(),
  iban: z.string().nullable().optional(),
  educationLevel: z.string().nullable().optional(),
  speciality: z.string().nullable().optional(),
  extractionWarnings: z.array(z.string()).optional(),
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
  memberNumber: z.string().nullable().optional(),
  memberName: z.string().nullable().optional(),
  provider: z.string(),
  planClass: z.string().nullable().optional(),
  nationality: z.string().nullable().optional(),
  reviewFlags: z.array(z.string()).nullable().optional(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  status: insuranceStatusSchema,
  matched: z.boolean(),
  sourceFile: z.string().nullable().optional(),
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
  // Phase 10 — link this app_users row to an employee row. Null when the
  // user is a standalone admin (no matching employee record).
  employeeId: z.string().nullable().optional(),
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
  // Phase 11 — user edits from the review screen, merged over rawPayload
  // at commit time. `null` means no edits yet.
  correctedPayload: z.record(z.unknown()).nullable().optional(),
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

/**
 * Phase 11 — per-item correction edit before commit.
 *
 * The contract import wizard now stages every row in `import_job_items`,
 * lets the admin edit extracted fields in the review screen, and only
 * applies the corrected values on commit. The PATCH endpoint stores the
 * full corrected row as a JSON object on `import_job_items.corrected_payload`.
 *
 * Free-form so the FE doesn't have to enumerate every contract field; the
 * commit pipeline merges `corrected_payload` over `raw_payload`. The dry-
 * run resolver is re-run on PATCH so the row's `resolved_action`/`reason`
 * also reflect the edits (e.g. a missing identity that the user filled
 * in changes the row from 'review' to 'create').
 */
export const importJobItemPatchRequest = z.object({
  corrections: z.record(z.unknown()),
});
export const importJobItemPatchResponse = z.object({
  ok: z.literal(true),
  item: z.unknown(), // intentionally loose — see importJobItemSchema in the
                     // existing response; reusing it would require a forward
                     // declaration we don't want here.
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
  // Phase 11 — manual-create form fields.
  mobile: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * Phase 11 — manual employee creation form.
 *
 * UPSERT behaviour on the server:
 *   - `identityNumber` is the only matching key.
 *   - If a row already exists for that identity, the response carries
 *     `existing: true` plus the existing employee. The UI's role is to
 *     redirect the user to the existing profile rather than creating a
 *     duplicate; no field on the existing row is changed.
 *   - If no row exists, a new one is inserted and `existing: false` is
 *     returned. Audit row uses `employee.manual_create`.
 */
export const employeeManualCreateRequest = z.object({
  identityNumber: z.string().min(5),
  fullNameArabic: z.string().nullable().optional(),
  fullName: z.string().nullable().optional(),
  employeeNumber: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  mobile: z.string().nullable().optional(),
  nationality: z.string().nullable().optional(),
  status: employeeStatusSchema.optional(),
  notes: z.string().nullable().optional(),
});
export const employeeManualCreateResponse = z.object({
  ok: z.literal(true),
  existing: z.boolean(),
  employee: employeeSchema,
});
export const employeePatchResponse = z.object({
  ok: z.literal(true),
  employee: employeeSchema,
});

export const insurancePatchRequest = z.object({
  identityNumber: z.string().nullable().optional(),
  policyNumber: z.string().min(1).optional(),
  memberNumber: z.string().nullable().optional(),
  memberName: z.string().nullable().optional(),
  provider: z.string().min(1).optional(),
  planClass: z.string().nullable().optional(),
  nationality: z.string().nullable().optional(),
  reviewFlags: z.array(z.string()).nullable().optional(),
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
  employeeId: z.string().optional(),
  contractType: z.string().min(1).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: contractStatusSchema.optional(),
  notes: z.string().nullable().optional(),
  basicSalary: z.number().nullable().optional(),
  housingAllowance: z.number().nullable().optional(),
  transportAllowance: z.number().nullable().optional(),
  totalSalary: z.number().nullable().optional(),
  mobile: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  bankName: z.string().nullable().optional(),
  iban: z.string().nullable().optional(),
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
  // Phase 10 — optional FK to employees(id). When supplied, the worker
  // writes it to app_users.employee_id so the app_users row becomes the
  // queryable link target for "this employee's user account".
  employeeId: z.string().nullable().optional(),
});
export const appUserPatchRequest = z.object({
  displayName: z.string().nullable().optional(),
  role: appUserRoleSchema.optional(),
  status: appUserStatusSchema.optional(),
  // Allow re-linking / un-linking an app_users row to an employee.
  employeeId: z.string().nullable().optional(),
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

// =============================================================================
// Phase 4A — Employee 360 contracts.
//
// Two new resources hanging off /api/employees/:id:
//
//   GET    /api/employees/:id/documents
//   POST   /api/employees/:id/documents
//   PATCH  /api/employees/:id/documents/:docId
//   DELETE /api/employees/:id/documents/:docId
//
//   GET    /api/employees/:id/transactions
//   POST   /api/employees/:id/transactions
//   PATCH  /api/employees/:id/transactions/:txnId
//   DELETE /api/employees/:id/transactions/:txnId
//
// And the existing GET /api/employees/:id is extended ADDITIVELY to
// include `documents`, `transactions`, and `dataQuality` fields. Older
// callers still receive `employee/contracts/insurance/audit` unchanged.
// =============================================================================

export const employeeDocumentTypeSchema = z.enum([
  'iqama', 'passport', 'visa', 'work_permit',
  'contract_pdf', 'insurance_card',
  'medical_certificate', 'driving_license', 'other',
]);
export const employeeDocumentStatusSchema = z.enum([
  'active', 'expired', 'archived', 'review_required',
]);

/**
 * EmployeeDocument response shape.
 *
 * Phase 4A patch: `status` is the stored workflow state (set manually by
 * HR or by import). `computedStatus` is the read-time value derived in
 * the worker by `computeEmployeeDocumentStatus()`. Dashboards / UI /
 * bulk operations MUST read `computedStatus`. The stored `status` is
 * preserved for audit + manual transition workflows (e.g. archive
 * button writes status='archived'; the next read recomputes and likely
 * agrees).
 */
export const employeeDocumentSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  type: employeeDocumentTypeSchema,
  docNumber: z.string().optional(),
  issuedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  status: employeeDocumentStatusSchema,
  computedStatus: employeeDocumentStatusSchema,
  isCurrent: z.boolean(),
  verifiedAt: z.string().optional(),
  verifiedBy: z.string().optional(),
  reviewRequired: z.boolean(),
  reviewReason: z.string().optional(),
  extractionConfidence: z.number().min(-0.001).max(1.001).optional(),
  sourceFileId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  notes: z.string().optional(),
  createdAt: z.string(),
  createdBy: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string(),
});

export const employeeDocumentsListResponse = listResponseSchema(employeeDocumentSchema);

// PATCH input — every field optional. type/employeeId cannot be changed
// after creation (would invalidate the partial unique index and break
// audit lineage). doc_number can be added/updated freely.
export const employeeDocumentCreateRequest = z.object({
  type: employeeDocumentTypeSchema,
  docNumber: z.string().nullable().optional(),
  issuedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  status: employeeDocumentStatusSchema.optional(),
  isCurrent: z.boolean().optional(),
  reviewRequired: z.boolean().optional(),
  reviewReason: z.string().nullable().optional(),
  sourceFileId: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  notes: z.string().nullable().optional(),
});
export const employeeDocumentPatchRequest = z.object({
  docNumber: z.string().nullable().optional(),
  issuedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  status: employeeDocumentStatusSchema.optional(),
  isCurrent: z.boolean().optional(),
  verifiedAt: z.string().nullable().optional(),
  verifiedBy: z.string().nullable().optional(),
  reviewRequired: z.boolean().optional(),
  reviewReason: z.string().nullable().optional(),
  sourceFileId: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  notes: z.string().nullable().optional(),
});
export const employeeDocumentResponse = z.object({
  ok: z.literal(true),
  document: employeeDocumentSchema,
});

/**
 * Phase 10 — multipart upload response.
 * The endpoint accepts `multipart/form-data` with fields:
 *   - file        : binary
 *   - type        : EmployeeDocumentType
 *   - expiresAt   : optional YYYY-MM-DD
 *   - docNumber   : optional
 *   - status      : optional (defaults to 'active')
 *   - isCurrent   : optional 'true' | 'false' string (defaults true)
 *   - notes       : optional
 *
 * The Worker hashes the file server-side, persists it to the private R2
 * bucket at `employees/<empId>/<docId>/<filename>`, and writes the
 * `employee_documents` row + a `source_files` row pointing at the R2
 * object. The response includes the stored document and the R2 key so the
 * FE can confirm the file lives in a private path (never `public/...`).
 */
export const employeeDocumentUploadResponse = z.object({
  ok: z.literal(true),
  document: employeeDocumentSchema,
  r2ObjectKey: z.string(),
  sourceFileId: z.string(),
});

// ---- Transactions ----------------------------------------------------------

/**
 * Canonical transaction-type enum, enforced at the API boundary even though
 * the D1 column is free-form TEXT. Mirrors `EmployeeTransactionType`. The
 * test suite asserts this list equals `EmployeeTransactionType` so a
 * canonical-list typo fails CI.
 */
export const employeeTransactionTypeSchema = z.enum([
  'flight_ticket',
  'iqama_renewal',
  'visa',
  'exit_re_entry',
  'vacation',
  'salary_adjustment',
  'allowance_change',
  'warning',
  'document_request',
  'contract_renewal_request',
  'insurance_update',
  'training',
  'transfer',
  'promotion',
  'termination',
  'medical_claim',
  'other',
]);

export const employeeTransactionStatusSchema = z.enum([
  'requested', 'approved', 'rejected',
  'in_progress', 'completed', 'cancelled',
]);

// ---- per-type payload schemas ----------------------------------------------
// Each payload is a permissive object that captures the minimum required
// fields. `passthrough` lets us roll forward to additional optional fields
// without breaking historic rows. Strict `omit/extend` lives in tests.

const flightTicketPayload = z
  .object({
    from: z.string().min(2),
    to: z.string().min(2),
    airline: z.string().optional(),
    pnr: z.string().optional(),
    classOfService: z.enum(['economy', 'business', 'first']).optional(),
    isReturn: z.boolean().optional(),
  })
  .passthrough();

const vacationPayload = z
  .object({
    days: z.number().int().positive(),
    balanceBefore: z.number().int().nonnegative().optional(),
    balanceAfter: z.number().int().nonnegative().optional(),
    reason: z.string().optional(),
  })
  .passthrough();

const salaryAdjustmentPayload = z
  .object({
    reason: z.string(),
    oldBasic: z.number().nonnegative(),
    newBasic: z.number().nonnegative(),
    effectiveContractId: z.string().optional(),
  })
  .passthrough();

const warningPayload = z
  .object({
    level: z.enum(['verbal', 'written_1st', 'written_2nd', 'final']),
    reason: z.string(),
  })
  .passthrough();

const documentRequestPayload = z
  .object({
    requestedDocType: employeeDocumentTypeSchema,
    requestedFor: z.string().optional(), // 'embassy', 'bank', etc.
  })
  .passthrough();

const iqamaRenewalPayload = z
  .object({
    oldIqamaNumber: z.string().optional(),
    newIqamaNumber: z.string().optional(),
    fee: z.number().nonnegative().optional(),
    newExpiresAt: z.string().optional(),
  })
  .passthrough();

/**
 * Open fallback for types whose payload contract hasn't been specified
 * yet, or for `other`. `record(z.unknown())` accepts any object.
 */
const openPayload = z.record(z.unknown());

/**
 * Dispatch payload-validator by `type`. Unknown / unspecified types fall
 * through to `openPayload`. CREATE requests with strict canonical types
 * use this; PATCH only validates whatever fields the caller supplies.
 */
export function payloadSchemaForType(type: string): z.ZodTypeAny {
  switch (type) {
    case 'flight_ticket':       return flightTicketPayload;
    case 'vacation':            return vacationPayload;
    case 'salary_adjustment':   return salaryAdjustmentPayload;
    case 'warning':             return warningPayload;
    case 'document_request':    return documentRequestPayload;
    case 'iqama_renewal':       return iqamaRenewalPayload;
    default:                    return openPayload;
  }
}

export const employeeTransactionSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  type: employeeTransactionTypeSchema,
  status: employeeTransactionStatusSchema,
  title: z.string(),
  effectiveDate: z.string().optional(),
  endDate: z.string().optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  refNumber: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  payloadSchemaVersion: z.number().int().positive(),
  metadata: z.record(z.unknown()).optional(),
  sourceFileId: z.string().optional(),
  reviewRequired: z.boolean(),
  reviewReason: z.string().optional(),
  idempotencyKey: z.string().optional(),
  createdAt: z.string(),
  createdBy: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string(),
});

export const employeeTransactionsListResponse = listResponseSchema(employeeTransactionSchema);

/**
 * employeeTransactionCreateRequest — idempotency contract
 * --------------------------------------------------------
 *
 * `idempotencyKey` is OPTIONAL.
 *
 *   1. NULL / omitted          → every request creates a NEW row. D1's
 *                                 `UNIQUE` constraint on the column treats
 *                                 multiple NULLs as distinct, so this is
 *                                 always allowed.
 *
 *   2. Same key + same body    → API returns the EXISTING row with
 *                                 HTTP 200. The route handler MUST look
 *                                 up the row by key, hash the canonical
 *                                 subset of the request, and compare.
 *                                 Producers that re-submit a transient
 *                                 failure get exactly-once semantics.
 *
 *   3. Same key + different    → API returns HTTP 409 Conflict with the
 *      body                       existing row in the response body so
 *                                 the producer can decide (retry with a
 *                                 new key vs. reconcile). The stored
 *                                 row is NOT updated.
 *
 * "Same body" — the canonical subset:
 *   type, status, title, effectiveDate, endDate, amount, currency,
 *   refNumber, payload, payloadSchemaVersion, sourceFileId,
 *   reviewRequired, reviewReason
 *
 * Fields excluded from the equality check:
 *   metadata (free-form admin tags), idempotencyKey itself, createdBy,
 *   updatedBy, createdAt, updatedAt.
 *
 * The hash function lives in `worker/src/lib/idempotency.ts` (NOT in
 * A1; ships in A2). This zod schema is the source-of-truth for which
 * fields are part of the comparison.
 */
export const employeeTransactionCreateRequest = z.object({
  type: employeeTransactionTypeSchema,
  status: employeeTransactionStatusSchema.optional(),
  title: z.string().min(1),
  effectiveDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  refNumber: z.string().nullable().optional(),
  payload: z.record(z.unknown()).optional(),
  payloadSchemaVersion: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
  sourceFileId: z.string().nullable().optional(),
  reviewRequired: z.boolean().optional(),
  reviewReason: z.string().nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),
});

/**
 * Canonical subset of `employeeTransactionCreateRequest` that participates
 * in the idempotency equality check. Exported separately so the worker
 * route can hash exactly these fields and tests can assert on the same
 * list. Drift between this schema and the equality predicate is what
 * we want to make hard.
 */
export const employeeTransactionIdempotencyEqualityKeys = [
  'type',
  'status',
  'title',
  'effectiveDate',
  'endDate',
  'amount',
  'currency',
  'refNumber',
  'payload',
  'payloadSchemaVersion',
  'sourceFileId',
  'reviewRequired',
  'reviewReason',
] as const;
export type EmployeeTransactionIdempotencyEqualityKey =
  typeof employeeTransactionIdempotencyEqualityKeys[number];

export const employeeTransactionPatchRequest = z.object({
  status: employeeTransactionStatusSchema.optional(),
  title: z.string().min(1).optional(),
  effectiveDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  refNumber: z.string().nullable().optional(),
  payload: z.record(z.unknown()).optional(),
  payloadSchemaVersion: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
  sourceFileId: z.string().nullable().optional(),
  reviewRequired: z.boolean().optional(),
  reviewReason: z.string().nullable().optional(),
});

export const employeeTransactionResponse = z.object({
  ok: z.literal(true),
  transaction: employeeTransactionSchema,
});

// ---- Data quality ----------------------------------------------------------

export const employeeDataQualityIssueSchema = z.enum([
  'missing_date_of_birth',
  'missing_nationality',
  'missing_hire_date',
  'no_current_employee_number',
  'iqama_expiring_soon_30d',
  'iqama_expired',
  'passport_expiring_soon_180d',
  'passport_expired',
  'no_active_contract',
  'no_active_insurance',
  'contract_with_quality_flag',
]);

export const employeeDataQualityReportSchema = z.object({
  issues: z.array(employeeDataQualityIssueSchema),
  reviewItemIds: z.array(z.string()),
});

// ---- Employee 360 extension ------------------------------------------------

// =========================================================================
// Phase 10 — Employee 360 actions
// =========================================================================

// ---- timeline entries (messages + notes) ---------------------------------
export const employeeTimelineEntryTypeSchema = z.enum(['message', 'note']);
export const employeeTimelineEntrySchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  entryType: employeeTimelineEntryTypeSchema,
  body: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string(),
});
export const employeeTimelineEntryCreateRequest = z.object({
  body: z.string().min(1).max(10_000),
});
/**
 * Response shape for POST /api/employees/:id/{messages,notes}.
 *
 * `replayed` is set when the worker observed an `Idempotency-Key` header
 * that matched a previously-stored row — the returned `entry` is the
 * original row, no new insert happened, no fresh audit row was written.
 * The FE may use the field to suppress the success toast on replay so a
 * stuck user clicking five times only sees one notification.
 */
export const employeeTimelineEntryCreateResponse = z.object({
  ok: z.literal(true),
  entry: employeeTimelineEntrySchema,
  replayed: z.boolean().optional(),
});
export const employeeTimelineListResponse = z.object({
  items: z.array(employeeTimelineEntrySchema),
  total: z.number().int().nonnegative(),
});

// ---- activities ----------------------------------------------------------
export const employeeActivityTypeSchema = z.enum([
  'call', 'meeting', 'review', 'reminder', 'follow_up', 'document_request', 'other',
]);
export const employeeActivityStatusSchema = z.enum(['open', 'done', 'cancelled']);
export const employeeActivitySchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  activityType: employeeActivityTypeSchema,
  title: z.string(),
  description: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  status: employeeActivityStatusSchema,
  assignedTo: z.string().nullable().optional(),
  createdBy: z.string(),
  createdAt: z.string(),
  completedAt: z.string().nullable().optional(),
  updatedAt: z.string(),
  updatedBy: z.string(),
});
export const employeeActivityCreateRequest = z.object({
  activityType: employeeActivityTypeSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(5_000).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  assignedTo: z.string().nullable().optional(),
});
export const employeeActivityPatchRequest = z.object({
  status: employeeActivityStatusSchema.optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5_000).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  assignedTo: z.string().nullable().optional(),
});
export const employeeActivityResponse = z.object({
  ok: z.literal(true),
  activity: employeeActivitySchema,
});
export const employeeActivityListResponse = z.object({
  items: z.array(employeeActivitySchema),
  total: z.number().int().nonnegative(),
});

// ---- compensation lines --------------------------------------------------
export const employeeCompensationFrequencySchema = z.enum(['monthly', 'yearly', 'one_time']);
export const employeeCompensationSourceSchema = z.enum(['manual', 'import', 'contract']);
export const employeeCompensationLineSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  componentCode: z.string(),
  componentName: z.string(),
  amount: z.number(),
  currency: z.string(),
  frequency: employeeCompensationFrequencySchema,
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable().optional(),
  source: employeeCompensationSourceSchema,
  // Phase 11 — set by the import-commit pipeline when this line was
  // derived from a contract row. Null/undefined for `source='manual'`
  // and for pre-migration-0009 rows.
  sourceContractId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string(),
});
export const employeeCompensationCreateRequest = z.object({
  componentCode: z.string().min(1).max(64),
  componentName: z.string().min(1).max(200),
  amount: z.number(),
  currency: z.string().min(1).max(8).default('SAR'),
  frequency: employeeCompensationFrequencySchema.default('monthly'),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().nullable().optional(),
  notes: z.string().max(5_000).nullable().optional(),
});
export const employeeCompensationResponse = z.object({
  ok: z.literal(true),
  line: employeeCompensationLineSchema,
});
export const employeeCompensationListResponse = z.object({
  items: z.array(employeeCompensationLineSchema),
  total: z.number().int().nonnegative(),
});

// ---- learning records ----------------------------------------------------
export const employeeLearningTypeSchema = z.enum(['certification', 'training', 'skill', 'experience']);
export const employeeLearningStatusSchema = z.enum(['active', 'expiring', 'expired', 'archived']);
export const employeeLearningLevelSchema = z.enum(['beginner', 'intermediate', 'expert']);
export const employeeLearningRecordSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  recordType: employeeLearningTypeSchema,
  title: z.string(),
  provider: z.string().nullable().optional(),
  issueDate: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  status: employeeLearningStatusSchema,
  level: employeeLearningLevelSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string(),
});
export const employeeLearningCreateRequest = z.object({
  recordType: employeeLearningTypeSchema,
  title: z.string().min(1).max(300),
  provider: z.string().max(200).nullable().optional(),
  issueDate: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  level: employeeLearningLevelSchema.nullable().optional(),
  notes: z.string().max(5_000).nullable().optional(),
});
export const employeeLearningResponse = z.object({
  ok: z.literal(true),
  record: employeeLearningRecordSchema,
});
export const employeeLearningListResponse = z.object({
  items: z.array(employeeLearningRecordSchema),
  total: z.number().int().nonnegative(),
});

/**
 * The existing `employeeDetailResponse` (employee/contracts/insurance/audit)
 * is preserved verbatim for backward compatibility. Phase 4A adds optional
 * fields on the SAME response when the caller is signed in.
 *
 * Phase 10 — extended with timeline / activities / compensation / learning.
 * Older clients ignore unknown fields (zod .passthrough is not used; clients
 * call .parse which is loose by default in our pipeline).
 */
export const employee360Response = z.object({
  employee: employeeSchema,
  contracts: z.array(contractSchema),
  insurance: z.array(insuranceSchema),
  documents: z.array(employeeDocumentSchema),
  transactions: z.array(employeeTransactionSchema),
  audit: z.array(auditEventSchema),
  dataQuality: employeeDataQualityReportSchema.optional(),
  // Phase 10 additions — always present (possibly empty arrays).
  timeline: z.array(employeeTimelineEntrySchema).optional(),
  activities: z.array(employeeActivitySchema).optional(),
  compensation: z.array(employeeCompensationLineSchema).optional(),
  learning: z.array(employeeLearningRecordSchema).optional(),
  // Phase 10 — the app_users row linked to this employee, or null. Read
  // by the profile to show "Login: alice@example.com (hr_manager)" or
  // "No login" when nothing is linked.
  linkedUser: appUserSchema.nullable().optional(),
  // Phase 11 — server-derived "current" view so the FE doesn't
  // re-implement the lifecycle rules. Null when no contract covers today
  // and no monthly comp line is in effect.
  currentContract: contractSchema.nullable().optional(),
  currentCompensation: z.object({
    currency: z.string(),
    monthlyTotal: z.number(),
    sourceContractId: z.string().nullable(),
    lines: z.array(employeeCompensationLineSchema),
  }).nullable().optional(),
});

export type EmployeeDocument          = z.infer<typeof employeeDocumentSchema>;
export type EmployeeDocumentsListResponse = z.infer<typeof employeeDocumentsListResponse>;
export type EmployeeDocumentCreateRequest = z.infer<typeof employeeDocumentCreateRequest>;
export type EmployeeDocumentPatchRequest  = z.infer<typeof employeeDocumentPatchRequest>;
export type EmployeeDocumentUploadResponse = z.infer<typeof employeeDocumentUploadResponse>;
export type EmployeeTransaction       = z.infer<typeof employeeTransactionSchema>;
export type EmployeeTransactionsListResponse = z.infer<typeof employeeTransactionsListResponse>;
export type EmployeeTransactionCreateRequest = z.infer<typeof employeeTransactionCreateRequest>;
export type EmployeeTransactionPatchRequest  = z.infer<typeof employeeTransactionPatchRequest>;
export type EmployeeDataQualityReport = z.infer<typeof employeeDataQualityReportSchema>;
export type Employee360Response       = z.infer<typeof employee360Response>;

// Phase 10 — Employee 360 actions
export type EmployeeTimelineEntry           = z.infer<typeof employeeTimelineEntrySchema>;
export type EmployeeTimelineEntryCreateRequest = z.infer<typeof employeeTimelineEntryCreateRequest>;
export type EmployeeTimelineListResponse    = z.infer<typeof employeeTimelineListResponse>;
export type EmployeeActivity                = z.infer<typeof employeeActivitySchema>;
export type EmployeeActivityCreateRequest   = z.infer<typeof employeeActivityCreateRequest>;
export type EmployeeActivityPatchRequest    = z.infer<typeof employeeActivityPatchRequest>;
export type EmployeeActivityListResponse    = z.infer<typeof employeeActivityListResponse>;
export type EmployeeCompensationLine        = z.infer<typeof employeeCompensationLineSchema>;
export type EmployeeCompensationCreateRequest = z.infer<typeof employeeCompensationCreateRequest>;
export type EmployeeCompensationListResponse= z.infer<typeof employeeCompensationListResponse>;
export type EmployeeLearningRecord          = z.infer<typeof employeeLearningRecordSchema>;
export type EmployeeLearningCreateRequest   = z.infer<typeof employeeLearningCreateRequest>;
export type EmployeeLearningListResponse    = z.infer<typeof employeeLearningListResponse>;

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
// Phase 11 — manual create + per-item correction.
export type EmployeeManualCreateRequest  = z.infer<typeof employeeManualCreateRequest>;
export type EmployeeManualCreateResponse = z.infer<typeof employeeManualCreateResponse>;
export type ImportJobItemPatchRequest    = z.infer<typeof importJobItemPatchRequest>;

// ============================================================================
// Phase 6A — HR Configuration foundation schemas.
//
// Each config table follows the same row shape:
//   id, code, name, name_ar?, ... config-specific fields,
//   active, displayOrder, createdAt, createdBy, updatedAt, updatedBy.
//
// `code` is the stable business key (UPPER_SNAKE). Seed idempotency, FE
// option lists, and future cross-environment linkage use `code` — NOT `id`.
// Config-to-config FKs use `id` for relational integrity inside the DB.
// ============================================================================

const audited = {
  createdAt: z.string(),
  createdBy: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string(),
} as const;
const configRowBase = z.object({
  id: z.string(),
  code: z.string().min(1).max(64),
  name: z.string().min(1),
  nameAr: z.string().nullable().optional(),
  active: z.boolean(),
  displayOrder: z.number().int(),
  ...audited,
});

// ---- hr_org_units ----------------------------------------------------------
export const hrOrgUnitTypeSchema = z.enum([
  'legal_entity','department','section','unit','site','project',
]);
export const hrOrgUnitSchema = configRowBase.extend({
  type: hrOrgUnitTypeSchema,
  parentId: z.string().nullable(),
  level: z.number().int(),
  managerEmployeeId: z.string().nullable(),
  siteCode: z.string().nullable().optional(),
  projectCode: z.string().nullable().optional(),
});
export const hrOrgUnitNodeSchema: z.ZodType<HrOrgUnitNode> = hrOrgUnitSchema.extend({
  children: z.lazy(() => z.array(hrOrgUnitNodeSchema)),
});
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface HrOrgUnitNode extends z.infer<typeof hrOrgUnitSchema> {
  children: HrOrgUnitNode[];
}

// ---- hr_job_titles ---------------------------------------------------------
export const hrJobTitleSchema = configRowBase.extend({
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

// ---- hr_trades -------------------------------------------------------------
export const hrTradeSchema = configRowBase.extend({
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

// ---- hr_grades -------------------------------------------------------------
export const hrGradeSchema = configRowBase.extend({
  level: z.number().int(),
  salaryBandMin: z.number().nullable().optional(),
  salaryBandMax: z.number().nullable().optional(),
  currency: z.string(),
});

// ---- hr_positions ----------------------------------------------------------
// Positions don't carry a separate `name` — their identity is the `code`
// + the (job_title × org_unit) it references. UI labels are derived.
export const hrPositionSchema = z.object({
  id: z.string(),
  code: z.string().min(1).max(64),
  jobTitleId: z.string(),
  orgUnitId: z.string(),
  gradeId: z.string().nullable(),
  reportsToPositionId: z.string().nullable(),
  headcountAllowed: z.number().int(),
  active: z.boolean(),
  displayOrder: z.number().int(),
  ...audited,
});

// ---- hr_contract_types -----------------------------------------------------
export const hrContractTypeSchema = configRowBase.extend({
  templateCode: z.string().nullable().optional(),
  requiresEndDate: z.boolean(),
  requiresSourcePdf: z.boolean(),
  requiresSalaryAttach: z.boolean(),
  maxRenewals: z.number().int().nullable(),
  defaultTermMonths: z.number().int().nullable(),
});

// ---- hr_payroll_components -------------------------------------------------
export const hrPayrollComponentKindSchema = z.enum([
  'earning','deduction','reimbursement','allowance',
]);
export const hrPayrollComponentSchema = configRowBase.extend({
  kind: hrPayrollComponentKindSchema,
  taxable: z.boolean(),
  includedInGosi: z.boolean(),
  includedInEos: z.boolean(),
  defaultCurrency: z.string(),
});

// ---- hr_medical_providers --------------------------------------------------
export const hrMedicalProviderSchema = configRowBase.extend({
  defaultPolicyYearMonths: z.number().int().nullable(),
  contactPhone: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ---- hr_medical_policy_classes ---------------------------------------------
export const hrMedicalPolicyClassSchema = configRowBase.extend({
  tierLevel: z.number().int(),
  description: z.string().nullable().optional(),
});

// ---- hr_document_types -----------------------------------------------------
export const hrDocumentTypeSchema = configRowBase.extend({
  requiresDocNumber: z.boolean(),
  requiresExpiresAt: z.boolean(),
  requiresSourceFile: z.boolean(),
  allowHistory: z.boolean(),
  defaultReviewRequired: z.boolean(),
  warningBeforeExpiryDays: z.number().int().nullable(),
  description: z.string().nullable().optional(),
});

// ---- hr_transaction_types --------------------------------------------------
export const hrTransactionCategorySchema = z.enum([
  'travel','identity','time_off','compensation','disciplinary',
  'admin','contract','insurance','learning','movement','exit','other',
]);
export const hrAuditSeveritySchema = z.enum(['info','warning','critical']);
export const hrTransactionTypeSchema = configRowBase.extend({
  category: hrTransactionCategorySchema,
  payloadSchemaVersion: z.number().int(),
  requiresDocTypeId: z.string().nullable(),
  defaultReviewRequired: z.boolean(),
  allowedStatuses: z.array(z.string()),
  defaultStatus: z.string(),
  auditSeverity: hrAuditSeveritySchema,
});

// ---- hr_activity_types -----------------------------------------------------
export const hrActivityCategorySchema = z.enum([
  'communication','task','reminder','review','other',
]);
export const hrActivityPrioritySchema = z.enum(['low','normal','high','urgent']);
export const hrActivityTypeSchema = configRowBase.extend({
  category: hrActivityCategorySchema,
  defaultDueDays: z.number().int().nullable(),
  requiresAssignee: z.boolean(),
  defaultPriority: hrActivityPrioritySchema,
});

// ---- hr_learning_categories ------------------------------------------------
export const hrLearningCategorySchema = configRowBase.extend({
  requiresExpiry: z.boolean(),
  requiresIssuer: z.boolean(),
  description: z.string().nullable().optional(),
});

// ---- hr_social_insurance_rules ---------------------------------------------
export const hrSocialInsuranceAppliesToSchema = z.enum(['saudi','non_saudi','any']);
export const hrSocialInsuranceRuleSchema = configRowBase.extend({
  appliesTo: hrSocialInsuranceAppliesToSchema,
  employerRatePct: z.number().nullable(),
  employeeRatePct: z.number().nullable(),
  contributionCapSar: z.number().nullable(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  requiresSourceDoc: z.boolean(),
  notes: z.string().nullable().optional(),
});

// ---- List + bundle responses ----------------------------------------------
function listResp<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item) });
}
export const hrOrgUnitsListResponse           = listResp(hrOrgUnitSchema);
export const hrOrgUnitsTreeResponse           = z.object({ items: z.array(hrOrgUnitNodeSchema) });
export const hrJobTitlesListResponse          = listResp(hrJobTitleSchema);
export const hrPositionsListResponse          = listResp(hrPositionSchema);
export const hrGradesListResponse             = listResp(hrGradeSchema);
export const hrTradesListResponse             = listResp(hrTradeSchema);
export const hrContractTypesListResponse      = listResp(hrContractTypeSchema);
export const hrPayrollComponentsListResponse  = listResp(hrPayrollComponentSchema);
export const hrLearningCategoriesListResponse = listResp(hrLearningCategorySchema);
export const hrMedicalProvidersListResponse   = listResp(hrMedicalProviderSchema);
export const hrMedicalPolicyClassesListResponse = listResp(hrMedicalPolicyClassSchema);
export const hrSocialInsuranceRulesListResponse = listResp(hrSocialInsuranceRuleSchema);
export const hrDocumentTypesListResponse      = listResp(hrDocumentTypeSchema);
export const hrTransactionTypesListResponse   = listResp(hrTransactionTypeSchema);
export const hrActivityTypesListResponse      = listResp(hrActivityTypeSchema);

export const hrConfigBundleResponse = z.object({
  orgUnits:             z.array(hrOrgUnitSchema),
  jobTitles:            z.array(hrJobTitleSchema),
  positions:            z.array(hrPositionSchema),
  grades:               z.array(hrGradeSchema),
  trades:               z.array(hrTradeSchema),
  contractTypes:        z.array(hrContractTypeSchema),
  payrollComponents:    z.array(hrPayrollComponentSchema),
  learningCategories:   z.array(hrLearningCategorySchema),
  medicalProviders:     z.array(hrMedicalProviderSchema),
  medicalPolicyClasses: z.array(hrMedicalPolicyClassSchema),
  socialInsuranceRules: z.array(hrSocialInsuranceRuleSchema),
  documentTypes:        z.array(hrDocumentTypeSchema),
  transactionTypes:     z.array(hrTransactionTypeSchema),
  activityTypes:        z.array(hrActivityTypeSchema),
});

// ---- Create / Patch request schemas ---------------------------------------
// Codes are immutable post-create; the patch schemas omit `code`.
const createBase = { code: z.string().min(2).max(64).regex(/^[A-Z][A-Z0-9_]*$/), name: z.string().min(1) };

export const hrOrgUnitCreateRequest = z.object({
  ...createBase,
  nameAr: z.string().optional(),
  type: hrOrgUnitTypeSchema,
  parentId: z.string().optional().nullable(),
  managerEmployeeId: z.string().optional().nullable(),
  siteCode: z.string().optional().nullable(),
  projectCode: z.string().optional().nullable(),
  displayOrder: z.number().int().optional(),
});
export const hrOrgUnitPatchRequest = hrOrgUnitCreateRequest
  .omit({ code: true })
  .partial()
  .extend({ active: z.boolean().optional() });

export const hrJobTitleCreateRequest = z.object({
  ...createBase,
  nameAr: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  displayOrder: z.number().int().optional(),
});
export const hrJobTitlePatchRequest = hrJobTitleCreateRequest
  .omit({ code: true })
  .partial()
  .extend({ active: z.boolean().optional() });

// Positions create — `code` IS the identifier; no separate name on positions.
export const hrPositionCreateRequest = z.object({
  code: z.string().min(2).max(64).regex(/^[A-Z][A-Z0-9_]*$/),
  jobTitleId: z.string(),
  orgUnitId: z.string(),
  gradeId: z.string().optional().nullable(),
  reportsToPositionId: z.string().optional().nullable(),
  headcountAllowed: z.number().int().min(0).optional(),
  displayOrder: z.number().int().optional(),
});
export const hrPositionPatchRequest = hrPositionCreateRequest
  .omit({ code: true })
  .partial()
  .extend({ active: z.boolean().optional() });

export const hrGradeCreateRequest = z.object({
  ...createBase,
  nameAr: z.string().optional(),
  level: z.number().int(),
  salaryBandMin: z.number().optional().nullable(),
  salaryBandMax: z.number().optional().nullable(),
  currency: z.string().optional(),
  displayOrder: z.number().int().optional(),
});
export const hrGradePatchRequest = hrGradeCreateRequest
  .omit({ code: true })
  .partial()
  .extend({ active: z.boolean().optional() });

// ---- Types ----------------------------------------------------------------
export type HrOrgUnit             = z.infer<typeof hrOrgUnitSchema>;
export type HrJobTitle            = z.infer<typeof hrJobTitleSchema>;
export type HrTrade               = z.infer<typeof hrTradeSchema>;
export type HrGrade               = z.infer<typeof hrGradeSchema>;
export type HrPosition            = z.infer<typeof hrPositionSchema>;
export type HrContractType        = z.infer<typeof hrContractTypeSchema>;
export type HrPayrollComponent    = z.infer<typeof hrPayrollComponentSchema>;
export type HrMedicalProvider     = z.infer<typeof hrMedicalProviderSchema>;
export type HrMedicalPolicyClass  = z.infer<typeof hrMedicalPolicyClassSchema>;
export type HrDocumentType        = z.infer<typeof hrDocumentTypeSchema>;
export type HrTransactionType     = z.infer<typeof hrTransactionTypeSchema>;
export type HrActivityType        = z.infer<typeof hrActivityTypeSchema>;
export type HrLearningCategory    = z.infer<typeof hrLearningCategorySchema>;
export type HrSocialInsuranceRule = z.infer<typeof hrSocialInsuranceRuleSchema>;
export type HrConfigBundle        = z.infer<typeof hrConfigBundleResponse>;
export type HrOrgUnitCreateRequest    = z.infer<typeof hrOrgUnitCreateRequest>;
export type HrOrgUnitPatchRequest     = z.infer<typeof hrOrgUnitPatchRequest>;
export type HrJobTitleCreateRequest   = z.infer<typeof hrJobTitleCreateRequest>;
export type HrJobTitlePatchRequest    = z.infer<typeof hrJobTitlePatchRequest>;
export type HrPositionCreateRequest   = z.infer<typeof hrPositionCreateRequest>;
export type HrPositionPatchRequest    = z.infer<typeof hrPositionPatchRequest>;
export type HrGradeCreateRequest      = z.infer<typeof hrGradeCreateRequest>;
export type HrGradePatchRequest       = z.infer<typeof hrGradePatchRequest>;

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
  // Phase 4A — Employee 360 (NOT yet implemented; paths reserved so the FE
  // client and tests can compile against canonical strings).
  employeeDocuments:    (id: string)                  => `/api/employees/${encodeURIComponent(id)}/documents`,
  employeeDocument:     (id: string, docId: string)   => `/api/employees/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}`,
  // Phase 10 — multipart upload of a raw document file to R2 (private bucket)
  // with metadata persisted to employee_documents in a single transaction.
  employeeDocumentUpload: (id: string)                => `/api/employees/${encodeURIComponent(id)}/documents/upload`,
  // Phase 10 hotfix — authenticated file streaming from private R2.
  // `?download=1` returns Content-Disposition: attachment.
  employeeDocumentFile: (id: string, docId: string)   => `/api/employees/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}/file`,
  contractFile:          (id: string)                 => `/api/contracts/${encodeURIComponent(id)}/file`,
  // Phase 11 — pre-commit access to the raw source file by its SHA-256
  // hash. Used by the import-review screen to open the original PDF
  // before the contract row exists.
  sourceFileBytes:       (hash: string)               => `/api/source-files/${encodeURIComponent(hash)}/file`,
  // Phase 11 — manual employee creation + per-item review edit endpoints.
  employeesManual:       '/api/employees/manual',
  importJobItemPatch:    (jobId: string, itemId: string) =>
    `/api/import-jobs/${encodeURIComponent(jobId)}/items/${encodeURIComponent(itemId)}`,
  employeeTransactions: (id: string)                  => `/api/employees/${encodeURIComponent(id)}/transactions`,
  employeeTransaction:  (id: string, txnId: string)   => `/api/employees/${encodeURIComponent(id)}/transactions/${encodeURIComponent(txnId)}`,
  // Phase 6A-1 — HR Configuration foundation.
  hrConfig:                  '/api/config/hr',
  hrConfigOrgUnits:          '/api/config/org-units',
  hrConfigOrgUnitsTree:      '/api/config/org-units/tree',
  hrConfigOrgUnit:           (id: string) => `/api/config/org-units/${encodeURIComponent(id)}`,
  hrConfigJobTitles:         '/api/config/job-titles',
  hrConfigJobTitle:          (id: string) => `/api/config/job-titles/${encodeURIComponent(id)}`,
  hrConfigPositions:         '/api/config/positions',
  hrConfigPosition:          (id: string) => `/api/config/positions/${encodeURIComponent(id)}`,
  hrConfigGrades:            '/api/config/grades',
  hrConfigGrade:             (id: string) => `/api/config/grades/${encodeURIComponent(id)}`,
  hrConfigTrades:            '/api/config/trades',
  hrConfigContractTypes:     '/api/config/contract-types',
  hrConfigPayrollComponents: '/api/config/payroll-components',
  hrConfigLearningCategories:'/api/config/learning-categories',
  hrConfigMedicalProviders:  '/api/config/medical-providers',
  hrConfigMedicalPolicyClasses:'/api/config/medical-policy-classes',
  hrConfigSocialInsuranceRules:'/api/config/social-insurance-rules',
  hrConfigDocumentTypes:     '/api/config/document-types',
  hrConfigTransactionTypes:  '/api/config/transaction-types',
  hrConfigActivityTypes:     '/api/config/activity-types',
  // Phase 10 — Employee 360 action endpoints.
  employeeTimeline:    (id: string) => `/api/employees/${encodeURIComponent(id)}/timeline`,
  employeeMessages:    (id: string) => `/api/employees/${encodeURIComponent(id)}/messages`,
  employeeNotes:       (id: string) => `/api/employees/${encodeURIComponent(id)}/notes`,
  employeeActivities:  (id: string) => `/api/employees/${encodeURIComponent(id)}/activities`,
  employeeActivity:    (actId: string) => `/api/employee-activities/${encodeURIComponent(actId)}`,
  employeeCompensation:(id: string) => `/api/employees/${encodeURIComponent(id)}/compensation`,
  employeeLearning:    (id: string) => `/api/employees/${encodeURIComponent(id)}/learning`,
} as const;
