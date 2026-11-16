import * as THREE from 'three';

/**
 * Cutscenes (Part 15): keyframed camera shots with staged people and subtitles, letterboxed and always skippable
 * (Esc, Space, Enter, E, the gamepad's A or B, or the Skip button).
 * play(shots, { ctx, skippable = true, letterbox = true }) → Promise<'done'|'skipped'>
 *   shot = { dur, from, to?, look, lookTo?, fov?, lines?: [[who, text, at]], stage?(ctx), fade?: 'out'|'in', shake? }
 *   positions: [x, y, z] in the world, or { rel: 'eli' | stage key | 'npc:<id>', off: [x, y, z] } in that person's
 *   frame (x right, y up, −z the way they face), so shots follow people wherever the mission put them.
 *   who: 'eli', a stage key, 'npc:<id>' (spoken with their voice), or any other name (a plain subtitle).
 * While it plays the game state is 'cutscene': the controls do nothing, the world keeps living. A skip still runs
 * the remaining shots' staging so people end up where the scene would have left them.
 */
export const TUNING = { defaultFov: 50, minAboveGround: 1.4 };
const _p = new THREE.Vector3(), _l = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const ease = (t) => t * t * (3 - 2 * t);

export class Cutscene {
  constructor(game) { this.game = game; this.active = null; }
  get playing() { return !!this.active; }

  play(shots = [], { ctx = null, skippable = true, letterbox = true } = {}) {
    const g = this.game;
    if (this.active) this.stop('skipped');
    if (!Array.isArray(shots)) { ({ shots = [], skippable = true, letterbox = true } = shots); }
    return new Promise((resolve) => {
      const c = { shots, ctx, i: -1, t: 0, resolve, prev: g.state, said: new Set(), skippable, letterbox, last: performance.now() };
      this.active = c;
      if (g.state !== 'cutscene') g.setState('cutscene');
      if (letterbox) g.ui.letterbox(true);
      if (skippable) {
        c.btn = document.createElement('button'); c.btn.type = 'button'; c.btn.className = 'sd-button sd-skip'; c.btn.textContent = 'Skip ›';
        c.btn.addEventListener('click', () => this.stop('skipped')); g.ui.root.append(c.btn);
        c.key = (e) => { if (['Escape', 'Space', 'Enter', 'KeyE'].includes(e.code) && c.t + c.i > 0.25) { e.preventDefault(); e.stopPropagation(); this.stop('skipped'); } };
        window.addEventListener('keydown', c.key, true);
      }
      g.cameraRig.override = Object.assign((cam) => this._frame(cam), { ownsFov: true });
      this._next();
    });
  }
  /** A world position from a shot's position spec. */
  pos(spec, out = new THREE.Vector3()) {
    if (Array.isArray(spec)) return out.fromArray(spec);
    if (spec && typeof spec === 'object' && spec.rel) {
      const who = this._who(spec.rel), o = spec.off || [0, 0, 0];
      if (!who) return out.set(0, 0, 0);
      const p = who.position, y = who.yaw ?? 0, c = Math.cos(y), s = Math.sin(y);
      return out.set(p.x + o[0] * c + o[2] * s, p.y + o[1], p.z - o[0] * s + o[2] * c);
    }
    if (typeof spec === 'function') return this.pos(spec(this.active?.ctx), out);
    return out.set(0, 0, 0);
  }
  _who(key) {
    const g = this.game, ctx = this.active?.ctx;
    if (!key) return null;
    if (typeof key === 'object') return key;
    if (key === 'eli' || key === 'player') return g.player;
    if (key.startsWith?.('npc:')) return g.get('npcs')?.byId?.get(key.slice(4)) || null;
    return ctx?.stage?.get?.(key) || g.get('npcs')?.byId?.get(key) || null;
  }
  _next() {
    const c = this.active, g = this.game; if (!c) return;
    c.i++; c.t = 0; c.said.clear();
    const s = c.shots[c.i];
    if (!s) { this.stop('done'); return; }
    try { s.stage?.(c.ctx, g); } catch (err) { console.error('[cutscene] stage failed', err); }
    if (s.fade === 'in') g.ui.fade(false, Math.min(1.2, s.dur * 0.4));
  }
  _frame(cam) {
    const c = this.active, g = this.game; if (!c) return;
    const now = performance.now(), dt = Math.min(0.1, (now - c.last) / 1000); c.last = now;
    if (c.skippable && g.input.device === 'gamepad' && (g.input.pressed('jump') || g.input.pressed('crouch')) && (c.t > 0.3 || c.i > 0)) { this.stop('skipped'); return; }
    const s = c.shots[c.i]; if (!s) return;
    c.t += dt;
    const k = Math.min(1, c.t / Math.max(0.01, s.dur)), e = ease(k);
    this.pos(s.from, _a); this.pos(s.to || s.from, _b); _p.lerpVectors(_a, _b, s.to ? e : 0);
    this.pos(s.look, _a); this.pos(s.lookTo || s.look, _b); _l.lerpVectors(_a, _b, s.lookTo ? e : 0);
    if (s.shake) { _p.x += (Math.random() - 0.5) * s.shake; _p.y += (Math.random() - 0.5) * s.shake; }
    const ground = g.sys('terrain').getHeightAt?.(_p.x, _p.z); if (ground !== undefined && _p.y < ground + TUNING.minAboveGround) _p.y = ground + TUNING.minAboveGround; // never inside a hill
    cam.position.copy(_p); cam.lookAt(_l);
    const fov = s.fov ?? TUNING.defaultFov;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    for (const [i, ln] of (s.lines || []).entries()) {
      const [who, text, at = 0] = Array.isArray(ln) ? ln : [ln.who || ln.speaker, ln.text, ln.at];
      if (c.said.has(i) || c.t < at) continue;
      c.said.add(i);
      this.say(who, text);
    }
    if (s.fade === 'out' && !c.fadeOut && c.t > s.dur - 1) { c.fadeOut = true; g.ui.fade(true, 0.9); }
    if (c.t >= s.dur) this._next();
  }
  /** One spoken line: Eli's voice, an NPC's voice, or a plain subtitle. */
  say(who, text) {
    const g = this.game, social = g.get('social'), n = who === 'eli' ? null : this._who(who);
    if (who === 'eli') { if (social) social.eliSay(text); else g.ui.subtitle('Eli', text); return; }
    if (n && !n.dead && social && n.def) { social.say(n, text); return; }
    g.ui.subtitle(typeof who === 'string' && !who.startsWith('npc:') ? who : '', text, Math.max(2.4, text.length * 0.055));
  }
  /** Ends the cutscene now ('done' or 'skipped'). */
  stop(how = 'skipped') {
    const c = this.active, g = this.game; if (!c) return;
    this.active = null;
    if (how === 'skipped') for (let i = c.i + 1; i < c.shots.length; i++) { try { c.shots[i].stage?.(c.ctx, g); } catch { /* ignore */ } }
    g.cameraRig.override = null;
    g.camera.fov = 58; g.camera.updateProjectionMatrix(); g.cameraRig.snap?.();
    if (c.letterbox) g.ui.letterbox(false);
    if (c.fadeOut) g.ui.fade(false, 0.8);
    c.btn?.remove(); if (c.key) window.removeEventListener('keydown', c.key, true);
    if (g.state === 'cutscene') g.setState(c.prev === 'title' ? 'title' : c.prev === 'cutscene' ? 'playing' : (c.prev || 'playing') === 'paused' ? 'playing' : c.prev || 'playing');
    c.resolve(how);
  }
}
