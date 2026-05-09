// -*- coding: utf-8 -*-
/**
 * scripts/d1-upsert-tests.mjs
 *
 * Runs the 9 acceptance scenarios from the production-import spec against
 * the D1 shim defined in d1-test-shim.mjs. The hrUpsert engine is the
 * EXACT module deployed under functions/lib/ — no test-only forks.
 *
 *   A. Import same Excel twice            → no duplicate persons
 *   B. Import same PDF folder twice       → no duplicate contracts
 *   C. Same identity, new EmpNo           → person updated + history row
 *   D. Same EmpNo, different identity     → critical conflict, blocked
 *   E. Missing IdentityNumber             → review queue
 *   F. Invalid IdentityNumber             → review queue
 *   G. Same contract twice                → skippedDuplicateContracts++
 *   H. Better-confidence extraction       → contract updated + audit
 *   I. Rollback an importJobId            → creates removed, updates restored
 *
 * Run:
 *   node --experimental-sqlite scripts/d1-upsert-tests.mjs
 */
import path from 'node:path';
import url  from 'node:url';
import fs   from 'node:fs/promises';
import { createD1ShimFromMigration } from './d1-test-shim.mjs';

const __filename = url.fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const MIGRATION = path.join(ROOT, 'migrations', '0001_init.sql');

const upsertModule = await import(
  url.pathToFileURL(path.join(ROOT, 'functions', 'lib', 'hrUpsert.js')).href
);
const { applyImport, rollbackImport, hashContract } = upsertModule;

// ── helpers ─────────────────────────────────────────────────────────────────
const results = [];
function record(id, label, passed, detail) {
  results.push({ id, label, passed, detail });
  const tag = passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  [${tag}] ${id} ${label}${detail ? '  — ' + detail : ''}`);
}

async function freshDb() {
  return await createD1ShimFromMigration(MIGRATION);
}

async function countRows(db, table, where = '', args = []) {
  const sql = `SELECT COUNT(*) AS c FROM ${table}` + (where ? ' WHERE ' + where : '');
  const row = await db.prepare(sql).bind(...args).first();
  return row?.c ?? 0;
}

async function listAll(db, table, where = '', args = []) {
  const sql = `SELECT * FROM ${table}` + (where ? ' WHERE ' + where : '');
  const r = await db.prepare(sql).bind(...args).all();
  return r.results || [];
}

// ── shared payloads ─────────────────────────────────────────────────────────
const empA = {
  identityNumber: '1125180404', employeeNumber: '1287',
  nameEn: 'Yousef Alqahtani', nationality: 'Saudi',
  mobile: '0530192705', email: 'yousef@example.com', iban: 'SA7880000147608016143137',
  jobTitle: 'Data Entry Operator', source: 'admin-import',
};
const empB = {
  identityNumber: '2558797532', employeeNumber: '1913',
  nameEn: 'Abul Basar Mohammad', nationality: 'Indian',
  mobile: '0537829054', email: 'basar9661@example.com', iban: 'SA9280000858608014766989',
  jobTitle: 'Load and unload worker', source: 'admin-import',
};
const empC = {  // same identity as empA but new EmpNo (job change)
  identityNumber: '1125180404', employeeNumber: '9999',
  nameEn: 'Yousef Alqahtani', nationality: 'Saudi',
  mobile: '0530192705', email: 'yousef@example.com', iban: 'SA7880000147608016143137',
  jobTitle: 'Data Entry Operator', source: 'admin-import',
};
const empConflict = {  // tries to take empA's EmpNo with a different identity
  identityNumber: '2222222222', employeeNumber: '1287',
  nameEn: 'Different Person', nationality: 'Indian', source: 'admin-import',
};
const empMissingId = { identityNumber: null, employeeNumber: '5555', nameEn: 'Missing Id', source: 'admin-import' };
const empInvalidId = { identityNumber: '12',   employeeNumber: '5556', nameEn: 'Invalid Id', source: 'admin-import' };

const contractA = {
  identityNumber: '1125180404', employeeNumber: '1287',
  contractNumber: '10640803', contractType: 'Fixed-term',
  startDate: '2024-11-01', endDate: '2025-10-31',
  contractEndType: null, joiningDate: '2022-11-01',
  salaryBasic: 3200, salaryTotal: 4000, parserType: 'old-arabic-only',
  confidenceScore: 0.95, sourceFileName: 'contract-A.pdf',
};
const contractA_betterConfidence = { ...contractA, confidenceScore: 0.99 };

// ─────────────────────────────────────────────────────────────────────────────
// A. Import same Excel twice → no duplicate persons
// ─────────────────────────────────────────────────────────────────────────────
{
  const db = await freshDb();
  await applyImport(db, { employees: [empA, empB] }, { source: 'jobA1' });
  await applyImport(db, { employees: [empA, empB] }, { source: 'jobA2' });
  const personCount = await countRows(db, 'persons');
  record('A', 'Import same Excel twice → no duplicate persons',
    personCount === 2, `persons=${personCount} (expected 2)`);
  db.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// B. Import same PDF folder twice → no duplicate contracts
// ─────────────────────────────────────────────────────────────────────────────
{
  const db = await freshDb();
  await applyImport(db, { employees: [empA], contracts: [contractA] }, { source: 'jobB1' });
  await applyImport(db, { employees: [empA], contracts: [contractA] }, { source: 'jobB2' });
  const contractCount = await countRows(db, 'contracts');
  record('B', 'Import same PDF folder twice → no duplicate contracts',
    contractCount === 1, `contracts=${contractCount} (expected 1)`);
  db.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// C. Same identity, new EmpNo → person updated + employee_number_history
// ─────────────────────────────────────────────────────────────────────────────
{
  const db = await freshDb();
  await applyImport(db, { employees: [empA] }, { source: 'jobC1' });
  await applyImport(db, { employees: [empC] }, { source: 'jobC2' });
  const persons = await listAll(db, 'persons');
  const history = await listAll(db, 'employee_number_history',
    'identity_number = ?', ['1125180404']);
  const latest = persons[0]?.latest_employee_number;
  const ok = persons.length === 1 && latest === '9999' && history.length === 1
    && history[0].employee_number === '9999';
  record('C', 'Same identity, new EmpNo → updated + history row',
    ok, `persons=${persons.length}, latest_emp=${latest}, history=${history.length}`);
  db.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// D. Same EmpNo, different identity → critical conflict, blocked
// ─────────────────────────────────────────────────────────────────────────────
{
  const db = await freshDb();
  await applyImport(db, { employees: [empA] }, { source: 'jobD1' });
  const result = await applyImport(db, { employees: [empConflict] }, { source: 'jobD2' });
  const reviewRow = await db.prepare(
    `SELECT * FROM review_queue WHERE identity_number = ? AND severity = 'critical'`
  ).bind('2222222222').first();
  const personOfConflict = await db.prepare(
    `SELECT * FROM persons WHERE identity_number = ?`
  ).bind('2222222222').first();
  const ok = result.summary.criticalConflicts === 1
    && reviewRow != null
    && personOfConflict == null;
  record('D', 'Same EmpNo, different identity → critical review, no person created',
    ok, `criticalConflicts=${result.summary.criticalConflicts}, review=${reviewRow ? 'yes' : 'no'}, person=${personOfConflict ? 'CREATED!' : 'none'}`);
  db.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// E. Missing IdentityNumber → review queue
// ─────────────────────────────────────────────────────────────────────────────
{
  const db = await freshDb();
  const result = await applyImport(db, { employees: [empMissingId] }, { source: 'jobE' });
  const reviewCount = await countRows(db, 'review_queue', "reason LIKE '%Missing%' OR reason LIKE '%invalid%'");
  const personCount = await countRows(db, 'persons');
  record('E', 'Missing IdentityNumber → review queue, no person',
    reviewCount === 1 && personCount === 0,
    `review=${reviewCount}, persons=${personCount}, blocked=${result.summary.blockedRows}`);
  db.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// F. Invalid IdentityNumber (length != 10) → review queue
// ─────────────────────────────────────────────────────────────────────────────
{
  const db = await freshDb();
  const result = await applyImport(db, { employees: [empInvalidId] }, { source: 'jobF' });
  const reviewCount = await countRows(db, 'review_queue');
  const personCount = await countRows(db, 'persons');
  record('F', 'Invalid IdentityNumber → review queue, no person',
    reviewCount === 1 && personCount === 0,
    `review=${reviewCount}, persons=${personCount}, blocked=${result.summary.blockedRows}`);
  db.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// G. Same contract twice → skippedDuplicateContracts increments
// ─────────────────────────────────────────────────────────────────────────────
{
  const db = await freshDb();
  await applyImport(db, { employees: [empA], contracts: [contractA] }, { source: 'jobG1' });
  const result = await applyImport(db, { employees: [empA], contracts: [contractA] }, { source: 'jobG2' });
  const ok = result.summary.skippedDuplicateContracts === 1;
  record('G', 'Same contract twice → skippedDuplicateContracts++',
    ok, `skipped=${result.summary.skippedDuplicateContracts}`);
  db.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// H. Better-confidence extraction → updates contract + audit captures old/new
// ─────────────────────────────────────────────────────────────────────────────
{
  const db = await freshDb();
  await applyImport(db, { employees: [empA], contracts: [contractA] }, { source: 'jobH1' });
  const result = await applyImport(db, { employees: [empA], contracts: [contractA_betterConfidence] }, { source: 'jobH2' });
  const updated = await db.prepare(
    `SELECT confidence_score FROM contracts WHERE identity_number = ?`
  ).bind('1125180404').first();
  const auditUpdate = await db.prepare(
    `SELECT * FROM import_audit_log WHERE entity_type='contract' AND action='update'`
  ).first();
  const ok = result.summary.updatedContracts === 1
    && Number(updated.confidence_score) > 0.98
    && auditUpdate != null
    && auditUpdate.old_value_json != null
    && auditUpdate.new_value_json != null;
  record('H', 'Better-confidence extraction → contract updated + audit old/new',
    ok, `updated=${result.summary.updatedContracts}, conf=${updated?.confidence_score}, audit=${auditUpdate ? 'yes' : 'no'}`);
  db.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// I. Rollback importJobId → creates removed, review wiped, status flipped
// ─────────────────────────────────────────────────────────────────────────────
{
  const db = await freshDb();
  // Job 1 — establishes the baseline person + contract
  await applyImport(db, { employees: [empA], contracts: [contractA] }, { source: 'jobI1' });
  // Job 2 — creates a NEW person + adds a contract; this is the one we'll roll back
  const job2 = await applyImport(db, {
    employees: [empB],
    contracts: [{
      ...contractA, identityNumber: '2558797532', contractNumber: '28162257',
      startDate: '2025-07-07', endDate: '2027-07-06', confidenceScore: 0.9,
    }],
  }, { source: 'jobI2' });

  const beforePersons   = await countRows(db, 'persons');
  const beforeContracts = await countRows(db, 'contracts');

  const rb = await rollbackImport(db, job2.jobId);

  const afterPersons   = await countRows(db, 'persons');
  const afterContracts = await countRows(db, 'contracts');
  const jobStatus = (await db.prepare(`SELECT status FROM import_jobs WHERE id = ?`).bind(job2.jobId).first())?.status;
  const reviewLeft = await countRows(db, 'review_queue', 'import_job_id = ?', [job2.jobId]);

  const ok = beforePersons === 2 && afterPersons === 1
    && beforeContracts === 2 && afterContracts === 1
    && jobStatus === 'rolled_back' && reviewLeft === 0;
  record('I', 'Rollback removes creates + restores updates + wipes review',
    ok,
    `persons ${beforePersons}→${afterPersons}, contracts ${beforeContracts}→${afterContracts}, status=${jobStatus}, deletedAudit=${rb.deleted}, reviewLeft=${reviewLeft}`);
  db.close();
}

// ── summary ─────────────────────────────────────────────────────────────────
const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
console.log(`\n========================================================`);
console.log(`  9 UPSERT scenarios: ${passed} PASS / ${failed} FAIL`);
console.log(`========================================================\n`);

const outDir = path.join(ROOT, 'tmp', 'proof-artifacts');
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'd1-upsert-tests.json'),
  JSON.stringify({ passed, failed, results }, null, 2));

process.exit(failed === 0 ? 0 : 2);
