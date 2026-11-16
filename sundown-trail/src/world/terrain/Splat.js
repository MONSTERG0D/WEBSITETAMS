import * as THREE from 'three';
import { sizeFor, anisotropy } from '../../render/TextureDetail.js';
import { RNG } from '../../core/utils/rng.js';

/**
 * Terrain look (GAME_BIBLE §7). Ground layers live in two texture arrays: colour (sRGB) and "nrm"
 * (normal X/Y + roughness, linear). They come either from realistic textures baked in Blender
 * (assets/terrain/, made by tools/blender/terrain_materials.py) or, if those are missing or switched off,
 * from layers painted on canvas in the Bible palettes. Splat weights blend them per vertex; rock is
 * biplanar (granite in the highlands, sandstone in the valley, red rock in Saltmesa) so cliffs don't stretch.
 */
export const TUNING = {
  textureSize: 256, detailFade: 70, detailStrength: 0.35, macroScale: 140, macroAmount: 0.5, highlandGreen: 0.75,
  bakedSize: { low: 512, medium: 512, high: 1024 }, bakedNormal: 0.9, bakedDetail: 0.1, bakedHighlandGreen: 0.3,
  antiTile: 0.4, bakedAntiTile: 0.22, anisotropy: { low: 2, medium: 4, high: 8 },
  // metres per texture repeat, per layer: grass, dryGrass, dirt, road, granite, sand, snow, salt, (macro), sandstone, red rock
  scales: [5, 5.5, 4, 4.5, 11, 6, 6, 9, 140, 11, 11],
};
/** Array layer order. Index 8 is the painted macro-variation layer (no baked file). */
export const LAYERS_ORDER = ['grass', 'dryGrass', 'dirt', 'road', 'granite', 'sand', 'snow', 'salt', 'macro', 'sandstone', 'redrock'];
export const LAYER_COUNT = LAYERS_ORDER.length;
const PAINTED_ROUGHNESS = [0.93, 0.92, 0.93, 0.9, 0.82, 0.95, 0.62, 0.85, 0.9, 0.86, 0.86];
const BAKED_DIR = new URL('../../../assets/terrain/', import.meta.url);

const PALETTE = {
  grass: '#8c8a46', grassDark: '#5f6634', grassLight: '#a7a65c',
  dry: '#b8a25a', dryLight: '#d4bf7a', dryDark: '#8c7638',
  dirt: '#a07c4f', dirtDark: '#6e5333', dirtLight: '#c4a073',
  road: '#a8875e', roadDark: '#7d6243', roadLight: '#c9ab80',
  granite: '#7c7f86', mesa: '#a4502f', sandstone: '#8a7560', pineFloor: '#3d5a3a',
  sand: '#c9824a', sandLight: '#dba068', sandDark: '#a9693a',
  snow: '#eef1f4', snowShade: '#cdd8e4', salt: '#e8e1d0', saltCrack: '#c4b89c',
};

/** Periodic value noise so every painted tile wraps seamlessly. */
function tileNoise(rng, cells) {
  const v = new Float32Array(cells * cells);
  for (let i = 0; i < v.length; i++) v[i] = rng.next();
  return (x, y) => {
    const fx = (x * cells) % cells, fy = (y * cells) % cells, i = Math.floor(fx), j = Math.floor(fy);
    const tx = fx - i, ty = fy - j, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const i1 = (i + 1) % cells, j1 = (j + 1) % cells;
    const a = v[j * cells + i], b = v[j * cells + i1], c = v[j1 * cells + i], d = v[j1 * cells + i1];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}
function fbmTile(rng, octaves = 4, base = 4) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(tileNoise(rng, base << o));
  return (x, y) => { let s = 0, a = 1, n = 0; for (const f of layers) { s += a * f(x, y); n += a; a *= 0.5; } return s / n; };
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Base mottled fill, then strokes drawn with wrap-around. */
function paint(size, seed, base, vary, strokes) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'), rng = new RNG(seed), f = fbmTile(rng, 4, 4), img = ctx.createImageData(size, size), [r, g, b] = hex(base);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const m = 1 + vary * (f(x / size, y / size) - 0.5) * 2, o = (y * size + x) * 4;
    img.data[o] = Math.min(255, r * m); img.data[o + 1] = Math.min(255, g * m); img.data[o + 2] = Math.min(255, b * m); img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const wrap = (draw) => { for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) { ctx.save(); ctx.translate(dx, dy); draw(ctx); ctx.restore(); } };
  strokes?.(ctx, rng, wrap, size);
  return ctx.getImageData(0, 0, size, size).data;
}

function blades(colors, count, len, width) {
  return (ctx, rng, wrap, S) => {
    for (let i = 0; i < count; i++) {
      const x = rng.range(0, S), y = rng.range(0, S), a = rng.range(0, Math.PI * 2), l = len * rng.range(0.4, 1.1);
      const col = rng.pick(colors), alpha = rng.range(0.15, 0.42);
      wrap((c) => { c.strokeStyle = col; c.globalAlpha = alpha; c.lineWidth = width; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); });
    }
  };
}
function pebbles(colors, count, rMin, rMax) {
  return (ctx, rng, wrap, S) => {
    for (let i = 0; i < count; i++) {
      const x = rng.range(0, S), y = rng.range(0, S), r = rng.range(rMin, rMax), col = rng.pick(colors), alpha = rng.range(0.3, 0.75);
      wrap((c) => { c.fillStyle = col; c.globalAlpha = alpha; c.beginPath(); c.ellipse(x, y, r, r * rng.range(0.6, 1), rng.range(0, 3), 0, Math.PI * 2); c.fill(); });
    }
  };
}

/** One painter per layer, so painting can be spread across frames. */
function layerPainters(size) {
  const P = PALETTE, out = [];
  out.push(() => paint(size, 'grass', P.grass, 0.28, blades([P.grassDark, P.grassLight, '#767a3c'], 3400, 5, 1.1)));
  out.push(() => paint(size, 'dry', P.dry, 0.22, blades([P.dryLight, P.dryDark, '#c9b066'], 3200, 5.5, 1)));
  out.push(() => paint(size, 'dirt', P.dirt, 0.3, pebbles([P.dirtDark, P.dirtLight, '#8a6a43'], 900, 0.6, 2.4)));
  out.push(() => paint(size, 'road', P.road, 0.18, (ctx, rng, wrap, S) => {
    pebbles([P.roadDark, P.roadLight], 700, 0.5, 1.8)(ctx, rng, wrap, S);
    pebbles(['#8e7150'], 40, 2, 4)(ctx, rng, wrap, S);
  }));
  out.push(() => paint(size, 'rock', P.granite, 0.35, (ctx, rng, wrap, S) => {
    let y = 0; // strata bands
    while (y < S) { const h = rng.range(6, 22), col = rng.chance(0.5) ? '#8d9097' : '#6b6e74'; wrap((c) => { c.fillStyle = col; c.globalAlpha = 0.14; c.fillRect(0, y, S, h); }); y += h + rng.range(2, 10); }
    for (let i = 0; i < 46; i++) { // cracks
      let x = rng.range(0, S), cy = rng.range(0, S); const pts = [[x, cy]];
      for (let k = 0; k < 6; k++) { x += rng.range(-9, 9); cy += rng.range(4, 12); pts.push([x, cy]); }
      wrap((c) => { c.strokeStyle = '#3e4046'; c.globalAlpha = 0.45; c.lineWidth = rng.range(0.6, 1.6); c.beginPath(); pts.forEach(([px, py], j) => (j ? c.lineTo(px, py) : c.moveTo(px, py))); c.stroke(); });
    }
  }));
  out.push(() => paint(size, 'sand', P.sand, 0.18, (ctx, rng, wrap, S) => {
    for (let i = 0; i < 26; i++) { // wind ripples
      const y0 = (i / 26) * S, col = i % 2 ? P.sandLight : P.sandDark;
      wrap((c) => { c.strokeStyle = col; c.globalAlpha = 0.35; c.lineWidth = 2; c.beginPath(); for (let x = 0; x <= S; x += 8) c.lineTo(x, y0 + Math.sin((x / S) * Math.PI * 4 + i) * 3); c.stroke(); });
    }
    pebbles([P.sandDark], 160, 0.4, 1.2)(ctx, rng, wrap, S);
  }));
  out.push(() => paint(size, 'snow', P.snow, 0.06, pebbles([P.snowShade], 260, 2, 7)));
  out.push(() => paint(size, 'salt', P.salt, 0.08, (ctx, rng, wrap, S) => {
    for (let i = 0; i < 70; i++) { // polygon cracks
      const x = rng.range(0, S), y = rng.range(0, S), a = rng.range(0, Math.PI), l = rng.range(14, 40);
      wrap((c) => { c.strokeStyle = P.saltCrack; c.globalAlpha = 0.6; c.lineWidth = 1.3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); });
    }
  }));
  // Macro variation (grey, read from the red channel) to break up tiling at distance.
  out.push(() => paint(size, 'macro', '#808080', 0.9, null));
  return out;
}

function paintDetailNormal(size) {
  const rng = new RNG('terrain-detail'), f = fbmTile(rng, 5 + Math.max(0, Math.round(Math.log2(size / 256))), 8), data = new Uint8Array(size * size * 4), h = new Float32Array(size * size); // Part 16: finer octaves at 512 / 1024
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = f(x / size, y / size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xl = (x - 1 + size) % size, xr = (x + 1) % size, yu = (y - 1 + size) % size, yd = (y + 1) % size;
    const dx = (h[y * size + xr] - h[y * size + xl]) * 6, dy = (h[yd * size + x] - h[yu * size + x]) * 6;
    const l = Math.hypot(dx, dy, 1), o = (y * size + x) * 4;
    data[o] = (-dx / l * 0.5 + 0.5) * 255; data[o + 1] = (-dy / l * 0.5 + 0.5) * 255; data[o + 2] = (1 / l * 0.5 + 0.5) * 255; data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = anisotropy(); tex.needsUpdate = true;
  return tex;
}

/** sRGB byte → linear float, and back (for tinting painted rock into sandstone and red rock). */
const toLin = (b) => { const c = b / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toByte = (l) => { const c = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(c * 255))); };
function tinted(px, from, to) {
  const a = new THREE.Color(from), b = new THREE.Color(to), r = [b.r / a.r, b.g / a.g, b.b / a.b], out = new Uint8Array(px.length);
  for (let i = 0; i < px.length; i += 4) { for (let c = 0; c < 3; c++) out[i + c] = toByte(toLin(px[i + c]) * r[c]); out[i + 3] = 255; }
  return out;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

async function loadPixels(url, size) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} (${res.status})`);
  const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none', resizeWidth: size, resizeHeight: size, resizeQuality: 'high' });
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, size, size); bmp.close?.();
  return ctx.getImageData(0, 0, size, size).data;
}

function scalePixels(px, from, to) {
  if (from === to) return px;
  const c = document.createElement('canvas'); c.width = c.height = from;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px), from, from), 0, 0);
  const d = document.createElement('canvas'); d.width = d.height = to;
  const ctx = d.getContext('2d', { willReadFrequently: true }); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(c, 0, 0, to, to);
  return ctx.getImageData(0, 0, to, to).data;
}

function makeArray(data, size, srgb, renderer, aniso = 4) {
  const t = new THREE.DataArrayTexture(data, size, size, LAYER_COUNT);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = Math.min(aniso, renderer?.capabilities?.getMaxAnisotropy?.() || 1); t.needsUpdate = true;
  return t;
}

/**
 * Builds the colour and nrm arrays. Async: yields between layers so the main thread never stalls for long.
 * @param {THREE.WebGLRenderer} renderer
 * @param {{ baked?: boolean, quality?: string }} [opts] baked: try assets/terrain first; quality picks the baked size
 * @returns {Promise<{ array: THREE.DataArrayTexture, nrm: THREE.DataArrayTexture, detail: THREE.DataTexture, baked: boolean, size: number }>}
 */
export async function createTerrainTextures(renderer, opts = {}) {
  const painters = layerPainters(TUNING.textureSize);
  let baked = null, size = TUNING.textureSize;
  if (opts.baked) {
    const bs = TUNING.bakedSize[opts.quality] || 1024;
    try {
      const names = LAYERS_ORDER.filter((n) => n !== 'macro');
      const files = await Promise.all(names.flatMap((n) => [`${n}_albedo.webp`, `${n}_nrm.webp`].map((f) => loadPixels(new URL(f, BAKED_DIR).href, bs))));
      baked = {}; names.forEach((n, i) => { baked[n] = { albedo: files[i * 2], nrm: files[i * 2 + 1] }; });
      size = bs;
    } catch (err) { console.info(`[terrain] baked textures unavailable, using painted ones (${err.message})`); baked = null; }
  }
  const layerBytes = size * size * 4, color = new Uint8Array(layerBytes * LAYER_COUNT), nrm = new Uint8Array(layerBytes * LAYER_COUNT);
  let painted = [];
  for (let i = 0; i < 9; i++) { painted.push(painters[i]()); await tick(); }
  const rockPx = painted[4];
  painted.push(tinted(rockPx, PALETTE.granite, PALETTE.sandstone), tinted(rockPx, PALETTE.granite, PALETTE.mesa));
  for (let i = 0; i < LAYER_COUNT; i++) {
    const name = LAYERS_ORDER[i], b = baked?.[name];
    color.set(b ? b.albedo : scalePixels(painted[i], TUNING.textureSize, size), i * layerBytes);
    if (b) nrm.set(b.nrm, i * layerBytes);
    else { const r = Math.round(PAINTED_ROUGHNESS[i] * 255); for (let o = i * layerBytes, e = o + layerBytes; o < e; o += 4) { nrm[o] = 128; nrm[o + 1] = 128; nrm[o + 2] = r; nrm[o + 3] = 255; } }
    if (i % 3 === 2) await tick();
  }
  painted = null;
  const aniso = TUNING.anisotropy[opts.quality] || 4;
  return { array: makeArray(color, size, true, renderer, aniso), nrm: makeArray(nrm, size, false, renderer, aniso), detail: paintDetailNormal(sizeFor('terrainDetail')), baked: !!baked, size };
}

const linear = (h) => new THREE.Color(h); // THREE.Color stores linear values

/**
 * MeshStandardMaterial with the splat blend injected. Geometry needs splat0, splat1 (Uint8 normalized vec4) and rockTint.
 * @param {{array: THREE.DataArrayTexture, nrm: THREE.DataArrayTexture, detail: THREE.DataTexture, baked: boolean}} textures
 * @param {{ lodTint?: THREE.Color }} [opts]
 */
export function createTerrainMaterial(textures, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const p = linear(PALETTE.pineFloor), q = linear(PALETTE.grass), baked = !!textures.baked;
  const uniforms = {
    terrainLayers: { value: textures.array }, terrainNrm: { value: textures.nrm }, terrainDetail: { value: textures.detail },
    uScales: { value: TUNING.scales.map((s) => 1 / s) }, uPine: { value: new THREE.Vector3(p.r / q.r, p.g / q.g, p.b / q.b) },
    uHighland: { value: baked ? TUNING.bakedHighlandGreen : TUNING.highlandGreen },
    uDetail: { value: new THREE.Vector2(TUNING.detailFade, baked ? TUNING.bakedDetail : TUNING.detailStrength) },
    uMacro: { value: new THREE.Vector2(1 / TUNING.macroScale, TUNING.macroAmount) },
    uNormalStrength: { value: baked ? TUNING.bakedNormal : 0 }, uLodTint: { value: opts.lodTint || new THREE.Color(1, 1, 1) },
    uAntiTile: { value: baked ? TUNING.bakedAntiTile : TUNING.antiTile },
    // weather (Part 2): Terrain copies weather.wetness / snowCover / snowLevel here each frame
    uWetness: { value: 0 }, uSnowCover: { value: 0 }, uSnowLevel: { value: 150 },
  };
  mat.userData.terrainUniforms = uniforms;
  mat.customProgramCacheKey = () => 'sundown-terrain-5';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 splat0; attribute vec4 splat1; attribute float rockTint;
varying vec4 vSplat0; varying vec4 vSplat1; varying float vRockTint; varying vec3 vTerrainPos; varying vec3 vTerrainNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSplat0 = splat0; vSplat1 = splat1; vRockTint = rockTint;
vTerrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vTerrainNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform highp sampler2DArray terrainLayers; uniform highp sampler2DArray terrainNrm; uniform sampler2D terrainDetail;
uniform float uScales[11]; uniform vec3 uPine; uniform float uHighland; uniform vec2 uDetail; uniform vec2 uMacro; uniform float uNormalStrength; uniform vec3 uLodTint; uniform float uAntiTile;
uniform float uWetness; uniform float uSnowCover; uniform float uSnowLevel;
varying vec4 vSplat0; varying vec4 vSplat1; varying float vRockTint; varying vec3 vTerrainPos; varying vec3 vTerrainNormal;
vec2 tRot(vec2 v) { return vec2(v.x * 0.8 - v.y * 0.6, v.x * 0.6 + v.y * 0.8); }
vec2 tUnrot(vec2 v) { return vec2(v.x * 0.8 + v.y * 0.6, -v.x * 0.6 + v.y * 0.8); }
// Top-projected layer (uv = world xz), sampled at two scales (the second rotated) so the repeat never lines up.
void tTop(float w, float L, float s, vec2 uv, vec2 dx, vec2 dy, inout vec3 alb, inout vec3 pert, inout float rough) {
  vec3 a = textureGrad(terrainLayers, vec3(uv * s, L), dx * s, dy * s).rgb;
  vec3 n = textureGrad(terrainNrm, vec3(uv * s, L), dx * s, dy * s).rgb;
  float s2 = s * 0.29; vec2 r = tRot(uv) * s2, rdx = tRot(dx) * s2, rdy = tRot(dy) * s2;
  vec3 a2 = textureGrad(terrainLayers, vec3(r, L), rdx, rdy).rgb, n2 = textureGrad(terrainNrm, vec3(r, L), rdx, rdy).rgb;
  a = mix(a, a2, uAntiTile);
  vec2 d = mix(n.xy * 2.0 - 1.0, tUnrot(n2.xy * 2.0 - 1.0), uAntiTile);
  alb += w * a; pert += w * vec3(d.x, 0.0, d.y); rough += w * mix(n.z, n2.z, uAntiTile);
}
// Biplanar rock: x, y and z projections blended by the surface normal.
void tRock(float w, float L, float s, vec3 bw, inout vec3 alb, inout vec3 pert, inout float rough) {
  vec2 ux = vTerrainPos.zy * s, uy = vTerrainPos.xz * s, uz = vTerrainPos.xy * s;
  vec2 xdx = dFdx(ux), xdy = dFdy(ux), ydx = dFdx(uy), ydy = dFdy(uy), zdx = dFdx(uz), zdy = dFdy(uz);
  vec4 ax = textureGrad(terrainLayers, vec3(ux, L), xdx, xdy), ay = textureGrad(terrainLayers, vec3(uy, L), ydx, ydy), az = textureGrad(terrainLayers, vec3(uz, L), zdx, zdy);
  vec4 nx = textureGrad(terrainNrm, vec3(ux, L), xdx, xdy), ny = textureGrad(terrainNrm, vec3(uy, L), ydx, ydy), nz = textureGrad(terrainNrm, vec3(uz, L), zdx, zdy);
  vec2 dX = nx.xy * 2.0 - 1.0, dY = ny.xy * 2.0 - 1.0, dZ = nz.xy * 2.0 - 1.0;
  alb += w * (ax.rgb * bw.x + ay.rgb * bw.y + az.rgb * bw.z);
  pert += w * (bw.x * vec3(0.0, dX.y, dX.x) + bw.y * vec3(dY.x, 0.0, dY.y) + bw.z * vec3(dZ.x, dZ.y, 0.0));
  rough += w * (nx.z * bw.x + ny.z * bw.y + nz.z * bw.z);
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec2 tuv = vTerrainPos.xz; vec2 tdx = dFdx(tuv), tdy = dFdy(tuv);
vec3 alb = vec3(0.0), tPert = vec3(0.0), grassAlb = vec3(0.0); float tRough = 0.0;
float highland = 1.0 - smoothstep(0.1, 0.45, vRockTint);
if (vSplat0.r > 0.004) tTop(vSplat0.r, 0.0, uScales[0], tuv, tdx, tdy, grassAlb, tPert, tRough);
if (vSplat0.g > 0.004) tTop(vSplat0.g, 1.0, uScales[1], tuv, tdx, tdy, grassAlb, tPert, tRough);
alb += grassAlb * mix(vec3(1.0), uPine, highland * uHighland);
if (vSplat0.b > 0.004) tTop(vSplat0.b, 2.0, uScales[2], tuv, tdx, tdy, alb, tPert, tRough);
if (vSplat0.a > 0.004) tTop(vSplat0.a, 3.0, uScales[3], tuv, tdx, tdy, alb, tPert, tRough);
if (vSplat1.r > 0.004) {
  vec3 bw = pow(abs(normalize(vTerrainNormal)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
  float wG = 1.0 - smoothstep(0.15, 0.4, vRockTint), wR = smoothstep(0.6, 0.85, vRockTint), wS = max(0.0, 1.0 - wG - wR);
  if (wG > 0.01) tRock(vSplat1.r * wG, 4.0, uScales[4], bw, alb, tPert, tRough);
  if (wS > 0.01) tRock(vSplat1.r * wS, 9.0, uScales[9], bw, alb, tPert, tRough);
  if (wR > 0.01) tRock(vSplat1.r * wR, 10.0, uScales[10], bw, alb, tPert, tRough);
}
if (vSplat1.g > 0.004) tTop(vSplat1.g, 5.0, uScales[5], tuv, tdx, tdy, alb, tPert, tRough);
if (vSplat1.b > 0.004) tTop(vSplat1.b, 6.0, uScales[6], tuv, tdx, tdy, alb, tPert, tRough);
if (vSplat1.a > 0.004) tTop(vSplat1.a, 7.0, uScales[7], tuv, tdx, tdy, alb, tPert, tRough);
float macro = textureGrad(terrainLayers, vec3(tuv * uMacro.x, 8.0), tdx * uMacro.x, tdy * uMacro.x).r;
alb *= (1.0 - uMacro.y * 0.5) + uMacro.y * macro * 1.6;
diffuseColor.rgb *= alb * uLodTint;
// weather: wet ground darkens and turns glossy (puddles in flat hollows); fresh snow settles on up-facing ground
float tUpN = normalize(vTerrainNormal).y;
float tWet = uWetness * (0.55 + 0.45 * smoothstep(0.75, 0.97, tUpN));
float tPud = uWetness * uWetness * smoothstep(0.94, 0.99, tUpN) * smoothstep(0.5, 0.72, macro) * (1.0 - vSplat1.g - vSplat1.a);
diffuseColor.rgb *= 1.0 - 0.4 * tWet - 0.15 * tPud;
float tSnow = uSnowCover * smoothstep(0.6, 0.82, tUpN) * smoothstep(uSnowLevel - 15.0, uSnowLevel + 5.0, vTerrainPos.y);
tSnow *= smoothstep(0.0, 0.35, macro * 0.6 + uSnowCover * 0.7 - 0.25);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.77, 0.81), tSnow);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(tRough, 0.04, 1.0);
roughnessFactor = mix(roughnessFactor, 0.22, tWet * 0.8 * (1.0 - tSnow));
roughnessFactor = mix(roughnessFactor, 0.06, tPud * (1.0 - tSnow));
roughnessFactor = mix(roughnessFactor, 0.8, tSnow);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (uNormalStrength > 0.0) normal = normalize(normal + (viewMatrix * vec4(tPert * uNormalStrength * (1.0 - tPud * 0.85) * (1.0 - tSnow * 0.3), 0.0)).xyz);
float tdist = length(vTerrainPos - cameraPosition), tfade = 1.0 - smoothstep(uDetail.x * 0.35, uDetail.x, tdist);
if (tfade > 0.0 && uDetail.y > 0.0) {
  vec2 dn = textureGrad(terrainDetail, tuv * 0.4, tdx * 0.4, tdy * 0.4).xy * 2.0 - 1.0;
  normal = normalize(normal + (viewMatrix * vec4(dn.x, 0.0, dn.y, 0.0)).xyz * uDetail.y * tfade);
}`);
  };
  return mat;
}

export { PALETTE };
