import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { pickLine } from './Phrases.js';
import { Voice, voiceFor } from './Voice.js';

/**
 * The 'social' system (Part 8, GAME_BIBLE §9): face someone within 6 m and hold Q (D-pad up, or tap their name tag)
 * for a radial with Greet, Antagonize, Rob (with a gun drawn) and Defuse (when they're angry).
 *   Greet: Eli's greeting, then theirs, chosen by role, mood, honor tier, hour and wanted state; people with a
 *     dialogue tree start it instead. Respectable folk wave; townsfolk turn their backs on Outlaws.
 *   Antagonize: words (anger 1) → they shove Eli (2) → a fistfight, or a drawn gun from hard men (3). Meek folk
 *     back off instead, lawmen threaten a cell. Drunks are funny, miss wildly and sometimes reach for a pistol.
 *   Defuse: talk an angry person down (harder the angrier they are, easier with a good name).
 *   Rob: hands up, money handed over, and the victim is a witness who'll run to the law.
 * Fistfights end when someone is beaten: the loser backs off or begs. Drawing a gun on a brawler turns it into a gunfight.
 * Also owns the Voice (procedural murmurs) and the name tag over the person you're facing.
 */
export const TUNING = {
  range: 6, cone: 70, hold: 0.3, angerCool: 35, brawlEndPlayer: 22, brawlEndNpc: 28,
  defuse: { base: 0.78, perAnger: 0.16, perTier: 0.1, inFight: 0.22, drunk: 0.1 },
  rob: { min: 3, max: 18, poor: 0.25, gentleman: 3, refuse: 0.5, handOver: 1.4 },
  gunmanChance: 0.6, drunkGunChance: 0.35, replyDelay: 0.25,
  radius: 92, gain: 9, deadZone: 0.25,
};

const WOMEN = new Set(['townswoman', 'ranchwoman']);
const NAMES = ['Earl', 'Hank', 'Clem', 'Otis', 'Silas', 'Amos', 'Jeb', 'Wade', 'Luther', 'Cyrus', 'Abner', 'Virgil'];
const OPTIONS = [
  { id: 'greet', label: 'Greet', a: -Math.PI / 2 }, { id: 'antagonize', label: 'Antagonize', a: Math.PI },
  { id: 'defuse', label: 'Defuse', a: 0 }, { id: 'rob', label: 'Rob', a: Math.PI / 2 },
];
const CSS = `
.sd-social{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none;opacity:0;transition:opacity .12s;z-index:40}
.sd-social.sd-on{opacity:1;pointer-events:auto}
.sd-social-ring{position:absolute;left:-130px;top:-130px;width:260px;height:260px;border-radius:50%;transform:scale(var(--ui-scale,1));
  background:radial-gradient(circle,rgba(230,215,184,.94) 0 30%,rgba(205,182,139,.9) 31% 66%,rgba(160,130,90,0) 68%);box-shadow:0 0 36px rgba(0,0,0,.45)}
.sd-social-opt{position:absolute;width:100px;height:44px;margin:-22px 0 0 -50px;border-radius:9px;display:flex;align-items:center;justify-content:center;
  font:15px var(--font-display,Georgia,serif);color:var(--ink,#2b1d12);background:rgba(240,228,200,.6);border:1px solid rgba(43,29,18,.25);cursor:pointer}
.sd-social-opt.sd-sel{background:var(--rust,#8a3b1e);color:#f4ead6;transform:scale(1.08)}
.sd-social-opt.sd-off{opacity:.35;cursor:default}
.sd-social-mid{position:absolute;left:70px;top:104px;width:120px;text-align:center;font:13px/1.25 var(--font-body,Georgia,serif);color:var(--ink,#2b1d12)}
.sd-social-mid b{display:block;font:15px var(--font-display,Georgia,serif)}
.sd-nametag{position:absolute;left:0;top:0;padding:3px 9px;border-radius:12px;background:rgba(20,14,8,.66);color:#f1e4c6;font:13px Georgia,serif;
  white-space:nowrap;transform:translate(-50%,-100%);pointer-events:auto;cursor:pointer;z-index:35}
.sd-nametag.sd-angry{color:#f0a070}.sd-nametag[hidden]{display:none}
`;
const _v = new THREE.Vector3(), _f = new THREE.Vector3();

export default class Social extends System {
  constructor(game) {
    super(game);
    this.target = null; this.open = false; this.sel = null; this.vx = 0; this.vy = 0; this._hold = 0; this._busyUntil = 0;
    this.brawls = new Set(); this.robbed = new Map(); this.log = [];
  }

  async init() {
    const g = this.game;
    this.voice = new Voice(g);
    if (!document.getElementById('sd-social-css')) { const s = document.createElement('style'); s.id = 'sd-social-css'; s.textContent = CSS; document.head.append(s); }
    this.el = document.createElement('div'); this.el.className = 'sd-social';
    this.ring = document.createElement('div'); this.ring.className = 'sd-social-ring';
    this.mid = document.createElement('div'); this.mid.className = 'sd-social-mid';
    this.ring.append(this.mid); this.el.append(this.ring);
    this.opts = OPTIONS.map((o) => {
      const el = document.createElement('div'); el.className = 'sd-social-opt'; el.textContent = o.label;
      el.style.left = `${130 + Math.cos(o.a) * TUNING.radius}px`; el.style.top = `${130 + Math.sin(o.a) * TUNING.radius}px`;
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (!el.classList.contains('sd-off')) { this.sel = o.id; this.close(true); } });
      this.ring.append(el);
      return { ...o, el };
    });
    this.tag = document.createElement('div'); this.tag.className = 'sd-nametag'; this.tag.hidden = true;
    this.tag.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (this.target && !this.open) this.show(); else if (this.open) this.close(false); });
    (g.ui.hud || g.uiRoot).append(this.el, this.tag);
    g.events.on(EVENTS.PLAYER_DIED, () => { this.close(false); for (const n of this.brawls) this._endBrawl(n, 'npc'); });
    g.debug?.addTuning('Social', TUNING);
  }

  // ---------------------------------------------------------------- per frame
  update(dt, rawDt) {
    const g = this.game, input = g.input, pl = g.player;
    const playing = g.state === 'playing' && !g.ui.isScreenOpen() && pl.state === 'onFoot' && !g.get('dialogue')?.active;
    this.target = playing ? this._findTarget() : null;
    // hold Q (or D-pad up) to open; release to choose
    const want = playing && this.target && input.isDown('social');
    this._hold = want ? this._hold + rawDt : 0;
    if (!this.open && this._hold >= TUNING.hold) this.show();
    if (this.open) {
      if (!this.target || !playing) this.close(false);
      else if (!input.isDown('social') && !this._touchOpen) this.close(true);
      else this._steer(input);
    }
    this._prompt();
    this._brawlTick();
    // anger cools off
    if (((this._coolT = (this._coolT || 0) + dt)) > 1) {
      this._coolT = 0;
      for (const n of g.get('npcs')?.list || []) if (n.anger && g.now - (n.angerAt || 0) > TUNING.angerCool && n.brain.state !== 'fight') n.anger = 0;
    }
  }
  lateUpdate() { this._placeTag(); }

  _findTarget() {
    const g = this.game, npcs = g.get('npcs'), pl = g.player;
    if (!npcs) return null;
    g.cameraRig.forwardXZ(_f);
    let best = null, bs = Infinity;
    for (const n of npcs.nearby(pl.position, TUNING.range)) {
      if (n.dead || n.horse || n.entity.hogtied || n.entity.lassoed || n.entity.carriedBy) continue;
      if (n.brain.state === 'fight' && !n.brawling) continue; // a gunfight is no time to chat
      _v.subVectors(n.position, pl.position).setY(0); const d = _v.length(); if (d < 0.01) continue; _v.divideScalar(d);
      const ang = Math.acos(Math.max(-1, Math.min(1, _v.dot(_f)))) * 180 / Math.PI;
      if (ang > TUNING.cone) continue;
      const s = d + ang * 0.05;
      if (s < bs) { bs = s; best = n; }
    }
    return best;
  }
  _prompt() {
    const g = this.game, n = this.target;
    if (n && !this.open) g.ui.prompt('social', `${this._name(n)}: hold to talk`, g.input.keyLabel('social'));
    else g.ui.clearPrompt('social');
  }
  _placeTag() {
    const g = this.game, n = this.target, t = this.tag;
    if (!n || !(g.state === 'playing')) { t.hidden = true; return; }
    _v.copy(n.position); _v.y += 2.15; _v.project(g.camera);
    if (_v.z > 1) { t.hidden = true; return; }
    t.hidden = false;
    const txt = `${this._name(n)}${n.def.mood === 'drunk' ? ' (drunk)' : ''}`;
    if (t.textContent !== txt) t.textContent = txt;
    t.classList.toggle('sd-angry', (n.anger || 0) > 0);
    t.style.transform = `translate(${(_v.x * 0.5 + 0.5) * window.innerWidth}px, ${(-_v.y * 0.5 + 0.5) * window.innerHeight}px) translate(-50%, -100%)`;
  }
  _name(n) { return n.name || (n.faction === 'law' ? 'Lawman' : n.def.mood === 'drunk' ? 'Drunk' : ROLE_NAMES[n.role] || 'Stranger'); }

  // ---------------------------------------------------------------- the radial
  available(n = this.target) {
    const g = this.game, A = g.get('combat')?.arsenal;
    const gun = !!A?.drawn && ['pistol', 'long'].includes(A.cls);
    const angry = (n?.anger || 0) > 0 || (n && this.brawls.has(n));
    return { greet: !!n && !angry, antagonize: !!n && n.brain.state !== 'surrender', defuse: !!n && angry, rob: !!n && gun && !n.surrendered };
  }
  show() {
    if (this.open || !this.target) return;
    this.open = true; this.sel = null; this.vx = this.vy = 0; this._touchOpen = this.game.input.device === 'touch';
    const av = this.available();
    for (const o of this.opts) { o.el.classList.toggle('sd-off', !av[o.id]); o.el.classList.remove('sd-sel'); }
    this.mid.innerHTML = `<b>${this._name(this.target)}</b>${this._moodWord(this.target)}`;
    this.el.classList.add('sd-on');
    this.game.audio.play('ui_open', { volume: 0.5 });
  }
  close(apply) {
    if (!this.open) return;
    this.open = false; this.el.classList.remove('sd-on'); this._touchOpen = false; this._hold = -1e9; // no reopen until Q is let go
    if (apply && this.sel && this.target) this.act(this.sel, this.target);
  }
  _steer(input) {
    const look = input.look;
    this.vx += look.x * TUNING.gain; this.vy += look.y * TUNING.gain; look.x = 0; look.y = 0;
    const m = Math.hypot(this.vx, this.vy); if (m > 1) { this.vx /= m; this.vy /= m; }
    // number keys 1-4 also pick (Greet, Antagonize, Defuse, Rob)
    const av = this.available();
    if (Math.hypot(this.vx, this.vy) > TUNING.deadZone) {
      const a = Math.atan2(this.vy, this.vx);
      let best = null, bd = Infinity;
      for (const o of this.opts) { if (!av[o.id]) continue; const d = Math.abs(Math.atan2(Math.sin(o.a - a), Math.cos(o.a - a))); if (d < bd) { bd = d; best = o; } }
      if (best && best.id !== this.sel) { this.sel = best.id; this.game.audio.play('ui_tick', { volume: 0.4 }); }
    }
    for (const o of this.opts) o.el.classList.toggle('sd-sel', o.id === this.sel);
  }
  _moodWord(n) {
    if (this.brawls.has(n)) return 'fighting mad';
    if ((n.anger || 0) >= 2) return 'furious'; if ((n.anger || 0) === 1) return 'riled';
    return n.def.mood === 'drunk' ? 'three sheets to the wind' : n.def.mood === 'sour' ? 'sour' : n.def.mood === 'cheery' ? 'in good spirits' : n.alert >= 2 ? 'on edge' : 'calm';
  }

  // ---------------------------------------------------------------- actions
  /** Runs a social action on an NPC: 'greet' | 'antagonize' | 'defuse' | 'rob'. @returns what happened (a short string) */
  act(kind, n) {
    const g = this.game;
    if (!n || n.dead || g.now < this._busyUntil) return 'busy';
    const av = this.available(n);
    if (!av[kind]) return 'unavailable';
    this._faceEli(n);
    const res = kind === 'greet' ? this.greet(n) : kind === 'antagonize' ? this.antagonize(n) : kind === 'defuse' ? this.defuse(n) : this.rob(n);
    this.log.unshift(`${kind} ${this._name(n)}: ${res}`); this.log.length = Math.min(this.log.length, 8);
    return res;
  }
  greet(n) {
    const g = this.game, ctx = this._ctx(n);
    if (n.def.dialogue && g.get('dialogue') && !ctx.wanted && n.faction !== 'cinder') {
      const ok = g.get('dialogue').start(n.def.dialogue, { speaker: n });
      if (ok) { g.events.emit(EVENTS.SOCIAL_GREET, { npc: n }); return 'dialogue'; }
    }
    const eli = this.eliSay(pickLine('eliGreet', ctx).text);
    const reply = pickLine('greet', ctx);
    this._later(eli + TUNING.replyDelay, () => {
      if (n.dead) return;
      this.say(n, reply.text);
      if (reply.bank === 'wanted') { n.brain.set('flee', { from: g.player.position.clone() }); return; }
      if (reply.bank === 'refuse') { n.faceYaw(n.yaw + Math.PI); n.brain.set('social', { timer: 2.5 }); return; }
      n.brain.set('social', { timer: 4 });
      if (reply.bank === 'greet.friendly' || reply.bank === 'greet.lawFriendly' || reply.bank === 'greet.drunk') n.human?.setState('wave');
      else if (n.human) { n.human.setState('talk'); n.human.talking = true; setTimeout(() => { if (n.human?.upperState === 'talk') n.human.stopUpper(0.3); if (n.human) n.human.talking = false; }, 1800); }
    });
    g.events.emit(EVENTS.SOCIAL_GREET, { npc: n });
    return reply.bank;
  }
  antagonize(n) {
    const g = this.game, pl = g.player;
    n.anger = Math.min(3, (n.anger || 0) + 1); n.angerAt = g.now;
    const ctx = this._ctx(n), meek = this._meek(n);
    const eli = this.eliSay(pickLine('eliAntagonize', ctx).text);
    let outcome = `anger ${n.anger}`;
    const gunman = n.hasGun && n.anger >= 3 && (n.def.mood === 'drunk' ? Math.random() < TUNING.drunkGunChance : (n.faction !== 'civilian' || n.aggression > 0.75) && Math.random() < TUNING.gunmanChance);
    const line = pickLine('antagonize', { ...ctx, anger: n.anger, meek, gun: gunman });
    if (n.anger >= 3 && meek) outcome = 'backs off';
    else if (n.anger >= 3 && n.faction === 'law') outcome = 'arrest threat';
    else if (n.anger >= 3) outcome = gunman ? 'draws' : 'brawl';
    this._later(eli + TUNING.replyDelay, () => {
      if (n.dead) return;
      this.say(n, line.text);
      if (outcome === 'backs off') { n.anger = 0; n.brain.set(Math.random() < 0.5 ? 'flee' : 'cower', { from: pl.position.clone() }); return; }
      if (outcome === 'arrest threat') { n.brain.set('social', { angry: true, timer: 8 }); return; }
      if (n.anger === 1) { n.brain.set('social', { angry: true, timer: 10 }); return; }
      if (n.anger === 2) { n.brain.set('social', { angry: true, timer: 12 }); if (pl.position.distanceTo(n.position) < 2.6) n.shovePlayer(); else { n.moveTo(pl.position, 'walk', { direct: true }); setTimeout(() => n.shovePlayer(), 900); } return; }
      this.startFight(n, gunman);
    });
    g.events.emit(EVENTS.SOCIAL_ANTAGONIZE, { npc: n, level: n.anger, fight: outcome === 'brawl' || outcome === 'draws' });
    return outcome;
  }
  /** Added in Part 8: starts a fistfight (or a gunfight with `gun`) between `n` and Eli. */
  startFight(n, gun = false) {
    const pl = this.game.player.entity;
    n.anger = 3; n.angerAt = this.game.now;
    n.grudge(pl); // he started it, so fighting back isn't assault
    n.brawling = !gun;
    if (!gun) this.brawls.add(n);
    n.brain.fight(pl);
  }
  defuse(n) {
    const g = this.game, ctx = this._ctx(n), T = TUNING.defuse, honor = g.get('honor');
    const ti = honor ? honor.tierIndex : 2, fighting = this.brawls.has(n) || n.brain.state === 'fight';
    let p = T.base - T.perAnger * Math.max(0, (n.anger || 1) - 1) + T.perTier * (ti - 2) - (fighting ? T.inFight : 0) + (n.def.mood === 'drunk' ? T.drunk : 0);
    if (g.get('combat')?.isAiming) p -= 0.25; // hard to sound sincere down a barrel
    const ok = Math.random() < Math.max(0.05, Math.min(0.97, p));
    const eli = this.eliSay(pickLine('eliDefuse', ctx).text);
    this._later(eli + TUNING.replyDelay, () => {
      if (n.dead) return;
      this.say(n, pickLine('defuse', { ...ctx, ok }).text);
      if (ok) this._calm(n);
      else if (!fighting) this.startFight(n, false);
    });
    return ok ? 'calmed' : 'failed';
  }
  rob(n) {
    const g = this.game, ctx = this._ctx(n), pl = g.player, R = TUNING.rob, day = g.sys('sky').day ?? 0;
    const eli = this.eliSay(pickLine('eliRob', ctx).text);
    const tough = n.faction === 'law' || (n.hasGun && n.faction !== 'civilian' && Math.random() < R.refuse);
    if (tough) {
      this._later(eli + TUNING.replyDelay, () => { this.say(n, pickLine('rob', { ...ctx, refuse: true }).text); this.startFight(n, true); });
      g.get('law')?.reportCrime?.('assault', n.position.clone(), { victim: n });
      return 'refused';
    }
    const already = this.robbed.get(n.id) === day, poor = already || Math.random() < R.poor;
    n.brain.set('surrender', {}); n.anger = 0;
    this._later(eli + TUNING.replyDelay, () => this.say(n, already ? "You already took everything I had!" : pickLine('rob', { ...ctx, poor }).text));
    let amount = 0;
    if (!already) {
      amount = poor ? 0.25 + Math.round(Math.random() * 3) * 0.25 : R.min + Math.random() * (R.max - R.min);
      if (n.role === 'gentleman') amount *= R.gentleman;
      amount = Math.round(amount * 100) / 100;
      this.robbed.set(n.id, day);
    }
    this._later(eli + R.handOver, () => {
      if (n.dead) return;
      if (amount) g.sys('wallet').add(amount, 'robbery');
      g.events.emit(EVENTS.SOCIAL_ROB, { npc: n, amount });
      g.get('law')?.reportCrime?.('robbery', n.position.clone(), { victim: n });
      setTimeout(() => { if (!n.dead && n.brain.state === 'surrender') this.say(n, pickLine('rob', { ...ctx, after: true }).text); }, 2200);
    });
    void pl;
    return already ? 'already robbed' : `robbed $${amount.toFixed(2)}`;
  }

  // ---------------------------------------------------------------- fistfights
  _brawlTick() {
    const g = this.game, pl = g.player, combat = g.get('combat');
    for (const n of this.brawls) {
      if (n.dead) { this.brawls.delete(n); continue; }
      if (n.brain.state !== 'fight') { this.brawls.delete(n); n.brawling = false; continue; }
      // a gun pointed at a brawler: he goes for his own, or gives up
      if (combat?.isAiming && combat.aimHit?.entity === n.entity && combat.arsenal?.drawn) {
        this.brawls.delete(n);
        if (n.hasGun && n.aggression > 0.45) { n.brawling = false; n.brain.d.mode = 'seek'; this.say(n, pickLine('antagonize', { ...this._ctx(n), anger: 3, gun: true }).text); }
        else { n.brawling = false; n.brain.set('surrender'); this.say(n, pickLine('rob', this._ctx(n)).text); }
        continue;
      }
      if (pl.health < TUNING.brawlEndPlayer) this._endBrawl(n, 'npc');
      else if (n.entity.health < TUNING.brawlEndNpc) this._endBrawl(n, 'eli');
    }
  }
  _endBrawl(n, winner) {
    this.brawls.delete(n); n.brawling = false; n.anger = 0;
    n.grudges.delete(this.game.player.entity);
    if (winner === 'npc') { n.brain.set('returning'); this.say(n, pickLine('defuse', { ...this._ctx(n), ok: true }).text); }
    else { n.brain.set('cower', { from: this.game.player.position.clone() }); this.say(n, pickLine('antagonize', { ...this._ctx(n), meek: true, anger: 1 }).text); }
  }
  _calm(n) {
    n.anger = 0; n.brawling = false; this.brawls.delete(n);
    n.grudges.delete(this.game.player.entity);
    if (n.brain.state === 'fight' || n.brain.state === 'social') n.brain.set('returning');
  }

  // ---------------------------------------------------------------- speech
  /** An NPC speaks a line: subtitle and murmur. @returns seconds */
  say(n, text) {
    this.game.ui.subtitle(this._name(n), text, Math.max(2.2, text.length * 0.06));
    return this.voice.speak(this.speaker(n), text);
  }
  /** Eli speaks a line. @returns seconds */
  eliSay(text) {
    const pl = this.game.player;
    this.game.ui.subtitle('Eli', text, Math.max(2, text.length * 0.055));
    return this.voice.speak({ id: 'eli', position: pl.position, voice: voiceFor('eli', { eli: true }) }, text);
  }
  /** Voice info for an NPC (cached on it). */
  speaker(n) {
    if (!n.voice) n.voice = voiceFor(n.id, { female: WOMEN.has(n.role), drunk: n.def.mood === 'drunk' });
    return n;
  }
  _ctx(n) {
    const g = this.game, honor = g.get('honor'), seed = [...String(n.id)].reduce((a, c) => a + c.charCodeAt(0), 0);
    return {
      role: n.role, faction: n.faction, mood: n.def.mood || null, tier: honor ? honor.tierId : 'drifter', hour: g.sys('sky').timeOfDay ?? 12,
      wanted: g.sys('law').isWanted?.() || false, anger: n.anger || 0, female: WOMEN.has(n.role), me: n.name?.split(' ')[0] || NAMES[seed % NAMES.length],
    };
  }
  _meek(n) { return n.faction === 'civilian' && !n.hasGun && n.def.mood !== 'drunk' && (n.aggression < 0.5 || ['preacher', 'townswoman', 'gentleman', 'bartender'].includes(n.role)); }
  _faceEli(n) { const pl = this.game.player; pl.yaw = Math.atan2(-(n.position.x - pl.position.x), -(n.position.z - pl.position.z)); n.facePoint(pl.position); }
  _later(sec, fn) { this._busyUntil = Math.max(this._busyUntil, this.game.now + sec * 0.6); setTimeout(() => { try { fn(); } catch (err) { console.error('[social]', err); } }, sec * 1000); }

  dispose() { this.voice?.stopAll(); this.el?.remove(); this.tag?.remove(); }
}

const ROLE_NAMES = { townsman: 'Townsman', townswoman: 'Townswoman', worker: 'Worker', gentleman: 'Gentleman', farmer: 'Farmer', preacher: 'Preacher', bartender: 'Bartender',
  rancher: 'Rancher', ranchwoman: 'Rancher', cowboy: 'Cowhand', gambler: 'Gambler', outlaw: 'Outlaw', thug: 'Blackstone man', lawman: 'Lawman', marshal: 'Marshal' };

export { Social };
