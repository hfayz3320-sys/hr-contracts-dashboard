/**
 * Admin import runner — server-side, Node 22.
 *
 * Reads the real source files from the local `Data/` folder and writes them
 * into the production D1 + R2 via `wrangler` CLI (using my own Cloudflare
 * admin token — i.e. the same channel that applies migrations). This is the
 * canonical "seed prod from CLI" pattern for a Cloudflare Workers stack —
 * it does NOT loosen the worker's user-facing auth, it does NOT bypass
 * Cloudflare Access in front of the Pages site, and it does NOT use the
 * `X-Dev-Admin-Email` header that production hard-rejects.
 *
 * Pipeline per source file:
 *
 *   1. Read bytes from disk.
 *   2. SHA-256 hash → `<sha>` (used as source_file_id everywhere).
 *   3. `wrangler r2 object put <bucket> <type>/<sha>/<filename>` — upload raw.
 *   4. INSERT source_files row with r2_stored=1.
 *   5. INSERT import_jobs row with status='queued'.
 *   6. Parse with the same adapters the wizard uses (`employee_excel/mid_v1`,
 *      `bupa_insurance_excel/v1`, `contract_pdf/{mid_old,mohrsd_new}_v1`).
 *   7. For each parsed row:
 *        - For employees/insurance: SELECT-then-INSERT/UPDATE (UPSERT-by-identity).
 *        - For contracts: SELECT employee, INSERT contract, OR route to
 *          review_queue with redacted rawTextSnippet if dates/employee missing.
 *   8. UPDATE import_jobs status='committed' with counts.
 *   9. INSERT audit_events summary row.
 *
 * Safety:
 *   - No full Iqama / salary / contract text is printed to the console.
 *     Identity numbers are shown as `21xxxxxx07` (first two + last two only).
 *   - PDF raw text snippets stored on review_queue rows are capped at 2 KB
 *     and run through Arabic text normalization (no name/Iqama redaction is
 *     done at the parser layer though — review queue is admin-only behind
 *     CF Access JWT auth, so this is acceptable).
 *
 * Usage:   npx tsx scripts/admin-import-all.ts [employees|insurance|contracts|all]
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import * as XLSX from 'xlsx';
import { EMPLOYEE_EXCEL_ADAPTER } from '../src/lib/parsers/adapters/employee-excel';
import { BUPA_INSURANCE_EXCEL_ADAPTER } from '../src/lib/parsers/adapters/bupa-insurance-excel';
import { NEW_CONTRACT_ADAPTER } from '../src/lib/parsers/adapters/contract-new';
import { OLD_CONTRACT_ADAPTER } from '../src/lib/parsers/adapters/contract-old';
import { scoreExtraction } from '../src/lib/parsers/adapters/contract-old';
import { snippetForReview, normalizeContractText } from '../src/lib/parsers/adapters/contract-utils';
import type { ContractExtraction } from '../src/lib/parsers/adapter-types';

const execFileP = promisify(execFile);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'Data');
const WRANGLER_CONFIG = path.join(PROJECT_ROOT, 'worker', 'wrangler.toml');
const D1_NAME = 'hr_contracts_db_v2';
const R2_BUCKET = 'hr-contracts-private-v2';
const ACTOR = 'admin-import-runner@cli';
const PARSER_VERSION = '2c-adapters/2026-05';

const EMPLOYEE_FILE = path.join(DATA_DIR, 'بيانات الموظفين.xlsx');
const INSURANCE_FILE = path.join(DATA_DIR, 'popa.xlsx');
const CONTRACT_DIR = path.join(DATA_DIR, 'Contract');
const TMP_DIR = path.join(PROJECT_ROOT, '.import-tmp');

// ---------------------------------------------------------------------------
// Logging helpers — redact PII
// ---------------------------------------------------------------------------

function redactIqama(s: string | undefined | null): string {
  if (!s) return '(none)';
  if (s.length < 6) return '****';
  return s.slice(0, 2) + 'x'.repeat(s.length - 4) + s.slice(-2);
}

// Reserved for future per-row debug logging; intentionally unused at the
// moment (we log only redacted Iqama). Prefix `_` keeps eslint quiet.
function _redactName(s: string | undefined | null): string {
  if (!s) return '(none)';
  const parts = s.split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 1) + '***';
  return parts.map((p) => p.slice(0, 1) + '*'.repeat(Math.max(0, p.length - 1))).join(' ');
}

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log('[import]', ...args);
}

// ---------------------------------------------------------------------------
// Wrangler bridge
// ---------------------------------------------------------------------------

async function d1Exec(sql: string): Promise<string> {
  // Write the SQL to a temp file (avoids command-line escaping issues with
  // Arabic, quotes, etc.) and run wrangler d1 execute --file.
  if (!existsSync(TMP_DIR)) await mkdir(TMP_DIR, { recursive: true });
  const tmp = path.join(TMP_DIR, `q-${randomBytes(4).toString('hex')}.sql`);
  await writeFile(tmp, sql, 'utf-8');
  try {
    const { stdout } = await execFileP(
      'npx',
      ['wrangler', 'd1', 'execute', D1_NAME, '--remote', '--config', WRANGLER_CONFIG, '--file', tmp, '--json'],
      { cwd: PROJECT_ROOT, maxBuffer: 64 * 1024 * 1024, shell: true },
    );
    return stdout;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    throw new Error(
      `wrangler d1 execute failed:\n${e.stderr ?? ''}\n${e.stdout ?? ''}\n--- SQL (first 500 chars):\n${sql.slice(0, 500)}`,
    );
  }
}

// Path to the wrangler entry script. Invoking it via the Node binary
// directly (shell:false) means the SQL argv is preserved verbatim — no
// cmd.exe re-tokenisation of commas/quotes/Arabic.
const WRANGLER_JS = path.join(PROJECT_ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

/**
 * Run a SELECT query.
 *
 * Wrangler `--file` mode swallows row data for SELECTs (returns only a
 * summary), so for SELECTs we use `--command`. We invoke wrangler's JS
 * entry via `node` so spawn doesn't go through cmd.exe and doesn't
 * re-split argv on commas.
 */
async function d1Query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  try {
    const { stdout } = await execFileP(
      process.execPath,
      [WRANGLER_JS, 'd1', 'execute', D1_NAME, '--remote', '--config', WRANGLER_CONFIG, '--command', sql, '--json'],
      { cwd: PROJECT_ROOT, maxBuffer: 64 * 1024 * 1024 },
    );
    const jsonStart = stdout.indexOf('[');
    if (jsonStart === -1) return [];
    const parsed = JSON.parse(stdout.slice(jsonStart)) as Array<{ results?: T[] }>;
    return parsed[0]?.results ?? [];
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    throw new Error(`d1 query failed: ${e.stderr ?? e.stdout ?? String(err)}\nSQL: ${sql.slice(0, 200)}`);
  }
}

/**
 * Sanitize R2 keys to ASCII only. Wrangler's CLI splits non-ASCII characters
 * on the Windows command line (Arabic filenames specifically break the
 * `wrangler r2 object put <bucket>/<key>` argument parsing). We preserve the
 * full original filename in `source_files.filename`; the R2 key is just a
 * stable address for the bytes.
 */
function sanitizeR2Key(key: string): string {
  // Replace any non-ASCII / non-safe chars with hyphens; collapse runs.
  return key.replace(/[^A-Za-z0-9._/-]+/g, '-').replace(/-+/g, '-');
}

async function r2Put(key: string, filePath: string): Promise<void> {
  const safeKey = sanitizeR2Key(key);
  if (!existsSync(TMP_DIR)) await mkdir(TMP_DIR, { recursive: true });

  // Copy bytes to an ASCII-only temp path so the `--file` arg is safe on
  // Windows, then upload using that path.
  const ext = path.extname(filePath).toLowerCase() || '.bin';
  const tmpName = `r2up-${randomBytes(6).toString('hex')}${ext}`;
  const tmpPath = path.join(TMP_DIR, tmpName);
  const data = await readFile(filePath);
  await writeFile(tmpPath, data);

  try {
    await execFileP(
      'npx',
      ['wrangler', 'r2', 'object', 'put', `${R2_BUCKET}/${safeKey}`, '--file', tmpPath, '--remote'],
      { cwd: PROJECT_ROOT, maxBuffer: 64 * 1024 * 1024, shell: true },
    );
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    throw new Error(`r2 put failed for ${safeKey}: ${e.stderr ?? e.stdout ?? String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// SQL escaping
// ---------------------------------------------------------------------------

function q(v: unknown): string {
  if (v == null) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

// ---------------------------------------------------------------------------
// Pre-flight: ensure source_files schema accepts our writes
// ---------------------------------------------------------------------------

type SourceFileRecord = {
  hash: string;
  filename: string;
  type: 'xlsx' | 'pdf';
  size: number;
  r2Key: string;
  importJobId: string;
};

async function upsertSourceFile(rec: SourceFileRecord): Promise<void> {
  // source_files.hash is PRIMARY KEY. INSERT OR IGNORE handles the
  // "already imported this exact file" case; we then unconditionally
  // UPDATE r2_object_key/r2_stored so a re-run still pins the latest R2
  // address.
  const sql = `
    INSERT OR IGNORE INTO source_files
      (hash, filename, type, size, import_job_id, uploaded_by, parser_version, r2_object_key, r2_stored)
    VALUES
      (${q(rec.hash)}, ${q(rec.filename)}, ${q(rec.type)}, ${q(rec.size)},
       ${q(rec.importJobId)}, ${q(ACTOR)}, ${q(PARSER_VERSION)}, ${q(rec.r2Key)}, 1);
    UPDATE source_files SET r2_object_key = ${q(rec.r2Key)}, r2_stored = 1
    WHERE hash = ${q(rec.hash)};
  `;
  await d1Exec(sql);
}

/**
 * Create or recover an import_jobs row. The original code used INSERT OR
 * IGNORE then trusted the script's freshly-generated jobId — but if the
 * (type, sourceHash) idempotency_key already existed from a prior failed
 * run, INSERT OR IGNORE silently dropped the new row and the script went
 * on to reference a non-existent jobId, breaking every subsequent FK.
 *
 * The fix: try INSERT, then SELECT by idempotency_key. Return whichever
 * id is actually in the DB. Caller MUST use the returned id, not its
 * own pre-generated one.
 */
async function createOrRecoverImportJob(
  candidateJobId: string,
  type: 'employees' | 'insurance' | 'contracts',
  filename: string,
  sourceHash: string,
): Promise<string> {
  const idemKey = `${type}:${sourceHash}`;
  // Insert if not present.
  await d1Exec(`
    INSERT OR IGNORE INTO import_jobs
      (id, type, filename, source_hash, idempotency_key, status, triggered_by)
    VALUES
      (${q(candidateJobId)}, ${q(type)}, ${q(filename)}, ${q(sourceHash)},
       ${q(idemKey)}, 'queued', ${q(ACTOR)});
  `);
  // Look up the actual id (might be ours, or an earlier run's).
  const rows = await d1Query<{ id: string }>(
    `SELECT id FROM import_jobs WHERE idempotency_key = ${q(idemKey)};`,
  );
  const actualId = rows[0]?.id;
  if (!actualId) {
    throw new Error(`Failed to create or recover import_jobs row for key=${idemKey}`);
  }
  return actualId;
}

async function finalizeImportJob(
  jobId: string,
  counts: { created: number; updated: number; skipped: number; review: number; error: number },
): Promise<void> {
  const sql = `
    UPDATE import_jobs SET
      status         = 'committed',
      counts_created = ${counts.created},
      counts_updated = ${counts.updated},
      counts_skipped = ${counts.skipped},
      counts_review  = ${counts.review},
      counts_error   = ${counts.error},
      committed_at   = datetime('now'),
      committed_by   = ${q(ACTOR)}
    WHERE id = ${q(jobId)};
  `;
  await d1Exec(sql);
}

async function writeAudit(
  action: string,
  target: string,
  status: 'ok' | 'warning' | 'error',
  details: string,
  jobId?: string,
  sourceFileId?: string,
): Promise<void> {
  const id = newId('aud');
  const sql = `
    INSERT INTO audit_events (id, actor, action, target, status, details, job_id, source_file_id)
    VALUES (${q(id)}, ${q(ACTOR)}, ${q(action)}, ${q(target)},
            ${q(status)}, ${q(details)}, ${q(jobId ?? null)}, ${q(sourceFileId ?? null)});
  `;
  await d1Exec(sql);
}

// ---------------------------------------------------------------------------
// Employees import
// ---------------------------------------------------------------------------

type ImportCounts = { created: number; updated: number; skipped: number; review: number; error: number; total: number };

async function importEmployees(): Promise<ImportCounts> {
  log('---------------- Employees ----------------');
  log('source:', path.basename(EMPLOYEE_FILE));

  const buf = await readFile(EMPLOYEE_FILE);
  const hash = sha256(buf);
  const filename = path.basename(EMPLOYEE_FILE);
  // ASCII-only R2 key; the original (possibly Arabic) filename is preserved
  // in source_files.filename for display + audit.
  const r2Key = `employees/${hash}/employees.xlsx`;
  let jobId = newId('job');

  log('  sha256:', hash);
  log('  size: ', buf.length, 'bytes');

  log('  → uploading to R2 ...');
  await r2Put(r2Key, EMPLOYEE_FILE);
  // Order matters: source_files.import_job_id is a FK to import_jobs, so the
  // job row must exist first.
  jobId = await createOrRecoverImportJob(jobId, 'employees', filename, hash);
  await upsertSourceFile({ hash, filename, type: 'xlsx', size: buf.length, r2Key, importJobId: jobId });

  log('  → parsing with adapter:', EMPLOYEE_EXCEL_ADAPTER.name);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const allRows: Record<string, unknown>[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      raw: false, defval: null, blankrows: false,
    });
    if (json.length === 0) continue;
    const result = EMPLOYEE_EXCEL_ADAPTER.parseSheet(sheetName, json);
    if (result.matched) {
      log(`  sheet "${sheetName}" matched (${result.rows.length} rows)`);
      allRows.push(...result.rows);
    } else {
      log(`  sheet "${sheetName}" SKIPPED — ${result.warnings.join('; ')}`);
    }
  }
  log('  → total parsed rows:', allRows.length);

  // Get existing identities to decide create vs update.
  const existing = await d1Query<{ id: string; identity_number: string }>(
    `SELECT id, identity_number FROM employees WHERE identity_number IS NOT NULL;`,
  );
  const existingMap = new Map(existing.map((r) => [r.identity_number, r.id]));

  const counts: ImportCounts = { created: 0, updated: 0, skipped: 0, review: 0, error: 0, total: allRows.length };

  // Build a single batched SQL file with all per-row writes.
  const stmts: string[] = [];
  for (const row of allRows) {
    const identity = strField(row, 'identityNumber');
    const fullName = strField(row, 'fullName');

    if (!identity) {
      // No identity → review queue.
      counts.review++;
      const reviewId = newId('rev');
      const payload = JSON.stringify({ row, missing: ['identityNumber'] }).replace(/'/g, "''");
      stmts.push(`
        INSERT INTO review_queue (id, reason, entity, description, details, import_job_id, payload)
        VALUES (${q(reviewId)}, 'missing_identity', 'employee',
                'Employee row missing الرقم الوطني / IdentityNumber',
                ${q(`identity=(missing) · row=${counts.review}`)},
                ${q(jobId)}, '${payload}');
      `);
      continue;
    }
    if (!fullName) {
      counts.review++;
      const reviewId = newId('rev');
      const payload = JSON.stringify({ row, missing: ['fullName'] }).replace(/'/g, "''");
      stmts.push(`
        INSERT INTO review_queue (id, reason, entity, description, details, import_job_id, payload)
        VALUES (${q(reviewId)}, 'missing_identity', 'employee',
                'Employee row missing fullName',
                ${q(`identity=${redactIqama(identity)} · missing fullName`)},
                ${q(jobId)}, '${payload}');
      `);
      continue;
    }

    const department  = strField(row, 'department');
    const jobTitle    = strField(row, 'jobTitle');
    const nationality = strField(row, 'nationality');
    const dateOfBirth = isoDate(row.dateOfBirth);
    const hireDate    = isoDate(row.hireDate);
    const employeeNumber = strField(row, 'employeeNumber');

    const existingId = existingMap.get(identity);
    if (existingId) {
      counts.updated++;
      stmts.push(`
        UPDATE employees SET
          full_name      = ${q(fullName)},
          department     = ${q(department ?? null)},
          job_title      = ${q(jobTitle ?? null)},
          nationality    = ${q(nationality ?? null)},
          date_of_birth  = ${q(dateOfBirth ?? null)},
          hire_date      = ${q(hireDate ?? null)},
          source_file_id = ${q(hash)},
          updated_at     = datetime('now')
        WHERE id = ${q(existingId)};
      `);
      if (employeeNumber) {
        const histId = newId('hist');
        // Append a history row only if the open one (to_date IS NULL) is different.
        stmts.push(`
          UPDATE employee_number_history
            SET to_date = ${q(hireDate ?? new Date().toISOString().slice(0,10))}
            WHERE employee_id = ${q(existingId)} AND to_date IS NULL
              AND number != ${q(employeeNumber)};
          INSERT OR IGNORE INTO employee_number_history
            (id, employee_id, number, from_date, to_date, source_file_id)
            SELECT ${q(histId)}, ${q(existingId)}, ${q(employeeNumber)},
                   ${q(hireDate ?? new Date().toISOString().slice(0,10))}, NULL, ${q(hash)}
            WHERE NOT EXISTS (
              SELECT 1 FROM employee_number_history
              WHERE employee_id = ${q(existingId)} AND number = ${q(employeeNumber)} AND to_date IS NULL
            );
        `);
      }
    } else {
      counts.created++;
      const empId = newId('emp');
      stmts.push(`
        INSERT INTO employees
          (id, identity_number, full_name, department, job_title, nationality,
           date_of_birth, hire_date, status, source_file_id)
        VALUES
          (${q(empId)}, ${q(identity)}, ${q(fullName)},
           ${q(department ?? null)}, ${q(jobTitle ?? null)}, ${q(nationality ?? null)},
           ${q(dateOfBirth ?? null)}, ${q(hireDate ?? null)}, 'active', ${q(hash)});
      `);
      if (employeeNumber) {
        const histId = newId('hist');
        stmts.push(`
          INSERT OR IGNORE INTO employee_number_history
            (id, employee_id, number, from_date, to_date, source_file_id)
          VALUES
            (${q(histId)}, ${q(empId)}, ${q(employeeNumber)},
             ${q(hireDate ?? new Date().toISOString().slice(0,10))}, NULL, ${q(hash)});
        `);
      }
    }
  }

  log(`  → executing ${stmts.length} SQL statements in batches…`);
  await execBatched(stmts);
  await finalizeImportJob(jobId, counts);
  await writeAudit(
    'admin-import.employees',
    jobId,
    'ok',
    `created=${counts.created} updated=${counts.updated} review=${counts.review} skipped=${counts.skipped} error=${counts.error}`,
    jobId,
    hash,
  );

  log('  ✓ employees done:', counts);
  return counts;
}

// ---------------------------------------------------------------------------
// Insurance import (Bupa)
// ---------------------------------------------------------------------------

async function importInsurance(): Promise<ImportCounts> {
  log('---------------- Insurance ----------------');
  log('source:', path.basename(INSURANCE_FILE));

  const buf = await readFile(INSURANCE_FILE);
  const hash = sha256(buf);
  const filename = path.basename(INSURANCE_FILE);
  const r2Key = `insurance/${hash}/insurance.xlsx`;
  let jobId = newId('job');

  log('  sha256:', hash);
  log('  size: ', buf.length, 'bytes');

  log('  → uploading to R2 ...');
  await r2Put(r2Key, INSURANCE_FILE);
  jobId = await createOrRecoverImportJob(jobId, 'insurance', filename, hash);
  await upsertSourceFile({ hash, filename, type: 'xlsx', size: buf.length, r2Key, importJobId: jobId });

  log('  → parsing with adapter:', BUPA_INSURANCE_EXCEL_ADAPTER.name);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const allRows: Record<string, unknown>[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      raw: false, defval: null, blankrows: false,
    });
    if (json.length === 0) continue;
    const result = BUPA_INSURANCE_EXCEL_ADAPTER.parseSheet(sheetName, json);
    if (result.matched) {
      log(`  sheet "${sheetName}" matched (${result.rows.length} rows)`);
      allRows.push(...result.rows);
    } else {
      log(`  sheet "${sheetName}" SKIPPED — ${result.warnings.join('; ')}`);
    }
  }
  log('  → total parsed rows:', allRows.length);

  // Get existing on extended key (identity, policy, member, start).
  const existing = await d1Query<{ id: string; identity_number: string; policy_number: string; member_number: string; start_date: string }>(
    `SELECT id, COALESCE(identity_number,'') as identity_number, policy_number, COALESCE(member_number,'') as member_number, start_date FROM insurance_policies;`,
  );
  const existingMap = new Map(
    existing.map((r) => [`${r.identity_number}|${r.policy_number}|${r.member_number}|${r.start_date}`, r.id]),
  );

  // Also need employee map for matched flag.
  const empRows = await d1Query<{ id: string; identity_number: string }>(
    `SELECT id, identity_number FROM employees;`,
  );
  const empMap = new Map(empRows.map((r) => [r.identity_number, r.id]));

  const counts: ImportCounts = { created: 0, updated: 0, skipped: 0, review: 0, error: 0, total: allRows.length };
  const stmts: string[] = [];

  for (const row of allRows) {
    const policy = strField(row, 'policyNumber');
    const start = isoDate(row.startDate);
    const identity = strField(row, 'identityNumber') ?? null;
    const member = strField(row, 'memberNumber') ?? null;
    if (!policy || !start) {
      counts.review++;
      const rid = newId('rev');
      const payload = JSON.stringify({ row, missing: ['policyNumber','startDate'] }).replace(/'/g,"''");
      stmts.push(`
        INSERT INTO review_queue (id, reason, entity, description, details, import_job_id, payload)
        VALUES (${q(rid)}, 'missing_identity', 'insurance',
                'Insurance row missing PolicyNo or MemberEffectiveDate',
                ${q(`identity=${redactIqama(identity ?? undefined)} · missing policy/start`)},
                ${q(jobId)}, '${payload}');
      `);
      continue;
    }
    const endDate = isoDate(row.endDate);
    const employeeId = identity ? empMap.get(identity) : null;
    const matched = !!employeeId;
    const status = (strField(row, 'status') as string | undefined) ?? 'active';
    const provider = strField(row, 'provider') ?? 'Bupa';
    const key = `${identity ?? ''}|${policy}|${member ?? ''}|${start}`;
    const existingId = existingMap.get(key);

    if (existingId) {
      counts.updated++;
      stmts.push(`
        UPDATE insurance_policies SET
          employee_id      = ${q(employeeId ?? null)},
          identity_number  = ${q(identity)},
          provider         = ${q(provider)},
          end_date         = ${q(endDate ?? null)},
          status           = ${q(status)},
          matched          = ${matched ? 1 : 0},
          unmatched_reason = ${matched ? 'NULL' : q('no_identity_match')},
          source_file_id   = ${q(hash)}
        WHERE id = ${q(existingId)};
      `);
    } else {
      counts.created++;
      const insId = newId('ins');
      stmts.push(`
        INSERT OR IGNORE INTO insurance_policies
          (id, employee_id, identity_number, policy_number, member_number, provider,
           start_date, end_date, status, matched, unmatched_reason, source_file_id)
        VALUES
          (${q(insId)}, ${q(employeeId ?? null)}, ${q(identity)}, ${q(policy)},
           ${q(member)}, ${q(provider)}, ${q(start)}, ${q(endDate ?? null)},
           ${q(status)}, ${matched ? 1 : 0},
           ${matched ? 'NULL' : q('no_identity_match')}, ${q(hash)});
      `);
    }
  }

  log(`  → executing ${stmts.length} SQL statements in batches…`);
  await execBatched(stmts);
  await finalizeImportJob(jobId, counts);
  await writeAudit(
    'admin-import.insurance',
    jobId,
    'ok',
    `created=${counts.created} updated=${counts.updated} review=${counts.review}`,
    jobId,
    hash,
  );

  log('  ✓ insurance done:', counts);
  return counts;
}

// ---------------------------------------------------------------------------
// Contracts import (PDFs)
// ---------------------------------------------------------------------------

async function parseOnePdf(buf: Buffer, filename: string, fileHash: string): Promise<ContractExtraction> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  const fullText = Array.isArray(text) ? text.join('\n') : text;

  const adapter = NEW_CONTRACT_ADAPTER.fingerprint(fullText)
    ? NEW_CONTRACT_ADAPTER
    : OLD_CONTRACT_ADAPTER.fingerprint(fullText)
      ? OLD_CONTRACT_ADAPTER
      : null;

  if (adapter) return adapter.extract(fullText, filename, fileHash);

  return scoreExtraction({
    filename,
    fileHash,
    templateType: 'unknown',
    rawTextSnippet: snippetForReview(normalizeContractText(fullText)),
  } as Parameters<typeof scoreExtraction>[0]);
}

/**
 * Run an async task list with a maximum concurrency. Used to parallelize
 * R2 uploads — each individual `wrangler r2 object put` has ~3s of
 * cmd-startup overhead, so running 10 at a time gives a ~10x speedup
 * for the IO-bound R2 phase.
 */
async function pMapLimit<T, R>(items: T[], concurrency: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    for (let i = cursor++; i < items.length; i = cursor++) {
      out[i] = await fn(items[i]!, i);
    }
  }
  const workers = Array(Math.min(concurrency, items.length)).fill(0).map(() => worker());
  await Promise.all(workers);
  return out;
}

async function importContracts(limit?: number): Promise<ImportCounts & { oldCount: number; newCount: number; unknownCount: number }> {
  log('---------------- Contracts ----------------');
  if (!existsSync(CONTRACT_DIR)) {
    log('  Contract folder missing — skipping');
    return { created: 0, updated: 0, skipped: 0, review: 0, error: 0, total: 0, oldCount: 0, newCount: 0, unknownCount: 0 };
  }

  const allFiles = (await readdir(CONTRACT_DIR)).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  const files = limit ? allFiles.slice(0, limit) : allFiles;
  log(`  PDFs in folder: ${allFiles.length}  · processing: ${files.length}`);

  // Pre-warm employee lookup for matching.
  const empRows = await d1Query<{ id: string; identity_number: string }>(
    `SELECT id, identity_number FROM employees;`,
  );
  const empMap = new Map(empRows.map((r) => [r.identity_number, r.id]));
  log(`  employees in DB available for matching: ${empMap.size}`);

  // Idempotency: skip PDFs whose hash is already in source_files (=
  // already uploaded to R2 in a prior run). Cheap optimization for resume.
  const existingSf = await d1Query<{ hash: string }>(
    `SELECT hash FROM source_files WHERE type='pdf';`,
  );
  const alreadyUploaded = new Set(existingSf.map((r) => r.hash));
  log(`  already-uploaded PDFs (resume-safe skip for R2): ${alreadyUploaded.size}`);

  const counts = { created: 0, updated: 0, skipped: 0, review: 0, error: 0, total: 0, oldCount: 0, newCount: 0, unknownCount: 0 };
  let jobId = newId('job');
  jobId = await createOrRecoverImportJob(
    jobId, 'contracts', 'admin-import.contracts.batch',
    'batch:' + new Date().toISOString().slice(0, 10),
  );

  // ------------------------------------------------------------------
  // PHASE 1 — Parse all PDFs in memory + queue R2 uploads + build SQL.
  //   Source_files INSERTs are folded into the SQL batch (one wrangler
  //   call per batch of 50 instead of one per PDF), which is the biggest
  //   speedup. R2 uploads still need wrangler-per-file but we run them
  //   in parallel (concurrency 10).
  // ------------------------------------------------------------------
  type ParsedFile = {
    idx: number;
    filename: string;
    filePath: string;
    fileHash: string;
    fileSize: number;
    r2Key: string;
    needsR2Upload: boolean;
    extracted: Awaited<ReturnType<typeof parseOnePdf>>;
  };

  log('  → parsing PDFs…');
  const parsed: ParsedFile[] = [];
  for (let i = 0; i < files.length; i++) {
    const filename = files[i]!;
    const filePath = path.join(CONTRACT_DIR, filename);
    try {
      const buf = await readFile(filePath);
      const fileHash = sha256(buf);
      const extracted = await parseOnePdf(buf, filename, fileHash);
      if (extracted.templateType === 'new_contract') counts.newCount++;
      else if (extracted.templateType === 'old_contract') counts.oldCount++;
      else counts.unknownCount++;
      parsed.push({
        idx: i,
        filename,
        filePath,
        fileHash,
        fileSize: buf.length,
        r2Key: `contracts/${fileHash}/contract.pdf`,
        needsR2Upload: !alreadyUploaded.has(fileHash),
        extracted,
      });
      counts.total++;
      if ((i + 1) % 50 === 0) log(`  parsed ${i + 1}/${files.length}…`);
    } catch (err) {
      counts.error++;
      counts.total++;
      log(`  parse error ${filename}:`, err instanceof Error ? err.message : err);
    }
  }
  log(`  ✓ parsed ${parsed.length} PDFs · new=${counts.newCount} old=${counts.oldCount} unknown=${counts.unknownCount}`);

  // ------------------------------------------------------------------
  // PHASE 2 — Parallel R2 uploads (skip already-uploaded by hash).
  // ------------------------------------------------------------------
  const toUpload = parsed.filter((p) => p.needsR2Upload);
  log(`  → uploading ${toUpload.length} new PDFs to R2 (concurrency=10)…`);
  let uploaded = 0;
  await pMapLimit(toUpload, 10, async (p) => {
    try {
      await r2Put(p.r2Key, p.filePath);
      uploaded++;
      if (uploaded % 25 === 0) log(`    uploaded ${uploaded}/${toUpload.length}`);
    } catch (err) {
      log(`    R2 upload failed ${p.filename}:`, err instanceof Error ? err.message : err);
      throw err;
    }
  });
  log(`  ✓ R2 uploads done (${uploaded} new + ${parsed.length - toUpload.length} already-present)`);

  // ------------------------------------------------------------------
  // PHASE 3 — Build all SQL statements + flush in batches.
  // ------------------------------------------------------------------
  log('  → building SQL + flushing batches…');
  const BATCH = 50;
  let batchStmts: string[] = [];
  let batchIdx = 0;
  for (const p of parsed) {
    // source_files row (idempotent on PK=hash).
    batchStmts.push(`
      INSERT OR IGNORE INTO source_files
        (hash, filename, type, size, import_job_id, uploaded_by, parser_version, r2_object_key, r2_stored)
      VALUES
        (${q(p.fileHash)}, ${q(p.filename)}, 'pdf', ${q(p.fileSize)},
         ${q(jobId)}, ${q(ACTOR)}, ${q(PARSER_VERSION)}, ${q(p.r2Key)}, 1);
    `);

    const extracted = p.extracted;
    const identity = extracted.identityNumber;
    const startDate = extracted.startDate;
    const endDate = extracted.endDate;
    const employeeId = identity ? empMap.get(identity) : null;

    if (!identity || !startDate || !endDate || !employeeId) {
      counts.review++;
      const rid = newId('rev');
      const reason =
        !identity ? 'missing_identity' :
        !employeeId ? 'unmatched_contract' :
        !startDate || !endDate ? 'missing_contract_fields' :
        'low_confidence_extraction';
      const payload = JSON.stringify({
        filename: p.filename,
        templateType: extracted.templateType,
        extractionConfidence: extracted.extractionConfidence,
        identityNumber: identity,
        startDate, endDate,
        fullName: extracted.fullName,
        missingFields: extracted.missingFields,
        rawTextSnippet: extracted.rawTextSnippet,
      }).replace(/'/g, "''");
      batchStmts.push(`
        INSERT INTO review_queue (id, reason, entity, description, details, import_job_id, payload)
        VALUES (${q(rid)}, ${q(reason)}, 'contract',
                ${q(`Contract PDF "${p.filename}" — ${reason}`)},
                ${q(`template=${extracted.templateType} · conf=${Math.round(extracted.extractionConfidence*100)}% · identity=${redactIqama(identity)}`)},
                ${q(jobId)}, '${payload}');
      `);
    } else {
      const ctrId = newId('ctr');
      batchStmts.push(`
        INSERT OR IGNORE INTO contracts
          (id, employee_id, identity_number, contract_type, start_date, end_date,
           status, file_hash, filename, extraction_confidence, source_file_id)
        VALUES
          (${q(ctrId)}, ${q(employeeId)}, ${q(identity)},
           ${q(extracted.contractType ?? 'Fixed-term')},
           ${q(startDate)}, ${q(endDate)}, 'active',
           ${q(p.fileHash)}, ${q(p.filename)},
           ${q(extracted.extractionConfidence)},
           ${q(p.fileHash)});
      `);
      counts.created++;
    }

    if (batchStmts.length >= BATCH) {
      batchIdx++;
      log(`    flushing SQL batch ${batchIdx} (${batchStmts.length} stmts)…`);
      await execBatched(batchStmts);
      batchStmts = [];
    }
  }
  if (batchStmts.length) {
    batchIdx++;
    log(`    flushing final SQL batch ${batchIdx} (${batchStmts.length} stmts)…`);
    await execBatched(batchStmts);
  }

  await finalizeImportJob(jobId, counts);
  await writeAudit(
    'admin-import.contracts',
    jobId,
    'ok',
    `total=${counts.total} created=${counts.created} review=${counts.review} error=${counts.error} new=${counts.newCount} old=${counts.oldCount} unknown=${counts.unknownCount}`,
    jobId,
  );

  log('  ✓ contracts done:', counts);
  return counts;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function strField(row: Record<string, unknown>, k: string): string | undefined {
  const v = row[k];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

const MONTH_LOOKUP: Record<string, string> = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

/**
 * Parse a value into ISO YYYY-MM-DD. Handles:
 *   - Date objects (xlsx cellDates: true)
 *   - "2024-06-22", "2024/06/22"
 *   - "22-06-2024", "22/06/2024", "22.06.2024"
 *   - "11-Jun-25", "11 Jun 2025", "11-Jun-2025"  (Bupa export style)
 *   - Excel serial numbers (rare; cellDates should convert these)
 */
function isoDate(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return undefined;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel serial (rare branch — cellDates:true normally converts these).
    const epoch = new Date(Date.UTC(1899, 11, 30)).getTime() + v * 86400000;
    const d = new Date(epoch);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString().slice(0, 10);
  }
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // YYYY/MM/DD
  let m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]!.padStart(2,'0')}-${m[3]!.padStart(2,'0')}`;
  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2,'0')}-${m[1]!.padStart(2,'0')}`;
  // DD-Mon-YY  or  DD-Mon-YYYY  or  DD Mon YYYY  (Bupa)
  m = /^(\d{1,2})[-/\s]+([A-Za-z]{3,9})[-/\s]+(\d{2,4})$/.exec(s);
  if (m) {
    const month = MONTH_LOOKUP[m[2]!.toLowerCase()];
    if (!month) return undefined;
    let year = m[3]!;
    if (year.length === 2) {
      const yn = Number(year);
      year = (yn >= 70 ? 1900 + yn : 2000 + yn).toString();
    }
    return `${year}-${month}-${m[1]!.padStart(2,'0')}`;
  }
  return undefined;
}

async function execBatched(stmts: string[]): Promise<void> {
  if (stmts.length === 0) return;
  // Wrangler d1 execute --file accepts multi-statement SQL. Keep batches
  // under ~200 KB to avoid command timeouts.
  const MAX = 200_000;
  let buf = '';
  for (const s of stmts) {
    if (buf.length + s.length > MAX) {
      await d1Exec(buf);
      buf = '';
    }
    buf += s + '\n';
  }
  if (buf.length) await d1Exec(buf);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const arg = process.argv[2] ?? 'all';
  const wantsEmp = arg === 'all' || arg === 'employees';
  const wantsIns = arg === 'all' || arg === 'insurance';
  const wantsCtr = arg === 'all' || arg === 'contracts';
  const ctrLimit = process.argv[3] ? Number(process.argv[3]) : undefined;

  log('Project:', PROJECT_ROOT);
  log('Data dir:', DATA_DIR);
  log('Mode:', arg, ctrLimit ? `(contract limit=${ctrLimit})` : '');

  let empCounts: ImportCounts | null = null;
  let insCounts: ImportCounts | null = null;
  let ctrCounts: Awaited<ReturnType<typeof importContracts>> | null = null;

  if (wantsEmp) empCounts = await importEmployees();
  if (wantsIns) insCounts = await importInsurance();
  if (wantsCtr) ctrCounts = await importContracts(ctrLimit);

  // Final verification queries.
  log('---------------- Verification ----------------');
  const empCount = await d1Query<{ c: number }>(`SELECT COUNT(*) AS c FROM employees;`);
  const insCount = await d1Query<{ c: number }>(`SELECT COUNT(*) AS c FROM insurance_policies;`);
  const ctrCount = await d1Query<{ c: number }>(`SELECT COUNT(*) AS c FROM contracts;`);
  const srcCount = await d1Query<{ c: number }>(`SELECT COUNT(*) AS c FROM source_files WHERE r2_stored = 1;`);
  const audCount = await d1Query<{ c: number }>(`SELECT COUNT(*) AS c FROM audit_events;`);
  const reviewByReason = await d1Query<{ reason: string; c: number }>(
    `SELECT reason, COUNT(*) AS c FROM review_queue GROUP BY reason;`,
  );

  log('FINAL DB COUNTS:');
  log('  employees:                ', empCount[0]?.c ?? 0);
  log('  insurance_policies:       ', insCount[0]?.c ?? 0);
  log('  contracts:                ', ctrCount[0]?.c ?? 0);
  log('  source_files (r2_stored): ', srcCount[0]?.c ?? 0);
  log('  audit_events:             ', audCount[0]?.c ?? 0);
  log('REVIEW QUEUE BY REASON:');
  for (const r of reviewByReason) log(`  ${r.reason}: ${r.c}`);

  log('---------------- DONE ----------------');
  log('Run-time counts:');
  if (empCounts) log('  employees: ', empCounts);
  if (insCounts) log('  insurance: ', insCounts);
  if (ctrCounts) log('  contracts: ', ctrCounts);
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
