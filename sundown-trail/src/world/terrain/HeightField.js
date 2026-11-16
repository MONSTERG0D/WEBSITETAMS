import { SimplexNoise, fbm2, ridged2, warp2 } from '../../core/utils/noise.js';
import { WORLD, WORLD_SEED } from '../../data/world.js';

/**
 * The "natural" landscape before rivers, roads and pads are carved in (GAME_BIBLE §5).
 * Region masks shape the Greywind Range (north), the rolling Ashwater Valley, the Blackstone Hills (east)
 * and Saltmesa (southwest) with terraced mesas, a canyon maze around the Cinder Boys hideout and a salt pan.
 * Pure: no Three.js, deterministic from WORLD_SEED.
 */
export const TUNING = {
  edgeWarp: 70, edgeWarpScale: 520,
  valleyBase: 10, valleyAmp: 10, valleyScale: 560, valleyDetail: 2.5, valleyDetailScale: 85, valleyFloor: 5,
  mountainStartZ: -250, mountainFullZ: -590, mountainBase: 50, mountainAmp: 215, mountainShape: 1.5, mountainScale: 620, mountainOctaves: 4, mountainRound: 0.3, mountainNorthBoost: 15,
  hillsStartX: 220, hillsFullX: 520, hillsBase: 10, hillsAmp: 46, hillsScale: 300,
  desertStartX: -190, desertFullX: -330, desertStartZ: 300, desertFullZ: 440, desertBase: 7,
  mesaScale: 260, mesaThreshold: 0.05, mesaEdge: 0.16, mesaHeight: 58, mesaStep: 11, terraceRiser: 0.5,
  canyonRadius: 280, canyonFade: 150, canyonTop: 44, canyonFloor: 9, canyonScale: 150, canyonWidth: 0.13,
  hideoutBasin: 55, hideoutWall: 40, trailCanyon: 11,
  saltPanX: -470, saltPanZ: 905, saltPanRadius: 150, saltPanFade: 130, saltPanHeight: 0.9,
  lakeFoothill: 0.78, ranchHill: 9, oakRise: 4,
  passHeight: 190, passInner: 70, passOuter: 300, passRiverClear: 40, passRiverFade: 170,
  waterfallLift: 25, waterfallRadius: 60, waterfallFade: 110, peakKnee: 238, peakRoom: 26,
  riverValleySource: 105, riverValleyAboveFall: 74, riverValleyBelowFall: 44, riverValleyExit: 16, riverValleyInner: 30, riverValleyOuter: 230,
};

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Smoothstep that also works with a > b (falls from 0 to 1 as v goes from a to b). */
export const sstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothMax = (a, b, k) => { const h = clamp01(0.5 + 0.5 * (a - b) / k); return b + (a - b) * h + k * h * (1 - h); };

/**
 * @param {number} [seed]
 * @param {object} [tuning] overrides for TUNING (test pages use this for live sliders)
 * @returns {{ height(x: number, z: number, masks?: {mountain: number, desert: number, hills: number}): number, noise: SimplexNoise, T: object }}
 */
export function createHeightField(seed = WORLD_SEED, tuning = {}) {
  const T = { ...TUNING, ...tuning }, n = new SimplexNoise(seed);
  const L = WORLD.locations, lake = L.mirrorLake, ranch = L.ranch, oak = L.hangingOak, hide = L.cinderHideout, camp = L.lumberCamp;
  const fall = WORLD.waterfall, river = WORLD.river;
  const trail = WORLD.roads.find((r) => r.id === 'hideoutTrail')?.points || [];

  /** Distance to the river's control polyline: keeps the pass plateau out of the river corridor. */
  function riverLineDistance(x, z) {
    let best = Infinity;
    for (let i = 0; i < river.length - 1; i++) {
      const [ax, az] = river[i], [bx, bz] = river[i + 1], dx = bx - ax, dz = bz - az;
      let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz); t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < best) best = d;
    }
    return best;
  }

  /** Distance to the hideout trail's control polyline: the trail runs along a canyon floor, never over a rim. */
  const tb = trail.reduce((b, [px, pz]) => [Math.min(b[0], px), Math.min(b[1], pz), Math.max(b[2], px), Math.max(b[3], pz)], [Infinity, Infinity, -Infinity, -Infinity]);
  function trailDistance(x, z) {
    const pad = T.trailCanyon + T.hideoutWall;
    if (x < tb[0] - pad || x > tb[2] + pad || z < tb[1] - pad || z > tb[3] + pad) return Infinity; // far from the trail: skip the segment loop
    let best = Infinity;
    for (let i = 0; i < trail.length - 1; i++) {
      const [ax, az] = trail[i], [bx, bz] = trail[i + 1], dx = bx - ax, dz = bz - az;
      let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz); t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < best) best = d;
    }
    return best;
  }

  function desert(x, z) {
    const base = T.desertBase + 2.5 * fbm2(n, x / 140 + 9.1, z / 140 + 2.3, 3);
    const m = fbm2(n, x / T.mesaScale + 71.3, z / T.mesaScale - 33.2, 4);
    let top = sstep(T.mesaThreshold, T.mesaThreshold + T.mesaEdge, m) * T.mesaHeight * (0.75 + 0.25 * fbm2(n, x / 600, z / 600, 2));
    const dk = Math.hypot(x - hide.x, z - hide.z), K = 1 - sstep(T.canyonRadius, T.canyonRadius + T.canyonFade, dk);
    if (K > 0) {
      // Canyons follow the zero contours of a noise field, so they form long connected corridors.
      const c = Math.abs(fbm2(n, x / T.canyonScale - 5.5, z / T.canyonScale + 12.1, 3));
      const open = 1 - sstep(T.canyonWidth * 0.35, T.canyonWidth * 1.15, c);
      const maze = lerp(T.canyonTop + 5 * fbm2(n, x / 200, z / 200, 2) - base, T.canyonFloor - base, open);
      top = lerp(top, Math.max(0, maze), K);
    }
    // The hideout sits in a box canyon, reached along a canyon floor that the trail follows.
    const basin = 1 - sstep(T.hideoutBasin, T.hideoutBasin + T.hideoutWall, dk);
    const corridor = 1 - sstep(T.trailCanyon, T.trailCanyon + T.hideoutWall * 0.6, trailDistance(x, z));
    top *= 1 - Math.max(basin, corridor);
    // Terraces: flat steps with sloping risers, like stacked sandstone.
    const t = top / T.mesaStep, f = Math.floor(t), fr = t - f;
    let h = base + (f + sstep(T.terraceRiser, 1, fr)) * T.mesaStep;
    const dp = Math.hypot(x - T.saltPanX, z - T.saltPanZ), P = 1 - sstep(T.saltPanRadius, T.saltPanRadius + T.saltPanFade, dp);
    if (P > 0) h = lerp(h, T.saltPanHeight + 0.12 * fbm2(n, x / 60, z / 60, 2), P);
    return h;
  }

  /** Natural height in metres. Optionally writes region masks (0..1) into `masks`. */
  function height(x, z, masks) {
    const wx = x + T.edgeWarp * fbm2(n, x / T.edgeWarpScale + 11.3, z / T.edgeWarpScale - 7.1, 3);
    const wz = z + T.edgeWarp * fbm2(n, x / T.edgeWarpScale - 23.7, z / T.edgeWarpScale + 5.9, 3);
    let M = sstep(T.mountainStartZ, T.mountainFullZ, wz);
    const dLake = Math.hypot(x - lake.x, z - lake.z);
    M *= 1 - T.lakeFoothill * (1 - sstep(90, 280, dLake));
    const S = sstep(T.desertStartX, T.desertFullX, wx) * sstep(T.desertStartZ, T.desertFullZ, wz) * (1 - M);
    const B = sstep(T.hillsStartX, T.hillsFullX, wx) * (1 - M);
    let h = 0;
    if (M < 1) {
      let v = T.valleyBase + T.valleyAmp * warp2(n, x / T.valleyScale, z / T.valleyScale, 0.9, 3)
        + T.valleyDetail * fbm2(n, x / T.valleyDetailScale + 3.1, z / T.valleyDetailScale - 8.4, 3);
      if (B > 0) v += B * (T.hillsBase + T.hillsAmp * (0.5 + 0.5 * fbm2(n, x / T.hillsScale - 41, z / T.hillsScale + 17, 4)));
      v = smoothMax(v, T.valleyFloor, 2.5);
      if (S > 0) v = lerp(v, desert(x, z), S);
      h = v;
    }
    if (M > 0) {
      const r = ridged2(n, x / T.mountainScale + 40.2, z / T.mountainScale - 13.7, T.mountainOctaves);
      const round = 0.5 + 0.5 * fbm2(n, x / (T.mountainScale * 0.6) - 8.3, z / (T.mountainScale * 0.6) + 2.9, 3);
      const north = sstep(-600, -980, z);
      const shape = (1 - T.mountainRound) * (1 - (1 - r) ** T.mountainShape) + T.mountainRound * round; // ridged crests softened by rounded fbm
      let m = T.mountainBase + T.mountainAmp * shape + T.mountainNorthBoost * north;
      // The lumber camp's pass sits just above the snow line; the river corridor keeps its own valley.
      const dc = Math.hypot(x - camp.x, z - camp.z);
      if (dc < T.passOuter) {
        const w = (1 - sstep(T.passInner, T.passOuter, dc)) * sstep(T.passRiverClear, T.passRiverFade, riverLineDistance(x, z));
        if (w > 0) m = lerp(m, Math.max(m, T.passHeight + 6 * fbm2(n, x / 90, z / 90, 2)), w);
      }
      // The river's own valley through the range: a floor that descends to the waterfall, drops, then runs out.
      const dr = riverLineDistance(x, z);
      if (dr < T.riverValleyOuter) {
        const upper = lerp(T.riverValleySource, T.riverValleyAboveFall, sstep(-1000, fall.z, z));
        const lower = lerp(T.riverValleyBelowFall, T.riverValleyExit, sstep(fall.z, -380, z));
        const floor = lerp(upper, lower, sstep(fall.z - 10, fall.z + 8, z)) + 6 * fbm2(n, x / 120, z / 120, 2);
        m = lerp(floor, m, sstep(T.riverValleyInner, T.riverValleyOuter, dr));
      }
      // A granite step for the waterfall: the land just north of it is lifted.
      const df = Math.hypot(x - fall.x, z - fall.z);
      if (df < T.waterfallRadius + T.waterfallFade) m += T.waterfallLift * sstep(fall.z + 8, fall.z - 30, z) * (1 - sstep(T.waterfallRadius, T.waterfallRadius + T.waterfallFade, df));
      if (m > T.peakKnee) m = T.peakKnee + T.peakRoom * Math.tanh((m - T.peakKnee) / T.peakRoom); // peaks top out near 260 m
      h = lerp(h, m, M);
    }
    h += T.ranchHill * Math.exp(-((x - ranch.x) ** 2 + (z - ranch.z) ** 2) / (2 * 95 * 95));
    h += T.oakRise * Math.exp(-((x - oak.x) ** 2 + (z - oak.z) ** 2) / (2 * 45 * 45));
    if (masks) { masks.mountain = M; masks.desert = S; masks.hills = B; }
    return h;
  }

  return { height, noise: n, T };
}
