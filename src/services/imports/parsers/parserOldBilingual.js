// -*- coding: utf-8 -*-
/**
 * parserOldBilingual.js
 *
 * Extracts fields from OLD_QIWA_BILINGUAL contracts.
 * Direct JS port of _contract_lab/extractors/parser_old_bilingual.py.
 *
 * 4–5 page PDFs with Arabic + English text side-by-side per line. Primary
 * extraction uses English labels; the Arabic column provides date fallbacks.
 *
 * Primary key: IdentityNumber.
 */

import { TEMPLATES } from './templateClassifier.js';

export const TEMPLATE = TEMPLATES.OLD_QIWA_BILINGUAL;

const AR_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/u;

const CRITICAL_FIELDS = [
  'ContractNumber', 'IdentityNumber', 'Name', 'Nationality',
  'StartDate', 'EndDate', 'BasicSalary',
];

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Run a regex against text and return the first capture group, trimmed.
 * Default flags: i (ignore case) + s (DOTALL — `.` matches newline).
 */
function findFirst(pattern, text, flags = 'is') {
  const re = new RegExp(pattern, flags);
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function normalizeDate(s) {
  if (!s) return null;
  let str = String(s).trim().replace(/^,/, '').trim().replace(/\//g, '-');
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let y, mo, d;
  if (m) {
    [, y, mo, d] = m;
  } else {
    m = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!m) return null;
    [, d, mo, y] = m;
  }
  // Validate against the actual calendar (e.g. reject 1451-02-29 / Feb 30, etc).
  // Mirrors Python's datetime.strptime which raises ValueError on invalid dates.
  const yearN = parseInt(y, 10);
  const moN   = parseInt(mo, 10);
  const dN    = parseInt(d, 10);
  const dt = new Date(Date.UTC(yearN, moN - 1, dN));
  if (
    dt.getUTCFullYear() !== yearN ||
    dt.getUTCMonth()    !== moN - 1 ||
    dt.getUTCDate()     !== dN
  ) {
    return null;
  }
  return `${y}-${mo}-${d}`;
}

function parseMoney(s) {
  if (!s) return null;
  const cleaned = String(s).replace(/,/g, '').trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Strip Arabic tail and non-Latin noise from English value. */
function cleanEn(s) {
  if (!s) return null;
  let str = String(s).replace(/\s+/g, ' ').trim();
  const m = str.match(AR_RE);
  if (m) str = str.slice(0, m.index).trim();
  str = str.replace(/[^A-Za-z0-9 @.,\-()/\\_+#&']/g, '').trim();
  return str || null;
}

/**
 * Strip a trailing phone-like digit run from a string (e.g. bank-name lines
 * where the bilingual layout pulls in the mobile column on the same line).
 * Matches: optional country prefix (+966 / 966) + optional separator + 8+ digits.
 */
function stripTrailingPhone(s) {
  if (!s) return s;
  return String(s).replace(/\s+\+?\d[\d\s-]{6,}$/, '').trim() || null;
}

/** "JOHN DOE JOHN DOE" → "JOHN DOE". Works for Arabic too (visual-order dups). */
function dedupeTokens(s) {
  if (!s) return null;
  const parts = String(s).replace(/\s+/g, ' ').trim().split(' ');
  if (parts.length >= 4 && parts.length % 2 === 0) {
    const h = parts.length / 2;
    let allMatch = true;
    for (let i = 0; i < h; i += 1) {
      if (parts[i] !== parts[i + h]) { allMatch = false; break; }
    }
    if (allMatch) return parts.slice(0, h).join(' ');
  }
  return parts.join(' ');
}

// Trailing reversed Arabic label pattern (e.g. ":ﻢﺴﻻﺍ" = الاسم:).
// Always at the end of the line after the value(s).
const TRAILING_ARABIC_LABEL = /\s*:[؀-ۿﭐ-﷿ﹰ-﻿ ]+$/;

/**
 * Extract Name from bilingual contract Name field.
 *
 * Bilingual PDFs produce Name lines like:
 *   English name: "JOHN DOE JOHN DOE :ﻢﺴﻻﺍ"
 *   Arabic name:  "[visual-order Arabic] [same again] :ﻢﺴﻻﺍ"
 *
 * The value appears TWICE (English + Arabic columns merged by pdfplumber).
 * dedupeTokens() handles both cases since both copies are identical.
 *
 * Arabic names are stored in visual order — acceptable for display in any
 * RTL-aware context. Never uses filename as fallback.
 */
function extractName(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/\s+/g, ' ').trim();
  s = s.replace(TRAILING_ARABIC_LABEL, '').trim();
  if (!s) return null;
  s = dedupeTokens(s);
  if (!s) return null;
  if (AR_RE.test(s)) return s;     // Arabic — preserve as-is
  return cleanEn(s) || null;        // Pure English — clean
}

/**
 * Fix Saudi mobile numbers from bilingual PDFs.
 *
 * Problem: bilingual line "Mobile Number: 966 0537829054 966 0537829054"
 * gives raw digits = "96605378290549660537829054" (25 digits, duplicated).
 *
 * Fix steps:
 *   1. Strip non-digits.
 *   2. Detect exact repeat of a valid-length prefix and deduplicate.
 *   3. If 13 digits starting with 9660, collapse the redundant leading zero.
 *   4. Trim to max 12 digits (E.164 Saudi).
 */
export function normalizeMobile(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (!d) return null;

  // Deduplicate: find smallest prefix of length 9-13 that repeats
  for (let n = 9; n <= Math.floor(d.length / 2); n += 1) {
    const candidate = d.slice(0, n);
    if (d === candidate + candidate || d.startsWith(candidate + candidate)) {
      d = candidate;
      break;
    }
  }

  // Fix: 966 + leading-zero + 9-digit = 13 chars (e.g. 9660537829054)
  if (d.length === 13 && d.startsWith('9660')) {
    d = '966' + d.slice(4);
  }

  if (d.length > 12) d = d.slice(-12);
  return d || null;
}

/**
 * End date in bilingual PDFs appears in two forms:
 *   A) Arabic column on same line: "and ends [Arabic] 2027-07-06 [Arabic]"
 *   B) English next line:          "ends\n...\nin 06-07-2027,"
 * Try A first (more reliable), then B.
 */
function findEndDate(text) {
  // A: YYYY-MM-DD in Arabic column on "and ends" line
  let m = text.match(/and ends[^\n]*?(20\d{2}-\d{2}-\d{2})/i);
  if (m) return normalizeDate(m[1]);

  // B: "ends in DD-MM-YYYY" on same or next line
  m = text.match(/ends[^\n]*?\n[^\n]*?(\d{2}-\d{2}-\d{4})/i);
  if (m) return normalizeDate(m[1]);

  m = text.match(/ends in[^\n]*?(\d{2}-\d{2}-\d{4})/i);
  if (m) return normalizeDate(m[1]);

  return null;
}

// ── main parser ──────────────────────────────────────────────────────────────

export function parse(pages, sourceFile) {
  const text = (pages || []).map((p) => String(p || '')).join('\n');

  const contractNo =
    findFirst('Contract ID:\\s*(\\d{5,})', text) ||
    findFirst('Contract number:\\s*(\\d{5,})', text);

  // Second-party block (bounded by SECOND PARTY: … hereinafter referred)
  const sp = findFirst('SECOND PARTY:\\s*(.*?)\\s*hereinafter referred', text) || '';

  const name        = extractName(findFirst('Name:\\s*([^\\n\\r]+)', sp));
  const profession  = cleanEn(findFirst('Profession:\\s*([^\\n\\r]+)', sp));
  const empNo       = cleanEn(findFirst('Employee Number:\\s*([0-9]+)', sp));
  const nationality = cleanEn(findFirst('Nationality:\\s*([^\\n\\r]+)', sp));
  const dob = normalizeDate(
    findFirst('Date of Birth:\\s*([0-9]{2}-[0-9]{2}-[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})', sp)
  );
  const identity = cleanEn(findFirst('Identity Number:\\s*([0-9]+)', sp));
  const idType   = cleanEn(findFirst('ID Type:\\s*([^\\n\\r]+)', sp));
  const idExpiry = normalizeDate(
    findFirst('ID Expiry Date:\\s*([0-9]{2}-[0-9]{2}-[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})', sp)
  );
  const gender     = cleanEn(findFirst('Gender:\\s*([^\\n\\r]+)', sp));
  const religion   = cleanEn(findFirst('Religion:\\s*([^\\n\\r]+)', sp));
  const marital    = cleanEn(findFirst('Marital Status:\\s*([^\\n\\r]+)', sp));
  const education  = cleanEn(findFirst('Education:\\s*([^\\n\\r]+)', sp));
  const speciality = cleanEn(findFirst('Speciality:\\s*([^\\n\\r]+)', sp));
  const iban       = cleanEn(findFirst('Iban:\\s*([A-Z]{2}[0-9A-Z]{10,})', sp));
  const bankName   = stripTrailingPhone(cleanEn(findFirst('Bank Name:\\s*([^\\n\\r]+)', sp)));
  const email      = cleanEn(findFirst('Email Address:\\s*([^\\s\\n\\r]+@[^\\s\\n\\r]+)', sp));
  const mobile     = normalizeMobile(findFirst('Mobile Number:\\s*([0-9\\s+\\-]+)', sp));

  // "contract's" may use a smart/typographic apostrophe (U+2019) in PDFs
  const durationY = findFirst('The contract.s duration is\\s*([0-9]+)\\s*year', text);

  // StartDate: two sentence variants:
  //   Fixed-term:   "The contract's duration is N year(s), starting from DD-MM-YYYY"
  //   Open-ended:   "The term of this contract starts from DD-MM-YYYY"
  const startDate = normalizeDate(
    findFirst('starting from\\s*([0-9]{2}-[0-9]{2}-[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})', text)
    || findFirst('starts from\\s*([0-9]{2}-[0-9]{2}-[0-9]{4})', text)
    || findFirst('starts from[^\\n]*(20[0-9]{2}-[0-9]{2}-[0-9]{2})', text)
  );

  const endDate = findEndDate(text);

  // ContractEndType: detect open-ended vs fixed-term.
  const isFixed = /duration is\s*\d+\s*year/i.test(text) || /ends in/i.test(text);
  const contractEndType = isFixed ? 'FIXED_TERM' : 'OPEN_ENDED';

  // JoiningDate: two formats — standard or split across line break.
  const joining = normalizeDate(
    findFirst('joining date\\).*?is\\s*([0-9]{2}-[0-9]{2}-[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})', text)
    || findFirst('second party.s work is[^\\n]*(20[0-9]{2}-[0-9]{2}-[0-9]{2})', text)
  );

  const wkHours = findFirst('(\\d+)\\s*hours per week', text);
  const wkDays  = findFirst('(\\d+)\\s*days per week', text);

  const basic = parseMoney(findFirst('basic fee of\\s*([\\d,]+(?:\\.\\d+)?)\\s*Saudi', text));

  const allowances = {
    HousingAllowance:        0.0,
    TransportationAllowance: 0.0,
    FoodAllowance:           0.0,
    OTAllowance:             0.0,
    MastersDegreeAllowance:  0.0,
  };
  const allowanceRe = /Pay\s*([\d,]+(?:\.\d+)?)\s*Saudi\s*Riyals,\s*a\s*(.*?)\s*allowance/gis;
  let am;
  while ((am = allowanceRe.exec(text)) !== null) {
    const v = parseMoney(am[1]) || 0;
    const nmLc = String(am[2]).toLowerCase().trim();
    if (nmLc.includes('housing'))                        allowances.HousingAllowance        += v;
    else if (nmLc.includes('transport'))                 allowances.TransportationAllowance += v;
    else if (nmLc.includes('food'))                      allowances.FoodAllowance           += v;
    else if (nmLc.includes('ot') || nmLc.includes('overtime')) allowances.OTAllowance       += v;
    else if (nmLc.includes('master'))                    allowances.MastersDegreeAllowance  += v;
  }

  const housingProvided   = /Provide adequate housing/i.test(text);
  const transportProvided = /Provide an appropriate means of transportation/i.test(text);
  const totalCash =
    allowances.HousingAllowance + allowances.TransportationAllowance +
    allowances.FoodAllowance + allowances.OTAllowance + allowances.MastersDegreeAllowance;

  const row = {
    SourceFile:        sourceFile,
    ContractVersion:   'OLD_QIWA_BILINGUAL',
    // Primary key first
    IdentityNumber:    identity,
    IDType:            idType,
    IDExpiryDate:      idExpiry,
    PassportNumber:    null,
    ContractNumber:    contractNo,
    Name:              name,
    Nationality:       nationality,
    DateOfBirth:       dob,
    Gender:            gender,
    Religion:          religion,
    MaritalStatus:     marital,
    Education:         education,
    Speciality:        speciality,
    Profession:        profession,
    JobTitle:          null,
    EmployeeNumber:    empNo,
    WorkingDaysPerWeek: wkDays,
    WeeklyHours:       wkHours,
    ContractEndType:   contractEndType,
    ContractDurationYears: durationY && /^\d+$/.test(durationY) ? parseInt(durationY, 10) : null,
    StartDate:         startDate,
    EndDate:           endDate,
    JoiningDate:       joining,
    BasicSalary:       basic,
    HousingProvided:   housingProvided,
    TransportProvided: transportProvided,
    ...allowances,
    TotalOtherCashAllowances: null,
    TotalCashAllowances:      totalCash,
    TotalWage:                null,
    GrossCashMonthly:         (basic || 0) + totalCash,
    IBAN:           iban,
    BankName:       bankName,
    Email:          email,
    MobileNumber:   mobile,
    NeedsArabicReview: false,
    MatchedBy: identity ? 'IdentityNumber' : (empNo ? 'EmployeeNumber' : 'NameOnly'),
  };

  // Open-ended contracts legitimately have no EndDate — exclude from check.
  const criticalToCheck = CRITICAL_FIELDS.filter(
    (f) => !(f === 'EndDate' && contractEndType === 'OPEN_ENDED')
  );
  const missing = criticalToCheck.filter((f) => !row[f]);
  if (missing.length === 0 && contractEndType === 'OPEN_ENDED') {
    row.MissingCriticalFields = 'EndDate (OPEN_ENDED — no fixed term)';
  } else {
    row.MissingCriticalFields = missing.join(', ');
  }
  row.ExtractionStatus = missing.length === 0 ? 'COMPLETE' : 'PARTIAL_REVIEW_REQUIRED';
  return row;
}
