import { WANTED, sketchPortrait } from '../../town/Signs.js';
import { ECONOMY } from '../../data/economy.js';

/**
 * Bounties from the sheriff's board (Part 15): the posters on Copperbell's board become jobs. Take one and the
 * target's hideout goes on the map: a camp with a fire and a few hard men somewhere in his region. Kill him and
 * report to the sheriff for the "dead" reward, or hogtie him (lasso, then E) and bring him within sight of the
 * sheriff's office — on your shoulder or across your saddle — for the "alive" reward. Jack Ransome's poster stays
 * up for the story. Rewards follow the poster (inside the Bible's $20–60 dead / $35–120 alive).
 * Each bounty is a generated mission ('bounty_<id>') run by the missions system; the board is the Shops 'board'
 * screen, rebuilt with buttons.
 */
export const TUNING = { deliverRadius: 14, gangMin: 1, gangMax: 3 };
const HIDEOUTS = { loomis: [-300, 420], calloway: [520, 430], whitmore: [-120, -470], hatcher: [700, -160], voss: [-660, 240] };

export class Bounties {
  constructor(sys) {
    this.sys = sys; this.game = sys.game; this.done = new Set(); this.taken = null;
    for (const w of WANTED) if (w.id !== 'ransome') sys.register(this._def(w));
    const ui = this.game.ui;
    ui.registerScreen('board', { build: () => this._board() });
  }
  reset() { this.done.clear(); this.taken = null; }
  update() {}
  list() { return WANTED.filter((w) => w.id !== 'ransome').map((w) => ({ ...w, state: this.done.has(w.id) ? 'done' : this.sys.active?.id === `bounty_${w.id}` ? 'active' : 'open' })); }
  /** Takes a bounty (starts its mission). */
  take(id) { if (this.done.has(id) || this.sys.active) return false; return this.sys.start(`bounty_${id}`); }

  _def(w) {
    const hx = HIDEOUTS[w.id] || [0, 300], sheriff = (ctx) => ctx.stage.place('sheriff');
    const clamp = (v, [a, b]) => Math.max(a, Math.min(b, v));
    return {
      id: `bounty_${w.id}`, title: w.name, kicker: 'Bounty', kind: 'bounty', requires: () => !this.done.has(w.id),
      summary: `${w.crime}. $${w.alive} alive, $${w.dead} dead.`,
      rewards: (f) => ({ money: f[`b_${w.id}`] === 'alive' ? clamp(w.alive, ECONOMY.bounty.alive) : clamp(w.dead, ECONOMY.bounty.dead), honor: f[`b_${w.id}`] === 'alive' ? 2 : 0 }),
      onComplete: () => { this.done.add(w.id); },
      prepare: (ctx) => { ctx.data.camp ||= ctx.stage.place(`flat:${hx[0]},${hx[1]}`); },
      steps: [
        { id: 'ride', type: 'ride', text: `Find ${w.name}'s hideout`, at: (ctx) => ctx.data.camp, radius: 45, checkpoint: true,
          setup: (ctx) => {
            const S = ctx.stage, c = ctx.data.camp, n = TUNING.gangMin + (w.seed % (TUNING.gangMax - TUNING.gangMin + 1));
            S.fire(c, 1.2);
            S.spawn('target', { name: w.name, role: w.female ? 'townswoman' : 'outlaw', faction: 'outlaw', hostile: true, tag: 'gang', at: [c.x + 3, c.z - 2], weapon: ['revolver'], health: 140, canSurrender: true, aggression: 0.6, seed: `wanted:${w.id}` });
            const gg = S.gang('gang', [c.x - 3, c.z + 3], n, { role: 'outlaw', faction: 'outlaw', weapon: ['revolver'] }, 5); for (const x of gg) x.def.hostile = true;
          } },
        { id: 'take', type: 'kill', text: `Take ${w.name} — dead, or hogtied for the full reward`, group: 'gang', waypoint: false, onStart: (ctx) => ctx.stage.attack('gang'),
          onEnd: (ctx) => { const t = ctx.stage.get('target'); ctx.flags[`b_${w.id}`] = t && !t.dead ? 'alive' : 'dead'; } },
        { id: 'tie', type: 'custom', text: `Hogtie ${w.name} (lasso, then E) — or finish it`, tick: (ctx) => { const t = ctx.stage.get('target'); if (!t || t.dead) { ctx.flags[`b_${w.id}`] = 'dead'; return true; } return t.entity?.hogtied ? true : null; } },
        { id: 'bring', type: 'custom', text: (ctx) => (ctx.flags[`b_${w.id}`] === 'alive' ? `Bring ${w.name} to the sheriff's office in Copperbell` : 'Report to the sheriff in Copperbell'), at: sheriff,
          tick: (ctx) => {
            const t = ctx.stage.get('target'), s = sheriff(ctx), pl = ctx.game.player.position, alive = t && !t.dead;
            ctx.flags[`b_${w.id}`] = alive ? 'alive' : 'dead';
            const nearS = Math.hypot(pl.x - s.x, pl.z - s.z) < TUNING.deliverRadius;
            if (!nearS) return null;
            if (!alive) return true;
            return Math.hypot(t.position.x - s.x, t.position.z - s.z) < TUNING.deliverRadius + 4 ? true : null;
          } },
      ],
    };
  }

  _board() {
    const g = this.game, ui = g.ui, wrap = document.createElement('div'); wrap.className = 'sd-panel sd-shop sd-board2';
    const h = document.createElement('h2'); h.className = 'sd-title'; h.textContent = 'Bounty board'; wrap.append(h);
    const grid = document.createElement('div'); grid.className = 'sd-posters';
    const law = g.get('law'), total = law?.totalBounty?.() || 0;
    const list = [...(total > 0 ? [{ id: 'eli', name: 'Eli Rourke', crime: 'Crimes in Ashwater County', alive: Math.round(total * 1.5), dead: Math.round(total), seed: 7, state: 'self' }] : []), ...this.list(), { ...WANTED.find((w) => w.id === 'ransome'), state: this.sys.done.has('saltmesa') ? 'done' : 'story' }];
    for (const e of list) {
      const cell = document.createElement('div'); cell.className = 'sd-poster';
      const c = document.createElement('canvas'); c.width = 256; c.height = 352; const x = c.getContext('2d');
      x.fillStyle = '#e4d6b0'; x.fillRect(0, 0, 256, 352); x.fillStyle = '#2a1d12'; x.textAlign = 'center';
      x.font = '42px Rye, Georgia, serif'; x.fillText('WANTED', 128, 50); x.font = 'italic 15px Georgia, serif'; x.fillText('DEAD OR ALIVE', 128, 70);
      sketchPortrait(x, 36, 84, 184, 156, e.seed, { female: e.female });
      x.strokeStyle = '#2a1d12'; x.lineWidth = 2; x.strokeRect(34, 82, 188, 160);
      x.font = '20px Rye, Georgia, serif'; x.fillText(e.name.toUpperCase(), 128, 270); x.font = '14px Georgia, serif'; x.fillText(e.crime, 128, 290);
      x.font = '24px Rye, Georgia, serif'; x.fillText(`$${e.alive} REWARD`, 128, 326);
      if (e.state === 'done') { x.save(); x.translate(128, 176); x.rotate(-0.4); x.strokeStyle = '#8a1e10'; x.lineWidth = 6; x.strokeRect(-90, -26, 180, 52); x.fillStyle = '#8a1e10'; x.font = '34px Rye, Georgia, serif'; x.fillText('CLAIMED', 0, 12); x.restore(); }
      cell.append(c);
      if (e.state === 'open') cell.append(ui.button(`Take it — $${e.alive} alive / $${e.dead} dead`, () => { ui.closeScreen(); this.take(e.id); }, { primary: true, disabled: !!this.sys.active }));
      else if (e.state === 'active') cell.append(Object.assign(document.createElement('small'), { textContent: 'You\'re on his trail.' }));
      else if (e.state === 'story') cell.append(Object.assign(document.createElement('small'), { textContent: 'Every lawman in the county wants this one.' }));
      grid.append(cell);
    }
    wrap.append(grid);
    if (total > 0) wrap.append(Object.assign(document.createElement('p'), { className: 'sd-hint', textContent: `There's $${total.toFixed(2)} on your own head. Pay it inside at the sheriff's desk or at the post office.` }));
    wrap.append(ui.button('Close', () => ui.closeScreen()));
    return wrap;
  }
  serialize() { return { done: [...this.done] }; }
  deserialize(d) { this.done = new Set(d?.done || []); }
}
