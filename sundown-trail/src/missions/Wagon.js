import * as THREE from 'three';

/**
 * A wagon or stagecoach for missions (Part 15): a team of two horses (real horses from the horse system, so they
 * trot and gallop and can be shot) pulling a timber box on four turning wheels along a path of road points, with a
 * driver on the box and an optional strongbox. Guards are ordinary NPCs riding alongside (the mission spawns them).
 * The team follows the path with the horses' own goTo steering; the box trails behind on a hitch. If both horses
 * fall, or the driver dies or bolts, the wagon stops. `arrived` turns true at the end of the path.
 */
export const TUNING = { lookAhead: 9, gait: 1, hitch: 3.6, width: 1.9, length: 3.6, wheelR: 0.55, stopIfDriverGone: true };

export class Wagon {
  constructor(stage, { key, path, gait = TUNING.gait, coat = 'bay', coach = false, driver = null, strongbox = false, color = 0x5a3f28 }) {
    this.stage = stage; this.game = stage.game; this.key = key; this.path = path; this.i = 0; this.gait = gait;
    this.arrived = false; this.stopped = false; this.lost = false; this.driver = null; this.coach = coach;
    const g = this.game, H = g.get('horses'), p0 = path[0], p1 = path[1] || [p0[0] + 1, p0[1]];
    this.yaw = Math.atan2(-(p1[0] - p0[0]), -(p1[1] - p0[1]));
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    this.horses = [-1, 1].map((s, i) => {
      const h = H?.createHorse?.({ seed: `wagon:${key}:${i}`, coat: i ? coat : 'chestnut', breed: 'morgan', name: i ? 'Bess' : 'Dan' });
      if (h) { h.position.set(p0[0] + fx * (TUNING.hitch + TUNING.length / 2) + rx * s * 0.75, 0, p0[1] + fz * (TUNING.hitch + TUNING.length / 2) + rz * s * 0.75); h.position.y = stage.terrain.getHeightAt(h.position.x, h.position.z); h.yaw = this.yaw; h.animator?.teleported?.(); h.wagon = this; stage.horses.push(h); }
      return h;
    }).filter(Boolean);
    // the box
    this.group = new THREE.Group(); this.group.name = `wagon ${key}`;
    const wood = new THREE.MeshStandardMaterial({ color, roughness: 0.85 }), dark = new THREE.MeshStandardMaterial({ color: 0x2a1d12, roughness: 0.8 }), iron = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.6 });
    const box = (w, h, d, x, y, z, m = wood) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; this.group.add(b); return b; };
    const W = TUNING.width, Lg = TUNING.length, R = TUNING.wheelR;
    box(W, 0.12, Lg, 0, R + 0.35, 0); box(0.08, coach ? 1.5 : 0.55, Lg, -W / 2, R + (coach ? 1.1 : 0.65), 0); box(0.08, coach ? 1.5 : 0.55, Lg, W / 2, R + (coach ? 1.1 : 0.65), 0);
    box(W, coach ? 1.5 : 0.55, 0.08, 0, R + (coach ? 1.1 : 0.65), Lg / 2); box(W, coach ? 1.5 : 0.55, 0.08, 0, R + (coach ? 1.1 : 0.65), -Lg / 2);
    if (coach) { box(W + 0.2, 0.1, Lg + 0.2, 0, R + 1.9, 0, dark); box(1.2, 0.35, 0.8, 0, R + 1.25, -Lg / 2 - 0.35); }
    else box(1.3, 0.3, 0.6, 0, R + 0.95, -Lg / 2 + 0.3);
    box(0.08, 0.08, 2.6, 0, R + 0.3, -Lg / 2 - 1.3, dark); // tongue
    if (strongbox) this.strongbox = box(0.7, 0.45, 0.5, 0, R + (coach ? 2.2 : 0.65), coach ? 0.6 : 0.8, iron);
    this.wheels = [];
    const wg = new THREE.CylinderGeometry(R, R, 0.1, 14); wg.rotateZ(Math.PI / 2);
    for (const [x, z] of [[-W / 2 - 0.08, Lg / 2 - 0.5], [W / 2 + 0.08, Lg / 2 - 0.5], [-W / 2 - 0.08, -Lg / 2 + 0.5], [W / 2 + 0.08, -Lg / 2 + 0.5]]) { const w = new THREE.Mesh(wg, dark); w.position.set(x, R, z); w.castShadow = true; this.group.add(w); this.wheels.push(w); }
    stage.add(this.group);
    this.position = new THREE.Vector3(p0[0], 0, p0[1]); this.position.y = stage.terrain.getHeightAt(p0[0], p0[1]);
    this._placeBox(0);
    if (driver) {
      this.driver = stage.spawn(driver.key || `${key}Driver`, { role: 'townsman', ...driver, at: [p0[0], p0[1]], wander: false });
      if (this.driver) { this.driver.pose?.('sit'); this.driver.onWagon = this; }
    }
    this.collider = null;
  }
  get speed() { return this.horses[0]?.controller?.speed || 0; }
  /** World position of the driver's seat. */
  seat(out = new THREE.Vector3()) { return out.set(0, TUNING.wheelR + (this.coach ? 1.75 : 0.95), -TUNING.length / 2 + (this.coach ? -0.35 : 0.3)).applyMatrix4(this.group.matrixWorld); }
  stop() { this.stopped = true; for (const h of this.horses) h.controller?.stop?.(); }
  go() { this.stopped = false; }
  update(dt) {
    const T = this.stage.terrain, alive = this.horses.filter((h) => h.alive !== false);
    if (!alive.length || (TUNING.stopIfDriverGone && this.driver && (this.driver.dead || this.driver.brain?.state === 'flee' || this.driver.brain?.state === 'surrender'))) { if (!this.stopped) this.stop(); if (!alive.length) this.lost = this.lost || !this.arrived; }
    // steer the team along the path
    if (!this.stopped && !this.arrived && alive.length) {
      const lead = alive[0], lp = lead.position;
      while (this.i < this.path.length - 1 && Math.hypot(this.path[this.i][0] - lp.x, this.path[this.i][1] - lp.z) < TUNING.lookAhead) this.i++;
      const tgt = this.path[this.i], last = this.i === this.path.length - 1;
      if (last && Math.hypot(tgt[0] - lp.x, tgt[1] - lp.z) < 6) { this.arrived = true; this.stop(); }
      else {
        const yaw = lead.yaw, rx = Math.cos(yaw), rz = -Math.sin(yaw);
        alive.forEach((h, k) => { const s = alive.length > 1 ? (k ? 1 : -1) * 0.75 : 0; h.controller.goTo(_t.set(tgt[0] + rx * s, 0, tgt[1] + rz * s), this.gait); });
      }
    }
    // the box trails behind the team's midpoint
    const mid = _m.set(0, 0, 0); for (const h of alive.length ? alive : this.horses) mid.add(h.position); mid.divideScalar(Math.max(1, (alive.length ? alive : this.horses).length));
    const dx = this.position.x - mid.x, dz = this.position.z - mid.z, d = Math.hypot(dx, dz) || 1;
    const want = TUNING.hitch + TUNING.length / 2;
    const moved = Math.max(0, d - want);
    if (d > want) { this.position.x = mid.x + dx / d * want; this.position.z = mid.z + dz / d * want; }
    this.position.y = T.getHeightAt(this.position.x, this.position.z);
    this.yaw = Math.atan2(dx / d, dz / d);
    this._placeBox(moved);
    // the driver rides the box
    if (this.driver && !this.driver.dead && this.driver.brain?.calm !== false && !['fight', 'flee', 'surrender'].includes(this.driver.brain?.state)) {
      this.seat(this.driver.position); this.driver.yaw = this.yaw; this.driver.faceYaw?.(this.yaw); this.driver.velocity?.set?.(0, 0, 0);
      if (this.driver.posing !== 'sit') this.driver.pose?.('sit');
    }
    // a moving collider so Eli can't ride through it
    this._colT = (this._colT || 0) - dt;
    if (this._colT <= 0) { this._colT = 0.25; if (this.collider) this.game.physics.removeCollider(this.collider); this.collider = this.game.physics.addCollider({ type: 'box', position: this.position.clone().setY(this.position.y + 1), size: new THREE.Vector3(TUNING.width + 0.3, 1.8, TUNING.length), rotationY: this.yaw, surface: 'wood', tag: 'wagon' }); }
  }
  _placeBox(moved) {
    const T = this.stage.terrain, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const hb = T.getHeightAt(this.position.x + fx * 1.4, this.position.z + fz * 1.4), hf = T.getHeightAt(this.position.x - fx * 1.4, this.position.z - fz * 1.4); // (fx, fz) points back
    this.group.position.copy(this.position); this.group.rotation.set(0, 0, 0); this.group.rotation.y = this.yaw;
    this.group.rotateX(Math.atan2(hf - hb, 2.8));
    this.group.updateMatrixWorld(true);
    for (const w of this.wheels) w.rotation.x -= moved / TUNING.wheelR;
  }
  dispose() { if (this.collider) this.game.physics.removeCollider(this.collider); this.group.removeFromParent(); }
}
const _t = new THREE.Vector3(), _m = new THREE.Vector3();
