import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';

/**
 * The 'focus' system (GAME_BIBLE §6 Focus, §11 focus API): while aiming, V (or the Focus button) slows the world to
 * 0.3 (camera and UI keep real time), the meter drains 22 per real second, sweeping the crosshair over targets
 * marks them with ink crosses (up to the rounds in the gun; fire adds a mark where the crosshair is; on touch,
 * tap targets), and releasing aim (or V again, or an empty meter) fires at each mark in order with a snappy
 * camera. Kills refill 8. Level 2 (Hollis Grant's training) auto-marks chests and drains 30 % slower.
 * Also owns the game's time-scale requests (Focus 0.3, weapon wheel 0.4, kill cam) and the slow-motion kill cam
 * on the last enemy of a fight, plus the focus_mark and kill_cam effects.
 */
export const TUNING = {
  timeScale: 0.3, drain: 22, refillPerKill: 8, regen: 0.6, regenDelay: 3, minToStart: 10,
  level2Drain: 0.7, markSpacing: 0.28, markLimit: 12, sweepRange: 120,
  snapTime: 0.07, shotGap: 0.11, // real seconds per mark while executing
  killCam: { timeScale: 0.22, seconds: 1.5, distance: 3.2, height: 0.45, angle: 0.75, maxRange: 90, enemyRadius: 60 },
  markSize: 0.034, // fraction of the screen height (marks stay readable at any range)
};

const HOSTILE = new Set(['blackstone', 'cinder', 'predator']);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();

/** Ink-cross texture for focus marks, drawn once. */
function markTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.lineCap = 'round';
  for (const [w, col] of [[11, 'rgba(20,10,4,0.85)'], [6, 'rgba(160,40,20,1)']]) {
    x.strokeStyle = col; x.lineWidth = w;
    x.beginPath(); x.moveTo(14, 12); x.quadraticCurveTo(30, 30, 51, 52); x.stroke();
    x.beginPath(); x.moveTo(50, 13); x.quadraticCurveTo(33, 33, 12, 50); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default class Focus extends System {
  constructor(game) {
    super(game);
    this.active = false; this.level = 1; this.marks = []; this.executing = false; this.requests = new Map();
    this._regenWait = 0; this._exec = null; this._killCam = null;
  }

  async init() {
    const g = this.game, vfx = g.sys('vfx');
    this.markMat = new THREE.SpriteMaterial({ map: markTexture(), depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false });
    if (!vfx.isFallback) this._defineEffects(vfx);
    // a hidden mark so its shader compiles during loading (no hitch on the first Focus)
    this._warm = new THREE.Sprite(this.markMat); this._warm.visible = false; this._warm.userData.warmup = true; this._warm.raycast = () => {}; g.scene.add(this._warm);
    g.events.on(EVENTS.COMBAT_KILL, (e) => this._onKill(e));
    g.events.on(EVENTS.PLAYER_DIED, () => this.deactivate(false));
    // touch: tap targets to mark them while Focus is on
    g.canvas?.addEventListener?.('pointerdown', (e) => { if (this.active && !this.executing && e.pointerType === 'touch') this._tapMark(e); });
    g.debug?.addTuning('Focus', TUNING);
  }

  // ---------------------------------------------------------------- API (GAME_BIBLE §11)
  /** 0–100, stored on the player (it is the Focus bar). */
  get meter() { return this.game.player.focus ?? 0; }
  set meter(v) { this.game.player.focus = Math.max(0, Math.min(100, v)); }
  /** Starts Focus (needs aiming, a gun with rounds and some meter). */
  activate() {
    const g = this.game, combat = g.get('combat');
    if (this.active || this.executing || !combat?.isAiming || this.meter < TUNING.minToStart || !combat.arsenal.drawn || combat.arsenal.rounds <= 0) return false;
    this.active = true; this.marks.length = 0;
    this.requestTime('focus', TUNING.timeScale);
    g.sys('postfx').setFocus(true);
    this._beat = g.audio.play('focus_heartbeat', { loop: true });
    g.audio.play('focus_in');
    g.events.emit(EVENTS.FOCUS_START, {});
    if (this.level >= 2) this._autoMark();
    return true;
  }
  /** Ends Focus; with `execute` (default) the marked shots go off first. */
  deactivate(execute = true) {
    if (!this.active) return false;
    if (execute && this.marks.length) { this._startExecution(); return true; }
    this._end();
    return true;
  }
  /** Added in Part 6: Hollis Grant's training sets level 2 (auto chest marks, slower drain). */
  setLevel(n) { this.level = Math.max(1, Math.min(2, n | 0)); }
  /**
   * Added in Part 6: time-scale arbitration. Systems ask for a slow-down by id (null clears it);
   * the slowest request wins.
   */
  requestTime(id, scale) {
    if (scale === null || scale === undefined) this.requests.delete(id); else this.requests.set(id, scale);
    let t = 1; for (const v of this.requests.values()) t = Math.min(t, v);
    this.game.timeScale = t;
  }

  // ---------------------------------------------------------------- per frame
  update(dt, rawDt) {
    const g = this.game, input = g.input, combat = g.get('combat');
    if (!combat) return;
    const playing = g.state === 'playing' && !g.ui.isScreenOpen();
    if (this._killCam) this._killCamTick(rawDt);
    if (this.executing) { this._executeTick(rawDt); return; }
    if (!this.active) {
      if (playing && input.pressed('focus') && combat.isAiming) this.activate();
      else if (playing && (this._regenWait -= rawDt) <= 0) this.meter = this.meter + TUNING.regen * (g.player.regenScale?.focus ?? 1) * rawDt; // Part 10: the focus core scales regen
      return;
    }
    // active: drain, mark, end
    this._regenWait = TUNING.regenDelay;
    this.meter = this.meter - TUNING.drain * (this.level >= 2 ? TUNING.level2Drain : 1) * rawDt;
    combat.suspendAssist = true;
    const done = !playing || this.meter <= 0 || !combat.isAiming || input.pressed('focus') || combat.arsenal.rounds <= 0 && !this.marks.length;
    if (done) { this.deactivate(true); return; }
    // mark: sweeping over a target, or fire to drop a mark exactly under the crosshair
    const hit = combat.aimHit;
    if (hit?.entity && hit.entity.alive !== false && hit.entity !== g.player.entity && hit.distance < TUNING.sweepRange) {
      const last = this._lastMarkOn(hit.entity);
      if (input.pressed('fire') || !last || last.world().distanceTo(hit.point) > TUNING.markSpacing) this._mark(hit);
    } else if (input.pressed('fire') && hit) this._mark(hit); // mark anything: bottles, gongs, a lamp
    // keep the fire button from shooting normally while in Focus
    input.pressedSet?.delete?.('fire');
  }

  _available() { const A = this.game.get('combat').arsenal; return Math.min(TUNING.markLimit, A.rounds) - this.marks.length; }
  _lastMarkOn(entity) { for (let i = this.marks.length - 1; i >= 0; i--) if (this.marks[i].entity === entity) return this.marks[i]; return null; }

  /** Places an ink cross on a hit point; it rides along with the bone or object it marks. */
  _mark(hit) {
    if (this._available() <= 0) return false;
    const g = this.game, obj = hit.object && hit.entity ? (hit.object.name?.startsWith('hit:') ? hit.object.parent : hit.object) : (hit.entity?.object3d || null);
    const sprite = new THREE.Sprite(this.markMat); sprite.renderOrder = 999; sprite.frustumCulled = false; sprite.raycast = () => {};
    const s = TUNING.markSize; sprite.scale.set(s, s, s);
    const mark = { entity: hit.entity || null, object: obj, sprite, local: new THREE.Vector3(), point: hit.point.clone(),
      world: () => (mark.object ? mark.object.localToWorld(_w.copy(mark.local)) : _w.copy(mark.point)) };
    if (obj) { obj.updateWorldMatrix(true, false); mark.local.copy(hit.point); obj.worldToLocal(mark.local); obj.add(sprite); sprite.position.copy(mark.local); }
    else { sprite.position.copy(hit.point); g.scene.add(sprite); }
    this.marks.push(mark);
    g.audio.play('focus_mark', { volume: 0.5 });
    g.input.haptic(8);
    return true;
  }
  /** Level 2: chest marks on every visible target in front, nearest first. */
  _autoMark() {
    const g = this.game, cam = g.camera, combat = g.get('combat');
    cam.getWorldPosition(_c);
    const list = combat._targets().filter((e) => e.type === 'npc' || e.type === 'animal')
      .map((e) => ({ e, d: e.position.distanceTo(_c) })).filter((x) => x.d < TUNING.sweepRange).sort((a, b) => a.d - b.d);
    for (const { e } of list) {
      if (this._available() <= 0) break;
      combat._aimPointOf(e, _v); _w.subVectors(_v, _c); const d = _w.length(); _w.normalize();
      const hit = g.physics.raycast(_c, _w, d + 1, { ignore: g.player.entity });
      if (hit?.entity === e) this._mark(hit);
    }
  }
  _tapMark(e) {
    const g = this.game, r = g.canvas.getBoundingClientRect();
    _ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    _ray.setFromCamera(_ndc, g.camera);
    const hit = g.physics.raycast(_ray.ray.origin, _ray.ray.direction, TUNING.sweepRange, { ignore: g.player.entity });
    if (hit) this._mark(hit);
  }

  // ---------------------------------------------------------------- executing the marks
  _startExecution() {
    const g = this.game;
    this.executing = true; this.active = false;
    this._exec = { i: 0, t: 0, phase: 'snap', from: null };
    const combat = g.get('combat'); combat.suspendAssist = true; combat.forceAim = true; // keep the gun up until the last shot
  }
  _executeTick(rawDt) {
    const g = this.game, combat = g.get('combat'), cam = g.cameraRig, ex = this._exec;
    const mark = this.marks[ex.i];
    if (!mark || combat.arsenal.rounds <= 0 || !combat.arsenal.drawn) { this._end(); return; }
    const p = mark.world();
    g.camera.getWorldPosition(_c);
    const yaw = Math.atan2(-(p.x - _c.x), -(p.z - _c.z)), pitch = Math.atan2(p.y - _c.y, Math.hypot(p.x - _c.x, p.z - _c.z));
    if (!ex.from) ex.from = [cam.yaw, cam.pitch];
    ex.t += rawDt;
    if (ex.phase === 'snap') {
      const k = Math.min(1, ex.t / TUNING.snapTime), e = k * k * (3 - 2 * k);
      let dy = yaw - ex.from[0]; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      cam.yaw = ex.from[0] + dy * e; cam.pitch = ex.from[1] + (pitch - ex.from[1]) * e;
      if (k >= 1) { combat.fireAt(p); ex.phase = 'gap'; ex.t = 0; }
    } else if (ex.t >= TUNING.shotGap) {
      mark.sprite.removeFromParent();
      ex.i++; ex.t = 0; ex.phase = 'snap'; ex.from = null;
    }
  }
  _end() {
    const g = this.game, combat = g.get('combat');
    for (const m of this.marks) m.sprite.removeFromParent();
    this.marks.length = 0;
    const was = this.active || this.executing;
    this.active = false; this.executing = false; this._exec = null;
    if (combat) { combat.suspendAssist = false; combat.forceAim = false; }
    this.requestTime('focus', null);
    g.sys('postfx').setFocus(false);
    this._beat?.stop?.(0.3); this._beat = null;
    if (was) { g.audio.play('focus_out'); g.events.emit(EVENTS.FOCUS_END, {}); }
  }

  // ---------------------------------------------------------------- kills and the kill cam
  _onKill({ target }) {
    const g = this.game, pl = g.player;
    if (!target) return;
    if (this.active || this.executing) this.meter = this.meter + TUNING.refillPerKill;
    if (g.settings.get('killCam') === false || this._killCam || target.type !== 'npc') return;
    // the last hostile in the fight: nobody hostile and alive left nearby
    const K = TUNING.killCam;
    if (target.position.distanceTo(pl.position) > K.maxRange) return;
    for (const e of g.entities.list) {
      if (e === target || e.alive === false || e.type !== 'npc') continue;
      if ((HOSTILE.has(e.faction) || e.hostile) && e.position.distanceTo(target.position) < K.enemyRadius) return;
    }
    if (!(HOSTILE.has(target.faction) || target.hostile)) return;
    // wait for the Focus sequence to finish before cutting away
    setTimeout(() => this.game.sys('vfx').spawn('kill_cam', { target }), this.executing ? 200 : 60);
  }
  _killCamTick() {}

  _defineEffects(vfx) {
    const self = this;
    // ink cross on a target (opts.position, opts.parent); stop() removes it
    vfx.define('focus_mark', {
      create(v, opts, pos) {
        const s = new THREE.Sprite(self.markMat); s.scale.setScalar(TUNING.markSize); s.renderOrder = 999; s.raycast = () => {};
        (opts.parent || v.group).add(s); s.position.copy(opts.parent ? opts.parent.worldToLocal(pos.clone()) : pos);
        let alive = true;
        return { update() { return alive; }, stop() { alive = false; s.removeFromParent(); }, setPosition(p) { s.position.copy(p); } };
      },
    });
    // slow-motion cut to the last enemy falling (opts.target = the entity)
    vfx.define('kill_cam', {
      create(v, opts) {
        const g = v.game, rig = g.cameraRig, K = TUNING.killCam, t = opts.target;
        if (!t?.position || self._killCam) return null;
        const prevOverride = rig.override;
        g.camera.getWorldPosition(_c);
        const from = new THREE.Vector3().subVectors(_c, t.position).setY(0).normalize();
        const side = Math.random() < 0.5 ? 1 : -1;
        const dir = from.applyAxisAngle(new THREE.Vector3(0, 1, 0), K.angle * side);
        const state = { t: 0 };
        self._killCam = state;
        self.requestTime('killcam', K.timeScale);
        g.ui.letterbox(true);
        rig.override = (cam, rawDt) => {
          state.t += rawDt;
          const k = Math.min(1, state.t / K.seconds), orbit = (k - 0.5) * 0.35 * side;
          _v.copy(dir).applyAxisAngle(_w.set(0, 1, 0), orbit).multiplyScalar(K.distance * (1 - 0.15 * k));
          cam.position.copy(t.position).add(_v); cam.position.y += 1.2 + K.height;
          const gy = g.sys('terrain').getHeightAt(cam.position.x, cam.position.z) + 0.4; if (cam.position.y < gy) cam.position.y = gy;
          cam.lookAt(t.position.x, t.position.y + 0.9, t.position.z);
        };
        return {
          update() {
            if (state.t < K.seconds && g.state === 'playing') return true;
            rig.override = prevOverride || null; rig.snap();
            self.requestTime('killcam', null); g.ui.letterbox(false); self._killCam = null;
            return false;
          },
          stop() { state.t = K.seconds; }, setPosition() {},
        };
      },
    });
  }

  serialize() { return { level: this.level, meter: Math.round(this.meter) }; }
  deserialize(d) { if (!d) return; if (d.level) this.setLevel(d.level); if (typeof d.meter === 'number') this.meter = d.meter; }
  dispose() { this._end(); this._warm?.removeFromParent(); this.markMat?.map?.dispose(); this.markMat?.dispose(); }
}
