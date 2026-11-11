/* GET /api/admin/orders?q=...&format=csv — every order with its customer. Owner only. */
import { requireAdmin } from "../../_lib/auth.js";
import { PAGE, CSV_MAX, likeTerm, wantsCsv, csvResponse, logExport, listResponse } from "../../_lib/admin.js";

const COLUMNS = [["Order", "ref"], ["Title", "title"], ["Kind", "kind"], ["Status", "status"], ["Amount", "amount_minor", "money"], ["Currency", "currency"], ["Customer", "name"], ["Email", "email"], ["Brief", "brief"], ["Created", "created_at", "time"], ["Paid", "paid_at", "time"]];

export async function onRequestGet({ request, env }) {
  const session = await requireAdmin(request, env);
  const url = new URL(request.url), term = likeTerm(url), csv = wantsCsv(url);
  const where = term ? "WHERE o.ref LIKE ?1 ESCAPE '\\' OR o.title LIKE ?1 ESCAPE '\\' OR o.status LIKE ?1 ESCAPE '\\' OR u.email LIKE ?1 ESCAPE '\\' OR u.name LIKE ?1 ESCAPE '\\'" : "";
  const from = "FROM orders o JOIN users u ON u.id = o.user_id";
  const sql = `SELECT o.ref, o.title, o.kind, o.status, o.amount_minor, o.currency, u.name, u.email, o.brief, o.created_at, o.paid_at ${from} ${where} ORDER BY o.created_at DESC LIMIT ${csv ? CSV_MAX : PAGE}`;
  const rows = (await (term ? env.DB.prepare(sql).bind(term) : env.DB.prepare(sql)).all()).results;
  if (csv) { await logExport(env, session, "orders", rows.length); return csvResponse("orders", COLUMNS, rows); }
  const total = await (term ? env.DB.prepare(`SELECT COUNT(*) AS n ${from} ${where}`).bind(term) : env.DB.prepare("SELECT COUNT(*) AS n FROM orders")).first("n");
  return listResponse(rows, total);
}
