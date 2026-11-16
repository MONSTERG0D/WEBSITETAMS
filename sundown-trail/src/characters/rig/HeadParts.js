import { B, restOf } from './Bones.js';
import { REGIONS as RG } from './HumanTextures.js';
import { loft, lathe, ellipsoid } from './MeshKit.js';

/**
 * Head, face and headwear for procedural humans: a sculpted skull (deformed ellipsoid with jaw, cheekbones,
 * brow ridge, eye sockets and lips), eyes with blinking lids, nose, ears, brows, hair and beard shells,
 * mustache and six hat styles. Everything is built in the rest pose in model space and skinned to head bones.
 */
export const TUNING = {
  headRadii: [0.08, 0.112, 0.098], headCenter: [0, 0.095, -0.01], eyeRadius: 0.0125, lidRadius: 0.0136,
  hairOffset: 0.007, hairTop: 0.012, beardOffset: { short: 0.0035, full: 0.009, goatee: 0.008, chops: 0.007 },
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sm = (v, a, b) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
/** Lip-shaped band: narrow in height, about 5 cm wide, only on the front of the face. */
const lipBand = (d, cy, sy, amp) => amp * Math.exp(-((d[1] - cy) ** 2) / (2 * sy * sy)) * (1 - sm(Math.abs(d[0]), 0.17, 0.33)) * sm(-d[2], 0.6, 0.85);
const bump = (d, c, sigma, amp) => {
  const dx = d[0] - c[0], dy = d[1] - c[1], dz = d[2] - c[2];
  return amp * Math.exp(-(dx * dx + dy * dy + dz * dz) / (2 * sigma * sigma));
};

/** Head-shape context: centre and a deform function shared by the skull and every shell on it. */
export function headShape(look) {
  const hp = restOf('head'), f = look.face, fem = look.sex === 'f';
  const C = [hp[0] + TUNING.headCenter[0], hp[1] + TUNING.headCenter[1], hp[2] + TUNING.headCenter[2]];
  const R = TUNING.headRadii.map((r, i) => r * (fem && i === 0 ? 0.96 : 1) * (fem && i === 1 ? 0.97 : 1));
  const eyeX = 0.031 * f.eyeGap;
  /** Radius offset (metres, along the surface normal) for unit direction d, before shells add their own. */
  const offset = (d) => {
    let o = 0;
    o += bump(d, [eyeX / 0.08, 0.11, -0.92], 0.17, -0.0075) + bump(d, [-eyeX / 0.08, 0.11, -0.92], 0.17, -0.0075); // eye sockets
    o += bump(d, [0, 0.32, -0.94], 0.2, 0.0055 * f.brow) * (1 - 0.5 * sm(Math.abs(d[0]), 0.4, 0.7)); // brow ridge
    o += bump(d, [0.6, -0.12, -0.78], 0.2, 0.005 * f.cheek) + bump(d, [-0.6, -0.12, -0.78], 0.2, 0.005 * f.cheek); // cheekbones
    o += lipBand(d, -0.47, 0.045, 0.0042 * f.lips); // upper lip
    o += lipBand(d, -0.63, 0.05, 0.0045 * f.lips); // lower lip
    o += lipBand(d, -0.555, 0.022, -0.0028); // mouth line
    o += bump(d, [0, -0.86, -0.5], 0.16, 0.007 * f.chin); // chin
    o += bump(d, [0, 0.15, 0.95], 0.35, 0.006); // occiput
    return o;
  };
  /** Writes the skull surface point for direction d (extra = outward offset for shells). */
  const point = (p, d, extra = 0) => {
    let x = d[0] * R[0], y = d[1] * R[1], z = d[2] * R[2];
    if (d[1] < 0) x *= 1 - (0.2 * f.jaw - 0.04) * sm(-d[1], 0.05, 0.95) * (0.6 + 0.4 * sm(-d[2], -0.2, 0.7)); // jaw taper
    if (d[2] < 0) z *= 1 - 0.07 * sm(-d[2], 0.4, 1); // flatter face
    if (d[1] < -0.55 && d[2] > 0.1) z *= 1 - 0.25 * sm(-d[1], 0.55, 0.95) * sm(d[2], 0.1, 0.6); // nape tuck
    if (Math.abs(d[0]) > 0.8) x *= 1 - 0.04 * sm(Math.abs(d[0]), 0.8, 1); // flat at the ears
    const o = offset(d) + extra, l = Math.hypot(d[0] / R[0], d[1] / R[1], d[2] / R[2]) || 1;
    const nx = d[0] / R[0] / l, ny = d[1] / R[1] / l, nz = d[2] / R[2] / l;
    p[0] = C[0] + x + nx * o; p[1] = C[1] + y + ny * o; p[2] = C[2] + z + nz * o;
    return p;
  };
  return { C, R, point, eyeX, offset };
}

/** Skin weights for a point on the head given its direction (jaw for the lower face, neck at the nape). */
function headWeights(d) {
  const jaw = sm(-d[1], 0.5, 0.66) * sm(-d[2], -0.15, 0.35);
  const neck = sm(-d[1], 0.72, 0.98) * 0.45;
  const w = [[B.head, Math.max(0, 1 - jaw - neck)]];
  if (jaw > 0) w.push([B.jaw, jaw]);
  if (neck > 0) w.push([B.neck, neck]);
  return w;
}

const inBeard = (d, style) => {
  const ax = Math.abs(d[0]);
  const mouth = ax < 0.33 && d[1] > -0.68 && d[1] < -0.43 && d[2] < -0.55;
  if (style === 'goatee') return ax < 0.36 && d[1] < -0.6 && d[2] < -0.3;
  if (style === 'chops') return ax > 0.5 && d[1] < 0.08 && d[1] > -0.7 && d[2] < 0.35;
  if (style === 'none' || style === 'mustache') return false;
  if (mouth) return false;
  if (d[1] > 0.06 || d[2] > 0.5) return false;
  if (d[1] > -0.3 && d[2] < -0.5) return false; // upper cheeks stay bare
  if (d[1] > -0.12 && ax < 0.82) return false;
  return true;
};
const hairline = (d) => -0.5 + 0.98 * Math.pow(clamp01((1 - d[2]) / 2), 1.6);
const inHair = (d, style) => {
  if (style === 'none') return false;
  const ear = Math.abs(d[0]) > 0.72 && d[1] < 0.28 && d[1] > -0.45 && d[2] < 0.35;
  if (ear) return false;
  const above = d[1] > hairline(d);
  if (style === 'bald') return above && d[1] < 0.25 && d[2] > -0.3;
  return above;
};

/**
 * Builds the head and everything on it.
 * @param {SkinBuilder} b @param {object} ctx { look, L (LOD config), C (colour helpers) }
 */
export function buildHead(b, ctx) {
  const { look, L, C: col } = ctx, H = headShape(look);
  const skin = col.skin, lip = col.lip, hairC = col.hair, beardC = col.beard;
  const stubble = look.beard.style === 'stubble' || look.beard.style === 'short';
  // ---------- skull
  ellipsoid(b, {
    center: H.C, radii: H.R, rows: L.head[0], cols: L.head[1],
    deform: (p, d) => H.point(p, d),
    region: () => RG.skin,
    color: (p, d) => {
      let c = skin;
      const lipW = lipBand(d, -0.55, 0.065, 1);
      if (lipW > 0.02) c = col.mix(skin, lip, Math.min(1, lipW * 1.2));
      if (stubble && inBeard(d, 'full')) c = col.mix(c, beardC, look.beard.style === 'short' ? 0.5 : 0.32);
      if (ctx.L.face === false && Math.abs(d[1] - 0.11) < 0.07 && d[2] < -0.85 && Math.abs(Math.abs(d[0]) - 0.38) < 0.1) c = col.eyeDark; // LOD2 painted eyes
      if (d[1] > 0.45 && look.hat.style === 'none' && look.hair.style === 'bald') c = col.mix(c, col.white, 0.08);
      return c;
    },
    weights: (p, d) => headWeights(d),
  });
  // ---------- neck
  const n0 = restOf('neck'), hd = restOf('head');
  loft(b, {
    segs: L.ring, region: () => RG.skin, color: () => skin,
    rings: [
      { c: [0, n0[1] - 0.03, 0.006], rx: 0.058, rzF: 0.054, rzB: 0.058 },
      { c: [0, n0[1] + 0.02, 0.008], rx: 0.054, rzF: 0.05, rzB: 0.054 },
      { c: [0, hd[1] + 0.005, 0.006], rx: 0.052, rzF: 0.05, rzB: 0.052 },
      { c: [0, hd[1] + 0.05, 0.004], rx: 0.05, rzF: 0.048, rzB: 0.05 },
    ],
    weights: (p) => {
      const t = sm(p[1], n0[1] - 0.02, n0[1] + 0.03), h = sm(p[1], hd[1] - 0.01, hd[1] + 0.04);
      return [[B.chest, 1 - t], [B.neck, t * (1 - h)], [B.head, h]];
    },
  });
  // ---------- hair
  const hs = look.hair.style;
  if (hs !== 'none') {
    const top = TUNING.hairTop, off = TUNING.hairOffset;
    ellipsoid(b, {
      center: H.C, radii: H.R, rows: L.head[0], cols: L.head[1], mask: (d) => inHair(d, hs),
      deform: (p, d) => H.point(p, d, off + top * sm(d[1], 0.2, 1) - 0.004 * sm(-d[1], 0, 0.5)),
      region: () => RG.hair, color: () => hairC, weights: (p, d) => headWeights(d),
    });
    if (hs === 'long' || hs === 'braid') {
      const back = H.point([0, 0, 0], [0, -0.1, 0.99], off + 0.004);
      const w = hs === 'long' ? 0.075 : 0.02, low = hs === 'long' ? 1.36 : 1.2;
      loft(b, {
        segs: Math.max(4, L.ring >> 1), region: () => RG.hair, color: () => hairC, capEnd: true,
        rings: [
          { c: [0, back[1] + 0.02, back[2] - 0.03], rx: w, rzF: 0.02, rzB: 0.022 },
          { c: [0, back[1] - 0.07, back[2] - 0.01], rx: w * 0.95, rzF: 0.016, rzB: 0.02 },
          { c: [0, (back[1] + low) / 2 - 0.05, back[2] + 0.005], rx: w * 0.85, rzF: 0.014, rzB: 0.018 },
          { c: [0, low, back[2] + 0.02], rx: w * 0.6, rzF: 0.01, rzB: 0.014 },
        ],
        weights: (p) => { const t = sm(p[1], 1.42, 1.58); return [[B.head, t], [B.neck, (1 - t) * 0.5], [B.chest, (1 - t) * 0.5]]; },
      });
    }
    if (hs === 'bun' && L.face !== false) {
      const c = H.point([0, 0, 0], [0, 0.35, 0.94], off + 0.03);
      ellipsoid(b, { center: c, radii: [0.035, 0.03, 0.03], rows: 5, cols: 8, region: () => RG.hair, color: () => hairC, weights: () => [[B.head, 1]] });
    }
  }
  // ---------- beard shell
  const bs = look.beard.style, boff = TUNING.beardOffset[bs];
  if (boff && L.face !== false) {
    ellipsoid(b, {
      center: H.C, radii: H.R, rows: L.head[0], cols: L.head[1], mask: (d) => inBeard(d, bs),
      deform: (p, d) => {
        H.point(p, d, boff);
        if (bs === 'full' || bs === 'goatee') p[1] -= 0.014 * sm(-d[1], 0.6, 0.95) * sm(-d[2], 0, 0.6);
      },
      region: () => RG.hair, color: () => beardC, weights: (p, d) => headWeights(d),
    });
  }
  if (L.face === false) return;
  // ---------- eyes and lids
  const eyeY = restOf('lids')[1], eyeZ = restOf('lids')[2];
  for (const s of [1, -1]) {
    const ec = [s * H.eyeX, eyeY, eyeZ], iris = look.eyes % 4;
    const icx = 0.25 + 0.5 * (iris % 2), icy = 0.25 + 0.5 * ((iris / 2) | 0);
    ellipsoid(b, {
      center: ec, radii: [TUNING.eyeRadius, TUNING.eyeRadius, TUNING.eyeRadius], rows: L.eye[0], cols: L.eye[1],
      region: () => RG.eye, color: () => col.white, weights: () => [[B.head, 1]],
      uMap: (d) => (d[2] < 0 ? [icx + d[0] * 0.228, icy - d[1] * 0.228] : [icx + Math.sign(d[0] || 1) * 0.24, icy]),
    });
    if (L.lids) {
      const lr = TUNING.lidRadius;
      ellipsoid(b, { // upper lid, rotates shut with the lids bone
        center: ec, radii: [lr, lr * 1.02, lr], rows: 3, cols: 6, lat0: 0.5, lat1: 1.2, ph0: Math.PI - 1.45, ph1: Math.PI + 1.45,
        region: () => RG.skin, color: () => col.lid, weights: () => [[B.lids, 1]],
      });
      ellipsoid(b, {
        center: ec, radii: [lr, lr, lr], rows: 2, cols: 6, lat0: 1.95, lat1: 2.5, ph0: Math.PI - 1.35, ph1: Math.PI + 1.35,
        region: () => RG.skin, color: () => skin, weights: () => [[B.head, 1]],
      });
    }
    // brow
    if (L.brows) {
      const bw = 0.0034 * look.face.brow, by = H.C[1] + 0.036, bz = H.C[2] - 0.093;
      loft(b, {
        segs: 5, region: () => RG.hair, color: () => hairC, capStart: true, capEnd: true,
        rings: [0.012, 0.024, 0.038, 0.05].map((x, i) => ({
          c: [s * x * look.face.eyeGap, by + [0.0, 0.004, 0.005, 0.0][i] * look.face.brow, bz + [0, 0.002, 0.006, 0.014][i]],
          X: [0, 1, 0], Z: [0, 0, 1], rx: bw * [1, 1.1, 0.95, 0.6][i], rzF: 0.0028, rzB: 0.0028,
        })),
        weights: () => [[B.brows, 0.75], [B.head, 0.25]],
      });
    }
  }
  // ---------- nose
  const nz = look.face.noseLen, nw = look.face.nose, c = H.C;
  const nosePts = [[0, 0.025, -0.087], [0, 0.004, -0.094], [0, -0.016, -0.1], [0, -0.03, -0.106], [0, -0.04, -0.1], [0, -0.044, -0.091]];
  const noseR = [[0.007, 0.005], [0.0072, 0.006], [0.009, 0.007], [0.0115, 0.0085], [0.013, 0.006], [0.0105, 0.0035]];
  loft(b, {
    segs: L.nose, region: () => RG.skin, color: (p, u, v) => (v > 0.85 ? col.nostril : skin), capEnd: true,
    rings: nosePts.map((q, i) => {
      const pp = [c[0] + q[0], c[1] + q[1] * (0.9 + 0.1 * nz), c[2] + (q[2] + 0.085) * nz - 0.085];
      const nxt = nosePts[Math.min(5, i + 1)], prv = nosePts[Math.max(0, i - 1)];
      const t = [0, nxt[1] - prv[1], nxt[2] - prv[2]], tl = Math.hypot(t[1], t[2]) || 1;
      return { c: pp, X: [1, 0, 0], Z: [0, -t[2] / tl, t[1] / tl], rx: noseR[i][0] * nw, rzF: noseR[i][1], rzB: noseR[i][1] };
    }),
    weights: () => [[B.head, 1]],
  });
  // ---------- ears
  if (L.ears) {
    for (const s of [1, -1]) {
      const ec = [c[0] + s * (H.R[0] * 0.98), c[1] - 0.004, c[2] + 0.008];
      ellipsoid(b, {
        center: ec, radii: [0.011, 0.03, 0.019], rows: 4, cols: 8,
        deform: (p, d) => { p[0] += s * 0.008 * Math.max(0, -d[2]) * (1 - Math.abs(d[1])); p[2] += 0.006 * (d[1] + 1); },
        region: () => RG.skin, color: () => col.ear, weights: () => [[B.head, 1]],
      });
    }
  }
  // ---------- mustache
  if (['mustache', 'full', 'goatee', 'chops'].includes(bs) || (bs === 'short' && L.face)) {
    const thick = bs === 'short' ? 0.6 : 1;
    const pts = [[-0.034, -0.063, -0.072], [-0.02, -0.054, -0.083], [-0.007, -0.05, -0.088], [0.007, -0.05, -0.088], [0.02, -0.054, -0.083], [0.034, -0.063, -0.072]];
    loft(b, {
      segs: 5, region: () => RG.hair, color: () => beardC, capStart: true, capEnd: true,
      rings: pts.map((q, i) => ({ c: [c[0] + q[0], c[1] + q[1], c[2] + q[2]], X: [0, 1, 0], Z: [0, 0, 1], rx: 0.0055 * thick * (i === 0 || i === 5 ? 0.5 : 1), rzF: 0.0045 * thick, rzB: 0.0045 * thick })),
      weights: () => [[B.head, 1]],
    });
  }
}

/** Hat styles: crown and brim as lathes on the hat bone (plus a band). Returns nothing if hatless. */
export function buildHat(b, ctx) {
  const { look, L, C: col } = ctx, style = look.hat.style;
  if (!style || style === 'none') return;
  const hc = restOf('hat'), w = [[B.hat, 1]], segs = L.hat;
  const felt = col.hat, band = col.band, under = col.mul(col.hat, 0.7);
  if (style === 'bonnet') {
    const H = headShape(look);
    ellipsoid(b, {
      center: H.C, radii: H.R.map((r) => r * 1.12), rows: Math.max(6, L.head[0] >> 1), cols: Math.max(8, L.head[1] >> 1),
      mask: (d) => d[2] > -0.6 && d[1] > -0.5, region: () => RG.cotton, color: () => felt, weights: () => w,
    });
    return;
  }
  const S = {
    flat: { brim: 0.185, crownH: 0.092, crownR: 0.088, top: 0.08, curl: 0.004, droop: 0.012, dent: 0.012, pinch: 0.0 },
    cattleman: { brim: 0.178, crownH: 0.125, crownR: 0.09, top: 0.072, curl: 0.04, droop: 0.012, dent: 0.03, pinch: 0.012 },
    bowler: { brim: 0.125, crownH: 0.115, crownR: 0.088, top: 0.0, curl: 0.022, droop: 0, dent: 0, pinch: 0, dome: true },
    gambler: { brim: 0.205, crownH: 0.075, crownR: 0.09, top: 0.085, curl: 0.006, droop: 0, dent: 0.004, pinch: 0 },
    slouch: { brim: 0.195, crownH: 0.1, crownR: 0.09, top: 0.07, curl: -0.006, droop: 0.04, dent: 0.014, pinch: 0.004, round: true },
  }[style] || null;
  if (!S) return;
  const y0 = -0.04, sx = 1, sz = 1.12;
  // brim: closed profile inner-bottom → outer-bottom → outer-top → inner-top → inner-bottom
  const t = 0.0045, rin = S.crownR - 0.004;
  const brimDeform = (p, a, i, r) => {
    const k = Math.max(0, (r - rin) / (S.brim - rin));
    const side = Math.cos(a) ** 2, fb = Math.sin(a) ** 2;
    p[1] += k * k * (S.curl * side * 1.0 - S.droop * fb) + (style === 'cattleman' ? -0.008 * k * Math.max(0, Math.sin(a)) : 0);
  };
  lathe(b, {
    center: [hc[0], hc[1] + y0, hc[2]], segs, sx, sz,
    profile: [[rin, -t], [(rin + S.brim) / 2, -t * 0.8], [S.brim, -t * 0.3], [S.brim + 0.003, 0], [S.brim, t * 0.3], [(rin + S.brim) / 2, t * 0.8], [rin, t], [rin, -t]],
    deform: brimDeform, region: () => RG.felt, color: (p, u, v, i) => (i <= 2 ? under : felt), weights: () => w,
  });
  // crown: from the brim up to the top centre
  const H = S.crownH, R0 = S.crownR, Rt = S.dome ? 0.02 : S.crownR * 0.93;
  const prof = S.dome
    ? [[R0, 0], [R0 * 1.02, H * 0.25], [R0 * 0.98, H * 0.55], [R0 * 0.82, H * 0.8], [R0 * 0.5, H * 0.96], [0.001, H]]
    : [[R0, 0], [R0 * 0.99, H * 0.3], [R0 * 0.965, H * 0.7], [Rt, H * 0.95], [Rt * 0.75, H * (S.round ? 1.02 : 1)], [Rt * 0.35, H * (S.round ? 1.03 : 1.0)], [0.001, H * 1.0]];
  lathe(b, {
    center: [hc[0], hc[1] + y0 + t, hc[2]], segs, sx, sz: 1.1, profile: prof,
    deform: (p, a, i, r, y) => {
      const hy = y / H, front = Math.max(0, Math.sin(a));
      if (S.dent) p[1] -= S.dent * Math.exp(-((p[0] - hc[0]) ** 2) / (2 * 0.028 ** 2)) * Math.max(0, hy - 0.6) / 0.4 * (r < R0 * 0.9 ? 1 : 0.4);
      if (S.pinch) p[0] -= Math.sign(p[0] - hc[0]) * S.pinch * front * front * sm(hy, 0.4, 0.95);
    },
    region: () => RG.felt, color: (p, u, v, i) => (i === 0 ? band : felt), weights: () => w,
  });
  // hat band
  if (L.face !== false) lathe(b, {
    center: [hc[0], hc[1] + y0 + t, hc[2]], segs, sx: 1.005, sz: 1.105,
    profile: [[R0 + 0.0015, 0.0], [R0 + 0.0025, 0.012], [R0 * 0.993 + 0.0015, 0.024]],
    region: () => RG.leather, color: () => band, weights: () => w,
  });
}
