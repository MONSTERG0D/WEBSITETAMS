import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { WEAPONS } from '../data/weapons.js';
import { HONOR, honorTier } from '../data/honor.js';
import { Minimap } from './Minimap.js';
import { RoadGraph, distToPolyline } from './Gps.js';
import { bake, treesFromVegetation } from './MapArt.js';
import { Satchel } from './Satchel.js';
import { Journal } from './Journal.js';

/**
 * The 'hud' system (Part 14, GAME_BIBLE §7): the final parchment-and-ink HUD, laid over Part 0's UI (every UI API
 * name stays; ui.setBars, notify, prompt, setObjective, subtitle, setWaypoint… still drive it).
 *  minimap    circular, turning with the camera (Minimap.js), over the baked hand-drawn map (MapArt.js)
 *  cores      rings for health, stamina and Focus: the thick inner arc is the bar, the thin outer arc the core;
 *             the horse's health and stamina rings join them while you ride, with its bond level in the middle
 *  weapon     an ink silhouette of the gun in hand, rounds in the cylinder and in the satchel (tap to reload)
 *  money      the purse and the honor scale slide in when they change
 *  wanted     Part 7's badge, restyled as a torn notice; the search circle is drawn on the minimap
 *  GPS        a dashed ink route to the waypoint that follows the roads (Gps.js), redrawn when you stray
 * Everything fades by context: the rings sink when you're healthy and calm, the weapon when it's holstered, the
 * purse and honor after a few seconds. Also builds the satchel (I) and journal (J) screens.
 */
export const TUNING = { calmAfter: 4, showFor: 5, weaponShowFor: 4, routeEvery: 1.2, rerouteOff: 35, artSizeHigh: 2048, artSizeLow: 1024, bakeSliceMs: 10, minimap: true };

const RING = (cls, title) => `<svg class="sd-ring ${cls}" viewBox="0 0 44 44" aria-label="${title}"><circle class="bg" cx="22" cy="22" r="17"/><circle class="bar" cx="22" cy="22" r="17"/><circle class="core-bg" cx="22" cy="22" r="20.5"/><circle class="core" cx="22" cy="22" r="20.5"/><text x="22" y="23">${title[0]}</text></svg>`;
const ICONS = {
  revolver: 'M4 14h18l3-3h10v4h-6l-1 2h-5l-2 7h-5l1-6H4z M26 17a2 2 0 1 0 0.1 0',
  repeater: 'M2 13h30l4-2h8v3l-6 1-2 1h-6l-1 5-3 1-1-5H14l-8 3-3-3 4-2H2z',
  shotgun: 'M2 12h34v2H2z M2 15h34v1.6H2z M30 17h6l1 2-6 3-8 1v-4z',
  rifle: 'M1 13h34l4-1h5v3h-9l-3 2-4 6-4-1 2-5H10l-6 2-3-3z',
  bow: 'M10 3c14 6 14 32 0 38 M10 3v38 M6 22h32 M34 19l4 3-4 3',
  knife: 'M4 20l20-6c6-1 12 1 14 3-4 1-10 2-16 4l-3 3h-6l-1-2z',
  lasso: 'M22 6a12 8 0 1 1-0.1 0 M22 22c-2 6-8 10-14 14',
  fists: 'M10 14h20v12a6 6 0 0 1-6 6h-8a6 6 0 0 1-6-6z M10 18h20 M16 14v4 M22 14v4',
};
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const C = 2 * Math.PI * 17, CC = 2 * Math.PI * 20.5;

export default class HUD extends System {
  constructor(game) {
    super(game);
    this.mock = {}; this.route = null; this.art = null; this.artProgress = 0; this._calm = 0; this._routeT = 0; this._wpKey = '';
    this._show = { money: 0, honor: 0, weapon: 0 }; this.stats = { reroutes: 0 };
  }

  async init() {
    const g = this.game, ui = g.ui;
    ui.root.classList.add('sd-v2');
    this.root = el('div', 'sd-hud2'); ui.hud.append(this.root);
    // minimap and rings
    this.cluster = el('div', 'sd-cluster'); this.root.append(this.cluster);
    this.minimap = new Minimap(this, this.cluster);
    this.rings = el('div', 'sd-rings', RING('r-health', 'Health') + RING('r-stamina', 'Stamina') + RING('r-focus', 'Focus'));
    this.horseRings = el('div', 'sd-rings sd-horse-rings', RING('r-hhealth', 'Horse health') + RING('r-hstamina', 'Horse stamina'));
    this.cluster.append(this.rings, this.horseRings);
    this.ringEls = {};
    for (const [k, cls] of [['health', 'r-health'], ['stamina', 'r-stamina'], ['focus', 'r-focus'], ['hhealth', 'r-hhealth'], ['hstamina', 'r-hstamina']]) {
      const svg = this.cluster.querySelector(`.${cls}`); this.ringEls[k] = { svg, bar: svg.querySelector('.bar'), core: svg.querySelector('.core'), text: svg.querySelector('text'), v: -1, c: -1 };
    }
    this.ringEls.hhealth.text.textContent = '1';
    // weapon
    this.weapon = el('div', 'sd-wpn', '<svg viewBox="0 0 44 44" class="sd-wpn-icon"><path/></svg><div class="sd-wpn-ammo"><b></b><span></span></div><small></small>');
    this.weapon.addEventListener('pointerdown', (e) => { e.stopPropagation(); g.input.latched?.add?.('reload'); });
    this.root.append(this.weapon);
    // purse and honor
    this.purse = el('div', 'sd-purse', '<b class="sd-cash"></b><div class="sd-honor"><span class="sd-honor-scale"><i></i></span><small></small></div>');
    this.root.append(this.purse);
    // data and screens
    this.satchel = new Satchel(this); this.journal = new Journal(this);
    g.events.on(EVENTS.MONEY_CHANGED, () => { this._show.money = TUNING.showFor; });
    g.events.on(EVENTS.HONOR_CHANGED, () => { this._show.honor = TUNING.showFor; this._show.money = TUNING.showFor; });
    for (const e of [EVENTS.WEAPON_EQUIPPED, EVENTS.WEAPON_FIRED, EVENTS.WEAPON_RELOADED]) g.events.on(e, () => { this._show.weapon = TUNING.weaponShowFor; });
    g.events.on(EVENTS.SETTINGS_CHANGED, ({ key }) => { if (key === 'subtitleSize' || key === '*' || key === 'minimap' || key === 'hudFade') this._applySettings(); });
    this._applySettings();
    // GPS road graph
    const T = g.get('terrain');
    if (T?.roads?.length) this.gps = new RoadGraph(T.roads);
    // bake the hand-drawn map in the background
    if (T?.data) this._startBake();
    g.debug?.addTuning('HUD', TUNING);
  }
  _applySettings() {
    const S = this.game.settings, r = document.documentElement.style;
    r.setProperty('--sub-scale', String(S.get('subtitleSize') ?? 1));
    this.root.classList.toggle('sd-nomap', S.get('minimap') === 'off');
    this.root.classList.toggle('sd-nofade', S.get('hudFade') === false);
  }
  _startBake() {
    const g = this.game, size = g.quality?.name === 'high' ? TUNING.artSizeHigh : TUNING.artSizeLow;
    const it = bake(g.get('terrain').data, { size, trees: treesFromVegetation(g.get('vegetation')) });
    const t0 = performance.now();
    const step = () => {
      const s = performance.now();
      let r;
      do { r = it.next(); } while (!r.done && performance.now() - s < TUNING.bakeSliceMs);
      if (r.done) { this.art = r.value; this.artProgress = 1; this.bakeMs = Math.round(performance.now() - t0); g.events.emit('map:baked', { ms: this.bakeMs }); return; }
      this.artProgress = r.value; setTimeout(step, 0);
    };
    setTimeout(step, 0);
  }
  /** Runs the bake to completion right now (tests, or when the map is opened before it's finished). */
  finishBake() {
    if (this.art || !this.game.get('terrain')?.data) return this.art;
    const it = bake(this.game.get('terrain').data, { size: this.game.quality?.name === 'high' ? TUNING.artSizeHigh : TUNING.artSizeLow, trees: treesFromVegetation(this.game.get('vegetation')) });
    let r; do { r = it.next(); } while (!r.done);
    this.art = r.value; this.artProgress = 1;
    return this.art;
  }

  // ---------------------------------------------------------------- state
  /** What the HUD shows, from the game systems (test pages override fields through hud.mock). */
  read() {
    const g = this.game, pl = g.player, sv = g.get('survival'), horse = g.get('horses')?.playerHorse, A = g.get('combat')?.arsenal, inv = g.sys('inventory');
    const id = A?.drawn ? A.current : null, W = id && WEAPONS[id];
    return {
      health: pl?.health ?? 100, stamina: pl?.stamina ?? 100, focus: pl?.focus ?? 100,
      cores: sv?.cores ? { ...sv.cores } : { health: 100, stamina: 100, focus: 100 },
      mounted: pl?.state === 'mounted' && !!horse,
      horse: horse ? { health: (horse.health / (horse.maxHealth || 100)) * 100, stamina: (horse.stamina / (horse.controller?.maxStamina || 100)) * 100, bond: horse.bond?.level ?? 1 } : null,
      weapon: id ? { id, name: W?.name || id, rounds: W?.mag ? A.rounds : null, reserve: W?.ammo ? inv.count(W.ammo) : null } : null,
      aiming: !!g.get('combat')?.isAiming, focusActive: !!g.get('focus')?.active,
      money: g.sys('wallet').money, honor: g.get('honor')?.value ?? 0, wanted: g.get('law')?.level ?? 0,
    };
  }

  update(dt, rawDt) {
    const g = this.game;
    this._keys();
    if (g.state !== 'playing' && g.state !== 'dead' && g.state !== 'paused') return;
    const s = { ...this.read(), ...this.mock }, step = rawDt ?? dt;
    // rings
    this._ring('health', s.health, s.cores.health); this._ring('stamina', s.stamina, s.cores.stamina); this._ring('focus', s.focus, s.cores.focus);
    this.rings.classList.toggle('sd-focus-on', !!s.focusActive);
    this.horseRings.classList.toggle('sd-on', !!(s.mounted && s.horse));
    if (s.horse) { this._ring('hhealth', s.horse.health, null); this._ring('hstamina', s.horse.stamina, null); this.ringEls.hhealth.text.textContent = String(s.horse.bond); }
    const calmNow = s.health >= 99 && s.stamina >= 99 && s.focus >= 99 && Math.min(s.cores.health, s.cores.stamina, s.cores.focus) >= 50 && !s.aiming && !s.wanted && !s.mounted;
    this._calm = calmNow ? this._calm + step : 0;
    this.cluster.classList.toggle('sd-calm', this._calm > TUNING.calmAfter);
    // weapon
    this._show.weapon -= step;
    const w = s.weapon;
    this.weapon.classList.toggle('sd-on', !!w && (s.aiming || this._show.weapon > 0 || (w.rounds !== null && w.rounds === 0)));
    if (w) {
      const key = `${w.id}|${w.rounds}|${w.reserve}`;
      if (key !== this._wKey) {
        this._wKey = key;
        const icon = ICONS[w.id] || ICONS.fists;
        this.weapon.querySelector('path').setAttribute('d', icon);
        this.weapon.querySelector('b').textContent = w.rounds === null ? '' : String(w.rounds);
        this.weapon.querySelector('.sd-wpn-ammo span').textContent = w.reserve === null ? '' : `/ ${w.reserve}`;
        this.weapon.querySelector('small').textContent = w.name;
        this.weapon.classList.toggle('sd-empty', w.rounds === 0);
      }
    }
    // purse and honor
    this._show.money -= step; this._show.honor -= step;
    this.purse.classList.toggle('sd-on', this._show.money > 0 || this._show.honor > 0 || g.ui.isScreenOpen?.() && ['satchel', 'journal'].includes(g.ui.topScreen()));
    const mk = `${s.money.toFixed(2)}|${s.honor.toFixed(1)}`;
    if (mk !== this._mKey) {
      this._mKey = mk;
      this.purse.querySelector('.sd-cash').textContent = `$${s.money.toFixed(2)}`;
      const t = (s.honor - HONOR.min) / (HONOR.max - HONOR.min);
      this.purse.querySelector('.sd-honor-scale i').style.left = `${(t * 100).toFixed(1)}%`;
      this.purse.querySelector('.sd-honor small').textContent = honorTier(s.honor).name;
    }
    if (g.state === 'playing') this.journal.track();
    // minimap and GPS
    this._gps(step);
    if (g.settings.get('minimap') !== 'off') this.minimap.update(step);
  }
  _ring(k, v, core) {
    const r = this.ringEls[k]; if (!r) return;
    v = Math.max(0, Math.min(100, v ?? 0));
    if (Math.abs(v - r.v) > 0.3) { r.v = v; r.bar.style.strokeDashoffset = String(C * (1 - v / 100)); r.svg.classList.toggle('sd-low', v < 25); }
    if (core !== null && core !== undefined && Math.abs(core - r.c) > 0.3) { r.c = core; r.core.style.strokeDashoffset = String(CC * (1 - core / 100)); r.svg.classList.toggle('sd-core-low', core < 20); }
  }
  /** Re-plans the GPS route when the waypoint moves or Eli strays from it. */
  _gps(step) {
    const g = this.game, w = g.ui.waypoint, p = g.player?.position;
    if (!w || !p) { this.route = null; this._wpKey = ''; return; }
    const key = `${w.x.toFixed(1)},${w.z.toFixed(1)}`;
    if ((this._routeT -= step) > 0 && key === this._wpKey) return;
    this._routeT = TUNING.routeEvery;
    if (key === this._wpKey && this.route && distToPolyline(p.x, p.z, this.route.points) < TUNING.rerouteOff) return;
    this._wpKey = key;
    this.route = this.gps ? this.gps.route(p.x, p.z, w.x, w.z) : { points: [[p.x, p.z], [w.x, w.z]], onRoads: false };
    this.stats.reroutes++;
  }
  /** Keyboard / gamepad toggles for the satchel and journal (the map screen handles M). */
  _keys() {
    const g = this.game, ui = g.ui, inp = g.input;
    for (const [action, screen] of [['satchel', 'satchel'], ['journal', 'journal']]) {
      if (!inp.pressed(action)) continue; // closing with the same key is handled by the UI (screen def.toggle)
      if (g.state === 'playing' && !ui.isScreenOpen() && g.player?.state !== 'dead') ui.openScreen(screen);
    }
  }
  serialize() { return { journal: this.journal.serialize() }; }
  deserialize(d) { this.journal.deserialize(d?.journal); }
  dispose() { this.root?.remove(); this.game.ui.root.classList.remove('sd-v2'); }
}
