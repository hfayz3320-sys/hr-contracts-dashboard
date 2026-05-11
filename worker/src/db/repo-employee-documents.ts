/**
 * Phase 4A A2 — employee_documents repo.
 *
 * Read path attaches `computedStatus` via `computeEmployeeDocumentStatus`
 * (Phase 3C-2 insurance pattern). Stored `status` column is preserved as
 * the workflow snapshot; consumers read `computedStatus`.
 *
 * Uniqueness: the migration enforces "at most one current row per
 * (employee_id, type)" via a partial UNIQUE INDEX with `WHERE is_current
 * = 1`. The route layer calls `supersedeCurrentDocumentOfType` before
 * inserting a new current row so this never trips at the SQL level.
 */
import type { Env } from '../env';
import type {
  EmployeeDocument,
  EmployeeDocumentStatus,
  EmployeeDocumentType,
} from '@shared/domain';
import { computeEmployeeDocumentStatus } from '../lib/employee-document-status';

type EmployeeDocumentRow = {
  id: string;
  employee_id: string;
  type: string;
  doc_number: string | null;
  issued_at: string | null;
  expires_at: string | null;
  status: string;
  is_current: number;
  verified_at: string | null;
  verified_by: string | null;
  review_required: number;
  review_reason: string | null;
  extraction_confidence: number | null;
  source_file_id: string | null;
  metadata: string | null;
  notes: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
};

function tryParseJson(s: string | null): Record<string, unknown> | undefined {
  if (s == null) return undefined;
  try {
    const v = JSON.parse(s) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function rowToDocument(r: EmployeeDocumentRow): EmployeeDocument {
  const isCurrent = r.is_current === 1;
  const reviewRequired = r.review_required === 1;
  const storedStatus = r.status as EmployeeDocumentStatus;
  const type = r.type as EmployeeDocumentType;
  const computedStatus = computeEmployeeDocumentStatus({
    type,
    storedStatus,
    isCurrent,
    reviewRequired,
    docNumber: r.doc_number,
    issuedAt: r.issued_at,
    expiresAt: r.expires_at,
    sourceFileId: r.source_file_id,
  });
  return {
    id: r.id,
    employeeId: r.employee_id,
    type,
    ...(r.doc_number != null ? { docNumber: r.doc_number } : {}),
    ...(r.issued_at != null ? { issuedAt: r.issued_at } : {}),
    ...(r.expires_at != null ? { expiresAt: r.expires_at } : {}),
    status: storedStatus,
    computedStatus,
    isCurrent,
    ...(r.verified_at != null ? { verifiedAt: r.verified_at } : {}),
    ...(r.verified_by != null ? { verifiedBy: r.verified_by } : {}),
    reviewRequired,
    ...(r.review_reason != null ? { reviewReason: r.review_reason } : {}),
    ...(r.extraction_confidence != null
      ? { extractionConfidence: r.extraction_confidence }
      : {}),
    ...(r.source_file_id != null ? { sourceFileId: r.source_file_id } : {}),
    ...(r.metadata != null ? { metadata: tryParseJson(r.metadata) } : {}),
    ...(r.notes != null ? { notes: r.notes } : {}),
    createdAt: r.created_at,
    createdBy: r.created_by,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

// ---- reads ----------------------------------------------------------------

export async function listDocumentsForEmployee(
  env: Env,
  employeeId: string,
): Promise<EmployeeDocument[]> {
  const rows = await env.DB
    .prepare(
      `SELECT * FROM employee_documents
       WHERE employee_id = ?
       ORDER BY is_current DESC, created_at DESC`,
    )
    .bind(employeeId)
    .all<EmployeeDocumentRow>();
  return (rows.results ?? []).map(rowToDocument);
}

export async function getDocumentById(
  env: Env,
  id: string,
): Promise<EmployeeDocument | null> {
  const r = await env.DB
    .prepare(`SELECT * FROM employee_documents WHERE id = ?`)
    .bind(id)
    .first<EmployeeDocumentRow>();
  return r ? rowToDocument(r) : null;
}

export async function findCurrentDocumentOfType(
  env: Env,
  employeeId: string,
  type: EmployeeDocumentType,
): Promise<EmployeeDocument | null> {
  const r = await env.DB
    .prepare(
      `SELECT * FROM employee_documents
       WHERE employee_id = ? AND type = ? AND is_current = 1
       LIMIT 1`,
    )
    .bind(employeeId, type)
    .first<EmployeeDocumentRow>();
  return r ? rowToDocument(r) : null;
}

// ---- writes ---------------------------------------------------------------

export type EmployeeDocumentInsertInput = {
  id: string;
  employeeId: string;
  type: EmployeeDocumentType;
  docNumber?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  status?: EmployeeDocumentStatus;
  isCurrent?: boolean;
  reviewRequired?: boolean;
  reviewReason?: string | null;
  sourceFileId?: string | null;
  metadata?: Record<string, unknown> | null;
  notes?: string | null;
  actor: string;
};

export async function insertDocument(
  env: Env,
  input: EmployeeDocumentInsertInput,
): Promise<void> {
  await env.DB
    .prepare(
      `INSERT INTO employee_documents
       (id, employee_id, type, doc_number, issued_at, expires_at,
        status, is_current, review_required, review_reason,
        source_file_id, metadata, notes,
        created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.employeeId,
      input.type,
      input.docNumber ?? null,
      input.issuedAt ?? null,
      input.expiresAt ?? null,
      input.status ?? 'active',
      input.isCurrent === false ? 0 : 1,
      input.reviewRequired ? 1 : 0,
      input.reviewReason ?? null,
      input.sourceFileId ?? null,
      input.metadata != null ? JSON.stringify(input.metadata) : null,
      input.notes ?? null,
      input.actor,
      input.actor,
    )
    .run();
}

/**
 * Demote the current row of `type` (if any) to `is_current = 0`. Called by
 * the route handler before inserting a new current document of the same
 * type, or when PATCH flips `isCurrent` from 0 → 1 on a different row.
 *
 * Returns the id of the row that was demoted, or null if there was none.
 */
export async function supersedeCurrentDocumentOfType(
  env: Env,
  employeeId: string,
  type: EmployeeDocumentType,
  actor: string,
): Promise<string | null> {
  const current = await findCurrentDocumentOfType(env, employeeId, type);
  if (!current) return null;
  await env.DB
    .prepare(
      `UPDATE employee_documents
       SET is_current = 0,
           updated_at = datetime('now'),
           updated_by = ?
       WHERE id = ?`,
    )
    .bind(actor, current.id)
    .run();
  return current.id;
}

export type EmployeeDocumentPatchInput = {
  docNumber?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  status?: EmployeeDocumentStatus;
  isCurrent?: boolean;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  reviewRequired?: boolean;
  reviewReason?: string | null;
  sourceFileId?: string | null;
  metadata?: Record<string, unknown> | null;
  notes?: string | null;
};

export async function updateDocumentFields(
  env: Env,
  id: string,
  patch: EmployeeDocumentPatchInput,
  actor: string,
): Promise<void> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  const set = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    binds.push(v);
  };
  if (patch.docNumber !== undefined) set('doc_number', patch.docNumber);
  if (patch.issuedAt !== undefined) set('issued_at', patch.issuedAt);
  if (patch.expiresAt !== undefined) set('expires_at', patch.expiresAt);
  if (patch.status !== undefined) set('status', patch.status);
  if (patch.isCurrent !== undefined) set('is_current', patch.isCurrent ? 1 : 0);
  if (patch.verifiedAt !== undefined) set('verified_at', patch.verifiedAt);
  if (patch.verifiedBy !== undefined) set('verified_by', patch.verifiedBy);
  if (patch.reviewRequired !== undefined)
    set('review_required', patch.reviewRequired ? 1 : 0);
  if (patch.reviewReason !== undefined)
    set('review_reason', patch.reviewReason);
  if (patch.sourceFileId !== undefined)
    set('source_file_id', patch.sourceFileId);
  if (patch.metadata !== undefined) {
    set('metadata', patch.metadata != null ? JSON.stringify(patch.metadata) : null);
  }
  if (patch.notes !== undefined) set('notes', patch.notes);
  if (sets.length === 0) return;
  // Always bump updated_at + updated_by; never let a PATCH silently leave
  // the audit columns alone.
  sets.push(`updated_at = datetime('now')`);
  sets.push(`updated_by = ?`);
  binds.push(actor);
  binds.push(id);
  await env.DB
    .prepare(`UPDATE employee_documents SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
}

/**
 * Soft delete = archive. Moves the row to `status='archived'` and
 * `is_current=0` so it stops counting toward the partial-unique index and
 * stops appearing in current-state views. We DO NOT hard-delete; an HR
 * record's history is part of the employee 360 trail.
 */
export async function archiveDocument(
  env: Env,
  id: string,
  actor: string,
): Promise<void> {
  await env.DB
    .prepare(
      `UPDATE employee_documents
       SET status = 'archived',
           is_current = 0,
           updated_at = datetime('now'),
           updated_by = ?
       WHERE id = ?`,
    )
    .bind(actor, id)
    .run();
}
