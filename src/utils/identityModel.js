// -*- coding: utf-8 -*-
/**
 * identityModel.js
 *
 * Pure constants + helpers for the identity-centric data model (v3).
 * No IO, no DB calls. Safe to import anywhere.
 *
 * Naming rule: IdentityNumber is the only primary key for a Person.
 * EmployeeNumber is a history value; differences must NOT block matches.
 * Name is never used for matching — display flag only.
 */

// ── enums ────────────────────────────────────────────────────────────────────

export const ID_TYPES = Object.freeze({
  SAUDI: 'Saudi',
  IQAMA: 'Iqama',
});

export const PRESENCE = Object.freeze({
  BOTH_SIDES:           'BothSides',
  EMPLOYEE_MASTER_ONLY: 'EmployeeMasterOnly',
  CONTRACT_ONLY:        'ContractOnly',
});

export const EMPNO_HISTORY_NOTES = Object.freeze({
  RENEWAL:           'Possible Renewal',
  REHIRE:            'Possible Rehire',
  CYCLE:             'New Contract Cycle',
  SECONDARY_CHANGED: 'Secondary identifier changed',
});

export const IMPORT_SOURCE_TYPES = Object.freeze({
  EMPLOYEE_MASTER_EXCEL: 'EmployeeMasterExcel',
  CONTRACT_PDF:          'ContractPDF',
});

export const REVIEW_TYPES = Object.freeze({
  MISSING_IDENTITY:    'MissingIdentity',
  INVALID_IDENTITY:    'InvalidIdentity',
  AMBIGUOUS_MATCH:     'AmbiguousMatch',
  SALARY_CONFLICT:     'SalaryConflict',
  DATE_CONFLICT:       'DateConflict',
  OPEN_ENDED_CONFLICT: 'OpenEndedConflict',
  CONTRACT_NO_PERSON:  'ContractNoPerson',
  EM_NO_CONTRACT:      'EmployeeNoContract',
});

export const PRIORITIES = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH:     'HIGH',
  MEDIUM:   'MEDIUM',
  LOW:      'LOW',
  NONE:     'NONE',
});

export const PRIORITY_RANK = Object.freeze({
  CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0,
});

export const IMPORT_PREVIEW_CATEGORIES = Object.freeze({
  NEW:                       'new',
  UPDATED:                   'updated',
  UNCHANGED:                 'unchanged',
  EMPNO_HISTORY_CANDIDATE:   'empNoHistoryCandidate',
  NEEDS_REVIEW:              'needsReview',
  INVALID_IDENTITY:          'invalidIdentity',
  MISSING_IDENTITY:          'missingIdentity',
});

// ── thresholds (single source of truth) ──────────────────────────────────────

export const THRESHOLDS = Object.freeze({
  SALARY_TOLERANCE_SAR: 1,         // diff <= 1 SAR is rounding noise
  SALARY_HIGH_MIN_SAR:  100,       // 100..1000 → HIGH
  SALARY_CRITICAL_SAR:  1000,      // > 1000 → CRITICAL
  DATE_LOW_DAYS:        1,         // 1 day off → LOW (likely Excel artifact)
  DATE_MEDIUM_MAX:      30,        // 2..30 → MEDIUM
  DATE_HIGH_MAX:        365,       // 31..365 → HIGH; >365 → CRITICAL
  EMPNO_RENEWAL_MIN_DAYS: 30,      // start gap 30..364 → renewal
  EMPNO_REHIRE_MIN_DAYS:  365,     // start gap >= 365 → rehire
});

// ── identity helpers (re-exports for convenience) ────────────────────────────
// normalizeIdentityNumber and validateIdentityNumber live in cleaning.js so
// the existing cleanDataset() can use them. We re-export here so that any
// identity-model consumer has a single import surface.
export { normalizeIdentityNumber, validateIdentityNumber } from './cleaning';

// ── value comparison helpers ─────────────────────────────────────────────────

export function normalizeEmpNumber(value) {
  return String(value || '').trim().replace(/\s+/g, '').replace(/^0+/, '').toLowerCase();
}

export function normalizeNameForCompare(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

const ARABIC_RE = /[؀-ۿﭐ-﷿ﹰ-﻿]/;
export function isArabic(s) {
  return ARABIC_RE.test(String(s || ''));
}

export function dateGapDays(d1, d2) {
  if (!d1 || !d2) return null;
  const a = new Date(String(d1).slice(0, 10));
  const b = new Date(String(d2).slice(0, 10));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.abs(Math.round((a - b) / 86400000));
}

// ── history-note classifier (matches v2 audit logic) ─────────────────────────

export function classifyEmpNoHistoryNote({ emStartDate, conStartDate, conEndType }) {
  const gap = dateGapDays(emStartDate, conStartDate);
  if (gap === null) return EMPNO_HISTORY_NOTES.SECONDARY_CHANGED;
  if (gap >= THRESHOLDS.EMPNO_REHIRE_MIN_DAYS)  return EMPNO_HISTORY_NOTES.REHIRE;
  if (gap >= THRESHOLDS.EMPNO_RENEWAL_MIN_DAYS) return EMPNO_HISTORY_NOTES.RENEWAL;
  if (conEndType === 'OPEN_ENDED')              return EMPNO_HISTORY_NOTES.CYCLE;
  return EMPNO_HISTORY_NOTES.SECONDARY_CHANGED;
}

// ── presence classifier ──────────────────────────────────────────────────────

export function classifyPresence({ hasMaster, hasContract }) {
  if (hasMaster && hasContract) return PRESENCE.BOTH_SIDES;
  if (hasMaster && !hasContract) return PRESENCE.EMPLOYEE_MASTER_ONLY;
  if (!hasMaster && hasContract) return PRESENCE.CONTRACT_ONLY;
  return null;
}

// ── priority helpers ─────────────────────────────────────────────────────────

export function maxPriority(...priorities) {
  return priorities.reduce((acc, p) => {
    const r = PRIORITY_RANK[p] ?? 0;
    return r > (PRIORITY_RANK[acc] ?? 0) ? p : acc;
  }, PRIORITIES.NONE);
}
