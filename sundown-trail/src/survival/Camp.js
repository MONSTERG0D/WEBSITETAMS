import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { WORLD } from '../data/world.js';
import { buildCookScreen } from './Cooking.js';

/**
 * The 'camp' system (GAME_BIBLE §6/§9/§11: canCamp() · make() · breakCamp() · sleep(hours)). Hold B in the open
 * — not in a town or outpost, not with enemies or predators close, not while wanted — to pitch a canvas tent
 * with a bedroll, a ring of stones with a crackling fire (flames, embers and smoke through vfx, a flickering
 * light), a spit and a log to sit on. At the fire: sit, cook, eat. At the bedroll: sleep 2–12 hours (time
 * skips, cores refill, autosave, the horse is grazing nearby when you wake). The camp is where you respawn.
 * Hold B again near it (or ride far away) to pack it up.
 */
export const TUNING = {
  holdSeconds: 0.7, hostileRange: 70, townMargin: 35, maxSlope: 0.86, packUpDistance: 400, breakRange: 25,
  light: { color: 0xff9448, intensity: 10, distance: 13, flicker: 0.3 },
};
const _v = new THREE.Vector3();
const HOURS = [2, 4, 6, 8, 12];

export default class Camp extends System {
  constructor(game) { super(game); this.camp = null; this._hold = 0; this._handles = []; this._mats = null; }

  async init() {
    const g = this.game, vfx = g.sys('vfx');
    if (!vfx.defs?.has?.('fire_small')) vfx.define?.('fire_small', { parts: [
      { pool: 'additive', rate: 22, prewarm: true, duration: Infinity, frame: 'glow', life: [0.3, 0.6], speed: [0.25, 0.6], spread: 0.25, radius: 0.12, vel: [0, 1.1, 0], size: [[0.34, 0.46], [0.05, 0.1]], color: [0xffd27a, 0xff5a1a], alpha: [0.9, 0], wind: 0.2 },
      { pool: 'additive', rate: 6, duration: Infinity, frame: 'glow', life: [0.5, 0.9], speed: [0.05, 0.15], spread: 0.6, vel: [0, 0.3, 0], size: [[0.6, 0.8], [0.3, 0.4]], color: [0xff8a30, 0xff3a10], alpha: [0.35, 0] },
    ] });
    if (!vfx.defs?.has?.('embers')) vfx.define?.('embers', { parts: [
      { pool: 'additive', rate: 5, duration: Infinity, frame: 'dot', life: [1.2, 2.8], speed: [0.4, 1.2], spread: 0.5, vel: [0, 1.4, 0], size: 0.018, color: [0xffc070, 0xff4010], alpha: [1, 0], drag: 0.3, wind: 0.6, pulse: true },
    ] });
    if (!vfx.defs?.has?.('campfire_smoke')) vfx.define?.('campfire_smoke', { parts: [
      { pool: 'alpha', rate: 1.6, prewarm: true, duration: Infinity, frame: 'smokeB', frames: 2, life: [4, 7], speed: [0.15, 0.35], spread: 0.25, vel: [0, 0.85, 0], size: [[0.3, 0.45], [1.4, 2.2]], spin: [-0.2, 0.2], color: 0x8a847c, alpha: [0.24, 0], fadeIn: 0.15, drag: 0.4, wind: 0.8, lit: true },
    ] });
    g.ui.registerScreen('cook', { build: () => buildCookScreen(this) });
    g.ui.registerScreen('sleep', { build: () => this._buildSleep() });
    g.events.on(EVENTS.GAME_START, ({ newGame } = {}) => { if (newGame) this.breakCamp(); });
    g.debug?.addTuning('Camp', TUNING);
  }

  // ---------------------------------------------------------------- Bible API
  /** @returns {{ ok: boolean, reason?: string }} whether a camp can be made where Eli stands */
  canCamp() {
    const g = this.game, pl = g.player, p = pl.position, T = g.sys('terrain');
    if (pl.state === 'dead') return { ok: false, reason: '' };
    if (pl.state === 'mounted') return { ok: false, reason: 'Get down off your horse to make camp.' };
    const zone = g.get('towns')?.zone;
    if (zone && (zone.town !== 'ranch' || zone.interior)) return { ok: false, reason: zone.interior ? "You can't make camp indoors." : "You can't make camp in town." }; // the ranch yard is fine (Part 13)
    for (const L of Object.values(WORLD.locations)) if (['town', 'outpost', 'estate', 'hideout', 'camp'].includes(L.type) && Math.hypot(p.x - L.x, p.z - L.z) < L.radius + TUNING.townMargin) return { ok: false, reason: "You can't make camp here. Ride out a ways." };
    if (g.get('law')?.isWanted?.()) return { ok: false, reason: 'Not with the law on your trail.' };
    if (this._danger()) return { ok: false, reason: 'Not with danger this close.' };
    if (T.isWater?.(p.x, p.z)) return { ok: false, reason: 'Find drier ground.' };
    const n = T.getNormalAt?.(p.x, p.z, _v);
    if (n && n.y < TUNING.maxSlope) return { ok: false, reason: 'Find flatter ground.' };
    return { ok: true };
  }
  /** Pitches camp in front of Eli. @returns {boolean} */
  make() {
    const g = this.game, chk = this.canCamp();
    if (!chk.ok) { if (chk.reason) g.ui.notify(chk.reason); return false; }
    this.breakCamp(true);
    const pl = g.player, yaw = g.cameraRig?.yaw ?? pl.yaw;
    const fx = pl.position.x - Math.sin(yaw) * 2.2, fz = pl.position.z - Math.cos(yaw) * 2.2;
    this._build(fx, fz, yaw);
    pl.spawn.set(fx + Math.sin(yaw) * 2.2, 0, fz + Math.cos(yaw) * 2.2);
    g.audio.play('camp_make', { position: this.camp.fire });
    g.events.emit(EVENTS.CAMP_MADE, { position: this.camp.fire.clone() });
    g.ui.notify('Camp made. Sit by the fire to cook; sleep in the bedroll.', { duration: 3.5 });
    return true;
  }
  /** Packs the camp away (no-op without one). */
  breakCamp(silent = false) {
    const c = this.camp; if (!c) return;
    for (const h of c.fx) h.stop();
    for (const h of this._handles) this.game.interact.unregister(h);
    for (const col of c.colliders) this.game.physics.removeCollider(col);
    c.group.removeFromParent(); c.light.dispose?.();
    c.group.traverse((o) => { if (o.isMesh && o.geometry && !o.userData.shared) o.geometry.dispose(); });
    this._handles.length = 0; this.camp = null;
    if (this.sitting) this._stand();
    if (!silent) this.game.ui.notify('Camp packed up.');
  }
  /** Sleeps at camp (or anywhere, from the screen): fade, skip time, refill, autosave. */
  async sleep(hours = 8) {
    const g = this.game, sky = g.sys('sky'), h0 = sky.timeOfDay ?? 12, pl = g.player;
    if (this._sleeping) return false;
    this._sleeping = true;
    if (this.sitting) this._stand();
    pl.human?.setState('sleep');
    await g.ui.fade(true, 1.1);
    let t = h0 + hours;
    if (t >= 24) { t -= 24; sky.day = (sky.day || 1) + 1; }
    sky.setTime(t);
    g.events.emit(EVENTS.CAMP_SLEPT, { hours });
    if (this.camp) {
      const b = this.camp.bed; pl.teleport(b.x + 0.9, b.z); pl.spawn.set(b.x + 0.9, 0, b.z);
      const horse = g.get('horses')?.playerHorse;
      if (horse && horse.alive !== false && !horse.rider) { const hs = g.get('horses'); hs.placeNearPlayer?.(horse, 6); }
    }
    g.save?.autosave?.(true);
    pl.human?.setState('idle', { fade: 0.6 });
    await g.ui.fade(false, 1.1);
    const hh = Math.floor(t), mm = Math.round((t % 1) * 60);
    g.ui.notify(`You slept ${hours} hours. ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}.`, { duration: 3 });
    this._sleeping = false;
    return true;
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.game, input = g.input, pl = g.player;
    if (g.state === 'playing' && !g.ui.isScreenOpen()) {
      if (input.isDown('camp')) {
        this._hold += dt;
        if (this._hold >= TUNING.holdSeconds && !this._held) {
          this._held = true;
          if (this.camp && this.camp.fire.distanceTo(pl.position) < TUNING.breakRange) this.breakCamp();
          else this.make();
        }
      } else { this._hold = 0; this._held = false; }
    }
    if (this.sitting && !g.ui.isScreenOpen() && (input.pressed('jump') || Math.hypot(input.move?.x || 0, input.move?.y || 0) > 0.5)) this._stand();
    const c = this.camp; if (!c) return;
    // flicker: two noise-ish sines and a little randomness
    c.t += dt;
    const f = 1 + TUNING.light.flicker * (Math.sin(c.t * 9.1) * 0.45 + Math.sin(c.t * 23.7 + 1.3) * 0.3 + (Math.random() - 0.5) * 0.5);
    c.light.intensity = TUNING.light.intensity * f;
    c.light.position.set(c.fire.x + Math.sin(c.t * 5.3) * 0.05, c.fire.y + 0.55 + Math.sin(c.t * 7.7) * 0.04, c.fire.z);
    if (c.fire.distanceTo(pl.position) > TUNING.packUpDistance) this.breakCamp(true);
  }

  _danger() {
    const g = this.game, p = g.player.position, R = TUNING.hostileRange;
    for (const n of g.get('npcs')?.list || []) if (!n.dead && ['fight', 'alert', 'search', 'investigate'].includes(n.brain?.state) && n.position.distanceTo(p) < R) return true;
    for (const a of g.get('wildlife')?.list || []) if (a.alive && a.isPredator && ['stalk', 'circle', 'charge', 'attack', 'bluff', 'hesitate'].includes(a.state) && a.position.distanceTo(p) < R) return true;
    return false;
  }

  _sit() {
    const g = this.game, pl = g.player, c = this.camp; if (!c) return;
    pl.teleport(c.seat.x, c.seat.z); pl.yaw = Math.atan2(c.fire.x - c.seat.x, c.fire.z - c.seat.z) + Math.PI;
    this.sitting = true; pl.busy = true; pl.velocity?.set(0, 0, 0);
    pl.human?.setState('sit', { ground: false });
  }
  _stand() { const pl = this.game.player; if (!this.sitting) return; this.sitting = false; pl.busy = false; pl.human?.setState('idle', { fade: 0.3 }); }

  // ---------------------------------------------------------------- building the camp
  _materials() {
    if (this._mats) return this._mats;
    const tex = (draw, rep = 1) => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); draw(x); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const canvas = tex((x) => { x.fillStyle = '#d2c6a6'; x.fillRect(0, 0, 128, 128); for (let i = 0; i < 128; i += 3) { x.fillStyle = 'rgba(0,0,0,0.05)'; x.fillRect(i, 0, 1, 128); x.fillRect(0, i, 128, 1); } for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(90,70,40,${Math.random() * 0.12})`; x.fillRect(Math.random() * 128, Math.random() * 128, 10 + Math.random() * 30, 6 + Math.random() * 20); } }, 2);
    const blanket = tex((x) => { const b = ['#7a1e18', '#e8dcc0', '#1e2a44', '#b8742a', '#e8dcc0', '#7a1e18']; b.forEach((c, i) => { x.fillStyle = c; x.fillRect(0, i * 128 / 6, 128, 128 / 6); }); });
    const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.95, ...o });
    this._mats = { canvas: M({ map: canvas, side: THREE.DoubleSide }), blanket: M({ map: blanket }), wood: M({ color: 0x5a4030 }), bark: M({ color: 0x3e2e22 }), stone: M({ color: 0x77736c, flatShading: true }), ash: M({ color: 0x1e1a18 }), char: M({ color: 0x2a1c14, emissive: 0xff4010, emissiveIntensity: 0.35 }) };
    return this._mats;
  }
  _build(fx, fz, yaw) {
    const g = this.game, T = g.sys('terrain'), M = this._materials(), group = new THREE.Group(); group.name = 'Camp';
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // local frame: +lz runs on in the direction Eli was looking, so the tent stands beyond the fire, the log to one side
    const at = (lx, lz, out = new THREE.Vector3()) => { const x = fx + lx * c - lz * s, z = fz - lx * s - lz * c; return out.set(x, T.getHeightAt(x, z), z); }; // lz runs away from Eli
    const mesh = (geo, mat, p, ry = 0, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.copy(p); m.rotation.set(rx, yaw + ry, rz, 'YXZ'); m.castShadow = true; m.receiveShadow = true; group.add(m); return m; };
    const fire = at(0, 0), colliders = [];
    // fire ring: stones, ash, crossed logs, a spit on forked sticks
    const stone = new THREE.DodecahedronGeometry(0.13, 0);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const m = mesh(stone, M.stone, _v.set(fire.x + Math.cos(a) * 0.55, fire.y + 0.06, fire.z + Math.sin(a) * 0.55), a, 0.3 * i, 0); m.scale.set(1 + (i % 3) * 0.2, 0.7, 1); }
    mesh(new THREE.CylinderGeometry(0.48, 0.5, 0.03, 16), M.ash, _v.copy(fire).setY(fire.y + 0.015));
    for (let i = 0; i < 4; i++) mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.75, 6), i % 2 ? M.char : M.bark, _v.copy(fire).setY(fire.y + 0.12 + (i > 1 ? 0.07 : 0)), (i * Math.PI) / 4, Math.PI / 2 - 0.25, 0);
    for (const sx of [-0.62, 0.62]) { const p = at(sx, 0); mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.85, 5), M.wood, _v.copy(p).setY(p.y + 0.42)); }
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.4, 5), M.wood, _v.copy(fire).setY(fire.y + 0.62), 0, 0, Math.PI / 2);
    colliders.push(g.physics.addCollider({ type: 'cylinder', position: fire.clone().setY(fire.y + 0.2), radius: 0.6, height: 0.4, surface: 'stone', tag: 'campfire' }));
    // A-frame tent behind the fire
    const tent = at(0, 3.4), L = 2.3, W = 1.7, H = 1.35, half = W / 2, slope = Math.hypot(half, H), lean = Math.atan2(half, H);
    const sides = new THREE.BufferGeometry(), hl = L / 2;
    sides.setAttribute('position', new THREE.Float32BufferAttribute([-half, 0, -hl, -half, 0, hl, 0, H, hl, 0, H, -hl, half, 0, -hl, half, 0, hl, 0, H, hl, 0, H, -hl], 3));
    sides.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1].map((v) => v * slope), 2));
    sides.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]); sides.computeVertexNormals(); void lean;
    mesh(sides, M.canvas, tent);
    const back = new THREE.BufferGeometry(); back.setAttribute('position', new THREE.Float32BufferAttribute([-half, 0, 0, half, 0, 0, 0, H, 0], 3)); back.computeVertexNormals();
    mesh(back, M.canvas, at(0, 3.4 + L / 2, new THREE.Vector3()));
    mesh(new THREE.CylinderGeometry(0.025, 0.025, L + 0.3, 5), M.wood, _v.copy(tent).setY(tent.y + H + 0.01), 0, Math.PI / 2, 0);
    for (const sz of [-L / 2 - 0.1, L / 2 + 0.1]) { const p = at(0, 3.4 + sz); mesh(new THREE.CylinderGeometry(0.025, 0.03, H + 0.1, 5), M.wood, _v.copy(p).setY(p.y + (H + 0.1) / 2)); }
    colliders.push(g.physics.addCollider({ type: 'box', position: tent.clone().setY(tent.y + H / 2), size: new THREE.Vector3(W, H, L), rotationY: yaw, surface: 'wood', tag: 'tent' }));
    // bedroll in the tent's mouth, a log to sit on beside the fire
    const bed = at(0.15, 1.85);
    mesh(new THREE.BoxGeometry(0.78, 0.07, 1.85), M.blanket, _v.copy(bed).setY(bed.y + 0.035));
    mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.78, 10), M.blanket, _v.copy(at(0.15, 2.7)).setY(bed.y + 0.13), 0, 0, Math.PI / 2);
    const seat = at(1.5, 0.2);
    mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.5, 9), M.bark, _v.copy(seat).setY(seat.y + 0.2), 0.3, Math.PI / 2, 0);
    colliders.push(g.physics.addCollider({ type: 'box', position: seat.clone().setY(seat.y + 0.2), size: new THREE.Vector3(0.45, 0.4, 1.5), rotationY: yaw + 0.3, surface: 'wood', tag: 'log' }));
    // light and effects
    const light = new THREE.PointLight(TUNING.light.color, TUNING.light.intensity, TUNING.light.distance, 2); light.castShadow = false; light.position.copy(fire).setY(fire.y + 0.55); group.add(light);
    g.scene.add(group);
    const vfx = g.sys('vfx'), base = fire.clone().setY(fire.y + 0.1);
    const fxs = [vfx.spawn('fire_small', { position: base }), vfx.spawn('embers', { position: base.clone().setY(base.y + 0.2) }), vfx.spawn('campfire_smoke', { position: base.clone().setY(base.y + 0.6) }), vfx.spawn('lamp_glow', { position: base.clone().setY(base.y + 0.3), color: 0xff7a30, scale: 1.6, flicker: 0.4, intensity: 2.4 })];
    const snd = g.audio.play('campfire', { position: fire, loop: true, volume: 0.8 });
    if (snd?.stop) fxs.push({ stop: () => snd.stop(0.5) });
    this.camp = { group, fire, tent, bed, seat: seat.clone(), yaw, light, fx: fxs, colliders, t: 0 };
    // interactions
    const I = g.interact, sitting = () => this.sitting;
    this._handles.push(
      I.register({ position: fire, radius: 2.4, priority: 0.4, label: () => (sitting() ? 'Cook and eat' : 'Sit by the fire'), onInteract: () => { if (sitting()) g.ui.openScreen('cook'); else this._sit(); } }),
      I.register({ position: bed, radius: 1.7, priority: 0.45, label: 'Sleep', condition: (gg) => gg.player.state === 'onFoot', onInteract: () => g.ui.openScreen('sleep') }),
      I.register({ position: tent, radius: 2.4, priority: 0.1, label: 'Pack up camp', condition: (gg) => gg.player.state === 'onFoot', onInteract: () => this.breakCamp() }),
    );
  }

  _buildSleep() {
    const g = this.game, ui = g.ui, sky = g.sys('sky'), wrap = document.createElement('div');
    wrap.className = 'sd-panel sd-menu-panel sd-sleep';
    const h = sky.timeOfDay ?? 12, toMorning = ((7 - h + 24) % 24) || 24, toEvening = ((19 - h + 24) % 24) || 24;
    const head = document.createElement('h2'); head.className = 'sd-title'; head.textContent = 'Sleep';
    const menu = document.createElement('nav'); menu.className = 'sd-menu';
    const go = (hrs) => () => { ui.closeScreen(); this.sleep(Math.max(1, Math.round(hrs))); };
    if (toMorning >= 2 && toMorning <= 12) menu.append(ui.button(`Until morning (${Math.round(toMorning)} h)`, go(toMorning), { primary: true }));
    if (toEvening >= 2 && toEvening <= 12) menu.append(ui.button(`Until evening (${Math.round(toEvening)} h)`, go(toEvening)));
    for (const n of HOURS) menu.append(ui.button(`${n} hours`, go(n)));
    menu.append(ui.button('Not yet', () => ui.closeScreen()));
    wrap.append(head, menu);
    return wrap;
  }

  serialize() { const c = this.camp; return c ? { camp: { x: c.fire.x, z: c.fire.z, yaw: c.yaw } } : {}; }
  deserialize(d) { this.breakCamp(true); if (d?.camp && Number.isFinite(d.camp.x)) this._build(d.camp.x, d.camp.z, d.camp.yaw || 0); }
  dispose() { this.breakCamp(true); if (this._mats) for (const m of Object.values(this._mats)) { m.map?.dispose(); m.dispose(); } }
}
