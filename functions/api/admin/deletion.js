/* POST /api/admin/deletion  { id } — delete a person's data, as they asked. Owner only.

   What goes: name, email (replaced by a meaningless placeholder), Google account id, language, every
   session, the sign-in history, email codes, and from their orders the brief, WhatsApp number, the
   name and contact typed on the order form, and the owner's private note. Unpaid orders are cancelled.
   What stays, for the owner's accounts: the users row (status 'deleted'), order numbers, services,
   amounts, dates and UPI references, so past payments still add up.

   It waits while a payment from this person is being checked, or while one of their orders is paid or
   being made: those need finishing first. The person gets a confirmation email just before the wipe. */
import { HttpError, json, readJson } from "../../_lib/http.js";
import { requireAdmin, requestMeta, now, isAdmin } from "../../_lib/auth.js";
import { siteOrigin } from "../../_lib/orders.js";
import { deletedMail, mailCustomer, safeMail } from "../../_lib/ordermail.js";

export async function onRequestPost({ request, env }) {
  const session = await requireAdmin(request, env);
  const body = await readJson(request);
  const req = await env.DB.prepare("SELECT * FROM deletion_requests WHERE id = ?").bind(String(body.id || "")).first();
  if (!req) throw new HttpError(404, "not_found", "No such request.");
  if (req.status !== "requested") throw new HttpError(409, "not_open", "This request is already closed.");
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(req.user_id).first();
  if (!user) throw new HttpError(404, "not_found", "No such account.");
  if (isAdmin(user, env)) throw new HttpError(409, "owner_account", "The owner's own account cannot be deleted here.");

  const waiting = await env.DB.prepare("SELECT COUNT(*) AS n FROM payments WHERE user_id = ? AND status = 'submitted'").bind(user.id).first("n");
  if (waiting) throw new HttpError(409, "payment_waiting", "A payment from this person is waiting for a check.");
  const busy = await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status IN ('paid', 'in_progress')").bind(user.id).first("n");
  if (busy) throw new HttpError(409, "orders_open", "This person has orders that are paid or being made.");

  const orders = await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE user_id = ?").bind(user.id).first("n");
  const origin = siteOrigin(request);
  const mail = safeMail(() => deletedMail(user.lang || "en", { origin, hadOrders: orders > 0 }));
  const email = user.status === "deleted" ? { ok: false, error: "already deleted" } : await mailCustomer(env, user.email, mail);

  const t = now(), meta = await requestMeta(request, env);
  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status = 'cancelled', closed_at = ?, updated_at = ? WHERE user_id = ? AND status IN ('requested', 'pending')").bind(t, t, user.id),
    env.DB.prepare("UPDATE order_parts SET status = 'void', updated_at = ? WHERE status IN ('locked', 'due') AND order_id IN (SELECT id FROM orders WHERE user_id = ?)").bind(t, user.id),
    env.DB.prepare("UPDATE orders SET brief = NULL, admin_note = NULL, form_json = json_remove(COALESCE(form_json, '{}'), '$.phone', '$.name', '$.contact'), updated_at = ? WHERE user_id = ?").bind(t, user.id),
    env.DB.prepare("UPDATE payments SET note = NULL, updated_at = ? WHERE user_id = ?").bind(t, user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM login_events WHERE user_id = ? OR email = ?").bind(user.id, user.email),
    env.DB.prepare("DELETE FROM login_codes WHERE email = ?").bind(user.email),
    env.DB.prepare("UPDATE audit_log SET ip_hash = NULL WHERE actor_user_id = ?").bind(user.id),
    env.DB.prepare(
      "UPDATE users SET email = ?, email_verified = 0, name = NULL, google_sub = NULL, lang = NULL, status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?"
    ).bind(`deleted-${user.id}@deleted.invalid`, t, t, user.id),
    env.DB.prepare("UPDATE deletion_requests SET status = 'done', closed_at = ?, closed_by = ? WHERE id = ?").bind(t, session.user.id, req.id),
    env.DB.prepare("INSERT INTO audit_log (actor_type, actor_user_id, action, entity_type, entity_id, data_json, ip_hash, created_at) VALUES ('admin', ?, 'account.deleted', 'user', ?, ?, ?, ?)")
      .bind(session.user.id, user.id, JSON.stringify({ orders_kept: orders, emailed: !!email.ok }), meta.ipHash, t),
  ]);
  return json({ ok: true, email: { ok: !!email.ok, error: email.ok ? null : email.error || null } });
}
