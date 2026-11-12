/* GET /api/auth/me — who is signed in (if anyone) and which sign-in methods are switched on. */
import { json, cookies } from "../../_lib/http.js";
import { config, getSession, publicUser, isAdmin, clearSessionCookies, SESSION_COOKIE, HINT_COOKIE } from "../../_lib/auth.js";
import { maybePrune } from "../../_lib/retention.js";

export async function onRequestGet({ request, env, waitUntil }) {
  const c = config(env);
  if (c.db && waitUntil) waitUntil(maybePrune(env));   // the once-a-day clean-up of old sign-in records
  const out = {
    ok: true,
    user: null,
    signin: { google: c.google, email: c.email, turnstile_site_key: c.email ? env.TURNSTILE_SITE_KEY : null },
  };
  const res = (extra) => {
    const r = json(out);
    for (const v of extra || []) r.headers.append("Set-Cookie", v);
    return r;
  };
  if (!c.db || !c.secret) return res();

  const session = await getSession(request, env);
  if (session) {
    out.user = publicUser(session.user);
    if (isAdmin(session.user, env)) out.admin = true;
    return res();
  }
  // A leftover cookie from an ended session: clear it so the header button stops saying "Account".
  const jar = cookies(request);
  return res(jar[SESSION_COOKIE] || jar[HINT_COOKIE] ? clearSessionCookies() : []);
}
