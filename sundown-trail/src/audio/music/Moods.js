/**
 * Moods (Part 12, GAME_BIBLE §8 table): key, mode, tempo, meter, progressions, phrase lengths and the parts that
 * play, each with an instrument and the intensity (0–1) it enters at. Degrees are scale steps from the tonic
 * (0 = i/I, 3 = IV, 4 = V, 6 = VII); a 'b' degree string means the chord is borrowed (bII, bVII).
 * Meters: '6/8' = 12 sixteenths a bar, the beat a dotted quarter; '4/4' = 16 sixteenths, the beat a quarter.
 */
export const SCALES = {
  ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
};
/** The main motif: A3 D4 E4 F4 | E4 D4 A3 | C4 D4 (held), as scale steps from D and durations in sixteenths. */
export const MOTIF = {
  steps: [-3, 0, 1, 2, 1, 0, -3, -1, 0],
  rhythm: { '6/8': [4, 2, 2, 4, 4, 2, 6, 6, 18], '4/4': [4, 2, 2, 8, 4, 4, 8, 8, 24] },
};
export const METERS = { '6/8': { ticks: 12, beat: 6 }, '4/4': { ticks: 16, beat: 4 } };

export const MOODS = {
  explore: {
    key: 62, scale: 'dorian', bpm: 72, meter: '6/8', progressions: [[0, 3, 0, 6], [0, 6, 3, 0], [0, 4, 6, 0], [0, 3, 6, 0], [0, 0, 3, 3, 6, 6, 0, 0]],
    phrase: [8, 12], rest: [20, 60], firstRest: [3, 10], melody: { inst: ['harmonica', 'whistle', 'guitar'], oct: 0, density: 0.75 },
    parts: [{ type: 'arp', inst: 'guitar', at: 0, gain: 0.7 }, { type: 'melody', at: 0, gain: 0.55, chance: 0.6 }, { type: 'bass', inst: 'bass', at: 0.45, gain: 0.5, sparse: true }, { type: 'pad', inst: 'pad', at: 0.65, gain: 0.25 }],
  },
  ride: {
    key: 62, scale: 'dorian', bpm: 96, meter: '6/8', progressions: [[0, 6, 3, 0], [0, 0, 6, 6, 3, 3, 4, 4], [0, 3, 6, 4]],
    phrase: [8, 8], rest: [0, 0], melody: { inst: ['fiddle'], oct: 0, density: 1 },
    parts: [{ type: 'strum', inst: 'guitar', at: 0, gain: 0.55 }, { type: 'bass', inst: 'bass', at: 0, gain: 0.6 }, { type: 'gallop', at: 0, gain: 0.55 },
      { type: 'melody', at: 0.25, gain: 0.55 }, { type: 'roll', inst: 'banjo', at: 0.6, gain: 0.35 }, { type: 'pad', inst: 'strings', at: 0.8, gain: 0.18 }],
  },
  town: {
    key: 67, scale: 'ionian', bpm: 104, meter: '4/4', swing: 0.18, progressions: [[0, 3, 4, 0], [0, 5, 3, 4], [0, 0, 3, 3, 0, 4, 0, 0]],
    phrase: [8, 8], rest: [4, 12], melody: { inst: ['whistle', 'fiddle'], oct: 0, density: 0.85 },
    parts: [{ type: 'roll', inst: 'banjo', at: 0, gain: 0.45 }, { type: 'boomchick', inst: 'guitar', at: 0, gain: 0.45 }, { type: 'bass', inst: 'bass', at: 0, gain: 0.5 },
      { type: 'melody', at: 0.3, gain: 0.45, chance: 0.7 }, { type: 'shaker', at: 0.5, gain: 0.3 }],
  },
  saloon: {
    key: 60, scale: 'ionian', bpm: 120, meter: '4/4', swing: 0.12, diegetic: true, progressions: [[0, 5, 1, 4], [0, 3, 0, 4], [0, 0, 3, 3, 0, 4, 0, 4]], sevenths: true,
    phrase: [8, 8], rest: [0, 0], melody: { inst: ['piano'], oct: 1, density: 1, syncopate: true },
    parts: [{ type: 'stride', inst: 'piano', at: 0, gain: 0.55 }, { type: 'melody', at: 0, gain: 0.5 }],
  },
  night: {
    key: 57, scale: 'aeolian', bpm: 60, meter: '6/8', progressions: [[0, 3, 5, 4], [0, 5, 3, 4], [0, 0, 3, 3]], raised7: true,
    phrase: [8, 8], rest: [10, 30], firstRest: [2, 6], melody: { inst: ['harmonica', 'whistle'], oct: 0, density: 0.65 },
    parts: [{ type: 'pad', inst: 'pad', at: 0, gain: 0.32 }, { type: 'melody', at: 0, gain: 0.5 }, { type: 'bass', inst: 'bass', at: 0.6, gain: 0.35, sparse: true }],
  },
  ranch: {
    key: 67, scale: 'ionian', bpm: 84, meter: '4/4', progressions: [[0, 4, 5, 3], [0, 3, 0, 4], [0, 5, 3, 4]],
    phrase: [8, 8], rest: [6, 16], melody: { inst: ['fiddle', 'guitar'], oct: 0, density: 0.8 },
    parts: [{ type: 'arp', inst: 'guitar', at: 0, gain: 0.6 }, { type: 'melody', at: 0, gain: 0.5 }, { type: 'bass', inst: 'bass', at: 0.3, gain: 0.45 }, { type: 'pad', inst: 'strings', at: 0.6, gain: 0.18 }],
  },
  tension: {
    key: 62, scale: 'aeolian', bpm: 90, meter: '4/4', progressions: [[0, 0, 'b1', 0], [0, 'b1', 0, 5]],
    phrase: [8, 8], rest: [0, 0], melody: null,
    parts: [{ type: 'tremolo', inst: 'strings', at: 0, gain: 0.4 }, { type: 'heartbeat', at: 0, gain: 0.55 }, { type: 'pulse', at: 0.5, gain: 0.3 }, { type: 'pad', inst: 'pad', at: 0.3, gain: 0.2 }],
  },
  combat: {
    key: 62, scale: 'phrygian', bpm: 132, meter: '4/4', progressions: [[0, 'b1', 0, 6], [0, 0, 'b1', 'b1', 0, 0, 6, 4]],
    phrase: [8, 8], rest: [0, 0], melody: { inst: ['fiddle'], oct: 0, density: 1 },
    parts: [{ type: 'drums', at: 0, gain: 0.7 }, { type: 'ostinato', inst: 'strings', at: 0, gain: 0.45 }, { type: 'bass', inst: 'bass', at: 0, gain: 0.55, driving: true },
      { type: 'stabs', inst: 'guitar', at: 0.3, gain: 0.5 }, { type: 'melody', at: 0.65, gain: 0.4, chance: 0.6 }, { type: 'tremolo', inst: 'strings', at: 0.8, gain: 0.25, high: true }],
  },
  mission: {
    key: 62, scale: 'aeolian', bpm: 100, meter: '6/8', progressions: [[0, 6, 5, 4], [0, 3, 6, 4]],
    phrase: [8, 8], rest: [0, 0], melody: { inst: ['fiddle'], oct: 0, density: 0.9 },
    parts: [{ type: 'strum', inst: 'guitar', at: 0, gain: 0.5 }, { type: 'bass', inst: 'bass', at: 0, gain: 0.55 }, { type: 'gallop', at: 0, gain: 0.45 }, { type: 'tremolo', inst: 'strings', at: 0.4, gain: 0.25 }, { type: 'melody', at: 0.5, gain: 0.45 }],
  },
  silence: { key: 62, scale: 'dorian', bpm: 72, meter: '6/8', progressions: [[0]], phrase: [1, 1], rest: [0, 0], parts: [] },
};

/** Stingers: short phrases that resolve the motif (victory major, death minor), plus small cues. */
export const STINGERS = {
  victory: { key: 62, scale: 'ionian', bpm: 84, meter: '6/8' },
  death: { key: 62, scale: 'aeolian', bpm: 54, meter: '6/8' },
  honor_up: { key: 67, scale: 'ionian', bpm: 96, meter: '6/8' },
  honor_down: { key: 57, scale: 'aeolian', bpm: 80, meter: '6/8' },
  mission: { key: 62, scale: 'dorian', bpm: 96, meter: '6/8' },
};
