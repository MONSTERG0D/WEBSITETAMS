import * as THREE from 'three';
import { WORLD } from '../data/world.js';
import { isBlocked } from './Navigation.js';

/**
 * Who is around (Part 7): NPCs appear and disappear in a ~150 m bubble around Eli, by place and hour, within the
 * quality preset's NPC budget (Low 8, Medium 12, High 24). Areas: Copperbell townsfolk with daily schedules plus
 * Sheriff Amos Pruitt and his deputy (persistent: they never despawn), workers at the lumber camp, traders at
 * Saltmesa, Blackstone guards at the estate gate, the Cinder Boys at their hideout (a camp that stays cleared until the
 * next day), and travelers on the roads (some mounted). New NPCs spawn out of sight (behind the camera or far away).
 * Part 9 fills the towns with buildings and replaces the placeholder spots below with real doors and counters.
 */
export const TUNING = {
  bubble: 150, despawnAt: 180, checkEvery: 1.5, budget: { low: 8, medium: 12, high: 24 },
  minSpawnDist: 45, hiddenDot: 0.35, travelerEvery: 50, travelerChance: 0.55, travelerMounted: 0.5, enabled: true,
};

const L = WORLD.locations;
const pick = (a, r = Math.random) => a[Math.floor(r() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3(), _f = new THREE.Vector3();

/** Copperbell placeholder spots (relative to the town centre) until Part 9 builds the town. */
const CB = (dx, dz) => [L.copperbell.x + dx, L.copperbell.z + dz];
const TOWN = {
  saloon: CB(14, 10), store: CB(-12, 8), office: CB(10, -14), church: CB(-22, -18), stable: CB(-18, 22), well: CB(0, 0),
  homes: [CB(26, 26), CB(-30, 30), CB(30, -26), CB(-34, -6)],
};
const townsfolk = (i) => {
  const home = TOWN.homes[i % TOWN.homes.length], work = pick([TOWN.store, TOWN.stable, TOWN.church, TOWN.well]);
  const seat = TOWN.seats?.length ? TOWN.seats[(i * 3) % TOWN.seats.length] : { at: TOWN.saloon, yaw: undefined };
  return [
    { from: 22, to: 6, at: home, anim: null },
    { from: 6, to: 8, at: home, anim: null },
    { from: 8, to: 12, at: work, anim: Math.random() < 0.5 ? 'stand' : 'talk' },
    { from: 12, to: 13, at: seat.at, anim: 'sit', yaw: seat.yaw },
    { from: 13, to: 18, at: work, anim: null },
    { from: 18, to: 22, at: seat.at, anim: 'sit', yaw: seat.yaw }, // the saloon fills at night
  ];
};
/** Added in Part 9: real spots from the built town (seats in the saloon, homes, counters, the sheriff's desk). */
function syncTown(towns) {
  const s = towns?.spots?.('copperbell');
  if (!s) return false;
  const xz = (p) => [p.x, p.z];
  if (s.seats.length) TOWN.seats = s.seats.map((q) => ({ at: xz(q.pos), yaw: q.yaw }));
  if (s.homes.length) TOWN.homes = s.homes.map((h) => xz(h.pos));
  const w = s.work;
  if (w.general) TOWN.store = xz(w.general.counter);
  if (w.sheriff) { TOWN.office = xz(w.sheriff.keeper); TOWN.officeYaw = w.sheriff.yaw; }
  if (w.stable) TOWN.stable = xz(w.stable.counter);
  if (s.well) TOWN.well = xz(s.well);
  if (s.street.length > 4) TOWN.patrol = [s.street[1], s.street[Math.floor(s.street.length / 2)], s.street[s.street.length - 2]].map(xz);
  return true;
}

/**
 * Areas: where (x, z, radius), how many by hour, and the def for the i-th NPC.
 * `persistent` areas spawn once and keep their people; `camp` areas stay cleared for the day once everyone is dead.
 */
const AREAS = [
  {
    id: 'copperbell', x: L.copperbell.x, z: L.copperbell.z, r: 60,
    count: (h) => (h >= 6 && h < 22 ? 7 : 3),
    def: (i) => ({ role: pick(['townsman', 'townswoman', 'worker', 'gentleman', 'farmer', 'preacher', 'bartender']), faction: 'civilian', schedule: townsfolk(i), wanderRadius: 14, home: TOWN.homes[i % 4] }),
  },
  {
    id: 'copperbellLaw', x: L.copperbell.x, z: L.copperbell.z, r: 60, persistent: true, count: () => 2,
    def: (i) => i === 0
      ? { id: 'pruitt', name: 'Sheriff Amos Pruitt', role: 'lawman', faction: 'law', persistent: true, weapon: ['revolver', 'repeater'], accuracy: 0.8, aggression: 0.7, health: 150, home: TOWN.office,
        schedule: [{ from: 21, to: 6, at: TOWN.office, anim: 'sit', yaw: TOWN.officeYaw }, { from: 9, to: 12, at: TOWN.office, anim: 'sit', yaw: TOWN.officeYaw }, { from: 6, to: 9, anim: 'patrol', at: TOWN.office, route: TOWN.patrol || [TOWN.office, CB(20, 18), CB(-20, 18), CB(-20, -18)] }, { from: 12, to: 21, anim: 'patrol', at: TOWN.office, route: TOWN.patrol || [TOWN.office, CB(20, 18), CB(-20, 18), CB(-20, -18)] }] }
      : { id: 'deputy', name: 'Deputy Hale', role: 'lawman', faction: 'law', persistent: true, weapon: ['revolver'], aggression: 0.6, home: TOWN.office,
        patrol: TOWN.patrol ? [...TOWN.patrol].reverse() : [CB(0, 30), CB(30, 0), CB(0, -30), CB(-30, 0)] },
  },
  {
    id: 'cinder', x: L.cinderHideout.x, z: L.cinderHideout.z, r: 30, camp: true, count: () => 6,
    def: (i) => ({ role: i === 0 ? 'outlaw' : pick(['outlaw', 'outlaw', 'gambler', 'cowboy']), faction: 'cinder', hostile: true, weapon: [i % 3 === 2 ? 'repeater' : i % 4 === 3 ? 'shotgun' : 'revolver'], aggression: 0.75 + Math.random() * 0.3, wanderRadius: 10, sight: 1.05 }),
  },
  {
    id: 'estateGate', x: L.blackstoneEstate.x - 40, z: L.blackstoneEstate.z - 10, r: 18, count: () => 3,
    def: (i) => ({ role: 'thug', faction: 'blackstone', weapon: [i === 0 ? 'repeater' : 'revolver'], wander: false, aggression: 0.8 }),
  },
  {
    id: 'saltmesa', x: L.saltmesaPost.x, z: L.saltmesaPost.z, r: 25, count: (h) => (h >= 7 && h < 20 ? 4 : 1),
    def: () => ({ role: pick(['townsman', 'ranchwoman', 'farmer', 'gambler']), faction: 'civilian', wanderRadius: 12 }),
  },
  {
    id: 'lumber', x: L.lumberCamp.x, z: L.lumberCamp.z, r: 30, count: (h) => (h >= 6 && h < 19 ? 5 : 2),
    def: () => ({ role: 'worker', faction: 'civilian', wanderRadius: 16 }),
  },
];

export class Spawner {
  constructor(system) {
    this.system = system; this.game = system.game; this.t = 0; this.travelT = TUNING.travelerEvery * 0.5;
    this.active = new Map(); // areaId → Set<NPC>
    this.cleared = {}; // camp areaId → day it was cleared
    this.travelers = new Set();
  }
  get budget() { return TUNING.budget[this.game.quality?.name] ?? TUNING.budget.medium; }
  /** Non-persistent NPCs currently alive. */
  get load() { let k = 0; for (const n of this.system.list) if (!n.persistent && !n.dead) k++; return k; }

  update(dt) {
    if (!TUNING.enabled) return;
    if (!this._synced) this._synced = syncTown(this.game.get('towns')) || !this.game.get('towns');
    this.t -= dt; this.travelT -= dt;
    if (this.t > 0) return;
    this.t = TUNING.checkEvery;
    const g = this.game, pp = g.player.position, sky = g.sys('sky'), hour = sky.timeOfDay ?? 12, day = sky.day ?? 0;
    for (const A of AREAS) {
      let set = this.active.get(A.id);
      const d = Math.hypot(A.x - pp.x, A.z - pp.z) - A.r;
      if (d > TUNING.despawnAt) { // gone from the bubble
        if (set && !A.persistent) { for (const n of set) if (!n.persistent) this.system.despawn(n); this.active.delete(A.id); }
        continue;
      }
      if (d > TUNING.bubble) continue;
      if (!set) this.active.set(A.id, (set = new Set()));
      for (const n of set) if (!this.system.list.includes(n)) set.delete(n);
      if (A.camp) {
        if (this.cleared[A.id] === day) continue;
        if (set.size && [...set].every((n) => n.dead)) { this.cleared[A.id] = day; continue; }
        if (set.size) continue; // a camp spawns as one group
      }
      const want = A.count(hour), living = [...set].filter((n) => !n.dead).length;
      for (let i = living; i < want; i++) {
        if (!A.persistent && this.load >= this.budget) break;
        const def = A.def(i);
        if (def.id && this.system.byId.has(def.id)) { set.add(this.system.byId.get(def.id)); continue; }
        const p = this._spot(A, set.size === 0 && (A.camp || A.persistent));
        if (!p) break;
        def.position = { x: p.x, z: p.z }; if (!def.home) def.home = [p.x, p.z];
        def.seed = def.seed ?? `${A.id}:${i}:${day}`;
        const n = this.system.spawn(def);
        if (this.system._saved?.has(n.id)) this.system.restore(n, this.system._saved.get(n.id));
        set.add(n);
      }
      // the hour changed and fewer are wanted: send extras away quietly (despawn out of sight)
      if (!A.persistent && !A.camp && living > want) {
        for (const n of set) if (living > want && !n.dead && !n.brain.busy && !this._seen(n.position)) { this.system.despawn(n); set.delete(n); break; }
      }
    }
    this._travelers(pp);
  }

  /** A free spot in the area: off the roads' middle, not in water, not inside a collider; out of sight when possible. */
  _spot(A, any) {
    const T = this.game.sys('terrain'), phys = this.game.physics;
    for (let k = 0; k < 24; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * A.r, x = A.x + Math.cos(a) * r, z = A.z + Math.sin(a) * r;
      if (T.isWater?.(x, z)) continue;
      if (isBlocked(phys, x, z)) continue;
      if (!any && k < 16 && this._seen(_v.set(x, T.getHeightAt(x, z), z))) continue;
      return { x, z };
    }
    return null;
  }
  /** Could Eli plausibly see this point now? (in front of the camera and close) */
  _seen(p) {
    const g = this.game, cam = g.camera;
    cam.getWorldDirection(_f);
    const dx = p.x - g.player.position.x, dz = p.z - g.player.position.z, d = Math.hypot(dx, dz);
    if (d < TUNING.minSpawnDist * 0.5) return true;
    if (d > TUNING.bubble) return false;
    return (dx * _f.x + dz * _f.z) / d > TUNING.hiddenDot && d < TUNING.minSpawnDist * 2.5;
  }

  /** Travelers on the roads: walk or ride from out of sight toward a town, and vanish when far. */
  _travelers(pp) {
    for (const n of this.travelers) if (!this.system.list.includes(n) || n.position.distanceTo(pp) > TUNING.despawnAt || (n.arrived && n.brain.calm && !this._seen(n.position))) {
      if (this.system.list.includes(n)) this.system.despawn(n);
      this.travelers.delete(n);
    }
    if (this.travelT > 0) return;
    this.travelT = TUNING.travelerEvery * rand(0.6, 1.4);
    if (Math.random() > TUNING.travelerChance || this.load >= this.budget) return;
    const T = this.game.sys('terrain');
    if (!T.getRoadInfo?.(pp.x, pp.z) || T.getRoadInfo(pp.x, pp.z).distance > 120) return;
    // a road point 90–140 m away, out of sight, heading past Eli toward the far end of the road
    const road = pick(WORLD.roads);
    const pts = road.points;
    let best = null;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pp.x, pts[i][1] - pp.z);
      if (d > 80 && d < 160 && !this._seen(_v.set(pts[i][0], 0, pts[i][1]))) { best = i; break; }
    }
    if (best === null) return;
    const toEnd = best < pts.length / 2 ? pts[pts.length - 1] : pts[0];
    const mounted = Math.random() < TUNING.travelerMounted && this.game.get('horses');
    const def = {
      role: pick(['cowboy', 'rancher', 'farmer', 'gentleman', 'ranchwoman', 'townsman']), faction: 'civilian', start: 'travel',
      position: { x: pts[best][0] + rand(-2, 2), z: pts[best][1] + rand(-2, 2) }, destination: toEnd, mounted,
      weapon: Math.random() < 0.4 ? ['revolver'] : [], seed: `traveler:${Math.random().toString(36).slice(2, 7)}`,
    };
    const n = this.system.spawn(def);
    if (n) { if (n.horse) n.gait = 'run'; this.travelers.add(n); }
  }

  serialize() { return { cleared: { ...this.cleared } }; }
  deserialize(d) { if (d?.cleared) this.cleared = { ...d.cleared }; }
  dispose() { this.active.clear(); this.travelers.clear(); }
}
