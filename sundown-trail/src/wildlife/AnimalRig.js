import * as THREE from 'three';
import { animalSkeleton, buildAnimalGeometry, ALODS } from './AnimalBody.js';

/**
 * An animal's skeleton, three skinned LOD meshes (geometry cached and shared per species look), invisible hit
 * boxes carrying hitZone ('head' | 'vital' | 'torso' | 'limb'), a Focus vital marker, night eye-shine for
 * predators and a procedural gait animator (Part 10): walk, trot and gallop for quadrupeds (four-beat walk,
 * diagonal trot, rotary gallop), a bounding hop for rabbits, flapping, gliding and folded wings for birds.
 * Poses are continuous functions of a phase, blended by speed, so motion stays smooth at 30 fps (§7).
 */
export const TUNING = {
  lodDistances: [18, 50], cullDistance: 230, hysteresis: 3,
  gaits: {
    walk: { stride: 1.35, duty: 0.66, amp: 0.34, lift: 0.75, bob: 0.012, pitch: 0, phase: { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75 } },
    trot: { stride: 2.1, duty: 0.5, amp: 0.5, lift: 1.0, bob: 0.025, pitch: 0, phase: { RF: 0, LH: 0, LF: 0.5, RH: 0.5 } },
    gallop: { stride: 3.3, duty: 0.4, amp: 0.78, lift: 1.15, bob: 0.05, pitch: 0.11, phase: { LH: 0, RH: 0.1, LF: 0.48, RF: 0.58 } },
    hop: { stride: 4.2, duty: 0.45, amp: 0.85, lift: 1.1, bob: 0, pitch: 0.18, phase: { LF: 0, RF: 0.04, LH: 0.5, RH: 0.54 } },
  },
  flapRate: 4.2, eyeShineSize: 0.05,
};

const _cache = new Map();
function acquire(look) {
  const key = look.key;
  let e = _cache.get(key);
  if (!e) { const geos = ALODS.map((_, i) => buildAnimalGeometry(look, i)); e = { key, geos, refs: 0, tris: geos.map((g) => g.index.count / 3) }; _cache.set(key, e); }
  e.refs++;
  return e;
}
function release(e) { if (--e.refs > 0) return; for (const g of e.geos) g.dispose(); _cache.delete(e.key); }
/** Triangle counts per LOD for a look (builds and caches the geometry). */
export function lookTris(look) { const e = acquire(look); const t = e.tris.slice(); release(e); return t; }

let _shared = null;
function shared() {
  if (_shared) return _shared;
  const hit = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true }); hit.visible = false;
  const vital = new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const shine = new THREE.MeshBasicMaterial({ color: 0xd8ffb0, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  _shared = { hit, vital, shine, box: new THREE.BoxGeometry(1, 1, 1), sphere: new THREE.SphereGeometry(0.5, 10, 8), dot: new THREE.SphereGeometry(0.5, 6, 4) };
  return _shared;
}
export function showAnimalHitboxes(on) { shared().hit.visible = !!on; }

const _e = new THREE.Euler();
const set = (bone, x, y = 0, z = 0) => { if (bone) bone.quaternion.setFromEuler(_e.set(x, y, z)); };
const smooth01 = (t) => t * t * (3 - 2 * t);

export class AnimalRig {
  /** @param {object} look species look { key, shape, colors, ... } @param {THREE.Material} material */
  constructor(look, material) {
    this.look = look; this.shape = look.shape;
    const sk = animalSkeleton(look.shape); this.sk = sk;
    const root = new THREE.Group(); root.name = `Animal:${look.key}`;
    this.object3d = root;
    this.bones = sk.list.map(([n, , o]) => { const b = new THREE.Bone(); b.name = n; b.position.fromArray(o); b.userData.rest = b.position.clone(); return b; });
    this.bones.forEach((b, i) => (sk.parents[i] >= 0 ? this.bones[sk.parents[i]] : root).add(b));
    root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);
    this._geo = acquire(look); this.tris = this._geo.tris;
    const H = look.shape.height, Lh = look.shape.length;
    this.meshes = this._geo.geos.map((g, i) => {
      const m = new THREE.SkinnedMesh(g, material); m.bind(this.skeleton);
      m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H * 0.6, 0), Math.max(H, Lh) * 1.3 + 0.3);
      m.castShadow = i === 0 || (i === 1 && H > 0.6); m.receiveShadow = i === 0; m.visible = i === 0; m.raycast = () => {};
      m.name = `${root.name}:LOD${i}`; root.add(m);
      return m;
    });
    this.lod = 0;
    this._hitboxes();
    this.phase = 0; this.t = Math.random() * 10; this._ear = 0; this._earT = 2;
  }

  bone(n) { return this.bones[this.sk.index[n]] || null; }
  setLOD(i) { if (i === this.lod) return; this.lod = i; this.meshes.forEach((m, k) => { m.visible = k === i; }); }
  updateLOD(d, bias = 1) {
    const D = TUNING.lodDistances.map((x) => x * bias * (this.shape.height < 0.6 ? 0.6 : 1));
    let want = d < D[0] ? 0 : d < D[1] ? 1 : d < TUNING.cullDistance * bias ? 2 : 3;
    if (want > this.lod && d < (D[this.lod] ?? Infinity) + TUNING.hysteresis) want = this.lod;
    this.setLOD(want);
    return this.lod;
  }

  /** Invisible boxes per bone with hit zones; the vital marker sits over the heart and lungs. */
  _hitboxes() {
    const S = shared(), sk = this.sk, J = sk.joints, s = this.shape, add = (boneName, zone, size, center) => {
      const bone = this.bone(boneName); if (!bone) return null;
      const m = new THREE.Mesh(S.box, S.hit); m.scale.fromArray(size);
      const j = J[boneName]; m.position.set(center[0] - j[0], center[1] - j[1], center[2] - j[2]);
      m.userData.hitZone = zone; m.frustumCulled = false; m.name = `hit:${boneName}:${zone}`;
      bone.add(m); this.hitboxes.push(m); return m;
    };
    this.hitboxes = [];
    if (s.bird) {
      const yb = sk.dims.yb;
      add('body', 'torso', [s.width * 2.2, s.depth * 2.2, s.length * 1.05], [0, yb, 0]);
      add('head', 'head', [s.headSize * 2.4, s.headSize * 2.4, s.headSize * 2.6], J.head);
      for (const side of ['R', 'L']) add('wing1' + side, 'limb', [s.wing * 0.9, 0.05, s.chord], [(side === 'R' ? 1 : -1) * (s.width + s.wing * 0.45), yb + s.depth * 0.45, -s.length * 0.1]);
      this.vitalCenter = [0, yb, -s.length * 0.1];
    } else {
      const { yb, bd, hw, zf, zr } = sk.dims, zv = zf + bd * 1.15; // front third of the barrel: heart and lungs
      add('front', 'vital', [hw * 1.9, bd * 1.75, zv - (zf - bd * 0.7)], [0, yb - bd * 0.1, (zv + zf - bd * 0.7) / 2]);
      add('body', 'torso', [hw * 1.95, bd * 1.95, (zr + bd * 0.6) - zv], [0, yb, (zr + bd * 0.6 + zv) / 2]);
      const h = J.head, n1 = J.neck1;
      add('neck1', 'torso', [hw * 1.1, Math.abs(h[1] - n1[1]) + bd * 0.3, Math.abs(h[2] - n1[2]) + bd * 0.4], [0, (h[1] + n1[1]) / 2, (h[2] + n1[2]) / 2]);
      add('head', 'head', [s.headSize * 1.5, s.headSize * 1.6, s.head * 1.25], [0, h[1] - s.headSize * 0.2, h[2] - s.head * 0.4]);
      for (const side of ['R', 'L']) {
        const f = J['fcannon' + side], a = J['forearm' + side], g = J['gaskin' + side], c = J['hcannon' + side], r = Math.max(0.05, hw * 0.55);
        add('forearm' + side, 'limb', [r, a[1] - f[1], r], [a[0], (a[1] + f[1]) / 2, a[2]]);
        add('fcannon' + side, 'limb', [r * 0.8, f[1], r * 0.8], [f[0], f[1] / 2, f[2]]);
        add('gaskin' + side, 'limb', [r * 1.2, g[1] - c[1], r * 1.3], [g[0], (g[1] + c[1]) / 2, (g[2] + c[2]) / 2]);
        add('hcannon' + side, 'limb', [r * 0.8, c[1], r * 0.8], [c[0], c[1] / 2, c[2]]);
      }
      this.vitalCenter = [0, yb - bd * 0.2, zf + bd * 0.35];
    }
    // Focus: a soft glow over the heart and lungs (Hunting turns it on)
    const vb = this.bone(s.bird ? 'body' : 'front'), vj = J[s.bird ? 'body' : 'front'], r = s.bird ? s.width * 1.2 : sk.dims.bd * 0.75;
    this.vital = new THREE.Mesh(S.sphere, S.vital); this.vital.scale.setScalar(r * 2);
    this.vital.position.set(this.vitalCenter[0] - vj[0], this.vitalCenter[1] - vj[1], this.vitalCenter[2] - vj[2]);
    this.vital.visible = false; this.vital.renderOrder = 10; this.vital.raycast = () => {}; this.vital.name = 'vital';
    vb.add(this.vital);
    // eye-shine for predators at night
    this.shine = null;
    if (this.look.eyeShine && !s.bird) {
      const hb = this.bone('head'), hs = s.headSize, ha = (s.headAngle ?? 35) * Math.PI / 180;
      this.shine = new THREE.Group(); this.shine.visible = false;
      for (const side of [-1, 1]) {
        const d = new THREE.Mesh(S.dot, S.shine); d.scale.setScalar(TUNING.eyeShineSize * Math.max(0.6, hs * 4)); d.raycast = () => {};
        d.position.set(side * hs * 0.52, hs * 0.22 - Math.sin(ha) * (s.head * 0.32 - hs * 0.4), -Math.cos(ha) * (s.head * 0.32 - hs * 0.4) - hs * 0.08);
        this.shine.add(d);
      }
      hb.add(this.shine);
    }
  }

  /**
   * Poses the skeleton. @param {number} dt
   * @param {{ speed, gaits: [walkMax, trotMax], hop?, graze?, alert?, lookYaw?, lookPitch?, tailUp?, dead?, flying?, glide?, crouch?, rear? }} p
   */
  animate(dt, p) {
    this.t += dt;
    if (this.shape.bird) return this._bird(dt, p);
    const G = TUNING.gaits, H = this.shape.height, spd = Math.max(0, p.speed || 0);
    // pick the two neighbouring gaits and a blend between them
    let g0, g1, w;
    if (p.hop) { g0 = G.walk; g1 = G.hop; w = smooth01(Math.min(1, spd / 1.2)); }
    else {
      const [walkMax, trotMax] = p.gaits;
      if (spd <= walkMax) { g0 = G.walk; g1 = G.walk; w = 0; }
      else if (spd <= trotMax) { g0 = G.walk; g1 = G.trot; w = smooth01(Math.min(1, (spd - walkMax) / Math.max(0.3, walkMax * 0.6))); }
      else { g0 = G.trot; g1 = G.gallop; w = smooth01(Math.min(1, (spd - trotMax) / Math.max(0.5, trotMax * 0.4))); }
    }
    const stride = (g0.stride + (g1.stride - g0.stride) * w) * H * (this.shape.strideScale ?? 1);
    this.phase = (this.phase + (spd / Math.max(0.05, stride)) * dt) % 1;
    const moving = Math.min(1, spd / 0.25), dead = p.dead || 0;
    const ph = this.phase, sk = this.sk;
    for (const leg of sk.legs) {
      const a0 = this._leg(g0, leg, ph), a1 = g0 === g1 ? a0 : this._leg(g1, leg, ph);
      const k = moving * (1 - dead);
      const sw = (a0[0] + (a1[0] - a0[0]) * w) * k, lf = (a0[1] + (a1[1] - a0[1]) * w) * k;
      const tuck = (p.crouch || 0) * 0.35, rear = leg.front ? (p.rear || 0) : 0;
      const B = this.bones;
      if (leg.front) {
        set(B[leg.top], sw * 0.55 + rear * 0.9 - dead * 0.4);
        set(B[leg.a], sw * 0.45 - tuck * 0.3 + rear * 0.6);
        set(B[leg.b], -lf * 1.15 - tuck - rear * 1.4 + dead * 0.2);
        set(B[leg.c], -lf * 0.55 + Math.max(0, -sw) * 0.25);
      } else {
        set(B[leg.top], sw * 0.7 + tuck * 0.5 + dead * 0.4);
        set(B[leg.a], lf * 0.55 + tuck * 0.8);
        set(B[leg.b], -lf * 0.95 - sw * 0.15 - tuck * 1.2 - dead * 0.3);
        set(B[leg.c], lf * 0.4 + tuck * 0.3);
      }
    }
    // body: bob, pitch over the gallop's arc, a rabbit's leap
    const body = this.bone('body'), rest = body.userData.rest, gp = Math.PI * 2 * ph;
    const bob = (g0.bob + (g1.bob - g0.bob) * w) * H * moving, pitch = (g0.pitch + (g1.pitch - g0.pitch) * w) * moving;
    const leap = p.hop ? Math.max(0, Math.sin(gp)) * H * 0.9 * w * moving : 0;
    body.position.set(rest.x, rest.y - Math.abs(Math.cos(gp * 2)) * bob - (p.crouch || 0) * H * 0.12 + leap + (p.rear || 0) * H * 0.35, rest.z);
    set(body, Math.sin(gp) * pitch - (p.rear || 0) * 0.75, 0, Math.sin(gp) * 0.02 * moving * (this.shape.roll ?? 1));
    // head: graze lowers the neck, alert lifts it and turns toward the threat, plus a nod that counters the bob
    const graze = (p.graze || 0) * (1 - moving), alert = p.alert || 0, nod = Math.cos(gp * 2) * 0.05 * moving;
    const na = (this.shape.neckAngle ?? 50) * Math.PI / 180;
    set(this.bone('neck1'), -graze * (na + 0.55) + alert * 0.18 - moving * 0.12 * w + nod - (p.crouch || 0) * 0.35 - dead * 0.6, (p.lookYaw || 0) * 0.5, 0);
    set(this.bone('neck2'), -graze * 0.25 + alert * 0.12 - nod * 0.5, (p.lookYaw || 0) * 0.3, 0);
    set(this.bone('head'), graze * 0.35 + (p.lookPitch || 0) * 0.5 - alert * 0.1 + dead * 0.3, (p.lookYaw || 0) * 0.2, 0);
    // ears: forward when alert, flat when charging, the odd flick
    if ((this._earT -= dt) <= 0) { this._earT = 1.5 + Math.random() * 4; this._ear = 1; }
    this._ear = Math.max(0, this._ear - dt * 5);
    const flick = Math.sin(this._ear * Math.PI) * 0.4, back = (p.earsBack || 0) * 0.9;
    set(this.bone('earR'), -back + alert * 0.2, 0, -flick); set(this.bone('earL'), -back + alert * 0.2, 0, flick * 0.5);
    // tail: sway, swish while walking, flagged up when fleeing (deer)
    const tUp = p.tailUp || 0, sway = Math.sin(this.t * 2.1) * 0.12 + Math.sin(gp) * 0.15 * moving;
    set(this.bone('tail1'), -tUp * 1.3 + moving * 0.1 * w + dead * 0.5, sway, 0);
    set(this.bone('tail2'), -tUp * 0.3 + 0.1, sway * 0.8, 0);
    set(this.bone('tail3'), 0.1, sway * 0.6, 0);
  }

  /** [swing, lift] for one leg at a gait phase: stance sweeps back, swing lifts and reaches forward. */
  _leg(g, leg, ph) {
    const d = g.duty, p = (ph + (g.phase[leg.id] ?? 0)) % 1;
    if (p < d) { const t = p / d; return [g.amp * (1 - 2 * t), 0]; }
    const t = (p - d) / (1 - d);
    return [g.amp * (-1 + 2 * smooth01(t)), Math.sin(Math.PI * t) * g.lift];
  }

  _bird(dt, p) {
    const fly = p.flying || 0, side = ['R', 'L'];
    const rate = TUNING.flapRate * (this.shape.flapRate ?? 1);
    this.phase = (this.phase + dt * rate * (p.glide ? 0.15 : 1)) % 1;
    const f = Math.sin(this.phase * Math.PI * 2), amp = p.glide ? 0.08 : 0.85;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1, w1 = this.bone('wing1' + side[i]), w2 = this.bone('wing2' + side[i]);
      // folded: wings swept back along the body; flying: flap about the body's long axis
      const fold = 1 - fly;
      set(w1, 0, -s * fold * 1.42, s * (fly * (f * amp + 0.05) - fold * 0.2));
      set(w2, 0, -s * fold * 0.25, s * fly * Math.sin(this.phase * Math.PI * 2 - 0.6) * amp * 0.5);
    }
    const walk = Math.min(1, (p.speed || 0) / 0.3) * (1 - fly), wp = this.t * 7;
    set(this.bone('legR'), Math.sin(wp) * 0.5 * walk + fly * 0.9); set(this.bone('legL'), -Math.sin(wp) * 0.5 * walk + fly * 0.9);
    const peck = (p.graze || 0) * Math.max(0, Math.sin(this.t * 3.1)) ** 4;
    set(this.bone('neck'), peck * 1.1 + Math.sin(wp * 2) * 0.12 * walk - (p.alert || 0) * 0.2, (p.lookYaw || 0) * 0.6, 0);
    set(this.bone('head'), peck * 0.4, (p.lookYaw || 0) * 0.4, 0);
    set(this.bone('tail'), fly * -0.15 + Math.sin(this.t * 1.7) * 0.05, 0, 0);
    const body = this.bone('body');
    set(body, (p.dead || 0) * 0 + fly * (p.pitch || 0), 0, (p.bank || 0) * fly);
  }

  dispose() {
    this.object3d.removeFromParent();
    this.skeleton.dispose(); release(this._geo);
  }
}
