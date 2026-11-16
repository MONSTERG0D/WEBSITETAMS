import { Storage } from './Storage.js';
import { EVENTS } from './Events.js';

const KEY = 'sundown.settings.v1';

/** Default key bindings (GAME_BIBLE §9). Mouse buttons are Mouse0 (left), Mouse2 (right). */
export const DEFAULT_KEYBINDS = Object.freeze({
  moveForward: ['KeyW', 'ArrowUp'], moveBack: ['KeyS', 'ArrowDown'], moveLeft: ['KeyA', 'ArrowLeft'], moveRight: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'], crouch: ['ControlLeft', 'ControlRight'], jump: ['Space'], interact: ['KeyE'],
  social: ['KeyQ'], whistle: ['KeyH'], aim: ['Mouse2'], fire: ['Mouse0'], reload: ['KeyR'], weaponWheel: ['Tab'],
  holster: ['KeyX'], focus: ['KeyV'], camera: ['KeyC'], map: ['KeyM'], satchel: ['KeyI'], journal: ['KeyJ'],
  camp: ['KeyB'], pause: ['Escape', 'KeyP'],
  photo: ['KeyK'], // Added in Part 16
});

export const DEFAULT_SETTINGS = Object.freeze({
  quality: 'auto', detectedQuality: null, fpsCap: 30, uiScale: 1,
  sensitivity: 1, touchSensitivity: 1, invertY: false, crouchToggle: true,
  aimAssist: true, cameraShake: 1, haptics: true, subtitles: true,
  targetLock: true, killCam: true, // Added in Part 6
  // Added in Part 14: accessibility, HUD, touch layout, gamepad map and per-option graphics overrides ('auto' = the preset's value)
  subtitleSize: 1, subtitleBackdrop: false, colorblind: false, reduceMotion: false, aimToggle: false, minimap: 'on', hudFade: true,
  leftHanded: false, touchLayout: {}, touchScale: 1, touchOpacity: 1, padbinds: null,
  gfx: { shadows: 'auto', shadowMapSize: 'auto', drawDistance: 'auto', grassRange: 'auto', maxParticles: 'auto', scaleMax: 'auto', textures: 'auto' }, // textures: Part 16
  volumes: { master: 0.9, music: 0.7, sfx: 0.9, ambience: 0.8, ui: 0.7 },
  keybinds: DEFAULT_KEYBINDS,
});

const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function merge(base, over) {
  const out = clone(base);
  if (!isObj(over)) return out;
  for (const k of Object.keys(over)) out[k] = isObj(base[k]) && isObj(over[k]) ? merge(base[k], over[k]) : over[k];
  return out;
}

/** Persistent player settings. get/set take dotted paths, e.g. get('volumes.music'). */
export class Settings {
  constructor(game) {
    this.game = game;
    this.data = clone(DEFAULT_SETTINGS);
    try { const raw = Storage.get(KEY); if (raw) this.data = merge(DEFAULT_SETTINGS, JSON.parse(raw)); }
    catch (err) { console.warn('[settings] saved settings were unreadable; using defaults', err); }
  }
  get(path) {
    let o = this.data;
    for (const p of path.split('.')) { if (o == null) return undefined; o = o[p]; }
    return o;
  }
  set(path, value) {
    const parts = path.split('.');
    let o = this.data;
    for (let i = 0; i < parts.length - 1; i++) { if (!isObj(o[parts[i]])) o[parts[i]] = {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = value;
    Storage.set(KEY, JSON.stringify(this.data));
    this.game?.events?.emit(EVENTS.SETTINGS_CHANGED, { key: path, value });
  }
  reset() {
    const detected = this.data.detectedQuality;
    this.data = clone(DEFAULT_SETTINGS); this.data.detectedQuality = detected;
    Storage.set(KEY, JSON.stringify(this.data));
    this.game?.events?.emit(EVENTS.SETTINGS_CHANGED, { key: '*', value: null });
  }
}
