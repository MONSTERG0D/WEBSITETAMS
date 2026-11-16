import { buildAtlas, wrap, grey, speckle } from '../characters/rig/HumanTextures.js';

/**
 * The weapon texture atlas (Part 6), same 4 × 4 layout and normal/roughness/metalness packing as the human atlas:
 * walnut and ash wood grain, blued steel with handling wear, scroll-engraved steel, case-hardened steel, brass,
 * worn leather, braided rope, horn, waxed bow string, glass and a plain swatch. Colour comes from vertex colours;
 * the swatches are greyscale luminance plus drawn height for the normal map. Built once on canvas.
 */
export const TUNING = { size: 512, phoneSize: 256, normalStrength: 2.6 };

export const WREGIONS = Object.freeze({
  walnut: 0, ash: 1, steel: 2, engraved: 3, casehard: 4, brass: 5, leather: 6, rope: 7,
  horn: 8, string: 9, glass: 10, plain: 11, checker: 12, feather: 13, blade: 14, paper: 15,
});

/** [roughness, metalness] per region. */
const SURFACE = {
  walnut: [0.52, 0], ash: [0.6, 0], steel: [0.36, 1], engraved: [0.4, 1], casehard: [0.34, 1], brass: [0.3, 1],
  leather: [0.62, 0], rope: [0.92, 0], horn: [0.38, 0], string: [0.7, 0], glass: [0.06, 0], plain: [0.75, 0],
  checker: [0.7, 0], feather: [0.85, 0], blade: [0.22, 1], paper: [0.9, 0],
};

/** Long wavy grain lines running along v (the length of each part), with rays and a few dark knots. */
function grain(A, H, s, rng, lines, dark, wobble) {
  A.fillStyle = grey(232); A.fillRect(0, 0, s, s);
  for (let i = 0; i < lines; i++) {
    const x0 = rng.range(0, s), ph = rng.range(0, 6.28), amp = rng.range(0.5, wobble), f = rng.range(1, 3) * 6.28 / s;
    const v = Math.round(rng.range(dark, 235)), w = rng.range(0.6, 2.4);
    A.strokeStyle = grey(v, 0.55); A.lineWidth = w; H.strokeStyle = grey(110, 0.35); H.lineWidth = w * 0.7;
    for (const dx of [-s, 0, s]) {
      A.beginPath(); H.beginPath();
      for (let y = 0; y <= s; y += 4) {
        const x = x0 + dx + Math.sin(y * f + ph) * amp + Math.sin(y * f * 3.1 + ph * 2) * amp * 0.3;
        if (y === 0) { A.moveTo(x, y); H.moveTo(x, y); } else { A.lineTo(x, y); H.lineTo(x, y); }
      }
      A.stroke(); H.stroke();
    }
  }
  for (let i = 0; i < 3; i++) { // knots
    const x = rng.range(0, s), y = rng.range(0, s), r = rng.range(3, 7);
    wrap(s, (dx, dy) => {
      const g = A.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r * 2.2);
      g.addColorStop(0, grey(dark - 20, 0.8)); g.addColorStop(0.5, grey(dark + 30, 0.4)); g.addColorStop(1, grey(230, 0));
      A.fillStyle = g; A.beginPath(); A.ellipse(x + dx, y + dy, r, r * 2.2, 0, 0, Math.PI * 2); A.fill();
    }, x, y, r * 2.4);
  }
  speckle(H, s, rng, 900, 1.2, 110, 150, 0.35); // pores
}

/** Fine machining lines plus pale wear on edges (v = 0 and 1 are part ends, u = 0.25/0.75 the sides). */
function machined(A, H, s, rng, base) {
  A.fillStyle = grey(base); A.fillRect(0, 0, s, s);
  for (let i = 0; i < 160; i++) {
    const y = rng.range(0, s), v = Math.round(rng.range(base - 18, base + 22));
    A.fillStyle = grey(Math.min(255, v), 0.25); A.fillRect(0, y, s, rng.range(0.5, 1.5));
  }
  // handling wear: blotches of bare, brighter metal and fine scratches
  for (let i = 0; i < 26; i++) {
    const x = rng.range(0, s), y = rng.range(0, s), r = rng.range(4, 14);
    wrap(s, (dx, dy) => {
      const g = A.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      g.addColorStop(0, grey(255, 0.35)); g.addColorStop(1, grey(255, 0));
      A.fillStyle = g; A.beginPath(); A.arc(x + dx, y + dy, r, 0, Math.PI * 2); A.fill();
    }, x, y, r);
  }
  A.strokeStyle = grey(255, 0.25); H.strokeStyle = grey(100, 0.4); A.lineWidth = H.lineWidth = 0.6;
  for (let i = 0; i < 70; i++) {
    const x = rng.range(0, s), y = rng.range(0, s), l = rng.range(3, 16), a = rng.range(0, Math.PI);
    wrap(s, (dx, dy) => {
      for (const C of [A, H]) { C.beginPath(); C.moveTo(x + dx, y + dy); C.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); C.stroke(); }
    }, x, y, l);
  }
}

const DRAW = {
  walnut({ A, H, s, rng }) { grain(A, H, s, rng, 70, 120, 6); },
  ash({ A, H, s, rng }) { grain(A, H, s, rng, 45, 170, 3); },
  steel({ A, H, s, rng }) { machined(A, H, s, rng, 200); },
  engraved({ A, H, s, rng }) {
    machined(A, H, s, rng, 205);
    // scrollwork: spirals with leaves, cut into the height map and catching light in the albedo
    for (let i = 0; i < 14; i++) {
      const cx = rng.range(0, s), cy = rng.range(0, s), r0 = rng.range(5, 12), turns = rng.range(1.4, 2.2), dir = rng.sign();
      wrap(s, (dx, dy) => {
        for (const [C, col, w] of [[H, grey(70, 0.8), 1.4], [A, grey(255, 0.6), 0.8]]) {
          C.strokeStyle = col; C.lineWidth = w; C.beginPath();
          for (let t = 0; t <= turns * 6.28; t += 0.2) {
            const r = r0 * (1 - t / (turns * 6.28 + 2)), x = cx + dx + Math.cos(t * dir) * r, y = cy + dy + Math.sin(t * dir) * r;
            if (t === 0) C.moveTo(x, y); else C.lineTo(x, y);
          }
          C.stroke();
          for (let k = 0; k < 3; k++) { // leaves off the spiral
            const a = rng.range(0, 6.28), x = cx + dx + Math.cos(a) * r0, y = cy + dy + Math.sin(a) * r0;
            C.beginPath(); C.ellipse(x, y, 3.5, 1.4, a + 1.2, 0, Math.PI * 2); C.stroke();
          }
        }
      }, cx, cy, r0 + 6);
    }
  },
  casehard({ A, H, s, rng }) {
    machined(A, H, s, rng, 190);
    for (let i = 0; i < 60; i++) { // colour-case mottling (tinted by vertex colour)
      const x = rng.range(0, s), y = rng.range(0, s), r = rng.range(6, 20), v = Math.round(rng.range(120, 255));
      wrap(s, (dx, dy) => {
        const g = A.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        g.addColorStop(0, grey(v, 0.45)); g.addColorStop(1, grey(v, 0));
        A.fillStyle = g; A.beginPath(); A.arc(x + dx, y + dy, r, 0, Math.PI * 2); A.fill();
      }, x, y, r);
    }
  },
  brass({ A, H, s, rng }) { machined(A, H, s, rng, 225); speckle(A, s, rng, 120, 6, 150, 200, 0.18); },
  leather({ A, H, s, rng }) {
    speckle(A, s, rng, 400, 8, 190, 250, 0.2); speckle(H, s, rng, 2400, 1.4, 95, 145, 0.45);
    H.strokeStyle = grey(85, 0.6); H.lineWidth = 1.2; // stitching rows
    for (let y = 6; y < s; y += s / 4) for (let x = 0; x < s; x += 6) { H.beginPath(); H.moveTo(x, y); H.lineTo(x + 3, y); H.stroke(); }
  },
  rope({ A, H, s, rng }) {
    const step = s / 8; // twisted strands running diagonally
    for (let i = -8; i < 16; i++) {
      for (const [C, lo, hi] of [[A, 170, 250], [H, 90, 200]]) {
        const g = C.createLinearGradient(i * step, 0, i * step + step, 0);
        g.addColorStop(0, grey(lo)); g.addColorStop(0.5, grey(hi)); g.addColorStop(1, grey(lo));
        C.fillStyle = g; C.save(); C.transform(1, 0, 0.6, 1, 0, 0); C.fillRect(i * step, 0, step, s); C.restore();
      }
    }
    speckle(A, s, rng, 900, 1, 200, 255, 0.3);
  },
  horn({ A, H, s, rng }) {
    A.fillStyle = grey(210); A.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) { const y = rng.range(0, s); A.fillStyle = grey(Math.round(rng.range(120, 250)), 0.3); A.fillRect(0, y, s, rng.range(2, 10)); }
    speckle(H, s, rng, 600, 1.4, 115, 140, 0.3);
  },
  string({ A, H, s, rng }) { A.fillStyle = grey(235); A.fillRect(0, 0, s, s); for (let x = 0; x < s; x += 3) { A.fillStyle = grey(200, 0.4); A.fillRect(x, 0, 1, s); } speckle(H, s, rng, 300, 1, 110, 140, 0.3); },
  glass({ A, H, s, rng }) { A.fillStyle = grey(245); A.fillRect(0, 0, s, s); for (let i = 0; i < 12; i++) { A.fillStyle = grey(255, 0.2); A.fillRect(rng.range(0, s), 0, rng.range(1, 4), s); } speckle(H, s, rng, 60, 3, 120, 136, 0.3); },
  plain({ A, H, s, rng }) { speckle(A, s, rng, 300, 6, 225, 255, 0.15); speckle(H, s, rng, 600, 1.5, 118, 138, 0.3); },
  checker({ A, H, s }) { // grip checkering: a fine diamond lattice cut into the wood
    A.fillStyle = grey(225); A.fillRect(0, 0, s, s);
    H.strokeStyle = grey(70, 0.9); A.strokeStyle = grey(140, 0.5); H.lineWidth = A.lineWidth = 1;
    for (let i = -s; i < s * 2; i += 5) for (const C of [A, H]) { C.beginPath(); C.moveTo(i, 0); C.lineTo(i + s, s); C.stroke(); C.beginPath(); C.moveTo(i, s); C.lineTo(i + s, 0); C.stroke(); }
  },
  feather({ A, H, s, rng }) {
    A.fillStyle = grey(240); A.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 2) { A.fillStyle = grey(Math.round(rng.range(170, 250)), 0.5); A.fillRect(0, y, s, 1); H.fillStyle = grey(110, 0.3); H.fillRect(0, y, s, 1); }
  },
  blade({ A, H, s, rng }) {
    A.fillStyle = grey(225); A.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) { const y = rng.range(0, s); A.fillStyle = grey(Math.round(rng.range(200, 255)), 0.3); A.fillRect(rng.range(0, s), y, rng.range(10, 60), 0.6); }
  },
  paper({ A, H, s, rng }) { speckle(A, s, rng, 800, 3, 210, 255, 0.25); speckle(H, s, rng, 900, 1.3, 115, 140, 0.3); },
};

/** Builds the shared weapon atlas: { map, normalMap, ormMap }. */
export function buildWeaponAtlas(size = TUNING.size) {
  return buildAtlas({ size, regions: WREGIONS, draw: DRAW, surface: SURFACE, seed: 'weapons-v1', normalStrength: TUNING.normalStrength });
}
