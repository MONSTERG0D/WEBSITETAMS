import * as THREE from 'three';

/**
 * Lightweight physics: static colliders in a spatial grid, capsule movement with sliding and step-up,
 * and raycasts against colliders, terrain and hittable entity meshes.
 * Collider positions: box = center, cylinder = bottom center (vertical), sphere = center.
 */
export const TUNING = { gravity: 24, stepHeight: 0.35, cellSize: 32, iterations: 3, maxSlope: 48 };

const _n = new THREE.Vector3(), _tmp = new THREE.Vector3(), _ray = new THREE.Raycaster(), _slope = new THREE.Vector3();
const RESULT = { position: null, grounded: false, hitWall: false, groundY: 0, surface: 'grass' };
const cellKey = (x, z) => (x + 32768) * 65536 + (z + 32768);

export class Physics {
  constructor(game) {
    this.game = game; this.colliders = new Set(); this.grid = new Map();
    this._nextId = 1; this._stamp = 0; this._near = []; this._hitObjects = [];
  }
  get gravity() { return TUNING.gravity; }

  /** @param {{type?:'box'|'cylinder'|'sphere', position, size?, radius?, height?, rotationY?, surface?, tag?, object?}} desc */
  addCollider(desc = {}) {
    const c = {
      id: this._nextId++, type: desc.type || 'box',
      position: new THREE.Vector3().copy(desc.position || _tmp.set(0, 0, 0)),
      size: new THREE.Vector3().copy(desc.size || _tmp.set(1, 1, 1)),
      radius: desc.radius ?? 0.5, height: desc.height ?? 2, rotationY: desc.rotationY || 0,
      surface: desc.surface || 'wood', tag: desc.tag ?? null, object: desc.object || null, keys: [], stamp: 0,
    };
    c.cos = Math.cos(c.rotationY); c.sin = Math.sin(c.rotationY);
    this._bounds(c); this._insert(c); this.colliders.add(c);
    return c;
  }
  removeCollider(c) {
    if (!c || !this.colliders.has(c)) return;
    for (const k of c.keys) {
      const cell = this.grid.get(k);
      if (!cell) continue;
      const i = cell.indexOf(c);
      if (i >= 0) cell.splice(i, 1);
      if (!cell.length) this.grid.delete(k);
    }
    this.colliders.delete(c);
  }
  /** Colliders whose bounds overlap the XZ rectangle. The returned array is reused: copy it if you keep it. */
  query(minX, minZ, maxX, maxZ) {
    const out = this._near; out.length = 0;
    const s = TUNING.cellSize, stamp = ++this._stamp;
    for (let x = Math.floor(minX / s), x1 = Math.floor(maxX / s); x <= x1; x++) {
      for (let z = Math.floor(minZ / s), z1 = Math.floor(maxZ / s); z <= z1; z++) {
        const cell = this.grid.get(cellKey(x, z));
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) { const c = cell[i]; if (c.stamp !== stamp) { c.stamp = stamp; out.push(c); } }
      }
    }
    return out;
  }

  /**
   * Move a vertical capsule (feet at pos.y). Mutates pos and vel. Returns a shared result object.
   * opts: { wasGrounded, noGravity, stepHeight, maxSlope (degrees; terrain steeper than this can't be climbed) }
   */
  moveCapsule(pos, vel, radius, height, dt, opts = {}) {
    const step = opts.stepHeight ?? TUNING.stepHeight, feet = pos.y, terrain = this.game.sys('terrain');
    pos.x += vel.x * dt; pos.z += vel.z * dt;
    let hitWall = false;
    for (let it = 0; it < TUNING.iterations; it++) {
      const near = this.query(pos.x - radius - 0.5, pos.z - radius - 0.5, pos.x + radius + 0.5, pos.z + radius + 0.5);
      let moved = false;
      for (let i = 0; i < near.length; i++) {
        const c = near[i];
        if (c.maxY <= feet + step || c.minY >= feet + height) continue;
        if (this._pushOut(c, pos, radius)) {
          moved = true; hitWall = true;
          const vn = vel.x * _n.x + vel.z * _n.z;
          if (vn < 0) { vel.x -= vn * _n.x; vel.z -= vn * _n.z; }
        }
      }
      if (!moved) break;
    }
    // Slope limit: cliffs and mesa walls can't be walked up; the uphill part of the move is dropped.
    if (opts.wasGrounded && !terrain.isFallback && terrain.getNormalAt) {
      const nrm = terrain.getNormalAt(pos.x, pos.z, _slope);
      if (nrm.y < Math.cos(((opts.maxSlope ?? TUNING.maxSlope) * Math.PI) / 180)) {
        const hl = Math.hypot(nrm.x, nrm.z) || 1, ux = -nrm.x / hl, uz = -nrm.z / hl, into = vel.x * ux + vel.z * uz;
        if (into > 0) { pos.x -= ux * into * dt; pos.z -= uz * into * dt; vel.x -= ux * into; vel.z -= uz * into; }
      }
    }
    if (!opts.noGravity) vel.y -= TUNING.gravity * dt;
    pos.y += vel.y * dt;
    let groundY = terrain.getHeightAt(pos.x, pos.z), surface = null;
    const under = this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius);
    for (let i = 0; i < under.length; i++) {
      const c = under[i];
      if (c.maxY > feet + step + 0.05 || c.maxY <= groundY) continue;
      const top = this._topAt(c, pos.x, pos.z, radius * 0.6);
      if (top !== null && top > groundY) { groundY = top; surface = c.surface; }
    }
    const snap = opts.wasGrounded && vel.y <= 0 ? step : 0.02;
    let grounded = false;
    if (pos.y <= groundY + snap && vel.y <= 0) { pos.y = groundY; vel.y = 0; grounded = true; }
    RESULT.position = pos; RESULT.grounded = grounded; RESULT.hitWall = hitWall; RESULT.groundY = groundY;
    RESULT.surface = surface || terrain.getSurfaceAt(pos.x, pos.z);
    return RESULT;
  }

  /**
   * Nearest hit along a ray (dir must be normalized).
   * opts: { ignoreEntities, ignore (entity), ignoreTag }
   * @returns {{point, normal, distance, entity, hitZone, surface, collider}|null}
   */
  raycast(origin, dir, maxDist = 1000, opts = {}) {
    let best = null, bestD = maxDist;
    const ex = origin.x + dir.x * maxDist, ez = origin.z + dir.z * maxDist;
    const near = this.query(Math.min(origin.x, ex), Math.min(origin.z, ez), Math.max(origin.x, ex), Math.max(origin.z, ez));
    for (let i = 0; i < near.length; i++) {
      const c = near[i];
      if (opts.ignoreTag && c.tag === opts.ignoreTag) continue;
      const d = this._rayCollider(c, origin, dir, bestD);
      if (d !== null && d < bestD) { bestD = d; best = { distance: d, normal: _n.clone(), surface: c.surface, collider: c, entity: null, hitZone: null }; }
    }
    const th = this.game.sys('terrain').raycast?.(origin, dir, bestD);
    if (th && th.distance < bestD) {
      bestD = th.distance;
      best = { distance: th.distance, normal: th.normal ? new THREE.Vector3().copy(th.normal) : new THREE.Vector3(0, 1, 0), surface: th.surface || 'dirt', collider: null, entity: null, hitZone: null };
    }
    if (!opts.ignoreEntities) {
      const objects = this.game.entities.hittableObjects(this._hitObjects);
      if (objects.length) {
        _ray.set(origin, dir); _ray.near = 0; _ray.far = bestD;
        const hits = _ray.intersectObjects(objects, true);
        for (const h of hits) {
          let o = h.object, entity = null, zone = null;
          while (o && !entity) { zone = zone || o.userData?.hitZone || null; entity = o.userData?.entity || null; o = o.parent; }
          if (!entity || entity === opts.ignore) continue;
          const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
          best = { distance: h.distance, normal, surface: 'flesh', collider: null, entity, hitZone: zone || 'torso', object: h.object }; // object: Added in Part 6 (arrows stick to it)
          bestD = h.distance;
          break;
        }
      }
    }
    if (best) best.point = new THREE.Vector3().copy(origin).addScaledVector(dir, best.distance);
    return best;
  }

  // ---------- internals ----------
  _bounds(c) {
    const p = c.position;
    let r;
    if (c.type === 'box') { r = Math.hypot(c.size.x / 2, c.size.z / 2); c.minY = p.y - c.size.y / 2; c.maxY = p.y + c.size.y / 2; }
    else if (c.type === 'cylinder') { r = c.radius; c.minY = p.y; c.maxY = p.y + c.height; }
    else { r = c.radius; c.minY = p.y - r; c.maxY = p.y + r; }
    c.minX = p.x - r; c.maxX = p.x + r; c.minZ = p.z - r; c.maxZ = p.z + r;
  }
  _insert(c) {
    const s = TUNING.cellSize;
    for (let x = Math.floor(c.minX / s), x1 = Math.floor(c.maxX / s); x <= x1; x++) {
      for (let z = Math.floor(c.minZ / s), z1 = Math.floor(c.maxZ / s); z <= z1; z++) {
        const k = cellKey(x, z);
        let cell = this.grid.get(k);
        if (!cell) { cell = []; this.grid.set(k, cell); }
        cell.push(c); c.keys.push(k);
      }
    }
  }
  /** Push pos out of collider c in XZ; sets _n to the push normal. */
  _pushOut(c, pos, r) {
    const dx = pos.x - c.position.x, dz = pos.z - c.position.z;
    if (c.type === 'box') {
      const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos, hx = c.size.x / 2, hz = c.size.z / 2;
      const ex = lx - Math.max(-hx, Math.min(hx, lx)), ez = lz - Math.max(-hz, Math.min(hz, lz));
      const d2 = ex * ex + ez * ez;
      if (d2 >= r * r) return false;
      let px, pz;
      if (d2 > 1e-10) { const d = Math.sqrt(d2), pen = r - d; px = (ex / d) * pen; pz = (ez / d) * pen; }
      else {
        const ox = hx - Math.abs(lx), oz = hz - Math.abs(lz);
        if (ox < oz) { px = (ox + r) * (lx >= 0 ? 1 : -1); pz = 0; } else { px = 0; pz = (oz + r) * (lz >= 0 ? 1 : -1); }
      }
      const wx = px * c.cos + pz * c.sin, wz = -px * c.sin + pz * c.cos, len = Math.hypot(wx, wz) || 1;
      pos.x += wx; pos.z += wz; _n.set(wx / len, 0, wz / len);
      return true;
    }
    const rr = c.radius + r, d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr) return false;
    const d = Math.sqrt(d2), nx = d > 1e-5 ? dx / d : 1, nz = d > 1e-5 ? dz / d : 0;
    pos.x += nx * (rr - d); pos.z += nz * (rr - d); _n.set(nx, 0, nz);
    return true;
  }
  _topAt(c, x, z, tol) {
    const dx = x - c.position.x, dz = z - c.position.z;
    if (c.type === 'box') {
      const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
      return Math.abs(lx) <= c.size.x / 2 + tol && Math.abs(lz) <= c.size.z / 2 + tol ? c.maxY : null;
    }
    const d2 = dx * dx + dz * dz;
    if (c.type === 'cylinder') return d2 <= (c.radius + tol) ** 2 ? c.maxY : null;
    return d2 <= c.radius * c.radius ? c.position.y + Math.sqrt(c.radius * c.radius - d2) : null;
  }
  /** Ray vs collider. Returns distance or null and sets _n to the surface normal. */
  _rayCollider(c, o, d, maxD) {
    const px = o.x - c.position.x, py = o.y - c.position.y, pz = o.z - c.position.z;
    if (c.type === 'box') {
      const lox = px * c.cos - pz * c.sin, loz = px * c.sin + pz * c.cos, ldx = d.x * c.cos - d.z * c.sin, ldz = d.x * c.sin + d.z * c.cos;
      const h = [c.size.x / 2, c.size.y / 2, c.size.z / 2], oo = [lox, py, loz], dd = [ldx, d.y, ldz];
      let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 0;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(dd[a]) < 1e-9) { if (oo[a] < -h[a] || oo[a] > h[a]) return null; continue; }
        let t1 = (-h[a] - oo[a]) / dd[a], t2 = (h[a] - oo[a]) / dd[a], s = -1;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return null;
      }
      if (tmin < 0 || tmin > maxD || axis < 0) return null;
      const nl = [0, 0, 0]; nl[axis] = sign;
      _n.set(nl[0] * c.cos + nl[2] * c.sin, nl[1], -nl[0] * c.sin + nl[2] * c.cos);
      return tmin;
    }
    if (c.type === 'cylinder') {
      const a = d.x * d.x + d.z * d.z, r = c.radius;
      let best = null;
      if (a > 1e-9) {
        const b = 2 * (px * d.x + pz * d.z), cc = px * px + pz * pz - r * r, disc = b * b - 4 * a * cc;
        if (disc >= 0) {
          const t = (-b - Math.sqrt(disc)) / (2 * a), y = py + t * d.y;
          if (t >= 0 && t <= maxD && y >= 0 && y <= c.height) { best = t; _n.set((px + t * d.x) / r, 0, (pz + t * d.z) / r); }
        }
      }
      if (d.y < -1e-9 && py > c.height) {
        const t = (c.height - py) / d.y, hx = px + t * d.x, hz = pz + t * d.z;
        if (t >= 0 && t <= maxD && hx * hx + hz * hz <= r * r && (best === null || t < best)) { best = t; _n.set(0, 1, 0); }
      }
      return best;
    }
    const b = px * d.x + py * d.y + pz * d.z, cc = px * px + py * py + pz * pz - c.radius * c.radius, disc = b * b - cc;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t < 0 || t > maxD) return null;
    _n.set(px + t * d.x, py + t * d.y, pz + t * d.z).divideScalar(c.radius);
    return t;
  }
}
