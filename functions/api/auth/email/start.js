/* POST /api/auth/email/start  { email, turnstile, lang }
   Emails a 6-digit sign-in code. The code works for 10 minutes, once, and is stored only as a keyed hash.
   The answer is the same whether or not an account exists for the address. */
import { HttpError, json, readJson } from "../../../_lib/http.js";
import { hmacHex, randomDigits } from "../../../_lib/crypto.js";
import { requireReady, cleanEmail, cleanLang, requestMeta, logEvent, countEvents, lastEventAt, now, LIMITS, CODE_SECONDS } from "../../../_lib/auth.js";
import { verifyTurnstile } from "../../../_lib/turnstile.js";
import { sendMail, codeMail } from "../../../_lib/mail.js";

const tooMany = (wait) => new HttpError(429, "rate_limited", "Too many requests.", { retry_after: wait });

export async function onRequestPost({ request, env }) {
  requireReady(env, "email");
  const body = await readJson(request);
  const email = cleanEmail(body.email);
  if (!email) throw new HttpError(400, "bad_email", "That email address does not look right.");
  const lang = cleanLang(body.lang);
  const meta = await requestMeta(request, env);

  if (!body.turnstile) throw new HttpError(400, "turnstile_missing", "Complete the check first.");
  if (!(await verifyTurnstile(env, body.turnstile, meta.ip))) {
    await logEvent(env, meta, { email, method: "email", event: "failed", reason: "turnstile" });
    throw new HttpError(400, "turnstile_failed", "The check failed.");
  }

  // rate limits: per address, then per connection
  const t = now();
  const last = await lastEventAt(env, { event: "code_sent", email });
  if (last && t - last < LIMITS.resendWait) throw tooMany(LIMITS.resendWait - (t - last));
  for (const [key, who] of [["codesPerEmail", { email }], ["codesPerEmailDay", { email }], ["codesPerIp", { ipHash: meta.ipHash }]]) {
    const [max, seconds] = LIMITS[key];
    if ((await countEvents(env, { event: "code_sent", ...who, seconds })) >= max) {
      await logEvent(env, meta, { email, method: "email", event: "failed", reason: "rate_limited" });
      throw tooMany(seconds);
    }
  }

  // a blocked account gets the same friendly answer, but no email
  const user = await env.DB.prepare("SELECT id, status FROM users WHERE email = ?").bind(email).first();
  if (user && user.status !== "active") {
    await logEvent(env, meta, { userId: user.id, email, method: "email", event: "failed", reason: "blocked" });
    return json({ ok: true, expires_in: CODE_SECONDS });
  }

  await env.DB.prepare("DELETE FROM login_codes WHERE expires_at < ?").bind(t - 86400).run(); // tidy up old codes
  const code = randomDigits(6);
  const id = crypto.randomUUID();
  await env.DB.prepare("UPDATE login_codes SET used_at = ? WHERE email = ? AND used_at IS NULL").bind(t, email).run(); // only the newest code works
  await env.DB.prepare("INSERT INTO login_codes (id, email, code_hash, ip_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, email, await hmacHex(env.SESSION_SECRET, "code:" + email + ":" + code), meta.ipHash, t, t + CODE_SECONDS).run();

  if (!(await sendMail(env, { to: email, ...codeMail(lang, code) }))) {
    await env.DB.prepare("DELETE FROM login_codes WHERE id = ?").bind(id).run();
    await logEvent(env, meta, { userId: user ? user.id : null, email, method: "email", event: "failed", reason: "email_failed" });
    throw new HttpError(502, "email_failed", "The email could not be sent.");
  }

  await logEvent(env, meta, { userId: user ? user.id : null, email, method: "email", event: "code_sent" });
  return json({ ok: true, expires_in: CODE_SECONDS });
}
