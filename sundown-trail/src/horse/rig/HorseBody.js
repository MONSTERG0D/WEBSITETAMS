import * as THREE from 'three';
import { HB, hrest } from './HorseBones.js';
import { HREGIONS as R } from './HorseTextures.js';
import { SkinBuilder, loft, ellipsoid } from '../../characters/rig/MeshKit.js';

/**
 * Procedural mid-poly horse body and tack, skinned to the horse skeleton, built in the rest pose:
 * barrel, neck, head (cheeks, eyes, ears, nostrils, forelock), mane, tail, four legs with knees, hocks,
 * fetlocks and hooves; coats (solid, dapple, pinto), points, socks and face markings; saddle blanket,
 * saddle with horn, fenders and stirrups, cinch, bedroll, saddlebags and bridle with bit rings.
 */
export const TUNING = { blanketOffset: 0.014, saddleOffset: 0.03 };

export const HLODS = [
  // sub: extra rings smoothed in between the authored cross-sections (Catmull-Rom), so the barrel, neck, head,
  // legs and tail read as rounded forms instead of faceted drums up close
  { name: 'LOD0', ring: 20, body: 26, legRing: 12, head: 18, eye: [6, 10], tail: 12, tack: 2, step: 1, sub: 3 },
  { name: 'LOD1', ring: 11, body: 14, legRing: 7, head: 10, eye: [3, 5], tail: 7, tack: 1, step: 2, sub: 2 },
  { name: 'LOD2', ring: 6, body: 7, legRing: 4, head: 5, eye: null, tail: 4, tack: 0, step: 3, sub: 1 },
];
/** Added in Part 16: the nearest LOD on the High preset. */
export const HLOD_HIGH = { name: 'LOD0 high', ring: 28, body: 34, legRing: 16, head: 24, eye: [8, 12], tail: 16, tack: 2, step: 1, sub: 4 };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sm = (v, a, b) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const pick = (list, step) => list.filter((_, i) => i % step === 0 || i === list.length - 1);
const norm2 = (y, z) => { const l = Math.hypot(y, z) || 1; return [y / l, z / l]; };
/** Catmull-Rom blend of four (possibly nested) numeric arrays. */
const cr = (a, b, c, d, t) => (Array.isArray(b)
  ? b.map((_, i) => cr(a[i], b[i], c[i], d[i], t))
  : 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t));
/** Inserts n-1 smoothed cross-sections between each pair of authored ones (n = 1 returns the list as is). */
const subdiv = (list, n = 1) => {
  if (n <= 1 || list.length < 3) return list;
  const o = [];
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[Math.max(0, i - 1)], b = list[i], c = list[i + 1], d = list[Math.min(list.length - 1, i + 2)];
    for (let k = 0; k < n; k++) o.push(k === 0 ? b : cr(a, b, c, d, k / n));
  }
  o.push(list[list.length - 1]);
  return o;
};

/** Barrel cross-sections front → back: [z, centreY, halfWidth, below, above]. */
const BARREL = [
  [-0.99, 1.17, 0.1, 0.15, 0.12], [-0.9, 1.18, 0.19, 0.25, 0.2], [-0.72, 1.2, 0.25, 0.32, 0.28], [-0.5, 1.2, 0.275, 0.34, 0.35],
  [-0.26, 1.18, 0.29, 0.34, 0.33], [0.04, 1.17, 0.31, 0.33, 0.33], [0.34, 1.2, 0.3, 0.3, 0.32], [0.6, 1.24, 0.285, 0.29, 0.3],
  [0.82, 1.24, 0.25, 0.3, 0.25], [0.96, 1.25, 0.16, 0.22, 0.15], [1.03, 1.28, 0.06, 0.08, 0.06],
];
const NECK = [ // path point (y, z) and [halfWidth, throat, crest]
  [[1.2, -0.8], [0.17, 0.27, 0.18]], [[1.4, -0.92], [0.145, 0.19, 0.15]], [[1.6, -1.03], [0.115, 0.14, 0.12]],
  [[1.78, -1.13], [0.095, 0.115, 0.095]], [[1.9, -1.19], [0.085, 0.1, 0.075]],
];
const HEAD = [ // path (y, z), [halfWidth, jaw side, forehead side]
  [[1.92, -1.17], [0.085, 0.11, 0.07]], [[1.85, -1.29], [0.105, 0.155, 0.065]], [[1.74, -1.44], [0.085, 0.105, 0.058]],
  [[1.62, -1.58], [0.07, 0.078, 0.052]], [[1.53, -1.69], [0.074, 0.076, 0.052]], [[1.48, -1.74], [0.06, 0.055, 0.04]],
];
const FRONT_LEG = [ // [y, zCentre, halfWidth, front, back]
  [1.24, -0.58, 0.1, 0.12, 0.1], [1.09, -0.6, 0.095, 0.11, 0.1], [0.98, -0.62, 0.085, 0.085, 0.11], [0.85, -0.62, 0.066, 0.07, 0.065],
  [0.72, -0.62, 0.05, 0.05, 0.05], [0.62, -0.62, 0.052, 0.055, 0.05], [0.55, -0.62, 0.04, 0.04, 0.045], [0.42, -0.62, 0.035, 0.035, 0.045],
  [0.3, -0.62, 0.037, 0.036, 0.046], [0.24, -0.62, 0.045, 0.045, 0.058], [0.17, -0.635, 0.035, 0.04, 0.035], [0.1, -0.65, 0.044, 0.05, 0.044],
];
const HIND_LEG = [
  [1.22, 0.72, 0.12, 0.16, 0.16], [1.06, 0.7, 0.12, 0.17, 0.15], [0.93, 0.68, 0.1, 0.13, 0.12], [0.8, 0.74, 0.075, 0.08, 0.09],
  [0.68, 0.8, 0.055, 0.055, 0.06], [0.58, 0.85, 0.05, 0.05, 0.07], [0.5, 0.855, 0.04, 0.04, 0.05], [0.38, 0.845, 0.036, 0.035, 0.045],
  [0.28, 0.835, 0.038, 0.036, 0.046], [0.23, 0.83, 0.046, 0.045, 0.058], [0.16, 0.815, 0.035, 0.04, 0.035], [0.1, 0.8, 0.044, 0.05, 0.044],
];

function palette(look) {
  const c = (h) => new THREE.Color(h);
  const body = c(look.body), mane = c(look.mane), white = c('#ece6dc'), hoof = c('#3a332c'), hoofLight = c('#9a8a70');
  const points = look.points ? c(look.points) : body.clone().multiplyScalar(0.8);
  const muzzle = body.clone().lerp(c('#1e1814'), 0.55);
  return {
    c, body, mane, white, hoof, hoofLight, points, muzzle, nostril: c('#140f0c'), eye: c('#ffffff'),
    belly: body.clone().lerp(c('#d8c0a0'), look.coat === 'bay' || look.coat === 'chestnut' ? 0.12 : 0.04),
    leather: c('#5a3a22'), darkLeather: c('#3a2616'), saddle: c('#7a4e2c'), metal: c('#b9b2a4'), canvas: c('#b7a98a'), rope: c('#b49a6a'), fleece: c('#d8ccb4'),
  };
}

/** Pinto patch mask: smooth 3-D noise from sines, stable per seed. */
function pintoMask(seed) {
  const a = (seed % 97) * 0.13, b = (seed % 89) * 0.21, d = (seed % 83) * 0.17;
  return (p) => Math.sin(p[0] * 5.1 + a) * Math.sin(p[1] * 4.3 + b) + Math.sin(p[2] * 3.7 + d) * 0.8 + Math.sin((p[0] + p[2]) * 2.3 + a * 2) * 0.5 > 0.55;
}

/** @param {object} look from resolveHorse() @param {object} L an entry of HLODS */
export function buildHorseGeometry(look, L) {
  const b = new SkinBuilder(), C = palette(look), bw = look.build;
  const pinto = look.pattern === 'pinto' ? pintoMask(look.pintoSeed) : () => false;
  const coatRegion = look.pattern === 'dapple' ? R.dapple : R.coat;
  const coatColor = (p, under = 0) => {
    if (pinto(p)) return C.white;
    return under > 0 ? C.body.clone().lerp(C.belly, under) : C.body;
  };

  // ---------- barrel
  loft(b, {
    segs: L.body, region: () => coatRegion, capStart: true, capEnd: true,
    rings: subdiv(pick(BARREL, L.step), L.sub).map(([z, cy, rx, dn, up]) => ({ c: [0, cy, z], X: [1, 0, 0], Z: [0, 1, 0], rx: rx * bw, rzF: dn * (0.96 + 0.04 * bw), rzB: up })),
    color: (p) => coatColor(p, sm(1.0 - p[1], 0.0, 0.18) * 0.8),
    weights: (p) => {
      const f = 1 - sm(p[2], -0.45, -0.15), r = sm(p[2], 0.2, 0.5), body = 1 - f - r;
      const w = [[HB.front, f], [HB.body, body], [HB.rear, r]];
      const side = p[0] > 0 ? 1 : -1, ax = Math.abs(p[0]);
      const sh = (1 - sm(p[2], -0.5, -0.3)) * sm(ax, 0.12, 0.22) * (1 - sm(p[1], 1.05, 1.3)) * 0.55;
      if (sh > 0) { w[0][1] *= 1 - sh; w.push([side > 0 ? HB.shoulderR : HB.shoulderL, sh]); }
      const th = sm(p[2], 0.45, 0.7) * sm(ax, 0.1, 0.2) * (1 - sm(p[1], 1.1, 1.4)) * 0.6;
      if (th > 0) { w[2][1] *= 1 - th; w.push([side > 0 ? HB.thighR : HB.thighL, th]); }
      return w;
    },
  });

  // ---------- neck (and the mane that runs along its crest)
  const neck = subdiv(NECK, L.sub);
  const neckRing = (i, extra = 0) => {
    const [[y, z], [rx, thr, crest]] = neck[i], nx = neck[Math.min(neck.length - 1, i + 1)][0], pv = neck[Math.max(0, i - 1)][0];
    const [ty, tz] = norm2(nx[0] - pv[0], nx[1] - pv[1]);
    return { c: [0, y, z], X: [1, 0, 0], Z: [0, -tz, ty], rx: rx * (0.95 + 0.05 * bw) + extra, rzF: thr * look.neck + extra, rzB: crest + extra };
  };
  const neckW = (p) => {
    const t = clamp01((p[1] - 1.2) / 0.7), h = sm(t, 0.85, 1.0);
    return [[HB.front, 1 - sm(t, 0.0, 0.25)], [HB.neck1, sm(t, 0.0, 0.25) * (1 - sm(t, 0.35, 0.65))], [HB.neck2, sm(t, 0.35, 0.65) * (1 - h)], [HB.head, h]];
  };
  loft(b, { segs: L.ring, region: () => coatRegion, rings: neck.map((_, i) => neckRing(i)), color: (p) => coatColor(p, 0), weights: neckW });
  // mane: a thin fin on the crest, falling to the right
  const maneRings = NECK.slice(0, 5).map(([[y, z], [, , cr]], i) => {
    const [ty, tz] = norm2(NECK[Math.min(4, i + 1)][0][0] - NECK[Math.max(0, i - 1)][0][0], NECK[Math.min(4, i + 1)][0][1] - NECK[Math.max(0, i - 1)][0][1]);
    const up = [0, -tz, ty], len = [0.08, 0.13, 0.14, 0.12, 0.07][i];
    // the hair leaves the crest and falls down the right side: X runs along the hair, Z across it
    const X = [0.8, -0.6 * up[1], -0.6 * up[2]], Z = [0.6, 0.8 * up[1], 0.8 * up[2]];
    const top = [0, y + up[1] * (cr - 0.004), z + up[2] * (cr - 0.004)];
    return { c: [top[0] + X[0] * len * 0.5, top[1] + X[1] * len * 0.5, top[2] + X[2] * len * 0.5], X, Z, rx: len * 0.55, rzF: 0.016, rzB: 0.01 };
  });
  loft(b, {
    segs: Math.max(4, L.ring >> 1), region: () => R.hair, color: () => C.mane, capStart: true, capEnd: true, rings: maneRings,
    weights: (p) => { const w = neckW(p); const m = clamp01((p[1] - 1.3) / 0.5); w.push([m < 0.5 ? HB.mane1 : HB.mane2, 0.6]); return w; },
  });

  // ---------- head
  const headW = (p, jawSide) => {
    const t = clamp01((1.92 - p[1]) / 0.44), jaw = jawSide ? sm(t, 0.5, 0.8) * 0.65 : 0;
    const neck = 1 - sm(t, 0.0, 0.12);
    return [[HB.head, (1 - jaw) * (1 - neck * 0.5)], [HB.neck2, neck * 0.5], [HB.jaw, jaw]];
  };
  const hr = subdiv(pick(HEAD, L.step === 3 ? 2 : 1), L.sub);
  loft(b, {
    segs: L.head, region: (u, v) => (v > 0.7 ? R.muzzle : coatRegion), capEnd: true,
    rings: hr.map(([[y, z], [rx, jaw, fh]], i) => {
      const nx = hr[Math.min(hr.length - 1, i + 1)][0], pv = hr[Math.max(0, i - 1)][0];
      const [ty, tz] = norm2(nx[0] - pv[0], nx[1] - pv[1]);
      // Z points from the jaw toward the forehead (perpendicular to the head's length)
      return { c: [0, y, z], X: [1, 0, 0], Z: [0, -tz, ty], rx, rzF: jaw, rzB: fh };
    }),
    color: (p, u, v, Rg, a) => {
      const front = Math.cos(a - Math.PI * 1.5); // 1 on the forehead/face line
      const t = clamp01((1.92 - p[1]) / 0.44);
      let c = coatColor(p, 0);
      if (t > 0.72) c = C.muzzle;
      if (look.face === 'star' && front > 0.88 && t > 0.15 && t < 0.35) c = C.white;
      if (look.face === 'blaze' && front > 0.82 - t * 0.1 && t > 0.12) c = t > 0.75 ? C.white.clone().lerp(C.muzzle, 0.25) : C.white;
      if (look.face === 'snip' && front > 0.7 && t > 0.7 && t < 0.9) c = C.white;
      if (t > 0.86 && Math.abs(Math.sin(a)) < 0.6 && front < 0.3 && front > -0.6) c = C.nostril; // nostrils
      return c;
    },
    weights: (p, u, v, Rg, a) => headW(p, Math.sin(a) > 0.2),
  });
  if (L.eye) {
    for (const s of [1, -1]) {
      ellipsoid(b, {
        center: [s * 0.098, 1.8, -1.35], radii: [0.022, 0.024, 0.026], rows: L.eye[0], cols: L.eye[1],
        region: () => R.eye, color: () => C.eye, weights: () => [[HB.head, 1]], uMap: (d) => [0.5 + d[2] * 0.4, 0.5 - d[1] * 0.4],
      });
    }
  }
  // ears
  for (const s of [1, -1]) {
    const e = hrest(s > 0 ? 'earR' : 'earL');
    loft(b, {
      segs: Math.max(4, L.ring >> 1), region: () => coatRegion, color: (p) => (p[1] > e[1] + 0.09 ? C.points : coatColor(p)), capEnd: true,
      rings: [[0, 0.03, 0.026], [0.05, 0.028, 0.022], [0.1, 0.017, 0.012], [0.13, 0.006, 0.004]].map(([dy, rx, rz]) => ({ c: [e[0] + s * dy * 0.12, e[1] - 0.02 + dy, e[2] + dy * 0.12], rx: rz * 0.7, rzF: rx, rzB: rx * 0.6 })),
      weights: () => [[s > 0 ? HB.earR : HB.earL, 1]],
    });
  }
  // forelock
  if (L.tack) {
    loft(b, {
      segs: 5, region: () => R.hair, color: () => C.mane, capEnd: true,
      rings: [[1.97, -1.22, 0.04, 0.012], [1.94, -1.29, 0.035, 0.01], [1.88, -1.34, 0.022, 0.006]].map(([y, z, rx, rz]) => ({ c: [0, y, z], rx, rzF: rz, rzB: rz })),
      weights: () => [[HB.head, 1]],
    });
  }

  // ---------- tail: dock then hair
  const tail = [[1.36, 1.0, 0.055, 0.05], [1.28, 1.08, 0.05, 0.045], [1.2, 1.12, 0.06, 0.05], [1.05, 1.15, 0.08, 0.06], [0.9, 1.16, 0.095, 0.07], [0.72, 1.17, 0.1, 0.07], [0.55, 1.17, 0.085, 0.055], [0.46, 1.165, 0.05, 0.03]];
  loft(b, {
    segs: L.tail, region: (u, v) => (v < 0.15 ? coatRegion : R.hair), color: (p) => (p[1] > 1.27 ? coatColor(p) : C.mane), capStart: true, capEnd: true,
    rings: subdiv(pick(tail, L.step === 3 ? 2 : 1), L.sub).map(([y, z, rx, rz]) => ({ c: [0, y, z], rx, rzF: rz, rzB: rz })),
    weights: (p) => {
      const y = p[1];
      if (y > 1.3) return [[HB.rear, 0.4], [HB.tail1, 0.6]];
      if (y > 1.16) return [[HB.tail1, sm(y, 1.16, 1.3)], [HB.tail2, 1 - sm(y, 1.16, 1.3)]];
      if (y > 0.92) return [[HB.tail2, sm(y, 0.92, 1.16)], [HB.tail3, 1 - sm(y, 0.92, 1.16)]];
      return [[HB.tail3, sm(y, 0.7, 0.92)], [HB.tail4, 1 - sm(y, 0.7, 0.92)]];
    },
  });

  // ---------- legs
  const sockCol = (p, h) => (h > 0 && p[1] < h ? C.white : null);
  for (const [legIdx, s, front] of [[0, 1, true], [1, -1, true], [2, 1, false], [3, -1, false]]) {
    const T = front ? FRONT_LEG : HIND_LEG, x0 = front ? 0.16 : 0.17, sock = look.socks[legIdx];
    const nm = (base) => base + (s > 0 ? 'R' : 'L');
    const bones = front ? [HB.front, HB[nm('shoulder')], HB[nm('forearm')], HB[nm('fcannon')], HB[nm('fpastern')]] : [HB.rear, HB[nm('thigh')], HB[nm('gaskin')], HB[nm('hcannon')], HB[nm('hpastern')]];
    const joints = front ? [1.3, 1.0, 0.58, 0.24] : [1.3, 0.94, 0.56, 0.23]; // top, mid, low, fetlock heights
    const pointsLine = front ? 0.62 : 0.56;
    const weights = (p) => {
      const y = p[1];
      const top = sm(y, 1.08, 1.24) * 0.6;
      const a = sm(y, joints[1] - 0.05, joints[1] + 0.06), bb = sm(y, joints[2] - 0.04, joints[2] + 0.04), c = sm(y, joints[3] - 0.03, joints[3] + 0.03);
      return [[bones[0], top], [bones[1], a * (1 - top)], [bones[2], (1 - a) * bb], [bones[3], (1 - bb) * c], [bones[4], 1 - c]];
    };
    loft(b, {
      segs: L.legRing, region: () => coatRegion,
      rings: subdiv(pick(T, L.step), Math.min(2, L.sub)).map(([y, z, rx, f, bk]) => ({ c: [s * (x0 + (y > 1.0 ? (front ? -0.02 : 0.01) : 0)), y, z], rx: rx * (y > 0.9 ? bw : 1), rzF: f * (y > 0.9 ? bw : 1), rzB: bk * (y > 0.9 ? bw : 1) })),
      color: (p) => sockCol(p, sock) || (p[1] < pointsLine && look.points ? C.points.clone().lerp(C.body, sm(p[1], pointsLine - 0.12, pointsLine)) : coatColor(p, 0)),
      weights,
    });
    // hoof
    const hz = front ? -0.655 : 0.795;
    loft(b, {
      segs: L.legRing, region: () => R.hoof, capEnd: true,
      rings: [[0.1, 0.046, 0.05, 0.046], [0.05, 0.053, 0.06, 0.05], [0.0, 0.058, 0.066, 0.052]].map(([y, rx, f, bk]) => ({ c: [s * x0, y, hz - (0.1 - y) * 0.12], rx, rzF: f, rzB: bk })),
      color: () => (sock ? C.hoofLight : C.hoof), weights: () => [[bones[4], 1]],
    });
  }

  if (L.tack) buildTack(b, C, L, look);
  return b.geometry();
}

/** Blanket, saddle, horn, fenders and stirrups, cinch, bedroll, saddlebags, bridle. All rigid on body bones. */
function buildTack(b, C, L, look) {
  const bw = look.build, ring = (z) => {
    let i = 0; while (i < BARREL.length - 2 && BARREL[i + 1][0] < z) i++;
    const A = BARREL[i], Bq = BARREL[i + 1], t = clamp01((z - A[0]) / (Bq[0] - A[0]));
    return A.map((v, k) => v + (Bq[k] - v) * t);
  };
  const shell = (z, off) => { const [, cy, rx, dn, up] = ring(z); return { c: [0, cy, z], X: [1, 0, 0], Z: [0, 1, 0], rx: rx * bw + off, rzF: dn + off, rzB: up + off }; };
  const bodyW = (p) => [[HB.body, 1 - sm(p[2], 0.05, 0.3)], [HB.rear, sm(p[2], 0.05, 0.3)]];
  const top = (lo, hi) => ({ a0: Math.PI + lo, a1: 2 * Math.PI - hi });
  // saddle blanket (top of the back, hanging down the sides)
  loft(b, {
    segs: L.body, region: () => R.blanket, color: () => C.white, ...top(0.42, 0.42),
    rings: [-0.42, -0.3, -0.1, 0.1, 0.2].map((z) => shell(z, 0.014)), weights: bodyW,
  });
  // saddle seat with raised fork (front) and cantle (back), plus skirts
  loft(b, {
    segs: L.body, region: () => R.tooled, color: () => C.saddle, ...top(0.62, 0.62),
    rings: [[-0.36, 0.07], [-0.31, 0.06], [-0.24, 0.035], [-0.1, 0.03], [0.04, 0.035], [0.1, 0.07], [0.13, 0.09]].map(([z, h]) => {
      const r = shell(z, 0.03); r.rzB += h - 0.03; return r;
    }),
    weights: bodyW,
  });
  // horn
  loft(b, {
    segs: 8, region: () => R.leather, color: () => C.darkLeather, capEnd: true,
    rings: [[1.6, 0.018], [1.66, 0.014], [1.7, 0.024], [1.715, 0.022]].map(([y, r]) => ({ c: [0, y, -0.32], rx: r, rzF: r, rzB: r })),
    weights: () => [[HB.body, 1]],
  });
  const [, cyS, rxS] = ring(-0.12);
  for (const s of [1, -1]) {
    // fender strap down to the stirrup
    const x0 = s * (rxS * bw + 0.045);
    loft(b, {
      segs: 4, region: () => R.leather, color: () => C.leather,
      rings: [[cyS + 0.12, 0.012, 0.06], [cyS - 0.05, 0.012, 0.075], [cyS - 0.2, 0.01, 0.05], [0.98, 0.008, 0.025]].map(([y, rx, rz]) => ({ c: [x0 + s * (cyS + 0.12 - y) * 0.06, y, -0.12], rx, rzF: rz, rzB: rz })),
      weights: () => [[HB.body, 1]],
    });
    if (L.tack > 1) {
      loft(b, { // stirrup tread
        segs: 6, region: () => R.leather, color: () => C.darkLeather, capStart: true, capEnd: true,
        rings: [[-0.17, 0.013], [-0.12, 0.016], [-0.07, 0.013]].map(([z, r]) => ({ c: [x0 + s * 0.05, 0.95, z], X: [1, 0, 0], Z: [0, 1, 0], rx: 0.045, rzF: r, rzB: r * 0.6 })),
        weights: () => [[HB.body, 1]],
      });
    }
    // saddlebags
    loft(b, {
      segs: 6, region: () => R.leather, color: () => C.leather, capStart: true, capEnd: true,
      rings: [[1.46, 0.035], [1.36, 0.055], [1.2, 0.06], [1.14, 0.05]].map(([y, rx]) => ({ c: [s * (ring(0.3)[2] * bw + 0.02 + rx * 0.8), y, 0.3], rx, rzF: 0.13, rzB: 0.13 })),
      weights: (p) => [[HB.rear, 0.6], [HB.body, 0.4]],
    });
  }
  // cinch under the belly
  const cinch = (z) => { const r = shell(z, 0.008); return r; };
  loft(b, { segs: L.body >> 1, region: () => R.leather, color: () => C.darkLeather, a0: 0.15, a1: Math.PI - 0.15, rings: [cinch(-0.34), cinch(-0.28)], weights: () => [[HB.body, 1]] });
  // bedroll behind the cantle, lying across
  loft(b, {
    segs: 8, region: () => R.canvas, color: (p) => (Math.abs(Math.abs(p[0]) - 0.18) < 0.02 ? C.rope : C.canvas), capStart: true, capEnd: true,
    rings: [-0.3, -0.18, 0, 0.18, 0.3].map((x) => ({ c: [x, 1.62, 0.2], X: [0, 1, 0], Z: [0, 0, 1], rx: 0.07, rzF: 0.07, rzB: 0.07 })),
    weights: () => [[HB.body, 0.5], [HB.rear, 0.5]],
  });
  // bridle: crownpiece, browband, noseband, cheek straps, bit rings
  const hw = (p) => [[HB.head, 1]];
  const strap = (pts, r = 0.009) => loft(b, { segs: 4, region: () => R.leather, color: () => C.darkLeather, rings: pts.map((c) => ({ c, rx: r, rzF: r * 0.5, rzB: r * 0.5 })), weights: hw });
  for (const s of [1, -1]) {
    strap([[s * 0.07, 1.96, -1.19], [s * 0.114, 1.86, -1.27], [s * 0.097, 1.74, -1.43], [s * 0.083, 1.62, -1.58]]); // cheek
    if (L.tack > 1) {
      ellipsoid(b, { center: [s * 0.078, 1.57, -1.64], radii: [0.006, 0.022, 0.022], rows: 3, cols: 8, region: () => R.metal, color: () => C.metal, weights: hw });
    }
  }
  loft(b, { // noseband ring
    segs: 10, region: () => R.leather, color: () => C.darkLeather,
    rings: [[1.68, -1.53], [1.66, -1.555]].map(([y, z]) => ({ c: [0, y, z], X: [1, 0, 0], Z: [0, 0.8, -0.6], rx: 0.088, rzF: 0.098, rzB: 0.066 })),
    weights: hw,
  });
}
