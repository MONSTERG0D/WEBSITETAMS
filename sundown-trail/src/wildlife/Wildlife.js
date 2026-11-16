import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { WORLD } from '../data/world.js';
import { buildHorseAtlas } from '../horse/rig/HorseTextures.js';
import { SPECIES, Animal, TUNING as ANIMAL_TUNING } from './Animals.js';
import { makeContext, thinkGround, thinkBird, moveGround, alarm, TUNING as AI } from './AnimalAI.js';
import { showAnimalHitboxes } from './AnimalRig.js';

/**
 * The 'wildlife' system (GAME_BIBLE §11: spawn(species, position) · nearby(position, radius)). Keeps a bubble of
 * animals around the player within the §10 budget (8 nearby on Medium, 16 on High, 4 on Low), picked by biome
 * and hour: deer and elk at dawn and dusk, wolves at night in the high country, coyotes and rabbits in the dry
 * south, turkeys by the river, hawks overhead, crows in the open valley. Gunshots scatter prey, predators bite
 * through combat.applyDamage, carcasses stay until skinned or far away. AI lives in AnimalAI.js.
 */
export const TUNING = {
  caps: { low: 4, medium: 8, high: 16 }, spawnEvery: 1.6, spawnMin: 70, spawnMax: 140, despawn: 200, carcassDespawn: 260,
  nearPhysics: 90, townMargin: 45, roadMargin: 7, maxSlope: 0.72, gunshotRange: { default: 150, rifle: 200, bow: 16, knife: 0, lasso: 0 },
  howlEvery: [35, 70], lodBias: 1, startPopulation: true,
};
const ALIASES = { deer: ['deer_buck', 'deer_doe'], buck: ['deer_buck'], doe: ['deer_doe'] };
const _v = new THREE.Vector3(), _c = new THREE.Vector3();

export default class Wildlife extends System {
  constructor(game) {
    super(game);
    this.list = []; this.carcasses = []; this.stats = { spawned: 0, despawned: 0, live: 0 };
    this._spawnT = 0; this._chaseT = AI.chaseEvery; this._howlT = 20; this.lodBias = TUNING.lodBias; this.enabled = true;
  }

  async init() {
    const g = this.game;
    this.terrain = g.sys('terrain'); this.bound = WORLD.wall - 25; this.water = WORLD.waterLevel;
    const atlas = g.get('horses')?.atlas || (this._ownAtlas = buildHorseAtlas(g.quality?.name === 'high' ? 1024 : 512));
    this.material = new THREE.MeshStandardMaterial({ map: atlas.map, normalMap: atlas.normalMap, roughnessMap: atlas.ormMap, metalnessMap: atlas.ormMap, vertexColors: true, roughness: 1, metalness: 1, envMapIntensity: 0.5 });
    this.material.normalScale.set(0.9, 0.9); this.material.name = 'animal';
    g.events.on(EVENTS.WEAPON_FIRED, (e) => this._onShot(e));
    g.events.on(EVENTS.GAME_START, () => { this.clear(); this._populated = false; });
    g.debug?.addTuning('Wildlife', TUNING);
    g.debug?.addTuning('Wildlife AI', AI);
    g.debug?.addToggle?.('Animal hitboxes', (on) => showAnimalHitboxes(on));
  }

  get hunting() { return this.game.get('hunting'); }
  get cap() { return TUNING.caps[this.game.quality?.name] ?? TUNING.caps.medium; }

  // ---------------------------------------------------------------- API (GAME_BIBLE §11)
  /**
   * Spawns an animal (or a whole group with opts.group = true). species may be an alias ('deer').
   * @returns {Animal|null} the first animal
   */
  spawn(species, position, opts = {}) {
    const ids = ALIASES[species] || [species];
    const id = ids[Math.floor(Math.random() * ids.length)], S = SPECIES[id];
    if (!S || !position) return null;
    const n = opts.group ? Math.max(1, opts.count ?? (S.group[0] + Math.floor(Math.random() * (S.group[1] - S.group[0] + 1)))) : 1;
    const group = n > 1 || opts.group ? [] : null, out = [];
    for (let i = 0; i < n; i++) {
      const a = i === 0 ? 0 : Math.random() * Math.PI * 2, r = i === 0 ? 0 : 1.5 + Math.random() * (S.bird ? 3 : 4);
      const x = position.x + Math.sin(a) * r, z = position.z + Math.cos(a) * r;
      const y = S.bird === 'sky' ? position.y : this.terrain.getHeightAt(x, z);
      // a group of deer: one buck with does
      const sid = id === 'deer_buck' && i > 0 ? 'deer_doe' : id;
      const an = new Animal(this, sid, _v.set(x, y, z), { group, yaw: opts.yaw });
      if (group) group.push(an);
      this.list.push(an); out.push(an); this.stats.spawned++;
    }
    return out[0];
  }
  /** Living animals within radius, nearest first. */
  nearby(position, radius = 50, filter = null) {
    const r2 = radius * radius, out = [];
    for (const a of this.list) { if (!a.alive || (filter && !filter(a))) continue; const d2 = a.position.distanceToSquared(position); if (d2 <= r2) { a._d2 = d2; out.push(a); } }
    return out.sort((a, b) => a._d2 - b._d2);
  }
  /** Carcasses (dead, not yet skinned) within radius. */
  carcassesNear(position, radius = 3) { return this.list.filter((a) => !a.alive && !a.skinned && a.position.distanceTo(position) < radius); }
  clear() { for (const a of this.list) { this.hunting?.forget?.(a); a.dispose(); } this.list.length = 0; }

  // ---------------------------------------------------------------- hooks from Animal
  onAnimalHurt(a, source) {
    const pl = this.game.player;
    if (a.isPredator) { a.provoked = source === pl.entity || source === pl.horse?.entity || a.provoked; a.awareness = 1.2; if (a.def.temper === 'skittish' && a.health < a.maxHealth * 0.6) alarm(this, a, pl.position); if (a.group) for (const m of a.group) if (m.alive) { m.provoked = true; m.awareness = 1.2; } }
    else alarm(this, a, source?.position || pl.position);
  }
  onAnimalDied(a) {
    this.game.audio.play(`${a.def.pelt || a.species}_death`, { position: a.position, volume: 0.8 });
    for (const m of this.list) if (m !== a && m.alive && !m.isPredator && m.position.distanceTo(a.position) < 35) alarm(this, m, a.position.clone());
  }

  /** A predator's bite or swipe on the player or the player's horse. */
  bite(a, target) {
    const g = this.game, combat = g.get('combat'), dmg = a.def.attack.damage * (g.sys('sky').isNight?.() ? 1.15 : 1);
    if (!target || target.alive === false) return;
    _v.subVectors(target.position, a.position).setY(0).normalize();
    const info = { amount: dmg, zone: 'torso', source: a.entity, direction: _v.clone(), point: target.position.clone().setY(target.position.y + 1) };
    if (combat?.applyDamage) combat.applyDamage(target, info); else target.takeDamage?.(info);
    g.sys('vfx').spawn('impact_flesh', { position: info.point, direction: _v, scale: 0.7 });
    g.audio.play(a.def.temper === 'territorial' ? 'bear_swipe' : 'wolf_bite', { position: a.position });
  }
  sound(a, kind) { this.game.audio.play(`${a.def.pelt || a.species}_${kind}`, { position: a.position }); }

  // ---------------------------------------------------------------- update
  update(dt) {
    const g = this.game;
    if (!this.enabled || g.state !== 'playing' && g.state !== 'dead') { for (const a of this.list) a.pose(0, a.position.distanceTo(g.camera.position)); return; }
    const ctx = makeContext(this), pl = g.player.position, cam = g.camera.position, night = ctx.night;
    if (!this._populated && TUNING.startPopulation) { this._populated = true; for (let i = 0; i < Math.ceil(this.cap * 0.6); i++) this._trySpawn(true); }
    if ((this._spawnT -= dt) <= 0) { this._spawnT = TUNING.spawnEvery; if (this._live() < this.cap) this._trySpawn(false); }
    if ((this._chaseT -= dt) <= 0) { this._chaseT = AI.chaseEvery * (0.6 + Math.random() * 0.8); this._startChase(ctx); }
    if (night && (this._howlT -= dt) <= 0) { this._howlT = TUNING.howlEvery[0] + Math.random() * (TUNING.howlEvery[1] - TUNING.howlEvery[0]); const w = this.list.find((a) => a.alive && a.species === 'wolf'); if (w) this.sound(w, 'howl'); }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i], d = a.position.distanceTo(pl);
      if ((a.alive && d > TUNING.despawn) || (!a.alive && (d > TUNING.carcassDespawn || a.deadT > (a.skinned ? ANIMAL_TUNING.skinnedLife : ANIMAL_TUNING.carcassLife)))) {
        this.hunting?.forget?.(a); a.dispose(); this.list.splice(i, 1); this.stats.despawned++; continue;
      }
      if (a.alive) {
        if (a.def.bird && a.def.bird !== 'ground') thinkBird(this, a, ctx, dt);
        else if (a.def.bird === 'ground') thinkBird(this, a, ctx, dt);
        else thinkGround(this, a, ctx, dt);
        if (a.alive && a.def.bird !== 'sky' && a.state !== 'fly') moveGround(this, a, dt, d < TUNING.nearPhysics);
        else if (a.alive) a.object3d.rotation.set(0, a.yaw, 0);
        if (a.alive) this._steps(a, dt);
      } else if (a.def.bird && a.position.y > this.terrain.getHeightAt(a.position.x, a.position.z) + 0.02) {
        // shot out of the sky: falls to the ground
        a.velocity.y -= 9.8 * dt; a.position.y = Math.max(this.terrain.getHeightAt(a.position.x, a.position.z), a.position.y + a.velocity.y * dt); a._groundY = a.position.y;
      }
      a.pose(dt, a.position.distanceTo(cam));
      if (a.rig.shine) a.rig.shine.visible = night && a.alive && d < 70;
    }
    this.stats.live = this._live();
  }
  _live() { let n = 0; for (const a of this.list) if (a.alive) n++; return n; }

  /** Footfalls: Hunting lays prints (and blood) along the way. */
  _steps(a, dt) {
    a._printAcc += a.speed * dt;
    const stride = Math.max(0.35, a.def.look.shape.height * 1.1);
    if (a._printAcc < stride) return;
    a._printAcc = 0;
    this.hunting?.onStep?.(a);
  }

  /** Any shot heard: prey bolt; predators get bold at night or run by day. */
  _onShot({ weaponId, position, shooter }) {
    const R = TUNING.gunshotRange[weaponId] ?? (weaponId === 'rifle' ? TUNING.gunshotRange.rifle : TUNING.gunshotRange.default);
    if (!R || !position) return;
    const night = this.game.sys('sky').isNight?.();
    for (const a of this.list) {
      if (!a.alive) continue;
      const d = a.position.distanceTo(position);
      if (d > R) continue;
      if (a.isPredator) {
        if (a.def.temper === 'pack' && night && d < 70) { a.provoked = true; a.awareness = 1.2; }
        else if (a.def.temper === 'territorial' && d < 45) { a.provoked = true; a.awareness = 1.2; }
        else alarm(this, a, position.clone());
      } else if (a.def.bird === 'flock' || a.def.bird === 'sky') { a.awareness = 1.3; }
      else alarm(this, a, position.clone());
    }
  }

  /** Coyotes run down rabbits and turkeys, wolves run down deer, away from the player's eyes. */
  _startChase(ctx) {
    for (const p of this.list) {
      if (!p.alive || !p.isPredator || p.def.temper === 'territorial' || (p.state !== 'graze' && p.state !== 'wander')) continue;
      if (p.position.distanceTo(ctx.player) < 45) continue;
      const wants = p.species === 'coyote' ? ['rabbit', 'turkey'] : ['deer_doe', 'deer_buck', 'rabbit'];
      const prey = this.list.find((q) => q.alive && wants.includes(q.species) && q.position.distanceTo(p.position) < AI.chaseRange && q.state !== 'flee');
      if (!prey) continue;
      p.prey = prey; p.state = 'hunt'; p.stateT = 0;
      prey.awareness = 1.2; prey.fleeFrom = p.position; prey.state = 'flee'; prey.stateT = 0; prey.zigT = 0; prey._zig = true;
      return;
    }
  }

  // ---------------------------------------------------------------- spawning
  _trySpawn(initial) {
    const g = this.game, pl = g.player.position, T = this.terrain;
    for (let tries = 0; tries < 6; tries++) {
      const ang = Math.random() * Math.PI * 2, r = (initial ? 40 : TUNING.spawnMin) + Math.random() * (TUNING.spawnMax - (initial ? 40 : TUNING.spawnMin));
      const x = pl.x + Math.sin(ang) * r, z = pl.z + Math.cos(ang) * r;
      if (!this._spawnable(x, z)) continue;
      const biome = T.getBiomeAt?.(x, z) || 'valley', id = this._pickSpecies(biome);
      if (!id) continue;
      const S = SPECIES[id], y = S.bird === 'sky' ? T.getHeightAt(x, z) + 40 : T.getHeightAt(x, z);
      const room = Math.max(1, this.cap - this._live()), roll = S.group[0] + Math.floor(Math.random() * (S.group[1] - S.group[0] + 1));
      const a = this.spawn(id, _c.set(x, y, z), { group: S.group[1] > 1, count: Math.min(roll, S.bird ? room + 2 : room) });
      if (a) return a;
    }
    return null;
  }
  _spawnable(x, z) {
    const T = this.terrain;
    if (Math.abs(x) > this.bound - 10 || Math.abs(z) > this.bound - 10 || T.isWater?.(x, z)) return false;
    for (const L of Object.values(WORLD.locations)) if (L.type !== 'landmark' && L.type !== 'lake' && L.type !== 'edge' && Math.hypot(x - L.x, z - L.z) < L.radius + TUNING.townMargin) return false;
    if (T.getRoadInfo?.(x, z)?.distance < TUNING.roadMargin) return false;
    const n = T.getNormalAt?.(x, z, _v);
    return !(n && n.y < TUNING.maxSlope);
  }
  _pickSpecies(biome) {
    const h = this.game.sys('sky').timeOfDay ?? 12, night = h < 5 || h >= 20.5, dawnDusk = (h >= 5 && h < 8.5) || (h >= 17 && h < 20.5);
    const cnt = {}; for (const a of this.list) if (a.alive) cnt[a.species] = (cnt[a.species] || 0) + 1;
    let total = 0; const w = [];
    for (const [id, S] of Object.entries(SPECIES)) {
      let k = S.biomes[biome] || 0;
      if (!k) continue;
      if (S.hours === 'crepuscular') k *= dawnDusk ? 1.8 : night ? 0.6 : 0.8;
      else if (S.hours === 'dusk') k *= dawnDusk || night ? 1.5 : 0.8;
      else if (S.hours === 'night') k *= night ? 2.4 : dawnDusk ? 1 : 0.35;
      else if (S.hours === 'day') k *= night ? (id === 'bear' ? 0.4 : 0) : 1;
      if (id === 'bear' && (cnt.bear || 0) >= 1) k = 0;
      if (S.attack && Object.keys(cnt).filter((s) => SPECIES[s].attack).reduce((n, s) => n + cnt[s], 0) >= Math.max(3, this.cap * 0.5)) k *= 0.2;
      if (k > 0) { total += k; w.push([id, k]); }
    }
    let r = Math.random() * total;
    for (const [id, k] of w) if ((r -= k) <= 0) return id;
    return w[0]?.[0] || null;
  }

  serialize() { return {}; }
  deserialize() {}
  dispose() { this.clear(); this.material?.dispose(); if (this._ownAtlas) for (const t of Object.values(this._ownAtlas)) t?.dispose?.(); }
}
