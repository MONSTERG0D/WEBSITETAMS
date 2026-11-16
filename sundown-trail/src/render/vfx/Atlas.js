import * as THREE from 'three';

/**
 * The effects atlas: 4 × 4 frames drawn once on a canvas (GAME_BIBLE §7: canvas-drawn flipbook frames).
 * RGB is a tint mask (mostly white), alpha is coverage. Frame indices are shared by particles, decals and glows.
 */
export const FRAMES = {
  dot: 0, smokeA: 1, smokeB: 2, smokeC: 3, spark: 4, ring: 5, crown: 6, glint: 7,
  glow: 8, leaf: 9, mote: 10, scorch: 11, bulletHole: 12, hoofprint: 13, footprint: 14, wisp: 15,
};
export const ATLAS_GRID = 4;

/** Deterministic tiny PRNG so the atlas looks the same every launch. */
function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** @param {number} [cell] pixels per frame (128 → a 512 px atlas) */
export function createAtlas(cell = 128) {
  const size = cell * ATLAS_GRID;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const R = prng(1899);
  const at = (i) => [(i % ATLAS_GRID) * cell, Math.floor(i / ATLAS_GRID) * cell];
  const radial = (cx, cy, r, stops) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); for (const [o, col] of stops) g.addColorStop(o, col); return g; };
  const frame = (i, draw) => { const [ox, oy] = at(i); x.save(); x.beginPath(); x.rect(ox, oy, cell, cell); x.clip(); x.translate(ox, oy); draw(cell / 2); x.restore(); };
  const W = (a) => `rgba(255,255,255,${a})`;

  frame(FRAMES.dot, (h) => { x.fillStyle = radial(h, h, h, [[0, W(1)], [0.35, W(0.55)], [1, W(0)]]); x.fillRect(0, 0, cell, cell); });
  // smoke: many overlapping soft blobs, three variants
  for (const [k, id] of [[1, FRAMES.smokeA], [2, FRAMES.smokeB], [3, FRAMES.smokeC]]) {
    frame(id, (h) => {
      for (let n = 0; n < 26 + k * 4; n++) {
        const a = R() * Math.PI * 2, d = Math.sqrt(R()) * h * 0.5, r = h * (0.18 + R() * 0.3);
        const px = h + Math.cos(a) * d, py = h + Math.sin(a) * d;
        x.fillStyle = radial(px, py, r, [[0, W(0.22)], [1, W(0)]]); x.fillRect(0, 0, cell, cell);
      }
    });
  }
  frame(FRAMES.spark, (h) => { x.fillStyle = radial(h, h, h, [[0, W(1)], [0.2, W(0.7)], [1, W(0)]]); x.setTransform(1, 0, 0, 0.16, at(FRAMES.spark)[0], at(FRAMES.spark)[1] + h * 0.84); x.fillRect(0, 0, cell, cell); });
  frame(FRAMES.ring, (h) => {
    x.strokeStyle = W(0.9); x.lineWidth = h * 0.07; x.beginPath(); x.arc(h, h, h * 0.8, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = W(0.35); x.lineWidth = h * 0.04; x.beginPath(); x.arc(h, h, h * 0.62, 0, Math.PI * 2); x.stroke();
  });
  frame(FRAMES.crown, (h) => { // a rain splash seen from the side: a low crown of droplets
    x.fillStyle = W(0.85);
    for (let n = 0; n < 9; n++) {
      const t = (n / 8) * 2 - 1, px = h + t * h * 0.75, top = h * (1.55 - 0.55 * (1 - t * t)) - R() * h * 0.25;
      x.fillRect(px - h * 0.025, top, h * 0.05, h * 1.85 - top);
      x.beginPath(); x.arc(px, top - h * 0.06, h * 0.05, 0, Math.PI * 2); x.fill();
    }
    x.fillStyle = radial(h, h * 1.85, h * 0.8, [[0, W(0.6)], [1, W(0)]]); x.fillRect(0, h * 1.4, cell, h * 0.6);
  });
  frame(FRAMES.glint, (h) => {
    x.fillStyle = radial(h, h, h * 0.35, [[0, W(1)], [1, W(0)]]); x.fillRect(0, 0, cell, cell);
    for (const rot of [0, Math.PI / 2]) { x.save(); x.translate(h, h); x.rotate(rot); x.fillStyle = radial(0, 0, h, [[0, W(0.9)], [1, W(0)]]); x.scale(1, 0.06); x.fillRect(-h, -h, cell, cell); x.restore(); }
  });
  frame(FRAMES.glow, (h) => { x.fillStyle = radial(h, h, h, [[0, W(1)], [0.08, W(0.85)], [0.3, W(0.25)], [1, W(0)]]); x.fillRect(0, 0, cell, cell); });
  frame(FRAMES.leaf, (h) => {
    x.fillStyle = W(1); x.beginPath(); x.moveTo(h, h * 0.2); x.quadraticCurveTo(h * 1.7, h, h, h * 1.8); x.quadraticCurveTo(h * 0.3, h, h, h * 0.2); x.fill();
    x.strokeStyle = 'rgba(180,180,180,1)'; x.lineWidth = h * 0.04; x.beginPath(); x.moveTo(h, h * 0.25); x.lineTo(h, h * 1.75); x.stroke();
  });
  frame(FRAMES.mote, (h) => { x.fillStyle = radial(h, h, h * 0.5, [[0, W(1)], [1, W(0)]]); x.fillRect(0, 0, cell, cell); });
  frame(FRAMES.scorch, (h) => {
    for (let n = 0; n < 40; n++) { const a = R() * 6.283, d = R() * h * 0.6; x.fillStyle = radial(h + Math.cos(a) * d, h + Math.sin(a) * d, h * 0.35, [[0, 'rgba(20,16,12,0.35)'], [1, 'rgba(20,16,12,0)']]); x.fillRect(0, 0, cell, cell); }
  });
  frame(FRAMES.bulletHole, (h) => {
    x.fillStyle = radial(h, h, h * 0.6, [[0, 'rgba(10,8,6,1)'], [0.25, 'rgba(25,20,15,0.9)'], [0.45, 'rgba(60,50,40,0.5)'], [1, 'rgba(60,50,40,0)']]); x.fillRect(0, 0, cell, cell);
  });
  frame(FRAMES.hoofprint, (h) => {
    x.fillStyle = 'rgba(30,22,14,0.75)'; x.beginPath(); x.ellipse(h, h * 1.05, h * 0.5, h * 0.62, 0, 0, Math.PI * 2); x.fill();
    x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.moveTo(h, h * 0.75); x.lineTo(h * 0.8, h * 1.65); x.lineTo(h * 1.2, h * 1.65); x.fill();
  });
  frame(FRAMES.footprint, (h) => {
    x.fillStyle = 'rgba(30,22,14,0.75)';
    x.beginPath(); x.ellipse(h, h * 0.75, h * 0.26, h * 0.42, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(h, h * 1.55, h * 0.2, h * 0.27, 0, 0, Math.PI * 2); x.fill();
  });
  frame(FRAMES.wisp, (h) => {
    for (let n = 0; n < 60; n++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * h * 0.62, r = h * (0.12 + R() * 0.3);
      const px = h + Math.cos(a) * d * 1.2, py = h + Math.sin(a) * d * 0.65;
      x.fillStyle = radial(px, py, r, [[0, W(0.12)], [1, W(0)]]); x.fillRect(0, 0, cell, cell);
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.premultiplyAlpha = false;
  return tex;
}

/** Shared GLSL: atlas UV for frame index f (0..15) and local uv 0..1. */
export const ATLAS_GLSL = /* glsl */`
vec2 atlasUv(float f, vec2 uv) {
  float col = mod(f, 4.0), row = floor(f / 4.0);
  uv = clamp(uv, 0.008, 0.992);
  return vec2((col + uv.x) * 0.25, 1.0 - (row + 1.0 - uv.y) * 0.25);
}`;
