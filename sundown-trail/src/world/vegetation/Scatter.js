import { SimplexNoise, fbm2 } from '../../core/utils/noise.js';
import { mulberry32 } from '../../core/utils/rng.js';
import { WORLD, WORLD_SEED } from '../../data/world.js';
import { N, SPACING, ORIGIN, NONE, FAR, bilinear, nearest, triangleHeight } from '../terrain/Grid.js';
import { sampleArray } from '../terrain/Splines.js';
import { TUNING as CARVE } from '../terrain/Carving.js';

/**
 * Seeded Poisson-disk scatter of trees, shrubs and rocks, chunk by chunk (128 m, the terrain chunk grid).
 * Pure (no Three.js): the same seed always gives the same forest. Each chunk gets, per species, a Float32Array of
 * instances [x, y, z, rotY, scale, r, g, b] (STRIDE floats each). Roads, water, river banks and location pads stay clear.
 */
export const STRIDE = 8;
export const CHUNK_M = 128;
export const CHUNKS = 16;
export const TUNING = {
  density: 1, treeSpacing: 5.5, shrubSpacing: 2.6, rockSpacing: 7, tries: 10,
  forestScale: 260, groveScale: 140, roadClearTree: 4.5, roadClearSmall: 1.2, padClear: 6, wall: 990,
};
const BIOME = { valley: 0, riverbank: 1, highland: 2, snow: 3, desert: 4 };

/** Bridson Poisson-disk sampling in a square [x0, x0+size) × [z0, z0+size). */
export function poisson(x0, z0, size, minDist, rand, tries = 10) {
  const cell = minDist / Math.SQRT2, gw = Math.ceil(size / cell), grid = new Int32Array(gw * gw).fill(-1), pts = [], active = [];
  const add = (x, z) => { pts.push(x, z); const i = pts.length / 2 - 1; grid[Math.floor((z - z0) / cell) * gw + Math.floor((x - x0) / cell)] = i; active.push(i); };
  add(x0 + rand() * size, z0 + rand() * size);
  const d2 = minDist * minDist;
  while (active.length) {
    const ai = Math.floor(rand() * active.length), pi = active[ai], px = pts[pi * 2], pz = pts[pi * 2 + 1];
    let found = false;
    for (let t = 0; t < tries; t++) {
      const a = rand() * Math.PI * 2, r = minDist * (1 + rand()), x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      if (x < x0 || z < z0 || x >= x0 + size || z >= z0 + size) continue;
      const gx = Math.floor((x - x0) / cell), gz = Math.floor((z - z0) / cell);
      let ok = true;
      for (let j = Math.max(0, gz - 2); j <= Math.min(gw - 1, gz + 2) && ok; j++) for (let i = Math.max(0, gx - 2); i <= Math.min(gw - 1, gx + 2); i++) {
        const q = grid[j * gw + i]; if (q < 0) continue;
        const dx = pts[q * 2] - x, dz = pts[q * 2 + 1] - z; if (dx * dx + dz * dz < d2) { ok = false; break; }
      }
      if (ok) { add(x, z); found = true; break; }
    }
    if (!found) { active[ai] = active[active.length - 1]; active.pop(); }
  }
  return pts;
}

/**
 * @param {object} data terrain world data (heights, biome, splat0, splat1, waterY, roadDist, riverDist, riverIdx, lakeEdge, river, pads)
 * @param {object[]} species SPECIES table (ids, size, tint)
 */
export function createScatter(data, species, T = TUNING) {
  const noise = new SimplexNoise(WORLD_SEED ^ 0x7ee5), ids = Object.fromEntries(species.map((s, i) => [s.id, i]));
  const pads = data.pads || [];
  const sample = (x, z) => {
    const k = Math.round((z - ORIGIN) / SPACING) * N + Math.round((x - ORIGIN) / SPACING);
    return k < 0 || k >= N * N ? -1 : k;
  };
  const slope = (x, z) => { // normal.y
    const hx = triangleHeight(data.heights, x + 1, z) - triangleHeight(data.heights, x - 1, z), hz = triangleHeight(data.heights, x, z + 1) - triangleHeight(data.heights, x, z - 1);
    return 2 / Math.sqrt(4 + hx * hx + hz * hz);
  };
  const nearWater = (x, z, r) => {
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) { const k = sample(x + dx, z + dz); if (k >= 0 && data.waterY[k] !== NONE) return true; }
    return false;
  };
  const padDist = (x, z) => { let best = Infinity; for (const p of pads) { const d = Math.hypot(x - p.x, z - p.z) - p.radius; if (d < best) best = d; } return best; };
  /** Distance from the water's edge (negative inside), river or lake. */
  const shore = (x, z) => {
    const k = sample(x, z); if (k < 0) return Infinity;
    const f = data.riverIdx[k], rd = f >= 0 ? data.riverDist[k] - sampleArray(data.river.halfWidth, f) : Infinity;
    return Math.min(rd, data.lakeEdge[k]);
  };

  /** Pick a species for a tree-layer point, or -1. */
  function tree(x, z, k, R) {
    const b = data.biome[k], ny = slope(x, z), h = data.heights[k], snow = data.splat1[k * 4 + 2] / 255, rockW = data.splat1[k * 4] / 255;
    const forest = fbm2(noise, x / T.forestScale + 3.3, z / T.forestScale - 7.1, 3), grove = fbm2(noise, x / T.groveScale - 11, z / T.groveScale + 5, 3);
    let p = 0, pick = -1;
    if (b === BIOME.highland || (b === BIOME.snow && h < WORLD.snowLine + 45)) {
      p = (0.4 + 0.6 * smooth(-0.3, 0.2, forest)) * (ny > 0.74 ? 1 : 0) * (1 - snow * 0.75) * (1 - rockW * 0.8);
      pick = R() < 0.04 ? ids.dead : [ids.pine1, ids.pine2, ids.pine3][Math.floor(R() * 3)];
      if (h < 95 && grove > 0.25 && R() < 0.5) pick = ids.aspen; // aspen stands in the lower foothills
    } else if (b === BIOME.valley || b === BIOME.riverbank) {
      const riverside = b === BIOME.riverbank;
      p = (smooth(0.3, 0.65, grove) * 0.75 + 0.025 + (riverside ? 0.18 : 0)) * (ny > 0.84 ? 1 : 0) * (1 - rockW);
      const aspenZone = (z < -250 || riverside) && grove > 0.4;
      pick = aspenZone && R() < 0.6 ? ids.aspen : [ids.oak1, ids.oak2, ids.oak3][Math.floor(R() * 3)];
      if (R() < 0.03) pick = ids.dead;
    } else if (b === BIOME.desert) {
      const salt = data.splat1[k * 4 + 3] / 255;
      p = (0.09 + 0.05 * smooth(0, 0.5, forest)) * (ny > 0.9 ? 1 : 0) * (1 - salt);
      pick = R() < 0.18 ? ids.dead : ids.saguaro;
    }
    return R() < p * T.density ? pick : -1;
  }
  function shrub(x, z, k, R) {
    const b = data.biome[k], ny = slope(x, z), grass = data.splat0[k * 4] / 255, dry = data.splat0[k * 4 + 1] / 255, rockW = data.splat1[k * 4] / 255;
    const sh = shore(x, z);
    if (sh > -0.5 && sh < 3.5 && b !== BIOME.desert) return R() < 0.85 * T.density ? ids.reed : -1;
    if (ny < 0.7) return -1;
    if (b === BIOME.desert) { const salt = data.splat1[k * 4 + 3] / 255; if (salt > 0.3) return -1; const r = R(); return r < 0.32 * T.density ? ids.sage : r < 0.42 * T.density ? ids.pear : -1; }
    if (b === BIOME.snow) return -1;
    const p = (grass + dry) * 0.35 * (1 - rockW);
    if (R() >= p * T.density) return -1;
    return dry > grass * 1.3 && R() < 0.3 ? ids.sage : ids.tuft;
  }
  function rock(x, z, k, R) {
    const b = data.biome[k], rockW = data.splat1[k * 4] / 255, snow = data.splat1[k * 4 + 2] / 255;
    const p = 0.025 + rockW * 0.45 + (b === BIOME.desert ? 0.06 : 0) + (b === BIOME.highland ? 0.05 : 0) - snow * 0.3;
    if (R() >= p * T.density) return -1;
    return [ids.rock1, ids.rock2, ids.rock3, ids.rock4, ids.rock5][Math.floor(R() * 5)];
  }
  function smooth(a, b, v) { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); }

  /** Rock tint by region: granite grey in the highlands, red in Saltmesa, brown in the valley. */
  function rockTint(b, out) {
    if (b === BIOME.desert) { out[0] = 1.15; out[1] = 0.78; out[2] = 0.6; }
    else if (b === BIOME.highland || b === BIOME.snow) { out[0] = 0.92; out[1] = 0.94; out[2] = 0.98; }
    else { out[0] = 1.02; out[1] = 0.94; out[2] = 0.82; }
  }

  /**
   * Scatter one chunk. `which`: 'trees' (the tree layer, needed far away for impostors), 'small' (shrubs and rocks,
   * only needed near the camera) or 'all'. @returns {{ cx, cz, x0, z0, lists: Float32Array[] }} lists per species index
   */
  function chunk(cx, cz, which = 'all') {
    const x0 = ORIGIN + cx * CHUNK_M, z0 = ORIGIN + cz * CHUNK_M, seed = (WORLD_SEED * 73856093) ^ (cx * 19349663) ^ (cz * 83492791);
    const out = species.map(() => []), tint = [1, 1, 1];
    const layer = (spacing, pick, clearRoad, clearPad, sizeK, layerSeed) => {
      const R = mulberry32((seed ^ layerSeed) >>> 0), pts = poisson(x0, z0, CHUNK_M, spacing / Math.sqrt(T.density), R, T.tries);
      for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i], z = pts[i + 1];
        if (Math.abs(x) > T.wall || Math.abs(z) > T.wall) continue;
        const k = sample(x, z); if (k < 0) continue;
        const sp = pick(x, z, k, R); if (sp < 0) continue;
        const s = species[sp], isReed = sp === ids.reed;
        if (!isReed && nearWater(x, z, s.collider === 'trunk' ? 4 : 2)) continue;
        const rd = data.roadDist[k]; if (rd < FAR * 0.5 && rd < CARVE.roadHalfWidth + clearRoad) continue;
        if (padDist(x, z) < clearPad) continue;
        const scale = s.size[0] + (s.size[1] - s.size[0]) * Math.pow(R(), 1.6) * sizeK;
        const y = triangleHeight(data.heights, x, z) - (s.collider === 'rock' ? 0.12 * scale : 0.08);
        if (s.collider === 'rock') rockTint(data.biome[k], tint); else { tint[0] = tint[1] = tint[2] = 1; }
        const t = R(), [lo, hi] = s.tint;
        out[sp].push(x, y, z, R() * Math.PI * 2, scale,
          tint[0] * (lo[0] + (hi[0] - lo[0]) * t), tint[1] * (lo[1] + (hi[1] - lo[1]) * t), tint[2] * (lo[2] + (hi[2] - lo[2]) * t));
      }
    };
    if (which !== 'small') layer(T.treeSpacing, tree, T.roadClearTree, T.padClear, 1, 0x1111);
    if (which !== 'trees') { layer(T.shrubSpacing, shrub, T.roadClearSmall, 0, 1, 0x2222); layer(T.rockSpacing, rock, T.roadClearSmall + 1, 2, 1, 0x3333); }
    return { cx, cz, x0, z0, lists: out.map((a) => Float32Array.from(a)) };
  }

  return { chunk, shore, slope };
}

/** All chunks, as a generator so the caller can spread the work over frames. */
export function* scatterWorld(data, species, T = TUNING, which = 'all') {
  const s = createScatter(data, species, T), chunks = [];
  for (let cz = 0; cz < CHUNKS; cz++) for (let cx = 0; cx < CHUNKS; cx++) { chunks.push(s.chunk(cx, cz, which)); yield chunks.length / (CHUNKS * CHUNKS); }
  return chunks;
}

export { bilinear, nearest };
