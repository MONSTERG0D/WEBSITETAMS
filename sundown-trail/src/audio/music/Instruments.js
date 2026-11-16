import { SR, samples, white, pink, shape, ad, ahr, mix, biquad, lp1, hp1, osc, pluck, formant, finish, rng, softClip } from '../synth/Core.js';

/**
 * The band (Part 12, GAME_BIBLE §8 instruments), built as a small sampler: each pitched instrument is rendered at
 * notes a fourth apart during loading and pitch-shifted (±2.5 semitones at most) for the rest, so playing costs
 * one buffer source per note. Plucked and struck instruments ring out; bowed, blown and pad instruments carry a
 * seamless sustain loop so a note can last as long as the score asks.
 *  guitar  steel strings, Karplus-Strong through a wooden body     banjo   bright pluck with a drum-head ring
 *  bass    upright, round and woody                                  piano   honky-tonk: detuned string pairs, hammer
 *  fiddle  bowed saw through a violin body, delayed vibrato          harmonica reedy pulse, breath, vibrato
 *  whistle breathy sine                                              strings tremolo section, three detuned saws
 *  pad     slow, dark, wide                                          drums   low drum, frame drum, rim click, shaker
 *  hum     (Part 13) a closed-mouth hum for the campfire
 */
export const TUNING = { spacing: 5, release: { pluck: 0.25, sustain: 0.18, pad: 0.9 } };

export const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Sustain loop: blend the tail into the samples before loopStart so loopEnd→loopStart is seamless. */
function sustainLoop(d, loopStartSec, xfadeSec = 0.25) {
  const a = samples(loopStartSec), X = Math.min(samples(xfadeSec), a, (d.length - a) >> 1), n = d.length;
  for (let i = 0; i < X; i++) { const t = i / X; d[n - X + i] = d[n - X + i] * Math.cos(t * Math.PI / 2) + d[a - X + i] * Math.sin(t * Math.PI / 2); }
  return { data: d, loopStart: loopStartSec, loopEnd: n / SR };
}

const RENDER = {
  guitar: (m, r) => {
    const f = hz(m), d = pluck(samples(2.4), f, 0.9965 - (m - 40) * 0.00004, 0.55, r);
    biquad(d, 'peak', 105, 1, 7); biquad(d, 'peak', 230, 1.2, 4); biquad(d, 'peak', 2600, 1.5, 3); lp1(d, 6500);
    shape(d, (t) => Math.min(1, t / 0.002));
    return { data: finish(d, 0.8, { fadeOut: 300 }) };
  },
  banjo: (m, r) => {
    const f = hz(m), d = pluck(samples(1.3), f, 0.99, 0.88, r);
    biquad(d, 'peak', 650, 2, 9); biquad(d, 'peak', 2400, 2, 5); hp1(d, 180);
    shape(d, (t) => Math.exp(-t / 0.45));
    return { data: finish(d, 0.75, { fadeOut: 200 }) };
  },
  bass: (m, r) => {
    const f = hz(m), n = samples(2.2), d = pluck(n, f, 0.998, 0.25, r); gain(d, 0.6);
    const s = osc(n, f); shape(s, (t) => ad(t, 0.008, 0.8)); mix(d, s, 0.7);
    lp1(d, 1100); biquad(d, 'peak', 90, 1, 3);
    return { data: finish(d, 0.85, { fadeOut: 250 }) };
  },
  piano: (m, r) => {
    const f = hz(m), n = samples(2.4), d = new Float32Array(n);
    for (let k = 1; k <= 7; k++) {
      const amp = 1 / Math.pow(k, 1.25), tau = 1.8 / Math.pow(k, 0.65) * (1 - (m - 36) * 0.006);
      for (const det of [-1, 1]) { const p = osc(n, f * k * (1 + det * 0.0045) * (1 + k * k * 0.0002)); shape(p, (t) => ad(t, 0.002, tau)); mix(d, p, amp * 0.5); }
    }
    const h = white(samples(0.03), r); lp1(h, 2500); shape(h, (t) => ad(t, 0.0005, 0.008)); mix(d, h, 0.4);
    return { data: finish(d, 0.75, { fadeOut: 250 }) };
  },
  fiddle: (m, r) => {
    const f = hz(m), n = samples(2.6), vib = (t) => 1 + 0.006 * Math.min(1, Math.max(0, (t - 0.25) / 0.3)) * Math.sin(t * 2 * Math.PI * 5.6);
    const src = osc(n, (t) => f * vib(t), 'saw'); mix(src, white(n, r), 0.04);
    let d = formant(src, 'a', 1.15, 3); mix(d, src, 0.25);
    biquad(d, 'peak', 280, 1.5, 6); lp1(d, 7000);
    shape(d, (t) => Math.min(1, t / 0.07));
    return { ...sustainLoop(finish(d, 0.6, { fadeOut: 0 }), 0.7) };
  },
  harmonica: (m, r) => {
    const f = hz(m), n = samples(2.6), vib = (t) => 1 + 0.008 * Math.min(1, Math.max(0, (t - 0.2) / 0.3)) * Math.sin(t * 2 * Math.PI * 5);
    const src = osc(n, (t) => f * vib(t), 'pulse', 0, 0.32); mix(src, osc(n, (t) => f * vib(t), 'saw'), 0.4); mix(src, white(n, r), 0.12);
    const d = formant(src, 'o', 1.9, 3); mix(d, src, 0.15); lp1(d, 5500);
    shape(d, (t) => Math.min(1, t / 0.04));
    return { ...sustainLoop(finish(d, 0.55, { fadeOut: 0 }), 0.7) };
  },
  whistle: (m, r) => {
    const f = hz(m), n = samples(2.6), vib = (t) => 1 + 0.01 * Math.sin(t * 2 * Math.PI * 5.3);
    const d = osc(n, (t) => f * vib(t)); mix(d, osc(n, (t) => 2 * f * vib(t)), 0.06);
    const b = white(n, r); biquad(b, 'bandpass', f, 14); mix(d, b, 0.35);
    shape(d, (t) => Math.min(1, t / 0.06));
    return { ...sustainLoop(finish(d, 0.5, { fadeOut: 0 }), 0.7) };
  },
  strings: (m, r) => {
    const f = hz(m), n = samples(2.6), d = new Float32Array(n);
    for (const c of [-0.006, 0, 0.007]) mix(d, osc(n, f * (1 + c), 'saw', r()), 0.35);
    lp1(d, 2400); biquad(d, 'peak', 600, 1, 3);
    shape(d, (t) => Math.min(1, t / 0.12) * (0.55 + 0.45 * Math.abs(Math.sin(t * Math.PI * 11.5))));
    return { ...sustainLoop(finish(d, 0.5, { fadeOut: 0 }), 0.72, 0.05) };
  },
  hum: (m, r) => { // Added in Part 13: a voice humming with closed lips, for the campfire
    const f = hz(m), n = samples(2.6), vib = (t) => 1 + 0.007 * Math.min(1, Math.max(0, (t - 0.3) / 0.4)) * Math.sin(t * 2 * Math.PI * 4.8);
    const src = osc(n, (t) => f * vib(t), 'saw'); mix(src, osc(n, (t) => f * vib(t)), 1.2); mix(src, white(n, r), 0.02);
    const d = formant(src, 'u', 0.9, 4); lp1(d, 1100); lp1(d, 1800); biquad(d, 'peak', 250, 1, 4);
    shape(d, (t) => Math.min(1, t / 0.12));
    return { ...sustainLoop(finish(d, 0.5, { fadeOut: 0 }), 0.8) };
  },
  pad: (m, r) => {
    const f = hz(m), n = samples(3.2), d = new Float32Array(n);
    for (const c of [-0.008, -0.002, 0.004, 0.009]) mix(d, osc(n, f * (1 + c), 'saw', r()), 0.25);
    mix(d, osc(n, f / 2), 0.3); lp1(d, 900); lp1(d, 1400);
    shape(d, (t) => Math.min(1, t / 0.6));
    return { ...sustainLoop(finish(d, 0.45, { fadeOut: 0 }), 1.2, 0.5) };
  },
};
function gain(d, g) { for (let i = 0; i < d.length; i++) d[i] *= g; return d; }

/** Unpitched percussion. */
const DRUMS = {
  low_drum: (r) => { const n = samples(0.9), d = osc(n, (t) => 48 + 38 * Math.exp(-t / 0.04)); shape(d, (t) => ad(t, 0.002, 0.28)); const s = white(n, r); lp1(s, 400); shape(s, (t) => ad(t, 0.001, 0.03)); mix(d, s, 0.5); return finish(softClip(d, 1.5), 0.9); },
  frame_drum: (r) => { const n = samples(0.6), d = osc(n, (t) => 110 + 60 * Math.exp(-t / 0.02)); shape(d, (t) => ad(t, 0.001, 0.16)); const s = white(n, r); biquad(s, 'bandpass', 950, 1.2); shape(s, (t) => ad(t, 0.001, 0.05)); mix(d, s, 0.7); return finish(d, 0.75); },
  rim: (r) => { const n = samples(0.15), d = osc(n, 820, 'tri'); shape(d, (t) => ad(t, 0.0005, 0.03)); const s = white(n, r); biquad(s, 'bandpass', 2400, 2); shape(s, (t) => ad(t, 0.0003, 0.008)); mix(d, s, 0.8); return finish(d, 0.6); },
  shaker: (r) => { const n = samples(0.12), d = white(n, r); hp1(d, 5000); shape(d, (t) => ahr(t, 0.015, 0.02, 0.05)); return finish(d, 0.35); },
};

/** Ranges (MIDI) and articulation of each pitched instrument. */
export const INSTRUMENTS = {
  guitar: { range: [40, 81], kind: 'pluck' }, banjo: { range: [55, 86], kind: 'pluck' }, bass: { range: [28, 57], kind: 'pluck' },
  piano: { range: [36, 91], kind: 'pluck' }, fiddle: { range: [55, 91], kind: 'sustain' }, harmonica: { range: [55, 86], kind: 'sustain' },
  whistle: { range: [67, 96], kind: 'sustain' }, hum: { range: [45, 74], kind: 'sustain' }, strings: { range: [36, 81], kind: 'sustain' }, pad: { range: [36, 74], kind: 'pad' },
};
export const DRUM_NAMES = Object.keys(DRUMS);

/**
 * The list of rendering jobs: one per sample. Each job returns { inst, midi?, data, loopStart?, loopEnd? }.
 * Spread them over frames (the Music system does) and pass the results to Bank.add().
 */
export function renderJobs() {
  const jobs = [];
  for (const [inst, def] of Object.entries(INSTRUMENTS)) for (let m = def.range[0] + 2; m <= def.range[1] + 2; m += TUNING.spacing) jobs.push(() => ({ inst, midi: m, ...RENDER[inst](m, rng(`${inst}${m}`)) }));
  for (const [name, fn] of Object.entries(DRUMS)) jobs.push(() => ({ inst: name, data: fn(rng(name)) }));
  return jobs;
}

/** The loaded samples, and the lookup for a note: nearest sample and playback rate. */
export class Bank {
  constructor() { this.samples = {}; this.count = 0; }
  add(job, toBuffer) {
    const buf = toBuffer(job.data);
    (this.samples[job.inst] ||= []).push({ midi: job.midi ?? 60, buffer: buf, loopStart: job.loopStart, loopEnd: job.loopEnd });
    this.samples[job.inst].sort((a, b) => a.midi - b.midi);
    this.count++;
  }
  has(inst) { return !!this.samples[inst]?.length; }
  /** @returns {{ sample, rate }|null} */
  pick(inst, midi = 60) {
    const list = this.samples[inst]; if (!list?.length) return null;
    let best = list[0];
    for (const s of list) if (Math.abs(s.midi - midi) < Math.abs(best.midi - midi)) best = s;
    return { sample: best, rate: Math.pow(2, (midi - best.midi) / 12) };
  }
}
