/**
 * Horse skeleton (about 15 hands, 1.55 m at the withers). Model faces −Z, origin on the ground under the girth.
 * Bones are listed with model-space rest JOINT positions; offsets are derived. Rest rotations are identity.
 * Leg chains: front = shoulder (scapula, from the withers) → forearm (elbow) → cannon (knee) → pastern (fetlock);
 * hind = thigh (hip) → gaskin (stifle) → cannon (hock) → pastern (fetlock). The hoof sits on the pastern bone.
 * Rotation conventions (degrees, XYZ): +X swings a limb forward (its lower end toward −Z); a knee/hock folds by
 * rotating its lower bone about X; +Y turns left; +Z rolls the top toward −X. Left bones mirror right as (x, −y, −z).
 */
export const TUNING = { withers: 1.55 };

const J = {
  root: [0, 0, 0],
  body: [0, 1.22, 0.02],
  front: [0, 1.3, -0.48], // withers / chest
  rear: [0, 1.3, 0.55], // loins / croup
  neck1: [0, 1.36, -0.78], neck2: [0, 1.62, -1.0], head: [0, 1.88, -1.2],
  jaw: [0, 1.8, -1.28], earR: [0.055, 1.96, -1.2], mane1: [0, 1.58, -0.86], mane2: [0, 1.82, -1.06],
  tail1: [0, 1.36, 1.0], tail2: [0, 1.2, 1.12], tail3: [0, 0.98, 1.16], tail4: [0, 0.76, 1.17],
  shoulderR: [0.13, 1.42, -0.52], forearmR: [0.16, 1.0, -0.62], fcannonR: [0.16, 0.58, -0.62], fpasternR: [0.16, 0.24, -0.62],
  thighR: [0.17, 1.3, 0.72], gaskinR: [0.19, 0.94, 0.55], hcannonR: [0.17, 0.56, 0.86], hpasternR: [0.17, 0.23, 0.83],
};
/** Coronet (top of the hoof) relative to the pastern joint, and hoof height. */
export const HOOF = { front: [0, -0.17, -0.035], hind: [0, -0.17, -0.03], height: 0.07 };

const L = (n) => n.replace(/R$/, 'L');
const legs = [
  ['shoulderR', 'front'], ['forearmR', 'shoulderR'], ['fcannonR', 'forearmR'], ['fpasternR', 'fcannonR'],
  ['thighR', 'rear'], ['gaskinR', 'thighR'], ['hcannonR', 'gaskinR'], ['hpasternR', 'hcannonR'],
];
const LIST = [
  ['root', null], ['body', 'root'], ['front', 'body'], ['rear', 'body'],
  ['neck1', 'front'], ['neck2', 'neck1'], ['head', 'neck2'], ['jaw', 'head'], ['earR', 'head'], ['earL', 'head'],
  ['mane1', 'neck1'], ['mane2', 'neck2'],
  ['tail1', 'rear'], ['tail2', 'tail1'], ['tail3', 'tail2'], ['tail4', 'tail3'],
  ...legs, ...legs.map(([n, p]) => [L(n), p.endsWith('R') ? L(p) : p]),
];
const jointOf = (n) => { if (J[n]) return J[n]; const r = J[n.replace(/L$/, 'R')]; return [-r[0], r[1], r[2]]; };

/** [name, parent, offset] in parent-before-child order. */
export const HBONES = Object.freeze(LIST.map(([n, p]) => {
  const j = jointOf(n), pj = p ? jointOf(p) : [0, 0, 0];
  return [n, p, [j[0] - pj[0], j[1] - pj[1], j[2] - pj[2]]];
}));
export const HB = Object.freeze(Object.fromEntries(HBONES.map(([n], i) => [n, i])));
export const HPARENT = Object.freeze(HBONES.map(([, p]) => (p ? HB[p] : -1)));
export const HOFFSET = new Float32Array(HBONES.length * 3);
export const HREST = new Float32Array(HBONES.length * 3);
HBONES.forEach(([n, , o], i) => { HOFFSET.set(o, i * 3); HREST.set(jointOf(n), i * 3); });
export const hrest = (n) => { const i = HB[n]; return [HREST[i * 3], HREST[i * 3 + 1], HREST[i * 3 + 2]]; };

/** Leg descriptors: [name, side (+1 right), front?, upper, mid, lower, pastern]. */
export const LEGS = Object.freeze([
  { id: 'RF', side: 1, front: true, top: HB.shoulderR, a: HB.forearmR, b: HB.fcannonR, c: HB.fpasternR },
  { id: 'LF', side: -1, front: true, top: HB.shoulderL, a: HB.forearmL, b: HB.fcannonL, c: HB.fpasternL },
  { id: 'RH', side: 1, front: false, top: HB.thighR, a: HB.gaskinR, b: HB.hcannonR, c: HB.hpasternR },
  { id: 'LH', side: -1, front: false, top: HB.thighL, a: HB.gaskinL, b: HB.hcannonL, c: HB.hpasternL },
]);
