import { WORLD } from '../../data/world.js';
import { N, SPACING, gx, gz } from './Grid.js';
import { sampleArray } from './Splines.js';
import { sstep } from './HeightField.js';
import { TUNING as CARVE } from './Carving.js';

/**
 * Biome, footstep-surface and texture-splat maps, computed once from the finished heights.
 * Pure: no Three.js. Codes are shared with Terrain.js and the splat shader.
 */
export const TUNING = {
  snowLine: WORLD.snowLine, snowBlend: 10, snowNoise: 12, rockSteep: 0.78, rockFull: 0.62,
  riverbank: 12, mudBand: 2.5, greenScale: 160, patchScale: 38,
};

export const BIOMES = ['valley', 'riverbank', 'highland', 'snow', 'desert'];
export const SURFACES = ['grass', 'dirt', 'road', 'sand', 'rock', 'snow', 'wood', 'mud', 'water'];
/**
 * Splat layers: two RGBA bytes per vertex. `tint` carries the ground family for the shader:
 * 0 = highland (granite rock, pine-floor grass), 0.5 = valley and hills (brown sandstone), 1 = desert (red mesa rock).
 */
export const LAYERS = ['grass', 'dryGrass', 'dirt', 'road', 'rock', 'sand', 'snow', 'salt'];
const B = { valley: 0, riverbank: 1, highland: 2, snow: 3, desert: 4 };
const S = { grass: 0, dirt: 1, road: 2, sand: 3, rock: 4, snow: 5, wood: 6, mud: 7, water: 8 };

/**
 * @param {object} g grid bundle: heights, waterY, riverDist, riverIdx, lakeEdge, roadDist, roadKind, maskM, maskS (0..1),
 *   greenN and patchN (low-frequency noise, −1..1), river
 * @returns {{ biome: Uint8Array, surface: Uint8Array, splat0: Uint8Array, splat1: Uint8Array, tint: Uint8Array }}
 */
export function computeMaps(g, T = TUNING) {
  const { heights: H, waterY, riverDist, riverIdx, lakeEdge, roadDist, roadKind, maskM, maskS, greenN, patchN, river } = g;
  const count = N * N, biome = new Uint8Array(count), surface = new Uint8Array(count);
  const splat0 = new Uint8Array(count * 4), splat1 = new Uint8Array(count * 4), tint = new Uint8Array(count);
  const pan = { x: -470, z: 905, r: 150, fade: 130 };
  const w = new Float32Array(8);
  for (let j = 0; j < N; j++) {
    const z = gz(j), jm = Math.max(0, j - 1), jp = Math.min(N - 1, j + 1);
    for (let i = 0; i < N; i++) {
      const k = j * N + i, x = gx(i), h = H[k];
      const im = Math.max(0, i - 1), ip = Math.min(N - 1, i + 1);
      const sx = (H[j * N + ip] - H[j * N + im]) / ((ip - im) * SPACING), sz = (H[jp * N + i] - H[jm * N + i]) / ((jp - jm) * SPACING);
      const ny = 1 / Math.sqrt(1 + sx * sx + sz * sz);
      const M = maskM[k], D = maskS[k], f = riverIdx[k];
      const rw = f >= 0 ? sampleArray(river.halfWidth, f) : 0, rEdge = f >= 0 ? riverDist[k] - rw : Infinity, lEdge = lakeEdge[k];
      const wet = waterY[k] > h + 0.05;
      const n1 = greenN[k], n2 = patchN[k];

      // --- splat weights
      const rock = sstep(T.rockSteep, T.rockFull, ny);
      const snow = sstep(T.snowLine - T.snowBlend, T.snowLine + T.snowBlend, h + T.snowNoise * n2) * sstep(0.55, 0.75, ny);
      const near = Math.min(rEdge, lEdge);
      let green = 0.35 + 0.35 * n1 + 0.45 * (1 - sstep(4, 40, near)) + 0.35 * M;
      green = green < 0 ? 0 : green > 1 ? 1 : green;
      const P = (1 - sstep(pan.r, pan.r + pan.fade, Math.hypot(x - pan.x, z - pan.z))) * D;
      const lowland = 1 - D;
      w[0] = lowland * green; w[1] = lowland * (1 - green); w[5] = D * (1 - P); w[7] = P;
      w[2] = 0.25 * sstep(0.15, 0.55, n2) + (1 - sstep(0.5, T.mudBand + 1, near)) * 0.9; w[3] = 0; w[4] = 0; w[6] = 0;
      const kd = roadKind[k], rd = roadDist[k];
      let road = 0, trail = 0;
      // Soft edges at least ~2 grid cells wide, so the splat never stair-steps along the 2 m vertex grid.
      if (kd === 1 || kd === 3) road = 1 - sstep(CARVE.roadHalfWidth * 0.55, CARVE.roadHalfWidth + 2.2, rd);
      else if (kd === 2) trail = 0.85 * (1 - sstep(0, CARVE.trailHalfWidth + 2.6, rd));
      let sum = 0; for (let l = 0; l < 8; l++) sum += w[l];
      const keep = (1 - rock) * (1 - snow) * (1 - road) * (1 - trail) / (sum || 1);
      for (let l = 0; l < 8; l++) w[l] *= keep;
      w[4] += rock * (1 - snow) * (1 - road); w[6] += snow * (1 - road); w[3] += road; w[2] += trail * (1 - road);
      sum = 0; for (let l = 0; l < 8; l++) sum += w[l];
      const q = 255 / (sum || 1);
      splat0[k * 4] = w[0] * q; splat0[k * 4 + 1] = w[1] * q; splat0[k * 4 + 2] = w[2] * q; splat0[k * 4 + 3] = w[3] * q;
      splat1[k * 4] = w[4] * q; splat1[k * 4 + 1] = w[5] * q; splat1[k * 4 + 2] = w[6] * q; splat1[k * 4 + 3] = w[7] * q;
      tint[k] = Math.round(255 * (D > 0.2 ? 0.5 + 0.5 * sstep(0.2, 0.7, D) : 0.5 * (1 - sstep(0.25, 0.65, M))));

      // --- biome
      let b = B.valley;
      if (snow > 0.5) b = B.snow;
      else if (near < T.riverbank && D < 0.5) b = B.riverbank;
      else if (D > 0.5) b = B.desert;
      else if (M > 0.45) b = B.highland;
      biome[k] = b;

      // --- footstep surface
      let s;
      if (wet) s = S.water;
      else if ((kd === 1 || kd === 3) && rd < CARVE.roadHalfWidth) s = S.road;
      else if (kd === 2 && rd < CARVE.trailHalfWidth) s = S.dirt;
      else if (near < T.mudBand) s = S.mud;
      else {
        let best = 0, bw = -1;
        for (let l = 0; l < 8; l++) if (w[l] > bw) { bw = w[l]; best = l; }
        s = best === 4 ? S.rock : best === 6 ? S.snow : best === 5 || best === 7 ? S.sand : best === 2 || best === 3 ? S.dirt : S.grass;
      }
      surface[k] = s;
    }
  }
  return { biome, surface, splat0, splat1, tint };
}
