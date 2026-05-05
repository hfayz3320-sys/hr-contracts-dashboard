// -*- coding: utf-8 -*-
/**
 * contractPdfImportService.js
 *
 * Identity-centric preview pipeline for Contract PDF imports (Phase 1).
 * Pure computation — NO DB writes.
 *
 * Inputs:
 *   - extractedContracts: array of contract objects produced by the parser
 *     dispatcher (parsers/index.js → processExtractedPages). Field shape
 *     matches the Python extract_v2 output (PascalCase keys: IdentityNumber,
 *     ContractNumber, EmployeeNumber, BasicSalary, GrossCashMonthly, …).
 *   - existingPersons / existingContractRecords / existingHistory: snapshots
 *     of the v3 stores at the time the preview is computed.
 *
 * Output: ContractImportPreview — ready for commitContractImport().
 *
 * Rules enforced:
 *   - Match key:        IdentityNumber only (10 digits, prefix 1=Saudi or 2=Iqama)
 *   - EmployeeNumber:   never matches; if it differs from prior history → new
 *                       EmployeeNumberHistory entry. NOT a conflict.
 *   - Name:             never used for matching.
 *   - Missing/invalid IdentityNumber → reviewQueue (CRITICAL).
 *   - IdentityNumber matches existing Person → append ContractRecord under
 *     same Person; flag EmpNo history if EmpNo new for this person.
 *   - IdentityNumber unknown to the registry → ContractOnly Person candidate
 *     (created at commit time).
 */

import {
  IMPORT_PREVIEW_CATEGORIES,
  IMPORT_SOURCE_TYPES,
  classifyEmpNoHistoryNote,
  normalizeEmpNumber,
  normalizeIdentityNumber,
  validateIdentityNumber,
} from '../../utils/identityModel';
import { V3_HISTORY_STATUS } from '../../storage/indexedDb/dbSchema';

// ── helpers ──────────────────────────────────────────────────────────────────

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

function buildHistoryEntryFromContract({ contract, identityNumber, importJobId, importDate }) {
  const emp = String(contract.EmployeeNumber || '').trim();
  if (!emp || !identityNumber) return null;
  return {
    identityNumber,
    employeeNumber: emp,
    sourceType:     IMPORT_SOURCE_TYPES.CONTRACT_PDF,
    sourceFile:     contract.SourceFile || '',
    contractNumber: String(contract.ContractNumber || '').trim(),
    firstSeenDate:  contract.StartDate || contract.JoiningDate || importDate || '',
    lastSeenDate:   contract.EndDate || '',
    status:         V3_HISTORY_STATUS.ACTIVE,
    note:           '',
    importJobId,
  };
}

function snapshotContractToRecord(contract, identityNumber, importJobId, importDate) {
  const allowances = {
    HousingAllowance:        contract.HousingAllowance ?? null,
    TransportationAllowance: contract.TransportationAllowance ?? null,
    FoodAllowance:           contract.FoodAllowance ?? null,
    OTAllowance:             contract.OTAllowance ?? null,
    MastersDegreeAllowance:  contract.MastersDegreeAllowance ?? null,
    TotalCashAllowances:     contract.TotalCashAllowances ?? null,
  };
  return {
    // contractRecordRepository will assign id (uuid)
    identityNumber,
    employeeNumber:   String(contract.EmployeeNumber || '').trim() || null,
    contractNumber:   String(contract.ContractNumber || '').trim() || null,
    sourcePdf:        contract.SourceFile || null,
    importJobId,
    contractVersion:  contract.ContractVersion || null,
    extractionStatus: contract.ExtractionStatus || null,
    startDate:        contract.StartDate || null,
    endDate:          contract.EndDate || null,
    joiningDate:      contract.JoiningDate || null,
    contractEndType:  contract.ContractEndType || null,
    basicSalary:      contract.BasicSalary ?? null,
    allowances,
    grossCashMonthly: contract.GrossCashMonthly ?? null,
    rawExtractionJson: contract,   // full extracted payload for traceability
    importDate,
  };
}

function pickContractFieldsForPerson(contract, validation) {
  return {
    identityNumber: contract.IdentityNumber,
    idType:         validation.type,
    currentName:    String(contract.Name || '').trim(),
    nationality:    String(contract.Nationality || '').trim(),
  };
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * buildContractImportPreview({
 *   extractedContracts,
 *   existingPersons,
 *   existingContractRecords,
 *   existingHistory,
 *   sourceFiles,           // optional summary list of original PDF names
 *   importJobId,
 *   importedBy,
 * })
 */
export function buildContractImportPreview({
  extractedContracts,
  existingPersons         = [],
  existingContractRecords = [],
  existingHistory         = [],
  sourceFiles             = [],
  importJobId             = null,
  importedBy              = null,
}) {
  const jobId      = importJobId
    || (typeof crypto !== 'undefined' ? crypto.randomUUID() : `job-${Date.now()}`);
  const importDate = new Date().toISOString();

  const personsById        = indexBy(existingPersons,         (p) => p.identityNumber);
  const contractsByPerson  = indexBy(existingContractRecords, (c) => c.identityNumber);
  const historyByPerson    = indexBy(existingHistory,         (h) => h.identityNumber);

  const out = {
    importJobId:           jobId,
    sourceType:            IMPORT_SOURCE_TYPES.CONTRACT_PDF,
    sourceFiles:           Array.isArray(sourceFiles) ? sourceFiles : [],
    importedBy,
    generatedAt:           importDate,
    summary: {
      total: 0,
      newContractForExistingPerson: 0,
      newContractOnlyPerson:        0,
      duplicateContract:            0,   // same person + same contractNumber already in store
      empNoHistoryCandidates:       0,
      needsReview:                  0,
      invalidIdentity:              0,
      missingIdentity:              0,
      extractionError:              0,
    },
    newContractsForExistingPersons: [],
    newContractOnlyPersons:         [],
    duplicateContracts:             [],
    empNoHistoryCandidates:         [],
    needsReview:                    [],
    invalidIdentity:                [],
    missingIdentity:                [],
    extractionErrors:               [],
    auditEntries:                   [],
  };

  // Per-batch duplicate detection by IdentityNumber (within incoming contracts)
  const idCountInBatch = new Map();
  for (const c of extractedContracts || []) {
    const id = normalizeIdentityNumber(c.IdentityNumber);
    if (id) idCountInBatch.set(id, (idCountInBatch.get(id) || 0) + 1);
  }

  for (const contract of extractedContracts || []) {
    out.summary.total += 1;
    const sourceFile = contract.SourceFile || '';

    // ── Gate 0: extraction errors (parser couldn't handle the PDF) ──────────
    if (
      contract.ExtractionStatus === 'ERROR' ||
      contract.ExtractionStatus === 'FAILED_UNKNOWN_TEMPLATE'
    ) {
      out.extractionErrors.push({
        contract,
        reason: contract.ExtractionStatus === 'ERROR'
          ? `Extraction error: ${contract.Error || 'unknown'}`
          : `Unknown contract template`,
      });
      out.summary.extractionError += 1;
      // These rows will become CRITICAL review-queue items at commit time
      continue;
    }

    // ── Gate 1: missing IdentityNumber ──────────────────────────────────────
    const id = normalizeIdentityNumber(contract.IdentityNumber);
    if (!id) {
      out.missingIdentity.push({
        contract,
        reason: 'IdentityNumber blank or unparseable',
      });
      out.summary.missingIdentity += 1;
      continue;
    }

    // ── Gate 2: invalid IdentityNumber ──────────────────────────────────────
    const v = validateIdentityNumber(id);
    if (!v.valid) {
      out.invalidIdentity.push({
        contract,
        reason: v.reason || 'invalid format',
      });
      out.summary.invalidIdentity += 1;
      continue;
    }

    // ── Gate 3: same IdentityNumber appears multiple times in this batch ───
    if ((idCountInBatch.get(id) || 0) > 1) {
      out.needsReview.push({
        contract,
        reason: `IdentityNumber ${id} appears ${idCountInBatch.get(id)}× in this batch`,
      });
      out.summary.needsReview += 1;
      continue;
    }

    // Build the prospective ContractRecord
    const newRecord = snapshotContractToRecord({ ...contract, IdentityNumber: id }, id, jobId, importDate);

    // ── Gate 4: duplicate contract (same person + same contractNumber + dates) ─
    const existingForPerson = contractsByPerson.get(id) || [];
    const isDup = newRecord.contractNumber && existingForPerson.some((c) =>
      String(c.contractNumber || '').trim() === newRecord.contractNumber &&
      String(c.startDate || '') === String(newRecord.startDate || '') &&
      String(c.endDate   || '') === String(newRecord.endDate   || '')
    );
    if (isDup) {
      out.duplicateContracts.push({
        contract,
        identityNumber: id,
        reason: 'Same Person + ContractNumber + StartDate/EndDate already in store',
      });
      out.summary.duplicateContract += 1;
      continue;
    }

    // ── Gate 5: route to existing person OR create ContractOnly person ─────
    const existingPerson = (personsById.get(id) || [])[0] || null;

    if (existingPerson) {
      out.newContractsForExistingPersons.push({
        identityNumber: id,
        person:         existingPerson,
        contractRecord: newRecord,
        sourceContract: contract,
      });
      out.summary.newContractForExistingPerson += 1;
    } else {
      out.newContractOnlyPersons.push({
        identityNumber: id,
        person:         pickContractFieldsForPerson({ ...contract, IdentityNumber: id }, v),
        contractRecord: newRecord,
        sourceContract: contract,
      });
      out.summary.newContractOnlyPerson += 1;
    }

    // ── EmpNo history candidate: contract EmpNo not yet in person's history ─
    // Treat normalize-empty values (e.g. '0000', '   ') as "no EmpNo" — same
    // semantics as the v2 audit. Otherwise '0000' would be flagged as a new
    // history candidate when the EM side has a real EmpNo like '1538'.
    const empNo   = String(contract.EmployeeNumber || '').trim();
    const empNorm = normalizeEmpNumber(empNo);
    if (empNo && empNorm) {
      const existingHist = historyByPerson.get(id) || [];
      const knownNumbers = new Set(
        existingHist.map((e) => normalizeEmpNumber(e.employeeNumber)).filter(Boolean)
      );
      if (!knownNumbers.has(empNorm)) {
        const histEntry = buildHistoryEntryFromContract({
          contract: { ...contract, IdentityNumber: id },
          identityNumber: id,
          importJobId: jobId,
          importDate,
        });
        // Note: assign renewal/rehire/cycle hint when we have prior numbers
        let note = '';
        if (knownNumbers.size > 0) {
          // Find the most recent prior entry to compute date gap
          const prior = [...existingHist].sort((a, b) =>
            String(b.firstSeenDate || '').localeCompare(String(a.firstSeenDate || ''))
          )[0];
          note = classifyEmpNoHistoryNote({
            emStartDate:  prior?.firstSeenDate || '',
            conStartDate: contract.StartDate || '',
            conEndType:   contract.ContractEndType || '',
          });
        }
        out.empNoHistoryCandidates.push({
          identityNumber: id,
          newEmpNo:       empNo,
          previousEmpNumbers: [...knownNumbers],
          entry:          { ...histEntry, note },
          note,
          firstSeen:      knownNumbers.size === 0,
        });
        out.summary.empNoHistoryCandidates += 1;
      }
    }
  }

  return out;
}
