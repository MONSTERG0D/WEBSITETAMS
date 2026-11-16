import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { NPC, LINES, TUNING as NPC_TUNING } from './NPC.js';
import { TUNING as BRAIN_TUNING, orderFlank } from './Brain.js';
import { TUNING as PERCEPTION_TUNING, indicatorMaterials } from './Perception.js';
import { TUNING as NAV_TUNING } from './Navigation.js';
import { TUNING as TACTICS_TUNING } from './Tactics.js';
import { Spawner, TUNING as SPAWN_TUNING } from './Spawner.js';

/**
 * The 'npcs' system (Part 7, GAME_BIBLE §11): spawn(def) → NPC · despawn(npc) · nearby(position, radius, filter).
 *   def = { role, faction, name, seed, position, schedule, weapon, dialogue, hostile, persistent,
 *           (Part 7 additions) home, patrol, wander, wanderRadius, mounted, accuracy, reaction, aggression, health, start }
 * Owns every NPC: think budgets (near NPCs think every frame, far ones less often), hearing gunshots, the faction
 * hostility table, squads (group alerts, flanking a pinned target, "man down" call-outs), call-out subtitles with a
 * shared cooldown, the spawn bubble (Spawner.js), waypoint graphs for towns, debug drawing of vision cones and brain
 * states, and difficulty (accuracy, reaction time, aggression).
 */
export const TUNING = {
  thinkNear: 45, thinkMid: 110, midEvery: 3, farEvery: 8,
  groupAlert: 32, allyJoin: 70, flankEvery: 7, pinnedSpeed: 0.8, pinnedTime: 3.5, flankMin: 2,
  corpseTime: 90, corpseFar: 60,
  difficulty: 'normal',
  difficulties: {
    easy: { accuracy: 1.55, reaction: 1.6, aggression: 0.75 },
    normal: { accuracy: 1, reaction: 1, aggression: 1 },
    hard: { accuracy: 0.7, reaction: 0.6, aggression: 1.25 },
  },
  debug: false,
};

/** Faction pairs that fight on sight (symmetric). Eli's standing is handled separately. */
export const HOSTILITY = [['cinder', 'law'], ['cinder', 'blackstone']];

const _v = new THREE.Vector3(), _cam = new THREE.Vector3();

export default class NPCSystem extends System {
  constructor(game) {
    super(game);
    this.list = []; this.byId = new Map(); this.graphs = new Map(); this.fights = new Map();
    this._frame = 0; this._sayT = 0; this._flankT = 0; this._lastSay = new Map();
    this.difficulty = { ...TUNING.difficulties.normal };
    this.stats = { npcs: 0, thinking: 0, ms: 0 };
    this._pairs = new Set(HOSTILITY.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
  }

  async init() {
    const g = this.game;
    this.setDifficulty(g.settings.get('aiDifficulty') || TUNING.difficulty);
    g.events.on(EVENTS.SETTINGS_CHANGED, ({ key }) => { if (key === 'aiDifficulty' || key === '*') this.setDifficulty(g.settings.get('aiDifficulty') || 'normal'); });
    g.events.on(EVENTS.WEAPON_FIRED, (e) => this._onShot(e));
    g.events.on(EVENTS.PLAYER_DIED, () => { for (const n of this.list) if (n.brain.state === 'fight' && n.brain.d.target === g.player.entity) n.brain.set('returning'); });
    // warm up the ?/! sprites so the first alert doesn't hitch
    const mats = indicatorMaterials();
    this._warm = new THREE.Sprite(mats.combat); this._warm.scale.setScalar(0.0001); this._warm.raycast = () => {}; this._warm.position.set(0, -500, 0);
    g.scene.add(this._warm);
    this.spawner = new Spawner(this);
    this._debug = new DebugDraw(this);
    g.debug?.addTuning('NPCs', TUNING); g.debug?.addTuning('NPC body', NPC_TUNING); g.debug?.addTuning('NPC brain', BRAIN_TUNING);
    g.debug?.addTuning('NPC perception', PERCEPTION_TUNING); g.debug?.addTuning('NPC navigation', NAV_TUNING);
    g.debug?.addTuning('NPC tactics', TACTICS_TUNING); g.debug?.addTuning('NPC spawning', SPAWN_TUNING);
  }

  /** 'easy' | 'normal' | 'hard', or an object { accuracy, reaction, aggression }. */
  setDifficulty(d) {
    const v = typeof d === 'string' ? TUNING.difficulties[d] || TUNING.difficulties.normal : d;
    Object.assign(this.difficulty, v);
    for (const n of this.list) { n.accuracy = (n.def.accuracy ?? 1) * v.accuracy; n.reaction = (n.def.reaction ?? 0.6) * v.reaction; n.aggression = Math.min(1.2, (n.def.aggression ?? 0.6) * v.aggression); }
  }

  // ---------------------------------------------------------------- Bible API
  /** @returns {NPC|null} */
  spawn(def = {}) {
    if (def.id && this.byId.has(def.id)) return this.byId.get(def.id);
    const n = new NPC(this, def);
    this.list.push(n); this.byId.set(n.id, n);
    this.game.entities.add(n.entity);
    if (def.mounted) {
      const horses = this.game.get('horses');
      const h = horses?.createHorse?.({ seed: `${n.id}:horse`, faction: n.faction, coat: def.coat });
      if (h) { h.position.copy(n.position); h.yaw = n.yaw; h.animator.teleported(); n.mount(h); }
    }
    return n;
  }
  despawn(npc) {
    const i = this.list.indexOf(npc);
    if (i < 0) return;
    this.list.splice(i, 1); this.byId.delete(npc.id);
    for (const s of this.fights.values()) s.delete(npc);
    for (const o of this.list) o.grudges.delete(npc.entity);
    npc.dispose();
  }
  /** NPCs within `radius` of `position` (nearest first), optionally filtered. */
  nearby(position, radius = 30, filter = null) {
    const out = [], r2 = radius * radius;
    for (const n of this.list) {
      const d = n.position.distanceToSquared(position);
      if (d <= r2 && (!filter || filter(n))) { n._d2 = d; out.push(n); }
    }
    return out.sort((a, b) => a._d2 - b._d2);
  }

  // ---------------------------------------------------------------- helpers for NPCs
  /** Living NPCs other than `n` within `r` (used for separation; cheap linear scan, the list is small). */
  nearbyNPCs(n, r) {
    const out = this._near || (this._near = []); out.length = 0;
    const r2 = r * r;
    for (const o of this.list) if (o !== n && !o.dead && !o.horse && o.position.distanceToSquared(n.position) < r2) out.push(o);
    return out;
  }
  /** Added in Part 7: a town's waypoint graph (NavGraph) used for routes inside it. */
  registerGraph(graph) { this.graphs.set(graph.name, graph); return graph; }
  unregisterGraph(name) { this.graphs.delete(name); }
  /** Added in Part 15: two factions that fight on sight (missions add 'ally' and 'outlaw'). */
  addHostility(a, b) { this._pairs.add(`${a}|${b}`); this._pairs.add(`${b}|${a}`); }

  /** Does `npc` treat entity `e` as an enemy? */
  hostile(npc, e) {
    if (!e || e === npc.entity || e.alive === false) return false;
    if (npc.grudges.has(e)) return true;
    if (e.type === 'player') {
      if (npc.def.hostile) return true;
      const law = this.game.sys('law');
      if (npc.faction === 'law' && law.level >= 2) return true;
      if (npc.def.bountyHunter && (law.isWanted() || (law.totalBounty?.() || 0) > 0)) return true;
      return false;
    }
    if (e.type === 'npc') {
      const o = e.npc;
      if (o.dead || o.surrendered) return false;
      if (o.grudges.has(npc.entity)) return true;
      return this._pairs.has(`${npc.faction}|${o.faction}`);
    }
    return false;
  }
  /** A visible enemy NPC (faction war), or null. Only checked for factions that have enemies. */
  visibleFoe(n) {
    if (!n.armed && n.faction === 'civilian') return null;
    let best = null, bd = Infinity;
    for (const o of this.list) {
      if (o === n || o.dead || o.surrendered) continue;
      const d = o.position.distanceToSquared(n.position);
      if (d > 50 * 50 || d > bd || !this.hostile(n, o.entity)) continue;
      if (n.perception.visibility(o.entity) > 0) { best = o.entity; bd = d; }
    }
    return best;
  }
  /** A civilian standing around near `n` who could chat. */
  talkPartner(n, r) {
    for (const o of this.list) {
      if (o === n || o.dead || o.horse || o.faction !== 'civilian' || o.brain.state !== 'idle' || o.position.distanceTo(n.position) > r) continue;
      return o;
    }
    return null;
  }
  /** `n` was attacked by `src`: friends nearby join in (or run, if they're unarmed civilians). */
  alertGroup(n, src) {
    for (const o of this.list) {
      if (o === n || o.dead || o.faction !== n.faction || !!o.def.bountyHunter !== !!n.def.bountyHunter || o.position.distanceTo(n.position) > TUNING.groupAlert) continue;
      o.grudge(src);
      if (o.brain.busy) continue;
      if (o.armed && o.def.fights !== false) o.brain.fight(src); else o.brain.set('flee', { from: src.position.clone() });
    }
  }
  joinFight(n, target) { let s = this.fights.get(target); if (!s) this.fights.set(target, (s = new Set())); s.add(n); this._pinT = 0; }
  leaveFight(n) { for (const [t, s] of this.fights) { s.delete(n); if (!s.size) this.fights.delete(t); } }
  /** Someone hurt `n`: the law decides whether it was a crime (Eli attacking someone who wasn't attacking him). */
  _violence(n, source, killed, info) { this.game.get('law')?.violence?.(n, source, killed, info); }
  surrendered(n) { this.game.events.emit(EVENTS.NPC_SURRENDERED, { npc: n }); }

  /** Shows a call-out line as a subtitle when Eli is close enough to hear it (one voice at a time). */
  say(n, kind) {
    const g = this.game, lines = LINES[kind];
    if (!lines || n.dead || this._sayT > 0) return;
    if (n.position.distanceTo(g.player.position) > NPC_TUNING.sayRange) return;
    const key = `${n.id}:${kind}`;
    if (g.now - (this._lastSay.get(key) || -1e9) < 8) return;
    this._lastSay.set(key, g.now);
    this._sayT = NPC_TUNING.sayCooldown;
    const who = n.name || (n.faction === 'law' ? 'Lawman' : n.faction === 'cinder' ? 'Outlaw' : n.faction === 'blackstone' ? 'Blackstone man' : 'Stranger');
    const line = lines[Math.floor(Math.random() * lines.length)];
    g.ui.subtitle(who, line, 2.2);
    g.get('social')?.voice?.speak(n, line); // Added in Part 8
  }

  _onDeath(n, killer) {
    this.leaveFight(n);
    const mate = this.list.find((o) => o !== n && !o.dead && o.faction === n.faction && o.armed && o.position.distanceTo(n.position) < 40);
    if (mate && n.faction !== 'civilian') mate.say('down');
    if (killer) this.alertGroup(n, killer);
    // witnesses to a killing: civilians nearby panic
    for (const o of this.list) if (!o.dead && !o.armed && !o.brain.busy && o.position.distanceTo(n.position) < 30) o.brain.set('flee', { from: n.position.clone() });
  }

  /** Gunshots: everyone within earshot hears; allies of an NPC shooter join its fight. */
  _onShot({ weaponId, position, shooter }) {
    if (!position) return;
    const H = PERCEPTION_TUNING.hearing;
    const range = weaponId === 'bow' ? H.bow : weaponId === 'rifle' ? H.rifle : weaponId === 'shotgun' ? H.shotgun : H.gun;
    const kind = weaponId === 'bow' ? 'bow' : 'gun';
    const sn = shooter?.npc || null;
    for (const n of this.list) {
      if (n.dead || n.entity === shooter) continue;
      const d = n.position.distanceTo(position);
      if (d > range) continue;
      if (sn && sn.brain.state === 'fight' && sn.faction === n.faction && d < TUNING.allyJoin && n.armed && !n.brain.busy) { n.brain.fight(sn.brain.d.target); continue; }
      n.perception.hear({ kind, position, source: shooter, distance: d });
    }
  }

  // ---------------------------------------------------------------- per frame
  update(dt, rawDt) {
    const g = this.game, t0 = performance.now();
    this._frame++; this._sayT -= rawDt;
    if (g.state !== 'playing' && g.state !== 'dead') return;
    g.camera.getWorldPosition(_cam);
    const pp = g.player.position;
    let thinking = 0;
    for (let i = 0; i < this.list.length; i++) {
      const n = this.list[i];
      n._thinkAcc = (n._thinkAcc || 0) + dt;
      const d = n.position.distanceTo(pp);
      const every = d < TUNING.thinkNear || n.brain.state === 'fight' ? 1 : d < TUNING.thinkMid ? TUNING.midEvery : TUNING.farEvery;
      const think = (this._frame + i) % every === 0;
      if (think) thinking++;
      n.update(dt, think, n._thinkAcc);
      if (think) n._thinkAcc = 0;
    }
    this._squads(dt);
    this._corpses();
    this.spawner.update(dt);
    this.stats.npcs = this.list.length; this.stats.thinking = thinking;
    this.stats.ms += (performance.now() - t0 - this.stats.ms) * 0.1;
  }
  lateUpdate() {
    const g = this.game;
    g.camera.getWorldPosition(_cam);
    for (const n of this.list) n.lateUpdate(_cam);
    if (TUNING.debug) this._debug.update(); else this._debug.hide();
  }

  /** Squad tactics against Eli: when he's pinned (barely moving behind cover), send someone around his side. */
  _squads(dt) {
    const g = this.game, pl = g.player, s = this.fights.get(pl.entity);
    if (!s || s.size < TUNING.flankMin) { this._pinT = 0; return; }
    const sp = Math.hypot(pl.velocity.x, pl.velocity.z);
    this._pinT = sp < TUNING.pinnedSpeed ? (this._pinT || 0) + dt : 0;
    this._flankT -= dt;
    if (this._pinT < TUNING.pinnedTime || this._flankT > 0) return;
    // pick the fighter in cover furthest round from the squad's average bearing, send them at ±flankAngle
    const fighters = [...s].filter((n) => !n.dead && n.brain.state === 'fight' && n.armed);
    if (fighters.length < TUNING.flankMin) return;
    let ax = 0, az = 0;
    for (const n of fighters) { ax += n.position.x - pl.position.x; az += n.position.z - pl.position.z; }
    const mean = Math.atan2(az, ax), side = Math.random() < 0.5 ? 1 : -1;
    const who = fighters.filter((n) => n.brain.d.mode === 'cover' || n.brain.d.mode === 'peek').sort((a, b) => b.aggression - a.aggression)[0];
    if (!who) return;
    const others = fighters.find((n) => n !== who);
    others?.say('pinned');
    if (orderFlank(who, mean + side * (TACTICS_TUNING.flankAngle * Math.PI / 180))) { this._flankT = TUNING.flankEvery; this._pinT = 0; }
  }

  /** Bodies of non-persistent NPCs are cleared once nobody's looking. */
  _corpses() {
    if (this._frame % 30) return;
    const g = this.game, pp = g.player.position;
    for (const n of [...this.list]) {
      if (!n.dead || n.persistent) continue;
      if (g.now - n.diedAt > TUNING.corpseTime && n.position.distanceTo(pp) > TUNING.corpseFar) this.despawn(n);
    }
  }

  serialize() {
    return { persistent: this.list.filter((n) => n.persistent).map((n) => n.serialize()), spawner: this.spawner?.serialize() };
  }
  deserialize(d) {
    if (!d) return;
    this._saved = new Map((d.persistent || []).map((p) => [p.id, p]));
    for (const n of this.list) { const p = this._saved.get(n.id); if (p) this.restore(n, p); }
    this.spawner?.deserialize(d.spawner);
  }
  /** Applies a saved state to a persistent NPC. */
  restore(n, p) {
    n.position.set(p.x, this.game.sys('terrain').getHeightAt(p.x, p.z), p.z); n.yaw = p.yaw || 0;
    n.object3d.position.copy(n.position); n.human?.teleported();
    if (p.dead) n.die(null, null); else if (p.health) n.entity.health = p.health;
  }
  dispose() {
    for (const n of [...this.list]) this.despawn(n);
    this._warm?.removeFromParent(); this._debug?.dispose(); this.spawner?.dispose();
  }
}

/** Debug drawing: vision cones on the ground and a state label over each NPC. */
class DebugDraw {
  constructor(sys) { this.sys = sys; this.items = new Map(); }
  update() {
    const g = this.sys.game;
    for (const n of this.sys.list) {
      let it = this.items.get(n);
      if (!it) { it = this._make(); this.items.set(n, it); g.scene.add(it.cone, it.label); }
      it.cone.visible = it.label.visible = !n.dead;
      if (n.dead) continue;
      const P = PERCEPTION_TUNING, half = ((n.alert >= 2 ? P.alertCone : P.cone) / 2) * Math.PI / 180;
      const night = g.sys('sky').isNight?.() ? 1 : 0, dim = typeof g.sys('sky').daylight === 'number' ? 1 - g.sys('sky').daylight : night;
      const range = P.sight * (n.def.sight ?? 1) * (1 - (1 - P.nightFactor) * Math.min(1, dim));
      it.cone.position.set(n.position.x, n.position.y + 0.08, n.position.z);
      it.cone.rotation.set(0, n.yaw, 0);
      it.cone.scale.set(range, 1, range);
      if (it.half !== half) { it.half = half; this._shape(it.cone.geometry, half, it.cone.userData.edge.geometry); }
      it.cone.userData.edge.material.color.setHex(n.brain.state === 'fight' ? 0xc8462a : n.alert >= 2 ? 0xe8b04a : n.perception.suspects ? 0xf1e4c6 : 0x6fb0d0);
      it.cone.material.color.setHex(n.brain.state === 'fight' ? 0xc8462a : n.alert >= 2 ? 0xe8b04a : n.perception.suspects ? 0xf1e4c6 : 0x6fb0d0);
      const txt = `${n.name || n.role} · ${n.brain.state}${n.brain.state === 'fight' ? ' ' + (n.brain.d.mode || '') : ''} · ${Math.round(n.perception.awareness * 100)}%`;
      if (txt !== it.text) { it.text = txt; this._label(it, txt); }
      it.label.position.set(n.position.x, n.position.y + 2.45, n.position.z);
    }
    for (const [n, it] of this.items) if (!this.sys.list.includes(n)) { it.cone.removeFromParent(); it.label.removeFromParent(); this.items.delete(n); }
  }
  hide() { for (const it of this.items.values()) it.cone.visible = it.label.visible = false; }
  _make() {
    const geo = new THREE.BufferGeometry();
    const cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x6fb0d0, transparent: true, opacity: 0.045, depthWrite: false, side: THREE.DoubleSide }));
    cone.raycast = () => {}; cone.renderOrder = 5;
    const edge = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x6fb0d0, transparent: true, opacity: 0.7, depthWrite: false }));
    edge.raycast = () => {}; cone.add(edge); cone.userData.edge = edge;
    const c = document.createElement('canvas'); c.width = 512; c.height = 64;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
    label.scale.set(0.3, 0.0375, 1); label.raycast = () => {}; label.renderOrder = 999;
    return { cone, label, canvas: c, tex, half: -1, text: '' };
  }
  _shape(geo, half, edgeGeo = null) {
    const seg = 18, pos = [0, 0, 0];
    for (let i = 0; i <= seg; i++) { const a = -half + (2 * half * i) / seg; pos.push(-Math.sin(a), 0, -Math.cos(a)); }
    const idx = []; for (let i = 1; i <= seg; i++) idx.push(0, i, i + 1);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeBoundingSphere();
    if (edgeGeo) { edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute([...pos, 0, 0, 0], 3)); edgeGeo.computeBoundingSphere(); }
  }
  _label(it, txt) {
    const x = it.canvas.getContext('2d');
    x.clearRect(0, 0, 512, 64); x.fillStyle = 'rgba(20,14,8,0.7)'; x.fillRect(0, 8, 512, 48);
    x.font = '26px Georgia, serif'; x.fillStyle = '#f1e4c6'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, 256, 33);
    it.tex.needsUpdate = true;
  }
  dispose() { for (const it of this.items.values()) { it.cone.removeFromParent(); it.label.removeFromParent(); it.cone.geometry.dispose(); it.tex.dispose(); } this.items.clear(); }
}

export { NPCSystem };
