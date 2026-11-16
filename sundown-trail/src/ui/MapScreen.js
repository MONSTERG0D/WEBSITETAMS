import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { WORLD } from '../data/world.js';
import { drawIcon } from './MapArt.js';
import { mark, star, horseMark, PALETTES } from './Minimap.js';

/**
 * The 'map' system (Part 14, M): Ashwater County as a hand-drawn map, unfolded across the screen. Drawn from the
 * same baked parchment as the minimap (MapArt.js), with live ink on top: region names in display type, the river
 * and lake named, an icon and name for every place once you've been there (or close enough to see it), mission
 * markers, your horse, your waypoint and the GPS route, the wanted circle, and Eli. A compass rose, a scale bar in
 * miles, a cartouche and a legend.
 * Drag (or the left stick, arrows, WASD) to pan; wheel, pinch, +/− or the triggers to zoom; click, tap, A or Enter
 * to set a waypoint (on it again to clear it). The game is paused while it's open.
 * API: isDiscovered(id), discover(id), discovered, addMarker(id, { x, z, label, kind, color }), removeMarker(id),
 *      markers, open(), view.
 */
export const TUNING = { discoverEvery: 0.5, discoverRadius: 1.0, minScale: 0.22, maxScale: 6, startScale: 0.7, panSpeed: 700, zoomStep: 1.25, clickSlop: 6 };

const REGION_LABELS = [
  { name: 'ASHWATER VALLEY', x: -120, z: 120, rot: -0.08, size: 30 }, { name: 'BLACKSTONE HILLS', x: 640, z: 60, rot: 0.06, size: 28 },
  { name: 'SALTMESA', x: -640, z: 700, rot: -0.12, size: 32 }, { name: 'GREYWIND RANGE', x: 120, z: -820, rot: 0.04, size: 32 },
];
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export default class MapScreen extends System {
  constructor(game) {
    super(game);
    this.discovered = new Set(); this.markers = new Map(); this._t = 0;
    this.view = { x: 0, z: 0, s: TUNING.startScale };
  }
  async init() {
    const g = this.game;
    g.ui.registerScreen('map', { pause: true, toggle: 'map', nav: false, build: () => this._build(), onClose: () => this._close(), update: (dt) => this._pad(dt) });
    g.events.on(EVENTS.GAME_START, ({ newGame } = {}) => { if (newGame) { this.discovered.clear(); this.markers.clear(); } });
    g.events.on('map:baked', () => this._draw());
    g.debug?.addTuning('Map', TUNING);
  }

  // ---------------------------------------------------------------- API
  isDiscovered(id) { return this.discovered.has(id); }
  discover(id, silent = false) {
    const L = WORLD.locations[id]; if (!L || this.discovered.has(id)) return false;
    this.discovered.add(id);
    if (!silent && L.type !== 'edge') { this.game.ui.notify(`Discovered: ${L.name}`, { duration: 3 }); this.game.audio?.play('map_unfold', { volume: 0.4 }); }
    this.game.events.emit('map:discovered', { id });
    return true;
  }
  addMarker(id, m) { this.markers.set(id, { kind: 'mission', ...m }); this._draw(); return this.markers.get(id); }
  removeMarker(id) { const ok = this.markers.delete(id); this._draw(); return ok; }
  open() { if (!this.game.ui.isScreenOpen()) this.game.ui.openScreen('map'); }

  update(dt) {
    const g = this.game;
    if (g.state === 'playing' && g.input.pressed('map') && !g.ui.isScreenOpen()) this.open();
    if ((this._t += dt) < TUNING.discoverEvery) return;
    this._t = 0;
    const p = g.player?.position; if (!p) return;
    for (const [id, L] of Object.entries(WORLD.locations)) if (!this.discovered.has(id) && Math.hypot(L.x - p.x, L.z - p.z) < (L.radius || 40) * TUNING.discoverRadius + 20) this.discover(id);
  }

  // ---------------------------------------------------------------- the screen
  _build() {
    const g = this.game, ui = g.ui, hud = g.get('hud');
    if (hud && !hud.art && hud.artProgress < 0.01) hud._startBake?.();
    const p = g.player?.position || { x: 0, z: 0 };
    this.view.x = p.x; this.view.z = p.z;
    const w = el('div', 'sd-map'), cv = el('canvas', 'sd-map-canvas');
    this.canvas = cv; this.ctx = cv.getContext('2d'); this.wrapEl = w;
    const top = el('div', 'sd-map-top'); top.append(el('div', 'sd-map-title', 'Ashwater County'), el('small', 'sd-map-sub', 'Surveyed in the year 1899'));
    const tools = el('div', 'sd-map-tools');
    tools.append(
      ui.button('+', () => this.zoom(TUNING.zoomStep), { className: 'sd-map-btn' }), ui.button('−', () => this.zoom(1 / TUNING.zoomStep), { className: 'sd-map-btn' }),
      ui.button('Eli', () => { const q = g.player.position; this.view.x = q.x; this.view.z = q.z; this._draw(); }, { className: 'sd-map-btn' }),
      ui.button('Legend', () => { this.legend.hidden = !this.legend.hidden; }, { className: 'sd-map-btn' }),
      ui.button('Clear waypoint', () => { g.ui.clearWaypoint(); this._draw(); }, { className: 'sd-map-btn' }),
      ui.button('Close', () => ui.closeScreen(), { className: 'sd-map-btn', primary: true }),
    );
    this.legend = el('div', 'sd-map-legend'); this.legend.hidden = window.innerWidth < 700 || window.innerHeight < 500;
    this._legend();
    this.status = el('div', 'sd-map-status');
    this.hint = el('div', 'sd-map-hint', g.input.device === 'gamepad' ? 'Left stick pans · LT / RT zoom · A sets a waypoint · B closes' : g.isTouch ? 'Drag to pan · pinch to zoom · tap to set a waypoint' : 'Drag to pan · wheel to zoom · click to set a waypoint · M or Esc closes');
    w.append(cv, top, tools, this.legend, this.status, this.hint);
    this._bindPointer(cv);
    g.audio?.play('map_unfold', { volume: 0.7 });
    requestAnimationFrame(() => this._draw());
    this._resizeObs = new ResizeObserver(() => this._draw()); this._resizeObs.observe(w);
    this._waitArt();
    return w;
  }
  _waitArt() {
    const hud = this.game.get('hud');
    if (!this.canvas) return;
    if (hud?.art) { this.status.hidden = true; this._draw(); return; }
    this.status.hidden = false; this.status.textContent = `The ink is still drying… ${Math.round((hud?.artProgress || 0) * 100)}%`;
    this._draw();
    setTimeout(() => this._waitArt(), 250);
  }
  _close() { this._resizeObs?.disconnect(); this.canvas = null; this.ctx = null; }
  _legend() {
    const L = this.legend; L.textContent = '';
    L.append(el('h3', null, 'Legend'));
    const row = (draw, text) => { const r = el('div', 'sd-leg-row'), c = el('canvas'); c.width = c.height = 44; const x = c.getContext('2d'); draw(x); r.append(c, el('span', null, text)); L.append(r); };
    for (const [t, n] of [['town', 'Town'], ['home', 'Rourke Ranch'], ['outpost', 'Outpost'], ['estate', 'Estate'], ['camp', 'Camp'], ['hideout', 'Hideout'], ['landmark', 'Landmark']]) row((x) => drawIcon(x, t, 22, 24, 28), n);
    row((x) => { x.strokeStyle = 'rgba(52,36,22,.85)'; x.lineWidth = 7; x.beginPath(); x.moveTo(4, 22); x.lineTo(40, 22); x.stroke(); x.strokeStyle = 'rgb(226,206,160)'; x.lineWidth = 4; x.stroke(); }, 'Road');
    row((x) => { x.setLineDash([5, 4]); x.strokeStyle = 'rgba(52,36,22,.8)'; x.lineWidth = 2; x.beginPath(); x.moveTo(4, 22); x.lineTo(40, 22); x.stroke(); }, 'Trail');
    const P = PALETTES[this.game.settings.get('colorblind') ? 'colorblind' : 'normal'];
    row((x) => star(x, 22, 22, 12, '#c08a1e'), 'Mission'); row((x) => { x.save(); x.translate(22, 22); x.rotate(Math.PI / 4); x.fillStyle = P.waypoint; x.fillRect(-8, -8, 16, 16); x.restore(); }, 'Waypoint');
    row((x) => horseMark(x, 22, 22, 9, P.horse), 'Your horse');
    row((x) => { x.strokeStyle = P.route; x.lineWidth = 3; x.setLineDash([7, 5]); x.beginPath(); x.moveTo(4, 22); x.lineTo(40, 22); x.stroke(); }, 'Route');
  }
  zoom(f, sx = null, sy = null) {
    const v = this.view, cv = this.canvas; if (!cv) return;
    const W = cv.clientWidth, H = cv.clientHeight; sx ??= W / 2; sy ??= H / 2;
    const wx = v.x + (sx - W / 2) / v.s, wz = v.z + (sy - H / 2) / v.s;
    v.s = Math.max(TUNING.minScale, Math.min(TUNING.maxScale, v.s * f));
    v.x = wx - (sx - W / 2) / v.s; v.z = wz - (sy - H / 2) / v.s;
    this._clamp(); this._draw();
  }
  _clamp() { const v = this.view; v.x = Math.max(-1024, Math.min(1024, v.x)); v.z = Math.max(-1024, Math.min(1024, v.z)); }
  /** Screen pixel → world point. */
  toWorld(sx, sy) { const v = this.view, W = this.canvas.clientWidth, H = this.canvas.clientHeight; return { x: v.x + (sx - W / 2) / v.s, z: v.z + (sy - H / 2) / v.s }; }
  toScreen(x, z) { const v = this.view, W = this.canvas.clientWidth, H = this.canvas.clientHeight; return [W / 2 + (x - v.x) * v.s, H / 2 + (z - v.z) * v.s]; }
  /** Sets (or clears, if you click on it) the waypoint at a screen point. */
  clickAt(sx, sy) {
    const g = this.game, w = g.ui.waypoint;
    if (w) { const [wx, wy] = this.toScreen(w.x, w.z); if (Math.hypot(wx - sx, wy - sy) < 16) { g.ui.clearWaypoint(); g.audio?.play('ui_close', { volume: 0.5 }); this._draw(); return null; } }
    const p = this.toWorld(sx, sy);
    let label = '';
    for (const [id, L] of Object.entries(WORLD.locations)) { const [lx, ly] = this.toScreen(L.x, L.z); if (this.discovered.has(id) && Math.hypot(lx - sx, ly - sy) < 18) { p.x = L.x; p.z = L.z; label = L.name; break; } }
    g.ui.setWaypoint(p.x, p.z, label);
    g.audio?.play('ui_click', { volume: 0.6 });
    const hud = g.get('hud'); if (hud) { hud._routeT = 0; hud._gps?.(0); }
    this._draw();
    return p;
  }
  _bindPointer(cv) {
    const pts = new Map(); let drag = null, pinch = null;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY }); if (pts.size === 1) drag = { x: e.offsetX, y: e.offsetY, vx: this.view.x, vz: this.view.z, moved: 0 }; else if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: this.view.s }; drag = null; } });
    cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pinch && pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); this.zoom((pinch.s * d / pinch.d) / this.view.s, (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
      if (drag) { const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y; drag.moved = Math.max(drag.moved, Math.hypot(dx, dy)); this.view.x = drag.vx - dx / this.view.s; this.view.z = drag.vz - dy / this.view.s; this._clamp(); this._draw(); }
    });
    const up = (e) => { if (drag && pts.size === 1 && drag.moved < TUNING.clickSlop && e.type === 'pointerup') this.clickAt(e.offsetX, e.offsetY); pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) drag = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.offsetX, e.offsetY); }, { passive: false });
    this._keys = (e) => {
      if (this.game.ui.topScreen() !== 'map') return;
      const k = e.code, step = 80 / this.view.s;
      if (k === 'ArrowLeft' || k === 'KeyA') this.view.x -= step; else if (k === 'ArrowRight' || k === 'KeyD') this.view.x += step;
      else if (k === 'ArrowUp' || k === 'KeyW') this.view.z -= step; else if (k === 'ArrowDown' || k === 'KeyS') this.view.z += step;
      else if (k === 'Equal' || k === 'NumpadAdd') this.zoom(TUNING.zoomStep); else if (k === 'Minus' || k === 'NumpadSubtract') this.zoom(1 / TUNING.zoomStep);
      else if (k === 'Enter' && document.activeElement === document.body) { this.clickAt(this.canvas.clientWidth / 2, this.canvas.clientHeight / 2); }
      else return;
      e.preventDefault(); this._clamp(); this._draw();
    };
    window.addEventListener('keydown', this._keys);
    const off = () => { window.removeEventListener('keydown', this._keys); };
    const obs = new MutationObserver(() => { if (!cv.isConnected) { off(); obs.disconnect(); } }); obs.observe(document.body, { childList: true, subtree: true });
  }
  /** Gamepad: left stick pans, triggers zoom, A sets a waypoint at the centre. */
  _pad(dt) {
    const inp = this.game.input; if (inp.device !== 'gamepad' || !this.canvas) return;
    const m = inp.padMove || { x: 0, y: 0 };
    if (Math.hypot(m.x, m.y) > 0.05) { this.view.x += m.x * TUNING.panSpeed * dt / this.view.s; this.view.z -= m.y * TUNING.panSpeed * dt / this.view.s; this._clamp(); this._draw(); }
    if (inp.isDown('fire')) this.zoom(1 + dt * 1.6); if (inp.isDown('aim')) this.zoom(1 / (1 + dt * 1.6));
    if (inp.pressed('jump')) this.clickAt(this.canvas.clientWidth / 2, this.canvas.clientHeight / 2);
    this._padMode = true;
  }

  // ---------------------------------------------------------------- drawing
  _draw() {
    if (!this.canvas || this._drawQueued) return;
    this._drawQueued = true;
    const run = () => { this._drawQueued = false; this.render(); };
    if (document.hidden) run(); else requestAnimationFrame(run);
  }
  /** Draws the map now. */
  render() {
    const cv = this.canvas; if (!cv) return;
    const g = this.game, dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth || window.innerWidth, H = cv.clientHeight || window.innerHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = this.ctx, v = this.view, art = g.get('hud')?.art, P = PALETTES[g.settings.get('colorblind') ? 'colorblind' : 'normal'];
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#2a1e14'; c.fillRect(0, 0, W, H);
    // the parchment
    c.save(); c.translate(W / 2, H / 2); c.scale(v.s, v.s); c.translate(-v.x, -v.z);
    c.imageSmoothingQuality = 'high';
    if (art) c.drawImage(art.canvas, -1024, -1024, 2048, 2048);
    else { c.fillStyle = '#e2d2ae'; c.fillRect(-1024, -1024, 2048, 2048); }
    c.lineWidth = 2 / v.s; c.strokeStyle = 'rgba(52,36,22,0.8)'; c.strokeRect(-1024, -1024, 2048, 2048);
    // wanted circle and route
    const law = g.get('law');
    if (law?.level > 0 && law.search?.radius > 0) { c.fillStyle = 'rgba(194,56,30,0.14)'; c.strokeStyle = P.search; c.setLineDash([8 / v.s, 6 / v.s]); c.beginPath(); c.arc(law.search.center.x, law.search.center.z, law.search.radius, 0, Math.PI * 2); c.fill(); c.stroke(); c.setLineDash([]); }
    const route = g.get('hud')?.route?.points;
    if (route?.length > 1) { c.strokeStyle = P.route; c.lineWidth = 3.5 / v.s; c.lineCap = 'round'; c.lineJoin = 'round'; c.setLineDash([9 / v.s, 6 / v.s]); c.beginPath(); const pp = g.player?.position || { x: route[0][0], z: route[0][1] }; c.moveTo(pp.x, pp.z); for (let i = 1; i < route.length; i++) c.lineTo(route[i][0], route[i][1]); c.stroke(); c.setLineDash([]); }
    c.restore();
    // labels and icons in screen space
    const ink = 'rgba(46,30,16,0.92)';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const R of REGION_LABELS) {
      const [sx, sy] = this.toScreen(R.x, R.z), size = Math.max(12, Math.min(46, R.size * Math.sqrt(v.s) * 0.9));
      c.save(); c.translate(sx, sy); c.rotate(R.rot); c.font = `${size}px Rye, Georgia, serif`; c.fillStyle = 'rgba(70,44,22,0.42)';
      spaced(c, R.name, 0, 0, size * 0.28); c.restore();
    }
    // the river and lake
    const rv = WORLD.river[3], lake = WORLD.locations.mirrorLake;
    labelItalic(c, 'Ashwater River', ...this.toScreen(rv[0] - 30, rv[1]), -1.25, Math.max(11, 15 * Math.sqrt(v.s)), 'rgba(40,60,70,0.85)');
    if (this.discovered.has('mirrorLake')) labelItalic(c, 'Mirror Lake', ...this.toScreen(lake.x, lake.z + 6), 0, Math.max(11, 15 * Math.sqrt(v.s)), 'rgba(40,60,70,0.9)');
    const iconS = Math.max(16, Math.min(34, 26 * Math.sqrt(v.s)));
    for (const [id, L] of Object.entries(WORLD.locations)) {
      if (L.type === 'lake' || (!this.discovered.has(id) && L.type !== 'edge')) continue;
      const [sx, sy] = this.toScreen(L.x, L.z); if (sx < -40 || sy < -40 || sx > W + 40 || sy > H + 40) continue;
      drawIcon(c, L.type, sx, sy, iconS, ink);
      c.font = `${L.type === 'town' ? 'bold ' : ''}${Math.round(Math.max(11, iconS * 0.52))}px Georgia, serif`; c.fillStyle = ink;
      c.lineWidth = 3; c.strokeStyle = 'rgba(232,218,184,0.85)'; c.strokeText(L.name, sx, sy + iconS * 0.85); c.fillText(L.name, sx, sy + iconS * 0.85);
    }
    // markers, horse, waypoint, Eli
    for (const m of this.markers.values()) { const [sx, sy] = this.toScreen(m.x, m.z); star(c, sx, sy, 11, m.color || '#c08a1e'); if (m.label) { c.font = 'italic 13px Georgia, serif'; c.fillStyle = ink; c.fillText(m.label, sx, sy - 18); } }
    const horse = g.get('horses')?.playerHorse;
    if (horse && g.player?.state !== 'mounted') { const [sx, sy] = this.toScreen(horse.position.x, horse.position.z); horseMark(c, sx, sy, 8, P.horse); }
    const w = g.ui.waypoint;
    if (w) { const [sx, sy] = this.toScreen(w.x, w.z); c.save(); c.translate(sx, sy); c.rotate(Math.PI / 4); c.fillStyle = P.waypoint; c.strokeStyle = '#f4ead2'; c.lineWidth = 2; c.fillRect(-8, -8, 16, 16); c.strokeRect(-8, -8, 16, 16); c.restore(); }
    const pl = g.player;
    if (pl?.position) {
      const [sx, sy] = this.toScreen(pl.position.x, pl.position.z), yaw = pl.yaw ?? 0;
      c.save(); c.translate(sx, sy); c.rotate(-yaw); c.fillStyle = P.player; c.strokeStyle = '#f4ead2'; c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(0, -13); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill(); c.stroke(); c.restore();
    }
    // people on the map: only companions at the ranch and lawmen chasing you (the map isn't a radar)
    const npcs = g.get('npcs');
    for (const n of npcs?.list || []) { if (n.dead) continue; const hostile = npcs.hostile?.(n, pl?.entity); if (!n.companion && !(hostile && law?.level)) continue; const [sx, sy] = this.toScreen(n.position.x, n.position.z); mark(c, hostile ? 'hostile' : 'companion', sx, sy, 4, hostile ? P.hostile : P.companion); }
    // crosshair for the gamepad
    if (this._padMode) { c.strokeStyle = 'rgba(46,30,16,0.8)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(W / 2 - 12, H / 2); c.lineTo(W / 2 + 12, H / 2); c.moveTo(W / 2, H / 2 - 12); c.lineTo(W / 2, H / 2 + 12); c.stroke(); }
    // compass rose and scale bar
    rose(c, W - 70, H - 90, 42);
    scaleBar(c, 24, H - 40, v.s);
  }
  serialize() { return { discovered: [...this.discovered], markers: [...this.markers.entries()] }; }
  deserialize(d) { this.discovered = new Set(d?.discovered || []); this.markers = new Map(d?.markers || []); }
}

function spaced(c, text, x, y, gap) {
  const widths = [...text].map((ch) => c.measureText(ch).width), total = widths.reduce((a, b) => a + b, 0) + gap * (text.length - 1);
  let cx = x - total / 2;
  [...text].forEach((ch, i) => { c.fillText(ch, cx + widths[i] / 2, y); cx += widths[i] + gap; });
}
function labelItalic(c, text, x, y, rot, size, color) { c.save(); c.translate(x, y); c.rotate(rot); c.font = `italic ${Math.round(size)}px Georgia, serif`; c.fillStyle = color; c.fillText(text, 0, 0); c.restore(); }
function rose(c, x, y, r) {
  c.save(); c.translate(x, y); c.strokeStyle = 'rgba(46,30,16,0.85)'; c.fillStyle = 'rgba(46,30,16,0.85)'; c.lineWidth = 1.2;
  c.beginPath(); c.arc(0, 0, r * 0.62, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(0, 0, r * 0.56, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, long = i % 2 === 0, L = long ? r : r * 0.6, wdt = long ? r * 0.14 : r * 0.1;
    c.save(); c.rotate(a); c.beginPath(); c.moveTo(0, -L); c.lineTo(wdt, 0); c.lineTo(0, 0); c.closePath(); c.fill(); c.beginPath(); c.moveTo(0, -L); c.lineTo(-wdt, 0); c.lineTo(0, 0); c.closePath(); c.stroke(); c.restore();
  }
  c.font = `${Math.round(r * 0.38)}px Rye, Georgia, serif`; c.textAlign = 'center'; c.fillText('N', 0, -r - r * 0.25);
  c.restore();
}
function scaleBar(c, x, y, s) {
  const mile = 1609, opts = [0.125, 0.25, 0.5, 1], target = 160;
  let m = opts[0]; for (const o of opts) if (o * mile * s <= target) m = o;
  const L = m * mile * s;
  c.save(); c.strokeStyle = 'rgba(46,30,16,0.9)'; c.fillStyle = 'rgba(46,30,16,0.9)'; c.lineWidth = 1.5;
  c.strokeRect(x, y, L, 6); c.fillRect(x, y, L / 2, 6);
  c.font = 'italic 12px Georgia, serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillText(m === 1 ? '1 mile' : `${m === 0.5 ? '½' : m === 0.25 ? '¼' : '⅛'} mile`, x, y - 4);
  c.restore();
}
