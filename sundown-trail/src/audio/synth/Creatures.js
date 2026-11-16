import { samples, buf, white, pink, brown, crackle, shape, ad, ahr, mix, biquad, lp1, hp1, osc, fm, formant, finish, loopify, softClip, wide } from './Core.js';

/**
 * Animal voices (Part 11): a voiced source (sawtooth or pulse with a pitch contour, jitter and vibrato) through
 * vowel formants — the horse's whinny and snort, wolves howling, growling and snapping, coyote yips, a bear's
 * roar, deer bleats, the birds of each biome (meadowlark, raven, hawk, crow, owl), crickets and death cries.
 */

/** A voiced call: pitch f(t), vowel(s) and a breathy noise share; out is the formant-filtered result. */
function voice(r, len, f, { vowel = 'a', shift = 1, breath = 0.15, wave = 'saw', jitter = 0.01, q = 8, env = (t) => 1 } = {}) {
  const n = samples(len), j = new Float32Array(n);
  let w = 0; for (let i = 0; i < n; i++) { if ((i & 63) === 0) w = (r() * 2 - 1) * jitter; j[i] = w; }
  const src = osc(n, (t) => f(t) * (1 + j[Math.min(n - 1, Math.floor(t * 44100))]), wave, 0, 0.3);
  mix(src, white(n, r), breath);
  const out = formant(src, vowel, shift, q);
  return shape(out, env);
}

export const CREATURE_SOUNDS = {
  // horse
  horse_snort: (r) => { const d = buf(0.9); for (let i = 0; i < 2; i++) { const s = white(samples(0.35), r); biquad(s, 'bandpass', 700 + r() * 300, 1.2); const v = formant(s, 'hh', 0.7, 4); shape(v, (t) => ahr(t, 0.02, 0.06, 0.18) * (1 + 0.6 * Math.sin(t * 2 * Math.PI * 35))); mix(d, v, i ? 0.7 : 1, samples(i * 0.28)); } return finish(d, 0.6); },
  horse_whinny: (r) => {
    const f = (t) => (t < 0.25 ? 900 + 500 * (t / 0.25) : 1400 - 700 * Math.min(1, (t - 0.25) / 1.1)) * (1 + 0.06 * Math.sin(t * 2 * Math.PI * (14 + 6 * t)));
    const d = voice(r, 1.5, f, { vowel: 'i', shift: 0.55, breath: 0.25, jitter: 0.02, env: (t) => ahr(t, 0.05, 0.9, 0.5) });
    const nick = voice(r, 1.5, (t) => 280 + 40 * Math.sin(t * 9), { vowel: 'hh', shift: 0.6, breath: 0.5, env: (t) => ahr(t - 1.1, 0.05, 0.15, 0.2) * 0.6 });
    mix(d, nick, 1);
    return finish(d, 0.65);
  },
  horse_hurt: (r) => finish(voice(r, 0.8, (t) => 1300 - 500 * t, { vowel: 'e', shift: 0.6, breath: 0.4, jitter: 0.04, env: (t) => ahr(t, 0.02, 0.3, 0.4) }), 0.7),
  // wolves, coyotes, bears, deer
  wolf_howl: (r) => {
    const base = 360 + r() * 60, f = (t) => (t < 0.6 ? base + 280 * Math.sin((t / 0.6) * Math.PI / 2) : t < 2.4 ? base + 280 - 20 * Math.sin(t * 3) : base + 280 - 260 * (t - 2.4) / 0.9) * (1 + 0.012 * Math.sin(t * 2 * Math.PI * 5.5));
    const d = voice(r, 3.4, f, { vowel: 'u', shift: (t) => 0.9 + 0.3 * Math.min(1, t / 0.6), wave: 'tri', breath: 0.05, jitter: 0.004, q: 6, env: (t) => ahr(t, 0.35, 1.9, 1.0) });
    mix(d, osc(d.length, f).map((x, i) => x * 0.35 * ahr(i / 44100, 0.35, 1.9, 1.0)), 1);
    return finish(d, 0.7, { fadeIn: 20, fadeOut: 200 });
  },
  wolf_growl: (r) => { const d = voice(r, 1.4, (t) => 85 + 15 * Math.sin(t * 5), { vowel: 'a', shift: 0.45, wave: 'pulse', breath: 0.6, jitter: 0.08, q: 4, env: (t) => ahr(t, 0.15, 0.8, 0.4) * (0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 22)) }); return finish(softClip(d, 1.5), 0.7); },
  wolf_bite: (r) => { const d = buf(0.5), s = white(d.length, r); hp1(s, 1500); shape(s, (t) => ad(t, 0.0005, 0.01)); mix(d, s, 1.2); const g = voice(r, 0.5, (t) => 160 - 60 * t, { vowel: 'a', shift: 0.5, breath: 0.6, wave: 'pulse', env: (t) => ahr(t - 0.02, 0.02, 0.15, 0.15) }); mix(d, g, 0.9); return finish(d, 0.8); },
  coyote_yip: (r) => { const d = buf(1.8); for (let i = 0; i < 5; i++) { const b = 900 + r() * 300, y = voice(r, 0.25, (t) => b + 700 * Math.sin(Math.PI * t / 0.22), { vowel: 'i', shift: 0.8, breath: 0.1, wave: 'tri', env: (t) => ahr(t, 0.02, 0.08, 0.1) }); mix(d, y, 0.8, samples(i * 0.27 + r() * 0.05)); } const h = voice(r, 1.1, (t) => 700 + 500 * Math.sin(Math.min(1, t / 0.4) * Math.PI / 2) - 300 * Math.max(0, t - 0.6), { vowel: 'u', shift: 1, wave: 'tri', breath: 0.05, env: (t) => ahr(t, 0.1, 0.6, 0.35) }); mix(d, h, 0.7, samples(0.7)); return finish(d, 0.6); },
  bear_roar: (r) => { const d = voice(r, 2.0, (t) => 110 + 60 * Math.sin(Math.min(1, t / 0.4) * Math.PI / 2) - 40 * Math.max(0, t - 1), { vowel: 'a', shift: 0.42, wave: 'pulse', breath: 0.7, jitter: 0.1, q: 3.5, env: (t) => ahr(t, 0.12, 1.2, 0.6) }); const rum = brown(d.length, r); shape(rum, (t) => ahr(t, 0.1, 1.2, 0.6)); mix(d, rum, 0.6); return finish(softClip(d, 2), 0.8); },
  bear_swipe: (r) => { const d = buf(0.6), s = white(d.length, r); biquad(s, 'bandpass', (t) => 400 + 1200 * Math.sin(Math.PI * Math.min(1, t / 0.25)), 1.4); shape(s, (t) => ahr(t, 0.08, 0.05, 0.1)); mix(d, s, 0.8); const th = osc(d.length, 70); shape(th, (t) => ad(t - 0.22, 0.003, 0.08)); mix(d, th, 1); return finish(d, 0.8); },
  deer_bleat: (r) => finish(voice(r, 0.6, (t) => 520 + 80 * Math.sin(t * 9) - 120 * t, { vowel: 'e', shift: 0.9, breath: 0.25, jitter: 0.02, wave: 'pulse', env: (t) => ahr(t, 0.03, 0.3, 0.2) }), 0.55),
  // death cries (by species; aliases map the rest)
  deer_death: (r) => finish(voice(r, 0.9, (t) => 620 - 300 * t, { vowel: 'e', shift: 0.8, breath: 0.4, jitter: 0.04, wave: 'pulse', env: (t) => ahr(t, 0.03, 0.35, 0.45) }), 0.6),
  wolf_death: (r) => finish(voice(r, 0.8, (t) => 900 - 500 * t, { vowel: 'i', shift: 0.7, breath: 0.3, jitter: 0.03, wave: 'tri', env: (t) => ahr(t, 0.02, 0.25, 0.4) }), 0.6),
  bear_death: (r) => finish(softClip(voice(r, 1.6, (t) => 120 - 40 * t, { vowel: 'o', shift: 0.45, breath: 0.6, jitter: 0.08, wave: 'pulse', q: 4, env: (t) => ahr(t, 0.1, 0.8, 0.6) }), 1.5), 0.7),
  rabbit_death: (r) => finish(voice(r, 0.35, (t) => 1800 - 900 * t, { vowel: 'i', shift: 1.2, breath: 0.2, wave: 'tri', env: (t) => ahr(t, 0.01, 0.1, 0.2) }), 0.45),
  bird_death: (r) => { const d = buf(0.5), s = white(d.length, r); biquad(s, 'bandpass', 2400, 1.5); shape(s, (t) => ahr(t, 0.02, 0.1, 0.25)); mix(d, s, 0.6); return finish(d, 0.4); },
  // birds
  bird_meadowlark: (r) => {
    const d = buf(2.2), notes = [2900, 3400, 2600, 2200, 3100, 2000, 2500];
    let at = 0.05;
    for (let i = 0; i < notes.length; i++) {
      const len = 0.08 + r() * 0.12, f0 = notes[i] * (0.92 + r() * 0.16), f1 = f0 * (0.8 + r() * 0.5);
      const s = fm(samples(len), (t) => f0 + (f1 - f0) * (t / len), 2, 0.5 + r()); shape(s, (t) => ahr(t, 0.01, len - 0.03, 0.02)); mix(d, s, 0.5 + r() * 0.5, samples(at));
      at += len + 0.02 + r() * 0.06;
    }
    return finish(d, 0.5);
  },
  bird_raven: (r) => { const d = buf(1.3); for (let i = 0; i < 2 + Math.floor(r() * 2); i++) { const k = voice(r, 0.35, (t) => 380 - 80 * t, { vowel: 'a', shift: 1.1, wave: 'pulse', breath: 0.5, jitter: 0.15, q: 5, env: (t) => ahr(t, 0.02, 0.15, 0.12) * (0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 45)) }); mix(d, k, 0.8, samples(i * 0.38)); } return finish(d, 0.5); },
  bird_hawk: (r) => { const d = buf(1.6), s = fm(d.length, (t) => 3200 - 1300 * Math.min(1, t / 1.2), 0.5, (t) => 0.8 + 0.6 * Math.sin(t * 40)); shape(s, (t) => ahr(t, 0.05, 0.6, 0.6)); mix(d, s, 0.6); const n = white(d.length, r); biquad(n, 'bandpass', (t) => 3000 - 1200 * Math.min(1, t / 1.2), 6); shape(n, (t) => ahr(t, 0.05, 0.6, 0.6)); mix(d, n, 0.5); return finish(d, 0.5); },
  crow_caw: (r) => { const d = buf(1.2); for (let i = 0; i < 2 + Math.floor(r() * 2); i++) { const k = voice(r, 0.3, (t) => 600 - 150 * t, { vowel: 'a', shift: 1.4, wave: 'pulse', breath: 0.7, jitter: 0.2, q: 4, env: (t) => ahr(t, 0.02, 0.12, 0.12) }); mix(d, k, 0.8, samples(i * 0.33 + r() * 0.05)); } return finish(softClip(d, 1.5), 0.5); },
  owl: (r) => { const d = buf(2.4), pat = [0, 0.55, 0.8, 1.05, 1.6]; for (const at of pat) { const h = voice(r, 0.4, (t) => 380 - 20 * t, { vowel: 'u', shift: 0.9, wave: 'tri', breath: 0.15, jitter: 0.004, env: (t) => ahr(t, 0.04, 0.12, 0.18) }); mix(d, h, at === 0 ? 0.6 : 0.8, samples(at)); } return finish(d, 0.5); },
  // loops
  crickets_loop: (r) => {
    const make = () => {
      const n = samples(6), d = new Float32Array(n);
      for (let c = 0; c < 5; c++) {
        const f = 4200 + r() * 1400, rate = 1.2 + r() * 1.6, pulses = 3 + Math.floor(r() * 3), amp = 0.3 + r() * 0.7;
        for (let t = r() * 0.5; t < 5.8; t += 1 / rate + r() * 0.05) for (let p = 0; p < pulses; p++) { const s = osc(samples(0.018), f); shape(s, (x) => ahr(x, 0.003, 0.008, 0.006)); mix(d, s, amp, samples(t + p * 0.03)); }
      }
      return finish(loopify(d, 0.4), 0.5, { fadeIn: 0, fadeOut: 0 });
    };
    return wide(make());
  },
};
void pink; void crackle; void lp1;
