import { springStep } from '../../core/utils/math.js';

/**
 * Secondary motion for humans: critically damped springs for duster/dress panels and the hat, hit reactions,
 * weapon recoil and a ragdoll-lite death (a toppling body pivoting on its feet with limbs going limp).
 * All springs substep at ≤ 1/60 s so they behave the same at 30 and 60 fps.
 */
export const TUNING = {
  substep: 1 / 60,
  coat: { omega: 7.5, omega2: 9, gravity: 1, drag: 3.6, dragSide: 2.2, dragFront: 1.4, inertia: 1.6, legPush: 0.5, backPush: 0.55, flare: 1.6, max: 55, windScale: 2.5 },
  hat: { omega: 14, gain: 0.25, max: 4 },
  hit: { omega: 13, torso: 420, head: 620, limb: 260 },
  recoil: { omega: 18, pistol: 520, rifle: 380, shotgun: 700, bow: 120 },
  ragdoll: { gravity: 10.5, comHeight: 0.95, maxAngle: 86, bounce: 0.22, settle: 0.35, minSpin: 0.9, impulseGain: 0.45, maxSpin: 4.5, limpTime: 0.45, lift: 0.11 },
};

const DEG = Math.PI / 180;
const PANELS = ['L', 'R', 'B'];

/** Six coat-panel springs (two segments × left/right/back) in degrees. */
export class CoatSprings {
  constructor() {
    this.s = {};
    for (const p of PANELS) for (const seg of [1, 2]) for (const ax of ['x', 'z']) this.s[p + seg + ax] = { x: 0, v: 0 };
    this.out = {}; for (const p of PANELS) this.out[p] = [0, 0, 0, 0]; // x1, z1, x2, z2
  }
  reset() { for (const k in this.s) { this.s[k].x = 0; this.s[k].v = 0; } }
  /**
   * @param {number} dt
   * @param {object} m { hipPitch, hipRoll (deg, how far the hips tilt the panels from vertical),
   *   legL, legR (thigh swing deg, + forward), fwdSpeed, sideSpeed, fwdAccel, sideAccel, windF, windS }
   */
  update(dt, m) {
    const T = TUNING.coat;
    const tgt = {
      L: [T.gravity * m.hipPitch + Math.max(0, m.legL) * T.legPush - m.fwdSpeed * T.dragFront - m.fwdAccel * T.inertia * 0.5 + m.windF * T.windScale * 0.4,
        -T.gravity * m.hipRoll - Math.abs(m.fwdSpeed) * T.flare * 0.3 - m.sideSpeed * T.dragSide - m.sideAccel * T.inertia * 0.5],
      R: [T.gravity * m.hipPitch + Math.max(0, m.legR) * T.legPush - m.fwdSpeed * T.dragFront - m.fwdAccel * T.inertia * 0.5 + m.windF * T.windScale * 0.4,
        -T.gravity * m.hipRoll + Math.abs(m.fwdSpeed) * T.flare * 0.3 - m.sideSpeed * T.dragSide - m.sideAccel * T.inertia * 0.5],
      B: [T.gravity * m.hipPitch + Math.min(0, (m.legL + m.legR) * 0.5) * T.backPush - m.fwdSpeed * T.drag - m.fwdAccel * T.inertia + m.windF * T.windScale,
        -T.gravity * m.hipRoll - m.sideSpeed * T.dragSide - m.sideAccel * T.inertia + m.windS * T.windScale],
    };
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(TUNING.substep, left); left -= h;
      for (const p of PANELS) {
        const [tx, tz] = tgt[p];
        const cx = Math.max(-T.max, Math.min(T.max, tx)), cz = Math.max(-T.max * 0.5, Math.min(T.max * 0.5, tz));
        const x1 = springStep(this.s[p + '1x'], cx, T.omega, h), z1 = springStep(this.s[p + '1z'], cz, T.omega, h);
        springStep(this.s[p + '2x'], (cx - x1) * 0.6 + cx * 0.25, T.omega2, h); // whips while segment 1 lags
        springStep(this.s[p + '2z'], (cz - z1) * 0.5 + cz * 0.2, T.omega2, h);
      }
    }
    for (const p of PANELS) { const o = this.out[p]; o[0] = this.s[p + '1x'].x; o[1] = this.s[p + '1z'].x; o[2] = this.s[p + '2x'].x; o[3] = this.s[p + '2z'].x; }
    return this.out;
  }
}

/** A single critically damped scalar spring driven by impulses (degrees). */
export class Kick {
  constructor(omega) { this.st = { x: 0, v: 0 }; this.omega = omega; }
  get value() { return this.st.x; }
  impulse(v) { this.st.v += v; }
  update(dt) { let left = dt; while (left > 1e-6) { const h = Math.min(TUNING.substep, left); left -= h; springStep(this.st, 0, this.omega, h); } return this.st.x; }
  reset() { this.st.x = 0; this.st.v = 0; }
}

/** Hit reactions: pitch/roll kicks on spine, chest and head from a model-space push direction. */
export class HitReaction {
  constructor() { const o = TUNING.hit.omega; this.px = new Kick(o); this.pz = new Kick(o); this.hx = new Kick(o * 1.2); this.hz = new Kick(o * 1.2); this.arm = new Kick(o); this.side = 1; }
  /** @param {number[]} d model-space push direction (unit, xz), zone 'head'|'torso'|'limb', strength 0..2 */
  hit(d, zone, strength = 1) {
    const T = TUNING.hit, k = (zone === 'head' ? T.head : zone === 'limb' ? T.limb : T.torso) * strength;
    this.px.impulse(d[2] * k); this.pz.impulse(-d[0] * k);
    if (zone === 'head') { this.hx.impulse(d[2] * k * 0.8); this.hz.impulse(-d[0] * k * 0.8); }
    if (zone === 'limb') { this.arm.impulse(k * 0.6); this.side = Math.random() < 0.5 ? 1 : -1; }
  }
  update(dt) { this.px.update(dt); this.pz.update(dt); this.hx.update(dt); this.hz.update(dt); this.arm.update(dt); }
  reset() { for (const k of [this.px, this.pz, this.hx, this.hz, this.arm]) k.reset(); }
}

/**
 * Ragdoll-lite: the whole body topples about an axis through the feet (an inverted pendulum with a bounce),
 * while the animator blends limbs into a limp pose. angle in radians; axis is model-space horizontal.
 */
export class Ragdoll {
  constructor() { this.active = false; this.t = 0; this.angle = 0; this.spin = 0; this.axis = [1, 0, 0]; this.dir = [0, 0, 1]; this.landed = false; }
  /** @param {number[]} d model-space fall direction (unit xz) @param {number} strength impulse magnitude */
  start(d, strength = 1) {
    const T = TUNING.ragdoll;
    this.active = true; this.t = 0; this.angle = 0.02; this.landed = false;
    this.dir[0] = d[0]; this.dir[1] = 0; this.dir[2] = d[2];
    // axis = up × dir, so rotating by +angle tips the head toward dir
    this.axis[0] = d[2]; this.axis[1] = 0; this.axis[2] = -d[0];
    const l = Math.hypot(this.axis[0], this.axis[2]) || 1; this.axis[0] /= l; this.axis[2] /= l;
    this.spin = Math.min(T.maxSpin, T.minSpin + strength * T.impulseGain);
  }
  stop() { this.active = false; this.angle = 0; this.spin = 0; this.t = 0; }
  update(dt) {
    if (!this.active) return;
    const T = TUNING.ragdoll, max = T.maxAngle * DEG;
    this.t += dt;
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(TUNING.substep, left); left -= h;
      if (this.landed) break;
      this.spin += (T.gravity / T.comHeight) * Math.sin(this.angle) * h;
      this.angle += this.spin * h;
      if (this.angle >= max) {
        this.angle = max;
        if (Math.abs(this.spin) < T.settle) { this.spin = 0; this.landed = true; } else this.spin = -this.spin * T.bounce;
      }
    }
  }
  /** 0 → 1 as limbs go limp. */
  get limp() { return Math.min(1, this.t / TUNING.ragdoll.limpTime); }
}

export { DEG };
