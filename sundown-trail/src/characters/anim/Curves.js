/**
 * Keyframe tracks sampled with cubic Hermite curves (Catmull-Rom tangents for non-uniform key times).
 * Looping tracks wrap smoothly from the last key back to the first; one-shot tracks ease in and out
 * (zero tangents at both ends) and hold their last key. Pure maths, no Three.js.
 */
export const TUNING = { tension: 1 };

/**
 * @param {number[]} times key times, normalized 0..1 (loops: all < 1), ascending
 * @param {number[][]} values one array of `dims` numbers per key
 * @param {boolean} loop
 */
export function compileTrack(times, values, loop) {
  const n = times.length, dims = values[0].length;
  const t = Float32Array.from(times), v = new Float32Array(n * dims), m = new Float32Array(n * dims);
  for (let k = 0; k < n; k++) for (let d = 0; d < dims; d++) v[k * dims + d] = values[k][d];
  for (let k = 0; k < n; k++) {
    for (let d = 0; d < dims; d++) {
      if (n === 1) { m[k * dims + d] = 0; continue; }
      let tp, tn, vp, vn;
      if (loop) {
        const kp = (k - 1 + n) % n, kn = (k + 1) % n;
        tp = k === 0 ? t[kp] - 1 : t[kp]; tn = k === n - 1 ? t[kn] + 1 : t[kn];
        vp = v[kp * dims + d]; vn = v[kn * dims + d];
      } else {
        if (k === 0 || k === n - 1) { m[k * dims + d] = 0; continue; }
        tp = t[k - 1]; tn = t[k + 1]; vp = v[(k - 1) * dims + d]; vn = v[(k + 1) * dims + d];
      }
      m[k * dims + d] = TUNING.tension * (vn - vp) / Math.max(1e-6, tn - tp);
    }
  }
  return { times: t, values: v, tangents: m, dims, loop, count: n };
}

/** Writes the sample at normalized time `time` into out[offset .. offset + dims). */
export function sampleTrack(track, time, out, offset = 0) {
  const { times, values, tangents, dims, loop, count: n } = track;
  if (n === 1) { for (let d = 0; d < dims; d++) out[offset + d] = values[d]; return out; }
  let t = time;
  if (loop) { t -= Math.floor(t); } else if (t <= times[0]) { for (let d = 0; d < dims; d++) out[offset + d] = values[d]; return out; }
  else if (t >= times[n - 1]) { const b = (n - 1) * dims; for (let d = 0; d < dims; d++) out[offset + d] = values[b + d]; return out; }
  let k0, k1, t0, t1;
  if (loop && (t < times[0] || t >= times[n - 1])) {
    k0 = n - 1; k1 = 0; t0 = times[n - 1]; t1 = times[0] + 1;
    if (t < times[0]) t += 1;
  } else {
    k1 = 1; while (k1 < n - 1 && times[k1] <= t) k1++;
    k0 = k1 - 1; t0 = times[k0]; t1 = times[k1];
  }
  const h = Math.max(1e-6, t1 - t0), s = (t - t0) / h, s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  const a = k0 * dims, b = k1 * dims;
  for (let d = 0; d < dims; d++) out[offset + d] = h00 * values[a + d] + h10 * h * tangents[a + d] + h01 * values[b + d] + h11 * h * tangents[b + d];
  return out;
}

/** Hermite between p0 and p1 with explicit tangents (per unit s). */
export function hermite1(p0, m0, p1, m1, s) {
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1;
}

export const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const smoother01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (t * 6 - 15) + 10));
