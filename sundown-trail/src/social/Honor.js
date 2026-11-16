import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { HONOR, honorTier } from '../data/honor.js';

/**
 * The 'honor' system (Part 8, GAME_BIBLE §6): value · tier · change(delta, reason) · priceMultiplier().
 * The Bible's honor table is applied by listening to what already happens in the game, so other systems don't
 * need to know about honor:
 *   social:greet (first greeting of a person each day) · social:rob · social:antagonize {fight} ·
 *   npc:died with Eli as the killer (an innocent, a lawman, someone who had surrendered) ·
 *   npc:surrendered followed by letting them go (sparing) · money:changed for a paid bounty ·
 *   Added in Part 8 events for later parts: honor:act {action} for any other row of the table (donating, returning
 *   property, helping a stranger, looting, horse theft, leaving a hogtied person in danger).
 * Every change pulses on screen within a frame (ui.honorPulse) and emits honor:changed {value, delta, reason}.
 */
export const TUNING = { pulseMin: 0.25, spareAfter: 6, spareRange: 45 };

/** Added in Part 8: the event other systems emit for table rows that have no event of their own. */
export const HONOR_ACT = 'honor:act';

export default class Honor extends System {
  constructor(game) {
    super(game);
    this.value = HONOR.start; this.greeted = new Map(); this.spared = new Map(); this.history = []; this._pending = 0; this._t = 0;
  }
  async init() {
    const g = this.game, A = HONOR.actions, pl = () => g.player.entity;
    g.events.on(EVENTS.SOCIAL_GREET, ({ npc }) => {
      if (!npc) return;
      const day = g.sys('sky').day ?? 0, key = npc.id || npc;
      if (this.greeted.get(key) === day) return;
      this.greeted.set(key, day); this.change(A.greetStranger, 'greeted a stranger');
    });
    g.events.on(EVENTS.SOCIAL_ROB, () => this.change(A.rob, 'robbery'));
    g.events.on(EVENTS.SOCIAL_ANTAGONIZE, ({ fight }) => { if (fight) this.change(A.antagonizeFight, 'started a fight'); });
    g.events.on(EVENTS.NPC_SURRENDERED, ({ npc }) => { if (npc) this.spared.set(npc, g.now); });
    g.events.on(EVENTS.NPC_DIED, ({ npc, killer }) => {
      if (!npc) return;
      this.spared.delete(npc);
      if (!killer || killer !== pl()) return;
      const hit = npc.lastHit || {};
      if (hit.wasSurrendered) this.change(A.executeSurrendered, 'executed a surrendering man');
      if (npc.faction === 'law') this.change(A.killLawman, 'killed a lawman');
      else if (isInnocent(npc) && !hit.wasHostile) this.change(A.killInnocent, 'killed an innocent');
    });
    g.events.on(EVENTS.MONEY_CHANGED, ({ delta, reason }) => { if (reason === 'bounty' && delta < 0) this.change(A.payBounty, 'paid a bounty'); });
    g.events.on(HONOR_ACT, ({ action, times = 1 }) => { if (A[action] !== undefined) this.change(A[action] * times, action); });
    g.debug?.addTuning('Honor', TUNING);
    g.debug?.addLine?.(() => {
      const law = g.sys('law');
      return `honor ${this.value.toFixed(1)} (${this.tier}) · prices ×${this.priceMultiplier().toFixed(2)} · wanted ${law.level || 0} · bounty $${(law.totalBounty?.() || 0).toFixed(2)}`;
    });
  }

  /** Tier name: Villainous, Outlaw, Drifter, Respected or Honorable. */
  get tier() { return honorTier(this.value).name; }
  /** Added in Part 8: tier id ('villainous' … 'honorable') and its index 0..4. */
  get tierId() { return honorTier(this.value).id; }
  get tierIndex() { return HONOR.tiers.indexOf(honorTier(this.value)); }
  priceMultiplier() { return honorTier(this.value).price; }

  /** @returns the applied delta (clamped to −100..100) */
  change(delta, reason = '') {
    if (!delta || !Number.isFinite(delta)) return 0;
    const before = this.value, beforeTier = this.tier;
    this.value = Math.max(HONOR.min, Math.min(HONOR.max, Math.round((this.value + delta) * 100) / 100));
    const d = this.value - before;
    if (!d) return 0;
    this.history.unshift({ delta: d, reason, t: this.game.now }); this.history.length = Math.min(this.history.length, 12);
    this.game.events.emit(EVENTS.HONOR_CHANGED, { value: this.value, delta: d, reason });
    // small greetings add up quietly; anything bigger pulses at once
    this._pending += d;
    if (Math.abs(this._pending) >= TUNING.pulseMin || Math.abs(d) >= 1) { this.game.ui.honorPulse(this._pending); this._pending = 0; }
    if (this.tier !== beforeTier) this.game.ui.notify(`Your reputation: ${this.tier}.`, { duration: 3 });
    return d;
  }

  update(dt) {
    // letting a surrendered enemy go: they lowered their hands and walked off, alive, and Eli is still around
    if ((this._t += dt) < 1) return;
    this._t = 0;
    const g = this.game;
    for (const [npc, t] of this.spared) {
      if (npc.dead) { this.spared.delete(npc); continue; }
      if (npc.surrendered || g.now - t < TUNING.spareAfter) continue;
      this.spared.delete(npc);
      if (!isInnocent(npc) && npc.position.distanceTo(g.player.position) < TUNING.spareRange) this.change(HONOR.actions.spareEnemy, 'spared a surrendering enemy');
    }
  }

  serialize() { return { value: this.value }; }
  deserialize(d) { if (typeof d?.value === 'number') this.value = Math.max(HONOR.min, Math.min(HONOR.max, d.value)); }
}

/** Someone whose death costs honor (not an outlaw, a hired gun or a bounty hunter). */
export function isInnocent(npc) {
  return !(npc.faction === 'cinder' || npc.faction === 'blackstone' || npc.def?.hostile || npc.def?.bountyHunter);
}

export { Honor };
