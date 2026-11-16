import * as THREE from 'three';
import { withShared, SHARED_FRAG_GLSL } from './Shared.js';

/**
 * Ribbon trails behind a moving object (tracers, thrown torches, lassos later): a pooled triangle strip that
 * records the object's world position and faces the camera. Points age out after `life` seconds.
 */
const POINTS = 32;
const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _toCam = new THREE.Vector3(), _side = new THREE.Vector3();

const VERT = /* glsl */`
attribute float aAlpha; varying float vAlpha; varying float vDist; varying float vEdge;
void main() { vec4 mv = viewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vAlpha = aAlpha; vDist = -mv.z; vEdge = uv.y; }`;
const FRAG = /* glsl */`
uniform vec3 uColor; uniform float uAdditive; varying float vAlpha; varying float vDist; varying float vEdge;
${SHARED_FRAG_GLSL}
void main() {
  float a = vAlpha * (1.0 - abs(vEdge * 2.0 - 1.0));
  if (a < 0.003) discard;
  float fog = vfxFog(vDist);
  if (uAdditive > 0.5) gl_FragColor = vec4(uColor * a * (1.0 - fog), 1.0);
  else gl_FragColor = vec4(mix(uColor, uFogColor, fog), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class Trail {
  constructor(parent) {
    this.pts = Array.from({ length: POINTS }, () => ({ p: new THREE.Vector3(), t: -1 }));
    this.n = 0; this.object = null; this.active = false; this.stopping = false;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(POINTS * 2 * 3); this.alpha = new Float32Array(POINTS * 2);
    const uv = new Float32Array(POINTS * 2 * 2), idx = [];
    for (let i = 0; i < POINTS; i++) { uv[i * 4 + 1] = 0; uv[i * 4 + 3] = 1; if (i < POINTS - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
    this.material = new THREE.ShaderMaterial({ uniforms: withShared({ uColor: { value: new THREE.Color() }, uAdditive: { value: 0 } }), vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.mesh = new THREE.Mesh(geo, this.material); this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 58;
    parent.add(this.mesh);
    const self = this;
    this.handle = { stop() { self.stopping = true; }, setPosition() {}, get active() { return self.active; } };
  }
  start(object, opts, time) {
    this.object = object; this.width = opts.width ?? 0.15; this.life = opts.life ?? 0.4; this.minStep = opts.minStep ?? 0.08;
    this.material.uniforms.uColor.value.set(opts.color ?? 0xffffff);
    const add = !!opts.additive; this.material.uniforms.uAdditive.value = add ? 1 : 0;
    this.material.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.n = 0; this.active = true; this.stopping = false; this.mesh.visible = true; this._t = time;
  }
  update(time, camPos) {
    if (!this.active) return;
    if (!this.stopping && this.object) {
      this.object.getWorldPosition(_p);
      if (this.n === 0 || _p.distanceToSquared(this.pts[0].p) > this.minStep * this.minStep) {
        for (let i = Math.min(this.n, POINTS - 1); i > 0; i--) { this.pts[i].p.copy(this.pts[i - 1].p); this.pts[i].t = this.pts[i - 1].t; }
        this.pts[0].p.copy(_p); this.pts[0].t = time; this.n = Math.min(POINTS, this.n + 1);
      } else { this.pts[0].p.copy(_p); this.pts[0].t = time; }
    }
    while (this.n > 0 && time - this.pts[this.n - 1].t > this.life) this.n--;
    if (this.n === 0 && (this.stopping || !this.object)) { this.active = false; this.mesh.visible = false; return; }
    for (let i = 0; i < POINTS; i++) {
      const k = Math.min(i, Math.max(0, this.n - 1)), pt = this.pts[k];
      const nb = this.pts[Math.min(k + 1, this.n - 1)], pv = this.pts[Math.max(k - 1, 0)];
      _d.copy(pv.p).sub(nb.p); if (_d.lengthSq() < 1e-8) _d.set(0, 1, 0);
      _toCam.copy(camPos).sub(pt.p);
      _side.crossVectors(_d, _toCam).normalize();
      const age = i < this.n ? (time - pt.t) / this.life : 1, w = this.width * (1 - age * 0.6) * 0.5;
      const o = i * 6;
      this.pos[o] = pt.p.x + _side.x * w; this.pos[o + 1] = pt.p.y + _side.y * w; this.pos[o + 2] = pt.p.z + _side.z * w;
      this.pos[o + 3] = pt.p.x - _side.x * w; this.pos[o + 4] = pt.p.y - _side.y * w; this.pos[o + 5] = pt.p.z - _side.z * w;
      const a = i < this.n ? Math.max(0, 1 - age) : 0;
      this.alpha[i * 2] = a; this.alpha[i * 2 + 1] = a;
    }
    const g = this.mesh.geometry; g.attributes.position.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true;
  }
}

export class TrailPool {
  constructor(count, parent) { this.trails = Array.from({ length: count }, () => new Trail(parent)); }
  /** Start a trail on the first free ribbon (or the oldest); returns its handle. */
  start(object, opts, time) {
    const t = this.trails.find((x) => !x.active) || this.trails.reduce((a, b) => (a._t < b._t ? a : b));
    t.start(object, opts, time);
    return t.handle;
  }
  update(time, camPos) { for (const t of this.trails) t.update(time, camPos); }
  get active() { let n = 0; for (const t of this.trails) if (t.active) n++; return n; }
  get meshes() { return this.trails.map((t) => t.mesh); }
  dispose() { for (const t of this.trails) { t.mesh.geometry.dispose(); t.material.dispose(); t.mesh.removeFromParent(); } }
}
