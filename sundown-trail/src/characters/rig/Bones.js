/**
 * The human skeleton: 32 bones in a rest pose with identity rotations (arms hanging, model facing −Z, right = +X).
 * Offsets are in metres for a 1.80 m adult; height variety comes from scaling the whole object.
 * Rotation conventions used by the clips (degrees, XYZ order, local to each bone):
 *   spine/chest/neck/head: −X bend forward, +Y turn left, +Z lean left
 *   thigh +X swing forward, shin −X bend knee, foot +X toes up; upperArm +X raise forward, R +Z raise sideways,
 *   lowerArm +X bend elbow; fingersR −Z curl. Left-side bones mirror right-side values as (x, −y, −z).
 */
export const TUNING = { thighLength: 0.44, shinLength: 0.39, ankleHeight: 0.08, headScale: 1.12 };

const R = (name) => name.replace(/R$/, 'L').replace(/R(\d)$/, 'L$1');
const arm = [
  ['shoulderR', 'chest', [0.04, 0.185, 0]], ['upperArmR', 'shoulderR', [0.137, -0.015, 0.01]],
  ['lowerArmR', 'upperArmR', [0, -0.29, 0]], ['handR', 'lowerArmR', [0, -0.255, 0]], ['fingersR', 'handR', [0, -0.09, 0]],
];
const leg = [['thighR', 'hips', [0.095, -0.06, 0]], ['shinR', 'thighR', [0, -0.44, 0]], ['footR', 'shinR', [0, -0.39, 0]]];
const mirror = (list) => list.map(([n, p, o]) => [R(n), p.endsWith('R') ? R(p) : p, [-o[0], o[1], o[2]]]);

/** [name, parent, offset from parent] in parent-before-child order. */
export const BONES = Object.freeze([
  ['root', null, [0, 0, 0]],
  ['hips', 'root', [0, 0.97, 0]],
  ['spine', 'hips', [0, 0.11, 0]],
  ['chest', 'spine', [0, 0.19, 0]],
  ['neck', 'chest', [0, 0.215, 0.005]],
  ['head', 'neck', [0, 0.08, 0]],
  ['jaw', 'head', [0, 0.055, -0.01]],
  ['lids', 'head', [0, 0.107, -0.085]],
  ['brows', 'head', [0, 0.132, -0.09]],
  ['hat', 'head', [0, 0.2, 0]],
  ...arm, ...mirror(arm), ...leg, ...mirror(leg),
  ['coatL1', 'hips', [-0.12, -0.03, -0.08]], ['coatL2', 'coatL1', [0, -0.27, 0]],
  ['coatR1', 'hips', [0.12, -0.03, -0.08]], ['coatR2', 'coatR1', [0, -0.27, 0]],
  ['coatB1', 'hips', [0, -0.03, 0.13]], ['coatB2', 'coatB1', [0, -0.27, 0]],
]);

/** name → index */
export const B = Object.freeze(Object.fromEntries(BONES.map(([n], i) => [n, i])));
/** parent index per bone (−1 for root) */
export const PARENT = Object.freeze(BONES.map(([, p]) => (p ? B[p] : -1)));
/** Rest offsets (Float32Array, 3 per bone) and model-space rest positions. */
export const OFFSET = new Float32Array(BONES.length * 3);
export const REST = new Float32Array(BONES.length * 3);
BONES.forEach(([, , o], i) => {
  OFFSET.set(o, i * 3);
  const p = PARENT[i];
  for (let k = 0; k < 3; k++) REST[i * 3 + k] = o[k] + (p >= 0 ? REST[p * 3 + k] : 0);
});
/** Model-space rest position of a bone as [x, y, z]. */
export const restOf = (name) => { const i = B[name]; return [REST[i * 3], REST[i * 3 + 1], REST[i * 3 + 2]]; };

/** Bones that the upper-body layer may drive, with default mask weights. */
export const UPPER_MASK = Object.freeze({
  spine: 0.5, chest: 1, neck: 0.8, head: 0.8,
  shoulderR: 1, upperArmR: 1, lowerArmR: 1, handR: 1, fingersR: 1,
  shoulderL: 1, upperArmL: 1, lowerArmL: 1, handL: 1, fingersL: 1,
});
export const ARM_R_MASK = Object.freeze({ shoulderR: 1, upperArmR: 1, lowerArmR: 1, handR: 1, fingersR: 1, chest: 0.3, neck: 0.4, head: 0.4 });
