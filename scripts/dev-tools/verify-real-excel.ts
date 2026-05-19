import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseExcelFile } from '../../src/lib/parsers/excel';

function assertTrue(label: string, condition: boolean): void {
  if (!condition) throw new Error(`Assertion failed: ${label}`);
}

async function fileFromPath(absPath: string): Promise<File> {
  const buf = await readFile(absPath);
  return new File([buf], path.basename(absPath), {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

async function pickEmployeeWorkbook(dataDir: string): Promise<string> {
  const files = await readdir(dataDir);
  const xlsx = files.filter((f) => /\.xlsx$/i.test(f) && f.toLowerCase() !== 'popa.xlsx');
  if (xlsx.length === 0) {
    throw new Error(`No employee workbook found in ${dataDir} (expected one .xlsx other than popa.xlsx)`);
  }
  return path.join(dataDir, xlsx[0]!);
}

function isIsoDate(v: unknown): boolean {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

async function main(): Promise<void> {
  const dataDirArg = process.argv[2] ?? 'data';
  const dataDir = path.resolve(process.cwd(), dataDirArg);

  const popaPath = path.join(dataDir, 'popa.xlsx');
  const employeePath = await pickEmployeeWorkbook(dataDir);

  const popaFile = await fileFromPath(popaPath);
  const employeeFile = await fileFromPath(employeePath);

  const insurance = await parseExcelFile(popaFile, 'insurance');
  const employees = await parseExcelFile(employeeFile, 'employees');

  assertTrue('insurance workbook parsed', insurance.sheets.length > 0);
  assertTrue('employee workbook parsed', employees.sheets.length > 0);

  const insuranceRows = insurance.sheets.flatMap((s) => s.rows);
  const employeeRows = employees.sheets.flatMap((s) => s.rows);

  assertTrue(
    'insurance has identityNumber mapped from IDNo',
    insuranceRows.some((r) => typeof r.identityNumber === 'string' && r.identityNumber.length > 0),
  );
  assertTrue(
    'employee has identityNumber mapped from الرقم الوطني',
    employeeRows.some((r) => typeof r.identityNumber === 'string' && r.identityNumber.length > 0),
  );

  // Ensure Bupa dates like 11-Jun-25 normalize to ISO through the adapter.
  const insuranceWithStart = insuranceRows.filter((r) => r.startDate != null);
  assertTrue('insurance startDate present', insuranceWithStart.length > 0);
  assertTrue(
    'insurance startDate normalized to ISO',
    insuranceWithStart.every((r) => isIsoDate(r.startDate)),
  );
  const insuranceWithEnd = insuranceRows.filter((r) => r.endDate != null);
  assertTrue(
    'insurance endDate normalized to ISO when present',
    insuranceWithEnd.every((r) => isIsoDate(r.endDate)),
  );

  console.log(
    '[verify-real-excel] PASS',
    JSON.stringify(
      {
        employeeWorkbook: path.basename(employeePath),
        employeeRows: employeeRows.length,
        insuranceRows: insuranceRows.length,
        employeeIdentityMapped: employeeRows.filter((r) => typeof r.identityNumber === 'string').length,
        insuranceIdentityMapped: insuranceRows.filter((r) => typeof r.identityNumber === 'string').length,
        insuranceIsoStartRows: insuranceWithStart.length,
        insuranceIsoEndRows: insuranceWithEnd.length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error('[verify-real-excel] FAIL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

