import * as THREE from 'three';
import System from '../core/System.js';
import { WORLD, WORLD_SEED } from '../data/world.js';
import { createKit, PropBuilder } from './props/Kit.js';
import { rng, fence, telegraph, bridge, fordStones, wagon, haystack, barrel, crate, signpost, hangingOak, mission, stoneArch, ranchRuin } from './props/Builders.js';

/**
 * Props (Part 3C): fences, telegraph line, the ranch-road bridge and ford stones, wagons, haystacks, barrels, crates,
 * signposts with painted place names, and the landmarks (Hanging Oak, Old Mission ruins, Stone Arch, the burned
 * Rourke Ranch that Part 13 rebuilds). Built once, merged into one mesh per material per area, with colliders.
 */
export const TUNING = { fences: true, telegraph: true, clutter: true };

const SIGNS = ['Copperbell', 'Fort Granger', 'Rourke Ranch', 'Saltmesa', 'Blackstone Estate', 'Greywind Camp', 'Mirror Lake', 'Old Mission', 'Hanging Oak', 'Copperbell 1 mi'];

export default class Props extends System {
  constructor(game) {
    super(game);
    this.group = null; this.areas = {}; this.colliders = []; this.stats = { objects: 0, tris: 0, colliders: 0, meshes: 0 };
  }

  async init() {
    const g = this.game, T = g.get('terrain');
    if (!T?.data) { console.info('[props] needs terrain; skipped'); return; }
    this.terrain = T;
    this.kit = createKit(WORLD_SEED);
    this.signTex = signAtlas();
    this.kit.materials.signs = new THREE.MeshStandardMaterial({ map: this.signTex, roughness: 0.9, envMapIntensity: 0.5 });
    this.kit.materials.foliage = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.4 });
    this.group = new THREE.Group(); this.group.name = 'Props';
    g.scene.add(this.group);
    const L = WORLD.locations, R = rng(WORLD_SEED ^ 0x9e0f);
    const area = (name, build) => {
      const B = new PropBuilder(this.kit);
      build(B);
      const grp = new THREE.Group(); grp.name = name;
      this.stats.tris += B.build(grp, name);
      this.stats.objects += B.objects; this.stats.meshes += grp.children.length;
      const cols = B.colliders.map((c) => g.physics.addCollider(c)); this.colliders.push(...cols);
      (this.areaColliders ||= {})[name] = cols; // Added in Part 13: per-area colliders (the ranch replaces its ruin)
      this.group.add(grp); this.areas[name] = grp;
    };
    area('roads', (B) => {
      if (TUNING.fences) this._roadFences(B, R);
      if (TUNING.telegraph) {
        const road = WORLD.roads.find((r) => r.id === 'fortGranger'), estate = WORLD.roads.find((r) => r.id === 'estateRoad');
        if (road) telegraph(B, T, road.points, 8, R);
        if (estate) telegraph(B, T, estate.points, -8, R);
      }
      for (const br of T.bridges || []) bridge(B, T, br);
      if (T.fords?.[0]) fordStones(B, T, T.fords[0], T.river, R);
      // wagons abandoned by the roadside
      for (const [rid, t, side, rot] of [['saltmesaRoad', 0.55, 1, 0.6], ['ranchRoad', 0.75, -1, 2.2], ['greywindRoad', 0.45, 1, 1.4]]) {
        const p = this._roadPoint(rid, t, side * 9); if (p) wagon(B, T, p.x, p.z, rot, R);
      }
      // signposts at junctions
      const sign = (x, z, names) => {
        const p = this._beside(x, z, 6);
        signpost(B, T, p.x, p.z, names.map(([n, tx, tz]) => ({ index: SIGNS.indexOf(n), tx, tz })), signUV);
      };
      sign(L.copperbell.x, L.copperbell.z + 30, [['Fort Granger', 1000, -80], ['Rourke Ranch', -420, -160], ['Saltmesa', -560, 640], ['Blackstone Estate', 620, 180], ['Greywind Camp', 320, -720]]);
      const rr = this._roadPoint('ranchRoad', 0.3, 0); if (rr) sign(rr.x, rr.z, [['Rourke Ranch', -420, -160], ['Copperbell', 40, 60], ['Mirror Lake', -260, -560]]);
      sign(L.fortGrangerRoad.x - 30, L.fortGrangerRoad.z, [['Copperbell 1 mi', 40, 60]]);
      const sm = this._roadPoint('saltmesaRoad', 0.35, 0); if (sm) sign(sm.x, sm.z, [['Saltmesa', -560, 640], ['Copperbell', 40, 60], ['Hanging Oak', -150, 380]]);
      const es = this._roadPoint('estateRoad', 0.6, 0); if (es) sign(es.x, es.z, [['Blackstone Estate', 620, 180], ['Old Mission', 480, 620]]);
    });
    area('ranch', (B) => ranchRuin(B, T, L.ranch.x, L.ranch.z, R));
    area('hangingOak', (B) => hangingOak(B, T, L.hangingOak.x, L.hangingOak.z, R));
    area('mission', (B) => mission(B, T, L.oldMission.x, L.oldMission.z, R));
    area('stoneArch', (B) => stoneArch(B, T, L.stoneArch.x, L.stoneArch.z, R));
    area('estate', (B) => {
      const e = L.blackstoneEstate, half = 55, gate = this._roadPoint('estateRoad', 0.97, 0);
      const corners = [[e.x - half, e.z - half], [e.x + half, e.z - half], [e.x + half, e.z + half], [e.x - half, e.z + half], [e.x - half, e.z - half]];
      for (let k = 1; k < corners.length; k++) {
        const [ax, az] = corners[k - 1], [bx, bz] = corners[k];
        if (gate && k === 4) { // the west side faces the road: leave a 10 m gate
          const gz = Math.max(Math.min(gate.z, e.z + half - 8), e.z - half + 8);
          fence(B, T, ax, az, bx, gz + 5, R); fence(B, T, bx, gz - 5, bx, bz, R);
          for (const o of [-5.4, 5.4]) B.box('wood', 0.3, 3.2, 0.3, { x: bx, y: T.getHeightAt(bx, gz + o) + 1.5, z: gz + o });
          B.box('wood', 0.25, 0.4, 11.2, { x: bx, y: T.getHeightAt(bx, gz) + 3.1, z: gz });
        } else fence(B, T, ax, az, bx, bz, R);
      }
      if (TUNING.clutter) for (let k = 0; k < 4; k++) haystack(B, T, e.x + 30 + k * 4.5, e.z - 35 + (R() - 0.5) * 3, R);
    });
    if (TUNING.clutter) {
      area('outposts', (B) => {
        const ring = (loc, n, fn) => {
          const pad = (T.pads || []).find((p) => Math.hypot(p.x - loc.x, p.z - loc.z) < 5), r = pad ? pad.flatRadius * 0.85 : loc.radius * 0.6;
          for (let k = 0; k < n; k++) { const a = R() * Math.PI * 2, p = this._offRoad(loc.x + Math.cos(a) * r, loc.z + Math.sin(a) * r); if (p) fn(B, p.x, p.z); }
        };
        ring(L.saltmesaPost, 10, (b, x, z) => (R() < 0.5 ? barrel(b, T, x, z, R, R() < 0.2) : crate(b, T, x, z, R, 1 + Math.floor(R() * 2))));
        ring(L.lumberCamp, 12, (b, x, z) => (R() < 0.6 ? crate(b, T, x, z, R, 1) : barrel(b, T, x, z, R)));
        ring(L.cinderHideout, 9, (b, x, z) => (R() < 0.5 ? barrel(b, T, x, z, R, R() < 0.4) : crate(b, T, x, z, R, 1)));
        // Copperbell's clutter moved to the town (Part 9)
      });
    }
    this.stats.colliders = this.colliders.length;
    g.debug?.addTuning('Props', TUNING);
    console.info(`[props] ${this.stats.objects} objects, ${this.stats.meshes} meshes, ${Math.round(this.stats.tris / 1000)}k triangles, ${this.stats.colliders} colliders`);
  }

  /** A point along a road (t 0..1 of its length), offset sideways by `side` metres. */
  _roadPoint(id, t, side) {
    const r = (this.terrain.roads || []).find((x) => x.id === id); if (!r) return null;
    const pts = r.points, n = pts.length / 3, i = Math.min(n - 2, Math.max(1, Math.round(t * (n - 1))));
    const dx = pts[(i + 1) * 3] - pts[(i - 1) * 3], dz = pts[(i + 1) * 3 + 2] - pts[(i - 1) * 3 + 2], l = Math.hypot(dx, dz) || 1;
    return { x: pts[i * 3] - (dz / l) * side, z: pts[i * 3 + 2] + (dx / l) * side };
  }
  /** Nearest point around (x, z) that is beside a road (not on it, not in water). */
  _beside(x, z, want) {
    const T = this.terrain;
    for (let r = 0; r < 30; r += 1.5) for (let a = 0; a < 12; a++) {
      const px = x + Math.cos(a * 0.52) * r, pz = z + Math.sin(a * 0.52) * r, info = T.getRoadInfo(px, pz);
      if (!info.onRoad && info.distance > 3.5 && info.distance < want + 3 && !T.isWater(px, pz)) return { x: px, z: pz };
    }
    return { x, z };
  }
  _offRoad(x, z) { const T = this.terrain, i = T.getRoadInfo(x, z); return i.distance > 4.5 && !T.isWater(x, z) ? { x, z } : null; }

  /** Rail fences on both sides of the roads leaving Copperbell and approaching the estate. */
  _roadFences(B, R) {
    const T = this.terrain, cb = WORLD.locations.copperbell, est = WORLD.locations.blackstoneEstate;
    for (const r of T.roads || []) {
      if (r.trail) continue;
      const pts = r.points, n = pts.length / 3, off = r.halfWidth + 2.6;
      for (const side of [-1, 1]) {
        let run = null;
        const flush = () => { if (run && run.length >= 6) for (let k = 5; k < run.length; k += 5) fence(B, T, run[k - 5].x, run[k - 5].z, run[k].x, run[k].z, R, { broken: 0.06 }); run = null; };
        for (let i = 1; i < n - 1; i++) {
          const x0 = pts[i * 3], z0 = pts[i * 3 + 2], dCb = Math.hypot(x0 - cb.x, z0 - cb.z), dEs = Math.hypot(x0 - est.x, z0 - est.z);
          const want = (dCb > 125 && dCb < 280) || (r.id === 'estateRoad' && dEs > 60 && dEs < 260);
          const dx = pts[(i + 1) * 3] - pts[(i - 1) * 3], dz = pts[(i + 1) * 3 + 2] - pts[(i - 1) * 3 + 2], l = Math.hypot(dx, dz) || 1;
          const x = x0 - (dz / l) * off * side, z = z0 + (dx / l) * off * side, info = T.getRoadInfo(x, z);
          const ok = want && !info.onRoad && info.distance > r.halfWidth + 1.2 && !T.isWater(x, z) && !T.isWater(x0, z0) && i % 40 !== 0; // a gap every 80 m
          if (ok) { (run ||= []).push({ x, z }); } else flush();
        }
        flush();
      }
    }
  }

  dispose() {
    for (const c of this.colliders) this.game.physics.removeCollider(c);
    if (this.group) { this.group.traverse((o) => o.geometry?.dispose()); this.group.removeFromParent(); }
    this.kit?.dispose(); this.signTex?.dispose();
  }
}

// ------------------------------------------------------------------ painted signs and leaves
const SIGN_ROWS = 16;
function signAtlas() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const x = c.getContext('2d'), h = 512 / SIGN_ROWS;
  SIGNS.forEach((name, i) => {
    const y = i * h;
    x.fillStyle = '#7a5a3a'; x.fillRect(0, y, 512, h);
    for (let k = 0; k < 6; k++) { x.fillStyle = `rgba(40,25,10,${0.15 + (k % 2) * 0.1})`; x.fillRect(0, y + k * (h / 6), 512, 1); }
    x.fillStyle = '#efe2c2'; x.font = `bold ${Math.round(h * 0.62)}px Rye, Georgia, serif`; x.textBaseline = 'middle'; x.textAlign = 'center';
    x.fillText(name.toUpperCase(), 230, y + h / 2 + 1);
    x.fillStyle = '#2b1d12'; x.beginPath(); x.moveTo(470, y + 4); x.lineTo(506, y + h / 2); x.lineTo(470, y + h - 4); x.fill(); // arrow tip
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
/** UV rect of sign `i` in the sign atlas. */
function signUV(i) { const v1 = 1 - Math.max(0, i) / SIGN_ROWS, v0 = v1 - 1 / SIGN_ROWS; return [0, v0 + 0.002, 1, v1 - 0.002]; }

function leafTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'); let s = 99;
  const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 900; i++) { // a round, ragged cluster: no square card edges
    const a = R() * 6.283, d = Math.sqrt(R()) * (70 + 40 * Math.sin(a * 5 + 1.3) * R()), cx = 128 + Math.cos(a) * d, cy = 128 + Math.sin(a) * d;
    x.fillStyle = `hsl(${80 + R() * 25},${28 + R() * 12}%,${18 + R() * 16}%)`;
    x.save(); x.translate(cx, cy); x.rotate(R() * 6.28); x.beginPath(); x.ellipse(0, 0, 9 * (0.6 + R() * 0.6), 4, 0, 0, Math.PI * 2); x.fill(); x.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
