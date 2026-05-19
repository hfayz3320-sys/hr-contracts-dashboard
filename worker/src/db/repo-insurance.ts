import type { Env } from '../env';
import type { Insurance, InsuranceStatus } from '@shared/domain';
import { buildEmployeeSummaryMap } from './employee-summary';
import { computeInsuranceStatus } from '../lib/insurance-status';

function parseReviewFlags(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const out = parsed.filter((v): v is string => typeof v === 'string');
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

type InsuranceRow = {
  id: string;
  employee_id: string | null;
  identity_number: string | null;
  policy_number: string;
  member_number: string | null;
  provider: string;
  start_date: string;
  end_date: string | null;
  status: InsuranceStatus;
  matched: number;
  unmatched_reason: string | null;
  created_at: string;
  plan_class?: string | null;
  nationality?: string | null;
  member_name?: string | null;
  review_flags_json?: string | null;
};

/**
 * Map a D1 row to the API-facing Insurance shape.
 *
 * Phase 3C-2: `status` is now ALWAYS computed at read time from the
 * authoritative date fields (identityNumber, policyNumber, startDate,
 * endDate, current date) via `computeInsuranceStatus`. The stored
 * `insurance_policies.status` column is treated as a historical snapshot
 * of what the import / last backfill computed — it is no longer the
 * source of truth for dashboards or list responses.
 *
 * Why: previously the stored column drifted whenever today crossed an
 * `end_date` without something triggering a recompute. Phase 3C-1 (the
 * backfill) fixed the snapshot but left the drift problem unresolved.
 * Computing on read closes that gap. The stored column is preserved (no
 * migration needed) but ignored at the boundary.
 *
 * Note: this returns the COMPUTED value as `status`. We keep the row's
 * other date fields exactly as stored so the UI can show the user the
 * raw start/end and explain how status was derived.
 */
function rowToInsurance(r: InsuranceRow): Insurance {
  const computed = computeInsuranceStatus({
    identityNumber: r.identity_number,
    policyNumber: r.policy_number,
    startDate: r.start_date,
    endDate: r.end_date,
  });
  const reviewFlags = parseReviewFlags(r.review_flags_json);
  return {
    id: r.id,
    ...(r.employee_id != null ? { employeeId: r.employee_id } : {}),
    ...(r.identity_number != null ? { identityNumber: r.identity_number } : {}),
    policyNumber: r.policy_number,
    ...(r.member_number != null ? { memberNumber: r.member_number } : {}),
    ...(r.member_name != null ? { memberName: r.member_name } : {}),
    provider: r.provider,
    ...(r.plan_class != null ? { planClass: r.plan_class } : {}),
    ...(r.nationality != null ? { nationality: r.nationality } : {}),
    ...(reviewFlags ? { reviewFlags } : {}),
    startDate: r.start_date,
    endDate: r.end_date,
    status: computed,
    matched: r.matched === 1,
    ...(r.unmatched_reason != null
      ? { unmatchedReason: r.unmatched_reason as Insurance['unmatchedReason'] }
      : {}),
    createdAt: r.created_at,
  };
}

export async function listInsurance(
  env: Env,
  opts: { includeEmployee?: boolean } = {},
): Promise<{ items: Insurance[]; total: number }> {
  const rows = await env.DB
    .prepare(`SELECT * FROM insurance_policies ORDER BY end_date DESC`)
    .all<InsuranceRow>();
  const baseItems = (rows.results ?? []).map(rowToInsurance);
  if (!opts.includeEmployee) {
    return { items: baseItems, total: baseItems.length };
  }
  // Phase 3B — embed compact employee summary + linkStatus.
  const employeeIds = baseItems
    .map((i) => i.employeeId)
    .filter((id): id is string => !!id);
  const summaryMap = await buildEmployeeSummaryMap(env, employeeIds);
  const items: Insurance[] = baseItems.map((i) => {
    const s = i.employeeId ? summaryMap.get(i.employeeId) ?? null : null;
    return { ...i, employeeSummary: s, linkStatus: s ? 'linked' : 'unmatched' };
  });
  return { items, total: items.length };
}

export async function getInsuranceById(env: Env, id: string): Promise<Insurance | null> {
  const r = await env.DB
    .prepare(`SELECT * FROM insurance_policies WHERE id = ?`)
    .bind(id)
    .first<InsuranceRow>();
  return r ? rowToInsurance(r) : null;
}

export async function listInsuranceForEmployee(env: Env, employeeId: string): Promise<Insurance[]> {
  const rows = await env.DB
    .prepare(`SELECT * FROM insurance_policies WHERE employee_id = ? ORDER BY end_date DESC`)
    .bind(employeeId)
    .all<InsuranceRow>();
  return (rows.results ?? []).map(rowToInsurance);
}

export async function findInsuranceByMatchKey(
  env: Env,
  policyNumber: string,
  startDate: string,
): Promise<Insurance | null> {
  const r = await env.DB
    .prepare(`SELECT * FROM insurance_policies WHERE policy_number = ? AND start_date = ?`)
    .bind(policyNumber, startDate)
    .first<InsuranceRow>();
  return r ? rowToInsurance(r) : null;
}

// ===========================================================================
// UPSERT helpers used by the commit pipeline (Phase 2B)
// ===========================================================================

export type InsuranceUpsertInput = {
  employeeId?: string | null;
  identityNumber?: string | null;
  policyNumber: string;
  /**
   * Member/card number. Group medical insurance shares one policy_number
   * across many employees, distinguishing them by member_number. Required
   * to disambiguate group plans; null is allowed for non-group insurance.
   */
  memberNumber?: string | null;
  provider: string;
  startDate: string;
  endDate: string | null;
  status: InsuranceStatus;
  matched: boolean;
  unmatchedReason?: Insurance['unmatchedReason'];
  planClass?: string | null;
  nationality?: string | null;
  memberName?: string | null;
  reviewFlags?: string[] | null;
  /** Source-traceability. */
  sourceFileId: string;
};

export async function findInsuranceByExtendedMatchKey(
  env: Env,
  identityNumber: string | null,
  policyNumber: string,
  memberNumber: string | null,
  startDate: string,
): Promise<Insurance | null> {
  const r = await env.DB
    .prepare(
      `SELECT * FROM insurance_policies
       WHERE COALESCE(identity_number, '') = ?
         AND policy_number = ?
         AND COALESCE(member_number, '') = ?
         AND start_date = ?`,
    )
    .bind(identityNumber ?? '', policyNumber, memberNumber ?? '', startDate)
    .first<InsuranceRow>();
  return r ? rowToInsurance(r) : null;
}

export async function insertInsurance(
  env: Env,
  id: string,
  input: InsuranceUpsertInput,
): Promise<string> {
  try {
    await env.DB
      .prepare(
        `INSERT OR IGNORE INTO insurance_policies
         (id, employee_id, identity_number, policy_number, member_number, provider,
          plan_class, nationality, member_name, review_flags_json,
          start_date, end_date, status, matched, unmatched_reason, source_file_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.employeeId ?? null,
        input.identityNumber ?? null,
        input.policyNumber,
        input.memberNumber ?? null,
        input.provider,
        input.planClass ?? null,
        input.nationality ?? null,
        input.memberName ?? null,
        input.reviewFlags && input.reviewFlags.length > 0 ? JSON.stringify(input.reviewFlags) : null,
        input.startDate,
        input.endDate,
        input.status,
        input.matched ? 1 : 0,
        input.unmatchedReason ?? null,
        input.sourceFileId,
      )
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/no such column/i.test(msg)) throw err;
    await env.DB
      .prepare(
        `INSERT OR IGNORE INTO insurance_policies
         (id, employee_id, identity_number, policy_number, member_number, provider,
          start_date, end_date, status, matched, unmatched_reason, source_file_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.employeeId ?? null,
        input.identityNumber ?? null,
        input.policyNumber,
        input.memberNumber ?? null,
        input.provider,
        input.startDate,
        input.endDate,
        input.status,
        input.matched ? 1 : 0,
        input.unmatchedReason ?? null,
        input.sourceFileId,
      )
      .run();
  }
  const found = await findInsuranceByExtendedMatchKey(
    env,
    input.identityNumber ?? null,
    input.policyNumber,
    input.memberNumber ?? null,
    input.startDate,
  );
  return found?.id ?? id;
}

export async function updateInsuranceFields(
  env: Env,
  id: string,
  input: Partial<InsuranceUpsertInput>,
): Promise<void> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (input.employeeId !== undefined) { sets.push('employee_id = ?'); binds.push(input.employeeId); }
  if (input.identityNumber !== undefined) { sets.push('identity_number = ?'); binds.push(input.identityNumber); }
  if (input.policyNumber !== undefined) { sets.push('policy_number = ?'); binds.push(input.policyNumber); }
  if (input.memberNumber !== undefined) { sets.push('member_number = ?'); binds.push(input.memberNumber); }
  if (input.provider !== undefined) { sets.push('provider = ?'); binds.push(input.provider); }
  if (input.startDate !== undefined) { sets.push('start_date = ?'); binds.push(input.startDate); }
  if (input.endDate !== undefined) { sets.push('end_date = ?'); binds.push(input.endDate); }
  if (input.status !== undefined) { sets.push('status = ?'); binds.push(input.status); }
  if (input.matched !== undefined) { sets.push('matched = ?'); binds.push(input.matched ? 1 : 0); }
  if (input.unmatchedReason !== undefined) { sets.push('unmatched_reason = ?'); binds.push(input.unmatchedReason ?? null); }
  if (input.planClass !== undefined) { sets.push('plan_class = ?'); binds.push(input.planClass ?? null); }
  if (input.nationality !== undefined) { sets.push('nationality = ?'); binds.push(input.nationality ?? null); }
  if (input.memberName !== undefined) { sets.push('member_name = ?'); binds.push(input.memberName ?? null); }
  if (input.reviewFlags !== undefined) { sets.push('review_flags_json = ?'); binds.push(input.reviewFlags ? JSON.stringify(input.reviewFlags) : null); }
  if (input.sourceFileId !== undefined) { sets.push('source_file_id = ?'); binds.push(input.sourceFileId); }
  if (sets.length === 0) return;
  binds.push(id);
  try {
    await env.DB
      .prepare(`UPDATE insurance_policies SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...binds)
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/no such column/i.test(msg)) throw err;
    // Legacy schema fallback (pre-migration columns).
    const legacySets: string[] = [];
    const legacyBinds: unknown[] = [];
    if (input.employeeId !== undefined) { legacySets.push('employee_id = ?'); legacyBinds.push(input.employeeId); }
    if (input.identityNumber !== undefined) { legacySets.push('identity_number = ?'); legacyBinds.push(input.identityNumber); }
    if (input.policyNumber !== undefined) { legacySets.push('policy_number = ?'); legacyBinds.push(input.policyNumber); }
    if (input.memberNumber !== undefined) { legacySets.push('member_number = ?'); legacyBinds.push(input.memberNumber); }
    if (input.provider !== undefined) { legacySets.push('provider = ?'); legacyBinds.push(input.provider); }
    if (input.startDate !== undefined) { legacySets.push('start_date = ?'); legacyBinds.push(input.startDate); }
    if (input.endDate !== undefined) { legacySets.push('end_date = ?'); legacyBinds.push(input.endDate); }
    if (input.status !== undefined) { legacySets.push('status = ?'); legacyBinds.push(input.status); }
    if (input.matched !== undefined) { legacySets.push('matched = ?'); legacyBinds.push(input.matched ? 1 : 0); }
    if (input.unmatchedReason !== undefined) { legacySets.push('unmatched_reason = ?'); legacyBinds.push(input.unmatchedReason ?? null); }
    if (input.sourceFileId !== undefined) { legacySets.push('source_file_id = ?'); legacyBinds.push(input.sourceFileId); }
    if (legacySets.length === 0) return;
    legacyBinds.push(id);
    await env.DB
      .prepare(`UPDATE insurance_policies SET ${legacySets.join(', ')} WHERE id = ?`)
      .bind(...legacyBinds)
      .run();
  }
}
