import { EVENTS } from '../../core/Events.js';
import { WORLD } from '../../data/world.js';

/**
 * The music director (Part 12): reads the game every half second and chooses the mood.
 *   dead → death stinger, then silence · enemies fighting you, or predators charging → combat (intensity from how
 *   many, and how hurt you are) · wanted, enemies searching, predators stalking → tension · inside the saloon →
 *   saloon (the piano is in the room) · in town → town by day, night after dark · at the ranch → ranch ·
 *   cantering or galloping → ride · night → night · otherwise explore.
 * A mood must hold for a moment before it changes (combat and death don't wait), combat lingers a few seconds
 * after the last enemy, and winning a fight plays the victory stinger. Missions can force a mood with override().
 * Honor tiers and mission starts get their stingers (dialogue ducks the music bus itself).
 */
export const TUNING = { every: 0.5, hold: 1.5, combatLinger: 6, combatRange: 110, predatorRange: 45, tensionRange: 80, rideSpeed: 7, rideHold: 2, ranchRadius: 100, victoryMin: 2 };

const TIERS = [-60, -20, 20, 60];
const tierOf = (v) => TIERS.filter((t) => v >= t).length;

export class Director {
  constructor(music) {
    this.music = music; this.game = music.game; this.forced = null; this.mood = null; this.intensity = 0.5;
    this._t = 0; this._cand = null; this._candT = 0; this._combatT = 0; this._rideT = 0; this._fought = 0; this._dead = false; this.reason = '';
    const ev = this.game.events;
    // dialogue ducking: the Part 8 dialogue already calls audio.duck(0.6) on the music bus line by line
    ev.on(EVENTS.MISSION_STARTED, () => music.stinger('mission'));
    ev.on(EVENTS.HONOR_CHANGED, ({ value, delta }) => { if (typeof value === 'number' && typeof delta === 'number' && tierOf(value) !== tierOf(value - delta)) music.stinger(delta > 0 ? 'honor_up' : 'honor_down'); });
    ev.on(EVENTS.COMBAT_KILL, ({ target }) => { if (target && target !== this.game.player.entity && this.mood === 'combat') this._fought++; });
    ev.on(EVENTS.PLAYER_RESPAWNED, () => { this._dead = false; this._cand = null; });
  }

  /** Missions: force a mood (null hands control back). */
  override(mood, intensity = null) { this.forced = mood ? { mood, intensity } : null; this._t = 0; }

  update(dt) {
    if ((this._t -= dt) > 0) return;
    this._t = TUNING.every;
    const g = this.game, pl = g.player;
    if (pl.state === 'dead' || g.state === 'dead') {
      if (!this._dead) { this._dead = true; this.music.stinger('death'); this._set('silence', 0, 'dead'); }
      return;
    }
    if (this.forced) { this._set(this.forced.mood, this.forced.intensity ?? this.intensity, 'mission'); return; }
    const [mood, intensity, reason, urgent] = this.choose();
    if (mood !== this._cand) { this._cand = mood; this._candT = 0; }
    this._candT += TUNING.every;
    if (urgent || this._candT >= TUNING.hold || this.mood === null) this._set(mood, intensity, reason);
    else if (mood === this.mood) this._set(mood, intensity, reason);
  }

  /** @returns [mood, intensity, reason, urgent] */
  choose() {
    const g = this.game, pl = g.player, p = pl.position, sky = g.sys('sky'), law = g.sys('law');
    // combat: NPCs fighting Eli, predators charging him
    let foes = 0;
    const fight = g.get('npcs')?.fights?.get(pl.entity);
    if (fight) for (const n of fight) if (!n.dead && !n.surrendered && n.position.distanceTo(p) < TUNING.combatRange) foes++;
    for (const a of g.get('wildlife')?.list || []) if (a.alive && a.isPredator && ['charge', 'attack', 'circle', 'bluff', 'hesitate'].includes(a.state) && a.position.distanceTo(p) < TUNING.predatorRange) foes += a.def.temper === 'territorial' ? 2 : 0.6;
    if (foes > 0) this._combatT = TUNING.combatLinger;
    else this._combatT -= TUNING.every;
    if (foes > 0 || this._combatT > 0) {
      const hurt = pl.health < 40 ? 0.25 : 0;
      return ['combat', Math.min(1, 0.35 + foes * 0.15 + hurt), `${foes.toFixed(1)} foes`, true];
    }
    if (this.mood === 'combat' && this._fought >= 1) { this._fought = 0; this.music.stinger('victory'); }
    this._fought = 0;
    // tension
    let tense = law.isWanted?.() ? 0.6 + 0.15 * (law.level || 1) : 0;
    for (const n of g.get('npcs')?.list || []) if (!n.dead && ['alert', 'search', 'investigate'].includes(n.brain?.state) && n.position.distanceTo(p) < TUNING.tensionRange && g.get('npcs').hostile?.(n, pl.entity)) tense = Math.max(tense, 0.5);
    for (const a of g.get('wildlife')?.list || []) if (a.alive && a.isPredator && a.state === 'stalk' && a.position.distanceTo(p) < 90) tense = Math.max(tense, 0.55);
    if (tense > 0) return ['tension', Math.min(1, tense), 'tension', false];
    // places
    const night = sky.isNight?.() ?? false, zone = g.get('towns')?.zone;
    if (zone?.interior && zone.building === 'saloon') return ['saloon', 0.8, 'saloon', false];
    if (zone?.town === 'ranch') return [night ? 'night' : 'ranch', night ? 0.35 : 0.6, 'ranch', false]; // Part 13: the ranch is a place, not a town
    if (zone) return [night ? 'night' : 'town', night ? 0.4 : 0.6, zone.name || 'town', false];
    const R = WORLD.locations.ranch;
    if (Math.hypot(p.x - R.x, p.z - R.z) < TUNING.ranchRadius) return ['ranch', 0.6, 'ranch', false];
    // riding
    const speed = pl.state === 'mounted' ? pl.horse?.speed || 0 : 0;
    this._rideT = speed > TUNING.rideSpeed ? this._rideT + TUNING.every : 0;
    if (this._rideT >= TUNING.rideHold) return ['ride', Math.min(1, 0.3 + (speed - TUNING.rideSpeed) / 6), 'riding', false];
    if (night) return ['night', 0.4, 'night', false];
    return ['explore', 0.5, 'explore', false];
  }

  _set(mood, intensity, reason) {
    this.reason = reason; this.intensity = intensity;
    if (mood !== this.mood) { this.mood = mood; this.music.setMood(mood, { intensity, from: 'director' }); }
    else this.music.setIntensity(intensity);
  }
}
