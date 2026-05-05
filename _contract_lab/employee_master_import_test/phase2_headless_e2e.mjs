// -*- coding: utf-8 -*-
/**
 * phase2_headless_e2e.mjs
 *
 * End-to-end Phase 2 validation that exercises the REAL JS service code
 * (the same code path the UI calls when the user clicks "Commit") in Node,
 * against fake-indexeddb. Every store write that would happen in the browser
 * happens here — only the file-picker UI is replaced with direct fs reads.
 *
 * Tests covered (mirrors PHASE2_BROWSER_TEST.md):
 *   1. Excel import (preview + commit + IndexedDB store counts)
 *   2. PDF import   (preview + commit + IndexedDB store counts)
 *   3. Review queue resolve / dismiss
 *   4. Person profile aggregator
 *   5. Re-import idempotency (EM no-op, PDF duplicate detection)
 *   + verifies legacy stores untouched
 *
 * Usage:
 *   node _contract_lab/employee_master_import_test/phase2_headless_e2e.mjs
 *
 * Exit code 0 = all assertions pass. Non-zero = at least one failure.
 */

import 'fake-indexeddb/auto';     // installs indexedDB / IDBKeyRange globals
import fs   from 'node:fs/promises';
import path from 'node:path';
import url  from 'node:url';

// XLSX needs a workbook reader in Node; we'll use the same `xlsx` package the app uses.
import * as XLSX from 'xlsx';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..', '..');

const EM_EXCEL  = path.join(ROOT, '_contract_lab', 'employee_master_import_test', 'inputs', 'بيانات الموظفين.xlsx');
const PDFS_DIR  = path.join(ROOT, 'public', 'data', 'contracts');

// ── service imports (the real ones) ──────────────────────────────────────────

const importPath = (rel) => url.pathToFileURL(path.join(ROOT, 'src', rel)).href;

const { cleanDataset } = await import(importPath('utils/cleaning.js'));
const { buildEmployeeMasterImportPreview } = await import(importPath('services/imports/employeeMasterImportService.js'));
const { buildContractImportPreview }       = await import(importPath('services/imports/contractPdfImportService.js'));
const {
  commitEmployeeMasterImport,
  commitContractImport,
} = await import(importPath('services/imports/importCommitService.js'));
const { extractContractFromPdf } = await import(importPath('services/imports/parsers/index.js'));
const { personRepository }                 = await import(importPath('storage/repositories/personRepository.js'));
const { employeeMasterSnapshotRepository } = await import(importPath('storage/repositories/employeeMasterSnapshotRepository.js'));
const { contractRecordRepository }         = await import(importPath('storage/repositories/contractRecordRepository.js'));
const { employeeNumberHistoryRepository }  = await import(importPath('storage/repositories/employeeNumberHistoryRepository.js'));
const { auditLogRepository }               = await import(importPath('storage/repositories/auditLogRepository.js'));
const { reviewQueueRepository }            = await import(importPath('storage/repositories/reviewQueueRepository.js'));
const { importJobRepository }              = await import(importPath('storage/repositories/importJobRepository.js'));
const { listOpenV3, markResolved, markDismissed }
  = await import(importPath('services/imports/reviewQueueService.js'));
const { getPersonProfile, listPersonsSummary }
  = await import(importPath('services/persons/personProfileService.js'));
const { STORE_NAMES } = await import(importPath('storage/indexedDb/dbSchema.js'));
const { withStore }   = await import(importPath('storage/indexedDb/coreDb.js'));

// ── shims for browser-only globals required by services/utilities ────────────

if (typeof globalThis.crypto !== 'object' || typeof globalThis.crypto.randomUUID !== 'function') {
  const nodeCrypto = await import('node:crypto');
  globalThis.crypto = nodeCrypto.webcrypto || { randomUUID: () => nodeCrypto.randomUUID() };
}
// `window` global is used inside coreDb.js for indexedDB lookup
if (typeof globalThis.window === 'undefined') {
  globalThis.window = { indexedDB: globalThis.indexedDB };
}

// ── assertion helpers ────────────────────────────────────────────────────────

const failures = [];
function assertEq(label, actual, expected) {
  const ok = actual === expected;
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(58)} actual=${String(actual).padStart(6)} expected=${String(expected).padStart(6)}`);
  if (!ok) failures.push(`${label}: actual=${actual} expected=${expected}`);
}

async function countStore(storeName) {
  return withStore(storeName, 'readonly', async (s) => {
    const req = s[storeName].count();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  });
}

// ── helpers to produce browser-API-equivalent inputs for services ────────────

async function readExcelAsCleanedRows(filePath) {
  const buf = await fs.readFile(filePath);
  const wb  = XLSX.read(buf, { type: 'buffer', cellDates: true, raw: false });
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return cleanDataset(rows);
}

// ── tests ────────────────────────────────────────────────────────────────────

async function test1_ExcelImport() {
  console.log('\n[Test 1] Employee Master Excel import');
  const { cleanedRows } = await readExcelAsCleanedRows(EM_EXCEL);

  // PREVIEW (preview-first flow — no DB writes yet)
  const preview = buildEmployeeMasterImportPreview({
    cleanedRows,
    existingPersons:   await personRepository.listAll(),
    existingSnapshots: await employeeMasterSnapshotRepository.listAll(),
    existingHistory:   await employeeNumberHistoryRepository.listAll(),
    sourceFile:        'بيانات الموظفين.xlsx',
  });

  console.log('  Preview counts:');
  assertEq('preview.total',          preview.summary.total,           509);
  assertEq('preview.new',            preview.summary.new,             499);
  assertEq('preview.updated',        preview.summary.updated,         0);
  assertEq('preview.invalidIdentity', preview.summary.invalidIdentity, 2);
  assertEq('preview.missingIdentity', preview.summary.missingIdentity, 8);

  // No writes yet — verify
  console.log('  Pre-commit DB counts:');
  assertEq('persons (pre-commit)',                 await countStore(STORE_NAMES.PERSONS), 0);
  assertEq('employeeMasterSnapshots (pre-commit)', await countStore(STORE_NAMES.EMPLOYEE_MASTER_SNAPSHOTS), 0);

  // COMMIT (this is the same call the UI's Commit button makes)
  const result = await commitEmployeeMasterImport(preview, { importedBy: 'headless-test' });
  console.log(`  Commit returned: ${result.status}, jobId=${result.importJobId.slice(0, 12)}…`);

  console.log('  Post-commit DB counts:');
  assertEq('persons',                 await countStore(STORE_NAMES.PERSONS),                 499);
  assertEq('employeeMasterSnapshots', await countStore(STORE_NAMES.EMPLOYEE_MASTER_SNAPSHOTS), 499);
  assertEq('employeeNumberHistory',   await countStore(STORE_NAMES.EMPLOYEE_NUMBER_HISTORY), 499);
  assertEq('importAuditLog',          await countStore(STORE_NAMES.IMPORT_AUDIT_LOG),        499);
  assertEq('reviewQueue',             await countStore(STORE_NAMES.REVIEW_QUEUE),             10);
  assertEq('importJobs',              await countStore(STORE_NAMES.IMPORT_JOBS),               1);
}

async function test2_PdfImport() {
  console.log('\n[Test 2] Contract PDF import');

  const dirEntries = await fs.readdir(PDFS_DIR);
  const pdfFiles = dirEntries.filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  console.log(`  Extracting ${pdfFiles.length} PDFs (this takes ~30s)...`);

  const extracted = [];
  for (const fname of pdfFiles) {
    const buf = await fs.readFile(path.join(PDFS_DIR, fname));
    extracted.push(await extractContractFromPdf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), fname));
  }

  const preview = buildContractImportPreview({
    extractedContracts:      extracted,
    existingPersons:         await personRepository.listAll(),
    existingContractRecords: await contractRecordRepository.listAll(),
    existingHistory:         await employeeNumberHistoryRepository.listAll(),
    sourceFiles:             pdfFiles,
  });

  console.log('  Preview counts:');
  assertEq('preview.total',                          preview.summary.total,                          437);
  assertEq('preview.newContractForExistingPerson',   preview.summary.newContractForExistingPerson,   337);
  assertEq('preview.newContractOnlyPerson',          preview.summary.newContractOnlyPerson,           86);
  assertEq('preview.empNoHistoryCandidates',         preview.summary.empNoHistoryCandidates,         177);
  assertEq('preview.invalidIdentity',                preview.summary.invalidIdentity,                  0);
  assertEq('preview.missingIdentity',                preview.summary.missingIdentity,                 14);
  assertEq('preview.extractionError',                preview.summary.extractionError,                  0);

  await commitContractImport(preview, { importedBy: 'headless-test' });

  console.log('  Post-commit DB counts:');
  assertEq('persons (after PDF commit, 499+86)',     await countStore(STORE_NAMES.PERSONS),                585);
  assertEq('contractRecords',                         await countStore(STORE_NAMES.CONTRACT_RECORDS),       423);
  assertEq('employeeNumberHistory (499+177)',         await countStore(STORE_NAMES.EMPLOYEE_NUMBER_HISTORY), 676);
  assertEq('reviewQueue (10+14)',                     await countStore(STORE_NAMES.REVIEW_QUEUE),            24);
  assertEq('importJobs (1+1)',                        await countStore(STORE_NAMES.IMPORT_JOBS),              2);
}

async function test3_ReviewQueueActions() {
  console.log('\n[Test 3] Review queue resolve/dismiss');
  const before = await listOpenV3();
  console.log(`  Open before: ${before.length}`);
  assertEq('openV3 items before action', before.length, 24);

  await markResolved(before[0].id, { resolutionNote: 'headless-test resolve' });
  await markDismissed(before[1].id, { reason: 'headless-test dismiss' });

  const after = await listOpenV3();
  console.log(`  Open after:  ${after.length}`);
  assertEq('openV3 items after resolve+dismiss', after.length, 22);
}

async function test4_PersonProfile() {
  console.log('\n[Test 4] Person profile aggregator');
  const summary = await listPersonsSummary();
  assertEq('persons summary count', summary.length, 585);

  const sample = summary.find((p) => p.contractCount === 1) || summary[0];
  const profile = await getPersonProfile(sample.identityNumber);
  console.log(`  Profile loaded for ${sample.identityNumber}: ` +
    `master=${!!profile.masterSnapshot}  contracts=${profile.contracts.length}  ` +
    `empNoHistory=${profile.employeeNumberHistory.length}  audit=${profile.auditLog.length}  ` +
    `review=${profile.openReviewItems.length}`);
  assertEq('profile.person not null',                 profile.person !== null, true);
  assertEq('profile contracts >= 1 for sample',       profile.contracts.length >= 1, true);
  assertEq('profile audit log >= 1 for sample',       profile.auditLog.length >= 1, true);

  // Find a person with EmpNo history divergence (one of the 93 from v2 audit)
  const multiEmp = summary.find((p) => p.empNoCount > 1);
  if (multiEmp) {
    const p2 = await getPersonProfile(multiEmp.identityNumber);
    assertEq('multi-EmpNo: profile.flags.hasMultipleEmpNos', p2.flags.hasMultipleEmpNos, true);
    console.log(`  Multi-EmpNo person ${multiEmp.identityNumber}: ${p2.employeeNumberHistory.length} entries`);
  } else {
    console.log('  WARN: no person with empNoCount>1 found');
  }
}

async function test5_Reimport() {
  console.log('\n[Test 5] Re-import idempotency');

  // EM re-import: should produce updated=0, unchanged=499, new=0
  const { cleanedRows } = await readExcelAsCleanedRows(EM_EXCEL);
  const previewEM = buildEmployeeMasterImportPreview({
    cleanedRows,
    existingPersons:   await personRepository.listAll(),
    existingSnapshots: await employeeMasterSnapshotRepository.listAll(),
    existingHistory:   await employeeNumberHistoryRepository.listAll(),
    sourceFile:        'بيانات الموظفين.xlsx (re-import)',
  });
  console.log(`  EM re-import: new=${previewEM.summary.new}, updated=${previewEM.summary.updated}, unchanged=${previewEM.summary.unchanged}`);
  assertEq('EM re-import: new',       previewEM.summary.new,        0);
  assertEq('EM re-import: updated',   previewEM.summary.updated,    0);
  assertEq('EM re-import: unchanged', previewEM.summary.unchanged, 499);

  // PDF re-import (one PDF that's already imported): should detect duplicate
  const samplePdfFile = 'AAFAQ AHMED ZULFIQAR ALI.pdf';
  const buf = await fs.readFile(path.join(PDFS_DIR, samplePdfFile));
  const extracted = [await extractContractFromPdf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), samplePdfFile)];

  const previewPdf = buildContractImportPreview({
    extractedContracts:      extracted,
    existingPersons:         await personRepository.listAll(),
    existingContractRecords: await contractRecordRepository.listAll(),
    existingHistory:         await employeeNumberHistoryRepository.listAll(),
    sourceFiles:             [samplePdfFile],
  });
  console.log(`  PDF re-import: total=${previewPdf.summary.total}, duplicate=${previewPdf.summary.duplicateContract}`);
  assertEq('PDF re-import: total',           previewPdf.summary.total,             1);
  assertEq('PDF re-import: duplicate count', previewPdf.summary.duplicateContract, 1);
}

async function test6_LegacyStoresUntouched() {
  console.log('\n[Test 6] Legacy stores untouched');
  // The schema upgrade always creates these stores empty in v3. We never write.
  assertEq('legacy employees count',  await countStore(STORE_NAMES.EMPLOYEES),  0);
  assertEq('legacy contracts count',  await countStore(STORE_NAMES.CONTRACTS),  0);
  assertEq('legacy insurance count',  await countStore(STORE_NAMES.INSURANCE), 0);
  assertEq('legacy pdfFiles count',   await countStore(STORE_NAMES.PDF_FILES),  0);
}

// ── runner ───────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  console.log('Phase 2 headless end-to-end validation');
  console.log('Inputs: ', EM_EXCEL.replace(ROOT, '<root>'));
  console.log('         ', PDFS_DIR.replace(ROOT, '<root>'));
  console.log('Database: fake-indexeddb (in-memory) — same JS commit code paths as the UI');

  await test1_ExcelImport();
  await test2_PdfImport();
  await test3_ReviewQueueActions();
  await test4_PersonProfile();
  await test5_Reimport();
  await test6_LegacyStoresUntouched();

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(72)}`);
  if (failures.length === 0) {
    console.log(`  PASS — all assertions OK (${dt}s)`);
    console.log('='.repeat(72));
    process.exit(0);
  } else {
    console.log(`  FAIL — ${failures.length} assertion(s) failed (${dt}s)`);
    failures.forEach((f) => console.log('   - ' + f));
    console.log('='.repeat(72));
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
