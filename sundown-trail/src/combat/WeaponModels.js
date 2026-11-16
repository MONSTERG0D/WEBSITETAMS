import * as THREE from 'three';
import { SkinBuilder, loft } from '../characters/rig/MeshKit.js';
import { WREGIONS as R } from './WeaponTextures.js';

/**
 * Procedural mid-poly weapon models (Part 6): Drover revolver, Harlan lever repeater, Boone double-barrel,
 * Longshot rolling-block, ash bow and arrows, skinning knife with sheath, coiled lasso, plus the practice bottle.
 * Every part is a lofted cross-section (superellipse, so steel reads as machined blocks and wood as rounded stock),
 * vertex-coloured and mapped to the shared weapon atlas.
 *
 * Frame: the origin is the right palm (the 'handR' attach point), −Z is the muzzle direction, +Y is up.
 * Each model returns { root, sockets: { muzzle, eject?, foregrip?, nock?, string? }, parts: { cylinder?, hammer?, lever?, block?, barrels? }, tris }.
 */
export const TUNING = { segs: 14, smallSegs: 8, quality: 1 };

const C = (hex) => new THREE.Color(hex);
export const PALETTE = {
  blued: C('#2b3038'), steel: C('#6b6f74'), nickel: C('#b9bec2'), casehard: C('#7a6450'), brass: C('#c4954a'),
  walnut: C('#5e3420'), walnutDark: C('#3e2214'), ash: C('#b58d5c'), leather: C('#5d3a22'), leatherDark: C('#3e2616'),
  horn: C('#d9c8a6'), string: C('#e6dcc4'), rope: C('#b49a6a'), feather: C('#ece6dc'), featherRed: C('#9a3a26'),
  glassGreen: C('#3e6b3a'), glassBrown: C('#6a3e1c'), glassClear: C('#b9c9c4'), paper: C('#d9c99c'), blade: C('#c4c8cc'),
};
const W1 = () => [[0, 1]];

// ---------------------------------------------------------------- kit
/** A ring across the Z axis (width w, down/up half-heights) at z, centred on (x, y). */
const zr = (z, y, w, dn, up = dn, x = 0, e) => ({ c: [x, y, z], X: [1, 0, 0], Z: [0, 1, 0], rx: w, rzF: dn, rzB: up, e });
/** A ring across the Y axis (vertical parts) at y. */
const yr = (y, z, w, back, front = back, x = 0, e) => ({ c: [x, y, z], X: [1, 0, 0], Z: [0, 0, 1], rx: w, rzF: back, rzB: front, e });
/** A ring across the X axis (side-to-side parts). */
const xr = (x, y, z, h, d = h, e) => ({ c: [x, y, z], X: [0, 1, 0], Z: [0, 0, 1], rx: h, rzF: d, rzB: d, e });

/** Rings along a polyline in the YZ plane ([y, z, halfWidth, halfThickness]), oriented by the path tangent. */
function pathRings(pts, e) {
  return pts.map(([y, z, w, t, x = 0], i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let ty = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(ty, tz) || 1; ty /= l; tz /= l;
    return { c: [x, y, z], X: [1, 0, 0], Z: [0, -tz, ty], rx: w, rzF: t, rzB: t, e };
  });
}

/**
 * Lofts rings with a superellipse cross-section: e = 1 is round, 0.3 a rounded box. `mod(a, p, R)` may scale the
 * radius by angle (flutes, octagons).
 */
function part(b, rings, { region, color, segs = TUNING.segs, e = 1, caps = true, capStart = caps, capEnd = caps, mod = null, a0, a1 }) {
  loft(b, {
    segs, rings, region: () => region, color: typeof color === 'function' ? color : () => color, weights: W1, capStart, capEnd, a0, a1,
    shape: (p, u, v, Rg, a) => {
      const ee = Rg.e ?? e;
      const ca = Math.cos(a), sa = Math.sin(a);
      const fx = Math.sign(ca) * Math.abs(ca) ** ee, fz = Math.sign(sa) * Math.abs(sa) ** ee;
      const k = mod ? mod(a, p, Rg) : 1, rz = sa > 0 ? Rg.rzF : Rg.rzB, X = Rg.X || [1, 0, 0], Z = Rg.Z || [0, 0, 1];
      for (let i = 0; i < 3; i++) p[i] = Rg.c[i] + (X[i] * Rg.rx * fx - Z[i] * rz * fz) * k;
    },
  });
}
/** A straight round rod between two points (pins, screws, ramrods). */
function rod(b, p0, p1, r, region, color, segs = TUNING.smallSegs) {
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], l = Math.hypot(...d) || 1, t = d.map((x) => x / l);
  const X = Math.abs(t[1]) < 0.9 ? norm(cross(t, [0, 1, 0])) : norm(cross(t, [1, 0, 0])), Z = cross(X, t);
  part(b, [{ c: p0, X, Z, rx: r, rzF: r, rzB: r }, { c: p1, X, Z, rx: r, rzF: r, rzB: r }], { region, color, segs });
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Builds a mesh from the builder (static geometry: the skinning attributes are dropped). */
function mesh(b, material, name) {
  const g = b.geometry();
  g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight');
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material);
  m.name = name; m.castShadow = true; m.receiveShadow = false;
  m.raycast = () => {}; // never block combat or camera rays
  return m;
}
function socket(parent, name, p, rot = null) {
  const o = new THREE.Object3D(); o.name = name; o.position.fromArray(p); if (rot) o.rotation.set(...rot); parent.add(o); return o;
}
/** Long guns are modelled with the receiver at the origin; this slides them so the right palm sits on the wrist. */
function palmOnWrist(root) {
  const inner = new THREE.Group(); inner.name = 'body';
  for (const c of [...root.children]) inner.add(c);
  inner.position.set(0, -0.004, -0.07); root.add(inner);
}
const tris = (root) => { let n = 0; root.traverse((o) => { if (o.isMesh) n += o.geometry.index.count / 3; }); return n; };

// ---------------------------------------------------------------- revolver
function revolver(mat) {
  const root = new THREE.Group(), P = PALETTE, S = TUNING.segs;
  const BORE = 0.072, CY = 0.06; // bore height; cylinder axis (the top chamber lines up with the bore). Cylinder rear at z = 0
  const f = new SkinBuilder();
  // frame: lower body under the cylinder, recoil shield, top strap and the front block around the barrel threads
  part(f, [zr(0.014, 0.046, 0.0145, 0.016, 0.014, 0, 0.35), zr(-0.048, 0.047, 0.014, 0.015, 0.012, 0, 0.35), zr(-0.054, 0.052, 0.011, 0.01, 0.008, 0, 0.4)], { region: R.casehard, color: P.casehard, e: 0.35 });
  part(f, [zr(0.014, 0.068, 0.0155, 0.028, 0.022, 0, 0.45), zr(0.002, 0.068, 0.0155, 0.028, 0.022, 0, 0.45)], { region: R.casehard, color: P.casehard, e: 0.45 });
  part(f, [zr(0.006, 0.086, 0.0085, 0.0045, 0.003, 0, 0.4), zr(-0.05, 0.086, 0.0085, 0.0045, 0.003, 0, 0.4)], { region: R.engraved, color: P.blued, e: 0.4 });
  part(f, [zr(-0.046, 0.067, 0.0125, 0.025, 0.021, 0, 0.4), zr(-0.06, 0.07, 0.011, 0.018, 0.016, 0, 0.5)], { region: R.casehard, color: P.casehard, e: 0.4 });
  // barrel (subtly faceted at the breech), ejector housing and rod, front sight, base pin
  part(f, [zr(-0.058, BORE, 0.0095, 0.0095), zr(-0.072, BORE, 0.0088, 0.0088), zr(-0.235, BORE, 0.0078, 0.0078), zr(-0.237, BORE, 0.0068, 0.0068)], { region: R.steel, color: P.blued, segs: S, mod: (a) => 1 + 0.035 * Math.cos(a * 8) });
  part(f, [zr(-0.058, BORE - 0.014, 0.0048, 0.0048), zr(-0.17, BORE - 0.013, 0.0045, 0.0045)], { region: R.steel, color: P.blued, segs: 8 });
  part(f, [zr(-0.17, BORE - 0.013, 0.0035, 0.0035), zr(-0.178, BORE - 0.013, 0.0042, 0.0042)], { region: R.steel, color: P.nickel, segs: 8 });
  part(f, [zr(-0.226, BORE + 0.009, 0.0012, 0.002, 0.005, 0, 0.5), zr(-0.233, BORE + 0.009, 0.0012, 0.002, 0.002, 0, 0.5)], { region: R.steel, color: P.blued, segs: 6 });
  rod(f, [0, CY, 0.004], [0, CY, -0.062], 0.0028, R.steel, P.nickel, 6);
  // brass trigger guard and the trigger
  part(f, pathRings([[0.034, -0.042, 0.0045, 0.0022], [0.018, -0.044, 0.0045, 0.0022], [0.004, -0.035, 0.0045, 0.0022], [-0.002, -0.019, 0.0045, 0.0022], [0.002, -0.004, 0.0045, 0.0022], [0.016, 0.004, 0.0045, 0.0022], [0.032, 0.004, 0.0045, 0.0022]]), { region: R.brass, color: P.brass, segs: 6 });
  part(f, pathRings([[0.034, -0.018, 0.0016, 0.002], [0.024, -0.016, 0.0016, 0.0022], [0.014, -0.011, 0.0016, 0.0018], [0.008, -0.006, 0.0014, 0.0012]]), { region: R.steel, color: P.blued, segs: 6 });
  // grip: walnut panels around a brass backstrap, sweeping down and back from behind the hammer
  const grip = [[0.074, 0.019, 0.011, 0.011], [0.052, 0.023, 0.0122, 0.0145], [0.026, 0.029, 0.0127, 0.0158], [0.0, 0.035, 0.0133, 0.0168], [-0.025, 0.042, 0.0141, 0.0176], [-0.046, 0.048, 0.015, 0.0178], [-0.057, 0.051, 0.0143, 0.0158]];
  part(f, pathRings(grip, 0.75), { region: R.walnut, color: P.walnut, segs: S });
  part(f, pathRings(grip.map(([y, z, w, t]) => [y, z + t * 0.85, w * 0.55, 0.0032]), 0.6), { region: R.brass, color: P.brass, segs: 8 });
  root.add(mesh(f, mat, 'revolver'));
  // cylinder (fluted, turns a sixth per shot) on its own pivot
  const cyl = new THREE.Group(); cyl.position.set(0, CY, -0.022); root.add(cyl);
  const c = new SkinBuilder();
  part(c, [zr(0.022, 0, 0.0195, 0.0195), zr(0.018, 0, 0.021, 0.021), zr(-0.018, 0, 0.021, 0.021), zr(-0.022, 0, 0.0195, 0.0195)], { region: R.steel, color: P.blued, segs: 24, mod: (a, p) => 1 - 0.14 * Math.max(0, Math.cos(a * 6 + Math.PI / 6)) ** 6 * (Math.abs(p[2] + 0.022) < 0.013 ? 1 : 0.25) });
  cyl.add(mesh(c, mat, 'cylinder'));
  // hammer with a checkered spur
  const ham = new THREE.Group(); ham.position.set(0, 0.078, 0.014); root.add(ham);
  const h = new SkinBuilder();
  part(h, pathRings([[-0.012, -0.004, 0.0042, 0.006], [0.0, 0.0, 0.0042, 0.0065], [0.01, 0.006, 0.0036, 0.0048], [0.016, 0.017, 0.0032, 0.0042]], 0.5), { region: R.casehard, color: P.casehard, segs: 8 });
  ham.add(mesh(h, mat, 'hammer'));
  const out = { root, sockets: { muzzle: socket(root, 'muzzle', [0, BORE, -0.24]), eject: socket(root, 'eject', [0.012, CY, -0.01]) }, parts: { cylinder: cyl, hammer: ham } };
  const inner = new THREE.Group(); inner.name = 'body';
  for (const ch of [...root.children]) inner.add(ch);
  inner.position.set(0, 0, -0.035); root.add(inner); // the palm wraps the grip
  return out;
}

// ---------------------------------------------------------------- long-gun stock
/** Buttstock from the wrist (origin, under the right palm) back to the butt plate; returns nothing. */
function stock(b, color, { drop = 0.05, length = 0.33, comb = 0.026, butt = 0.06, region = R.walnut, plate = PALETTE.brass } = {}) {
  const L = length + 0.08, pts = [[0.0, 0.1, 0.0138, 0.019], [-0.008, 0.15, 0.0155, comb], [-drop * 0.55, 0.24, 0.0175, butt * 0.42], [-drop, L - 0.012, 0.0188, butt * 0.5], [-drop - 0.003, L, 0.0185, butt * 0.5]];
  part(b, pathRings(pts, 0.65), { region, color, segs: TUNING.segs, capEnd: false });
  part(b, pathRings([[-drop - 0.003, L, 0.019, butt * 0.51], [-drop - 0.004, L + 0.006, 0.019, butt * 0.51]], 0.55), { region: R.brass, color: plate, segs: TUNING.segs });
}
/** Pistol-grip checkering patch on both sides of the wrist. */
function wrist(b, color) {
  part(b, pathRings([[0.024, 0.03, 0.014, 0.017], [0.008, 0.07, 0.0132, 0.016], [0.0, 0.105, 0.0138, 0.019]], 0.7), { region: R.checker, color, capEnd: false });
}

// ---------------------------------------------------------------- repeater
function repeater(mat) {
  const root = new THREE.Group(), P = PALETTE, BORE = 0.052;
  const b = new SkinBuilder();
  // brass receiver with side plates and a loading gate
  part(b, [zr(0.035, 0.035, 0.0155, 0.026, 0.02, 0, 0.3), zr(-0.03, 0.036, 0.016, 0.03, 0.021, 0, 0.3), zr(-0.11, 0.038, 0.0155, 0.026, 0.019, 0, 0.3), zr(-0.118, 0.04, 0.012, 0.02, 0.014, 0, 0.4)], { region: R.brass, color: P.brass, e: 0.3 });
  part(b, [zr(-0.02, 0.027, 0.0165, 0.006, 0.004, 0, 0.3), zr(-0.08, 0.027, 0.0165, 0.006, 0.004, 0, 0.3)], { region: R.engraved, color: P.brass, e: 0.3 });
  // barrel and magazine tube, front band, sights
  part(b, [zr(-0.118, BORE, 0.0105, 0.0105), zr(-0.66, BORE, 0.0088, 0.0088), zr(-0.664, BORE, 0.0078, 0.0078)], { region: R.steel, color: P.blued, mod: (a) => 1 + 0.03 * Math.cos(a * 8) });
  part(b, [zr(-0.118, BORE - 0.02, 0.0085, 0.0085), zr(-0.6, BORE - 0.019, 0.008, 0.008), zr(-0.612, BORE - 0.019, 0.0065, 0.0065)], { region: R.steel, color: P.blued, segs: 10 });
  part(b, [zr(-0.55, BORE - 0.009, 0.012, 0.016, 0.014, 0, 0.6), zr(-0.565, BORE - 0.009, 0.012, 0.016, 0.014, 0, 0.6)], { region: R.steel, color: P.blued, segs: 10 });
  part(b, [zr(-0.645, BORE + 0.011, 0.0012, 0.003, 0.005, 0, 0.5), zr(-0.652, BORE + 0.011, 0.0012, 0.003, 0.003, 0, 0.5)], { region: R.brass, color: P.brass, segs: 6 });
  part(b, [zr(-0.2, BORE + 0.011, 0.005, 0.003, 0.004, 0, 0.4), zr(-0.215, BORE + 0.011, 0.005, 0.003, 0.004, 0, 0.4)], { region: R.steel, color: P.blued, segs: 6 });
  // forend under the barrel
  part(b, [zr(-0.13, BORE - 0.014, 0.0165, 0.02, 0.012, 0, 0.7), zr(-0.2, BORE - 0.014, 0.017, 0.022, 0.013, 0, 0.7), zr(-0.4, BORE - 0.012, 0.0155, 0.019, 0.012, 0, 0.7), zr(-0.43, BORE - 0.011, 0.012, 0.014, 0.01, 0, 0.7)], { region: R.walnut, color: P.walnut });
  // buttstock and wrist
  wrist(b, P.walnut);
  stock(b, P.walnut, { drop: 0.055, length: 0.36, butt: 0.11 });
  // trigger
  part(b, pathRings([[0.016, 0.02, 0.0016, 0.002], [0.004, 0.024, 0.0016, 0.002], [-0.006, 0.032, 0.0014, 0.0015]]), { region: R.steel, color: P.blued, segs: 6 });
  root.add(mesh(b, mat, 'repeater'));
  // finger lever (swings down on the pivot under the receiver front)
  const lever = new THREE.Group(); lever.position.set(0, 0.012, -0.035); root.add(lever);
  const l = new SkinBuilder();
  part(l, pathRings([[0.0, 0.0, 0.0042, 0.0045], [-0.012, 0.028, 0.0042, 0.0045], [-0.028, 0.055, 0.0042, 0.0045], [-0.05, 0.07, 0.0042, 0.0045], [-0.066, 0.06, 0.0042, 0.0045], [-0.066, 0.03, 0.0042, 0.0045], [-0.05, 0.0, 0.0042, 0.0045], [-0.03, -0.006, 0.0042, 0.0045], [-0.012, 0.0, 0.0042, 0.0045]], 0.7), { region: R.steel, color: P.blued, segs: 8 });
  lever.add(mesh(l, mat, 'lever'));
  const ham = new THREE.Group(); ham.position.set(0, BORE + 0.004, 0.03); root.add(ham);
  const h = new SkinBuilder();
  part(h, pathRings([[-0.01, -0.002, 0.0035, 0.005], [0.006, 0.004, 0.003, 0.004], [0.014, 0.012, 0.0028, 0.0035]], 0.5), { region: R.steel, color: P.blued, segs: 8 });
  ham.add(mesh(h, mat, 'hammer'));
  const out = { root, sockets: { muzzle: socket(root, 'muzzle', [0, BORE, -0.668]), eject: socket(root, 'eject', [0, 0.07, -0.05]), foregrip: socket(root, 'foregrip', [0, BORE - 0.035, -0.27]) }, parts: { lever, hammer: ham } };
  palmOnWrist(root); return out;
}

// ---------------------------------------------------------------- shotgun
function shotgun(mat) {
  const root = new THREE.Group(), P = PALETTE, BORE = 0.05;
  const b = new SkinBuilder();
  // case-hardened action with side locks
  part(b, [zr(0.04, 0.032, 0.02, 0.026, 0.022, 0, 0.35), zr(-0.02, 0.034, 0.021, 0.028, 0.024, 0, 0.35), zr(-0.075, 0.038, 0.02, 0.022, 0.02, 0, 0.35)], { region: R.casehard, color: P.casehard, e: 0.35 });
  part(b, [zr(0.03, 0.03, 0.0215, 0.012, 0.012, 0, 0.3), zr(-0.03, 0.03, 0.0215, 0.012, 0.012, 0, 0.3)], { region: R.engraved, color: P.casehard, e: 0.3 });
  wrist(b, P.walnutDark);
  stock(b, P.walnutDark, { drop: 0.06, length: 0.35, butt: 0.115, plate: P.blued });
  part(b, pathRings([[0.016, 0.014, 0.0016, 0.002], [0.004, 0.018, 0.0016, 0.002], [-0.006, 0.026, 0.0014, 0.0015]]), { region: R.steel, color: P.blued, segs: 6 });
  part(b, pathRings([[0.016, 0.026, 0.0016, 0.002], [0.004, 0.03, 0.0016, 0.002], [-0.006, 0.038, 0.0014, 0.0015]], 1), { region: R.steel, color: P.blued, segs: 6 });
  root.add(mesh(b, mat, 'shotgun'));
  // barrels break open on a hinge at the action's front
  const barrels = new THREE.Group(); barrels.position.set(0, BORE - 0.022, -0.075); root.add(barrels);
  const r = new SkinBuilder();
  for (const x of [-0.0105, 0.0105]) part(r, [zr(0, 0.022, 0.0115, 0.0115, 0.0115, x), zr(-0.06, 0.022, 0.011, 0.011, 0.011, x), zr(-0.6, 0.022, 0.0098, 0.0098, 0.0098, x), zr(-0.603, 0.022, 0.009, 0.009, 0.009, x)], { region: R.steel, color: P.blued, segs: 12 });
  part(r, [zr(0, 0.034, 0.005, 0.003, 0.002, 0, 0.5), zr(-0.6, 0.033, 0.0045, 0.003, 0.002, 0, 0.5)], { region: R.steel, color: P.blued, segs: 6 });
  part(r, [zr(-0.004, 0.006, 0.019, 0.014, 0.008, 0, 0.7), zr(-0.06, 0.006, 0.02, 0.016, 0.008, 0, 0.7), zr(-0.24, 0.008, 0.018, 0.014, 0.008, 0, 0.7), zr(-0.26, 0.009, 0.014, 0.01, 0.007, 0, 0.7)], { region: R.walnut, color: P.walnutDark });
  part(r, [zr(-0.596, 0.037, 0.0022, 0.0022)], { region: R.brass, color: P.brass, segs: 6 });
  barrels.add(mesh(r, mat, 'barrels'));
  // twin hammers
  const hams = new THREE.Group(); hams.position.set(0, 0.052, 0.028); root.add(hams);
  const h = new SkinBuilder();
  for (const x of [-0.014, 0.014]) part(h, pathRings([[-0.012, -0.004, 0.003, 0.005, x], [0.004, 0.002, 0.003, 0.004, x], [0.014, 0.012, 0.0026, 0.0034, x]], 0.5), { region: R.engraved, color: P.casehard, segs: 8 });
  hams.add(mesh(h, mat, 'hammers'));
  const out = { root, sockets: { muzzle: socket(barrels, 'muzzle', [0, 0.022, -0.605]), eject: socket(root, 'eject', [0, 0.06, -0.08]), foregrip: socket(root, 'foregrip', [0, BORE - 0.04, -0.22]) }, parts: { barrels, hammer: hams } };
  palmOnWrist(root); return out;
}

// ---------------------------------------------------------------- rolling-block rifle
function rifle(mat) {
  const root = new THREE.Group(), P = PALETTE, BORE = 0.05;
  const b = new SkinBuilder();
  part(b, [zr(0.04, 0.034, 0.016, 0.026, 0.02, 0, 0.3), zr(-0.03, 0.035, 0.017, 0.03, 0.02, 0, 0.3), zr(-0.085, 0.038, 0.0165, 0.024, 0.018, 0, 0.3)], { region: R.casehard, color: P.casehard, e: 0.3 });
  // long octagonal barrel, full-length forend with brass bands and a ramrod, ladder rear sight
  part(b, [zr(-0.085, BORE, 0.0115, 0.0115), zr(-0.4, BORE, 0.0098, 0.0098), zr(-0.8, BORE, 0.0088, 0.0088), zr(-0.803, BORE, 0.0078, 0.0078)], { region: R.steel, color: P.blued, segs: 8, mod: () => 1 });
  part(b, [zr(-0.09, BORE - 0.014, 0.0165, 0.02, 0.012, 0, 0.7), zr(-0.3, BORE - 0.013, 0.016, 0.02, 0.012, 0, 0.7), zr(-0.68, BORE - 0.011, 0.0135, 0.016, 0.01, 0, 0.7), zr(-0.7, BORE - 0.01, 0.011, 0.012, 0.009, 0, 0.7)], { region: R.walnut, color: P.walnut });
  for (const z of [-0.36, -0.66]) part(b, [zr(z, BORE - 0.008, 0.017, 0.024, 0.013, 0, 0.6), zr(z - 0.012, BORE - 0.008, 0.017, 0.024, 0.013, 0, 0.6)], { region: R.brass, color: P.brass, segs: 10 });
  rod(b, [0, BORE - 0.03, -0.12], [0, BORE - 0.028, -0.79], 0.0032, R.steel, P.nickel, 6);
  part(b, [zr(-0.17, BORE + 0.012, 0.006, 0.003, 0.012, 0, 0.35), zr(-0.19, BORE + 0.012, 0.006, 0.003, 0.012, 0, 0.35)], { region: R.steel, color: P.blued, segs: 6 });
  part(b, [zr(-0.792, BORE + 0.01, 0.0012, 0.002, 0.005, 0, 0.5), zr(-0.798, BORE + 0.01, 0.0012, 0.002, 0.002, 0, 0.5)], { region: R.steel, color: P.nickel, segs: 6 });
  wrist(b, P.walnut);
  stock(b, P.walnut, { drop: 0.05, length: 0.36, butt: 0.11, plate: P.blued });
  part(b, pathRings([[0.016, 0.02, 0.0016, 0.002], [0.004, 0.024, 0.0016, 0.002], [-0.006, 0.032, 0.0014, 0.0015]]), { region: R.steel, color: P.blued, segs: 6 });
  part(b, pathRings([[0.032, 0.018, 0.004, 0.002], [0.016, 0.022, 0.0045, 0.002], [0.0, 0.016, 0.0045, 0.002], [-0.004, 0.0, 0.004, 0.002]]), { region: R.steel, color: P.blued, segs: 6 });
  root.add(mesh(b, mat, 'rifle'));
  // rolling breech block and hammer (both rotate back to load)
  const block = new THREE.Group(); block.position.set(0, 0.035, -0.04); root.add(block);
  const k = new SkinBuilder();
  part(k, [xr(-0.012, 0, 0, 0.014, 0.014, 0.7), xr(0.012, 0, 0, 0.014, 0.014, 0.7)], { region: R.casehard, color: P.casehard, segs: 10 });
  part(k, pathRings([[0.012, 0.006, 0.003, 0.004], [0.022, 0.012, 0.003, 0.004], [0.026, 0.02, 0.0028, 0.0035]], 0.5), { region: R.steel, color: P.blued, segs: 6 });
  block.add(mesh(k, mat, 'block'));
  const ham = new THREE.Group(); ham.position.set(0, 0.035, 0.0); root.add(ham);
  const h = new SkinBuilder();
  part(h, [xr(-0.006, 0, 0, 0.012, 0.012, 0.8), xr(0.006, 0, 0, 0.012, 0.012, 0.8)], { region: R.casehard, color: P.casehard, segs: 10 });
  part(h, pathRings([[0.008, 0.004, 0.003, 0.004], [0.022, 0.008, 0.003, 0.004], [0.03, 0.016, 0.0025, 0.0035]], 0.5), { region: R.engraved, color: P.casehard, segs: 6 });
  ham.add(mesh(h, mat, 'hammer'));
  const out = { root, sockets: { muzzle: socket(root, 'muzzle', [0, BORE, -0.806]), eject: socket(root, 'eject', [0, 0.065, -0.045]), foregrip: socket(root, 'foregrip', [0, BORE - 0.035, -0.3]) }, parts: { block, hammer: ham } };
  palmOnWrist(root); return out;
}

// ---------------------------------------------------------------- bow and arrows
/** Bow held in the LEFT hand: the grip at the origin, limbs along ±Y, the arrow points −Z; the string is a separate line. */
function bow(mat, lineMat) {
  const root = new THREE.Group(), P = PALETTE;
  const b = new SkinBuilder();
  const limb = (s) => {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, y = s * (0.05 + t * 0.62), z = -0.06 * Math.sin(t * Math.PI * 0.55) + 0.05 * t * t * t; // reflex then recurve tips
      pts.push([y, z + 0.02, 0.016 * (1 - t * 0.55), 0.008 * (1 - t * 0.45)]);
    }
    part(b, pathRings(pts, 0.7), { region: R.ash, color: P.ash, segs: 10 });
    rod(b, [0, s * 0.67, 0.07], [0, s * 0.672, 0.075], 0.006, R.horn, P.horn, 6); // horn tip
  };
  limb(1); limb(-1);
  part(b, [yr(-0.075, 0.016, 0.015, 0.018, 0.016, 0, 0.8), yr(0.0, 0.018, 0.016, 0.02, 0.018, 0, 0.8), yr(0.075, 0.016, 0.015, 0.018, 0.016, 0, 0.8)], { region: R.leather, color: P.leather });
  root.add(mesh(b, mat, 'bow'));
  // string: 3 points (top tip, nock, bottom tip); the combat system moves the middle when drawing
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.668, 0.071, 0, 0, 0.11, 0, -0.668, 0.071], 3));
  const string = new THREE.Line(g, lineMat); string.name = 'bowstring'; string.frustumCulled = false; string.raycast = () => {};
  root.add(string);
  const nock = socket(root, 'nock', [0, 0, 0.11]);
  return { root, sockets: { muzzle: socket(root, 'muzzle', [0, 0.012, -0.02]), nock, string }, parts: {} };
}
/** One arrow: shaft, iron head, three fletchings. Origin at the nock, pointing −Z. */
export function arrowGeometry() {
  const b = new SkinBuilder(), P = PALETTE;
  part(b, [zr(0, 0, 0.0042, 0.0042), zr(-0.7, 0, 0.0045, 0.0045)], { region: R.ash, color: P.ash, segs: 6 });
  part(b, [zr(-0.7, 0, 0.006, 0.006), zr(-0.73, 0, 0.0075, 0.0075, 0.0075, 0, 0.6), zr(-0.76, 0, 0.0005, 0.0005)], { region: R.steel, color: P.steel, segs: 6 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a), X = [cx, cy, 0], Z = [-cy, cx, 0];
    part(b, [0.02, 0.05, 0.1, 0.13].map((z, k) => ({ c: [cx * 0.012 * [0.6, 1, 1, 0.6][k], cy * 0.012 * [0.6, 1, 1, 0.6][k], -z], X, Z, rx: 0.011 * [0.4, 1, 0.9, 0.3][k], rzF: 0.0008, rzB: 0.0008 })), { region: R.feather, color: i === 0 ? P.featherRed : P.feather, segs: 4 });
  }
  const g = b.geometry(); g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight'); g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- knife
function knife(mat) {
  const root = new THREE.Group(), P = PALETTE;
  const b = new SkinBuilder();
  // handle along −Z from the palm, brass guard, blade with a clipped point (flat, thin cross-section)
  part(b, [zr(0.05, 0, 0.012, 0.014, 0.014, 0, 0.8), zr(0.0, 0, 0.0115, 0.015, 0.015, 0, 0.8), zr(-0.05, 0, 0.011, 0.013, 0.013, 0, 0.8)], { region: R.horn, color: P.horn });
  part(b, [zr(-0.05, 0, 0.012, 0.022, 0.016, 0, 0.6), zr(-0.058, 0, 0.012, 0.022, 0.016, 0, 0.6)], { region: R.brass, color: P.brass, segs: 10 });
  part(b, [zr(-0.058, 0.002, 0.003, 0.014, 0.012, 0, 0.5), zr(-0.12, 0.0, 0.0025, 0.016, 0.011, 0, 0.5), zr(-0.18, 0.004, 0.0018, 0.012, 0.004, 0, 0.5), zr(-0.215, 0.008, 0.0006, 0.001, 0.001, 0, 0.5)], { region: R.blade, color: P.blade, segs: 8 });
  root.add(mesh(b, mat, 'knife'));
  return { root, sockets: { muzzle: socket(root, 'muzzle', [0, 0, -0.2]) }, parts: {} };
}

// ---------------------------------------------------------------- lasso coil
function lasso(mat) {
  const root = new THREE.Group(), P = PALETTE;
  const b = new SkinBuilder();
  for (let k = 0; k < 3; k++) { // three loops hanging from the hand, slightly offset
    const pts = [];
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; pts.push([-0.12 - Math.cos(a) * 0.13 + k * 0.008, Math.sin(a) * 0.1 + k * 0.012, 0.007, 0.007, 0.004 * k]); }
    part(b, pathRings(pts), { region: R.rope, color: P.rope, segs: 6, caps: false });
  }
  root.add(mesh(b, mat, 'lasso'));
  return { root, sockets: { muzzle: socket(root, 'muzzle', [0, 0, -0.1]) }, parts: {} };
}

// ---------------------------------------------------------------- props
/** A glass bottle for the practice range (origin at its base). */
export function bottleGeometry(color = PALETTE.glassGreen) {
  const b = new SkinBuilder();
  part(b, [yr(0, 0, 0.034, 0.034), yr(0.004, 0, 0.037, 0.037), yr(0.15, 0, 0.037, 0.037), yr(0.19, 0, 0.026, 0.026), yr(0.215, 0, 0.012, 0.012), yr(0.275, 0, 0.011, 0.011), yr(0.28, 0, 0.0135, 0.0135), yr(0.29, 0, 0.012, 0.012)], { region: R.glass, color, segs: 12 });
  const g = b.geometry(); g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight'); g.computeBoundingSphere();
  return g;
}
/** A spent brass case (origin at its centre, along Z). */
export function caseGeometry() {
  const b = new SkinBuilder();
  part(b, [zr(0.014, 0, 0.0062, 0.0062), zr(0.012, 0, 0.0058, 0.0058), zr(-0.014, 0, 0.0055, 0.0055)], { region: R.brass, color: PALETTE.brass, segs: 8 });
  const g = b.geometry(); g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight'); g.computeBoundingSphere();
  return g;
}

const BUILDERS = { revolver, repeater, shotgun, rifle, bow, knife, lasso };

/**
 * Builds one weapon model.
 * @param {string} id a data/weapons.js id @param {THREE.Material} material the shared weapon material
 * @param {THREE.Material} lineMaterial for the bow string
 */
export function buildWeapon(id, material, lineMaterial) {
  const fn = BUILDERS[id];
  if (!fn) return null;
  const w = fn(material, lineMaterial);
  w.root.name = `weapon:${id}`;
  for (const [k, g] of Object.entries(w.parts)) g.name = `part:${k}`;
  w.tris = tris(w.root);
  return w;
}
export const MODEL_IDS = Object.keys(BUILDERS);

/** A copy of a built weapon that shares its geometry and materials (the bow string gets its own geometry). */
export function cloneWeapon(w) {
  const root = w.root.clone(true), sockets = {}, parts = {};
  for (const k of Object.keys(w.sockets)) sockets[k] = root.getObjectByName(k === 'string' ? 'bowstring' : k);
  for (const k of Object.keys(w.parts)) parts[k] = root.getObjectByName(`part:${k}`);
  if (sockets.string) sockets.string.geometry = sockets.string.geometry.clone();
  return { root, sockets, parts, tris: w.tris };
}
