import * as THREE from 'three';
import { sizeFor } from '../render/TextureDetail.js';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { WEAPONS, HIT_ZONES } from '../data/weapons.js';
import { buildWeaponAtlas, TUNING as TEX } from './WeaponTextures.js';
import { buildWeapon, cloneWeapon, MODEL_IDS } from './WeaponModels.js';
import { Arsenal, weaponClass, AIM_STATE } from './Weapons.js';
import { registerCombatEffects, SURFACE_IMPACT } from './Effects.js';
import { spreadDir, falloff, castShot, Arrows } from './Ballistics.js';
import { armIK, aimArm, shoulderGun } from './HandIK.js';
import { CombatHUD } from './CombatHUD.js';
import { WeaponWheel } from './WeaponWheel.js';
import { Melee } from './Melee.js';
import { Lasso } from './Lasso.js';

/**
 * The 'combat' system (GAME_BIBLE §6, §11 combat API): Eli's guns, aiming over the shoulder, hitscan shots with
 * stat-based spread and bloom, shotgun pellets, arcing arrows that stick, recoil (camera kick + weapon kick +
 * recovery), reloading from carried ammo, dry fire, holstering, damage through entity.takeDamage with hit zones,
 * hit markers and the kill cue, soft aim assist and target lock, shooting from the saddle, and every gunplay effect
 * through the shared VFX system. NPCs (Part 7) shoot through shootFrom() with their own Arsenal.
 */
export const TUNING = {
  bloomPerShot: { revolver: 1.2, repeater: 0.9, shotgun: 0.6, rifle: 1.6, bow: 0.3 },
  bloomDecay: 2.6, bloomMove: 1.6, bloomAir: 3, bloomMax: 4, hipBloom: 0.8,
  // the Bible's spread is the full cone angle; a settled aim uses `settled` of it and bloom widens it from there
  settled: 0.5,
  kick: { revolver: [0.045, 0.012], repeater: [0.04, 0.01], shotgun: [0.085, 0.02], rifle: [0.07, 0.008], bow: [0.006, 0.002] }, // [pitch, yaw] radians
  kickRecover: 9, kickRecoverShare: 0.75, // most of the kick comes back on its own
  zoom: { revolver: null, repeater: 40, shotgun: null, rifle: 30, bow: 42 },
  hipFireTime: 0.7, autoHolster: 8, mountedLift: 0.95,
  assist: { cone: 3.5, coneTouch: 7, friction: 0.45, frictionTouch: 0.3, pull: 0.9, pullTouch: 2.4, range: 70 },
  lock: { cone: 12, coneTouch: 26, time: 0.16, range: 60 },
  bowDraw: 0.75, bowMinPower: 0.35, flyby: 2.5,
  ikWeight: 1, aimCorrection: 1, killCue: 0.12, flashAhead: 0.7,
};

const LIVING = new Set(['player', 'npc', 'animal', 'horse']);
/** Butt plate centre in each long gun's space (the palm is the origin), where it meets the shoulder. */
/** Added in Part 7 (exported for NPC shooters): where each long gun's butt sits against the shoulder. */
export const BUTT = { repeater: new THREE.Vector3(0, -0.035, 0.375), shotgun: new THREE.Vector3(0, -0.04, 0.365), rifle: new THREE.Vector3(0, -0.03, 0.375) };
const MUZZLE_FX = { revolver: 'muzzle_flash_pistol', repeater: 'muzzle_flash_rifle', rifle: 'muzzle_flash_rifle', shotgun: 'muzzle_flash_shotgun' };
const _cam = new THREE.Vector3(), _dir = new THREE.Vector3(), _o = new THREE.Vector3(), _m = new THREE.Vector3(), _p = new THREE.Vector3();
const _d2 = new THREE.Vector3(), _t = new THREE.Vector3(), _right = new THREE.Vector3(), _pole = new THREE.Vector3(), _v = new THREE.Vector3();
const _q = new THREE.Quaternion(), _inv = new THREE.Matrix4();

export default class CombatSystem extends System {
  constructor(game) {
    super(game);
    this.bloom = 0; this.aimHeld = false; this.hipFireT = 0; this.idleT = 0; this._kick = 0; this._kickYaw = 0;
    this.lockT = 0; this.lockTarget = null; this.onTarget = null; this.aimPoint = new THREE.Vector3(); this._mountedAimOn = false;
    this.forceAim = false; this.suspendAssist = false;
    this.stats = { shots: 0, hits: 0, kills: 0 };
    this._templates = {};
  }

  async init() {
    const g = this.game, q = g.quality?.name;
    this.atlas = buildWeaponAtlas(sizeFor('weapon')); // Part 16: by texture detail
    this.material = new THREE.MeshStandardMaterial({
      map: this.atlas.map, normalMap: this.atlas.normalMap, roughnessMap: this.atlas.ormMap, metalnessMap: this.atlas.ormMap,
      vertexColors: true, envMapIntensity: 0.9,
    });
    this.material.normalScale.set(0.8, 0.8);
    this.lineMaterial = new THREE.LineBasicMaterial({ color: 0xe6dcc4 });
    const vfx = g.sys('vfx');
    if (!vfx.isFallback) registerCombatEffects(vfx);
    this.arrows = new Arrows(g, this.material);
    this.hud = new CombatHUD(g, { onReload: () => this.reload() });
    this.wheel = new WeaponWheel(g, this);
    this.melee = new Melee(g, this);
    this.lasso = new Lasso(g, this);
    const inv = g.sys('inventory');
    this._source = {
      buildModel: (id) => this._model(id),
      ammoCount: (ammo) => inv.count?.(ammo) ?? 0,
      takeAmmo: (ammo, n) => { const have = Math.min(n, inv.count?.(ammo) ?? 0); if (have > 0) inv.remove(ammo, have); return have; },
    };
    this.arsenal = new Arsenal(this._source, g.player.human || null);
    for (const [id, w] of Object.entries(WEAPONS)) if (w.starter) this.arsenal.give(id);
    // warm the weapon material with a hidden revolver so its shader compiles during loading
    this._warm = this._model('revolver').root; this._warm.visible = false; this._warm.userData.warmup = true; g.scene.add(this._warm);
    g.events.on(EVENTS.PLAYER_DIED, () => { this.aimHeld = false; this.hipFireT = 0; this.arsenal.holster(true); this.melee.stop(); this.lasso.cancel(); });
    g.events.on(EVENTS.PLAYER_DISMOUNTED, () => this._endMountedAim());
    g.debug?.addTuning('Combat', TUNING);
  }

  // ---------------------------------------------------------------- API (GAME_BIBLE §11)
  /** Id of the equipped weapon (or null). */
  get current() { return this.arsenal?.current || null; }
  /** True while Eli aims (held aim, or briefly after firing from the hip). */
  get isAiming() { return !!this.arsenal && (this.aimHeld || this.hipFireT > 0 || this.forceAim) && this._isGun(this.current); }
  /** Equip an owned weapon (draws it if a weapon was in hand). */
  equip(id) {
    const ok = this.arsenal.equip(id);
    if (ok) this.game.events.emit(EVENTS.WEAPON_EQUIPPED, { weaponId: id });
    return ok;
  }
  holster() { return this.arsenal.holster(); }
  /** Draw the equipped weapon. Added in Part 6. */
  draw() { return this.arsenal.draw(); }
  /** Fire the equipped weapon at the screen centre (as the fire button does). */
  fire() { return this._playerFire(); }
  reload() {
    const ok = this.arsenal.reload();
    if (ok) { this._reloadFx(); this.game.audio.play(`reload_${this.current}`, { position: this.game.player.position }); }
    return ok;
  }
  /**
   * Added in Part 6: fires the equipped gun exactly at a world point, ignoring the rate of fire (Focus uses this
   * after snapping the camera onto each mark). @returns {boolean} whether a shot went off
   */
  fireAt(point, { spreadScale = 0, recoil = 0.5 } = {}) {
    const g = this.game, A = this.arsenal, pl = g.player, id = A.current;
    if (!this._isGun(id) || !A.drawn || A.rounds <= 0) return false;
    if (A.state === 'nocking') A.state = 'ready';
    A.cool = 0;
    if (!A.fire()) return false;
    this.stats.shots++;
    const m = A.models[id];
    g.camera.getWorldPosition(_cam);
    m?.root.updateWorldMatrix(true, true);
    m?.sockets.muzzle?.getWorldPosition(_m) ?? _m.copy(pl.position).setY(pl.position.y + 1.4);
    const dir = new THREE.Vector3().subVectors(point, id === 'bow' ? _m : _cam).normalize();
    this.shootFrom({ shooter: pl.entity, weaponId: id, origin: id === 'bow' ? _m.clone() : _cam.clone(), direction: dir, muzzle: _m.clone(), spreadScale, power: 1 });
    this._muzzleFx(id, m);
    if (recoil > 0) g.cameraRig.shake((id === 'shotgun' ? 0.3 : 0.16) * recoil, 0.08);
    return true;
  }
  /** Added in Part 6: how much of a hit from `direction` gets through Eli's guard (1 = all, 0 = dodged). */
  blockFactor(direction) { return this.melee ? this.melee.blockFactor(direction) : 1; }
  /** Added in Part 6: the latest camera-ray hit while aiming (entity, hitZone, point, object) or null. */
  get aimHit() { return this._aimHit || null; }
  /** Added in Part 6: adds a weapon to Eli's arsenal (shops, loot, missions). */
  give(id) { return this.arsenal.give(id); }
  /** Added in Part 6: owned weapon ids. */
  get owned() { return [...this.arsenal.owned]; }

  /**
   * Applies weapon damage to an entity with the Bible's hit-zone multipliers and emits combat:hit / combat:kill.
   * @param {object} entity @param {{amount?, weaponId?, zone?, source?, point?, direction?, distance?}} info
   * amount defaults to the weapon's damage (× falloff by distance); returns { amount, killed }.
   */
  applyDamage(entity, info = {}) {
    if (!entity || entity.alive === false || typeof entity.takeDamage !== 'function') return { amount: 0, killed: false };
    const w = WEAPONS[info.weaponId] || null, zone = info.zone || 'torso';
    let amount = info.amount ?? (w ? w.damage * falloff(info.distance ?? 0, w.range) : 0);
    if (info.amount === undefined) amount *= HIT_ZONES[zone] ?? 1;
    const res = entity.takeDamage({ amount, zone, source: info.source || null, weaponId: info.weaponId || null, point: info.point || null, direction: info.direction || null }) || {};
    const killed = !!res.killed, g = this.game;
    g.events.emit(EVENTS.COMBAT_HIT, { target: entity, zone, amount, killed });
    if (killed) g.events.emit(EVENTS.COMBAT_KILL, { target: entity, weaponId: info.weaponId || null, headshot: zone === 'head' });
    if (info.source === g.player.entity) {
      this.stats.hits++; if (killed) this.stats.kills++;
      this.hud.hit(killed);
      g.audio.play(killed ? 'kill_cue' : 'hit_marker', { volume: 0.6 });
      g.input.haptic(killed ? 40 : 15);
    }
    return { amount, killed };
  }

  /**
   * Added in Part 6: a shot from any shooter (NPCs in Part 7). Casts the shot(s) with the weapon's spread, plays
   * the muzzle, tracer and impact effects and applies damage. @returns the hits
   */
  shootFrom({ shooter = null, weaponId, origin, direction, muzzle = null, spreadScale = TUNING.settled, power = 1 }) {
    const w = WEAPONS[weaponId];
    if (!w) return [];
    const g = this.game, from = muzzle || origin, hits = [];
    if (weaponId === 'bow') {
      this.arrows.shoot(_p.copy(from), direction, power, (hit) => this._arrowHit(hit, shooter, power), shooter);
      return hits;
    }
    const pellets = w.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const d = spreadDir(direction, w.spread * 0.5 * spreadScale, new THREE.Vector3());
      const hit = castShot(g, origin, d, w.range, shooter);
      hits.push(hit);
      this._impact(hit, shooter, weaponId, i === 0);
      if (i < 2) g.sys('vfx').spawn('tracer', { position: from, direction: _d2.subVectors(hit.point, from).normalize(), distance: from.distanceTo(hit.point) });
      this._flyby(origin, hit.point, shooter);
    }
    g.events.emit(EVENTS.WEAPON_FIRED, { weaponId, position: from.clone(), shooter });
    g.audio.play(`gun_${weaponId}`, { position: from });
    return hits;
  }

  // ---------------------------------------------------------------- per frame
  update(dt, rawDt) {
    const g = this.game, pl = g.player, A = this.arsenal, input = g.input;
    if (!A) return;
    const mounted = pl.state === 'mounted';
    const wheelOpen = this.wheel.update();
    const can = !wheelOpen && g.state === 'playing' && !g.ui.isScreenOpen() && pl.control !== false && !pl.busy && pl.state !== 'dead' && pl.state !== 'cutscene' && (!mounted || pl.horse?.riderReady);
    // weapon timers and moving parts
    const ev = A.update(dt);
    if (ev === 'reloaded') g.events.emit(EVENTS.WEAPON_RELOADED, { weaponId: A.current });
    this.arrows.update(dt);
    this.hipFireT = Math.max(0, this.hipFireT - rawDt);
    // what the hands are doing: a gun, the lasso, or fists/knife
    if (can && input.pressed('holster')) { if (A.drawn) { A.holster(); A.unarmed = true; } else { A.unarmed = false; A.draw(); } }
    const carrying = !!pl.carrying;
    this.mode = carrying ? 'carry' : A.unarmed ? 'melee' : A.current === 'lasso' ? 'lasso' : this._isGun(A.current) ? 'gun' : 'melee';
    const gun = this.mode === 'gun';
    const wasAim = this.aimHeld;
    this.aimHeld = can && gun && input.isDown('aim');
    if (this.aimHeld && !wasAim) this._startLock();
    if ((this.aimHeld || (can && input.pressed('fire'))) && gun && !A.drawn && A.state !== 'drawing') A.draw();
    if (this.mode === 'lasso' && !A.drawn && A.state !== 'drawing' && can && (input.isDown('aim') || input.pressed('fire'))) A.draw();
    if (this.mode === 'melee' && !A.unarmed && A.current === 'knife' && !A.drawn && A.state !== 'drawing' && can && (input.isDown('aim') || input.pressed('fire'))) A.draw();
    if (can && gun && input.pressed('reload')) this.reload();
    const focus = g.get('focus');
    if (can && gun && input.pressed('fire') && !focus?.active && !focus?.executing) this._playerFire(); // in Focus, fire marks instead
    // brawling and the rope
    if (this.mode === 'melee') this.melee.update(dt, rawDt, can); else this.melee.stop();
    this.lasso.update(dt, rawDt, can, this.mode === 'lasso' && A.drawn && A.state === 'ready');
    // auto-holster after a while without aiming (not the knife or rope mid-use)
    if (A.drawn && !this.isAiming && A.state === 'ready' && !this.lasso.active && !this.melee.blocking && !this.melee.attack) { if ((this.idleT += rawDt) > TUNING.autoHolster) { A.holster(); this.idleT = 0; } }
    else this.idleT = 0;
    // pose: the aim clip for this weapon class (Player handles on-foot aim mode; the saddle is handled here)
    const h = pl.human;
    if (h && A.drawn && this.isAiming && A.state !== 'reloading') {
      const want = AIM_STATE[A.cls];
      if (h.upperState !== want && h.upperState !== 'draw') h.setState(want);
    }
    if (mounted) this._mountedAim(can); else if (this._mountedAimOn) this._endMountedAim();
    // bloom: shots, moving, being in the air
    const speed = Math.hypot(pl.velocity.x, pl.velocity.z);
    const moveBloom = (mounted ? Math.min(1, (pl.horse?.speed || 0) / 8) * 1.5 : Math.min(1, speed / 4.2)) * TUNING.bloomMove + (!pl.grounded && !mounted ? TUNING.bloomAir : 0);
    this.bloom = Math.max(moveBloom, this.bloom - TUNING.bloomDecay * dt);
    if (A.current === 'bow') A.draw01 = this.isAiming && A.state === 'ready' ? Math.min(1, A.draw01 + rawDt / TUNING.bowDraw) : Math.max(0, A.draw01 - rawDt * 3);
    this._assist(rawDt, can);
    this._recoverKick(rawDt);
    const cam = g.cameraRig;
    cam.zoomFov = this.isAiming ? (TUNING.zoom[A.current] ?? null) : null;
    // HUD
    const w = A.weapon, spread = w ? w.spread * 0.5 * this._spreadScale() : 0;
    const fov = (g.camera.fov * Math.PI) / 360, gapPx = Math.tan((spread * Math.PI) / 180) / Math.tan(fov) * (window.innerHeight / 2) + 4;
    this.hud.update(rawDt, {
      aiming: this.isAiming && A.drawn, gap: A.current === 'bow' ? 4 + (1 - A.draw01) * 14 : gapPx, onTarget: !!this.onTarget, bow: A.current === 'bow',
      rounds: A.rounds, reserve: A.reserve(), name: gun ? WEAPONS[A.current].name : '', show: A.drawn,
    });
  }

  /** After animation (characters run first): left hand on the foregrip, barrel onto the aim point, bow string. */
  lateUpdate() {
    const g = this.game, A = this.arsenal, h = g.player.human;
    if (this._nocked?.parent && !(A?.drawn && A.current === 'bow' && this.isAiming)) this._nocked.removeFromParent();
    if (!A || !h || !A.drawn || !h.posedThisFrame) return;
    const m = A.models[A.current];
    if (!m) return;
    const cls = A.cls, aiming = this.isAiming && A.state !== 'reloading';
    if (aiming && TUNING.aimCorrection > 0 && m.sockets.muzzle) {
      h.object3d.updateWorldMatrix(true, true);
      if (cls === 'bow') aimArm(h.getBone('upperArmL'), h.getBone('handL'), m.sockets.muzzle, this.aimPoint, TUNING.aimCorrection);
      else if (cls === 'long') shoulderGun(h, h.getAttach('handR'), BUTT[A.current] || BUTT.repeater, this.aimPoint, TUNING.aimCorrection);
      else aimArm(h.getBone('upperArmR'), h.getBone('handR'), m.sockets.muzzle, this.aimPoint, TUNING.aimCorrection);
    }
    if (cls === 'long' && m.sockets.foregrip && (aiming || A.state === 'reloading')) {
      m.root.updateWorldMatrix(true, true);
      m.sockets.foregrip.getWorldPosition(_t);
      // elbow bends down and out to the left of the body
      h.getBone('chest').getWorldPosition(_pole); g.player.object3d.getWorldDirection(_v);
      _right.set(_v.z, 0, -_v.x); _pole.addScaledVector(_right, TUNING.ikWeight * 0.4).y -= 0.5;
      armIK([h.getBone('upperArmL'), h.getBone('lowerArmL'), h.getBone('handL')], _t, _pole, A.state === 'reloading' ? 0.6 : TUNING.ikWeight);
    }
    // a nocked arrow on the string while the bow is up
    if (!this._nocked) { this._nocked = new THREE.Mesh(this.arrows.geo, this.material); this._nocked.castShadow = true; this._nocked.raycast = () => {}; this._nocked.name = 'Nocked arrow'; }
    const showArrow = cls === 'bow' && aiming && A.state === 'ready' && A.rounds > 0;
    if (showArrow !== !!this._nocked.parent) { if (showArrow) m.root.add(this._nocked); else this._nocked.removeFromParent(); }
    if (cls === 'bow' && m.sockets.string) { // the string's middle follows the right hand while drawing
      const pos = m.sockets.string.geometry.attributes.position;
      if (A.draw01 > 0.01) {
        h.getBone('handR').getWorldPosition(_t); m.root.updateWorldMatrix(true, false);
        _t.applyMatrix4(_inv.copy(m.root.matrixWorld).invert());
        const k = Math.min(1, A.draw01 * 1.4);
        pos.setXYZ(1, _t.x * k, _t.y * k, 0.11 + (_t.z - 0.11) * k);
      } else pos.setXYZ(1, 0, 0, 0.11);
      pos.needsUpdate = true;
      if (showArrow) { // nock on the string, shaft resting on the bow hand, pointing out past the grip
        this._nocked.position.set(pos.getX(1), pos.getY(1) + 0.012, pos.getZ(1));
        _t.set(0, 0.012, -0.02).sub(this._nocked.position).normalize();
        this._nocked.quaternion.setFromUnitVectors(_v.set(0, 0, -1), _t);
      }
    }
  }

  // ---------------------------------------------------------------- shooting
  /** Current spread multiplier (× half the weapon's cone): settled aim + bloom, wider from the hip. */
  _spreadScale() { return TUNING.settled + this.bloom + (this.aimHeld ? 0 : TUNING.hipBloom); }
  _isGun(id) { const c = weaponClass(id); return c === 'pistol' || c === 'long' || c === 'bow'; }

  _playerFire() {
    const g = this.game, A = this.arsenal, pl = g.player;
    if (!this._isGun(A.current)) return false;
    if (!A.drawn) { if (A.state !== 'drawing') A.draw(); return false; }
    if (A.state !== 'ready' || A.cool > 0) return false;
    if (A.rounds <= 0) { // dry fire, then reload by itself if there's ammo
      g.audio.play('dry_fire', { position: pl.position });
      if (A.reserve() > 0) this.reload(); else g.ui.notify('Out of ammo.', { duration: 1.5 });
      A.cool = 0.25;
      return false;
    }
    if (!this.aimHeld) this.hipFireT = TUNING.hipFireTime;
    const power = A.current === 'bow' ? Math.max(TUNING.bowMinPower, A.draw01) : 1;
    const id = A.current;
    if (!A.fire()) return false;
    this.stats.shots++;
    const cam = g.camera, m = A.models[id];
    cam.getWorldPosition(_cam); cam.getWorldDirection(_dir);
    m?.root.updateWorldMatrix(true, true);
    m?.sockets.muzzle?.getWorldPosition(_m) ?? _m.copy(pl.position).setY(pl.position.y + 1.4);
    // start the ray beside the muzzle, so things behind Eli (between him and the camera) can't be hit
    const ahead = Math.max(0, _p.subVectors(_m, _cam).dot(_dir));
    _o.copy(_cam).addScaledVector(_dir, ahead);
    const spreadScale = this._spreadScale();
    if (id === 'bow') { // the arrow leaves the bow toward whatever the crosshair is on (and then drops with gravity)
      const aim = castShot(g, _o, _dir, WEAPONS.bow.range, pl.entity);
      this.shootFrom({ shooter: pl.entity, weaponId: id, origin: _o, direction: _v.subVectors(aim.point, _m).normalize().clone(), muzzle: _m.clone(), power });
    }
    else this.shootFrom({ shooter: pl.entity, weaponId: id, origin: _o, direction: _dir.clone(), muzzle: _m.clone(), spreadScale });
    this._muzzleFx(id, m);
    this._recoil(id);
    this.bloom = Math.min(TUNING.bloomMax, this.bloom + (TUNING.bloomPerShot[id] ?? 1));
    return true;
  }

  _muzzleFx(id, m) {
    if (!m) return;
    const vfx = this.game.sys('vfx'), mz = m.sockets.muzzle;
    mz.getWorldPosition(_m); mz.getWorldDirection(_d2).negate();
    if (MUZZLE_FX[id]) {
      vfx.spawn(MUZZLE_FX[id], { position: _m, direction: _d2 });
      const L = vfx.defs?.get(MUZZLE_FX[id])?.flashLight;
      if (L) vfx.lightFlash({ ...L, position: _p.copy(_m).addScaledVector(_d2, TUNING.flashAhead) });
      vfx.spawn('gun_smoke', { position: _p.copy(_m).addScaledVector(_d2, 0.05), direction: _d2, count: id === 'shotgun' ? 6 : undefined });
    }
    if ((id === 'repeater') && m.sockets.eject) { // cases fly out to the right as the lever cycles
      m.sockets.eject.getWorldPosition(_p); _v.set(1, 0.6, 0).applyQuaternion(m.root.getWorldQuaternion(_q)).normalize();
      vfx.spawn('shell_eject', { position: _p, direction: _v });
    }
  }
  _reloadFx() {
    const A = this.arsenal, m = A.models[A.current], vfx = this.game.sys('vfx');
    if (!m?.sockets.eject) return;
    const spent = (A.weapon?.mag ?? 0) - A.rounds;
    const n = A.current === 'revolver' ? Math.min(6, spent) : A.current === 'shotgun' ? Math.min(2, spent) : A.current === 'rifle' ? Math.min(1, spent) : 0;
    m.sockets.eject.getWorldPosition(_p);
    for (let i = 0; i < n; i++) { _v.set(Math.random() - 0.5, -0.4, 0.4).normalize(); vfx.spawn('shell_eject', { position: _p, direction: _v }); }
  }

  _recoil(id) {
    const g = this.game, k = TUNING.kick[id] || [0.03, 0.01], cam = g.cameraRig;
    const p = k[0] * (this.aimHeld ? 1 : 0.6), y = (Math.random() - 0.5) * 2 * k[1];
    cam.pitch += p; cam.yaw += y; this._kick += p * TUNING.kickRecoverShare; this._kickYaw += y * TUNING.kickRecoverShare;
    cam.shake(id === 'shotgun' ? 0.32 : id === 'rifle' ? 0.26 : 0.16, 0.08);
    cam.fovKick(id === 'shotgun' ? 2.5 : 1.2, 0.18);
    g.input.haptic(id === 'shotgun' ? 35 : 20);
  }
  _recoverKick(rawDt) {
    if (Math.abs(this._kick) < 1e-5 && Math.abs(this._kickYaw) < 1e-5) return;
    const k = 1 - Math.exp(-TUNING.kickRecover * rawDt), dp = this._kick * k, dy = this._kickYaw * k, cam = this.game.cameraRig;
    cam.pitch -= dp; cam.yaw -= dy; this._kick -= dp; this._kickYaw -= dy;
  }

  /** Effects and damage for one shot's hit. */
  _impact(hit, shooter, weaponId, primary) {
    if (hit.miss) return;
    const g = this.game, vfx = g.sys('vfx'), e = hit.entity;
    _d2.copy(hit.direction).negate();
    const n = hit.normal || _d2;
    if (e) {
      if (e === shooter) return;
      const living = LIVING.has(e.type);
      vfx.spawn(living ? 'impact_flesh' : `impact_${SURFACE_IMPACT[e.surface] || 'wood'}`, { position: hit.point, direction: _d2 });
      this.applyDamage(e, { weaponId, zone: hit.hitZone || 'torso', source: shooter, point: hit.point, direction: hit.direction, distance: hit.distance });
      e.onHit?.({ point: hit.point, direction: hit.direction, weaponId, zone: hit.hitZone });
      return;
    }
    const obj = hit.collider?.object;
    const surface = hit.surface || 'dirt', kind = SURFACE_IMPACT[surface] || 'dirt';
    if (obj?.userData?.onHit) obj.userData.onHit({ point: hit.point, direction: hit.direction, normal: n, weaponId, shooter });
    if (kind === 'glass' && obj?.userData?.onHit) return; // the bottle bursts by itself
    vfx.spawn(`impact_${kind}`, { position: hit.point, direction: n, scale: weaponId === 'shotgun' ? 0.6 : 1 });
    if (primary || Math.random() < 0.5) {
      if (kind === 'wood' || kind === 'metal' || kind === 'stone') vfx.decal('bullet_hole', { position: _p.copy(hit.point).addScaledVector(n, 0.004), normal: n });
    }
    g.audio.play(`impact_${kind}`, { position: hit.point, volume: primary ? 1 : 0.4 });
  }
  _arrowHit(hit, shooter, power) {
    const g = this.game, vfx = g.sys('vfx'), e = hit.entity;
    if (e) {
      vfx.spawn(LIVING.has(e.type) ? 'impact_flesh' : 'impact_wood', { position: hit.point, direction: _d2.copy(hit.direction).negate(), scale: 0.7 });
      this.applyDamage(e, { weaponId: 'bow', amount: WEAPONS.bow.damage * (0.45 + 0.55 * power) * (HIT_ZONES[hit.hitZone] ?? 1), zone: hit.hitZone || 'torso', source: shooter, point: hit.point, direction: hit.direction });
      e.onHit?.({ point: hit.point, direction: hit.direction, weaponId: 'bow', zone: hit.hitZone });
      return;
    }
    const kind = SURFACE_IMPACT[hit.surface] || 'dirt', obj = hit.collider?.object;
    if (obj?.userData?.onHit) obj.userData.onHit({ point: hit.point, direction: hit.direction, normal: hit.normal, weaponId: 'bow', shooter });
    vfx.spawn(`impact_${kind}`, { position: hit.point, direction: hit.normal || _d2.copy(hit.direction).negate(), scale: 0.5 });
    g.audio.play('arrow_thunk', { position: hit.point });
  }
  /** Audio hook when a bullet passes close by the player (shots from other shooters). */
  _flyby(a, b, shooter) {
    const g = this.game, pl = g.player;
    if (!pl.entity || shooter === pl.entity) return;
    _p.copy(pl.position).y += 1.4;
    const ab = _d2.subVectors(b, a), t = Math.max(0, Math.min(1, _v.subVectors(_p, a).dot(ab) / ab.lengthSq()));
    const close = _v.copy(a).addScaledVector(ab, t).distanceTo(_p);
    if (close < TUNING.flyby) g.audio.play('bullet_flyby', { position: _v, volume: 1 - close / TUNING.flyby });
  }

  // ---------------------------------------------------------------- aim assist and target lock
  _targets() {
    const g = this.game, pl = g.player, out = this._tl || (this._tl = []);
    out.length = 0;
    for (const e of g.entities.list) {
      if (e === pl.entity || e.alive === false || !e.position || e.assist === false) continue;
      if (e.type === 'npc' || e.type === 'animal' || e.assist === true) out.push(e);
    }
    return out;
  }
  _aimPointOf(e, out) { return out.copy(e.position).setY(e.position.y + (e.aimHeight ?? (e.height ?? 1.8) * 0.68)); }
  /** Best target within `coneDeg` of the camera direction (by angle, nearer wins ties). */
  _bestTarget(coneDeg, range) {
    const cam = this.game.camera;
    cam.getWorldPosition(_cam); cam.getWorldDirection(_dir);
    let best = null, bestScore = Infinity;
    for (const e of this._targets()) {
      this._aimPointOf(e, _t); _v.subVectors(_t, _cam);
      const d = _v.length(); if (d > range || d < 0.5) continue;
      const ang = (_v.angleTo(_dir) * 180) / Math.PI;
      if (ang > coneDeg) continue;
      const hit = this.game.physics.raycast(_cam, _v.normalize(), d, { ignoreEntities: true }); // line of sight
      if (hit && hit.distance < d - 0.5) continue;
      const score = ang + d * 0.02;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }
  _startLock() {
    const g = this.game, touch = g.input.device === 'touch';
    if (g.settings.get('targetLock') === false) return;
    const t = this._bestTarget(touch ? TUNING.lock.coneTouch : TUNING.lock.cone, TUNING.lock.range);
    if (t) { this.lockTarget = t; this.lockT = TUNING.lock.time; }
  }
  _assist(rawDt, can) {
    const g = this.game, cam = g.cameraRig, touch = g.input.device === 'touch';
    this.onTarget = null;
    // aim point for the arm correction and the human aim (camera ray, first thing it meets)
    g.camera.getWorldPosition(_cam); g.camera.getWorldDirection(_dir);
    if (this.isAiming) {
      const hit = g.physics.raycast(_cam, _dir, TUNING.assist.range * 3, { ignore: g.player.entity });
      this._aimHit = hit;
      this.aimPoint.copy(_cam).addScaledVector(_dir, hit ? Math.max(3, hit.distance) : TUNING.assist.range);
      if (hit?.entity && LIVING.has(hit.entity.type) && hit.entity.alive !== false) this.onTarget = hit.entity;
    }
    else this._aimHit = null;
    if (!can || !this.isAiming || this.suspendAssist) { this.lockT = 0; return; }
    // target lock: ease the camera onto the chosen target for a moment
    if (this.lockT > 0 && this.lockTarget?.alive !== false && this.lockTarget) {
      this.lockT -= rawDt;
      this._aimPointOf(this.lockTarget, _t);
      const yaw = Math.atan2(-(_t.x - _cam.x), -(_t.z - _cam.z)), pitch = Math.atan2(_t.y - _cam.y, Math.hypot(_t.x - _cam.x, _t.z - _cam.z));
      const k = 1 - Math.exp(-18 * rawDt);
      let dy = yaw - cam.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      cam.yaw += dy * k; cam.pitch += (pitch - cam.pitch) * k;
      return;
    }
    if (g.settings.get('aimAssist') === false) return;
    // soft assist: friction (slower look) and a gentle pull while the player is moving the aim
    const t = this._bestTarget(touch ? TUNING.assist.coneTouch : TUNING.assist.cone, TUNING.assist.range);
    if (!t) return;
    const look = g.input.look, moving = Math.abs(look.x) + Math.abs(look.y) > 1e-5;
    const fr = touch ? TUNING.assist.frictionTouch : TUNING.assist.friction;
    look.x *= fr; look.y *= fr;
    const pull = (touch ? TUNING.assist.pullTouch : TUNING.assist.pull) * (moving || touch ? 1 : 0.35);
    this._aimPointOf(t, _t);
    const yaw = Math.atan2(-(_t.x - _cam.x), -(_t.z - _cam.z)), pitch = Math.atan2(_t.y - _cam.y, Math.hypot(_t.x - _cam.x, _t.z - _cam.z));
    let dy = yaw - cam.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const k = 1 - Math.exp(-pull * rawDt);
    cam.yaw += dy * k; cam.pitch += (pitch - cam.pitch) * k;
  }

  // ---------------------------------------------------------------- saddle
  _mountedAim(can) {
    const g = this.game, pl = g.player, h = pl.human, cam = g.cameraRig;
    const aim = can && this.isAiming;
    if (aim && !this._mountedAimOn) { this._mountedAimOn = true; cam.setMode('aim'); cam.lift = TUNING.mountedLift; }
    else if (!aim && this._mountedAimOn) this._endMountedAim();
    if (aim && h) h.aimAt(this.aimPoint);
  }
  _endMountedAim() {
    const g = this.game, pl = g.player, cam = g.cameraRig;
    if (!this._mountedAimOn) return;
    this._mountedAimOn = false; cam.lift = 0;
    if (pl.state === 'mounted') cam.setMode('ride');
    pl.human?.aimAt(null); if (pl.human?.upperState?.startsWith('aim')) pl.human.stopUpper(0.25);
  }

  // ---------------------------------------------------------------- models
  _model(id) {
    if (!MODEL_IDS.includes(id)) return null;
    if (!this._templates[id]) this._templates[id] = buildWeapon(id, this.material, this.lineMaterial);
    return cloneWeapon(this._templates[id]);
  }

  serialize() { return this.arsenal ? this.arsenal.serialize() : null; }
  deserialize(d) { if (d && this.arsenal) this.arsenal.deserialize(d); }
  dispose() {
    this.hud?.dispose(); this.wheel?.dispose(); this.lasso?.dispose(); this.arrows?.dispose(); this.arsenal?.dispose(); this._warm?.removeFromParent();
    for (const t of Object.values(this._templates)) t.root.traverse((o) => { if (o.isMesh || o.isLine) o.geometry.dispose(); });
    this.material?.dispose(); this.lineMaterial?.dispose();
    for (const k of ['map', 'normalMap', 'ormMap']) this.atlas?.[k]?.dispose();
  }
}
