import * as THREE from 'three';
import { frame, lantern } from './Buildings.js';
import { signGeometry } from './Signs.js';

/**
 * Outpost architecture and set dressing (Part 9 detail pass).
 * Saltmesa (desert adobe): thick plastered walls with stepped parapets, protruding vigas and canales, deep-set
 *   windows with teal shutters, plank doors, ramadas of rough poles and latilla sticks, chile ristras, benches and
 *   terracotta pots, a stone well with a windlass, a windmill whose fan turns in the wind, a beehive horno oven,
 *   a walled cantina patio, a pole corral with a shade ramada, saguaros, a laundry line and a cattle skull.
 * Greywind (snowy logging camp): snow-capped pines ringing the clearing, stumps, log decks along a skidway,
 *   lumber stacks, sawdust heaps, a water tower, a steam donkey engine that smokes, canvas tents, firewood
 *   ricks, an outhouse, a log sled and a flagpole.
 * Every helper draws through a PropBuilder frame (L from Buildings.frame), so it all merges per material.
 */
export const TUNING = { pineScale: 1, fanSpeed: 0.9 };

const rnd = (R, a, b) => a + R() * (b - a);

// ---------------------------------------------------------------- Saltmesa: adobe
/**
 * An adobe building. spec: { id, kind, x, y, z, yaw, w, d, h, sign, ramada, door: { x }, windows, chimney, parapet, interior }
 * interior (added for enterable outposts): hollow 0.4 m walls, a doorway with a real swinging door, a beamed ceiling.
 * @returns info like buildBuilding (local, front, porch, lamps, chimneys, doors: [])
 */
export function adobeBuilding(B, spec, signs) {
  const L = frame(B, spec.x, spec.y, spec.z, spec.yaw), w = spec.w, d = spec.d, h = spec.h || 3.3, F = 0.15;
  const info = { id: spec.id, kind: spec.kind, spec, local: L, doors: [], lamps: [], chimneys: [], windows: [], front: L.world(0, 0, d / 2) };
  if (spec.interior) L.solid('adobe', w + 0.3, F, d + 0.3, 0, F / 2, 0, { surface: 'dirt' }); else L.box('adobe', w + 0.3, F, d + 0.3, 0, F / 2, 0);
  const dx = spec.door?.x ?? -w * 0.18, dw = 1.2, dh = 2.3, T = 0.4;
  if (spec.interior) { // hollow: thick walls, a doorway, a ceiling of vigas and latillas
    const wy = F + h / 2;
    L.solid('adobe', w, h, T, 0, wy, -d / 2 + T / 2, { surface: 'stone' });
    for (const s of [-1, 1]) L.solid('adobe', T, h, d, s * (w / 2 - T / 2), wy, 0, { surface: 'stone' });
    const lw = dx - dw / 2 + w / 2, rw = w / 2 - (dx + dw / 2);
    if (lw > 0.05) L.solid('adobe', lw, h, T, -w / 2 + lw / 2, wy, d / 2 - T / 2, { surface: 'stone' });
    if (rw > 0.05) L.solid('adobe', rw, h, T, w / 2 - rw / 2, wy, d / 2 - T / 2, { surface: 'stone' });
    L.solid('adobe', dw, h - dh, T, dx, F + dh + (h - dh) / 2, d / 2 - T / 2, { surface: 'stone' });
    L.box('wood', w - 2 * T, 0.06, d - 2 * T, 0, F + h - 0.2, 0); L.col(w, 0.3, d, 0, F + h, 0);
    const n = Math.max(3, Math.round(w / 0.95));
    for (let i = 0; i < n; i++) L.cyl('barkOak', 0.1, 0.1, d - 2 * T, -w / 2 + 0.45 + i * (w - 0.9) / (n - 1), F + h - 0.32, -(d - 2 * T) / 2, { rx: Math.PI / 2 }, 6);
    info.inside = { w: w - 2 * T, d: d - 2 * T, h: h - 0.4, y: F };
    info.doors.push({ hinge: L.world(dx - dw / 2, F, d / 2 - T / 2), yaw: spec.yaw, w: dw, h: dh, batwing: false, local: { x: dx, z: d / 2 }, floor: F });
  } else L.solid('adobe', w, h, d, 0, F + h / 2, 0, { surface: 'stone' });
  // parapet: a rim with a raised, stepped centre on the front (pueblo style)
  L.box('adobe', w + 0.1, 0.45, 0.35, 0, F + h + 0.22, d / 2 - 0.12); L.box('adobe', w + 0.1, 0.45, 0.35, 0, F + h + 0.22, -d / 2 + 0.12);
  for (const s of [-1, 1]) L.box('adobe', 0.35, 0.45, d, s * (w / 2 - 0.12), F + h + 0.22, 0);
  if (spec.parapet !== false) { L.box('adobe', w * 0.45, 0.5, 0.36, 0, F + h + 0.65, d / 2 - 0.12); L.box('adobe', w * 0.22, 0.4, 0.36, 0, F + h + 1.05, d / 2 - 0.12); }
  L.box('tin', w - 0.5, 0.06, d - 0.5, 0, F + h + 0.02, 0, { rx: 0.03 });
  // vigas (roof beams) poking through the front and back walls
  const nv = Math.max(3, Math.round(w / 0.95));
  for (let i = 0; i < nv; i++) { const x = -w / 2 + 0.45 + i * (w - 0.9) / (nv - 1); for (const s of [-1, 1]) L.cyl('barkOak', 0.11, 0.1, 0.65, x, F + h - 0.4, s * (d / 2 + 0.3), { rx: Math.PI / 2 }, 6); }
  // canales (drain spouts) at the sides
  for (const s of [-1, 1]) L.box('wood', 0.18, 0.12, 0.9, s * (w / 2 - 0.6), F + h - 0.05, d / 2 + 0.4);
  // door: plank door in a deep reveal, a heavy lintel beam
  if (!spec.interior) L.box('paintTeal', 1.2, 2.3, 0.08, dx, F + 1.15, d / 2 + 0.02);
  L.box('wood', 1.9, 0.22, 0.35, dx, F + 2.45, d / 2 + 0.05);
  if (!spec.interior) L.box('iron', 0.06, 0.06, 0.05, dx + 0.42, F + 1.1, d / 2 + 0.08);
  // deep-set windows with shutters opened back against the wall
  const wins = spec.windows ?? Math.max(1, Math.floor((w - 2) / 3));
  for (let i = 0; i < wins; i++) {
    let x = -w / 2 + (i + 0.5) * (w / wins); if (Math.abs(x - dx) < 1.4) x += x > dx ? 1.1 : -1.1;
    if (Math.abs(x) > w / 2 - 0.8) continue;
    L.box('glass', 0.8, 0.95, 0.04, x, F + 1.65, d / 2 + 0.01);
    if (spec.interior) L.box('glass', 0.8, 0.95, 0.04, x, F + 1.65, d / 2 - 0.42);
    L.box('wood', 1.2, 0.16, 0.3, x, F + 2.2, d / 2 + 0.05); L.box('wood', 1.0, 0.08, 0.28, x, F + 1.12, d / 2 + 0.05);
    for (const s of [-1, 1]) L.box('paintTeal', 0.42, 0.95, 0.05, x + s * 0.65, F + 1.65, d / 2 + 0.06, { ry: s * 0.25 });
    info.windows.push(L.world(x, F + 1.65, d / 2));
  }
  // a ramada (shade porch) of rough poles and sticks
  if (spec.ramada !== false) {
    const rd = 2.6, rh = 2.55;
    ramada(L, 0, d / 2 + rd / 2, w + 0.2, rd, rh);
    L.box('adobe', w, 0.12, rd, 0, 0.06, d / 2 + rd / 2); L.col(w, 0.12, rd, 0, 0.06, d / 2 + rd / 2);
    info.porch = { y: 0.12, d: rd };
    for (const s of [-1, 1]) { lantern(L, s * (w / 2 - 0.3), rh - 0.5, d / 2 + rd - 0.3); info.lamps.push(L.world(s * (w / 2 - 0.3), rh - 0.5, d / 2 + rd - 0.3)); }
  }
  // ristras by the door, a bench and pots
  ristra(L, dx + 0.85, F + 2.25, d / 2 + 0.2); ristra(L, dx - 0.85, F + 2.25, d / 2 + 0.2);
  if (w > 7) { bench(L, dx + 2.4, d / 2 + 0.5); pot(L, dx - 1.5, d / 2 + 0.45, 0.32); pot(L, w / 2 - 0.6, d / 2 + 0.5, 0.25); }
  if (spec.sign && signs) L.geo('signs', signGeometry(signs.uv(spec.sign), Math.min(w - 1.2, 5), 0.62, 0.06), 0, F + h - 0.9, d / 2 + 0.05);
  if (spec.chimney) { L.box('adobe', 0.7, 1.4, 0.7, w / 2 - 1, F + h + 0.7, -d / 2 + 0.8); info.chimneys.push(L.world(w / 2 - 1, F + h + 1.5, -d / 2 + 0.8)); }
  info.top = F + h; info.height = F + h + 1.2;
  B.objects++;
  return info;
}

/** A ramada: corner and middle poles, beams, and a layer of latilla sticks laid across. */
export function ramada(L, cx, cz, w, d, h) {
  const n = Math.max(2, Math.round(w / 3) + 1);
  for (let i = 0; i < n; i++) { const x = cx - w / 2 + 0.15 + i * (w - 0.3) / (n - 1); L.cyl('barkOak', 0.09, 0.08, h, x, 0, cz + d / 2 - 0.15, {}, 6); L.col(0.2, h, 0.2, x, h / 2, cz + d / 2 - 0.15); }
  L.box('barkOak', w + 0.3, 0.14, 0.14, cx, h + 0.05, cz + d / 2 - 0.15);
  L.box('barkOak', w + 0.3, 0.14, 0.14, cx, h + 0.05, cz - d / 2 + 0.1);
  const sticks = Math.round(w / 0.16);
  for (let i = 0; i < sticks; i++) L.box('wood', 0.05, 0.04, d + 0.2, cx - w / 2 + i * w / sticks, h + 0.15, cz, { ry: (i % 3 - 1) * 0.02 });
}
function ristra(L, x, y, z) {
  L.box('rope', 0.02, 0.9, 0.02, x, y - 0.45, z);
  for (let i = 0; i < 9; i++) for (let k = 0; k < 3; k++) L.cyl('chili', 0.035, 0.005, 0.13, x + (k - 1) * 0.045, y - 0.12 - i * 0.09, z + (k % 2) * 0.03, { rx: Math.PI, rz: (k - 1) * 0.3 }, 5);
}
function bench(L, x, z) { L.box('wood', 1.6, 0.08, 0.38, x, 0.48, z); for (const s of [-1, 1]) L.box('wood', 0.08, 0.45, 0.34, x + s * 0.7, 0.24, z); }
function pot(L, x, z, r) { L.cyl('terracotta', r * 0.65, r, r * 1.1, x, 0, z, {}, 10); L.cyl('terracotta', r, r * 0.8, r * 0.35, x, r * 1.1, z, {}, 10); L.cyl('cactus', r * 0.12, r * 0.1, r * 1.2, x, r * 1.2, z, {}, 6); }

/** A stone well with a roofed windlass and a bucket. */
export function well(B, x, y, z, yaw = 0) {
  const L = frame(B, x, y, z, yaw);
  L.cyl('stone', 1.0, 1.05, 0.9, 0, 0, 0, {}, 14); L.cyl('stone', 1.08, 1.08, 0.12, 0, 0.9, 0, {}, 14);
  L.box('water', 1.5, 0.02, 1.5, 0, 0.6, 0);
  for (const s of [-1, 1]) L.box('barkOak', 0.14, 2.0, 0.14, s * 0.95, 1.0, 0);
  L.cyl('barkOak', 0.09, 0.09, 1.9, -0.95, 1.6, 0, { rz: -Math.PI / 2 }, 8);
  L.box('rope', 0.03, 0.9, 0.03, 0.1, 1.15, 0); L.cyl('wood', 0.15, 0.12, 0.25, 0.1, 0.55, 0, {}, 8);
  for (const s of [-1, 1]) L.box('shingle', 2.6, 0.06, 1.0, 0, 2.25, s * 0.42, { rx: s * 0.6 });
  L.col(2.2, 1, 2.2, 0, 0.5, 0, { surface: 'stone', tag: 'well' });
}

/** A windmill on a timber tower. The fan is returned as its own mesh so the town can spin it. */
export function windmill(B, x, y, z, yaw, kit) {
  const L = frame(B, x, y, z, yaw), H = 9;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) L.box('grey', 0.16, H + 0.6, 0.16, sx * 1.1 * 0.7, (H + 0.6) / 2, sz * 1.1 * 0.7, { rx: -sz * 0.06, rz: sx * 0.06 });
  for (let k = 1; k < 5; k++) { const yy = k * H / 5, sp = 1.1 * (1 - yy / H * 0.55); for (const s of [-1, 1]) { L.box('grey', sp * 2, 0.08, 0.08, 0, yy, s * sp); L.box('grey', 0.08, 0.08, sp * 2, s * sp, yy, 0); } }
  L.box('wood', 1.4, 0.1, 1.4, 0, H, 0); L.box('iron', 0.5, 0.4, 1.0, 0, H + 0.35, 0);
  L.box('iron', 0.05, 0.6, 1.8, 0, H + 0.4, 1.3); L.box('paintWhite', 0.04, 0.8, 1.2, 0, H + 0.4, 2.2); // tail vane
  L.col(1.8, H, 1.8, 0, H / 2, 0, { tag: 'windmill' });
  L.cyl('wood', 0.5, 0.55, 0.9, 1.6, 0, 1.6, {}, 12); L.box('water', 0.85, 0.02, 0.85, 1.6, 0.86, 1.6); L.col(1.1, 0.9, 1.1, 1.6, 0.45, 1.6); // stock tank
  // the fan: 14 blades on a hub, built at the origin
  const blades = [];
  for (let i = 0; i < 14; i++) { const g = new THREE.BoxGeometry(0.22, 1.25, 0.03); g.translate(0, 0.95, 0); g.rotateY(0.35); g.rotateZ(i / 14 * Math.PI * 2); blades.push(g); }
  const hub = new THREE.CylinderGeometry(0.22, 0.22, 0.2, 10); hub.rotateX(Math.PI / 2);
  const ring = new THREE.TorusGeometry(1.5, 0.03, 4, 28);
  const geo = mergeAll([...blades, hub, ring]);
  const fan = new THREE.Mesh(geo, kit.materials.grey); fan.castShadow = true; fan.name = 'Windmill fan';
  fan.position.copy(L.world(0, H + 0.4, -0.55)); fan.rotation.order = 'YXZ'; fan.rotation.y = yaw;
  return fan;
}
function mergeAll(list) {
  // a tiny non-indexed merge (positions and normals only) for the fan
  const pos = [], nrm = [];
  for (const g of list) { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); pos.push(...n.getAttribute('position').array); nrm.push(...n.getAttribute('normal').array); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  return out;
}

/** A beehive horno oven with its little arched mouth. */
export function horno(B, x, y, z, yaw) {
  const L = frame(B, x, y, z, yaw), g = new THREE.SphereGeometry(1.0, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 1.05, 1);
  L.box('adobe', 2.3, 0.4, 2.3, 0, 0.2, 0); L.geo('adobe', g, 0, 0.38, 0);
  L.box('burnt', 0.5, 0.45, 0.1, 0, 0.62, 0.95); L.box('adobe', 0.2, 0.3, 0.2, 0.35, 1.25, -0.3);
  L.col(2.3, 1.4, 2.3, 0, 0.7, 0, { surface: 'stone' });
  return L.world(0.35, 1.45, -0.3);
}

/** A saguaro: trunk with two or three upturned arms. */
export function saguaro(B, x, y, z, R) {
  const L = frame(B, x, y, z, R() * 6.28), h = rnd(R, 3.2, 5.2), r = rnd(R, 0.22, 0.3);
  L.cyl('cactus', r, r * 0.92, h, 0, 0, 0, {}, 10);
  L.geo('cactus', new THREE.SphereGeometry(r * 0.92, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, h, 0);
  const arms = 1 + Math.floor(R() * 3);
  for (let i = 0; i < arms; i++) {
    const a = i * 2.3 + R(), ay = h * rnd(R, 0.35, 0.6), out = rnd(R, 0.55, 0.8), up = rnd(R, 0.8, 1.6), ar = r * 0.7;
    L.cyl('cactus', ar, ar, out, Math.cos(a) * 0.05, ay, Math.sin(a) * 0.05, { rz: -Math.PI / 2, ry: -a }, 8);
    L.cyl('cactus', ar, ar * 0.9, up, Math.cos(a) * (out + r * 0.4), ay - ar * 0.2, Math.sin(a) * (out + r * 0.4), {}, 8);
    L.geo('cactus', new THREE.SphereGeometry(ar * 0.9, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), Math.cos(a) * (out + r * 0.4), ay - ar * 0.2 + up, Math.sin(a) * (out + r * 0.4));
  }
  L.col(r * 2.4, h, r * 2.4, 0, h / 2, 0, { surface: 'wood', tag: 'cactus' });
}

/** Low adobe wall segment (a courtyard). */
export function adobeWall(B, x, y, z, yaw, len, h = 1.5) {
  const L = frame(B, x, y, z, yaw);
  L.solid('adobe', len, h, 0.45, 0, h / 2, 0, { surface: 'stone' });
  L.box('adobe', len + 0.05, 0.12, 0.5, 0, h + 0.05, 0);
}

/** A pole corral with a shade ramada, a trough and hay. @returns its centre */
export function corral(B, x, y, z, yaw, w, d, R) {
  const L = frame(B, x, y, z, yaw);
  const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [1.8, d / 2]], gate = [[-1.8, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2]];
  for (const line of [pts, gate]) for (let k = 1; k < line.length; k++) {
    const [ax, az] = line[k - 1], [bx, bz] = line[k], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 2.6));
    for (let i = 0; i <= n; i++) { const t = i / n; L.cyl('barkOak', 0.1, 0.09, 1.7, ax + (bx - ax) * t, 0, az + (bz - az) * t, { rz: (R() - 0.5) * 0.06 }, 6); }
    const ry = -Math.atan2(bz - az, bx - ax);
    for (const hh of [0.65, 1.3]) L.cyl('barkOak', 0.06, 0.06, len, ax, hh, az, { rz: -Math.PI / 2, ry, order: 'YZX' }, 5);
    L.col(len, 1.6, 0.25, (ax + bx) / 2, 0.8, (az + bz) / 2, { ry, tag: 'fence' });
  }
  ramada(L, w / 2 - 2.2, -d / 2 + 1.8, 4, 3.2, 2.4);
  L.box('wood', 2.2, 0.5, 0.6, -w / 2 + 2, 0.25, -d / 2 + 1); L.box('water', 2.0, 0.02, 0.45, -w / 2 + 2, 0.46, -d / 2 + 1);
  L.box('hay', 1.0, 0.5, 0.6, w / 2 - 1.2, 0.25, d / 2 - 1.4); L.box('hay', 1.0, 0.5, 0.6, w / 2 - 1.2, 0.75, d / 2 - 1.3);
  return L.world(0, 0, 0);
}

/** A cattle skull on a post. */
export function skullPost(B, x, y, z, yaw) {
  const L = frame(B, x, y, z, yaw);
  L.box('grey', 0.14, 1.5, 0.14, 0, 0.75, 0);
  L.box('paintWhite', 0.3, 0.42, 0.18, 0, 1.55, 0.1);
  for (const s of [-1, 1]) L.cyl('paintWhite', 0.05, 0.015, 0.55, s * 0.15, 1.72, 0.12, { rz: -s * 1.1 }, 5);
}

/** A laundry line between two poles with a few things drying. */
export function laundry(B, ax, ay, az, bx, bz) {
  const yaw = Math.atan2(-(bz - az), bx - ax), len = Math.hypot(bx - ax, bz - az), L = frame(B, ax, ay, az, yaw);
  L.cyl('grey', 0.06, 0.06, 2.1, 0, 0, 0, {}, 5); L.cyl('grey', 0.06, 0.06, 2.1, len, 0, 0, {}, 5);
  L.box('rope', len, 0.015, 0.015, len / 2, 2.0, 0);
  const keys = ['tent', 'cloth', 'paintBlue', 'tent'];
  for (let i = 0; i < 4; i++) L.box(keys[i], 0.6 + (i % 2) * 0.3, 0.75 - (i % 3) * 0.15, 0.02, len * (0.2 + i * 0.2), 1.6, 0, { rz: (i - 1.5) * 0.03 });
}

// ---------------------------------------------------------------- Greywind: logging camp
/** A conifer: trunk and stacked needle cones, snow on the upper tiers. */
export function pine(B, x, y, z, R, snow = true, scale = 1) {
  const L = frame(B, x, y, z, R() * 6.28), h = rnd(R, 9, 15) * scale * TUNING.pineScale, tiers = 5;
  L.cyl('barkOak', 0.28 * scale, 0.12 * scale, h * 0.68, 0, 0, 0, {}, 7);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers, r = (2.6 - t * 1.9) * scale * rnd(R, 0.9, 1.1), base = h * (0.18 + t * 0.15 * 4.2) * 0.62, th = h * 0.3;
    L.cyl('pine', r, 0.05, th, 0, base, 0, { ry: i }, 9);
    if (snow && i > 0) L.cyl('snow', r * 0.78, 0.05, th * 0.55, 0, base + th * 0.35, 0, { ry: i + 0.3 }, 9);
  }
  L.col(0.6 * scale, h, 0.6 * scale, 0, h / 2, 0, { surface: 'wood', tag: 'tree' });
}
export function stump(B, x, y, z, R, snow = true) {
  const L = frame(B, x, y, z, R() * 6), r = rnd(R, 0.3, 0.55), h = rnd(R, 0.35, 0.7);
  L.cyl('barkOak', r * 1.15, r, h, 0, 0, 0, {}, 8); L.cyl('logEnd', r * 0.95, r * 0.95, 0.02, 0, h, 0, {}, 8);
  if (snow) L.cyl('snow', r * 0.9, r * 0.5, 0.08, 0, h + 0.01, 0, {}, 8);
  L.col(r * 2, h, r * 2, 0, h / 2, 0, { tag: 'stump' });
}
/** A pyramid of logs (rows × base) along local x, ends showing rings. */
export function logDeck(B, x, y, z, yaw, len, base, R, snow = true) {
  const L = frame(B, x, y, z, yaw), r = 0.32;
  let row = 0, n = base;
  while (n > 0) {
    for (let i = 0; i < n; i++) {
      const lz = (i - (n - 1) / 2) * r * 2.05, ly = r + row * r * 1.75, ln = len * rnd(R, 0.92, 1.05);
      L.cyl('barkOak', r, r * rnd(R, 0.85, 1), ln, -ln / 2, ly, lz, { rz: -Math.PI / 2 }, 9);
      L.cyl('logEnd', r * 0.95, r * 0.95, 0.02, ln / 2 + 0.01, ly, lz, { rz: -Math.PI / 2 }, 9);
    }
    row++; n--;
  }
  if (snow) L.box('snow', len * 0.9, 0.1, r * 2, 0, r + (row - 1) * r * 1.75 + r * 0.9, 0);
  L.col(len, (base * 1.75 + 0.5) * r, base * r * 2.1, 0, (base * 1.75 + 0.5) * r / 2, 0, { tag: 'logs' });
}
/** Sawn lumber stacked with spacers. */
export function lumberStack(B, x, y, z, yaw, R) {
  const L = frame(B, x, y, z, yaw);
  for (let k = 0; k < 7; k++) { for (let i = 0; i < 6; i++) L.box('wood', 4.2, 0.06, 0.24, 0, 0.12 + k * 0.1, -0.75 + i * 0.3); L.box('grey', 0.08, 0.04, 1.8, -1.6, 0.17 + k * 0.1, 0); L.box('grey', 0.08, 0.04, 1.8, 1.6, 0.17 + k * 0.1, 0); }
  L.box('snow', 4.0, 0.06, 1.7, 0, 0.86, 0);
  L.col(4.3, 0.9, 1.9, 0, 0.45, 0, { tag: 'lumber' });
}
export function sawdustPile(B, x, y, z, r) { const L = frame(B, x, y, z, 0), g = new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1.3, 0.55, 1); L.geo('sawdust', g, 0, -0.05, 0); }
/** A water tower: four legs with bracing, a barrel tank, a cone roof and a spout. */
export function waterTower(B, x, y, z, yaw) {
  const L = frame(B, x, y, z, yaw), H = 5.5;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) L.box('barkOak', 0.24, H, 0.24, sx * 1.2, H / 2, sz * 1.2);
  for (const yy of [1.6, 3.6]) for (const s of [-1, 1]) { L.box('wood', 2.6, 0.12, 0.08, 0, yy, s * 1.2, { rz: 0.6 }); L.box('wood', 0.08, 0.12, 2.6, s * 1.2, yy, 0, { rx: 0.6 }); }
  L.box('wood', 3, 0.2, 3, 0, H, 0);
  L.cyl('wood', 1.6, 1.6, 2.6, 0, H + 0.1, 0, {}, 16); for (const yy of [0.5, 1.4, 2.3]) L.cyl('iron', 1.63, 1.63, 0.08, 0, H + 0.1 + yy, 0, {}, 16);
  L.cyl('shingle', 1.85, 0.05, 1.2, 0, H + 2.7, 0, {}, 16); L.cyl('snow', 1.7, 0.05, 1.0, 0, H + 2.82, 0, {}, 16);
  L.box('iron', 0.2, 0.2, 1.8, 0, H + 0.5, 2.3, { rx: 0.5 });
  L.col(2.8, H + 3, 2.8, 0, (H + 3) / 2, 0, { tag: 'tower' });
}
/** A steam donkey engine on a log sled: upright boiler, stack, drums and cable. @returns stack top */
export function steamDonkey(B, x, y, z, yaw) {
  const L = frame(B, x, y, z, yaw);
  for (const s of [-1, 1]) L.cyl('barkOak', 0.3, 0.3, 5.2, -2.6, 0.3, s * 0.9, { rz: -Math.PI / 2 }, 9);
  L.box('wood', 4.8, 0.15, 2.2, 0, 0.62, 0);
  L.cyl('iron', 0.7, 0.7, 2.4, -1.2, 0.7, 0, {}, 14); L.cyl('iron', 0.18, 0.18, 2.2, -1.2, 3.1, 0, {}, 8);
  for (const s of [-1, 1]) { L.cyl('iron', 0.42, 0.42, 0.9, 0.9, 1.15, s * 0.5, { rx: Math.PI / 2 }, 12); L.cyl('rope', 0.3, 0.3, 0.7, 0.9, 1.15, s * 0.5, { rx: Math.PI / 2 }, 10); }
  L.box('iron', 1.2, 0.5, 1.4, 1.9, 1.0, 0);
  L.col(5, 2.2, 2.4, 0, 1.1, 0, { surface: 'metal', tag: 'engine' });
  return L.world(-1.2, 5.4, 0);
}
/** A canvas wall tent on a plank floor, with a stovepipe. @returns stovepipe top */
export function tent(B, x, y, z, yaw) {
  const L = frame(B, x, y, z, yaw), w = 3.2, d = 4.2, wallH = 1.0, ridge = 2.5;
  L.box('wood', w + 0.4, 0.15, d + 0.4, 0, 0.08, 0);
  for (const s of [-1, 1]) L.box('tent', 0.04, wallH, d, s * w / 2, 0.15 + wallH / 2, 0);
  const slope = Math.atan2(ridge - wallH, w / 2), len = Math.hypot(w / 2, ridge - wallH) + 0.25;
  for (const s of [-1, 1]) { L.box('tent', len, 0.04, d + 0.3, s * w / 4, 0.15 + wallH + (ridge - wallH) / 2, 0, { rz: -s * slope }); L.box('snow', len * 0.9, 0.06, d, s * w / 4, 0.2 + wallH + (ridge - wallH) / 2, 0, { rz: -s * slope }); }
  for (const zz of [d / 2, -d / 2]) {
    const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, wallH); sh.lineTo(0, ridge); sh.lineTo(-w / 2, wallH); sh.closePath();
    const g = new THREE.ShapeGeometry(sh), uv = g.getAttribute('uv'), p = g.getAttribute('position'); for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 2, p.getY(i) / 2);
    L.geo('tent', g, 0, 0.15, zz, { ry: zz < 0 ? Math.PI : 0 });
  }
  L.box('trim', 0.9, 1.7, 0.03, 0, 1.0, d / 2 + 0.02); // door flap shadow
  L.cyl('iron', 0.07, 0.07, 1.2, w / 4, ridge - 0.4, -d / 4, {}, 6);
  L.col(w, ridge, d, 0, ridge / 2, 0, { surface: 'wood', tag: 'tent' });
  return L.world(w / 4, ridge + 0.85, -d / 4);
}
/** Split firewood stacked between end posts. */
export function firewood(B, x, y, z, yaw, len = 2.4) {
  const L = frame(B, x, y, z, yaw);
  for (const s of [-1, 1]) L.box('grey', 0.12, 1.4, 0.12, s * len / 2, 0.7, 0);
  for (let k = 0; k < 6; k++) for (let i = 0; i < Math.round(len / 0.22); i++) L.cyl(i % 2 ? 'logEnd' : 'barkOak', 0.1, 0.1, 0.6, -len / 2 + 0.11 + i * 0.22, 0.12 + k * 0.2, -0.3, { rx: Math.PI / 2 }, 5);
  L.box('snow', len, 0.08, 0.62, 0, 1.36, 0);
  L.col(len, 1.4, 0.7, 0, 0.7, 0, { tag: 'firewood' });
}
export function outhouse(B, x, y, z, yaw) {
  const L = frame(B, x, y, z, yaw);
  L.solid('grey', 1.2, 2.2, 1.2, 0, 1.1, 0); L.box('tin', 1.5, 0.06, 1.6, 0, 2.3, 0, { rx: -0.15 }); L.box('snow', 1.3, 0.08, 1.4, 0, 2.36, 0, { rx: -0.15 });
  L.box('wood', 0.75, 1.9, 0.04, 0, 0.98, 0.62); L.box('trim', 0.12, 0.08, 0.02, 0, 1.65, 0.65);
}
/** A logging sled loaded with logs. */
export function logSled(B, x, y, z, yaw, R) {
  const L = frame(B, x, y, z, yaw);
  for (const s of [-1, 1]) { L.box('wood', 4.2, 0.18, 0.18, 0, 0.1, s * 0.8); L.box('wood', 0.6, 0.18, 0.18, 2.3, 0.25, s * 0.8, { rz: 0.5 }); }
  for (const xx of [-1.5, 0, 1.5]) L.box('wood', 0.2, 0.2, 2, xx, 0.28, 0);
  for (let i = 0; i < 3; i++) L.cyl('barkOak', 0.3, 0.27, 5.4, -2.7, 0.68, (i - 1) * 0.6, { rz: -Math.PI / 2 }, 9);
  L.cyl('barkOak', 0.28, 0.25, 5.2, -2.6, 1.2, -0.3, { rz: -Math.PI / 2 }, 9); L.cyl('barkOak', 0.28, 0.25, 5.2, -2.6, 1.2, 0.3, { rz: -Math.PI / 2 }, 9);
  L.col(5.4, 1.5, 2, 0, 0.75, 0, { tag: 'sled' });
  void R;
}
export function flagpole(B, x, y, z) {
  const L = frame(B, x, y, z, 0);
  L.cyl('grey', 0.08, 0.05, 8, 0, 0, 0, {}, 6); L.box('cloth', 1.2, 0.7, 0.02, 0.62, 7.4, 0); L.cyl('stone', 0.5, 0.6, 0.4, 0, 0, 0, {}, 8);
  L.col(0.4, 8, 0.4, 0, 4, 0);
}
