import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { createVegetationAtlas } from './vegetation/Textures.js';
import { buildSpecies, SPECIES_INDEX } from './vegetation/Species.js';
import { createScatter, scatterWorld, STRIDE, CHUNK_M, CHUNKS, TUNING as SCATTER_TUNING } from './vegetation/Scatter.js';
import { bakeImpostors, impostorGeometry, impostorMaterial } from './vegetation/Impostors.js';
import { createGrassMaps, GrassField, TUNING as GRASS_TUNING } from './vegetation/Grass.js';
import { registerNatureEffects, AmbientDirector, TUNING as AMBIENT_TUNING } from './vegetation/Ambient.js';
import { ORIGIN } from './terrain/Grid.js';

/**
 * Vegetation (Part 3A): trees, shrubs, cacti, reeds, grass tufts and rocks scattered over the whole world, a grass
 * field around the camera, wind sway, colliders near the player, and ambient nature effects (GAME_BIBLE §6, §7).
 * One shared atlas and material: each species and LOD is one instanced draw call; every far tree is one more.
 */
export const TUNING = {
  windScale: 1, lodBias: 1, rebuildEvery: 0.2, rebuildMove: 3, smallRadius: 170, colliderRadius: 90,
  lodColors: false, showTrees: true, showSmall: true, showGrass: true, impostorFade: true,
};
const CAPS = { lod0: 3000, lod1: 6000, small: 6000, impostor: 24000 };
const LOD_COLORS = [new THREE.Color(1, 0.3, 0.3), new THREE.Color(0.3, 1, 0.3), new THREE.Color(0.3, 0.5, 1)];
const _c = new THREE.Color();

export default class Vegetation extends System {
  constructor(game) {
    super(game);
    this.ready = false; this.chunks = []; this.meshes = []; this.colliders = new Map(); this.stats = { lod0: 0, lod1: 0, impostor: 0, small: 0, colliders: 0, smallChunks: 0 };
    this._t = 0; this._last = new THREE.Vector3(1e9, 0, 1e9); this._dirty = true; this.nearestAspen = Infinity;
    this.uniforms = { uTime: { value: 0 }, uWind: { value: new THREE.Vector3(2, 0, 0.6) }, uWindScale: { value: 1 } };
  }

  async init() {
    const g = this.game, terrain = g.get('terrain');
    if (!terrain?.data) { console.info('[vegetation] needs terrain; skipped'); return; }
    const t0 = performance.now();
    this.data = terrain.data;
    this.atlas = createVegetationAtlas();
    this.species = buildSpecies();
    this.material = this._material();
    this.depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.atlas, alphaTest: 0.45, side: THREE.DoubleSide });
    // tree layer for the whole world now (impostors need it), shrubs and rocks lazily near the camera
    this.scatter = createScatter(this.data, this.species);
    const it = scatterWorld(this.data, this.species, SCATTER_TUNING, 'trees');
    let r = it.next(), slice = performance.now();
    while (!r.done) { if (performance.now() - slice > 30) { await new Promise((res) => setTimeout(res, 0)); slice = performance.now(); } r = it.next(); }
    this.chunks = r.value.map((c) => ({ ...c, small: false }));
    this.impostors = bakeImpostors(g.renderer, this.species, this.atlas);
    this._buildMeshes();
    // grass
    this.grassMaps = createGrassMaps(this.data);
    this.grass = new GrassField(this.grassMaps, g.quality.name, g.quality.grassRange || 0);
    if (this.grass.mesh) g.scene.add(this.grass.mesh);
    g.events.on(EVENTS.QUALITY_CHANGED, () => {
      this.grass.setQuality(g.quality.name, g.quality.grassRange || 0);
      if (this.grass.mesh) g.scene.add(this.grass.mesh);
      this._dirty = true;
    });
    // ambient nature effects through the shared VFX engine
    if (!g.sys('vfx').isFallback) registerNatureEffects(g.sys('vfx'), this.atlas);
    this.ambient = new AmbientDirector(g);
    g.debug?.addTuning('Vegetation', TUNING, { lodBias: { min: 0.3, max: 2, step: 0.05 }, windScale: { min: 0, max: 3, step: 0.05 } });
    g.debug?.addTuning('Grass', GRASS_TUNING);
    this.stats.initMs = performance.now() - t0;
    this.ready = true;
    // the title screen orbits the spawn before any update runs: fill the view around it now
    const sp = g.startPoint?.(), at = new THREE.Vector3(sp?.x ?? 0, 0, sp?.z ?? 0);
    at.y = terrain.getHeightAt(at.x, at.z);
    for (let k = 0; k < 9; k++) this._ensureSmall(at);
    this._rebuild(at);
    this.grass.update(at, this.uniforms.uWind.value, 0, []);
    console.info(`[vegetation] ready in ${Math.round(this.stats.initMs)} ms`);
  }

  // ---------------------------------------------------------------- materials & meshes
  _material() {
    const m = new THREE.MeshStandardMaterial({ map: this.atlas, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, envMapIntensity: 0.4 });
    const U = this.uniforms;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSway; uniform float uTime; uniform vec3 uWind; uniform float uWindScale;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float isc = length(instanceMatrix[0].xyz);
#else
  vec3 ip = vec3(0.0); float isc = 1.0;
#endif
  float ph = ip.x * 0.11 + ip.z * 0.07;
  float ws = length(uWind.xz);
  vec2 wd = ws > 0.01 ? uWind.xz / ws : vec2(1.0, 0.0);
  // Sway is a fraction of the vertex's height above the base, saturating in a gale, so plants lean and bob
  // instead of stretching; small plants (reeds, tufts) lean further than trees.
  float hW = max(position.y * isc, 0.05);
  float amt = (1.0 - exp(-ws / 8.0)) * (0.75 + 0.25 * sin(uTime * 0.8 + ph)) * uWindScale;
  float frac = mix(0.3, 0.07, smoothstep(2.0, 12.0, hW));
  vec2 lean = wd * amt * frac + vec2(sin(uTime * 1.6 + ph), cos(uTime * 1.3 + ph * 1.3)) * 0.012 * (1.0 + amt);
  vec2 flutter = vec2(sin(uTime * 7.0 + position.x * 3.0 + ph), cos(uTime * 6.1 + position.z * 3.0)) * 0.03 * (0.3 + amt);
  vec2 d2 = (lean * aSway * aSway * hW + flutter * aSway) ;
  float dl = length(d2), maxD = 0.38 * hW;
  if (dl > maxD) d2 *= maxD / dl;
  vec3 sway = vec3(d2.x, -dot(d2, d2) / (2.0 * hW), d2.y); // drop the tip so the length stays the same
#ifdef USE_INSTANCING
  sway = transpose(mat3(instanceMatrix)) * sway / (isc * isc); // world-space wind into the instance's local space
#endif
  transformed += sway;`);
    };
    m.customProgramCacheKey = () => 'sundown-vegetation-1';
    return m;
  }

  _buildMeshes() {
    const g = this.game, group = new THREE.Group(); group.name = 'Vegetation';
    this.group = group; g.scene.add(group);
    this.meshes = [];
    this.species.forEach((s, i) => {
      const trees = !!s.impostor, cap0 = trees ? CAPS.lod0 : CAPS.small, cap1 = trees ? CAPS.lod1 : CAPS.small;
      const lods = [s.lod0, s.lod1].map((geo, l) => {
        const mesh = new THREE.InstancedMesh(geo, this.material, l === 0 ? cap0 : cap1);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.setColorAt(0, _c.set(1, 1, 1)); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0; mesh.frustumCulled = false; mesh.name = `${s.id} LOD${l}`;
        mesh.castShadow = !!s.shadow && (l === 0 || trees); mesh.receiveShadow = true;
        mesh.customDepthMaterial = this.depthMaterial; mesh.userData.warmup = true; // compiled during loading even while empty
        group.add(mesh);
        return mesh;
      });
      this.meshes[i] = lods;
    });
    // impostors: one mesh for every far tree
    const imp = new THREE.InstancedMesh(impostorGeometry(), impostorMaterial(this.impostors.texture), CAPS.impostor);
    const cell = new THREE.InstancedBufferAttribute(new Float32Array(CAPS.impostor * 4), 4); cell.setUsage(THREE.DynamicDrawUsage);
    imp.geometry.setAttribute('aCell', cell);
    imp.instanceMatrix.setUsage(THREE.DynamicDrawUsage); imp.setColorAt(0, _c.set(1, 1, 1));
    imp.count = 0; imp.frustumCulled = false; imp.name = 'Tree impostors'; imp.receiveShadow = false; imp.userData.warmup = true;
    group.add(imp);
    this.impostorMesh = imp;
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    if (!this.ready) return;
    const g = this.game, w = g.get('weather'), cam = g.camera.position, p = g.player?.position || cam;
    this.uniforms.uTime.value += dt; this.uniforms.uWindScale.value = TUNING.windScale;
    if (w) this.uniforms.uWind.value.copy(w.wind);
    this._ensureSmall(cam);
    this._t += dt;
    if (this._dirty || (this._t > TUNING.rebuildEvery && cam.distanceToSquared(this._last) > TUNING.rebuildMove ** 2)) this._rebuild(cam);
    this._colliders(p);
    this.group.visible = TUNING.showTrees || TUNING.showSmall;
    if (this.grass.mesh) {
      this.grass.mesh.visible = TUNING.showGrass;
      const push = this._push || (this._push = [{ x: 0, y: 0, z: 0, radius: 0.9 }, { x: 0, y: 0, z: 0, radius: 1.6 }]);
      push[0].x = p.x; push[0].y = p.y; push[0].z = p.z;
      const horse = g.get('horses')?.playerHorse?.position;
      if (horse) { push[1].x = horse.x; push[1].y = horse.y; push[1].z = horse.z; push[1].radius = 1.6; } else push[1].radius = 0;
      this.grass.update(cam, w ? w.wind : this.uniforms.uWind.value, this.uniforms.uTime.value, push);
    }
    this.ambient.update(dt, p, this.nearestAspen);
  }

  /** Generate shrubs and rocks for the nearest chunk that lacks them (one per frame, ~5 ms). */
  _ensureSmall(cam) {
    let best = null, bd = Infinity;
    for (const c of this.chunks) {
      if (c.small) continue;
      const d = rectDist(cam.x, cam.z, c.x0, c.z0);
      if (d < TUNING.smallRadius && d < bd) { bd = d; best = c; }
    }
    if (!best) return;
    const s = this.scatter.chunk(best.cx, best.cz, 'small');
    best.lists = best.lists.map((l, i) => (s.lists[i].length ? concat(l, s.lists[i]) : l));
    best.small = true; this.stats.smallChunks++; this._dirty = true;
  }

  /** Sort every instance in range into LOD0 / LOD1 / impostor and write the instance buffers. */
  _rebuild(cam) {
    this._t = 0; this._dirty = false; this._last.copy(cam);
    const draw = this.game.quality.drawDistance || 600, bias = TUNING.lodBias, M = this.meshes, imp = this.impostorMesh, cells = this.impostors.cells;
    const counts = M.map(() => [0, 0]);
    let ni = 0, nearestAspen = Infinity;
    const aspen = SPECIES_INDEX.aspen, mat = imp.instanceMatrix.array, aCell = imp.geometry.getAttribute('aCell'), cellArr = aCell.array;
    const lodColor = TUNING.lodColors;
    for (const c of this.chunks) {
      const cd = rectDist(cam.x, cam.z, c.x0, c.z0);
      if (cd > draw) continue;
      for (let si = 0; si < c.lists.length; si++) {
        const list = c.lists[si]; if (!list.length) continue;
        const s = this.species[si], trees = !!s.impostor;
        if (trees ? !TUNING.showTrees : !TUNING.showSmall) continue;
        const l0 = s.lod[0] * bias, l1 = s.lod[1] * bias, maxD = trees ? draw : l1;
        if (cd > maxD) continue;
        const lods = M[si], cnt = counts[si];
        for (let o = 0; o < list.length; o += STRIDE) {
          const x = list[o], y = list[o + 1], z = list[o + 2], dx = x - cam.x, dz = z - cam.z, d = Math.sqrt(dx * dx + dz * dz);
          if (si === aspen && d < nearestAspen) nearestAspen = d;
          if (d > maxD) continue;
          const lod = d < l0 ? 0 : d < l1 ? 1 : 2;
          if (lod < 2) {
            const mesh = lods[lod], k = cnt[lod];
            if (k >= mesh.instanceMatrix.count) continue;
            writeMatrix(mesh.instanceMatrix.array, k * 16, x, y, z, list[o + 3], list[o + 4], list[o + 4]);
            if (lodColor) _c.copy(LOD_COLORS[lod]); else _c.setRGB(list[o + 5], list[o + 6], list[o + 7]);
            mesh.instanceColor.array[k * 3] = _c.r; mesh.instanceColor.array[k * 3 + 1] = _c.g; mesh.instanceColor.array[k * 3 + 2] = _c.b;
            cnt[lod] = k + 1;
          } else if (trees && cells[si] && ni < CAPS.impostor) {
            const cl = cells[si], sc = list[o + 4];
            writeMatrix(mat, ni * 16, x, y + cl.bottom * sc, z, list[o + 3], cl.w * sc, cl.h * sc);
            cellArr[ni * 4] = cl.u0; cellArr[ni * 4 + 1] = cl.v0; cellArr[ni * 4 + 2] = cl.du; cellArr[ni * 4 + 3] = cl.dv;
            if (lodColor) _c.copy(LOD_COLORS[2]); else _c.setRGB(list[o + 5], list[o + 6], list[o + 7]);
            imp.instanceColor.array[ni * 3] = _c.r; imp.instanceColor.array[ni * 3 + 1] = _c.g; imp.instanceColor.array[ni * 3 + 2] = _c.b;
            ni++;
          }
        }
      }
    }
    let s0 = 0, s1 = 0, sm = 0;
    M.forEach((lods, si) => {
      lods.forEach((mesh, l) => {
        mesh.count = counts[si][l]; mesh.visible = mesh.count > 0;
        if (mesh.count) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
        if (this.species[si].impostor) { if (l === 0) s0 += mesh.count; else s1 += mesh.count; } else sm += mesh.count;
      });
    });
    imp.count = ni; imp.visible = ni > 0; imp.instanceMatrix.needsUpdate = true; imp.instanceColor.needsUpdate = true; aCell.needsUpdate = true;
    this.nearestAspen = nearestAspen;
    Object.assign(this.stats, { lod0: s0, lod1: s1, impostor: ni, small: sm });
  }

  /** Trunk and rock colliders for chunks near the player; removed again when far. */
  _colliders(p) {
    const phys = this.game.physics, R = TUNING.colliderRadius;
    for (const c of this.chunks) {
      const d = rectDist(p.x, p.z, c.x0, c.z0), has = this.colliders.has(c);
      if (d < R && !has && (c.small || d > CHUNK_M)) {
        const list = [];
        c.lists.forEach((l, si) => {
          const s = this.species[si]; if (!s.collider) return;
          for (let o = 0; o < l.length; o += STRIDE) {
            const sc = l[o + 4], x = l[o], y = l[o + 1], z = l[o + 2];
            if (s.collider === 'trunk') list.push(phys.addCollider({ type: 'cylinder', position: new THREE.Vector3(x, y - 0.5, z), radius: Math.max(0.2, s.trunk * sc * 1.05), height: s.height * sc * 0.6, surface: 'wood', tag: 'tree' }));
            else if (sc > 0.7) list.push(phys.addCollider({ type: 'cylinder', position: new THREE.Vector3(x, y - 0.5, z), radius: s.radius * sc * 0.75, height: s.height * sc + 0.5, surface: 'rock', tag: 'rock' }));
          }
        });
        this.colliders.set(c, list); this.stats.colliders += list.length;
      } else if (has && d > R + 40) {
        const list = this.colliders.get(c);
        for (const col of list) phys.removeCollider(col);
        this.stats.colliders -= list.length; this.colliders.delete(c);
      }
    }
  }

  /** Re-run the scatter with the current Scatter TUNING (test pages: density slider). */
  async rescatter() {
    for (const list of this.colliders.values()) for (const c of list) this.game.physics.removeCollider(c);
    this.colliders.clear(); this.stats.colliders = 0; this.stats.smallChunks = 0;
    this.scatter = createScatter(this.data, this.species);
    const it = scatterWorld(this.data, this.species, SCATTER_TUNING, 'trees');
    let r = it.next(), slice = performance.now();
    while (!r.done) { if (performance.now() - slice > 30) { await new Promise((res) => setTimeout(res, 0)); slice = performance.now(); } r = it.next(); }
    this.chunks = r.value.map((c) => ({ ...c, small: false }));
    this._dirty = true;
  }

  /** Total scattered instances per species id (for tests and the debug readout). */
  counts() {
    const out = {};
    this.species.forEach((s, i) => { out[s.id] = 0; for (const c of this.chunks) out[s.id] += c.lists[i].length / STRIDE; });
    return out;
  }

  dispose() {
    for (const lods of this.meshes) for (const m of lods) m.dispose();
    this.impostorMesh?.geometry.dispose(); this.impostorMesh?.material.dispose(); this.impostors?.dispose();
    for (const s of this.species || []) { s.lod0.dispose(); s.lod1.dispose(); }
    this.material?.dispose(); this.depthMaterial?.dispose(); this.atlas?.dispose(); this.grass?.dispose();
    for (const list of this.colliders.values()) for (const c of list) this.game.physics.removeCollider(c);
    this.group?.removeFromParent();
  }
}

/** Distance from (x, z) to a chunk's square. */
function rectDist(x, z, x0, z0) {
  const dx = Math.max(x0 - x, 0, x - (x0 + CHUNK_M)), dz = Math.max(z0 - z, 0, z - (z0 + CHUNK_M));
  return Math.sqrt(dx * dx + dz * dz);
}
function concat(a, b) { const o = new Float32Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; }
/** Column-major TRS matrix with yaw rotation and scale (sx horizontal, sy vertical). */
function writeMatrix(arr, o, x, y, z, rot, sx, sy) {
  const c = Math.cos(rot), s = Math.sin(rot);
  arr[o] = c * sx; arr[o + 1] = 0; arr[o + 2] = -s * sx; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
  arr[o + 8] = s * sx; arr[o + 9] = 0; arr[o + 10] = c * sx; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}

export { CHUNKS, ORIGIN, AMBIENT_TUNING };
