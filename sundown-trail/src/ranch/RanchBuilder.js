import * as THREE from 'three';
import { frame, buildBuilding, buildStable, lantern } from '../town/Buildings.js';
import { well, windmill, corral, ramada, firewood, lumberStack } from '../town/Outposts.js';
import { fence, haystack, barrel, crate } from '../world/props/Builders.js';

/**
 * The Rourke Ranch, structure by structure (Part 13). Each structure has a stage 0 (ruin or bare ground) and a
 * stage 1 (built), drawn with the Part 9 western kit so the ranch matches Copperbell. Layout is in the ranch's own
 * frame (metres, x across the yard, z toward the road): the house faces the yard, the barn and corral to the east,
 * the garden and coop to the west, the smokehouse and bunkhouse behind, the lookout on the rise, the windmill by
 * the well, and a fire ring with log benches in the middle where the companions gather.
 * build(structure, stage, ctx) → { buildings, lamps, fans, chimneys, anchors, spots }
 */
export const TUNING = { yaw: 0.25 };

export const LAYOUT = {
  house: { x: -9, z: -6, w: 10, d: 8 }, barn: { x: 13, z: -7, w: 12, d: 13 }, corral: { x: 15, z: 13, w: 14, d: 12 },
  garden: { x: -16, z: 12, w: 9, d: 7 }, smokehouse: { x: -1, z: -18, w: 3.2, d: 3.2 }, bunkhouse: { x: -25, z: -6, w: 10, d: 6 },
  lookout: { x: 28, z: -20, w: 3, d: 3 }, windmill: { x: -6, z: 21, w: 3, d: 3 }, well: { x: 2, z: 4 }, fire: { x: 1, z: 11 },
  woodpile: { x: -3, z: -1 }, trough: { x: 4.5, z: 6.5 }, hay: { x: 4.5, z: -2 },
};
export const STRUCTURES = ['house', 'barn', 'corral', 'garden', 'smokehouse', 'bunkhouse', 'lookout', 'windmill'];

/** Ranch frame helpers: local (x, z) → world, ground height, a frame for a structure. */
export function ranchFrame(center, T) {
  const yaw = TUNING.yaw, c = Math.cos(yaw), s = Math.sin(yaw);
  const world = (lx, lz, out = new THREE.Vector3()) => { const x = center.x + lx * c + lz * s, z = center.z - lx * s + lz * c; return out.set(x, T.getHeightAt(x, z), z); };
  return { yaw, world, center };
}

/** A stone foundation where the ground falls away under a footprint. */
function foundation(B, T, L, w, d, extraFront = 0) {
  let low = Infinity;
  for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2 + extraFront], [w / 2, d / 2 + extraFront], [0, 0]]) { const p = L.world(lx, 0, lz); low = Math.min(low, T.getHeightAt(p.x, p.z)); }
  const drop = L.y - low;
  if (drop > 0.06) L.box('stone', w + 0.3, drop + 0.3, d + extraFront + 0.2, 0, -drop / 2 + 0.05, extraFront / 2);
}
/** Where a structure stands: world position on the ground (the highest corner, so floors never sink). */
function place(R, T, key, extraFront = 0) {
  const P = LAYOUT[key], p = R.world(P.x, P.z); let y = -Infinity;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const q = R.world(P.x + a * (P.w || 2) / 2, P.z + b * ((P.d || 2) / 2 + (b > 0 ? extraFront : 0))); y = Math.max(y, q.y); }
  p.y = y; return p;
}

export function buildStructure(name, stage, ctx) {
  const { B, T, R, signs, kit, rand } = ctx, out = { buildings: [], lamps: [], fans: [], chimneys: [], anchors: {}, spots: {} };
  const fn = (stage > 0 ? BUILT : RUIN)[name];
  if (fn) fn({ B, T, R, signs, kit, rand, out });
  return out;
}

// ---------------------------------------------------------------- ruins (stage 0)
const RUIN = {
  house({ B, T, R, rand, out }) {
    const p = place(R, T, 'house'), L = frame(B, p.x, p.y, p.z, R.yaw);
    L.solid('stone', 9.5, 0.5, 7.5, 0, 0.1, 0, { surface: 'stone' });
    L.solid('stone', 1.4, 7, 1.2, -5.2, 3.5, -2.5, { surface: 'stone' }); // the chimney still stands
    const stub = (ax, az, bx, bz, maxH) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.6)), ang = -Math.atan2(bz - az, bx - ax);
      for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, h = maxH * (0.15 + 0.85 * Math.abs(Math.sin(k * 0.9 + rand() * 2))) * (rand() < 0.25 ? 0.2 : 1); L.box('burnt', len / n - 0.02, h, 0.12, ax + (bx - ax) * t, 0.35 + h / 2, az + (bz - az) * t, { ry: ang, rz: (rand() - 0.5) * 0.08 }); }
      L.col(len, 2.2, 0.3, (ax + bx) / 2, 1.2, (az + bz) / 2, { ry: ang, tag: 'ruin' });
    };
    stub(-4.6, -3.6, 4.6, -3.6, 2.6); stub(4.6, -3.6, 4.6, 3.6, 2.0); stub(-4.6, 3.6, -1.5, 3.6, 2.4);
    for (let k = 0; k < 10; k++) L.box('burnt', 2 + rand() * 2, 0.12, 0.22, (rand() - 0.5) * 7, 0.45 + rand() * 0.3, (rand() - 0.5) * 5, { ry: rand() * 3, rz: (rand() - 0.5) * 0.4 });
    // Mae's corner: a canvas lean-to against the chimney, a cot, a crate for a table with the ranch ledger on it
    ramada(L, -3.2, -1.2, 3.6, 3, 2.1);
    L.box('tent', 3.8, 0.04, 3.2, -3.2, 2.25, -1.2, { rx: 0.08 });
    L.box('cloth', 0.8, 0.35, 1.9, -4.2, 0.55, -1.0); L.col(0.8, 0.5, 1.9, -4.2, 0.6, -1.0);
    L.box('wood', 0.8, 0.7, 0.6, -1.9, 0.7, -2.0); L.box('cloth', 0.36, 0.06, 0.26, -1.9, 1.08, -2.0); L.col(0.8, 0.8, 0.6, -1.9, 0.7, -2.0);
    out.anchors.ledger = L.world(-1.9, 0.35, -1.1); out.anchors.bed = L.world(-4.2, 0.35, 0.2);
    out.spots.maeHome = L.world(-2.6, 0.35, 0.4); out.spots.door = L.world(-1.5, 0.35, 4.6);
    lantern(L, -1.5, 1.9, -0.2); out.lamps.push(L.world(-1.5, 1.9, -0.2));
  },
  barn({ B, T, R, out }) {
    const p = place(R, T, 'barn'), L = frame(B, p.x, p.y, p.z, R.yaw), w = 12, d = 13;
    L.box('barn', w, 5, 0.15, 0, 2.5, -d / 2, { rx: 0.05 }); L.box('barn', 0.15, 4.6, d, w / 2, 2.1, 0, { rz: -0.28 }); L.box('burnt', 0.15, 3, d, -w / 2, 1.3, 0, { rz: 0.5 });
    L.box('grey', w + 1, 0.15, d - 4, 0.5, 1.4, 1, { rx: 0.32, rz: 0.12 });
    L.col(w, 4, d, 0, 2, 0, { tag: 'ruin' });
    out.spots.barn = L.world(0, 0, d / 2 + 2);
  },
  corral({ B, T, R, rand, out }) {
    const P = LAYOUT.corral, c = [[-P.w / 2, -P.d / 2], [P.w / 2, -P.d / 2], [P.w / 2, P.d / 2], [-P.w / 2, P.d / 2], [-P.w / 2, -P.d / 2]];
    for (let k = 1; k < c.length; k++) { const a = R.world(P.x + c[k - 1][0], P.z + c[k - 1][1]), b = R.world(P.x + c[k][0], P.z + c[k][1]); fence(B, T, a.x, a.z, b.x, b.z, rand, { burnt: true, broken: 0.45 }); }
    out.spots.corral = R.world(P.x, P.z);
  },
  garden({ B, T, R, rand }) {
    const P = LAYOUT.garden;
    for (let k = 0; k < 12; k++) { const p = R.world(P.x + (rand() - 0.5) * P.w, P.z + (rand() - 0.5) * P.d); B.box('hay', 0.6 + rand() * 0.6, 0.35 + rand() * 0.4, 0.6 + rand() * 0.5, { x: p.x, y: p.y + 0.15, z: p.z, ry: rand() * 3 }); }
  },
  smokehouse({ B, T, R, rand }) { const P = LAYOUT.smokehouse; for (let k = 0; k < 6; k++) { const p = R.world(P.x + (rand() - 0.5) * 2, P.z + (rand() - 0.5) * 2); B.box('stone', 0.5, 0.35, 0.4, { x: p.x, y: p.y + 0.15, z: p.z, ry: rand() * 3 }); } },
  bunkhouse({ B, T, R, rand }) { const p = R.world(LAYOUT.bunkhouse.x, LAYOUT.bunkhouse.z); lumberStack(B, p.x, p.y, p.z, R.yaw + 0.3, rand); },
  lookout() {},
  windmill({ B, T, R, rand }) {
    const p = R.world(LAYOUT.windmill.x, LAYOUT.windmill.z), L = frame(B, p.x, p.y, p.z, R.yaw);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) L.box('grey', 0.16, 1.2 + rand() * 1.4, 0.16, sx * 0.8, 0.8, sz * 0.8, { rz: (rand() - 0.5) * 0.3 });
    L.box('grey', 0.2, 0.1, 2.6, 1.6, 0.1, 1.2, { ry: 0.6 }); L.col(2, 2, 2, 0, 1, 0, { tag: 'ruin' });
  },
};

// ---------------------------------------------------------------- built (stage 1)
const BUILT = {
  house({ B, T, R, signs, out }) {
    const P = LAYOUT.house, p = place(R, T, 'house', 2.6);
    const info = buildBuilding(B, { id: 'ranch_house', kind: 'ranch_house', x: p.x, y: p.y, z: p.z, yaw: R.yaw, w: P.w, d: P.d, paint: 'paintWhite', roof: 'gableSide', interior: true, chimney: true, door: { x: -1.5, w: 1.3 }, windows: 2, hitch: true }, signs);
    const L = info.local; foundation(B, T, L, P.w, P.d, 2.6);
    furnishHouse(L, info, out);
    out.buildings.push(info); out.lamps.push(...info.lamps); out.chimneys.push(...info.chimneys);
    out.spots.door = info.local.world(-1.5, 0.3, P.d / 2 + 2); out.spots.porch = info.local.world(2.5, 0.3, P.d / 2 + 1.3);
    out.spots.maeHome = info.local.world(-3, 0.3, -1.6);
  },
  barn({ B, T, R, signs, rand, out }) {
    const P = LAYOUT.barn, p = place(R, T, 'barn', 2);
    const info = buildStable(B, { id: 'ranch_barn', kind: 'stable', x: p.x, y: p.y, z: p.z, yaw: R.yaw, w: P.w, d: P.d }, signs);
    foundation(B, T, info.local, P.w, P.d, 0);
    for (let k = 0; k < 2; k++) { const q = R.world(P.x + P.w / 2 + 1.5, P.z - 3 + k * 2.2); haystack(B, T, q.x, q.z, rand); }
    out.buildings.push(info); out.lamps.push(...info.lamps);
    out.spots.barn = info.local.world(0, 0.1, P.d / 2 + 2);
  },
  corral({ B, T, R, rand, out }) {
    const P = LAYOUT.corral, p = R.world(P.x, P.z);
    corral(B, p.x, p.y, p.z, R.yaw, P.w, P.d, rand);
    out.spots.corral = p.clone(); out.spots.corralRail = R.world(P.x - 3, P.z - P.d / 2 - 1.2);
  },
  garden({ B, T, R, rand, out }) {
    const P = LAYOUT.garden, p = R.world(P.x, P.z), L = frame(B, p.x, p.y, p.z, R.yaw);
    const c = [[-P.w / 2, -P.d / 2], [P.w / 2, -P.d / 2], [P.w / 2, P.d / 2], [1, P.d / 2]], c2 = [[-1, P.d / 2], [-P.w / 2, P.d / 2], [-P.w / 2, -P.d / 2]];
    for (const line of [c, c2]) for (let k = 1; k < line.length; k++) { const a = R.world(P.x + line[k - 1][0], P.z + line[k - 1][1]), b = R.world(P.x + line[k][0], P.z + line[k][1]); fence(B, T, a.x, a.z, b.x, b.z, rand); }
    for (let r = 0; r < 5; r++) { L.box('stone', P.w - 3.5, 0.12, 0.5, -0.8, 0.06, -P.d / 2 + 1 + r * 1.1, {}); for (let k = 0; k < 7; k++) L.box('pine', 0.3, 0.35 + rand() * 0.2, 0.3, -P.w / 2 + 1.6 + k * 0.85, 0.25, -P.d / 2 + 1 + r * 1.1, { ry: rand() * 3 }); }
    // the coop: a little red shed on legs, a ramp and a run
    const cx = P.w / 2 - 1.3, cz = -P.d / 2 + 1.2;
    for (const [a, b] of [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.6], [0.8, 0.6]]) L.box('wood', 0.1, 0.5, 0.1, cx + a, 0.25, cz + b);
    L.solid('paintRed', 1.8, 1.0, 1.4, cx, 1.0, cz); L.box('shingle', 2.1, 0.08, 1.7, cx, 1.55, cz, { rx: 0.15 }); L.box('wood', 0.4, 0.04, 1.1, cx - 0.4, 0.3, cz + 1.0, { rx: -0.45 });
    for (let k = 0; k < 4; k++) L.box('paintWhite', 0.22, 0.2, 0.3, cx - 1.6 + rand() * 1.4, 0.12, cz + 1.2 + rand() * 1.5, { ry: rand() * 6 }); // hens
    out.spots.garden = R.world(P.x, P.z + P.d / 2 + 1);
  },
  smokehouse({ B, T, R, out }) {
    const P = LAYOUT.smokehouse, p = R.world(P.x, P.z), L = frame(B, p.x, p.y, p.z, R.yaw);
    L.solid('wood', P.w, 2.4, P.d, 0, 1.2, 0); L.box('tin', P.w + 0.5, 0.06, P.d + 0.5, 0, 2.55, 0, { rx: 0.1 });
    L.box('trim', 0.9, 1.8, 0.05, 0, 0.95, P.d / 2 + 0.03); L.box('stone', 0.5, 0.9, 0.5, P.w / 2 - 0.4, 2.8, -0.4);
    out.chimneys.push(L.world(P.w / 2 - 0.4, 3.3, -0.4));
  },
  bunkhouse({ B, T, R, signs, out }) {
    const P = LAYOUT.bunkhouse, p = place(R, T, 'bunkhouse');
    const info = buildBuilding(B, { id: 'ranch_bunkhouse', kind: 'bunkhouse', x: p.x, y: p.y, z: p.z, yaw: R.yaw, w: P.w, d: P.d, paint: 'paintOchre', roof: 'gableSide', chimney: true, porch: false, windows: 2 }, signs);
    foundation(B, T, info.local, P.w, P.d, 0);
    out.buildings.push(info); out.chimneys.push(...info.chimneys); out.lamps.push(...info.lamps);
    out.spots.bunk = info.local.world(0, 0.3, P.d / 2 + 1.5);
  },
  lookout({ B, T, R, out }) {
    const P = LAYOUT.lookout, p = R.world(P.x, P.z), L = frame(B, p.x, p.y, p.z, R.yaw), H = 8;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { L.cyl('barkOak', 0.14, 0.12, H + 1.2, sx * 1.3, 0, sz * 1.3, { rx: -sz * 0.04, rz: sx * 0.04 }, 6); }
    for (let k = 1; k < 4; k++) for (const s of [-1, 1]) { L.box('wood', 2.6, 0.1, 0.1, 0, k * H / 4, s * 1.3, { rz: (k % 2 ? 0.5 : -0.5) }); L.box('wood', 0.1, 0.1, 2.6, s * 1.3, k * H / 4, 0, { rx: (k % 2 ? 0.5 : -0.5) }); }
    L.box('wood', 3.2, 0.15, 3.2, 0, H, 0); for (const s of [-1, 1]) { L.box('wood', 3.2, 0.08, 0.08, 0, H + 1, s * 1.55); L.box('wood', 0.08, 0.08, 3.2, s * 1.55, H + 1, 0); }
    L.box('shingle', 3.8, 0.08, 3.8, 0, H + 2.4, 0); for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) L.box('wood', 0.1, 2.3, 0.1, sx * 1.5, H + 1.2, sz * 1.5);
    for (let k = 0; k < 16; k++) L.box('wood', 0.5, 0.05, 0.05, 0, 0.4 + k * 0.5, 1.6); // ladder rungs
    L.col(2.8, H, 2.8, 0, H / 2, 0, { tag: 'lookout' });
    out.spots.lookout = L.world(0, 0, 2.4);
  },
  windmill({ B, T, R, kit, out }) {
    const p = R.world(LAYOUT.windmill.x, LAYOUT.windmill.z);
    out.fans.push(windmill(B, p.x, p.y, p.z, R.yaw, kit));
  },
};

/** The ranch house inside: bed, wardrobe, map table, weapon locker, stove, table and chairs, the ledger desk. */
function furnishHouse(L, info, out) {
  const I = info.inside, y = I.y, hw = I.w / 2, hd = I.d / 2;
  const W = (x, z) => L.world(x, y, z);
  // bed against the back wall, right
  L.box('wood', 2.0, 0.42, 1.1, hw - 1.2, y + 0.21, -hd + 0.7); L.box('cloth', 1.9, 0.12, 1.0, hw - 1.25, y + 0.48, -hd + 0.7); L.box('paintWhite', 0.4, 0.12, 0.8, hw - 0.4, y + 0.56, -hd + 0.7);
  L.box('wood', 0.08, 0.9, 1.1, hw - 0.2, y + 0.45, -hd + 0.7); L.col(2.0, 0.6, 1.1, hw - 1.2, y + 0.3, -hd + 0.7, { tag: 'bed' });
  // wardrobe on the left wall
  L.solid('trim', 0.6, 2.1, 1.3, -hw + 0.35, y + 1.05, -0.6); L.box('wood', 0.02, 1.9, 0.6, -hw + 0.66, y + 1.05, -0.9); L.box('wood', 0.02, 1.9, 0.6, -hw + 0.66, y + 1.05, -0.28);
  // map table in the middle of the right half, with a territory map on it
  L.box('wood', 1.5, 0.06, 0.9, 1.2, y + 0.78, 0.6); L.box('trim', 1.3, 0.74, 0.75, 1.2, y + 0.37, 0.6); L.box('tent', 1.2, 0.01, 0.75, 1.2, y + 0.82, 0.6); L.col(1.5, 0.8, 0.9, 1.2, y + 0.4, 0.6, { tag: 'table' });
  // weapon locker on the right wall
  L.solid('trim', 0.45, 1.9, 1.2, hw - 0.3, y + 0.95, 1.6); for (let k = 0; k < 3; k++) L.box('iron', 0.05, 1.2, 0.05, hw - 0.55, y + 1.1, 1.25 + k * 0.3);
  // stove in the back-left corner, a table and two chairs by the window, the ledger on a writing desk
  L.solid('iron', 0.8, 0.8, 0.7, -hw + 0.6, y + 0.4, -hd + 0.5, { surface: 'metal' }); L.cyl('iron', 0.08, 0.08, 2.6, -hw + 0.6, y + 0.8, -hd + 0.35, {}, 6);
  L.box('wood', 1.2, 0.06, 0.8, -2.6, y + 0.76, 1.6); L.col(1.2, 0.8, 0.8, -2.6, y + 0.4, 1.6, { tag: 'table' });
  for (const s of [-1, 1]) L.box('wood', 0.42, 0.45, 0.42, -2.6 + s * 0.9, y + 0.22, 1.6);
  L.box('wood', 1.1, 0.06, 0.55, -1.0, y + 0.76, -hd + 0.4); L.box('trim', 1.0, 0.72, 0.45, -1.0, y + 0.36, -hd + 0.4); L.box('cloth', 0.34, 0.06, 0.26, -1.0, y + 0.82, -hd + 0.4); L.col(1.1, 0.8, 0.55, -1.0, y + 0.4, -hd + 0.4);
  for (const [lx, lz] of [[-1.8, 0], [2.2, -0.8]]) { lantern(L, lx, y + I.h - 0.7, lz); out.lamps.push(L.world(lx, y + I.h - 0.7, lz)); }
  Object.assign(out.anchors, { bed: W(hw - 1.4, -hd + 1.6), wardrobe: W(-hw + 1.2, -0.6), map: W(1.2, 1.4), locker: W(hw - 1.1, 1.6), ledger: W(-1.0, -hd + 1.2) });
}

/** The parts of the yard that are always there: the old well, the fire ring with log benches, a woodpile, a trough. */
export function buildYard({ B, T, R, rand }) {
  const spots = {}, wp = R.world(LAYOUT.well.x, LAYOUT.well.z);
  well(B, wp.x, wp.y, wp.z, R.yaw); spots.well = R.world(LAYOUT.well.x + 1.6, LAYOUT.well.z);
  const f = R.world(LAYOUT.fire.x, LAYOUT.fire.z), L = frame(B, f.x, f.y, f.z, R.yaw);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; L.box('stone', 0.32, 0.22, 0.26, Math.cos(a) * 0.6, 0.1, Math.sin(a) * 0.6, { ry: a }); }
  for (let i = 0; i < 3; i++) L.cyl('burnt', 0.06, 0.07, 0.8, 0, 0.12, 0, { rz: Math.PI / 2 - 0.2, ry: i * 1.05 }, 6);
  L.col(1.4, 0.4, 1.4, 0, 0.2, 0, { tag: 'campfire', surface: 'stone' });
  spots.fire = f.clone(); spots.seats = [];
  for (const [a, k] of [[0.3, 0], [2.0, 1], [3.6, 2], [5.0, 3]]) {
    const r = 2.6, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 1.5; // a log lying along the ring's tangent
    L.cyl('barkOak', 0.2, 0.22, h, x + Math.sin(a) * h / 2, 0.2, z - Math.cos(a) * h / 2, { rz: Math.PI / 2, ry: Math.PI / 2 - a, order: 'YXZ' }, 8);
    L.col(0.42, 0.4, h, x, 0.2, z, { ry: -a, tag: 'log' });
    spots.seats.push({ pos: L.world(x * 0.82, 0, z * 0.82), yaw: Math.atan2(x, z) + R.yaw, k }); // just in front of the log (the sit pose leans back onto it), facing the fire
  }
  const wpile = R.world(LAYOUT.woodpile.x, LAYOUT.woodpile.z);
  firewood(B, wpile.x, wpile.y, wpile.z, R.yaw, 2.4); spots.woodpile = R.world(LAYOUT.woodpile.x, LAYOUT.woodpile.z + 1.6);
  const chop = R.world(LAYOUT.woodpile.x + 2.2, LAYOUT.woodpile.z + 0.6); B.cyl('barkOak', 0.32, 0.34, 0.55, { x: chop.x, y: chop.y, z: chop.z }, 10); spots.block = chop;
  const tr = R.world(LAYOUT.trough.x, LAYOUT.trough.z), Lt = frame(B, tr.x, tr.y, tr.z, R.yaw); Lt.box('wood', 2.2, 0.5, 0.6, 0, 0.25, 0); Lt.box('water', 2.0, 0.02, 0.45, 0, 0.46, 0); Lt.col(2.2, 0.5, 0.6, 0, 0.25, 0, { tag: 'trough' }); spots.trough = R.world(LAYOUT.trough.x, LAYOUT.trough.z + 1);
  const hy = R.world(LAYOUT.hay.x, LAYOUT.hay.z); haystack(B, T, hy.x, hy.z, rand); spots.hay = R.world(LAYOUT.hay.x, LAYOUT.hay.z + 1.8);
  barrel(B, T, wpile.x + 1.2, wpile.z - 1.4, rand); crate(B, T, tr.x - 2.4, tr.z - 0.6, rand, 2);
  // the yard's waypoint ring, in order (the graph links each to the next and closes the loop), clear of every structure
  spots.street = [[-9, 2.5], [-2, 3], [5.5, 2], [5.5, 11], [1, 16], [-6, 15], [-7, 6], [-18, 1]].map(([x, z]) => R.world(x, z));
  return spots;
}
