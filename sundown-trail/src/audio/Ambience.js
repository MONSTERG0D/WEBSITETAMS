import * as THREE from 'three';
import System from '../core/System.js';
import { WORLD } from '../data/world.js';

/**
 * The 'ambience' system (Part 11, GAME_BIBLE §8): the soundscape under everything.
 * - Beds (stereo loops) crossfaded by biome × time of day × weather: wind that follows the weather's wind speed
 *   (stronger up high and out in the desert), crickets on warm dry nights.
 * - Point sources: the river (a loop that slides along the river to the nearest bank, louder at the falls) and
 *   the murmur of Copperbell and Saltmesa by day.
 * - Calls at random places around you: meadowlarks in the valley, ravens in the pines, hawks over the desert by
 *   day; owls, distant wolves and coyotes at night; a deer at dawn and dusk. Rain silences the birds.
 * - The church bell rings the hours at 8, noon and 6.
 * - Indoors the whole bed is muffled through a low-pass and drops in level.
 * `override` ({ biome, hour, weather, wind, interior }) lets the test page's mixer force a scene.
 */
export const TUNING = {
  fade: 1.6, wind: { base: 0.12, perMs: 0.075, max: 0.95, high: 1.25, desert: 1.15 }, crickets: 0.55, riverRange: 320, riverVolume: 3.2, fallsVolume: 6,
  crowdVolume: 2.2, crowdHours: [7.5, 21.5], calls: { day: [6, 18], night: [9, 26], dist: [45, 160] }, bellHours: [8, 12, 18], bellStrikes: 3,
  interior: { cutoff: 650, level: 0.55 }, open: { cutoff: 20000, level: 1 },
};
const CALLS = {
  day: { valley: ['bird_meadowlark', 'bird_meadowlark', 'bird_hawk'], riverbank: ['bird_meadowlark', 'bird_raven'], highland: ['bird_raven', 'bird_raven', 'bird_hawk'], snow: ['bird_raven'], desert: ['bird_hawk', 'bird_hawk', 'bird_raven'] },
  night: { valley: ['owl', 'coyote_yip', 'owl'], riverbank: ['owl', 'owl'], highland: ['wolf_howl', 'owl', 'wolf_howl'], snow: ['wolf_howl'], desert: ['coyote_yip', 'coyote_yip', 'owl'] },
  twilight: { valley: ['deer_bleat', 'bird_meadowlark', 'owl'], highland: ['deer_bleat', 'bird_raven'], riverbank: ['deer_bleat'], desert: ['coyote_yip'], snow: ['bird_raven'] },
};
const _v = new THREE.Vector3(), _a = new THREE.Vector3();

export default class Ambience extends System {
  constructor(game) {
    super(game);
    this.beds = {}; this.points = {}; this.override = null; this.enabled = true; this.state = {}; this._callT = 4; this._lastBell = -1; this._muffled = false;
    this.stats = { calls: 0, lastCall: null };
  }

  async init() { this.game.debug?.addTuning('Ambience', TUNING); }

  /** The scene used for the mix (overridable from the test page). */
  scene() {
    const g = this.game, p = g.player.position, sky = g.sys('sky'), W = g.sys('weather'), o = this.override || {};
    const hour = o.hour ?? sky.timeOfDay ?? 12, weather = o.weather ?? W.current ?? 'clear';
    const biome = o.biome ?? g.sys('terrain').getBiomeAt?.(p.x, p.z) ?? 'valley';
    const night = hour < 5 || hour >= 20.5, twilight = !night && (hour < 7.5 || hour >= 18.5);
    const wind = o.wind ?? Math.hypot(W.wind?.x || 0, W.wind?.z || 0);
    const interior = o.interior ?? !!g.get('towns')?.zone?.interior;
    return { hour, weather, biome, night, twilight, wind, interior, wet: weather === 'rain' || weather === 'storm' };
  }

  update(dt) {
    const g = this.game, A = g.audio;
    if (!this.enabled || !A.ctx || g.state !== 'playing' && g.state !== 'dead') return;
    const S = this.scene(); this.state = S;
    this._muffle(S);
    // ---- beds
    const W = TUNING.wind;
    let wv = W.base + S.wind * W.perMs; if (S.biome === 'highland' || S.biome === 'snow') wv *= W.high; if (S.biome === 'desert') wv *= W.desert;
    if (g.player.state === 'mounted') wv += Math.min(0.3, (g.player.horse?.speed || 0) * 0.02);
    this._bed('wind_loop', Math.min(W.max, wv), dt);
    const crick = S.night && !S.wet && S.biome !== 'snow' ? TUNING.crickets * (S.biome === 'desert' ? 0.6 : 1) : S.twilight && S.hour > 12 && !S.wet ? TUNING.crickets * 0.35 : 0;
    this._bed('crickets_loop', crick, dt);
    // ---- the river, sliding along to the nearest bank
    const p = g.player.position, rv = this._nearestRiver(p, _a), d = rv.distanceTo(_v.set(p.x, rv.y, p.z));
    const falls = Math.hypot(p.x - WORLD.waterfall.x, p.z - WORLD.waterfall.z);
    this._point('river_loop', d < TUNING.riverRange ? TUNING.riverVolume : 0, rv, dt);
    this._point('river_falls', falls < 400 ? TUNING.fallsVolume : 0, _a.set(WORLD.waterfall.x, g.sys('terrain').getHeightAt(WORLD.waterfall.x, WORLD.waterfall.z) + 4, WORLD.waterfall.z), dt, 'river_loop', 0.8);
    // ---- towns murmur by day
    const busy = S.hour >= TUNING.crowdHours[0] && S.hour <= TUNING.crowdHours[1] && !S.wet;
    for (const [id, L, k] of [['copperbell', WORLD.locations.copperbell, 1], ['saltmesa', WORLD.locations.saltmesaPost, 0.45]]) {
      const c = g.get('towns')?.towns?.get?.(id)?.center || L;
      this._point(`crowd_${id}`, busy ? TUNING.crowdVolume * k : 0, _a.set(c.x, g.sys('terrain').getHeightAt(c.x, c.z) + 2, c.z), dt, 'crowd_murmur_loop');
    }
    // ---- calls around you
    if ((this._callT -= dt) <= 0) {
      const R = S.night ? TUNING.calls.night : TUNING.calls.day;
      this._callT = R[0] + Math.random() * (R[1] - R[0]);
      const set = (S.night ? CALLS.night : S.twilight ? CALLS.twilight : CALLS.day)[S.biome] || CALLS.day.valley;
      if (!S.wet && !S.interior && set.length) this.call(set[Math.floor(Math.random() * set.length)]);
    }
    // ---- the church bell
    const h = Math.floor(S.hour);
    if (TUNING.bellHours.includes(h) && S.hour - h < 0.05 && this._lastBell !== h) { this._lastBell = h; this.bell(h === 12 ? 4 : TUNING.bellStrikes); }
    if (!TUNING.bellHours.includes(h)) this._lastBell = -1;
  }

  /** Plays an ambient call somewhere around the listener. */
  call(name) {
    const g = this.game, p = g.camera.position, a = Math.random() * Math.PI * 2, D = TUNING.calls.dist, r = D[0] + Math.random() * (D[1] - D[0]);
    const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r, y = g.sys('terrain').getHeightAt(x, z) + (name.startsWith('bird') || name === 'owl' ? 8 : 1);
    const far = name === 'wolf_howl' || name === 'coyote_yip';
    g.audio.play(name, { position: _v.set(far ? p.x + Math.sin(a) * r * 1.6 : x, y, far ? p.z + Math.cos(a) * r * 1.6 : z), volume: far ? 3.5 : 2.2 });
    this.stats.calls++; this.stats.lastCall = name;
  }
  /** Rings the church bell `n` times. */
  bell(n = 3) {
    const g = this.game, ch = g.get('towns')?.building?.('copperbell', 'church'), L = WORLD.locations.copperbell;
    const pos = ch ? ch.front.clone().setY(ch.front.y + 10) : new THREE.Vector3(L.x, g.sys('terrain').getHeightAt(L.x, L.z) + 10, L.z);
    for (let i = 0; i < n; i++) g.audio.play('church_bell', { position: pos, delay: i * 2.6, volume: 4 });
  }

  // ---------------------------------------------------------------- mixing helpers
  _bed(name, target, dt) {
    let b = this.beds[name];
    if (b?.h.stopped) { delete this.beds[name]; b = null; }
    if (!b && target > 0.005) { const h = this.game.audio.play(name, { loop: true, volume: 0 }); if (Object.isFrozen(h)) return; b = this.beds[name] = { h, v: 0 }; }
    if (!b) return;
    b.v += (target - b.v) * Math.min(1, dt / TUNING.fade);
    b.h.setVolume(b.v);
    if (target <= 0.005 && b.v < 0.004) { b.h.stop(0.2); delete this.beds[name]; }
  }
  _point(key, target, pos, dt, sound = key, pitch = 1) {
    let b = this.points[key];
    if (b?.h.stopped) { delete this.points[key]; b = null; }
    if (!b && target > 0.005) { const h = this.game.audio.play(sound, { loop: true, volume: 0, position: pos, pitch }); if (Object.isFrozen(h)) return; b = this.points[key] = { h, v: 0 }; }
    if (!b) return;
    b.v += (target - b.v) * Math.min(1, dt / TUNING.fade);
    b.h.setVolume(b.v); b.h.setPosition(pos);
    if (target <= 0.005 && b.v < 0.004) { b.h.stop(0.3); delete this.points[key]; }
  }
  /** Indoors: a low-pass and a lower level on the ambience bus (inserted once the AudioContext exists). */
  _muffle(S) {
    const A = this.game.audio, ctx = A.ctx;
    if (!this._filter) {
      this._filter = ctx.createBiquadFilter(); this._filter.type = 'lowpass'; this._filter.frequency.value = TUNING.open.cutoff;
      this._level = ctx.createGain();
      A.buses.ambience.disconnect(); A.buses.ambience.connect(this._filter); this._filter.connect(this._level); this._level.connect(A.master);
    }
    if (S.interior !== this._muffled) {
      this._muffled = S.interior;
      const T = S.interior ? TUNING.interior : TUNING.open, t = ctx.currentTime;
      this._filter.frequency.setTargetAtTime(T.cutoff, t, 0.25); this._level.gain.setTargetAtTime(T.level, t, 0.25);
    }
  }
  _nearestRiver(p, out) {
    const R = WORLD.river; let best = Infinity;
    for (let i = 0; i < R.length - 1; i++) {
      const [ax, az] = R[i], [bx, bz] = R[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / L2)), x = ax + dx * t, z = az + dz * t, d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < best) { best = d; out.set(x, 0, z); }
    }
    out.y = this.game.sys('terrain').getHeightAt(out.x, out.z) + 0.5;
    return out;
  }

  serialize() { return {}; }
  dispose() { for (const b of Object.values(this.beds)) b.h.stop(0); for (const b of Object.values(this.points)) b.h.stop(0); }
}
