const DB_NAME = 'hr-contracts-dashboard-db';
const DB_VERSION = 2;
const STORE_IMPORTS = 'imports';
const STORE_PDFS = 'pdfs';
const RECORD_KEY_IMPORTS = 'latest';
const FALLBACK_KEY = 'hr-dashboard-import-v1';

function hasIndexedDb() {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_IMPORTS)) {
        db.createObjectStore(STORE_IMPORTS);
      }
      if (!db.objectStoreNames.contains(STORE_PDFS)) {
        db.createObjectStore(STORE_PDFS);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveImportedDataset(payload) {
  if (!payload) {
    return;
  }

  if (!hasIndexedDb()) {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(payload));
    return;
  }

  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMPORTS, 'readwrite');
    tx.objectStore(STORE_IMPORTS).put(payload, RECORD_KEY_IMPORTS);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadImportedDataset() {
  if (!hasIndexedDb()) {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  const db = await openDb();
  const data = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMPORTS, 'readonly');
    const req = tx.objectStore(STORE_IMPORTS).get(RECORD_KEY_IMPORTS);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return data;
}

export async function clearImportedDataset() {
  localStorage.removeItem(FALLBACK_KEY);

  if (!hasIndexedDb()) {
    return;
  }

  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMPORTS, 'readwrite');
    tx.objectStore(STORE_IMPORTS).delete(RECORD_KEY_IMPORTS);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function savePdfBlobs(blobMap) {
  if (!blobMap || typeof blobMap !== 'object') {
    return;
  }

  if (!hasIndexedDb()) {
    return;
  }

  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PDFS, 'readwrite');
    const store = tx.objectStore(STORE_PDFS);
    store.clear();
    Object.entries(blobMap).forEach(([key, blob]) => {
      if (key && blob instanceof Blob) {
        store.put(blob, key);
      }
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadPdfBlobs() {
  if (!hasIndexedDb()) {
    return {};
  }

  const db = await openDb();
  const data = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PDFS, 'readonly');
    const store = tx.objectStore(STORE_PDFS);
    const req = store.getAll();
    const keysReq = store.getAllKeys();

    tx.oncomplete = () => {
      const blobs = req.result || [];
      const keys = keysReq.result || [];
      const map = {};
      keys.forEach((key, index) => {
        if (typeof key === 'string' && blobs[index] instanceof Blob) {
          map[key] = blobs[index];
        }
      });
      resolve(map);
    };
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return data;
}

export async function clearPdfBlobs() {
  if (!hasIndexedDb()) {
    return;
  }

  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PDFS, 'readwrite');
    tx.objectStore(STORE_PDFS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
