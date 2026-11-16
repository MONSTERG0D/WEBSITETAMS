import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { damp, smoothstep } from '../core/utils/math.js';
import { QUAD_VERT, DOWNSAMPLE_FRAG, BRIGHT_FRAG, BLUR_FRAG, RAYS_FRAG, SSAO_FRAG, COMPOSITE_FRAG, DEPTH_PROBE_FRAG, LINEAR_DEPTH_FRAG } from './postfx/Shaders.js';
import { SHARED as VFX_SHARED, VFX_LAYER } from './vfx/Shared.js';

/**
 * PostFX (Part 2): renders the frame (GAME_BIBLE §7 "Camera" row, §11 postfx API).
 * Scene → HDR target → quarter-resolution bloom (+ eighth), god rays, light SSAO (High), DOF (High, cutscenes and
 * photo mode) → one merged composite: motion blur, exposure, ACES, grade by time and weather, Focus look,
 * vignette, grain, flash. Targets follow the drawing-buffer size, so the dynamic render scale is respected.
 */
export const TUNING = {
  exposure: 1.0, bloomStrength: 0.55, bloomThreshold: 1.25, bloomKnee: 0.6,
  raysStrength: 0.55, raysDensity: 0.85, raysDecay: 0.965,
  motionBlur: 0.5, aoStrength: 0.55, aoRadius: 1.4,
  warmth: 0.0, saturation: 1.0, contrast: 1.0, lift: 0.0, gamma: 1.0, gain: 1.0,
  grain: 0.035, vignette: 0.32, heatHaze: 1.0, dither: 1 / 255, gradeBlend: 1.2, focusBlend: 0.3,
};

/** Grade presets for setGrade(name). 'auto' follows the sky (time of day) and weather only. */
export const GRADES = {
  auto: { warmth: 0, saturation: 1, contrast: 1, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], sepia: 0, exposure: 1 },
  warm: { warmth: 0.25, saturation: 1.06, contrast: 1.03, lift: [0.01, 0.005, 0], gamma: [1, 1, 0.98], gain: [1.04, 1, 0.94], sepia: 0, exposure: 1.02 },
  cold: { warmth: -0.32, saturation: 0.88, contrast: 1.04, lift: [0, 0.005, 0.015], gamma: [1, 1, 1.02], gain: [0.95, 1, 1.06], sepia: 0, exposure: 0.98 },
  noir: { warmth: 0, saturation: 0, contrast: 1.28, lift: [0, 0, 0], gamma: [0.95, 0.95, 0.95], gain: [1.02, 1.02, 1.02], sepia: 0, exposure: 1 },
  sepia: { warmth: 0.1, saturation: 0.25, contrast: 1.06, lift: [0.02, 0.012, 0], gamma: [1, 1, 1], gain: [1, 0.98, 0.92], sepia: 0.8, exposure: 1 },
  // Added in Part 16 (photo mode): a cold silver tintype, crushed blacks and a faint blue-grey cast
  tintype: { warmth: -0.08, saturation: 0, contrast: 1.34, lift: [0.025, 0.028, 0.034], gamma: [0.92, 0.94, 0.97], gain: [0.94, 0.97, 1.02], sepia: 0.08, exposure: 0.98 },
};

/** What each quality preset turns on. */
const TIERS = {
  low: { msaa: 0, depth: false, eighth: false, rays: 0, raysScale: 0, ao: false, motion: 0, dof: false, soft: false },
  medium: { msaa: 0, depth: true, eighth: true, rays: 12, raysScale: 8, ao: false, motion: 4, dof: false, soft: false },
  high: { msaa: 4, depth: true, eighth: true, rays: 32, raysScale: 4, ao: true, motion: 8, dof: true, soft: true },
};

const _size = new THREE.Vector2(), _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _fwd = new THREE.Vector3();

export default class PostFX extends System {
  constructor(game) {
    super(game);
    this.focus = 0; this._focusTarget = 0; this.gradeName = 'auto';
    this.grade = structuredClone(GRADES.auto); this._gradeTarget = GRADES.auto;
    this._flash = { color: new THREE.Color(), amount: 0, peak: 0, t: 0, seconds: 0 };
    this.dof = { enabled: false, distance: 10, range: 6, amount: 1 };
    this._w = 0; this._h = 0; this._tier = null; this.targets = {}; this.enabled = true;
    this._zoom = { amount: 0, peak: 0, t: 0, seconds: 1 }; this.heat = 0;
    this._prevVP = new THREE.Matrix4(); this._prevCam = new THREE.Vector3(); this._hasPrev = false;
  }

  async init() {
    const g = this.game, r = g.renderer;
    this.halfFloat = !!(r.capabilities.isWebGL2 && (r.extensions.has('EXT_color_buffer_float') || r.extensions.has('EXT_color_buffer_half_float')));
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad);
    const mat = (frag, uniforms, defines = {}) => new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false, toneMapped: false });
    this.mats = {
      down: mat(DOWNSAMPLE_FRAG, { tInput: { value: null }, uTexel: { value: new THREE.Vector2() } }),
      bright: mat(BRIGHT_FRAG, { tInput: { value: null }, uThreshold: { value: 1 }, uKnee: { value: 0.5 }, uExposure: { value: 1 } }),
      blur: mat(BLUR_FRAG, { tInput: { value: null }, uDir: { value: new THREE.Vector2() } }),
      linear: mat(LINEAR_DEPTH_FRAG, { tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 1000 } }),
      ssao: mat(SSAO_FRAG, {
        tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uNear: { value: 0.1 }, uFar: { value: 1000 },
        uRadius: { value: 1 }, uTexel: { value: new THREE.Vector2() }, uTime: { value: 0 },
      }),
    };
    this.mats.ssao.extensions = { derivatives: true };
    this._probeMsaaDepth();
    this._setTier(g.quality.name);
    g.events.on(EVENTS.QUALITY_CHANGED, ({ preset }) => this._setTier(preset));
    // compile every pass now so nothing compiles mid-game
    for (const m of [...Object.values(this.mats), this.composite, this.raysMat]) if (m) { this.quad.material = m; r.compile(this.quadScene, this.quadCam); }
    g.debug?.addTuning('PostFX', TUNING, { exposure: { min: 0.2, max: 3, step: 0.01 }, bloomThreshold: { min: 0, max: 6, step: 0.05 }, gamma: { min: 0.5, max: 1.8, step: 0.01 }, gain: { min: 0.5, max: 1.6, step: 0.01 }, lift: { min: -0.1, max: 0.1, step: 0.002 }, warmth: { min: -1, max: 1, step: 0.01 } });
  }

  // ---------------------------------------------------------------- API (GAME_BIBLE §11)
  /** Focus look on/off (eases over TUNING.focusBlend s). */
  setFocus(on) { this._focusTarget = on ? 1 : 0; }
  /** Full-screen flash that fades over `seconds`. @param {THREE.ColorRepresentation} color @param {number} [strength] 0..1 */
  flash(color = 0xffffff, seconds = 0.2, strength = 0.6) {
    const f = this._flash;
    f.color.set(color); f.seconds = Math.max(0.02, seconds); f.t = 0; f.peak = Math.max(f.amount, strength); f.amount = f.peak;
  }
  /** 'auto' | 'warm' | 'cold' | 'noir' | 'sepia' (| 'tintype', Part 16) — blends over TUNING.gradeBlend s. */
  setGrade(name) {
    if (!GRADES[name]) { console.warn(`[postfx] unknown grade "${name}"`); return; }
    this.gradeName = name; this._gradeTarget = GRADES[name];
  }
  /** Depth of field for cutscenes and photo mode (High only). Added in Part 2. */
  /** Extra radial (zoom) blur that fades over `seconds` — vfx.screen({ blur }). Medium and High. Added in Part 2B. */
  blur(amount = 0.3, seconds = 0.3) { this._zoom.peak = Math.max(this._zoom.amount, amount); this._zoom.amount = this._zoom.peak; this._zoom.t = 0; this._zoom.seconds = Math.max(0.02, seconds); }
  /** Heat shimmer over distant ground, 0..1 (the heat_haze effect drives it). Medium and High. Added in Part 2B. */
  setHeatHaze(v) { this.heat = Math.max(0, Math.min(1, v || 0)); }
  /**
   * Compile every material in `scene` exactly as the frame will draw it: into the HDR target (no tone mapping,
   * linear output) with the soft-effects layer visible. VFX.warmup calls this during loading. Added in Part 2B.
   */
  compileScene(scene, camera) {
    const r = this.game.renderer, prev = r.getRenderTarget();
    r.getDrawingBufferSize(_size); this._ensureTargets(_size.x, _size.y);
    camera.layers.enable(VFX_LAYER);
    r.setRenderTarget(this.targets.scene);
    try {
      r.compile(scene, camera);
      r.render(scene, camera); // one real frame also builds the shadow-map (depth) shaders
      // the passes draw into linear targets (the composite draws to the screen): compile them that way
      r.setRenderTarget(this.targets.qA);
      for (const m of [...Object.values(this.mats), this.raysMat]) if (m) { this.quad.material = m; r.compile(this.quadScene, this.quadCam); }
    } finally { r.setRenderTarget(prev); }
  }
  setDOF({ enabled = true, distance = this.dof.distance, range = this.dof.range, amount = this.dof.amount } = {}) {
    Object.assign(this.dof, { enabled, distance, range, amount });
  }

  // ---------------------------------------------------------------- setup
  _setTier(name) {
    const tier = { ...(TIERS[name] || TIERS.medium) };
    if (!this.msaaDepthOK && tier.msaa > 0) tier.msaa = 0;
    this._tier = tier; this._w = 0; // rebuild targets on the next frame
    const defs = {};
    if (tier.depth) defs.USE_DEPTH = '';
    if (tier.ao) defs.USE_AO = '';
    if (tier.dof) defs.USE_DOF = '';
    if (tier.rays > 0) defs.USE_RAYS = '';
    defs.MOTION_SAMPLES = tier.depth ? tier.motion : 0;
    this.composite?.dispose(); this.raysMat?.dispose();
    const u = (v) => ({ value: v });
    this.composite = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: COMPOSITE_FRAG, defines: defs, depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: {
        tScene: u(null), tDepth: u(null), tBloomA: u(null), tBloomB: u(null), tRays: u(null), tAO: u(null), tDof: u(null),
        uResolution: u(new THREE.Vector2(1, 1)), uTime: u(0), uExposure: u(1), uBloom: u(0.5), uRays: u(0), uRayColor: u(new THREE.Color(1, 0.9, 0.7)),
        uInvViewProj: u(new THREE.Matrix4()), uPrevViewProj: u(new THREE.Matrix4()), uMotion: u(0), uAOStrength: u(0),
        uNear: u(0.1), uFar: u(1000), uDof: u(new THREE.Vector3()),
        uWarmth: u(0), uSaturation: u(1), uContrast: u(1), uLift: u(new THREE.Vector3()), uGamma: u(new THREE.Vector3(1, 1, 1)), uGain: u(new THREE.Vector3(1, 1, 1)), uSepia: u(0),
        uFocus: u(0), uVignette: u(0.3), uGrain: u(0.03), uFlash: u(new THREE.Vector4()), uDither: u(1 / 255), uHeat: u(0), uRadial: u(0),
      },
    });
    this.raysMat = tier.rays > 0 ? new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: RAYS_FRAG, defines: { RAY_SAMPLES: tier.rays }, depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: { tColor: u(null), tDepth: u(null), uSun: u(new THREE.Vector2()), uDensity: u(0.85), uDecay: u(0.96), uAspect: u(1) },
    }) : null;
    if (this.quad && this.game.renderer) { // compile the new variants now (quality switches happen in menus)
      for (const m of [this.composite, this.raysMat]) if (m) { this.quad.material = m; this.game.renderer.compile(this.quadScene, this.quadCam); }
    }
  }

  _ensureTargets(w, h) {
    if (w === this._w && h === this._h && this.targets.scene) return;
    this._w = w; this._h = h;
    for (const t of Object.values(this.targets)) t?.dispose();
    const tier = this._tier, type = this.halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const rt = (tw, th, opts = {}) => new THREE.WebGLRenderTarget(Math.max(1, tw), Math.max(1, th), { type, depthBuffer: false, stencilBuffer: false, ...opts });
    const T = {};
    T.scene = rt(w, h, { depthBuffer: true, samples: tier.msaa, depthTexture: tier.depth ? new THREE.DepthTexture(w, h) : null });
    const qw = Math.ceil(w / 4), qh = Math.ceil(h / 4);
    T.q0 = rt(qw, qh); T.qA = rt(qw, qh); T.qB = rt(qw, qh);
    if (tier.eighth) { T.eA = rt(Math.ceil(w / 8), Math.ceil(h / 8)); T.eB = rt(Math.ceil(w / 8), Math.ceil(h / 8)); }
    if (tier.rays > 0) T.rays = rt(Math.ceil(w / tier.raysScale), Math.ceil(h / tier.raysScale));
    if (tier.ao) T.ao = rt(Math.ceil(w / 2), Math.ceil(h / 2), { type: THREE.UnsignedByteType });
    if (tier.dof) T.dof = rt(qw, qh);
    if (tier.soft) T.depthLin = rt(w, h, { type: this.halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType });
    this.targets = T;
    this._black = this._black || new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this._black.needsUpdate = true;
    this._white = this._white || new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this._white.needsUpdate = true;
  }

  /** WebGL2 should resolve MSAA depth into the depth texture; check it once, fall back to no MSAA if not. */
  _probeMsaaDepth() {
    const r = this.game.renderer;
    this.msaaDepthOK = false;
    if (!r.capabilities.isWebGL2) return;
    try {
      const ms = new THREE.WebGLRenderTarget(4, 4, { samples: 4, depthTexture: new THREE.DepthTexture(4, 4) });
      const out = new THREE.WebGLRenderTarget(4, 4);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: 'void main(){ gl_FragColor = vec4(1.0); }' }));
      const s = new THREE.Scene(); s.add(plane);
      const prev = r.getRenderTarget();
      r.setRenderTarget(ms); r.render(s, this.quadCam);
      const probe = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: DEPTH_PROBE_FRAG, uniforms: { tDepth: { value: ms.depthTexture } } });
      this.quad.material = probe; r.setRenderTarget(out); r.render(this.quadScene, this.quadCam);
      const px = new Uint8Array(4); r.readRenderTargetPixels(out, 1, 1, 1, 1, px);
      r.setRenderTarget(prev);
      this.msaaDepthOK = px[0] > 100 && px[0] < 155; // depth 0.5 → ~128
      ms.dispose(); out.dispose(); plane.geometry.dispose(); plane.material.dispose(); probe.dispose();
      if (!this.msaaDepthOK) console.info(`[postfx] MSAA depth resolve unavailable (read ${px[0]}); High renders without MSAA`);
    } catch (err) { console.warn('[postfx] MSAA probe failed', err); }
  }

  _pass(material, target) {
    const r = this.game.renderer;
    this.quad.material = material;
    r.setRenderTarget(target);
    r.render(this.quadScene, this.quadCam);
  }

  // ---------------------------------------------------------------- frame
  update(dt, rawDt) {
    this._ease(rawDt);
  }

  _ease(rawDt) {
    const T = TUNING;
    this.focus = damp(this.focus, this._focusTarget, 3 / T.focusBlend, rawDt);
    const k = 3 / T.gradeBlend, G = this.grade, S = this._gradeTarget;
    for (const key of ['warmth', 'saturation', 'contrast', 'sepia', 'exposure']) G[key] = damp(G[key], S[key], k, rawDt);
    for (const key of ['lift', 'gamma', 'gain']) for (let i = 0; i < 3; i++) G[key][i] = damp(G[key][i], S[key][i], k, rawDt);
    const f = this._flash;
    if (f.amount > 0) { f.t += rawDt; const x = Math.max(0, 1 - f.t / f.seconds); f.amount = f.peak * x * x; }
    const b = this._zoom;
    if (b.amount > 0) { b.t += rawDt; const x = Math.max(0, 1 - b.t / b.seconds); b.amount = b.peak * x * x; }
  }

  /** Renders the frame (called by Game every frame instead of renderer.render). */
  render(game = this.game) {
    const r = game.renderer, scene = game.scene, cam = game.camera;
    if (!this.enabled) { r.setRenderTarget(null); r.render(scene, cam); return; }
    if (game.state !== 'playing' && game.state !== 'cutscene' && game.state !== 'dead') this._ease(1 / 30); // title and pause still animate
    r.getDrawingBufferSize(_size);
    this._ensureTargets(_size.x, _size.y);
    const T = this.targets, tier = this._tier, M = this.mats, P = TUNING;

    // 1. scene → HDR. Soft effects (VFX layer) draw in a second pass on High, after the opaque depth is copied.
    const vfx = game.get('vfx'), soft = tier.soft && T.depthLin && vfx?.hasSoft;
    if (soft) cam.layers.disable(VFX_LAYER); else cam.layers.enable(VFX_LAYER);
    r.setRenderTarget(T.scene);
    r.render(scene, cam);
    VFX_SHARED.uResolution.value.set(_size.x, _size.y);
    VFX_SHARED.uSoft.value = 0;
    if (soft) {
      const LU = M.linear.uniforms; LU.tDepth.value = T.scene.depthTexture; LU.uNear.value = cam.near; LU.uFar.value = cam.far;
      this._pass(M.linear, T.depthLin);
      VFX_SHARED.tDepthLin.value = T.depthLin.texture; VFX_SHARED.uSoft.value = 1;
      const mask = cam.layers.mask, autoClear = r.autoClear, shadows = r.shadowMap.autoUpdate;
      cam.layers.set(VFX_LAYER); r.autoClear = false; r.shadowMap.autoUpdate = false;
      r.setRenderTarget(T.scene);
      r.render(scene, cam);
      cam.layers.mask = mask; cam.layers.enable(VFX_LAYER); r.autoClear = autoClear; r.shadowMap.autoUpdate = shadows;
    }

    // 2. quarter-res copy, bloom chain
    M.down.uniforms.tInput.value = T.scene.texture; M.down.uniforms.uTexel.value.set(1 / _size.x, 1 / _size.y);
    this._pass(M.down, T.q0);
    const look = game.get('sky')?.look, exposure = P.exposure * (look ? look.exposure : 1) * this.grade.exposure;
    M.bright.uniforms.tInput.value = T.q0.texture; M.bright.uniforms.uThreshold.value = P.bloomThreshold; M.bright.uniforms.uKnee.value = P.bloomKnee; M.bright.uniforms.uExposure.value = exposure;
    this._pass(M.bright, T.qA);
    this._blur(T.qA, T.qB);
    if (T.eA) {
      M.down.uniforms.tInput.value = T.qA.texture; M.down.uniforms.uTexel.value.set(0.5 / T.qA.width, 0.5 / T.qA.height);
      this._pass(M.down, T.eA);
      this._blur(T.eA, T.eB);
    }

    // 3. god rays toward the sun's screen position
    const C = this.composite.uniforms;
    let rays = 0;
    if (this.raysMat && T.rays) {
      const sky = game.sys('sky'), sun = sky.getSunDirection();
      cam.getWorldDirection(_fwd);
      const facing = _fwd.dot(sun);
      const w = game.get('weather');
      rays = P.raysStrength * smoothstep(0.1, 0.55, facing) * smoothstep(-0.04, 0.06, sun.y) * (1 - smoothstep(0.35, 0.9, sun.y) * 0.6)
        * (1 - (w ? w.darkness : 0) * 0.9) * (1 - this.focus * 0.5);
      if (rays > 0.002) {
        _v.copy(cam.position).addScaledVector(sun, 1000).project(cam);
        const RU = this.raysMat.uniforms;
        RU.tColor.value = T.q0.texture; RU.tDepth.value = T.scene.depthTexture; RU.uSun.value.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5);
        RU.uDensity.value = P.raysDensity; RU.uDecay.value = P.raysDecay; RU.uAspect.value = _size.x / _size.y;
        this._pass(this.raysMat, T.rays);
        C.uRayColor.value.copy(sky.sunLight ? sky.sunLight.color : C.uRayColor.value);
      }
    }

    // 4. SSAO (High)
    if (tier.ao && T.ao) {
      const S = M.ssao.uniforms;
      S.tDepth.value = T.scene.depthTexture; S.uProj.value.copy(cam.projectionMatrix); S.uInvProj.value.copy(cam.projectionMatrixInverse);
      S.uNear.value = cam.near; S.uFar.value = cam.far; S.uRadius.value = P.aoRadius; S.uTexel.value.set(1 / T.ao.width, 1 / T.ao.height);
      this._pass(M.ssao, T.ao);
    }

    // 5. depth of field blur (High, when enabled)
    const dofOn = tier.dof && this.dof.enabled && T.dof;
    if (dofOn) {
      M.blur.uniforms.tInput.value = T.q0.texture; M.blur.uniforms.uDir.value.set(1.6 / T.q0.width, 0); this._pass(M.blur, T.dof);
      M.blur.uniforms.tInput.value = T.dof.texture; M.blur.uniforms.uDir.value.set(0, 1.6 / T.q0.height); this._pass(M.blur, T.qB);
    }

    // 6. composite → screen
    cam.updateMatrixWorld();
    const vp = _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    if (!this._hasPrev || this._prevCam.distanceToSquared(cam.position) > 25) this._prevVP.copy(vp);
    C.tScene.value = T.scene.texture; C.tDepth.value = T.scene.depthTexture || this._white;
    C.tBloomA.value = T.qA.texture; C.tBloomB.value = T.eA ? T.eA.texture : this._black;
    C.tRays.value = T.rays ? T.rays.texture : this._black; C.uRays.value = rays;
    C.tAO.value = T.ao ? T.ao.texture : this._white; C.uAOStrength.value = tier.ao ? P.aoStrength : 0;
    C.tDof.value = dofOn ? T.qB.texture : this._black; C.uDof.value.set(this.dof.distance, this.dof.range, dofOn ? this.dof.amount : 0);
    C.uResolution.value.set(_size.x, _size.y); C.uTime.value = game.now || 0;
    C.uExposure.value = exposure; C.uBloom.value = P.bloomStrength;
    C.uInvViewProj.value.copy(vp).invert(); C.uPrevViewProj.value.copy(this._prevVP);
    C.uMotion.value = P.motionBlur * (tier.motion >= 8 ? 1 : 0.5) * (game.state === 'paused' ? 0 : 1);
    C.uRadial.value = this._zoom.amount * 0.06; C.uHeat.value = tier.depth ? this.heat * P.heatHaze : 0;
    C.uNear.value = cam.near; C.uFar.value = cam.far;
    const G = this.grade, auto = look || { warmth: 0, saturation: 1, contrast: 1, night: 0 };
    const night = auto.night || 0;
    C.uWarmth.value = auto.warmth + G.warmth + P.warmth;
    C.uSaturation.value = auto.saturation * G.saturation * P.saturation * (1 - this.focus * 0.2);
    C.uContrast.value = auto.contrast * G.contrast * P.contrast;
    C.uLift.value.set(G.lift[0] + P.lift, G.lift[1] + P.lift + night * 0.006, G.lift[2] + P.lift + night * 0.016);
    C.uGamma.value.set(G.gamma[0] * P.gamma, G.gamma[1] * P.gamma, G.gamma[2] * P.gamma);
    C.uGain.value.set(G.gain[0] * P.gain, G.gain[1] * P.gain, G.gain[2] * P.gain);
    C.uSepia.value = G.sepia; C.uFocus.value = this.focus; C.uVignette.value = P.vignette; C.uGrain.value = P.grain;
    const f = this._flash; C.uFlash.value.set(f.color.r, f.color.g, f.color.b, f.amount); C.uDither.value = P.dither;
    this._pass(this.composite, null);
    this._prevVP.copy(vp); this._prevCam.copy(cam.position); this._hasPrev = true;
  }

  _blur(a, b) {
    const B = this.mats.blur.uniforms;
    B.tInput.value = a.texture; B.uDir.value.set(1 / a.width, 0); this._pass(this.mats.blur, b);
    B.tInput.value = b.texture; B.uDir.value.set(0, 1 / a.height); this._pass(this.mats.blur, a);
  }

  dispose() {
    for (const t of Object.values(this.targets)) t?.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
    this.composite?.dispose(); this.raysMat?.dispose(); this.quad.geometry.dispose(); this._black?.dispose(); this._white?.dispose();
  }
}

