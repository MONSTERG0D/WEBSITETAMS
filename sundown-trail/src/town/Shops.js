import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { ITEMS } from '../data/items.js';
import { WEAPONS } from '../data/weapons.js';
import { sketchPortrait, WANTED } from './Signs.js';

/**
 * The 'shops' system (Part 9, GAME_BIBLE §11): open(shopId) · buy(itemId, qty) · sell(itemId, qty).
 * A parchment catalog per shop: Buy and Sell tabs (plus Horses and Services where they apply), categories, an item
 * list with drawn previews, stock (restocked each morning), opening hours, and prices scaled by honor
 * (honor.priceMultiplier). Selling pays the Bible's prices (pelts by quality, valuables, meat).
 * Services: the hotel's bath ($0.75) and room ($1: sleep to morning or evening, then autosave), the saloon's drinks
 * (a swaying camera that wears off) and the bartender's rumors pointing to side content, the doctor's care, the
 * livery's horses (via HorseSystem) and stabling, and paying bounties at the sheriff's office or the post office.
 * The bounty board shows the wanted posters (hooks for Part 15 bounty jobs) and Eli's own once he's wanted.
 * Counters always answer: closed shops say when they open, and a dead or missing keeper means a shut counter.
 */
export const TUNING = { restockHour: 6, gunStock: 1, stock: 6, ammoStock: 12, drunkPerDrink: 0.32, drunkDecay: 0.025, drunkMax: 1.4, sellFood: 0.5 };

const ALL_AMMO = ['ammo_revolver', 'ammo_repeater', 'ammo_shotgun', 'ammo_rifle', 'ammo_arrow'];
const FOOD = ['canned_beans', 'jerky', 'coffee', 'apple'];
const TONICS = ['health_tonic', 'stamina_tonic', 'focus_tonic'];
const HORSE_CARE = ['hay', 'carrots', 'horse_brush', 'horse_reviver'];
const CLOTHES = ['hat_flat_brim', 'hat_cattleman', 'hat_bowler', 'hat_gambler', 'coat_duster', 'coat_sheepskin', 'vest'];
const DRINKS = [{ id: 'whiskey', name: 'Whiskey', price: 0.25, drunk: 1, text: 'Burns all the way down.' }, { id: 'beer', name: 'Beer', price: 0.15, drunk: 0.5, text: 'Warm, flat, welcome.' }, { id: 'mezcal', name: 'Mezcal', price: 0.3, drunk: 1.3, text: 'Smoke and fire.' }, { id: 'coffee_cup', name: 'Coffee', price: 0.1, drunk: -1, text: 'Black as tar. Clears the head.' }];

/** Every shop and counter. hours [open, close) on a 24 h clock; close may pass midnight. */
export const SHOPS = {
  cb_general: { name: 'Kettle & Sons General Store', keeperName: 'Hiram Kettle', keeperRole: 'townsman', hours: [7, 20], sells: { Food: FOOD, Tonics: TONICS, Ammunition: ['ammo_revolver', 'ammo_repeater', 'ammo_shotgun', 'ammo_arrow'], Horse: HORSE_CARE, Clothing: CLOTHES }, buys: ['valuable'] },
  cb_gunsmith: { name: 'Bramwell Gunsmith', keeperName: 'Otto Bramwell', keeperRole: 'worker', hours: [8, 19], sells: { Guns: ['repeater', 'shotgun', 'rifle', 'bow'], Ammunition: ALL_AMMO }, buys: [] },
  cb_butcher: { name: 'Ferro Meats', keeperName: 'Gus Ferro', keeperRole: 'worker', hours: [6, 18], sells: { Food: ['meat_small_cooked', 'meat_big_cooked'] }, buys: ['pelt', 'material'] },
  cb_stable: { name: 'Copperbell Livery', keeperName: 'Wes Darrow', keeperRole: 'rancher', hours: [6, 21], sells: { Horse: HORSE_CARE }, buys: [], horses: [
    { breed: 'mustang', coat: 'palomino', name: 'Biscuit', price: 60 }, { breed: 'morgan', coat: 'chestnut', name: 'Sorrel Jim', price: 120 },
    { breed: 'quarter', coat: 'dappleGrey', name: 'Smoke', price: 180 }, { breed: 'draft', coat: 'black', name: 'Goliath', price: 150 },
    { breed: 'thoroughbred', coat: 'bay', name: 'Senator', price: 450 }], services: ['stable'] },
  // Added in Part 13: Abel Hutchins breaks and sells better horses at the ranch corral (a companion; needs the barn)
  ranch_abel: { name: "Abel's Horses", keeperName: 'Abel Hutchins', keeper: false, hours: [7, 19], sells: { Horse: HORSE_CARE }, buys: [], horses: [
    { breed: 'morgan', coat: 'bay', name: 'Duchess', price: 110 }, { breed: 'quarter', coat: 'chestnut', name: 'Rusty', price: 160 },
    { breed: 'mustang', coat: 'pinto', name: 'Patches', price: 90 }, { breed: 'thoroughbred', coat: 'black', name: 'Midnight', price: 380 }] },
  cb_hotel: { name: 'Ashwater Hotel', keeperName: 'Ida Pell', keeperRole: 'townswoman', hours: [0, 24], sells: {}, buys: [], services: ['bath', 'room'] },
  cb_saloon: { name: 'The Brass Rail Saloon', keeperName: 'Lou Tanner', keeperRole: 'bartender', hours: [10, 2], sells: { Food: ['canned_beans', 'coffee'] }, buys: [], drinks: ['whiskey', 'beer', 'coffee_cup'], rumors: true },
  cb_sheriff: { name: "Sheriff's Office", keeper: false, hours: [0, 24], sells: {}, buys: [], services: ['bounty'] },
  cb_post: { name: 'Post Office & Telegraph', keeperName: 'June Whitfield', keeperRole: 'townswoman', hours: [7, 19], sells: {}, buys: [], services: ['bounty'], rumors: true },
  cb_doctor: { name: 'Dr. Abernathy, Physician', keeperName: 'Dr. Silas Abernathy', keeperRole: 'gentleman', hours: [8, 18], sells: { Tonics: TONICS }, buys: [], services: ['doctor'] },
  sm_store: { name: 'Saltmesa Trading Post', keeperName: 'Rosa Ibarra', keeperRole: 'ranchwoman', hours: [7, 20], sells: { Food: FOOD, Tonics: TONICS, Ammunition: ALL_AMMO, Horse: HORSE_CARE }, buys: ['valuable', 'pelt'] },
  sm_butcher: { name: 'Saltmesa Butcher', keeperName: 'Tomas Reyes', keeperRole: 'worker', hours: [6, 18], sells: { Food: ['meat_small_cooked'] }, buys: ['pelt', 'material'] },
  sm_stable: { name: 'Saltmesa Corral', keeperName: 'Old Hen', keeperRole: 'farmer', hours: [6, 20], sells: { Horse: ['hay', 'carrots'] }, buys: [], horses: [{ breed: 'mustang', coat: 'pinto', name: 'Patches', price: 70 }, { breed: 'mustang', coat: 'palomino', name: 'Sunny', price: 95 }], services: ['stable'] },
  sm_cantina: { name: 'Cantina', keeperName: 'Mateo', keeperRole: 'bartender', hours: [11, 2], sells: { Food: ['jerky', 'coffee'] }, buys: [], drinks: ['mezcal', 'beer', 'coffee_cup'], rumors: true },
  gw_cook: { name: 'Camp Cook', keeperName: 'Cookie', keeperRole: 'worker', hours: [5, 21], sells: { Food: ['canned_beans', 'coffee', 'meat_small_cooked'] }, buys: ['material'] },
};

/** Rumors that point to places and side content (Part 15 hooks them to jobs and encounters). */
export const RUMORS = [
  'Blackstone riders been stringing wire north of the estate road. Took the creek with it.',
  "There's a bear up past Greywind the loggers won't go near. Big as a wagon, they say.",
  'Old Mission bell rings some nights. Ain\'t nobody up there to ring it.',
  "The Cinder Boys hole up in the canyons past Saltmesa. Jack Ransome don't take kindly to visitors.",
  'Somebody saw lights out by Hanging Oak. Folks say it\'s haunted. Folks say a lot of things.',
  "Fella at the hotel claims he panned gold below Mirror Lake. Drunk, mind you. But he paid in nuggets.",
  "The Judge's men pay well for information. I'd keep my mouth shut, if I were you.",
  "Telegraph says a circuit marshal's riding through come autumn. Okafor. Straight as a rifle barrel.",
  'Stage from Fort Granger got held up twice this month. Same road, same bend.',
  "Wolves been taking calves out west of the river. Ranchers'd pay for pelts.",
];

const timeStr = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:00`;
const CSS = `
.sd-shop{width:min(880px,96vw);max-height:92vh;display:flex;flex-direction:column;gap:8px}
.sd-shop-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.sd-shop-head small{font-style:italic;color:var(--ink-soft)}
.sd-shop-tabs{display:flex;gap:6px;flex-wrap:wrap}
.sd-shop-tabs button{flex:0 0 auto;width:auto;padding:6px 12px;border:1px solid rgba(43,29,18,.3);border-radius:4px;min-height:38px}
.sd-shop-tabs button.on{background:var(--rust);color:#f4ead6}
.sd-shop-body{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:14px;min-height:0;overflow:hidden}
.sd-shop-list{overflow:auto;max-height:56vh;padding-right:6px}
.sd-shop-cat{font:15px var(--font-display);color:var(--rust);margin:8px 0 2px}
.sd-shop-row{display:grid;grid-template-columns:40px 1fr auto;gap:8px;align-items:center;padding:4px 6px;border-bottom:1px solid rgba(43,29,18,.15);cursor:pointer;min-height:44px}
.sd-shop-row.sel,.sd-shop-row:hover{background:rgba(138,59,30,.12)}
.sd-shop-row.off{opacity:.45}
.sd-shop-row img{width:36px;height:36px}
.sd-shop-prev{display:flex;flex-direction:column;gap:6px;align-items:flex-start}
.sd-shop-prev img{width:128px;height:128px;align-self:center}
.sd-shop-prev .sd-button{width:auto;min-width:140px}
.sd-shop-money{font:18px var(--font-display)}
.sd-posters{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;max-height:62vh;overflow:auto}
.sd-posters canvas{width:100%;border:1px solid rgba(43,29,18,.4);box-shadow:0 2px 8px rgba(0,0,0,.25)}
@media (max-width:640px){.sd-shop-body{grid-template-columns:1fr}.sd-shop-prev img{width:80px;height:80px}}
`;

export default class Shops extends System {
  constructor(game) {
    super(game);
    this.stock = {}; this.current = null; this.tab = 'buy'; this.sel = null; this.drunk = 0; this._icons = new Map(); this._day = -1; this.log = [];
  }
  async init() {
    const g = this.game;
    if (!document.getElementById('sd-shop-css')) { const s = document.createElement('style'); s.id = 'sd-shop-css'; s.textContent = CSS; document.head.append(s); }
    g.ui.registerScreen('shop', { build: () => this._build(), onClose: () => { this.current = null; } });
    g.ui.registerScreen('board', { build: (ui, data) => this._buildBoard(data) });
    this._restock();
    g.debug?.addTuning('Shops', TUNING);
  }

  // ---------------------------------------------------------------- Bible API
  /** Opens a shop's catalog (or explains why the counter is shut). @returns {boolean} */
  open(shopId) {
    const g = this.game, S = SHOPS[shopId];
    if (!S) return false;
    const why = this.closedReason(shopId);
    if (why) { g.ui.notify(why, { duration: 3 }); return false; }
    this._restock();
    this.current = shopId; this.tab = Object.keys(S.sells).length ? 'buy' : S.services ? 'services' : S.drinks ? 'drinks' : 'sell'; this.sel = null;
    const keeper = g.get('npcs')?.byId.get(`keeper:${shopId}`);
    if (keeper && !keeper.dead) { g.get('social')?.say?.(keeper, this._welcome(S)); keeper.facePoint(g.player.position); }
    g.ui.openScreen('shop');
    return true;
  }
  /** Buys from the open shop (or the general store). @returns {boolean} */
  buy(itemId, qty = 1) {
    const g = this.game, shopId = this.current || 'cb_general', S = SHOPS[shopId], wallet = g.sys('wallet');
    if (!this._sells(S, itemId)) return false;
    const gun = !!WEAPONS[itemId] && !ITEMS[itemId];
    if (gun && g.get('combat')?.owned?.includes(itemId)) { g.ui.notify('You already own one.'); return false; }
    const left = this.stockOf(shopId, itemId);
    if (left < qty) { g.ui.notify('Sold out. More tomorrow.'); return false; }
    if (!gun && g.sys('inventory').space?.(itemId) < (ITEMS[itemId]?.pack || 1) * qty) { g.ui.notify("Your satchel can't hold any more of those."); return false; } // Part 14: carry limits
    const cost = this.price(itemId, shopId) * qty;
    if (!wallet.spend(Math.round(cost * 100) / 100, 'purchase')) { g.ui.notify("You can't afford that."); return false; }
    this.stock[shopId][itemId] = left - qty;
    if (gun) { g.get('combat')?.give?.(itemId); g.ui.notify(`Bought a ${WEAPONS[itemId].name}.`); }
    else { const n = (ITEMS[itemId]?.pack || 1) * qty; g.sys('inventory').add(itemId, n); }
    g.audio.play('purchase', { volume: 0.7 });
    this.log.unshift(`bought ${itemId} ×${qty} $${cost.toFixed(2)}`);
    this._refresh();
    return true;
  }
  /** Sells to the open shop. @returns {number} money received */
  sell(itemId, qty = 1) {
    const g = this.game, shopId = this.current || 'cb_general', S = SHOPS[shopId], inv = g.sys('inventory'), def = ITEMS[itemId];
    if (!def || !S?.buys.includes(def.category) || !inv.has(itemId, qty)) return 0;
    inv.remove(itemId, qty);
    const pay = Math.round(this.sellPrice(itemId) * qty * 100) / 100;
    g.sys('wallet').add(pay, 'sale');
    this.log.unshift(`sold ${itemId} ×${qty} $${pay.toFixed(2)}`);
    this._refresh();
    return pay;
  }

  // ---------------------------------------------------------------- prices, hours, stock
  shopDef(id) { return SHOPS[id] || null; }
  price(itemId, shopId = this.current) {
    const w = WEAPONS[itemId], base = ITEMS[itemId]?.basePrice ?? (w && !ITEMS[itemId] ? w.price : 0);
    return Math.round(base * (this.game.get('honor')?.priceMultiplier?.() ?? 1) * 100) / 100;
  }
  sellPrice(itemId) {
    const d = ITEMS[itemId]; if (!d) return 0;
    const meat = /^meat_.*_raw$/.test(itemId) ? (this.game.get('ranch')?.meatMultiplier?.() ?? 1) : 1; // Part 13: the smokehouse
    return (d.category === 'food' ? d.basePrice * TUNING.sellFood : d.basePrice) * meat;
  }
  isOpen(shopId, hour = this.game.sys('sky').timeOfDay ?? 12) {
    const [a, b] = SHOPS[shopId]?.hours || [0, 24];
    return a <= b ? hour >= a && hour < b : hour >= a || hour < b;
  }
  /** Why the counter won't serve, or null. */
  closedReason(shopId) {
    const g = this.game, S = SHOPS[shopId];
    if (!this.isOpen(shopId)) return `${S.name}: closed. Open ${timeStr(S.hours[0])} to ${timeStr(S.hours[1])}.`;
    const keeper = g.get('npcs')?.byId.get(`keeper:${shopId}`);
    if (S.keeper !== false && keeper && keeper.dead) return 'Nobody is minding the counter.';
    if (S.keeper !== false && keeper && keeper.position.distanceTo(g.player.position) > 9) return `${S.keeperName} isn't at the counter right now.`;
    if ((g.sys('law').level || 0) >= 2 && !S.services?.includes('bounty')) return '"I don\'t serve wanted men. Get out before I call the sheriff."';
    return null;
  }
  labelFor(id) {
    if (id === 'bath') return 'Take a bath ($0.75)';
    if (id === 'room') return 'Rent a room and sleep ($1)';
    const S = SHOPS[id]; if (!S) return 'Shop';
    return this.isOpen(id) ? (S.drinks ? `Order at the bar` : S.services?.includes('bounty') ? (id === 'cb_sheriff' ? 'Pay bounties' : 'Post office') : `Shop: ${S.name}`) : `${S.name} (closed)`;
  }
  stockOf(shopId, itemId) { return this.stock[shopId]?.[itemId] ?? 0; }
  _restock() {
    const day = this.game.sys('sky').day ?? 1, hour = this.game.sys('sky').timeOfDay ?? 12, key = hour >= TUNING.restockHour ? day : day - 1;
    if (key === this._day) return;
    this._day = key;
    for (const [id, S] of Object.entries(SHOPS)) {
      const st = (this.stock[id] = {});
      for (const list of Object.values(S.sells)) for (const it of list) st[it] = WEAPONS[it] && !ITEMS[it] ? TUNING.gunStock : ITEMS[it]?.category === 'ammo' ? TUNING.ammoStock : TUNING.stock;
    }
  }
  _sells(S, id) { return !!S && Object.values(S.sells).some((l) => l.includes(id)); }
  _welcome(S) { const lines = ['What can I get you?', 'Help yourself, take a look.', 'Mornin\'. Need anything?', "Prices are fair, don't haggle.", 'Welcome, welcome.']; return S.drinks ? 'What\'ll it be?' : lines[Math.floor(Math.random() * lines.length)]; }

  // ---------------------------------------------------------------- services
  /** 'bath' | 'room' | 'stable' | 'doctor' | drink ids | 'rumor'. */
  async service(kind, shopId = this.current) {
    const g = this.game, wallet = g.sys('wallet'), pl = g.player, sky = g.sys('sky');
    const pay = (amt, why) => { if (wallet.spend(amt, why)) return true; g.ui.notify("You can't afford that."); return false; };
    if (kind === 'bath') {
      if (!this.isOpen('cb_hotel') || !pay(0.75, 'bath')) return false;
      g.ui.closeAll(); await g.ui.fade(true, 0.6);
      sky.setTime(((sky.timeOfDay ?? 12) + 0.5) % 24); pl.stamina = 100; pl.dirt = 0;
      await g.ui.fade(false, 0.6); g.ui.notify('A long hot bath. You feel like a new man.');
      return true;
    }
    if (kind === 'room') {
      if (!pay(1, 'hotel room')) return false;
      g.ui.closeAll(); this.sleep();
      return true;
    }
    if (kind === 'doctor') { if (!pay(2, 'doctor')) return false; pl.health = 100; g.ui.notify('The doctor patches you up. "Try not to get shot again."'); this._refresh(); return true; }
    if (kind === 'stable') {
      const h = g.get('horses')?.playerHorse;
      if (!h || h.position.distanceTo(pl.position) > 40) { g.ui.notify('Bring your horse here first.'); return false; }
      if (!pay(0.5, 'stabling')) return false;
      h.health = h.maxHealth; h.stamina = h.controller.maxStamina; h.sweat = 0; h.system._gainXp?.(h, 10, 'stabled');
      g.ui.notify(`${h.name} is fed, watered and brushed.`); this._refresh();
      return true;
    }
    if (kind === 'rumor') {
      const keeper = g.get('npcs')?.byId.get(`keeper:${shopId}`), line = RUMORS[Math.floor(Math.random() * RUMORS.length)];
      if (keeper && !keeper.dead) g.get('social')?.say?.(keeper, line); else g.ui.subtitle(SHOPS[shopId]?.keeperName || 'Bartender', line, 5);
      g.ui.notify('Rumor heard.', { duration: 1.5 }); this.log.unshift(`rumor: ${line.slice(0, 40)}`);
      return true;
    }
    const drink = DRINKS.find((d) => d.id === kind);
    if (drink) {
      if (!pay(drink.price, 'drink')) return false;
      this.drunk = Math.max(0, Math.min(TUNING.drunkMax, this.drunk + drink.drunk * TUNING.drunkPerDrink));
      if (drink.id === 'coffee_cup') { this.drunk = Math.max(0, this.drunk - 0.4); pl.stamina = Math.min(100, pl.stamina + 15); }
      g.ui.notify(`${drink.name}. ${drink.text}`, { duration: 2 }); this._refresh();
      return true;
    }
    return false;
  }
  /** Sleeps until morning (07:00) or evening (19:00), heals, autosaves. */
  async sleep(until = null) {
    const g = this.game, sky = g.sys('sky'), h = sky.timeOfDay ?? 12;
    const target = until ?? (h >= 17 || h < 5 ? 7 : 19);
    await g.ui.fade(true, 0.9);
    if (target <= h) sky.day = (sky.day || 1) + 1;
    sky.setTime(target);
    const pl = g.player; pl.health = 100; pl.stamina = 100; this.drunk = 0;
    g.events.emit(EVENTS.CAMP_SLEPT, { hours: (target - h + 24) % 24 });
    g.save?.autosave?.(true);
    await g.ui.fade(false, 0.9);
    g.ui.notify(target === 7 ? 'You wake rested. Morning.' : 'You wake as the light goes gold. Evening.');
  }
  /** Pays a region's bounty at the sheriff's or the post office. */
  payBounty(region) { const ok = this.game.sys('law').payBounty?.(region); if (ok) this.game.ui.notify('Bounty paid. The slate is clean.'); this._refresh(); return ok; }

  // ---------------------------------------------------------------- horses
  buyHorse(index) {
    const g = this.game, S = SHOPS[this.current], h = S?.horses?.[index], horses = g.get('horses');
    if (!h || !horses) return false;
    if (!g.sys('wallet').spend(Math.round(h.price * (g.get('honor')?.priceMultiplier?.() ?? 1) * 100) / 100, 'horse')) { g.ui.notify("You can't afford that horse."); return false; }
    const nh = horses.createHorse({ seed: `bought:${h.name}:${g.now | 0}`, name: h.name, coat: h.coat, breed: h.breed });
    const town = g.get('towns'), corral = (this.current === 'ranch_abel' && g.get('ranch')?.spot?.('corral')) || town?.spots(this.current.startsWith('sm') ? 'saltmesa' : 'copperbell')?.corral || g.player.position;
    nh.position.set(corral.x + 1.5, g.sys('terrain').getHeightAt(corral.x + 1.5, corral.z), corral.z); nh.animator.teleported();
    horses.setPlayerHorse?.(nh);
    S.horses.splice(index, 1);
    g.ui.notify(`${h.name} is yours. Waiting by the corral.`); this._refresh();
    return true;
  }

  // ---------------------------------------------------------------- drinking
  update(dt, rawDt) {
    const g = this.game;
    if (this.drunk > 0) {
      this.drunk = Math.max(0, this.drunk - TUNING.drunkDecay * dt);
      const t = g.now, k = this.drunk, rig = g.cameraRig;
      rig.yaw += Math.sin(t * 0.9) * 0.0022 * k; rig.pitch += Math.cos(t * 0.7) * 0.0014 * k;
      if (g.player.state === 'onFoot') g.player.velocity.x += Math.sin(t * 0.6) * 0.04 * k;
      g.sys('postfx').setFocus?.(false);
    }
    if (((this._rt = (this._rt || 0) + rawDt)) > 5) { this._rt = 0; this._restock(); }
  }

  // ---------------------------------------------------------------- UI
  _refresh() { if (this.game.ui.topScreen?.() === 'shop' && this._render) this._render(); }
  _build() {
    const g = this.game, ui = g.ui, wrap = document.createElement('div'); wrap.className = 'sd-panel sd-shop';
    this._render = () => {
      const S = SHOPS[this.current]; if (!S) return;
      const mult = g.get('honor')?.priceMultiplier?.() ?? 1;
      wrap.innerHTML = '';
      const head = document.createElement('div'); head.className = 'sd-shop-head';
      head.innerHTML = `<h2 class="sd-title" style="margin:0">${S.name}</h2><span class="sd-shop-money">$${g.sys('wallet').money.toFixed(2)}</span><small>Open ${timeStr(S.hours[0])}–${timeStr(S.hours[1])}${mult !== 1 ? ` · your reputation: prices ×${mult.toFixed(2)}` : ''}</small>`;
      wrap.append(head);
      const tabs = document.createElement('div'); tabs.className = 'sd-shop-tabs';
      const avail = [['buy', 'Buy', Object.keys(S.sells).length], ['sell', 'Sell', S.buys.length], ['drinks', 'Drinks', S.drinks], ['horses', 'Horses', S.horses?.length], ['services', 'Services', S.services || S.rumors]].filter((x) => x[2]);
      for (const [id, label] of avail) { const b = ui.button(label, () => { this.tab = id; this.sel = null; this._render(); }); if (this.tab === id) b.classList.add('on'); tabs.append(b); }
      wrap.append(tabs);
      const body = document.createElement('div'); body.className = 'sd-shop-body';
      const list = document.createElement('div'); list.className = 'sd-shop-list';
      const prev = document.createElement('div'); prev.className = 'sd-shop-prev';
      body.append(list, prev); wrap.append(body);
      const row = (id, name, right, off, onSel) => {
        const r = document.createElement('div'); r.className = `sd-shop-row${this.sel === id ? ' sel' : ''}${off ? ' off' : ''}`; r.tabIndex = 0;
        const img = new Image(); img.src = this._icon(id); img.alt = '';
        const n = document.createElement('div'); n.textContent = name; const p = document.createElement('div'); p.textContent = right;
        r.append(img, n, p); r.addEventListener('click', () => { this.sel = id; onSel?.(); this._render(); });
        r.addEventListener('keydown', (e) => { if (e.key === 'Enter') { this.sel = id; onSel?.(); this._render(); } });
        list.append(r);
      };
      const cat = (t) => { const c = document.createElement('div'); c.className = 'sd-shop-cat'; c.textContent = t; list.append(c); };
      const inv = g.sys('inventory');
      if (this.tab === 'buy') {
        for (const [c, items] of Object.entries(S.sells)) {
          cat(c);
          for (const id of items) { const gun = WEAPONS[id] && !ITEMS[id], owned = gun && g.get('combat')?.owned?.includes(id); row(id, (gun ? WEAPONS[id].name : ITEMS[id]?.name) + (owned ? ' (owned)' : ''), `$${this.price(id).toFixed(2)}`, owned || !this.stockOf(this.current, id)); }
        }
        if (!this.sel) this.sel = Object.values(S.sells)[0]?.[0];
        const id = this.sel, gun = WEAPONS[id] && !ITEMS[id], d = ITEMS[id], w = WEAPONS[id];
        if (id) {
          prev.innerHTML = `<img src="${this._icon(id)}" alt=""><b>${gun ? w.name : d.name}</b><div>${this._describe(id)}</div><div>Price $${this.price(id).toFixed(2)}${d?.pack ? ` for ${d.pack}` : ''} · in stock ${this.stockOf(this.current, id)} · you have ${gun ? (g.get('combat')?.owned?.includes(id) ? 'one' : 'none') : inv.count(id)}</div>`;
          prev.append(ui.button(gun ? 'Buy' : 'Buy 1', () => this.buy(id, 1), { primary: true }));
          if (!gun) prev.append(ui.button('Buy 5', () => this.buy(id, 5)));
        }
      } else if (this.tab === 'sell') {
        const mine = inv.list().filter((x) => x.def && S.buys.includes(x.def.category));
        if (!mine.length) list.append(Object.assign(document.createElement('p'), { className: 'sd-hint', textContent: `Nothing they'd buy. ${S.name} buys ${S.buys.join(', ')}.` }));
        for (const x of mine) row(x.id, `${x.def.name} ×${x.qty}`, `$${this.sellPrice(x.id).toFixed(2)}`, false);
        const x = mine.find((m) => m.id === this.sel) || mine[0];
        if (x) { this.sel = x.id; prev.innerHTML = `<img src="${this._icon(x.id)}" alt=""><b>${x.def.name}</b><div>They pay $${this.sellPrice(x.id).toFixed(2)} each. You have ${x.qty}.</div>`; prev.append(ui.button('Sell 1', () => this.sell(x.id, 1), { primary: true }), ui.button('Sell all', () => this.sell(x.id, inv.count(x.id)))); }
      } else if (this.tab === 'drinks') {
        for (const id of S.drinks) { const d = DRINKS.find((x) => x.id === id); row(id, d.name, `$${d.price.toFixed(2)}`, false); }
        const d = DRINKS.find((x) => x.id === this.sel) || DRINKS.find((x) => x.id === S.drinks[0]);
        if (d) { this.sel = d.id; prev.innerHTML = `<img src="${this._icon(d.id)}" alt=""><b>${d.name}</b><div>${d.text}</div>${this.drunk > 0.3 ? '<div class="sd-hint">The room is starting to lean.</div>' : ''}`; prev.append(ui.button(`Drink ($${d.price.toFixed(2)})`, () => this.service(d.id, this.current), { primary: true })); }
        if (S.rumors) prev.append(ui.button('Ask about rumors', () => { this.service('rumor', this.current); }));
      } else if (this.tab === 'horses') {
        S.horses.forEach((h, i) => row(`horse${i}`, `${h.name} — ${h.breed}, ${h.coat}`, `$${Math.round(h.price * (g.get('honor')?.priceMultiplier?.() ?? 1))}`, false));
        const i = Math.max(0, S.horses.findIndex((_, k) => `horse${k}` === this.sel)), h = S.horses[i];
        if (h) { this.sel = `horse${i}`; prev.innerHTML = `<img src="${this._icon('horse')}" alt=""><b>${h.name}</b><div>A ${h.coat} ${h.breed}. ${BREED_NOTES[h.breed] || ''}</div><div class="sd-hint">Your current horse stays here at the livery.</div>`; prev.append(ui.button('Buy this horse', () => this.buyHorse(i), { primary: true })); }
      } else if (this.tab === 'services') {
        const sv = S.services || [];
        if (sv.includes('bath')) prev.append(ui.button('Take a bath ($0.75)', () => this.service('bath')));
        if (sv.includes('room')) prev.append(ui.button('Rent a room and sleep ($1.00)', () => this.service('room')));
        if (sv.includes('doctor')) prev.append(ui.button(`See the doctor ($2.00) · health ${Math.round(g.player.health)}`, () => this.service('doctor')));
        if (sv.includes('stable')) prev.append(ui.button('Stable your horse ($0.50)', () => this.service('stable')));
        if (S.rumors && !S.drinks) prev.append(ui.button('Any news?', () => this.service('rumor', this.current)));
        if (sv.includes('bounty')) {
          const law = g.sys('law'); cat('Bounties on you');
          let any = false;
          for (const [r, amt] of Object.entries(law.bounties || {})) if (amt > 0) { any = true; row(`bounty_${r}`, REGION_NAMES[r] || r, `$${amt.toFixed(2)}`, false, () => this.payBounty(r)); }
          if (!any) list.append(Object.assign(document.createElement('p'), { className: 'sd-hint', textContent: 'No bounties on your head. Keep it that way.' }));
          else prev.append(Object.assign(document.createElement('p'), { className: 'sd-hint', textContent: 'Click a bounty to pay it.' }));
          prev.append(ui.button('Read the bounty board', () => { ui.closeScreen(); this.openBoard('copperbell'); }));
        }
      }
      wrap.append(ui.button('Leave', () => ui.closeScreen()));
    };
    this._render();
    return wrap;
  }
  _describe(id) {
    const d = ITEMS[id], w = WEAPONS[id] && !ITEMS[id] ? WEAPONS[id] : null;
    if (w) return `Damage ${w.damage}${w.pellets ? `×${w.pellets}` : ''} · range ${w.range} m · ${w.mag}-round magazine · uses ${ITEMS[w.ammo]?.name?.toLowerCase() || 'arrows'}.`;
    if (!d) return '';
    const e = d.effects || {}, bits = [];
    if (e.cores?.health || e.health) bits.push(`health +${e.health || e.cores.health}`);
    if (e.cores?.stamina || e.stamina) bits.push(`stamina +${e.stamina || e.cores.stamina}`);
    if (e.cores?.focus || e.focus) bits.push(`Focus +${e.focus || e.cores.focus}`);
    if (e.horse) bits.push(e.horse.revive ? 'revives a fallen horse' : `horse stamina +${e.horse.stamina || 0}, bond`);
    if (d.slot) bits.push(`worn: ${d.slot}`);
    if (d.pack) bits.push(`box of ${d.pack}`);
    return bits.join(' · ') || (d.category === 'tool' ? 'Reusable.' : '');
  }
  /** Small drawn previews per category (cached data URLs). */
  _icon(id) {
    if (this._icons.has(id)) return this._icons.get(id);
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const d = ITEMS[id], cat = id === 'horse' ? 'horsebuy' : WEAPONS[id] && !d ? 'gun' : d?.category || (DRINKS.some((k) => k.id === id) ? 'drink' : 'misc');
    x.lineWidth = 3; x.strokeStyle = '#2a1d12'; x.fillStyle = '#8a6a48';
    const rr = (a, b, w, h, r = 4) => { x.beginPath(); x.roundRect ? x.roundRect(a, b, w, h, r) : x.rect(a, b, w, h); x.fill(); x.stroke(); };
    if (cat === 'food') { x.fillStyle = '#9a9a92'; rr(18, 14, 28, 38, 6); x.fillStyle = '#b8462a'; x.fillRect(19, 24, 26, 14); }
    else if (cat === 'ammo') { x.fillStyle = '#7a5a30'; rr(10, 22, 44, 30); for (let i = 0; i < 4; i++) { x.fillStyle = '#c8a050'; x.fillRect(14 + i * 10, 10, 6, 14); } }
    else if (cat === 'tonic') { x.fillStyle = id.startsWith('health') ? '#a03030' : id.startsWith('stamina') ? '#c8a030' : '#3060a0'; rr(22, 18, 20, 36, 5); x.fillStyle = '#5a4030'; x.fillRect(27, 8, 10, 10); }
    else if (cat === 'horse' || cat === 'horsebuy') { x.fillStyle = '#7a5030'; x.beginPath(); x.ellipse(32, 38, 20, 12, 0, 0, 7); x.fill(); x.stroke(); x.beginPath(); x.moveTo(46, 32); x.lineTo(56, 14); x.lineTo(60, 18); x.lineTo(52, 36); x.fill(); x.stroke(); }
    else if (cat === 'clothing') { x.fillStyle = '#4a3a2a'; x.beginPath(); x.ellipse(32, 40, 26, 7, 0, 0, 7); x.fill(); x.stroke(); rr(20, 18, 24, 22, 8); }
    else if (cat === 'gun') { x.fillStyle = '#3a3a3a'; x.fillRect(6, 26, 40, 7); x.fillStyle = '#6a4a2a'; x.beginPath(); x.moveTo(40, 26); x.lineTo(58, 30); x.lineTo(58, 42); x.lineTo(44, 36); x.fill(); x.stroke(); }
    else if (cat === 'pelt') { x.fillStyle = '#8a6a4a'; x.beginPath(); x.moveTo(10, 20); x.lineTo(54, 16); x.lineTo(50, 48); x.lineTo(14, 52); x.closePath(); x.fill(); x.stroke(); }
    else if (cat === 'valuable') { x.fillStyle = '#d8b040'; x.beginPath(); x.arc(32, 32, 16, 0, 7); x.fill(); x.stroke(); }
    else if (cat === 'drink') { x.fillStyle = id === 'coffee_cup' ? '#3a2410' : '#c88a30'; rr(20, 22, 24, 30, 3); x.strokeStyle = 'rgba(255,255,255,0.5)'; x.beginPath(); x.moveTo(24, 26); x.lineTo(24, 46); x.stroke(); }
    else { x.fillStyle = '#7a6a5a'; rr(14, 14, 36, 36); }
    const url = c.toDataURL(); this._icons.set(id, url);
    return url;
  }

  /** The bounty board: every poster, plus Eli's own when there's a price on his head. */
  openBoard(townId = 'copperbell') { this.game.ui.openScreen('board', { townId }); return true; }
  _buildBoard() {
    const g = this.game, ui = g.ui, wrap = document.createElement('div'); wrap.className = 'sd-panel sd-shop';
    wrap.append(Object.assign(document.createElement('h2'), { className: 'sd-title', textContent: 'Bounty board' }));
    const grid = document.createElement('div'); grid.className = 'sd-posters';
    const law = g.sys('law'), total = law.totalBounty?.() || 0;
    const list = total > 0 ? [{ name: 'Eli Rourke', crime: 'Crimes in Ashwater County', alive: Math.round(total * 1.5), dead: Math.round(total), seed: 7 }, ...WANTED] : WANTED;
    for (const e of list) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 352; const x = c.getContext('2d');
      x.fillStyle = '#e4d6b0'; x.fillRect(0, 0, 256, 352); x.fillStyle = '#2a1d12'; x.textAlign = 'center';
      x.font = '42px Rye, Georgia, serif'; x.fillText('WANTED', 128, 50);
      x.font = 'italic 15px Georgia, serif'; x.fillText('DEAD OR ALIVE', 128, 70);
      sketchPortrait(x, 36, 84, 184, 156, e.seed, { female: e.female });
      x.strokeStyle = '#2a1d12'; x.lineWidth = 2; x.strokeRect(34, 82, 188, 160);
      x.font = '20px Rye, Georgia, serif'; x.fillText(e.name.toUpperCase(), 128, 270);
      x.font = '14px Georgia, serif'; x.fillText(e.crime, 128, 290);
      x.font = '24px Rye, Georgia, serif'; x.fillText(`$${e.alive} REWARD`, 128, 326);
      grid.append(c);
    }
    wrap.append(grid, Object.assign(document.createElement('p'), { className: 'sd-hint', textContent: 'Bring them in alive for the full reward. (Bounty jobs open up as you take work around the county.)' }));
    if (total > 0) wrap.append(Object.assign(document.createElement('p'), { className: 'sd-hint', textContent: `There's $${total.toFixed(2)} on your own head. Pay it inside at the sheriff's desk or at the post office.` }));
    wrap.append(ui.button('Close', () => ui.closeScreen()));
    return wrap;
  }

  serialize() { return { stock: this.stock, day: this._day, horses: Object.fromEntries(Object.entries(SHOPS).filter(([, S]) => S.horses).map(([id, S]) => [id, S.horses.map((h) => h.name)])) }; }
  deserialize(d) {
    if (!d) return;
    if (d.stock) { this.stock = d.stock; this._day = d.day ?? -1; }
    if (d.horses) for (const [id, names] of Object.entries(d.horses)) if (SHOPS[id]?.horses) SHOPS[id].horses = SHOPS[id].horses.filter((h) => names.includes(h.name));
  }
}

const BREED_NOTES = { mustang: 'Hardy and sure-footed.', morgan: 'Steady, with stamina to spare.', quarter: 'Quick off the mark.', thoroughbred: 'The fastest thing on four legs in the county.', draft: 'Slow, strong, unflappable.' };
const REGION_NAMES = { copperbell: 'Ashwater Valley', blackstone: 'Blackstone Hills', saltmesa: 'Saltmesa', greywind: 'Greywind Range' };

export { Shops, DRINKS };
