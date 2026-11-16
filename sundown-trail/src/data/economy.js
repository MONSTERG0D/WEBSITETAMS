import { PELT_PRICES } from './items.js';

/** Economy tables (GAME_BIBLE §6). Ranges are [min, max] in dollars. */
export const ECONOMY = Object.freeze({
  startingMoney: 12,
  deathMoneyLoss: 0.05,
  pelts: PELT_PRICES,
  bounty: { dead: [20, 60], alive: [35, 120] },
  jobs: { deliveryOrEscort: [15, 40] },
  story: [25, 150], payrollRobbery: 600, valuables: [5, 80], ranchIncomeMax: 35,
  costs: { food: [0.25, 3], tonics: [5, 12], ammoBox: [1.5, 3], hotelRoom: 1, bath: 0.75, guns: [90, 260], clothing: [6, 40], horses: [60, 450] },
  crimes: { assault: 5, horseTheft: 15, robbery: 20, murder: 40, lawmanMurder: 60 },
  ranchUpgrades: {
    house: { name: 'House repair', cost: 300, effect: 'Bed, saving and wardrobe' },
    barn: { name: 'Barn', cost: 400, effect: 'Stable and a second horse' },
    corral: { name: 'Corral', cost: 250, effect: 'Horse breaking and breeding income' },
    garden: { name: 'Garden and chicken coop', cost: 150, effect: 'Daily food' },
    smokehouse: { name: 'Smokehouse', cost: 200, effect: 'Better meat prices' },
    bunkhouse: { name: 'Bunkhouse', cost: 450, effect: 'Room for a second companion' },
    lookout: { name: 'Lookout tower', cost: 250, effect: 'Threats show on the map' },
    windmill: { name: 'Windmill and well', cost: 400, effect: 'Ranch income ×1.5' },
  },
});
