import * as THREE from 'three';
import System from '../core/System.js';
import { EVENTS } from '../core/Events.js';
import { WORLD } from '../data/world.js';
import { ECONOMY } from '../data/economy.js';
import { ITEMS } from '../data/items.js';
import { WEAPONS } from '../data/weapons.js';
import { PropBuilder } from '../world/props/Kit.js';
import { createTownKit } from '../town/Buildings.js';
import { createSignAtlas } from '../town/Signs.js';
import { rng } from '../world/props/Builders.js';
import { hash } from '../town/Buildings.js';
import { RanchLife } from './RanchLife.js';
import { RANCH_INCOME, WINDMILL_MULTIPLIER } from './Economy.js';
import { STRUCTURES, LAYOUT, ranchFrame, buildStructure, buildYard } from './RanchBuilder.js';
import { registerLedger } from './Ledger.js';

/**
 * The 'ranch' system (Part 13, GAME_BIBLE §6 ranch upgrades; §11 ranch: level(structure) · upgrade(structure) ·
 * dailyIncome()). The Rourke Ranch grows from ruin to homestead: buy an upgrade in the ledger and the work is done
 * overnight (sleep, or wait for morning), then a short camera reveal shows it if you're there. Every upgrade
 * changes the ranch visibly and does something:
 *  house      bed (sleep, save, respawn), wardrobe, map-table fast travel, weapon locker, lit windows
 *  barn       stable (Abel can bring a second horse)        corral     breeding income, Abel's horse pen
 *  garden     daily income and a basket of food             smokehouse income, butchers pay 25% more for meat
 *  bunkhouse  room for more than one companion              lookout    threats show on the map (Part 14 reads it)
 *  windmill   (and well) every income ×1.5
 * Income arrives each in-game morning. The ranch is registered with the towns system as a place, so its house has
 * an interior zone (reverb, muffled ambience), a real door, lit lamps and an NPC waypoint graph.
 */
export const TUNING = {
  income: { ...RANCH_INCOME }, windmillMultiplier: WINDMILL_MULTIPLIER, meatMultiplier: 1.25, morningHour: 6, maxBackPay: 3,
  revealSeconds: 3.2, revealRange: 160, donation: 5, donationHonor: 1, donationMaxPerDay: 10, travelBase: 2, travelPerKm: 4, travelHoursPerKm: 3,
  needsHouse: ['barn', 'corral', 'garden', 'smokehouse', 'bunkhouse', 'lookout', 'windmill'], radius: 60,
};
const TOWNS = { copperbell: 'Copperbell', saltmesa: 'Saltmesa Trading Post', greywind: 'Greywind Lumber Camp' };
const OUTFITS = { coat_duster: 'duster', coat_sheepskin: 'sheepskin', vest: 'vest' };
const HATS = { hat_flat_brim: 'flat', hat_cattleman: 'cattleman', hat_bowler: 'bowler', hat_gambler: 'gambler' };
const _v = new THREE.Vector3();

export { ECONOMY_MODEL, economyCheck } from './Economy.js';

export default class Ranch extends System {
  constructor(game) {
    super(game);
    this.levels = Object.fromEntries(STRUCTURES.map((s) => [s, 0]));
    this.pending = []; this.history = []; this.structures = {}; this.yard = {}; this.handles = [];
    this.lastDay = null; this.donated = { day: 0, honor: 0 }; this.visited = new Set(); this.locker = [];
    this.look = { hat: 'flat', outfit: 'duster' }; this.stats = { income: 0, built: 0 };
  }

  async init() {
    const g = this.game, T = g.sys('terrain'), L = WORLD.locations.ranch;
    this.terrain = T;
    const towns = g.get('towns');
    this.kit = towns?.kit || createTownKit(WORLD.seed, (this._signs = createSignAtlas()).tex, null);
    this.signs = towns?.signs || this._signs || createSignAtlas();
    const pad = (T.pads || []).find((p) => Math.hypot(p.x - L.x, p.z - L.z) < 10);
    this.center = new THREE.Vector3(L.x, pad ? pad.y : T.getHeightAt(L.x, L.z), L.z);
    this.R = ranchFrame(this.center, T);
    this.place = towns?.registerPlace?.('ranch', 'Rourke Ranch', this.center, TUNING.radius) || null;
    this.group = new THREE.Group(); this.group.name = 'Ranch'; g.scene.add(this.group);
    // the Part 3 ruin is replaced by this system's own stages
    const props = g.get('props');
    if (props?.areas?.ranch) {
      props.areas.ranch.visible = false;
      const gone = new Set(props.areaColliders?.ranch || []);
      for (const c of gone) g.physics.removeCollider(c);
      props.colliders = props.colliders.filter((c) => !gone.has(c));
    }
    this._yard();
    for (const s of STRUCTURES) this._build(s);
    this._refreshPlace();
    registerLedger(this);
    this._registerScreens();
    this.life = new RanchLife(this);
    g.events.on(EVENTS.CAMP_SLEPT, () => this._morning(true));
    g.events.on(EVENTS.ZONE_ENTERED, ({ zone }) => { const id = String(zone || '').split('/')[0]; if (TOWNS[id]) this.visited.add(id); });
    g.events.on(EVENTS.GAME_START, ({ newGame } = {}) => { if (newGame) this._reset(); });
    g.debug?.addTuning('Ranch', TUNING);
  }

  // ---------------------------------------------------------------- Bible API
  /** 0 = ruin or bare ground, 1 = built. */
  level(structure) { return this.levels[structure] ?? 0; }
  /** What an upgrade costs and does (data/economy.js). */
  info(structure) { return ECONOMY.ranchUpgrades[structure]; }
  /** Why an upgrade can't be bought right now, or null. */
  blocked(structure) {
    const d = this.info(structure);
    if (!d) return 'Unknown work.';
    if (this.level(structure) > 0) return 'Already built.';
    if (this.pending.includes(structure)) return 'Being built tonight.';
    if (TUNING.needsHouse.includes(structure) && !this.level('house') && !this.pending.includes('house')) return 'Repair the house first.';
    if (this.game.sys('wallet').money < d.cost) return `You need $${d.cost}.`;
    return null;
  }
  /** Pays for an upgrade; the work is done overnight. @returns {boolean} */
  upgrade(structure) {
    const g = this.game, why = this.blocked(structure);
    if (why) { g.ui.notify(why); return false; }
    const d = this.info(structure);
    if (!g.sys('wallet').spend(d.cost, `ranch:${structure}`)) return false;
    this.pending.push(structure);
    g.audio.play('cash_register', { volume: 0.6 });
    g.ui.notify(`${d.name}: paid $${d.cost}. Mae will have the hands on it tonight; it'll be done by morning.`, { duration: 4 });
    return true;
  }
  /** Money the ranch makes each morning. */
  dailyIncome() {
    let sum = 0;
    for (const [k, v] of Object.entries(TUNING.income)) if (this.level(k)) sum += v;
    if (this.level('windmill')) sum *= TUNING.windmillMultiplier;
    return Math.round(sum * 100) / 100;
  }
  /** Income lines for the ledger: [[label, dollars]] */
  incomeLines() {
    const out = [];
    for (const [k, v] of Object.entries(TUNING.income)) if (this.level(k)) out.push([this.info(k).name, v]);
    if (this.level('windmill')) out.push(['Windmill and well (×1.5)', Math.round((this.dailyIncome() - out.reduce((s, x) => s + x[1], 0)) * 100) / 100]);
    return out;
  }
  /** Butchers pay more for meat once the smokehouse stands. */
  meatMultiplier() { return this.level('smokehouse') ? TUNING.meatMultiplier : 1; }
  /** Lookout tower: Part 14's map shows threats near the ranch. */
  get threatsOnMap() { return this.level('lookout') > 0; }
  /** Named places in the yard (fire, seats, well, woodpile, trough, hay, corral, porch, door, barn, garden…). */
  spot(name) { for (const s of Object.values(this.structures)) if (s.out?.spots?.[name]) return s.out.spots[name]; return this.yard[name] || null; }
  anchor(name) { return this.structures.house?.out?.anchors?.[name] || null; }
  /** Is Eli on the ranch? */
  isHome(p = this.game.player.position) { return Math.hypot(p.x - this.center.x, p.z - this.center.z) < TUNING.radius; }
  /** Max companions living here: one, or all with the bunkhouse. */
  get beds() { return this.level('bunkhouse') ? 3 : 1; }

  /** Donation box: $5 to the church poor box, +1 honor each, at most +10 honor a day. */
  donate() {
    const g = this.game, day = g.sys('sky').day || 1;
    if (this.donated.day !== day) this.donated = { day, honor: 0 };
    if (this.donated.honor >= TUNING.donationMaxPerDay) { g.ui.notify('The poor box has had enough from you today.'); return false; }
    if (!g.sys('wallet').spend(TUNING.donation, 'donation')) { g.ui.notify(`You need $${TUNING.donation}.`); return false; }
    this.donated.honor += TUNING.donationHonor;
    g.get('honor')?.change?.(TUNING.donationHonor, 'donation');
    g.audio.play('coins', { volume: 0.6 });
    return true;
  }

  // ---------------------------------------------------------------- per frame: mornings
  update(dt) {
    const g = this.game, sky = g.sys('sky');
    if (g.state !== 'playing') return;
    const day = sky.day || 1, h = sky.timeOfDay ?? 12;
    if (this.lastDay === null) this.lastDay = h >= TUNING.morningHour ? day : day - 1;
    if (day > this.lastDay && h >= TUNING.morningHour) this._morning(false);
    for (const s of Object.values(this.structures)) for (const f of s.out?.fans || []) f.rotation.z += dt * 1.6;
    this.life?.update(dt);
    this._smoke(h);
  }
  /** A new morning (or a sleep): finish overnight work, pay the day's income. */
  _morning(slept) {
    const g = this.game, sky = g.sys('sky'), day = sky.day || 1, h = sky.timeOfDay ?? 12;
    const mornings = Math.max(0, Math.min(TUNING.maxBackPay, (h >= TUNING.morningHour ? day : day - 1) - (this.lastDay ?? day)));
    if (this.pending.length && (mornings > 0 || slept)) this._finishWork();
    if (mornings > 0) {
      this.lastDay = h >= TUNING.morningHour ? day : day - 1;
      const pay = this.dailyIncome() * mornings;
      if (pay > 0) { g.sys('wallet').add(pay, 'ranch'); this.stats.income += pay; g.ui.notify(`Ranch income: $${pay.toFixed(2)}${mornings > 1 ? ` (${mornings} days)` : ''}.`, { duration: 3.5 }); }
      if (this.level('garden')) { const inv = g.sys('inventory'); inv.add('apple', 2); inv.add('carrots', 2); }
      g.events.emit('ranch:morning', { day, income: pay });
    }
  }
  _finishWork() {
    const g = this.game, done = this.pending.splice(0);
    for (const s of done) {
      this.levels[s] = 1; this._build(s); this.history.push({ structure: s, day: g.sys('sky').day || 1 });
      this.stats.built++;
      g.events.emit(EVENTS.RANCH_UPGRADED, { structure: s, level: 1 });
    }
    this._refreshPlace();
    const names = done.map((s) => this.info(s).name).join(', ');
    if (this.isHome() || g.player.position.distanceTo(this.center) < TUNING.revealRange) this.reveal(done[done.length - 1], names);
    else g.ui.notify(`Back at the ranch: ${names} finished.`, { duration: 4 });
  }
  /** A short camera move around a finished structure, with a puff of dust. */
  reveal(structure, label = null) {
    const g = this.game, P = LAYOUT[structure], target = this.R.world(P.x, P.z), cam = g.cameraRig;
    if (!cam || g.ui.isScreenOpen()) { g.ui.notify(`${label || this.info(structure).name} is finished.`); return; }
    g.sys('vfx').spawn('impact_dirt', { position: target, scale: 4 });
    const r = Math.max(12, (P.w || 6) * 1.6), t0 = performance.now(), base = this.R.yaw + Math.PI * 0.85;
    g.ui.notify(`${label || this.info(structure).name} — finished.`, { duration: TUNING.revealSeconds });
    g.ui.letterbox?.(true);
    cam.override = (c) => {
      const k = Math.min(1, (performance.now() - t0) / (TUNING.revealSeconds * 1000)), a = base + k * 0.9;
      c.position.set(target.x + Math.sin(a) * r, target.y + 4 + k * 2, target.z + Math.cos(a) * r);
      c.lookAt(target.x, target.y + 2.5, target.z);
      if (k >= 1) { cam.override = null; g.ui.letterbox?.(false); }
    };
  }

  // ---------------------------------------------------------------- building
  _ctx(B) { return { B, T: this.terrain, R: this.R, signs: this.signs, kit: this.kit, rand: rng(hash(`ranch:${B._seed || 1}`)) }; }
  _yard() {
    const B = new PropBuilder(this.kit); B._seed = 'yard';
    this.yard = buildYard(this._ctx(B));
    const grp = new THREE.Group(); grp.name = 'Ranch yard'; B.build(grp, 'ranch yard'); this.group.add(grp);
    this._yardCols = B.colliders.map((c) => this.game.physics.addCollider(c));
  }
  _build(name) {
    const g = this.game, old = this.structures[name], towns = g.get('towns');
    if (old) {
      old.group.removeFromParent(); old.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      for (const c of old.colliders) g.physics.removeCollider(c);
      for (const b of old.out.buildings) { towns?.removeDoors?.(b); if (this.place) this.place.buildings.splice(this.place.buildings.indexOf(b), 1); }
      if (towns) towns.lamps = towns.lamps.filter((l) => !old.out.lamps.includes(l.pos));
      if (towns?.fans) towns.fans = towns.fans.filter((f) => !old.out.fans.includes(f));
      for (const f of old.out.fans) f.removeFromParent();
    }
    const B = new PropBuilder(this.kit); B._seed = `${name}:${this.level(name)}`;
    const out = buildStructure(name, this.level(name), this._ctx(B));
    const grp = new THREE.Group(); grp.name = `Ranch ${name}`; B.build(grp, `ranch ${name}`); this.group.add(grp);
    for (const f of out.fans) this.group.add(f);
    const colliders = B.colliders.map((c) => g.physics.addCollider(c));
    for (const b of out.buildings) { b.inv = b.local.M.clone().invert(); b.at = name; this.place?.buildings.push(b); }
    if (towns) for (const p of out.lamps) towns.lamps.push({ pos: p, town: this.place, interior: false });
    this.structures[name] = { group: grp, colliders, out };
    if (this._smokeFx) { for (const f of this._smokeFx) f.stop(); this._smokeFx = null; } // chimneys moved: restart the smoke
  }
  /** Doors, the waypoint graph and the house's interactions after a change. */
  _refreshPlace() {
    const g = this.game, towns = g.get('towns');
    if (this.place) {
      this.place.spots.street = this.yard.street || [];
      this.place.spots.homes = [];
      towns.addDoors('ranch'); towns.refreshGraph?.('ranch');
    }
    this.life?.register();
    for (const h of this.handles) g.interact.unregister(h);
    this.handles.length = 0;
    const reg = (pos, label, fn, cond = null, radius = 1.6) => pos && this.handles.push(g.interact.register({ position: pos, radius, priority: 0.5, label, onInteract: fn, condition: cond }));
    const house = this.level('house') > 0, ui = g.ui;
    reg(this.anchor('ledger'), 'Open the ranch ledger', () => ui.openScreen('ledger'));
    if (house) {
      reg(this.anchor('bed'), 'Sleep', () => ui.openScreen('ranch_sleep'));
      reg(this.anchor('wardrobe'), 'Wardrobe', () => ui.openScreen('wardrobe'));
      reg(this.anchor('map'), 'Map table: travel', () => ui.openScreen('maptable'));
      reg(this.anchor('locker'), 'Weapon locker', () => ui.openScreen('locker'));
    }
  }
  _smoke(h) {
    const want = (h >= 17 || h < 8) && !!(this.level('house') || this.level('smokehouse'));
    if (want === !!this._smokeFx) return;
    if (want) { const vfx = this.game.sys('vfx'); this._smokeFx = []; for (const s of Object.values(this.structures)) for (const c of s.out.chimneys) this._smokeFx.push(vfx.spawn('chimney_smoke', { position: c })); }
    else { for (const f of this._smokeFx) f.stop(); this._smokeFx = null; }
  }

  // ---------------------------------------------------------------- house screens: sleep, wardrobe, map table, locker
  _registerScreens() {
    const g = this.game, ui = g.ui, el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    const panel = (title, sub) => { const w = el('div', 'sd-panel sd-shop sd-ranch'); const h = el('div', 'sd-shop-head'); h.append(el('h2', 'sd-title', title)); if (sub) h.append(el('small', null, sub)); w.append(h); return w; };
    ui.registerScreen('ranch_sleep', { build: () => {
      const w = panel('Sleep at home', 'Your own bed. The game saves, and you wake here if things go badly.'), m = el('nav', 'sd-menu');
      const h = g.sys('sky').timeOfDay ?? 12;
      for (const [label, to] of [['Until morning', 7], ['Until evening', 19]]) { const hrs = ((to - h + 24) % 24) || 24; if (hrs >= 1 && hrs <= 14) m.append(ui.button(`${label} (${Math.round(hrs)} h)`, () => { ui.closeScreen(); this.sleep(hrs); }, { primary: to === 7 })); }
      for (const n of [2, 4, 8]) m.append(ui.button(`${n} hours`, () => { ui.closeScreen(); this.sleep(n); }));
      m.append(ui.button('Not yet', () => ui.closeScreen())); w.append(m); return w;
    } });
    ui.registerScreen('wardrobe', { build: () => {
      const w = panel('Wardrobe', 'Hats and coats you own. The sheepskin keeps the cold of the high country off.'), inv = g.sys('inventory'), list = el('div', 'sd-shop-list');
      const row = (label, on, fn) => { const r = el('div', 'sd-shop-row'); r.append(el('span'), el('div', null, label), on ? el('small', null, 'wearing') : ui.button('Wear', () => { fn(); ui.closeScreen(); ui.openScreen('wardrobe'); })); list.append(r); };
      list.append(el('div', 'sd-shop-cat', 'Hats'));
      row("Eli's old flat-brim", this.look.hat === 'flat' && !this.look.hatItem, () => this.wear({ hat: 'flat', hatItem: null }));
      for (const [id, style] of Object.entries(HATS)) if (inv.has(id) && id !== 'hat_flat_brim') row(ITEMS[id].name, this.look.hatItem === id, () => this.wear({ hat: style, hatItem: id }));
      row('No hat', this.look.hat === 'none', () => this.wear({ hat: 'none', hatItem: null }));
      list.append(el('div', 'sd-shop-cat', 'Coats'));
      row("Eli's duster", this.look.outfit === 'duster' && !this.look.coatItem, () => this.wear({ outfit: 'duster', coatItem: null }));
      for (const [id, style] of Object.entries(OUTFITS)) if (inv.has(id) && id !== 'coat_duster') row(ITEMS[id].name, this.look.coatItem === id, () => this.wear({ outfit: style, coatItem: id }));
      row('Shirtsleeves', this.look.outfit === 'shirt', () => this.wear({ outfit: 'shirt', coatItem: null }));
      w.append(list, ui.button('Close', () => ui.closeScreen(), { primary: true })); return w;
    } });
    ui.registerScreen('maptable', { build: () => {
      const w = panel('Map table', 'Ride to a place you have been. Time passes on the road; it costs a little for feed and the ferry.'), m = el('nav', 'sd-menu');
      for (const [id, name] of Object.entries(TOWNS)) {
        const c = this._townPoint(id), km = c ? c.distanceTo(this.center) / 1000 : 0, cost = Math.round((TUNING.travelBase + km * TUNING.travelPerKm) * 100) / 100;
        m.append(ui.button(`${name} — $${cost.toFixed(2)}, about ${Math.max(1, Math.round(km * TUNING.travelHoursPerKm))} h`, () => { ui.closeScreen(); this.travel(id); }, { disabled: !this.visited.has(id) || !c }));
      }
      m.append(ui.button('Stay home', () => ui.closeScreen())); w.append(m); return w;
    } });
    ui.registerScreen('locker', { build: () => {
      const w = panel('Weapon locker', 'Guns you leave here stay oiled and safe.'), list = el('div', 'sd-shop-list'), combat = g.get('combat'), label = (id) => WEAPONS[id]?.name || id;
      list.append(el('div', 'sd-shop-cat', 'Carried'));
      for (const id of combat?.arsenal?.owned || []) { if (['revolver', 'knife', 'lasso'].includes(id)) continue; const r = el('div', 'sd-shop-row'); r.append(el('span'), el('div', null, label(id))); r.append(ui.button('Store', () => { this.store(id); ui.closeScreen(); ui.openScreen('locker'); })); list.append(r); }
      list.append(el('div', 'sd-shop-cat', 'In the locker'));
      for (const id of this.locker) { const r = el('div', 'sd-shop-row'); r.append(el('span'), el('div', null, label(id))); r.append(ui.button('Take', () => { this.take(id); ui.closeScreen(); ui.openScreen('locker'); })); list.append(r); }
      w.append(list, ui.button('Close', () => ui.closeScreen(), { primary: true })); return w;
    } });
  }
  /** Sleeps in the ranch house: time passes, cores refill, the game saves, and this is where you'll wake after a bad day. */
  async sleep(hours = 8) {
    const g = this.game, sky = g.sys('sky'), pl = g.player;
    await g.ui.fade(true, 1);
    let t = (sky.timeOfDay ?? 12) + hours; if (t >= 24) { t -= 24; sky.day = (sky.day || 1) + 1; }
    sky.setTime(t);
    g.events.emit(EVENTS.CAMP_SLEPT, { hours });
    const door = this.spot('door'); if (door) { pl.spawn.set(door.x, 0, door.z); }
    const horse = g.get('horses')?.playerHorse; if (horse && !horse.rider) { const p = this.spot('hay') || this.center; horse.position.set(p.x + 2, this.terrain.getHeightAt(p.x + 2, p.z), p.z); horse.animator?.teleported?.(); }
    g.save?.autosave?.(true);
    await g.ui.fade(false, 1);
    g.ui.notify(`You slept ${Math.round(hours)} hours at home.`);
  }
  /** Changes Eli's clothes (wardrobe). */
  wear(change) {
    Object.assign(this.look, change);
    this.game.player.human?.setLook?.({ hat: this.look.hat, outfit: this.look.outfit });
    this.game.events.emit('ranch:outfit', { ...this.look });
  }
  /** Cold drain multiplier for Survival (sheepskin halves it). */
  coldFactor() { return this.look.outfit === 'sheepskin' ? 0.5 : 1; }
  store(id) { const A = this.game.get('combat')?.arsenal; if (!A?.owned.has(id) || ['revolver', 'knife', 'lasso'].includes(id)) return false; A.remove(id); this.locker.push(id); return true; }
  take(id) { const i = this.locker.indexOf(id); if (i < 0) return false; this.locker.splice(i, 1); this.game.get('combat')?.arsenal?.give(id); return true; }
  _townPoint(id) { const t = this.game.get('towns')?.towns?.get(id); const L = id === 'copperbell' ? WORLD.locations.copperbell : id === 'saltmesa' ? WORLD.locations.saltmesaPost : WORLD.locations.lumberCamp; const s = t?.spots?.street?.[0]; return s ? s.clone() : new THREE.Vector3(L.x + 8, this.terrain.getHeightAt(L.x + 8, L.z + 8), L.z + 8); }
  /** Map-table travel: pay, fade, hours pass, arrive with your horse. */
  async travel(id) {
    const g = this.game, dest = this._townPoint(id); if (!dest || !this.visited.has(id)) return false;
    const km = dest.distanceTo(this.center) / 1000, cost = Math.round((TUNING.travelBase + km * TUNING.travelPerKm) * 100) / 100;
    if (!g.sys('wallet').spend(cost, 'travel')) { g.ui.notify(`The trip costs $${cost.toFixed(2)}.`); return false; }
    await g.ui.fade(true, 0.8);
    const sky = g.sys('sky'); let t = (sky.timeOfDay ?? 12) + Math.max(1, km * TUNING.travelHoursPerKm); if (t >= 24) { t -= 24; sky.day = (sky.day || 1) + 1; } sky.setTime(t);
    const pl = g.player; if (pl.state === 'mounted') g.get('horses')?.dismountPlayer?.({ instant: true });
    pl.teleport(dest.x, dest.z);
    const horse = g.get('horses')?.playerHorse; if (horse) { horse.position.set(dest.x + 3, this.terrain.getHeightAt(dest.x + 3, dest.z + 2), dest.z + 2); horse.animator?.teleported?.(); }
    await g.ui.fade(false, 0.8);
    g.ui.notify(`You ride into ${TOWNS[id]}.`);
    return true;
  }

  _reset() {
    for (const s of STRUCTURES) { const was = this.levels[s]; this.levels[s] = 0; if (was) this._build(s); }
    this.pending = []; this.history = []; this.lastDay = null; this.visited.clear(); this.locker = []; this.look = { hat: 'flat', outfit: 'duster' };
    this._refreshPlace();
  }
  serialize() { return { levels: { ...this.levels }, pending: [...this.pending], history: this.history.slice(-40), lastDay: this.lastDay, donated: { ...this.donated }, visited: [...this.visited], locker: [...this.locker], look: { ...this.look }, chores: this.life?.serialize() }; }
  deserialize(d) {
    if (!d) return;
    for (const s of STRUCTURES) { const v = d.levels?.[s] ? 1 : 0; if (v !== this.levels[s]) { this.levels[s] = v; this._build(s); } }
    this.pending = (d.pending || []).filter((s) => STRUCTURES.includes(s)); this.history = d.history || []; this.lastDay = d.lastDay ?? null;
    this.donated = d.donated || { day: 0, honor: 0 }; this.visited = new Set(d.visited || []); this.locker = d.locker || [];
    if (d.look) this.wear(d.look);
    this.life?.deserialize(d.chores);
    this._refreshPlace();
  }
  dispose() { for (const h of this.handles) this.game.interact.unregister(h); this.group.removeFromParent(); }
}
void _v; void PropBuilder;
