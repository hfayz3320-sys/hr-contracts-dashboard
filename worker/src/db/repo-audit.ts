import type { Env } from '../env';
import type { AuditEvent, AuditStatus } from '@shared/domain';

type AuditRow = {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  status: AuditStatus;
  details: string | null;
};

export async function listAuditEvents(env: Env): Promise<{ items: AuditEvent[]; total: number }> {
  const rows = await env.DB
    .prepare(`SELECT * FROM audit_events ORDER BY at DESC LIMIT 200`)
    .all<AuditRow>();
  const items: AuditEvent[] = (rows.results ?? []).map((r) => ({
    id: r.id,
    at: r.at,
    actor: r.actor,
    action: r.action,
    target: r.target,
    status: r.status,
    ...(r.details != null ? { details: r.details } : {}),
  }));
  return { items, total: items.length };
}

export async function listAuditForTarget(env: Env, target: string): Promise<AuditEvent[]> {
  const rows = await env.DB
    .prepare(`SELECT * FROM audit_events WHERE target = ? ORDER BY at DESC LIMIT 50`)
    .bind(target)
    .all<AuditRow>();
  return (rows.results ?? []).map((r) => ({
    id: r.id,
    at: r.at,
    actor: r.actor,
    action: r.action,
    target: r.target,
    status: r.status,
    ...(r.details != null ? { details: r.details } : {}),
  }));
}
