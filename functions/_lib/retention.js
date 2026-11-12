/* Keeping only what is needed (privacy page, step 6): old records are removed at most once a day,
   the first time someone uses the site after the day has passed. Pages Functions have no timer of
   their own, so the clean-up rides along with an ordinary request, after the answer has gone out.
     sign-in history (login_events)   90 days
     sessions                          30 days after they expired or were ended
     email codes (login_codes)         1 day after they expired */
import { now } from "./auth.js";

export const KEEP = { loginEvents: 90 * 86400, sessions: 30 * 86400, codes: 86400 };

export async function maybePrune(env) {
  if (!env.DB) return false;
  try {
    const t = now();
    const last = Number(await env.DB.prepare("SELECT value FROM app_meta WHERE key = 'pruned_at'").first("value")) || 0;
    if (t - last < 86400) return false;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO app_meta (key, value) VALUES ('pruned_at', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(String(t)),
      env.DB.prepare("DELETE FROM login_events WHERE created_at < ?").bind(t - KEEP.loginEvents),
      env.DB.prepare("DELETE FROM sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)").bind(t - KEEP.sessions, t - KEEP.sessions),
      env.DB.prepare("DELETE FROM login_codes WHERE expires_at < ?").bind(t - KEEP.codes),
    ]);
    return true;
  } catch (err) {
    console.error("clean-up failed", err && err.message);
    return false;
  }
}
