/* GET /api/admin/deletions?q=...&format=csv — requests to delete data, open ones first. Owner only.
   "waiting" is the number still to do: the tab shows it instead of the total. */
import { requireAdmin } from "../../_lib/auth.js";
import { json } from "../../_lib/http.js";
import { PAGE, CSV_MAX, likeTerm, wantsCsv, csvResponse, logExport } from "../../_lib/admin.js";

const COLUMNS = [["Name", "name"], ["Email", "email"], ["Status", "status"], ["Requested", "created_at", "time"], ["Closed", "closed_at", "time"], ["Open orders", "open_orders"]];

export async function onRequestGet({ request, env }) {
  const session = await requireAdmin(request, env);
  const url = new URL(request.url), term = likeTerm(url), csv = wantsCsv(url);
  const where = term ? "WHERE u.email LIKE ?1 ESCAPE '\\' OR u.name LIKE ?1 ESCAPE '\\' OR d.status LIKE ?1 ESCAPE '\\'" : "";
  const from = "FROM deletion_requests d JOIN users u ON u.id = d.user_id";
  const sql = `SELECT d.id, d.status, d.created_at, d.closed_at, u.name, u.email,
                      (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.status IN ('requested', 'pending', 'paid', 'in_progress')) AS open_orders
                 ${from} ${where} ORDER BY (d.status = 'requested') DESC, d.created_at DESC LIMIT ${csv ? CSV_MAX : PAGE}`;
  const rows = (await (term ? env.DB.prepare(sql).bind(term) : env.DB.prepare(sql)).all()).results;
  if (csv) { await logExport(env, session, "deletions", rows.length); return csvResponse("deletions", COLUMNS, rows); }
  const total = await (term ? env.DB.prepare(`SELECT COUNT(*) AS n ${from} ${where}`).bind(term) : env.DB.prepare("SELECT COUNT(*) AS n FROM deletion_requests")).first("n");
  const waiting = await env.DB.prepare("SELECT COUNT(*) AS n FROM deletion_requests WHERE status = 'requested'").first("n");
  return json({ ok: true, rows, total, shown: rows.length, waiting });
}
