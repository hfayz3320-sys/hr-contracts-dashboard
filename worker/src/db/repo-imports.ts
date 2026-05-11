import type { Env } from '../env';
import type { ImportJob, ImportJobStatus, ImportJobType, ReviewItem } from '@shared/domain';

type ImportJobRow = {
  id: string;
  type: ImportJobType;
  filename: string;
  source_hash: string | null;
  status: ImportJobStatus;
  idempotency_key: string | null;
  started_at: string;
  finished_at: string | null;
  triggered_by: string;
  counts_created: number;
  counts_updated: number;
  counts_skipped: number;
  counts_review: number;
  counts_error: number;
};

function rowToJob(r: ImportJobRow): ImportJob {
  return {
    id: r.id,
    type: r.type,
    filename: r.filename,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    counts: {
      created: r.counts_created,
      updated: r.counts_updated,
      skipped: r.counts_skipped,
      review: r.counts_review,
      error: r.counts_error,
    },
    triggeredBy: r.triggered_by,
  };
}

export async function listImportJobs(env: Env): Promise<{ items: ImportJob[]; total: number }> {
  const rows = await env.DB
    .prepare(`SELECT * FROM import_jobs ORDER BY started_at DESC`)
    .all<ImportJobRow>();
  const items = (rows.results ?? []).map(rowToJob);
  return { items, total: items.length };
}

export async function insertImportJob(
  env: Env,
  job: {
    id: string;
    type: ImportJobType;
    filename: string;
    status: ImportJobStatus;
    triggeredBy: string;
    counts: {
      created: number;
      updated: number;
      skipped: number;
      review: number;
      error: number;
    };
    finishedAt: string | null;
  },
): Promise<void> {
  await env.DB
    .prepare(
      `INSERT INTO import_jobs
       (id, type, filename, status, triggered_by,
        counts_created, counts_updated, counts_skipped, counts_review, counts_error,
        finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      job.id,
      job.type,
      job.filename,
      job.status,
      job.triggeredBy,
      job.counts.created,
      job.counts.updated,
      job.counts.skipped,
      job.counts.review,
      job.counts.error,
      job.finishedAt,
    )
    .run();
}

export async function insertJobItems(
  env: Env,
  jobId: string,
  items: Array<{
    id: string;
    rowIndex: number;
    identityNumber: string | null;
    rawPayload: unknown;
    resolvedAction: string;
    targetId?: string;
    diff?: unknown;
    reason?: string;
  }>,
): Promise<void> {
  if (items.length === 0) return;
  const stmt = env.DB.prepare(
    `INSERT INTO import_job_items
     (id, job_id, row_index, identity_number, raw_payload, resolved_action, target_id, diff, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  await env.DB.batch(
    items.map((it) =>
      stmt.bind(
        it.id,
        jobId,
        it.rowIndex,
        it.identityNumber,
        JSON.stringify(it.rawPayload),
        it.resolvedAction,
        it.targetId ?? null,
        it.diff != null ? JSON.stringify(it.diff) : null,
        it.reason ?? null,
      ),
    ),
  );
}

type ReviewRow = {
  id: string;
  reason: string;
  entity: 'employee' | 'contract' | 'insurance';
  description: string;
  details: string;
  created_at: string;
  status: 'open' | 'resolved' | 'dismissed';
  import_job_id: string | null;
};

export async function listReviewQueue(
  env: Env,
  filter: { status?: 'open' | 'resolved' | 'dismissed' } = {},
): Promise<{ items: ReviewItem[]; total: number }> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (filter.status) {
    where.push('status = ?');
    binds.push(filter.status);
  }
  const sql = `SELECT * FROM review_queue ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
  const rows = await env.DB.prepare(sql).bind(...binds).all<ReviewRow>();
  const items: ReviewItem[] = (rows.results ?? []).map((r) => ({
    id: r.id,
    reason: r.reason as ReviewItem['reason'],
    entity: r.entity,
    description: r.description,
    details: r.details,
    createdAt: r.created_at,
    status: r.status,
    ...(r.import_job_id != null ? { importJobId: r.import_job_id } : {}),
  }));
  return { items, total: items.length };
}

// ===========================================================================
// Helpers for the commit pipeline (Phase 2B)
// ===========================================================================

export type ImportJobDetail = ImportJob & {
  sourceHash: string | null;
  committedAt: string | null;
  committedBy: string | null;
  idempotencyKey: string | null;
};

export async function getImportJob(env: Env, id: string): Promise<ImportJobDetail | null> {
  type ExtendedRow = ImportJobRow & {
    committed_at: string | null;
    committed_by: string | null;
  };
  const r = await env.DB
    .prepare(`SELECT * FROM import_jobs WHERE id = ?`)
    .bind(id)
    .first<ExtendedRow>();
  if (!r) return null;
  return {
    ...rowToJob(r),
    sourceHash: r.source_hash,
    committedAt: r.committed_at,
    committedBy: r.committed_by,
    idempotencyKey: r.idempotency_key,
  };
}

export async function findImportJobByIdempotencyKey(
  env: Env,
  key: string,
): Promise<ImportJob | null> {
  const r = await env.DB
    .prepare(`SELECT * FROM import_jobs WHERE idempotency_key = ?`)
    .bind(key)
    .first<ImportJobRow>();
  return r ? rowToJob(r) : null;
}

export type ImportJobItemRecord = {
  id: string;
  jobId: string;
  rowIndex: number;
  identityNumber: string | null;
  resolvedAction: string | null;
  targetId: string | null;
  reason: string | null;
  diff: Record<string, { from: unknown; to: unknown }> | null;
  rawPayload: Record<string, unknown>;
  committedAction: string | null;
  committedAt: string | null;
  committedTargetId: string | null;
  errorMessage: string | null;
};

type RawJobItemRow = {
  id: string;
  job_id: string;
  row_index: number;
  identity_number: string | null;
  resolved_action: string | null;
  target_id: string | null;
  reason: string | null;
  diff: string | null;
  raw_payload: string;
  committed_action: string | null;
  committed_at: string | null;
  committed_target_id: string | null;
  error_message: string | null;
};

function parseJsonRecord<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function rowToJobItem(r: RawJobItemRow): ImportJobItemRecord {
  return {
    id: r.id,
    jobId: r.job_id,
    rowIndex: r.row_index,
    identityNumber: r.identity_number,
    resolvedAction: r.resolved_action,
    targetId: r.target_id,
    reason: r.reason,
    diff: parseJsonRecord<Record<string, { from: unknown; to: unknown }>>(r.diff),
    rawPayload: parseJsonRecord<Record<string, unknown>>(r.raw_payload) ?? {},
    committedAction: r.committed_action,
    committedAt: r.committed_at,
    committedTargetId: r.committed_target_id,
    errorMessage: r.error_message,
  };
}

export async function listImportJobItems(env: Env, jobId: string): Promise<ImportJobItemRecord[]> {
  const rows = await env.DB
    .prepare(`SELECT * FROM import_job_items WHERE job_id = ? ORDER BY row_index ASC`)
    .bind(jobId)
    .all<RawJobItemRow>();
  return (rows.results ?? []).map(rowToJobItem);
}

export async function clearImportJobItems(env: Env, jobId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM import_job_items WHERE job_id = ?`).bind(jobId).run();
}

export async function markJobItemCommitted(
  env: Env,
  itemId: string,
  committedAction: string,
  committedTargetId: string | null,
): Promise<void> {
  await env.DB
    .prepare(
      `UPDATE import_job_items
       SET committed_action = ?, committed_at = datetime('now'), committed_target_id = ?
       WHERE id = ?`,
    )
    .bind(committedAction, committedTargetId, itemId)
    .run();
}

export async function markJobItemError(env: Env, itemId: string, msg: string): Promise<void> {
  await env.DB
    .prepare(
      `UPDATE import_job_items
       SET committed_action = 'error', committed_at = datetime('now'), error_message = ?
       WHERE id = ?`,
    )
    .bind(msg, itemId)
    .run();
}

export async function updateJobStatusAndCounts(
  env: Env,
  jobId: string,
  status: ImportJobStatus,
  counts: {
    created: number;
    updated: number;
    skipped: number;
    review: number;
    error: number;
  },
  committedBy?: string,
): Promise<void> {
  const isCommitted = status === 'committed' || status === 'failed';
  await env.DB
    .prepare(
      `UPDATE import_jobs
       SET status = ?,
           counts_created = ?, counts_updated = ?, counts_skipped = ?,
           counts_review = ?, counts_error = ?,
           finished_at = datetime('now'),
           committed_at = CASE WHEN ?=1 THEN datetime('now') ELSE committed_at END,
           committed_by = CASE WHEN ?=1 THEN ? ELSE committed_by END
       WHERE id = ?`,
    )
    .bind(
      status,
      counts.created,
      counts.updated,
      counts.skipped,
      counts.review,
      counts.error,
      isCommitted ? 1 : 0,
      isCommitted ? 1 : 0,
      committedBy ?? null,
      jobId,
    )
    .run();
}

export async function createImportJob(
  env: Env,
  job: {
    id: string;
    type: ImportJobType;
    filename: string;
    sourceHash: string | null;
    idempotencyKey: string | null;
    status: ImportJobStatus;
    triggeredBy: string;
  },
): Promise<void> {
  await env.DB
    .prepare(
      `INSERT INTO import_jobs
       (id, type, filename, source_hash, idempotency_key, status, triggered_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      job.id,
      job.type,
      job.filename,
      job.sourceHash,
      job.idempotencyKey,
      job.status,
      job.triggeredBy,
    )
    .run();
}
