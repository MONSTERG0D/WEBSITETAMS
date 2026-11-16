import * as THREE from 'three';

/** Quality presets (GAME_BIBLE §11 performance budget). */
export const PRESETS = Object.freeze({
  low: { name: 'low', dprCap: 1.25, scaleMin: 0.55, scaleMax: 0.75, shadows: false, shadowMapSize: 512, antialias: false, maxParticles: 400, drawDistance: 350, grassRange: 0 },
  medium: { name: 'medium', dprCap: 1.5, scaleMin: 0.6, scaleMax: 0.85, shadows: true, shadowMapSize: 1024, antialias: false, maxParticles: 1500, drawDistance: 600, grassRange: 20 },
  high: { name: 'high', dprCap: 2, scaleMin: 0.7, scaleMax: 1.0, shadows: true, shadowMapSize: 2048, antialias: true, maxParticles: 5000, drawDistance: 1000, grassRange: 45 },
});

export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse || (navigator.maxTouchPoints > 1 && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));
}

/**
 * Short GPU benchmark: renders a ~0.4M-triangle instanced scene offscreen and reads one pixel back,
 * which forces the GPU to finish, so the timing ignores vsync. Thresholds are tunable.
 */
export const BENCH = { instances: 1200, runs: 18, highMs: 5, mediumMs: 18 };

export async function benchmark(renderer) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);
  camera.position.set(0, 14, 42); camera.lookAt(0, 2, 0);
  const geo = new THREE.IcosahedronGeometry(0.6, 3), mat = new THREE.MeshStandardMaterial({ color: 0xb08850, roughness: 0.7 });
  const mesh = new THREE.InstancedMesh(geo, mat, BENCH.instances), m = new THREE.Matrix4();
  for (let i = 0; i < BENCH.instances; i++) { m.makeTranslation((i % 40 - 20) * 1.6, Math.floor(i / 40) % 6 * 1.6, (Math.floor(i / 240) - 2.5) * 1.6); mesh.setMatrixAt(i, m); }
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(20, 30, 10);
  scene.add(mesh, sun, new THREE.AmbientLight(0xffffff, 0.4));
  const rt = new THREE.WebGLRenderTarget(1280, 720), px = new Uint8Array(4), times = [];
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  for (let i = 0; i < BENCH.runs + 3; i++) {
    const t0 = performance.now();
    mesh.rotation.y += 0.02;
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, px);
    if (i >= 3) times.push(performance.now() - t0);
    if (i % 6 === 5) await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
  }
  renderer.setRenderTarget(prev);
  rt.dispose(); geo.dispose(); mat.dispose(); mesh.dispose();
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)] || 30;
  let preset = median < BENCH.highMs ? 'high' : median < BENCH.mediumMs ? 'medium' : 'low';
  if (isTouchDevice() && preset === 'high' && median > BENCH.highMs * 0.6) preset = 'medium';
  return { preset, median };
}
