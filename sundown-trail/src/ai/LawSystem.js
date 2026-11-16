import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { ECONOMY } from '../data/economy.js';
import { WORLD } from '../data/world.js';
import { isBlocked } from './Navigation.js';

/**
 * The 'law' system (Part 7, GAME_BIBLE §6): level · bounty(region) · reportCrime(type, position, opts) ·
 * payBounty(region) · isWanted(). Added in Part 7: totalBounty(), violence(npc, source, killed, info), arrest().
 *
 * Crimes: hurting or lassoing someone who wasn't fighting Eli is assault; killing them is murder (a lawman: murder of a
 * lawman). Fighting outlaws, or anyone who attacked first, is self-defence. Lawmen who see a crime act at once; other
 * witnesses run off to report it within 25 s and can be stopped (killed, hogtied, or held at gunpoint for 1.5 s).
 * Unwitnessed crimes cost nothing. A reported crime adds bounty in its region and sets the wanted level:
 * Honor (Part 8) listens to npc:died and money:changed itself; Respected-or-better players get a warning first.
 *   1 — lawmen come to investigate and offer arrest (holster and stand still: pay the bounty or lose a day in jail)
 *   2 — lawmen shoot on sight      3 — a mounted posse rides out
 * Escape by leaving the search circle (200 m around the last sighting, shrinking while unseen) and staying unseen 30 s.
 * Unpaid bounties above $50 send bounty hunters now and then.
 */
export const TUNING = {
  reportTime: [9, 25], intimidate: 1.5, witnessRange: 60, lawSeesRange: 80, hearRange: 30,
  searchRadius: 200, searchMin: 70, shrinkTime: 120, escapeTime: 30,
  respond: { 1: 2, 2: 3, 3: 3 }, respondDist: [90, 130], posseMounted: 3, respondEvery: 40,
  arrestTime: 2.5, arrestRange: 6.5, resistRange: 30, jailFine: 0.5,
  hunterBounty: 50, hunterEvery: 240, hunterChance: 0.5, hunterCount: [2, 3], hunterTownSafe: 140,
  crimeLevel: { assault: 1, horseTheft: 1, robbery: 1, murder: 2, lawmanMurder: 3 },
  respectedGrace: 6, // Part 8: Respected-or-better Eli gets a warning before lawmen open fire
  showCircle: true,
};

const REGIONS = ['copperbell', 'blackstone', 'saltmesa', 'greywind'];
const L = WORLD.locations;
/** Where lawmen come from and where you pay (sheriff's office / post office). Part 9 puts real buildings here. */
export const OFFICES = {
  copperbell: { x: L.copperbell.x + 10, z: L.copperbell.z - 14, name: "Copperbell sheriff's office" },
  blackstone: { x: L.copperbell.x + 10, z: L.copperbell.z - 14, name: "Copperbell sheriff's office" },
  saltmesa: { x: L.saltmesaPost.x + 6, z: L.saltmesaPost.z - 4, name: 'Saltmesa post office' },
  greywind: { x: L.lumberCamp.x - 8, z: L.lumberCamp.z + 6, name: 'Greywind camp office' },
};
const rand = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3();

export default class LawSystem extends System {
  constructor(game) {
    super(game);
    this.level = 0; this.region = null; this.bounties = Object.fromEntries(REGIONS.map((r) => [r, 0]));
    this.pending = []; // witnesses running to report: { npc, type, region, position, t, limit, held }
    this.search = { center: new THREE.Vector3(), radius: 0, unseen: 0, seenAt: -1e9 };
    this.responders = new Set(); this._respondT = 0; this._hunterT = TUNING.hunterEvery; this._arrestT = 0;
    this.log = []; // recent crimes (debug and the test page)
  }

  async init() {
    const g = this.game;
    this._hud = document.createElement('div'); this._hud.className = 'sd-wanted'; this._hud.style.display = 'none';
    g.uiRoot.appendChild(this._hud);
    if (!document.getElementById('sd-wanted-style')) {
      const st = document.createElement('style'); st.id = 'sd-wanted-style';
      st.textContent = `.sd-wanted{position:absolute;top:calc(14px + var(--safe-top,0px));right:calc(16px + var(--safe-right,0px));padding:6px 12px;background:rgba(20,12,8,.72);border:1px solid rgba(200,70,42,.7);border-radius:4px;color:#f1e4c6;font:600 15px Georgia,serif;letter-spacing:.04em;text-align:right;pointer-events:none}
.sd-wanted b{color:#e05a3a;font-size:17px;letter-spacing:.12em}.sd-wanted small{display:block;font-weight:400;font-size:12px;opacity:.8}`;
      document.head.appendChild(st);
    }
    // the search circle drawn on the ground while wanted
    const seg = 96, pos = new Float32Array((seg + 1) * 3);
    this._ring = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)), new THREE.LineBasicMaterial({ color: 0xd2492c, transparent: true, opacity: 0.75, depthWrite: false }));
    this._ring.frustumCulled = false; this._ring.visible = false; this._ring.raycast = () => {}; this._ring.renderOrder = 4;
    g.scene.add(this._ring);
    g.events.on(EVENTS.PLAYER_DIED, () => { if (this.level) this._clearWanted(false, 'died'); });
    g.debug?.addTuning('Law', TUNING);
  }

  // ---------------------------------------------------------------- Bible API
  bounty(region) { return region ? this.bounties[region] || 0 : this.totalBounty(); }
  isWanted() { return this.level > 0; }
  /** Added in Part 7: all regions' bounties together. */
  totalBounty() { let s = 0; for (const r of REGIONS) s += this.bounties[r]; return s; }

  /**
   * A crime happened. opts: { witnessed (true: reported at once; false: nobody saw; undefined: look for witnesses),
   * victim (NPC), region }. @returns 'reported' | 'witnessed' (someone is running to tell) | 'unseen'
   */
  reportCrime(type, position, opts = {}) {
    const g = this.game, region = opts.region || g.sys('terrain').getRegionAt(position.x, position.z);
    if (opts.witnessed === true) { this._commit(type, position, region); return 'reported'; }
    if (opts.witnessed === false) { g.events.emit(EVENTS.CRIME_COMMITTED, { type, position: position.clone(), witnessed: false, region }); return 'unseen'; }
    const w = this._witnesses(position, opts.victim);
    if (w.law) { this._commit(type, position, region); return 'reported'; }
    if (!w.list.length) { g.events.emit(EVENTS.CRIME_COMMITTED, { type, position: position.clone(), witnessed: false, region }); this._note(type, 'unseen'); return 'unseen'; }
    const crime = { type, done: false }; // one report per crime, however many people saw it
    for (const n of w.list) {
      if (this.pending.some((p) => p.npc === n)) continue;
      this.pending.push({ npc: n, crime, type, region, position: position.clone(), t: 0, limit: rand(...TUNING.reportTime), held: 0 });
      if (!n.brain.busy || n.brain.state === 'cower') n.brain.set('flee', { from: g.player.position.clone() });
      n.setAlert(2); n.reporting = true;
    }
    g.ui.notify(w.list.length > 1 ? 'Witnesses are running to report you.' : 'A witness is running to report you.', { duration: 3 });
    this._note(type, `witnessed by ${w.list.length}`);
    return 'witnessed';
  }
  /** Pay a region's bounty (at an office). @returns {boolean} */
  payBounty(region) {
    const g = this.game, amt = this.bounties[region] || 0;
    if (!amt) return false;
    if (!g.sys('wallet').spend(amt, 'bounty')) { g.ui.notify(`You need $${amt.toFixed(2)} to pay the bounty.`); return false; }
    this.bounties[region] = 0;
    g.events.emit(EVENTS.BOUNTY_CHANGED, { region, amount: 0 });
    if (this.level && this.region === region) this._clearWanted(false, 'paid');
    return true;
  }

  // ---------------------------------------------------------------- crime detection
  /** NPCSystem hook: `npc` was hurt (or lassoed) by `source`. info: { wasHostile, wasSurrendered, lasso } */
  violence(npc, source, killed, info = {}) {
    const g = this.game, pl = g.player.entity;
    if (source !== pl) return;
    const law = npc.faction === 'law';
    if (!law && (npc.faction === 'cinder' || npc.def.hostile || npc.def.bountyHunter)) return; // outlaws are fair game
    if (!law && info.wasHostile && !info.wasSurrendered) return; // self-defence
    if (law && info.wasHostile && this.level >= 2 && !killed) return; // already shooting it out with the law
    // one assault per victim per fight is enough
    if (!killed) { if (npc._assaulted && g.now - npc._assaulted < 20) return; npc._assaulted = g.now; }
    const type = killed ? (law ? 'lawmanMurder' : 'murder') : 'assault';
    this.reportCrime(type, npc.position.clone(), { victim: npc, witnessed: law && !killed ? true : undefined });
  }

  /** Who saw it: lawmen (report at once) and other people with eyes on Eli or close enough to hear. */
  _witnesses(position, victim) {
    const g = this.game, npcs = g.get('npcs'), out = { law: false, list: [] };
    if (!npcs) return out;
    for (const n of npcs.nearby(position, TUNING.witnessRange * 1.4)) {
      if (n.dead || n.entity.hogtied || n.entity.lassoed || n.faction === 'cinder' || n.def.hostile || n.def.bountyHunter) continue;
      const d = n.position.distanceTo(position);
      if (n === victim && victim.entity.health <= 0) continue; // the dead tell no tales
      const sees = n === victim ? !victim.dead : (n.perception.visibility(g.player.entity) > 0 || (d < TUNING.hearRange && n.perception.visibility(victim?.entity) > 0) || d < 8);
      if (!sees || d > (n.faction === 'law' ? TUNING.lawSeesRange : TUNING.witnessRange)) continue;
      if (n.faction === 'law') out.law = true; else out.list.push(n);
    }
    return out;
  }

  /** The crime reaches the law: bounty, wanted level, responders. */
  _commit(type, position, region) {
    const g = this.game, add = ECONOMY.crimes[type] ?? 5;
    this.bounties[region] = (this.bounties[region] || 0) + add;
    g.events.emit(EVENTS.CRIME_COMMITTED, { type, position: position.clone(), witnessed: true, region });
    g.events.emit(EVENTS.BOUNTY_CHANGED, { region, amount: this.bounties[region] });
    let lvl = TUNING.crimeLevel[type] ?? 1;
    if (this.level && type !== 'assault') lvl = Math.max(lvl, this.level + (type === 'murder' || type === 'lawmanMurder' ? 1 : 0));
    lvl = Math.min(3, Math.max(this.level, lvl));
    this.region = region;
    this._sighting(g.player.position);
    this._note(type, 'reported');
    if (lvl !== this.level) this._setLevel(lvl);
  }
  _note(type, how) { this.log.unshift({ type, how, t: this.game.now }); this.log.length = Math.min(this.log.length, 8); }

  _setLevel(lvl) {
    const g = this.game, prev = this.level;
    this.level = lvl;
    g.events.emit(EVENTS.WANTED_CHANGED, { level: lvl, region: this.region });
    if (lvl >= 2 && prev < 2 && (g.sys('honor').value ?? 0) >= 20) this._graceUntil = g.now + TUNING.respectedGrace; // Added in Part 8
    if (lvl > prev) {
      g.ui.notify(lvl === 1 ? 'Wanted: the law is coming to have a word.' : lvl === 2 ? 'Wanted dead or alive: lawmen will shoot on sight.' : 'A posse is riding out after you.', { duration: 4 });
      this._respondT = 0;
      this._orders();
    }
  }
  /** Tell every lawman around what to do about Eli. */
  _orders() {
    const g = this.game, npcs = g.get('npcs'), pl = g.player.entity;
    if (!npcs) return;
    for (const n of npcs.list) {
      if (n.dead || n.faction !== 'law') continue;
      const grace = this.level >= 2 && g.now < (this._graceUntil || 0) && !n.grudges.has(pl);
      if (this.level === 1 || grace) {
        if (n.brain.state !== 'arrest' && n.position.distanceTo(pl.position) < 220) { n.brain.onEvent('order', { kind: 'arrest', target: pl }); if (grace) n.say('warn'); }
      }
      else if (this.level >= 2 && n.brain.state !== 'fight') {
        if (n.perception.sees || n.position.distanceTo(pl.position) < 45) n.brain.fight(pl);
        else n.brain.set('search', { pos: this.search.center.clone() });
      }
    }
  }
  _sighting(p) { const s = this.search; s.center.copy(p); s.radius = TUNING.searchRadius; s.unseen = 0; s.seenAt = this.game.now; }

  _clearWanted(escaped, why) {
    const g = this.game, npcs = g.get('npcs');
    this.level = 0; this._arrestT = 0;
    g.events.emit(EVENTS.WANTED_CHANGED, { level: 0, region: this.region });
    if (escaped) { g.events.emit(EVENTS.LAW_ESCAPED, {}); g.ui.notify('You lost the law.', { duration: 3 }); }
    if (npcs) for (const n of npcs.list) {
      if (n.dead || n.faction !== 'law') continue;
      n.grudges.delete(g.player.entity);
      if (n.brain.state === 'fight' || n.brain.state === 'arrest' || n.brain.state === 'search') n.brain.onEvent('order', { kind: 'calm' });
    }
    for (const n of this.responders) if (npcs?.list.includes(n) && !n.dead && n.position.distanceTo(g.player.position) > 60) npcs.despawn(n);
    this.responders.clear();
    void why;
  }

  // ---------------------------------------------------------------- per frame
  update(dt, rawDt) {
    const g = this.game;
    if (g.state !== 'playing') { this._hud.style.display = 'none'; this._ring.visible = false; return; }
    this._witnessTick(dt);
    if (this.level) { this._searchTick(dt); this._arrestTick(rawDt); this._respond(dt); }
    this._hunters(dt);
    this._drawHud();
  }

  _witnessTick(dt) {
    const g = this.game, combat = g.get('combat');
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i], n = p.npc, e = n.entity;
      const stopped = n.dead || e.hogtied || e.lassoed || e.carriedBy;
      if (!stopped && combat?.isAiming && combat.aimHit?.entity === e) {
        p.held += dt;
        if (p.held >= TUNING.intimidate) { n.brain.set('cower', { from: g.player.position.clone() }); n.say('beg'); this._drop(i, 'intimidated'); continue; }
      } else p.held = Math.max(0, p.held - dt * 0.5);
      if (stopped) { this._drop(i, 'stopped'); continue; }
      p.t += dt;
      // still running: keep them running away
      if (n.brain.state !== 'flee' && n.brain.state !== 'cower' && n.brain.state !== 'surrender') n.brain.set('flee', { from: g.player.position.clone() });
      if (p.crime.done) { this.pending.splice(i, 1); n.reporting = false; continue; }
      if (p.t >= p.limit) { this.pending.splice(i, 1); n.reporting = false; p.crime.done = true; this._commit(p.type, p.position, p.region); }
    }
  }
  _drop(i, why) { const p = this.pending[i]; p.npc.reporting = false; this.pending.splice(i, 1); this._note(p.type, `report ${why}`); }

  _searchTick(dt) {
    const g = this.game, npcs = g.get('npcs'), s = this.search, pp = g.player.position;
    let seen = false;
    if (npcs) for (const n of npcs.list) if (!n.dead && (n.faction === 'law' || n.def.bountyHunter) && n.perception.sees) { seen = true; break; }
    if (seen) this._sighting(pp);
    else {
      s.unseen += dt;
      s.radius = Math.max(TUNING.searchMin, TUNING.searchRadius * (1 - s.unseen / TUNING.shrinkTime));
      const out = Math.hypot(pp.x - s.center.x, pp.z - s.center.z) > s.radius;
      if (out && s.unseen >= TUNING.escapeTime) { this._clearWanted(true, 'escaped'); return; }
    }
    if (this.level >= 2 && this._ordersT === undefined) this._ordersT = 0;
    if ((this._ordersT = (this._ordersT || 0) - dt) <= 0) { this._ordersT = 3; this._orders(); }
  }

  /** Lawmen ride/walk in from out of sight toward the last sighting. */
  _respond(dt) {
    const g = this.game, npcs = g.get('npcs');
    if (!npcs) return;
    this._respondT -= dt;
    if (this._respondT > 0) return;
    this._respondT = TUNING.respondEvery;
    for (const n of this.responders) if (!npcs.list.includes(n) || n.dead) this.responders.delete(n);
    const want = TUNING.respond[this.level] + (this.level >= 3 ? TUNING.posseMounted : 0);
    const have = npcs.list.filter((n) => !n.dead && n.faction === 'law' && n.position.distanceTo(g.player.position) < 250).length;
    const pp = g.player.position, T = g.sys('terrain');
    for (let k = have; k < want; k++) {
      const mounted = this.level >= 3 && k >= TUNING.respond[this.level] - 1;
      let x = 0, z = 0;
      for (let tries = 0; tries < 10; tries++) {
        const a = Math.random() * Math.PI * 2, r = rand(...TUNING.respondDist);
        x = pp.x + Math.cos(a) * r; z = pp.z + Math.sin(a) * r;
        if (!T.isWater?.(x, z) && !isBlocked(g.physics, x, z, 1)) break;
      }
      const n = npcs.spawn({
        role: 'lawman', faction: 'law', position: { x, z }, weapon: [Math.random() < 0.5 ? 'repeater' : 'revolver'], mounted, aggression: 0.75,
        seed: `responder:${Math.random().toString(36).slice(2, 7)}`, start: 'idle',
      });
      if (!n) continue;
      this.responders.add(n);
      if (n.horse) n.gait = 'gallop';
      if (this.level === 1) n.brain.onEvent('order', { kind: 'arrest', target: g.player.entity });
      else n.brain.set('search', { pos: this.search.center.clone() });
    }
  }

  /** Level 1: a lawman with his gun on Eli; holster and stand still to be taken in. */
  _arrestTick(rawDt) {
    const g = this.game, npcs = g.get('npcs'), pl = g.player, combat = g.get('combat');
    if (this.level !== 1 || !npcs) { g.ui.clearPrompt('arrest'); this._arrestT = 0; return; }
    const cop = npcs.list.find((n) => !n.dead && n.brain.state === 'arrest' && n.position.distanceTo(pl.position) < TUNING.resistRange);
    if (!cop) { g.ui.clearPrompt('arrest'); this._arrestT = 0; return; }
    const d = cop.position.distanceTo(pl.position);
    // resisting: pointing a gun at the lawman
    if (combat?.isAiming && combat.aimHit?.entity === cop.entity) { cop.grudge(pl.entity); this._setLevel(2); g.ui.clearPrompt('arrest'); return; }
    if (d > TUNING.arrestRange) { g.ui.clearPrompt('arrest'); this._arrestT = 0; return; }
    const still = Math.hypot(pl.velocity.x, pl.velocity.z) < 0.4 && !combat?.arsenal?.drawn && pl.state === 'onFoot';
    this._arrestT = still ? this._arrestT + rawDt : 0;
    g.ui.prompt('arrest', still ? `Surrendering… ${Math.round((this._arrestT / TUNING.arrestTime) * 100)}%` : 'Holster and stand still to surrender', '');
    if (this._arrestT >= TUNING.arrestTime) { g.ui.clearPrompt('arrest'); this.arrest(); }
  }

  /** Added in Part 7: Eli is taken in — pay the region's bounty (or half your money and a night in jail). */
  async arrest() {
    const g = this.game, region = this.region || 'copperbell', amt = this.bounties[region] || 0, wallet = g.sys('wallet');
    this._clearWanted(false, 'arrested');
    await g.ui.fade(true, 0.8);
    let msg;
    if (wallet.spend(amt, 'bounty')) msg = `You paid your $${amt.toFixed(2)} bounty.`;
    else {
      const fine = Math.round(wallet.money * TUNING.jailFine * 100) / 100;
      wallet.spend(fine, 'fine'); g.sys('sky').setTime?.(((g.sys('sky').timeOfDay ?? 12) + 12) % 24);
      msg = `You spent a night in jail${fine ? ` and paid a $${fine.toFixed(2)} fine` : ''}.`;
    }
    this.bounties[region] = 0;
    g.events.emit(EVENTS.BOUNTY_CHANGED, { region, amount: 0 });
    const o = OFFICES[region] || OFFICES.copperbell;
    g.player.teleport(o.x, o.z + 3);
    await g.ui.fade(false, 0.8);
    g.ui.notify(msg, { duration: 4 });
  }

  /** Unpaid bounties above $50 bring bounty hunters (away from towns). */
  _hunters(dt) {
    const g = this.game, npcs = g.get('npcs');
    if (!npcs || this.level || this.totalBounty() <= TUNING.hunterBounty) return;
    this._hunterT -= dt;
    if (this._hunterT > 0) return;
    this._hunterT = TUNING.hunterEvery * rand(0.7, 1.3);
    const pp = g.player.position;
    for (const o of Object.values(OFFICES)) if (Math.hypot(o.x - pp.x, o.z - pp.z) < TUNING.hunterTownSafe) return;
    if (Math.random() > TUNING.hunterChance) return;
    this.sendHunters();
  }
  /** Added in Part 7: spawns a bounty-hunter party riding in on Eli (also used by the test page). */
  sendHunters(count = Math.round(rand(...TUNING.hunterCount))) {
    const g = this.game, npcs = g.get('npcs'), pp = g.player.position, a = Math.random() * Math.PI * 2;
    if (!npcs) return [];
    const out = [];
    for (let i = 0; i < count; i++) {
      const x = pp.x + Math.cos(a) * 110 + (i - 1) * 4, z = pp.z + Math.sin(a) * 110 + (i % 2) * 4;
      const n = npcs.spawn({ role: i === 0 ? 'gambler' : 'cowboy', faction: 'civilian', bountyHunter: true, fights: true, name: i === 0 ? 'Bounty hunter' : null,
        position: { x, z }, weapon: [i === 0 ? 'repeater' : i === 1 ? 'shotgun' : 'revolver'], mounted: true, aggression: 0.9, seed: `hunter:${Math.random().toString(36).slice(2, 7)}` });
      if (!n) continue;
      n.gait = 'gallop'; n.brain.set('search', { pos: pp.clone() });
      out.push(n);
    }
    if (out.length) g.ui.notify('Bounty hunters are on your trail.', { duration: 3.5 });
    return out;
  }

  // ---------------------------------------------------------------- HUD
  _drawHud() {
    const g = this.game, s = this.search, total = this.totalBounty();
    const show = this.level > 0 || this.pending.length > 0 || total > 0;
    this._hud.style.display = show ? '' : 'none';
    if (show) {
      const stars = '★'.repeat(this.level) + '☆'.repeat(3 - this.level);
      const html = this.level
        ? `<b>WANTED ${stars}</b><small>${s.unseen > 0.5 ? `Unseen ${Math.min(TUNING.escapeTime, s.unseen).toFixed(0)}/${TUNING.escapeTime} s · ` : 'Seen · '}search ${Math.round(s.radius)} m · $${(this.bounties[this.region] || 0).toFixed(2)}</small>`
        : this.pending.length ? `<b>WITNESS</b><small>Someone is running to report you</small>` : `<small>Bounty $${total.toFixed(2)}</small>`;
      if (html !== this._html) { this._html = html; this._hud.innerHTML = html; }
    }
    const ring = this._ring;
    ring.visible = TUNING.showCircle && this.level > 0;
    if (ring.visible && (this._ringR !== Math.round(s.radius) || !this._ringC?.equals(s.center))) {
      this._ringR = Math.round(s.radius); this._ringC = s.center.clone();
      const T = g.sys('terrain'), a = ring.geometry.attributes.position, seg = a.count - 1;
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * Math.PI * 2, x = s.center.x + Math.cos(t) * s.radius, z = s.center.z + Math.sin(t) * s.radius;
        a.setXYZ(i, x, T.getHeightAt(x, z) + 0.6, z);
      }
      a.needsUpdate = true;
    }
    void _v;
  }

  serialize() { return { bounties: { ...this.bounties } }; }
  deserialize(d) { if (d?.bounties) for (const r of REGIONS) this.bounties[r] = Math.max(0, +d.bounties[r] || 0); }
  dispose() { this._hud?.remove(); this._ring?.removeFromParent(); this._ring?.geometry.dispose(); }
}

export { LawSystem };
