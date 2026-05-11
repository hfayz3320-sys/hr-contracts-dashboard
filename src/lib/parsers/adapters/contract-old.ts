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
    'Contract End Date', 'End Date', 'Expiry Date', 'Termination Date',
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
};

export const OLD_CONTRACT_ADAPTER: PdfContractAdapter = {
  name: 'contract_pdf/mid_old_v1',
  templateType: 'old_contract',

  fingerprint(rawText) {
    const text = rawText.toLowerCase();
    if (FINGERPRINT_NEGATIVE.some((a) => text.includes(a.toLowerCase()))) return false;
    return FINGERPRINT_POSITIVE.some((a) => text.includes(a.toLowerCase()));
  },

  extract(rawText, filename, fileHash): ContractExtraction {
    const text = normalizeContractText(rawText);

    const identityNumber = extractIqama(text, LABELS.identity);
    const fullName = findLabelledValue(text, LABELS.fullName, RE_NAME);
    const nationality = findLabelledValue(text, LABELS.nationality, RE_NAME);
    const jobTitle = findLabelledValue(text, LABELS.jobTitle, RE_TYPE);
    const contractType = findLabelledValue(text, LABELS.contractType, RE_TYPE);

    let startDate = toIsoDate(findLabelledValue(text, LABELS.contractStart, RE_DATE));
    let endDate = toIsoDate(findLabelledValue(text, LABELS.contractEnd, RE_DATE));

    // Positional fallback: if exactly two dates exist in the document and
    // the labelled extractor only found one (or none), pair them by order:
    // first = start, second = end. This catches renewal docs where the
    // date pair appears in a table with no per-cell label.
    if (!startDate || !endDate) {
      const all = findAllDates(text);
      if (all.length === 2) {
        startDate = startDate ?? all[0];
        endDate = endDate ?? all[1];
      }
    }

    const basic = toNumber(findLabelledValue(text, LABELS.basic, RE_NUMBER));
    const housing = toNumber(findLabelledValue(text, LABELS.housing, RE_NUMBER));
    const transport = toNumber(findLabelledValue(text, LABELS.transport, RE_NUMBER));
    let total = toNumber(findLabelledValue(text, LABELS.total, RE_NUMBER));
    if (total == null && basic != null) {
      total = basic + (housing ?? 0) + (transport ?? 0);
    }

    return scoreExtraction({
      filename,
      fileHash,
      templateType: 'old_contract',
      identityNumber,
      fullName: fullName ? cleanWhitespace(fullName) : undefined,
      nationality: nationality ? cleanWhitespace(nationality) : undefined,
      jobTitle: jobTitle ? cleanWhitespace(jobTitle) : undefined,
      contractType: contractType ? cleanWhitespace(contractType) : undefined,
      startDate,
      endDate,
      basicSalary: basic,
      housingAllowance: housing,
      transportAllowance: transport,
      totalSalary: total,
      rawTextSnippet: snippetForReview(text),
    });
  },
};

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
    'basicSalary', 'totalSalary',
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
