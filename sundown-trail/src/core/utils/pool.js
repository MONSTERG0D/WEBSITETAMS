/** Object pool: reuse objects instead of allocating in hot paths. */
export class Pool {
  constructor(create, reset = null, initial = 0) {
    this._create = create; this._reset = reset; this._free = [];
    for (let i = 0; i < initial; i++) this._free.push(create());
  }
  acquire() { return this._free.length ? this._free.pop() : this._create(); }
  release(obj) { if (this._reset) this._reset(obj); this._free.push(obj); }
  get available() { return this._free.length; }
}
