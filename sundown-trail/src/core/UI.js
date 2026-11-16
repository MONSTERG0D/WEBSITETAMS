import { Vector3 } from 'three';
import { EVENTS } from './Events.js';
import { clamp, formatPlaytime } from './utils/math.js';
import { ACTION_LABELS, keyName } from './Input.js';

/** DOM interface: HUD, prompts, notifications, fades and menu screens (UI API, GAME_BIBLE §11). Part 14 upgrades it. */
export const TUNING = { notifySeconds: 3.5, barsIdleSeconds: 4, subtitleSeconds: 3.5 };

const el = (tag, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
const _wp = new Vector3();

export class UI {
  constructor(game) {
    this.game = game;
    const root = game.uiRoot;
    root.classList.add('sd-ui');
    this.root = root;
    this.hud = el('div', 'sd-hud');
    this.notifyStack = el('div', 'sd-notify-stack');
    this.objectiveEl = el('div', 'sd-objective');
    this.promptBox = el('div', 'sd-prompts');
    this.subtitleEl = el('div', 'sd-subtitle');
    this.popups = el('div', 'sd-popups');
    this.waypointEl = el('div', 'sd-waypoint'); this.waypointEl.hidden = true;
    this.bars = el('div', 'sd-bars'); this.barEls = {};
    for (const [key, label] of [['health', 'Health'], ['stamina', 'Stamina'], ['focus', 'Focus'], ['horseStamina', 'Horse']]) {
      const row = el('div', `sd-bar sd-bar-${key}`), track = el('span', 'sd-bar-track'), fill = el('span', 'sd-bar-fill');
      track.append(fill); row.append(el('span', 'sd-bar-label', label), track); this.bars.append(row);
      this.barEls[key] = { row, fill, value: null };
    }
    this.barEls.horseStamina.row.hidden = true;
    this.hud.append(this.notifyStack, this.objectiveEl, this.bars, this.promptBox, this.subtitleEl, this.popups, this.waypointEl);
    this.fadeEl = el('div', 'sd-fade');
    this.letterTop = el('div', 'sd-letterbox sd-top'); this.letterBottom = el('div', 'sd-letterbox sd-bottom');
    this.screenLayer = el('div', 'sd-screen-layer');
    this.rotateEl = el('div', 'sd-rotate');
    const rp = el('div', 'sd-panel'); rp.append(el('h2', 'sd-title', 'Turn your phone sideways'), el('p', '', 'Sundown Trail plays in landscape.'));
    this.rotateEl.append(rp);
    root.append(this.hud, this.letterTop, this.letterBottom, this.fadeEl, this.screenLayer, this.rotateEl);
    this.prompts = new Map(); this.stack = []; this.screens = new Map(); this.barsIdle = 0; this.waypoint = null;
    this._registerCoreScreens();
    window.addEventListener('keydown', (e) => { // Part 14: arrow keys move between controls in screens (not inside a slider or a list box)
      if (!this.stack.length || this.game.get('dialogue')?.active || this.stack[this.stack.length - 1].def.nav === false) return;
      const t = e.target, dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      if (e.code === 'PageUp' || e.code === 'PageDown') { const top = this.stack[this.stack.length - 1]; if (top.def.onTab) { e.preventDefault(); top.def.onTab(e.code === 'PageUp' ? -1 : 1); } return; }
      if (!dirs[e.code] || t?.tagName === 'SELECT' || (t?.tagName === 'INPUT' && t.type === 'range' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight'))) return;
      if (this.moveFocus(dirs[e.code])) e.preventDefault();
    });
    this.applyScale();
    game.events.on(EVENTS.SETTINGS_CHANGED, ({ key }) => { if (key === 'uiScale' || key === '*') this.applyScale(); });
  }

  applyScale() { document.documentElement.style.setProperty('--ui-scale', String(this.game.settings.get('uiScale') || 1)); }

  // ---------- HUD API ----------
  notify(text, { icon = '', duration = TUNING.notifySeconds } = {}) {
    const n = el('div', 'sd-notify', icon ? `${icon} ${text}` : text);
    this.notifyStack.append(n);
    requestAnimationFrame(() => n.classList.add('sd-in'));
    setTimeout(() => { n.classList.remove('sd-in'); n.classList.add('sd-out'); setTimeout(() => n.remove(), 400); }, duration * 1000);
    while (this.notifyStack.children.length > 4) this.notifyStack.firstChild.remove();
    this.game.audio?.play('notify', { volume: 0.7 });
  }
  prompt(id, text, keyLabel = '') {
    let p = this.prompts.get(id);
    if (!p) { p = el('div', 'sd-prompt'); this.promptBox.append(p); this.prompts.set(id, p); }
    p.textContent = '';
    if (keyLabel) p.append(el('kbd', '', keyLabel));
    p.append(el('span', '', text));
  }
  clearPrompt(id) { const p = this.prompts.get(id); if (p) { p.remove(); this.prompts.delete(id); } }
  setObjective(text) { this.objectiveEl.textContent = text || ''; this.objectiveEl.classList.toggle('sd-show', !!text); }
  setWaypoint(x, z, label = '') { this.waypoint = { x, z, label }; this.waypointEl.hidden = false; }
  clearWaypoint() { this.waypoint = null; this.waypointEl.hidden = true; }
  subtitle(speaker, text, seconds = TUNING.subtitleSeconds) {
    if (this.game.settings.get('subtitles') === false) return;
    this.subtitleEl.textContent = '';
    if (speaker) this.subtitleEl.append(el('b', '', `${speaker}: `));
    this.subtitleEl.append(document.createTextNode(text));
    this.subtitleEl.classList.add('sd-show');
    clearTimeout(this._subTimer);
    this._subTimer = setTimeout(() => this.subtitleEl.classList.remove('sd-show'), seconds * 1000);
  }
  honorPulse(delta) {
    if (!delta) return;
    this._popup(`Honor ${delta > 0 ? 'rises' : 'falls'}`, delta > 0 ? 'sd-honor-up' : 'sd-honor-down');
    this.game.audio?.play(delta > 0 ? 'honor_up' : 'honor_down');
  }
  moneyPopup(delta) {
    if (!delta) return;
    this._popup(`${delta > 0 ? '+' : '−'}$${Math.abs(delta).toFixed(2)}`, delta > 0 ? 'sd-money-up' : 'sd-money-down');
  }
  setBars(values) {
    for (const key in values) {
      const b = this.barEls[key];
      if (!b) continue;
      const v = values[key];
      if (v == null) { if (key === 'horseStamina') b.row.hidden = true; continue; }
      b.row.hidden = false;
      const pct = clamp(v, 0, 100);
      if (b.value !== null && Math.abs(b.value - pct) < 0.4) continue;
      if (b.value !== null) this.barsIdle = 0;
      b.value = pct;
      b.fill.style.transform = `scaleX(${pct / 100})`;
      b.row.classList.toggle('sd-low', pct < 25);
    }
  }
  /** @returns {Promise<void>} resolves when the fade finishes */
  fade(toBlack, seconds = 0.8) {
    this.fadeEl.style.transitionDuration = `${seconds}s`;
    this.fadeEl.classList.toggle('sd-on', !!toBlack);
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
  letterbox(on) { this.root.classList.toggle('sd-letterboxed', !!on); }
  /** A parchment panel for module UIs (shops, ledger…). */
  panel(html = '', { title = '', className = '' } = {}) {
    const p = el('div', `sd-panel ${className}`.trim());
    if (title) p.append(el('h2', 'sd-title', title));
    if (html) { const body = el('div', 'sd-panel-body'); body.innerHTML = html; p.append(body); }
    return p;
  }

  // ---------- screens ----------
  /**
   * def = { build(ui, data) → HTMLElement, onClose?(ui) }
   * Added in Part 14 (all optional): pause (the game pauses while it's open), toggle (an input action that also
   * closes it, e.g. 'map'), onTab(±1) (LB/RB, Q/E or PageUp/PageDown change pages), back: false (B/Esc won't close),
   * nav: false (the screen handles arrows, D-pad and A itself), update(rawDt) (called every frame while on top).
   */
  registerScreen(name, def) { this.screens.set(name, def); }
  openScreen(name, data = {}) {
    const def = this.screens.get(name);
    if (!def) { console.warn(`[ui] unknown screen "${name}"`); return null; }
    const wrap = el('div', `sd-screen sd-screen-${name}`);
    wrap.append(def.build(this, data));
    const prev = this.stack[this.stack.length - 1];
    if (prev) prev.wrap.hidden = true;
    this.screenLayer.append(wrap);
    let paused = false;
    if (def.pause && this.game.state === 'playing') { this.game.setState('paused'); paused = true; }
    this.stack.push({ name, wrap, def, paused, opened: this.game.input?.frame ?? 0 });
    this.game.input.setTouchVisible(false);
    this.game.input.unlockPointer();
    this.game.events.emit(EVENTS.UI_SCREEN, { name, open: true });
    this.game.audio?.play('ui_open');
    wrap.querySelector('button:not([disabled]), select, input')?.focus({ preventScroll: true });
    return wrap;
  }
  closeScreen() {
    const top = this.stack.pop();
    if (!top) return;
    top.wrap.classList.add('sd-closing'); top.wrap.style.pointerEvents = 'none'; setTimeout(() => top.wrap.remove(), 140); // Part 14: a short fade out
    top.def.onClose?.(this);
    if (top.paused && this.game.state === 'paused' && !this.stack.some((s) => s.paused || s.name === 'pause')) this.game.setState('playing');
    const prev = this.stack[this.stack.length - 1];
    if (prev) { prev.wrap.hidden = false; prev.wrap.querySelector('button:not([disabled])')?.focus({ preventScroll: true }); }
    this.game.events.emit(EVENTS.UI_SCREEN, { name: top.name, open: false });
    this.game.audio?.play('ui_close');
    if (!this.stack.length && this.game.state === 'playing') this.game.input.setTouchVisible(true);
  }
  closeAll() { while (this.stack.length) this.closeScreen(); }
  isScreenOpen() { return this.stack.length > 0; }
  topScreen() { return this.stack.length ? this.stack[this.stack.length - 1].name : null; }

  update(rawDt) {
    this._nav(rawDt);
    this.barsIdle += rawDt;
    let full = true;
    for (const k of ['health', 'stamina', 'focus']) if ((this.barEls[k].value ?? 100) < 99.5) full = false;
    this.hud.classList.toggle('sd-bars-idle', full && this.barsIdle > TUNING.barsIdleSeconds);
    this.hud.classList.toggle('sd-hidden', !['playing', 'dead', 'cutscene'].includes(this.game.state));
    this.hud.classList.toggle('sd-cutscene', this.game.state === 'cutscene'); // Part 15: only subtitles show in cutscenes
    if (this.waypoint) this._updateWaypoint();
  }

  // ---------- navigation (Part 14): arrows / D-pad / stick move focus, A or Enter activates, B or Esc goes back ----------
  _nav(rawDt) {
    const top = this.stack[this.stack.length - 1], inp = this.game.input;
    if (!top || top.wrap.hidden) return;
    top.def.update?.(rawDt, this);
    if (top.opened === (this.game.input?.frame ?? 0)) return; // not on the input frame it opened (the key that opened it is still 'pressed')
    if (top.def.toggle && inp.pressed(top.def.toggle) && !(inp.device === 'gamepad' && ['social', 'holster', 'satchel', 'camera'].includes(top.def.toggle))) { this.closeScreen(); return; }
    if (top.def.onTab) {
      if (inp.device === 'gamepad' ? inp.pressed('weaponWheel') : inp.pressed('social')) top.def.onTab(-1);
      else if (inp.device === 'gamepad' ? inp.pressed('reload') : inp.pressed('interact')) top.def.onTab(1);
    }
    if (inp.device !== 'gamepad') return;
    // gamepad: D-pad (mapped to social/holster/satchel/camera) or the left stick, with key repeat
    let dir = inp.pressed('social') ? 'up' : inp.pressed('holster') ? 'down' : inp.pressed('satchel') ? 'left' : inp.pressed('camera') ? 'right' : null;
    const sx = inp.padMove?.x || 0, sy = inp.padMove?.y || 0;
    if (!dir && Math.hypot(sx, sy) > 0.6) { this._stickT = (this._stickT ?? 0) - rawDt; if (this._stickT <= 0) { this._stickT = this._stickHeld ? 0.14 : 0.35; this._stickHeld = true; dir = Math.abs(sx) > Math.abs(sy) ? (sx > 0 ? 'right' : 'left') : (sy > 0 ? 'up' : 'down'); } }
    else if (Math.hypot(sx, sy) < 0.3) { this._stickT = 0; this._stickHeld = false; }
    if (dir && top.def.nav !== false) this.moveFocus(dir);
    if (inp.pressed('jump') && top.def.nav !== false) { const f = document.activeElement; if (f && top.wrap.contains(f)) f.click(); }
    if (inp.pressed('crouch') && top.def.back !== false && top.name !== 'title') { if (top.name === 'pause') this.game.resume(); else this.closeScreen(); }
  }
  /** Moves keyboard focus to the nearest control in a direction ('up'|'down'|'left'|'right') within the top screen. */
  moveFocus(dir) {
    const top = this.stack[this.stack.length - 1]; if (!top) return false;
    const all = [...top.wrap.querySelectorAll('button:not([disabled]), select, input, [tabindex="0"]')].filter((e) => e.offsetParent !== null);
    if (!all.length) return false;
    const cur = document.activeElement && top.wrap.contains(document.activeElement) ? document.activeElement : null;
    if (!cur) { all[0].focus({ preventScroll: false }); return true; }
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = Infinity;
    for (const e of all) {
      if (e === cur) continue;
      const b = e.getBoundingClientRect(), dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
      const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx, across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
      if (along <= 4) continue;
      const score = along + across * 2.2;
      if (score < bs) { bs = score; best = e; }
    }
    if (!best) return false;
    best.focus({ preventScroll: false }); best.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    this.game.audio?.play('ui_hover', { volume: 0.5 });
    if (best.tagName === 'INPUT' && best.type === 'range') this._range = best;
    return true;
  }

  // ---------- helpers ----------
  button(label, onClick, { disabled = false, primary = false, className = '' } = {}) {
    const b = el('button', `sd-button${primary ? ' sd-primary' : ''}${className ? ` ${className}` : ''}`, label);
    b.type = 'button'; b.disabled = disabled;
    b.addEventListener('click', () => { this.game.audio?.play('ui_click'); onClick(); });
    return b;
  }
  _popup(text, cls) { const p = el('div', `sd-popup ${cls}`, text); this.popups.append(p); setTimeout(() => p.remove(), 2200); }
  _updateWaypoint() {
    const g = this.game, w = this.waypoint, cam = g.camera;
    _wp.set(w.x, g.sys('terrain').getHeightAt(w.x, w.z) + 2, w.z);
    const dist = g.player?.position ? Math.hypot(w.x - g.player.position.x, w.z - g.player.position.z) : 0;
    _wp.project(cam);
    const behind = _wp.z > 1;
    let x = (_wp.x * 0.5 + 0.5) * window.innerWidth, y = (-_wp.y * 0.5 + 0.5) * window.innerHeight;
    if (behind) { x = window.innerWidth - x; y = window.innerHeight - 40; }
    x = clamp(x, 52, window.innerWidth - 52); y = clamp(y, 40, window.innerHeight - 40);
    this.waypointEl.style.transform = `translate(${x}px, ${y}px)`;
    this.waypointEl.textContent = `${w.label ? `${w.label} ` : ''}${Math.round(dist)} m`;
  }

  _registerCoreScreens() {
    this.registerScreen('title', {
      build: (ui) => {
        const g = ui.game, latest = g.save.latest();
        const wrap = el('div', 'sd-title-screen');
        const logo = el('div', 'sd-logo');
        logo.append(el('div', 'sd-logo-kicker', 'Ashwater County, 1899'), el('h1', 'sd-logo-title', 'Sundown Trail'), el('div', 'sd-rope'));
        const menu = el('nav', 'sd-menu');
        menu.append(
          ui.button('Continue', () => g.continueGame(), { disabled: !latest, primary: !!latest }),
          ui.button('New game', () => g.newGame(), { primary: !latest }),
          ui.button('Load game', () => ui.openScreen('saveload', { mode: 'load' }), { disabled: !latest }),
          ui.button('Settings', () => ui.openScreen('settings')),
        );
        wrap.append(logo, menu, el('p', 'sd-footnote', 'Part 2 build: the land, sky and weather of Ashwater County. Its towns and people arrive part by part.'));
        return wrap;
      },
    });
    this.registerScreen('pause', {
      build: (ui) => {
        const g = ui.game, p = ui.panel('', { title: 'Paused', className: 'sd-menu-panel' }), menu = el('nav', 'sd-menu');
        menu.append(
          ui.button('Resume', () => g.resume(), { primary: true }),
          ui.button('Save game', () => ui.openScreen('saveload', { mode: 'save' })),
          ui.button('Load game', () => ui.openScreen('saveload', { mode: 'load' })),
          ui.button('Settings', () => ui.openScreen('settings')),
          ui.button('Quit to title', () => g.quitToTitle()),
        );
        p.append(menu);
        return p;
      },
    });
    this.registerScreen('saveload', {
      build: (ui, { mode = 'load' } = {}) => {
        const g = ui.game, p = ui.panel('', { title: mode === 'save' ? 'Save game' : 'Load game', className: 'sd-menu-panel' });
        const list = el('div', 'sd-slots');
        for (const s of g.save.slots()) {
          if (mode === 'save' && s.slot === 'auto') continue;
          const name = s.slot === 'auto' ? 'Autosave' : `Slot ${s.slot}`;
          const b = ui.button('', () => {
            if (mode === 'save') { const ok = g.save.save(s.slot); ui.notify(ok ? `Saved to ${name}` : 'Save failed: browser storage is full or blocked'); ui.closeScreen(); }
            else g.loadSlot(s.slot);
          }, { disabled: mode === 'load' && s.empty, className: 'sd-slot' });
          b.append(el('strong', '', name));
          b.append(el('small', '', s.empty ? 'Empty' : `Saved ${new Date(s.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}. Played ${formatPlaytime(s.playtime)}. ${s.location}.`));
          list.append(b);
        }
        p.append(list, ui.button('Back', () => ui.closeScreen()));
        return p;
      },
    });
    this.registerScreen('settings', { build: (ui) => buildSettings(ui) });
  }
}

function buildSettings(ui) {
  const g = ui.game, S = g.settings;
  const p = ui.panel('', { title: 'Settings', className: 'sd-settings' }), body = el('div', 'sd-settings-body');
  const section = (title) => { const s = el('section', 'sd-section'); s.append(el('h3', '', title)); body.append(s); return s; };
  const row = (parent, label, control) => { const r = el('label', 'sd-row'); r.append(el('span', 'sd-row-label', label), control); parent.append(r); };
  const select = (key, options, onChange) => {
    const s = el('select', 'sd-select');
    for (const [value, label] of options) { const o = el('option', '', label); o.value = String(value); s.append(o); }
    s.value = String(S.get(key));
    s.addEventListener('change', () => { const v = options.find(([ov]) => String(ov) === s.value)[0]; S.set(key, v); onChange?.(v); });
    return s;
  };
  const slider = (key, min, max, step) => {
    const wrap = el('span', 'sd-slider'), input = el('input'), out = el('output');
    input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = S.get(key) ?? min;
    out.textContent = Number(input.value).toFixed(2);
    input.addEventListener('input', () => { out.textContent = Number(input.value).toFixed(2); S.set(key, Number(input.value)); });
    wrap.append(input, out);
    return wrap;
  };
  const toggle = (key) => { const i = el('input'); i.type = 'checkbox'; i.checked = !!S.get(key); i.addEventListener('change', () => S.set(key, i.checked)); return i; };

  const gfx = section('Graphics');
  row(gfx, 'Quality', select('quality', [['auto', `Automatic (${S.get('detectedQuality') || 'not measured'})`], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => g.applyQuality()));
  row(gfx, 'Frame rate', select('fpsCap', [[30, '30 fps, smoother and cooler'], [60, '60 fps']]));
  row(gfx, 'Interface size', slider('uiScale', 0.8, 1.4, 0.05));
  const bench = ui.button('Measure my device again', async () => {
    bench.disabled = true;
    const r = await g.detectQuality(true);
    ui.notify(r ? `Recommended quality: ${r}` : 'Measurement failed; quality unchanged');
    bench.disabled = false;
  });
  gfx.append(bench, el('p', 'sd-hint', 'Anti-aliasing changes take effect after a restart.'));

  const ctl = section('Controls');
  row(ctl, 'Mouse sensitivity', slider('sensitivity', 0.2, 3, 0.05));
  row(ctl, 'Touch look sensitivity', slider('touchSensitivity', 0.2, 3, 0.05));
  row(ctl, 'Invert vertical look', toggle('invertY'));
  row(ctl, 'Crouch toggles', toggle('crouchToggle'));
  row(ctl, 'Aim assist', toggle('aimAssist'));
  row(ctl, 'Snap to target when aiming', toggle('targetLock'));
  row(ctl, 'Slow-motion kill camera', toggle('killCam'));
  row(ctl, 'Camera shake', slider('cameraShake', 0, 1, 0.05));
  row(ctl, 'Vibration', toggle('haptics'));
  row(ctl, 'Subtitles', toggle('subtitles'));

  const aud = section('Audio');
  for (const [key, label] of [['master', 'Master'], ['music', 'Music'], ['sfx', 'Effects'], ['ambience', 'Ambience'], ['ui', 'Interface']]) row(aud, label, slider(`volumes.${key}`, 0, 1, 0.05));

  if (!g.isTouch) {
    const keys = section('Keys');
    for (const action of Object.keys(S.get('keybinds') || {})) {
      const b = el('button', 'sd-button sd-key'); b.type = 'button';
      const show = () => { b.textContent = (S.get(`keybinds.${action}`) || []).map(keyName).join(' or ') || 'Unbound'; };
      show();
      b.addEventListener('click', (e) => {
        e.preventDefault(); b.textContent = 'Press a key';
        g.input.captureNextKey((code) => { if (code && code !== 'Escape') S.set(`keybinds.${action}`, [code]); show(); });
      });
      row(keys, ACTION_LABELS[action] || action, b);
    }
  }
  body.append(ui.button('Reset all settings', () => { S.reset(); g.applyQuality(); ui.closeScreen(); ui.openScreen('settings'); }));
  p.append(body, ui.button('Back', () => ui.closeScreen(), { primary: true }));
  return p;
}
