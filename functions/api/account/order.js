/* One of the signed-in person's own orders.
   GET  /api/account/order?ref=TAS-XXXXXX            the order, its parts and what can be done with it
   POST /api/account/order  { ref, action: "cancel" } cancel it, while nothing has been paid
   Someone else's order answers "not found", the same as an order that does not exist. */
import { HttpError, json, readJson } from "../../_lib/http.js";
import { requireReady, getSession, requestMeta, now } from "../../_lib/auth.js";
import { cleanRef, pageInfo, liveParts, livePaymentCount, canCustomerCancel, auditStatement, siteOrigin } from "../../_lib/orders.js";
import { notifyOwner } from "../../_lib/mail.js";

async function own(request, env, ref) {
  requireReady(env);
  const session = await getSession(request, env);
  if (!session) throw new HttpError(401, "signed_out", "Sign in first.");
  const r = cleanRef(ref);
  const order = r ? await env.DB.prepare("SELECT * FROM orders WHERE ref = ? AND user_id = ?").bind(r, session.user.id).first() : null;
  if (!order) throw new HttpError(404, "not_found", "No such order.");
  return { session, order };
}

async function view(env, order) {
  const parts = await liveParts(env, order.id);
  const payments = await livePaymentCount(env, order.id);
  return {
    ref: order.ref, kind: order.kind, title: order.title, status: order.status, brief: order.brief || "",
    amount_minor: order.amount_minor, currency: order.currency, created_at: order.created_at, priced_at: order.priced_at,
    info: pageInfo(order),
    parts: parts.map((p) => ({ seq: p.seq, amount_minor: p.amount_minor, status: p.status })),
    can_cancel: canCustomerCancel(order, parts, payments),
  };
}

export async function onRequestGet({ request, env }) {
  const { order } = await own(request, env, new URL(request.url).searchParams.get("ref"));
  return json({ ok: true, order: await view(env, order) });
}

export async function onRequestPost({ request, env, waitUntil }) {
  const body = await readJson(request);
  const { session, order } = await own(request, env, body.ref);
  if (body.action !== "cancel") throw new HttpError(400, "bad_request", "Unknown action.");
  const parts = await liveParts(env, order.id);
  if (!canCustomerCancel(order, parts, await livePaymentCount(env, order.id))) throw new HttpError(409, "cannot_cancel", "This order can no longer be cancelled here.");
  const t = now(), meta = await requestMeta(request, env);
  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status = 'cancelled', closed_at = ?, updated_at = ? WHERE id = ? AND status IN ('requested', 'pending')").bind(t, t, order.id),
    env.DB.prepare("UPDATE order_parts SET status = 'void', updated_at = ? WHERE order_id = ? AND status IN ('locked', 'due')").bind(t, order.id),
    auditStatement(env, { actor: "user", userId: session.user.id, action: "order.cancelled", orderId: order.id, ipHash: meta.ipHash, t, data: { from: order.status } }),
  ]);
  const origin = siteOrigin(request);
  const notice = notifyOwner(env, `Cancelled by the customer: ${order.ref}`, [
    `${session.user.name || session.user.email} cancelled order ${order.ref}.`, "", "What: " + order.title, "Customer: " + session.user.email,
  ], `${origin}/admin.html?order=${order.ref}`).catch(() => {});
  if (waitUntil) waitUntil(notice); else await notice;
  const fresh = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(order.id).first();
  return json({ ok: true, order: await view(env, fresh) });
}
