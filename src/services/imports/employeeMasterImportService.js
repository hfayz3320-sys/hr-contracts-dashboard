// -*- coding: utf-8 -*-
/**
 * employeeMasterImportService.js  (v3 — identity-centric)
 *
 * Reads an Employee Master Excel file (already cleaned via cleanDataset)
 * and produces an import preview against the identity-centric stores:
 *   persons, employeeMasterSnapshots, employeeNumberHistory.
 *
 * Pure computation — NO DB writes. The commit happens in importCommitService.
 *
 * Match key:        IdentityNumber only (validated 10-digit, prefix 1=Saudi / 2=Iqama)
 * Secondary key:    EmployeeNumber — never used to match; tracked as history
 * Name:             never used for matching; display flag only
 *
 * Preview output drives:
 *   - Import Dashboard preview UI
 *   - Review Queue items (for missing/invalid identity rows)
 *   - importCommitService (which executes the writes transactionally)
 */

import {
  IMPORT_PREVIEW_CATEGORIES,
  IMPORT_SOURCE_TYPES,
  validateIdentityNumber,
  normalizeIdentityNumber,
} from '../../utils/identityModel';
import {
  buildHistoryEntryFromEmRow,
  detectEmpNoChange,
} from './employeeNumberHistoryService';

// Snapshot fields that participate in the diff between an existing snapshot
// and an incoming EM row. Keys on the LEFT are snapshot field names; values
// are the corresponding cleaned-row keys (PascalCase from cleanDataset).
const SNAPSHOT_TO_ROW_FIELDS = Object.freeze({
  employeeNumber:        'EmployeeNumber',
  sourceFile:            'SourceFile',
  location:              'Location',
  profession:            'Profession',
  grossSalary:           'GrossCashMonthly',
  healthInsuranceStatus: 'HealthInsuranceStatus',
  contractType:          'ContractType',
  startDate:             'StartDate',
  endDate:               'EndDate',
  joiningDate:           'JoiningDate',
  dateOfBirth:           'DateOfBirth',
});

const COMPARE_FIELDS = Object.keys(SNAPSHOT_TO_ROW_FIELDS);

// ── helpers ──────────────────────────────────────────────────────────────────

function normalizeForCompare(field, value) {
  if (value === null || value === undefined) return '';
  const s = String(value).trim();
  if (!s || s === 'null' || s === 'undefined') return '';
  if (['startDate', 'endDate', 'joiningDate', 'dateOfBirth'].includes(field)) {
    return s.slice(0, 10);
  }
  if (field === 'grossSalary') {
    const n = parseFloat(s.replace(/,/g, ''));
    return Number.isFinite(n) ? String(n) : s;
  }
  return s.toLowerCase();
}

function snapshotFromRow(row, importJobId, importDate) {
  const out = { identityNumber: row.IdentityNumber };
  for (const [snapKey, rowKey] of Object.entries(SNAPSHOT_TO_ROW_FIELDS)) {
    const v = row[rowKey];
    out[snapKey] = (v === undefined || v === '') ? null : v;
  }
  out.importJobId = importJobId;
  out.importDate  = importDate;
  return out;
}

function diffSnapshot(existing, incomingSnap) {
  const changes = [];
  for (const f of COMPARE_FIELDS) {
    const oldV = existing?.[f];
    const newV = incomingSnap?.[f];
    if (newV === null || newV === undefined || String(newV).trim() === '') continue; // never blank-out
    if (normalizeForCompare(f, oldV) !== normalizeForCompare(f, newV)) {
      changes.push({ field: f, oldValue: oldV ?? null, newValue: newV });
    }
  }
  return changes;
}

function indexBy(list, keyFn) {
  const m = new Map();
  for (const item of list || []) {
    const k = keyFn(item);
    if (!k) continue;
    const arr = m.get(k) || [];
    arr.push(item);
    m.set(k, arr);
  }
  return m;
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * buildEmployeeMasterImportPreview({
 *   cleanedRows,          // output of cleanDataset(rawRows).cleanedRows
 *   existingPersons,      // personRepository.listAll()
 *   existingSnapshots,    // employeeMasterSnapshotRepository.listAll()
 *   existingHistory,      // employeeNumberHistoryRepository.listAll()
 *   sourceFile,
 *   importJobId,          // optional — generated if absent
 *   importedBy,           // optional metadata
 * })
 *
 * Returns an EmployeeMasterImportPreview object — no DB writes.
 */
export function buildEmployeeMasterImportPreview({
  cleanedRows,
  existingPersons   = [],
  existingSnapshots = [],
  existingHistory   = [],
  sourceFile        = '',
  importJobId       = null,
  importedBy        = null,
}) {
  const jobId      = importJobId || (typeof crypto !== 'undefined' ? crypto.randomUUID() : `job-${Date.now()}`);
  const importDate = new Date().toISOString();

  const personsById   = indexBy(existingPersons,   (p) => p.identityNumber);
  const snapshotsById = indexBy(existingSnapshots, (s) => s.identityNumber);
  const historyByPerson = new Map();
  for (const h of existingHistory) {
    const list = historyByPerson.get(h.identityNumber) || [];
    list.push(h);
    historyByPerson.set(h.identityNumber, list);
  }

  const out = {
    importJobId:           jobId,
    sourceType:            IMPORT_SOURCE_TYPES.EMPLOYEE_MASTER_EXCEL,
    sourceFile,
    importedBy,
    generatedAt:           importDate,
    summary: {
      total: 0, new: 0, updated: 0, unchanged: 0,
      empNoHistoryCandidates: 0, needsReview: 0,
      invalidIdentity: 0, missingIdentity: 0,
    },
    newPersons:             [],
    updatedSnapshots:       [],
    unchangedSnapshots:     [],
    empNoHistoryCandidates: [],
    needsReview:            [],
    invalidIdentity:        [],
    missingIdentity:        [],
    auditEntries:           [],   // populated for updates only; insert-side audit is built on commit
  };

  // Per-file duplicate detection for IdentityNumber within the incoming Excel
  const idCountInFile = new Map();
  for (const row of cleanedRows || []) {
    const id = normalizeIdentityNumber(row.IdentityNumber);
    if (id) idCountInFile.set(id, (idCountInFile.get(id) || 0) + 1);
  }

  for (const row of cleanedRows || []) {
    out.summary.total += 1;
    const sourceFileForRow = row.SourceFile || sourceFile;

    const id = normalizeIdentityNumber(row.IdentityNumber);
    if (!id) {
      out.missingIdentity.push({ row, reason: 'IdentityNumber blank' });
      out.summary.missingIdentity += 1;
      continue;
    }

    const v = validateIdentityNumber(id);
    if (!v.valid) {
      out.invalidIdentity.push({ row, reason: v.reason || 'invalid format' });
      out.summary.invalidIdentity += 1;
      continue;
    }

    if ((idCountInFile.get(id) || 0) > 1) {
      out.needsReview.push({
        row,
        reason: `IdentityNumber ${id} appears ${idCountInFile.get(id)}× in this file`,
        candidates: [],
      });
      out.summary.needsReview += 1;
      continue;
    }

    // Build the prospective snapshot from this row
    const incomingSnap = snapshotFromRow({ ...row, IdentityNumber: id }, jobId, importDate);
    const existingPerson   = (personsById.get(id) || [])[0]   || null;
    const existingSnapshot = (snapshotsById.get(id) || [])[0] || null;

    if (!existingPerson) {
      // NEW Person + NEW Snapshot
      out.newPersons.push({
        person: {
          identityNumber: id,
          idType:         v.type,
          currentName:    String(row.Name || '').trim(),
          nationality:    String(row.Nationality || '').trim(),
        },
        snapshot:    incomingSnap,
        sourceRow:   row,
      });
      out.summary.new += 1;

      // History entry for the EM EmpNo (if any) — first ever observed for this person
      const histRow = { ...row, IdentityNumber: id };
      const histEntry = buildHistoryEntryFromEmRow({
        row: histRow, importJobId: jobId, importDate,
      });
      if (histEntry) {
        out.empNoHistoryCandidates.push({
          identityNumber: id,
          oldEmpNo:       '',
          newEmpNo:       histEntry.employeeNumber,
          entry:          histEntry,
          note:           '',
          firstSeen:      true,
        });
        out.summary.empNoHistoryCandidates += 1;
      }
      continue;
    }

    // Person exists → compute diff and potential EmpNo change
    const diff       = diffSnapshot(existingSnapshot, incomingSnap);
    const empNoChange = detectEmpNoChange(existingSnapshot, row);

    if (diff.length === 0 && !empNoChange.changed) {
      out.unchangedSnapshots.push({ existing: existingSnapshot, incomingSnap });
      out.summary.unchanged += 1;
      continue;
    }

    if (diff.length > 0) {
      out.updatedSnapshots.push({
        identityNumber: id,
        existing:       existingSnapshot,
        incomingSnap,
        diff,
      });
      out.summary.updated += 1;

      // Pre-stage audit entries for the field-level changes
      for (const change of diff) {
        out.auditEntries.push({
          action:         'update',
          entityType:     'EmployeeMasterSnapshot',
          entityId:       id,
          identityNumber: id,
          field:          change.field,
          oldValue:       change.oldValue,
          newValue:       change.newValue,
          sourceFile:     sourceFileForRow,
          sourceType:     IMPORT_SOURCE_TYPES.EMPLOYEE_MASTER_EXCEL,
          importJobId:    jobId,
          importedBy,
          importTimestamp: importDate,
        });
      }
    }

    if (empNoChange.changed) {
      const histRow = { ...row, IdentityNumber: id };
      const histEntry = buildHistoryEntryFromEmRow({
        row: histRow, importJobId: jobId, importDate,
      });
      if (histEntry) {
        out.empNoHistoryCandidates.push({
          identityNumber: id,
          oldEmpNo:       empNoChange.oldEmpNo,
          newEmpNo:       empNoChange.newEmpNo,
          entry:          histEntry,
          note:           '',   // resolved at commit time once contracts can be cross-checked
          firstSeen:      false,
        });
        out.summary.empNoHistoryCandidates += 1;
      }
    }
  }

  return out;
}
