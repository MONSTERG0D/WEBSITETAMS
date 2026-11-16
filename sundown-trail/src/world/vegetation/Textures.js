import * as THREE from 'three';
import { sizeFor, anisotropy } from '../../render/TextureDetail.js';

/**
 * The vegetation atlas: bark strips, leaf cards and rock skin painted once on a 1024 px canvas
 * (GAME_BIBLE §7: canvas-drawn bark, layered alpha-tested foliage cards). Every plant shares this one
 * texture and one material, so each species and LOD costs one draw call.
 * REGIONS are [x, y, w, h] in atlas pixels (y down); uvRect() converts them to texture UVs.
 */
export const ATLAS_SIZE = 1024;
export const REGIONS = {
  barkPine: [0, 0, 128, 512], barkOak: [128, 0, 128, 512], barkAspen: [256, 0, 128, 512], cactus: [384, 0, 128, 512],
  pine: [512, 0, 256, 256], oak: [768, 0, 256, 256], aspen: [512, 256, 256, 256], sage: [768, 256, 256, 256],
  reed: [0, 512, 256, 256], twigs: [256, 512, 256, 256], pad: [512, 512, 256, 256], rock: [768, 512, 256, 256],
  tuft: [0, 768, 256, 256], deadBark: [256, 768, 128, 256], oakDark: [384, 768, 256, 256],
};

/** UV rectangle [u0, v0, u1, v1] for a region (three's UVs: v up, canvas flipped on upload). */
export function uvRect(name) {
  const [x, y, w, h] = REGIONS[name], S = ATLAS_SIZE, inset = 1.5;
  return [(x + inset) / S, 1 - (y + h - inset) / S, (x + w - inset) / S, 1 - (y + inset) / S];
}

function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

/** @param {number} seed @returns {THREE.CanvasTexture} sRGB, mipmapped */
export function createVegetationAtlas(seed = 1899) {
  const px = sizeFor('vegetation'), k = px / ATLAS_SIZE; // Part 16: 1024 or 2048 px, painted in 1024-px space
  const c = document.createElement('canvas'); c.width = c.height = px;
  const x = c.getContext('2d'), R = prng(seed);
  x.setTransform(k, 0, 0, k, 0, 0);
  const region = (name, draw) => { const [rx, ry, w, h] = REGIONS[name]; x.save(); x.beginPath(); x.rect(rx, ry, w, h); x.clip(); x.translate(rx, ry); draw(w, h); x.restore(); };

  // --- bark: vertical furrows with noise
  const bark = (name, base, dark, light, furrows, plates) => region(name, (w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    for (let i = 0; i < furrows; i++) {
      const fx = R() * w, wid = 1 + R() * 4;
      x.strokeStyle = dark; x.lineWidth = wid; x.beginPath(); x.moveTo(fx, 0);
      for (let y = 0; y <= h; y += 16) x.lineTo(fx + Math.sin(y * 0.05 + i) * 3 + (R() - 0.5) * 3, y);
      x.stroke();
    }
    for (let i = 0; i < plates; i++) { x.fillStyle = R() < 0.5 ? light : dark; x.globalAlpha = 0.25 + R() * 0.3; x.fillRect(R() * w, R() * h, 4 + R() * 14, 6 + R() * 26); }
    x.globalAlpha = 1;
  });
  bark('barkPine', '#5a3f2c', '#2e1f15', '#7a5a40', 26, 220);
  bark('barkOak', '#4d4334', '#2a241b', '#6b604c', 34, 260);
  bark('deadBark', '#7d756a', '#4b453e', '#a39a8c', 22, 160);
  region('barkAspen', (w, h) => {
    x.fillStyle = '#d9d4c4'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { x.fillStyle = hsl(40, 8, 15 + R() * 15, 0.85); const y = R() * h; x.beginPath(); x.ellipse(R() * w, y, 3 + R() * 12, 1 + R() * 3, 0, 0, Math.PI * 2); x.fill(); }
    for (let i = 0; i < 300; i++) { x.fillStyle = hsl(45, 10, 70 + R() * 20, 0.5); x.fillRect(R() * w, R() * h, 2, 1); }
  });
  region('cactus', (w, h) => { // vertical ribs with spines
    const g = x.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, i % 2 ? '#4f6b3a' : '#3a5530');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(235,225,190,0.9)';
    for (let i = 0; i < 400; i++) x.fillRect(Math.floor(R() * 8) * (w / 8) + w / 16, R() * h, 1.5, 1.5);
  });

  // --- foliage cards (alpha cut-outs)
  region('pine', (w, h) => { // a drooping branch covered in needle tufts
    x.strokeStyle = '#3b2a1c'; x.lineWidth = 4; x.beginPath(); x.moveTo(w * 0.5, h); x.quadraticCurveTo(w * 0.52, h * 0.5, w * 0.5, h * 0.06); x.stroke();
    for (let i = 0; i < 900; i++) {
      const t = R(), cy = h * (0.06 + t * 0.92), spread = w * (0.45 * (1 - t * 0.55)) * (0.3 + R() * 0.7), side = R() < 0.5 ? -1 : 1;
      const px = w * 0.5 + side * spread * R(), py = cy + (R() - 0.5) * 12;
      x.strokeStyle = hsl(130 + R() * 25, 30 + R() * 20, 14 + R() * 16); x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + side * (4 + R() * 9), py + 3 + R() * 7); x.stroke();
    }
  });
  // Leaves gather in several sprigs spread over the card, so a crown of cards reads as foliage with gaps, not as balls.
  const leafCluster = (name, hue, sat, light, count, size, round) => region(name, (w, h) => {
    const sprigs = [];
    for (let k = 0; k < 9; k++) sprigs.push([w * (0.14 + R() * 0.72), h * (0.14 + R() * 0.72), w * (0.09 + R() * 0.12)]);
    for (const [sx, sy] of sprigs) { x.strokeStyle = 'rgba(60,45,30,0.9)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(w / 2, h * 0.95); x.quadraticCurveTo(w / 2, sy, sx, sy); x.stroke(); }
    for (let i = 0; i < count; i++) {
      const [sx, sy, sr] = sprigs[i % sprigs.length], a = R() * Math.PI * 2, d = Math.sqrt(R()) * sr;
      const px = sx + Math.cos(a) * d, py = sy + Math.sin(a) * d;
      const shade = light * (0.65 + 0.55 * (1 - (py / h))) + (R() - 0.5) * 8;
      x.fillStyle = hsl(hue + (R() - 0.5) * 16, sat + (R() - 0.5) * 12, shade);
      x.save(); x.translate(px, py); x.rotate(R() * Math.PI * 2);
      x.beginPath(); x.ellipse(0, 0, size * (0.6 + R() * 0.6), size * (round ? 0.55 + R() * 0.4 : 0.32 + R() * 0.2), 0, 0, Math.PI * 2); x.fill();
      x.restore();
    }
  });
  leafCluster('oak', 85, 34, 30, 700, 9, false);
  leafCluster('oakDark', 95, 30, 22, 700, 9, false);
  leafCluster('aspen', 46, 78, 52, 650, 8, true);
  leafCluster('sage', 95, 14, 52, 1100, 4, false);
  region('reed', (w, h) => {
    for (let i = 0; i < 46; i++) {
      const bx = w * (0.1 + R() * 0.8), top = h * (0.02 + R() * 0.35), lean = (R() - 0.5) * w * 0.25;
      x.strokeStyle = hsl(70 + R() * 30, 35, 28 + R() * 18); x.lineWidth = 2 + R() * 3;
      x.beginPath(); x.moveTo(bx, h); x.quadraticCurveTo(bx + lean * 0.3, (h + top) / 2, bx + lean, top); x.stroke();
      if (R() < 0.25) { x.fillStyle = '#4a3020'; x.beginPath(); x.ellipse(bx + lean * 0.9, top + 14, 4, 13, 0, 0, Math.PI * 2); x.fill(); }
    }
  });
  region('tuft', (w, h) => {
    for (let i = 0; i < 60; i++) {
      const bx = w * (0.3 + R() * 0.4), tipX = w * (0.05 + R() * 0.9), tipY = h * (0.05 + R() * 0.45);
      x.strokeStyle = hsl(55 + R() * 35, 35 + R() * 20, 32 + R() * 22); x.lineWidth = 2 + R() * 2;
      x.beginPath(); x.moveTo(bx, h); x.quadraticCurveTo((bx + tipX) / 2, h * 0.55, tipX, tipY); x.stroke();
    }
  });
  region('twigs', (w, h) => { // bare branching twigs
    const branch = (px, py, ang, len, wid, depth) => {
      if (depth <= 0 || len < 4) return;
      const ex = px + Math.cos(ang) * len, ey = py + Math.sin(ang) * len;
      x.strokeStyle = '#5c5248'; x.lineWidth = wid; x.beginPath(); x.moveTo(px, py); x.lineTo(ex, ey); x.stroke();
      branch(ex, ey, ang - 0.3 - R() * 0.4, len * 0.7, wid * 0.7, depth - 1);
      branch(ex, ey, ang + 0.3 + R() * 0.4, len * 0.7, wid * 0.7, depth - 1);
    };
    branch(w / 2, h, -Math.PI / 2, h * 0.32, 6, 7);
  });
  region('pad', (w, h) => { // a prickly-pear pad, nearly opaque
    x.fillStyle = '#5d7a3c'; x.beginPath(); x.ellipse(w / 2, h / 2, w * 0.42, h * 0.48, 0, 0, Math.PI * 2); x.fill();
    const g = x.createRadialGradient(w * 0.4, h * 0.35, 4, w / 2, h / 2, w * 0.5); g.addColorStop(0, 'rgba(160,200,110,0.35)'); g.addColorStop(1, 'rgba(30,50,20,0.35)');
    x.fillStyle = g; x.fill();
    x.fillStyle = 'rgba(240,230,190,0.95)';
    for (let i = 0; i < 40; i++) { const a = R() * 6.283, d = Math.sqrt(R()) * 0.38; x.fillRect(w / 2 + Math.cos(a) * d * w, h / 2 + Math.sin(a) * d * h * 1.1, 2, 2); }
  });
  region('rock', (w, h) => { // neutral speckled stone; species tint it per biome
    x.fillStyle = '#9a958c'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const l = 40 + R() * 40; x.fillStyle = hsl(35, 6, l, 0.35); x.fillRect(R() * w, R() * h, 1 + R() * 4, 1 + R() * 4); }
    for (let i = 0; i < 18; i++) { x.strokeStyle = 'rgba(50,45,40,0.35)'; x.lineWidth = 1 + R(); x.beginPath(); let px = R() * w, py = R() * h; x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (R() - 0.5) * 50; py += (R() - 0.5) * 50; x.lineTo(px, py); } x.stroke(); }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.max(4, anisotropy());
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true;
  return tex;
}
