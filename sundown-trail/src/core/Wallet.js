import System from './System.js';
import { EVENTS } from './Events.js';
import { ECONOMY } from '../data/economy.js';

const cents = (v) => Math.round(v * 100) / 100;

/** The player's money, in dollars with cents. */
export default class Wallet extends System {
  constructor(game) { super(game); this.money = ECONOMY.startingMoney; }
  add(amount, reason = '') {
    if (!(amount > 0)) return this.money;
    this.money = cents(this.money + amount); this._changed(amount, reason);
    return this.money;
  }
  /** @returns {boolean} false when there isn't enough money (nothing is spent). */
  spend(amount, reason = '') {
    if (!(amount > 0)) return true;
    if (this.money + 1e-9 < amount) return false;
    this.money = cents(this.money - amount); this._changed(-amount, reason);
    return true;
  }
  _changed(delta, reason) {
    this.game.events.emit(EVENTS.MONEY_CHANGED, { value: this.money, delta, reason });
    this.game.ui?.moneyPopup(delta);
  }
  serialize() { return { money: this.money }; }
  deserialize(data) { if (typeof data?.money === 'number') this.money = data.money; }
}
