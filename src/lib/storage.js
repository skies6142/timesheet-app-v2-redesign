// IndexedDB-backed key-value store exposed as window.storage
const DB_NAME = 'timesheet-db';
const STORE_NAME = 'kv';
let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'k' });
      }
    };
    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

export const storage = {
  async get(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.v : null);
      req.onerror = () => reject(req.error);
    });
  },

  async set(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put({ k: key, v: value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async delete(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async keys(prefix = '') {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAllKeys();
      req.onsuccess = () => {
        const keys = prefix ? req.result.filter((k) => k.startsWith(prefix)) : req.result;
        resolve(keys);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async getAll(prefix = '') {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        const all = req.result
          .filter((item) => item.k.startsWith(prefix))
          .map((item) => ({ key: item.k, value: item.v }));
        resolve(all);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async clear() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
};

// Expose as window.storage
if (typeof window !== 'undefined') {
  window.storage = storage;
}
