import { BONES, B, OFFSET, REST } from './rig/Bones.js';
import { COMPILED, LOCO_STATES } from './anim/Clips.js';
import { sampleTrack, smoother01 } from './anim/Curves.js';
import { qFromEuler, qMul, qSlerp, qIdentity, qInvert, qRotate, qAxisAngle } from './anim/QMath.js';
import { solveTwoBone } from './anim/IK.js';
import { Locomotion, TUNING as LOCO } from './anim/Locomotion.js';
import { CoatSprings, Kick, HitReaction, Ragdoll, TUNING as SEC } from './anim/Secondary.js';

/**
 * Drives a HumanRig's 32 bones. Layers, in order:
 *   1. base: procedural locomotion (idle/walk/run/sprint/crouch) or a keyframed clip (Hermite-sampled)
 *   2. upper body: aim, reload, wave, talk… clips override only the bones they key (masked)
 *   3. additive procedural: breathing, lean into turns, landing squash, hit reactions, recoil, aim and look-at
 *   4. ragdoll-lite death, 5. two-bone foot IK on terrain, 6. duster/dress/hat springs, 7. blinks and jaw
 * State changes never pop: the difference between the last shown pose and the new one decays to zero over
 * the transition time (inertial blending), so the new motion plays live while the old pose fades out.
 */
export const TUNING = {
  velSmoothing: 10, accelSmoothing: 6, teleportDistance: 3,
  look: { yaw: 80, pitch: 38, rate: 7, neck: 0.4 },
  aim: { yaw: 75, pitch: 60, rate: 16, spine: 0.35 },
  lean: { gain: 1.1, max: 14, rate: 6 },
  breath: { rate: 0.23, rateExert: 0.6, amp: 1.1, ampExert: 2.6, rise: 1.6, fall: 0.22 },
  blink: { min: 1.8, max: 5.5, duration: 0.16, angle: -56 },
  landKick: 1.6, landRate: 10, reachMargin: 0.985, groundClamp: 0.45, footSmoothing: 22, pelvisSmoothing: 16,
  fade: { loco: 0.25, revive: 0.35 },
};

const N = BONES.length, DEG = Math.PI / 180, RAD = 180 / Math.PI;
const LEGS = [[B.thighR, B.shinR, B.footR, 1], [B.thighL, B.shinL, B.footL, -1]];
const THIGH_LEN = Math.abs(OFFSET[B.shinR * 3 + 1]), SHIN_LEN = Math.abs(OFFSET[B.footR * 3 + 1]);
const CLEAR_UPPER = new Set(['sleep', 'hogtied', 'skin', 'cook', 'mount', 'dismount']);
const LIMP = {
  spine: [4, 0, 0], chest: [3, 0, 0], neck: [-6, 0, 0], head: [0, 28, 6],
  upperArmR: [22, 0, 58], lowerArmR: [28, 0, 0], handR: [10, 0, 0], fingersR: [0, 0, -25],
  upperArmL: [14, 0, -66], lowerArmL: [20, 0, 0], handL: [6, 0, 0], fingersL: [0, 0, 25],
  thighR: [10, 0, 8], shinR: [-14, 0, 0], footR: [-32, 0, 0], thighL: [6, 0, -10], shinL: [-22, 0, 0], footL: [-28, 0, 0],
};

// scratch (allocation-free hot path)
const _q = new Float32Array(4), _q2 = new Float32Array(4), _q3 = new Float32Array(4), _hipsM = new Float32Array(4);
const _thM = new Float32Array(4), _shM = new Float32Array(4), _ftM = new Float32Array(4), _inv = new Float32Array(4);
const _v = [0, 0, 0], _A = [0, 0, 0], _T = [0, 0, 0], _pole = [0, 0, 0], _knee = [0, 0, 0], _end = [0, 0, 0], _hp = [0, 0, 0], _w2 = [0, 0];
const ID = new Float32Array([0, 0, 0, 1]);

export class HumanAnimator {
  /** @param {{bones: THREE.Bone[], look: object}} rig */
  constructor(rig) {
    this.rig = rig; this.bones = rig.bones;
    this.hasSkirt = !!(rig.look?.dress || (rig.look?.coat && (rig.look.coat.style === 'duster' || rig.look.coat.style === 'frock')));
    this.Q = new Float32Array(N * 4); this.OUT = new Float32Array(N * 4); this.DELTA = new Float32Array(N * 4);
    this.EU = new Float32Array(N * 3); this.UEU = new Float32Array(N * 3); this.UQ = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) { qIdentity(this.Q, i * 4); qIdentity(this.OUT, i * 4); qIdentity(this.DELTA, i * 4); }
    this.E = {}; for (const [name] of BONES) this.E[name] = this.EU.subarray(B[name] * 3, B[name] * 3 + 3);
    this.pelvis = [0, 0, 0]; this.rootE = [0, 0, 0]; this.rootPos = [0, 0, 0]; this.rootQ = new Float32Array([0, 0, 0, 1]);
    this.outPelvis = [0, 0, 0]; this.outRootPos = [0, 0, 0]; this.outRootQ = new Float32Array([0, 0, 0, 1]);
    this.dPelvis = [0, 0, 0]; this.dRootPos = [0, 0, 0]; this.dRootQ = new Float32Array([0, 0, 0, 1]);
    this.loco = new Locomotion(); this.coat = new CoatSprings(); this.hitR = new HitReaction(); this.rag = new Ragdoll();
    this.recoil = new Kick(SEC.recoil.omega); this.land = { x: 0, v: 0 }; this.hatK = new Kick(SEC.hat.omega);
    this.base = { kind: 'loco', clip: null, t: 0, rate: 1 };
    this.upper = null; this._upperResume = null; this.state = 'idle'; this.upperName = null; this.crouchTarget = 0;
    this.vel = [0, 0, 0]; this.acc = [0, 0, 0]; this.speed = 0; this.yawRate = 0; this.lean = 0;
    this._last = null; this._lastYaw = 0; this._time = Math.random() * 100;
    this.exert = 0; this.breathPhase = 0; this.blinkT = 1 + Math.random() * 3; this.blinkP = -1; this.talk = 0;
    this.lookTarget = null; this.aimTarget = null; this.look = [0, 0]; this.aim = [0, 0]; this.lookW = 0; this.aimW = 0;
    this.footGround = [0, 0]; this.footSlope = [0, 0]; this.ikW = 1; this.pelvisAdj = 0;
    this._fadePending = 0; this._fadeT = 0; this._fadeDur = 0; this._hasOut = false;
    this.weights = { base: 'idle', upper: null, moveW: 0, crouch: 0, ik: 1, fade: 0, ragdoll: 0, gait: [1, 0, 0], aim: 0, look: 0 };
    this.onStep = null; this._prevPhase = 0;
    this.xf = { yaw: 0, x: 0, z: 0, s: 1,
      toWorld(lx, lz, out) { const c = Math.cos(this.yaw), sn = Math.sin(this.yaw); out[0] = this.x + (lx * c + lz * sn) * this.s; out[1] = this.z + (-lx * sn + lz * c) * this.s; return out; },
      toLocal(wx, wz, out) { const c = Math.cos(this.yaw), sn = Math.sin(this.yaw), dx = (wx - this.x) / this.s, dz = (wz - this.z) / this.s; out[0] = dx * c - dz * sn; out[1] = dx * sn + dz * c; return out; },
    };
  }

  // ---------- API
  /** See Human.setState. Returns false for unknown states. */
  setState(name, opts = {}) {
    if (name === 'fire') { this.fire(opts); return true; }
    if (name === 'hit') { this.hit(opts); return true; }
    if (name === 'death') { this.ragdoll(opts.impulse || null, opts.strength ?? 1); return true; }
    if (this.rag.active) { this.rag.stop(); this.coat.reset(); this._fade(TUNING.fade.revive); }
    if (LOCO_STATES.includes(name)) {
      this.crouchTarget = name.startsWith('crouch') ? 1 : 0;
      if (this.base.kind !== 'loco') { this.base = { kind: 'loco', clip: null, t: 0, rate: 1 }; this._fade(opts.fade ?? TUNING.fade.loco); }
      this.state = name;
      return true;
    }
    let clipName = name;
    if (name === 'sit' && opts.ground) clipName = 'sitGround';
    if (opts.hand === 'L' && COMPILED[name + 'L']) clipName = name + 'L';
    const clip = COMPILED[clipName];
    if (!clip) { console.warn(`[human] unknown state "${name}"`); return false; }
    const rate = opts.speed ?? 1;
    if (clip.layer === 'upper') {
      if (this.upper?.clip === clip && clip.loop && !opts.restart) return true;
      if (this.upper?.clip.loop) this._upperResume = this.upper.clip;
      this.upper = { clip, t: 0, rate, onEnd: opts.onEnd || null };
      this.upperName = name;
      this._fade(opts.fade ?? clip.fade);
      return true;
    }
    if (this.base.clip === clip && clip.loop && !opts.restart) return true;
    this.base = { kind: 'clip', clip, t: 0, rate, onEnd: opts.onEnd || null };
    this.state = name;
    if (CLEAR_UPPER.has(name)) { this.upper = null; this.upperName = null; this._upperResume = null; }
    if (name === 'land') this.land.v -= TUNING.landKick * Math.min(2, opts.intensity ?? 1);
    this._fade(opts.fade ?? clip.fade);
    return true;
  }
  /** Ends the upper-body layer (aim, carry, talk…). */
  stopUpper(fade = 0.2) { if (!this.upper) return; this.upper = null; this.upperName = null; this._upperResume = null; this._fade(fade); }
  lookAt(v) { this.lookTarget = v ? [v.x, v.y, v.z] : null; }
  aimAt(v) { this.aimTarget = v ? [v.x, v.y, v.z] : null; }
  fire({ weapon = 'pistol', strength = 1 } = {}) { this.recoil.impulse((SEC.recoil[weapon] ?? SEC.recoil.pistol) * strength); this._recoilWeapon = weapon; }
  /** @param {{direction?: {x,z}, zone?: string, strength?: number}} info world-space push direction */
  hit({ direction = null, zone = 'torso', strength = 1 } = {}) {
    const d = this._dirToLocal(direction, [0, 0, 1]);
    this.hitR.hit(d, zone, strength);
  }
  /** Topple in the direction of `impulse` (world {x, y, z}); null falls backwards. */
  ragdoll(impulse, strength = 1) {
    const mag = impulse ? Math.hypot(impulse.x, impulse.z) : 0;
    const d = this._dirToLocal(impulse, [Math.random() * 0.6 - 0.3, 0, 1]);
    this.rag.start(d, strength * (1 + mag));
    this.upper = null; this.upperName = null; this.state = 'death';
    this._limpSide = Math.random() < 0.5 ? 1 : -1;
    this._fade(0.12);
  }
  /**
   * Added in Part 5: the horse tells its rider how it moves, so the seat follows the gait
   * (sway at the walk, posting at the trot, rocking at the canter, a forward two-point seat at the gallop).
   * @param {{w: number[], phase: number, speed: number}|null} m gait weights [walk, trot, canter, gallop], cycle phase
   */
  setRideMotion(m) { this.rideMotion = m; }
  /** Call after teleporting the object: resets planted feet and motion history. */
  teleported() { this._last = null; this.loco.reset(); }

  _dirToLocal(dir, fallback) {
    if (!dir || !(Math.abs(dir.x) + Math.abs(dir.z) > 1e-6)) return fallback;
    const l = Math.hypot(dir.x, dir.z);
    this.xf.toLocal(this.xf.x + dir.x / l, this.xf.z + dir.z / l, _w2);
    // toLocal divides by scale; renormalize
    const ll = Math.hypot(_w2[0], _w2[1]) || 1;
    return [_w2[0] / ll, 0, _w2[1] / ll];
  }
  _fade(seconds) { if (this._hasOut) this._fadePending = Math.max(this._fadePending, seconds || 0.01); }

  // ---------- per frame
  /**
   * @param {number} dt seconds
   * @param {{x, y, z, yaw, scale, ground?(x, z) → y, wind?: {x, z}, lod?: number}} env the object's world transform
   */
  update(dt, env) {
    if (!(dt > 0)) return;
    const xf = this.xf, s = env.scale || 1;
    xf.yaw = env.yaw; xf.x = env.x; xf.z = env.z; xf.s = s; this._envY = env.y;
    this._measure(dt, env); // real elapsed time (far humans update every few frames)
    dt = Math.min(dt, 0.1);
    this._time += dt;
    // ---------- 1. base layer
    const EU = this.EU; EU.fill(0);
    this.pelvis[0] = this.pelvis[1] = this.pelvis[2] = 0; this.rootE[0] = this.rootE[1] = this.rootE[2] = 0; this.rootPos[0] = this.rootPos[1] = this.rootPos[2] = 0;
    const motion = this._motion || (this._motion = { vx: 0, vz: 0, speed: 0, crouch: 0 });
    motion.vx = this.vel[0]; motion.vz = this.vel[2]; motion.speed = this.speed; motion.crouch = this.crouchTarget;
    let feet = 'gait', eyes = null, jaw = null;
    if (this.base.kind === 'clip') {
      const c = this.base.clip;
      this.base.t += dt * this.base.rate / c.dur;
      if (!c.loop && this.base.t >= 1 && !this.base.ended) this._endBase(); // may switch to loco or the next clip
    }
    if (this.base.kind === 'loco' || this.base.clip.feet === 'plant') {
      // legs keep their gait (or planted feet) under 'plant' clips such as landing
      const P = this.loco.update(dt, motion, xf);
      this._gaitP = P;
      this._footsteps();
    } else this.loco.reset(); // FK legs (air, sitting…): feet re-plant under the body afterwards
    if (this.base.kind === 'loco') {
      this.loco.upper(this.E, this._gaitP, motion, this._time);
      for (let k = 0; k < 3; k++) this.pelvis[k] = this.loco.pelvis[k];
    } else {
      const c = this.base.clip;
      this._sample(c, Math.min(1, this.base.t), EU, true);
      feet = c.feet; eyes = c.eyes;
      if (feet === 'plant') this.pelvis[1] += this.loco.pelvis[1];
    }
    for (let i = 0; i < N; i++) qFromEuler(this.Q, i * 4, EU[i * 3], EU[i * 3 + 1], EU[i * 3 + 2]);
    // ---------- 2. upper layer
    if (this.upper) {
      const u = this.upper, c = u.clip;
      u.t += dt * u.rate / c.dur;
      if (!c.loop && u.t >= 1) this._endUpper();
      if (this.upper) {
        this.UEU.fill(0);
        this._sample(this.upper.clip, this.upper.t, this.UEU, false);
        for (const tr of this.upper.clip.tracks) {
          if (tr.kind !== 'bone') continue;
          const b = tr.bone;
          qFromEuler(this.UQ, b * 4, this.UEU[b * 3], this.UEU[b * 3 + 1], this.UEU[b * 3 + 2]);
          qSlerp(this.Q, b * 4, this.Q, b * 4, this.UQ, b * 4, tr.mask);
        }
        jaw = this.upper.clip.jaw;
      }
    }
    // ---------- 3. additive procedural
    this._additive(dt, env, jaw);
    // ---------- root and pelvis
    qFromEuler(this.rootQ, 0, this.rootE[0], this.rootE[1], this.rootE[2]);
    this.land.v += (-TUNING.landRate * TUNING.landRate * this.land.x - 2 * TUNING.landRate * this.land.v) * dt;
    this.land.x += this.land.v * dt;
    this.pelvis[1] += Math.max(-0.25, Math.min(0.05, this.land.x * 0.1));
    // ---------- 4. ragdoll-lite
    if (this.rag.active) {
      this.rag.update(dt);
      const r = this.rag, limp = smoother01(r.limp), buckle = sm(r.t, 0, 0.14) * (1 - sm(r.t, 0.3, 0.75));
      qAxisAngle(this.rootQ, 0, r.axis[0], r.axis[1], r.axis[2], r.angle);
      this.rootPos[1] = SEC.ragdoll.lift * Math.sin(r.angle);
      this.pelvis[0] *= 1 - limp; this.pelvis[1] = this.pelvis[1] * (1 - limp) - 0.12 * buckle; this.pelvis[2] *= 1 - limp;
      for (const [name, e] of Object.entries(LIMP)) {
        const b = B[name], side = name === 'head' ? this._limpSide : 1;
        let ex = e[0], ez = e[2];
        if (name.startsWith('upperArm')) ex += -34 * Math.max(0, r.dir[2]) + 10 * Math.max(0, -r.dir[2]); // on the back: arms lie flat, not up in the air
        if (name.startsWith('thigh')) ex += 32 * buckle;
        if (name.startsWith('shin')) ex -= 62 * buckle;
        qFromEuler(_q, 0, ex, e[1] * side, ez);
        qSlerp(this.Q, b * 4, this.Q, b * 4, _q, 0, limp);
      }
      qSlerp(this.Q, B.hips * 4, this.Q, B.hips * 4, ID, 0, limp);
      feet = 'fk'; eyes = r.t > 0.5 ? 'closed' : eyes;
    }
    this.ikW = feet === 'fk' ? 0 : 1;
    // ---------- 5. foot IK
    if (this.ikW > 0 && (env.lod ?? 0) < 3) this._legIK(dt, env);
    // ---------- 6. springs
    if (this.hasSkirt) this._coat(dt, env);
    const hat = this.hatK.update(dt);
    qFromEuler(this.Q, B.hat * 4, Math.max(-SEC.hat.max, Math.min(SEC.hat.max, hat)), 0, 0);
    // ---------- 7. face
    this._face(dt, eyes, jaw);
    // ---------- inertial blending and output
    this._blendOut(dt);
    this._write();
    const w = this.weights;
    w.base = this.base.kind === 'loco' ? this.state : this.base.clip.name; w.upper = this.upperName; w.moveW = this.loco.moveW; w.crouch = this.loco.crouch;
    w.ik = this.ikW; w.fade = this._fadeDur > 0 ? 1 - Math.min(1, this._fadeT / this._fadeDur) : 0; w.ragdoll = this.rag.active ? this.rag.limp : 0;
    w.aim = this.aimW; w.look = this.lookW; w.speed = this.speed;
    const rn = this._gaitP?.runness ?? 0, sp = Math.max(0, Math.min(1, (this.speed - LOCO.speeds.run) / (LOCO.speeds.sprint - LOCO.speeds.run)));
    w.gait[0] = (1 - rn) * w.moveW; w.gait[1] = rn * (1 - sp) * w.moveW; w.gait[2] = sp * w.moveW;
  }

  _measure(dt, env) {
    const T = TUNING;
    if (!this._last) { this._last = [env.x, env.y, env.z]; this._lastYaw = env.yaw; this.vel.fill(0); this.acc.fill(0); this.speed = 0; return; }
    const dx = env.x - this._last[0], dz = env.z - this._last[2], d = Math.hypot(dx, dz);
    if (d > T.teleportDistance) { this._last[0] = env.x; this._last[1] = env.y; this._last[2] = env.z; this.loco.reset(); return; }
    const c = Math.cos(env.yaw), sn = Math.sin(env.yaw), s = env.scale || 1;
    const lx = (dx * c - dz * sn) / s / dt, lz = (dx * sn + dz * c) / s / dt;
    const k = 1 - Math.exp(-T.velSmoothing * dt), ka = 1 - Math.exp(-T.accelSmoothing * dt);
    const nvx = this.vel[0] + (lx - this.vel[0]) * k, nvz = this.vel[2] + (lz - this.vel[2]) * k;
    this.acc[0] += ((nvx - this.vel[0]) / dt - this.acc[0]) * ka; this.acc[2] += ((nvz - this.vel[2]) / dt - this.acc[2]) * ka;
    this.vel[0] = nvx; this.vel[2] = nvz;
    this.speed = Math.hypot(nvx, nvz);
    let dy = env.yaw - this._lastYaw; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;
    this.yawRate += (dy / dt - this.yawRate) * k;
    this._last[0] = env.x; this._last[1] = env.y; this._last[2] = env.z; this._lastYaw = env.yaw;
  }

  _sample(clip, t, EU, base) {
    for (const tr of clip.tracks) {
      if (tr.kind === 'bone') sampleTrack(tr.track, t, EU, tr.bone * 3);
      else if (base) sampleTrack(tr.track, t, tr.kind === 'pelvis' ? this.pelvis : tr.kind === 'root' ? this.rootE : this.rootPos, 0);
    }
  }

  _endBase() {
    const c = this.base.clip, cb = this.base.onEnd;
    this.base.t = 1; this.base.ended = true;
    if (c.next === 'loco') { this.base = { kind: 'loco', clip: null, t: 0, rate: 1 }; this.state = this.crouchTarget ? 'crouchIdle' : 'idle'; this._fade(TUNING.fade.loco); }
    else if (c.next && COMPILED[c.next]) { this.base = { kind: 'clip', clip: COMPILED[c.next], t: 0, rate: 1 }; this.state = c.next; this._fade(COMPILED[c.next].fade); }
    cb?.(c.name);
  }
  _endUpper() {
    const c = this.upper.clip, cb = this.upper.onEnd;
    let next = c.next;
    if (next === 'resume') next = this._upperResume ? this._upperResume.name : 'none';
    this.upper = null; this.upperName = null;
    if (next && next !== 'none' && COMPILED[next]) { this.upper = { clip: COMPILED[next], t: 0, rate: 1 }; this.upperName = next; }
    this._fade(0.15);
    cb?.(c.name);
  }

  _footsteps() {
    const ph = this.loco.phase, prev = this._prevPhase;
    this._prevPhase = ph;
    if (!this.onStep || this.loco.moveW < 0.5) return;
    const crossed = (a, b, x) => (a <= b ? a < x && b >= x : a < x || b >= x);
    if (crossed(prev, ph, 0)) this.onStep('R', this.speed);
    if (crossed(prev, ph, 0.5)) this.onStep('L', this.speed);
  }

  _additive(dt, env, jaw) {
    const T = TUNING, Q = this.Q;
    const add = (b, x, y, z) => { if (x === 0 && y === 0 && z === 0) return; qFromEuler(_q, 0, x, y, z); qMul(Q, b * 4, Q, b * 4, _q, 0); };
    // breathing, faster and deeper after exertion
    const ex = Math.min(1, this.speed / LOCO.speeds.sprint);
    this.exert += (ex - this.exert) * (1 - Math.exp(-(ex > this.exert ? T.breath.rise : T.breath.fall) * dt));
    this.breathPhase += dt * (T.breath.rate + T.breath.rateExert * this.exert) * Math.PI * 2;
    const br = Math.sin(this.breathPhase) * (T.breath.amp + T.breath.ampExert * this.exert);
    add(B.chest, br, 0, 0); add(B.spine, br * 0.3, 0, 0);
    add(B.shoulderR, 0, 0, br * 0.4); add(B.shoulderL, 0, 0, -br * 0.4); add(B.neck, -br * 0.6, 0, 0);
    // lean into turns
    const leanT = Math.max(-T.lean.max, Math.min(T.lean.max, this.yawRate * RAD * 0.02 * this.speed * T.lean.gain)) * this.loco.moveW;
    this.lean += (leanT - this.lean) * (1 - Math.exp(-T.lean.rate * dt));
    if (this.base.kind === 'loco') { add(B.hips, 0, 0, this.lean); add(B.spine, 0, 0, this.lean * 0.3); add(B.head, 0, 0, -this.lean * 0.6); }
    // acceleration lean (forward when speeding up)
    if (this.base.kind === 'loco') add(B.spine, Math.max(-8, Math.min(8, this.acc[2] * 1.2)), 0, 0);
    // landing squash
    if (this.land.x < 0) { add(B.spine, this.land.x * 8, 0, 0); add(B.neck, -this.land.x * 5, 0, 0); }
    // riding posture (Part 5)
    const rm = this.rideMotion;
    if (rm && this.base.kind === 'clip' && this.base.clip.name === 'ride') {
      const ph = rm.phase * Math.PI * 2, [ww, wt, wc, wg] = rm.w, moving = Math.min(1, rm.speed / 1.5);
      const post = (0.5 + 0.5 * Math.sin(ph)) * wt * moving;
      this.pelvis[1] += 0.065 * post + 0.1 * wg - 0.01 * Math.sin(ph * 2) * ww * moving;
      this.pelvis[2] += -0.05 * post - 0.08 * wg;
      add(B.hips, 6 * Math.sin(ph) * wc - 6 * wg, 3 * Math.sin(ph) * ww * moving, 2.5 * Math.sin(ph) * ww * moving);
      add(B.spine, -8 * post - 4 * Math.sin(ph) * wc - 20 * wg, -2 * Math.sin(ph) * ww * moving, 0);
      add(B.chest, -6 * wg, 0, 0); add(B.neck, 10 * wg + 3 * post, 0, 0); add(B.head, 8 * wg + 3 * Math.sin(ph) * wc, 0, 0);
      add(B.thighR, -10 * post - 14 * wg, 0, 0); add(B.thighL, -10 * post - 14 * wg, 0, 0);
      add(B.shinR, -8 * post - 22 * wg, 0, 0); add(B.shinL, -8 * post - 22 * wg, 0, 0);
      add(B.upperArmR, 18 * wg, 0, 0); add(B.upperArmL, 18 * wg, 0, 0); add(B.lowerArmR, -14 * wg, 0, 0); add(B.lowerArmL, -14 * wg, 0, 0);
    }
    // hit reactions
    this.hitR.update(dt);
    const h = this.hitR;
    add(B.spine, h.px.value * 0.45, 0, h.pz.value * 0.45); add(B.chest, h.px.value * 0.7, h.pz.value * 0.3, h.pz.value * 0.5);
    add(B.head, h.hx.value * 0.8, 0, h.hz.value);
    if (h.arm.value) add(h.side > 0 ? B.upperArmR : B.upperArmL, -h.arm.value * 0.6, 0, h.side * h.arm.value * 0.5);
    // recoil
    const rc = this.recoil.update(dt);
    if (Math.abs(rc) > 1e-3) {
      const rifle = this._recoilWeapon === 'rifle' || this._recoilWeapon === 'shotgun';
      add(B.upperArmR, rc * (rifle ? 0.3 : 0.9), 0, 0); add(B.lowerArmR, rc * (rifle ? 0.1 : 0.5), 0, 0);
      add(B.chest, rc * (rifle ? 0.45 : 0.15), 0, 0); add(B.head, rc * (rifle ? 0.25 : 0.05), 0, 0);
      if (rifle) add(B.upperArmL, rc * 0.4, 0, 0);
    }
    // aim (spine + chest) then look (neck + head)
    this._target(this.aimTarget, 1.4, this.aim, T.aim, dt);
    this.aimW += ((this.aimTarget ? 1 : 0) - this.aimW) * (1 - Math.exp(-T.aim.rate * dt));
    const ay = this.aim[0] * this.aimW, ap = this.aim[1] * this.aimW;
    add(B.spine, ap * 0.3, ay * T.aim.spine, 0); add(B.chest, ap * 0.55, ay * (1 - T.aim.spine), 0);
    if (this.upperName && this.upperName.startsWith('aim')) { add(B.upperArmR, ap * 0.15, 0, 0); add(B.upperArmL, ap * 0.15, 0, 0); }
    this._target(this.lookTarget, 1.65, this.look, T.look, dt, ay);
    this.lookW += ((this.lookTarget ? 1 : 0) - this.lookW) * (1 - Math.exp(-T.look.rate * dt));
    const ly = this.look[0] * this.lookW, lp = this.look[1] * this.lookW;
    add(B.neck, lp * T.look.neck, ly * T.look.neck, 0); add(B.head, lp * (1 - T.look.neck), ly * (1 - T.look.neck), 0);
    // hat bob from vertical pelvis motion
    if (this.base.kind === 'loco' && this.loco.moveW > 0.3) this.hatK.impulse(Math.sin(4 * Math.PI * this.loco.phase) * this.speed * SEC.hat.gain * dt * 40);
    void jaw; void env;
  }

  /** Smoothly tracks yaw/pitch (degrees) toward a world target from a model-space height. */
  _target(target, height, out, lim, dt, yawOffset = 0) {
    let yaw = 0, pitch = 0;
    if (target) {
      this.xf.toLocal(target[0], target[2], _w2);
      const s = this.xf.s, dy = (target[1] - this._envY) / s - height;
      const h = Math.hypot(_w2[0], _w2[1]);
      yaw = Math.atan2(-_w2[0], -_w2[1]) * RAD - yawOffset;
      pitch = Math.atan2(dy, Math.max(0.05, h)) * RAD;
      if (Math.abs(yaw) > lim.yaw + 35) { yaw = 0; pitch = 0; } // behind: don't break the neck
      yaw = Math.max(-lim.yaw, Math.min(lim.yaw, yaw)); pitch = Math.max(-lim.pitch, Math.min(lim.pitch, pitch));
    }
    const k = 1 - Math.exp(-lim.rate * dt);
    out[0] += (yaw - out[0]) * k; out[1] += (pitch - out[1]) * k;
  }

  _legIK(dt, env) {
    const T = TUNING, Q = this.Q, loco = this.loco, xf = this.xf, s = xf.s;
    // ground under each foot (model units), clamped so colliders (boxes, floors) don't pull feet down to the terrain
    for (let i = 0; i < 2; i++) {
      const t = loco.target[i];
      let g = 0, slope = 0;
      if (env.ground) {
        xf.toWorld(t[0], t[2], _w2);
        g = (env.ground(_w2[0], _w2[1]) - env.y) / s;
        if (Math.abs(g) > T.groundClamp) g = 0;
        const fy = loco.footYaw[i] + xf.yaw, fx = -Math.sin(fy) * 0.1 * s, fz = -Math.cos(fy) * 0.1 * s;
        const gt = env.ground(_w2[0] + fx, _w2[1] + fz), gh = env.ground(_w2[0] - fx, _w2[1] - fz);
        slope = Math.atan2(gt - gh, 0.2 * s);
        if (Math.abs(slope) > 0.6) slope = 0;
      }
      const k = 1 - Math.exp(-T.footSmoothing * dt);
      this.footGround[i] += (g - this.footGround[i]) * k; this.footSlope[i] += (slope - this.footSlope[i]) * k;
    }
    // pelvis: low enough that both ankles are reachable
    const hipsRest = REST[B.hips * 3 + 1];
    const maxLeg = (THIGH_LEN + SHIN_LEN) * T.reachMargin;
    let allowed = Infinity;
    for (let i = 0; i < 2; i++) {
      const [th] = LEGS[i], t = loco.target[i];
      const ay = this._ankleY(i);
      const hx = OFFSET[th * 3] + this.pelvis[0], hz = OFFSET[th * 3 + 2] + this.pelvis[2];
      const d2 = (t[0] - hx) ** 2 + (t[2] - hz) ** 2;
      const reach = d2 < maxLeg * maxLeg ? Math.sqrt(maxLeg * maxLeg - d2) : 0;
      allowed = Math.min(allowed, ay + reach - (hipsRest + OFFSET[th * 3 + 1]));
    }
    const want = Math.min(this.pelvis[1], allowed);
    this.pelvisAdj += (want - this.pelvis[1] - this.pelvisAdj) * (1 - Math.exp(-T.pelvisSmoothing * dt));
    if (this.pelvis[1] + this.pelvisAdj > allowed) this.pelvisAdj = allowed - this.pelvis[1];
    this.pelvis[1] += this.pelvisAdj;
    // hips in model space (root is identity whenever IK runs)
    qCopy4(_hipsM, Q, B.hips * 4);
    _hp[0] = REST[B.hips * 3] + this.pelvis[0]; _hp[1] = hipsRest + this.pelvis[1]; _hp[2] = REST[B.hips * 3 + 2] + this.pelvis[2];
    qInvert(_inv, 0, _hipsM, 0);
    for (let i = 0; i < 2; i++) {
      const [th, sh, ft, side] = LEGS[i], t = loco.target[i];
      _v[0] = OFFSET[th * 3]; _v[1] = OFFSET[th * 3 + 1]; _v[2] = OFFSET[th * 3 + 2];
      qRotate(_v, _hipsM, 0, _v);
      _A[0] = _hp[0] + _v[0]; _A[1] = _hp[1] + _v[1]; _A[2] = _hp[2] + _v[2];
      _T[0] = t[0]; _T[1] = this._ankleY(i); _T[2] = t[2];
      const fy = loco.footYaw[i];
      _pole[0] = -Math.sin(fy) + side * 0.12; _pole[1] = 0.05; _pole[2] = -Math.cos(fy);
      solveTwoBone(_A, _T, THIGH_LEN, SHIN_LEN, _pole, _knee, _end, _thM, 0, _shM, 0);
      // thigh local = inv(hipsModel) · thighModel
      qMul(_q, 0, _inv, 0, _thM, 0); qSlerp(Q, th * 4, Q, th * 4, _q, 0, this.ikW);
      qInvert(_q2, 0, _thM, 0); qMul(_q, 0, _q2, 0, _shM, 0); qSlerp(Q, sh * 4, Q, sh * 4, _q, 0, this.ikW);
      // foot: yaw, then pitch (gait roll-off + ground slope)
      qAxisAngle(_q3, 0, 0, 1, 0, fy); qAxisAngle(_q, 0, 1, 0, 0, loco.footPitch[i] + this.footSlope[i]);
      qMul(_ftM, 0, _q3, 0, _q, 0);
      qInvert(_q2, 0, _shM, 0); qMul(_q, 0, _q2, 0, _ftM, 0); qSlerp(Q, ft * 4, Q, ft * 4, _q, 0, this.ikW);
    }
  }
  /** Ankle height target: ground + ankle height + swing lift + roll-off lift. */
  _ankleY(i) {
    const loco = this.loco, p = loco.footPitch[i];
    const roll = p < 0 ? LOCO.toeLever * Math.sin(-p) : LOCO.heelLever * Math.sin(p);
    return this.footGround[i] + LOCO.ankleHeight + loco.lift[i] + roll;
  }

  _coat(dt, env) {
    const Q = this.Q;
    qMul(_hipsM, 0, this.rootQ, 0, Q, B.hips * 4);
    _v[0] = 0; _v[1] = -1; _v[2] = 0; qRotate(_v, _hipsM, 0, _v);
    const hipPitch = Math.atan2(_v[2], -_v[1]) * RAD, hipRoll = Math.atan2(_v[0], -_v[1]) * RAD;
    const fa = (th) => { qMul(_q, 0, _hipsM, 0, Q, th * 4); _A[0] = 0; _A[1] = -1; _A[2] = 0; qRotate(_A, _q, 0, _A); return Math.atan2(-_A[2], -_A[1]) * RAD + hipPitch; };
    let wf = 0, ws = 0;
    if (env.wind) { const c = Math.cos(env.yaw), sn = Math.sin(env.yaw); const lx = env.wind.x * c - env.wind.z * sn, lz = env.wind.x * sn + env.wind.z * c; wf = -lz; ws = lx; }
    const m = this._coatIn || (this._coatIn = {});
    m.hipPitch = hipPitch; m.hipRoll = hipRoll; m.legL = fa(B.thighL); m.legR = fa(B.thighR);
    m.fwdSpeed = -this.vel[2]; m.sideSpeed = this.vel[0]; m.fwdAccel = -this.acc[2]; m.sideAccel = this.acc[0]; m.windF = wf; m.windS = ws;
    const o = this.coat.update(dt, m);
    qFromEuler(Q, B.coatL1 * 4, o.L[0], 0, o.L[1]); qFromEuler(Q, B.coatL2 * 4, o.L[2], 0, o.L[3]);
    qFromEuler(Q, B.coatR1 * 4, o.R[0], 0, o.R[1]); qFromEuler(Q, B.coatR2 * 4, o.R[2], 0, o.R[3]);
    qFromEuler(Q, B.coatB1 * 4, o.B[0], 0, o.B[1]); qFromEuler(Q, B.coatB2 * 4, o.B[2], 0, o.B[3]);
  }

  _face(dt, eyes, jaw) {
    const T = TUNING.blink;
    let lid = 0;
    if (eyes === 'closed') lid = T.angle;
    else {
      this.blinkT -= dt;
      if (this.blinkT <= 0 && this.blinkP < 0) { this.blinkP = 0; this.blinkT = T.min + Math.random() * (T.max - T.min); if (Math.random() < 0.15) this.blinkT = 0.25; }
      if (this.blinkP >= 0) {
        this.blinkP += dt / T.duration;
        lid = T.angle * Math.sin(Math.PI * Math.min(1, this.blinkP));
        if (this.blinkP >= 1) this.blinkP = -1;
      }
    }
    qFromEuler(this.Q, B.lids * 4, lid, 0, 0);
    const talking = jaw === 'talk' || this.talking;
    this.talk += ((talking ? 1 : 0) - this.talk) * (1 - Math.exp(-8 * dt));
    const t = this._time, open = this.talk * (3 + 5 * Math.max(0, Math.sin(t * 13) * Math.sin(t * 7.3 + 1) + 0.3 * Math.sin(t * 21)));
    qFromEuler(this.Q, B.jaw * 4, -open, 0, 0);
    qFromEuler(this.Q, B.brows * 4, 0, 0, 0);
  }

  _blendOut(dt) {
    const Q = this.Q, O = this.OUT, D = this.DELTA;
    if (this._fadePending > 0 && this._hasOut) {
      for (let i = 0; i < N; i++) { qInvert(_q, 0, Q, i * 4); qMul(D, i * 4, O, i * 4, _q, 0); }
      for (let k = 0; k < 3; k++) { this.dPelvis[k] = this.outPelvis[k] - this.pelvis[k]; this.dRootPos[k] = this.outRootPos[k] - this.rootPos[k]; }
      qInvert(_q, 0, this.rootQ, 0); qMul(this.dRootQ, 0, this.outRootQ, 0, _q, 0);
      this._fadeDur = this._fadePending; this._fadeT = 0; this._fadePending = 0;
    }
    this._fadePending = 0;
    let k = 0;
    if (this._fadeDur > 0) { this._fadeT += dt; k = 1 - smoother01(this._fadeT / this._fadeDur); if (k <= 0) { this._fadeDur = 0; k = 0; } }
    if (k > 0) {
      for (let i = 0; i < N; i++) { qSlerp(_q, 0, ID, 0, D, i * 4, k); qMul(O, i * 4, _q, 0, Q, i * 4); }
      for (let j = 0; j < 3; j++) { this.outPelvis[j] = this.pelvis[j] + this.dPelvis[j] * k; this.outRootPos[j] = this.rootPos[j] + this.dRootPos[j] * k; }
      qSlerp(_q, 0, ID, 0, this.dRootQ, 0, k); qMul(this.outRootQ, 0, _q, 0, this.rootQ, 0);
    } else {
      O.set(Q);
      for (let j = 0; j < 3; j++) { this.outPelvis[j] = this.pelvis[j]; this.outRootPos[j] = this.rootPos[j]; }
      this.outRootQ.set(this.rootQ);
    }
    this._hasOut = true;
  }

  _write() {
    const O = this.OUT, bones = this.bones;
    for (let i = 0; i < N; i++) bones[i].quaternion.set(O[i * 4], O[i * 4 + 1], O[i * 4 + 2], O[i * 4 + 3]);
    const r = bones[B.root], h = bones[B.hips], oq = this.outRootQ;
    r.quaternion.set(oq[0], oq[1], oq[2], oq[3]);
    r.position.set(this.outRootPos[0], this.outRootPos[1], this.outRootPos[2]);
    h.position.set(OFFSET[B.hips * 3] + this.outPelvis[0], OFFSET[B.hips * 3 + 1] + this.outPelvis[1], OFFSET[B.hips * 3 + 2] + this.outPelvis[2]);
  }
}

function qCopy4(o, a, ai) { o[0] = a[ai]; o[1] = a[ai + 1]; o[2] = a[ai + 2]; o[3] = a[ai + 3]; }
function sm(v, a, b) { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
