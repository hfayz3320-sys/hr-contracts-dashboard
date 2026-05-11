/**
 * Golden header tests against the real MID files.
 *
 * IMPORTANT: we do NOT read the actual PII-containing Data/*.xlsx files.
 * Instead we synthesize XLSX workbooks with the EXACT header text the
 * user provided for each real file, with synthetic row values. This proves
 * the column dictionary covers every header the production parser will
 * ever encounter from these two sources.
 *
 *   • بيانات الموظفين.xlsx (Sheet2)  — Arabic employee master
 *   • popa.xlsx           (Sheet1)  — Bupa / CCHI medical insurance export
 *
 * Adapter unit tests live next to this for individual-field coverage and
 * Arabic-variant tolerance.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelFile } from '@/lib/parsers/excel';

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

describe('Golden: بيانات الموظفين.xlsx (employees)', () => {
  it('maps every header from the real Arabic employee export', async () => {
    const file = makeXlsx('بيانات الموظفين.xlsx', {
      Sheet2: [
        {
          'رمز الموظف': 'EMP-0001',
          'اسم الموظف': 'Test User',
          'الرقم الوطني': '2111111111',
          'الجنسية': 'Saudi',
          'المسمى الوظيفي': 'Project Manager',
          'الموقع': 'Riyadh HQ',
          'تاريخ الولادة': '1990-01-15',
          'تاريخ التعيين': '2022-03-01',
          'مدة الخدمة': '3 years',
          'إجمالي الراتب': 12000,
          'العمر': 35,
          'التأمين الصحي': 'نعم',
          'الجنس': 'ذكر',
          'نوع العقد': 'دوام كامل',
          'تاريخ بدء العقد': '2022-03-01',
          'تاريخ نهاية العقد': '2025-03-01',
        },
      ],
    });

    const wb = await parseExcelFile(file, 'employees');
    expect(wb.sheets, JSON.stringify(wb.warnings)).toHaveLength(1);
    const sheet = wb.sheets[0]!;
    expect(sheet.domain).toBe('employees');
    expect(sheet.adapterName).toBe('employee_excel/mid_v1');
    expect(sheet.rows[0]).toMatchObject({
      employeeNumber: 'EMP-0001',
      fullName: 'Test User',
      identityNumber: '2111111111',
      nationality: 'Saudi',
      jobTitle: 'Project Manager',
      department: 'Riyadh HQ',
      dateOfBirth: '1990-01-15',
      hireDate: '2022-03-01',
      gender: 'ذكر',
      contractType: 'دوام كامل',
      contractStartDate: '2022-03-01',
      contractEndDate: '2025-03-01',
    });
    expect(sheet.missingPerRow[0]).toEqual([]);
  });

  it('classifies as employees even when sheet name is the literal "Sheet2"', async () => {
    const file = makeXlsx('بيانات الموظفين.xlsx', {
      Sheet2: [
        { 'الرقم الوطني': '2111111111', 'اسم الموظف': 'A', 'الجنسية': 'Saudi' },
      ],
    });
    const wb = await parseExcelFile(file, 'employees');
    expect(wb.sheets).toHaveLength(1);
    expect(wb.sheets[0]!.domain).toBe('employees');
    expect(wb.sheets[0]!.adapterName).toBe('employee_excel/mid_v1');
  });

  it('tolerates Arabic letter-shape variants (alef أإآا, yeh يى, kaf كک)', async () => {
    // Same headers as before but with alternative codepoints.
    const file = makeXlsx('variant-headers.xlsx', {
      Sheet1: [
        {
          'الرقم الوطنى': '2111111111', // ى instead of ي
          'إسم الموظف': 'Variant User', // إ instead of ا
          'الجنسية': 'Saudi',
        },
      ],
    });
    const wb = await parseExcelFile(file, 'employees');
    expect(wb.sheets, JSON.stringify(wb.warnings)).toHaveLength(1);
    expect(wb.sheets[0]!.rows[0]).toMatchObject({
      identityNumber: '2111111111',
      fullName: 'Variant User',
      nationality: 'Saudi',
    });
  });

  it('tolerates Arabic diacritics (Tashkeel)', async () => {
    const file = makeXlsx('tashkeel.xlsx', {
      Sheet1: [
        {
          'الرَّقْم الوَطَنِيُّ': '2111111111', // with shadda/fatha/sukun
          'اسْم الموظَّف': 'Tashkeel User',
        },
      ],
    });
    const wb = await parseExcelFile(file, 'employees');
    expect(wb.sheets, JSON.stringify(wb.warnings)).toHaveLength(1);
    expect(wb.sheets[0]!.rows[0]).toMatchObject({
      identityNumber: '2111111111',
      fullName: 'Tashkeel User',
    });
  });

  it('tolerates non-breaking spaces inside headers', async () => {
    const file = makeXlsx('nbsp-headers.xlsx', {
      Sheet1: [
        {
          ['الرقم الوطني']: '2111111111',
          ['اسم الموظف']: 'NBSP User',
        },
      ],
    });
    const wb = await parseExcelFile(file, 'employees');
    expect(wb.sheets, JSON.stringify(wb.warnings)).toHaveLength(1);
    expect(wb.sheets[0]!.rows[0]).toMatchObject({
      identityNumber: '2111111111',
      fullName: 'NBSP User',
    });
  });
});

describe('Golden: popa.xlsx (Bupa insurance)', () => {
  const FULL_HEADERS = {
    BupaID: 'BUP-1001',
    IDNo: '2111111111',
    MemberName: 'Test User',
    MemberEffectiveDate: '2025-01-01',
    ContractNo: 'CN-9000',
    PolicyNo: 'POL-9000',
    CustomerName: 'MID Arabia',
    BirthDate: '1990-01-15',
    Gender: 'Male',
    Relationship: 'Self',
    MainMembershipNo: 'MM-1001',
    MaritalStatus: 'Married',
    JobName: 'Engineer',
    IDType: 'Iqama',
    IDExpiryDate: '2030-01-01',
    NationalityName: 'Saudi',
    ClassDescription: 'Class A',
    StaffNumber: 'EMP-0001',
    Department: 'Operations',
    BranchDescription: 'Riyadh HQ',
    CCHIPolicyStatus: 'Active',
    PolicyUploadDate: '2024-12-30',
    MemberCCHIStatus: 'Active',
    MemberCCHIUploadDate: '2024-12-30',
  };

  it('classifies as insurance even when sheet name is literal "Sheet1"', async () => {
    const file = makeXlsx('popa.xlsx', { Sheet1: [FULL_HEADERS] });
    const wb = await parseExcelFile(file, 'insurance');
    expect(wb.sheets, JSON.stringify(wb.warnings)).toHaveLength(1);
    expect(wb.sheets[0]!.domain).toBe('insurance');
    expect(wb.sheets[0]!.adapterName).toBe('bupa_insurance_excel/v1');
  });

  it('maps every column from the full Bupa export', async () => {
    const file = makeXlsx('popa.xlsx', { Sheet1: [FULL_HEADERS] });
    const wb = await parseExcelFile(file, 'insurance');
    const row = wb.sheets[0]!.rows[0]!;
    expect(row).toMatchObject({
      memberNumber: 'BUP-1001',
      identityNumber: '2111111111',
      fullName: 'Test User',
      startDate: '2025-01-01',
      contractNumber: 'CN-9000',
      policyNumber: 'POL-9000',
      customerName: 'MID Arabia',
      dateOfBirth: '1990-01-15',
      gender: 'Male',
      relationship: 'Self',
      mainMembershipNumber: 'MM-1001',
      maritalStatus: 'Married',
      jobTitle: 'Engineer',
      idType: 'Iqama',
      idExpiryDate: '2030-01-01',
      nationality: 'Saudi',
      planClass: 'Class A',
      employeeNumber: 'EMP-0001',
      department: 'Operations',
      branch: 'Riyadh HQ',
      status: 'active',
      provider: 'Bupa',
      policyUploadDate: '2024-12-30',
      memberCCHIStatus: 'Active',
      memberCCHIUploadDate: '2024-12-30',
    });
    // Bupa exports have no explicit endDate; the adapter defaults it to
    // startDate + 365 days (auto-renew annual policies).
    expect(row.endDate).toBe('2026-01-01');
  });

  it('group policy — same PolicyNo across multiple BupaIDs preserved as separate rows', async () => {
    const file = makeXlsx('popa-group.xlsx', {
      Sheet1: [
        { ...FULL_HEADERS, BupaID: 'BUP-1', IDNo: '2111111111', MemberName: 'A' },
        { ...FULL_HEADERS, BupaID: 'BUP-2', IDNo: '2111111112', MemberName: 'B' },
        { ...FULL_HEADERS, BupaID: 'BUP-3', IDNo: '2111111113', MemberName: 'C' },
      ],
    });
    const wb = await parseExcelFile(file, 'insurance');
    const rows = wb.sheets[0]!.rows;
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.policyNumber)).size).toBe(1);
    expect(new Set(rows.map((r) => r.memberNumber)).size).toBe(3);
    expect(new Set(rows.map((r) => r.identityNumber)).size).toBe(3);
  });

  it('CCHIPolicyStatus values normalize to canonical status', async () => {
    const file = makeXlsx('popa-statuses.xlsx', {
      Sheet1: [
        { ...FULL_HEADERS, CCHIPolicyStatus: 'Active' },
        { ...FULL_HEADERS, IDNo: '2111111112', BupaID: 'BUP-2', CCHIPolicyStatus: 'Expired' },
        { ...FULL_HEADERS, IDNo: '2111111113', BupaID: 'BUP-3', CCHIPolicyStatus: 'نشط' },
        { ...FULL_HEADERS, IDNo: '2111111114', BupaID: 'BUP-4', CCHIPolicyStatus: 'منتهي' },
        { ...FULL_HEADERS, IDNo: '2111111115', BupaID: 'BUP-5', CCHIPolicyStatus: 'Unknown' },
      ],
    });
    const wb = await parseExcelFile(file, 'insurance');
    const statuses = wb.sheets[0]!.rows.map((r) => r.status);
    expect(statuses).toEqual(['active', 'expired', 'active', 'expired', 'missing']);
  });
});

describe('Mixed and edge cases', () => {
  it('refuses to misclassify a "Random Notes" sheet (no matching headers)', async () => {
    const file = makeXlsx('mixed.xlsx', {
      'Random Notes': [{ note: 'ignore me', misc: 'x' }],
    });
    const wb = await parseExcelFile(file, 'employees');
    expect(wb.sheets).toHaveLength(0);
    expect(wb.warnings.some((w) => /No sheets in this workbook matched/i.test(w))).toBe(true);
  });

  it('employees adapter on an insurance-only workbook reports an empty-warning result', async () => {
    const file = makeXlsx('insurance-only.xlsx', {
      Sheet1: [
        { BupaID: 'BUP-1', PolicyNo: 'POL-X' }, // only Bupa columns
      ],
    });
    const wb = await parseExcelFile(file, 'employees');
    // No employee columns — adapter doesn't match.
    expect(wb.sheets).toHaveLength(0);
  });
});
