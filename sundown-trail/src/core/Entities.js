/** Registry of living things (player, NPCs, animals, horses) shared by combat, AI and UI (entity contract, GAME_BIBLE §11). */
export class Entities {
  constructor(game) { this.game = game; this.list = []; this.map = new Map(); this._next = 1; }
  add(entity) {
    if (!entity.id) entity.id = `e${this._next++}`;
    if (this.map.has(entity.id)) return entity;
    this.map.set(entity.id, entity); this.list.push(entity);
    return entity;
  }
  remove(entity) {
    if (!entity || !this.map.has(entity.id)) return;
    this.map.delete(entity.id);
    const i = this.list.indexOf(entity);
    if (i >= 0) this.list.splice(i, 1);
  }
  byId(id) { return this.map.get(id) || null; }
  /** query({ position, radius, type, faction, alive }) → entities sorted nearest first when a position is given. */
  query({ position = null, radius = Infinity, type = null, faction = null, alive = null } = {}) {
    const out = [], r2 = radius * radius;
    for (const e of this.list) {
      if (type && e.type !== type) continue;
      if (faction && e.faction !== faction) continue;
      if (alive !== null && !!e.alive !== alive) continue;
      if (position && e.position) {
        const dx = e.position.x - position.x, dy = e.position.y - position.y, dz = e.position.z - position.z;
        e._d2 = dx * dx + dy * dy + dz * dz;
        if (e._d2 > r2) continue;
      }
      out.push(e);
    }
    if (position) out.sort((a, b) => a._d2 - b._d2);
    return out;
  }
  /** Fills `out` with object3ds that raycasts may hit (living entities). */
  hittableObjects(out = []) {
    out.length = 0;
    for (const e of this.list) if (e.object3d && e.alive !== false && e.hittable !== false) out.push(e.object3d);
    return out;
  }
}
