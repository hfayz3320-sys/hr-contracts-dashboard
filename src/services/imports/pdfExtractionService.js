import { IMPORT_STATUSES } from '../../storage/indexedDb/dbSchema';
import { normalizeNationality, parseDateToISO } from '../../utils/cleaning';

const ARABIC_CHAR_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;
const LETTER_OR_NUMBER_REGEX = /[\p{L}\p{N}]/u;
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_REGEX = /(?:\+?\d[\d\s-]{7,}\d)/;
const MONEY_REGEX = /-?\d[\d,]*(?:\.\d{1,2})?/;
const DATE_REGEX =
  /\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2})\b/;
const DMY_DATE_REGEX = /\b\d{2}-\d{2}-\d{4}\b/;

const CANONICAL_ID_TYPES = {
  iqama: 'Iqama ID',
  'iqama id': 'Iqama ID',
  passport: 'Passport',
  'national id': 'National ID',
  'id card': 'National ID',
};

const FIELD_LABELS = {
  ContractNumber: 'Contract Number',
  Name: 'Employee Name',
  Profession: 'Job Title / Position',
  EmployeeNumber: 'Employee Number',
  Nationality: 'Nationality',
  DateOfBirth: 'Birth Date',
  IdentityNumber: 'Identity / Iqama / Passport No',
  IDType: 'ID Type',
  IDExpiryDate: 'ID Expiry Date',
  Gender: 'Gender',
  Religion: 'Religion',
  MaritalStatus: 'Marital Status',
  Education: 'Education',
  Speciality: 'Speciality',
  IBAN: 'IBAN',
  BankName: 'Bank Name',
  Email: 'Email',
  MobileNumber: 'Mobile Number',
  ContractDurationYears: 'Contract Duration (Years)',
  StartDate: 'Contract Start Date',
  EndDate: 'Contract End Date',
  JoiningDate: 'Joining Date',
  BasicSalary: 'Basic Salary',
  OTAllowance: 'OT Allowance',
  FoodAllowance: 'Food Allowance',
  WorkLocation: 'Work Location',
};

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSearchText(value) {
  return normalizeWhitespace(value)
    .replace(/[\u2018\u2019`]/g, "'")
    .replace(/[\u2013\u2014]/g, '-');
}

function isNoiseLine(line) {
  const value = normalizeWhitespace(line);
  if (!value) {
    return true;
  }

  if (!LETTER_OR_NUMBER_REGEX.test(value)) {
    return true;
  }

  if (/^\d{1,2}:\d{2}\s+\d{4}-\d{2}-\d{2}/.test(value)) {
    return true;
  }

  if (/^created by\b/i.test(value)) {
    return true;
  }

  if (/^this contract is active as in\b/i.test(value)) {
    return true;
  }

  if (/\|\s*\d{6,}/.test(value)) {
    return true;
  }

  return false;
}

function collapseRepeatedSequence(value) {
  const tokens = normalizeWhitespace(value).split(' ').filter(Boolean);
  if (tokens.length < 2) {
    return normalizeWhitespace(value);
  }

  for (let segmentLength = 1; segmentLength <= Math.floor(tokens.length / 2); segmentLength += 1) {
    if (tokens.length % segmentLength !== 0) {
      continue;
    }

    const firstSegment = tokens.slice(0, segmentLength).join(' ');
    const repeated = Array(tokens.length / segmentLength)
      .fill(firstSegment)
      .join(' ');

    if (repeated.toLowerCase() === tokens.join(' ').toLowerCase()) {
      return firstSegment;
    }
  }

  return tokens.join(' ');
}

function stripArabicTail(value) {
  const normalized = normalizeWhitespace(value);
  const arabicIndex = normalized.search(ARABIC_CHAR_REGEX);
  return arabicIndex === -1 ? normalized : normalized.slice(0, arabicIndex).trim();
}

function stripTrailingEnglishNoise(value) {
  return normalizeWhitespace(value)
    .replace(/\bhereinafter referred to\b.*$/i, '')
    .replace(/\bthe two parties have agreed\b.*$/i, '')
    .replace(/\bthis contract was created electronically\b.*$/i, '')
    .trim();
}

function sanitizeLabelValue(rawValue, { latinOnly = false } = {}) {
  let cleaned = normalizeSearchText(rawValue);
  cleaned = stripTrailingEnglishNoise(cleaned);
  if (latinOnly) {
    cleaned = stripArabicTail(cleaned);
  }
  cleaned = collapseRepeatedSequence(cleaned);
  cleaned = cleaned.replace(/^[,;:.\-\s]+|[,;:.\-\s]+$/g, '');
  return cleaned.trim();
}

function sanitizeTextValue(rawValue) {
  return sanitizeLabelValue(rawValue, { latinOnly: true });
}

function sanitizeNameValue(rawValue) {
  return sanitizeTextValue(rawValue).replace(/\b(name|employee number|profession)\b/i, '').trim();
}

function sanitizeNumberValue(rawValue) {
  const candidate = sanitizeLabelValue(rawValue, { latinOnly: true });
  const matches = candidate.match(/\d+/g);
  return matches?.[0] || '';
}

function sanitizeDateValue(rawValue) {
  const candidate = sanitizeLabelValue(rawValue, { latinOnly: true });
  return candidate.match(DATE_REGEX)?.[1] || '';
}

function sanitizeAmountValue(rawValue) {
  const candidate = sanitizeLabelValue(rawValue, { latinOnly: true });
  const amount = candidate.match(MONEY_REGEX)?.[0] || '';
  const normalized = amount.replace(/,/g, '');
  return Number.isFinite(Number(normalized)) ? Number(normalized).toFixed(2) : '';
}

function sanitizeEmailValue(rawValue) {
  const candidate = sanitizeLabelValue(rawValue, { latinOnly: true });
  return candidate.match(EMAIL_REGEX)?.[0]?.toLowerCase() || '';
}

function sanitizePhoneValue(rawValue) {
  const candidate = sanitizeLabelValue(rawValue, { latinOnly: true });
  const phone = candidate.match(PHONE_REGEX)?.[0] || '';
  return normalizeWhitespace(phone);
}

function sanitizeIbanValue(rawValue) {
  const candidate = sanitizeLabelValue(rawValue, { latinOnly: true })
    .replace(/\s+/g, '')
    .toUpperCase();
  return candidate.match(/[A-Z]{2}[A-Z0-9]{13,32}/)?.[0] || '';
}

function normalizeGender(rawValue) {
  const candidate = sanitizeTextValue(rawValue).toLowerCase();
  if (candidate === 'male' || candidate === 'm') {
    return { value: 'M', displayValue: 'Male' };
  }
  if (candidate === 'female' || candidate === 'f') {
    return { value: 'F', displayValue: 'Female' };
  }
  return { value: '', displayValue: '' };
}

function normalizeIdType(rawValue) {
  const candidate = sanitizeTextValue(rawValue).toLowerCase();
  return CANONICAL_ID_TYPES[candidate] || '';
}

function hasFieldLabelNoise(value) {
  return /\b(name|profession|employee number|nationality|date of birth|identity number|id type|email address|mobile number|contract id)\b/i.test(
    String(value || '')
  );
}

function isValidName(value) {
  return (
    Boolean(value) &&
    value.length <= 80 &&
    value.split(' ').filter(Boolean).length >= 2 &&
    !/\d/.test(value) &&
    !DATE_REGEX.test(value) &&
    !hasFieldLabelNoise(value)
  );
}

function isValidProfession(value) {
  return (
    Boolean(value) &&
    value.length <= 80 &&
    !/\d{3,}/.test(value) &&
    !ARABIC_CHAR_REGEX.test(value) &&
    !hasFieldLabelNoise(value)
  );
}

function isValidEmployeeNumber(value) {
  return /^\d{1,10}$/.test(String(value || ''));
}

function isValidContractNumber(value) {
  return /^\d{6,20}$/.test(String(value || ''));
}

function isValidNationality(value) {
  return (
    Boolean(value) &&
    value.length <= 40 &&
    !/\d/.test(value) &&
    !hasFieldLabelNoise(value)
  );
}

function isValidIdentityNumber(value) {
  return /^\d{6,20}$/.test(String(value || ''));
}

function isValidDateValue(value) {
  return Boolean(parseDateToISO(value));
}

function isValidEmail(value) {
  return EMAIL_REGEX.test(String(value || ''));
}

function isValidPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

function isValidAmount(value) {
  return value !== '' && Number.isFinite(Number(value));
}

function isValidIban(value) {
  return /^[A-Z]{2}[A-Z0-9]{13,32}$/.test(String(value || ''));
}

function isValidFreeText(value) {
  return Boolean(value) && value.length <= 120 && !hasFieldLabelNoise(value);
}

function buildFieldResult({
  field,
  rawValue = '',
  value = '',
  displayValue = '',
  source = '',
  confidence = 0,
  warning = '',
}) {
  return {
    field,
    label: FIELD_LABELS[field] || field,
    rawValue,
    value,
    displayValue: displayValue || value,
    source,
    confidence,
    needsReview: Boolean(warning || !value),
    warning,
  };
}

function createSectionText(lines) {
  return normalizeSearchText((lines || []).join(' '));
}

function findSection(lines, startPattern, endPattern) {
  const startIndex = lines.findIndex((line) => startPattern.test(line));
  if (startIndex === -1) {
    return [];
  }

  const endIndex = lines.findIndex((line, index) => index > startIndex && endPattern.test(line));
  return lines.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

function findLineByLabel(lines, label) {
  const pattern = new RegExp(`^${escapeRegExp(label)}\\s*:\\s*(.+)$`, 'i');
  for (const rawLine of lines || []) {
    const line = normalizeSearchText(rawLine);
    const match = line.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return '';
}

function extractLabeledField(lines, field, label, sanitize, validate, options = {}) {
  const rawValue = findLineByLabel(lines, label);
  const sanitized = sanitize(rawValue);
  const value = options.transform ? options.transform(sanitized) : sanitized;
  const displayValue = options.displayTransform ? options.displayTransform(sanitized, rawValue) : sanitized;

  if (!rawValue) {
    return buildFieldResult({
      field,
      source: `label:${label}`,
      warning: `${field} needs review.`,
    });
  }

  if (!value || !validate(value)) {
    return buildFieldResult({
      field,
      rawValue,
      displayValue,
      source: `label:${label}`,
      warning: `${field} needs review.`,
    });
  }

  return buildFieldResult({
    field,
    rawValue,
    value,
    displayValue,
    source: `label:${label}`,
    confidence: 0.98,
  });
}

function extractContractNumber(fullText) {
  const rawValue = normalizeSearchText(fullText).match(/\bcontract id:\s*([0-9]{6,20})\b/i)?.[1] || '';
  const value = sanitizeNumberValue(rawValue);
  if (!value || !isValidContractNumber(value)) {
    return buildFieldResult({
      field: 'ContractNumber',
      rawValue,
      source: 'contract-meta',
      warning: 'ContractNumber needs review.',
    });
  }

  return buildFieldResult({
    field: 'ContractNumber',
    rawValue,
    value,
    source: 'contract-meta',
    confidence: 0.99,
  });
}

function extractDurationFields(fullText) {
  const normalized = normalizeSearchText(fullText);
  const detailedMatch = normalized.match(
    /the contract(?:'s)? duration is\s+([0-9.]+)\s+year(?:s)?\s*,?\s*starting from\s+(\d{2}-\d{2}-\d{4})\s+and ends in\s+(\d{2}-\d{2}-\d{4}).{0,220}?joining date(?:\)\s*of the second party(?:'s)? work)?\s+is\s+(\d{2}-\d{2}-\d{4})/i
  );

  if (detailedMatch) {
    return {
      ContractDurationYears: detailedMatch[1] || '',
      StartDate: detailedMatch[2] || '',
      EndDate: detailedMatch[3] || '',
      JoiningDate: detailedMatch[4] || '',
    };
  }

  const duration = normalized.match(/the contract(?:'s)? duration is\s+([0-9.]+)/i)?.[1] || '';
  const startDate = normalized.match(/starting from\s+(\d{2}-\d{2}-\d{4})/i)?.[1] || '';
  const endDate = normalized.match(/ends in\s+(\d{2}-\d{2}-\d{4})/i)?.[1] || '';
  const joiningDate =
    normalized.match(/joining date(?:\)\s*of the second party(?:'s)? work)?\s+is\s+(\d{2}-\d{2}-\d{4})/i)?.[1] || '';

  return {
    ContractDurationYears: duration,
    StartDate: startDate,
    EndDate: endDate,
    JoiningDate: joiningDate,
  };
}

function extractAllowanceField(fullText, field, pattern) {
  const rawValue = normalizeSearchText(fullText).match(pattern)?.[1] || '';
  const value = sanitizeAmountValue(rawValue);
  if (!value || !isValidAmount(value)) {
    return buildFieldResult({
      field,
      rawValue,
      source: 'allowance-clause',
      warning: `${field} needs review.`,
    });
  }

  return buildFieldResult({
    field,
    rawValue,
    value,
    source: 'allowance-clause',
    confidence: 0.95,
  });
}

function extractBooleanProvision(fullText, pattern) {
  return pattern.test(normalizeSearchText(fullText)) ? 'true' : '';
}

function groupTextItemsToLines(items) {
  const textItems = (items || [])
    .map((item) => ({
      str: String(item.str || ''),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0),
      width: Number(item.width || 0),
    }))
    .filter((item) => item.str.trim());

  textItems.sort((left, right) => {
    const yDiff = right.y - left.y;
    if (Math.abs(yDiff) > 2) {
      return yDiff;
    }
    return left.x - right.x;
  });

  const grouped = [];

  textItems.forEach((item) => {
    const existing = grouped.find((line) => Math.abs(line.y - item.y) <= 2);
    if (existing) {
      existing.items.push(item);
      existing.y = (existing.y + item.y) / 2;
      return;
    }

    grouped.push({
      y: item.y,
      items: [item],
    });
  });

  return grouped
    .sort((left, right) => right.y - left.y)
    .map((line) => {
      const orderedItems = line.items.sort((left, right) => left.x - right.x);
      let text = '';

      orderedItems.forEach((item, index) => {
        const previous = orderedItems[index - 1];
        if (previous) {
          const gap = item.x - (previous.x + previous.width);
          if (gap > 1.5 && !text.endsWith(' ')) {
            text += ' ';
          }
        }
        text += item.str;
      });

      return normalizeWhitespace(text);
    })
    .filter((line) => !isNoiseLine(line));
}

async function extractPdfText(file) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/legacy/build/pdf.worker.mjs',
      import.meta.url
    ).toString();
  }

  const buffer = await file.arrayBuffer();
  const documentTask = pdfjsLib.getDocument({
    data: buffer,
  });
  const document = await documentTask.promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const lines = groupTextItemsToLines(textContent.items);
    pages.push({
      pageNumber,
      lines,
      text: lines.join('\n'),
    });
  }

  return {
    pageCount: document.numPages,
    pages,
    lines: pages.flatMap((page) => page.lines),
    text: pages.map((page) => page.text).join('\n'),
  };
}

function extractFieldDiagnostics(analysis) {
  const lines = (analysis.lines || []).map((line) => normalizeSearchText(line)).filter(Boolean);
  const fullText = createSectionText(lines);
  const firstPartyLines = findSection(lines, /^first party:/i, /^second party:/i);
  const secondPartyLines = findSection(lines, /^second party:/i, /^the two parties have agreed/i);
  const durationFields = extractDurationFields(fullText);

  const diagnostics = {
    ContractNumber: extractContractNumber(fullText),
    WorkLocation: extractLabeledField(
      firstPartyLines,
      'WorkLocation',
      'Work Location',
      sanitizeTextValue,
      isValidFreeText
    ),
    Name: extractLabeledField(
      secondPartyLines,
      'Name',
      'Name',
      sanitizeNameValue,
      isValidName
    ),
    Profession: extractLabeledField(
      secondPartyLines,
      'Profession',
      'Profession',
      sanitizeTextValue,
      isValidProfession
    ),
    EmployeeNumber: extractLabeledField(
      secondPartyLines,
      'EmployeeNumber',
      'Employee Number',
      sanitizeNumberValue,
      isValidEmployeeNumber
    ),
    Nationality: extractLabeledField(
      secondPartyLines,
      'Nationality',
      'Nationality',
      sanitizeTextValue,
      isValidNationality,
      {
        transform: (value) => normalizeNationality(value),
      }
    ),
    DateOfBirth: extractLabeledField(
      secondPartyLines,
      'DateOfBirth',
      'Date of Birth',
      sanitizeDateValue,
      isValidDateValue,
      {
        transform: (value) => parseDateToISO(value),
      }
    ),
    IdentityNumber: extractLabeledField(
      secondPartyLines,
      'IdentityNumber',
      'Identity Number',
      sanitizeNumberValue,
      isValidIdentityNumber
    ),
    IDType: (() => {
      const rawValue = findLineByLabel(secondPartyLines, 'ID Type');
      const value = normalizeIdType(rawValue);
      if (!rawValue || !value) {
        return buildFieldResult({
          field: 'IDType',
          rawValue,
          source: 'label:ID Type',
          warning: 'IDType needs review.',
        });
      }

      return buildFieldResult({
        field: 'IDType',
        rawValue,
        value,
        source: 'label:ID Type',
        confidence: 0.98,
      });
    })(),
    IDExpiryDate: extractLabeledField(
      secondPartyLines,
      'IDExpiryDate',
      'ID Expiry Date',
      sanitizeDateValue,
      isValidDateValue,
      {
        transform: (value) => parseDateToISO(value),
      }
    ),
    Gender: (() => {
      const rawValue = findLineByLabel(secondPartyLines, 'Gender');
      const normalized = normalizeGender(rawValue);
      if (!rawValue || !normalized.value) {
        return buildFieldResult({
          field: 'Gender',
          rawValue,
          source: 'label:Gender',
          warning: 'Gender needs review.',
        });
      }

      return buildFieldResult({
        field: 'Gender',
        rawValue,
        value: normalized.value,
        displayValue: normalized.displayValue,
        source: 'label:Gender',
        confidence: 0.98,
      });
    })(),
    Religion: extractLabeledField(
      secondPartyLines,
      'Religion',
      'Religion',
      sanitizeTextValue,
      isValidFreeText
    ),
    MaritalStatus: extractLabeledField(
      secondPartyLines,
      'MaritalStatus',
      'Marital Status',
      sanitizeTextValue,
      isValidFreeText
    ),
    Education: extractLabeledField(
      secondPartyLines,
      'Education',
      'Education',
      sanitizeTextValue,
      isValidFreeText
    ),
    Speciality: extractLabeledField(
      secondPartyLines,
      'Speciality',
      'Speciality',
      sanitizeTextValue,
      isValidFreeText
    ),
    IBAN: extractLabeledField(secondPartyLines, 'IBAN', 'Iban', sanitizeIbanValue, isValidIban),
    BankName: extractLabeledField(
      secondPartyLines,
      'BankName',
      'Bank Name',
      sanitizeTextValue,
      isValidFreeText
    ),
    Email: extractLabeledField(
      secondPartyLines,
      'Email',
      'Email Address',
      sanitizeEmailValue,
      isValidEmail
    ),
    MobileNumber: extractLabeledField(
      secondPartyLines,
      'MobileNumber',
      'Mobile Number',
      sanitizePhoneValue,
      isValidPhone
    ),
    ContractDurationYears: (() => {
      const rawValue = durationFields.ContractDurationYears || '';
      const value = String(rawValue || '').trim();
      if (!value || !/^\d+(?:\.\d+)?$/.test(value)) {
        return buildFieldResult({
          field: 'ContractDurationYears',
          rawValue,
          source: 'duration-clause',
          warning: 'ContractDurationYears needs review.',
        });
      }

      return buildFieldResult({
        field: 'ContractDurationYears',
        rawValue,
        value,
        source: 'duration-clause',
        confidence: 0.95,
      });
    })(),
    StartDate: (() => {
      const rawValue = durationFields.StartDate || '';
      const value = parseDateToISO(rawValue);
      if (!value) {
        return buildFieldResult({
          field: 'StartDate',
          rawValue,
          source: 'duration-clause',
          warning: 'StartDate needs review.',
        });
      }

      return buildFieldResult({
        field: 'StartDate',
        rawValue,
        value,
        displayValue: rawValue,
        source: 'duration-clause',
        confidence: 0.95,
      });
    })(),
    EndDate: (() => {
      const rawValue = durationFields.EndDate || '';
      const value = parseDateToISO(rawValue);
      if (!value) {
        return buildFieldResult({
          field: 'EndDate',
          rawValue,
          source: 'duration-clause',
          warning: 'EndDate needs review.',
        });
      }

      return buildFieldResult({
        field: 'EndDate',
        rawValue,
        value,
        displayValue: rawValue,
        source: 'duration-clause',
        confidence: 0.95,
      });
    })(),
    JoiningDate: (() => {
      const rawValue = durationFields.JoiningDate || '';
      const value = parseDateToISO(rawValue);
      if (!value) {
        return buildFieldResult({
          field: 'JoiningDate',
          rawValue,
          source: 'duration-clause',
          warning: 'JoiningDate needs review.',
        });
      }

      return buildFieldResult({
        field: 'JoiningDate',
        rawValue,
        value,
        displayValue: rawValue,
        source: 'duration-clause',
        confidence: 0.95,
      });
    })(),
    BasicSalary: extractAllowanceField(
      fullText,
      'BasicSalary',
      /\bbasic fee of\s+([0-9,]+\.\d{2})\s+saudi\b/i
    ),
    OTAllowance: extractAllowanceField(
      fullText,
      'OTAllowance',
      /\bpay\s+([0-9,]+\.\d{2})\s+saudi riyals,\s+a\s+ot allowance\b/i
    ),
    FoodAllowance: extractAllowanceField(
      fullText,
      'FoodAllowance',
      /\bpay\s+([0-9,]+\.\d{2})\s+saudi riyals,\s+a\s+food allowance\b/i
    ),
  };

  return {
    diagnostics,
    derivedValues: {
      HousingProvided: extractBooleanProvision(
        fullText,
        /\bprovide adequate housing throughout the contract period\b/i
      ),
      TransportProvided: extractBooleanProvision(
        fullText,
        /\bprovide an appropriate means of transportation\b/i
      ),
    },
  };
}

function determineStatus(extractedData, warnings) {
  const extractedKeys = Object.entries(extractedData).filter(([, value]) => String(value || '').trim());
  const requiredCoreCount = ['Name', 'EmployeeNumber', 'ContractNumber', 'StartDate', 'EndDate'].filter(
    (field) => String(extractedData[field] || '').trim()
  ).length;

  if (requiredCoreCount >= 4 && warnings.length === 0) {
    return IMPORT_STATUSES.READY;
  }

  if (extractedKeys.length > 0) {
    return IMPORT_STATUSES.NEEDS_REVIEW;
  }

  return IMPORT_STATUSES.DRAFT_EXTRACTED;
}

export async function extractEmployeeFieldsFromPdf(file) {
  const analysis = await extractPdfText(file);
  const fullText = String(analysis.text || '').trim();

  if (!fullText || fullText.replace(/\s+/g, '').length < 20) {
    return {
      status: IMPORT_STATUSES.UNSUPPORTED_SCAN_PDF,
      warnings: ['Unsupported Scan PDF: no extractable text was detected.'],
      extractedData: {
        SourceFile: file.name,
      },
      fieldDiagnostics: {},
      analysis: {
        ...analysis,
        isTextBased: false,
      },
    };
  }

  const { diagnostics, derivedValues } = extractFieldDiagnostics(analysis);

  const extractedData = {
    SourceFile: file.name,
    WorkLocation: diagnostics.WorkLocation.value,
    ContractNumber: diagnostics.ContractNumber.value,
    Name: diagnostics.Name.value,
    Profession: diagnostics.Profession.value,
    EmployeeNumber: diagnostics.EmployeeNumber.value,
    Nationality: diagnostics.Nationality.value,
    DateOfBirth: diagnostics.DateOfBirth.value,
    IdentityNumber: diagnostics.IdentityNumber.value,
    IDType: diagnostics.IDType.value,
    IDExpiryDate: diagnostics.IDExpiryDate.value,
    Gender: diagnostics.Gender.value,
    Religion: diagnostics.Religion.value,
    MaritalStatus: diagnostics.MaritalStatus.value,
    Education: diagnostics.Education.value,
    Speciality: diagnostics.Speciality.value,
    IBAN: diagnostics.IBAN.value,
    BankName: diagnostics.BankName.value,
    Email: diagnostics.Email.value,
    MobileNumber: diagnostics.MobileNumber.value,
    ContractDurationYears: diagnostics.ContractDurationYears.value,
    StartDate: diagnostics.StartDate.value,
    EndDate: diagnostics.EndDate.value,
    JoiningDate: diagnostics.JoiningDate.value,
    BasicSalary: diagnostics.BasicSalary.value,
    OTAllowance: diagnostics.OTAllowance.value,
    FoodAllowance: diagnostics.FoodAllowance.value,
    HousingProvided: derivedValues.HousingProvided,
    TransportProvided: derivedValues.TransportProvided,
  };

  const warnings = Object.values(diagnostics)
    .filter((result) => result.warning)
    .filter((result) =>
      [
        'ContractNumber',
        'Name',
        'Profession',
        'EmployeeNumber',
        'Nationality',
        'IdentityNumber',
        'IDType',
        'DateOfBirth',
        'IDExpiryDate',
        'StartDate',
        'EndDate',
        'BasicSalary',
      ].includes(result.field) || result.rawValue
    )
    .map((result) => result.warning);

  return {
    status: determineStatus(extractedData, warnings),
    warnings,
    extractedData,
    fieldDiagnostics: diagnostics,
    analysis: {
      ...analysis,
      isTextBased: true,
    },
  };
}
