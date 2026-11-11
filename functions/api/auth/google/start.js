/* GET /api/auth/google/start?next=/page.html&lang=xx
   Sends the visitor to Google. A short-lived, signed cookie remembers the anti-forgery values
   so the way back can be checked. */
import { redirect } from "../../../_lib/http.js";
import { b64urlText, hmacHex, randomToken, sha256B64url } from "../../../_lib/crypto.js";
import { config, cleanLang, cleanNext, now, tempCookie, OAUTH_COOKIE } from "../../../_lib/auth.js";
import { googleAuthUrl } from "../../../_lib/google.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!config(env).google) return redirect("/account.html?error=not_configured");

  const lang = cleanLang(url.searchParams.get("lang"));
  const state = randomToken(16), nonce = randomToken(16), verifier = randomToken(32);
  const payload = b64urlText(JSON.stringify({ state, nonce, verifier, lang, next: cleanNext(url.searchParams.get("next")), t: now() }));
  const cookie = payload + "." + (await hmacHex(env.SESSION_SECRET, "oauth:" + payload));

  return redirect(
    googleAuthUrl({
      clientId: env.GOOGLE_CLIENT_ID,
      redirectUri: url.origin + "/api/auth/google/callback",
      state,
      nonce,
      challenge: await sha256B64url(verifier),
      lang,
    }),
    [tempCookie(OAUTH_COOKIE, cookie, 600)]
  );
}
