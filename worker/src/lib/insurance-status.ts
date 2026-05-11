/**
 * Centralised insurance status logic — Phase 3C.
 *
 * Single source of truth for "is this policy active, expired, or missing
 * critical fields?". Used by both the import-commit pipeline and the
 * backfill script so they cannot drift.
 *
 *   active   → today ∈ [startDate, effectiveEndDate]
 *   expired  → today > effectiveEndDate
 *   missing  → identityNumber, policyNumber, or startDate absent
 *
 * effectiveEndDate is the policy's `end_date` if known, otherwise
 * `startDate + 1 year` (Bupa CCHI does not export endDate; their policies
 * auto-renew annually so this is the documented assumption).
 *
 * Separation from `linkStatus`
 * ----------------------------
 * `status` describes the POLICY itself; `linkStatus` (computed in
 * employee-summary.ts) describes whether the policy is linked to an
 * employees row. The two were conflated in Phase 2C imports — a policy
 * with valid dates but no employee match was sometimes flagged
 * `status='missing'`, which then shows up in the dashboard's expired-
 * or-missing KPI as if the policy itself were broken. This module
 * keeps them strictly separate.
 */
export type InsurancePolicyStatus = 'active' | 'expired' | 'missing';

export interface InsuranceStatusInput {
  identityNumber: string | null | undefined;
  policyNumber: string | null | undefined;
  startDate: string | null | undefined;
  endDate: string | null | undefined;
}

function addYearISO(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y + 1, mo - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function effectiveEndDate(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): string | null {
  if (endDate) return endDate;
  if (!startDate) return null;
  return addYearISO(startDate);
}

export function computeInsuranceStatus(input: InsuranceStatusInput): InsurancePolicyStatus {
  const hasCritical = !!input.identityNumber && !!input.policyNumber && !!input.startDate;
  if (!hasCritical) return 'missing';
  const end = effectiveEndDate(input.startDate, input.endDate);
  if (!end) return 'missing';
  if (todayISO() > end) return 'expired';
  return 'active';
}
