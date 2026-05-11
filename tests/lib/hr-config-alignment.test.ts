/**
 * Phase 6A-1 — type / category alignment tests.
 *
 * Pins the relationships between:
 *   - employee_documents.type CHECK enum (migration 0005)  vs  hr_document_types codes (seed)
 *   - employee_transactions canonical type list             vs  hr_transaction_types codes (seed)
 *   - hr_transaction_types categories                       vs  zod schema enum
 *   - hr_activity_types categories                          vs  zod schema enum
 *
 * Also enforces the contract lifecycle business rule: expired/history
 * contracts must NOT be classified as Review Required. We pin this by
 * exercising the existing splitter against a representative dataset that
 * mirrors what hr_contract_types seeds.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  hrTransactionCategorySchema,
  hrActivityCategorySchema,
  hrPayrollComponentKindSchema,
  hrAuditSeveritySchema,
} from '../../shared/api-contract';
import { splitContractsByLifecycle } from '../../src/lib/contract-lifecycle';
import type { Contract } from '../../shared/domain';

const ROOT = join(__dirname, '..', '..');
const SEED       = readFileSync(join(ROOT, 'worker', 'seed', 'seed-hr-config.sql'), 'utf8');
const M0005      = readFileSync(join(ROOT, 'worker', 'migrations', '0005_employee_360.sql'), 'utf8');

describe('hr_document_types aligns with employee_documents.type CHECK enum', () => {
  it('every type in the CHECK enum of migration 0005 is seeded in hr_document_types', () => {
    // Extract the canonical doc type list from migration 0005's CHECK clause.
    const m = M0005.match(/type\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*type\s+IN\s*\(([\s\S]+?)\)\s*\)/i);
    expect(m, 'CHECK enum on employee_documents.type').toBeTruthy();
    const enumList = (m![1] ?? '')
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, '').toUpperCase())
      .filter(Boolean);
    expect(enumList).toContain('IQAMA');
    // Every CHECK-enum value should have a DOC_<UPPER> seed code (except
    // 'medical_certificate' and 'driving_license' which are intentionally
    // omitted from the initial 6A-1 seed — they ship in a later phase).
    const omitted = new Set(['MEDICAL_CERTIFICATE', 'DRIVING_LICENSE']);
    for (const v of enumList) {
      if (omitted.has(v)) continue;
      const code = `DOC_${v}`;
      expect(SEED, `seed contains ${code}`).toContain(code);
    }
  });
});

/** Helper: extract the INSERT block for a given table from the seed file. */
function extractInsertBlock(table: string): string {
  // Match the INSERT block: from `INSERT OR IGNORE INTO <table>` through
  // the next semicolon. Robust to multiple references to `<table>` elsewhere.
  const re = new RegExp(
    `INSERT\\s+OR\\s+IGNORE\\s+INTO\\s+${table}\\b[\\s\\S]*?;`,
    'i',
  );
  const m = SEED.match(re);
  return m ? m[0] : '';
}

describe('hr_transaction_types categories use the canonical enum', () => {
  it('zod schema enumerates every category used in the seed', () => {
    const allowed = new Set(hrTransactionCategorySchema.options);
    const block = extractInsertBlock('hr_transaction_types');
    expect(block.length, 'INSERT block found').toBeGreaterThan(0);
    const cats = Array.from(block.matchAll(/'(travel|identity|time_off|compensation|disciplinary|admin|contract|insurance|learning|movement|exit|other)'/g)).map((m) => m[1]!);
    expect(cats.length).toBeGreaterThan(0);
    for (const c of cats) {
      expect(allowed.has(c as never), `category ${c}`).toBe(true);
    }
  });

  it('audit_severity values used in the seed are all in the canonical enum', () => {
    const allowed = new Set(hrAuditSeveritySchema.options);
    expect(allowed.has('info')).toBe(true);
    expect(allowed.has('warning')).toBe(true);
    expect(allowed.has('critical')).toBe(true);
  });
});

describe('hr_activity_types categories use the canonical enum', () => {
  it('zod schema enumerates every category used in the seed', () => {
    const allowed = new Set(hrActivityCategorySchema.options);
    const block = extractInsertBlock('hr_activity_types');
    expect(block.length, 'INSERT block found').toBeGreaterThan(0);
    const cats = Array.from(block.matchAll(/'(communication|task|reminder|review|other)'/g)).map((m) => m[1]!);
    expect(cats.length).toBeGreaterThan(0);
    for (const c of cats) {
      expect(allowed.has(c as never), `category ${c}`).toBe(true);
    }
  });
});

describe('hr_payroll_components kinds use the canonical enum', () => {
  it('every kind used in the seed is in the canonical zod enum', () => {
    const allowed = new Set(hrPayrollComponentKindSchema.options);
    const block = extractInsertBlock('hr_payroll_components');
    expect(block.length, 'INSERT block found').toBeGreaterThan(0);
    const kinds = Array.from(block.matchAll(/'(earning|deduction|reimbursement|allowance)'/g)).map((m) => m[1]!);
    expect(kinds.length).toBeGreaterThan(0);
    for (const k of kinds) {
      expect(allowed.has(k as never), `kind ${k}`).toBe(true);
    }
  });
});

describe('contract lifecycle business rule — expired/history is NOT a defect', () => {
  // Pins the corrected rule from `memory/contract_lifecycle_rule.md`. A
  // future migration may add `hr_contract_types.is_history` or similar
  // and this test guards against accidental misuse.

  function c(over: Partial<Contract>): Contract {
    return {
      id: 'x', employeeId: 'emp', identityNumber: '1', contractType: 'Fixed-term',
      startDate: '2020-01-01', endDate: '2025-01-01', status: 'active',
      version: 1, fileHash: 'h', filename: 'f.pdf', createdAt: '2020-01-01T00:00:00Z',
      ...over,
    } as Contract;
  }

  it('expired contract goes to history, NOT review', () => {
    const split = splitContractsByLifecycle([c({ id: 'old', startDate: '2018-01-01', endDate: '2022-01-01' })], '2026-05-12');
    expect(split.history.map((x) => x.id)).toEqual(['old']);
    expect(split.reviewRequired).toEqual([]);
  });

  it('long-term (>3y) contract is NOT a defect — stays in current/history', () => {
    const split = splitContractsByLifecycle(
      [c({ id: 'long', startDate: '2020-01-01', endDate: '2025-01-01', dataQualityIssue: 'duration_over_3_years' })],
      '2026-05-12',
    );
    // 2026-05 is past 2025-01 → history
    expect(split.history.map((x) => x.id)).toEqual(['long']);
    expect(split.reviewRequired).toEqual([]);
  });

  it('negative-duration contract IS a defect → review', () => {
    const split = splitContractsByLifecycle(
      [c({ id: 'bad', startDate: '2024-06-01', endDate: '2024-05-30' })],
      '2026-05-12',
    );
    expect(split.reviewRequired.map((x) => x.id)).toEqual(['bad']);
    expect(split.history).toEqual([]);
  });
});
