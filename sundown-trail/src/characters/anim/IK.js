import { qFromBasis, vSub, vLen, vScale, vAddScaled, vDot, vCross, vNormalize, vCopy } from './QMath.js';

/**
 * Analytic two-bone IK (hip-knee-ankle, shoulder-elbow-wrist) for bones whose rest direction is −Y
 * and which bend about their local X axis (the child swings toward local +Z, i.e. backwards for a knee).
 * Works in any common space (the animator uses model space). Pure maths, no Three.js.
 */
export const TUNING = { reachMargin: 0.998, minBend: 0.02 };

const _d = [0, 0, 0], _dir = [0, 0, 0], _perp = [0, 0, 0], _y = [0, 0, 0], _x = [0, 0, 0], _z = [0, 0, 0], _t = [0, 0, 0];

/**
 * @param {number[]} A root joint position
 * @param {number[]} T target position for the end joint
 * @param {number} a upper bone length, b lower bone length
 * @param {number[]} pole direction the middle joint should point toward (e.g. knee forward)
 * @param {number[]} outMid receives the middle joint position
 * @param {number[]} outEnd receives the reached end position (equals T when reachable)
 * @param {Float32Array|number[]} qUpper receives the upper bone's orientation (same space as A) at index qi
 * @param {Float32Array|number[]} qLower receives the lower bone's orientation at index qj
 * @returns {number} distance from A to T divided by the reach (≤ 1 when reachable)
 */
export function solveTwoBone(A, T, a, b, pole, outMid, outEnd, qUpper, qi, qLower, qj) {
  vSub(_d, T, A);
  let dist = vLen(_d);
  const maxReach = (a + b) * TUNING.reachMargin, minReach = Math.abs(a - b) + 1e-4;
  const ratio = dist / (a + b);
  if (dist < 1e-6) { _d[0] = 0; _d[1] = -1; _d[2] = 0; dist = minReach; }
  vScale(_dir, _d, 1 / vLen(_d));
  dist = Math.min(maxReach, Math.max(minReach, dist));
  // Pole component perpendicular to the A→T line picks the bend plane.
  vAddScaled(_perp, pole, _dir, -vDot(pole, _dir));
  if (vLen(_perp) < 1e-5) { // pole parallel to the limb: any perpendicular will do
    vCross(_perp, _dir, Math.abs(_dir[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]);
  }
  vNormalize(_perp);
  let cosA = (a * a + dist * dist - b * b) / (2 * a * dist);
  cosA = Math.max(-1, Math.min(1, cosA));
  const sinA = Math.max(TUNING.minBend, Math.sqrt(1 - cosA * cosA));
  outMid[0] = A[0] + (_dir[0] * cosA + _perp[0] * sinA) * a;
  outMid[1] = A[1] + (_dir[1] * cosA + _perp[1] * sinA) * a;
  outMid[2] = A[2] + (_dir[2] * cosA + _perp[2] * sinA) * a;
  vAddScaled(outEnd, A, _dir, dist);
  // Upper bone: local −Y toward the middle joint, local +Z away from the pole (the side the lower bone folds to).
  limbBasis(qUpper, qi, A, outMid, _perp);
  // Lower bone: same bend plane.
  limbBasis(qLower, qj, outMid, outEnd, _perp);
  return ratio;
}

/** Orientation for a bone running from P to C (local −Y along P→C) with its +Z pointing away from `front`. */
export function limbBasis(q, qi, P, C, front) {
  vSub(_t, P, C); vNormalize(_y, _t);
  vCopy(_z, front); vScale(_z, _z, -1);
  vAddScaled(_z, _z, _y, -vDot(_z, _y));
  if (vLen(_z) < 1e-6) vCross(_z, _y, [1, 0, 0]);
  vNormalize(_z);
  vCross(_x, _y, _z);
  return qFromBasis(q, qi, _x, _y, _z);
}
