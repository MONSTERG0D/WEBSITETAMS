import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { WORLD, WORLD_SEED } from '../data/world.js';
import { PropBuilder } from '../world/props/Kit.js';
import { barrel, crate, haystack, wagon, fence, rng } from '../world/props/Builders.js';
import { NavGraph, isBlocked } from '../ai/Navigation.js';
import { createTownKit, buildBuilding, buildStable, buildSmithy, buildCourthouse, buildChurch, boardwalk, lampPost, frame, hash } from './Buildings.js';
import { furnish } from './Interiors.js';
import { adobeBuilding, well, windmill, horno, saguaro, adobeWall, corral, skullPost, laundry, pine, stump, logDeck, lumberStack, sawdustPile, waterTower, steamDonkey, tent, firewood, outhouse, logSled, flagpole } from './Outposts.js';
import { createSignAtlas, createPosterAtlas, WANTED } from './Signs.js';
import { OFFICES } from '../ai/LawSystem.js';

/**
 * The 'towns' system (Part 9, GAME_BIBLE §11): zoneAt(position) · buildings(zone) · doorAt(position).
 * Builds Copperbell on its pad along the Fort Granger road (a crossroads where the other roads meet, Crane's
 * courthouse closing the west end), Saltmesa Trading Post (adobe, around a plaza) and Greywind Lumber Camp. Lots
 * that would sit on a road, in the river or on a prop are shifted or skipped. Per town: one merged mesh per
 * material for the exteriors and another for the interiors (hidden from afar), instanced door leaves that swing
 * (E for Eli, automatic for NPCs, colliders while shut), lanterns and windows that light at dusk (halos everywhere,
 * a few real lights nearest the camera), chimney smoke, forge sparks, dust in the saloon, bounty boards with
 * posters (Eli's own once he has a price on his head), shopkeepers on schedules, interactions at counters, tubs,
 * beds and boards (Shops.js handles them), a waypoint graph for NPCs, and zone events with interior reverb and
 * music-mood hooks.
 */
export const TUNING = {
  /** What a locked door says when tried, by building kind (Part 9 addition). */
  locked: { default: 'Locked.', house: "Locked. It's somebody's home.", bank: 'The bank is barred and shuttered.', post: 'Closed to callers. Notices go on the board outside.', church: 'Locked between services.', courthouse: 'The courthouse doors are locked.', doctor: 'The doctor sees folks at the counter out front.', butcher: 'The butcher sells from the counter out front.', stable: "The tack room's locked. Ask at the counter." },
  street: 12, boardwalk: 2.6, lampEvery: 15, lampDist: 13.4, interiorsDist: 150, lights: { low: 0, medium: 2, high: 4 },
  lightIntensity: 7, lightRange: 11, lightRefresh: 0.25, duskDaylight: 0.42, windowGlow: 0.85, lampGlow: 2.4,
  doorOpen: 1.55, doorSpeed: 4, doorAuto: 1.5, doorClose: 4, zoneEvery: 0.25,
};

const L = WORLD.locations;
const V = (x, z) => new THREE.Vector3(x, 0, z);

/** Copperbell lots: along the street axis (metres from the crossroads), side (−1 north, +1 south), kind and size. */
const COPPERBELL = [
  { id: 'general', kind: 'general', at: 15, side: -1, w: 12, d: 14, interior: true, paint: 'paintGreen', sign: 'general', falseFront: true, awning: true, hitch: true, shop: 'cb_general', chimney: true },
  { id: 'gunsmith', kind: 'gunsmith', at: 29.5, side: -1, w: 9, d: 11, interior: true, paint: 'paintBlue', sign: 'gunsmith', falseFront: true, shop: 'cb_gunsmith' },
  { id: 'sheriff', kind: 'sheriff', at: 42, side: -1, w: 11, d: 11, interior: true, paint: 'paintOchre', sign: 'sheriff', roof: 'flat', hitch: true, trough: true, board: true, shop: 'cb_sheriff' },
  { id: 'post', kind: 'post', at: 54, side: -1, w: 9, d: 9, paint: 'paintWhite', sign: 'post', falseFront: true, board: true, shop: 'cb_post' },
  { id: 'butcher', kind: 'butcher', at: 65, side: -1, w: 8, d: 9, paint: 'paintRed', sign: 'butcher', falseFront: true, awning: true, shop: 'cb_butcher', counterOut: true },
  { id: 'stable', kind: 'stable', at: 75, side: -1, w: 12, d: 13, sign: 'stable', shop: 'cb_stable', corral: true, search: true },
  { id: 'saloon', kind: 'saloon', at: 15, side: 1, w: 14, d: 16, stories: 2, interior: true, paint: 'paintRed', sign: 'saloon', falseFront: true, balcony: true, hitch: true, trough: true, chimney: true, door: { x: 0, w: 1.6, batwing: true }, shop: 'cb_saloon' },
  { id: 'hotel', kind: 'hotel', at: 32, side: 1, w: 12, d: 14, stories: 2, interior: true, paint: 'paintWhite', sign: 'hotel', falseFront: true, balcony: true, chimney: true, shop: 'cb_hotel' },
  { id: 'bank', kind: 'bank', at: 46, side: 1, w: 10, d: 10, paint: 'brick', sign: 'bank', roof: 'flat' },
  { id: 'doctor', kind: 'doctor', at: 58, side: 1, w: 8, d: 9, paint: 'paintBlue', sign: 'doctor', falseFront: true, shop: 'cb_doctor', counterOut: true },
  { id: 'house1', kind: 'house', at: 68, side: 1, w: 7, d: 8, paint: 'paintOchre', roof: 'gableSide', chimney: true, search: true },
  { id: 'smithy', kind: 'blacksmith', at: -15, side: 1, w: 10, d: 8, sign: 'blacksmith' },
  { id: 'church', kind: 'church', at: -31, side: 1, w: 9, d: 15, sign: 'church', search: true },
  { id: 'house2', kind: 'house', at: -18, side: -1, w: 7, d: 8, paint: 'paintWhite', roof: 'gableSide', chimney: true },
  { id: 'house3', kind: 'house', at: -30, side: -1, w: 8, d: 8, paint: 'paintBlue', roof: 'gableSide', chimney: true, search: true },
  { id: 'house4', kind: 'house', at: 22, side: 1, back: 20, w: 7, d: 8, paint: 'paintGreen', roof: 'gableSide', chimney: true, porch: false },
  { id: 'house5', kind: 'house', at: 50, side: -1, back: 18, w: 7, d: 7, paint: 'paintWhite', roof: 'gableSide', chimney: true, porch: false },
  { id: 'house6', kind: 'house', at: 75, side: 1, back: 16, w: 8, d: 8, paint: 'paintRed', roof: 'gableSide', chimney: true, porch: false, search: true },
];

export default class TownSystem extends System {
  constructor(game) {
    super(game);
    this.towns = new Map(); this.doors = []; this.lamps = []; this.interactions = []; this.zone = null; this._zoneT = 0; this._lightT = 0; this.lit = null;
    this.stats = { buildings: 0, tris: 0, meshes: 0, doors: 0, lamps: 0, skipped: [] };
  }

  async init() {
    const g = this.game, T = g.sys('terrain');
    this.terrain = T;
    this.signs = createSignAtlas();
    this.posters = createPosterAtlas(WANTED);
    this.kit = createTownKit(WORLD_SEED, this.signs.tex, this.posters.tex);
    this.group = new THREE.Group(); this.group.name = 'Towns'; g.scene.add(this.group);
    this._defineEffects();
    this._buildCopperbell();
    this._buildSaltmesa();
    this._buildGreywind();
    this._buildDoors();
    this._makeLights();
    for (const t of this.towns.values()) this._registerGraph(t);
    g.events.on(EVENTS.BOUNTY_CHANGED, () => this._refreshPosters());
    g.events.on(EVENTS.GAME_START, () => this._spawnKeepers());
    if (g.state === 'playing') this._spawnKeepers();
    this.stats.doors = this.doors.length; this.stats.lamps = this.lamps.length;
    g.debug?.addTuning('Towns', TUNING);
    console.info(`[towns] ${this.stats.buildings} buildings, ${this.stats.meshes} meshes, ${Math.round(this.stats.tris / 1000)}k triangles, ${this.doors.length} doors, ${this.lamps.length} lamps${this.stats.skipped.length ? `; skipped ${this.stats.skipped.join(', ')}` : ''}`);
  }

  // ---------------------------------------------------------------- Bible API
  /** Where is this point? → { town, name, building, kind, interior, shop } or null outside every town. */
  zoneAt(p) {
    for (const t of this.towns.values()) {
      if (Math.hypot(p.x - t.center.x, p.z - t.center.z) > t.radius) continue;
      for (const b of t.buildings) {
        if (!b.inside || !b.inv) continue;
        const q = _v.copy(p).applyMatrix4(b.inv), I = b.inside;
        if (Math.abs(q.x) < I.w / 2 && Math.abs(q.z) < I.d / 2 && q.y > -0.5 && q.y < I.h + 1) return { town: t.id, name: t.name, building: b.id, kind: b.kind, interior: true, shop: b.spec.shop || null };
      }
      return { town: t.id, name: t.name, building: null, kind: null, interior: false, shop: null };
    }
    return null;
  }
  /** Buildings of a town (zone id or a zone object); all of them without an argument. */
  buildings(zone) {
    const id = typeof zone === 'string' ? zone : zone?.town;
    if (!id) return [...this.towns.values()].flatMap((t) => t.buildings);
    return this.towns.get(id)?.buildings || [];
  }
  /** The door nearest this point within 2.5 m, or null. */
  doorAt(p) {
    let best = null, bd = 2.5;
    for (const d of this.doors) { const dist = d.center.distanceTo(p); if (dist < bd) { bd = dist; best = d; } }
    return best;
  }
  /** Added in Part 9: a building by id (e.g. 'saloon') in a town. */
  building(townId, id) { return this.towns.get(townId)?.buildings.find((b) => b.id === id) || null; }
  /** Added in Part 9: named spots for NPC schedules (homes, seats, work counters, the sheriff's desk, the piano…). */
  spots(townId) { return this.towns.get(townId)?.spots || null; }

  // ---------------------------------------------------------------- building
  _area(town, name) {
    const B = new PropBuilder(this.kit);
    return { B, done: () => {
      const grp = new THREE.Group(); grp.name = `${town.name} ${name}`;
      this.stats.tris += B.build(grp, `${town.id} ${name}`); this.stats.meshes += grp.children.length;
      for (const c of B.colliders) town.colliders.push(this.game.physics.addCollider(c));
      this.group.add(grp);
      return grp;
    } };
  }
  _town(id, name, center, radius) {
    const pad = (this.terrain.pads || []).find((p) => Math.hypot(p.x - center.x, p.z - center.z) < 6);
    const t = { id, name, center: center.clone(), radius, pad, y: pad ? pad.y : this.terrain.getHeightAt(center.x, center.z), buildings: [], colliders: [], lamps: [], spots: { homes: [], seats: [], work: {}, street: [] }, graphNodes: [] };
    t.center.y = t.y;
    this.towns.set(id, t);
    return t;
  }
  /** Is a footprint (with porch) clear of roads, water and props, and on the pad? */
  _clear(t, x, z, yaw, w, d, porch = TUNING.boardwalk, maxDrop = 0.9) {
    const T = this.terrain, c = Math.cos(yaw), s = Math.sin(yaw);
    for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2 + porch], [w / 2, d / 2 + porch], [0, 0], [0, -d / 2], [-w / 2, 0], [w / 2, 0], [0, d / 2 + porch], [-w / 4, 0], [w / 4, 0]]) {
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
      for (const f of t.footprints || []) { // other buildings already placed in this town (with their porches)
        const q = _v.set(px, 0, pz).applyMatrix4(f.inv);
        if (Math.abs(q.x) < f.hw + 0.6 && q.z > -f.hd - 0.6 && q.z < f.hd + f.front + 0.6) { this._why = 'building'; return false; }
      }
      if (T.isWater?.(px, pz)) { this._why = 'water'; return false; }
      const ri = T.getRoadInfo?.(px, pz);
      if (ri && ri.distance < 3.6) { this._why = `road ${lx.toFixed(0)},${lz.toFixed(0)}`; return false; }
      if (t.pad && Math.hypot(px - t.pad.x, pz - t.pad.z) > t.pad.flatRadius + 3) { this._why = 'off pad'; return false; }
      const dh = T.getHeightAt(px, pz) - t.y;
      if (dh > 0.6 || -dh > maxDrop) { this._why = 'slope'; return false; } // ground may fall away under a foundation, never rise into the floor
      if (isBlocked(this.game.physics, px, pz, 0.2)) { this._why = 'prop'; return false; }
    }
    return true;
  }
  _place(t, B, spec) {
    const builders = { stable: buildStable, blacksmith: buildSmithy, sawmill: buildSmithy, courthouse: buildCourthouse, church: buildChurch };
    const info = (spec.builder || builders[spec.kind] || buildBuilding)(B, { ...spec, y: t.y }, this.signs);
    this._foundation(t, B, info);
    info.inv = info.local.M.clone().invert();
    (t.footprints || (t.footprints = [])).push({ inv: info.inv, hw: spec.w / 2, hd: spec.d / 2, front: spec.porch === false ? 0.5 : spec.kind === 'courthouse' ? 3 : TUNING.boardwalk });
    t.buildings.push(info); this.stats.buildings++;
    for (const p of info.lamps) this.lamps.push({ pos: p, town: t, interior: false });
    for (const c of info.chimneys) (t.chimneys || (t.chimneys = [])).push({ pos: c, forge: spec.kind === 'blacksmith' });
    if (info.forge && spec.kind === 'blacksmith') (t.forges || (t.forges = [])).push(info.forge);
    return info;
  }

  _buildCopperbell() {
    const T = this.terrain, C = V(L.copperbell.x, L.copperbell.z);
    const t = this._town('copperbell', 'Copperbell', C, 130);
    // the street runs east between the Fort Granger and estate roads (they fork at the crossroads), n is its south normal
    const u = V(220 - C.x, 50 - C.z).normalize().add(V(200 - C.x, 90 - C.z).normalize()).normalize(), n = V(-u.z, u.x);
    t.axis = u; t.normal = n;
    const ext = this._area(t, 'exterior'), inn = this._area(t, 'interiors');
    const S = TUNING, R = rng(hash('copperbell'));
    const placed = [];
    for (const lot of COPPERBELL) {
      let ok = null;
      const tries = [];
      for (const alt of [{ at: lot.at, side: lot.side, back: lot.back || 0 }, ...(lot.alts || [])]) for (const shift of [0, 3, -3, 6, -6]) tries.push({ ...alt, at: alt.at + shift });
      if (lot.search) { // anywhere near the street, nearest to the planned spot first, never past the courthouse
        const more = [];
        for (let back = 0; back <= 28; back += 4) for (let at = -34; at <= 86; at += 2) for (const side of [-1, 1]) more.push({ at, side, back, cost: Math.abs(at - lot.at) + back * 1.5 + (side !== lot.side ? 6 : 0) });
        tries.push(...more.sort((a, b) => a.cost - b.cost));
      }
      for (const tr of tries) {
        const at = tr.at, dist = S.street + S.boardwalk + lot.d / 2 + tr.back;
        const x = C.x + u.x * at + n.x * tr.side * dist, z = C.z + u.z * at + n.z * tr.side * dist;
        const yaw = Math.atan2(-n.x * tr.side, -n.z * tr.side);
        if (this._clear(t, x, z, yaw, lot.w, lot.d)) { ok = { x, z, yaw, at, side: tr.side }; break; }
      }
      if (!ok) { this.stats.skipped.push(`${lot.id} (${this._why})`); continue; }
      const info = this._place(t, ext.B, { ...lot, x: ok.x, z: ok.z, yaw: ok.yaw });
      info.at = ok.at; info.side = ok.side; placed.push(info);
      if (lot.interior) this._furnish(t, inn.B, info, lot.kind);
      if (lot.board) this._board(t, ext.B, info);
      if (lot.counterOut) this._counterOut(t, ext.B, info);
      if (lot.corral) this._corral(t, ext.B, info, u, n, ok.side, R);
      if (lot.kind === 'house') t.spots.homes.push({ pos: info.front.clone().addScaledVector(_dirOf(info), 1.5 + (lot.porch === false ? 0 : 2.6)), yaw: info.spec.yaw + Math.PI });
    }
    // the courthouse closes the west end of the street
    for (const shift of [0, 4, 8, 12, 16, 20]) {
      const at = -44 + shift, x = C.x + u.x * at, z = C.z + u.z * at, yaw = Math.atan2(u.x, u.z);
      if (this._clear(t, x, z, yaw, 14, 11, 3, 5)) { const ci = this._place(t, ext.B, { id: 'courthouse', kind: 'courthouse', x, z, yaw, w: 14, d: 11, sign: 'courthouse' }); ci.at = at; break; }
      if (shift === 20) this.stats.skipped.push(`courthouse (${this._why})`);
    }
    // boardwalks in the gaps between porches, street lamps, clutter
    for (const side of [-1, 1]) {
      const row = placed.filter((b) => b.side === side && !b.spec.back && ['stable', 'blacksmith', 'church'].indexOf(b.kind) < 0).sort((a, b) => a.at - b.at);
      for (let i = 0; i < row.length - 1; i++) {
        const a0 = row[i].at + row[i].spec.w / 2 + 0.2, a1 = row[i + 1].at - row[i + 1].spec.w / 2 - 0.2;
        if (a1 - a0 < 0.5 || a1 - a0 > 14) continue;
        const mid = (a0 + a1) / 2, dist = S.street + S.boardwalk / 2;
        const x = C.x + u.x * mid + n.x * side * dist, z = C.z + u.z * mid + n.z * side * dist;
        boardwalk(ext.B, x, t.y, z, Math.atan2(-n.x * side, -n.z * side), a1 - a0);
      }
    }
    for (let at = -38; at <= 92; at += S.lampEvery) {
      if (Math.abs(at) < 9) continue;
      for (const side of [-1, 1]) {
        const lat = at + (side > 0 ? S.lampEvery / 2 : 0), x = C.x + u.x * lat + n.x * side * S.lampDist, z = C.z + u.z * lat + n.z * side * S.lampDist;
        if (T.getRoadInfo?.(x, z)?.distance < 3.2 || isBlocked(this.game.physics, x, z, 0.3)) continue;
        this.lamps.push({ pos: lampPost(ext.B, x, t.y, z), town: t, interior: false, post: true });
      }
    }
    for (let k = 0; k < 14; k++) {
      const at = -30 + R() * 120, side = R() < 0.5 ? -1 : 1, dist = S.street + 0.6 + R() * 0.8;
      const x = C.x + u.x * at + n.x * side * dist, z = C.z + u.z * at + n.z * side * dist;
      if (Math.abs(at) < 10 || T.getRoadInfo?.(x, z)?.distance < 3.4 || isBlocked(this.game.physics, x, z, 0.6)) continue;
      const r = R();
      if (r < 0.45) barrel(ext.B, T, x, z, R); else if (r < 0.8) crate(ext.B, T, x, z, R, 1 + Math.floor(R() * 2)); else haystack(ext.B, T, x + n.x * side * 3, z + n.z * side * 3, R);
    }
    const wx = C.x + u.x * 4 + n.x * 30, wz = C.z + u.z * 4 + n.z * 30;
    if (!isBlocked(this.game.physics, wx, wz, 3) && !(T.getRoadInfo?.(wx, wz)?.distance < 5)) wagon(ext.B, T, wx, wz, 0.7, R);
    // spots for schedules: street points, the well (the crossroads)
    for (let at = -36; at <= 90; at += 9) t.spots.street.push(C.clone().addScaledVector(u, at).setY(t.y));
    t.spots.well = C.clone().addScaledVector(n, 6).setY(t.y);
    t.exterior = ext.done(); t.interiors = inn.done();
    // the law pays and jails here now
    const sh = t.buildings.find((b) => b.id === 'sheriff');
    if (sh) { const f = sh.front.clone().addScaledVector(_dirOf(sh), 4); for (const r of ['copperbell', 'blackstone']) Object.assign(OFFICES[r], { x: f.x, z: f.z, name: "Copperbell sheriff's office" }); }
  }

  /**
   * Lays out an outpost from a plan in plaza coordinates (x east, z south of the centre), trying four rotations and
   * a mirror and keeping the one whose buildings clear the roads best; anything still blocked is skipped.
   * plan items: { type: 'adobe'|'frame'|'smithy'|'decor', x, z, yaw, w, d, spec?, build?(B, wx, wy, wz, wyaw) }
 * innB (Part 9 addition): the interiors batch; specs with `interior: true` are hollow and furnished inside.
   */
  _layout(t, B, plan, innB = null) {
    const C = t.center;
    let best = null;
    for (const mirror of [1, -1]) for (let k = 0; k < 4; k++) {
      const th = k * Math.PI / 2;
      let fails = 0;
      for (const it of plan) if (it.w) { const p = this._plazaPt(C, it.x * mirror, it.z, th); if (!this._clear(t, p.x, p.z, th + (mirror < 0 ? -it.yaw : it.yaw), it.w, it.d, it.porch ?? 2.6)) fails++; }
      if (!best || fails < best.fails) best = { th, mirror, fails };
    }
    t.plaza = best;
    const out = [];
    for (const it of plan) {
      const yaw = best.th + (best.mirror < 0 ? -(it.yaw || 0) : it.yaw || 0);
      let p = this._plazaPt(C, it.x * best.mirror, it.z, best.th);
      if (it.w) { // nudge a blocked building around its spot before giving up
        const tries = [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [4, 4], [-4, 4], [4, -4], [-4, -4], [6, 0], [-6, 0], [0, 6], [0, -6], [8, 3], [-8, 3], [3, 8], [3, -8]];
        const ok = tries.find(([dx, dz]) => { const q = this._plazaPt(C, it.x * best.mirror + dx, it.z + dz, best.th); return this._clear(t, q.x, q.z, yaw, it.w, it.d, it.porch ?? 2.6) && (p = q); });
        if (!ok) { this.stats.skipped.push(`${it.spec?.id || it.type} (${this._why})`); continue; }
      }
      if (!it.w && (isBlocked(this.game.physics, p.x, p.z, it.r ?? 0.8) || this.terrain.getRoadInfo?.(p.x, p.z)?.distance < 3.6 + (it.r || 0) || this._inFootprint(t, p.x, p.z, (it.r ?? 0.8) + 0.4) || this.terrain.isWater?.(p.x, p.z))) continue;
      if (it.spec) {
        const kind = it.type === 'adobe' ? 'adobe' : it.spec.kind;
        const info = this._place(t, B, { ...it.spec, x: p.x, z: p.z, yaw, builder: it.type === 'adobe' ? adobeBuilding : undefined, kind });
        info.kind = it.spec.kind;
        if (it.spec.interior && innB) this._furnish(t, innB, info, it.spec.kind);
        else if (it.spec.counterOut) this._counterOut(t, B, info);
        if (it.spec.home) t.spots.homes.push({ pos: info.front.clone().addScaledVector(_dirOf(info), 3), yaw: info.spec.yaw + Math.PI });
        out.push(info);
      } else it.build?.(B, p.x, t.y, p.z, yaw);
    }
    return out;
  }
  /** Is (x, z) within `pad` metres of a building already placed in this town (its porch included)? */
  _inFootprint(t, x, z, pad) {
    for (const f of t.footprints || []) { const q = _v.set(x, 0, z).applyMatrix4(f.inv); if (Math.abs(q.x) < f.hw + pad && q.z > -f.hd - pad && q.z < f.hd + f.front + pad) return true; }
    return false;
  }
  _plazaPt(C, x, z, th) { return V(C.x + x * Math.cos(th) + z * Math.sin(th), C.z - x * Math.sin(th) + z * Math.cos(th)); }

  _buildSaltmesa() {
    const T = this.terrain, C = V(L.saltmesaPost.x, L.saltmesaPost.z), t = this._town('saltmesa', 'Saltmesa Trading Post', C, 70);
    const ext = this._area(t, 'exterior'), inn = this._area(t, 'interiors'), R = rng(hash('saltmesa')), PI = Math.PI;
    const decor = (x, z, r, build) => ({ type: 'decor', x, z, r, build });
    const plan = [
      { type: 'adobe', x: 0, z: -17, yaw: 0, w: 14, d: 10, spec: { id: 'sm_trading', kind: 'trading', w: 14, d: 10, h: 3.6, sign: 'trading', shop: 'sm_store', interior: true, chimney: true } },
      { type: 'adobe', x: -17, z: -2, yaw: PI / 2, w: 11, d: 9, spec: { id: 'sm_cantina', kind: 'cantina', w: 11, d: 9, sign: 'cantina', shop: 'sm_cantina', interior: true, chimney: true } },
      { type: 'adobe', x: -8, z: 16, yaw: PI, w: 7, d: 7, spec: { id: 'sm_butcher', kind: 'butcher', w: 7, d: 7, h: 3, sign: 'butcher', shop: 'sm_butcher', interior: true, parapet: false } },
      { type: 'adobe', x: 8, z: 17, yaw: PI, w: 8, d: 6, spec: { id: 'sm_house1', kind: 'house', w: 8, d: 6, h: 2.9, home: true, windows: 2 } },
      { type: 'adobe', x: 20, z: -15, yaw: -PI / 2, w: 6, d: 6, spec: { id: 'sm_house2', kind: 'house', w: 6, d: 6, h: 2.8, home: true, parapet: false, windows: 1 } },
      { type: 'adobe', x: 15.5, z: 2, yaw: -PI / 2, w: 5, d: 4.5, porch: 0.5, spec: { id: 'sm_stable', kind: 'stable', w: 5, d: 4.5, h: 2.7, sign: 'stable', shop: 'sm_stable', counterOut: true, ramada: false, parapet: false, windows: 0 } },
      decor(27, 5, 2, (B, x, y, z, yaw) => { t.spots.corral = corral(B, x, y, z, yaw, 14, 12, R).setY(y); }),
      decor(0, 1, 1.4, (B, x, y, z, yaw) => { well(B, x, y, z, yaw); t.spots.well = V(x, z).setY(y).add(V(1.8, 0)); }),
      decor(12, -7, 2, (B, x, y, z, yaw) => { (this.fans || (this.fans = [])).push(this.group.add(windmill(B, x, y, z, yaw + 0.6, this.kit)).children.at(-1)); }),
      decor(-10, -11, 1.4, (B, x, y, z, yaw) => { const top = horno(B, x, y, z, yaw + PI / 4); (t.chimneys || (t.chimneys = [])).push({ pos: top, forge: false }); }),
      decor(-21, 7.5, 0.5, (B, x, y, z, yaw) => adobeWall(B, x, y, z, yaw + PI / 2, 7)),
      decor(-17, 11, 0.5, (B, x, y, z, yaw) => adobeWall(B, x, y, z, yaw, 8)),
      decor(-16.5, 7, 0.9, (B, x, y, z) => { const F = frame(B, x, y, z, 0); F.cyl('wood', 0.55, 0.55, 0.05, 0, 0.75, 0, {}, 12); F.cyl('trim', 0.06, 0.06, 0.75, 0, 0, 0, {}, 6); for (let i = 0; i < 3; i++) F.box('wood', 0.4, 0.45, 0.4, Math.cos(i * 2.1) * 0.9, 0.22, Math.sin(i * 2.1) * 0.9); F.col(1.1, 0.8, 1.1, 0, 0.4, 0); }),
      decor(6, 21, 0.4, (B, x, y, z, yaw) => laundry(B, x, y, z, x + Math.cos(yaw) * 5.5, z - Math.sin(yaw) * 5.5)),
      decor(-26, -14, 0.4, (B, x, y, z, yaw) => skullPost(B, x, y, z, yaw)),
      decor(24, -24, 0.4, (B, x, y, z, yaw) => skullPost(B, x, y, z, yaw + 2)),
      decor(9, -9, 3, (B, x, y, z, yaw) => wagon(B, T, x, z, yaw + 2.2, R)),
      decor(-4, -10, 0.6, (B, x, y, z) => { barrel(B, T, x, z, R); barrel(B, T, x + 0.8, z + 0.2, R); crate(B, T, x + 0.4, z + 1.1, R, 2); }),
      decor(4, -10.5, 0.6, (B, x, y, z) => { crate(B, T, x, z, R, 1); barrel(B, T, x + 1, z, R, true); }),
    ];
    // saguaros and boulders around the edge of the post
    for (let k = 0; k < 16; k++) { const a = R() * PI * 2, r = 30 + R() * 14; plan.push(decor(Math.cos(a) * r, Math.sin(a) * r, 0.8, (B, x, y, z) => saguaro(B, x, T.getHeightAt(x, z), z, R))); }
    this._layout(t, ext.B, plan, inn.B);
    for (let k = 0; k < 8; k++) t.spots.street.push(C.clone().add(V(Math.cos(k * 0.785) * 9, Math.sin(k * 0.785) * 9)).setY(t.y));
    t.exterior = ext.done(); t.interiors = inn.done();
  }

  _buildGreywind() {
    const T = this.terrain, C = V(L.lumberCamp.x, L.lumberCamp.z), t = this._town('greywind', 'Greywind Lumber Camp', C, 75);
    const ext = this._area(t, 'exterior'), inn = this._area(t, 'interiors'), R = rng(hash('greywind')), PI = Math.PI;
    const decor = (x, z, r, build) => ({ type: 'decor', x, z, r, build });
    const smoke = (p) => (t.chimneys || (t.chimneys = [])).push({ pos: p, forge: false });
    const plan = [
      { type: 'frame', x: 0, z: -18, yaw: 0, w: 10, d: 8, spec: { id: 'gw_office', kind: 'office', w: 10, d: 8, paint: 'paintOchre', sign: 'lumber', falseFront: true, chimney: true, snow: true, hitch: true, interior: true } },
      { type: 'frame', x: -17, z: -4, yaw: PI / 2, w: 13, d: 7, spec: { id: 'gw_bunk1', kind: 'bunkhouse', w: 13, d: 7, paint: 'grey', roof: 'gableSide', sign: 'bunkhouse', chimney: true, snow: true, home: true, interior: true } },
      { type: 'frame', x: -17, z: 11, yaw: PI / 2, w: 13, d: 7, spec: { id: 'gw_bunk2', kind: 'bunkhouse', w: 13, d: 7, paint: 'grey', roof: 'gableSide', chimney: true, snow: true, home: true, interior: true } },
      { type: 'frame', x: 16, z: -9, yaw: -PI / 2, w: 8, d: 7, spec: { id: 'gw_cook', kind: 'cook', w: 8, d: 7, paint: 'wood', roof: 'gableSide', chimney: true, snow: true, shop: 'gw_cook', interior: true } },
      { type: 'frame', x: 7, z: 19, yaw: PI, w: 16, d: 9, porch: 1, spec: { id: 'gw_sawmill', kind: 'sawmill', w: 16, d: 9, sign: 'sawmill' } },
      decor(15, 5, 2.4, (B, x, y, z, yaw) => smoke(tent(B, x, y, z, yaw - PI / 2))),
      decor(15, 11, 2.4, (B, x, y, z, yaw) => smoke(tent(B, x, y, z, yaw - PI / 2))),
      decor(24, -17, 0.9, (B, x, y, z, yaw) => outhouse(B, x, y, z, yaw - PI / 2)),
      decor(-7, 24, 2, (B, x, y, z, yaw) => waterTower(B, x, y, z, yaw)),
      decor(21, 20, 2.6, (B, x, y, z, yaw) => smoke(steamDonkey(B, x, y, z, yaw + 0.4))),
      decor(-2, 32, 3, (B, x, y, z, yaw) => logDeck(B, x, y, z, yaw, 9, 4, R)),
      decor(-13, 31, 3, (B, x, y, z, yaw) => logDeck(B, x, y, z, yaw + 0.1, 8, 3, R)),
      decor(16, 29, 2, (B, x, y, z, yaw) => lumberStack(B, x, y, z, yaw + 0.2, R)),
      decor(22, 28, 2, (B, x, y, z, yaw) => lumberStack(B, x, y, z, yaw - 0.1, R)),
      decor(2, 26, 1.5, (B, x, y, z) => sawdustPile(B, x, y, z, 2.4)),
      decor(12, 25, 1.2, (B, x, y, z) => sawdustPile(B, x, y, z, 1.6)),
      decor(21, -1, 1.2, (B, x, y, z, yaw) => firewood(B, x, y, z, yaw + PI / 2)),
      decor(-22, 4, 1.2, (B, x, y, z, yaw) => firewood(B, x, y, z, yaw + PI / 2, 3)),
      decor(4, 3, 2.6, (B, x, y, z, yaw) => logSled(B, x, y, z, yaw + 0.5, R)),
      decor(0, -9, 0.4, (B, x, y, z) => flagpole(B, x, y, z)),
      decor(-6, -8, 0.6, (B, x, y, z) => { barrel(B, T, x, z, R); crate(B, T, x + 1, z, R, 2); }),
    ];
    // stumps across the clearing, pines ringing it
    for (let k = 0; k < 34; k++) { const a = R() * PI * 2, r = 12 + R() * 26; plan.push(decor(Math.cos(a) * r, Math.sin(a) * r, 0.6, (B, x, y, z) => stump(B, x, T.getHeightAt(x, z), z, R))); }
    for (let k = 0; k < 46; k++) { const a = (k / 46) * PI * 2 + R() * 0.12, r = 40 + R() * 12; plan.push(decor(Math.cos(a) * r, Math.sin(a) * r, 1.2, (B, x, y, z) => pine(B, x, T.getHeightAt(x, z), z, R, true, 0.85 + R() * 0.4))); }
    const placed = this._layout(t, ext.B, plan, inn.B);
    // the sawmill's working parts: carriage, blade, log on the carriage, sawdust underneath
    const mill = placed.find((b) => b.id === 'gw_sawmill');
    if (mill) {
      const F = mill.local;
      F.box('wood', 12, 0.5, 1.2, 0, 0.9, 0.5); F.cyl('iron', 0.85, 0.85, 0.04, 1.5, 1.2, 0.5, { rx: Math.PI / 2 }, 24);
      F.cyl('barkOak', 0.36, 0.34, 6, -5.5, 1.5, 0.5, { rz: -Math.PI / 2 }, 10);
      F.box('iron', 0.9, 0.9, 0.9, 1.5, 0.6, -0.6); F.cyl('iron', 0.25, 0.25, 1.2, 1.5, 0.6, -1.4, { rx: Math.PI / 2 }, 10);
      for (let i = 0; i < 6; i++) F.cyl('barkOak', 0.32, 0.32, 7, -5 + (i % 3) * 0.7, 0.32 + Math.floor(i / 3) * 0.6, 3.6 + (i % 3) * 0.05, { rz: Math.PI / 2 }, 10);
      F.col(7, 1.3, 2, -5, 0.65, 3.6, { tag: 'logs' });
      F.box('snow', 16.4, 0.1, 9.4, 0, 3.78, 0, { rx: -0.15 });
    }
    for (let k = 0; k < 8; k++) t.spots.street.push(C.clone().add(V(Math.cos(k * 0.785) * 8, Math.sin(k * 0.785) * 8)).setY(t.y));
    t.spots.well = C.clone();
    t.exterior = ext.done(); t.interiors = inn.done();
  }

  /** Places outpost buildings around a plaza, facing its centre, avoiding the roads. */
  _ring(t, B, lots, radius, R) {
    const C = t.center;
    let a = R() * Math.PI * 2;
    for (const lot of lots) {
      let placed = null;
      for (let k = 0; k < 18 && !placed; k++) {
        const ang = a + k * 0.35, r = radius + lot.d / 2, x = C.x + Math.cos(ang) * r, z = C.z + Math.sin(ang) * r, yaw = Math.atan2(C.x - x, C.z - z);
        if (this._clear(t, x, z, yaw, lot.w, lot.d)) placed = { x, z, yaw, ang };
      }
      if (!placed) { this.stats.skipped.push(lot.id); continue; }
      const info = this._place(t, B, { ...lot, x: placed.x, z: placed.z, yaw: placed.yaw, lamps: lot.porch !== false });
      if (lot.counterOut) this._counterOut(t, B, info);
      if (lot.kind === 'house' || lot.kind === 'bunkhouse') t.spots.homes.push({ pos: info.front.clone().addScaledVector(_dirOf(info), 3), yaw: info.spec.yaw + Math.PI });
      a = placed.ang + (lot.w + 4) / (radius + lot.d / 2);
    }
    t.spots.well = C.clone();
    for (let k = 0; k < 6; k++) t.spots.street.push(C.clone().add(V(Math.cos(k) * 9, Math.sin(k) * 9)).setY(t.y));
  }

  /** Where the ground falls away a little under a lot, a stone foundation reaches down to it. */
  _foundation(t, B, info) {
    const sp = info.spec, c = Math.cos(sp.yaw), s = Math.sin(sp.yaw), T = this.terrain;
    let low = t.y;
    for (const [lx, lz] of [[-sp.w / 2, -sp.d / 2], [sp.w / 2, -sp.d / 2], [-sp.w / 2, sp.d / 2 + 2.6], [sp.w / 2, sp.d / 2 + 2.6]]) low = Math.min(low, T.getHeightAt(sp.x + lx * c + lz * s, sp.z - lx * s + lz * c));
    const drop = t.y - low;
    if (drop < 0.08) return;
    const F = info.local, depth = sp.d + (info.porch ? info.porch.d : 0);
    F.box('stone', sp.w + 0.3, drop + 0.3, depth + 0.2, 0, -drop / 2 + 0.05, (depth - sp.d) / 2);
  }

  /** Furnishes an interior and registers its anchors. */
  _furnish(t, B, info, kind) {
    const a = furnish(B, info, kind);
    info.anchors = a;
    for (const p of a.lamps) this.lamps.push({ pos: p, town: t, interior: true, building: info.id });
    t.spots.seats.push(...a.seats.map((s) => ({ ...s, building: info.id })));
    if (a.keeper) t.spots.work[info.id] = { keeper: a.keeper, yaw: a.keeperYaw, counter: a.counter, counterYaw: a.counterYaw };
    if (a.extra.piano) t.spots.piano = a.extra.piano;
    if (a.extra.dust) (t.dust || (t.dust = [])).push(a.extra.dust);
    this._interactions(t, info);
  }
  /** A serving counter out on the porch (stalls, outposts): the keeper stands behind it by the door. */
  _counterOut(t, B, info) {
    const F = info.local, d = info.spec.d, pd = info.porch ? info.porch.d : 1.6, cz = d / 2 + pd * 0.55, y0 = info.porch ? 0.25 : 0.3;
    F.box('trim', 2.4, 1.05, 0.55, 1.2, y0 + 0.52, cz); F.box('wood', 2.5, 0.06, 0.65, 1.2, y0 + 1.07, cz); F.col(2.4, 1.1, 0.55, 1.2, y0 + 0.55, cz, { tag: 'counter' });
    info.anchors = { counter: F.world(1.2, y0, cz + 1.3), keeper: F.world(1.2, y0, cz - 0.8), keeperYaw: info.spec.yaw, counterYaw: info.spec.yaw + Math.PI, seats: [], lamps: [], extra: {} };
    t.spots.work[info.id] = { keeper: info.anchors.keeper, yaw: info.anchors.keeperYaw, counter: info.anchors.counter };
    this._interactions(t, info);
  }
  /** A bounty board on the front wall beside the door, papered with posters. */
  _board(t, B, info) {
    const F = info.local, w = info.spec.w, d = info.spec.d, bx = w / 2 - 1.5, by = 1.75, bz = d / 2 + 0.06;
    F.box('trim', 2.2, 1.5, 0.08, bx, by, bz); F.box('trim', 2.4, 0.12, 0.14, bx, by + 0.8, bz + 0.03);
    for (let i = 0; i < 4; i++) {
      const g = new THREE.PlaneGeometry(0.46, 0.63), uv = g.getAttribute('uv'), [u0, v0, u1, v1] = this.posters.uv(i);
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + (u1 - u0) * uv.getX(k), v0 + (v1 - v0) * uv.getY(k));
      F.geo('posters', g, bx - 0.78 + i * 0.52, by + (i % 2 ? -0.05 : 0.04), bz + 0.05, { rz: (i % 2 ? 1 : -1) * 0.03 });
    }
    const pos = F.world(bx, 0.25, d / 2 + 1.0);
    this.interactions.push(this.game.interact.register({ position: pos, radius: 1.6, label: 'Read the bounty board', onInteract: () => this.game.get('shops')?.openBoard?.(t.id) }));
    t.spots.board = pos;
  }
  _corral(t, B, info, u, n, side, R) {
    const T = this.terrain, c = info.front.clone().addScaledVector(u, info.spec.w / 2 + 9).addScaledVector(n, -side * -2);
    const pts = [[-6, -6], [6, -6], [6, 6], [-6, 6], [-6, -6]].map(([a, b]) => [c.x + u.x * a + n.x * b * -side, c.z + u.z * a + n.z * b * -side]);
    for (let k = 1; k < pts.length; k++) if (!(T.getRoadInfo?.((pts[k][0] + pts[k - 1][0]) / 2, (pts[k][1] + pts[k - 1][1]) / 2)?.distance < 3.5)) fence(B, T, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], R);
    t.spots.corral = c.setY(t.y);
  }

  /** Counter, bath, bed interactions; the shop decides what each does. */
  _interactions(t, info) {
    const g = this.game, a = info.anchors, shop = info.spec.shop;
    if (shop && a?.counter) {
      this.interactions.push(g.interact.register({
        position: a.counter, radius: 1.9, priority: 0.5,
        label: () => g.get('shops')?.labelFor?.(shop) || 'Shop',
        onInteract: () => g.get('shops')?.open(shop),
      }));
    }
    if (a?.extra.bath) this.interactions.push(g.interact.register({ position: a.extra.bath, radius: 1.8, label: () => g.get('shops')?.labelFor?.('bath') || 'Take a bath', onInteract: () => g.get('shops')?.service?.('bath', shop) }));
    if (a?.extra.bed) this.interactions.push(g.interact.register({ position: a.extra.bed, radius: 1.8, label: () => g.get('shops')?.labelFor?.('room') || 'Sleep', onInteract: () => g.get('shops')?.service?.('room', shop) }));
    if (a?.extra.board) { this.interactions.push(g.interact.register({ position: a.extra.board, radius: 1.6, label: 'Read the bounty board', onInteract: () => g.get('shops')?.openBoard?.(t.id) })); }
  }

  // ---------------------------------------------------------------- doors
  _buildDoors(towns = [...this.towns.values()], locked = true) {
    const list = [], made = [];
    for (const t of towns) for (const b of t.buildings) for (const d of b.doors) {
      if (d._built) continue;
      d._built = true;
      const leaves = d.batwing ? [{ x: 0, w: d.w / 2, sign: 1 }, { x: d.w, w: d.w / 2, sign: -1 }] : [{ x: 0, w: d.w, sign: 1 }];
      const fy = d.floor ?? 0.3; // frame buildings stand on a 0.3 m floor, adobe on 0.15
      const door = { building: b, def: d, floor: fy, town: t, hinge: d.hinge, yaw: d.yaw, w: d.w, h: d.h, batwing: d.batwing, angle: 0, target: 0, openT: 0, leaves: [], collider: null };
      door.center = b.local.world(d.local.x, fy, d.local.z);
      door.outside = b.local.world(d.local.x, fy - 0.05, d.local.z + 2.2); door.inside = b.local.world(d.local.x, fy, d.local.z - 1.8);
      for (const lf of leaves) { door.leaves.push({ ...lf, index: list.length }); list.push(door); }
      this.doors.push(door); made.push(door);
    }
    if (locked) this._lockedDoors();
    if (!list.length) return made;
    const geo = new THREE.BoxGeometry(1, 1, 0.05); geo.translate(0.5, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, this.kit.materials.trim, list.length);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'Doors';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(mesh); (this.doorMeshes ||= []).push(mesh);
    if (!this.doorMesh) this.doorMesh = mesh;
    for (const door of made) {
      door.mesh = mesh;
      if (!door.batwing) this._doorCollider(door, true);
      this._poseDoor(door);
      const g = this.game;
      if (!door.batwing) { door.handle = g.interact.register({
        position: door.center, radius: 1.9, priority: 0.2,
        label: () => (door.target ? 'Close the door' : 'Open the door'),
        onInteract: () => this.toggleDoor(door, !door.target),
      }); this.interactions.push(door.handle); }
    }
    return made;
  }
  /**
   * Added in Part 13: registers an extra place (the Rourke Ranch) as a town record, so zoneAt, interior zones,
   * lamps and doors work there. Buildings pushed into its `buildings` get doors through addDoors(id).
   * @returns the town record { id, name, center, radius, buildings, colliders, lamps, spots }
   */
  registerPlace(id, name, center, radius) { return this.towns.get(id) || this._town(id, name, center, radius); }
  /** Added in Part 13: (re)builds a place's NPC waypoint graph from its street spots, doors, homes and work spots. */
  refreshGraph(id) { const t = this.towns.get(id); if (t) { this.game.get('npcs')?.unregisterGraph?.(id); this._registerGraph(t); } return t?.graph || null; }
  /** Added in Part 13: builds doors for a place's new buildings. @returns the new doors */
  addDoors(id) { const t = this.towns.get(id); return t ? this._buildDoors([t], false) : []; }
  /** Added in Part 13: removes a building's doors (when a structure is torn down or rebuilt). */
  removeDoors(building) {
    for (const door of this.doors.filter((d) => d.building === building)) {
      this._doorCollider(door, false);
      if (door.handle) this.game.interact.unregister(door.handle);
      for (const lf of door.leaves) { door.mesh.setMatrixAt(lf.index, new THREE.Matrix4().makeScale(0, 0, 0)); }
      door.mesh.instanceMatrix.needsUpdate = true;
      door.def._built = false;
      this.doors.splice(this.doors.indexOf(door), 1);
    }
  }
  /**
   * Part 9 addition: buildings you can't go into still answer at the door (a rattle and a line saying why), so a
   * closed door never just ignores E. Open-fronted buildings (stables, smithy, sawmill) have no door to try.
   */
  _lockedDoors() {
    const g = this.game, open = new Set(['stable', 'blacksmith', 'sawmill']);
    for (const t of this.towns.values()) for (const b of t.buildings) {
      if (b.doors.length || (open.has(b.kind) && !b.spec.builder)) continue;
      const sp = b.spec, adobe = sp.builder === adobeBuilding, dx = sp.door?.x ?? (adobe ? -sp.w * 0.18 : 0);
      const pos = b.local.world(dx, adobe ? 0.15 : 0.3, sp.d / 2 + 0.8);
      const msg = TUNING.locked[b.kind] || TUNING.locked.default;
      this.interactions.push(g.interact.register({
        position: pos, radius: 1.3, priority: 0.05, label: 'Try the door',
        onInteract: () => { g.audio.play('door_close', { position: pos, volume: 0.5 }); g.ui.notify(msg, { duration: 2.5 }); },
      }));
    }
  }
  _doorCollider(door, on) {
    const P = this.game.physics;
    if (on && !door.collider) {
      const c = door.building.local.world(door.def.local.x, door.floor + door.h / 2, door.def.local.z - 0.08);
      door.collider = P.addCollider({ type: 'box', position: c, size: new THREE.Vector3(door.w, door.h, 0.12), rotationY: door.yaw, surface: 'wood', tag: 'door' });
    } else if (!on && door.collider) { P.removeCollider(door.collider); door.collider = null; }
  }
  /** Opens or closes a door (Eli presses E; NPCs open them by walking up). */
  toggleDoor(door, open) {
    door.target = open ? 1 : 0; door.openT = 0;
    this._doorCollider(door, !open && !door.batwing);
    this.game.audio.play(open ? 'door_open' : 'door_close', { position: door.center });
  }
  _poseDoor(door) {
    const m = door.mesh || this.doorMesh;
    for (const lf of door.leaves) {
      const a = door.angle * TUNING.doorOpen * (door.batwing ? 0.75 : 1) * lf.sign * (door.swing || 1);
      _q.setFromAxisAngle(_up, door.yaw + (lf.sign < 0 ? Math.PI : 0) + a);
      const off = door.building.local.world(door.def.local.x - door.w / 2 + lf.x, door.batwing ? 0.85 : door.floor, door.def.local.z - 0.08, _p);
      _s.set(lf.w, door.batwing ? 1.25 : door.h, 1);
      _m.compose(off, _q, _s);
      m.setMatrixAt(lf.index, _m);
    }
    m.instanceMatrix.needsUpdate = true;
  }
  _doorsTick(dt) {
    if (!this.doors.length) return;
    const g = this.game, npcs = g.get('npcs')?.list || [], pl = g.player.position;
    for (const door of this.doors) {
      // NPCs (and anyone through batwings) open them by walking up; they close again a few seconds later
      let near = false, side = 1;
      for (const n of npcs) if (!n.dead && !n.horse && n.position.distanceTo(door.center) < TUNING.doorAuto) { near = true; side = this._side(door, n.position); break; }
      if (door.batwing && pl.distanceTo(door.center) < TUNING.doorAuto) { near = true; side = this._side(door, pl); }
      if (near && !door.target) { door.swing = side; this.toggleDoor(door, true); }
      if (door.target && !near) { door.openT += dt; if (door.openT > (door.batwing ? 0.6 : TUNING.doorClose) && pl.distanceTo(door.center) > 1.4) this.toggleDoor(door, false); }
      else if (near) door.openT = 0;
      const prev = door.angle;
      door.angle += Math.sign(door.target - door.angle) * Math.min(Math.abs(door.target - door.angle), dt * TUNING.doorSpeed);
      if (door.angle !== prev) this._poseDoor(door);
    }
  }
  /** +1 when p is outside the door (the leaf swings inward), −1 inside. */
  _side(door, p) { const q = _v.copy(p).applyMatrix4(door.building.inv); return q.z > door.building.doors[0].local.z - 0.1 ? 1 : -1; }

  // ---------------------------------------------------------------- lights, smoke, keepers
  _makeLights() {
    const n = TUNING.lights[this.game.quality?.name] ?? 2;
    this.lights = [];
    for (let i = 0; i < n; i++) { const L2 = new THREE.PointLight(0xffb060, 0, TUNING.lightRange, 2); L2.castShadow = false; this.group.add(L2); this.lights.push(L2); }
  }
  _defineEffects() {
    const vfx = this.game.sys('vfx');
    if (!vfx.define) return;
    vfx.define('chimney_smoke', { parts: [
      { pool: 'alpha', rate: 2.2, prewarm: true, duration: Infinity, frame: 'smokeB', frames: 2, life: [6, 10], speed: [0.2, 0.5], spread: 0.25, vel: [0, 0.7, 0], size: [[0.35, 0.5], [1.8, 2.8]], spin: [-0.2, 0.2], color: 0xb8b2aa, alpha: [0.28, 0], fadeIn: 0.15, drag: 0.4, wind: 0.9, lit: true },
    ] });
    vfx.define('forge_sparks', { parts: [
      { pool: 'additive', rate: 5, duration: Infinity, frame: 'dot', life: [0.5, 1.2], speed: [0.6, 2], spread: 0.6, vel: [0, 1.2, 0], gravity: 1.2, stretch: true, size: 0.02, color: [0xffd080, 0xff6020], alpha: [1, 0], drag: 0.6, wind: 0.2 },
      { pool: 'alpha', rate: 0.8, duration: Infinity, frame: 'smokeC', life: [2, 3.5], speed: [0.2, 0.4], spread: 0.3, vel: [0, 0.6, 0], size: [[0.2, 0.3], [0.8, 1.2]], color: 0x6a625a, alpha: [0.2, 0], drag: 0.6, wind: 0.6, lit: true },
    ] });
  }
  /** Shopkeepers for every counter: at work by day, home by night (the bartender works late). */
  _spawnKeepers() {
    const g = this.game, npcs = g.get('npcs');
    if (!npcs || this._keepers) return;
    this._keepers = true;
    const shops = g.get('shops');
    for (const t of this.towns.values()) {
      const homes = t.spots.homes;
      let i = 0;
      for (const [bid, w] of Object.entries(t.spots.work)) {
        const b = t.buildings.find((x) => x.id === bid), shopId = b?.spec.shop, def = shops?.shopDef?.(shopId);
        if (!def || def.keeper === false || bid === 'sheriff') continue;
        const home = homes.length ? homes[i++ % homes.length] : { pos: t.center };
        const [from, to] = def.hours || [7, 20];
        const n = npcs.spawn({
          id: `keeper:${shopId}`, name: def.keeperName, role: def.keeperRole || 'townsman', faction: 'civilian', persistent: true, wander: false,
          position: { x: w.keeper.x, z: w.keeper.z }, home: [w.keeper.x, w.keeper.z], yaw: w.yaw, canSurrender: true, aggression: 0.3,
          schedule: [{ from, to, at: [w.keeper.x, w.keeper.z], anim: 'stand', yaw: w.yaw }, { from: to, to: from, at: [home.pos.x, home.pos.z], anim: null }],
        });
        if (n) n.shop = shopId;
      }
    }
  }

  _refreshPosters() {
    const law = this.game.sys('law'), b = law.totalBounty?.() || 0;
    const list = b > 0 ? [{ name: 'Eli Rourke', crime: 'Crimes in Ashwater County', alive: Math.round(b * 1.5), dead: Math.round(b), seed: 7 }, ...WANTED] : WANTED;
    this.posters.redraw(list.slice(0, 8));
  }

  _registerGraph(t) {
    const npcs = this.game.get('npcs');
    if (!npcs?.registerGraph) return;
    const G = new NavGraph(t.id), street = t.spots.street.map((p) => G.add(p.x, p.z, 'street'));
    for (let i = 0; i < street.length - 1; i++) G.link(street[i], street[i + 1]);
    if (t.id !== 'copperbell') for (let i = 0; i < street.length; i++) G.link(street[i], street[(i + 1) % street.length]);
    const nearestStreet = (p) => street.reduce((best, id) => (Math.hypot(G.nodes[id].x - p.x, G.nodes[id].z - p.z) < Math.hypot(G.nodes[best].x - p.x, G.nodes[best].z - p.z) ? id : best), street[0]);
    for (const door of this.doors.filter((d) => d.town === t)) {
      const o = G.add(door.outside.x, door.outside.z, 'door'), i = G.add(door.inside.x, door.inside.z, 'inside');
      G.link(nearestStreet(door.outside), o); G.link(o, i);
      for (const [id, w] of Object.entries(t.spots.work)) if (id === door.building.id) { const k = G.add(w.keeper.x, w.keeper.z, 'keeper'); G.link(i, k); }
      for (const s of t.spots.seats.filter((s) => s.building === door.building.id)) { const k = G.add(s.pos.x, s.pos.z, 'seat'); G.link(i, k); }
    }
    for (const h of t.spots.homes) { const k = G.add(h.pos.x, h.pos.z, 'home'); G.link(nearestStreet(h.pos), k); }
    for (const [id, w] of Object.entries(t.spots.work)) if (!this.doors.some((d) => d.building.id === id && d.town === t)) { const k = G.add(w.keeper.x, w.keeper.z, 'keeper'); G.link(nearestStreet(w.keeper), k); }
    npcs.registerGraph(G);
    t.graph = G;
  }

  // ---------------------------------------------------------------- per frame
  update(dt, rawDt) {
    const g = this.game;
    if (!this.towns.size) return;
    this._doorsTick(dt);
    if (this.fans) { const wind = g.sys('weather').wind, ws = wind ? Math.hypot(wind.x, wind.z) : 1; for (const f of this.fans) f.rotation.z += dt * (0.6 + ws * 0.5); } // windmill fans turn with the wind
    // dusk: lanterns and windows light up
    const sky = g.sys('sky'), day = typeof sky.daylight === 'number' ? sky.daylight : sky.isNight?.() ? 0 : 1;
    const lit = day < TUNING.duskDaylight;
    const k = Math.max(0, Math.min(1, (TUNING.duskDaylight - day) / 0.2));
    this.kit.materials.glass.emissiveIntensity = TUNING.windowGlow * k;
    this.kit.materials.lamp.emissiveIntensity = 0.15 + TUNING.lampGlow * k;
    if (lit !== this.lit) this._setLit(lit);
    // effects near the camera; interiors only when close
    const cam = g.camera.position;
    for (const t of this.towns.values()) {
      const near = cam.distanceTo(t.center) < TUNING.interiorsDist;
      if (t.interiors) t.interiors.visible = near;
      if (near !== t._fx) { t._fx = near; this._townFx(t, near); }
    }
    if ((this._lightT -= rawDt) <= 0) { this._lightT = TUNING.lightRefresh; this._assignLights(lit); }
    if ((this._zoneT -= rawDt) <= 0) { this._zoneT = TUNING.zoneEvery; this._zoneTick(); }
  }
  _setLit(lit) {
    this.lit = lit;
    const vfx = this.game.sys('vfx');
    for (const l of this.lamps) {
      if (l.interior) { if (!l.glow) l.glow = vfx.spawn('lamp_glow', { position: l.pos, scale: 0.7, flicker: 0.12, intensity: 1.2 }); continue; }
      if (lit && !l.glow) l.glow = vfx.spawn('lamp_glow', { position: l.pos, scale: 1.0, flicker: 0.15 });
      else if (!lit && l.glow) { l.glow.stop(); l.glow = null; }
    }
  }
  _townFx(t, on) {
    const vfx = this.game.sys('vfx');
    if (!on) { for (const h of t.fx || []) h.stop(); t.fx = []; return; }
    t.fx = [];
    for (const c of t.chimneys || []) t.fx.push(vfx.spawn(c.forge ? 'forge_sparks' : 'chimney_smoke', { position: c.pos }));
    for (const f of t.forges || []) if (f) { t.fx.push(vfx.spawn('forge_sparks', { position: f })); t.fx.push(vfx.spawn('lamp_glow', { position: f, color: 0xff5a20, scale: 1.4, flicker: 0.35, intensity: 2.2 })); }
    for (const d of t.dust || []) t.fx.push(vfx.spawn('dust_motes', { position: d }));
  }
  /** The few real point lights go to the lit lamps nearest the camera (interior lamps count day and night). */
  _assignLights(lit) {
    if (!this.lights.length) return;
    const cam = this.game.camera.position, cand = [];
    for (const l of this.lamps) { if (!lit && !l.interior) continue; const d = l.pos.distanceTo(cam); if (d < 45) cand.push([d, l]); }
    cand.sort((a, b) => a[0] - b[0]);
    this.lights.forEach((L2, i) => {
      const c = cand[i];
      if (c) { L2.position.copy(c[1].pos); L2.position.y -= 0.15; L2.intensity = TUNING.lightIntensity * (c[1].interior ? 0.8 : 1); }
      else L2.intensity = 0;
    });
  }
  _zoneTick() {
    const g = this.game, z = this.zoneAt(g.player.position), key = z ? (z.building && z.interior ? `${z.town}/${z.building}` : z.town) : null;
    if (key === this._zoneKey) return;
    const prev = this._zoneKey;
    this._zoneKey = key; this.zone = z;
    if (prev) g.events.emit(EVENTS.ZONE_EXITED, { zone: prev });
    if (key) g.events.emit(EVENTS.ZONE_ENTERED, { zone: key, info: z });
    g.audio.setReverb?.(z?.interior ? 'interior' : 'outdoor');
    // (Part 12: the music director now picks town, saloon and explore music from the zone itself)
    if (z && !prev?.startsWith(z.town)) g.ui.notify(z.name, { duration: 2.5 });
  }

  serialize() { return { doors: this.doors.map((d) => (d.target ? 1 : 0)) }; }
  deserialize(d) { if (Array.isArray(d?.doors)) d.doors.forEach((v, i) => { const door = this.doors[i]; if (door && !!v !== !!door.target) this.toggleDoor(door, !!v); }); }
  dispose() {
    for (const t of this.towns.values()) { for (const c of t.colliders) this.game.physics.removeCollider(c); for (const h of t.fx || []) h.stop(); }
    for (const d of this.doors) this._doorCollider(d, false);
    for (const it of this.interactions) this.game.interact.unregister(it);
    this.group?.removeFromParent(); this.kit?.dispose();
  }
}

const _v = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
/** World direction a building's front faces. */
function _dirOf(info) { return new THREE.Vector3(Math.sin(info.spec.yaw), 0, Math.cos(info.spec.yaw)); }
void frame;

export { TownSystem };
