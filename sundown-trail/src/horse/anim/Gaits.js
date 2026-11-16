/**
 * Horse gaits with their real footfall patterns (GAME_BIBLE §6 speeds). Each gait gives a stride length per cycle,
 * a duty factor (fraction of the cycle a hoof is on the ground) and each leg's footfall offset in the cycle:
 *   walk   4-beat lateral:  LH 0, LF 0.25, RH 0.5, RF 0.75
 *   trot   2-beat diagonal: RF+LH 0, LF+RH 0.5
 *   canter 3-beat (right lead): LH 0, RH+LF 0.25, RF 0.45, then a moment of suspension
 *   gallop 4-beat (right lead): LH 0, RH 0.12, LF 0.4, RF 0.52, then suspension
 * Leg order everywhere is RF, LF, RH, LH. Pure data and maths (unit-tested in Node).
 */
export const TUNING = {
  speeds: { walk: 2.0, trot: 4.5, canter: 8.0, gallop: 12.5 },
  bands: [[2.5, 3.1], [5.4, 6.4], [9.6, 10.6]], // walk→trot, trot→canter, canter→gallop blend ranges (m/s)
};

export const GAITS = Object.freeze({
  walk: { L: 1.9, duty: 0.62, off: [0.75, 0.25, 0.5, 0.0], liftF: 0.12, liftH: 0.09, bob: 0.014, bobN: 2, pitch: 1.0, neck: 5, neckN: 2, neckPh: 0.75, flex: 6, tail: 4 },
  trot: { L: 2.6, duty: 0.42, off: [0.0, 0.5, 0.5, 0.0], liftF: 0.22, liftH: 0.15, bob: 0.038, bobN: 2, pitch: 1.0, neck: 2, neckN: 2, neckPh: 0.0, flex: 3, tail: 14 },
  canter: { L: 3.4, duty: 0.4, off: [0.45, 0.25, 0.25, 0.0], liftF: 0.27, liftH: 0.2, bob: 0.05, bobN: 1, pitch: 5, neck: 9, neckN: 1, neckPh: 0.35, flex: 5, tail: 26 },
  gallop: { L: 5.2, duty: 0.3, off: [0.52, 0.4, 0.12, 0.0], liftF: 0.3, liftH: 0.25, bob: 0.06, bobN: 1, pitch: 4, neck: 11, neckN: 1, neckPh: 0.5, flex: 7, tail: 38 },
});
export const GAIT_NAMES = Object.freeze(['walk', 'trot', 'canter', 'gallop']);
const KEYS = ['L', 'duty', 'liftF', 'liftH', 'bob', 'bobN', 'pitch', 'neck', 'neckN', 'neckPh', 'flex', 'tail'];

/** Weights of walk/trot/canter/gallop for a speed (m/s). */
export function gaitWeights(speed, out = [0, 0, 0, 0]) {
  out.fill(0);
  const B = TUNING.bands;
  let i = 0;
  while (i < 3 && speed > B[i][1]) i++;
  if (i < 3 && speed > B[i][0]) { const t = (speed - B[i][0]) / (B[i][1] - B[i][0]); out[i] = 1 - t; out[i + 1] = t; } else out[i] = 1;
  return out;
}
/** Shortest signed difference between two phases in [0, 1). */
export const phaseDiff = (a, b) => { let d = (b - a) % 1; if (d > 0.5) d -= 1; if (d <= -0.5) d += 1; return d; };

/** Blended gait parameters (offsets interpolate around the cycle). Writes into `out`. */
export function blendGaits(w, out) {
  out.off = out.off || [0, 0, 0, 0];
  for (const k of KEYS) out[k] = 0;
  let first = -1;
  for (let g = 0; g < 4; g++) {
    if (w[g] <= 0) continue;
    const G = GAITS[GAIT_NAMES[g]];
    for (const k of KEYS) out[k] += G[k] * w[g];
    if (first < 0) { first = g; for (let l = 0; l < 4; l++) out.off[l] = G.off[l]; }
    else for (let l = 0; l < 4; l++) out.off[l] = (out.off[l] + phaseDiff(out.off[l], G.off[l]) * w[g] / (w[first] + w[g]) + 1) % 1;
  }
  out.gait = GAIT_NAMES[w.indexOf(Math.max(...w))];
  return out;
}

/** Is leg `l` in stance at cycle phase `phase` for gait parameters P? Returns [stance, progress 0..1]. */
export function legPhase(P, l, phase) {
  const psi = (phase - P.off[l] + 2) % 1;
  return psi < P.duty ? [true, psi / P.duty, psi] : [false, (psi - P.duty) / (1 - P.duty), psi];
}
