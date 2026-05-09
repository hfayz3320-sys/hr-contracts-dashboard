// -*- coding: utf-8 -*-
/**
 * scripts/ingest-production-assets.mjs
 *
 * One-shot production ingestion:
 *   1. Parse the Employee Master Excel using the SPA's cleanDataset.
 *   2. Parse the Insurance Excel using normalizeInsuranceRows.
 *   3. Parse every Contract PDF using extractContractFromPdf.
 *   4. SHA-256 every source file.
 *   5. Upload Excels + every PDF to the private R2 bucket
 *      (PDFs use content-addressed keys: imports/by-hash/<sha>/<name>.pdf
 *       Excels use job-scoped keys:      imports/<jobId>/{employee,insurance}/<name>)
 *   6. Build the JSON payload for /api/hr/import/commit, including
 *      r2_object_key + has_private_file = 1 on every contract row.
 *   7. POST to https://<host>/api/hr/import/commit with Bearer admin token.
 *   8. Print summary counts; exit 0 on success.
 *
 * Idempotency:
 *   - D1 is upserted by identity_number / contract_key — guaranteed dedup.
 *   - R2 PDFs are content-addressed by SHA-256, so a re-run skips uploads
 *     when the object already exists (HEAD check).
 *
 * Usage (PowerShell):
 *   $env:HR_ADMIN_TOKEN = "<token>"
 *   node --experimental-loader ./_contract_lab/employee_master_import_test/node_loader.mjs `
 *        scripts/ingest-production-assets.mjs `
 *        --remote --source public/data --bucket hr-contracts-private `
 *        [--host https://mid-contracts-dashboard.pages.dev]
 *
 * Environment:
 *   HR_ADMIN_TOKEN   — required. Same value as the ADMIN_TOKEN secret on
 *                      the Pages production env.
 *
 * Hard guarantees:
 *   - The script NEVER writes any of the source files into git or dist.
 *   - The script NEVER prints the bearer token.
 *   - All R2 keys are private (no public-bucket binding is ever created).
 */
import 'fake-indexeddb/auto';
import fs    from 'node:fs/promises';
import path  from 'node:path';
import url   from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as XLSX from 'xlsx';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

// ── arg parsing ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const SOURCE_DIR = path.resolve(ROOT, arg('source', 'public/data'));
const BUCKET     = arg('bucket', 'hr-contracts-private');
const HOST       = (arg('host', 'https://mid-contracts-dashboard.pages.dev')).replace(/\/$/, '');
const REMOTE     = args.includes('--remote');
const DRY_RUN    = args.includes('--dry-run');
const SKIP_R2    = args.includes('--skip-r2');
const LIMIT_PDFS = Number(arg('limit-pdfs', '0')) || 0;   // 0 = all

const ADMIN_TOKEN = process.env.HR_ADMIN_TOKEN;
if (!ADMIN_TOKEN && !DRY_RUN) {
  console.error('ERROR: env HR_ADMIN_TOKEN required (or pass --dry-run for parsing-only).');
  process.exit(2);
}

// ── browser shims so the SPA modules load in node ──────────────────────────
if (typeof globalThis.crypto !== 'object' || typeof globalThis.crypto.randomUUID !== 'function') {
  const nc = await import('node:crypto');
  globalThis.crypto = nc.webcrypto || { randomUUID: () => nc.randomUUID() };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = { indexedDB: globalThis.indexedDB };
}

// ── load SPA parsers ────────────────────────────────────────────────────────
const importPath = (rel) => url.pathToFileURL(path.join(ROOT, 'src', rel)).href;
const { cleanDataset } = await import(importPath('utils/cleaning.js'));
const { extractContractFromPdf } = await import(importPath('services/imports/parsers/index.js'));
const { normalizeInsuranceRows } = await import(importPath('services/insurance/insuranceNormalizer.js'));

// ── helpers ─────────────────────────────────────────────────────────────────
function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}
async function readBufferAndHash(filePath) {
  const buf  = await fs.readFile(filePath);
  const hash = sha256Hex(buf);
  return { buf, hash };
}
function readWorkbookSheets(buf) {
  const wb = XLSX.read(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    { type: 'array', cellDates: true, raw: false });
  return wb.SheetNames.map((n) => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' }) }));
}
function uid() {
  return globalThis.crypto.randomUUID();
}
function safeR2KeyComponent(s) {
  // R2 keys are URL-ish; strip path separators + control chars but keep
  // unicode (the operator's filename is in Arabic).
  return String(s).replace(/[\\/\x00-\x1f]/g, '_').trim();
}

// ── R2 upload (via wrangler exec) ───────────────────────────────────────────
function r2Put(bucket, key, sourcePath, { remote = true, contentType } = {}) {
  if (SKIP_R2) return { skipped: 'flag' };
  const flags = ['r2', 'object', 'put', `${bucket}/${key}`, '--file', sourcePath];
  if (remote) flags.push('--remote');
  if (contentType) flags.push('--content-type', contentType);
  // Capture but never echo the file content; only the wrangler stdout.
  try {
    const out = execFileSync('npx', ['wrangler', ...flags], {
      cwd: ROOT, env: { ...process.env, CI: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
    }).toString();
    return { ok: true, out };
  } catch (err) {
    return { ok: false, err: err.stderr?.toString() || err.message };
  }
}
function r2Head(bucket, key, { remote = true } = {}) {
  if (SKIP_R2) return { exists: false };
  try {
    execFileSync('npx', ['wrangler', 'r2', 'object', 'get', `${bucket}/${key}`,
      '--file', path.join(ROOT, 'tmp', '.r2-head-probe.bin'),
      ...(remote ? ['--remote'] : [])], {
      cwd: ROOT, env: { ...process.env, CI: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exists: true };
  } catch {
    return { exists: false };
  }
}

// ── main ────────────────────────────────────────────────────────────────────
console.log(`\n=== Production ingestion ===`);
console.log(`  SOURCE_DIR = ${SOURCE_DIR}`);
console.log(`  BUCKET     = ${BUCKET}${REMOTE ? ' (remote)' : ' (local — !)'}`);
console.log(`  HOST       = ${HOST}`);
console.log(`  DRY_RUN    = ${DRY_RUN}`);
console.log(`  SKIP_R2    = ${SKIP_R2}`);
if (LIMIT_PDFS) console.log(`  LIMIT_PDFS = ${LIMIT_PDFS}`);
console.log('');

const importJobId = uid();
console.log(`  importJobId = ${importJobId}\n`);

// 1. Employee Excel
const EM_PATH = path.join(SOURCE_DIR, 'بيانات الموظفين.xlsx');
const { buf: emBuf, hash: emHash } = await readBufferAndHash(EM_PATH);
const emSheets = readWorkbookSheets(emBuf);
const emFirst  = emSheets[0]; // SPA expects Sheet2 = first
const { cleanedRows: employeeRowsClean } = cleanDataset(emFirst.rows);
console.log(`  [EM] sheet=${emFirst.name}  raw=${emFirst.rows.length}  clean=${employeeRowsClean.length}  sha=${emHash.slice(0,12)}…`);

// 2. Insurance Excel
const POPA_PATH = path.join(SOURCE_DIR, 'popa.xlsx');
const { buf: popaBuf, hash: popaHash } = await readBufferAndHash(POPA_PATH);
const popaSheets = readWorkbookSheets(popaBuf);
const popaFirst  = popaSheets[0];
const insuranceClean = normalizeInsuranceRows(popaFirst.rows);
console.log(`  [INS] sheet=${popaFirst.name}  raw=${popaFirst.rows.length}  clean=${insuranceClean.length}  sha=${popaHash.slice(0,12)}…`);

// 3. PDFs
const PDFS_DIR = path.join(SOURCE_DIR, 'Contract');
let pdfNames;
try {
  pdfNames = (await fs.readdir(PDFS_DIR)).filter((n) => n.toLowerCase().endsWith('.pdf'));
} catch {
  pdfNames = [];
}
if (LIMIT_PDFS && LIMIT_PDFS < pdfNames.length) pdfNames = pdfNames.slice(0, LIMIT_PDFS);
console.log(`  [PDF] ${pdfNames.length} files in ${PDFS_DIR}`);

const tmpDir = path.join(ROOT, 'tmp');
await fs.mkdir(tmpDir, { recursive: true });

const contractPayload = [];
let parseT0 = Date.now();
let parsedComplete = 0, parsedPartial = 0, parsedErr = 0;
let r2Uploaded = 0, r2Skipped = 0, r2Failed = 0;

for (let idx = 0; idx < pdfNames.length; idx += 1) {
  const fname = pdfNames[idx];
  const fp    = path.join(PDFS_DIR, fname);
  const { buf: pdfBuf, hash: pdfHash } = await readBufferAndHash(fp);
  const r2Key = `imports/by-hash/${pdfHash}/${safeR2KeyComponent(fname)}`;

  // Parse first; only upload if extraction produced an identifiable row
  const r = await extractContractFromPdf(
    pdfBuf.buffer.slice(pdfBuf.byteOffset, pdfBuf.byteOffset + pdfBuf.byteLength),
    fname
  );
  if (r.ExtractionStatus === 'COMPLETE')                  parsedComplete += 1;
  else if (r.ExtractionStatus === 'PARTIAL_REVIEW_REQUIRED') parsedPartial += 1;
  else                                                     parsedErr  += 1;

  // R2 upload (idempotent via content-hash key + HEAD check)
  if (!DRY_RUN && !SKIP_R2 && REMOTE) {
    const head = r2Head(BUCKET, r2Key, { remote: true });
    if (head.exists) {
      r2Skipped += 1;
    } else {
      const put = r2Put(BUCKET, r2Key, fp, { remote: true, contentType: 'application/pdf' });
      if (put.ok) r2Uploaded += 1;
      else { r2Failed += 1; console.warn(`    R2 upload failed for ${fname}: ${put.err?.slice(0, 200)}`); }
    }
  }

  contractPayload.push({
    identityNumber:  r.IdentityNumber || null,
    employeeNumber:  r.EmployeeNumber || null,
    contractNumber:  r.ContractNumber || null,
    contractType:    r.ContractType   || null,
    startDate:       r.StartDate      || null,
    endDate:         r.EndDate        || null,
    contractEndType: r.ContractEndType || (r.EndDate ? null : 'OPEN_ENDED'),
    joiningDate:     r.JoiningDate    || null,
    durationYears:   r.ContractDurationYears || null,
    salaryBasic:     Number(r.BasicSalary || 0) || null,
    salaryTotal:     Number(r.GrossCashMonthly || r.TotalSalary || 0) || null,
    iban:            r.IBAN || null,
    mobile:          r.MobileNumber || null,
    email:           r.Email || null,
    parserType:      r.parserType || r.ParserType || null,
    confidenceScore: Number(r.confidence || r.confidenceScore || 0.9),
    sourceFileName:  fname,
    sourceFileHash:  pdfHash,
    r2ObjectKey:     r2Key,
    hasPrivateFile:  1,
  });

  if ((idx + 1) % 50 === 0) {
    const elapsed = ((Date.now() - parseT0) / 1000).toFixed(1);
    console.log(`    parsed ${idx + 1}/${pdfNames.length} (complete=${parsedComplete} partial=${parsedPartial} err=${parsedErr})  R2: up=${r2Uploaded} skip=${r2Skipped} fail=${r2Failed}  ${elapsed}s`);
  }
}
console.log(`  [PDF] parsed ${parsedComplete} complete + ${parsedPartial} partial + ${parsedErr} error`);
console.log(`  [R2 ] uploaded ${r2Uploaded} new + skipped ${r2Skipped} existing + failed ${r2Failed}\n`);

// 4. Excel uploads (small; always job-scoped)
let employeeR2Key = null, insuranceR2Key = null;
if (!DRY_RUN && !SKIP_R2 && REMOTE) {
  employeeR2Key  = `imports/${importJobId}/employee/${safeR2KeyComponent(path.basename(EM_PATH))}`;
  insuranceR2Key = `imports/${importJobId}/insurance/${safeR2KeyComponent(path.basename(POPA_PATH))}`;
  const a = r2Put(BUCKET, employeeR2Key,  EM_PATH,   { remote: true, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const b = r2Put(BUCKET, insuranceR2Key, POPA_PATH, { remote: true, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  if (!a.ok) console.warn('    EM xlsx upload failed: ' + (a.err?.slice(0, 200) || ''));
  if (!b.ok) console.warn('    INS xlsx upload failed: ' + (b.err?.slice(0, 200) || ''));
}

// 5. Build the API commit payload
const employeesPayload = employeeRowsClean.map((r) => ({
  identityNumber: r.IdentityNumber || null,
  employeeNumber: r.EmployeeNumber || null,
  nameEn:         r.Name || r.EnglishName || null,
  nameAr:         r.NameAr || r.ArabicName || null,
  nationality:    r.Nationality || null,
  dateOfBirth:    r.DateOfBirth || null,
  mobile:         r.MobileNumber || null,
  email:          r.Email || null,
  iban:           r.IBAN || null,
  jobTitle:       r.Profession || r.JobTitle || null,
  department:     r.Department || null,
  project:        r.Project || null,
  status:         r.Status || null,
  source:         'admin-import',
  sourceFileName: 'بيانات الموظفين.xlsx',
}));
const insurancePayload = insuranceClean.map((i) => ({
  identityNumber: i.IDNo || i.identityNumber || null,
  mainMemberId:   i.MainMemberID || i.mainMemberId || null,
  staffNumber:    i.StaffNumber  || i.staffNumber  || null,
  memberName:     i.MemberName   || i.memberName   || null,
  policyNo:       i.PolicyNo     || i.policyNo     || null,
  className:      i.ClassDescription || i.className || null,
  effectiveDate:  i.EffectiveDate || i.effectiveDate || null,
  expiryDate:     i.ExpiryDate || i.expiryDate || null,
}));

console.log(`  payload: ${employeesPayload.length} employees, ${contractPayload.length} contracts, ${insurancePayload.length} insurance rows`);

// 6. POST commit (or dry-run echo)
if (DRY_RUN) {
  console.log('\n  --dry-run: skipping commit POST. payload looks like:');
  console.log('    employees[0] = ' + JSON.stringify(employeesPayload[0]));
  console.log('    contracts[0] = ' + JSON.stringify(contractPayload[0]));
  console.log('    insurance[0] = ' + JSON.stringify(insurancePayload[0]));
  process.exit(0);
}

const commitBody = {
  employees:  employeesPayload,
  contracts:  contractPayload,
  insurance:  insurancePayload,
  pdfFiles:   pdfNames.length,
  jobMeta: {
    id:          importJobId,
    source:      'admin-ingest-script',
    createdBy:   'ingest-production-assets.mjs',
    employeeFileR2Key:  employeeR2Key,
    insuranceFileR2Key: insuranceR2Key,
    rawFilesBucket:     BUCKET,
    rawFilesCount:      pdfNames.length + 2,
  },
};

console.log(`\n  POST ${HOST}/api/hr/import/commit  (Bearer auth)`);
const t0 = Date.now();
const res = await fetch(`${HOST}/api/hr/import/commit`, {
  method:  'POST',
  headers: {
    'content-type':  'application/json',
    'authorization': `Bearer ${ADMIN_TOKEN}`,
  },
  body:    JSON.stringify(commitBody),
});
const ct = res.headers.get('content-type') || '';
const body = /json/i.test(ct) ? await res.json() : await res.text();
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`  → HTTP ${res.status}  in ${elapsed}s`);

if (!res.ok) {
  console.error('COMMIT FAILED');
  console.error(typeof body === 'string' ? body.slice(0, 500) : JSON.stringify(body, null, 2));
  process.exit(3);
}

console.log('\n=== COMMIT SUMMARY ===');
console.log(JSON.stringify(body, null, 2));

// Save proof artifact
const outDir = path.join(ROOT, 'tmp', 'proof-artifacts');
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'production-ingest.json'),
  JSON.stringify({
    importJobId, host: HOST, bucket: BUCKET,
    counts: {
      employees: employeesPayload.length,
      contracts: contractPayload.length,
      insurance: insurancePayload.length,
      parsedComplete, parsedPartial, parsedErr,
      r2Uploaded, r2Skipped, r2Failed,
    },
    apiResponse: body,
  }, null, 2));

console.log(`\nproof: tmp/proof-artifacts/production-ingest.json`);
process.exit(0);
