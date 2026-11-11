/* GET /api/health — is the backend alive and is the database wired up?
   Reports only harmless facts: whether the database answers, which one it is
   (live or preview), the schema version and how many of the core tables exist. */
import { json } from "../_lib/http.js";

const TABLES = ["users", "sessions", "login_events", "services", "orders", "payments", "audit_log"];

export async function onRequestGet({ env }) {
  const out = { ok: false, service: "tas-api", db: "missing", database: null, schema: null, tables: 0, time: new Date().toISOString() };

  if (!env.DB) {
    out.hint = "No database is connected. Add a D1 binding named DB in the Pages project settings, then deploy again.";
    return json(out, 503);
  }

  try {
    const marks = TABLES.map(() => "?").join(", ");
    const found = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${marks})`).bind(...TABLES).all();
    out.tables = found.results.length;
    if (out.tables < TABLES.length) {
      out.db = "no_schema";
      out.hint = "The database is connected but its tables are missing. Run the setup script again.";
      return json(out, 503);
    }
    out.schema = await env.DB.prepare("SELECT MAX(version) AS v FROM schema_migrations").first("v");
    out.database = await env.DB.prepare("SELECT value FROM app_meta WHERE key = 'env'").first("value");
    out.db = "ok";
    out.ok = true;
    return json(out);
  } catch (err) {
    console.error("health check failed", err && err.stack ? err.stack : err);
    out.db = "error";
    out.hint = "The database did not answer. Check the D1 binding named DB.";
    return json(out, 503);
  }
}
