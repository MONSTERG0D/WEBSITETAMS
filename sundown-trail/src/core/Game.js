import * as THREE from 'three';
import { EventBus } from './EventBus.js';
import { EVENTS } from './Events.js';
import { Settings } from './Settings.js';
import { Input } from './Input.js';
import { CameraRig } from './CameraRig.js';
import { Physics } from './Physics.js';
import { Entities } from './Entities.js';
import { Interaction } from './Interaction.js';
import { UI } from './UI.js';
import { AudioEngine } from './AudioEngine.js';
import Inventory from './Inventory.js';
import Wallet from './Wallet.js';
import { Save } from './Save.js';
import { DebugPanel } from './DebugPanel.js';
import { getFallback } from './Fallbacks.js';
import { PRESETS, benchmark, isTouchDevice } from './Quality.js';
import { WORLD } from '../data/world.js';
import { START_KIT } from '../data/items.js';
import { configureTextureDetail } from '../render/TextureDetail.js';

/** Engine tuning: frame pacing, dynamic resolution, autosave. */
export const TUNING = { dynamicResolution: true, dynResStep: 0.05, dynResEvery: 1, autosaveEvery: 300, pausedRenderFrames: 3 };

/** The game context (Game API, GAME_BIBLE §10). */
export class Game {
  constructor({ canvas, uiRoot, touchRoot, debug = false } = {}) {
    this.canvas = canvas; this.uiRoot = uiRoot; this.touchRoot = touchRoot;
    this.debugMode = debug || new URLSearchParams(location.search).has('debug');
    this.isTouch = isTouchDevice();
    this.events = new EventBus();
    this.settings = new Settings(this);
    this.systems = new Map(); this._ordered = []; this._installed = [];
    this.state = 'boot'; this.timeScale = 1; this.now = 0; this.playtime = 0;
    this.renderScale = 1; this.fps = 0; this.frameMs = 0; this._errors = new Map(); this._dirty = false;
    this.fpsCap = this.settings.get('fpsCap') || 30;
  }

  /** Creates renderer, scene, camera and the core systems. */
  async initCore() {
    this.quality = this._qualityFor(this._presetName());
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.quality.antialias, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1;
    r.shadowMap.enabled = this.quality.shadows;
    this.renderer = r; configureTextureDetail(this); // Part 16: the texture tier, before any system paints a texture
    r.shadowMap.type = this.quality.name === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    r.info.autoReset = false;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xd9c7a2);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 2500);
    this.scene.add(this.camera);
    this.input = new Input(this);
    this.physics = new Physics(this);
    this.entities = new Entities(this);
    this.cameraRig = new CameraRig(this);
    this.interact = new Interaction(this);
    this.ui = new UI(this);
    this.audio = new AudioEngine(this);
    this.save = new Save(this);
    this.register('inventory', new Inventory(this), 1);
    this.register('wallet', new Wallet(this), 2);
    if (this.debugMode) { this.debug = new DebugPanel(this); this.debug.addTuning('Engine', TUNING); window.__game = this; }
    this.renderScale = this.quality.scaleMax;
    this._resize();
    window.addEventListener('resize', () => this._resize());
    window.visualViewport?.addEventListener('resize', () => this._resize());
    document.addEventListener('visibilitychange', () => this._onVisibility());
    this.events.on(EVENTS.SETTINGS_CHANGED, ({ key }) => { if (key === 'fpsCap' || key === '*') this.fpsCap = this.settings.get('fpsCap') || 30; });
    this.events.on(EVENTS.POINTER_UNLOCKED, () => {
      if (this.state === 'playing' && !this.ui.isScreenOpen()) { this.pause(); this._ignorePauseUntil = performance.now() + 300; }
    });
    if (this.settings.get('quality') === 'auto' && !this.settings.get('detectedQuality')) await this.detectQuality(false);
  }

  // ---------- systems ----------
  register(id, system, order = 50) {
    if (this.systems.has(id)) console.warn(`[game] "${id}" registered twice; replacing it`);
    this.systems.set(id, system);
    this._ordered = this._ordered.filter((e) => e.id !== id);
    this._ordered.push({ id, system, order });
    this._ordered.sort((a, b) => a.order - b.order);
    return system;
  }
  get(id) { return this.systems.get(id); }
  /** The real system, or its fallback while it isn't built. Never undefined. */
  sys(id) { return this.systems.get(id) || getFallback(id); }
  get player() { return this.sys('player'); }

  /** Runs init() on every system, installs visual fallbacks for missing modules, warms up shaders. */
  async initModules(manifest = []) {
    for (const { id, system } of this._ordered) {
      if (typeof system.init !== 'function') continue;
      try { await system.init(); } catch (err) { console.error(`[game] ${id}.init failed`, err); }
    }
    for (const m of manifest) {
      if (this.systems.has(m.id)) continue;
      const fb = getFallback(m.id);
      if (!fb.install || fb._installed) continue;
      fb._installed = true;
      try { fb.install(this); this._installed.push(fb); } catch (err) { console.error(`[game] fallback for ${m.id} failed`, err); }
    }
    this.cameraRig.setTarget(this.player);
    try { await this.sys('vfx').warmup?.(); this.renderer.compile(this.scene, this.camera); } catch (err) { console.warn('[game] shader warmup skipped', err); }
  }

  // ---------- quality ----------
  _presetName() {
    const q = this.settings.get('quality');
    if (q && q !== 'auto' && PRESETS[q]) return q;
    return this.settings.get('detectedQuality') || (this.isTouch ? 'medium' : 'high');
  }
  async detectQuality(apply = true) {
    try {
      const { preset, median } = await benchmark(this.renderer);
      this.settings.set('detectedQuality', preset);
      console.info(`[quality] benchmark ${median.toFixed(1)} ms per frame, recommending ${preset}`);
      if (apply || this.settings.get('quality') === 'auto') this.applyQuality();
      return preset;
    } catch (err) { console.warn('[quality] benchmark failed', err); return null; }
  }
  /** Added in Part 14: a preset with the player's per-option overrides from settings.gfx applied. */
  _qualityFor(name) {
    const q = { ...PRESETS[name] }, o = this.settings.get('gfx') || {};
    for (const [k, v] of Object.entries(o)) if (v !== 'auto' && v !== null && v !== undefined && k in q) q[k] = v;
    if (q.scaleMin > q.scaleMax) q.scaleMin = q.scaleMax;
    return q;
  }
  applyQuality() {
    const name = this._presetName(), q = this._qualityFor(name);
    this.quality = q;
    configureTextureDetail(this); // Part 16: the texture tier (painted textures read it when they're built)
    this.renderer.shadowMap.enabled = q.shadows;
    this.scene.traverse((o) => {
      if (o.isLight && o.shadow && o.userData.shadowCaster) { o.castShadow = q.shadows; o.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize); o.shadow.map?.dispose(); o.shadow.map = null; }
      if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true;
    });
    this.renderScale = q.scaleMax;
    this._applyPixelRatio();
    this.events.emit(EVENTS.QUALITY_CHANGED, { preset: name });
  }

  // ---------- loop ----------
  start() {
    const now = performance.now();
    this._last = now; this._lastRender = now; this._prevFrame = now; this._dynT = 0; this._fpsFrames = 0; this._fpsT = 0; this._autosaveT = 0;
    const loop = (t) => { this._raf = requestAnimationFrame(loop); this._tick(t); };
    this._raf = requestAnimationFrame(loop);
  }
  _tick(now) {
    const interval = 1000 / this.fpsCap, since = now - this._lastRender;
    if (since < interval - 1.5) return; // frame limiter: render on an even cadence (every 2nd vsync at 60 Hz for 30 fps)
    this._lastRender = since > interval * 2 ? now : this._lastRender + interval;
    const rawDt = Math.min((now - this._last) / 1000, 0.05), work = performance.now();
    this._last = now;
    const dt = rawDt * this.timeScale;
    this.input.beginFrame(rawDt);
    this._handlePauseInput();
    if (this.state !== 'paused') this.now += rawDt;
    const active = this.state === 'playing' || this.state === 'cutscene' || this.state === 'dead';
    if (this.state === 'playing') { this.playtime += rawDt; this._autosaveT += rawDt; }
    if (active) {
      for (const e of this._ordered) { try { e.system.update?.(dt, rawDt); } catch (err) { this._systemError(e.id, err); } }
    }
    if (active || this.state === 'title') for (const fb of this._installed) fb.update?.(dt, rawDt, this);
    if (this.state === 'title') { try { this.get('characters')?.lateUpdate?.(dt, rawDt); } catch (err) { this._systemError('characters', err); } } // Part 4: people keep breathing on the title screen
    if (active) {
      this.interact.update();
      for (const e of this._ordered) { try { e.system.lateUpdate?.(dt, rawDt); } catch (err) { this._systemError(e.id, err); } }
    }
    if (this.state !== 'paused') this.cameraRig.lateUpdate(dt, rawDt);
    this.audio.update(rawDt);
    this.ui.update(rawDt);
    this.debug?.update(rawDt);
    if (this._autosaveT > TUNING.autosaveEvery) { this._autosaveT = 0; this.save.autosave(); }
    const skipRender = this.state === 'paused' && this._pausedFrames++ > TUNING.pausedRenderFrames;
    if (!skipRender) { this.renderer.info.reset(); this.sys('postfx').render(this); }
    this.input.endFrame();
    this._measure(now, performance.now() - work);
  }
  _handlePauseInput() {
    if (!this.input.pressed('pause') || performance.now() < (this._ignorePauseUntil || 0)) return;
    const top = this.ui.topScreen();
    if (this.state === 'playing' && !top) this.pause();
    else if (this.state === 'paused') { if (top === 'pause') this.resume(); else this.ui.closeScreen(); }
    else if (top && top !== 'title') this.ui.closeScreen();
  }
  _measure(now, workMs) {
    const interval = now - this._prevFrame;
    this._prevFrame = now;
    this.frameMs = this.frameMs * 0.9 + workMs * 0.1;
    this._intervalAvg = this._intervalAvg ? this._intervalAvg * 0.9 + interval * 0.1 : interval;
    this._fpsFrames++; this._fpsT += interval;
    if (this._fpsT >= 1000) { this.fps = (this._fpsFrames * 1000) / this._fpsT; this._fpsFrames = 0; this._fpsT = 0; }
    if (!TUNING.dynamicResolution || this.state !== 'playing') return;
    this._dynT += interval;
    if (this._dynT < TUNING.dynResEvery * 1000) return;
    this._dynT = 0;
    const target = 1000 / this.fpsCap, q = this.quality;
    let s = this.renderScale;
    if (this._intervalAvg > target * 1.12) s = Math.max(q.scaleMin, s - TUNING.dynResStep);
    else if (this._intervalAvg < target * 1.04 && this.frameMs < target * 0.5) s = Math.min(q.scaleMax, s + TUNING.dynResStep / 2);
    if (Math.abs(s - this.renderScale) > 1e-3) { this.renderScale = s; this._applyPixelRatio(); }
  }
  _systemError(id, err) {
    const last = this._errors.get(id) || 0;
    if (this.now - last < 5 && last !== 0) return;
    this._errors.set(id, this.now || 0.001);
    console.error(`[game] ${id} threw during update`, err);
    if (this.debugMode) this.ui.notify(`${id} error: ${err.message}`);
  }

  // ---------- state & flow ----------
  setState(next) {
    const prev = this.state;
    if (prev === next) return;
    this.state = next; this._pausedFrames = 0;
    if (next === 'paused') this.events.emit(EVENTS.GAME_PAUSE, {});
    if (prev === 'paused' && next === 'playing') this.events.emit(EVENTS.GAME_RESUME, {});
    if (next === 'title') this.cameraRig.setMode('cinematic');
    else if (this.cameraRig.mode === 'cinematic') this.cameraRig.setMode('follow');
    this.input.setTouchVisible(next === 'playing' && !this.ui.isScreenOpen());
  }
  /** Shows the title screen, or acts on a pending new-game/load request carried across a reload. */
  enterTitle() {
    const intent = this._consumeIntent();
    if (intent?.action === 'new') return this._startNew();
    if (intent?.action === 'load') return this._startLoad(intent.slot);
    this.setState('title');
    this.ui.closeAll();
    this.ui.openScreen('title');
  }
  newGame() { if (this._dirty) this._reloadWith({ action: 'new' }); else this._startNew(); }
  continueGame() { const latest = this.save.latest(); if (latest) this.loadSlot(latest.slot); }
  loadSlot(slot) { if (this._dirty) this._reloadWith({ action: 'load', slot }); else this._startLoad(slot); }
  quitToTitle() { if (this.state === 'paused' || this.state === 'playing') this.save.autosave(true); this._reloadWith(null); }
  pause() { if (this.state !== 'playing') return; this.setState('paused'); this.ui.openScreen('pause'); }
  resume() { this.ui.closeAll(); this.setState('playing'); this.input.lockPointer(); }
  /** Where new games start: the Fort Granger road once terrain exists, the test ground before that. */
  startPoint() { return this.get('terrain') ? { x: WORLD.start.x, z: WORLD.start.z } : { x: 0, z: 6 }; }
  _startNew() {
    this._dirty = true;
    this.ui.closeAll();
    const inv = this.sys('inventory');
    for (const [id, qty] of START_KIT) inv.add(id, qty);
    const sp = this.startPoint(), pl = this.player;
    pl.spawn?.set(sp.x, 0, sp.z);
    pl.teleport(sp.x, sp.z);
    this.sys('sky').setTime(WORLD.start.hour);
    this.cameraRig.yaw = pl.yaw || 0; this.cameraRig.snap();
    this.setState('playing');
    this.events.emit(EVENTS.GAME_START, { newGame: true });
    this.ui.notify(this.isTouch ? 'Left thumb moves, right thumb looks.' : 'Click to look around. WASD to move, Shift to run.');
    this.input.lockPointer();
    this.save.autosave(true);
  }
  _startLoad(slot) {
    this._dirty = true;
    this.ui.closeAll();
    if (!this.save.load(slot)) {
      this.ui.notify('That save could not be read. It may be from an incompatible version.');
      this.setState('title'); this.ui.openScreen('title');
      return;
    }
    this.cameraRig.snap();
    this.setState('playing');
    this.events.emit(EVENTS.GAME_START, { newGame: false, slot });
    this.input.lockPointer();
  }
  _reloadWith(intent) {
    try { if (intent) sessionStorage.setItem('sd.intent', JSON.stringify(intent)); else sessionStorage.removeItem('sd.intent'); } catch { /* private mode */ }
    location.reload();
  }
  _consumeIntent() {
    try { const raw = sessionStorage.getItem('sd.intent'); sessionStorage.removeItem('sd.intent'); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }

  // ---------- platform ----------
  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w; this.height = h;
    this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix();
    this._applyPixelRatio();
  }
  _applyPixelRatio() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality.dprCap);
    this.renderer.setPixelRatio(dpr * this.renderScale);
    this.renderer.setSize(this.width || window.innerWidth, this.height || window.innerHeight, false);
  }
  _onVisibility() {
    if (document.hidden) { if (this.state === 'playing') this.pause(); this.audio.suspend(); }
    else this.audio.resume();
  }
}
