/** Item catalog (GAME_BIBLE §11). Ammo counts rounds; `pack` is how many a shop purchase adds. */
const items = {
  canned_beans: { name: 'Canned beans', category: 'food', basePrice: 1, effects: { cores: { health: 15, stamina: 10 } } },
  jerky: { name: 'Jerky', category: 'food', basePrice: 0.75, effects: { cores: { stamina: 15 } } },
  coffee: { name: 'Coffee', category: 'food', basePrice: 0.5, effects: { cores: { stamina: 10, focus: 10 } } },
  apple: { name: 'Apple', category: 'food', basePrice: 0.25, effects: { cores: { health: 5 }, horse: { stamina: 15, bondXp: 10 } } },
  carrots: { name: 'Carrots', category: 'horse', basePrice: 0.3, effects: { horse: { stamina: 20, bondXp: 10 } } },
  hay: { name: 'Hay', category: 'horse', basePrice: 0.5, effects: { horse: { health: 25, stamina: 25, bondXp: 10 } } },
  health_tonic: { name: 'Health tonic', category: 'tonic', basePrice: 6, effects: { health: 60, cores: { health: 40 } } },
  stamina_tonic: { name: 'Stamina tonic', category: 'tonic', basePrice: 5, effects: { stamina: 100, cores: { stamina: 40 } } },
  focus_tonic: { name: 'Focus tonic', category: 'tonic', basePrice: 8, effects: { focus: 100, cores: { focus: 40 } } },
  horse_reviver: { name: 'Horse reviver', category: 'horse', basePrice: 12, effects: { horse: { revive: true, health: 50 } } },
  horse_brush: { name: 'Horse brush', category: 'tool', basePrice: 2, reusable: true },
  ammo_revolver: { name: 'Revolver cartridges', category: 'ammo', basePrice: 1.5, pack: 12 },
  ammo_repeater: { name: 'Repeater cartridges', category: 'ammo', basePrice: 2, pack: 12 },
  ammo_shotgun: { name: 'Shotgun shells', category: 'ammo', basePrice: 2, pack: 8 },
  ammo_arrow: { name: 'Arrows', category: 'ammo', basePrice: 1.5, pack: 6 },
  ammo_rifle: { name: 'Rolling-block cartridges', category: 'ammo', basePrice: 3, pack: 6 },
  meat_small_raw: { name: 'Raw small game', category: 'material', basePrice: 0.5 },
  meat_big_raw: { name: 'Raw venison', category: 'material', basePrice: 1.25 },
  meat_small_cooked: { name: 'Cooked small game', category: 'food', basePrice: 1, effects: { cores: { health: 20, stamina: 15 } } },
  meat_big_cooked: { name: 'Cooked venison', category: 'food', basePrice: 2, effects: { cores: { health: 35, stamina: 25 }, buff: { core: 'health', seconds: 480 } } },
  // Added in Part 10: game meat from predators and birds; cooked meat can fortify a core (it stops draining for a while)
  meat_wild_raw: { name: 'Raw game meat', category: 'material', basePrice: 0.9 },
  meat_wild_cooked: { name: 'Cooked game meat', category: 'food', basePrice: 1.5, effects: { cores: { health: 25, stamina: 30 }, buff: { core: 'stamina', seconds: 480 } } },
  meat_bird_raw: { name: 'Raw bird', category: 'material', basePrice: 0.6 },
  meat_bird_cooked: { name: 'Roast bird', category: 'food', basePrice: 1.2, effects: { cores: { health: 25, stamina: 15, focus: 10 }, buff: { core: 'focus', seconds: 360 } } },
  pocket_watch: { name: 'Pocket watch', category: 'valuable', basePrice: 18 },
  gold_ring: { name: 'Gold ring', category: 'valuable', basePrice: 35 },
  silver_locket: { name: 'Silver locket', category: 'valuable', basePrice: 22 },
  gold_nugget: { name: 'Gold nugget', category: 'valuable', basePrice: 80 },
  hat_flat_brim: { name: 'Flat-brim hat', category: 'clothing', basePrice: 8, slot: 'hat' },
  hat_cattleman: { name: 'Cattleman hat', category: 'clothing', basePrice: 12, slot: 'hat' },
  hat_bowler: { name: 'Bowler hat', category: 'clothing', basePrice: 6, slot: 'hat' },
  hat_gambler: { name: 'Gambler hat', category: 'clothing', basePrice: 15, slot: 'hat' },
  coat_duster: { name: 'Duster coat', category: 'clothing', basePrice: 28, slot: 'coat' },
  coat_sheepskin: { name: 'Sheepskin coat', category: 'clothing', basePrice: 40, slot: 'coat' },
  vest: { name: 'Vest', category: 'clothing', basePrice: 9, slot: 'coat' },
  forged_deed: { name: 'Forged deed', category: 'quest', basePrice: 0 },
  original_deed: { name: 'Original deed', category: 'quest', basePrice: 0 },
  pike_ledger: { name: "Pike's ledger", category: 'quest', basePrice: 0 },
};

export const PELT_PRICES = Object.freeze({
  rabbit: [1, 2, 3], coyote: [2, 4, 6], deer: [3, 6, 10], elk: [5, 10, 16], wolf: [6, 12, 20], bear: [12, 25, 45],
});
for (const [species, prices] of Object.entries(PELT_PRICES)) {
  prices.forEach((price, i) => {
    const q = i + 1;
    items[`pelt_${species}_${q}`] = { name: `${species[0].toUpperCase()}${species.slice(1)} pelt (${'★'.repeat(q)})`, category: 'pelt', basePrice: price, species, quality: q };
  });
}

export const ITEMS = Object.freeze(items);
/** Starting kit for a new game. */
export const START_KIT = Object.freeze([['ammo_revolver', 24], ['canned_beans', 2], ['jerky', 2], ['horse_brush', 1]]);
