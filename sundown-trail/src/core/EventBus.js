/** Tiny synchronous event bus. A failing handler is logged and never breaks the others. */
export class EventBus {
  constructor() { this._map = new Map(); }
  /** @returns {Function} unsubscribe */
  on(evt, fn) {
    let set = this._map.get(evt);
    if (!set) { set = new Set(); this._map.set(evt, set); }
    set.add(fn);
    return () => this.off(evt, fn);
  }
  off(evt, fn) { this._map.get(evt)?.delete(fn); }
  once(evt, fn) { const wrap = (p) => { this.off(evt, wrap); fn(p); }; return this.on(evt, wrap); }
  emit(evt, payload) {
    const set = this._map.get(evt);
    if (!set || set.size === 0) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (err) { console.error(`[events] handler for "${evt}" failed`, err); }
    }
  }
  clear() { this._map.clear(); }
}
