import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { rng, toBuffer } from './synth/Core.js';
import { WEAPON_SOUNDS, IMPACT_SOUNDS, FIGHT_SOUNDS } from './synth/Weapons.js';
import { FOLEY_SOUNDS, SURFACES, GAITS, footstep, hoof } from './synth/Foley.js';
import { CREATURE_SOUNDS } from './synth/Creatures.js';
import { NATURE_SOUNDS } from './synth/Nature.js';
import { UI_SOUNDS, voiceBlip } from './synth/UI.js';

/**
 * The 'sfx' system (Part 11, GAME_BIBLE §8 SFX catalog). Registers every catalog sound and every name the earlier
 * parts already play (`gun_revolver`, `impact_wood`, `focus_in`, …) as aliases of the same buffers, renders all
 * of them during loading in small time slices, and adds the sounds nobody asked for yet: Eli's and nearby
 * townsfolk's footsteps by surface, horse snorts, whinnies and saddle creaks, and gunshot echoes shaped by the
 * land around the shot (a canyon answers in sharp slaps from its walls, mountains roll, a valley thumps once).
 */
export const TUNING = {
  prerenderBudgetMs: 7, footstepVolume: { crouch: 0.3, walk: 0.5, run: 0.75, sprint: 0.95 }, npcFootstepRange: 28,
  echo: { wallRise: 16, dirs: 12, steps: [30, 60, 100, 150, 220], canyonWalls: 4, canyonNear: 80, speed: 343, cell: 24 },
  echoLevel: { canyon: [0.55, 0.38, 0.25], mountain: [0.45, 0.25], valley: [0.22], forest: [0.3] }, reverbEvery: 1,
};

/** name → [generator(r), opts] */
const CATALOG = {};
const add = (table, opts) => { for (const [n, g] of Object.entries(table)) CATALOG[n] = [g, { ...opts }]; };
add(WEAPON_SOUNDS, { priority: 2 });
for (const n of ['dry_fire', 'reload_revolver', 'reload_repeater', 'reload_shotgun', 'reload_rifle', 'reload_bow', 'shell_drop', 'bow_release']) CATALOG[n][1].priority = 1;
for (const n of ['gun_echo_pistol', 'gun_echo_rifle', 'gun_echo_shotgun']) CATALOG[n][1] = { priority: 1, variants: 2 };
CATALOG.bullet_flyby[1] = { priority: 2, variants: 3, pitchVar: 0.12 };
add(IMPACT_SOUNDS, { priority: 1, variants: 3, pitchVar: 0.1 });
add(FIGHT_SOUNDS, { priority: 1, variants: 2, pitchVar: 0.08 });
add(FOLEY_SOUNDS, { priority: 1, variants: 1 });
for (const n of ['coins', 'pickup', 'eat', 'drink', 'door_open', 'door_close', 'saddle_creak']) CATALOG[n][1] = { priority: 1, variants: 2, pitchVar: 0.05 };
CATALOG.cooking_sizzle[1] = { priority: 2, loop: true }; CATALOG.campfire_loop[1] = { priority: 3, loop: true, volume: 0.9 };
add(CREATURE_SOUNDS, { priority: 1, variants: 2, pitchVar: 0.06 });
CATALOG.crickets_loop[1] = { priority: 3, loop: true, bus: 'ambience', spatial: false };
add(NATURE_SOUNDS, { priority: 3, bus: 'ambience', spatial: false, loop: true });
for (const n of ['thunder', 'thunder_close']) CATALOG[n][1] = { priority: 2, bus: 'ambience', spatial: false, variants: 2 };
CATALOG.murmur[1] = { priority: 0, variants: 3, pitchVar: 0.08 }; CATALOG.church_bell[1] = { priority: 2, bus: 'ambience' };
CATALOG.river_loop[1] = { priority: 3, bus: 'ambience', loop: true, spatial: true };
CATALOG.crowd_murmur_loop[1] = { priority: 3, bus: 'ambience', loop: true, spatial: true };
add(UI_SOUNDS, { priority: 2, bus: 'ui', spatial: false });
CATALOG.heartbeat[1] = { priority: 2, bus: 'ui', spatial: false, loop: true };
CATALOG.voice_blip_low = [(r) => voiceBlip(r, 'low'), { priority: 1, variants: 6 }];
CATALOG.voice_blip_mid = [(r) => voiceBlip(r, 'mid'), { priority: 1, variants: 6 }];
CATALOG.voice_blip_high = [(r) => voiceBlip(r, 'high'), { priority: 1, variants: 6 }];
for (const s of SURFACES) {
  CATALOG[`footstep_${s}`] = [(r) => footstep(r, s), { priority: 0, variants: 4, pitchVar: 0.08 }];
  for (const g of GAITS) CATALOG[`hoof_${g}_${s}`] = [(r) => hoof(r, g, s), { priority: 0, variants: 3, pitchVar: 0.07 }];
}

/** Names earlier parts already play → catalog sounds (they share buffers). */
export const ALIASES = {
  gun_revolver: 'revolver_fire', gun_repeater: 'repeater_fire', gun_shotgun: 'shotgun_fire', gun_rifle: 'rifle_fire', gun_bow: 'bow_release',
  impact_dirt: 'bullet_impact_dirt', impact_wood: 'bullet_impact_wood', impact_metal: 'bullet_impact_metal', impact_stone: 'bullet_impact_stone',
  impact_water: 'bullet_impact_water', impact_glass: 'bullet_impact_glass', impact_flesh: 'bullet_impact_flesh', arrow_thunk: 'arrow_hit',
  punch_swing: 'punch_whoosh', punch_whiff: 'punch_whoosh', knife_swing: 'knife_slash',
  focus_in: 'focus_enter', focus_out: 'focus_exit', focus_heartbeat: 'heartbeat', purchase: 'cash_register', pick_up: 'pickup',
  lasso_catch: 'lasso_tighten', skinning: 'skin_cut', sizzle: 'cooking_sizzle', campfire: 'campfire_loop',
  coyote_growl: 'wolf_growl', coyote_howl: 'coyote_yip', crow_death: 'bird_death', turkey_death: 'bird_death', hawk_death: 'bird_death',
  elk_death: 'deer_death', coyote_death: 'wolf_death', deer_buck_death: 'deer_death', deer_doe_death: 'deer_death', hawk_screech: 'bird_hawk',
};
const ECHO_CLASS = { revolver: 'pistol', repeater: 'rifle', rifle: 'rifle', shotgun: 'shotgun' };
const _v = new THREE.Vector3();

export default class SFX extends System {
  constructor(game) {
    super(game);
    this.catalog = Object.keys(CATALOG); this.aliases = ALIASES;
    this.queue = []; this.rendered = 0; this.renderMs = 0; this._envCache = new Map(); this._reverbT = 0;
    this.stats = { echoes: 0, steps: 0 };
  }

  async init() {
    const g = this.game, A = g.audio;
    for (const [name, [gen, opts]] of Object.entries(CATALOG)) {
      A.register(name, (ctx, i = 0) => { const t0 = performance.now(); const b = toBuffer(gen(rng(`${name}#${i}`)), ctx); this.renderMs += performance.now() - t0; this.rendered++; return b; }, opts);
    }
    for (const [alias, target] of Object.entries(ALIASES)) if (A.sounds.has(target)) A.sounds.set(alias, A.sounds.get(target));
    // render everything in the background, the short and common sounds first, the long beds last
    const order = (n) => (CATALOG[n][1].bus === 'ui' ? 0 : n.startsWith('footstep') || n.startsWith('hoof') ? 1 : CATALOG[n][1].loop || n.startsWith('thunder') ? 3 : 2);
    // one task per variation, so no single step blocks a frame for long
    this.queue = [...this.catalog].sort((a, b) => order(a) - order(b)).flatMap((n) => { const v = CATALOG[n][1].variants || 1; return Array.from({ length: v }, (_, i) => [n, v > 1 ? i : null]); });
    const step = () => {
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < TUNING.prerenderBudgetMs) { const [n, i] = this.queue.shift(); try { A.prerender(n, i); } catch (err) { console.error('[sfx] render failed', err); } }
      if (this.queue.length) this._timer = setTimeout(step, 16);
    };
    this._timer = setTimeout(step, 50);
    g.events.on(EVENTS.WEAPON_FIRED, (e) => this._echo(e));
    g.events.on(EVENTS.HORSE_HURT, (e) => this._horseSay(e?.horse || g.get('horses')?.playerHorse, 'horse_hurt'));
    g.events.on(EVENTS.HORSE_CALLED, () => setTimeout(() => this._horseSay(g.get('horses')?.playerHorse, 'horse_whinny', 0.8), 700));
    g.events.on(EVENTS.PLAYER_MOUNTED, ({ horse } = {}) => this._horseSay(horse, 'saddle_creak', 0.8));
    g.events.on(EVENTS.PLAYER_DISMOUNTED, ({ horse } = {}) => this._horseSay(horse, 'saddle_creak', 0.6));
    g.debug?.addTuning('SFX', TUNING);
  }

  /** True once every catalog sound has been rendered. */
  get ready() { return this.queue.length === 0; }

  // ---------------------------------------------------------------- footsteps and horses
  update(dt) {
    const g = this.game, pl = g.player;
    if (pl?.human && !pl.human._sfxSteps) { pl.human._sfxSteps = true; pl.human.onStep = (side, speed) => this._step(pl, side, speed, true); }
    if ((this._scanT = (this._scanT || 0) - dt) <= 0) {
      this._scanT = 1;
      for (const n of g.get('npcs')?.list || []) if (n.human && !n.human._sfxSteps) { n.human._sfxSteps = true; n.human.onStep = (side, speed) => this._step(n, side, speed, false); }
      for (const h of g.get('horses')?.horses || []) if (h.animator && !h.animator._sfxWrapped) {
        h.animator._sfxWrapped = true; const orig = h.animator.play.bind(h.animator);
        h.animator.play = (name, ...rest) => { this._horseAction(h, name); return orig(name, ...rest); };
      }
    }
    // canyon reverb when you stand between walls (towns set 'interior' themselves)
    if ((this._reverbT -= dt) <= 0) {
      this._reverbT = TUNING.reverbEvery;
      if (g.audio.reverbPreset !== 'interior' && !g.get('towns')?.zone) {
        const env = this.envAt(pl.position).kind, want = env === 'canyon' ? 'canyon' : 'outdoor';
        if (g.audio.reverbPreset !== want) g.audio.setReverb(want);
      }
    }
  }
  _step(who, side, speed, isPlayer) {
    const g = this.game, cam = g.camera.position;
    if (!isPlayer && who.position.distanceTo(cam) > TUNING.npcFootstepRange) return;
    const surface = this.surfaceAt(who.position, who.surface);
    const V = TUNING.footstepVolume, vol = who.crouched ? V.crouch : speed > 5.5 ? V.sprint : speed > 2.5 ? V.run : V.walk;
    _v.copy(who.position); _v.y += 0.05;
    g.audio.play(`footstep_${surface}`, { position: _v, volume: vol * (isPlayer ? 1 : 0.8) });
    this.stats.steps++;
  }
  /** Footstep surface at a point: building floors are wood; otherwise terrain, wet ground turns to mud, deep water splashes. */
  surfaceAt(p, collider = null) {
    const g = this.game, T = g.sys('terrain'), W = g.sys('weather');
    if (collider === 'wood' || (g.get('towns')?.zone?.interior)) return 'wood';
    if (collider === 'stone' || collider === 'metal') return 'rock';
    if ((T.getWaterDepth?.(p.x, p.z) || 0) > 0.06) return 'water';
    let s = T.getSurfaceAt?.(p.x, p.z) || 'dirt';
    if ((W.snowCover || 0) > 0.4) s = 'snow';
    else if ((W.wetness || 0) > 0.5 && (s === 'dirt' || s === 'road')) s = 'mud';
    return SURFACES.includes(s) ? s : 'dirt';
  }
  _horseAction(h, name) {
    if (name === 'rear' || name === 'panic') this._horseSay(h, 'horse_whinny');
    else if (name === 'shake' || (name === 'graze' && Math.random() < 0.3) || name === 'stumble') this._horseSay(h, 'horse_snort', 0.7);
  }
  _horseSay(h, sound, vol = 1) {
    if (!h?.position) return;
    _v.copy(h.position); _v.y += 1.6;
    this.game.audio.play(sound, { position: _v, volume: vol });
  }

  // ---------------------------------------------------------------- the land answers gunshots
  /**
   * What surrounds a point: rising ground ("walls") within reach in each direction.
   * @returns {{ kind: 'canyon'|'mountain'|'valley'|'forest'|'interior', walls: Array<{ x, y, z, d }> }}
   */
  envAt(p) {
    if (this.envOverride) return this._fakeEnv(p, this.envOverride);
    const E = TUNING.echo, key = `${Math.round(p.x / E.cell)},${Math.round(p.z / E.cell)}`;
    let env = this._envCache.get(key);
    if (env) return env;
    const g = this.game, T = g.sys('terrain'), y0 = T.getHeightAt(p.x, p.z), walls = [];
    for (let k = 0; k < E.dirs; k++) {
      const a = (k / E.dirs) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      for (const d of E.steps) { const x = p.x + dx * d, z = p.z + dz * d, h = T.getHeightAt(x, z); if (h - y0 > E.wallRise * (d / 60) ** 0.5) { walls.push({ x, y: h, z, d }); break; } }
    }
    const near = walls.filter((w) => w.d <= E.canyonNear).length, biome = T.getBiomeAt?.(p.x, p.z) || 'valley';
    const kind = walls.length >= E.canyonWalls && near >= 2 ? 'canyon' : walls.length >= 2 || biome === 'highland' || biome === 'snow' ? 'mountain' : 'valley';
    env = { kind, walls, biome };
    if (this._envCache.size > 400) this._envCache.clear();
    this._envCache.set(key, env);
    return env;
  }
  /** Test helper: walls around a point for a forced 'canyon' | 'mountain' | 'valley'. */
  _fakeEnv(p, kind) {
    const walls = [], n = kind === 'canyon' ? 6 : kind === 'mountain' ? 3 : 0, d = kind === 'canyon' ? 45 : 180;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; walls.push({ x: p.x + Math.sin(a) * d, y: p.y + 40, z: p.z + Math.cos(a) * d, d }); }
    return { kind, walls, biome: 'valley' };
  }
  _echo({ weaponId, position }) {
    const cls = ECHO_CLASS[weaponId]; if (!cls || !position) return;
    const g = this.game;
    if (g.get('towns')?.zone?.interior && position.distanceTo(g.player.position) < 30) return; // indoors: the room is the echo
    const env = this.envAt(position), L = TUNING.echoLevel[env.kind] || TUNING.echoLevel.valley, E = TUNING.echo, cam = g.camera.position;
    const walls = env.walls.slice().sort((a, b) => a.d - b.d);
    const n = env.kind === 'canyon' ? Math.min(3, walls.length) : env.kind === 'mountain' ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const w = walls[i * Math.max(1, Math.floor(walls.length / n))];
      // the sound travels to the wall and back to the listener
      const src = w ? _v.set(w.x, w.y, w.z) : _v.set(position.x + (Math.random() - 0.5) * 400, position.y + 20, position.z + (Math.random() - 0.5) * 400);
      const path = position.distanceTo(src) + src.distanceTo(cam), direct = position.distanceTo(cam);
      const delay = Math.max(0.15, (path - direct) / E.speed) + (env.kind === 'valley' ? 0.6 + Math.random() * 0.5 : 0);
      g.audio.play(`gun_echo_${cls}`, { position: src.clone(), delay, volume: L[i] ?? L[L.length - 1], pitch: 0.92 + Math.random() * 0.12 });
      this.stats.echoes++;
    }
  }

  dispose() { clearTimeout(this._timer); }
}
