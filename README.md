# WEBSITETAMS — THE AAMIR SHEIKH

Personal website of THE AAMIR SHEIKH, live at https://theaamirsheikh.com (Cloudflare Pages, project `websitetams`).

- Plain HTML, CSS and JavaScript. No framework, no build step on the server.
- **All pages are generated** by `_build/build.py` → run `python3 _build/build.py` from the repo root after editing.
- Translations (English, Deutsch, Français, 日本語) live in `_build/i18n.py` and are written to `assets/js/i18n.js`.
- Three interfaces, each with its own music: **Riot** (electric guitar), **Noir** (smooth jazz), **Village** (ambient village). Visitors can link or unlink music from the interface in Settings (S key).
- Accessibility panel: colour-vision modes, high contrast, brightness, text size, reduced motion, underline links, read-aloud.
- Order & feedback form (`order.html`) sends to WhatsApp (wa.me prefill) and Gmail (FormSubmit — confirm the activation email the first time).
- Video: short films are bit-exact copies of the originals (or CRF 16 when over 24 MB). **Money Follows (v1)** streams as HLS from `assets/media/money-follows/` — the 4K rung is the original file, untouched, cut into 2.5 s chunks (Cloudflare Pages caps files at 25 MB).
- Music: Pixabay (Pixabay Content License). Photos: Unsplash. Icons: Lucide (ISC). Characters in `assets/img/chars/` are original SVG illustrations.
- Raw sources stay on the computer in `_source_media/` (git-ignored).
