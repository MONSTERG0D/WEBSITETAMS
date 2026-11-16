import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { WORLD, WORLD_SEED } from '../data/world.js';
import { RNG } from '../core/utils/rng.js';
import { SimplexNoise } from '../core/utils/noise.js';
import { clamp, smoothstep, lerp } from '../core/utils/math.js';
import { Precipitation } from './weather/Precipitation.js';
import { registerWeatherSounds } from './weather/WeatherSounds.js';

/**
 * Weather (Part 2): clear → cloudy → rain → storm → clearing, morning valley fog, snow above the snow line,
 * 30–90 s transitions, rain and snow around the camera, lightning with delayed thunder, gusting wind,
 * wetness and snow cover for materials, regional bias (GAME_BIBLE §7, §11 weather API).
 * Every visual value is continuous, so nothing pops when the state changes.
 */
export const TUNING = {
  auto: true, holdMin: 150, holdMax: 420, transitionMin: 30, transitionMax: 90,
  wetRate: 1 / 40, dryTime: 260, snowRate: 1 / 90, meltTime: 500,
  fogBase: 0.0009, fogMax: 0.0085, rainFog: 0.0011, valleyFog: 1.0, valleyFogChance: 0.55,
  lightningMin: 6, lightningMax: 20, lightningNear: 250, lightningFar: 1400, thunderSpeed: 343,
  gustStrength: 0.45, windTurn: 0.04, splashesPerSecond: 160, splashRadius: 14,
  fogBanks: true, rainbows: true, heatHaze: true,
};

/** Target parameters of each state. cloud: cover 0..1, dark: overcast dimming, wind in m/s. */
export const STATES = {
  clear: { cloud: 0.18, dark: 0, rain: 0, snow: 0, fog: 0, wind: 2.5, lightning: 0 },
  cloudy: { cloud: 0.68, dark: 0.22, rain: 0, snow: 0, fog: 0.05, wind: 4.5, lightning: 0 },
  rain: { cloud: 0.92, dark: 0.5, rain: 0.6, snow: 0, fog: 0.18, wind: 6, lightning: 0 },
  storm: { cloud: 1, dark: 0.78, rain: 1, snow: 0, fog: 0.25, wind: 11, lightning: 1 },
  fog: { cloud: 0.5, dark: 0.22, rain: 0, snow: 0, fog: 1, wind: 1.2, lightning: 0 },
  snow: { cloud: 0.9, dark: 0.38, rain: 0, snow: 0.85, fog: 0.35, wind: 5, lightning: 0 },
};
const KEYS = Object.keys(STATES.clear);

/** Markov weights from each state, and per-region multipliers (Saltmesa rarely rains, Greywind is often overcast). */
const NEXT = {
  clear: { clear: 0.5, cloudy: 1, fog: 0.12 },
  cloudy: { clear: 1, cloudy: 0.3, rain: 0.75, storm: 0.22 },
  rain: { cloudy: 1, storm: 0.45 },
  storm: { rain: 1 },
  fog: { clear: 1, cloudy: 0.5 },
  snow: { cloudy: 1, snow: 0.4 },
};
const REGION_BIAS = {
  copperbell: { valleyFog: 1 },
  blackstone: { storm: 1.3, valleyFog: 0.6 },
  saltmesa: { cloudy: 0.5, rain: 0.12, storm: 0.25, fog: 0.05, valleyFog: 0.1 },
  greywind: { cloudy: 1.8, rain: 1.3, snow: 1.5, clear: 0.6, valleyFog: 0.5 },
};
const TYPES = Object.keys(STATES);

export default class Weather extends System {
  constructor(game) {
    super(game);
    /** 'clear'|'cloudy'|'rain'|'storm'|'fog'|'snow' — the state being moved toward */
    this.current = 'clear';
    this.wetness = 0; this.snowCover = 0; this.snowLevel = WORLD.snowLine - 30;
    this.wind = new THREE.Vector3(2.4, 0, 0.7); this.fogDensity = TUNING.fogBase;
    // continuous values the sky, terrain and effects read
    this.cloudCover = STATES.clear.cloud; this.darkness = 0; this.rain = 0; this.snow = 0; this.fog = 0; this.flash = 0; this.lightning = 0;
    this.valleyFog = 0; this.afterStorm = 0;
    this.params = { ...STATES.clear }; this._from = { ...STATES.clear }; this._to = STATES.clear; this._t = 1; this._dur = 1;
    this.rng = new RNG(WORLD_SEED ^ 0x7ea7);
    this.noise = new SimplexNoise(WORLD_SEED ^ 0x3121);
    this._hold = this.rng.range(TUNING.holdMin, TUNING.holdMax); this._time = 0;
    this._windAngle = 0.28; this._strikeT = this.rng.range(TUNING.lightningMin, TUNING.lightningMax);
    this._flashes = []; this._thunder = []; this._splashAcc = 0; this._rainSound = null; this._warmed = false;
    this._light = new THREE.Color(); this._snowLight = new THREE.Color(); this._tmp = new THREE.Vector3(); this._strikePos = new THREE.Vector3();
  }

  async init() {
    const g = this.game, q = g.quality.name;
    this.rainFx = new Precipitation('rain', q); this.snowFx = new Precipitation('snow', q);
    g.scene.add(this.rainFx.mesh, this.snowFx.mesh);
    registerWeatherSounds(g.audio);
    g.events.on(EVENTS.QUALITY_CHANGED, ({ preset }) => { this.rainFx.setQuality(preset); this.snowFx.setQuality(preset); });
    g.debug?.addTuning('Weather', TUNING);
    this._dayFog = this._rollDayFog(1);
  }

  // ---------------------------------------------------------------- API (GAME_BIBLE §11)
  /**
   * Move to a weather state over `seconds` (default 30–90 s). Emits weather:changed {from, to}.
   * @param {'clear'|'cloudy'|'rain'|'storm'|'fog'|'snow'} type
   */
  set(type, seconds) {
    if (!STATES[type]) { console.warn(`[weather] unknown type "${type}"`); return; }
    const from = this.current;
    this._from = { ...this.params }; this._to = STATES[type]; this._t = 0;
    this._dur = Math.max(0.01, seconds ?? this.rng.range(TUNING.transitionMin, TUNING.transitionMax));
    this.current = type;
    this._hold = this._dur + this.rng.range(TUNING.holdMin, TUNING.holdMax);
    if (from === 'storm' && type !== 'storm') { this.afterStorm = 1; this._rainbowDue = true; }
    if (from !== type) this.game.events.emit(EVENTS.WEATHER_CHANGED, { from, to: type });
  }

  serialize() { return { current: this.current, wetness: +this.wetness.toFixed(3), snowCover: +this.snowCover.toFixed(3) }; }
  deserialize(data) {
    if (!data) return;
    if (STATES[data.current]) { this.current = data.current; this.params = { ...STATES[data.current] }; this._from = { ...this.params }; this._to = STATES[data.current]; this._t = 1; }
    if (Number.isFinite(data.wetness)) this.wetness = clamp(data.wetness, 0, 1);
    if (Number.isFinite(data.snowCover)) this.snowCover = clamp(data.snowCover, 0, 1);
  }

  // ---------------------------------------------------------------- frame
  update(dt, rawDt) {
    const g = this.game, T = TUNING, cam = g.camera.position, sky = g.get('sky');
    this._time += dt;
    // transition
    if (this._t < 1) {
      this._t = Math.min(1, this._t + dt / this._dur);
      const f = smoothstep(0, 1, this._t);
      for (const k of KEYS) this.params[k] = lerp(this._from[k], this._to[k], f);
    }
    if (T.auto) { this._hold -= dt; if (this._hold <= 0) this.set(this._pickNext(), undefined); }
    const P = this.params;

    // morning valley fog: lowlands only, some mornings
    const hour = sky ? sky.timeOfDay : 10, day = sky ? sky.day : 1;
    if (this._fogDay !== day) { this._fogDay = day; this._dayFog = this._rollDayFog(day); }
    const region = g.sys('terrain').getRegionAt(cam.x, cam.z), bias = REGION_BIAS[region] || {};
    const morning = smoothstep(4.3, 5.6, hour) * (1 - smoothstep(7.4, 9.0, hour));
    const low = 1 - smoothstep(35, 95, cam.y);
    this.valleyFog = morning * low * this._dayFog * (bias.valleyFog ?? 1) * T.valleyFog * (1 - P.rain * 0.5);

    // snow above the snow line (or the snow state), rain below
    const alt = smoothstep(WORLD.snowLine - 22, WORLD.snowLine + 6, cam.y);
    this.rain = P.rain * (1 - alt);
    this.snow = Math.max(P.snow, P.rain * alt);
    this.snowLevel = P.snow > 0.3 ? -100 : WORLD.snowLine - 30;
    this.cloudCover = P.cloud; this.darkness = P.dark; this.lightning = P.lightning;
    this.fog = clamp(P.fog + this.valleyFog * 0.8, 0, 1);
    this.fogDensity = Math.min(T.fogMax, T.fogBase + P.fog * 0.006 + P.rain * T.rainFog + this.snow * 0.0018 + this.valleyFog * 0.0045);

    this._updateWind(dt, P);
    this._updateSurfaces(dt, sky);
    this._updateLightning(dt, cam);
    this.afterStorm = Math.max(0, this.afterStorm - dt / 240);

    // precipitation picks up the ambient light (and the lightning)
    const hemi = sky?.hemiLight;
    if (hemi) this._light.copy(hemi.color).multiplyScalar(0.25 + hemi.intensity * 0.35); else this._light.setRGB(0.55, 0.58, 0.62);
    this._light.offsetHSL(0, -0.2, 0).addScalar(this.flash * 0.6);
    const t = g.now || this._time, c = g.camera;
    const pixel = c.fov ? 2 * Math.tan((c.fov * Math.PI) / 360) / Math.max(1, (g.height || 720) * (g.renderer?.getPixelRatio?.() || 1)) : 0.002;
    this.rainFx.update(this.rain, cam, this.wind, this._light, t, pixel);
    this._snowLight.copy(this._light).multiplyScalar(1.6);
    this.snowFx.update(this.snow, cam, this.wind, this._snowLight, t, pixel);
    this._splashes(dt, cam);
    this._effects(cam, hour, region);
    this._sound();
  }

  _pickNext() {
    const g = this.game, p = g.player?.position || g.camera.position;
    const bias = REGION_BIAS[g.sys('terrain').getRegionAt(p.x, p.z)] || {};
    const high = p.y > WORLD.snowLine - 20;
    const w = NEXT[this.current] || NEXT.clear;
    const opts = [];
    let total = 0;
    for (const type of TYPES) {
      let v = w[type] || 0;
      if (type === 'snow') v = high ? (w.snow ?? 0) + (this.current === 'cloudy' ? 0.5 : 0) : 0;
      if (type === 'fog') { const h = g.get('sky')?.timeOfDay ?? 10; if (h > 10 && h < 20) v *= 0.2; }
      v *= bias[type] ?? 1;
      if (v > 0) { opts.push([type, v]); total += v; }
    }
    let r = this.rng.next() * total;
    for (const [type, v] of opts) { r -= v; if (r <= 0) return type; }
    return 'clear';
  }

  _rollDayFog(day) { const r = new RNG((WORLD_SEED ^ (day * 7919)) >>> 0); return r.chance(TUNING.valleyFogChance) ? r.range(0.6, 1) : 0; }

  _updateWind(dt, P) {
    const n = this.noise, t = this._time;
    this._windAngle += n.noise2(t * 0.01, 3.7) * TUNING.windTurn * dt;
    const gust = Math.max(0, n.noise2(t * 0.22, 11.3) * 0.7 + n.noise2(t * 0.9, 5.1) * 0.3) * TUNING.gustStrength;
    const speed = P.wind * (1 + gust * (1 + P.lightning));
    this.gust = gust;
    this.wind.set(Math.cos(this._windAngle) * speed, 0, Math.sin(this._windAngle) * speed);
  }

  _updateSurfaces(dt, sky) {
    const T = TUNING, day = sky ? sky.daylight : 1;
    if (this.rain > 0.02) this.wetness = Math.min(1, this.wetness + this.rain * T.wetRate * dt);
    else this.wetness = Math.max(0, this.wetness - dt / (T.dryTime * (1.6 - day * 0.8)));
    if (this.snow > 0.02) this.snowCover = Math.min(1, this.snowCover + this.snow * T.snowRate * dt);
    else this.snowCover = Math.max(0, this.snowCover - dt / T.meltTime);
  }

  // ---------------------------------------------------------------- lightning & thunder
  _updateLightning(dt, cam) {
    const T = TUNING;
    if (this.lightning > 0.5) {
      this._strikeT -= dt;
      if (this._strikeT <= 0) { this.strike(); this._strikeT = this.rng.range(T.lightningMin, T.lightningMax) / Math.max(0.6, this.lightning); }
    }
    // flash envelope: a few fast flickers per strike
    let f = 0;
    for (let i = this._flashes.length - 1; i >= 0; i--) {
      const s = this._flashes[i]; s.t += dt;
      if (s.t > 0.9) { this._flashes.splice(i, 1); continue; }
      for (const [at, amp] of s.pulses) { const x = s.t - at; if (x >= 0) f += amp * Math.exp(-x * 22) * s.k; }
    }
    this.flash = Math.min(1.5, f);
    for (let i = this._thunder.length - 1; i >= 0; i--) {
      const th = this._thunder[i]; th.t -= dt;
      if (th.t <= 0) { this.game.audio.play(th.close ? 'thunder_close' : 'thunder', { volume: th.volume, pitch: th.pitch }); this._thunder.splice(i, 1); }
    }
  }

  /**
   * A lightning strike near the camera (debug and scripted moments can call this directly).
   * @param {THREE.Vector3} [position] defaults to a random point 250–1400 m away
   */
  strike(position) {
    const g = this.game, T = TUNING, cam = g.camera.position, rng = this.rng, p = this._strikePos;
    if (position) p.copy(position);
    else {
      const a = rng.range(0, Math.PI * 2), d = rng.range(T.lightningNear, T.lightningFar);
      p.set(cam.x + Math.cos(a) * d, 0, cam.z + Math.sin(a) * d);
      p.y = g.sys('terrain').getHeightAt(p.x, p.z);
    }
    const dist = Math.hypot(p.x - cam.x, p.z - cam.z), near = 1 - smoothstep(T.lightningNear, T.lightningFar, dist);
    const pulses = [[0, 1], [rng.range(0.06, 0.12), rng.range(0.3, 0.8)], [rng.range(0.16, 0.3), rng.range(0.2, 0.6)]];
    this._flashes.push({ t: 0, k: 0.45 + 0.75 * near, pulses });
    if (near > 0.55) g.sys('postfx').flash(0xdfe6ff, 0.12 + near * 0.12);
    g.sys('vfx').spawn('lightning_bolt', { position: p.clone(), scale: 1 });
    this._thunder.push({ t: dist / T.thunderSpeed, close: dist < 520, volume: 0.35 + 0.65 * near, pitch: 0.9 + rng.next() * 0.2 });
    g.events.emit(EVENTS.WEATHER_LIGHTNING, { position: p.clone() });
    return p;
  }

  // ---------------------------------------------------------------- rain splashes and sound
  _splashes(dt, cam) {
    if (this.rain < 0.05) return;
    const vfx = this.game.sys('vfx');
    if (vfx.isFallback) return;
    const terrain = this.game.sys('terrain'), T = TUNING, rng = this.rng;
    this._splashAcc += this.rain * T.splashesPerSecond * dt;
    const pos = this._tmp;
    while (this._splashAcc >= 1) {
      this._splashAcc -= 1;
      const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * T.splashRadius;
      pos.set(cam.x + Math.cos(a) * r, 0, cam.z + Math.sin(a) * r);
      const water = terrain.getWaterLevelAt ? terrain.getWaterLevelAt(pos.x, pos.z) : null;
      pos.y = water ?? terrain.getHeightAt(pos.x, pos.z);
      if (Math.abs(pos.y - cam.y) > 12) continue;
      vfx.spawn(water != null ? 'ripple' : 'rain_splash', { position: pos });
    }
  }

  _sound() {
    const audio = this.game.audio;
    if (!audio.ctx) return;
    if (!this._warmed) { // generate the thunder buffers in the background before the first strike
      this._warmed = true;
      setTimeout(() => { for (const n of ['thunder', 'thunder_close']) { const d = audio.sounds.get(n); if (d) audio._buffer(d).catch(() => {}); } }, 500);
    }
    const level = Math.min(1, this.rain * 1.1);
    if (level > 0.02 && (!this._rainSound || Object.isFrozen(this._rainSound) || this._rainSound.stopped)) this._rainSound = audio.play('rain_loop', { volume: 0 });
    if (this._rainSound && !Object.isFrozen(this._rainSound)) {
      this._rainSound.setVolume(level);
      if (level <= 0.005) { this._rainSound.stop(1.5); this._rainSound = null; }
    }
  }

  /** Effects that follow the weather (Part 2B VFX): valley fog banks, the rainbow after a storm, desert heat haze. */
  _effects(cam, hour, region) {
    const vfx = this.game.sys('vfx'), T = TUNING;
    if (vfx.isFallback) return;
    // fog banks around the camera on fog mornings and in the fog state
    const fogWant = T.fogBanks && (this.valleyFog > 0.25 || this.params.fog > 0.6);
    if (fogWant && !this._fogBank) this._fogBank = vfx.spawn('fog_bank', { position: cam });
    if (this._fogBank) {
      if (!fogWant && (this.valleyFog < 0.15 && this.params.fog < 0.45)) { this._fogBank.stop(); this._fogBank = null; }
      else this._fogBank.setPosition(cam);
    }
    // a rainbow once the rain has eased after a storm (it fades itself with afterStorm and the sun)
    if (this._rainbowDue && this.rain < 0.25) { this._rainbowDue = false; if (T.rainbows) vfx.spawn('rainbow'); }
    // heat haze over Saltmesa on clear afternoons
    const hazeWant = T.heatHaze && region === 'saltmesa' && this.cloudCover < 0.5 && this.rain < 0.05 && hour > 10.5 && hour < 17.5;
    if (hazeWant && !this._haze) this._haze = vfx.spawn('heat_haze', { strength: 1 });
    if (!hazeWant && this._haze) { this._haze.stop(); this._haze = null; }
  }

  dispose() {
    this._fogBank?.stop(); this._haze?.stop();
    this.rainFx?.dispose(); this.snowFx?.dispose();
    this._rainSound?.stop?.(0.5);
  }
}

export { TYPES as WEATHER_TYPES };
