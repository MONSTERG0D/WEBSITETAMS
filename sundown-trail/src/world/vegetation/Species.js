import * as THREE from 'three';
import { uvRect } from './Textures.js';

/**
 * Mid-poly plant and rock generators (GAME_BIBLE §6 budgets: tree 2.5k tris at LOD0, 900 at LOD1, impostor beyond).
 * Every geometry carries position, normal, uv (into the vegetation atlas) and aSway (0 = rigid … 1 = tips that move most).
 * Foliage cards use normals pointing out from the crown centre, so canopies shade as soft volumes instead of flat planes.
 */

/** Small builder: append quads and tubes, then build one indexed BufferGeometry. */
class Builder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.s = []; this.i = []; }
  get count() { return this.p.length / 3; }
  vert(x, y, z, nx, ny, nz, u, v, sway) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.s.push(sway); return this.count - 1; }
  /** A quad from four corners (a b c d counter-clockwise), uv rect [u0,v0,u1,v1], one shared normal per corner via normalFn. */
  quad(a, b, c, d, rect, sway, normalFn) {
    const [u0, v0, u1, v1] = rect, corners = [[a, u0, v0], [b, u1, v0], [c, u1, v1], [d, u0, v1]], base = this.count;
    for (const [q, u, v] of corners) { const nn = normalFn(q); this.vert(q.x, q.y, q.z, nn.x, nn.y, nn.z, u, v, sway(q)); }
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /**
   * A tapered tube through points [{x,y,z,r}] with `segs` sides; u wraps the bark region, v runs along the length.
   * capTop closes the end (cactus tops).
   */
  tube(pts, segs, rect, sway, vRepeat = 1, capTop = false) {
    const [u0, v0, u1, v1] = rect, base = this.count, rings = pts.length;
    let len = 0; const lens = [0];
    for (let k = 1; k < rings; k++) { len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y, pts[k].z - pts[k - 1].z); lens.push(len); }
    const t = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(), ref = new THREE.Vector3(1, 0, 0);
    for (let k = 0; k < rings; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(rings - 1, k + 1)];
      t.set(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
      side.crossVectors(t, Math.abs(t.x) > 0.9 ? up.set(0, 0, 1) : ref).normalize(); up.crossVectors(side, t).normalize();
      const v = v0 + (v1 - v0) * Math.min(1, (lens[k] / Math.max(len, 1e-3)) * vRepeat * 0.5); // the strip is long: no wrap seam
      for (let s = 0; s <= segs; s++) {
        const ang = (s / segs) * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang);
        const nx = side.x * cs + up.x * sn, ny = side.y * cs + up.y * sn, nz = side.z * cs + up.z * sn, p = pts[k];
        const q = { x: p.x + nx * p.r, y: p.y + ny * p.r, z: p.z + nz * p.r };
        this.vert(q.x, q.y, q.z, nx, ny, nz, u0 + (u1 - u0) * (s / segs), v, sway(q));
      }
    }
    for (let k = 0; k < rings - 1; k++) for (let s = 0; s < segs; s++) {
      const a = base + k * (segs + 1) + s, b = a + segs + 1;
      this.i.push(a, b, a + 1, a + 1, b, b + 1);
    }
    if (capTop) {
      const p = pts[rings - 1], c = this.vert(p.x, p.y + p.r * 0.6, p.z, 0, 1, 0, (u0 + u1) / 2, v1, sway(p)), ring = base + (rings - 1) * (segs + 1);
      for (let s = 0; s < segs; s++) this.i.push(ring + s, c, ring + s + 1);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.s, 1));
    g.setIndex(this.i); g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _n = new THREE.Vector3();
/** A foliage card centred at c, facing direction `face` (horizontal yaw) with tilt, size w × h; normals point away from `crown`. */
function card(B, c, w, h, yaw, tilt, rect, sway, crown, roll = 0) {
  const right = V(Math.cos(yaw), 0, -Math.sin(yaw)), up = V(0, 1, 0).applyAxisAngle(right, tilt);
  if (roll) { right.applyAxisAngle(up.clone().cross(right).normalize(), roll); }
  const hw = w / 2, hh = h / 2;
  const a = c.clone().addScaledVector(right, -hw).addScaledVector(up, -hh), b = c.clone().addScaledVector(right, hw).addScaledVector(up, -hh);
  const cc = c.clone().addScaledVector(right, hw).addScaledVector(up, hh), d = c.clone().addScaledVector(right, -hw).addScaledVector(up, hh);
  const nf = crown ? (q) => _n.set(q.x - crown.x, (q.y - crown.y) * 0.7 + 0.35, q.z - crown.z).normalize() : () => _n.copy(up).cross(right).normalize();
  B.quad(a, b, cc, d, rect, sway, nf);
}

const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; };
const swayH = (H, start = 0.15) => (q) => Math.max(0, (q.y / H - start) / (1 - start)) ** 1.5;

// ------------------------------------------------------------------ trees
function pine(seed, lod) {
  const R = rng(seed), B = new Builder(), H = 15 + R() * 4, r0 = 0.32 + R() * 0.1, crownR = 3.2 + R() * 1.2, sway = swayH(H, 0.2);
  const lean = (R() - 0.5) * 0.4, pts = [];
  for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push({ x: lean * t * t, y: t * H, z: 0, r: r0 * (1 - t * 0.9) + 0.03 }); }
  B.tube(pts, lod ? 5 : 8, uvRect('barkPine'), sway, 2);
  const levels = lod ? 6 : 11, perLevel = lod ? 4 : 6, rect = uvRect('pine'), crownBase = 0.22 + R() * 0.08;
  for (let L = 0; L < levels; L++) {
    const t = crownBase + (1 - crownBase) * (L / levels), y = t * H, reach = crownR * (1 - (t - crownBase) / (1 - crownBase)) * (0.85 + R() * 0.3) + 0.6;
    for (let k = 0; k < perLevel; k++) {
      const yaw = (k / perLevel) * Math.PI * 2 + L * 0.9 + R() * 0.5, dir = V(Math.cos(yaw), 0, -Math.sin(yaw));
      const c = V(lean * t * t, y - reach * 0.12, 0).addScaledVector(dir, reach * 0.5);
      const crown = V(lean * t * t, y + 0.5, 0);
      // the card lies along the branch, drooping, rolled so it reads from the side and from below
      card(B, c, reach * 0.75, reach * 1.05, yaw + Math.PI / 2, -1.15 + R() * 0.2, rect, sway, crown, (R() - 0.5) * 0.8);
      if (!lod && k % 2 === 0) card(B, c.clone().add(V(0, 0.3, 0)), reach * 0.55, reach * 0.8, yaw, 0.2, rect, sway, crown);
    }
  }
  card(B, V(lean, H + 0.4, 0), 1.2, 2.2, R() * 3, 0, rect, sway, V(lean, H - 0.5, 0));
  card(B, V(lean, H + 0.4, 0), 1.2, 2.2, R() * 3 + Math.PI / 2, 0, rect, sway, V(lean, H - 0.5, 0));
  return { geo: B.build(), height: H, radius: crownR + 0.8, trunk: r0 };
}

function broadleaf(seed, lod, kind) {
  const R = rng(seed), B = new Builder(), aspen = kind === 'aspen';
  const H = aspen ? 10 + R() * 4 : 8 + R() * 4, r0 = aspen ? 0.16 + R() * 0.05 : 0.38 + R() * 0.14, sway = swayH(H, aspen ? 0.3 : 0.25);
  const barkRect = uvRect(aspen ? 'barkAspen' : 'barkOak'), split = aspen ? 0.55 : 0.32 + R() * 0.1;
  const trunk = [];
  for (let k = 0; k <= 4; k++) { const t = (k / 4) * (aspen ? 0.95 : split + 0.05); trunk.push({ x: (R() - 0.5) * 0.15 * k, y: t * H, z: (R() - 0.5) * 0.15 * k, r: r0 * (1 - t * (aspen ? 0.85 : 0.5)) }); }
  B.tube(trunk, lod ? 5 : 8, barkRect, sway, aspen ? 2 : 1);
  const crown = V(trunk[4].x, H * (aspen ? 0.72 : 0.68), trunk[4].z), crownR = aspen ? 2.2 + R() * 0.6 : 3.8 + R() * 1.4, crownH = aspen ? 3.6 + R() : 2.6 + R() * 0.8;
  if (!aspen) { // main limbs
    const limbs = lod ? 3 : 5;
    for (let b = 0; b < limbs; b++) {
      const a = (b / limbs) * Math.PI * 2 + R(), top = trunk[4];
      const end = { x: crown.x + Math.cos(a) * crownR * 0.75, y: crown.y + (R() - 0.2) * crownH * 0.6, z: crown.z + Math.sin(a) * crownR * 0.75, r: 0.06 };
      const mid = { x: (top.x + end.x) / 2, y: (top.y + end.y) / 2 + 0.6, z: (top.z + end.z) / 2, r: r0 * 0.35 };
      B.tube([{ ...top, r: r0 * 0.55 }, mid, end], lod ? 4 : 5, barkRect, sway);
    }
  }
  const cards = lod ? (aspen ? 14 : 22) : (aspen ? 44 : 70), rects = aspen ? [uvRect('aspen')] : [uvRect('oak'), uvRect('oakDark')];
  for (let k = 0; k < cards; k++) {
    // points spread through an ellipsoid crown, denser near the shell
    const u = R() * 2 - 1, a = R() * Math.PI * 2, rr = 0.55 + 0.45 * Math.sqrt(R()), s = Math.sqrt(1 - u * u);
    const c = V(crown.x + Math.cos(a) * s * crownR * rr, crown.y + u * crownH * rr, crown.z + Math.sin(a) * s * crownR * rr);
    const size = (aspen ? 1.8 : 2.9) * (lod ? 1.45 : 1) * (0.8 + R() * 0.4);
    card(B, c, size, size, R() * Math.PI, (R() - 0.5) * 1.2, rects[k % rects.length], sway, crown);
  }
  return { geo: B.build(), height: H, radius: crownR + 0.5, trunk: r0 };
}

function deadTree(seed, lod) {
  const R = rng(seed), B = new Builder(), H = 6 + R() * 4, r0 = 0.25 + R() * 0.1, sway = swayH(H, 0.4), rect = uvRect('deadBark');
  const pts = []; for (let k = 0; k <= 4; k++) { const t = k / 4; pts.push({ x: Math.sin(t * 2 + seed) * 0.3 * t, y: t * H, z: 0, r: r0 * (1 - t * 0.85) }); }
  B.tube(pts, lod ? 4 : 6, rect, sway);
  const limbs = lod ? 3 : 6;
  for (let b = 0; b < limbs; b++) {
    const t = 0.35 + R() * 0.55, base = pts[Math.min(4, Math.round(t * 4))], a = R() * Math.PI * 2, l = (1.5 + R() * 2.5) * (1.2 - t);
    const end = { x: base.x + Math.cos(a) * l, y: t * H + l * (0.4 + R() * 0.6), z: Math.sin(a) * l, r: 0.03 };
    B.tube([{ x: base.x, y: t * H, z: 0, r: r0 * 0.3 * (1.2 - t) }, end], 4, rect, sway);
    if (!lod) card(B, V(end.x, end.y + 0.4, end.z), 1.6, 1.6, a + Math.PI / 2, 0, uvRect('twigs'), sway, null);
  }
  return { geo: B.build(), height: H, radius: 2.5, trunk: r0 };
}

// ------------------------------------------------------------------ shrubs, cacti, reeds, tufts
function crossed(seed, lod, region, minH, maxH, widthK, count, bend = 0.15) {
  const R = rng(seed), B = new Builder(), H = minH + R() * (maxH - minH), sway = (q) => Math.max(0, q.y / H) ** 1.2;
  const n = lod ? Math.max(2, Math.ceil(count / 2)) : count, rect = uvRect(region), crown = V(0, H * 0.25, 0);
  for (let k = 0; k < n; k++) {
    const yaw = (k / n) * Math.PI + R() * 0.3, off = V((R() - 0.5) * H * 0.3, 0, (R() - 0.5) * H * 0.3);
    card(B, V(off.x, H / 2, off.z), H * widthK * (0.8 + R() * 0.4), H, yaw, (R() - 0.5) * bend, rect, sway, crown);
  }
  return { geo: B.build(), height: H, radius: H * widthK * 0.6, trunk: 0 };
}

function sagebrush(seed, lod) {
  const R = rng(seed), B = new Builder(), H = 0.7 + R() * 0.6, W = H * (1.4 + R() * 0.5), sway = (q) => Math.max(0, q.y / H) ** 1.3, rect = uvRect('sage');
  const crown = V(0, H * 0.2, 0), n = lod ? 4 : 10;
  for (let k = 0; k < n; k++) {
    const a = R() * Math.PI * 2, d = R() * W * 0.3, c = V(Math.cos(a) * d, H * (0.35 + R() * 0.3), Math.sin(a) * d);
    card(B, c, W * (0.6 + R() * 0.3), H * (0.7 + R() * 0.3), R() * Math.PI, (R() - 0.5) * 0.9, rect, sway, crown);
  }
  return { geo: B.build(), height: H, radius: W / 2, trunk: 0 };
}

function saguaro(seed, lod) {
  const R = rng(seed), B = new Builder(), H = 4 + R() * 4, r = 0.28 + R() * 0.08, rect = uvRect('cactus'), sway = () => 0, segs = lod ? 6 : 10;
  const main = []; for (let k = 0; k <= 6; k++) { const t = k / 6; main.push({ x: 0, y: t * H, z: 0, r: r * (1 - Math.pow(t, 6) * 0.35) }); }
  B.tube(main, segs, rect, sway, 1, true);
  const arms = Math.floor(R() * 3.2);
  for (let a = 0; a < arms; a++) {
    const ang = R() * Math.PI * 2, y0 = H * (0.35 + R() * 0.3), out = 0.6 + R() * 0.5, up = 1 + R() * (H - y0 - 0.8) * 0.6, ar = r * 0.7;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    B.tube([{ x: 0, y: y0, z: 0, r: ar }, { x: dx * out * 0.6, y: y0 + 0.05, z: dz * out * 0.6, r: ar }, { x: dx * out, y: y0 + 0.4, z: dz * out, r: ar },
      { x: dx * out, y: y0 + up, z: dz * out, r: ar * 0.95 }], lod ? 5 : 8, rect, sway, 0.5, true);
  }
  return { geo: B.build(), height: H, radius: 1.2, trunk: r };
}

function pricklyPear(seed, lod) {
  const R = rng(seed), B = new Builder(), rect = uvRect('pad'), n = lod ? 4 : 9, sway = () => 0;
  let maxY = 0;
  const place = (c, depth) => {
    if (B.count / 4 >= n) return;
    const s = 0.32 + R() * 0.12, yaw = R() * Math.PI, tilt = (R() - 0.5) * 0.6;
    card(B, c, s, s * 1.25, yaw, tilt, rect, sway, null);
    maxY = Math.max(maxY, c.y + s * 0.6);
    if (depth > 0) for (let k = 0; k < 2; k++) place(V(c.x + (R() - 0.5) * 0.35, c.y + s * 0.55, c.z + (R() - 0.5) * 0.35), depth - 1);
  };
  place(V(0, 0.2, 0), 3); place(V(0.3, 0.18, 0.1), 2);
  return { geo: B.build(), height: maxY, radius: 0.6, trunk: 0 };
}

// ------------------------------------------------------------------ rocks
function rock(seed, lod, shape) {
  const R = rng(seed);
  const base = new THREE.IcosahedronGeometry(1, lod ? 1 : 2);
  const pos = base.getAttribute('position'), v = new THREE.Vector3();
  const sx = [1.2, 1.4, 1.8, 0.7, 1.1][shape], sy = [0.8, 0.55, 0.35, 1.6, 0.7][shape], sz = [1.0, 1.1, 1.3, 0.75, 1.0][shape];
  const k1 = R() * 10, k2 = R() * 10;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = 1 + 0.18 * Math.sin(v.x * 3.1 + k1) * Math.cos(v.z * 2.7 + k2) + 0.1 * Math.sin(v.y * 5.3 + k1 * 2) + (R() - 0.5) * 0.06;
    v.multiplyScalar(n); v.x *= sx; v.y *= sy; v.z *= sz;
    if (v.y < -0.15 * sy) v.y = -0.15 * sy - (v.y + 0.15 * sy) * 0.15; // flat-ish bottom sits in the ground
    pos.setXYZ(i, v.x, v.y + 0.12 * sy, v.z);
  }
  const geo = base.toNonIndexed(); geo.computeVertexNormals();
  // box-projected UVs into the rock region, no sway
  const p = geo.getAttribute('position'), nrm = geo.getAttribute('normal'), uv = new Float32Array(p.count * 2), [u0, v0, u1, v1] = uvRect('rock');
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i));
    let a, b; if (ay > 0.6) { a = p.getX(i); b = p.getZ(i); } else if (ax > 0.6) { a = p.getZ(i); b = p.getY(i); } else { a = p.getX(i); b = p.getY(i); }
    const fa = ((a * 0.35) % 1 + 1) % 1, fb = ((b * 0.35) % 1 + 1) % 1;
    uv[i * 2] = u0 + (u1 - u0) * fa; uv[i * 2 + 1] = v0 + (v1 - v0) * fb;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(p.count), 1));
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  base.dispose();
  return { geo, height: sy * 1.1, radius: Math.max(sx, sz), trunk: 0 };
}

/**
 * Species table. lod: [LOD0 max distance, LOD1 max distance]; beyond LOD1 trees switch to impostors, the rest disappear.
 * size: [min, max] instance scale. tint: [[r,g,b] min, [r,g,b] max] per-instance colour multiplier.
 * collider: 'trunk' (cylinder of trunk radius) or 'rock' (cylinder of the rock footprint) or null.
 */
export const SPECIES = [
  { id: 'pine1', make: (l) => pine(11, l), lod: [70, 200], impostor: true, size: [0.8, 1.25], tint: [[0.85, 0.9, 0.85], [1.05, 1.05, 1]], collider: 'trunk', shadow: true },
  { id: 'pine2', make: (l) => pine(23, l), lod: [70, 200], impostor: true, size: [0.7, 1.15], tint: [[0.8, 0.88, 0.8], [1, 1, 1]], collider: 'trunk', shadow: true },
  { id: 'pine3', make: (l) => pine(37, l), lod: [70, 200], impostor: true, size: [0.9, 1.35], tint: [[0.85, 0.9, 0.85], [1.05, 1.05, 1]], collider: 'trunk', shadow: true },
  { id: 'oak1', make: (l) => broadleaf(41, l, 'oak'), lod: [70, 200], impostor: true, size: [0.85, 1.3], tint: [[0.85, 0.85, 0.8], [1.1, 1.05, 0.95]], collider: 'trunk', shadow: true },
  { id: 'oak2', make: (l) => broadleaf(53, l, 'oak'), lod: [70, 200], impostor: true, size: [0.8, 1.2], tint: [[0.9, 0.88, 0.8], [1.1, 1.05, 0.9]], collider: 'trunk', shadow: true },
  { id: 'oak3', make: (l) => broadleaf(67, l, 'oak'), lod: [70, 200], impostor: true, size: [1.0, 1.45], tint: [[0.85, 0.85, 0.78], [1.05, 1.0, 0.9]], collider: 'trunk', shadow: true },
  { id: 'aspen', make: (l) => broadleaf(79, l, 'aspen'), lod: [70, 200], impostor: true, size: [0.85, 1.2], tint: [[0.9, 0.85, 0.8], [1.1, 1.05, 0.95]], collider: 'trunk', shadow: true },
  { id: 'dead', make: (l) => deadTree(83, l), lod: [70, 200], impostor: true, size: [0.8, 1.3], tint: [[0.85, 0.85, 0.85], [1.05, 1.05, 1.05]], collider: 'trunk', shadow: true },
  { id: 'saguaro', make: (l) => saguaro(97, l), lod: [80, 220], impostor: true, size: [0.8, 1.2], tint: [[0.9, 0.95, 0.9], [1.05, 1.05, 1]], collider: 'trunk', shadow: true },
  { id: 'sage', make: (l) => sagebrush(101, l), lod: [45, 110], size: [0.7, 1.3], tint: [[0.85, 0.9, 0.85], [1.1, 1.05, 1]], collider: null },
  { id: 'pear', make: (l) => pricklyPear(103, l), lod: [40, 90], size: [0.8, 1.3], tint: [[0.9, 0.95, 0.9], [1.05, 1.05, 1]], collider: null },
  { id: 'reed', make: (l) => crossed(107, l, 'reed', 1.1, 1.9, 0.9, 4), lod: [45, 100], size: [0.8, 1.25], tint: [[0.9, 0.9, 0.85], [1.1, 1.05, 0.95]], collider: null },
  { id: 'tuft', make: (l) => crossed(109, l, 'tuft', 0.45, 0.75, 1.2, 3), lod: [55, 110], size: [0.8, 1.4], tint: [[0.85, 0.85, 0.75], [1.1, 1.05, 0.9]], collider: null },
  { id: 'rock1', make: (l) => rock(113, l, 0), lod: [90, 400], size: [0.5, 2.2], tint: [[0.8, 0.8, 0.8], [1.05, 1.05, 1.05]], collider: 'rock', shadow: true },
  { id: 'rock2', make: (l) => rock(127, l, 1), lod: [90, 400], size: [0.6, 2.5], tint: [[0.8, 0.8, 0.8], [1.05, 1.05, 1.05]], collider: 'rock', shadow: true },
  { id: 'rock3', make: (l) => rock(131, l, 2), lod: [90, 400], size: [0.8, 3.0], tint: [[0.8, 0.8, 0.8], [1.05, 1.05, 1.05]], collider: 'rock', shadow: true },
  { id: 'rock4', make: (l) => rock(137, l, 3), lod: [90, 400], size: [0.6, 2.4], tint: [[0.8, 0.8, 0.8], [1.05, 1.05, 1.05]], collider: 'rock', shadow: true },
  { id: 'rock5', make: (l) => rock(139, l, 4), lod: [90, 400], size: [0.4, 1.6], tint: [[0.8, 0.8, 0.8], [1.05, 1.05, 1.05]], collider: 'rock', shadow: true },
];
export const SPECIES_INDEX = Object.fromEntries(SPECIES.map((s, i) => [s.id, i]));

/** Build both LOD geometries for every species (plus measurements used by scatter, colliders and impostors). */
export function buildSpecies() {
  return SPECIES.map((s) => {
    const a = s.make(0), b = s.make(1);
    return { ...s, lod0: a.geo, lod1: b.geo, height: a.height, radius: a.radius, trunk: a.trunk };
  });
}
