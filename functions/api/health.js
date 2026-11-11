/* GET /api/health — is the backend alive, is the database wired up, and which sign-in settings are in place?
   Reports only harmless facts: yes/no answers, the schema version and which database this is. */
import { json } from "../_lib/http.js";
import { config } from "../_lib/auth.js";

const TABLES = ["users", "sessions", "login_events", "services", "orders", "payments", "audit_log", "order_parts"];
const SCHEMA_NEEDED = 3;

export async function onRequestGet({ env }) {
  const c = config(env);
  const out = {
    ok: false, service: "tas-api", db: "missing", database: null, schema: null, schema_needed: SCHEMA_NEEDED, tables: 0,
    signin: { session_secret: c.secret, google: c.google, turnstile: c.turnstile, email_service: c.mail, email_code: c.email, admin_email: !!(env.ADMIN_EMAIL && String(env.ADMIN_EMAIL).trim()) },
    time: new Date().toISOString(),
  };

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
    if (!(out.schema >= SCHEMA_NEEDED)) {
      out.db = "old_schema";
      out.hint = "The database needs an update. Run _private\\migrate-backend.bat.";
      return json(out, 503);
    }
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
