import {
  bulkPutRecords,
  getAllByIndex,
  getAllFromStore,
  putRecord,
} from '../indexedDb/coreDb';
import { STORE_NAMES } from '../indexedDb/dbSchema';

const AUDIT_FIELDS = [
  'action', 'entityType', 'entityId', 'identityNumber',
  'field', 'oldValue', 'newValue',
  'sourceFile', 'sourceType', 'importJobId', 'importedBy',
  'note',
];

export function createAuditEntry(entry, overrides = {}) {
  const now = new Date().toISOString();
  const record = {
    id: overrides.id || entry.id || crypto.randomUUID(),
    importTimestamp: overrides.importTimestamp || entry.importTimestamp || now,
  };
  AUDIT_FIELDS.forEach((f) => {
    record[f] = entry[f] ?? null;
  });
  return record;
}

export const auditLogRepository = {
  async listAll() {
    return (await getAllFromStore(STORE_NAMES.IMPORT_AUDIT_LOG)) || [];
  },

  async listByImportJob(importJobId) {
    if (!importJobId) return [];
    return (
      (await getAllByIndex(STORE_NAMES.IMPORT_AUDIT_LOG, 'byImportJobId', importJobId)) || []
    );
  },

  async listByIdentityNumber(identityNumber) {
    if (!identityNumber) return [];
    return (
      (await getAllByIndex(STORE_NAMES.IMPORT_AUDIT_LOG, 'byIdentityNumber', identityNumber)) || []
    );
  },

  async insert(entry) {
    const record = createAuditEntry(entry);
    await putRecord(STORE_NAMES.IMPORT_AUDIT_LOG, record);
    return record;
  },

  async bulkInsert(entries) {
    const records = (entries || []).map((e) => createAuditEntry(e));
    await bulkPutRecords(STORE_NAMES.IMPORT_AUDIT_LOG, records);
    return records;
  },
};
