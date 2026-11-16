/**
 * Spline and distance helpers for terrain generation. Pure and allocation-light; no Three.js,
 * so the generator can run in a Web Worker (workers don't see the page's import map).
 */
export const TUNING = { subdivisions: 48 };

/**
 * Samples a uniform Catmull-Rom spline through [[x, z], ...] at an even arc-length spacing.
 * The curve passes through every control point. Returns flat arrays plus the arc length of each knot.
 * @param {number[][]} points control points [[x, z], ...]
 * @param {number} spacing metres between samples
 * @returns {{ xs: Float64Array, zs: Float64Array, s: Float64Array, length: number, knots: number[] }}
 */
export function sampleCatmullRom(points, spacing) {
  const n = points.length;
  if (n < 2) throw new Error('a spline needs at least two points');
  const sub = TUNING.subdivisions, fx = [], fz = [], fs = [], knots = [0];
  const P = (i) => points[Math.max(0, Math.min(n - 1, i))];
  let len = 0, px = points[0][0], pz = points[0][1];
  fx.push(px); fz.push(pz); fs.push(0);
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 1; k <= sub; k++) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const z = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      len += Math.hypot(x - px, z - pz); px = x; pz = z;
      fx.push(x); fz.push(z); fs.push(len);
    }
    knots.push(len);
  }
  const count = Math.max(2, Math.round(len / spacing) + 1), step = len / (count - 1);
  const xs = new Float64Array(count), zs = new Float64Array(count), s = new Float64Array(count);
  let j = 0;
  for (let i = 0; i < count; i++) {
    const target = Math.min(len, i * step);
    while (j < fs.length - 2 && fs[j + 1] < target) j++;
    const seg = fs[j + 1] - fs[j], t = seg > 1e-9 ? (target - fs[j]) / seg : 0;
    xs[i] = fx[j] + (fx[j + 1] - fx[j]) * t; zs[i] = fz[j] + (fz[j + 1] - fz[j]) * t; s[i] = target;
  }
  return { xs, zs, s, length: len, knots };
}

const SEG = { d: 0, t: 0 };
/**
 * Distance from (px, pz) to segment a→b. Writes into and returns a shared object; copy what you keep.
 * @returns {{d: number, t: number}} t is 0..1 along the segment
 */
export function segmentDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 1e-12 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qz = az + dz * t - pz;
  SEG.d = Math.sqrt(qx * qx + qz * qz); SEG.t = t;
  return SEG;
}

/** Index of the polyline sample nearest to (x, z). */
export function nearestSample(xs, zs, x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < xs.length; i++) { const d = (xs[i] - x) ** 2 + (zs[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}

/** Linear interpolation into an array indexed by a fractional position. */
export function sampleArray(arr, f) {
  const n = arr.length;
  if (f <= 0) return arr[0];
  if (f >= n - 1) return arr[n - 1];
  const i = Math.floor(f), t = f - i;
  return arr[i] + (arr[i + 1] - arr[i]) * t;
}

/** In-place box blur of a 1D profile, keeping `locked` samples (Uint8Array, 1 = fixed) unchanged. */
export function smoothProfile(h, radius, passes = 2, locked = null) {
  const n = h.length, tmp = new Float64Array(n);
  for (let p = 0; p < passes; p++) {
    let sum = 0, cnt = 0;
    for (let i = 0; i < Math.min(n, radius); i++) { sum += h[i]; cnt++; }
    for (let i = 0; i < n; i++) {
      const add = i + radius, rem = i - radius - 1;
      if (add < n) { sum += h[add]; cnt++; }
      if (rem >= 0) { sum -= h[rem]; cnt--; }
      tmp[i] = sum / cnt;
    }
    for (let i = 0; i < n; i++) if (!locked || !locked[i]) h[i] = tmp[i];
  }
  return h;
}
