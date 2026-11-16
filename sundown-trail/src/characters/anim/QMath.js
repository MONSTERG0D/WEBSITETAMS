/**
 * Allocation-free quaternion and vector helpers on flat arrays (x, y, z, w at an offset).
 * Pure math with no Three.js dependency, so the animator's maths is unit-testable in Node.
 */
export const TUNING = { slerpEpsilon: 1e-6 };

export const DEG = Math.PI / 180;

export function qIdentity(o, i = 0) { o[i] = 0; o[i + 1] = 0; o[i + 2] = 0; o[i + 3] = 1; return o; }
export function qCopy(o, oi, a, ai) { o[oi] = a[ai]; o[oi + 1] = a[ai + 1]; o[oi + 2] = a[ai + 2]; o[oi + 3] = a[ai + 3]; return o; }

/** Euler angles in degrees, intrinsic order X then Y then Z (same as THREE.Euler 'XYZ'). */
export function qFromEuler(o, i, xd, yd, zd) {
  const x = xd * DEG * 0.5, y = yd * DEG * 0.5, z = zd * DEG * 0.5;
  const c1 = Math.cos(x), c2 = Math.cos(y), c3 = Math.cos(z), s1 = Math.sin(x), s2 = Math.sin(y), s3 = Math.sin(z);
  o[i] = s1 * c2 * c3 + c1 * s2 * s3;
  o[i + 1] = c1 * s2 * c3 - s1 * c2 * s3;
  o[i + 2] = c1 * c2 * s3 + s1 * s2 * c3;
  o[i + 3] = c1 * c2 * c3 - s1 * s2 * s3;
  return o;
}

/** Rotation of `rad` radians about a unit axis. */
export function qAxisAngle(o, i, ax, ay, az, rad) {
  const s = Math.sin(rad * 0.5);
  o[i] = ax * s; o[i + 1] = ay * s; o[i + 2] = az * s; o[i + 3] = Math.cos(rad * 0.5);
  return o;
}

/** o = a * b (apply b first, then a). o may alias a or b. */
export function qMul(o, oi, a, ai, b, bi) {
  const ax = a[ai], ay = a[ai + 1], az = a[ai + 2], aw = a[ai + 3];
  const bx = b[bi], by = b[bi + 1], bz = b[bi + 2], bw = b[bi + 3];
  o[oi] = ax * bw + aw * bx + ay * bz - az * by;
  o[oi + 1] = ay * bw + aw * by + az * bx - ax * bz;
  o[oi + 2] = az * bw + aw * bz + ax * by - ay * bx;
  o[oi + 3] = aw * bw - ax * bx - ay * by - az * bz;
  return o;
}

/** Conjugate (the inverse of a unit quaternion). */
export function qInvert(o, oi, a, ai) { o[oi] = -a[ai]; o[oi + 1] = -a[ai + 1]; o[oi + 2] = -a[ai + 2]; o[oi + 3] = a[ai + 3]; return o; }

export function qNormalize(o, i) {
  let l = Math.hypot(o[i], o[i + 1], o[i + 2], o[i + 3]);
  if (l < 1e-12) return qIdentity(o, i);
  l = 1 / l; o[i] *= l; o[i + 1] *= l; o[i + 2] *= l; o[i + 3] *= l;
  return o;
}

/** Spherical interpolation along the shortest arc. o may alias a or b. */
export function qSlerp(o, oi, a, ai, b, bi, t) {
  const ax = a[ai], ay = a[ai + 1], az = a[ai + 2], aw = a[ai + 3];
  let bx = b[bi], by = b[bi + 1], bz = b[bi + 2], bw = b[bi + 3];
  if (t <= 0) { o[oi] = ax; o[oi + 1] = ay; o[oi + 2] = az; o[oi + 3] = aw; return o; }
  if (t >= 1) { o[oi] = bx; o[oi + 1] = by; o[oi + 2] = bz; o[oi + 3] = bw; return o; }
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let s0 = 1 - t, s1 = t;
  if (1 - cos > TUNING.slerpEpsilon) {
    const sin = Math.sqrt(1 - cos * cos), ang = Math.atan2(sin, cos);
    s0 = Math.sin(s0 * ang) / sin; s1 = Math.sin(s1 * ang) / sin;
  }
  o[oi] = ax * s0 + bx * s1; o[oi + 1] = ay * s0 + by * s1; o[oi + 2] = az * s0 + bz * s1; o[oi + 3] = aw * s0 + bw * s1;
  if (s0 + s1 !== 1) qNormalize(o, oi);
  return o;
}

/** out = q · v (rotates the vector v = [x, y, z]). out may alias v. */
export function qRotate(out, q, qi, v) {
  const x = v[0], y = v[1], z = v[2], qx = q[qi], qy = q[qi + 1], qz = q[qi + 2], qw = q[qi + 3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[0] = x + qw * tx + qy * tz - qz * ty;
  out[1] = y + qw * ty + qz * tx - qx * tz;
  out[2] = z + qw * tz + qx * ty - qy * tx;
  return out;
}

/** Quaternion from an orthonormal basis given as the images of the local X, Y and Z axes. */
export function qFromBasis(o, i, x, y, z) {
  const m11 = x[0], m12 = y[0], m13 = z[0], m21 = x[1], m22 = y[1], m23 = z[1], m31 = x[2], m32 = y[2], m33 = z[2];
  const tr = m11 + m22 + m33;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    o[i + 3] = 0.25 / s; o[i] = (m32 - m23) * s; o[i + 1] = (m13 - m31) * s; o[i + 2] = (m21 - m12) * s;
  } else if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    o[i + 3] = (m32 - m23) / s; o[i] = 0.25 * s; o[i + 1] = (m12 + m21) / s; o[i + 2] = (m13 + m31) / s;
  } else if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    o[i + 3] = (m13 - m31) / s; o[i] = (m12 + m21) / s; o[i + 1] = 0.25 * s; o[i + 2] = (m23 + m32) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    o[i + 3] = (m21 - m12) / s; o[i] = (m13 + m31) / s; o[i + 1] = (m23 + m32) / s; o[i + 2] = 0.25 * s;
  }
  return qNormalize(o, i);
}

// ---------- 3-vectors as [x, y, z]
export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export function vSet(o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; }
export function vCopy(o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; }
export function vAdd(o, a, b) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; }
export function vSub(o, a, b) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; }
export function vScale(o, a, s) { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; }
export function vAddScaled(o, a, b, s) { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; }
export const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vLen = (a) => Math.hypot(a[0], a[1], a[2]);
export function vCross(o, a, b) {
  const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
  o[0] = x; o[1] = y; o[2] = z; return o;
}
export function vNormalize(o, a = o) {
  const l = vLen(a);
  if (l < 1e-12) { o[0] = 0; o[1] = 0; o[2] = 0; return o; }
  return vScale(o, a, 1 / l);
}
export function vLerp(o, a, b, t) { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; }
