import { STRUCTURES } from './RanchBuilder.js';

/**
 * The ranch ledger (Part 13): a parchment account book on Mae's table (later the writing desk in the house).
 * Left page: the works — every upgrade with its cost, what it does, and whether it's built, being built tonight,
 * waiting on the house, or affordable. Right page: the accounts — what the ranch earns each morning and from what,
 * the money in hand, the work done so far, who lives here, and the church poor box ($5 for +1 honor, up to +10 a day).
 */
export const TUNING = { historyLines: 6 };

const CSS = `
.sd-ledger{width:min(980px,96vw);max-height:92vh;display:grid;grid-template-columns:1fr 1fr;gap:0;padding:0!important;overflow:hidden;
  background:linear-gradient(90deg,#e8dcbc 0,#efe4c8 47%,#cdbd98 50%,#efe4c8 53%,#e8dcbc 100%)!important;border:2px solid #5a3e24!important;box-shadow:0 10px 40px rgba(0,0,0,.55),inset 0 0 40px rgba(90,60,30,.25)}
.sd-ledger-page{padding:18px 22px 16px;display:flex;flex-direction:column;gap:6px;min-height:0;overflow:auto;max-height:88vh;
  background-image:repeating-linear-gradient(0deg,transparent 0 27px,rgba(60,90,140,.16) 27px 28px)}
.sd-ledger h2{font:24px var(--font-display,Georgia,serif);color:#5a2a14;margin:0 0 2px;letter-spacing:.04em}
.sd-ledger h3{font:16px var(--font-display,Georgia,serif);color:#8a3b1e;margin:8px 0 0;border-bottom:1px solid rgba(90,42,20,.35)}
.sd-ledger small{font-style:italic;color:#5e4a36}
.sd-ledger-row{display:grid;grid-template-columns:1fr auto auto;gap:4px 10px;align-items:center;padding:5px 0;border-bottom:1px dashed rgba(43,29,18,.22);min-height:44px}
.sd-ledger-row b{font:16px var(--font-display,Georgia,serif);color:#2b1d12}
.sd-ledger-row .fx{grid-column:1/2;font-size:13px;color:#5e4a36}
.sd-ledger-row .cost{font:15px Georgia,serif;color:#2b1d12;text-align:right}
.sd-ledger-row .st{font:13px Georgia,serif;font-style:italic;color:#7a6650;text-align:right}
.sd-ledger-row.done b{text-decoration:line-through;text-decoration-color:rgba(90,42,20,.5)}
.sd-ledger-row.done .st{color:#3d6a3a}
.sd-ledger-row .sd-button{min-height:38px;padding:4px 12px;width:auto}
.sd-ledger-sum{display:flex;justify-content:space-between;font:15px Georgia,serif;padding:3px 0;border-bottom:1px dotted rgba(43,29,18,.25)}
.sd-ledger-sum.total{font-weight:bold;border-bottom:2px double rgba(43,29,18,.5)}
.sd-ledger-foot{display:flex;gap:8px;justify-content:flex-end;margin-top:auto;padding-top:8px}
@media (max-width:700px){.sd-ledger{grid-template-columns:1fr;overflow:auto}.sd-ledger-page{max-height:none}}
`;

/** Registers the 'ledger' screen for a Ranch system. */
export function registerLedger(ranch) {
  const g = ranch.game, ui = g.ui;
  if (!document.getElementById('sd-ledger-css')) { const s = document.createElement('style'); s.id = 'sd-ledger-css'; s.textContent = CSS; document.head.append(s); }
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const money = (v) => `$${Number(v).toFixed(2)}`;
  ui.registerScreen('ledger', { build: () => {
    const w = el('div', 'sd-panel sd-ledger');
    const left = el('div', 'sd-ledger-page'), right = el('div', 'sd-ledger-page');
    // ---- left page: the works
    left.append(el('h2', null, 'Rourke Ranch'), el('small', null, 'Pay for the work and Mae will have it done by morning.'), el('h3', null, 'Works'));
    for (const s of STRUCTURES) {
      const d = ranch.info(s), built = ranch.level(s) > 0, pending = ranch.pending.includes(s), why = ranch.blocked(s);
      const r = el('div', `sd-ledger-row${built ? ' done' : ''}`);
      r.dataset.structure = s;
      r.append(el('b', null, d.name), el('span', 'cost', built ? '' : money(d.cost)));
      if (built) r.append(el('span', 'st', 'built'));
      else if (pending) r.append(el('span', 'st', 'tonight'));
      else if (why && why !== `You need $${d.cost}.`) r.append(el('span', 'st', why === 'Repair the house first.' ? 'house first' : why));
      else r.append(ui.button('Pay', () => { if (ranch.upgrade(s)) { ui.closeScreen(); ui.openScreen('ledger'); } }, { disabled: !!why, primary: !why }));
      r.append(el('span', 'fx', d.effect));
      left.append(r);
    }
    const left$ = STRUCTURES.filter((s) => !ranch.level(s) && !ranch.pending.includes(s)).reduce((a, s) => a + ranch.info(s).cost, 0);
    left.append(el('small', null, left$ ? `Still to do: ${money(left$)} of work.` : 'Every work on the place is done.'));
    // ---- right page: the accounts
    right.append(el('h2', null, 'Accounts'), el('h3', null, 'Each morning'));
    const lines = ranch.incomeLines();
    if (!lines.length) right.append(el('small', null, 'Nothing earns yet. A corral, a garden or a smokehouse would.'));
    for (const [label, v] of lines) { const r = el('div', 'sd-ledger-sum'); r.append(el('span', null, label), el('span', null, money(v))); right.append(r); }
    const tot = el('div', 'sd-ledger-sum total'); tot.append(el('span', null, 'A day'), el('span', null, money(ranch.dailyIncome()))); right.append(tot);
    if (ranch.level('garden')) right.append(el('small', null, 'The garden puts apples and carrots in your satchel too.'));
    if (ranch.level('smokehouse')) right.append(el('small', null, 'Butchers pay a quarter more for meat smoked here.'));
    const cash = el('div', 'sd-ledger-sum'); cash.append(el('span', null, 'In hand'), el('span', null, money(g.sys('wallet').money))); right.append(cash);
    right.append(el('h3', null, 'Who lives here'));
    const comp = g.get('companions');
    const who = comp?.list?.() || [];
    right.append(el('small', null, who.length ? who.map((c) => c.name).join(', ') + (ranch.beds < 2 && who.length ? ' — a bunkhouse would make room for more.' : '') : 'Just Mae.'));
    if (ranch.history.length) {
      right.append(el('h3', null, 'Done'));
      for (const h of ranch.history.slice(-TUNING.historyLines).reverse()) { const r = el('div', 'sd-ledger-sum'); r.append(el('span', null, ranch.info(h.structure)?.name || h.structure), el('span', null, `day ${h.day}`)); right.append(r); }
    }
    right.append(el('h3', null, 'The poor box'));
    const day = g.sys('sky').day || 1, given = ranch.donated.day === day ? ranch.donated.honor : 0;
    right.append(el('small', null, `For the church in Copperbell. $5 a time; it's remembered (${given}/10 today).`));
    const foot = el('div', 'sd-ledger-foot');
    foot.append(ui.button('Give $5', () => { if (ranch.donate()) { ui.closeScreen(); ui.openScreen('ledger'); } }, { disabled: given >= 10 || g.sys('wallet').money < 5 }), ui.button('Close', () => ui.closeScreen(), { primary: true }));
    right.append(foot);
    w.append(left, right);
    return w;
  } });
}
