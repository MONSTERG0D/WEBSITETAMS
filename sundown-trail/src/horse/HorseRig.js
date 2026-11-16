import * as THREE from 'three';
import { HBONES, HB, HOFFSET, HPARENT } from './rig/HorseBones.js';
import { buildHorseGeometry, HLODS, HLOD_HIGH } from './rig/HorseBody.js';
import { DETAIL } from '../render/TextureDetail.js';

/**
 * A procedural horse: one THREE.Skeleton shared by three SkinnedMesh LODs (geometry cached per coat/breed),
 * attach points (saddle seat, bit rings, pelts, saddlebags), invisible hit boxes with hitZone, and reins drawn
 * as a sagging line between the bit and the rider's hands (or looped over the horn when nobody rides).
 */
export const TUNING = { lodDistances: [16, 45, 110], cullDistance: 220, hysteresis: 2, boundsRadius: 2.4, reinSag: 0.12, reinSegments: 8 };

const _cache = new Map();
function acquire(look) {
  const { scale, name, ...shape } = look; void scale; void name;
  const high = DETAIL.mesh === 'high', key = (high ? 'high|' : '') + JSON.stringify(shape); // Part 16
  let e = _cache.get(key);
  if (!e) {
    const geos = (high ? [HLOD_HIGH, HLODS[1], HLODS[2]] : HLODS).map((L) => buildHorseGeometry(look, L));
    e = { key, geos, refs: 0, tris: geos.map((g) => g.index.count / 3) };
    _cache.set(key, e);
  }
  e.refs++;
  return e;
}
function release(e) { if (--e.refs > 0) return; for (const g of e.geos) g.dispose(); _cache.delete(e.key); }

const HITBOXES = [
  ['body', 'torso', [0.62, 0.66, 1.25], [0, 0, 0]], ['front', 'torso', [0.56, 0.6, 0.5], [0, -0.02, -0.18]], ['rear', 'torso', [0.58, 0.6, 0.55], [0, -0.02, 0.2]],
  ['neck2', 'torso', [0.24, 0.32, 0.38], [0, -0.05, 0.05]], ['head', 'head', [0.22, 0.24, 0.5], [0, -0.14, -0.24]],
  ['forearmR', 'limb', [0.14, 0.42, 0.16], [0, -0.2, 0]], ['forearmL', 'limb', [0.14, 0.42, 0.16], [0, -0.2, 0]],
  ['fcannonR', 'limb', [0.1, 0.36, 0.1], [0, -0.17, 0]], ['fcannonL', 'limb', [0.1, 0.36, 0.1], [0, -0.17, 0]],
  ['gaskinR', 'limb', [0.16, 0.42, 0.2], [0, -0.18, 0.12]], ['gaskinL', 'limb', [0.16, 0.42, 0.2], [0, -0.18, 0.12]],
  ['hcannonR', 'limb', [0.1, 0.36, 0.1], [0, -0.16, 0]], ['hcannonL', 'limb', [0.1, 0.36, 0.1], [0, -0.16, 0]],
];
let _hit = null;
const hitShared = () => _hit || (_hit = (() => { const m = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true }); m.visible = false; return { m, box: new THREE.BoxGeometry(1, 1, 1) }; })());
export function showHorseHitboxes(on) { hitShared().m.visible = !!on; }

/** Attach points relative to bones: [name, bone, position]. The seat is where the rider's pelvis rests. */
const ATTACH = [
  ['seat', 'body', [0, 0.36, -0.13]], ['bitR', 'head', [0.08, -0.31, -0.44]], ['bitL', 'head', [-0.08, -0.31, -0.44]],
  ['horn', 'body', [0, 0.48, -0.34]], ['pelts', 'rear', [0, 0.34, -0.2]], ['bagR', 'rear', [0.33, 0.0, -0.25]], ['bagL', 'rear', [-0.33, 0.0, -0.25]],
  ['muzzle', 'head', [0, -0.37, -0.52]], ['mountL', 'body', [-0.75, -1.22, -0.25]], ['mountR', 'body', [0.75, -1.22, -0.25]],
];

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3();

export class HorseRig {
  /** @param {object} look resolveHorse() result @param {THREE.Material} material */
  constructor(look, material) {
    this.look = look;
    const root = new THREE.Group(); root.name = `Horse:${look.name}`;
    this.object3d = root;
    this.bones = HBONES.map(([n], i) => { const b = new THREE.Bone(); b.name = n; b.position.fromArray(HOFFSET, i * 3); return b; });
    this.bones.forEach((b, i) => (HPARENT[i] >= 0 ? this.bones[HPARENT[i]] : root).add(b));
    root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);
    this._geo = acquire(look);
    this.tris = this._geo.tris;
    this.meshes = this._geo.geos.map((g, i) => {
      const m = new THREE.SkinnedMesh(g, material);
      m.bind(this.skeleton);
      m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.1, 0), TUNING.boundsRadius);
      m.castShadow = i < 2; m.receiveShadow = i === 0; m.visible = i === 0; m.raycast = () => {};
      m.name = `${root.name}:LOD${i}`;
      root.add(m);
      return m;
    });
    this.lod = 0;
    this.attach = {};
    for (const [n, bone, p] of ATTACH) { const o = new THREE.Object3D(); o.name = `attach:${n}`; o.position.fromArray(p); this.bones[HB[bone]].add(o); this.attach[n] = o; }
    this.hitboxes = [];
    const hs = hitShared();
    for (const [bone, zone, size, off] of HITBOXES) {
      const m = new THREE.Mesh(hs.box, hs.m); m.scale.fromArray(size); m.position.fromArray(off);
      m.userData.hitZone = zone; m.frustumCulled = false; m.name = `hit:${bone}`;
      this.bones[HB[bone]].add(m); this.hitboxes.push(m);
    }
    root.scale.setScalar(look.scale || 1);
    // reins: one strip bitL → left hand → right hand → bitR (world space)
    const n = TUNING.reinSegments * 2 + 2;
    this.reinPos = new Float32Array(n * 3);
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(this.reinPos, 3));
    this.reins = new THREE.Line(rg, new THREE.LineBasicMaterial({ color: 0x2a1c12 }));
    this.reins.frustumCulled = false; this.reins.name = `${root.name}:reins`;
  }

  bone(n) { return this.bones[HB[n]]; }
  setLOD(i) { if (i === this.lod) return; this.lod = i; this.meshes.forEach((m, k) => { m.visible = k === i; }); this.reins.visible = i < 2; }
  updateLOD(d, bias = 1) {
    const D = TUNING.lodDistances.map((x) => x * bias);
    let want = d < D[0] ? 0 : d < D[1] ? 1 : d < TUNING.cullDistance * bias ? 2 : 3;
    if (want > this.lod && d < (D[this.lod] ?? Infinity) + TUNING.hysteresis) want = this.lod;
    this.setLOD(want);
    return this.lod;
  }

  /** Re-draws the reins. `hands` = [leftWorld, rightWorld] or null (then they loop over the horn). */
  updateReins(hands) {
    const P = this.reinPos, n = TUNING.reinSegments, sag = TUNING.reinSag;
    this.attach.bitL.getWorldPosition(_a); this.attach.bitR.getWorldPosition(_b);
    const hl = hands ? hands[0] : this.attach.horn.getWorldPosition(_p).clone(), hr = hands ? hands[1] : hl;
    let k = 0;
    const seg = (from, to, s) => {
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = from.x + (to.x - from.x) * t, y = from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * s, z = from.z + (to.z - from.z) * t;
        P[k++] = x; P[k++] = y; P[k++] = z;
      }
    };
    seg(_a, hl, sag * (hands ? 1 : 1.6));
    seg(hr, _b, sag * (hands ? 1 : 1.6));
    this.reins.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.object3d.removeFromParent(); this.reins.removeFromParent();
    this.reins.geometry.dispose(); this.reins.material.dispose();
    this.skeleton.dispose(); release(this._geo);
  }
}
