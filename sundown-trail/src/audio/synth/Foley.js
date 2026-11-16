import { samples, buf, white, pink, brown, crackle, shape, ad, ahr, mix, biquad, lp1, hp1, osc, fm, formant, finish, loopify, softClip } from './Core.js';

/**
 * Foley (Part 11): footsteps on every surface, hooves at every gait, doors, money, eating and drinking, rope,
 * leather, the whistle, skinning, the campfire and the sizzle of the spit. Footsteps and hooves are made in
 * several variations (the SFX system picks one at random and nudges its pitch) so walking never machine-guns.
 */

export const SURFACES = ['grass', 'dirt', 'road', 'sand', 'rock', 'snow', 'wood', 'mud', 'water'];
export const GAITS = ['walk', 'trot', 'canter', 'gallop'];

/** One footfall's texture on a surface; `weight` 1 = a man walking, 3+ = a horse at speed. */
function fall(r, surface, weight = 1, len = 0.32) {
  const d = buf(len), heavy = Math.min(1, weight / 3);
  // the weight of it: a short low thump
  const th = osc(d.length, (t) => (70 + 40 * (1 - heavy)) * (1 + 0.8 * Math.exp(-t / 0.008))); shape(th, (t) => ad(t, 0.0015, 0.018 + 0.02 * heavy));
  mix(d, th, surface === 'snow' || surface === 'sand' || surface === 'grass' ? 0.5 : surface === 'water' ? 0.3 : 0.8);
  const n = d.length;
  switch (surface) {
    case 'grass': { const s = white(n, r); biquad(s, 'bandpass', 3200 + r() * 1500, 0.8); shape(s, (t) => ahr(t, 0.01, 0.02, 0.09)); mix(d, s, 0.55); break; }
    case 'dirt': case 'road': { const s = white(n, r); lp1(s, surface === 'road' ? 2600 : 1800); shape(s, (t) => ad(t, 0.001, 0.025)); mix(d, s, 0.9); const g = crackle(n, 400, r, 0.6); hp1(g, 2000); shape(g, (t) => ad(t, 0.002, 0.04)); mix(d, g, 0.35); break; }
    case 'sand': { const g = crackle(n, 1600, r, 0.8); lp1(g, 3000); shape(g, (t) => ahr(t, 0.008, 0.03, 0.08)); mix(d, g, 0.9); break; }
    case 'rock': { const c = white(n, r); biquad(c, 'bandpass', 2800 + r() * 1200, 2); shape(c, (t) => ad(t, 0.0003, 0.008)); mix(d, c, 1.3); const k = osc(n, 900 + r() * 400, 'tri'); shape(k, (t) => ad(t, 0.0005, 0.012)); mix(d, k, 0.35 * heavy + 0.15); break; }
    case 'snow': { const g = crackle(n, 2600, r, 1.2); lp1(g, 2200); shape(g, (t) => ahr(t, 0.02, 0.04, 0.12)); mix(d, g, 1); break; }
    case 'wood': { const k = osc(n, 180 + r() * 40, 'tri'); shape(k, (t) => ad(t, 0.0008, 0.045)); mix(d, k, 0.9); const k2 = osc(n, 420 + r() * 80); shape(k2, (t) => ad(t, 0.0005, 0.02)); mix(d, k2, 0.5); const c = white(n, r); biquad(c, 'bandpass', 2400, 1.5); shape(c, (t) => ad(t, 0.0003, 0.006)); mix(d, c, 0.7); break; }
    case 'mud': { const s = white(n, r); biquad(s, 'bandpass', (t) => 300 + 900 * Math.exp(-t / 0.05), 2.5); shape(s, (t) => ahr(t, 0.01, 0.04, 0.1)); mix(d, s, 1.2); break; }
    case 'water': { const s = white(n, r); biquad(s, 'bandpass', (t) => 700 + 2600 * Math.exp(-t / 0.04), 1); shape(s, (t) => ad(t, 0.003, 0.09)); mix(d, s, 1.2); for (let i = 0; i < 4; i++) { const b = osc(samples(0.04), (t) => 600 + r() * 700 + t * 6000); shape(b, (t) => ad(t, 0.002, 0.012)); mix(d, b, 0.2, samples(0.04 + r() * 0.15)); } break; }
  }
  return d;
}
/** A hoof: a clop (hard hooves ring a little on hard ground) plus the surface, heavier at speed. */
function hoof(r, gait, surface) {
  const w = { walk: 1.6, trot: 2.4, canter: 3, gallop: 3.6 }[gait], d = fall(r, surface, w, 0.36);
  if (surface === 'rock' || surface === 'road' || surface === 'wood' || surface === 'dirt') {
    const k = osc(d.length, (surface === 'wood' ? 520 : 760) + r() * 160, 'tri'); shape(k, (t) => ad(t, 0.0005, 0.018)); mix(d, k, surface === 'dirt' ? 0.25 : 0.6);
  }
  if (gait === 'gallop' || gait === 'canter') { const s = brown(d.length, r); shape(s, (t) => ad(t, 0.002, 0.05)); mix(d, s, 0.6); }
  return finish(d, { walk: 0.5, trot: 0.62, canter: 0.75, gallop: 0.85 }[gait], { fadeOut: 40 });
}

/** A rope/leather stick-slip creak: pulses at a wandering rate through a body resonance. */
function creak(r, len, rate = [40, 160], body = 900, q = 4) {
  const n = samples(len), d = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / 44100; const f = rate[0] + (rate[1] - rate[0]) * (0.5 + 0.5 * Math.sin(t * 7 + Math.sin(t * 3) * 2)); ph += f / 44100; if (ph >= 1) { ph -= 1; d[i] = 1; } }
  biquad(d, 'bandpass', body, q); mix(d, white(n, r).map((x) => x * 0.05), 1);
  return d;
}

export const FOLEY_SOUNDS = {
  door_open: (r) => { const d = buf(1.1), c = creak(r, 0.9, [30, 120], 650 + r() * 200, 6); shape(c, (t) => ahr(t, 0.08, 0.5, 0.3)); mix(d, c, 1, samples(0.12)); const l = white(samples(0.05), r); biquad(l, 'bandpass', 2600, 2); shape(l, (t) => ad(t, 0.0003, 0.008)); mix(d, l, 1.2, samples(0.02)); return finish(d, 0.6); },
  door_close: (r) => { const d = buf(0.7), th = osc(d.length, 85); shape(th, (t) => ad(t, 0.002, 0.07)); mix(d, th, 1); const s = brown(d.length, r); shape(s, (t) => ad(t, 0.002, 0.06)); mix(d, s, 0.7); const l = white(samples(0.05), r); biquad(l, 'bandpass', 2400, 2); shape(l, (t) => ad(t, 0.0003, 0.01)); mix(d, l, 0.9, samples(0.06)); return finish(d, 0.7); },
  coins: (r) => { const d = buf(0.8); for (let i = 0; i < 7; i++) { const p = fm(samples(0.25), 3800 + r() * 2600, 1.73, (t) => 2.5 * Math.exp(-t / 0.02)); shape(p, (t) => ad(t, 0.0002, 0.05 + r() * 0.06)); mix(d, p, 0.5, samples(r() * 0.35)); } return finish(d, 0.55); },
  cash_register: (r) => { const d = buf(1.2), bell = fm(d.length, 2093, 3.5, (t) => 3 * Math.exp(-t / 0.25)); shape(bell, (t) => ad(t, 0.001, 0.4)); mix(d, bell, 0.6, samples(0.12)); for (let i = 0; i < 3; i++) { const k = white(samples(0.04), r); biquad(k, 'bandpass', 1800, 2); shape(k, (t) => ad(t, 0.0003, 0.006)); mix(d, k, 0.6, samples(i * 0.04)); } const dr = white(d.length, r); lp1(dr, 1400); shape(dr, (t) => ahr(t - 0.2, 0.03, 0.15, 0.1) * 0.5); mix(d, dr, 1); return finish(d, 0.6); },
  pickup: (r) => { const d = buf(0.35), s = white(d.length, r); biquad(s, 'bandpass', 1600, 1); shape(s, (t) => ahr(t, 0.02, 0.06, 0.15)); mix(d, s, 0.8); const th = osc(d.length, 140); shape(th, (t) => ad(t, 0.002, 0.03)); mix(d, th, 0.4); return finish(d, 0.45); },
  eat: (r) => { const d = buf(1.1); for (let i = 0; i < 3; i++) { const g = crackle(samples(0.18), 900, r, 1); lp1(g, 2600); shape(g, (t) => ahr(t, 0.01, 0.05, 0.1)); mix(d, g, 0.8, samples(0.05 + i * 0.32)); const m = brown(samples(0.18), r); shape(m, (t) => ahr(t, 0.02, 0.05, 0.1)); mix(d, m, 0.4, samples(0.1 + i * 0.32)); } return finish(d, 0.5); },
  drink: (r) => { const d = buf(1.2); for (let i = 0; i < 3; i++) { const src = osc(samples(0.16), (t) => 180 + 60 * Math.sin(t * 30), 'saw'); const g = formant(src, 'o', 0.8 + r() * 0.2, 6); shape(g, (t) => ahr(t, 0.02, 0.05, 0.08)); mix(d, g, 0.6, samples(0.1 + i * 0.33)); const b = white(samples(0.12), r); biquad(b, 'bandpass', 900, 3); shape(b, (t) => ad(t, 0.005, 0.03)); mix(d, b, 0.3, samples(0.2 + i * 0.33)); } return finish(d, 0.5); },
  glass_clink: (r) => { const d = buf(1); for (let i = 0; i < 2; i++) { const p = fm(d.length, 2600 + r() * 300, 2.92, (t) => 2 * Math.exp(-t / 0.05)); shape(p, (t) => ad(t, 0.0002, 0.3)); mix(d, p, 0.5, samples(i * 0.012)); } return finish(d, 0.5); },
  lasso_throw: (r) => { const d = buf(0.9), s = white(d.length, r); biquad(s, 'bandpass', (t) => 900 + 700 * Math.sin(t * 2 * Math.PI * 3.2), 2); shape(s, (t) => ahr(t, 0.1, 0.4, 0.3)); mix(d, s, 1); return finish(d, 0.5); },
  lasso_tighten: (r) => { const d = buf(0.6), c = creak(r, 0.5, [60, 220], 1200, 3); shape(c, (t) => ahr(t, 0.01, 0.2, 0.25)); mix(d, c, 1); const s = white(samples(0.06), r); lp1(s, 1500); shape(s, (t) => ad(t, 0.001, 0.02)); mix(d, s, 0.8); return finish(d, 0.55); },
  lasso_miss: (r) => { const d = buf(0.5), s = white(d.length, r); lp1(s, 1200); shape(s, (t) => ad(t - 0.05, 0.005, 0.06)); mix(d, s, 1); return finish(d, 0.45); },
  hogtie: (r) => { const d = buf(1.6); for (let i = 0; i < 3; i++) { const c = creak(r, 0.3, [50, 180], 1000 + r() * 400, 3); shape(c, (t) => ahr(t, 0.02, 0.15, 0.12)); mix(d, c, 0.8, samples(0.1 + i * 0.45)); const s = white(samples(0.25), r); biquad(s, 'bandpass', 1400, 1.2); shape(s, (t) => ahr(t, 0.03, 0.08, 0.1)); mix(d, s, 0.4, samples(0.25 + i * 0.45)); } return finish(d, 0.5); },
  saddle_creak: (r) => { const d = buf(0.8), c = creak(r, 0.7, [25, 90], 520 + r() * 150, 5); shape(c, (t) => ahr(t, 0.05, 0.35, 0.25)); mix(d, c, 1); return finish(d, 0.45); },
  whistle_call: (r) => {
    const d = buf(1.3), f = (t) => (t < 0.45 ? 1500 + 900 * Math.min(1, t / 0.12) : t < 0.6 ? 2400 - 2600 * (t - 0.45) : 2000 + 600 * Math.min(1, (t - 0.6) / 0.08)) * (1 + 0.012 * Math.sin(t * 2 * Math.PI * 6));
    const w = osc(d.length, f); shape(w, (t) => ahr(t, 0.03, 0.35, 0.05) + (t > 0.58 ? ahr(t - 0.58, 0.03, 0.42, 0.18) : 0)); mix(d, w, 1);
    const b = white(d.length, r); biquad(b, 'bandpass', f, 8); shape(b, (t) => ahr(t, 0.03, 1.0, 0.2) * 0.25); mix(d, b, 1);
    return finish(d, 0.6);
  },
  skin_cut: (r) => { const d = buf(1.6); for (let i = 0; i < 3; i++) { const s = white(samples(0.35), r); biquad(s, 'bandpass', (t) => 1200 + 2500 * Math.min(1, t / 0.3), 2); shape(s, (t) => ahr(t, 0.04, 0.1, 0.2)); mix(d, s, 0.6, samples(0.1 + i * 0.45)); const tear = white(samples(0.2), r); lp1(tear, 900); shape(tear, (t) => ahr(t, 0.02, 0.05, 0.1)); mix(d, tear, 0.5, samples(0.35 + i * 0.45)); } return finish(d, 0.45); },
  camp_make: (r) => { const d = buf(1.6), s = white(d.length, r); biquad(s, 'bandpass', 900, 0.8); shape(s, (t) => ahr(t, 0.05, 0.3, 0.3) * (0.6 + 0.4 * Math.sin(t * 40))); mix(d, s, 0.7); for (let i = 0; i < 3; i++) { const k = osc(samples(0.1), 300 + r() * 60, 'tri'); shape(k, (t) => ad(t, 0.0005, 0.02)); mix(d, k, 0.8, samples(0.8 + i * 0.22)); } return finish(d, 0.5); },
  // Added in Part 13: ranch chores and the overnight builders
  axe_chop: (r) => { const d = buf(0.6), th = osc(d.length, (t) => 120 + 90 * Math.exp(-t / 0.02)); shape(th, (t) => ad(t, 0.001, 0.06)); mix(d, th, 0.9); const k = white(d.length, r); biquad(k, 'bandpass', 1500, 1.4); shape(k, (t) => ad(t, 0.0005, 0.03)); mix(d, k, 1); const s = crackle(samples(0.2), 300, r, 1); biquad(s, 'bandpass', 2600, 1); shape(s, (t) => ad(t, 0.004, 0.05)); mix(d, s, 0.5, samples(0.02)); return finish(softClip(d, 1.4), 0.75); },
  wood_split: (r) => { const d = buf(0.9), c = crackle(samples(0.35), 900, r, 1.2); biquad(c, 'bandpass', 1900, 0.9); shape(c, (t) => ahr(t, 0.003, 0.05, 0.2)); mix(d, c, 1); for (let i = 0; i < 2; i++) { const b = osc(samples(0.12), 240 + r() * 120, 'tri'); shape(b, (t) => ad(t, 0.001, 0.04)); mix(d, b, 0.6, samples(0.35 + i * 0.16)); } return finish(d, 0.6); },
  water_pour: (r) => { const d = buf(1.6), s = white(d.length, r); biquad(s, 'bandpass', (t) => 700 + 500 * Math.sin(t * 9) * Math.sin(t * 2.3), 2.5); shape(s, (t) => ahr(t, 0.08, 1.0, 0.4)); mix(d, s, 0.8); const g = crackle(d.length, 60, r, 0.6); biquad(g, 'bandpass', 1300, 2); shape(g, (t) => ahr(t, 0.08, 1.0, 0.4)); mix(d, g, 0.6); return finish(d, 0.5); },
  bucket: (r) => { const d = buf(0.7), p = fm(d.length, 410 + r() * 60, 1.41, (t) => 2 * Math.exp(-t / 0.04)); shape(p, (t) => ad(t, 0.001, 0.25)); mix(d, p, 0.5); const k = white(samples(0.05), r); lp1(k, 2000); shape(k, (t) => ad(t, 0.0005, 0.02)); mix(d, k, 0.7); return finish(d, 0.5); },
  hay_toss: (r) => { const d = buf(0.8), s = white(d.length, r); biquad(s, 'bandpass', 2200, 0.7); shape(s, (t) => ahr(t, 0.04, 0.15, 0.35) * (0.7 + 0.3 * Math.sin(t * 60))); mix(d, s, 0.8); const th = brown(d.length, r); shape(th, (t) => ad(t - 0.18, 0.01, 0.08)); mix(d, th, 0.6); return finish(d, 0.45); },
  hammering: (r) => { const d = buf(2.6); for (let i = 0; i < 9; i++) { const at = 0.1 + i * 0.27 + r() * 0.05, h = fm(samples(0.2), 900 + r() * 200, 2.1, (t) => 2 * Math.exp(-t / 0.01)); shape(h, (t) => ad(t, 0.0003, 0.05)); mix(d, h, 0.5, samples(at)); const w = osc(samples(0.12), 150, 'tri'); shape(w, (t) => ad(t, 0.001, 0.04)); mix(d, w, 0.5, samples(at)); } return finish(d, 0.6); },
  map_unfold: (r) => { const d = buf(1.1); for (let i = 0; i < 6; i++) { const c = crackle(samples(0.22), 260 + r() * 300, r, 1); biquad(c, 'bandpass', 2600 + r() * 1800, 0.8); shape(c, (t) => ahr(t, 0.01, 0.06, 0.12)); mix(d, c, 0.7, samples(i * 0.13 + r() * 0.05)); } const w = white(d.length, r); biquad(w, 'bandpass', 1400, 0.6); shape(w, (t) => ahr(t, 0.05, 0.5, 0.4) * 0.35); mix(d, w, 1); return finish(d, 0.45); }, // Part 14: paper
  duel_bell: (r) => { const d = buf(3.2); for (const [f, a, tau] of [[523, 1, 1.6], [1046 * 1.01, 0.5, 0.9], [1569, 0.3, 0.6], [2700, 0.18, 0.3]]) { const p = fm(d.length, f, 2.76, (t) => 1.6 * Math.exp(-t / 0.4)); shape(p, (t) => ad(t, 0.002, tau)); mix(d, p, a * 0.5); } const k = white(samples(0.02), r); biquad(k, 'bandpass', 3000, 2); shape(k, (t) => ad(t, 0.0003, 0.006)); mix(d, k, 0.5); return finish(d, 0.75); }, // Part 15: the duel bell
  // loops
  cooking_sizzle: (r) => { const n = samples(4.5), g = crackle(n, 2600, r, 0.5, [0.1, 0.5]); hp1(g, 2500); const h = white(n, r); biquad(h, 'bandpass', 5000, 0.7); shape(h, (t) => 0.4 + 0.1 * Math.sin(t * 3)); mix(g, h, 0.3); return finish(loopify(g, 0.6), 0.45, { fadeIn: 0, fadeOut: 0 }); },
  campfire_loop: (r) => {
    const n = samples(7), roar = brown(n, r); lp1(roar, 380); shape(roar, (t) => 0.7 + 0.3 * Math.sin(t * 1.3) * Math.sin(t * 0.7));
    const c = crackle(n, 22, r, 1.5, [0.2, 1]); biquad(c, 'bandpass', 2400, 0.6); mix(roar, c, 0.9);
    const pops = crackle(n, 2.5, r, 4, [0.6, 1.4]); biquad(pops, 'bandpass', 1400, 1.2); mix(roar, pops, 1.1);
    softClip(roar, 1.2);
    return finish(loopify(roar, 0.8), 0.7, { fadeIn: 0, fadeOut: 0 });
  },
};
/** footstep_<surface> (4 variations each) and hoof_<gait>_<surface> (3 each). */
export function footstep(r, surface) { return finish(fall(r, surface, 1, 0.28), surface === 'snow' || surface === 'grass' ? 0.38 : 0.45, { fadeOut: 30 }); }
export { hoof };
void pink; void softClip;
