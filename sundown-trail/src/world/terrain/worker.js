/**
 * Module worker that generates the world off the main thread. It imports only pure modules
 * (no Three.js: workers don't see the page's import map) and transfers the typed arrays back.
 */
import { generateWorld, transferList } from './Generator.js';

self.onmessage = (e) => {
  const opts = e.data || {};
  try {
    const it = generateWorld(opts);
    let r = it.next(), last = 0;
    while (!r.done) {
      const now = performance.now();
      if (now - last > 100) { self.postMessage({ type: 'progress', phase: r.value.phase, progress: r.value.progress }); last = now; }
      r = it.next();
    }
    self.postMessage({ type: 'done', data: r.value }, transferList(r.value));
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || String(err), stack: err?.stack || '' });
  }
};
