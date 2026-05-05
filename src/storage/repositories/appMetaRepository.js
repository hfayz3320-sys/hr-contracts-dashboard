import { getByKey, putRecord } from '../indexedDb/coreDb';
import { STORE_NAMES } from '../indexedDb/dbSchema';

export const appMetaRepository = {
  async getValue(key) {
    const record = await getByKey(STORE_NAMES.APP_META, key);
    return record?.value;
  },

  async setValue(key, value) {
    await putRecord(STORE_NAMES.APP_META, {
      key,
      value,
      updatedAt: new Date().toISOString(),
    });
  },
};
