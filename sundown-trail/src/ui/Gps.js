/**
 * GPS routes along the road network (Part 14). The roads (terrain.roads: sampled splines, or WORLD.roads' control
 * points as a fallback) become a graph: nodes every ~16 m along each road, edges between neighbours, and junctions
 * wherever a node of one road comes within `join` metres of another road. A route from A to B walks off-road to the
 * nearest road node, follows A* along the roads, and walks off-road again to the goal. Short trips, or trips where
 * the roads would be a long detour, go straight.
 */
export const TUNING = { step: 16, join: 14, offRoadMax: 400, straightBelow: 140, detour: 2.4, simplify: 6 };

export class RoadGraph {
  /** @param {Array<{id, trail?, points: Float32Array|number[][]}>} roads xyz-packed Float32Array or [[x, z], …] */
  constructor(roads, T = TUNING) {
    this.T = T; this.x = []; this.z = []; this.road = []; this.adj = [];
    for (const r of roads) {
      const pts = toXZ(r.points), ids = [];
      // a node every `step` metres along the polyline (control points or a dense spline alike)
      ids.push(this._add(pts[0][0], pts[0][1], r.id));
      let carry = 0;
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az);
        let d = T.step - carry;
        while (d < L) { const t = d / L; ids.push(this._add(ax + (bx - ax) * t, az + (bz - az) * t, r.id)); d += T.step; }
        carry = L - (d - T.step);
      }
      const [lx, lz] = pts[pts.length - 1];
      if (Math.hypot(this.x[ids.at(-1)] - lx, this.z[ids.at(-1)] - lz) > 0.5) ids.push(this._add(lx, lz, r.id));
      for (let i = 1; i < ids.length; i++) this._link(ids[i - 1], ids[i]);
    }
    // junctions between different roads
    const n = this.x.length, j2 = T.join * T.join;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      if (this.road[a] === this.road[b]) continue;
      const d = (this.x[a] - this.x[b]) ** 2 + (this.z[a] - this.z[b]) ** 2;
      if (d < j2) this._link(a, b);
    }
  }
  get size() { return this.x.length; }
  _add(x, z, road) { this.x.push(x); this.z.push(z); this.road.push(road); this.adj.push([]); return this.x.length - 1; }
  _link(a, b) { if (a === b || this.adj[a].some((e) => e[0] === b)) return; const d = Math.hypot(this.x[a] - this.x[b], this.z[a] - this.z[b]); this.adj[a].push([b, d]); this.adj[b].push([a, d]); }
  /** Nearest node to a point. @returns {{ id, d }} */
  nearest(x, z) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.x.length; i++) { const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    return { id: best, d: Math.sqrt(bd) };
  }
  /** A* between two node ids. @returns {number[]|null} node ids */
  path(a, b) {
    if (a < 0 || b < 0) return null;
    const n = this.x.length, g = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
    const h = (i) => Math.hypot(this.x[i] - this.x[b], this.z[i] - this.z[b]);
    const open = [[h(a), a]]; g[a] = 0;
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, cur] = open.splice(bi, 1)[0];
      if (cur === b) { const out = [b]; let c = b; while (from[c] >= 0) { c = from[c]; out.push(c); } return out.reverse(); }
      if (closed[cur]) continue; closed[cur] = 1;
      for (const [nb, d] of this.adj[cur]) { const ng = g[cur] + d; if (ng < g[nb]) { g[nb] = ng; from[nb] = cur; open.push([ng + h(nb), nb]); } }
    }
    return null;
  }
  /**
   * A route between two world points: [[x, z], …] from `from` to `to`, along the roads when that helps.
   * @returns {{ points: number[][], onRoads: boolean, length: number }}
   */
  route(fx, fz, tx, tz) {
    const T = this.T, direct = Math.hypot(tx - fx, tz - fz), straight = { points: [[fx, fz], [tx, tz]], onRoads: false, length: direct };
    if (direct < T.straightBelow || !this.size) return straight;
    const A = this.nearest(fx, fz), B = this.nearest(tx, tz);
    if (A.d > T.offRoadMax || B.d > T.offRoadMax || A.id === B.id) return straight;
    const ids = this.path(A.id, B.id);
    if (!ids) return straight;
    const pts = [[fx, fz], ...ids.map((i) => [this.x[i], this.z[i]]), [tx, tz]];
    const length = pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
    if (length > direct * T.detour && A.d + B.d > direct * 0.5) return straight; // the roads go the long way round
    return { points: simplify(pts, T.simplify), onRoads: true, length };
  }
}

function toXZ(points) {
  if (points instanceof Float32Array || points instanceof Float64Array) { const out = []; for (let i = 0; i < points.length; i += 3) out.push([points[i], points[i + 2]]); return out; }
  return points.map((p) => [p[0], p[p.length === 3 ? 2 : 1]]);
}
/** Drops points that sit within `tol` metres of the line through their neighbours. */
export function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i], c = pts[i + 1], dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz) || 1;
    if (Math.abs((b[0] - a[0]) * dz - (b[1] - a[1]) * dx) / L > tol) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
/** Distance from a point to a polyline. */
export function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}
