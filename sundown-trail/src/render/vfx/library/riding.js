/**
 * Riding effects (GAME_BIBLE §7 "Riding" row): hoof_dust, mud_splash, water_splash, snow_puff, hoofprint and
 * footprint decals, breath_vapor. The horse system spawns them on each footfall (prints and vapour from Medium).
 */
export function registerRidingEffects(vfx) {
  vfx.define('hoof_dust', {
    parts: [
      { pool: 'alpha', count: 3, frame: 'smokeA', frames: 3, life: [0.9, 1.8], speed: [0.3, 1.0], spread: 1.2, vel: [0, 0.3, 0], size: [[0.18, 0.26], [0.8, 1.3]], spin: [-0.6, 0.6],
        color: 0x9c8a6c, alpha: [0.2, 0], fadeIn: 0.15, drag: 1.4, wind: 0.6, lit: true },
      { pool: 'alpha', count: 2, frame: 'dot', life: [0.3, 0.55], speed: [1, 2.4], spread: 0.8, gravity: 9.8, size: 0.03, color: 0x8a7458, alpha: 0.8, lit: true },
    ],
  });
  vfx.define('mud_splash', {
    parts: [
      { pool: 'alpha', count: 5, frame: 'dot', life: [0.35, 0.6], speed: [1.2, 2.6], spread: 0.9, gravity: 9.8, size: [0.035, 0.05], color: 0x3e2e1e, alpha: 0.95, lit: true },
      { pool: 'alpha', count: 1, frame: 'crown', life: [0.2, 0.3], size: [[0.15, 0.2], [0.35, 0.45]], color: 0x4a3a28, alpha: 0.6, lit: true, offset: [0, 0.04, 0] },
    ],
  });
  vfx.define('water_splash', {
    parts: [
      { pool: 'alpha', count: 1, frame: 'crown', life: [0.25, 0.4], size: [[0.3, 0.4], [0.8, 1.1]], color: 0xdfe8ee, alpha: 0.7, lit: true, offset: [0, 0.05, 0] },
      { pool: 'alpha', count: 8, frame: 'dot', life: [0.4, 0.7], speed: [1.5, 3.5], spread: 0.7, gravity: 9.8, size: [0.03, 0.045], color: 0xe6eef2, alpha: 0.85, lit: true },
      { pool: 'alpha', count: 1, frame: 'ring', flat: true, life: [0.8, 1.2], size: [[0.2, 0.3], [1.2, 1.6]], color: 0xe2eaf0, alpha: 0.4, lit: true, offset: [0, 0.02, 0] },
    ],
  });
  vfx.define('snow_puff', {
    parts: [{ pool: 'alpha', count: 4, frame: 'smokeB', life: [0.6, 1.1], speed: [0.4, 1.4], spread: 1.0, vel: [0, 0.4, 0], size: [[0.12, 0.2], [0.5, 0.8]], color: 0xf4f6fa, alpha: [0.6, 0], drag: 1.6, lit: true }],
  });
  vfx.define('hoofprint', { minTier: 'medium', decal: { frame: 'hoofprint', size: [0.16, 0.18], life: 40, fade: 8, alpha: 0.7, color: 0x3a2c1e } });
  vfx.define('footprint', { minTier: 'medium', decal: { frame: 'footprint', size: [0.24, 0.27], life: 30, fade: 6, alpha: 0.6, color: 0x3a2c1e } });
  vfx.define('breath_vapor', {
    minTier: 'medium',
    parts: [{ pool: 'alpha', count: 3, frame: 'smokeC', life: [0.9, 1.5], speed: [0.35, 0.8], spread: 0.35, vel: [0, 0.05, 0], size: [[0.06, 0.1], [0.35, 0.55]], color: 0xf2f4f6, alpha: [0.28, 0], drag: 1.8, wind: 0.5, lit: true }],
  });
}
