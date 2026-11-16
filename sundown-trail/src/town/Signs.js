import * as THREE from 'three';

/**
 * Painted signs and wanted posters (Part 9). One canvas atlas holds every shop sign (hand-lettered on weathered
 * boards in a few colour schemes); another holds the bounty-board posters, each with an ink-sketch portrait drawn
 * from a seed (face shape, hat, brows, eyes, nose, moustache or beard, scars), a name, the crime and the reward.
 * Text uses the Rye display font once it has loaded (redrawn then), Georgia before that.
 */
export const TUNING = { signW: 512, signH: 64, cols: 2, rows: 16, posterW: 256, posterH: 352, posterCols: 4, posterRows: 2 };

export const SIGNS = [
  { id: 'saloon', text: 'SALOON', style: 'red' }, { id: 'general', text: 'GENERAL STORE', style: 'cream' },
  { id: 'gunsmith', text: 'GUNSMITH', style: 'dark' }, { id: 'butcher', text: 'BUTCHER', style: 'cream' },
  { id: 'stable', text: 'LIVERY STABLE', style: 'dark' }, { id: 'hotel', text: 'HOTEL · BATHS', style: 'green' },
  { id: 'sheriff', text: 'SHERIFF', style: 'dark' }, { id: 'post', text: 'POST OFFICE · TELEGRAPH', style: 'cream' },
  { id: 'bank', text: 'COPPERBELL BANK', style: 'green' }, { id: 'doctor', text: 'DOCTOR', style: 'cream' },
  { id: 'blacksmith', text: 'BLACKSMITH', style: 'dark' }, { id: 'courthouse', text: 'COURTHOUSE', style: 'stone' },
  { id: 'trading', text: 'SALTMESA TRADING POST', style: 'cream' }, { id: 'cantina', text: 'CANTINA', style: 'red' },
  { id: 'lumber', text: 'BLACKSTONE LUMBER CO.', style: 'dark' }, { id: 'sawmill', text: 'SAWMILL', style: 'cream' },
  { id: 'bunkhouse', text: 'BUNKHOUSE', style: 'dark' }, { id: 'church', text: 'FIRST CHURCH', style: 'cream' },
  { id: 'bounties', text: 'WANTED', style: 'cream' }, { id: 'office', text: 'OFFICE', style: 'dark' },
];
const STYLES = {
  red: { bg: '#7a2a1c', fg: '#f1e2bf', trim: '#d9b36a' }, cream: { bg: '#e2d3ae', fg: '#3a2414', trim: '#7a4a2a' },
  dark: { bg: '#2e241c', fg: '#e8d4a0', trim: '#a07a40' }, green: { bg: '#2f4a3a', fg: '#efe0b8', trim: '#c9a35a' },
  stone: { bg: '#cfc6b4', fg: '#2a2622', trim: '#6a6258' },
};
const font = (px) => `${px}px Rye, Georgia, serif`;
function prng(seed) { let s = typeof seed === 'number' ? seed : [...String(seed)].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7); return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** The sign atlas: texture + uv(id) → [u0, v0, u1, v1]. */
export function createSignAtlas() {
  const T = TUNING, c = document.createElement('canvas'); c.width = T.signW * T.cols; c.height = T.signH * T.rows;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const draw = () => {
    const x = c.getContext('2d');
    SIGNS.forEach((s, i) => {
      const col = i % T.cols, row = Math.floor(i / T.cols), ox = col * T.signW, oy = row * T.signH, st = STYLES[s.style], R = prng(s.id);
      x.fillStyle = st.bg; x.fillRect(ox, oy, T.signW, T.signH);
      for (let k = 0; k < 140; k++) { x.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,240,210'},${R() * 0.08})`; x.fillRect(ox + R() * T.signW, oy + R() * T.signH, 6 + R() * 50, 1 + R() * 2); } // grain
      x.strokeStyle = st.trim; x.lineWidth = 4; x.strokeRect(ox + 5, oy + 5, T.signW - 10, T.signH - 10);
      let px = 40; x.font = font(px);
      while (x.measureText(s.text).width > T.signW - 50 && px > 14) { px -= 2; x.font = font(px); }
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillText(s.text, ox + T.signW / 2 + 2, oy + T.signH / 2 + 3);
      x.fillStyle = st.fg; x.fillText(s.text, ox + T.signW / 2, oy + T.signH / 2 + 1);
      for (let k = 0; k < 60; k++) { x.fillStyle = `rgba(${R() < 0.6 ? '60,45,30' : '255,250,235'},${R() * 0.25})`; x.fillRect(ox + R() * T.signW, oy + R() * T.signH, 1 + R() * 4, 1 + R() * 3); } // chipped paint
    });
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.load?.(font(40)).then(draw).catch(() => {});
  const uv = (id) => {
    const i = Math.max(0, SIGNS.findIndex((s) => s.id === id)), col = i % T.cols, row = Math.floor(i / T.cols);
    return [col / T.cols, 1 - (row + 1) / T.rows, (col + 1) / T.cols, 1 - row / T.rows];
  };
  return { tex, uv, canvas: c };
}

/** A sign board quad (BoxGeometry front face gets the atlas cell, the rest is plain board). */
export function signGeometry(uvRect, w, h, depth = 0.06) {
  const g = new THREE.BoxGeometry(w, h, depth), uv = g.getAttribute('uv');
  const [u0, v0, u1, v1] = uvRect;
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k, u = uv.getX(i), v = uv.getY(i);
    if (f === 4) uv.setXY(i, u0 + (u1 - u0) * u, v0 + (v1 - v0) * v); // +Z face: the lettering
    else uv.setXY(i, u0 + 0.004, v0 + 0.1 * (v1 - v0)); // edges and back: a patch of plain board colour
  }
  return g;
}

// ---------------------------------------------------------------- wanted posters
/** Fictional wanted men and women for the bounty boards (Part 15 turns them into jobs). */
export const WANTED = [
  { id: 'ransome', name: 'Jack Ransome', crime: 'Train robbery, murder', alive: 120, dead: 60, seed: 11 },
  { id: 'loomis', name: "Ezra 'Two-Bit' Loomis", crime: 'Cattle rustling', alive: 45, dead: 20, seed: 23 },
  { id: 'calloway', name: 'Bess Calloway', crime: 'Stagecoach robbery', alive: 70, dead: 35, seed: 37, female: true },
  { id: 'whitmore', name: 'Cal Whitmore', crime: 'Horse theft, arson', alive: 55, dead: 25, seed: 41 },
  { id: 'hatcher', name: 'Amon Hatcher', crime: 'Bank robbery', alive: 90, dead: 45, seed: 53 },
  { id: 'voss', name: 'Lyle Voss', crime: 'Murder of a deputy', alive: 110, dead: 55, seed: 61 },
];

/** Draws an ink-sketch face into a rect of a 2D context. */
export function sketchPortrait(x, ox, oy, w, h, seed, { female = false } = {}) {
  const R = prng(seed), cx = ox + w / 2, cy = oy + h * 0.56, fw = w * (0.26 + R() * 0.06), fh = h * (0.34 + R() * 0.05);
  x.save(); x.strokeStyle = '#2a1d12'; x.fillStyle = '#2a1d12'; x.lineCap = 'round'; x.lineJoin = 'round';
  const line = (pts, lw = 2) => { x.lineWidth = lw; x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0] + (R() - 0.5) * 1.2, pts[i][1] + (R() - 0.5) * 1.2); x.stroke(); };
  // hatching shadow on one side
  for (let k = 0; k < 26; k++) { const yy = cy - fh * 0.6 + k * fh * 0.05; line([[cx + fw * 0.45, yy], [cx + fw * 0.9, yy - 6]], 0.8); }
  // head
  x.lineWidth = 2.4; x.beginPath(); x.ellipse(cx, cy, fw, fh, 0, 0, Math.PI * 2); x.stroke();
  // neck and collar
  line([[cx - fw * 0.45, cy + fh * 0.9], [cx - fw * 0.5, oy + h]]); line([[cx + fw * 0.45, cy + fh * 0.9], [cx + fw * 0.5, oy + h]]);
  line([[cx - fw * 1.4, oy + h], [cx - fw * 0.4, cy + fh * 1.05], [cx, cy + fh * 1.35], [cx + fw * 0.4, cy + fh * 1.05], [cx + fw * 1.4, oy + h]], 2);
  // hat (or hair)
  if (female) {
    x.lineWidth = 2; x.beginPath(); x.ellipse(cx, cy - fh * 0.45, fw * 1.1, fh * 0.7, 0, Math.PI, Math.PI * 2); x.stroke();
    for (let k = 0; k < 14; k++) line([[cx - fw + k * fw / 7, cy - fh * 0.9], [cx - fw * 1.15 + k * fw / 6, cy + fh * 0.3]], 1);
  } else {
    const brim = cy - fh * (0.55 + R() * 0.1), crown = fh * (0.5 + R() * 0.3);
    x.fillStyle = '#3a2a1c'; x.beginPath(); x.ellipse(cx, brim, fw * 1.55, fh * 0.12, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(cx - fw * 0.8, brim); x.quadraticCurveTo(cx - fw * 0.85, brim - crown, cx, brim - crown * 1.05); x.quadraticCurveTo(cx + fw * 0.85, brim - crown, cx + fw * 0.8, brim); x.fill();
    x.fillStyle = '#2a1d12';
  }
  // brows, eyes, nose, mouth
  const ey = cy - fh * 0.08, ex = fw * 0.42, slant = (R() - 0.5) * 6;
  line([[cx - ex - 10, ey - 12 + slant], [cx - ex + 10, ey - 10]], 3); line([[cx + ex - 10, ey - 10], [cx + ex + 10, ey - 12 - slant]], 3);
  for (const s of [-1, 1]) { x.beginPath(); x.ellipse(cx + s * ex, ey, 6, 3.4, 0, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.arc(cx + s * ex, ey, 2, 0, Math.PI * 2); x.fill(); }
  line([[cx - 2, ey + 4], [cx - 6, cy + fh * 0.32], [cx + 5, cy + fh * 0.35]], 1.8);
  const my = cy + fh * 0.55;
  if (!female && R() < 0.75) { // moustache
    x.lineWidth = 4; x.beginPath(); x.moveTo(cx - fw * 0.42, my + 2); x.quadraticCurveTo(cx, my - 10, cx + fw * 0.42, my + 2); x.stroke();
    if (R() < 0.4) for (let k = 0; k < 40; k++) { const a = Math.PI * (0.15 + R() * 0.7); line([[cx + Math.cos(a) * fw * 0.8, cy + Math.sin(a) * fh * 0.75], [cx + Math.cos(a) * fw * 0.95, cy + Math.sin(a) * fh * 0.95]], 1); } // beard stubble
  }
  line([[cx - 12, my + 10], [cx + 12, my + 9]], 2);
  if (R() < 0.3) line([[cx + fw * 0.2, ey + 8], [cx + fw * 0.5, ey + 30]], 1.5); // scar
  x.restore();
}

/**
 * Bounty posters atlas. entries: [{ name, crime, alive, dead, seed, female }] (up to 8; Eli's own poster when wanted).
 * @returns {{ tex, uv(i) → [u0, v0, u1, v1], redraw(entries) }}
 */
export function createPosterAtlas(entries = WANTED) {
  const T = TUNING, c = document.createElement('canvas'); c.width = T.posterW * T.posterCols; c.height = T.posterH * T.posterRows;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const redraw = (list) => {
    const x = c.getContext('2d');
    for (let i = 0; i < T.posterCols * T.posterRows; i++) {
      const e = list[i], ox = (i % T.posterCols) * T.posterW, oy = Math.floor(i / T.posterCols) * T.posterH, R = prng(e?.seed ?? i);
      x.fillStyle = '#e4d6b0'; x.fillRect(ox, oy, T.posterW, T.posterH);
      for (let k = 0; k < 400; k++) { x.fillStyle = `rgba(120,90,50,${R() * 0.12})`; x.fillRect(ox + R() * T.posterW, oy + R() * T.posterH, 2 + R() * 8, 2 + R() * 8); }
      x.fillStyle = 'rgba(110,75,35,0.35)'; x.fillRect(ox, oy, T.posterW, 6); x.fillRect(ox, oy + T.posterH - 6, T.posterW, 6);
      if (!e) continue;
      x.fillStyle = '#2a1d12'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
      x.font = font(46); x.fillText('WANTED', ox + T.posterW / 2, oy + 52);
      x.font = 'italic 15px Georgia, serif'; x.fillText(e.dead ? 'DEAD OR ALIVE' : 'FOR QUESTIONING', ox + T.posterW / 2, oy + 72);
      x.strokeStyle = '#2a1d12'; x.lineWidth = 2; x.strokeRect(ox + 34, oy + 82, T.posterW - 68, 160);
      sketchPortrait(x, ox + 36, oy + 84, T.posterW - 72, 156, e.seed, { female: e.female });
      let px = 22; x.font = font(px);
      while (x.measureText(e.name.toUpperCase()).width > T.posterW - 24 && px > 12) { px -= 1; x.font = font(px); }
      x.fillText(e.name.toUpperCase(), ox + T.posterW / 2, oy + 270);
      x.font = '14px Georgia, serif'; x.fillText(e.crime, ox + T.posterW / 2, oy + 290);
      x.font = font(26); x.fillText(`$${e.alive}${e.dead ? '' : ''} REWARD`, ox + T.posterW / 2, oy + 326);
    }
    tex.needsUpdate = true;
  };
  redraw(entries);
  document.fonts?.load?.(font(40)).then(() => redraw(entries)).catch(() => {});
  const uv = (i) => { const col = i % T.posterCols, row = Math.floor(i / T.posterCols); return [col / T.posterCols, 1 - (row + 1) / T.posterRows, (col + 1) / T.posterCols, 1 - row / T.posterRows]; };
  return { tex, uv, canvas: c, redraw: (list) => { entries = list; redraw(list); } };
}
