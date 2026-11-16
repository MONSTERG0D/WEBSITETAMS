import * as THREE from 'three';
import { WORLD } from '../../data/world.js';
import { N, SPACING, ORIGIN, NONE, FAR, bilinear, nearest, triangleHeight } from './Grid.js';
import { BIOMES, SURFACES } from './Maps.js';
import { TUNING as CARVE } from './Carving.js';

/**
 * Read-only queries over generated world data: the terrain API from GAME_BIBLE §11.
 * Heights follow the rendered LOD0 triangles exactly (see Grid.triangleHeight).
 */
export const TUNING = { rayMinStep: 0.25, rayMaxStep: 6, rayRefine: 10, normalProbe: 1 };

const UP = new THREE.Vector3(0, 1, 0);
const REGIONS = Object.entries(WORLD.regions);

export class TerrainData {
  /** @param {object} data output of Generator.generateWorld */
  constructor(data) {
    this.data = data;
    this.heights = data.heights;
    this.river = data.river; this.lake = data.lake; this.pads = data.pads;
    this.roads = data.roads; this.bridges = data.bridges; this.fords = data.fords;
    this.waterfall = data.river.waterfall;
    let max = -Infinity;
    for (let i = 0; i < data.heights.length; i++) if (data.heights[i] > max) max = data.heights[i];
    this.maxHeight = max;
  }

  getHeightAt(x, z) { return triangleHeight(this.heights, x, z); }

  /** Smooth surface normal (central differences over ±1 m). Pass `out` to avoid allocating. */
  getNormalAt(x, z, out = new THREE.Vector3()) {
    const e = TUNING.normalProbe;
    const hx = this.getHeightAt(x + e, z) - this.getHeightAt(x - e, z), hz = this.getHeightAt(x, z + e) - this.getHeightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  getBiomeAt(x, z) { return BIOMES[nearest(this.data.biome, x, z)]; }
  getSurfaceAt(x, z) { return SURFACES[nearest(this.data.surface, x, z)]; }

  /** Water surface height at (x, z), or null where there is no river or lake water. */
  getWaterLevelAt(x, z) {
    const w = this.data.waterY;
    let fx = (x - ORIGIN) / SPACING, fz = (z - ORIGIN) / SPACING;
    if (fx < 0 || fz < 0 || fx > N - 1 || fz > N - 1) return null;
    const i = Math.min(N - 2, Math.floor(fx)), j = Math.min(N - 2, Math.floor(fz)), k = j * N + i;
    const a = w[k], b = w[k + 1], c = w[k + N], d = w[k + N + 1];
    let best = NONE;
    if (a > best) best = a; if (b > best) best = b; if (c > best) best = c; if (d > best) best = d;
    return best === NONE ? null : best;
  }
  getWaterDepth(x, z) {
    const lvl = this.getWaterLevelAt(x, z);
    if (lvl === null) return 0;
    const d = lvl - this.getHeightAt(x, z);
    return d > 0 ? d : 0;
  }
  isWater(x, z) { return this.getWaterDepth(x, z) > 0.05; }

  /** @returns {{ onRoad: boolean, distance: number, trail: boolean, bridge: boolean }} */
  getRoadInfo(x, z) {
    const d = this.data;
    let dist = bilinear(d.roadDist, x, z);
    const kind = nearest(d.roadKind, x, z);
    if (!(dist < FAR * 0.5) || nearest(d.roadDist, x, z) >= FAR * 0.5) {
      dist = bilinear(d.roadCoarse, x, z, d.roadCoarseN, d.roadCoarseSpacing, ORIGIN);
      return { onRoad: false, distance: dist, trail: false, bridge: false };
    }
    const half = kind === 2 ? CARVE.trailHalfWidth : CARVE.roadHalfWidth;
    return { onRoad: dist <= half, distance: dist, trail: kind === 2, bridge: kind === 3 };
  }

  /** Nearest of the four bounty regions (GAME_BIBLE §5). */
  getRegionAt(x, z) {
    let best = 'copperbell', bd = Infinity;
    for (const [id, r] of REGIONS) { const d = (r.x - x) ** 2 + (r.z - z) ** 2; if (d < bd) { bd = d; best = id; } }
    return best;
  }

  /**
   * Ray against the height field.
   * @param {{x,y,z}} origin @param {{x,y,z}} dir normalized @param {number} max
   * @returns {{ point: THREE.Vector3, normal: THREE.Vector3, distance: number, surface: string } | null}
   */
  raycast(origin, dir, max = 1000) {
    const T = TUNING;
    if (dir.y >= 0 && origin.y > this.maxHeight) return null;
    let t = 0, prevT = 0, diff = origin.y - this.getHeightAt(origin.x, origin.z);
    if (diff < 0) return null; // starting underground: nothing sensible to hit
    while (t < max) {
      const step = Math.min(T.rayMaxStep, Math.max(T.rayMinStep, diff * 0.5));
      prevT = t; t = Math.min(max, t + step);
      const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
      if (dir.y > 0 && y > this.maxHeight) return null;
      diff = y - this.getHeightAt(x, z);
      if (diff <= 0) {
        let lo = prevT, hi = t;
        for (let i = 0; i < T.rayRefine; i++) {
          const mid = (lo + hi) / 2;
          if (origin.y + dir.y * mid - this.getHeightAt(origin.x + dir.x * mid, origin.z + dir.z * mid) > 0) lo = mid; else hi = mid;
        }
        const point = new THREE.Vector3(origin.x + dir.x * hi, origin.y + dir.y * hi, origin.z + dir.z * hi);
        return { point, normal: this.getNormalAt(point.x, point.z), distance: hi, surface: this.getSurfaceAt(point.x, point.z) };
      }
      if (t >= max) break;
    }
    return null;
  }
}

export { UP };
