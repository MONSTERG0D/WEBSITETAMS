import { ECONOMY } from '../data/economy.js';

/** Daily ranch income per structure (Part 13; the Bible caps the ranch at $35 a day: (12 + 6 + 5) × 1.5 = $34.50). */
export const RANCH_INCOME = Object.freeze({ corral: 12, garden: 6, smokehouse: 5 });
export const WINDMILL_MULTIPLIER = 1.5;

/**
 * Economy check (Part 13): how long normal play takes to buy every upgrade. Earnings are per real hour of play,
 * from the Bible's §6 pay ranges (jobs $15–40, bounties $20–120, pelts $1–45, valuables $5–80, story $25–150): one
 * side job, most of a bounty, a hunting run, some looting, June's lead and Abel's horse-breaking job (1.5 in-game
 * days pass per real hour, so 1.5 of each), and the chores. Story missions 2–5 pay as lump sums along the way
 * (mission 4 averages the $150 escort and the $600 payroll robbery). Spending covers ammo, food (Mae's parcel
 * helps), tonics, a gun and a horse. The ranch's own income arrives every in-game morning (every 40 real minutes) once it's built, and the
 * player buys upgrades in a sensible order as soon as the money is there (keeping a little in hand).
 * economyCheck() → { hours, log } — the node tests check it lands near six hours.
 */
export const ECONOMY_MODEL = {
  perHour: { sideJob: 27, bounty: 60, hunting: 90, valuables: 30, juneLead: 41, abelJob: 41, chores: 19 }, spendPerHour: 40,
  story: [[1, 25], [2, 85], [3.5, 375], [5, 85]], startMoney: 12, reserve: 30, dayMinutes: 40,
  buyOrder: ['house', 'corral', 'garden', 'smokehouse', 'windmill', 'barn', 'lookout', 'bunkhouse'],
};
export function economyCheck(M = ECONOMY_MODEL, T = { income: RANCH_INCOME, windmillMultiplier: WINDMILL_MULTIPLIER }) {
  const net = Object.values(M.perHour).reduce((a, b) => a + b, 0) - M.spendPerHour, dt = 1 / 120, day = M.dayMinutes / 60;
  let money = M.startMoney, t = 0, sinceMorning = 0, i = 0; const built = new Set(), pending = [], log = [];
  const income = () => { let s = 0; for (const [k, v] of Object.entries(T.income)) if (built.has(k)) s += v; return built.has('windmill') ? s * T.windmillMultiplier : s; };
  while (built.size < M.buyOrder.length && t < 40) {
    money += net * dt; t += dt; sinceMorning += dt;
    for (const [at, pay] of M.story || []) if (t >= at && t - dt < at) money += pay;
    if (sinceMorning >= day) { sinceMorning -= day; for (const s of pending.splice(0)) built.add(s); money += income(); }
    const next = M.buyOrder[i], cost = next && ECONOMY.ranchUpgrades[next].cost;
    if (next && money - cost >= M.reserve) { money -= cost; pending.push(next); log.push(`${t.toFixed(2)} h: ${next}`); i++; }
  }
  return { hours: Math.round(t * 100) / 100, net, log };
}

