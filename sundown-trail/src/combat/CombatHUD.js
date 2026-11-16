/**
 * Combat HUD (Part 6): crosshair that blooms with movement and recoil, hit marker (white for a hit, rust with a
 * thicker cross for a kill), and a small ammo readout (rounds in the gun | carried) that also reloads on tap.
 * Part 14's HUD may restyle these elements; the combat system only calls the methods below.
 */
export const TUNING = { markerTime: 0.22, killTime: 0.5, idleFade: 3, minGap: 3, maxGap: 34 };

const CSS = `
.sd-cross{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none;opacity:0;transition:opacity .15s}
.sd-cross.sd-on{opacity:1}
.sd-cross i{position:absolute;background:rgba(245,235,215,.92);box-shadow:0 0 2px rgba(0,0,0,.7)}
.sd-cross .h{width:7px;height:2px;top:-1px}.sd-cross .v{width:2px;height:7px;left:-1px}
.sd-cross .dot{width:3px;height:3px;left:-1.5px;top:-1.5px;border-radius:50%}
.sd-cross.sd-target i{background:#e8a070}
.sd-cross.sd-bow .h{width:12px}
.sd-hitmark{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;pointer-events:none;opacity:0}
.sd-hitmark::before,.sd-hitmark::after{content:'';position:absolute;left:12px;top:0;width:2px;height:26px;background:#f4ead6;box-shadow:0 0 2px #000}
.sd-hitmark::before{transform:rotate(45deg)}.sd-hitmark::after{transform:rotate(-45deg)}
.sd-hitmark.sd-kill::before,.sd-hitmark.sd-kill::after{background:var(--rust,#8a3b1e);width:3px;left:11.5px}
.sd-ammo{position:absolute;right:calc(18px + env(safe-area-inset-right));bottom:calc(16px + env(safe-area-inset-bottom));font-family:var(--font-display,Georgia,serif);
  color:#f1e4c6;text-shadow:0 1px 3px #000;font-size:calc(20px * var(--ui-scale,1));opacity:0;transition:opacity .4s;pointer-events:auto;cursor:pointer;min-width:48px;min-height:48px;text-align:right}
.sd-ammo.sd-on{opacity:.9}.sd-ammo small{display:block;font-family:var(--font-body,Georgia,serif);font-size:.55em;opacity:.8;letter-spacing:.05em}
.sd-ammo.sd-empty b{color:#e07a50}
`;

export class CombatHUD {
  constructor(game, { onReload } = {}) {
    this.game = game;
    if (!document.getElementById('sd-combat-css')) { const s = document.createElement('style'); s.id = 'sd-combat-css'; s.textContent = CSS; document.head.append(s); }
    const root = game.ui.hud || game.uiRoot;
    this.cross = document.createElement('div'); this.cross.className = 'sd-cross';
    this.ticks = ['h', 'h', 'v', 'v'].map((c) => { const i = document.createElement('i'); i.className = c; this.cross.append(i); return i; });
    const dot = document.createElement('i'); dot.className = 'dot'; this.cross.append(dot);
    this.mark = document.createElement('div'); this.mark.className = 'sd-hitmark';
    this.ammo = document.createElement('div'); this.ammo.className = 'sd-ammo';
    this.ammo.addEventListener('pointerdown', (e) => { e.stopPropagation(); onReload?.(); });
    root.append(this.cross, this.mark, this.ammo);
    this._markT = 0; this._markDur = 1; this._idle = 0; this._gap = -1; this._ammoText = '';
  }

  /** @param {{aiming, gap (px), onTarget, bow, rounds, reserve, name, show}} s */
  update(rawDt, s) {
    this.cross.classList.toggle('sd-on', !!s.aiming);
    this.cross.classList.toggle('sd-target', !!s.onTarget);
    this.cross.classList.toggle('sd-bow', !!s.bow);
    const gap = Math.round(Math.max(TUNING.minGap, Math.min(TUNING.maxGap, s.gap)));
    if (gap !== this._gap) {
      this._gap = gap;
      const [l, r, u, d] = this.ticks, w = 7;
      l.style.left = `${-gap - w}px`; r.style.left = `${gap}px`; u.style.top = `${-gap - w}px`; d.style.top = `${gap}px`;
    }
    if (this._markT > 0) { this._markT -= rawDt; this.mark.style.opacity = String(Math.max(0, this._markT / this._markDur)); }
    // ammo: shown while a gun is out or for a few seconds after anything changes
    const text = s.name ? `<b>${s.rounds}</b> | ${Number.isFinite(s.reserve) ? s.reserve : '∞'}<small>${s.name}</small>` : '';
    if (text !== this._ammoText) { this._ammoText = text; this.ammo.innerHTML = text; this._idle = 0; }
    this._idle += rawDt;
    this.ammo.classList.toggle('sd-on', !!s.name && (s.show || this._idle < TUNING.idleFade));
    this.ammo.classList.toggle('sd-empty', !!s.name && s.rounds === 0);
  }
  hit(killed) {
    this.mark.classList.toggle('sd-kill', !!killed);
    this._markDur = this._markT = killed ? TUNING.killTime : TUNING.markerTime;
    this.mark.style.opacity = '1';
  }
  dispose() { this.cross.remove(); this.mark.remove(); this.ammo.remove(); }
}
