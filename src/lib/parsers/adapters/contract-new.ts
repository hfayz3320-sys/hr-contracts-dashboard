/**
 * New MID contract template adapter — MoHRSD standardised contract.
 *
 * Fingerprint: the Saudi Ministry of Human Resources and Social Development
 * standard work contract format. Recognisable from the "وزارة الموارد
 * البشرية" header, the "منصة قوى" / "العقد الموحد" identifiers, and the
 * rigid two-column (Hijri + Gregorian) date layout.
 *
 * Anchors:
 *   • "وزارة الموارد البشرية والتنمية الاجتماعية"
 *   • "منصة قوى"
 *   • "العقد الموحد"
 *   • "عقد العمل الموحد"
 *   • "Standard Work Contract"
 *
 * The new template uses TABLES extensively, which means PDF text extraction
 * often returns the label and value in different reading-order positions.
 * The contract-utils `findLabelledValue` already handles the "gap" pattern
 * (up to 200 chars between label and value).
 *
 * For dates specifically, the new template usually has Hijri AND Gregorian
 * side by side. We grab the FIRST date matching after the label and rely
 * on the value-range validator (1900 ≤ year ≤ 2100) to reject Hijri years
 * (which appear as 1440s/1450s — those are valid Gregorian too, but the
 * Gregorian variant tends to appear first or closer to the label).
 *
 * In practice the most reliable strategy is:
 *   1. Try labelled extraction for start and end.
 *   2. If exactly TWO dates exist in the document with year >= 2000, pair
 *      them positionally (first = start, second = end).
 *   3. If FOUR dates exist (Hijri × 2 + Gregorian × 2), prefer the pair
 *      with year >= 2000.
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
import { scoreExtraction } from './contract-old';

const FINGERPRINT_POSITIVE = [
  // Saudi Ministry of Human Resources and Social Development markers
  // (most reliable identifier of the modern standardised contract):
  'وزارة الموارد البشرية',
  'منصة قوى',
  'منصه قوى',
  'العقد الموحد',
  'عقد العمل الموحد',
  'standard work contract',
  'mohrsd',
  // English markers used on bilingual MID copies of the new contract:
  'new appointment',
  'fixed-term contract',
  'fixed term contract',
  'work contract no.',
];

const LABELS = {
  identity: [
    'رقم الهوية', 'الهوية', 'رقم الإقامة', 'الإقامة',
    'الرقم الوطني', 'رقم الهوية الوطنية', 'هوية المقيم',
    'هوية العامل', 'هوية الموظف',
    'Iqama Number', 'Iqama No', 'Iqama', 'Residence Number', 'Residence ID',
    'National ID', 'Identity Number', 'ID Number', 'ID No',
  ],
  fullName: [
    'اسم العامل', 'اسم الموظف', 'الاسم', 'الاسم الكامل', 'اسم رباعي',
    'Worker Name', 'Employee Name', 'Name',
  ],
  nationality: ['الجنسية', 'Nationality'],
  jobTitle: [
    'المهنة', 'الوظيفة', 'المسمى الوظيفي', 'الصفة الوظيفية',
    'Job Title', 'Profession', 'Designation', 'Occupation', 'Position',
  ],
  contractStart: [
    'تاريخ بدء العقد', 'تاريخ بداية العقد', 'تاريخ بداية',
    'تاريخ مباشرة العمل', 'تاريخ المباشرة',
    'تاريخ بدء', 'تاريخ سريان العقد',
    'Contract Start Date', 'Start Date', 'Commencement Date',
    'Effective Date', 'Date of Commencement',
  ],
  contractEnd: [
    'تاريخ نهاية العقد', 'تاريخ نهاية', 'تاريخ انتهاء العقد',
    'تاريخ الانتهاء', 'إلى تاريخ',
    'Contract End Date', 'End Date', 'Expiry Date', 'Termination Date',
  ],
  contractType: [
    'نوع العقد', 'نوع العمل', 'محدد المدة', 'غير محدد المدة',
    'Contract Type', 'Type of Contract', 'Fixed Term', 'Indefinite',
  ],
  basic: [
    'الراتب الأساسي', 'الأجر الأساسي', 'الأجر الأساس',
    'Basic Salary', 'Basic Wage', 'Basic Pay',
  ],
  housing: [
    'بدل السكن', 'علاوة السكن',
    'Housing Allowance', 'Housing',
  ],
  transport: [
    'بدل النقل', 'بدل المواصلات', 'علاوة النقل',
    'Transport Allowance', 'Transportation Allowance', 'Transport',
    'Transportation',
  ],
  total: [
    'إجمالي الراتب', 'إجمالي الأجر', 'الراتب الإجمالي',
    'الأجر الإجمالي', 'الإجمالي', 'المجموع',
    'Total Salary', 'Gross Salary', 'Total Wage', 'Grand Total',
  ],
};

export const NEW_CONTRACT_ADAPTER: PdfContractAdapter = {
  name: 'contract_pdf/mohrsd_new_v1',
  templateType: 'new_contract',

  fingerprint(rawText) {
    const text = rawText.toLowerCase();
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

    // Hijri-vs-Gregorian disambiguation.
    // The new template prints both side by side. Our toIsoDate validator
    // already rejects Hijri years (1400–1500 are valid for both, but the
    // Hijri values rarely fall in our 1900–2100 window since Hijri
    // calendars produce years like 1445). So if we capture a date, it's
    // almost certainly Gregorian.
    if (!startDate || !endDate) {
      const all = findAllDates(text).filter((d) => {
        const y = Number(d.slice(0, 4));
        return y >= 2000 && y <= 2100;
      });
      if (all.length >= 2) {
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
      templateType: 'new_contract',
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
