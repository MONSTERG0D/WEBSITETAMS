/* Cloudflare Turnstile: checks that the "I am human" token from the page is real.
   A token works once and for five minutes. */
export async function verifyTurnstile(env, token, ip) {
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const body = { secret: env.TURNSTILE_SECRET_KEY, response: token };
    if (ip) body.remoteip = ip;
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data && data.success === true);
  } catch (err) {
    console.error("turnstile check failed", err && err.message);
    return false;
  }
}
