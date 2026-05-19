/**
 * New MID contract template adapter — MoHRSD standardised contract.
 *
 * Employee identity and personal fields are extracted ONLY from Section 3 /
 * Second Party (بيانات الطرف الثاني). First Party / employer representative
 * fields must never become the employee row.
 */
import type { PdfContractAdapter, ContractExtraction } from '../adapter-types';
import {
  findLabelledValue,
  findAllDates,
  toIsoDate,
  toNumber,
  cleanWhitespace,
  extractIqamaScoped,
  normalizeContractText,
  snippetForReview,
  splitNewContractSections,
  extractIban,
  RE_DATE, RE_NUMBER, RE_NAME, RE_TYPE,
} from './contract-utils';
import { scoreExtraction } from './contract-old';

const FINGERPRINT_STRONG = [
  'منصة قوى',
  'منصه قوى',
  'qiwa',
  'العقد الموحد',
  'عقد العمل الموحد',
  'standard work contract',
  'mohrsd',
];
const FINGERPRINT_SECTION_MARKERS = [
  /1\.?\s*contract information/i,
  /2\.?\s*first party['’ʼ]s information/i,
  /3\.?\s*second party['’ʼ]s information/i,
  /9\.?\s*wage\s*&\s*benefits/i,
  /10\.?\s*second party['’ʼ]s bank account information/i,
];

const LABELS = {
  identity: [
    'رقم الهوية', 'الهوية', 'رقم الإقامة', 'الإقامة',
    'الرقم الوطني', 'رقم الهوية الوطنية', 'هوية المقيم',
    'هوية العامل', 'هوية الموظف',
    'Iqama Number', 'Iqama No', 'Iqama', 'Residence Number', 'Residence ID',
    'National ID', 'Identity Number', 'ID Number', 'ID No', 'ID no',
  ],
  fullName: [
    'اسم العامل', 'اسم الموظف', 'الاسم', 'الاسم الكامل', 'اسم رباعي', 'الاسم الرباعي',
    'Worker Name', 'Employee Name', 'Name', 'Second Party Name',
  ],
  nationality: ['الجنسية', 'Nationality'],
  passport: ['رقم الجواز', 'جواز السفر', 'Passport Number', 'Passport No', 'Passport'],
  gender: ['الجنس', 'Gender', 'Sex'],
  marital: ['الحالة الاجتماعية', 'Marital Status', 'Marital status'],
  birthDate: ['تاريخ الميلاد', 'Date of Birth', 'Birth Date', 'Birthdate', 'DOB'],
  education: ['المؤهل العلمي', 'Education Level', 'Education', 'Qualification'],
  speciality: ['التخصص', 'Speciality', 'Specialty', 'Specialization'],
  mobile: ['رقم الجوال', 'الجوال', 'الهاتف', 'Mobile', 'Mobile Number', 'Phone'],
  email: ['البريد الإلكتروني', 'البريد', 'Email', 'E-mail'],
  contractNumber: [
    'رقم العقد', 'رقم عقد العمل',
    'Work Contract No', 'Work Contract No.', 'Contract No', 'Contract Number',
  ],
  executionDate: [
    'تاريخ إبرام العقد', 'تاريخ التوقيع', 'تاريخ تحرير العقد',
    'Execution Date', 'Contract Execution Date', 'Date of Execution',
  ],
  occupation: ['المهنة', 'Occupation', 'Profession'],
  jobTitle: [
    'المسمى الوظيفي', 'الوظيفة', 'الصفة الوظيفية', 'Job Title', 'Designation', 'Position',
  ],
  workLocation: ['مكان العمل', 'Work Location', 'Location', 'Workplace', 'City'],
  contractStart: [
    'تاريخ بدء العقد', 'تاريخ بداية العقد', 'تاريخ بداية',
    'تاريخ مباشرة العمل', 'تاريخ المباشرة',
    'Contract Start Date', 'Start Date', 'Commencement Date', 'Starting Date', 'Effective Date',
  ],
  contractEnd: [
    'تاريخ نهاية العقد', 'تاريخ نهاية', 'تاريخ انتهاء العقد',
    'تاريخ الانتهاء', 'إلى تاريخ',
    'Contract End Date', 'End Date', 'Expiry Date', 'Termination Date', 'Contract Expiry Date',
  ],
  contractType: [
    'نوع العقد', 'نوع العمل', 'محدد المدة', 'غير محدد المدة',
    'Contract Type', 'Type of Contract', 'Fixed Term', 'Indefinite', 'Fixed-term Contract',
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
    'Transport Allowance', 'Transportation Allowance', 'Transport', 'Transportation',
  ],
  otherCash: [
    'بدلات نقدية أخرى', 'بدل نقدي آخر', 'بدلات أخرى',
    'Total Other Cash Allowances',
    'Other cash allowances', 'Other Cash Allowances', 'Other Allowances',
  ],
  total: [
    'إجمالي الراتب', 'إجمالي الأجر', 'الراتب الإجمالي',
    'الأجر الإجمالي', 'الإجمالي', 'المجموع', 'إجمالي الأجر الشهري',
    'Total Salary', 'Gross Salary', 'Total Wage', 'Grand Total', 'Total Wage', 'Monthly Package',
  ],
  bankName: ['اسم البنك', 'Bank Name', 'Bank'],
  iban: ['رقم الآيبان', 'الآيبان', 'IBAN', 'Iban'],
};

/** Known first-party representative — must never be selected as employee. */
const BLOCKED_EMPLOYEE_IDENTITIES = new Set(['1002896619']);
const BLOCKED_EMPLOYEE_NAME_FRAGMENTS = ['فيصل القحطاني', 'فيصل', 'القحطاني'];

export const NEW_CONTRACT_ADAPTER: PdfContractAdapter = {
  name: 'contract_pdf/mohrsd_new_v1',
  templateType: 'new_contract',

  fingerprint(rawText) {
    const text = rawText.toLowerCase().replace(/[’ʼ`´]/g, "'");
    const strongHits = FINGERPRINT_STRONG.filter((a) => text.includes(a.toLowerCase())).length;
    const sectionHits = FINGERPRINT_SECTION_MARKERS.filter((re) => re.test(text)).length;
    // Require at least one strong Qiwa/MoHRSD marker and one section marker
    // so old bilingual contracts are not misclassified as new_template.
    return strongHits >= 1 && sectionHits >= 1;
  },

  extract(rawText, filename, fileHash): ContractExtraction {
    const text = normalizeContractText(rawText);
    const sections = splitNewContractSections(text);
    const employeeText = sections.secondParty || '';
    const wageText = sections.wage || '';
    const bankText = sections.bank || '';
    const infoText = sections.contractInfo || text;

    const identityNumber = extractIqamaScoped(employeeText, LABELS.identity);
    const fullName = findLabelledValue(employeeText, LABELS.fullName, RE_NAME);
    const nationality = findLabelledValue(employeeText, LABELS.nationality, RE_NAME);
    const passportNumber = findLabelledValue(employeeText, LABELS.passport, RE_TYPE);
    const gender = findLabelledValue(employeeText, LABELS.gender, RE_TYPE);
    const maritalStatus = findLabelledValue(employeeText, LABELS.marital, RE_TYPE);
    const birthDate = toIsoDate(findLabelledValue(employeeText, LABELS.birthDate, RE_DATE));
    const educationLevel = findLabelledValue(employeeText, LABELS.education, RE_TYPE);
    const speciality = findLabelledValue(employeeText, LABELS.speciality, RE_TYPE);
    const mobile = findLabelledValue(employeeText, LABELS.mobile, '[+\\d][\\d\\s\\-]{7,20}');
    const email = findLabelledValue(employeeText, LABELS.email, '[\\w.+%\\-]+@[\\w.\\-]+\\.[A-Za-z]{2,}');

    const occupation = findLabelledValue(
      sections.profession || employeeText,
      LABELS.occupation,
      RE_TYPE,
    );
    const jobTitle = findLabelledValue(
      sections.profession || employeeText,
      LABELS.jobTitle,
      RE_TYPE,
    );
    const workLocation = findLabelledValue(
      sections.profession || employeeText,
      LABELS.workLocation,
      RE_TYPE,
    );

    const contractNumber =
      findLabelledValue(infoText, LABELS.contractNumber, '[\\d]{5,12}') ??
      findLabelledValue(text, LABELS.contractNumber, '[\\d]{5,12}');
    const executionDate = toIsoDate(
      findLabelledValue(infoText, LABELS.executionDate, RE_DATE) ??
        findLabelledValue(text, LABELS.executionDate, RE_DATE),
    );

    const contractType = findLabelledValue(wageText || text, LABELS.contractType, RE_TYPE);
    let startDate = toIsoDate(
      findLabelledValue(infoText, LABELS.contractStart, RE_DATE) ??
        findLabelledValue(text, LABELS.contractStart, RE_DATE),
    );
    let endDate = toIsoDate(
      findLabelledValue(infoText, LABELS.contractEnd, RE_DATE) ??
        findLabelledValue(text, LABELS.contractEnd, RE_DATE),
    );

    if (!startDate || !endDate) {
      const infoDates = findAllDates(infoText).filter((d) => {
        const y = Number(d.slice(0, 4));
        return y >= 2000 && y <= 2100;
      });
      if (infoDates.length >= 2) {
        startDate = startDate ?? infoDates[0];
        endDate = endDate ?? infoDates[1];
      }
    }

    const basic = toNumber(findLabelledValue(wageText, LABELS.basic, RE_NUMBER));
    const housing = toNumber(findLabelledValue(wageText, LABELS.housing, RE_NUMBER));
    const transport = toNumber(findLabelledValue(wageText, LABELS.transport, RE_NUMBER));
    const otherCash = toNumber(findLabelledValue(wageText, LABELS.otherCash, RE_NUMBER));
    let total = toNumber(findLabelledValue(wageText, LABELS.total, RE_NUMBER));
    if (total == null && basic != null) {
      total = basic + (housing ?? 0) + (transport ?? 0) + (otherCash ?? 0);
    }

    const bankName = findLabelledValue(bankText, LABELS.bankName, RE_NAME);
    const iban =
      extractIban(bankText) ??
      extractIban(text) ??
      findLabelledValue(bankText, LABELS.iban, 'SA(?:\\s*\\d){22}');

    const warnings: string[] = [];
    if (!sections.secondParty) {
      warnings.push('Second Party section not found — employee fields may be incomplete.');
    }
    if (identityNumber && BLOCKED_EMPLOYEE_IDENTITIES.has(identityNumber)) {
      warnings.push(
        `Blocked identity ${identityNumber} matches First Party representative — extraction rejected.`,
      );
    }
    if (fullName && BLOCKED_EMPLOYEE_NAME_FRAGMENTS.some((f) => fullName.includes(f))) {
      warnings.push('Extracted name matches employer representative — verify Second Party section.');
    }

    const safeIdentity =
      identityNumber && !BLOCKED_EMPLOYEE_IDENTITIES.has(identityNumber)
        ? identityNumber
        : undefined;
    let safeName = fullName ? cleanWhitespace(fullName) : undefined;
    if (
      safeName &&
      !safeIdentity &&
      BLOCKED_EMPLOYEE_NAME_FRAGMENTS.some((f) => safeName!.includes(f))
    ) {
      safeName = undefined;
    }

    const scored = scoreExtraction({
      filename,
      fileHash,
      sourceFile: filename,
      templateType: 'new_contract',
      contractNumber: contractNumber?.replace(/\D/g, '') || contractNumber,
      executionDate,
      identityNumber: safeIdentity,
      fullName: safeName || (safeIdentity ? cleanWhitespace(fullName ?? '') : undefined),
      nationality: nationality ? cleanWhitespace(nationality) : undefined,
      passportNumber: passportNumber ? cleanWhitespace(passportNumber) : undefined,
      gender: gender ? cleanWhitespace(gender) : undefined,
      maritalStatus: maritalStatus ? cleanWhitespace(maritalStatus) : undefined,
      birthDate,
      educationLevel: educationLevel ? cleanWhitespace(educationLevel) : undefined,
      speciality: speciality ? cleanWhitespace(speciality) : undefined,
      mobile: mobile ? cleanWhitespace(mobile) : undefined,
      email: email ? cleanWhitespace(email) : undefined,
      occupation: occupation ? cleanWhitespace(occupation) : undefined,
      jobTitle: jobTitle ? cleanWhitespace(jobTitle) : undefined,
      workLocation: workLocation ? cleanWhitespace(workLocation) : undefined,
      contractType: contractType ? cleanWhitespace(contractType) : undefined,
      startDate,
      endDate,
      basicSalary: basic,
      housingAllowance: housing,
      transportAllowance: transport,
      otherCashAllowances: otherCash,
      totalSalary: total,
      bankName: bankName ? cleanWhitespace(bankName) : undefined,
      iban: iban ? iban.toUpperCase() : undefined,
      rawTextSnippet: snippetForReview(text),
    });
    scored.warnings.push(...warnings);
    return scored;
  },
};
