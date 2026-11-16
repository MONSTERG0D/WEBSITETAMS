import * as THREE from 'three';

/**
 * The quick-draw duel (Part 15, missions 5 and 7). At noon in the street: the two of you face off 14 m apart, the
 * camera circles, then it's over Eli's shoulder and nobody moves. A bell rings after a random wait — draw before it
 * and you're a dead cheat. After the bell, draw (fire, aim, or tap), and time slows to a Focus-style crawl: a
 * reticle sways around your opponent's chest and you fire when it's inside the ring. You have until he clears
 * leather — his draw time comes from `skill` (0..1). Hit in time and he falls; miss, or be slow, and you do.
 * run({ opponent, skill, title }) → Promise<'won' | 'lost'>.
 */
export const TUNING = { distance: 14, circle: 3.2, waitMin: 2.4, waitMax: 5.5, drawBase: 1.25, drawSkill: 0.55, drawJitter: 0.12, slow: 0.35, ring: 0.075, sway: 0.11, swayLevel2: 0.07, swaySpeed: 1.7, settle: 0.6 };
const _v = new THREE.Vector3(), _c = new THREE.Vector3();

export class Duel {
  constructor(game) {
    this.game = game; this.active = false;
    this.el = document.createElement('div'); this.el.className = 'sd-duel'; this.el.hidden = true;
    this.el.innerHTML = '<div class="sd-duel-text"></div><div class="sd-duel-ring"></div><div class="sd-duel-ret"></div><div class="sd-duel-timer"><i></i></div>';
    this.el.addEventListener('pointerdown', (e) => { if (this.active) { e.preventDefault(); this._press = true; } });
    game.ui.root.append(this.el);
    this.text = this.el.querySelector('.sd-duel-text'); this.ring = this.el.querySelector('.sd-duel-ring'); this.ret = this.el.querySelector('.sd-duel-ret'); this.timer = this.el.querySelector('.sd-duel-timer i');
  }
  run({ opponent, skill = 0.8, title = 'Duel' } = {}) {
    const g = this.game, pl = g.player;
    if (!opponent || this.active) return Promise.resolve('won');
    this.active = true; this.opp = opponent; this.skill = skill; this.phase = 'circle'; this.t = 0; this.result = null; this._press = false;
    // stage: face off along the line between them
    if (pl.state === 'mounted') g.get('horses')?.dismountPlayer?.({ thrown: true });
    const dx = opponent.position.x - pl.position.x, dz = opponent.position.z - pl.position.z, d = Math.hypot(dx, dz) || 1;
    if (Math.abs(d - TUNING.distance) > 3) { const x = pl.position.x + dx / d * TUNING.distance, z = pl.position.z + dz / d * TUNING.distance; opponent.position.set(x, g.sys('terrain').getHeightAt(x, z), z); }
    this.yaw = Math.atan2(-dx, -dz); pl.yaw = this.yaw; opponent.stop?.(); opponent.faceYaw?.(this.yaw + Math.PI); opponent.yaw = this.yaw + Math.PI; opponent.holster?.(true);
    const horse = g.get('horses')?.playerHorse; if (horse && !horse.rider) { const hx = pl.position.x + Math.cos(this.yaw) * 9, hz = pl.position.z - Math.sin(this.yaw) * 9; horse.position.set(hx, g.sys('terrain').getHeightAt(hx, hz), hz); horse.controller?.stop?.(); horse.animator?.teleported?.(); } // Juniper steps off the line
    opponent.brain?.set?.('idle'); this._oppHostile = opponent.def.hostile; opponent.def.hostile = false;
    g.get('combat')?.holster?.();
    g.setState('cutscene'); pl.setControl?.(false); g.ui.letterbox(true);
    this.wait = TUNING.waitMin + Math.random() * (TUNING.waitMax - TUNING.waitMin);
    this.oppDraw = TUNING.drawBase - TUNING.drawSkill * skill + (Math.random() - 0.5) * TUNING.drawJitter;
    this.el.hidden = false; this.el.className = 'sd-duel sd-intro'; this.text.textContent = title;
    g.get('music')?.setMood?.('silence');
    g.cameraRig.override = Object.assign((cam, rawDt) => this._tick(cam, rawDt), { ownsFov: true });
    return new Promise((res) => { this._res = res; });
  }
  /** Stops a duel without a result (a skipped step, a mission ending mid-duel). */
  cancel() {
    if (!this.active) return;
    const g = this.game; this.phase = 'done'; g.timeScale = 1; this.opp.def.hostile = this._oppHostile;
    g.cameraRig.override = null; g.camera.fov = 58; g.camera.updateProjectionMatrix(); this.el.hidden = true; this.active = false; g.ui.letterbox(false);
    if (g.state === 'cutscene') g.setState('playing'); g.player.setControl?.(true); g.get('music')?.setMood?.('auto');
    const r = this._res; this._res = null; r?.('cancelled');
  }
  _pressed() {
    const inp = this.game.input, p = this._press || inp.pressed('fire') || inp.pressed('aim') || inp.pressed('interact') || inp.pressed('jump');
    this._press = false; return p;
  }
  _tick(cam, rawDt) {
    const g = this.game, pl = g.player, o = this.opp;
    this.t += rawDt * (this.phase === 'aim' ? TUNING.slow : 1); // in the aim window his clock crawls like the world does
    const eli = _v.copy(pl.position), opp = _c.copy(o.position);
    if (this.phase === 'circle') {
      const a = this.yaw + Math.PI / 2 + (this.t / TUNING.circle) * 1.4, mx = (eli.x + opp.x) / 2, mz = (eli.z + opp.z) / 2;
      cam.position.set(mx + Math.sin(a) * 11, eli.y + 2.2, mz + Math.cos(a) * 11); cam.lookAt(mx, eli.y + 1.3, mz);
      if (this.t > TUNING.circle) { this.phase = 'wait'; this.t = 0; this.el.className = 'sd-duel sd-wait'; this.text.textContent = 'Wait for the bell…'; }
      return;
    }
    // over Eli's shoulder
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    cam.position.set(eli.x - fx * 2.2 + rx * 0.7, eli.y + 1.75, eli.z - fz * 2.2 + rz * 0.7); cam.lookAt(opp.x, opp.y + 1.35, opp.z);
    if (cam.fov !== 42) { cam.fov = 42; cam.updateProjectionMatrix(); }
    if (this.phase === 'wait') {
      if (this._pressed()) { g.get('honor')?.change?.(-2, 'drew before the bell'); this._end('lost', 'You drew before the bell.'); return; }
      if (this.t >= this.wait) { this.phase = 'bell'; this.t = 0; g.audio.play('duel_bell', { volume: 1 }); this.el.className = 'sd-duel sd-bell'; this.text.textContent = 'Draw!'; }
      return;
    }
    if (this.phase === 'bell') {
      if (this._pressed()) { this.phase = 'aim'; this.aimT = this.t; g.timeScale = TUNING.slow; g.audio.play('focus_enter', { volume: 0.6 }); this.el.className = 'sd-duel sd-aim'; this.text.textContent = ''; pl.human?.setState?.('draw'); g.get('combat')?.equip?.('revolver'); }
      else if (this.t >= this.oppDraw) { this._end('lost', 'Too slow.'); return; }
      return;
    }
    if (this.phase === 'aim') {
      // reticle sway around the chest; time runs slow in here but his draw clock runs in real time scaled the same way
      const sway = (g.get('focus')?.level >= 2 ? TUNING.swayLevel2 : TUNING.sway) * Math.max(0.35, 1 - (this.t - this.aimT) / TUNING.settle * 0.5);
      const tt = this.t * TUNING.swaySpeed, sx = Math.sin(tt * 1.7) * 0.6 + Math.sin(tt * 3.1 + 1) * 0.4, sy = Math.cos(tt * 1.3) * 0.6 + Math.sin(tt * 2.3 + 2) * 0.4;
      _c.set(opp.x, opp.y + 1.3, opp.z).project(cam);
      const cx = (_c.x * 0.5 + 0.5) * 100, cy = (-_c.y * 0.5 + 0.5) * 100, W = window.innerWidth, H = window.innerHeight, asp = W / H;
      const rxp = cx + sx * sway * 100 / asp, ryp = cy + sy * sway * 100;
      this.ring.style.left = `${cx}%`; this.ring.style.top = `${cy}%`; this.ring.style.width = this.ring.style.height = `${TUNING.ring * 2 * H}px`;
      this.ret.style.left = `${rxp}%`; this.ret.style.top = `${ryp}%`;
      const inside = Math.hypot((rxp - cx) / 100 * W, (ryp - cy) / 100 * H) < TUNING.ring * H;
      this.ret.classList.toggle('sd-on', inside);
      const left = this.oppDraw - this.t; this.timer.style.transform = `scaleX(${Math.max(0, left / Math.max(0.01, this.oppDraw - this.aimT))})`;
      if (this._pressed()) {
        g.audio.play('revolver_fire', { position: eli, volume: 1 });
        if (inside) { this._end('won'); return; }
        g.audio.play('bullet_impact_dirt', { position: opp, volume: 0.6 });
      }
      if (left <= 0) this._end('lost', 'Too slow.');
    }
  }
  _end(result, why = '') {
    const g = this.game, pl = g.player, o = this.opp;
    this.phase = 'done'; g.timeScale = 1;
    this.el.className = `sd-duel sd-${result}`; this.text.textContent = result === 'won' ? '' : why;
    o.def.hostile = this._oppHostile;
    setTimeout(() => {
      g.cameraRig.override = null; g.camera.fov = 58; g.camera.updateProjectionMatrix(); g.cameraRig.snap?.();
      this.el.hidden = true; this.active = false; g.ui.letterbox(false);
      if (g.state === 'cutscene') g.setState('playing'); pl.setControl?.(true);
      if (result === 'won') { o.takeDamage?.({ amount: 999, source: pl.entity, zone: 'torso', direction: new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)) }); if (!o.dead) o.die?.(null, pl.entity); }
      else { g.audio.play('revolver_fire', { position: o.position, volume: 1 }); pl.takeDamage?.({ amount: 999, source: o.entity, zone: 'torso' }); }
      g.get('music')?.setMood?.('auto');
      const r = this._res; this._res = null; r?.(result);
    }, result === 'won' ? 250 : 900);
    if (result === 'won') { g.audio.play('bullet_impact_flesh', { position: o.position, volume: 0.9 }); g.sys('vfx').spawn('impact_flesh', { position: _v.copy(o.position).setY(o.position.y + 1.3) }); }
    this.result = result;
  }
}
