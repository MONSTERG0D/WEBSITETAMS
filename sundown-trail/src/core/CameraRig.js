import * as THREE from 'three';
import { clamp, damp } from './utils/math.js';
import { EVENTS } from './Events.js';

/** Third-person camera: smooth follow, collision, shoulder/aim/ride modes, trauma shake, FOV kicks. */
export const TUNING = {
  followDistance: 4.3, followHeight: 1.6, shoulder: 0.55, pivotLag: 16, zoomOut: 5,
  aimDistance: 1.9, aimHeight: 1.55, aimShoulder: 0.8, aimFov: 46,
  rideDistance: 5.8, rideHeight: 2.0, rideShoulder: 0.3, rideFov: 62,
  baseFov: 58, speedFovMax: 7, fovLerp: 6, pitchMin: -1.2, pitchMax: 1.0,
  padding: 0.25, probeRadius: 0.2, shoulderOut: 8,
  shakeAmplitude: 0.22, shakeRoll: 0.035, shakeFrequency: 17, shakeDecay: 1.7,
  orbitSpeed: 0.045, orbitRadius: 22, orbitHeight: 6.5,
};

const _pivot = new THREE.Vector3(), _fwd = new THREE.Vector3(), _back = new THREE.Vector3();
const _right = new THREE.Vector3(), _up = new THREE.Vector3(), _side = new THREE.Vector3();
const _origin = new THREE.Vector3(), _probe = new THREE.Vector3(), _look = new THREE.Vector3(), _dir = new THREE.Vector3();
const PROBES = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
const RAY_OPTS = { ignoreEntities: true };

export class CameraRig {
  constructor(game) {
    this.game = game; this.camera = game.camera; this.target = null; this.mode = 'follow';
    this.yaw = 0; this.pitch = -0.2; this.pivot = new THREE.Vector3(); this.distance = TUNING.followDistance;
    this.shoulderOffset = TUNING.shoulder;
    this.fov = TUNING.baseFov; this.speedFactor = 0; this.trauma = 0; this.shakeHold = 0; this.kick = 0; this.kickDecay = 0;
    this.time = 0; this.orbitAngle = 0; this._snap = true; this._shakeScale = (game.settings.get('cameraShake') ?? 1) * (game.settings.get('reduceMotion') ? 0.15 : 1);
    game.events.on(EVENTS.SETTINGS_CHANGED, () => { this._shakeScale = (game.settings.get('cameraShake') ?? 1) * (game.settings.get('reduceMotion') ? 0.15 : 1); }); // Part 14: reduced motion
    // Added in Part 6: combat raises the pivot when aiming from the saddle and narrows the aim FOV for long guns
    this.lift = 0; this.zoomFov = null; this._lift = 0;
  }
  /** @param {{position: THREE.Vector3}} target usually the player */
  setTarget(target) { this.target = target; this._snap = true; }
  setMode(mode) { this.mode = mode; }
  /** Jump straight to the target next frame (after teleports and loads). */
  snap() { this._snap = true; }
  shake(intensity = 0.3, seconds = 0.25) { this.trauma = Math.min(1, this.trauma + intensity); this.shakeHold = Math.max(this.shakeHold, seconds); }
  fovKick(degrees = 4, seconds = 0.25) { this.kick = degrees; this.kickDecay = degrees / Math.max(0.05, seconds); }
  /** 0..1, widens FOV with speed (gallops, sprints). */
  setSpeedFactor(f) { this.speedFactor = clamp(f, 0, 1); }
  forwardXZ(out) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  rightXZ(out) { return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }

  lateUpdate(dt, rawDt) {
    const g = this.game, cam = this.camera;
    this.time += rawDt;
    if (g.state === 'title' || this.mode === 'cinematic') { this._orbit(rawDt); return; }
    // Added in Part 5: a system can take over the camera (the cinematic ride camera); bob adds a small ride sway
    if (this.override) { if (g.state === 'playing' && !g.ui.isScreenOpen()) { this.yaw -= g.input.look.x; } const ov = this.override; ov(cam, rawDt); if (!ov.ownsFov) this._applyFov(rawDt); else this.fov = cam.fov; this._snap = true; return; } // Part 16: an override may own the field of view (cutscenes, duel, photo mode)
    const t = this.target;
    if (!t || !t.position) return;
    if (g.state === 'playing' && !g.ui.isScreenOpen()) {
      this.yaw -= g.input.look.x;
      this.pitch = clamp(this.pitch - g.input.look.y, TUNING.pitchMin, TUNING.pitchMax);
    }
    const m = this.mode, pad = TUNING.padding;
    const dist = m === 'aim' ? TUNING.aimDistance : m === 'ride' ? TUNING.rideDistance : TUNING.followDistance;
    const height = m === 'aim' ? TUNING.aimHeight : m === 'ride' ? TUNING.rideHeight : TUNING.followHeight;
    const shoulder = m === 'aim' ? TUNING.aimShoulder : m === 'ride' ? TUNING.rideShoulder : TUNING.shoulder;

    // Pivot: lags behind the head, but never through a wall (the lagged point could end up inside a box).
    this._lift = this._snap ? this.lift : damp(this._lift, this.lift, 8, rawDt);
    _pivot.set(t.position.x, t.position.y + height + this._lift + (this.mode === 'ride' ? this.bob || 0 : 0), t.position.z);
    if (this._snap) this.pivot.copy(_pivot);
    else {
      this.pivot.lerp(_pivot, 1 - Math.exp(-TUNING.pivotLag * rawDt));
      _dir.subVectors(this.pivot, _pivot);
      const lag = _dir.length();
      if (lag > 1e-4) {
        _dir.divideScalar(lag);
        const hit = g.physics.raycast(_pivot, _dir, lag + pad, RAY_OPTS);
        if (hit) this.pivot.copy(_pivot).addScaledVector(_dir, Math.max(0, Math.min(lag, hit.distance - pad)));
      }
    }

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    _fwd.set(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
    _back.copy(_fwd).negate();
    this.rightXZ(_right);
    _up.crossVectors(_right, _fwd).normalize();

    // Shoulder offset: a thick sideways sweep from the pivot, so the boom never starts inside or against a collider.
    let sh = shoulder;
    if (Math.abs(shoulder) > 1e-3) {
      _side.copy(_right).multiplyScalar(Math.sign(shoulder));
      let free = Math.abs(shoulder);
      for (const [px, py] of PROBES) {
        _probe.copy(this.pivot).addScaledVector(_back, px * TUNING.probeRadius).addScaledVector(_up, py * TUNING.probeRadius);
        const hit = g.physics.raycast(_probe, _side, free + pad, RAY_OPTS);
        if (hit) free = Math.max(0, Math.min(free, hit.distance - pad));
      }
      sh = Math.sign(shoulder) * free;
    }
    if (this._snap || Math.abs(sh) < Math.abs(this.shoulderOffset)) this.shoulderOffset = sh;
    else this.shoulderOffset = damp(this.shoulderOffset, sh, TUNING.shoulderOut, rawDt);
    _origin.copy(this.pivot).addScaledVector(_right, this.shoulderOffset);

    // Boom: a centre ray plus four rays offset by about the near plane's size, so edges and corners can't slip in.
    let allowed = dist;
    for (const [px, py] of PROBES) {
      _probe.copy(_origin).addScaledVector(_right, px * TUNING.probeRadius).addScaledVector(_up, py * TUNING.probeRadius);
      const hit = g.physics.raycast(_probe, _back, allowed + pad, RAY_OPTS);
      if (hit) allowed = Math.max(0, Math.min(allowed, hit.distance - pad));
    }
    // Pull in instantly when something blocks the view; ease back out when it clears.
    if (this._snap || allowed < this.distance) this.distance = allowed;
    else this.distance = damp(this.distance, allowed, TUNING.zoomOut, rawDt);

    cam.position.copy(_origin).addScaledVector(_back, this.distance);
    const floor = g.sys('terrain').getHeightAt(cam.position.x, cam.position.z) + 0.3;
    if (cam.position.y < floor) cam.position.y = floor;
    _look.copy(_origin).addScaledVector(_fwd, 10);
    cam.lookAt(_look);
    this._applyShake(rawDt);
    this._applyFov(rawDt);
    this._snap = false;
  }

  _orbit(rawDt) {
    const cam = this.camera, p = this.target?.position;
    this.orbitAngle += TUNING.orbitSpeed * rawDt;
    const cx = p ? p.x : 0, cy = p ? p.y : 0, cz = p ? p.z : 0;
    cam.position.set(cx + Math.cos(this.orbitAngle) * TUNING.orbitRadius, cy + TUNING.orbitHeight, cz + Math.sin(this.orbitAngle) * TUNING.orbitRadius);
    cam.lookAt(cx, cy + 1.5, cz);
    this._applyFov(rawDt);
    this._snap = true;
  }

  _applyShake(rawDt) {
    if (this.shakeHold > 0) this.shakeHold -= rawDt;
    else this.trauma = Math.max(0, this.trauma - TUNING.shakeDecay * rawDt);
    const s = this.trauma * this.trauma * this._shakeScale;
    if (s <= 0.0001) return;
    const f = TUNING.shakeFrequency * this.time, a = TUNING.shakeAmplitude * s, cam = this.camera;
    cam.position.x += (Math.sin(f * 1.1) + Math.sin(f * 2.7 + 1.3)) * 0.5 * a;
    cam.position.y += (Math.sin(f * 1.7 + 0.5) + Math.sin(f * 3.1 + 2.1)) * 0.5 * a;
    cam.position.z += (Math.sin(f * 1.3 + 2.4) + Math.sin(f * 2.3 + 0.7)) * 0.5 * a;
    cam.rotateZ((Math.sin(f * 0.9 + 1.9) + Math.sin(f * 2.1)) * 0.5 * TUNING.shakeRoll * s);
  }

  _applyFov(rawDt) {
    const base = this.mode === 'aim' ? this.zoomFov ?? TUNING.aimFov : this.mode === 'ride' ? TUNING.rideFov : TUNING.baseFov;
    this.kick = Math.max(0, this.kick - this.kickDecay * rawDt);
    this.fov = damp(this.fov, base + this.speedFactor * TUNING.speedFovMax + this.kick, TUNING.fovLerp, rawDt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
  }
}
