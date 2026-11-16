import * as THREE from 'three';
import { N, SPACING, ORIGIN } from './Grid.js';

/**
 * Terrain meshes: 16 × 16 chunks of 128 m with three LODs (2, 4 and 8 m spacing), grouped in 4 × 4 blocks of
 * 512 m that collapse into a single 16 m mesh when far away. Skirts hide cracks between LODs. Chunks build
 * nearest-first within a per-frame time budget; everything a camera at the spawn needs builds up front.
 */
export const TUNING = {
  lod0Distance: 170, lod1Distance: 400, blockDistance: 620, hysteresis: 24,
  buildBudgetMs: 4, lod0Cache: 48, skirtDepth: 4, castShadowLod0: true, updateEvery: 2,
};

const CHUNK_CELLS = 64, CHUNKS = 16, BLOCK_CHUNKS = 4, BLOCKS = 4, CHUNK_M = CHUNK_CELLS * SPACING;
const STRIDES = [1, 2, 4], BLOCK_STRIDE = 8;
export const LOD_COLORS = [new THREE.Color(1, 0.55, 0.55), new THREE.Color(0.55, 1, 0.55), new THREE.Color(0.55, 0.65, 1), new THREE.Color(1, 1, 0.5)];

/**
 * Builds one terrain patch. (i0, j0) is the grid index of its north-west corner; `cells` grid cells per side
 * sampled every `stride` cells. Triangles split each quad along the (i, j)→(i+1, j+1) diagonal, matching
 * Grid.triangleHeight, so getHeightAt equals the LOD0 surface.
 */
export function buildPatchGeometry(data, i0, j0, cells, stride, skirtDepth) {
  const H = data.heights, vs = cells / stride + 1, skirt = 4 * vs, total = vs * vs + skirt;
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3);
  const s0 = new Uint8Array(total * 4), s1 = new Uint8Array(total * 4), tint = new Uint8Array(total);
  const x0 = ORIGIN + i0 * SPACING, z0 = ORIGIN + j0 * SPACING;
  const put = (v, gi, gj, y) => {
    const k = gj * N + gi;
    pos[v * 3] = (gi - i0) * SPACING; pos[v * 3 + 1] = y; pos[v * 3 + 2] = (gj - j0) * SPACING;
    const il = Math.max(0, gi - 1), ir = Math.min(N - 1, gi + 1), ju = Math.max(0, gj - 1), jd = Math.min(N - 1, gj + 1);
    const dx = (H[gj * N + ir] - H[gj * N + il]) / ((ir - il) * SPACING), dz = (H[jd * N + gi] - H[ju * N + gi]) / ((jd - ju) * SPACING);
    const l = Math.sqrt(dx * dx + 1 + dz * dz);
    nrm[v * 3] = -dx / l; nrm[v * 3 + 1] = 1 / l; nrm[v * 3 + 2] = -dz / l;
    const a0 = data.splat0, a1 = data.splat1, k4 = k * 4, v4 = v * 4;
    s0[v4] = a0[k4]; s0[v4 + 1] = a0[k4 + 1]; s0[v4 + 2] = a0[k4 + 2]; s0[v4 + 3] = a0[k4 + 3];
    s1[v4] = a1[k4]; s1[v4 + 1] = a1[k4 + 1]; s1[v4 + 2] = a1[k4 + 2]; s1[v4 + 3] = a1[k4 + 3]; tint[v] = data.tint[k];
  };
  for (let b = 0; b < vs; b++) for (let a = 0; a < vs; a++) { const gi = i0 + a * stride, gj = j0 + b * stride; put(b * vs + a, gi, gj, H[gj * N + gi]); }
  // Skirt rings: north, south, west, east edges dropped by skirtDepth.
  const edges = [];
  for (let e = 0; e < 4; e++) {
    const base = vs * vs + e * vs, top = [];
    for (let t = 0; t < vs; t++) {
      const a = e === 0 ? t : e === 1 ? t : e === 2 ? 0 : vs - 1, b = e === 0 ? 0 : e === 1 ? vs - 1 : t;
      const v = b * vs + a; top.push(v);
      const gi = i0 + a * stride, gj = j0 + b * stride;
      put(base + t, gi, gj, H[gj * N + gi] - skirtDepth);
    }
    edges.push({ top, base });
  }
  const quads = (vs - 1) * (vs - 1), idx = new Uint16Array(quads * 6 + 4 * (vs - 1) * 6);
  let o = 0;
  for (let b = 0; b < vs - 1; b++) for (let a = 0; a < vs - 1; a++) {
    const A = b * vs + a, D = A + 1, B = A + vs, C = B + 1; // A=(i,j) D=(i+1,j) B=(i,j+1) C=(i+1,j+1)
    idx[o++] = A; idx[o++] = B; idx[o++] = C; idx[o++] = A; idx[o++] = C; idx[o++] = D;
  }
  edges.forEach(({ top, base }, e) => {
    const outwardLikeNorth = e === 0 || e === 3; // north (−z) and east (+x) share a winding; south and west mirror it
    for (let t = 0; t < vs - 1; t++) {
      const t0 = top[t], t1 = top[t + 1], b0 = base + t, b1 = base + t + 1;
      if (outwardLikeNorth) { idx[o++] = t0; idx[o++] = t1; idx[o++] = b0; idx[o++] = t1; idx[o++] = b1; idx[o++] = b0; }
      else { idx[o++] = t0; idx[o++] = b0; idx[o++] = t1; idx[o++] = t1; idx[o++] = b0; idx[o++] = b1; }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('splat0', new THREE.BufferAttribute(s0, 4, true));
  g.setAttribute('splat1', new THREE.BufferAttribute(s1, 4, true));
  g.setAttribute('rockTint', new THREE.BufferAttribute(tint, 1, true));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  g.userData.origin = [x0, z0];
  return g;
}

export class ChunkManager {
  /**
   * @param {import('../../core/Game.js').Game} game
   * @param {object} data world data
   * @param {THREE.Material[]} materials one per LOD (0, 1, 2, block); can all be the same material
   */
  constructor(game, data, materials) {
    this.game = game; this.data = data; this.materials = materials;
    this.group = new THREE.Group(); this.group.name = 'Terrain';
    this.chunks = []; this.blocks = []; this.queue = []; this._frame = 0; this._lod0Order = [];
    this.stats = { built: 0, queued: 0, visible: [0, 0, 0, 0], updateMs: 0, buildMs: 0 };
    for (let cz = 0; cz < CHUNKS; cz++) for (let cx = 0; cx < CHUNKS; cx++) {
      const mesh = new THREE.Mesh(undefined, materials[2]);
      mesh.position.set(ORIGIN + cx * CHUNK_M, 0, ORIGIN + cz * CHUNK_M); mesh.visible = false; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.name = `chunk ${cx},${cz}`;
      this.group.add(mesh);
      this.chunks.push({ cx, cz, mesh, lod: -1, want: 2, geos: [null, null, null], minX: mesh.position.x, minZ: mesh.position.z });
    }
    for (let bz = 0; bz < BLOCKS; bz++) for (let bx = 0; bx < BLOCKS; bx++) {
      const geo = buildPatchGeometry(data, bx * BLOCK_CHUNKS * CHUNK_CELLS, bz * BLOCK_CHUNKS * CHUNK_CELLS, BLOCK_CHUNKS * CHUNK_CELLS, BLOCK_STRIDE, TUNING.skirtDepth * 2.5);
      const mesh = new THREE.Mesh(geo, materials[3]);
      mesh.position.set(ORIGIN + bx * BLOCK_CHUNKS * CHUNK_M, 0, ORIGIN + bz * BLOCK_CHUNKS * CHUNK_M); mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.name = `block ${bx},${bz}`;
      this.group.add(mesh);
      this.blocks.push({ bx, bz, mesh, far: true, minX: mesh.position.x, minZ: mesh.position.z, size: BLOCK_CHUNKS * CHUNK_M });
    }
    game.scene.add(this.group);
  }

  _geometry(c, lod) {
    if (!c.geos[lod]) {
      const t0 = performance.now();
      c.geos[lod] = buildPatchGeometry(this.data, c.cx * CHUNK_CELLS, c.cz * CHUNK_CELLS, CHUNK_CELLS, STRIDES[lod], TUNING.skirtDepth * (1 + lod));
      this.stats.built++; this.stats.buildMs += performance.now() - t0;
      if (lod === 0) { this._lod0Order.push(c); this._trimLod0(); }
    }
    return c.geos[lod];
  }
  _trimLod0() {
    while (this._lod0Order.length > TUNING.lod0Cache) {
      const i = this._lod0Order.findIndex((c) => c.lod !== 0);
      if (i < 0) break;
      const [c] = this._lod0Order.splice(i, 1);
      c.geos[0]?.dispose(); c.geos[0] = null;
    }
  }
  _show(c, lod) {
    const m = c.mesh;
    m.geometry = c.geos[lod]; m.material = this.materials[lod]; m.castShadow = TUNING.castShadowLod0 && lod === 0;
    m.visible = true; c.lod = lod;
  }

  /** Builds everything a camera at (x, z) needs right now, synchronously (used before the first frame). */
  buildAround(x, z) { this.update(new THREE.Vector3(x, 0, z), true); }

  /**
   * Chooses LODs for the camera position and spends up to buildBudgetMs building missing geometry.
   * @param {THREE.Vector3} cam @param {boolean} [sync] build everything needed now
   */
  update(cam, sync = false) {
    const t0 = performance.now(), T = TUNING;
    if (!sync && (this._frame++ % T.updateEvery) && !this.queue.length) return;
    const vis = this.stats.visible; vis[0] = vis[1] = vis[2] = vis[3] = 0;
    this.queue.length = 0;
    for (const b of this.blocks) {
      const d = rectDistance(cam.x, cam.z, b.minX, b.minZ, b.size);
      const far = b.far ? d > T.blockDistance - T.hysteresis : d > T.blockDistance + T.hysteresis;
      if (far) {
        if (!b.far) { b.far = true; for (const c of this._chunksOf(b)) c.mesh.visible = false; }
        b.mesh.visible = true; vis[3]++;
        continue;
      }
      if (b.far) { b.far = false; for (const c of this._chunksOf(b)) { if (c.lod < 0) { this._geometry(c, 2); this._show(c, 2); } else c.mesh.visible = true; } }
      b.mesh.visible = false;
      for (const c of this._chunksOf(b)) {
        const d2 = rectDistance(cam.x, cam.z, c.minX, c.minZ, CHUNK_M);
        const cur = c.lod, h = T.hysteresis;
        let want = d2 < T.lod0Distance ? 0 : d2 < T.lod1Distance ? 1 : 2;
        if (cur === 0 && want === 1 && d2 < T.lod0Distance + h) want = 0;
        if (cur === 1 && want === 2 && d2 < T.lod1Distance + h) want = 1;
        if (cur === 1 && want === 0 && d2 > T.lod0Distance - h) want = 1;
        if (cur === 2 && want === 1 && d2 > T.lod1Distance - h) want = 2;
        c.want = want;
        if (c.geos[want] || sync) { this._geometry(c, want); if (cur !== want) this._show(c, want); }
        else { this.queue.push([d2, c]); if (cur < 0) { this._geometry(c, 2); this._show(c, 2); } }
        vis[c.lod]++;
      }
    }
    if (this.queue.length) {
      this.queue.sort((a, b) => a[0] - b[0]);
      for (const [, c] of this.queue) {
        if (performance.now() - t0 > T.buildBudgetMs) break;
        this._geometry(c, c.want); this._show(c, c.want);
      }
      this.queue = this.queue.filter(([, c]) => c.lod !== c.want);
    }
    this.stats.queued = this.queue.length;
    this.stats.updateMs = performance.now() - t0;
  }

  *_chunksOf(b) {
    for (let z = 0; z < BLOCK_CHUNKS; z++) for (let x = 0; x < BLOCK_CHUNKS; x++) yield this.chunks[(b.bz * BLOCK_CHUNKS + z) * CHUNKS + b.bx * BLOCK_CHUNKS + x];
  }

  setMaterials(materials) {
    this.materials = materials;
    for (const c of this.chunks) if (c.lod >= 0) c.mesh.material = materials[c.lod];
    for (const b of this.blocks) b.mesh.material = materials[3];
  }

  /** Rebuild every geometry (after the data changed, e.g. regenerated on a test page). */
  rebuild(data, cam) {
    this.data = data;
    for (const c of this.chunks) { for (const g of c.geos) g?.dispose(); c.geos = [null, null, null]; c.lod = -1; c.mesh.visible = false; }
    this._lod0Order.length = 0;
    for (const b of this.blocks) {
      b.mesh.geometry.dispose();
      b.mesh.geometry = buildPatchGeometry(data, b.bx * BLOCK_CHUNKS * CHUNK_CELLS, b.bz * BLOCK_CHUNKS * CHUNK_CELLS, BLOCK_CHUNKS * CHUNK_CELLS, BLOCK_STRIDE, TUNING.skirtDepth * 2.5);
      b.far = true;
    }
    this.update(cam, true);
  }

  dispose() {
    for (const c of this.chunks) for (const g of c.geos) g?.dispose();
    for (const b of this.blocks) b.mesh.geometry.dispose();
    this.group.removeFromParent();
  }
}

/** Distance from a point to an axis-aligned square on the XZ plane (0 inside). */
function rectDistance(x, z, minX, minZ, size) {
  const dx = Math.max(minX - x, 0, x - (minX + size)), dz = Math.max(minZ - z, 0, z - (minZ + size));
  return Math.hypot(dx, dz);
}

export { CHUNK_M, CHUNKS };
