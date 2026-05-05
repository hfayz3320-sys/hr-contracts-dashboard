import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import { expectedSchema, nationalityNormalization, schemaAliases, schemaAliasesArabic } from './schema';

dayjs.extend(customParseFormat);

const dateFormats = [
  'YYYY-MM-DD',
  'DD-MM-YYYY',
  'MM-DD-YYYY',
  'YYYY/MM/DD',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'D/M/YYYY',
  'D-M-YYYY',
  'YYYY-M-D',
  'DD MMM YYYY',
  'MMM DD YYYY',
  'YYYY.MM.DD',
];

function normalizeKey(input) {
  return String(input || '')
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function canonicalColumnName(col) {
  const colStr = String(col || '').trim();
  // Arabic headers survive normalizeKey as "" — check raw Arabic lookup first.
  if (schemaAliasesArabic[colStr]) {
    return schemaAliasesArabic[colStr];
  }
  const normalized = normalizeKey(colStr);
  return schemaAliases[normalized] || colStr;
}

function parseExcelDateNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (value < 1000) {
    return null;
  }
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const ms = Math.round(value * 86400000);
  return new Date(epoch.getTime() + ms);
}

export function parseDateToISO(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return dayjs(value).format('YYYY-MM-DD');
  }

  const numericDate = parseExcelDateNumber(value);
  if (numericDate) {
    return dayjs(numericDate).format('YYYY-MM-DD');
  }

  const asString = String(value).trim();
  if (!asString) {
    return '';
  }

  const parsed = dayjs(asString, dateFormats, true);
  if (parsed.isValid()) {
    return parsed.format('YYYY-MM-DD');
  }

  const fallback = dayjs(asString);
  return fallback.isValid() ? fallback.format('YYYY-MM-DD') : '';
}

export function parseBooleanValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'نعم', 'صح'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'لا', 'خطأ'].includes(normalized)) {
    return false;
  }
  return null;
}

export function parseNumberValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[,\s]/g, '')
    .trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeNationality(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  const key = raw.toLowerCase().replace(/\s+/g, '');
  return nationalityNormalization[key] || raw;
}

export function normalizeProfession(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeIdentityNumber(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  // Excel may give us a JS number (2558797532) — convert without scientific notation.
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value).toString() : '';
  }
  // String: strip whitespace and non-digit chars (spaces, dashes, etc.)
  return String(value).trim().replace(/[^0-9]/g, '');
}

export function validateIdentityNumber(value) {
  const id = normalizeIdentityNumber(value);
  if (!id) {
    return { valid: false, type: null, reason: 'missing' };
  }
  if (id.length !== 10) {
    return { valid: false, type: null, reason: `length is ${id.length}, expected 10` };
  }
  if (id.startsWith('1')) {
    return { valid: true, type: 'Saudi', reason: null };
  }
  if (id.startsWith('2')) {
    return { valid: true, type: 'Iqama', reason: null };
  }
  return { valid: false, type: null, reason: `starts with ${id[0]}, expected 1 (Saudi) or 2 (Iqama)` };
}

function normalizePhone(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  const digits = raw.replace(/[^0-9+]/g, '');
  return digits;
}

function normalizeEmail(value) {
  const raw = String(value || '').trim();
  return raw.toLowerCase();
}

function normalizeIban(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) {
    return null;
  }
  const dob = dayjs(dateOfBirth);
  if (!dob.isValid()) {
    return null;
  }
  return dayjs().diff(dob, 'year');
}

function calculateDaysRemaining(endDate) {
  if (!endDate) {
    return null;
  }
  const end = dayjs(endDate);
  if (!end.isValid()) {
    return null;
  }
  return end.startOf('day').diff(dayjs().startOf('day'), 'day');
}

function deriveContractStatus(daysRemaining) {
  if (daysRemaining === null || daysRemaining === undefined) {
    return { status: 'Unknown', riskBand: 'Unknown' };
  }

  if (daysRemaining < 0) {
    return { status: 'Expired', riskBand: 'Expired' };
  }

  if (daysRemaining <= 30) {
    return { status: 'ExpiringSoon', riskBand: '30 Days' };
  }

  if (daysRemaining <= 60) {
    return { status: 'ExpiringSoon', riskBand: '60 Days' };
  }

  if (daysRemaining <= 90) {
    return { status: 'ExpiringSoon', riskBand: '90 Days' };
  }

  return { status: 'Active', riskBand: 'Safe' };
}

function validateEmail(value) {
  if (!value) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateMobile(value) {
  if (!value) {
    return false;
  }
  const digits = value.replace(/[^0-9]/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

function isIbanPlausible(value) {
  if (!value) {
    return false;
  }
  return value.length >= 15 && value.length <= 34;
}

function mapRawRow(rawRow) {
  const mapped = {};
  Object.keys(rawRow || {}).forEach((col) => {
    const canonical = canonicalColumnName(col);
    if (!canonical) {
      return;
    }
    mapped[canonical] = rawRow[col];
  });

  return mapped;
}

function computeMissingCount(row) {
  let missing = 0;
  expectedSchema.forEach((col) => {
    if (row[col] === null || row[col] === undefined || row[col] === '') {
      missing += 1;
    }
  });
  return missing;
}

function createIssue(rowIndex, employeeNumber, code, severity, message, field) {
  return {
    rowIndex,
    employeeNumber: String(employeeNumber || ''),
    code,
    severity,
    field,
    message,
  };
}

export function cleanDataset(rawRows) {
  const cleanedRows = [];
  const issues = [];
  let totalMissingValues = 0;

  (rawRows || []).forEach((raw, index) => {
    const rowIndex = index + 2;
    const mapped = mapRawRow(raw);

    const cleaned = {};
    expectedSchema.forEach((col) => {
      cleaned[col] = mapped[col] ?? '';
    });

    cleaned.Name = String(cleaned.Name || '').trim();
    cleaned.Profession = normalizeProfession(cleaned.Profession);
    cleaned.Nationality = normalizeNationality(cleaned.Nationality);
    cleaned.EmployeeNumber = String(cleaned.EmployeeNumber || '').trim();
    cleaned.IdentityNumber = normalizeIdentityNumber(cleaned.IdentityNumber);
    cleaned.ContractNumber = String(cleaned.ContractNumber || '').trim();
    cleaned.SourceFile = String(cleaned.SourceFile || '').trim();

    cleaned.DateOfBirth = parseDateToISO(cleaned.DateOfBirth);
    cleaned.IDExpiryDate = parseDateToISO(cleaned.IDExpiryDate);
    cleaned.StartDate = parseDateToISO(cleaned.StartDate);
    cleaned.EndDate = parseDateToISO(cleaned.EndDate);
    cleaned.JoiningDate = parseDateToISO(cleaned.JoiningDate);

    cleaned.HousingProvided = parseBooleanValue(cleaned.HousingProvided);
    cleaned.TransportProvided = parseBooleanValue(cleaned.TransportProvided);

    cleaned.BasicSalary = parseNumberValue(cleaned.BasicSalary) ?? 0;
    cleaned.HousingAllowance = parseNumberValue(cleaned.HousingAllowance) ?? 0;
    cleaned.TransportationAllowance = parseNumberValue(cleaned.TransportationAllowance) ?? 0;
    cleaned.FoodAllowance = parseNumberValue(cleaned.FoodAllowance) ?? 0;
    cleaned.OTAllowance = parseNumberValue(cleaned.OTAllowance) ?? 0;
    cleaned.MastersDegreeAllowance = parseNumberValue(cleaned.MastersDegreeAllowance) ?? 0;

    const allowancesSum =
      cleaned.HousingAllowance +
      cleaned.TransportationAllowance +
      cleaned.FoodAllowance +
      cleaned.OTAllowance +
      cleaned.MastersDegreeAllowance;

    const importedAllowances = parseNumberValue(cleaned.TotalCashAllowances);
    cleaned.TotalCashAllowances = importedAllowances ?? allowancesSum;

    const importedGross = parseNumberValue(cleaned.GrossCashMonthly);
    cleaned.GrossCashMonthly = importedGross ?? cleaned.BasicSalary + cleaned.TotalCashAllowances;

    cleaned.IBAN = normalizeIban(cleaned.IBAN);
    cleaned.Email = normalizeEmail(cleaned.Email);
    cleaned.MobileNumber = normalizePhone(cleaned.MobileNumber);

    cleaned.ContractDurationYears = parseNumberValue(cleaned.ContractDurationYears) ?? null;

    cleaned.Age = calculateAge(cleaned.DateOfBirth);
    cleaned.ContractDaysRemaining = calculateDaysRemaining(cleaned.EndDate);

    const derivedStatus = deriveContractStatus(cleaned.ContractDaysRemaining);
    cleaned.ContractStatus = derivedStatus.status;
    cleaned.ContractRiskBand = derivedStatus.riskBand;

    const missingCount = computeMissingCount(cleaned);
    cleaned.MissingFieldsCount = missingCount;
    totalMissingValues += missingCount;

    if (cleaned.StartDate && cleaned.EndDate && dayjs(cleaned.EndDate).isBefore(dayjs(cleaned.StartDate), 'day')) {
      issues.push(createIssue(rowIndex, cleaned.EmployeeNumber, 'END_BEFORE_START', 'Critical', 'تاريخ نهاية العقد أقل من تاريخ البداية', 'EndDate'));
    }

    if (!isIbanPlausible(cleaned.IBAN)) {
      issues.push(createIssue(rowIndex, cleaned.EmployeeNumber, 'IBAN_INVALID', 'Warning', 'IBAN مفقود أو طوله غير منطقي', 'IBAN'));
    }

    if (cleaned.Email && !validateEmail(cleaned.Email)) {
      issues.push(createIssue(rowIndex, cleaned.EmployeeNumber, 'EMAIL_INVALID', 'Warning', 'تنسيق البريد الإلكتروني غير صالح', 'Email'));
    }

    if (cleaned.MobileNumber && !validateMobile(cleaned.MobileNumber)) {
      issues.push(createIssue(rowIndex, cleaned.EmployeeNumber, 'MOBILE_INVALID', 'Warning', 'رقم الجوال غير صالح', 'MobileNumber'));
    }

    if (cleaned.IDExpiryDate && dayjs(cleaned.IDExpiryDate).isBefore(dayjs(), 'day')) {
      issues.push(createIssue(rowIndex, cleaned.EmployeeNumber, 'ID_EXPIRED', 'Warning', 'هوية الموظف منتهية', 'IDExpiryDate'));
    }

    if (cleaned.ContractDurationYears !== null && cleaned.StartDate && cleaned.EndDate) {
      const diffYears = dayjs(cleaned.EndDate).diff(dayjs(cleaned.StartDate), 'day') / 365;
      if (Math.abs(diffYears - cleaned.ContractDurationYears) > 0.35) {
        issues.push(createIssue(rowIndex, cleaned.EmployeeNumber, 'DURATION_MISMATCH', 'Warning', 'مدة العقد لا تطابق الفرق بين تاريخ البداية والنهاية', 'ContractDurationYears'));
      }
    }

    if (!cleaned.Name) {
      issues.push(createIssue(rowIndex, cleaned.EmployeeNumber, 'NAME_MISSING', 'Critical', 'اسم الموظف مفقود', 'Name'));
    }

    if (!cleaned.IdentityNumber) {
      issues.push(createIssue(rowIndex, cleaned.EmployeeNumber, 'IDENTITY_MISSING', 'Critical', 'رقم الهوية / الإقامة مفقود', 'IdentityNumber'));
    } else {
      const idCheck = validateIdentityNumber(cleaned.IdentityNumber);
      if (!idCheck.valid) {
        issues.push(createIssue(rowIndex, cleaned.EmployeeNumber, 'IDENTITY_INVALID', 'Critical', `رقم الهوية غير صالح: ${idCheck.reason}`, 'IdentityNumber'));
      }
    }

    cleanedRows.push(cleaned);
  });

  const criticalCount = issues.filter((x) => x.severity === 'Critical').length;
  const warningCount = issues.filter((x) => x.severity === 'Warning').length;

  const issueCountsByCode = issues.reduce((acc, issue) => {
    acc[issue.code] = (acc[issue.code] || 0) + 1;
    return acc;
  }, {});

  const topIssues = Object.entries(issueCountsByCode)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([code, count]) => ({ code, count }));

  return {
    cleanedRows,
    issues,
    summary: {
      rowCount: cleanedRows.length,
      columnCount: expectedSchema.length,
      totalMissingValues,
      criticalCount,
      warningCount,
      topIssues,
    },
  };
}
