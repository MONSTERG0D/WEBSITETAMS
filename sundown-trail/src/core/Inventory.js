import System from './System.js';
import { EVENTS } from './Events.js';
import { ITEMS } from '../data/items.js';

/** The player's satchel: item id → quantity. */
export default class Inventory extends System {
  constructor(game) { super(game); this.items = new Map(); }
  add(id, qty = 1) {
    if (!id || !(qty > 0)) return this.count(id);
    if (!ITEMS[id]) console.warn(`[inventory] unknown item "${id}"; add it to src/data/items.js`);
    const room = this.space(id); // Part 14: carry limits (the satchel sets this.limit)
    if (room < qty) { if (room <= 0) { this.game.events.emit(EVENTS.ITEM_REJECTED, { id, qty }); return this.count(id); } this.game.events.emit(EVENTS.ITEM_REJECTED, { id, qty: qty - room }); qty = room; }
    const n = this.count(id) + qty;
    this.items.set(id, n);
    this.game.events.emit(EVENTS.ITEM_ADDED, { id, qty });
    return n;
  }
  remove(id, qty = 1) {
    const have = this.count(id);
    if (!(qty > 0) || have < qty) return false;
    if (have === qty) this.items.delete(id); else this.items.set(id, have - qty);
    this.game.events.emit(EVENTS.ITEM_REMOVED, { id, qty });
    return true;
  }
  count(id) { return this.items.get(id) || 0; }
  /** Added in Part 14: how many more of an item fit (Infinity without a limit). Set `limit = (id) => max` to cap. */
  space(id) { const max = this.limit ? this.limit(id) : Infinity; return Math.max(0, (max ?? Infinity) - this.count(id)); }
  has(id, qty = 1) { return this.count(id) >= qty; }
  /** @returns {{id, qty, def}[]} optionally filtered by ITEMS category */
  list(category = null) {
    const out = [];
    for (const [id, qty] of this.items) { const def = ITEMS[id] || null; if (!category || def?.category === category) out.push({ id, qty, def }); }
    return out;
  }
  serialize() { return { items: Object.fromEntries(this.items) }; }
  deserialize(data) {
    if (!data?.items) return;
    this.items.clear();
    for (const [id, qty] of Object.entries(data.items)) if (qty > 0) this.items.set(id, qty);
  }
}
