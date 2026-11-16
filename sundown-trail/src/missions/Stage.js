import * as THREE from 'three';
import { WORLD } from '../data/world.js';
import { PropBuilder } from '../world/props/Kit.js';
import { buildBuilding } from '../town/Buildings.js';
import { Wagon } from './Wagon.js';

/**
 * A mission's stage (Part 15): everything a running mission puts into the world, so a failure or the end can
 * clear it in one call — people (npcs.spawn with ids 'm:<mission>:<key>'), horses, wagons, fires, props, pickups,
 * interactions, map markers and timers. Plus the helpers mission scripts lean on:
 *  place(name)    named spots: 'start', 'ranch', 'copperbell', Copperbell buildings ('saloon', 'sheriff',
 *                 'courthouse', 'bank', 'post', 'church', 'hotel', 'general', 'stable'), 'office' (Greywind's), every
 *                 WORLD location id, 'road:<id>:<0..1>' along a road, and 'flat:<x>,<z>' (a flat dry spot near it)
 *  roadPath(id, t0, t1)   points along a road for wagons and riders
 *  lines([[who, text], …])  people talk in turn (who: a stage key, 'eli', or an NPC)
 *  teleport(x, z, { horse })   moves Eli (and his horse, or with him in the saddle)
 */
export const TUNING = { fire: { light: 0xff7a2a, intensity: 26, distance: 26, flicker: 0.35 }, pickupMesh: true };
const _v = new THREE.Vector3();

export class Stage {
  constructor(sys, def) {
    this.sys = sys; this.game = sys.game; this.def = def;
    this.npcs = new Map(); this.tags = new Map(); this.horses = []; this.wagons = new Map(); this.objects = []; this.colliders = [];
    this.handles = []; this.fires = []; this.timers = []; this.markers = new Set(); this._picks = new Map();
  }
  get terrain() { return this.game.sys('terrain'); }
  ground(x, z) { return new THREE.Vector3(x, this.terrain.getHeightAt(x, z), z); }

  // ---------------------------------------------------------------- people
  /** Spawns a person for this mission. def: npcs.spawn def plus { at: [x, z] | place, tag }. */
  spawn(key, def = {}) {
    const g = this.game, npcs = g.get('npcs'); if (!npcs) return null;
    const p = this._pos(def.at || def.position);
    const id = `m:${this.def.id}:${key}`;
    const old = npcs.byId.get(id); if (old) npcs.despawn(old);
    const n = npcs.spawn({ persistent: true, wander: false, faction: def.hostile ? 'outlaw' : 'civilian', ...def, id, position: p ? { x: p.x, z: p.z } : undefined, home: p ? [p.x, p.z] : undefined });
    if (!n) return null;
    n.missionKey = key; this.npcs.set(key, n);
    const tag = def.tag || (def.hostile ? 'enemy' : null);
    if (tag) { if (!this.tags.has(tag)) this.tags.set(tag, []); this.tags.get(tag).push(n); }
    if (def.yaw !== undefined) { n.yaw = def.yaw; n.faceYaw(def.yaw); }
    if (def.pose) setTimeout(() => n.pose?.(def.pose), 50);
    return n;
  }
  /** A group of hostiles around a point. */
  gang(tag, at, count, def = {}, spread = 6) {
    const c = this._pos(at), out = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.4, r = spread * (0.5 + 0.5 * ((i * 7) % 5) / 4);
      out.push(this.spawn(`${tag}${i}`, { role: 'outlaw', hostile: true, weapon: ['revolver'], ...def, tag, at: [c.x + Math.cos(a) * r, c.z + Math.sin(a) * r] }));
    }
    return out.filter(Boolean);
  }
  get(key) { return this.npcs.get(key) || null; }
  group(tag) { return this.tags.get(tag) || []; }
  alive(tag) { return this.group(tag).filter((n) => !n.dead); }
  /** Points everyone in a group at Eli (or at a target entity). */
  attack(tag, target = this.game.player.entity) { for (const n of this.group(tag)) if (!n.dead) { n.grudge?.(target); n.brain?.fight?.(target, target.position); } }
  horse(opts = {}) { const h = this.game.get('horses')?.createHorse?.({ seed: `m:${this.def.id}:${this.horses.length}`, ...opts }); if (h) { const p = this._pos(opts.at); if (p) { h.position.copy(p); h.animator?.teleported?.(); } this.horses.push(h); } return h; }
  wagon(key, opts) { const w = new Wagon(this, { key, ...opts }); this.wagons.set(key, w); return w; }

  // ---------------------------------------------------------------- world bits
  add(obj) { this.game.scene.add(obj); this.objects.push(obj); return obj; }
  collider(desc) { const c = this.game.physics.addCollider(desc); this.colliders.push(c); return c; }
  /** A burning fire (house fires, signal fires): flames, embers, smoke, flickering light. */
  fire(at, scale = 3) {
    const g = this.game, vfx = g.sys('vfx'), p = this._pos(at), F = TUNING.fire;
    const light = new THREE.PointLight(F.light, F.intensity * Math.min(2, scale / 3), F.distance * Math.min(2, scale / 3), 2); light.position.set(p.x, p.y + 1.5 * scale / 3, p.z); g.scene.add(light);
    const fx = [vfx.spawn('fire_small', { position: p, scale }), vfx.spawn('embers', { position: p.clone().setY(p.y + scale * 0.4), scale }), vfx.spawn('campfire_smoke', { position: p.clone().setY(p.y + scale * 0.8), scale: scale * 1.6 })];
    const snd = g.audio.play('campfire', { position: p, loop: true, volume: Math.min(1, 0.5 + scale * 0.12) });
    const f = { light, fx, snd, t: Math.random() * 10, stop: () => { for (const h of fx) h.stop(); snd?.stop?.(); light.removeFromParent(); light.dispose?.(); f.out = true; } };
    this.fires.push(f); return f;
  }
  /** A small homestead cabin from the Part 9 kit. @returns building info */
  cabin(at, yaw = 0, spec = {}) {
    const g = this.game, towns = g.get('towns'); if (!towns?.kit) return null;
    const p = this._pos(at), B = new PropBuilder(towns.kit);
    const info = buildBuilding(B, { id: `m_${this.def.id}_cabin`, kind: 'house', x: p.x, y: p.y + 0.05, z: p.z, yaw, w: 7, d: 6, paint: 'paintOchre', roof: 'gable', chimney: true, porch: true, windows: 2, ...spec }, towns.signs);
    const grp = new THREE.Group(); grp.name = 'mission cabin'; B.build(grp, 'cabin'); this.add(grp);
    for (const c of B.colliders) this.colliders.push(g.physics.addCollider(c));
    return info;
  }
  /** Something to pick up: a small crate (or a mesh) and an E prompt. */
  pickup(at, label, onTake, { mesh = null, key = null } = {}) {
    const g = this.game, p = this._pos(at), obj = mesh || defaultPickup();
    obj.position.copy(p); this.add(obj);
    const it = { taken: false, obj };
    it.h = this.interact(p, label, () => { if (it.taken) return; it.taken = true; obj.removeFromParent(); this.removeInteract(it.h); g.audio.play('pickup', { position: p }); onTake?.(); }, 2.2);
    if (key) this._picks.set(key, it);
    return it;
  }
  interact(pos, label, fn, radius = 2.4, cond = null) {
    const g = this.game, getPos = typeof pos === 'function' ? pos : () => pos;
    const proxy = { get x() { return getPos()?.x ?? 0; }, get y() { return getPos()?.y ?? 0; }, get z() { return getPos()?.z ?? 0; } };
    const h = g.interact.register({ object: { position: proxy }, radius, priority: 2, label, onInteract: fn, condition: () => g.player.state === 'onFoot' && (!cond || cond()) });
    this.handles.push(h); return h;
  }
  removeInteract(h) { this.game.interact.unregister(h); }
  after(seconds, fn) { const t = setTimeout(() => { if (this.sys.stage === this) fn(); }, seconds * 1000); this.timers.push(t); return t; }

  // ---------------------------------------------------------------- talk
  say(who, text) {
    const g = this.game, social = g.get('social');
    if (who === 'eli') return social?.eliSay?.(text) ?? (g.ui.subtitle('Eli', text), 2.5);
    const n = typeof who === 'string' ? this.get(who) || g.get('npcs')?.byId?.get(who) : who;
    if (n) return social?.say?.(n, text) ?? (g.ui.subtitle(n.def?.name, text), 2.5);
    g.ui.subtitle(typeof who === 'string' ? who : '', text, Math.max(2.4, text.length * 0.06)); return Math.max(2.4, text.length * 0.06);
  }
  /** Lines spoken in turn. @returns Promise */
  lines(list) {
    return new Promise((res) => {
      let i = 0;
      const next = () => { if (this.sys.stage !== this || i >= list.length) { res(); return; } const [who, text] = list[i++]; const sec = this.say(who, text) || 2.5; this.timers.push(setTimeout(next, (Math.max(2.2, sec) + 0.35) * 1000)); };
      next();
    });
  }

  // ---------------------------------------------------------------- places
  place(name) {
    const g = this.game, L = WORLD.locations;
    if (name === 'start') return this.ground(WORLD.start.x, WORLD.start.z);
    if (name === 'ranch') { const r = g.get('ranch'); return (r?.spot?.('fire') || this.ground(L.ranch.x, L.ranch.z)).clone(); }
    if (name === 'ranchDoor') return (g.get('ranch')?.spot?.('door') || this.ground(L.ranch.x - 6, L.ranch.z)).clone();
    if (name === 'ranchYard') { const r = g.get('ranch'); return r?.R ? r.R.world(2, 16) : this.ground(L.ranch.x, L.ranch.z + 15); }
    if (name === 'copperbell') { const t = g.get('towns')?.towns?.get('copperbell'); return (t?.spots?.street?.[Math.floor((t.spots.street.length || 1) / 2)] || this.ground(L.copperbell.x, L.copperbell.z)).clone(); }
    if (name === 'office') return this.building('greywind', 'gw_office', 3) || this.ground(L.lumberCamp.x, L.lumberCamp.z - 14);
    if (name.startsWith('road:')) { const [, id, t] = name.split(':'); return this.roadPoint(id, Number(t)); }
    if (name.startsWith('flat:')) { const [x, z] = name.slice(5).split(',').map(Number); return this.findFlat(x, z); }
    if (L[name]) return this.ground(L[name].x, L[name].z);
    return this.building('copperbell', name, 3) || null;
  }
  /** A point in front of a town building's door (`out` metres into the street); null if it doesn't exist. */
  building(town, id, out = 3) {
    const t = this.game.get('towns')?.towns?.get(town), b = t?.buildings?.find((x) => x.id === id);
    if (!b) return null;
    const yaw = b.spec.yaw; return this.ground(b.front.x + Math.sin(yaw) * out, b.front.z + Math.cos(yaw) * out);
  }
  buildingInfo(town, id) { return this.game.get('towns')?.towns?.get(town)?.buildings?.find((x) => x.id === id) || null; }
  roadPts(id) {
    const r = this.terrain.roads?.find((x) => x.id === id);
    if (r?.points) { const out = []; for (let i = 0; i < r.points.length; i += 3) out.push([r.points[i], r.points[i + 2]]); return out; }
    return WORLD.roads.find((x) => x.id === id)?.points || [];
  }
  /** A point at fraction t (0..1) along a road. */
  roadPoint(id, t) { const pts = this.roadPts(id); if (!pts.length) return null; const p = pts[Math.max(0, Math.min(pts.length - 1, Math.round(t * (pts.length - 1))))]; return this.ground(p[0], p[1]); }
  /** Points along a road between two fractions (either direction), thinned to every few metres. */
  roadPath(id, t0, t1, every = 6) {
    const pts = this.roadPts(id), n = pts.length - 1; if (n < 1) return [];
    const a = Math.round(t0 * n), b = Math.round(t1 * n), step = a <= b ? 1 : -1, out = [];
    let last = null;
    for (let i = a; step > 0 ? i <= b : i >= b; i += step) { const p = pts[i]; if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= every) { out.push([p[0], p[1]]); last = p; } }
    return out;
  }
  /** The nearest flat, dry, open spot to (x, z), searched in rings. */
  findFlat(x, z, maxSlope = 0.18, search = 60) {
    const T = this.terrain, n = new THREE.Vector3();
    for (let r = 0; r <= search; r += 4) for (let a = 0; a < 6.28; a += r ? 4 / r : 7) {
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (T.isWater?.(px, pz) || (T.getRoadInfo?.(px, pz)?.distance ?? 99) < 8) continue;
      let ok = true; for (const [dx, dz] of [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5]]) { T.getNormalAt?.(px + dx, pz + dz, n); if (n.y < 1 - maxSlope) { ok = false; break; } }
      if (ok) return this.ground(px, pz);
    }
    return this.ground(x, z);
  }
  _pos(at) { if (!at) return null; if (typeof at === 'string') return this.place(at); if (at.isVector3) return at.clone(); if (Array.isArray(at)) return this.ground(at[0], at[1]); return this.ground(at.x, at.z); }

  // ---------------------------------------------------------------- Eli
  teleport(x, z, { horse = true, yaw = null } = {}) {
    const g = this.game, pl = g.player, h = g.get('horses')?.playerHorse;
    if (pl.state === 'mounted' && h) { h.position.set(x, this.terrain.getHeightAt(x, z), z); if (yaw !== null) h.yaw = yaw; h.animator?.teleported?.(); pl.position.copy(h.position); }
    else { pl.teleport(x, z); if (yaw !== null) pl.yaw = yaw; if (horse && h && h.alive !== false) { h.position.set(x + 3, this.terrain.getHeightAt(x + 3, z + 2), z + 2); h.animator?.teleported?.(); } }
    g.cameraRig?.snap?.();
  }

  // ---------------------------------------------------------------- per frame and cleanup
  update(dt) {
    for (const f of this.fires) { if (f.out) continue; f.t += dt; f.light.intensity = TUNING.fire.intensity * (1 + TUNING.fire.flicker * (Math.sin(f.t * 9.3) * 0.5 + Math.sin(f.t * 21.1) * 0.3 + (Math.random() - 0.5) * 0.4)); }
    for (const w of this.wagons.values()) w.update(dt);
  }
  clear() {
    const g = this.game, npcs = g.get('npcs');
    for (const n of this.npcs.values()) if (npcs?.list.includes(n)) npcs.despawn(n);
    this.npcs.clear(); this.tags.clear();
    for (const w of this.wagons.values()) w.dispose(); this.wagons.clear();
    for (const h of this.horses) { if (g.get('horses')?.playerHorse !== h) h.dispose?.(); } this.horses.length = 0;
    for (const f of this.fires) f.stop(); this.fires.length = 0;
    for (const o of this.objects) { o.removeFromParent(); o.traverse?.((x) => { if (x.isMesh) { x.geometry?.dispose(); } }); } this.objects.length = 0;
    for (const c of this.colliders) g.physics.removeCollider(c); this.colliders.length = 0;
    for (const h of this.handles) g.interact.unregister(h); this.handles.length = 0;
    for (const t of this.timers) clearTimeout(t); this.timers.length = 0;
  }
}

let _pickGeo = null, _pickMat = null;
function defaultPickup() {
  _pickGeo ||= new THREE.BoxGeometry(0.5, 0.32, 0.36); _pickMat ||= new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 0.85 });
  const m = new THREE.Mesh(_pickGeo.clone(), _pickMat); m.castShadow = true; m.position.y = 0.16;
  const g = new THREE.Group(); g.add(m); return g;
}
void _v;
