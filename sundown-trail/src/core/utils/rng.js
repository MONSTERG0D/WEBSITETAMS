/** Seeded randomness (mulberry32). Use it for anything world-related so every part sees the same world. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → 32-bit seed. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export class RNG {
  constructor(seed = 1899) {
    this.seed = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    this._next = mulberry32(this.seed);
  }
  next() { return this._next(); }
  range(min, max) { return min + (max - min) * this._next(); }
  int(min, max) { return Math.floor(this.range(min, max + 1)); }
  pick(arr) { return arr[Math.floor(this._next() * arr.length)]; }
  chance(p) { return this._next() < p; }
  sign() { return this._next() < 0.5 ? -1 : 1; }
  gaussian() {
    let u = 0, v = 0;
    while (u === 0) u = this._next();
    while (v === 0) v = this._next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  /** Independent stream derived from this seed and a label, e.g. rng.fork('trees'). */
  fork(label) { return new RNG((this.seed ^ hashString(String(label))) >>> 0); }
}
