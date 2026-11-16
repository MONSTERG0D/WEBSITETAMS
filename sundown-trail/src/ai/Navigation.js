import * as THREE from 'three';
import { WORLD } from '../data/world.js';

/**
 * NPC navigation (Part 7): local steering toward a goal with feelers against colliders (rocks, walls, wagons,
 * crates, trees), separation from other people, stuck recovery; road following for long trips (the Catmull-Rom
 * roads in data/world.js, sampled once); and waypoint graphs (towns register theirs, Part 9) searched with A*.
 */
export const TUNING = {
  feelers: [[0, 2.6], [0.55, 1.8], [-0.55, 1.8]], // [angle, length] at chest height
  avoidTurn: 1.1, separation: 1.1, separationGain: 1.2, arrive: 0.6,
  stuckTime: 1.2, stuckSpeed: 0.25, sidestep: 1.4,
  roadAbove: 90, roadStep: 8, graphSnap: 30,
};

const RAY = { ignoreEntities: true };
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _v = new THREE.Vector3();

/**
 * Is a standing spot (x, z) inside a collider's footprint (with `r` of clearance)? The physics query returns colliders
 * by bounding box, which for long rotated walls covers far more than the wall, so this checks the real shape.
 */
export function isBlocked(physics, x, z, r = 0.6) {
  for (const c of physics.query(x - r, z - r, x + r, z + r)) {
    const dx = x - c.position.x, dz = z - c.position.z;
    if (c.type === 'box') {
      const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos; // into the box's frame
      if (Math.abs(lx) < c.size.x / 2 + r && Math.abs(lz) < c.size.z / 2 + r) return true;
    } else if (Math.hypot(dx, dz) < (c.radius || 0.5) + r) return true;
  }
  return false;
}

/** A waypoint graph (nodes with links) searched with A*. */
export class NavGraph {
  constructor(name) { this.name = name; this.nodes = []; }
  /** @returns node index */
  add(x, z, tag = null) { this.nodes.push({ x, z, tag, links: [] }); return this.nodes.length - 1; }
  link(a, b) { if (!this.nodes[a].links.includes(b)) this.nodes[a].links.push(b); if (!this.nodes[b].links.includes(a)) this.nodes[b].links.push(a); }
  nearest(x, z, max = TUNING.graphSnap) {
    let best = -1, bd = max * max;
    this.nodes.forEach((n, i) => { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = i; } });
    return best;
  }
  tagged(tag) { return this.nodes.map((n, i) => (n.tag === tag ? i : -1)).filter((i) => i >= 0); }
  /** A* from node a to node b → array of [x, z] (or null). */
  path(a, b) {
    if (a < 0 || b < 0) return null;
    const N = this.nodes, h = (i) => Math.hypot(N[i].x - N[b].x, N[i].z - N[b].z);
    const open = new Set([a]), from = new Map(), g = new Map([[a, 0]]), f = new Map([[a, h(a)]]);
    while (open.size) {
      let cur = -1, cf = Infinity; for (const i of open) { const v = f.get(i); if (v < cf) { cf = v; cur = i; } }
      if (cur === b) { const out = []; let c = cur; while (c !== undefined) { out.unshift([N[c].x, N[c].z]); c = from.get(c); } return out; }
      open.delete(cur);
      for (const n of N[cur].links) {
        const t = g.get(cur) + Math.hypot(N[cur].x - N[n].x, N[cur].z - N[n].z);
        if (t < (g.get(n) ?? Infinity)) { from.set(n, cur); g.set(n, t); f.set(n, t + h(n)); open.add(n); }
      }
    }
    return null;
  }
}

/** Dense polylines of every road, built once. */
let ROADS = null;
function roads() {
  if (ROADS) return ROADS;
  ROADS = (WORLD.roads || []).map((r) => {
    const pts = [];
    for (let i = 0; i < r.points.length - 1; i++) {
      const [a, b] = [r.points[i], r.points[i + 1]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / TUNING.roadStep));
      for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    pts.push(r.points[r.points.length - 1]);
    return { id: r.id, pts };
  });
  return ROADS;
}
function nearestOnRoads(x, z) {
  let best = null;
  for (const r of roads()) r.pts.forEach((p, i) => { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (!best || d < best.d) best = { r, i, d }; });
  return best;
}

/**
 * Plans a route: a graph path when both ends sit on a registered graph, the road network when the trip is long
 * and both ends are near the same road, otherwise straight (steering handles the rest).
 * @returns {Array<[number, number]>} waypoints ending at the goal
 */
export function planRoute(system, from, to) {
  const goal = [to.x, to.z], dist = Math.hypot(to.x - from.x, to.z - from.z);
  for (const g of system.graphs.values()) {
    const a = g.nearest(from.x, from.z), b = g.nearest(to.x, to.z);
    if (a >= 0 && b >= 0 && a !== b) { const p = g.path(a, b); if (p) return [...p, goal]; }
  }
  if (dist > TUNING.roadAbove) {
    const a = nearestOnRoads(from.x, from.z), b = nearestOnRoads(to.x, to.z);
    if (a && b && a.r === b.r && a.d < 60 * 60 && b.d < 60 * 60) {
      const step = a.i < b.i ? 1 : -1, out = [];
      for (let i = a.i; i !== b.i; i += step) out.push(a.r.pts[i]);
      out.push(goal);
      return out;
    }
  }
  return [goal];
}

/** Per-NPC steering state. */
export class Navigator {
  constructor(npc) { this.npc = npc; this.route = null; this.i = 0; this.stuck = 0; this.side = 1; this.sideT = 0; this.goal = new THREE.Vector3(); this.arrived = true; }
  /** Head for a world point (routes through graphs/roads when useful). */
  goTo(p, { direct = false } = {}) {
    this.goal.copy(p); this.arrived = false; this.i = 0;
    this.route = direct ? [[p.x, p.z]] : planRoute(this.npc.system, this.npc.position, p);
  }
  stop() { this.route = null; this.arrived = true; }
  /** Distance left to the goal (straight line). */
  get remaining() { return this.arrived ? 0 : Math.hypot(this.goal.x - this.npc.position.x, this.goal.z - this.npc.position.z); }

  /**
   * Steering direction for this frame (unit XZ in `out`), or null when arrived.
   * @param {number} dt @param {number} speed the speed the NPC wants (for stuck detection)
   */
  steer(dt, speed, out) {
    const n = this.npc, p = n.position, g = n.game;
    if (!this.route) return null;
    let wp = this.route[this.i];
    const near = this.i < this.route.length - 1 ? 2.2 : TUNING.arrive;
    if (Math.hypot(wp[0] - p.x, wp[1] - p.z) < near) {
      if (this.i < this.route.length - 1) { this.i++; wp = this.route[this.i]; } else { this.arrived = true; this.route = null; return null; }
    }
    out.set(wp[0] - p.x, 0, wp[1] - p.z).normalize();
    // feelers: veer away from what's ahead
    let push = 0;
    const yaw = Math.atan2(-out.x, -out.z);
    for (const [a, len] of TUNING.feelers) {
      _o.set(p.x, p.y + 0.9, p.z); _d.set(-Math.sin(yaw + a), 0, -Math.cos(yaw + a));
      const hit = g.physics.raycast(_o, _d, len, RAY);
      if (hit) push += (a === 0 ? this.side : -Math.sign(a)) * (1 - hit.distance / len);
    }
    if (push) { const t = yaw + push * TUNING.avoidTurn; out.set(-Math.sin(t), 0, -Math.cos(t)); }
    // separation from other people nearby
    for (const o of n.system.nearbyNPCs(n, TUNING.separation)) {
      _v.subVectors(p, o.position).setY(0); const d = _v.length();
      if (d > 1e-3) out.addScaledVector(_v.divideScalar(d), (TUNING.separation - d) * TUNING.separationGain);
    }
    out.setY(0).normalize();
    // stuck: barely moving while trying → sidestep the other way for a moment
    if (speed > 0.5 && n.groundSpeed < TUNING.stuckSpeed) { this.stuck += dt; if (this.stuck > TUNING.stuckTime) { this.stuck = 0; this.side *= -1; this.sideT = TUNING.sidestep; } }
    else this.stuck = Math.max(0, this.stuck - dt);
    if (this.sideT > 0) { this.sideT -= dt; const t = Math.atan2(-out.x, -out.z) + this.side * 1.2; out.set(-Math.sin(t), 0, -Math.cos(t)); }
    return out;
  }
}
