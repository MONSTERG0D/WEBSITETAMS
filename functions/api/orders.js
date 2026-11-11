/* POST /api/orders — place an order. Signed-in customers only.

   From the Services page, one service:
     { source: "service", service, tier, units, timing, brief, phone, lang }
   From the order form (order.html), the services picked there:
     { source: "form", services: [...], likes: [...], budget, timing, brief, name, contact, lang }

   A single-price service with ASAP or 2–4 weeks is priced here, from the catalog, and can be paid
   straight away. Everything else arrives as a request: the owner sets the price in the admin page.
   The first order of a "free" service (the first thumbnail) arrives priced at 0 for the owner to accept. */
import { HttpError, json, readJson } from "../_lib/http.js";
import { requireReady, getSession, cleanLang, requestMeta, now } from "../_lib/auth.js";
import { CATALOG, quote } from "../_lib/catalog.js";
import {
  newRef, cleanText, cleanBrief, cleanPhone, checkOrderLimits, itemName, timingName, serviceTitle, serviceUpsert,
  auditStatement, estimateText, rupees, siteOrigin, FORM_BUDGETS,
} from "../_lib/orders.js";
import { notifyOwner } from "../_lib/mail.js";
import { receivedMail, payMail, mailCustomer } from "../_lib/ordermail.js";

const bad = (code, msg) => new HttpError(400, code, msg);

/* One service from the Services page. */
async function serviceOrder(env, user, body) {
  const id = typeof body.service === "string" ? body.service : "";
  const it = CATALOG.items[id];
  if (!it) throw bad("bad_service", "That service is not on the list.");
  const choice = { tier: typeof body.tier === "string" ? body.tier : null, units: it.unit ? Number(body.units) : null, timing: body.timing };
  let q = quote(id, choice);
  if (q.error) throw bad("bad_" + q.error, "Pick a " + q.error + ".");
  const brief = cleanBrief(body.brief, true);
  let free = false;
  if (it.free) {
    const earlier = await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND service_id = ? AND status <> 'cancelled'").bind(user.id, id).first("n");
    if (!earlier) { q = quote(id, { ...choice, firstFree: true }); free = true; }
  }
  return {
    service: id,
    kind: q.instant ? "fixed" : "custom",
    status: q.instant ? "pending" : "requested",
    amount: q.instant || free ? q.amount : null,
    instant: q.instant,
    title: serviceTitle(id, choice.tier, choice.units),
    brief,
    info: { v: 1, source: "service", service: id, tier: it.tiers ? choice.tier : null, units: it.unit ? choice.units : null, timing: choice.timing, instant: q.instant, free, est: q.est },
  };
}

/* The services picked on the order form, sent to the account as one request. */
function formOrder(body) {
  const list = Array.isArray(body.services) ? body.services : [];
  const services = [...new Set(list.filter((s) => typeof s === "string" && CATALOG.items[s]))].slice(0, 30);
  const likes = (Array.isArray(body.likes) ? body.likes : []).map((s) => cleanText(s, 80)).filter(Boolean).slice(0, 12);
  if (!services.length && !likes.length) throw bad("bad_pick", "Pick at least one thing.");
  const timing = CATALOG.timing.some((t) => t.id === body.timing) ? body.timing : null;
  const budget = FORM_BUDGETS.includes(body.budget) ? body.budget : null;
  const names = services.map((s) => itemName(s));
  const title = "Order form: " + (names.length ? names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "") : "like " + likes.slice(0, 2).join(", "));
  return {
    service: services.length === 1 ? services[0] : null,
    kind: "custom",
    status: "requested",
    amount: null,
    instant: false,
    title: title.slice(0, 160),
    brief: cleanBrief(body.brief, false),
    info: { v: 1, source: "form", services, likes, timing, budget, name: cleanText(body.name, 80) || null, contact: cleanText(body.contact, 120) || null, free: false, instant: false },
  };
}

export async function onRequestPost({ request, env, waitUntil }) {
  requireReady(env);
  const session = await getSession(request, env);
  if (!session) throw new HttpError(401, "signed_out", "Sign in first.");
  const user = session.user;
  const body = await readJson(request, 16000);
  const lang = cleanLang(body.lang);
  const o = body.source === "form" ? formOrder(body) : await serviceOrder(env, user, body);
  o.info.phone = cleanPhone(body.phone);
  o.info.lang = lang;
  await checkOrderLimits(env, user.id);

  const meta = await requestMeta(request, env);
  const t = now(), currency = CATALOG.currency;
  let ref = null, orderId = null;
  for (let attempt = 0; attempt < 5 && !ref; attempt++) {
    const tryRef = newRef(), id = crypto.randomUUID();
    const stmts = [];
    if (o.service) stmts.push(serviceUpsert(env, o.service, t));
    stmts.push(env.DB.prepare(
      `INSERT INTO orders (id, ref, user_id, kind, service_id, title, brief, form_json, amount_minor, currency, status, created_at, updated_at, priced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, tryRef, user.id, o.kind, o.service, o.title, o.brief || null, JSON.stringify(o.info), o.amount === null ? null : o.amount * 100, currency, o.status, t, t, o.instant ? t : null));
    if (o.instant) {
      stmts.push(env.DB.prepare(
        "INSERT INTO order_parts (id, order_id, seq, amount_minor, currency, status, created_at, updated_at, due_at) VALUES (?, ?, 1, ?, ?, 'due', ?, ?, ?)"
      ).bind(crypto.randomUUID(), id, o.amount * 100, currency, t, t, t));
    }
    stmts.push(auditStatement(env, { actor: "user", userId: user.id, action: "order.created", orderId: id, ipHash: meta.ipHash, t,
      data: { source: o.info.source, service: o.service, timing: o.info.timing || null, amount: o.amount, free: o.info.free } }));
    try {
      await env.DB.batch(stmts);
      ref = tryRef; orderId = id;
    } catch (err) {
      if (!/UNIQUE/i.test(String(err && err.message)) || !/ref/i.test(String(err && err.message))) throw err;   // only a clash of references is retried
    }
  }
  if (!ref) throw new Error("could not find a free order reference");

  // emails: the customer in their language, the owner in English. Neither may delay or break the order.
  const origin = siteOrigin(request);
  const toCustomer = o.instant
    ? payMail(lang, { ref, title: o.title, amountMinor: o.amount * 100, currency, n: 1, total: 1, origin })
    : receivedMail(lang, { ref, title: o.title, free: o.info.free, origin });
  const i = o.info, lines = [
    `${o.instant ? "New order" : "New request"} ${ref}`, "",
    "What: " + o.title,
    ...(i.source === "form" ? ["From: the order form", ...(i.likes && i.likes.length ? ["Likes: " + i.likes.join(", ")] : []), ...(i.budget ? ["Budget: " + i.budget] : [])] : []),
    "When: " + (timingName(i.timing) || "—"),
    "Price: " + (o.instant ? rupees(o.amount * 100) + " (fixed, waiting for payment)" : i.free ? "free (first one) — accept it in the admin page" : estimateText(i.est) + " — set the price in the admin page"),
    "", "Customer: " + (user.name || "—") + " · " + user.email,
    ...(i.phone ? ["WhatsApp: " + i.phone] : []),
    ...(i.name || i.contact ? ["On the form: " + [i.name, i.contact].filter(Boolean).join(" · ")] : []),
    "", "Brief:", (o.brief || "—").slice(0, 1500),
  ];
  const notices = Promise.all([
    mailCustomer(env, user.email, toCustomer),
    notifyOwner(env, `${o.instant ? "New order" : "New request"} ${ref}: ${o.title}`, lines, `${origin}/admin.html?order=${ref}`),
  ]).catch(() => {});
  if (waitUntil) waitUntil(notices); else await notices;

  return json({ ok: true, order: { ref, status: o.status, instant: o.instant, free: o.info.free, amount_minor: o.amount === null ? null : o.amount * 100, currency } }, 201);
}
