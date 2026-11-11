/* Orders: the shared rules for placing, pricing, paying in parts and showing an order.
   Prices come from catalog.js (generated from _build/catalog.py), never from the browser.
   Money in the database is paise; the catalog and the admin page work in whole rupees. */
import { HttpError } from "./http.js";
import { now } from "./auth.js";
import { CATALOG, lengthOf } from "./catalog.js";

export const BRIEF_MIN = 8;
export const BRIEF_MAX = 3000;
export const MAX_PARTS = 30;
export const UPI_DAY_LIMIT = 100000;          // rupees: what UPI apps usually allow in a day
export const MAX_PRICE = 100000000;            // rupees: 10 crore, a sanity cap on a typed price

/* Order limits per account, counted from the orders table. */
export const ORDER_LIMITS = { perHour: 6, perDay: 20, openRequests: 10 };

/* Budget and "when" answers on the order form (order.html). Anything else is ignored. */
export const FORM_BUDGETS = ["Under ₹2k", "₹2k–5k", "₹5k–15k", "₹15k+", "Let’s talk"];

/* ---------------------------------------------------------------- references */
/* TAS-7K2Q9M: 6 characters from 32 that cannot be mixed up (no 0/O, no 1/I). 32 divides 256, so every
   character is equally likely. The reference is what the customer quotes, and later the UPI note. */
const REF_ABC = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function newRef() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return "TAS-" + [...a].map((b) => REF_ABC[b % 32]).join("");
}
export function cleanRef(v) {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return /^TAS-[2-9A-HJ-NP-Z]{6}$/.test(s) ? s : null;
}

/* ---------------------------------------------------------------- what customers type */
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function cleanText(v, max) {
  if (typeof v !== "string") return "";
  return v.replace(/\r\n?/g, "\n").replace(CTRL, "").trim().slice(0, max);
}

export function cleanBrief(v, required) {
  const s = cleanText(v, BRIEF_MAX + 1);
  if (s.length > BRIEF_MAX) throw new HttpError(400, "brief_long", "The brief is too long.");
  if (required && s.length < BRIEF_MIN) throw new HttpError(400, "brief_short", "Tell me a little more.");
  return s;
}

/* Optional WhatsApp number: 7 to 15 digits, with + spaces dashes dots or brackets around them. */
export function cleanPhone(v) {
  const s = cleanText(v, 40);
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (!/^\+?[0-9 ()\-.]+$/.test(s) || digits.length < 7 || digits.length > 15) throw new HttpError(400, "bad_phone", "That number does not look right.");
  return s;
}

/* ---------------------------------------------------------------- limits */
export async function checkOrderLimits(env, userId) {
  const t = now();
  const r = (await env.DB.prepare(
    "SELECT SUM(created_at > ?) AS hour, SUM(created_at > ?) AS day, SUM(status = 'requested') AS open FROM orders WHERE user_id = ?"
  ).bind(t - 3600, t - 86400, userId).first()) || {};
  if ((r.hour || 0) >= ORDER_LIMITS.perHour || (r.day || 0) >= ORDER_LIMITS.perDay) throw new HttpError(429, "rate_limited", "Too many orders.");
  if ((r.open || 0) >= ORDER_LIMITS.openRequests) throw new HttpError(429, "too_many_open", "Too many open requests.");
}

/* ---------------------------------------------------------------- names */
export function itemName(id, tier) {
  const it = CATALOG.items[id];
  if (!it) return id;
  const t = tier && it.tiers ? it.tiers.find((x) => x.id === tier) : null;
  return t ? `${it.name} — ${t.name}` : it.name;
}

export function timingName(id) {
  const t = CATALOG.timing.find((x) => x.id === id);
  return t ? t.name : null;
}

/* The order's English title, kept in the database for the admin page, the CSV and emails. */
export function serviceTitle(id, tier, units) {
  const len = lengthOf(id, units);
  return itemName(id, tier) + (len ? ` · ${len}` : CATALOG.items[id] && CATALOG.items[id].unit && units === 0 ? " · longer" : "");
}

/* The services row an order points at. Written (or refreshed) with each order, so the database
   always holds the name and base price that the order was placed under. */
export function serviceUpsert(env, id, t) {
  const it = CATALOG.items[id];
  return env.DB.prepare(
    `INSERT INTO services (id, title, summary, price_minor, currency, active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET title = excluded.title, summary = excluded.summary, price_minor = excluded.price_minor, sort_order = excluded.sort_order, updated_at = excluded.updated_at`
  ).bind(id, it.name, it.g, (it.min || 0) * 100, CATALOG.currency, CATALOG.order.indexOf(id), t, t);
}

/* ---------------------------------------------------------------- the order's own details */
export function readInfo(order) {
  try { const v = JSON.parse(order.form_json || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; }
}

/* Only the fields a page needs, so nothing unexpected from the stored JSON ever reaches a page. */
const INFO_KEYS = ["source", "service", "tier", "units", "timing", "instant", "free", "est", "phone", "services", "likes", "budget", "name", "contact"];
export function pageInfo(order) {
  const i = readInfo(order), out = {};
  for (const k of INFO_KEYS) if (i[k] !== undefined && i[k] !== null && i[k] !== "") out[k] = i[k];
  return out;
}

/* ---------------------------------------------------------------- parts */
export async function liveParts(env, orderId) {
  return (await env.DB.prepare(
    "SELECT seq, amount_minor, currency, status, due_at, paid_at FROM order_parts WHERE order_id = ? AND status <> 'void' ORDER BY seq"
  ).bind(orderId).all()).results;
}

/* Statements that replace the unpaid parts of an order with new amounts (rupees). The first new part
   is due at once, the rest wait until the owner asks for them. Run them in one batch. */
export function partStatements(env, order, rupees, t) {
  const out = [env.DB.prepare("UPDATE order_parts SET status = 'void', updated_at = ? WHERE order_id = ? AND status IN ('locked', 'due')").bind(t, order.id)];
  rupees.forEach((r, i) => {
    out.push(env.DB.prepare(
      "INSERT INTO order_parts (id, order_id, seq, amount_minor, currency, status, created_at, updated_at, due_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), order.id, i + 1, r * 100, order.currency || "INR", i === 0 ? "due" : "locked", t, t, i === 0 ? t : null));
  });
  return out;
}

/* Payments that are waiting for a check or already confirmed. While any exist, the price cannot change
   and the customer cannot cancel. (Nothing creates payments until the UPI step.) */
export async function livePaymentCount(env, orderId) {
  return (await env.DB.prepare("SELECT COUNT(*) AS n FROM payments WHERE order_id = ? AND status IN ('submitted', 'confirmed')").bind(orderId).first("n")) || 0;
}

export function canCustomerCancel(order, parts, livePayments) {
  return ["requested", "pending"].includes(order.status) && !livePayments && !parts.some((p) => p.status === "paid");
}

/* ---------------------------------------------------------------- audit */
export function auditStatement(env, { actor, userId, action, orderId, data, ipHash = null, t }) {
  return env.DB.prepare(
    "INSERT INTO audit_log (actor_type, actor_user_id, action, entity_type, entity_id, data_json, ip_hash, created_at) VALUES (?, ?, ?, 'order', ?, ?, ?, ?)"
  ).bind(actor, userId, action, orderId, data ? JSON.stringify(data) : null, ipHash, t);
}

/* What happened to an email about an order, kept in the order's history so the owner can see it.
   r is { ok, status, error } from the mail helpers. */
export async function logEmail(env, orderId, to, kind, r) {
  try {
    await auditStatement(env, { actor: "system", userId: null, action: "order.email", orderId, t: now(),
      data: { to, kind, ok: !!(r && r.ok), status: r ? r.status : 0, error: r && !r.ok ? r.error : null } }).run();
  } catch (e) { console.error("could not log an email", e && e.message); }
}

/* ---------------------------------------------------------------- money words for emails */
export function rupees(minor) {
  return "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);
}

export function estimateText(est) {
  if (!est) return "price after talking";
  const f = (r) => rupees(r * 100);
  if (est.from) return "from " + f(est.min);
  return est.max !== null && est.max !== undefined && est.max !== est.min ? `${f(est.min)}–${f(est.max)}` : f(est.min);
}

/* The address of the site that served this request: the preview or the live domain. Links in emails use it. */
export const siteOrigin = (request) => new URL(request.url).origin;
