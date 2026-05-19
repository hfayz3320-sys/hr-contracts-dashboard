/**
 * Old MID contract template adapter.
 *
 * Fingerprint: the older "تجديد عقد العمل" / contract-renewal layout used
 * by MID before the MoHRSD standard contract migration. Less rigid than
 * the new template — fields are typically labelled inline with a colon.
 *
 * Anchors that uniquely identify this template (any one is sufficient):
 *   • "تجديد عقد العمل"
 *   • "إضافة وتجديد"
 *   • "Contract Renewal" / "Renewal of Employment"
 *   • "MID Arabia"  (header logo text)
 *
 * Anchors that should NOT match (otherwise we'd swap to new_contract):
 *   • "منصة قوى"
 *   • "وزارة الموارد البشرية"
 *   • "العقد الموحد"
 */
import type { PdfContractAdapter, ContractExtraction } from '../adapter-types';
import {
  findLabelledValue,
  findAllDates,
  toIsoDate,
  toNumber,
  cleanWhitespace,
  extractIqama,
  normalizeContractText,
  snippetForReview,
  RE_DATE, RE_NUMBER, RE_NAME, RE_TYPE,
} from './contract-utils';

const FINGERPRINT_POSITIVE = [
  'تجديد عقد العمل',
  'تجديد العقد',
  'إضافة وتجديد',
  'إضافة و تجديد',
  'renewal of employment',
  'contract renewal',
  'mid arabia',
];
const FINGERPRINT_NEGATIVE = [
  'منصة قوى', 'وزارة الموارد البشرية', 'العقد الموحد', 'standard work contract',
];

const SECOND_PARTY_START_LABELS = ['SECOND PARTY', 'SECOND PARTY:', 'الطرف الثاني'];
const SECOND_PARTY_END_LABELS = [
  'The two parties have agreed',
  'اتفق الطرفان',
  'This contract includes',
  'Signed by',
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sliceSection(text: string, starts: string[], ends: string[]): string {
  const lower = text.toLowerCase();
  let start = -1;
  for (const s of starts) {
    const idx = lower.indexOf(s.toLowerCase());
    if (idx >= 0 && (start === -1 || idx < start)) start = idx;
  }
  if (start < 0) return text;
  let end = text.length;
  for (const e of ends) {
    const idx = lower.indexOf(e.toLowerCase(), start + 1);
    if (idx >= 0 && idx < end) end = idx;
  }
  return text.slice(start, end);
}

function extractBoundedValue(
  text: string,
  labels: string[],
  stopLabels: string[],
  pattern: RegExp,
): string | undefined {
  for (const label of labels) {
    const re = new RegExp(`${escapeRegex(label)}\\s*:?\\s*`, 'i');
    const m = re.exec(text);
    if (!m) continue;
    const from = m.index + m[0].length;
    let to = text.length;
    const tail = text.slice(from);
    for (const stop of stopLabels) {
      const sRe = new RegExp(`\\b${escapeRegex(stop)}\\b`, 'i');
      const sm = sRe.exec(tail);
      if (sm) to = Math.min(to, from + sm.index);
    }
    const raw = text.slice(from, to).trim();
    const mm = raw.match(pattern);
    if (!mm) continue;
    return cleanWhitespace(mm[0]);
  }
  return undefined;
}

const LABELS = {
  identity: [
    'رقم الهوية', 'الهوية', 'رقم الإقامة', 'الإقامة',
    'الرقم الوطني', 'رقم الهوية الوطنية', 'هوية المقيم',
    'Iqama Number', 'Iqama No', 'Iqama', 'Residence Number', 'Residence ID',
    'National ID', 'Identity Number', 'ID Number', 'ID No',
  ],
  fullName: [
    'اسم الموظف', 'اسم العامل', 'الاسم', 'الاسم الكامل',
    'Employee Name', 'Worker Name', 'Name',
  ],
  nationality: ['الجنسية', 'Nationality'],
  jobTitle: [
    'المهنة', 'الوظيفة', 'المسمى الوظيفي', 'الصفة',
    'Job Title', 'Profession', 'Designation', 'Occupation', 'Position',
  ],
  contractStart: [
    'تاريخ بدء العقد', 'تاريخ بداية العقد', 'تاريخ البداية',
    'من تاريخ', 'تاريخ المباشرة', 'تاريخ البدء',
    'Contract Start Date', 'Start Date', 'Commencement Date',
    'From Date', 'Effective Date',
  ],
  contractEnd: [
    'تاريخ نهاية العقد', 'تاريخ النهاية', 'إلى تاريخ',
    'تاريخ الانتهاء', 'نهاية العقد', 'تاريخ انتهاء العقد',
    'Contract End Date', 'End Date', 'Termination Date',
    'To Date',
  ],
  contractType: [
    'نوع العقد', 'نوع العمل',
    'Contract Type', 'Type of Contract',
  ],
  basic: [
    'الراتب الأساسي', 'الأجر الأساسي', 'الأجر الأساس',
    'Basic Salary', 'Basic Wage', 'Basic Pay',
  ],
  housing: [
    'بدل السكن', 'بدل سكن', 'علاوة السكن',
    'Housing Allowance', 'Housing',
  ],
  transport: [
    'بدل النقل', 'بدل المواصلات', 'علاوة النقل',
    'Transport Allowance', 'Transportation Allowance', 'Transport',
    'Transportation',
  ],
  total: [
    'إجمالي الراتب', 'إجمالي الأجر', 'الراتب الإجمالي',
    'الإجمالي', 'المجموع',
    'Total Salary', 'Gross Salary', 'Total Wage', 'Grand Total', 'Total',
  ],
  iban: ['Iban', 'IBAN', 'رقم الآيبان', 'الآيبان'],
  bankName: ['Bank Name', 'Bank', 'اسم البنك'],
  email: ['Email Address', 'Email', 'E-mail', 'البريد الإلكتروني'],
  mobile: ['Mobile Number', 'Mobile', 'Phone', 'رقم الجوال'],
};

const MIN_REALISTIC_MONTHLY_SALARY = 500;

export const OLD_CONTRACT_ADAPTER: PdfContractAdapter = {
  name: 'contract_pdf/mid_old_v1',
  templateType: 'old_contract',

  fingerprint(rawText) {
    const text = rawText.toLowerCase();
    if (FINGERPRINT_NEGATIVE.some((a) => text.includes(a.toLowerCase()))) return false;
    if (FINGERPRINT_POSITIVE.some((a) => text.includes(a.toLowerCase()))) return true;
    // Older bilingual contracts are often mostly English and may omit
    // explicit "renewal" labels. Detect them via the classic field cluster.
    const hasEmploymentContract = text.includes('employment contract') || text.includes('work contract');
    const hasIdentityField =
      text.includes('iqama') || text.includes('identity number') || text.includes('id no');
    const hasDateWindow =
      text.includes('start date') && (text.includes('end date') || text.includes('expiry date'));
    const hasSecondParty = text.includes('second party');
    return hasEmploymentContract && hasIdentityField && (hasDateWindow || hasSecondParty);
  },

  extract(rawText, filename, fileHash): ContractExtraction {
    const text = normalizeContractText(rawText);
    const secondPartyText = sliceSection(text, SECOND_PARTY_START_LABELS, SECOND_PARTY_END_LABELS);

    const identityNumber =
      extractBoundedValue(
        secondPartyText,
        LABELS.identity,
        ['ID Type', 'نوع الهوية', 'ID Expiry Date'],
        /\b\d{10}\b/,
      ) ?? extractIqama(secondPartyText, LABELS.identity);
    const fullName =
      extractBoundedValue(
        secondPartyText,
        LABELS.fullName,
        ['Profession', 'Employee Number', 'المهنة'],
        /[A-Za-z][A-Za-z\s'.-]{2,}/,
      ) ?? findLabelledValue(secondPartyText, LABELS.fullName, RE_NAME);
    const nationality =
      extractBoundedValue(
        secondPartyText,
        LABELS.nationality,
        ['Date of Birth', 'تاريخ الميلاد', 'Identity Number'],
        /[A-Za-z][A-Za-z\s'.-]{2,}/,
      ) ?? findLabelledValue(secondPartyText, LABELS.nationality, RE_NAME);
    const jobTitle =
      extractBoundedValue(
        secondPartyText,
        LABELS.jobTitle,
        ['Employee Number', 'Nationality', 'الرقم الوظيفي'],
        /[A-Za-z][A-Za-z\s'.-]{2,}/,
      ) ?? findLabelledValue(secondPartyText, LABELS.jobTitle, RE_TYPE);
    const contractType = findLabelledValue(text, LABELS.contractType, RE_TYPE);
    const iban =
      extractBoundedValue(
        secondPartyText,
        LABELS.iban,
        ['Bank Name', 'اسم البنك', 'Email Address'],
        /SA\d{2}[A-Z0-9]{2,30}|SA(?:\s*\d){22}/i,
      ) ?? undefined;
    const bankName =
      extractBoundedValue(
        secondPartyText,
        LABELS.bankName,
        ['Email Address', 'البريد الإلكتروني', 'Mobile Number'],
        /[A-Za-z][A-Za-z\s'.-]{2,}/,
      ) ?? undefined;
    const mobile =
      extractBoundedValue(
        secondPartyText,
        LABELS.mobile,
        ['hereinafter', 'The two parties', 'البريد الإلكتروني'],
        /(?:\+?\d[\d\s-]{7,20}\d)/,
      ) ?? undefined;

    let startDate = toIsoDate(findLabelledValue(text, LABELS.contractStart, RE_DATE));
    let endDate = toIsoDate(findLabelledValue(text, LABELS.contractEnd, RE_DATE));

    // Positional fallback for noisy bilingual OCR output.
    if (!startDate || !endDate) {
      const all = findAllDates(text);
      const picked = pickLikelyContractWindow(all);
      if (picked) {
        startDate = startDate ?? picked.startDate;
        endDate = endDate ?? picked.endDate;
      }
    }

    let basic = toNumber(findLabelledValue(text, LABELS.basic, RE_NUMBER));
    let housing = toNumber(findLabelledValue(text, LABELS.housing, RE_NUMBER));
    let transport = toNumber(findLabelledValue(text, LABELS.transport, RE_NUMBER));
    let total = toNumber(findLabelledValue(text, LABELS.total, RE_NUMBER));
    if (total == null && basic != null) {
      total = basic + (housing ?? 0) + (transport ?? 0);
    }
    const suspiciousSalary =
      (typeof total === 'number' && total > 0 && total < MIN_REALISTIC_MONTHLY_SALARY) ||
      (typeof basic === 'number' && basic > 0 && basic < MIN_REALISTIC_MONTHLY_SALARY);
    if (suspiciousSalary) {
      basic = undefined;
      housing = undefined;
      transport = undefined;
      total = undefined;
    }

    const scored = scoreExtraction({
      filename,
      fileHash,
      templateType: 'old_contract',
      identityNumber,
      fullName: fullName ? cleanWhitespace(fullName) : undefined,
      nationality: nationality ? cleanWhitespace(nationality) : undefined,
      jobTitle: jobTitle ? cleanWhitespace(jobTitle) : undefined,
      contractType: contractType ? cleanWhitespace(contractType) : undefined,
      iban: iban?.replace(/\s+/g, '').toUpperCase(),
      bankName: bankName ? cleanWhitespace(bankName) : undefined,
      mobile: mobile ? cleanWhitespace(mobile) : undefined,
      startDate,
      endDate,
      basicSalary: basic,
      housingAllowance: housing,
      transportAllowance: transport,
      totalSalary: total,
      rawTextSnippet: snippetForReview(text),
    });
    if (suspiciousSalary) {
      scored.warnings.push(
        'Salary values appear unusually low for a monthly contract — likely OCR noise; review wage fields manually.',
      );
    }
    if (typeof scored.fullName === 'string' && /\bprofession\b/i.test(scored.fullName)) {
      scored.warnings.push('Employee name may include adjacent label text due OCR merge; review manually.');
    }
    if (typeof scored.nationality === 'string' && /\bdate of birth\b/i.test(scored.nationality)) {
      scored.warnings.push('Nationality may include adjacent label text due OCR merge; review manually.');
    }
    if (typeof scored.jobTitle === 'string' && /\bemployee number\b/i.test(scored.jobTitle)) {
      scored.warnings.push('Job title may include adjacent label text due OCR merge; review manually.');
    }
    return scored;
  },
};

function pickLikelyContractWindow(
  allDates: string[],
): { startDate: string; endDate: string } | null {
  const uniq = Array.from(new Set(allDates))
    .filter((d) => {
      const year = Number(d.slice(0, 4));
      return Number.isFinite(year) && year >= 2018;
    })
    .sort();
  let best: { startDate: string; endDate: string; score: number } | null = null;
  for (let i = 0; i < uniq.length; i++) {
    for (let j = i + 1; j < uniq.length; j++) {
      const start = uniq[i]!;
      const end = uniq[j]!;
      const days = (Date.parse(end) - Date.parse(start)) / 86400000;
      if (!Number.isFinite(days) || days < 180 || days > 1200) continue;
      const score = Math.abs(days - 365);
      if (!best || score < best.score) best = { startDate: start, endDate: end, score };
    }
  }
  return best ? { startDate: best.startDate, endDate: best.endDate } : null;
}

/**
 * Compute confidence + missingFields + warnings. Shared between old and new
 * adapter implementations (importable as needed). Required fields are
 * weighted 2x because the dry-run resolver gates on them.
 */
export function scoreExtraction(
  partial: Omit<ContractExtraction, 'extractionConfidence' | 'missingFields' | 'warnings'>,
): ContractExtraction {
  const REQUIRED = ['identityNumber', 'startDate', 'endDate'] as const;
  const OPTIONAL = [
    'fullName', 'nationality', 'jobTitle', 'contractType',
    'basicSalary', 'totalSalary', 'contractNumber', 'mobile', 'email',
  ] as const;

  const missingFields: string[] = [];
  let score = 0;
  for (const k of REQUIRED) {
    if (partial[k] != null) score += 2;
    else missingFields.push(k);
  }
  for (const k of OPTIONAL) {
    if (partial[k] != null) score += 1;
  }
  const denom = REQUIRED.length * 2 + OPTIONAL.length;
  const extractionConfidence = Number((score / denom).toFixed(2));

  const warnings: string[] = [];
  if (!partial.identityNumber) warnings.push('No identity number detected — row will go to review.');
  if (!partial.startDate || !partial.endDate) {
    warnings.push('Contract start or end date missing — row will go to review queue with raw extracted text.');
  }
  if (extractionConfidence < 0.6) {
    warnings.push(`Low extraction confidence (${Math.round(extractionConfidence * 100)}%).`);
  }

  return { ...partial, missingFields, extractionConfidence, warnings };
}
