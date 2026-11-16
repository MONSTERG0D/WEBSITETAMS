import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { ENCOUNTERS } from './encounters/index.js';

/**
 * The 'encounters' system (Part 15, GAME_BIBLE §11: trigger(id?) · active). Road encounters while you ride: one
 * every 2–4 minutes in the saddle on average, picked from the pool for the region you're in, never the same type
 * twice running, each on its own cooldown. They never start in a town or outpost zone, during a mission, while
 * you're wanted, or at night for the daytime-only ones. An encounter is a small quiet mission (no title card, no
 * journal page) run by the missions system: it's staged 60–90 m ahead (on the road when you're on one), and it
 * resolves when its step finishes or when you ride on more than 220 m.
 */
export const TUNING = { minRide: 120, maxRide: 240, ahead: [60, 90], leaveRadius: 220, cooldown: 600, enabled: true };

export default class Encounters extends System {
  constructor(game) { super(game); this.active = null; this.ride = 0; this.next = this._roll(); this.last = null; this.cool = {}; this.log = []; this.count = 0; }
  async init() {
    const g = this.game, M = g.get('missions');
    if (!M) return;
    for (const e of ENCOUNTERS) M.register({ ...e, kind: 'encounter', quietEnd: true, noRetry: true, fail: undefined });
    g.events.on(EVENTS.MISSION_COMPLETED, ({ id }) => this._resolved(id, 'done'));
    g.events.on(EVENTS.MISSION_FAILED, ({ id, reason }) => this._resolved(id, reason || 'failed'));
    g.debug?.addTuning('Encounters', TUNING);
  }
  _roll() { return TUNING.minRide + Math.random() * (TUNING.maxRide - TUNING.minRide); }
  /** Starts an encounter now (a specific type, or one from the local pool). @returns {string|null} its id */
  trigger(id = null) {
    const g = this.game, M = g.get('missions'); if (!M || M.active) return null;
    const p = g.player.position, region = g.sys('terrain').getRegionAt?.(p.x, p.z) || 'copperbell', hour = g.sys('sky').timeOfDay ?? 12, night = hour < 6 || hour > 20;
    let def = id ? ENCOUNTERS.find((e) => e.id === id) : null;
    if (!def) {
      const pool = ENCOUNTERS.filter((e) => (!e.regions || e.regions.includes(region)) && e.id !== this.last && (this.cool[e.id] || 0) <= g.now && !(e.day && night) && (!e.requires || e.requires(M.flags, g)));
      if (!pool.length) return null;
      def = pool[Math.floor(Math.random() * pool.length)];
    }
    const at = this._spot();
    if (!M.start(def.id, { skipCard: true, data: { at, center: at.clone() } })) return null;
    this.active = def.id; this.last = def.id; this.cool[def.id] = g.now + TUNING.cooldown; this.count++;
    this.log.unshift(`${def.id} @ ${Math.round(at.x)},${Math.round(at.z)}`);
    g.events.emit(EVENTS.ENCOUNTER_STARTED, { id: def.id });
    return def.id;
  }
  /** Where to stage it: ahead of Eli, on the road if he's riding one. */
  _spot() {
    const g = this.game, pl = g.player, T = g.sys('terrain'), yaw = pl.yaw ?? 0, d = TUNING.ahead[0] + Math.random() * (TUNING.ahead[1] - TUNING.ahead[0]);
    let x = pl.position.x - Math.sin(yaw) * d, z = pl.position.z - Math.cos(yaw) * d;
    for (const r of T.roads || []) { const P = r.points; let best = Infinity, bx = 0, bz = 0; for (let i = 0; i < P.length; i += 9) { const q = (P[i] - x) ** 2 + (P[i + 2] - z) ** 2; if (q < best) { best = q; bx = P[i]; bz = P[i + 2]; } } if (best < 40 * 40) { x = bx; z = bz; break; } }
    x = Math.max(-980, Math.min(980, x)); z = Math.max(-980, Math.min(980, z));
    return new THREE.Vector3(x, T.getHeightAt(x, z), z);
  }
  update(dt) {
    const g = this.game, M = g.get('missions'), pl = g.player;
    if (!M) return;
    if (this.active) {
      const c = M.runner?.ctx?.data?.center;
      if (M.active?.id !== this.active) { this.active = null; return; }
      if (c && pl.position.distanceTo(c) > TUNING.leaveRadius) { M.complete(); }
      return;
    }
    if (!TUNING.enabled || g.state !== 'playing' || pl.state !== 'mounted') return;
    const speed = Math.hypot(pl.velocity.x, pl.velocity.z); if (speed < 2) return;
    this.ride += dt;
    if (this.ride < this.next) return;
    const zone = g.get('towns')?.zone, law = g.get('law');
    if (zone || M.active || law?.isWanted?.()) { this.ride = this.next - 15; return; }
    if (this.trigger()) { this.ride = 0; this.next = this._roll(); } else this.ride = this.next - 20;
  }
  _resolved(id, outcome) { if (id !== this.active) return; this.active = null; this.game.events.emit(EVENTS.ENCOUNTER_RESOLVED, { id, outcome }); }
  serialize() { return { cool: {}, count: this.count }; }
  deserialize(d) { this.count = d?.count || 0; }
}
