import { normalizeEmployeeForm } from '../employees/employeeFormService';
import { localDataService } from '../storage/localDataService';
import { detectEmployeeDuplicateRisk } from './duplicateDetectionService';
import { extractEmployeeFieldsFromPdf } from './pdfExtractionService';
import { IMPORT_STATUSES, REVIEW_STATUSES } from '../../storage/indexedDb/dbSchema';
import { buildContractGroupKey, normalizeContractVersion } from '../../utils/contracts';

function determineImportState(extraction, duplicateRisk) {
  if (extraction.status === IMPORT_STATUSES.UNSUPPORTED_SCAN_PDF) {
    return IMPORT_STATUSES.UNSUPPORTED_SCAN_PDF;
  }

  if (duplicateRisk.hasDuplicateRisk || extraction.warnings.length > 0) {
    return IMPORT_STATUSES.NEEDS_REVIEW;
  }

  return extraction.status === IMPORT_STATUSES.READY
    ? IMPORT_STATUSES.READY
    : IMPORT_STATUSES.DRAFT_EXTRACTED;
}

function buildDuplicateWarnings(duplicateRisk) {
  if (!duplicateRisk?.hasDuplicateRisk) {
    return [];
  }

  if (duplicateRisk.hasBlockingDuplicate) {
    return ['Exact duplicate import blocked.'];
  }

  if (duplicateRisk.requiresDecision) {
    return ['Version decision required before import.'];
  }

  return ['Duplicate detection requires review.'];
}

function buildReviewItem(pdfRecord, extraction, duplicateRisk, importJobId) {
  const importState = determineImportState(extraction, duplicateRisk);

  return {
    type: 'contract-pdf',
    status:
      importState === IMPORT_STATUSES.READY ? REVIEW_STATUSES.CONFIRMED : REVIEW_STATUSES.OPEN,
    entityId: pdfRecord.id,
    importJobId,
    title: pdfRecord.fileName,
    sourceName: pdfRecord.fileName,
    extractedData: {
      ...extraction.extractedData,
      SourceFile: pdfRecord.fileName,
      SourceFileHash: pdfRecord.sourceFileHash || extraction.extractedData?.SourceFileHash || '',
      contractPdfId: pdfRecord.id,
      importStatus: importState,
    },
    warnings: [...extraction.warnings, ...buildDuplicateWarnings(duplicateRisk)],
    duplicateMatches: duplicateRisk.matches || [],
    duplicateAnalysis: duplicateRisk,
    importDecision: duplicateRisk.recommendedDecision || '',
  };
}

function normalizeEntries(files) {
  return Array.from(files || []).map((entry) => ({
    fileName: entry.fileName || entry.name || 'contract.pdf',
    blob: entry.blob || entry.file || entry,
  }));
}

function resolveGroupContracts(existingContracts, analysis, normalizedRow, matchedEmployee) {
  const fallbackGroupKey = buildContractGroupKey(normalizedRow);
  const matchedEmployeeId = matchedEmployee?.id || analysis?.employeeMatch?.employee?.id || null;
  return (existingContracts || []).filter((row) => {
    if (analysis?.contractGroupKey && row.ContractGroupKey === analysis.contractGroupKey) {
      return true;
    }

    return (
      row.ContractGroupKey === fallbackGroupKey ||
      (((matchedEmployeeId && row.employeeId === matchedEmployeeId) ||
        String(row.EmployeeNumber || '').trim() === String(normalizedRow.EmployeeNumber || '').trim()) &&
        String(row.ContractNumber || '').trim() === String(normalizedRow.ContractNumber || '').trim())
    );
  });
}

function buildContractMetadata(item, normalizedRow, groupContracts, matchedEmployee) {
  const analysis = item.duplicateAnalysis || {};
  const groupKey = analysis.contractGroupKey || buildContractGroupKey(normalizedRow);
  const target = analysis.target || null;
  const nextVersion =
    analysis.nextVersion ||
    Math.max(1, ...groupContracts.map((row) => normalizeContractVersion(row.ContractVersion))) + 1;

  if (analysis.requiresDecision && item.importDecision === 'replace_existing' && target?.employeeId) {
    return {
      id: matchedEmployee?.id || target.employeeId || normalizedRow.id || null,
      contractId: target.contractId || normalizedRow.contractId || null,
      ContractVersion: target.contractVersion || 1,
      IsCurrentVersion: true,
      ContractGroupKey: groupKey,
      ParentContractKey: target.contractId || groupKey,
    };
  }

  if (analysis.requiresDecision && item.importDecision === 'import_new_version') {
    return {
      id: matchedEmployee?.id || normalizedRow.id || null,
      contractId: normalizedRow.contractId || crypto.randomUUID(),
      ContractVersion: nextVersion,
      IsCurrentVersion: true,
      ContractGroupKey: groupKey,
      ParentContractKey: target?.contractId || groupKey,
    };
  }

  return {
    id: matchedEmployee?.id || normalizedRow.id || null,
    contractId: normalizedRow.contractId || null,
    ContractVersion: normalizeContractVersion(normalizedRow.ContractVersion),
    IsCurrentVersion: normalizedRow.IsCurrentVersion ?? true,
    ContractGroupKey: groupKey,
    ParentContractKey: normalizedRow.ParentContractKey || '',
  };
}

function dedupeById(records, idSelector = (record) => record.id) {
  const map = new Map();
  (records || []).forEach((record) => {
    const id = idSelector(record);
    if (id) {
      map.set(id, record);
    }
  });
  return Array.from(map.values());
}

export const pdfImportService = {
  async prepare(files, existingEmployees) {
    const list = normalizeEntries(files).slice(0, 1);
    if (!list.length) {
      return {
        importJob: null,
        reviewItems: [],
      };
    }

    const [existingContracts, existingPdfRecords] = await Promise.all([
      localDataService.listContracts(),
      localDataService.listPdfRecords(),
    ]);

    const importJob = await localDataService.saveImportJob({
      type: 'single-contract-pdf-import',
      status: 'Prepared',
      sourceName: list[0]?.fileName || 'Contract PDF',
      totalItems: list.length,
      processedItems: 0,
    });

    const pdfRecords = await localDataService.storePdfFiles(
      list.map((file) => ({
        fileName: file.fileName,
        blob: file.blob,
        aliases: [file.fileName],
      })),
      { importJobId: importJob.id }
    );

    const reviewItems = [];

    for (let index = 0; index < list.length; index += 1) {
      const file = list[index];
      const pdfRecord = pdfRecords[index];

      try {
        const extraction = await extractEmployeeFieldsFromPdf({
          name: file.fileName,
          arrayBuffer: () => file.blob.arrayBuffer(),
        });

        const priorBatchPdfRecords = pdfRecords.slice(0, index);

        const duplicateRisk = detectEmployeeDuplicateRisk(
          {
            ...extraction.extractedData,
            SourceFileHash: pdfRecord.sourceFileHash || '',
          },
          {
            existingEmployees,
            existingContracts,
            existingPdfRecords: [...existingPdfRecords, ...priorBatchPdfRecords],
          }
        );

        reviewItems.push(buildReviewItem(pdfRecord, extraction, duplicateRisk, importJob.id));
      } catch (error) {
        reviewItems.push(
          buildReviewItem(
            pdfRecord,
            {
              status: IMPORT_STATUSES.NEEDS_REVIEW,
              warnings: [error.message || 'PDF extraction failed and requires manual review.'],
              extractedData: {
                SourceFile: file.fileName,
                SourceFileHash: pdfRecord.sourceFileHash || '',
              },
            },
            {
              hasDuplicateRisk: false,
              hasBlockingDuplicate: false,
              requiresDecision: false,
              recommendedDecision: '',
              matches: [],
            },
            importJob.id
          )
        );
      }
    }

    const savedReviewItems = await localDataService.saveReviewItems(reviewItems);

    return {
      importJob,
      reviewItems: savedReviewItems,
    };
  },

  async saveReviewItems(reviewItems) {
    return localDataService.saveReviewItems(reviewItems);
  },

  async confirm(reviewItems, selectedIds) {
    const items = (reviewItems || []).filter((item) => selectedIds.includes(item.id));
    if (!items.length) {
      return [];
    }

    const existingContracts = await localDataService.listContracts();

    const contractsToDeactivate = [];
    const reviewUpdates = [];
    const rowsWithPdfLink = [];

    for (const item of items) {
      const analysis = item.duplicateAnalysis || {};
      const matchedEmployee = analysis.employeeMatch?.employee || null;

      if (analysis.hasBlockingDuplicate) {
        throw new Error(`Exact duplicate import blocked for ${item.title}.`);
      }

      if (analysis.employeeMatch?.isAmbiguous) {
        throw new Error(`Employee match needs manual review for ${item.title}.`);
      }

      if (analysis.requiresDecision && !item.importDecision) {
        throw new Error(`Choose a version action for ${item.title} before confirming.`);
      }

      if (item.importDecision === 'cancel') {
        reviewUpdates.push({
          ...item,
          status: REVIEW_STATUSES.SKIPPED,
        });
        continue;
      }

      const normalizedRow = normalizeEmployeeForm({
        ...item.extractedData,
        SourceFile: item.sourceName,
      });

      const groupContracts = resolveGroupContracts(
        existingContracts,
        analysis,
        normalizedRow,
        matchedEmployee
      );
      const metadata = buildContractMetadata(item, normalizedRow, groupContracts, matchedEmployee);

      const rowWithMetadata = {
        ...normalizedRow,
        ...metadata,
        id: metadata.id || matchedEmployee?.id || normalizedRow.id || null,
        contractPdfId: item.entityId,
        importStatus: IMPORT_STATUSES.CONFIRMED_IMPORTED,
        SourceFileHash: item.extractedData?.SourceFileHash || '',
      };

      if (analysis.requiresDecision) {
        const targetContractId = analysis.target?.contractId;

        groupContracts.forEach((existingContract) => {
          const isReplaceTarget =
            item.importDecision === 'replace_existing' && targetContractId === existingContract.id;
          if (isReplaceTarget || existingContract.IsCurrentVersion === false) {
            return;
          }

          contractsToDeactivate.push({
            ...existingContract,
            IsCurrentVersion: false,
          });
        });
      }

      rowsWithPdfLink.push(rowWithMetadata);
      reviewUpdates.push({
        ...item,
        status: REVIEW_STATUSES.CONFIRMED,
      });
    }

    if (contractsToDeactivate.length) {
      await localDataService.saveContracts(dedupeById(contractsToDeactivate));
    }

    if (rowsWithPdfLink.length) {
      await localDataService.storeImportedRows(rowsWithPdfLink, {
        sourceName: 'PDF Contract Import',
        importJobId: items[0].importJobId,
        importStatus: IMPORT_STATUSES.CONFIRMED_IMPORTED,
      });
    }

    if (reviewUpdates.length) {
      await localDataService.saveReviewItems(reviewUpdates);
    }

    return rowsWithPdfLink;
  },
};
