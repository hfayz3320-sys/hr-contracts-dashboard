// -*- coding: utf-8 -*-
/**
 * parserNewQiwaUnified.js
 *
 * Extracts fields from NEW_QIWA_UNIFIED contracts (10-page, numbered sections).
 * Direct JS port of _contract_lab/extractors/parser_new_qiwa_unified.py.
 *
 * IMPORTANT: Arabic body text is font-encoding-garbled in pdfjs/pdfplumber.
 * All extraction uses English-only sections.
 *
 * Name: not reliably extractable — NeedsArabicReview always true.
 * Primary key: IdentityNumber (from "ID no.: XXXXXXXXXX").
 * Fallback key: PassportNumber.
 */

import { TEMPLATES } from './templateClassifier.js';

export const TEMPLATE = TEMPLATES.NEW_QIWA_UNIFIED;

const AR_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/u;

const CRITICAL_FIELDS = [
  'ContractNumber', 'IdentityNumber', 'Nationality',
  'StartDate', 'EndDate', 'BasicSalary',
  'HousingAllowance', 'TransportationAllowance', 'TotalWage',
];

// ── helpers ──────────────────────────────────────────────────────────────────

function findFirst(pattern, text, flags = 'is') {
  const re = new RegExp(pattern, flags);
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function normalizeDate(s) {
  if (!s) return null;
  let str = String(s).trim().replace(/\//g, '-');
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function parseMoney(s) {
  if (!s) return null;
  const cleaned = String(s).replace(/,/g, '').trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function cleanEn(s) {
  if (!s) return null;
  let str = String(s).replace(/\s+/g, ' ').trim();
  const m = str.match(AR_RE);
  if (m) str = str.slice(0, m.index).trim();
  str = str.replace(/[^A-Za-z0-9 @.,\-()/\\_+#&']/g, '').trim();
  return str || null;
}

function normalizeMobile(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (!d) return null;
  if (d.length % 2 === 0) {
    const h = d.length / 2;
    if (d.slice(0, h) === d.slice(h)) d = d.slice(0, h);
  }
  if (d.length === 13 && d.startsWith('9660')) d = '966' + d.slice(4);
  if (d.length > 12) d = d.slice(-12);
  return d || null;
}

// ── main parser ──────────────────────────────────────────────────────────────

export function parse(pages, sourceFile) {
  const text = (pages || []).map((p) => String(p || '')).join('\n');

  // Section 1 — contract info
  const contractNo   = findFirst('Contract number:\\s*(\\d{5,})', text);
  const contractType = findFirst('Contract type:\\s*([^\\n\\r]+)', text);
  const startDate    = normalizeDate(findFirst('Commencement date:\\s*([\\d/]+)', text));
  const endDate      = normalizeDate(findFirst('Contract end date:\\s*([\\d/]+)', text));

  // Section 3 — second party
  // IdentityNumber: "ID no.:" appears twice — once for First Party signatory
  // (section 2) and once for the employee (section 3). Take the LAST match.
  const idMatches = [...text.matchAll(/ID no\.:\s*(\d{6,12})/gi)];
  const identityNo = idMatches.length ? idMatches[idMatches.length - 1][1] : null;

  // Passport: only appears in Second Party section
  const passportNo = findFirst('Passport number:\\s*([A-Za-z][A-Za-z0-9]{5,10})', text);

  const idType = cleanEn(findFirst('ID type:\\s*([^\\n\\r]+)', text));

  // Nationality: don't require \n after value — Arabic text follows on same line
  const nationality = cleanEn(findFirst('Nationality:\\s*([A-Za-z]+(?:\\s+[A-Za-z]+)?)', text));

  const gender     = findFirst('Gender:\\s*([A-Za-z]+)', text);
  const marital    = findFirst('Marital status:\\s*([A-Za-z]+)', text);
  const dob        = normalizeDate(findFirst('Birth date:\\s*([\\d/]+)', text));
  const education  = findFirst('Education level:\\s*([^\\n\\r]+)', text);
  const speciality = findFirst('Speciality:\\s*([^\\n\\r]+)', text);
  const mobile     = normalizeMobile(findFirst('Mobile number:\\s*([\\d\\s]+)', text));
  const email      = findFirst('E-mail:\\s*(\\S+@\\S+)', text);

  // Section 4 — job (strip Arabic tails)
  const occupation = cleanEn(findFirst('Occupation:\\s*([^\\n\\r]+)', text));
  const jobTitle   = cleanEn(findFirst('Job title:\\s*([^\\n\\r]+)', text));

  // Section 5 — contract period / probation
  const probationDays = findFirst('probationary period of\\s*(\\d+)\\s*days', text);

  // Section 7 — working hours
  const wkDays  = findFirst('(\\d+)\\s*days per week', text);
  const wkHours = findFirst('(\\d+)\\s*hours per week', text)
    || findFirst('weekly\\s*(\\d+)', text);

  // Section 9 — salary table.
  // In the new unified PDF, some allowance labels are split across lines:
  //   "9.1.1.3 Transportation 1,000.00Monthly"   (amount on THIS line)
  //   "Allowance:"                                (label word on NEXT line)
  // Pattern allows optional "Allowance:" between the field name and the amount.
  const basic       = parseMoney(findFirst('Basic Wage:\\s*([\\d,]+\\.?\\d*)\\s*Monthly', text));
  const housingA    = parseMoney(findFirst('Housing Allowance:\\s*([\\d,]+\\.?\\d*)\\s*Monthly', text));
  const transportA  = parseMoney(findFirst('Transportation\\s+(?:Allowance:\\s*)?([\\d,]+\\.?\\d*)\\s*Monthly', text));
  const otherA      = parseMoney(findFirst('Total Other Cash\\s+(?:Allowances:\\s*)?([\\d,]+\\.?\\d*)\\s*Monthly', text));
  const totalWage   = parseMoney(findFirst('Total Wage:\\s*([\\d,]+\\.?\\d*)\\s*Monthly', text));
  const dueDate     = findFirst('Due Date:\\s*([^\\n\\r]+)', text);

  // Section 10 — banking
  const bankName = cleanEn(findFirst('Bank name:\\s*([^\\n\\r]+)', text));

  // IBAN in new unified PDFs is split across two lines AND duplicated:
  //   Line N:   "IBAN  SA 11 8000 0858 6080 SA 11 8000 0858 6080 :Arabic"
  //   Line N+1: "1477 1260 1477 1260"
  // Strategy: capture first SA block (stops before second SA), then take the
  // first 8 digits from the next line to complete the 22-digit IBAN.
  // Saudi IBAN = SA (2) + 22 digits = 24 chars total.
  let iban = null;
  const ibanMulti = text.match(/IBAN[^\n]*(SA[\d ]+?)(?:\s+SA[^\n]*)\n([\d ]+)/i);
  if (ibanMulti) {
    const part1 = ibanMulti[1].replace(/\s+/g, '');
    const part2 = ibanMulti[2].replace(/\s+/g, '');
    iban = (part1 + part2).slice(0, 24);
  } else {
    const ibanRaw = findFirst('IBAN[^\\n]*(SA[\\d\\s]{10,50})', text);
    iban = ibanRaw ? ibanRaw.replace(/\s+/g, '').slice(0, 24) : null;
  }

  const totalCash = (housingA || 0) + (transportA || 0) + (otherA || 0);
  const gross     = (basic || 0) + totalCash;

  const row = {
    SourceFile:           sourceFile,
    ContractVersion:      'NEW_QIWA_UNIFIED',
    IdentityNumber:       identityNo,
    IDType:               idType,
    IDExpiryDate:         null,
    PassportNumber:       passportNo,
    ContractNumber:       contractNo,
    Name:                 null,             // Arabic garbled — not extractable
    Nationality:          nationality,
    DateOfBirth:          dob,
    Gender:               gender,
    Religion:             null,
    MaritalStatus:        marital,
    Education:            education,
    Speciality:           speciality,
    Profession:           occupation,
    JobTitle:             jobTitle,
    EmployeeNumber:       null,
    WorkingDaysPerWeek:   wkDays,
    WeeklyHours:          wkHours,
    ProbationDays:        probationDays,
    PaymentDueDate:       dueDate,
    ContractType:         contractType,
    ContractDurationYears: null,
    StartDate:            startDate,
    EndDate:              endDate,
    JoiningDate:          startDate,
    BasicSalary:          basic,
    HousingProvided:      false,
    TransportProvided:    false,
    HousingAllowance:     housingA,
    TransportationAllowance: transportA,
    FoodAllowance:        0.0,
    OTAllowance:          0.0,
    MastersDegreeAllowance: 0.0,
    TotalOtherCashAllowances: otherA,
    TotalCashAllowances:  totalCash,
    TotalWage:            totalWage,
    GrossCashMonthly:     gross,
    IBAN:                 iban,
    BankName:             bankName,
    Email:                email,
    MobileNumber:         mobile,
    NeedsArabicReview:    true,   // Name requires manual entry
    MatchedBy: identityNo
      ? 'IdentityNumber'
      : (passportNo ? 'PassportNumber' : 'UNMATCHED'),
  };

  const missing = CRITICAL_FIELDS.filter((f) => !row[f]);
  row.MissingCriticalFields = missing.join(', ');
  row.ExtractionStatus = missing.length === 0 ? 'COMPLETE' : 'PARTIAL_REVIEW_REQUIRED';
  return row;
}
