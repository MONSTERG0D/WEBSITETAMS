/**
 * Debug tools (only with ?debug=1 or on test pages): stats overlay, F1 tuning panel built from TUNING objects,
 * and console helpers on window.__game.debug.
 */
export class DebugPanel {
  constructor(game) {
    this.game = game; this.tunings = new Map(); this.visible = false; this._t = 0;
    this.overlay = document.createElement('pre'); this.overlay.className = 'sd-debug-overlay';
    this.panel = document.createElement('div'); this.panel.className = 'sd-debug-panel'; this.panel.hidden = true;
    const btn = document.createElement('button'); btn.className = 'sd-debug-btn'; btn.type = 'button'; btn.textContent = 'Tune';
    btn.addEventListener('click', () => this.toggle());
    document.body.append(this.overlay, this.panel, btn);
    window.addEventListener('keydown', (e) => { if (e.code === 'F1') { e.preventDefault(); this.toggle(); } });
    this._installHelpers();
  }
  /** Expose a TUNING object as sliders/toggles. meta: { key: { min, max, step } } */
  addTuning(name, obj, meta = {}) { this.tunings.set(name, { obj, meta }); if (this.visible) this._render(); }
  /** Added in Part 8: an extra overlay line from fn() → string (e.g. honor and reputation). */
  addLine(fn) { (this.lines || (this.lines = [])).push(fn); }
  toggle() { this.visible = !this.visible; this.panel.hidden = !this.visible; if (this.visible) this._render(); }
  update(rawDt) {
    this._t += rawDt;
    if (this._t < 0.25) return;
    this._t = 0;
    const g = this.game, info = g.renderer.info, p = g.player?.position;
    this.overlay.textContent = [
      `${(g.fps || 0).toFixed(0)} fps (cap ${g.fpsCap}), cpu ${(g.frameMs || 0).toFixed(1)} ms, scale ${g.renderScale.toFixed(2)}, ${g.quality.name}`,
      `draw calls ${info.render.calls}, triangles ${(info.render.triangles / 1000).toFixed(0)}k, geometries ${info.memory.geometries}, textures ${info.memory.textures}`,
      `${p ? `x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}  z ${p.z.toFixed(1)}` : 'no player'}, ${g.state}, ${g.input.device}`,
      ...(this.lines || []).map((fn) => { try { return fn(); } catch { return ''; } }),
    ].join('\n');
  }
  _render() {
    const p = this.panel;
    p.textContent = '';
    const h = document.createElement('h3'); h.textContent = 'Tuning (F1)'; p.append(h);
    for (const [name, { obj, meta }] of this.tunings) {
      const det = document.createElement('details'); det.open = this.tunings.size <= 2;
      const sum = document.createElement('summary'); sum.textContent = name; det.append(sum);
      for (const key of Object.keys(obj)) {
        const v = obj[key];
        if (typeof v !== 'number' && typeof v !== 'boolean') continue;
        const row = document.createElement('label'); row.className = 'sd-debug-row';
        const label = document.createElement('span'); label.textContent = key; row.append(label);
        const input = document.createElement('input');
        if (typeof v === 'number') {
          const m = meta[key] || {}, mag = Math.abs(v);
          input.type = 'range';
          input.min = m.min ?? (v < 0 ? v * 3 : 0); input.max = m.max ?? (v === 0 ? 1 : mag * 3);
          input.step = m.step ?? (mag >= 10 ? 0.5 : mag >= 1 ? 0.05 : 0.0005); input.value = v;
          const out = document.createElement('output'); out.textContent = String(v);
          input.addEventListener('input', () => { obj[key] = Number(input.value); out.textContent = input.value; });
          row.append(input, out);
        } else {
          input.type = 'checkbox'; input.checked = v;
          input.addEventListener('change', () => { obj[key] = input.checked; });
          row.append(input);
        }
        det.append(row);
      }
      p.append(det);
    }
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'sd-button'; copy.textContent = 'Copy values';
    copy.addEventListener('click', () => {
      const out = {}; for (const [n, { obj }] of this.tunings) out[n] = obj;
      navigator.clipboard?.writeText(JSON.stringify(out, null, 2)).then(() => this.game.ui.notify('Tuning values copied'), () => console.log(out));
    });
    p.append(copy);
  }
  _installHelpers() {
    const g = this.game;
    const need = (id, part, fn) => (...args) => {
      const s = g.get(id);
      if (!s) { console.info(`[debug] ${id} is not built yet (Part ${part})`); return null; }
      return fn(s, ...args);
    };
    Object.assign(this, {
      teleport: (x, z) => g.player.teleport(x, z),
      setTime: need('sky', 2, (s, h) => s.setTime(h)),
      setWeather: need('weather', 2, (s, type) => s.set(type, 2)),
      giveMoney: (n = 100) => g.sys('wallet').add(n, 'debug'),
      giveItem: (id, n = 1) => g.sys('inventory').add(id, n),
      setHonor: need('honor', 8, (s, v) => s.change(v - s.value, 'debug')),
      spawn: (kind = 'townsfolk') => {
        const p = g.player.position, wild = g.get('wildlife'), npcs = g.get('npcs');
        if (wild && /deer|elk|rabbit|coyote|wolf|bear|turkey|hawk|crow/.test(kind)) return wild.spawn(kind, p.clone().add({ x: 6, y: 0, z: 6 }));
        if (npcs) return npcs.spawn({ role: kind, position: p.clone().add({ x: 4, y: 0, z: 4 }) });
        console.info('[debug] NPCs (Part 7) and wildlife (Part 10) are not built yet');
        return null;
      },
      godMode: () => {
        const pl = g.get('player');
        if (!pl) return false;
        pl.godMode = !pl.godMode; g.ui.notify(`God mode ${pl.godMode ? 'on' : 'off'}`);
        return pl.godMode;
      },
    });
  }
}
