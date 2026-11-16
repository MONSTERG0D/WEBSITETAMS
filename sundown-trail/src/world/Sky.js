import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { WORLD, WORLD_SEED } from '../data/world.js';
import { mulberry32 } from '../core/utils/rng.js';
import { smoothstep, lerp } from '../core/utils/math.js';
import { SKY_VERTEX, SKY_FRAGMENT, createCloudTexture } from './sky/SkyShader.js';
import { VFX_LAYER } from '../render/vfx/Shared.js';

/**
 * Sky (Part 2): time of day, sky dome, sun and moon, the key light with stable player-following shadows,
 * hemisphere light, fog colour, the environment map and the per-hour colour look (GAME_BIBLE §7 "Light", §11 sky API).
 * East is +x, north is −z: the sun rises over the Blackstone Hills and sets behind Saltmesa.
 */
export const TUNING = {
  dayMinutes: 40, freezeTime: false, sunrise: 6.0, sunset: 18.5, sunTilt: 0.42, sunHeight: 0.9,
  sunIntensity: 2.9, moonIntensity: 0.55, hemiIntensity: 0.55, envIntensity: 0.75, skyBrightness: 1.0,
  sunDisc: 38, sunHalo: 1.0, haze: 0.75, stars: 1.0, milkyWay: 1.0, cloudSpeed: 1.0,
  shadowRangeHigh: 80, shadowRangeMedium: 55, shadowDistance: 260, shadowBias: -0.00035, shadowNormalBias: 0.03,
  envEvery: 1.5, envSize: 64, fogBase: 0.0009, fogNoTerrain: 0.0035,
  shootingStarMin: 20, shootingStarMax: 70, fireflies: true,
};

/**
 * Colour table keyed by hour (sRGB hex, converted to linear on load). Interpolated smoothly, wrapping at 24.
 * zenith/horizon: sky; sun: key-light and halo colour; hemi/ground: hemisphere light; fog: haze and fog;
 * exposure, warmth (−1 teal … +1 amber), saturation, contrast: the grade PostFX applies.
 */
const KEYS = [
  { h: 0.0, zenith: '#04091a', horizon: '#18253a', sun: '#ff9a5a', hemi: '#3a5680', ground: '#151a20', hemiI: 0.42, fog: '#162131', exposure: 2.1, warmth: -0.28, saturation: 0.78, contrast: 1.05 },
  { h: 4.7, zenith: '#091329', horizon: '#33354d', sun: '#ff9a5a', hemi: '#46557a', ground: '#211f22', hemiI: 0.42, fog: '#30344a', exposure: 1.9, warmth: -0.14, saturation: 0.82, contrast: 1.04 },
  { h: 5.6, zenith: '#283e6c', horizon: '#e39a80', sun: '#ff9460', hemi: '#8a8fb2', ground: '#5e4a3e', hemiI: 0.6, fog: '#c39686', exposure: 1.4, warmth: 0.12, saturation: 0.95, contrast: 1.03 },
  { h: 6.6, zenith: '#4772b0', horizon: '#f1c18e', sun: '#ffbd7a', hemi: '#a9b8d2', ground: '#866848', hemiI: 0.8, fog: '#dfc29e', exposure: 1.12, warmth: 0.2, saturation: 1.02, contrast: 1.04 },
  { h: 8.5, zenith: '#3d77c0', horizon: '#bfd3e6', sun: '#ffe5c2', hemi: '#b8cce6', ground: '#8a7050', hemiI: 0.92, fog: '#c9d4dc', exposure: 1.0, warmth: 0.06, saturation: 1.02, contrast: 1.03 },
  { h: 12.0, zenith: '#3870c2', horizon: '#c7d8ea', sun: '#fff3e0', hemi: '#c0d4f0', ground: '#9a7c58', hemiI: 1.0, fog: '#d1dbe2', exposure: 0.96, warmth: 0.08, saturation: 1.0, contrast: 1.04 },
  { h: 16.0, zenith: '#3c6fb8', horizon: '#d6d7d0', sun: '#ffe0b4', hemi: '#c0cfe6', ground: '#9a7854', hemiI: 0.95, fog: '#dad5c7', exposure: 0.98, warmth: 0.13, saturation: 1.03, contrast: 1.04 },
  { h: 17.9, zenith: '#4868a6', horizon: '#f3b56c', sun: '#ffa64e', hemi: '#b2a8b2', ground: '#9a6a40', hemiI: 0.78, fog: '#e6b47c', exposure: 1.08, warmth: 0.32, saturation: 1.08, contrast: 1.05 },
  { h: 18.7, zenith: '#2a386e', horizon: '#dd7550', sun: '#ff6e36', hemi: '#7a6a92', ground: '#563e36', hemiI: 0.58, fog: '#a46862', exposure: 1.35, warmth: 0.2, saturation: 1.02, contrast: 1.04 },
  { h: 19.6, zenith: '#111938', horizon: '#47395c', sun: '#ff6e36', hemi: '#4a5476', ground: '#28242a', hemiI: 0.45, fog: '#37354e', exposure: 1.8, warmth: -0.06, saturation: 0.86, contrast: 1.04 },
  { h: 21.0, zenith: '#04091a', horizon: '#18253a', sun: '#ff9a5a', hemi: '#3a5680', ground: '#151a20', hemiI: 0.42, fog: '#162131', exposure: 2.1, warmth: -0.28, saturation: 0.78, contrast: 1.05 },
];
const COLOR_KEYS = ['zenith', 'horizon', 'sun', 'hemi', 'ground', 'fog'];
const NUM_KEYS = ['hemiI', 'exposure', 'warmth', 'saturation', 'contrast'];
const MOON_COLOR = new THREE.Color('#9fbbe4');
const OVERCAST = new THREE.Color('#8f979e');
for (const k of KEYS) for (const c of COLOR_KEYS) k[c] = new THREE.Color(k[c]);

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _col = new THREE.Color();

export default class Sky extends System {
  constructor(game) {
    super(game);
    this.timeOfDay = WORLD.start.hour; this.day = 1;
    this.sunLight = null; this.hemiLight = null;
    this._sun = new THREE.Vector3(); this._moon = new THREE.Vector3();
    /** Current interpolated palette; PostFX reads `look` for the grade. */
    this.palette = {}; for (const c of COLOR_KEYS) this.palette[c] = new THREE.Color(); for (const n of NUM_KEYS) this.palette[n] = 0;
    this.look = { exposure: 1, warmth: 0, saturation: 1, contrast: 1, night: 0, daylight: 1 };
    this.daylight = 1; this.night = 0; this.sunVisibility = 1;
    this._lastHour = Math.floor(this.timeOfDay); this._envT = 0; this._envDirty = true; this._cloud = new THREE.Vector4(0.13, 0.71, 0.4, 0.2);
  }

  async init() {
    const g = this.game, q = g.quality;
    // key light: the sun by day, the moon by night (one shadow map)
    const key = new THREE.DirectionalLight(0xffffff, 0);
    key.userData.shadowCaster = true; key.castShadow = q.shadows; key.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    key.shadow.bias = TUNING.shadowBias; key.shadow.normalBias = TUNING.shadowNormalBias;
    Object.assign(key.shadow.camera, { near: 1, far: TUNING.shadowDistance * 2 });
    this.sunLight = key;
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0);
    key.layers.enable(VFX_LAYER); this.hemiLight.layers.enable(VFX_LAYER); // present in PostFX's soft-effects pass too
    g.scene.add(key, key.target, this.hemiLight);
    g.scene.fog = new THREE.FogExp2(0xd1dbe2, TUNING.fogBase);
    g.scene.background = null;

    // dome
    this.cloudTex = createCloudTexture(256, mulberry32(WORLD_SEED ^ 0x5a17));
    const shared = {
      uSunDir: { value: this._sun }, uMoonDir: { value: this._moon }, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uFogColor: { value: new THREE.Color() }, uSunColor: { value: new THREE.Color() }, uMoonColor: { value: MOON_COLOR.clone() },
      uSunDisc: { value: TUNING.sunDisc }, uSunHalo: { value: TUNING.sunHalo }, uDaylight: { value: 1 }, uNight: { value: 0 },
      uCloudCover: { value: 0.25 }, uDark: { value: 0 }, uCloudOffset: { value: this._cloud }, uTime: { value: 0 }, uFlash: { value: 0 },
      uStars: { value: TUNING.stars }, uMilky: { value: TUNING.milkyWay }, uMoonPhase: { value: 0 }, uHaze: { value: TUNING.haze },
      uCloudTex: { value: this.cloudTex },
    };
    this.uniforms = shared;
    const makeMat = (env) => new THREE.ShaderMaterial({
      uniforms: { ...shared, uEnvPass: { value: env ? 1 : 0 }, uExposureComp: { value: env ? TUNING.envIntensity : TUNING.skyBrightness } },
      vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: true,
    });
    this.domeMat = makeMat(false); this.envMat = makeMat(true);
    const geo = new THREE.SphereGeometry(1, 48, 24);
    this.dome = new THREE.Mesh(geo, this.domeMat);
    this.dome.name = 'SkyDome'; this.dome.frustumCulled = false; this.dome.renderOrder = -1000; this.dome.scale.setScalar(1000);
    this.dome.onBeforeRender = (r, s, cam) => { this.dome.position.copy(cam.position); this.dome.updateMatrixWorld(); };
    g.scene.add(this.dome);

    // environment: the dome rendered into a small cube, prefiltered for PBR reflections and ambient
    this.envScene = new THREE.Scene();
    this.envDome = new THREE.Mesh(geo, this.envMat); this.envDome.scale.setScalar(100); this.envDome.frustumCulled = false;
    this.envScene.add(this.envDome);
    this.cubeRT = new THREE.WebGLCubeRenderTarget(TUNING.envSize, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.cubeCam = new THREE.CubeCamera(1, 1000, this.cubeRT);
    this.envScene.add(this.cubeCam);
    this.pmrem = new THREE.PMREMGenerator(g.renderer);
    this.envRT = null;

    this._apply(0);
    this._updateEnv();
    g.debug?.addTuning('Sky', TUNING, { dayMinutes: { min: 0.5, max: 120, step: 0.5 } });
  }

  // ---------------------------------------------------------------- API (GAME_BIBLE §11)
  /** Jump to an hour (0–24). Events for the skipped hours are not emitted. */
  setTime(h) {
    const t = ((h % 24) + 24) % 24;
    if (Math.abs(t - this.timeOfDay) > 0.02) this._envDirty = true;
    this.timeOfDay = t;
    this._lastHour = Math.floor(t);
    if (this.sunLight) this._apply(0);
  }
  /** @returns {THREE.Vector3} unit vector toward the sun (below the horizon at night). Shared; don't modify. */
  getSunDirection() { return this._sun; }
  /** @returns {THREE.Vector3} unit vector toward the moon. Shared; don't modify. */
  getMoonDirection() { return this._moon; }
  isNight() { return this._sun.y < -0.05; }

  serialize() { return { time: Math.round(this.timeOfDay * 1000) / 1000, day: this.day }; }
  deserialize(data) {
    if (!data) return;
    if (Number.isFinite(data.day)) this.day = Math.max(1, Math.floor(data.day));
    if (Number.isFinite(data.time)) this.setTime(data.time);
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    const prev = this.timeOfDay;
    if (!TUNING.freezeTime) this.timeOfDay += dt * 24 / (TUNING.dayMinutes * 60);
    if (this.timeOfDay >= 24) { this.timeOfDay -= 24; this.day++; }
    this._events(prev, this.timeOfDay);
    this._apply(dt);
    this._envT += dt;
    const every = this.game.quality.name === 'low' ? TUNING.envEvery * 3 : TUNING.envEvery;
    if (this._envDirty || this._envT > every) this._updateEnv();
    this._nightEffects(dt);
  }

  _events(prev, now) {
    const ev = this.game.events, hour = Math.floor(now);
    if (hour !== this._lastHour) { this._lastHour = hour; ev.emit(EVENTS.TIME_HOUR, { hour, day: this.day }); }
    const crossed = (h) => (prev < h && now >= h) || (prev > now && (prev < h || now >= h));
    if (crossed(TUNING.sunrise)) ev.emit(EVENTS.TIME_DAWN, { hour: now, day: this.day });
    if (crossed(TUNING.sunset)) ev.emit(EVENTS.TIME_DUSK, { hour: now, day: this.day });
  }

  /** Sun and moon directions for hour t. Day maps to 0..π over sunrise→sunset; night continues π..2π. */
  static sunAngle(t) {
    const { sunrise: a, sunset: b } = TUNING, day = b - a;
    const s = ((t - a) % 24 + 24) % 24;
    return s <= day ? (s / day) * Math.PI : Math.PI + ((s - day) / (24 - day)) * Math.PI;
  }
  static directionFromAngle(theta, out) {
    return out.set(Math.cos(theta), Math.sin(theta) * TUNING.sunHeight, Math.sin(theta) * TUNING.sunTilt + 0.08).normalize();
  }

  _palette(t) {
    let i = 0;
    while (i < KEYS.length - 1 && KEYS[i + 1].h <= t) i++;
    const A = KEYS[i], B = KEYS[i + 1] || { ...KEYS[0], h: 24 };
    const bh = i + 1 < KEYS.length ? B.h : 24, f = smoothstep(0, 1, (t - A.h) / Math.max(1e-6, bh - A.h));
    const P = this.palette, Bk = i + 1 < KEYS.length ? B : KEYS[0];
    for (const c of COLOR_KEYS) P[c].copy(A[c]).lerp(Bk[c], f);
    for (const n of NUM_KEYS) P[n] = lerp(A[n], Bk[n], f);
    return P;
  }

  _apply(dt) {
    const g = this.game, T = TUNING, t = this.timeOfDay, P = this._palette(t), U = this.uniforms;
    const theta = Sky.sunAngle(t);
    Sky.directionFromAngle(theta, this._sun);
    Sky.directionFromAngle(theta - Math.PI + 0.3, this._moon);
    const sy = this._sun.y, my = this._moon.y;
    this.daylight = smoothstep(-0.12, 0.25, sy);
    this.night = 1 - smoothstep(-0.2, -0.02, sy);

    // weather (Part 2 Weather, or the clear fallback)
    const w = g.get('weather');
    const cover = w ? w.cloudCover ?? 0.25 : 0.25, dark = w ? w.darkness ?? 0 : 0, flash = w ? w.flash ?? 0 : 0, fogAmt = w ? w.fog ?? 0 : 0;
    this.sunVisibility = 1 - dark * 0.88;

    // key light: sun fades out just below the horizon, then the moon fades in
    const key = this.sunLight, sunI = T.sunIntensity * smoothstep(-0.02, 0.12, sy) * this.sunVisibility;
    const moonI = T.moonIntensity * (1 - smoothstep(-0.1, -0.025, sy)) * smoothstep(-0.02, 0.15, my) * (1 - dark * 0.7);
    const useSun = sy > -0.025;
    const dir = useSun ? this._sun : this._moon;
    if (useSun) key.color.copy(P.sun).lerp(OVERCAST, dark * 0.6); else key.color.copy(MOON_COLOR);
    key.intensity = (useSun ? sunI : moonI) + flash * 1.5;
    this._placeShadow(dir);

    // hemisphere light (sky and ground bounce), dimmed and greyed by overcast, brightened by lightning
    const hemi = this.hemiLight;
    hemi.color.copy(P.hemi).lerp(_col.copy(OVERCAST).multiplyScalar((0.4 + 0.6 * this.daylight) * (1 - dark * 0.45)), cover * 0.6);
    hemi.groundColor.copy(P.ground);
    hemi.intensity = T.hemiIntensity * P.hemiI * (1 - dark * 0.35) + flash * 2.5;

    // fog follows the horizon colour; weather sets the density
    const fog = g.scene.fog;
    if (fog) {
      fog.color.copy(P.fog).lerp(_col.copy(OVERCAST).multiplyScalar((0.25 + 0.75 * this.daylight) * (1 - dark * 0.6)), Math.min(1, cover * 0.55 + fogAmt * 0.7 + dark * 0.3));
      fog.density = w ? w.fogDensity : g.get('terrain') ? T.fogBase : T.fogNoTerrain;
    }

    // dome uniforms
    U.uZenith.value.copy(P.zenith); U.uHorizon.value.copy(P.horizon); U.uFogColor.value.copy(fog ? fog.color : P.fog);
    U.uSunColor.value.copy(P.sun).multiplyScalar(0.25 + 0.75 * smoothstep(-0.1, 0.3, sy));
    U.uDaylight.value = this.daylight; U.uNight.value = this.night;
    U.uCloudCover.value = cover; U.uDark.value = dark; U.uFlash.value = flash;
    U.uSunDisc.value = T.sunDisc * smoothstep(-0.03, 0.02, sy); U.uSunHalo.value = T.sunHalo * smoothstep(-0.2, 0.0, sy);
    U.uStars.value = T.stars; U.uMilky.value = T.milkyWay; U.uHaze.value = T.haze;
    U.uMoonPhase.value = Math.sin(this.day * 0.8) * 1.4;
    U.uTime.value = g.now || 0;
    this.domeMat.uniforms.uExposureComp.value = T.skyBrightness; this.envMat.uniforms.uExposureComp.value = T.envIntensity;
    if (dt > 0) {
      const wind = w ? w.wind : null, wx = wind ? wind.x : 1, wz = wind ? wind.z : 0.3, s = 0.0016 * T.cloudSpeed * dt;
      this._cloud.x += wx * s; this._cloud.y += wz * s; this._cloud.z += wx * s * 0.5; this._cloud.w += wz * s * 0.5;
    }
    if (flash > 0.02) this._envDirty = true;

    // the grade PostFX uses (weather greys it)
    const L = this.look;
    L.exposure = P.exposure * (1 + dark * 0.1); L.warmth = P.warmth * (1 - dark * 0.7) - dark * 0.08;
    L.saturation = P.saturation * (1 - dark * 0.3); L.contrast = P.contrast; L.night = this.night; L.daylight = this.daylight;
  }

  /** Shooting stars on clear nights; fireflies at dusk in the valley and along the river (Part 2B VFX). */
  _nightEffects(dt) {
    const g = this.game, vfx = g.sys('vfx');
    if (vfx.isFallback) return;
    const w = g.get('weather'), clear = !w || (w.cloudCover < 0.55 && w.rain < 0.05);
    this._starT = (this._starT ?? 30) - dt;
    if (this._starT <= 0) {
      this._starT = TUNING.shootingStarMin + Math.random() * (TUNING.shootingStarMax - TUNING.shootingStarMin);
      if (this.night > 0.8 && clear) vfx.spawn('shooting_star');
    }
    const p = g.player?.position || g.camera.position, t = this.timeOfDay;
    const biome = g.sys('terrain').getBiomeAt(p.x, p.z);
    const want = TUNING.fireflies && clear && t > 18.9 && t < 22.5 && (biome === 'valley' || biome === 'riverbank') && (!w || w.wind.length() < 7);
    if (want && !this._fireflies) this._fireflies = vfx.spawn('fireflies', { position: p });
    if (this._fireflies) { if (!want) { this._fireflies.stop(); this._fireflies = null; } else this._fireflies.setPosition(p); }
  }

  /** Centre the shadow box on the player and snap it to whole shadow-map texels so edges don't crawl while moving. */
  _placeShadow(dir) {
    const g = this.game, key = this.sunLight, q = g.quality;
    const range = q.name === 'high' ? TUNING.shadowRangeHigh : TUNING.shadowRangeMedium;
    const cam = key.shadow.camera;
    if (cam.right !== range) { cam.left = -range; cam.right = range; cam.top = range; cam.bottom = -range; cam.updateProjectionMatrix(); }
    const p = g.player?.position || g.camera.position;
    const texel = (2 * range) / (key.shadow.mapSize.x || 1024);
    const right = _a.set(0, 1, 0).cross(dir); // matches the shadow camera's lookAt basis
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0); else right.normalize();
    const up = _b.copy(dir).cross(right).normalize();
    const cx = Math.round(p.dot(right) / texel) * texel, cy = Math.round(p.dot(up) / texel) * texel, cz = p.dot(dir);
    const c = _c.copy(right).multiplyScalar(cx).addScaledVector(up, cy).addScaledVector(dir, cz);
    key.target.position.copy(c);
    key.position.copy(c).addScaledVector(dir, TUNING.shadowDistance);
    key.target.updateMatrixWorld();
  }

  _updateEnv() {
    this._envT = 0; this._envDirty = false;
    const r = this.game.renderer, prevTarget = r.getRenderTarget();
    this.cubeCam.update(r, this.envScene);
    this.envRT = this.pmrem.fromCubemap(this.cubeRT.texture, this.envRT);
    r.setRenderTarget(prevTarget);
    this.game.scene.environment = this.envRT.texture;
  }

  dispose() {
    const s = this.game.scene;
    s.remove(this.sunLight, this.sunLight.target, this.hemiLight, this.dome);
    if (s.environment === this.envRT?.texture) s.environment = null;
    this.dome.geometry.dispose(); this.domeMat.dispose(); this.envMat.dispose(); this.cloudTex.dispose();
    this.cubeRT.dispose(); this.envRT?.dispose(); this.pmrem.dispose(); this.sunLight.dispose?.(); this.hemiLight.dispose?.();
  }
}

export { KEYS as SKY_KEYS };
