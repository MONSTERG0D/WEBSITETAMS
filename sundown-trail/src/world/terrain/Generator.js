import { WORLD_SEED } from '../../data/world.js';
import { fbm2 } from '../../core/utils/noise.js';
import { createHeightField } from './HeightField.js';
import { N, SPACING, ORIGIN, NONE, FAR, gx, gz } from './Grid.js';
import { buildRiver, rasterizeRiver, carveRiver, carveLake, reapplyLake, carvePads, buildRoads, coarseRoadDistance, TUNING as CARVE } from './Carving.js';
import { computeMaps, TUNING as MAPS } from './Maps.js';

/**
 * Generates the whole 2048 m world (GAME_BIBLE §5) as flat typed arrays. Deterministic from WORLD_SEED.
 * Written as a generator so it can run in a Web Worker in one go, or on the main thread in time slices.
 * The natural landscape is evaluated on a 4 m lattice and refined to the 2 m grid with fine detail noise.
 */
export const TUNING = { coarse: 2, detailAmp: 0.35, detailScale: 18, rowsPerYield: 24, exactDesert: 0.02, rimRounding: 2 };

/**
 * @param {{ seed?: number, tuning?: object, carve?: object }} [options] tuning overrides HeightField TUNING; carve overrides Carving TUNING
 * @yields {{ phase: string, progress: number }}
 * @returns {object} world data (see Terrain.js)
 */
export function* generateWorld(options = {}) {
  const seed = options.seed ?? WORLD_SEED, T = TUNING, C = { ...CARVE, ...(options.carve || {}) };
  const hf = createHeightField(seed, options.tuning || {}), noise = hf.noise;
  const count = N * N, step = T.coarse, cn = (N - 1) / step + 1;
  const coarse = new Float32Array(cn * cn), cm = new Float32Array(cn * cn), cs = new Float32Array(cn * cn), masks = {};
  const cg = new Float32Array(cn * cn), cp = new Float32Array(cn * cn); // low-frequency noise for the splat maps

  // 1. Natural heights on the coarse lattice.
  for (let j = 0; j < cn; j++) {
    const z = ORIGIN + j * step * SPACING;
    for (let i = 0; i < cn; i++) {
      const k = j * cn + i;
      const x = ORIGIN + i * step * SPACING;
      coarse[k] = hf.height(x, z, masks); cm[k] = masks.mountain; cs[k] = masks.desert;
      cg[k] = fbm2(noise, x / MAPS.greenScale + 300, z / MAPS.greenScale - 120, 3);
      cp[k] = fbm2(noise, x / MAPS.patchScale - 50, z / MAPS.patchScale + 90, 2);
    }
    if (j % T.rowsPerYield === 0) yield { phase: 'heights', progress: 0.55 * (j / cn) };
  }
  // 2. Refine to 2 m.
  const heights = new Float32Array(count), maskM = new Float32Array(count), maskS = new Float32Array(count);
  const greenN = new Float32Array(count), patchN = new Float32Array(count);
  for (let j = 0; j < N; j++) {
    const cj = j / step, j0 = Math.min(cn - 2, Math.floor(cj)), tz = cj - j0, z = gz(j);
    for (let i = 0; i < N; i++) {
      const ci = i / step, i0 = Math.min(cn - 2, Math.floor(ci)), tx = ci - i0, k0 = j0 * cn + i0, k = j * N + i;
      const w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz, k1 = k0 + cn;
      maskM[k] = cm[k0] * w00 + cm[k0 + 1] * w10 + cm[k1] * w01 + cm[k1 + 1] * w11;
      maskS[k] = cs[k0] * w00 + cs[k0 + 1] * w10 + cs[k1] * w01 + cs[k1 + 1] * w11;
      greenN[k] = cg[k0] * w00 + cg[k0 + 1] * w10 + cg[k1] * w01 + cg[k1 + 1] * w11;
      patchN[k] = cp[k0] * w00 + cp[k0 + 1] * w10 + cp[k1] * w01 + cp[k1 + 1] * w11;
      // Saltmesa's terrace risers and canyon walls are too sharp for the 4 m lattice: sample them exactly at 2 m.
      const nat = maskS[k] > T.exactDesert ? hf.height(gx(i), z) : coarse[k0] * w00 + coarse[k0 + 1] * w10 + coarse[k1] * w01 + coarse[k1 + 1] * w11;
      heights[k] = nat + T.detailAmp * fbm2(noise, gx(i) / T.detailScale, z / T.detailScale, 2) * (1 - 0.7 * maskS[k]);
    }
    if (j % (T.rowsPerYield * 4) === 0) yield { phase: 'detail', progress: 0.55 + 0.15 * (j / N) };
  }
  // 2b. Erode Saltmesa's rims: a small blur rounds the lip where flat terrace tops meet the cliff walls.
  roundRims(heights, maskS, T.rimRounding);
  yield { phase: 'detail', progress: 0.72 };
  // 3. River, lake, pads, roads.
  const waterY = new Float32Array(count).fill(NONE), riverDist = new Float32Array(count).fill(FAR), riverIdx = new Float32Array(count).fill(-1);
  const lakeEdge = new Float32Array(count).fill(FAR);
  const river = buildRiver(heights, noise, C);
  rasterizeRiver(river, riverDist, riverIdx);
  carveRiver(heights, waterY, river, riverDist, riverIdx);
  yield { phase: 'river', progress: 0.76 };
  const lake = carveLake(heights, waterY, lakeEdge, noise, C);
  const padMask = new Float32Array(count);
  const pads = carvePads(heights, river, riverDist, riverIdx, lakeEdge, padMask, C);
  yield { phase: 'pads', progress: 0.8 };
  const roadDist = new Float32Array(count).fill(FAR), roadY = new Float32Array(count), roadKind = new Uint8Array(count);
  const roads = buildRoads(heights, river, riverDist, riverIdx, lakeEdge, roadDist, roadY, roadKind, pads, lake, padMask, C);
  carveRiver(heights, waterY, river, riverDist, riverIdx, true);
  reapplyLake(heights, lakeEdge, lake, C);
  for (let k = 0; k < count; k++) if (waterY[k] !== NONE && waterY[k] <= heights[k] + 0.01) waterY[k] = NONE;
  const roadCoarse = coarseRoadDistance(roads.paths, C);
  yield { phase: 'roads', progress: 0.86 };
  // 4. Biomes, surfaces, splat.
  const maps = computeMaps({ heights, waterY, riverDist, riverIdx, lakeEdge, roadDist, roadKind, maskM, maskS, greenN, patchN, river });
  yield { phase: 'maps', progress: 1 };

  const { edgeAt, ...lakeInfo } = lake;
  return {
    seed, n: N, spacing: SPACING, origin: ORIGIN,
    heights, waterY, riverDist, riverIdx, lakeEdge, roadDist, roadKind,
    roadCoarse: roadCoarse.dist, roadCoarseN: roadCoarse.n, roadCoarseSpacing: roadCoarse.spacing,
    ...maps,
    river: {
      xs: river.xs, zs: river.zs, s: river.s, level: river.level, halfWidth: river.halfWidth, depth: river.depth,
      length: river.length, knots: river.knots, ford: river.ford, waterfall: river.waterfall,
    },
    lake: lakeInfo, pads, roads: roads.paths, bridges: roads.bridges, fords: roads.fords,
  };
}

/**
 * Repeated 3 × 3 box blur (≈ Gaussian, σ ≈ 0.8 · √passes cells) of the heights inside the desert mask only,
 * blended by the mask so the valley and mountains are untouched.
 */
function roundRims(h, mask, passes) {
  if (!(passes > 0)) return;
  let i0 = N, i1 = -1, j0 = N, j1 = -1;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (mask[j * N + i] > 0.01) { if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
  if (i1 < 0) return;
  i0 = Math.max(1, i0 - 2); j0 = Math.max(1, j0 - 2); i1 = Math.min(N - 2, i1 + 2); j1 = Math.min(N - 2, j1 + 2);
  const w = i1 - i0 + 1, src = new Float32Array(w * (j1 - j0 + 1));
  for (let pass = 0; pass < passes; pass++) {
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) src[(j - j0) * w + (i - i0)] = h[j * N + i];
    for (let j = j0 + 1; j < j1; j++) for (let i = i0 + 1; i < i1; i++) {
      const m = mask[j * N + i];
      if (m <= 0.01) continue;
      const r = (j - j0) * w + (i - i0);
      const avg = (src[r - w - 1] + src[r - w] + src[r - w + 1] + src[r - 1] + src[r] + src[r + 1] + src[r + w - 1] + src[r + w] + src[r + w + 1]) / 9;
      h[j * N + i] = src[r] + (avg - src[r]) * Math.min(1, m * 1.5);
    }
  }
}

/** Runs the whole generator synchronously (workers and Node tests). */
export function generateWorldSync(options) {
  const it = generateWorld(options);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

/** Every ArrayBuffer inside the world data, for postMessage transfer lists. */
export function transferList(data) {
  const out = new Set();
  const visit = (v) => {
    if (!v || typeof v !== 'object') return;
    if (ArrayBuffer.isView(v)) { out.add(v.buffer); return; }
    for (const x of Array.isArray(v) ? v : Object.values(v)) visit(x);
  };
  visit(data);
  return [...out];
}
