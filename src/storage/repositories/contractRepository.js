import { bulkPutRecords, deleteRecord, getAllFromStore, putRecord } from '../indexedDb/coreDb';
import { IMPORT_STATUSES, STORE_NAMES } from '../indexedDb/dbSchema';
import { buildContractGroupKey, normalizeContractVersion } from '../../utils/contracts';

export function createContractRecord(row, overrides = {}) {
  const now = new Date().toISOString();
  const contractGroupKey =
    overrides.ContractGroupKey || row.ContractGroupKey || buildContractGroupKey(row);

  return {
    ...row,
    id: overrides.id || row.contractId || crypto.randomUUID(),
    employeeId: overrides.employeeId || row.id || null,
    EmployeeNumber: String(row.EmployeeNumber || ''),
    ContractNumber: String(row.ContractNumber || ''),
    StartDate: row.StartDate || '',
    EndDate: row.EndDate || '',
    ContractStatus: row.ContractStatus || 'Unknown',
    importStatus: overrides.importStatus || row.importStatus || IMPORT_STATUSES.CONFIRMED_IMPORTED,
    sourceFileName: overrides.sourceFileName || row.SourceFile || '',
    ContractVersion: normalizeContractVersion(
      overrides.ContractVersion || row.ContractVersion
    ),
    IsCurrentVersion: overrides.IsCurrentVersion ?? row.IsCurrentVersion ?? true,
    ContractGroupKey: contractGroupKey,
    ParentContractKey: overrides.ParentContractKey || row.ParentContractKey || '',
    SourceFileHash: overrides.SourceFileHash || row.SourceFileHash || '',
    pdfFileId: overrides.pdfFileId || row.contractPdfId || null,
    createdAt: overrides.createdAt || row.createdAt || now,
    updatedAt: now,
  };
}

export const contractRepository = {
  async listAll() {
    return getAllFromStore(STORE_NAMES.CONTRACTS);
  },

  async upsert(contract) {
    const record = createContractRecord(contract);
    await putRecord(STORE_NAMES.CONTRACTS, record);
    return record;
  },

  async bulkUpsert(contracts) {
    const records = (contracts || []).map((contract) => createContractRecord(contract));
    await bulkPutRecords(STORE_NAMES.CONTRACTS, records);
    return records;
  },

  async deleteById(id) {
    await deleteRecord(STORE_NAMES.CONTRACTS, id);
  },
};
