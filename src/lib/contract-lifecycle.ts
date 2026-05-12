/**
 * Contract lifecycle splitter (A5.1).
 *
 * Partitions a list of contracts into the four sections rendered on the
 * Employee 360 Contract tab:
 *
 *   1. Current Contract  — start_date ≤ today ≤ end_date, no review flag
 *   2. Future Contracts  — start_date > today, no review flag
 *   3. Contract History  — end_date < today, no review flag
 *   4. Review Required   — date logic broken / template unknown / unmatched
 *
 * Business rule (see `memory/contract_lifecycle_rule.md`):
 *
 *   Old / expired / long / short contracts are LEGITIMATE HISTORY, not data
 *   defects. Only these four categories are real review flags:
 *
 *     - duration_negative          (end_date < start_date)
 *     - start_date_missing
 *     - end_date_missing
 *     - unknown_template           (contract_type empty / not in canonical set)
 *     - unmatched                  (no FK to employees — theoretical on /employees/:id)
 *
 *   `duration_over_3_years` and `duration_under_30_days` are NOT defects.
 *   They are informational lifecycle signals; if the backend attaches them
 *   to `dataQualityIssue` we surface them as a chip on the row, but the row
 *   still lands in Current / Future / History — not Review Required.
 *
 * Backend support: the worker computes `dataQualityIssue` at read time per
 * row. We re-classify here so the FE owns the "what counts as defect" rule.
 */
import type { Contract } from '@shared/domain';

/** ISO 'YYYY-MM-DD' for a given Date (local TZ). */
export function isoDay(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** True if the contract has a defect that should hold it in Review Required. */
export function isContractReviewRequired(c: Contract): boolean {
  // Identity / matching defects.
  if (!c.identityNumber || c.identityNumber.trim() === '') return true;
  if (!c.employeeId || c.employeeId.trim() === '') return true;

  // Template defect — empty or whitespace-only contract_type.
  if (!c.contractType || c.contractType.trim() === '') return true;

  // Date defects. The backend may flag these on `dataQualityIssue`; we also
  // re-derive locally so the rule is robust to backend changes.
  if (!c.startDate || c.startDate.trim() === '') return true;
  if (!c.endDate   || c.endDate.trim()   === '') return true;
  if (c.endDate < c.startDate) return true;

  // Server-attached read-time flag — only the truly broken categories count.
  if (
    c.dataQualityIssue === 'duration_negative' ||
    c.dataQualityIssue === 'start_date_missing' ||
    c.dataQualityIssue === 'end_date_missing'
  ) {
    return true;
  }

  return false;
}

export type ContractLifecycleBucket =
  | 'current'
  | 'future'
  | 'history'
  | 'review_required';

export interface ContractLifecycleSplit {
  /** At most one — the latest active contract by end_date. */
  current: Contract | null;
  /** start_date > today, sorted ascending by start_date. */
  future: Contract[];
  /** end_date < today, sorted descending by end_date (most recent first). */
  history: Contract[];
  /** All defect rows, sorted by end_date descending then start_date. */
  reviewRequired: Contract[];
}

/**
 * Partition contracts into lifecycle sections.
 *
 * @param contracts  Raw list from `GET /api/employees/:id`
 * @param today      ISO YYYY-MM-DD; defaults to now in local TZ. Pass an
 *                   explicit value in tests for determinism.
 */
export function splitContractsByLifecycle(
  contracts: Contract[],
  today: string = isoDay(),
): ContractLifecycleSplit {
  const reviewRequired: Contract[] = [];
  const future: Contract[] = [];
  const history: Contract[] = [];
  const active: Contract[] = [];

  for (const c of contracts) {
    if (isContractReviewRequired(c)) {
      reviewRequired.push(c);
      continue;
    }
    if (c.startDate > today) {
      future.push(c);
      continue;
    }
    if (c.endDate < today) {
      history.push(c);
      continue;
    }
    // start ≤ today ≤ end and no defect → currently active.
    active.push(c);
  }

  // Sort buckets deterministically.
  future.sort((a, b) => a.startDate.localeCompare(b.startDate));
  history.sort((a, b) => b.endDate.localeCompare(a.endDate));
  reviewRequired.sort((a, b) => {
    const e = b.endDate.localeCompare(a.endDate);
    return e !== 0 ? e : b.startDate.localeCompare(a.startDate);
  });
  active.sort((a, b) => b.endDate.localeCompare(a.endDate));

  // Single "current" — the active row with the latest end_date. If an
  // employee has overlapping active contracts (rare), the older overlapping
  // one slides into History. This matches HR intent: there is one current
  // contract per employee at a time.
  const [currentRow, ...overlapping] = active;
  for (const o of overlapping) history.unshift(o);

  return {
    current: currentRow ?? null,
    future,
    history,
    reviewRequired,
  };
}

/**
 * Classify a single contract into a lifecycle bucket (Phase 7B).
 *
 * Unlike `splitContractsByLifecycle` — which scopes "current" to one row
 * per employee — this classifier looks at one contract in isolation. For
 * the global Contracts page (across all employees) every active-window
 * contract is "current"; the per-employee deduplication doesn't apply.
 *
 * Same business rule applies: old / expired / long / short contracts are
 * history, NOT defects. Only end<start / missing dates / unknown template
 * / unmatched land in review_required.
 */
export function classifyContractLifecycle(
  c: Contract,
  today: string = isoDay(),
): ContractLifecycleBucket {
  if (isContractReviewRequired(c)) return 'review_required';
  if (c.startDate > today) return 'future';
  if (c.endDate < today)   return 'history';
  return 'current';
}

/**
 * Plain-English label for the per-contract `dataQualityIssue` enum.
 * Used in chips next to rows. Informational long/short flags are shown but
 * marked clearly as informational, not as defects.
 */
export function contractDataQualityLabel(issue: Contract['dataQualityIssue']): string | null {
  switch (issue) {
    case 'duration_negative':       return 'End before start';
    case 'duration_over_3_years':   return 'Long-term (>3y)';
    case 'duration_under_30_days':  return 'Short-term (<30d)';
    case 'start_date_missing':      return 'Start date missing';
    case 'end_date_missing':        return 'End date missing';
    default:                         return null;
  }
}

/** Whether the `dataQualityIssue` is informational only (not a defect). */
export function isInformationalDataQualityFlag(issue: Contract['dataQualityIssue']): boolean {
  return issue === 'duration_over_3_years' || issue === 'duration_under_30_days';
}
