/**
 * The hand-drawn map of Ashwater County (Part 14), baked once from the world data into a canvas that both the
 * minimap and the map screen draw from. One pixel is `mpp` metres (1 on laptops, 2 on phones).
 *  paper     aged parchment with fibres, foxing and darker, burnt-looking edges
 *  washes    watercolour tints by biome: green valley and riverbanks, grey-green highland, white snowfields,
 *            ochre desert; a faint sepia hill shade from the north-west
 *  contours  thin ink every 20 m, a stronger line every 100 m
 *  hachures  short downhill strokes wherever the ground is steep, longer and darker the steeper it is
 *  forest    a stipple of little tree marks (pines with a point, oaks round, cactus a cross)
 *  water     river and lake in a blue-grey wash, inked shores with a second ripple line
 *  roads     double ink lines for wagon roads, a dashed line for trails, cross-hatched bridges
 * Labels and icons are not baked: the map screen and the minimap draw them live, so places can be revealed.
 * bake() is a generator: call next() until done, spreading the work over frames (each step stays short).
 */
export const TUNING = { contour: 20, contourMajor: 100, hachureStep: 9, hachureSlope: 0.32, treeEvery: 3, rowsPerStep: 48 };

const N = 1025, SP = 2, ORIGIN = -1024, WORLD_M = 2048, NONE = -10000;
const BIOME_WASH = [[176, 182, 124], [150, 170, 118], [158, 160, 130], [236, 234, 228], [214, 170, 112]]; // valley riverbank highland snow desert
const INK = 'rgba(52,36,22,'; const WATER = [150, 168, 166];

/** Small deterministic noise. */
function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function bil(arr, x, z) {
  let fx = (x - ORIGIN) / SP, fz = (z - ORIGIN) / SP; const max = N - 1.000001;
  fx = fx < 0 ? 0 : fx > max ? max : fx; fz = fz < 0 ? 0 : fz > max ? max : fz;
  const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * N + i;
  return (arr[k] + (arr[k + 1] - arr[k]) * tx) * (1 - tz) + (arr[k + N] + (arr[k + N + 1] - arr[k + N]) * tx) * tz;
}
const near = (arr, x, z) => { let i = Math.round((x - ORIGIN) / SP), j = Math.round((z - ORIGIN) / SP); i = i < 0 ? 0 : i >= N ? N - 1 : i; j = j < 0 ? 0 : j >= N ? N - 1 : j; return arr[j * N + i]; };

/**
 * @param {object} data terrain.data (heights, waterY, biome, river, roads, bridges)
 * @param {{ size?: number, trees?: Array<{x, z, kind}> , makeCanvas?: (w, h) => HTMLCanvasElement }} opts
 * @yields progress 0..1; the return value is { canvas, mpp, size }
 */
export function* bake(data, { size = 2048, trees = [], makeCanvas = defaultCanvas } = {}) {
  const T = TUNING, mpp = WORLD_M / size, cv = makeCanvas(size, size), ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size), px = img.data, H = data.heights, W = data.waterY, B = data.biome;
  const toPx = (x) => (x - ORIGIN) / mpp;
  // ---- pass 0: heights and the water mask at map resolution
  const hp = new Float32Array(size * size), wm = new Uint8Array(size * size);
  for (let row = 0; row < size; row += T.rowsPerStep * 2) {
    for (let y = row; y < Math.min(size, row + T.rowsPerStep * 2); y++) {
      const z = ORIGIN + (y + 0.5) * mpp;
      for (let x = 0; x < size; x++) { const wx = ORIGIN + (x + 0.5) * mpp, h = bil(H, wx, z), k = y * size + x; hp[k] = h; const w = near(W, wx, z); wm[k] = w > NONE / 2 && w > h + 0.05 ? 1 : 0; }
    }
    yield 0.2 * Math.min(1, (row + T.rowsPerStep * 2) / size);
  }
  const at = (a, x, y) => a[(y < 0 ? 0 : y >= size ? size - 1 : y) * size + (x < 0 ? 0 : x >= size ? size - 1 : x)];
  const sh = Math.max(1, Math.round(4 / mpp)), r1 = Math.max(1, Math.round(1.5 / mpp)), r4 = Math.max(2, Math.round(4 / mpp));
  // ---- pass 1: paper, washes, hill shade, contours, water (per pixel)
  for (let row = 0; row < size; row += T.rowsPerStep) {
    for (let y = row; y < Math.min(size, row + T.rowsPerStep); y++) {
      const z = ORIGIN + (y + 0.5) * mpp;
      for (let x = 0; x < size; x++) {
        const wx = ORIGIN + (x + 0.5) * mpp, k = y * size + x, h = hp[k], o = k * 4;
        // paper: fibres and blotches
        const fib = vnoise(x * 0.9, y * 0.06) * 0.5 + vnoise(x * 0.07, y * 1.1) * 0.5, blot = vnoise(x / 90, y / 90), grain = hash2(x, y);
        let r = 233 - blot * 18 - fib * 6 + grain * 6, g = 220 - blot * 22 - fib * 7 + grain * 6, b = 188 - blot * 26 - fib * 8 + grain * 5;
        // edge burn
        const ex = Math.min(x, size - 1 - x) / size, ey = Math.min(y, size - 1 - y) / size, edge = Math.min(ex, ey), burn = edge < 0.03 ? (1 - edge / 0.03) ** 2 * (0.6 + vnoise(x / 20, y / 20) * 0.6) : 0;
        // hill shade (light from the north-west), sepia
        const shade = Math.max(-1, Math.min(1, (at(hp, x + sh, y) - at(hp, x - sh, y) + at(hp, x, y + sh) - at(hp, x, y - sh)) / (16 * sh * mpp / 4)));
        r -= shade * 26; g -= shade * 30; b -= shade * 32;
        // biome wash (watercolour: blotchy)
        const bw = BIOME_WASH[near(B, wx, z)] || BIOME_WASH[0], wa = 0.26 + vnoise(x / 45 + 7, y / 45) * 0.16;
        r += (bw[0] - r) * wa; g += (bw[1] - g) * wa; b += (bw[2] - b) * wa;
        if (wm[k]) {
          const wa2 = 0.62 + vnoise(x / 12, y / 12) * 0.12; r += (WATER[0] - r) * wa2; g += (WATER[1] - g) * wa2; b += (WATER[2] - b) * wa2;
          if (!at(wm, x + r1, y) || !at(wm, x - r1, y) || !at(wm, x, y + r1) || !at(wm, x, y - r1)) { r = 70; g = 62; b = 58; } // inked shore
        } else {
          if (at(wm, x + r4, y) || at(wm, x - r4, y) || at(wm, x, y + r4) || at(wm, x, y - r4)) { r -= 22; g -= 18; b -= 12; } // ripple line off the shore
          const c0 = Math.floor(h / T.contour), hr = at(hp, x + 1, y), hd = at(hp, x, y + 1);
          if (c0 !== Math.floor(hr / T.contour) || c0 !== Math.floor(hd / T.contour)) {
            const M = T.contourMajor, major = Math.floor(h / M) !== Math.floor(hr / M) || Math.floor(h / M) !== Math.floor(hd / M);
            const kk = major ? 0.42 : 0.2; r += (92 - r) * kk; g += (64 - g) * kk; b += (40 - b) * kk;
          }
        }
        r -= burn * 120; g -= burn * 110; b -= burn * 95;
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
      }
    }
    yield 0.2 + 0.4 * Math.min(1, (row + T.rowsPerStep) / size);
  }
  ctx.putImageData(img, 0, 0);
  // ---- pass 2: hachures
  ctx.lineCap = 'round';
  const step = T.hachureStep, rnd = mulberry(1899);
  for (let wz = ORIGIN + step / 2; wz < -ORIGIN; wz += step * 24) {
    ctx.beginPath(); ctx.strokeStyle = `${INK}0.5)`; ctx.lineWidth = Math.max(0.7, 1 / mpp);
    for (let zz = wz; zz < Math.min(-ORIGIN, wz + step * 24); zz += step) for (let wx = ORIGIN + step / 2; wx < -ORIGIN; wx += step) {
      const x = wx + (rnd() - 0.5) * step * 0.6, z = zz + (rnd() - 0.5) * step * 0.6;
      const pi = Math.round(toPx(x) - 0.5), pj = Math.round(toPx(z) - 0.5); if (at(wm, pi, pj)) continue;
      const gx = (bil(H, x + 2, z) - bil(H, x - 2, z)) / 4, gz = (bil(H, x, z + 2) - bil(H, x, z - 2)) / 4, s = Math.hypot(gx, gz);
      if (s < T.hachureSlope) continue;
      const len = Math.min(step * 1.4, step * (0.5 + s * 0.9)), dx = -gx / s, dz = -gz / s;
      ctx.moveTo(toPx(x), toPx(z)); ctx.lineTo(toPx(x + dx * len), toPx(z + dz * len));
    }
    ctx.stroke();
    yield 0.6 + 0.15 * ((wz - ORIGIN) / WORLD_M);
  }
  // ---- pass 3: forest stipple
  ctx.lineWidth = Math.max(0.6, 0.8 / mpp);
  for (let i = 0; i < trees.length; i += T.treeEvery) {
    const t = trees[i], x = toPx(t.x), y = toPx(t.z), s = Math.max(1.3, 2.4 / mpp);
    if (t.kind === 'pine') { ctx.fillStyle = `${INK}0.55)`; ctx.beginPath(); ctx.moveTo(x, y - s * 1.3); ctx.lineTo(x - s * 0.6, y + s * 0.5); ctx.lineTo(x + s * 0.6, y + s * 0.5); ctx.closePath(); ctx.fill(); }
    else if (t.kind === 'cactus') { ctx.strokeStyle = `${INK}0.55)`; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s * 0.6); ctx.moveTo(x - s * 0.6, y - s * 0.3); ctx.lineTo(x + s * 0.6, y - s * 0.3); ctx.stroke(); }
    else { ctx.strokeStyle = `${INK}0.5)`; ctx.fillStyle = 'rgba(96,110,62,0.35)'; ctx.beginPath(); ctx.arc(x, y - s * 0.3, s * 0.7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    if (i % 3000 === 0) yield 0.75 + 0.1 * (i / Math.max(1, trees.length));
  }
  // ---- pass 4: roads and trails
  for (const r of data.roads || []) {
    const p = r.points, path = new Path2D();
    for (let i = 0; i < p.length; i += 3) { const x = toPx(p[i]), y = toPx(p[i + 2]); if (i) path.lineTo(x, y); else path.moveTo(x, y); }
    if (r.trail) { ctx.setLineDash([5, 4]); ctx.strokeStyle = `${INK}0.75)`; ctx.lineWidth = Math.max(1, 1.6 / mpp); ctx.stroke(path); ctx.setLineDash([]); continue; }
    ctx.strokeStyle = `${INK}0.85)`; ctx.lineWidth = Math.max(3, 7 / mpp); ctx.stroke(path);
    ctx.strokeStyle = 'rgb(226,206,160)'; ctx.lineWidth = Math.max(1.4, 4.2 / mpp); ctx.stroke(path);
  }
  for (const br of data.bridges || []) {
    const x = toPx(br.x ?? br.cx ?? 0), y = toPx(br.z ?? br.cz ?? 0); ctx.strokeStyle = `${INK}0.9)`; ctx.lineWidth = 1.5;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(x - 6 + k * 3, y - 6); ctx.lineTo(x + 6 + k * 3, y + 6); ctx.stroke(); }
  }
  yield 1;
  return { canvas: cv, mpp, size };
}

/** Tree marks from the vegetation system's scattered chunks: [{ x, z, kind: 'pine'|'oak'|'cactus' }]. */
export function treesFromVegetation(veg) {
  const out = [];
  if (!veg?.chunks || !veg.species) return out;
  const kinds = veg.species.map((s) => (s.collider !== 'trunk' ? null : s.id.startsWith('pine') ? 'pine' : s.id === 'saguaro' ? 'cactus' : 'oak'));
  for (const c of veg.chunks) c.lists?.forEach((l, si) => { const k = kinds[si]; if (!k) return; for (let i = 0; i < l.length; i += 8) out.push({ x: l[i], z: l[i + 2], kind: k }); });
  return out;
}

/** Icons for each place type, drawn in ink at (x, y) with size s. */
export function drawIcon(ctx, type, x, y, s, color = 'rgba(52,36,22,0.95)') {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(1, s * 0.09); ctx.lineJoin = 'round';
  const house = (hx, hy, w, h) => { ctx.beginPath(); ctx.moveTo(hx - w / 2, hy); ctx.lineTo(hx - w / 2, hy - h); ctx.lineTo(hx, hy - h - w * 0.45); ctx.lineTo(hx + w / 2, hy - h); ctx.lineTo(hx + w / 2, hy); ctx.closePath(); ctx.stroke(); };
  switch (type) {
    case 'town': house(-s * 0.35, s * 0.3, s * 0.42, s * 0.35); house(s * 0.12, s * 0.38, s * 0.5, s * 0.5); house(s * 0.5, s * 0.3, s * 0.3, s * 0.28); break;
    case 'home': house(0, s * 0.35, s * 0.6, s * 0.45); ctx.beginPath(); ctx.moveTo(s * 0.45, s * 0.35); ctx.lineTo(s * 0.45, -s * 0.5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(s * 0.45, -s * 0.5); ctx.lineTo(s * 0.75, -s * 0.38); ctx.lineTo(s * 0.45, -s * 0.26); ctx.fill(); break;
    case 'estate': house(0, s * 0.35, s * 0.9, s * 0.5); ctx.strokeRect(-s * 0.15, s * 0.05, s * 0.3, s * 0.3); for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(k * s * 0.18, s * 0.5); ctx.lineTo(k * s * 0.18, s * 0.62); ctx.stroke(); } break;
    case 'outpost': house(0, s * 0.35, s * 0.7, s * 0.4); ctx.beginPath(); ctx.moveTo(-s * 0.5, s * 0.35); ctx.lineTo(s * 0.5, s * 0.35); ctx.stroke(); break;
    case 'hideout': ctx.beginPath(); ctx.moveTo(-s * 0.45, s * 0.45); ctx.lineTo(s * 0.45, -s * 0.45); ctx.moveTo(s * 0.45, s * 0.45); ctx.lineTo(-s * 0.45, -s * 0.45); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * 0.18, 0, Math.PI * 2); ctx.fill(); break;
    case 'camp': ctx.beginPath(); ctx.moveTo(-s * 0.5, s * 0.4); ctx.lineTo(0, -s * 0.45); ctx.lineTo(s * 0.5, s * 0.4); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -s * 0.45); ctx.lineTo(0, s * 0.4); ctx.stroke(); break;
    case 'lake': ctx.beginPath(); for (let k = -1; k <= 1; k++) { ctx.moveTo(-s * 0.4, k * s * 0.22); ctx.quadraticCurveTo(-s * 0.2, k * s * 0.22 - s * 0.12, 0, k * s * 0.22); ctx.quadraticCurveTo(s * 0.2, k * s * 0.22 + s * 0.12, s * 0.4, k * s * 0.22); } ctx.stroke(); break;
    case 'edge': ctx.beginPath(); ctx.moveTo(-s * 0.4, 0); ctx.lineTo(s * 0.4, 0); ctx.moveTo(s * 0.15, -s * 0.25); ctx.lineTo(s * 0.42, 0); ctx.lineTo(s * 0.15, s * 0.25); ctx.stroke(); break;
    default: ctx.beginPath(); ctx.moveTo(0, -s * 0.45); ctx.lineTo(s * 0.32, 0); ctx.lineTo(0, s * 0.45); ctx.lineTo(-s * 0.32, 0); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * 0.08, 0, Math.PI * 2); ctx.fill(); // landmark
  }
  ctx.restore();
}

function defaultCanvas(w, h) { if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
