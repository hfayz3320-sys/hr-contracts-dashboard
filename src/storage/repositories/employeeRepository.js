import { bulkPutRecords, deleteRecord, getAllFromStore, putRecord } from '../indexedDb/coreDb';
import { STORE_NAMES } from '../indexedDb/dbSchema';
import { buildContractGroupKey, normalizeContractVersion } from '../../utils/contracts';

export function createEmployeeRecord(row, overrides = {}) {
  const now = new Date().toISOString();
  const contractGroupKey =
    overrides.ContractGroupKey || row.ContractGroupKey || buildContractGroupKey(row);

  return {
    ...row,
    id: overrides.id || row.id || crypto.randomUUID(),
    contractId: overrides.contractId || row.contractId || crypto.randomUUID(),
    EmploymentStatus:
      overrides.EmploymentStatus || row.EmploymentStatus || deriveEmploymentStatus(row),
    ContractVersion: normalizeContractVersion(
      overrides.ContractVersion || row.ContractVersion
    ),
    IsCurrentVersion:
      overrides.IsCurrentVersion ?? row.IsCurrentVersion ?? true,
    ContractGroupKey: contractGroupKey,
    ParentContractKey:
      overrides.ParentContractKey || row.ParentContractKey || '',
    SourceFileHash: overrides.SourceFileHash || row.SourceFileHash || '',
    createdAt: overrides.createdAt || row.createdAt || now,
    updatedAt: now,
    contractPdfId: overrides.contractPdfId || row.contractPdfId || null,
    importJobId: overrides.importJobId || row.importJobId || null,
  };
}

function deriveEmploymentStatus(row) {
  const contractStatus = String(row?.ContractStatus || '').trim();
  if (contractStatus === 'Expired') {
    return 'Inactive';
  }
  return 'Active';
}

export const employeeRepository = {
  async listAll() {
    const employees = await getAllFromStore(STORE_NAMES.EMPLOYEES);
    return (employees || []).sort((left, right) =>
      String(left.Name || '').localeCompare(String(right.Name || ''), 'en', {
        sensitivity: 'base',
      })
    );
  },

  async upsert(employee) {
    const record = createEmployeeRecord(employee);
    await putRecord(STORE_NAMES.EMPLOYEES, record);
    return record;
  },

  async bulkUpsert(employees) {
    const records = (employees || []).map((employee) => createEmployeeRecord(employee));
    await bulkPutRecords(STORE_NAMES.EMPLOYEES, records);
    return records;
  },

  async deleteById(id) {
    await deleteRecord(STORE_NAMES.EMPLOYEES, id);
  },
};
