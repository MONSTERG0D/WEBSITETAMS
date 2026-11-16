import { B, UPPER_MASK } from '../rig/Bones.js';
import { compileTrack } from './Curves.js';

/**
 * Keyframed clips for every Human state that isn't generated procedurally (locomotion, recoil, hits and
 * death are procedural in HumanAnimator.js). Keys: [time 0..1, { channel: values }].
 * Channels: bone names → euler degrees [x, y, z]; 'pelvis' → hips offset in metres; 'root' → whole-body
 * rotation in degrees; 'rootPos' → whole-body offset. A channel missing from a key holds its previous value;
 * `sym: true` mirrors right-side channels onto the left when a key leaves the left side out.
 * layer 'base' clips drive the whole body; 'upper' clips override only the bones they list (weighted by UPPER_MASK).
 */
export const TUNING = { defaultFade: 0.22 };

const CLIPS = {
  // ---------- air
  jump: { layer: 'base', dur: 0.55, loop: false, feet: 'fk', fade: 0.08, keys: [
    [0, { pelvis: [0, -0.03, 0], hips: [-4, 0, 0], spine: [-6, 0, 0], chest: [-3, 0, 0], thighR: [40, 0, 4], shinR: [-70, 0, 0], footR: [10, 0, 0], thighL: [-12, 0, -3], shinL: [-15, 0, 0], footL: [-35, 0, 0],
      upperArmR: [-25, 0, 10], lowerArmR: [20, 0, 0], upperArmL: [45, 0, -10], lowerArmL: [35, 0, 0] }],
    [0.4, { pelvis: [0, 0, 0], spine: [-8, 0, 0], thighR: [55, 0, 5], shinR: [-80, 0, 0], footR: [5, 0, 0], thighL: [25, 0, -4], shinL: [-60, 0, 0], footL: [-10, 0, 0],
      upperArmR: [20, 0, 25], lowerArmR: [40, 0, 0], upperArmL: [30, 0, -25], lowerArmL: [40, 0, 0] }],
    [1, { thighR: [42, 0, 5], shinR: [-58, 0, 0], thighL: [30, 0, -5], shinL: [-52, 0, 0], upperArmR: [12, 0, 32], upperArmL: [18, 0, -32] }],
  ] },
  fall: { layer: 'base', dur: 1.4, loop: true, feet: 'fk', fade: 0.3, keys: [
    [0, { spine: [-4, 0, 0], head: [4, 0, 0], thighR: [20, 0, 6], shinR: [-35, 0, 0], footR: [-15, 0, 0], thighL: [10, 0, -6], shinL: [-25, 0, 0], footL: [-10, 0, 0],
      upperArmR: [10, 0, 55], lowerArmR: [25, 0, 0], upperArmL: [15, 0, -50], lowerArmL: [20, 0, 0] }],
    [0.5, { thighR: [12, 0, 6], shinR: [-25, 0, 0], thighL: [22, 0, -6], shinL: [-38, 0, 0], upperArmR: [18, 0, 48], upperArmL: [8, 0, -56] }],
  ] },
  land: { layer: 'base', dur: 0.45, loop: false, feet: 'plant', fade: 0.06, next: 'loco', keys: [
    [0, { pelvis: [0, -0.15, 0.02], spine: [-16, 0, 0], chest: [-6, 0, 0], neck: [8, 0, 0], head: [6, 0, 0],
      upperArmR: [25, 0, 22], lowerArmR: [30, 0, 0], upperArmL: [25, 0, -22], lowerArmL: [30, 0, 0] }],
    [0.35, { pelvis: [0, -0.06, 0.01], spine: [-8, 0, 0], chest: [-2, 0, 0], neck: [3, 0, 0], head: [2, 0, 0], upperArmR: [10, 0, 12], lowerArmR: [18, 0, 0], upperArmL: [10, 0, -12], lowerArmL: [18, 0, 0] }],
    [1, { pelvis: [0, -0.01, 0], spine: [-1, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], upperArmR: [2, 0, 6], lowerArmR: [10, 0, 0], upperArmL: [2, 0, -6], lowerArmL: [10, 0, 0] }],
  ] },
  // ---------- resting
  sit: { layer: 'base', dur: 4, loop: true, feet: 'fk', fade: 0.4, keys: [
    [0, { pelvis: [0, -0.47, 0.06], spine: [-4, 0, 0], chest: [2, 0, 0], thighR: [86, 0, 6], shinR: [-84, 0, 0], footR: [-4, 0, 0], thighL: [86, 0, -6], shinL: [-86, 0, 0], footL: [-2, 0, 0],
      upperArmR: [22, 0, 8], lowerArmR: [48, 0, 0], upperArmL: [24, 0, -8], lowerArmL: [46, 0, 0], head: [-3, 0, 0] }],
  ] },
  sitGround: { layer: 'base', dur: 4, loop: true, feet: 'fk', fade: 0.5, keys: [
    [0, { pelvis: [0, -0.84, 0.12], spine: [-12, 0, 0], chest: [-4, 0, 0], thighR: [72, 0, 20], shinR: [-112, 0, 0], footR: [10, 0, 0], thighL: [70, 0, -18], shinL: [-116, 0, 0], footL: [12, 0, 0],
      upperArmR: [36, 0, 14], lowerArmR: [55, 0, 0], upperArmL: [36, 0, -14], lowerArmL: [58, 0, 0], head: [2, 0, 0] }],
  ] },
  sleep: { layer: 'base', dur: 5, loop: true, feet: 'fk', fade: 0.6, eyes: 'closed', keys: [
    [0, { root: [90, 0, 0], rootPos: [0, 0.11, 0], head: [-14, 8, 0], neck: [-6, 0, 0], upperArmR: [30, 0, -5], lowerArmR: [100, 0, 0], upperArmL: [5, 0, -10], lowerArmL: [12, 0, 0],
      thighR: [4, 0, 4], shinR: [-8, 0, 0], footR: [-25, 0, 0], thighL: [8, 0, -3], shinL: [-14, 0, 0], footL: [-28, 0, 0] }],
  ] },
  hogtied: { layer: 'base', dur: 2.6, loop: true, feet: 'fk', fade: 0.4, keys: [
    [0, { root: [0, 0, -90], rootPos: [0, 0.17, 0], spine: [8, 0, 0], neck: [10, 0, 0], head: [6, 0, 0],
      thighR: [-15, 0, 0], shinR: [-115, 0, 0], footR: [-40, 0, 0], upperArmR: [-50, 0, -12], lowerArmR: [70, 0, 0], handR: [0, 0, 0] }],
    [0.5, { spine: [13, 0, 0], neck: [16, 0, 0], thighR: [-24, 0, 0], shinR: [-104, 0, 0], upperArmR: [-56, 0, -10] }],
  ], sym: true },
  // ---------- work
  skin: { layer: 'base', dur: 2.4, loop: true, feet: 'fk', fade: 0.4, keys: [
    [0, { pelvis: [0, -0.44, 0.06], thighR: [-5, 0, 4], shinR: [-95, 0, 0], footR: [-50, 0, 0], thighL: [74, 0, -8], shinL: [-80, 0, 0], footL: [6, 0, 0],
      spine: [-28, 0, 0], chest: [-14, 0, 0], neck: [4, 0, 0], head: [-20, 0, 0],
      upperArmR: [55, 0, 5], lowerArmR: [40, 0, 0], handR: [-10, 0, 0], upperArmL: [45, 0, -10], lowerArmL: [50, 0, 0] }],
    [0.5, { upperArmR: [70, 0, 4], lowerArmR: [18, 0, 0], chest: [-16, 4, 0] }],
  ] },
  cook: { layer: 'base', dur: 3, loop: true, feet: 'fk', fade: 0.4, keys: [
    [0, { pelvis: [0, -0.59, 0.08], thighR: [100, 0, 15], shinR: [-135, 0, 0], footR: [35, 0, 0], thighL: [100, 0, -15], shinL: [-135, 0, 0], footL: [35, 0, 0],
      spine: [-25, 0, 0], chest: [-10, 0, 0], head: [-15, 0, 0], upperArmR: [45, 0, 10], lowerArmR: [55, 0, 0], upperArmL: [40, 0, -12], lowerArmL: [45, 0, 0] }],
    [0.25, { upperArmR: [55, 10, 5] }], [0.5, { upperArmR: [47, 0, -1] }], [0.75, { upperArmR: [38, -10, 8] }],
  ] },
  // ---------- horse (Part 5 drives the body onto the saddle)
  mount: { layer: 'base', dur: 1.3, loop: false, feet: 'fk', fade: 0.15, next: 'ride', keys: [
    // the horse system moves the body from the ground to the saddle; these keys only move the limbs
    [0, {}],
    [0.22, { thighL: [78, 0, -12], shinL: [-95, 0, 0], footL: [10, 0, 0], upperArmR: [100, 0, 12], lowerArmR: [35, 0, 0], upperArmL: [95, 0, -14], lowerArmL: [40, 0, 0], spine: [-10, 0, 0] }],
    [0.5, { thighL: [55, 0, -14], shinL: [-75, 0, 0], thighR: [-30, 0, 45], shinR: [-35, 0, 0], spine: [-18, 0, 0], upperArmR: [80, 0, 8], upperArmL: [80, 0, -10] }],
    [0.75, { thighR: [35, 0, 50], shinR: [-60, 0, 0], thighL: [60, 0, -32], shinL: [-75, 0, 0], spine: [-10, 0, 0], upperArmR: [45, 0, 8], upperArmL: [45, 0, -8], lowerArmR: [55, 0, 0], lowerArmL: [55, 0, 0] }],
    [1, { hips: [5, 0, 0], thighR: [62, 0, 38], shinR: [-80, 0, 0], footR: [12, 0, 0], thighL: [62, 0, -38], shinL: [-80, 0, 0], footL: [12, 0, 0], spine: [-6, 0, 0], upperArmR: [32, 0, 6], lowerArmR: [62, 0, 0], upperArmL: [32, 0, -6], lowerArmL: [62, 0, 0] }],
  ] },
  ride: { layer: 'base', dur: 1, loop: true, feet: 'fk', fade: 0.25, keys: [
    [0, { hips: [5, 0, 0], thighR: [62, 0, 38], shinR: [-80, 0, 0], footR: [12, 0, 0], spine: [-6, 0, 0], chest: [-2, 0, 0],
      upperArmR: [32, 0, 6], lowerArmR: [62, 0, 0], handR: [-8, 0, 0], fingersR: [0, 0, -60] }],
  ], sym: true },
  dismount: { layer: 'base', dur: 1.1, loop: false, feet: 'fk', fade: 0.12, next: 'loco', keys: [
    [0, { hips: [5, 0, 0], thighR: [62, 0, 38], shinR: [-80, 0, 0], thighL: [62, 0, -38], shinL: [-80, 0, 0], spine: [-6, 0, 0], upperArmR: [32, 0, 6], lowerArmR: [62, 0, 0], upperArmL: [32, 0, -6], lowerArmL: [62, 0, 0] }],
    [0.35, { thighR: [-20, 0, 50], shinR: [-50, 0, 0], thighL: [50, 0, -20], shinL: [-70, 0, 0], upperArmR: [80, 0, 10], upperArmL: [80, 0, -10], spine: [-12, 0, 0] }],
    [0.7, { thighR: [10, 0, 6], shinR: [-30, 0, 0], thighL: [30, 0, -6], shinL: [-50, 0, 0], spine: [-10, 0, 0], upperArmR: [20, 0, 15], upperArmL: [25, 0, -15], lowerArmR: [30, 0, 0], lowerArmL: [30, 0, 0] }],
    [1, { hips: [0, 0, 0], thighR: [0, 0, 0], shinR: [0, 0, 0], thighL: [0, 0, 0], shinL: [0, 0, 0], spine: [0, 0, 0], upperArmR: [0, 0, 6], upperArmL: [0, 0, -6], lowerArmR: [10, 0, 0], lowerArmL: [10, 0, 0] }],
  ] },
  // ---------- upper body
  aimPistol: { layer: 'upper', dur: 2, loop: true, fade: 0.16, keys: [
    [0, { shoulderR: [0, 8, 0], upperArmR: [86, 0, -4], lowerArmR: [4, 0, 0], handR: [-4, 0, 0], fingersR: [0, 0, -75], neck: [0, -4, 0], head: [0, -4, -4],
      upperArmL: [8, 0, -8], lowerArmL: [25, 0, 0] }],
  ] },
  aimRifle: { layer: 'upper', dur: 2, loop: true, fade: 0.2, keys: [
    [0, { upperArmR: [58, 0, 30], lowerArmR: [88, 0, 0], handR: [0, 0, -10], fingersR: [0, 0, -70], upperArmL: [72, 0, 30], lowerArmL: [26, 0, 0], fingersL: [0, 0, 60],
      neck: [0, -6, 0], head: [-4, 0, -8] }],
  ] },
  aimBow: { layer: 'upper', dur: 2, loop: true, fade: 0.25, keys: [
    [0, { chest: [0, -15, 0], head: [0, 12, 0], upperArmL: [88, 0, 4], lowerArmL: [0, 0, 0], fingersL: [0, 0, 70], upperArmR: [88, 0, 14], lowerArmR: [150, 0, 0], fingersR: [0, 0, -40] }],
  ] },
  reload: { layer: 'upper', dur: 1.6, loop: false, fade: 0.15, next: 'resume', keys: [
    [0, { upperArmR: [40, 0, -12], lowerArmR: [85, 0, 0], handR: [0, 40, 0], fingersR: [0, 0, -70], upperArmL: [35, 0, 22], lowerArmL: [92, 0, 0], neck: [-18, 0, 0], head: [-10, 0, 0] }],
    [0.22, { upperArmL: [-5, 0, -12], lowerArmL: [40, 0, 0] }],
    [0.42, { upperArmL: [35, 0, 22], lowerArmL: [95, 0, 0] }],
    [0.62, { upperArmL: [-5, 0, -12], lowerArmL: [40, 0, 0] }],
    [0.82, { upperArmL: [35, 0, 22], lowerArmL: [95, 0, 0], handR: [0, 40, 0] }],
    [1, { upperArmR: [60, 0, -6], lowerArmR: [40, 0, 0], handR: [0, 0, 0], upperArmL: [10, 0, -8], lowerArmL: [25, 0, 0], neck: [0, 0, 0], head: [0, 0, 0] }],
  ] },
  holster: { layer: 'upper', dur: 0.55, loop: false, fade: 0.08, next: 'none', keys: [
    [0, { upperArmR: [60, 0, 0], lowerArmR: [20, 0, 0], fingersR: [0, 0, -75] }],
    [0.55, { upperArmR: [-8, 0, 12], lowerArmR: [25, 0, 0], handR: [0, 0, 0], fingersR: [0, 0, -40] }],
    [1, { upperArmR: [0, 0, 6], lowerArmR: [12, 0, 0], fingersR: [0, 0, -15] }],
  ] },
  draw: { layer: 'upper', dur: 0.36, loop: false, fade: 0.05, next: 'aimPistol', keys: [
    [0, { upperArmR: [-8, 0, 12], lowerArmR: [25, 0, 0], fingersR: [0, 0, -60], shoulderR: [0, 0, 0] }],
    [0.45, { upperArmR: [42, 0, 4], lowerArmR: [40, 0, 0] }],
    [1, { shoulderR: [0, 8, 0], upperArmR: [86, 0, -4], lowerArmR: [4, 0, 0], handR: [-4, 0, 0], fingersR: [0, 0, -75] }],
  ] },
  wave: { layer: 'upper', dur: 2, loop: false, fade: 0.15, next: 'none', keys: [
    [0, { upperArmR: [0, 0, 6], lowerArmR: [10, 0, 0], head: [0, 0, 0] }],
    [0.18, { upperArmR: [20, 0, 148], lowerArmR: [30, 0, 0], head: [2, 0, 3] }],
    [0.3, { lowerArmR: [30, 0, 24] }], [0.45, { lowerArmR: [30, 0, -22] }], [0.6, { lowerArmR: [30, 0, 24] }], [0.74, { lowerArmR: [30, 0, -18] }],
    [0.88, { upperArmR: [10, 0, 40], lowerArmR: [30, 0, 0] }],
    [1, { upperArmR: [0, 0, 6], lowerArmR: [10, 0, 0], head: [0, 0, 0] }],
  ] },
  talk: { layer: 'upper', dur: 3.2, loop: true, fade: 0.3, jaw: 'talk', keys: [
    [0, { upperArmR: [12, 0, 6], lowerArmR: [45, 0, 0], handR: [0, -20, 0], upperArmL: [6, 0, -6], lowerArmL: [20, 0, 0], head: [2, 4, 0] }],
    [0.3, { upperArmR: [18, 0, 10], lowerArmR: [62, 0, 0], handR: [10, -30, 0], head: [-3, -2, 1] }],
    [0.6, { upperArmR: [10, 0, 4], lowerArmR: [40, 0, 0], handR: [0, -15, 0], upperArmL: [10, 0, -10], lowerArmL: [35, 0, 0], head: [3, 6, -2] }],
    [0.85, { upperArmR: [14, 0, 8], lowerArmR: [50, 0, 0], upperArmL: [6, 0, -6], lowerArmL: [22, 0, 0], head: [0, 2, 1] }],
  ] },
  carry: { layer: 'upper', dur: 1, loop: true, fade: 0.3, keys: [
    [0, { chest: [-6, 0, 0], upperArmR: [110, 0, 20], lowerArmR: [100, 0, 0], fingersR: [0, 0, -60], upperArmL: [0, 0, -8], lowerArmL: [15, 0, 0] }],
  ] },
  punch: { layer: 'upper', dur: 0.55, loop: false, fade: 0.06, next: 'block', keys: [
    [0, { upperArmR: [55, 0, 25], lowerArmR: [125, 0, 0], upperArmL: [60, 0, -25], lowerArmL: [125, 0, 0], fingersR: [0, 0, -90], fingersL: [0, 0, 90], chest: [0, 0, 0], spine: [0, 0, 0] }],
    [0.22, { upperArmR: [88, 0, -8], lowerArmR: [8, 0, 0], chest: [0, 22, 0], spine: [-6, 10, 0], upperArmL: [60, 0, -30], lowerArmL: [130, 0, 0] }],
    [0.48, { upperArmR: [58, 0, 24], lowerArmR: [122, 0, 0], chest: [0, 2, 0], spine: [0, 1, 0] }],
    [1, { upperArmR: [60, 0, 18], lowerArmR: [128, 0, 0], upperArmL: [62, 0, -18], lowerArmL: [128, 0, 0], chest: [-6, 0, 0], spine: [0, 0, 0] }],
  ] },
  // Added in Part 7: hands up (surrender, arrest) and cowering with arms over the head (play over crouchIdle)
  surrender: { layer: 'upper', dur: 2.4, loop: true, fade: 0.3, sym: true, keys: [
    [0, { upperArmR: [128, 0, 42], lowerArmR: [62, 0, 0], handR: [-10, 0, 0], fingersR: [0, 0, -10], chest: [-4, 0, 0], neck: [6, 0, 0], head: [4, 0, 0] }],
    [0.5, { upperArmR: [124, 0, 44], lowerArmR: [58, 0, 0], chest: [-3, 0, 0], head: [6, 0, 0] }],
  ] },
  cower: { layer: 'upper', dur: 1.6, loop: true, fade: 0.25, sym: true, keys: [
    [0, { upperArmR: [118, 0, 26], lowerArmR: [132, 0, 0], handR: [0, 0, 0], fingersR: [0, 0, -60], spine: [14, 0, 0], chest: [16, 0, 0], neck: [22, 0, 0], head: [14, 0, 0] }],
    [0.5, { upperArmR: [114, 0, 28], lowerArmR: [128, 0, 0], chest: [18, 0, 0], head: [16, 0, 0] }],
  ] },
  block: { layer: 'upper', dur: 1.5, loop: true, fade: 0.12, keys: [
    [0, { upperArmR: [62, 0, 18], lowerArmR: [130, 0, 0], upperArmL: [62, 0, -18], lowerArmL: [130, 0, 0], fingersR: [0, 0, -90], fingersL: [0, 0, 90], neck: [-10, 0, 0], chest: [-6, 0, 0], spine: [0, 0, 0] }],
    [0.5, { upperArmR: [64, 0, 17], upperArmL: [60, 0, -19], chest: [-7, 0, 0] }],
  ] },
};

/** Bible states and where each one lives. */
export const LOCO_STATES = Object.freeze(['idle', 'walk', 'run', 'sprint', 'crouchIdle', 'crouchWalk']);
export const PROCEDURAL_STATES = Object.freeze(['fire', 'hit', 'death']);
export const ALL_STATES = Object.freeze(['idle', 'walk', 'run', 'sprint', 'crouchIdle', 'crouchWalk', 'jump', 'fall', 'land', 'aimPistol', 'aimRifle', 'aimBow', 'fire', 'reload', 'holster', 'draw',
  'punch', 'block', 'hit', 'death', 'mount', 'dismount', 'ride', 'sit', 'talk', 'wave', 'carry', 'hogtied', 'skin', 'cook', 'sleep', 'surrender', 'cower']);

const mirrorName = (n) => (n.endsWith('R') ? n.slice(0, -1) + 'L' : n.endsWith('L') ? n.slice(0, -1) + 'R' : n);
const mirrorVal = (ch, v) => (ch === 'pelvis' || ch === 'rootPos' ? [-v[0], v[1], v[2]] : [v[0], -v[1], -v[2]]);

/** Compiles a clip definition into Hermite tracks. `mirror` swaps left and right (e.g. a left jab). */
/** `bones` maps channel names to bone indices (the human skeleton by default; horses pass their own). */
export function compileClip(name, def, mirror = false, bones = B, mask = UPPER_MASK) {
  const keys = def.keys.map(([t, ch]) => {
    const out = { ...ch };
    if (def.sym) for (const [k, v] of Object.entries(ch)) if (k.endsWith('R') && bones[k] !== undefined && !(mirrorName(k) in ch)) out[mirrorName(k)] = mirrorVal(k, v);
    if (!mirror) return [t, out];
    const m = {};
    for (const [k, v] of Object.entries(out)) m[mirrorName(k)] = mirrorVal(k, v);
    return [t, m];
  });
  const channels = new Set();
  for (const [, ch] of keys) for (const k of Object.keys(ch)) channels.add(k);
  const tracks = [];
  for (const chName of channels) {
    const times = [], values = [];
    let last = null;
    for (const [t, ch] of keys) {
      const v = ch[chName] ?? last ?? (chName === 'pelvis' || chName === 'rootPos' ? [0, 0, 0] : [0, 0, 0]);
      last = v; times.push(t); values.push(v);
    }
    // looping clips: a key at t = 1 duplicates the first; drop it so the wrap is seamless
    if (def.loop && times.length > 1 && times[times.length - 1] >= 1) { times.pop(); values.pop(); }
    const kind = chName === 'pelvis' ? 'pelvis' : chName === 'root' ? 'root' : chName === 'rootPos' ? 'rootPos' : 'bone';
    if (kind === 'bone' && bones[chName] === undefined) throw new Error(`clip ${name}: unknown bone ${chName}`);
    tracks.push({ kind, bone: kind === 'bone' ? bones[chName] : -1, name: chName, track: compileTrack(times, values, !!def.loop), mask: kind === 'bone' ? (mask[chName] ?? 1) : 1 });
  }
  return {
    name, layer: def.layer || 'base', dur: def.dur, loop: !!def.loop, feet: def.feet || 'plant', fade: def.fade ?? TUNING.defaultFade,
    next: def.next || null, eyes: def.eyes || null, jaw: def.jaw || null, tracks,
    hasRoot: tracks.some((t) => t.kind === 'root' || t.kind === 'rootPos'),
  };
}

/** Every compiled clip, plus mirrored variants with an 'L' suffix for the asymmetric upper-body ones. */
export const COMPILED = (() => {
  const out = {};
  for (const [name, def] of Object.entries(CLIPS)) out[name] = compileClip(name, def);
  for (const name of ['punch', 'wave', 'aimPistol', 'draw', 'holster', 'mount', 'dismount']) out[`${name}L`] = compileClip(`${name}L`, CLIPS[name], true);
  return out;
})();
export { CLIPS };
