import * as THREE from 'three';
import { anisotropy } from '../../render/TextureDetail.js';
import { RNG } from '../../core/utils/rng.js';

/**
 * The shared human texture atlas: a 4 × 4 grid of tileable material swatches (skin, cotton, denim, wool,
 * leather, felt, hair, eyes, oilcloth, plaid, pinstripe, fleece, metal, knit, calico, plain).
 * Colour comes from vertex colours; the atlas adds luminance detail, a normal map from drawn height
 * and a packed roughness (G) / metalness (B) map. Built once on canvas and shared by every human.
 */
export const TUNING = { size: 1024, normalStrength: 2.2, phoneSize: 512 };

export const REGIONS = Object.freeze({
  skin: 0, cotton: 1, denim: 2, wool: 3, leather: 4, felt: 5, hair: 6, eye: 7,
  canvas: 8, plaid: 9, stripe: 10, fleece: 11, metal: 12, knit: 13, calico: 14, plain: 15,
});
const GRID = 4, INSET = 0.02;

/** Atlas UV for region `r` at local (u, v) in 0..1. */
export function atlasUV(r, u, v, out) {
  const col = r % GRID, row = (r / GRID) | 0;
  const uu = Math.min(1, Math.max(0, u)), vv = Math.min(1, Math.max(0, v));
  out[0] = (col + INSET + uu * (1 - 2 * INSET)) / GRID;
  out[1] = 1 - (row + INSET + vv * (1 - 2 * INSET)) / GRID;
  return out;
}

/** Per-region roughness (0..1) and metalness used for the packed map. */
export const SURFACE = {
  skin: [0.58, 0], cotton: [0.92, 0], denim: [0.88, 0], wool: [0.95, 0], leather: [0.55, 0], felt: [0.93, 0],
  hair: [0.62, 0], eye: [0.12, 0], canvas: [0.68, 0], plaid: [0.92, 0], stripe: [0.88, 0], fleece: [0.98, 0],
  metal: [0.38, 1], knit: [0.96, 0], calico: [0.9, 0], plain: [0.85, 0],
};

/**
 * Builds { map, normalMap, ormMap } as CanvasTextures. `size` is the atlas edge in pixels.
 * Drawing happens in three canvases: luminance albedo, height (for normals) and roughness/metal.
 */
export function buildHumanAtlas(size = TUNING.size) {
  return buildAtlas({ size, regions: REGIONS, draw: DRAW, surface: SURFACE, seed: 'human-atlas' });
}

/**
 * Generic 4 × 4 swatch atlas used by humans and horses.
 * @param {{size: number, regions: object, draw: object, surface: object, seed: string, normalStrength?: number}} o
 */
export function buildAtlas({ size, regions, draw, surface, seed, normalStrength = TUNING.normalStrength }) {
  const cell = size / GRID, k = size > 1024 ? size / 1024 : 1; // Part 16: past 1024 px, paint in 1024-px space, scaled (sharper, same look)
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const albedo = mk(), height = mk(), orm = mk();
  const A = albedo.getContext('2d'), H = height.getContext('2d'), O = orm.getContext('2d');
  A.fillStyle = '#ffffff'; A.fillRect(0, 0, size, size);
  H.fillStyle = '#808080'; H.fillRect(0, 0, size, size);
  const rng = new RNG(seed);
  for (const [name, r] of Object.entries(regions)) {
    const x0 = (r % GRID) * cell, y0 = ((r / GRID) | 0) * cell;
    const [rough, metal] = surface[name] || [0.85, 0];
    O.fillStyle = `rgb(255,${Math.round(rough * 255)},${Math.round(metal * 255)})`; O.fillRect(x0, y0, cell, cell);
    for (const ctx of [A, H, O]) { ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, cell, cell); ctx.clip(); ctx.translate(x0, y0); if (k !== 1) ctx.scale(k, k); }
    draw[name]?.({ A, H, O, s: cell / k, rng: rng.fork(name) });
    for (const ctx of [A, H, O]) ctx.restore();
  }
  // the relief was painted in 1024-px space, so past 1024 the normal map stays at 1024 (nothing finer to hold)
  let hsrc = height; if (k !== 1) { hsrc = document.createElement('canvas'); hsrc.width = hsrc.height = size / k; hsrc.getContext('2d').drawImage(height, 0, 0, size / k, size / k); }
  const normal = heightToNormal(hsrc, size / k, cell / k, normalStrength);
  if (k !== 1) { // a fine weave-and-pore grain at full resolution, the detail 1024 px couldn't hold
    const g = document.createElement('canvas'); g.width = g.height = 128; const gx = g.getContext('2d'), img = gx.createImageData(128, 128), gd = img.data, r = new RNG(`${seed}-grain`);
    for (let i = 0; i < gd.length; i += 4) { const v = 255 - Math.abs(r.next() + r.next() - 1) * 46; gd[i] = gd[i + 1] = gd[i + 2] = v; gd[i + 3] = 255; }
    gx.putImageData(img, 0, 0);
    A.globalCompositeOperation = 'multiply'; A.globalAlpha = 1; // the swatches are near-white (vertex colour tints them), so darken-only A.fillStyle = A.createPattern(g, 'repeat'); A.fillRect(0, 0, size, size); A.globalCompositeOperation = 'source-over'; A.globalAlpha = 1;
  }
  const tex = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  // Part 16: past 1024 px the roughness / metal map goes at half size (it's mostly flat per swatch), saving a third
  let ormOut = orm;
  if (size > 1024) { ormOut = document.createElement('canvas'); ormOut.width = ormOut.height = size / 2; const c = ormOut.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(orm, 0, 0, size / 2, size / 2); }
  const t = (canvas, srgb) => { const x = tex(canvas, srgb); x.anisotropy = Math.max(4, anisotropy()); return x; };
  return { map: t(albedo, true), normalMap: t(normal, false), ormMap: t(ormOut, false), canvases: { albedo, height, orm, normal } };
}

// Draws `fn(dx, dy)` at the 9 wrapped offsets so strokes near an edge continue on the other side (tileable swatches).
// Only the copies that actually reach into the swatch are drawn (x, y, r give the stroke's extent).
export function wrap(s, fn, x = s / 2, y = s / 2, r = s) {
  for (const dx of [-s, 0, s]) {
    if (x + dx + r < 0 || x + dx - r > s) continue;
    for (const dy of [-s, 0, s]) { if (y + dy + r < 0 || y + dy - r > s) continue; fn(dx, dy); }
  }
}
export const grey = (v, a = 1) => `rgba(${v},${v},${v},${a})`;

export function speckle(ctx, s, rng, n, size, lo, hi, alpha) {
  for (let i = 0; i < n; i++) {
    const x = rng.range(0, s), y = rng.range(0, s), r = rng.range(size * 0.5, size), v = Math.round(rng.range(lo, hi));
    ctx.fillStyle = grey(v, alpha);
    wrap(s, (dx, dy) => { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill(); }, x, y, r);
  }
}
/** Weave as a repeating pattern (one small tile instead of thousands of rectangles). */
export function weave(ctx, s, pitch, lo, hi, alpha, rng, twill = 0) {
  const n = twill ? 4 : 2, t = document.createElement('canvas');
  t.width = t.height = pitch * n;
  const g = t.getContext('2d');
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const k = twill ? ((x + y) % 4 < 2 ? 1 : 0) : (x + y) % 2;
      g.fillStyle = grey(Math.round(k ? hi : lo), alpha);
      if (twill) g.fillRect(x * pitch, y * pitch, pitch, pitch);
      else g.fillRect(x * pitch + (k ? 0 : pitch * 0.15), y * pitch + (k ? pitch * 0.15 : 0), k ? pitch : pitch * 0.7, k ? pitch * 0.7 : pitch);
    }
  }
  ctx.fillStyle = ctx.createPattern(t, 'repeat');
  ctx.fillRect(0, 0, s, s);
  void rng;
}
export function stripes(ctx, s, step, width, value, alpha, vertical = true) {
  ctx.fillStyle = grey(value, alpha);
  for (let p = 0; p < s; p += step) { if (vertical) ctx.fillRect(p, 0, width, s); else ctx.fillRect(0, p, s, width); }
}

export const DRAW = {
  skin({ A, H, s, rng }) {
    speckle(A, s, rng, 900, 3, 225, 255, 0.25);
    speckle(A, s, rng, 60, 14, 215, 245, 0.12);
    speckle(H, s, rng, 2500, 1.2, 100, 150, 0.5); // pores
    speckle(H, s, rng, 40, 18, 110, 150, 0.15);
  },
  cotton({ A, H, s, rng }) { weave(A, s, 2, 238, 252, 1, rng); weave(H, s, 2, 115, 150, 1, rng); speckle(A, s, rng, 120, 10, 220, 245, 0.08); },
  denim({ A, H, s, rng }) {
    weave(A, s, 2, 225, 250, 1, rng, 1); weave(H, s, 2, 110, 155, 1, rng, 1);
    for (let i = 0; i < 70; i++) { const x = rng.range(0, s); A.fillStyle = grey(255, 0.12); A.fillRect(x, 0, rng.range(1, 3), s); }
  },
  wool({ A, H, s, rng }) {
    weave(A, s, 3, 232, 250, 1, rng); weave(H, s, 3, 115, 150, 1, rng);
    speckle(A, s, rng, 1500, 1.2, 210, 255, 0.25); speckle(H, s, rng, 1500, 1.2, 100, 160, 0.3);
  },
  leather({ A, H, s, rng }) {
    speckle(A, s, rng, 400, 8, 200, 250, 0.18); speckle(H, s, rng, 3000, 1.5, 95, 145, 0.45);
    H.strokeStyle = grey(95, 0.5); H.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      const x = rng.range(0, s), y = rng.range(0, s), l = rng.range(6, 26), a = rng.range(0, Math.PI);
      wrap(s, (dx, dy) => { H.beginPath(); H.moveTo(x + dx, y + dy); H.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); H.stroke(); }, x, y, l);
    }
    A.fillStyle = grey(255, 0.18); A.fillRect(0, 0, s, s * 0.04); // worn edge light
  },
  felt({ A, H, s, rng }) { speckle(A, s, rng, 3000, 1.3, 200, 255, 0.3); speckle(H, s, rng, 3000, 1.6, 100, 160, 0.35); },
  hair({ A, H, s, rng }) {
    for (let i = 0; i < 1400; i++) {
      const x = rng.range(0, s), v = Math.round(rng.range(170, 255)), w = rng.range(0.6, 1.8), y = rng.range(0, s), l = rng.range(s * 0.2, s * 0.6);
      A.fillStyle = grey(v, 0.55); H.fillStyle = grey(Math.round(rng.range(90, 175)), 0.6);
      wrap(s, (dx, dy) => { A.fillRect(x + dx, y + dy, w, l); H.fillRect(x + dx, y + dy, w, l); }, x, y + l / 2, l);
    }
  },
  eye({ A, H, O, s }) {
    // Four iris colours in quadrants: brown, blue, green, hazel. Sclera stays near white.
    const irises = [['#5a3a1c', '#2a160a'], ['#4f7fa6', '#20384f'], ['#5f7a45', '#2b3a1d'], ['#7a6034', '#3a2a12']];
    A.fillStyle = '#f2ece4'; A.fillRect(0, 0, s, s);
    irises.forEach(([c, d], i) => {
      const cx = (i % 2) * s / 2 + s / 4, cy = ((i / 2) | 0) * s / 2 + s / 4, r = s * 0.13;
      const g = A.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      g.addColorStop(0, d); g.addColorStop(0.35, c); g.addColorStop(0.85, c); g.addColorStop(1, '#1d140c');
      A.fillStyle = g; A.beginPath(); A.arc(cx, cy, r, 0, Math.PI * 2); A.fill();
      A.fillStyle = '#0b0806'; A.beginPath(); A.arc(cx, cy, r * 0.38, 0, Math.PI * 2); A.fill();
      A.fillStyle = 'rgba(255,255,255,0.85)'; A.beginPath(); A.arc(cx - r * 0.35, cy - r * 0.35, r * 0.13, 0, Math.PI * 2); A.fill();
      const v = A.createRadialGradient(cx, cy, r * 1.4, cx, cy, s * 0.25); // sclera shading toward the edge
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(120,80,70,0.25)');
      A.fillStyle = v; A.fillRect(cx - s / 4, cy - s / 4, s / 2, s / 2);
      H.fillStyle = grey(150); H.beginPath(); H.arc(cx, cy, r, 0, Math.PI * 2); H.fill();
    });
    O.fillStyle = 'rgb(255,30,0)'; O.fillRect(0, 0, s, s);
  },
  canvas({ A, H, s, rng }) {
    weave(A, s, 3, 232, 250, 1, rng); weave(H, s, 3, 116, 146, 1, rng);
    // creases and wear streaks of an oilcloth duster
    for (let i = 0; i < 45; i++) {
      const x = rng.range(0, s), w = rng.range(3, 10), v = rng.chance(0.5) ? 175 : 85;
      H.fillStyle = grey(v, 0.12); A.fillStyle = grey(v > 128 ? 255 : 215, 0.06);
      wrap(s, (dx) => { H.fillRect(x + dx, 0, w, s); A.fillRect(x + dx, 0, w, s); });
    }
    speckle(A, s, rng, 200, 12, 185, 230, 0.1);
  },
  plaid({ A, H, s, rng }) {
    weave(A, s, 2, 236, 252, 1, rng); weave(H, s, 2, 115, 150, 1, rng);
    const step = s / 4;
    A.fillStyle = grey(120, 0.38); for (let p = 0; p < s; p += step) { A.fillRect(p, 0, step * 0.35, s); A.fillRect(0, p, s, step * 0.35); }
    A.fillStyle = grey(60, 0.25); for (let p = step * 0.6; p < s; p += step) { A.fillRect(p, 0, 3, s); A.fillRect(0, p, s, 3); }
  },
  stripe({ A, H, s, rng }) { weave(A, s, 2, 236, 250, 1, rng); weave(H, s, 2, 115, 148, 1, rng); stripes(A, s, s / 10, 2, 255, 0.55); },
  fleece({ A, H, s, rng }) {
    speckle(A, s, rng, 2200, 4, 200, 255, 0.45); speckle(H, s, rng, 2600, 4, 70, 210, 0.55);
  },
  metal({ A, H, s, rng }) { speckle(A, s, rng, 600, 2, 200, 255, 0.4); speckle(H, s, rng, 300, 2, 110, 150, 0.4); },
  knit({ A, H, s, rng }) {
    for (let y = 0; y < s; y += 6) for (let x = 0; x < s; x += 6) {
      const v = 225 + rng.int(0, 28);
      A.fillStyle = grey(v); A.beginPath(); A.ellipse(x + 3, y + 3, 2.6, 3.2, (x / 6) % 2 ? 0.5 : -0.5, 0, Math.PI * 2); A.fill();
      H.fillStyle = grey(165); H.beginPath(); H.ellipse(x + 3, y + 3, 2.4, 3, (x / 6) % 2 ? 0.5 : -0.5, 0, Math.PI * 2); H.fill();
    }
  },
  calico({ A, H, s, rng }) {
    weave(A, s, 2, 238, 252, 1, rng); weave(H, s, 2, 115, 148, 1, rng);
    for (let i = 0; i < 260; i++) {
      const x = rng.range(0, s), y = rng.range(0, s), r = rng.range(2, 4.5), v = rng.chance(0.5) ? 150 : 255;
      A.fillStyle = grey(v, 0.7);
      wrap(s, (dx, dy) => { for (let k = 0; k < 5; k++) { const a = k * 1.2566; A.beginPath(); A.arc(x + dx + Math.cos(a) * r, y + dy + Math.sin(a) * r, r * 0.55, 0, Math.PI * 2); A.fill(); } });
    }
  },
  plain({ A, H, s, rng }) { speckle(A, s, rng, 300, 6, 230, 255, 0.15); speckle(H, s, rng, 800, 2, 115, 140, 0.3); },
};

/** Sobel normal map from the height canvas; neighbours wrap inside each region so swatches stay tileable. */
function heightToNormal(heightCanvas, size, cell, strength) {
  const src = heightCanvas.getContext('2d').getImageData(0, 0, size, size).data;
  const out = document.createElement('canvas'); out.width = out.height = size;
  const ctx = out.getContext('2d'), img = ctx.createImageData(size, size), d = img.data;
  const hgt = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) hgt[i] = src[i * 4] / 255;
  for (let y = 0; y < size; y++) {
    const cy = Math.floor(y / cell) * cell, ly = y - cy;
    const ru = (cy + ((ly - 1 + cell) % cell)) * size, rd = (cy + ((ly + 1) % cell)) * size, row = y * size;
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cell) * cell, lx = x - cx;
      const xl = cx + ((lx - 1 + cell) % cell), xr = cx + ((lx + 1) % cell);
      const dx = (hgt[row + xr] - hgt[row + xl]) * strength, dy = (hgt[rd + x] - hgt[ru + x]) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1), i = (row + x) * 4;
      d[i] = (-dx * inv * 0.5 + 0.5) * 255;
      d[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      d[i + 2] = (inv * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}
