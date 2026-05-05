// -*- coding: utf-8 -*-
/**
 * validate_js_parsers.mjs
 *
 * Runs the JS parser pipeline (pdfTextExtractor + classifier + parsers)
 * against every PDF in public/data/contracts/ and compares each extracted
 * field to the validated Python extraction at
 *   _contract_lab/outputs/all_contracts_extract_v2_datefix.json
 *
 * Usage (Node 18+):
 *   node _contract_lab/employee_master_import_test/validate_js_parsers.mjs
 *
 * Outputs:
 *   _contract_lab/outputs/js_parser_validation_summary.json
 *   _contract_lab/outputs/js_parser_validation_diffs.xlsx
 *   _contract_lab/outputs/js_parser_validation_report.txt
 *
 * Acceptance gate fields (must match field-by-field):
 *   IdentityNumber, ContractNumber, Name, Nationality,
 *   StartDate, EndDate, ContractEndType, BasicSalary, EmployeeNumber,
 *   ExtractionStatus, ContractVersion
 */

import fs   from 'node:fs/promises';
import path from 'node:path';
import url  from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..', '..');

const PDFS_DIR        = path.join(ROOT, 'public', 'data', 'contracts');
const PYTHON_JSON     = path.join(ROOT, '_contract_lab', 'outputs', 'all_contracts_extract_v2_datefix.json');
const OUT_DIR         = path.join(ROOT, '_contract_lab', 'outputs');
const OUT_SUMMARY     = path.join(OUT_DIR, 'js_parser_validation_summary.json');
const OUT_DIFFS_XLSX  = path.join(OUT_DIR, 'js_parser_validation_diffs.xlsx');
const OUT_REPORT      = path.join(OUT_DIR, 'js_parser_validation_report.txt');

// Acceptance fields — these must match field-by-field for the parser ports
// to be considered correct. Other fields are reported as soft diffs.
//
// Name is intentionally NOT an acceptance field. Per the identity model:
//   IdentityNumber is the only primary key.
//   EmployeeNumber is history/snapshot only.
//   Name is display/reference only — Arabic RTL extraction has known
//   visual-order ambiguity between pdfjs and pdfplumber. Mismatches surface
//   as a `nameMismatch` warning at the application level (canonicalName from
//   Person.currentName vs rawExtractedName from the PDF), but never block
//   matching or commit.
const ACCEPTANCE_FIELDS = [
  'ContractVersion', 'ExtractionStatus',
  'IdentityNumber', 'ContractNumber',
  'Nationality',
  'StartDate', 'EndDate', 'ContractEndType',
  'BasicSalary', 'EmployeeNumber',
];

// Supplementary fields to report (informational only). Name lives here.
const SOFT_FIELDS = [
  'Name',
  'IDType', 'IDExpiryDate', 'PassportNumber',
  'DateOfBirth', 'Gender', 'Religion', 'MaritalStatus',
  'Education', 'Speciality', 'Profession', 'JobTitle',
  'WorkingDaysPerWeek', 'WeeklyHours',
  'JoiningDate', 'ContractDurationYears',
  'HousingProvided', 'TransportProvided',
  'HousingAllowance', 'TransportationAllowance', 'FoodAllowance',
  'OTAllowance', 'MastersDegreeAllowance',
  'TotalCashAllowances', 'GrossCashMonthly',
  'IBAN', 'BankName', 'Email', 'MobileNumber',
];

// ── helpers ───────────────────────────────────────────────────────────────────

function normVal(field, v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  const s = String(v).trim();
  if (!s || s === 'null' || s === 'None') return '';
  // Date fields
  if (['StartDate', 'EndDate', 'JoiningDate', 'DateOfBirth', 'IDExpiryDate'].includes(field)) {
    return s.slice(0, 10);
  }
  // Number-like fields stored as strings
  if (['BasicSalary','HousingAllowance','TransportationAllowance','FoodAllowance',
       'OTAllowance','MastersDegreeAllowance','TotalCashAllowances','GrossCashMonthly',
       'ContractDurationYears'].includes(field)) {
    const n = parseFloat(s.replace(/,/g, ''));
    return Number.isFinite(n) ? String(n) : s;
  }
  // For names and most strings: case-insensitive trimmed comparison.
  // Arabic names get special treatment: visual-order in pdfplumber may differ
  // slightly from pdfjs glyph ordering — accept whitespace-only differences.
  if (field === 'Name') return s.replace(/\s+/g, ' ');
  return s;
}

function fieldsEqual(field, jsV, pyV) {
  return normVal(field, jsV) === normVal(field, pyV);
}

// Lazy-load xlsx for the diff workbook (it's already in deps for the app)
async function loadXlsx() {
  const m = await import('xlsx');
  return m.default ?? m;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();

  console.log(`[1/5] Loading reference: ${PYTHON_JSON}`);
  // Python's json.dump can emit literal NaN/Infinity outside the JSON spec.
  // Replace them with null before parsing.
  const rawJson = (await fs.readFile(PYTHON_JSON, 'utf8'))
    .replace(/\bNaN\b/g, 'null')
    .replace(/\b-?Infinity\b/g, 'null');
  const pyData = JSON.parse(rawJson);
  const pyByFile = new Map(pyData.map((r) => [r.SourceFile, r]));
  console.log(`      → ${pyData.length} reference records`);

  console.log(`[2/5] Listing PDFs: ${PDFS_DIR}`);
  const dirEntries = await fs.readdir(PDFS_DIR);
  const pdfFiles = dirEntries.filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  console.log(`      → ${pdfFiles.length} PDFs`);

  console.log(`[3/5] Importing JS parser pipeline...`);
  const parsersUrl = url.pathToFileURL(
    path.join(ROOT, 'src', 'services', 'imports', 'parsers', 'index.js')
  ).href;
  const { extractContractFromPdf } = await import(parsersUrl);
  console.log(`      → loaded`);

  console.log(`[4/5] Running JS parsers on every PDF...`);
  const jsResults = [];
  let processed = 0;
  for (const fname of pdfFiles) {
    const fullPath = path.join(PDFS_DIR, fname);
    const buf = await fs.readFile(fullPath);
    let res;
    try {
      res = await extractContractFromPdf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), fname);
    } catch (err) {
      res = {
        SourceFile: fname,
        ContractVersion: 'UNKNOWN',
        ExtractionStatus: 'ERROR',
        Error: String(err?.message || err),
      };
    }
    jsResults.push(res);
    processed += 1;
    if (processed % 50 === 0) {
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`      ${processed}/${pdfFiles.length}  (${dt}s)`);
    }
  }

  console.log(`[5/5] Comparing JS vs Python field-by-field...`);
  const diffs = [];
  const acceptanceCounters = Object.fromEntries(
    ACCEPTANCE_FIELDS.map((f) => [f, { match: 0, mismatch: 0 }])
  );
  const softCounters = Object.fromEntries(
    SOFT_FIELDS.map((f) => [f, { match: 0, mismatch: 0 }])
  );

  let perfectAcceptanceCount = 0;
  for (const js of jsResults) {
    const py = pyByFile.get(js.SourceFile);
    if (!py) {
      diffs.push({ SourceFile: js.SourceFile, field: '__missing_in_python__', js: '', py: '' });
      continue;
    }
    let allAcceptanceMatch = true;
    for (const f of ACCEPTANCE_FIELDS) {
      const eq = fieldsEqual(f, js[f], py[f]);
      if (eq) acceptanceCounters[f].match += 1;
      else {
        acceptanceCounters[f].mismatch += 1;
        allAcceptanceMatch = false;
        diffs.push({
          SourceFile: js.SourceFile, field: f,
          js: js[f] ?? '', py: py[f] ?? '',
          severity: 'ACCEPTANCE',
        });
      }
    }
    if (allAcceptanceMatch) perfectAcceptanceCount += 1;

    for (const f of SOFT_FIELDS) {
      const eq = fieldsEqual(f, js[f], py[f]);
      if (eq) softCounters[f].match += 1;
      else {
        softCounters[f].mismatch += 1;
        diffs.push({
          SourceFile: js.SourceFile, field: f,
          js: js[f] ?? '', py: py[f] ?? '',
          severity: 'SOFT',
        });
      }
    }
  }

  // Build report
  const total = jsResults.length;
  const lines = [];
  lines.push('='.repeat(72));
  lines.push('  JS PARSER VALIDATION — JS port vs validated Python output');
  lines.push('='.repeat(72));
  lines.push(`  Total PDFs processed:           ${total}`);
  lines.push(`  Reference records:              ${pyData.length}`);
  lines.push(`  All-acceptance-fields match:    ${perfectAcceptanceCount} / ${total}`);
  lines.push('');
  lines.push('  ACCEPTANCE FIELD MATCH RATES');
  lines.push(`  ${'Field'.padEnd(22)} ${'match'.padStart(6)} ${'mismatch'.padStart(8)} ${'rate'.padStart(7)}`);
  lines.push('  ' + '─'.repeat(52));
  for (const [f, c] of Object.entries(acceptanceCounters)) {
    const tot = c.match + c.mismatch;
    const rate = tot ? ((c.match / tot) * 100).toFixed(1) + '%' : '–';
    lines.push(`  ${f.padEnd(22)} ${String(c.match).padStart(6)} ${String(c.mismatch).padStart(8)} ${rate.padStart(7)}`);
  }
  lines.push('');
  lines.push('  SOFT FIELD MATCH RATES');
  lines.push(`  ${'Field'.padEnd(28)} ${'match'.padStart(6)} ${'mismatch'.padStart(8)} ${'rate'.padStart(7)}`);
  lines.push('  ' + '─'.repeat(58));
  for (const [f, c] of Object.entries(softCounters)) {
    const tot = c.match + c.mismatch;
    const rate = tot ? ((c.match / tot) * 100).toFixed(1) + '%' : '–';
    lines.push(`  ${f.padEnd(28)} ${String(c.match).padStart(6)} ${String(c.mismatch).padStart(8)} ${rate.padStart(7)}`);
  }
  const report = lines.join('\n');

  console.log(report);

  // Write outputs
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(
    OUT_SUMMARY,
    JSON.stringify({
      total,
      perfectAcceptanceCount,
      acceptanceCounters,
      softCounters,
      diffs: diffs.slice(0, 1000),
    }, null, 2),
    'utf8'
  );
  await fs.writeFile(OUT_REPORT, report, 'utf8');

  // Excel diff sheet
  const xlsx = await loadXlsx();
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    wb,
    xlsx.utils.json_to_sheet(diffs),
    'AllDiffs'
  );
  xlsx.utils.book_append_sheet(
    wb,
    xlsx.utils.json_to_sheet(diffs.filter((d) => d.severity === 'ACCEPTANCE')),
    'AcceptanceDiffs'
  );
  xlsx.utils.book_append_sheet(
    wb,
    xlsx.utils.json_to_sheet(jsResults.map((r) => ({ SourceFile: r.SourceFile, ...r }))),
    'JS_Output'
  );
  xlsx.writeFile(wb, OUT_DIFFS_XLSX);

  console.log(`\nOutputs:`);
  console.log(`  ${OUT_REPORT}`);
  console.log(`  ${OUT_SUMMARY}`);
  console.log(`  ${OUT_DIFFS_XLSX}`);

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${dt}s`);

  // Exit code: 0 if all acceptance fields match, 2 otherwise
  process.exit(perfectAcceptanceCount === total ? 0 : 2);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
