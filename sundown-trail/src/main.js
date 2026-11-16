import { Game } from './core/Game.js';
import { EVENTS } from './core/Events.js';
import { loadModules } from './core/ModuleLoader.js';
import { MODULES } from './core/modules.js';

const loading = document.getElementById('loading');
const bar = loading?.querySelector('.sd-loading-fill');
const tip = loading?.querySelector('.sd-loading-tip');
const TIPS = ['Saddling up', 'Oiling the Drover .45', 'Packing the saddlebags', 'Counting stars over Ashwater'];
const progress = (p, text) => {
  if (bar) bar.style.transform = `scaleX(${Math.max(0.02, Math.min(1, p))})`;
  if (text && tip) tip.textContent = text;
};

async function boot() {
  progress(0.05, TIPS[0]);
  const game = new Game({
    canvas: document.getElementById('game-canvas'),
    uiRoot: document.getElementById('ui-root'),
    touchRoot: document.getElementById('touch-root'),
  });
  await game.initCore();
  progress(0.2, TIPS[1]);
  const report = await loadModules(game, MODULES, (i, n) => progress(0.2 + 0.6 * (i / n), TIPS[2]));
  console.info(`[boot] loaded: ${report.loaded.join(', ') || 'none'} | not built yet: ${report.missing.length} | failed: ${report.failed.join(', ') || 'none'}`);
  progress(0.85, TIPS[3]);
  // Systems that do heavy work in init() (terrain generation) report progress through this event.
  game.events.on(EVENTS.LOADING_PROGRESS, ({ progress: p = 0, label } = {}) => progress(0.85 + 0.13 * Math.min(1, p), label));
  await game.initModules(MODULES);
  progress(1);
  loading?.classList.add('sd-done');
  setTimeout(() => loading?.remove(), 700);
  game.start();
  game.enterTitle();
  if (report.failed.length) game.ui.notify(`Some parts failed to load: ${report.failed.join(', ')}. Details are in the console (F12).`, { duration: 8 });
}

boot().catch((err) => {
  console.error('[boot] failed', err);
  loading?.classList.add('sd-error');
  if (tip) tip.textContent = `Could not start: ${err.message}. Run it from a local server (python -m http.server) and check the console (F12).`;
});
