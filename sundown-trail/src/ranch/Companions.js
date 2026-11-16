import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { ITEMS } from '../data/items.js';

/**
 * The 'companions' system (Part 13, GAME_BIBLE §3 and §11: recruit(id) · has(id) · list()).
 * The people who live on the Rourke Ranch. Mae Dorsey is there from the start; Hollis Grant, June Whitfield and
 * Abel Hutchins join through recruit() (the Part 15 missions call it). Each has a daily routine on the ranch's
 * waypoint graph (so nobody walks through walls or stands in a doorway), a perk, and a seat at the fire:
 *   Mae     a food parcel every morning (and she runs the ledger)
 *   Hollis  trains Eli's Focus to level 2 (auto chest marks, slower drain)
 *   June    a job lead each day: carry a letter to a town ($15–40, the Bible's delivery-job pay)
 *   Abel    sells better horses (needs the barn) and has a horse-breaking job each day (needs the corral)
 * Only one companion fits in the ruined house; the bunkhouse makes room for the rest (they wait in town until then).
 * Evenings (19:00–22:00), whoever is home sits around the fire ring: it's lit, they talk among themselves and to Eli
 * when he's near, and now and then somebody hums the old tune (the main motif).
 */
export const TUNING = {
  fire: { from: 18.5, to: 23.5, light: { color: 0xff9448, intensity: 12, distance: 14, flicker: 0.3 } },
  evening: [19, 22], chatterRange: 14, chatterEvery: [9, 15], humEvery: [70, 120], doorClear: 1.8, checkEvery: 1.5,
  letterPay: [15, 40], letterHonor: 1, parcel: { jerky: 1, canned_beans: 1, coffee: 1 }, focusPrice: 0,
};

/** Who they are. `seat` is their place at the fire; routines name ranch spots (Ranch.spot). */
export const COMPANIONS = {
  mae: { name: 'Mae Dorsey', role: 'ranchwoman', seed: 'mae-dorsey', perk: 'A food parcel every morning', seat: 0, start: true,
    routine: [[6, 8, 'fire', 'cook'], [8, 12, 'garden|well', null], [12, 14, 'porch|fire', null], [14, 18, 'woodpile', null], [19, 22, 'seat', 'sit'], [22, 6, 'maeHome', 'sleep']] },
  hollis: { name: 'Hollis Grant', role: 'gentleman', seed: 'hollis-grant', perk: 'Focus training', seat: 1, weapon: ['revolver'],
    routine: [[6, 9, 'lookout|corralRail', null], [9, 13, 'porch|well', null], [13, 18, 'corralRail|hay', null], [19, 22, 'seat', 'sit'], [22, 6, 'bunk', 'bunk']] },
  june: { name: 'June Whitfield', role: 'townswoman', seed: 'june-whitfield', perk: 'A job lead each day', seat: 2,
    routine: [[7, 11, 'porch|well', null], [11, 17, 'garden|fire', null], [17, 19, 'well', null], [19, 22, 'seat', 'sit'], [22, 7, 'bunk', 'bunk']] },
  abel: { name: 'Abel Hutchins', role: 'rancher', seed: 'abel-hutchins', perk: 'Better horses for sale', seat: 3,
    routine: [[6, 12, 'corralRail|corral', null], [12, 18, 'barn|corralRail', null], [18, 19, 'trough', null], [19, 22, 'seat', 'sit'], [22, 6, 'bunk', 'bunk']] },
};

/** Campfire talk (original writing). [speaker, line] pairs; '*' is any companion. */
const CHATTER = [
  ['mae', "Beans again. Don't look at me like that, you were raised on 'em."], ['hollis', 'I once shot a man over a pot of coffee. Worse coffee than this.'],
  ['june', 'Wire from Fort Granger today said rain by Sunday. Wire from Saltmesa said it never rains. One of them is lying.'],
  ['abel', 'That bay mare kicked me twice before noon. I think she likes me.'], ['mae', "Your daddy used to sit right where you're sitting, Eli. Said the fire talked if you let it."],
  ['hollis', "Steady hands come from a steady head. Mine's mostly steady these days."], ['june', 'Judge Crane sends more telegrams than the whole county. Short ones. Angry ones.'],
  ['abel', "A horse knows when you're scared. So do people. Only the horse is honest about it."], ['mae', "Somebody check the chickens before the coyotes do."],
  ['*', "Listen to that wind. Coming down off the Greywind."], ['*', 'Smells like snow up high.'], ['*', 'Good fire.'],
  ['hollis', 'Saltmesa sun cooks a man slow. Learned to drink before I was thirsty.'], ['june', "Copperbell's got a new preacher every year and the same sinners."],
  ['mae', "Roof's not leaking tonight. I'll take it."], ['abel', 'Corral needs another rail on the north side. Tomorrow.'],
];
const EXCHANGES = [
  [['mae', 'More coffee, Hollis?'], ['hollis', "Only if it's hot enough to strip paint."]],
  [['june', "Abel, you ever going to name that colt?"], ['abel', "When he earns it."]],
  [['hollis', 'June, read us something from the wire.'], ['june', "Cattle prices down, whiskey prices up. Same as last week."]],
  [['abel', 'Mae, this stew is fine.'], ['mae', "Fine? It's the best thing you'll eat this side of the river, and you know it."]],
];
const TOWN_POINTS = { copperbell: 'Copperbell', saltmesa: 'Saltmesa Trading Post', greywind: 'Greywind Lumber Camp' };
const _v = new THREE.Vector3();
const rand = (a, b) => a + Math.random() * (b - a);

export default class Companions extends System {
  constructor(game) {
    super(game);
    this.recruited = new Set(['mae']); this.npcs = new Map(); this.introDone = false;
    this.parcelDay = 0; this.parcelTaken = 0; this.lead = null; this.leadDay = 0; this.trained = false;
    this.fire = null; this._t = 0; this._chatT = 6; this._humT = 40; this._queue = []; this.log = [];
  }

  async init() {
    const g = this.game;
    this.ranch = g.get('ranch');
    this._registerTrees();
    g.events.on(EVENTS.GAME_START, ({ newGame } = {}) => { if (newGame) this._reset(); this._spawnAll(); });
    g.events.on(EVENTS.RANCH_UPGRADED, () => { this._spawnAll(); this._reroute(); });
    g.events.on('ranch:morning', ({ day }) => { this.parcelDay = day; });
    g.events.on(EVENTS.DIALOGUE_END, ({ id } = {}) => { if (id === 'mae_intro') this.introDone = true; });
    g.events.on(EVENTS.ZONE_ENTERED, ({ zone }) => this._leadArrive(String(zone || '').split('/')[0]));
    if (g.state === 'playing') this._spawnAll();
    g.debug?.addTuning('Companions', TUNING);
  }

  // ---------------------------------------------------------------- Bible API
  /** A companion joins the ranch. @returns {boolean} true if newly recruited */
  recruit(id) {
    const g = this.game, C = COMPANIONS[id];
    if (!C || this.recruited.has(id)) return false;
    this.recruited.add(id);
    if (id === 'june') this._replacePostmaster();
    g.events.emit(EVENTS.COMPANION_RECRUITED, { id });
    const here = this._spawnAll().includes(id);
    g.ui.notify(here ? `${C.name} has moved onto the ranch.` : `${C.name} will move onto the ranch once there's a bunkhouse to sleep in.`, { duration: 4 });
    return true;
  }
  has(id) { return this.recruited.has(id); }
  /** Recruited companions: [{ id, name, perk, home: boolean, npc }] */
  list() { return [...this.recruited].map((id) => ({ id, name: COMPANIONS[id].name, perk: COMPANIONS[id].perk, home: this.npcs.has(id), npc: this.npcs.get(id) || null })); }
  /** Which recruited companions actually live on the ranch (bed limits). */
  living() { return (this.ranch?.beds ?? 1) > 1 ? [...this.recruited] : ['mae']; }

  // ---------------------------------------------------------------- people on the ranch
  _spawnAll() {
    const g = this.game, npcs = g.get('npcs'), out = [];
    if (!npcs || !this.ranch) return out;
    for (const id of this.living()) {
      out.push(id);
      if (this.npcs.has(id) && npcs.list.includes(this.npcs.get(id))) continue;
      const C = COMPANIONS[id], sched = this._schedule(id), first = this._slotNow(sched);
      const p = first?.at || [this.ranch.center.x, this.ranch.center.z];
      const n = npcs.spawn({
        id: `companion:${id}`, name: C.name, role: C.role, seed: C.seed, faction: 'civilian', persistent: true, wander: false,
        position: { x: p[0] + 0.3, z: p[1] + 0.3 }, home: p, schedule: sched, canSurrender: true, aggression: 0.2, weapon: C.weapon,
        dialogue: `companion_${id}`, companion: id,
      });
      if (!n) continue;
      n.companion = id; this.npcs.set(id, n);
      n._talk = g.interact.register({ object: n.object3d, radius: 2.2, priority: 0.2, label: () => (id === 'mae' && this._parcelReady() ? `Talk to ${C.name.split(' ')[0]} (a parcel waits)` : `Talk to ${C.name.split(' ')[0]}`), condition: () => !n.dead && g.player.state === 'onFoot' && !g.get('dialogue')?.active, onInteract: () => this.talk(id) });
    }
    return out;
  }
  /** Daily routine as NPC schedule slots, from ranch spots that exist right now. */
  _schedule(id) {
    const C = COMPANIONS[id], R = this.ranch, out = [];
    for (const [from, to, where, anim] of C.routine) {
      let p = null, yaw;
      if (where === 'seat') { const s = R.spot('seats')?.[C.seat]; if (s) { p = s.pos; yaw = s.yaw; } }
      else for (const name of where.split('|')) { const s = R.spot(name); if (s && !Array.isArray(s)) { p = s.pos || s; break; } }
      if (!p) p = R.spot('fire') || R.center;
      if (where === 'fire' && anim === 'cook') { const f = R.spot('fire'); const s = R.spot('seats')?.[C.seat]; if (s) { p = s.pos; yaw = s.yaw; } else if (f) p = f; }
      out.push({ from, to, at: [p.x, p.z], anim: anim === 'bunk' ? null : anim, yaw, bunk: anim === 'bunk' });
    }
    return out;
  }
  _slotNow(sched, hour = this.game.sys('sky').timeOfDay ?? 12) { return sched.find((s) => (s.from <= s.to ? hour >= s.from && hour < s.to : hour >= s.from || hour < s.to)) || null; }
  /** After an upgrade the spots move (the house goes up, the bunkhouse appears): give everyone their new routine. */
  _reroute() {
    for (const [id, n] of this.npcs) {
      n.def.schedule = this._schedule(id);
      if (n.brain?.state === 'schedule') { n.brain.d.slot = undefined; n.brain.d.check = 0; }
    }
  }
  _replacePostmaster() {
    const g = this.game, npcs = g.get('npcs'), shops = g.get('shops'), def = shops?.shopDef?.('cb_post');
    if (def) { def.keeperName = 'Otis Breen'; def.keeperRole = 'townsman'; }
    const k = npcs?.byId?.get('keeper:cb_post');
    if (k) { const d = { ...k.def, name: 'Otis Breen', role: 'townsman', seed: 'otis-breen', position: { x: k.position.x, z: k.position.z } }; npcs.despawn(k); const n = npcs.spawn(d); if (n) n.shop = 'cb_post'; }
  }

  update(dt) {
    const g = this.game;
    if (g.state !== 'playing' || !this.ranch) return;
    const sky = g.sys('sky'), h = sky.timeOfDay ?? 12;
    this._fireTick(dt, h);
    if ((this._t -= dt) > 0) return;
    this._t = TUNING.checkEvery;
    const doors = (g.get('towns')?.doors || []).filter((d) => d.town?.id === 'ranch');
    for (const [, n] of this.npcs) {
      if (n.dead) continue;
      const slot = this._slotNow(n.def.schedule, h);
      // bunk: they go into the bunkhouse at night
      const inBunk = !!slot?.bunk && n.arrived && n.brain?.state === 'schedule';
      if (n.object3d.visible === inBunk) n.object3d.visible = !inBunk;
      // never park in a doorway
      if (n.arrived && n.brain?.calm !== false) for (const d of doors) if (d.center && Math.hypot(d.center.x - n.position.x, d.center.z - n.position.z) < TUNING.doorClear) {
        const s = this.ranch.spot('street')?.reduce((a, b) => (a.distanceTo(n.position) < b.distanceTo(n.position) ? a : b));
        if (s) n.moveTo(_v.copy(s), 'walk');
      }
    }
    this._chatter(TUNING.checkEvery, h);
  }

  // ---------------------------------------------------------------- evenings at the fire
  _fireTick(dt, h) {
    const g = this.game, want = h >= TUNING.fire.from && h < TUNING.fire.to && this.npcs.size > 0, F = this.ranch.spot('fire');
    if (!F) return;
    if (want && !this.fire) {
      const vfx = g.sys('vfx'), base = F.clone().setY(F.y + 0.1), L = TUNING.fire.light;
      const light = new THREE.PointLight(L.color, L.intensity, L.distance, 2); light.castShadow = false; light.position.copy(base).setY(base.y + 0.6); g.scene.add(light);
      this.fire = { light, t: 0, fx: [vfx.spawn('fire_small', { position: base }), vfx.spawn('embers', { position: base.clone().setY(base.y + 0.2) }), vfx.spawn('campfire_smoke', { position: base.clone().setY(base.y + 0.6) }), vfx.spawn('lamp_glow', { position: base.clone().setY(base.y + 0.3), color: 0xff7a30, scale: 1.6, flicker: 0.4, intensity: 2.4 })],
        snd: g.audio.play('campfire', { position: base, loop: true, volume: 0.8 }) };
    } else if (!want && this.fire) {
      for (const f of this.fire.fx) f.stop(); this.fire.snd?.stop?.(); this.fire.light.removeFromParent(); this.fire.light.dispose?.(); this.fire = null;
    }
    if (this.fire) {
      const c = this.fire, L = TUNING.fire.light; c.t += dt;
      c.light.intensity = L.intensity * (1 + L.flicker * (Math.sin(c.t * 9.1) * 0.45 + Math.sin(c.t * 23.7 + 1.3) * 0.3 + (Math.random() - 0.5) * 0.5));
    }
  }
  /** Who's sitting at the fire right now. */
  atFire() {
    const F = this.ranch?.spot('fire'); if (!F) return [];
    return [...this.npcs.values()].filter((n) => !n.dead && n.posing === 'sit' && n.position.distanceTo(F) < 4.5);
  }
  _chatter(step, h) {
    const g = this.game, F = this.ranch.spot('fire'), social = g.get('social');
    if (!F || !social || h < TUNING.evening[0] || h >= TUNING.evening[1] || g.get('dialogue')?.active) { this._queue.length = 0; return; }
    if (g.player.position.distanceTo(F) > TUNING.chatterRange) return;
    const here = this.atFire(); if (!here.length) return;
    if (this._queue.length) { const [who, text] = this._queue.shift(); const n = this.npcs.get(who); if (n && here.includes(n)) this._say(n, text); return; }
    if ((this._humT -= step) <= 0) { this._humT = rand(...TUNING.humEvery); this.hum(here[Math.floor(Math.random() * here.length)]); this._chatT = 12; return; }
    if ((this._chatT -= step) > 0) return;
    this._chatT = rand(...TUNING.chatterEvery);
    const ids = here.map((n) => n.companion);
    const ex = EXCHANGES.filter((e) => e.every(([w]) => ids.includes(w)));
    if (ex.length && Math.random() < 0.35) { const e = ex[Math.floor(Math.random() * ex.length)]; this._say(this.npcs.get(e[0][0]), e[0][1]); this._queue.push(...e.slice(1)); return; }
    const lines = CHATTER.filter(([w]) => w === '*' || ids.includes(w));
    const [w, text] = lines[Math.floor(Math.random() * lines.length)];
    this._say(w === '*' ? here[Math.floor(Math.random() * here.length)] : this.npcs.get(w), text);
  }
  _say(n, text) { if (!n) return; this.game.get('social')?.say(n, text); this.log.unshift(`${n.def.name}: ${text}`); this.log.length = Math.min(this.log.length, 10); }
  /** Somebody hums the old tune at the fire (the game's main motif). @returns seconds */
  hum(n = this.atFire()[0]) {
    const g = this.game, music = g.get('music'); if (!n) return 0;
    g.ui.subtitle(n.def.name, '(hums an old tune)', 4);
    music?.duck?.(true);
    const len = music?.playMotif?.('hum', { mood: 'ranch', vel: 0.55 }) || 6;
    setTimeout(() => music?.duck?.(false), (len + 0.8) * 1000);
    this.log.unshift(`${n.def.name}: (hums)`);
    return len;
  }

  // ---------------------------------------------------------------- talking and perks
  /** Opens a companion's conversation (E or the Q greet). */
  talk(id) {
    const g = this.game, n = this.npcs.get(id), dlg = g.get('dialogue');
    if (!n || !dlg) return false;
    if (id === 'mae' && !this.introDone && dlg.get('mae_intro')) return dlg.start('mae_intro', { speaker: n });
    return dlg.start(`companion_${id}`, { speaker: n });
  }
  _parcelReady() { const day = this.game.sys('sky').day || 1; return this.parcelDay === day && this.parcelTaken !== day; }
  takeParcel() {
    const g = this.game, inv = g.sys('inventory'), day = g.sys('sky').day || 1;
    if (!this._parcelReady()) return false;
    this.parcelTaken = day;
    for (const [id, q] of Object.entries(TUNING.parcel)) inv.add(id, q);
    g.ui.notify(`Mae's parcel: ${Object.entries(TUNING.parcel).map(([id, q]) => `${q} ${ITEMS[id]?.name || id}`).join(', ')}.`, { duration: 3.5 });
    g.audio.play('pickup');
    return true;
  }
  /** Hollis's training: Focus level 2. */
  train() {
    const g = this.game, focus = g.get('focus');
    if (!focus || focus.level >= 2) return false;
    focus.setLevel(2); this.trained = true;
    g.ui.notify('Focus improved: chest shots mark themselves while you aim, and the meter drains slower.', { duration: 5 });
    return true;
  }
  /** June's job lead: a letter for a town; delivered when you ride in. */
  takeLead() {
    const g = this.game, day = g.sys('sky').day || 1;
    if (this.lead || this.leadDay === day) return null;
    const towns = Object.keys(TOWN_POINTS), to = towns[Math.floor(Math.random() * towns.length)];
    const pay = Math.round(rand(...TUNING.letterPay));
    this.lead = { to, pay, day }; this.leadDay = day;
    const t = g.get('towns')?.towns?.get(to);
    if (t) g.ui.setWaypoint(t.center.x, t.center.z, `Letter for ${TOWN_POINTS[to]}`);
    g.ui.notify(`June's lead: carry a letter to ${TOWN_POINTS[to]} — $${pay} on delivery.`, { duration: 4 });
    return this.lead;
  }
  _leadArrive(townId) {
    const g = this.game, L = this.lead;
    if (!L || L.to !== townId) return;
    this.lead = null;
    g.sys('wallet').add(L.pay, 'letter'); g.get('honor')?.change?.(TUNING.letterHonor, 'errand');
    g.ui.clearWaypoint(); g.ui.notify(`Letter delivered in ${TOWN_POINTS[townId]}: $${L.pay}.`);
  }

  _registerTrees() {
    const g = this.game, dlg = g.get('dialogue'); if (!dlg) return;
    const R = () => this.ranch, next = () => { const r = R(); const s = ['house', 'garden', 'corral', 'barn', 'smokehouse', 'windmill', 'bunkhouse', 'lookout'].find((k) => !r.level(k) && !r.pending.includes(k)); return s ? r.info(s) : null; };
    dlg.register({ id: 'companion_mae', start: 'hi', speakerName: 'Mae Dorsey', nodes: {
      hi: { speaker: 'npc', text: () => (this._parcelReady() ? "There you are. I packed you something, and don't you dare say you're not hungry." : R().pending.length ? "The hands are coming tonight. Try not to get yourself shot before you see it." : 'Eli. You look like you slept in a ditch.'),
        choices: [
          { text: 'Thanks for the parcel.', condition: () => this._parcelReady(), action: () => this.takeParcel(), next: 'parcel' },
          { text: "How's the place?", next: 'place' },
          { text: 'Let me see the ledger.', next: null, result: 'ledger', action: () => setTimeout(() => g.ui.openScreen('ledger'), 400) },
          { text: 'Just checking on you.', next: 'bye', honor: 0.2 },
        ] },
      parcel: { speaker: 'npc', text: 'Jerky, beans and coffee. Eat the beans first, they keep worst.', next: null },
      place: { speaker: 'npc', text: () => { const n = next(); return n ? `Next thing we need is the ${n.name.toLowerCase()} — $${n.cost}. ${n.effect}. The ledger's on the table.` : "Look at it, Eli. Your daddy'd hardly know it. I hardly do."; }, next: null },
      bye: { speaker: 'npc', text: "Go on, I've got bread rising.", next: null },
    } });
    dlg.register({ id: 'companion_hollis', start: 'hi', speakerName: 'Hollis Grant', nodes: {
      hi: { speaker: 'npc', text: () => (g.get('focus')?.level >= 2 ? 'Your eye is better than it was. Keep it that way.' : "You draw like a man who's thinking about it. Thinking's slow. Want me to fix that?"),
        choices: [
          { text: 'Teach me.', condition: () => (g.get('focus')?.level ?? 2) < 2, next: 'train' },
          { text: 'Tell me about the old days.', next: 'old' },
          { text: 'Later, Hollis.', next: null },
        ] },
      train: { speaker: 'npc', text: "Breathe out. Let the world slow down. Look for the chest, not the face — the face moves. There. Again. Again.", onEnter: () => this.train(), next: 'trained' },
      trained: { speaker: 'npc', text: "That'll do. You'll feel it next time it counts.", next: null },
      old: { speaker: 'npc', text: "The old days were mostly waiting, and then about four seconds that weren't. I'm still paying for the four seconds.", next: null },
    } });
    dlg.register({ id: 'companion_june', start: 'hi', speakerName: 'June Whitfield', nodes: {
      hi: { speaker: 'npc', text: () => (this.lead ? `That letter's still for ${TOWN_POINTS[this.lead.to]}, Eli.` : this.leadDay === (g.sys('sky').day || 1) ? 'Nothing more on the wire today.' : 'I heard something on the wire this morning, if you want honest work.'),
        choices: [
          { text: 'What work?', condition: () => !this.lead && this.leadDay !== (g.sys('sky').day || 1), action: () => this.takeLead(), next: 'lead' },
          { text: "What's the news?", next: 'news' },
          { text: 'Thanks, June.', next: null },
        ] },
      lead: { speaker: 'npc', text: () => (this.lead ? `A letter for ${TOWN_POINTS[this.lead.to]}. They'll pay ${this.lead.pay} dollars when it's in their hand.` : 'Never mind.'), next: null },
      news: { speaker: 'npc', text: "Crane's men bought every box of cartridges in Copperbell on Tuesday. Nobody buys that much for rabbits.", next: null },
    } });
    dlg.register({ id: 'companion_abel', start: 'hi', speakerName: 'Abel Hutchins', nodes: {
      hi: { speaker: 'npc', text: () => (R().level('barn') ? "Got a few head in the corral. Good stock, fair price." : "I can't keep horses without a barn, Eli. Build one and I'll bring stock."),
        choices: [
          { text: 'Show me the horses.', condition: () => R().level('barn') > 0, next: null, result: 'horses', action: () => setTimeout(() => g.get('shops')?.open?.('ranch_abel'), 400) },
          { text: 'Got a horse that needs breaking?', condition: () => R().level('corral') > 0 && !R().life?.doneToday('break'), next: null, result: 'break', action: () => setTimeout(() => R().life?.startChop('break'), 400) },
          { text: 'How do you break a horse?', next: 'break' },
          { text: 'Later.', next: null },
        ] },
      break: { speaker: 'npc', text: "You don't break 'em. You talk to 'em till they decide you're worth carrying. Takes longer. Lasts longer.", next: null },
    } });
  }

  _reset() {
    for (const [, n] of this.npcs) { if (n._talk) this.game.interact.unregister(n._talk); this.game.get('npcs')?.despawn(n); }
    this.npcs.clear(); this.recruited = new Set(['mae']); this.introDone = false; this.parcelDay = 0; this.parcelTaken = 0; this.lead = null; this.leadDay = 0; this.trained = false;
  }
  serialize() { return { recruited: [...this.recruited], introDone: this.introDone, parcelDay: this.parcelDay, parcelTaken: this.parcelTaken, lead: this.lead, leadDay: this.leadDay, trained: this.trained }; }
  deserialize(d) {
    if (!d) return;
    this.recruited = new Set(d.recruited || ['mae']); this.recruited.add('mae');
    Object.assign(this, { introDone: !!d.introDone, parcelDay: d.parcelDay || 0, parcelTaken: d.parcelTaken || 0, lead: d.lead || null, leadDay: d.leadDay || 0, trained: !!d.trained });
    if (this.recruited.has('june')) this._replacePostmaster();
    this._spawnAll(); this._reroute();
    if (this.lead) { const t = this.game.get('towns')?.towns?.get(this.lead.to); if (t) this.game.ui.setWaypoint(t.center.x, t.center.z, `Letter for ${TOWN_POINTS[this.lead.to]}`); }
  }
  dispose() { if (this.fire) { for (const f of this.fire.fx) f.stop(); this.fire.light.removeFromParent(); } }
}
