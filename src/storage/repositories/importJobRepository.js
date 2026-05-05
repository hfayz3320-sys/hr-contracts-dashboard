import { bulkPutRecords, getAllFromStore, putRecord } from '../indexedDb/coreDb';
import { STORE_NAMES } from '../indexedDb/dbSchema';

export function createImportJobRecord(job, overrides = {}) {
  const now = new Date().toISOString();

  return {
    id: overrides.id || job.id || crypto.randomUUID(),
    type: job.type || 'unknown',
    status: job.status || 'Pending',
    sourceName: job.sourceName || '',
    totalItems: Number(job.totalItems || 0),
    processedItems: Number(job.processedItems || 0),
    successItems: Number(job.successItems || 0),
    warningItems: Number(job.warningItems || 0),
    errorItems: Number(job.errorItems || 0),
    createdAt: overrides.createdAt || job.createdAt || now,
    updatedAt: now,
    metadata: job.metadata || {},
  };
}

export const importJobRepository = {
  async listAll() {
    const jobs = await getAllFromStore(STORE_NAMES.IMPORT_JOBS);
    return (jobs || []).sort((left, right) =>
      String(right.createdAt || '').localeCompare(String(left.createdAt || ''))
    );
  },

  async save(job) {
    const record = createImportJobRecord(job);
    await putRecord(STORE_NAMES.IMPORT_JOBS, record);
    return record;
  },

  async bulkSave(jobs) {
    const records = (jobs || []).map((job) => createImportJobRecord(job));
    await bulkPutRecords(STORE_NAMES.IMPORT_JOBS, records);
    return records;
  },
};
