import type { Env } from '../env';
import { newId } from './id';

export type AuditWrite = {
  actor: string;
  action: string;
  target: string;
  status: 'ok' | 'warning' | 'error';
  details?: string;
  /** Optional pin to the import job that triggered the event. */
  jobId?: string;
  /** Optional pin to the originating source file (sha256). */
  sourceFileId?: string;
};

/**
 * Append an audit row. Audit table is append-only — no UPDATE, no DELETE.
 * Failures are non-fatal; we never let an audit write block a request.
 */
export async function writeAudit(env: Env, e: AuditWrite): Promise<void> {
  try {
    await env.DB
      .prepare(
        `INSERT INTO audit_events (id, actor, action, target, status, details, job_id, source_file_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId('aud'),
        e.actor,
        e.action,
        e.target,
        e.status,
        e.details ?? null,
        e.jobId ?? null,
        e.sourceFileId ?? null,
      )
      .run();
  } catch (err) {
    console.error('audit write failed', err);
  }
}
