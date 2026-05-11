/**
 * Phase 3C — recompute insurance policy status from authoritative date
 * fields and re-link policies to employees by identityNumber.
 *
 * Why this script exists
 * ----------------------
 * The initial Bupa import landed 475 rows. Some rows came in with status
 * `missing` even though they had a valid startDate (and the adapter
 * auto-computed endDate = startDate + 1 year). That's because the
 * adapter previously trusted the `CCHIPolicyStatus` column verbatim:
 * any value it didn't recognise mapped to `missing`, regardless of whether
 * the row's dates put it inside an active window.
 *
 * Going forward the commit pipeline will derive status from dates
 * (active if today ∈ [startDate, endDate], expired if past endDate,
 * missing only when critical fields are absent). This script applies
 * the same logic to the existing 475 rows so the dashboard stops
 * reporting hundreds of "Missing" policies that are actually active.
 *
 * Behaviour
 * ---------
 *   - DRY RUN by default. Prints before/after counts, no DB writes.
 *   - Pass `--apply` to commit the changes inside one statement-per-row
 *     UPDATE batch. A single audit event is written summarising the run.
 *   - Pass `--remote` to target the production D1; otherwise local D1.
 *   - Pass `--limit N` to cap the rows considered (useful for spot-check).
 *
 * Status rule (kept simple — matches `worker/src/lib/insurance-status.ts`)
 * -----------------------------------------------------------------------
 *   const hasCriticalFields = identityNumber && policyNumber && startDate;
 *   if (!hasCriticalFields) return 'missing';
 *   const today = YYYY-MM-DD UTC;
 *   const effectiveEnd = endDate ?? addOneYear(startDate);
 *   if (today > effectiveEnd) return 'expired';
 *   if (today < startDate) return 'active';       // future-effective
 *   return 'active';
 *
 * Linking rule
 * ------------
 *   Look up employees.id by identity_number. If matched, set employee_id
 *   and matched=1; otherwise null out employee_id and matched=0 with
 *   unmatched_reason='no_identity_match'. This NEVER touches employees.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

type Status = 'active' | 'expired' | 'missing';

interface InsuranceRow {
  id: string;
  employee_id: string | null;
  identity_number: string | null;
  policy_number: string | null;
  member_number: string | null;
  start_date: string | null;
  end_date: string | null;
  status: Status;
  matched: number;
  unmatched_reason: string | null;
}

interface EmployeeIndex {
  identity_number: string;
  id: string;
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const REMOTE = args.includes('--remote');
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  if (i === -1) return null;
  const n = Number(args[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

const WRANGLER_BIN = path.join(PROJECT_ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const WRANGLER_CONFIG = path.join(PROJECT_ROOT, 'worker', 'wrangler.toml');
const DB_NAME = 'hr_contracts_db_v2';

function d1Query<T>(sql: string): T[] {
  const cmd = [
    WRANGLER_BIN,
    'd1', 'execute', DB_NAME,
    REMOTE ? '--remote' : '--local',
    '--config', WRANGLER_CONFIG,
    '--json',
    '--command', sql,
  ];
  const res = spawnSync(process.execPath, cmd, { encoding: 'utf8', shell: false });
  if (res.status !== 0) {
    throw new Error(
      `wrangler d1 execute failed (exit ${res.status}):\n${res.stderr}\n--- stdout ---\n${res.stdout}`,
    );
  }
  // Wrangler --json output is an array of result objects per SQL statement.
  const parsed = JSON.parse(res.stdout) as Array<{ results: T[] }>;
  return parsed.flatMap((r) => r.results ?? []);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function addYearISO(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  const dt = new Date(Date.UTC(y + 1, mo - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function recomputeStatus(row: InsuranceRow): { status: Status; effectiveEnd: string | null } {
  const hasCritical = !!row.identity_number && !!row.policy_number && !!row.start_date;
  if (!hasCritical) return { status: 'missing', effectiveEnd: row.end_date };
  const effectiveEnd = row.end_date ?? (row.start_date ? addYearISO(row.start_date) : null);
  if (!effectiveEnd) return { status: 'missing', effectiveEnd: null };
  const today = isoToday();
  if (today > effectiveEnd) return { status: 'expired', effectiveEnd };
  return { status: 'active', effectiveEnd };
}

function escSql(s: string | null): string {
  if (s == null) return 'NULL';
  return `'${s.replace(/'/g, "''")}'`;
}

async function main(): Promise<void> {
  const target = REMOTE ? 'REMOTE (production)' : 'LOCAL';
  console.log(`\nBackfilling insurance status — target: ${target}`);
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN (use --apply to commit)'}`);
  if (LIMIT) console.log(`Row limit: ${LIMIT}`);

  // Load all employees → quick lookup map. The employees table is small
  // (~500 rows) so a single SELECT is fine.
  const employees = d1Query<EmployeeIndex>(
    'SELECT identity_number, id FROM employees WHERE identity_number IS NOT NULL',
  );
  const empByIdentity = new Map(employees.map((e) => [e.identity_number, e.id]));

  // Load insurance rows.
  const limitClause = LIMIT ? ` LIMIT ${LIMIT}` : '';
  const rows = d1Query<InsuranceRow>(
    `SELECT id, employee_id, identity_number, policy_number, member_number,
            start_date, end_date, status, matched, unmatched_reason
       FROM insurance_policies
       ORDER BY created_at DESC${limitClause}`,
  );

  const beforeCounts = { active: 0, expired: 0, missing: 0, linked: 0, unmatched: 0 };
  const afterCounts = { active: 0, expired: 0, missing: 0, linked: 0, unmatched: 0 };
  const updates: Array<{ id: string; status: Status; endDate: string | null; employeeId: string | null; matched: 0 | 1; unmatchedReason: string | null }> = [];

  for (const row of rows) {
    beforeCounts[row.status] += 1;
    if (row.matched === 1) beforeCounts.linked += 1;
    else beforeCounts.unmatched += 1;

    const { status, effectiveEnd } = recomputeStatus(row);
    const newEmpId = row.identity_number ? empByIdentity.get(row.identity_number) ?? null : null;
    const newMatched: 0 | 1 = newEmpId ? 1 : 0;
    const newUnmatchedReason = newEmpId ? null : 'no_identity_match';

    afterCounts[status] += 1;
    if (newMatched === 1) afterCounts.linked += 1;
    else afterCounts.unmatched += 1;

    const changed =
      status !== row.status ||
      (effectiveEnd !== row.end_date && effectiveEnd != null) ||
      newEmpId !== row.employee_id ||
      newMatched !== row.matched ||
      newUnmatchedReason !== row.unmatched_reason;
    if (changed) {
      updates.push({
        id: row.id,
        status,
        endDate: effectiveEnd,
        employeeId: newEmpId,
        matched: newMatched,
        unmatchedReason: newUnmatchedReason,
      });
    }
  }

  console.log(`\nLoaded ${rows.length} insurance policies. ${updates.length} would change.`);
  console.log('\nBefore:');
  console.log(`  active     ${beforeCounts.active}`);
  console.log(`  expired    ${beforeCounts.expired}`);
  console.log(`  missing    ${beforeCounts.missing}`);
  console.log(`  linked     ${beforeCounts.linked}`);
  console.log(`  unmatched  ${beforeCounts.unmatched}`);
  console.log('\nAfter:');
  console.log(`  active     ${afterCounts.active}`);
  console.log(`  expired    ${afterCounts.expired}`);
  console.log(`  missing    ${afterCounts.missing}`);
  console.log(`  linked     ${afterCounts.linked}`);
  console.log(`  unmatched  ${afterCounts.unmatched}`);

  if (!APPLY) {
    console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
    return;
  }

  if (updates.length === 0) {
    console.log('\nNothing to update.');
    return;
  }

  console.log(`\nApplying ${updates.length} updates…`);
  // Batch updates in chunks of 50 statements joined by `;` so wrangler runs
  // them in a single round-trip. D1 statement-count cap is 50/exec.
  const CHUNK = 50;
  let applied = 0;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const slice = updates.slice(i, i + CHUNK);
    const sqls = slice.map((u) =>
      `UPDATE insurance_policies SET status=${escSql(u.status)}, end_date=${escSql(u.endDate)}, employee_id=${escSql(u.employeeId)}, matched=${u.matched}, unmatched_reason=${escSql(u.unmatchedReason)} WHERE id=${escSql(u.id)};`,
    ).join(' ');
    d1Query(sqls);
    applied += slice.length;
    process.stdout.write(`\rApplied ${applied}/${updates.length}…`);
  }
  process.stdout.write('\n');

  // Audit event.
  const auditId = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const detailJson = JSON.stringify({
    rowsLoaded: rows.length,
    rowsChanged: updates.length,
    before: beforeCounts,
    after: afterCounts,
  }).replace(/'/g, "''");
  d1Query(
    `INSERT INTO audit_events (id, at, actor, action, target, status, details)
     VALUES (${escSql(auditId)}, datetime('now'), 'script:backfill-insurance-status', 'insurance.backfill', 'insurance_policies', 'ok', '${detailJson}');`,
  );
  console.log(`\nAudit event written: ${auditId}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
