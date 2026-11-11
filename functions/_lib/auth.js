/* Accounts, sessions and the sign-in history.
   No passwords exist. People sign in with Google or with a one-time code sent by email.
   The session token lives only in the visitor's cookie; the database keeps a SHA-256 hash of it. */
import { HttpError, cookies } from "./http.js";
import { hmacHex, randomToken, sha256Hex } from "./crypto.js";

export const LANGS = ["en", "de", "fr", "ja", "es", "ru", "ar", "zh", "ko"];

export const SESSION_COOKIE = "__Host-tas_session"; // HttpOnly: scripts can never read it
export const HINT_COOKIE = "tas_in";                // "1" while signed in, so pages can label the header button without a request
export const OAUTH_COOKIE = "__Host-tas_oauth";     // short-lived, used only during the trip to Google and back

export const SESSION_SECONDS = 30 * 24 * 3600;
export const CODE_SECONDS = 10 * 60;
export const CODE_MAX_TRIES = 5;

/* Rate limits. Counted from login_events, per email address and per (hashed) IP address. */
export const LIMITS = {
  resendWait: 60,                         // seconds between two codes for the same address
  codesPerEmail: [3, 15 * 60],            // 3 codes per 15 minutes
  codesPerEmailDay: [8, 24 * 3600],       // 8 codes per day
  codesPerIp: [10, 3600],                 // 10 codes per hour from one connection
  failsPerIp: [30, 15 * 60],              // 30 wrong tries per 15 minutes from one connection
};

export const now = () => Math.floor(Date.now() / 1000);

/* Which parts of sign-in have their settings in Cloudflare. Only true/false ever leaves the server. */
export function config(env) {
  const secret = typeof env.SESSION_SECRET === "string" && env.SESSION_SECRET.length >= 16;
  const turnstile = !!env.TURNSTILE_SITE_KEY && !!env.TURNSTILE_SECRET_KEY;
  const mail = !!env.EMAIL_API_KEY && !!env.MAIL_FROM;
  return {
    db: !!env.DB,
    secret,
    turnstile,
    mail,
    google: !!env.DB && secret && !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET,
    email: !!env.DB && secret && turnstile && mail,
  };
}

export function requireReady(env, part) {
  const c = config(env);
  if (!c.db || !c.secret || (part && !c[part])) throw new HttpError(503, "not_configured", "Sign-in is not set up yet.");
  return c;
}

export function cleanEmail(v) {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  if (e.length < 6 || e.length > 254) return null;
  return /^[^\s@<>"',;:\\()\[\]]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(e) ? e : null;
}

export const cleanLang = (v) => (LANGS.includes(v) ? v : "en");

/* Only paths on this site, so a sign-in link can never bounce someone to another website. */
export function cleanNext(v) {
  return typeof v === "string" && /^\/[A-Za-z0-9_\-./]{0,120}$/.test(v) && !v.includes("//") && !v.startsWith("/api/") ? v : "/account.html";
}

/* What we note about a request: a keyed hash of the IP (never the IP itself), the country and the browser name. */
export async function requestMeta(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "";
  return {
    ip,
    ipHash: ip ? (await hmacHex(env.SESSION_SECRET, "ip:" + ip)).slice(0, 32) : null,
    country: (request.cf && request.cf.country) || request.headers.get("CF-IPCountry") || null,
    ua: (request.headers.get("User-Agent") || "").slice(0, 200) || null,
  };
}

export async function logEvent(env, meta, { userId = null, email = null, method, event, reason = null }) {
  await env.DB.prepare(
    "INSERT INTO login_events (user_id, email, method, event, reason, ip_hash, country, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(userId, email, method, event, reason, meta.ipHash, meta.country, meta.ua, now()).run();
}

/* How many matching events happened in the last `seconds`. */
export async function countEvents(env, { event, email = null, ipHash = null, seconds }) {
  if (!email && !ipHash) return 0;
  const col = email ? "email" : "ip_hash";
  const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM login_events WHERE event = ? AND ${col} = ? AND created_at > ?`)
    .bind(event, email || ipHash, now() - seconds).first("n");
  return n || 0;
}

export async function lastEventAt(env, { event, email }) {
  return (await env.DB.prepare("SELECT MAX(created_at) AS t FROM login_events WHERE event = ? AND email = ?").bind(event, email).first("t")) || 0;
}

/* Finds the account for a verified sign-in, or makes one.
   Google: matched by Google's own account id first, then by the (Google-verified) email address. */
export async function findOrCreateUser(env, { email, name = null, googleSub = null, method, lang = "en" }) {
  const t = now();
  let user = null;
  if (googleSub) user = await env.DB.prepare("SELECT * FROM users WHERE google_sub = ?").bind(googleSub).first();
  if (!user) user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();

  let created = false;
  if (!user) {
    const id = crypto.randomUUID();
    try {
      await env.DB.prepare(
        "INSERT INTO users (id, email, email_verified, name, google_sub, signup_method, lang, created_at, updated_at, last_login_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, email, name, googleSub, method, lang, t, t, t).run();
      created = true;
    } catch (err) {
      if (!/UNIQUE/i.test(String(err && err.message))) throw err; // two sign-ins at the same instant: the other one made the row
    }
    user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
    if (!user) throw new Error("user row missing after insert");
  }
  if (user.status !== "active") throw new HttpError(403, "account_blocked", "This account cannot sign in.");

  if (!created) {
    await env.DB.prepare(
      "UPDATE users SET email_verified = 1, google_sub = COALESCE(google_sub, ?), name = COALESCE(name, ?), lang = ?, last_login_at = ?, updated_at = ? WHERE id = ?"
    ).bind(googleSub, name, lang, t, t, user.id).run();
    user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
  }
  return { user, created };
}

export async function createSession(env, userId, method, client = "web") {
  const token = randomToken(32);
  const t = now();
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, token_hash, client, method, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), userId, await sha256Hex(token), client, method, t, t, t + SESSION_SECONDS).run();
  return token;
}

const COOKIE_TAIL = "; Path=/; Secure; SameSite=Lax";

export function sessionCookies(token) {
  return [
    `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_SECONDS}; HttpOnly${COOKIE_TAIL}`,
    `${HINT_COOKIE}=1; Max-Age=${SESSION_SECONDS}${COOKIE_TAIL}`,
  ];
}

export function clearSessionCookies() {
  return [`${SESSION_COOKIE}=; Max-Age=0; HttpOnly${COOKIE_TAIL}`, `${HINT_COOKIE}=; Max-Age=0${COOKIE_TAIL}`];
}

export const tempCookie = (name, value, seconds) => `${name}=${value}; Max-Age=${seconds}; HttpOnly${COOKIE_TAIL}`;

/* The signed-in user for this request, or null. */
export async function getSession(request, env) {
  const token = cookies(request)[SESSION_COOKIE];
  if (!token || token.length > 200) return null;
  const t = now();
  const row = await env.DB.prepare(
    `SELECT s.id AS session_id, s.method AS session_method, s.last_seen_at AS seen, u.*
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active'`
  ).bind(await sha256Hex(token), t).first();
  if (!row) return null;
  if (t - row.seen > 3600) await env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(t, row.session_id).run();
  return { user: row, sessionId: row.session_id, method: row.session_method };
}

export async function endSession(env, sessionId) {
  await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(now(), sessionId).run();
}

/* The only user details a page ever receives. */
export const publicUser = (u) => ({ email: u.email, name: u.name || null, method: u.signup_method, since: u.created_at });
