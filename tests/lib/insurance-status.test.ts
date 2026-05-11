/**
 * Phase 3C unit tests for `computeInsuranceStatus` + `effectiveEndDate`.
 *
 * The Bupa CCHI source format omits an explicit endDate (annual auto-
 * renew). The status helper must therefore:
 *   - default endDate to startDate + 1 year
 *   - report `missing` only when one of identityNumber / policyNumber /
 *     startDate is truly absent
 *   - report `active` / `expired` from today's date relative to the
 *     effective end date
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  computeInsuranceStatus,
  effectiveEndDate,
} from '../../worker/src/lib/insurance-status';

function freezeDate(iso: string) {
  // Use UTC noon to avoid TZ boundary flakiness across hosts.
  vi.setSystemTime(new Date(`${iso}T12:00:00Z`));
}

describe('effectiveEndDate', () => {
  it('returns endDate when present', () => {
    expect(effectiveEndDate('2025-01-01', '2026-06-30')).toBe('2026-06-30');
  });
  it('defaults to startDate + 1 year when endDate is missing', () => {
    expect(effectiveEndDate('2025-01-01', null)).toBe('2026-01-01');
    expect(effectiveEndDate('2025-02-29', null)).toBe('2026-03-01'); // leap-day rolls over
  });
  it('returns null when both inputs are absent', () => {
    expect(effectiveEndDate(null, null)).toBeNull();
  });
});

describe('computeInsuranceStatus', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns missing when identityNumber is absent', () => {
    freezeDate('2026-05-11');
    const s = computeInsuranceStatus({
      identityNumber: null,
      policyNumber: 'P1',
      startDate: '2025-01-01',
      endDate: '2026-01-01',
    });
    expect(s).toBe('missing');
  });

  it('returns missing when policyNumber is absent', () => {
    freezeDate('2026-05-11');
    const s = computeInsuranceStatus({
      identityNumber: '1234567890',
      policyNumber: null,
      startDate: '2025-01-01',
      endDate: null,
    });
    expect(s).toBe('missing');
  });

  it('returns missing when startDate is absent', () => {
    freezeDate('2026-05-11');
    const s = computeInsuranceStatus({
      identityNumber: '1234567890',
      policyNumber: 'P1',
      startDate: null,
      endDate: '2026-12-31',
    });
    expect(s).toBe('missing');
  });

  it('returns active when today is inside the explicit window', () => {
    freezeDate('2026-05-11');
    const s = computeInsuranceStatus({
      identityNumber: '1234567890',
      policyNumber: 'P1',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(s).toBe('active');
  });

  it('returns active when endDate is missing and startDate + 1 year still covers today', () => {
    freezeDate('2026-05-11');
    const s = computeInsuranceStatus({
      identityNumber: '1234567890',
      policyNumber: 'P1',
      startDate: '2025-06-01',
      endDate: null,
    });
    // effective end = 2026-06-01 → today 2026-05-11 < 2026-06-01 → active
    expect(s).toBe('active');
  });

  it('returns expired when today is past explicit endDate', () => {
    freezeDate('2026-05-11');
    const s = computeInsuranceStatus({
      identityNumber: '1234567890',
      policyNumber: 'P1',
      startDate: '2024-01-01',
      endDate: '2025-01-01',
    });
    expect(s).toBe('expired');
  });

  it('returns expired when today is past the auto-computed +1y endDate', () => {
    freezeDate('2026-05-11');
    const s = computeInsuranceStatus({
      identityNumber: '1234567890',
      policyNumber: 'P1',
      startDate: '2024-01-01',
      endDate: null,
    });
    // effective end = 2025-01-01 → today 2026-05-11 > → expired
    expect(s).toBe('expired');
  });

  it('returns active on the start date itself (today == startDate)', () => {
    freezeDate('2026-05-11');
    const s = computeInsuranceStatus({
      identityNumber: '1234567890',
      policyNumber: 'P1',
      startDate: '2026-05-11',
      endDate: '2027-05-10',
    });
    expect(s).toBe('active');
  });

  it('returns active on the last day of coverage (today == endDate)', () => {
    freezeDate('2026-05-11');
    const s = computeInsuranceStatus({
      identityNumber: '1234567890',
      policyNumber: 'P1',
      startDate: '2025-05-11',
      endDate: '2026-05-11',
    });
    expect(s).toBe('active');
  });

  it('treats empty-string critical fields as missing', () => {
    freezeDate('2026-05-11');
    const s = computeInsuranceStatus({
      identityNumber: '',
      policyNumber: 'P1',
      startDate: '2026-01-01',
      endDate: '2027-01-01',
    });
    expect(s).toBe('missing');
  });
});
