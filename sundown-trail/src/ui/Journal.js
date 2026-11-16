import { EVENTS } from '../core/Events.js';
import { HONOR, honorTier } from '../data/honor.js';
import { STRUCTURES } from '../ranch/RanchBuilder.js';

/**
 * Eli's journal (Part 14, J): a notebook in his hand.
 *  Story     the tale so far (Eli's own words, growing as things happen; Part 15 adds the missions' pages)
 *  Missions  the log: active, finished and failed, with what's left to do (Part 15 fills it through addEntry)
 *  Ranch     what's built and what's next, the day's income, who lives there
 *  Stats     miles on foot and in the saddle, people and animals killed, pelts taken, money earned and spent,
 *            days passed, and a graph of honor over time across the five tiers
 * API (hud.journal): addEntry(id, { title, text, kind: 'main'|'side'|'job', status: 'active'|'done'|'failed', steps }),
 *   updateEntry(id, changes), addStory(text), stats.
 */
export const TUNING = { honorPoints: 240, honorEveryHours: 6, maxStory: 40 };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const PAGES = [['story', 'Story'], ['missions', 'Missions'], ['ranch', 'Ranch'], ['stats', 'Stats']];
const INTRO = 'Six years in the Fort Granger stockade, and the first thing I did when they opened the gate was ride for home. Mae says Judge Crane\'s company owns the Rourke place now, on a deed my father never signed. I mean to prove it.';

export class Journal {
  constructor(hud) {
    this.hud = hud; this.game = hud.game; this.page = 'story';
    this.entries = new Map(); this.story = []; this.honor = [];
    this.stats = { footM: 0, rideM: 0, kills: 0, headshots: 0, animals: 0, skinned: 0, earned: 0, spent: 0, deaths: 0 };
    const g = this.game, ev = g.events;
    ev.on(EVENTS.COMBAT_KILL, ({ target, headshot }) => { if (target && target !== g.player?.entity && target.type === 'npc') { this.stats.kills++; if (headshot) this.stats.headshots++; } });
    ev.on(EVENTS.ANIMAL_KILLED, () => { this.stats.animals++; });
    ev.on(EVENTS.HUNTING_SKINNED, () => { this.stats.skinned++; });
    ev.on(EVENTS.MONEY_CHANGED, ({ delta }) => { if (delta > 0) this.stats.earned += delta; else if (delta < 0) this.stats.spent -= delta; });
    ev.on(EVENTS.PLAYER_DIED, () => { this.stats.deaths++; });
    ev.on(EVENTS.HONOR_CHANGED, ({ value }) => this._honorPoint(value));
    ev.on(EVENTS.RANCH_UPGRADED, ({ structure }) => this.addStory(`The ${g.get('ranch')?.info?.(structure)?.name?.toLowerCase() || structure} at the ranch is finished. It's starting to look like home.`));
    ev.on(EVENTS.COMPANION_RECRUITED, ({ id }) => this.addStory(`${{ hollis: 'Hollis Grant', june: 'June Whitfield', abel: 'Abel Hutchins' }[id] || id} has thrown in with us at the ranch.`));
    ev.on(EVENTS.GAME_START, ({ newGame } = {}) => { if (newGame) this.reset(); });
    g.ui.registerScreen('journal', { pause: true, toggle: 'journal', build: () => this.build(), onTab: (d) => { const i = PAGES.findIndex((p) => p[0] === this.page); this.page = PAGES[(i + d + PAGES.length) % PAGES.length][0]; this.refresh(); g.audio?.play('ui_tick'); } });
    this._last = null;
  }
  reset() { this.entries.clear(); this.story = [{ day: 1, text: INTRO }]; this.honor = []; for (const k of Object.keys(this.stats)) this.stats[k] = 0; this._honorPoint(this.game.get('honor')?.value ?? 0); }

  // ---------------------------------------------------------------- API
  addEntry(id, e) { this.entries.set(id, { id, title: e.title || id, text: e.text || '', kind: e.kind || 'side', status: e.status || 'active', steps: e.steps || [], day: this._day() }); this.refresh(); return this.entries.get(id); }
  updateEntry(id, changes) { const e = this.entries.get(id); if (e) { Object.assign(e, changes); this.refresh(); } return e || null; }
  addStory(text) { if (!text || this.story.at(-1)?.text === text) return; this.story.push({ day: this._day(), text }); if (this.story.length > TUNING.maxStory) this.story.splice(1, 1); this.refresh(); }

  /** Per frame (from the HUD): distance on foot and in the saddle, honor over time. */
  track() {
    const g = this.game, pl = g.player; if (!pl?.position) return;
    const p = pl.position;
    if (this._last) { const d = Math.hypot(p.x - this._last.x, p.z - this._last.z); if (d < 40) { if (pl.state === 'mounted') this.stats.rideM += d; else if (pl.state === 'onFoot') this.stats.footM += d; } }
    this._last = { x: p.x, z: p.z };
    const t = this._time(), lastT = this.honor.at(-1)?.t ?? -1e9;
    if (t - lastT >= TUNING.honorEveryHours) this._honorPoint(g.get('honor')?.value ?? 0);
  }
  _day() { return this.game.sys('sky')?.day || 1; }
  _time() { const s = this.game.sys('sky'); return ((s?.day || 1) - 1) * 24 + (s?.timeOfDay ?? 12); }
  _honorPoint(v) { this.honor.push({ t: this._time(), v }); if (this.honor.length > TUNING.honorPoints) this.honor.splice(0, this.honor.length - TUNING.honorPoints); }

  // ---------------------------------------------------------------- screen
  refresh() { if (this.game.ui.topScreen() !== 'journal') return; const w = this.game.ui.stack.at(-1).wrap; w.firstChild.replaceWith(this.build()); w.querySelector('.sd-tab.sd-on')?.focus({ preventScroll: true }); }
  build() {
    const g = this.game, ui = g.ui, w = el('div', 'sd-panel sd-book sd-journal');
    const head = el('div', 'sd-book-head'); head.append(el('h2', 'sd-title', 'Journal'), el('span', 'sd-book-money', `Day ${this._day()}`)); w.append(head);
    const body = el('div', 'sd-book-body sd-journal-body'), tabs = el('nav', 'sd-tabs'), page = el('div', 'sd-page');
    for (const [id, label] of PAGES) tabs.append(ui.button(label, () => { this.page = id; this.refresh(); }, { className: `sd-tab${this.page === id ? ' sd-on' : ''}` }));
    this[`_${this.page}`](page);
    body.append(tabs, page); w.append(body);
    const foot = el('div', 'sd-book-foot'); foot.append(el('small', 'sd-hint', g.input.device === 'gamepad' ? 'LB / RB turn the page · B closes' : 'J or Esc closes · Q / E turn the page'), ui.button('Close', () => ui.closeScreen())); w.append(foot);
    return w;
  }
  _story(p) {
    p.append(el('h3', null, 'The story so far'));
    if (!this.story.length) this.story.push({ day: 1, text: INTRO });
    for (const s of this.story) { const para = el('p', 'sd-hand'); para.append(el('small', null, `Day ${s.day}. `), document.createTextNode(s.text)); p.append(para); }
    const h = this.game.get('honor'); if (h) p.append(el('p', 'sd-hint', `Folks hereabouts would call me ${honorTier(h.value).name.toLowerCase()}.`));
  }
  _missions(p) {
    const groups = [['active', 'In hand'], ['done', 'Finished'], ['failed', 'Failed']];
    let any = false;
    for (const [st, title] of groups) {
      const list = [...this.entries.values()].filter((e) => e.status === st); if (!list.length) continue; any = true;
      p.append(el('h3', null, title));
      for (const e of list) {
        const d = el('div', `sd-entry sd-${e.status}`); d.append(el('b', null, `${e.kind === 'main' ? '✦ ' : ''}${e.title}`), el('p', null, e.text));
        if (e.steps?.length) { const ul = el('ul'); for (const s of e.steps) { const li = el('li', s.done ? 'sd-done' : '', s.text || s); ul.append(li); } d.append(ul); }
        p.append(d);
      }
    }
    const comp = this.game.get('companions');
    if (comp?.lead) { any = true; p.append(el('h3', null, 'Errands')); p.append(el('div', 'sd-entry', `June's letter for ${comp.lead.to[0].toUpperCase() + comp.lead.to.slice(1)}: $${comp.lead.pay} on delivery.`)); }
    if (!any) p.append(el('p', 'sd-hint', 'Nothing in hand. Mae might know what needs doing; so might the sheriff\'s board in Copperbell.'));
  }
  _ranch(p) {
    const R = this.game.get('ranch');
    p.append(el('h3', null, 'Rourke Ranch'));
    if (!R) { p.append(el('p', 'sd-hint', 'The ranch is a ruin.')); return; }
    const built = STRUCTURES.filter((s) => R.level(s)), todo = STRUCTURES.filter((s) => !R.level(s));
    p.append(el('p', 'sd-hand', `${built.length} of ${STRUCTURES.length} works done. The place earns $${R.dailyIncome().toFixed(2)} a morning.`));
    const prog = el('div', 'sd-progress'); prog.append(Object.assign(el('meter'), { min: 0, max: STRUCTURES.length, value: built.length })); p.append(prog);
    const ul = el('ul', 'sd-checks');
    for (const s of STRUCTURES) { const li = el('li', R.level(s) ? 'sd-done' : R.pending.includes(s) ? 'sd-pending' : '', `${R.info(s).name}${R.level(s) ? '' : R.pending.includes(s) ? ' — tonight' : ` — $${R.info(s).cost}`}`); ul.append(li); }
    p.append(ul);
    if (todo.length) p.append(el('p', 'sd-hint', `Next: ${R.info(todo[0]).name.toLowerCase()} (${R.info(todo[0]).effect.toLowerCase()}).`));
    const who = this.game.get('companions')?.list?.() || [];
    if (who.length) p.append(el('p', 'sd-hand', `Living there: ${who.map((c) => c.name + (c.home ? '' : ' (in town, waiting on a bunk)')).join(', ')}.`));
  }
  _stats(p) {
    const s = this.stats, mi = (m) => `${(m / 1609).toFixed(1)} mi`;
    p.append(el('h3', null, 'Tally'));
    const dl = el('dl', 'sd-tally');
    for (const [k, v] of [['Walked', mi(s.footM)], ['Ridden', mi(s.rideM)], ['Days in Ashwater', String(this._day())], ['Men killed', `${s.kills}${s.headshots ? ` (${s.headshots} clean through the head)` : ''}`], ['Animals killed', String(s.animals)], ['Pelts and carcasses taken', String(s.skinned)], ['Money earned', `$${s.earned.toFixed(2)}`], ['Money spent', `$${s.spent.toFixed(2)}`], ['Times laid low', String(s.deaths)]]) dl.append(el('dt', null, k), el('dd', null, v));
    p.append(dl, el('h3', null, 'Honor'), this.honorGraph());
  }
  /** Honor over time as an SVG line across the five tier bands. */
  honorGraph(w = 460, h = 150) {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('class', 'sd-honor-graph');
    const y = (v) => h - 8 - ((v - HONOR.min) / (HONOR.max - HONOR.min)) * (h - 16);
    let lo = HONOR.min;
    HONOR.tiers.forEach((t, i) => { const r = document.createElementNS(NS, 'rect'); r.setAttribute('x', 0); r.setAttribute('width', w); r.setAttribute('y', y(Math.min(HONOR.max, t.max))); r.setAttribute('height', Math.max(0, y(lo) - y(Math.min(HONOR.max, t.max)))); r.setAttribute('class', `band b${i}`); svg.append(r); const tx = document.createElementNS(NS, 'text'); tx.setAttribute('x', 6); tx.setAttribute('y', (y(lo) + y(Math.min(HONOR.max, t.max))) / 2 + 4); tx.textContent = t.name; svg.append(tx); lo = t.max; });
    const pts = this.honor.length ? this.honor : [{ t: 0, v: this.game.get('honor')?.value ?? 0 }];
    const t0 = pts[0].t, t1 = Math.max(t0 + 1, pts.at(-1).t, this._time()), x = (t) => 40 + ((t - t0) / (t1 - t0)) * (w - 48);
    const line = document.createElementNS(NS, 'polyline');
    line.setAttribute('points', [...pts, { t: this._time(), v: this.game.get('honor')?.value ?? pts.at(-1).v }].map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' '));
    line.setAttribute('class', 'line'); svg.append(line);
    return svg;
  }
  serialize() { return { entries: [...this.entries.values()], story: this.story, honor: this.honor, stats: { ...this.stats } }; }
  deserialize(d) {
    if (!d) return;
    this.entries = new Map((d.entries || []).map((e) => [e.id, e])); this.story = d.story || []; this.honor = d.honor || []; Object.assign(this.stats, d.stats || {});
  }
}
