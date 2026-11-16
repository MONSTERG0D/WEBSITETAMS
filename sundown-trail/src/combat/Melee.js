import * as THREE from 'three';

/**
 * Brawling (Part 6): fists when Eli is unarmed (holstered with X or the wheel's Holster slot) and the skinning knife.
 * Fire punches (alternating hands; hold for a heavy punch), aim raises a guard that blocks most of a frontal hit,
 * jump while guarding dodges to the side, reload (R) shoves. Hits find the nearest body in front, turn Eli toward it
 * with a small lunge, and land through combat.applyDamage (hit marker, events, the target's own hit reaction).
 * Targets may implement entity.onShove(direction) to stagger; Part 7 NPCs throw punches back through Player.takeDamage,
 * which asks blockFactor() how much a guard soaks.
 */
export const TUNING = {
  range: 1.5, cone: 70, heavyHold: 0.35,
  punch: { damage: 8, hitAt: 0.16, cool: 0.42, lunge: 2.2, shake: 0.12, headChance: 0.3 },
  heavy: { damage: 22, hitAt: 0.24, cool: 0.8, lunge: 3.2, shake: 0.28, headChance: 0.45 },
  knife: { hitAt: 0.15, cool: 0.6, lunge: 2.6, shake: 0.14 },
  shove: { damage: 2, hitAt: 0.14, cool: 0.7, lunge: 2.8, shake: 0.18, push: 3.2 },
  dodge: { speed: 6.5, time: 0.2, cool: 0.6, invulnerable: 0.3 },
  block: { frontal: 0.2, cone: 0.25 }, // damage factor while guarding a hit from the front (dot > cone)
};

const _f = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _r = new THREE.Vector3();

export class Melee {
  constructor(game, combat) {
    this.game = game; this.combat = combat;
    this.blocking = false; this.attack = null; this.cool = 0; this.charge = -1; this.left = false;
    this.dodgeT = 0; this.dodgeCool = 0; this.invulnerable = 0; this._dodgeDir = new THREE.Vector3();
  }
  get knife() { const A = this.combat.arsenal; return A.current === 'knife' && A.drawn && !A.unarmed; }

  /** Called by the combat system every frame while Eli fights with fists or the knife. */
  update(dt, rawDt, can) {
    const g = this.game, input = g.input, pl = g.player, h = pl.human;
    this.cool = Math.max(0, this.cool - dt); this.dodgeCool = Math.max(0, this.dodgeCool - dt); this.invulnerable = Math.max(0, this.invulnerable - dt);
    const mounted = pl.state === 'mounted';
    // guard
    const guard = can && !mounted && input.isDown('aim') && !this.attack;
    if (guard !== this.blocking) {
      this.blocking = guard;
      if (guard) h?.setState('block'); else if (h?.upperState === 'block' && !this.attack) h.stopUpper(0.2);
    }
    if (this.blocking) this._faceCamera();
    // attacks: press to start, hold to wind up a heavy punch, release to throw
    if (can && !mounted && input.pressed('fire') && !this.attack && this.cool <= 0) this.charge = 0;
    if (this.charge >= 0) {
      if (input.isDown('fire') && !this.knife && this.charge < TUNING.heavyHold) this.charge += rawDt;
      else { this._start(this.knife ? 'knife' : this.charge >= TUNING.heavyHold ? 'heavy' : 'punch'); this.charge = -1; }
    }
    if (can && !mounted && input.pressed('reload') && !this.attack && this.cool <= 0) this._start('shove');
    if (can && !mounted && this.blocking && input.pressed('jump') && this.dodgeCool <= 0) this._dodge();
    // attack timeline
    const a = this.attack;
    if (a) {
      a.t += dt;
      if (!a.hit && a.t >= a.def.hitAt) { a.hit = true; this._resolve(a); }
      if (a.t >= a.def.cool) { this.attack = null; if (this.blocking) h?.setState('block'); else h?.stopUpper(0.2); }
      else if (a.t < a.def.hitAt) { const k = a.def.lunge * (1 - a.t / a.def.hitAt); pl.velocity.x += _f.set(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw)).x * k * dt * 8; pl.velocity.z += _f.z * k * dt * 8; }
    }
    if (this.dodgeT > 0) { this.dodgeT -= dt; pl.velocity.x = this._dodgeDir.x * TUNING.dodge.speed; pl.velocity.z = this._dodgeDir.z * TUNING.dodge.speed; }
  }

  /** Damage factor for a hit from `direction` (world, pointing from attacker to Eli): guarding the front soaks most of it. */
  blockFactor(direction) {
    if (this.invulnerable > 0) return 0;
    if (!this.blocking || !direction) return 1;
    const pl = this.game.player;
    _f.set(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw));
    _d.set(-direction.x, 0, -direction.z).normalize(); // toward the attacker
    return _f.dot(_d) > TUNING.block.cone ? TUNING.block.frontal : 1;
  }

  /** Nearest living body in front within reach (or null). */
  target(range = TUNING.range) {
    const g = this.game, pl = g.player;
    _f.set(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw));
    g.cameraRig.forwardXZ(_r);
    let best = null, bd = Infinity;
    for (const e of g.entities.list) {
      if (e === pl.entity || e.alive === false || !e.position || e.hogtied || (e.type !== 'npc' && e.type !== 'animal')) continue;
      _d.subVectors(e.position, pl.position).setY(0);
      const dist = _d.length() - (e.radius || 0.35);
      if (dist > range) continue;
      _d.normalize();
      const ang = Math.acos(Math.max(-1, Math.min(1, Math.max(_d.dot(_f), _d.dot(_r))))) * 180 / Math.PI; // in front of Eli or of the camera
      if (ang > TUNING.cone) continue;
      if (dist + ang * 0.01 < bd) { bd = dist + ang * 0.01; best = e; }
    }
    return best;
  }

  _start(kind) {
    const g = this.game, pl = g.player, h = pl.human;
    const def = TUNING[kind];
    const t = this.target(kind === 'knife' ? 1.6 : TUNING.range + (kind === 'heavy' ? 0.3 : 0));
    if (t) { _d.subVectors(t.position, pl.position); pl.yaw = Math.atan2(-_d.x, -_d.z); pl.object3d.rotation.y = pl.yaw; }
    else this._faceCamera(true);
    this.attack = { kind, def, t: 0, hit: false, target: t };
    this.left = !this.left;
    const hand = kind === 'shove' || (kind === 'punch' && this.left) ? 'L' : undefined;
    h?.setState('punch', { hand, speed: kind === 'heavy' ? 0.72 : kind === 'shove' ? 1.25 : 1.1, restart: true });
    g.audio.play(kind === 'knife' ? 'knife_swing' : 'punch_swing', { position: pl.position, volume: 0.6 });
  }
  _resolve(a) {
    const g = this.game, pl = g.player, combat = this.combat, vfx = g.sys('vfx');
    // the target may have stepped away: re-check reach
    const t = a.target && a.target.alive !== false && a.target.position.distanceTo(pl.position) - (a.target.radius || 0.35) < TUNING.range + 0.4 ? a.target : this.target(TUNING.range + 0.2);
    if (!t) { g.audio.play('punch_whiff', { position: pl.position, volume: 0.5 }); return; }
    _d.subVectors(t.position, pl.position).setY(0).normalize();
    _p.copy(t.position).setY(t.position.y + (t.height || 1.8) * 0.72).addScaledVector(_d, -(t.radius || 0.3));
    if (a.kind === 'shove') {
      combat.applyDamage(t, { amount: TUNING.shove.damage, zone: 'torso', weaponId: 'fists', source: pl.entity, point: _p, direction: _d });
      if (t.onShove) t.onShove(_d.clone().multiplyScalar(TUNING.shove.push)); else t.human?.setState?.('hit', { direction: _d, zone: 'torso', strength: 1.6 });
    } else {
      const head = Math.random() < (a.def.headChance ?? 0);
      const amount = a.kind === 'knife' ? 45 : a.def.damage * (head ? 1.4 : 1);
      combat.applyDamage(t, { amount, zone: a.kind === 'knife' ? 'torso' : head ? 'head' : 'torso', weaponId: a.kind === 'knife' ? 'knife' : 'fists', source: pl.entity, point: _p, direction: _d });
    }
    vfx.spawn(a.kind === 'knife' ? 'impact_flesh' : 'impact_punch', { position: _p, direction: _f.copy(_d).negate() });
    g.cameraRig.shake(a.def.shake, 0.1);
    g.audio.play(a.kind === 'knife' ? 'knife_hit' : a.kind === 'shove' ? 'shove' : 'punch_hit', { position: _p });
    g.input.haptic(a.kind === 'heavy' ? 40 : 20);
  }
  _dodge() {
    const g = this.game, pl = g.player, mv = g.input.move;
    g.cameraRig.rightXZ(_r); g.cameraRig.forwardXZ(_f);
    this._dodgeDir.set(0, 0, 0).addScaledVector(_r, Math.abs(mv.x) > 0.2 ? Math.sign(mv.x) : -1).addScaledVector(_f, mv.y < -0.3 ? -1 : 0).normalize();
    this.dodgeT = TUNING.dodge.time; this.dodgeCool = TUNING.dodge.cool; this.invulnerable = TUNING.dodge.invulnerable;
    pl.human?.setState('hit', { direction: this._dodgeDir.clone().negate(), zone: 'torso', strength: 0.6 });
    g.audio.play('dodge', { position: pl.position, volume: 0.5 });
  }
  _faceCamera(snap = false) {
    const pl = this.game.player, cy = this.game.cameraRig.yaw;
    let d = cy - pl.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    pl.yaw += snap ? d : d * 0.25; pl.object3d.rotation.y = pl.yaw;
  }
  /** Leave brawling (a gun was drawn, or Eli got on a horse). */
  stop() {
    const h = this.game.player.human;
    if (this.blocking || this.attack) { this.blocking = false; this.attack = null; if (h?.upperState === 'block' || h?.upperState?.startsWith('punch')) h.stopUpper(0.2); }
    this.charge = -1;
  }
}
