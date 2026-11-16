import * as THREE from 'three';
import { lantern } from './Buildings.js';

/**
 * Interiors (Part 9, GAME_BIBLE scope: saloon, general store, gunsmith, sheriff's office, hotel). Each furnishes the
 * inside box of a building in its local frame (front/door at +Z) and returns anchors the town turns into
 * interactions and NPC spots:
 *   counter (where Eli stands to trade) + keeper (where the shopkeeper stands, and the yaw he faces),
 *   seats (chairs NPCs can sit on at night), lamps (interior lanterns), and extras per kind:
 *   saloon: piano (the diegetic music spot, Part 12), dust (light-shaft motes); sheriff: desk, cells, board;
 *   hotel: bath, bed. Reverb and music zones come from the interior box (TownSystem.zoneAt).
 */
export const TUNING = { counterH: 1.05, shelfH: 2.3 };
/** Floor height of the building being furnished (frame buildings 0.3, adobe 0.15). */
let FY = 0.3;

const yawToward = (L, from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

/** A chair facing local direction `ry`. */
function chair(L, x, z, ry = 0) {
  const y = FY;
  L.box('wood', 0.45, 0.05, 0.45, x, y + 0.45, z, { ry });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.box('wood', 0.04, 0.45, 0.04, x + Math.cos(ry) * sx * 0.19 + Math.sin(ry) * sz * 0.19, y + 0.22, z - Math.sin(ry) * sx * 0.19 + Math.cos(ry) * sz * 0.19, { ry });
  L.box('wood', 0.45, 0.5, 0.04, x - Math.sin(ry) * -0.21, y + 0.72, z - Math.cos(ry) * -0.21, { ry });
}
function table(L, x, z, r = 0.6, felt = false) {
  const y = FY;
  L.cyl(felt ? 'felt' : 'wood', r, r, 0.05, x, y + 0.75, z, {}, 14);
  L.cyl('trim', 0.06, 0.06, 0.75, x, y, z, {}, 6); L.cyl('trim', 0.3, 0.3, 0.04, x, y, z, {}, 8);
  L.col(r * 1.6, 0.8, r * 1.6, x, y + 0.4, z, { tag: 'table' });
}
/** A long counter along local x from x0 to x1 at z, the customer side at +z. */
function counter(L, x0, x1, z, depth = 0.6) {
  const len = x1 - x0, cx = (x0 + x1) / 2, y = FY;
  L.box('trim', len, TUNING.counterH, depth, cx, y + TUNING.counterH / 2, z);
  L.box('wood', len + 0.1, 0.06, depth + 0.12, cx, y + TUNING.counterH + 0.03, z);
  L.col(len, TUNING.counterH + 0.1, depth, cx, y + TUNING.counterH / 2, z, { tag: 'counter' });
}
/** Shelving against a wall: a dark frame with a strip of goods. */
function shelves(L, cx, z, len, h = TUNING.shelfH, ry = 0) {
  L.box('trim', len, h, 0.4, cx, FY + h / 2, z, { ry });
  L.box('goods', len - 0.2, h - 0.3, 0.02, cx + Math.sin(ry) * 0.21, FY + h / 2, z + Math.cos(ry) * 0.21, { ry });
}

export function furnish(B, info, kind) {
  FY = info.inside.y ?? 0.3;
  const L = info.local, I = info.inside, hw = I.w / 2, hd = I.d / 2, y = FY;
  const a = { counter: null, keeper: null, keeperYaw: 0, seats: [], lamps: [], extra: {} };
  const W = (x, z, h = 0) => L.world(x, y + h, z);
  const hang = (x, z) => { const ly = I.h + y - 0.65; lantern(L, x, ly, z); L.box('iron', 0.02, 0.4, 0.02, x, ly + 0.5, z); a.lamps.push(L.world(x, ly, z)); };
  L.box('cloth', Math.min(4, I.w * 0.4), 0.01, Math.min(3, I.d * 0.25), 0, y + 0.005, hd - 2.2); // a rug by the door

  if (kind === 'saloon') {
    // the bar down the left side, bottles on the back shelf, a mirror-ish dark panel
    const bx = -hw + 2.3;
    L.box('trim', 0.6, 1.05, I.d - 6, bx, y + 0.52, -1.5); L.box('wood', 0.75, 0.06, I.d - 5.9, bx, y + 1.08, -1.5);
    L.col(0.6, 1.1, I.d - 6, bx, y + 0.55, -1.5, { tag: 'counter' });
    L.box('trim', 0.4, 2.4, I.d - 6, -hw + 0.25, y + 1.2, -1.5);
    for (let i = 0; i < 18; i++) { const z = -1.5 - (I.d - 6) / 2 + 0.4 + i * (I.d - 6.8) / 17; L.cyl('bottle', 0.04, 0.035, 0.26, -hw + 0.5, y + 1.35 + (i % 2) * 0.55, z, {}, 6); }
    a.keeper = W(-hw + 1.2, -1.5); a.counter = W(bx + 1.1, -1.5); a.keeperYaw = L.yaw - Math.PI / 2; a.counterYaw = L.yaw + Math.PI / 2;
    // tables, chairs and a card table
    for (const [tx, tz, felt] of [[1.5, 2.5, false], [3.8, -1, true], [0.8, -4.2, false], [4.2, 3.6, false]]) {
      table(L, tx, tz, felt ? 0.75 : 0.55, felt);
      for (let k = 0; k < 4; k++) { const ang = k * Math.PI / 2 + 0.3, cx = tx + Math.sin(ang) * 0.95, cz = tz + Math.cos(ang) * 0.95; chair(L, cx, cz, ang + Math.PI); a.seats.push({ pos: W(cx, cz), yaw: L.yaw + ang + Math.PI }); }
    }
    // the piano against the back wall, a staircase to the balcony rooms
    L.solid('trim', 1.6, 1.3, 0.6, hw - 1.4, y + 0.65, -hd + 0.45); L.box('paintWhite', 1.3, 0.04, 0.14, hw - 1.4, y + 0.9, -hd + 0.8);
    chair(L, hw - 1.4, -hd + 1.4, 0);
    a.extra.piano = W(hw - 1.4, -hd + 0.8, 1); a.extra.pianoSeat = { pos: W(hw - 1.4, -hd + 1.4), yaw: L.yaw + Math.PI };
    for (let i = 0; i < 12; i++) L.solid('wood', 1.1, 0.25, 0.32, -hw + 0.7, y + 0.125 + i * 0.25, -hd + 1 + i * 0.3 + 2);
    hang(-1, 0); hang(2.5, -3); hang(2.5, 3);
    a.extra.dust = W(1.5, 0, 1.8);
  } else if (kind === 'general') {
    counter(L, -hw + 1.5, hw - 2.5, -hd + 3.2);
    shelves(L, 0, -hd + 0.25, I.w - 0.5);
    shelves(L, -hw + 0.25, 0, 5, TUNING.shelfH, Math.PI / 2); shelves(L, hw - 0.25, -1, 4, TUNING.shelfH, -Math.PI / 2);
    for (const [x, z] of [[hw - 1.2, hd - 2.5], [hw - 1.9, hd - 2.7], [-hw + 1.1, hd - 3.2]]) { L.cyl('wood', 0.32, 0.36, 0.85, x, y, z, {}, 10); L.col(0.7, 0.9, 0.7, x, y + 0.45, z); }
    L.box('hay', 0.8, 0.5, 0.5, -hw + 1.4, y + 0.25, 1.2); L.box('hay', 0.8, 0.5, 0.5, -hw + 1.4, y + 0.75, 1.3); // sacks
    L.cyl('iron', 0.35, 0.35, 0.8, 1.5, y, 1.5, {}, 10); L.cyl('iron', 0.06, 0.06, 2.6, 1.5, y + 0.8, 1.5, {}, 6); L.col(0.7, 0.8, 0.7, 1.5, y + 0.4, 1.5); // stove
    chair(L, 2.4, 1.6, -Math.PI / 2); a.seats.push({ pos: W(2.4, 1.6), yaw: L.yaw - Math.PI / 2 });
    a.keeper = W(0, -hd + 2.1); a.counter = W(0, -hd + 4.3); a.keeperYaw = L.yaw; a.counterYaw = L.yaw + Math.PI;
    hang(-2, 0); hang(2, -2);
  } else if (kind === 'gunsmith') {
    counter(L, -hw + 1, hw - 1, -hd + 3);
    L.box('trim', I.w - 1, 2.2, 0.15, 0, y + 1.3, -hd + 0.1);
    for (let i = 0; i < 9; i++) { const x = -hw + 1.2 + i * (I.w - 2.4) / 8; L.box('trim', 0.08, 1.05, 0.06, x, y + 1.35, -hd + 0.24, { rz: 0.06 }); L.box('iron', 0.025, 0.9, 0.025, x + 0.02, y + 1.95, -hd + 0.26, { rz: 0.06 }); }
    L.box('wood', 2.2, 0.08, 0.8, hw - 1.4, y + 0.9, 0.8); L.box('trim', 2.1, 0.86, 0.7, hw - 1.4, y + 0.43, 0.8); L.col(2.2, 0.95, 0.8, hw - 1.4, y + 0.47, 0.8); // workbench
    L.box('iron', 0.3, 0.15, 0.2, hw - 1.9, y + 1.0, 0.8); // vise
    a.keeper = W(0, -hd + 1.9); a.counter = W(0, -hd + 4.1); a.keeperYaw = L.yaw; a.counterYaw = L.yaw + Math.PI;
    hang(0, -1);
  } else if (kind === 'sheriff') {
    // two cells at the back, a desk, a rack, the bounty board by the door inside
    const cz = -hd + 1.5;
    for (let c = 0; c < 2; c++) {
      const cx = -hw + 1.6 + c * 3.2;
      for (let i = 0; i <= 10; i++) L.cyl('iron', 0.025, 0.025, I.h - 0.1, cx - 1.5 + i * 0.3, y, cz + 1.5, {}, 4);
      L.col(3.1, I.h, 0.12, cx, y + I.h / 2, cz + 1.5, { surface: 'metal', tag: 'cell' });
      L.solid('wood', 0.1, I.h, 3, cx + 1.55, y + I.h / 2, cz);
      L.box('cloth', 0.8, 0.3, 1.9, cx - 0.9, y + 0.35, cz - 0.3); // cot
    }
    L.box('wood', 1.8, 0.08, 0.9, hw - 1.8, y + 0.78, 0.6); L.box('trim', 1.7, 0.74, 0.8, hw - 1.8, y + 0.37, 0.6); L.col(1.8, 0.8, 0.9, hw - 1.8, y + 0.4, 0.6, { tag: 'desk' }); // desk
    chair(L, hw - 1.8, -0.2, 0); a.seats.push({ pos: W(hw - 1.8, -0.2), yaw: L.yaw + Math.PI });
    L.box('trim', 0.1, 1.2, 1.6, -hw + 0.12, y + 1.5, hd - 2); // rifle rack
    a.keeper = W(hw - 1.8, -0.15); a.counter = W(hw - 1.8, 1.6); a.keeperYaw = L.yaw; a.counterYaw = L.yaw + Math.PI;
    a.extra.cells = W(-hw + 1.6, cz); a.extra.board = W(-hw + 0.4, hd - 1, 1.2);
    hang(0, 0);
  } else if (kind === 'hotel') {
    counter(L, -hw + 0.8, -hw + 3.4, 0.5, 0.6);
    L.box('trim', 2.2, 1.6, 0.25, -hw + 2.1, y + 1.6, -0.7); // key board
    // partition walls: bath room (back right), bedroom (back left)
    const pz = -hd + 4.6, gaps = [[-hw + 1.2, 1.1], [hw - 1.5, 1.1]];
    let from = -hw;
    for (const [gx, gw] of [...gaps, [hw + 10, 0]]) { // wall pieces between the two doorways
      const to = Math.min(hw, gx - gw / 2);
      if (to - from > 0.05) L.solid('paintWhite', to - from, I.h, 0.12, (from + to) / 2, y + I.h / 2, pz);
      from = gx + gw / 2;
    }
    L.solid('paintWhite', 0.12, I.h, 4.5, 0, y + I.h / 2, -hd + 2.25); // between the bedroom and the bath
    L.cyl('iron', 0.55, 0.55, 0.55, hw - 1.5, y, -hd + 1.7, { sz: 1.9, sx: 1 }, 14); // tub
    L.box('water', 0.9, 0.02, 1.7, hw - 1.5, y + 0.5, -hd + 1.7);
    L.col(1.2, 0.6, 2.1, hw - 1.5, y + 0.3, -hd + 1.7, { tag: 'tub' });
    L.box('wood', 1.5, 0.35, 2.1, -hw + 1.2, y + 0.18, -hd + 1.6); L.box('cloth', 1.4, 0.15, 1.9, -hw + 1.2, y + 0.43, -hd + 1.6); L.box('paintWhite', 1.3, 0.1, 0.45, -hw + 1.2, y + 0.55, -hd + 0.75); // bed
    L.col(1.5, 0.6, 2.1, -hw + 1.2, y + 0.3, -hd + 1.6, { tag: 'bed' });
    for (let i = 0; i < 12; i++) L.solid('wood', 1.1, 0.25, 0.32, hw - 0.7, y + 0.125 + i * 0.25, hd - 1.2 - i * 0.3);
    chair(L, 2, 2, -0.6); chair(L, 0.8, 2.4, 0.4); a.seats.push({ pos: W(2, 2), yaw: L.yaw - 0.6 }, { pos: W(0.8, 2.4), yaw: L.yaw + 0.4 });
    a.keeper = W(-hw + 2.1, -0.3); a.counter = W(-hw + 2.1, 1.6); a.keeperYaw = L.yaw; a.counterYaw = L.yaw + Math.PI;
    a.extra.bath = W(hw - 1.5, -hd + 3.2); a.extra.bed = W(-hw + 1.2, -hd + 3.2);
    hang(0, 1.5); hang(hw - 1.5, -hd + 2); hang(-hw + 1.5, -hd + 2);
  }
  else if (kind === 'trading') {
    // Saltmesa Trading Post: counter, shelves of goods, pelts and blankets, saddles on a rack, barrels, a stove
    counter(L, -hw + 1.2, hw - 2.2, -hd + 3);
    shelves(L, 0, -hd + 0.25, I.w - 0.6);
    for (let i = 0; i < 5; i++) L.box(i % 2 ? 'tent' : 'sawdust', 0.9, 1.2, 0.04, -hw + 0.06, y + 1.4, -1.6 + i * 1.0, { ry: Math.PI / 2, rz: (i - 2) * 0.05 }); // pelts on the wall
    for (let i = 0; i < 4; i++) L.box(['cloth', 'paintTeal', 'awning', 'cloth'][i], 1.0, 0.16, 0.7, hw - 1.0, y + 0.08 + i * 0.16, 1.2); // folded blankets
    L.box('trim', 0.12, 1.0, 2.2, hw - 0.4, y + 0.5, -0.8); for (let i = 0; i < 2; i++) { L.box('cloth', 0.6, 0.35, 0.5, hw - 0.6, y + 1.15, -1.5 + i * 1.3); L.box('trim', 0.1, 0.25, 0.4, hw - 0.6, y + 1.4, -1.3 + i * 1.3); } // saddle rack
    L.col(0.8, 1.4, 2.4, hw - 0.6, y + 0.7, -0.8);
    for (const [x, z] of [[-hw + 1.0, hd - 1.6], [-hw + 1.7, hd - 1.4]]) { L.cyl('wood', 0.32, 0.36, 0.85, x, y, z, {}, 10); L.col(0.7, 0.9, 0.7, x, y + 0.45, z); }
    L.cyl('iron', 0.32, 0.32, 0.75, 1.2, y, 1.4, {}, 10); L.cyl('iron', 0.06, 0.06, 2.6, 1.2, y + 0.75, 1.4, {}, 6); L.col(0.7, 0.8, 0.7, 1.2, y + 0.4, 1.4);
    a.keeper = W(0, -hd + 1.8); a.counter = W(0, -hd + 4.2); a.keeperYaw = L.yaw; a.counterYaw = L.yaw + Math.PI;
    hang(-2, -0.5); hang(2.5, 0.5);
  } else if (kind === 'cantina') {
    // the cantina: a bar along the back, bottles, tables with benches, a guitar on the wall
    counter(L, -hw + 0.8, hw - 0.8, -hd + 2.4);
    L.box('trim', I.w - 1, 1.6, 0.3, 0, y + 1.4, -hd + 0.2);
    for (let i = 0; i < 16; i++) L.cyl('bottle', 0.04, 0.035, 0.26, -hw + 1 + i * (I.w - 2) / 15, y + 1.38 + (i % 2) * 0.5, -hd + 0.4, {}, 6);
    for (const [tx, tz] of [[-hw + 1.6, 1.4], [1.6, 0.9], [hw - 1.4, hd - 1.1]]) { // kept clear of the doorway on the left
      if (Math.abs(tz) > hd - 1) continue;
      L.box('wood', 1.6, 0.06, 0.8, tx, y + 0.75, tz); L.box('trim', 1.4, 0.72, 0.1, tx, y + 0.36, tz); L.col(1.6, 0.8, 0.8, tx, y + 0.4, tz, { tag: 'table' });
      for (const sz of [-1, 1]) { L.box('wood', 1.6, 0.06, 0.3, tx, y + 0.45, tz + sz * 0.65); L.box('trim', 1.4, 0.42, 0.06, tx, y + 0.21, tz + sz * 0.65); a.seats.push({ pos: W(tx, tz + sz * 0.65), yaw: L.yaw + (sz > 0 ? 0 : Math.PI) }); }
    }
    L.box('wood', 0.38, 0.9, 0.08, hw - 0.1, y + 1.6, 0.5, { ry: -Math.PI / 2, rz: 0.2 }); // guitar
    a.keeper = W(0, -hd + 1.4); a.counter = W(0, -hd + 3.5); a.keeperYaw = L.yaw; a.counterYaw = L.yaw + Math.PI;
    hang(-1.5, 0.5); hang(1.8, 1.5);
  } else if (kind === 'butcher') {
    counter(L, -hw + 0.6, hw - 0.6, -hd + 2.2);
    for (let i = 0; i < 5; i++) { const x = -hw + 0.9 + i * (I.w - 1.8) / 4; L.box('iron', 0.02, 0.4, 0.02, x, I.h + y - 0.35, -hd + 0.6); L.box('chili', 0.32, 0.6, 0.22, x, I.h + y - 0.85, -hd + 0.6); } // hanging meat
    L.cyl('barkOak', 0.4, 0.42, 0.8, hw - 0.9, y, hd - 1.2, {}, 10); L.cyl('logEnd', 0.4, 0.4, 0.02, hw - 0.9, y + 0.8, hd - 1.2, {}, 10); L.col(0.85, 0.85, 0.85, hw - 0.9, y + 0.4, hd - 1.2);
    a.keeper = W(0, -hd + 1.3); a.counter = W(0, -hd + 3.3); a.keeperYaw = L.yaw; a.counterYaw = L.yaw + Math.PI;
    hang(0, 0);
  } else if (kind === 'office') {
    // Blackstone Lumber Co. office: desk and chair, an iron safe (where the original deed sits, Part 15), files, a map
    L.box('wood', 1.8, 0.08, 0.9, 0, y + 0.78, -hd + 2); L.box('trim', 1.7, 0.74, 0.8, 0, y + 0.37, -hd + 2); L.col(1.8, 0.8, 0.9, 0, y + 0.4, -hd + 2, { tag: 'desk' });
    L.box('paintWhite', 0.5, 0.02, 0.35, -0.3, y + 0.83, -hd + 2); L.box('paintWhite', 0.3, 0.02, 0.4, 0.4, y + 0.83, -hd + 1.9, { ry: 0.3 });
    chair(L, 0, -hd + 1.1, Math.PI); a.seats.push({ pos: W(0, -hd + 1.1), yaw: L.yaw });
    L.solid('iron', 0.9, 1.2, 0.8, hw - 0.7, y + 0.6, -hd + 0.7, { surface: 'metal' }); L.box('trim', 0.2, 0.2, 0.04, hw - 0.7, y + 0.8, -hd + 1.12); // safe
    L.solid('trim', 0.8, 1.5, 0.6, -hw + 0.6, y + 0.75, -hd + 0.5); // files
    L.box('tent', 2.2, 1.4, 0.03, -1, y + 1.7, -hd + 0.03); // survey map
    L.cyl('iron', 0.32, 0.32, 0.75, hw - 1, y, hd - 1.5, {}, 10); L.cyl('iron', 0.06, 0.06, 2.6, hw - 1, y + 0.75, hd - 1.5, {}, 6); L.col(0.7, 0.8, 0.7, hw - 1, y + 0.4, hd - 1.5);
    a.extra.safe = W(hw - 0.7, -hd + 1.5);
    hang(0, 0);
  } else if (kind === 'bunkhouse') {
    // bunk beds along the walls, a stove in the middle, a table with benches
    const n = Math.max(2, Math.floor((I.w - 2) / 2.2));
    for (let i = 0; i < n; i++) for (const sz of [-1, 1]) {
      const x = -hw + 1.3 + i * (I.w - 2.6) / Math.max(1, n - 1), z = sz * (hd - 0.55);
      for (const lvl of [0.35, 1.45]) { L.box('wood', 1.9, 0.1, 0.85, x, y + lvl, z); L.box('cloth', 1.8, 0.12, 0.75, x, y + lvl + 0.1, z); }
      for (const sx of [-1, 1]) L.box('trim', 0.08, 2.0, 0.08, x + sx * 0.95, y + 1.0, z + sz * 0.38);
      L.col(2, 2, 0.9, x, y + 1, z, { tag: 'bunk' });
    }
    L.cyl('iron', 0.35, 0.35, 0.8, 0, y, 0, {}, 10); L.cyl('iron', 0.06, 0.06, I.h, 0, y + 0.8, 0, {}, 6); L.col(0.75, 0.85, 0.75, 0, y + 0.42, 0);
    if (I.w > 9) { L.box('wood', 2.2, 0.06, 0.8, 2.6, y + 0.75, 0); L.box('trim', 2, 0.72, 0.1, 2.6, y + 0.36, 0); L.col(2.2, 0.8, 0.8, 2.6, y + 0.4, 0); for (const sz of [-1, 1]) { L.box('wood', 2.2, 0.06, 0.28, 2.6, y + 0.45, sz * 0.62); a.seats.push({ pos: W(2.6, sz * 0.62), yaw: L.yaw + (sz > 0 ? 0 : Math.PI) }); } }
    hang(-2, 0); hang(2, 0);
  } else if (kind === 'cook') {
    // the camp cookhouse: a long table, a range, a serving counter by the door
    L.solid('iron', 1.6, 0.85, 0.8, -hw + 1.1, y + 0.42, -hd + 0.6, { surface: 'metal' }); L.cyl('iron', 0.08, 0.08, I.h, -hw + 0.6, y + 0.85, -hd + 0.4, {}, 6);
    for (let i = 0; i < 3; i++) L.cyl('iron', 0.18, 0.16, 0.22, -hw + 0.6 + i * 0.5, y + 0.86, -hd + 0.6, {}, 8);
    counter(L, 0.3, hw - 0.4, -hd + 2.2);
    L.box('wood', 0.8, 0.06, I.d - 4, -hw + 1.3, y + 0.75, 1); L.col(0.8, 0.8, I.d - 4, -hw + 1.3, y + 0.4, 1);
    for (const sx of [-1, 1]) { L.box('wood', 0.28, 0.06, I.d - 4, -hw + 1.3 + sx * 0.6, y + 0.45, 1); a.seats.push({ pos: W(-hw + 1.3 + sx * 0.6, 1), yaw: L.yaw + sx * Math.PI / 2 }); }
    shelves(L, hw - 1.4, -hd + 0.25, 2.2);
    a.keeper = W(hw / 2, -hd + 1.3); a.counter = W(hw / 2, -hd + 3.3); a.keeperYaw = L.yaw; a.counterYaw = L.yaw + Math.PI;
    hang(0, 0);
  }
  void yawToward; void THREE;
  return a;
}
