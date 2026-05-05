// -*- coding: utf-8 -*-
/**
 * employeeNumberHistoryService.js
 *
 * Pure logic for EmployeeNumberHistory candidates.
 * No DB writes — produces history entry objects ready for the commit service.
 *
 * Rule: EmployeeNumber differences are NEVER conflicts when IdentityNumber matches.
 * They are appended to history with a heuristic note.
 */

import {
  EMPNO_HISTORY_NOTES,
  IMPORT_SOURCE_TYPES,
  classifyEmpNoHistoryNote,
  normalizeEmpNumber,
} from '../../utils/identityModel';
import { V3_HISTORY_STATUS } from '../../storage/indexedDb/dbSchema';

/**
 * buildHistoryEntryFromEmRow(row, importJobId)
 *  — for a single Employee Master row that has a non-empty employeeNumber.
 *
 * Used during EM import preview/commit. Note is left empty here; the
 * renewal/rehire/cycle tag is computed only when we know about the contract
 * side, via reconcileHistoryAcrossSources() below.
 */
export function buildHistoryEntryFromEmRow({ row, importJobId, importDate }) {
  if (!row?.IdentityNumber) return null;
  const emp = String(row.EmployeeNumber || '').trim();
  if (!emp) return null;
  return {
    identityNumber: row.IdentityNumber,
    employeeNumber: emp,
    sourceType:     IMPORT_SOURCE_TYPES.EMPLOYEE_MASTER_EXCEL,
    sourceFile:     row.SourceFile || '',
    contractNumber: '',
    firstSeenDate:  row.JoiningDate || row.StartDate || importDate || '',
    lastSeenDate:   row.EndDate || '',
    status:         V3_HISTORY_STATUS.ACTIVE,
    note:           '',
    importJobId,
  };
}

/**
 * deduplicateHistoryEntries(existingEntries, incomingEntries)
 *
 * Returns only the incoming entries whose (identityNumber, employeeNumber) pair
 * is NOT already present in existingEntries. Ensures the history table doesn't
 * duplicate the same EmpNo for the same Person.
 */
export function deduplicateHistoryEntries(existingEntries, incomingEntries) {
  const seen = new Set();
  for (const e of existingEntries || []) {
    if (e?.identityNumber && e?.employeeNumber) {
      seen.add(`${e.identityNumber}::${normalizeEmpNumber(e.employeeNumber)}`);
    }
  }
  const out = [];
  for (const e of incomingEntries || []) {
    if (!e?.identityNumber || !e?.employeeNumber) continue;
    const key = `${e.identityNumber}::${normalizeEmpNumber(e.employeeNumber)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/**
 * reconcileHistoryAcrossSources(person, existingHistory, incomingFromEm, contract?)
 *
 * Given a Person's existing history entries plus an incoming EM entry (and
 * optionally a contract record on the same person), annotate the new entry
 * with the renewal/rehire/cycle note when the EmpNo differs from prior values.
 *
 * Returns the (possibly annotated) entry, or null if it should be discarded
 * because the EmpNo is already in history.
 */
export function reconcileHistoryAcrossSources({
  existingHistory,
  incomingEntry,
  contract,
  emStartDate,
}) {
  if (!incomingEntry) return null;

  const existing = (existingHistory || []).filter(
    (e) => e.identityNumber === incomingEntry.identityNumber
  );
  const existingNumbers = new Set(
    existing.map((e) => normalizeEmpNumber(e.employeeNumber)).filter(Boolean)
  );
  const incomingNorm = normalizeEmpNumber(incomingEntry.employeeNumber);
  if (!incomingNorm) return null;

  // Already on file → not a new history record.
  if (existingNumbers.has(incomingNorm)) return null;

  // First EmpNo ever seen for this person → no note required.
  if (existingNumbers.size === 0 && !contract) {
    return { ...incomingEntry, note: '' };
  }

  // Differences detected → classify.
  const note = classifyEmpNoHistoryNote({
    emStartDate,
    conStartDate: contract?.startDate || '',
    conEndType:   contract?.contractEndType || '',
  });

  return { ...incomingEntry, note };
}

/**
 * detectEmpNoChange(existingSnapshot, incomingRow)
 *
 * Returns { changed, oldEmpNo, newEmpNo } for an upsert preview.
 * Used by the EM import preview to surface EmpNoHistoryCandidate rows.
 */
export function detectEmpNoChange(existingSnapshot, incomingRow) {
  const oldEmp = normalizeEmpNumber(existingSnapshot?.employeeNumber);
  const newEmp = normalizeEmpNumber(incomingRow?.EmployeeNumber);
  if (!newEmp) return { changed: false, oldEmpNo: '', newEmpNo: '' };
  if (!oldEmp) return { changed: false, oldEmpNo: '', newEmpNo: incomingRow.EmployeeNumber };
  if (oldEmp === newEmp) return { changed: false, oldEmpNo: existingSnapshot.employeeNumber, newEmpNo: incomingRow.EmployeeNumber };
  return {
    changed: true,
    oldEmpNo: existingSnapshot.employeeNumber,
    newEmpNo: incomingRow.EmployeeNumber,
  };
}

export const EMPNO_NOTES = EMPNO_HISTORY_NOTES;
