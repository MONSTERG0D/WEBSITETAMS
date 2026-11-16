import * as THREE from 'three';
import { ATLAS_GLSL } from './Atlas.js';
import { withShared, SHARED_FRAG_GLSL } from './Shared.js';

/**
 * GPU particles: one instanced quad per particle, all motion evaluated in the vertex shader from its birth state
 * (position, velocity, life, gravity, drag, wind, size and colour over life, flipbook frames). The CPU only writes
 * new particles into a ring buffer, so a burst costs a few array writes and one partial upload per frame.
 *
 * Per-particle layout (24 floats):
 *  0  pos.xyz, birth      4  vel.xyz, life       8  size0, size1, spin, seed
 *  12 colour0 rgba        16 colour1 rgb, frame (base + frames × 16)
 *  20 gravity, drag, wind, flags (bits + fadeIn fraction)
 * Flags: 1 stretch along velocity · 2 flat (lies on the ground) · 4 lit by ambient light · 8 pulse (fireflies)
 */
export const STRIDE = 24;
export const FLAG = { STRETCH: 1, FLAT: 2, LIT: 4, PULSE: 8 };

const VERT = /* glsl */`
attribute vec4 a0; attribute vec4 a1; attribute vec4 a2; attribute vec4 a3; attribute vec4 a4; attribute vec4 a5;
uniform float uTime; uniform vec3 uWind;
varying vec2 vUv; varying vec4 vColor; varying float vFrame; varying float vLit; varying float vDist; varying float vSoftness;
${ATLAS_GLSL}
void main() {
  float age = uTime - a0.w, life = a1.w;
  if (age < 0.0 || age > life || life <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vColor = vec4(0.0); return; }
  float t = age / life;
  float g = a5.x, k = a5.y, wf = a5.z;
  float bits = floor(a5.w), fadeIn = fract(a5.w);
  float stretch = mod(bits, 2.0), isFlat = mod(floor(bits / 2.0), 2.0), lit = mod(floor(bits / 4.0), 2.0), pulse = mod(floor(bits / 8.0), 2.0);
  float f = k > 0.0 ? (1.0 - exp(-k * age)) / k : age;      // distance factor for the initial velocity
  float tail = k > 0.0 ? (age - f) / k : 0.5 * age * age;   // for constant accelerations
  vec3 pos = a0.xyz + a1.xyz * f + vec3(0.0, -g, 0.0) * tail + uWind * wf * (k > 0.0 ? age - f : 0.5 * age * age);
  vec3 vel = a1.xyz * (k > 0.0 ? exp(-k * age) : 1.0) + vec3(0.0, -g, 0.0) * f + uWind * wf * (k > 0.0 ? 1.0 - exp(-k * age) : age);
  float size = mix(a2.x, a2.y, t);
  float ang = a2.w * 6.2831 + a2.z * age;
  vec2 c = position.xy;
  vec2 rc = vec2(c.x * cos(ang) - c.y * sin(ang), c.x * sin(ang) + c.y * cos(ang));
  vec3 world;
  if (isFlat > 0.5) {
    world = pos + vec3(rc.x, 0.0, rc.y) * size;
  } else if (stretch > 0.5 && dot(vel, vel) > 1e-4) {
    vec3 axis = normalize(vel), toCam = normalize(cameraPosition - pos);
    vec3 side = normalize(cross(axis, toCam) + 1e-5);
    float len = size * (1.0 + length(vel) * 0.06);
    world = pos + side * c.x * size * 0.35 + axis * c.y * len;
  } else {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    world = pos + (right * rc.x + up * rc.y) * size;
  }
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  vDist = -mv.z; vSoftness = size * 0.5;
  // colour over life, fade in and out
  vec4 col = mix(a3, vec4(a4.rgb, 0.0), t);
  col.a = mix(a3.a, 0.0, smoothstep(0.55, 1.0, t)) * (fadeIn > 0.0 ? smoothstep(0.0, fadeIn, t) : 1.0);
  if (pulse > 0.5) col.a *= 0.35 + 0.65 * max(0.0, sin(age * 3.5 + a2.w * 40.0));
  vColor = col; vLit = lit;
  float base = mod(a4.w, 16.0), frames = max(1.0, floor(a4.w / 16.0));
  vFrame = base + min(frames - 1.0, floor(t * frames));
  vUv = uv;
}`;

const FRAG = /* glsl */`
uniform sampler2D tAtlas; uniform vec3 uLight; uniform float uAdditive;
varying vec2 vUv; varying vec4 vColor; varying float vFrame; varying float vLit; varying float vDist; varying float vSoftness;
${ATLAS_GLSL}
${SHARED_FRAG_GLSL}
void main() {
  vec4 tex = texture2D(tAtlas, atlasUv(vFrame, vUv));
  float a = tex.a * vColor.a * vfxSoft(vDist, vSoftness);
  if (a < 0.002) discard;
  vec3 col = vColor.rgb * tex.rgb;
  if (vLit > 0.5) col *= uLight;
  float fog = vfxFog(vDist);
  if (uAdditive > 0.5) { gl_FragColor = vec4(col * a * (1.0 - fog), 1.0); }
  else { gl_FragColor = vec4(mix(col, uFogColor, fog), a); }
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class ParticlePool {
  /**
   * @param {'alpha'|'additive'} kind @param {number} capacity @param {THREE.Texture} atlas
   */
  constructor(kind, capacity, atlas) {
    this.kind = kind; this.capacity = capacity; this.head = 0; this._dirtyFrom = Infinity; this._dirtyTo = -1; this.alive = 0;
    this.data = new Float32Array(capacity * STRIDE);
    for (let i = 0; i < capacity; i++) this.data[i * STRIDE + 7] = 0; // life 0 = dead
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index; geo.setAttribute('position', quad.getAttribute('position')); geo.setAttribute('uv', quad.getAttribute('uv'));
    this.buffer = new THREE.InstancedInterleavedBuffer(this.data, STRIDE, 1);
    this.buffer.setUsage(THREE.DynamicDrawUsage);
    for (let a = 0; a < 6; a++) geo.setAttribute(`a${a}`, new THREE.InterleavedBufferAttribute(this.buffer, 4, a * 4));
    geo.instanceCount = capacity;
    this.geometry = geo;
    const additive = kind === 'additive';
    this.material = new THREE.ShaderMaterial({
      uniforms: withShared({ tAtlas: { value: atlas }, uAdditive: { value: additive ? 1 : 0 } }),
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    if (additive) { this.material.blending = THREE.CustomBlending; this.material.blendSrc = THREE.OneFactor; this.material.blendDst = THREE.OneFactor; }
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 60 : 55; this.mesh.name = `VFX particles (${kind})`;
  }

  /**
   * Write one particle; returns nothing. All arguments are plain numbers so bursts don't allocate.
   * c0/c1 are {r,g,b} objects (THREE.Color) read by value.
   */
  emit(px, py, pz, birth, vx, vy, vz, life, s0, s1, spin, seed, c0, a0, c1, frame, gravity, drag, wind, flags) {
    const i = this.head, o = i * STRIDE, d = this.data;
    this.head = (i + 1) % this.capacity;
    d[o] = px; d[o + 1] = py; d[o + 2] = pz; d[o + 3] = birth;
    d[o + 4] = vx; d[o + 5] = vy; d[o + 6] = vz; d[o + 7] = life;
    d[o + 8] = s0; d[o + 9] = s1; d[o + 10] = spin; d[o + 11] = seed;
    d[o + 12] = c0.r; d[o + 13] = c0.g; d[o + 14] = c0.b; d[o + 15] = a0;
    d[o + 16] = c1.r; d[o + 17] = c1.g; d[o + 18] = c1.b; d[o + 19] = frame;
    d[o + 20] = gravity; d[o + 21] = drag; d[o + 22] = wind; d[o + 23] = flags;
    if (i < this._dirtyFrom) this._dirtyFrom = i;
    if (i > this._dirtyTo) this._dirtyTo = i;
  }

  /** Upload what changed this frame (one range; a wrap-around uploads the span). */
  flush() {
    if (this._dirtyTo < 0) return;
    const b = this.buffer, from = this._dirtyFrom * STRIDE, count = (this._dirtyTo - this._dirtyFrom + 1) * STRIDE;
    if (typeof b.addUpdateRange === 'function') { b.clearUpdateRanges?.(); b.addUpdateRange(from, count); }
    else b.updateRange = { offset: from, count };
    b.needsUpdate = true;
    this._dirtyFrom = Infinity; this._dirtyTo = -1;
  }

  /** Living particles (for the readout; O(capacity), call rarely). */
  countAlive(time) {
    let n = 0; const d = this.data;
    for (let i = 0; i < this.capacity; i++) { const o = i * STRIDE, age = time - d[o + 3]; if (age >= 0 && age <= d[o + 7]) n++; }
    return n;
  }

  /** Kill everything (scene changes, tests). */
  clear() { for (let i = 0; i < this.capacity; i++) this.data[i * STRIDE + 7] = 0; this._dirtyFrom = 0; this._dirtyTo = this.capacity - 1; }

  dispose() { this.geometry.dispose(); this.material.dispose(); this.mesh.removeFromParent(); }
}
