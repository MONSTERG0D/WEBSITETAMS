/* THE AAMIR SHEIKH — API helpers shared by every route in /functions/api.
   Responses are always JSON. Errors carry a short code; the pages translate codes
   into the visitor's language, so no user-facing prose lives in the API. */

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export function fail(status, code, message) {
  return json({ ok: false, error: { code, message: message || code } }, status);
}
