import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { ACTION_LABELS, keyName, TOUCH_BUTTONS, DEFAULT_PAD, PAD_LABELS } from '../core/Input.js';
import { DEFAULT_KEYBINDS } from '../core/Settings.js';
import { formatPlaytime } from '../core/utils/math.js';

/**
 * The 'menus' system (Part 14): the final title, pause, save/load, settings, death and credits screens, and the
 * touch layout editor. They replace Part 0's screens under the same names ('title', 'pause', 'saveload',
 * 'settings'), so game.pause(), resume() and every caller work unchanged.
 *  settings  pages: Graphics (preset plus each option), Controls (keys, hold or toggle, sensitivity), Gamepad
 *            (remap every button), Audio (every bus), Accessibility (subtitle size and backdrop, interface size,
 *            colour-blind-friendly markers, reduced motion and shake, aim assist, minimap, HUD fading), Touch (the
 *            layout editor, left-handed and compact presets, size, opacity, vibration)
 *  death     "Dead" over the fade, what it cost, and a way back to the last save
 */
export const TUNING = { deathDelay: 1.1 };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const PAGES = [['graphics', 'Graphics'], ['controls', 'Controls'], ['gamepad', 'Gamepad'], ['audio', 'Audio'], ['access', 'Accessibility'], ['touch', 'Touch']];
const CREDITS = [
  ['Sundown Trail', 'An original western, made part by part'],
  ['Design, direction, code, models, animation, effects, sound and music', 'Aamir'],
  ['Built with', 'three.js · the Web Audio API · Blender (baked ground textures)'],
  ['Typeface', 'Rye by Nicole Fally (SIL Open Font License)'],
  ['Thanks', 'To everyone who ever rode off into a sunset'],
];

export default class Menus extends System {
  constructor(game) { super(game); this.page = 'graphics'; this.touchPreset = null; }

  async init() {
    const g = this.game, ui = g.ui;
    ui.registerScreen('title', { back: false, build: () => this._title() });
    ui.registerScreen('pause', { build: () => this._pause() });
    ui.registerScreen('saveload', { build: (u, d) => this._saveload(d) });
    ui.registerScreen('settings', { build: () => this._settings(), onTab: (d) => { const i = PAGES.findIndex((p) => p[0] === this.page); this.page = PAGES[(i + d + PAGES.length) % PAGES.length][0]; this._refresh('settings'); g.audio?.play('ui_tick'); } });
    ui.registerScreen('credits', { build: () => this._credits() });
    ui.registerScreen('touchlayout', { back: false, nav: false, build: () => this._touchEditor(), onClose: () => this._editorClosed() });
    ui.registerScreen('confirm', { build: (u, d) => this._confirm(d) });
    // death
    this.deathEl = el('div', 'sd-death'); this.deathEl.hidden = true; ui.root.append(this.deathEl);
    g.events.on(EVENTS.PLAYER_DIED, () => this._death());
    g.events.on(EVENTS.PLAYER_RESPAWNED, () => { this.deathEl.classList.remove('sd-on'); setTimeout(() => { this.deathEl.hidden = true; }, 600); });
    g.events.on(EVENTS.SETTINGS_CHANGED, ({ key }) => { if (key === 'reduceMotion' || key === 'subtitleBackdrop' || key === '*') this._applyBody(); });
    this._applyBody();
    // a reload of the title screen if it's already up (it was built by Part 0 before this system existed)
    if (ui.topScreen() === 'title') { ui.closeAll(); ui.openScreen('title'); }
  }
  _applyBody() {
    const S = this.game.settings;
    document.documentElement.classList.toggle('sd-reduce-motion', !!S.get('reduceMotion'));
    document.documentElement.classList.toggle('sd-sub-backdrop', !!S.get('subtitleBackdrop'));
  }
  _refresh(name) { const ui = this.game.ui; if (ui.topScreen() !== name) return; const w = ui.stack.at(-1).wrap, f = w.querySelector('.sd-tab.sd-on'); w.firstChild.replaceWith(ui.screens.get(name).build(ui, {})); (w.querySelector('.sd-tab.sd-on') || w.querySelector('button'))?.focus({ preventScroll: true }); void f; }

  // ---------------------------------------------------------------- title, pause, credits
  _title() {
    const g = this.game, ui = g.ui, latest = g.save.latest(), wrap = el('div', 'sd-title-screen');
    const logo = el('div', 'sd-logo'); logo.append(el('div', 'sd-logo-kicker', 'Ashwater County, 1899'), el('h1', 'sd-logo-title', 'Sundown Trail'), el('div', 'sd-rope'));
    const menu = el('nav', 'sd-menu');
    menu.append(
      ui.button('Continue', () => g.continueGame(), { disabled: !latest, primary: !!latest }),
      ui.button('New game', () => (latest ? ui.openScreen('confirm', { text: 'Start a new game? Your saves are kept.', yes: 'Ride out', onYes: () => g.newGame() }) : g.newGame()), { primary: !latest }),
      ui.button('Load game', () => ui.openScreen('saveload', { mode: 'load' }), { disabled: !latest }),
      ui.button('Settings', () => ui.openScreen('settings')),
      ui.button('Credits', () => ui.openScreen('credits')),
    );
    if (latest) menu.firstChild.title = `${latest.location} · ${formatPlaytime(latest.playtime)}`;
    wrap.append(logo, menu, el('p', 'sd-footnote', latest ? `Last ridden: ${latest.location}, ${new Date(latest.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.` : 'A new county, and a deed to set right.'));
    return wrap;
  }
  _pause() {
    const g = this.game, ui = g.ui, p = el('div', 'sd-panel sd-pause'), sky = g.get('sky');
    const side = el('div', 'sd-pause-side');
    const h = sky?.timeOfDay ?? 12, hh = Math.floor(h), mm = Math.floor((h % 1) * 60);
    side.append(el('h2', 'sd-title', 'Paused'), el('p', 'sd-hand', g.save._location?.() || ''), el('p', 'sd-hint', `Day ${sky?.day ?? 1}, ${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'in the morning' : hh < 18 ? 'in the afternoon' : 'in the evening'} · $${g.sys('wallet').money.toFixed(2)} · ${g.get('honor')?.tier || ''}`));
    const R = g.get('ranch'), obj = g.ui.objectiveEl?.textContent;
    if (obj) side.append(el('p', 'sd-hand', `Now: ${obj}`));
    if (R) side.append(el('p', 'sd-hint', `Rourke Ranch: ${Object.values(R.levels).filter(Boolean).length} of 8 works done, $${R.dailyIncome().toFixed(2)} a morning.`));
    if (g.ui.waypoint) side.append(el('p', 'sd-hint', `Waypoint set${g.ui.waypoint.label ? `: ${g.ui.waypoint.label}` : ''}.`));
    const menu = el('nav', 'sd-menu');
    const openOver = (name) => { g.ui.openScreen(name); };
    menu.append(
      ui.button('Resume', () => g.resume(), { primary: true }),
      ...(g.get('map') ? [ui.button('Map', () => openOver('map'))] : []),
      ...(g.get('hud') ? [ui.button('Journal', () => openOver('journal')), ui.button('Satchel', () => openOver('satchel'))] : []),
      ...(g.get('photo') ? [ui.button('Photo mode', () => g.get('photo').open())] : []), // Part 16
      ui.button('Save game', () => ui.openScreen('saveload', { mode: 'save' })),
      ui.button('Load game', () => ui.openScreen('saveload', { mode: 'load' })),
      ui.button('Settings', () => ui.openScreen('settings')),
      ui.button('Quit to title', () => ui.openScreen('confirm', { text: 'Quit to the title screen? The game is saved first.', yes: 'Quit', onYes: () => g.quitToTitle() })),
    );
    p.append(side, menu);
    return p;
  }
  _credits() {
    const ui = this.game.ui, p = el('div', 'sd-panel sd-credits');
    p.append(el('h2', 'sd-title', 'Credits'));
    for (const [a, b] of CREDITS) { const r = el('div', 'sd-credit'); r.append(el('small', null, a), el('b', null, b)); p.append(r); }
    p.append(el('p', 'sd-hint', 'Every model, texture, animation, sound and note in the game is original, generated by code at runtime or baked from code.'), ui.button('Back', () => ui.closeScreen(), { primary: true }));
    return p;
  }
  _confirm({ text = 'Are you sure?', yes = 'Yes', no = 'No', onYes } = {}) {
    const ui = this.game.ui, p = el('div', 'sd-panel sd-menu-panel sd-confirm');
    p.append(el('p', 'sd-hand', text));
    const m = el('nav', 'sd-menu'); m.append(ui.button(no, () => ui.closeScreen(), { primary: true }), ui.button(yes, () => { ui.closeScreen(); onYes?.(); })); p.append(m);
    return p;
  }

  // ---------------------------------------------------------------- save / load
  _saveload({ mode = 'load' } = {}) {
    const g = this.game, ui = g.ui, p = el('div', 'sd-panel sd-menu-panel sd-saves');
    p.append(el('h2', 'sd-title', mode === 'save' ? 'Save game' : 'Load game'));
    const list = el('div', 'sd-slots');
    for (const s of g.save.slots()) {
      if (mode === 'save' && s.slot === 'auto') continue;
      const name = s.slot === 'auto' ? 'Autosave' : `Slot ${s.slot}`, row = el('div', 'sd-slot-row');
      const b = ui.button('', () => {
        if (mode === 'save') {
          const doSave = () => { const ok = g.save.save(s.slot); ui.notify(ok ? `Saved to ${name}` : 'Save failed: browser storage is full or blocked'); this._refresh('saveload'); };
          if (!s.empty) ui.openScreen('confirm', { text: `Write over ${name}?`, yes: 'Save over it', onYes: doSave }); else doSave();
        } else g.loadSlot(s.slot);
      }, { disabled: mode === 'load' && s.empty, className: 'sd-slot' });
      b.append(el('strong', '', name));
      if (s.empty) b.append(el('small', '', 'Empty'));
      else {
        const m = s.meta, when = new Date(s.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
        b.append(el('small', '', `${s.location} · ${when}`), el('small', '', `Played ${formatPlaytime(s.playtime)}${m ? ` · day ${m.day} · $${Number(m.money).toFixed(2)}` : ''}`));
      }
      row.append(b);
      if (!s.empty && s.slot !== 'auto') row.append(ui.button('Delete', () => ui.openScreen('confirm', { text: `Delete ${name}? This can't be undone.`, yes: 'Delete', onYes: () => { g.save.remove(s.slot); this._refresh('saveload'); } }), { className: 'sd-slot-del' }));
      list.append(row);
    }
    p.append(list, ui.button('Back', () => ui.closeScreen()));
    return p;
  }

  // ---------------------------------------------------------------- settings
  _settings() {
    const g = this.game, ui = g.ui, S = g.settings, p = el('div', 'sd-panel sd-settings sd-settings2');
    const head = el('div', 'sd-book-head'); head.append(el('h2', 'sd-title', 'Settings')); p.append(head);
    const tabs = el('nav', 'sd-tabs sd-tabs-row');
    for (const [id, label] of PAGES) { if (id === 'touch' && !g.isTouch && !S.get('showTouchSettings')) continue; tabs.append(ui.button(label, () => { this.page = id; this._refresh('settings'); }, { className: `sd-tab${this.page === id ? ' sd-on' : ''}` })); }
    p.append(tabs);
    const body = el('div', 'sd-settings-body');
    const row = (label, control, hint) => { const r = el('label', 'sd-row'); const l = el('span', 'sd-row-label', label); if (hint) l.append(el('small', null, hint)); r.append(l, control); body.append(r); return r; };
    const select = (key, options, onChange) => { const s = el('select', 'sd-select'); for (const [v, l] of options) { const o = el('option', '', l); o.value = String(v); s.append(o); } s.value = String(S.get(key) ?? options[0][0]); s.addEventListener('change', () => { const v = options.find(([ov]) => String(ov) === s.value)[0]; S.set(key, v); onChange?.(v); }); return s; };
    const slider = (key, min, max, step, fmt = (v) => v.toFixed(2), onChange) => { const w = el('span', 'sd-slider'), i = el('input'), o = el('output'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = S.get(key) ?? min; o.textContent = fmt(Number(i.value)); i.addEventListener('input', () => { o.textContent = fmt(Number(i.value)); S.set(key, Number(i.value)); onChange?.(Number(i.value)); }); w.append(i, o); return w; };
    const toggle = (key, onChange) => { const i = el('input'); i.type = 'checkbox'; i.checked = !!S.get(key); i.addEventListener('change', () => { S.set(key, i.checked); onChange?.(i.checked); }); return i; };
    const section = (t) => body.append(el('h3', 'sd-sec', t));
    const pct = (v) => `${Math.round(v * 100)}%`;
    if (this.page === 'graphics') {
      row('Quality preset', select('quality', [['auto', `Automatic (${S.get('detectedQuality') || 'not measured'})`], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => g.applyQuality()));
      row('Frame rate', select('fpsCap', [[30, '30 fps, smoother and cooler'], [60, '60 fps']], (v) => { g.fpsCap = v; }));
      section('Individual options');
      const gsel = (key, label, opts, hint) => row(label, select(`gfx.${key}`, [['auto', 'From the preset'], ...opts], () => g.applyQuality()), hint);
      gsel('shadows', 'Shadows', [[true, 'On'], [false, 'Off']]);
      gsel('shadowMapSize', 'Shadow detail', [[512, 'Low'], [1024, 'Medium'], [2048, 'High']]);
      gsel('drawDistance', 'View distance', [[350, 'Near'], [600, 'Middle'], [1000, 'Far']]);
      gsel('grassRange', 'Grass distance', [[0, 'No grass'], [20, 'Near'], [45, 'Far']], 'Takes effect on the next load on some devices');
      gsel('maxParticles', 'Effects', [[400, 'Light'], [1500, 'Normal'], [5000, 'Rich']]);
      gsel('textures', 'Texture detail', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], 'Sharper wood, brick, people and plants; takes effect on the next load'); // Part 16
      gsel('scaleMax', 'Sharpest resolution', [[0.75, '75%'], [0.85, '85%'], [1, 'Full']], 'The game lowers it when frames run slow');
      const bench = ui.button('Measure my device again', async () => { bench.disabled = true; const r = await g.detectQuality(true); ui.notify(r ? `Recommended quality: ${r}` : 'Measurement failed; quality unchanged'); bench.disabled = false; this._refresh('settings'); });
      body.append(bench, el('p', 'sd-hint', 'Anti-aliasing follows the preset and changes after a restart.'));
    } else if (this.page === 'controls') {
      row('Mouse sensitivity', slider('sensitivity', 0.2, 3, 0.05));
      row('Invert vertical look', toggle('invertY'));
      row('Aim', select('aimToggle', [[false, 'Hold to aim'], [true, 'Press to toggle']]));
      row('Crouch', select('crouchToggle', [[true, 'Press to toggle'], [false, 'Hold to crouch']]));
      row('Snap to target when aiming', toggle('targetLock'));
      row('Slow-motion kill camera', toggle('killCam'));
      section('Keys');
      for (const action of Object.keys(DEFAULT_KEYBINDS)) {
        const b = el('button', 'sd-button sd-key'); b.type = 'button';
        const show = () => { b.textContent = (S.get(`keybinds.${action}`) || []).map(keyName).join(' or ') || 'Unbound'; }; show();
        b.addEventListener('click', (e) => { e.preventDefault(); b.textContent = 'Press a key…'; g.input.captureNextKey((code) => { if (code && code !== 'Escape') S.set(`keybinds.${action}`, [code]); show(); }); });
        row(ACTION_LABELS[action] || action, b);
      }
      body.append(ui.button('Restore default keys', () => { S.set('keybinds', JSON.parse(JSON.stringify(DEFAULT_KEYBINDS))); this._refresh('settings'); }));
    } else if (this.page === 'gamepad') {
      row('Look sensitivity', slider('sensitivity', 0.2, 3, 0.05));
      body.append(el('p', 'sd-hint', 'Choose what each button does. Two buttons can share an action; an empty one does nothing.'));
      const cur = S.get('padbinds') || [...DEFAULT_PAD], actions = Object.keys(ACTION_LABELS).filter((a) => !a.startsWith('move'));
      DEFAULT_PAD.forEach((def, i) => {
        const s = el('select', 'sd-select'); const none = el('option', '', '—'); none.value = ''; s.append(none);
        for (const a of actions) { const o = el('option', '', ACTION_LABELS[a]); o.value = a; s.append(o); }
        s.value = cur[i] || '';
        s.addEventListener('change', () => { const next = [...(S.get('padbinds') || DEFAULT_PAD)]; next[i] = s.value || null; S.set('padbinds', next); });
        row(`${PAD_LABELS[def] || `Button ${i}`}`, s);
      });
      body.append(ui.button('Restore default buttons', () => { S.set('padbinds', null); this._refresh('settings'); }));
    } else if (this.page === 'audio') {
      for (const [key, label] of [['master', 'Master'], ['music', 'Music'], ['sfx', 'Effects'], ['ambience', 'Ambience'], ['ui', 'Interface']]) row(label, slider(`volumes.${key}`, 0, 1, 0.05, pct));
      body.append(el('p', 'sd-hint', 'Voices play on the effects bus; dialogue lowers the music on its own.'));
    } else if (this.page === 'access') {
      row('Subtitles', toggle('subtitles'));
      row('Subtitle size', slider('subtitleSize', 0.8, 1.8, 0.05, pct));
      row('Dark band behind subtitles', toggle('subtitleBackdrop'));
      row('Interface size', slider('uiScale', 0.8, 1.6, 0.05, pct), 'Bigger buttons and text everywhere');
      row('Colour-blind-friendly markers', toggle('colorblind'), 'Map and minimap marks keep their shapes and use a safe palette');
      row('Reduce motion', toggle('reduceMotion'), 'Less camera shake and fewer screen animations');
      row('Camera shake', slider('cameraShake', 0, 1, 0.05, pct));
      row('Aim assist', toggle('aimAssist'));
      row('Minimap', select('minimap', [['on', 'Shown'], ['off', 'Hidden']]));
      row('Fade the HUD when calm', toggle('hudFade'));
    } else if (this.page === 'touch') {
      row('Touch look sensitivity', slider('touchSensitivity', 0.2, 3, 0.05));
      row('Button size', slider('touchScale', 0.7, 1.4, 0.05, pct));
      row('Button opacity', slider('touchOpacity', 0.2, 1, 0.05, pct));
      row('Left-handed (stick on the right)', toggle('leftHanded'));
      row('Vibration', toggle('haptics'));
      const ed = el('div', 'sd-actions');
      ed.append(ui.button('Edit the layout…', () => ui.openScreen('touchlayout'), { primary: true }), ui.button('Left-handed preset', () => this.applyTouchPreset('left')), ui.button('Compact preset', () => this.applyTouchPreset('compact')), ui.button('Default layout', () => this.applyTouchPreset('default')));
      body.append(ed);
    }
    p.append(body);
    const foot = el('div', 'sd-book-foot'); foot.append(ui.button('Reset all settings', () => ui.openScreen('confirm', { text: 'Put every setting back the way it came?', yes: 'Reset', onYes: () => { S.reset(); g.applyQuality(); this._refresh('settings'); } })), ui.button('Back', () => ui.closeScreen(), { primary: true }));
    p.append(foot);
    return p;
  }

  // ---------------------------------------------------------------- touch layout
  /** The default position of every on-screen button, as screen fractions (measured from the CSS slots). */
  defaultTouchLayout() {
    const probe = el('div', 'sd-touch'); probe.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none';
    const out = {};
    for (const def of TOUCH_BUTTONS) { const b = el('button', `sd-tbtn sd-slot-${def.slot}${def.context ? ' sd-context' : ''}`, def.label); probe.append(b); }
    document.body.append(probe);
    const W = window.innerWidth, H = window.innerHeight;
    [...probe.children].forEach((b, i) => { const r = b.getBoundingClientRect(); out[TOUCH_BUTTONS[i].action] = { x: (r.left + r.width / 2) / W, y: (r.top + r.height / 2) / H, s: 1, a: 1 }; });
    probe.remove();
    return out;
  }
  /** 'default' | 'left' (mirrored, stick on the right) | 'compact' (smaller, tucked into the corners). */
  applyTouchPreset(name) {
    const S = this.game.settings;
    if (name === 'default') { S.set('touchLayout', {}); S.set('leftHanded', false); S.set('touchScale', 1); }
    else {
      const d = this.defaultTouchLayout(), out = {};
      for (const [a, o] of Object.entries(d)) {
        if (name === 'left') out[a] = { ...o, x: 1 - o.x };
        else { const top = o.y < 0.3; out[a] = { ...o, x: o.x > 0.5 ? 1 - (1 - o.x) * 0.85 : o.x * 0.85, y: top ? o.y * 0.9 : 1 - (1 - o.y) * 0.85, s: 0.85 }; }
      }
      S.set('touchLayout', out); if (name === 'left') S.set('leftHanded', true);
    }
    this.game.ui.notify(`Touch layout: ${name === 'left' ? 'left-handed' : name}.`);
  }
  _touchEditor() {
    const g = this.game, ui = g.ui, S = g.settings, wrap = el('div', 'sd-touch-editor');
    const cur = { ...this.defaultTouchLayout(), ...(S.get('touchLayout') || {}) };
    this._edit = JSON.parse(JSON.stringify(cur)); let sel = null;
    const panel = el('div', 'sd-panel sd-te-panel');
    const name = el('b', null, 'Drag a button to move it'), size = el('input'), alpha = el('input');
    for (const [i, min, max, step] of [[size, 0.5, 1.8, 0.05], [alpha, 0.15, 1, 0.05]]) { i.type = 'range'; i.min = min; i.max = max; i.step = step; i.disabled = true; }
    const lab = (t, i) => { const l = el('label', 'sd-row'); l.append(el('span', 'sd-row-label', t), i); return l; };
    panel.append(name, lab('Size', size), lab('Opacity', alpha));
    const btns = el('div', 'sd-actions');
    btns.append(ui.button('Save', () => { S.set('touchLayout', this._edit); ui.closeScreen(); ui.notify('Touch layout saved.'); }, { primary: true }), ui.button('Reset', () => { this._edit = this.defaultTouchLayout(); place(); }), ui.button('Cancel', () => ui.closeScreen()));
    panel.append(btns); wrap.append(panel);
    const els = new Map();
    const place = () => { for (const [a, b] of els) { const o = this._edit[a]; b.style.left = `${o.x * 100}%`; b.style.top = `${o.y * 100}%`; b.style.scale = String((o.s ?? 1) * (S.get('touchScale') ?? 1)); b.style.opacity = String(o.a ?? 1); b.classList.toggle('sd-sel', a === sel); } };
    const select = (a) => { sel = a; name.textContent = TOUCH_BUTTONS.find((d) => d.action === a)?.label || a; size.disabled = alpha.disabled = false; size.value = this._edit[a].s ?? 1; alpha.value = this._edit[a].a ?? 1; place(); };
    size.addEventListener('input', () => { if (sel) { this._edit[sel].s = Number(size.value); place(); } });
    alpha.addEventListener('input', () => { if (sel) { this._edit[sel].a = Number(alpha.value); place(); } });
    for (const def of TOUCH_BUTTONS) {
      const b = el('button', `sd-tbtn sd-te-btn${def.context ? ' sd-context' : ''}`, def.context ? 'Use' : def.label); b.type = 'button';
      let drag = null;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); select(def.action); drag = { x: e.clientX, y: e.clientY, ox: this._edit[def.action].x, oy: this._edit[def.action].y }; });
      b.addEventListener('pointermove', (e) => { if (!drag) return; const o = this._edit[def.action]; o.x = Math.max(0.03, Math.min(0.97, drag.ox + (e.clientX - drag.x) / window.innerWidth)); o.y = Math.max(0.04, Math.min(0.96, drag.oy + (e.clientY - drag.y) / window.innerHeight)); place(); });
      b.addEventListener('pointerup', () => { drag = null; }); b.addEventListener('pointercancel', () => { drag = null; });
      els.set(def.action, b); wrap.append(b);
    }
    const stick = el('div', 'sd-te-stick', 'Move stick zone'); stick.classList.toggle('sd-right', !!S.get('leftHanded')); wrap.append(stick);
    place();
    g.input.setTouchVisible(false);
    return wrap;
  }
  _editorClosed() { this._edit = null; }

  // ---------------------------------------------------------------- death
  _death() {
    const g = this.game, d = this.deathEl, loss = Math.round(g.sys('wallet').money * 0.05 * 100) / 100;
    d.textContent = '';
    const box = el('div', 'sd-death-box');
    box.append(el('h1', 'sd-death-title', 'Dead'), el('p', 'sd-death-sub', loss > 0 ? `The undertaker takes $${loss.toFixed(2)} for his trouble.` : 'Ashwater keeps no tally of the poor.'));
    const latest = g.save.latest();
    const m = el('nav', 'sd-menu');
    if (latest) m.append(g.ui.button('Load the last save instead', () => g.loadSlot(latest.slot)));
    box.append(m, el('p', 'sd-hint', 'Waking at the last camp, the ranch, or in town…'));
    d.append(box);
    setTimeout(() => { if (g.state !== 'dead') return; d.hidden = false; requestAnimationFrame(() => d.classList.add('sd-on')); }, TUNING.deathDelay * 1000);
  }
}
