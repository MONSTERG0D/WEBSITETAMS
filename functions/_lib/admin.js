/* Helpers for the owner-only admin routes: search, paging and CSV export. */
import { json } from "./http.js";
import { now } from "./auth.js";

export const PAGE = 200;      // rows shown on the page
export const CSV_MAX = 5000;  // rows in one export

/* Turns what the owner typed into a safe LIKE pattern (their % and _ are treated as plain characters). */
export function likeTerm(url) {
  const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
  return q ? "%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%" : null;
}

export const wantsCsv = (url) => url.searchParams.get("format") === "csv";

/* One CSV cell. Quotes are doubled, and a cell that a spreadsheet could read as a formula gets a leading
   apostrophe, so nothing a customer typed can run when the file is opened in Excel or Sheets. */
function cell(v) {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const stamp = (t) => (t ? new Date(t * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "");
export const money = (minor) => (minor === null || minor === undefined ? "" : (minor / 100).toFixed(2));

export function csvResponse(name, columns, rows) {
  const lines = [columns.map((c) => cell(c[0])).join(",")];
  for (const r of rows) lines.push(columns.map((c) => cell(c[2] === "time" ? stamp(r[c[1]]) : c[2] === "money" ? money(r[c[1]]) : r[c[1]])).join(","));
  const day = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="tas-${name}-${day}.csv"` },
  });
}

/* Every export is written to the audit log: who, what, how many rows. */
export async function logExport(env, session, what, count) {
  await env.DB.prepare("INSERT INTO audit_log (actor_type, actor_user_id, action, entity_type, data_json, created_at) VALUES ('admin', ?, 'admin.export', ?, ?, ?)")
    .bind(session.user.id, what, JSON.stringify({ rows: count }), now()).run();
}

export const listResponse = (rows, total) => json({ ok: true, rows, total, shown: rows.length });
