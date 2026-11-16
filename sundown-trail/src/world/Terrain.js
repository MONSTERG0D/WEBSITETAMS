import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { WORLD, WORLD_SEED } from '../data/world.js';
import { generateWorld } from './terrain/Generator.js';
import { TUNING as HEIGHT_TUNING } from './terrain/HeightField.js';
import { TUNING as CARVE_TUNING } from './terrain/Carving.js';
import { TUNING as MAP_TUNING } from './terrain/Maps.js';
import { TerrainData } from './terrain/TerrainData.js';
import { ChunkManager, TUNING as CHUNK_TUNING, LOD_COLORS } from './terrain/Chunks.js';
import { createTerrainTextures, createTerrainMaterial, TUNING as SPLAT_TUNING } from './terrain/Splat.js';
import { createHorizon } from './terrain/Horizon.js';
import { GENERATOR_VERSION, hashKey, loadCached, saveCached } from './terrain/Cache.js';

/**
 * Terrain (Part 1): the whole 2048 m world from data/world.js and WORLD_SEED (GAME_BIBLE §5, §11 terrain API).
 * Generation runs in a module worker and is cached in IndexedDB; rendering streams 128 m chunks with LODs.
 */
export const TUNING = {
  useWorker: true, useCache: true, bakedTextures: true, wireframe: false, lodColors: false, showHorizon: true,
  wallHeight: 600, wallThickness: 4,
};

export default class Terrain extends System {
  constructor(game) {
    super(game);
    this.ready = false; this.data = null; this.td = null; this.walls = [];
    this.stats = { source: 'none', loadMs: 0 };
    this._applied = { wireframe: false, lodColors: false, showHorizon: true, bakedTextures: TUNING.bakedTextures };
    this._texSets = {};
  }

  async init() {
    const g = this.game, t0 = performance.now();
    const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
    const useCache = TUNING.useCache && !params.has('nocache');
    const texturesPromise = this._textures(TUNING.bakedTextures); // loads or paints in small slices while the worker generates
    const data = await this._obtain({}, useCache);
    this.textures = await texturesPromise;
    this._setData(data);
    this.stats.loadMs = performance.now() - t0;
    this.materials = this._makeMaterials();
    this.chunks = new ChunkManager(g, data, this.materials);
    const s = g.startPoint?.() || WORLD.start, sp = g.player?.spawn;
    this.chunks.buildAround(s.x, s.z);
    if (sp) this.chunks.buildAround(sp.x, sp.z); // the title camera orbits the player's initial spawn
    g.events.on(EVENTS.GAME_START, () => { const p = g.player?.position; if (p) this.chunks.buildAround(p.x, p.z); });
    this.horizon = createHorizon(data, WORLD_SEED);
    g.scene.add(this.horizon);
    this._addWalls();
    g.debug?.addTuning('Terrain', TUNING);
    g.debug?.addTuning('Terrain chunks', CHUNK_TUNING, { lod0Distance: { min: 60, max: 400, step: 5 }, lod1Distance: { min: 150, max: 800, step: 10 }, blockDistance: { min: 300, max: 1200, step: 10 } });
    this.ready = true;
    console.info(`[terrain] ready in ${Math.round(this.stats.loadMs)} ms (${this.stats.source})`);
  }

  // ---------------------------------------------------------------- data
  /** Cached data, or a fresh generation in a worker (falling back to time slices on the main thread). */
  async _obtain(overrides = {}, useCache = true) {
    const g = this.game;
    const key = `terrain:${GENERATOR_VERSION}:${WORLD_SEED}:${hashKey(JSON.stringify([HEIGHT_TUNING, CARVE_TUNING, MAP_TUNING, overrides, WORLD]))}`;
    const custom = Object.keys(overrides).length > 0;
    if (useCache && !custom) {
      const cached = await loadCached(key);
      if (cached?.heights?.length) { this.stats.source = 'cache'; return cached; }
    }
    const progress = (p, phase) => g.events.emit(EVENTS.LOADING_PROGRESS, { progress: p, label: phase === 'heights' || phase === 'detail' ? 'Raising the Greywind Range' : phase === 'maps' ? 'Painting Ashwater County' : 'Carving the river and roads' });
    let data = null;
    if (TUNING.useWorker && typeof Worker !== 'undefined') {
      try { data = await this._generateInWorker({ seed: WORLD_SEED, tuning: overrides }, progress); this.stats.source = 'worker'; }
      catch (err) { console.warn('[terrain] worker generation failed; generating on the main thread', err); }
    }
    if (!data) {
      const it = generateWorld({ seed: WORLD_SEED, tuning: overrides });
      let r = it.next(), slice = performance.now();
      while (!r.done) {
        if (performance.now() - slice > 30) { progress(r.value.progress, r.value.phase); await new Promise((res) => setTimeout(res, 0)); slice = performance.now(); }
        r = it.next();
      }
      data = r.value; this.stats.source = 'main thread';
    }
    if (useCache && !custom) saveCached(key, data); // fire and forget
    return data;
  }

  _generateInWorker(opts, progress) {
    return new Promise((resolve, reject) => {
      const w = new Worker(new URL('./terrain/worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') progress(m.progress, m.phase);
        else if (m.type === 'done') { w.terminate(); resolve(m.data); }
        else if (m.type === 'error') { w.terminate(); reject(new Error(m.message)); }
      };
      w.onerror = (e) => { w.terminate(); reject(e.error || new Error(e.message || 'worker error')); };
      w.postMessage(opts);
    });
  }

  _setData(data) {
    this.data = data; this.td = new TerrainData(data);
    this.river = data.river; this.lake = data.lake; this.pads = data.pads; this.roads = data.roads;
    this.bridges = data.bridges; this.fords = data.fords; this.waterfall = data.river.waterfall;
  }

  /** Test pages: regenerate with HeightField TUNING overrides (no cache) and rebuild every mesh. */
  async regenerate(overrides = {}) {
    const data = await this._obtain(overrides, false);
    this._setData(data);
    this.chunks.rebuild(data, this.game.camera.position);
    this.horizon.removeFromParent(); this.horizon.geometry.dispose(); this.horizon.material.dispose();
    this.horizon = createHorizon(data, WORLD_SEED); this.game.scene.add(this.horizon);
    return data;
  }

  // ---------------------------------------------------------------- rendering
  /** Blender-baked textures from assets/terrain (falls back to painted ones), or the painted set. Cached per mode. */
  _textures(baked) {
    const k = baked ? 'baked' : 'painted';
    if (!this._texSets[k]) this._texSets[k] = createTerrainTextures(this.game.renderer, { baked, quality: this.game.quality?.name });
    return this._texSets[k];
  }

  _rebuildMaterials() {
    const old = new Set(this.materials);
    this.materials = this._makeMaterials(); this.chunks.setMaterials(this.materials);
    for (const m of old) m.dispose();
  }

  _makeMaterials() {
    const make = (tint) => { const m = createTerrainMaterial(this.textures, { lodTint: tint }); m.wireframe = TUNING.wireframe; return m; };
    if (!TUNING.lodColors) { const m = make(null); return [m, m, m, m]; }
    return LOD_COLORS.map((c) => make(c.clone()));
  }

  _addWalls() {
    const p = this.game.physics, W = WORLD.wall, h = TUNING.wallHeight, t = TUNING.wallThickness, L = W * 2 + t * 2;
    const defs = [[0, -W - t / 2, L, t], [0, W + t / 2, L, t], [-W - t / 2, 0, t, L], [W + t / 2, 0, t, L]];
    for (const [x, z, sx, sz] of defs) this.walls.push(p.addCollider({ type: 'box', position: new THREE.Vector3(x, h / 2 - 50, z), size: new THREE.Vector3(sx, h, sz), surface: 'rock', tag: 'worldWall' }));
  }

  lateUpdate() {
    if (!this.ready) return;
    this._applyDebugToggles();
    this.chunks.update(this.game.camera.position);
    this._applyWeather();
  }

  /** Wet and snowy ground from the weather (Part 2); the fallback weather is dry. */
  _applyWeather() {
    const w = this.game.get('weather');
    const wet = w ? w.wetness : 0, snow = w ? w.snowCover : 0, level = w ? w.snowLevel ?? 150 : 150;
    for (let i = 0; i < this.materials.length; i++) { // no allocation per frame
      const u = this.materials[i].userData.terrainUniforms;
      if (u?.uWetness) { u.uWetness.value = wet; u.uSnowCover.value = snow; u.uSnowLevel.value = level; }
    }
  }
  update() {}

  _applyDebugToggles() {
    const a = this._applied;
    if (a.wireframe !== TUNING.wireframe || a.lodColors !== TUNING.lodColors) {
      this._rebuildMaterials();
      a.wireframe = TUNING.wireframe; a.lodColors = TUNING.lodColors;
    }
    if (a.bakedTextures !== TUNING.bakedTextures) {
      a.bakedTextures = TUNING.bakedTextures;
      this._textures(TUNING.bakedTextures).then((t) => { this.textures = t; this._rebuildMaterials(); });
    }
    if (a.showHorizon !== TUNING.showHorizon) { this.horizon.visible = TUNING.showHorizon; a.showHorizon = TUNING.showHorizon; }
  }

  // ---------------------------------------------------------------- terrain API (GAME_BIBLE §11)
  /** @returns {number} ground height in metres, matching the rendered surface */
  getHeightAt(x, z) { return this.td ? this.td.getHeightAt(x, z) : 0; }
  /** @returns {THREE.Vector3} unit normal; pass `out` to avoid allocating */
  getNormalAt(x, z, out) { return this.td ? this.td.getNormalAt(x, z, out) : (out || new THREE.Vector3()).set(0, 1, 0); }
  /** @returns {'valley'|'riverbank'|'highland'|'snow'|'desert'} */
  getBiomeAt(x, z) { return this.td ? this.td.getBiomeAt(x, z) : 'valley'; }
  /** @returns {string} footstep surface: grass, dirt, road, sand, rock, snow, wood, mud or water */
  getSurfaceAt(x, z) { return this.td ? this.td.getSurfaceAt(x, z) : 'grass'; }
  isWater(x, z) { return this.td ? this.td.isWater(x, z) : false; }
  getWaterDepth(x, z) { return this.td ? this.td.getWaterDepth(x, z) : 0; }
  /** Water surface height (river or Mirror Lake), or null. Added in Part 1. */
  getWaterLevelAt(x, z) { return this.td ? this.td.getWaterLevelAt(x, z) : null; }
  /** @returns {{ onRoad: boolean, distance: number, trail: boolean, bridge: boolean }} */
  getRoadInfo(x, z) { return this.td ? this.td.getRoadInfo(x, z) : { onRoad: false, distance: Infinity, trail: false, bridge: false }; }
  /** @returns {'copperbell'|'blackstone'|'saltmesa'|'greywind'} */
  getRegionAt(x, z) { return this.td ? this.td.getRegionAt(x, z) : 'copperbell'; }
  /** Ray against the height field: { point, normal, distance, surface } or null. */
  raycast(origin, dir, max = 1000) { return this.td ? this.td.raycast(origin, dir, max) : null; }

  dispose() {
    this.chunks?.dispose();
    for (const m of new Set(this.materials || [])) m.dispose();
    for (const p of Object.values(this._texSets)) p.then((t) => { t.array.dispose(); t.nrm.dispose(); t.detail.dispose(); });
    if (this.horizon) { this.horizon.removeFromParent(); this.horizon.geometry.dispose(); this.horizon.material.dispose(); }
    for (const w of this.walls) this.game.physics.removeCollider(w);
    this.walls.length = 0;
  }
}

export { SPLAT_TUNING };
