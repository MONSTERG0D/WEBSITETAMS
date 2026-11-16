import { RNG } from '../../core/utils/rng.js';

/**
 * Horse coats, markings and breeds with seeded variety. resolveHorse(opts) turns
 * { seed, coat, name, breed } into a full description for the mesh builder. Pure logic (unit-tested in Node).
 */
export const TUNING = { sizeSpread: 0.03, markingChance: 0.55, sockChance: 0.35 };

/** body colour, mane/tail colour, point colour (lower legs), pattern. */
export const COATS = Object.freeze({
  bay: { body: ['#6a3a1e', '#7a4424', '#5c321c'], mane: '#1a1210', points: '#1e1612', pattern: 'solid' },
  black: { body: ['#1c1714', '#211a16', '#171310'], mane: '#0e0b0a', points: '#141110', pattern: 'solid' },
  chestnut: { body: ['#8a4a26', '#9a5a2c', '#7a3e1e'], mane: '#7a4220', points: null, pattern: 'solid', flaxen: 0.3 },
  palomino: { body: ['#c8a05a', '#d4ae68', '#bf964e'], mane: '#ece2c8', points: null, pattern: 'solid' },
  dappleGrey: { body: ['#8c8a86', '#9a9792', '#7e7c78'], mane: '#cfcac2', points: '#4a4744', pattern: 'dapple' },
  pinto: { body: ['#6a3a1e', '#2a201a', '#8a4a26'], mane: '#2a1e18', points: null, pattern: 'pinto' },
});
/** scale (overall), build (barrel width), neck, legs (length factor), price band. */
export const BREEDS = Object.freeze({
  mustang: { scale: 0.97, build: 1.0, neck: 1.0, legs: 1.0, speed: 1.0, stamina: 1.05 },
  morgan: { scale: 0.96, build: 1.06, neck: 1.04, legs: 0.97, speed: 0.97, stamina: 1.1 },
  quarter: { scale: 1.0, build: 1.08, neck: 0.97, legs: 1.0, speed: 1.05, stamina: 0.95 },
  thoroughbred: { scale: 1.05, build: 0.94, neck: 1.05, legs: 1.06, speed: 1.12, stamina: 0.9 },
  draft: { scale: 1.12, build: 1.22, neck: 1.08, legs: 0.98, speed: 0.85, stamina: 1.25 },
});

/**
 * @param {{seed?, coat?, name?, breed?}} opts — Juniper (seed 'juniper') is a bay mustang mare with a star.
 * @returns {{seed, name, coat, breed, body, mane, points, pattern, blaze, star, snip, socks: number[], scale, build, neck, legs, speed, stamina, pintoSeed}}
 */
export function resolveHorse(opts = {}) {
  const seed = String(opts.seed ?? opts.name ?? 'horse'), rng = new RNG(`horse:${seed}`);
  const coatName = COATS[opts.coat] ? opts.coat : seed === 'juniper' ? 'bay' : rng.pick(Object.keys(COATS));
  const breedName = BREEDS[opts.breed] ? opts.breed : seed === 'juniper' ? 'mustang' : rng.pick(Object.keys(BREEDS).filter((b) => b !== 'draft'));
  const C = COATS[coatName], Br = BREEDS[breedName];
  const marked = seed === 'juniper' ? true : rng.chance(TUNING.markingChance);
  const face = seed === 'juniper' ? 'star' : marked ? rng.pick(['star', 'blaze', 'blaze', 'snip', 'star']) : 'none';
  const socks = [0, 0, 0, 0].map(() => (rng.chance(TUNING.sockChance) ? rng.pick([0.12, 0.25, 0.4]) : 0));
  if (seed === 'juniper') socks.fill(0), socks[3] = 0.18; // one white hind sock
  const flaxen = C.flaxen && rng.chance(C.flaxen);
  return {
    seed, name: opts.name || (seed === 'juniper' ? 'Juniper' : 'Horse'), coat: coatName, breed: breedName,
    body: rng.pick(C.body), mane: flaxen ? '#d8c08a' : C.mane, points: C.points, pattern: C.pattern,
    face, socks,
    scale: Br.scale * (1 + rng.range(-1, 1) * TUNING.sizeSpread), build: Br.build, neck: Br.neck, legs: Br.legs,
    speed: Br.speed, stamina: Br.stamina, pintoSeed: rng.int(0, 1e6),
  };
}
