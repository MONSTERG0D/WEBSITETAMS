import * as THREE from 'three';

/**
 * Prop builders (Part 3C). Each takes a PropBuilder `B`, the terrain and a placement, adds geometry and colliders.
 * All heights come from terrain.getHeightAt so nothing floats or sinks. Seeded randomness keeps the world identical.
 */
export const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; };

/** Rail fence from a to b (posts every ~3 m, two rails). burnt: charred and broken in places. */
export function fence(B, T, ax, az, bx, bz, R, { burnt = false, broken = 0 } = {}) {
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 3)), key = burnt ? 'burnt' : 'grey', ry = Math.atan2(-(bz - az), bx - ax);
  let prev = null;
  for (let k = 0; k <= n; k++) {
    const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = T.getHeightAt(x, z);
    const lean = burnt ? (R() - 0.5) * 0.25 : (R() - 0.5) * 0.05, ph = burnt && R() < 0.3 ? 0.6 + R() * 0.5 : 1.35;
    B.box(key, 0.16, ph, 0.16, { x, y: y + ph / 2 - 0.1, z, ry: R() * 0.3, rz: lean });
    if (prev && R() >= broken) {
      const [px, py, pz] = prev, dx = x - px, dz = z - pz, l = Math.hypot(dx, dz), slope = Math.atan2(y - py, l);
      for (const hgt of [0.5, 1.05]) {
        if (burnt && R() < 0.35) continue;
        B.box(key, l + 0.2, 0.1, 0.07, { x: (x + px) / 2, y: (y + py) / 2 + hgt, z: (z + pz) / 2, ry, rz: slope, order: 'YZX' });
      }
      B.collider({ type: 'box', position: new THREE.Vector3((x + px) / 2, (y + py) / 2 + 0.6, (z + pz) / 2), size: new THREE.Vector3(l, 1.2, 0.2), rotationY: ry, surface: 'wood', tag: 'fence' });
    }
    prev = [x, y, z];
  }
  B.objects++;
}

/** Telegraph pole line along a polyline (spacing ~38 m) with sagging wires. */
export function telegraph(B, T, pts, side, R) {
  const poles = [];
  let acc = 38;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], seg = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / seg, dz = (bz - az) / seg;
    for (let s = 0; s < seg; s += 2) {
      acc += 2;
      if (acc < 38) continue;
      acc = 0;
      const x = ax + dx * s - dz * side, z = az + dz * s + dx * side, y = T.getHeightAt(x, z);
      if (T.isWater(x, z)) continue;
      const ry = Math.atan2(-dz, dx);
      B.cyl('grey', 0.14, 0.11, 7.2, { x, y: y - 0.3, z, rz: (R() - 0.5) * 0.04 }, 6);
      B.box('grey', 0.12, 0.12, 1.6, { x, y: y + 6.5, z, ry });
      for (const o of [-0.65, 0.65]) B.cyl('iron', 0.04, 0.04, 0.14, { x: x + Math.sin(ry) * o, y: y + 6.56, z: z + Math.cos(ry) * o }, 5);
      poles.push({ x, y, z, ry });
      B.collider({ type: 'cylinder', position: new THREE.Vector3(x, y - 0.3, z), radius: 0.18, height: 7, surface: 'wood', tag: 'pole' });
    }
  }
  // wires: two catenaries between neighbouring poles' crossarm ends
  for (let i = 1; i < poles.length; i++) {
    const a = poles[i - 1], b = poles[i];
    for (const o of [-0.62, 0.62]) {
      const ox = (p) => [p.x + Math.sin(p.ry) * o, p.y + 6.66, p.z + Math.cos(p.ry) * o];
      const [ax, ay, az] = ox(a), [bx, by, bz] = ox(b), pts2 = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8; pts2.push([ax + (bx - ax) * t, ay + (by - ay) * t - Math.sin(t * Math.PI) * 0.9, az + (bz - az) * t]); }
      B.tube('iron', pts2, 0.012, 3);
    }
  }
  B.objects += poles.length;
}

/** The wooden road bridge (deck, stringers, posts and rails). bridge: { x, z, y, dirX, dirZ, length } */
export function bridge(B, T, br) {
  const ry = Math.atan2(-br.dirZ, br.dirX), L = br.length + 4, W = 6.4, y = br.y;
  const put = (key, w, h, d, along, up, across, extra = {}) => {
    const x = br.x + br.dirX * along - br.dirZ * across, z = br.z + br.dirZ * along + br.dirX * across;
    B.box(key, w, h, d, { x, y: y + up, z, ry, ...extra });
  };
  for (let s = -L / 2; s < L / 2; s += 0.5) put('wood', 0.46, 0.12, W, s + 0.25, -0.06, 0, { rx: (s * 7.3 % 1) * 0.01 });
  for (const a of [-2.6, -0.9, 0.9, 2.6]) put('grey', L, 0.3, 0.3, 0, -0.3, a);
  for (let s = -L / 2; s <= L / 2 + 0.01; s += L / 4) {
    for (const a of [-3.1, 3.1]) {
      const x = br.x + br.dirX * s - br.dirZ * a, z = br.z + br.dirZ * s + br.dirX * a, ground = Math.min(T.getHeightAt(x, z), br.waterLevel ?? y) - 1;
      B.box('grey', 0.3, y - ground + 1.1, 0.3, { x, y: (y + 1.1 + ground) / 2, z, ry });
    }
  }
  for (const a of [-3.1, 3.1]) { put('grey', L, 0.12, 0.12, 0, 1.05, a); put('grey', L, 0.1, 0.1, 0, 0.55, a); }
  B.collider({ type: 'box', position: new THREE.Vector3(br.x, y - 0.25, br.z), size: new THREE.Vector3(L, 0.5, W), rotationY: ry, surface: 'wood', tag: 'bridge' });
  for (const a of [-3.15, 3.15]) B.collider({ type: 'box', position: new THREE.Vector3(br.x - br.dirZ * a, y + 0.6, br.z + br.dirX * a), size: new THREE.Vector3(L, 1.2, 0.2), rotationY: ry, surface: 'wood', tag: 'bridge' });
  B.objects++;
}

/** Flat stepping stones across the ford. */
export function fordStones(B, T, ford, river, R) {
  const i = river.ford?.index ?? 0, a = Math.max(0, i - 2), b = Math.min(river.xs.length - 1, i + 2);
  const dx = river.xs[b] - river.xs[a], dz = river.zs[b] - river.zs[a], l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l;
  const half = (river.halfWidth[i] ?? 6) + 1.5;
  for (let s = -half; s <= half; s += 1.1 + R() * 0.4) {
    const x = ford.x + nx * s + dx / l * 4 + (R() - 0.5) * 0.4, z = ford.z + nz * s + dz / l * 4 + (R() - 0.5) * 0.4, y = Math.max(T.getHeightAt(x, z), (ford.y ?? 0) - 0.1);
    const g = new THREE.DodecahedronGeometry(0.45 + R() * 0.2, 0); g.scale(1, 0.35, 0.85);
    B.geometry('stone', g, { x, y: y + 0.02, z, ry: R() * 3 });
  }
  B.objects++;
}

/** A broken-down wagon: bed, side boards, one wheel off and lying in the dirt. */
export function wagon(B, T, x, z, ry, R) {
  const y = T.getHeightAt(x, z), tilt = 0.12 + R() * 0.1, c = Math.cos(ry), s = Math.sin(ry);
  const at = (f, sd, up, w, h, d, key = 'wood', extra = {}) => B.box(key, w, h, d, { x: x + c * f + s * sd, y: y + up, z: z - s * f + c * sd, ry, ...extra });
  at(0, 0, 0.85, 3.6, 0.12, 1.6, 'wood', { rx: tilt, order: 'YXZ' });
  at(0, 0.82, 1.1, 3.6, 0.5, 0.08, 'wood', { rx: tilt }); at(0, -0.82, 1.02, 3.6, 0.5, 0.08, 'wood', { rx: tilt });
  at(1.8, 0, 1.05, 0.08, 0.5, 1.6); at(-2.4, 0, 0.5, 1.8, 0.1, 0.12, 'grey', { rz: -0.35 }); // tongue on the ground
  const wheel = (wx, wz, wy, rotX, rotZ) => {
    const g = new THREE.TorusGeometry(0.55, 0.05, 6, 16); B.geometry('iron', g, { x: wx, y: wy, z: wz, ry, rx: rotX, rz: rotZ });
    for (let k = 0; k < 6; k++) B.box('wood', 0.05, 1.05, 0.05, { x: wx, y: wy, z: wz, ry, rx: rotX, rz: rotZ + (k / 6) * Math.PI });
  };
  wheel(x + c * 1.1 + s * 0.95, z - s * 1.1 + c * 0.95, y + 0.55, 0, 0);
  wheel(x - c * 1.1 + s * 0.95, z + s * 1.1 + c * 0.95, y + 0.55, 0, 0);
  wheel(x + c * 1.1 - s * 0.95, z - s * 1.1 - c * 0.95, y + 0.55, 0, 0);
  wheel(x - c * 0.4 - s * 2.6, T.getHeightAt(x - c * 0.4 - s * 2.6, z + s * 0.4 - c * 2.6) * 0 + z + s * 0.4 - c * 2.6, T.getHeightAt(x - c * 0.4 - s * 2.6, z + s * 0.4 - c * 2.6) + 0.06, Math.PI / 2, 0.1);
  B.collider({ type: 'box', position: new THREE.Vector3(x, y + 0.8, z), size: new THREE.Vector3(3.8, 1.6, 2), rotationY: ry, surface: 'wood', tag: 'wagon' });
  B.objects++;
}

export function haystack(B, T, x, z, R) {
  const y = T.getHeightAt(x, z), r = 1.4 + R() * 0.6, g = new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) * (1.15 + R() * 0.05) + Math.sin(pos.getX(i) * 4) * 0.05);
  g.computeVertexNormals();
  B.geometry('hay', g, { x, y: y - 0.15, z, ry: R() * 3 });
  B.collider({ type: 'cylinder', position: new THREE.Vector3(x, y - 0.2, z), radius: r * 0.85, height: r * 1.2, surface: 'grass', tag: 'hay' });
  B.objects++;
}

export function barrel(B, T, x, z, R, fallen = false) {
  const y = T.getHeightAt(x, z);
  if (fallen) B.cyl('wood', 0.32, 0.32, 0.9, { x, y: y + 0.32, z, rz: Math.PI / 2, ry: R() * 3 }, 10);
  else { B.cyl('wood', 0.3, 0.34, 0.45, { x, y, z }, 10); B.cyl('wood', 0.34, 0.3, 0.45, { x, y: y + 0.45, z }, 10); for (const h of [0.15, 0.75]) B.cyl('iron', 0.345, 0.345, 0.05, { x, y: y + h, z }, 10); }
  B.collider({ type: 'cylinder', position: new THREE.Vector3(x, y, z), radius: 0.36, height: 0.9, surface: 'wood', tag: 'barrel' });
  B.objects++;
}

export function crate(B, T, x, z, R, stack = 1) {
  const y = T.getHeightAt(x, z), ry = R() * 3;
  for (let k = 0; k < stack; k++) B.box('wood', 0.9, 0.8, 0.9, { x: x + (R() - 0.5) * 0.15, y: y + 0.4 + k * 0.8, z: z + (R() - 0.5) * 0.15, ry: ry + (R() - 0.5) * 0.3 });
  B.collider({ type: 'box', position: new THREE.Vector3(x, y + stack * 0.4, z), size: new THREE.Vector3(0.95, stack * 0.8, 0.95), rotationY: ry, surface: 'wood', tag: 'crate' });
  B.objects++;
}

/** Signpost with arrow boards pointing at places; boards read their uv from the sign atlas. */
export function signpost(B, T, x, z, boards, signUV) {
  const y = T.getHeightAt(x, z);
  B.cyl('grey', 0.1, 0.08, 2.9, { x, y: y - 0.2, z }, 6);
  boards.forEach((b, k) => {
    const ang = Math.atan2(-(b.tz - z), b.tx - x), g = new THREE.BoxGeometry(1.25, 0.26, 0.05), uv = g.getAttribute('uv'), [u0, v0, u1, v1] = signUV(b.index);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v0 + (v1 - v0) * uv.getY(i));
    g.translate(0.55, 0, 0);
    B.geometry('signs', g, { x, y: y + 2.35 - k * 0.32, z, ry: ang });
  });
  B.collider({ type: 'cylinder', position: new THREE.Vector3(x, y - 0.2, z), radius: 0.14, height: 2.9, surface: 'wood', tag: 'sign' });
  B.objects++;
}

// ------------------------------------------------------------------ landmarks
/** Hanging Oak: a huge gnarled oak with one long limb and a frayed rope. Foliage cards use the 'foliage' material. */
export function hangingOak(B, T, x, z, R) {
  const y = T.getHeightAt(x, z) - 0.3;
  B.tube('barkOak', [[x, y, z], [x + 0.2, y + 2.5, z - 0.1], [x + 0.1, y + 4.6, z + 0.2], [x - 0.3, y + 6.5, z]], 0.85, 10);
  B.tube('barkOak', [[x + 0.1, y + 4.4, z], [x + 3, y + 5.6, z + 0.4], [x + 6.5, y + 5.9, z + 0.6], [x + 9.5, y + 6.6, z + 0.2]], 0.32, 8); // the hanging limb
  B.tube('barkOak', [[x, y + 5.5, z], [x - 3, y + 7.5, z - 1.5], [x - 5, y + 8.7, z - 2.5]], 0.3, 7);
  B.tube('barkOak', [[x, y + 6, z], [x + 1.5, y + 8.5, z - 2.5], [x + 2.5, y + 10, z - 3.5]], 0.28, 7);
  B.tube('barkOak', [[x - 0.2, y + 6.3, z], [x - 1, y + 9.5, z + 2.5], [x - 0.5, y + 11, z + 3.5]], 0.26, 7);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; B.tube('barkOak', [[x, y + 0.8, z], [x + Math.cos(a) * 1.4, y + 0.2, z + Math.sin(a) * 1.4], [x + Math.cos(a) * 2.6, y - 0.2, z + Math.sin(a) * 2.6]], 0.3, 6); }
  // rope and noose
  const rx = x + 7.4, rz = z + 0.55, top = y + 5.95;
  B.cyl('rope', 0.03, 0.03, 2.3, { x: rx, y: top - 2.3, z: rz }, 5);
  B.geometry('rope', new THREE.TorusGeometry(0.2, 0.03, 5, 12), { x: rx, y: top - 2.5, z: rz, rx: Math.PI / 2 * 0.2 });
  // crown
  const cards = [];
  for (let k = 0; k < 60; k++) {
    const u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u), rr = 0.6 + 0.4 * Math.sqrt(R());
    cards.push([x + 0.5 + Math.cos(a) * s * 7 * rr, y + 9 + u * 3.2 * rr, z + Math.sin(a) * s * 6 * rr]);
  }
  for (const [cx, cy, cz] of cards) {
    const g = new THREE.PlaneGeometry(3, 3), n = g.getAttribute('normal'), p = g.getAttribute('position');
    const ry = R() * Math.PI, rx = (R() - 0.5) * 1.2;
    B.geometry('foliage', g, { x: cx, y: cy, z: cz, ry, rx });
    for (let i = 0; i < n.count; i++) { const v = new THREE.Vector3(p.getX(i) - x, p.getY(i) - (y + 8), p.getZ(i) - z).normalize(); n.setXYZ(i, v.x, v.y + 0.3, v.z); }
  }
  B.collider({ type: 'cylinder', position: new THREE.Vector3(x, y, z), radius: 0.95, height: 6, surface: 'wood', tag: 'tree' });
  B.objects++;
}

/** Old Mission ruins: broken adobe walls around a nave, a bell facade with arches, fallen bricks, a leaning cross. */
export function mission(B, T, x, z, R) {
  const y0 = T.getHeightAt(x, z), ry = 0.35, c = Math.cos(ry), s = Math.sin(ry);
  const P = (f, sd) => [x + c * f + s * sd, z - s * f + c * sd];
  const wall = (f0, sd0, f1, sd1, h, broken) => {
    const [ax, az] = P(f0, sd0), [bx, bz] = P(f1, sd1), len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.8)), ang = Math.atan2(-(bz - az), bx - ax);
    const ph = R() * 6, gap = Math.floor(R() * n);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, wx = ax + (bx - ax) * t, wz = az + (bz - az) * t, gy = T.getHeightAt(wx, wz);
      // eroded tops: a slow wave plus small crumbles, and one collapsed stretch
      let hh = broken ? h * (0.45 + 0.35 * Math.sin(k * 0.45 + ph) + 0.2 * Math.sin(k * 1.3 + ph * 2)) * (0.9 + R() * 0.1) : h;
      if (broken && Math.abs(k - gap) < 2) hh *= 0.25;
      B.box('adobe', len / n + 0.02, hh, 0.7, { x: wx, y: gy + hh / 2 - 0.2, z: wz, ry: ang });
      B.collider({ type: 'box', position: new THREE.Vector3(wx, gy + hh / 2, wz), size: new THREE.Vector3(len / n, hh, 0.7), rotationY: ang, surface: 'rock', tag: 'ruin' });
    }
  };
  wall(-12, -5, 12, -5, 4.5, true); wall(-12, 5, 12, 5, 4.5, true); wall(12, -5, 12, 5, 4, true); wall(-12, -5, -12, -2, 5, false); wall(-12, 2, -12, 5, 5, false);
  // bell facade: a tall front with two arched openings (made from piers and lintels)
  const [fx, fz] = P(-12.4, 0), fy = T.getHeightAt(fx, fz);
  for (const sd of [-4, -1.6, 1.6, 4]) { const [px, pz] = P(-12.4, sd); B.box('adobe', 0.8, 8.5, 0.9, { x: px, y: fy + 4.1, z: pz, ry: ry }); }
  B.box('adobe', 0.9, 1.4, 9, { x: fx, y: fy + 9, z: fz, ry });
  B.box('adobe', 0.9, 1.2, 4, { x: fx, y: fy + 10.3, z: fz, ry });
  B.box('adobe', 0.9, 0.6, 1.4, { x: fx, y: fy + 11.2, z: fz, ry });
  B.box('adobe', 0.95, 0.5, 9, { x: fx, y: fy + 6.2, z: fz, ry });
  B.geometry('iron', new THREE.SphereGeometry(0.42, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), { x: fx, y: fy + 9.95, z: fz }); // the old bell
  // leaning wooden cross and scattered bricks
  const [cx, cz] = P(4, 0), cy = T.getHeightAt(cx, cz);
  B.box('grey', 0.18, 3, 0.18, { x: cx, y: cy + 1.4, z: cz, rz: 0.18, ry }); B.box('grey', 1.4, 0.16, 0.16, { x: cx - 0.25, y: cy + 2.3, z: cz, rz: 0.18, ry });
  for (let k = 0; k < 40; k++) { const [bx, bz] = P((R() - 0.5) * 30, (R() - 0.5) * 16); B.box('adobe', 0.5, 0.18, 0.28, { x: bx, y: T.getHeightAt(bx, bz) + 0.05, z: bz, ry: R() * 3, rz: (R() - 0.5) * 0.3 }); }
  B.collider({ type: 'box', position: new THREE.Vector3(fx, fy + 4, fz), size: new THREE.Vector3(1, 8, 9), rotationY: ry, surface: 'rock', tag: 'ruin' });
  B.objects++;
}

/** Stone Arch: a weathered natural rock arch. */
export function stoneArch(B, T, x, z, R) {
  const ry = 0.8, c = Math.cos(ry), s = Math.sin(ry), span = 16, pts = [];
  const ga = T.getHeightAt(x - c * span / 2, z + s * span / 2), gb = T.getHeightAt(x + c * span / 2, z - s * span / 2), base = Math.min(ga, gb);
  for (let k = 0; k <= 12; k++) {
    const t = k / 12, a = Math.PI * t, f = -Math.cos(a) * span / 2, px = x + c * f, pz = z - s * f;
    const y = k === 0 ? ga - 1.5 : k === 12 ? gb - 1.5 : base + Math.sin(a) * 13;
    pts.push(new THREE.Vector3(px, y, pz));
  }
  const curve = new THREE.CatmullRomCurve3(pts), g = new THREE.TubeGeometry(curve, 48, 1, 10, false), pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = Math.floor(i / 11) / 48, w = 2.6 - Math.sin(t * Math.PI) * 1.1, n = 1 + 0.18 * Math.sin(pos.getX(i) * 0.9) * Math.cos(pos.getZ(i) * 0.8);
    const cp = curve.getPointAt(t); // TubeGeometry samples by arc length
    pos.setXYZ(i, cp.x + (pos.getX(i) - cp.x) * w * n, cp.y + (pos.getY(i) - cp.y) * w * 0.8 * n, cp.z + (pos.getZ(i) - cp.z) * w * n);
  }
  g.computeVertexNormals();
  const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 18, uv.getY(i) * 5);
  B.geometry('rock', g);
  for (const end of [pts[0], pts[12]]) B.collider({ type: 'cylinder', position: new THREE.Vector3(end.x, end.y - 1, end.z), radius: 2.8, height: 9, surface: 'rock', tag: 'rock' });
  B.objects++;
}

/** The burned Rourke Ranch: stone foundation and chimney, charred house shell, collapsed barn, burned fence, debris. */
export function ranchRuin(B, T, x, z, R) {
  const ry = 0.25, c = Math.cos(ry), s = Math.sin(ry);
  const P = (f, sd) => [x + c * f + s * sd, z - s * f + c * sd];
  const ground = (f, sd) => { const [px, pz] = P(f, sd); return [px, T.getHeightAt(px, pz), pz]; };
  // house: foundation, chimney still standing, charred wall stubs, a fallen door frame
  const [hx, hy, hz] = ground(-6, -4);
  B.box('stone', 9, 0.6, 7, { x: hx, y: hy + 0.1, z: hz, ry });
  const [chx, chz] = P(-10.2, -4);
  B.box('stone', 1.4, 7.5, 1.2, { x: chx, y: hy + 3.7, z: chz, ry });
  B.collider({ type: 'box', position: new THREE.Vector3(chx, hy + 3.7, chz), size: new THREE.Vector3(1.4, 7.5, 1.2), rotationY: ry, surface: 'rock', tag: 'ruin' });
  const stub = (f0, sd0, f1, sd1, maxH) => {
    const [ax, az] = P(f0, sd0), [bx, bz] = P(f1, sd1), len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 0.6), ang = Math.atan2(-(bz - az), bx - ax);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, h = maxH * (0.15 + 0.85 * Math.abs(Math.sin(k * 0.9 + R() * 2))) * (R() < 0.25 ? 0.2 : 1);
      B.box('burnt', len / n - 0.02, h, 0.12, { x: ax + (bx - ax) * t, y: hy + 0.4 + h / 2, z: az + (bz - az) * t, ry: ang, rz: (R() - 0.5) * 0.08 });
    }
    B.collider({ type: 'box', position: new THREE.Vector3((ax + bx) / 2, hy + 1.2, (az + bz) / 2), size: new THREE.Vector3(len, 2.4, 0.3), rotationY: ang, surface: 'wood', tag: 'ruin' });
  };
  stub(-10.3, -7.3, -1.7, -7.3, 2.8); stub(-1.7, -7.3, -1.7, -0.7, 2.2); stub(-10.3, -0.7, -6.8, -0.7, 2.6); stub(-4.4, -0.7, -1.7, -0.7, 1.4);
  for (let k = 0; k < 14; k++) { const [px, py, pz] = ground(-6 + (R() - 0.5) * 8, -4 + (R() - 0.5) * 6); B.box('burnt', 2 + R() * 2.5, 0.12, 0.22, { x: px, y: py + 0.5 + R() * 0.4, z: pz, ry: R() * 3, rz: (R() - 0.5) * 0.5, rx: (R() - 0.5) * 0.3 }); }
  // barn: three walls standing at angles, the roof slab slumped to the ground, one charred corner
  const [bx, by, bz] = ground(10, 4);
  const barnWall = (f, sd, w, h, rot, lean, key) => { const [px, pz] = P(f, sd); B.box(key, w, h, 0.15, { x: px, y: by + h / 2 * Math.cos(lean), z: pz, ry: ry + rot, rx: lean }); };
  barnWall(10, -1, 10, 5, 0, 0.05, 'barn'); barnWall(15, 4, 10, 4.6, Math.PI / 2, -0.28, 'barn'); barnWall(5.2, 4, 10, 3, Math.PI / 2, 0.5, 'burnt');
  const [rx2, rz2] = P(10.5, 5);
  B.box('grey', 11, 0.15, 7, { x: rx2, y: by + 1.4, z: rz2, ry, rx: 0.32, rz: 0.12 });
  B.collider({ type: 'box', position: new THREE.Vector3(bx, by + 2, bz), size: new THREE.Vector3(10, 4, 9), rotationY: ry, surface: 'wood', tag: 'ruin' });
  // burned fence around the old corral, and a forgotten wagon wheel
  const corner = (f, sd) => P(f, sd);
  const pts = [corner(-14, 9), corner(2, 12), corner(20, 12), corner(22, -6)];
  for (let k = 1; k < pts.length; k++) fence(B, T, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], R, { burnt: true, broken: 0.35 });
  B.objects++;
}
