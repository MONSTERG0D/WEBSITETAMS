import { samples, buf, white, pink, brown, crackle, shape, ad, ahr, mix, biquad, lp1, hp1, osc, fm, formant, finish, loopify, softClip, VOWELS, wide } from './Core.js';

/**
 * Weather, water, wind and towns (Part 11): thunder near and far, rain, wind with gusts and whistles, the river,
 * a town's crowd murmur, single passers-by murmuring, and the church bell. Beds are seamless loops; wide ones
 * are stereo with decorrelated channels.
 */

export const NATURE_SOUNDS = {
  thunder: (r) => { // far: a long, low, rolling rumble
    const n = samples(5), d = brown(n, r); lp1(d, (t) => 160 + 140 * Math.exp(-t / 1.5));
    shape(d, (t) => ad(t, 0.4, 2.2) * (1 + 0.6 * Math.sin(t * 3.1 + r() * 6) * Math.sin(t * 1.7)));
    const s = pink(n, r); lp1(s, 400); shape(s, (t) => ad(t, 0.2, 1) * 0.3); mix(d, s, 1);
    return finish(softClip(d, 1.4), 0.9, { fadeIn: 30, fadeOut: 600 });
  },
  thunder_close: (r) => { // near: a ripping crack, then the boom
    const n = samples(5), d = new Float32Array(n), cr = white(n, r); hp1(cr, 700); shape(cr, (t) => ad(t, 0.002, 0.18) * (1 + 0.8 * Math.sin(t * 2 * Math.PI * 30) * Math.exp(-t / 0.2))); mix(d, cr, 1.2);
    const b = brown(n, r); lp1(b, (t) => 120 + 900 * Math.exp(-t / 0.3)); shape(b, (t) => ad(t - 0.04, 0.03, 1.8)); mix(d, b, 1.6);
    return finish(softClip(d, 2), 1, { fadeIn: 1, fadeOut: 500 });
  },
  rain_loop: (r) => {
    const make = () => {
      const n = samples(6), d = pink(n, r); hp1(d, 500); lp1(d, 7000); gain(d, 0.5);
      const drops = crackle(n, 900, r, 0.4, [0.1, 0.6]); biquad(drops, 'bandpass', 3500, 0.6); mix(d, drops, 0.6);
      const big = crackle(n, 40, r, 2, [0.3, 1]); biquad(big, 'bandpass', 1200, 1.2); mix(d, big, 0.4);
      return finish(loopify(d, 0.8), 0.6, { fadeIn: 0, fadeOut: 0 });
    };
    return wide(make());
  },
  wind_loop: (r) => {
    const make = (ch) => {
      const n = samples(6.5), d = pink(n, r), ph = r() * 6;
      const gust = (t) => 0.55 + 0.35 * Math.sin(t * 0.63 + ph) * Math.sin(t * 0.27 + ph * 2) + 0.15 * Math.sin(t * 1.9 + ph);
      biquad(d, 'bandpass', (t) => 300 + 650 * gust(t), 0.6); shape(d, gust);
      const wh = pink(n, r); biquad(wh, 'bandpass', (t) => 900 + 500 * Math.sin(t * 0.4 + ch), 12); shape(wh, (t) => Math.max(0, gust(t) - 0.6) * 1.5); mix(d, wh, 0.35);
      return finish(loopify(d, 1.5), 0.55, { fadeIn: 0, fadeOut: 0 });
    };
    return wide(make(0));
  },
  river_loop: (r) => {
    const n = samples(7), d = brown(n, r); lp1(d, 900);
    const s = pink(n, r); biquad(s, 'bandpass', 1400, 0.5); mix(d, s, 0.5);
    const bub = crackle(n, 70, r, 3, [0.2, 0.8]); biquad(bub, 'bandpass', 900, 2); mix(d, bub, 0.6);
    for (let i = 0; i < 40; i++) { const g = osc(samples(0.06), (t) => 400 + r() * 500 + t * 3000); shape(g, (t) => ad(t, 0.004, 0.015)); mix(d, g, 0.08 + r() * 0.08, samples(r() * 6.9)); }
    return finish(loopify(d, 1), 0.6, { fadeIn: 0, fadeOut: 0 });
  },
  crowd_murmur_loop: (r) => {
    const make = () => {
      const n = samples(4.4), d = new Float32Array(n), vowels = Object.keys(VOWELS).filter((v) => v !== 'hh');
      for (let p = 0; p < 5; p++) {
        const pitch = 100 + r() * 130, shift = 0.85 + r() * 0.3;
        for (let t = r() * 0.5; t < 4.2; t += 0.12 + r() * 0.2) {
          if (r() < 0.25) { t += 0.3 + r() * 0.6; continue; }
          const len = 0.08 + r() * 0.14, src = osc(samples(len), (x) => pitch * (1 + 0.15 * Math.sin(x * 20)), 'saw');
          const v = formant(src, vowels[Math.floor(r() * vowels.length)], shift, 5); shape(v, (x) => ahr(x, 0.02, len - 0.05, 0.03)); mix(d, v, 0.25 + r() * 0.3, samples(t));
        }
      }
      lp1(d, 2200); const room = pink(n, r); lp1(room, 600); mix(d, room, 0.15);
      return finish(loopify(d, 0.8), 0.5, { fadeIn: 0, fadeOut: 0 });
    };
    return wide(make());
  },
  murmur: (r) => { // one passer-by muttering
    const d = buf(1.2), vowels = ['a', 'o', 'e', 'u'], pitch = 95 + r() * 90;
    for (let t = 0.02; t < 1.0; t += 0.13 + r() * 0.1) { const len = 0.08 + r() * 0.1, src = osc(samples(len), (x) => pitch * (1 + 0.1 * Math.sin(x * 25)), 'saw'); const v = formant(src, vowels[Math.floor(r() * 4)], 1, 5); shape(v, (x) => ahr(x, 0.02, len - 0.05, 0.03)); mix(d, v, 0.5 + r() * 0.4, samples(t)); }
    lp1(d, 1800);
    return finish(d, 0.4);
  },
  church_bell: (r) => {
    const n = samples(5), d = new Float32Array(n), f0 = 392;
    for (const [m, a, dec] of [[0.5, 0.5, 4], [1, 1, 3.2], [1.19, 0.5, 2.6], [1.5, 0.45, 2.2], [2, 0.35, 1.8], [2.74, 0.25, 1.2]]) { const len = Math.min(n, samples(dec * 6)), p = osc(len, f0 * m * (1 + (r() - 0.5) * 0.002)); shape(p, (t) => ad(t, 0.002, dec)); mix(d, p, a); }
    const strike = white(samples(0.02), r); hp1(strike, 2000); shape(strike, (t) => ad(t, 0.0003, 0.004)); mix(d, strike, 0.5);
    return finish(d, 0.7, { fadeIn: 0.5, fadeOut: 400 });
  },
};
function gain(d, g) { for (let i = 0; i < d.length; i++) d[i] *= g; return d; }
void buf;
