import { WORLD } from '../../data/world.js';
import { sampleCatmullRom, segmentDistance, nearestSample, sampleArray, smoothProfile } from './Splines.js';
import { N, SPACING, NONE, FAR, toI, gx, gz, bilinear } from './Grid.js';
import { sstep, lerp } from './HeightField.js';

/**
 * Carves the river, Mirror Lake, flat location pads and the roads into the height grid (GAME_BIBLE §5).
 * Order: river → lake → pads → roads → river bed and lake basin again (so roads never dam the water).
 * Pure: no Three.js. Every function mutates the grid arrays it is given.
 */
export const TUNING = {
  riverSpacing: 4, meander: 24, meanderWavelength: 170, meanderPin: 110, riverMargin: 2.5, riverMarginLow: 0.3, waterfallDrop: 30, waterfallRun: 8,
  riverCaps: { k2: 14, k3: 2.6, k4: 2.0, k5: 1.6, k6: 1.2, k7: 0.7 },
  mountainHalfWidth: 3.5, gorgeHalfWidth: 5, valleyHalfWidth: 8, lowerHalfWidth: 11, mouthHalfWidth: 16,
  mountainDepth: 0.8, valleyDepth: 1.7, mouthFade: 180,
  mountainBank: [0.95, 0.012], valleyBank: [0.16, 0.004], mountainReach: 150, valleyReach: 90,
  fordDepth: 0.35, fordHalfLength: 26, fordBank: 0.07,
  lakeDepth: 7, lakeShape: 0.16, lakeBank: [0.12, 0.006], lakeReach: 120, lakeBelowShore: 1.4,
  padFlat: 0.7, landmarkFlat: 0.6, padBlendMin: 12, padBlend: 0.6, padRiverClear: 2, padRiverFade: 16,
  roadHalfWidth: 3, roadShoulder: 7, trailHalfWidth: 1.75, trailShoulder: 4,
  roadSmooth: 20, trailSmooth: 10, roadSmoothPasses: 4, roadGrade: 0.16, trailGrade: 0.28, gradeSlack: 1.25,
  cutSlope: 1.6, maxCutReach: 40, bridgeClearance: 1.8, bridgeSearch: 60, fordRamp: 45, fordFlat: 16,
  coarseSpacing: 32,
};

const K = WORLD.river;

// ---------------------------------------------------------------- river
/** Builds the river's centreline profile (water level, width, depth, bank shape) from the current heights. */
export function buildRiver(heights, noise = null, T = TUNING) {
  const sp = sampleCatmullRom(K, T.riverSpacing), n = sp.xs.length, { knots } = sp;
  if (noise && T.meander > 0) meander(sp, knots, noise, T);
  const level = new Float32Array(n), halfWidth = new Float32Array(n), depth = new Float32Array(n);
  const bank1 = new Float32Array(n), bank2 = new Float32Array(n), reach = new Float32Array(n);
  const sWF = knots[1], len = sp.length, caps = T.riverCaps;
  const capKnots = [[knots[2], caps.k2], [knots[3], caps.k3], [knots[4], caps.k4], [knots[5], caps.k5], [knots[6], caps.k6], [knots[7], caps.k7]];
  let prev = Infinity, top = 0, bottom = 0;
  for (let i = 0; i < n; i++) {
    const s = sp.s[i], nat = bilinear(heights, sp.xs[i], sp.zs[i]);
    const vv = sstep(knots[2], knots[3], s);
    let L = Math.min(prev, nat - lerp(T.riverMargin, T.riverMarginLow, vv));
    if (s <= sWF) top = L;
    else if (s < sWF + T.waterfallRun) L = Math.min(L, lerp(top, top - T.waterfallDrop, (s - sWF) / T.waterfallRun));
    else {
      if (!bottom) bottom = Math.min(L, top - T.waterfallDrop);
      let cap = bottom, ps = sWF + T.waterfallRun, pv = bottom;
      for (const [ks, kv] of capKnots) { if (s <= ks) { cap = lerp(pv, kv, (s - ps) / (ks - ps)); break; } ps = ks; pv = kv; cap = kv; }
      L = Math.min(L, cap);
    }
    level[i] = prev = L;
    const v = sstep(knots[2], knots[3], s);
    let w = s < sWF ? T.mountainHalfWidth : lerp(T.gorgeHalfWidth, T.valleyHalfWidth, v);
    w = lerp(w, T.lowerHalfWidth, sstep(knots[4], knots[6], s));
    w = lerp(w, T.mouthHalfWidth, sstep(len - 260, len, s));
    halfWidth[i] = w;
    depth[i] = lerp(T.mountainDepth, T.valleyDepth, s < sWF ? 0 : v) * (1 - sstep(len - T.mouthFade, len - 20, s));
    bank1[i] = lerp(T.mountainBank[0], T.valleyBank[0], v); bank2[i] = lerp(T.mountainBank[1], T.valleyBank[1], v);
    reach[i] = lerp(T.mountainReach, T.valleyReach, v) + w;
  }
  for (let i = 0; i < n; i++) depth[i] = Math.min(depth[i], Math.max(0, level[i])); // the bed never dips below sea level
  // The Saltmesa road's ford: shallow water and gentle banks.
  const fordRoad = WORLD.roads.find((r) => r.ford);
  let ford = null;
  if (fordRoad) {
    const fi = nearestSample(sp.xs, sp.zs, fordRoad.ford[0], fordRoad.ford[1]), sF = sp.s[fi];
    for (let i = 0; i < n; i++) {
      const w = 1 - sstep(T.fordHalfLength * 0.55, T.fordHalfLength, Math.abs(sp.s[i] - sF));
      if (w <= 0) continue;
      depth[i] = lerp(depth[i], T.fordDepth, w); bank1[i] = lerp(bank1[i], T.fordBank, w); bank2[i] = lerp(bank2[i], 0.001, w);
    }
    ford = { index: fi, x: sp.xs[fi], z: sp.zs[fi], level: level[fi] };
  }
  const wfIndex = Math.round(sWF / (len / (n - 1)));
  return {
    xs: Float32Array.from(sp.xs), zs: Float32Array.from(sp.zs), s: Float32Array.from(sp.s), length: len, knots,
    level, halfWidth, depth, bank1, bank2, reach, ford,
    waterfall: { x: sp.xs[wfIndex], z: sp.zs[wfIndex], top, bottom, index: wfIndex },
  };
}

/**
 * Gentle meanders: offsets the centreline sideways with low-frequency noise, pinned at the waterfall,
 * the bridge, the ford and both ends so those spots stay exactly where world.js puts them.
 */
function meander(sp, knots, noise, T) {
  const n = sp.xs.length, pins = [0, knots[1], sp.length];
  for (const r of WORLD.roads) for (const p of [r.bridge, r.ford]) if (p) pins.push(sp.s[nearestSample(sp.xs, sp.zs, p[0], p[1])]);
  const ox = new Float64Array(n), oz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), tx = sp.xs[b] - sp.xs[a], tz = sp.zs[b] - sp.zs[a], l = Math.hypot(tx, tz) || 1;
    let taper = 1;
    for (const ps of pins) taper *= sstep(T.meanderPin * 0.3, T.meanderPin, Math.abs(sp.s[i] - ps));
    const o = T.meander * taper * noise.noise2(sp.s[i] / T.meanderWavelength, 7.7);
    ox[i] = -tz / l * o; oz[i] = tx / l * o;
  }
  for (let i = 0; i < n; i++) { sp.xs[i] += ox[i]; sp.zs[i] += oz[i]; }
}

/** Rasterizes distance-to-river and the nearest centreline position (fractional sample index) for every cell. */
export function rasterizeRiver(river, riverDist, riverIdx) {
  const { xs, zs, reach } = river, n = xs.length;
  for (let s = 0; s < n - 1; s++) {
    const ax = xs[s], az = zs[s], bx = xs[s + 1], bz = zs[s + 1], R = Math.max(reach[s], reach[s + 1]);
    const i0 = Math.max(0, Math.ceil(toI(Math.min(ax, bx) - R))), i1 = Math.min(N - 1, Math.floor(toI(Math.max(ax, bx) + R)));
    const j0 = Math.max(0, Math.ceil(toI(Math.min(az, bz) - R))), j1 = Math.min(N - 1, Math.floor(toI(Math.max(az, bz) + R)));
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
    for (let j = j0; j <= j1; j++) {
      const z = gz(j), row = j * N;
      for (let i = i0; i <= i1; i++) {
        const x = gx(i);
        let t = ((x - ax) * dx + (z - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + dx * t - x, qz = az + dz * t - z, d2 = qx * qx + qz * qz, k = row + i;
        if (d2 < riverDist[k] * riverDist[k] && d2 < R * R) { riverDist[k] = Math.sqrt(d2); riverIdx[k] = s + t; }
      }
    }
  }
}

/** River surface target height at a cell, or Infinity when the cell is out of the river's reach. */
function riverTarget(river, f, d) {
  const w = sampleArray(river.halfWidth, f), L = sampleArray(river.level, f);
  if (d > sampleArray(river.reach, f)) return Infinity;
  if (d < w) { const q = d / w; return L - sampleArray(river.depth, f) * (1 - q * q); }
  const e = d - w;
  return L + sampleArray(river.bank1, f) * e + sampleArray(river.bank2, f) * e * e;
}

/** Cuts the channel and banks (min with the current height) and records the water surface. */
export function carveRiver(heights, waterY, river, riverDist, riverIdx, channelOnly = false) {
  for (let k = 0; k < heights.length; k++) {
    const f = riverIdx[k];
    if (f < 0) continue;
    const d = riverDist[k];
    if (channelOnly && d >= sampleArray(river.halfWidth, f)) continue;
    const target = riverTarget(river, f, d);
    if (target < heights[k]) heights[k] = target;
    if (!channelOnly && d < sampleArray(river.halfWidth, f) + 2) {
      const L = sampleArray(river.level, f);
      if (L > heights[k] + 0.01) waterY[k] = L;
    }
  }
}

// ---------------------------------------------------------------- lake
export function carveLake(heights, waterY, lakeEdge, noise, T = TUNING) {
  const loc = WORLD.locations.mirrorLake, r = loc.radius;
  let sum = 0, min = Infinity;
  for (let a = 0; a < 24; a++) {
    const ang = (a / 24) * Math.PI * 2, h = bilinear(heights, loc.x + Math.cos(ang) * r * 1.3, loc.z + Math.sin(ang) * r * 1.3);
    sum += h; min = Math.min(min, h);
  }
  const level = Math.min(sum / 24 - T.lakeBelowShore, min + 0.4);
  const reach = r * (1 + T.lakeShape) + T.lakeReach;
  const edgeAt = (x, z) => {
    const ang = Math.atan2(z - loc.z, x - loc.x);
    return r * (1 + T.lakeShape * noise.noise2(Math.cos(ang) * 1.4 + 7, Math.sin(ang) * 1.4 - 3));
  };
  const i0 = Math.max(0, Math.ceil(toI(loc.x - reach))), i1 = Math.min(N - 1, Math.floor(toI(loc.x + reach)));
  const j0 = Math.max(0, Math.ceil(toI(loc.z - reach))), j1 = Math.min(N - 1, Math.floor(toI(loc.z + reach)));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = gx(i), z = gz(j), k = j * N + i, d = Math.hypot(x - loc.x, z - loc.z);
    if (d > reach) continue;
    const re = edgeAt(x, z), e = d - re;
    lakeEdge[k] = e;
    let target;
    if (e < 0) { const q = d / re; target = level - T.lakeDepth * Math.pow(1 - q * q, 0.8); }
    else target = level + T.lakeBank[0] * e + T.lakeBank[1] * e * e;
    if (target < heights[k]) heights[k] = target;
    if (e >= 0 && e < re * 0.25 && heights[k] < level + 0.3) heights[k] = level + 0.3 + e * 0.04; // a rim, so the water never spills
    if (e < 2 && level > heights[k] + 0.01) waterY[k] = level;
  }
  return { x: loc.x, z: loc.z, radius: r, level, edgeAt };
}

export function reapplyLake(heights, lakeEdge, lake, T = TUNING) {
  for (let k = 0; k < heights.length; k++) {
    if (!(lakeEdge[k] < 0)) continue;
    const i = k % N, j = (k - i) / N, x = gx(i), z = gz(j);
    const d = Math.hypot(x - lake.x, z - lake.z), re = lake.edgeAt(x, z), q = d / re;
    const target = lake.level - T.lakeDepth * Math.pow(Math.max(0, 1 - q * q), 0.8);
    if (target < heights[k]) heights[k] = target;
  }
}

// ---------------------------------------------------------------- pads
/** Levels a pad under every location so buildings sit flat (GAME_BIBLE §5). */
export function carvePads(heights, river, riverDist, riverIdx, lakeEdge, padMask = null, T = TUNING) {
  const pads = [];
  for (const [id, loc] of Object.entries(WORLD.locations)) {
    if (loc.type === 'lake') continue;
    const rf = loc.radius * (loc.type === 'landmark' ? T.landmarkFlat : T.padFlat);
    const rb = rf + Math.max(T.padBlendMin, loc.radius * T.padBlend);
    const samples = [];
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) samples.push(bilinear(heights, loc.x + a * rf * 0.3, loc.z + b * rf * 0.3));
    samples.sort((p, q) => p - q);
    const y = loc.type === 'hideout' ? samples[3] : samples.reduce((s, v) => s + v, 0) / samples.length;
    const i0 = Math.max(0, Math.ceil(toI(loc.x - rb))), i1 = Math.min(N - 1, Math.floor(toI(loc.x + rb)));
    const j0 = Math.max(0, Math.ceil(toI(loc.z - rb))), j1 = Math.min(N - 1, Math.floor(toI(loc.z + rb)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * N + i, d = Math.hypot(gx(i) - loc.x, gz(j) - loc.z);
      if (d >= rb) continue;
      let w = 1 - sstep(rf, rb, d);
      const f = riverIdx[k];
      if (f >= 0) w *= sstep(T.padRiverClear, T.padRiverFade, riverDist[k] - sampleArray(river.halfWidth, f));
      w *= sstep(2, 14, lakeEdge[k]);
      if (w > 0) { heights[k] = lerp(heights[k], y, w); if (padMask && d < rf && w > padMask[k]) padMask[k] = w; }
    }
    pads.push({ id, x: loc.x, z: loc.z, y, flatRadius: rf, radius: rb });
  }
  return pads;
}

// ---------------------------------------------------------------- roads
/** Road profiles (smoothed, with bridge decks and a ford), then cut-and-fill into the grid. */
export function buildRoads(heights, river, riverDist, riverIdx, lakeEdge, roadDist, roadY, roadKind, pads = [], lake = null, padMask = null, T = TUNING) {
  const paths = [], bridges = [], fords = [];
  const riverAt = (x, z) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < river.xs.length; i++) { const d = (river.xs[i] - x) ** 2 + (river.zs[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    return { i: best, d: Math.sqrt(bd), w: river.halfWidth[best], level: river.level[best] };
  };
  for (const def of WORLD.roads) {
    const trail = !!def.trail, sp = sampleCatmullRom(def.points, SPACING), n = sp.xs.length;
    const h = new Float64Array(n), locked = new Uint8Array(n), kind = new Uint8Array(n).fill(trail ? 2 : 1);
    for (let i = 0; i < n; i++) {
      h[i] = bilinear(heights, sp.xs[i], sp.zs[i]);
      for (const p of pads) if (Math.hypot(sp.xs[i] - p.x, sp.zs[i] - p.z) < p.flatRadius * 0.9) { h[i] = p.y; locked[i] = 1; break; }
      if (lake && bilinear(lakeEdge, sp.xs[i], sp.zs[i]) < 3) { h[i] = lake.level + 0.15; locked[i] = 1; } // trails end at the waterline
    }
    if (def.bridge) {
      let a = -1, b = -1, lvl = 0;
      for (let i = 0; i < n; i++) {
        if (Math.hypot(sp.xs[i] - def.bridge[0], sp.zs[i] - def.bridge[1]) > T.bridgeSearch) continue;
        const r = riverAt(sp.xs[i], sp.zs[i]);
        if (r.d < r.w + 4) { if (a < 0) a = i; b = i; lvl = Math.max(lvl, r.level); }
      }
      if (a > 0 && b < n - 1) {
        const deck = Math.max((h[a - 1] + h[b + 1]) / 2, lvl + T.bridgeClearance);
        for (let i = a; i <= b; i++) { h[i] = deck; locked[i] = 1; kind[i] = 3; }
        const m = (a + b) >> 1, dx = sp.xs[b] - sp.xs[a], dz = sp.zs[b] - sp.zs[a], l = Math.hypot(dx, dz) || 1;
        bridges.push({ roadId: def.id, x: sp.xs[m], z: sp.zs[m], y: deck, dirX: dx / l, dirZ: dz / l, length: l + 2 * SPACING, waterLevel: lvl });
      }
    }
    if (def.ford && river.ford) {
      const fy = river.ford.level + 0.12;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(sp.xs[i] - def.ford[0], sp.zs[i] - def.ford[1]);
        const w = 1 - sstep(T.fordFlat, T.fordRamp, d);
        if (w > 0) { h[i] = lerp(h[i], fy, w); if (w > 0.97) locked[i] = 1; }
      }
      fords.push({ roadId: def.id, x: river.ford.x, z: river.ford.z, y: river.ford.level });
    }
    smoothProfile(h, trail ? T.trailSmooth : T.roadSmooth, T.roadSmoothPasses, locked);
    limitGrade(h, locked, SPACING, trail ? T.trailGrade : T.roadGrade, T.gradeSlack);
    smoothProfile(h, 3, 1, locked);
    const pts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pts[i * 3] = sp.xs[i]; pts[i * 3 + 1] = h[i]; pts[i * 3 + 2] = sp.zs[i]; }
    paths.push({ id: def.id, from: def.from, to: def.to, trail, halfWidth: trail ? T.trailHalfWidth : T.roadHalfWidth, length: sp.length, points: pts });
    // Rasterize nearest road per cell.
    const half = trail ? T.trailHalfWidth : T.roadHalfWidth, R = half + T.maxCutReach;
    for (let s = 0; s < n - 1; s++) {
      const ax = sp.xs[s], az = sp.zs[s], bx = sp.xs[s + 1], bz = sp.zs[s + 1];
      const i0 = Math.max(0, Math.ceil(toI(Math.min(ax, bx) - R))), i1 = Math.min(N - 1, Math.floor(toI(Math.max(ax, bx) + R)));
      const j0 = Math.max(0, Math.ceil(toI(Math.min(az, bz) - R))), j1 = Math.min(N - 1, Math.floor(toI(Math.max(az, bz) + R)));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * N + i, r = segmentDistance(gx(i), gz(j), ax, az, bx, bz);
        if (r.d < R && r.d < roadDist[k]) { roadDist[k] = r.d; roadY[k] = h[s] + (h[s + 1] - h[s]) * r.t; roadKind[k] = r.t < 0.5 ? kind[s] : kind[s + 1]; }
      }
    }
  }
  // Cut and fill.
  for (let k = 0; k < heights.length; k++) {
    const kd = roadKind[k];
    if (!kd) continue;
    const trail = kd === 2, half = trail ? T.trailHalfWidth : T.roadHalfWidth;
    // Shoulders widen with the cut or fill depth so cuttings and embankments keep a sane slope.
    const R = half + Math.min(T.maxCutReach, Math.max(trail ? T.trailShoulder : T.roadShoulder, Math.abs(roadY[k] - heights[k]) * T.cutSlope));
    const d = roadDist[k];
    if (d >= R) continue;
    if (lakeEdge[k] < 1) continue;
    const f = riverIdx[k];
    if (kd === 3 && f >= 0 && riverDist[k] < sampleArray(river.halfWidth, f) + 1.5) continue; // leave the channel open under bridges
    let w = d <= half ? 1 : 1 - sstep(half, R, d);
    if (padMask && d > half) w *= 1 - padMask[k]; // a road passing by never tilts a location's pad
    heights[k] = lerp(heights[k], roadY[k], w);
  }
  return { paths, bridges, fords };
}

/**
 * Caps the grade between consecutive samples. Spans between locked samples that need more climb than
 * `grade` allows get just enough extra (×slack) to connect, so the climb is spread evenly instead of bunched.
 */
export function limitGrade(h, locked, ds, grade, slack = 1.25) {
  const n = h.length, g = new Float64Array(n).fill(grade);
  let prev = -1;
  for (let i = 0; i < n; i++) {
    if (!locked[i] && i !== n - 1 && i !== 0) continue;
    if (prev >= 0 && i > prev) { const need = Math.abs(h[i] - h[prev]) / ((i - prev) * ds) * slack; for (let k = prev; k <= i; k++) g[k] = Math.max(grade, need); }
    prev = i;
  }
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 1; i < n; i++) if (!locked[i]) { const m = g[i] * ds; h[i] = Math.min(h[i - 1] + m, Math.max(h[i - 1] - m, h[i])); }
    for (let i = n - 2; i >= 0; i--) if (!locked[i]) { const m = g[i] * ds; h[i] = Math.min(h[i + 1] + m, Math.max(h[i + 1] - m, h[i])); }
  }
  return h;
}

/** Coarse (32 m) distance-to-nearest-road field for queries far from any road. */
export function coarseRoadDistance(paths, T = TUNING) {
  const cs = T.coarseSpacing, cn = Math.round(2048 / cs) + 1, out = new Float32Array(cn * cn).fill(FAR);
  const segs = [];
  for (const p of paths) {
    const pts = p.points, step = 4; // every 8 m
    for (let i = 0; i + step < pts.length / 3; i += step) segs.push(pts[i * 3], pts[i * 3 + 2], pts[(i + step) * 3], pts[(i + step) * 3 + 2]);
    const last = pts.length / 3 - 1;
    segs.push(pts[Math.max(0, last - step) * 3], pts[Math.max(0, last - step) * 3 + 2], pts[last * 3], pts[last * 3 + 2]);
  }
  for (let j = 0; j < cn; j++) for (let i = 0; i < cn; i++) {
    const x = -1024 + i * cs, z = -1024 + j * cs;
    let best = FAR;
    for (let s = 0; s < segs.length; s += 4) { const d = segmentDistance(x, z, segs[s], segs[s + 1], segs[s + 2], segs[s + 3]).d; if (d < best) best = d; }
    out[j * cn + i] = best;
  }
  return { n: cn, spacing: cs, dist: out };
}

export { NONE, FAR };
