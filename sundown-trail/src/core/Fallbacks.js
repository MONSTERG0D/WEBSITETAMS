import * as THREE from 'three';
import { TestGround } from './TestGround.js';

/**
 * Stand-ins for every manifest module that isn't built yet, so game.sys(id) never returns undefined.
 * Optional install(game) adds visuals (test ground, default lights); optional update(dt, rawDt, game) runs each frame.
 */
const UP = new THREE.Vector3(0, 1, 0);
const SUN = new THREE.Vector3(-0.45, 0.8, 0.4).normalize(); // about 10:00
const MOON = new THREE.Vector3(0.3, 0.6, -0.7).normalize();
const NULL_HANDLE = Object.freeze({ stop() {}, setPosition() {}, setVolume() {} });
const none = () => null, no = () => false, empty = () => [], noop = () => {};

function skyTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const x = c.getContext('2d'), grad = x.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#5d8fc4'); grad.addColorStop(0.38, '#a9c3dc'); grad.addColorStop(0.49, '#ead7ad');
  grad.addColorStop(0.52, '#d9c39b'); grad.addColorStop(1, '#8f7a5a');
  x.fillStyle = grad; x.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const FALLBACKS = {
  terrain: {
    getHeightAt: () => 0, getNormalAt: () => UP, getBiomeAt: () => 'valley', getSurfaceAt: () => 'grass',
    isWater: no, getWaterDepth: () => 0, getRoadInfo: () => ({ onRoad: false, distance: Infinity }), getRegionAt: () => 'copperbell',
    raycast(origin, dir, max = 1000) {
      if (dir.y >= -1e-6 || origin.y < 0) return null;
      const t = -origin.y / dir.y;
      if (t > max) return null;
      return { point: new THREE.Vector3().copy(origin).addScaledVector(dir, t), normal: UP.clone(), distance: t, surface: 'grass' };
    },
    install(game) { this.ground = new TestGround(game); this.ground.build(); },
  },
  sky: {
    timeOfDay: 10, day: 1, setTime: noop, getSunDirection: () => SUN, getMoonDirection: () => MOON, isNight: no, sunLight: null,
    install(game) {
      const sun = new THREE.DirectionalLight(0xfff0d2, 2.6), q = game.quality;
      sun.userData.shadowCaster = true; sun.castShadow = q.shadows; sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 320 });
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
      const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x8a6a45, 0.9);
      game.scene.add(sun, sun.target, hemi);
      game.scene.background = skyTexture();
      game.scene.fog = new THREE.FogExp2(0xe2cfa6, game.get?.('terrain') ? 0.0011 : 0.0035); // lighter haze once a real world exists
      this.sunLight = sun;
    },
    update(dt, rawDt, game) {
      const p = game.player?.position, s = this.sunLight;
      if (!p || !s) return;
      s.target.position.copy(p); s.position.set(p.x + SUN.x * 120, p.y + SUN.y * 120, p.z + SUN.z * 120);
    },
  },
  weather: { current: 'clear', set: noop, wetness: 0, wind: new THREE.Vector3(1, 0, 0.3), fogDensity: 0.0022 },
  postfx: { render(game) { game.renderer.render(game.scene, game.camera); }, setFocus: noop, flash: noop, setGrade: noop },
  vfx: {
    spawn: () => NULL_HANDLE, decal: () => NULL_HANDLE, trail: () => NULL_HANDLE, lightFlash: noop, define: noop, warmup: noop,
    screen(opts = {}) { if (opts.shake) this._game?.cameraRig.shake(opts.shake, opts.seconds ?? 0.25); },
    install(game) { this._game = game; },
  },
  vegetation: {}, water: {}, props: {},
  characters: { createHuman: none },
  player: {
    position: new THREE.Vector3(), yaw: 0, velocity: new THREE.Vector3(), state: 'cutscene', health: 100, stamina: 100, focus: 100,
    entity: null, horse: null, crouched: false, spawn: new THREE.Vector3(), mount: no, dismount: noop, teleport: noop, setControl: noop,
  },
  horses: { playerHorse: null, createHorse: none },
  combat: { current: null, isAiming: false, equip: noop, holster: noop, fire: noop, reload: noop, applyDamage: noop },
  focus: { active: false, meter: 0, activate: noop, deactivate: noop },
  npcs: { spawn: none, despawn: noop, nearby: empty },
  law: { level: 0, bounty: () => 0, reportCrime: noop, payBounty: no, isWanted: no },
  honor: { value: 0, tier: 'Drifter', change: noop, priceMultiplier: () => 1 },
  dialogue: { active: false, start(tree, opts = {}) { opts.onEnd?.(null); } },
  social: {},
  towns: { zoneAt: none, buildings: empty, doorAt: none },
  shops: { open: no, buy: no, sell: no },
  wildlife: { spawn: none, nearby: empty },
  hunting: { skin: none, peltsOnHorse: empty },
  survival: { cores: { health: 100, stamina: 100, focus: 100 }, eat: no, use: no },
  camp: { canCamp: no, make: no, breakCamp: noop, sleep: noop },
  sfx: {}, ambience: {}, music: { setMood: noop },
  ranch: { level: () => 0, upgrade: no, dailyIncome: () => 0 },
  companions: { recruit: no, has: no, list: empty },
  hud: {}, map: {}, menus: {},
  missions: { active: null, register: noop, start: no, complete: noop, fail: noop, available: empty },
  encounters: { active: null, trigger: no },
  photo: {},
};
for (const fb of Object.values(FALLBACKS)) fb.isFallback = true;

const generic = new Map();
/** Fallback for any id: a known stand-in, or an object whose methods all return null. */
export function getFallback(id) {
  if (FALLBACKS[id]) return FALLBACKS[id];
  if (!generic.has(id)) {
    generic.set(id, new Proxy({ isFallback: true }, {
      get(target, prop) { return prop in target ? target[prop] : prop === 'then' ? undefined : none; },
    }));
  }
  return generic.get(id);
}
