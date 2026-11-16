import * as THREE from 'three';
import System from '../core/System.js';
import { TUNING as PFX } from '../render/PostFX.js';

/**
 * Photo mode (Part 16). K, or Photo mode in the pause menu. Leaving (Esc, B, K, Close) puts everything back.
 *  Camera   a free camera that starts where the game camera was, on a 40 m leash round Eli, never under the ground
 *           or through a wall. Keyboard: WASD move, Space / Ctrl up and down, Shift faster, drag to look, wheel to
 *           zoom, Q / E roll. Gamepad: sticks, LB / RB down and up, LT / RT zoom, A take, Y panel, B leave,
 *           D-pad left / right filter. Touch: drag the left of the screen to move, the right to look, pinch to zoom,
 *           the ▲ ▼ buttons to rise and sink.
 *  Look     filters Natural, Warm, Cold, Noir, Sepia and Tintype, then exposure, contrast, saturation, vignette and
 *           grain on top; depth of field on High (tap the scene to focus); time of day; freeze time (the default);
 *           hide Eli; a rule-of-thirds grid.
 *  Photo    Take photo (F, A, the button): the HUD and panel never show, a shutter and a flash after. Optional
 *           parchment border with a caption ("Ashwater County, 1899" unless you write your own), screen or 2× size.
 *           Downloads a PNG (or opens the share sheet on phones that can share files).
 * API: open(), close(), active, setFilter(name), capture({ border, caption, size, save }) → Promise<{ blob, width,
 *   height }>, take() (capture with the panel's options, then download/share), last.
 */
export const TUNING = {
  leash: 40, ceiling: 30, minAboveGround: 0.4, wallPadding: 0.3,
  moveSpeed: 5, fastMultiplier: 3.5, verticalSpeed: 3, rollSpeed: 40, zoomSpeed: 30,
  dragLook: 0.0042, touchLook: 0.006, pitchLimit: 1.45, stickRadius: 60, stickZone: 0.42,
  fovMin: 12, fovMax: 90, rollMax: 35, wheelStep: 2.5,
  freezeByDefault: true, caption: 'Ashwater County, 1899', border: 0.055, captionSize: 0.042,
  maxCaptureWidth: 4096, largeScale: 2, flashSeconds: 0.45, flashStrength: 0.7, tapSlop: 7, tapMs: 320,
  dofMin: 0.5, dofMax: 120,
};

/** Filters: a PostFX grade plus the slider values it starts from. */
export const FILTERS = {
  natural: { label: 'Natural', grade: 'auto', exposure: 1, contrast: 1, saturation: 1, vignette: 0.32, grain: 0.035 },
  warm: { label: 'Warm', grade: 'warm', exposure: 1, contrast: 1.03, saturation: 1.05, vignette: 0.38, grain: 0.04 },
  cold: { label: 'Cold', grade: 'cold', exposure: 0.98, contrast: 1.04, saturation: 0.92, vignette: 0.38, grain: 0.04 },
  noir: { label: 'Noir', grade: 'noir', exposure: 1, contrast: 1.08, saturation: 1, vignette: 0.55, grain: 0.07 },
  sepia: { label: 'Sepia', grade: 'sepia', exposure: 1.02, contrast: 1.02, saturation: 1, vignette: 0.6, grain: 0.08 },
  tintype: { label: 'Tintype', grade: 'tintype', exposure: 0.96, contrast: 1.12, saturation: 1, vignette: 0.85, grain: 0.11 },
};
const LOOK = [['exposure', 'Exposure', 0.4, 2, 0.01], ['contrast', 'Contrast', 0.6, 1.6, 0.01], ['saturation', 'Saturation', 0, 1.8, 0.01], ['vignette', 'Vignette', 0, 1.2, 0.01], ['grain', 'Grain', 0, 0.25, 0.005]];
const SAVED_PFX = ['exposure', 'contrast', 'saturation', 'vignette', 'grain', 'motionBlur'];
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clock = (h) => { const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60); return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`; };
const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _a = new THREE.Vector3(), _ndc = new THREE.Vector2();
const _ray = new THREE.Raycaster();

export default class PhotoMode extends System {
  constructor(game) {
    super(game);
    this.open_ = false; this.last = null; this.stats = { photos: 0, opened: 0 };
    this.opt = { filter: 'natural', freeze: TUNING.freezeByDefault, hideEli: false, grid: false, border: true, caption: TUNING.caption, size: 'screen', dof: false, dofDistance: 6, dofRange: 4 };
    this.look = { ...FILTERS.natural };
    this.cam = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, fov: 50 };
    this._ptr = new Map(); this._drag = { x: 0, y: 0 }; this._stick = { x: 0, y: 0 }; this._pinch = 0; this._hold = { up: false, down: false };
  }
  get active() { return this.open_; }

  async init() {
    const g = this.game;
    g.ui.registerScreen('photo', { toggle: 'photo', nav: false, build: () => this._build(), onClose: () => this._restore(), update: (rawDt) => this._screenUpdate(rawDt) });
    this._onKey = (e) => {
      if (!this.open_ || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.repeat) return;
      if (e.code === 'KeyF') { e.preventDefault(); this.take(); }
      else if (e.code === 'Space' && e.target instanceof HTMLButtonElement) e.preventDefault(); // Space rises, it doesn't press the focused button
    };
    window.addEventListener('keydown', this._onKey, true);
  }
  dispose() { if (this.open_) this.close(); window.removeEventListener('keydown', this._onKey, true); }

  update() {
    const g = this.game;
    if (!this.open_ && g.input.pressed('photo') && this.canOpen()) this.open();
  }
  canOpen() {
    const g = this.game;
    return g.state === 'playing' && !g.ui.isScreenOpen() && !g.cameraRig.override && g.player?.state !== 'dead' && !g.get('missions')?.duel?.active;
  }

  // ---------------------------------------------------------------- enter / leave
  open() {
    const g = this.game;
    if (this.open_) return true;
    if (g.state === 'paused') g.resume();
    if (!this.canOpen()) return false;
    const pfx = g.get('postfx'), sky = g.get('sky'), pl = g.player, cam = g.camera;
    this.saved = {
      timeScale: g.timeScale, pfx: Object.fromEntries(SAVED_PFX.map((k) => [k, PFX[k]])), grade: pfx?.gradeName || 'auto', dof: pfx ? { ...pfx.dof } : null,
      fov: cam.fov, order: cam.rotation.order, rigFov: g.cameraRig.fov, visible: pl?.object3d?.visible ?? true, god: !!pl?.godMode, time: sky?.timeOfDay, shift: 0,
    };
    cam.getWorldDirection(_d);
    Object.assign(this.cam, { yaw: Math.atan2(-_d.x, -_d.z), pitch: Math.asin(clamp(_d.y, -1, 1)), roll: 0, fov: cam.fov }); this.cam.pos.copy(cam.position);
    this.opt.dofDistance = Math.max(1, cam.position.distanceTo(pl.position) + 0.2);
    this.opt.freeze = TUNING.freezeByDefault; this.opt.hideEli = false; // each visit starts with the world held still and Eli in it; the look and the photo options carry over
    this.open_ = true; this.stats.opened++;
    if (pl) pl.godMode = true; // nothing can hurt Eli while you frame a picture
    PFX.motionBlur = 0;
    this.override = Object.assign((c, rawDt) => this._camera(c, rawDt), { ownsFov: true });
    g.cameraRig.override = this.override;
    g.setState('cutscene');
    g.ui.root.classList.add('sd-photo');
    this._applyAll();
    g.ui.openScreen('photo');
    g.audio?.play('ui_open');
    return true;
  }
  close() { if (this.open_ && this.game.ui.topScreen() === 'photo') this.game.ui.closeScreen(); else if (this.open_) this._restore(); }
  _restore() {
    if (!this.open_) return;
    const g = this.game, s = this.saved, pfx = g.get('postfx'), sky = g.get('sky'), pl = g.player, cam = g.camera;
    this.open_ = false;
    g.timeScale = s.timeScale;
    Object.assign(PFX, s.pfx);
    if (pfx) { this._grade(s.grade); if (s.dof) pfx.setDOF(s.dof); }
    if (sky && s.shift) sky.setTime(sky.timeOfDay - s.shift);
    if (pl) { if (pl.object3d) pl.object3d.visible = s.visible; pl.godMode = s.god; }
    if (g.cameraRig.override === this.override) g.cameraRig.override = null;
    cam.rotation.order = s.order; cam.fov = s.fov; cam.updateProjectionMatrix(); g.cameraRig.fov = s.rigFov; g.cameraRig.snap();
    g.ui.root.classList.remove('sd-photo');
    if (g.state === 'cutscene') g.setState('playing');
    if (g.state === 'playing' && !g.ui.isScreenOpen()) g.input.setTouchVisible(true);
    this._ptr.clear(); this._stick.x = this._stick.y = 0; this._hold.up = this._hold.down = false;
    this.root = null;
  }

  // ---------------------------------------------------------------- look
  setFilter(name) {
    const f = FILTERS[name]; if (!f) return;
    this.opt.filter = name; Object.assign(this.look, f);
    this._applyAll(); this._sync();
  }
  _grade(name) {
    const pfx = this.game.get('postfx'); if (!pfx) return;
    pfx.setGrade(name);
    if (pfx.gradeName === name && pfx._gradeTarget) pfx.grade = structuredClone(pfx._gradeTarget); // photo mode wants the change now, not blended
  }
  _applyAll() {
    const g = this.game, pfx = g.get('postfx'), L = this.look, o = this.opt, pl = g.player;
    this._grade(FILTERS[o.filter].grade);
    PFX.exposure = this.saved.pfx.exposure * L.exposure; PFX.contrast = this.saved.pfx.contrast * L.contrast; PFX.saturation = this.saved.pfx.saturation * L.saturation;
    PFX.vignette = L.vignette; PFX.grain = L.grain;
    g.timeScale = o.freeze ? 0 : this.saved.timeScale || 1;
    if (pl?.object3d) pl.object3d.visible = o.hideEli ? false : this.saved.visible;
    pfx?.setDOF({ enabled: o.dof && this.dofAvailable, distance: o.dofDistance, range: o.dofRange, amount: 1 });
  }
  get dofAvailable() { return !!this.game.get('postfx')?._tier?.dof; }

  // ---------------------------------------------------------------- the free camera
  _camera(cam, rawDt) {
    const g = this.game, inp = g.input, C = this.cam, pad = inp.device === 'gamepad';
    if (!this.open_) return;
    const zoomK = C.fov / 50;
    // look: drag (mouse / touch), the right stick, a locked mouse
    C.yaw -= this._drag.x * TUNING.dragLook * zoomK + inp.look.x * zoomK;
    C.pitch = clamp(C.pitch - this._drag.y * TUNING.dragLook * zoomK - inp.look.y * zoomK, -TUNING.pitchLimit, TUNING.pitchLimit);
    this._drag.x = this._drag.y = 0;
    // zoom and roll
    if (pad) { if (inp.isDown('aim')) C.fov += TUNING.zoomSpeed * rawDt; if (inp.isDown('fire')) C.fov -= TUNING.zoomSpeed * rawDt; }
    if (this._pinch) { C.fov /= this._pinch; this._pinch = 0; }
    if (!pad) { if (inp.isDown('social')) C.roll -= TUNING.rollSpeed * rawDt; if (inp.isDown('interact')) C.roll += TUNING.rollSpeed * rawDt; }
    C.fov = clamp(C.fov, TUNING.fovMin, TUNING.fovMax); C.roll = clamp(C.roll, -TUNING.rollMax, TUNING.rollMax);
    // move: flat on the yaw, rise and sink apart
    let mx = inp.move.x, my = inp.move.y;
    if (Math.hypot(this._stick.x, this._stick.y) > Math.hypot(mx, my)) { mx = this._stick.x; my = this._stick.y; }
    let up = (inp.isDown('jump') && !pad ? 1 : 0) - (inp.isDown('crouch') && !pad ? 1 : 0) + (this._hold.up ? 1 : 0) - (this._hold.down ? 1 : 0);
    if (pad) up += (inp.isDown('reload') ? 1 : 0) - (inp.isDown('weaponWheel') ? 1 : 0);
    const speed = TUNING.moveSpeed * (inp.isDown('sprint') ? TUNING.fastMultiplier : 1) * rawDt;
    const fx = -Math.sin(C.yaw), fz = -Math.cos(C.yaw), rx = Math.cos(C.yaw), rz = -Math.sin(C.yaw);
    _d.set((fx * my + rx * mx) * speed, clamp(up, -1, 1) * TUNING.verticalSpeed * rawDt * (inp.isDown('sprint') ? 2 : 1), (fz * my + rz * mx) * speed);
    if (_d.lengthSq() > 1e-10) this._move(_d);
    this._clamp(C.pos);
    cam.position.copy(C.pos);
    cam.rotation.order = 'YXZ'; cam.rotation.set(C.pitch, C.yaw, THREE.MathUtils.degToRad(C.roll));
    if (Math.abs(cam.fov - C.fov) > 0.01) { cam.fov = C.fov; cam.updateProjectionMatrix(); }
  }
  /** Moves by `delta`, sliding along walls (axis by axis) instead of passing through them. */
  _move(delta) {
    const P = this.game.physics, C = this.cam;
    const tryStep = (v) => {
      const len = v.length(); if (len < 1e-6) return;
      _a.copy(v).divideScalar(len);
      const hit = P?.raycast?.(C.pos, _a, len + TUNING.wallPadding, { ignoreEntities: true });
      if (!hit || hit.distance > len + TUNING.wallPadding - 1e-4) C.pos.add(v);
    };
    _p.copy(delta); tryStep(_p.set(delta.x, 0, 0)); tryStep(_p.set(0, 0, delta.z)); tryStep(_p.set(0, delta.y, 0));
  }
  _clamp(p) {
    const g = this.game, pl = g.player, T = g.sys('terrain');
    const ax = pl.position.x, ay = pl.position.y + 1.5, az = pl.position.z;
    _a.set(p.x - ax, p.y - ay, p.z - az);
    if (_a.length() > TUNING.leash) { _a.setLength(TUNING.leash); p.set(ax + _a.x, ay + _a.y, az + _a.z); }
    p.y = Math.min(p.y, ay + TUNING.ceiling);
    const ground = T?.getHeightAt?.(p.x, p.z);
    if (ground !== undefined && p.y < ground + TUNING.minAboveGround) p.y = ground + TUNING.minAboveGround;
  }

  // ---------------------------------------------------------------- the screen
  _screenUpdate(rawDt) {
    const g = this.game, inp = g.input;
    if (!this.open_) return;
    if (g.cameraRig.override !== this.override || g.state === 'dead' || g.state === 'title') { // something else took the camera (a mission cutscene): step aside
      if (g.cameraRig.override === this.override) g.cameraRig.override = null;
      this.override = null; g.ui.closeScreen(); return;
    }
    if (inp.device === 'gamepad') {
      if (inp.pressed('jump')) this.take();
      if (inp.pressed('satchel') || inp.pressed('camera')) { const k = Object.keys(FILTERS), i = k.indexOf(this.opt.filter); this.setFilter(k[(i + (inp.pressed('camera') ? 1 : k.length - 1)) % k.length]); }
      if (inp.pressed('social')) { this.opt.freeze = !this.opt.freeze; this._applyAll(); this._sync(); }
      if (inp.pressed('holster')) { this.opt.hideEli = !this.opt.hideEli; this._applyAll(); this._sync(); }
    }
    if (inp.pressed('whistle')) this._collapse();
    this._syncT = (this._syncT || 0) - rawDt;
    if (this._syncT <= 0) { this._syncT = 0.15; this._sync(true); }
    if (this.touchEls) this.touchEls.hidden = inp.device !== 'touch' && !this._touchSeen;
  }
  _collapse(force) { if (!this.root) return; const c = force ?? !this.root.classList.contains('sd-collapsed'); this.root.classList.toggle('sd-collapsed', c); this.collapseBtn.textContent = c ? '‹' : '›'; this.collapseBtn.title = c ? 'Show the panel' : 'Hide the panel'; }

  _build() {
    const g = this.game, ui = g.ui, root = el('div', 'sd-photo-wrap'); this.root = root; this.ctl = {};
    // the scene surface: drag to look, left side moves on touch, pinch zooms, tap focuses
    const surface = el('div', 'sd-photo-surface'); root.append(surface);
    this.gridEl = el('div', 'sd-photo-grid'); this.focusEl = el('div', 'sd-photo-focus'); this.stickEl = el('div', 'sd-photo-stick'); this.stickEl.append(el('i'));
    surface.append(this.gridEl, this.focusEl, this.stickEl);
    this._bindSurface(surface);
    // touch rise / sink
    const tb = el('div', 'sd-photo-touch'); this.touchEls = tb; tb.hidden = true;
    for (const [k, label] of [['up', '▲'], ['down', '▼']]) {
      const b = el('button', 'sd-button sd-photo-hold', label); b.type = 'button'; b.setAttribute('aria-label', k === 'up' ? 'Rise' : 'Sink');
      const on = (v) => (e) => { e.preventDefault(); this._hold[k] = v; };
      b.addEventListener('pointerdown', on(true)); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, on(false));
      tb.append(b);
    }
    const snap = el('button', 'sd-button sd-primary sd-photo-snap', '◉'); snap.type = 'button'; snap.setAttribute('aria-label', 'Take photo'); snap.addEventListener('click', () => this.take());
    tb.append(snap); root.append(tb);
    // the panel
    const p = el('aside', 'sd-panel sd-photo-panel'); root.append(p);
    const head = el('div', 'sd-photo-head'); head.append(el('h2', 'sd-title', 'Photo mode'));
    this.collapseBtn = el('button', 'sd-button sd-photo-collapse', '›'); this.collapseBtn.type = 'button'; this.collapseBtn.title = 'Hide the panel'; this.collapseBtn.addEventListener('click', () => this._collapse());
    head.append(this.collapseBtn); p.append(head);
    const body = el('div', 'sd-photo-body'); p.append(body);
    const section = (t) => { body.append(el('h3', 'sd-photo-h', t)); };
    const row = (label, control) => { const r = el('label', 'sd-row sd-photo-row'); r.append(el('span', 'sd-row-label', label), control); body.append(r); return r; };
    const slider = (key, min, max, step, get, set, fmt) => {
      const w = el('span', 'sd-slider'), i = el('input'), o = el('output'); i.type = 'range'; i.min = min; i.max = max; i.step = step;
      i.addEventListener('input', () => { set(Number(i.value)); o.textContent = fmt(Number(i.value)); });
      i.addEventListener('change', () => i.blur());
      w.append(i, o); this.ctl[key] = { i, o, get, fmt }; return w;
    };
    const check = (key, get, set) => { const i = el('input'); i.type = 'checkbox'; i.addEventListener('change', () => { set(i.checked); i.blur(); }); this.ctl[key] = { i, get, check: true }; return i; };
    // camera
    section('Camera');
    row('Zoom', slider('fov', TUNING.fovMin, TUNING.fovMax, 1, () => this.cam.fov, (v) => { this.cam.fov = v; }, (v) => `${Math.round(v)}°`));
    row('Tilt', slider('roll', -TUNING.rollMax, TUNING.rollMax, 0.5, () => this.cam.roll, (v) => { this.cam.roll = v; }, (v) => `${v > 0 ? '+' : ''}${Math.round(v)}°`));
    const camBtns = el('div', 'sd-photo-btns');
    camBtns.append(ui.button('Level', () => { this.cam.roll = 0; this._sync(); }), ui.button('Back to Eli', () => this._reframe()));
    body.append(camBtns);
    // filters
    section('Filter');
    const chips = el('div', 'sd-photo-chips'); this.chips = new Map();
    for (const [k, f] of Object.entries(FILTERS)) { const b = ui.button(f.label, () => { this.setFilter(k); b.blur(); }, { className: 'sd-photo-chip' }); this.chips.set(k, b); chips.append(b); }
    body.append(chips);
    for (const [k, label, min, max, step] of LOOK) row(label, slider(k, min, max, step, () => this.look[k], (v) => { this.look[k] = v; this._applyAll(); }, (v) => (k === 'grain' ? v.toFixed(3) : v.toFixed(2))));
    // depth of field
    section('Depth of field');
    if (this.dofAvailable) {
      row('On', check('dof', () => this.opt.dof, (v) => { this.opt.dof = v; this._applyAll(); }));
      const toS = (d) => Math.log(d / TUNING.dofMin) / Math.log(TUNING.dofMax / TUNING.dofMin), fromS = (s) => TUNING.dofMin * Math.pow(TUNING.dofMax / TUNING.dofMin, s);
      row('Focus', slider('dofDistance', 0, 1, 0.001, () => toS(this.opt.dofDistance), (s) => { this.opt.dofDistance = fromS(s); this._applyAll(); }, (s) => `${fromS(s) < 10 ? fromS(s).toFixed(1) : Math.round(fromS(s))} m`));
      row('Depth', slider('dofRange', 0.5, 30, 0.1, () => this.opt.dofRange, (v) => { this.opt.dofRange = v; this._applyAll(); }, (v) => `${v.toFixed(1)} m`));
      body.append(el('p', 'sd-hint sd-photo-note', 'Tap or click the scene to focus on what\'s there.'));
    } else body.append(el('p', 'sd-hint sd-photo-note', 'Needs the High graphics preset (Settings › Graphics).'));
    // world
    section('World');
    row('Freeze time', check('freeze', () => this.opt.freeze, (v) => { this.opt.freeze = v; this._applyAll(); }));
    row('Time of day', slider('time', 0, 23.75, 0.25, () => g.get('sky')?.timeOfDay ?? 12, (v) => this._setTime(v), clock));
    row('Hide Eli', check('hideEli', () => this.opt.hideEli, (v) => { this.opt.hideEli = v; this._applyAll(); }));
    row('Grid', check('grid', () => this.opt.grid, (v) => { this.opt.grid = v; this._sync(); }));
    // the photo
    section('Photo');
    row('Parchment border', check('border', () => this.opt.border, (v) => { this.opt.border = v; this._sync(); }));
    const cap = el('input', 'sd-photo-caption'); cap.type = 'text'; cap.maxLength = 60; cap.placeholder = TUNING.caption; cap.value = this.opt.caption === TUNING.caption ? '' : this.opt.caption;
    cap.addEventListener('input', () => { this.opt.caption = cap.value.trim() || TUNING.caption; });
    cap.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cap.blur(); } });
    this.captionRow = row('Caption', cap);
    const size = el('select', 'sd-photo-size');
    for (const [v, t] of [['screen', 'Screen'], ['large', 'Large (2×)']]) { const o = el('option', null, t); o.value = v; size.append(o); }
    size.value = this.opt.size; size.addEventListener('change', () => { this.opt.size = size.value; size.blur(); this._sync(); });
    row('Size', size); this.sizeOut = el('p', 'sd-hint sd-photo-note'); body.append(this.sizeOut);
    const foot = el('div', 'sd-photo-foot');
    this.takeBtn = ui.button('Take photo', () => this.take(), { primary: true }); this.takeBtn.title = 'F · A';
    foot.append(this.takeBtn, ui.button('Close', () => g.ui.closeScreen()));
    p.append(foot, this.helpEl = el('p', 'sd-hint sd-photo-help'));
    this.thumb = el('img', 'sd-photo-thumb'); this.thumb.alt = 'Last photo'; this.thumb.hidden = true; root.append(this.thumb);
    queueMicrotask(() => this._sync());
    return root;
  }
  /** Brings the panel up to date (most of it only when `light` is false). */
  _sync(light = false) {
    if (!this.root) return;
    for (const [k, c] of Object.entries(this.ctl)) {
      if (c.check) { c.i.checked = !!c.get(); continue; }
      if (document.activeElement === c.i) continue;
      const v = c.get(); if (Math.abs(Number(c.i.value) - v) > 1e-4) c.i.value = v; c.o.textContent = c.fmt(Number(c.i.value));
    }
    if (light) return;
    for (const [k, b] of this.chips) b.classList.toggle('sd-on', k === this.opt.filter);
    this.gridEl.hidden = !this.opt.grid;
    this.captionRow.hidden = !this.opt.border;
    const [w, h] = this._captureSize(); this.sizeOut.textContent = `${w} × ${h} pixels${this.opt.border ? ', plus the border' : ''}.`;
    const d = this.game.input.device;
    this.helpEl.textContent = d === 'gamepad' ? 'Sticks move and look · LB / RB sink and rise · LT / RT zoom · A take · Y panel · D-pad: filter, freeze, hide Eli · B leave'
      : d === 'touch' ? 'Drag left to move, right to look · pinch to zoom · ▲ ▼ rise and sink · ◉ take'
        : 'WASD move · drag to look · Space / Ctrl up and down · Shift faster · wheel zoom · Q / E tilt · F take · H panel · Esc leave';
  }
  _setTime(h) {
    const sky = this.game.get('sky'); if (!sky) return;
    const before = sky.timeOfDay; sky.setTime(h);
    let d = sky.timeOfDay - before; if (d > 12) d -= 24; if (d < -12) d += 24;
    this.saved.shift += d;
  }
  _reframe() {
    const g = this.game, pl = g.player, C = this.cam;
    const back = 4.5, fx = -Math.sin(pl.yaw ?? C.yaw), fz = -Math.cos(pl.yaw ?? C.yaw);
    C.pos.set(pl.position.x - fx * back, pl.position.y + 1.8, pl.position.z - fz * back);
    _d.set(pl.position.x - C.pos.x, 0, pl.position.z - C.pos.z); C.yaw = Math.atan2(-_d.x, -_d.z); C.pitch = -0.12; C.roll = 0; C.fov = 50;
    this.opt.dofDistance = back; this._applyAll(); this._sync();
  }

  // ---------------------------------------------------------------- pointer handling
  _bindSurface(s) {
    s.addEventListener('pointerdown', (e) => {
      if (e.button > 2) return;
      e.preventDefault(); s.setPointerCapture?.(e.pointerId);
      const touch = e.pointerType === 'touch'; if (touch) this._touchSeen = true;
      const role = touch && e.clientX < window.innerWidth * TUNING.stickZone && ![...this._ptr.values()].some((q) => q.role === 'stick') ? 'stick' : 'look';
      this._ptr.set(e.pointerId, { role, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), touch, moved: 0 });
      if (role === 'stick') { this.stickEl.style.left = `${e.clientX}px`; this.stickEl.style.top = `${e.clientY}px`; this.stickEl.classList.add('sd-on'); }
      if (this._lookers().length === 2) this._pinchD = this._pinchDist();
    });
    s.addEventListener('pointermove', (e) => {
      const q = this._ptr.get(e.pointerId); if (!q) return;
      const dx = e.clientX - q.x, dy = e.clientY - q.y; q.x = e.clientX; q.y = e.clientY; q.moved += Math.abs(dx) + Math.abs(dy);
      if (q.role === 'stick') {
        let sx = (q.x - q.x0) / TUNING.stickRadius, sy = -(q.y - q.y0) / TUNING.stickRadius; const l = Math.hypot(sx, sy); if (l > 1) { sx /= l; sy /= l; }
        this._stick.x = sx; this._stick.y = sy; this.stickEl.firstChild.style.transform = `translate(${sx * TUNING.stickRadius}px, ${-sy * TUNING.stickRadius}px)`;
        return;
      }
      const lookers = this._lookers();
      if (lookers.length >= 2) { const d = this._pinchDist(); if (this._pinchD > 0 && d > 0) this._pinch = (this._pinch || 1) * (d / this._pinchD); this._pinchD = d; return; }
      const k = q.touch ? TUNING.touchLook / TUNING.dragLook : 1;
      this._drag.x += dx * k; this._drag.y += dy * k;
    });
    const end = (e) => {
      const q = this._ptr.get(e.pointerId); if (!q) return;
      this._ptr.delete(e.pointerId);
      if (q.role === 'stick') { this._stick.x = this._stick.y = 0; this.stickEl.classList.remove('sd-on'); this.stickEl.firstChild.style.transform = ''; }
      else if (e.type === 'pointerup' && q.moved < TUNING.tapSlop && performance.now() - q.t0 < TUNING.tapMs && !this._lookers().length) this._tapFocus(e.clientX, e.clientY);
      this._pinchD = this._lookers().length >= 2 ? this._pinchDist() : 0;
    };
    s.addEventListener('pointerup', end); s.addEventListener('pointercancel', end);
    s.addEventListener('wheel', (e) => { e.preventDefault(); this.cam.fov = clamp(this.cam.fov + Math.sign(e.deltaY) * TUNING.wheelStep, TUNING.fovMin, TUNING.fovMax); }, { passive: false });
    s.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  _lookers() { return [...this._ptr.values()].filter((q) => q.role === 'look'); }
  _pinchDist() { const l = this._lookers(); return l.length >= 2 ? Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y) : 0; }
  /** Focus the depth of field on whatever is under a screen point. */
  _tapFocus(x, y) {
    if (!this.opt.dof || !this.dofAvailable) return;
    const g = this.game, d = this.distanceAt(x / window.innerWidth, y / window.innerHeight);
    if (!(d > 0)) return;
    this.opt.dofDistance = clamp(d, TUNING.dofMin, TUNING.dofMax); this._applyAll(); this._sync();
    this.focusEl.style.left = `${x}px`; this.focusEl.style.top = `${y}px`; this.focusEl.classList.remove('sd-on'); void this.focusEl.offsetWidth; this.focusEl.classList.add('sd-on');
    g.audio?.play('ui_tick');
  }
  /** Distance from the camera to the first thing under a screen point (u, v in 0..1), or null. */
  distanceAt(u, v) {
    const g = this.game, cam = g.camera;
    cam.updateMatrixWorld(); _ndc.set(u * 2 - 1, -(v * 2 - 1)); _ray.setFromCamera(_ndc, cam);
    const o = _ray.ray.origin, dir = _ray.ray.direction;
    let best = Infinity;
    const a = g.physics?.raycast?.(o, dir, 400); if (a && a.distance < best) best = a.distance;
    const b = g.sys('terrain')?.raycast?.(o, dir, 400); if (b && b.distance < best) best = b.distance;
    const ents = []; for (const e of g.entities?.list || []) if (e.object3d?.visible && e.position && e.position.distanceToSquared(o) < 160000) ents.push(e.object3d);
    if (ents.length) { const hit = _ray.intersectObjects(ents, true).find((h) => h.object.visible); if (hit && hit.distance < best) best = hit.distance; }
    // the depth of field measures along the view axis, not the ray
    cam.getWorldDirection(_a);
    return Number.isFinite(best) ? best * Math.max(0.05, dir.dot(_a)) : null;
  }

  // ---------------------------------------------------------------- capture
  _captureSize() {
    const c = this.game.renderer.domElement, k = this.opt.size === 'large' ? Math.min(TUNING.largeScale, TUNING.maxCaptureWidth / Math.max(1, c.width)) : 1;
    return [Math.round(c.width * Math.max(1, k)), Math.round(c.height * Math.max(1, k))];
  }
  /**
   * Renders one clean frame (no HUD, no panel) and returns it as a PNG blob, with the parchment border and caption
   * if asked. { border, caption, size: 'screen'|'large', save } — save downloads (or shares) it too.
   */
  async capture({ border = this.opt.border, caption = this.opt.caption, size = this.opt.size, save = false } = {}) {
    const g = this.game, r = g.renderer, pfx = g.sys('postfx'), c = r.domElement;
    const pr = r.getPixelRatio(), k = size === 'large' ? Math.min(TUNING.largeScale, TUNING.maxCaptureWidth / Math.max(1, c.width)) : 1;
    let shot;
    try {
      if (k > 1.05) r.setPixelRatio(pr * k);
      if (pfx?.render) pfx.render(g); else r.render(g.scene, g.camera);
      shot = document.createElement('canvas'); shot.width = c.width; shot.height = c.height;
      shot.getContext('2d').drawImage(c, 0, 0); // copied in the same task as the render, so the drawing buffer is still there
    } finally { if (k > 1.05) g._applyPixelRatio?.() ?? r.setPixelRatio(pr); }
    const out = border ? await this._frame(shot, caption) : shot;
    const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
    this.last = { blob, width: out.width, height: out.height, border: !!border, caption };
    this.stats.photos++;
    if (save && blob) await this._save(blob);
    return this.last;
  }
  /** Mounts a shot on parchment: an even margin, a thin inked line, a deckled edge and the caption beneath. */
  async _frame(shot, caption) {
    const W = shot.width, H = shot.height, m = Math.round(Math.min(W, H) * TUNING.border * 1.6), capH = Math.round(Math.min(W, H) * TUNING.captionSize * 2.4);
    const out = document.createElement('canvas'); out.width = W + m * 2; out.height = H + m * 2 + capH;
    const x = out.getContext('2d'), OW = out.width, OH = out.height;
    // parchment: base, warm blotches, darker edges, fibres
    x.fillStyle = '#e3d3ad'; x.fillRect(0, 0, OW, OH);
    let seed = 1899; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 90; i++) { const px = rnd() * OW, py = rnd() * OH, rr = (0.04 + rnd() * 0.16) * Math.max(OW, OH); const gr = x.createRadialGradient(px, py, 0, px, py, rr); gr.addColorStop(0, `rgba(${150 + rnd() * 40 | 0}, ${110 + rnd() * 30 | 0}, 60, ${0.03 + rnd() * 0.05})`); gr.addColorStop(1, 'rgba(150,110,60,0)'); x.fillStyle = gr; x.fillRect(0, 0, OW, OH); }
    const edge = x.createRadialGradient(OW / 2, OH / 2, Math.min(OW, OH) * 0.35, OW / 2, OH / 2, Math.hypot(OW, OH) * 0.55); edge.addColorStop(0, 'rgba(90,60,25,0)'); edge.addColorStop(1, 'rgba(90,60,25,0.38)'); x.fillStyle = edge; x.fillRect(0, 0, OW, OH);
    x.strokeStyle = 'rgba(70,48,24,0.06)'; x.lineWidth = Math.max(1, OW / 1600);
    for (let i = 0; i < 700; i++) { const px = rnd() * OW, py = rnd() * OH, a = rnd() * Math.PI, l = 4 + rnd() * OW * 0.012; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
    // the print, with a soft shadow and an inked keyline
    x.save(); x.shadowColor = 'rgba(40,25,10,0.45)'; x.shadowBlur = m * 0.25; x.shadowOffsetY = m * 0.06; x.fillStyle = '#2a1d12'; x.fillRect(m, m, W, H); x.restore();
    x.drawImage(shot, m, m);
    x.strokeStyle = 'rgba(43,29,18,0.85)'; x.lineWidth = Math.max(1.5, m * 0.04); x.strokeRect(m - x.lineWidth * 2, m - x.lineWidth * 2, W + x.lineWidth * 4, H + x.lineWidth * 4);
    // deckled edge: nibble the outline
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000';
    const nib = Math.max(2, m * 0.06);
    for (let t = 0; t < OW; t += nib * 0.8) { x.beginPath(); x.arc(t, 0, nib * (0.4 + rnd()), 0, 7); x.arc(t, OH, nib * (0.4 + rnd()), 0, 7); x.fill(); }
    for (let t = 0; t < OH; t += nib * 0.8) { x.beginPath(); x.arc(0, t, nib * (0.4 + rnd()), 0, 7); x.arc(OW, t, nib * (0.4 + rnd()), 0, 7); x.fill(); }
    x.globalCompositeOperation = 'source-over';
    // caption
    const fs = Math.round(Math.min(W, H) * TUNING.captionSize);
    try { await document.fonts?.load?.(`${fs}px Rye`); } catch { /* the serif fallback is fine */ }
    x.fillStyle = '#2b1d12'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `${fs}px Rye, Georgia, serif`;
    x.fillText(caption || TUNING.caption, OW / 2, H + m * 1.35 + capH / 2, W);
    return out;
  }
  async _save(blob) {
    const name = `sundown-trail-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '').replace(/^(\d{8})/, '$1-')}.png`;
    const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
    if (file && this.game.input.device === 'touch' && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Sundown Trail' }); return 'shared'; } catch (err) { if (err?.name === 'AbortError') return 'cancelled'; }
    }
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return 'downloaded';
  }
  /** Takes a photo with the panel's options: render, shutter, flash, save, and a thumbnail in the corner. */
  async take() {
    if (!this.open_ || this._busy) return null;
    const g = this.game; this._busy = true; this.takeBtn && (this.takeBtn.disabled = true);
    try {
      const shot = await this.capture({ save: !this.noSave });
      g.audio?.play('camera_shutter', { volume: 0.9 });
      g.get('postfx')?.flash?.(0xfff6e0, TUNING.flashSeconds, TUNING.flashStrength);
      if (shot?.blob && this.thumb) {
        if (this._thumbUrl) URL.revokeObjectURL(this._thumbUrl);
        this._thumbUrl = URL.createObjectURL(shot.blob); this.thumb.src = this._thumbUrl; this.thumb.hidden = false;
        this.thumb.classList.remove('sd-on'); void this.thumb.offsetWidth; this.thumb.classList.add('sd-on');
      }
      g.ui.notify(`Photo saved · ${shot.width} × ${shot.height}`);
      return shot;
    } catch (err) { console.error('[photo] capture failed', err); g.ui.notify('The photo could not be taken.'); return null; }
    finally { this._busy = false; if (this.takeBtn) this.takeBtn.disabled = false; }
  }
}
