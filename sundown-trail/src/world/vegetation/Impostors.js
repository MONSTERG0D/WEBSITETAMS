import * as THREE from 'three';

/**
 * Far trees: each species' LOD0 mesh is photographed once from the side into a 4 × 4 atlas, and every far tree in
 * the world is drawn as two crossed quads in ONE instanced draw call (per-instance atlas cell via aCell).
 */
const GRID = 4, SIZE = 1024;

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {{ lod0: THREE.BufferGeometry, impostor?: boolean }[]} species built species
 * @param {THREE.Texture} atlas vegetation atlas
 * @returns {{ texture: THREE.Texture, cells: (null|{u0:number,v0:number,du:number,dv:number,w:number,h:number})[], dispose(): void }}
 */
export function bakeImpostors(renderer, species, atlas) {
  const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  rt.texture.colorSpace = THREE.NoColorSpace; // stores linear albedo
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const mat = new THREE.MeshBasicMaterial({ map: atlas, alphaTest: 0.45, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(undefined, mat); scene.add(mesh);
  const prevTarget = renderer.getRenderTarget(), prevColor = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  const prevTone = renderer.toneMapping;
  renderer.setRenderTarget(rt); renderer.setClearColor(0x3a4a2a, 0); renderer.clear(true, true, false); // a foliage-coloured clear hides fringes in mips
  const cells = [], cellPx = SIZE / GRID;
  let slot = 0;
  for (const s of species) {
    if (!s.impostor) { cells.push(null); continue; }
    const g = s.lod0; g.computeBoundingBox();
    const bb = g.boundingBox, halfW = Math.max(Math.abs(bb.min.x), bb.max.x, Math.abs(bb.min.z), bb.max.z) * 1.02, top = bb.max.y * 1.02, bottom = Math.min(0, bb.min.y);
    const w = halfW * 2, h = top - bottom, side = Math.max(w, h);
    const col = slot % GRID, row = Math.floor(slot / GRID); slot++;
    mesh.geometry = g;
    cam.left = -side / 2; cam.right = side / 2; cam.bottom = bottom + h / 2 - side / 2; cam.top = bottom + h / 2 + side / 2;
    cam.position.set(0, 0, 100); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
    rt.viewport.set(col * cellPx, row * cellPx, cellPx, cellPx); rt.scissor.copy(rt.viewport); rt.scissorTest = true;
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    // uv of the used part of the cell (the tree is centred; w or h may be smaller than `side`)
    const fu = w / side, fv = h / side, cu = col / GRID, cv = row / GRID;
    const u0 = cu + (1 - fu) / 2 / GRID, v0 = cv + ((bottom - (bottom + h / 2 - side / 2)) / side) / GRID;
    cells.push({ u0, v0, du: fu / GRID, dv: fv / GRID, w, h, bottom });
  }
  rt.scissorTest = false;
  renderer.setRenderTarget(prevTarget); renderer.setClearColor(prevColor, prevAlpha); renderer.toneMapping = prevTone;
  mat.dispose();
  return { texture: rt.texture, cells, dispose() { rt.dispose(); } };
}

/** Two crossed unit quads (x −0.5..0.5, y 0..1), normals tilted up for soft lighting. */
export function impostorGeometry() {
  const p = [], n = [], uv = [], idx = [];
  for (const a of [0, Math.PI / 2]) {
    const cx = Math.cos(a), cz = -Math.sin(a), nx = -cz * 0.45, nz = cx * 0.45, base = p.length / 3;
    for (const [sx, y] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]) { p.push(cx * sx, y, cz * sx); n.push(nx, 0.9, nz); uv.push(sx + 0.5, y); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}

/** Material for the impostor InstancedMesh: per-instance atlas cell (aCell = u0, v0, du, dv). */
export function impostorMaterial(texture) {
  const m = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.95, metalness: 0, envMapIntensity: 0.4 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aCell;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = aCell.xy + uv * aCell.zw;');
  };
  m.customProgramCacheKey = () => 'sundown-impostor-1';
  return m;
}
