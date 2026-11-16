import { EVENTS } from './Events.js';

/** Input: one action map fed by keyboard + mouse, touch (joystick, look drag, buttons) and gamepad. */
export const TUNING = {
  mouseSensitivity: 0.0022, touchLookSensitivity: 0.0062, stickLookSpeed: 2.8, stickDeadzone: 0.15,
  joystickRadius: 60, sprintEdge: 0.92, leftZone: 0.42, touchRefreshEvery: 0.25,
};

export const ACTION_LABELS = Object.freeze({
  moveForward: 'Move forward', moveBack: 'Move back', moveLeft: 'Move left', moveRight: 'Move right',
  sprint: 'Sprint / spur', crouch: 'Crouch', jump: 'Jump', interact: 'Interact / mount', social: 'Social menu',
  whistle: 'Whistle for horse', aim: 'Aim', fire: 'Fire', reload: 'Reload', weaponWheel: 'Weapon wheel',
  holster: 'Holster / draw', focus: 'Focus', camera: 'Camera', map: 'Map', satchel: 'Satchel', journal: 'Journal',
  camp: 'Make camp', pause: 'Pause',
  photo: 'Photo mode', // Added in Part 16
});

/** Standard gamepad mapping, index → action (GAME_BIBLE §9). */
export const DEFAULT_PAD = ['jump', 'crouch', 'interact', 'whistle', 'weaponWheel', 'reload', 'aim', 'fire', 'map', 'pause', 'sprint', 'focus', 'social', 'holster', 'satchel', 'camera'];
const PAD = DEFAULT_PAD; // Part 14: settings.padbinds can remap these
export const PAD_LABELS = { jump: 'A', crouch: 'B', interact: 'X', whistle: 'Y', weaponWheel: 'LB', reload: 'RB', aim: 'LT', fire: 'RT', map: 'Back', pause: 'Start', sprint: 'L3', focus: 'R3', social: 'Up', holster: 'Down', satchel: 'Left', camera: 'Right' };

/** On-screen buttons. `when(game)` decides visibility so later parts' buttons appear once their systems exist. */
export const TOUCH_BUTTONS = [
  { action: 'fire', label: 'Fire', slot: 'r0', when: (g) => !!g.get('combat') },
  { action: 'jump', label: 'Jump', slot: 'r1', labelFn: (g) => (g.get('combat')?.melee?.blocking ? 'Dodge' : 'Jump') },
  { action: 'crouch', label: 'Crouch', slot: 'r2', tap: true, on: (g) => !!g.player?.crouched },
  { action: 'aim', label: 'Aim', slot: 'r3', when: (g) => !!g.get('combat') },
  { action: 'reload', label: 'Reload', slot: 'r4', when: (g) => !!g.get('combat'), labelFn: (g) => (g.get('combat')?.mode === 'melee' ? 'Shove' : 'Reload') },
  { action: 'focus', label: 'Focus', slot: 'r5', when: (g) => !!g.get('focus') && !!g.sys('combat').isAiming },
  { action: 'sprint', label: 'Sprint', slot: 'r6', when: (g) => g.player?.state === 'mounted' },
  { action: 'weaponWheel', label: 'Guns', slot: 'r7', when: (g) => !!g.get('combat') },
  { action: 'interact', label: 'Use', slot: 'ctx', context: true },
  { action: 'map', label: 'Map', slot: 't0', when: (g) => !!g.get('map') },
  { action: 'satchel', label: 'Bag', slot: 't1', when: (g) => !!g.get('hud') },
  { action: 'camera', label: 'Cam', slot: 't2' },
  { action: 'whistle', label: 'Horse', slot: 't3', when: (g) => !!g.get('horses') },
  { action: 'pause', label: 'Pause', slot: 't4' },
];

const NAMES = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Right Shift', ControlLeft: 'Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Alt', Escape: 'Esc', Tab: 'Tab', Enter: 'Enter', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Mouse0: 'Left click', Mouse1: 'Middle click', Mouse2: 'Right click', Backquote: '`' };
/** "KeyE" → "E", "Mouse2" → "Right click" */
export function keyName(code) {
  if (!code) return '';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return NAMES[code] || code;
}

export class Input {
  constructor(game) {
    this.game = game; this.canvas = game.canvas;
    this.device = game.isTouch ? 'touch' : 'keyboard';
    this.kbDown = new Set(); this.touchDown = new Set(); this.padDown = new Set(); this.latched = new Set();
    this.current = new Set(); this.prev = new Set(); this.pressedSet = new Set(); this.releasedSet = new Set();
    this.move = { x: 0, y: 0 }; this.look = { x: 0, y: 0 };
    this._lookAcc = { x: 0, y: 0 }; this.touchMove = { x: 0, y: 0 }; this.padMove = { x: 0, y: 0 }; this.padLook = { x: 0, y: 0 };
    this._codeToActions = new Map(); this._capture = null; this._contextLabel = null; this._touchWanted = false; this._refreshT = 0;
    this._rebuildBindings(); this._readSettings();
    game.events.on(EVENTS.SETTINGS_CHANGED, ({ key }) => {
      if (key === '*' || key.startsWith('keybinds')) this._rebuildBindings();
      this._readSettings();
    });
    this._bindKeyboardMouse();
    this._buildTouch(); this.applyTouchLayout();
  }

  /** Look delta for this frame (radians-ish), from mouse, touch drag or right stick. */
  get mouseDelta() { return this.look; }
  get isLocked() { return document.pointerLockElement === this.canvas; }
  isDown(action) { return this.current.has(action); }
  pressed(action) { return this.pressedSet.has(action); }
  released(action) { return this.releasedSet.has(action); }

  lockPointer() {
    if (this.game.isTouch || this.isLocked || !this.canvas.requestPointerLock) return;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* needs a user gesture */ }
  }
  unlockPointer() { if (this.isLocked) document.exitPointerLock(); }

  getBinding(action) { return this.game.settings.get(`keybinds.${action}`) || []; }
  setBinding(action, codes) { this.game.settings.set(`keybinds.${action}`, codes); }
  /** The next key or mouse button pressed is passed to cb instead of the game (used by rebinding). */
  captureNextKey(cb) { this._capture = cb; }
  /** Label to show in prompts for an action on the current device ('' on touch: the button itself shows). */
  keyLabel(action) {
    if (this.device === 'gamepad') return PAD_LABELS[action] || '';
    if (this.device === 'touch') return '';
    return keyName(this.getBinding(action)[0]);
  }
  haptic(ms = 10) { if (this.haptics && this.device === 'touch' && navigator.vibrate) navigator.vibrate(ms); }

  /** Called by Game at the start of each rendered frame. */
  beginFrame(rawDt) {
    this.frame = (this.frame || 0) + 1; // Added in Part 14
    this._pollPad(rawDt);
    const tmp = this.prev; this.prev = this.current; this.current = tmp; this.current.clear();
    for (const a of this.kbDown) this.current.add(a);
    for (const a of this.touchDown) this.current.add(a);
    for (const a of this.padDown) this.current.add(a);
    for (const a of this.latched) this.current.add(a);
    this.latched.clear();
    let mx = 0, my = 0;
    const k = this.kbDown;
    if (k.has('moveForward')) my += 1;
    if (k.has('moveBack')) my -= 1;
    if (k.has('moveRight')) mx += 1;
    if (k.has('moveLeft')) mx -= 1;
    let len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; len = 1; }
    const tl = Math.hypot(this.touchMove.x, this.touchMove.y), pl = Math.hypot(this.padMove.x, this.padMove.y);
    if (tl > len && tl >= pl) { mx = this.touchMove.x; my = this.touchMove.y; if (tl > TUNING.sprintEdge) this.current.add('sprint'); }
    else if (pl > len) { mx = this.padMove.x; my = this.padMove.y; }
    this.move.x = mx; this.move.y = my;
    if (this.aimToggle) { // Part 14: aim toggles instead of being held
      const raw = this.current.has('aim'), edge = raw && !this._aimRaw; this._aimRaw = raw;
      if (edge) this._aimOn = !this._aimOn;
      if (this._aimOn) this.current.add('aim'); else this.current.delete('aim');
    }
    this.pressedSet.clear(); this.releasedSet.clear();
    for (const a of this.current) if (!this.prev.has(a)) this.pressedSet.add(a);
    for (const a of this.prev) if (!this.current.has(a)) this.releasedSet.add(a);
    this.look.x = this._lookAcc.x + this.padLook.x; this.look.y = this._lookAcc.y + this.padLook.y;
    this._lookAcc.x = 0; this._lookAcc.y = 0;
    this._refreshT += rawDt;
    if (this._refreshT > TUNING.touchRefreshEvery) { this._refreshT = 0; this.refreshTouchButtons(); }
  }
  endFrame() {}

  // ---------- touch UI ----------
  setTouchVisible(visible) { this._touchWanted = !!visible; this._updateTouchVisibility(); }
  setContextLabel(text) {
    this._contextLabel = text || null;
    this._applyContextButton();
  }
  /** The Use button shows a nearby interaction, or "Get off" while riding (touch has no E key to dismount). */
  _applyContextButton() {
    const b = this.touchButtons?.get('interact');
    if (!b) return;
    let label = this._contextLabel;
    if (!label) { try { const h = this.game.sys?.('horses')?.playerHorse; if (this.game.player?.state === 'mounted' && h?.rider === this.game.player && h.riderReady) label = 'Get off'; } catch { /* no horses system */ } }
    if (b.el.textContent !== (label || b.def.label)) b.el.textContent = label || b.def.label;
    b.el.hidden = !label;
  }
  refreshTouchButtons() {
    if (!this.touchButtons || this.touchRoot.hidden) return;
    for (const { el, def } of this.touchButtons.values()) {
      if (def.context) { this._applyContextButton(); continue; }
      let show = true;
      try { show = !def.when || def.when(this.game); } catch { show = false; }
      el.hidden = !show;
      if (def.on) el.classList.toggle('sd-on', !!def.on(this.game));
      if (def.labelFn) { let t = def.label; try { t = def.labelFn(this.game) || def.label; } catch { /* keep the default */ } if (el.textContent !== t) el.textContent = t; } // Added in Part 7
    }
  }

  // ---------- internals ----------
  _readSettings() {
    const s = this.game.settings;
    this.sens = s.get('sensitivity') ?? 1; this.touchSens = s.get('touchSensitivity') ?? 1;
    this.invertY = !!s.get('invertY'); this.haptics = s.get('haptics') !== false;
    this.aimToggle = !!s.get('aimToggle'); if (!this.aimToggle) this._aimOn = false; // Added in Part 14
    const pb = s.get('padbinds'); this._pad = Array.isArray(pb) && pb.length ? pb : null;
    this.leftHanded = !!s.get('leftHanded');
    this.applyTouchLayout?.();
  }
  /** Added in Part 14: label of the gamepad button bound to an action ('' if none). */
  padLabel(action) { const i = (this._pad || PAD).indexOf(action); return i >= 0 ? (PAD_LABELS[DEFAULT_PAD[i]] || `Button ${i}`) : ''; }
  /**
   * Added in Part 14: places the on-screen buttons from settings.touchLayout { action: { x, y, s, a } } (x and y are
   * the button centre as fractions of the screen, s a size multiplier, a the opacity). Missing entries keep the CSS slot.
   */
  applyTouchLayout() {
    if (!this.touchButtons) return;
    const L = this.game.settings.get('touchLayout') || {}, scale = this.game.settings.get('touchScale') ?? 1, alpha = this.game.settings.get('touchOpacity') ?? 1;
    for (const [action, { el }] of this.touchButtons) {
      const o = L[action];
      el.style.left = o ? `${(o.x * 100).toFixed(2)}%` : ''; el.style.top = o ? `${(o.y * 100).toFixed(2)}%` : '';
      el.style.right = o ? 'auto' : ''; el.style.bottom = o ? 'auto' : '';
      el.style.translate = o ? '-50% -50%' : '';
      el.style.scale = String((o?.s ?? 1) * scale);
      el.style.opacity = String(Math.max(0.15, (o?.a ?? 1) * alpha));
    }
    if (this.stickBase) this.stickBase.classList.toggle('sd-left-handed', this.leftHanded);
  }
  _rebuildBindings() {
    this._codeToActions.clear();
    const binds = this.game.settings.get('keybinds') || {};
    for (const [action, codes] of Object.entries(binds)) {
      for (const code of codes || []) {
        if (!this._codeToActions.has(code)) this._codeToActions.set(code, []);
        this._codeToActions.get(code).push(action);
      }
    }
  }
  _setDevice(d) {
    if (this.device === d) return;
    this.device = d;
    this.game.events.emit(EVENTS.INPUT_DEVICE, { device: d });
    this._updateTouchVisibility();
  }
  _updateTouchVisibility() {
    if (!this.touchRoot) return;
    this.touchRoot.hidden = !(this._touchWanted && (this.device === 'touch' || (this.game.isTouch && this.device !== 'gamepad')));
    if (!this.touchRoot.hidden) this.refreshTouchButtons();
  }
  _down(code) {
    const acts = this._codeToActions.get(code);
    if (!acts) return false;
    for (const a of acts) { this.kbDown.add(a); this.latched.add(a); }
    return true;
  }
  _up(code) {
    const acts = this._codeToActions.get(code);
    if (!acts) return false;
    for (const a of acts) this.kbDown.delete(a);
    return true;
  }
  _bindKeyboardMouse() {
    window.addEventListener('keydown', (e) => {
      if (this._capture) { e.preventDefault(); const cb = this._capture; this._capture = null; cb(e.code); return; }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      this._setDevice('keyboard');
      const bound = this._down(e.code);
      const inGame = this.game.state === 'playing' && !this.game.ui?.isScreenOpen();
      if (e.code === 'Tab' || (bound && inGame)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this._up(e.code));
    window.addEventListener('blur', () => { this.kbDown.clear(); });
    this.canvas.addEventListener('mousedown', (e) => {
      if (this._capture) { const cb = this._capture; this._capture = null; cb(`Mouse${e.button}`); return; }
      this._setDevice('keyboard');
      if (this.game.state === 'playing' && !this.isLocked && !this.game.isTouch && !this.game.ui?.isScreenOpen()) { this.lockPointer(); return; }
      this._down(`Mouse${e.button}`);
    });
    window.addEventListener('mouseup', (e) => this._up(`Mouse${e.button}`));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      this._lookAcc.x += e.movementX * TUNING.mouseSensitivity * this.sens;
      this._lookAcc.y += e.movementY * TUNING.mouseSensitivity * this.sens * (this.invertY ? -1 : 1);
    });
    document.addEventListener('pointerlockchange', () => {
      if (!this.isLocked) { this.kbDown.delete('fire'); this.kbDown.delete('aim'); this.game.events.emit(EVENTS.POINTER_UNLOCKED, {}); }
    });
  }
  _buildTouch() {
    const root = this.game.touchRoot;
    this.touchRoot = root;
    if (!root) return;
    root.classList.add('sd-touch'); root.textContent = '';
    this.stickBase = document.createElement('div'); this.stickBase.className = 'sd-stick';
    this.stickKnob = document.createElement('div'); this.stickKnob.className = 'sd-stick-knob';
    this.stickBase.append(this.stickKnob); root.append(this.stickBase);
    this.touchButtons = new Map();
    for (const def of TOUCH_BUTTONS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `sd-tbtn sd-slot-${def.slot}${def.context ? ' sd-context' : ''}`;
      b.textContent = def.label; b.dataset.action = def.action; b.hidden = !!def.context;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation(); this._setDevice('touch');
        this.latched.add(def.action);
        if (!def.tap) { this.touchDown.add(def.action); b.classList.add('sd-held'); }
        this.haptic(8);
      });
      const up = (e) => { e.preventDefault(); this.touchDown.delete(def.action); b.classList.remove('sd-held'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
      root.append(b);
      this.touchButtons.set(def.action, { el: b, def });
    }
    this._stick = null; this._looks = new Map();
    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') { this._setDevice('keyboard'); return; }
      this._setDevice('touch');
      const inZone = this.leftHanded ? e.clientX > window.innerWidth * (1 - TUNING.leftZone) : e.clientX < window.innerWidth * TUNING.leftZone; // Part 14: left-handed puts the stick on the right
      if (inZone && !this._stick) {
        this._stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
        this.stickBase.style.left = `${e.clientX}px`; this.stickBase.style.top = `${e.clientY}px`;
        this.stickBase.classList.add('sd-active'); this.stickKnob.style.transform = 'translate(-50%, -50%)';
      } else {
        this._looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      try { root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    root.addEventListener('pointermove', (e) => {
      if (this._stick && e.pointerId === this._stick.id) {
        const R = TUNING.joystickRadius;
        let dx = e.clientX - this._stick.x0, dy = e.clientY - this._stick.y0;
        const len = Math.hypot(dx, dy);
        if (len > R) { dx *= R / len; dy *= R / len; }
        this.touchMove.x = dx / R; this.touchMove.y = -dy / R;
        this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        return;
      }
      const l = this._looks.get(e.pointerId);
      if (!l) return;
      this._lookAcc.x += (e.clientX - l.x) * TUNING.touchLookSensitivity * this.touchSens;
      this._lookAcc.y += (e.clientY - l.y) * TUNING.touchLookSensitivity * this.touchSens * (this.invertY ? -1 : 1);
      l.x = e.clientX; l.y = e.clientY;
    });
    const end = (e) => {
      if (this._stick && e.pointerId === this._stick.id) {
        this._stick = null; this.touchMove.x = 0; this.touchMove.y = 0;
        this.stickBase.classList.remove('sd-active'); this.stickBase.style.left = ''; this.stickBase.style.top = '';
        this.stickKnob.style.transform = 'translate(-50%, -50%)';
      }
      this._looks.delete(e.pointerId);
    };
    root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
    root.hidden = true;
  }
  _pollPad(rawDt) {
    this.padDown.clear(); (this.padRaw ||= new Set()).clear(); this.padMove.x = 0; this.padMove.y = 0; this.padLook.x = 0; this.padLook.y = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : null;
    if (!pads) return;
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (!pad) return;
    const dz = TUNING.stickDeadzone;
    const ax = (v = 0) => (Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz));
    const lx = ax(pad.axes[0]), ly = ax(pad.axes[1]), rx = ax(pad.axes[2]), ry = ax(pad.axes[3]);
    let active = lx !== 0 || ly !== 0 || rx !== 0 || ry !== 0;
    const map = this._pad || PAD;
    for (let i = 0; i < pad.buttons.length && i < map.length; i++) {
      const b = pad.buttons[i];
      if (b && (b.pressed || b.value > 0.5)) { if (map[i]) this.padDown.add(map[i]); this.padRaw.add(i); active = true; }
    }
    if (active) this._setDevice('gamepad');
    this.padMove.x = lx; this.padMove.y = -ly;
    this.padLook.x = rx * TUNING.stickLookSpeed * this.sens * rawDt;
    this.padLook.y = ry * TUNING.stickLookSpeed * this.sens * rawDt * (this.invertY ? -1 : 1);
  }
}
