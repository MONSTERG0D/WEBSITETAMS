import * as THREE from 'three';
import { B, restOf } from './Bones.js';
import { REGIONS as RG } from './HumanTextures.js';
import { SkinBuilder, loft } from './MeshKit.js';
import { buildHead, buildHat } from './HeadParts.js';

/**
 * Body and clothing for procedural humans: torso with shirt/vest/coat zones, legs with pants and chaps,
 * boots, arms with sleeves and cuffs, mitten hands with a thumb, belts, gun belt and holster, duster and
 * frock skirts with linings, dresses, ponchos, shawls and neckerchiefs. buildHumanGeometry() assembles
 * the whole character (head parts come from HeadParts.js) for one level of detail.
 */
export const TUNING = { coatOffset: { duster: 0.01, frock: 0.008, jacket: 0.008, sheepskin: 0.015, poncho: 0.004 }, sleeveOffset: 0.6, liningDarken: 0.45 };
const ARM_X = restOf('upperArmR')[0];

/** Level-of-detail settings. Eli uses LOD_HERO for LOD0. */
export const LODS = [
  { name: 'LOD0', ring: 13, torso: 16, head: [16, 24], eye: [6, 10], nose: 6, hat: 22, lids: true, brows: true, ears: true, hands: 2, face: true, limbStep: 1, skirtRows: 6 },
  { name: 'LOD1', ring: 8, torso: 11, head: [9, 12], eye: [4, 6], nose: 4, hat: 12, lids: false, brows: true, ears: false, hands: 1, face: 'simple', limbStep: 2, skirtRows: 4 },
  { name: 'LOD2', ring: 4, torso: 6, head: [4, 6], eye: [3, 4], nose: 3, hat: 6, lids: false, brows: false, ears: false, hands: 0, face: false, limbStep: 3, skirtRows: 2 },
];
export const LOD_HERO = { ...LODS[0], name: 'LOD0+', ring: 16, torso: 22, head: [22, 30], eye: [8, 12], nose: 8, hat: 28, skirtRows: 8 };
/** Added in Part 16: the nearest LOD on the High preset (denser rings, rounder limbs, hats and heads up close). */
export const LOD_HIGH = { ...LODS[0], name: 'LOD0 high', ring: 16, torso: 20, head: [20, 28], eye: [8, 12], nose: 7, hat: 26, skirtRows: 8 };
export const LOD_HERO_HIGH = { ...LOD_HERO, name: 'LOD0+ high', ring: 20, torso: 28, head: [28, 38], eye: [10, 14], nose: 10, hat: 36, skirtRows: 10 };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lin = (v, a, b) => clamp01((v - a) / (b - a));
const sm = (v, a, b) => { const t = lin(v, a, b); return t * t * (3 - 2 * t); };
const DEG = 180 / Math.PI;
/** Azimuth in degrees around the body: 0 = front, +90 = right (+x), ±180 = back. From a loft angle a. */
const azimuth = (a) => { let p = 90 - a * DEG; while (p > 180) p -= 360; while (p < -180) p += 360; return p; };

// ---------- colours: linear THREE.Colors, cached by key
function palette(look) {
  const cache = new Map();
  const hex = (h) => { if (!cache.has(h)) cache.set(h, new THREE.Color(h)); return cache.get(h); };
  const mixC = new Map();
  const mix = (a, b, t) => {
    const k = `${a.getHexString()}${b.getHexString()}${Math.round(t * 40)}`;
    if (!mixC.has(k)) mixC.set(k, a.clone().lerp(b, Math.round(t * 40) / 40));
    return mixC.get(k);
  };
  const mul = (a, s) => mix(a, hex('#000000'), 1 - s);
  const skin = hex(look.skin), grey = hex('#bdbab4');
  const hair = hex(look.hair.color), beard = look.beard.grey ? hex(look.beard.color).clone().lerp(grey, look.beard.grey) : hex(look.beard.color);
  return {
    hex, mix, mul, white: hex('#ffffff'), skin, hair, beard,
    lip: skin.clone().lerp(hex('#9a4a44'), 0.32), lid: skin.clone().multiplyScalar(0.86), ear: skin.clone().lerp(hex('#c06a5a'), 0.12),
    nostril: skin.clone().multiplyScalar(0.55), eyeDark: hex('#2a1e18'),
    hat: hex(look.hat.color), band: hex(look.hat.band || '#1e1a18'),
  };
}

/** Torso cross-sections bottom → top: [y, rx, rzFront, rzBack, cz]. */
const TORSO = [
  [0.80, 0.105, 0.075, 0.085, 0.005], [0.85, 0.16, 0.095, 0.11, 0.01], [0.91, 0.172, 0.1, 0.12, 0.012],
  [0.97, 0.165, 0.098, 0.108, 0.006], [1.03, 0.157, 0.098, 0.098, 0], [1.1, 0.158, 0.105, 0.098, 0],
  [1.18, 0.168, 0.115, 0.1, 0], [1.26, 0.176, 0.122, 0.102, 0], [1.33, 0.18, 0.118, 0.105, 0.002],
  [1.39, 0.172, 0.11, 0.105, 0.005], [1.435, 0.15, 0.096, 0.098, 0.008], [1.468, 0.112, 0.074, 0.078, 0.008], [1.505, 0.066, 0.058, 0.06, 0.008],
];

function torsoTable(look) {
  const f = look.sex === 'f', bw = look.build;
  const off = look.coat ? TUNING.coatOffset[look.coat.style] || 0 : 0;
  return TORSO.map(([y, rx, rf, rb, cz]) => {
    let k = bw, kf = bw;
    if (f) {
      if (y >= 1.0 && y <= 1.14) k *= 0.88;
      if (y >= 0.85 && y <= 0.95) k *= 1.07;
      if (y >= 1.37) k *= 0.9;
      if (y >= 1.22 && y <= 1.36) kf *= 1.18;
    }
    if (bw > 1.06 && y > 0.98 && y < 1.25) kf *= 1 + (bw - 1) * 1.6; // belly
    const o = y > 0.84 && y < 1.47 ? off : off * 0.5;
    return { y, rx: rx * k + o, rzF: rf * kf + o, rzB: rb * k + o, cz };
  });
}
/** Interpolated torso ring at height y. */
function torsoAt(T, y) {
  let i = 0; while (i < T.length - 2 && T[i + 1].y < y) i++;
  const a = T[i], b = T[i + 1], t = clamp01((y - a.y) / (b.y - a.y));
  return { y, rx: a.rx + (b.rx - a.rx) * t, rzF: a.rzF + (b.rzF - a.rzF) * t, rzB: a.rzB + (b.rzB - a.rzB) * t, cz: a.cz + (b.cz - a.cz) * t };
}
/** Loft angle warp that packs more columns near the front (loft angle 90°). */
const frontWarp = (u) => { const a = u * Math.PI * 2; return (a - 0.25 * Math.sin(2 * (a - Math.PI / 2))) / (Math.PI * 2); }; // denser at front and back
/** Front opening half-angles (degrees) of coats and vests: hard seams so garment edges stay crisp. */
const OPEN = { duster: 15, frock: 16, jacket: 11, sheepskin: 9 }, VEST_OPEN = 7;
/** Column fractions: warped uniform columns plus a tight pair at each ±edge (azimuth degrees from the front). */
function seamColumns(segs, edges) {
  const us = []; for (let c = 0; c <= segs; c++) us.push(frontWarp(c / segs));
  for (const e of edges) for (const sgn of [-1, 1]) for (const d of [-0.35, 0.35]) us.push((90 + sgn * e + d) / 360);
  us.sort((a, b) => a - b);
  const out = [];
  for (const u of us) if (!out.length || u - out[out.length - 1] > 0.0015) out.push(u);
  out[0] = 0; out[out.length - 1] = 1;
  return out;
}
const ringOf = (r, extra = 0, dy = 0) => ({ c: [0, r.y + dy, r.cz], rx: r.rx + extra, rzF: r.rzF + extra, rzB: r.rzB + extra });

function torsoWeights(p) {
  const y = p[1], x = p[0];
  const s = sm(y, 0.97, 1.07), c = sm(y, 1.16, 1.26), n = sm(y, 1.45, 1.49);
  const w = [[B.hips, 1 - s], [B.spine, s * (1 - c)], [B.chest, c * (1 - n)], [B.neck, n]];
  if (y < 0.9) { const t = (0.9 - y) / 0.1 * 0.55, side = x > 0 ? B.thighR : B.thighL; w[0][1] *= 1 - t * Math.min(1, Math.abs(x) / 0.08); w.push([side, t * Math.min(1, Math.abs(x) / 0.08)]); }
  const sh = sm(Math.abs(x), 0.1, 0.18) * sm(y, 1.32, 1.42) * 0.55;
  if (sh > 0) { w.push([x > 0 ? B.shoulderR : B.shoulderL, sh]); w[2][1] *= 1 - sh; }
  return w;
}

/**
 * Builds the full skinned geometry for a look at a level of detail.
 * @param {object} look from resolveLook() @param {object} L an entry of LODS (or LOD_HERO)
 */
export function buildHumanGeometry(look, L) {
  const b = new SkinBuilder(), C = palette(look);
  const ctx = { look, L, C, T: torsoTable(look) };
  const grime = look.grime || 0;
  ctx.dirt = (c, p) => {
    if (grime <= 0) return c;
    const n = Math.sin(p[0] * 41 + p[1] * 17) * Math.sin(p[2] * 37 + p[1] * 23) * 0.5 + 0.5;
    const low = sm(0.6 - p[1], 0, 0.5);
    return C.mul(c, 1 - grime * (0.12 * n + 0.18 * low));
  };
  buildTorso(b, ctx);
  buildLegs(b, ctx);
  buildArms(b, ctx);
  if (L.hands) buildHands(b, ctx);
  buildBelts(b, ctx);
  buildSkirts(b, ctx);
  buildNeckwear(b, ctx);
  buildHead(b, ctx);
  buildHat(b, ctx);
  return b.geometry();
}

// ---------- torso
function buildTorso(b, ctx) {
  const { look, L, C, T } = ctx;
  const coat = look.coat, vest = look.vest, dress = look.dress;
  const shirtC = C.hex(look.shirt.color), vestC = vest ? C.hex(vest.color) : null, coatC = coat ? C.hex(coat.color) : null;
  const pantsC = look.pants ? C.hex(look.pants.color) : dress ? C.hex(dress.color) : shirtC;
  const beltC = C.hex(look.belt.color), metal = C.hex('#c9b27a'), tieC = look.tie ? C.hex(look.tie.color) : null, susC = look.suspenders ? C.hex(look.suspenders.color) : null;
  const apronC = look.apron ? C.hex(look.apron.color) : null, white = C.hex('#eeeae2');
  const longCoat = coat && (coat.style === 'duster' || coat.style === 'frock' || coat.style === 'jacket' || coat.style === 'sheepskin');
  const region = coat && coat.style !== 'poncho' ? (coat.style === 'duster' ? RG.canvas : coat.style === 'sheepskin' ? RG.leather : RG.wool) : RG[look.shirt.pattern] ?? RG.cotton;
  const rings = T.map((r) => ringOf(r));
  const coatOpen = coat ? OPEN[coat.style] ?? 0 : 0, vestOpen = vest ? VEST_OPEN : 0;
  const edges = [coatOpen, vestOpen].filter((o) => o > 0 && L.torso >= 12);
  loft(b, {
    rings, region: () => region, capStart: true, capEnd: true, uList: seamColumns(L.torso, edges),
    weights: torsoWeights,
    color: (p, u, v, R, a) => {
      const phi = azimuth(a), y = p[1], af = Math.abs(phi);
      let c = y < 0.985 ? pantsC : shirtC;
      if (dress && y < 1.05) c = C.hex(dress.color);
      if (susC && y > 0.99 && y < 1.45 && (Math.abs(af - 28) < 5 || Math.abs(af - 152) < 5)) c = susC;
      if (vestC && y > 0.96 && y < 1.43 && af > VEST_OPEN) c = vestC;
      if (tieC && af < 4 + (1.47 - y) * 8 && y > 1.18 && y < 1.47) c = tieC;
      if (look.collar && y > 1.44) c = white;
      if (y > 0.97 && y < 1.0 && !dress && !(coat && coat.style === 'poncho')) c = af < 6 ? metal : beltC;
      if (apronC && y < 1.3 && af < 55) c = apronC;
      if (coatC && (coat.style === 'poncho' ? y > 1.02 : y > (longCoat ? 0.84 : 0.96))) {
        if (coat.style === 'poncho' || af > (OPEN[coat.style] ?? 0)) c = coatC;
      }
      if (look.badge && phi < -22 && phi > -42 && y > 1.29 && y < 1.36) c = metal;
      if (look.shawl && y > 1.3) c = C.hex(look.shawl.color);
      return ctx.dirt(c, p);
    },
  });
}

// ---------- legs and boots
const LEG = [[0.97, 0.094, 0.004], [0.9, 0.09, 0.004], [0.82, 0.085, 0.002], [0.72, 0.078, 0], [0.62, 0.07, -0.002], [0.54, 0.062, -0.004], [0.48, 0.058, -0.004], [0.42, 0.058, 0.002], [0.36, 0.06, 0.008], [0.3, 0.056, 0.006]];
const pickRings = (list, step) => list.filter((_, i) => i % step === 0 || i === list.length - 1);

function legWeights(side) {
  const th = side > 0 ? B.thighR : B.thighL, sh = side > 0 ? B.shinR : B.shinL, ft = side > 0 ? B.footR : B.footL;
  return (p) => {
    const y = p[1], k = sm(y, 0.43, 0.52), hip = sm(y, 0.86, 0.97) * 0.55, a = sm(y, 0.07, 0.14);
    const w = [[th, k * (1 - hip)], [sh, (1 - k) * a], [ft, (1 - k) * (1 - a)]];
    if (hip > 0) w.push([B.hips, k * hip]);
    return w;
  };
}

function buildLegs(b, ctx) {
  const { look, L, C } = ctx, bw = look.build, dress = look.dress;
  const pantsC = look.pants ? C.hex(look.pants.color) : C.hex('#4a3a30');
  const chapsC = look.chaps ? C.hex(look.chaps.color) : null, bootC = C.hex(look.boots.color);
  const region = look.pants ? RG[look.pants.pattern] ?? RG.wool : RG.wool;
  for (const s of [1, -1]) {
    const x = s * 0.095;
    if (!dress) {
      loft(b, {
        segs: L.ring, region: () => region,
        rings: pickRings(LEG, L.limbStep).map(([y, r, cz]) => ({ c: [x + s * (y > 0.85 ? 0.004 : 0), y, cz], rx: r * bw * (y > 0.6 ? 1.02 : 1), rzF: r * bw * 0.98, rzB: r * bw * (y < 0.42 && y > 0.3 ? 1.12 : 1.02) })),
        weights: legWeights(s),
        color: (p, u, v, R, a) => {
          const phi = azimuth(a) * s; // + = outer side
          if (chapsC && p[1] > 0.33 && phi > -40 && phi < 150) return ctx.dirt(chapsC, p);
          return ctx.dirt(pantsC, p);
        },
      });
    }
    // boot shaft
    const shaftTop = dress ? 0.42 : 0.38;
    loft(b, {
      segs: L.ring, region: () => RG.leather, color: (p) => ctx.dirt(p[1] > shaftTop - 0.02 ? C.mul(bootC, 0.8) : bootC, p),
      rings: [[shaftTop, 0.064], [shaftTop - 0.06, 0.06], [0.24, 0.054], [0.16, 0.05], [0.1, 0.05]].filter((_, i, a) => L.limbStep === 1 || i % 2 === 0 || i === a.length - 1)
        .map(([y, r]) => ({ c: [x, y, 0.004], rx: r * bw, rzF: r * bw, rzB: r * bw * 1.04 })),
      weights: legWeights(s),
    });
    // foot: rings along −z from heel to toe; ring frame X = +x, "Z" = +y (vertical)
    const F = [[0.07, 0.05, 0.03, 0.044], [0.035, 0.06, 0.042, 0.058], [-0.01, 0.062, 0.046, 0.06], [-0.07, 0.048, 0.046, 0.045], [-0.13, 0.034, 0.043, 0.032], [-0.175, 0.027, 0.033, 0.024], [-0.2, 0.022, 0.018, 0.016]];
    loft(b, {
      segs: L.ring, region: () => RG.leather, capStart: true, capEnd: true,
      rings: F.filter((_, i, a) => L.limbStep < 3 || i % 2 === 0 || i === a.length - 1).map(([z, cy, rx, ry]) => ({ c: [x, cy, z], X: [1, 0, 0], Z: [0, 1, 0], rx: rx * (0.95 + 0.05 * bw), rzF: ry, rzB: ry })),
      shape: (p) => { if (p[1] < 0.004) p[1] = 0.004; },
      color: (p) => ctx.dirt(p[1] < 0.012 ? C.mul(bootC, 0.55) : bootC, p),
      weights: (p) => [[s > 0 ? B.footR : B.footL, 1 - 0.4 * sm(p[1], 0.08, 0.11) * sm(p[2], -0.04, 0.02)], [s > 0 ? B.shinR : B.shinL, 0.4 * sm(p[1], 0.08, 0.11) * sm(p[2], -0.04, 0.02)]],
    });
  }
}

// ---------- arms and hands
const ARM = [[1.472, 0.02], [1.462, 0.044], [1.44, 0.056], [1.4, 0.057], [1.33, 0.054], [1.25, 0.05], [1.19, 0.046], [1.15, 0.044], [1.11, 0.046], [1.05, 0.047], [0.98, 0.042], [0.925, 0.036], [0.9, 0.034]];

function armWeights(s) {
  const sh = s > 0 ? B.shoulderR : B.shoulderL, up = s > 0 ? B.upperArmR : B.upperArmL, lo = s > 0 ? B.lowerArmR : B.lowerArmL, h = s > 0 ? B.handR : B.handL;
  return (p) => {
    const y = p[1], top = sm(y, 1.4, 1.48), e = sm(y, 1.11, 1.19), wr = sm(y, 0.89, 0.93);
    const w = [[up, e * (1 - top)], [lo, (1 - e) * wr], [h, (1 - e) * (1 - wr)]];
    if (top > 0) w.push([sh, e * top * 0.7], [B.chest, e * top * 0.3]);
    return w;
  };
}

function buildArms(b, ctx) {
  const { look, L, C } = ctx, bw = look.build, coat = look.coat;
  const sleeveCoat = coat && coat.style !== 'poncho' && coat.style !== 'none';
  const off = sleeveCoat ? TUNING.coatOffset[coat.style] * TUNING.sleeveOffset : 0;
  const c = sleeveCoat ? C.hex(coat.color) : look.shawl ? C.hex(look.shirt.color) : C.hex(look.shirt.color);
  const region = sleeveCoat ? (coat.style === 'duster' ? RG.canvas : coat.style === 'sheepskin' ? RG.leather : RG.wool) : RG[look.shirt.pattern] ?? RG.cotton;
  const rolled = !sleeveCoat && (look.role === 'worker' || look.role === 'farmer' || look.role === 'bartender') && look.age < 0.8;
  const cuffC = sleeveCoat && coat.style === 'sheepskin' ? C.hex('#e8dcc4') : C.mul(c, 0.85);
  for (const s of [1, -1]) {
    const x = s * ARM_X, rings = pickRings(ARM, L.limbStep).map(([y, r]) => {
      const cuff = sleeveCoat && y < 0.96 && y > 0.91 ? 0.012 : 0;
      const o = y > 0.94 ? off : off * 0.4;
      return { c: [x + s * (y > 1.45 ? -0.01 : 0), y, 0.01], rx: (r * bw) * 0.95 + o + cuff, rzF: r * bw * 1.04 + o + cuff, rzB: r * bw * 1.04 + o + cuff };
    });
    loft(b, {
      rings, segs: L.ring, region: () => region, capStart: true, weights: armWeights(s),
      color: (p) => {
        if (p[1] < 0.93) return ctx.dirt(sleeveCoat ? cuffC : C.mul(c, 0.92), p);
        if (rolled && p[1] < 1.08) return C.skin;
        return ctx.dirt(c, p);
      },
    });
    if (rolled) { // rolled cuff
      loft(b, {
        segs: L.ring, region: () => region, color: () => C.mul(c, 0.9), weights: armWeights(s),
        rings: [[1.1, 0.047], [1.085, 0.052], [1.07, 0.047]].map(([y, r]) => ({ c: [x, y, 0.01], rx: r * bw, rzF: r * bw * 1.04, rzB: r * bw * 1.04 })),
      });
    }
  }
}

function buildHands(b, ctx) {
  const { look, L, C } = ctx;
  const c = look.gloves ? C.hex(look.gloves.color) : C.skin, region = look.gloves ? RG.leather : RG.skin;
  const fem = look.sex === 'f' ? 0.9 : 1;
  for (const s of [1, -1]) {
    const x = s * ARM_X, h = s > 0 ? B.handR : B.handL, fg = s > 0 ? B.fingersR : B.fingersL;
    const R = [[0.905, 0.019, 0.031], [0.875, 0.024, 0.043], [0.84, 0.023, 0.047], [0.808, 0.021, 0.046], [0.775, 0.019, 0.043], [0.742, 0.016, 0.038], [0.722, 0.012, 0.028]];
    const t = 0.35, X = [Math.cos(t), 0, s * Math.sin(t)], Z = [-s * Math.sin(t), 0, Math.cos(t)]; // palm turned a little backwards
    loft(b, {
      segs: L.hands > 1 ? 10 : 6, region: () => region, capEnd: true,
      rings: (L.hands > 1 ? R : [R[0], R[2], R[4], R[6]]).map(([y, rx, rz]) => ({ c: [x - s * 0.004, y, 0.012], X, Z, rx: rx * fem, rzF: rz * fem, rzB: rz * fem })),
      color: () => c,
      weights: (p) => { const t = sm(p[1], 0.79, 0.83), cr = sm(p[1], 0.89, 0.91); return [[fg, 1 - t], [h, t * (1 - cr)], [s > 0 ? B.lowerArmR : B.lowerArmL, t * cr * 0.5]]; },
    });
    if (L.hands > 1) { // thumb on the front of the palm, angled down and in
      const P = [[x - s * 0.01, 0.878, -0.026], [x - s * 0.02, 0.85, -0.04], [x - s * 0.027, 0.822, -0.045], [x - s * 0.03, 0.8, -0.045]];
      loft(b, {
        segs: 6, region: () => region, capEnd: true, color: () => c,
        rings: P.map((q, i) => ({ c: q, rx: [0.012, 0.011, 0.0095, 0.008][i] * fem, rzF: [0.012, 0.01, 0.0085, 0.007][i] * fem, rzB: [0.012, 0.01, 0.0085, 0.007][i] * fem })),
        weights: () => [[h, 1]],
      });
    }
  }
}

// ---------- belts, gun belt, holster
function buildBelts(b, ctx) {
  const { look, L, C, T } = ctx;
  if (look.gunbelt) {
    const leather = C.hex(look.belt.color), brass = C.hex('#b8a066');
    const band = (dy) => (p, u, v, R, a) => { p[1] += -0.032 * Math.cos(a) + dy; }; // lower on the holster side
    const r0 = torsoAt(T, 0.92);
    loft(b, {
      segs: L.torso, region: () => RG.leather, shape: band(0),
      rings: [ringOf(r0, 0.009, -0.022), ringOf(r0, 0.016, -0.004), ringOf(r0, 0.009, 0.016)],
      color: (p, u, v, R, a) => (Math.abs(azimuth(a)) < 7 ? brass : (Math.round(u * 60) % 3 === 0 && v > 0.3 && v < 0.7 ? brass : leather)),
      weights: (p) => [[B.hips, 0.8], [p[0] > 0 ? B.thighR : B.thighL, 0.2 * Math.abs(p[0]) / 0.18]],
    });
    // holster on the right hip with a revolver grip
    const hx = 0.2 * look.build + 0.01;
    loft(b, {
      segs: Math.max(5, L.ring >> 1), region: () => RG.leather, capStart: true, capEnd: true, color: () => C.mul(leather, 0.9),
      rings: [[0.9, 0.022, 0.044], [0.84, 0.024, 0.046], [0.76, 0.02, 0.036], [0.7, 0.015, 0.024]].map(([y, rx, rz]) => ({ c: [hx, y, 0.012], rx, rzF: rz, rzB: rz })),
      weights: (p) => [[B.hips, 0.45 + 0.4 * sm(p[1], 0.75, 0.9)], [B.thighR, 0.55 - 0.4 * sm(p[1], 0.75, 0.9)]],
    });
    if (L.face !== false && look.holsterGrip !== false) loft(b, {
      segs: 6, region: () => RG.plain, capEnd: true, color: () => C.hex('#4a2e1c'),
      rings: [[0.905, 0.0], [0.94, 0.012], [0.965, 0.03]].map(([y, dz]) => ({ c: [hx, y, 0.018 + dz], rx: 0.011, rzF: 0.016, rzB: 0.016 })),
      weights: () => [[B.hips, 1]],
    });
  }
}

// ---------- skirts, dresses, capes
function skirtWeights() {
  return (p, u, v, R, a) => {
    const phi = azimuth(a), t = v, hips = 1 - sm(t, 0, 0.3), rest = 1 - hips;
    const front = Math.max(0, Math.cos(phi / DEG)), legShare = 0.32 * front * front;
    const panelL = Math.max(0, 1 - Math.abs(phi + 70) / 95), panelR = Math.max(0, 1 - Math.abs(phi - 70) / 95), panelB = Math.max(0, 1 - (180 - Math.abs(phi)) / 100);
    const sum = panelL + panelR + panelB || 1, seg2 = sm(t, 0.45, 0.8), pr = rest * (1 - legShare);
    const w = [[B.hips, hips], [phi < 0 ? B.thighL : B.thighR, rest * legShare]];
    const add = (b1, b2, x) => { if (x > 0) { w.push([b1, pr * x / sum * (1 - seg2)], [b2, pr * x / sum * seg2]); } };
    add(B.coatL1, B.coatL2, panelL); add(B.coatR1, B.coatR2, panelR); add(B.coatB1, B.coatB2, panelB);
    return w;
  };
}

function buildSkirts(b, ctx) {
  const { look, L, C, T } = ctx, coat = look.coat, dress = look.dress;
  const parts = [];
  if (coat && (coat.style === 'duster' || coat.style === 'frock')) parts.push({ top: 0.94, bottom: coat.style === 'duster' ? 0.3 : 0.55, flare: coat.style === 'duster' ? 0.27 : 0.23, open: OPEN[coat.style], color: C.hex(coat.color), region: coat.style === 'duster' ? RG.canvas : RG.wool });
  if (coat && (coat.style === 'jacket' || coat.style === 'sheepskin')) parts.push({ top: 0.95, bottom: coat.style === 'sheepskin' ? 0.74 : 0.78, flare: 0.205, open: OPEN[coat.style], color: C.hex(coat.color), region: coat.style === 'sheepskin' ? RG.leather : RG.wool, rows: 2 });
  if (dress) parts.push({ top: 1.02, bottom: 0.07, flare: 0.33, open: 0, color: C.hex(dress.color), region: RG[dress.pattern] ?? RG.cotton, apron: look.apron ? C.hex(look.apron.color) : null });
  for (const S of parts) {
    const top = torsoAt(T, S.top), n = S.rows ? Math.min(S.rows, L.skirtRows) : L.skirtRows, rings = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = S.top + (S.bottom - S.top) * t, k = Math.pow(t, 0.75);
      const extra = S.open ? 0.006 : 0.004;
      rings.push({ c: [0, y, top.cz + 0.025 * t], rx: top.rx + extra + (S.flare - top.rx) * k * look.build, rzF: top.rzF + extra + (S.flare * 0.92 - top.rzF) * k, rzB: top.rzB + extra + (S.flare * 1.05 - top.rzB) * k });
    }
    const a0 = S.open ? (90 + S.open) / DEG : undefined, a1 = S.open ? (90 + 360 - S.open) / DEG : undefined;
    // azimuth 0 (front) is loft angle 90°: the opening runs from 90° − open to 90° + open
    const opts = {
      rings, segs: L.torso, region: () => S.region, weights: skirtWeights(), a0, a1,
      color: (p, u, v, R, a) => {
        let c = S.color;
        if (S.apron && Math.abs(azimuth(a)) < 55 && p[1] > 0.2) c = S.apron;
        if (p[1] < S.bottom + 0.025) c = C.mul(c, 0.82);
        return ctx.dirt(c, p);
      },
    };
    if (!S.open) { delete opts.a0; delete opts.a1; }
    loft(b, opts);
    if (L.face === false) continue; // far away: no lining
    // lining (inner faces), slightly inset and darker
    const lining = C.mul(S.color, TUNING.liningDarken);
    loft(b, { ...opts, inside: true, rings: rings.map((r) => ({ ...r, rx: r.rx - 0.004, rzF: r.rzF - 0.004, rzB: r.rzB - 0.004 })), color: () => lining });
  }
  if (coat && coat.style === 'poncho') {
    const c = C.hex(coat.color), stripe = C.mul(c, 0.55), cream = C.hex('#d8c8a4');
    loft(b, {
      segs: L.torso, region: () => RG.knit, capStart: false,
      rings: [[1.49, 0.11, 0.09], [1.44, 0.22, 0.15], [1.33, 0.29, 0.21], [1.18, 0.32, 0.24], [1.03, 0.33, 0.25]].map(([y, rx, rz]) => ({ c: [0, y, 0.01], rx: rx * look.build, rzF: rz * look.build, rzB: rz * look.build })),
      color: (p) => { const band = Math.floor((1.5 - p[1]) / 0.05); return band % 4 === 1 ? stripe : band % 7 === 3 ? cream : c; },
      weights: (p) => [[B.chest, sm(p[1], 1.1, 1.4)], [B.spine, 1 - sm(p[1], 1.1, 1.4)]],
    });
  }
  if (look.shawl) {
    const c = C.hex(look.shawl.color);
    loft(b, {
      segs: L.torso, region: () => RG.knit, color: () => c,
      rings: [[1.49, 0.1, 0.085], [1.44, 0.2, 0.135], [1.36, 0.215, 0.145], [1.27, 0.2, 0.135]].map(([y, rx, rz]) => ({ c: [0, y, 0.008], rx, rzF: rz, rzB: rz })),
      weights: (p) => [[B.chest, 1 - 0.3 * sm(Math.abs(p[0]), 0.15, 0.22)], [p[0] > 0 ? B.shoulderR : B.shoulderL, 0.3 * sm(Math.abs(p[0]), 0.15, 0.22)]],
    });
  }
}

// ---------- neckwear: bandana, sheepskin collar, coat collar
function buildNeckwear(b, ctx) {
  const { look, L, C } = ctx;
  const neckW = (p) => [[B.chest, 1 - sm(p[1], 1.48, 1.54)], [B.neck, sm(p[1], 1.48, 1.54)]];
  if (look.bandana) {
    const c = C.hex(look.bandana.color);
    loft(b, {
      segs: L.ring, region: () => RG.cotton, color: () => c, weights: neckW,
      rings: [[1.455, 0.084, 0.076], [1.48, 0.076, 0.071], [1.51, 0.063, 0.061]].map(([y, rx, rz]) => ({ c: [0, y, 0.006], rx, rzF: rz, rzB: rz })),
    });
    // knotted triangle hanging on the chest
    loft(b, {
      segs: 6, region: () => RG.cotton, color: () => C.mul(c, 0.92), a0: (90 - 50) / DEG, a1: (90 + 50) / DEG,
      rings: [{ c: [0, 1.475, 0.004], rx: 0.084, rzF: 0.08, rzB: 0.08 }, ringOf(torsoAt(ctx.T, 1.41), 0.009), ringOf(torsoAt(ctx.T, 1.35), 0.011)],
      shape: (p, u, v) => { p[1] += v * Math.abs(u - 0.5) * 2 * 0.085; }, // bottom edge forms a V
      weights: (p) => [[B.chest, 1 - sm(p[1], 1.47, 1.52)], [B.neck, sm(p[1], 1.47, 1.52)]],
    });
  }
  const coat = look.coat;
  if (coat && (coat.style === 'sheepskin' || coat.style === 'duster' || coat.style === 'frock' || coat.style === 'jacket')) {
    const fleece = coat.style === 'sheepskin';
    const c = fleece ? C.hex('#e6dac2') : C.mul(C.hex(coat.color), 0.92);
    const big = fleece ? 0.03 : coat.style === 'duster' ? 0.016 : 0.01;
    loft(b, {
      segs: L.torso, region: () => (fleece ? RG.fleece : coat.style === 'duster' ? RG.canvas : RG.wool), color: () => c, weights: neckW,
      a0: (90 + 22) / DEG, a1: (90 + 360 - 22) / DEG,
      rings: [[1.43, 0.17 + big * 0.5, 0.1 + big * 0.5], [1.475, 0.1 + big, 0.085 + big], [1.53, 0.075 + big * 0.6, 0.07 + big * 0.6]].map(([y, rx, rz]) => ({ c: [0, y, 0.008], rx, rzF: rz, rzB: rz })),
    });
  }
}

export { torsoTable, torsoAt };
