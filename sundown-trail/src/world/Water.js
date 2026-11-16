import * as THREE from 'three';
import System from '../core/System.js';
import { N, SPACING, ORIGIN, NONE } from './terrain/Grid.js';
import { sampleArray } from './terrain/Splines.js';

/**
 * Water (Part 3B): the river and Mirror Lake surfaces, built from the carved channel's water levels (terrain data.waterY)
 * in 128 m chunks. Flowing normals follow the river downstream (two-phase flow mapping), colour runs from shallow tan to
 * deep teal, the banks foam, the sun glints, the sky reflects, rain ripples it, and the waterfall gets falling foam and mist.
 */
export const TUNING = {
  flowSpeed: 1, normalScale: 0.55, rippleScale: 0.09, foamDepth: 0.35, clarity: 2.4, opacity: 0.88, roughness: 0.06,
  shallow: '#7a6c48', deep: '#143a40', envIntensity: 0.75, mist: true,
};
const CHUNK = 64; // cells per chunk side (128 m)

const _v = new THREE.Vector3();

export default class Water extends System {
  constructor(game) {
    super(game);
    this.group = null; this.stats = { chunks: 0, tris: 0 }; this.time = 0;
    this.uniforms = {
      uWaterTime: { value: 0 }, tWaterNormal: { value: null }, uNormalScale: { value: TUNING.normalScale }, uRipple: { value: 0 },
      uShallow: { value: new THREE.Color(TUNING.shallow) }, uDeep: { value: new THREE.Color(TUNING.deep) }, uClarity: { value: TUNING.clarity },
      uFoamDepth: { value: TUNING.foamDepth }, uOpacity: { value: TUNING.opacity }, uFlowSpeed: { value: TUNING.flowSpeed },
    };
  }

  async init() {
    const g = this.game, terrain = g.get('terrain');
    if (!terrain?.data) { console.info('[water] needs terrain; skipped'); return; }
    this.data = terrain.data;
    this.normalTex = createNormalTexture(256, 1899);
    this.uniforms.tWaterNormal.value = this.normalTex;
    this.material = this._material();
    this.group = new THREE.Group(); this.group.name = 'Water';
    this._build();
    g.scene.add(this.group);
    // waterfall mist and foam through the shared effects engine
    const vfx = g.sys('vfx'), wf = terrain.waterfall;
    if (!vfx.isFallback && wf) {
      defineWaterEffects(vfx);
      const p = new THREE.Vector3(wf.x, wf.bottom + 0.5, wf.z);
      // the river runs on south of the fall: put the mist where the water lands
      const r = terrain.river, i = Math.min(r.xs.length - 1, wf.index + 4);
      p.set(r.xs[i], r.level[i] + 0.4, r.zs[i]);
      this.mistPos = p;
      // spawned on the first update: VFX initialises after the world systems
    }
    g.debug?.addTuning('Water', TUNING);
  }

  _material() {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: TUNING.roughness, metalness: 0, transparent: true, depthWrite: true, envMapIntensity: TUNING.envIntensity });
    const U = this.uniforms;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aWater; varying vec3 vWater; varying vec3 vWaterPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWater = aWater; vWaterPos = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform float uWaterTime; uniform sampler2D tWaterNormal; uniform float uNormalScale; uniform float uRipple; uniform vec3 uShallow; uniform vec3 uDeep;
uniform float uClarity; uniform float uFoamDepth; uniform float uOpacity; uniform float uFlowSpeed;
varying vec3 vWater; varying vec3 vWaterPos; // aWater = flow x, flow z, depth
vec3 wSample(vec2 uv) { return texture2D(tWaterNormal, uv).xyz * 2.0 - 1.0; }
// Two-phase flow mapping: two copies of the normal map slide along the flow and cross-fade so the stretch never shows.
vec3 flowNormal(vec2 p, vec2 flow, float t) {
  float ph0 = fract(t * 0.25), ph1 = fract(t * 0.25 + 0.5);
  float w = abs(ph0 - 0.5) * 2.0;
  vec2 f = flow * uFlowSpeed * 4.0;
  vec3 a = wSample(p * 0.11 - f * ph0 * 0.11) + wSample(p * 0.31 + vec2(0.37, 0.11) - f * ph0 * 0.31) * 0.6;
  vec3 b = wSample(p * 0.11 + vec2(0.5, 0.25) - f * ph1 * 0.11) + wSample(p * 0.31 + vec2(0.71, 0.53) - f * ph1 * 0.31) * 0.6;
  vec3 n = mix(a, b, w);
  // still water (the lake) also drifts slowly
  n += wSample(p * 0.05 + vec2(t * 0.004, t * 0.003)) * 0.5;
  return n;
}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
float wDepth = max(vWater.z, 0.0), wSpeed = length(vWater.xy);
float deepK = 1.0 - exp(-wDepth / max(0.1, uClarity) * 1.6);
vec3 wCol = mix(uShallow, uDeep, deepK);
vec3 wN = flowNormal(vWaterPos.xz, vWater.xy, uWaterTime);
float foamNoise = texture2D(tWaterNormal, vWaterPos.xz * 0.23 - vWater.xy * uWaterTime * 0.6).z;
float foam = (1.0 - smoothstep(0.0, uFoamDepth, wDepth)) * 0.8 + smoothstep(1.6, 4.0, wSpeed) * 0.9;
foam = clamp(foam * smoothstep(0.35, 0.75, foamNoise + foam * 0.3), 0.0, 1.0);
diffuseColor.rgb = mix(wCol, vec3(0.92, 0.94, 0.92), foam);
diffuseColor.a = mix(mix(0.45, uOpacity, smoothstep(0.0, 1.0, wDepth)), 0.95, foam);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, foam);')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
vec2 rp = vWaterPos.xz * 1.7;
vec3 rip = (wSample(rp + vec2(uWaterTime * 0.9, 0.0)) + wSample(rp * 1.3 - vec2(0.0, uWaterTime * 1.1))) * uRipple;
vec3 pert = vec3(wN.x, 0.0, wN.y) * uNormalScale + vec3(rip.x, 0.0, rip.y);
normal = normalize(normal + (viewMatrix * vec4(pert * (1.0 - foam * 0.6), 0.0)).xyz);`);
    };
    m.customProgramCacheKey = () => 'sundown-water-1';
    return m;
  }

  /** Build one mesh per 128 m chunk that holds water. Each vertex: water level, flow (x, z) and depth. */
  _build() {
    const d = this.data, W = d.waterY, H = d.heights, river = d.river;
    const level = (i, j) => {
      const k = j * N + i; if (W[k] !== NONE) return W[k];
      let best = NONE; // a dry corner of a wet cell borrows the neighbours' level so the surface reaches under the bank
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const v = W[jj * N + ii]; if (v > best) best = v;
      }
      return best;
    };
    const flowAt = (i, j, out) => {
      const k = j * N + i, f = d.riverIdx[k];
      if (f < 0 || d.lakeEdge[k] < 2) return out.set(0, 0, 0);
      const a = Math.max(0, Math.floor(f) - 1), b = Math.min(river.xs.length - 1, Math.floor(f) + 2);
      const dx = river.xs[b] - river.xs[a], dz = river.zs[b] - river.zs[a], L = Math.hypot(dx, dz) || 1;
      const drop = sampleArray(river.level, a) - sampleArray(river.level, b), slope = drop / L;
      const speed = Math.min(5, 0.45 + slope * 45);
      return out.set((dx / L) * speed, 0, (dz / L) * speed);
    };
    let tris = 0;
    const chunks = Math.ceil((N - 1) / CHUNK);
    for (let cz = 0; cz < chunks; cz++) for (let cx = 0; cx < chunks; cx++) {
      const pos = [], attr = [], idx = [], vmap = new Map();
      const vert = (i, j) => {
        const key = j * N + i; let v = vmap.get(key);
        if (v !== undefined) return v;
        const y = level(i, j), k = j * N + i;
        flowAt(i, j, _v);
        v = pos.length / 3; vmap.set(key, v);
        pos.push(ORIGIN + i * SPACING, y, ORIGIN + j * SPACING);
        attr.push(_v.x, _v.z, Math.max(0, y - H[k]));
        return v;
      };
      const i0 = cx * CHUNK, j0 = cz * CHUNK;
      for (let j = j0; j < Math.min(j0 + CHUNK, N - 1); j++) for (let i = i0; i < Math.min(i0 + CHUNK, N - 1); i++) {
        const a = j * N + i;
        if (W[a] === NONE && W[a + 1] === NONE && W[a + N] === NONE && W[a + N + 1] === NONE) continue;
        if (level(i, j) === NONE || level(i + 1, j) === NONE || level(i, j + 1) === NONE || level(i + 1, j + 1) === NONE) continue;
        const v00 = vert(i, j), v10 = vert(i + 1, j), v01 = vert(i, j + 1), v11 = vert(i + 1, j + 1);
        idx.push(v00, v01, v11, v00, v11, v10); // same diagonal as the terrain mesh
      }
      if (!idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aWater', new THREE.Float32BufferAttribute(attr, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, n) => (n % 3 === 1 ? 1 : 0)), 3));
      g.setIndex(idx); g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, this.material);
      mesh.receiveShadow = true; mesh.renderOrder = 10; mesh.name = `Water ${cx},${cz}`;
      this.group.add(mesh);
      tris += idx.length / 3; this.stats.chunks++;
    }
    this.stats.tris = tris;
  }

  update(dt) {
    if (!this.group) return;
    const w = this.game.get('weather'), U = this.uniforms;
    this.time += dt;
    U.uWaterTime.value = this.time;
    U.uRipple.value = w ? Math.min(1, w.rain) * TUNING.rippleScale : 0;
    U.uNormalScale.value = TUNING.normalScale; U.uClarity.value = TUNING.clarity; U.uFoamDepth.value = TUNING.foamDepth;
    U.uOpacity.value = TUNING.opacity; U.uFlowSpeed.value = TUNING.flowSpeed; this.material.roughness = TUNING.roughness;
    if (this.mistPos && !this.mist && TUNING.mist) this.mist = this.game.sys('vfx').spawn('waterfall_mist', { position: this.mistPos });
    if (this.mist && !TUNING.mist) { this.mist.stop(); this.mist = null; }
  }

  /** Surface flow (m/s, x/z) at a point; zero on the lake and on dry land. Added in Part 3. */
  getFlowAt(x, z, out = new THREE.Vector3()) {
    const d = this.data; if (!d) return out.set(0, 0, 0);
    const i = Math.round((x - ORIGIN) / SPACING), j = Math.round((z - ORIGIN) / SPACING);
    if (i < 0 || j < 0 || i >= N || j >= N || d.waterY[j * N + i] === NONE) return out.set(0, 0, 0);
    const f = d.riverIdx[j * N + i], r = d.river;
    if (f < 0) return out.set(0, 0, 0);
    const a = Math.max(0, Math.floor(f) - 1), b = Math.min(r.xs.length - 1, Math.floor(f) + 2), dx = r.xs[b] - r.xs[a], dz = r.zs[b] - r.zs[a], L = Math.hypot(dx, dz) || 1;
    const speed = Math.min(5, 0.45 + ((sampleArray(r.level, a) - sampleArray(r.level, b)) / L) * 45);
    return out.set((dx / L) * speed, 0, (dz / L) * speed);
  }

  dispose() {
    this.mist?.stop();
    if (this.group) { for (const m of this.group.children) m.geometry.dispose(); this.group.removeFromParent(); }
    this.material?.dispose(); this.normalTex?.dispose();
  }
}

/** Tileable normal map (xy = normal, z = a foam/height noise in 0..1), from seamless fbm value noise. */
function createNormalTexture(size, seed) {
  let s = seed >>> 0; const R = () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const h = new Float32Array(size * size);
  let amp = 1;
  for (let period = 8; period <= size / 2; period *= 2) {
    const grid = new Float32Array(period * period).map(() => R()), cell = size / period;
    for (let y = 0; y < size; y++) {
      const gy = y / cell, y0 = Math.floor(gy), ty = gy - y0, sy = ty * ty * (3 - 2 * ty), r0 = (y0 % period) * period, r1 = ((y0 + 1) % period) * period;
      for (let x = 0; x < size; x++) {
        const gx = x / cell, x0 = Math.floor(gx), tx = gx - x0, sx = tx * tx * (3 - 2 * tx), c0 = x0 % period, c1 = (x0 + 1) % period;
        const a = grid[r0 + c0] + (grid[r0 + c1] - grid[r0 + c0]) * sx, b = grid[r1 + c0] + (grid[r1 + c1] - grid[r1 + c0]) * sx;
        h[y * size + x] += (a + (b - a) * sy) * amp;
      }
    }
    amp *= 0.5;
  }
  let lo = Infinity, hi = -Infinity; for (const v of h) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const data = new Uint8Array(size * size * 4), k = 2.5;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (xx, yy) => h[((yy + size) % size) * size + ((xx + size) % size)];
    const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k;
    const l = Math.hypot(dx, dy, 1), o = (y * size + x) * 4;
    data[o] = Math.round((-dx / l * 0.5 + 0.5) * 255); data[o + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
    data[o + 2] = Math.round(((h[y * size + x] - lo) / (hi - lo)) * 255); data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.needsUpdate = true;
  return tex;
}

/** Waterfall mist (Bible VFX library: waterfall_mist): a rolling cloud of spray where the falling water lands. */
function defineWaterEffects(vfx) {
  vfx.define('waterfall_mist', {
    parts: [
      { pool: 'alpha', rate: 9, prewarm: true, duration: Infinity, shape: 'disc', radius: 5, frame: 'smokeB', frames: 2, life: [3, 5], speed: [1.5, 3.5], spread: 0.9,
        drag: 0.6, gravity: -0.3, wind: 0.4, size: [2, 7], spin: [0.2, 0.6], color: 0xe6edf0, alpha: 0.32, fadeIn: 0.15, lit: true, tierScale: false },
      { pool: 'alpha', rate: 16, duration: Infinity, shape: 'disc', radius: 4, frame: 'dot', life: [0.6, 1.1], speed: [3, 6], spread: 0.7, gravity: 9.8,
        size: 0.07, color: 0xf2f6f8, alpha: 0.8, lit: true },
    ],
  });
}
