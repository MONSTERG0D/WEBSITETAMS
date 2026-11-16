import { RNG } from '../../core/utils/rng.js';

/**
 * Western outfit presets per role, with seeded variety. resolveLook(opts) turns
 * { seed, role, outfit, hat, colors, scale } into a full, deterministic look description
 * that the mesh builder consumes. Pure data and logic (no Three.js), so it is unit-tested in Node.
 */
export const TUNING = { heightSpread: 0.035, buildSpread: 0.08 };

const SKIN = ['#f0c8a8', '#e3b48e', '#d6a079', '#c8906a', '#b57b55', '#9c6644', '#82533a', '#6b412c', '#563322'];
const HAIR = ['#1c1410', '#2b1d14', '#3d2a1b', '#55392a', '#6e4a2e', '#8a6239', '#a8814f', '#c4a06a', '#7a3a1e', '#8c8a86', '#c9c6c0'];
const P = {
  shirtWork: ['#d8cfb8', '#c9bda0', '#a9a28e', '#8f8a7a', '#b8a888', '#e2dccb', '#9aa3a8', '#7d8a8f', '#a5643f', '#6b7a5a'],
  shirtFine: ['#ece6da', '#e4dccb', '#d9d2c4', '#ffffff', '#cfd2d4'],
  plaid: ['#8e3a2c', '#5a6e8a', '#6a7a4a', '#7a5a3a', '#9a4a36', '#4a5a6e'],
  vest: ['#3a2c22', '#4a3a2a', '#2a2a2c', '#5a4632', '#6a5238', '#45403a', '#5b2e26'],
  coat: ['#5a3f2a', '#6b4a30', '#4a3a2c', '#3a3430', '#7a5a3a', '#4f4636', '#2e2a28', '#6a5a46'],
  duster: ['#6b4a2f', '#7a5a3c', '#5c4430', '#8a6a48', '#4e4434', '#9a7d58'],
  dark: ['#1e1c1c', '#2a2624', '#24262a', '#2e2a26', '#1c2024'],
  pants: ['#4a4038', '#5a4a3a', '#3a3a3c', '#6a5a46', '#2e3440', '#4b4e3d', '#7a6a52', '#3c3026'],
  denim: ['#3a4a62', '#2f3c52', '#4a5a72', '#3e4656'],
  boots: ['#3a2618', '#4a3020', '#2a1e16', '#5a3a24', '#1e1814'],
  hat: ['#3a2c20', '#4a3a2a', '#5a4632', '#2a2420', '#6e5a40', '#8a7458', '#a89070', '#1e1a18', '#c8b48e'],
  bandana: ['#8a2a1e', '#a83a24', '#2a3a6a', '#6a1e1e', '#3a3a3a', '#b88a3a', '#e0d6c0'],
  dress: ['#5a3a46', '#3a4a5e', '#6a5a3e', '#7a4a3a', '#4a5a4a', '#8a7a68', '#5e5470', '#a08a70'],
  apron: ['#e8e0d0', '#d8ccb4', '#c4b89c'],
  blanket: ['#9a3a24', '#6a4a2a', '#2a4a5a', '#b8783a'],
};

/**
 * Role table. Pickers: arrays choose one at random; `chance` keys give a probability.
 * hat styles: flat, cattleman, bowler, gambler, slouch, bonnet, none · coat styles: duster, jacket, sheepskin, frock, poncho, none
 */
export const ROLES = Object.freeze({
  eli: { sex: 'm', fixed: true },
  cowboy: { sex: 'm', hats: ['cattleman', 'cattleman', 'slouch', 'flat'], coats: ['none', 'none', 'jacket', 'duster', 'sheepskin'], shirt: ['work', 'plaid'], vest: 0.55, pants: ['denim', 'pants'], gunbelt: 0.7, bandana: 0.6, gloves: 0.4, chaps: 0.35, beard: ['stubble', 'short', 'mustache', 'none', 'chops'] },
  rancher: { sex: 'm', hats: ['cattleman', 'slouch'], coats: ['none', 'jacket', 'sheepskin'], shirt: ['work', 'plaid', 'plaid'], vest: 0.4, pants: ['denim', 'pants'], gunbelt: 0.25, bandana: 0.3, gloves: 0.5, beard: ['full', 'short', 'mustache', 'stubble'] },
  lawman: { sex: 'm', hats: ['cattleman', 'flat'], coats: ['none', 'jacket', 'frock'], shirt: ['fine', 'work'], vest: 0.9, pants: ['pants'], gunbelt: 1, bandana: 0.1, badge: true, beard: ['mustache', 'mustache', 'short', 'none'] },
  outlaw: { sex: 'm', hats: ['flat', 'slouch', 'cattleman'], coats: ['duster', 'duster', 'none', 'poncho', 'jacket'], shirt: ['work', 'plaid'], vest: 0.5, pants: ['pants', 'denim'], gunbelt: 1, bandana: 0.85, gloves: 0.3, beard: ['stubble', 'full', 'short', 'chops', 'goatee'], grime: 0.5 },
  thug: { sex: 'm', hats: ['bowler', 'cattleman', 'flat'], coats: ['jacket', 'duster', 'none'], shirt: ['work', 'fine'], vest: 0.6, pants: ['pants'], gunbelt: 0.9, bandana: 0.2, palette: 'dark', beard: ['mustache', 'stubble', 'none', 'chops'] },
  gentleman: { sex: 'm', hats: ['bowler', 'gambler', 'none'], coats: ['frock'], shirt: ['fine'], vest: 1, pants: ['stripe', 'pants'], gunbelt: 0, bandana: 0, tie: true, palette: 'dark', beard: ['none', 'mustache', 'goatee', 'chops'] },
  gambler: { sex: 'm', hats: ['gambler', 'flat'], coats: ['frock', 'jacket'], shirt: ['fine'], vest: 1, pants: ['stripe', 'pants'], gunbelt: 0.6, tie: true, beard: ['mustache', 'goatee', 'none'] },
  townsman: { sex: 'm', hats: ['bowler', 'cattleman', 'none', 'slouch'], coats: ['jacket', 'none', 'jacket'], shirt: ['work', 'fine'], vest: 0.6, pants: ['pants', 'stripe'], gunbelt: 0.1, tie: 0.4, beard: ['none', 'mustache', 'full', 'stubble'] },
  worker: { sex: 'm', hats: ['slouch', 'cattleman', 'none'], coats: ['none', 'none', 'sheepskin'], shirt: ['plaid', 'work', 'knit'], vest: 0.2, pants: ['denim', 'pants'], suspenders: 0.6, gloves: 0.6, beard: ['full', 'stubble', 'short'], grime: 0.6 },
  bartender: { sex: 'm', hats: ['none'], coats: ['none'], shirt: ['fine'], vest: 1, pants: ['pants', 'stripe'], apron: true, tie: 0.6, beard: ['mustache', 'mustache', 'chops'] },
  preacher: { sex: 'm', hats: ['flat', 'none'], coats: ['frock'], shirt: ['fine'], vest: 1, pants: ['pants'], palette: 'dark', collar: true, beard: ['none', 'full'] },
  farmer: { sex: 'm', hats: ['slouch', 'none'], coats: ['none', 'none', 'jacket'], shirt: ['work', 'plaid'], vest: 0.2, pants: ['denim'], suspenders: 0.8, beard: ['full', 'full', 'stubble'], grime: 0.4 },
  townswoman: { sex: 'f', hats: ['bonnet', 'none', 'none'], coats: ['none'], dress: true, apron: 0.3, shawl: 0.4 },
  ranchwoman: { sex: 'f', hats: ['cattleman', 'none', 'slouch'], coats: ['none', 'jacket'], dress: 0.5, shirt: ['work', 'plaid'], pants: ['denim', 'pants'], gloves: 0.4, gunbelt: 0.3 },
  marshal: { sex: 'f', hats: ['flat', 'cattleman'], coats: ['duster', 'jacket'], dress: false, shirt: ['fine', 'work'], vest: 0.9, pants: ['pants'], gunbelt: 1, badge: true },
});

const pick = (rng, v) => (Array.isArray(v) ? rng.pick(v) : v);
const roll = (rng, v) => (typeof v === 'number' ? rng.chance(v) : !!v);

/** Eli Rourke: brown duster, flat-brim hat, rust scarf, short beard, gun belt (GAME_BIBLE §4). */
function eliLook() {
  return {
    role: 'eli', sex: 'm', build: 1.02, height: 1.0, age: 0.6, grime: 0.25, eyes: 0,
    skin: '#bf8b62', hair: { style: 'short', color: '#3a281a' }, beard: { style: 'short', color: '#3d2b1d', grey: 0.15 },
    hat: { style: 'flat', color: '#3b2b1f', band: '#20160f' },
    shirt: { color: '#b9ae96', pattern: 'cotton' }, vest: { color: '#3a2c22' },
    coat: { style: 'duster', color: '#6b4a2f' }, pants: { color: '#4a3e34', pattern: 'wool' },
    boots: { color: '#3a2618' }, belt: { color: '#2e2016' }, gunbelt: true, bandana: { color: '#8a3b1e' },
    gloves: null, chaps: null, dress: null, apron: null, shawl: null, badge: false, tie: null, suspenders: null, collar: false,
    face: { jaw: 1.08, chin: 1.05, nose: 1.05, noseLen: 1.0, brow: 1.15, cheek: 1.0, eyeGap: 1.0, lips: 0.95 },
  };
}

/**
 * Full look from createHuman options. Unknown roles fall back to 'townsman'.
 * @param {{seed?, role?, outfit?, hat?, colors?, scale?}} opts
 */
export function resolveLook(opts = {}) {
  const roleName = ROLES[opts.role] ? opts.role : 'townsman';
  if (roleName === 'eli') return applyOverrides(eliLook(), opts);
  const def = ROLES[roleName], rng = new RNG(`human:${opts.seed ?? roleName}`), f = def.sex === 'f';
  const dark = def.palette === 'dark';
  const skin = rng.pick(SKIN);
  const hairColor = rng.chance(0.18) ? rng.pick(HAIR.slice(-2)) : rng.pick(HAIR.slice(0, -2));
  const look = {
    role: roleName, sex: def.sex,
    build: 1 + rng.range(-1, 1) * TUNING.buildSpread + (rng.chance(0.15) ? 0.12 : 0),
    height: (f ? 0.94 : 1) * (1 + rng.range(-1, 1) * TUNING.heightSpread),
    age: rng.range(0.15, 0.95), grime: (def.grime || 0) * rng.range(0.4, 1), eyes: rng.int(0, 3),
    skin,
    hair: { style: f ? rng.pick(['bun', 'long', 'bun', 'braid']) : rng.pick(['short', 'short', 'short', 'long', 'bald']), color: hairColor },
    beard: f ? { style: 'none', color: hairColor } : { style: pick(rng, def.beard || ['none']), color: hairColor, grey: rng.range(0, 0.4) },
    hat: { style: pick(rng, def.hats || ['none']), color: rng.pick(P.hat), band: rng.pick(P.dark) },
    shirt: null, vest: null, coat: null, pants: null,
    boots: { color: rng.pick(P.boots) }, belt: { color: rng.pick(P.boots) },
    gunbelt: roll(rng, def.gunbelt || 0), bandana: roll(rng, def.bandana || 0) ? { color: rng.pick(P.bandana) } : null,
    gloves: roll(rng, def.gloves || 0) ? { color: rng.pick(['#6a4a30', '#8a6a48', '#3a2a1e']) } : null,
    chaps: roll(rng, def.chaps || 0) ? { color: rng.pick(['#5a3a24', '#6e4a2e', '#3e2a1c']) } : null,
    dress: null, apron: null, shawl: null, badge: !!def.badge, collar: !!def.collar,
    tie: roll(rng, def.tie || 0) ? { color: rng.pick(P.dark.concat(['#5a1e1e', '#2a3a5a'])) } : null,
    suspenders: roll(rng, def.suspenders || 0) ? { color: rng.pick(P.boots) } : null,
    face: {
      jaw: rng.range(0.85, 1.15), chin: rng.range(0.85, 1.15), nose: rng.range(0.85, 1.2), noseLen: rng.range(0.9, 1.15),
      brow: rng.range(0.8, 1.2), cheek: rng.range(0.85, 1.15), eyeGap: rng.range(0.95, 1.05), lips: rng.range(0.85, 1.15),
    },
  };
  if (f) { look.face.jaw *= 0.86; look.face.brow *= 0.7; look.face.chin *= 0.9; look.face.nose *= 0.88; look.face.lips *= 1.12; }
  // clothing
  const shirtKind = pick(rng, def.shirt || ['work']);
  look.shirt = shirtKind === 'plaid' ? { color: rng.pick(P.plaid), pattern: 'plaid' }
    : shirtKind === 'fine' ? { color: rng.pick(P.shirtFine), pattern: 'cotton' }
      : shirtKind === 'knit' ? { color: rng.pick(P.shirtWork), pattern: 'knit' } : { color: rng.pick(P.shirtWork), pattern: 'cotton' };
  if (roll(rng, def.vest || 0)) look.vest = { color: dark ? rng.pick(P.dark) : rng.pick(P.vest) };
  const coatStyle = pick(rng, def.coats || ['none']);
  if (coatStyle !== 'none') {
    const list = coatStyle === 'duster' ? P.duster : dark || coatStyle === 'frock' ? P.dark.concat(P.coat.slice(0, 3)) : coatStyle === 'sheepskin' ? ['#8a6a48', '#7a5a3a', '#9a7a52'] : coatStyle === 'poncho' ? P.blanket : P.coat;
    look.coat = { style: coatStyle, color: rng.pick(list) };
  }
  const pantsKind = pick(rng, def.pants || ['pants']);
  look.pants = pantsKind === 'denim' ? { color: rng.pick(P.denim), pattern: 'denim' }
    : pantsKind === 'stripe' ? { color: rng.pick(P.dark.concat(['#3a3a3c', '#4a4038'])), pattern: 'stripe' }
      : { color: dark ? rng.pick(P.dark) : rng.pick(P.pants), pattern: 'wool' };
  const wantsDress = typeof def.dress === 'number' ? rng.chance(def.dress) : !!def.dress;
  if (wantsDress) {
    look.dress = { color: rng.pick(P.dress), pattern: rng.chance(0.4) ? 'calico' : 'cotton' };
    look.shirt = { color: rng.chance(0.5) ? look.dress.color : rng.pick(P.shirtFine), pattern: look.dress.pattern };
    look.pants = null; look.gunbelt = false;
  }
  if (roll(rng, def.apron || 0)) look.apron = { color: rng.pick(P.apron) };
  if (roll(rng, def.shawl || 0)) look.shawl = { color: rng.pick(P.dress.concat(P.blanket)) };
  return applyOverrides(look, opts);
}

/** createHuman's outfit/hat/colors/scale options on top of a look. */
function applyOverrides(look, opts) {
  const o = opts.outfit;
  if (o === 'duster' || o === 'jacket' || o === 'sheepskin' || o === 'frock' || o === 'poncho') look.coat = { style: o, color: look.coat?.color || (o === 'sheepskin' ? '#8a6a48' : '#5a3f2a') };
  else if (o === 'vest') { look.coat = null; look.vest = look.vest || { color: '#3a2c22' }; }
  else if (o === 'shirt') { look.coat = null; }
  if (opts.hat !== undefined) look.hat = { ...look.hat, style: opts.hat || 'none' };
  const c = opts.colors || {};
  const set = (key, field = 'color') => { if (c[key] && look[key]) look[key] = { ...look[key], [field]: c[key] }; };
  ['shirt', 'vest', 'coat', 'pants', 'boots', 'bandana', 'dress', 'gloves'].forEach((k) => set(k));
  if (c.hat) look.hat = { ...look.hat, color: c.hat };
  if (c.hair) { look.hair = { ...look.hair, color: c.hair }; look.beard = { ...look.beard, color: c.hair }; }
  if (c.skin) look.skin = c.skin;
  if (typeof opts.scale === 'number') look.height *= opts.scale;
  if (opts.holsterGrip === false) look.holsterGrip = false; // Added in Part 6: the real revolver model sits in the holster
  return look;
}

/** Stable cache key: two humans with the same key can share geometry. */
export const lookKey = (look) => JSON.stringify(look);
