import * as THREE from 'three';
import { caseGeometry } from './WeaponModels.js';

/**
 * Gunplay effects (GAME_BIBLE §7 "Gunplay", §11 VFX library), defined in the shared VFX system so they share pooling,
 * quality tiers and warmup: muzzle_flash_{pistol|rifle|shotgun} (with a light pulse), gun_smoke, shell_eject (real
 * brass cases that bounce), tracer, impact_{dirt|wood|metal|stone|water|glass|flesh} (flesh is a small dark-red
 * mist, never gore), bullet_hole decals and glass_shatter for bottles. focus_mark and kill_cam live in Focus.js.
 */
export const TUNING = {
  tracerSpeed: 340, tracerMin: 14, // metres: shots shorter than this skip the tracer
  shells: 24, shellLife: 6, shellBounce: 0.35, shellGravity: 9.8,
  smoke: { pistol: 1, rifle: 1.3, shotgun: 1.8, bow: 0 },
};

/** Footstep/raycast surfaces → impact effect names. */
export const SURFACE_IMPACT = {
  dirt: 'dirt', grass: 'dirt', sand: 'dirt', mud: 'dirt', snow: 'dirt', gravel: 'stone', rock: 'stone', stone: 'stone',
  wood: 'wood', plank: 'wood', metal: 'metal', iron: 'metal', water: 'water', glass: 'glass', flesh: 'flesh', leaves: 'wood', canvas: 'dirt',
};

export function registerCombatEffects(vfx) {
  // ---------- muzzle flashes: a hot core, a short star of sparks along the barrel, and a light pulse
  // (the light pulse is placed a little ahead of the muzzle by the shooter: a light right at the barrel burns out the sleeve)
  const flash = (size, sparks, light, color = 0xffc070) => ({
    flashLight: { color: 0xffa850, intensity: light, radius: 5 + light, seconds: 0.07 },
    parts: [
      { pool: 'additive', count: 1, frame: 'glow', life: [0.06, 0.08], size: [[size, size * 1.2], [size * 0.4, size * 0.5]], color: [0xfff2c8, color], alpha: [1, 0], tierScale: false },
      { pool: 'additive', count: 2, frame: 'spark', life: [0.04, 0.07], speed: [6, 12], spread: 0.12, stretch: true, size: [[size * 0.35, size * 0.5], [size * 0.1, size * 0.15]], color: [0xffe0a0, color], alpha: [0.9, 0], tierScale: false },
      { pool: 'additive', count: sparks, frame: 'dot', life: [0.08, 0.2], speed: [4, 14], spread: 0.35, stretch: true, gravity: 2, size: 0.012, color: 0xffc070, alpha: [1, 0] },
    ],
  });
  vfx.define('muzzle_flash_pistol', flash(0.28, 3, 0.9));
  vfx.define('muzzle_flash_rifle', flash(0.36, 4, 1.2));
  vfx.define('muzzle_flash_shotgun', flash(0.55, 9, 1.6, 0xffb060));
  // ---------- gun smoke: lingers and drifts with the wind (High gets more, softer puffs)
  vfx.define('gun_smoke', {
    parts: [
      { pool: 'alpha', count: 4, frame: 'smokeB', frames: 2, life: [1.8, 3.4], speed: [0.4, 1.4], spread: 0.35, vel: [0, 0.18, 0], size: [[0.08, 0.14], [0.5, 0.9]], spin: [-0.4, 0.4], color: 0xd8d4cc, alpha: [0.32, 0], fadeIn: 0.05, drag: 1.6, wind: 0.5, lit: true },
      { pool: 'alpha', count: 2, frame: 'wisp', life: [2.5, 4.5], speed: [0.1, 0.4], spread: 1.2, vel: [0, 0.12, 0], size: [[0.2, 0.3], [0.9, 1.4]], spin: [-0.2, 0.2], color: 0xcfcac2, alpha: [0.16, 0], fadeIn: 0.2, drag: 1, wind: 0.8, lit: true },
    ],
  });
  // ---------- tracers: one stretched glowing streak flying along the shot
  const tracerPart = vfx._compilePart({ pool: 'additive', count: 1, frame: 'glow', life: 0.1, speed: TUNING.tracerSpeed, stretch: true, size: 0.05, color: 0xffd9a0, alpha: [0.85, 0.5], tierScale: false });
  vfx.define('tracer', {
    /** opts.position = muzzle, opts.direction = shot direction, opts.distance = metres to the hit */
    create(v, opts, pos, dir) {
      const d = opts.distance ?? 60;
      if (d < TUNING.tracerMin) return null;
      tracerPart.life = Math.max(0.03, (d - 2) / TUNING.tracerSpeed);
      v._emitPart(tracerPart, opts, pos, dir, 1, 0);
      return null;
    },
  });
  // ---------- impacts by surface
  vfx.define('impact_dirt', {
    parts: [
      { pool: 'alpha', count: 3, frame: 'smokeA', frames: 3, life: [0.6, 1.2], speed: [0.6, 1.8], spread: 0.6, size: [[0.06, 0.1], [0.35, 0.55]], color: 0x9c8466, alpha: [0.55, 0], drag: 2, wind: 0.4, lit: true },
      { pool: 'alpha', count: 6, frame: 'dot', life: [0.35, 0.7], speed: [1.5, 4], spread: 0.7, gravity: 9.8, size: [0.012, 0.022], color: 0x6e5a42, alpha: 0.95, lit: true },
    ],
  });
  vfx.define('impact_wood', {
    parts: [
      { pool: 'alpha', count: 5, frame: 'spark', life: [0.35, 0.7], speed: [2, 5], spread: 0.8, gravity: 9.8, stretch: true, size: [0.025, 0.04], color: 0xb08a5a, alpha: 1, lit: true },
      { pool: 'alpha', count: 2, frame: 'smokeC', life: [0.4, 0.8], speed: [0.3, 1], spread: 0.6, size: [[0.04, 0.06], [0.2, 0.3]], color: 0xb39a78, alpha: [0.4, 0], drag: 2, lit: true },
    ],
  });
  vfx.define('impact_metal', {
    light: { color: 0xffd0a0, intensity: 0.8, radius: 3, seconds: 0.05 },
    parts: [
      { pool: 'additive', count: 8, frame: 'spark', life: [0.15, 0.4], speed: [3, 9], spread: 0.9, gravity: 9.8, stretch: true, size: [0.02, 0.035], color: [0xfff0c0, 0xff8a30], alpha: [1, 0], tierScale: false },
      { pool: 'additive', count: 1, frame: 'glow', life: 0.06, size: [[0.12, 0.16], [0.05, 0.06]], color: 0xffe8c0, alpha: [1, 0], tierScale: false },
    ],
  });
  vfx.define('impact_stone', {
    parts: [
      { pool: 'alpha', count: 6, frame: 'dot', life: [0.3, 0.6], speed: [2, 5], spread: 0.8, gravity: 9.8, size: [0.015, 0.03], color: 0x8a8580, alpha: 1, lit: true },
      { pool: 'alpha', count: 2, frame: 'smokeA', life: [0.5, 1], speed: [0.4, 1.2], spread: 0.6, size: [[0.05, 0.08], [0.3, 0.45]], color: 0xb0aaa2, alpha: [0.45, 0], drag: 2, lit: true },
      { pool: 'additive', count: 2, frame: 'spark', life: [0.08, 0.16], speed: [3, 6], spread: 0.7, stretch: true, size: 0.015, color: 0xffd8a0, alpha: [0.8, 0], tierScale: false },
    ],
  });
  vfx.define('impact_water', {
    parts: [
      { pool: 'alpha', count: 1, frame: 'crown', life: [0.25, 0.35], size: [[0.12, 0.16], [0.4, 0.55]], color: 0xdfe8ee, alpha: 0.75, lit: true, offset: [0, 0.04, 0], tierScale: false },
      { pool: 'alpha', count: 7, frame: 'dot', life: [0.35, 0.7], speed: [2, 4.5], spread: 0.35, gravity: 9.8, size: [0.018, 0.03], color: 0xe6eef2, alpha: 0.85, lit: true },
      { pool: 'alpha', count: 1, frame: 'ring', flat: true, life: [0.7, 1.1], size: [[0.1, 0.15], [0.7, 1]], color: 0xe2eaf0, alpha: 0.4, lit: true, offset: [0, 0.02, 0] },
    ],
  });
  vfx.define('impact_glass', {
    parts: [
      { pool: 'alpha', count: 10, frame: 'glint', life: [0.4, 0.8], speed: [1.5, 4.5], spread: 1.1, gravity: 9.8, spin: [-12, 12], size: [0.018, 0.035], color: 0xd8f0e0, alpha: 0.95, lit: true },
      { pool: 'additive', count: 3, frame: 'glint', life: [0.1, 0.25], speed: [1, 3], spread: 1.2, size: 0.05, color: 0xffffff, alpha: [0.8, 0], tierScale: false },
    ],
  });
  // a bottle bursting: coloured shards, a sparkle and a little splash of whatever was in it
  vfx.define('glass_shatter', {
    parts: [
      { pool: 'alpha', count: 16, frame: 'glint', life: [0.5, 1.1], speed: [1.5, 5], spread: 1.4, gravity: 9.8, spin: [-14, 14], size: [0.02, 0.045], color: 0x6a9a6a, alpha: 0.95, lit: true },
      { pool: 'alpha', count: 6, frame: 'dot', life: [0.3, 0.6], speed: [1, 3], spread: 1.2, gravity: 9.8, size: 0.02, color: 0xc8b890, alpha: 0.6, lit: true },
      { pool: 'additive', count: 4, frame: 'glint', life: [0.08, 0.2], speed: [0.5, 2], spread: 1.5, size: 0.08, color: 0xffffff, alpha: [0.9, 0], tierScale: false },
    ],
  });
  // living targets: a small dark-red mist, never gore (GAME_BIBLE §7)
  vfx.define('impact_flesh', {
    parts: [
      { pool: 'alpha', count: 3, frame: 'smokeC', life: [0.25, 0.5], speed: [0.4, 1.4], spread: 0.6, size: [[0.04, 0.07], [0.16, 0.26]], color: 0x5a1212, alpha: [0.55, 0], drag: 3, lit: true },
      { pool: 'alpha', count: 3, frame: 'dot', life: [0.2, 0.4], speed: [0.8, 2], spread: 0.6, gravity: 6, size: 0.012, color: 0x4a1010, alpha: 0.8, lit: true },
    ],
  });
  // fists: a puff of dust shaken out of the clothes, no blood
  vfx.define('impact_punch', {
    parts: [{ pool: 'alpha', count: 3, frame: 'smokeC', life: [0.25, 0.45], speed: [0.4, 1.1], spread: 0.8, size: [[0.05, 0.08], [0.18, 0.26]], color: 0xb8a888, alpha: [0.35, 0], drag: 3, lit: true }],
  });
  vfx.define('bullet_hole', { decal: { frame: 'bulletHole', size: [0.06, 0.085], life: 45, fade: 6, alpha: 0.95, color: 0x1a140e } });
  vfx.define('scorch_small', { decal: { frame: 'scorch', size: [0.14, 0.2], life: 30, fade: 6, alpha: 0.5, color: 0x1a140e } });
  defineShells(vfx);
}

/** Spent cases: a small pool of instanced brass meshes with simple bounce physics against the terrain. */
function defineShells(vfx) {
  let pool = null;
  const ensure = (v) => {
    if (pool) return pool;
    const mat = new THREE.MeshStandardMaterial({ color: 0xc4954a, metalness: 1, roughness: 0.32 });
    const mesh = new THREE.InstancedMesh(caseGeometry(), mat, TUNING.shells);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.castShadow = false; mesh.name = 'Shell cases';
    mesh.count = 0; v.group.add(mesh);
    const items = Array.from({ length: TUNING.shells }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), t: 1e9, rest: false }));
    pool = { mesh, mat, items, next: 0, live: 0, handle: null };
    return pool;
  };
  const _m = new THREE.Matrix4(), _dq = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
  vfx.define('shell_eject', {
    warmup(v) { ensure(v); },
    /** opts.position = ejection port, opts.direction = sideways-up throw, opts.velocity (optional) = gun velocity */
    create(v, opts, pos, dir) {
      const P = ensure(v), it = P.items[P.next];
      P.next = (P.next + 1) % P.items.length;
      it.p.copy(pos); it.v.copy(dir).multiplyScalar(2.2 + Math.random() * 1.2); it.v.y += 1.2 + Math.random();
      if (opts.velocity) it.v.add(opts.velocity);
      it.q.setFromEuler(_e.set(Math.random() * 6, Math.random() * 6, 0)); it.w.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
      it.t = 0; it.rest = false;
      if (P.handle) return null; // one updater drives every case
      const terrain = v.game.sys('terrain');
      P.handle = {
        update(dt) {
          let alive = 0, n = 0;
          for (const s of P.items) {
            if (s.t > TUNING.shellLife) continue;
            s.t += dt; alive++;
            if (!s.rest) {
              s.v.y -= TUNING.shellGravity * dt; s.p.addScaledVector(s.v, dt);
              _dq.setFromEuler(_e.set(s.w.x * dt, s.w.y * dt, s.w.z * dt)); s.q.multiply(_dq);
              const gy = terrain.getHeightAt(s.p.x, s.p.z) + 0.005;
              if (s.p.y < gy) {
                s.p.y = gy;
                if (Math.abs(s.v.y) < 1) { s.rest = true; s.q.setFromEuler(_e.set(0, Math.random() * 6, Math.PI / 2)); }
                else { s.v.y = -s.v.y * TUNING.shellBounce; s.v.x *= 0.5; s.v.z *= 0.5; s.w.multiplyScalar(0.5); }
              }
            }
            _m.compose(s.p, s.q, _s); P.mesh.setMatrixAt(n++, _m);
          }
          P.mesh.count = n; P.mesh.instanceMatrix.needsUpdate = true;
          if (!alive) { P.handle = null; return false; }
          return true;
        },
        stop() {}, setPosition() {},
      };
      return P.handle;
    },
    dispose() { if (pool) { pool.mesh.geometry.dispose(); pool.mat.dispose(); pool.mesh.removeFromParent(); pool = null; } },
  });
}
