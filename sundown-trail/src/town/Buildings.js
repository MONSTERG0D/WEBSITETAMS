import * as THREE from 'three';
import { createKit, mapsOf } from '../world/props/Kit.js';
import { paintTile } from '../render/TextureDetail.js';
import { signGeometry } from './Signs.js';

/**
 * The western architecture kit (Part 9): painted plank walls with corner posts and trim bands, framed glass
 * windows (they glow warm after dusk), false-front facades with cornices and painted signs, gable, flat and shed
 * roofs with overhangs, porches with posts and awnings (balconies with railings on two-storey buildings),
 * boardwalks, hitching rails, water troughs, chimneys and lanterns. Special buildings: a barn stable with stalls,
 * an open blacksmith shed with a forge, a stone courthouse with a columned portico and a cupola, and a church with a
 * steeple. Everything goes through the Part 3 PropBuilder, so a whole town merges into one mesh per material.
 *
 * Buildings are laid out in their own frame: the front faces +Z (the street), x runs along the front, y is up from
 * the floor of the lot. buildBuilding() returns what the town needs to know: doors, lamps, chimneys, the interior
 * box, the porch, and a `local` helper that interiors use to place furniture in the same frame.
 */
export const TUNING = { storey: 3.3, floor: 0.3, porchDepth: 2.6, boardwalk: 2.6, overhang: 0.35, roofPitch: 0.42, wallT: 0.16 };

function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Part 16: painted at the texture-detail tier's size, with relief maps on Medium and High (see TextureDetail). */
function canvasTex(draw, seed, metres, size = 256, opts = {}) {
  const tile = paintTile(draw, prng(seed), metres, { base: size, ...opts });
  const t = tile.map; t.userData.metres = metres; t.userData.normalMap = tile.normalMap; t.userData.roughnessMap = tile.roughnessMap;
  return t;
}
/** Horizontal clapboard siding in a paint colour, weathered and peeling. */
const siding = (base, dark, light) => (x, R, S) => {
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  const rows = 8, h = S / rows;
  for (let r = 0; r < rows; r++) {
    x.fillStyle = `rgba(${R() < 0.5 ? '255,250,240' : '0,0,0'},${R() * 0.07})`; x.fillRect(0, r * h, S, h);
    x.fillStyle = dark; x.globalAlpha = 0.55; x.fillRect(0, r * h + h - 3, S, 3); x.globalAlpha = 0.25; x.fillStyle = light; x.fillRect(0, r * h, S, 2); x.globalAlpha = 1;
    for (let k = 0; k < 3; k++) { x.fillStyle = 'rgba(40,30,20,0.6)'; x.fillRect(R() * S, r * h + 3 + R() * (h - 8), 2, 2); } // nails
  }
  for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(110,85,60,${0.25 + R() * 0.35})`; x.fillRect(R() * S, R() * S, 3 + R() * 16, 1 + R() * 4); } // bare wood where the paint flaked
  for (let i = 0; i < 12; i++) { const gx = R() * S; x.fillStyle = 'rgba(60,45,30,0.12)'; x.fillRect(gx, 0, 2 + R() * 5, S); } // streaks
};

/** The town kit: the props kit plus paints, roofing, glass, lamps, awning canvas, goods, cloth and the sign atlas. */
export function createTownKit(seed, signTex, posterTex) {
  const kit = createKit(seed);
  const add = (name, tex, opts = {}) => { kit.tex[name] = tex; kit.materials[name] = new THREE.MeshStandardMaterial({ ...mapsOf(tex), roughness: 0.9, metalness: 0, envMapIntensity: 0.5, ...opts }); };
  add('paintWhite', canvasTex(siding('#d8d0bf', '#7d7466', '#ffffff'), seed + 21, 1.6, 256, { normalStrength: 0.6 }));
  add('paintBlue', canvasTex(siding('#7f93a0', '#3e4a52', '#c7d4dc'), seed + 22, 1.6, 256, { normalStrength: 0.6 }));
  add('paintGreen', canvasTex(siding('#71806a', '#363e32', '#b4c2a8'), seed + 23, 1.6, 256, { normalStrength: 0.6 }));
  add('paintOchre', canvasTex(siding('#b8925a', '#5e4627', '#e2c690'), seed + 24, 1.6, 256, { normalStrength: 0.6 }));
  add('paintRed', canvasTex(siding('#8a3b2a', '#4a1c14', '#c0705c'), seed + 25, 1.6, 256, { normalStrength: 0.6 }));
  add('shingle', canvasTex((x, R, S) => {
    x.fillStyle = '#5a4a3c'; x.fillRect(0, 0, S, S);
    const rows = 10, h = S / rows;
    for (let r = 0; r < rows; r++) { let px = -(r % 2) * 14; while (px < S) { const w = 18 + R() * 16, l = 60 + R() * 40; x.fillStyle = `rgb(${l},${l * 0.84},${l * 0.68})`; x.fillRect(px + 1, r * h + 1, w - 2, h - 1); x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(px, r * h + h - 3, w, 3); px += w; } }
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(${R() < 0.3 ? '90,110,70' : '20,15,10'},${R() * 0.2})`; x.fillRect(R() * S, R() * S, 2 + R() * 6, 2 + R() * 3); } // moss and grime
  }, seed + 26, 2));
  add('tin', canvasTex((x, R, S) => {
    x.fillStyle = '#7a7670'; x.fillRect(0, 0, S, S);
    for (let k = 0; k < 16; k++) { const gx = k * S / 16; x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(gx, 0, 4, S); x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(gx + 8, 0, 3, S); }
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${130 + R() * 40},${60 + R() * 20},30,${R() * 0.45})`; x.fillRect(R() * S, R() * S, 3 + R() * 20, 2 + R() * 12); } // rust
  }, seed + 27, 2), { roughness: 0.55, metalness: 0.55 });
  add('trim', canvasTex((x, R, S) => { x.fillStyle = '#3e3026'; x.fillRect(0, 0, S, S); for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '160,130,100'},${R() * 0.18})`; x.fillRect(R() * S, R() * S, 1 + R() * 3, 6 + R() * 30); } }, seed + 28, 0.8, 256, { small: true }));
  add('awning', canvasTex((x, R, S) => {
    for (let k = 0; k < 8; k++) { x.fillStyle = k % 2 ? '#e6dcc4' : '#8a3b2a'; x.fillRect(k * S / 8, 0, S / 8, S); }
    for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(60,40,20,${R() * 0.1})`; x.fillRect(R() * S, R() * S, 2 + R() * 10, 2 + R() * 5); }
  }, seed + 29, 2.4, 256, { small: true }), { side: THREE.DoubleSide, roughness: 1 });
  add('goods', canvasTex((x, R, S) => { // shelves of tins, jars, sacks and boxes
    x.fillStyle = '#2a2018'; x.fillRect(0, 0, S, S);
    for (let r = 0; r < 4; r++) { let px = 2; while (px < S - 10) { const w = 10 + R() * 22, h = 20 + R() * 34, hue = [20, 35, 50, 90, 200, 0, 10][Math.floor(R() * 7)]; x.fillStyle = `hsl(${hue},${30 + R() * 40}%,${25 + R() * 40}%)`; x.fillRect(px, r * 64 + 62 - h, w, h); x.fillStyle = 'rgba(255,240,210,0.5)'; x.fillRect(px + 2, r * 64 + 62 - h * 0.6, w - 4, 5); px += w + 2; } x.fillStyle = '#5a4430'; x.fillRect(0, r * 64 + 60, S, 4); }
  }, seed + 30, 1.8, 256, { small: true }));
  add('cloth', canvasTex((x, R, S) => { x.fillStyle = '#7a2e2a'; x.fillRect(0, 0, S, S); for (let i = 0; i < S; i += 4) { x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(i, 0, 1, S); x.fillRect(0, i, S, 1); } for (let k = 0; k < 6; k++) { x.fillStyle = 'rgba(220,190,120,0.5)'; x.fillRect(0, k * 44 + 10, S, 3); } }, seed + 31, 1.2, 256, { small: true }));
  add('felt', canvasTex((x, R, S) => { x.fillStyle = '#2f5a3a'; x.fillRect(0, 0, S, S); for (let i = 0; i < 2000; i++) { x.fillStyle = `rgba(0,0,0,${R() * 0.08})`; x.fillRect(R() * S, R() * S, 2, 2); } }, seed + 32, 1, 256, { small: true }));
  add('brick', canvasTex((x, R, S) => {
    x.fillStyle = '#6a4a3a'; x.fillRect(0, 0, S, S);
    for (let r = 0; r < 16; r++) for (let c = -1; c < 8; c++) { const l = 80 + R() * 40; x.fillStyle = `rgb(${l * 1.25},${l * 0.7},${l * 0.5})`; x.fillRect(c * 34 + (r % 2) * 17 + 1, r * 16 + 1, 32, 14); }
  }, seed + 33, 1.2));
  // Added for the outposts: snow, pine needles, cactus, terracotta, chilies, tent canvas, sawdust, teal door paint
  add('snow', canvasTex((x, R, S) => { x.fillStyle = '#e9eef2'; x.fillRect(0, 0, S, S); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '170,185,205' : '255,255,255'},${R() * 0.25})`; x.fillRect(R() * S, R() * S, 2 + R() * 8, 1 + R() * 4); } }, seed + 40, 2, 256, { small: true }), { roughness: 0.75, envMapIntensity: 0.7 });
  add('pine', canvasTex((x, R, S) => { x.fillStyle = '#23331f'; x.fillRect(0, 0, S, S); for (let i = 0; i < 2600; i++) { const g = 40 + R() * 50; x.strokeStyle = `rgba(${g * 0.6},${g},${g * 0.55},0.7)`; x.lineWidth = 1; const px = R() * S, py = R() * S; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (R() - 0.5) * 6, py + 4 + R() * 6); x.stroke(); } }, seed + 41, 1.2, 256, { small: true }), { roughness: 1 });
  add('cactus', canvasTex((x, R, S) => { x.fillStyle = '#5a7a44'; x.fillRect(0, 0, S, S); for (let k = 0; k < 12; k++) { x.fillStyle = 'rgba(30,50,25,0.45)'; x.fillRect(k * S / 12, 0, 3, S); x.fillStyle = 'rgba(160,190,120,0.25)'; x.fillRect(k * S / 12 + 6, 0, 4, S); } for (let i = 0; i < 300; i++) { x.fillStyle = 'rgba(230,220,180,0.6)'; x.fillRect(R() * S, R() * S, 1, 2); } }, seed + 42, 0.8, 256, { small: true }));
  add('terracotta', canvasTex((x, R, S) => { x.fillStyle = '#a5583a'; x.fillRect(0, 0, S, S); for (let i = 0; i < 1200; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '70,30,20' : '220,150,110'},${R() * 0.18})`; x.fillRect(R() * S, R() * S, 2 + R() * 5, 1 + R() * 3); } }, seed + 43, 0.6, 256, { small: true }));
  add('chili', canvasTex((x, R, S) => { x.fillStyle = '#9a1c12'; x.fillRect(0, 0, S, S); for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '60,8,5' : '220,70,40'},${R() * 0.4})`; x.fillRect(R() * S, R() * S, 4, 10); } }, seed + 44, 0.3, 256, { small: true }), { roughness: 0.5 });
  add('tent', canvasTex((x, R, S) => { x.fillStyle = '#d6ccb2'; x.fillRect(0, 0, S, S); for (let i = 0; i < S; i += 6) { x.fillStyle = 'rgba(0,0,0,0.05)'; x.fillRect(i, 0, 2, S); } for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(90,70,40,${R() * 0.15})`; x.fillRect(R() * S, R() * S, 4 + R() * 30, 3 + R() * 20); } }, seed + 45, 2, 256, { small: true }), { side: THREE.DoubleSide, roughness: 1 });
  add('sawdust', canvasTex((x, R, S) => { x.fillStyle = '#c7a066'; x.fillRect(0, 0, S, S); for (let i = 0; i < 3000; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '120,85,45' : '240,210,160'},${R() * 0.4})`; x.fillRect(R() * S, R() * S, 1 + R() * 3, 1 + R() * 2); } }, seed + 46, 1, 256, { small: true }), { roughness: 1 });
  add('paintTeal', canvasTex(siding('#3f7f80', '#1f4040', '#8fc0bc'), seed + 47, 1.2, 256, { normalStrength: 0.6 }));
  add('logEnd', canvasTex((x, R, S) => { x.fillStyle = '#c49a64'; x.fillRect(0, 0, S, S); for (let r = 8; r < S; r += 6 + R() * 4) { x.strokeStyle = `rgba(110,70,35,${0.3 + R() * 0.3})`; x.lineWidth = 1.5; x.beginPath(); x.arc(S / 2, S / 2, r, 0, 7); x.stroke(); } }, seed + 48, 0.7, 256, { small: true }));
  kit.materials.glass = new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.08, metalness: 0.6, envMapIntensity: 1.2, emissive: 0xffb060, emissiveIntensity: 0 });
  kit.materials.lamp = new THREE.MeshStandardMaterial({ color: 0xffe2a8, roughness: 0.3, emissive: 0xffb35a, emissiveIntensity: 0.15 });
  kit.materials.water = new THREE.MeshStandardMaterial({ color: 0x3a4a48, roughness: 0.05, metalness: 0.3 });
  kit.materials.signs = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.85, envMapIntensity: 0.4 });
  if (posterTex) kit.materials.posters = new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.95, envMapIntensity: 0.3 });
  kit.materials.bottle = new THREE.MeshStandardMaterial({ color: 0x3e5a2a, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 });
  for (const k of ['glass', 'lamp', 'water', 'signs', 'posters', 'bottle']) if (!kit.tex[k]) kit.tex[k] = { userData: { metres: 1 } };
  return kit;
}

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion();

/** A local frame for a building: draw in local coordinates, get world positions and colliders. */
export function frame(B, x, y, z, yaw) {
  const M = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
  const L = {
    M, x, y, z, yaw,
    world: (lx, ly, lz, out = new THREE.Vector3()) => out.set(lx, ly, lz).applyMatrix4(M),
    box: (key, w, h, d, lx, ly, lz, t = {}) => B.box(key, w, h, d, { ...t, x: lx, y: ly, z: lz, parent: M }),
    cyl: (key, r0, r1, h, lx, ly, lz, t = {}, segs = 8) => B.cyl(key, r0, r1, h, { ...t, x: lx, y: ly, z: lz, parent: M }, segs),
    geo: (key, g, lx, ly, lz, t = {}) => B.geometry(key, g, { ...t, x: lx, y: ly, z: lz, parent: M }),
    /** Collider for a local box centred at (lx, ly, lz). */
    col: (w, h, d, lx, ly, lz, extra = {}) => B.collider({ type: 'box', position: L.world(lx, ly, lz), size: new THREE.Vector3(w, h, d), rotationY: yaw + (extra.ry || 0), surface: extra.surface || 'wood', tag: extra.tag || 'building', object: extra.object || null }),
    solid: (key, w, h, d, lx, ly, lz, t = {}) => { L.box(key, w, h, d, lx, ly, lz, t); L.col(w, h, d, lx, ly, lz, { ry: t.ry, surface: t.surface }); },
  };
  return L;
}

/** A triangle (gable end) in the local XY plane, facing +Z, base `w`, height `h`. */
function gableGeo(w, h, metres = 1.6) {
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ShapeGeometry(s), uv = g.getAttribute('uv'), p = g.getAttribute('position');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / metres, p.getY(i) / metres);
  return g;
}

/**
 * One building. spec: { id, kind, x, z, y, yaw, w, d, stories, paint, roof: 'gable'|'flat'|'shed'|'gableSide',
 *   falseFront, porch, balcony, sign, interior, door: { x, w, batwing }, windows, chimney, hitch, trough, lamps }
 * @returns info { id, kind, spec, local, doors: [], lamps: [], chimneys: [], porch, inside: { w, d, h, y } , front }
 */
export function buildBuilding(B, spec, signs) {
  const S = TUNING, R = prng(hash(spec.id)), L = frame(B, spec.x, spec.y, spec.z, spec.yaw);
  const w = spec.w, d = spec.d, st = spec.stories || 1, H = st * S.storey, F = S.floor, paint = spec.paint || 'paintWhite';
  const info = { id: spec.id, kind: spec.kind, spec, local: L, doors: [], lamps: [], chimneys: [], windows: [], inside: null, front: L.world(0, 0, d / 2) };
  // floor platform (walkable)
  L.solid('wood', w, F, d, 0, F / 2, 0);
  // walls
  const T = S.wallT, door = spec.door || { x: 0, w: 1.3 }, dh = 2.45;
  if (spec.interior) {
    const wy = F + H / 2;
    L.solid(paint, w, H, T, 0, wy, -d / 2 + T / 2); // back
    L.solid(paint, T, H, d, -w / 2 + T / 2, wy, 0); L.solid(paint, T, H, d, w / 2 - T / 2, wy, 0); // sides
    const lw = door.x - door.w / 2 + w / 2, rw = w / 2 - (door.x + door.w / 2);
    if (lw > 0.05) L.solid(paint, lw, H, T, -w / 2 + lw / 2, wy, d / 2 - T / 2);
    if (rw > 0.05) L.solid(paint, rw, H, T, w / 2 - rw / 2, wy, d / 2 - T / 2);
    L.solid(paint, door.w, H - dh, T, door.x, F + dh + (H - dh) / 2, d / 2 - T / 2); // over the door
    // ceiling of the ground floor (also stops the camera rising through the roof)
    const ch = Math.min(H, S.storey + 0.2);
    L.box('wood', w - 2 * T, 0.1, d - 2 * T, 0, F + ch, 0); L.col(w, 0.3, d, 0, F + ch + 0.1, 0);
    info.inside = { w: w - 2 * T, d: d - 2 * T, h: ch, y: F };
    info.doors.push({ hinge: L.world(door.x - door.w / 2, F, d / 2 - T / 2), yaw: spec.yaw, w: door.w, h: dh, batwing: !!door.batwing, local: { x: door.x, z: d / 2 } });
  } else {
    L.solid(paint, w, H, d, 0, F + H / 2, 0);
    // a closed door on the front
    L.box('wood', door.w, dh, 0.06, door.x, F + dh / 2, d / 2 + 0.03);
    L.box('iron', 0.06, 0.06, 0.05, door.x + door.w * 0.35, F + 1.05, d / 2 + 0.07);
  }
  // door frame and step
  L.box('trim', door.w + 0.24, 0.14, 0.12, door.x, F + dh + 0.07, d / 2 + 0.02);
  for (const s of [-1, 1]) L.box('trim', 0.12, dh, 0.12, door.x + s * (door.w / 2 + 0.06), F + dh / 2, d / 2 + 0.02);
  // corner posts and trim bands
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.box('trim', 0.18, H + 0.1, 0.18, sx * (w / 2 - 0.02), F + H / 2, sz * (d / 2 - 0.02));
  for (let k = 0; k <= st; k++) { L.box('trim', w + 0.1, 0.14, 0.06, 0, F + k * S.storey - (k ? 0.07 : -0.07), d / 2 + 0.03); }
  // windows: front (beside the door, every storey) and sides
  const win = (lx, ly, lz, ry, ww = 0.95, wh = 1.35) => {
    const t = { ry };
    const off = (dx, dy, dz) => { const c = Math.cos(ry), s2 = Math.sin(ry); return [lx + dx * c + dz * s2, ly + dy, lz - dx * s2 + dz * c]; };
    L.box('glass', ww, wh, 0.03, ...off(0, 0, 0.02), t);
    if (spec.interior) L.box('glass', ww, wh, 0.03, ...off(0, 0, -T - 0.02), t);
    L.box('trim', ww + 0.2, 0.1, 0.1, ...off(0, wh / 2 + 0.05, 0.05), t); L.box('trim', ww + 0.3, 0.08, 0.16, ...off(0, -wh / 2 - 0.04, 0.07), t);
    for (const s of [-1, 1]) L.box('trim', 0.08, wh, 0.08, ...off(s * (ww / 2 + 0.04), 0, 0.05), t);
    L.box('trim', 0.05, wh, 0.04, ...off(0, 0, 0.04), t); L.box('trim', ww, 0.05, 0.04, ...off(0, 0, 0.04), t); // muntins
    info.windows.push(L.world(lx, ly, lz));
  };
  const nFront = spec.windows ?? Math.max(1, Math.floor((w - door.w - 1) / 2.6));
  for (let k = 0; k < st; k++) {
    const y = F + k * S.storey + 1.6;
    const slots = [];
    for (let i = 0; i < nFront + (k ? 1 : 0); i++) slots.push(-w / 2 + (i + 0.5) * (w / (nFront + (k ? 1 : 0))));
    for (const sx of slots) if (k > 0 || Math.abs(sx - door.x) > door.w / 2 + 0.75) win(sx, y, d / 2, 0);
    const side = Math.max(1, Math.floor(d / 4.5));
    for (let i = 0; i < side; i++) { const sz = -d / 2 + (i + 0.5) * (d / side); win(w / 2, y, sz, Math.PI / 2, 0.85); win(-w / 2, y, sz, -Math.PI / 2, 0.85); }
  }
  // roof
  const top = F + H, ov = S.overhang;
  if (spec.roof === 'flat') {
    L.box('tin', w + ov, 0.16, d + ov, 0, top + 0.08, 0);
    if (spec.snow) L.box('snow', w + ov - 0.2, 0.14, d + ov - 0.2, 0, top + 0.22, 0);
    L.box('trim', w + ov + 0.2, 0.3, 0.2, 0, top + 0.3, d / 2 + ov / 2); // cornice
    L.box('trim', w + ov, 0.3, 0.12, 0, top + 0.3, -d / 2 - ov / 2);
  } else if (spec.roof === 'shed') {
    const rise = 0.9, len = Math.hypot(d + ov * 2, rise), a = Math.atan2(rise, d + ov * 2);
    L.box('tin', w + ov * 2, 0.1, len, 0, top + rise / 2 + 0.05, 0, { rx: a });
    for (const s of [-1, 1]) L.geo(paint, new THREE.ShapeGeometry(triShape(d, rise, s)), s * w / 2, top, 0, { ry: s * Math.PI / 2 });
  } else { // gable with the ridge running front to back (hidden behind a false front) or across ('gableSide')
    const across = spec.roof === 'gableSide', span = across ? d : w, run = across ? w : d, rise = span / 2 * S.roofPitch * 1.6;
    const slope = Math.atan2(rise, span / 2), len = Math.hypot(span / 2, rise) + ov;
    for (const s of [-1, 1]) {
      if (across) L.box('shingle', run + ov * 2, 0.1, len, 0, top + rise / 2, s * (span / 4 + ov / 2 * Math.cos(slope)) * 1, { rx: s * slope });
      else { const front = spec.falseFront ? -0.05 : ov; L.box('shingle', len, 0.1, run + ov + front, s * (span / 4 + ov / 2 * Math.cos(slope)), top + rise / 2, (front - ov) / 2, { rz: -s * slope }); } // tucked behind a false front
    }
    const g1 = gableGeo(span, rise), g2 = gableGeo(span, rise);
    if (across) { L.geo(paint, g1, w / 2, top, 0, { ry: Math.PI / 2 }); L.geo(paint, g2, -w / 2, top, 0, { ry: -Math.PI / 2 }); }
    else { L.geo(paint, g1, 0, top, d / 2); L.geo(paint, g2, 0, top, -d / 2, { ry: Math.PI }); }
    info.ridge = top + rise;
    if (spec.snow) for (const s of [-1, 1]) { // Added for Greywind: snow lying on both slopes
      if (across) L.box('snow', run + ov * 1.6, 0.12, len * 0.92, 0, top + rise / 2 + 0.1, s * (span / 4 + ov / 2 * Math.cos(slope)) * 0.96, { rx: s * slope });
      else { const front = spec.falseFront ? -0.1 : ov * 0.8; L.box('snow', len * 0.92, 0.12, run + ov * 0.8 + front, s * (span / 4 + ov / 2 * Math.cos(slope)) * 0.96, top + rise / 2 + 0.1, (front - ov * 0.8) / 2, { rz: -s * slope }); }
    }
  }
  // false front with a cornice and the sign
  let signY = F + H + 0.55;
  if (spec.falseFront) {
    const ffH = (spec.roof === 'flat' ? 1.2 : (info.ridge || top) - top + 0.8);
    L.box(paint, w + 0.2, ffH, 0.12, 0, top + ffH / 2, d / 2 + 0.08);
    L.box('trim', w + 0.5, 0.22, 0.34, 0, top + ffH + 0.11, d / 2 + 0.12);
    if (R() < 0.6) L.box(paint, w * 0.4, 0.5, 0.12, 0, top + ffH + 0.47, d / 2 + 0.08); // stepped pediment
    signY = top + ffH * 0.45;
  }
  if (spec.sign && signs) {
    const sw = Math.min(w - 0.6, 5.6), sh = sw / 8 * 1.1;
    L.geo('signs', signGeometry(signs.uv(spec.sign), sw, sh, 0.06), 0, spec.falseFront ? signY : F + H + 0.4, d / 2 + 0.17);
  }
  // porch: deck, posts, roof or balcony
  if (spec.porch !== false) {
    const pd = S.porchDepth, pz = d / 2 + pd / 2;
    L.solid('wood', w + 0.4, 0.25, pd, 0, 0.125, pz);
    const nPost = Math.max(2, Math.round(w / 3.2) + 1), ph = Math.min(S.storey - 0.25, H - 0.1);
    for (let i = 0; i < nPost; i++) {
      let px = -w / 2 + 0.1 + i * (w - 0.2) / (nPost - 1);
      if (i > 0 && i < nPost - 1 && Math.abs(px - door.x) < door.w / 2 + 0.5) px = door.x + (px >= door.x ? 1 : -1) * (door.w / 2 + 0.6); // never a post in front of the door
      L.box('trim', 0.16, ph, 0.16, px, 0.25 + ph / 2, d / 2 + pd - 0.12);
      L.col(0.2, ph, 0.2, px, 0.25 + ph / 2, d / 2 + pd - 0.12);
    }
    if (spec.balcony && st > 1) {
      L.box('wood', w + 0.4, 0.18, pd, 0, 0.25 + ph + 0.09, pz);
      L.box('trim', w + 0.4, 0.08, 0.08, 0, 0.25 + ph + 1.0, d / 2 + pd - 0.06);
      for (let i = 0; i <= Math.round(w / 0.45); i++) L.box('trim', 0.05, 0.8, 0.05, -w / 2 + i * 0.45, 0.25 + ph + 0.58, d / 2 + pd - 0.06);
    } else {
      const a = 0.18, len = pd + 0.3;
      L.box(spec.awning ? 'awning' : 'tin', w + 0.5, 0.06, len / Math.cos(a), 0, 0.25 + ph + 0.12, d / 2 + len / 2 - 0.1, { rx: a });
      if (spec.snow) L.box('snow', w + 0.3, 0.08, len / Math.cos(a) - 0.2, 0, 0.25 + ph + 0.2, d / 2 + len / 2 - 0.1, { rx: a });
    }
    info.porch = { y: 0.25, d: pd };
    // lanterns on the outer posts
    if (spec.lamps !== false) for (const s of [-1, 1]) {
      const lx = s * (w / 2 - 0.1), ly = 0.25 + ph - 0.55, lz = d / 2 + pd - 0.3;
      lantern(L, lx, ly, lz);
      info.lamps.push(L.world(lx, ly, lz));
    }
  }
  // hitching rail and trough out front
  const fz = d / 2 + (spec.porch !== false ? S.porchDepth : 0) + 1.3;
  if (spec.hitch) {
    for (const s of [-1, 1]) L.box('wood', 0.14, 1.0, 0.14, s * 1.4, 0.5, fz);
    L.box('wood', 3.2, 0.12, 0.12, 0, 0.95, fz);
    L.col(3.2, 1.0, 0.2, 0, 0.5, fz, { tag: 'hitch' });
    info.hitch = L.world(0, 0, fz + 0.8);
  }
  if (spec.trough) {
    L.box('wood', 1.8, 0.55, 0.6, spec.hitch ? 2.8 : 0, 0.28, fz);
    L.box('water', 1.6, 0.02, 0.45, spec.hitch ? 2.8 : 0, 0.5, fz);
    L.col(1.8, 0.6, 0.6, spec.hitch ? 2.8 : 0, 0.3, fz, { tag: 'trough' });
  }
  // chimney
  if (spec.chimney) {
    const cx = (R() < 0.5 ? -1 : 1) * (w / 2 - 1.1), cz = -d / 2 - 0.4, chTop = (info.ridge || top) + 0.9; // against the back wall, outside
    L.solid('stone', 0.75, chTop - F, 0.75, cx, F + (chTop - F) / 2, cz);
    info.chimneys.push(L.world(cx, chTop + 0.1, cz));
  }
  info.top = top; info.height = info.ridge || top;
  B.objects++;
  return info;
}
/** Side wall under a shed roof: high at the back. `side` +1 is the +x wall (its local +x points to the front). */
const triShape = (d, rise, side) => { const s = new THREE.Shape(), hx = side > 0 ? d / 2 : -d / 2; s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(hx, rise); s.closePath(); return s; };
export function hash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

/** A hanging lantern: iron cage and a glowing glass body. */
export function lantern(L, lx, ly, lz) {
  L.box('iron', 0.24, 0.04, 0.24, lx, ly + 0.2, lz);
  L.box('lamp', 0.16, 0.26, 0.16, lx, ly + 0.04, lz);
  L.box('iron', 0.2, 0.04, 0.2, lx, ly - 0.11, lz);
  L.box('iron', 0.03, 0.2, 0.03, lx, ly + 0.32, lz);
}

/** A street lamp post with a lantern on top. @returns lantern world position */
export function lampPost(B, x, y, z) {
  const L = frame(B, x, y, z, 0);
  L.cyl('trim', 0.08, 0.06, 3.2, 0, 0, 0, {}, 6);
  L.box('trim', 0.5, 0.06, 0.06, 0.2, 3.1, 0);
  lantern(L, 0.42, 2.75, 0);
  L.col(0.2, 3.2, 0.2, 0, 1.6, 0, { tag: 'lamppost' });
  return L.world(0.42, 2.75, 0);
}

/** The livery stable: a big barn open at the front, stalls inside, hay loft door, a corral beside it. */
export function buildStable(B, spec, signs) {
  const L = frame(B, spec.x, spec.y, spec.z, spec.yaw), w = spec.w, d = spec.d, H = 4.4, F = 0.1;
  const info = { id: spec.id, kind: spec.kind, spec, local: L, doors: [], lamps: [], chimneys: [], windows: [], front: L.world(0, 0, d / 2) };
  L.box('wood', w, F, d, 0, F / 2, 0);
  L.solid('barn', w, H, 0.2, 0, H / 2, -d / 2 + 0.1);
  for (const s of [-1, 1]) L.solid('barn', 0.2, H, d, s * (w / 2 - 0.1), H / 2, 0);
  // front: two wall pieces either side of a wide opening, a big sliding door hung open
  const ow = w * 0.42;
  for (const s of [-1, 1]) L.solid('barn', (w - ow) / 2, H, 0.2, s * (ow / 2 + (w - ow) / 4), H / 2, d / 2 - 0.1);
  L.box('barn', ow, H - 3.2, 0.2, 0, 3.2 + (H - 3.2) / 2, d / 2 - 0.1);
  L.box('trim', ow / 2, 3.1, 0.1, ow / 2 + ow / 4 + 0.1, 1.55, d / 2 + 0.08);
  for (const s of [-1, 1]) L.box('paintWhite', 0.12, 3.1, 0.06, s * ow / 2, 1.55, d / 2 + 0.02); // white trim crosses
  // gambrel-ish roof: steep lower and shallow upper slopes, gable ends
  const rise1 = 1.6, rise2 = 1.4, half = w / 2;
  for (const s of [-1, 1]) {
    const l1 = Math.hypot(half * 0.35, rise1), a1 = Math.atan2(rise1, half * 0.35);
    L.box('tin', l1 + 0.2, 0.1, d + 0.6, s * (half - half * 0.35 / 2), H + rise1 / 2, 0, { rz: s * a1 });
    const l2 = Math.hypot(half * 0.65, rise2), a2 = Math.atan2(rise2, half * 0.65);
    L.box('tin', l2 + 0.1, 0.1, d + 0.6, s * (half * 0.65 / 2), H + rise1 + rise2 / 2, 0, { rz: s * a2 });
  }
  for (const zz of [d / 2, -d / 2]) {
    const sh = new THREE.Shape(); sh.moveTo(-half, 0); sh.lineTo(half, 0); sh.lineTo(half * 0.65, rise1); sh.lineTo(0, rise1 + rise2); sh.lineTo(-half * 0.65, rise1); sh.closePath();
    const g = new THREE.ShapeGeometry(sh), uv = g.getAttribute('uv'), p = g.getAttribute('position'); for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 1.5, p.getY(i) / 1.5);
    L.geo('barn', g, 0, H, zz, { ry: zz < 0 ? Math.PI : 0 });
  }
  L.box('wood', 1.4, 1.3, 0.1, 0, H + 0.9, d / 2 + 0.06); // hay loft door
  L.col(w, 0.4, d, 0, H + 0.2, 0);
  // stalls and hay
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { const z = -d / 2 + 2 + i * 2.8; L.box('wood', 2.6, 1.3, 0.08, s * (w / 2 - 1.5), 0.75, z); }
  L.box('hay', 1.2, 0.6, 2.2, -w / 2 + 1, 0.4, -d / 2 + 1.4); L.box('hay', 1.2, 0.6, 2.2, w / 2 - 1, 0.4, -d / 2 + 1.4);
  if (spec.sign && signs) L.geo('signs', signGeometry(signs.uv(spec.sign), Math.min(w * 0.6, 5.2), 0.7, 0.06), 0, H + 2.2, d / 2 + 0.2);
  for (const s of [-1, 1]) { lantern(L, s * (ow / 2 + 0.4), 2.9, d / 2 + 0.25); info.lamps.push(L.world(s * (ow / 2 + 0.4), 2.9, d / 2 + 0.25)); }
  info.inside = { w: w - 0.4, d: d - 0.4, h: H, y: F }; info.top = H; info.height = H + rise1 + rise2;
  info.counter = L.world(ow / 2 + 1.2, 0, d / 2 + 1.6); info.counterYaw = spec.yaw + Math.PI;
  B.objects++;
  return info;
}

/** The blacksmith: an open shed on posts with a stone forge, anvil, quench barrel and a rack of iron. */
export function buildSmithy(B, spec, signs) {
  const L = frame(B, spec.x, spec.y, spec.z, spec.yaw), w = spec.w, d = spec.d, H = 3.4;
  const info = { id: spec.id, kind: spec.kind, spec, local: L, doors: [], lamps: [], chimneys: [], windows: [], front: L.world(0, 0, d / 2) };
  L.box('stone', w, 0.12, d, 0, 0.06, 0);
  L.solid('wood', w, H, 0.15, 0, H / 2, -d / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { L.box('trim', 0.2, H, 0.2, sx * (w / 2 - 0.1), H / 2, sz * (d / 2 - 0.1)); L.col(0.22, H, 0.22, sx * (w / 2 - 0.1), H / 2, sz * (d / 2 - 0.1)); }
  L.box('tin', w + 0.6, 0.1, d + 0.8, 0, H + 0.3, 0, { rx: -0.15 });
  L.solid('stone', 1.8, 1.0, 1.4, -w / 2 + 1.4, 0.5, -d / 2 + 1.1); // forge
  L.box('stone', 0.8, 2.6, 0.8, -w / 2 + 1.4, 2.3, -d / 2 + 0.7); // flue
  L.box('burnt', 1.2, 0.05, 0.8, -w / 2 + 1.4, 1.02, -d / 2 + 1.1); // coals
  L.box('iron', 0.7, 0.25, 0.3, 0.2, 0.8, 0); L.box('iron', 0.3, 0.6, 0.3, 0.2, 0.35, 0); L.col(0.8, 1, 0.4, 0.2, 0.5, 0); // anvil
  L.cyl('wood', 0.34, 0.34, 0.85, w / 2 - 1, 0, 0.6, {}, 10); L.box('water', 0.55, 0.02, 0.55, w / 2 - 1, 0.84, 0.6);
  for (let i = 0; i < 6; i++) L.box('iron', 0.04, 1.6, 0.04, w / 2 - 0.8 - i * 0.12, 0.8, -d / 2 + 0.35, { rz: 0.15 });
  if (spec.sign && signs) L.geo('signs', signGeometry(signs.uv(spec.sign), Math.min(w - 1, 4.2), 0.55, 0.06), 0, H - 0.2, d / 2 + 0.05);
  info.forge = L.world(-w / 2 + 1.4, 1.1, -d / 2 + 1.1);
  info.chimneys.push(L.world(-w / 2 + 1.4, 3.7, -d / 2 + 0.7));
  info.top = H; info.height = H + 0.5;
  B.objects++;
  return info;
}

/** Crane's courthouse: stone, two storeys, a columned portico with steps, cornice and a cupola with a flag. */
export function buildCourthouse(B, spec, signs) {
  const L = frame(B, spec.x, spec.y, spec.z, spec.yaw), w = spec.w, d = spec.d, H = 7.4, F = 0.6;
  const info = { id: spec.id, kind: spec.kind, spec, local: L, doors: [], lamps: [], chimneys: [], windows: [], front: L.world(0, 0, d / 2) };
  L.solid('stone', w, F, d, 0, F / 2, 0);
  L.solid('stone', w, H, d, 0, F + H / 2, 0);
  for (let i = 0; i < 3; i++) L.solid('stone', w * 0.6, 0.2, 0.6, 0, 0.1 + i * 0.2, d / 2 + 2.6 - i * 0.6); // steps
  L.box('stone', w * 0.7, 0.3, 2.4, 0, F - 0.15, d / 2 + 1.2); L.col(w * 0.7, F, 2.4, 0, F / 2, d / 2 + 1.2);
  for (let i = 0; i < 4; i++) { const cx = -w * 0.3 + i * w * 0.2; L.cyl('paintWhite', 0.32, 0.28, H - 0.3, cx, F, d / 2 + 2.1, {}, 12); L.col(0.6, H, 0.6, cx, F + H / 2, d / 2 + 2.1); }
  L.box('stone', w * 0.72, 0.5, 2.8, 0, F + H - 0.05, d / 2 + 1.3); // portico entablature
  const sh = new THREE.Shape(); sh.moveTo(-w * 0.37, 0); sh.lineTo(w * 0.37, 0); sh.lineTo(0, 1.6); sh.closePath();
  const pg = new THREE.ShapeGeometry(sh), uv = pg.getAttribute('uv'), p = pg.getAttribute('position'); for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 1.6, p.getY(i) / 1.6);
  L.geo('stone', pg, 0, F + H + 0.2, d / 2 + 2.7); // pediment
  L.box('trim', w + 0.4, 0.35, d + 0.4, 0, F + H + 0.18, 0); // cornice
  L.box('stone', 2.4, 1.6, 2.4, 0, F + H + 1.1, 0); L.cyl('tin', 1.5, 0.05, 1.4, 0, F + H + 1.9, 0, {}, 8); // cupola
  L.cyl('iron', 0.03, 0.03, 3, 0, F + H + 3.2, 0, {}, 4); L.box('cloth', 1.0, 0.6, 0.02, 0.52, F + H + 5.8, 0);
  L.box('wood', 1.6, 2.8, 0.08, 0, F + 1.4, d / 2 + 0.04); // great door
  for (let k = 0; k < 2; k++) for (let i = 0; i < 5; i++) { if (k === 0 && i === 2) continue; const x = -w / 2 + (i + 0.5) * w / 5, y = F + 1.8 + k * 3.3; L.box('glass', 1, 1.8, 0.04, x, y, d / 2 + 0.03); L.box('stone', 1.3, 0.18, 0.2, x, y + 1.0, d / 2 + 0.08); }
  if (spec.sign && signs) L.geo('signs', signGeometry(signs.uv(spec.sign), 4.2, 0.55, 0.06), 0, F + H - 0.05, d / 2 + 2.75);
  for (const s of [-1, 1]) { lantern(L, s * 1.3, F + 2.6, d / 2 + 0.25); info.lamps.push(L.world(s * 1.3, F + 2.6, d / 2 + 0.25)); }
  info.top = F + H; info.height = F + H + 4;
  B.objects++;
  return info;
}

/** The church: white clapboard, steep gable, a steeple with a bell and a cross over the door. */
export function buildChurch(B, spec, signs) {
  const info = buildBuilding(B, { ...spec, roof: 'gable', falseFront: false, porch: false, interior: false, windows: 0, paint: 'paintWhite', chimney: false }, signs);
  const L = info.local, d = spec.d, top = info.top;
  L.solid('paintWhite', 2.4, top + 1.6, 2.4, 0, (top + 1.6) / 2, d / 2 + 1.0);
  L.box('trim', 2.6, 0.2, 2.6, 0, top + 1.7, d / 2 + 1.0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.box('paintWhite', 0.2, 1.6, 0.2, sx * 1.0, top + 2.6, d / 2 + 1.0 + sz * 1.0);
  L.cyl('iron', 0.35, 0.2, 0.5, 0, top + 2.1, d / 2 + 1.0, {}, 10); // bell
  L.box('trim', 2.6, 0.2, 2.6, 0, top + 3.5, d / 2 + 1.0);
  L.cyl('shingle', 1.7, 0.02, 3.8, 0, top + 3.6, d / 2 + 1.0, {}, 4);
  L.box('trim', 0.1, 1.0, 0.1, 0, top + 7.8, d / 2 + 1.0); L.box('trim', 0.6, 0.1, 0.1, 0, top + 8.0, d / 2 + 1.0);
  L.box('wood', 1.2, 2.3, 0.06, 0, 1.45, d / 2 + 2.23); L.box('trim', 0.2, 0.9, 0.1, 0, 3.1, d / 2 + 2.24); L.box('trim', 0.6, 0.12, 0.1, 0, 3.3, d / 2 + 2.24);
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const z = -d / 2 + 2 + i * (d - 3) / 2; L.box('glass', 0.05, 2.0, 0.8, s * (spec.w / 2 + 0.02), 1.9, z); L.cyl('trim', 0.42, 0.42, 0.05, s * (spec.w / 2 + 0.03), 2.9, z, { rz: Math.PI / 2 }, 10); }
  info.height = top + 8.5;
  return info;
}

/** A porch-front boardwalk segment between buildings (walkable). */
export function boardwalk(B, x, y, z, yaw, len, depth = TUNING.boardwalk) {
  const L = frame(B, x, y, z, yaw);
  L.solid('wood', len, 0.25, depth, 0, 0.125, 0);
  for (let i = 0; i <= Math.round(len / 2.5); i++) L.box('trim', 0.14, 0.14, 0.14, -len / 2 + i * len / Math.max(1, Math.round(len / 2.5)), 0.07, depth / 2 - 0.05);
}
