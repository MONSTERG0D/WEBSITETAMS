import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { MissionRunner } from './MissionRunner.js';
import { Cutscene } from './Cutscene.js';
import { Duel } from './Duel.js';
import { Stage } from './Stage.js';
import { buildSets, disposeSets } from './Sets.js';
import { MAIN_MISSIONS } from './missions/main.js';
import { FINAL_MISSIONS } from './missions/finale.js';
import { SIDE_MISSIONS } from './missions/side.js';
import { Bounties } from './bounties/Bounties.js';
import { STORY_DIALOGUES } from './missions/dialogues.js';
import { ENCOUNTER_TREES } from './encounters/index.js';

/**
 * The 'missions' system (Part 15, GAME_BIBLE §4 and §11: register(def) · start(id) · active · complete() ·
 * fail(reason) · available()).
 * A mission is data: { id, title, kind: 'main'|'side'|'job'|'bounty'|'stranger', giver, requires(flags, game),
 * steps: [...], rewards, music, onComplete(ctx), onFail(ctx) } — see MissionRunner for the step types. Missions
 * that are available show a star on the map and a prompt at their giver; only one runs at a time.
 * The running mission owns its people and props (Stage.js); checkpoints remember a step and where Eli stood, and
 * failing (or dying) fades out, clears the stage and replays from the last checkpoint. A letterboxed title card
 * opens and closes each mission; rewards pay out on the closing card; the journal keeps the log. Story flags
 * (`flags`) persist across missions and saves: branches, the ending and the epilogue read them.
 * Also: on death outside a mission you wake at the last camp, the ranch, or the last town you passed through.
 */
export const TUNING = { cardSeconds: 3.2, failSeconds: 2.6, giverRadius: 3, offerRadius: 60, autostartFirst: true };

export default class MissionSystem extends System {
  constructor(game) {
    super(game);
    this.defs = new Map(); this.done = new Set(); this.failedCount = {}; this.flags = {}; this.active = null; this.runner = null;
    this.givers = new Map(); this._giverT = 0; this.log = [];
  }

  async init() {
    const g = this.game;
    this.cutscene = new Cutscene(g); this.duel = new Duel(g);
    try { this.sets = buildSets(g); } catch (err) { console.error('[missions] sets', err); }
    g.get('npcs')?.addHostility?.('ally', 'blackstone'); g.get('npcs')?.addHostility?.('ally', 'cinder'); g.get('npcs')?.addHostility?.('ally', 'outlaw');
    g.get('npcs')?.addHostility?.('law', 'outlaw');
    for (const t of [...STORY_DIALOGUES, ...ENCOUNTER_TREES]) g.get('dialogue')?.register?.(t);
    for (const d of [...MAIN_MISSIONS, ...FINAL_MISSIONS, ...SIDE_MISSIONS]) this.register(d);
    this.bounties = new Bounties(this);
    g.events.on(EVENTS.GAME_START, ({ newGame } = {}) => {
      if (newGame) { this._reset(); if (TUNING.autostartFirst && this.defs.has('homecoming')) setTimeout(() => this.start('homecoming'), 400); }
      else this._resumeAfterLoad();
    });
    g.events.on(EVENTS.PLAYER_DIED, () => { if (this.active) this._deathInMission(); });
    g.events.on(EVENTS.ZONE_ENTERED, ({ zone }) => { const id = String(zone || '').split('/')[0], t = g.get('towns')?.towns?.get(id); if (t && id !== 'ranch' && !this.active) { const s = t.spots?.street?.[0] || t.center; g.player.spawn?.set(s.x, 0, s.z); } });
    g.ui.registerScreen('missioncard', { back: false, nav: false, build: (u, d) => this._card(d) });
    g.debug?.addTuning('Missions', TUNING);
  }

  // ---------------------------------------------------------------- Bible API
  register(def) { this.defs.set(def.id, def); return def; }
  /** Missions that can be started now. */
  available() { return [...this.defs.values()].filter((d) => this.canStart(d.id)); }
  canStart(id) {
    const d = this.defs.get(id); if (!d || this.active || (this.done.has(id) && !d.repeatable)) return false;
    try { return d.requires ? !!d.requires(this.flags, this.game, this) : true; } catch { return false; }
  }
  /** Starts a mission (title card, then the first step). @returns {boolean} */
  start(id, { skipCard = false, at = null, data = null } = {}) {
    const g = this.game, def = this.defs.get(id);
    if (!def || this.active) return false;
    this.active = def; this.stage = new Stage(this, def);
    this.runner = new MissionRunner(this, def, this.stage);
    if (data) Object.assign(this.runner.ctx.data, data);
    this._clearGivers();
    g.events.emit(EVENTS.MISSION_STARTED, { id });
    if (def.kind !== 'encounter') g.get('hud')?.journal?.addEntry(id, { title: def.title, kind: def.kind === 'main' ? 'main' : 'side', text: def.summary || '', steps: [] });
    if (def.music) g.get('music')?.setMood?.(def.music);
    const runner = this.runner, begin = () => { if (this.runner === runner && !runner.stopped) runner.begin(at); }; // the card may outlive the mission (abandoned, replaced)
    if (skipCard || !def.title || def.kind === 'encounter') begin(); else this.titleCard(def.title, def.kicker || (def.kind === 'main' ? `Chapter ${def.chapter || ''}`.trim() : def.kind === 'bounty' ? 'Bounty' : ''), begin);
    this.log.unshift(`start ${id}`);
    return true;
  }
  /** Finishes the active mission: rewards, the closing card, the next missions. */
  complete() {
    const g = this.game, def = this.active; if (!def) return false;
    const r = typeof def.rewards === 'function' ? def.rewards(this.flags, g) : def.rewards || {};
    if (r.money) g.sys('wallet').add(r.money, `mission:${def.id}`);
    if (r.honor) g.get('honor')?.change?.(r.honor, `mission:${def.id}`);
    for (const [item, qty] of Object.entries(r.items || {})) g.sys('inventory').add(item, qty);
    for (const [k, v] of Object.entries(r.flags || {})) this.flags[k] = v;
    try { def.onComplete?.(this.runner.ctx); } catch (err) { console.error('[missions] onComplete', err); }
    this.done.add(def.id); this.flags[`done_${def.id}`] = true;
    if (def.kind !== 'encounter') g.get('hud')?.journal?.updateEntry(def.id, { status: 'done', text: def.summaryDone ? def.summaryDone(this.flags) : def.summary || '' });
    if (def.story) g.get('hud')?.journal?.addStory(typeof def.story === 'function' ? def.story(this.flags) : def.story);
    this._end();
    g.events.emit(EVENTS.MISSION_COMPLETED, { id: def.id });
    if (def.kind !== 'encounter') g.get('music')?.stinger?.('victory');
    if (def.title && !def.quietEnd && def.kind !== 'encounter') this.titleCard(def.title, 'Complete', null, r);
    else if (r.money) g.ui.notify(`+$${r.money.toFixed(2)}`);
    this.log.unshift(`complete ${def.id}`);
    if (def.kind !== 'encounter') g.save?.autosave?.(true);
    return true;
  }
  /** Fails the active mission; it restarts at the last checkpoint after the card. */
  fail(reason = 'Mission failed.') {
    const g = this.game, def = this.active; if (!def || this._failing) return false;
    if (def.kind === 'encounter' || def.noRetry) { g.events.emit(EVENTS.MISSION_FAILED, { id: def.id, reason }); this._end(); return true; } // encounters just end
    this._failing = true;
    this.failedCount[def.id] = (this.failedCount[def.id] || 0) + 1;
    g.events.emit(EVENTS.MISSION_FAILED, { id: def.id, reason });
    this.log.unshift(`fail ${def.id}: ${reason}`);
    this.titleCard('Mission failed', reason, async () => { await this._restartAtCheckpoint(); this._failing = false; }, null, true);
    return true;
  }
  /** Gives up the active mission (from the pause menu or tests). */
  abandon() {
    const def = this.active; if (!def) return false;
    this.stage.clear(); this.runner.stop(); this.game.get('hud')?.journal?.updateEntry(def.id, { status: 'failed' }); this._end();
    this.game.ui.notify(`${def.title || def.id} abandoned.`);
    return true;
  }

  // ---------------------------------------------------------------- internals
  _end() {
    const g = this.game;
    this.runner?.stop(); this.stage?.clear(); this.active = null; this.runner = null; this.stage = null;
    g.ui.setObjective(null); g.ui.clearWaypoint(); g.get('map')?.removeMarker?.('mission');
    g.get('music')?.setMood?.('auto');
    g.player?.setControl?.(true);
  }
  async _restartAtCheckpoint() {
    const g = this.game, r = this.runner; if (!r) return;
    await g.ui.fade(true, 0.6);
    r.stop(); this.stage.clear();
    const cp = r.checkpoint;
    if (g.player.state === 'dead') await new Promise((res) => { const off = g.events.on(EVENTS.PLAYER_RESPAWNED, () => { off?.(); res(); }); setTimeout(res, 6000); });
    if (cp?.pos) this.stage.teleport(cp.pos.x, cp.pos.z, { horse: true, yaw: cp.yaw });
    g.player.health = Math.max(g.player.health, 100);
    Object.assign(this.flags, cp?.flags || {});
    this.runner = new MissionRunner(this, this.active, this.stage);
    this.runner.begin(cp?.step || null, cp);
    await g.ui.fade(false, 0.6);
  }
  _deathInMission() { if (!this._failing) setTimeout(() => this.fail(this.active?.deathText || 'You died.'), 400); }
  _resumeAfterLoad() {
    const id = this._pending; this._pending = null;
    if (id && this.defs.has(id)) { const cp = this._pendingCp; this.start(id, { skipCard: true, at: cp?.step }); if (cp?.pos) this.stage.teleport(cp.pos.x, cp.pos.z, { horse: true }); }
  }
  _reset() { if (this.active) this._end(); this.done.clear(); this.flags = {}; this.failedCount = {}; this._clearGivers(); this.bounties?.reset?.(); }

  /** A letterboxed title card. */
  titleCard(title, sub = '', then = null, rewards = null, failed = false) {
    const g = this.game;
    if (this._cardOpen) g.ui.closeScreen();
    g.ui.letterbox(true);
    g.ui.openScreen('missioncard', { title, sub, rewards, failed }); this._cardOpen = true;
    g.audio?.play(failed ? 'honor_down' : 'notify', { volume: 0.6 });
    setTimeout(() => { if (g.ui.topScreen() === 'missioncard') g.ui.closeScreen(); this._cardOpen = false; if (!this.cutscene.active) g.ui.letterbox(false); then?.(); }, (failed ? TUNING.failSeconds : TUNING.cardSeconds) * 1000);
  }
  _card({ title, sub, rewards, failed } = {}) {
    const w = document.createElement('div'); w.className = `sd-mcard${failed ? ' sd-failed' : ''}`;
    const h = document.createElement('h1'); h.textContent = title; const s = document.createElement('p'); s.textContent = sub || '';
    w.append(s, h);
    if (rewards && (rewards.money || rewards.honor)) { const r = document.createElement('small'); r.textContent = [rewards.money ? `$${rewards.money.toFixed(2)}` : '', rewards.honor ? `Honor ${rewards.honor > 0 ? '+' : ''}${rewards.honor}` : ''].filter(Boolean).join('  ·  '); w.append(r); }
    return w;
  }

  // ---------------------------------------------------------------- givers: where available missions start
  update(dt) {
    const g = this.game;
    this.runner?.update(dt);
    this.bounties?.update(dt);
    if ((this._giverT -= dt) > 0) return;
    this._giverT = 1;
    if (this.active || g.state !== 'playing') { this._clearGivers(); return; }
    for (const d of this.defs.values()) {
      const can = d.giver && this.canStart(d.id), has = this.givers.has(d.id);
      if (can && !has) this._addGiver(d);
      else if (!can && has) this._removeGiver(d.id);
    }
  }
  _giverPos(d) { const p = typeof d.giver.at === 'function' ? d.giver.at(this.game, this) : d.giver.at; return p ? { x: p.x ?? p[0], z: p.z ?? p[1] } : null; }
  _addGiver(d) {
    const g = this.game, p = this._giverPos(d); if (!p) return;
    const y = g.sys('terrain').getHeightAt(p.x, p.z);
    const h = g.interact.register({ position: { x: p.x, y, z: p.z }, radius: d.giver.radius || TUNING.giverRadius, priority: 1, label: d.giver.label || `Start: ${d.title}`, onInteract: () => this.start(d.id), condition: () => g.player.state === 'onFoot' });
    const m = d.kind === 'main' || d.giver.marker !== false ? g.get('map')?.addMarker?.(`giver:${d.id}`, { x: p.x, z: p.z, label: d.title, kind: d.kind, color: d.kind === 'main' ? '#c08a1e' : d.kind === 'stranger' ? '#7a8a9a' : '#9a7a4a' }) : null;
    const npc = d.giver.npc ? g.get('npcs')?.spawn?.({ persistent: true, wander: false, faction: 'civilian', canSurrender: true, ...d.giver.npc, id: `giver:${d.id}`, position: { x: p.x + 0.8, z: p.z + 0.8 }, home: [p.x + 0.8, p.z + 0.8] }) : null; // someone standing there to talk to
    this.givers.set(d.id, { handle: h, marker: !!m, pos: p, npc });
    if (d.kind === 'main' && !this._announced?.has(d.id)) { (this._announced ||= new Set()).add(d.id); g.events.emit(EVENTS.MISSION_AVAILABLE, { id: d.id }); g.ui.notify(`New: ${d.title}${d.giver.hint ? ` — ${d.giver.hint}` : ''}`, { duration: 4 }); }
  }
  _removeGiver(id) { const gv = this.givers.get(id); if (!gv) return; this.game.interact.unregister(gv.handle); if (gv.npc) this.game.get('npcs')?.despawn?.(gv.npc); this.game.get('map')?.removeMarker?.(`giver:${id}`); this.givers.delete(id); }
  _clearGivers() { for (const id of [...this.givers.keys()]) this._removeGiver(id); }

  serialize() {
    const cp = this.runner?.checkpoint;
    return { done: [...this.done], flags: { ...this.flags }, failed: { ...this.failedCount }, active: this.active?.id || null, checkpoint: cp ? { step: cp.step, pos: cp.pos, flags: cp.flags } : null, bounties: this.bounties?.serialize?.() };
  }
  deserialize(d) {
    if (!d) return;
    if (this.active) this._end();
    this.done = new Set(d.done || []); this.flags = { ...(d.flags || {}) }; this.failedCount = { ...(d.failed || {}) };
    this._pending = d.active; this._pendingCp = d.checkpoint;
    this.bounties?.deserialize?.(d.bounties);
  }
  dispose() { if (this.active) this._end(); disposeSets(this.game, this.sets); }
}
