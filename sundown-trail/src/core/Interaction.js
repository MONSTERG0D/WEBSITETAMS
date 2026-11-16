/** Context interactions: the nearest valid interactable shows a prompt; pressing its key calls onInteract. */
export class Interaction {
  constructor(game) { this.game = game; this.items = new Set(); this.current = null; this._label = null; }
  /**
   * @param {{position?, object?, radius?, label?, key?, condition?:(game)=>boolean, onInteract:(game)=>void, priority?}} def
   * @returns handle for unregister
   */
  register(def) {
    const h = {
      position: def.position || null, object: def.object || null, radius: def.radius ?? 2,
      label: def.label || 'Interact', key: def.key || 'interact', condition: def.condition || null,
      onInteract: def.onInteract || (() => {}), priority: def.priority || 0,
    };
    this.items.add(h);
    return h;
  }
  unregister(handle) { this.items.delete(handle); if (this.current === handle) this._set(null); }
  update() {
    const g = this.game, p = g.player?.position;
    if (!p || g.state !== 'playing' || g.ui.isScreenOpen() || g.player.state === 'dead') { this._set(null); return; }
    let best = null, bestScore = Infinity;
    for (const it of this.items) {
      const pos = it.object ? it.object.position : it.position;
      if (!pos) continue;
      const dx = pos.x - p.x, dz = pos.z - p.z, d2 = dx * dx + dz * dz;
      if (d2 > it.radius * it.radius || Math.abs(pos.y - p.y) > 2.5) continue;
      if (it.condition && !it.condition(g)) continue;
      const score = d2 - it.priority * 100;
      if (score < bestScore) { best = it; bestScore = score; }
    }
    this._set(best);
    if (best && g.input.pressed(best.key)) {
      try { best.onInteract(g); } catch (err) { console.error('[interact] handler failed', err); }
    }
  }
  _set(item) {
    const label = item ? (typeof item.label === 'function' ? item.label(this.game) : item.label) : null;
    if (item === this.current && label === this._label) return;
    this.current = item; this._label = label;
    if (item) { this.game.ui.prompt('interact', label, this.game.input.keyLabel(item.key)); this.game.input.setContextLabel(label); }
    else { this.game.ui.clearPrompt('interact'); this.game.input.setContextLabel(null); }
  }
}
