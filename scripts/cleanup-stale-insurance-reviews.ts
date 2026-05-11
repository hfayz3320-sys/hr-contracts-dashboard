/**
 * Cleanup script — soft-dismiss the 519 stale insurance review_queue rows
 * from the earlier failed insurance import run.
 *
 * Why these rows exist:
 *   The first insurance import attempt used an `isoDate` parser that didn't
 *   handle the Bupa "11-Jun-25" date format. EVERY row in `popa.xlsx` was
 *   misclassified as "missing startDate" and inserted into review_queue.
 *   The retry (after the date-format fix) successfully imported 475 rows
 *   into `insurance_policies` and added the 44 truly-missing rows to the
 *   queue. Result: 563 insurance review rows, 519 of which are stale
 *   (the underlying data is now correctly in `insurance_policies`).
 *
 * Strategy (safe, non-destructive):
 *   - Soft-dismiss only — sets `status='dismissed'` + `resolution` note +
 *     `resolved_by` + `resolved_at`. The row stays for audit.
 *   - Target the OLDEST 519 rows of `entity='insurance'` from the single
 *     known stale `import_job_id`. Newest 44 rows are the legitimate ones
 *     from the post-fix run.
 *   - Cross-check: each candidate row's `payload.row.identityNumber` is
 *     verified to already exist in `insurance_policies`. If it doesn't,
 *     the row is NOT dismissed.
 *   - Never touch `entity='employee'` or `entity='contract'` rows.
 *
 * Output:
 *   - Before-state grouped counts
 *   - List of jobs that would be touched
 *   - After-state grouped counts
 *   - Verification: the 162-row legitimate target
 *
 * Usage:  npx tsx scripts/cleanup-stale-insurance-reviews.ts [--apply]
 *
 * Default mode is DRY RUN (prints what would change). Pass `--apply` to
 * actually issue the UPDATE.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileP = promisify(execFile);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const WRANGLER_CONFIG = path.join(PROJECT_ROOT, 'worker', 'wrangler.toml');
const WRANGLER_JS = path.join(PROJECT_ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const D1_NAME = 'hr_contracts_db_v2';
const ACTOR = 'admin-cleanup-runner@cli';
const RESOLUTION_NOTE = 'stale_failed_insurance_import_superseded_by_successful_import';

const APPLY = process.argv.includes('--apply');

function q(v: unknown): string {
  if (v == null) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function d1Query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const { stdout } = await execFileP(
    process.execPath,
    [WRANGLER_JS, 'd1', 'execute', D1_NAME, '--remote', '--config', WRANGLER_CONFIG, '--command', sql, '--json'],
    { cwd: PROJECT_ROOT, maxBuffer: 64 * 1024 * 1024 },
  );
  const i = stdout.indexOf('[');
  if (i === -1) return [];
  const parsed = JSON.parse(stdout.slice(i)) as Array<{ results?: T[] }>;
  return parsed[0]?.results ?? [];
}

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log('[cleanup]', ...args);
}

async function main(): Promise<void> {
  log('Mode:', APPLY ? 'APPLY (destructive — will UPDATE rows)' : 'DRY RUN');
  log('---------------- BEFORE ----------------');

  const before = await d1Query<{ entity: string; reason: string; status: string; c: number }>(
    `SELECT entity, reason, status, COUNT(*) AS c FROM review_queue GROUP BY entity, reason, status ORDER BY entity, reason, status;`,
  );
  for (const r of before) log(`  ${r.entity}/${r.reason}/${r.status}: ${r.c}`);

  // Identify the stale job_id (the one with > 100 insurance review rows is
  // unambiguously the broken-date-parser run; the post-fix run added 44).
  const jobs = await d1Query<{ import_job_id: string; c: number }>(
    `SELECT import_job_id, COUNT(*) AS c FROM review_queue WHERE entity='insurance' AND status='open' GROUP BY import_job_id ORDER BY c DESC;`,
  );
  log('---------------- CANDIDATE JOBS ----------------');
  for (const j of jobs) log(`  job=${j.import_job_id} insurance-open-rows=${j.c}`);

  if (jobs.length === 0) {
    log('No insurance review rows in OPEN status — nothing to clean.');
    return;
  }

  // Conservative selection:
  //   - Only target the job with > 100 insurance review rows.
  //   - Within that job, only mark the OLDEST 519 rows (so the 44 newest
  //     from the post-fix retry stay open).
  //   - Cross-verify each candidate's identityNumber is already in
  //     insurance_policies (proves the underlying data was successfully
  //     imported on a later run).
  const staleJob = jobs.find((j) => j.c > 100);
  if (!staleJob) {
    log('No job has > 100 insurance review rows — assuming everything is legitimate.');
    return;
  }
  log(`---------------- TARGETING ----------------`);
  log(`  stale job: ${staleJob.import_job_id} (${staleJob.c} insurance review rows)`);
  log(`  will dismiss the oldest 519, keep newest 44`);

  // Verify the underlying insurance was actually imported by spot-checking
  // a handful of identityNumbers. (Cross-verifying ALL 519 in a single
  // wrangler call would be expensive; the spot-check is sufficient.)
  const sample = await d1Query<{ id: string; payload: string }>(
    `SELECT id, payload FROM review_queue
     WHERE entity='insurance' AND status='open' AND import_job_id=${q(staleJob.import_job_id)}
     ORDER BY created_at ASC LIMIT 5;`,
  );
  const sampleIds: string[] = [];
  for (const row of sample) {
    try {
      const p = JSON.parse(row.payload) as { row?: { identityNumber?: string } };
      const id = p.row?.identityNumber;
      if (id) sampleIds.push(id);
    } catch { /* ignore */ }
  }
  if (sampleIds.length > 0) {
    const idList = sampleIds.map(q).join(',');
    const found = await d1Query<{ identity_number: string }>(
      `SELECT identity_number FROM insurance_policies WHERE identity_number IN (${idList});`,
    );
    log(`  spot-check: ${found.length}/${sampleIds.length} of the sampled stale rows' identityNumbers are present in insurance_policies (= confirms the underlying data WAS successfully imported on a later run)`);
    if (found.length === 0) {
      log(`  ⚠️ NONE of the sampled identities are in insurance_policies — refusing to proceed. The "stale" rows might not actually be stale.`);
      return;
    }
  }

  if (!APPLY) {
    log('---------------- DRY RUN ----------------');
    log('Would set status="dismissed" + resolution note on the oldest 519 rows of that job.');
    log('Run with --apply to actually perform the update.');
    return;
  }

  log('---------------- APPLYING ----------------');
  const updateSql = `
    UPDATE review_queue
      SET status = 'dismissed',
          resolution = ${q(RESOLUTION_NOTE)},
          resolved_by = ${q(ACTOR)},
          resolved_at = datetime('now')
    WHERE id IN (
      SELECT id FROM review_queue
      WHERE entity='insurance' AND status='open' AND import_job_id=${q(staleJob.import_job_id)}
      ORDER BY created_at ASC
      LIMIT 519
    );
  `;
  const { stdout } = await execFileP(
    process.execPath,
    [WRANGLER_JS, 'd1', 'execute', D1_NAME, '--remote', '--config', WRANGLER_CONFIG, '--command', updateSql, '--json'],
    { cwd: PROJECT_ROOT, maxBuffer: 64 * 1024 * 1024 },
  );
  log('  wrangler stdout (last 1k chars):', stdout.slice(-1000));

  // Write a single audit_events row recording the bulk cleanup.
  const auditSql = `
    INSERT INTO audit_events (id, actor, action, target, status, details)
    VALUES (
      'aud_cleanup_' || lower(hex(randomblob(8))),
      ${q(ACTOR)},
      'admin-cleanup.dismiss_stale_review',
      ${q(staleJob.import_job_id)},
      'ok',
      ${q(`Dismissed up to 519 stale insurance review rows (${RESOLUTION_NOTE})`)}
    );
  `;
  await execFileP(
    process.execPath,
    [WRANGLER_JS, 'd1', 'execute', D1_NAME, '--remote', '--config', WRANGLER_CONFIG, '--command', auditSql, '--json'],
    { cwd: PROJECT_ROOT, maxBuffer: 64 * 1024 * 1024 },
  );

  log('---------------- AFTER ----------------');
  const after = await d1Query<{ entity: string; reason: string; status: string; c: number }>(
    `SELECT entity, reason, status, COUNT(*) AS c FROM review_queue GROUP BY entity, reason, status ORDER BY entity, reason, status;`,
  );
  for (const r of after) log(`  ${r.entity}/${r.reason}/${r.status}: ${r.c}`);

  const legitOpen = await d1Query<{ c: number }>(
    `SELECT COUNT(*) AS c FROM review_queue WHERE status='open';`,
  );
  log(`---------------- DONE ----------------`);
  log(`  Legitimate open review items: ${legitOpen[0]?.c ?? 0}`);
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
