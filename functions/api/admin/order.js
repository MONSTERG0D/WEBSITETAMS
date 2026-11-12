/* One order, for the owner. Owner only: the server checks ADMIN_EMAIL on every call.
   GET  /api/admin/order?ref=TAS-XXXXXX   everything about it: customer, choices, brief, parts, payments, history
   POST /api/admin/order  { ref, action, ... }
     price      { parts: [rupees, ...] }  set the price, as one part or several (advance, milestones, final).
                One part of 0 accepts the order for free. Emails the customer the pay link.
     next_part  {}                        ask for the next part of a split price. Emails the pay link.
     status     { status }                "in_progress", "delivered" or "cancelled"
     note       { note }                  the owner's private note (the customer never sees it)
     resend     {}                        email the pay link for the part that is due, again
     confirm    { payment_id }            "Mark paid": the money for a submitted UPI reference arrived. Emails a receipt.
     reject     { payment_id }            the reference does not match a payment. Emails the customer to check it.
     mark_paid  { reference }             the part that is due was paid some other way (reference optional).
   Every change is written to audit_log, and so is every email (sent or not, with the reason).
   Emails here are sent before answering, so the admin page can say at once whether one failed. */
import { HttpError, json, readJson } from "../../_lib/http.js";
import { requireAdmin, requestMeta, now } from "../../_lib/auth.js";
import { cleanRef, cleanText, pageInfo, liveParts, partStatements, auditStatement, siteOrigin, logEmail, MAX_PARTS, MAX_PRICE } from "../../_lib/orders.js";
import { payMail, acceptedMail, paidMail, rejectedMail, mailCustomer, safeMail } from "../../_lib/ordermail.js";
import { settleStatements, cleanUtr } from "../../_lib/payments.js";

/* Which status the owner can move an order to, from where. "paid" comes from confirming payments, never by hand. */
const MOVES = {
  in_progress: ["pending", "paid"],
  delivered: ["pending", "paid", "in_progress"],
  cancelled: ["requested", "pending", "in_progress"],
};

async function load(env, ref) {
  const r = cleanRef(ref);
  const order = r ? await env.DB.prepare("SELECT * FROM orders WHERE ref = ?").bind(r).first() : null;
  if (!order) throw new HttpError(404, "not_found", "No such order.");
  return order;
}

async function view(env, order) {
  const user = await env.DB.prepare("SELECT name, email, status, lang, created_at FROM users WHERE id = ?").bind(order.user_id).first();
  const parts = await liveParts(env, order.id);
  const payments = (await env.DB.prepare(
    "SELECT id, provider, amount_minor, currency, status, reference, provider_json, created_at, confirmed_at FROM payments WHERE order_id = ? ORDER BY created_at DESC"
  ).bind(order.id).all()).results.map((p) => { let j = null; try { j = p.provider_json ? JSON.parse(p.provider_json) : null; } catch (e) {} delete p.provider_json; return { ...p, part: j && j.part ? j.part : null }; });
  const history = (await env.DB.prepare(
    "SELECT actor_type, action, data_json, created_at FROM audit_log WHERE entity_type = 'order' AND entity_id = ? ORDER BY created_at DESC, id DESC LIMIT 30"
  ).bind(order.id).all()).results.map((h) => { let d = null; try { d = h.data_json ? JSON.parse(h.data_json) : null; } catch (e) {} return { by: h.actor_type, action: h.action, data: d, at: h.created_at }; });
  const live = payments.filter((p) => p.status === "submitted" || p.status === "confirmed").length;
  const paidPart = parts.some((p) => p.status === "paid");
  return {
    ref: order.ref, kind: order.kind, title: order.title, status: order.status, brief: order.brief || "", note: order.admin_note || "",
    amount_minor: order.amount_minor, currency: order.currency, service_id: order.service_id,
    created_at: order.created_at, priced_at: order.priced_at, paid_at: order.paid_at, closed_at: order.closed_at,
    info: pageInfo(order),
    customer: user ? { name: user.name, email: user.email, status: user.status, lang: user.lang, since: user.created_at } : null,
    parts: parts.map((p) => ({ seq: p.seq, amount_minor: p.amount_minor, status: p.status, due_at: p.due_at, paid_at: p.paid_at, checking: p.status === "due" && p.pay_status === "submitted" })),
    payments, history,
    can: {
      price: ["requested", "pending"].includes(order.status) && !live && !paidPart,
      next_part: !["cancelled", "refunded", "delivered"].includes(order.status) && !parts.some((p) => p.status === "due") && parts.some((p) => p.status === "locked"),
      resend: !["cancelled", "refunded"].includes(order.status) && parts.some((p) => p.status === "due" && p.pay_status !== "submitted"),
      mark_paid: !["cancelled", "refunded"].includes(order.status) && parts.some((p) => p.status === "due" && p.pay_status !== "submitted"),
      status: Object.keys(MOVES).filter((s) => MOVES[s].includes(order.status) && !(s === "cancelled" && (live || paidPart))),
    },
    upi_day_limit: 100000,
  };
}

export async function onRequestGet({ request, env }) {
  await requireAdmin(request, env);
  const order = await load(env, new URL(request.url).searchParams.get("ref"));
  return json({ ok: true, order: await view(env, order) });
}

export async function onRequestPost({ request, env }) {
  const session = await requireAdmin(request, env);
  const body = await readJson(request, 8000);
  const order = await load(env, body.ref);
  const current = await view(env, order);
  const t = now(), meta = await requestMeta(request, env), origin = siteOrigin(request);
  const audit = (action, data) => auditStatement(env, { actor: "admin", userId: session.user.id, action, orderId: order.id, ipHash: meta.ipHash, t, data });
  const customer = current.customer;
  const lang = (current.info && current.info.lang) || (customer && customer.lang) || "en";
  let mail = null, mailKind = null;

  if (body.action === "price") {
    if (!current.can.price) throw new HttpError(409, "cannot_price", "This order cannot be priced now.");
    const parts = Array.isArray(body.parts) ? body.parts.map(Number) : [];
    const free = parts.length === 1 && parts[0] === 0;
    if (!parts.length || parts.length > MAX_PARTS || (!free && !parts.every((r) => Number.isInteger(r) && r >= 1 && r <= MAX_PRICE))) {
      throw new HttpError(400, "bad_parts", "Each part must be a whole number of rupees.");
    }
    const total = parts.reduce((a, b) => a + b, 0);
    if (total > MAX_PRICE) throw new HttpError(400, "bad_parts", "That price is too high.");
    await env.DB.batch([
      ...partStatements(env, order, free ? [] : parts, t),
      env.DB.prepare("UPDATE orders SET amount_minor = ?, status = ?, priced_at = ?, updated_at = ? WHERE id = ?").bind(total * 100, free ? "in_progress" : "pending", t, t, order.id),
      audit("order.priced", { total, parts: parts.length, was: order.amount_minor === null ? null : order.amount_minor / 100 }),
    ]);
    mailKind = free ? "accepted" : "pay";
    mail = safeMail(() => free
      ? acceptedMail(lang, { ref: order.ref, title: order.title, origin })
      : payMail(lang, { ref: order.ref, title: order.title, amountMinor: parts[0] * 100, currency: order.currency, n: 1, total: parts.length, origin }));
  } else if (body.action === "next_part") {
    if (!current.can.next_part) throw new HttpError(409, "no_next_part", "There is no part to ask for.");
    const next = current.parts.find((p) => p.status === "locked");
    await env.DB.batch([
      env.DB.prepare("UPDATE order_parts SET status = 'due', due_at = ?, updated_at = ? WHERE order_id = ? AND seq = ? AND status = 'locked'").bind(t, t, order.id, next.seq),
      env.DB.prepare("UPDATE orders SET updated_at = ? WHERE id = ?").bind(t, order.id),
      audit("order.part_opened", { seq: next.seq, amount: next.amount_minor / 100 }),
    ]);
    mailKind = "pay";
    mail = safeMail(() => payMail(lang, { ref: order.ref, title: order.title, amountMinor: next.amount_minor, currency: order.currency, n: next.seq, total: current.parts.length, origin }));
  } else if (body.action === "resend") {
    if (!current.can.resend) throw new HttpError(409, "no_due_part", "Nothing is due on this order.");
    const due = current.parts.find((p) => p.status === "due");
    mailKind = "pay";
    mail = safeMail(() => payMail(lang, { ref: order.ref, title: order.title, amountMinor: due.amount_minor, currency: order.currency, n: due.seq, total: current.parts.length, origin }));
  } else if (body.action === "confirm" || body.action === "reject") {
    const pay = await env.DB.prepare("SELECT * FROM payments WHERE id = ? AND order_id = ?").bind(String(body.payment_id || ""), order.id).first();
    if (!pay || pay.status !== "submitted") throw new HttpError(409, "payment_not_waiting", "That payment is not waiting for a check.");
    const parts = await liveParts(env, order.id), part = parts.find((p) => p.payment_id === pay.id && p.status === "due");
    if (body.action === "confirm") {
      if (!part) throw new HttpError(409, "payment_not_waiting", "That payment is not waiting for a check.");
      const settle = settleStatements(env, { order, parts, part, paymentId: pay.id, actorId: session.user.id, t });
      await env.DB.batch([...settle.statements, audit("payment.confirmed", { reference: pay.reference, amount: pay.amount_minor / 100, part: part.seq, all_paid: settle.allPaid })]);
      mailKind = "paid";
      mail = safeMail(() => paidMail(lang, { ref: order.ref, title: order.title, amountMinor: pay.amount_minor, currency: pay.currency, allPaid: settle.allPaid, origin }));
    } else {
      await env.DB.batch([
        env.DB.prepare("UPDATE payments SET status = 'rejected', updated_at = ? WHERE id = ? AND status = 'submitted'").bind(t, pay.id),
        env.DB.prepare("UPDATE order_parts SET payment_id = NULL, updated_at = ? WHERE payment_id = ? AND status = 'due'").bind(t, pay.id),
        env.DB.prepare("UPDATE orders SET updated_at = ? WHERE id = ?").bind(t, order.id),
        audit("payment.rejected", { reference: pay.reference, amount: pay.amount_minor / 100 }),
      ]);
      mailKind = "rejected";
      mail = safeMail(() => rejectedMail(lang, { ref: order.ref, title: order.title, utr: pay.reference, amountMinor: pay.amount_minor, currency: pay.currency, origin }));
    }
  } else if (body.action === "mark_paid") {
    if (!current.can.mark_paid) throw new HttpError(409, "no_due_part", "Nothing is due on this order.");
    const typed = typeof body.reference === "string" && body.reference.trim() ? cleanUtr(body.reference) : null;
    if (typeof body.reference === "string" && body.reference.trim() && !typed) throw new HttpError(400, "bad_reference", "A UPI reference is 12 digits.");
    const parts = await liveParts(env, order.id), part = parts.find((p) => p.status === "due");
    const id = crypto.randomUUID();
    const settle = settleStatements(env, { order, parts, part, paymentId: id, actorId: session.user.id, t });
    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO payments (id, order_id, user_id, provider, amount_minor, currency, status, reference, provider_json, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?, ?, 'marked paid by the owner', ?, ?)`
        ).bind(id, order.id, order.user_id, typed ? "upi" : "manual", part.amount_minor, part.currency || order.currency, typed, JSON.stringify({ part: part.seq, of: parts.length }), t, t),
        ...settle.statements,
        audit("payment.confirmed", { reference: typed, amount: part.amount_minor / 100, part: part.seq, all_paid: settle.allPaid, by_hand: true }),
      ]);
    } catch (err) {
      if (/UNIQUE/i.test(String(err && err.message))) throw new HttpError(409, "reference_used", "That UPI reference was already used.");
      throw err;
    }
    mailKind = "paid";
    mail = safeMail(() => paidMail(lang, { ref: order.ref, title: order.title, amountMinor: part.amount_minor, currency: part.currency || order.currency, allPaid: settle.allPaid, origin }));
  } else if (body.action === "status") {
    const to = body.status;
    if (!current.can.status.includes(to)) throw new HttpError(409, "bad_move", "That status change is not possible now.");
    const stmts = [env.DB.prepare("UPDATE orders SET status = ?, updated_at = ?, closed_at = ? WHERE id = ?").bind(to, t, to === "in_progress" ? null : t, order.id)];
    if (to === "cancelled") stmts.push(env.DB.prepare("UPDATE order_parts SET status = 'void', updated_at = ? WHERE order_id = ? AND status IN ('locked', 'due')").bind(t, order.id));
    stmts.push(audit("order.status", { from: order.status, to }));
    await env.DB.batch(stmts);
  } else if (body.action === "note") {
    const note = cleanText(body.note, 2000);
    await env.DB.batch([
      env.DB.prepare("UPDATE orders SET admin_note = ?, updated_at = ? WHERE id = ?").bind(note || null, t, order.id),
      audit("order.note", { length: note.length }),
    ]);
  } else {
    throw new HttpError(400, "bad_request", "Unknown action.");
  }

  let email = null;
  if (mailKind) {
    email = customer && customer.status === "active" ? await mailCustomer(env, customer.email, mail) : { ok: false, status: 0, error: "the account is not active" };
    await logEmail(env, order.id, "customer", mailKind, email);
    email = { ok: email.ok, error: email.ok ? null : email.error };
  }
  const fresh = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(order.id).first();
  return json({ ok: true, email, order: await view(env, fresh) });
}
