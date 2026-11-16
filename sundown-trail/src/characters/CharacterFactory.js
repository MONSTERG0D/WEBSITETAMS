import * as THREE from 'three';
import { sizeFor, lodBias } from '../render/TextureDetail.js';
import System from '../core/System.js';
import { HumanRig, TUNING as RIG_TUNING, showHitboxes, cachedLooks } from './HumanRig.js';
import { HumanAnimator } from './HumanAnimator.js';
import { resolveLook } from './rig/Outfits.js';
import { B } from './rig/Bones.js';
import { buildHumanAtlas, TUNING as TEX_TUNING } from './rig/HumanTextures.js';

/**
 * The 'characters' system (GAME_BIBLE §10–11): createHuman({ seed, role, outfit, hat, colors, scale }) → Human.
 * Owns the shared human material and texture atlas, and every frame picks each human's LOD, skips animation
 * work for far or off-screen humans, and runs their animators.
 */
export const TUNING = {
  lodBias: 1, envIntensity: 0.55, normalScale: 0.75, frustumRadius: 1.6,
  animEveryLod2: 2, animEveryHidden: 8, showHitboxes: false,
};

const _cam = new THREE.Vector3(), _pos = new THREE.Vector3(), _quat = new THREE.Quaternion(), _scl = new THREE.Vector3();
const _frustum = new THREE.Frustum(), _pv = new THREE.Matrix4(), _sphere = new THREE.Sphere();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

/**
 * Gameplay-facing human (GAME_BIBLE §11 Human API). Talk to this, never to the meshes, so the procedural
 * body can later be swapped for a glTF model without touching gameplay.
 */
export class Human {
  constructor(factory, opts = {}) {
    this.factory = factory;
    this.opts = { ...opts }; delete this.opts.parent;
    this.look = resolveLook(opts);
    this.rig = new HumanRig(this.look, factory.material, { hero: opts.hero ?? this.look.role === 'eli' });
    this.object3d = this.rig.object3d;
    this.object3d.userData.human = this;
    this.animator = new HumanAnimator(this.rig);
    this.alive = true; this._acc = 0; this._frame = 0; this.disposed = false;
  }
  /** Current base state name (locomotion or clip). */
  get state() { return this.animator.state; }
  /** Current upper-body state, or null. */
  get upperState() { return this.animator.upperName; }
  /**
   * Plays a Bible state: idle walk run sprint crouchIdle crouchWalk jump fall land aimPistol aimRifle aimBow fire
   * reload holster draw punch block hit death mount dismount ride sit talk wave carry hogtied skin cook sleep.
   * Locomotion states follow the object's actual motion (move object3d; the feet keep up without sliding).
   * opts: { fade, speed, onEnd, hand: 'L', ground (sit), intensity (land), direction + zone + strength (hit),
   * weapon (fire), impulse (death) }.
   */
  setState(name, opts) { return this.animator.setState(name, opts); }
  /** Added in Part 4: ends the upper-body layer (aiming, carrying, talking). */
  stopUpper(fade) { this.animator.stopUpper(fade); }
  /** Head and eyes follow a world point (Vector3) or stop with null. */
  lookAt(v) { this.animator.lookAt(v); }
  /** Spine and chest turn toward a world point while aiming, or stop with null. */
  aimAt(v) { this.animator.aimAt(v); }
  /** Object3D to parent weapons and props to: 'handR'|'handL'|'hip'|'back'|'head'. Its −Z is "forward". */
  getAttach(name) { return this.rig.attach[name] || null; }
  /** Ragdoll-lite death toward `impulse` (world Vector3; null falls backwards). */
  setRagdoll(impulse) { this.alive = false; this.animator.ragdoll(impulse || null, impulse ? 1 : 0.6); }
  /** Added in Part 4: call after moving the object instantly so feet re-plant. */
  teleported() { this.animator.teleported(); }
  /** Added in Part 4: sets userData.entity on the body and hit boxes (entity contract). */
  setEntity(entity) { this.object3d.userData.entity = entity; for (const h of this.rig.hitboxes) h.userData.entity = entity; }
  /** Added in Part 13: changes clothes — { hat: 'flat'|'cattleman'|'bowler'|'gambler'|'none', outfit: 'duster'|'sheepskin'|'vest'|'shirt'|… }. */
  setLook(overrides = {}) {
    this.opts = { ...this.opts, ...overrides };
    this.look = resolveLook(this.opts);
    this.rig.setLook(this.look, this.opts.hero ?? this.look.role === 'eli');
    return this.look;
  }
  /** Added in Part 4: footstep callback (side 'L'|'R', speed m/s) for sounds and prints. */
  set onStep(fn) { this.animator.onStep = fn; }
  /** Added in Part 5: gait info from the horse being ridden ({ w, phase, speed }) or null. */
  setRideMotion(m) { this.animator.setRideMotion(m); }
  /**
   * Added in Part 6: a skeleton bone by name (e.g. 'upperArmL', 'handR', 'chest') for post-animation adjustments such as
   * weapon hand IK. Changes made after the characters system's lateUpdate last until the next animation frame.
   */
  getBone(name) { return B[name] === undefined ? null : this.rig.bones[B[name]]; }
  /** Added in Part 6: true when this frame's pose was written (far or off-screen humans animate every few frames). */
  get posedThisFrame() { return this._posedFrame === this.factory._frame; }
  get talking() { return this.animator.talking; }
  set talking(v) { this.animator.talking = !!v; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.factory._remove(this);
    this.rig.dispose();
  }
}

export default class CharacterFactory extends System {
  constructor(game) {
    super(game);
    this.humans = new Set();
    this.stats = { humans: 0, visible: 0, animated: 0, animMs: 0, tris: 0, looks: 0 };
  }

  async init() {
    const g = this.game;
    const size = sizeFor('human'); // Part 16: 512 / 1024 / 2048 by texture detail (was 1024 on High, 512 elsewhere)
    const t0 = performance.now();
    this.atlas = buildHumanAtlas(size);
    this.material = new THREE.MeshStandardMaterial({
      map: this.atlas.map, normalMap: this.atlas.normalMap, roughnessMap: this.atlas.ormMap, metalnessMap: this.atlas.ormMap,
      vertexColors: true, roughness: 1, metalness: 1, envMapIntensity: TUNING.envIntensity,
    });
    this.material.normalScale.set(TUNING.normalScale, TUNING.normalScale);
    this.material.name = 'human';
    this.atlasMs = performance.now() - t0;
    g.debug?.addTuning('Characters', TUNING);
    g.debug?.addTuning('Human LOD', RIG_TUNING);
  }

  /**
   * @param {{seed?, role?, outfit?, hat?, colors?, scale?, hero?, parent?}} opts parent: Object3D to add to
   *   (default the scene; pass null to add it yourself)
   * @returns {Human}
   */
  createHuman(opts = {}) {
    const h = new Human(this, opts);
    this.humans.add(h);
    const parent = opts.parent === undefined ? this.game.scene : opts.parent;
    parent?.add(h.object3d);
    return h;
  }
  _remove(h) { this.humans.delete(h); }

  /** Runs after every system's update (so animation sees this frame's movement) and before the camera. */
  lateUpdate(dt) {
    this._frame = (this._frame || 0) + 1;
    if (!this.humans.size) return;
    const g = this.game, cam = g.camera, t0 = performance.now();
    cam.getWorldPosition(_cam);
    _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
    const terrain = g.sys('terrain'), wind = g.sys('weather').wind || null;
    const ground = this._ground || (this._ground = (x, z) => terrain.getHeightAt(x, z));
    if (TUNING.showHitboxes !== this._hb) { this._hb = TUNING.showHitboxes; showHitboxes(this._hb); }
    let visible = 0, animated = 0, tris = 0;
    const env = this._env || (this._env = { x: 0, y: 0, z: 0, yaw: 0, scale: 1, ground, wind: null, lod: 0 });
    env.wind = wind;
    for (const h of this.humans) {
      const o = h.object3d;
      if (o.parent && o.parent !== g.scene) {
        o.updateWorldMatrix(true, false);
        o.matrixWorld.decompose(_pos, _quat, _scl);
        _euler.setFromQuaternion(_quat); env.yaw = _euler.y; env.scale = _scl.x;
      } else { _pos.copy(o.position); env.yaw = o.rotation.y; env.scale = o.scale.x; }
      env.x = _pos.x; env.y = _pos.y; env.z = _pos.z;
      const dist = _pos.distanceTo(_cam);
      const lod = h.forceLOD ?? h.rig.updateLOD(dist, TUNING.lodBias * lodBias()); // Part 16: × High's bias
      if (h.forceLOD !== undefined) h.rig.setLOD(h.forceLOD);
      _sphere.center.set(_pos.x, _pos.y + 0.9 * env.scale, _pos.z); _sphere.radius = TUNING.frustumRadius * env.scale;
      const onScreen = o.visible && lod < 3 && _frustum.intersectsSphere(_sphere);
      if (onScreen) { visible++; tris += h.rig.tris[lod]; }
      const every = !onScreen ? TUNING.animEveryHidden : lod >= 2 ? TUNING.animEveryLod2 : 1;
      h._acc += dt; h._frame++;
      if (h._frame % every !== 0 && h._acc < 0.5) continue;
      env.lod = onScreen ? lod : 3;
      h.animator.update(h._acc, env);
      h._acc = 0; h._posedFrame = this._frame; animated++;
    }
    const s = this.stats;
    s.humans = this.humans.size; s.visible = visible; s.animated = animated; s.tris = tris; s.looks = cachedLooks();
    s.animMs += (performance.now() - t0 - s.animMs) * 0.1;
  }

  dispose() {
    for (const h of [...this.humans]) h.dispose();
    this.material?.dispose();
    for (const k of ['map', 'normalMap', 'ormMap']) this.atlas?.[k]?.dispose();
  }
}

export { CharacterFactory };
