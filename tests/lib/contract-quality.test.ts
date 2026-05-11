/**
 * Phase 3D unit tests for `computeContractDataQualityIssue`.
 *
 * The helper is a pure function and the tests pin its boundary
 * behaviour. Every issue type is exercised plus the happy path
 * (a normal one-year fixed-term contract returns `undefined`).
 *
 * Real production scope these tests guard:
 *   - 90 contracts with negative duration → `duration_negative`
 *   - 53 contracts with >3-year duration → `duration_over_3_years`
 *   - the broken row ctr_76f8321af33906df (start 2023-11-01,
 *     end 2035-03-02, ≈ 11.3 years) → `duration_over_3_years`
 */
import { describe, it, expect } from 'vitest';
import { computeContractDataQualityIssue } from '../../worker/src/lib/contract-quality';

describe('computeContractDataQualityIssue', () => {
  it('returns undefined for a normal one-year fixed-term contract', () => {
    expect(
      computeContractDataQualityIssue({
        startDate: '2024-01-01',
        endDate: '2025-01-01',
      }),
    ).toBeUndefined();
  });

  it('returns duration_negative when end < start', () => {
    expect(
      computeContractDataQualityIssue({
        startDate: '2025-06-01',
        endDate: '2025-05-30',
      }),
    ).toBe('duration_negative');
  });

  it('returns duration_over_3_years for a 4-year window', () => {
    expect(
      computeContractDataQualityIssue({
        startDate: '2020-01-01',
        endDate: '2024-06-30',
      }),
    ).toBe('duration_over_3_years');
  });

  it('flags the specific production bug row (Nov 2023 → Mar 2035)', () => {
    // ctr_76f8321af33906df from the user-reported incident.
    expect(
      computeContractDataQualityIssue({
        startDate: '2023-11-01',
        endDate: '2035-03-02',
      }),
    ).toBe('duration_over_3_years');
  });

  it('returns duration_under_30_days when end−start < 30 days', () => {
    expect(
      computeContractDataQualityIssue({
        startDate: '2025-01-01',
        endDate: '2025-01-15',
      }),
    ).toBe('duration_under_30_days');
  });

  it('returns start_date_missing when start is empty', () => {
    expect(
      computeContractDataQualityIssue({
        startDate: '',
        endDate: '2025-01-01',
      }),
    ).toBe('start_date_missing');
    expect(
      computeContractDataQualityIssue({
        startDate: null,
        endDate: '2025-01-01',
      }),
    ).toBe('start_date_missing');
  });

  it('returns end_date_missing when end is empty', () => {
    expect(
      computeContractDataQualityIssue({
        startDate: '2025-01-01',
        endDate: '',
      }),
    ).toBe('end_date_missing');
    expect(
      computeContractDataQualityIssue({
        startDate: '2025-01-01',
        endDate: null,
      }),
    ).toBe('end_date_missing');
  });

  it('treats malformed ISO strings as the corresponding missing field', () => {
    expect(
      computeContractDataQualityIssue({
        startDate: 'not-a-date',
        endDate: '2025-01-01',
      }),
    ).toBe('start_date_missing');
    expect(
      computeContractDataQualityIssue({
        startDate: '2025-01-01',
        endDate: 'tomorrow',
      }),
    ).toBe('end_date_missing');
  });

  it('treats exactly 3 years as still acceptable (boundary)', () => {
    // 365*3 + 1 = 1096 days. Anything <= 1096 days should pass.
    expect(
      computeContractDataQualityIssue({
        startDate: '2024-01-01',
        endDate: '2026-12-31',
      }),
    ).toBeUndefined();
  });

  it('treats exactly 30 days as still acceptable (boundary)', () => {
    expect(
      computeContractDataQualityIssue({
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      }),
    ).toBeUndefined();
  });
});
