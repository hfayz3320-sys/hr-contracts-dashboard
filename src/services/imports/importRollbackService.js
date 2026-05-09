// -*- coding: utf-8 -*-
/**
 * importRollbackService.js
 *
 * Recovery helper for the two-phase Local-Assets commit:
 *   1. commitEmployeeMasterImport(emPreview)   — writes persons/snapshots/etc
 *   2. commitContractImport(pdfPreview)        — writes contracts/history/etc
 *
 * If step 2 fails after step 1 has already committed, the database is in a
 * mixed state. This service rolls back step 1 by deleting every record
 * tagged with the EM importJobId across all stores it touched.
 *
 * Idempotent — safe to call multiple times.
 *
 * Stores cleaned (matching importJobId):
 *   persons                          (only those CREATED by this job)
 *   employeeMasterSnapshots          (only those imported by this job)
 *   employeeNumberHistory            (matching importJobId)
 *   importAuditLog                   (matching importJobId)
 *   reviewQueue                      (matching importJobId)
 *   importJobs                       (the job record itself)
 *
 * NOT touched: contractRecords (they were never written if step 2 failed
 * before the commit transaction).
 *
 * Usage:
 *   import { commitLocalAssetsWithRollback } from './importRollbackService';
 *   await commitLocalAssetsWithRollback({ emPreview, pdfPreview, opts });
 */

import { withStore, requestToPromise } from '../../storage/indexedDb/coreDb';
import { STORE_NAMES } from '../../storage/indexedDb/dbSchema';
import {
  commitEmployeeMasterImport,
  commitContractImport,
} from './importCommitService';

/**
 * Delete every record with field `importJobId === jobId` from a store
 * (uses the store's `byImportJobId` index when present; otherwise scans).
 */
async function deleteRecordsByImportJobId(stores, storeName, jobId) {
  const store = stores[storeName];
  if (!store) return 0;

  // Prefer the index path
  let req;
  try {
    const idx = store.index('byImportJobId');
    req = idx.openCursor(IDBKeyRange.only(jobId));
  } catch {
    // Store has no such index — fall back to a full scan
    req = store.openCursor();
  }

  let deleted = 0;
  await new Promise((resolve, reject) => {
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve();
      const value = cursor.value;
      if (!value || value.importJobId === jobId) {
        cursor.delete();
        deleted += 1;
      }
      cursor.continue();
    };
  });
  return deleted;
}

/**
 * Roll back an EM commit by deleting everything tagged with its importJobId.
 * Returns counts of rows removed per store.
 */
export async function rollbackEmployeeMasterImport(jobId) {
  if (!jobId) return { rolledBack: 0 };

  const stores = [
    STORE_NAMES.PERSONS,
    STORE_NAMES.EMPLOYEE_MASTER_SNAPSHOTS,
    STORE_NAMES.EMPLOYEE_NUMBER_HISTORY,
    STORE_NAMES.IMPORT_AUDIT_LOG,
    STORE_NAMES.REVIEW_QUEUE,
    STORE_NAMES.IMPORT_JOBS,
  ];

  return withStore(stores, 'readwrite', async (s) => {
    const counts = {};
    for (const name of stores) {
      counts[name] = await deleteRecordsByImportJobId(s, name, jobId);
    }
    counts.rolledBack = Object.values(counts).reduce((a, b) => a + b, 0);
    return counts;
  });
}

/**
 * Two-phase commit with rollback safety:
 *   1. EM commit
 *   2. PDF commit
 * If (2) throws, (1) is rolled back and the original error is re-thrown
 * with `rollback: <counts>` attached.
 */
export async function commitLocalAssetsWithRollback({ emPreview, pdfPreview, opts = {} }) {
  if (!emPreview || !pdfPreview) {
    throw new Error('commitLocalAssetsWithRollback: both previews required');
  }

  let emResult = null;
  try {
    emResult = await commitEmployeeMasterImport(emPreview, opts);
  } catch (err) {
    err.phase = 'employeeMaster';
    throw err;
  }

  let pdfResult = null;
  try {
    pdfResult = await commitContractImport(pdfPreview, opts);
  } catch (err) {
    // Roll back EM commit
    let rollbackResult = null;
    try {
      rollbackResult = await rollbackEmployeeMasterImport(emResult.importJobId);
    } catch (rollbackErr) {
      err.rollbackError = rollbackErr.message || String(rollbackErr);
    }
    err.phase = 'contractPdf';
    err.emJobId = emResult.importJobId;
    err.rollback = rollbackResult;
    err.message = `PDF commit failed; EM commit (${emResult.importJobId}) rolled back. Original: ${err.message}`;
    throw err;
  }

  return {
    em:  emResult,
    pdf: pdfResult,
    counts: {
      ...emResult.counts,
      pdf: pdfResult.counts,
    },
  };
}
