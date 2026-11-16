import * as THREE from 'three';
import { ATLAS_GLSL } from './Atlas.js';
import { withShared, SHARED_FRAG_GLSL } from './Shared.js';

/**
 * Fading decals (bullet holes, prints, scorch marks): instanced quads laid on a surface along its normal,
 * in a ring buffer so the oldest decal is reused. Per decal (16 floats):
 *  pos.xyz, birth · normal.xyz, life · size, angle, frame, alpha · colour rgb, fadeTime
 */
const STRIDE = 16;

const VERT = /* glsl */`
attribute vec4 d0; attribute vec4 d1; attribute vec4 d2; attribute vec4 d3;
uniform float uTime;
varying vec2 vUv; varying float vAlpha; varying float vFrame; varying vec3 vColor; varying float vDist;
void main() {
  float age = uTime - d0.w, life = d1.w;
  if (life <= 0.0 || age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; return; }
  vec3 n = normalize(d1.xyz);
  vec3 t = normalize(abs(n.y) < 0.95 ? cross(vec3(0.0, 1.0, 0.0), n) : cross(vec3(1.0, 0.0, 0.0), n));
  vec3 b = cross(n, t);
  float ca = cos(d2.y), sa = sin(d2.y);
  vec3 tt = t * ca + b * sa, bb = -t * sa + b * ca;
  vec3 world = d0.xyz + n * 0.02 + (tt * position.x + bb * position.y) * d2.x;
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  vDist = -mv.z;
  float fade = d3.w > 0.0 ? 1.0 - smoothstep(life - d3.w, life, age) : 1.0;
  vAlpha = d2.w * fade * smoothstep(0.0, 0.08, age);
  vFrame = d2.z; vColor = d3.rgb; vUv = uv;
}`;

const FRAG = /* glsl */`
uniform sampler2D tAtlas; uniform vec3 uLight;
varying vec2 vUv; varying float vAlpha; varying float vFrame; varying vec3 vColor; varying float vDist;
${ATLAS_GLSL}
${SHARED_FRAG_GLSL}
void main() {
  vec4 tex = texture2D(tAtlas, atlasUv(vFrame, vUv));
  float a = tex.a * vAlpha;
  if (a < 0.003) discard;
  vec3 col = tex.rgb * vColor * uLight;
  gl_FragColor = vec4(mix(col, uFogColor, vfxFog(vDist)), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class DecalPool {
  constructor(capacity, atlas) {
    this.capacity = capacity; this.head = 0;
    this.data = new Float32Array(capacity * STRIDE);
    const quad = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index; geo.setAttribute('position', quad.getAttribute('position')); geo.setAttribute('uv', quad.getAttribute('uv'));
    this.buffer = new THREE.InstancedInterleavedBuffer(this.data, STRIDE, 1); this.buffer.setUsage(THREE.DynamicDrawUsage);
    for (let a = 0; a < 4; a++) geo.setAttribute(`d${a}`, new THREE.InterleavedBufferAttribute(this.buffer, 4, a * 4));
    geo.instanceCount = capacity;
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: withShared({ tAtlas: { value: atlas } }), vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.name = 'VFX decals';
    this._dirty = false;
  }

  /** @returns {number} slot index */
  add(p, n, birth, life, size, angle, frame, alpha, color, fade) {
    const i = this.head, o = i * STRIDE, d = this.data;
    this.head = (i + 1) % this.capacity;
    d[o] = p.x; d[o + 1] = p.y; d[o + 2] = p.z; d[o + 3] = birth;
    d[o + 4] = n.x; d[o + 5] = n.y; d[o + 6] = n.z; d[o + 7] = life;
    d[o + 8] = size; d[o + 9] = angle; d[o + 10] = frame; d[o + 11] = alpha;
    d[o + 12] = color.r; d[o + 13] = color.g; d[o + 14] = color.b; d[o + 15] = fade;
    this._dirty = true;
    return i;
  }
  /** End a decal early (its handle's stop()). */
  kill(i) { this.data[i * STRIDE + 7] = 0; this._dirty = true; }
  flush() { if (this._dirty) { this.buffer.needsUpdate = true; this._dirty = false; } }
  dispose() { this.geometry.dispose(); this.material.dispose(); this.mesh.removeFromParent(); }
}
