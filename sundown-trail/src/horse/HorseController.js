import * as THREE from 'three';
import { clamp, damp, dampAngle, angleDelta } from '../core/utils/math.js';
import { TUNING as GAITS } from './anim/Gaits.js';

/**
 * Horse movement (GAME_BIBLE §6 Horse): one controller for riding and for the horse on its own.
 * Riding: camera-relative steering; tap sprint to step up a gait (walk → trot → canter → gallop), hold to keep it,
 * otherwise it eases down a gait every few seconds; momentum and turning circle scale with speed; slopes and
 * water slow her, roads give a small bonus; the gallop drains stamina and spurring an exhausted horse stumbles;
 * jump fences; trees cause a stumble, never a dead stop. On her own: walks to a whistle (avoiding trees and rocks),
 * waits, grazes, and flees from danger.
 */
export const TUNING = {
  accel: [2.4, 3.2, 3.6, 3.4], decel: 4.5, brake: 9, backSpeed: 1.2,
  turnRate: [1.9, 1.5, 1.05, 0.8], turnInPlace: 1.6, tightTurnBonus: 1.25,
  gaitHoldDecay: 2.6, staminaGallop: 10, staminaCanter: 1.2, staminaRegen: [7, 3.5], exhausted: 2,
  slopeUphill: 0.7, slopeMin: 0.5, waterSlow: 0.55, waterDeep: 1.3, roadBonus: 1.06,
  jumpHeight: 1.35, jumpMinSpeed: 2.5, radius: 0.55, height: 1.9, noseProbe: 1.35, hitStumbleSpeed: 4.5,
  call: { range: 250, stopAt: 3.5, gallopAt: 35, canterAt: 15, trotAt: 6, avoid: 4.5, spawnBehind: 70 },
  levelBonus: { speed: 0.04, stamina: 15 },
};

const GAIT_SPEEDS = () => [GAITS.speeds.walk, GAITS.speeds.trot, GAITS.speeds.canter, GAITS.speeds.gallop];
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _wish = new THREE.Vector3(), _vel = new THREE.Vector3();
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3();
const RAY = { ignoreEntities: true };

export class HorseController {
  /** @param {Horse} horse */
  constructor(horse) {
    this.horse = horse; this.game = horse.game;
    this.level = 0; this.holdT = 0; this.speed = 0; this.vy = 0; this.grounded = true; this.wasGrounded = true;
    this.mode = 'idle'; this.target = new THREE.Vector3(); this.brakeT = 0; this.distance = 0; this._stumbleCool = 0;
  }

  /** The horse's top speed for gait level 0..3, after breed, bond and terrain. */
  gaitSpeed(level) {
    const h = this.horse, base = GAIT_SPEEDS()[level];
    return base * (h.look.speed || 1) * (1 + TUNING.levelBonus.speed * (h.bond.level - 1));
  }
  get maxStamina() { return 100 * (this.horse.look.stamina || 1) + TUNING.levelBonus.stamina * (this.horse.bond.level - 1); }

  /** Starts walking/running to a point (whistle). Added in Part 7: optional gait level 0..3 for AI riders (null picks by distance). */
  goTo(p, level = null) { this.target.copy(p); this.mode = 'called'; this.callLevel = level; }
  stop() { this.mode = 'idle'; }

  update(dt) {
    const h = this.horse, g = this.game;
    if (!h.alive) { this.speed = damp(this.speed, 0, 3, dt); this._move(dt, 0); return; }
    this._stumbleCool -= dt;
    let wishSpeed = 0, turn = 0;
    if (h.rider && h.riderReady && !h.rider.ai) [wishSpeed, turn] = this._ridden(dt); // Part 7: AI riders steer with goTo()
    else if (this.mode === 'called') [wishSpeed, turn] = this._called(dt);
    else if (this.mode === 'flee') [wishSpeed, turn] = [this.gaitSpeed(3), 0];
    // terrain: slopes, water and roads
    const t = g.sys('terrain'), p = h.position;
    const fwdX = -Math.sin(h.yaw), fwdZ = -Math.cos(h.yaw);
    let factor = 1;
    const nrm = t.getNormalAt?.(p.x, p.z, _n);
    if (nrm && nrm.y > 0.2) { const rise = -(nrm.x * fwdX + nrm.z * fwdZ) / nrm.y * Math.sign(this.speed || 1); if (rise > 0) factor *= Math.max(TUNING.slopeMin, 1 - rise * TUNING.slopeUphill); }
    const depth = t.getWaterDepth?.(p.x, p.z) || 0;
    if (depth > 0.15) factor *= 1 - (1 - TUNING.waterSlow) * Math.min(1, depth / TUNING.waterDeep);
    if (t.getRoadInfo?.(p.x, p.z)?.onRoad) factor *= TUNING.roadBonus;
    wishSpeed *= factor;
    // stamina
    const st = h.stamina, max = this.maxStamina;
    if (this.speed > GAITS.speeds.canter + 1) h.stamina = Math.max(0, st - TUNING.staminaGallop / (h.look.stamina || 1) * dt);
    else if (this.speed > GAITS.speeds.trot + 1) h.stamina = Math.max(0, st - TUNING.staminaCanter * dt);
    else h.stamina = Math.min(max, st + (this.speed < 2.5 ? TUNING.staminaRegen[0] : TUNING.staminaRegen[1]) * dt);
    // momentum
    const lvl = Math.min(3, Math.max(0, this._levelFor(Math.abs(wishSpeed))));
    const rate = wishSpeed > this.speed ? TUNING.accel[lvl] : this.brakeT > 0 ? TUNING.brake : TUNING.decel;
    this.speed += clamp(wishSpeed - this.speed, -rate * dt, rate * dt);
    // turning: wide at speed, tight when slow
    if (turn) {
      const s = Math.abs(this.speed), tl = this._levelFor(s);
      let max = s < 0.6 ? TUNING.turnInPlace : TUNING.turnRate[tl];
      if (h.bond.level >= 3) max *= TUNING.tightTurnBonus;
      h.yaw += clamp(turn, -max * dt, max * dt);
    }
    this._move(dt, this.speed);
  }

  _levelFor(s) { const S = GAIT_SPEEDS(); return s > (S[2] + S[3]) / 2 ? 3 : s > (S[1] + S[2]) / 2 ? 2 : s > (S[0] + S[1]) / 2 ? 1 : 0; }

  _ridden(dt) {
    const g = this.game, h = this.horse, input = g.input;
    const canDrive = g.state === 'playing' && !g.ui.isScreenOpen() && h.rider.control !== false;
    const mv = canDrive ? input.move : { x: 0, y: 0 }, mag = Math.min(1, Math.hypot(mv.x, mv.y));
    g.cameraRig.forwardXZ(_fwd); g.cameraRig.rightXZ(_right);
    _wish.set(0, 0, 0).addScaledVector(_fwd, mv.y).addScaledVector(_right, mv.x);
    // gait level: tap sprint to step up, hold to keep, ease down otherwise
    if (canDrive && input.pressed('sprint')) {
      if (this.level === 3 || h.stamina < TUNING.exhausted) {
        if (h.stamina < TUNING.exhausted && this._stumbleCool <= 0) { h.animator.play('stumble'); this.level = 1; this.speed *= 0.6; this._stumbleCool = 2; h.events?.('stumble'); }
      } else this.level++;
      this.holdT = 0;
    }
    if (canDrive && input.isDown('sprint')) this.holdT = 0; else this.holdT += dt;
    if (this.holdT > TUNING.gaitHoldDecay && this.level > 0) { this.level--; this.holdT = 0; }
    if (h.stamina < TUNING.exhausted && this.level === 3) this.level = 2;
    this.brakeT = Math.max(0, this.brakeT - dt);
    // jump (or rear when standing, from bond level 2); works with the stick centred too
    if (canDrive && input.pressed('jump')) {
      if (this.grounded && this.speed > TUNING.jumpMinSpeed) { this.vy = Math.sqrt(2 * g.physics.gravity * TUNING.jumpHeight); this.grounded = false; h.animator.play('jump'); }
      else if (this.speed < 0.8 && h.bond.level >= 2 && (!h.animator.action || h.animator.state === 'shake')) h.animator.play('rear');
    }
    if (mag < 0.1) { if (this.speed < 0.3) this.level = 0; return [0, 0]; }
    const desired = Math.atan2(-_wish.x, -_wish.z), diff = angleDelta(h.yaw, desired);
    // pulling back (stick against the horse's heading): brake, skid at speed, then back up
    if (Math.abs(diff) > 2.2) {
      this.brakeT = 0.2;
      if (this.speed > GAITS.speeds.canter && h.bond.level >= 3 && !h.animator.action) h.animator.play('skid');
      if (this.speed < 0.4) { this.level = 0; return [-TUNING.backSpeed * mag, 0]; }
      this.level = Math.min(this.level, 1);
      return [0, 0];
    }
    return [this.gaitSpeed(this.level) * Math.max(0.5, mag), diff * 3];
  }

  _called(dt) {
    const h = this.horse, p = h.position, g = this.game;
    const dx = this.target.x - p.x, dz = this.target.z - p.z, dist = Math.hypot(dx, dz), C = TUNING.call;
    if (dist < C.stopAt) {
      this.mode = 'idle';
      // turn the shoulder toward the player
      return [0, angleDelta(h.yaw, Math.atan2(-dx, -dz) + Math.PI / 2) * 1.5];
    }
    let desired = Math.atan2(-dx, -dz);
    // steer around trees and rocks: probe ahead and to both sides
    const probe = (ang) => {
      _o.set(p.x, p.y + 0.9, p.z); _d.set(-Math.sin(ang), 0, -Math.cos(ang));
      const hit = g.physics.raycast(_o, _d, C.avoid, RAY);
      return hit ? hit.distance : C.avoid;
    };
    const ahead = probe(desired);
    if (ahead < C.avoid) {
      const l = probe(desired + 0.6), r = probe(desired - 0.6);
      desired += l >= r ? 0.8 : -0.8;
    }
    let level = dist > C.gallopAt ? 3 : dist > C.canterAt ? 2 : dist > C.trotAt ? 1 : 0;
    if (this.callLevel != null) level = Math.min(level === 0 ? 0 : 3, this.callLevel);
    void dt;
    return [this.gaitSpeed(level), angleDelta(h.yaw, desired) * 2.5];
  }

  /** Physics step: capsule collision, gravity, jumps, tree hits. */
  _move(dt, speed) {
    const h = this.horse, g = this.game, p = h.position;
    _vel.set(-Math.sin(h.yaw) * speed, this.vy, -Math.cos(h.yaw) * speed);
    // a probe at the chest: running into a tree at speed means a stumble and a bounce, not a dead stop
    if (speed > TUNING.hitStumbleSpeed && this._stumbleCool <= 0) {
      _o.set(p.x, p.y + 1.0, p.z); _d.set(-Math.sin(h.yaw), 0, -Math.cos(h.yaw));
      const hit = g.physics.raycast(_o, _d, TUNING.noseProbe, RAY);
      if (hit && hit.distance < TUNING.noseProbe) {
        this.speed *= 0.35; this.level = Math.min(this.level, 1); this._stumbleCool = 1.5;
        h.animator.play('stumble'); h.onBump?.(speed);
        // glance off sideways
        h.yaw += (Math.random() < 0.5 ? 1 : -1) * 0.35;
        _vel.set(-Math.sin(h.yaw) * this.speed, this.vy, -Math.cos(h.yaw) * this.speed);
      }
    }
    const res = g.physics.moveCapsule(p, _vel, TUNING.radius, TUNING.height, dt, { wasGrounded: this.wasGrounded });
    this.vy = res.grounded ? 0 : _vel.y;
    if (res.grounded && !this.wasGrounded && h.animator.action?.clip.name === 'jump') h.animator.stopAction(0.2);
    this.grounded = res.grounded; this.wasGrounded = res.grounded;
    if (res.hitWall && speed > 2) this.speed *= 0.92;
    this.distance += Math.abs(speed) * dt;
  }
}
