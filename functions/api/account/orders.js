/* GET /api/account/orders — the signed-in person's own orders, newest first.
   Each row carries the few details a page needs to name it in the visitor's language (service, style,
   length, timing) and how much is due now, if anything. */
import { HttpError, json } from "../../_lib/http.js";
import { requireReady, getSession } from "../../_lib/auth.js";
import { pageInfo } from "../../_lib/orders.js";

export async function onRequestGet({ request, env }) {
  requireReady(env);
  const session = await getSession(request, env);
  if (!session) throw new HttpError(401, "signed_out", "Sign in first.");
  const rows = await env.DB.prepare(
    `SELECT o.ref, o.kind, o.title, o.status, o.amount_minor, o.currency, o.created_at, o.form_json,
            (SELECT p.amount_minor FROM order_parts p WHERE p.order_id = o.id AND p.status = 'due' ORDER BY p.seq LIMIT 1) AS due_minor
       FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 100`
  ).bind(session.user.id).all();
  const orders = rows.results.map((o) => {
    const info = pageInfo(o);
    delete o.form_json;
    return { ...o, info };
  });
  return json({ ok: true, orders });
}
