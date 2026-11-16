import * as THREE from 'three';
import { AnimalRig } from './AnimalRig.js';
import { EVENTS } from '../core/Events.js';

/**
 * Species table and the Animal entity (Part 10). Each species has a look (shape and fur colours for AnimalBody),
 * movement speeds and gait thresholds, senses (sight, smell, hearing), a temperament ('prey', 'skittish',
 * 'pack', 'territorial', 'sky', 'flock'), where and when it lives, what it yields when skinned and which
 * weapons keep its pelt whole. Hit zones: head ×2.5 and limb ×0.6 come from combat; vital ×2 is applied here.
 */
export const TUNING = { vitalMultiplier: 2, bleedPerHit: 0.02, bleedVital: 0.04, bleedMax: 0.06, carcassLife: 420, skinnedLife: 45 };

const C = (back, side, belly, extra = {}) => ({ back, side, belly, ...extra });
/** Natural pelt quality odds [★, ★★, ★★★]. */
export const NATURAL_ODDS = [0.2, 0.45, 0.35];

export const SPECIES = {
  deer_buck: {
    name: 'Buck', pelt: 'deer', meat: ['meat_big_raw', 2], temper: 'prey', health: 60, radius: 0.4,
    speeds: { walk: 1.3, trot: 3.6, run: 11.5 }, gaits: [1.8, 5.5], senses: { sight: 55, smell: 45, hearing: 1, fov: 300 },
    group: [1, 1], biomes: { valley: 2, riverbank: 2.4, highland: 1.2 }, hours: 'crepuscular', zigzag: 0.55,
    weapons: { best: ['bow', 'repeater', 'rifle'], ok: ['revolver', 'knife'] },
    look: { antlers: 'deer', rumpPatch: true, flagTail: true, colors: C('#6e4f34', '#8f6a47', '#e6dccb', { face: '#7a5a3e', muzzle: '#2a201a', legs: '#7c5c40', rump: '#ece4d6', tail: '#6e4f34', tailUnder: '#f4efe6', earIn: '#e2d2c0' }),
      shape: { height: 1.0, length: 0.78, width: 0.17, depth: 0.2, neck: 0.5, neckAngle: 58, head: 0.3, headSize: 0.1, headAngle: 40, snout: 0.5, ear: 0.14, earW: 0.055, earTilt: 0.6, tail: 0.16, tailR: 0.035, tailAngle: 70, tuck: 0.25, legR: 0.022, hoofH: 0.05, hock: 0.45, chest: 0.3 } },
  },
  deer_doe: {
    name: 'Doe', pelt: 'deer', meat: ['meat_big_raw', 2], temper: 'prey', health: 50, radius: 0.36,
    speeds: { walk: 1.3, trot: 3.6, run: 11 }, gaits: [1.8, 5.5], senses: { sight: 60, smell: 45, hearing: 1.1, fov: 300 },
    group: [2, 4], biomes: { valley: 3, riverbank: 3, highland: 1.4 }, hours: 'crepuscular', zigzag: 0.55,
    weapons: { best: ['bow', 'repeater', 'rifle'], ok: ['revolver', 'knife'] },
    look: { rumpPatch: true, flagTail: true, colors: C('#73553a', '#977050', '#e8dece', { face: '#80603f', muzzle: '#2a201a', legs: '#80603f', rump: '#ece4d6', tail: '#73553a', tailUnder: '#f4efe6', earIn: '#e2d2c0' }),
      shape: { height: 0.92, length: 0.72, width: 0.15, depth: 0.18, neck: 0.46, neckAngle: 58, head: 0.28, headSize: 0.09, headAngle: 40, snout: 0.5, ear: 0.14, earW: 0.055, earTilt: 0.6, tail: 0.15, tailR: 0.033, tailAngle: 70, tuck: 0.25, legR: 0.02, hoofH: 0.045, hock: 0.45, chest: 0.25 } },
  },
  elk: {
    name: 'Elk', pelt: 'elk', meat: ['meat_big_raw', 3], temper: 'prey', health: 120, radius: 0.55,
    speeds: { walk: 1.4, trot: 4, run: 11 }, gaits: [2, 6], senses: { sight: 60, smell: 55, hearing: 1, fov: 300 },
    group: [1, 3], biomes: { highland: 2, snow: 1.4 }, hours: 'crepuscular', zigzag: 0.3,
    weapons: { best: ['rifle', 'repeater', 'bow'], ok: ['revolver'] },
    look: { antlers: 'elk', rumpPatch: true, colors: C('#8a6a48', '#a5835c', '#4e3c2a', { face: '#4a3626', muzzle: '#1e1610', legs: '#3e2e22', rump: '#dcc69c', tail: '#d6c090', tailUnder: '#d6c090', ear: '#6a5038' }),
      shape: { height: 1.45, length: 1.15, width: 0.27, depth: 0.32, neck: 0.72, neckAngle: 50, head: 0.5, headSize: 0.16, headAngle: 45, snout: 0.62, ear: 0.17, earW: 0.07, earTilt: 0.6, tail: 0.1, tailR: 0.04, tailAngle: 70, tuck: 0.2, legR: 0.035, hoofH: 0.06, hock: 0.45, mane: 1, neckThick: 1.2, chest: 0.3 } },
  },
  rabbit: {
    name: 'Rabbit', pelt: 'rabbit', meat: ['meat_small_raw', 1], temper: 'prey', health: 8, radius: 0.15, small: true, hop: true,
    speeds: { walk: 0.6, trot: 2.4, run: 8 }, gaits: [0.8, 3], senses: { sight: 30, smell: 15, hearing: 1.3, fov: 340 },
    group: [1, 2], biomes: { valley: 3, desert: 3, riverbank: 2, highland: 1, snow: 0.6 }, hours: 'dusk', zigzag: 1.0,
    weapons: { best: ['bow'], ok: ['revolver', 'knife'] },
    look: { earTip: '#2a2420', colors: C('#8a7660', '#a08a70', '#e8e0d4', { face: '#8a7660', muzzle: '#5a4a3a', legs: '#9a8670', hoof: '#7a6a58', tailUnder: '#f4f0ea' }),
      shape: { height: 0.2, length: 0.16, width: 0.065, depth: 0.075, neck: 0.05, neckAngle: 50, head: 0.09, headSize: 0.045, headAngle: 25, snout: 0.7, ear: 0.11, earW: 0.03, earTilt: 0.2, tail: 0, tailPuff: 0.035, legR: 0.012, legH: 1.6, hoofH: 0.01, hock: 0.25, paw: 1.3 } },
  },
  coyote: {
    name: 'Coyote', pelt: 'coyote', meat: ['meat_wild_raw', 1], temper: 'skittish', health: 35, radius: 0.28,
    speeds: { walk: 1.3, trot: 3.5, run: 11 }, gaits: [1.8, 5], senses: { sight: 60, smell: 60, hearing: 1.2, fov: 270 },
    group: [1, 3], biomes: { desert: 2.5, valley: 1.4 }, hours: 'night', zigzag: 0.4, attack: { damage: 7, range: 1.5, cooldown: 1.3 },
    weapons: { best: ['bow', 'repeater'], ok: ['revolver', 'rifle', 'knife'] },
    look: { mask: true, eyeShine: true, tailTip: '#2a2420', colors: C('#6e5a44', '#a08868', '#e2d6c0', { face: '#a08060', muzzle: '#3a2e24', legs: '#a88e6c', tail: '#7e6a52', tailUnder: '#c8b898', earIn: '#d8c4a8' }),
      shape: { height: 0.58, length: 0.5, width: 0.1, depth: 0.12, neck: 0.22, neckAngle: 35, head: 0.24, headSize: 0.075, headAngle: 18, snout: 0.38, ear: 0.1, earW: 0.045, earTilt: 0.15, tail: 0.36, tailR: 0.03, tailAngle: 60, tailBush: 0.9, tuck: 0.3, legR: 0.015, hoofH: 0.02, paw: 1.3, hock: 0.38 } },
  },
  wolf: {
    name: 'Wolf', pelt: 'wolf', meat: ['meat_wild_raw', 2], temper: 'pack', health: 70, radius: 0.35,
    speeds: { walk: 1.5, trot: 4, run: 12.5 }, gaits: [2, 6], senses: { sight: 70, smell: 80, hearing: 1.3, fov: 270 },
    group: [3, 5], biomes: { highland: 1.2, snow: 2 }, hours: 'night', zigzag: 0.2, attack: { damage: 13, range: 1.7, cooldown: 1.4 },
    weapons: { best: ['repeater', 'rifle', 'bow'], ok: ['revolver', 'knife'] },
    look: { mask: true, eyeShine: true, tailTip: '#1e1c1a', colors: C('#3e3c3a', '#7a7672', '#d8d4cc', { face: '#8a8682', muzzle: '#2a2826', legs: '#9a968e', tail: '#55524e', tailUnder: '#b8b2aa' }),
      shape: { height: 0.82, length: 0.68, width: 0.14, depth: 0.17, neck: 0.28, neckAngle: 32, head: 0.3, headSize: 0.1, headAngle: 15, snout: 0.42, ear: 0.11, earW: 0.055, earTilt: 0.15, tail: 0.45, tailR: 0.04, tailAngle: 70, tailBush: 0.8, tuck: 0.25, legR: 0.022, paw: 1.35, hoofH: 0.025, hock: 0.38, mane: 0.6 } },
  },
  bear: {
    name: 'Black bear', pelt: 'bear', meat: ['meat_wild_raw', 4], temper: 'territorial', health: 260, radius: 0.6,
    speeds: { walk: 1.2, trot: 3, run: 10.5 }, gaits: [1.6, 4.5], senses: { sight: 45, smell: 90, hearing: 1, fov: 240 },
    group: [1, 1], biomes: { highland: 0.7 }, hours: 'day', zigzag: 0, attack: { damage: 32, range: 2.2, cooldown: 2 },
    weapons: { best: ['rifle'], ok: ['repeater', 'bow'] },
    look: { eyeShine: true, colors: C('#241c18', '#2e2420', '#2a201c', { face: '#3a2c24', muzzle: '#8a6a4a', legs: '#1e1814', hoof: '#141210', ear: '#241c18', earIn: '#3a2c24' }),
      shape: { height: 1.0, length: 0.85, width: 0.33, depth: 0.33, neck: 0.3, neckAngle: 12, head: 0.36, headSize: 0.17, headAngle: 20, snout: 0.5, ear: 0.07, earW: 0.06, roundEar: true, earTilt: 0.5, tail: 0.05, tailR: 0.04, hump: 1, tuck: 0.05, legR: 0.07, legF: 1.3, legH: 1.4, paw: 1.25, hoofH: 0.04, hock: 0.22, neckThick: 1.35, roll: 2.5, strideScale: 0.85 } },
  },
  turkey: {
    name: 'Turkey', meat: ['meat_bird_raw', 1], temper: 'prey', health: 15, radius: 0.22, small: true, bird: 'ground',
    speeds: { walk: 0.7, trot: 2.5, run: 5.5 }, gaits: [1, 3], senses: { sight: 45, smell: 0, hearing: 1.2, fov: 320 },
    group: [2, 5], biomes: { valley: 1.6, riverbank: 2 }, hours: 'day', zigzag: 0.6,
    weapons: { best: ['bow'], ok: ['revolver', 'shotgun', 'knife'] },
    look: { wattle: true, colors: C('#3e2e20', '#3e2e20', '#2e2218', { head: '#c8604e', beak: '#b8a070', wing: '#5a4a38', wingTip: '#d8d0c0', tail: '#4a3626' }),
      shape: { bird: true, height: 0.75, length: 0.6, width: 0.15, depth: 0.16, neck: 0.2, headSize: 0.045, beak: 0.035, wing: 0.5, chord: 0.25, fan: 0.32, tailLen: 0.32, fanUp: 0.25, legR: 0.012 } },
  },
  hawk: {
    name: 'Red-tailed hawk', temper: 'sky', health: 10, radius: 0.3, small: true, bird: 'sky',
    speeds: { walk: 0, trot: 9, run: 14 }, gaits: [0, 0], senses: { sight: 0, smell: 0, hearing: 0, fov: 0 },
    group: [1, 1], biomes: { valley: 0.5, desert: 0.9, highland: 0.5, riverbank: 0.4 }, hours: 'day',
    weapons: { best: ['bow', 'repeater'], ok: ['revolver', 'rifle', 'shotgun'] },
    look: { colors: C('#5a3e28', '#5a3e28', '#d8c8a8', { head: '#5a4030', beak: '#3a3430', wing: '#5a3e28', wingTip: '#2a1e14', tail: '#9a4a2a' }),
      shape: { bird: true, hook: true, height: 0.42, length: 0.45, width: 0.09, depth: 0.1, neck: 0.06, headSize: 0.045, beak: 0.03, wing: 0.52, chord: 0.24, fan: 0.12, tailLen: 0.2, legR: 0.008, flapRate: 0.8 } },
  },
  crow: {
    name: 'Crow', temper: 'flock', health: 4, radius: 0.15, small: true, bird: 'flock',
    speeds: { walk: 0.4, trot: 7, run: 10 }, gaits: [0.5, 1], senses: { sight: 22, smell: 0, hearing: 1.5, fov: 340 },
    group: [4, 8], biomes: { valley: 1, desert: 0.8, riverbank: 1 }, hours: 'day',
    weapons: { best: [], ok: [] },
    look: { colors: C('#18181c', '#1e1e24', '#141418', { head: '#141418', beak: '#0e0e10', wing: '#1a1a20', wingTip: '#0e0e12', tail: '#141418' }),
      shape: { bird: true, height: 0.3, length: 0.36, width: 0.07, depth: 0.075, neck: 0.05, headSize: 0.035, beak: 0.04, wing: 0.32, chord: 0.15, fan: 0.06, tailLen: 0.15, legR: 0.006, flapRate: 1.3 } },
  },
};
for (const [id, s] of Object.entries(SPECIES)) { s.id = id; s.look.key = id; }

/** Weapon tier for a species: 3 (keeps a perfect pelt), 2 or 1 (ruins it). */
export function weaponTier(species, weaponId) {
  const w = SPECIES[species]?.weapons;
  if (!w || !weaponId) return 1;
  return w.best.includes(weaponId) ? 3 : w.ok.includes(weaponId) ? 2 : 1;
}
/**
 * Pelt quality (1–3) from the animal's natural quality, the killing weapon and how cleanly it died:
 * every extra hit costs a star, so does dying slowly (bleeding out) or to another predator.
 */
export function peltQuality({ natural, species, weaponId, hits = 1, bledOut = false, predator = false }) {
  if (predator) return 1;
  let q = Math.min(natural, weaponTier(species, weaponId));
  if (hits > 1) q -= Math.min(2, hits - 1);
  if (bledOut) q -= 1;
  return Math.max(1, Math.min(3, q));
}

const _v = new THREE.Vector3();
let _seq = 0;

/** One animal: rig, entity (hittable), movement state; Wildlife's AI drives it. */
export class Animal {
  constructor(system, speciesId, position, opts = {}) {
    const g = system.game, S = SPECIES[speciesId];
    this.system = system; this.game = g; this.species = speciesId; this.def = S;
    this.rig = new AnimalRig(S.look, system.material);
    this.object3d = this.rig.object3d;
    this.position = this.object3d.position; this.position.copy(position);
    this.yaw = opts.yaw ?? Math.random() * Math.PI * 2;
    this.velocity = new THREE.Vector3(); this.speed = 0; this.targetSpeed = 0; this.heading = this.yaw;
    this.health = S.health; this.maxHealth = S.health; this.alive = true;
    const rng = opts.rng || Math.random;
    const r = rng(); this.natural = r < NATURAL_ODDS[0] ? 1 : r < NATURAL_ODDS[0] + NATURAL_ODDS[1] ? 2 : 3;
    this.hits = 0; this.lastWeapon = null; this.lastZone = null; this.bleed = 0; this.bledOut = false; this.killedByPredator = false;
    this.awareness = 0; this.state = S.bird === 'sky' ? 'soar' : 'graze'; this.stateT = 0; this.group = opts.group || null;
    this.anim = { speed: 0, gaits: S.gaits, hop: !!S.hop, graze: 0, alert: 0, lookYaw: 0, tailUp: 0, earsBack: 0, crouch: 0, rear: 0, dead: 0, flying: S.bird === 'sky' ? 1 : 0, glide: false };
    this.skinned = false; this.deadT = 0; this.tracks = []; this._printAcc = 0; this._sense = Math.random() * 0.25;
    this.seed = Math.random() * 100;
    this.entity = {
      id: `animal:${speciesId}:${++_seq}`, type: 'animal', faction: S.attack ? 'predator' : 'wildlife', object3d: this.object3d, position: this.position,
      radius: S.radius, height: S.look.shape.height, alive: true, health: this.health, maxHealth: this.maxHealth,
      species: speciesId, animal: this, takeDamage: (info) => this.takeDamage(info),
    };
    for (const m of this.rig.hitboxes) m.userData.entity = this.entity;
    this.object3d.rotation.y = this.yaw;
    g.scene.add(this.object3d);
    g.entities.add(this.entity);
  }

  get isPredator() { return !!this.def.attack; }

  /** Combat calls this (GAME_BIBLE §11 entity.takeDamage). Vital hits hurt twice as much and bleed fast. */
  takeDamage({ amount = 0, zone = 'torso', source = null, weaponId = null, direction = null } = {}) {
    if (!this.alive || !(amount > 0)) return { killed: false };
    if (zone === 'vital') amount *= TUNING.vitalMultiplier;
    this.health -= amount; this.hits++; this.lastWeapon = weaponId || this.lastWeapon; this.lastZone = zone; this.entity.health = Math.max(0, this.health);
    this.bleed = Math.min(TUNING.bleedMax, this.bleed + (zone === 'vital' ? TUNING.bleedVital : TUNING.bleedPerHit)) ;
    this.lastHitDir = direction ? direction.clone() : null;
    this.lastAttacker = source;
    if (this.health <= 0) { this.die({ weaponId, source }); return { killed: true }; }
    this.system.onAnimalHurt?.(this, source);
    return { killed: false };
  }

  /** Death: falls onto its side, becomes a carcass that can be skinned. */
  die({ weaponId = null, source = null, bledOut = false, predator = false } = {}) {
    if (!this.alive) return;
    this.alive = false; this.entity.alive = false; this.entity.health = 0; this.health = 0;
    this._groundY = this.position.y;
    this.bledOut = bledOut; this.killedByPredator = predator;
    this.state = 'dead'; this.deadT = 0; this.speed = 0; this.targetSpeed = 0;
    this.killWeapon = weaponId || this.lastWeapon; this.killer = source;
    this.quality = this.def.pelt ? peltQuality({ natural: this.natural, species: this.species, weaponId: this.killWeapon, hits: Math.max(1, this.hits), bledOut, predator }) : 0;
    this._fallSide = Math.random() < 0.5 ? 1 : -1;
    this.game.events.emit(EVENTS.ANIMAL_KILLED, { species: this.species, quality: this.quality, position: this.position.clone(), weaponId: this.killWeapon, animal: this });
    this.system.onAnimalDied?.(this);
  }

  /** Per-frame pose and placement (AI sets speed/yaw; the system calls this). */
  pose(dt, camDist) {
    const a = this.anim, s = this.def.look.shape;
    a.speed = this.speed;
    if (!this.alive) {
      // topple onto the flank over half a second, then lie still
      this.deadT += dt;
      const k = Math.min(1, this.deadT / 0.55), e = k * k * (3 - 2 * k);
      a.dead = e; a.speed = 0;
      if (!s.bird) { this.object3d.rotation.set(0, this.yaw, 0); this.object3d.rotateZ(this._fallSide * e * Math.PI / 2 * 0.92); this.object3d.position.y = this._groundY + e * s.width * 0.85; }
      else { this.object3d.rotation.set(0, this.yaw, this._fallSide * e * 1.4); this.object3d.position.y = this._groundY ?? this.position.y; a.flying = 0; }
    }
    const lod = this.rig.updateLOD(camDist, this.system.lodBias);
    this.object3d.visible = lod < 3;
    if (lod >= 3) return;
    // far animals animate at a lower rate
    this._animAcc = (this._animAcc || 0) + dt;
    const every = lod === 0 ? 0 : lod === 1 ? 1 / 20 : 1 / 10;
    if (this._animAcc < every) return;
    this.rig.animate(this._animAcc, a); this._animAcc = 0;
  }

  dispose() {
    this.game.entities.remove(this.entity);
    this.rig.dispose();
  }
}
