import * as THREE from 'three';
import { sizeFor, lodBias } from '../render/TextureDetail.js';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { smoother01 } from '../characters/anim/Curves.js';
import { HorseRig, TUNING as RIG_TUNING, showHorseHitboxes } from './HorseRig.js';
import { HorseAnimator, TUNING as ANIM_TUNING } from './HorseAnimator.js';
import { HorseController, TUNING as CTRL_TUNING } from './HorseController.js';
import { resolveHorse } from './rig/Coats.js';
import { buildHorseAtlas, TUNING as TEX } from './rig/HorseTextures.js';
import { GAIT_NAMES } from './anim/Gaits.js';

/**
 * The 'horses' system (GAME_BIBLE §6 Horse, §11 horses/Horse APIs). Owns the horse material and atlas, Juniper
 * (playerHorse), whistling, mounting and dismounting (synced with the rider's animation so nothing teleports),
 * bonding, the ride and cinematic cameras, hoof effects and sound hooks, breath vapour and sweat.
 */
export const TUNING = {
  bondLevels: [0, 100, 300, 600], xpRide: 1, xpPat: 5, xpBrush: 15, xpFeed: 10, xpCalm: 10,
  mountTime: 1.3, dismountTime: 1.1, mountRadius: 2.6, headRadius: 1.7, maxDismountSpeed: 3.5,
  cinematicHold: 0.35, cinematicCut: 4.5, cameraBob: 0.025, breathEvery: 3.2, sweatRise: 1 / 70, sweatFall: 1 / 240,
  footstepSounds: true, showHitboxes: false,
};

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _hl = new THREE.Vector3(), _hr = new THREE.Vector3();
const _cam = new THREE.Vector3(), _v = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _frustum = new THREE.Frustum(), _pv = new THREE.Matrix4(), _sphere = new THREE.Sphere();
const RAY = { ignoreEntities: true };

/** Gameplay-facing horse (GAME_BIBLE §11 Horse). */
export class Horse {
  constructor(system, opts = {}) {
    this.system = system; this.game = system.game;
    this.look = resolveHorse(opts);
    this.name = this.look.name;
    this.material = system.material.clone(); // per-horse copy (same shader) so sweat can change roughness
    this.rig = new HorseRig(this.look, this.material);
    this.object3d = this.rig.object3d; this.object3d.userData.horse = this;
    this.position = this.object3d.position; this.saddleAttach = this.rig.attach.seat;
    this.animator = new HorseAnimator(this.rig);
    this.controller = new HorseController(this);
    this.bond = { level: 1, xp: 0 }; this.health = 100; this.maxHealth = 100; this.alive = true;
    this.stamina = this.controller.maxStamina; this.rider = null; this.riderReady = false; this.pelts = [];
    this.sweat = 0; this._breathT = Math.random() * 3; this._acc = 0; this._frame = 0;
    this.entity = {
      id: `horse:${this.look.seed}`, type: 'horse', faction: opts.faction || 'player', object3d: this.object3d, position: this.position,
      radius: 0.8, height: 1.7, alive: true, health: this.health, maxHealth: this.maxHealth, horse: this,
      takeDamage: (info) => this.takeDamage(info),
    };
    this.object3d.userData.entity = this.entity;
    for (const h of this.rig.hitboxes) h.userData.entity = this.entity;
    this.animator.onStep = (leg, gait, wx, wz, speed) => system._hoof(this, leg, gait, wx, wz, speed);
  }
  get yaw() { return this.object3d.rotation.y; }
  set yaw(v) { this.object3d.rotation.y = v; }
  /** 'idle'|'walk'|'trot'|'canter'|'gallop' */
  get gait() { return this.animator.gait; }
  get speed() { return Math.abs(this.controller.speed); }

  /** Runs to a world position (whistle). */
  call(position) { if (!this.alive || this.rider) return; this.controller.goTo(position); }
  /** Puts `rider` (the player) in the saddle with the synced mount animation. */
  mount(rider, opts) { return this.system.mountPlayer(this, opts); }
  dismount(opts) { return this.system.dismountPlayer(opts); }
  pat() { this.system._gainXp(this, TUNING.xpPat, 'pat'); this.animator.play('shake'); return true; }
  brush() { this.system._gainXp(this, TUNING.xpBrush, 'brush'); this.sweat = 0; return true; }
  /** @param {string} itemId apple | carrots | hay (from data/items.js effects) */
  feed(itemId) {
    const inv = this.game.sys('inventory'), item = (this.system.items || {})[itemId];
    if (!inv.has?.(itemId, 1)) return false;
    inv.remove(itemId, 1);
    const fx = item?.effects?.horse || {};
    this.stamina = Math.min(this.controller.maxStamina, this.stamina + (fx.stamina || 10));
    this.health = Math.min(this.maxHealth, this.health + (fx.health || 0));
    this.system._gainXp(this, fx.bondXp ?? TUNING.xpFeed, 'feed');
    this.animator.play('graze');
    return true;
  }
  takeDamage({ amount = 0, source = null, direction = null } = {}) {
    if (!this.alive || !(amount > 0)) return { killed: false };
    this.health = Math.max(0, this.health - amount); this.entity.health = this.health;
    this.game.events.emit(EVENTS.HORSE_HURT, { horse: this, amount, source });
    if (this.health <= 0) {
      this.alive = false; this.entity.alive = false;
      if (this.rider === this.game.player) this.system.dismountPlayer({ thrown: true });
      else if (this.rider) this.rider.onHorseDown?.(this); // Part 7: NPC riders are thrown
      this.animator.die(direction && direction.x > 0 ? 1 : -1);
      this.game.events.emit(EVENTS.HORSE_DIED, { horse: this });
      return { killed: true };
    }
    if (this.bond.level < 4 && !this.rider) { this.animator.play('panic'); this.controller.mode = 'idle'; }
    return { killed: false };
  }
  /** Brings a dead horse back (horse reviver, or respawn). */
  revive(health = 50) { this.alive = true; this.entity.alive = true; this.health = health; this.animator.revive(); }
  dispose() { this.system.horses.delete(this); this.game.entities.remove(this.entity); this.rig.reins?.removeFromParent(); this.object3d.removeFromParent(); this.rig.dispose(); this.material.dispose(); }
}

export default class HorseSystem extends System {
  constructor(game) {
    super(game);
    this.horses = new Set(); this.playerHorse = null; this.seq = null; this.cinematic = null; this._camHold = 0;
    this.stats = { horses: 0, animMs: 0 };
  }

  async init() {
    const g = this.game, t0 = performance.now();
    this.atlas = buildHorseAtlas(sizeFor('horse')); // Part 16: by texture detail
    this.material = new THREE.MeshStandardMaterial({
      map: this.atlas.map, normalMap: this.atlas.normalMap, roughnessMap: this.atlas.ormMap, metalnessMap: this.atlas.ormMap,
      vertexColors: true, roughness: 1, metalness: 1, envMapIntensity: 0.6,
    });
    this.material.normalScale.set(0.8, 0.8); this.material.name = 'horse';
    this.atlasMs = performance.now() - t0;
    try { this.items = (await import('../data/items.js')).ITEMS; } catch { this.items = {}; }
    // Juniper waits beside the player
    this.playerHorse = this.createHorse({ seed: 'juniper', name: 'Juniper', coat: 'bay', breed: 'mustang' });
    this.placeNearPlayer(this.playerHorse, 3.2);
    this._interactions(this.playerHorse);
    g.events.on(EVENTS.GAME_START, ({ newGame }) => {
      const h = this.playerHorse;
      if (!h) return;
      if (newGame) { this.placeNearPlayer(h, 0); this.mountPlayer(h, { instant: true }); }
      else if (!this._loadedMounted) this.placeNearPlayer(h, 3.2);
    });
    g.events.on(EVENTS.PLAYER_RESPAWNED, () => { const h = this.playerHorse; if (!h) return; if (!h.alive) h.revive(60); this.placeNearPlayer(h, 4); });
    g.debug?.addTuning('Horse system', TUNING);
    g.debug?.addTuning('Horse controller', CTRL_TUNING);
    g.debug?.addTuning('Horse animator', ANIM_TUNING);
    g.debug?.addTuning('Horse LOD', RIG_TUNING);
  }

  /** @param {{seed?, coat?, name?, breed?, faction?, parent?}} opts @returns {Horse} */
  createHorse(opts = {}) {
    const h = new Horse(this, opts);
    this.horses.add(h);
    (opts.parent === undefined ? this.game.scene : opts.parent)?.add(h.object3d);
    this.game.scene.add(h.rig.reins);
    this.game.entities.add(h.entity);
    return h;
  }

  /** Moves a horse beside the player (on the ground, facing the same way). */
  placeNearPlayer(h, dist = 3) {
    const pl = this.game.player, t = this.game.sys('terrain');
    const yaw = pl.yaw || 0, x = pl.position.x + Math.cos(yaw) * dist, z = pl.position.z - Math.sin(yaw) * dist;
    h.position.set(x, t.getHeightAt(x, z), z); h.yaw = yaw; h.controller.speed = 0; h.controller.stop(); h.animator.teleported();
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.game, pl = g.player, h = this.playerHorse;
    // whistle
    if (h && g.state === 'playing' && g.input.pressed('whistle') && pl.state !== 'mounted') this.whistle();
    for (const horse of this.horses) horse.controller.update(dt);
    this._sequence(dt);
    // rider follows the horse
    if (h && h.rider) {
      pl.position.copy(h.position); pl.yaw = h.yaw;
      pl.velocity.set(-Math.sin(h.yaw) * h.controller.speed, 0, -Math.cos(h.yaw) * h.controller.speed);
      if (h.riderReady && g.state === 'playing' && g.input.pressed('interact') && !g.ui.isScreenOpen()) this.dismountPlayer();
      g.cameraRig.setSpeedFactor(h.speed / 12.5);
      const prev = h._gaitName; if (h.gait !== prev) { h._gaitName = h.gait; g.events.emit(EVENTS.HORSE_GAIT, { gait: h.gait }); }
      // bonding: 1 XP per 100 m ridden
      h._ride = (h._ride || 0) + h.speed * dt;
      if (h._ride >= 100) { h._ride -= 100; this._gainXp(h, TUNING.xpRide, 'ride'); }
      g.ui.setBars({ horseStamina: (h.stamina / h.controller.maxStamina) * 100 });
      this._cinematic(dt, h);
    } else g.ui.setBars({ horseStamina: null });
    // head interaction: Q feeds or brushes while the pat prompt is showing
    if (h && this._headItem && g.interact.current === this._headItem && g.input.pressed('social')) {
      const inv = g.sys('inventory');
      const food = ['carrots', 'apple', 'hay'].find((id) => inv.has?.(id, 1));
      if (food) { h.feed(food); g.ui.notify(`${h.name} enjoyed the ${this.items[food]?.name?.toLowerCase() || food}.`); }
      else if (inv.has?.('horse_brush', 1)) { h.brush(); g.ui.notify(`You brush ${h.name}.`); }
    }
    if (TUNING.showHitboxes !== this._hb) { this._hb = TUNING.showHitboxes; showHorseHitboxes(this._hb); }
  }

  /** Animation after movement (and after the rider's human update), plus reins, sweat and breath. */
  lateUpdate(dt) {
    const g = this.game, cam = g.camera, t0 = performance.now();
    cam.getWorldPosition(_cam);
    _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _frustum.setFromProjectionMatrix(_pv);
    const terrain = g.sys('terrain');
    const env = this._env || (this._env = { x: 0, y: 0, z: 0, yaw: 0, scale: 1, lod: 0, ground: (x, z) => terrain.getHeightAt(x, z) });
    for (const h of this.horses) {
      const o = h.object3d;
      env.x = o.position.x; env.y = o.position.y; env.z = o.position.z; env.yaw = o.rotation.y; env.scale = o.scale.x;
      const dist = o.position.distanceTo(_cam), lod = h.forceLOD ?? h.rig.updateLOD(dist, lodBias()); // Part 16: High keeps detail further out
      if (h.forceLOD !== undefined) h.rig.setLOD(h.forceLOD);
      _sphere.center.set(env.x, env.y + 1.1, env.z); _sphere.radius = 2.5 * env.scale;
      const onScreen = lod < 3 && _frustum.intersectsSphere(_sphere);
      const every = h.rider ? 1 : !onScreen ? 6 : lod >= 2 ? 2 : 1;
      h._acc += dt; h.animator.ridden = !!h.rider;
      if (++h._frame % every === 0 || h._acc > 0.4) { env.lod = onScreen || h.rider ? lod : 3; h.animator.update(h._acc, env); h._acc = 0; }
      // rider gait info, reins, sweat, breath
      if (h.rider?.human && h.riderReady) h.rider.human.setRideMotion({ w: h.animator.w, phase: h.animator.phase, speed: h.speed });
      if (h.rig.reins.visible && lod < 2) {
        const hu = h.rider?.human;
        if (hu && h.riderReady) { hu.getAttach('handL').getWorldPosition(_hl); hu.getAttach('handR').getWorldPosition(_hr); h.rig.updateReins([_hl, _hr]); }
        else h.rig.updateReins(null);
      }
      const galloping = h.gait === 'gallop';
      h.sweat = Math.min(1, Math.max(0, h.sweat + (galloping ? TUNING.sweatRise : -TUNING.sweatFall) * dt));
      h.material.roughness = 1 - 0.45 * h.sweat; h.material.envMapIntensity = 0.6 + 0.5 * h.sweat;
      this._breath(h, dt);
    }
    this.stats.horses = this.horses.size;
    this.stats.animMs += (performance.now() - t0 - this.stats.animMs) * 0.1;
  }

  // ---------------------------------------------------------------- whistle
  /** Calls the player's horse: runs over from up to 250 m, or appears just out of sight further away. */
  whistle() {
    const g = this.game, h = this.playerHorse, pl = g.player;
    if (!h || !h.alive) { g.ui.notify(h ? `${h.name} can't come.` : 'You have no horse.'); return false; }
    g.audio.play('whistle_call', { position: pl.position });
    g.events.emit(EVENTS.HORSE_CALLED, {});
    const d = h.position.distanceTo(pl.position);
    if (d > CTRL_TUNING.call.range) {
      // appear behind the camera, out of view, then run in
      const cy = g.cameraRig.yaw, r = CTRL_TUNING.call.spawnBehind;
      for (const off of [0, 0.6, -0.6, 1.2, -1.2]) {
        const x = pl.position.x + Math.sin(cy + off) * r, z = pl.position.z + Math.cos(cy + off) * r;
        if ((g.sys('terrain').getWaterDepth?.(x, z) || 0) > 0.5) continue;
        h.position.set(x, g.sys('terrain').getHeightAt(x, z), z); h.yaw = Math.atan2(-(pl.position.x - x), -(pl.position.z - z)); h.animator.teleported();
        break;
      }
    }
    h.call(pl.position);
    return true;
  }

  // ---------------------------------------------------------------- mounting
  /** Mount the player on `horse`. opts.instant skips the animation (new game, loading). */
  mountPlayer(horse, { instant = false } = {}) {
    const g = this.game, pl = g.player, hu = pl.human;
    if (!horse || !horse.alive || horse.rider || this.seq || pl.state === 'mounted' || pl.state === 'dead') return false;
    _v.copy(pl.position).sub(horse.position);
    const right = Math.cos(horse.yaw) * _v.x - Math.sin(horse.yaw) * _v.z; // + = horse's right side
    const side = right >= 0 ? 'R' : 'L';
    pl.state = 'mounted'; pl.horse = horse; horse.rider = pl; horse.riderReady = false;
    pl.velocity.set(0, 0, 0); pl.crouched = false; if (pl.aiming) pl._setAiming?.(false);
    horse.controller.stop(); horse.controller.speed = 0; horse.controller.level = 0;
    g.cameraRig.setMode('ride');
    if (!hu) { horse.riderReady = true; pl.object3d.visible = false; g.events.emit(EVENTS.PLAYER_MOUNTED, { horse }); return true; }
    const seat = horse.saddleAttach;
    horse.object3d.updateMatrixWorld(true);
    seat.attach(hu.object3d);
    const target = new THREE.Vector3(0, -0.92 * (hu.look.height || 1) / horse.object3d.scale.x, 0.02);
    if (instant) {
      hu.object3d.position.copy(target); hu.object3d.quaternion.identity(); hu.teleported(); hu.setState('ride', { fade: 0.01 });
      horse.riderReady = true; g.events.emit(EVENTS.PLAYER_MOUNTED, { horse });
      return true;
    }
    hu.setState('mount', { hand: side === 'R' ? 'L' : undefined }); // the mirrored clip mounts from the right
    this.seq = { kind: 'mount', horse, t: 0, dur: TUNING.mountTime, from: hu.object3d.position.clone(), fromQ: hu.object3d.quaternion.clone(), to: target, toQ: new THREE.Quaternion() };
    return true;
  }

  /** Dismount to the free side. opts.thrown when the horse falls. */
  dismountPlayer({ thrown = false } = {}) {
    const g = this.game, pl = g.player, h = pl.horse, hu = pl.human;
    if (!h || this.seq || pl.state !== 'mounted') return false;
    if (!thrown && h.speed > TUNING.maxDismountSpeed) { g.ui.notify('Slow down to get off.'); return false; }
    // pick a side with room to stand
    let side = 'L';
    for (const s of ['L', 'R']) {
      h.rig.attach['mount' + s].getWorldPosition(_p);
      _v.set(_p.x - h.position.x, 0, _p.z - h.position.z).normalize();
      const hit = g.physics.raycast(_s.set(h.position.x, h.position.y + 0.9, h.position.z), _v, 1.2, RAY);
      if (!hit) { side = s; break; }
    }
    h.rig.attach['mount' + side].getWorldPosition(_p);
    _p.y = g.sys('terrain').getHeightAt(_p.x, _p.z);
    h.controller.speed = thrown ? h.controller.speed : 0;
    if (!hu) { this._finishDismount(h, _p.clone()); return true; }
    if (thrown) { this._finishDismount(h, _p.clone()); hu.setState('death', { impulse: { x: -Math.sin(h.yaw), y: 0, z: -Math.cos(h.yaw) } }); return true; }
    hu.setState('dismount', { hand: side === 'R' ? 'L' : undefined });
    const to = h.saddleAttach.worldToLocal(_p.clone());
    h.riderReady = false;
    this.seq = { kind: 'dismount', horse: h, t: 0, dur: TUNING.dismountTime, from: hu.object3d.position.clone(), fromQ: hu.object3d.quaternion.clone(), to, toQ: new THREE.Quaternion(), world: _p.clone() };
    return true;
  }

  _finishDismount(h, world) {
    const g = this.game, pl = g.player, hu = pl.human;
    if (hu) { g.scene.attach(hu.object3d); hu.object3d.rotation.set(0, h.yaw, 0); hu.object3d.scale.setScalar(hu.look.height || 1); }
    else pl.object3d.visible = true;
    pl.state = 'onFoot'; pl.horse = null; h.rider = null; h.riderReady = false;
    pl.position.copy(world); pl.yaw = h.yaw; pl.velocity.set(0, 0, 0); pl._wasGrounded = true; pl._fallTop = world.y;
    if (hu) { hu.object3d.position.copy(world); hu.teleported(); hu.setRideMotion(null); }
    g.cameraRig.setMode('follow'); g.cameraRig.override = null; this.cinematic = null;
    g.events.emit(EVENTS.PLAYER_DISMOUNTED, { horse: h });
  }

  /** Moves the rider along the mount/dismount path while the human plays its clip. */
  _sequence(dt) {
    const s = this.seq;
    if (!s) return;
    const g = this.game, pl = g.player, hu = pl.human;
    s.t = Math.min(1, s.t + dt / s.dur);
    // ground → stirrup → over the horse: rise in the middle third; reverse for dismounting
    const k = s.kind === 'mount' ? smoother01((s.t - 0.12) / 0.72) : smoother01((s.t - 0.08) / 0.75);
    const o = hu.object3d;
    o.position.lerpVectors(s.from, s.to, k);
    o.position.y += Math.sin(Math.PI * k) * 0.12;
    o.quaternion.slerpQuaternions(s.fromQ, s.toQ, smoother01(s.t * 1.4));
    if (s.t >= 1) {
      this.seq = null;
      if (s.kind === 'mount') { s.horse.riderReady = true; g.events.emit(EVENTS.PLAYER_MOUNTED, { horse: s.horse }); }
      else { this._finishDismount(s.horse, s.world); hu.setState('idle', { fade: 0.2 }); }
    }
    void pl;
  }

  // ---------------------------------------------------------------- cameras
  _cinematic(dt, h) {
    const g = this.game, rig = g.cameraRig;
    const held = g.state === 'playing' && g.input.isDown('camera');
    this._camHold = held ? this._camHold + dt : 0;
    if (this._camHold > TUNING.cinematicHold && !this.cinematic) {
      this.cinematic = { t: 0, shot: 0, pos: new THREE.Vector3(), look: new THREE.Vector3() };
      rig.override = (cam, rawDt) => this._cineShot(cam, rawDt);
    } else if (!held && this.cinematic) { this.cinematic = null; rig.override = null; rig.snap(); }
    // subtle ride bob on the follow camera
    if (!this.cinematic) rig.bob = Math.sin(h.animator.phase * Math.PI * 2 * (h.gait === 'trot' ? 2 : 1)) * TUNING.cameraBob * Math.min(1, h.speed / 4);
  }
  _cineShot(cam, rawDt) {
    const c = this.cinematic, h = this.playerHorse;
    if (!c || !h) return;
    c.t += rawDt;
    if (c.t > TUNING.cinematicCut || c.shot === 0) { c.t = 0; c.shot = (c.shot % 4) + 1; }
    // wide side and front-quarter angles that travel with the horse
    const shots = [null, [9, 1.6, 2.5], [-8, 2.4, -6], [7, 1.2, -9], [-10, 3.5, 4]];
    const [side, y, fwd] = shots[c.shot], yaw = h.yaw, cs = Math.cos(yaw), sn = Math.sin(yaw);
    const x = h.position.x + side * cs + fwd * -sn, z = h.position.z - side * sn + fwd * -cs;
    const gy = this.game.sys('terrain').getHeightAt(x, z);
    cam.position.set(x, Math.max(gy + 0.8, h.position.y + y), z);
    cam.lookAt(h.position.x - sn * 2, h.position.y + 1.3, h.position.z - cs * 2);
  }

  // ---------------------------------------------------------------- effects, sounds, bonding
  _hoof(h, leg, gait, wx, wz, speed) {
    const g = this.game, t = g.sys('terrain'), vfx = g.sys('vfx');
    if (h.rig.lod >= 2) return;
    const y = t.getHeightAt(wx, wz), surface = t.getSurfaceAt?.(wx, wz) || 'dirt', depth = t.getWaterDepth?.(wx, wz) || 0;
    const wet = g.sys('weather').wetness || 0, snow = surface === 'snow' || (g.sys('weather').snowCover || 0) > 0.4;
    _p.set(wx, y + 0.02, wz);
    const kind = depth > 0.08 ? 'water' : snow ? 'snow' : wet > 0.45 || surface === 'mud' ? 'mud' : surface;
    if (TUNING.footstepSounds) g.audio.play(`hoof_${gait === 'idle' ? 'walk' : gait}_${kind}`, { position: _p });
    if (kind === 'water') { vfx.spawn('water_splash', { position: _p.setY(t.getWaterLevelAt?.(wx, wz) ?? y), scale: Math.min(1.4, 0.5 + speed / 8) }); return; }
    if (kind === 'snow') vfx.spawn('snow_puff', { position: _p });
    else if (kind === 'mud') vfx.spawn('mud_splash', { position: _p });
    else if (speed > 3 && kind !== 'rock' && kind !== 'wood') vfx.spawn('hoof_dust', { position: _p, count: speed > 9 ? 3 : 1 });
    if (kind !== 'rock' && kind !== 'wood' && kind !== 'grass') vfx.decal('hoofprint', { position: _p.setY(y + 0.015), angle: h.yaw + Math.PI, lifetime: kind === 'snow' ? 90 : 40 });
    void leg;
  }

  _breath(h, dt) {
    const g = this.game, sky = g.sys('sky'), hour = sky.timeOfDay ?? 10;
    const cold = hour < 8.5 || hour > 19.5 || h.position.y > 160 || g.sys('terrain').getBiomeAt?.(h.position.x, h.position.z) === 'snow';
    if (!cold || h.rig.lod > 0) return;
    h._breathT -= dt * (1 + Math.min(2, h.speed / 5));
    if (h._breathT > 0) return;
    h._breathT = TUNING.breathEvery * (0.8 + Math.random() * 0.4);
    h.rig.attach.muzzle.getWorldPosition(_p);
    _v.set(-Math.sin(h.yaw), -0.4, -Math.cos(h.yaw));
    g.sys('vfx').spawn('breath_vapor', { position: _p, direction: _v });
  }

  _gainXp(h, xp, reason) {
    const L = TUNING.bondLevels;
    h.bond.xp += xp;
    let level = 1; for (let i = 0; i < L.length; i++) if (h.bond.xp >= L[i]) level = i + 1;
    if (level > h.bond.level) {
      h.bond.level = level;
      this.game.events.emit(EVENTS.HORSE_BOND, { level, horse: h });
      const perks = ['', '', 'She trusts you enough to rear on command.', 'Skid stops and tighter turns unlocked.', 'She stays calm under gunfire.'];
      this.game.ui.notify(`Bond with ${h.name}: level ${level}. ${perks[level]}`, { duration: 5 });
    }
    void reason;
  }

  /** Added in Part 9: makes `h` Eli's horse (bought at a livery); the old one stays where it is. */
  setPlayerHorse(h) {
    if (!h || h === this.playerHorse) return;
    if (this.playerHorse?.rider === this.game.player) this.dismountPlayer({ thrown: false });
    this.stabled = this.stabled || [];
    if (this.playerHorse) this.stabled.push(this.playerHorse);
    this.stabled = this.stabled.filter((x) => x !== h);
    this.playerHorse = h;
    this._interactions(h);
  }
  _interactions(h) {
    const g = this.game, pl = () => g.player;
    if (this._mountItem) { g.interact.unregister(this._mountItem); g.interact.unregister(this._headItem); } // Part 9: a new horse replaces the old prompts
    const free = () => pl().state === 'onFoot' && h.alive && !h.rider && !this.seq && !pl().carrying; // Part 6: not with a body in arms
    this._mountItem = g.interact.register({
      object: h.object3d, radius: TUNING.mountRadius, label: `Mount ${h.name}`, key: 'interact', condition: free,
      onInteract: () => this.mountPlayer(h),
    });
    this._headPos = new THREE.Vector3();
    this._headItem = g.interact.register({
      position: this._headPos, radius: TUNING.headRadius, priority: 0.02, key: 'interact', condition: free,
      label: () => {
        const inv = g.sys('inventory');
        const extra = ['carrots', 'apple', 'hay'].some((id) => inv.has?.(id, 1)) ? ' · Q feed' : inv.has?.('horse_brush', 1) ? ' · Q brush' : '';
        return `Pat ${h.name}${extra}`;
      },
      onInteract: () => { h.pat(); g.ui.notify(`You pat ${h.name}.`); },
    });
    // keep the head position current (cheap: once per frame from the head bone)
    if (!this._headWrapped) {
      this._headWrapped = true;
      const orig = this.lateUpdate.bind(this);
      this.lateUpdate = (dt, raw) => { orig(dt, raw); this.playerHorse?.rig.attach.muzzle.getWorldPosition(this._headPos); };
    }
  }

  serialize() {
    const h = this.playerHorse;
    if (!h) return null;
    return { name: h.name, look: { seed: h.look.seed, coat: h.look.coat, breed: h.look.breed }, position: h.position.toArray(), yaw: h.yaw,
      bond: { ...h.bond }, health: h.health, stamina: h.stamina, mounted: h.rider === this.game.player };
  }
  deserialize(d) {
    const h = this.playerHorse;
    if (!d || !h) return;
    if (Array.isArray(d.position)) { h.position.fromArray(d.position); h.animator.teleported(); }
    if (typeof d.yaw === 'number') h.yaw = d.yaw;
    if (d.bond) { h.bond.level = d.bond.level || 1; h.bond.xp = d.bond.xp || 0; }
    if (typeof d.health === 'number') { h.health = Math.max(1, d.health); }
    if (typeof d.stamina === 'number') h.stamina = d.stamina;
    if (d.name) h.name = d.name;
    this._loadedMounted = !!d.mounted;
    if (d.mounted) this.mountPlayer(h, { instant: true });
  }
}

export { HorseSystem, GAIT_NAMES };
