/**
 * A5.1 — Contract lifecycle splitter tests.
 *
 * Pins the corrected business rule:
 *   - Old / expired / long / short contracts are HISTORY, not defects.
 *   - Only end_date < start_date, missing dates, empty type, or unmatched
 *     identity → Review Required.
 */
import { describe, it, expect } from 'vitest';
import {
  splitContractsByLifecycle,
  isContractReviewRequired,
  contractDataQualityLabel,
  isInformationalDataQualityFlag,
  classifyContractLifecycle,
} from '../../src/lib/contract-lifecycle';
import type { Contract } from '@shared/domain';

// Minimal contract factory — every test row inherits sensible defaults and
// overrides only the fields it cares about.
function c(over: Partial<Contract>): Contract {
  return {
    id: over.id ?? 'ctr_x',
    employeeId: over.employeeId ?? 'emp_x',
    identityNumber: over.identityNumber ?? '1234567890',
    contractType: over.contractType ?? 'Fixed-term',
    startDate: over.startDate ?? '2025-01-01',
    endDate: over.endDate ?? '2026-01-01',
    status: over.status ?? 'active',
    version: over.version ?? 1,
    fileHash: over.fileHash ?? 'hash_x',
    filename: over.filename ?? 'contract.pdf',
    createdAt: over.createdAt ?? '2025-01-01T00:00:00Z',
    ...over,
  } as Contract;
}

describe('isContractReviewRequired', () => {
  it('returns false for a clean current contract', () => {
    expect(
      isContractReviewRequired(c({ startDate: '2025-01-01', endDate: '2026-01-01' })),
    ).toBe(false);
  });

  it('flags end_date < start_date', () => {
    expect(
      isContractReviewRequired(c({ startDate: '2025-06-01', endDate: '2025-05-30' })),
    ).toBe(true);
  });

  it('flags empty contract_type', () => {
    expect(isContractReviewRequired(c({ contractType: '   ' }))).toBe(true);
  });

  it('flags missing identity_number', () => {
    expect(isContractReviewRequired(c({ identityNumber: '' }))).toBe(true);
  });

  it('flags empty employee_id (unmatched)', () => {
    expect(isContractReviewRequired(c({ employeeId: '' }))).toBe(true);
  });

  it('does NOT flag duration_over_3_years (informational only)', () => {
    expect(
      isContractReviewRequired(
        c({ startDate: '2020-01-01', endDate: '2025-01-01', dataQualityIssue: 'duration_over_3_years' }),
      ),
    ).toBe(false);
  });

  it('does NOT flag duration_under_30_days (informational only)', () => {
    expect(
      isContractReviewRequired(
        c({ startDate: '2025-06-01', endDate: '2025-06-15', dataQualityIssue: 'duration_under_30_days' }),
      ),
    ).toBe(false);
  });

  it('flags server-attached duration_negative', () => {
    expect(
      isContractReviewRequired(
        c({ startDate: '2025-01-01', endDate: '2026-01-01', dataQualityIssue: 'duration_negative' }),
      ),
    ).toBe(true);
  });
});

describe('splitContractsByLifecycle', () => {
  const today = '2026-05-12';

  it('places a single active contract into current', () => {
    const split = splitContractsByLifecycle(
      [c({ id: 'ctr_a', startDate: '2025-01-01', endDate: '2026-12-31' })],
      today,
    );
    expect(split.current?.id).toBe('ctr_a');
    expect(split.future).toEqual([]);
    expect(split.history).toEqual([]);
    expect(split.reviewRequired).toEqual([]);
  });

  it('places a future contract into future', () => {
    const split = splitContractsByLifecycle(
      [c({ id: 'ctr_future', startDate: '2027-01-01', endDate: '2028-01-01' })],
      today,
    );
    expect(split.current).toBeNull();
    expect(split.future.map((x) => x.id)).toEqual(['ctr_future']);
  });

  it('places an expired contract into history', () => {
    const split = splitContractsByLifecycle(
      [c({ id: 'ctr_old', startDate: '2020-01-01', endDate: '2021-01-01' })],
      today,
    );
    expect(split.current).toBeNull();
    expect(split.history.map((x) => x.id)).toEqual(['ctr_old']);
  });

  it('places a negative-duration contract into reviewRequired (history-looking dates do not save it)', () => {
    const split = splitContractsByLifecycle(
      [c({ id: 'ctr_bad', startDate: '2025-06-01', endDate: '2025-05-30' })],
      today,
    );
    expect(split.reviewRequired.map((x) => x.id)).toEqual(['ctr_bad']);
    expect(split.history).toEqual([]);
  });

  it('picks the latest active as current; older overlap slides into history', () => {
    const split = splitContractsByLifecycle(
      [
        c({ id: 'ctr_old_overlap', startDate: '2024-01-01', endDate: '2027-01-01' }),
        c({ id: 'ctr_newer',      startDate: '2025-01-01', endDate: '2028-01-01' }),
      ],
      today,
    );
    expect(split.current?.id).toBe('ctr_newer');
    expect(split.history.map((x) => x.id)).toEqual(['ctr_old_overlap']);
  });

  it('handles a realistic 4-bucket mix', () => {
    const split = splitContractsByLifecycle(
      [
        c({ id: 'h1',   startDate: '2018-01-01', endDate: '2019-01-01' }),                                  // history (oldest)
        c({ id: 'h2',   startDate: '2020-01-01', endDate: '2022-01-01' }),                                  // history (mid)
        c({ id: 'cur',  startDate: '2025-06-01', endDate: '2027-01-01' }),                                  // current
        c({ id: 'fut',  startDate: '2028-01-01', endDate: '2030-01-01' }),                                  // future
        c({ id: 'rev',  startDate: '2024-06-01', endDate: '2024-01-01' }),                                  // review (neg)
        c({ id: 'long', startDate: '2025-01-01', endDate: '2030-01-01',                                     // current with informational flag
            dataQualityIssue: 'duration_over_3_years' }),
      ],
      today,
    );

    expect(split.current?.id).toBe('long');                       // latest end_date wins
    expect(split.future.map((x) => x.id)).toEqual(['fut']);
    expect(split.history.map((x) => x.id)).toEqual(['cur', 'h2', 'h1']);  // current overlap slides + sort by end desc
    expect(split.reviewRequired.map((x) => x.id)).toEqual(['rev']);
  });
});

describe('contractDataQualityLabel + isInformationalDataQualityFlag', () => {
  it('labels every enum value', () => {
    expect(contractDataQualityLabel('duration_negative')).toBe('End before start');
    expect(contractDataQualityLabel('duration_over_3_years')).toBe('Long-term (>3y)');
    expect(contractDataQualityLabel('duration_under_30_days')).toBe('Short-term (<30d)');
    expect(contractDataQualityLabel('start_date_missing')).toBe('Start date missing');
    expect(contractDataQualityLabel('end_date_missing')).toBe('End date missing');
    expect(contractDataQualityLabel(undefined)).toBeNull();
  });

  it('only marks duration_over_3_years / duration_under_30_days as informational', () => {
    expect(isInformationalDataQualityFlag('duration_over_3_years')).toBe(true);
    expect(isInformationalDataQualityFlag('duration_under_30_days')).toBe(true);
    expect(isInformationalDataQualityFlag('duration_negative')).toBe(false);
    expect(isInformationalDataQualityFlag('start_date_missing')).toBe(false);
    expect(isInformationalDataQualityFlag(undefined)).toBe(false);
  });
});

describe('classifyContractLifecycle (Phase 7B — per-contract bucket)', () => {
  it('classifies an active window covering today as current', () => {
    expect(
      classifyContractLifecycle(
        c({ startDate: '2024-01-01', endDate: '2027-01-01' }),
        '2026-05-12',
      ),
    ).toBe('current');
  });

  it('classifies a contract whose start is in the future as future', () => {
    expect(
      classifyContractLifecycle(
        c({ startDate: '2027-01-01', endDate: '2029-01-01' }),
        '2026-05-12',
      ),
    ).toBe('future');
  });

  it('classifies an expired contract as history — NOT a defect', () => {
    expect(
      classifyContractLifecycle(
        c({ startDate: '2020-01-01', endDate: '2022-01-01' }),
        '2026-05-12',
      ),
    ).toBe('history');
  });

  it('classifies a negative-duration contract as review_required', () => {
    expect(
      classifyContractLifecycle(
        c({ startDate: '2024-06-01', endDate: '2024-05-30' }),
        '2026-05-12',
      ),
    ).toBe('review_required');
  });

  it('classifies a contract with empty template as review_required', () => {
    expect(
      classifyContractLifecycle(
        c({ contractType: '', startDate: '2024-01-01', endDate: '2027-01-01' }),
        '2026-05-12',
      ),
    ).toBe('review_required');
  });

  it('classifies an unmatched (missing identity) contract as review_required', () => {
    expect(
      classifyContractLifecycle(
        c({ identityNumber: '', startDate: '2024-01-01', endDate: '2027-01-01' }),
        '2026-05-12',
      ),
    ).toBe('review_required');
  });

  it('a long-term (>3y) expired contract is still history — informational flag does not promote to defect', () => {
    expect(
      classifyContractLifecycle(
        c({
          startDate: '2018-01-01',
          endDate: '2022-01-01',
          dataQualityIssue: 'duration_over_3_years',
        }),
        '2026-05-12',
      ),
    ).toBe('history');
  });
});
