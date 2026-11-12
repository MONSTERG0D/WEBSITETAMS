/* One of the signed-in person's own orders.
   GET  /api/account/order?ref=TAS-XXXXXX                       the order, its parts, and how to pay what is due
   POST /api/account/order  { ref, action: "cancel" }            cancel it, while nothing has been paid
   POST /api/account/order  { ref, action: "paid", reference }   "I've paid": the 12-digit UPI reference (UTR)
   Someone else's order answers "not found", the same as an order that does not exist. */
import { HttpError, json, readJson } from "../../_lib/http.js";
import { requireReady, getSession, requestMeta, now } from "../../_lib/auth.js";
import { cleanRef, pageInfo, liveParts, livePaymentCount, canCustomerCancel, auditStatement, siteOrigin, logEmail, rupees } from "../../_lib/orders.js";
import { upiConfig, upiQuery, payNote, cleanUtr, MAX_SUBMITS_PER_DAY } from "../../_lib/payments.js";
import { notifyOwnerResult } from "../../_lib/mail.js";

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
  const due = parts.find((p) => p.status === "due");
  const open = !["cancelled", "refunded"].includes(order.status);
  let pay = null;
  if (open && due) {
    const upi = upiConfig(env), note = payNote(order.ref, due.seq, parts.length);
    pay = {
      seq: due.seq, count: parts.length, amount_minor: due.amount_minor, currency: due.currency || order.currency,
      checking: due.pay_status === "submitted" ? { reference: due.pay_ref } : null,
      upi: upi ? { id: upi.id, backups: upi.backups, payee: upi.payee, note, query: upiQuery({ id: upi.id, payee: upi.payee, amountMinor: due.amount_minor, note }) } : null,
    };
  }
  return {
    ref: order.ref, kind: order.kind, title: order.title, status: order.status, brief: order.brief || "",
    amount_minor: order.amount_minor, currency: order.currency, created_at: order.created_at, priced_at: order.priced_at,
    info: pageInfo(order),
    parts: parts.map((p) => ({ seq: p.seq, amount_minor: p.amount_minor, status: p.status, checking: p.status === "due" && p.pay_status === "submitted" })),
    pay,
    can_cancel: canCustomerCancel(order, parts, payments),
  };
}

export async function onRequestGet({ request, env }) {
  const { order } = await own(request, env, new URL(request.url).searchParams.get("ref"));
  return json({ ok: true, order: await view(env, order) });
}

async function cancel(request, env, waitUntil, session, order) {
  const parts = await liveParts(env, order.id);
  if (!canCustomerCancel(order, parts, await livePaymentCount(env, order.id))) throw new HttpError(409, "cannot_cancel", "This order can no longer be cancelled here.");
  const t = now(), meta = await requestMeta(request, env);
  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status = 'cancelled', closed_at = ?, updated_at = ? WHERE id = ? AND status IN ('requested', 'pending')").bind(t, t, order.id),
    env.DB.prepare("UPDATE order_parts SET status = 'void', updated_at = ? WHERE order_id = ? AND status IN ('locked', 'due')").bind(t, order.id),
    auditStatement(env, { actor: "user", userId: session.user.id, action: "order.cancelled", orderId: order.id, ipHash: meta.ipHash, t, data: { from: order.status } }),
  ]);
  const origin = siteOrigin(request);
  const notice = notifyOwnerResult(env, `Cancelled by the customer: ${order.ref}`, [
    `${session.user.name || session.user.email} cancelled order ${order.ref}.`, "", "What: " + order.title, "Customer: " + session.user.email,
  ], `${origin}/admin.html?order=${order.ref}`).then((r) => logEmail(env, order.id, "owner", "cancelled", r)).catch(() => {});
  if (waitUntil) waitUntil(notice); else await notice;
}

/* "I've paid": records the UPI reference against the part that is due. The order stays as it is until
   the owner finds the money and presses "Mark paid". */
async function paid(request, env, waitUntil, session, order, body) {
  if (["cancelled", "refunded"].includes(order.status)) throw new HttpError(409, "not_payable", "This order cannot be paid.");
  const parts = await liveParts(env, order.id);
  const due = parts.find((p) => p.status === "due");
  if (!due) throw new HttpError(409, "not_payable", "Nothing is due on this order.");
  if (due.pay_status === "submitted") throw new HttpError(409, "already_submitted", "A UPI reference is already waiting for a check.");
  const utr = cleanUtr(body.reference);
  if (!utr) throw new HttpError(400, "bad_reference", "A UPI reference is 12 digits.");
  const t = now();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM payments WHERE order_id = ? AND created_at > ?").bind(order.id, t - 86400).first("n");
  if (recent >= MAX_SUBMITS_PER_DAY) throw new HttpError(429, "rate_limited", "Too many tries today.");
  const meta = await requestMeta(request, env), id = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO payments (id, order_id, user_id, provider, amount_minor, currency, status, reference, provider_json, created_at, updated_at)
         VALUES (?, ?, ?, 'upi', ?, ?, 'submitted', ?, ?, ?, ?)`
      ).bind(id, order.id, session.user.id, due.amount_minor, due.currency || order.currency, utr, JSON.stringify({ part: due.seq, of: parts.length }), t, t),
      env.DB.prepare("UPDATE order_parts SET payment_id = ?, updated_at = ? WHERE id = ? AND status = 'due'").bind(id, t, due.id),
      env.DB.prepare("UPDATE orders SET updated_at = ? WHERE id = ?").bind(t, order.id),
      auditStatement(env, { actor: "user", userId: session.user.id, action: "payment.submitted", orderId: order.id, ipHash: meta.ipHash, t, data: { reference: utr, amount: due.amount_minor / 100, part: due.seq } }),
    ]);
  } catch (err) {
    if (/UNIQUE/i.test(String(err && err.message))) throw new HttpError(409, "reference_used", "That UPI reference was already used.");
    throw err;
  }
  const origin = siteOrigin(request);
  const notice = notifyOwnerResult(env, `Payment to check: ${order.ref} · ${rupees(due.amount_minor)}`, [
    `${session.user.name || session.user.email} says they paid ${rupees(due.amount_minor)} for ${order.ref}${parts.length > 1 ? ` (part ${due.seq} of ${parts.length})` : ""}.`, "",
    "UPI reference (UTR): " + utr,
    "What: " + order.title,
    "Customer: " + session.user.email, "",
    "Find this reference in your bank or UPI app, then press Mark paid (or Reject) in the admin page.",
  ], `${origin}/admin.html?order=${order.ref}`).then((r) => logEmail(env, order.id, "owner", "payment_check", r)).catch(() => {});
  if (waitUntil) waitUntil(notice); else await notice;
}

export async function onRequestPost({ request, env, waitUntil }) {
  const body = await readJson(request);
  const { session, order } = await own(request, env, body.ref);
  if (body.action === "cancel") await cancel(request, env, waitUntil, session, order);
  else if (body.action === "paid") await paid(request, env, waitUntil, session, order, body);
  else throw new HttpError(400, "bad_request", "Unknown action.");
  const fresh = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(order.id).first();
  return json({ ok: true, order: await view(env, fresh) });
}
