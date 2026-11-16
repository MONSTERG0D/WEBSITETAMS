/**
 * The terrain grid: 1025 × 1025 samples, 2 m apart, covering −1024..1024 m on both axes.
 * Index = j * N + i, where i runs along +X (east) and j along +Z (south). Pure, no Three.js.
 */
export const SPACING = 2;
export const ORIGIN = -1024;
export const N = 1025;
export const NONE = -10000; // "no water here" marker in waterY
export const FAR = 1e9;     // "no road / river near" marker in distance maps

export const gx = (i) => ORIGIN + i * SPACING;
export const gz = (j) => ORIGIN + j * SPACING;
export const toI = (x) => (x - ORIGIN) / SPACING;

/** Bilinear sample of a grid-shaped array at world (x, z); clamps at the edges. */
export function bilinear(arr, x, z, n = N, spacing = SPACING, origin = ORIGIN) {
  let fx = (x - origin) / spacing, fz = (z - origin) / spacing;
  const max = n - 1.000001;
  fx = fx < 0 ? 0 : fx > max ? max : fx; fz = fz < 0 ? 0 : fz > max ? max : fz;
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * n + i;
  const a = arr[k], b = arr[k + 1], c = arr[k + n], d = arr[k + n + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}

/** Nearest-sample lookup (for category maps such as biome and surface). */
export function nearest(arr, x, z, n = N, spacing = SPACING, origin = ORIGIN) {
  let i = Math.round((x - origin) / spacing), j = Math.round((z - origin) / spacing);
  i = i < 0 ? 0 : i >= n ? n - 1 : i; j = j < 0 ? 0 : j >= n ? n - 1 : j;
  return arr[j * n + i];
}

/**
 * Height on the rendered surface: each 2 m cell is split into two triangles along its (i, j)→(i+1, j+1)
 * diagonal, exactly like the LOD0 chunk mesh, so the result matches what you see.
 */
export function triangleHeight(h, x, z, n = N, spacing = SPACING, origin = ORIGIN) {
  let fx = (x - origin) / spacing, fz = (z - origin) / spacing;
  const max = n - 1.000001;
  fx = fx < 0 ? 0 : fx > max ? max : fx; fz = fz < 0 ? 0 : fz > max ? max : fz;
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * n + i;
  const a = h[k], d = h[k + 1], b = h[k + n], c = h[k + n + 1]; // a=(i,j) d=(i+1,j) b=(i,j+1) c=(i+1,j+1)
  return tz > tx ? a + (c - b) * tx + (b - a) * tz : a + (d - a) * tx + (c - d) * tz;
}

/** Calls fn(index, x, z) for every grid sample inside the world-space box. */
export function forEachInBox(minX, minZ, maxX, maxZ, fn) {
  const i0 = Math.max(0, Math.ceil(toI(minX))), i1 = Math.min(N - 1, Math.floor(toI(maxX)));
  const j0 = Math.max(0, Math.ceil(toI(minZ))), j1 = Math.min(N - 1, Math.floor(toI(maxZ)));
  for (let j = j0; j <= j1; j++) {
    const z = gz(j), row = j * N;
    for (let i = i0; i <= i1; i++) fn(row + i, gx(i), z);
  }
}
