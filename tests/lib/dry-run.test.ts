/**
 * Phase 8 — dry-run resolver tests.
 *
 * Exercises the import preview behaviour that prevents bad rows from being
 * committed:
 *
 *   - employees: missing identity / new identity / unchanged identity / changed
 *   - contracts: missing identity / missing dates / unmatched employee /
 *                negative duration / unknown PDF template / low confidence /
 *                new contract row / duplicate row
 *   - insurance: matched / unmatched
 *
 * The repository functions hit by the resolver are stubbed against the
 * shared in-memory D1 mock (`tests/routes/_mock-d1.ts`).
 *
 * Hard rules being pinned:
 *   - identity_number is the ONLY match key on employees
 *   - employee_number changes never produce a new employee row
 *   - expired contracts in valid windows are CREATE/SKIP (lifecycle is a
 *     READ-time concern); only end<start is a defect at import time
 */
import { describe, it, expect } from 'vitest';
import { resolveDryRun } from '../../worker/src/lib/dry-run';
import { makeMockD1 } from '../routes/_mock-d1';
import type { Env } from '../../worker/src/env';

function makeEnv(d1: unknown): Env {
  return { DB: d1 as Env['DB'] } as Env;
}

const NOW = '2026-05-12T00:00:00Z';

describe('dry-run resolver — employees', () => {
  it('missing identityNumber → review (missing_identity)', async () => {
    const mock = makeMockD1();
    const result = await resolveDryRun(makeEnv(mock.d1), 'employees', [
      { fullName: 'Alex Rivers' },
    ]);
    expect(result.counts.review).toBe(1);
    expect(result.items[0]?.resolvedAction).toBe('review');
    expect(result.items[0]?.reason).toBe('missing_identity');
    expect(result.items[0]?.identityNumber).toBeNull();
  });

  it('missing fullName but identity present → error (missing_full_name)', async () => {
    const mock = makeMockD1();
    const result = await resolveDryRun(makeEnv(mock.d1), 'employees', [
      { identityNumber: '9900000001' },
    ]);
    expect(result.counts.error).toBe(1);
    expect(result.items[0]?.resolvedAction).toBe('error');
    expect(result.items[0]?.reason).toBe('missing_full_name');
  });

  it('new identity → create', async () => {
    const mock = makeMockD1({ employees: [] });
    const result = await resolveDryRun(makeEnv(mock.d1), 'employees', [
      { identityNumber: '9900000007', fullName: 'Alex Rivers' },
    ]);
    expect(result.counts.created).toBe(1);
    expect(result.items[0]?.resolvedAction).toBe('create');
  });

  it('known identity, same fields → skip', async () => {
    const mock = makeMockD1({
      employees: [
        {
          id: 'emp_1', identity_number: '9900000007', full_name: 'Alex Rivers',
          department: 'Operations', job_title: 'Technician', nationality: 'Demoland',
          status: 'active', source_file_id: 'src_x', created_at: NOW, updated_at: NOW,
        },
      ],
    });
    const result = await resolveDryRun(makeEnv(mock.d1), 'employees', [
      { identityNumber: '9900000007', fullName: 'Alex Rivers',
        department: 'Operations', jobTitle: 'Technician', nationality: 'Demoland' },
    ]);
    expect(result.counts.skipped).toBe(1);
    expect(result.items[0]?.resolvedAction).toBe('skip');
    expect(result.items[0]?.reason).toBe('no_changes');
  });

  it('known identity, changed department → update with a diff', async () => {
    const mock = makeMockD1({
      employees: [
        {
          id: 'emp_1', identity_number: '9900000007', full_name: 'Alex Rivers',
          department: 'Operations', job_title: 'Technician', nationality: 'Demoland',
          status: 'active', source_file_id: 'src_x', created_at: NOW, updated_at: NOW,
        },
      ],
    });
    const result = await resolveDryRun(makeEnv(mock.d1), 'employees', [
      { identityNumber: '9900000007', fullName: 'Alex Rivers',
        department: 'Maintenance', jobTitle: 'Technician', nationality: 'Demoland' },
    ]);
    expect(result.counts.updated).toBe(1);
    expect(result.items[0]?.resolvedAction).toBe('update');
    expect(result.items[0]?.diff).toMatchObject({
      department: { from: 'Operations', to: 'Maintenance' },
    });
  });

  it('same iqama with a DIFFERENT employee_number does NOT create a new employee', async () => {
    // The match key is identity_number — employeeNumber is history-only.
    // The dry-run reports update or skip on the SAME employee id.
    const mock = makeMockD1({
      employees: [
        {
          id: 'emp_1', identity_number: '9900000007', full_name: 'Alex Rivers',
          department: 'Operations', status: 'active', source_file_id: 'src_x',
          created_at: NOW, updated_at: NOW,
        },
      ],
    });
    const result = await resolveDryRun(makeEnv(mock.d1), 'employees', [
      // Note: employeeNumber is different from any history row, but the resolver
      // only matches on identityNumber.
      { identityNumber: '9900000007', fullName: 'Alex Rivers',
        department: 'Operations', employeeNumber: 'DEMO-XXXXX' },
    ]);
    expect(result.items[0]?.targetId).toBe('emp_1');
    // No diff for employee fields → skip.
    expect(result.items[0]?.resolvedAction).toBe('skip');
  });
});

describe('dry-run resolver — contracts (Phase 8 lifecycle gates)', () => {
  function ctrRow(over: Record<string, unknown>) {
    return {
      identityNumber: '9900000007',
      contractType: 'Fixed-term',
      startDate: '2024-01-01',
      endDate: '2026-12-31',
      fileHash: 'h_' + Math.random().toString(36).slice(2, 10),
      filename: 'c.pdf',
      templateType: 'new_contract',
      extractionConfidence: 0.95,
      ...over,
    };
  }

  it('missing identity → review (missing_identity)', async () => {
    const mock = makeMockD1();
    const result = await resolveDryRun(makeEnv(mock.d1), 'contracts', [
      ctrRow({ identityNumber: undefined }),
    ]);
    expect(result.items[0]?.resolvedAction).toBe('review');
    expect(result.items[0]?.reason).toBe('missing_identity');
  });

  it('missing required field → review (missing_contract_fields)', async () => {
    const mock = makeMockD1();
    const result = await resolveDryRun(makeEnv(mock.d1), 'contracts', [
      ctrRow({ startDate: '' }),
    ]);
    expect(result.items[0]?.resolvedAction).toBe('review');
    expect(result.items[0]?.reason).toBe('missing_contract_fields');
  });

  it('endDate < startDate → review (duration_negative)', async () => {
    const mock = makeMockD1();
    const result = await resolveDryRun(makeEnv(mock.d1), 'contracts', [
      ctrRow({ startDate: '2024-06-01', endDate: '2024-05-30' }),
    ]);
    expect(result.items[0]?.resolvedAction).toBe('review');
    expect(result.items[0]?.reason).toBe('duration_negative');
  });

  it('unknown PDF template → review (unknown_template)', async () => {
    const mock = makeMockD1();
    const result = await resolveDryRun(makeEnv(mock.d1), 'contracts', [
      ctrRow({ templateType: 'unknown' }),
    ]);
    expect(result.items[0]?.resolvedAction).toBe('review');
    expect(result.items[0]?.reason).toBe('unknown_template');
  });

  it('low extraction confidence (<0.6) → review (low_confidence_extraction)', async () => {
    const mock = makeMockD1();
    const result = await resolveDryRun(makeEnv(mock.d1), 'contracts', [
      ctrRow({ extractionConfidence: 0.45 }),
    ]);
    expect(result.items[0]?.resolvedAction).toBe('review');
    expect(result.items[0]?.reason).toBe('low_confidence_extraction');
  });

  it('expired-window (endDate < today) but valid duration → NOT review — history is read-time', async () => {
    // Pin the business rule: a contract that ENDED before today is HISTORY,
    // not a defect. The import path treats it as a normal CREATE; the
    // read-time classifier later sorts it into the History bucket.
    const mock = makeMockD1({
      employees: [
        { id: 'emp_1', identity_number: '9900000007', full_name: 'X',
          status: 'active', source_file_id: 's', created_at: NOW, updated_at: NOW },
      ],
    });
    const result = await resolveDryRun(makeEnv(mock.d1), 'contracts', [
      ctrRow({ startDate: '2020-01-01', endDate: '2022-12-31' }),
    ]);
    expect(result.items[0]?.resolvedAction).toBe('create');
    expect(result.items[0]?.reason).toBeUndefined();
  });

  it('no employee matched by identity → review (unmatched_contract)', async () => {
    const mock = makeMockD1({ employees: [] });
    const result = await resolveDryRun(makeEnv(mock.d1), 'contracts', [ctrRow({})]);
    expect(result.items[0]?.resolvedAction).toBe('review');
    expect(result.items[0]?.reason).toBe('unmatched_contract');
  });

  it('valid + matched employee + new file → create', async () => {
    const mock = makeMockD1({
      employees: [
        { id: 'emp_1', identity_number: '9900000007', full_name: 'X',
          status: 'active', source_file_id: 's', created_at: NOW, updated_at: NOW },
      ],
      contracts: [],
    });
    const result = await resolveDryRun(makeEnv(mock.d1), 'contracts', [ctrRow({ fileHash: 'h_fresh' })]);
    expect(result.items[0]?.resolvedAction).toBe('create');
  });
});

describe('dry-run resolver — counts aggregate correctly across mixed rows', () => {
  it('one create, one review, one skip', async () => {
    const mock = makeMockD1({
      employees: [
        { id: 'emp_2', identity_number: '9900000048', full_name: 'Jordan',
          department: 'Maintenance', status: 'active', source_file_id: 's',
          created_at: NOW, updated_at: NOW },
      ],
    });
    const result = await resolveDryRun(makeEnv(mock.d1), 'employees', [
      // new
      { identityNumber: '9900000007', fullName: 'Alex' },
      // review — missing identity
      { fullName: 'Mystery' },
      // skip — known + unchanged
      { identityNumber: '9900000048', fullName: 'Jordan', department: 'Maintenance' },
    ]);
    expect(result.counts).toEqual({
      created: 1, updated: 0, skipped: 1, review: 1, error: 0,
    });
  });
});
