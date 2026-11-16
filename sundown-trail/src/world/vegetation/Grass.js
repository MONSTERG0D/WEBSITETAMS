import * as THREE from 'three';
import { N, SPACING, ORIGIN, NONE, FAR } from '../terrain/Grid.js';
import { TUNING as CARVE } from '../terrain/Carving.js';
import { SimplexNoise, fbm2 } from '../../core/utils/noise.js';
import { WORLD_SEED } from '../../data/world.js';

/**
 * The grass field around the camera (GAME_BIBLE §6: 20 m on Medium, 45 m on High, off on Low).
 * A fixed grid of clumps wraps around the camera at world-stable positions; the vertex shader reads the terrain
 * height (exact bilinear from a float texture) and a density map, sways blades with the wind and bends them away
 * from the player and horse. Valley grass, dry grass, pine-floor grass and wildflowers come from the same mesh.
 */
export const TUNING = { spacing: { medium: 0.75, high: 0.65 }, blades: { medium: 7, high: 7 }, height: 0.45, width: 0.042, density: 1, windBend: 1, flowerAmount: 1 };

const VERT_HEAD = /* glsl */`
attribute vec4 aSeed;   // grid x, grid z (0..1 of the span), keep threshold, size/variation
attribute vec3 aBlade;  // angle offset, height factor, spread
uniform highp sampler2D uHeights; uniform sampler2D uDensity;
uniform vec3 uCam; uniform float uSpan; uniform float uRange; uniform float uGrassTime; uniform vec3 uGrassWind;
uniform vec4 uPush[4]; uniform float uGrassHeight; uniform float uGrassWidth; uniform float uGrassDensity; uniform float uWindBend; uniform float uFlowers;
varying vec3 vGrass;
float grassHeightAt(vec2 p) {
  vec2 f = (p - vec2(${ORIGIN.toFixed(1)})) / ${SPACING.toFixed(1)};
  f = clamp(f, vec2(0.0), vec2(${(N - 1.001).toFixed(3)}));
  ivec2 i = ivec2(floor(f)); vec2 t = f - vec2(i);
  float a = texelFetch(uHeights, i, 0).r, b = texelFetch(uHeights, i + ivec2(1, 0), 0).r;
  float c = texelFetch(uHeights, i + ivec2(0, 1), 0).r, d = texelFetch(uHeights, i + ivec2(1, 1), 0).r;
  // same triangle split as the terrain mesh (diagonal from (i,j) to (i+1,j+1))
  return t.x > t.y ? a + (b - a) * t.x + (d - b) * t.y : a + (d - c) * t.x + (c - a) * t.y;
}
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

const VERT_BODY = /* glsl */`
  vec2 span = vec2(uSpan);
  vec2 wxz = uCam.xz + mod(aSeed.xy * span - uCam.xz, span) - span * 0.5;
  float dist = length(wxz - uCam.xz);
  vec4 den = texture2D(uDensity, (wxz - vec2(${ORIGIN.toFixed(1)})) / ${(-ORIGIN * 2).toFixed(1)});
  float keep = step(aSeed.z, den.r * uGrassDensity);
  float fade = 1.0 - smoothstep(uRange * 0.72, uRange, dist);
  float size = keep * fade * (0.55 + aSeed.w * 0.9) * (0.65 + den.r * 0.5);
  float ang = aBlade.x + aSeed.w * 6.2831 + aSeed.x * 40.0;
  vec2 dir = vec2(cos(ang), sin(ang)), side = vec2(-dir.y, dir.x);
  float H = uGrassHeight * aBlade.y * size * mix(1.0, 0.7, den.a) * mix(1.0, 0.7, den.g);
  float t = position.y;
  // Bending keeps the blade's length: the blade curls along an arc whose total angle is b radians, so strong wind
  // (or the wind slider) lays it over instead of stretching it into a long streak.
  float ws = length(uGrassWind.xz);
  vec2 wd = ws > 0.01 ? uGrassWind.xz / ws : vec2(1.0, 0.0);
  float wave = sin(dot(wxz, wd) * 0.35 - uGrassTime * (1.2 + ws * 0.25)) * 0.5 + 0.5;
  float windAmt = (1.0 - exp(-ws / 7.0)) * (0.45 + 0.55 * wave) * uWindBend;       // saturates in a gale
  vec2 lean = wd * windAmt * 0.9 + dir * (0.18 + aBlade.z * 0.25)
            + vec2(sin(uGrassTime * 2.3 + aSeed.x * 90.0), cos(uGrassTime * 1.9 + aSeed.y * 80.0)) * 0.05 * (0.4 + windAmt);
  // pushed aside by the player and horse
  float squash = 0.0;
  for (int k = 0; k < 4; k++) {
    vec4 pu = uPush[k];
    if (pu.w <= 0.0) continue;
    vec2 d = wxz - pu.xz; float L = length(d);
    float f = 1.0 - smoothstep(pu.w * 0.3, pu.w, L);
    lean += (L > 1e-3 ? d / L : dir) * f * 1.1; squash = max(squash, f);
  }
  float b = min(length(lean), 1.35);                 // total bend angle, at most ~77 degrees
  vec2 bdir = length(lean) > 1e-4 ? normalize(lean) : dir;
  float ang2 = max(b * t, 1e-4);
  float along = b > 1e-3 ? (1.0 - cos(ang2)) / b : 0.0;   // arc of constant curvature, unit length
  float upward = b > 1e-3 ? sin(ang2) / b : t;
  vec2 base = wxz + dir * aBlade.z * size * 0.07;
  vec2 offs = bdir * along * H;
  float w = uGrassWidth * (1.0 - t * 0.85) * min(1.0, size * 1.6);
  vec3 transformed = vec3(base.x + side.x * position.x * w + offs.x, grassHeightAt(base) + upward * H * (1.0 - squash * 0.35), base.y + side.y * position.x * w + offs.y);
  // colour: lush to dry by the density map, darker roots, sun-bleached tips, a few wildflowers
  vec3 lush = vec3(0.16, 0.26, 0.07), dry = vec3(0.42, 0.36, 0.15), pine = vec3(0.11, 0.17, 0.08);
  vec3 col = mix(lush, dry, den.g);
  col = mix(col, pine, den.a);
  col *= 0.75 + 0.5 * gHash(floor(wxz * 0.25));
  col *= mix(0.45, 1.15, t);
  float flower = step(1.0 - den.b * 0.12 * uFlowers, gHash(wxz * 3.1)) * step(0.82, t) * step(0.5, aBlade.y);
  vec3 petals = gHash(wxz) < 0.33 ? vec3(0.85, 0.65, 0.08) : gHash(wxz * 1.7) < 0.5 ? vec3(0.55, 0.3, 0.6) : vec3(0.9, 0.88, 0.8);
  vGrass = mix(col, petals, flower);
`;

/** Height texture (exact grid heights) and density texture (R grass, G dryness, B flowers, A pine floor). */
export function createGrassMaps(data) {
  const heights = new THREE.DataTexture(data.heights, N, N, THREE.RedFormat, THREE.FloatType);
  heights.minFilter = heights.magFilter = THREE.NearestFilter; heights.needsUpdate = true;
  const den = new Uint8Array(N * N * 4), noise = new SimplexNoise(WORLD_SEED ^ 0x9a55), pads = data.pads || [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = ORIGIN + i * SPACING, z = ORIGIN + j * SPACING;
    const g = data.splat0[k * 4], d = data.splat0[k * 4 + 1], biome = data.biome[k];
    let amount = (g + d) / 255;
    if (data.waterY[k] !== NONE || biome === 4 || biome === 3) amount = 0;
    const rd = data.roadDist[k]; if (rd < FAR * 0.5) amount *= Math.min(1, Math.max(0, (rd - CARVE.roadHalfWidth + 0.3) / 2.5));
    for (const p of pads) { const pd = Math.hypot(x - p.x, z - p.z); if (pd < p.flatRadius) amount *= 0.25 + 0.75 * Math.min(1, Math.max(0, (pd - p.flatRadius * 0.6) / (p.flatRadius * 0.4))); }
    const highland = biome === 2 ? 1 : 0;
    const flowers = biome === 0 || biome === 1 ? Math.max(0, fbm2(noise, x / 70, z / 70, 2) * 1.6 - 0.15) : 0;
    den[k * 4] = Math.round(255 * Math.min(1, amount * (highland ? 0.55 : 1)));
    den[k * 4 + 1] = Math.round(255 * (g + d > 0 ? d / (g + d) : 0.5));
    den[k * 4 + 2] = Math.round(255 * Math.min(1, flowers));
    den[k * 4 + 3] = highland * 255;
  }
  const density = new THREE.DataTexture(den, N, N, THREE.RGBAFormat);
  density.minFilter = density.magFilter = THREE.LinearFilter; density.needsUpdate = true;
  return { heights, density };
}

export class GrassField {
  /** @param {{heights, density}} maps @param {string} quality preset name @param {number} range metres (0 = off) */
  constructor(maps, quality, range) {
    this.maps = maps; this.mesh = null; this.material = null; this.range = 0;
    this.uniforms = {
      uHeights: { value: maps.heights }, uDensity: { value: maps.density }, uCam: { value: new THREE.Vector3() },
      uSpan: { value: 1 }, uRange: { value: 1 }, uGrassTime: { value: 0 }, uGrassWind: { value: new THREE.Vector3(1, 0, 0) },
      uPush: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uGrassHeight: { value: TUNING.height }, uGrassWidth: { value: TUNING.width }, uGrassDensity: { value: TUNING.density },
      uWindBend: { value: TUNING.windBend }, uFlowers: { value: TUNING.flowerAmount },
    };
    this.setQuality(quality, range);
  }

  setQuality(quality, range) {
    this.dispose(true);
    this.range = range;
    if (!(range > 0)) return;
    const spacing = TUNING.spacing[quality] ?? TUNING.spacing.medium, blades = TUNING.blades[quality] ?? 4;
    const span = Math.ceil((range * 2) / spacing) * spacing, n = Math.round(span / spacing), count = n * n;
    // one clump: `blades` blades, each 2 segments + a tip (3 triangles)
    const pos = [], blade = [], idx = [];
    for (let b = 0; b < blades; b++) {
      const base = pos.length / 3, ang = (b / blades) * Math.PI + (b % 2) * 0.4, hf = 0.7 + ((b * 7919) % 10) / 10 * 0.6, spread = (b % 3) / 2;
      for (const [x, y] of [[-0.5, 0], [0.5, 0], [-0.5, 0.45], [0.5, 0.45], [0, 1]]) { pos.push(x, y, 0); blade.push(ang, hf, spread); }
      idx.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 4);
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aBlade', new THREE.Float32BufferAttribute(blade, 3));
    geo.setIndex(idx);
    const seeds = new Float32Array(count * 4);
    let s = 0x2545f491;
    const r = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const o = (j * n + i) * 4;
      seeds[o] = (i + 0.15 + r() * 0.7) / n; seeds[o + 1] = (j + 0.15 + r() * 0.7) / n; seeds[o + 2] = r(); seeds[o + 3] = r();
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = count;
    const U = this.uniforms; U.uSpan.value = span; U.uRange.value = range;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.3 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', VERT_BODY + '\nobjectNormal = normalize(vec3(dir.x * 0.35, 1.0, dir.y * 0.35));');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGrass;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vGrass;');
    };
    mat.customProgramCacheKey = () => 'sundown-grass-1';
    // the normal chunk must run after begin_vertex computes `dir`: move it below
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r2) => {
      prev(sh, r2);
      sh.vertexShader = sh.vertexShader.replace('#include <defaultnormal_vertex>', '').replace('#include <normal_vertex>', '').replace(
        '#include <morphtarget_vertex>', '#include <morphtarget_vertex>\n#include <defaultnormal_vertex>\n#include <normal_vertex>');
    };
    this.material = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; this.mesh.receiveShadow = true; this.mesh.name = 'Grass field';
    this.count = count; this.blades = blades;
  }

  /** @param {THREE.Vector3} cam @param {THREE.Vector3} wind @param {number} time @param {THREE.Vector3[]} pushers up to 4 */
  update(cam, wind, time, pushers) {
    if (!this.mesh) return;
    const U = this.uniforms; U.uCam.value.copy(cam); U.uGrassWind.value.copy(wind); U.uGrassTime.value = time;
    U.uGrassHeight.value = TUNING.height; U.uGrassWidth.value = TUNING.width; U.uGrassDensity.value = TUNING.density; U.uWindBend.value = TUNING.windBend; U.uFlowers.value = TUNING.flowerAmount;
    for (let k = 0; k < 4; k++) { const p = pushers[k]; if (p) U.uPush.value[k].set(p.x, p.y, p.z, p.radius ?? 0.9); else U.uPush.value[k].w = 0; }
  }

  dispose(keepMaps = false) {
    if (this.mesh) { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.material.dispose(); this.mesh = null; }
    if (!keepMaps) { this.maps.heights.dispose(); this.maps.density.dispose(); }
  }
}
