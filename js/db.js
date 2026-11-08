/* ============ Local database (IndexedDB) — works fully offline ============ */
window.DB = (function () {
  'use strict';

  const DB_NAME = 'souls-register';
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('records')) {
          const store = db.createObjectStore('records', { keyPath: 'id' });
          store.createIndex('synced', 'synced');
          store.createIndex('phone', 'phone');
          store.createIndex('created_at', 'created_at');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(store, mode);
          const s = t.objectStore(store);
          const out = fn(s);
          t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        })
    );
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    async put(record) {
      return tx('records', 'readwrite', (s) => s.put(record));
    },
    async get(id) {
      return tx('records', 'readonly', (s) => reqToPromise(s.get(id)));
    },
    async all() {
      return tx('records', 'readonly', (s) => reqToPromise(s.getAll()));
    },
    async pending() {
      // `synced` is stored as 0/1 — booleans are not valid IDB index keys.
      return tx('records', 'readonly', (s) => reqToPromise(s.index('synced').getAll(0)));
    },
    async count() {
      return tx('records', 'readonly', (s) => reqToPromise(s.count()));
    },
    async pendingCount() {
      return tx('records', 'readonly', (s) => reqToPromise(s.index('synced').count(0)));
    },
    async findByPhone(phone) {
      return tx('records', 'readonly', (s) => reqToPromise(s.index('phone').getAll(phone)));
    },
    async remove(id) {
      return tx('records', 'readwrite', (s) => s.delete(id));
    },
    async clear() {
      return tx('records', 'readwrite', (s) => s.clear());
    },
  };
})();
