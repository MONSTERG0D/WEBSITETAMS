/* POST /api/auth/email/verify  { email, code, lang }
   Checks the emailed code and signs the person in. Five wrong tries retire the code. */
import { HttpError, json, readJson } from "../../../_lib/http.js";
import { hmacHex, safeEqual } from "../../../_lib/crypto.js";
import {
  requireReady, cleanEmail, cleanLang, requestMeta, logEvent, countEvents, now, LIMITS, CODE_MAX_TRIES,
  findOrCreateUser, createSession, sessionCookies, publicUser,
} from "../../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  requireReady(env, "email");
  const body = await readJson(request);
  const email = cleanEmail(body.email);
  const code = typeof body.code === "string" ? body.code.replace(/\s+/g, "") : "";
  if (!email || !/^\d{6}$/.test(code)) throw new HttpError(400, "code_invalid", "That code is not right.");
  const lang = cleanLang(body.lang);
  const meta = await requestMeta(request, env);
  const t = now();

  const [maxFails, failWindow] = LIMITS.failsPerIp;
  if ((await countEvents(env, { event: "failed", ipHash: meta.ipHash, seconds: failWindow })) >= maxFails) {
    throw new HttpError(429, "rate_limited", "Too many tries.", { retry_after: failWindow });
  }

  const row = await env.DB.prepare(
    "SELECT id, code_hash, attempts FROM login_codes WHERE email = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1"
  ).bind(email, t).first();
  if (!row) {
    await logEvent(env, meta, { email, method: "email", event: "failed", reason: "no_code" });
    throw new HttpError(400, "code_invalid", "That code is not right.");
  }
  if (row.attempts >= CODE_MAX_TRIES) {
    await logEvent(env, meta, { email, method: "email", event: "failed", reason: "too_many_attempts" });
    throw new HttpError(400, "too_many_attempts", "Ask for a new code.");
  }

  if (!safeEqual(row.code_hash, await hmacHex(env.SESSION_SECRET, "code:" + email + ":" + code))) {
    await env.DB.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    await logEvent(env, meta, { email, method: "email", event: "failed", reason: "bad_code" });
    const left = CODE_MAX_TRIES - row.attempts - 1;
    throw new HttpError(400, left > 0 ? "code_invalid" : "too_many_attempts", "That code is not right.", { tries_left: Math.max(left, 0) });
  }

  // use the code exactly once, even if two requests arrive together
  const used = await env.DB.prepare("UPDATE login_codes SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(t, row.id).run();
  if (!used.meta || used.meta.changes !== 1) throw new HttpError(400, "code_invalid", "That code is not right.");

  let found;
  try {
    found = await findOrCreateUser(env, { email, method: "email", lang });
  } catch (err) {
    if (err instanceof HttpError) await logEvent(env, meta, { email, method: "email", event: "failed", reason: err.code });
    throw err;
  }
  const token = await createSession(env, found.user.id, "email");
  await logEvent(env, meta, { userId: found.user.id, email, method: "email", event: found.created ? "signup" : "login" });

  const res = json({ ok: true, user: publicUser(found.user), new_account: found.created });
  for (const c of sessionCookies(token)) res.headers.append("Set-Cookie", c);
  return res;
}
