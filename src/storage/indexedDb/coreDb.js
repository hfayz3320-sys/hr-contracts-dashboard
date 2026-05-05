import { LOCAL_DB_NAME, LOCAL_DB_VERSION, upgradeLocalDb } from './dbSchema';

function ensureIndexedDb() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    throw new Error('IndexedDB is not available in this environment.');
  }
}

export function openLocalDb() {
  ensureIndexedDb();

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);

    request.onupgradeneeded = () => {
      upgradeLocalDb(request.result);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function withStore(storeNames, mode, callback) {
  const db = await openLocalDb();
  const storeNameList = Array.isArray(storeNames) ? storeNames : [storeNames];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNameList, mode);
    const stores = storeNameList.reduce((accumulator, storeName) => {
      accumulator[storeName] = tx.objectStore(storeName);
      return accumulator;
    }, {});

    let settled = false;

    tx.oncomplete = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
      db.close();
    };
    tx.onerror = () => {
      if (!settled) {
        settled = true;
        reject(tx.error);
      }
      db.close();
    };
    tx.onabort = () => {
      if (!settled) {
        settled = true;
        reject(tx.error);
      }
      db.close();
    };

    Promise.resolve(callback(stores, tx))
      .then((result) => {
        if (result !== undefined && !settled) {
          settled = true;
          resolve(result);
          db.close();
        }
      })
      .catch((error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
        try {
          tx.abort();
        } catch {
          // Ignore abort errors when the transaction has already settled.
        }
        db.close();
      });
  });
}

export function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllFromStore(storeName) {
  return withStore(storeName, 'readonly', async (stores) =>
    requestToPromise(stores[storeName].getAll())
  );
}

export async function getByKey(storeName, key) {
  return withStore(storeName, 'readonly', async (stores) =>
    requestToPromise(stores[storeName].get(key))
  );
}

export async function getAllByIndex(storeName, indexName, value) {
  return withStore(storeName, 'readonly', async (stores) => {
    const index = stores[storeName].index(indexName);
    return requestToPromise(index.getAll(value));
  });
}

export async function putRecord(storeName, value) {
  return withStore(storeName, 'readwrite', async (stores) =>
    requestToPromise(stores[storeName].put(value))
  );
}

export async function bulkPutRecords(storeName, values) {
  return withStore(storeName, 'readwrite', async (stores) => {
    const store = stores[storeName];
    await Promise.all((values || []).map((value) => requestToPromise(store.put(value))));
  });
}

export async function deleteRecord(storeName, key) {
  return withStore(storeName, 'readwrite', async (stores) =>
    requestToPromise(stores[storeName].delete(key))
  );
}

export async function clearStore(storeName) {
  return withStore(storeName, 'readwrite', async (stores) =>
    requestToPromise(stores[storeName].clear())
  );
}
