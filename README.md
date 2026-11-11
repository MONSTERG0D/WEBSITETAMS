# WEBSITETAMS — THE AAMIR SHEIKH

Personal website of THE AAMIR SHEIKH, live at https://theaamirsheikh.com (Cloudflare Pages, project `websitetams`).

- Plain HTML, CSS and JavaScript. No framework, no build step on the server.
- **All pages are generated** by `_build/build.py` → run `python3 _build/build.py` from the repo root after editing.
- Translations (9 languages: English, Deutsch, Français, 日本語, Español, Русский, العربية, 中文, 한국어) live in `_build/i18n.py`, `i18n_more.py`, `i18n_cjk.py` and `i18n_p0.py` (newest strings, one row per key) and are written to `assets/js/i18n.js`.
- Three interfaces, each with its own music: **Riot** (electric guitar), **Noir** (smooth jazz), **Village** (ambient village). Visitors can link or unlink music from the interface in Settings (S key).
- Accessibility panel: colour-vision modes, high contrast, brightness, text size, reduced motion, underline links, read-aloud.
- Order & feedback form (`order.html`) sends to WhatsApp (wa.me prefill) and Gmail (FormSubmit — confirm the activation email the first time).
- Video: short films are bit-exact copies of the originals (or CRF 16 when over 24 MB). **Money Follows (v1)** streams as HLS from `assets/media/money-follows/` — the 4K rung is the original file, untouched, cut into 2.5 s chunks (Cloudflare Pages caps files at 25 MB).
- Music: Pixabay (Pixabay Content License). Photos: Unsplash. Icons: Lucide (ISC). Characters in `assets/img/chars/` are original SVG illustrations.
- Raw sources stay on the computer in `_source_media/` (git-ignored).
- Navigation (v3.4): **Home · Work · About · Services · Contact**. About = Story, Struggles, Skills, Inspirations (sub-nav on those pages); Contact = `order.html`. `/about` and `/contact` redirect there.
- Intro: 3 seconds, then continues quietly; Skip is visible from the first frame. Sound (music and click sounds) is off until the visitor turns it on. The intro can be switched off in Settings.
- Lighthouse game: `404.html` and `play.html` (footer + menu link). The dark hides six works; the light follows the mouse, finger or arrow keys. Edit the six works in `LH_WORKS` in `_build/build.py`.
- Backend (accounts and payments, in progress): Cloudflare Pages Functions in `functions/api/` and a D1 database. The map, the setup commands and the list of secrets are in `_db/README.md`. Secrets live only in Cloudflare, never in this repo.
- Account page (`account.html`): sign in with Google or a 6-digit code by email, see your own orders, sign out. Its strings for all nine languages are in `_build/i18n_acct.py`. The header button is hidden below 600px, where the Menu and the footer carry the link instead.
