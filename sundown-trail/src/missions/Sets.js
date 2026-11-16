import * as THREE from 'three';
import { WORLD } from '../data/world.js';
import { PropBuilder } from '../world/props/Kit.js';
import { buildBuilding } from '../town/Buildings.js';
import { tent, firewood } from '../town/Outposts.js';
import { crate, barrel, rng } from '../world/props/Builders.js';

/**
 * Permanent set dressing the story needs (Part 15), built once with the Part 9 western kit:
 *  Blackstone Estate   Judge Crane's two-storey white house with a balcony, inside the Part 3 fence, and the brick
 *                      deed vault beside it (mission 7's outlaw path burns it)
 *  Cinder Boys hideout tents round a fire ring, a woodpile, crates and barrels in the canyon (mission 5)
 * Missions find them through missions.sets: { vault, house, campFire }.
 */
export const TUNING = { houseW: 15, houseD: 11 };

export function buildSets(game) {
  const towns = game.get('towns'), T = game.sys('terrain'); if (!towns?.kit || !T?.getHeightAt) return null;
  const out = { group: new THREE.Group(), colliders: [] }; out.group.name = 'Story sets';
  const B = new PropBuilder(towns.kit), R = rng(1899 ^ 0x51ab);
  const flat = (x, z, rad = 50) => { const n = new THREE.Vector3(); for (let r = 0; r <= rad; r += 3) for (let a = 0; a < 6.28; a += r ? 3 / r : 7) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; let ok = true; for (const [dx, dz] of [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]]) { T.getNormalAt?.(px + dx, pz + dz, n); if (n.y < 0.95 || T.isWater?.(px + dx, pz + dz)) { ok = false; break; } } if (ok && (T.getRoadInfo?.(px, pz)?.distance ?? 99) > 10) return new THREE.Vector3(px, T.getHeightAt(px, pz), pz); } return new THREE.Vector3(x, T.getHeightAt(x, z), z); };
  const lowest = (p, w, d, yaw) => { let lo = Infinity; const c = Math.cos(yaw), s = Math.sin(yaw); for (const [a, b] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) lo = Math.min(lo, T.getHeightAt(p.x + a * c + b * s, p.z - a * s + b * c)); return lo; };
  const highest = (p, w, d, yaw) => { let hi = -Infinity; const c = Math.cos(yaw), s = Math.sin(yaw); for (const [a, b] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) hi = Math.max(hi, T.getHeightAt(p.x + a * c + b * s, p.z - a * s + b * c)); return hi; };
  // ---- the estate: house facing the gate (west), vault to the east
  const E = WORLD.locations.blackstoneEstate, hy = -Math.PI / 2;
  const hp = flat(E.x + 4, E.z - 4, 25); hp.y = highest(hp, TUNING.houseW, TUNING.houseD + 3, hy);
  const house = buildBuilding(B, { id: 'estate_house', kind: 'house', x: hp.x, y: hp.y, z: hp.z, yaw: hy, w: TUNING.houseW, d: TUNING.houseD, stories: 2, paint: 'paintWhite', roof: 'gable', porch: true, balcony: true, windows: 4, chimney: true, door: { x: 0, w: 1.6 } }, towns.signs);
  const drop = hp.y - lowest(hp, TUNING.houseW, TUNING.houseD + 3, hy); if (drop > 0.05) house.local.box('stone', TUNING.houseW + 0.4, drop + 0.3, TUNING.houseD + 3.2, 0, -drop / 2 + 0.05, 1.3);
  const vp = flat(E.x + 30, E.z + 10, 20); vp.y = highest(vp, 6, 5, 0.4);
  const vault = buildBuilding(B, { id: 'estate_vault', kind: 'house', x: vp.x, y: vp.y, z: vp.z, yaw: 0.4, w: 6, d: 5, paint: 'brick', roof: 'flat', porch: false, windows: 0, door: { x: 0, w: 1.2 } }, towns.signs);
  const vdrop = vp.y - lowest(vp, 6, 5, 0.4); if (vdrop > 0.05) vault.local.box('stone', 6.4, vdrop + 0.3, 5.4, 0, -vdrop / 2 + 0.05, 0);
  for (let k = 0; k < 6; k++) { const a = R() * 6.28, r = 9 + R() * 6; barrel(B, T, hp.x + Math.cos(a) * r + 10, hp.z + Math.sin(a) * r, R); }
  out.house = house.front.clone(); out.vault = vault.front.clone().add(new THREE.Vector3(Math.sin(0.4) * 2, 0, Math.cos(0.4) * 2)); out.vault.y = T.getHeightAt(out.vault.x, out.vault.z);
  // ---- the hideout camp
  const H = WORLD.locations.cinderHideout, cp = flat(H.x, H.z, 30);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.6, r = 9 + (k % 2) * 3, x = cp.x + Math.cos(a) * r, z = cp.z + Math.sin(a) * r; tent(B, x, T.getHeightAt(x, z), z, Math.atan2(cp.x - x, cp.z - z)); }
  firewood(B, cp.x + 4, T.getHeightAt(cp.x + 4, cp.z - 5), cp.z - 5, 0.3, 2.2);
  for (let k = 0; k < 7; k++) { const a = R() * 6.28, r = 5 + R() * 9; (R() < 0.5 ? crate : barrel)(B, T, cp.x + Math.cos(a) * r, cp.z + Math.sin(a) * r, R, 1 + Math.floor(R() * 2)); }
  const L = { box: (key, w, h, d, x, y, z, t = {}) => B.box(key, w, h, d, { ...t, x, y, z }) };
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; L.box('stone', 0.32, 0.22, 0.26, cp.x + Math.cos(a) * 0.7, cp.y + 0.1, cp.z + Math.sin(a) * 0.7, { ry: a }); }
  out.campFire = cp.clone();
  B.build(out.group, 'story sets');
  for (const c of B.colliders) out.colliders.push(game.physics.addCollider(c));
  game.scene.add(out.group);
  return out;
}
export function disposeSets(game, sets) { if (!sets) return; sets.group.removeFromParent(); for (const c of sets.colliders) game.physics.removeCollider(c); }
