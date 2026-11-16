import { buildAtlas, DRAW as HUMAN_DRAW, wrap, grey, speckle, weave, TUNING as TEX } from '../../characters/rig/HumanTextures.js';

/**
 * The horse texture atlas (same 4 × 4 layout and normal/roughness packing as the human one): short coat hair
 * with muscle-direction streaks, dapples for greys, mane and tail hair, leather and tooled saddle leather,
 * a Navajo-style saddle blanket (the only coloured swatch), hoof horn, glossy eyes, bit metal, rope, canvas,
 * a mottled muzzle and fleece.
 */
export const TUNING = { size: 1024, phoneSize: 512 };

export const HREGIONS = Object.freeze({
  coat: 0, dapple: 1, hair: 2, leather: 3, blanket: 4, hoof: 5, eye: 6, metal: 7,
  rope: 8, canvas: 9, muzzle: 10, plain: 11, fleece: 12, tooled: 13,
});
const SURFACE = {
  coat: [0.55, 0], dapple: [0.55, 0], hair: [0.5, 0], leather: [0.5, 0], blanket: [0.95, 0], hoof: [0.42, 0], eye: [0.06, 0],
  metal: [0.32, 1], rope: [0.9, 0], canvas: [0.8, 0], muzzle: [0.5, 0], plain: [0.8, 0], fleece: [0.98, 0], tooled: [0.48, 0],
};

const DRAW = {
  coat({ A, H, s, rng }) {
    // fine hair running along v (the length of each loft), with faint whorls of lighter and darker hair
    for (let i = 0; i < 2600; i++) {
      const x = rng.range(0, s), y = rng.range(0, s), l = rng.range(4, 12), v = Math.round(rng.range(225, 255));
      A.fillStyle = grey(v, 0.35); H.fillStyle = grey(Math.round(rng.range(110, 150)), 0.35);
      wrap(s, (dx, dy) => { A.fillRect(x + dx, y + dy, 0.8, l); H.fillRect(x + dx, y + dy, 0.8, l); }, x, y + l / 2, l);
    }
    speckle(A, s, rng, 40, 26, 228, 252, 0.12);
  },
  dapple({ A, H, s, rng }) {
    A.fillStyle = grey(150); A.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      const x = rng.range(0, s), y = rng.range(0, s), r = rng.range(7, 15);
      wrap(s, (dx, dy) => {
        const g = A.createRadialGradient(x + dx, y + dy, r * 0.2, x + dx, y + dy, r);
        g.addColorStop(0, grey(255, 1)); g.addColorStop(0.7, grey(238, 1)); g.addColorStop(1, grey(150, 0));
        A.fillStyle = g; A.beginPath(); A.arc(x + dx, y + dy, r, 0, Math.PI * 2); A.fill();
      }, x, y, r);
    }
    speckle(H, s, rng, 3000, 1.6, 100, 160, 0.35); // hair texture in the normal map
  },
  hair({ A, H, s, rng }) { HUMAN_DRAW.hair({ A, H, s, rng }); },
  leather({ A, H, O, s, rng }) { HUMAN_DRAW.leather({ A, H, O, s, rng }); },
  tooled({ A, H, O, s, rng }) {
    HUMAN_DRAW.leather({ A, H, O, s, rng });
    H.strokeStyle = grey(70, 0.8); H.lineWidth = 1.5; A.strokeStyle = grey(170, 0.5); A.lineWidth = 1;
    for (let y = s / 8; y < s; y += s / 4) for (let x = s / 8; x < s; x += s / 4) {
      for (const ctx of [H, A]) { ctx.beginPath(); ctx.arc(x, y, s / 14, 0, Math.PI * 2); ctx.moveTo(x - s / 10, y); ctx.quadraticCurveTo(x, y - s / 9, x + s / 10, y); ctx.stroke(); }
    }
    H.setLineDash?.([3, 3]); H.strokeStyle = grey(80, 0.9); H.strokeRect(4, 4, s - 8, s - 8); H.setLineDash?.([]);
  },
  blanket({ A, H, s, rng }) {
    const bands = ['#7a1e18', '#e8dcc0', '#1e2a44', '#b8742a', '#e8dcc0', '#7a1e18'];
    const h = s / bands.length;
    bands.forEach((c, i) => { A.fillStyle = c; A.fillRect(0, i * h, s, h); });
    A.fillStyle = '#1e1a16';
    for (let x = 0; x < s; x += s / 4) { A.beginPath(); A.moveTo(x, s / 2); A.lineTo(x + s / 8, s / 2 - h * 0.9); A.lineTo(x + s / 4, s / 2); A.lineTo(x + s / 8, s / 2 + h * 0.9); A.closePath(); A.fill(); }
    weave(H, s, 3, 110, 150, 1, rng);
    weave(A, s, 3, 200, 255, 0.12, rng);
  },
  hoof({ A, H, s, rng }) {
    for (let i = 0; i < 260; i++) {
      const x = rng.range(0, s), w = rng.range(1, 4), v = Math.round(rng.range(170, 255));
      A.fillStyle = grey(v, 0.35); H.fillStyle = grey(Math.round(rng.range(100, 160)), 0.5);
      wrap(s, (dx) => { A.fillRect(x + dx, 0, w, s); H.fillRect(x + dx, 0, w, s); }, x, s / 2, w);
    }
  },
  eye({ A, s }) {
    A.fillStyle = '#16100c'; A.fillRect(0, 0, s, s);
    const g = A.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, '#3a2414'); g.addColorStop(0.5, '#24160c'); g.addColorStop(1, '#0c0806');
    A.fillStyle = g; A.fillRect(0, 0, s, s);
    A.fillStyle = 'rgba(255,255,255,0.8)'; A.beginPath(); A.ellipse(s * 0.36, s * 0.34, s * 0.07, s * 0.05, -0.5, 0, Math.PI * 2); A.fill();
  },
  metal(c) { HUMAN_DRAW.metal(c); },
  rope({ A, H, s }) {
    for (let y = -s; y < s * 2; y += 6) {
      A.strokeStyle = grey(190, 0.6); H.strokeStyle = grey(90, 0.8); A.lineWidth = H.lineWidth = 2.5;
      for (const ctx of [A, H]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y + s * 0.5); ctx.stroke(); }
    }
  },
  canvas(c) { HUMAN_DRAW.canvas(c); },
  muzzle({ A, H, s, rng }) { speckle(A, s, rng, 260, 10, 150, 240, 0.25); speckle(H, s, rng, 1500, 1.5, 100, 150, 0.4); },
  plain(c) { HUMAN_DRAW.plain(c); },
  fleece(c) { HUMAN_DRAW.fleece(c); },
};

/** Builds the horse atlas: { map, normalMap, ormMap }. */
export function buildHorseAtlas(size = TUNING.size) {
  return buildAtlas({ size, regions: HREGIONS, draw: DRAW, surface: SURFACE, seed: 'horse-atlas', normalStrength: TEX.normalStrength * 0.8 });
}
