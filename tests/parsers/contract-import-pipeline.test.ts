/**
 * Regression tests for contract PDF section-scoped extraction and import row mapping.
 * Uses synthetic text mirroring contract-29714467 layout (no real PII files in repo).
 */
import { describe, it, expect } from 'vitest';
import { NEW_CONTRACT_ADAPTER } from '@/lib/parsers/adapters/contract-new';
import { OLD_CONTRACT_ADAPTER } from '@/lib/parsers/adapters/contract-old';
import { contractImportRowFromExtraction } from '@/lib/parsers/contract-import-row';
import { parseExcelFile } from '@/lib/parsers/excel';
import { resolveDryRun } from '../../worker/src/lib/dry-run';
import { makeMockD1 } from '../routes/_mock-d1';
import type { Env } from '../../worker/src/env';
import * as XLSX from 'xlsx';

const SYNTH_29714467 = `
Standard Work Contract
وزارة الموارد البشرية والتنمية الاجتماعية
منصة قوى

1 Contract Information
Work Contract No.: 29714467
Execution Date: 2025/09/08

2 First Party's Information
Name: فيصل القحطاني
ID No.: 1002896619
Representative of the Employer

3 Second Party's Information
Name: حمزه فايز فتحي احمد
Identity Number: 2598101232
Nationality: Egyptian
Passport Number: A40563453
Gender: Male
Marital Status: MARRIED
Date of Birth: 1994/08/07
Mobile: +966505620587
Email: hamzafayz133@gmail.com

4 Profession & Work Location
Job Title: System Admin
Occupation: Construction worker
Work Location: Riyadh

9 Wage & Benefits
Contract Type: Fixed-term Contract
Start Date: 2025/02/16
End Date: 2027/02/15
Basic Salary: 9000
Housing Allowance: 1500
Transportation Allowance: 1000
Other cash allowances: 2000
Total Wage: 13500

10 Bank Account
Bank Name: Al Rajhi Bank
IBAN: SA1180000858608014771260
`;

const SYNTH_OLD = `
تجديد عقد العمل
MID Arabia
Employee Name: Aafaq Sample
Iqama: 9900000012
Nationality: Pakistani
من تاريخ: 2024-01-01
إلى تاريخ: 2025-12-31
الراتب الأساسي: 5000
بدل السكن: 1000
المجموع: 6000
`;

function makeXlsx(name: string, sheets: Record<string, Record<string, unknown>[]>): File {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new File([buf], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function makeEnv(d1: unknown): Env {
  return { DB: d1 as Env['DB'] } as Env;
}

describe('New contract — section-scoped extraction (29714467 layout)', () => {
  const extracted = NEW_CONTRACT_ADAPTER.extract(
    SYNTH_29714467,
    'contract-29714467 (2).pdf',
    'a'.repeat(64),
  );

  it('A. extracts employee identity 2598101232 from Second Party', () => {
    expect(extracted.identityNumber).toBe('2598101232');
  });

  it('B. does NOT extract employer representative 1002896619 as employee', () => {
    expect(extracted.identityNumber).not.toBe('1002896619');
  });

  it('C. extracts total salary 13500', () => {
    expect(extracted.totalSalary).toBe(13500);
  });

  it('D. includes other cash allowance 2000', () => {
    expect(extracted.otherCashAllowances).toBe(2000);
  });

  it('maps full import row for dry-run/commit', () => {
    const row = contractImportRowFromExtraction(extracted);
    expect(row.identityNumber).toBe('2598101232');
    expect(row.totalSalary).toBe(13500);
    expect(row.otherCashAllowances).toBe(2000);
    expect(row.iban).toBe('SA1180000858608014771260');
    expect(row.email).toBe('hamzafayz133@gmail.com');
    expect(row.contractNumber).toBe('29714467');
  });

  it('fails regression if representative identity is selected', () => {
    expect(extracted.identityNumber).not.toBe('1002896619');
    expect(extracted.fullName).not.toMatch(/فيصل/);
  });
});

describe('Old contract adapter', () => {
  it('still extracts from renewal layout', () => {
    const r = OLD_CONTRACT_ADAPTER.extract(SYNTH_OLD, 'AAFAQ.pdf', 'b'.repeat(64));
    expect(r.templateType).toBe('old_contract');
    expect(r.identityNumber).toBe('9900000012');
  });

  it('bounds second-party fields and drops suspicious salary noise', () => {
    const noisy = `
      EMPLOYMENT CONTRACT
      SECOND PARTY:
      Name: AAFAQ AHMED ZULFIQAR ALI Profession: Truck Driver Employee Number: 2020
      Nationality: Pakistani Date of Birth: 2000-01-05
      Identity Number: 2588780672 ID Type: Iqama ID
      Iban: SA3780000857608013592874 Bank Name: Al Rajhi Bank Email Address: aafaq@example.com Mobile Number: 966 0548891105
      Basic Salary: 48
      Housing Allowance: 2
      Transportation Allowance: 3
      Total Salary: 53
    `;
    const r = OLD_CONTRACT_ADAPTER.extract(noisy, 'noisy-old.pdf', 'c'.repeat(64));
    expect(r.fullName).toBe('AAFAQ AHMED ZULFIQAR ALI');
    expect(r.nationality).toBe('Pakistani');
    expect(r.jobTitle).toBe('Truck Driver');
    expect(r.basicSalary).toBeUndefined();
    expect(r.totalSalary).toBeUndefined();
    expect(r.warnings.some((w) => /unusually low/i.test(w))).toBe(true);
  });
});

describe('Excel identity keys', () => {
  it('E. employee Excel maps الرقم الوطني → identityNumber', async () => {
    const file = makeXlsx('بيانات الموظفين.xlsx', {
      Sheet2: [{ 'الرقم الوطني': '2598101232', 'اسم الموظف': 'Test' }],
    });
    const wb = await parseExcelFile(file, 'employees');
    expect(wb.sheets[0]!.rows[0]!.identityNumber).toBe('2598101232');
  });

  it('F. insurance Excel maps IDNo → identityNumber', async () => {
    const file = makeXlsx('popa.xlsx', {
      Sheet1: [
        {
          IDNo: '2598101232',
          PolicyNo: 'POL-1',
          BupaID: 'BUP-1',
          MemberName: 'Test',
          MemberEffectiveDate: '2025-01-01',
          CCHIPolicyStatus: 'Active',
        },
      ],
    });
    const wb = await parseExcelFile(file, 'insurance');
    expect(wb.sheets[0]!.rows[0]!.identityNumber).toBe('2598101232');
  });
});

describe('Dry-run matching by identityNumber', () => {
  it('G. contract dry-run matches existing employee by identity', async () => {
    const mock = makeMockD1({
      employees: [
        {
          id: 'emp_hamza',
          identity_number: '2598101232',
          full_name: 'Hamza',
          status: 'active',
          source_file_id: 'x',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    });
    const row = contractImportRowFromExtraction(
      NEW_CONTRACT_ADAPTER.extract(SYNTH_29714467, 'c.pdf', 'c'.repeat(64)),
    );
    const result = await resolveDryRun(makeEnv(mock.d1), 'contracts', [row]);
    expect(result.items[0]?.resolvedAction).toBe('create');
    expect(result.items[0]?.identityNumber).toBe('2598101232');
  });

  it('H. unmatched contract when employee missing', async () => {
    const mock = makeMockD1({ employees: [] });
    const row = contractImportRowFromExtraction(
      NEW_CONTRACT_ADAPTER.extract(SYNTH_29714467, 'c.pdf', 'd'.repeat(64)),
    );
    const result = await resolveDryRun(makeEnv(mock.d1), 'contracts', [row]);
    expect(result.items[0]?.resolvedAction).toBe('review');
    expect(result.items[0]?.reason).toBe('unmatched_contract');
  });
});
