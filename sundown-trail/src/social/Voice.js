/**
 * Voices (Part 8): every character murmurs in their own voice when they speak, a Simlish-like patter of blips whose
 * rhythm follows the syllables of the line (vowel groups) with pauses at commas and full stops, a rising or falling
 * contour for questions and statements, and a pitch and timbre picked from the speaker's seed (men low or mid,
 * women mid or high, Eli low and slow, drunks slurred). Plays through audio.play('voice_blip_low|mid|high');
 * if no sound is registered under those names (Part 11 adds real ones), a small built-in synth registers them.
 */
export const TUNING = { syllable: 0.105, comma: 0.18, stop: 0.3, volume: 0.55, maxSyllables: 40, jitter: 0.08 };

const BANDS = { low: 105, mid: 165, high: 235 }; // Hz of the fallback blips

/** Splits a line into syllable-ish units: { stress, pause } (pause in seconds before the next one). */
export function syllables(text) {
  const out = [];
  for (const word of String(text).split(/\s+/)) {
    const groups = word.toLowerCase().match(/[aeiouy]+/g) || (word.match(/[a-z0-9]/i) ? ['x'] : []);
    groups.forEach((_, i) => out.push({ stress: i === 0 ? 1 : 0.6, pause: 0 }));
    if (!out.length) continue;
    const last = out[out.length - 1];
    if (/[.!?…]$/.test(word)) last.pause = TUNING.stop; else if (/[,;:—–-]$/.test(word)) last.pause = TUNING.comma;
  }
  return out.slice(0, TUNING.maxSyllables);
}

/** A stable voice for a seed: { band, pitch, rate, slur }. */
export function voiceFor(seed, { female = false, eli = false, drunk = false } = {}) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const r = ((h >>> 0) % 1000) / 1000;
  const band = eli ? 'low' : female ? (r < 0.6 ? 'high' : 'mid') : r < 0.55 ? 'low' : 'mid';
  return { band, pitch: eli ? 0.92 : 0.88 + r * 0.26, rate: eli ? 0.9 : drunk ? 0.78 : 0.92 + ((r * 7) % 1) * 0.18, slur: drunk ? 1 : 0 };
}

export class Voice {
  constructor(game) {
    this.game = game; this.active = new Map(); // speaker → timer id
    this._fallback();
  }
  /** Registers a soft vowel-like blip per band unless real voice sounds exist. */
  _fallback() {
    const audio = this.game.audio;
    if (!audio?.register) return;
    for (const [band, f0] of Object.entries(BANDS)) {
      const name = `voice_blip_${band}`;
      if (audio.has(name)) continue;
      audio.register(name, (ctx) => {
        const sr = ctx.sampleRate, n = Math.floor(sr * 0.14), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) {
          const t = i / sr, env = Math.min(1, t / 0.012) * Math.exp(-t * 18);
          // a voiced buzz through two formants: reads as a muffled syllable rather than a beep
          const ph = 2 * Math.PI * f0 * t * (1 + 0.04 * Math.sin(t * 40));
          d[i] = env * (0.55 * Math.sin(ph) + 0.25 * Math.sin(2 * ph + 0.3) + 0.12 * Math.sin(3 * ph) + 0.08 * Math.sin(5.2 * ph)) * 0.6;
        }
        return buf;
      }, { bus: 'sfx', volume: 0.6, spatial: true });
    }
  }

  /**
   * Murmurs `text` for `speaker` ({ id, position, voice } — NPCs and the player both work). Stops any line already
   * playing for that speaker. @returns seconds the line takes
   */
  speak(speaker, text, opts = {}) {
    const g = this.game, key = speaker?.id || speaker || 'eli';
    this.stop(key);
    const v = opts.voice || speaker?.voice || voiceFor(key);
    const syl = syllables(text), question = /\?\s*$/.test(text);
    let t = 0;
    const plan = syl.map((s, i) => {
      const k = i / Math.max(1, syl.length - 1);
      const contour = question ? 0.95 + k * 0.18 : 1.06 - k * 0.12; // questions rise, statements fall
      const at = t;
      t += (TUNING.syllable / v.rate) * (0.8 + Math.random() * 0.4) * (v.slur ? 1.25 : 1) + s.pause;
      return { at, pitch: v.pitch * contour * (1 + (Math.random() - 0.5) * TUNING.jitter * (1 + v.slur * 2)) * (s.stress > 0.8 ? 1.04 : 1), vol: TUNING.volume * (0.75 + 0.25 * s.stress) * (opts.volume ?? 1) };
    });
    const pos = () => (speaker?.position ? { x: speaker.position.x, y: speaker.position.y + 1.6, z: speaker.position.z } : null);
    const start = performance.now();
    let i = 0;
    const step = () => {
      const now = (performance.now() - start) / 1000;
      while (i < plan.length && plan[i].at <= now) { const p = plan[i++]; g.audio.play(`voice_blip_${v.band}`, { pitch: p.pitch, volume: p.vol, position: pos() }); }
      if (i < plan.length) this.active.set(key, setTimeout(step, 30)); else this.active.delete(key);
    };
    step();
    return t;
  }
  stop(key) { const id = this.active.get(key?.id || key); if (id) { clearTimeout(id); this.active.delete(key?.id || key); } }
  stopAll() { for (const id of this.active.values()) clearTimeout(id); this.active.clear(); }
}
