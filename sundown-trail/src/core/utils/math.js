/** Small math helpers. Everything here is allocation-free. */
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, clamp(invLerp(a, b, v), 0, 1));
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Frame-rate independent exponential smoothing toward target. */
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));
export function wrapAngle(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
export const angleDelta = (from, to) => wrapAngle(to - from);
export const dampAngle = (current, target, lambda, dt) => current + angleDelta(current, target) * (1 - Math.exp(-lambda * dt));

/** Exact critically damped spring step. Returns the new value; writes velocity into state.v. */
export function springStep(state, target, omega, dt) {
  const exp = Math.exp(-omega * dt), change = state.x - target, temp = (state.v + omega * change) * dt;
  state.v = (state.v - omega * temp) * exp;
  state.x = target + (change + temp) * exp;
  return state.x;
}

/** Scalar critically damped spring: stable at any dt, never overshoots. */
export class Spring {
  constructor(value = 0, omega = 10) { this.x = value; this.v = 0; this.target = value; this.omega = omega; }
  get value() { return this.x; }
  update(dt) { return springStep(this, this.target, this.omega, dt); }
  snap(value) { this.x = this.target = value; this.v = 0; }
}

/** Cubic Hermite interpolation between p0 and p1 with tangents m0, m1. */
export function hermite(p0, m0, p1, m1, t) {
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
}
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

/** 3725 → "1 h 02 m" */
export function formatPlaytime(seconds = 0) {
  const m = Math.floor(seconds / 60), h = Math.floor(m / 60);
  return h ? `${h} h ${String(m % 60).padStart(2, '0')} m` : `${m} m`;
}
