/* GET /api/admin/payments?q=...&format=csv — every payment attempt with its order and customer. Owner only. */
import { requireAdmin } from "../../_lib/auth.js";
import { PAGE, CSV_MAX, likeTerm, wantsCsv, csvResponse, logExport, listResponse } from "../../_lib/admin.js";

const COLUMNS = [["Order", "ref"], ["Provider", "provider"], ["Reference", "reference"], ["Status", "status"], ["Amount", "amount_minor", "money"], ["Currency", "currency"], ["Customer", "name"], ["Email", "email"], ["Note", "note"], ["Created", "created_at", "time"], ["Confirmed", "confirmed_at", "time"]];

export async function onRequestGet({ request, env }) {
  const session = await requireAdmin(request, env);
  const url = new URL(request.url), term = likeTerm(url), csv = wantsCsv(url);
  const where = term ? "WHERE p.reference LIKE ?1 ESCAPE '\\' OR p.status LIKE ?1 ESCAPE '\\' OR o.ref LIKE ?1 ESCAPE '\\' OR u.email LIKE ?1 ESCAPE '\\' OR u.name LIKE ?1 ESCAPE '\\'" : "";
  const from = "FROM payments p JOIN orders o ON o.id = p.order_id JOIN users u ON u.id = p.user_id";
  const sql = `SELECT o.ref, p.provider, p.reference, p.status, p.amount_minor, p.currency, u.name, u.email, p.note, p.created_at, p.confirmed_at ${from} ${where} ORDER BY p.created_at DESC LIMIT ${csv ? CSV_MAX : PAGE}`;
  const rows = (await (term ? env.DB.prepare(sql).bind(term) : env.DB.prepare(sql)).all()).results;
  if (csv) { await logExport(env, session, "payments", rows.length); return csvResponse("payments", COLUMNS, rows); }
  const total = await (term ? env.DB.prepare(`SELECT COUNT(*) AS n ${from} ${where}`).bind(term) : env.DB.prepare("SELECT COUNT(*) AS n FROM payments")).first("n");
  return listResponse(rows, total);
}
