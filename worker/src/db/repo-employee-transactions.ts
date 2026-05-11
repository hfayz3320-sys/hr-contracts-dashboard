/**
 * Phase 4A A2 — employee_transactions repo.
 *
 * Idempotency is enforced at the API layer in `routes/employee-transactions.ts`
 * by calling `findTransactionByIdempotencyKey` first; the column has a
 * SQL-level `UNIQUE` index that catches concurrent-writer races (and treats
 * multiple NULLs as distinct, so null keys never collide).
 *
 * `type` is stored as free TEXT (the migration has no CHECK enum) — zod at
 * the API boundary is the enum guard. This lets a new transaction type ship
 * as a single PR without a D1 migration.
 */
import type { Env } from '../env';
import type {
  EmployeeTransaction,
  EmployeeTransactionStatus,
  EmployeeTransactionType,
} from '@shared/domain';

type EmployeeTransactionRow = {
  id: string;
  employee_id: string;
  type: string;
  status: string;
  title: string;
  effective_date: string | null;
  end_date: string | null;
  amount: number | null;
  currency: string | null;
  ref_number: string | null;
  payload: string | null;
  payload_schema_version: number;
  metadata: string | null;
  source_file_id: string | null;
  review_required: number;
  review_reason: string | null;
  idempotency_key: string | null;
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

function rowToTransaction(r: EmployeeTransactionRow): EmployeeTransaction {
  return {
    id: r.id,
    employeeId: r.employee_id,
    type: r.type as EmployeeTransactionType,
    status: r.status as EmployeeTransactionStatus,
    title: r.title,
    ...(r.effective_date != null ? { effectiveDate: r.effective_date } : {}),
    ...(r.end_date != null ? { endDate: r.end_date } : {}),
    ...(r.amount != null ? { amount: r.amount } : {}),
    ...(r.currency != null ? { currency: r.currency } : {}),
    ...(r.ref_number != null ? { refNumber: r.ref_number } : {}),
    ...(r.payload != null ? { payload: tryParseJson(r.payload) } : {}),
    payloadSchemaVersion: r.payload_schema_version,
    ...(r.metadata != null ? { metadata: tryParseJson(r.metadata) } : {}),
    ...(r.source_file_id != null ? { sourceFileId: r.source_file_id } : {}),
    reviewRequired: r.review_required === 1,
    ...(r.review_reason != null ? { reviewReason: r.review_reason } : {}),
    ...(r.idempotency_key != null ? { idempotencyKey: r.idempotency_key } : {}),
    createdAt: r.created_at,
    createdBy: r.created_by,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

// ---- reads ----------------------------------------------------------------

export async function listTransactionsForEmployee(
  env: Env,
  employeeId: string,
): Promise<EmployeeTransaction[]> {
  const rows = await env.DB
    .prepare(
      `SELECT * FROM employee_transactions
       WHERE employee_id = ?
       ORDER BY COALESCE(effective_date, created_at) DESC, created_at DESC`,
    )
    .bind(employeeId)
    .all<EmployeeTransactionRow>();
  return (rows.results ?? []).map(rowToTransaction);
}

export async function getTransactionById(
  env: Env,
  id: string,
): Promise<EmployeeTransaction | null> {
  const r = await env.DB
    .prepare(`SELECT * FROM employee_transactions WHERE id = ?`)
    .bind(id)
    .first<EmployeeTransactionRow>();
  return r ? rowToTransaction(r) : null;
}

export async function findTransactionByIdempotencyKey(
  env: Env,
  key: string,
): Promise<EmployeeTransaction | null> {
  const r = await env.DB
    .prepare(`SELECT * FROM employee_transactions WHERE idempotency_key = ?`)
    .bind(key)
    .first<EmployeeTransactionRow>();
  return r ? rowToTransaction(r) : null;
}

// ---- writes ---------------------------------------------------------------

export type EmployeeTransactionInsertInput = {
  id: string;
  employeeId: string;
  type: EmployeeTransactionType;
  status?: EmployeeTransactionStatus;
  title: string;
  effectiveDate?: string | null;
  endDate?: string | null;
  amount?: number | null;
  currency?: string | null;
  refNumber?: string | null;
  payload?: Record<string, unknown> | null;
  payloadSchemaVersion?: number;
  metadata?: Record<string, unknown> | null;
  sourceFileId?: string | null;
  reviewRequired?: boolean;
  reviewReason?: string | null;
  idempotencyKey?: string | null;
  actor: string;
};

export async function insertTransaction(
  env: Env,
  input: EmployeeTransactionInsertInput,
): Promise<void> {
  await env.DB
    .prepare(
      `INSERT INTO employee_transactions
       (id, employee_id, type, status, title,
        effective_date, end_date, amount, currency, ref_number,
        payload, payload_schema_version, metadata, source_file_id,
        review_required, review_reason, idempotency_key,
        created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.employeeId,
      input.type,
      input.status ?? 'requested',
      input.title,
      input.effectiveDate ?? null,
      input.endDate ?? null,
      input.amount ?? null,
      input.currency ?? null,
      input.refNumber ?? null,
      input.payload != null ? JSON.stringify(input.payload) : null,
      input.payloadSchemaVersion ?? 1,
      input.metadata != null ? JSON.stringify(input.metadata) : null,
      input.sourceFileId ?? null,
      input.reviewRequired ? 1 : 0,
      input.reviewReason ?? null,
      input.idempotencyKey ?? null,
      input.actor,
      input.actor,
    )
    .run();
}

export type EmployeeTransactionPatchInput = {
  status?: EmployeeTransactionStatus;
  title?: string;
  effectiveDate?: string | null;
  endDate?: string | null;
  amount?: number | null;
  currency?: string | null;
  refNumber?: string | null;
  payload?: Record<string, unknown> | null;
  payloadSchemaVersion?: number;
  metadata?: Record<string, unknown> | null;
  sourceFileId?: string | null;
  reviewRequired?: boolean;
  reviewReason?: string | null;
};

export async function updateTransactionFields(
  env: Env,
  id: string,
  patch: EmployeeTransactionPatchInput,
  actor: string,
): Promise<void> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  const set = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    binds.push(v);
  };
  if (patch.status !== undefined) set('status', patch.status);
  if (patch.title !== undefined) set('title', patch.title);
  if (patch.effectiveDate !== undefined) set('effective_date', patch.effectiveDate);
  if (patch.endDate !== undefined) set('end_date', patch.endDate);
  if (patch.amount !== undefined) set('amount', patch.amount);
  if (patch.currency !== undefined) set('currency', patch.currency);
  if (patch.refNumber !== undefined) set('ref_number', patch.refNumber);
  if (patch.payload !== undefined) {
    set('payload', patch.payload != null ? JSON.stringify(patch.payload) : null);
  }
  if (patch.payloadSchemaVersion !== undefined)
    set('payload_schema_version', patch.payloadSchemaVersion);
  if (patch.metadata !== undefined) {
    set('metadata', patch.metadata != null ? JSON.stringify(patch.metadata) : null);
  }
  if (patch.sourceFileId !== undefined) set('source_file_id', patch.sourceFileId);
  if (patch.reviewRequired !== undefined)
    set('review_required', patch.reviewRequired ? 1 : 0);
  if (patch.reviewReason !== undefined) set('review_reason', patch.reviewReason);
  if (sets.length === 0) return;
  sets.push(`updated_at = datetime('now')`);
  sets.push(`updated_by = ?`);
  binds.push(actor);
  binds.push(id);
  await env.DB
    .prepare(`UPDATE employee_transactions SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
}
