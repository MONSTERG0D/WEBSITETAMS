# Backend notes — THE AAMIR SHEIKH

The backend runs on Cloudflare, next to the static site: Pages Functions for the API and a D1 database for the data. This file is the map. It holds no secrets; secrets live only in Cloudflare.

Built so far: the foundation (step 1) and sign-in with the account page (step 2). The admin page, orders and UPI payments come in later steps.

## Where things are

| Path | What it is |
| --- | --- |
| `functions/api/` | The API. Every file is a route under `/api/`. |
| `functions/api/_middleware.js` | Runs first on every API request: refuses writes from other websites, turns crashes into JSON errors, stops caching. |
| `functions/api/health.js` | `GET /api/health` — is the backend up and is the database connected. |
| `functions/api/[[path]].js` | JSON "not found" for any other `/api/...` address. |
| `functions/api/auth/me.js` | `GET /api/auth/me` — who is signed in, and which sign-in methods are switched on. |
| `functions/api/auth/google/` | `start.js` sends the visitor to Google; `callback.js` checks what Google sends back and signs them in. |
| `functions/api/auth/email/` | `start.js` emails a 6-digit code; `verify.js` checks it and signs them in. |
| `functions/api/auth/logout.js` | `POST /api/auth/logout` — ends the session. |
| `functions/api/account/orders.js` | `GET /api/account/orders` — the signed-in person's own orders. |
| `functions/_lib/` | Shared helpers. Not routes. `auth.js` holds accounts, sessions, the sign-in history and the rate limits. |
| `account.html` | The account page (built by `_build/build.py`; its script is the "account + sign-in" part of `assets/js/main.js`). |
| `_db/migrations/` | The database schema, one numbered file per change. |
| `_db/setup/` | Two one-line files that label each database as live or preview. |

The rest of the site is untouched: only addresses under `/api/` reach the Functions.

## Databases

| Database | Used by | Label in `/api/health` |
| --- | --- | --- |
| `tas-db` | theaamirsheikh.com (Production) | `production` |
| `tas-db-preview` | the v3-preview site and every other preview | `preview` |

Both are connected to the Pages project `websitetams` under the variable name `DB` (Settings → Bindings, once for Production and once for Preview). Anything tested on the preview — sign-ups, orders, payments — stays out of the live database.

## Tables

| Table | Holds |
| --- | --- |
| `users` | One row per person: email, name, how they signed up. No passwords. |
| `sessions` | Signed-in browsers (later also the game). Only a hash of the session token. |
| `login_events` | History of sign-in activity; rate limits are counted from it. IP addresses are stored only as a keyed hash. |
| `services` | The fixed-price list. Prices are read from here, never from the browser. |
| `orders` | Fixed-price and custom orders, tied to a user. |
| `payments` | One row per payment attempt. `provider` is `upi` now; a gateway such as Razorpay fits later without changing the table. |
| `audit_log` | Who did what: price set, payment confirmed, account deleted. |
| `login_codes` | The 6-digit email codes, stored only as a keyed hash. 10 minutes, one use, 5 tries. |
| `schema_migrations`, `app_meta` | Bookkeeping: which schema files ran, and which database this is. |

Money is stored as whole numbers in the smallest unit (paise) with a currency code. Times are Unix seconds, UTC.

A deleted account keeps its row so that orders and payments stay consistent, but its personal details are wiped.

## First-time setup

Needs Node.js 20 or newer. Run `_private\setup-backend.bat`, or type the same commands in a terminal opened in the repo folder:

```
npx wrangler@latest login
npx wrangler@latest d1 create tas-db --location apac
npx wrangler@latest d1 create tas-db-preview --location apac
npx wrangler@latest d1 execute tas-db --remote --yes --file _db/migrations/0001_init.sql
npx wrangler@latest d1 execute tas-db --remote --yes --file _db/setup/label-production.sql
npx wrangler@latest d1 execute tas-db-preview --remote --yes --file _db/migrations/0001_init.sql
npx wrangler@latest d1 execute tas-db-preview --remote --yes --file _db/setup/label-preview.sql
```

Then, in the Cloudflare dashboard: Workers & Pages → `websitetams` → Settings → Bindings → Add → D1 database. Variable name `DB`. Choose `tas-db` for the Production environment and `tas-db-preview` for the Preview environment. A binding takes effect on the next deployment.

Check: open `/api/health`. A healthy answer has `"ok": true`, `"db": "ok"`, `"tables": 7`, the right `"database"` label, and `"schema"` equal to `"schema_needed"`. The `"signin"` part says yes or no for each sign-in setting, so a missing one is easy to spot.

## How sign-in works

- **Google.** The visitor is sent to Google and comes back with a one-time code. The server swaps it for an ID token, checks the token's signature against Google's public keys, and checks who it was issued for, that it has not expired, and that the email is verified.
- **Email code.** After the Turnstile check passes, the server emails a 6-digit code. It works for 10 minutes, once, and is retired after 5 wrong tries. Limits: one code a minute, 3 per 15 minutes and 8 a day per address; 10 an hour per connection.
- **Session.** A random token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie, good for 30 days. The database keeps only a hash of it. A second cookie, `tas_in=1`, holds nothing private; it only lets pages label the header button "Account" without asking the server.
- **One account per email address.** Someone who first used an email code and later uses Google with the same address lands in the same account.
- Nothing is stored about a visitor's IP address except a keyed hash, used for the rate limits.

## Changing the schema later

1. Add `_db/migrations/000N_name.sql`. It must be safe to run twice (`IF NOT EXISTS`) and end with `INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (N, 'name');`.
2. Run it on both databases (`_private\migrate-backend.bat` runs every file in `_db/migrations/` on both, in order). A new table that nothing uses yet is harmless on the live database.
3. Push the preview and test. `/api/health` says `"db": "old_schema"` if a database was missed.

Keep comments in these files free of semicolons, and do not use `BEGIN`/`COMMIT`.

## Secrets and variables

Entered by hand in Cloudflare (Settings → Variables and Secrets), for Production and Preview. Never typed into chat, never committed.

| Name | Kind | Needed from | Purpose |
| --- | --- | --- | --- |
| `DB` | D1 binding | step 1 | The database. Not a secret. |
| `SESSION_SECRET` | secret | step 2 | Long random string (32 characters or more) used to hash one-time codes and IP addresses and to sign the Google round trip. |
| `GOOGLE_CLIENT_ID` | text | step 2 | Google sign-in: the client ID. |
| `GOOGLE_CLIENT_SECRET` | secret | step 2 | Google sign-in: the client secret. |
| `TURNSTILE_SITE_KEY` | text | step 2 | Bot check on the email-code form: the public key. |
| `TURNSTILE_SECRET_KEY` | secret | step 2 | Bot check: the private key. |
| `EMAIL_API_KEY` | secret | step 2 | API key of the email service (Resend) that sends codes and notices. |
| `MAIL_FROM` | text | step 2 | The sender, for example `THE AAMIR SHEIKH <login@theaamirsheikh.com>`. The domain must be verified at the email service. |
| `ADMIN_EMAIL` | variable | step 3 | The one address allowed into the admin page. |
| `UPI_ID`, `UPI_PAYEE_NAME` | variable | step 5 | Where UPI payments go. |

Names for steps 3 to 5 are the plan; each step confirms its own.

Google sign-in switches on when `SESSION_SECRET` and both Google values are present. Email-code sign-in switches on when `SESSION_SECRET`, both Turnstile values, `EMAIL_API_KEY` and `MAIL_FROM` are present. Until then the account page says sign-in is not switched on yet, and the rest of the site is unaffected.

The address Google must be told to send people back to is `https://<site>/api/auth/google/callback`, once for each site address in use (the preview and the live domain).

## Room for later (not built)

Planned API areas: `/api/auth`, `/api/account`, `/api/orders`, `/api/payments`, `/api/admin`. Reserved for after Sundown Trail: `/api/game` (cloud saves, leaderboards, player stats), `/api/feedback` (moderated wall), `/api/ai` (assistant).

Each of those is new tables that point at `users.id`, added by a new migration file. None of the seven tables above has to change: `sessions.client` already tells the game from the website, and `audit_log` already records moderation. Save files would go in R2, and the assistant would use Workers AI with Vectorize; both are extra bindings beside `DB`.
