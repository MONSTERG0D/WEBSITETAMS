import { samples, buf, white, pink, shape, ad, ahr, mix, biquad, lp1, hp1, osc, fm, formant, finish, loopify } from './Core.js';

/**
 * Interface and feedback sounds (Part 11): quiet, woody, period-appropriate — paper and wood clicks, a small
 * chime for notifications, rising and falling notes for honor, Focus going in and out, the heartbeat, hit and
 * kill cues, and the voice blips that stand in for speech (Part 8 plays them per syllable with pitch).
 */
const note = (len, f, wave = 'sine') => osc(samples(len), f, wave);

export const UI_SOUNDS = {
  ui_click: (r) => { const d = buf(0.08), c = white(d.length, r); biquad(c, 'bandpass', 1800, 1.5); shape(c, (t) => ad(t, 0.0003, 0.006)); mix(d, c, 1); const k = note(0.08, 900, 'tri'); shape(k, (t) => ad(t, 0.0005, 0.01)); mix(d, k, 0.4); return finish(d, 0.35); },
  ui_hover: (r) => { const d = buf(0.05), c = white(d.length, r); biquad(c, 'bandpass', 3000, 2); shape(c, (t) => ad(t, 0.0003, 0.004)); return finish(mix(d, c, 1), 0.15); },
  ui_tick: (r) => { const d = buf(0.05), k = note(0.05, 1400, 'tri'); shape(k, (t) => ad(t, 0.0003, 0.006)); mix(d, k, 1); return finish(d, 0.25); },
  ui_open: (r) => { const d = buf(0.35), s = pink(d.length, r); biquad(s, 'bandpass', (t) => 600 + 2400 * Math.min(1, t / 0.25), 1); shape(s, (t) => ahr(t, 0.03, 0.08, 0.2)); mix(d, s, 0.8); return finish(d, 0.3); },
  ui_close: (r) => { const d = buf(0.3), s = pink(d.length, r); biquad(s, 'bandpass', (t) => 2600 - 2000 * Math.min(1, t / 0.2), 1); shape(s, (t) => ahr(t, 0.02, 0.06, 0.18)); mix(d, s, 0.8); return finish(d, 0.28); },
  notify: () => { const d = buf(0.7); for (const [at, f] of [[0, 784], [0.09, 1175]]) { const b = fm(samples(0.6), f, 2, (t) => 1.2 * Math.exp(-t / 0.05)); shape(b, (t) => ad(t, 0.002, 0.25)); mix(d, b, 0.6, samples(at)); } return finish(d, 0.3); },
  honor_up: () => { const d = buf(1.1); [523, 659, 784].forEach((f, i) => { const b = fm(samples(0.9), f, 2, (t) => Math.exp(-t / 0.1)); shape(b, (t) => ad(t, 0.004, 0.35)); mix(d, b, 0.5, samples(i * 0.1)); }); return finish(d, 0.35); },
  honor_down: () => { const d = buf(1.1); [392, 311, 262].forEach((f, i) => { const b = osc(samples(0.9), f, 'tri'); shape(b, (t) => ad(t, 0.006, 0.3)); mix(d, b, 0.5, samples(i * 0.12)); }); lp1(d, 1500); return finish(d, 0.35); },
  focus_enter: (r) => { const d = buf(1.0), s = pink(d.length, r); biquad(s, 'lowpass', (t) => 6000 * Math.exp(-t / 0.15) + 200, 2); shape(s, (t) => ad(t, 0.01, 0.3)); mix(d, s, 1); const th = osc(d.length, (t) => 55 + 40 * Math.exp(-t / 0.1)); shape(th, (t) => ad(t, 0.005, 0.25)); mix(d, th, 0.8); return finish(d, 0.6); },
  focus_exit: (r) => { const d = buf(0.7), s = pink(d.length, r); biquad(s, 'lowpass', (t) => 200 + 5000 * Math.min(1, t / 0.4), 2); shape(s, (t) => ahr(t, 0.25, 0.05, 0.3)); mix(d, s, 1); return finish(d, 0.5); },
  focus_mark: (r) => { const d = buf(0.15), k = note(0.15, 150, 'tri'); shape(k, (t) => ad(t, 0.0005, 0.02)); mix(d, k, 1); const c = white(d.length, r); lp1(c, 1500); shape(c, (t) => ad(t, 0.0005, 0.01)); mix(d, c, 0.6); return finish(d, 0.5); },
  heartbeat: () => {
    const d = buf(1.0);
    for (const [at, a] of [[0.02, 1], [0.24, 0.7]]) { const b = osc(samples(0.2), (t) => 48 + 20 * Math.exp(-t / 0.02)); shape(b, (t) => ad(t, 0.004, 0.05)); mix(d, b, a, samples(at)); }
    lp1(d, 300);
    return finish(loopify(d, 0.05), 0.75, { fadeIn: 0, fadeOut: 0 });
  },
  hit_marker: (r) => { const d = buf(0.07), c = white(d.length, r); biquad(c, 'bandpass', 2500, 2); shape(c, (t) => ad(t, 0.0003, 0.005)); mix(d, c, 1); return finish(d, 0.35); },
  // Added in Part 16 (photo mode): a box camera's shutter — the lever's snap, the leaf's two clicks, a spring's ring
  camera_shutter: (r) => {
    const d = buf(0.42);
    for (const [at, f, a, q] of [[0, 2600, 1, 1.4], [0.055, 1700, 0.75, 1.2], [0.11, 3200, 0.45, 2]]) { const c = white(samples(0.05), r); biquad(c, 'bandpass', f, q); shape(c, (t) => ad(t, 0.0002, 0.007)); mix(d, c, a, samples(at)); }
    const ring = osc(samples(0.3), 2350, 'tri'); shape(ring, (t) => ad(t, 0.001, 0.07)); mix(d, ring, 0.05, samples(0.06));
    const thud = osc(samples(0.08), (t) => 180 + 120 * Math.exp(-t / 0.01)); shape(thud, (t) => ad(t, 0.0005, 0.02)); mix(d, thud, 0.35, samples(0.05));
    hp1(d, 120); return finish(d, 0.55);
  },
  kill_cue: () => { const d = buf(0.6), b = fm(d.length, 196, 1.4, (t) => 2 * Math.exp(-t / 0.05)); shape(b, (t) => ad(t, 0.002, 0.18)); mix(d, b, 1); return finish(d, 0.45); },
};
/** Speech blips: a short voiced syllable on a random vowel, in three voice bands (variations pick vowels). */
export function voiceBlip(r, band) {
  const f = { low: 105, mid: 165, high: 235 }[band], vowels = ['a', 'e', 'i', 'o', 'u'], v = vowels[Math.floor(r() * vowels.length)];
  const len = 0.11 + r() * 0.04, src = osc(samples(len), (t) => f * (1 + 0.06 * Math.sin(t * 40) - 0.08 * t / len), 'saw');
  mix(src, white(src.length, r), 0.04);
  const d = formant(src, v, band === 'low' ? 0.85 : band === 'high' ? 1.15 : 1, 6);
  shape(d, (t) => ahr(t, 0.012, len - 0.04, 0.025));
  return finish(d, 0.4);
}
void hp1; void loopify;
