import * as THREE from 'three';
import { withShared, SHARED_FRAG_GLSL } from '../Shared.js';
import { ATLAS_GLSL, FRAMES } from '../Atlas.js';

/**
 * Light effects (GAME_BIBLE §7 "Light" and part of "Nature"): god_rays (shafts through trees and windows),
 * lamp_glow (halos with flicker), dust_motes, shooting_star, fireflies.
 */
export function registerLightEffects(vfx) {
  vfx.define('dust_motes', {
    minTier: 'medium',
    parts: [{ pool: 'additive', rate: 7, prewarm: true, duration: Infinity, shape: 'sphere', radius: 3.5, frame: 'mote', life: [6, 10], speed: [0.02, 0.08], spread: Math.PI,
      size: [0.025, 0.03], color: 0xffe2b0, alpha: 0.55, fadeIn: 0.3, wind: 0.04, drag: 0.6 }],
  });
  vfx.define('fireflies', {
    minTier: 'medium',
    parts: [{ pool: 'additive', rate: 2.4, prewarm: true, duration: Infinity, shape: 'disc', radius: 16, ground: [0.4, 2.4], frame: 'glow', life: [5, 9],
      speed: [0.15, 0.45], spread: Math.PI, vel: [0, 0.05, 0], size: 0.16, color: 0xffd25a, alpha: 2.2, fadeIn: 0.2, pulse: true, drag: 0.4, wind: 0.05 }],
  });
  vfx.define('shooting_star', {
    // Without a position it streaks across a random patch of the night sky.
    prepare(v, opts, pos, dir) {
      if (opts.position) return;
      const cam = v.game.camera.position, a = Math.random() * Math.PI * 2, el = 0.35 + Math.random() * 0.6;
      pos.set(cam.x + Math.cos(a) * Math.cos(el) * 700, cam.y + Math.sin(el) * 700, cam.z + Math.sin(a) * Math.cos(el) * 700);
      const b = a + Math.PI / 2 + (Math.random() - 0.5);
      dir.set(Math.cos(b), -0.25 - Math.random() * 0.3, Math.sin(b)).normalize();
    },
    parts: [
      { pool: 'additive', count: 1, frame: 'spark', stretch: true, life: [0.55, 0.85], speed: [260, 380], size: [5, 3], color: 0xdde8ff, alpha: 3.5, fadeIn: 0.15, tierScale: false },
    ],
  });
  defineGlow(vfx);
  defineGodRays(vfx);
}

// ------------------------------------------------------------------ lamp glow halos (instanced, pooled slots)
const GLOW_VERT = /* glsl */`
attribute vec4 g0; attribute vec4 g1; // pos.xyz, size · colour.rgb, flicker
uniform float uTime;
varying vec2 vUv; varying vec3 vColor; varying float vDist;
void main() {
  if (g0.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float fl = 1.0 - g1.w * (0.5 + 0.5 * sin(uTime * 13.0 + g0.x * 3.1) * sin(uTime * 7.3 + g0.z * 1.7));
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 toCam = normalize(cameraPosition - g0.xyz);
  vec3 world = g0.xyz + toCam * g0.w * 0.3 + (right * position.x + up * position.y) * g0.w * (0.92 + 0.08 * fl);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  vUv = uv; vColor = g1.rgb * fl; vDist = -mv.z;
}`;
const GLOW_FRAG = /* glsl */`
uniform sampler2D tAtlas;
varying vec2 vUv; varying vec3 vColor; varying float vDist;
${ATLAS_GLSL}
${SHARED_FRAG_GLSL}
void main() {
  float a = texture2D(tAtlas, atlasUv(${FRAMES.glow}.0, vUv)).a * vfxSoft(vDist, 0.6);
  gl_FragColor = vec4(vColor * a * (1.0 - vfxFog(vDist)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function defineGlow(vfx) {
  const CAP = 96;
  let pool = null;
  const make = (v) => {
    if (pool) return pool;
    const data = new Float32Array(CAP * 8), quad = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index; geo.setAttribute('position', quad.getAttribute('position')); geo.setAttribute('uv', quad.getAttribute('uv'));
    const buf = new THREE.InstancedInterleavedBuffer(data, 8, 1); buf.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('g0', new THREE.InterleavedBufferAttribute(buf, 4, 0)); geo.setAttribute('g1', new THREE.InterleavedBufferAttribute(buf, 4, 4));
    geo.instanceCount = CAP;
    const mat = new THREE.ShaderMaterial({
      uniforms: withShared({ tAtlas: { value: v.atlas } }), vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false, fog: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 62; mesh.name = 'VFX glows'; mesh.layers.set(v.layer);
    v.group.add(mesh);
    pool = { data, buf, mesh, free: Array.from({ length: CAP }, (_, i) => CAP - 1 - i) };
    return pool;
  };
  const _c = new THREE.Color();
  vfx.define('lamp_glow', {
    warmup(v) { make(v); },
    /** opts: position, color (default warm lamp), scale (halo size in m, default 0.9), flicker 0..1 (default 0.15), intensity (default 1.6) */
    create(v, opts, pos) {
      const P = make(v);
      if (!P.free.length) return null;
      const i = P.free.pop(), o = i * 8;
      _c.set(opts.color ?? 0xffb35a).multiplyScalar(opts.intensity ?? 1.6);
      P.data.set([pos.x, pos.y, pos.z, opts.scale ?? 0.9, _c.r, _c.g, _c.b, opts.flicker ?? 0.15], o);
      P.buf.needsUpdate = true;
      let live = true;
      return {
        get active() { return live; },
        stop() { if (!live) return; live = false; P.data[o + 3] = 0; P.buf.needsUpdate = true; P.free.push(i); },
        setPosition(p) { if (live && p) { P.data[o] = p.x; P.data[o + 1] = p.y; P.data[o + 2] = p.z; P.buf.needsUpdate = true; } },
        update() { return live; },
      };
    },
    dispose() { if (pool) { pool.mesh.geometry.dispose(); pool.mesh.material.dispose(); } },
  });
}

// ------------------------------------------------------------------ god rays: soft shafts along the sun direction
const RAY_VERT = /* glsl */`
attribute vec4 r0; // offset.xyz from the effect origin, width
attribute float r1; // phase
uniform vec3 uOrigin; uniform vec3 uSun; uniform float uLength; uniform float uTime;
varying vec2 vUv; varying float vPhase; varying float vDist;
void main() {
  vec3 base = uOrigin + r0.xyz;
  vec3 axis = uSun;
  vec3 toCam = normalize(cameraPosition - base);
  vec3 side = normalize(cross(axis, toCam) + 1e-5);
  vec3 world = base + side * position.x * r0.w + axis * (position.y + 0.5) * uLength;
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  vUv = uv; vPhase = r1; vDist = -mv.z;
}`;
const RAY_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uStrength; uniform float uTime;
varying vec2 vUv; varying float vPhase; varying float vDist;
${SHARED_FRAG_GLSL}
void main() {
  float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
  float along = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
  float shimmer = 0.75 + 0.25 * sin(uTime * 0.6 + vPhase * 6.28);
  float a = across * across * along * shimmer * uStrength * vfxSoft(vDist, 2.0);
  gl_FragColor = vec4(uColor * a * (1.0 - vfxFog(vDist)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function defineGodRays(vfx) {
  let warm = null;
  const geometry = (n, spread) => {
    const quad = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index; geo.setAttribute('position', quad.getAttribute('position')); geo.setAttribute('uv', quad.getAttribute('uv'));
    const r0 = new Float32Array(n * 4), r1 = new Float32Array(n);
    for (let i = 0; i < n; i++) { r0.set([(Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread * 0.3, (Math.random() - 0.5) * spread, 0.6 + Math.random() * 1.8], i * 4); r1[i] = Math.random(); }
    geo.setAttribute('r0', new THREE.InstancedBufferAttribute(r0, 4)); geo.setAttribute('r1', new THREE.InstancedBufferAttribute(r1, 1));
    geo.instanceCount = n;
    return geo;
  };
  const material = () => new THREE.ShaderMaterial({
    uniforms: withShared({ uOrigin: { value: new THREE.Vector3() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uLength: { value: 28 }, uColor: { value: new THREE.Color() }, uStrength: { value: 0 } }),
    vertexShader: RAY_VERT, fragmentShader: RAY_FRAG, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
  vfx.define('god_rays', {
    minTier: 'medium',
    warmup(v) { if (!warm) { warm = new THREE.Mesh(geometry(1, 1), material()); warm.visible = false; warm.frustumCulled = false; warm.layers.set(v.layer); v.group.add(warm); } },
    /** opts: position (where the light lands), scale (spread in m, default 6), length (default 28), strength (default 1) */
    create(v, opts, pos) {
      const n = v.tier === 'high' ? 7 : 4, mat = material();
      const mesh = new THREE.Mesh(geometry(n, opts.scale ?? 6), mat);
      mesh.frustumCulled = false; mesh.renderOrder = 59; mesh.layers.set(v.layer); mesh.name = 'God rays';
      v.group.add(mesh);
      const U = mat.uniforms; U.uOrigin.value.copy(pos); U.uLength.value = opts.length ?? 28;
      let s = 0, stopped = false, done = false;
      const end = () => { if (done) return; done = true; mesh.removeFromParent(); mesh.geometry.dispose(); mat.dispose(); };
      return {
        get active() { return !done; },
        stop() { stopped = true; },
        setPosition(p) { if (p) U.uOrigin.value.copy(p); },
        update(dt) {
          if (done) return false;
          const sky = v.game.sys('sky'), sun = sky.getSunDirection(), w = v.game.get('weather');
          U.uSun.value.copy(sun);
          if (sky.sunLight) U.uColor.value.copy(sky.sunLight.color).multiplyScalar(0.35);
          const want = stopped ? 0 : (opts.strength ?? 1) * THREE.MathUtils.smoothstep(sun.y, 0.02, 0.15) * (1 - (w ? w.darkness : 0));
          s += (want - s) * Math.min(1, dt * 1.5);
          U.uStrength.value = s;
          mesh.visible = s > 0.002;
          if (stopped && s < 0.003) { end(); return false; }
          return true;
        },
      };
    },
    dispose() { if (warm) { warm.geometry.dispose(); warm.material.dispose(); } },
  });
}
