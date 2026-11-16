import * as THREE from 'three';
import { atlasUV } from './HumanTextures.js';

/**
 * Skinned mesh construction kit for procedural humans: a vertex builder with up to four bone weights,
 * vertex colours and atlas UVs, plus lofts (rings along a path), lathes (profiles spun around Y) and
 * deformable ellipsoids. Every part gets a smooth-group id so seams weld their normals.
 */
export const TUNING = { weldPrecision: 1e4 };

const _uv = [0, 0];

export class SkinBuilder {
  constructor() {
    this.pos = []; this.uv = []; this.col = []; this.si = []; this.sw = []; this.idx = []; this.group = [];
    this.count = 0; this.groupId = 0;
  }
  /** Starts a new smooth group (normals weld only within a group). */
  part() { return ++this.groupId; }
  /**
   * @param {number[]} p position [x, y, z]
   * @param {number} region atlas region; u, v local 0..1
   * @param {THREE.Color} color linear vertex colour
   * @param {Array<[number, number]>} weights [boneIndex, weight] pairs (normalized, top four kept)
   */
  vert(p, region, u, v, color, weights) {
    this.pos.push(p[0], p[1], p[2]);
    atlasUV(region, u, v, _uv); this.uv.push(_uv[0], _uv[1]);
    this.col.push(color.r, color.g, color.b);
    let w = weights;
    if (w.length > 4) w = [...w].sort((a, b) => b[1] - a[1]).slice(0, 4);
    let sum = 0; for (const [, x] of w) sum += x;
    for (let k = 0; k < 4; k++) {
      this.si.push(k < w.length ? w[k][0] : 0);
      this.sw.push(k < w.length && sum > 0 ? w[k][1] / sum : (k === 0 && sum === 0 ? 1 : 0));
    }
    this.group.push(this.groupId);
    return this.count++;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  /** Grid of (rows + 1) × (cols + 1) vertices starting at `base`, rows along the path, cols around. */
  grid(base, rows, cols, flip = false, closedCols = null) {
    const w = cols + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (closedCols && !closedCols(r, c)) continue;
        const a = base + r * w + c, b = a + 1, d = a + w, e = d + 1;
        if (flip) { this.tri(a, d, b); this.tri(b, d, e); } else { this.tri(a, b, d); this.tri(b, e, d); }
      }
    }
  }
  /** Flips the winding of triangles added since index `start` (in the index array). */
  flipSince(start) { for (let i = start; i < this.idx.length; i += 3) { const t = this.idx[i + 1]; this.idx[i + 1] = this.idx[i + 2]; this.idx[i + 2] = t; } }

  /** @returns {THREE.BufferGeometry} with smooth normals welded across UV seams. */
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeVertexNormals();
    weldNormals(g, this.group);
    return g;
  }
}

/** Averages normals of vertices that share a position within the same smooth group. */
export function weldNormals(geo, groups) {
  const p = geo.attributes.position.array, n = geo.attributes.normal.array, q = TUNING.weldPrecision;
  const map = new Map();
  for (let i = 0; i < p.length / 3; i++) {
    const key = `${groups[i]}|${Math.round(p[i * 3] * q)}|${Math.round(p[i * 3 + 1] * q)}|${Math.round(p[i * 3 + 2] * q)}`;
    const list = map.get(key);
    if (list) list.push(i); else map.set(key, [i]);
  }
  for (const list of map.values()) {
    if (list.length < 2) continue;
    let x = 0, y = 0, z = 0;
    for (const i of list) { x += n[i * 3]; y += n[i * 3 + 1]; z += n[i * 3 + 2]; }
    const l = Math.hypot(x, y, z) || 1;
    for (const i of list) { n[i * 3] = x / l; n[i * 3 + 1] = y / l; n[i * 3 + 2] = z / l; }
  }
  geo.attributes.normal.needsUpdate = true;
}

/**
 * Loft: rings placed along a path. Each ring = { c:[x,y,z], X:[..], Z:[..] (unit frame axes), rx, rzF, rzB, a0?, a1? }.
 * Ring point at angle a: c + X·rx·cos(a) − Z·rz·sin(a), where rz is rzF on the front half (sin a > 0) else rzB.
 * With the default frame (X = +x, Z = +z) angle 90° is the front (−z). Winding is chosen automatically so
 * faces point away from the ring centres. Optional caps close the first/last ring.
 * `uList` (sorted 0..1 angle fractions) replaces uniform columns, e.g. to put hard colour edges at garment seams.
 * @param {object} o { rings, segs, region, color(p, u, v, ring, a), weights(p, u, v, ring, a), shape?(p, u, v, ring, a), a0, a1, capStart, capEnd, vRange }
 */
export function loft(b, o) {
  if (o.uList) o = { ...o, segs: o.uList.length - 1 };
  const { rings, segs } = o, a0 = o.a0 ?? 0, a1 = o.a1 ?? Math.PI * 2, closed = o.a0 === undefined && o.a1 === undefined;
  const g = b.part(), base = b.count, start = b.idx.length, vr = o.vRange || [0, 1];
  const p = [0, 0, 0];
  for (let r = 0; r < rings.length; r++) {
    const R = rings[r], X = R.X || [1, 0, 0], Z = R.Z || [0, 0, 1];
    const v = vr[0] + (vr[1] - vr[0]) * (rings.length > 1 ? r / (rings.length - 1) : 0);
    for (let c = 0; c <= segs; c++) {
      const u = o.uList ? o.uList[c] : c / segs, a = a0 + (a1 - a0) * (o.uList ? u : o.warp ? o.warp(u) : u), ca = Math.cos(a), sa = Math.sin(a), rz = sa > 0 ? R.rzF : R.rzB;
      p[0] = R.c[0] + X[0] * R.rx * ca - Z[0] * rz * sa;
      p[1] = R.c[1] + X[1] * R.rx * ca - Z[1] * rz * sa;
      p[2] = R.c[2] + X[2] * R.rx * ca - Z[2] * rz * sa;
      if (o.shape) o.shape(p, u, v, R, a);
      b.vert(p, o.region(u, v, R, a), u, v, o.color(p, u, v, R, a), o.weights(p, u, v, R, a));
    }
  }
  b.grid(base, rings.length - 1, segs);
  // auto-orient: compare a middle face normal with the outward direction from its ring centre
  const mid = Math.floor((rings.length - 1) / 2), cq = Math.floor(segs / 4);
  const ia = base + mid * (segs + 1) + cq, ib = ia + 1, id = ia + segs + 1;
  const P = (i) => [b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]];
  const A = P(ia), B = P(ib), D = P(id), Cc = rings[mid].c;
  const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [D[0] - A[0], D[1] - A[1], D[2] - A[2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const out = [A[0] - Cc[0], A[1] - Cc[1], A[2] - Cc[2]];
  const flip = (n[0] * out[0] + n[1] * out[1] + n[2] * out[2]) < 0;
  if (o.inside ? !flip : flip) b.flipSince(start);
  if (closed && o.capStart) cap(b, o, base, 0, -1, g);
  if (closed && o.capEnd) cap(b, o, base, rings.length - 1, 1, g);
  return { base, rows: rings.length, cols: segs + 1 };
}

function cap(b, o, base, r, dir, g) {
  const R = o.rings[r], segs = o.segs, w = segs + 1, prev = o.rings[Math.max(0, Math.min(o.rings.length - 1, r - dir))];
  const tip = R.tip || R.c;
  const v = r === 0 ? 0 : 1;
  b.groupId = g + 1000; // caps get their own smooth group (a crease at the rim)
  const ci = b.vert(tip, o.region(0.5, v, R, 0), 0.5, v, o.color(tip, 0.5, v, R, 0), o.weights(tip, 0.5, v, R, 0));
  const ringBase = base + r * w, start = b.idx.length;
  for (let c = 0; c < segs; c++) b.tri(ringBase + c, ringBase + c + 1, ci);
  // orient: cap normal should point along the path direction away from the neighbouring ring
  const P = (i) => [b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]];
  const A = P(ringBase), B = P(ringBase + Math.max(1, Math.floor(segs / 3))), C = P(ci);
  const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const away = [R.c[0] - prev.c[0], R.c[1] - prev.c[1], R.c[2] - prev.c[2]];
  if (r === 0 && o.rings.length > 1) { away[0] = R.c[0] - o.rings[1].c[0]; away[1] = R.c[1] - o.rings[1].c[1]; away[2] = R.c[2] - o.rings[1].c[2]; }
  if (n[0] * away[0] + n[1] * away[1] + n[2] * away[2] < 0) b.flipSince(start);
  b.groupId = g;
}

/**
 * Lathe: profile [[r, y], ...] spun around the vertical axis through `center`, ellipse-scaled by sx/sz.
 * Traverse the profile so the outside is on the right when walking it upward (normal = (dy, −dr)).
 * `deform(p, a, i)` may move points (crown creases, brim curls).
 */
export function lathe(b, o) {
  const { profile, segs, center } = o, sx = o.sx ?? 1, sz = o.sz ?? 1;
  b.part();
  const base = b.count, p = [0, 0, 0];
  for (let i = 0; i < profile.length; i++) {
    const [r, y] = profile[i], v = i / (profile.length - 1);
    for (let c = 0; c <= segs; c++) {
      const u = c / segs, a = u * Math.PI * 2;
      p[0] = center[0] + Math.cos(a) * r * sx; p[1] = center[1] + y; p[2] = center[2] - Math.sin(a) * r * sz;
      if (o.deform) o.deform(p, a, i, r, y);
      b.vert(p, o.region(u, v, i), u, v, o.color(p, u, v, i), o.weights(p, u, v, i));
    }
  }
  b.grid(base, profile.length - 1, segs);
  return base;
}

/**
 * Ellipsoid on a latitude/longitude grid (rows from top to bottom). `deform(p, d)` gets the unit direction d.
 * `mask(d)` (optional) keeps only faces whose four corners pass, for shells such as hair and beards.
 * Returns the grid info so callers can find vertices.
 */
export function ellipsoid(b, o) {
  const { center, radii, rows, cols } = o, lat0 = o.lat0 ?? 0, lat1 = o.lat1 ?? Math.PI;
  b.part();
  const base = b.count, p = [0, 0, 0], d = [0, 0, 0], keep = [];
  for (let r = 0; r <= rows; r++) {
    const th = lat0 + (lat1 - lat0) * (r / rows), st = Math.sin(th), ct = Math.cos(th);
    for (let c = 0; c <= cols; c++) {
      const ph = (o.ph0 ?? 0) + (c / cols) * ((o.ph1 ?? Math.PI * 2) - (o.ph0 ?? 0));
      d[0] = st * Math.sin(ph); d[1] = ct; d[2] = st * Math.cos(ph); // ph = 0 → back (+z), π → front (−z)
      p[0] = center[0] + d[0] * radii[0]; p[1] = center[1] + d[1] * radii[1]; p[2] = center[2] + d[2] * radii[2];
      if (o.deform) o.deform(p, d);
      const u = c / cols, v = r / rows;
      keep.push(o.mask ? o.mask(d) : true);
      b.vert(p, o.region(u, v, d), o.uMap ? o.uMap(d, u, v)[0] : u, o.uMap ? o.uMap(d, u, v)[1] : v, o.color(p, d), o.weights(p, d));
    }
  }
  const w = cols + 1;
  const start = b.idx.length;
  b.grid(base, rows, cols, false, o.mask ? (r, c) => keep[r * w + c] && keep[r * w + c + 1] && keep[(r + 1) * w + c] && keep[(r + 1) * w + c + 1] : null);
  // Orientation: rows go top → bottom and columns go back → right → front → left, which faces inward; flip.
  b.flipSince(start);
  if (o.inside) b.flipSince(start);
  return { base, rows, cols };
}
