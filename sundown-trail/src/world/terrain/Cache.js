/**
 * IndexedDB cache for generated world data. The world is deterministic, so the first launch generates it
 * (a few seconds on a phone) and every later launch loads it in a fraction of that.
 * Bump GENERATOR_VERSION whenever generation code changes in a way TUNING values don't capture.
 */
export const GENERATOR_VERSION = 6;
const DB = 'sundown-trail', STORE = 'terrain';

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** FNV-1a over a string: short, stable cache keys. */
export function hashKey(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

export async function loadCached(key) {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly'), req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    });
  } catch { return null; }
}

/** Stores the data under `key` and drops every older entry. Failures (quota, private mode) are ignored. */
export async function saveCached(key, data) {
  try {
    const db = await open();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
      store.clear(); store.put(data, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = tx.onabort = () => { db.close(); resolve(); };
    });
    return true;
  } catch { return false; }
}
