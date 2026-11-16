import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { ITEMS } from '../data/items.js';
import { SPECIES } from './Animals.js';

/**
 * The 'hunting' system (GAME_BIBLE §11: skin(animal) · peltsOnHorse()). Focus shows the heart-and-lung zone on
 * every animal in range; aiming at one shows its name and natural pelt quality. Fleeing and wounded animals
 * leave hoof and paw prints and, when hit, a trail of dark drops to follow. A carcass is skinned with E: a
 * short fade, then the pelt (quality from the weapon and how clean the kill was) and meat go in the satchel.
 * Big pelts (deer, elk, wolf, bear) ride strapped behind Juniper's saddle, three at most; butchers buy them.
 */
export const TUNING = {
  focusRange: 150, studyRange: 90, skinRadius: 2.4, skinSeconds: 1.4, maxBigPelts: 3,
  printRange: 90, printLife: 150, bloodLife: 180, nearbyPrints: 22,
};
const BIG = new Set(['deer', 'elk', 'wolf', 'bear']);
const PELT_COLORS = { deer: '#8f6a47', elk: '#a5835c', wolf: '#7a7672', bear: '#2a201c', coyote: '#a08868', rabbit: '#a08a70' };
const _v = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export default class Hunting extends System {
  constructor(game) {
    super(game);
    this.carcassHandles = new Map(); this.overlay = null; this.horsePelts = []; this.stats = { skinned: 0, prints: 0, blood: 0 };
  }

  async init() {
    const g = this.game, vfx = g.sys('vfx');
    vfx.define?.('blood_drop', { minTier: 'low', decal: { frame: 'dot', size: [0.035, 0.07], life: TUNING.bloodLife, fade: 30, alpha: 0.85, color: 0x4a0c08 } });
    vfx.define?.('track_hoof', { minTier: 'low', decal: { frame: 'hoofprint', size: [0.09, 0.12], life: TUNING.printLife, fade: 25, alpha: 0.75, color: 0x2e2216 } });
    vfx.define?.('track_paw', { minTier: 'low', decal: { frame: 'dot', size: [0.05, 0.07], life: TUNING.printLife, fade: 25, alpha: 0.7, color: 0x2e2216 } });
    g.events.on(EVENTS.ANIMAL_KILLED, ({ animal }) => this._registerCarcass(animal));
    g.events.on(EVENTS.ITEM_ADDED, ({ id }) => { if (ITEMS[id]?.category === 'pelt') this._refreshHorse(); });
    g.events.on(EVENTS.ITEM_REMOVED, ({ id }) => { if (ITEMS[id]?.category === 'pelt') this._refreshHorse(); });
    g.events.on(EVENTS.GAME_LOADED, () => this._refreshHorse());
    g.events.on(EVENTS.GAME_START, () => { for (const h of this.carcassHandles.values()) g.interact.unregister(h); this.carcassHandles.clear(); this._refreshHorse(); });
    this._peltMat = new THREE.MeshStandardMaterial({ vertexColors: false, color: 0xffffff, roughness: 0.95, map: g.get('horses')?.atlas?.map || null });
    this._peltGeo = (() => { const geo = new THREE.CylinderGeometry(0.11, 0.11, 0.62, 10, 1); geo.rotateZ(Math.PI / 2); return geo; })();
    g.debug?.addTuning('Hunting', TUNING);
    this._refreshHorse();
  }

  get wildlife() { return this.game.get('wildlife'); }

  // ---------------------------------------------------------------- Bible API
  /**
   * Skins a carcass (or collects a bird): fade, pelt and meat into the satchel. @returns {Promise<boolean>}
   */
  async skin(animal) {
    const g = this.game, pl = g.player, S = animal?.def;
    if (!animal || animal.alive || animal.skinned || !S || this._busy) return false;
    if (pl.state !== 'onFoot') { g.ui.notify('Get down off your horse first.'); return false; }
    const big = BIG.has(S.pelt);
    if (big && this.bigPeltCount() >= TUNING.maxBigPelts) { g.ui.notify(`${this._horseName()} can't carry another big pelt. Sell some at a butcher.`, { duration: 3.5 }); return false; }
    this._busy = true; pl.busy = true;
    pl.yaw = Math.atan2(animal.position.x - pl.position.x, animal.position.z - pl.position.z) + Math.PI;
    pl.human?.setState(S.bird ? 'carry' : 'skin');
    g.audio.play('skinning', { position: animal.position });
    await g.ui.fade(true, 0.45);
    await new Promise((r) => setTimeout(r, TUNING.skinSeconds * 1000 * 0.5));
    const inv = g.sys('inventory'), got = [];
    if (S.pelt) { const id = `pelt_${S.pelt}_${animal.quality || 1}`; inv.add(id, 1); got.push(ITEMS[id]?.name || id); }
    if (S.meat) { inv.add(S.meat[0], S.meat[1]); got.push(`${ITEMS[S.meat[0]]?.name || S.meat[0]}${S.meat[1] > 1 ? ' ×' + S.meat[1] : ''}`); }
    animal.skinned = true; animal.deadT = Math.max(animal.deadT, 1);
    if (S.pelt) animal.object3d.scale.set(1, 0.82, 1); // the hide is gone; what's left lies lower
    this._unregisterCarcass(animal);
    this.stats.skinned++;
    g.events.emit(EVENTS.HUNTING_SKINNED, { species: animal.species, quality: animal.quality || 0 });
    await g.ui.fade(false, 0.45);
    pl.human?.setState('idle', { fade: 0.25 });
    pl.busy = false; this._busy = false;
    if (got.length) g.ui.notify(got.join(' · '), { duration: 3 });
    return true;
  }
  /** The big pelts Juniper carries (deer, elk, wolf, bear), in satchel order: [{ species, quality, id }]. */
  peltsOnHorse() {
    const out = [];
    for (const { id, qty, def } of this.game.sys('inventory').list('pelt')) if (BIG.has(def?.species)) for (let i = 0; i < qty; i++) out.push({ species: def.species, quality: def.quality, id });
    return out.slice(0, TUNING.maxBigPelts);
  }
  bigPeltCount() { let n = 0; for (const { qty, def } of this.game.sys('inventory').list('pelt')) if (BIG.has(def?.species)) n += qty; return n; }

  // ---------------------------------------------------------------- tracks
  /** Wildlife calls this on each stride: prints when the animal is running scared or hurt, and near the player. */
  onStep(a) {
    const S = a.def; if (S.bird) return;
    const pl = this.game.player.position, d = a.position.distanceTo(pl);
    if (d > TUNING.printRange) return;
    const scared = a.state === 'flee' || a.state === 'wounded' || a.bleed > 0;
    if (!scared && d > TUNING.nearbyPrints) return;
    a._side = -(a._side || 1);
    const off = S.look.shape.width * 0.45 * a._side;
    _p.set(a.position.x + Math.cos(a.yaw) * off, 0, a.position.z - Math.sin(a.yaw) * off);
    _p.y = this.game.sys('terrain').getHeightAt(_p.x, _p.z) + 0.02;
    const hoof = S.pelt === 'deer' || S.pelt === 'elk', size = Math.max(0.05, S.look.shape.width * (hoof ? 0.75 : 0.55));
    this.game.sys('vfx').decal(hoof ? 'track_hoof' : 'track_paw', { position: _p, size, angle: a.yaw + Math.PI });
    this.stats.prints++;
    if (a.bleed > 0 && Math.random() < 0.5) this.bloodDrop(a);
  }
  /** A drop of blood beside a wounded animal's trail. */
  bloodDrop(a) {
    _p.set(a.position.x + (Math.random() - 0.5) * 0.4, 0, a.position.z + (Math.random() - 0.5) * 0.4);
    _p.y = this.game.sys('terrain').getHeightAt(_p.x, _p.z) + 0.025;
    this.game.sys('vfx').decal('blood_drop', { position: _p });
    this.stats.blood++;
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.game, W = this.wildlife; if (!W) return;
    const focus = g.get('focus'), combat = g.get('combat'), pl = g.player.position;
    const show = !!(focus?.active && combat?.isAiming);
    for (const a of W.list) a.rig.vital.visible = show && a.alive && a.position.distanceTo(pl) < TUNING.focusRange;
    // studying: aiming at an animal names it and its pelt
    const hit = combat?.isAiming ? combat.aimHit : null, e = hit?.entity;
    if (e?.type === 'animal' && e.animal?.alive && e.animal.position.distanceTo(pl) < TUNING.studyRange) {
      const a = e.animal, S = a.def;
      g.ui.prompt('hunt-study', `${S.name}${S.pelt ? ' · ' + '★'.repeat(a.natural) + '☆'.repeat(3 - a.natural) : ''}${a.state === 'alert' ? ' · alert' : ''}`, '');
      this._studying = true;
    } else if (this._studying) { g.ui.clearPrompt('hunt-study'); this._studying = false; }
    if (this.overlay) this._drawOverlay();
  }

  // ---------------------------------------------------------------- carcass interactions
  _registerCarcass(a) {
    const S = a.def;
    if (!S.pelt && !S.meat) return;
    const g = this.game;
    const h = g.interact.register({
      object: a.object3d, radius: TUNING.skinRadius, priority: 0.6,
      label: () => (S.pelt ? `Skin the ${S.name.toLowerCase()} (${'★'.repeat(a.quality || 1)})` : `Collect the ${S.name.toLowerCase()}`),
      condition: (game) => game.player.state === 'onFoot' && !a.skinned,
      onInteract: () => this.skin(a),
    });
    this.carcassHandles.set(a, h);
  }
  _unregisterCarcass(a) { const h = this.carcassHandles.get(a); if (h) { this.game.interact.unregister(h); this.carcassHandles.delete(a); } }
  /** Wildlife removes carcasses far away; drop their prompts too. */
  forget(a) { this._unregisterCarcass(a); }

  // ---------------------------------------------------------------- pelts on the horse
  _horseName() { return this.game.get('horses')?.playerHorse?.name || 'Your horse'; }
  _refreshHorse() {
    const h = this.game.get('horses')?.playerHorse; if (!h) return;
    const list = this.peltsOnHorse();
    h.pelts = list.map((p) => ({ species: p.species, quality: p.quality }));
    const anchor = h.rig?.attach?.pelts; if (!anchor) return;
    for (const m of this.horsePelts) { m.removeFromParent(); m.material.dispose(); }
    this.horsePelts.length = 0;
    list.forEach((p, i) => {
      const m = new THREE.Mesh(this._peltGeo, this._peltMat.clone());
      m.material.color.set(PELT_COLORS[p.species] || '#8a6a48');
      const r = p.species === 'bear' ? 1.35 : p.species === 'elk' ? 1.15 : 1;
      m.scale.set(1, r, r * 0.8); m.position.set(0, 0.07 + i * 0.13 * r, 0.05 + i * 0.03); m.castShadow = true; m.name = `pelt:${p.species}`;
      anchor.add(m); this.horsePelts.push(m);
    });
  }

  // ---------------------------------------------------------------- debug overlay (pelt quality, state, awareness)
  /** Shows a label over each animal: species, natural pelt quality, AI state and awareness. */
  setOverlay(on) {
    if (on && !this.overlay) { this.overlay = document.createElement('div'); this.overlay.className = 'sd-hunt-overlay'; Object.assign(this.overlay.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 20 }); document.body.append(this.overlay); this._labels = new Map(); }
    if (!on && this.overlay) { this.overlay.remove(); this.overlay = null; this._labels = null; }
  }
  _drawOverlay() {
    const g = this.game, cam = g.camera, W = this.wildlife, w = innerWidth, h = innerHeight, seen = new Set();
    for (const a of W.list) {
      if (a.position.distanceTo(g.player.position) > 90) continue;
      _v.copy(a.position); _v.y += a.def.look.shape.height * (a.alive ? 1.35 : 0.6) + 0.25; _v.project(cam);
      if (_v.z > 1) continue;
      let el = this._labels.get(a);
      if (!el) { el = document.createElement('div'); Object.assign(el.style, { position: 'absolute', transform: 'translate(-50%,-100%)', font: '11px/1.2 Georgia, serif', color: '#f4e8cc', textShadow: '0 1px 2px #000', whiteSpace: 'nowrap', textAlign: 'center' }); this.overlay.append(el); this._labels.set(a, el); }
      el.style.left = `${(_v.x * 0.5 + 0.5) * w}px`; el.style.top = `${(-_v.y * 0.5 + 0.5) * h}px`;
      const S = a.def, stars = S.pelt ? '★'.repeat(a.alive ? a.natural : a.quality || 1) : '';
      el.textContent = `${S.name} ${stars} · ${a.alive ? a.state : a.skinned ? 'skinned' : 'carcass'}${a.alive ? ` · ${(a.awareness * 100).toFixed(0)}%` : ''}${a.bleed > 0 && a.alive ? ' · bleeding' : ''}`;
      seen.add(a);
    }
    for (const [a, el] of this._labels) if (!seen.has(a)) { el.remove(); this._labels.delete(a); }
  }

  serialize() { return {}; }
  deserialize() { this._refreshHorse(); }
  dispose() { this.setOverlay(false); for (const m of this.horsePelts) m.removeFromParent(); this._peltGeo?.dispose(); this._peltMat?.dispose(); }
}
