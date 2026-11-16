import { EVENTS } from '../core/Events.js';
import { ITEMS } from '../data/items.js';

/**
 * The satchel (Part 14, I / D-pad left): a leather-bound inventory on parchment. Tabs down the side for each kind
 * of thing you carry, a grid of what's in it with counts against the carry limit, and a detail page for the
 * selected item: what it does, what a shop pays for it, and Eat / Drink / Use / Feed the horse. Make camp is here
 * too (as the Bible's controls table asks). Carry limits apply everywhere: inventory.limit() caps every add, shops
 * won't sell what won't fit, and anything left over is announced.
 */
export const TUNING = {
  limits: { food: 10, tonic: 8, horse: 10, tool: 2, material: 12, pelt: 12, valuable: 30, clothing: 1, quest: 1 },
  ammoLimits: { ammo_revolver: 96, ammo_repeater: 96, ammo_shotgun: 40, ammo_arrow: 36, ammo_rifle: 30 },
};
const TABS = [
  ['food', 'Provisions', ['food']], ['tonic', 'Tonics', ['tonic']], ['ammo', 'Ammunition', ['ammo']], ['horse', 'Horse', ['horse', 'tool']],
  ['pelt', 'Pelts and meat', ['pelt', 'material']], ['valuable', 'Valuables', ['valuable']], ['clothing', 'Clothing', ['clothing']], ['quest', 'Documents', ['quest']],
];
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

/** Carry limit for an item id (Infinity when uncapped). */
export function carryLimit(id) {
  const d = ITEMS[id]; if (!d) return Infinity;
  if (d.category === 'ammo') return TUNING.ammoLimits[id] ?? 60;
  return TUNING.limits[d.category] ?? Infinity;
}
/** A short line about what an item does. */
export function describe(id) {
  const d = ITEMS[id]; if (!d) return '';
  const fx = d.effects || {}, parts = [];
  if (fx.health) parts.push(`restores ${fx.health} health`);
  if (fx.stamina) parts.push(`restores ${fx.stamina} stamina`);
  if (fx.focus) parts.push(`restores ${fx.focus} Focus`);
  if (fx.cores) parts.push(`fills cores: ${Object.entries(fx.cores).map(([c, v]) => `${c} +${v}`).join(', ')}`);
  if (fx.buff) parts.push(`fortifies ${fx.buff.core} for ${Math.round((fx.buff.seconds || 0) / 60)} min`);
  if (fx.horse) parts.push(`for your horse: ${Object.entries(fx.horse).map(([k, v]) => `${k} +${v}`).join(', ')}`);
  if (d.category === 'ammo') parts.push(`${d.pack || 1} to a box`);
  if (d.category === 'pelt') parts.push(`${'★'.repeat(d.quality || 1)} quality; butchers and trappers buy it`);
  if (d.category === 'material') parts.push('raw meat: cook it at camp or sell it to a butcher');
  if (d.category === 'valuable') parts.push('a fence or the general store will buy it');
  if (d.category === 'clothing') parts.push('change into it at the ranch wardrobe');
  if (d.category === 'quest') parts.push('important; keep it safe');
  return parts.join(' · ') || '—';
}

export class Satchel {
  constructor(hud) {
    this.hud = hud; this.game = hud.game; this.tab = 'food'; this.sel = null;
    const g = this.game, inv = g.sys('inventory');
    inv.limit = carryLimit;
    g.events.on(EVENTS.ITEM_REJECTED, ({ id, qty }) => { const now = g.now; if (now - (this._rejT || -9) > 1.5) { this._rejT = now; g.ui.notify(`No room in the satchel for ${qty > 1 ? `${qty} more` : 'another'} ${ITEMS[id]?.name || id}.`, { duration: 3 }); } });
    g.ui.registerScreen('satchel', { pause: true, toggle: 'satchel', build: () => this.build(), onTab: (d) => this._tabStep(d) });
  }
  _tabStep(d) { const i = TABS.findIndex((t) => t[0] === this.tab); this.tab = TABS[(i + d + TABS.length) % TABS.length][0]; this.sel = null; this.refresh(); this.game.audio?.play('ui_tick'); }
  refresh() { if (this.game.ui.topScreen() !== 'satchel') return; const w = this.game.ui.stack.at(-1).wrap, had = document.activeElement?.classList?.contains('sd-tab') ? '.sd-tab.sd-on' : '.sd-item.sd-on'; w.firstChild.replaceWith(this.build()); (w.querySelector(had) || w.querySelector('.sd-tab.sd-on'))?.focus({ preventScroll: true }); }
  build() {
    const g = this.game, ui = g.ui, inv = g.sys('inventory'), sv = g.get('survival');
    const w = el('div', 'sd-panel sd-book sd-satchel2');
    const head = el('div', 'sd-book-head'); head.append(el('h2', 'sd-title', 'Satchel'), el('span', 'sd-book-money', `$${g.sys('wallet').money.toFixed(2)}`)); w.append(head);
    const body = el('div', 'sd-book-body'), tabs = el('nav', 'sd-tabs'), grid = el('div', 'sd-items'), detail = el('div', 'sd-detail');
    for (const [id, label, cats] of TABS) {
      const n = cats.reduce((a, c) => a + inv.list(c).length, 0);
      const b = ui.button(`${label}${n ? ` (${n})` : ''}`, () => { this.tab = id; this.sel = null; this.refresh(); }, { className: `sd-tab${this.tab === id ? ' sd-on' : ''}` });
      tabs.append(b);
    }
    const cats = TABS.find((t) => t[0] === this.tab)[2], items = cats.flatMap((c) => inv.list(c)).sort((a, b) => (a.def?.name || a.id).localeCompare(b.def?.name || b.id));
    if (!this.sel || !items.some((x) => x.id === this.sel)) this.sel = items[0]?.id || null;
    if (!items.length) grid.append(el('p', 'sd-hint', 'Nothing here.'));
    for (const it of items) {
      const cap = carryLimit(it.id), cell = ui.button('', () => { this.sel = it.id; this.refresh(); }, { className: `sd-item${this.sel === it.id ? ' sd-on' : ''}` });
      cell.append(el('b', null, it.def?.name || it.id), el('small', null, `${it.qty}${cap < Infinity ? ` / ${cap}` : ''}`));
      if (cap < Infinity && it.qty >= cap) cell.classList.add('sd-full');
      grid.append(cell);
    }
    if (this.sel) {
      const d = ITEMS[this.sel], qty = inv.count(this.sel), price = g.get('shops')?.sellPrice?.(this.sel);
      detail.append(el('h3', null, d?.name || this.sel), el('p', null, describe(this.sel)));
      const facts = el('dl'); const add = (k, v) => { facts.append(el('dt', null, k), el('dd', null, v)); };
      add('Carrying', `${qty}${carryLimit(this.sel) < Infinity ? ` of ${carryLimit(this.sel)}` : ''}`);
      if (price) add('Sells for', `$${Number(price).toFixed(2)}`);
      else if (d?.basePrice) add('Worth', `about $${d.basePrice.toFixed(2)}`);
      detail.append(facts);
      const act = el('div', 'sd-actions');
      if (d?.category === 'food' || d?.category === 'tonic') act.append(ui.button(d.category === 'tonic' || this.sel === 'coffee' ? 'Drink' : 'Eat', () => { sv?.eat?.(this.sel); this.refresh(); }, { primary: true, disabled: !sv }));
      if (d?.effects?.horse) act.append(ui.button('Give to your horse', () => { sv?.use?.(this.sel); this.refresh(); }, { primary: true }));
      detail.append(act);
    } else detail.append(el('p', 'sd-hint', 'Choose something to look at it.'));
    if (sv?.cores) {
      const cores = el('div', 'sd-corebox');
      cores.append(el('small', 'sd-hint', 'Cores')); for (const c of ['health', 'stamina', 'focus']) { const r = el('div', 'sd-corerow'), bar = el('span', `sd-corebar sd-c-${c}`), fill = el('i'); fill.style.width = `${Math.round(sv.cores[c])}%`; bar.append(fill); r.append(el('span', null, c[0].toUpperCase() + c.slice(1)), bar); cores.append(r); }
      detail.append(cores);
    }
    const camp = g.get('camp');
    if (camp) detail.append(ui.button('Make camp here', () => { const ok = camp.canCamp?.(); if (ok?.ok === false) { ui.notify(ok.reason); return; } ui.closeScreen(); camp.make?.(); }));
    body.append(tabs, grid, detail); w.append(body);
    const foot = el('div', 'sd-book-foot'); foot.append(el('small', 'sd-hint', g.input.device === 'gamepad' ? 'LB / RB change pages · B closes' : 'I or Esc closes · Q / E change pages'), ui.button('Close', () => ui.closeScreen())); w.append(foot);
    return w;
  }
}
