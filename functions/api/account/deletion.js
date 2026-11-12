/* Asking for your data to be deleted (step 6). Signed-in only.
   GET  /api/account/deletion                       { request: { created_at } | null }
   POST /api/account/deletion  { action: "request" } ask the owner to delete my data (emails the owner)
   POST /api/account/deletion  { action: "cancel" }  changed my mind: keep my account
   The owner deletes from the admin page (the privacy page promises within 30 days). */
import { HttpError, json, readJson } from "../../_lib/http.js";
import { requireReady, getSession, requestMeta, now } from "../../_lib/auth.js";
import { siteOrigin } from "../../_lib/orders.js";
import { notifyOwnerResult } from "../../_lib/mail.js";

async function signedIn(request, env) {
  requireReady(env);
  const session = await getSession(request, env);
  if (!session) throw new HttpError(401, "signed_out", "Sign in first.");
  return session;
}

const openRequest = (env, userId) =>
  env.DB.prepare("SELECT id, created_at FROM deletion_requests WHERE user_id = ? AND status = 'requested'").bind(userId).first();

const audit = (env, userId, action, ipHash, t) =>
  env.DB.prepare("INSERT INTO audit_log (actor_type, actor_user_id, action, entity_type, entity_id, ip_hash, created_at) VALUES ('user', ?, ?, 'user', ?, ?, ?)")
    .bind(userId, action, userId, ipHash, t);

export async function onRequestGet({ request, env }) {
  const session = await signedIn(request, env);
  const r = await openRequest(env, session.user.id);
  return json({ ok: true, request: r ? { created_at: r.created_at } : null });
}

export async function onRequestPost({ request, env, waitUntil }) {
  const session = await signedIn(request, env);
  const body = await readJson(request);
  const user = session.user, t = now(), meta = await requestMeta(request, env);
  const open = await openRequest(env, user.id);

  if (body.action === "request") {
    if (open) throw new HttpError(409, "already_requested", "You already asked.");
    await env.DB.batch([
      env.DB.prepare("INSERT INTO deletion_requests (id, user_id, status, created_at) VALUES (?, ?, 'requested', ?)").bind(crypto.randomUUID(), user.id, t),
      audit(env, user.id, "account.deletion_requested", meta.ipHash, t),
    ]);
    const origin = siteOrigin(request);
    const notice = notifyOwnerResult(env, `Deletion request: ${user.email}`, [
      `${user.name || user.email} asked you to delete their data.`, "",
      "Email: " + user.email,
      "The privacy page promises it within 30 days. Open the Deletions tab in the admin page and press Delete data.",
    ], `${origin}/admin.html?tab=deletions`).catch(() => {});
    if (waitUntil) waitUntil(notice); else await notice;
    return json({ ok: true, request: { created_at: t } });
  }

  if (body.action === "cancel") {
    if (!open) throw new HttpError(409, "no_request", "There is no request to cancel.");
    await env.DB.batch([
      env.DB.prepare("UPDATE deletion_requests SET status = 'cancelled', closed_at = ? WHERE id = ? AND status = 'requested'").bind(t, open.id),
      audit(env, user.id, "account.deletion_cancelled", meta.ipHash, t),
    ]);
    return json({ ok: true, request: null });
  }

  throw new HttpError(400, "bad_request", "Unknown action.");
}
