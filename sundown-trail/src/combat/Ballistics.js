import * as THREE from 'three';
import { arrowGeometry } from './WeaponModels.js';

/**
 * Shots (Part 6): hitscan rays with a random spread cone and damage falloff past the weapon's range, shotgun pellet
 * bursts, and arrows: real projectiles that arc under gravity, are tested against the world each step and stick
 * where they land (in an animated body they ride along with the bone they hit).
 */
export const TUNING = {
  falloffEnd: 2, falloffMin: 0.5, maxRangeFactor: 2.5,
  arrowSpeed: 58, arrowMinSpeed: 22, arrowGravity: 9.8, arrowPool: 24, arrowLife: 40, arrowStickDepth: 0.12,
};

const _right = new THREE.Vector3(), _up = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
const FWD = new THREE.Vector3(0, 0, -1);

/** A random direction inside a cone of `deg` degrees (half-angle) around `dir`; written to `out`. */
export function spreadDir(dir, deg, out = new THREE.Vector3()) {
  out.copy(dir);
  if (deg <= 0) return out;
  const a = (deg * Math.PI) / 180 * Math.sqrt(Math.random()), t = Math.random() * Math.PI * 2;
  _right.set(0, 1, 0).cross(dir); if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0); _right.normalize();
  _up.crossVectors(dir, _right);
  out.multiplyScalar(Math.cos(a)).addScaledVector(_right, Math.sin(a) * Math.cos(t)).addScaledVector(_up, Math.sin(a) * Math.sin(t));
  return out.normalize();
}

/** Damage multiplier for distance d against a weapon range. */
export function falloff(d, range) {
  if (d <= range) return 1;
  const k = Math.min(1, (d - range) / (range * (TUNING.falloffEnd - 1)));
  return 1 - (1 - TUNING.falloffMin) * k;
}

/** Casts one shot. @returns raycast hit (with .direction) or a miss { point, distance, miss: true, direction } */
export function castShot(game, origin, dir, range, ignore) {
  const max = range * TUNING.maxRangeFactor;
  const hit = game.physics.raycast(origin, dir, max, { ignore });
  if (hit) { hit.direction = dir.clone(); return hit; }
  return { miss: true, distance: max, point: origin.clone().addScaledVector(dir, max), direction: dir.clone() };
}

/** Arrows in flight and stuck in the world. */
export class Arrows {
  constructor(game, material) {
    this.game = game; this.geo = arrowGeometry(); this.material = material;
    this.items = []; this.flying = [];
  }
  _get() {
    let a = this.items.find((x) => !x.mesh.parent);
    if (!a && this.items.length < TUNING.arrowPool) {
      const mesh = new THREE.Mesh(this.geo, this.material); mesh.castShadow = true; mesh.raycast = () => {}; mesh.name = 'Arrow';
      a = { mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, stuck: false };
      this.items.push(a);
    }
    if (!a) a = this.items.reduce((o, x) => (x.age > o.age ? x : o)); // recycle the oldest
    a.mesh.removeFromParent();
    return a;
  }
  /**
   * @param {THREE.Vector3} origin @param {THREE.Vector3} dir @param {number} power 0..1 bow draw
   * @param {(hit, arrow) => void} onHit called once when the arrow lands (hit has entity/surface/point/normal)
   */
  shoot(origin, dir, power, onHit, ignore) {
    const a = this._get();
    a.pos.copy(origin); a.vel.copy(dir).multiplyScalar(TUNING.arrowMinSpeed + (TUNING.arrowSpeed - TUNING.arrowMinSpeed) * power);
    a.age = 0; a.stuck = false; a.onHit = onHit; a.ignore = ignore; a.power = power;
    this.game.scene.add(a.mesh); this._orient(a);
    this.flying.push(a);
    return a;
  }
  _orient(a) { _d.copy(a.vel).normalize(); a.mesh.position.copy(a.pos); a.mesh.quaternion.setFromUnitVectors(FWD, _d); }

  update(dt) {
    const g = this.game;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const a = this.flying[i];
      a.age += dt;
      a.vel.y -= TUNING.arrowGravity * dt;
      const step = a.vel.length() * dt;
      _d.copy(a.vel).normalize(); _o.copy(a.pos);
      const hit = g.physics.raycast(_o, _d, step + 0.76, { ignore: a.ignore }); // 0.76: the head sits that far ahead of the nock
      if (hit && hit.distance <= step + 0.76) {
        this.flying.splice(i, 1);
        // stick: the head buries a little past the surface
        a.pos.copy(hit.point).addScaledVector(_d, TUNING.arrowStickDepth - 0.76);
        this._orient(a); a.stuck = true;
        // hit boxes are scaled stand-ins: ride on the bone that carries them instead
        const target = hit.object && hit.entity ? (hit.object.name?.startsWith('hit:') ? hit.object.parent : hit.object) : null;
        if (target) target.attach(a.mesh); // ride along with the bone or object it hit
        hit.direction = _d.clone();
        a.onHit?.(hit, a);
        continue;
      }
      a.pos.addScaledVector(a.vel, dt);
      this._orient(a);
      if (a.age > 6 || a.pos.y < -50) { this.flying.splice(i, 1); a.mesh.removeFromParent(); }
    }
    // stuck arrows fade out of the world eventually
    for (const a of this.items) if (a.mesh.parent && a.stuck && (a.age += dt) > TUNING.arrowLife) a.mesh.removeFromParent();
    void _q;
  }
  dispose() { for (const a of this.items) a.mesh.removeFromParent(); this.geo.dispose(); }
}
