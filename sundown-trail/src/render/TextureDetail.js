import * as THREE from 'three';

/**
 * Texture detail (Part 16): one place that decides how sharp the painted textures are.
 * Tier 'low' | 'medium' | 'high' comes from Settings › Graphics › Texture detail (gfx.textures); 'auto' follows
 * the quality preset, except on phones and tablets, where auto stays 'low' (GAME_BIBLE: 512 px on phones).
 * DETAIL.mesh ('normal' | 'high', the High preset on a desktop) drives the model side: denser nearest LODs, LOD bias,
 * rounder props. Low is exactly what Parts 1–15 shipped. Changing the tier takes effect on the next load (textures are painted once).
 *
 * paintTile(draw, seed, metres, opts) paints a tiling material at the tier's size. The painter draws in its usual
 * 256-px space; the canvas is scaled, so lines and shapes come out sharp, not stretched. Medium and High then add:
 *  - grain: a fine per-pixel tooth at full resolution, the detail a 256 px tile never had
 *  - a normal map from the paint (dark = deep: mortar, board gaps, cracks, bark furrows) so surfaces catch light
 *  - a roughness map (dark crevices duller, worn highlights a little smoother)
 */
export const TUNING = {
  base: 256,
  tile: { low: 256, medium: 512, high: 1024 },
  tileSmall: { low: 256, medium: 256, high: 512 },
  normal: { low: 0, medium: 256, high: 512 },
  normalSmall: { low: 0, medium: 128, high: 256 },
  rough: { low: 0, medium: 128, high: 256 },
  grain: { low: 0, medium: 0.05, high: 0.07 },
  anisotropy: { low: 4, medium: 8, high: 16 },
  normalStrength: 2.2, normalScale: 0.9, roughRange: 0.35,
  // atlases (people, horses, guns, vegetation) and the terrain's close-up detail
  human: { low: 512, medium: 1024, high: 2048 }, horse: { low: 512, medium: 1024, high: 2048 },
  weapon: { low: 256, medium: 512, high: 1024 }, vegetation: { low: 1024, medium: 1024, high: 2048 },
  terrainDetail: { low: 256, medium: 512, high: 1024 },
  // model detail on the High preset (desktop): denser nearest LODs for people and horses, kept further out, rounder props
  highMesh: { lodBias: 1.35, segScale: 1.5 },
};

/** The live tier. configureTextureDetail sets it once the quality is known; tests can set it directly. */
export const DETAIL = { tier: 'low', mesh: 'normal', maxAnisotropy: 16, stats: { tiles: 0, bytes: 0, ms: 0 } };

/** Picks the tier for this device and settings. Called by Game.applyQuality (Part 16). */
export function configureTextureDetail(game) {
  const want = game.settings?.get?.('gfx.textures') ?? 'auto', q = game.quality?.name || 'medium';
  const tier = want !== 'auto' && TUNING.tile[want] ? want : game.isTouch ? 'low' : q === 'high' ? 'high' : q === 'medium' ? 'medium' : 'low';
  DETAIL.tier = tier;
  DETAIL.mesh = q === 'high' && !game.isTouch ? 'high' : 'normal';
  DETAIL.maxAnisotropy = game.renderer?.capabilities?.getMaxAnisotropy?.() || 16;
  return tier;
}
/** A size from one of the TUNING tables for the current tier. */
export function sizeFor(table, tier = DETAIL.tier) { const t = typeof table === 'string' ? TUNING[table] : table; return t[tier] ?? t.low; }
/** LOD distance multiplier and round-prop segment multiplier for the current model detail. */
export const lodBias = () => (DETAIL.mesh === 'high' ? TUNING.highMesh.lodBias : 1);
export const segScale = () => (DETAIL.mesh === 'high' ? TUNING.highMesh.segScale : 1);
export function anisotropy(tier = DETAIL.tier) { return Math.min(TUNING.anisotropy[tier] || 4, DETAIL.maxAnisotropy || 4); }

let _grain = null;
function grainPattern() {
  if (_grain) return _grain;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), img = x.createImageData(128, 128), d = img.data;
  let s = 0x2f6b1d; const r = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  for (let i = 0; i < d.length; i += 4) { const v = 128 + (r() + r() - 1) * 127; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  x.putImageData(img, 0, 0); _grain = c; return c;
}

/**
 * @param {(ctx: CanvasRenderingContext2D, R: () => number, S: number) => void} draw painter in 256-px space
 * @param {() => number} R the painter's random source
 * @param {number} metres how many metres one repeat covers
 * @param {{ small?: boolean, normalStrength?: number, invert?: boolean, rough?: boolean, base?: number }} [opts]
 * @returns {{ map: THREE.CanvasTexture, normalMap: THREE.CanvasTexture|null, roughnessMap: THREE.CanvasTexture|null }}
 */
export function paintTile(draw, R, metres, opts = {}) {
  const t0 = performance.now(), tier = DETAIL.tier, base = opts.base || TUNING.base;
  const size = sizeFor(opts.small ? TUNING.tileSmall : TUNING.tile), k = size / base;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d', { willReadFrequently: false });
  if (k !== 1) x.setTransform(k, 0, 0, k, 0, 0);
  draw(x, R, base);
  x.setTransform(1, 0, 0, 1, 0, 0);
  // relief comes from the paint itself (before the grain, which is colour only: grain in the normals reads as sandpaper)
  let normalMap = null, roughnessMap = null;
  const ns = sizeFor(opts.small ? TUNING.normalSmall : TUNING.normal);
  if (ns > 0) {
    const h = heights(c, ns);
    normalMap = finish(new THREE.CanvasTexture(heightToNormal(h, ns, (opts.normalStrength ?? 1) * TUNING.normalStrength * (ns / 256), opts.invert)), false, metres);
    const rs = sizeFor(TUNING.rough);
    if (rs > 0 && opts.rough !== false) roughnessMap = finish(new THREE.CanvasTexture(heightToRough(heights(c, rs), rs)), false, metres);
  }
  const grain = TUNING.grain[tier] || 0;
  if (grain > 0) { x.globalCompositeOperation = 'overlay'; x.globalAlpha = grain * 4; x.fillStyle = x.createPattern(grainPattern(), 'repeat'); x.fillRect(0, 0, size, size); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; }
  const map = finish(new THREE.CanvasTexture(c), true, metres);
  DETAIL.stats.tiles++; DETAIL.stats.ms += performance.now() - t0;
  DETAIL.stats.bytes += texBytes(size) + (normalMap ? texBytes(ns) : 0) + (roughnessMap ? texBytes(sizeFor(TUNING.rough)) : 0);
  return { map, normalMap, roughnessMap };
}
const texBytes = (s) => Math.round(s * s * 4 * 4 / 3); // RGBA8 plus the mip chain
function finish(t, colour, metres) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy(); t.userData.metres = metres;
  return t;
}
/** Luminance heights (0..1) of a canvas resampled to n × n, lightly blurred so single specks don't become pits. */
function heights(src, n) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, n, n);
  const d = x.getImageData(0, 0, n, n).data, h = new Float32Array(n * n), b = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) h[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
  for (let y = 0; y < n; y++) for (let xx = 0; xx < n; xx++) {
    const u = (xx + 1) % n, l = (xx + n - 1) % n, dn = ((y + 1) % n) * n, up = ((y + n - 1) % n) * n, r = y * n;
    b[r + xx] = (h[r + xx] * 4 + h[r + u] + h[r + l] + h[dn + xx] + h[up + xx]) / 8;
  }
  return b;
}
/** Wrapping Sobel normal map from heights. */
export function heightToNormal(h, n, strength = 2, invert = false) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d'), img = x.createImageData(n, n), d = img.data, sgn = invert ? -1 : 1;
  for (let y = 0; y < n; y++) {
    const ym = ((y + n - 1) % n) * n, y0 = y * n, yp = ((y + 1) % n) * n;
    for (let xx = 0; xx < n; xx++) {
      const xm = (xx + n - 1) % n, xp = (xx + 1) % n;
      const gx = (h[ym + xp] + 2 * h[y0 + xp] + h[yp + xp]) - (h[ym + xm] + 2 * h[y0 + xm] + h[yp + xm]);
      const gy = (h[yp + xm] + 2 * h[yp + xx] + h[yp + xp]) - (h[ym + xm] + 2 * h[ym + xx] + h[ym + xp]);
      let nx = -gx * strength * sgn, ny = gy * strength * sgn, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const o = (y0 + xx) * 4; d[o] = (nx * 0.5 + 0.5) * 255; d[o + 1] = (ny * 0.5 + 0.5) * 255; d[o + 2] = (nz * 0.5 + 0.5) * 255; d[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0); return c;
}
/** Roughness (green channel, a multiplier on the material's roughness): crevices 1.0, raised and worn parts lower. */
function heightToRough(h, n) {
  let mean = 0; for (let i = 0; i < h.length; i++) mean += h[i]; mean /= h.length;
  const c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d'), img = x.createImageData(n, n), d = img.data;
  for (let i = 0; i < n * n; i++) { const v = Math.max(0, Math.min(1, 1 - Math.max(0, h[i] - mean) * TUNING.roughRange * 3)); const o = i * 4; d[o] = d[o + 1] = d[o + 2] = v * 255; d[o + 3] = 255; }
  x.putImageData(img, 0, 0); return c;
}
/** Material options for a painted tile: map, plus normal and roughness maps when the tier makes them. */
export function tileMaterialMaps(tile) {
  const o = { map: tile.map };
  if (tile.normalMap) { o.normalMap = tile.normalMap; o.normalScale = new THREE.Vector2(TUNING.normalScale, TUNING.normalScale); }
  if (tile.roughnessMap) o.roughnessMap = tile.roughnessMap;
  return o;
}
