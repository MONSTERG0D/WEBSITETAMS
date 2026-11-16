import { HBONES, HB, HOFFSET, HREST, HPARENT, HOOF, LEGS } from './rig/HorseBones.js';
import { gaitWeights, blendGaits, legPhase, TUNING as GAIT_TUNING } from './anim/Gaits.js';
import { HORSE_CLIPS } from './anim/HorseClips.js';
import { sampleTrack, hermite1, smooth01, smoother01 } from '../characters/anim/Curves.js';
import { qFromEuler, qMul, qSlerp, qIdentity, qInvert, qRotate, qAxisAngle } from '../characters/anim/QMath.js';
import { solveTwoBone, limbBasis } from '../characters/anim/IK.js';
import { springStep } from '../core/utils/math.js';
import { Ragdoll } from '../characters/anim/Secondary.js';

/**
 * Drives a HorseRig. Gaits are procedural: the cycle phase advances by distance ÷ stride, each leg follows its
 * footfall offset (walk 4-beat, trot diagonal, canter 3-beat, gallop 4-beat), stance hooves are locked to the
 * ground in world space and swings follow Hermite arcs with knee/hock fold and pastern flip. Two-bone IK
 * (elbow→knee→fetlock, stifle→hock→fetlock) puts every hoof on the terrain; the body pitches with the slope,
 * rocks with the canter and gallop, rolls into turns and lowers so every leg can reach. Head and neck bob with
 * the gait; tail, mane and ears run on springs. Actions (rear, buck, skid, jump, stumble, panic, graze, shake) are
 * keyframed clips, death is a sideways ragdoll-lite, and every change is inertially blended (no pops).
 */
export const TUNING = {
  velSmoothing: 8, turnStepGain: 0.75, moveOn: 0.15, moveOff: 0.08,
  hoofLock: 0.5, pitchMax: 22, rollGain: 0.012, rollMax: 9, slopeRate: 6,
  stepPlanted: { threshold: 0.18, duration: 0.34, height: 0.1 },
  tail: { omega: 6, swish: 12 }, mane: { omega: 7 }, ears: { twitchMin: 1.5, twitchMax: 5 },
  idleEvery: [9, 18], groundClamp: 0.9, reach: 0.995,
};

const N = HBONES.length, DEG = Math.PI / 180, RAD = 180 / Math.PI;
const CORONET_Y = 0.07; // coronet above the ground at rest
const ID = new Float32Array([0, 0, 0, 1]);
const _q = new Float32Array(4), _q2 = new Float32Array(4), _q3 = new Float32Array(4), _qa = new Float32Array(4), _qb = new Float32Array(4), _inv = new Float32Array(4);
const _v = [0, 0, 0], _A = [0, 0, 0], _T = [0, 0, 0], _M = [0, 0, 0], _E = [0, 0, 0], _pole = [0, 0, 0], _w2 = [0, 0];

/** Rest IK frames per leg (canonical → rest), so IK results become rotations relative to the rest pose. */
const REST_IK = LEGS.map((leg) => {
  const p = (i) => [HREST[i * 3], HREST[i * 3 + 1], HREST[i * 3 + 2]];
  const pole = leg.front ? [0, 0, -1] : [0, 0, 1];
  const qa = new Float32Array(4), qb = new Float32Array(4);
  limbBasis(qa, 0, p(leg.a), p(leg.b), pole); limbBasis(qb, 0, p(leg.b), p(leg.c), pole);
  const la = Math.hypot(...[0, 1, 2].map((k) => HREST[leg.b * 3 + k] - HREST[leg.a * 3 + k]));
  const lb = Math.hypot(...[0, 1, 2].map((k) => HREST[leg.c * 3 + k] - HREST[leg.b * 3 + k]));
  const hoof = leg.front ? HOOF.front : HOOF.hind;
  const base = [HREST[leg.c * 3] + hoof[0], 0, HREST[leg.c * 3 + 2] + hoof[2]]; // coronet ground point at rest
  return { qa, qb, la, lb, pole, hoof, base };
});

export class HorseAnimator {
  constructor(rig) {
    this.rig = rig; this.bones = rig.bones;
    this.Q = new Float32Array(N * 4); this.OUT = new Float32Array(N * 4); this.DELTA = new Float32Array(N * 4);
    this.MQ = new Float32Array(N * 4); this.MP = new Float32Array(N * 3); // model-space transforms
    this.EU = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { qIdentity(this.Q, i * 4); qIdentity(this.OUT, i * 4); }
    this.rootE = [0, 0, 0]; this.rootPos = [0, 0, 0]; this.rootQ = new Float32Array([0, 0, 0, 1]); this.pelvis = [0, 0, 0];
    this.outRootQ = new Float32Array([0, 0, 0, 1]); this.outRootPos = [0, 0, 0]; this.outPelvis = [0, 0, 0];
    this.dRootQ = new Float32Array([0, 0, 0, 1]); this.dRootPos = [0, 0, 0]; this.dPelvis = [0, 0, 0];
    this.phase = 0; this.moveW = 0; this.speed = 0; this.vel = [0, 0, 0]; this.acc = [0, 0, 0]; this.yawRate = 0;
    this.w = [1, 0, 0, 0]; this.P = blendGaits(this.w, {}); this.gait = 'idle';
    this.hooves = LEGS.map(() => ({ stance: true, wx: 0, wz: 0, ox: 0, oz: 0, mode: 'plant', t: 0, fx: 0, fz: 0, tx: 0, tz: 0, g: 0, slope: 0, lift: 0, flex: 0, lx: 0, lz: 0 }));
    this.bodyPitch = 0; this.bodyRoll = 0; this.bodyDrop = 0; this.lean = 0;
    this.action = null; this.state = 'idle'; this._first = true; this._last = null; this._time = Math.random() * 50;
    this.tail = [{ x: 0, v: 0 }, { x: 0, v: 0 }, { x: 0, v: 0 }]; this.tailRoll = { x: 0, v: 0 }; this.mane = { x: 0, v: 0 };
    this.ears = [0, 0]; this.earT = [1, 2]; this.earTarget = [0, 0];
    this.rag = new Ragdoll(); this._idleT = 12; this.headLook = 0;
    this.ridden = false; // Added in Part 5: set by the horse system each frame (no grazing with a rider)
    this._fadePending = 0; this._fadeT = 0; this._fadeDur = 0; this._hasOut = false;
    this.onStep = null; this._prevStance = [true, true, true, true];
    this.weights = { gait: 'idle', w: this.w, moveW: 0, speed: 0, phase: 0, stance: [1, 1, 1, 1], action: null, ragdoll: 0 };
    this.xf = { yaw: 0, x: 0, z: 0, s: 1,
      toWorld(lx, lz, o) { const c = Math.cos(this.yaw), sn = Math.sin(this.yaw); o[0] = this.x + (lx * c + lz * sn) * this.s; o[1] = this.z + (-lx * sn + lz * c) * this.s; return o; },
      toLocal(wx, wz, o) { const c = Math.cos(this.yaw), sn = Math.sin(this.yaw), dx = (wx - this.x) / this.s, dz = (wz - this.z) / this.s; o[0] = dx * c - dz * sn; o[1] = dx * sn + dz * c; return o; },
    };
  }

  // ---------- API
  /** Plays an action clip (rear, panic, buck, skid, jump, stumble, graze, shake). Returns false if unknown. */
  play(name, { onEnd = null, speed = 1 } = {}) {
    const clip = HORSE_CLIPS[name];
    if (!clip || this.rag.active) return false;
    this.action = { clip, t: 0, rate: speed, onEnd };
    this.state = name; this._fade(clip.fade);
    return true;
  }
  stopAction(fade = 0.25) { if (!this.action) return; this.action = null; this.state = 'idle'; this._fade(fade); }
  /** Falls on its side. `side` +1 rolls to the right. */
  die(side = 1) { this.action = null; this.rag.start([side, 0, 0], 0.6); this.state = 'death'; this._fade(0.15); }
  revive() { this.rag.stop(); this.state = 'idle'; this._fade(0.5); }
  teleported() { this._last = null; this._first = true; }
  _fade(s) { if (this._hasOut) this._fadePending = Math.max(this._fadePending, s); }

  /** @param {number} dt @param {{x, y, z, yaw, scale, ground(x, z), lod, headYaw?}} env */
  update(dt, env) {
    if (!(dt > 0)) return;
    const xf = this.xf;
    xf.yaw = env.yaw; xf.x = env.x; xf.z = env.z; xf.s = env.scale || 1; this._envY = env.y;
    this._measure(dt, env);
    dt = Math.min(dt, 0.1); this._time += dt;
    this.EU.fill(0); this.rootE.fill(0); this.rootPos.fill(0); this.pelvis.fill(0);
    // ---------- gait
    const turnSpeed = Math.abs(this.yawRate) * TUNING.turnStepGain;
    const drive = Math.max(this.speed, turnSpeed);
    const moving = drive > (this.moveW > 0.5 ? TUNING.moveOff : TUNING.moveOn);
    this.moveW += ((moving ? 1 : 0) - this.moveW) * (1 - Math.exp(-6 * dt));
    gaitWeights(this.speed, this.w);
    const P = blendGaits(this.w, this.P);
    if (moving) this.phase = (this.phase + drive * dt / P.L) % 1;
    this.gait = this.moveW < 0.2 ? 'idle' : P.gait;
    let feet = 'plant';
    // ---------- action clip
    if (this.action) {
      const a = this.action;
      a.t += dt * a.rate / a.clip.dur;
      if (a.t >= 1) { const cb = a.onEnd; this.action = null; this.state = 'idle'; this._fade(0.25); cb?.(a.clip.name); }
      else {
        for (const tr of a.clip.tracks) {
          if (tr.kind === 'bone') sampleTrack(tr.track, a.t, this.EU, tr.bone * 3);
          else sampleTrack(tr.track, a.t, tr.kind === 'root' ? this.rootE : tr.kind === 'rootPos' ? this.rootPos : this.pelvis, 0);
        }
        feet = a.clip.feet;
      }
    }
    this._hoofTargets(dt, P, moving, env);
    this._body(dt, P, env);
    for (let i = 0; i < N; i++) qFromEuler(this.Q, i * 4, this.EU[i * 3], this.EU[i * 3 + 1], this.EU[i * 3 + 2]);
    qFromEuler(this.rootQ, 0, this.rootE[0], this.rootE[1], this.rootE[2]);
    // ---------- ragdoll-lite death (rolls onto its side)
    if (this.rag.active) {
      this.rag.update(dt);
      const r = this.rag;
      qAxisAngle(this.rootQ, 0, 0, 0, -r.dir[0], r.angle); // roll about the long axis
      this.rootPos[1] = 0.3 * Math.sin(r.angle) - 0.05; this.rootPos[0] = r.dir[0] * 0.5 * Math.sin(r.angle);
      qFromEuler(_q, 0, -10, 0, r.dir[0] * 25); qSlerp(this.Q, HB.neck1 * 4, this.Q, HB.neck1 * 4, _q, 0, r.limp);
      feet = 'fk';
    }
    this.legsIK = feet;
    if (feet !== 'fk' && (env.lod ?? 0) < 3) this._legIK(feet);
    this._springs(dt, P);
    this._blendOut(dt);
    this._write();
    const w = this.weights;
    w.gait = this.gait; w.moveW = this.moveW; w.speed = this.speed; w.phase = this.phase; w.action = this.action?.clip.name || null; w.ragdoll = this.rag.active ? this.rag.limp : 0;
    for (let l = 0; l < 4; l++) w.stance[l] = this.hooves[l].stance ? 1 : 0;
  }

  _measure(dt, env) {
    if (!this._last) { this._last = [env.x, env.y, env.z]; this._lastYaw = env.yaw; this.vel.fill(0); this.speed = 0; return; }
    const dx = env.x - this._last[0], dz = env.z - this._last[2];
    if (Math.hypot(dx, dz) > 6) { this._last = [env.x, env.y, env.z]; this._first = true; return; }
    const c = Math.cos(env.yaw), sn = Math.sin(env.yaw), s = env.scale || 1;
    const lx = (dx * c - dz * sn) / s / dt, lz = (dx * sn + dz * c) / s / dt, k = 1 - Math.exp(-TUNING.velSmoothing * dt);
    const nvx = this.vel[0] + (lx - this.vel[0]) * k, nvz = this.vel[2] + (lz - this.vel[2]) * k;
    this.acc[0] += ((nvx - this.vel[0]) / dt - this.acc[0]) * k; this.acc[2] += ((nvz - this.vel[2]) / dt - this.acc[2]) * k;
    this.vel[0] = nvx; this.vel[2] = nvz; this.speed = Math.hypot(nvx, nvz);
    let dy = env.yaw - this._lastYaw; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;
    this.yawRate += (dy / dt - this.yawRate) * k;
    this._last[0] = env.x; this._last[1] = env.y; this._last[2] = env.z; this._lastYaw = env.yaw;
  }

  /** Coronet targets in model space (x, z), lift, pastern flex; world-locked during stance. */
  _hoofTargets(dt, P, moving, env) {
    const xf = this.xf, s = xf.s, d = P.duty, L = P.L * Math.min(1, 0.55 + 0.45 * this.speed / 2);
    const vl = Math.hypot(this.vel[0], this.vel[2]), dx = vl > 0.05 ? this.vel[0] / vl : 0, dz = vl > 0.05 ? this.vel[2] / vl : -1;
    const stride = this.speed > 0.05 ? L : 0;
    const st = TUNING.stepPlanted;
    for (let l = 0; l < 4; l++) {
      const leg = LEGS[l], h = this.hooves[l], base = REST_IK[l].base;
      const [stance, prog, psi] = legPhase(P, l, this.phase);
      let gx = base[0], gz = base[2], lift = 0, flex = 0;
      if (stance) { const along = stride * d * (0.5 - prog); gx += dx * along; gz += dz * along; }
      else {
        const m0 = -stride * (1 - d) * 0.5, along = hermite1(-stride * d / 2, m0, stride * d / 2, m0, prog);
        gx += dx * along; gz += dz * along;
        lift = (leg.front ? P.liftF : P.liftH) * Math.sin(Math.PI * Math.pow(prog, 0.8)) * Math.min(1, 0.4 + drive01(this.speed));
        flex = Math.sin(Math.PI * Math.min(1, prog * 1.15));
      }
      if (moving && this.moveW > 0.25) {
        if (stance) {
          if (!h.stance || this._first) { xf.toWorld(gx, gz, _w2); h.wx = _w2[0]; h.wz = _w2[1]; h.stance = true; if (!this._first) this._footfall(l, env); }
          xf.toLocal(h.wx, h.wz, _w2);
          if (Math.hypot(_w2[0] - gx, _w2[1] - gz) > TUNING.hoofLock) { xf.toWorld(gx, gz, _w2); h.wx = _w2[0]; h.wz = _w2[1]; xf.toLocal(h.wx, h.wz, _w2); }
          h.ox = _w2[0] - gx; h.oz = _w2[1] - gz; gx = _w2[0]; gz = _w2[1];
        } else {
          h.stance = false;
          const k = 1 - smooth01(prog * 1.6); gx += h.ox * k; gz += h.oz * k;
        }
        h.mode = 'gait'; h.lx = gx; h.lz = gz;
      } else {
        // standing: hooves stay put in the world and step back under the body when they drift
        if (h.mode !== 'plant' && h.mode !== 'step') { xf.toWorld(h.lx || base[0], h.lz || base[2], _w2); h.wx = _w2[0]; h.wz = _w2[1]; h.mode = 'plant'; }
        if (this._first) { xf.toWorld(base[0], base[2], _w2); h.wx = _w2[0]; h.wz = _w2[1]; }
        if (h.mode === 'step') {
          h.t += dt / st.duration; const k = smooth01(h.t);
          h.wx = h.fx + (h.tx - h.fx) * k; h.wz = h.fz + (h.tz - h.fz) * k;
          lift = st.height * Math.sin(Math.PI * Math.min(1, h.t)); flex = Math.sin(Math.PI * Math.min(1, h.t));
          if (h.t >= 1) { h.mode = 'plant'; this._footfall(l, env); }
        }
        xf.toLocal(h.wx, h.wz, _w2); gx = _w2[0]; gz = _w2[1]; h.lx = gx; h.lz = gz; h.stance = h.mode !== 'step';
      }
      h.tgx = gx; h.tgz = gz; h.lift = lift; h.flex = flex;
      // terrain under the hoof
      let g = 0, slope = 0;
      if (env.ground) {
        xf.toWorld(gx, gz, _w2);
        g = (env.ground(_w2[0], _w2[1]) - env.y) / s;
        if (Math.abs(g) > TUNING.groundClamp) g = 0;
        const fx = -Math.sin(xf.yaw) * 0.12 * s, fz = -Math.cos(xf.yaw) * 0.12 * s;
        slope = Math.atan2(env.ground(_w2[0] + fx, _w2[1] + fz) - env.ground(_w2[0] - fx, _w2[1] - fz), 0.24 * s);
        if (Math.abs(slope) > 0.7) slope = 0;
      }
      const k = 1 - Math.exp(-18 * dt);
      h.g += (g - h.g) * k; h.slope += (slope - h.slope) * k;
    }
    // let one hoof at a time step back under the body when standing
    if (this.moveW <= 0.25 && !this._first && !this.hooves.some((h) => h.mode === 'step')) {
      let worst = -1, err = st.threshold;
      for (let l = 0; l < 4; l++) {
        const h = this.hooves[l], b = REST_IK[l].base;
        xf.toWorld(b[0], b[2], _w2);
        const e = Math.hypot(h.wx - _w2[0], h.wz - _w2[1]);
        if (e > err) { err = e; worst = l; h._tx = _w2[0]; h._tz = _w2[1]; }
      }
      if (worst >= 0) { const h = this.hooves[worst]; h.mode = 'step'; h.t = 0; h.fx = h.wx; h.fz = h.wz; h.tx = h._tx; h.tz = h._tz; }
    }
    this._first = false;
  }

  _footfall(l, env) {
    if (!this.onStep) return;
    const h = this.hooves[l];
    this.onStep(LEGS[l].id, this.gait, h.wx, h.wz, this.speed);
    void env;
  }

  /** Body heave, pitch (slope + gait rocking), roll into turns, neck and head bob. Euler degrees into EU. */
  _body(dt, P, env) {
    const E = this.EU, mw = this.moveW, ph = this.phase * Math.PI * 2;
    const set = (b, x, y, z) => { E[b * 3] += x; E[b * 3 + 1] += y; E[b * 3 + 2] += z; };
    // slope: front hooves vs hind hooves
    const h = this.hooves, gF = (h[0].g + h[1].g) / 2, gH = (h[2].g + h[3].g) / 2;
    const slope = Math.max(-TUNING.pitchMax, Math.min(TUNING.pitchMax, Math.atan2(gF - gH, 1.45) * RAD));
    this.bodyPitch += (slope - this.bodyPitch) * (1 - Math.exp(-TUNING.slopeRate * dt));
    const rollT = Math.max(-TUNING.rollMax, Math.min(TUNING.rollMax, this.yawRate * RAD * this.speed * TUNING.rollGain));
    this.bodyRoll += (rollT - this.bodyRoll) * (1 - Math.exp(-4 * dt));
    const rock = Math.sin(ph * P.bobN) * mw, rock1 = Math.sin(ph) * mw;
    if (!this.rag.active) {
      this.rootE[0] += this.bodyPitch + P.pitch * Math.sin(ph + 0.6) * mw * (P.bobN === 1 ? 1 : 0.2);
      this.rootE[2] += this.bodyRoll;
      this.pelvis[1] += -P.bob * Math.cos(ph * P.bobN) * mw + (gF + gH) * 0.5;
    }
    // spine flex at the canter and gallop
    set(HB.front, P.flex * rock1 * 0.5, 0, 0); set(HB.rear, -P.flex * rock1 * 0.5, 0, 0);
    // neck and head: bob with the gait, counter the body pitch so the head stays steady-ish
    const nb = Math.sin(ph * P.neckN + P.neckPh * Math.PI * 2) * P.neck * mw;
    const idle = (1 - mw);
    set(HB.neck1, nb * 0.6 - this.bodyPitch * 0.4 - (P.gait === 'gallop' ? 10 : 0) * mw + idle * Math.sin(this._time * 0.3) * 2, this.headLook * 0.4, 0);
    set(HB.neck2, nb * 0.4 - this.bodyPitch * 0.3, this.headLook * 0.35, 0);
    set(HB.head, -nb * 0.5 + (P.gait === 'gallop' ? 6 : 0) * mw, this.headLook * 0.25, 0);
    // idle life: weight shifts, ear twitches, occasional graze or head shake (no grazing under a rider);
    // idle actions give way as soon as the horse moves off or a rider settles in
    const idleAct = this.action && (this.state === 'graze' || this.state === 'shake');
    if (idleAct && (this.speed > 0.4 || (this.ridden && this.state === 'graze'))) this.stopAction(0.3);
    if (!this.action && !this.rag.active && this.moveW < 0.05 && this.speed < 0.05) {
      this._idleT -= dt;
      if (this._idleT <= 0) { this._idleT = TUNING.idleEvery[0] + Math.random() * (TUNING.idleEvery[1] - TUNING.idleEvery[0]); this.play(!this.ridden && Math.random() < 0.6 ? 'graze' : 'shake'); }
    } else if (this.moveW > 0.3) this._idleT = Math.max(this._idleT, 6);
  }

  /** Computes model-space transforms of every bone from Q (+ root, body offset). */
  _fk() {
    const Q = this.Q, MQ = this.MQ, MP = this.MP;
    for (let i = 0; i < N; i++) {
      const p = HPARENT[i];
      if (p < 0) {
        MQ.set(this.rootQ, 0); MP[0] = this.rootPos[0]; MP[1] = this.rootPos[1]; MP[2] = this.rootPos[2];
        continue;
      }
      qMul(MQ, i * 4, MQ, p * 4, Q, i * 4);
      _v[0] = HOFFSET[i * 3]; _v[1] = HOFFSET[i * 3 + 1]; _v[2] = HOFFSET[i * 3 + 2];
      if (i === HB.body) { _v[0] += this.pelvis[0]; _v[1] += this.pelvis[1]; _v[2] += this.pelvis[2]; }
      qRotate(_v, MQ, p * 4, _v);
      MP[i * 3] = MP[p * 3] + _v[0]; MP[i * 3 + 1] = MP[p * 3 + 1] + _v[1]; MP[i * 3 + 2] = MP[p * 3 + 2] + _v[2];
    }
  }

  _legIK(mode) {
    const Q = this.Q, MQ = this.MQ, MP = this.MP;
    // swing the shoulder/thigh a little toward the hoof so the upper leg moves naturally, then lower the body
    // until every leg can reach (twice: the drop changes the reach)
    for (let l = 0; l < 4; l++) {
      const leg = LEGS[l], h = this.hooves[l], R = REST_IK[l];
      if ((mode === 'hind' && leg.front) || (mode === 'front' && !leg.front)) continue;
      const dz = h.tgz - R.base[2];
      qFromEuler(_q, 0, Math.max(-25, Math.min(25, -dz * (leg.front ? 28 : 20))), 0, 0);
      qMul(Q, leg.top * 4, Q, leg.top * 4, _q, 0);
    }
    for (let pass = 0; pass < 2; pass++) {
      this._fk();
      let drop = 0;
      for (let l = 0; l < 4; l++) {
        const leg = LEGS[l], h = this.hooves[l], R = REST_IK[l];
        if ((mode === 'hind' && leg.front) || (mode === 'front' && !leg.front)) continue;
        this._fetlockTarget(l, _T, _qa);
        const ax = MP[leg.a * 3], ay = MP[leg.a * 3 + 1], az = MP[leg.a * 3 + 2];
        const reach = (R.la + R.lb) * TUNING.reach, d = Math.hypot(_T[0] - ax, _T[1] - ay, _T[2] - az);
        if (d > reach) { const hz = Math.hypot(_T[0] - ax, _T[2] - az); const need = ay - (_T[1] + Math.sqrt(Math.max(0, reach * reach - hz * hz))); drop = Math.max(drop, need); }
        void h;
      }
      if (drop <= 1e-4) break;
      this.pelvis[1] -= drop;
    }
    this._fk();
    for (let l = 0; l < 4; l++) {
      const leg = LEGS[l], R = REST_IK[l];
      if ((mode === 'hind' && leg.front) || (mode === 'front' && !leg.front)) continue;
      const pastern = this._fetlockTarget(l, _T, _qa); void pastern;
      _A[0] = MP[leg.a * 3]; _A[1] = MP[leg.a * 3 + 1]; _A[2] = MP[leg.a * 3 + 2];
      // pole follows the body's heading
      _pole[0] = R.pole[0]; _pole[1] = R.pole[1]; _pole[2] = R.pole[2]; qRotate(_pole, this.rootQ, 0, _pole);
      solveTwoBone(_A, _T, R.la, R.lb, _pole, _M, _E, _q, 0, _q2, 0);
      // model rotations relative to rest: q · inverse(restFrame)
      qInvert(_inv, 0, R.qa, 0); qMul(_q, 0, _q, 0, _inv, 0);
      qInvert(_inv, 0, R.qb, 0); qMul(_q2, 0, _q2, 0, _inv, 0);
      // local = inverse(parent model) · model
      qInvert(_inv, 0, MQ, HPARENT[leg.a] * 4); qMul(Q, leg.a * 4, _inv, 0, _q, 0);
      qInvert(_inv, 0, _q, 0); qMul(Q, leg.b * 4, _inv, 0, _q2, 0);
      qInvert(_inv, 0, _q2, 0); qMul(Q, leg.c * 4, _inv, 0, _qa, 0);
    }
  }

  /** Fetlock target (model space) for leg l, writing the pastern's model rotation into qOut. */
  _fetlockTarget(l, out, qOut) {
    const leg = LEGS[l], h = this.hooves[l], R = REST_IK[l];
    // stance: pastern follows the ground slope; swing: flips back (sole toward the rear)
    qAxisAngle(qOut, 0, 1, 0, 0, h.slope - h.flex * (leg.front ? 1.6 : 1.2));
    _v[0] = R.hoof[0]; _v[1] = R.hoof[1]; _v[2] = R.hoof[2]; qRotate(_v, qOut, 0, _v);
    const lift = h.lift + (h.flex > 0 ? 0 : 0);
    out[0] = h.tgx; out[1] = h.g + CORONET_Y + lift; out[2] = h.tgz;
    out[0] -= _v[0]; out[1] -= _v[1]; out[2] -= _v[2];
    return qOut;
  }

  _springs(dt, P) {
    const Q = this.Q, T = TUNING;
    // tail: lifts and streams with speed, swishes when idle
    const swish = (1 - this.moveW) * Math.sin(this._time * 1.7) * Math.max(0, Math.sin(this._time * 0.23)) * T.tail.swish;
    const lift = -Math.min(45, this.speed * 3.2) - (P.tail || 0) * this.moveW * 0.4;
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(1 / 60, left); left -= h;
      springStep(this.tail[0], lift * 0.6 - this.acc[2] * 0.6 + this.bodyPitch * 0.5, T.tail.omega, h);
      springStep(this.tail[1], lift * 0.3 + (this.tail[0].x - lift * 0.6) * 0.5, T.tail.omega * 0.9, h);
      springStep(this.tail[2], lift * 0.15 + (this.tail[1].x - lift * 0.3) * 0.5, T.tail.omega * 0.8, h);
      springStep(this.tailRoll, swish - this.yawRate * 6, T.tail.omega, h);
      springStep(this.mane, -this.acc[0] * 1.5 + this.yawRate * 8 + Math.sin(this.phase * Math.PI * 2) * 6 * this.moveW, T.mane.omega, h);
    }
    const mul = (b, x, y, z) => { qFromEuler(_q, 0, x, y, z); qMul(Q, b * 4, Q, b * 4, _q, 0); };
    mul(HB.tail1, this.tail[0].x, 0, this.tailRoll.x * 0.5); mul(HB.tail2, this.tail[1].x, 0, this.tailRoll.x * 0.3); mul(HB.tail3, this.tail[2].x, 0, this.tailRoll.x * 0.2);
    mul(HB.tail4, this.tail[2].x * 0.5, 0, 0);
    mul(HB.mane1, 0, 0, this.mane.x * 0.6); mul(HB.mane2, 0, 0, this.mane.x);
    // ears: random twitches; pinned back at the gallop
    for (let e = 0; e < 2; e++) {
      this.earT[e] -= dt;
      if (this.earT[e] <= 0) { this.earT[e] = T.ears.twitchMin + Math.random() * (T.ears.twitchMax - T.ears.twitchMin); this.earTarget[e] = (Math.random() - 0.5) * 60; }
      this.ears[e] += (this.earTarget[e] - this.ears[e]) * (1 - Math.exp(-10 * dt));
    }
    const pin = this.gait === 'gallop' ? -25 : 0;
    mul(HB.earR, pin, -this.ears[0] * 0.6, 0); mul(HB.earL, pin, this.ears[1] * 0.6, 0);
  }

  _blendOut(dt) {
    const Q = this.Q, O = this.OUT, D = this.DELTA;
    if (this._fadePending > 0 && this._hasOut) {
      for (let i = 0; i < N; i++) { qInvert(_q, 0, Q, i * 4); qMul(D, i * 4, O, i * 4, _q, 0); }
      for (let k = 0; k < 3; k++) { this.dPelvis[k] = this.outPelvis[k] - this.pelvis[k]; this.dRootPos[k] = this.outRootPos[k] - this.rootPos[k]; }
      qInvert(_q, 0, this.rootQ, 0); qMul(this.dRootQ, 0, this.outRootQ, 0, _q, 0);
      this._fadeDur = this._fadePending; this._fadeT = 0;
    }
    this._fadePending = 0;
    let k = 0;
    if (this._fadeDur > 0) { this._fadeT += dt; k = 1 - smoother01(this._fadeT / this._fadeDur); if (k <= 0) { this._fadeDur = 0; k = 0; } }
    if (k > 0) {
      for (let i = 0; i < N; i++) { qSlerp(_q, 0, ID, 0, D, i * 4, k); qMul(O, i * 4, _q, 0, Q, i * 4); }
      for (let j = 0; j < 3; j++) { this.outPelvis[j] = this.pelvis[j] + this.dPelvis[j] * k; this.outRootPos[j] = this.rootPos[j] + this.dRootPos[j] * k; }
      qSlerp(_q, 0, ID, 0, this.dRootQ, 0, k); qMul(this.outRootQ, 0, _q, 0, this.rootQ, 0);
    } else {
      O.set(Q); this.outRootQ.set(this.rootQ);
      for (let j = 0; j < 3; j++) { this.outPelvis[j] = this.pelvis[j]; this.outRootPos[j] = this.rootPos[j]; }
    }
    this._hasOut = true;
  }

  _write() {
    const O = this.OUT, B = this.bones;
    for (let i = 0; i < N; i++) B[i].quaternion.set(O[i * 4], O[i * 4 + 1], O[i * 4 + 2], O[i * 4 + 3]);
    const r = B[HB.root], q = this.outRootQ;
    r.quaternion.set(q[0], q[1], q[2], q[3]); r.position.set(this.outRootPos[0], this.outRootPos[1], this.outRootPos[2]);
    B[HB.body].position.set(HOFFSET[HB.body * 3] + this.outPelvis[0], HOFFSET[HB.body * 3 + 1] + this.outPelvis[1], HOFFSET[HB.body * 3 + 2] + this.outPelvis[2]);
  }
}

const drive01 = (v) => Math.min(1, v / GAIT_TUNING.speeds.trot);
