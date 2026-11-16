import * as THREE from 'three';

/**
 * Fight helpers (Part 7): finding cover behind colliders (rocks, crates, wagons, walls, trees, barrels) that blocks
 * the line of fire from a threat, claiming it so two NPCs don't share one spot, flank positions around a pinned
 * target, and the NPC aim-error model (distance, movement, warm-up after spotting, difficulty).
 */
export const TUNING = {
  search: 26, minHeight: 0.85, standOff: 0.6, minThreatDist: 6, preferDist: 16, claimRadius: 1.3,
  flankAngle: 65, // degrees around the target from the squad's current bearing
  aim: { base: 3.2, perMetre: 0.045, targetMoving: 0.22, selfMoving: 1.7, warmup: 2.2, warmupTime: 2.5, crouchBonus: 0.85 },
};

const RAY = { ignoreEntities: true };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();

/** Spots currently claimed by NPCs: Map<npc, Vector3>. */
export const claims = new Map();
export function claim(npc, p) { if (p) claims.set(npc, p.clone()); else claims.delete(npc); }
function taken(p, npc) { for (const [o, q] of claims) if (o !== npc && q.distanceTo(p) < TUNING.claimRadius) return true; return false; }

/**
 * Best cover point for `npc` against a threat at `threat` (world position of the threat's chest).
 * @param {{ around?: THREE.Vector3, bearing?: number }} opts flanking: prefer points at `bearing` (radians) around `around`
 * @returns {THREE.Vector3|null}
 */
export function findCover(npc, threat, opts = {}) {
  const g = npc.game, p = npc.position, terrain = g.sys('terrain'), S = TUNING.search;
  const list = g.physics.query(p.x - S, p.z - S, p.x + S, p.z + S);
  let best = null, bestScore = Infinity;
  for (const c of list) {
    if (c.tag === 'worldWall') continue;
    const h = c.maxY - c.minY;
    if (h < TUNING.minHeight || c.maxY < terrain.getHeightAt(c.position.x, c.position.z) + TUNING.minHeight) continue;
    const rx = (c.maxX - c.minX) / 2, rz = (c.maxZ - c.minZ) / 2, r = Math.min(Math.max(rx, rz), 3);
    if (r < 0.25) continue;
    const cx = c.type === 'box' ? c.position.x : c.position.x, cz = c.position.z;
    // stand on the far side of the collider from the threat
    _d.set(cx - threat.x, 0, cz - threat.z); const td = _d.length(); if (td < 1e-3) continue; _d.divideScalar(td);
    for (const side of [0, 0.5, -0.5]) {
      const ang = Math.atan2(_d.z, _d.x) + side;
      const pt = new THREE.Vector3(cx + Math.cos(ang) * (r + TUNING.standOff), 0, cz + Math.sin(ang) * (r + TUNING.standOff));
      pt.y = terrain.getHeightAt(pt.x, pt.z);
      const dThreat = Math.hypot(pt.x - threat.x, pt.z - threat.z), dSelf = pt.distanceTo(p);
      if (dThreat < TUNING.minThreatDist || dSelf > S || taken(pt, npc)) continue;
      // must actually block the shot at crouch height
      _a.set(threat.x, threat.y, threat.z); _b.set(pt.x, pt.y + 0.9, pt.z).sub(_a); const L = _b.length(); _b.divideScalar(L);
      const hit = g.physics.raycast(_a, _b, L, RAY);
      if (!hit || hit.distance > L - 0.35) continue;
      let score = dSelf + Math.abs(dThreat - TUNING.preferDist) * 0.6 + Math.abs(side) * 1.5;
      if (opts.bearing !== undefined && opts.around) {
        const b = Math.atan2(pt.z - opts.around.z, pt.x - opts.around.x);
        let diff = Math.abs(Math.atan2(Math.sin(b - opts.bearing), Math.cos(b - opts.bearing)));
        score += diff * 12;
      }
      if (score < bestScore) { bestScore = score; best = pt; }
    }
  }
  return best;
}

/** Is `from` (an NPC chest) able to shoot `to` (a chest point)? */
export function clearShot(g, from, to) {
  _b.subVectors(to, from); const L = _b.length(); if (L < 1e-3) return true; _b.divideScalar(L);
  const hit = g.physics.raycast(from, _b, L - 0.3, RAY);
  return !hit;
}

/**
 * Aim error (degrees) for an NPC shot.
 * @param {{ dist, targetSpeed, selfSpeed, sinceSpotted, crouched, accuracy }} s accuracy: 1 normal, < 1 better
 */
export function aimError(s) {
  const A = TUNING.aim;
  const warm = 1 + (A.warmup - 1) * Math.max(0, 1 - s.sinceSpotted / A.warmupTime);
  let e = (A.base + s.dist * A.perMetre) * (1 + s.targetSpeed * A.targetMoving) * (s.selfSpeed > 0.5 ? A.selfMoving : 1) * warm * (s.crouched ? A.crouchBonus : 1);
  return e * s.accuracy;
}
