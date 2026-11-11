/* Runs before every /api/* route.
   1. Refuses writes that come from another website.
   2. Turns any crash into a clean JSON error (details go to the Cloudflare log, not to the visitor).
   3. Marks every API response as private and uncacheable. */
import { HttpError, fail } from "../_lib/http.js";

const READ_ONLY = new Set(["GET", "HEAD", "OPTIONS"]);

function fromThisSite(request) {
  const origin = request.headers.get("Origin");
  if (origin) return origin === new URL(request.url).origin;
  const site = request.headers.get("Sec-Fetch-Site");
  if (site) return site === "same-origin";
  return true; // not a browser (no Origin, no Sec-Fetch-Site): cookies are not in play
}

export async function onRequest(context) {
  const { request } = context;
  let res;
  try {
    if (!READ_ONLY.has(request.method) && !fromThisSite(request)) {
      throw new HttpError(403, "bad_origin", "This request did not come from the site.");
    }
    res = await context.next();
  } catch (err) {
    if (err instanceof HttpError) {
      res = fail(err.status, err.code, err.message);
    } else {
      console.error("api error", request.method, new URL(request.url).pathname, err && err.stack ? err.stack : err);
      res = fail(500, "server_error", "Something went wrong on our side.");
    }
  }
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "no-store");
  out.headers.set("X-Content-Type-Options", "nosniff");
  out.headers.set("X-Robots-Tag", "noindex");
  out.headers.set("Referrer-Policy", "same-origin");
  return out;
}
