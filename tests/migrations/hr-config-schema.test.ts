/**
 * Phase 6A-1 — migration + seed shape assertions.
 *
 * Static checks against the SQL files. We don't spin up a real SQLite here
 * (the route + repo tests cover behaviour with mock D1); this test ensures
 * the migration:
 *
 *   - creates all 14 hr_* tables
 *   - uses `CREATE TABLE IF NOT EXISTS` only — never ALTER / DROP / DELETE /
 *     UPDATE / TRUNCATE against existing business tables
 *   - never references the production business tables (employees,
 *     contracts, insurance_policies, employee_documents, employee_transactions)
 *     except via FK declarations (which are read-only)
 *
 * And ensures the seed:
 *   - uses INSERT OR IGNORE only (idempotent)
 *   - includes every code listed in the Phase 6A-1 brief
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const MIGRATION = readFileSync(join(ROOT, 'worker', 'migrations', '0006_hr_configuration_foundation.sql'), 'utf8');
const SEED      = readFileSync(join(ROOT, 'worker', 'seed', 'seed-hr-config.sql'), 'utf8');

/** Strip SQL line comments so structural assertions ignore prose. */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}
const MIGRATION_CODE = stripComments(MIGRATION);
const SEED_CODE      = stripComments(SEED);

const EXPECTED_TABLES = [
  'hr_org_units',
  'hr_job_titles',
  'hr_positions',
  'hr_grades',
  'hr_trades',
  'hr_contract_types',
  'hr_payroll_components',
  'hr_medical_providers',
  'hr_medical_policy_classes',
  'hr_document_types',
  'hr_transaction_types',
  'hr_activity_types',
  'hr_learning_categories',
  'hr_social_insurance_rules',
];

describe('migration 0006 — additive HR config foundation', () => {
  it('creates all 14 expected tables', () => {
    for (const t of EXPECTED_TABLES) {
      const re = new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${t}\\b`, 'i');
      expect(MIGRATION).toMatch(re);
    }
  });

  it('uses only additive statements (CREATE … IF NOT EXISTS)', () => {
    // Forbidden destructive verbs — none should appear in actual SQL
    // (comments are stripped). `ON DELETE …` is part of FK declarations
    // and is allowed; we narrow the DELETE check to standalone DELETE.
    expect(MIGRATION_CODE).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(MIGRATION_CODE).not.toMatch(/\bDROP\b/i);
    // DELETE statement (not "ON DELETE" cascade clause).
    expect(MIGRATION_CODE).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(MIGRATION_CODE).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i);
    expect(MIGRATION_CODE).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('references existing business tables ONLY in FK declarations', () => {
    const businessTables = [
      'employees', 'contracts', 'insurance_policies',
      'employee_documents', 'employee_transactions',
      'audit_events', 'review_queue', 'source_files',
    ];
    for (const t of businessTables) {
      // No INSERT/UPDATE/DELETE/ALTER targeting business tables.
      expect(MIGRATION_CODE).not.toMatch(new RegExp(`\\bINSERT\\s+INTO\\s+${t}\\b`, 'i'));
      expect(MIGRATION_CODE).not.toMatch(new RegExp(`\\bUPDATE\\s+${t}\\s+SET\\b`, 'i'));
      expect(MIGRATION_CODE).not.toMatch(new RegExp(`\\bDELETE\\s+FROM\\s+${t}\\b`, 'i'));
      expect(MIGRATION_CODE).not.toMatch(new RegExp(`\\bALTER\\s+TABLE\\s+${t}\\b`, 'i'));
    }
    // FK to employees(id) IS expected on hr_org_units.manager_employee_id.
    expect(MIGRATION_CODE).toMatch(/manager_employee_id\s+TEXT\s+REFERENCES\s+employees\(id\)/i);
  });

  it('every table has the audit columns', () => {
    for (const t of EXPECTED_TABLES) {
      // Find the CREATE TABLE block for this table and assert audit cols inside.
      const blockRe = new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${t}\\b[\\s\\S]*?\\);`, 'i');
      const m = MIGRATION.match(blockRe);
      expect(m, `block for ${t}`).toBeTruthy();
      const block = m![0];
      expect(block, `created_at on ${t}`).toMatch(/\bcreated_at\b/);
      expect(block, `created_by on ${t}`).toMatch(/\bcreated_by\b/);
      expect(block, `updated_at on ${t}`).toMatch(/\bupdated_at\b/);
      expect(block, `updated_by on ${t}`).toMatch(/\bupdated_by\b/);
    }
  });

  it('every table has UNIQUE code (except hr_social_insurance_rules which is UNIQUE(code, effective_from))', () => {
    const exempt = new Set(['hr_social_insurance_rules', 'hr_positions']);
    for (const t of EXPECTED_TABLES) {
      if (exempt.has(t)) continue;
      const blockRe = new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${t}\\b[\\s\\S]*?\\);`, 'i');
      const m = MIGRATION.match(blockRe);
      expect(m, `block for ${t}`).toBeTruthy();
      const block = m![0];
      // `code TEXT NOT NULL UNIQUE,`
      expect(block, `UNIQUE code on ${t}`).toMatch(/code\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);
    }
    // hr_social_insurance_rules uses UNIQUE (code, effective_from) for rate history.
    expect(MIGRATION).toMatch(/UNIQUE\s*\(\s*code\s*,\s*effective_from\s*\)/i);
    // hr_positions: code is UNIQUE; positions have no name column by design.
    const posBlock = MIGRATION.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+hr_positions[\s\S]*?\);/i);
    expect(posBlock).toBeTruthy();
    expect(posBlock![0]).toMatch(/code\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);
  });
});

describe('seed-hr-config.sql — idempotent + correct codes', () => {
  it('uses only INSERT OR IGNORE (never plain INSERT, UPDATE, DELETE)', () => {
    // Allow plain INSERT only if wrapped as INSERT OR IGNORE.
    const plainInserts = SEED_CODE.match(/\bINSERT(?!\s+OR\s+IGNORE)\b/gi) ?? [];
    expect(plainInserts).toEqual([]);
    expect(SEED_CODE).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(SEED_CODE).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i);
    expect(SEED_CODE).not.toMatch(/\bDROP\b/i);
    expect(SEED_CODE).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('seeds every required contract type code', () => {
    for (const code of [
      'CONTRACT_FIXED_TERM','CONTRACT_INDEFINITE','CONTRACT_PROBATION',
      'CONTRACT_RENEWAL','CONTRACT_AMENDMENT',
    ]) expect(SEED).toContain(code);
  });

  it('seeds every required document type code', () => {
    for (const code of [
      'DOC_IQAMA','DOC_PASSPORT','DOC_VISA','DOC_WORK_PERMIT',
      'DOC_CONTRACT_PDF','DOC_INSURANCE_CARD','DOC_CERTIFICATE','DOC_OTHER',
    ]) expect(SEED).toContain(code);
  });

  it('seeds every required transaction type code', () => {
    for (const code of [
      'TXN_FLIGHT_TICKET','TXN_IQAMA_RENEWAL','TXN_EXIT_REENTRY','TXN_VACATION',
      'TXN_SALARY_ADJUSTMENT','TXN_ALLOWANCE_CHANGE','TXN_WARNING','TXN_DOCUMENT_REQUEST',
      'TXN_CONTRACT_RENEWAL','TXN_INSURANCE_UPDATE','TXN_SOCIAL_INSURANCE_UPDATE',
      'TXN_TRAINING','TXN_PROMOTION','TXN_TRANSFER','TXN_TERMINATION','TXN_OTHER',
    ]) expect(SEED).toContain(code);
  });

  it('seeds every required activity type code', () => {
    for (const code of [
      'ACT_SEND_MESSAGE','ACT_LOG_NOTE','ACT_FOLLOW_UP','ACT_REVIEW_REQUEST',
      'ACT_DOCUMENT_FOLLOW_UP','ACT_CONTRACT_RENEWAL_REMINDER','ACT_INSURANCE_EXPIRY_REMINDER',
    ]) expect(SEED).toContain(code);
  });

  it('seeds every required payroll, medical, and learning code', () => {
    for (const code of [
      'PAY_BASIC','PAY_HOUSING','PAY_TRANSPORT','PAY_FOOD','PAY_OTHER','PAY_DEDUCTION',
      'MED_PROVIDER_BUPA','MED_PROVIDER_TAWUNIYA','MED_PROVIDER_MEDGULF',
      'MED_CLASS_A','MED_CLASS_B','MED_CLASS_C','MED_CLASS_VIP',
      'LEARNING_CERTIFICATION','LEARNING_TRAINING','LEARNING_SKILL','LEARNING_EXPERIENCE',
    ]) expect(SEED).toContain(code);
  });
});
