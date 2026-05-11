/**
 * Read-time computed status for `employee_documents` rows — Phase 4A A1 patch.
 *
 * Why a separate computed field
 * -----------------------------
 * The stored `employee_documents.status` column captures *what HR last set
 * by hand* (or what the import pipeline wrote at commit time). It is a
 * workflow/manual state. The moment today crosses a row's `expires_at`,
 * the stored column silently drifts to a lie — the same Phase-3C-2
 * insurance bug, in a new table.
 *
 * Phase 4A keeps the stored column for audit/workflow, but the API attaches
 * a parallel `computedStatus` derived from the authoritative inputs
 * (storedStatus, is_current, review_required, expires_at, required fields).
 * Dashboards and UI badges MUST read `computedStatus`, not `status`.
 *
 *   status         → the user's last manual workflow decision
 *   computedStatus → what to show today
 *
 * Priority order (returns the first matching bucket)
 * --------------------------------------------------
 *   1. archived          — the row is superseded or admin-archived;
 *                          terminal state, dominates everything else.
 *                          (`is_current = 0` OR `status = 'archived'`)
 *   2. review_required   — admin manually flagged the row, OR a required
 *                          field for this document type is missing.
 *   3. expired           — `expires_at < today` (well-formed ISO).
 *   4. active            — none of the above.
 *
 * Required fields per type
 * ------------------------
 *   iqama / passport / visa / driving_license : doc_number AND expires_at
 *   work_permit                                : expires_at
 *   contract_pdf                               : source_file_id
 *   insurance_card                             : doc_number
 *   medical_certificate                        : issued_at
 *   other                                      : nothing
 *
 * These reflect what an admin must capture for the document to be
 * actionable. They are deliberately broad — false positives ("review
 * required" on a row that is fine) are cheap (admin verifies and clears).
 * False negatives ("active" on a row missing critical info) are
 * expensive (decisions made on incomplete data).
 */
import type {
  EmployeeDocumentStatus,
  EmployeeDocumentType,
} from '@shared/domain';

export interface ComputeEmployeeDocumentStatusInput {
  type: EmployeeDocumentType;
  /** Stored workflow state from D1. */
  storedStatus: EmployeeDocumentStatus;
  isCurrent: boolean;
  reviewRequired: boolean;
  docNumber?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  sourceFileId?: string | null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isPresent(s: string | null | undefined): boolean {
  return typeof s === 'string' && s.trim().length > 0;
}

type RequiredField = 'docNumber' | 'issuedAt' | 'expiresAt' | 'sourceFileId';

const REQUIRED_FIELDS_BY_TYPE: Record<EmployeeDocumentType, RequiredField[]> = {
  iqama:               ['docNumber', 'expiresAt'],
  passport:            ['docNumber', 'expiresAt'],
  visa:                ['docNumber', 'expiresAt'],
  driving_license:     ['docNumber', 'expiresAt'],
  work_permit:         ['expiresAt'],
  contract_pdf:        ['sourceFileId'],
  insurance_card:      ['docNumber'],
  medical_certificate: ['issuedAt'],
  other:               [],
};

function hasMissingRequiredFields(input: ComputeEmployeeDocumentStatusInput): boolean {
  const required = REQUIRED_FIELDS_BY_TYPE[input.type];
  for (const f of required) {
    if (!isPresent(input[f])) return true;
  }
  return false;
}

export function computeEmployeeDocumentStatus(
  input: ComputeEmployeeDocumentStatusInput,
): EmployeeDocumentStatus {
  // 1. Archived (terminal) wins over everything.
  if (!input.isCurrent || input.storedStatus === 'archived') {
    return 'archived';
  }
  // 2. Manual review flag, OR required fields missing for this type.
  if (input.reviewRequired || hasMissingRequiredFields(input)) {
    return 'review_required';
  }
  // 3. Date-based expiry. `expires_at` must be a well-formed ISO YYYY-MM-DD.
  if (isPresent(input.expiresAt) && /^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt!)) {
    if (input.expiresAt! < todayISO()) return 'expired';
  }
  // 4. Default — current, not flagged, not expired.
  return 'active';
}
