import { APP_META_KEYS } from '../indexedDb/dbSchema';
import { appMetaRepository } from '../repositories/appMetaRepository';
import { contractRepository, createContractRecord } from '../repositories/contractRepository';
import { employeeRepository, createEmployeeRecord } from '../repositories/employeeRepository';
import { pdfRepository } from '../repositories/pdfRepository';
import { loadImportedDataset, loadPdfBlobs } from '../../utils/persistence';

function shouldKeepPdfKey(key) {
  return String(key || '').trim().toLowerCase().endsWith('.pdf');
}

function dedupePdfEntries(blobMap) {
  const unique = [];
  const seen = new Set();

  Object.entries(blobMap || {}).forEach(([key, blob]) => {
    if (!(blob instanceof Blob) || !shouldKeepPdfKey(key)) {
      return;
    }

    const dedupeKey = `${String(key).trim().toLowerCase()}::${blob.size}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);

    unique.push({
      fileName: String(key).trim(),
      blob,
      aliases: [String(key).trim()],
    });
  });

  return unique;
}

export async function migrateLegacyLocalData() {
  const alreadyMigrated = await appMetaRepository.getValue(APP_META_KEYS.LEGACY_MIGRATION_V1);
  if (alreadyMigrated?.done) {
    return alreadyMigrated;
  }

  const legacyDataset = await loadImportedDataset();
  const legacyPdfMap = await loadPdfBlobs();

  const rows = Array.isArray(legacyDataset?.rows) ? legacyDataset.rows : [];
  const sourceName = legacyDataset?.sourceName || 'Legacy Local Dataset';
  const pdfEntries = dedupePdfEntries(legacyPdfMap);

  if (!rows.length && !pdfEntries.length) {
    const emptyState = {
      done: true,
      migratedAt: new Date().toISOString(),
      importedRows: 0,
      importedPdfs: 0,
      sourceName: null,
    };
    await appMetaRepository.setValue(APP_META_KEYS.LEGACY_MIGRATION_V1, emptyState);
    return emptyState;
  }

  const savedPdfRecords = await pdfRepository.bulkSave(pdfEntries);
  const pdfByFileName = new Map(
    savedPdfRecords.map((record) => [String(record.fileName || '').trim().toLowerCase(), record])
  );

  const employeeRecords = rows.map((row) => {
    const sourceFileName = String(row.SourceFile || '')
      .split(/[\\/]/)
      .pop()
      .trim()
      .toLowerCase();
    const matchingPdf = sourceFileName ? pdfByFileName.get(sourceFileName) : null;

    return createEmployeeRecord(row, {
      contractPdfId: matchingPdf?.id || null,
    });
  });

  const contractRecords = employeeRecords.map((row) =>
    createContractRecord(row, {
      employeeId: row.id,
      pdfFileId: row.contractPdfId,
      sourceFileName: row.SourceFile || '',
    })
  );

  await employeeRepository.bulkUpsert(employeeRecords);
  await contractRepository.bulkUpsert(contractRecords);

  const migrationState = {
    done: true,
    migratedAt: new Date().toISOString(),
    importedRows: employeeRecords.length,
    importedPdfs: savedPdfRecords.length,
    sourceName,
  };
  await appMetaRepository.setValue(APP_META_KEYS.DASHBOARD_SOURCE, sourceName);
  await appMetaRepository.setValue(APP_META_KEYS.LEGACY_MIGRATION_V1, migrationState);

  return migrationState;
}
