import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { damp, dampAngle, clamp } from '../core/utils/math.js';

/**
 * The player, Eli Rourke (GAME_BIBLE §4, §11 player API): camera-relative movement with acceleration curves,
 * walk/run/sprint/crouch with stamina, jump, fall and landing (with fall damage), slower uphill and slightly
 * faster downhill, an over-the-shoulder aim mode, interaction actions, health, death → fade → respawn.
 * The body is a procedural Human from the 'characters' system; without it a placeholder capsule is used.
 */
export const TUNING = {
  walkSpeed: 1.6, runSpeed: 4.2, sprintSpeed: 6.8, crouchSpeed: 1.3, aimSpeed: 1.9, acceleration: 9, startBoost: 1.6,
  deceleration: 13, airControl: 0.35, turnRate: 10, turnRateSlow: 16, aimTurnRate: 20, runStick: 0.55,
  jumpHeight: 1.1, staminaDrain: 18, staminaRegen: 12, staminaDelay: 1, sprintMinStamina: 6,
  fallDamageHeight: 6, fallDamagePerMeter: 14, radius: 0.35, height: 1.8, crouchHeight: 1.2, respawnDelay: 2.5,
  slopeUphill: 0.55, slopeDownhill: 0.12, slopeMin: 0.55,
  fallStateDelay: 0.2, landSoft: 0.6, landHard: 2.5, lookAtCamera: true, lookAngle: 100, aimRange: 60, carrySpeed: 1.9,
};

const ZERO = { x: 0, y: 0 };
const LOCO = new Set(['idle', 'walk', 'run', 'sprint', 'crouchIdle', 'crouchWalk']);
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _wish = new THREE.Vector3(), _look = new THREE.Vector3();
const _camDir = new THREE.Vector3(), _aim = new THREE.Vector3(), _hitDir = new THREE.Vector3();
const AIM_RAY = { ignoreEntities: false };

export default class Player extends System {
  constructor(game) {
    super(game);
    this.position = new THREE.Vector3(); this.velocity = new THREE.Vector3(); this.spawn = new THREE.Vector3(0, 0, 6);
    this.yaw = 0; this.state = 'onFoot'; this.horse = null; this.control = true; this.godMode = false;
    this.health = 100; this.maxHealth = 100; this.stamina = 100; this.focus = 100;
    this.crouched = false; this.grounded = true; this.height = TUNING.height; this.aiming = false; this.busy = false;
    this.human = null; this.aimPoint = new THREE.Vector3(); this.carrying = null; this.load = null;
    /** Added in Part 10: survival cores scale how fast each bar refills (a core under 25 halves it). */
    this.regenScale = { health: 1, stamina: 1, focus: 1 };
    this._wasGrounded = true; this._staminaWait = 0; this._fallTop = 0; this._dead = false; this._air = 0; this._jumped = false;
    this._crouchToggle = game.settings.get('crouchToggle') !== false;
    game.events.on(EVENTS.SETTINGS_CHANGED, () => { this._crouchToggle = game.settings.get('crouchToggle') !== false; });
  }

  async init() {
    const g = this.game, chars = g.sys('characters');
    this.human = chars.isFallback ? null : chars.createHuman?.({ seed: 'eli', role: 'eli', hero: true, holsterGrip: g.get('combat') ? false : undefined }) || null;
    this.object3d = this.human ? this.human.object3d : this._buildMesh();
    this.object3d.name = 'Player';
    g.scene.add(this.object3d);
    this.entity = {
      id: 'player', type: 'player', faction: 'player', object3d: this.object3d, position: this.position,
      radius: TUNING.radius, height: TUNING.height, alive: true, health: this.health, maxHealth: this.maxHealth,
      takeDamage: (info) => this.takeDamage(info), human: this.human,
    };
    if (this.human) this.human.setEntity(this.entity);
    this.object3d.traverse((o) => { if (o.isMesh) { o.userData.entity = this.entity; o.userData.hitZone = o.userData.hitZone || 'torso'; } });
    g.entities.add(this.entity);
    g.cameraRig.setTarget(this);
    this.teleport(this.spawn.x, this.spawn.z);
    g.debug?.addTuning('Player', TUNING);
  }

  update(dt) {
    const g = this.game;
    if (this._dead || this.state === 'mounted' || !this.object3d) return;
    const input = g.input, h = this.human;
    const canMove = this.control && !this.busy && g.state === 'playing' && !g.ui.isScreenOpen() && this.state !== 'cutscene';
    if (canMove) {
      if (this._crouchToggle) { if (input.pressed('crouch')) this.crouched = !this.crouched; }
      else this.crouched = input.isDown('crouch');
    }
    // ---------- aim mode (Part 6 combat takes this over; until then the aim action shows the pose)
    const combat = g.sys('combat');
    const wantAim = canMove && this.grounded && (combat.isFallback ? input.isDown('aim') : !!combat.isAiming);
    if (wantAim !== this.aiming) this._setAiming(wantAim);
    // ---------- desired velocity
    const mv = canMove ? input.move : ZERO, mag = Math.min(1, Math.hypot(mv.x, mv.y)), moving = mag > 0.05;
    g.cameraRig.forwardXZ(_fwd); g.cameraRig.rightXZ(_right);
    _wish.set(0, 0, 0).addScaledVector(_fwd, mv.y).addScaledVector(_right, mv.x);
    if (_wish.lengthSq() > 1) _wish.normalize();
    const sprinting = canMove && moving && !this.aiming && input.isDown('sprint') && !this.crouched && this.stamina > (this._sprinting ? 0.5 : TUNING.sprintMinStamina);
    this._sprinting = sprinting;
    let speed = this.crouched ? TUNING.crouchSpeed : mag < TUNING.runStick ? TUNING.walkSpeed * Math.min(1, mag / 0.35 + 0.25) : TUNING.runSpeed;
    if (this.aiming) speed = Math.min(speed, TUNING.aimSpeed);
    if (sprinting) speed = TUNING.sprintSpeed;
    if (this.carrying || this.load) speed = Math.min(speed, TUNING.carrySpeed); // Added in Part 6: a hogtied body on the shoulder (Part 13: or a chore load)
    if (moving && this.grounded) speed *= this._slopeFactor(_wish);
    if (sprinting && this.grounded) { this.stamina = Math.max(0, this.stamina - TUNING.staminaDrain * dt); this._staminaWait = TUNING.staminaDelay; }
    else if ((this._staminaWait -= dt) <= 0) this.stamina = Math.min(100, this.stamina + TUNING.staminaRegen * (this.regenScale.stamina ?? 1) * dt);
    // acceleration curve: quick to get going, smooth toward top speed, firmer braking
    const hs0 = Math.hypot(this.velocity.x, this.velocity.z), control = this.grounded ? 1 : TUNING.airControl;
    const boost = hs0 < 1 ? TUNING.startBoost : 1;
    const rate = (moving ? TUNING.acceleration * boost : TUNING.deceleration) * control;
    this.velocity.x = damp(this.velocity.x, _wish.x * speed, rate, dt);
    this.velocity.z = damp(this.velocity.z, _wish.z * speed, rate, dt);
    if (canMove && this.grounded && !this.crouched && !this.aiming && !this.carrying && !g.get('combat')?.melee?.blocking && input.pressed('jump')) {
      this.velocity.y = Math.sqrt(2 * g.physics.gravity * TUNING.jumpHeight);
      this.grounded = false; this._wasGrounded = false; this._fallTop = this.position.y; this._jumped = true; this._air = 0;
      h?.setState('jump');
    }
    const res = g.physics.moveCapsule(this.position, this.velocity, TUNING.radius, this.crouched ? TUNING.crouchHeight : TUNING.height, dt, { wasGrounded: this._wasGrounded });
    if (!res.grounded) {
      this._fallTop = this._wasGrounded ? this.position.y : Math.max(this._fallTop, this.position.y);
      this._air += dt;
      if (h && this._air > TUNING.fallStateDelay && this.velocity.y < -1.5 && h.state !== 'fall') h.setState('fall');
    } else if (!this._wasGrounded) this._landed(this._fallTop - this.position.y);
    this.grounded = res.grounded; this._wasGrounded = res.grounded; this.surface = res.surface;
    // ---------- facing
    const hs = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.aiming) this.yaw = dampAngle(this.yaw, g.cameraRig.yaw, TUNING.aimTurnRate, dt);
    else if (hs > 0.3) this.yaw = dampAngle(this.yaw, Math.atan2(-this.velocity.x, -this.velocity.z), hs < 2.5 ? TUNING.turnRateSlow : TUNING.turnRate, dt);
    this.object3d.position.copy(this.position);
    this.object3d.rotation.y = this.yaw;
    if (h) this._animate(hs);
    else this.object3d.scale.y = damp(this.object3d.scale.y, this.crouched ? 0.7 : 1, 14, dt);
    g.cameraRig.setSpeedFactor((hs / TUNING.sprintSpeed) * (sprinting ? 1 : 0.35));
    this.entity.health = this.health;
    g.ui.setBars({ health: this.health, stamina: this.stamina, focus: this.focus });
  }

  _slopeFactor(dir) {
    const n = this.game.sys('terrain').getNormalAt?.(this.position.x, this.position.z);
    if (!n || n.y < 0.2) return 1;
    const rise = -(n.x * dir.x + n.z * dir.z) / n.y; // metres up per metre along dir
    if (rise > 0) return Math.max(TUNING.slopeMin, 1 - rise * TUNING.slopeUphill);
    return 1 + Math.min(0.15, -rise * TUNING.slopeDownhill);
  }

  _landed(fall) {
    const g = this.game, h = this.human;
    if (fall > TUNING.fallDamageHeight) this.takeDamage({ amount: (fall - TUNING.fallDamageHeight) * TUNING.fallDamagePerMeter, source: 'fall' });
    if (fall > 1.2) g.cameraRig.shake(Math.min(0.5, fall * 0.05), 0.12);
    if (h && (this._air > 0.25 || fall > TUNING.landSoft) && !this._dead) h.setState('land', { intensity: clamp(fall / TUNING.landHard, 0.25, 2) });
    else if (h && !LOCO.has(h.state)) h.setState(this._locoState(0), { fade: 0.15 });
    this._air = 0; this._jumped = false;
  }

  _locoState(hs) {
    if (this.crouched) return hs > 0.2 ? 'crouchWalk' : 'crouchIdle';
    if (hs < 0.2) return 'idle';
    return hs < (TUNING.walkSpeed + TUNING.runSpeed) / 2 ? 'walk' : hs < (TUNING.runSpeed + TUNING.sprintSpeed) / 2 ? 'run' : 'sprint';
  }

  _animate(hs) {
    const g = this.game, h = this.human;
    if (this.grounded && LOCO.has(h.state) && !this.busy) {
      const want = this._locoState(hs);
      if (want !== h.state) h.setState(want);
    }
    const cam = g.camera;
    cam.getWorldDirection(_camDir);
    if (this.aiming) {
      const hit = g.physics.raycast(cam.position, _camDir, TUNING.aimRange, AIM_RAY);
      _aim.copy(cam.position).addScaledVector(_camDir, hit && hit.entity !== this.entity ? Math.max(2, hit.distance) : TUNING.aimRange);
      this.aimPoint.copy(_aim);
      h.aimAt(_aim); h.lookAt(null);
    } else if (TUNING.lookAtCamera && !this.busy) {
      // head follows where the camera looks, as long as that's roughly in front of Eli
      const fwdYaw = Math.atan2(-_camDir.x, -_camDir.z);
      let d = fwdYaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) < TUNING.lookAngle * Math.PI / 180) { _look.copy(this.position).addScaledVector(_camDir, 12); _look.y += 1.6; h.lookAt(_look); }
      else h.lookAt(null);
    }
  }

  _setAiming(on) {
    const g = this.game, h = this.human;
    this.aiming = on;
    if (this.state === 'onFoot' || this.state === 'aiming') this.state = on ? 'aiming' : 'onFoot';
    g.cameraRig.setMode(on ? 'aim' : 'follow');
    if (!h) return;
    if (on) { if (!h.upperState?.startsWith('aim')) h.setState('aimPistol'); }
    else { h.aimAt(null); h.stopUpper(0.25); }
  }

  /** Move instantly; y defaults to the ground height. */
  teleport(x, z, y = null) {
    this.position.set(x, y ?? this.game.sys('terrain').getHeightAt(x, z), z);
    this.velocity.set(0, 0, 0); this._fallTop = this.position.y; this._wasGrounded = true;
    this.object3d?.position.copy(this.position);
    this.human?.teleported();
    this.game.cameraRig.snap();
  }
  setControl(enabled) { this.control = !!enabled; }
  /** Mount a horse (default: your own). The horse system plays the synced mount. */
  mount(horse) {
    const hs = this.game.sys('horses'), h = horse || hs.playerHorse;
    if (!h || hs.isFallback) return false;
    this.human?.lookAt(null);
    return hs.mountPlayer(h);
  }
  dismount() { const hs = this.game.sys('horses'); return hs.isFallback ? false : hs.dismountPlayer(); }

  /**
   * Added in Part 4: plays a body action for interactions (cook, skin, sit, wave…), locking movement meanwhile.
   * @param {string} state a Human state @param {{seconds?: number, onEnd?: Function, lock?: boolean}} opts
   */
  playAction(state, { seconds = 2, onEnd = null, lock = true } = {}) {
    const h = this.human;
    if (this._dead) return false;
    if (lock) { this.busy = true; this.velocity.set(0, 0, 0); }
    h?.setState(state);
    clearTimeout(this._actionT);
    this._actionT = setTimeout(() => {
      this.busy = false;
      if (h && !LOCO.has(h.state) && !this._dead) h.setState(this.crouched ? 'crouchIdle' : 'idle');
      if (h?.upperState === state) h.stopUpper();
      onEnd?.();
    }, seconds * 1000);
    return true;
  }

  takeDamage({ amount = 0, source = null, zone = 'torso', direction = null } = {}) {
    if (this._dead || this.godMode || !(amount > 0)) return { killed: false };
    if (source !== 'fall') amount *= this.game.get('combat')?.blockFactor?.(direction) ?? 1; // Added in Part 6: a raised guard soaks frontal hits
    if (!(amount > 0)) return { killed: false };
    this.health = Math.max(0, this.health - amount);
    if (direction) _hitDir.copy(direction); else _hitDir.set(0, 0, 0);
    this.game.events.emit(EVENTS.PLAYER_DAMAGED, { amount, source });
    this.game.cameraRig.shake(Math.min(0.6, amount / 60), 0.2);
    this.game.input.haptic(30);
    if (this.health <= 0) { this._die(); return { killed: true }; }
    if (source !== 'fall') this.human?.setState('hit', { direction: direction || null, zone, strength: Math.min(1.5, amount / 25) });
    return { killed: false };
  }
  async _die() {
    const g = this.game;
    const wasMounted = this.state === 'mounted';
    this._dead = true; this.entity.alive = false;
    if (wasMounted) g.sys('horses').dismountPlayer?.({ thrown: true });
    this.state = 'dead';
    if (this.aiming) this._setAiming(false);
    this.human?.setRagdoll(_hitDir.lengthSq() > 0 ? _hitDir : null);
    g.setState('dead'); g.events.emit(EVENTS.PLAYER_DIED, {});
    await new Promise((r) => setTimeout(r, 900));
    await g.ui.fade(true, 1.2);
    await new Promise((r) => setTimeout(r, TUNING.respawnDelay * 1000));
    this.respawn();
    await g.ui.fade(false, 1);
  }
  /** Back at `spawn` (later parts move it to the last camp, ranch or town); costs 5% of carried money. */
  respawn() {
    const g = this.game, wallet = g.sys('wallet');
    const loss = Math.round(wallet.money * 0.05 * 100) / 100;
    if (loss > 0) wallet.spend(loss, 'death');
    this.health = this.maxHealth; this.stamina = 100; this._dead = false; this.entity.alive = true; this.state = 'onFoot';
    this.crouched = false; this.busy = false;
    this.human?.setState('idle', { fade: 0.01 });
    this.teleport(this.spawn.x, this.spawn.z);
    g.setState('playing'); g.events.emit(EVENTS.PLAYER_RESPAWNED, {});
  }

  serialize() {
    return { position: this.position.toArray(), yaw: this.yaw, health: this.health, stamina: this.stamina, spawn: this.spawn.toArray() };
  }
  deserialize(d) {
    if (!d) return;
    if (Array.isArray(d.spawn)) this.spawn.fromArray(d.spawn);
    if (Array.isArray(d.position)) this.teleport(d.position[0], d.position[2], d.position[1]);
    if (typeof d.yaw === 'number') { this.yaw = d.yaw; this.game.cameraRig.yaw = d.yaw; }
    if (typeof d.health === 'number') this.health = Math.max(1, d.health);
    if (typeof d.stamina === 'number') this.stamina = d.stamina;
  }

  /** Placeholder capsule cowboy, used only when the characters system is missing. */
  _buildMesh() {
    const root = new THREE.Group(); root.name = 'Player';
    const coat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc8956b, roughness: 0.7 });
    const scarf = new THREE.MeshStandardMaterial({ color: 0x8a3b1e, roughness: 0.8 });
    const mesh = (geo, mat, x, y, z, zone = 'torso') => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.userData.hitZone = zone; root.add(m); return m; };
    mesh(new THREE.CapsuleGeometry(0.32, 0.85, 6, 14), coat, 0, 0.78, 0);
    mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 12), scarf, 0, 1.4, 0);
    mesh(new THREE.SphereGeometry(0.14, 16, 12), skin, 0, 1.58, 0, 'head');
    mesh(new THREE.BoxGeometry(0.05, 0.05, 0.09), skin, 0, 1.57, -0.15, 'head');
    mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.025, 20), dark, 0, 1.69, 0, 'head');
    mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.14, 14), dark, 0, 1.77, 0, 'head');
    mesh(new THREE.BoxGeometry(0.66, 0.06, 0.36), dark, 0, 0.98, 0);
    return root;
  }
}
