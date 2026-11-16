import * as THREE from 'three';
import { WEAPONS } from '../data/weapons.js';

/**
 * The lasso (Part 6, GAME_BIBLE §6 lasso: range 14 m): with the rope in hand, aim to swing the loop, fire to throw it
 * in an arc. A loop that passes close to a person or animal catches them around the chest; keep aiming to hold the
 * rope, hold fire to haul them in, let go of aim to release. Up close, hold E to hogtie. A hogtied person can be
 * picked up (E), carried at a walk, laid across the saddle of Eli's horse (E beside her) and taken down again.
 * Bodies are moved through their entity: Part 7 NPCs read entity.lassoed / hogtied / carriedBy and may implement
 * entity.onLasso(state, info) for 'caught' | 'released' | 'hogtied' | 'carried' | 'dropped' | 'onHorse' and
 * entity.lassoPull(vector) to be dragged; otherwise the lasso moves their object3d itself.
 */
export const TUNING = {
  throwSpeed: 17, arc: 0.12, catchRadius: 0.95, loopRadius: 0.42, cinchRadius: 0.26, spin: 9,
  pullSpeed: 1.8, hogtieRange: 2.3, hogtieTime: 1.1, carryRange: 2.0, horseRange: 3.2,
  ropeRadius: 0.011, ropeSegments: 24, sag: 0.35, retract: 0.4,
  // the hogtied pose lies on its side along local X with the hips off-centre: these offsets centre it across the load
  carry: { offset: [-1.14, 1.42, -0.22], yaw: 0 }, horse: { offset: [-1.13, -0.22, 0.05], yaw: 0 },
};

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1);

/** A rope drawn as a thin tube along a polyline (positions rewritten in place each frame). */
class RopeMesh {
  constructor(material, segs = TUNING.ropeSegments, sides = 5) {
    this.segs = segs; this.sides = sides; this.points = Array.from({ length: segs + 1 }, () => new THREE.Vector3());
    const g = new THREE.BufferGeometry(), n = (segs + 1) * sides;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const idx = [];
    for (let i = 0; i < segs; i++) for (let k = 0; k < sides; k++) {
      const a = i * sides + k, b = i * sides + ((k + 1) % sides), c = a + sides, d = b + sides;
      idx.push(a, c, b, b, c, d);
    }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, material); this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.raycast = () => {}; this.mesh.name = 'Rope';
  }
  /** Rebuild the tube along this.points. */
  update(radius = TUNING.ropeRadius) {
    const P = this.points, pos = this.mesh.geometry.attributes.position.array, nor = this.mesh.geometry.attributes.normal.array;
    for (let i = 0; i <= this.segs; i++) {
      _d.subVectors(P[Math.min(this.segs, i + 1)], P[Math.max(0, i - 1)]).normalize();
      _a.set(0, 1, 0); if (Math.abs(_d.y) > 0.9) _a.set(1, 0, 0);
      _b.crossVectors(_d, _a).normalize(); _a.crossVectors(_b, _d);
      for (let k = 0; k < this.sides; k++) {
        const t = (k / this.sides) * Math.PI * 2, cx = Math.cos(t), sy = Math.sin(t), j = (i * this.sides + k) * 3;
        const nx = _b.x * cx + _a.x * sy, ny = _b.y * cx + _a.y * sy, nz = _b.z * cx + _a.z * sy;
        pos[j] = P[i].x + nx * radius; pos[j + 1] = P[i].y + ny * radius; pos[j + 2] = P[i].z + nz * radius;
        nor[j] = nx; nor[j + 1] = ny; nor[j + 2] = nz;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.normal.needsUpdate = true;
  }
  /** Points along a hanging curve from a to b (sag in metres at the middle). */
  hang(a, b, sag) { for (let i = 0; i <= this.segs; i++) { const t = i / this.segs; this.points[i].lerpVectors(a, b, t); this.points[i].y -= Math.sin(Math.PI * t) * sag; } }
}

export class Lasso {
  constructor(game, combat) {
    this.game = game; this.combat = combat; this.state = 'idle'; this.target = null; this.carrying = null; this.onHorse = null;
    this.material = new THREE.MeshStandardMaterial({ color: 0xb49a6a, roughness: 0.92 });
    this.rope = new RopeMesh(this.material);
    this.loop = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 5, 22), this.material);
    this.loop.castShadow = true; this.loop.raycast = () => {}; this.loop.name = 'Lasso loop';
    this.rope.mesh.visible = false; this.loop.visible = false;
    this.rope.mesh.userData.warmup = true; this.loop.userData.warmup = true; // compile with the scene during loading
    game.scene.add(this.rope.mesh, this.loop);
    this.fly = { from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, dur: 1 };
    this.loopPos = new THREE.Vector3(); this._hold = 0; this._spin = 0;
  }
  get active() { return this.state !== 'idle'; }

  /** Called by the combat system every frame. `armed`: the lasso is the drawn weapon. */
  update(dt, rawDt, can, armed) {
    const g = this.game, input = g.input, pl = g.player, h = pl.human;
    const hand = this._hand(_c);
    if (this.state !== 'idle' && !armed && this.state !== 'caught') this._reset();
    switch (this.state) {
      case 'idle':
        if (armed && can && input.isDown('aim')) { this.state = 'aiming'; h?.setState('aimPistol'); }
        break;
      case 'aiming': {
        if (!armed || !can || !input.isDown('aim')) { this._reset(); break; }
        this._faceCamera();
        // the loop swings in a flat circle above the hand
        this._spin += rawDt * TUNING.spin;
        this.loopPos.set(hand.x + Math.cos(this._spin) * 0.25, hand.y + 0.35, hand.z + Math.sin(this._spin) * 0.25);
        this._showLoop(this.loopPos, TUNING.loopRadius * 0.8, true);
        this.rope.hang(hand, this.loopPos, 0.02); this.rope.update(); this.rope.mesh.visible = true;
        if (input.pressed('fire')) this._throw(hand);
        break;
      }
      case 'flying': {
        const f = this.fly; f.t += dt / f.dur;
        const k = Math.min(1, f.t);
        this.loopPos.lerpVectors(f.from, f.to, k); this.loopPos.y += Math.sin(Math.PI * k) * f.arc;
        this._showLoop(this.loopPos, TUNING.loopRadius, false);
        this.rope.hang(hand, this.loopPos, TUNING.sag * (1 - k)); this.rope.update();
        const caught = this._catch(this.loopPos);
        if (caught) { this._caught(caught); break; }
        if (k >= 1) { this.state = 'missed'; this.fly.t = 0; g.audio.play('lasso_miss', { position: this.loopPos }); }
        break;
      }
      case 'missed': { // the loop drops and is hauled back in
        this.fly.t += dt / TUNING.retract;
        const k = Math.min(1, this.fly.t);
        _a.copy(this.loopPos); _a.y = Math.max(g.sys('terrain').getHeightAt(_a.x, _a.z) + 0.05, _a.y - dt * 4);
        this.loopPos.lerpVectors(_a, hand, k * k);
        this._showLoop(this.loopPos, TUNING.loopRadius * (1 - k * 0.7), false);
        this.rope.hang(hand, this.loopPos, 0.1); this.rope.update();
        if (k >= 1) { this._reset(); if (input.isDown('aim') && armed) this.state = 'aiming'; }
        break;
      }
      case 'caught': this._caughtTick(dt, rawDt, can, armed, hand); break;
    }
    this._carryTick(can);
  }

  _throw(hand) {
    const g = this.game, cam = g.camera, pl = g.player, range = WEAPONS.lasso.range;
    cam.getWorldPosition(_a); cam.getWorldDirection(_b);
    const hit = g.physics.raycast(_a, _b, range + 4, { ignore: pl.entity });
    _d.copy(_a).addScaledVector(_b, hit ? hit.distance : range);
    // keep it within reach of Eli's hand
    _c.subVectors(_d, hand); if (_c.length() > range) _d.copy(hand).addScaledVector(_c.normalize(), range);
    const f = this.fly; f.from.copy(this.loopPos); f.to.copy(_d); f.t = 0;
    const dist = f.from.distanceTo(f.to); f.dur = Math.max(0.25, dist / TUNING.throwSpeed); f.arc = 0.6 + dist * TUNING.arc;
    this.state = 'flying';
    pl.human?.setState('punch', { restart: true, speed: 1.2 });
    g.audio.play('lasso_throw', { position: hand });
  }
  /** A body whose chest the loop is passing. */
  _catch(p) {
    const g = this.game, pl = g.player, myHorse = g.get('horses')?.playerHorse?.entity;
    for (const e of g.entities.list) {
      if (e === pl.entity || e === myHorse || e.alive === false || e.hogtied || e.carriedBy || !e.position || (e.type !== 'npc' && e.type !== 'animal' && e.type !== 'horse')) continue;
      _a.copy(e.position); _a.y += (e.height || 1.8) * 0.62;
      if (_a.distanceTo(p) < TUNING.catchRadius) return e;
    }
    return null;
  }
  _caught(e) {
    const g = this.game;
    this.state = 'caught'; this.target = e; e.lassoed = true; this._hold = 0;
    e.onLasso?.('caught', { by: g.player.entity });
    g.audio.play('lasso_catch', { position: this.loopPos });
    g.input.haptic(25);
  }
  _chest(e, out) { out.copy(e.position); out.y += (e.height || 1.8) * 0.62; return out; }

  _caughtTick(dt, rawDt, can, armed, hand) {
    const g = this.game, input = g.input, pl = g.player, e = this.target;
    if (!e || e.alive === false || !armed || !can || !input.isDown('aim')) { this._release(); return; }
    this._faceCamera(e.position);
    this._chest(e, this.loopPos);
    this._showLoop(this.loopPos, TUNING.cinchRadius * ((e.radius || 0.35) / 0.35), false, true);
    const dist = _a.copy(e.position).setY(0).distanceTo(_b.copy(pl.position).setY(0));
    this.rope.hang(hand, this.loopPos, Math.min(0.25, dist * 0.015)); this.rope.update();
    // haul in
    if (input.isDown('fire') && dist > TUNING.hogtieRange * 0.7) {
      _d.subVectors(pl.position, e.position).setY(0).normalize().multiplyScalar(TUNING.pullSpeed * dt);
      if (e.lassoPull) e.lassoPull(_d);
      else { e.position.add(_d); e.position.y = g.sys('terrain').getHeightAt(e.position.x, e.position.z); e.object3d?.position.copy(e.position); }
    }
    // hogtie: hold E up close
    if (dist < TUNING.hogtieRange && e.type === 'npc') {
      g.ui.prompt('lasso', this._hold > 0 ? `Hogtying… ${Math.round((this._hold / TUNING.hogtieTime) * 100)}%` : 'Hold to hogtie', g.input.keyLabel('interact'));
      if (input.isDown('interact')) { this._hold += rawDt; if (this._hold >= TUNING.hogtieTime) this._hogtie(e); }
      else this._hold = 0;
    } else g.ui.clearPrompt('lasso');
  }
  _hogtie(e) {
    const g = this.game, human = e.object3d?.userData?.human || e.human || null;
    e.hogtied = true; e.lassoed = false;
    human?.setState('hogtied', { fade: 0.4 });
    e.onLasso?.('hogtied', { by: g.player.entity });
    g.audio.play('hogtie', { position: e.position });
    g.ui.clearPrompt('lasso');
    this.target = null; this._reset();
  }
  _release() {
    const e = this.target;
    if (e) { e.lassoed = false; e.onLasso?.('released', {}); }
    this.game.ui.clearPrompt('lasso');
    this.target = null; this.state = 'missed'; this.fly.t = 0;
  }
  _reset() {
    const h = this.game.player.human;
    if (this.target) { this.target.lassoed = false; this.target.onLasso?.('released', {}); this.target = null; }
    this.state = 'idle'; this.rope.mesh.visible = false; this.loop.visible = false; this.game.ui.clearPrompt('lasso');
    if (h?.upperState === 'aimPistol' && !this.combat.isAiming) h.stopUpper(0.25);
  }

  // ---------------------------------------------------------------- carrying hogtied people
  _carryTick(can) {
    const g = this.game, input = g.input, pl = g.player, horse = g.get('horses')?.playerHorse;
    if (!can || pl.state === 'mounted') { if (!this.carrying) g.ui.clearPrompt('carry'); return; }
    let label = null, act = null;
    if (this.carrying) {
      if (horse && horse.alive && !horse.rider && pl.position.distanceTo(horse.position) < TUNING.horseRange && !this.onHorse) { label = `Put on ${horse.name}`; act = () => this._toHorse(horse); }
      else { label = 'Put down'; act = () => this._drop(); }
    } else if (this.state === 'idle' || this.state === 'aiming') {
      if (this.onHorse && horse && pl.position.distanceTo(horse.position) < TUNING.horseRange) { label = `Take off ${horse.name}`; act = () => this._fromHorse(); }
      else {
        const e = this._nearHogtied();
        if (e) { label = 'Pick up'; act = () => this._pickUp(e); }
      }
    }
    if (label) { g.ui.prompt('carry', label, g.input.keyLabel('interact')); if (input.pressed('interact')) act(); }
    else g.ui.clearPrompt('carry');
    if (this.carrying && pl.human && pl.human.upperState !== 'carry') pl.human.setState('carry');
  }
  _nearHogtied() {
    const g = this.game, pl = g.player;
    let best = null, bd = TUNING.carryRange;
    for (const e of g.entities.list) {
      if (!e.hogtied || e.carriedBy || e.alive === false || !e.position) continue;
      const d = e.position.distanceTo(pl.position); if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  _pickUp(e) {
    const g = this.game, pl = g.player, host = pl.human?.object3d || pl.object3d;
    this._attach(e, host, TUNING.carry.offset, TUNING.carry.yaw);
    e.carriedBy = 'player'; this.carrying = e; pl.carrying = e;
    e.onLasso?.('carried', {});
    pl.human?.setState('carry');
    g.audio.play('pick_up', { position: pl.position });
  }
  _drop() {
    const g = this.game, pl = g.player, e = this.carrying;
    if (!e) return;
    _a.set(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw)).multiplyScalar(0.9).add(pl.position);
    _a.y = g.sys('terrain').getHeightAt(_a.x, _a.z);
    this._detach(e, _a, pl.yaw + Math.PI / 2);
    e.carriedBy = null; this.carrying = null; pl.carrying = null;
    e.onLasso?.('dropped', {});
    pl.human?.stopUpper(0.3);
  }
  _toHorse(horse) {
    const e = this.carrying;
    if (!e) return;
    this._attach(e, horse.rig.attach.pelts, TUNING.horse.offset, TUNING.horse.yaw);
    e.carriedBy = 'horse'; this.onHorse = e; this.carrying = null; this.game.player.carrying = null;
    horse.pelts?.push?.(e);
    e.onLasso?.('onHorse', { horse });
    this.game.player.human?.stopUpper(0.3);
  }
  _fromHorse() {
    const horse = this.game.get('horses')?.playerHorse, e = this.onHorse;
    if (!e) return;
    if (horse?.pelts) { const i = horse.pelts.indexOf(e); if (i >= 0) horse.pelts.splice(i, 1); }
    this.onHorse = null;
    this._pickUp(e);
  }
  /** Parents the body's object to `parent` at a fixed pose (the hogtied clip lies on its side along local X). */
  _attach(e, parent, offset, yaw) {
    const o = e.object3d;
    if (!o || !parent) return;
    parent.add(o);
    o.position.fromArray(offset); o.quaternion.setFromAxisAngle(UP, yaw);
    const ps = parent.getWorldScale(_a), s = (o.userData.human?.look?.height || 1);
    o.scale.set(s / ps.x, s / ps.y, s / ps.z);
    e.hittable = false;
    o.userData.human?.teleported();
  }
  _detach(e, world, yaw) {
    const o = e.object3d, g = this.game;
    if (!o) return;
    g.scene.add(o);
    o.position.copy(world); o.rotation.set(0, yaw, 0); o.scale.setScalar(o.userData.human?.look?.height || 1);
    e.position.copy(world); e.hittable = true;
    o.userData.human?.teleported();
  }

  // ---------------------------------------------------------------- helpers
  _hand(out) {
    const pl = this.game.player, h = pl.human;
    if (h) return h.getAttach('handR').getWorldPosition(out);
    return out.copy(pl.position).setY(pl.position.y + 1.3);
  }
  _faceCamera(at = null) {
    const pl = this.game.player;
    if (pl.state === 'mounted') return;
    let want = this.game.cameraRig.yaw;
    if (at) want = Math.atan2(-(at.x - pl.position.x), -(at.z - pl.position.z));
    let d = want - pl.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    pl.yaw += d * 0.3; pl.object3d.rotation.y = pl.yaw;
  }
  _showLoop(p, r, flat, cinched = false) {
    const L = this.loop;
    L.visible = true; L.position.copy(p); L.scale.setScalar(r);
    if (flat || cinched) L.quaternion.setFromUnitVectors(FWD, UP);
    else { _d.subVectors(p, this._hand(_b)).normalize(); L.quaternion.setFromUnitVectors(FWD, _d); }
    void _q;
  }
  /** Drop everything (death, mounting with a body in arms is blocked elsewhere). */
  cancel() { if (this.carrying) this._drop(); this._reset(); }
  dispose() { this.rope.mesh.removeFromParent(); this.rope.mesh.geometry.dispose(); this.loop.removeFromParent(); this.loop.geometry.dispose(); this.material.dispose(); }
}
