import * as THREE from 'three';
import { findCover, claim, clearShot } from './Tactics.js';
import { isBlocked } from './Navigation.js';

/**
 * NPC brain (Part 7): a hierarchical state machine.
 *   routine — idle, wander, schedule (work, eat, sleep, saloon by hour), patrol, talk (pairs gesture and murmur), travel
 *   alert   — alert (turn toward something), investigate, search (a lost fight), returning
 *   danger  — flee, cower, surrender (hands up, npc:surrendered), fight (cover, peek-and-shoot, reload in cover,
 *             flank when the target is pinned, charge without cover, fists when unarmed), arrest (lawmen, wanted 1)
 *   out     — restrained (lassoed, hogtied, carried), dead
 * Reactions common to every calm or alert state run first each tick: seeing a hostile, being aimed at, gunfire.
 */
export const TUNING = {
  idle: [3, 8], wanderRadius: 18, talkChance: 0.35, talkTime: [8, 15], talkRange: 4.5,
  investigateLook: 4.5, searchTime: 24, searchPoints: 3, lostAfter: 7, returnCalm: 25,
  fleeDist: 65, fleeTime: 25, cowerNear: 9, cowerTime: 18, aimedAtTime: 0.8,
  coverHold: [0.7, 1.6], peekTime: [1.6, 3.0], peekShots: [2, 4], chargeStop: 9, standShootBeyond: 16,
  moraleHealth: 35, surrenderChance: 0.55, surrenderTimeout: 25, arrestDist: 6,
  gunshotFlee: 45, gunshotAlert: 250,
};

const CALM = new Set(['idle', 'wander', 'schedule', 'patrol', 'talk', 'travel', 'returning']);
const ALERT = new Set(['alert', 'investigate', 'search']);
const rand = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3(), _c = new THREE.Vector3();

export class Brain {
  constructor(npc) {
    this.npc = npc; this.state = null; this.t = 0; this.d = {}; this.prev = null;
    this.set(npc.def.start || (npc.def.schedule ? 'schedule' : npc.def.patrol ? 'patrol' : 'idle'));
  }
  get calm() { return CALM.has(this.state); }
  get busy() { return !this.calm && !ALERT.has(this.state); }
  set(name, data = {}) {
    const S = STATES[name];
    if (!S) return;
    if (this.state) STATES[this.state].exit?.(this);
    this.prev = this.state; this.state = name; this.t = 0; this.d = data;
    S.enter?.(this);
  }
  update(dt) {
    this.t += dt;
    if (this.state !== 'dead' && this.state !== 'restrained') this._react(dt);
    STATES[this.state].update?.(this, dt);
  }

  /** Something happened to this NPC: 'heard' {kind, position, source}, 'damaged' {source, amount}, 'order' {...}. */
  onEvent(type, info = {}) {
    const n = this.npc;
    if (this.state === 'dead') return;
    if (type === 'damaged') {
      const src = info.source;
      if (src && src !== n.entity) { n.grudge(src); n.system.alertGroup(n, src); }
      if (this.state === 'surrender' || this.state === 'restrained') return;
      if (src && n.armed && n.def.fights !== false) this.fight(src);
      else this.set('flee', { from: (src?.position || n.position).clone() });
      return;
    }
    if (type === 'heard') {
      if (this.busy) return;
      const d = info.position.distanceTo(n.position), gun = info.kind === 'gun';
      if (gun && !n.armed) { // civilians: run from gunfire close by, look up from far away
        if (d < TUNING.gunshotFlee) { n.say('panic'); this.set(d < TUNING.cowerNear * 1.5 ? 'cower' : 'flee', { from: info.position.clone() }); }
        else if (this.calm) this.set('alert', { at: info.position.clone(), next: 'returning', soft: false });
        return;
      }
      if (gun && info.source && n.hostileTo(info.source) && n.armed) { this.fight(info.source, info.position); return; }
      if (!ALERT.has(this.state) || this.state === 'alert') this.set('alert', { at: info.position.clone(), next: 'investigate' });
      return;
    }
    if (type === 'order' && info.kind === 'arrest') this.set('arrest', { target: info.target });
    if (type === 'order' && info.kind === 'fight') this.fight(info.target);
    if (type === 'order' && info.kind === 'calm') this.set('returning');
  }

  /** Enter (or keep) a fight against `target`. */
  fight(target, seenAt = null) {
    const n = this.npc;
    if (!target || target === n.entity || target.alive === false) return;
    if (!n.armed && n.def.fights === false) { this.set('flee', { from: target.position.clone() }); return; }
    if (this.state === 'fight' && this.d.target === target) return;
    this.set('fight', { target, lastSeen: (seenAt || target.position).clone(), lastSeenAt: n.game.now, spotted: n.game.now });
  }

  _react(dt) {
    const n = this.npc, g = n.game, P = n.perception, pl = g.player;
    if (this.state === 'fight' || this.state === 'flee' || this.state === 'surrender' || this.state === 'arrest') return;
    // seeing an enemy (Eli, or a hostile faction member)
    if (P.sees && n.hostileTo(pl.entity)) {
      if (n.armed) { n.say('spotted'); this.fight(pl.entity); } else this.set('flee', { from: pl.position.clone() });
      return;
    }
    const foe = n.system.visibleFoe(n);
    if (foe) { if (n.armed) this.fight(foe); else this.set('flee', { from: foe.position.clone() }); return; }
    // being aimed at by Eli
    const combat = g.get('combat');
    if (combat?.isAiming && combat.aimHit?.entity === n.entity && P.canSee) {
      this.d._aimed = (this.d._aimed || 0) + dt;
      if (this.d._aimed > TUNING.aimedAtTime) {
        this.d._aimed = 0;
        if (!n.armed || n.def.faction === 'civilian') { n.say('beg'); this.set(Math.random() < 0.6 ? 'surrender' : 'cower', { from: pl.position.clone() }); }
        else { n.grudge(pl.entity); n.say('threat'); this.fight(pl.entity); }
      }
    } else this.d._aimed = 0;
    // something seen out of the corner of the eye (only people with a reason to care: enemies, and lawmen while Eli is wanted)
    if (this.calm && P.suspects && !P.sees && (n.hostileTo(pl.entity) || (n.faction === 'law' && g.sys('law').isWanted()))) { if (this.state !== 'alert') this.set('alert', { at: pl.position.clone(), next: 'investigate', soft: true }); }
  }
}

// ---------------------------------------------------------------- states
const STATES = {
  // ---------- routine
  idle: {
    enter(b) { b.npc.stop(); b.d.timer = rand(...TUNING.idle); b.d.look = rand(2, 4); },
    update(b, dt) {
      const n = b.npc;
      if ((b.d.look -= dt) <= 0) { b.d.look = rand(2, 5); n.faceYaw(n.yaw + rand(-1.2, 1.2)); }
      if (b.t < b.d.timer) return;
      if (n.def.faction === 'civilian' && Math.random() < TUNING.talkChance) {
        const p = n.system.talkPartner(n, TUNING.talkRange);
        if (p) { const t = rand(...TUNING.talkTime); b.set('talk', { partner: p, timer: t, lead: true }); p.brain.set('talk', { partner: n, timer: t, lead: false }); return; }
      }
      b.set(n.def.schedule ? 'schedule' : n.def.patrol ? 'patrol' : n.def.wander === false ? 'idle' : 'wander');
    },
  },
  wander: {
    enter(b) {
      const n = b.npc, r = n.def.wanderRadius ?? TUNING.wanderRadius, phys = n.game.physics;
      for (let i = 0; i < 8; i++) { // a free spot (not inside a building or a rock)
        const a = Math.random() * Math.PI * 2, k = Math.sqrt(Math.random()) * r, x = n.home.x + Math.cos(a) * k, z = n.home.z + Math.sin(a) * k;
        if (isBlocked(phys, x, z, 0.7) && i < 7) continue;
        n.moveTo(_v.set(x, 0, z), 'walk'); return;
      }
    },
    update(b) { if (b.npc.arrived || b.t > 40) b.set('idle'); },
  },
  schedule: {
    enter(b) { b.d.slot = null; b.d.check = 0; },
    update(b, dt) {
      const n = b.npc, hour = n.game.sys('sky').timeOfDay ?? 12;
      if ((b.d.check -= dt) > 0) return;
      b.d.check = 4;
      const slot = n.def.schedule.find((s) => (s.from <= s.to ? hour >= s.from && hour < s.to : hour >= s.from || hour < s.to)) || null;
      if (slot !== b.d.slot) { b.d.slot = slot; b.d.doing = false; n.clearPose(); if (slot?.at) n.moveTo(_v.set(slot.at[0], 0, slot.at[1]), 'walk'); }
      if (!slot) { b.set('wander'); return; }
      if (!b.d.doing && (n.arrived || !slot.at)) {
        b.d.doing = true;
        if (slot.yaw !== undefined) n.faceYaw(slot.yaw);
        if (slot.anim === 'patrol' && slot.route) { b.set('patrol', { route: slot.route, back: 'schedule' }); return; }
        if (slot.anim) n.pose(slot.anim);
      }
    },
    exit(b) { b.npc.clearPose(); },
  },
  patrol: {
    enter(b) { b.d.route = b.d.route || b.npc.def.patrol; b.d.i = b.d.i ?? 0; b.d.wait = 0; b.npc.moveTo(_v.set(...pt(b.d.route[b.d.i])), 'walk'); },
    update(b, dt) {
      const n = b.npc;
      if (!n.arrived) return;
      if ((b.d.wait += dt) < 3) return;
      b.d.wait = 0; b.d.i = (b.d.i + 1) % b.d.route.length;
      if (b.d.back && b.d.i === 0) { b.set(b.d.back); return; }
      n.moveTo(_v.set(...pt(b.d.route[b.d.i])), 'walk');
    },
  },
  talk: {
    enter(b) { b.npc.stop(); b.d.turn = b.d.lead ? 0 : 3; },
    update(b, dt) {
      const n = b.npc, p = b.d.partner;
      if (!p || p.brain.state !== 'talk' || p.dead) { b.set('idle'); return; }
      n.facePoint(p.position);
      b.d.turn -= dt;
      if (b.d.turn <= 0) { b.d.turn = rand(2.5, 4); n.human?.setState('talk'); n.human && (n.human.talking = true); n.murmur(); }
      else if (b.d.turn < 1.2 && n.human?.upperState === 'talk') { n.human.stopUpper(0.4); n.human.talking = false; }
      if (b.t > b.d.timer) b.set('idle');
    },
    exit(b) { const h = b.npc.human; if (h) { if (h.upperState === 'talk') h.stopUpper(0.3); h.talking = false; } },
  },
  travel: {
    enter(b) { const dst = b.npc.def.destination; if (dst) b.npc.moveTo(_v.set(dst[0], 0, dst[1]), b.npc.horse ? 'ride' : 'walk'); },
    update(b) { if (b.npc.arrived) b.set('idle'); },
  },
  returning: {
    enter(b) { const n = b.npc; n.setAlert(1); n.holster(); n.setCrouch(false); n.aim(null); n.moveTo(n.home, 'walk'); },
    update(b) { if (b.npc.arrived || b.t > 40) { b.npc.setAlert(0); b.set(b.npc.def.schedule ? 'schedule' : b.npc.def.patrol ? 'patrol' : 'idle'); } },
  },
  // ---------- talking with Eli (Part 8): listening, chatting or squaring up to him
  social: {
    enter(b) { const n = b.npc; n.stop(); n.clearPose(); n.facePoint(n.game.player.position); if (b.d.angry) n.setAlert(Math.max(1, n.alert)); b.d.timer = b.d.timer ?? 5; },
    update(b) {
      const n = b.npc, pl = n.game.player, d = pl.position.distanceTo(n.position);
      n.facePoint(pl.position); n.human?.lookAt(_c.copy(pl.position).setY(pl.position.y + 1.6));
      if (b.t > b.d.timer || (d > (b.d.angry ? 18 : 10) && b.t > 1)) {
        if (b.d.angry) { n.say?.('lost'); b.set('returning'); } else b.set(b.prev && CALM.has(b.prev) && b.prev !== 'returning' ? b.prev : 'idle');
      }
    },
    exit(b) { const h = b.npc.human; if (h) { if (h.upperState === 'talk') h.stopUpper(0.3); h.talking = false; h.lookAt(null); } },
  },
  // ---------- alert
  alert: {
    enter(b) { const n = b.npc; n.stop(); n.setAlert(Math.max(n.alert, b.d.soft ? 1 : 2)); n.facePoint(b.d.at); if (!b.d.soft) n.say('huh'); },
    update(b) {
      if (b.t < (b.d.soft ? 2.5 : 1.4)) return;
      if (b.d.soft && !b.npc.perception.suspects) { b.npc.setAlert(0); b.set(b.prev && CALM.has(b.prev) ? b.prev : 'idle'); return; }
      b.set(b.d.next || 'investigate', { at: b.d.at });
    },
  },
  investigate: {
    enter(b) { const n = b.npc; n.setAlert(Math.max(n.alert, 1)); if (n.armed && n.def.faction !== 'civilian') n.draw(); n.moveTo(b.d.at, 'walk'); b.d.look = 0; },
    update(b, dt) {
      const n = b.npc;
      if (!n.arrived && b.t < 30) return;
      b.d.look += dt; if (Math.random() < dt) n.faceYaw(n.yaw + rand(-1.5, 1.5));
      if (b.d.look > TUNING.investigateLook) b.set('returning');
    },
  },
  search: {
    enter(b) { const n = b.npc; n.setAlert(2); n.setCrouch(false); n.say('lost'); b.d.k = 0; n.moveTo(b.d.pos, 'run'); },
    update(b) {
      const n = b.npc;
      if (b.t > TUNING.searchTime) { b.set('returning'); return; }
      if (!n.arrived) return;
      if (b.d.k++ >= TUNING.searchPoints) { b.set('returning'); return; }
      const a = Math.random() * Math.PI * 2, r = rand(6, 16);
      n.moveTo(_v.set(b.d.pos.x + Math.cos(a) * r, 0, b.d.pos.z + Math.sin(a) * r), 'walk');
    },
  },
  // ---------- danger
  flee: {
    enter(b) {
      const n = b.npc; n.setAlert(2); n.setCrouch(false); n.aim(null); n.clearPose(); if (!n.armed) n.say('panic');
      const from = b.d.from || n.position; _v.subVectors(n.position, from).setY(0);
      if (_v.lengthSq() < 0.01) _v.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      _v.normalize().multiplyScalar(TUNING.fleeDist).add(n.position);
      n.moveTo(_v, n.horse ? 'gallop' : 'sprint');
    },
    update(b) {
      const n = b.npc, pl = n.game.player;
      if (n.arrived || b.t > TUNING.fleeTime) { b.set('returning'); return; }
      // cornered by someone pointing a gun close by
      if (!n.horse && pl.position.distanceTo(n.position) < TUNING.cowerNear && n.game.get('combat')?.isAiming) b.set('cower', { from: pl.position.clone() });
    },
  },
  cower: {
    enter(b) { const n = b.npc; n.stop(); n.clearPose(); n.setCrouch(true); n.human?.setState('cower'); n.setAlert(2); },
    update(b) {
      const n = b.npc, pl = n.game.player;
      if (b.t > TUNING.cowerTime || (b.t > 5 && pl.position.distanceTo(n.position) > 22)) b.set(b.t > TUNING.cowerTime ? 'returning' : 'flee', { from: pl.position.clone() });
    },
    exit(b) { const n = b.npc; n.setCrouch(false); if (n.human?.upperState === 'cower') n.human.stopUpper(0.3); },
  },
  surrender: {
    enter(b) { const n = b.npc; n.stop(); n.clearPose(); n.setCrouch(false); n.aim(null); n.holster(true); n.human?.setState('surrender'); n.setAlert(2); n.surrendered = true; n.system.surrendered(n); n.say('surrender'); },
    update(b) {
      const n = b.npc, pl = n.game.player, combat = n.game.get('combat');
      if (combat?.isAiming && pl.position.distanceTo(n.position) < 30) b.d.calm = 0; else b.d.calm = (b.d.calm || 0) + (b.t - (b.d.last || 0));
      b.d.last = b.t;
      if (b.d.calm > TUNING.surrenderTimeout || pl.position.distanceTo(n.position) > 45) b.set('flee', { from: pl.position.clone() });
    },
    exit(b) { const n = b.npc; n.surrendered = false; if (n.human?.upperState === 'surrender') n.human.stopUpper(0.3); },
  },
  arrest: {
    enter(b) { const n = b.npc; if (n.horse) n.dismount(); n.setAlert(2); n.draw(); n.say('arrest'); },
    update(b) {
      const n = b.npc, t = b.d.target;
      if (!t || t.alive === false) { b.set('returning'); return; }
      const d = t.position.distanceTo(n.position);
      if (d > TUNING.arrestDist) n.moveTo(t.position, d > 15 ? 'run' : 'walk'); else { n.stop(); }
      n.facePoint(t.position); n.aim(chest(t, _c));
    },
    exit(b) { b.npc.aim(null); },
  },
  fight: {
    enter(b) { const n = b.npc; if (n.horse) n.dismount(); n.setAlert(3); n.clearPose(); if (!n.brawling) n.draw(); else n.holster(); b.d.mode = 'seek'; b.d.timer = 0; b.d.shots = 0; n.system.joinFight(n, b.d.target); },
    update(b, dt) { fightTick(b, dt); },
    exit(b) { const n = b.npc; claim(n, null); n.aim(null); n.setCrouch(false); n.system.leaveFight(n); n.brawling = false; },
  },
  // ---------- out of action
  restrained: {
    enter(b) { const n = b.npc; n.stop(); n.aim(null); n.setCrouch(false); n.setAlert(0); },
    update(b) { const e = b.npc.entity; if (!e.lassoed && !e.hogtied && !e.carriedBy) b.set('flee', { from: b.npc.game.player.position.clone() }); },
  },
  dead: { enter(b) { const n = b.npc; n.stop(); n.aim(null); n.setAlert(0); claim(n, null); } },
};
const pt = (p) => [p[0], 0, p[1]];
/** A body's chest point (where people aim). */
export function chest(e, out) { out.copy(e.position); out.y += (e.height || 1.8) * 0.7; return out; }

/** One fight tick: cover, peeking, reloading, flanking, charging; morale; losing the target. */
function fightTick(b, dt) {
  const n = b.npc, g = n.game, d = b.d, T = d.target, P = n.perception;
  if (!T || T.alive === false || T.hogtied) { n.say('clear'); b.set('returning'); return; }
  if (T === g.player.entity && g.player.state === 'dead') { b.set('returning'); return; }
  const tp = chest(T, _c);
  const sees = T === g.player.entity ? P.canSee && P.awareness > 0.5 : P.visibility(T) > 0;
  if (sees) { d.lastSeen.copy(T.position); d.lastSeenAt = g.now; }
  else if (g.now - d.lastSeenAt > TUNING.lostAfter) { b.set('search', { pos: d.lastSeen.clone() }); return; }
  // morale: badly hurt and the fight is going badly
  if (n.entity.health < TUNING.moraleHealth && !d.moraleChecked) {
    d.moraleChecked = true;
    if (n.def.canSurrender !== false && Math.random() < TUNING.surrenderChance * (1.2 - n.aggression)) { b.set('surrender'); return; }
  }
  const dist = T.position.distanceTo(n.position);
  // no gun: brawl or run
  if (!n.armed) {
    if (dist < 1.6) { n.stop(); n.facePoint(T.position); if (n.meleeCool <= 0) n.punch(T); }
    else if (n.aggression > 0.4 || n.brawling) n.moveTo(T.position, dist > 4 ? 'run' : 'walk', { direct: true });
    else b.set('flee', { from: T.position.clone() });
    return;
  }
  if (n.needsReload && d.mode !== 'reload' && d.mode !== 'seek') { d.mode = 'reload'; n.setCrouch(true); n.aim(null); n.reload(); n.say('reload'); }
  d.timer -= dt;
  switch (d.mode) {
    case 'seek': {
      if (!d.cover) {
        d.cover = findCover(n, tp, d.flank ? { around: T.position, bearing: d.flank } : {});
        if (d.cover) { claim(n, d.cover); n.moveTo(d.cover, 'run', { direct: true }); }
        else { d.mode = dist > TUNING.standShootBeyond ? 'stand' : 'charge'; d.timer = rand(2, 4); break; }
      }
      // fire on the move now and then
      if (sees && n.canFire && Math.random() < dt * 0.6) n.shootAt(T, { moving: true });
      if (n.arrived) { d.mode = 'cover'; d.timer = rand(...TUNING.coverHold); n.setCrouch(true); n.aim(null); d.flank = undefined; }
      else if (d.timer < -12) { d.cover = null; claim(n, null); }
      break;
    }
    case 'cover': {
      n.facePoint(T.position);
      // flanked: the cover no longer blocks the shot
      if (Math.random() < dt * 2 && clearShot(g, tp, _v.copy(n.position).setY(n.position.y + 0.9))) { d.cover = null; d.mode = 'seek'; d.timer = 0; break; }
      if (d.timer <= 0) { d.mode = 'peek'; d.timer = rand(...TUNING.peekTime); d.shots = Math.round(rand(...TUNING.peekShots)); n.setCrouch(Math.random() < 0.4); }
      break;
    }
    case 'peek': {
      n.facePoint(T.position); n.aim(tp);
      if (sees && n.canFire && d.shots > 0 && g.now - d.spotted > n.reaction) { n.shootAt(T); d.shots--; }
      if (d.timer <= 0 || d.shots <= 0) { d.mode = 'cover'; d.timer = rand(...TUNING.coverHold); n.setCrouch(true); n.aim(null); }
      break;
    }
    case 'reload': {
      n.stop();
      if (!n.needsReload && n.arsenal?.state === 'ready') { d.mode = d.cover ? 'cover' : 'seek'; d.timer = rand(0.3, 0.8); }
      else if (n.needsReload && n.arsenal && n.arsenal.state !== 'reloading') { if (!n.arsenal.drawn) n.draw(); else n.reload(); } // the first try came while drawing
      break;
    }
    case 'stand': { // nothing to hide behind and far away: crouch in the open and trade shots
      n.stop(); n.setCrouch(true); n.facePoint(T.position); n.aim(tp);
      if (sees && n.canFire && g.now - d.spotted > n.reaction) n.shootAt(T);
      if (d.timer <= 0) { d.cover = null; d.mode = 'seek'; d.timer = 0; }
      break;
    }
    case 'charge': {
      n.setCrouch(false); n.aim(tp);
      if (dist > TUNING.chargeStop) n.moveTo(T.position, 'run', { direct: true }); else { n.stop(); n.facePoint(T.position); }
      if (sees && n.canFire && g.now - d.spotted > n.reaction) n.shootAt(T, { moving: dist > TUNING.chargeStop });
      if (d.timer <= 0) { d.mode = 'seek'; d.timer = 0; d.cover = null; }
      break;
    }
  }
}

/** Squad order: go around the pinned target at `bearing` (radians from the target). */
export function orderFlank(npc, bearing) {
  const b = npc.brain;
  if (b.state !== 'fight') return false;
  claim(npc, null); b.d.cover = null; b.d.flank = bearing; b.d.mode = 'seek'; b.d.timer = 0;
  npc.say('flank');
  return true;
}
