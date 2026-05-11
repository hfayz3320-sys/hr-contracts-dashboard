/**
 * Read-time data-quality checks for Contract rows — Phase 3D.
 *
 * Why
 * ---
 * The Phase 2C PDF parsers can misextract start/end dates when labelled
 * extraction fails and the positional fallback ("first two dates whose
 * Gregorian year ≥ 2000") picks up unrelated dates the MoHRSD template
 * also prints (employee ID expiry, work permit expiry, commercial
 * registration expiry, etc.). In production this produces:
 *
 *   - 90 contracts with NEGATIVE duration (end before start)
 *   - 53 contracts with > 3-year duration (often 5-12 years)
 *
 * The stored `contracts.status` column says `active` because today
 * falls inside the (wrong) window. We don't want to silently mark
 * those rows green in the UI — we want a "Review required" banner
 * with a precise reason.
 *
 * This module exposes a pure function that returns the first
 * applicable issue, in priority order, or `undefined` if the row
 * looks plausible. It is called by `rowToContract` on every read,
 * so the FE never has to recompute date math.
 *
 * Thresholds
 * ----------
 *   3 years = 1096 days  (3 × 365 + 1 for leap year, generous so MID's
 *                          standard 12-month contracts pass cleanly even
 *                          if rounded)
 *   30 days              (anything shorter than a month is almost
 *                          certainly a parser mis-pair, e.g. ID-issued-on
 *                          vs ID-expires-on)
 *
 * These are deliberately broad. False positives ("flagged for review
 * but actually fine") are cheap — admins clear them. False negatives
 * ("wrong dates that slipped through") are expensive — they show up
 * in the contracts dashboard as authoritative.
 */
import type { ContractDataQualityIssue } from '@shared/domain';

const THREE_YEARS_DAYS = 365 * 3 + 1;
const MIN_PLAUSIBLE_DAYS = 30;

function isoToDays(iso: string): number | null {
  // Parse YYYY-MM-DD to UTC midnight milliseconds, then to whole days.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  if (!Number.isFinite(t)) return null;
  return Math.floor(t / 86400000);
}

export interface ContractQualityInput {
  startDate: string | null | undefined;
  endDate: string | null | undefined;
}

/**
 * Return the highest-priority data-quality issue for this contract,
 * or `undefined` if none apply.
 *
 * Priority order (descending severity):
 *   1. start_date_missing       — can't render anything date-related
 *   2. end_date_missing         — same
 *   3. duration_negative        — end before start; provably wrong
 *   4. duration_over_3_years    — unusually long for fixed-term
 *   5. duration_under_30_days   — unusually short for fixed-term
 */
export function computeContractDataQualityIssue(
  input: ContractQualityInput,
): ContractDataQualityIssue | undefined {
  if (!input.startDate) return 'start_date_missing';
  if (!input.endDate) return 'end_date_missing';

  const startDays = isoToDays(input.startDate);
  const endDays = isoToDays(input.endDate);
  // Malformed ISO strings — treat as missing of the offending end.
  if (startDays == null) return 'start_date_missing';
  if (endDays == null) return 'end_date_missing';

  const durationDays = endDays - startDays;
  if (durationDays < 0) return 'duration_negative';
  if (durationDays > THREE_YEARS_DAYS) return 'duration_over_3_years';
  if (durationDays < MIN_PLAUSIBLE_DAYS) return 'duration_under_30_days';
  return undefined;
}

/**
 * Human-readable label for each issue — re-exported here so the FE
 * does not need a parallel translation table. Imported by columns +
 * ContractDrawer.
 */
export const contractDataQualityIssueLabel: Record<ContractDataQualityIssue, string> = {
  duration_negative: 'End date is before start date',
  duration_over_3_years: 'Contract duration exceeds 3 years',
  duration_under_30_days: 'Contract duration is less than 30 days',
  start_date_missing: 'Start date is missing',
  end_date_missing: 'End date is missing',
};
