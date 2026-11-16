/** Weapon stats (GAME_BIBLE §6). Damage is against 100-HP humans; rate is shots per second; spread in degrees. */
export const WEAPONS = Object.freeze({
  revolver: { name: 'Drover .45 revolver', damage: 34, rate: 2.0, mag: 6, reload: 2.4, range: 45, spread: 1.2, price: 0, ammo: 'ammo_revolver', holster: 'hip', starter: true },
  repeater: { name: 'Harlan lever repeater', damage: 40, rate: 1.4, mag: 12, reload: 3.2, range: 80, spread: 0.6, price: 180, ammo: 'ammo_repeater', holster: 'back' },
  shotgun: { name: 'Boone double-barrel', damage: 12, pellets: 8, rate: 1.2, mag: 2, reload: 2.6, range: 18, spread: 6.0, price: 160, ammo: 'ammo_shotgun', holster: 'back' },
  rifle: { name: 'Longshot rolling-block', damage: 95, rate: 0.6, mag: 1, reload: 1.8, range: 200, spread: 0.2, price: 260, ammo: 'ammo_rifle', holster: 'back' },
  bow: { name: 'Ash hunting bow', damage: 60, rate: 0.8, mag: 1, reload: 0.9, range: 60, spread: 0.5, price: 90, ammo: 'ammo_arrow', holster: 'back' },
  knife: { name: 'Skinning knife', damage: 45, rate: 1.5, mag: 0, reload: 0, range: 1.6, spread: 0, price: 0, melee: true, starter: true },
  lasso: { name: 'Rope lasso', damage: 0, rate: 0, mag: 0, reload: 0, range: 14, spread: 0, price: 0, tool: true, starter: true },
});
export const HIT_ZONES = Object.freeze({ head: 2.5, torso: 1, limb: 0.6 });
