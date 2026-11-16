import * as THREE from 'three';
import { SkinBuilder, loft, ellipsoid } from '../characters/rig/MeshKit.js';
import { HREGIONS as R } from '../horse/rig/HorseTextures.js';

/**
 * Procedural mid-poly animal bodies (Part 10, GAME_BIBLE §7): one skeleton generator for quadrupeds and one for
 * birds, both driven by a species shape (Animals.js SPECIES[*].shape), and a skinned-geometry builder that lofts
 * the barrel, neck, head, legs and tail, adds ears, eyes, antlers, a bear's hump, a rabbit's puff tail, wings and
 * fan tails. Colour is per-vertex (back, flank, belly, face, socks, rump patch); the horse fur atlas adds hair
 * detail and normals. Models face −Z with the origin on the ground under the girth, like the horse.
 * Budgets: big game LOD0/1/2 under 5k/2k/600 triangles; small game and birds under 1.5k/600/200.
 */
export const TUNING = { lods: 3 };

/** LOD settings: ring = barrel/neck segments, legRing = leg segments, rows = rings per metre of body (scaled). */
/** The coarsest level, for rabbits at a distance. */
const TINY = { ring: 4, legRing: 3, head: 4, body: 4, leg: 2, tail: 2, eye: null, antler: 0 };
export const ALODS = [
  { ring: 14, legRing: 8, head: 12, body: 14, leg: 7, tail: 7, eye: [4, 6], antler: 5 },
  { ring: 9, legRing: 5, head: 8, body: 8, leg: 4, tail: 4, eye: null, antler: 4 },
  { ring: 5, legRing: 3, head: 5, body: 5, leg: 3, tail: 3, eye: null, antler: 0 },
];

const v3 = (a) => new THREE.Vector3().fromArray(a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v, a, b) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- skeletons
const LEG_NAMES = [['shoulder', 'forearm', 'fcannon', 'fpastern'], ['thigh', 'gaskin', 'hcannon', 'hpastern']];

/**
 * Builds the rest skeleton for a shape. @returns { list: [[name, parent, offset]], index, joints, legs, bird }
 * joints: model-space rest joint positions by bone name (left side mirrored).
 */
export function animalSkeleton(shape) {
  return shape.bird ? birdSkeleton(shape) : quadSkeleton(shape);
}

function quadSkeleton(s) {
  const H = s.height, L = s.length, hw = s.width, bd = s.depth;
  const yb = H - bd * 1.05, belly = yb - bd, x = hw * 0.55, zf = -L / 2, zr = L / 2;
  const na = (s.neckAngle ?? 50) * Math.PI / 180, nd = [0, Math.sin(na), -Math.cos(na)];
  const n1 = [0, yb + bd * 0.45, zf - bd * 0.35];
  const head = [0, n1[1] + nd[1] * s.neck, n1[2] + nd[2] * s.neck];
  const ta = (s.tailAngle ?? 30) * Math.PI / 180, td = [0, -Math.sin(ta), Math.cos(ta)];
  const t1 = [0, yb + bd * 0.55, zr + bd * 0.55];
  const hock = s.hock ?? 0.42;
  const J = {
    root: [0, 0, 0], body: [0, yb, 0], front: [0, yb + bd * 0.2, zf * 0.9], rear: [0, yb + bd * 0.2, zr * 0.9],
    neck1: n1, neck2: [0, n1[1] + nd[1] * s.neck * 0.5, n1[2] + nd[2] * s.neck * 0.5], head,
    jaw: [0, head[1] - s.headSize * 0.5, head[2] - s.head * 0.3],
    earR: [s.headSize * 0.55, head[1] + s.headSize * 0.75, head[2] + s.headSize * 0.25],
    tail1: t1, tail2: [0, t1[1] + td[1] * s.tail * 0.4, t1[2] + td[2] * s.tail * 0.4], tail3: [0, t1[1] + td[1] * s.tail * 0.75, t1[2] + td[2] * s.tail * 0.75],
    shoulderR: [x, yb + bd * 0.35, zf + bd * 0.15], forearmR: [x, belly + bd * 0.25, zf - bd * 0.05], fcannonR: [x, belly * 0.42, zf - bd * 0.05], fpasternR: [x, belly * 0.1, zf - bd * 0.08],
    thighR: [x, yb + bd * 0.4, zr], gaskinR: [x, belly + bd * 0.35, zr - bd * 0.45], hcannonR: [x, belly * hock, zr + bd * 0.4], hpasternR: [x, belly * 0.1, zr + bd * 0.25],
  };
  const list = [
    ['root', null], ['body', 'root'], ['front', 'body'], ['rear', 'body'],
    ['neck1', 'front'], ['neck2', 'neck1'], ['head', 'neck2'], ['jaw', 'head'], ['earR', 'head'], ['earL', 'head'],
    ['tail1', 'rear'], ['tail2', 'tail1'], ['tail3', 'tail2'],
  ];
  for (const side of ['R', 'L']) {
    const [f, h] = LEG_NAMES;
    list.push([f[0] + side, 'front'], [f[1] + side, f[0] + side], [f[2] + side, f[1] + side], [f[3] + side, f[2] + side]);
    list.push([h[0] + side, 'rear'], [h[1] + side, h[0] + side], [h[2] + side, h[1] + side], [h[3] + side, h[2] + side]);
  }
  const sk = finish(list, J);
  sk.legs = ['R', 'L'].flatMap((side) => [
    { id: side + 'F', side: side === 'R' ? 1 : -1, front: true, top: sk.index['shoulder' + side], a: sk.index['forearm' + side], b: sk.index['fcannon' + side], c: sk.index['fpastern' + side] },
    { id: side + 'H', side: side === 'R' ? 1 : -1, front: false, top: sk.index['thigh' + side], a: sk.index['gaskin' + side], b: sk.index['hcannon' + side], c: sk.index['hpastern' + side] },
  ]);
  sk.dims = { yb, belly, bd, hw, zf, zr, nd, td };
  return sk;
}

function birdSkeleton(s) {
  const H = s.height, L = s.length, yb = H * 0.62;
  const J = {
    root: [0, 0, 0], body: [0, yb, 0], neck: [0, yb + s.depth * 0.6, -L * 0.42], head: [0, yb + s.depth * 0.6 + s.neck, -L * 0.42 - s.neck * 0.35],
    wing1R: [s.width * 0.8, yb + s.depth * 0.45, -L * 0.18], wing2R: [s.width * 0.8 + s.wing * 0.45, yb + s.depth * 0.45, -L * 0.12],
    tail: [0, yb + s.depth * 0.15, L * 0.45], legR: [s.width * 0.4, yb - s.depth * 0.6, 0.02],
  };
  const list = [['root', null], ['body', 'root'], ['neck', 'body'], ['head', 'neck'], ['wing1R', 'body'], ['wing2R', 'wing1R'], ['wing1L', 'body'], ['wing2L', 'wing1L'], ['tail', 'body'], ['legR', 'body'], ['legL', 'body']];
  const sk = finish(list, J);
  sk.legs = [];
  sk.dims = { yb };
  sk.bird = true;
  return sk;
}

function finish(list, J) {
  const joint = (n) => { if (J[n]) return J[n]; const r = J[n.replace(/L$/, 'R')]; return r ? [-r[0], r[1], r[2]] : [0, 0, 0]; };
  const index = Object.fromEntries(list.map(([n], i) => [n, i]));
  const joints = Object.fromEntries(list.map(([n]) => [n, joint(n)]));
  const out = list.map(([n, p]) => { const j = joint(n), pj = p ? joint(p) : [0, 0, 0]; return [n, p, [j[0] - pj[0], j[1] - pj[1], j[2] - pj[2]]]; });
  return { list: out, index, joints, parents: out.map(([, p]) => (p ? index[p] : -1)) };
}

// ---------------------------------------------------------------- colours
function palette(look) {
  const c = (h) => new THREE.Color(h);
  const p = look.colors;
  return {
    back: c(p.back), side: c(p.side), belly: c(p.belly), face: c(p.face || p.side), muzzle: c(p.muzzle || '#2a221c'),
    legs: c(p.legs || p.side), socks: c(p.socks || p.legs || p.side), rump: c(p.rump || p.belly), tail: c(p.tail || p.back), tailUnder: c(p.tailUnder || p.belly),
    ear: c(p.ear || p.back), earIn: c(p.earIn || '#d8b8a0'), hoof: c(p.hoof || '#2a2420'), eye: c('#141010'), antler: c('#c8b48e'), antlerTip: c('#ece2cc'),
    beak: c(p.beak || '#c8a040'), wing: c(p.wing || p.back), wingTip: c(p.wingTip || p.back), head: c(p.head || p.back), wattle: c(p.wattle || '#b02a20'),
  };
}
/** Fur colour over the body: back (top) → flank → belly by the angle around a ring, with gentle noise. */
function furMix(P, a, n) {
  const up = -Math.sin(a); // +1 at the top of a ring built with Z = +y (see loft)
  const t = smooth(up, -0.6, 0.55), b = smooth(-up, 0.35, 0.85);
  const col = P.side.clone().lerp(P.back, t).lerp(P.belly, b);
  return col.multiplyScalar(0.94 + 0.06 * n);
}
const noise = (x, y, z) => Math.sin(x * 37.1 + y * 11.3) * Math.cos(z * 23.7 - x * 7.1) * 0.5 + 0.5;

// ---------------------------------------------------------------- geometry
/**
 * Skinned geometry for one LOD. @param {object} look { shape, colors, antlers?, sex? } @param {number} lod 0..2
 */
export function buildAnimalGeometry(look, lod) {
  // small game and birds use one step coarser detail (Bible: 1.5k / 600 / billboard-class)
  const s = look.shape, small = s.height < 0.5 && !s.bird, sk = animalSkeleton(s), P = palette(look), Q = small ? (ALODS[lod + 1] || TINY) : ALODS[lod], b = new SkinBuilder();
  if (s.bird) buildBird(b, s, sk, P, Q, look);
  else buildQuad(b, s, sk, P, Q, look, lod);
  const g = b.geometry();
  g.computeBoundingSphere();
  return g;
}

function buildQuad(b, s, sk, P, Q, look, lod) {
  const I = sk.index, D = sk.dims, J = sk.joints, { yb, bd, hw, zf, zr } = D;
  const W1 = (n) => [[I[n], 1]];
  // barrel: rings front (chest) → back (rump); Z = +y so rzF is the underside, rzB the topline
  const n = Q.body, rings = [];
  const z0 = zf - bd * 0.75, z1 = zr + bd * 0.7;
  for (let i = 0; i <= n; i++) {
    const t = i / n, z = lerp(z0, z1, t);
    const e = 2 * t - 1, ends = Math.max(0, 1 - Math.abs(e) ** 5) ** 0.5; // full along the barrel, rounded at chest and rump
    const hump = (s.hump || 0) * Math.exp(-((t - 0.22) ** 2) / 0.018); // bear's shoulder hump
    const tuck = (s.tuck ?? 0.18) * smooth(t, 0.45, 0.72) * (1 - smooth(t, 0.82, 0.98)); // waist / flank
    const chest = (s.chest || 0) * Math.exp(-((t - 0.12) ** 2) / 0.01);
    rings.push({ c: [0, yb + hump * bd * 0.35 - tuck * bd * 0.3, z], X: [1, 0, 0], Z: [0, 1, 0], rx: Math.max(0.01, hw * ends * (1 - tuck * 0.35)), rzF: Math.max(0.01, bd * ends * (1 - tuck) + chest * bd * 0.25), rzB: Math.max(0.01, bd * 0.9 * ends + hump * bd * 0.6), t });
  }
  loft(b, {
    rings, segs: Q.ring, capStart: true, capEnd: true,
    region: () => R.coat,
    color: (p, u, v, Rg, a) => {
      let col = furMix(P, a, noise(p[0], p[1], p[2]));
      if (look.rumpPatch) { const k = smooth(Rg.t, 0.82, 0.95) * smooth(-Math.sin(a), -0.2, 0.4); col = col.lerp(P.rump, k * 0.9); }
      if (s.saddleDark) col.lerp(P.back.clone().multiplyScalar(0.7), smooth(-Math.sin(a), 0.7, 0.95) * 0.6);
      return col;
    },
    weights: (p, u, v, Rg) => {
      const t = Rg.t, f = 1 - smooth(t, 0.15, 0.55), r = smooth(t, 0.45, 0.85);
      return [[I.front, f], [I.body, Math.max(0.05, 1 - f - r)], [I.rear, r]];
    },
  });
  // neck: from inside the chest up to the head joint
  const nb = v3(J.neck1).add(new THREE.Vector3(0, -bd * 0.2, bd * 0.35)), nh = v3(J.head), nRings = [];
  const nN = Math.max(2, Math.round(Q.body * 0.45));
  for (let i = 0; i <= nN; i++) {
    const t = i / nN, c = nb.clone().lerp(nh, t), dir = nh.clone().sub(nb).normalize();
    const Z = new THREE.Vector3(0, dir.z, -dir.y); // perpendicular in the YZ plane
    const r0 = lerp(hw * 0.78, s.headSize * 0.62, t ** 0.8) * (s.neckThick ?? 1);
    nRings.push({ c: c.toArray(), X: [1, 0, 0], Z: Z.toArray(), rx: r0 * 0.85, rzF: r0 * (1.0 - t * 0.15) * (1 + (s.mane || 0) * 0.12), rzB: r0 * 0.9, t });
  }
  loft(b, {
    rings: nRings, segs: Q.ring,
    region: () => (s.mane ? R.hair : R.coat),
    color: (p, u, v, Rg, a) => furMix(P, a, noise(p[0], p[1], p[2])).lerp(P.face, Rg.t * 0.25),
    weights: (p, u, v, Rg) => { const t = Rg.t; return t < 0.5 ? [[I.neck1, 1 - t * 1.4], [I.neck2, t * 1.4], [I.front, Math.max(0, 0.4 - t)]] : [[I.neck2, 2 - t * 2], [I.head, t * 2 - 1]]; },
  });
  buildHead(b, s, sk, P, Q, look, lod);
  // legs
  for (const leg of sk.legs) buildLeg(b, s, sk, P, Q, leg);
  // tail
  if (s.tailPuff) {
    const t = J.tail1;
    ellipsoid(b, { center: [t[0], t[1], t[2] + s.tailPuff * 0.4], radii: [s.tailPuff, s.tailPuff * 0.9, s.tailPuff], rows: Math.max(3, Q.tail), cols: Math.max(4, Q.tail + 2), region: () => R.coat, color: () => P.tailUnder, weights: () => W1('tail1') });
  } else if (s.tail > 0.04) {
    const pts = [J.tail1, J.tail2, J.tail3], end = v3(J.tail3).add(v3(J.tail3).sub(v3(J.tail2)).multiplyScalar(0.8));
    const path = [...pts.map(v3), end], tr = [];
    const tN = Q.tail;
    for (let i = 0; i <= tN; i++) {
      const t = i / tN, k = t * 3, seg = Math.min(2, Math.floor(k)), c = path[seg].clone().lerp(path[seg + 1], k - seg);
      const bush = s.tailBush ?? 0.3, r = s.tailR * (1 + bush * Math.sin(Math.PI * Math.min(1, t * 1.15))) * (1 - t * 0.55) + 0.004;
      tr.push({ c: c.toArray(), X: [1, 0, 0], Z: [0, 1, 0], rx: r, rzF: r * 1.05, rzB: r, t });
    }
    loft(b, {
      rings: tr, segs: Math.max(4, Q.legRing), capEnd: true,
      region: () => (s.tailBush ? R.hair : R.coat),
      color: (p, u, v, Rg, a) => { const under = smooth(Math.sin(a), 0.2, 0.8); const c = P.tail.clone().lerp(P.tailUnder, under * (look.flagTail ? 1 : 0.4)); return look.tailTip && Rg.t > 0.8 ? c.lerp(new THREE.Color(look.tailTip), 0.8) : c; },
      weights: (p, u, v, Rg) => { const t = Rg.t * 3; return t < 1 ? [[I.tail1, 1 - t * 0.5], [I.tail2, t * 0.5]] : t < 2 ? [[I.tail2, 1]] : [[I.tail3, 1]]; },
    });
  }
}

function buildHead(b, s, sk, P, Q, look, lod) {
  const I = sk.index, J = sk.joints, D = sk.dims, hs = s.headSize;
  const ha = (s.headAngle ?? 35) * Math.PI / 180; // muzzle points forward and down
  const dir = new THREE.Vector3(0, -Math.sin(ha), -Math.cos(ha)), base = v3(J.head).addScaledVector(dir, -hs * 0.4);
  const Z = new THREE.Vector3(0, dir.z, -dir.y).multiplyScalar(-1);
  const rings = [], n = Q.head;
  for (let i = 0; i <= n; i++) {
    const t = i / n, c = base.clone().addScaledVector(dir, s.head * t);
    const skull = 1 - smooth(t, 0.25, 1) * (1 - (s.snout ?? 0.45)); // taper to the muzzle
    const round = Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.95)) ** 0.25;
    rings.push({ c: c.toArray(), X: [1, 0, 0], Z: Z.toArray(), rx: hs * 0.62 * skull * round, rzF: hs * 0.7 * skull * round * (s.jowl ?? 1), rzB: hs * 0.62 * skull * round, t });
  }
  rings[n].tip = base.clone().addScaledVector(dir, s.head * 1.04).toArray();
  rings[0].tip = base.clone().addScaledVector(dir, -hs * 0.18).toArray();
  loft(b, {
    rings, segs: Q.ring, capStart: true, capEnd: true,
    region: (u, v, Rg) => (Rg.t > 0.88 ? R.muzzle : R.coat),
    color: (p, u, v, Rg, a) => {
      let c = P.face.clone().lerp(P.back, smooth(-Math.sin(a), 0.4, 0.9) * 0.35);
      if (look.mask) c.lerp(P.belly, smooth(Math.sin(a), 0.1, 0.7) * 0.8); // pale cheeks and throat (wolves, coyotes)
      return Rg.t > 0.86 ? c.lerp(P.muzzle, smooth(Rg.t, 0.86, 0.97)) : c;
    },
    weights: (p, u, v, Rg) => (Rg.t < 0.12 ? [[I.head, 0.8], [I.neck2, 0.2]] : [[I.head, 1]]),
  });
  // eyes
  if (Q.eye) for (const side of [-1, 1]) {
    const c = base.clone().addScaledVector(dir, s.head * 0.32); c.x += side * hs * 0.5; c.y += hs * 0.22;
    ellipsoid(b, { center: c.toArray(), radii: [hs * 0.11, hs * 0.12, hs * 0.12], rows: Q.eye[0], cols: Q.eye[1], region: () => R.eye, color: () => P.eye, weights: () => [[I.head, 1]] });
  }
  // ears: flattened cones
  for (const side of [-1, 1]) {
    const e = v3(J[side > 0 ? 'earR' : 'earL']), len = s.ear, w = s.earW ?? len * 0.45;
    const tilt = (s.earTilt ?? 0.35), up = new THREE.Vector3(side * Math.sin(tilt), Math.cos(tilt), 0.25).normalize();
    const er = [];
    for (let i = 0; i <= 3; i++) { const t = i / 3; er.push({ c: e.clone().addScaledVector(up, len * t).toArray(), X: [1, 0, 0], Z: [0, 0, 1], rx: w * (1 - t) ** 0.9 * (s.roundEar ? 1.1 : 1) + 0.002, rzF: w * 0.35 * (1 - t) + 0.002, rzB: w * 0.25 * (1 - t) + 0.002, t }); }
    er[3].tip = e.clone().addScaledVector(up, len * 1.05).toArray();
    loft(b, { rings: er, segs: Math.max(4, Q.legRing), capEnd: true, region: () => R.coat, color: (p, u, v, Rg, a) => (Math.sin(a) > 0.3 ? P.earIn : P.ear).clone().lerp(look.earTip ? new THREE.Color(look.earTip) : P.ear, Rg.t > 0.7 ? 0.7 : 0), weights: () => [[I[side > 0 ? 'earR' : 'earL'], 1]] });
  }
  if (look.antlers && Q.antler) buildAntlers(b, s, sk, P, Q, look.antlers);
}

/** Antlers: a curving main beam per side with tines rising from it (deer: 3–4 points, elk: 5–6). */
function buildAntlers(b, s, sk, P, Q, kind) {
  const I = sk.index, J = sk.joints, hs = s.headSize, elk = kind === 'elk';
  const beamLen = elk ? 1.05 : 0.48, tines = elk ? 5 : 3, r0 = elk ? 0.034 : 0.018;
  for (const side of [-1, 1]) {
    const start = v3(J.head).add(new THREE.Vector3(side * hs * 0.32, hs * 0.55, hs * 0.05));
    const beam = (t) => new THREE.Vector3(side * (Math.sin(t * 1.6) * beamLen * 0.42 + t * 0.06), t * beamLen * 0.62, t * beamLen * (elk ? 0.55 : 0.25) - Math.sin(t * Math.PI) * beamLen * (elk ? 0.05 : 0.32)).add(start);
    tube(b, Array.from({ length: Q.antler + 1 }, (_, i) => beam(i / Q.antler)), (t) => r0 * (1 - t * 0.7), Math.max(4, Q.legRing - 2), P, I.head);
    for (let k = 0; k < tines; k++) {
      const t = 0.18 + k * (0.75 / tines), p0 = beam(t), len = beamLen * (elk ? 0.4 : 0.42) * (1 - k * 0.12);
      const d = new THREE.Vector3(side * 0.1, 1, elk ? -0.45 : -0.15 + k * 0.1).normalize();
      tube(b, [p0, p0.clone().addScaledVector(d, len * 0.55).add(new THREE.Vector3(0, 0, -len * 0.08)), p0.clone().addScaledVector(d, len)], (q) => r0 * 0.75 * (1 - q * 0.8), 4, P, I.head);
    }
  }
}
function tube(b, pts, radius, segs, P, bone) {
  const rings = pts.map((c, i) => ({ c: c.toArray(), X: [1, 0, 0], Z: [0, 0, 1], rx: radius(i / (pts.length - 1)) + 0.002, rzF: radius(i / (pts.length - 1)) + 0.002, rzB: radius(i / (pts.length - 1)) + 0.002, t: i / (pts.length - 1) }));
  rings[rings.length - 1].tip = pts[pts.length - 1].toArray();
  loft(b, { rings, segs, capEnd: true, region: () => R.hoof, color: (p, u, v, Rg) => P.antler.clone().lerp(P.antlerTip, Rg.t ** 2), weights: () => [[bone, 1]] });
}

function buildLeg(b, s, sk, P, Q, leg) {
  const I = sk.index, J = sk.joints, D = sk.dims, names = sk.list;
  const nm = (i) => names[i][0];
  const top = v3(J[nm(leg.top)]), a = v3(J[nm(leg.a)]), bb = v3(J[nm(leg.b)]), c = v3(J[nm(leg.c)]);
  const foot = c.clone().setY(0);
  // upper limb sits inside the body: start the loft a little below the joint
  const pts = [top.clone().add(new THREE.Vector3(0, -D.bd * 0.15, 0)), a, bb, c, foot];
  const thick = leg.front ? (s.legF ?? 1) : (s.legH ?? 1.15);
  const R0 = s.width * 0.42 * thick, Rl = (s.legR ?? 0.028) * thick;
  const radii = [R0, R0 * 0.62, Rl * 1.25, Rl, Rl * (s.paw ?? 1.15)];
  const per = Q.leg, rings = [], bones = [leg.top, leg.a, leg.b, leg.c, leg.c];
  for (let k = 0; k < 4; k++) for (let i = 0; i < (k === 3 ? per + 1 : per); i++) {
    const t = i / per, cc = pts[k].clone().lerp(pts[k + 1], t), r = lerp(radii[k], radii[k + 1], t);
    rings.push({ c: cc.toArray(), X: [1, 0, 0], Z: [0, 0, 1], rx: r * (k < 1 ? 0.75 : 1), rzF: r * (k < 2 ? 1.25 : 1.05), rzB: r * (k < 2 ? 1.1 : 1), k, t, y: cc.y });
  }
  rings[rings.length - 1].tip = foot.toArray();
  const hoofH = s.hoofH ?? 0.05, sockH = s.socks ?? 0;
  loft(b, {
    rings, segs: Q.legRing, capEnd: true,
    region: (u, v, Rg) => (Rg.y < hoofH ? R.hoof : R.coat),
    color: (p, u, v, Rg, a) => {
      if (Rg.y < hoofH) return P.hoof;
      if (Rg.y < sockH) return P.socks;
      return Rg.k < 1 ? furMix(P, a, 0.5) : P.legs.clone().lerp(P.socks, smooth(sockH ? sockH * 2 - Rg.y : 0, 0, sockH || 1) * 0.5);
    },
    weights: (p, u, v, Rg) => {
      const k = Rg.k, t = Rg.t, i0 = bones[k], i1 = bones[Math.min(4, k + 1)];
      if (k === 0) return [[leg.front ? I.front : I.rear, 1 - smooth(t, 0, 0.35)], [i0, smooth(t, 0, 0.35) * (1 - smooth(t, 0.75, 1) * 0.5)], [i1, smooth(t, 0.75, 1) * 0.5]];
      return [[i0, 1 - smooth(t, 0.8, 1) * 0.5], [i1, smooth(t, 0.8, 1) * 0.5]];
    },
  });
}

// ---------------------------------------------------------------- birds
function buildBird(b, s, sk, P, Q, look) {
  const I = sk.index, J = sk.joints, yb = sk.dims.yb, L = s.length, dep = s.depth, w = s.width;
  const rows = Math.max(4, Q.body - 4), cols = Math.max(6, Q.ring);
  ellipsoid(b, { center: [0, yb, 0], radii: [w, dep, L * 0.5], rows, cols, region: () => R.coat, color: (p, d) => P.back.clone().lerp(P.belly, smooth(-d[1], 0.1, 0.8)), weights: (p, d) => (d[2] < -0.5 ? [[I.body, 0.7], [I.neck, 0.3]] : [[I.body, 1]]) });
  const hr = s.headSize;
  ellipsoid(b, { center: J.head, radii: [hr * 0.85, hr, hr * 1.05], rows: Math.max(3, rows - 1), cols, region: () => R.coat, color: () => P.head, weights: () => [[I.head, 1]] });
  // neck bridge
  ellipsoid(b, { center: [0, (yb + J.head[1]) / 2, (J.neck[2] + J.head[2]) / 2], radii: [hr * 0.7, Math.abs(J.head[1] - yb) * 0.55 + 0.01, hr * 0.8], rows: 3, cols, region: () => R.coat, color: () => P.head.clone().lerp(P.back, 0.5), weights: () => [[I.neck, 0.6], [I.head, 0.4]] });
  // beak: a cone forward
  const bk = [{ c: [0, J.head[1] - hr * 0.1, J.head[2] - hr * 0.8], X: [1, 0, 0], Z: [0, 1, 0], rx: hr * 0.32, rzF: hr * 0.3, rzB: hr * 0.3 }, { c: [0, J.head[1] - hr * (s.hook ? 0.35 : 0.2), J.head[2] - hr * 0.8 - s.beak], X: [1, 0, 0], Z: [0, 1, 0], rx: 0.003, rzF: 0.003, rzB: 0.003 }];
  bk[1].tip = bk[1].c;
  loft(b, { rings: bk, segs: Math.max(4, Q.legRing), capEnd: true, region: () => R.hoof, color: () => P.beak, weights: () => [[I.head, 1]] });
  if (Q.eye) for (const side of [-1, 1]) ellipsoid(b, { center: [side * hr * 0.62, J.head[1] + hr * 0.2, J.head[2] - hr * 0.35], radii: [hr * 0.2, hr * 0.2, hr * 0.2], rows: 3, cols: 5, region: () => R.eye, color: () => P.eye, weights: () => [[I.head, 1]] });
  if (look.wattle) ellipsoid(b, { center: [0, J.head[1] - hr * 0.9, J.head[2] - hr * 0.5], radii: [hr * 0.25, hr * 0.6, hr * 0.25], rows: 3, cols: 5, region: () => R.plain, color: () => P.wattle, weights: () => [[I.head, 1]] });
  // wings: flat tapered panels from the shoulder outward (+x), feathers darken toward the tips
  for (const side of [-1, 1]) {
    const sh = J[side > 0 ? 'wing1R' : 'wing1L'], span = s.wing, chord = s.chord, wr = [], n = Math.max(3, Q.tail + 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = sh[0] + side * span * t;
      wr.push({ c: [x, sh[1] + Math.sin(t * Math.PI) * 0.02, sh[2] + chord * 0.35 + t * chord * 0.15], X: [0, 0, 1], Z: [0, 1, 0], rx: chord * (1 - t * 0.55) * 0.5 + 0.01, rzF: 0.012, rzB: 0.018, t });
    }
    loft(b, {
      rings: wr, segs: 6, capEnd: true,
      region: () => R.coat, color: (p, u, v, Rg) => P.wing.clone().lerp(P.wingTip, smooth(Rg.t, 0.5, 1)),
      weights: (p, u, v, Rg) => [[I[side > 0 ? 'wing1R' : 'wing1L'], 1 - smooth(Rg.t, 0.35, 0.6)], [I[side > 0 ? 'wing2R' : 'wing2L'], smooth(Rg.t, 0.35, 0.6)]],
    });
  }
  // tail: a flat fan (turkeys spread it wide)
  const tj = J.tail, fan = s.fan ?? 0.35, tl = s.tailLen ?? L * 0.45, tr = [];
  for (let i = 0; i <= 2; i++) { const t = i / 2; tr.push({ c: [0, tj[1] + t * tl * (s.fanUp ?? 0.1), tj[2] + t * tl], X: [1, 0, 0], Z: [0, 1, 0], rx: w * 0.4 + t * fan, rzF: 0.012, rzB: 0.015, t }); }
  loft(b, { rings: tr, segs: 6, region: () => R.hair, color: (p, u, v, Rg) => P.tail.clone().lerp(P.wingTip, Rg.t * 0.5), weights: () => [[I.tail, 1]] });
  // legs
  for (const side of [-1, 1]) {
    const lj = J[side > 0 ? 'legR' : 'legL'], lr = [{ c: lj, X: [1, 0, 0], Z: [0, 0, 1], rx: s.legR * 1.6, rzF: s.legR * 1.6, rzB: s.legR * 1.6 }, { c: [lj[0], 0.02, lj[2] - 0.01], X: [1, 0, 0], Z: [0, 0, 1], rx: s.legR, rzF: s.legR, rzB: s.legR }];
    loft(b, { rings: lr, segs: 4, region: () => R.hoof, color: () => P.beak.clone().multiplyScalar(0.7), weights: () => [[I[side > 0 ? 'legR' : 'legL'], 1]] });
  }
}
