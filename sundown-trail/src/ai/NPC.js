import * as THREE from 'three';
import { EVENTS } from '../core/Events.js';
import { WEAPONS } from '../data/weapons.js';
import { Arsenal, weaponClass, AIM_STATE } from '../combat/Weapons.js';
import { spreadDir } from '../combat/Ballistics.js';
import { armIK, aimArm, shoulderGun } from '../combat/HandIK.js';
import { BUTT } from '../combat/CombatSystem.js';
import { Perception } from './Perception.js';
import { Navigator } from './Navigation.js';
import { Brain, chest } from './Brain.js';
import { aimError, claim } from './Tactics.js';

/**
 * One NPC (Part 7) = a Human (characters) + an entity (combat, lasso, law) + a Brain (Brain.js) with Perception and
 * a Navigator. Moves as a kinematic capsule (physics.moveCapsule) with walk/run/sprint/crouch locomotion, holds and
 * fires the same weapon models as Eli (Arsenal, infinite ammo, magazine reloads), takes hits with reactions and a
 * ragdoll death, reacts to the lasso and shoves, and can ride a horse (the horse steers itself toward goTo points).
 */
export const TUNING = {
  speeds: { walk: 1.45, run: 3.9, sprint: 5.8, crouch: 1.3, ride: 4.5, gallop: 11 },
  accel: 7, turnRate: 9, radius: 0.34, height: 1.8,
  health: { civilian: 60, law: 110, cinder: 100, blackstone: 100, default: 90 },
  fireGap: [0.25, 0.7], movingSpread: 1.4, burstPause: [0.9, 1.6],
  punch: { damage: 9, reach: 1.7, cool: [0.9, 1.6] },
  ikNear: 45, sayCooldown: 2.6, sayRange: 40, murmurRange: 14,
  shovePush: 1, hitStagger: 0.35,
};

/** Call-out lines (original). Picked at random; the NPC system keeps a shared cooldown so they don't talk over each other. */
export const LINES = {
  spotted: ['There he is!', 'Over there!', 'Got eyes on him!', "That's him, by the rocks!"],
  huh: ['Who\'s there?', 'Hello?', 'Somebody out there?', 'Hm?'],
  lost: ['Where\'d he go?', 'Spread out, find him!', 'Lost him!', 'Keep looking!'],
  flank: ['Get around his side!', "I'll circle round!", 'Flank him!', 'Go left, I got him pinned!'],
  pinned: ['Keep his head down!', "He's pinned!", 'Pour it on!'],
  reload: ['Reloading!', 'Cover me!', 'Hold on, loading!'],
  hit: ['Agh!', "I'm hit!", 'Damn it!'],
  down: ['Man down!', "They got Pete!", 'One of ours is down!'],
  surrender: ["Don't shoot! I give up!", 'All right, all right! Enough!', "I'm done, mister, I'm done!"],
  beg: ['Please, I got nothing!', "Don't shoot!", 'Easy now, easy...'],
  panic: ['Gunfire!', 'Run!', 'Lord help us!', 'Get inside!'],
  threat: ['You pointing that at me?', 'Big mistake, friend.', 'Draw, then!'],
  arrest: ['Hands where I can see them!', "You're under arrest. Holster that iron.", 'Easy now. Come along quiet.'],
  clear: ['That does it.', "He's done.", 'All clear.'],
  warn: ["Stop right there! I'd hate to shoot a decent man.", "Don't make me do this, mister.", 'Last warning. Hands where I can see them.'],
  greet: ['Afternoon.', 'Howdy.', 'Evening, stranger.'],
};

const LOCO = new Set(['idle', 'walk', 'run', 'sprint', 'crouchIdle', 'crouchWalk']);
const rand = (a, b) => a + Math.random() * (b - a);
const _d = new THREE.Vector3(), _v = new THREE.Vector3(), _m = new THREE.Vector3(), _t = new THREE.Vector3(), _pole = new THREE.Vector3(), _r = new THREE.Vector3();

export class NPC {
  /** @param {import('./NPCSystem.js').default} system @param {object} def see NPCSystem.spawn */
  constructor(system, def) {
    const g = system.game;
    this.system = system; this.game = g; this.def = def;
    this.id = def.id || `npc:${def.seed ?? Math.random().toString(36).slice(2, 8)}`;
    this.name = def.name || null; this.role = def.role || 'townsman'; this.faction = def.faction || 'civilian';
    this.persistent = !!def.persistent;
    this.position = new THREE.Vector3(def.position?.x ?? 0, 0, def.position?.z ?? 0);
    this.position.y = g.sys('terrain').getHeightAt(this.position.x, this.position.z);
    this.home = (def.home ? new THREE.Vector3(def.home[0], 0, def.home[1]) : this.position.clone());
    this.velocity = new THREE.Vector3(); this.yaw = def.yaw ?? Math.random() * Math.PI * 2; this.groundSpeed = 0;
    this.alert = 0; this.crouched = false; this.dead = false; this.surrendered = false; this.posing = null; this.horse = null;
    this.gait = 'walk'; this.arrived = true; this._face = null; this._aimP = null; this._aimV = new THREE.Vector3();
    this.fireCool = 0; this.meleeCool = 0; this.grudges = new Set(); this._wasGrounded = true; this._stagger = 0;
    const D = system.difficulty;
    this.accuracy = (def.accuracy ?? 1) * D.accuracy; this.reaction = (def.reaction ?? 0.6) * D.reaction; this.aggression = Math.min(1.2, (def.aggression ?? 0.6) * D.aggression);
    // body
    const chars = g.sys('characters');
    this.human = chars.isFallback ? null : chars.createHuman({ seed: def.seed ?? this.id, role: this.role, outfit: def.outfit, hat: def.hat, colors: def.colors, scale: def.scale });
    this.object3d = this.human ? this.human.object3d : new THREE.Object3D();
    this.object3d.name = this.name || `${this.role} (${this.faction})`;
    this.object3d.position.copy(this.position); this.object3d.rotation.y = this.yaw;
    const maxHealth = def.health ?? TUNING.health[this.faction] ?? TUNING.health.default;
    const npc = this;
    this.entity = {
      id: this.id, type: 'npc', faction: this.faction, object3d: this.object3d, position: this.position,
      radius: TUNING.radius, height: TUNING.height, alive: true, health: maxHealth, maxHealth, human: this.human, npc: this,
      aimHeight: 1.25,
      get hostile() { return npc.isHostileToPlayer(); },
      get assist() { return npc.dead ? false : undefined; },
      takeDamage: (info) => this.takeDamage(info),
      onLasso: (state, info) => this._onLasso(state, info),
      lassoPull: (v) => this._lassoPull(v),
      onShove: (v) => this._onShove(v),
    };
    this.human?.setEntity(this.entity);
    // weapons
    const combat = g.get('combat');
    this.arsenal = null;
    const weapons = [].concat(def.weapon || []).filter((w) => WEAPONS[w] && weaponClass(w) !== 'melee' && weaponClass(w) !== 'tool');
    if (weapons.length && this.human && typeof combat?._model === 'function') {
      this.arsenal = new Arsenal({ buildModel: (id) => combat._model(id), ammoCount: () => Infinity, takeAmmo: (a, n) => n }, this.human);
      for (const w of weapons) this.arsenal.give(w);
    }
    this.perception = new Perception(this);
    this.nav = new Navigator(this);
    this.brain = new Brain(this);
    if (this.human) this.human.setState('idle', { fade: 0.01 });
  }

  // ---------------------------------------------------------------- queries
  /** Has a gun and is willing to use it (a brawler keeps his holstered: Part 8). */
  get armed() { return !!this.arsenal?.current && !this.brawling; }
  /** Added in Part 8: owns a gun at all. */
  get hasGun() { return !!this.arsenal?.current; }
  get canFire() { return !!this.arsenal && this.arsenal.canFire() && this.fireCool <= 0 && this._stagger <= 0; }
  get needsReload() { return !!this.arsenal && this.arsenal.rounds <= 0; }
  /** Is `e` someone this NPC should fight? */
  hostileTo(e) { return this.system.hostile(this, e); }
  isHostileToPlayer() {
    if (this.dead || this.surrendered) return false;
    const pl = this.game.player.entity;
    return (this.brain?.state === 'fight' && this.brain.d.target === pl) || this.hostileTo(pl);
  }
  /** Remember someone who attacked us or our friends. */
  grudge(e) { if (e && e !== this.entity) this.grudges.add(e); }

  // ---------------------------------------------------------------- orders the brain gives the body
  moveTo(p, gait = 'walk', opts = {}) {
    this.gait = gait; this.clearPose();
    this.nav.goTo(p, opts); this.arrived = false;
  }
  stop() { this.nav.stop(); this.arrived = true; if (this.horse) this.horse.controller.stop(); }
  faceYaw(y) { this._face = { yaw: y }; }
  facePoint(p) { this._face = { x: p.x, z: p.z }; }
  setCrouch(on) { this.crouched = !!on && !this.horse; }
  setAlert(level) {
    if (level === this.alert) return;
    const up = level > this.alert;
    this.alert = level;
    this.perception.showIndicator(level >= 3 ? 'combat' : level === 2 ? 'alerted' : level === 1 ? 'suspicious' : null);
    if (up && level >= 2) this.game.events.emit(EVENTS.NPC_ALERTED, { npc: this });
  }
  /** Plays a schedule pose ('sit', 'sleep', 'cook', 'talk', 'wave', 'lean'…). */
  pose(name) {
    if (!this.human || this.horse) return;
    this.posing = name;
    if (name === 'sit') this.human.setState('sit', { ground: !!this.def.sitGround });
    else if (name === 'talk' || name === 'wave') this.human.setState(name);
    else if (name !== 'stand') this.human.setState(name);
  }
  clearPose() {
    if (!this.posing) return;
    const was = this.posing; this.posing = null;
    if (!this.human) return;
    if (was === 'talk' || was === 'wave') this.human.stopUpper(0.3);
    else this.human.setState('idle', { fade: 0.4 });
  }
  draw() { if (this.arsenal && !this.arsenal.drawn && this.arsenal.state !== 'drawing') this.arsenal.draw(); }
  holster(instant = false) { if (this.arsenal?.drawn) this.arsenal.holster(instant); this.aim(null); }
  reload() { if (this.arsenal) { this.aim(null); this.arsenal.reload(); } }
  /** Aim at a world point (null lowers the gun). */
  aim(p) { if (p) { this._aimP = this._aimV.copy(p); } else this._aimP = null; }

  /** Fires one shot at `target` (entity) with the NPC aim-error model. */
  shootAt(target, { moving = false } = {}) {
    if (!this.canFire || !target) return false;
    const A = this.arsenal, id = A.current, g = this.game, combat = g.get('combat');
    if (A.rounds <= 0) return false;
    const tp = chest(target, _t);
    if (target === g.player.entity && g.player.crouched) tp.y -= 0.45;
    const m = A.models[id];
    m?.root.updateWorldMatrix(true, true);
    if (m?.sockets.muzzle) m.sockets.muzzle.getWorldPosition(_m); else _m.copy(this.position).setY(this.position.y + 1.45);
    if (!A.fire()) return false;
    this.fireCool = rand(...TUNING.fireGap) / Math.max(0.4, this.aggression);
    const dist = _m.distanceTo(tp), tv = target === g.player.entity ? g.player.velocity : target.npc?.velocity || _v.set(0, 0, 0);
    const err = aimError({
      dist, targetSpeed: Math.hypot(tv.x, tv.z), selfSpeed: this.groundSpeed, crouched: this.crouched,
      sinceSpotted: g.now - (this.brain.d.spotted ?? g.now), accuracy: this.accuracy * (moving ? TUNING.movingSpread : 1),
    });
    _d.subVectors(tp, _m).normalize();
    spreadDir(_d, err, _d);
    combat.shootFrom({ shooter: this.entity, weaponId: id, origin: _m.clone(), direction: _d.clone(), muzzle: _m.clone(), spreadScale: 0.4 });
    combat._muzzleFx?.(id, m);
    return true;
  }
  /** A brawler's punch at an entity in reach. */
  punch(target) {
    if (this.meleeCool > 0 || !target) return;
    this.meleeCool = rand(...TUNING.punch.cool) * (this.def.mood === 'drunk' ? 1.3 : 1);
    if (this.def.mood === 'drunk' && Math.random() < 0.4) { // a wild haymaker that misses and spins him round
      this.human?.setState('punch', { restart: true, speed: 0.8 });
      this._stagger = 0.9; this.yaw += (Math.random() < 0.5 ? 1 : -1) * 0.9;
      this.game.audio.play('punch_whiff', { position: this.position, volume: 0.6 });
      return;
    }
    this.human?.setState('punch', { hand: Math.random() < 0.5 ? 'L' : undefined, restart: true, speed: 1.1 });
    const g = this.game;
    setTimeout(() => {
      if (this.dead || this._stagger > 0 || !target.position || target.position.distanceTo(this.position) > TUNING.punch.reach) return;
      _d.subVectors(target.position, this.position).setY(0).normalize();
      g.get('combat').applyDamage(target, { amount: TUNING.punch.damage, zone: 'torso', weaponId: 'fists', source: this.entity, direction: _d.clone() });
      g.sys('vfx').spawn('impact_punch', { position: _t.copy(target.position).setY(target.position.y + 1.45), direction: _d.clone().negate() });
      g.audio.play('punch_hit', { position: target.position });
    }, 260);
  }
  /** Added in Part 8: shoves Eli back a step (an argument getting physical). No damage, just a push and a stagger. */
  shovePlayer() {
    const g = this.game, pl = g.player;
    this.human?.setState('punch', { hand: 'L', restart: true, speed: 1.25 });
    setTimeout(() => {
      if (this.dead || pl.state === 'dead' || pl.position.distanceTo(this.position) > 2.4) return;
      _d.subVectors(pl.position, this.position).setY(0).normalize();
      pl.velocity.addScaledVector(_d, 4.5); pl.human?.setState('hit', { direction: _d.clone(), zone: 'torso', strength: 1.2 });
      g.cameraRig.shake(0.25, 0.15); g.audio.play('shove', { position: pl.position });
    }, 220);
  }
  /** A call-out line ('spotted', 'flank', …) shown as a subtitle when close enough to hear. */
  say(kind) { this.system.say(this, kind); }
  /** Soft background murmur while talking in pairs. */
  murmur() { if (this.game.player.position.distanceTo(this.position) < TUNING.murmurRange) this.game.audio.play('murmur', { position: this.position, volume: 0.4 }); }

  // ---------------------------------------------------------------- damage
  takeDamage({ amount = 0, source = null, zone = 'torso', direction = null } = {}) {
    if (this.dead || !(amount > 0)) return { killed: false };
    const e = this.entity, wasHostile = this.isHostileToPlayer(), wasSurrendered = this.surrendered;
    e.health = Math.max(0, e.health - amount);
    this.lastHit = { source, wasHostile, wasSurrendered }; // Added in Part 8 (honor reads it on npc:died)
    if (source) this.system._violence(this, source, e.health <= 0, { wasHostile, wasSurrendered });
    if (e.health <= 0) { this.die(direction, source); return { killed: true }; }
    this.human?.setState('hit', { direction, zone, strength: Math.min(1.5, amount / 30) });
    this._stagger = TUNING.hitStagger;
    if (Math.random() < 0.35) this.say('hit');
    this.brain.onEvent('damaged', { source, amount });
    return { killed: false };
  }
  die(direction = null, killer = null) {
    if (this.dead) return;
    this.dead = true; this.entity.alive = false; this.entity.health = 0;
    if (this.horse) this.dismount(true);
    this.brain.set('dead'); claim(this, null);
    this.perception.showIndicator(null);
    this.human?.setRagdoll(direction ? _v.copy(direction).setY(0) : null);
    this.diedAt = this.game.now;
    this.game.events.emit(EVENTS.NPC_DIED, { npc: this, killer });
    this.system._onDeath(this, killer);
  }

  // ---------------------------------------------------------------- lasso and shoves
  _onLasso(state) {
    if (this.dead) return;
    if (state === 'caught' || state === 'hogtied' || state === 'carried' || state === 'onHorse') {
      if (this.horse) this.dismount(true);
      this.holster(true); this.brain.set('restrained'); this.velocity.set(0, 0, 0);
      if (state === 'caught') {
        this.human?.setState('hit', { direction: null, zone: 'torso', strength: 1.2 });
        this.system._violence(this, this.game.player.entity, false, { wasHostile: this.isHostileToPlayer(), lasso: true });
      }
    } else if (state === 'dropped') { // put back in the world by the lasso: pick the body's world position up again
      this.object3d.getWorldPosition(this.position);
      this.position.y = this.game.sys('terrain').getHeightAt(this.position.x, this.position.z);
    }
  }
  _lassoPull(v) {
    this.position.add(v); this.position.y = this.game.sys('terrain').getHeightAt(this.position.x, this.position.z);
    this.object3d.position.copy(this.position);
  }
  _onShove(v) {
    this._push = (this._push || new THREE.Vector3()).copy(v).multiplyScalar(TUNING.shovePush * 4);
    this._stagger = 0.6;
    this.human?.setState('hit', { direction: v, zone: 'torso', strength: 1.6 });
  }

  // ---------------------------------------------------------------- horses
  /** Put this NPC in a horse's saddle at once. */
  mount(horse) {
    if (!horse || horse.rider || !this.human) return false;
    this.horse = horse; horse.rider = this; this.ai = true; horse.riderReady = true;
    horse.object3d.updateMatrixWorld(true);
    horse.saddleAttach.add(this.object3d);
    this.object3d.position.set(0, -0.92 * (this.human.look.height || 1) / horse.object3d.scale.x, 0.02);
    this.object3d.quaternion.identity(); this.object3d.scale.setScalar((this.human.look.height || 1) / horse.object3d.scale.x);
    this.human.teleported(); this.human.setState('ride', { fade: 0.01 });
    this.crouched = false;
    return true;
  }
  /** Off the horse, standing beside it (thrown: no clip, a stumble). */
  dismount(thrown = false) {
    const h = this.horse;
    if (!h) return;
    h.rider = null; h.riderReady = false; h.controller.stop(); this.horse = null;
    this.game.scene.attach(this.object3d);
    _v.set(Math.cos(h.yaw), 0, -Math.sin(h.yaw)).multiplyScalar(-1.1);
    this.position.copy(h.position).add(_v); this.position.y = this.game.sys('terrain').getHeightAt(this.position.x, this.position.z);
    this.yaw = h.yaw; this.object3d.rotation.set(0, this.yaw, 0); this.object3d.scale.setScalar(this.human?.look.height || 1);
    this.object3d.position.copy(this.position);
    this.human?.setRideMotion(null); this.human?.teleported();
    if (!this.dead) this.human?.setState(thrown ? 'land' : 'idle', thrown ? { intensity: 1.4 } : { fade: 0.2 });
  }
  /** HorseSystem: our horse went down under us. */
  onHorseDown() { this.dismount(true); if (!this.dead) this.brain.onEvent('damaged', { source: null, amount: 0 }); }

  // ---------------------------------------------------------------- per frame
  /** @param {number} dt @param {boolean} think run the brain this frame (far NPCs think less often) */
  update(dt, think, thinkDt) {
    if (this.dead) return;
    const g = this.game, e = this.entity;
    this.fireCool -= dt; this.meleeCool -= dt; this._stagger -= dt;
    const restrained = e.lassoed || e.hogtied || e.carriedBy;
    if (this.arsenal) this.arsenal.update(dt);
    if (think && !restrained) { this.perception.update(thinkDt); this.brain.update(thinkDt); }
    else if (think && restrained && this.brain.state !== 'restrained') this.brain.set('restrained');
    else if (think) this.brain.update(thinkDt);
    if (restrained) { if (this.object3d.parent !== g.scene) this.object3d.getWorldPosition(this.position); return; }
    if (this.horse) this._ride(dt); else this._walk(dt);
    this._animate();
  }

  _walk(dt) {
    const g = this.game, S = TUNING.speeds;
    let speed = this.crouched ? S.crouch : (S[this.gait] ?? S.walk);
    if (this.posing || this._stagger > 0 || this.surrendered) speed = 0;
    const dir = speed > 0 && !this.nav.arrived ? this.nav.steer(dt, speed, _d) : null;
    if (!dir && !this.arrived && this.nav.arrived) this.arrived = true;
    const wx = dir ? dir.x * speed : 0, wz = dir ? dir.z * speed : 0, k = Math.min(1, TUNING.accel * dt);
    this.velocity.x += (wx - this.velocity.x) * k; this.velocity.z += (wz - this.velocity.z) * k;
    if (this._push) { this.velocity.add(this._push); this._push = null; }
    const before = _v.copy(this.position);
    const res = g.physics.moveCapsule(this.position, this.velocity, TUNING.radius, this.crouched ? 1.2 : TUNING.height, dt, { wasGrounded: this._wasGrounded });
    this._wasGrounded = res.grounded;
    this.groundSpeed = Math.hypot(this.position.x - before.x, this.position.z - before.z) / Math.max(dt, 1e-4);
    // facing: a requested target wins over the walking direction
    let want = null;
    if (this._face) want = this._face.yaw ?? Math.atan2(-(this._face.x - this.position.x), -(this._face.z - this.position.z));
    else if (this.groundSpeed > 0.3) want = Math.atan2(-this.velocity.x, -this.velocity.z);
    if (this._aimP && this.groundSpeed < 0.3) want = Math.atan2(-(this._aimP.x - this.position.x), -(this._aimP.z - this.position.z));
    if (this.groundSpeed > 0.6 && !this._aimP) this._face = null; // moving again: look where you go
    if (want !== null) { let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, TUNING.turnRate * dt); }
    this.object3d.position.copy(this.position); this.object3d.rotation.y = this.yaw;
  }

  _ride(dt) {
    const h = this.horse, c = h.controller;
    this.position.copy(h.position); this.yaw = h.yaw; this.groundSpeed = h.speed;
    if (this.nav.arrived || !this.nav.route) { if (c.mode === 'called') c.stop(); this.arrived = true; return; }
    const dir = this.nav.steer(dt, 1, _d);
    if (!dir) { c.stop(); this.arrived = true; return; }
    const lvl = this.gait === 'gallop' || this.gait === 'sprint' ? 3 : this.gait === 'run' ? 2 : this.gait === 'trot' ? 1 : 1;
    _t.copy(h.position).addScaledVector(dir, 12);
    c.goTo(_t, lvl);
    if (this.nav.remaining < 4) { c.stop(); this.nav.stop(); this.arrived = true; }
  }

  _animate() {
    const h = this.human;
    if (!h || this.horse) { if (h && this._aimP) h.aimAt(this._aimP); return; }
    const hs = this.groundSpeed;
    if (!this.posing && LOCO.has(h.state)) {
      const want = this.crouched ? (hs > 0.2 ? 'crouchWalk' : 'crouchIdle') : hs < 0.2 ? 'idle' : hs < 2.6 ? 'walk' : hs < 4.9 ? 'run' : 'sprint';
      if (want !== h.state) h.setState(want);
    } else if (!this.posing && (h.state === 'hit' || h.state === 'land') === false && !LOCO.has(h.state) && !['sit', 'sleep', 'cook', 'hogtied', 'death', 'punch'].includes(h.state)) {
      h.setState('idle', { fade: 0.2 });
    }
    // aiming upper body
    const A = this.arsenal, up = h.upperState;
    if (A && A.drawn && this._aimP && A.state !== 'reloading' && A.state !== 'drawing') {
      const st = AIM_STATE[A.cls] || 'aimPistol';
      if (up !== st && up !== 'reload' && up !== 'punch') h.setState(st);
      h.aimAt(this._aimP); h.lookAt(this._aimP);
    } else {
      if (up && up.startsWith('aim') && (!this._aimP || !A?.drawn)) h.stopUpper(0.25);
      h.aimAt(null);
      if (this._face?.x !== undefined && this.alert > 0) h.lookAt(_t.set(this._face.x, this.position.y + 1.6, this._face.z)); else h.lookAt(null);
    }
  }

  /** After the characters system animated: bend the arms so the gun points at the aim point (near NPCs only). */
  lateUpdate(camPos) {
    const A = this.arsenal, h = this.human;
    if (this.dead || !A || !h || !A.drawn || !this._aimP || !h.posedThisFrame) return;
    if (camPos.distanceTo(this.position) > TUNING.ikNear) return;
    const m = A.models[A.current];
    if (!m?.sockets.muzzle || A.state === 'reloading') return;
    h.object3d.updateWorldMatrix(true, true);
    if (A.cls === 'long') {
      shoulderGun(h, h.getAttach('handR'), BUTT[A.current] || BUTT.repeater, this._aimP, 0.8);
      if (m.sockets.foregrip) {
        m.root.updateWorldMatrix(true, true); m.sockets.foregrip.getWorldPosition(_t);
        h.getBone('chest').getWorldPosition(_pole); this.object3d.getWorldDirection(_v);
        _r.set(_v.z, 0, -_v.x); _pole.addScaledVector(_r, 0.4).y -= 0.5;
        armIK([h.getBone('upperArmL'), h.getBone('lowerArmL'), h.getBone('handL')], _t, _pole, 0.9);
      }
    } else aimArm(h.getBone('upperArmR'), h.getBone('handR'), m.sockets.muzzle, this._aimP, 0.8);
  }

  dispose() {
    claim(this, null);
    if (this.horse) { const h = this.horse; this.dismount(); h.dispose?.(); }
    this.perception.dispose(); this.arsenal?.dispose();
    this.game.entities.remove(this.entity);
    this.object3d.removeFromParent();
    this.human?.dispose();
  }
  serialize() { return { id: this.id, x: this.position.x, z: this.position.z, yaw: this.yaw, health: this.entity.health, dead: this.dead }; }
}
