/* GET /api/account/orders — the signed-in person's own orders, newest first. */
import { HttpError, json } from "../../_lib/http.js";
import { requireReady, getSession } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  requireReady(env);
  const session = await getSession(request, env);
  if (!session) throw new HttpError(401, "signed_out", "Sign in first.");
  const rows = await env.DB.prepare(
    "SELECT ref, kind, title, status, amount_minor, currency, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100"
  ).bind(session.user.id).all();
  return json({ ok: true, orders: rows.results });
}
