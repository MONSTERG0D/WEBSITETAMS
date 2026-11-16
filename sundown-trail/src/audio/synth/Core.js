/**
 * The synthesis toolkit (Part 11, GAME_BIBLE §8 "all sound is synthesized"): sample buffers rendered in plain
 * JavaScript, so they can be made during loading without an AudioContext and in Node tests. Noise (white, pink,
 * brown), envelopes, RBJ biquad filters (fixed or swept), one-pole filters, oscillators and FM, Karplus-Strong
 * plucks, vowel formant banks, crackle, soft clipping, simple feedback-delay tails, click-free edge fades,
 * seamless loops (crossfaded tails), and conversion to AudioBuffers.
 */
export const TUNING = { sampleRate: 44100, edgeFadeMs: 3, normalizePeak: 0.89 };
export const SR = TUNING.sampleRate;

/** Seeded random in [0, 1). */
export function rng(seed = 1) {
  let s = (typeof seed === 'string' ? [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) : seed) >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const samples = (sec) => Math.max(1, Math.round(sec * SR));
export const buf = (sec) => new Float32Array(samples(sec));

// ---------------------------------------------------------------- noise
export function white(n, r = Math.random) { const d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = r() * 2 - 1; return d; }
/** Pink noise (Paul Kellet's filter): softer, fuller, like wind and surf. */
export function pink(n, r = Math.random) {
  const d = new Float32Array(n); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
  }
  return d;
}
/** Brown noise: a random walk, deep rumble (thunder, rivers, distant crowds). */
export function brown(n, r = Math.random) { const d = new Float32Array(n); let v = 0; for (let i = 0; i < n; i++) { v = (v + (r() * 2 - 1) * 0.02) * 0.998; d[i] = v * 3.5; } return d; }
/** Sparse random clicks with a decaying tail: fire crackle, rain ticks, sizzle. */
export function crackle(n, perSecond, r = Math.random, decayMs = 2, amp = [0.2, 1]) {
  const d = new Float32Array(n), p = perSecond / SR, k = Math.exp(-1 / (decayMs * 0.001 * SR));
  let v = 0;
  for (let i = 0; i < n; i++) { if (r() < p) v += (amp[0] + r() * (amp[1] - amp[0])) * (r() < 0.5 ? -1 : 1); d[i] = v * (r() * 2 - 1); v *= k; }
  return d;
}

// ---------------------------------------------------------------- envelopes and shaping
/** Multiplies by f(t seconds). */
export function shape(d, f, offset = 0) {
  // evaluated every 8 samples and interpolated (envelopes are smooth; this keeps rendering cheap)
  let a = f((0 - offset) / SR);
  for (let i = 0; i < d.length; i += 8) {
    const b = f((i + 8 - offset) / SR), n = Math.min(8, d.length - i);
    for (let k = 0; k < n; k++) d[i + k] *= a + (b - a) * (k / 8);
    a = b;
  }
  return d;
}
/** Attack-then-exponential-decay envelope value at t. */
export const ad = (t, attack, decay) => (t < 0 ? 0 : t < attack ? t / attack : Math.exp(-(t - attack) / decay));
/** Linear attack/hold/release envelope. */
export const ahr = (t, a, h, r) => (t < 0 ? 0 : t < a ? t / a : t < a + h ? 1 : t < a + h + r ? 1 - (t - a - h) / r : 0);
export function gain(d, g) { for (let i = 0; i < d.length; i++) d[i] *= g; return d; }
export function softClip(d, drive = 1) { const n = Math.tanh(drive); for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * drive) / n; return d; }
/** Adds src into dst at a sample offset with a gain. */
export function mix(dst, src, g = 1, offset = 0) { const n = Math.min(src.length, dst.length - offset); for (let i = Math.max(0, -offset); i < n; i++) dst[i + offset] += src[i] * g; return dst; }
export function peak(d) { let m = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > m) m = a; } return m; }
export function normalize(d, to = TUNING.normalizePeak) { const p = peak(d); if (p > 1e-6) gain(d, to / p); return d; }
/** Short fades at both ends so nothing clicks. */
export function fadeEdges(d, inMs = TUNING.edgeFadeMs, outMs = TUNING.edgeFadeMs * 3) {
  const a = Math.min(d.length >> 1, Math.round(inMs * 0.001 * SR)), b = Math.min(d.length >> 1, Math.round(outMs * 0.001 * SR));
  for (let i = 0; i < a; i++) d[i] *= i / a;
  for (let i = 0; i < b; i++) d[d.length - 1 - i] *= i / b;
  return d;
}
/** Removes DC offset (a one-pole high-pass at ~10 Hz). */
export function dcBlock(d) { let x1 = 0, y1 = 0; const R = 0.9986; for (let i = 0; i < d.length; i++) { const x = d[i], y = x - x1 + R * y1; x1 = x; y1 = y; d[i] = y; } return d; }

// ---------------------------------------------------------------- filters
/** One-pole low-pass (cutoff Hz, constant or a function of t). */
export function lp1(d, cutoff) {
  let y = 0, a = 0;
  const fixed = typeof cutoff === 'number';
  if (fixed) a = 1 - Math.exp(-2 * Math.PI * cutoff / SR);
  for (let i = 0; i < d.length; i++) { if (!fixed && (i & 31) === 0) a = 1 - Math.exp(-2 * Math.PI * cutoff(i / SR) / SR); y += a * (d[i] - y); d[i] = y; }
  return d;
}
export function hp1(d, cutoff) { const lo = lp1(Float32Array.from(d), cutoff); for (let i = 0; i < d.length; i++) d[i] -= lo[i]; return d; }

/**
 * RBJ biquad. type: 'lowpass' | 'highpass' | 'bandpass' | 'peak' | 'notch'. freq may be a function of t (seconds),
 * recomputed every 32 samples, for sweeps.
 */
export function biquad(d, type, freq, q = 0.707, dbGain = 0) {
  let b0, b1, b2, a1, a2, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const set = (f) => {
    const w = 2 * Math.PI * Math.min(f, SR * 0.45) / SR, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q), A = Math.pow(10, dbGain / 40);
    let B0, B1, B2, A0, A1, A2;
    switch (type) {
      case 'highpass': B0 = (1 + cw) / 2; B1 = -(1 + cw); B2 = (1 + cw) / 2; A0 = 1 + al; A1 = -2 * cw; A2 = 1 - al; break;
      case 'bandpass': B0 = al; B1 = 0; B2 = -al; A0 = 1 + al; A1 = -2 * cw; A2 = 1 - al; break;
      case 'notch': B0 = 1; B1 = -2 * cw; B2 = 1; A0 = 1 + al; A1 = -2 * cw; A2 = 1 - al; break;
      case 'peak': B0 = 1 + al * A; B1 = -2 * cw; B2 = 1 - al * A; A0 = 1 + al / A; A1 = -2 * cw; A2 = 1 - al / A; break;
      default: B0 = (1 - cw) / 2; B1 = 1 - cw; B2 = (1 - cw) / 2; A0 = 1 + al; A1 = -2 * cw; A2 = 1 - al;
    }
    b0 = B0 / A0; b1 = B1 / A0; b2 = B2 / A0; a1 = A1 / A0; a2 = A2 / A0;
  };
  const sweep = typeof freq === 'function';
  if (!sweep) set(freq);
  for (let i = 0; i < d.length; i++) {
    if (sweep && (i & 31) === 0) set(freq(i / SR));
    const x = d[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; d[i] = y;
  }
  return d;
}
/** Vowel formants [F1, F2, F3] with gains, for animal and horse voices. */
export const VOWELS = { a: [[800, 1], [1150, 0.5], [2900, 0.25]], e: [[400, 1], [1600, 0.4], [2700, 0.2]], i: [[300, 1], [2300, 0.4], [3000, 0.25]], o: [[450, 1], [800, 0.6], [2830, 0.15]], u: [[325, 1], [700, 0.5], [2530, 0.1]], hh: [[600, 1], [1400, 0.6], [2500, 0.4]] };
/** Formant filter bank: the source through parallel band-passes (shift scales every formant). */
export function formant(src, vowel = 'a', shift = 1, q = 9) {
  const out = new Float32Array(src.length);
  for (const [f, g] of VOWELS[vowel] || VOWELS.a) mix(out, biquad(Float32Array.from(src), 'bandpass', typeof shift === 'function' ? (t) => f * shift(t) : f * shift, q), g * 2.5);
  return out;
}

// ---------------------------------------------------------------- oscillators
const TABLE = 4096, SINE = new Float32Array(TABLE + 1);
for (let i = 0; i <= TABLE; i++) SINE[i] = Math.sin((i / TABLE) * Math.PI * 2);
/** Table sine of a phase in cycles (fast, ~1e-6 error with interpolation). */
export function sin1(ph) { ph -= Math.floor(ph); const x = ph * TABLE, i = x | 0, f = x - i; return SINE[i] + (SINE[i + 1] - SINE[i]) * f; }
/** Oscillator with frequency f(t) (Hz, constant or function), wave 'sine'|'saw'|'square'|'tri'|'pulse'. */
export function osc(n, f, wave = 'sine', phase0 = 0, pw = 0.5) {
  const d = new Float32Array(n), fn = typeof f === 'function';
  let ph = phase0;
  for (let i = 0; i < n; i++) {
    const hz = fn ? f(i / SR) : f;
    ph += hz / SR; ph -= Math.floor(ph);
    d[i] = wave === 'saw' ? 2 * ph - 1 : wave === 'square' ? (ph < 0.5 ? 1 : -1) : wave === 'pulse' ? (ph < pw ? 1 : -1) : wave === 'tri' ? 1 - 4 * Math.abs(ph - 0.5) : sin1(ph);
  }
  return d;
}
/** Two-operator FM: carrier f(t), modulator ratio and index(t). Bells, metallic hits, bird chirps. */
export function fm(n, f, ratio, index) {
  const d = new Float32Array(n), ff = typeof f === 'function', fi = typeof index === 'function';
  let pc = 0, pm = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, hz = ff ? f(t) : f, I = fi ? index(t) : index;
    pm += hz * ratio / SR; pc += hz / SR;
    pc -= Math.floor(pc); pm -= Math.floor(pm);
    d[i] = sin1(pc + I * sin1(pm) / (2 * Math.PI));
  }
  return d;
}
/** Karplus-Strong plucked string (wire, rope twang, coins ring when bright). */
export function pluck(n, f, damping = 0.996, bright = 0.5, r = Math.random) {
  const d = new Float32Array(n), L = Math.max(2, Math.round(SR / f)), line = new Float32Array(L);
  for (let i = 0; i < L; i++) line[i] = r() * 2 - 1;
  let idx = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const cur = line[idx], nxt = (cur * bright + prev * (1 - bright));
    prev = cur; line[idx] = nxt * damping; d[i] = cur; idx = (idx + 1) % L;
  }
  return d;
}

// ---------------------------------------------------------------- space
/** A small Schroeder-style tail (comb + all-pass) baked into a sound (gun tails, wooden rooms). */
export function tail(d, seconds = 0.6, mixAmt = 0.3, damp = 0.4, sizes = [1557, 1617, 1491, 1422]) {
  const fb = Math.pow(0.001, (sizes[0] / SR) / seconds), out = new Float32Array(d.length);
  for (const L of sizes) {
    const line = new Float32Array(L); let idx = 0, lo = 0;
    for (let i = 0; i < d.length; i++) { const y = line[idx]; lo = y * (1 - damp) + lo * damp; line[idx] = d[i] + lo * fb; out[i] += y; idx = (idx + 1) % L; }
  }
  for (const L of [225, 556]) { const line = new Float32Array(L); let idx = 0; for (let i = 0; i < out.length; i++) { const b = line[idx], x = out[i]; const y = -x + b; line[idx] = x + b * 0.5; out[i] = y; idx = (idx + 1) % L; } }
  for (let i = 0; i < d.length; i++) d[i] = d[i] * (1 - mixAmt) + out[i] * mixAmt * 0.25;
  return d;
}

// ---------------------------------------------------------------- loops and buffers
/** Makes a seamless loop: crossfades the last `xfade` seconds into the start and trims them off. */
export function loopify(d, xfade = 0.5) {
  const X = Math.min(samples(xfade), d.length >> 2), n = d.length - X, out = d.slice(0, n);
  for (let i = 0; i < X; i++) { const t = i / X, a = Math.sqrt(1 - t), b = Math.sqrt(t); out[i] = d[n + i] * a + d[i] * b; }
  return out;
}
/** Two decorrelated channels from one generator (for stereo beds). */
export function stereo(gen) { return [gen(0), gen(1)]; }
/** A cheap stereo bed from one seamless loop: the right channel is the loop rotated by half its length. */
export function wide(d) { const n = d.length, h = n >> 1, o = new Float32Array(n); o.set(d.subarray(h)); o.set(d.subarray(0, h), n - h); return [d, o]; }

/** Converts channel data to an AudioBuffer (without an AudioContext when the browser allows). */
export function toBuffer(channels, ctx = null) {
  const ch = Array.isArray(channels) ? channels : [channels];
  for (const c of ch) for (let i = 0; i < c.length; i++) if (!Number.isFinite(c[i])) c[i] = 0;
  if (typeof AudioBuffer === 'undefined') return { numberOfChannels: ch.length, length: ch[0].length, sampleRate: SR, duration: ch[0].length / SR, getChannelData: (k) => ch[k] };
  const b = ctx ? ctx.createBuffer(ch.length, ch[0].length, SR) : new AudioBuffer({ numberOfChannels: ch.length, length: ch[0].length, sampleRate: SR });
  ch.forEach((c, k) => b.copyToChannel ? b.copyToChannel(c, k) : b.getChannelData(k).set(c));
  return b;
}
/** Finishes a one-shot: DC block, normalize, edge fades (loops pass fadeIn 0 / fadeOut 0 and keep their seam). */
export function finish(d, level = 1, opts = {}) { const loop = opts.fadeIn === 0 && opts.fadeOut === 0; if (opts.dc !== false && !loop) dcBlock(d); /* a filter would break a loop seam */ normalize(d, TUNING.normalizePeak * level); return fadeEdges(d, opts.fadeIn ?? TUNING.edgeFadeMs, opts.fadeOut ?? TUNING.edgeFadeMs * 3); }
