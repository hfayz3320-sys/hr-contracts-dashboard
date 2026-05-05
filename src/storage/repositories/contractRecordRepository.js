import {
  bulkPutRecords,
  deleteRecord,
  getAllByIndex,
  getAllFromStore,
  getByKey,
  putRecord,
} from '../indexedDb/coreDb';
import { STORE_NAMES } from '../indexedDb/dbSchema';

const CONTRACT_FIELDS = [
  'identityNumber', 'employeeNumber', 'contractNumber', 'sourcePdf',
  'importJobId', 'contractVersion', 'extractionStatus',
  'startDate', 'endDate', 'joiningDate', 'contractEndType',
  'basicSalary', 'allowances', 'grossCashMonthly', 'rawExtractionJson',
];

export function createContractRecord(contract, overrides = {}) {
  const now = new Date().toISOString();
  const record = {
    id: overrides.id || contract.id || crypto.randomUUID(),
  };
  CONTRACT_FIELDS.forEach((f) => {
    record[f] = contract[f] ?? null;
  });
  record.createdAt = overrides.createdAt || contract.createdAt || now;
  record.updatedAt = now;
  return record;
}

export const contractRecordRepository = {
  async listAll() {
    return (await getAllFromStore(STORE_NAMES.CONTRACT_RECORDS)) || [];
  },

  async getById(id) {
    if (!id) return null;
    return (await getByKey(STORE_NAMES.CONTRACT_RECORDS, id)) || null;
  },

  async listByIdentityNumber(identityNumber) {
    if (!identityNumber) return [];
    return (await getAllByIndex(STORE_NAMES.CONTRACT_RECORDS, 'byIdentityNumber', identityNumber)) || [];
  },

  async insert(contract) {
    const record = createContractRecord(contract);
    await putRecord(STORE_NAMES.CONTRACT_RECORDS, record);
    return record;
  },

  async bulkInsert(contracts) {
    const records = (contracts || []).map((c) => createContractRecord(c));
    await bulkPutRecords(STORE_NAMES.CONTRACT_RECORDS, records);
    return records;
  },

  async deleteById(id) {
    await deleteRecord(STORE_NAMES.CONTRACT_RECORDS, id);
  },
};
