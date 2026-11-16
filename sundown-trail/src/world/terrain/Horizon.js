import * as THREE from 'three';
import { SimplexNoise, fbm2, ridged2 } from '../../core/utils/noise.js';
import { triangleHeight } from './Grid.js';
import { PALETTE } from './Splat.js';

/**
 * A low-detail ring of land from the map edge (±1024 m) out to the horizon, so the world never ends abruptly:
 * mountains keep rising in the north, mesas run on in the southwest, hills roll east. One draw call.
 */
export const TUNING = { rings: [1024, 1060, 1150, 1320, 1600, 2000, 2600, 3400, 4400], segmentsPerSide: 40, edgeDrop: 0.4 };

const sstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createHorizon(data, seed = 1899) {
  const T = TUNING, noise = new SimplexNoise(seed + 7), S = T.segmentsPerSide, P = S * 4, R = T.rings.length;
  const pos = new Float32Array(P * R * 3), col = new Float32Array(P * R * 3);
  const c = (h) => new THREE.Color(h);
  const C = { valley: c(PALETTE.dry), green: c(PALETTE.grass), pine: c('#2f4a35'), granite: c(PALETTE.granite), snow: c(PALETTE.snow), sand: c(PALETTE.sand), mesa: c(PALETTE.mesa) };
  const tmp = new THREE.Color();
  for (let r = 0; r < R; r++) {
    const half = T.rings[r];
    for (let p = 0; p < P; p++) {
      const side = Math.floor(p / S), t = (p % S) / S, a = -half + 2 * half * t;
      const x = side === 0 ? a : side === 1 ? half : side === 2 ? -a : -half;
      const z = side === 0 ? -half : side === 1 ? a : side === 2 ? half : -a;
      const edge = triangleHeight(data.heights, Math.max(-1024, Math.min(1024, x)), Math.max(-1024, Math.min(1024, z)));
      const len = Math.hypot(x, z), nx = x / len, nz = z / len;
      const north = sstep(0.1, 0.6, -nz), desert = sstep(0.2, 0.7, -nx) * sstep(0.1, 0.6, nz), east = sstep(0.2, 0.7, nx) * (1 - north);
      const far = (r - 1) / (R - 2);
      const mtn = 120 + 170 * ridged2(noise, x / 700, z / 700, 4);
      const mesa = 25 + 45 * Math.floor(Math.max(0, fbm2(noise, x / 500 + 9, z / 500, 3) + 0.4) * 3) / 3;
      const hills = 40 + 50 * (0.5 + 0.5 * fbm2(noise, x / 600 - 4, z / 600 + 2, 3));
      const plain = 12 + 18 * (0.5 + 0.5 * fbm2(noise, x / 500 + 3, z / 500 - 8, 3));
      let target = plain;
      target += (mtn - target) * north; target += (mesa - target) * desert; target += (hills - target) * east;
      const y = r === 0 ? edge - T.edgeDrop : edge + (target - edge) * sstep(0, 1, far);
      const o = (r * P + p) * 3;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      tmp.copy(C.valley).lerp(C.green, 0.3 * (1 - desert));
      tmp.lerp(C.pine, north * 0.8).lerp(C.granite, north * sstep(150, 220, y)).lerp(C.snow, sstep(200, 250, y));
      tmp.lerp(C.sand, desert * 0.85).lerp(C.mesa, desert * sstep(40, 60, y) * 0.7);
      col[o] = tmp.r; col[o + 1] = tmp.g; col[o + 2] = tmp.b;
    }
  }
  const idx = [];
  for (let r = 0; r < R - 1; r++) for (let p = 0; p < P; p++) {
    const a = r * P + p, b = r * P + ((p + 1) % P), cc = (r + 1) * P + ((p + 1) % P), d = (r + 1) * P + p;
    idx.push(a, b, cc, a, cc, d); // perimeter runs clockwise seen from above, so this faces up
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'Horizon'; mesh.matrixAutoUpdate = false; mesh.receiveShadow = false;
  return mesh;
}
