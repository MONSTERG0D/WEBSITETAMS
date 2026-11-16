import * as THREE from 'three';

/**
 * What an NPC notices (Part 7): a vision cone with distance and light falloff (night and crouching cut detection,
 * sprinting raises it), line of sight against colliders and terrain, hearing (gunshots out to ~250 m, a bow's thrum
 * nearby, running footsteps close by), and an awareness meter that fills while Eli is visible and drains when he
 * isn't. Also the small ?/! indicator above an NPC's head (suspicious, alerted, fighting).
 */
export const TUNING = {
  sight: 60, nightFactor: 0.42, crouchFactor: 0.55, sprintFactor: 1.2, cone: 115, alertCone: 170, peripheral: 0.3,
  gain: 1.6, decay: 0.25, suspicious: 0.35, seen: 1, lineOfSightEvery: 0.2,
  hearing: { gun: 250, rifle: 300, shotgun: 220, bow: 28, footsteps: 13, punch: 12 },
  indicatorSize: 0.028, indicatorHeight: 0.28,
};

const RAY = { ignoreEntities: true };
const _eye = new THREE.Vector3(), _to = new THREE.Vector3(), _f = new THREE.Vector3();

/** Shared ?/! sprite materials (created once, warmed up by the NPC system). */
let MATS = null;
export function indicatorMaterials() {
  if (MATS) return MATS;
  const mk = (ch, fill, stroke) => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.font = 'bold 54px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 7; x.strokeStyle = stroke; x.strokeText(ch, 32, 35); x.fillStyle = fill; x.fillText(ch, 32, 35);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false });
  };
  MATS = { suspicious: mk('?', '#f1e4c6', 'rgba(30,20,10,0.85)'), alerted: mk('!', '#e8b04a', 'rgba(30,20,10,0.85)'), combat: mk('!', '#c8462a', 'rgba(30,20,10,0.9)') };
  return MATS;
}

export class Perception {
  constructor(npc) {
    this.npc = npc; this.awareness = 0; this.canSee = false; this.lastSeen = new THREE.Vector3(); this.lastSeenAt = -1e9;
    this.heard = null; this._losT = 0; this._los = false; this.indicator = null; this._shown = null;
  }

  /** Visibility of an entity right now, 0..1 (cone, range, light, crouch, line of sight). */
  visibility(e, { checkLOS = true } = {}) {
    const n = this.npc, g = n.game, sky = g.sys('sky');
    if (!e || e.alive === false || !e.position) return 0;
    const pl = g.player, isPlayer = e === pl.entity;
    let range = TUNING.sight * (n.def.sight ?? 1);
    const night = sky.isNight?.() ? 1 : 0, dim = typeof sky.daylight === 'number' ? 1 - sky.daylight : night;
    range *= 1 - (1 - TUNING.nightFactor) * Math.min(1, dim);
    if (isPlayer) {
      if (pl.crouched) range *= TUNING.crouchFactor;
      if (Math.hypot(pl.velocity.x, pl.velocity.z) > 5) range *= TUNING.sprintFactor;
      if (pl.state === 'mounted') range *= 1.25;
    }
    _eye.copy(n.position); _eye.y += 1.65;
    _to.copy(e.position); _to.y += (e.height || 1.8) * (isPlayer && pl.crouched ? 0.45 : 0.7);
    _to.sub(_eye);
    const d = _to.length();
    if (d > range || d < 1e-3) return 0;
    _to.divideScalar(d);
    _f.set(-Math.sin(n.yaw), 0, -Math.cos(n.yaw));
    const ang = Math.acos(Math.max(-1, Math.min(1, _f.x * _to.x + _f.z * _to.z))) * 180 / Math.PI;
    const cone = (n.alert >= 2 ? TUNING.alertCone : TUNING.cone) / 2;
    let v = ang <= cone ? 1 : ang <= 150 ? TUNING.peripheral : 0;
    if (d < 2.2) v = Math.max(v, 0.8); // you notice someone right beside you
    if (!v) return 0;
    if (checkLOS) {
      const hit = g.physics.raycast(_eye, _to, d - 0.3, RAY);
      if (hit) return 0;
    }
    return v * Math.min(1, 1.15 - d / range);
  }

  /** Per brain tick: track the player (and the current target if it's someone else). */
  update(dt) {
    const n = this.npc, g = n.game, pl = g.player;
    this._losT -= dt;
    let vis = 0;
    if (pl.entity?.alive !== false && pl.state !== 'dead') {
      if (this._losT <= 0) { this._losT = TUNING.lineOfSightEvery; this._vis = this.visibility(pl.entity); }
      vis = this._vis || 0;
    }
    this.canSee = vis > 0;
    if (vis > 0) {
      this.awareness = Math.min(1.5, this.awareness + vis * TUNING.gain * dt * (n.alert >= 2 ? 3 : 1));
      if (this.awareness >= TUNING.seen) { this.lastSeen.copy(pl.position); this.lastSeenAt = g.now; }
    } else this.awareness = Math.max(0, this.awareness - TUNING.decay * dt);
    // running footsteps close behind
    const sp = Math.hypot(pl.velocity.x, pl.velocity.z);
    if (sp > 4.5 && !pl.crouched && pl.state !== 'mounted' && pl.position.distanceTo(n.position) < TUNING.hearing.footsteps && !this.canSee)
      this.hear({ kind: 'footsteps', position: pl.position.clone(), source: pl.entity });
  }
  /** True once Eli has been properly seen. */
  get sees() { return this.canSee && this.awareness >= TUNING.seen; }
  /** True while something seems off (half seen). */
  get suspects() { return this.awareness >= TUNING.suspicious; }
  /** Seconds since Eli was last seen clearly. */
  sinceSeen() { return this.npc.game.now - this.lastSeenAt; }

  /** A sound reached this NPC. */
  hear(info) { this.heard = { ...info, at: this.npc.game.now }; this.npc.brain.onEvent('heard', this.heard); }

  /** Shows ?, ! or a red ! above the head (null hides it). */
  showIndicator(kind) {
    if (kind === this._shown) return;
    this._shown = kind;
    const n = this.npc;
    if (!kind) { if (this.indicator) this.indicator.visible = false; return; }
    if (!this.indicator) {
      this.indicator = new THREE.Sprite(indicatorMaterials()[kind]); this.indicator.renderOrder = 998; this.indicator.raycast = () => {};
      this.indicator.scale.setScalar(TUNING.indicatorSize);
      const head = n.human?.getAttach('head');
      if (head) { head.add(this.indicator); this.indicator.position.set(0, TUNING.indicatorHeight, 0); }
      else { n.object3d.add(this.indicator); this.indicator.position.set(0, 2.2, 0); }
    }
    this.indicator.material = indicatorMaterials()[kind]; this.indicator.visible = true;
  }
  dispose() { this.indicator?.removeFromParent(); }
}
