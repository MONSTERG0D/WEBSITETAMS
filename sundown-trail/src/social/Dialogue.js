import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { voiceFor } from './Voice.js';
import { DIALOGUES } from './dialogues/index.js';

/**
 * The 'dialogue' system (Part 8, GAME_BIBLE §11): start(tree, { speaker, onEnd }) · active.
 * Trees are data:
 *   { id, start, nodes: { id: { speaker, text, choices: [{ text, next, honor, condition(game), action(game), result }],
 *                              next, onEnter(game), timeout, timeoutChoice } } }
 *   text and next may also be functions of the game (dynamic lines, branches).
 *   speaker: 'eli', 'npc' (the person you're talking to; the default) or any name.
 *   A node with choices waits for one (or picks `timeoutChoice` after `timeout` seconds); one without choices goes to
 *   `next` (or ends) after a timed read; clicking, Space or E skips the typing, then advances.
 * Presentation: over-the-shoulder framing that cuts between speakers, a parchment caption with the speaker's name,
 * typewriter text with their murmured voice, choices on parchment cards (click, tap, 1–4, or arrows and Enter).
 * It can't softlock: Esc ends the conversation, a missing node or a node with no usable way on ends it, it ends if
 * the other person dies, flees, starts a fight or wanders off, if Eli is hurt, and after 90 s on one node.
 * Also a registry: register(tree), get(id); start() accepts a tree or an id.
 */
export const TUNING = { typeSpeed: 42, readBase: 1.6, readPerChar: 0.045, nodeMax: 90, abortRange: 12, camDist: 1.3, camSide: 0.75, camHeight: 1.62, camLerp: 6, duck: 0.6 };

const CSS = `
.sd-screen-dialogue{align-items:flex-end;justify-content:center;background:linear-gradient(0deg,rgba(20,14,8,.55),rgba(20,14,8,0) 38%);padding-bottom:calc(18px + var(--safe-bottom,0px))}
.sd-dlg{width:min(760px,94vw);display:flex;flex-direction:column;gap:8px;align-items:stretch}
.sd-dlg-box{background:rgba(236,224,196,.95);color:var(--ink,#2b1d12);border-radius:8px;padding:12px 18px 14px;box-shadow:0 6px 24px rgba(0,0,0,.4);cursor:pointer;
  border:1px solid rgba(43,29,18,.35);font:18px/1.4 var(--font-body,Georgia,serif);min-height:70px}
.sd-dlg-name{font:16px var(--font-display,Georgia,serif);color:var(--rust,#8a3b1e);margin-bottom:3px;letter-spacing:.03em}
.sd-dlg-choices{display:grid;gap:6px}
.sd-dlg-choice{background:rgba(236,224,196,.92);color:var(--ink,#2b1d12);border:1px solid rgba(43,29,18,.35);border-radius:7px;padding:9px 14px;text-align:left;
  font:16px/1.3 var(--font-body,Georgia,serif);cursor:pointer;min-height:44px;box-shadow:0 3px 12px rgba(0,0,0,.3)}
.sd-dlg-choice b{color:var(--rust,#8a3b1e);margin-right:8px;font-family:var(--font-display,Georgia,serif)}
.sd-dlg-choice.sd-sel,.sd-dlg-choice:hover{background:var(--rust,#8a3b1e);color:#f4ead6}.sd-dlg-choice.sd-sel b,.sd-dlg-choice:hover b{color:#f4ead6}
.sd-dlg-hint{font:12px Georgia,serif;color:#efe2c2;text-align:right;opacity:.85;text-shadow:0 1px 2px #000}
`;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3(), _cp = new THREE.Vector3(), _ct = new THREE.Vector3();

/** Checks a tree's shape. @returns {string[]} problems (empty when fine) */
export function validateTree(tree) {
  const out = [];
  if (!tree || typeof tree !== 'object') return ['not an object'];
  if (!tree.id) out.push('missing id');
  if (!tree.nodes || !tree.nodes[tree.start]) out.push(`start node "${tree.start}" missing`);
  for (const [id, n] of Object.entries(tree.nodes || {})) {
    if (typeof n.text !== 'string' && typeof n.text !== 'function') out.push(`${id}: no text`);
    for (const c of n.choices || []) if (typeof c.next === 'string' && !tree.nodes[c.next]) out.push(`${id}: choice "${c.text}" → missing "${c.next}"`);
    if (typeof n.next === 'string' && !tree.nodes[n.next]) out.push(`${id}: next → missing "${n.next}"`);
  }
  return out;
}

export default class Dialogue extends System {
  constructor(game) {
    super(game);
    this.trees = new Map(); this.active = false; this.tree = null; this.node = null; this.nodeId = null; this.speaker = null;
    this._sel = 0; this._typed = 0; this._t = 0; this._choices = []; this._result = null; this.onEnd = null;
    for (const t of DIALOGUES) this.register(t);
  }
  async init() {
    const g = this.game;
    if (!document.getElementById('sd-dlg-css')) { const s = document.createElement('style'); s.id = 'sd-dlg-css'; s.textContent = CSS; document.head.append(s); }
    g.ui.registerScreen('dialogue', {
      build: () => this._build(),
      onClose: () => { if (this.active) this.end('skipped', true); },
    });
    this._key = (e) => this._onKey(e);
    g.debug?.addTuning('Dialogue', TUNING);
  }

  register(tree) {
    const bad = validateTree(tree);
    if (bad.length) console.warn(`[dialogue] ${tree?.id}: ${bad.join('; ')}`);
    this.trees.set(tree.id, tree);
    return tree;
  }
  get(id) { return this.trees.get(id) || null; }

  /**
   * @param {object|string} tree a tree or a registered id
   * @param {{ speaker?: object|string, onEnd?: (result) => void }} opts speaker: the NPC (framing and voice) or a name
   * @returns {boolean} started
   */
  start(tree, opts = {}) {
    const g = this.game;
    if (typeof tree === 'string') tree = this.get(tree);
    if (!tree || this.active || !tree.nodes?.[tree.start] || g.state !== 'playing') return false;
    this.active = true; this.tree = tree; this.onEnd = opts.onEnd || null; this._result = null;
    this.speaker = opts.speaker || null;
    this.npc = this.speaker && typeof this.speaker === 'object' ? this.speaker : null;
    this._hpStart = g.player.health;
    if (this.npc) { this.npc.brain.set('social', { timer: 1e9 }); this.npc.stop(); }
    g.player.velocity.set(0, 0, 0);
    if (g.player.aiming) g.player._setAiming?.(false);
    this._camInit = false;
    g.cameraRig.override = (cam, rawDt) => this._camera(cam, rawDt);
    g.ui.letterbox(true);
    g.ui.openScreen('dialogue');
    window.addEventListener('keydown', this._key, true);
    g.events.emit(EVENTS.DIALOGUE_START, { id: tree.id });
    this._go(tree.start);
    return true;
  }

  /** Ends the conversation. result: the last choice's result, the end node's id, or why it stopped. */
  end(result = null, fromClose = false) {
    if (!this.active) return;
    const g = this.game, tree = this.tree, npc = this.npc, cb = this.onEnd;
    this.active = false; this.tree = null; this.node = null; this.nodeId = null;
    window.removeEventListener('keydown', this._key, true);
    g.get('social')?.voice?.stopAll();
    if (g.cameraRig.override) { g.cameraRig.override = null; g.cameraRig.snap(); }
    g.ui.letterbox(false);
    if (!fromClose && g.ui.topScreen() === 'dialogue') g.ui.closeScreen();
    if (npc && !npc.dead && npc.brain.state === 'social') npc.brain.set('social', { timer: 2 });
    const res = this._result ?? result;
    g.events.emit(EVENTS.DIALOGUE_END, { id: tree?.id, result: res });
    try { cb?.(res); } catch (err) { console.error('[dialogue] onEnd failed', err); }
  }

  // ---------------------------------------------------------------- nodes
  _go(id) {
    const g = this.game, tree = this.tree;
    const node = id ? tree.nodes[id] : null;
    if (!node) { this.end(id ? `missing:${id}` : 'done'); return; }
    let text = node.text; try { if (typeof text === 'function') text = String(text(g)); } catch { text = '...'; }
    this.text = text;
    this.node = node; this.nodeId = id; this._typed = 0; this._t = 0; this._sel = 0; this._doneTyping = false;
    try { node.onEnter?.(g); } catch (err) { console.error('[dialogue] onEnter failed', err); }
    if (!this.active) return; // onEnter may end it
    this._choices = (node.choices || []).filter((c) => { try { return !c.condition || c.condition(g); } catch { return false; } });
    const who = this._speakerName(node);
    this.$name.textContent = who;
    this.$text.textContent = '';
    this.$choices.textContent = '';
    this.$hint.textContent = 'Click or Space to continue · Esc to leave';
    // voice and talking animation
    const isEli = node.speaker === 'eli';
    const voiceSpeaker = isEli ? { id: 'eli', position: g.player.position, voice: voiceFor('eli', { eli: true }) } : this.npc ? g.get('social')?.speaker(this.npc) || this.npc : { id: who, position: g.player.position };
    g.get('social')?.voice?.speak(voiceSpeaker, text);
    g.audio.duck?.(TUNING.duck, Math.max(2, text.length * TUNING.readPerChar));
    const h = isEli ? g.player.human : this.npc?.human;
    for (const hu of [g.player.human, this.npc?.human]) if (hu && hu !== h && hu.upperState === 'talk') { hu.stopUpper(0.3); hu.talking = false; }
    if (h) { h.setState('talk'); h.talking = true; }
    this._focus = isEli ? 'eli' : 'npc';
  }
  _speakerName(node) {
    if (node.speaker === 'eli') return 'Eli';
    if (node.speaker && node.speaker !== 'npc') return node.speaker;
    const s = this.speaker;
    return typeof s === 'string' ? s : s?.name || this.tree.speakerName || 'Stranger';
  }
  _showChoices() {
    this.$choices.textContent = '';
    if (!this._choices.length) { this.$hint.textContent = this.node.next ? 'Click or Space to continue · Esc to leave' : 'Click or Space to finish'; return; }
    this.$hint.textContent = '1–4 or click to answer · Esc to leave';
    this._choiceEls = this._choices.map((c, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sd-dlg-choice';
      b.innerHTML = `<b>${i + 1}</b>`; b.append(document.createTextNode(c.text));
      b.addEventListener('click', (e) => { e.stopPropagation(); this.choose(i); });
      this.$choices.append(b);
      return b;
    });
    this._mark();
  }
  _mark() { (this._choiceEls || []).forEach((b, i) => b.classList.toggle('sd-sel', i === this._sel)); }

  /** Picks choice i of the current node. */
  choose(i) {
    const g = this.game, c = this._choices[i];
    if (!this.active || !c || !this._doneTyping) return;
    g.audio.play('ui_click', { volume: 0.6 });
    if (c.honor) g.get('honor')?.change(c.honor, `${this.tree.id}`);
    if (c.result !== undefined) this._result = c.result;
    try { c.action?.(g); } catch (err) { console.error('[dialogue] choice action failed', err); }
    if (!this.active) return;
    this._go(this._next(c.next));
  }
  /** `next` may be an id or a function(game) → id (branches such as a coin toss). */
  _next(x) { try { return typeof x === 'function' ? x(this.game) : x || null; } catch (err) { console.error('[dialogue] next failed', err); return null; } }
  /** Skip the typing, or move on from a node without choices. */
  advance() {
    if (!this.active) return;
    if (!this._doneTyping) { this._finishTyping(); return; }
    if (this._choices.length) return;
    this._go(this._next(this.node.next));
  }
  _finishTyping() { this._typed = this.text.length; this.$text.textContent = this.text; this._doneTyping = true; this._t = 0; this._showChoices(); }

  update(dt, rawDt) {
    if (!this.active) return;
    const g = this.game, node = this.node;
    if (!node) { this.end('done'); return; }
    // safety: the conversation can't outlive its reasons
    const npc = this.npc;
    if (npc && (npc.dead || npc.brain.state === 'fight' || npc.brain.state === 'flee' || npc.position.distanceTo(g.player.position) > TUNING.abortRange)) { this.end('interrupted'); return; }
    if (g.player.health < this._hpStart - 1 || g.player.state === 'dead') { this.end('interrupted'); return; }
    if (npc && npc.brain.state !== 'social') npc.brain.set('social', { timer: 1e9 });
    if (npc) { npc.facePoint(g.player.position); g.player.yaw = Math.atan2(-(npc.position.x - g.player.position.x), -(npc.position.z - g.player.position.z)); g.player.object3d.rotation.y = g.player.yaw; }
    this._t += rawDt;
    if (!this._doneTyping) {
      this._typed = Math.min(this.text.length, this._typed + rawDt * TUNING.typeSpeed);
      this.$text.textContent = this.text.slice(0, Math.floor(this._typed));
      if (this._typed >= this.text.length) this._finishTyping();
      return;
    }
    if (!this._choices.length) {
      if (this._t > TUNING.readBase + this.text.length * TUNING.readPerChar) this._go(this._next(node.next));
    } else if (node.timeout && this._t > node.timeout) this.choose(Math.min(this._choices.length - 1, node.timeoutChoice ?? this._choices.length - 1));
    if (this._t > TUNING.nodeMax) this.end('timeout');
  }

  _onKey(e) {
    if (!this.active) return;
    const k = e.code;
    if (k === 'Space' || k === 'KeyE' || k === 'Enter' || k === 'NumpadEnter') {
      e.preventDefault(); e.stopPropagation();
      if (this._choices.length && this._doneTyping) this.choose(this._sel); else this.advance();
    } else if (/^Digit[1-9]$/.test(k)) { e.preventDefault(); e.stopPropagation(); this.choose(Number(k.slice(5)) - 1); }
    else if (k === 'ArrowDown' || k === 'KeyS') { e.preventDefault(); this._sel = Math.min(this._choices.length - 1, this._sel + 1); this._mark(); }
    else if (k === 'ArrowUp' || k === 'KeyW') { e.preventDefault(); this._sel = Math.max(0, this._sel - 1); this._mark(); }
  }

  _build() {
    const wrap = document.createElement('div'); wrap.className = 'sd-dlg';
    this.$choices = document.createElement('div'); this.$choices.className = 'sd-dlg-choices';
    const box = document.createElement('div'); box.className = 'sd-dlg-box';
    this.$name = document.createElement('div'); this.$name.className = 'sd-dlg-name';
    this.$text = document.createElement('div');
    box.append(this.$name, this.$text);
    box.addEventListener('click', () => this.advance());
    this.$hint = document.createElement('div'); this.$hint.className = 'sd-dlg-hint';
    wrap.append(this.$choices, box, this.$hint);
    return wrap;
  }

  /** Over-the-shoulder framing: behind the listener's shoulder, looking at whoever is talking. */
  _camera(cam, rawDt) {
    const g = this.game, pl = g.player, npc = this.npc;
    if (!npc) { // nobody to frame: a close shot of Eli from the front
      _a.copy(pl.position); _d.set(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw));
      _cp.copy(_a).addScaledVector(_d, 2.2).setY(_a.y + 1.7); _ct.copy(_a).setY(_a.y + 1.55);
    } else {
      const eliTalks = this._focus === 'eli';
      const listener = eliTalks ? npc.position : pl.position, talker = eliTalks ? pl.position : npc.position;
      _d.subVectors(talker, listener).setY(0); const L = _d.length() || 1; _d.divideScalar(L);
      _r.set(-_d.z, 0, _d.x); // to the right of the listener's line of sight
      _cp.copy(listener).addScaledVector(_d, -TUNING.camDist).addScaledVector(_r, TUNING.camSide * (eliTalks ? -1 : 1)).setY(listener.y + TUNING.camHeight);
      _ct.copy(talker).setY(talker.y + 1.5);
      const gy = g.sys('terrain').getHeightAt(_cp.x, _cp.z); if (_cp.y < gy + 0.6) _cp.y = gy + 0.6;
    }
    if (!this._camInit || this._lastFocus !== this._focus) { this._camInit = true; this._lastFocus = this._focus; cam.position.copy(_cp); this._look = _ct.clone(); } // cut between speakers
    else { const k = 1 - Math.exp(-TUNING.camLerp * rawDt); cam.position.lerp(_cp, k); this._look.lerp(_ct, k); }
    cam.lookAt(this._look);
    void _b;
  }

  serialize() { return null; }
  dispose() { if (this.active) this.end('disposed'); }
}

export { Dialogue };
