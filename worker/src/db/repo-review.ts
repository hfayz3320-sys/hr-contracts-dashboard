import type { Env } from '../env';
import type { ReviewItem } from '@shared/domain';

type ReviewRow = {
  id: string;
  reason: string;
  entity: 'employee' | 'contract' | 'insurance';
  description: string;
  details: string;
  created_at: string;
  status: 'open' | 'resolved' | 'dismissed';
  import_job_id: string | null;
  payload: string | null;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  linked_target_id: string | null;
};

function rowToReview(r: ReviewRow): ReviewItem {
  return {
    id: r.id,
    reason: r.reason as ReviewItem['reason'],
    entity: r.entity,
    description: r.description,
    details: r.details,
    createdAt: r.created_at,
    status: r.status,
    ...(r.import_job_id != null ? { importJobId: r.import_job_id } : {}),
  };
}

export async function getReviewItem(env: Env, id: string): Promise<ReviewItem | null> {
  const r = await env.DB
    .prepare(`SELECT * FROM review_queue WHERE id = ?`)
    .bind(id)
    .first<ReviewRow>();
  return r ? rowToReview(r) : null;
}

export async function insertReviewItem(
  env: Env,
  item: {
    id: string;
    reason: string;
    entity: 'employee' | 'contract' | 'insurance';
    description: string;
    details: string;
    importJobId?: string | null;
    payload?: unknown;
  },
): Promise<void> {
  await env.DB
    .prepare(
      `INSERT INTO review_queue (id, reason, entity, description, details, status, import_job_id, payload)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
    )
    .bind(
      item.id,
      item.reason,
      item.entity,
      item.description,
      item.details,
      item.importJobId ?? null,
      item.payload != null ? JSON.stringify(item.payload) : null,
    )
    .run();
}

export async function resolveReviewItem(
  env: Env,
  id: string,
  resolution: 'accept_create' | 'accept_update' | 'link_to_existing',
  resolvedBy: string,
  linkedTargetId?: string,
): Promise<void> {
  await env.DB
    .prepare(
      `UPDATE review_queue
       SET status = 'resolved',
           resolution = ?,
           resolved_by = ?,
           resolved_at = datetime('now'),
           linked_target_id = ?
       WHERE id = ? AND status = 'open'`,
    )
    .bind(resolution, resolvedBy, linkedTargetId ?? null, id)
    .run();
}

export async function dismissReviewItem(
  env: Env,
  id: string,
  resolvedBy: string,
  reason?: string,
): Promise<void> {
  await env.DB
    .prepare(
      `UPDATE review_queue
       SET status = 'dismissed',
           resolution = 'dismissed',
           resolved_by = ?,
           resolved_at = datetime('now'),
           details = CASE WHEN ? IS NOT NULL THEN details || char(10) || 'Dismissed: ' || ? ELSE details END
       WHERE id = ? AND status = 'open'`,
    )
    .bind(resolvedBy, reason ?? null, reason ?? null, id)
    .run();
}
