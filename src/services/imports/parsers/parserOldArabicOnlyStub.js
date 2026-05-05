// -*- coding: utf-8 -*-
/**
 * parserOldArabicOnlyStub.js
 *
 * QUARANTINE mode for OLD_QIWA_ARABIC_ONLY contracts (Saudi nationals).
 * Direct JS port of _contract_lab/extractors/parser_old_arabic_only_stub.py.
 *
 * Full Arabic extraction is deferred. This stub:
 *   - Classifies the record as OLD_QIWA_ARABIC_ONLY
 *   - Extracts ContractNumber (6-10 pure digits before the visual-order
 *     Arabic label "ﺪﻘﻌﻟا ﻢﻗر")
 *   - Extracts IdentityNumber (10 digits starting with 1, before the label
 *     "ﺔﻳﻮﻬﻟا ﻢﻗر")
 *   - Marks NeedsArabicReview = true
 *   - Sets ExtractionStatus = PARTIAL_REVIEW_REQUIRED
 *   - Never uses filename as Name
 *   - Leaves all salary/date/personal fields as null
 */

import { TEMPLATES } from './templateClassifier.js';

export const TEMPLATE = TEMPLATES.OLD_QIWA_ARABIC_ONLY;

export function parse(pages, sourceFile) {
  const text = (pages || []).map((p) => String(p || '')).join('\n');

  // ContractNumber: in Arabic-only contracts, the number appears BEFORE the
  // visual-order Arabic label ":ﺪﻘﻌﻟا ﻢﻗر" (= رقم العقد = Contract Number).
  // The company's CR number ":يرﺎﺠﺘﻟا ﻞﺠﺴﻟا" must not be confused with this.
  let contractNumber = null;
  const cnMatch = text.match(/(\d{6,10})\s*:ﺪﻘﻌﻟا ﻢﻗر/);
  if (cnMatch) contractNumber = cnMatch[1];

  // IdentityNumber: Saudi National ID appears BEFORE visual-order label
  // ":ﺔﻳﻮﻬﻟا ﻢﻗر" (= رقم الهوية = Identity Number). Must be 10 digits starting with 1.
  let identityNumber = null;
  let idType = null;
  const idMatch = text.match(/(\d{10})\s*:ﺔﻳﻮﻬﻟا ﻢﻗر/);
  if (idMatch && idMatch[1].startsWith('1')) {
    identityNumber = idMatch[1];
    idType = 'National ID';
  }

  return {
    SourceFile:            sourceFile,
    ContractVersion:       'OLD_QIWA_ARABIC_ONLY',
    // Primary key
    IdentityNumber:        identityNumber,
    IDType:                idType,
    IDExpiryDate:          null,
    PassportNumber:        null,
    ContractNumber:        contractNumber,
    // All personal/salary fields withheld — Arabic extraction deferred
    Name:                  null,        // DO NOT use filename
    Nationality:           null,
    DateOfBirth:           null,
    Gender:                null,
    Religion:              null,
    MaritalStatus:         null,
    Education:             null,
    Speciality:            null,
    Profession:            null,
    JobTitle:              null,
    EmployeeNumber:        null,
    WorkingDaysPerWeek:    null,
    WeeklyHours:           null,
    ContractDurationYears: null,
    StartDate:             null,
    EndDate:               null,
    JoiningDate:           null,
    BasicSalary:           null,
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
    IBAN:                  null,
    BankName:              null,
    Email:                 null,
    MobileNumber:          null,
    NeedsArabicReview:     true,
    MissingCriticalFields: 'Name, Nationality, StartDate, EndDate, BasicSalary',
    ExtractionStatus:      'PARTIAL_REVIEW_REQUIRED',
    MatchedBy:             identityNumber ? 'IdentityNumber' : 'MANUAL_REQUIRED',
  };
}
