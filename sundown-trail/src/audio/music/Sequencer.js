import { INSTRUMENTS, TUNING as INST } from './Instruments.js';

/**
 * The sequencer (Part 12): turns composed events into scheduled AudioBufferSourceNodes on the AudioContext clock.
 * Notes are humanized (a few milliseconds early or late, strums rolled across the strings, swing on off-beats) and
 * every note gets its own gain envelope so sustained instruments release smoothly and plucked ones are damped at
 * the end of their value. A look-ahead keeps scheduling ahead of the clock so timing never depends on frame rate.
 */
export const TUNING = { jitter: 0.009, drumJitter: 0.004, strumGap: 0.013, pluckRing: 0.45, velCurve: 1.6, level: 0.42, maxActive: 160 };

export class Sequencer {
  /** @param {AudioContext} ctx @param {import('./Instruments.js').Bank} bank */
  constructor(ctx, bank) { this.ctx = ctx; this.bank = bank; this.active = 0; this.scheduled = 0; this.skipped = 0; this.solo = null; this.mute = new Set(); }

  /**
   * Schedules one bar (or a stinger) of events.
   * @param {Array} events composer events (ticks in sixteenths) @param {number} start bar start (ctx time)
   * @param {number} tick seconds per sixteenth @param {AudioNode} out destination @param {{ swing?: number, beat?: number }} feel
   */
  schedule(events, start, tick, out, feel = {}) {
    const groups = new Map();
    for (const e of events) {
      if (this.solo && e.inst !== this.solo) continue;
      if (this.mute.has(e.inst)) continue;
      let t = start + e.tick * tick;
      // swing: off-beat eighths land late
      if (feel.swing && Math.abs((e.tick % 4) - 2) < 1e-6) t += feel.swing * tick * 2;
      const drum = e.midi === null;
      t += (Math.random() * 2 - 1) * (drum ? TUNING.drumJitter : TUNING.jitter);
      if (e.strum) { const key = `${e.tick}|${e.inst}`, k = groups.get(key) || 0; groups.set(key, k + 1); t += k * TUNING.strumGap; }
      this.note(e.inst, e.midi, Math.max(this.ctx.currentTime + 0.005, t), e.dur * tick, e.vel, out);
    }
  }

  /** One note. midi null = an unpitched drum. */
  note(inst, midi, when, dur, vel, out) {
    if (this.active > TUNING.maxActive) { this.skipped++; return; }
    const p = this.bank.pick(inst, midi ?? 60); if (!p) return;
    const ctx = this.ctx, s = p.sample, def = INSTRUMENTS[inst], kind = def?.kind || 'drum';
    const src = ctx.createBufferSource(); src.buffer = s.buffer; src.playbackRate.value = midi === null ? 1 : p.rate;
    const g = ctx.createGain(), level = Math.pow(Math.max(0.02, vel), TUNING.velCurve) * TUNING.level;
    src.connect(g); g.connect(out);
    let end;
    if (kind === 'sustain' || kind === 'pad') {
      if (s.loopStart) { src.loop = true; src.loopStart = s.loopStart; src.loopEnd = s.loopEnd; }
      const rel = INST.release[kind === 'pad' ? 'pad' : 'sustain'];
      g.gain.setValueAtTime(level, when);
      g.gain.setTargetAtTime(0, when + Math.max(0.05, dur), rel / 3);
      end = when + Math.max(0.05, dur) + rel * 2.2;
    } else if (kind === 'pluck') {
      const ring = Math.min(s.buffer.duration / p.rate, dur + TUNING.pluckRing);
      g.gain.setValueAtTime(level, when);
      g.gain.setTargetAtTime(0, when + ring, 0.06);
      end = when + ring + 0.35;
    } else { g.gain.setValueAtTime(level, when); end = when + s.buffer.duration; }
    src.start(when); src.stop(end);
    this.active++; this.scheduled++;
    src.onended = () => { this.active--; try { g.disconnect(); } catch { /* gone */ } };
  }
}
