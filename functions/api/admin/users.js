/* GET /api/admin/users?q=...&format=csv — every account. Owner only. There are no passwords to show: none exist. */
import { requireAdmin } from "../../_lib/auth.js";
import { PAGE, CSV_MAX, likeTerm, wantsCsv, csvResponse, logExport, listResponse } from "../../_lib/admin.js";

const COLUMNS = [["Name", "name"], ["Email", "email"], ["Signed up with", "signup_method"], ["Google linked", "google"], ["Status", "status"], ["Language", "lang"], ["Signed up", "created_at", "time"], ["Last login", "last_login_at", "time"], ["Orders", "orders"]];

export async function onRequestGet({ request, env }) {
  const session = await requireAdmin(request, env);
  const url = new URL(request.url), term = likeTerm(url), csv = wantsCsv(url);
  const where = term ? "WHERE u.email LIKE ?1 ESCAPE '\\' OR u.name LIKE ?1 ESCAPE '\\'" : "";
  const sql = `SELECT u.name, u.email, u.signup_method, CASE WHEN u.google_sub IS NULL THEN 'no' ELSE 'yes' END AS google, u.status, u.lang, u.created_at, u.last_login_at,
                      (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders
                 FROM users u ${where} ORDER BY u.created_at DESC LIMIT ${csv ? CSV_MAX : PAGE}`;
  const rows = (await (term ? env.DB.prepare(sql).bind(term) : env.DB.prepare(sql)).all()).results;
  if (csv) { await logExport(env, session, "users", rows.length); return csvResponse("users", COLUMNS, rows); }
  const total = await (term ? env.DB.prepare(`SELECT COUNT(*) AS n FROM users u ${where}`).bind(term) : env.DB.prepare("SELECT COUNT(*) AS n FROM users")).first("n");
  return listResponse(rows, total);
}
