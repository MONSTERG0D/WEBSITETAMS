/* POST /api/auth/logout — ends this browser's session. */
import { json } from "../../_lib/http.js";
import { config, getSession, endSession, clearSessionCookies, requestMeta, logEvent } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const c = config(env);
  if (c.db && c.secret) {
    const session = await getSession(request, env);
    if (session) {
      await endSession(env, session.sessionId);
      await logEvent(env, await requestMeta(request, env), { userId: session.user.id, email: session.user.email, method: session.method, event: "logout" });
    }
  }
  const res = json({ ok: true });
  for (const v of clearSessionCookies()) res.headers.append("Set-Cookie", v);
  return res;
}
