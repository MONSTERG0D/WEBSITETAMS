import { EVENTS } from '../../core/Events.js';

/** Small builders shared by the mission scripts (Part 15). */

/** A step that waits for a game event (optionally matching `test(payload, ctx)`). */
export function onEvent(id, event, text, test = null, extra = {}) {
  return {
    id, type: 'custom', text, ...extra,
    start(ctx, st) { st.off = ctx.game.events.on(event, (p) => { if (!test || test(p, ctx)) st.done = true; }); extra.begin?.(ctx, st); },
    tick(ctx, st, dt) { if (extra.check?.(ctx, st, dt)) st.done = true; return st.done ? true : null; },
    end(ctx, st) { st.off?.(); },
  };
}
/** A step that finishes when `test(ctx)` is true. */
export function when(id, text, test, extra = {}) { return { id, type: 'custom', text, ...extra, tick: (ctx, st, dt) => (test(ctx, st, dt) ? true : null) }; }
/** A tutorial hint (once per save). */
export function hint(ctx, key, desktop, touch = desktop, pad = desktop) {
  const f = ctx.flags; if (f[`hint_${key}`]) return; f[`hint_${key}`] = true;
  const d = ctx.game.input.device; ctx.game.ui.notify(d === 'touch' ? touch : d === 'gamepad' ? pad : desktop, { duration: 6 });
}
/** Spoken lines as a step. */
export function talkStep(id, lines, extra = {}) {
  return { id, type: 'custom', ...extra, start: (ctx, st) => { ctx.stage.lines(typeof lines === 'function' ? lines(ctx) : lines).then(() => { st.done = true; }); }, tick: (ctx, st) => (st.done ? true : null) };
}
/** A fistfight with one person: done when they're beaten, fails when Eli is. */
export function brawlStep(id, key, text, extra = {}) {
  return {
    id, type: 'custom', text, ...extra,
    start(ctx, st) { const n = ctx.stage.get(key); const so = ctx.game.get('social'); if (n && so) { so.startFight(n, false); st.n = n; } },
    tick(ctx, st) {
      const so = ctx.game.get('social'), n = st.n; if (!n) return true;
      if (n.dead) return true;
      if (so?.brawls?.has(n)) { st.on = true; return null; }
      if (!st.on) return null;
      return n.brain?.state === 'cower' || n.brain?.state === 'flee' || (n.entity?.health ?? 100) < 40 ? true : { fail: 'You were knocked flat.' };
    },
  };
}
/** A setup that re-stages people a checkpoint step relies on (they were spawned by earlier steps' setups). */
export function restage(keys, ...stepIds) { return (ctx) => { if (keys.some((k) => !ctx.stage.get(k))) for (const id of stepIds) ctx.def.steps.find((x) => x.id === id)?.setup?.(ctx); }; }
/** Fires a scripted callback once when `test` becomes true (use inside `during`). */
export function once(st, key, test, fn) { if (!st[key] && test()) { st[key] = true; fn(); } }
/** Time of day with a fade. */
export async function setTime(ctx, hour, text = '') {
  const g = ctx.game; await g.ui.fade(true, 0.8);
  const sky = g.sys('sky'); if ((sky.timeOfDay ?? 12) > hour) sky.day = (sky.day || 1) + 1; sky.setTime(hour);
  if (text) g.ui.notify(text, { duration: 3 });
  await g.ui.fade(false, 0.8);
}
export { EVENTS };
