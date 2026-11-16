import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DETAIL, paintTile, tileMaterialMaps, segScale } from '../../render/TextureDetail.js';

/**
 * Props kit: canvas-painted tiling materials (weathered wood, barn paint, charred wood, adobe, stone, hay, iron, rope)
 * and a builder that collects transformed boxes, cylinders and tubes per material, then merges them into one mesh per
 * material per group. UVs are in metres / texture scale, so planks and bricks keep their size on any box.
 * Part 16: textures are painted at the texture-detail tier's size (256 / 512 / 1024) with grain, normal and roughness
 * maps on Medium and High, and one kit per seed and tier is shared (Props, towns and the ranch used to paint three).
 */
const S = 256;
function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** A painted tiling texture; its normal and roughness maps (Medium and High) ride along in userData. */
function canvasTexture(draw, seed, metres, opts = {}) {
  const tile = paintTile((x, R) => draw(x, R), prng(seed), metres, opts); // painters draw in 256-px space (S)
  const t = tile.map; t.userData.metres = metres; // how many metres one repeat covers
  t.userData.normalMap = tile.normalMap; t.userData.roughnessMap = tile.roughnessMap;
  return t;
}
/** Material options for a kit texture (map plus its relief maps). Added in Part 16. */
export const mapsOf = (t) => tileMaterialMaps({ map: t, normalMap: t.userData.normalMap, roughnessMap: t.userData.roughnessMap });
/** Frees a kit texture with its relief maps. */
export const disposeTex = (t) => { t?.dispose?.(); t?.userData?.normalMap?.dispose(); t?.userData?.roughnessMap?.dispose(); };
const _kits = new Map();

const planks = (base, dark, light, boards) => (x, R) => {
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  const w = S / boards;
  for (let b = 0; b < boards; b++) {
    const shade = (R() - 0.5) * 30;
    x.fillStyle = `rgba(${shade > 0 ? '255,240,220' : '0,0,0'},${Math.abs(shade) / 160})`; x.fillRect(b * w, 0, w, S);
    for (let g = 0; g < 14; g++) { x.strokeStyle = R() < 0.5 ? dark : light; x.globalAlpha = 0.25 + R() * 0.3; x.lineWidth = 1; x.beginPath(); const gx = b * w + R() * w; x.moveTo(gx, 0); x.bezierCurveTo(gx + (R() - 0.5) * 6, S / 3, gx + (R() - 0.5) * 6, S * 2 / 3, gx + (R() - 0.5) * 4, S); x.stroke(); }
    x.globalAlpha = 1; x.fillStyle = dark; x.fillRect(b * w, 0, 2, S);
    if (R() < 0.5) { x.fillStyle = dark; x.beginPath(); x.ellipse(b * w + w / 2, R() * S, 3, 5, 0, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = 'rgba(30,25,20,0.8)'; x.fillRect(b * w + w / 2 - 1, 8, 2, 2); x.fillRect(b * w + w / 2 - 1, S - 10, 2, 2); // nails
  }
};

export function createKit(seed = 1899) {
  const key = `${seed}|${DETAIL.tier}`, shared = _kits.get(key);
  if (shared) { shared.users++; return shared.handle(); }
  const tex = {
    wood: canvasTexture(planks('#6b4a2f', '#3a2716', '#8c6a48', 4), seed + 1, 1.2),
    grey: canvasTexture(planks('#7e7468', '#4a433b', '#a39a8e', 4), seed + 2, 1.2),
    barn: canvasTexture((x, R) => { planks('#9e4a2a', '#5a2a16', '#c27050', 5)(x, R); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(120,100,80,${R() * 0.5})`; x.fillRect(R() * S, R() * S, 2 + R() * 10, 1 + R() * 3); } }, seed + 3, 1.5),
    burnt: canvasTexture((x, R) => { planks('#2a2420', '#0f0d0c', '#4a3f38', 4)(x, R); for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(${R() < 0.1 ? '120,60,30' : '15,12,10'},${0.3 + R() * 0.5})`; x.fillRect(R() * S, R() * S, 3 + R() * 12, 2 + R() * 6); } }, seed + 4, 1.2, { small: true }),
    adobe: canvasTexture((x, R) => {
      x.fillStyle = '#c4a27c'; x.fillRect(0, 0, S, S);
      for (let i = 0; i < 2500; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '90,70,50' : '230,210,180'},${R() * 0.18})`; x.fillRect(R() * S, R() * S, 1 + R() * 4, 1 + R() * 4); }
      for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) { x.strokeStyle = 'rgba(110,85,60,0.25)'; x.strokeRect(c * 64 + (r % 2) * 32, r * 32, 64, 32); }
      for (let k = 0; k < 6; k++) { x.strokeStyle = 'rgba(70,50,35,0.5)'; x.beginPath(); let px = R() * S, py = R() * S; x.moveTo(px, py); for (let s2 = 0; s2 < 6; s2++) { px += (R() - 0.5) * 30; py += R() * 25; x.lineTo(px, py); } x.stroke(); }
    }, seed + 5, 2),
    stone: canvasTexture((x, R) => {
      x.fillStyle = '#6e6458'; x.fillRect(0, 0, S, S);
      let y = 0; while (y < S) { const h = 24 + R() * 22; let px = -R() * 30; while (px < S) { const w = 34 + R() * 40; const l = 80 + R() * 50; x.fillStyle = `rgb(${l},${l * 0.92},${l * 0.82})`; x.fillRect(px + 2, y + 2, w - 4, h - 4); px += w; } y += h; }
      for (let i = 0; i < 1500; i++) { x.fillStyle = `rgba(0,0,0,${R() * 0.15})`; x.fillRect(R() * S, R() * S, 2, 2); }
    }, seed + 6, 1.6),
    hay: canvasTexture((x, R) => { x.fillStyle = '#b89a52'; x.fillRect(0, 0, S, S); for (let i = 0; i < 1600; i++) { x.strokeStyle = `hsl(${40 + R() * 15},${45 + R() * 20}%,${35 + R() * 35}%)`; x.lineWidth = 1 + R(); const px = R() * S, py = R() * S, a = (R() - 0.5) * 1.2; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * 18, py + Math.sin(a) * 18); x.stroke(); } }, seed + 7, 1, { small: true, normalStrength: 0.7 }),
    iron: canvasTexture((x, R) => { x.fillStyle = '#34302c'; x.fillRect(0, 0, S, S); for (let i = 0; i < 800; i++) { x.fillStyle = `rgba(${R() < 0.4 ? '120,60,30' : '20,18,16'},${R() * 0.4})`; x.fillRect(R() * S, R() * S, 2 + R() * 6, 2 + R() * 6); } }, seed + 8, 0.6, { small: true, normalStrength: 0.6 }),
    barkOak: canvasTexture((x, R) => {
      x.fillStyle = '#4b4134'; x.fillRect(0, 0, S, S);
      for (let i = 0; i < 40; i++) { const fx = R() * S; x.strokeStyle = 'rgba(25,20,15,0.8)'; x.lineWidth = 2 + R() * 5; x.beginPath(); x.moveTo(fx, 0); for (let y = 0; y <= S; y += 16) x.lineTo(fx + Math.sin(y * 0.05 + i) * 4, y); x.stroke(); }
      for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '110,100,80' : '20,18,14'},0.3)`; x.fillRect(R() * S, R() * S, 4 + R() * 10, 8 + R() * 20); }
    }, seed + 10, 1.5),
    rock: canvasTexture((x, R) => {
      x.fillStyle = '#9a6a4c'; x.fillRect(0, 0, S, S);
      for (let i = 0; i < 4000; i++) { const l = 30 + R() * 45; x.fillStyle = `hsla(20,30%,${l}%,0.3)`; x.fillRect(R() * S, R() * S, 1 + R() * 5, 1 + R() * 3); }
      for (let i = 0; i < 12; i++) { x.fillStyle = 'rgba(120,70,45,0.25)'; x.fillRect(0, R() * S, S, 3 + R() * 8); } // sandstone bedding
    }, seed + 11, 3),
    rope: canvasTexture((x, R) => { x.fillStyle = '#9a8460'; x.fillRect(0, 0, S, S); x.strokeStyle = 'rgba(60,45,30,0.6)'; x.lineWidth = 6; for (let i = -S; i < S * 2; i += 22) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + S, S); x.stroke(); } }, seed + 9, 0.1, { small: true }),
  };
  const mat = (t, opts = {}) => new THREE.MeshStandardMaterial({ ...mapsOf(t), roughness: 0.92, metalness: 0, envMapIntensity: 0.5, ...opts });
  const materials = {
    wood: mat(tex.wood), grey: mat(tex.grey), barn: mat(tex.barn), burnt: mat(tex.burnt, { roughness: 1 }), adobe: mat(tex.adobe), stone: mat(tex.stone),
    hay: mat(tex.hay, { roughness: 1 }), iron: mat(tex.iron, { roughness: 0.6, metalness: 0.5 }), rope: mat(tex.rope), barkOak: mat(tex.barkOak), rock: mat(tex.rock, { roughness: 1 }),
    signs: null, foliage: null, // set by Props (sign atlas, vegetation atlas)
  };
  // shared by everyone who asks for this seed and tier; each caller gets its own handle (copies of the maps, so a
  // town kit can add materials) and the textures go when the last handle is disposed
  const entry = {
    users: 1,
    handle() {
      let gone = false;
      return { tex: { ...tex }, materials: { ...materials }, dispose() { if (gone) return; gone = true; if (--entry.users > 0) return; _kits.delete(key); for (const t of Object.values(tex)) disposeTex(t); for (const m of Object.values(materials)) m?.dispose(); } };
    },
  };
  _kits.set(key, entry);
  return entry.handle();
}

/** Scale a box's UVs by its face sizes so textures keep their real-world size. */
function boxUV(geo, w, h, d, metres) {
  const uv = geo.getAttribute('uv'), dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] / metres, uv.getY(i) * dims[f][1] / metres); }
  return geo;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/** Collects geometry per material key; build() merges into meshes. */
export class PropBuilder {
  constructor(kit) { this.kit = kit; this.parts = new Map(); this.colliders = []; this.objects = 0; }
  _add(key, geo, t) {
    _e.set(t.rx || 0, t.ry || 0, t.rz || 0, t.order || 'YXZ'); _q.setFromEuler(_e);
    _m.compose(_p.set(t.x || 0, t.y || 0, t.z || 0), _q, _s.set(t.sx || 1, t.sy || 1, t.sz || 1));
    if (t.parent) _m.premultiply(t.parent);
    geo.applyMatrix4(_m);
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(geo);
    return geo;
  }
  /** Box centred at (x, y, z) after rotation. */
  box(key, w, h, d, t = {}) { const m = this.kit.tex[key]?.userData.metres ?? 1; return this._add(key, boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, m), t); }
  /** Vertical cylinder from y to y + h (before rotation). */
  cyl(key, r0, r1, h, t = {}, segs = 8) {
    const g = new THREE.CylinderGeometry(r1, r0, h, Math.round(segs * segScale()), 1); g.translate(0, h / 2, 0); // Part 16: rounder on High
    const m = this.kit.tex[key]?.userData.metres ?? 1, uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (Math.PI * 2 * Math.max(r0, r1)) / m, uv.getY(i) * h / m);
    return this._add(key, g, t);
  }
  /** Tube through world points. */
  tube(key, points, radius, segs = 6, t = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const g = new THREE.TubeGeometry(curve, Math.max(4, points.length * 4), radius, Math.round(segs * segScale()), false);
    const m = this.kit.tex[key]?.userData.metres ?? 1, uv = g.getAttribute('uv'), len = curve.getLength();
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / m, uv.getY(i) * radius * 6.28 / m);
    return this._add(key, g, t);
  }
  /** Any prepared geometry (needs position, normal, uv; indexed). */
  geometry(key, geo, t = {}) { return this._add(key, geo, t); }
  collider(desc) { this.colliders.push(desc); }

  /** Merge into meshes added to `group`. Returns triangle count. */
  build(group, name) {
    let tris = 0;
    for (const [key, list] of this.parts) {
      const geos = list.map((g) => {
        if (!g.index) { const n = g.getAttribute('position').count, idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); } // polyhedra come unindexed
        for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
        return g;
      });
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, this.kit.materials[key] || this.kit.materials.wood);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = `${name} ${key}`;
      group.add(mesh);
      tris += (merged.index ? merged.index.count : merged.getAttribute('position').count) / 3;
    }
    this.parts.clear();
    return tris;
  }
}

export { mergeGeometries };
