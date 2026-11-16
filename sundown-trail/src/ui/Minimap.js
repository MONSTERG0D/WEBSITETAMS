import { drawIcon } from './MapArt.js';
import { WORLD } from '../data/world.js';

/**
 * The circular minimap (Part 14): a window onto the baked parchment map, turning with the camera so the way you
 * look is always up. It zooms out when you ride. On top, in ink: the GPS route, the wanted search circle, places
 * (once discovered, or when close), mission markers, people as small marks by faction (shapes as well as colours,
 * so they read without colour), the waypoint (clamped to the rim when far), your horse, and Eli's arrow in the
 * middle. A small N rides the rim.
 */
export const TUNING = { size: 168, sizeTouch: 132, rangeFoot: 170, rangeRide: 280, zoomRate: 2.5, every: 1 / 24, npcRange: 1.1, poiNear: 260 };

export const PALETTES = {
  normal: { hostile: '#b8321e', law: '#2f5d8a', civilian: '#f4ead2', companion: '#4f7d3a', animal: '#8a6a3a', route: '#9a2d14', waypoint: '#9a2d14', search: '#c2381e', player: '#1d1610', horse: '#5a3a1e' },
  colorblind: { hostile: '#d55e00', law: '#0072b2', civilian: '#f0f0f0', companion: '#009e73', animal: '#e69f00', route: '#d55e00', waypoint: '#cc79a7', search: '#d55e00', player: '#000000', horse: '#56b4e9' },
};

export class Minimap {
  constructor(hud, parent) {
    this.hud = hud; this.game = hud.game;
    this.el = document.createElement('div'); this.el.className = 'sd-mm';
    this.canvas = document.createElement('canvas'); this.canvas.className = 'sd-mm-canvas';
    this.ring = document.createElement('div'); this.ring.className = 'sd-mm-ring';
    this.el.append(this.canvas, this.ring); parent.append(this.el);
    this.ctx = this.canvas.getContext('2d'); this.range = TUNING.rangeFoot; this._t = 0; this._px = 0;
  }
  get palette() { return PALETTES[this.game.settings.get('colorblind') ? 'colorblind' : 'normal']; }
  _resize() {
    const css = this.el.clientWidth || TUNING.size, px = Math.round(css * Math.min(2, window.devicePixelRatio || 1));
    if (px !== this._px) { this._px = px; this.canvas.width = this.canvas.height = px; }
    return px;
  }
  update(dt) {
    if ((this._t += dt) < TUNING.every) return;
    const step = this._t; this._t = 0;
    const g = this.game, pl = g.player; if (!pl?.position) return;
    const S = this._resize(), c = this.ctx, P = this.palette, art = this.hud.art;
    const riding = pl.state === 'mounted', want = riding ? TUNING.rangeRide : TUNING.rangeFoot;
    this.range += (want - this.range) * Math.min(1, step * TUNING.zoomRate);
    const R = this.range, k = (S / 2) / R, yaw = g.cameraRig?.yaw ?? pl.yaw ?? 0, px = pl.position.x, pz = pl.position.z;
    this.yaw = yaw;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, S, S);
    c.save(); c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#e2d2ae'; c.fillRect(0, 0, S, S);
    // the baked map, rotated so the camera looks up
    c.translate(S / 2, S / 2); c.rotate(yaw); c.scale(k, k); c.translate(-px, -pz);
    if (art) {
      const r = R * 1.5, mpp = art.mpp, sx = Math.max(0, (px - r + 1024) / mpp), sy = Math.max(0, (pz - r + 1024) / mpp), sw = Math.min(art.size - sx, 2 * r / mpp), sh = Math.min(art.size - sy, 2 * r / mpp);
      if (sw > 0 && sh > 0) c.drawImage(art.canvas, sx, sy, sw, sh, sx * mpp - 1024, sy * mpp - 1024, sw * mpp, sh * mpp);
    }
    const lw = 1 / k;
    // wanted search circle
    const law = g.get('law');
    if (law?.level > 0 && law.search?.radius > 0) {
      c.strokeStyle = P.search; c.lineWidth = 2.5 * lw; c.setLineDash([6 * lw, 4 * lw]); c.fillStyle = 'rgba(194,56,30,0.12)';
      c.beginPath(); c.arc(law.search.center.x, law.search.center.z, law.search.radius, 0, Math.PI * 2); c.fill(); c.stroke(); c.setLineDash([]);
    }
    // GPS route
    const route = this.hud.route?.points;
    if (route?.length > 1) {
      c.strokeStyle = P.route; c.lineWidth = 3.2 * lw; c.lineCap = 'round'; c.lineJoin = 'round'; c.setLineDash([7 * lw, 5 * lw]);
      c.beginPath(); c.moveTo(px, pz); for (let i = 1; i < route.length; i++) c.lineTo(route[i][0], route[i][1]); c.stroke(); c.setLineDash([]);
    }
    c.restore();
    // screen-space marks (they don't rotate)
    const toScreen = (x, z) => { const dx = (x - px) * k, dz = (z - pz) * k, cs = Math.cos(yaw), sn = Math.sin(yaw); return [S / 2 + dx * cs - dz * sn, S / 2 + dx * sn + dz * cs]; };
    const inside = (sx, sy, pad = 0) => Math.hypot(sx - S / 2, sy - S / 2) < S / 2 - pad;
    const sc = S / TUNING.size;
    // places
    const map = g.get('map');
    for (const [id, L] of Object.entries(WORLD.locations)) {
      const d = Math.hypot(L.x - px, L.z - pz);
      if (!(map?.isDiscovered?.(id) || d < TUNING.poiNear)) continue;
      const [sx, sy] = toScreen(L.x, L.z); if (!inside(sx, sy, 8 * sc)) continue;
      drawIcon(c, L.type, sx, sy, 15 * sc, 'rgba(40,26,14,0.95)');
    }
    // mission and other markers
    for (const m of map?.markers?.values?.() || []) {
      let [sx, sy] = toScreen(m.x, m.z); const r = S / 2 - 9 * sc, dd = Math.hypot(sx - S / 2, sy - S / 2);
      if (dd > r) { sx = S / 2 + (sx - S / 2) * r / dd; sy = S / 2 + (sy - S / 2) * r / dd; }
      star(c, sx, sy, 6.5 * sc, m.color || '#c08a1e');
    }
    // people
    const npcs = g.get('npcs');
    for (const n of npcs?.list || []) {
      if (n.dead) continue;
      const d = Math.hypot(n.position.x - px, n.position.z - pz); if (d > R * TUNING.npcRange) continue;
      const [sx, sy] = toScreen(n.position.x, n.position.z); if (!inside(sx, sy, 3)) continue;
      const hostile = npcs.hostile?.(n, pl.entity), kind = hostile ? 'hostile' : n.companion ? 'companion' : n.faction === 'law' ? 'law' : 'civilian';
      if (kind === 'civilian' && d > R * 0.7) continue;
      mark(c, kind, sx, sy, 3.6 * sc, P[kind]);
    }
    // predators that are hunting you
    for (const a of g.get('wildlife')?.list || []) {
      if (!a.alive || !a.isPredator || !['charge', 'attack', 'circle', 'stalk'].includes(a.state)) continue;
      const [sx, sy] = toScreen(a.position.x, a.position.z); if (inside(sx, sy, 3)) mark(c, 'hostile', sx, sy, 3.2 * sc, P.hostile);
    }
    // horse
    const horse = g.get('horses')?.playerHorse;
    if (horse && !riding && horse.alive !== false) { const [sx, sy] = toScreen(horse.position.x, horse.position.z); if (inside(sx, sy, 4)) horseMark(c, sx, sy, 5 * sc, P.horse); }
    // waypoint (on the rim when it's further than the map shows)
    const w = g.ui.waypoint;
    if (w) {
      let [sx, sy] = toScreen(w.x, w.z); const r = S / 2 - 8 * sc, dd = Math.hypot(sx - S / 2, sy - S / 2);
      if (dd > r) { sx = S / 2 + (sx - S / 2) * r / dd; sy = S / 2 + (sy - S / 2) * r / dd; }
      c.save(); c.translate(sx, sy); c.rotate(Math.PI / 4); c.fillStyle = P.waypoint; c.strokeStyle = '#f4ead2'; c.lineWidth = 1.5 * sc; c.fillRect(-5 * sc, -5 * sc, 10 * sc, 10 * sc); c.strokeRect(-5 * sc, -5 * sc, 10 * sc, 10 * sc); c.restore();
    }
    // Eli
    const facing = (pl.yaw ?? yaw) - yaw;
    c.save(); c.translate(S / 2, S / 2); c.rotate(-facing); c.fillStyle = P.player; c.strokeStyle = '#f4ead2'; c.lineWidth = 1.6 * sc;
    c.beginPath(); c.moveTo(0, -8 * sc); c.lineTo(5.5 * sc, 6 * sc); c.lineTo(0, 3 * sc); c.lineTo(-5.5 * sc, 6 * sc); c.closePath(); c.fill(); c.stroke(); c.restore();
    // N on the rim
    const nx = S / 2 + Math.sin(yaw) * (S / 2 - 10 * sc), ny = S / 2 - Math.cos(yaw) * (S / 2 - 10 * sc);
    c.fillStyle = 'rgba(244,234,210,0.9)'; c.beginPath(); c.arc(nx, ny, 7.5 * sc, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#7a2a12'; c.font = `bold ${Math.round(10 * sc)}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', nx, ny + 0.5);
    // vignette
    const grd = c.createRadialGradient(S / 2, S / 2, S * 0.36, S / 2, S / 2, S / 2); grd.addColorStop(0, 'rgba(60,40,20,0)'); grd.addColorStop(1, 'rgba(60,40,20,0.35)');
    c.fillStyle = grd; c.beginPath(); c.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); c.fill();
  }
}

/** A faction mark: hostile ▲, law ■, companion ◆, civilian ●, animal ● (shape carries the meaning without colour). */
export function mark(c, kind, x, y, s, color) {
  c.fillStyle = color; c.strokeStyle = 'rgba(29,22,16,0.9)'; c.lineWidth = Math.max(1, s * 0.35);
  c.beginPath();
  if (kind === 'hostile') { c.moveTo(x, y - s * 1.2); c.lineTo(x + s * 1.1, y + s * 0.8); c.lineTo(x - s * 1.1, y + s * 0.8); c.closePath(); }
  else if (kind === 'law') c.rect(x - s * 0.85, y - s * 0.85, s * 1.7, s * 1.7);
  else if (kind === 'companion') { c.moveTo(x, y - s * 1.15); c.lineTo(x + s * 1.15, y); c.lineTo(x, y + s * 1.15); c.lineTo(x - s * 1.15, y); c.closePath(); }
  else c.arc(x, y, s * 0.85, 0, Math.PI * 2);
  c.fill(); c.stroke();
}
export function star(c, x, y, s, color) {
  c.fillStyle = color; c.strokeStyle = 'rgba(29,22,16,0.9)'; c.lineWidth = Math.max(1, s * 0.18); c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * 0.45 : s; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.closePath(); c.fill(); c.stroke();
}
export function horseMark(c, x, y, s, color) {
  c.fillStyle = color; c.strokeStyle = '#f4ead2'; c.lineWidth = Math.max(1, s * 0.25);
  c.beginPath(); c.arc(x, y, s, 0, Math.PI * 2); c.fill(); c.stroke();
  c.strokeStyle = '#f4ead2'; c.beginPath(); c.moveTo(x - s * 0.45, y + s * 0.4); c.lineTo(x - s * 0.45, y - s * 0.4); c.quadraticCurveTo(x + s * 0.5, y - s * 0.55, x + s * 0.4, y + s * 0.4); c.stroke();
}
