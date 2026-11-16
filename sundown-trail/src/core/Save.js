import { Storage } from './Storage.js';
import { EVENTS } from './Events.js';
import { WORLD } from '../data/world.js';

const PREFIX = 'sundown.save.';
export const SAVE_VERSION = 1;
export const SLOTS = ['auto', '1', '2', '3'];

/** Saves = every registered system's serialize(), versioned (GAME_BIBLE §11 save format). */
export class Save {
  constructor(game) { this.game = game; this.lastAutosave = -Infinity; }
  save(slot = '1') {
    const g = this.game, systems = {};
    for (const [id, sys] of g.systems) {
      if (typeof sys?.serialize !== 'function') continue;
      try { const data = sys.serialize(); if (data != null) systems[id] = data; } catch (err) { console.error(`[save] ${id}.serialize failed`, err); }
    }
    const sky = g.get('sky'), meta = { money: g.get('wallet')?.money ?? 0, day: sky?.day ?? 1, hour: sky?.timeOfDay ?? 12, honor: g.get('honor')?.value ?? 0 }; // Part 14: shown on the slot
    const record = { version: SAVE_VERSION, savedAt: new Date().toISOString(), slot: String(slot), playtime: Math.round(g.playtime), location: this._location(), meta, systems };
    const ok = Storage.set(PREFIX + slot, JSON.stringify(record));
    if (ok) g.events.emit(EVENTS.GAME_SAVED, { slot: String(slot) });
    return ok;
  }
  load(slot = '1') {
    const record = this.read(slot);
    if (!record) return false;
    const g = this.game;
    for (const [id, sys] of g.systems) {
      if (typeof sys?.deserialize !== 'function') continue;
      try { sys.deserialize(record.systems[id]); } catch (err) { console.error(`[save] ${id}.deserialize failed`, err); }
    }
    g.playtime = record.playtime || 0;
    g.events.emit(EVENTS.GAME_LOADED, { slot: String(slot) });
    return true;
  }
  /** Parsed record or null when the slot is empty or corrupted. */
  read(slot) {
    const raw = Storage.get(PREFIX + slot);
    if (!raw) return null;
    try {
      const rec = JSON.parse(raw);
      if (!rec || typeof rec !== 'object' || typeof rec.systems !== 'object') throw new Error('unexpected format');
      return this._migrate(rec);
    } catch (err) { console.warn(`[save] slot ${slot} is unreadable`, err); return null; }
  }
  /** Writes the 'auto' slot; throttled to once every 20 s unless forced, and only while playing. */
  autosave(force = false) {
    const g = this.game;
    if (!force && (g.state !== 'playing' || g.now - this.lastAutosave < 20)) return false;
    this.lastAutosave = g.now;
    return this.save('auto');
  }
  slots() {
    return SLOTS.map((slot) => {
      const r = this.read(slot);
      return r ? { slot, savedAt: r.savedAt, playtime: r.playtime, location: r.location, meta: r.meta || null } : { slot, empty: true };
    });
  }
  latest() {
    let best = null;
    for (const s of this.slots()) if (!s.empty && (!best || s.savedAt > best.savedAt)) best = s;
    return best;
  }
  remove(slot) { Storage.remove(PREFIX + slot); }
  _migrate(rec) { return rec; } // version 1 is current; future versions upgrade old records here
  _location() {
    const g = this.game, p = g.player?.position;
    if (!p) return 'Unknown';
    const zone = g.sys('towns').zoneAt?.(p);
    if (zone) return typeof zone === 'string' ? zone : zone.interior && zone.building ? `${zone.name}, indoors` : zone.name; // Part 14: zoneAt returns a record
    if (!g.get('terrain')) return 'Test ground';
    const region = g.sys('terrain').getRegionAt?.(p.x, p.z);
    return region ? WORLD.regions[region]?.name || region[0].toUpperCase() + region.slice(1) : `${Math.round(p.x)}, ${Math.round(p.z)}`;
  }
}
