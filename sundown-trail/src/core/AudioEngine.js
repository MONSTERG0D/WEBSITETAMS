import { EVENTS } from './Events.js';

/**
 * Web Audio engine: buses, 3D panning, reverb presets, ducking. Silent until sounds are registered (Part 11)
 * and music takes over setMusicMood (Part 12). Unknown sound names play nothing and log once.
 */
export const TUNING = { refDistance: 4, maxDistance: 400, rolloff: 1.1, reverbSend: 0.18, duckRelease: 0.6,
  /** Added in Part 11: voice cap, air absorption (cutoff falls with distance), steal fade. */
  maxVoices: 24, airNear: 18000, airFar: 900, airDistance: 140, stealFade: 0.04 };
const BUSES = ['music', 'sfx', 'ambience', 'ui'];
const NULL_HANDLE = Object.freeze({ playing: false, stop() {}, setPosition() {}, setVolume() {} });

class SoundHandle {
  constructor(engine, def, opts) {
    this.e = engine; this.def = def; this.opts = opts; this.stopped = false; this.playing = false; this.source = null;
    const ctx = engine.ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = (opts.volume ?? 1) * def.volume;
    this.out = this.gain;
    if (opts.position && def.spatial) {
      // Added in Part 11: air absorption, a low-pass that darkens distant sounds
      this.air = ctx.createBiquadFilter(); this.air.type = 'lowpass'; this.air.Q.value = 0.5;
      this.gain.connect(this.air);
      const p = ctx.createPanner();
      p.panningModel = engine.hq ? 'HRTF' : 'equalpower'; p.distanceModel = 'inverse';
      p.refDistance = TUNING.refDistance; p.maxDistance = TUNING.maxDistance; p.rolloffFactor = TUNING.rolloff;
      this.panner = p; this.air.connect(p); this.out = p; this.setPosition(opts.position);
    }
    this.out.connect(engine.buses[def.bus] || engine.buses.sfx);
  }
  async start() {
    const def = this.def, B = def.buffers?.filter(Boolean);
    let buffer = B && B.length ? B[(this.opts.variant ?? Math.floor(Math.random() * B.length)) % B.length] : def.buffer;
    if (!buffer) { try { buffer = await this.e._buffer(def); } catch (err) { console.error('[audio] sound generator failed', err); this.e._ended(this); return; } }
    if (this.stopped || !buffer) { this.e._ended(this); return; }
    const src = this.e.ctx.createBufferSource();
    const jitter = def.pitchVar ? 1 + (Math.random() * 2 - 1) * def.pitchVar : 1;
    src.buffer = buffer; src.loop = this.opts.loop ?? def.loop; src.playbackRate.value = (this.opts.pitch ?? 1) * jitter;
    src.connect(this.gain); src.onended = () => { this.playing = false; this._disconnect(); this.e._ended(this); };
    src.start(this.e.ctx.currentTime + Math.max(0, this.opts.delay || 0)); this.source = src; this.playing = true;
  }
  stop(fadeSeconds = 0) {
    this.stopped = true;
    if (!this.source) { this._disconnect(); this.e._ended(this); return; }
    const t = this.e.ctx.currentTime;
    try {
      if (fadeSeconds > 0) { this.gain.gain.setTargetAtTime(0, t, fadeSeconds / 4); this.source.stop(t + fadeSeconds); }
      else this.source.stop();
    } catch { /* already stopped */ }
  }
  setPosition(p) {
    if (!this.panner || !p) return;
    const pn = this.panner;
    if (pn.positionX) { pn.positionX.value = p.x; pn.positionY.value = p.y; pn.positionZ.value = p.z; } else pn.setPosition(p.x, p.y, p.z);
    if (this.air) {
      const L = this.e.game.camera.position, d = Math.hypot(p.x - L.x, p.y - L.y, p.z - L.z), k = Math.min(1, d / TUNING.airDistance);
      this.air.frequency.value = TUNING.airNear * Math.pow(TUNING.airFar / TUNING.airNear, k);
    }
  }
  setVolume(v) { this.gain.gain.value = v * this.def.volume; }
  _disconnect() { try { this.out.disconnect(); if (this.out !== this.gain) this.gain.disconnect(); this.air?.disconnect(); } catch { /* ignore */ } }
}

export class AudioEngine {
  constructor(game) {
    this.game = game; this.ctx = null; this.buses = {}; this.sounds = new Map(); this.warned = new Set();
    this.mood = 'silence'; this.reverbPreset = 'outdoor'; this._irCache = new Map();
    /** Added in Part 11: live voices (for the 24-voice cap) and counters. */
    this.voices = new Set(); this.stats = { voices: 0, dropped: 0, stolen: 0, played: 0 };
    this.hq = !game.isTouch;
    const unlock = () => this.unlock();
    for (const type of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(type, unlock, { passive: true });
    game.events.on(EVENTS.SETTINGS_CHANGED, ({ key }) => { if (key === '*' || key.startsWith('volumes')) this.applyVolumes(); });
  }
  /** Creates or resumes the AudioContext; browsers require a user gesture first. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.master = ctx.createGain(); this.master.connect(ctx.destination);
      for (const b of BUSES) { const g = ctx.createGain(); g.connect(this.master); this.buses[b] = g; }
      this.reverb = ctx.createConvolver(); this.reverb.connect(this.master);
      this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = TUNING.reverbSend; this.reverbSend.connect(this.reverb);
      this.buses.sfx.connect(this.reverbSend);
      this.setReverb(this.reverbPreset); this.applyVolumes();
    }
    if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {});
  }
  suspend() { this.ctx?.suspend().catch(() => {}); }
  resume() { if (this.ctx && !document.hidden) this.ctx.resume().catch(() => {}); }
  applyVolumes() {
    if (!this.ctx) return;
    const v = this.game.settings.get('volumes') || {};
    this.master.gain.value = v.master ?? 1;
    for (const b of BUSES) this.buses[b].gain.value = v[b] ?? 1;
  }
  setBusVolume(bus, value) { this.game.settings.set(`volumes.${bus}`, value); }
  /**
   * Register a synthesized sound. generator(ctx) returns an AudioBuffer (or a Promise of one); it runs once and is cached.
   * opts: { bus: 'sfx'|'music'|'ambience'|'ui', loop, volume, spatial }
   * Added in Part 11: { variants: n (generator(ctx, i) per variation, one picked at random each play), pitchVar
   * (random ± playback-rate spread), priority (0 footsteps … 3 beds; low ones give way at the voice cap) }.
   */
  register(name, generator, opts = {}) {
    this.sounds.set(name, { name, generator, bus: opts.bus || 'sfx', loop: !!opts.loop, volume: opts.volume ?? 1, spatial: opts.spatial ?? true, buffer: null, pending: null,
      variants: opts.variants || 0, buffers: null, pitchVar: opts.pitchVar || 0, priority: opts.priority ?? 1 });
  }
  /**
   * Added in Part 11: renders a sound's buffer now (no AudioContext needed). With `variant` only that variation is
   * rendered, so a loader can spread the work thinly. @returns {boolean} whether anything was rendered
   */
  prerender(name, variant = null) {
    const def = this.sounds.get(name);
    if (!def) return false;
    if (def.variants > 1) {
      def.buffers ||= [];
      let did = false;
      for (let i = variant ?? 0; i < (variant === null ? def.variants : variant + 1); i++) if (!def.buffers[i]) { def.buffers[i] = def.generator(this.ctx, i); did = true; }
      return did;
    }
    if (def.buffer) return false;
    def.buffer = def.generator(this.ctx, 0);
    return true;
  }
  has(name) { return this.sounds.has(name); }
  /** @returns handle { stop(fadeSeconds), setPosition(v3), setVolume(v) } */
  play(name, opts = {}) {
    const def = this.sounds.get(name);
    if (!def) {
      if (!this.warned.has(name)) { this.warned.add(name); console.info(`[audio] "${name}" has no sound yet (Part 11 adds it)`); }
      return NULL_HANDLE;
    }
    if (!this.ctx || this.ctx.state === 'closed') return NULL_HANDLE;
    // Added in Part 11: the voice cap. A new sound steals the quietest-priority voice, or is dropped if it matters less.
    if (this.voices.size >= TUNING.maxVoices) {
      let worst = null;
      for (const v of this.voices) if (!worst || v.def.priority < worst.def.priority || (v.def.priority === worst.def.priority && v.t0 < worst.t0)) worst = v;
      if (worst && worst.def.priority <= def.priority) { worst.stop(TUNING.stealFade); this.voices.delete(worst); this.stats.stolen++; }
      else { this.stats.dropped++; return NULL_HANDLE; }
    }
    const h = new SoundHandle(this, def, opts);
    h.t0 = this.ctx.currentTime; this.voices.add(h); this.stats.played++;
    h.start();
    return h;
  }
  setMusicMood(mood, opts = {}) {
    this.mood = mood;
    const music = this.game.get('music');
    if (music && typeof music.setMood === 'function') music.setMood(mood, opts);
  }
  /** Dip the music bus by `amount` (0..1) for `seconds`, e.g. under dialogue. */
  duck(amount = 0.6, seconds = 2) {
    if (!this.ctx) return;
    const g = this.buses.music.gain, t = this.ctx.currentTime, base = this.game.settings.get('volumes.music') ?? 1;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.setTargetAtTime(base * (1 - amount), t, 0.08);
    g.setTargetAtTime(base, t + seconds, TUNING.duckRelease / 3);
  }
  /** 'outdoor' (short) | 'canyon' (long slapback) | 'interior' (small room) */
  setReverb(preset) {
    this.reverbPreset = preset;
    if (!this.ctx) return;
    if (!this._irCache.has(preset)) this._irCache.set(preset, this._impulse(preset));
    this.reverb.buffer = this._irCache.get(preset);
  }
  /** Keeps the listener on the camera. Called every frame by Game. */
  update() {
    if (!this.ctx) return;
    this.stats.voices = this.voices.size;
    const cam = this.game.camera, e = cam.matrixWorld.elements, L = this.ctx.listener, p = cam.position;
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = -e[8]; L.forwardY.value = -e[9]; L.forwardZ.value = -e[10];
      L.upX.value = e[4]; L.upY.value = e[5]; L.upZ.value = e[6];
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]); }
  }
  _ended(h) { this.voices.delete(h); }
  async _buffer(def) {
    if (def.buffer) return def.buffer;
    if (def.variants > 1) { this.prerender(def.name, 0); return def.buffers[0]; }
    if (!def.pending) def.pending = Promise.resolve(def.generator(this.ctx, 0)).then((b) => { def.buffer = b; return b; });
    return def.pending;
  }
  _impulse(preset) {
    const ctx = this.ctx, sr = ctx.sampleRate;
    const cfg = { outdoor: [0.6, 3.5, [], 0.5], canyon: [2.6, 2.2, [0.19, 0.43, 0.71], 0.75], interior: [0.9, 2.8, [], 0.8] }[preset] || [0.6, 3.5, [], 0.5];
    const [dur, decay, echoes, level] = cfg, len = Math.floor(sr * dur), buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * ((1 - i / len) ** decay) * level;
      for (const t of echoes) {
        const at = Math.floor((t + ch * 0.013) * sr);
        for (let k = 0; k < 400 && at + k < len; k++) d[at + k] += (Math.random() * 2 - 1) * 0.6 * Math.exp(-k / 120) * (1 - t / dur);
      }
    }
    return buf;
  }
}
