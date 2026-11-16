import { hermite1, smooth01 } from './Curves.js';

/**
 * Procedural locomotion for idle, walk, run, sprint, crouchIdle and crouchWalk. The gait phase advances by
 * distance travelled ÷ stride length, and each stance foot moves backwards in model space at exactly the
 * body's speed, so planted feet never slide whatever the speed. Swing feet follow Hermite arcs whose end
 * tangents match the stance velocity. When the body slows to a stop, feet lock to the ground in world space
 * and take small corrective steps (also used for turning on the spot). Upper-body motion (arm swing,
 * pelvis twist and bob, counter-rotation, lean) is written as euler degrees per channel for the animator.
 */
export const TUNING = {
  speeds: { walk: 1.6, run: 4.2, sprint: 6.8 },
  gaits: {
    walk: { L: 1.38, duty: 0.6, lift: 0.09, arm: 16, elbow: 14, elbowSwing: 10, lean: 2, bob: 0.022, yaw: 5, roll: 3, sway: 0.014, width: 0.1, heel: 16, toe: 26, abduct: 6 },
    run: { L: 2.6, duty: 0.38, lift: 0.2, arm: 32, elbow: 78, elbowSwing: 16, lean: 12, bob: 0.042, yaw: 8, roll: 2.5, sway: 0.008, width: 0.075, heel: 8, toe: 40, abduct: 9 },
    sprint: { L: 3.5, duty: 0.32, lift: 0.28, arm: 50, elbow: 88, elbowSwing: 22, lean: 18, bob: 0.05, yaw: 10, roll: 2, sway: 0.005, width: 0.07, heel: 5, toe: 50, abduct: 11 },
    crouch: { L: 1.0, duty: 0.66, lift: 0.08, arm: 8, elbow: 45, elbowSwing: 6, lean: 24, bob: 0.014, yaw: 4, roll: 2, sway: 0.01, width: 0.15, heel: 8, toe: 18, abduct: 14 },
  },
  crouchDrop: 0.34, ankleHeight: 0.08, toeLever: 0.13, heelLever: 0.055,
  moveOn: 0.18, moveOff: 0.1, moveRate: 7,
  step: { threshold: 0.12, yawThreshold: 0.6, duration: 0.3, height: 0.075, cooldown: 0.06, lead: 0.15 },
  idleFeet: { width: 0.105, crouchWidth: 0.15, toeOut: 7 },
};

const KEYS = Object.keys(TUNING.gaits.walk);
const G = TUNING.gaits;

/** Gait parameters blended by speed (walk → run → sprint) and crouch weight. Writes into `out`. */
export function blendGait(out, speed, crouch) {
  const S = TUNING.speeds;
  const a = speed <= S.run ? G.walk : G.run, b = speed <= S.run ? G.run : G.sprint;
  const t = speed <= S.walk ? 0 : speed <= S.run ? (speed - S.walk) / (S.run - S.walk) : Math.min(1, (speed - S.run) / (S.sprint - S.run));
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  if (crouch > 0) for (const k of KEYS) out[k] += (G.crouch[k] - out[k]) * crouch;
  out.runness = speed <= S.walk ? 0 : Math.min(1, (speed - S.walk) / (S.run - S.walk));
  // shorter strides when slower than a walk: cadence drops but stays natural
  out.L *= 0.62 + 0.38 * Math.min(1, speed / S.walk);
  return out;
}

/** One foot's planted/stepping state in world XZ. */
class Foot {
  constructor(side) { this.side = side; this.mode = 'gait'; this.stance = false; this.ax = 0; this.az = 0; this.ox = 0; this.oz = 0; this.wx = 0; this.wz = 0; this.fx = 0; this.fz = 0; this.tx = 0; this.tz = 0; this.t = 0; this.yaw = 0; this.fromYaw = 0; this.toYaw = 0; }
}

export class Locomotion {
  constructor() {
    this.phase = 0; this.moveW = 0; this.crouch = 0; this.p = {};
    this.feet = [new Foot(1), new Foot(-1)];
    /** Output: per foot local ankle target [x, y, z], foot yaw and pitch (radians). */
    this.target = [[0.1, 0.08, 0], [-0.1, 0.08, 0]];
    this.footYaw = [0, 0]; this.footPitch = [0, 0]; this.lift = [0, 0];
    this.pelvis = [0, 0, 0];
    this._cool = 0; this._first = true;
  }
  reset() { this._first = true; this.moveW = 0; for (const f of this.feet) { f.stance = false; f.ox = f.oz = 0; } }

  /**
   * @param {number} dt
   * @param {object} m motion: { vx, vz (model-space velocity), speed, crouch (0..1 target) }
   * @param {object} xf model↔world transform helpers { toWorld(lx, lz, out), toLocal(wx, wz, out), yaw }
   */
  update(dt, m, xf) {
    const P = blendGait(this.p, m.speed, this.crouch);
    this.crouch += (m.crouch - this.crouch) * (1 - Math.exp(-6 * dt));
    const moving = m.speed > (this.moveW > 0.5 ? TUNING.moveOff : TUNING.moveOn);
    this.moveW += ((moving ? 1 : 0) - this.moveW) * (1 - Math.exp(-TUNING.moveRate * dt));
    if (moving) this.phase = (this.phase + (m.speed * dt) / P.L) % 1;
    const dl = Math.hypot(m.vx, m.vz), dx = dl > 1e-3 ? m.vx / dl : 0, dz = dl > 1e-3 ? m.vz / dl : -1;
    const backward = dz > 0.35;
    const faceYaw = backward ? 0 : Math.max(-0.5, Math.min(0.5, Math.atan2(-dx, -dz) * 0.35));
    const d = P.duty, L = P.L, mw = this.moveW;
    // ---------- gait targets (model space)
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1, psi = (this.phase + (i === 0 ? 0 : 0.5)) % 1;
      let along, h = 0, pitch;
      if (psi < d) {
        const s = psi / d;
        along = L * d * (0.5 - s);
        pitch = s < 0.14 ? P.heel * (1 - s / 0.14) : s > 0.62 ? -P.toe * Math.pow((s - 0.62) / 0.38, 1.6) : 0;
      } else {
        const s = (psi - d) / (1 - d), m0 = -L * (1 - d) * 0.55;
        along = hermite1(-L * d / 2, m0, L * d / 2, m0, s);
        h = P.lift * Math.sin(Math.PI * Math.pow(s, 0.85)) * (0.6 + 0.4 * Math.min(1, m.speed / 2));
        pitch = -P.toe + (P.toe + P.heel) * smooth01(s * 1.15);
      }
      const width = (P.width + 0.05 * Math.abs(dx)) * side;
      let gx = width + dx * along, gz = dz * along + (backward ? 0 : -0.02 * P.runness);
      // stance feet lock to the ground in world space (no sliding even while turning); the swing that follows
      // starts from wherever the locked foot ended up and eases back onto the gait curve
      const f = this.feet[i], tmp = this._tmp || (this._tmp = [0, 0]);
      if (moving && psi < d) {
        if (!f.stance || this._first) { xf.toWorld(gx, gz, tmp); f.ax = tmp[0]; f.az = tmp[1]; f.stance = true; }
        xf.toLocal(f.ax, f.az, tmp);
        if (Math.hypot(tmp[0] - gx, tmp[1] - gz) > 0.4) { xf.toWorld(gx, gz, tmp); f.ax = tmp[0]; f.az = tmp[1]; xf.toLocal(f.ax, f.az, tmp); }
        f.lx = tmp[0]; f.lz = tmp[1]; f.ox = tmp[0] - gx; f.oz = tmp[1] - gz;
        gx = tmp[0]; gz = tmp[1];
      } else {
        if (f.stance) f.stance = false;
        const k = psi >= d ? 1 - smooth01((psi - d) / (1 - d) * 1.6) : 0;
        gx += (f.ox || 0) * k; gz += (f.oz || 0) * k;
      }
      this._gait = this._gait || [[0, 0, 0], [0, 0, 0]];
      this._gpitch = this._gpitch || [0, 0];
      this._gait[i][0] = gx; this._gait[i][1] = h; this._gait[i][2] = gz;
      this._gpitch[i] = pitch * Math.PI / 180;
    }
    // ---------- planted feet when slow
    const S = TUNING.step, idleW = (TUNING.idleFeet.width + (TUNING.idleFeet.crouchWidth - TUNING.idleFeet.width) * this.crouch);
    const tmp = [0, 0];
    this._cool -= dt;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i], g = this._gait[i];
      if (this._first || mw > 0.97) {
        xf.toWorld(g[0], g[2], tmp); f.wx = tmp[0]; f.wz = tmp[1]; f.mode = 'gait'; f.yaw = xf.yaw + faceYaw;
        continue;
      }
      if (f.mode === 'gait') f.mode = 'plant';
      if (f.mode === 'step') {
        f.t += dt / S.duration;
        const k = smooth01(f.t);
        f.wx = f.fx + (f.tx - f.fx) * k; f.wz = f.fz + (f.tz - f.fz) * k; f.yaw = f.fromYaw + angleDiff(f.fromYaw, f.toYaw) * k;
        if (f.t >= 1) { f.mode = 'plant'; this._cool = S.cooldown; }
      }
    }
    if (mw <= 0.97 && !this._first) {
      // pick the foot that is most out of place and let it step if the other one is planted
      let worst = -1, worstErr = 0;
      for (let i = 0; i < 2; i++) {
        const f = this.feet[i], side = i === 0 ? 1 : -1;
        const ix = side * idleW, iz = this.crouch > 0.5 ? (side > 0 ? 0.07 : -0.11) : (side > 0 ? -0.01 : 0.02);
        xf.toWorld(ix + m.vx * S.lead, iz + m.vz * S.lead, tmp);
        f._dx = tmp[0]; f._dz = tmp[1];
        const err = Math.hypot(f.wx - tmp[0], f.wz - tmp[1]) + Math.abs(angleDiff(f.yaw, xf.yaw)) * 0.12;
        if (f.mode === 'plant' && err > worstErr) { worstErr = err; worst = i; }
      }
      const stepping = this.feet.some((f) => f.mode === 'step');
      if (worst >= 0 && !stepping && this._cool <= 0 && (worstErr > S.threshold)) {
        const f = this.feet[worst];
        f.mode = 'step'; f.t = 0; f.fx = f.wx; f.fz = f.wz; f.tx = f._dx; f.tz = f._dz; f.fromYaw = f.yaw; f.toYaw = xf.yaw + (worst === 0 ? -1 : 1) * TUNING.idleFeet.toeOut * Math.PI / 180;
      }
    }
    this._first = false;
    // ---------- blend planted and gait targets in model space
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i], g = this._gait[i], out = this.target[i];
      xf.toLocal(f.wx, f.wz, tmp);
      const stepH = f.mode === 'step' ? S.height * Math.sin(Math.PI * Math.min(1, f.t)) : 0;
      const stepPitch = f.mode === 'step' ? Math.sin(Math.PI * Math.min(1, f.t)) * -0.25 : 0;
      out[0] = tmp[0] + (g[0] - tmp[0]) * mw;
      out[2] = tmp[1] + (g[2] - tmp[1]) * mw;
      this.lift[i] = stepH + (g[1] - stepH) * mw;
      this.footPitch[i] = stepPitch + (this._gpitch[i] - stepPitch) * mw;
      const plantedYaw = angleDiff(xf.yaw, f.yaw);
      const gaitYaw = faceYaw + (i === 0 ? -1 : 1) * TUNING.idleFeet.toeOut * Math.PI / 180 * 0.6;
      this.footYaw[i] = plantedYaw + (gaitYaw - plantedYaw) * mw;
    }
    // ---------- pelvis: crouch drop, bob and sway
    const bobSign = 1 - 2 * P.runness, ph2 = 4 * Math.PI * (this.phase - d / 2);
    this.pelvis[0] = P.sway * Math.cos(2 * Math.PI * (this.phase - d / 2)) * mw;
    this.pelvis[1] = -TUNING.crouchDrop * this.crouch + P.bob * bobSign * Math.cos(ph2) * mw * Math.min(1, m.speed / 1.2);
    this.pelvis[2] = 0;
    return P;
  }

  /** Upper-body channels in degrees for the current phase: writes into E (a map of channel → [x, y, z]). */
  upper(E, P, m, t) {
    const mw = this.moveW, c = Math.cos(2 * Math.PI * this.phase), s2 = Math.cos(2 * Math.PI * (this.phase - P.duty / 2));
    const spd = Math.min(1, m.speed / 2), amp = mw * (0.35 + 0.65 * spd), cr = this.crouch;
    const hipYaw = P.yaw * c * amp, hipRoll = P.roll * s2 * amp;
    const idleSway = (1 - mw) * Math.sin(t * 0.42) * 1.2;
    set(E.hips, -cr * 6, hipYaw, hipRoll + idleSway * 0.6);
    set(E.spine, -P.lean * 0.55 * mw - cr * 12, -hipYaw * 0.4, -hipRoll * 0.6 - idleSway * 0.4);
    set(E.chest, -P.lean * 0.45 * mw - cr * 8, -hipYaw * 0.9, -hipRoll * 0.3);
    set(E.neck, P.lean * 0.4 * mw + cr * 9, hipYaw * 0.25, hipRoll * 0.4);
    set(E.head, P.lean * 0.4 * mw + cr * 7, hipYaw * 0.1, 0);
    const arm = P.arm * amp, el = P.elbow * mw + 9 * (1 - mw) + cr * 25 * (1 - mw), ab = P.abduct * mw + 5 * (1 - mw) + cr * 6;
    set(E.upperArmR, 3 - arm * c + cr * 12, 0, ab);
    set(E.upperArmL, 3 + arm * c + cr * 12, 0, -ab);
    set(E.lowerArmR, el + P.elbowSwing * mw * (0.5 - 0.5 * c), 0, 0);
    set(E.lowerArmL, el + P.elbowSwing * mw * (0.5 + 0.5 * c), 0, 0);
    set(E.handR, -4 * mw, 0, 0); set(E.handL, -4 * mw, 0, 0);
    const fist = 15 + 45 * P.runness * mw;
    set(E.fingersR, 0, 0, -fist); set(E.fingersL, 0, 0, fist);
    set(E.shoulderR, 0, 0, 1.5 * c * amp); set(E.shoulderL, 0, 0, 1.5 * c * amp);
  }
}

function set(o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; }
export function angleDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
