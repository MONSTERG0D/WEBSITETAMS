import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { createAtlas, FRAMES } from './vfx/Atlas.js';
import { ParticlePool, FLAG } from './vfx/ParticlePool.js';
import { DecalPool } from './vfx/Decals.js';
import { TrailPool } from './vfx/Trails.js';
import { SHARED, VFX_LAYER } from './vfx/Shared.js';
import { registerWeatherEffects } from './vfx/library/weather.js';
import { registerLightEffects } from './vfx/library/light.js';
import { registerRidingEffects } from './vfx/library/riding.js';

/**
 * VFX (Part 2B): the shared effects engine every part spawns through (GAME_BIBLE §7 "Special effects", §11 VFX API).
 * GPU-instanced particles with shader-driven motion in two pools (alpha and additive), fading decals, ribbon trails,
 * pooled light flashes, screen shake/flash/blur, custom effects (lightning, rainbow, light shafts, glows, heat haze)
 * and warmup() so no effect shader compiles mid-game. Quality tiers scale counts and skip effects marked minTier.
 *
 * Effect definition (vfx.define(name, def)):
 *   parts: [{ pool: 'alpha'|'additive', count | rate + duration (Infinity = until stop()), prewarm,
 *             shape: 'point'|'sphere'|'disc'|'box', radius, box: [x,y,z], offset: [x,y,z], ground: metres above terrain,
 *             spread (radians around the direction), speed: [a,b], vel: [x,y,z], life: [a,b], size: [start,end] or [[a,b],[c,d]],
 *             spin: [a,b], color: hex | [hex0, hex1] | 'fog', alpha: a | [a0, a1], fadeIn: 0..0.99, frame: name|index, frames,
 *             gravity, drag, wind, stretch, flat, lit, pulse, tierScale (default true) }]
 *   decal: { frame, size: [a,b], life, fade, alpha, color }       light: { color, intensity, radius, seconds }
 *   prepare(vfx, opts, pos, dir) adjusts the spawn point · create(vfx, opts) returns a custom handle
 *   { update(dt, time) → alive, stop(), setPosition(v) } · warmup(vfx) compiles custom materials · minTier
 */
export const TUNING = {
  tierScale: { low: 0.35, medium: 0.65, high: 1 },
  poolShare: { alpha: 0.6, additive: 0.45 }, minPool: 256,
  decals: { low: 64, medium: 160, high: 400 }, trails: 12,
  lights: { low: 1, medium: 2, high: 4 }, lightScale: 0.15,
};
const TIERS = ['low', 'medium', 'high'];
const NULL_HANDLE = Object.freeze({ stop() {}, setPosition() {}, active: false });
const UP = new THREE.Vector3(0, 1, 0);
const _pos = new THREE.Vector3(), _dir = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _v = new THREE.Vector3();
const _c0 = new THREE.Color(), _c1 = new THREE.Color(), _ct = new THREE.Color();
const rand = (r) => (Array.isArray(r) ? r[0] + Math.random() * (r[1] - r[0]) : r ?? 0);

/** A continuous emitter (or a group of them) behind one handle. */
class Emitter {
  constructor(vfx) {
    this.vfx = vfx; this.pos = new THREE.Vector3(); this.dir = new THREE.Vector3(); this.parts = []; this.acc = []; this.parent = null;
    const self = this;
    this.handle = { stop() { self.stopped = true; }, setPosition(v) { if (v) self.pos.copy(v); }, get active() { return self.alive; } };
  }
  reset(def, opts, pos, dir) {
    this.def = def; this.opts = opts; this.pos.copy(pos); this.dir.copy(dir); this.parent = opts.parent || null;
    this.parts.length = 0; this.acc.length = 0; this.t = 0; this.stopped = false; this.alive = true;
    for (const p of def.parts) if (p.rate) { this.parts.push(p); this.acc.push(0); }
  }
  update(dt) {
    if (!this.alive) return false;
    this.t += dt;
    if (this.parent) this.parent.getWorldPosition(this.pos);
    let running = false;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i], dur = p.duration ?? Infinity;
      if (this.stopped || this.t > dur) continue;
      running = true;
      this.acc[i] += p.rate * this.vfx.tierFactor(p) * dt;
      const n = Math.floor(this.acc[i]);
      if (n > 0) { this.acc[i] -= n; this.vfx._emitPart(p, this.opts, this.pos, this.dir, n, 0); }
    }
    if (!running) this.alive = false;
    return this.alive;
  }
}

export default class VFX extends System {
  constructor(game) {
    super(game);
    this.defs = new Map(); this.emitters = []; this.customs = []; this._freeEmitters = []; this._warned = new Set();
    this.lights = []; this.stats = { spawned: 0, emitters: 0, customs: 0 };
    this.time = 0;
  }

  async init() {
    const g = this.game, q = g.quality.name;
    this.tier = q;
    this.group = new THREE.Group(); this.group.name = 'VFX';
    g.scene.add(this.group);
    this.atlas = createAtlas(q === 'low' ? 64 : 128);
    const max = g.quality.maxParticles || 1500;
    this.layer = g.get('postfx') ? VFX_LAYER : 0; // the soft pass lives in PostFX; without it everything renders normally
    this.pools = {
      alpha: new ParticlePool('alpha', Math.max(TUNING.minPool, Math.round(max * TUNING.poolShare.alpha)), this.atlas),
      additive: new ParticlePool('additive', Math.max(TUNING.minPool, Math.round(max * TUNING.poolShare.additive)), this.atlas),
    };
    for (const p of Object.values(this.pools)) { p.mesh.layers.set(this.layer); this.group.add(p.mesh); }
    this.decals = new DecalPool(TUNING.decals[q] || 160, this.atlas);
    this.group.add(this.decals.mesh);
    this.trails = new TrailPool(TUNING.trails, this.group);
    this._makeLights(q);
    registerWeatherEffects(this);
    registerLightEffects(this);
    registerRidingEffects(this);
    g.events.on(EVENTS.QUALITY_CHANGED, ({ preset }) => { this.tier = preset; this._makeLights(preset); });
    g.debug?.addTuning('VFX', TUNING.tierScale);
  }

  // ---------------------------------------------------------------- API (GAME_BIBLE §11)
  /** Register or replace an effect. */
  define(name, def) {
    const d = { ...def, parts: (def.parts || []).map((p) => this._compilePart(p)) };
    this.defs.set(name, d);
    if (this._warmedUp && d.warmup) d.warmup(this);
  }

  /**
   * @param {string} name
   * @param {{ position?: THREE.Vector3, normal?: THREE.Vector3, direction?: THREE.Vector3, scale?: number,
   *           color?: THREE.ColorRepresentation, parent?: THREE.Object3D, count?: number }} [opts]
   * @returns {{ stop(): void, setPosition(v: THREE.Vector3): void }}
   */
  spawn(name, opts = {}) {
    const def = this.defs.get(name);
    if (!def) { this._warnOnce(name); return NULL_HANDLE; }
    if (!this.pools) return NULL_HANDLE; // before init (world systems initialise first)
    if (def.minTier && TIERS.indexOf(this.tier) < TIERS.indexOf(def.minTier)) return NULL_HANDLE;
    _pos.copy(opts.position || (opts.parent ? opts.parent.getWorldPosition(_t1) : this.game.camera.position));
    _dir.copy(opts.normal || opts.direction || UP);
    if (_dir.lengthSq() < 1e-8) _dir.copy(UP); else _dir.normalize();
    def.prepare?.(this, opts, _pos, _dir);
    this.stats.spawned++;
    if (def.light) this.lightFlash({ position: _pos, ...def.light });
    if (def.create) {
      const h = def.create(this, opts, _pos, _dir);
      if (h) { this.customs.push(h); return h; }
      return NULL_HANDLE;
    }
    if (def.decal) return this.decal(name, opts);
    let hasRate = false;
    for (const p of def.parts) {
      if (p.rate) { hasRate = true; if (p.prewarm) this._emitPart(p, opts, _pos, _dir, Math.round(p.rate * this.tierFactor(p) * rand(p.life)), 1); continue; }
      const n = opts.count ?? p.count;
      const scaled = n * this.tierFactor(p), whole = Math.floor(scaled) + (Math.random() < scaled % 1 ? 1 : 0);
      if (whole > 0) this._emitPart(p, opts, _pos, _dir, whole, 0);
    }
    if (!hasRate) return NULL_HANDLE; // bursts need no handle (and allocate nothing)
    const e = this._freeEmitters.pop() || new Emitter(this);
    e.reset(def, opts, _pos, _dir);
    this.emitters.push(e);
    return e.handle;
  }

  /**
   * A fading decal laid on a surface.
   * @param {string} name a defined effect with a `decal` block, or an atlas frame name
   * @param {{ position: THREE.Vector3, normal?: THREE.Vector3, size?: number, lifetime?: number, color?: THREE.ColorRepresentation, angle?: number }} opts
   */
  decal(name, opts = {}) {
    const d = this.defs.get(name)?.decal || (FRAMES[name] !== undefined ? { frame: name } : null);
    if (!d || !opts.position) { if (!d) this._warnOnce(name); return NULL_HANDLE; }
    const frame = typeof d.frame === 'string' ? FRAMES[d.frame] : d.frame ?? 0;
    _ct.set(opts.color ?? d.color ?? 0xffffff);
    const life = opts.lifetime ?? d.life ?? 30, size = opts.size ?? rand(d.size ?? 0.3);
    const slot = this.decals.add(opts.position, opts.normal || UP, this.time, life, size, opts.angle ?? Math.random() * Math.PI * 2, frame, d.alpha ?? 1, _ct, d.fade ?? Math.min(3, life * 0.3));
    const pool = this.decals, birth = this.time;
    return { stop() { if (pool.data[slot * 16 + 3] === birth) pool.kill(slot); }, setPosition() {} };
  }

  /** Ribbon trail behind an object. @param {THREE.Object3D} object @param {{ width, color, life, additive }} [opts] */
  trail(object, opts = {}) { return object ? this.trails.start(object, opts, this.time) : NULL_HANDLE; }

  /** A short point-light pulse (muzzle flashes, lightning, explosions). */
  lightFlash({ position, color = 0xffc070, intensity = 2, radius = 8, seconds = 0.12 } = {}) {
    if (!position || !this.lights.length) return;
    let L = null, best = -1; // a free light, or the one closest to finishing
    for (const l of this.lights) { const k = l.userData.t / l.userData.seconds; if (k >= 1) { L = l; break; } if (k > best) { best = k; L = l; } }
    L.position.copy(position); L.color.set(color); L.distance = radius;
    Object.assign(L.userData, { t: 0, seconds: Math.max(0.02, seconds), peak: intensity * radius * radius * TUNING.lightScale });
    L.intensity = L.userData.peak;
  }

  /** Screen-level feedback: { shake (0..1), flash (strength or { color, strength }), blur (0..1), seconds }. */
  screen({ shake = 0, flash = 0, blur = 0, seconds = 0.25 } = {}) {
    const g = this.game;
    if (shake > 0) g.cameraRig.shake(shake, seconds);
    if (flash) { const f = typeof flash === 'object' ? flash : { strength: flash }; g.sys('postfx').flash(f.color ?? 0xffffff, seconds, f.strength ?? 0.6); }
    if (blur > 0) g.sys('postfx').blur?.(blur, seconds);
  }

  /** Compile every effect material now (called during loading). */
  async warmup() {
    const g = this.game, r = g.renderer, cam = g.camera;
    for (const d of this.defs.values()) d.warmup?.(this);
    this._warmedUp = true;
    // show everything that is hidden until needed (effects, rain and snow), then compile for the HDR target PostFX renders into
    const hidden = [];
    this.group.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    g.scene.traverse((o) => { if (o.userData.warmup && !o.visible) { hidden.push(o); o.visible = true; } });
    const had = cam.layers.isEnabled(VFX_LAYER);
    cam.layers.enable(VFX_LAYER);
    try {
      const post = g.get('postfx');
      if (post?.compileScene) post.compileScene(g.scene, cam); else r.compile(g.scene, cam);
    } finally { if (!had) cam.layers.disable(VFX_LAYER); for (const o of hidden) o.visible = false; }
  }

  // ---------------------------------------------------------------- engine
  /** Count multiplier for the current tier (parts with tierScale: false always emit in full). */
  tierFactor(part) { return part?.tierScale === false ? 1 : TUNING.tierScale[this.tier] ?? 0.65; }

  _compilePart(p) {
    const q = { pool: 'alpha', count: 1, shape: 'point', radius: 0, spread: 0, speed: 0, life: 1, size: 0.3, spin: 0, alpha: 1, fadeIn: 0, frame: 'dot', frames: 1, gravity: 0, drag: 0, wind: 0, ...p };
    q.frameCode = (typeof q.frame === 'string' ? FRAMES[q.frame] ?? 0 : q.frame) + Math.max(1, q.frames) * 16;
    q.flags = (q.stretch ? FLAG.STRETCH : 0) | (q.flat ? FLAG.FLAT : 0) | (q.lit ? FLAG.LIT : 0) | (q.pulse ? FLAG.PULSE : 0);
    q.flagCode = q.flags + Math.min(0.99, q.fadeIn);
    const cols = Array.isArray(q.color) ? q.color : [q.color ?? 0xffffff, q.color ?? 0xffffff];
    q.fogColor = cols[0] === 'fog';
    q.c0 = new THREE.Color(q.fogColor ? 0xffffff : cols[0]); q.c1 = new THREE.Color(q.fogColor ? 0xffffff : cols[1] ?? cols[0]);
    q.a0 = Array.isArray(q.alpha) ? q.alpha[0] : q.alpha;
    const sz = Array.isArray(q.size) ? q.size : [q.size, q.size];
    q.s0 = sz[0]; q.s1 = sz[1] ?? sz[0];
    return q;
  }

  /** Emit n particles of one part. age0 = 1 spreads births over the past lifetime (prewarm). */
  _emitPart(p, opts, pos, dir, n, age0) {
    const pool = this.pools[p.pool] || this.pools.alpha, time = this.time, scale = opts.scale ?? 1;
    const terrain = p.ground !== undefined ? this.game.sys('terrain') : null;
    // basis around dir for cones
    const t1 = _t1, t2 = _t2;
    if (Math.abs(dir.y) < 0.95) t1.set(0, 1, 0).cross(dir).normalize(); else t1.set(1, 0, 0).cross(dir).normalize();
    t2.copy(dir).cross(t1);
    if (opts.color !== undefined) { _c0.set(opts.color); _c1.copy(_c0); }
    else if (p.fogColor) { _c0.copy(SHARED.uFogColor.value); _c1.copy(_c0); }
    else { _c0.copy(p.c0); _c1.copy(p.c1); }
    const cosMax = Math.cos(Math.min(Math.PI, p.spread));
    for (let i = 0; i < n; i++) {
      // spawn position
      let ox = 0, oy = 0, oz = 0;
      if (p.shape === 'sphere') { const u = Math.random() * 2 - 1, a = Math.random() * 6.2832, r = p.radius * Math.cbrt(Math.random()) * scale, s = Math.sqrt(1 - u * u); ox = s * Math.cos(a) * r; oy = u * r; oz = s * Math.sin(a) * r; }
      else if (p.shape === 'disc') { const a = Math.random() * 6.2832, r = p.radius * Math.sqrt(Math.random()) * scale; ox = Math.cos(a) * r; oz = Math.sin(a) * r; }
      else if (p.shape === 'box') { const b = p.box || [1, 1, 1]; ox = (Math.random() - 0.5) * b[0] * scale; oy = (Math.random() - 0.5) * b[1] * scale; oz = (Math.random() - 0.5) * b[2] * scale; }
      if (p.offset) { ox += p.offset[0] * scale; oy += p.offset[1] * scale; oz += p.offset[2] * scale; }
      let px = pos.x + ox, py = pos.y + oy, pz = pos.z + oz;
      if (terrain) py = terrain.getHeightAt(px, pz) + rand(p.ground) + oy;
      // velocity: a random direction inside the cone around dir
      const ct = cosMax + (1 - cosMax) * Math.random(), st = Math.sqrt(Math.max(0, 1 - ct * ct)), ph = Math.random() * 6.2832;
      const sp = rand(p.speed) * scale;
      const cx = Math.cos(ph) * st, cy = Math.sin(ph) * st;
      let vx = (dir.x * ct + t1.x * cx + t2.x * cy) * sp, vy = (dir.y * ct + t1.y * cx + t2.y * cy) * sp, vz = (dir.z * ct + t1.z * cx + t2.z * cy) * sp;
      if (p.vel) { vx += p.vel[0]; vy += p.vel[1]; vz += p.vel[2]; }
      const life = rand(p.life);
      const birth = time - (age0 ? Math.random() * life * age0 : 0);
      const s0 = rand(p.s0) * scale, s1 = rand(p.s1) * scale;
      pool.emit(px, py, pz, birth, vx, vy, vz, life, s0, s1, rand(p.spin) * (Math.random() < 0.5 ? -1 : 1), Math.random(), _c0, p.a0, _c1, p.frameCode, p.gravity, p.drag, p.wind, p.flagCode);
    }
  }

  _makeLights(q) {
    const want = TUNING.lights[q] ?? 2;
    while (this.lights.length > want) { const l = this.lights.pop(); l.removeFromParent(); l.dispose?.(); }
    while (this.lights.length < want) {
      const l = new THREE.PointLight(0xffffff, 0, 8, 2); // always in the scene, so the light count (and shaders) never change mid-game
      l.layers.enable(VFX_LAYER); // lights must also exist in PostFX's soft-effects pass, or that pass would build different shaders
      l.userData = { t: 1, seconds: 1, peak: 0 };
      this.group.add(l); this.lights.push(l);
    }
  }

  _warnOnce(name) { if (!this._warned.has(name)) { this._warned.add(name); console.warn(`[vfx] unknown effect "${name}"`); } }

  update(dt, rawDt) {
    const g = this.game, sky = g.get('sky'), w = g.get('weather');
    this.time += dt;
    SHARED.uTime.value = this.time;
    if (w) SHARED.uWind.value.copy(w.wind);
    // ambient light for lit effects: hemisphere + a share of the key light
    const L = SHARED.uLight.value;
    if (sky?.hemiLight) {
      L.copy(sky.hemiLight.color).multiplyScalar(sky.hemiLight.intensity * 0.9);
      if (sky.sunLight) L.r += sky.sunLight.color.r * sky.sunLight.intensity * 0.25, L.g += sky.sunLight.color.g * sky.sunLight.intensity * 0.25, L.b += sky.sunLight.color.b * sky.sunLight.intensity * 0.25;
    } else L.setRGB(1.2, 1.15, 1.05);
    const fog = g.scene.fog;
    if (fog) { SHARED.uFogColor.value.copy(fog.color); SHARED.uFogDensity.value = fog.density ?? 0; }
    // emitters and custom effects
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      if (!e.update(dt)) { this.emitters.splice(i, 1); this._freeEmitters.push(e); }
    }
    for (let i = this.customs.length - 1; i >= 0; i--) {
      let alive = false;
      try { alive = this.customs[i].update(dt, this.time) !== false; } catch (err) { console.error('[vfx] effect update failed', err); }
      if (!alive) this.customs.splice(i, 1);
    }
    // light flashes
    for (const l of this.lights) {
      const u = l.userData;
      if (u.t < u.seconds) { u.t += dt; const x = Math.max(0, 1 - u.t / u.seconds); l.intensity = u.peak * x * x; }
      else if (l.intensity !== 0) l.intensity = 0;
    }
    this.trails.update(this.time, g.camera.position);
    this.pools.alpha.flush(); this.pools.additive.flush(); this.decals.flush();
    this.stats.emitters = this.emitters.length; this.stats.customs = this.customs.length;
  }

  /** Live particle count (O(capacity); for test pages and the debug readout). */
  countParticles() { return this.pools.alpha.countAlive(this.time) + this.pools.additive.countAlive(this.time); }
  /** True when soft effects exist this frame (PostFX skips its second pass otherwise). */
  get hasSoft() { return this.layer === VFX_LAYER; }

  dispose() {
    for (const p of Object.values(this.pools)) p.dispose();
    this.decals.dispose(); this.trails.dispose(); this.atlas.dispose();
    for (const h of this.customs) h.stop?.();
    for (const d of this.defs.values()) d.dispose?.();
    for (const l of this.lights) l.removeFromParent();
    this.group.removeFromParent();
  }
}

export { NULL_HANDLE, FRAMES };
