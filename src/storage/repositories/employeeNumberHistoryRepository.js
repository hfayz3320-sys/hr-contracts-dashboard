import {
  bulkPutRecords,
  getAllByIndex,
  getAllFromStore,
  putRecord,
} from '../indexedDb/coreDb';
import { STORE_NAMES, V3_HISTORY_STATUS } from '../indexedDb/dbSchema';

const HISTORY_FIELDS = [
  'identityNumber', 'employeeNumber', 'sourceType', 'sourceFile',
  'contractNumber', 'firstSeenDate', 'lastSeenDate', 'status', 'note',
];

export function createHistoryRecord(entry, overrides = {}) {
  const now = new Date().toISOString();
  const record = {
    id: overrides.id || entry.id || crypto.randomUUID(),
  };
  HISTORY_FIELDS.forEach((f) => {
    record[f] = entry[f] ?? null;
  });
  if (!record.status) record.status = V3_HISTORY_STATUS.ACTIVE;
  record.createdAt = overrides.createdAt || entry.createdAt || now;
  record.updatedAt = now;
  return record;
}

export const employeeNumberHistoryRepository = {
  async listAll() {
    return (await getAllFromStore(STORE_NAMES.EMPLOYEE_NUMBER_HISTORY)) || [];
  },

  async listByIdentityNumber(identityNumber) {
    if (!identityNumber) return [];
    return (
      (await getAllByIndex(
        STORE_NAMES.EMPLOYEE_NUMBER_HISTORY,
        'byIdentityNumber',
        identityNumber
      )) || []
    );
  },

  async append(entry) {
    const record = createHistoryRecord(entry);
    await putRecord(STORE_NAMES.EMPLOYEE_NUMBER_HISTORY, record);
    return record;
  },

  async bulkAppend(entries) {
    const records = (entries || []).map((e) => createHistoryRecord(e));
    await bulkPutRecords(STORE_NAMES.EMPLOYEE_NUMBER_HISTORY, records);
    return records;
  },
};
