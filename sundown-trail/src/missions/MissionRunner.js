import { EVENTS } from '../core/Events.js';

/**
 * Runs one mission's steps (Part 15). A step is { id, type, text, checkpoint, setup(ctx), onStart(ctx), onEnd(ctx),
 * next: id | 'complete' | (ctx) => id, ...type params }. On entering a step: setup (spawns what it needs — the
 * same call re-stages a checkpoint after a failure), onStart, the objective line and the waypoint; each frame the
 * type's tick returns null (keep going), true (done), a step id (branch), or { fail: 'reason' }.
 *  goto/ride  { at: [x, z] | (ctx) => {x, z}, radius, mounted }           ride needs Eli in the saddle
 *  talk       { npc, label, tree | lines, store, expect }                walk up and press E; `expect` lists the
 *             results that settle it (anything else — walking off mid-choice — offers the talk again)
 *  dialogue   { tree, npc, store }                                         result goes to flags[store]
 *  kill       { group | npcs, count, surrender: true }                     everyone down (or surrendered)
 *  survive    { seconds }        defend { seconds, group, protect, at, radius }
 *  escort     { wagon | npc, keep }                                        until it arrives; fails if it's lost
 *  follow     { npc, keep, until }    chase { npc, catch, lose }    hogtie { npc }
 *  collect    { items: [{ at, label, item, qty }] }                        deliver { at, radius, item, label }
 *  stealth    { group, at, radius, onSpotted }                             reach the goal unseen, or branch
 *  duel       { npc, skill }     cutscene { shots }     wait { seconds }     custom { start, tick }
 * Every step also accepts fail(ctx) → reason, checked each frame (a protected person dying, wandering off…), and
 * during(ctx, st, dt), per-frame scripting. NPC keys are stage keys, 'npc:<global id>', a function, or an NPC.
 */
export const TUNING = { gotoRadius: 6, talkRadius: 3, escortKeep: 160, escortLoseTime: 20, followKeep: 70, chaseLose: 220 };

export class MissionRunner {
  constructor(sys, def, stage) {
    this.sys = sys; this.def = def; this.stage = stage; this.game = sys.game;
    this.i = -1; this.step = null; this.st = null; this.checkpoint = null; this.stopped = false; this.t = 0;
    this.ctx = { game: this.game, m: sys, stage, flags: sys.flags, def, data: {}, runner: this, s: stage };
    this._offs = [];
  }
  /** Starts at the first step, or at a step id (a checkpoint restart passes its record). */
  begin(at = null, cp = null) {
    const steps = this.def.steps;
    let i = at ? steps.findIndex((s) => s.id === at) : 0; if (i < 0) i = 0;
    if (cp) this.checkpoint = cp;
    try { this.def.prepare?.(this.ctx); } catch (err) { console.error('[missions] prepare', err); }
    this._enter(i);
  }
  stop() { this.stopped = true; this._leave(); for (const off of this._offs) off(); this._offs.length = 0; }

  _enter(i) {
    const g = this.game, s = this.def.steps[i];
    if (!s) { this.sys.complete(); return; }
    this.i = i; this.step = s; this.t = 0; this.st = {};
    if (s.checkpoint || i === 0) {
      const p = g.player.position;
      this.checkpoint = { step: s.id, pos: s.checkpointAt ? resolve(s.checkpointAt, this.ctx) : { x: p.x, z: p.z }, yaw: g.player.yaw, flags: { ...this.sys.flags } };
    }
    try { s.setup?.(this.ctx); s.onStart?.(this.ctx); } catch (err) { console.error(`[missions] ${this.def.id}/${s.id} start`, err); }
    const text = typeof s.text === 'function' ? s.text(this.ctx) : s.text;
    if (text !== undefined) g.ui.setObjective(text || null);
    const at = s.waypoint !== false && (s.waypoint || s.at) ? resolve(s.waypoint || s.at, this.ctx) : null;
    if (at) { g.ui.setWaypoint(at.x, at.z, s.waypointLabel || ''); g.get('map')?.addMarker?.('mission', { x: at.x, z: at.z, label: text || '', kind: 'mission' }); }
    else if (s.waypoint === false) { g.ui.clearWaypoint(); g.get('map')?.removeMarker?.('mission'); }
    const T = TYPES[s.type] || TYPES.custom;
    try { T.start?.(this.ctx, s, this.st); } catch (err) { console.error(`[missions] ${this.def.id}/${s.id} type start`, err); }
    g.events.emit(EVENTS.MISSION_STEP, { id: this.def.id, step: s.id });
    if (s.journal) g.get('hud')?.journal?.updateEntry(this.def.id, { steps: [...(g.get('hud').journal.entries.get(this.def.id)?.steps || []).map((x) => ({ ...x, done: true })), { text: s.journal } ] });
  }
  _leave() {
    const s = this.step; if (!s) return;
    try { (TYPES[s.type] || TYPES.custom).end?.(this.ctx, s, this.st); s.onEnd?.(this.ctx); } catch (err) { console.error(`[missions] ${this.def.id}/${s.id} end`, err); }
    this.step = null;
  }
  /** Jumps straight to a step (tests, branches). */
  goto(id) { const i = this.def.steps.findIndex((s) => s.id === id); if (i < 0) { if (id === 'complete') { this._leave(); this.sys.complete(); } return false; } this._leave(); this._enter(i); return true; }
  /** Skips the current step as if done (test page). */
  skip() { if (this.step) this._advance(true); }

  update(dt) {
    if (this.stopped || !this.step || this.sys._failing) return;
    const s = this.step; this.t += dt;
    this.stage.update(dt);
    let res = null;
    try {
      const why = s.fail?.(this.ctx, this.st); if (why) { this.sys.fail(why); return; }
      s.during?.(this.ctx, this.st, dt); // any step: per-frame scripting (ambush triggers, lines on cue)
      if (this.stopped || this.step !== s) return;
      res = (TYPES[s.type] || TYPES.custom).tick?.(this.ctx, s, this.st, dt) ?? null;
    } catch (err) { console.error(`[missions] ${this.def.id}/${s.id} tick`, err); res = null; }
    if (res === null || res === false || res === undefined) return;
    if (typeof res === 'object' && res.fail) { this.sys.fail(res.fail); return; }
    this._advance(res);
  }
  _advance(res) {
    const s = this.step;
    let next = typeof res === 'string' ? res : typeof s.next === 'function' ? s.next(this.ctx) : s.next;
    this._leave();
    if (this.stopped) return;
    if (next === 'complete') { this.sys.complete(); return; }
    if (next) { const i = this.def.steps.findIndex((x) => x.id === next); if (i >= 0) { this._enter(i); return; } }
    this._enter(this.i + 1);
  }
}

/** A position from [x, z], {x, z}, a function of ctx, or a stage place name. */
export function resolve(p, ctx) {
  if (typeof p === 'function') p = p(ctx);
  if (typeof p === 'string') p = ctx.stage.place(p);
  if (!p) return null;
  return Array.isArray(p) ? { x: p[0], z: p[1] } : { x: p.x, z: p.z };
}
const near = (ctx, p, r) => { const q = ctx.game.player.position; return p && Math.hypot(q.x - p.x, q.z - p.z) < r; };
const npcOf = (ctx, key) => (typeof key === 'object' ? key : typeof key === 'function' ? key(ctx) : key?.startsWith?.('npc:') ? ctx.game.get('npcs')?.byId?.get(key.slice(4)) : ctx.stage.get(key));
export { npcOf };

export const TYPES = {
  goto: {
    start(ctx, s) { s._r = s.radius || TUNING.gotoRadius; },
    tick(ctx, s) { const p = resolve(s.at, ctx); return near(ctx, p, s.radius || TUNING.gotoRadius) && (!s.mounted || ctx.game.player.state === 'mounted') && (s.onFoot !== true || ctx.game.player.state === 'onFoot') ? true : null; },
  },
  ride: {
    tick(ctx, s, st) {
      const pl = ctx.game.player;
      if (pl.state !== 'mounted' && !st.told) { st.told = true; ctx.game.ui.notify(ctx.game.input.device === 'touch' ? 'Tap Horse to whistle for her, then Use to mount.' : 'Whistle for your horse (H) and get in the saddle (E).', { duration: 4 }); }
      return near(ctx, resolve(s.at, ctx), s.radius || 14) ? true : null;
    },
  },
  talk: {
    start(ctx, s, st) {
      const n = npcOf(ctx, s.npc);
      st.h = ctx.stage.interact(() => n?.position, s.label || `Talk to ${n?.def?.name?.split(' ')[0] || 'them'}`, () => {
        st.started = true; ctx.stage.removeInteract(st.h);
        if (s.tree) {
          const ok = ctx.game.get('dialogue')?.start(typeof s.tree === 'function' ? s.tree(ctx) : s.tree, { speaker: n, onEnd: (r) => {
            if (s.expect && !s.expect.includes(r)) { st.started = false; TYPES.talk.start(ctx, s, st); ctx.game.ui.notify('You can pick that up again when you\'re ready.', { duration: 2.5 }); return; } // walked off mid-choice: offer it again
            if (s.store) ctx.flags[s.store] = r; st.done = true;
          } });
          if (!ok) { st.started = false; TYPES.talk.start(ctx, s, st); }
        }
        else if (s.lines) ctx.stage.lines(s.lines).then(() => { st.done = true; });
        else st.done = true;
      }, s.radius || TUNING.talkRadius);
      if (n && !s.noFace) n.facePoint?.(ctx.game.player.position);
    },
    tick(ctx, s, st) { return st.done ? true : null; },
  },
  dialogue: {
    start(ctx, s, st) {
      const n = npcOf(ctx, s.npc), d = ctx.game.get('dialogue');
      const ok = d?.start(typeof s.tree === 'function' ? s.tree(ctx) : s.tree, { speaker: n || s.speaker, onEnd: (r) => { if (s.store) ctx.flags[s.store] = r; st.done = true; } });
      if (!ok) st.done = true;
    },
    tick(ctx, s, st) { return st.done ? true : null; },
  },
  kill: {
    tick(ctx, s) {
      const list = s.npcs ? s.npcs.map((k) => npcOf(ctx, k)).filter(Boolean) : ctx.stage.group(s.group || 'enemy');
      const left = list.filter((n) => !n.dead && !(s.surrender !== false && (n.surrendered || n.entity?.hogtied)));
      if (s.show !== false) ctx.game.ui.setObjective(`${typeof s.text === 'function' ? s.text(ctx) : s.text || 'Take them down'}${left.length ? ` (${left.length} left)` : ''}`);
      return list.length && !left.length ? true : null;
    },
  },
  survive: { tick(ctx, s) { return ctx.runner.t >= (s.seconds || 30) ? true : null; } },
  wait: { tick(ctx, s) { return ctx.runner.t >= (s.seconds || 2) ? true : null; } },
  defend: {
    tick(ctx, s) {
      const prot = s.protect ? npcOf(ctx, s.protect) : null;
      if (prot?.dead) return { fail: s.failText || `${prot.def.name} was killed.` };
      if (s.at && !near(ctx, resolve(s.at, ctx), s.radius || 60)) return { fail: s.leaveText || 'You abandoned your post.' };
      const left = ctx.stage.group(s.group || 'enemy').filter((n) => !n.dead && !n.surrendered).length;
      const tLeft = Math.max(0, (s.seconds || 0) - ctx.runner.t);
      ctx.game.ui.setObjective(`${s.text || 'Hold out'}${tLeft > 0 ? ` · ${Math.ceil(tLeft)} s` : ''}${left ? ` · ${left} left` : ''}`);
      return tLeft <= 0 && (!s.clear || left === 0) ? true : null;
    },
  },
  escort: {
    tick(ctx, s, st, dt) {
      const w = s.wagon ? ctx.stage.wagons.get(s.wagon) : null, n = s.npc ? npcOf(ctx, s.npc) : null, obj = w || n;
      if (!obj) return true;
      if (w?.lost || n?.dead) return { fail: s.lostText || 'They didn\'t make it.' };
      const p = w ? w.position : n.position;
      ctx.game.ui.setWaypoint(p.x, p.z, s.waypointLabel || '');
      st.far = near(ctx, p, s.keep || TUNING.escortKeep) ? 0 : (st.far || 0) + dt;
      if (st.far > TUNING.escortLoseTime) return { fail: s.farText || 'You left them behind.' };
      if (w) return w.arrived ? true : null;
      const tp = resolve(s.to, ctx); return tp && Math.hypot(n.position.x - tp.x, n.position.z - tp.z) < (s.radius || 8) ? true : null;
    },
  },
  follow: {
    tick(ctx, s, st, dt) {
      const n = npcOf(ctx, s.npc); if (!n || n.dead) return { fail: 'They were killed.' };
      st.far = near(ctx, n.position, s.keep || TUNING.followKeep) ? 0 : (st.far || 0) + dt;
      if (st.far > 12) return { fail: s.farText || 'You lost them.' };
      ctx.game.ui.setWaypoint(n.position.x, n.position.z, '');
      return s.until ? (s.until(ctx) ? true : null) : (n.arrived && ctx.runner.t > 2 ? true : null);
    },
  },
  chase: {
    tick(ctx, s) {
      const n = npcOf(ctx, s.npc); if (!n || n.dead || n.entity?.hogtied || n.surrendered) return true;
      const d = n.position.distanceTo(ctx.game.player.position);
      ctx.game.ui.setWaypoint(n.position.x, n.position.z, '');
      if (d < (s.catch || 8) && s.catchDone) return true;
      if (d > (s.lose || TUNING.chaseLose)) return { fail: s.loseText || 'They got away.' };
      return s.until?.(ctx) ? true : null;
    },
  },
  hogtie: { tick(ctx, s) { const n = npcOf(ctx, s.npc); if (!n) return true; if (n.dead && !s.deadOk) return { fail: s.deadText || 'They were needed alive.' }; return n.entity?.hogtied || n.dead ? true : null; } },
  collect: {
    start(ctx, s, st) {
      st.left = s.items.length; st.items = s.items.map((it, k) => ctx.stage.pickup(resolve(it.at, ctx), it.label || 'Take it', () => { if (it.item) ctx.game.sys('inventory').add(it.item, it.qty || 1); st.left--; it.onTake?.(ctx); }, { mesh: it.mesh, key: `${s.id}:${k}` }));
    },
    tick(ctx, s, st) { if (s.items.length > 1) ctx.game.ui.setObjective(`${s.text || 'Collect them'} (${s.items.length - st.left}/${s.items.length})`); return st.left <= 0 ? true : null; },
  },
  deliver: {
    start(ctx, s, st) { st.h = ctx.stage.interact(() => resolve(s.at, ctx), s.label || 'Hand it over', () => { if (s.item && !ctx.game.sys('inventory').remove(s.item, s.qty || 1)) { ctx.game.ui.notify('You don\'t have it with you.'); return; } st.done = true; }, s.radius || 3); },
    tick(ctx, s, st) { return st.done ? true : null; },
  },
  stealth: {
    tick(ctx, s) {
      const seen = ctx.stage.group(s.group || 'enemy').some((n) => !n.dead && (n.alert >= 2 || n.brain?.state === 'fight'));
      if (seen) return s.onSpotted || { fail: s.spottedText || 'You were spotted.' };
      return near(ctx, resolve(s.at, ctx), s.radius || 4) ? true : null;
    },
  },
  duel: {
    start(ctx, s, st) {
      const n = npcOf(ctx, s.npc);
      ctx.m.duel.run({ opponent: n, skill: s.skill ?? 0.8, title: s.title }).then((r) => { st.result = r; });
    },
    tick(ctx, s, st) { if (!st.result) return null; return st.result === 'won' ? true : st.result === 'cancelled' ? null : { fail: s.lostText || 'Too slow.' }; },
    end(ctx) { if (ctx.m.duel.active) ctx.m.duel.cancel(); },
  },
  cutscene: {
    start(ctx, s, st) { const shots = typeof s.shots === 'function' ? s.shots(ctx) : s.shots; ctx.m.cutscene.play(shots, { ctx, skippable: s.skippable !== false }).then(() => { st.done = true; }); },
    tick(ctx, s, st) { return st.done ? true : null; },
    end(ctx) { if (ctx.m.cutscene.active) ctx.m.cutscene.stop(); },
  },
  custom: {
    start(ctx, s, st) { s.start?.(ctx, st); },
    tick(ctx, s, st, dt) { return s.tick ? s.tick(ctx, st, dt) : true; },
    end(ctx, s, st) { s.end?.(ctx, st); },
  },
};
