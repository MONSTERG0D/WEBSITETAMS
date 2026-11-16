/**
 * Synthesized weather sounds (GAME_BIBLE §8: every sound is synthesized). Registered only if no other system
 * has registered the same names, so Part 11's ambience can replace them without touching Weather.
 *   rain_loop      seamless 4 s loop of hiss and droplets
 *   thunder        distant rolling rumble
 *   thunder_close  sharp crack followed by a heavy rumble
 */
export function registerWeatherSounds(audio) {
  if (!audio?.register) return;
  if (!audio.has('rain_loop')) audio.register('rain_loop', rainLoop, { bus: 'ambience', loop: true, spatial: false, volume: 0.55 });
  if (!audio.has('thunder')) audio.register('thunder', (ctx) => thunder(ctx, false), { bus: 'ambience', spatial: false, volume: 0.9 });
  if (!audio.has('thunder_close')) audio.register('thunder_close', (ctx) => thunder(ctx, true), { bus: 'ambience', spatial: false, volume: 1 });
}

function rainLoop(ctx) {
  const sr = ctx.sampleRate, loop = 4, fade = 0.5, len = Math.floor(sr * (loop + fade)), out = Math.floor(sr * loop);
  const buf = ctx.createBuffer(2, out, sr);
  for (let ch = 0; ch < 2; ch++) {
    const raw = new Float32Array(len);
    let lp = 0, lp2 = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; // pinkish
      const pink = (b0 + b1 + b2 + w * 0.1848) * 0.11;
      lp += (pink - lp) * 0.35; lp2 += (w - lp2) * 0.05;
      raw[i] = lp * 0.75 + (w - lp2) * 0.06;
    }
    // droplets: short damped ticks of varying pitch
    const drops = Math.floor(loop * 55);
    for (let k = 0; k < drops; k++) {
      const at = Math.floor(Math.random() * (len - sr * 0.05)), f = 1800 + Math.random() * 4200, amp = 0.05 + Math.random() * 0.12, dec = 0.004 + Math.random() * 0.01;
      for (let j = 0; j < sr * 0.04; j++) { const t = j / sr; raw[at + j] += Math.sin(t * f * 6.283) * Math.exp(-t / dec) * amp; }
    }
    const d = buf.getChannelData(ch), nf = Math.floor(sr * fade);
    for (let i = 0; i < out; i++) d[i] = raw[i];
    for (let i = 0; i < nf; i++) { const a = i / nf; d[i] = raw[i] * a + raw[out + i] * (1 - a); } // seamless crossfade
  }
  return buf;
}

function thunder(ctx, close) {
  const sr = ctx.sampleRate, dur = close ? 6.5 : 7.5, len = Math.floor(sr * dur), buf = ctx.createBuffer(2, len, sr);
  // a few rolling swells, shared by both channels with small offsets
  const swells = [];
  const n = close ? 5 : 4;
  for (let k = 0; k < n; k++) swells.push({ t: (close ? 0.15 : 0.4) + k * (0.5 + Math.random() * 0.9), a: (k === 0 ? 1 : 0.4 + Math.random() * 0.6), w: 0.5 + Math.random() * 1.1 });
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let brown = 0, lp = 0, lp2 = 0, hp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr, w = Math.random() * 2 - 1;
      brown = (brown + w * 0.02) * 0.998;
      lp += (brown - lp) * (close ? 0.08 : 0.04); lp2 += (lp - lp2) * 0.15;
      let env = 0;
      for (const s of swells) { const x = (t - s.t - ch * 0.02) / s.w; if (x > -0.25) env += s.a * (x < 0 ? (1 + x * 4) : Math.exp(-x * 1.6)); }
      env *= Math.min(1, t / 0.08) * (1 - Math.pow(t / dur, 3));
      let v = lp2 * 9 * env;
      if (close && t < 0.35) { hp = w - hp * 0.2; v += (w - hp * 0.5) * Math.exp(-t / 0.05) * 0.9 + Math.sin(t * 90 * 6.283) * Math.exp(-t / 0.12) * 0.3; }
      d[i] = Math.tanh(v * 1.4) * 0.8;
    }
  }
  return buf;
}
