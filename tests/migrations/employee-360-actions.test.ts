/**
 * Phase 10 — migration 0007 shape + idempotency tests.
 *
 * Static checks against the SQL file (we don't spin up SQLite here — the
 * route tests cover behaviour with mock D1):
 *   - creates the four new tables we promised
 *   - uses `CREATE TABLE IF NOT EXISTS` only
 *   - adds at least one index per new table
 *   - has expected CHECK constraints on enum-like columns
 *   - the ALTER TABLE (app_users.employee_id) is correctly scoped
 *   - does NOT modify any business table except by ALTER ADD COLUMN
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SQL = readFileSync(
  join(ROOT, 'worker', 'migrations', '0007_employee_360_actions.sql'),
  'utf8',
);

function strip(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}
const CODE = strip(SQL);

const NEW_TABLES = [
  'employee_timeline_entries',
  'employee_activities',
  'employee_compensation_lines',
  'employee_learning_records',
] as const;

describe('migration 0007 — Employee 360 actions', () => {
  it('creates all four new tables with IF NOT EXISTS', () => {
    for (const t of NEW_TABLES) {
      const re = new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${t}\\b`, 'i');
      expect(SQL, `CREATE for ${t}`).toMatch(re);
    }
  });

  it('uses no destructive verbs against existing business tables', () => {
    // No DROP, no DELETE FROM, no UPDATE ... SET, no TRUNCATE.
    expect(CODE).not.toMatch(/\bDROP\b/i);
    expect(CODE).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(CODE).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i);
    expect(CODE).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('extends app_users with employee_id (FK to employees) via ALTER', () => {
    expect(CODE).toMatch(/ALTER\s+TABLE\s+app_users\s+ADD\s+COLUMN\s+employee_id\s+TEXT\s+REFERENCES\s+employees\(id\)/i);
  });

  it('adds at least one index per new table', () => {
    for (const t of NEW_TABLES) {
      const re = new RegExp(`CREATE\\s+INDEX\\s+IF\\s+NOT\\s+EXISTS\\s+\\w+\\s+ON\\s+${t}\\b`, 'i');
      expect(SQL, `index for ${t}`).toMatch(re);
    }
  });

  it('locks down the enums on the new tables', () => {
    // timeline.entry_type
    expect(SQL).toMatch(/entry_type\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*entry_type\s+IN\s*\(\s*'message'\s*,\s*'note'\s*\)\s*\)/i);
    // activities.activity_type
    expect(SQL).toMatch(/activity_type\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*activity_type\s+IN/i);
    expect(SQL).toMatch(/'reminder'/);
    // activities.status
    expect(SQL).toMatch(/CHECK\s*\(\s*status\s+IN\s*\(\s*'open'\s*,\s*'done'\s*,\s*'cancelled'\s*\)\s*\)/i);
    // compensation.frequency
    expect(SQL).toMatch(/CHECK\s*\(\s*frequency\s+IN\s*\(\s*'monthly'\s*,\s*'yearly'\s*,\s*'one_time'\s*\)\s*\)/i);
    // compensation.source
    expect(SQL).toMatch(/CHECK\s*\(\s*source\s+IN\s*\(\s*'manual'\s*,\s*'import'\s*,\s*'contract'\s*\)\s*\)/i);
    // learning.record_type
    expect(SQL).toMatch(/record_type\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*record_type\s+IN\s*\(\s*'certification'\s*,\s*'training'\s*,\s*'skill'\s*,\s*'experience'\s*\)\s*\)/i);
  });

  it('every new table carries created_by / created_at / updated_by / updated_at', () => {
    for (const t of NEW_TABLES) {
      const block = SQL.match(new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${t}\\b[\\s\\S]*?\\);`, 'i'))?.[0];
      expect(block, `block for ${t}`).toBeTruthy();
      expect(block, `${t}.created_by`).toMatch(/\bcreated_by\b/);
      expect(block, `${t}.created_at`).toMatch(/\bcreated_at\b/);
      expect(block, `${t}.updated_by`).toMatch(/\bupdated_by\b/);
      expect(block, `${t}.updated_at`).toMatch(/\bupdated_at\b/);
    }
  });

  it('every new table references employees(id) ON DELETE CASCADE', () => {
    for (const t of NEW_TABLES) {
      const block = SQL.match(new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${t}\\b[\\s\\S]*?\\);`, 'i'))?.[0]!;
      expect(block, `${t} → employees FK`).toMatch(/REFERENCES\s+employees\(id\)\s+ON\s+DELETE\s+CASCADE/i);
    }
  });
});
