import * as THREE from 'three';

/**
 * Post-animation arm adjustments for weapons (Part 6), applied to a Human's bones after its animator has written
 * the pose (the combat system runs after the characters system): a two-bone IK that puts the left hand on a long
 * gun's foregrip, and an aim correction that turns the shoulder and wrist so the barrel points exactly at the aim
 * point (bullets fly from the camera ray; this makes the gun agree with them).
 */
export const TUNING = { maxCorrection: 0.6, wristShare: 0.35, elbowOut: 0.35 };

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _pole = new THREE.Vector3();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _knee = new THREE.Vector3(), _ax = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _id = new THREE.Quaternion();

/** Rotates `bone` (in world space) by `q`, keeping its parent unchanged. */
function rotateWorld(bone, q) {
  bone.getWorldQuaternion(_qw);
  bone.parent.getWorldQuaternion(_qp).invert();
  bone.quaternion.copy(_qp.multiply(q.clone().multiply(_qw)));
  bone.updateMatrixWorld(true);
}
/** Turns `bone` so the direction from its origin to `from` (world) points at `to`, scaled by `weight`. */
function aimBone(bone, from, to, weight) {
  bone.getWorldPosition(_a);
  _v1.subVectors(from, _a); _v2.subVectors(to, _a);
  if (_v1.lengthSq() < 1e-8 || _v2.lengthSq() < 1e-8) return;
  _q.setFromUnitVectors(_v1.normalize(), _v2.normalize());
  if (weight < 1) _q.slerp(_id, 1 - weight);
  rotateWorld(bone, _q);
}

/**
 * Left/right hand onto `target` (world) with a two-bone solve on upperArm → lowerArm → hand.
 * @param {THREE.Bone[]} bones [upperArm, lowerArm, hand] @param {THREE.Vector3} pole a world point the elbow bends toward
 */
export function armIK(bones, target, pole, weight = 1) {
  if (weight <= 0) return;
  const [up, low, hand] = bones;
  up.updateWorldMatrix(true, true);
  up.getWorldPosition(_a); low.getWorldPosition(_b); hand.getWorldPosition(_c);
  const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c);
  _t.copy(target).sub(_a);
  const d = Math.min(_t.length(), (l1 + l2) * 0.999), dir = _t.normalize();
  // elbow on the circle where both segments meet, pushed toward the pole
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  _pole.copy(pole).sub(_a); _pole.addScaledVector(dir, -_pole.dot(dir));
  if (_pole.lengthSq() < 1e-8) _pole.set(0, -1, 0).addScaledVector(dir, -dir.y);
  _pole.normalize();
  _knee.copy(_a).addScaledVector(dir, x).addScaledVector(_pole, h);
  _t.copy(_a).addScaledVector(dir, d);
  aimBone(up, _b, _knee, weight);
  low.getWorldPosition(_b); hand.getWorldPosition(_c);
  aimBone(low, _c, _t, weight);
}

/**
 * Turns the shooting arm so the muzzle's forward axis (−Z of `muzzle`) points at `aim`: most of the turn at the
 * shoulder, the rest at the wrist. Large corrections (the target is far outside the pose) are clamped.
 */
export function aimArm(upperArm, hand, muzzle, aim, weight = 1) {
  if (weight <= 0) return;
  // shoulder: line from the shoulder through the muzzle onto the aim point
  muzzle.getWorldPosition(_c);
  upperArm.getWorldPosition(_a);
  _v1.subVectors(_c, _a).normalize(); _v2.subVectors(aim, _a).normalize();
  const ang = Math.min(TUNING.maxCorrection, _v1.angleTo(_v2));
  if (ang > 1e-4) { _ax.crossVectors(_v1, _v2).normalize(); _q.setFromAxisAngle(_ax, ang * weight * (1 - TUNING.wristShare)); rotateWorld(upperArm, _q); }
  // wrist: barrel direction onto the aim point
  muzzle.getWorldPosition(_c);
  muzzle.getWorldDirection(_v1).negate(); // Object3D.getWorldDirection returns +Z
  _v2.subVectors(aim, _c).normalize();
  const a2 = Math.min(TUNING.maxCorrection, _v1.angleTo(_v2));
  if (a2 > 1e-4) { _ax.crossVectors(_v1, _v2).normalize(); _q.setFromAxisAngle(_ax, a2 * weight); rotateWorld(hand, _q); }
}

const _qa = new THREE.Quaternion(), _qh = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _x = new THREE.Vector3(), _sc = new THREE.Vector3(), _pk = new THREE.Vector3(), _hp = new THREE.Vector3(), _bw = new THREE.Vector3();
/**
 * Shoulders a long gun: places the butt in the right shoulder pocket and points the barrel at `aim`, then solves
 * the right arm so the palm holds the wrist of the stock (the gun is parented to the 'handR' attach point).
 * @param {object} human a Human @param {THREE.Object3D} attach the 'handR' attach object @param {THREE.Vector3} buttLocal butt plate in gun space
 */
export function shoulderGun(human, attach, buttLocal, aim, weight = 1, cant = 0.08) {
  if (weight <= 0) return;
  const up = human.getBone('upperArmR'), low = human.getBone('lowerArmR'), hand = human.getBone('handR'), chest = human.getBone('chest');
  up.updateWorldMatrix(true, true);
  // shoulder pocket: just inside and in front of the shoulder joint
  up.getWorldPosition(_pk); chest.getWorldPosition(_bw);
  _x.subVectors(_pk, _bw).setY(0).normalize(); // body right
  human.object3d.getWorldScale(_sc);
  const s = _sc.x;
  _pk.addScaledVector(_x, -0.06 * s); _pk.y -= 0.03 * s;
  // gun orientation: −Z along the aim, +Y as close to world up as possible (with a slight inward cant)
  _z.subVectors(_pk, aim).normalize(); // +Z points back toward the shooter
  _y.set(0, 1, 0).addScaledVector(_x, -cant); _x.crossVectors(_y, _z).normalize(); _y.crossVectors(_z, _x).normalize();
  _m4.makeBasis(_x, _y, _z); _qa.setFromRotationMatrix(_m4); // gun world rotation
  // gun origin (palm) so that the butt sits in the pocket
  _hp.copy(buttLocal).multiplyScalar(s).applyQuaternion(_qa); _hp.subVectors(_pk, _hp);
  // hand bone world transform from the attach point's local offset
  _qh.copy(_qa).multiply(_q.copy(attach.quaternion).invert());
  _t.copy(attach.position).multiplyScalar(s).applyQuaternion(_qh); _t.subVectors(_hp, _t);
  // elbow out to the right and down
  _pole.copy(_pk).addScaledVector(_x.set(_z.z, 0, -_z.x).normalize(), 0.0).y -= 0.4 * s;
  up.getWorldPosition(_a); _v1.subVectors(_a, chest.getWorldPosition(_b)).setY(0).normalize(); _pole.addScaledVector(_v1, 0.5 * s);
  armIK([up, low, hand], _t, _pole, weight);
  // wrist orientation
  hand.parent.getWorldQuaternion(_qp).invert();
  _qw.copy(_qp).multiply(_qh);
  hand.quaternion.slerp(_qw, weight); hand.updateMatrixWorld(true);
}
