import { compileClip } from '../../characters/anim/Clips.js';
import { HB } from '../rig/HorseBones.js';

/**
 * Keyframed horse actions (gaits are procedural in HorseAnimator). Channels: horse bone names → euler degrees,
 * 'pelvis' → body offset, 'root'/'rootPos' → whole-horse rotation/offset (used to pivot about the hind or front
 * hooves). feet: 'plant' all four legs on IK, 'hind' only hind legs on IK, 'front' only front legs, 'fk' none.
 */
export const TUNING = {};

const S = (deg) => Math.sin(deg * Math.PI / 180), Cc = (deg) => Math.cos(deg * Math.PI / 180);
/** rootPos for a pitch of `deg` degrees about a hoof line at model z = `pz` (keeps those hooves in place). */
const pivot = (deg, pz) => [0, -(-pz * S(deg)), pz - pz * Cc(deg)];

const DEFS = {
  rear: { dur: 1.8, feet: 'hind', fade: 0.2, keys: [
    [0, { root: [0, 0, 0], rootPos: [0, 0, 0] }],
    [0.28, { root: [42, 0, 0], rootPos: pivot(42, 0.8), neck1: [18, 0, 0], head: [10, 0, 0], forearmR: [55, 0, 0], fcannonR: [-95, 0, 0], forearmL: [70, 0, 0], fcannonL: [-110, 0, 0], tail1: [-25, 0, 0], earR: [-35, 0, 0], earL: [-35, 0, 0] }],
    [0.45, { root: [50, 0, 0], rootPos: pivot(50, 0.8), forearmR: [80, 0, 0], fcannonR: [-110, 0, 0], forearmL: [50, 0, 0], fcannonL: [-90, 0, 0], neck1: [22, 0, 0] }],
    [0.62, { root: [46, 0, 0], rootPos: pivot(46, 0.8), forearmR: [50, 0, 0], fcannonR: [-90, 0, 0], forearmL: [78, 0, 0], fcannonL: [-115, 0, 0] }],
    [1, { root: [0, 0, 0], rootPos: [0, 0, 0], neck1: [0, 0, 0], head: [0, 0, 0], forearmR: [0, 0, 0], fcannonR: [0, 0, 0], forearmL: [0, 0, 0], fcannonL: [0, 0, 0], tail1: [0, 0, 0], earR: [0, 0, 0], earL: [0, 0, 0] }],
  ] },
  panic: { dur: 1.4, feet: 'hind', fade: 0.15, keys: [
    [0, { root: [0, 0, 0], rootPos: [0, 0, 0] }],
    [0.3, { root: [24, 6, 0], rootPos: pivot(24, 0.8), neck1: [20, 15, 0], head: [12, 10, 8], forearmR: [40, 0, 0], fcannonR: [-80, 0, 0], forearmL: [30, 0, 0], fcannonL: [-60, 0, 0], earR: [-40, 0, 0], earL: [-40, 0, 0], tail1: [-30, 0, 0] }],
    [0.55, { root: [18, -6, 0], rootPos: pivot(18, 0.8), neck1: [10, -18, 0], head: [5, -12, -8] }],
    [1, { root: [0, 0, 0], rootPos: [0, 0, 0], neck1: [0, 0, 0], head: [0, 0, 0], forearmR: [0, 0, 0], fcannonR: [0, 0, 0], forearmL: [0, 0, 0], fcannonL: [0, 0, 0], earR: [0, 0, 0], earL: [0, 0, 0], tail1: [0, 0, 0] }],
  ] },
  buck: { dur: 1.2, feet: 'front', fade: 0.15, keys: [
    [0, { root: [0, 0, 0], rootPos: [0, 0, 0] }],
    [0.35, { root: [-18, 0, 0], rootPos: pivot(-18, -0.62), neck1: [-30, 0, 0], head: [-15, 0, 0], thighR: [-35, 0, 0], gaskinR: [-10, 0, 0], hcannonR: [-15, 0, 0], thighL: [-30, 0, 0], gaskinL: [-12, 0, 0], tail1: [-35, 0, 0] }],
    [0.55, { root: [-22, 0, 0], rootPos: pivot(-22, -0.62), thighR: [-50, 0, 0], thighL: [-45, 0, 0] }],
    [1, { root: [0, 0, 0], rootPos: [0, 0, 0], neck1: [0, 0, 0], head: [0, 0, 0], thighR: [0, 0, 0], gaskinR: [0, 0, 0], hcannonR: [0, 0, 0], thighL: [0, 0, 0], gaskinL: [0, 0, 0], tail1: [0, 0, 0] }],
  ] },
  skid: { dur: 0.9, feet: 'plant', fade: 0.12, keys: [
    [0, { root: [0, 0, 0], rootPos: [0, 0, 0] }],
    [0.3, { root: [9, 0, 0], rootPos: pivot(9, 0.8), neck1: [16, 0, 0], head: [12, 0, 0], tail1: [-20, 0, 0], earR: [-20, 0, 0], earL: [-20, 0, 0] }],
    [1, { root: [0, 0, 0], rootPos: [0, 0, 0], neck1: [0, 0, 0], head: [0, 0, 0], tail1: [0, 0, 0], earR: [0, 0, 0], earL: [0, 0, 0] }],
  ] },
  jump: { dur: 0.95, feet: 'fk', fade: 0.08, keys: [
    [0, { root: [14, 0, 0], neck1: [10, 0, 0], forearmR: [60, 0, 0], fcannonR: [-110, 0, 0], forearmL: [65, 0, 0], fcannonL: [-115, 0, 0], thighR: [-20, 0, 0], thighL: [-22, 0, 0], tail1: [-30, 0, 0] }],
    [0.45, { root: [0, 0, 0], neck1: [-8, 0, 0], head: [-6, 0, 0], forearmR: [70, 0, 0], fcannonR: [-125, 0, 0], forearmL: [72, 0, 0], fcannonL: [-128, 0, 0], thighR: [28, 0, 0], hcannonR: [40, 0, 0], thighL: [30, 0, 0], hcannonL: [42, 0, 0] }],
    [0.8, { root: [-10, 0, 0], neck1: [6, 0, 0], head: [0, 0, 0], forearmR: [25, 0, 0], fcannonR: [-20, 0, 0], forearmL: [20, 0, 0], fcannonL: [-15, 0, 0], thighR: [10, 0, 0], hcannonR: [30, 0, 0], thighL: [12, 0, 0], hcannonL: [32, 0, 0], tail1: [-15, 0, 0] }],
    [1, { root: [-6, 0, 0], forearmR: [10, 0, 0], fcannonR: [-5, 0, 0], forearmL: [8, 0, 0], fcannonL: [-5, 0, 0], thighR: [0, 0, 0], hcannonR: [0, 0, 0], thighL: [0, 0, 0], hcannonL: [0, 0, 0] }],
  ] },
  stumble: { dur: 0.85, feet: 'hind', fade: 0.06, keys: [
    [0, { root: [0, 0, 0], rootPos: [0, 0, 0] }],
    [0.3, { root: [-11, 0, 3], rootPos: [0, -0.16, 0.0], neck1: [-28, 0, 0], head: [-14, 0, 0], forearmR: [-15, 0, 0], fcannonR: [-55, 0, 0], forearmL: [10, 0, 0], fcannonL: [-25, 0, 0], earR: [-30, 0, 0], earL: [-30, 0, 0] }],
    [1, { root: [0, 0, 0], rootPos: [0, 0, 0], neck1: [0, 0, 0], head: [0, 0, 0], forearmR: [0, 0, 0], fcannonR: [0, 0, 0], forearmL: [0, 0, 0], fcannonL: [0, 0, 0], earR: [0, 0, 0], earL: [0, 0, 0] }],
  ] },
  graze: { dur: 7, feet: 'plant', fade: 0.6, keys: [
    [0, { neck1: [0, 0, 0], neck2: [0, 0, 0], head: [0, 0, 0] }],
    [0.15, { neck1: [-48, 4, 0], neck2: [-22, 0, 0], head: [-12, 0, 0], jaw: [0, 0, 0] }],
    [0.3, { jaw: [-6, 0, 0] }], [0.4, { jaw: [0, 0, 0], neck1: [-50, -4, 0] }], [0.55, { jaw: [-6, 0, 0] }], [0.65, { jaw: [0, 0, 0] }],
    [0.82, { neck1: [-46, 2, 0], neck2: [-20, 0, 0], head: [-10, 0, 0] }],
    [1, { neck1: [0, 0, 0], neck2: [0, 0, 0], head: [0, 0, 0] }],
  ] },
  shake: { dur: 1.1, feet: 'plant', fade: 0.15, keys: [
    [0, { neck2: [0, 0, 0], head: [0, 0, 0] }],
    [0.2, { neck2: [0, 0, 14], head: [0, 0, 22], earR: [0, 0, 20], earL: [0, 0, 20] }], [0.35, { neck2: [0, 0, -14], head: [0, 0, -24], earR: [0, 0, -20], earL: [0, 0, -20] }],
    [0.5, { neck2: [0, 0, 12], head: [0, 0, 18] }], [0.65, { neck2: [0, 0, -8], head: [0, 0, -12] }],
    [1, { neck2: [0, 0, 0], head: [0, 0, 0], earR: [0, 0, 0], earL: [0, 0, 0] }],
  ] },
};

export const HORSE_CLIPS = Object.fromEntries(Object.entries(DEFS).map(([n, d]) => [n, compileClip(n, d, false, HB, {})]));
export const HORSE_ACTIONS = Object.freeze(Object.keys(DEFS));
