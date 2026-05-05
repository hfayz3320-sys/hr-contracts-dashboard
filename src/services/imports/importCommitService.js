// -*- coding: utf-8 -*-
/**
 * importCommitService.js  (Phase 1 — Employee Master path only)
 *
 * Applies an EmployeeMasterImportPreview to the v3 stores in a single IndexedDB
 * read-write transaction. Atomic: any thrown error aborts every write.
 *
 * Stores written (per commit):
 *   persons, employeeMasterSnapshots, employeeNumberHistory,
 *   importJobs, importAuditLog, reviewQueue
 *
 * Legacy stores (employees, contracts, insuranceRecords) are NEVER touched.
 *
 * Phase 1 scope:
 *   - commitEmployeeMasterImport(preview, opts)
 *   - Contract PDF commit deliberately not implemented yet (Phase 1 boundary).
 */

import { withStore, requestToPromise } from '../../storage/indexedDb/coreDb';
import {
  STORE_NAMES,
  V3_HISTORY_STATUS,
  V3_IMPORT_JOB_STATUS,
} from '../../storage/indexedDb/dbSchema';
import {
  IMPORT_SOURCE_TYPES,
  PRIORITIES,
  REVIEW_TYPES,
} from '../../utils/identityModel';
import { createPersonRecord }            from '../../storage/repositories/personRepository';
import { createSnapshotRecord }          from '../../storage/repositories/employeeMasterSnapshotRepository';
import { createContractRecord }          from '../../storage/repositories/contractRecordRepository';
import { createHistoryRecord }           from '../../storage/repositories/employeeNumberHistoryRepository';
import { createAuditEntry }              from '../../storage/repositories/auditLogRepository';
import { createReviewItemRecord }        from '../../storage/repositories/reviewQueueRepository';
import { createImportJobRecord }         from '../../storage/repositories/importJobRepository';
import { deduplicateHistoryEntries }     from './employeeNumberHistoryService';

// ── helpers ──────────────────────────────────────────────────────────────────

function buildJobRecord(preview, opts, status, counts) {
  return createImportJobRecord({
    id:           preview.importJobId,
    type:         IMPORT_SOURCE_TYPES.EMPLOYEE_MASTER_EXCEL,
    status,
    sourceName:   preview.sourceFile || '',
    totalItems:   preview.summary?.total || 0,
    processedItems: counts?.processed || 0,
    successItems:   counts?.success   || 0,
    warningItems:   counts?.warning   || 0,
    errorItems:     counts?.error     || 0,
    metadata: {
      identityCentric: true,
      importedBy:      opts.importedBy || null,
      counts,
    },
  });
}

function buildAuditForCreate(person, snapshot, opts) {
  // One audit entry per Person creation. Field-level entries for snapshot
  // creation would explode the audit log on first import (~13 fields × 500 rows).
  // Phase 1 keeps it as one summarising entry per new person.
  return createAuditEntry({
    action:         'create',
    entityType:     'Person',
    entityId:       person.identityNumber,
    identityNumber: person.identityNumber,
    field:          null,
    oldValue:       null,
    newValue: {
      idType:       person.idType,
      currentName:  person.currentName,
      employeeNumber: snapshot?.employeeNumber || null,
    },
    sourceFile:    snapshot?.sourceFile || '',
    sourceType:    IMPORT_SOURCE_TYPES.EMPLOYEE_MASTER_EXCEL,
    importJobId:   snapshot?.importJobId || null,
    importedBy:    opts.importedBy || null,
    note:          'Person + EmployeeMasterSnapshot created from EM import',
  });
}

function buildReviewItem({ row, reason, reviewType, priority, importJobId, sourceFile, suggestedAction }) {
  // We embed v3-specific fields in extractedData to avoid changing the legacy
  // reviewQueue schema. type/title carry the v3 review type for filtering.
  return createReviewItemRecord({
    type:           reviewType,
    title:          reason || reviewType,
    importJobId,
    entityId:       row?.IdentityNumber || null,
    sourceName:     sourceFile || '',
    extractedData: {
      v3:               true,
      reviewType,
      priority,
      reason,
      sourceType:       IMPORT_SOURCE_TYPES.EMPLOYEE_MASTER_EXCEL,
      sourceFile:       sourceFile || '',
      suggestedAction:  suggestedAction || '',
      rawRow:           row || null,
    },
    warnings: [reason || ''],
  });
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * commitEmployeeMasterImport(preview, opts)
 *
 * Writes a single transaction across:
 *   persons, employeeMasterSnapshots, employeeNumberHistory,
 *   importJobs, importAuditLog, reviewQueue
 *
 * Returns a result object with counts and the committed importJobId.
 *
 * Caller must:
 *   - have constructed the preview via buildEmployeeMasterImportPreview()
 *   - pass opts.importedBy if user attribution is desired
 */
export async function commitEmployeeMasterImport(preview, opts = {}) {
  if (!preview || !preview.importJobId) {
    throw new Error('commitEmployeeMasterImport: invalid preview');
  }

  const stores = [
    STORE_NAMES.PERSONS,
    STORE_NAMES.EMPLOYEE_MASTER_SNAPSHOTS,
    STORE_NAMES.EMPLOYEE_NUMBER_HISTORY,
    STORE_NAMES.IMPORT_JOBS,
    STORE_NAMES.IMPORT_AUDIT_LOG,
    STORE_NAMES.REVIEW_QUEUE,
  ];

  return withStore(stores, 'readwrite', async (s) => {
    // 1. Insert ImportJob (in-progress)
    const inProgressJob = buildJobRecord(preview, opts, V3_IMPORT_JOB_STATUS.IN_PROGRESS, {});
    await requestToPromise(s[STORE_NAMES.IMPORT_JOBS].put(inProgressJob));

    // 2. Upsert Person records (new + updated snapshot persons)
    let personsWritten = 0;
    for (const np of preview.newPersons || []) {
      const personRec = createPersonRecord(np.person);
      await requestToPromise(s[STORE_NAMES.PERSONS].put(personRec));
      personsWritten += 1;
    }
    // Updated snapshots: ensure Person.currentName/nationality/idType stay current
    // (idType doesn't change for an existing valid identity).
    for (const upd of preview.updatedSnapshots || []) {
      const existingPerson = await requestToPromise(
        s[STORE_NAMES.PERSONS].get(upd.identityNumber)
      );
      if (existingPerson) {
        const merged = createPersonRecord({
          ...existingPerson,
          updatedAt: undefined,   // recreated by createPersonRecord
        }, { createdAt: existingPerson.createdAt });
        await requestToPromise(s[STORE_NAMES.PERSONS].put(merged));
      }
    }

    // 3. Upsert EmployeeMasterSnapshot
    let snapshotsWritten = 0;
    for (const np of preview.newPersons || []) {
      const snap = createSnapshotRecord(np.snapshot);
      await requestToPromise(s[STORE_NAMES.EMPLOYEE_MASTER_SNAPSHOTS].put(snap));
      snapshotsWritten += 1;
    }
    for (const upd of preview.updatedSnapshots || []) {
      const snap = createSnapshotRecord({
        ...upd.incomingSnap,
        createdAt: upd.existing?.createdAt,
      });
      await requestToPromise(s[STORE_NAMES.EMPLOYEE_MASTER_SNAPSHOTS].put(snap));
      snapshotsWritten += 1;
    }

    // 4. Append EmployeeNumberHistory (deduplicated against existing)
    let historyWritten = 0;
    if (preview.empNoHistoryCandidates?.length) {
      // Pull existing for the persons we touched, in-tx, to avoid duplicating
      const touchedIds = [...new Set(preview.empNoHistoryCandidates.map((c) => c.identityNumber))];
      const existingByPerson = new Map();
      for (const id of touchedIds) {
        const idx = s[STORE_NAMES.EMPLOYEE_NUMBER_HISTORY].index('byIdentityNumber');
        const existing = await requestToPromise(idx.getAll(id));
        existingByPerson.set(id, existing || []);
      }
      // Build candidate entries
      const incoming = preview.empNoHistoryCandidates.map((c) => ({
        ...c.entry,
        status: V3_HISTORY_STATUS.ACTIVE,
        note:   c.note || '',
      }));
      // Dedup against existing
      const allExisting = [...existingByPerson.values()].flat();
      const fresh = deduplicateHistoryEntries(allExisting, incoming);
      for (const entry of fresh) {
        const rec = createHistoryRecord(entry);
        await requestToPromise(s[STORE_NAMES.EMPLOYEE_NUMBER_HISTORY].put(rec));
        historyWritten += 1;
      }
    }

    // 5. AuditLog entries
    let auditWritten = 0;
    // 5a. Pre-staged update entries from preview (snapshot diffs)
    for (const a of preview.auditEntries || []) {
      const rec = createAuditEntry(a);
      await requestToPromise(s[STORE_NAMES.IMPORT_AUDIT_LOG].put(rec));
      auditWritten += 1;
    }
    // 5b. One creation entry per new person (lightweight)
    for (const np of preview.newPersons || []) {
      const rec = buildAuditForCreate(np.person, np.snapshot, opts);
      await requestToPromise(s[STORE_NAMES.IMPORT_AUDIT_LOG].put(rec));
      auditWritten += 1;
    }

    // 6. Review queue items — missing / invalid / duplicates
    let reviewWritten = 0;
    for (const r of preview.missingIdentity || []) {
      const item = buildReviewItem({
        row:        r.row,
        reason:     r.reason || 'IdentityNumber blank',
        reviewType: REVIEW_TYPES.MISSING_IDENTITY,
        priority:   PRIORITIES.CRITICAL,
        importJobId: preview.importJobId,
        sourceFile:  preview.sourceFile,
        suggestedAction: 'Locate IdentityNumber from source HR system',
      });
      await requestToPromise(s[STORE_NAMES.REVIEW_QUEUE].put(item));
      reviewWritten += 1;
    }
    for (const r of preview.invalidIdentity || []) {
      const item = buildReviewItem({
        row:        r.row,
        reason:     `Invalid IdentityNumber: ${r.reason}`,
        reviewType: REVIEW_TYPES.INVALID_IDENTITY,
        priority:   PRIORITIES.CRITICAL,
        importJobId: preview.importJobId,
        sourceFile:  preview.sourceFile,
        suggestedAction: 'Correct IdentityNumber in source file or system',
      });
      await requestToPromise(s[STORE_NAMES.REVIEW_QUEUE].put(item));
      reviewWritten += 1;
    }
    for (const r of preview.needsReview || []) {
      const item = buildReviewItem({
        row:        r.row,
        reason:     r.reason || 'Ambiguous match',
        reviewType: REVIEW_TYPES.AMBIGUOUS_MATCH,
        priority:   PRIORITIES.HIGH,
        importJobId: preview.importJobId,
        sourceFile:  preview.sourceFile,
        suggestedAction: 'Resolve duplicate IdentityNumber in source file',
      });
      await requestToPromise(s[STORE_NAMES.REVIEW_QUEUE].put(item));
      reviewWritten += 1;
    }

    // 7. Update ImportJob → completed
    const counts = {
      total:           preview.summary?.total || 0,
      new:             preview.summary?.new || 0,
      updated:         preview.summary?.updated || 0,
      unchanged:       preview.summary?.unchanged || 0,
      empNoHistory:    historyWritten,
      review:          reviewWritten,
      invalid:         preview.summary?.invalidIdentity || 0,
      missing:         preview.summary?.missingIdentity || 0,
      personsWritten,
      snapshotsWritten,
      auditWritten,
    };
    const completedJob = buildJobRecord(preview, opts, V3_IMPORT_JOB_STATUS.COMPLETED, counts);
    await requestToPromise(s[STORE_NAMES.IMPORT_JOBS].put(completedJob));

    return {
      importJobId:      preview.importJobId,
      status:           V3_IMPORT_JOB_STATUS.COMPLETED,
      counts,
    };
  });
}

// ── Contract PDF commit path ──────────────────────────────────────────────────
//
// Writes a single transactional commit for a Contract PDF import:
//   persons (when ContractOnly persons must be created),
//   contractRecords, employeeNumberHistory,
//   importJobs, importAuditLog, reviewQueue
//
// Phase 1 boundary: legacy stores (employees, contracts, insuranceRecords) are
// NEVER touched.

function buildContractJobRecord(preview, opts, status, counts) {
  return createImportJobRecord({
    id:           preview.importJobId,
    type:         IMPORT_SOURCE_TYPES.CONTRACT_PDF,
    status,
    sourceName:   (preview.sourceFiles || []).join(', '),
    totalItems:   preview.summary?.total || 0,
    processedItems: counts?.processed || 0,
    successItems:   counts?.success   || 0,
    warningItems:   counts?.warning   || 0,
    errorItems:     counts?.error     || 0,
    metadata: {
      identityCentric: true,
      sourceType:      IMPORT_SOURCE_TYPES.CONTRACT_PDF,
      importedBy:      opts.importedBy || null,
      counts,
    },
  });
}

function buildContractCreateAudit(person, contractRecord, opts) {
  return createAuditEntry({
    action:         'create',
    entityType:     'ContractRecord',
    entityId:       contractRecord.id || null,
    identityNumber: person?.identityNumber || contractRecord?.identityNumber,
    field:          null,
    oldValue:       null,
    newValue: {
      contractNumber:   contractRecord.contractNumber,
      employeeNumber:   contractRecord.employeeNumber,
      contractEndType:  contractRecord.contractEndType,
      startDate:        contractRecord.startDate,
      endDate:          contractRecord.endDate,
      sourcePdf:        contractRecord.sourcePdf,
    },
    sourceFile:    contractRecord.sourcePdf || '',
    sourceType:    IMPORT_SOURCE_TYPES.CONTRACT_PDF,
    importJobId:   contractRecord.importJobId || null,
    importedBy:    opts.importedBy || null,
    note:          person ? 'ContractRecord appended to existing Person' : 'ContractOnly Person + ContractRecord created',
  });
}

function buildContractReviewItem({ contract, reason, reviewType, priority, importJobId, sourceFile, suggestedAction }) {
  return createReviewItemRecord({
    type:           reviewType,
    title:          reason || reviewType,
    importJobId,
    entityId:       contract?.IdentityNumber || null,
    sourceName:     sourceFile || contract?.SourceFile || '',
    extractedData: {
      v3:               true,
      reviewType,
      priority,
      reason,
      sourceType:       IMPORT_SOURCE_TYPES.CONTRACT_PDF,
      sourceFile:       sourceFile || contract?.SourceFile || '',
      suggestedAction:  suggestedAction || '',
      rawContract:      contract || null,
    },
    warnings: [reason || ''],
  });
}

/**
 * commitContractImport(preview, opts)
 *
 * Single transactional commit. Aborts on any error.
 */
export async function commitContractImport(preview, opts = {}) {
  if (!preview || !preview.importJobId) {
    throw new Error('commitContractImport: invalid preview');
  }

  const stores = [
    STORE_NAMES.PERSONS,
    STORE_NAMES.CONTRACT_RECORDS,
    STORE_NAMES.EMPLOYEE_NUMBER_HISTORY,
    STORE_NAMES.IMPORT_JOBS,
    STORE_NAMES.IMPORT_AUDIT_LOG,
    STORE_NAMES.REVIEW_QUEUE,
  ];

  return withStore(stores, 'readwrite', async (s) => {
    // 1. Insert ImportJob (in-progress)
    const inProgressJob = buildContractJobRecord(preview, opts, V3_IMPORT_JOB_STATUS.IN_PROGRESS, {});
    await requestToPromise(s[STORE_NAMES.IMPORT_JOBS].put(inProgressJob));

    // 2. Create ContractOnly Persons (where IdentityNumber not yet in registry)
    let personsCreated = 0;
    for (const co of preview.newContractOnlyPersons || []) {
      const existing = await requestToPromise(s[STORE_NAMES.PERSONS].get(co.identityNumber));
      if (!existing) {
        const personRec = createPersonRecord(co.person);
        await requestToPromise(s[STORE_NAMES.PERSONS].put(personRec));
        personsCreated += 1;
      }
    }

    // 3. Append ContractRecords (both branches: existing-person and contract-only)
    let contractsWritten = 0;
    const allContracts = [
      ...(preview.newContractsForExistingPersons || []),
      ...(preview.newContractOnlyPersons || []),
    ];
    for (const item of allContracts) {
      const rec = createContractRecord(item.contractRecord);
      await requestToPromise(s[STORE_NAMES.CONTRACT_RECORDS].put(rec));
      contractsWritten += 1;
    }

    // 4. Append EmployeeNumberHistory entries (deduplicated against existing)
    let historyWritten = 0;
    if (preview.empNoHistoryCandidates?.length) {
      const touchedIds = [
        ...new Set(preview.empNoHistoryCandidates.map((c) => c.identityNumber)),
      ];
      const existingByPerson = new Map();
      for (const id of touchedIds) {
        const idx = s[STORE_NAMES.EMPLOYEE_NUMBER_HISTORY].index('byIdentityNumber');
        const existing = await requestToPromise(idx.getAll(id));
        existingByPerson.set(id, existing || []);
      }
      const incoming = preview.empNoHistoryCandidates.map((c) => ({
        ...c.entry,
        status: V3_HISTORY_STATUS.ACTIVE,
        note:   c.note || c.entry?.note || '',
      }));
      const allExisting = [...existingByPerson.values()].flat();
      const fresh = deduplicateHistoryEntries(allExisting, incoming);
      for (const entry of fresh) {
        const rec = createHistoryRecord(entry);
        await requestToPromise(s[STORE_NAMES.EMPLOYEE_NUMBER_HISTORY].put(rec));
        historyWritten += 1;
      }
    }

    // 5. AuditLog — one entry per ContractRecord created
    let auditWritten = 0;
    for (const item of preview.newContractsForExistingPersons || []) {
      const rec = buildContractCreateAudit(item.person, item.contractRecord, opts);
      await requestToPromise(s[STORE_NAMES.IMPORT_AUDIT_LOG].put(rec));
      auditWritten += 1;
    }
    for (const item of preview.newContractOnlyPersons || []) {
      const rec = buildContractCreateAudit(null, item.contractRecord, opts);
      await requestToPromise(s[STORE_NAMES.IMPORT_AUDIT_LOG].put(rec));
      auditWritten += 1;
    }

    // 6. ReviewQueue — missing/invalid/needsReview/extractionErrors
    let reviewWritten = 0;
    for (const r of preview.missingIdentity || []) {
      const item = buildContractReviewItem({
        contract:    r.contract,
        reason:      r.reason || 'IdentityNumber blank',
        reviewType:  REVIEW_TYPES.MISSING_IDENTITY,
        priority:    PRIORITIES.CRITICAL,
        importJobId: preview.importJobId,
        sourceFile:  r.contract?.SourceFile,
        suggestedAction: 'Verify IdentityNumber from PDF or HR system',
      });
      await requestToPromise(s[STORE_NAMES.REVIEW_QUEUE].put(item));
      reviewWritten += 1;
    }
    for (const r of preview.invalidIdentity || []) {
      const item = buildContractReviewItem({
        contract:    r.contract,
        reason:      `Invalid IdentityNumber: ${r.reason}`,
        reviewType:  REVIEW_TYPES.INVALID_IDENTITY,
        priority:    PRIORITIES.CRITICAL,
        importJobId: preview.importJobId,
        sourceFile:  r.contract?.SourceFile,
        suggestedAction: 'Correct IdentityNumber in contract or system',
      });
      await requestToPromise(s[STORE_NAMES.REVIEW_QUEUE].put(item));
      reviewWritten += 1;
    }
    for (const r of preview.needsReview || []) {
      const item = buildContractReviewItem({
        contract:    r.contract,
        reason:      r.reason,
        reviewType:  REVIEW_TYPES.AMBIGUOUS_MATCH,
        priority:    PRIORITIES.HIGH,
        importJobId: preview.importJobId,
        sourceFile:  r.contract?.SourceFile,
        suggestedAction: 'Resolve duplicate IdentityNumber within batch',
      });
      await requestToPromise(s[STORE_NAMES.REVIEW_QUEUE].put(item));
      reviewWritten += 1;
    }
    for (const r of preview.extractionErrors || []) {
      const item = buildContractReviewItem({
        contract:    r.contract,
        reason:      r.reason,
        reviewType:  REVIEW_TYPES.INVALID_IDENTITY,    // bucket under invalid for triage
        priority:    PRIORITIES.CRITICAL,
        importJobId: preview.importJobId,
        sourceFile:  r.contract?.SourceFile,
        suggestedAction: 'Re-extract or process manually',
      });
      await requestToPromise(s[STORE_NAMES.REVIEW_QUEUE].put(item));
      reviewWritten += 1;
    }
    for (const r of preview.duplicateContracts || []) {
      const item = buildContractReviewItem({
        contract:    r.contract,
        reason:      r.reason,
        reviewType:  REVIEW_TYPES.AMBIGUOUS_MATCH,
        priority:    PRIORITIES.MEDIUM,
        importJobId: preview.importJobId,
        sourceFile:  r.contract?.SourceFile,
        suggestedAction: 'Skip or replace existing ContractRecord',
      });
      await requestToPromise(s[STORE_NAMES.REVIEW_QUEUE].put(item));
      reviewWritten += 1;
    }

    // 7. Update ImportJob → completed
    const counts = {
      total:                          preview.summary?.total || 0,
      newContractForExistingPerson:   preview.summary?.newContractForExistingPerson || 0,
      newContractOnlyPerson:          preview.summary?.newContractOnlyPerson || 0,
      duplicateContract:              preview.summary?.duplicateContract || 0,
      empNoHistoryCandidates:         preview.summary?.empNoHistoryCandidates || 0,
      needsReview:                    preview.summary?.needsReview || 0,
      invalidIdentity:                preview.summary?.invalidIdentity || 0,
      missingIdentity:                preview.summary?.missingIdentity || 0,
      extractionError:                preview.summary?.extractionError || 0,
      personsCreated,
      contractsWritten,
      historyWritten,
      auditWritten,
      reviewWritten,
    };
    const completedJob = buildContractJobRecord(preview, opts, V3_IMPORT_JOB_STATUS.COMPLETED, counts);
    await requestToPromise(s[STORE_NAMES.IMPORT_JOBS].put(completedJob));

    return {
      importJobId:      preview.importJobId,
      status:           V3_IMPORT_JOB_STATUS.COMPLETED,
      counts,
    };
  });
}
