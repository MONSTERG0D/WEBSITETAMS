import * as THREE from 'three';
import { WEAPONS } from '../data/weapons.js';

/**
 * Weapons carried by one human (Part 6): which guns are owned, rounds in each magazine, the equipped weapon,
 * drawing and holstering (models move between the hand, the hip and the back), rate of fire, reloading from an
 * ammo source and the moving parts (revolver hammer and cylinder, repeater lever, shotgun barrels breaking open,
 * rolling block, bow string). The player's arsenal is driven by CombatSystem; Part 7 NPCs reuse the same class.
 */
export const TUNING = {
  drawTime: { pistol: 0.36, long: 0.5, bow: 0.5, melee: 0.25, tool: 0.25 },
  holsterTime: { pistol: 0.45, long: 0.55, bow: 0.5, melee: 0.3, tool: 0.3 },
  leverTime: 0.32, hammerTime: 0.12, cylinderTime: 0.1, nockTime: 0.9,
  backSlots: [ // offsets in the 'back' attach frame (slung diagonally across the back, muzzle up over the shoulder)
    { p: [0.0, 0.02, 0.06], r: [Math.PI, 0, -0.15], slide: 0.42 },
    { p: [0.05, 0.05, 0.1], r: [Math.PI, 0.1, 0.32], slide: 0.36 },
  ],
  hip: { revolver: { p: [0, 0.02, 0.03], r: [0, Math.PI, 0] }, knife: { p: [-0.36, 0.05, 0.0], r: [0, Math.PI, 0.15] }, lasso: { p: [-0.43, 0.02, -0.02], r: [Math.PI / 2, 0, Math.PI / 2] } },
};

/** pistol | long | bow | melee | tool — how a weapon is held and animated. */
export function weaponClass(id) {
  const w = WEAPONS[id];
  if (!w) return null;
  if (w.melee) return 'melee';
  if (w.tool) return 'tool';
  if (id === 'bow') return 'bow';
  return id === 'revolver' ? 'pistol' : 'long';
}
/** Human aim state per class. */
export const AIM_STATE = { pistol: 'aimPistol', long: 'aimRifle', bow: 'aimBow', melee: 'block', tool: 'aimPistol' };
/** Recoil profile name for HumanAnimator.fire(). */
export const RECOIL = { revolver: 'pistol', repeater: 'rifle', shotgun: 'shotgun', rifle: 'rifle', bow: 'bow' };

const _q = new THREE.Quaternion(), _e = new THREE.Euler();

export class Arsenal {
  /**
   * @param {{ buildModel(id): object, ammoCount(ammoId): number, takeAmmo(ammoId, n): number }} source shared models and ammo
   * @param {object} human a Human (characters system)
   */
  constructor(source, human) {
    this.source = source; this.human = human;
    this.owned = new Set(); this.mags = {}; this.models = {};
    this.current = null; this.drawn = false; this.state = 'idle'; this.t = 0; this.cool = 0;
    this.draw01 = 0; // bow draw (0..1)
    this._anims = []; // { obj, prop, from, to, t, dur }
    this.lastLong = null; this.prevLong = null;
    this.unarmed = false; // Added in Part 6: holstered on purpose → fists (aim guards, fire punches)
  }

  /** Adds a weapon (full magazine). */
  give(id, { fill = true } = {}) {
    if (!WEAPONS[id] || this.owned.has(id)) return false;
    this.owned.add(id); this.mags[id] = fill ? WEAPONS[id].mag : 0;
    if (!this.current) this.current = id;
    if (weaponClass(id) === 'long' || id === 'bow') this._noteLong(id);
    this.refreshSlots();
    return true;
  }
  remove(id) {
    if (!this.owned.has(id)) return;
    this.owned.delete(id); const m = this.models[id];
    if (m) { m.root.removeFromParent(); delete this.models[id]; }
    if (this.current === id) { this.current = this.owned.values().next().value || null; this.drawn = false; }
    this.refreshSlots();
  }
  get weapon() { return this.current ? WEAPONS[this.current] : null; }
  get cls() { return weaponClass(this.current); }
  get rounds() { return this.current ? this.mags[this.current] ?? 0 : 0; }
  get busy() { return this.state === 'drawing' || this.state === 'holstering' || this.state === 'reloading'; }
  reserve(id = this.current) { const w = WEAPONS[id]; return w?.ammo ? this.source.ammoCount(w.ammo) : Infinity; }

  model(id) {
    if (!this.models[id]) { const m = this.source.buildModel(id); if (!m) return null; this.models[id] = m; }
    return this.models[id];
  }

  /** Switch weapons; if one was in hand the new one is drawn after the old one is put away. */
  equip(id) {
    if (!this.owned.has(id)) return false;
    this.unarmed = false;
    if (id === this.current) return false;
    const wasDrawn = this.drawn;
    if (wasDrawn) this.holster(true);
    this.current = id;
    if (this.cls === 'long' || id === 'bow') this._noteLong(id);
    this.refreshSlots();
    if (wasDrawn) this.draw(); // the old one went away instantly; bring the new one up
    return true;
  }
  _noteLong(id) { if (this.lastLong !== id) { this.prevLong = this.lastLong; this.lastLong = id; } }

  draw() {
    if (!this.current || this.drawn || this.state === 'drawing') return false;
    const cls = this.cls;
    this.state = 'drawing'; this.t = TUNING.drawTime[cls] ?? 0.4;
    if (cls === 'pistol') this.human?.setState('draw');
    this._swapAt = this.t * 0.45; // the model jumps from holster to hand partway through
    return true;
  }
  holster(instant = false) {
    if (!this.drawn && this.state !== 'drawing') return false;
    const cls = this.cls;
    if (instant) { this.drawn = false; this.state = 'idle'; this.refreshSlots(); return true; }
    this.state = 'holstering'; this.t = TUNING.holsterTime[cls] ?? 0.4; this._swapAt = this.t * 0.45;
    if (cls === 'pistol') this.human?.setState('holster');
    return true;
  }

  /** Can the current weapon shoot right now? (Doesn't consume anything.) */
  canFire() { return this.drawn && this.state === 'ready' && this.cool <= 0 && this.rounds > 0; }
  /** Consumes a round and animates the gun. Returns false when it can't fire (empty → dry fire is the caller's job). */
  fire() {
    if (!this.canFire()) return false;
    const id = this.current, w = WEAPONS[id], m = this.models[id];
    this.mags[id]--; this.cool = 1 / (w.rate || 1);
    this.human?.setState('fire', { weapon: RECOIL[id] || 'pistol', strength: id === 'shotgun' ? 1.2 : 1 });
    if (m) {
      const P = m.parts;
      if (P.cylinder) this._anim(P.cylinder.rotation, 'z', P.cylinder.rotation.z, P.cylinder.rotation.z + Math.PI / 3, TUNING.cylinderTime);
      if (P.hammer) { this._anim(P.hammer.rotation, 'x', -0.5, 0, TUNING.hammerTime); }
      if (P.lever && this.mags[id] > 0) this._lever(m);
    }
    if (id === 'bow') { this.draw01 = 0; this.state = 'nocking'; this.t = TUNING.nockTime; }
    return true;
  }
  /** Starts a reload if there's room in the magazine and ammo to put in it. */
  reload() {
    const id = this.current, w = this.weapon;
    if (!w || !w.mag || !this.drawn || this.busy || this.state === 'nocking') return false;
    if (this.mags[id] >= w.mag || this.reserve() <= 0) return false;
    this.state = 'reloading'; this.t = w.reload; this._reloadTotal = w.reload;
    if (id !== 'bow') this.human?.setState('reload', { speed: 1.6 / w.reload });
    const P = this.models[id]?.parts;
    if (P?.barrels) this._anim(P.barrels.rotation, 'x', 0, -0.55, 0.3);
    if (P?.block) { this._anim(P.block.rotation, 'x', 0, 1.1, 0.25); this._anim(P.hammer.rotation, 'x', 0, 0.6, 0.2); }
    if (P?.cylinder) this._anim(P.cylinder.rotation, 'z', P.cylinder.rotation.z, P.cylinder.rotation.z + Math.PI * 2, w.reload * 0.8);
    return true;
  }
  _finishReload() {
    const id = this.current, w = WEAPONS[id];
    const want = w.mag - this.mags[id], got = this.source.takeAmmo(w.ammo, want);
    this.mags[id] += got;
    const P = this.models[id]?.parts;
    if (P?.barrels) this._anim(P.barrels.rotation, 'x', -0.55, 0, 0.18);
    if (P?.block) { this._anim(P.block.rotation, 'x', 1.1, 0, 0.18); this._anim(P.hammer.rotation, 'x', 0.6, 0, 0.15); }
    this.state = 'ready';
    return got;
  }
  _lever(m) {
    const L = m.parts.lever;
    this._anim(L.rotation, 'x', 0, 0.9, TUNING.leverTime * 0.5, () => this._anim(L.rotation, 'x', 0.9, 0, TUNING.leverTime * 0.5));
  }
  _anim(obj, prop, from, to, dur, done = null) { this._anims = this._anims.filter((a) => !(a.obj === obj && a.prop === prop)); this._anims.push({ obj, prop, from, to, t: 0, dur, done }); obj[prop] = from; }

  /** Advance timers and animations. Returns an event name when something completes ('drawn', 'holstered', 'reloaded'). */
  update(dt) {
    let ev = null;
    this.cool = Math.max(0, this.cool - dt);
    for (let i = this._anims.length - 1; i >= 0; i--) {
      const a = this._anims[i]; a.t += dt; const k = Math.min(1, a.t / a.dur), e = k * k * (3 - 2 * k);
      a.obj[a.prop] = a.from + (a.to - a.from) * e;
      if (k >= 1) { this._anims.splice(i, 1); a.done?.(); }
    }
    if (this.state === 'drawing' || this.state === 'holstering') {
      const before = this.t; this.t -= dt;
      if (before > this._swapAt && this.t <= this._swapAt) { this.drawn = this.state === 'drawing'; this.refreshSlots(); }
      if (this.t <= 0) {
        if (this.state === 'drawing') { this.state = 'ready'; ev = 'drawn'; }
        else { this.state = 'idle'; ev = 'holstered'; if (this._pendingDraw) { this._pendingDraw = false; this.draw(); } }
      }
    } else if (this.state === 'reloading') {
      this.t -= dt;
      if (this.t <= 0) { this._finishReload(); ev = 'reloaded'; }
    } else if (this.state === 'nocking') {
      this.t -= dt;
      if (this.t <= 0) { // the next arrow comes straight from the quiver
        const id = this.current;
        if (id === 'bow' && this.mags[id] <= 0) this.mags[id] += this.source.takeAmmo(WEAPONS[id].ammo, 1);
        this.state = 'ready'; ev = 'nocked';
      }
    } else if (this.drawn && this.state === 'idle') this.state = 'ready';
    return ev;
  }

  /** Puts each model where it belongs: the current one in hand when drawn, the rest on hip and back. */
  refreshSlots() {
    const h = this.human;
    if (!h) return;
    const back = [...this.owned].filter((id) => weaponClass(id) === 'long' || id === 'bow');
    back.sort((a, b) => (b === this.lastLong) - (a === this.lastLong) || (b === this.prevLong) - (a === this.prevLong));
    const shown = new Set(back.slice(0, 2));
    if (this.drawn && shown.has(this.current) === false && back.length > 2) shown.add(back[2]);
    let slot = 0;
    for (const id of this.owned) {
      const m = this.model(id);
      if (!m) continue;
      const inHand = this.drawn && id === this.current;
      const cls = weaponClass(id);
      if (inHand) { this._put(m, h.getAttach(cls === 'bow' ? 'handL' : 'handR'), [0, 0, 0], [0, 0, 0]); continue; }
      if (cls === 'pistol' || cls === 'melee' || cls === 'tool') {
        const d = TUNING.hip[id] || TUNING.hip.revolver;
        this._put(m, h.getAttach('hip'), d.p, d.r);
      } else if (shown.has(id) && slot < TUNING.backSlots.length) {
        const s = TUNING.backSlots[slot++];
        this._put(m, h.getAttach('back'), s.p, s.r);
        if (id === 'bow') m.root.rotateX(Math.PI / 2); // the bow's limbs run along Y; lay them along the sling
        else m.root.translateZ(s.slide || 0); // along the gun: stock down by the hip, muzzle over the shoulder
      } else m.root.removeFromParent();
    }
  }
  _put(m, parent, p, r) {
    if (!parent) return;
    if (m.root.parent !== parent) parent.add(m.root);
    m.root.position.fromArray(p); m.root.quaternion.setFromEuler(_e.set(r[0], r[1], r[2]));
    void _q;
  }

  serialize() { return { owned: [...this.owned], mags: { ...this.mags }, current: this.current }; }
  deserialize(d) {
    if (!d) return;
    if (Array.isArray(d.owned)) for (const id of d.owned) this.give(id, { fill: false });
    if (d.mags) for (const [k, v] of Object.entries(d.mags)) if (this.owned.has(k)) this.mags[k] = Math.max(0, Math.min(WEAPONS[k].mag || 0, v | 0));
    if (d.current && this.owned.has(d.current)) this.current = d.current;
    this.drawn = false; this.state = 'idle'; this.refreshSlots();
  }
  dispose() { for (const m of Object.values(this.models)) m.root.removeFromParent(); this.models = {}; }
}
