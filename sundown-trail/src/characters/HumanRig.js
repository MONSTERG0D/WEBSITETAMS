import * as THREE from 'three';
import { BONES, B, OFFSET, PARENT, TUNING as BONE_TUNING } from './rig/Bones.js';
import { buildHumanGeometry, LODS, LOD_HERO, LOD_HIGH, LOD_HERO_HIGH } from './rig/BodyParts.js';
import { DETAIL } from '../render/TextureDetail.js';

/**
 * A procedural, skinned, mid-poly human: one THREE.Skeleton (32 bones) shared by three SkinnedMesh LODs,
 * attach points for weapons and props, and invisible hit boxes that carry the entity contract's hitZone.
 * Geometry is cached by look, so identical NPCs share buffers. The animator (HumanAnimator.js) poses the bones.
 */
export const TUNING = {
  lodDistances: [10, 30, 75], cullDistance: 150, lodHysteresis: 1.5, castShadowLods: 2,
  boundsRadius: 1.9,
};

const _cache = new Map();
/** Shared geometries per look (+hero flag): { geos: BufferGeometry[3], refs, tris: number[] } */
function acquire(look, hero) {
  const { height, ...shape } = look; void height;
  const high = DETAIL.mesh === 'high'; // Part 16: denser nearest LOD on the High preset
  const key = (hero ? 'hero|' : '') + (high ? 'high|' : '') + JSON.stringify(shape);
  let entry = _cache.get(key);
  if (!entry) {
    const lods = [hero ? (high ? LOD_HERO_HIGH : LOD_HERO) : (high ? LOD_HIGH : LODS[0]), LODS[1], LODS[2]];
    const geos = lods.map((L) => buildHumanGeometry(look, L));
    entry = { key, geos, refs: 0, tris: geos.map((g) => g.index.count / 3) };
    _cache.set(key, entry);
  }
  entry.refs++;
  return entry;
}
function release(entry) {
  if (--entry.refs > 0) return;
  for (const g of entry.geos) g.dispose();
  _cache.delete(entry.key);
}
/** Number of distinct cached looks (debug readout). */
export const cachedLooks = () => _cache.size;

/** Hit boxes per bone: [bone, zone, shape, size, offset] — shapes share geometry across all humans. */
const HITBOXES = [
  ['head', 'head', 'sphere', [0.115], [0, 0.1, -0.01]],
  ['neck', 'torso', 'box', [0.12, 0.1, 0.12], [0, 0.04, 0]],
  ['chest', 'torso', 'box', [0.38, 0.3, 0.25], [0, 0.07, 0]],
  ['spine', 'torso', 'box', [0.33, 0.2, 0.23], [0, 0.05, 0]],
  ['hips', 'torso', 'box', [0.36, 0.2, 0.25], [0, -0.04, 0]],
  ['upperArmR', 'limb', 'box', [0.12, 0.3, 0.12], [0, -0.14, 0]], ['upperArmL', 'limb', 'box', [0.12, 0.3, 0.12], [0, -0.14, 0]],
  ['lowerArmR', 'limb', 'box', [0.1, 0.34, 0.1], [0, -0.16, 0]], ['lowerArmL', 'limb', 'box', [0.1, 0.34, 0.1], [0, -0.16, 0]],
  ['thighR', 'limb', 'box', [0.17, 0.44, 0.18], [0, -0.21, 0]], ['thighL', 'limb', 'box', [0.17, 0.44, 0.18], [0, -0.21, 0]],
  ['shinR', 'limb', 'box', [0.13, 0.42, 0.14], [0, -0.2, 0]], ['shinL', 'limb', 'box', [0.13, 0.42, 0.14], [0, -0.2, 0]],
];
let _hitShared = null;
function hitShared() {
  if (_hitShared) return _hitShared;
  const mat = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
  mat.visible = false;
  _hitShared = { mat, box: new THREE.BoxGeometry(1, 1, 1), sphere: new THREE.SphereGeometry(1, 8, 6) };
  return _hitShared;
}
/** Shows or hides every human's hit boxes (debug). */
export function showHitboxes(on) { hitShared().mat.visible = !!on; }

/** Attach points: [name, bone, position, rotation (radians)]. Weapon forward is the attach object's −Z. */
const ATTACH = [
  ['handR', 'handR', [-0.006, -0.075, 0.0], [-Math.PI / 2, 0, 0]],
  ['handL', 'handL', [0.006, -0.075, 0.0], [-Math.PI / 2, 0, 0]],
  ['hip', 'hips', [0.215, -0.07, 0.02], [-Math.PI / 2 + 0.12, 0, 0]],
  ['back', 'chest', [0, 0.06, 0.15], [-Math.PI / 2, 0, 0.75]],
  ['head', 'head', [0, 0.2, 0], [0, 0, 0]],
];

export class HumanRig {
  /**
   * @param {object} look resolved look (Outfits.resolveLook)
   * @param {THREE.Material} material the shared human material
   * @param {{hero?: boolean}} opts hero = Eli's higher LOD0 budget
   */
  constructor(look, material, { hero = false } = {}) {
    this.look = look;
    const root = new THREE.Group(); root.name = `Human:${look.role}`;
    this.object3d = root;
    this.bones = BONES.map(([name], i) => { const b = new THREE.Bone(); b.name = name; b.position.fromArray(OFFSET, i * 3); return b; });
    this.bones.forEach((b, i) => (PARENT[i] >= 0 ? this.bones[PARENT[i]] : root).add(b));
    root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);
    this._geo = acquire(look, hero);
    this.meshes = this._geo.geos.map((geo, i) => {
      const m = new THREE.SkinnedMesh(geo, material);
      m.name = `${root.name}:LOD${i}`;
      m.bind(this.skeleton);
      m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), TUNING.boundsRadius);
      m.castShadow = i < TUNING.castShadowLods; m.receiveShadow = i === 0;
      m.raycast = () => {}; // combat hits the hit boxes instead
      m.visible = i === 0;
      root.add(m);
      return m;
    });
    this.lod = 0;
    this.tris = this._geo.tris;
    this.attach = {};
    for (const [name, bone, p, r] of ATTACH) {
      const o = new THREE.Object3D(); o.name = `attach:${name}`;
      o.position.fromArray(p); o.rotation.set(r[0], r[1], r[2]);
      this.bones[B[bone]].add(o); this.attach[name] = o;
    }
    this.hitboxes = [];
    const hs = hitShared();
    for (const [bone, zone, shape, size, off] of HITBOXES) {
      const m = new THREE.Mesh(hs[shape], hs.mat);
      if (shape === 'sphere') m.scale.setScalar(size[0]); else m.scale.fromArray(size);
      m.position.fromArray(off); m.userData.hitZone = zone; m.name = `hit:${bone}`;
      m.castShadow = false; m.frustumCulled = false;
      this.bones[B[bone]].add(m); this.hitboxes.push(m);
    }
    this.bones[B.head].scale.setScalar(BONE_TUNING.headScale); // slightly heroic head size (skinning uses the rest pose bind)
    root.scale.setScalar(look.height || 1);
  }

  bone(name) { return this.bones[B[name]]; }

  /** 0, 1, 2, or 3 = hidden. */
  setLOD(i) {
    if (i === this.lod) return;
    this.lod = i;
    this.meshes.forEach((m, k) => { m.visible = k === i; });
  }

  /** Picks a LOD from camera distance with hysteresis. Returns the LOD. */
  updateLOD(distance, bias = 1) {
    const d = TUNING.lodDistances.map((x) => x * bias), h = TUNING.lodHysteresis;
    let want = distance < d[0] ? 0 : distance < d[1] ? 1 : distance < d[2] ? 2 : distance < TUNING.cullDistance * bias ? 2 : 3;
    if (want > this.lod && distance < (d[this.lod] ?? Infinity) + h) want = this.lod; // stay a little longer when moving away
    this.setLOD(want);
    return this.lod;
  }

  /** Added in Part 13: swaps in the body for a new look (same skeleton, so poses and attachments carry over). */
  setLook(look, hero = false) {
    const next = acquire(look, hero);
    this.meshes.forEach((m, i) => { m.geometry = next.geos[i]; });
    release(this._geo); this._geo = next; this.tris = next.tris; this.look = look;
  }
  dispose() {
    this.object3d.removeFromParent();
    this.skeleton.dispose();
    release(this._geo);
    this.meshes.length = 0;
  }
}
