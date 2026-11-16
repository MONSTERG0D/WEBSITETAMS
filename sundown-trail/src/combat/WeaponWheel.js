import { WEAPONS } from '../data/weapons.js';

/**
 * The weapon wheel (Part 6, GAME_BIBLE §9): hold Tab (LB, or the Guns button) to open a radial parchment wheel; the
 * world slows to 0.4, moving the mouse or right stick picks a slot, and releasing equips it. On touch, tap a slot.
 * Slots show each owned weapon with rounds in the gun and carried. The "holster" slot puts the gun away.
 */
export const TUNING = { timeScale: 0.4, deadZone: 0.25, radius: 128, gain: 9 };

const ORDER = ['revolver', 'repeater', 'rifle', 'shotgun', 'bow', 'knife', 'lasso'];
const CSS = `
.sd-wheel{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none;opacity:0;transition:opacity .12s;z-index:40}
.sd-wheel.sd-on{opacity:1;pointer-events:auto}
.sd-wheel-ring{position:absolute;left:-170px;top:-170px;width:340px;height:340px;border-radius:50%;
  background:radial-gradient(circle,rgba(230,215,184,.94) 0 34%,rgba(205,182,139,.92) 35% 68%,rgba(160,130,90,.0) 70%);
  box-shadow:0 0 40px rgba(0,0,0,.45);transform:scale(calc(var(--ui-scale,1)))}
.sd-wheel-slot{position:absolute;width:96px;height:58px;margin:-29px 0 0 -48px;border-radius:10px;text-align:center;color:var(--ink,#2b1d12);
  font:12px/1.15 var(--font-body,Georgia,serif);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;
  background:rgba(240,228,200,.55);border:1px solid rgba(43,29,18,.25)}
.sd-wheel-slot b{font:15px var(--font-display,Georgia,serif)}
.sd-wheel-slot.sd-sel{background:var(--rust,#8a3b1e);color:#f4ead6;border-color:#f4ead6;transform:scale(1.08)}
.sd-wheel-slot.sd-cur::after{content:'•';position:absolute;top:2px;right:7px}
.sd-wheel-mid{position:absolute;left:110px;top:142px;width:120px;height:56px;text-align:center;color:var(--ink,#2b1d12);font:13px/1.2 var(--font-body,Georgia,serif)}
.sd-wheel-mid b{display:block;font:16px var(--font-display,Georgia,serif)}
`;

export class WeaponWheel {
  constructor(game, combat) {
    this.game = game; this.combat = combat; this.open = false; this.sel = null; this.vx = 0; this.vy = 0; this.slots = [];
    if (!document.getElementById('sd-wheel-css')) { const s = document.createElement('style'); s.id = 'sd-wheel-css'; s.textContent = CSS; document.head.append(s); }
    this.el = document.createElement('div'); this.el.className = 'sd-wheel';
    this.ring = document.createElement('div'); this.ring.className = 'sd-wheel-ring';
    this.mid = document.createElement('div'); this.mid.className = 'sd-wheel-mid';
    this.ring.append(this.mid); this.el.append(this.ring);
    (game.ui.hud || game.uiRoot).append(this.el);
  }

  _build() {
    const A = this.combat.arsenal, ids = ORDER.filter((id) => A.owned.has(id));
    const items = [...ids, 'holster'];
    for (const s of this.slots) s.el.remove();
    this.slots = items.map((id, i) => {
      const a = (i / items.length) * Math.PI * 2 - Math.PI / 2, x = Math.cos(a) * TUNING.radius + 170, y = Math.sin(a) * TUNING.radius + 170;
      const el = document.createElement('div'); el.className = 'sd-wheel-slot'; el.style.left = `${x}px`; el.style.top = `${y}px`;
      const w = WEAPONS[id];
      const name = id === 'holster' ? 'Fists' : w.name.replace(/^(Drover|Harlan|Boone|Longshot|Ash|Skinning|Rope)\s/, '');
      const ammo = id === 'holster' || !w.mag ? '' : `${A.mags[id] ?? 0} | ${A.reserve(id)}`;
      el.innerHTML = `<b>${name.split(' ').slice(-1)[0]}</b>${ammo}`;
      el.classList.toggle('sd-cur', id === 'holster' ? A.unarmed || !A.drawn : id === A.current && A.drawn);
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.sel = id; this.close(true); });
      this.ring.append(el);
      return { id, el, a };
    });
  }

  show() {
    if (this.open) return;
    this.open = true; this.vx = 0; this.vy = 0; this.sel = null;
    this._build(); this.el.classList.add('sd-on');
    this.game.get('focus')?.requestTime?.('wheel', TUNING.timeScale);
    this._label();
  }
  /** @param {boolean} apply equip the selection */
  close(apply = true) {
    if (!this.open) return;
    this.open = false; this.el.classList.remove('sd-on');
    this.game.get('focus')?.requestTime?.('wheel', null);
    if (!apply || !this.sel) return;
    const A = this.combat.arsenal;
    if (this.sel === 'holster') { A.holster(); A.unarmed = true; return; }
    if (this.sel !== A.current) this.combat.equip(this.sel);
    if (!A.drawn) A.draw();
  }

  /** Call every frame before the camera reads the look input. Returns true while the wheel is open. */
  update() {
    const g = this.game, input = g.input;
    const want = g.state === 'playing' && !g.ui.isScreenOpen() && input.isDown('weaponWheel');
    if (want && !this.open) this.show();
    else if (!want && this.open) this.close(true);
    if (!this.open) return false;
    // steer with the look input (mouse, right stick, touch drag); the camera stays still meanwhile
    const look = input.look;
    this.vx += look.x * TUNING.gain; this.vy += look.y * TUNING.gain;
    const m = Math.hypot(this.vx, this.vy);
    if (m > 1) { this.vx /= m; this.vy /= m; }
    look.x = 0; look.y = 0;
    if (Math.hypot(this.vx, this.vy) > TUNING.deadZone) {
      const a = Math.atan2(this.vy, this.vx); // look.x grows moving right, look.y moving down: screen space, like the slots
      let best = null, bd = Infinity;
      for (const s of this.slots) { let d = Math.abs(Math.atan2(Math.sin(s.a - a), Math.cos(s.a - a))); if (d < bd) { bd = d; best = s; } }
      if (best && best.id !== this.sel) { this.sel = best.id; g.audio.play('ui_tick', { volume: 0.4 }); this._label(); }
    }
    for (const s of this.slots) s.el.classList.toggle('sd-sel', s.id === this.sel);
    return true;
  }
  _label() {
    const A = this.combat.arsenal, id = this.sel || A.current, w = WEAPONS[id];
    this.mid.innerHTML = id === 'holster' ? '<b>Fists</b>holster the gun' : w ? `<b>${w.name.split(' ').slice(-1)[0]}</b>${w.mag ? `${A.mags[id] ?? 0} in the gun · ${A.reserve(id)} carried` : w.melee ? 'blade' : 'rope'}` : '';
  }
  dispose() { this.el.remove(); }
}
