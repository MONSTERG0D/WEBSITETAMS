/* Google sign-in, server side (the "authorization code" flow).
   The visitor goes to Google, Google sends them back with a one-time code, and this server swaps
   that code for an ID token. The token's signature and contents are then checked here. */
import { b64urlToBytes, b64urlToText } from "./crypto.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export function googleAuthUrl({ clientId, redirectUri, state, nonce, challenge, lang }) {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    hl: lang === "zh" ? "zh-CN" : lang,
  });
  return AUTH_URL + "?" + q.toString();
}

export async function exchangeCode(env, { code, redirectUri, verifier }) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }).toString(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || typeof data.id_token !== "string") {
    throw new Error("google token exchange failed: " + res.status + " " + ((data && data.error) || ""));
  }
  return data.id_token;
}

/* Google's public signing keys, kept in memory for as long as Google says they are fresh. */
let keyCache = null, keyCacheUntil = 0;
async function googleKeys(refresh) {
  if (!refresh && keyCache && Date.now() < keyCacheUntil) return keyCache;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error("google keys unavailable: " + res.status);
  const age = /max-age=(\d+)/.exec(res.headers.get("Cache-Control") || "");
  keyCache = (await res.json()).keys || [];
  keyCacheUntil = Date.now() + Math.min(age ? +age[1] : 3600, 86400) * 1000;
  return keyCache;
}

/* Checks the ID token and returns its claims. Throws if anything is off. */
export async function verifyIdToken(idToken, { clientId, nonce }) {
  const parts = String(idToken).split(".");
  if (parts.length !== 3) throw new Error("id token: wrong shape");
  const head = JSON.parse(b64urlToText(parts[0]));
  if (head.alg !== "RS256" || !head.kid) throw new Error("id token: unexpected algorithm");

  let jwk = (await googleKeys(false)).find((k) => k.kid === head.kid);
  if (!jwk) jwk = (await googleKeys(true)).find((k) => k.kid === head.kid); // Google rotated its keys
  if (!jwk) throw new Error("id token: unknown signing key");

  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const good = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), signed);
  if (!good) throw new Error("id token: bad signature");

  const c = JSON.parse(b64urlToText(parts[1]));
  const t = Math.floor(Date.now() / 1000);
  if (!ISSUERS.includes(c.iss)) throw new Error("id token: wrong issuer");
  if (c.aud !== clientId) throw new Error("id token: wrong audience");
  if (typeof c.exp !== "number" || c.exp < t - 60) throw new Error("id token: expired");
  if (!nonce || c.nonce !== nonce) throw new Error("id token: wrong nonce");
  if (!c.sub || typeof c.email !== "string" || (c.email_verified !== true && c.email_verified !== "true")) throw new Error("id token: no verified email");
  return c;
}
