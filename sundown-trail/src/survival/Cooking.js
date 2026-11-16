import * as THREE from 'three';
import { ITEMS } from '../data/items.js';

/**
 * Cooking at camp (Part 10): raw meat → cooked food. Each piece roasts on the spit for a couple of seconds
 * (Eli crouches at the fire in the 'cook' pose, the meat browns and sizzles); cooked venison, game meat and
 * roast bird fortify a core for a while (see data/items.js effects.buff).
 */
export const TUNING = { secondsPerPiece: 1.6, maxSeconds: 7 };
export const RECIPES = Object.freeze({
  meat_small_raw: 'meat_small_cooked', meat_big_raw: 'meat_big_cooked', meat_wild_raw: 'meat_wild_cooked', meat_bird_raw: 'meat_bird_cooked',
});

/** Builds the cook screen for a camp. */
export function buildCookScreen(camp) {
  const g = camp.game, ui = g.ui, inv = g.sys('inventory'), wrap = document.createElement('div');
  wrap.className = 'sd-panel sd-shop sd-cook';
  const render = () => {
    wrap.innerHTML = '';
    const head = document.createElement('div'); head.className = 'sd-shop-head';
    head.innerHTML = '<h2 class="sd-title" style="margin:0">Campfire</h2><small>Roast meat on the spit. Cooked meat feeds the cores; venison, game meat and birds fortify one for a while.</small>';
    wrap.append(head);
    const list = document.createElement('div'); list.className = 'sd-shop-list'; list.style.maxHeight = '50vh';
    let any = false;
    for (const [raw, cooked] of Object.entries(RECIPES)) {
      const n = inv.count(raw); if (!n) continue; any = true;
      const r = document.createElement('div'); r.className = 'sd-shop-row';
      const name = document.createElement('div'); name.textContent = `${ITEMS[raw].name} ×${n}`;
      const out = document.createElement('div'); out.textContent = `→ ${ITEMS[cooked].name}`;
      r.append(document.createElement('span'), name, out, ui.button('Cook 1', () => { ui.closeScreen(); cook(camp, raw, 1); }), ui.button(`Cook all`, () => { ui.closeScreen(); cook(camp, raw, n); }));
      list.append(r);
    }
    const food = inv.list('food');
    if (food.length) {
      const c = document.createElement('div'); c.className = 'sd-shop-cat'; c.textContent = 'Eat'; list.append(c);
      for (const { id, qty, def } of food) {
        const r = document.createElement('div'); r.className = 'sd-shop-row';
        const name = document.createElement('div'); name.textContent = `${def.name} ×${qty}`;
        r.append(document.createElement('span'), name, document.createElement('div'), ui.button('Eat', () => { g.get('survival')?.eat(id); render(); }));
        list.append(r);
      }
    }
    if (!any && !food.length) { const p = document.createElement('p'); p.textContent = 'Nothing to cook. Hunt something first.'; list.append(p); }
    wrap.append(list, ui.button('Leave the fire', () => ui.closeScreen(), { primary: true }));
  };
  render();
  return wrap;
}

let _meatGeo = null;
/** Roasts `count` pieces: Eli crouches at the spit, then the cooked food lands in the satchel. */
export async function cook(camp, rawId, count) {
  const g = camp.game, inv = g.sys('inventory'), pl = g.player, out = RECIPES[rawId];
  if (!out || camp._cooking) return false;
  const n = Math.min(count, inv.count(rawId)); if (!n) return false;
  camp._cooking = true; pl.busy = true;
  const fire = camp.camp.fire;
  pl.yaw = Math.atan2(fire.x - pl.position.x, fire.z - pl.position.z) + Math.PI;
  pl.human?.setState('cook');
  // a cut of meat on the spit that browns as it cooks
  _meatGeo ||= new THREE.SphereGeometry(0.09, 10, 8).scale(1.6, 0.8, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x9a3a2a, roughness: 0.55 }), meat = new THREE.Mesh(_meatGeo, mat);
  meat.position.set(fire.x, fire.y + 0.62, fire.z); camp.camp.group.add(meat);
  const snd = g.audio.play('sizzle', { position: fire, loop: true, volume: 0.6 });
  const secs = Math.min(TUNING.maxSeconds, TUNING.secondsPerPiece * n), t0 = performance.now();
  await new Promise((resolve) => {
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
      mat.color.setRGB(0.6 - 0.32 * k, 0.23 - 0.08 * k, 0.16 - 0.1 * k);
      meat.rotation.x += 0.08;
      if (k >= 1 || !camp.camp) resolve(); else requestAnimationFrame(step);
    };
    step();
  });
  snd?.stop?.(0.3);
  meat.removeFromParent(); mat.dispose();
  if (inv.remove(rawId, n)) inv.add(out, n);
  pl.human?.setState('idle', { fade: 0.3 }); pl.busy = false; camp._cooking = false;
  g.ui.notify(`Cooked ${n} × ${ITEMS[out].name}.`, { duration: 2.5 });
  return true;
}
