import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { ITEMS } from '../data/items.js';

/**
 * The 'survival' system (GAME_BIBLE §6 cores, §11: cores {health, stamina, focus} · eat(itemId) · use(itemId)).
 * Each core runs 0–100 and empties over about two in-game days; sprinting and the cold of the high snow
 * country burn them faster. A core under 25 halves its bar's regeneration and warns once (core:low); an empty
 * health core stops health regenerating at all. Food refills cores, tonics refill bars and cores, sleep
 * (hotel, camp, ranch) refills them by the hour, and cooked meat can fortify a core so it doesn't drain for a
 * while. Health regenerates slowly a few seconds after the last hit. Shows a small core diamond beside each bar
 * and a simple satchel (I) until Part 14's full one replaces it.
 */
export const TUNING = {
  drainPerHour: 100 / 48, sprintDrain: 3, coldDrain: 1.6, lowAt: 25, lowClear: 32, lowRegen: 0.5,
  healthRegen: 0.9, healthRegenDelay: 6, sleepPerHour: { health: 9, stamina: 12, focus: 8 }, maxStep: 0.75,
};
const CORES = ['health', 'stamina', 'focus'];
const LOW_TEXT = {
  health: "You're hungry and your health won't come back. Eat something.",
  stamina: "You're worn down. Eat, or get some sleep.",
  focus: "Your focus is slipping. Coffee or rest will help.",
};

export default class Survival extends System {
  constructor(game) {
    super(game);
    this.cores = { health: 100, stamina: 100, focus: 100 };
    this.buffs = {}; // core → seconds of fortification left
    this._low = { health: false, stamina: false, focus: false };
    this._lastHit = -99; this._clock = null; this._pips = null;
  }

  async init() {
    const g = this.game;
    g.events.on(EVENTS.PLAYER_DAMAGED, () => { this._lastHit = g.now ?? performance.now() / 1000; });
    g.events.on(EVENTS.CAMP_SLEPT, ({ hours = 8 }) => this.rest(hours));
    g.events.on(EVENTS.GAME_START, ({ newGame } = {}) => { if (newGame) { for (const c of CORES) this.cores[c] = 100; this.buffs = {}; } });
    g.events.on(EVENTS.PLAYER_RESPAWNED, () => { for (const c of CORES) this.cores[c] = Math.max(this.cores[c], 40); });
    this._makePips();
    if (!g.ui.screens?.has?.('satchel')) g.ui.registerScreen('satchel', { build: () => this._buildSatchel() });
    g.debug?.addTuning('Survival', TUNING);
  }

  // ---------------------------------------------------------------- Bible API
  /** Eats or drinks a food item from the satchel. @returns {boolean} */
  eat(itemId) {
    const d = ITEMS[itemId], inv = this.game.sys('inventory');
    if (!d?.effects || (d.category !== 'food' && d.category !== 'tonic')) return false;
    if (!inv.remove(itemId, 1)) return false;
    this._apply(d.effects);
    this.game.audio.play(d.category === 'tonic' || itemId === 'coffee' ? 'drink' : 'eat', { volume: 0.7 });
    this.game.ui.notify(`${d.category === 'tonic' ? 'Drank' : 'Ate'}: ${d.name}${d.effects.buff ? ` · ${d.effects.buff.core} fortified` : ''}`, { duration: 2.5 });
    return true;
  }
  /** Uses any consumable: food and tonics on Eli, horse items on the horse. @returns {boolean} */
  use(itemId) {
    const d = ITEMS[itemId];
    if (!d) return false;
    if (d.category === 'food' || d.category === 'tonic') return this.eat(itemId);
    if (d.effects?.horse) {
      const h = this.game.get('horses')?.playerHorse;
      if (!h || h.position.distanceTo(this.game.player.position) > 4) { this.game.ui.notify('Your horse needs to be close.'); return false; }
      return !!h.feed?.(itemId);
    }
    return false;
  }
  /** Sleep: refill cores for the hours slept (hotel, camp and ranch all send camp:slept). */
  rest(hours) {
    const T = TUNING.sleepPerHour, h = Math.max(0, Math.min(12, hours));
    for (const c of CORES) this.cores[c] = Math.min(100, this.cores[c] + T[c] * h);
    const pl = this.game.player; pl.health = pl.maxHealth; pl.stamina = 100;
  }
  isLow(core) { return this.cores[core] < TUNING.lowAt; }

  _apply(fx) {
    const pl = this.game.player;
    if (fx.cores) for (const c of CORES) if (fx.cores[c]) this.cores[c] = Math.min(100, this.cores[c] + fx.cores[c]);
    if (fx.health) pl.health = Math.min(pl.maxHealth, pl.health + fx.health);
    if (fx.stamina) pl.stamina = Math.min(100, pl.stamina + fx.stamina);
    if (fx.focus) { const f = this.game.get('focus'); if (f) f.meter = Math.min(100, f.meter + fx.focus); else pl.focus = Math.min(100, pl.focus + fx.focus); }
    if (fx.cores) { pl.health = Math.min(pl.maxHealth, pl.health + (fx.cores.health || 0) * 0.4); pl.stamina = Math.min(100, pl.stamina + (fx.cores.stamina || 0) * 0.6); }
    if (fx.buff) this.buffs[fx.buff.core] = Math.max(this.buffs[fx.buff.core] || 0, fx.buff.seconds);
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.game, pl = g.player, sky = g.sys('sky');
    if (g.state !== 'playing') return;
    // game hours since last frame (big jumps are sleeps and are handled by rest())
    const now = (sky.day || 1) * 24 + (sky.timeOfDay ?? 12);
    let hours = this._clock === null ? 0 : now - this._clock; this._clock = now;
    if (!(hours > 0) || hours > TUNING.maxStep) hours = 0;
    const cold = g.sys('terrain').getBiomeAt?.(pl.position.x, pl.position.z) === 'snow' && !g.get('towns')?.zone?.interior ? 1 + (TUNING.coldDrain - 1) * (g.get('ranch')?.coldFactor?.() ?? 1) : 1; // Part 13: the sheepskin coat halves it
    const sprinting = pl.state === 'onFoot' && Math.hypot(pl.velocity.x, pl.velocity.z) > 5.5;
    for (const c of CORES) {
      if (this.buffs[c] > 0) { this.buffs[c] -= dt; continue; }
      let k = TUNING.drainPerHour * hours;
      if (c === 'health') k *= cold;
      if (c === 'stamina' && sprinting) k *= TUNING.sprintDrain;
      this.cores[c] = Math.max(0, this.cores[c] - k);
    }
    // regeneration scaled by the cores
    for (const c of CORES) pl.regenScale[c] = this.cores[c] <= 0 ? (c === 'health' ? 0 : 0.25) : this.cores[c] < TUNING.lowAt ? TUNING.lowRegen : 1;
    const t = g.now ?? performance.now() / 1000;
    if (pl.state !== 'dead' && pl.health < pl.maxHealth && t - this._lastHit > TUNING.healthRegenDelay) pl.health = Math.min(pl.maxHealth, pl.health + TUNING.healthRegen * pl.regenScale.health * dt);
    // warnings
    for (const c of CORES) {
      if (!this._low[c] && this.cores[c] < TUNING.lowAt) { this._low[c] = true; g.events.emit(EVENTS.CORE_LOW, { core: c }); g.ui.notify(LOW_TEXT[c], { duration: 4 }); }
      else if (this._low[c] && this.cores[c] > TUNING.lowClear) this._low[c] = false;
    }
    if (g.input.pressed('satchel') && !g.ui.isScreenOpen() && g.ui.screens?.has?.('satchel') && !g.get('hud')) g.ui.openScreen('satchel');
    this._drawPips();
  }

  // ---------------------------------------------------------------- HUD: a small diamond per core beside each bar
  _makePips() {
    const ui = this.game.ui; if (!ui.barEls) return;
    this._pips = {};
    for (const c of CORES) {
      const row = ui.barEls[c]?.row, label = row?.querySelector('.sd-bar-label'); if (!label) continue;
      const pip = document.createElement('span'); pip.className = 'sd-core'; pip.title = `${c} core`;
      label.prepend(pip); this._pips[c] = { pip, v: -1, f: null };
    }
  }
  _drawPips() {
    if (!this._pips) return;
    for (const c of CORES) {
      const P = this._pips[c]; if (!P) continue;
      const v = Math.round(this.cores[c]), f = this.buffs[c] > 0;
      if (v === P.v && f === P.f) continue;
      P.v = v; P.f = f;
      P.pip.style.setProperty('--core', v);
      P.pip.classList.toggle('low', v < TUNING.lowAt); P.pip.classList.toggle('fort', f);
    }
  }

  // ---------------------------------------------------------------- a simple satchel (Part 14 replaces it)
  _buildSatchel() {
    const g = this.game, ui = g.ui, wrap = document.createElement('div'); wrap.className = 'sd-panel sd-shop sd-satchel';
    const render = () => {
      wrap.innerHTML = '';
      const head = document.createElement('div'); head.className = 'sd-shop-head';
      head.innerHTML = `<h2 class="sd-title" style="margin:0">Satchel</h2><span class="sd-shop-money">$${g.sys('wallet').money.toFixed(2)}</span><small>Cores: health ${this.cores.health.toFixed(0)} · stamina ${this.cores.stamina.toFixed(0)} · focus ${this.cores.focus.toFixed(0)}${Object.entries(this.buffs).filter(([, s]) => s > 0).map(([c, s]) => ` · ${c} fortified ${Math.ceil(s / 60)} min`).join('')}</small>`;
      wrap.append(head);
      const list = document.createElement('div'); list.className = 'sd-shop-list'; list.style.maxHeight = '52vh';
      const inv = g.sys('inventory');
      const groups = [['food', 'Food'], ['tonic', 'Tonics'], ['horse', 'For the horse'], ['material', 'Materials'], ['pelt', 'Pelts'], ['valuable', 'Valuables'], ['ammo', 'Ammunition']];
      for (const [cat, title] of groups) {
        const items = inv.list(cat); if (!items.length) continue;
        const c = document.createElement('div'); c.className = 'sd-shop-cat'; c.textContent = title; list.append(c);
        for (const { id, qty, def } of items) {
          const r = document.createElement('div'); r.className = 'sd-shop-row';
          const n = document.createElement('div'); n.textContent = `${def?.name || id} ×${qty}`;
          const fx = def?.effects?.cores ? Object.entries(def.effects.cores).map(([k, v]) => `+${v} ${k}`).join(' ') : '';
          const p = document.createElement('div'); p.textContent = fx;
          r.append(document.createElement('span'), n, p);
          if (cat === 'food' || cat === 'tonic' || (cat === 'horse' && def?.effects?.horse)) r.append(ui.button(cat === 'horse' ? 'Give' : cat === 'tonic' ? 'Drink' : 'Eat', () => { this.use(id); render(); }));
          list.append(r);
        }
      }
      if (!list.childElementCount) list.textContent = 'Your satchel is empty.';
      const camp = g.get('camp'), row = document.createElement('div'); row.className = 'sd-menu'; row.style.flexDirection = 'row';
      if (camp) row.append(camp.camp ? ui.button('Pack up camp', () => { ui.closeScreen(); camp.breakCamp(); }) : ui.button('Make camp', () => { ui.closeScreen(); camp.make(); }));
      row.append(ui.button('Close', () => ui.closeScreen(), { primary: true }));
      wrap.append(list, row);
    };
    render();
    return wrap;
  }

  serialize() { return { cores: { ...this.cores }, buffs: { ...this.buffs } }; }
  deserialize(d) {
    if (!d) return;
    for (const c of CORES) if (Number.isFinite(d.cores?.[c])) this.cores[c] = Math.max(0, Math.min(100, d.cores[c]));
    this.buffs = { ...(d.buffs || {}) }; this._clock = null;
  }
  dispose() { if (this._pips) for (const P of Object.values(this._pips)) P.pip.remove(); }
}
