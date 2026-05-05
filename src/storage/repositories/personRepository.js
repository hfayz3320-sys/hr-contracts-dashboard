import {
  bulkPutRecords,
  deleteRecord,
  getAllFromStore,
  getByKey,
  putRecord,
} from '../indexedDb/coreDb';
import { STORE_NAMES } from '../indexedDb/dbSchema';

export function createPersonRecord(person, overrides = {}) {
  const now = new Date().toISOString();
  return {
    identityNumber: person.identityNumber,
    idType:         person.idType || null,
    currentName:    person.currentName || '',
    nationality:    person.nationality || '',
    createdAt:      overrides.createdAt || person.createdAt || now,
    updatedAt:      now,
  };
}

export const personRepository = {
  async listAll() {
    return (await getAllFromStore(STORE_NAMES.PERSONS)) || [];
  },

  async getByIdentityNumber(identityNumber) {
    if (!identityNumber) return null;
    return (await getByKey(STORE_NAMES.PERSONS, identityNumber)) || null;
  },

  async upsert(person) {
    const record = createPersonRecord(person, {
      createdAt: person.createdAt,
    });
    await putRecord(STORE_NAMES.PERSONS, record);
    return record;
  },

  async bulkUpsert(persons) {
    const records = (persons || []).map((p) => createPersonRecord(p, { createdAt: p.createdAt }));
    await bulkPutRecords(STORE_NAMES.PERSONS, records);
    return records;
  },

  async deleteByIdentityNumber(identityNumber) {
    await deleteRecord(STORE_NAMES.PERSONS, identityNumber);
  },
};
