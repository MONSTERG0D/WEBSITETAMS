/* THE AAMIR SHEIKH — API helpers shared by every route in /functions/api.
   Responses are always JSON. Errors carry a short code; the pages translate codes
   into the visitor's language, so no user-facing prose lives in the API. */

export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra || null;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export function fail(status, code, message, extra) {
  return json({ ok: false, error: { code, message: message || code }, ...(extra || {}) }, status);
}

/* A redirect that can also carry cookies. */
export function redirect(location, setCookies = []) {
  const res = new Response(null, { status: 302, headers: { Location: location } });
  for (const c of setCookies) res.headers.append("Set-Cookie", c);
  return res;
}

/* Reads a small JSON object from the request body. Insisting on a JSON content type also
   means a plain HTML form on another website can never post to these routes. */
export async function readJson(request, maxBytes = 4096) {
  if (!/^application\/json\b/i.test(request.headers.get("Content-Type") || "")) {
    throw new HttpError(415, "bad_request", "Send JSON.");
  }
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "bad_request", "Too much data.");
  let data = null;
  try { data = JSON.parse(text); } catch (e) { data = null; }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new HttpError(400, "bad_request", "Bad JSON.");
  return data;
}

export function cookies(request) {
  const out = {};
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    if (k && !(k in out)) out[k] = part.slice(i + 1).trim();
  }
  return out;
}
