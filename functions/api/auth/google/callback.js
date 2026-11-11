/* GET /api/auth/google/callback?code=...&state=...
   Google sends the visitor back here. Everything is checked on the server, then the session
   cookie is set and the visitor lands on the page they came from. Any problem goes back to the
   account page with a short error code, never with details. */
import { HttpError, redirect, cookies } from "../../../_lib/http.js";
import { b64urlToText, hmacHex, safeEqual } from "../../../_lib/crypto.js";
import {
  config, cleanEmail, cleanLang, cleanNext, now, requestMeta, logEvent,
  findOrCreateUser, createSession, sessionCookies, tempCookie, OAUTH_COOKIE,
} from "../../../_lib/auth.js";
import { exchangeCode, verifyIdToken } from "../../../_lib/google.js";

const dropCookie = tempCookie(OAUTH_COOKIE, "", 0);
const back = (code) => redirect("/account.html?error=" + code, [dropCookie]);

async function readOauthCookie(request, env) {
  const raw = cookies(request)[OAUTH_COOKIE] || "";
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = raw.slice(0, dot);
  if (!safeEqual(raw.slice(dot + 1), await hmacHex(env.SESSION_SECRET, "oauth:" + payload))) return null;
  try {
    const v = JSON.parse(b64urlToText(payload));
    return v && now() - v.t <= 600 ? v : null;
  } catch (e) {
    return null;
  }
}

export async function onRequestGet(context) {
  try {
    return await finish(context);
  } catch (err) {
    console.error("google callback crashed:", err && err.stack ? err.stack : err);
    return back("server_error");
  }
}

async function finish({ request, env }) {
  if (!config(env).google) return back("not_configured");
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return back("google_cancelled");

  const saved = await readOauthCookie(request, env);
  const state = url.searchParams.get("state") || "", code = url.searchParams.get("code") || "";
  if (!saved || !code || !safeEqual(saved.state, state)) return back("google_state");

  const meta = await requestMeta(request, env);
  let claims;
  try {
    const idToken = await exchangeCode(env, { code, redirectUri: url.origin + "/api/auth/google/callback", verifier: saved.verifier });
    claims = await verifyIdToken(idToken, { clientId: env.GOOGLE_CLIENT_ID, nonce: saved.nonce });
  } catch (err) {
    console.error("google sign-in failed:", err && err.message);
    await logEvent(env, meta, { method: "google", event: "failed", reason: "google_invalid" });
    return back("google_failed");
  }

  const email = cleanEmail(claims.email);
  if (!email) return back("google_failed");
  const name = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim().slice(0, 120) : null;

  let found;
  try {
    found = await findOrCreateUser(env, { email, name, googleSub: String(claims.sub), method: "google", lang: cleanLang(saved.lang) });
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
    await logEvent(env, meta, { email, method: "google", event: "failed", reason: err.code });
    return back(err.code);
  }

  const token = await createSession(env, found.user.id, "google");
  await logEvent(env, meta, { userId: found.user.id, email, method: "google", event: found.created ? "signup" : "login" });
  return redirect(cleanNext(saved.next), [...sessionCookies(token), dropCookie]);
}
