import { SCALES, MOTIF, METERS, MOODS, STINGERS } from './Moods.js';

/**
 * The composer (Part 12): rule-based, generative, bar by bar. Each phrase picks a progression and grows its
 * melody from the main motif — as written, inverted, moved up or down the scale, with its pitches reversed,
 * ornamented with neighbour notes or stretched to twice the length — then answers it with new material built
 * from the motif's rhythmic cells, stepping between chord tones and coming home to the tonic. A memory of recent
 * choices keeps phrases from repeating. Accompaniment parts (arpeggios, gallop strums, banjo rolls, boom-chick,
 * stride piano, pads, tremolo, ostinato, stabs, drums) voice-lead their chords. Output per bar:
 * { chord, rest, events: [{ tick, inst, midi, dur, vel, part, strum? }] } with ticks in sixteenths.
 */
export const TUNING = { memory: 5, melodyRange: [-4, 10], center: { arp: 55, pad: 57, strum: 55, roll: 67, stab: 57, chord: 60 } };

const pick = (r, a) => a[Math.floor(r() * a.length)];
const between = (r, [a, b]) => a + r() * (b - a);

/** Theory helpers for a mood (key, scale). */
export class Theory {
  constructor(def) { this.def = def; this.scale = SCALES[def.scale]; this.key = def.key; }
  /** Scale step → MIDI (octave shift in octaves). */
  midi(deg, oct = 0) { const o = Math.floor(deg / 7), i = deg - o * 7; return this.key + 12 * (o + oct) + this.scale[i]; }
  /** Chord tones as semitone offsets from the key (root first); handles borrowed bII/bVII, raised 7 in minor, sevenths. */
  chord(deg) {
    if (typeof deg === 'string') { const semi = { b1: 1, b6: 8, b7: 10 }[deg] ?? 0; return [semi, semi + 4, semi + 7]; }
    const t = [deg, deg + 2, deg + 4].concat(this.def.sevenths && (deg === 4 || deg === 5 || deg === 1) ? [deg + 6] : []);
    const offs = t.map((d) => this.midi(d) - this.key);
    if (this.def.raised7 && (deg === 4)) offs[1] += 1; // minor key: the V chord is major (leading tone)
    if (this.def.sevenths && (deg === 5 || deg === 1)) offs[1] += 1; // ragtime secondary dominants (VI7, II7)
    return offs;
  }
  /** Is a scale step a chord tone of chord `deg`? */
  isChordTone(step, deg) { const pcs = this.chord(deg).map((o) => ((o % 12) + 12) % 12), pc = (((this.midi(step) - this.key) % 12) + 12) % 12; return pcs.includes(pc); }
  /** Voicing of `n` chord tones near `center`, as close as possible to the previous voicing. */
  voice(deg, n, center, prev = null) {
    const pcs = this.chord(deg).map((o) => (((this.key + o) % 12) + 12) % 12), out = [];
    for (let inv = 0; inv < pcs.length; inv++) for (let base = Math.floor(center / 12) * 12 - 12; base <= center + 12; base += 12) {
      const v = []; let last = -Infinity;
      for (let k = 0; k < n; k++) { let m = base + pcs[(inv + k) % pcs.length]; while (m <= last) m += 12; v.push(m); last = m; }
      if (v[0] >= center - 9 && v[v.length - 1] <= center + 14) out.push(v);
    }
    if (!out.length) return [center];
    const cost = (v) => (prev ? v.reduce((s, m, i) => s + Math.abs(m - (prev[i] ?? prev[prev.length - 1])), 0) : Math.abs(v[0] - center));
    return out.sort((a, b) => cost(a) - cost(b))[0];
  }
}

/** Rhythmic cells (sixteenths) for answers, by meter. */
const CELLS = {
  '6/8': [[4, 2, 2, 4], [6, 6], [2, 2, 2, 6], [4, 2, 6], [6, 2, 2, 2], [2, 2, 2, 2, 4]],
  '4/4': [[4, 4, 8], [2, 2, 4, 8], [8, 8], [4, 2, 2, 8], [6, 2, 8], [4, 4, 4, 4], [3, 3, 2, 8]],
};
const ENDINGS = { '6/8': [[12], [6, 6], [4, 2, 6]], '4/4': [[16], [8, 8], [4, 4, 8]] };
const RAG = [[3, 3, 2, 3, 3, 2], [3, 3, 2, 4, 4], [2, 1, 3, 2, 4, 4]];

export class Composer {
  /** @param {string} mood @param {() => number} rng */
  constructor(mood, rng) {
    this.mood = mood; this.def = MOODS[mood] || MOODS.explore; this.r = rng; this.T = new Theory(this.def);
    this.meter = METERS[this.def.meter]; this.recent = []; this.bar = 0; this.phraseBar = 0; this.restBars = 0; this.phrase = null;
    this.voicings = {}; this.lastProg = -1; this.lastInst = null;
    const fr = this.def.firstRest; if (fr) this.restSeconds = between(rng, fr);
  }
  /** Seconds per sixteenth for this mood. */
  get tick() { return 60 / this.def.bpm / this.meter.beat; }
  get barSeconds() { return this.tick * this.meter.ticks; }

  /** Composes the next bar. @param {number} intensity 0..1 */
  next(intensity = 0.5) {
    this.bar++;
    if (this.restSeconds > 0) { this.restBars = Math.max(1, Math.round(this.restSeconds / this.barSeconds)); this.restSeconds = 0; }
    if (this.restBars > 0) { this.restBars--; return { rest: true, chord: null, events: [] }; }
    if (this.phraseBar === 0) this._startPhrase();
    const P = this.phrase, b = this.phraseBar, chord = P.chords[b], events = [];
    for (const part of this.def.parts) {
      if (part.at > intensity + 1e-6 || !P.on[part.type + (part.inst || '')]) continue;
      const gen = PARTS[part.type]; if (!gen) continue;
      gen.call(this, events, part, chord, b, P, intensity);
    }
    for (const e of events) { e.vel = Math.max(0.05, Math.min(1, e.vel * (0.9 + this.r() * 0.2) * (part2gain(this.def, e.part)))); }
    this.phraseBar++;
    if (this.phraseBar >= P.bars) { this.phraseBar = 0; if (this.def.rest[1] > 0) this.restSeconds = between(this.r, this.def.rest); }
    return { rest: false, chord, events, phraseBar: b, phraseBars: P.bars };
  }

  _startPhrase() {
    const d = this.def, r = this.r;
    const bars = d.phrase[0] === d.phrase[1] ? d.phrase[0] : pick(r, [d.phrase[0], d.phrase[1]]);
    let pi; do { pi = Math.floor(r() * d.progressions.length); } while (d.progressions.length > 1 && pi === this.lastProg);
    this.lastProg = pi;
    // spread the progression over the phrase (one chord per bar, or each chord held for several bars)
    const prog = d.progressions[pi], chords = Array.from({ length: bars }, (_, i) => prog[prog.length >= bars ? i : Math.floor(i / (bars / prog.length)) % prog.length]);
    const on = {};
    for (const p of d.parts) on[p.type + (p.inst || '')] = p.chance === undefined || r() < p.chance;
    let melody = null, inst = null;
    if (d.melody) {
      const opts = d.melody.inst.filter((i) => i !== this.lastInst);
      inst = pick(r, opts.length ? opts : d.melody.inst); this.lastInst = inst;
      melody = this.melody(bars, chords);
    }
    this.phrase = { bars, chords, melody, inst, on, pattern: Math.floor(r() * 3) };
  }

  // ---------------------------------------------------------------- melody
  /** A phrase of `bars` bars grown from the motif: [{ tick, dur, deg }], ticks from the phrase start. */
  melody(bars, chords) {
    const r = this.r, meter = this.def.meter, TB = this.meter.ticks, base = MOTIF.rhythm[meter];
    const choices = ['orig', 'invert', 'transpose', 'retro', 'ornament'].concat(bars >= 8 ? ['augment'] : []);
    let kind; do { kind = pick(r, choices); } while (this.recent.includes(kind) && this.recent.length < choices.length && r() < 0.85);
    let k = 0; if (kind === 'transpose') { k = pick(r, [1, 2, 3, 4, -1]); }
    this.recent.push(kind === 'transpose' ? kind + k : kind); if (this.recent.length > TUNING.memory) this.recent.shift();
    const A = this.transform(kind, k);
    const used = Math.ceil(A.reduce((s, n) => s + n.dur, 0) / TB);
    const notes = []; let t = 0;
    for (const n of A) { notes.push({ tick: t, dur: n.dur, deg: n.deg }); t += n.dur; }
    t = used * TB;
    if (bars > used) notes.push(...this.answer(bars - used, t, chords, A[A.length - 1].deg));
    // sparseness: drop some short notes (rests breathe), never the last
    const density = this.def.melody.density ?? 1;
    const out = notes.filter((n, i) => i === notes.length - 1 || n.dur >= 4 || r() < density + 0.15);
    if (this.def.melody.syncopate) for (const n of out) if (n.tick % 4 === 0 && n.tick > 0 && r() < 0.35) { n.tick -= 1; n.dur += 1; }
    return out;
  }
  /** Motif transformations: { deg, dur }[] */
  transform(kind, k = 0) {
    const st = MOTIF.steps, rh = MOTIF.rhythm[this.def.meter];
    let n = st.map((s, i) => ({ deg: s, dur: rh[i] }));
    if (kind === 'invert') n = n.map((x) => ({ ...x, deg: -x.deg }));
    else if (kind === 'transpose') n = n.map((x, i) => ({ ...x, deg: x.deg + (i === n.length - 1 ? 0 : k) }));
    else if (kind === 'retro') { const d = st.slice(0, -1).reverse(); n = n.map((x, i) => ({ ...x, deg: i < d.length ? d[i] : 0 })); }
    else if (kind === 'augment') n = n.map((x) => ({ ...x, dur: x.dur * 2 }));
    else if (kind === 'ornament') {
      const o = [];
      for (const x of n) {
        if (x.dur >= 4 && x !== n[n.length - 1] && this.r() < 0.6) { o.push({ deg: x.deg, dur: x.dur - 2 }, { deg: x.deg + 1, dur: 1 }, { deg: x.deg, dur: 1 }); }
        else o.push(x);
      }
      n = o;
    }
    const [lo, hi] = TUNING.melodyRange;
    return n.map((x) => ({ ...x, deg: Math.max(lo, Math.min(hi, x.deg)) }));
  }
  /** New material from the motif's cells, stepping between chord tones and resolving to the tonic. */
  answer(bars, start, chords, from = 0) {
    const r = this.r, TB = this.meter.ticks, cells = this.def.melody?.syncopate && r() < 0.6 ? RAG : CELLS[this.def.meter], out = [];
    let deg = from, t = start;
    for (let b = 0; b < bars; b++) {
      const last = b === bars - 1, cell = last ? pick(r, ENDINGS[this.def.meter]) : pick(r, cells);
      const chord = chords[Math.min(chords.length - 1, Math.floor(t / TB))];
      cell.forEach((dur, i) => {
        const strong = (t % this.meter.beat) === 0, final = last && i === cell.length - 1;
        if (final) deg = 0;
        else if (strong) { // nearest chord tone a step or two away
          const cand = [-2, -1, 1, 2, 3, -3].map((s) => deg + s).filter((d) => d >= TUNING.melodyRange[0] && d <= TUNING.melodyRange[1] && this.T.isChordTone(d, chord));
          deg = cand.length ? pick(r, cand) : deg + pick(r, [-1, 1]);
        } else deg = Math.max(TUNING.melodyRange[0], Math.min(TUNING.melodyRange[1], deg + pick(r, [-1, -1, 1, 1, 2, -2])));
        out.push({ tick: t, dur, deg }); t += dur;
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- stingers
  /** A stinger's notes at its own tempo: { def, events, seconds }. */
  stinger(name) {
    const S = STINGERS[name] || STINGERS.victory, T = new Theory(S), M = METERS[S.meter], ev = [], r = this.r;
    const add = (tick, inst, midi, dur, vel, extra = {}) => ev.push({ tick, inst, midi, dur, vel, part: 'stinger', ...extra });
    const strum = (tick, deg, dur, vel) => T.voice(deg, 4, 55).forEach((m) => add(tick, 'guitar', m, dur, vel, { strum: true }));
    if (name === 'victory' || name === 'mission') {
      const notes = MOTIF.steps.map((s, i) => ({ deg: s, dur: MOTIF.rhythm['6/8'][i] }));
      let t = 0; for (const n of notes.slice(0, name === 'mission' ? 4 : 9)) { add(t, 'fiddle', T.midi(n.deg), Math.min(n.dur, 12), 0.7); t += n.dur; }
      strum(0, 0, 12, 0.6); strum(24, name === 'mission' ? 4 : 3, 12, 0.5); strum(36, 0, 24, 0.7);
      add(0, 'bass', T.midi(0, -2), 12, 0.6); add(36, 'bass', T.midi(0, -2), 24, 0.7);
      if (name === 'mission') for (let i = 0; i < 12; i++) add(i, 'frame_drum', null, 1, 0.2 + i * 0.05);
      return { def: S, events: ev, seconds: endOf(ev) * 60 / S.bpm / M.beat };
    }
    if (name === 'death') {
      const notes = MOTIF.steps.slice(0, 7).map((s, i) => ({ deg: s, dur: MOTIF.rhythm['6/8'][i] }));
      let t = 0; for (const n of notes) { add(t, 'harmonica', T.midi(n.deg), n.dur, 0.6); t += n.dur; }
      T.voice(0, 3, 50).forEach((m) => add(0, 'pad', m, 36, 0.5)); add(0, 'low_drum', null, 1, 0.8); add(24, 'low_drum', null, 1, 0.5);
      add(t, 'harmonica', T.midi(0), 12, 0.5); T.voice(0, 3, 57).forEach((m) => add(t, 'strings', m, 12, 0.35));
      return { def: S, events: ev, seconds: endOf(ev) * 60 / S.bpm / M.beat };
    }
    // honor up / down: a short arpeggio
    const up = name === 'honor_up', degs = up ? [0, 2, 4, 7] : [7, 4, 2, 0];
    degs.forEach((d, i) => add(i * 2, up ? 'guitar' : 'piano', T.midi(d), 6, 0.5));
    add(8, up ? 'whistle' : 'harmonica', T.midi(up ? 7 : 0), 10, 0.45);
    void r;
    return { def: S, events: ev, seconds: endOf(ev) * 60 / S.bpm / M.beat };
  }
}

const endOf = (ev) => ev.reduce((m, e) => Math.max(m, e.tick + e.dur), 0);
function part2gain(def, partType) { const p = def.parts.find((x) => x.type === partType); return p?.gain ?? 1; }

/** Accompaniment and melody part generators (called with `this` = Composer). */
const PARTS = {
  melody(ev, part, chord, b, P) {
    const TB = this.meter.ticks, inst = P.inst, oct = (this.def.melody.oct || 0) + (inst === 'whistle' ? 1 : 0) + (inst === 'guitar' ? 0 : 0);
    for (const n of P.melody) if (n.tick >= b * TB && n.tick < (b + 1) * TB) ev.push({ tick: n.tick - b * TB, inst, midi: this.T.midi(n.deg, oct), dur: n.dur, vel: (n.tick % this.meter.beat === 0 ? 0.75 : 0.6), part: 'melody' });
  },
  arp(ev, part, chord, b, P, intensity) {
    const v = this.voicings.arp = this.T.voice(chord, 4, TUNING.center.arp, this.voicings.arp), TB = this.meter.ticks;
    const pats = this.def.meter === '6/8' ? [[0, 2, 3, 1, 2, 3], [0, 1, 2, 3, 2, 1], [0, 2, 1, 3, 2, 1]] : [[0, 2, 3, 2, 1, 2, 3, 2], [0, 1, 2, 3, 2, 3, 1, 2], [0, 2, 1, 3, 0, 2, 1, 3]];
    const pat = pats[P.pattern % pats.length], step = TB / pat.length;
    pat.forEach((k, i) => { if (intensity < 0.3 && i % 2 === 1 && this.r() < 0.5) return; ev.push({ tick: i * step, inst: part.inst, midi: v[k] ?? v[0], dur: step * 2.5, vel: i === 0 ? 0.7 : 0.5, part: 'arp' }); });
  },
  strum(ev, part, chord) {
    const v = this.voicings.strum = this.T.voice(chord, 4, TUNING.center.strum, this.voicings.strum);
    const hits = this.def.meter === '6/8' ? [[0, 0.8, 1], [3, 0.4, -1], [4, 0.55, 1], [6, 0.7, 1], [9, 0.4, -1], [10, 0.55, 1]] : [[0, 0.8, 1], [6, 0.5, -1], [8, 0.7, 1], [14, 0.5, -1]];
    for (const [t, vel, dir] of hits) for (const m of (dir > 0 ? v : [...v].reverse())) ev.push({ tick: t, inst: part.inst, midi: m, dur: 2.5, vel, part: 'strum', strum: true });
  },
  boomchick(ev, part, chord) {
    const v = this.voicings.chick = this.T.voice(chord, 3, TUNING.center.chord, this.voicings.chick);
    for (const t of [4, 12]) for (const m of v) ev.push({ tick: t, inst: part.inst, midi: m, dur: 2, vel: 0.5, part: 'boomchick', strum: true });
  },
  bass(ev, part, chord) {
    const T = this.T, root = T.midi(0, -2) + (T.chord(chord)[0]), fifth = root + 7, TB = this.meter.ticks;
    const r0 = root < 28 ? root + 12 : root, f0 = fifth > 50 ? fifth - 12 : fifth;
    if (part.driving) { for (let t = 0; t < TB; t += 2) ev.push({ tick: t, inst: 'bass', midi: t === 6 || t === 14 ? r0 + 12 : r0, dur: 1.6, vel: t % 4 === 0 ? 0.8 : 0.55, part: 'bass' }); return; }
    if (part.sparse) { ev.push({ tick: 0, inst: 'bass', midi: r0, dur: TB - 1, vel: 0.6, part: 'bass' }); return; }
    if (this.def.meter === '6/8') { ev.push({ tick: 0, inst: 'bass', midi: r0, dur: 5, vel: 0.75, part: 'bass' }, { tick: 6, inst: 'bass', midi: f0, dur: 5, vel: 0.6, part: 'bass' }); return; }
    const third = r0 + (T.chord(chord)[1] - T.chord(chord)[0]);
    const walk = this.mood === 'town' ? [r0, third, f0, f0 + (this.r() < 0.5 ? 2 : -1)] : [r0, r0, f0, f0];
    walk.forEach((m, i) => ev.push({ tick: i * 4, inst: 'bass', midi: m, dur: 3.5, vel: i % 2 ? 0.55 : 0.75, part: 'bass' }));
  },
  pad(ev, part, chord) {
    const v = this.voicings[part.inst] = this.T.voice(chord, 3, TUNING.center.pad, this.voicings[part.inst]);
    for (const m of v) ev.push({ tick: 0, inst: part.inst, midi: m, dur: this.meter.ticks, vel: 0.5, part: 'pad' });
  },
  roll(ev, part, chord) {
    const v = this.voicings.roll = this.T.voice(chord, 3, TUNING.center.roll, this.voicings.roll), TB = this.meter.ticks, n = this.def.meter === '6/8' ? 6 : 8;
    const order = [2, 1, 0, 2, 1, 0, 2, 1];
    for (let i = 0; i < n; i++) ev.push({ tick: i * (TB / n), inst: part.inst, midi: v[order[i]], dur: 2, vel: i % 3 === 0 ? 0.6 : 0.4, part: 'roll' });
  },
  stride(ev, part, chord) {
    const T = this.T, offs = T.chord(chord), lo = T.midi(0, -1) + offs[0], v = this.voicings.stride = T.voice(chord, offs.length > 3 ? 4 : 3, TUNING.center.chord, this.voicings.stride);
    const bassNotes = [lo < 40 ? lo + 12 : lo, (lo < 40 ? lo + 12 : lo) + 7 - 12];
    ev.push({ tick: 0, inst: 'piano', midi: bassNotes[0], dur: 3, vel: 0.75, part: 'stride' }, { tick: 8, inst: 'piano', midi: bassNotes[1] < 36 ? bassNotes[1] + 12 : bassNotes[1], dur: 3, vel: 0.65, part: 'stride' });
    for (const t of [4, 12]) for (const m of v) ev.push({ tick: t, inst: 'piano', midi: m, dur: 2.5, vel: 0.5, part: 'stride' });
  },
  gallop(ev) {
    const hits = this.def.meter === '6/8' ? [[0, 'frame_drum', 0.8], [3, 'rim', 0.35], [4, 'rim', 0.5], [6, 'frame_drum', 0.65], [9, 'rim', 0.35], [10, 'rim', 0.5]] : [[0, 'frame_drum', 0.8], [6, 'rim', 0.4], [8, 'frame_drum', 0.6], [14, 'rim', 0.4]];
    for (const [t, inst, vel] of hits) ev.push({ tick: t, inst, midi: null, dur: 1, vel, part: 'gallop' });
  },
  shaker(ev) { for (let t = 0; t < this.meter.ticks; t += 2) ev.push({ tick: t, inst: 'shaker', midi: null, dur: 1, vel: t % 4 === 0 ? 0.5 : 0.3, part: 'shaker' }); },
  tremolo(ev, part, chord) {
    const T = this.T, offs = T.chord(chord), base = part.high ? T.midi(0, 1) : T.midi(0, -1);
    for (const o of [offs[0], offs[2]]) ev.push({ tick: 0, inst: 'strings', midi: base + o, dur: this.meter.ticks, vel: 0.45, part: 'tremolo' });
  },
  heartbeat(ev) { for (let t = 0; t < this.meter.ticks; t += 8) ev.push({ tick: t, inst: 'low_drum', midi: null, dur: 1, vel: 0.7, part: 'heartbeat' }, { tick: t + 1.5, inst: 'low_drum', midi: null, dur: 1, vel: 0.45, part: 'heartbeat' }); },
  pulse(ev, part, chord) { const m = this.T.midi(0, -2) + this.T.chord(chord)[0]; for (let t = 0; t < this.meter.ticks; t += 2) ev.push({ tick: t, inst: 'bass', midi: m < 30 ? m + 12 : m, dur: 1, vel: 0.35, part: 'pulse' }); },
  drums(ev, part, chord, b, P, intensity) {
    const TB = this.meter.ticks, fill = b === P.bars - 1;
    for (const [t, vel] of [[0, 1], [6, 0.7], [8, 0.9], [11, 0.55]]) ev.push({ tick: t, inst: 'low_drum', midi: null, dur: 1, vel, part: 'drums' });
    for (let t = 0; t < TB; t += fill && t >= 8 ? 1 : 2) ev.push({ tick: t, inst: 'frame_drum', midi: null, dur: 1, vel: fill && t >= 8 ? 0.3 + (t - 8) * 0.07 : t % 4 === 0 ? 0.45 : 0.3, part: 'drums' });
    if (intensity > 0.5) for (const t of [4, 12]) ev.push({ tick: t, inst: 'rim', midi: null, dur: 1, vel: 0.6, part: 'drums' });
  },
  ostinato(ev, part, chord) {
    const m = this.T.midi(0, -1) + this.T.chord(chord)[0], pat = [0, 0, 12, 0, 0, 12, 0, 7];
    pat.forEach((o, i) => ev.push({ tick: i * 2, inst: 'strings', midi: m + o, dur: 1.4, vel: i % 4 === 0 ? 0.7 : 0.5, part: 'ostinato' }));
  },
  stabs(ev, part, chord) {
    const v = this.voicings.stab = this.T.voice(chord, 3, TUNING.center.stab, this.voicings.stab);
    for (const t of [3, 6, 10, 14]) for (const m of v) ev.push({ tick: t, inst: part.inst, midi: m, dur: 1, vel: 0.65, part: 'stabs', strum: true });
  },
};
