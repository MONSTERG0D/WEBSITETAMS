import * as THREE from 'three';
import { withShared, SHARED_FRAG_GLSL, SHARED, VFX_LAYER } from '../Shared.js';

/**
 * Weather effects (GAME_BIBLE §7 "Weather" row): rain_splash, ripple, fog_bank, lightning_bolt, rainbow, heat_haze.
 * Weather.js spawns them; anything else may too.
 */
export function registerWeatherEffects(vfx) {
  vfx.define('rain_splash', {
    parts: [
      { pool: 'alpha', count: 1, frame: 'crown', life: [0.16, 0.26], size: [[0.07, 0.1], [0.22, 0.3]], color: 0xd2dce6, alpha: 0.55, lit: true, offset: [0, 0.06, 0], tierScale: false },
      { pool: 'alpha', count: 2, frame: 'dot', life: [0.2, 0.32], speed: [0.9, 1.8], spread: 0.6, gravity: 9.8, size: 0.025, color: 0xdbe4ec, alpha: 0.7, lit: true },
    ],
  });
  vfx.define('ripple', {
    parts: [{ pool: 'alpha', count: 1, frame: 'ring', flat: true, life: [0.6, 0.95], size: [[0.06, 0.1], [0.5, 0.75]], color: 0xe2eaf0, alpha: 0.45, lit: true, offset: [0, 0.02, 0], tierScale: false }],
  });
  // Low drifting fog: big soft sprites hugging the ground around a point (Medium and High). Follows the emitter.
  vfx.define('fog_bank', {
    minTier: 'medium',
    parts: [{
      pool: 'alpha', rate: 0.45, prewarm: true, duration: Infinity, shape: 'disc', radius: 70, ground: [1.5, 6],
      frame: 'wisp', life: [45, 65], size: [[22, 30], [32, 44]], spin: [0, 0.01], speed: [0.1, 0.4], spread: 1.5, wind: 0.08, drag: 0.05,
      color: 'fog', alpha: 0.32, fadeIn: 0.25, tierScale: false,
    }],
  });
  defineLightning(vfx);
  defineRainbow(vfx);
  vfx.define('heat_haze', {
    // Screen-space shimmer over distant ground (PostFX). opts.strength 0..1.
    create(v, opts) {
      const post = v.game.sys('postfx');
      let s = 0, stopped = false;
      const target = opts.strength ?? 1;
      return {
        stop() { stopped = true; }, setPosition() {}, get active() { return !stopped || s > 0.01; },
        update(dt) {
          s += ((stopped ? 0 : target) - s) * Math.min(1, dt * 0.5);
          post.setHeatHaze?.(s);
          if (stopped && s < 0.01) { post.setHeatHaze?.(0); return false; }
          return true;
        },
      };
    },
  });
}

// ------------------------------------------------------------------ lightning bolt
const BOLT_VERT = /* glsl */`
attribute vec3 aDir; attribute float aSide; attribute float aWidth; attribute float aGlow;
varying float vEdge; varying float vGlow; varying float vDist;
void main() {
  vec3 toCam = normalize(cameraPosition - position);
  vec3 side = normalize(cross(aDir, toCam) + 1e-5);
  float dist = length(cameraPosition - position);
  float w = max(aWidth, dist * 0.0018); // never thinner than about a pixel
  vec4 mv = viewMatrix * vec4(position + side * aSide * w, 1.0);
  gl_Position = projectionMatrix * mv;
  vEdge = aSide; vGlow = aGlow; vDist = -mv.z;
}`;
const BOLT_FRAG = /* glsl */`
uniform float uStrength; uniform vec3 uColor;
varying float vEdge; varying float vGlow; varying float vDist;
${SHARED_FRAG_GLSL}
void main() {
  float core = 1.0 - smoothstep(0.0, 1.0, abs(vEdge));
  float a = core * core * uStrength * vGlow;
  gl_FragColor = vec4(uColor * a * (1.0 - vfxFog(vDist) * 0.5), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function defineLightning(vfx) {
  let material = null;
  const getMaterial = () => material || (material = new THREE.ShaderMaterial({
    uniforms: withShared({ uStrength: { value: 0 }, uColor: { value: new THREE.Color(0.85, 0.88, 1).multiplyScalar(30) } }),
    vertexShader: BOLT_VERT, fragmentShader: BOLT_FRAG, transparent: true, depthWrite: false, blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, side: THREE.DoubleSide, fog: false,
  }));
  /** Midpoint displacement from a to b; returns a point list. */
  const jag = (a, b, depth, rough) => {
    let pts = [a, b];
    for (let d = 0; d < depth; d++) {
      const next = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1], q = pts[i], len = p.distanceTo(q);
        const m = p.clone().lerp(q, 0.5).add(new THREE.Vector3((Math.random() - 0.5) * len * rough, (Math.random() - 0.5) * len * rough * 0.4, (Math.random() - 0.5) * len * rough));
        next.push(m, q);
      }
      pts = next;
    }
    return pts;
  };
  const build = (ground) => {
    const top = ground.clone().add(new THREE.Vector3((Math.random() - 0.5) * 160, 380 + Math.random() * 120, (Math.random() - 0.5) * 160));
    const strands = [{ pts: jag(top, ground, 6, 0.42), width: 1.4, glow: 1 }];
    const main = strands[0].pts;
    const branches = 3 + Math.floor(Math.random() * 4);
    for (let b = 0; b < branches; b++) {
      const i = Math.floor(main.length * (0.1 + Math.random() * 0.6)), from = main[i];
      const drop = from.y - ground.y, to = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * drop * 0.7, -drop * (0.25 + Math.random() * 0.35), (Math.random() - 0.5) * drop * 0.7));
      strands.push({ pts: jag(from, to, 4, 0.5), width: 0.6, glow: 0.55 });
    }
    let segs = 0; for (const s of strands) segs += s.pts.length - 1;
    const pos = new Float32Array(segs * 4 * 3), dir = new Float32Array(segs * 4 * 3), side = new Float32Array(segs * 4), width = new Float32Array(segs * 4), glow = new Float32Array(segs * 4), idx = [];
    let v = 0;
    for (const s of strands) {
      for (let i = 1; i < s.pts.length; i++) {
        const a = s.pts[i - 1], b = s.pts[i], d = b.clone().sub(a).normalize(), taper = 1 - (i / s.pts.length) * 0.5;
        for (const [p, sd] of [[a, -1], [a, 1], [b, -1], [b, 1]]) {
          pos.set([p.x, p.y, p.z], v * 3); dir.set([d.x, d.y, d.z], v * 3); side[v] = sd; width[v] = s.width * taper; glow[v] = s.glow; v++;
        }
        const o = v - 4; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1)); geo.setAttribute('aWidth', new THREE.BufferAttribute(width, 1)); geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    geo.setIndex(idx);
    return geo;
  };
  let warmMesh = null;
  vfx.define('lightning_bolt', {
    warmup(v) { // a hidden bolt so the material compiles during loading
      if (warmMesh) return;
      warmMesh = new THREE.Mesh(build(new THREE.Vector3(0, -1000, 0)), getMaterial());
      warmMesh.visible = false; warmMesh.frustumCulled = false; v.group.add(warmMesh);
    },
    create(v, opts, pos) {
      const mat = getMaterial().clone(); // each bolt flickers on its own
      mat.uniforms = withShared({ uStrength: { value: 1 }, uColor: { value: getMaterial().uniforms.uColor.value } });
      const mesh = new THREE.Mesh(build(pos.clone()), mat);
      mesh.frustumCulled = false; mesh.renderOrder = 61; mesh.name = 'Lightning bolt';
      v.group.add(mesh);
      const dist = pos.distanceTo(v.game.camera.position);
      if (dist < 500) v.lightFlash({ position: pos.clone().add(new THREE.Vector3(0, 40, 0)), color: 0xcfd8ff, intensity: 3, radius: 160, seconds: 0.4 });
      const pulses = [[0, 1], [0.07 + Math.random() * 0.05, 0.5 + Math.random() * 0.4], [0.17 + Math.random() * 0.12, 0.3 + Math.random() * 0.5]];
      let t = 0, done = false;
      const end = () => { if (done) return; done = true; mesh.removeFromParent(); mesh.geometry.dispose(); mat.dispose(); };
      return {
        stop: end, setPosition() {}, get active() { return !done; },
        update(dt) {
          if (done) return false;
          t += dt;
          let s = 0; for (const [at, amp] of pulses) { const x = t - at; if (x >= 0) s += amp * Math.exp(-x * 14); }
          mat.uniforms.uStrength.value = s;
          if (t > 0.9) { end(); return false; }
          return true;
        },
      };
    },
    dispose() { material?.dispose(); warmMesh?.geometry.dispose(); },
  });
}

// ------------------------------------------------------------------ rainbow
const BOW_VERT = /* glsl */`
varying vec3 vWorld;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vec4 p = projectionMatrix * viewMatrix * w; gl_Position = p; }`;
const BOW_FRAG = /* glsl */`
uniform vec3 uAnti; uniform float uStrength;
varying vec3 vWorld;
${SHARED_FRAG_GLSL}
vec3 spectrum(float x) { // 0 = violet (inside) … 1 = red (outside)
  return clamp(vec3(abs(x * 6.0 - 4.0) - 1.0, 2.0 - abs(x * 6.0 - 2.5), 2.0 - abs(x * 6.0 - 1.0)), 0.0, 1.0);
}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  float ang = degrees(acos(clamp(dot(d, uAnti), -1.0, 1.0)));
  float p = clamp((ang - 40.4) / 2.2, 0.0, 1.0), inP = step(40.4, ang) * step(ang, 42.6);
  float s = clamp((53.6 - ang) / 3.0, 0.0, 1.0), inS = step(50.6, ang) * step(ang, 53.6);
  vec3 col = spectrum(p) * inP * sin(p * 3.1416) + spectrum(s) * inS * sin(s * 3.1416) * 0.35;
  col += vec3(0.08) * (1.0 - smoothstep(30.0, 40.4, ang)) * step(ang, 40.4); // brighter sky inside the bow
  float ground = smoothstep(-0.02, 0.05, d.y);
  gl_FragColor = vec4(col * uStrength * ground, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function defineRainbow(vfx) {
  let mesh = null, active = null;
  const make = (v) => {
    if (mesh) return mesh;
    const mat = new THREE.ShaderMaterial({
      uniforms: withShared({ uAnti: { value: new THREE.Vector3(0, 0, 1) }, uStrength: { value: 0 } }),
      vertexShader: BOW_VERT, fragmentShader: BOW_FRAG, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    mesh = new THREE.Mesh(new THREE.SphereGeometry(450, 48, 24), mat);
    mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 20; mesh.name = 'Rainbow';
    mesh.onBeforeRender = (r, s, cam) => { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); };
    v.group.add(mesh);
    return mesh;
  };
  vfx.define('rainbow', {
    warmup(v) { make(v); },
    /**
     * opts.strength (0..1) fixes the strength; otherwise it follows weather.afterStorm and the sun
     * (a rainbow needs the sun behind you and below 42°).
     */
    create(v, opts) {
      const m = make(v), U = m.material.uniforms;
      let s = 0, stopped = false, dead = false;
      if (active) { s = active._strength(); active._kill(); } // one rainbow at a time; the new handle takes over smoothly
      const handle = {
        stop() { stopped = true; }, setPosition() {}, get active() { return !dead && m.visible; },
        _kill() { dead = true; }, _strength() { return s; },
        update(dt) {
          if (dead) return false;
          const g = v.game, sun = g.sys('sky').getSunDirection(), w = g.get('weather');
          U.uAnti.value.copy(sun).negate();
          const sunOk = THREE.MathUtils.smoothstep(sun.y, 0.02, 0.12) * (1 - THREE.MathUtils.smoothstep(sun.y, 0.55, 0.7));
          const want = stopped ? 0 : (opts.strength ?? (w ? w.afterStorm * (1 - w.darkness) * (1 - w.rain * 0.5) : 1)) * sunOk;
          s += (want - s) * Math.min(1, dt * 0.4);
          U.uStrength.value = s * 1.4;
          m.visible = s > 0.003;
          if ((stopped || (!opts.strength && w && w.afterStorm <= 0)) && s < 0.003) { m.visible = false; if (active === handle) active = null; return false; }
          return true;
        },
      };
      active = handle;
      return handle;
    },
    dispose() { if (mesh) { mesh.geometry.dispose(); mesh.material.dispose(); } },
  });
}

export { SHARED, VFX_LAYER };
