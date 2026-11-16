/**
 * Loads every manifest module that exists. A missing file means "not built yet" and its fallback is used;
 * a file that exists but throws is reported as failed. Browser 404s for unbuilt modules are expected.
 */
export async function loadModules(game, manifest, onProgress) {
  const base = new URL('../', import.meta.url);
  let done = 0;
  const tick = (id) => onProgress?.(++done, manifest.length, id);
  const results = await Promise.all(manifest.map(async (m) => {
    const url = new URL(m.file, base).href;
    let status = 'unknown';
    try {
      const r = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
      status = r.ok ? 'present' : r.status === 405 || r.status === 501 ? 'unknown' : 'missing';
    } catch { status = 'unknown'; }
    if (status === 'missing') { tick(m.id); return { m, missing: true }; }
    try {
      const mod = await import(url);
      tick(m.id);
      return { m, Cls: mod.default };
    } catch (err) {
      tick(m.id);
      return status === 'unknown' ? { m, missing: true } : { m, error: err };
    }
  }));
  const report = { loaded: [], missing: [], failed: [] };
  for (const r of results) {
    const { m } = r;
    if (r.missing) { report.missing.push(m.id); console.info(`[loader] ${m.id} not built yet (Part ${m.part})`); continue; }
    if (r.error) { report.failed.push(m.id); console.error(`[loader] ${m.id} failed to load (${m.file})`, r.error); continue; }
    if (typeof r.Cls !== 'function') { report.failed.push(m.id); console.error(`[loader] ${m.id}: default export must be a class`); continue; }
    try { game.register(m.id, new r.Cls(game), m.order); report.loaded.push(m.id); }
    catch (err) { report.failed.push(m.id); console.error(`[loader] ${m.id} constructor threw`, err); }
  }
  return report;
}
