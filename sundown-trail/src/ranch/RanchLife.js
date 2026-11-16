import * as THREE from 'three';

/**
 * Ranch chores (Part 13): short jobs about the yard that pay a little money and honor, once each a day.
 *  Chop wood    at the chopping block: a marker swings across a bar; press E, Space or click while it's in the
 *               notch. Five logs; each clean split pays, three or more earn honor.
 *  Carry water  draw a bucket at the well, walk it to the trough and pour; three buckets.
 *  Feed horses  fork hay from the stack to the corral rail; three forkfuls.
 *  Break a horse  Abel's daily job once the corral stands: the same timing bar, six bucks to ride out; pays like a
 *               Bible delivery job ($15–40) when you stay on, a few dollars when you're thrown.
 * Carrying slows Eli to a walk (player.load, Part 13); getting on a horse, drawing a gun or wandering off drops the load.
 */
export const TUNING = {
  chop: { logs: 5, pay: 1, honor: 1, minGood: 3, speed: 1.35, notch: 0.16, speedUp: 0.12 },
  break: { logs: 6, pay: [15, 40], thrown: 4, honor: 0, minGood: 3, speed: 1.6, notch: 0.18, speedUp: 0.18 },
  water: { trips: 3, pay: 1.5, honor: 1 }, feed: { trips: 3, pay: 1, honor: 1 },
  carryRange: 40,
};

const CSS = `
.sd-chore{width:min(520px,92vw);display:flex;flex-direction:column;gap:10px;align-items:stretch;text-align:center}
.sd-chore-bar{position:relative;height:34px;border-radius:6px;background:linear-gradient(90deg,#6b4a2c,#8a6a44,#6b4a2c);border:2px solid #3e2a18;overflow:hidden}
.sd-chore-notch{position:absolute;top:0;bottom:0;background:rgba(240,210,120,.55);border-left:2px solid #f4ead6;border-right:2px solid #f4ead6}
.sd-chore-mark{position:absolute;top:-2px;bottom:-2px;width:6px;margin-left:-3px;background:#2b1d12;box-shadow:0 0 6px #000}
.sd-chore-logs{font:22px var(--font-display,Georgia,serif);letter-spacing:6px;color:#5a2a14}
.sd-chore small{font-style:italic;color:var(--ink-soft,#5e4a36)}
`;

export class RanchLife {
  constructor(ranch) {
    this.ranch = ranch; this.game = ranch.game; this.done = {}; this.carry = null; this.handles = []; this.chop = null;
    if (!document.getElementById('sd-chore-css')) { const s = document.createElement('style'); s.id = 'sd-chore-css'; s.textContent = CSS; document.head.append(s); }
    this._registerScreen();
    this._key = (e) => { if (this.chop && ['KeyE', 'Space', 'Enter'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); this._swing(); } };
  }
  get day() { return this.game.sys('sky').day || 1; }
  /** Has a chore been done today? */
  doneToday(kind) { return this.done[kind] === this.day; }

  /** (Re)registers the chore spots: the block, the well, the trough, the hay, the corral rail. */
  register() {
    const g = this.game, R = this.ranch;
    for (const h of this.handles) g.interact.unregister(h);
    this.handles.length = 0;
    const reg = (pos, label, fn, cond) => pos && this.handles.push(g.interact.register({ position: pos, radius: 1.8, priority: 0.3, label, onInteract: fn, condition: cond }));
    const free = () => !this.carry && g.player.state === 'onFoot';
    reg(R.spot('block'), () => (this.doneToday('chop') ? 'Chop wood (done today)' : 'Chop wood'), () => this.startChop(), free);
    reg(R.spot('well'), 'Draw a bucket of water', () => this.pickUp('water'), () => free() && !this.doneToday('water'));
    reg(R.spot('trough'), 'Pour the water', () => this.drop('water'), () => this.carry?.kind === 'water');
    reg(R.spot('hay'), 'Fork some hay', () => this.pickUp('feed'), () => free() && !this.doneToday('feed'));
    reg(R.spot('corralRail') || R.spot('corral'), 'Feed the horses', () => this.drop('feed'), () => this.carry?.kind === 'feed');
  }

  // ---------------------------------------------------------------- chopping
  /** Chopping (mode 'chop') or Abel's horse-breaking job (mode 'break'). */
  startChop(mode = 'chop') {
    const g = this.game, T = TUNING[mode];
    if (this.doneToday(mode)) { g.ui.notify(mode === 'chop' ? "That's enough wood for today." : 'Abel has nothing left to break today.'); return false; }
    this.chop = { mode, logs: 0, good: 0, x: 0, dir: 1, speed: T.speed, notch: 0.25 + Math.random() * 0.5, results: [], cool: 0 };
    const b = this.ranch.spot(mode === 'chop' ? 'block' : 'corral'); if (b) g.player.yaw = Math.atan2(g.player.position.x - b.x, g.player.position.z - b.z);
    g.ui.openScreen('chore_chop');
    window.addEventListener('keydown', this._key, true);
    this._raf = (t) => { this._chopTick(t); if (this.chop) requestAnimationFrame(this._raf); };
    this._last = performance.now(); requestAnimationFrame(this._raf);
    return true;
  }
  _chopTick(now) {
    const c = this.chop; if (!c) return;
    const dt = Math.min(0.05, (now - this._last) / 1000); this._last = now;
    this.step(dt);
    this._draw();
  }
  /** Advances the swinging marker (exposed for tests). */
  step(dt) {
    const c = this.chop; if (!c) return;
    c.cool = Math.max(0, c.cool - dt);
    c.x += c.dir * c.speed * dt;
    if (c.x > 1) { c.x = 2 - c.x; c.dir = -1; } else if (c.x < 0) { c.x = -c.x; c.dir = 1; }
  }
  _swing() {
    const g = this.game, c = this.chop, T = TUNING[c?.mode || 'chop'];
    if (!c || c.cool > 0) return;
    c.cool = 0.35;
    const hit = Math.abs(c.x - c.notch) < T.notch / 2;
    c.logs++; if (hit) c.good++; c.results.push(hit);
    if (c.mode === 'chop') {
      g.player.human?.setState?.('punch');
      const p = this.ranch.spot('block');
      g.audio.play('axe_chop', { position: p });
      if (hit) { g.audio.play('wood_split', { position: p, delay: 0.08 }); g.sys('vfx').spawn('impact_dirt', { position: p?.clone().setY(p.y + 0.6), scale: 0.6 }); }
    } else { const p = this.ranch.spot('corral'); g.audio.play(hit ? 'horse_snort' : 'horse_whinny', { position: p }); g.sys('vfx').spawn('hoof_dust', { position: p, scale: 1.4 }); }
    c.notch = 0.15 + Math.random() * 0.7; c.speed += T.speedUp;
    if (c.logs >= T.logs || (c.mode === 'break' && c.logs - c.good > T.logs - T.minGood)) setTimeout(() => this.finishChop(), 450);
  }
  finishChop() {
    const g = this.game, c = this.chop, T = TUNING[c?.mode || 'chop'];
    if (!c) return null;
    this.chop = null; window.removeEventListener('keydown', this._key, true);
    if (g.ui.topScreen() === 'chore_chop') g.ui.closeScreen();
    if (!c.logs) return null;
    this.done[c.mode] = this.day;
    let pay;
    if (c.mode === 'break') {
      const stayed = c.good >= T.minGood;
      pay = stayed ? Math.round(T.pay[0] + (T.pay[1] - T.pay[0]) * (c.good - T.minGood) / (T.logs - T.minGood)) : T.thrown;
      g.sys('wallet').add(pay, 'job');
      g.ui.notify(stayed ? `The colt gives in. Abel pays you $${pay}.` : `Thrown in the dirt. Abel laughs and pays you $${pay} for trying.`, { duration: 3.5 });
    } else {
      pay = Math.round(c.good * T.pay * 100) / 100;
      if (pay > 0) g.sys('wallet').add(pay, 'chore');
      if (c.good >= T.minGood) g.get('honor')?.change?.(T.honor, 'chore');
      g.ui.notify(c.good ? `Split ${c.good} of ${c.logs} logs. Mae pays you $${pay.toFixed(2)}${c.good >= T.minGood ? ' and a nod' : ''}.` : 'Mostly kindling. Mae says try again tomorrow.', { duration: 3.5 });
    }
    return { mode: c.mode, good: c.good, logs: c.logs, pay };
  }
  _registerScreen() {
    const g = this.game, ui = g.ui, el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    ui.registerScreen('chore_chop', {
      build: () => {
        const brk = this.chop?.mode === 'break', w = el('div', 'sd-panel sd-chore');
        w.append(el('h2', 'sd-title', brk ? 'Break a horse' : 'Chop wood'), el('small', null, brk ? 'Shift your weight when the mark is in the notch — E, Space or click. Miss three and you\'re in the dirt.' : 'Swing when the mark is in the notch — E, Space or click.'));
        const bar = el('div', 'sd-chore-bar'), notch = el('div', 'sd-chore-notch'), mark = el('div', 'sd-chore-mark'); bar.append(notch, mark);
        const logs = el('div', 'sd-chore-logs'); w.append(bar, logs);
        bar.addEventListener('pointerdown', (e) => { e.preventDefault(); this._swing(); });
        w.append(ui.button('Stop', () => this.finishChop()));
        this._els = { notch, mark, logs }; this._draw();
        return w;
      },
      onClose: () => { if (this.chop) { const c = this.chop; this.chop = null; window.removeEventListener('keydown', this._key, true); if (c.logs) { this.chop = c; this.finishChop(); } } },
    });
  }
  _draw() {
    const c = this.chop, E = this._els; if (!c || !E) return;
    const T = TUNING[c.mode]; E.notch.style.left = `${(c.notch - T.notch / 2) * 100}%`; E.notch.style.width = `${T.notch * 100}%`;
    E.mark.style.left = `${c.x * 100}%`;
    E.logs.textContent = Array.from({ length: T.logs }, (_, i) => (i < c.results.length ? (c.results[i] ? '▮' : '✕') : '·')).join(' ');
  }

  // ---------------------------------------------------------------- carrying water and hay
  pickUp(kind) {
    const g = this.game;
    if (this.carry || this.doneToday(kind)) return false;
    const trips = (this._trips?.kind === kind && this._trips.day === this.day) ? this._trips.n : 0;
    this._trips = { kind, n: trips, day: this.day };
    const mesh = kind === 'water' ? bucketMesh() : hayMesh();
    g.scene.add(mesh);
    this.carry = { kind, mesh }; g.player.load = kind;
    g.player.human?.setState?.('carry');
    g.audio.play(kind === 'water' ? 'bucket' : 'hay_toss', { position: g.player.position });
    g.ui.notify(kind === 'water' ? 'Carry it to the trough.' : 'Carry it to the corral rail.', { duration: 2 });
    return true;
  }
  drop(kind) {
    const g = this.game, T = TUNING[kind];
    if (this.carry?.kind !== kind) return false;
    this._clearCarry();
    g.audio.play(kind === 'water' ? 'water_pour' : 'hay_toss', { position: g.player.position });
    this._trips.n++;
    g.sys('wallet').add(T.pay, 'chore');
    if (this._trips.n >= T.trips) {
      this.done[kind] = this.day;
      g.get('honor')?.change?.(T.honor, 'chore');
      g.ui.notify(kind === 'water' ? 'The trough is full.' : "The horses are fed.", { duration: 2.5 });
      if (kind === 'feed') { const h = g.get('horses')?.playerHorse; if (h && h.position.distanceTo(g.player.position) < 25) { h.stamina = h.maxStamina ?? h.stamina; h.health = Math.min(h.maxHealth ?? 100, (h.health ?? 100) + 20); } }
    } else g.ui.notify(`${this._trips.n} of ${T.trips}. ${kind === 'water' ? 'Another bucket.' : 'Another forkful.'}`, { duration: 1.8 });
    return true;
  }
  _clearCarry() {
    const c = this.carry; if (!c) return;
    c.mesh.removeFromParent(); c.mesh.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    this.carry = null; this.game.player.load = null;
    const h = this.game.player.human; if (h?.upperState === 'carry') h.stopUpper?.(0.3);
  }
  update() {
    const g = this.game, c = this.carry, pl = g.player;
    if (!c) return;
    const far = pl.position.distanceTo(this.ranch.center) > TUNING.carryRange + 30;
    if (pl.state !== 'onFoot' || g.get('combat')?.arsenal?.drawn || far) { this._clearCarry(); g.ui.notify('You set the load down.'); return; }
    const y = pl.yaw; c.mesh.position.set(pl.position.x - Math.sin(y) * 0.42, pl.position.y + 1.0, pl.position.z - Math.cos(y) * 0.42); c.mesh.rotation.y = y;
  }
  serialize() { return { done: { ...this.done } }; }
  deserialize(d) { this.done = { ...(d?.done || {}) }; }
}

function bucketMesh() {
  const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 });
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.3, 10, 1, true), wood); g.add(b);
  const w = new THREE.Mesh(new THREE.CircleGeometry(0.16, 10), new THREE.MeshStandardMaterial({ color: 0x3a4a48, roughness: 0.1, metalness: 0.3 })); w.rotation.x = -Math.PI / 2; w.position.y = 0.11; g.add(w);
  const h = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.008, 4, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.4 })); h.position.y = 0.15; g.add(h);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function hayMesh() {
  const g = new THREE.Group(), hay = new THREE.MeshStandardMaterial({ color: 0xc8a458, roughness: 1 });
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), hay); m.scale.set(1.2, 0.55, 0.8); g.add(m);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
