import { bulkPutRecords, deleteRecord, getAllFromStore, putRecord } from '../indexedDb/coreDb';
import { REVIEW_STATUSES, STORE_NAMES } from '../indexedDb/dbSchema';

export function createReviewItemRecord(item, overrides = {}) {
  const now = new Date().toISOString();

  return {
    id: overrides.id || item.id || crypto.randomUUID(),
    type: item.type || 'unknown',
    status: item.status || REVIEW_STATUSES.OPEN,
    entityId: item.entityId || null,
    importJobId: item.importJobId || null,
    title: item.title || '',
    sourceName: item.sourceName || '',
    extractedData: item.extractedData || {},
    warnings: item.warnings || [],
    duplicateMatches: item.duplicateMatches || [],
    duplicateAnalysis: item.duplicateAnalysis || null,
    importDecision: item.importDecision || '',
    createdAt: overrides.createdAt || item.createdAt || now,
    updatedAt: now,
  };
}

export const reviewQueueRepository = {
  async listAll() {
    const items = await getAllFromStore(STORE_NAMES.REVIEW_QUEUE);
    return (items || []).sort((left, right) =>
      String(right.createdAt || '').localeCompare(String(left.createdAt || ''))
    );
  },

  async save(item) {
    const record = createReviewItemRecord(item);
    await putRecord(STORE_NAMES.REVIEW_QUEUE, record);
    return record;
  },

  async bulkSave(items) {
    const records = (items || []).map((item) => createReviewItemRecord(item));
    await bulkPutRecords(STORE_NAMES.REVIEW_QUEUE, records);
    return records;
  },

  async deleteById(id) {
    await deleteRecord(STORE_NAMES.REVIEW_QUEUE, id);
  },
};
