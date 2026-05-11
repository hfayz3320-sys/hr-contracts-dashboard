/**
 * Employee Excel adapter — MID Arabic master file.
 *
 * Source format: بيانات الموظفين.xlsx (sheet "Sheet2"), columns:
 *
 *   رمز الموظف          → employeeNumber       (secondary, history-only)
 *   اسم الموظف          → fullName             (also accepts اسم الموظف)
 *   الرقم الوطني        → identityNumber       (PRIMARY MATCH KEY)
 *   الجنسية             → nationality
 *   المسمى الوظيفي      → jobTitle
 *   الموقع              → department / location
 *   تاريخ الولادة        → dateOfBirth
 *   تاريخ التعيين       → hireDate
 *   مدة الخدمة          → servicePeriod        (informational; carried but unused)
 *   إجمالي الراتب       → totalSalary          (informational)
 *   العمر               → age                  (derivable from dateOfBirth; carried)
 *   التأمين الصحي       → medicalInsuranceFlag (informational)
 *   الجنس               → gender
 *   نوع العقد           → contractType         (informational at employee level)
 *   تاريخ بدء العقد     → contractStartDate    (informational)
 *   تاريخ نهاية العقد   → contractEndDate      (informational)
 *
 * Headers are matched after Arabic-aware normalization (diacritics stripped,
 * letter shapes folded, NBSP normalized). The adapter still accepts the
 * common English equivalents and shorthand variants so a hybrid file
 * doesn't break the import.
 *
 * Required field: identityNumber. Rows missing it are still returned but
 * flagged with `missing: ['identityNumber']` so the dry-run resolver can
 * route them to the review queue.
 */
import { normalizeHeader, buildHeaderIndex } from '../arabic-text';
import type {
  AdapterResult,
  ExcelAdapter,
} from '../adapter-types';

const FIELDS: Record<string, readonly string[]> = {
  identityNumber: [
    // Arabic (the file we target)
    'الرقم الوطني',
    'رقم الهوية',
    'الهوية',
    'الهوية الوطنية',
    'رقم الهوية الوطنية',
    'الإقامة',
    'رقم الإقامة',
    // English
    'identityNumber', 'identity number', 'id', 'idno', 'id no', 'id number',
    'national id', 'nationalid', 'national number',
    'iqama', 'iqama number', 'iqama no',
    'residence number', 'residency id',
  ],
  employeeNumber: [
    'رمز الموظف',
    'الرقم الوظيفي',
    'رقم الموظف',
    'الرمز الوظيفي',
    'employeeNumber', 'employee number', 'employee no', 'employee code',
    'emp no', 'emp id', 'empcode', 'staff id', 'staff no', 'staffnumber',
    'badge',
  ],
  fullName: [
    'اسم الموظف',
    'الاسم',
    'الاسم الكامل',
    'fullName', 'full name', 'name', 'employee name', 'staff name',
  ],
  fullNameArabic: [
    'الاسم بالعربية', 'الاسم عربى', 'الاسم عربي',
    'arabic name', 'full name arabic', 'name in arabic',
  ],
  nationality: [
    'الجنسية',
    'nationality', 'nationality name',
  ],
  jobTitle: [
    'المسمى الوظيفي',
    'المهنة',
    'الوظيفة',
    'jobTitle', 'job title', 'profession', 'designation', 'occupation', 'position',
  ],
  department: [
    'الموقع',
    'القسم',
    'الفرع',
    'المشروع',
    'department', 'location', 'site', 'branch', 'project',
  ],
  dateOfBirth: [
    'تاريخ الولادة',
    'تاريخ الميلاد',
    'الميلاد',
    'dateOfBirth', 'date of birth', 'dob', 'birth date', 'birthdate',
  ],
  hireDate: [
    'تاريخ التعيين',
    'تاريخ الالتحاق',
    'تاريخ المباشرة',
    'تاريخ بدء العمل',
    'hireDate', 'hire date', 'joining date', 'date of joining', 'start date',
  ],
  gender: [
    'الجنس',
    'gender', 'sex',
  ],
  totalSalary: [
    'إجمالي الراتب',
    'الراتب الإجمالي',
    'المرتب الإجمالي',
    'إجمالي الأجر',
    'totalSalary', 'total salary', 'gross salary',
  ],
  age: [
    'العمر',
    'age',
  ],
  servicePeriod: [
    'مدة الخدمة',
    'service period', 'service duration', 'tenure',
  ],
  medicalInsuranceFlag: [
    'التأمين الصحي',
    'medical insurance', 'has insurance',
  ],
  contractType: [
    'نوع العقد',
    'contract type',
  ],
  contractStartDate: [
    'تاريخ بدء العقد',
    'تاريخ بداية العقد',
    'contract start date',
  ],
  contractEndDate: [
    'تاريخ نهاية العقد',
    'تاريخ انتهاء العقد',
    'contract end date',
  ],
  status: [
    'الحالة',
    'الحالة الوظيفية',
    'status', 'state',
  ],
};

const HEADER_INDEX = buildHeaderIndex(FIELDS);

const REQUIRED = ['identityNumber'] as const;
const RECOMMENDED = ['fullName'] as const;

export const EMPLOYEE_EXCEL_ADAPTER: ExcelAdapter = {
  name: 'employee_excel/mid_v1',
  importType: 'employees',
  parseSheet(sheetName, json): AdapterResult {
    const warnings: string[] = [];
    const rows: Record<string, unknown>[] = [];
    const missingPerRow: string[][] = [];
    if (json.length === 0) {
      return {
        adapterName: this.name,
        source: sheetName,
        rows,
        missingPerRow,
        warnings: [`Sheet "${sheetName}" is empty.`],
        matched: false,
      };
    }

    const headers = Object.keys(json[0] ?? {});
    const headerMap = new Map<string, string>();
    const unknownHeaders: string[] = [];
    for (const h of headers) {
      const canonical = HEADER_INDEX.get(normalizeHeader(h));
      if (canonical) headerMap.set(h, canonical);
      else unknownHeaders.push(h);
    }

    // No usable headers → the sheet doesn't match this adapter at all.
    // Caller (dispatcher) decides whether that's an error or just "skip".
    if (headerMap.size === 0) {
      return {
        adapterName: this.name,
        source: sheetName,
        rows: [],
        missingPerRow: [],
        warnings: [
          `Sheet "${sheetName}" had no recognisable employee columns (got: ${headers.slice(0, 8).join(', ')}…).`,
        ],
        matched: false,
      };
    }
    // Sheet matched but we want to surface what we ignored, so admins can
    // spot drift / new columns to add.
    if (unknownHeaders.length > 0) {
      warnings.push(
        `Sheet "${sheetName}" ignored ${unknownHeaders.length} unrecognised column(s): ${unknownHeaders.slice(0, 5).join(', ')}${unknownHeaders.length > 5 ? '…' : ''}`,
      );
    }

    for (const raw of json) {
      const mapped: Record<string, unknown> = {};
      for (const [original, value] of Object.entries(raw)) {
        if (value == null || value === '') continue;
        const canonical = headerMap.get(original);
        if (!canonical) continue;
        mapped[canonical] = typeof value === 'string' ? value.trim() : value;
      }

      // Skip entirely blank rows.
      if (Object.keys(mapped).length === 0) continue;

      const missing: string[] = [];
      for (const f of REQUIRED) {
        if (mapped[f] == null || mapped[f] === '') missing.push(f);
      }
      for (const f of RECOMMENDED) {
        if (mapped[f] == null || mapped[f] === '') missing.push(f);
      }

      rows.push(mapped);
      missingPerRow.push(missing);
    }

    const withIdentity = rows.filter((r) => r.identityNumber).length;
    if (withIdentity === 0 && rows.length > 0) {
      warnings.push(
        `Sheet "${sheetName}" produced ${rows.length} rows but none had a recognisable identityNumber column. All will be routed to the review queue.`,
      );
    }

    return {
      adapterName: this.name,
      source: sheetName,
      rows,
      missingPerRow,
      warnings,
      matched: true,
    };
  },
};
