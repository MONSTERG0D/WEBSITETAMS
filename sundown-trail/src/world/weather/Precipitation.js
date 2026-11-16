import * as THREE from 'three';

/**
 * Rain streaks and snow flakes around the camera: one instanced quad, all motion in the vertex shader.
 * Drops live at world-stable positions inside a box that wraps around the camera, so walking through rain
 * doesn't drag it along. Intensity trims the instance count (fewer vertices, not just invisible ones).
 */
const VERT = /* glsl */`
attribute vec4 aSeed;
uniform vec3 uCam; uniform vec3 uBox; uniform float uTime; uniform float uFall; uniform vec3 uWind; uniform vec2 uSize;
uniform float uIntensity; uniform float uSnow; uniform float uPixel;
varying vec2 vCorner; varying float vFade;
void main() {
  vCorner = position.xy;
  vec2 span = uBox.xz * 2.0;
  float fallSpan = uBox.y * 2.0;
  float speed = uFall * (0.85 + 0.3 * aSeed.w);
  vec3 drift = uWind * uTime * (uSnow > 0.5 ? 0.8 : 0.35);
  vec3 p;
  p.y = uBox.y - mod(aSeed.y * fallSpan + uTime * speed, fallSpan);
  p.xz = mod(aSeed.xz * span + drift.xz - uCam.xz, span) - uBox.xz;
  if (uSnow > 0.5) { // flutter
    float ph = aSeed.w * 40.0 + uTime * (0.9 + aSeed.x);
    p.x += sin(ph) * 0.35; p.z += cos(ph * 0.83) * 0.35;
  }
  vec3 world = uCam + p;
  vec3 toCam = normalize(cameraPosition - world);
  vec3 vel = normalize(vec3(uWind.x * 0.35, -speed, uWind.z * 0.35));
  vec3 side, along; float w = uSize.x, len = uSize.y;
  if (uSnow > 0.5) {
    side = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    along = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    w *= 0.6 + aSeed.w * 0.8; len = w;
  } else {
    side = normalize(cross(vel, toCam)); along = -vel;
  }
  float d = length(p);
  // never thinner than ~1.5 pixels (thin streaks vanish at phone resolutions); keep the same total brightness
  float wPx = max(w, d * uPixel * 1.5);
  float energy = w / wPx;
  world += side * position.x * wPx + along * (position.y - 0.5) * len;
  vFade = smoothstep(0.4, 2.2, d) * (1.0 - smoothstep(uBox.x * 0.55, uBox.x, length(p.xz))) * step(aSeed.w, uIntensity) * (uSnow > 0.5 ? 1.0 : mix(0.35, 1.0, energy));
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const FRAG = /* glsl */`
uniform vec3 uColor; uniform float uOpacity; uniform float uSnow;
varying vec2 vCorner; varying float vFade;
void main() {
  float a;
  if (uSnow > 0.5) { a = 1.0 - smoothstep(0.15, 0.5, length(vCorner - vec2(0.0, 0.5))); }
  else { a = (1.0 - abs(vCorner.x) * 2.0) * smoothstep(0.0, 0.35, vCorner.y) * (1.0 - smoothstep(0.7, 1.0, vCorner.y)); }
  a *= vFade * uOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const PRECIP_TUNING = {
  rain: { box: [17, 13, 17], fall: 13, size: [0.014, 0.8], opacity: 0.4, counts: { low: 1200, medium: 3200, high: 7000 } },
  snow: { box: [20, 12, 20], fall: 1.1, size: [0.055, 0.055], opacity: 0.85, counts: { low: 700, medium: 1800, high: 3600 } },
};

export class Precipitation {
  /** @param {'rain'|'snow'} kind @param {string} quality preset name */
  constructor(kind, quality) {
    this.kind = kind; this.cfg = PRECIP_TUNING[kind]; this.max = 0;
    const quad = new THREE.PlaneGeometry(1, 1); quad.translate(0, 0.5, 0);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = quad.index; this.geometry.setAttribute('position', quad.getAttribute('position'));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...this.cfg.box) }, uTime: { value: 0 },
        uFall: { value: this.cfg.fall }, uWind: { value: new THREE.Vector3() }, uSize: { value: new THREE.Vector2(...this.cfg.size) },
        uIntensity: { value: 0 }, uPixel: { value: 0.002 }, uSnow: { value: kind === 'snow' ? 1 : 0 }, uColor: { value: new THREE.Color(0.6, 0.65, 0.7) }, uOpacity: { value: this.cfg.opacity },
      },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, // streak winding depends on the view
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 50; this.mesh.name = kind === 'snow' ? 'Snow' : 'Rain';
    this.mesh.visible = false; this.mesh.userData.warmup = true; // VFX.warmup compiles it while hidden
    this.setQuality(quality);
  }

  setQuality(name) {
    const n = this.cfg.counts[name] || this.cfg.counts.medium;
    if (n === this.max) return;
    this.max = n;
    const seeds = new Float32Array(n * 4);
    let s = 0x9e3779b9 ^ (this.kind === 'snow' ? 77 : 13);
    const r = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
    for (let i = 0; i < n; i++) { seeds[i * 4] = r(); seeds[i * 4 + 1] = r(); seeds[i * 4 + 2] = r(); seeds[i * 4 + 3] = (i + 0.5) / n; }
    this.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  }

  /**
   * @param {number} intensity 0..1 @param {THREE.Vector3} cam camera position @param {THREE.Vector3} wind m/s
   * @param {THREE.Color} light colour the drops pick up from the sky @param {number} time seconds
   * @param {number} [pixel] size of one pixel at 1 m (2·tan(fov/2) / buffer height)
   */
  update(intensity, cam, wind, light, time, pixel = 0.002) {
    const U = this.material.uniforms;
    this.mesh.visible = intensity > 0.005;
    if (!this.mesh.visible) return;
    U.uIntensity.value = intensity; U.uPixel.value = pixel; U.uCam.value.copy(cam); U.uWind.value.copy(wind); U.uTime.value = time; U.uColor.value.copy(light);
    this.geometry.instanceCount = Math.max(1, Math.ceil(this.max * intensity));
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); this.mesh.removeFromParent(); }
}
