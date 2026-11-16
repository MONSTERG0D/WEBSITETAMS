/**
 * Key-value storage. localStorage in browsers, memory when unavailable.
 * Part 16 swaps the backend for Capacitor Preferences on phones without changing callers.
 */
const memory = new Map();

function detect() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const k = '__sd_probe__'; localStorage.setItem(k, '1'); localStorage.removeItem(k);
    return localStorage;
  } catch { return null; }
}
const backend = detect();

export const Storage = {
  persistent: !!backend,
  get(key) {
    try { return backend ? backend.getItem(key) : (memory.has(key) ? memory.get(key) : null); }
    catch { return memory.has(key) ? memory.get(key) : null; }
  },
  set(key, value) {
    try { if (backend) backend.setItem(key, value); else memory.set(key, value); return true; }
    catch (err) { console.warn('[storage] write failed (storage full or blocked)', err); memory.set(key, value); return false; }
  },
  remove(key) { try { if (backend) backend.removeItem(key); else memory.delete(key); } catch { memory.delete(key); } },
};
