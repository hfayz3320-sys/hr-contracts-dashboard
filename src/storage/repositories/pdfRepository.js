import { bulkPutRecords, deleteRecord, getAllFromStore, getByKey, putRecord } from '../indexedDb/coreDb';
import { STORE_NAMES } from '../indexedDb/dbSchema';

export function createPdfRecord(payload, overrides = {}) {
  const now = new Date().toISOString();
  const fileName = String(payload.fileName || payload.name || '').trim();

  return {
    id: overrides.id || payload.id || crypto.randomUUID(),
    fileName,
    blob: payload.blob,
    employeeNumber: String(payload.employeeNumber || ''),
    contractNumber: String(payload.contractNumber || ''),
    sourceFileHash: String(payload.sourceFileHash || ''),
    importJobId: payload.importJobId || null,
    aliases: Array.from(new Set(payload.aliases || [fileName])).filter(Boolean),
    mimeType: payload.blob?.type || 'application/pdf',
    createdAt: overrides.createdAt || payload.createdAt || now,
    updatedAt: now,
  };
}

export const pdfRepository = {
  async listAll() {
    return getAllFromStore(STORE_NAMES.PDF_FILES);
  },

  async getById(id) {
    return getByKey(STORE_NAMES.PDF_FILES, id);
  },

  async save(payload) {
    const record = createPdfRecord(payload);
    await putRecord(STORE_NAMES.PDF_FILES, record);
    return record;
  },

  async bulkSave(payloads) {
    const records = (payloads || []).map((payload) => createPdfRecord(payload));
    await bulkPutRecords(STORE_NAMES.PDF_FILES, records);
    return records;
  },

  async deleteById(id) {
    await deleteRecord(STORE_NAMES.PDF_FILES, id);
  },
};
