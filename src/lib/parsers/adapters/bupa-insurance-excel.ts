/**
 * Medical insurance Excel adapter — Bupa / CCHI export.
 *
 * Source format: popa.xlsx (sheet "Sheet1"), columns:
 *
 *   BupaID                  → memberNumber       (PRIMARY group-policy disambiguator)
 *   IDNo                    → identityNumber     (PRIMARY MATCH KEY for employee linkage)
 *   MemberName              → fullName
 *   MemberEffectiveDate     → startDate
 *   ContractNo              → contractNumber     (carried for audit)
 *   PolicyNo                → policyNumber       (shared across group members)
 *   CustomerName            → customerName       (the insured company; carried)
 *   BirthDate               → dateOfBirth
 *   Gender                  → gender
 *   Relationship            → relationship       (carried)
 *   MainMembershipNo        → mainMembershipNumber
 *   MaritalStatus           → maritalStatus      (carried)
 *   JobName                 → jobTitle
 *   IDType                  → idType             (carried)
 *   IDExpiryDate            → idExpiryDate       (carried)
 *   NationalityName         → nationality
 *   ClassDescription        → planClass          (carried)
 *   StaffNumber             → employeeNumber     (secondary)
 *   Department              → department
 *   BranchDescription       → branch             (carried)
 *   CCHIPolicyStatus        → status             (normalized to active|expired|missing)
 *   PolicyUploadDate        → policyUploadDate   (carried)
 *   MemberCCHIStatus        → memberCCHIStatus   (carried)
 *   MemberCCHIUploadDate    → memberCCHIUploadDate (carried)
 *
 * Bupa CCHI exports omit an explicit policy endDate (policies auto-renew
 * annually). The adapter defaults endDate = MemberEffectiveDate + 365 days
 * so the row clears the "missing required field" gate. Admins can edit
 * before commit. Provider is set to "Bupa" if not otherwise present.
 */
import { normalizeHeader, normalizeArabicText, buildHeaderIndex } from '../arabic-text';
import type { AdapterResult, ExcelAdapter } from '../adapter-types';

const FIELDS: Record<string, readonly string[]> = {
  identityNumber: [
    'IDNo', 'ID No', 'ID Number', 'IdentityNumber',
    'الرقم الوطني', 'رقم الهوية', 'الهوية', 'الإقامة', 'رقم الإقامة',
    'national id', 'nationalid', 'iqama', 'iqama no',
  ],
  memberNumber: [
    'BupaID', 'Bupa ID', 'Bupa Id', 'TawuniyaID',
    'MemberID', 'Member ID', 'MemberNo', 'Member No', 'Member Number',
    'CardNumber', 'Card No', 'Card Number',
    'رقم العضوية', 'رقم البطاقة',
  ],
  mainMembershipNumber: [
    'MainMembershipNo', 'Main Membership No', 'MainMembershipNumber',
    'Primary Member No', 'Primary Member Number',
  ],
  policyNumber: [
    'PolicyNo', 'Policy No', 'Policy Number', 'PolicyNumber',
    'رقم البوليصة', 'رقم الوثيقة',
  ],
  contractNumber: [
    'ContractNo', 'Contract No', 'ContractNumber',
  ],
  fullName: [
    'MemberName', 'Member Name', 'Full Name', 'Name',
    'اسم العضو', 'الاسم',
  ],
  customerName: [
    'CustomerName', 'Customer Name',
  ],
  dateOfBirth: [
    'BirthDate', 'Birth Date', 'Date of Birth', 'DOB',
    'تاريخ الميلاد', 'تاريخ الولادة',
  ],
  gender: [
    'Gender', 'Sex', 'الجنس',
  ],
  relationship: [
    'Relationship', 'Relation', 'صلة القرابة',
  ],
  maritalStatus: [
    'MaritalStatus', 'Marital Status', 'الحالة الاجتماعية',
  ],
  jobTitle: [
    'JobName', 'Job Name', 'Job Title', 'Profession',
    'المسمى الوظيفي', 'المهنة',
  ],
  idType: [
    'IDType', 'ID Type',
  ],
  idExpiryDate: [
    'IDExpiryDate', 'ID Expiry Date',
  ],
  nationality: [
    'NationalityName', 'Nationality Name', 'Nationality',
    'الجنسية',
  ],
  planClass: [
    'ClassDescription', 'Class Description', 'Class', 'Plan Class',
  ],
  employeeNumber: [
    'StaffNumber', 'Staff Number', 'Staff No', 'Employee Number', 'Employee No',
    'رقم الموظف', 'الرقم الوظيفي',
  ],
  department: [
    'Department', 'Section', 'القسم',
  ],
  branch: [
    'BranchDescription', 'Branch Description', 'Branch', 'الفرع',
  ],
  startDate: [
    'MemberEffectiveDate', 'Member Effective Date', 'EffectiveDate',
    'Effective Date', 'Start Date', 'Policy Start Date',
    'تاريخ بدء العضوية', 'تاريخ السريان',
  ],
  endDate: [
    'EndDate', 'End Date', 'Policy End Date', 'Expiry Date', 'Expiration Date',
    'تاريخ نهاية العضوية', 'تاريخ الانتهاء',
  ],
  policyUploadDate: [
    'PolicyUploadDate', 'Policy Upload Date',
  ],
  memberCCHIStatus: [
    'MemberCCHIStatus', 'Member CCHI Status',
  ],
  memberCCHIUploadDate: [
    'MemberCCHIUploadDate', 'Member CCHI Upload Date',
  ],
  status: [
    'CCHIPolicyStatus', 'CCHI Policy Status', 'Policy Status', 'Status',
    'الحالة',
  ],
  provider: [
    'Provider', 'Insurer', 'Insurance Company', 'Company',
    'شركة التأمين', 'مزود الخدمة',
  ],
};

const HEADER_INDEX = buildHeaderIndex(FIELDS);

const REQUIRED = ['identityNumber', 'policyNumber', 'startDate'] as const;

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function toIsoDateLike(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date (day 1 = 1900-01-01 with Excel leap-year bug).
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  if (!s) return undefined;
  // YYYY-MM-DD | YYYY/MM/DD | DD/MM/YYYY | DD-MM-YYYY
  const numeric =
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s) ??
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s);
  if (numeric) {
    let year: number;
    let month: number;
    let day: number;
    if (numeric[1]!.length === 4) {
      year = Number(numeric[1]);
      month = Number(numeric[2]);
      day = Number(numeric[3]);
    } else {
      day = Number(numeric[1]);
      month = Number(numeric[2]);
      year = Number(numeric[3]);
    }
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // 11-Jun-25 / 11 Jun 2025
  const mmm = /^(\d{1,2})[\s-]([A-Za-z]{3})[\s-](\d{2}|\d{4})$/.exec(s);
  if (!mmm) return undefined;
  const day = Number(mmm[1]);
  const month = MONTH_MAP[mmm[2]!.toLowerCase()];
  const yy = Number(mmm[3]);
  const year = mmm[3]!.length === 2 ? 2000 + yy : yy;
  if (!month || year < 1900 || year > 2100 || day < 1 || day > 31) return undefined;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addYearISO(isoLike: string): string | undefined {
  const parsed = toIsoDateLike(isoLike);
  if (!parsed) return undefined;
  const [yearS, monthS, dayS] = parsed.split('-');
  const year = Number(yearS);
  const month = Number(monthS);
  const day = Number(dayS);
  const d = new Date(Date.UTC(year + 1, month - 1, day));
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

function normalizeStatus(raw: unknown): 'active' | 'expired' | 'missing' {
  if (typeof raw !== 'string') return 'missing';
  const v = normalizeArabicText(raw);
  if (/(active|valid|نشط|سار|سارية|فعال)/.test(v)) return 'active';
  if (/(expired|cancelled|inactive|منتهي|منتهية|ملغي|ملغية)/.test(v)) return 'expired';
  return 'missing';
}

export const BUPA_INSURANCE_EXCEL_ADAPTER: ExcelAdapter = {
  name: 'bupa_insurance_excel/v1',
  importType: 'insurance',
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

    if (headerMap.size === 0) {
      return {
        adapterName: this.name,
        source: sheetName,
        rows: [],
        missingPerRow: [],
        warnings: [
          `Sheet "${sheetName}" had no recognisable Bupa/CCHI columns (got: ${headers.slice(0, 8).join(', ')}…).`,
        ],
        matched: false,
      };
    }
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

      if (Object.keys(mapped).length === 0) continue;

      // Bupa-specific post-processing.
      if (!mapped.provider) mapped.provider = 'Bupa';
      const normalizedStart = toIsoDateLike(mapped.startDate);
      if (normalizedStart) mapped.startDate = normalizedStart;
      const normalizedEnd = toIsoDateLike(mapped.endDate);
      if (normalizedEnd) mapped.endDate = normalizedEnd;
      if (typeof mapped.startDate === 'string' && !mapped.endDate) {
        const computed = addYearISO(mapped.startDate);
        if (computed) mapped.endDate = computed;
      }
      mapped.status = normalizeStatus(mapped.status);

      const missing: string[] = [];
      for (const f of REQUIRED) {
        if (mapped[f] == null || mapped[f] === '') missing.push(f);
      }

      rows.push(mapped);
      missingPerRow.push(missing);
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
