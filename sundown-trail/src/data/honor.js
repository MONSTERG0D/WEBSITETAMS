/** Honor tiers and actions (GAME_BIBLE §6). Middle-tier price multipliers were chosen in Part 0. */
export const HONOR = Object.freeze({
  min: -100, max: 100, start: 0, endingThreshold: 20,
  tiers: [
    { id: 'villainous', name: 'Villainous', max: -60, price: 1.15 },
    { id: 'outlaw', name: 'Outlaw', max: -20, price: 1.07 },
    { id: 'drifter', name: 'Drifter', max: 19, price: 1 },
    { id: 'respected', name: 'Respected', max: 59, price: 0.93 },
    { id: 'honorable', name: 'Honorable', max: 100, price: 0.85 },
  ],
  actions: {
    greetStranger: 0.5, helpStranger: 5, spareEnemy: 4, returnProperty: 3, payBounty: 2,
    donatePer5: 1, donateDailyMax: 10, lootCivilian: -0.5, antagonizeFight: -1, hogtieDanger: -3,
    stealHorse: -4, rob: -5, executeSurrendered: -6, killInnocent: -10, killLawman: -12,
  },
});

export function honorTier(value) {
  for (const t of HONOR.tiers) if (value <= t.max) return t;
  return HONOR.tiers[HONOR.tiers.length - 1];
}
