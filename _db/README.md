# Backend notes — THE AAMIR SHEIKH

The backend runs on Cloudflare, next to the static site: Pages Functions for the API and a D1 database for the data. This file is the map. It holds no secrets; secrets live only in Cloudflare.

Built so far: the foundation (step 1), sign-in with the account page (step 2), the owner-only admin page (step 3), services with orders (step 4) and UPI payments (step 5).

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
| `functions/api/account/order.js` | `GET /api/account/order?ref=` — one of their orders, with how to pay what is due. `POST` with `action: "cancel"` cancels it while nothing is paid; `action: "paid"` sends the 12-digit UPI reference. |
| `functions/api/orders.js` | `POST /api/orders` — place an order, from the Services page (one service) or from the order form (`source: "form"`). |
| `functions/api/admin/order.js` | `GET /api/admin/order?ref=` — one order for the owner. `POST` actions: `price` (one part or several), `next_part`, `resend`, `status`, `note`, and for payments `confirm` (Mark paid), `reject`, `mark_paid` (paid some other way). |
| `functions/_lib/payments.js` | UPI settings, the UPI payment link, the 12-digit reference check, and `settleStatements()`, which marks a part paid and moves the order on. |
| `assets/js/qr.js` | The QR code maker for the pay box, written for this site (no library). |
| `functions/_lib/catalog.js` | The price list and pricing rules the server charges. **Generated** by `_build/build.py` from `_build/catalog.py` and `_build/pricing_core.js` — do not edit it by hand. |
| `functions/_lib/orders.js`, `ordermail.js` | Order rules (references, limits, parts) and the customer emails in nine languages. |
| `functions/_lib/` | Shared helpers. Not routes. `auth.js` holds accounts, sessions, the sign-in history and the rate limits. |
| `functions/api/admin/` | `users.js`, `orders.js`, `payments.js` — owner-only lists. `?q=` searches, `?format=csv` downloads a CSV. `order.js` — one order, and the owner's changes to it. |
| `functions/_lib/admin.js` | Search, paging (200 rows on screen, 5000 per CSV) and safe CSV writing for the admin routes. |
| `admin.html` | The admin page (built by `_build/build.py`; its script is the "admin page" part of `assets/js/main.js`). |
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
| `order_parts` | What is paid for an order: one part, or an advance, milestones and a final part. `locked` → `due` → `paid` (or `void` when replaced). |
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

Check: open `/api/health`. A healthy answer has `"ok": true`, `"db": "ok"`, `"tables": 8`, the right `"database"` label, and `"schema"` equal to `"schema_needed"` (3 since step 4). The `"signin"` part says yes or no for each sign-in setting, so a missing one is easy to spot.

## How sign-in works

- **Google.** The visitor is sent to Google and comes back with a one-time code. The server swaps it for an ID token, checks the token's signature against Google's public keys, and checks who it was issued for, that it has not expired, and that the email is verified.
- **Email code.** After the Turnstile check passes, the server emails a 6-digit code. It works for 10 minutes, once, and is retired after 5 wrong tries. Limits: one code a minute, 3 per 15 minutes and 8 a day per address; 10 an hour per connection.
- **Session.** A random token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie, good for 30 days. The database keeps only a hash of it. A second cookie, `tas_in=1`, holds nothing private; it only lets pages label the header button "Account" without asking the server.
- **One account per email address.** Someone who first used an email code and later uses Google with the same address lands in the same account.
- Nothing is stored about a visitor's IP address except a keyed hash, used for the rate limits.

## The admin page

- Only the address in `ADMIN_EMAIL` gets in, and only after signing in with it (Google or email code). The setting lives in Cloudflare, not in the database, so no database row can make someone an admin. Everyone else gets "only for the site owner"; the server refuses them too, not just the page.
- Shows users (name, email, how they signed in, status, order count, sign-up time, last login), orders and payments. There are no passwords to show; none exist.
- Clicking an order number opens the order in a side panel: details, customer, brief, price and parts, status buttons, a private note and the history. A link in an order email opens it directly (`/admin.html?order=TAS-XXXXXX`).
- Search covers email, name, order number, title, status and UPI reference. The CSV follows the search. A cell that a spreadsheet could run as a formula is prefixed with an apostrophe. Every export is written to `audit_log`.
- On each new sign-up the owner gets an email at `NOTIFY_EMAIL` (default `ak4418561@gmail.com`). If that email fails, the visitor still signs in. Every new order is emailed too (step 4). The WhatsApp and Gmail order form is unchanged.

## Services, prices and orders (step 4)

- **The price list lives in one file: `_build/catalog.py`.** The build turns it into the Services page, the chips on the order form, `assets/js/catalog.js` (the live price in the order panel) and `functions/_lib/catalog.js` (what the server charges). To change a price: edit `catalog.py`, run `python3 _build/build.py`, push. No database step is needed.
- The `services` table keeps a copy of each service's name and base price, written with every order, so an old order always shows what it was placed under.
- **Instant orders:** a single-price service with ASAP (×2) or 2–4 weeks (−5%). The server works the price out from its own catalog (never from the browser), the order starts as `pending` with one part `due`, and the customer gets a pay email.
- **Requests:** ranges, "from" prices, "price after talking", 1 week, Flexible, and anything sent with "Send to my account" on the order form. They start as `requested`. The owner sets the price in the admin page: one part, 50/50, 30/40/30 or parts of at most ₹1 lakh (UPI apps usually stop around ₹1 lakh a day). The first part becomes `due` and the customer gets the pay link; later parts are asked for with "Ask for the next part".
- **First thumbnail free:** the first thumbnail order on an account arrives priced at ₹0. The owner accepts it with "Accept for free" (status `in_progress`).
- Length-based services (YouTube video per minute, motion tracking per 10 seconds, explainer per 3 minutes, and the ranges per 10 seconds) multiply by the length the customer picks, up to 10 units. "Longer" becomes a request.
- **Customer cancel:** possible while the order is `requested` or `pending` and nothing has been paid or submitted. The owner gets an email.
- **Limits per account:** 6 orders an hour, 20 a day, 10 open requests at once.
- **Emails:** the customer gets "request received" or "ready to pay" in their language; the owner gets every new order (with a link that opens it in the admin page) and every customer cancel. The WhatsApp and Gmail buttons on the order form work exactly as before.
- Every change is written to `audit_log` (`order.created`, `order.priced`, `order.part_opened`, `order.status`, `order.note`, `order.cancelled`).
- The pay link opens the order on the account page (`/account.html?order=TAS-XXXXXX`), where the customer pays (step 5).

## UPI payments (step 5)

- **Where the money goes:** the Cloudflare settings `UPI_ID` (main), `UPI_ID_BACKUP` (others, comma-separated) and `UPI_PAYEE_NAME`. They are not in this repo. Until `UPI_ID` and `UPI_PAYEE_NAME` are set, the pay box says UPI payment is not switched on yet. `/api/health` shows `"payments": { "upi": true }` once they are.
- **Paying:** on a phone the pay box has a "Pay with a UPI app" button (the standard `upi://pay` link, with the amount, the payee name and the order number as the note) and direct links for Google Pay, PhonePe and Paytm. On a computer it shows a QR code of the same link. The UPI ID can be copied, and "If the payment fails" lists all the UPI IDs for paying by hand. Personal UPI IDs are sometimes blocked by apps when opened from a website; the QR code and paying by hand still work. A business UPI ID avoids that: put it in `UPI_ID`.
- **After paying:** the customer types the 12-digit UPI reference (UTR) from their receipt. It is stored as a `payments` row with status `submitted` and the order shows "Waiting for check". You get an email. One reference can wait per part; a reference that is waiting or confirmed cannot be used again; 5 tries per order a day.
- **Mark paid:** when the money is in your bank, open the order in Admin and press Mark paid. The part becomes `paid`, the customer gets a receipt in their language, and the order moves to `paid` (all parts paid) or `in_progress` (an advance paid; ask for the next part when the milestone is reached).
- **Reject:** the payment becomes `rejected`, the part can be paid again, and the customer gets an email asking them to check the reference.
- **Paid some other way** (cash, bank transfer, a reference the customer forgot to send): "Mark this part paid", with an optional UPI reference. It is stored with provider `manual` when there is no reference.
- **Razorpay later:** a gateway payment is another `payments` row (`provider = 'razorpay'`, `provider_order_id` from Razorpay). Its signed webhook would call the same `settleStatements()` that Mark paid uses, so no table and no page changes.

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
| `ADMIN_EMAIL` | text | step 3 | The one address allowed into the admin page: the address you sign in with. |
| `NOTIFY_EMAIL` | text | step 3 | Optional. Where sign-up and order notices go. Leave it out to use `ak4418561@gmail.com`. |
| `MAIL_FROM` | text | step 2 | The sender, for example `THE AAMIR SHEIKH <login@theaamirsheikh.com>`. The domain must be verified at the email service. |
| `ADMIN_EMAIL` | variable | step 3 | The one address allowed into the admin page. |
| `UPI_ID` | text | step 5 | The main UPI ID, used by the pay button and the QR code. |
| `UPI_ID_BACKUP` | text | step 5 | Optional. Other UPI IDs for the same account, comma-separated, shown under "If the payment fails". |
| `UPI_PAYEE_NAME` | text | step 5 | The name shown in the UPI app. |

Step 4 needed no new settings. The UPI settings are text, not secrets (every payer sees them), but they live in Cloudflare so the public repo does not carry them.

Google sign-in switches on when `SESSION_SECRET` and both Google values are present. Email-code sign-in switches on when `SESSION_SECRET`, both Turnstile values, `EMAIL_API_KEY` and `MAIL_FROM` are present. Until then the account page says sign-in is not switched on yet, and the rest of the site is unaffected.

The address Google must be told to send people back to is `https://<site>/api/auth/google/callback`, once for each site address in use (the preview and the live domain).

## Room for later (not built)

Planned API areas: `/api/auth`, `/api/account`, `/api/orders`, `/api/payments`, `/api/admin`. Reserved for after Sundown Trail: `/api/game` (cloud saves, leaderboards, player stats), `/api/feedback` (moderated wall), `/api/ai` (assistant).

Each of those is new tables that point at `users.id`, added by a new migration file. None of the tables above has to change: `sessions.client` already tells the game from the website, and `audit_log` already records moderation. Save files would go in R2, and the assistant would use Workers AI with Vectorize; both are extra bindings beside `DB`.

The shop (merch and products) and the free 3D assets fit the same way: a `products` table and an `order_items` table (one row per thing bought) beside `orders`, using the same accounts, `orders` (kind `fixed`, no `service_id`), `order_parts` and `payments`. Free downloads need no order at all, only a `downloads` table if counting them is wanted.
