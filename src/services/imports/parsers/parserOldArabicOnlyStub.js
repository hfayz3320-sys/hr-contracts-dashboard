// -*- coding: utf-8 -*-
/**
 * parserOldArabicOnlyStub.js
 *
 * Extracts as many fields as possible from OLD_QIWA_ARABIC_ONLY contracts.
 * These are 3-page PDFs with no English headings on page 1; the rest of
 * the page is visual-order Arabic labels (RTL glyphs reversed by pdfjs).
 *
 * Fields the stub now extracts (all keyed off the visual-order Arabic
 * label that appears AFTER the value on each line):
 *   ContractNumber       ← ":ﺪﻘﻌﻟا ﻢﻗر"
 *   IdentityNumber       ← ":ﺔﻳﻮﻬﻟا ﻢﻗر"   (10-digit, starts with 1 OR 2)
 *   IDType               ← ":ﺔﻳﻮﻬﻟع اﻮﻧ"  (Iqama / National ID)
 *   IDExpiryDate         ← ":ﺎﻬﺘﻧﻹا ﺦﻳرﺎﺗ"
 *   EmployeeNumber       ← ":ﻲﻔﻴﻇﻮﻟا ﻢﻗﺮﻟا"
 *   Name                 ← ":ﻢﺳﻻا"  (best-effort — visual-order Arabic OR Latin)
 *   DateOfBirth          ← ":د:ﻼﻴﻤﻟا ﺦﻳرﺎﺗ"
 *   IBAN                 ← "ن:ﺎﺒﻳﻵا ﻢﻗر"
 *   Email                ← ":ﻲﻧوﺮﺘﻜﻟﻹا ﺪﻳﺮﺒﻟا"
 *   MobileNumber         ← "ال:ﻮﺠﻟا ﻢﻗر"
 *   StartDate / EndDate  ← duration sentence "أﺪﺒﻳ … ﻲﻬﺘﻨﻳو …"
 *   JoiningDate          ← "ﻞﻤﻌﻠﻟ ﻲﻧﺎﺜﻟف اﺮﻄﻟة اﺮﺷﺎﺒﻣ ﺦﻳرﺎﺗ نﺄﺑ"
 *   ContractDurationYears ← "ﺔﻨﺳ X ﺪﻘﻌﻟا اﺬﻫ ةﺪﻣ"
 *
 * Output also carries a ReviewRecord with:
 *   parserType        = 'OLD_QIWA_ARABIC_ONLY'
 *   confidence        = 'high' | 'medium' | 'low'
 *   confidenceScore   = 0..1
 *   missingCritical   = comma list
 *   reviewReason      = human description
 *
 * NeedsArabicReview is still set true because Name is visual-order RTL
 * (presentation-form glyphs) — readable filename basename should be used
 * for display via getPersonDisplayName().
 */

import { TEMPLATES } from './templateClassifier.js';

export const TEMPLATE = TEMPLATES.OLD_QIWA_ARABIC_ONLY;

// ── helpers ──────────────────────────────────────────────────────────────────

function findFirst(pattern, text, flags = '') {
  const re = new RegExp(pattern, flags);
  const m = text.match(re);
  return m ? (m[1] || '').trim() : null;
}

function normalizeIsoDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  // Reject Hijri-shaped dates (year < 1900 likely Hijri).
  const y = parseInt(m[1], 10);
  if (y < 1900) return null;
  // Calendar validity check
  const dt = new Date(Date.UTC(y, parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth()    !== parseInt(m[2], 10) - 1 ||
    dt.getUTCDate()     !== parseInt(m[3], 10)
  ) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function normalizeMobile(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 12 && d.startsWith('966'))      return d;
  if (d.length === 13 && d.startsWith('9660'))     return '966' + d.slice(4);
  if (d.length === 9  && d.startsWith('5'))        return '966' + d;
  if (d.length === 10 && d.startsWith('05'))       return '966' + d.slice(1);
  return d;
}

// ── main parser ──────────────────────────────────────────────────────────────

export function parse(pages, sourceFile) {
  const text = (pages || []).map((p) => String(p || '')).join('\n');

  // ContractNumber — value BEFORE visual-order ":ﺪﻘﻌﻟا ﻢﻗر"
  // CR number ":يرﺎﺠﺘﻟا ﻞﺠﺴﻟا" must NOT match.
  const contractNumber = findFirst('(\\d{6,10})\\s*:ﺪﻘﻌﻟا ﻢﻗر', text);

  // IdentityNumber — 10 digits starting with 1 (Saudi) OR 2 (Iqama).
  let identityNumber = null;
  let idType         = null;
  const idMatch = text.match(/(\d{10})\s*:ﺔﻳﻮﻬﻟا ﻢﻗر/);
  if (idMatch) {
    const v = idMatch[1];
    if (v.startsWith('1') || v.startsWith('2')) {
      identityNumber = v;
      idType = v.startsWith('1') ? 'National ID' : 'Iqama ID';
    }
  }

  // EmployeeNumber — value BEFORE ":ﻲﻔﻴﻇﻮﻟا ﻢﻗﺮﻟا"
  const employeeNumber = findFirst('(\\d{1,8})\\s*:ﻲﻔﻴﻇﻮﻟا ﻢﻗﺮﻟا', text);

  // DateOfBirth — Hijri values like 1420-11-06 also exist; reject those via normalizeIsoDate
  const rawDob = findFirst('(\\d{4}-\\d{2}-\\d{2})\\s*د:ﻼﻴﻤﻟا ﺦﻳرﺎﺗ', text);
  const dateOfBirth = normalizeIsoDate(rawDob);

  // ID expiry date — same Hijri filter
  const rawIdExpiry = findFirst('(\\d{4}-\\d{2}-\\d{2})\\s*ء:ﺎﻬﺘﻧﻹا ﺦﻳرﺎﺗ', text);
  const idExpiryDate = normalizeIsoDate(rawIdExpiry);

  // IBAN — Saudi IBAN, 24 chars (only Second Party has banking)
  const iban = findFirst('(SA[\\d]{22})\\s*ن:ﺎﺒﻳﻵا ﻢﻗر', text)
            || findFirst('(SA[\\d]{22})', text);

  // Email — First Party AND Second Party both have ":ﻲﻧوﺮﺘﻜﻟﻹا ﺪﻳﺮﺒﻟا"
  // labels. Take the LAST match (employee, not company).
  const emailMatches = [...text.matchAll(/(\S+@\S+\.\S+)\s*:ﻲﻧوﺮﺘﻜﻟﻹا ﺪﻳﺮﺒﻟا/g)];
  const email = emailMatches.length
    ? emailMatches[emailMatches.length - 1][1]
    : null;

  // Mobile — only Second Party has ":ال:ﻮﺠﻟا ﻢﻗر" but be safe and take LAST
  // in case future templates add a company mobile too.
  const mobileMatches = [...text.matchAll(/(\d[\d\s]+\d)\s*ال:ﻮﺠﻟا ﻢﻗر/g)];
  const mobileRaw = mobileMatches.length ? mobileMatches[mobileMatches.length - 1][1] : null;
  const mobileNumber = normalizeMobile(mobileRaw);

  // Name — best effort, captures whatever sits before ":ﻢﺳﻻا" on the same line.
  // Pattern looks at the start of a line up to the label suffix.
  const nameMatch = text.match(/^([^\n\r]+?)\s*:ﻢﺳﻻا\s*$/m);
  let name = nameMatch ? nameMatch[1].trim() : null;
  // Reject obvious noise (pure punctuation or single Arabic word match length < 2)
  if (name && name.length < 2) name = null;

  // Duration sentence — two real shapes seen in OLD_QIWA_ARABIC_ONLY:
  //   FIXED-TERM: "...END ﻲﻓ ﻲﻬﺘﻨﻳو START ﺦﻳرﺎﺗ ﻦﻣ أﺪﺒﻳ ﺔﻨﺳ N ﺪﻘﻌﻟا اﺬﻫ ةﺪﻣ"
  //   OPEN-ENDED: ".... ,START ﺦﻳرﺎﺗ ﻦﻣ أﺪﺒﻳ ﺪﻘﻌﻟا اﺬﻫ"
  // (RTL renders inside-out; values appear before the keyword on the line.)
  let endDate = null, startDate = null, contractEndType = 'FIXED_TERM';

  // Try fixed-term first (both dates on same line)
  const fixedMatch = text.match(/(\d{4}-\d{2}-\d{2})\s+ﻲﻓ\s+ﻲﻬﺘﻨﻳو\s+(\d{4}-\d{2}-\d{2})\s+ﺦﻳرﺎﺗ\s+ﻦﻣ\s+أﺪﺒﻳ/);
  if (fixedMatch) {
    endDate   = normalizeIsoDate(fixedMatch[1]);
    startDate = normalizeIsoDate(fixedMatch[2]);
    contractEndType = 'FIXED_TERM';
  } else {
    // Open-ended: "...START ﺦﻳرﺎﺗ ﻦﻣ أﺪﺒﻳ ﺪﻘﻌﻟا اﺬﻫ" with no "ends in" segment
    const openMatch = text.match(/(\d{4}-\d{2}-\d{2})\s+ﺦﻳرﺎﺗ\s+ﻦﻣ\s+أﺪﺒﻳ\s+ﺪﻘﻌﻟا\s+اﺬﻫ/);
    if (openMatch) {
      startDate       = normalizeIsoDate(openMatch[1]);
      endDate         = null;
      contractEndType = 'OPEN_ENDED';
    }
  }

  // Joining date
  const joiningRaw = findFirst('(\\d{4}-\\d{2}-\\d{2})\\s*ﻮﻫ\\s+ﻞﻤﻌﻠﻟ', text);
  const joiningDate = normalizeIsoDate(joiningRaw);

  // Contract duration years
  const durationYears = findFirst('ﺔﻨﺳ\\s+(\\d+)\\s+ﺪﻘﻌﻟا\\s+اﺬﻫ\\s+ةﺪﻣ', text);

  // ── confidence scoring ───────────────────────────────────────────────────
  const fieldsHave = [
    contractNumber, identityNumber, employeeNumber,
    name, dateOfBirth, idType, iban, email, mobileNumber,
    startDate, endDate, joiningDate,
  ].filter(Boolean).length;
  const confidenceScore = +(fieldsHave / 12).toFixed(2);
  const confidence = confidenceScore >= 0.7 ? 'high'
                  : confidenceScore >= 0.4 ? 'medium'
                  : 'low';

  // ── critical fields check (mirrors bilingual parser semantics) ───────────
  const CRITICAL = ['ContractNumber', 'IdentityNumber', 'StartDate', 'EndDate'];
  const row = {
    SourceFile:            sourceFile,
    ContractVersion:       'OLD_QIWA_ARABIC_ONLY',
    IdentityNumber:        identityNumber,
    IDType:                idType,
    IDExpiryDate:          idExpiryDate,
    PassportNumber:        null,
    ContractNumber:        contractNumber,
    Name:                  name,            // visual-order RTL — display layer must resolve via getPersonDisplayName
    Nationality:           null,
    DateOfBirth:           dateOfBirth,
    Gender:                null,
    Religion:              null,
    MaritalStatus:         null,
    Education:             null,
    Speciality:            null,
    Profession:            null,
    JobTitle:              null,
    EmployeeNumber:        employeeNumber,
    WorkingDaysPerWeek:    null,
    WeeklyHours:           null,
    ContractDurationYears: durationYears && /^\d+$/.test(durationYears) ? parseInt(durationYears, 10) : null,
    ContractEndType:       contractEndType,
    StartDate:             startDate,
    EndDate:               endDate,
    JoiningDate:           joiningDate,
    BasicSalary:           null,            // not robustly extractable in visual-order layout yet
    HousingProvided:       null,
    TransportProvided:     null,
    HousingAllowance:      null,
    TransportationAllowance: null,
    FoodAllowance:         null,
    OTAllowance:           null,
    MastersDegreeAllowance: null,
    TotalOtherCashAllowances: null,
    TotalCashAllowances:   null,
    TotalWage:             null,
    GrossCashMonthly:      null,
    IBAN:                  iban,
    BankName:              null,
    Email:                 email,
    MobileNumber:          mobileNumber,
    NeedsArabicReview:     true,
    MatchedBy:             identityNumber ? 'IdentityNumber'
                          : (employeeNumber ? 'EmployeeNumber' : 'MANUAL_REQUIRED'),
  };

  // Open-ended contracts legitimately have no EndDate — exclude from check.
  const criticalToCheck = CRITICAL.filter(
    (f) => !(f === 'EndDate' && row.ContractEndType === 'OPEN_ENDED')
  );
  const missingCritical = criticalToCheck.filter((f) => !row[f]);
  if (missingCritical.length === 0 && row.ContractEndType === 'OPEN_ENDED') {
    row.MissingCriticalFields = 'EndDate (OPEN_ENDED — no fixed term)';
  } else {
    row.MissingCriticalFields = missingCritical.join(', ');
  }
  row.ExtractionStatus = missingCritical.length === 0 ? 'COMPLETE' : 'PARTIAL_REVIEW_REQUIRED';

  // ── ReviewRecord — explicit, structured trace for the review queue ──────
  row.ReviewRecord = {
    parserType:       'OLD_QIWA_ARABIC_ONLY',
    sourceFile,
    contractNumber,
    identityNumber,
    employeeNumber,
    extractedFieldCount: fieldsHave,
    confidence,
    confidenceScore,
    missingCriticalFields: missingCritical,
    reviewReason: missingCritical.length === 0
      ? `OK — ${fieldsHave}/12 fields extracted from visual-order Arabic`
      : `Missing critical fields: ${missingCritical.join(', ')} (${fieldsHave}/12 extracted)`,
  };

  return row;
}
