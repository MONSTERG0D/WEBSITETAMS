import * as THREE from 'three';
import { uvRect } from './Textures.js';

/**
 * Nature effects that Vegetation registers in the shared VFX library (GAME_BIBLE §7 "Nature"):
 * falling_leaves, pollen, tumbleweed, dust_devil. Plus the AmbientDirector that decides when they appear.
 */
export const TUNING = { tumbleweedEvery: [18, 45], dustDevilEvery: [40, 100], leavesRange: 28, enabled: true };

export function registerNatureEffects(vfx, atlas) {
  vfx.define('falling_leaves', {
    minTier: 'medium',
    parts: [{ pool: 'alpha', rate: 4, duration: Infinity, shape: 'box', box: [18, 4, 18], offset: [0, 7, 0], frame: 'leaf', life: [7, 11],
      speed: [0.05, 0.3], spread: Math.PI, gravity: 0.55, drag: 1.4, wind: 0.5, spin: [1.2, 3.2], size: 0.09, color: [0xd9a43a, 0xb87a28], alpha: 0.95, fadeIn: 0.1, lit: true }],
  });
  vfx.define('pollen', {
    minTier: 'medium',
    parts: [{ pool: 'additive', rate: 6, prewarm: true, duration: Infinity, shape: 'sphere', radius: 9, offset: [0, 1.5, 0], frame: 'mote', life: [6, 10],
      speed: [0.02, 0.1], spread: Math.PI, wind: 0.15, drag: 0.8, size: 0.022, color: 0xfff1c8, alpha: 0.7, fadeIn: 0.3 }],
  });

  // A tumbleweed: a ball of twig cards that rolls and bounces downwind over the terrain, then fades.
  const twigGeo = (() => {
    const p = [], n = [], uv = [], idx = [], [u0, v0, u1, v1] = uvRect('twigs');
    let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let k = 0; k < 14; k++) {
      const yaw = r() * Math.PI, pitch = (r() - 0.5) * Math.PI, base = p.length / 3;
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), up = new THREE.Vector3(0, 1, 0).applyAxisAngle(right, pitch);
      for (const [a, b, u, v] of [[-1, -1, u0, v0], [1, -1, u1, v0], [1, 1, u1, v1], [-1, 1, u0, v1]]) {
        const q = right.clone().multiplyScalar(a * 0.45).addScaledVector(up, b * 0.45);
        p.push(q.x, q.y, q.z); const nn = q.clone().normalize(); n.push(nn.x, nn.y, nn.z); uv.push(u, v);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  })();
  const twigMat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1, color: 0xc8a878, transparent: false });
  let warm = null;
  vfx.define('tumbleweed', {
    warmup(v) { if (!warm) { warm = new THREE.Mesh(twigGeo, twigMat); warm.visible = false; v.group.add(warm); } },
    /** opts.position start point; rolls with weather.wind for 25–40 s. */
    create(v, opts, pos) {
      const mesh = new THREE.Mesh(twigGeo, twigMat); mesh.castShadow = true; mesh.name = 'Tumbleweed';
      mesh.scale.setScalar(0.7 + Math.random() * 0.6); v.group.add(mesh);
      const p = pos.clone(), vel = new THREE.Vector3(), terrain = v.game.sys('terrain'), axis = new THREE.Vector3();
      let t = 0, vy = 0, done = false; const life = 25 + Math.random() * 15, r = 0.45 * mesh.scale.x;
      const end = () => { if (!done) { done = true; mesh.removeFromParent(); } };
      return {
        get active() { return !done; }, stop: end, setPosition(q) { if (q) p.copy(q); },
        update(dt) {
          if (done) return false;
          t += dt;
          const w = v.game.get('weather')?.wind || new THREE.Vector3(3, 0, 1);
          vel.x += (w.x * 0.8 - vel.x) * dt * 1.5; vel.z += (w.z * 0.8 - vel.z) * dt * 1.5;
          p.x += vel.x * dt; p.z += vel.z * dt;
          const ground = terrain.getHeightAt(p.x, p.z) + r;
          vy -= 18 * dt; p.y += vy * dt;
          if (p.y < ground) { p.y = ground; vy = Math.random() < 0.08 ? 2 + Math.random() * 3 : Math.abs(vy) * 0.25; }
          mesh.position.copy(p);
          const sp = Math.hypot(vel.x, vel.z);
          if (sp > 0.01) { axis.set(vel.z, 0, -vel.x).normalize(); mesh.rotateOnWorldAxis(axis, (sp * dt) / r); }
          const fade = Math.min(1, t / 1.5, (life - t) / 2);
          mesh.scale.setScalar(Math.max(0.01, fade) * (0.7 + (mesh.userData.s ??= Math.random() * 0.6)));
          if (t > life) { end(); return false; }
          return true;
        },
      };
    },
    dispose() { twigGeo.dispose(); twigMat.dispose(); },
  });

  // A dust devil: a rising, widening column of dust that wanders with the wind.
  vfx.define('dust_devil_dust', {
    parts: [{ pool: 'alpha', rate: 26, duration: Infinity, shape: 'disc', radius: 1.2, frame: 'smokeA', frames: 3, life: [2.5, 4],
      speed: [2.5, 4.5], spread: 0.35, vel: [0, 0, 0], drag: 0.3, wind: 0.3, gravity: -0.4, size: [0.8, 4.5], spin: [1.5, 3.5], color: 0xc9a273, alpha: 0.32, fadeIn: 0.15, lit: true }],
  });
  vfx.define('dust_devil', {
    minTier: 'medium',
    create(v, opts, pos) {
      const p = pos.clone(), dust = v.spawn('dust_devil_dust', { position: p }), terrain = v.game.sys('terrain');
      let t = 0, done = false; const life = 12 + Math.random() * 10, wander = Math.random() * 6;
      return {
        get active() { return !done; }, stop() { dust.stop(); done = true; }, setPosition(q) { if (q) p.copy(q); },
        update(dt) {
          if (done) return false;
          t += dt;
          const w = v.game.get('weather')?.wind || new THREE.Vector3(3, 0, 1);
          p.x += (w.x * 0.5 + Math.sin(t * 0.7 + wander) * 1.5) * dt; p.z += (w.z * 0.5 + Math.cos(t * 0.6 + wander) * 1.5) * dt;
          p.y = terrain.getHeightAt(p.x, p.z);
          dust.setPosition(p);
          if (t > life) { dust.stop(); done = true; return false; }
          return true;
        },
      };
    },
  });
}

/** Decides when ambient nature effects appear around the player. */
export class AmbientDirector {
  constructor(game) { this.game = game; this.tw = 10; this.dd = 30; this.pollen = null; this.leaves = null; }

  /** @param {number} dt @param {THREE.Vector3} p player @param {number} nearestAspen metres to the nearest aspen */
  update(dt, p, nearestAspen) {
    const g = this.game, vfx = g.sys('vfx');
    if (vfx.isFallback || !TUNING.enabled) return;
    const terrain = g.sys('terrain'), sky = g.get('sky'), w = g.get('weather');
    const biome = terrain.getBiomeAt(p.x, p.z), day = sky ? sky.daylight : 1, clearish = !w || (w.rain < 0.05 && w.snow < 0.05);
    const wind = w ? w.wind.length() : 2.5;
    // Saltmesa: tumbleweeds upwind, dust devils on hot afternoons
    if (biome === 'desert' && clearish) {
      this.tw -= dt; this.dd -= dt;
      if (this.tw <= 0 && wind > 2) {
        this.tw = rand(TUNING.tumbleweedEvery);
        const wd = w ? w.wind.clone().setY(0).normalize() : new THREE.Vector3(1, 0, 0), side = (Math.random() - 0.5) * 50;
        const s = p.clone().addScaledVector(wd, -35 - Math.random() * 20).add(new THREE.Vector3(-wd.z * side, 0, wd.x * side));
        s.y = terrain.getHeightAt(s.x, s.z) + 0.6;
        vfx.spawn('tumbleweed', { position: s });
      }
      if (this.dd <= 0 && day > 0.6) {
        this.dd = rand(TUNING.dustDevilEvery);
        const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 80, s = new THREE.Vector3(p.x + Math.cos(a) * d, 0, p.z + Math.sin(a) * d);
        s.y = terrain.getHeightAt(s.x, s.z);
        vfx.spawn('dust_devil', { position: s });
      }
    }
    // pollen in sunny valley air
    const pollenWant = (biome === 'valley' || biome === 'riverbank') && clearish && day > 0.7 && wind < 8;
    if (pollenWant && !this.pollen) this.pollen = vfx.spawn('pollen', { position: p });
    if (this.pollen) { if (!pollenWant) { this.pollen.stop(); this.pollen = null; } else this.pollen.setPosition(p); }
    // aspen leaves drifting down near aspen stands
    const leavesWant = nearestAspen < TUNING.leavesRange;
    if (leavesWant && !this.leaves) this.leaves = vfx.spawn('falling_leaves', { position: p });
    if (this.leaves) { if (!leavesWant) { this.leaves.stop(); this.leaves = null; } else this.leaves.setPosition(p); }
  }
}
const rand = ([a, b]) => a + Math.random() * (b - a);
