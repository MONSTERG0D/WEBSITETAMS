import * as THREE from 'three';
import System from '../core/System.js';
import { rng, toBuffer } from './synth/Core.js';
import { renderJobs, Bank } from './music/Instruments.js';
import { Composer } from './music/Composer.js';
import { Sequencer } from './music/Sequencer.js';
import { Director } from './music/Director.js';
import { MOODS } from './music/Moods.js';

/**
 * The 'music' system (Part 12, GAME_BIBLE §8; audio.setMusicMood(mood, { intensity }) lands here).
 * An original generative score: the band is rendered into a small sampler during loading, a composer per mood
 * writes bar after bar, and a look-ahead scheduler plays it on the audio clock. Mood changes wait for the bar
 * line: the old mood stops writing and fades under the new one, so two tempos never fight. Exploration and
 * night play in phrases separated by long silences. Stingers (victory, death, honor, mission) sound over a
 * dipped score. The saloon's piano is diegetic: it plays from the piano itself and only inside. The Director
 * picks moods from play; missions can override it.
 */
export const TUNING = {
  lookahead: 0.3, interval: 0.025, fadeIn: 1.2, fadeOut: 2.2, combatFadeIn: 0.12, renderBudgetMs: 6, duck: 0.4, stingerDip: 0.25,
  level: 0.9, intensitySmoothing: 0.5, saloonRef: 3, saloonRolloff: 1.4,
};

export default class Music extends System {
  constructor(game) {
    super(game);
    this.bank = new Bank(); this.jobs = renderJobs(); this.totalJobs = this.jobs.length; this.renderMs = 0;
    this.mood = 'silence'; this.target = 'silence'; this.intensity = 0.5; this.targetIntensity = 0.5;
    this.comp = null; this.bus = null; this.nextBar = 0; this.bars = 0; this.lastBar = null; this.stats = { bars: 0, stingers: 0 };
    this.director = new Director(this); this._seed = 1;
  }

  async init() {
    const step = () => {
      const t0 = performance.now();
      while (this.jobs.length && performance.now() - t0 < TUNING.renderBudgetMs) { const s = performance.now(); try { this.bank.add(this.jobs.shift()(), (d) => toBuffer(d)); } catch (err) { console.error('[music] render failed', err); } this.renderMs += performance.now() - s; }
      if (this.jobs.length) this._renderTimer = setTimeout(step, 16);
    };
    this._renderTimer = setTimeout(step, 400); // after the sound effects have started
    this._timer = setInterval(() => this._schedule(), TUNING.interval * 1000);
    this.game.debug?.addTuning('Music', TUNING);
  }

  get ready() { return this.jobs.length === 0; }

  // ---------------------------------------------------------------- API
  /**
   * Changes mood on the next bar line (GAME_BIBLE §11 audio.setMusicMood lands here). Called from outside (a
   * mission), the mood holds until setMusicMood('auto') hands control back to the director; 'victory' and 'death'
   * play their stingers. @param {string} mood @param {{ intensity?: number }} opts
   */
  setMood(mood, opts = {}) {
    if (mood === 'victory' || mood === 'death') { this.stinger(mood); return; }
    if (opts.from !== 'director') { this.director.override(mood && mood !== 'auto' && MOODS[mood] ? mood : null, opts.intensity ?? null); return; }
    if (!MOODS[mood]) return;
    this.target = mood;
    if (typeof opts.intensity === 'number') this.targetIntensity = opts.intensity;
  }
  setIntensity(v) { this.targetIntensity = Math.max(0, Math.min(1, v)); }
  /** Plays a stinger now, over a dipped score: 'victory' | 'death' | 'honor_up' | 'honor_down' | 'mission'. */
  stinger(name) {
    if (!this._graph()) return;
    const st = (this.comp || new Composer('explore', rng(++this._seed))).stinger(name), ctx = this.game.audio.ctx, now = ctx.currentTime + 0.06;
    const tick = 60 / st.def.bpm / (st.def.meter === '6/8' ? 6 : 4);
    this.seq.schedule(st.events, now, tick, this.stingerBus);
    if (this.bus) { const g = this.bus.gain; g.cancelScheduledValues(now); g.setTargetAtTime(TUNING.stingerDip, now, 0.15); g.setTargetAtTime(1, now + st.seconds, 0.6); }
    this.stats.stingers++; this.lastStinger = name;
  }
  /** Dialogue ducking (60% under speech). */
  duck(on) { const ctx = this.game.audio.ctx; if (!this.master || !ctx) return; this.master.gain.setTargetAtTime(on ? TUNING.level * TUNING.duck : TUNING.level, ctx.currentTime, 0.12); }

  // ---------------------------------------------------------------- per frame: the director
  update(dt) {
    if (this.game.state === 'playing' || this.game.state === 'dead') this.director.update(dt);
    this.intensity += (this.targetIntensity - this.intensity) * Math.min(1, dt / TUNING.intensitySmoothing);
    if (this.saloonPanner && this.mood === 'saloon') this._placePiano();
  }

  // ---------------------------------------------------------------- the scheduler (its own timer, on the audio clock)
  _graph() {
    const A = this.game.audio, ctx = A.ctx;
    if (!ctx) return false;
    if (!this.master) {
      this.master = ctx.createGain(); this.master.gain.value = TUNING.level; this.master.connect(A.buses.music);
      this.stingerBus = ctx.createGain(); this.stingerBus.connect(this.master);
      this.seq = new Sequencer(ctx, this.bank);
    }
    return true;
  }
  _schedule() {
    if (!this.ready || !this._graph()) return;
    const ctx = this.game.audio.ctx; if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (this.nextBar < now) this.nextBar = now + 0.05;
    let guard = 0;
    while (this.nextBar < now + TUNING.lookahead && guard++ < 4) this._bar();
  }
  /** Writes and schedules the next bar; mood changes happen here, on the bar line. */
  _bar() {
    const ctx = this.game.audio.ctx, at = this.nextBar;
    if (this.target !== this.mood || !this.comp) this._switch(at);
    const c = this.comp;
    if (!c || this.mood === 'silence') { this.nextBar = at + 0.5; this.lastBar = null; return; }
    const bar = c.next(this.intensity);
    if (!bar.rest) this.seq.schedule(bar.events, at, c.tick, this.bus, { swing: c.def.swing });
    this.lastBar = bar; this.bars++; this.stats.bars++;
    this.nextBar = at + c.barSeconds;
  }
  _switch(at) {
    const ctx = this.game.audio.ctx, old = this.bus, prev = this.mood;
    if (old) { old.gain.cancelScheduledValues(at); old.gain.setValueAtTime(old.gain.value, at); old.gain.setTargetAtTime(0, at, TUNING.fadeOut / 4); setTimeout(() => { try { old.disconnect(); } catch { /* gone */ } }, (at - ctx.currentTime + TUNING.fadeOut * 2) * 1000); }
    this.mood = this.target;
    const def = MOODS[this.mood];
    this.bus = ctx.createGain(); this.bus.gain.value = 0;
    const fadeIn = this.mood === 'combat' || prev === 'silence' ? TUNING.combatFadeIn : TUNING.fadeIn;
    this.bus.gain.setValueAtTime(0, at); this.bus.gain.setTargetAtTime(1, at, fadeIn / 3);
    if (def?.diegetic) {
      this.saloonPanner ||= Object.assign(ctx.createPanner(), { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: TUNING.saloonRef, rolloffFactor: TUNING.saloonRolloff });
      this._placePiano(); this.bus.connect(this.saloonPanner); this.saloonPanner.connect(this.master);
    } else this.bus.connect(this.master);
    this.comp = this.mood === 'silence' ? null : new Composer(this.mood, rng(++this._seed * 7919 + Math.floor(Math.random() * 1e6)));
    // coming into combat or a ride, skip the long opening silences of gentle moods
    if (this.comp && (prev === 'combat' || prev === 'ride') && def.rest?.[1] > 0) this.comp.restSeconds = 4;
  }
  _placePiano() {
    const p = this.game.get('towns')?.spots?.('copperbell')?.piano || this.game.camera.position, P = this.saloonPanner;
    if (!P || !p) return;
    if (P.positionX) { P.positionX.value = p.x; P.positionY.value = p.y + 1; P.positionZ.value = p.z; } else P.setPosition(p.x, p.y + 1, p.z);
  }

  /**
   * Plays the main motif on an instrument (a test helper; Part 13's campfire hums it).
   * Added in Part 13: opts { mood, transform: 'orig'|'inv'|'aug'|…, octave, vel } — returns its length in seconds.
   */
  playMotif(inst = 'guitar', { mood = 'explore', transform = 'orig', octave = null, vel = 0.7 } = {}) {
    if (!this._graph()) return 0;
    const c = new Composer(mood, rng(3)), notes = c.transform(transform), now = this.game.audio.ctx.currentTime + 0.05, oct = octave ?? (inst === 'whistle' ? 1 : 0);
    let t = 0; const ev = notes.map((n) => { const e = { tick: t, inst, midi: c.T.midi(n.deg, oct), dur: n.dur, vel, part: 'motif' }; t += n.dur; return e; });
    this.seq.schedule(ev, now, c.tick, this.stingerBus);
    return t * c.tick;
  }

  serialize() { return {}; }
  dispose() { clearInterval(this._timer); clearTimeout(this._renderTimer); try { this.master?.disconnect(); } catch { /* gone */ } }
}
void THREE;
