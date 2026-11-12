#!/usr/bin/env python3
"""Static page builder for theaamirsheikh.com — v3 ("three interfaces").

Edit the content below, run `python3 _build/build.py` from the site root,
and every .html file is regenerated. Plain HTML/CSS/JS, no framework.

v3: THE AAMIR SHEIKH branding · 3 interfaces (Riot / Noir / Village) each with
its own music · accessibility panel · order + feedback forms (WhatsApp + Gmail)
· original-quality video (HLS for Money Follows) · less text, more icons.
"""
import os, sys, html, re, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "_build"))
import catalog as CAT   # the price list (v3.8): _build/catalog.py
SITE = "https://theaamirsheikh.com"
BRAND = "THE AAMIR SHEIKH"
EMAIL = "ak4418561@gmail.com"
WHATSAPP = "918082285886"          # +91 80822 85886 (wa.me format, no +)
GITHUB = "https://github.com/MONSTERG0D"
INSTAGRAM = [("the_aamir_sheikh", "https://www.instagram.com/the_aamir_sheikh/"), ("stry.tas", "https://www.instagram.com/stry.tas/")]
FONTS = ("https://fonts.googleapis.com/css2?family=Anton&family=Caveat:wght@600&family=Cinzel:wght@700"
         "&family=Instrument+Serif:ital@0;1&family=Space+Grotesk:wght@400;500;700&display=swap")

def esc(s): return html.escape(s, quote=True)

# ---------------------------------------------------------------- icons (Lucide, ISC licence — see _build/icons/LICENSE-lucide.txt)
_ICONS = {}
def ico(name, cls=""):
    if name not in _ICONS:
        raw = open(os.path.join(ROOT, "_build", "icons", f"{name}.svg"), encoding="utf-8").read()
        raw = re.sub(r"\s+", " ", raw).strip()
        raw = re.sub(r'\s(width|height)="24"', "", raw)
        _ICONS[name] = raw.replace("<svg ", '<svg class="i ICLS" aria-hidden="true" focusable="false" ', 1)
    return _ICONS[name].replace("ICLS", cls)

# ---------------------------------------------------------------- chapters / nav
CHAPTERS = [
    # file, nav label, roman, title, one-liner, icon
    ("purpose.html", "Story", "I", "Story", "Who I am and why this exists.", "flame"),
    ("struggles.html", "Struggles", "II", "Struggles", "The part of the run that usually gets cut.", "mountain"),
    ("skills.html", "Skills", "III", "Skills", "The tools I carry.", "layers"),
    ("projects.html", "Work", "IV", "Work", "Motion, 3D, games, robots, software.", "clapperboard"),
    ("inspirations.html", "Inspirations", "V", "Inspirations", "Wolves, games, films and anime.", "heart"),
    ("services.html", "Services", "VI", "Services", "What I can make for you.", "sparkles"),
    ("order.html", "Order", "VII", "Order & Feedback", "Pick what you want. I get it on WhatsApp.", "shopping-bag"),
]
# v3.4 primary navigation: Home · Work · About · Services · Contact.
# "About" groups the story chapters (with a sub-nav on those pages); "Contact" is the order page.
PRIMARY = [("index.html", "Home"), ("projects.html", "Work"), ("purpose.html", "About"), ("services.html", "Services"), ("order.html", "Contact")]
ABOUT = ["purpose.html", "struggles.html", "skills.html", "inspirations.html"]

def primary_of(cur):
    """Which primary nav item a page belongs to."""
    if cur in ABOUT or cur.startswith("skills/"): return "purpose.html"
    return cur

def nav_current(f, cur):
    if f == cur: return ' aria-current="page"'
    return ' aria-current="true"' if f == primary_of(cur) else ""

# ---------------------------------------------------------------- media
M = "assets/media/"
B = "assets/img/blender/"
I = "assets/img/insp/"
# slug, title, kind, label, orientation (v = vertical 9:16, h = 16:9 wide, t = 16:9 third), hls?
CLIPS = [
    ("money-follows", "Money Follows", "Vertical ad · 4K original", "2026", "v", True),
    ("liquid-death", "Liquid Death — spec", "Motion graphics · ad", "2026", "v", False),
    ("meant-to-be-felt", "Text Isn’t Just Text", "Kinetic type", "2026", "h", False),
    ("design-is-a-game", "Design Is Like a Game", "Kinetic type", "2026", "t", False),
    ("create-blue", "Create Something New", "Title design", "2026", "t", False),
    ("chalamet-edit", "Chalamet — Fan Edit", "Edit · rhythm", "2026", "t", False),
]
CLIPS2 = [
    ("drift-grade", "Drift — Colour Grade", "Grade · footage © 19Bozzy92", "Grade", "h", False),
    ("blind-justice", "Blind Justice", "3D motion", "3D", "h", False),
    ("drift-tracking", "Drift in the Rain", "Tracking · footage © 19Bozzy92", "Track", "t", False),
    ("coca-cola-doc", "Coca-Cola — How They Sell", "Doc explainer · spec", "Doc", "t", False),
    ("physics-robotics", "Physics × Robotics", "Glass UI motion", "Motion", "t", False),
    ("lego-engineering", "LEGO — Engineering", "Motion · spec", "Motion", "t", False),
    ("this-is-my", "This Is My…", "Text motion", "Type", "t", False),
    ("ink-reveal", "Ink Reveal", "Animated render", "Render", "t", False),
]
CLIP = {c[0]: c for c in CLIPS + CLIPS2}
HLS = {"money-follows": M + "money-follows/master.m3u8"}

BLENDER = [
    ("blender-2.webp", "Close-up · warm key", "Blender render: a pink-iced donut with sprinkles beside a ceramic mug in warm light"),
    ("blender-5.webp", "Walnut table", "Blender render: a walnut coffee table with tapered legs on a light wooden floor"),
    ("blender-1.webp", "A beam of sun", "Blender render: donut and mug on a dark concrete floor crossed by a beam of sunlight"),
    ("blender-3.webp", "Depth of field", "Blender render: donut, spoon and mug with shallow depth of field"),
    ("blender-4.webp", "Top-down · cool fill", "Blender render: top-down view of the donut and mug with blue shadows"),
]

def play_attrs(slug, p=""):
    c = CLIP[slug]
    a = f'data-play="{p}{M}{slug}.mp4" data-title="{esc(c[1])}" data-poster="{p}{M}{slug}.webp" data-ori="{"v" if c[4] == "v" else "h"}"'
    if slug in HLS: a += f' data-hls="{p}{HLS[slug]}"'
    return a

# ---------------------------------------------------------------- project art (theme-aware SVG)
def art(name):
    if name == "echo":
        return '''<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Line drawing of a self-balancing robot with a damped oscillation graph">
<defs><pattern id="eg" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" style="stroke:var(--a-grid)"/></pattern></defs>
<rect width="400" height="300" style="fill:var(--a-bg)"/><rect width="400" height="300" fill="url(#eg)"/>
<line x1="40" y1="221" x2="360" y2="221" style="stroke:var(--a-mute)"/>
<g fill="none" style="stroke:var(--a-ink)" stroke-width="2">
<g><animateTransform attributeName="transform" type="rotate" values="-9 170 205;7 170 205;-4 170 205;2.5 170 205;-1 170 205;0 170 205;0 170 205;-9 170 205" dur="6s" repeatCount="indefinite"/>
<rect x="164" y="92" width="12" height="113" rx="2"/><circle cx="170" cy="86" r="13"/><line x1="170" y1="40" x2="170" y2="64" stroke-dasharray="3 4" stroke-opacity=".5"/></g>
<circle cx="170" cy="205" r="16"/><circle cx="170" cy="205" r="3" style="fill:var(--a-ink)"/></g>
<path d="M226 150 C 238 110, 246 110, 256 150 S 270 182, 280 150 S 292 128, 300 150 S 310 164, 316 150 S 324 143, 330 150 S 338 154, 344 150 L 362 150" fill="none" style="stroke:var(--a-red)" stroke-width="2"/>
<g font-family="ui-monospace, Menlo, monospace" font-size="9" style="fill:var(--a-mute)" letter-spacing=".08em">
<text x="40" y="34">ECHO BALANCER · eYRC 2026–27</text><text x="226" y="100">θ(t) → 0</text><text x="226" y="198">PID · LQR</text></g></svg>'''
    if name == "arm":
        return '''<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Blueprint drawing of a robotic arm with gripper reaching a target">
<defs><pattern id="ag" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" style="stroke:var(--a-grid)"/></pattern></defs>
<rect width="400" height="300" style="fill:var(--a-bg)"/><rect width="400" height="300" fill="url(#ag)"/>
<path d="M30 232 A 150 150 0 0 1 310 170" fill="none" style="stroke:var(--a-mute)" stroke-dasharray="4 5"/>
<g fill="none" style="stroke:var(--a-ink)" stroke-width="2" stroke-linecap="round">
<rect x="120" y="240" width="80" height="14"/><line x1="100" y1="254" x2="220" y2="254"/>
<g><animateTransform attributeName="transform" type="rotate" values="0 160 232;-6 160 232;0 160 232" dur="5s" repeatCount="indefinite"/>
<line x1="160" y1="232" x2="196" y2="150"/><circle cx="160" cy="232" r="7" style="fill:var(--a-bg)"/>
<g><animateTransform attributeName="transform" type="rotate" values="0 196 150;10 196 150;0 196 150" dur="5s" repeatCount="indefinite"/>
<line x1="196" y1="150" x2="278" y2="122"/><circle cx="196" cy="150" r="6" style="fill:var(--a-bg)"/>
<circle cx="278" cy="122" r="5" style="fill:var(--a-bg)"/><path d="M282 116 l14 -6 l6 6 M282 128 l14 6 l6 -6"/></g></g></g>
<g style="stroke:var(--a-red)" stroke-width="1.5"><circle cx="318" cy="118" r="9" fill="none"/><line x1="304" y1="118" x2="332" y2="118"/><line x1="318" y1="104" x2="318" y2="132"/></g>
<g font-family="ui-monospace, Menlo, monospace" font-size="9" style="fill:var(--a-mute)" letter-spacing=".08em">
<text x="30" y="34">ARM CONTROL SUITE · SIM → REAL</text><text x="300" y="94">TARGET</text></g></svg>'''
    if name == "bin":
        return '''<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Drawing of a smart bin sending radio signals to a route map">
<rect width="400" height="300" style="fill:var(--a-bg)"/>
<g fill="none" style="stroke:var(--a-ink)" stroke-width="2"><path d="M86 130 h84 l-8 104 h-68 z"/><line x1="80" y1="122" x2="176" y2="122"/><line x1="112" y1="114" x2="144" y2="114"/></g>
<rect x="100" y="178" width="56" height="48" style="fill:var(--a-red)"/>
<g fill="none" style="stroke:var(--a-ink)" stroke-width="1.6">
<path d="M186 104 a 18 18 0 0 1 0 30"><animate attributeName="stroke-opacity" values=".2;1;.2" dur="1.8s" repeatCount="indefinite"/></path>
<path d="M196 94 a 32 32 0 0 1 0 50"><animate attributeName="stroke-opacity" values=".2;1;.2" dur="1.8s" begin=".3s" repeatCount="indefinite"/></path>
<path d="M206 84 a 46 46 0 0 1 0 70"><animate attributeName="stroke-opacity" values=".2;1;.2" dur="1.8s" begin=".6s" repeatCount="indefinite"/></path></g>
<path d="M250 230 L 278 180 L 330 196 L 316 120 L 362 92" fill="none" style="stroke:var(--a-mute)" stroke-dasharray="3 5"/>
<g style="fill:var(--a-ink)"><circle cx="250" cy="230" r="4"/><circle cx="278" cy="180" r="4"/><circle cx="330" cy="196" r="4"/><circle cx="362" cy="92" r="4"/></g>
<circle cx="316" cy="120" r="6" style="fill:var(--a-red)"><animate attributeName="r" values="5;8;5" dur="1.6s" repeatCount="indefinite"/></circle>
<g font-family="ui-monospace, Menlo, monospace" font-size="9" style="fill:var(--a-mute)" letter-spacing=".08em">
<text x="30" y="34">SMART BIN · SIH 2026 · TEAM LUMOS</text><text x="88" y="262">FILL 82%</text><text x="230" y="262">ROUTE → DRIVER APP</text></g></svg>'''
    if name == "ninety":
        dots = "".join(f'<circle cx="{52 + (i % 15) * 21}" cy="{78 + (i // 15) * 25}" r="5.5"/>' for i in range(90))
        return ('<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A grid of ninety days, filled up to today" data-days-start="2026-09-23">'
                '<rect width="400" height="300" style="fill:var(--a-bg)"/>'
                f'<g class="days">{dots}</g>'
                '<g font-family="ui-monospace, Menlo, monospace" font-size="9" style="fill:var(--a-mute)" letter-spacing=".08em">'
                '<text x="52" y="44">90 DAY PROGRESS · ONE THING A DAY</text><text x="52" y="248" data-days-label>DAY — / 90</text></g></svg>')
    return ""

# ---------------------------------------------------------------- head / shell
# Runs before paint: restores interface, colour-vision mode, brightness and text size so nothing flashes.
BOOT = ("<script>(function(){var d=document.documentElement,s={};try{s=JSON.parse(localStorage.getItem('tas')||'{}')}catch(e){}"
        "var u=s.ui||'riot';if(!s.uiPicked){var h=new Date().getHours();u=h>=5&&h<12?'village':h>=12&&h<18?'riot':'noir'}d.setAttribute('data-ui',u);if(s.cvd)d.setAttribute('data-cvd',s.cvd);"
        "if(s.motion)d.setAttribute('data-motion',s.motion);if(s.links)d.setAttribute('data-links','1');"
        "var L=s.lang||'en';d.setAttribute('lang',L);d.setAttribute('data-lang',L);if(L==='ar')d.setAttribute('dir','rtl');"
        "if(s.text)d.style.fontSize=s.text+'%';if(s.bright&&s.bright!=100)d.style.setProperty('--bright',s.bright/100)})()</script>")

# v3.11: who this site belongs to, in the form search engines read (home page only). Facts from this file only.
JSONLD = '<script type="application/ld+json">' + json.dumps({
    "@context": "https://schema.org",
    "@graph": [
        {"@type": "Person", "@id": SITE + "/#person", "name": BRAND, "url": SITE + "/", "email": "mailto:" + EMAIL,
         "image": SITE + "/assets/img/og.jpg",
         "jobTitle": "Motion designer, 3D artist and game developer",
         "description": "B.Tech Computer Science student at Tezpur University: motion design, 3D, games, robotics and web.",
         "affiliation": {"@type": "CollegeOrUniversity", "name": "Tezpur University"},
         "address": {"@type": "PostalAddress", "addressLocality": "Tezpur", "addressRegion": "Assam", "addressCountry": "IN"},
         "knowsAbout": ["Motion design", "Video editing", "Colour grading", "3D modelling", "Blender", "Game development", "Robotics", "Web development"],
         "sameAs": [GITHUB] + [u for _, u in INSTAGRAM]},
        {"@type": "WebSite", "@id": SITE + "/#website", "name": BRAND, "url": SITE + "/", "publisher": {"@id": SITE + "/#person"},
         "inLanguage": ["en", "de", "fr", "ja", "es", "ru", "ar", "zh", "ko"]},
    ]}, ensure_ascii=False, separators=(",", ":")) + "</script>\n"

I18N_LANGS = ("de", "fr", "ja", "es", "ru", "ar", "zh", "ko")
# Starts fetching the visitor's language file while the page is still being read; main.js runs once it is in.
I18N_BOOT = ("(function(){var l=document.documentElement.getAttribute('data-lang'),v=window.TAS_I18V;if(!l||!v||!v[l])return;"
             "var k=document.createElement('link');k.rel='preload';k.as='script';k.href=window.TAS_ROOT+'assets/js/i18n/'+l+'.js?v='+v[l];document.head.appendChild(k)})()")
def i18n_versions():
    return json.dumps({c: ver(f"assets/js/i18n/{c}.js") for c in I18N_LANGS}, separators=(",", ":"))

_VER = {}
def ver(rel):
    """A short fingerprint of a file's contents, added to its address (style.css?v=…). Browsers may keep
    scripts and styles for a day (_headers), so a new fingerprint is what makes them fetch the new copy
    right after a deploy, instead of running yesterday's script with today's page."""
    if rel not in _VER:
        import hashlib
        with open(os.path.join(ROOT, rel), "rb") as f: _VER[rel] = hashlib.sha256(f.read()).hexdigest()[:10]
    return _VER[rel]

def head(title, desc, path, p, scripts=()):
    url = SITE + "/" + ("" if path == "index.html" else path)
    full = title if title.startswith(BRAND) else f"{title} — {BRAND}"
    return f'''<!doctype html>
<html lang="en" class="no-js" data-ui="riot">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{BOOT}
<title>{esc(full)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#0b0b0d">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{BRAND}">
<meta property="og:title" content="{esc(full)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/assets/img/og.jpg">
<meta name="twitter:card" content="summary_large_image">
{JSONLD if path == "index.html" else ""}<link rel="icon" href="{p}assets/img/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="{p}assets/img/apple-touch-icon.png">
<link rel="stylesheet" href="{p}assets/css/style.css?v={ver("assets/css/style.css")}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="{FONTS}" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="{FONTS}"></noscript>
<script>window.TAS_ROOT="{p}";window.TAS_I18V={i18n_versions()};</script>
<script>{I18N_BOOT}</script>
{"".join('<script src="' + p + 'assets/js/' + js + '?v=' + ver("assets/js/" + js) + '" defer></script>' + chr(10) for js in scripts)}<script src="{p}assets/js/main.js?v={ver("assets/js/main.js")}" defer></script>
</head>
'''

def header(current, p):
    links = [f'<a href="{p}{f}"{nav_current(f, current)}>{label}</a>' for f, label in PRIMARY]
    acct_cur = ' aria-current="page"' if current == "account.html" else ""
    return f'''<a class="skip" href="#main">Skip to content</a>
<div class="fx-tex" aria-hidden="true"></div>
<header class="site-head">
  <div class="wrap">
    <a class="wordmark" href="{p}index.html" aria-label="{BRAND}, home"><span class="wm-the">THE</span> AAMIR SHEIKH</a>
    <nav class="nav" aria-label="Primary">{"".join(links)}</nav>
    <div class="head-r">
      <div class="lang">
        <button class="pill lang-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="lang-menu" aria-label="Language: English">{ico("languages")}<span data-lang-code>EN</span></button>
        <ul class="lang-menu" id="lang-menu" role="menu" aria-label="Language" hidden>
          <li role="none"><button role="menuitemradio" aria-checked="true" data-set-lang="en" lang="en" type="button">English</button></li>
          <li role="none"><button role="menuitemradio" aria-checked="false" data-set-lang="de" lang="de" type="button">Deutsch</button></li>
          <li role="none"><button role="menuitemradio" aria-checked="false" data-set-lang="fr" lang="fr" type="button">Français</button></li>
          <li role="none"><button role="menuitemradio" aria-checked="false" data-set-lang="ja" lang="ja" type="button">日本語</button></li>
          <li role="none"><button role="menuitemradio" aria-checked="false" data-set-lang="es" lang="es" type="button">Español</button></li>
          <li role="none"><button role="menuitemradio" aria-checked="false" data-set-lang="ru" lang="ru" type="button">Русский</button></li>
          <li role="none"><button role="menuitemradio" aria-checked="false" data-set-lang="ar" lang="ar" dir="rtl" type="button">العربية</button></li>
          <li role="none"><button role="menuitemradio" aria-checked="false" data-set-lang="zh" lang="zh" type="button">中文</button></li>
          <li role="none"><button role="menuitemradio" aria-checked="false" data-set-lang="ko" lang="ko" type="button">한국어</button></li>
        </ul>
      </div>
      <button class="pill icon-pill music-btn" type="button" data-music-toggle aria-pressed="false" aria-label="Play music">{ico("play", "i-play")}{ico("pause", "i-pause")}<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span></button>
      <button class="pill icon-pill" type="button" data-panel-open aria-controls="panel" aria-expanded="false" aria-label="Open settings: interface, music, sound and accessibility">{ico("sliders-horizontal")}</button>
      <a class="pill acct-btn" href="{p}account.html" data-acct-link{acct_cur}>{ico("user-round")}<span class="acct-t">Sign in</span></a>
      <button class="pill menu-btn" type="button" aria-controls="pause" aria-expanded="false">{ico("menu")}<span class="menu-t">Menu</span> <kbd>Esc</kbd></button>
    </div>
  </div>
</header>
'''

UIS = [
    # key, interface name, music name, icon, swatches, blurb
    ("riot", "Riot", "Electric Guitar", "guitar", ["#09090d", "#ff2b45", "#5b8cff", "#f1ece2"], "Loud, slashed, gothic."),
    ("noir", "Noir", "Smooth Jazz", "coffee", ["#0e1424", "#d4a24c", "#9a2a3a", "#f3e9d2"], "Midnight, brass, slow."),
    ("village", "Village", "Ambient Village", "trees", ["#efe6d2", "#5b7b4a", "#c8643b", "#2b2a26"], "Paper, moss, morning."),
]

def settings_panel():
    ui_cards = "".join(f'''<label class="ui-card" data-ui-card="{k}"><input type="radio" name="ui" value="{k}"{" checked" if k == "riot" else ""}>
<span class="sw" aria-hidden="true">{"".join(f'<i style="background:{c}"></i>' for c in sw)}</span>
<span class="ui-n">{ico(icon)} {n}</span><span class="ui-m">{ico("disc-3")} {mus}</span><span class="ui-b">{b}</span></label>''' for k, n, mus, icon, sw, b in UIS)
    tracks = "".join(f'<label class="chip"><input type="radio" name="track" value="{k}"{" checked" if k == "riot" else ""}><span>{ico(icon)} {mus}</span></label>' for k, n, mus, icon, sw, b in UIS)
    cvd = [("none", "Default"), ("protan", "Protanopia (red-weak)"), ("deutan", "Deuteranopia (green-weak)"), ("tritan", "Tritanopia (blue-weak)"), ("mono", "Monochrome"), ("contrast", "High contrast")]
    cvd_html = "".join(f'<label class="chip"><input type="radio" name="cvd" value="{k}"{" checked" if k == "none" else ""}><span>{n}</span></label>' for k, n in cvd)
    return f'''<div class="panel-wrap" id="panel" role="dialog" aria-modal="true" aria-labelledby="panel-h" aria-hidden="true">
  <div class="panel-card">
    <div class="panel-top"><h2 id="panel-h">{ico("sliders-horizontal")} Settings</h2><button type="button" class="pill icon-pill" data-panel-close aria-label="Close settings">{ico("x")}</button></div>

    <section aria-labelledby="ps-lang"><h3 id="ps-lang" class="label">{ico("languages")} Language</h3>
      <div class="chips" role="radiogroup" aria-label="Language">{"".join(f'<label class="chip"><input type="radio" name="lang" value="{k}"{" checked" if k == "en" else ""}><span lang="{k}">{n}</span></label>' for k, n in [("en", "English"), ("de", "Deutsch"), ("fr", "Français"), ("ja", "日本語"), ("es", "Español"), ("ru", "Русский"), ("ar", "العربية"), ("zh", "中文"), ("ko", "한국어")])}</div>
    </section>

    <section aria-labelledby="ps-ui"><h3 id="ps-ui" class="label">{ico("palette")} Interface</h3>
      <div class="ui-cards" role="radiogroup" aria-label="Interface">{ui_cards}</div>
      <label class="tog"><input type="checkbox" name="auto" checked><span class="tog-ui" aria-hidden="true"></span><span>Change with time of day (morning Village · afternoon Riot · night Noir)</span></label>
    </section>

    <section aria-labelledby="ps-snd"><h3 id="ps-snd" class="label">{ico("headphones")} Music &amp; sound</h3>
      <label class="tog"><input type="checkbox" name="link" checked><span class="tog-ui" aria-hidden="true"></span><span>Music follows the interface</span></label>
      <div class="chips" role="radiogroup" aria-label="Music track" data-tracks>{tracks}</div>
      <div class="row-ctl"><button type="button" class="btn btn--small" data-music-toggle aria-pressed="false">{ico("play", "i-play")}{ico("pause", "i-pause")}<span data-music-label>Play music</span></button>
        <label class="rng">{ico("volume-2")}<span class="sr">Music volume</span><input type="range" name="vol" min="0" max="100" value="55"></label></div>
      <label class="tog"><input type="checkbox" name="sfx" checked><span class="tog-ui" aria-hidden="true"></span><span>Click &amp; menu sounds</span></label>
      <label class="tog"><input type="checkbox" name="amb"><span class="tog-ui" aria-hidden="true"></span><span>Background ambience</span></label>
    </section>

    <section aria-labelledby="ps-a11y"><h3 id="ps-a11y" class="label">{ico("accessibility")} Accessibility</h3>
      <p class="mini">Colour vision</p>
      <div class="chips" role="radiogroup" aria-label="Colour vision mode">{cvd_html}</div>
      <label class="rng wide">{ico("sun-dim")}<span>Brightness</span><input type="range" name="bright" min="50" max="130" value="100" aria-describedby="bright-v"><output id="bright-v">100%</output></label>
      <label class="rng wide">{ico("a-large-small")}<span>Text size</span><input type="range" name="text" min="85" max="150" step="5" value="100" aria-describedby="text-v"><output id="text-v">100%</output></label>
      <label class="tog"><input type="checkbox" name="motion"><span class="tog-ui" aria-hidden="true"></span><span>Reduce motion</span></label>
      <label class="tog"><input type="checkbox" name="links"><span class="tog-ui" aria-hidden="true"></span><span>Underline all links</span></label>
      <label class="tog"><input type="checkbox" name="idle" checked><span class="tog-ui" aria-hidden="true"></span><span>Idle showreel (screensaver)</span></label>
      <label class="tog"><input type="checkbox" name="intro" checked><span class="tog-ui" aria-hidden="true"></span><span>Play the intro (3 seconds)</span></label>
      <div class="row-ctl"><button type="button" class="btn btn--small" data-read>{ico("speech")}<span data-read-label>Read this page aloud</span></button>
        <button type="button" class="btn btn--small btn--ghost" data-reset>{ico("rotate-ccw")}Reset</button></div>
      <p class="mini muted">Works with TalkBack, VoiceOver and NVDA. Shortcuts: <kbd>Esc</kbd> menu · <kbd>S</kbd> settings · <kbd>M</kbd> music.</p>
    </section>
  </div>
</div>'''

def pause_menu(current, p):
    items = ['<li><button type="button" data-resume><span class="num">▸</span>Resume</button></li>']
    def sub_cur(f):
        return ' aria-current="page"' if f == current or (f == "skills.html" and current.startswith("skills/")) else ""
    for i, (f, label) in enumerate(PRIMARY):
        sub = ""
        if f == "purpose.html":   # About → its chapters: one level, always visible (no hidden fly-out)
            sub = '<ul class="pause-sub">' + "".join(f'<li><a href="{p}{c[0]}"{sub_cur(c[0])}><span class="num">{c[2]}</span>{c[3]}</a></li>'
                                                     for c in CHAPTERS if c[0] in ABOUT) + "</ul>"
        items.append(f'<li><a href="{p}{f}"{nav_current(f, current) if f != "purpose.html" else (" aria-current=true" if primary_of(current) == f else "")}><span class="num">0{i + 1}</span>{label}</a>{sub}</li>')
    items.append(f'<li><a href="{p}90-day-progress/"><span class="num">↗</span>90 Day Progress</a></li>')
    items.append(f'<li><a href="{p}play.html"{" aria-current=page" if current == "play.html" else ""}><span class="num">✦</span>Lighthouse game</a></li>')
    items.append(f'<li><a href="{p}account.html" data-acct-link{" aria-current=page" if current == "account.html" else ""}><span class="num">☺</span><span class="acct-t">Sign in</span></a></li>')
    items.append('<li><button type="button" data-panel-open><span class="num">⚙</span>Settings</button></li>')
    return f'''<div class="pause" id="pause" role="dialog" aria-modal="true" aria-label="Menu" aria-hidden="true">
  <div class="pause-card">
    <p class="pause-k" aria-hidden="true">PAUSED</p>
    <h2>Paused</h2>
    <ul class="pause-list">{"".join(items)}</ul>
    <div class="pause-foot"><span>↑ ↓ Select</span><span>S Settings</span><span>Esc Resume</span></div>
  </div>
</div>
<div class="player" id="player" role="dialog" aria-modal="true" aria-label="Video player" aria-hidden="true">
  <div class="player-bar"><span class="label player-title"></span><span class="player-q label" aria-live="polite"></span><button class="pill player-close" type="button">{ico("x")} Close</button></div>
  <div class="player-stage"><video controls playsinline preload="none"></video></div>
</div>
<div class="sr" aria-live="polite" id="announce"></div>
'''

def intro():
    return f'''<div class="intro" id="intro" role="dialog" aria-modal="true" aria-labelledby="intro-t" hidden>
  <div class="intro-bars" aria-hidden="true"><i></i><i></i></div>
  <div class="intro-slash" aria-hidden="true"></div>
  <div class="intro-c">
    <p class="intro-k" aria-hidden="true">ザ・アーミル・シェイク</p>
    <h2 id="intro-t" class="intro-t"><span>THE AAMIR SHEIKH</span><em>production</em></h2>
    <div class="intro-btns">
      <button type="button" class="btn btn--ghost" data-enter="quiet">{ico("skip-forward")} Skip intro</button>
      <button type="button" class="btn btn--solid" data-enter="sound">{ico("headphones")} Enter with sound</button>
    </div>
    <div class="intro-count" aria-hidden="true"><i></i></div>
    <p class="mini intro-h">Continues quietly in 3 seconds</p>
  </div>
</div>'''

def footer(p):
    pages = "".join(f'<li><a href="{p}{f}">{ico(icon)} {t}</a></li>' for f, l, r, t, d, icon in CHAPTERS)
    return f'''<footer class="site-foot">
  <div class="wrap">
    <div class="foot-grid">
      <div class="col big">
        <p class="label">{BRAND}</p>
        <p class="h-m mt-s">A living save file. Updated whenever I level up.</p>
        <div class="foot-cta mt-s">
          <a class="btn btn--solid" href="{p}order.html">{ico("shopping-bag")} Order</a>
          <a class="btn" href="https://wa.me/{WHATSAPP}" target="_blank" rel="noopener">{ico("message-circle")} WhatsApp</a>
          <a class="btn" href="mailto:{EMAIL}">{ico("mail")} Email</a>
        </div>
      </div>
      <div class="col"><p class="label">Chapters</p><ul class="mt-s foot-list">{pages}</ul></div>
      <div class="col"><p class="label">Elsewhere</p><ul class="mt-s foot-list"><li><a href="{GITHUB}" rel="me noopener" target="_blank">{ico("code-xml")} GitHub</a></li>{"".join(f'<li><a href="{u}" rel="me noopener" target="_blank">{ico("instagram")} @{h}</a></li>' for h, u in INSTAGRAM)}<li><a href="{p}90-day-progress/">{ico("trophy")} 90 Day Progress</a></li><li><a href="{p}play.html">{ico("lighthouse")} Lighthouse game</a></li><li><a href="{p}account.html" data-acct-link>{ico("user-round")} <span class="acct-t">Sign in</span></a></li><li><a href="{p}order.html#feedback">{ico("star")} Leave feedback</a></li><li><a href="{p}credits.html">{ico("award")} Credits</a></li><li><a href="{p}privacy.html">{ico("shield-check")} Privacy</a></li><li><button type="button" data-panel-open class="foot-btn">{ico("accessibility")} Accessibility</button></li></ul></div>
    </div>
    <div class="foot-base label">
      <span>© <span data-year>2026</span> {BRAND}</span>
      <span>{ico("map-pin")} Tezpur, Assam · <span data-clock>IST</span></span>
      <span>Run with the pack</span>
    </div>
    <p class="giant" aria-hidden="true"><span>THE</span> AAMIR SHEIKH</p>
  </div>
</footer>
'''

def chapter_nav(current, p):
    files = [c[0] for c in CHAPTERS]
    i = files.index(current)
    nxt = CHAPTERS[(i + 1) % len(CHAPTERS)]
    prev = CHAPTERS[i - 1]
    return f'''<section class="wrap section--tight"><ul class="index-list">
<li><a href="{p}{nxt[0]}"><span class="num">{nxt[2]}</span><span class="t">{ico(nxt[5])} Next: {nxt[3]}</span><span class="d">{nxt[4]}</span></a></li>
<li><a href="{p}{prev[0]}"><span class="num">{prev[2]}</span><span class="t">{ico(prev[5])} Back: {prev[3]}</span><span class="d">{prev[4]}</span></a></li>
</ul></section>'''

def attract(p):
    items = [{"s": f"{p}{M}{c[0]}-loop.mp4", "t": c[1], "k": c[2], "o": c[4]} for c in CLIPS + CLIPS2]
    return f'''<div class="attract" id="attract" aria-hidden="true" hidden data-items='{esc(json.dumps(items))}'>
  <div class="at-stage"><video muted playsinline preload="none"></video><video muted playsinline preload="none"></video></div>
  <div class="at-cap"><p class="label">{ico("tv")} Now showing</p><h2 class="at-title"></h2><p class="at-kind"></p></div>
  <div class="at-logo"><span>THE</span> AAMIR SHEIKH</div>
  <p class="at-hint label">Press any key or move to continue</p>
</div>'''

def about_nav(current, p):
    """Secondary nav shown on the About pages (Story · Struggles · Skills · Inspirations)."""
    def cur(f): return ' aria-current="page"' if f == current or (f == "skills.html" and current.startswith("skills/")) else ""
    links = "".join(f'<a href="{p}{c[0]}"{cur(c[0])}>{ico(c[5])}<span>{c[3]}</span></a>' for c in CHAPTERS if c[0] in ABOUT)
    return f'<nav class="subnav wrap" aria-label="About"><span class="label subnav-k">{ico("user-round")} About</span><div class="subnav-l">{links}</div></nav>\n'

def page(path, title, desc, body, current=None, depth=0, home=False, noindex=False, scripts=(), extra=""):
    p = "../" * depth
    cls = ' class="home"' if home else ""
    if primary_of(current or path) == "purpose.html": body = about_nav(current or path, p) + body
    # v3.11: the dialogs (menu, settings, screensaver, intro) come after the page, so the page's own h1 is the first
    # heading in the outline; they are fixed on screen and hidden until opened, so nothing moves visually.
    doc = (head(title, desc, path, p, scripts) + f"<body{cls}>\n" + header(current or path, p)
           + f'<main id="main" tabindex="-1">\n{body}\n</main>\n' + footer(p) + pause_menu(current or path, p)
           + settings_panel() + attract(p) + (intro() if home else "") + extra + "</body>\n</html>\n")
    doc = re.sub(r"</em>([.,?!])", r"\1</em>", doc)
    if noindex: doc = doc.replace("<title>", '<meta name="robots" content="noindex">\n<title>', 1)
    out = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f: f.write(doc)
    print("wrote", path)

def page_head(roman, chapter, h1, lead, icon="sparkles"):
    return f'''<section class="wrap page-head">
  <span class="big-num" aria-hidden="true">{roman}</span>
  <div class="chapter rv"><span class="roman">{ico(icon)}</span><span class="label">Chapter {roman} — {chapter}</span></div>
  <h1 class="h-xl split-words slash-in">{h1}</h1>
  <p class="lead muted rv rv-d2">{lead}</p>
</section>'''

def epilogue(p, heading="Got something <em>worth building</em>?"):
    return f'''<section class="epilogue cv">
  <div class="wrap section">
    <div class="terminal rv"><span class="dim">&gt; INCOMING TRANSMISSION</span><br>&gt; PRIORITY ONE: SAY HELLO<span class="cursor"></span></div>
    <h2 class="h-xl split-words mt-m" style="max-width:12em">{heading}</h2>
    <div class="m-links mt-m rv">
      <a class="btn btn--solid" href="{p}order.html">{ico("shopping-bag")} Place an order <span class="arr">→</span></a>
      <a class="btn" href="https://wa.me/{WHATSAPP}" target="_blank" rel="noopener">{ico("message-circle")} WhatsApp</a>
      <a class="btn" href="mailto:{EMAIL}">{ico("mail")} {EMAIL}</a>
    </div>
  </div>
</section>'''

def video_tile_media(slug, p="", full=False):
    c = CLIP[slug]
    w, h = (1080, 1920) if c[4] == "v" else (1920, 1080)
    src = p + M + slug + "-loop.mp4"
    return f'''<div class="tile-media wipe" data-preview><img src="{p}{M}{slug}.webp" alt="" loading="lazy" decoding="async" width="{w}" height="{h}"><video muted loop playsinline preload="none" data-src="{src}" aria-hidden="true"></video></div>'''

def clip_html(c, p=""):
    slug, title, kind, year, ori, hls = c
    q = '<span class="q-badge">4K</span>' if hls else ""
    return f'''<div class="clip {ori} rv"><a class="clip-a" href="{p}{M}{slug}.mp4" {play_attrs(slug, p)} aria-label="Play {esc(title)}, {esc(kind)}">{video_tile_media(slug, p=p)}<span class="play-ico" aria-hidden="true">{ico("play")}</span>{q}</a><div class="tile-cap"><h3>{esc(title)}</h3><span class="label">{year}</span><p class="tile-kind">{esc(kind)}</p><a class="want" href="{p}order.html?like={slug}">{ico("shopping-bag")} I want one like this</a></div></div>'''

def art_media(name, mode):
    return f'<div class="tile-media wipe {mode}">{art(name)}</div>'

# ---------------------------------------------------------------- the hero
HERO_TAGS = [("clapperboard", "Motion"), ("box", "3D"), ("gamepad-2", "Games"), ("bot", "Robots"), ("code-xml", "Web")]

def hero():
    tags = "".join(f'<li>{ico(i)}<span>{t}</span></li>' for i, t in HERO_TAGS)
    return f'''<section class="hero" aria-labelledby="hero-t">
  <div class="hero-bg" aria-hidden="true">
    <video class="hero-vid" muted loop playsinline preload="none" data-src="{M}money-follows-loop.mp4" poster="{M}money-follows.webp"></video>
    <div class="hero-scene hs-riot"><i class="moon"></i><i class="rose"></i><i class="tower"></i><i class="slash s1"></i><i class="slash s2"></i><i class="slash s3"></i><i class="clash"></i><span class="spray">TAS</span><span class="drip"></span><span class="ash">{"<i></i>" * 9}</span></div>
    <div class="hero-scene hs-noir"><i class="spot"></i><i class="smoke"></i></div>
    <div class="hero-scene hs-village"><svg viewBox="0 0 1200 500" preserveAspectRatio="xMidYMax slice"><circle class="sunc" cx="640" cy="150" r="64"/><path class="hill h3" d="M0 330 Q200 250 420 310 T820 290 T1200 300 V500 H0Z"/><path class="hill h2" d="M0 380 Q260 300 520 370 T1000 350 T1200 360 V500 H0Z"/><path class="hill h1" d="M0 430 Q300 380 600 420 T1200 410 V500 H0Z"/><g class="birds"><path d="M300 60 q8 -8 16 0 q8 -8 16 0"/><path d="M350 36 q6 -6 12 0 q6 -6 12 0"/><path d="M262 44 q5 -5 10 0 q5 -5 10 0"/></g></svg></div>
  </div>
  <img class="hero-char hc-riot" src="assets/img/chars/riot.svg" alt="" aria-hidden="true" width="360" height="760" decoding="async">
  <img class="hero-char hc-warm" src="assets/img/chars/village.svg" alt="" aria-hidden="true" width="360" height="760" decoding="async">
  <div class="wrap hero-in">
    <p class="hero-kicker label rv">{ico("map-pin")} B.Tech CSE · Tezpur University <span class="live">{ico("zap")} Open for freelance</span></p>
    <h1 id="hero-t" class="hero-title" aria-label="{BRAND}">
      <span class="ht-the" aria-hidden="true">THE</span>
      <span class="ht-row" aria-hidden="true"><span class="ht-a" data-text="AAMIR">AAMIR</span></span>
      <span class="ht-row" aria-hidden="true"><span class="ht-b" data-text="SHEIKH">SHEIKH</span></span>
      <span class="ht-cut" aria-hidden="true"></span>
    </h1>
    <p class="hero-line rv rv-d2">I make things <em class="rot" aria-label="move"><span class="on">move</span><span>feel</span><span>glow</span><span>howl</span></em> — pixels, players and robots.</p>
    <ul class="hero-tags rv rv-d3" aria-label="What I do">{tags}</ul>
    <div class="hero-cta rv rv-d3">
      <a class="btn btn--solid" href="projects.html">{ico("circle-play")} See the work</a>
      <a class="btn" href="order.html">{ico("shopping-bag")} Order something</a>
    </div>
  </div>
  <div class="hero-rank" aria-hidden="true"><b data-hero-rank>D</b><span data-hero-rank-w>Dull</span><i class="rank-bar"><i></i></i></div>
  <p class="hero-k" aria-hidden="true">ザ・アーミル・シェイク</p>
  <div class="hero-scroll label" aria-hidden="true">Scroll</div>
</section>'''

# ================================================================= HOME
def build_home():
    reel_items = ["money-follows", "meant-to-be-felt", "design-is-a-game", "blind-justice", "drift-grade"]
    vids = ticks = ""
    for s in reel_items:
        c = CLIP[s]
        vids += f'<video muted playsinline loop preload="none" data-src="{M}{s}-loop.mp4" poster="{M}{s}.webp" data-ori="{c[4]}" data-title="{esc(c[1])}" data-kind="{esc(c[2])}" {play_attrs(s).replace("data-title=", "data-ptitle=")} aria-hidden="true"></video>'
        ticks += f'<button type="button" aria-label="Show {esc(c[1])}"></button>'
    chapters = "".join(f'<li class="rv"><a href="{f}"><span class="num">{r}</span><span class="t">{ico(icon)} {t}</span><span class="d">{d}</span></a></li>' for f, l, r, t, d, icon in CHAPTERS)
    stats = [("film", "14", "films cut"), ("box", "5", "Blender studies"), ("bot", "3", "robots in progress"), ("gamepad-2", "1", "western in dev")]
    stat_html = "".join(f'<li class="rv"><span class="st-i">{ico(i)}</span><b data-count="{n}">{n}</b><span class="label">{t}</span></li>' for i, n, t in stats)
    # v3.11: who, what and where in one line, and three works that show it, right under the hero
    feat = [("projects.html#reel", f"{M}meant-to-be-felt.webp", 1280, 720, "film", "Motion Reel 2026", "Motion · edits · grades", "14 films"),
            ("projects.html#sundown-trail", "assets/img/sundown-trail-pause.webp", 780, 1040, "gamepad-2", "Sundown Trail", "Game · UI", "In development"),
            ("projects.html#echo-balancer", "assets/img/art-echo.webp", 1200, 900, "bot", "Echo Balancer", "Robotics · eYRC", "In progress")]
    feat_html = "".join(f'''<li class="rv{" rv-d" + str(k) if k else ""}"><a class="feat-c" href="{h}"><span class="feat-m"><img src="{img}" alt="" loading="lazy" decoding="async" width="{w}" height="{hh}"></span>
      <span class="feat-t"><span class="label">{ico(ic)} {kind}</span><b>{t}</b><span class="feat-s">{st}</span></span><span class="feat-go" aria-hidden="true">{ico("arrow-right")}</span></a></li>'''
        for k, (h, img, w, hh, ic, t, kind, st) in enumerate(feat))
    body = hero() + f'''
<section class="wrap feat-strip" aria-labelledby="feat-h">
  <p class="who rv">Motion designer, 3D artist and game developer — a computer science student at Tezpur University, Assam.</p>
  <p class="now-b rv"><i class="now-dot" aria-hidden="true"></i><span>Currently building:</span> <a class="link" href="projects.html#sundown-trail">Sundown Trail</a> · <a class="link" href="projects.html#robotic-arm">Arm Control Suite</a> · <a class="link" href="projects.html#echo-balancer">Echo Balancer</a></p>
  <h2 class="label feat-h" id="feat-h">{ico("sparkles")} Featured</h2>
  <ul class="feat">{feat_html}</ul>
</section>
<div class="marquee" aria-hidden="true"><div><span>Design is like a game</span><span>and I like to play</span><span>Create something new</span><span>Text isn’t just text</span><span>run with the pack</span></div><div><span>Design is like a game</span><span>and I like to play</span><span>Create something new</span><span>Text isn’t just text</span><span>run with the pack</span></div></div>

<section class="reel" aria-label="Showreel">
  <div class="reel-stage">{vids}<button class="reel-play" type="button" aria-label="Play with sound">{ico("play")}</button></div>
  <div class="reel-ui"><div><p class="label lbl">Showreel</p><p class="title">Showreel</p></div><div class="reel-ticks">{ticks}</div></div>
</section>

<section class="wrap section--tight"><ul class="stats">{stat_html}</ul></section>

<section class="wrap section cv">
  <div class="s-head"><p class="label">{ico("clapperboard")} (01) Selected work</p><h2 class="h-l split-words">Seven missions. One goal: make you <em>feel</em> something.</h2></div>
  <div class="tiles">
    <a class="tile tile--wide rv" href="projects.html#reel">{video_tile_media("meant-to-be-felt")}<div class="tile-cap"><h3>{ico("film")} Motion Reel 2026</h3><span class="label">14 films</span></div></a>
    <a class="tile rv" href="projects.html#blender"><div class="tile-media wipe"><img src="{B}blender-2.webp" alt="Blender render of a pink donut beside a mug" loading="lazy" decoding="async" width="1600" height="900"></div><div class="tile-cap"><h3>{ico("box")} Blender Studies</h3><span class="label">3D</span></div></a>
    <a class="tile rv rv-d1" href="projects.html#sundown-trail"><div class="tile-media wipe"><img src="assets/img/sundown-trail-pause.webp" alt="The paper-style pause menu from Sundown Trail" loading="lazy" decoding="async" width="780" height="1040"></div><div class="tile-cap"><h3>{ico("gamepad-2")} Sundown Trail</h3><span class="label badge-live">In dev</span></div></a>
    <a class="tile rv" href="projects.html#echo-balancer">{art_media("echo", "art-night")}<div class="tile-cap"><h3>{ico("bot")} Echo Balancer</h3><span class="label badge-live">eYRC</span></div></a>
    <a class="tile rv rv-d1" href="projects.html#robotic-arm">{art_media("arm", "art-day")}<div class="tile-cap"><h3>{ico("cpu")} Arm Control Suite</h3><span class="label">Robotics</span></div></a>
    <a class="tile rv" href="projects.html#smart-bin">{art_media("bin", "art-night")}<div class="tile-cap"><h3>{ico("trees")} Smart Bin</h3><span class="label">SIH 2026</span></div></a>
    <a class="tile rv rv-d1" href="projects.html#ninety-days">{art_media("ninety", "art-day")}<div class="tile-cap"><h3>{ico("trophy")} 90 Day Progress</h3><span class="label">Live</span></div></a>
  </div>
</section>

<section class="wrap section cv" style="padding-top:0" aria-labelledby="ig-h">
  <div class="s-head"><p class="label">{ico("instagram")} (03) Latest on Instagram</p><h2 class="h-l split-words" id="ig-h">New work lands here first.</h2></div>
  <ul class="ig-cards">{"".join(f'<li class="rv"><a class="ig-card" href="{u}" target="_blank" rel="me noopener"><span class="ig-i">{ico("instagram")}</span><span class="ig-h">@{h}</span><span class="ig-go">Follow on Instagram {ico("arrow-up-right")}</span></a></li>' for h, u in INSTAGRAM)}</ul>
</section>

<section class="wrap section cv" style="padding-top:0">
  <p class="pull split-words">This site isn’t a résumé. It’s a <em>save file</em>.</p>
</section>

<section class="wrap section cv" style="padding-top:0">
  <div class="s-head"><p class="label">{ico("layers")} (04) Chapters</p><h2 class="h-l split-words">Pick up where you left off.</h2></div>
  <ul class="index-list">{chapters}</ul>
</section>
''' + epilogue("")
    page("index.html", f"{BRAND} — motion designer, 3D artist, game developer, CS student",
         "THE AAMIR SHEIKH: motion graphics, video editing, Blender 3D, game development and robotics by a computer science student at Tezpur University.",
         body, current="index.html", home=True)

# ================================================================= STORY
def build_story():
    body = page_head("I", "Origin", "Every game starts with a <em>tutorial</em>. This is mine.",
        "A log of what I can do, what I’m building and where I’m headed.", "flame")
    facts = [("graduation-cap", "B.Tech CSE", "Tezpur University, Assam"), ("clapperboard", "Editor & animator", "Premiere · After Effects · Resolve"),
             ("box", "3D", "Blender"), ("gamepad-2", "Game dev", "Godot · Unreal"), ("bot", "Robotics", "Python · C++ · Arduino")]
    fact_html = "".join(f'<li class="rv">{ico(i if i != "graduation-cap" else "award")}<b>{t}</b><span>{d}</span></li>' for i, t, d in facts)
    body += f'''
<section class="wrap cv"><ul class="id-card">{fact_html}</ul></section>
<section class="wrap section cv">
  <div class="split">
    <div class="side"><p class="label">{ico("heart")} Why</p></div>
    <div class="main"><p class="h-m rv">One place for the whole picture: skills, projects in progress, failures, and the stories that keep me going.</p></div>
  </div>
  <div class="split">
    <div class="side"><p class="label">{ico("zap")} The rush</p></div>
    <div class="main"><p class="h-m rv">A cut on the beat. Light falling just right. A robot that finally balances. Same rush, every time.</p></div>
  </div>
  <div class="split">
    <div class="side"><p class="label">{ico("trees")} The pack</p></div>
    <div class="main"><p class="h-m rv">A wolf is strong because of its pack. Team LUMOS, my eYRC team, everyone who answered a question I was embarrassed to ask.</p></div>
  </div>
</section>

<section class="wrap section cv" style="padding-top:0">
  <div class="s-head"><p class="label">{ico("map-pin")} The run so far</p><h2 class="h-l split-words">Checkpoints.</h2></div>
  <ol class="timeline">
    <li class="rv"><span class="when">2025</span><div><h3>{ico("award")} Joined B.Tech CSE, Tezpur</h3></div></li>
    <li class="rv"><span class="when">Jan 2026</span><div><h3>{ico("globe")} Shipped this site, version one</h3></div></li>
    <li class="rv"><span class="when">May 2026</span><div><h3>{ico("box")} Survived the Blender donut</h3></div></li>
    <li class="rv"><span class="when">Jun – Aug</span><div><h3>{ico("clapperboard")} Went deep on motion design</h3></div></li>
    <li class="rv"><span class="when">Sep 2026</span><div><h3>{ico("trophy")} SIH 2026 + the 90-day challenge</h3></div></li>
    <li class="rv"><span class="when">Oct 2026</span><div><h3>{ico("zap")} Robots, a western and a 4K ad</h3></div></li>
  </ol>
</section>

<section class="wrap section cv" style="padding-top:0">
  <div class="s-head"><p class="label">{ico("arrow-right")} Next quests</p></div>
  <ul class="quests">
    <li class="rv">{ico("gamepad-2")}<h3>Ship Sundown Trail</h3></li>
    <li class="rv">{ico("code-xml")}<h3>Get strong at C++ &amp; DSA</h3></li>
    <li class="rv">{ico("bot")}<h3>Finish eYRC strong</h3></li>
    <li class="rv">{ico("shopping-bag")}<h3>Take on real clients</h3></li>
  </ul>
</section>
''' + chapter_nav("purpose.html", "")
    page("purpose.html", "Story", "Who THE AAMIR SHEIKH is, why this site exists and where he’s headed — Chapter I.", body)

# ================================================================= STRUGGLES
def build_struggles():
    trials = [
        ("clock", "Time", "Never enough hours.", "Small daily tasks, tracked in 90 Day Progress."),
        ("layers", "The learning curve", "Too much to learn, all at once.", "Learn by building — the same week."),
        ("eye", "Self-doubt", "The voice that says I’m not good enough.", "I keep receipts. This site is one."),
        ("cpu", "Resources", "Hardware is expensive. Renders are slow.", "Free tools first. Simulate before buying."),
        ("sun-dim", "Balance", "Too many tabs open in life.", "Clear goals. Ask for help. No wolf hunts alone."),
    ]
    rows = ""
    for i, (icon, name, h, camp) in enumerate(trials, 1):
        rows += f'''<article class="trial rv">
  <div class="no">0{i}</div>
  <div class="body"><p class="label">{ico(icon)} {name}</p><h2 class="mt-s">{h}</h2></div>
  <div class="camp"><p class="label">{ico("flame")} Base camp</p><p>{camp}</p></div>
</article>'''
    body = page_head("II", "A survivor is born", "Everyone shows the highlight reel. <em>Here’s the rest.</em>",
        "What I’m fighting right now — and what I’m doing about it.", "mountain")
    body += f'<section class="wrap cv" style="padding-bottom:clamp(48px,8vw,120px)">{rows}</section>'
    body += '''<section class="wrap section">
  <p class="pull split-words">Every version of me that failed taught the <em>next one</em> something.</p>
</section>''' + chapter_nav("struggles.html", "")
    page("struggles.html", "Struggles", "The struggles behind the work — time, the learning curve, self-doubt — and how THE AAMIR SHEIKH fights each one. Chapter II.", body)

# ================================================================= SKILLS
SKILLS = [
    ("video-editing", "Video Editing", "scissors", 4, "Confident", "Cuts on the beat. Colour that sets the mood.",
     ["Premiere Pro", "After Effects", "DaVinci Resolve"], ["Rotoscoping", "Tracking", "Masking"],
     ["Colour grading", "Compositing", "Transitions", "Motion graphics"], ["money-follows", "drift-grade", "drift-tracking", "chalamet-edit", "liquid-death", "coca-cola-doc"], []),
    ("modeling-3d", "3D Modelling", "box", 2, "Learning", "Props and scenes in Blender, lit until they feel real.",
     ["Blender", "Cascadeur", "Unreal Engine"], ["Modelling", "Texturing", "Lighting", "Rendering"],
     ["Hard-surface", "Sculpting", "Shading", "Depth of field"], ["blind-justice"], [b[0] for b in BLENDER]),
    ("graphic-design", "Graphic Design", "pen-tool", 3, "Working", "Layout, type and image, working together.",
     ["Illustrator", "Photoshop", "Figma"], ["Masking", "Recompositing"],
     ["Colour grading", "Compositing", "Text composition"], ["create-blue", "lego-engineering"], []),
    ("frontend", "Frontend Development", "code-xml", 3, "Working", "Fast, hand-written sites that work everywhere.",
     ["VS Code", "Chrome DevTools", "Figma"], ["HTML5", "CSS3", "JavaScript", "React (learning)"],
     ["Responsive", "Accessible", "Themes & sound"], [], []),
    ("drawing", "Drawing & Sketching", "brush", 3, "Working", "Where every idea starts.",
     ["2D Pincel", "Krita", "Sketchbook"], ["Graphics tablet", "Traditional"],
     ["Line art", "Inking", "Colouring", "Character design", "Concept art"], [], []),
    ("animation", "Animation", "sparkles", 2, "Learning", "Frame by frame or keyframed — making things feel alive.",
     ["OpenToonz", "Adobe Animate", "Blender", "Cascadeur"], ["Interpolation", "Principles", "Upscaling"],
     ["Frame by frame", "2D", "3D"], ["ink-reveal", "meant-to-be-felt", "design-is-a-game", "this-is-my", "physics-robotics"], []),
    ("game-dev", "Game Development", "gamepad-2", 2, "Learning", "Systems, feel and atmosphere — all into Sundown Trail.",
     ["Godot", "Unreal Engine", "Unity", "Blender"], ["C++", "Collision", "Physics"],
     ["Game logic", "UI / menus"], [], []),
    ("programming-robotics", "Programming & Robotics", "bot", 2, "Learning", "C++ from the ground up. Hardware that talks back.",
     ["Python", "C++", "CoppeliaSim", "Arduino IDE"], ["PID", "LQR", "ESP32 · LoRa"],
     ["Simulate first", "Daily practice"], [], []),
]

def notches(n):
    return '<span class="notches" aria-hidden="true">' + "".join(f'<i class="{"f" if i < n else ""}"></i>' for i in range(5)) + '</span>'

def build_skills():
    cards = ""
    for i, s in enumerate(SKILLS):
        slug, name, icon, n, lvl, blurb, tools, tech, methods, seen, imgs = s
        cards += f'''<a class="charm rv" href="skills/{slug}.html">
  <span class="charm-i">{ico(icon)}</span>
  <h2>{name}</h2>
  <div class="top-r">{notches(n)}<span class="notches-lbl">{lvl}</span><span class="sr">Level: {lvl}, {n} of 5</span></div>
  <p class="tools">{" · ".join(tools)}</p>
  <span class="go" aria-hidden="true">{ico("arrow-up-right")}</span>
</a>'''
    body = page_head("III", "Craft", "Tools change. <em>Taste</em> compounds.", "Filled notches = how much of my build each skill takes.", "layers")
    body += f'''<section class="wrap cv" style="padding-bottom:clamp(48px,8vw,120px)"><div class="charms">{cards}</div></section>''' + chapter_nav("skills.html", "")
    page("skills.html", "Skills", "Skills of THE AAMIR SHEIKH: video editing, motion graphics, Blender 3D, graphic design, frontend, drawing, animation, game development and robotics. Chapter III.", body)

    for i, s in enumerate(SKILLS):
        slug, name, icon, n, lvl, blurb, tools, tech, methods, seen, imgs = s
        li = lambda xs: "".join(f"<li>{esc(x)}</li>" for x in xs)
        extra = ""
        if imgs:
            figs = "".join(f'<figure class="{"big" if k == 0 else ("sq" if k == 1 else "")} rv"><img src="../{B}{f}" alt="{esc(next(b[2] for b in BLENDER if b[0]==f))}" loading="lazy" decoding="async" width="1600" height="900"><figcaption>{esc(next(b[1] for b in BLENDER if b[0]==f))}</figcaption></figure>' for k, f in enumerate(imgs))
            extra += f'<section class="wrap section cv" style="padding-top:0"><div class="s-head"><h2 class="label">{ico("image")} Renders</h2></div><div class="bgal">{figs}</div></section>'
        if seen:
            clips = "".join(clip_html(CLIP[c], p="../") for c in seen)
            extra += f'<section class="wrap section cv" style="padding-top:0"><div class="s-head"><h2 class="label">{ico("film")} Proof of work</h2></div><div class="reel-grid">{clips}</div></section>'
        prev = SKILLS[i - 1]; nxt = SKILLS[(i + 1) % len(SKILLS)]
        body = f'''<section class="wrap page-head">
  <span class="big-num" aria-hidden="true">{i+1:02d}</span>
  <div class="chapter rv"><span class="roman">{ico(icon)}</span><span class="label"><a href="../skills.html" class="link">Skills</a> / {i+1:02d}</span></div>
  <h1 class="h-xl split-words slash-in">{name}</h1>
  <div class="top-r mt-m rv">{notches(n)}<span class="notches-lbl">{lvl} · {n}/5</span></div>
  <p class="lead muted rv rv-d2">{blurb}</p>
</section>
<section class="wrap" style="padding-bottom:clamp(48px,8vw,120px)">
  <div class="kit rv">
    <div><p class="label">{ico("pen-tool")} Tools</p><ul>{li(tools)}</ul></div>
    <div><p class="label">{ico("cpu")} Tech</p><ul>{li(tech)}</ul></div>
    <div><p class="label">{ico("sparkles")} Methods</p><ul>{li(methods)}</ul></div>
  </div>
  <p class="mt-m rv"><a class="btn btn--solid" href="../order.html?want={slug}">{ico("shopping-bag")} Order this</a></p>
</section>
{extra}
<section class="wrap section--tight"><ul class="index-list">
  <li><a href="{nxt[0]}.html"><span class="num">{ico("arrow-right")}</span><span class="t">{nxt[1]}</span><span class="d">Next skill</span></a></li>
  <li><a href="{prev[0]}.html"><span class="num">←</span><span class="t">{prev[1]}</span><span class="d">Previous skill</span></a></li>
</ul></section>'''
        page(f"skills/{slug}.html", name, f"{name} — tools, tech and methods THE AAMIR SHEIKH uses.", body, current="skills.html", depth=1)

# ================================================================= WORK
def build_work():
    clips = "".join(clip_html(c) for c in CLIPS)
    clips2 = "".join(clip_html(c) for c in CLIPS2)

    def mission(id_, tags, num, media, mode, title, icon, role, line, facts, links, flip):
        dl = "".join(f"<dt>{ico(fi)} {k}</dt><dd>{v}</dd>" for fi, k, v in facts)
        return f'''<article class="mission{' flip' if flip else ''}" id="{id_}" data-tags="{tags}">
  <div class="m-media"><div class="frame wipe {mode}">{media}<span class="m-num" aria-hidden="true">{num}</span></div></div>
  <div class="m-text rv rv-d1">
    <p class="label">Mission {num}</p>
    <h2>{ico(icon)} {title}</h2>
    <p class="role">{role}</p>
    <p class="m-line">{line}</p>
    <dl class="facts">{dl}</dl>
    <div class="m-links">{"".join(links)}</div>
  </div>
</article>'''

    m_sundown = mission("sundown-trail", "games", "02",
        '<img src="assets/img/sundown-trail-pause.webp" alt="Sundown Trail’s paper-journal pause menu: Resume, Save game, Load game, Settings, Quit to title" loading="lazy" decoding="async" width="780" height="1040">', "",
        "Sundown Trail", "gamepad-2", "A western, built one system at a time",
        "RDR2 made me want to build a world, not a level. Press Esc — this site’s menu is modelled on the game’s.",
        [("flame", "Status", '<span class="badge-live">In development</span>'), ("layers", "Focus", "Game design · UI · Blender environments"), ("globe", "Platform", "Browser → Android &amp; iOS")], [], False)
    rest = mission("echo-balancer", "robotics software", "04", art("echo"), "art-night", "Echo Balancer", "bot", "e-Yantra Robotics Competition 2026–27",
        "Keep an unstable robot upright. PID first, then LQR — in CoppeliaSim.",
        [("flame", "Status", '<span class="badge-live">In progress</span>'), ("code-xml", "Stack", "Python · CoppeliaSim"), ("award", "Competition", "eYRC · IIT Bombay")], [], True)
    rest += mission("robotic-arm", "robotics software", "05", art("arm"), "art-day", "Arm Control Suite", "cpu", "Desktop software for my robotic arm",
        "Test a move on screen. Press one button. Watch the real arm do it.",
        [("flame", "Status", '<span class="badge-live">In development</span>'), ("cpu", "Hardware", "Arm + gripper · Arduino"), ("layers", "Software", "Sim · kinematics · 3D view")], [], False)
    rest += mission("smart-bin", "robotics software", "06", art("bin"), "art-night", "Smart Bin", "trees", "Smart India Hackathon 2026 — Team LUMOS",
        "Bins report how full they are over LoRa. A priority engine tells drivers where to go first.",
        [("award", "Problem", "PS 195 · Smart Waste"), ("cpu", "Hardware", "ESP32-C3 · radar · SX1278"), ("code-xml", "Stack", "FastAPI · MongoDB · React Native")],
        [f'<a class="btn" href="https://github.com/BachirAfx/WasteFlow" target="_blank" rel="noopener">{ico("code-xml")} Code on GitHub</a>'], True)
    rest += mission("ninety-days", "software", "07", art("ninety"), "art-day", "90 Day Progress", "trophy", "My accountability app",
        "Big plans, small daily tasks, no overload. Saved on your own device.",
        [("zap", "Status", "Live"), ("code-xml", "Stack", "React · TypeScript")],
        [f'<a class="btn btn--solid" href="90-day-progress/">{ico("arrow-up-right")} Open the app</a>'], False)

    figs = "".join(f'<figure class="{"big" if k == 0 else ("sq" if k == 1 else "")} rv"><img src="{B}{f}" alt="{esc(alt)}" loading="lazy" decoding="async" width="1600" height="900"><figcaption>{esc(cap)}</figcaption></figure>' for k, (f, cap, alt) in enumerate(BLENDER))

    index_rows = [
        ("01", "Motion Reel 2026", "film", "Motion · edits · grades", "2026", "#reel", f"{M}money-follows.webp"),
        ("02", "Sundown Trail", "gamepad-2", "Game · UI", "In dev", "#sundown-trail", "assets/img/sundown-trail-pause.webp"),
        ("03", "Blender Studies", "box", "3D · lighting", "2026", "#blender", f"{B}blender-2.webp"),
        ("04", "Echo Balancer", "bot", "Robotics · eYRC", "2026", "#echo-balancer", "assets/img/art-echo.webp"),
        ("05", "Arm Control Suite", "cpu", "Robotics · software", "In dev", "#robotic-arm", "assets/img/art-arm.webp"),
        ("06", "Smart Bin", "trees", "IoT · SIH 2026", "2026", "#smart-bin", "assets/img/art-bin.webp"),
        ("07", "90 Day Progress", "trophy", "Software · React", "Live", "#ninety-days", "assets/img/art-ninety.webp"),
    ]
    ptable = "".join(f'<li class="rv"><a href="{h}" data-peek="{img}"><span class="n">{n}</span><span class="t">{ico(ic)} <bdi>{t}</bdi></span><span class="k">{k}</span><span class="y">{y}</span><span class="ar">{ico("arrow-right")}</span></a></li>' for n, t, ic, k, y, h, img in index_rows)
    filters = [("all", "All", "layers"), ("motion", "Motion", "film"), ("3d", "3D", "box"), ("games", "Games", "gamepad-2"), ("robotics", "Robotics", "bot"), ("software", "Software", "code-xml")]
    fhtml = "".join(f'<button type="button" data-filter="{k}" aria-pressed="{"true" if k == "all" else "false"}">{ico(i)} {t}</button>' for k, t, i in filters)

    # v3.11: when each mission happened, from the facts above only (years, competitions, status)
    tl = [("Earlier", "", [("#reel", "Edits, grades & 3D", "")]),
          ("2026", "", [("#reel", "Motion Reel 2026", "14 films"), ("#blender", "Blender Studies", "3D"), ("#smart-bin", "Smart Bin", "SIH 2026"), ("#ninety-days", "90 Day Progress", "Live")]),
          ("Now", " mtl-now", [("#sundown-trail", "Sundown Trail", "In development"), ("#robotic-arm", "Arm Control Suite", "In development"), ("#echo-balancer", "Echo Balancer", "eYRC 2026–27")])]
    tl_html = "".join(f'''<li class="mtl-y{cls} rv"><span class="mtl-k">{k}</span><ul>{"".join(f'<li><a href="{h}"><b><bdi>{esc(t)}</bdi></b>{f"<span>{esc(st)}</span>" if st else ""}</a></li>' for h, t, st in items)}</ul></li>'''
                      for k, cls, items in tl)
    # v3.11: the missions as a small terminal: type help, ls, open 2 … (main.js); without JavaScript it is a plain list
    term_ls = "".join(f'<li><a href="{h}">{n}  {esc(t)}</a></li>' for n, t, ic, k, y, h, img in index_rows)
    body = page_head("IV", "Missions", "The missions <em>log.</em>", "Hover to preview. Click to watch in full quality, with sound.", "clapperboard")
    body += f'''<section class="wrap" style="padding-bottom:clamp(40px,6vw,80px)">
  <ul class="ptable">{ptable}</ul>
  <h2 class="label mtl-h">{ico("clock")} Mission timeline</h2>
  <ol class="mtl">{tl_html}</ol>
</section>
<div class="peek" aria-hidden="true"><img alt=""></div>
<section class="wrap" style="padding-bottom:clamp(48px,8vw,120px)">
  <div class="filters" role="group" aria-label="Filter missions">{fhtml}</div>
  <article class="mission mission--full" id="reel" data-tags="motion">
    <div class="s-head"><p class="label">Mission 01</p><h2 class="h-xl split-words">Motion Reel 2026</h2><p class="muted rv">Kinetic type, spec ads, grades, tracking, 3D. Every film plays at its original quality.</p></div>
    <div class="reel-grid">{clips}</div>
    <div class="cat-head"><span class="label">Earlier</span><h2>Edits, grades &amp; 3D</h2></div>
    <div class="reel-grid">{clips2}</div>
  </article>
  {m_sundown}
  <article class="mission mission--full" id="blender" data-tags="3d">
    <div class="s-head"><p class="label">Mission 03</p><h2 class="h-xl split-words">Blender <em>Studies</em></h2><p class="muted rv">The donut, a mug, a walnut table — and one lamp moved a hundred times.</p></div>
    <div class="bgal">{figs}</div>
  </article>
  {rest}
  <section class="pterm rv" aria-labelledby="pterm-h" data-pterm>
    <div class="pterm-bar"><i></i><i></i><i></i><h2 id="pterm-h" class="pterm-t">missions.log</h2></div>
    <div class="pterm-out" role="log" aria-live="polite" data-pterm-out>
      <p><span class="pterm-p" aria-hidden="true">aamir@tas:~$</span> ls missions</p>
      <ul class="pterm-ls">{term_ls}</ul>
      <p class="pterm-hint" data-pterm-hint hidden>Type help, ls or open 2 — then press Enter.</p>
    </div>
    <form class="pterm-in" data-pterm-form hidden><label class="pterm-p" for="pterm-cmd">aamir@tas:~$</label><input id="pterm-cmd" name="cmd" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" aria-label="Terminal command" data-no-i18n></form>
  </section>
</section>
<div class="rank" aria-hidden="true"><b>D</b><span>Dull</span></div>''' + chapter_nav("projects.html", "")
    page("projects.html", "Work", "Projects by THE AAMIR SHEIKH: a 2026 motion reel, Blender 3D studies, Sundown Trail, eYRC Echo Balancer, robotic arm software, SIH Smart Bin and 90 Day Progress. Chapter IV.", body)

# ================================================================= INSPIRATIONS
# key, title, meta, one-liner, image key (assets/img/insp/<key>.webp), size class, motion
INSP_GAMES = [
    ("rdr2", "Red Dead Redemption 2", "Game · 2018", "A world that doesn’t need you — so you care about it.", "w8", "pan"),
    ("stray", "Stray", "Game · 2022", "Tell the story from knee height.", "w4", "zoom"),
    ("hollow", "Hollow Knight", "Game · 2017", "A tiny palette. A huge sense of place.", "w4", "glow"),
    ("tomb", "Tomb Raider trilogy", "Games · 2013–18", "Origin stories are about surviving, not winning.", "w4", "pan"),
    ("spidey", "Marvel’s Spider-Man 2", "Game · 2023", "Movement should feel good before it means anything.", "w4", "swing"),
    ("nier", "NieR: Automata", "Game · 2017", "The interface can be part of the story.", "w6", "glitch"),
    ("dmc", "Devil May Cry", "Games · 2001–", "Style is a score. Earn the S rank.", "w6", "slash"),
    ("stellar", "Stellar Blade", "Game · 2024", "Polish is respect for the player.", "w12", "pan"),
]
INSP_FILMS = [
    ("shawshank", "The Shawshank Redemption", "Film · 1994", "Patience is a plan. So is hope.", "w6", "rain"),
    ("angry", "12 Angry Men", "Film · 1957", "One room. No wasted frame.", "w6", "zoom"),
    ("lighthouse", "The Lighthouse", "Film · 2019", "Black, white and grain can be enough.", "w4", "flicker"),
    ("atonement", "Atonement", "Film · 2007", "One long take can carry a war.", "w4", "pan"),
    ("fightclub", "Fight Club", "Film · 1999", "Make people look twice.", "w4", "glitch"),
    ("alien", "Alien — Ripley", "Film · 1979", "Competence is the most heroic trait.", "w4", "scan"),
    ("mickey", "Mickey 17", "Film · 2025", "Each version of you gets a little better.", "w4", "snow"),
    ("thunder", "Thunderbolts*", "Film · 2025", "Broken people can still make a team.", "w4", "pan"),
    ("ff", "The Fantastic Four: First Steps", "Film · 2025", "The future as people once imagined it.", "w6", "flicker"),
    ("bnd", "Spider-Man: Brand New Day", "Film · 2026", "Starting over isn’t starting from zero.", "w6", "swing"),
    ("puss", "Puss in Boots: The Last Wish", "Film · 2022", "Painted, and moves like a comic.", "w6", "zoom"),
    ("aladdin", "Aladdin", "Film · Disney", "Wonder first, logic later.", "w6", "glow"),
]
INSP_ANIME = [
    ("nezha", "Ne Zha", "Animated film · 2019", "Fight the fate people write for you.", "w6", "glow"),
    ("jiang", "Jiang Ziya", "Animated film · 2020", "Ink, myth and big empty skies.", "w6", "pan"),
    ("onepiece", "One Piece", "Anime · 1999–", "Find your crew and keep sailing.", "w4", "swing"),
    ("hxh", "Hunter × Hunter", "Anime · 2011", "Rules make power interesting.", "w4", "zoom"),
    ("dororo", "Dororo", "Anime · 2019", "Take back what was taken, piece by piece.", "w4", "slash"),
    ("doro", "Dorohedoro", "Anime · 2020", "Grime and warmth can share a frame.", "w6", "glitch"),
    ("parasyte", "Parasyte -the maxim-", "Anime · 2014", "Change from the inside is still change.", "w6", "zoom"),
]

# how wide each panel is on screen, so phones and small windows fetch the 640px copy (v3.11)
IP_SIZES = {"w12": "(max-width: 760px) 100vw, 92vw", "w8": "(max-width: 760px) 100vw, 62vw", "w6": "(max-width: 760px) 100vw, 46vw", "w4": "(max-width: 760px) 100vw, 31vw"}

def insp_panel(k, title, meta, line, size, motion, serif=False, id_=""):
    idattr = f' id="{id_}"' if id_ else ""
    h = f'<h3 class="serif-i">{title}</h3>' if serif else f"<h3>{title}</h3>"
    return f'''<article class="ipanel {size} m-{motion} rv"{idattr}>
  <div class="ip-img"><img src="{I}{k}.webp" srcset="{I}{k}-sm.webp 640w, {I}{k}.webp 1200w" sizes="{IP_SIZES.get(size, "50vw")}" alt="" loading="lazy" decoding="async" width="1200" height="800"></div>
  <div class="ip-fx" aria-hidden="true"></div>
  <div class="ip-cap"><p class="label">{meta}</p>{h}<p class="take">“{line}”</p></div>
</article>'''

def build_inspirations():
    games = "".join(insp_panel(*x, id_=("stray" if x[0] == "stray" else "")) for x in INSP_GAMES)
    films = "".join(insp_panel(*x, serif=True) for x in INSP_FILMS)
    anim = "".join(insp_panel(*x) for x in INSP_ANIME)
    wolves = f'''<article class="ipanel w12 tall m-pan wolfpanel rv" id="wolves">
  <div class="ip-img"><img src="{I}wolves.webp" srcset="{I}wolves-sm.webp 640w, {I}wolves.webp 1200w" sizes="(max-width: 760px) 100vw, 92vw" alt="A pack of wolves walking through snowy forest" loading="lazy" decoding="async" width="1600" height="1000"></div>
  <div class="ip-fx" aria-hidden="true"></div>
  <div class="ip-cap"><p class="label">{ico("heart")} 00 · The pack · always</p>
    <h2 class="serif-i wolf-h">Wolves.</h2>
    <blockquote>“For the strength of the Pack is the Wolf, and the strength of the Wolf is the Pack.”<cite>Rudyard Kipling · 1894</cite></blockquote></div>
</article>'''
    people = f'''
<article class="ipanel w6 m-pan rv"><div class="ip-img"><img src="assets/img/mackesy-1.webp" alt="" loading="lazy" width="1200" height="800"></div><div class="ip-fx" aria-hidden="true"></div><div class="ip-cap"><p class="label">Book &amp; film · Charlie Mackesy</p><h3>The Boy, the Mole, the Fox &amp; the Horse</h3><p class="take">“A few lines of ink can carry more than a blockbuster.”</p></div></article>
<a class="ipanel w6 m-zoom rv" href="{M}chalamet-edit.mp4" {play_attrs("chalamet-edit")}><div class="ip-img"><img src="assets/img/chalamet.webp" alt="" loading="lazy" width="1200" height="800"></div><div class="ip-fx" aria-hidden="true"></div><div class="ip-cap"><p class="label">{ico("play")} Actor · watch my edit</p><h3>Timothée Chalamet</h3><p class="take">“More noise, more meaning.”</p></div></a>
<article class="ipanel w12 m-slash rv solid"><div class="ip-cap"><p class="label">Design studio</p><h3>Pentagram</h3><p class="take">“Hierarchy is kindness.”</p></div></article>
'''
    body = page_head("V", "Inspirations", "Everything I love <em>leaves a mark.</em>", "One line I took from each. Small nods are hidden all over this site.", "heart")
    body += f'''<section class="wrap" style="padding-bottom:clamp(48px,8vw,120px)">
  <div class="ipanels">{wolves}</div>
  <div class="cv"><div class="cat-head"><span class="label">{ico("gamepad-2")} 01</span><h2>Games</h2></div><div class="ipanels">{games}</div></div>
  <div class="cv"><div class="cat-head"><span class="label">{ico("film")} 02</span><h2>Films</h2></div><div class="ipanels">{films}</div></div>
  <div class="cv"><div class="cat-head"><span class="label">{ico("sparkles")} 03</span><h2>Anime &amp; animation</h2></div><div class="ipanels">{anim}</div></div>
  <div class="cv"><div class="cat-head"><span class="label">{ico("heart")} 04</span><h2>People</h2></div><div class="ipanels">{people}</div></div>
  <p class="pull split-words mt-l">Feel the <em>silence</em>.</p>
  <p class="mini muted mt-m">Mood photos from Unsplash — see <a class="link" href="credits.html">credits</a>. Titles belong to their creators.</p>
</section>''' + chapter_nav("inspirations.html", "")
    page("inspirations.html", "Inspirations", "The wolves, games, films, anime and people that inspire THE AAMIR SHEIKH. Chapter V.", body)

# ================================================================= SERVICES (v3.8: prices from _build/catalog.py)
CATD = CAT.data()

def inr(n):
    """1500000 -> 15,00,000 (Indian grouping), for the page as written. The page script re-formats
    every price in the visitor's language."""
    s = str(int(n))
    if len(s) <= 3: return s
    head_, tail = s[:-3], s[-3:]
    parts = []
    while len(head_) > 2: parts.insert(0, head_[-2:]); head_ = head_[:-2]
    if head_: parts.insert(0, head_)
    return ",".join(parts) + "," + tail

def price_text(it):
    k = it["kind"]
    if k == "quote": return "Price after talking"
    if k == "from": return f"From ₹{inr(it['min'])}"
    if k == "fixed": return f"₹{inr(it['min'])}"
    return f"₹{inr(it['min'])}–{inr(it['max'])}"

def write_catalog():
    """The price list as code: one copy for the page script, one for the server (functions/_lib)."""
    core = open(os.path.join(ROOT, "_build", "pricing_core.js"), encoding="utf-8").read()
    blob = json.dumps(CATD, ensure_ascii=False, separators=(",", ":"))
    note = "/* Generated by _build/build.py from _build/catalog.py and _build/pricing_core.js.\n   Do not edit this file: change those two and run the build. */\n"
    server = note + "const CATALOG = " + blob + ";\n\n" + core + "\nexport { CATALOG, quote, lengthOf, timingOf };\n"
    client = note + "(function () {\n\"use strict\";\nvar CATALOG = " + blob + ";\n\n" + core + "\nwindow.TAS_CAT = { data: CATALOG, quote: quote, lengthOf: lengthOf, timingOf: timingOf };\n})();\n"
    for rel, text in (("functions/_lib/catalog.js", server), ("assets/js/catalog.js", client)):
        with open(os.path.join(ROOT, rel), "w", encoding="utf-8") as f: f.write(text)
        print("wrote", rel)

def svc_row(iid, it):
    subs = []
    if it["unit"]: subs.append(CATD["unitWords"][str(it["unit"])])
    if it["note"]: subs.append(it["note"])
    sub = "".join(f'<span class="svc-u">{esc(x)}</span>' for x in subs)
    tiers = ""
    if it["tiers"]:
        tiers = '<span class="svc-tiers">' + "".join(
            f'<span class="svc-t"><span>{esc(t["name"])}</span><span class="svc-tp" data-tier-price="{t["min"]}-{t["max"]}" data-no-i18n>₹{inr(t["min"])}–{inr(t["max"])}</span></span>' for t in it["tiers"]) + "</span>"
    return (f'<li><button type="button" class="svc-r" data-order="{iid}" aria-haspopup="dialog" aria-controls="osheet">'
            f'<span class="svc-top"><span class="svc-n">{esc(it["name"])}</span><span class="svc-dots" aria-hidden="true"></span>'
            f'<span class="svc-pg"><span class="svc-p" data-price="{iid}" data-no-i18n>{price_text(it)}</span><span class="svc-go" aria-hidden="true">{ico("arrow-right")}</span></span></span>'
            f'{sub}{tiers}</button></li>')

TIMING_CHIP = {"asap": "×2", "week": None, "month": "−5%", "flex": None}

def order_sheet():
    """The order panel on the Services page. One panel, filled by main.js for the service picked."""
    chips = ""
    for t in CATD["timing"]:
        mark = TIMING_CHIP[t["id"]]
        small = " <small>" + mark + "</small>" if mark else ""
        chips += f'<label class="chip"><input type="radio" name="timing" value="{t["id"]}"><span>{esc(t["name"])}{small}</span></label>'
    return f'''<div class="panel-wrap osheet" id="osheet" role="dialog" aria-modal="true" aria-labelledby="os-h" aria-hidden="true" data-osheet>
  <div class="panel-card">
    <div class="panel-top"><h2 id="os-h" data-os-name data-no-i18n>Order</h2><button type="button" class="pill icon-pill" data-os-close aria-label="Close">{ico("x")}</button></div>
    <p class="os-base"><span class="label" data-os-group data-no-i18n></span><span class="os-bp" data-os-base data-no-i18n></span></p>
    <form class="os-form" data-os-form novalidate>
      <fieldset class="os-f" data-os-tiers hidden><legend class="label">{ico("layers")} Style</legend><div class="chips" data-os-tier-list data-no-i18n></div></fieldset>
      <label class="fld" data-os-len hidden><span>Length (min:sec)</span><select name="units" data-os-units data-no-i18n></select></label>
      <fieldset class="os-f"><legend class="label">{ico("clock")} When do you need it?</legend><div class="chips">{chips}</div></fieldset>
      <label class="fld"><span>What do you need? *</span><textarea name="brief" rows="5" maxlength="3000" placeholder="Links to footage or examples, the style you like, where it will be posted…"></textarea></label>
      <label class="fld"><span>WhatsApp number (optional)</span><input name="phone" type="tel" autocomplete="tel" inputmode="tel" dir="ltr" maxlength="24"></label>
      <div class="summary os-sum" aria-live="polite"><p class="label">{ico("check")} <span data-os-total-k data-no-i18n>Price</span></p><p class="os-total" data-os-total data-no-i18n></p><p class="mini os-how" data-os-how data-no-i18n></p></div>
      <p class="form-status" role="status" aria-live="polite" data-os-status></p>
      <button type="submit" class="btn btn--solid os-go" data-os-submit><span data-os-submit-t data-no-i18n>Send request</span></button>
      <p class="mini muted" data-os-out hidden>You need to sign in to order. What you typed here is kept.</p>
    </form>
    <div class="os-done" data-os-done hidden>
      <p class="h-m" data-os-done-h data-no-i18n></p>
      <p data-os-done-p data-no-i18n></p>
      <div class="m-links"><a class="btn btn--solid" data-os-see href="account.html">{ico("shopping-bag")} See your order</a><button type="button" class="btn" data-os-close>Close</button></div>
    </div>
  </div>
</div>
'''

def build_services():
    items = CATD["items"]
    cards = ""
    for gid, gname, icon in CAT.GROUPS:
        rows = "".join(svc_row(iid, items[iid]) for iid in CATD["order"] if items[iid]["g"] == gid)
        cards += (f'<li class="svc rv"><span class="svc-i">{ico(icon)}</span><h2>{esc(gname)}</h2><ul class="svc-l">{rows}</ul>'
                  f'<a class="btn btn--small" href="order.html?want={gid}">{ico("shopping-bag")} Custom order</a></li>')
    timing = [("ASAP", "×2", "Double the price."), ("1 week", "×1–1.5", "I confirm the price: the base price or up to ×1.5."),
              ("2–4 weeks", "−5%", "5% off."), ("Flexible", "?", "We agree on it together.")]
    thtml = "".join(f'<li class="rv"><span class="tmg-x" data-no-i18n>{x}</span><h3>{t}</h3><p>{d}</p></li>' for t, x, d in timing)
    steps = [("message-circle", "Brief", "Goal, audience, deadline."), ("pen-tool", "Board", "References + direction."), ("zap", "Build", "Progress + 2 revisions."), ("send", "Deliver", "Final files + project files.")]
    shtml = "".join(f'<div class="rv"><span class="st-i">{ico(i)}</span><p class="label">Step {k+1}</p><h3>{t}</h3><p>{d}</p></div>' for k, (i, t, d) in enumerate(steps))
    body = page_head("VI", "Side quests", "Side quests <em>welcome.</em>", "A few freelance projects alongside my studies.", "sparkles")
    body += f'''<section class="wrap" style="padding-bottom:clamp(32px,5vw,72px)"><p class="mini muted svc-hint">{ico("mouse-pointer-click")} Tap a service to order it.</p><ul class="svcs">{cards}</ul></section>
<section class="wrap section cv" style="padding-top:0">
  <div class="s-head"><p class="label">{ico("clock")} Timing</p><h2 class="h-l split-words">The deadline sets the price.</h2></div>
  <ul class="tmg">{thtml}</ul>
  <ul class="svc-notes">
    <li>{ico("check")} <span>Prices are in Indian rupees (₹).</span></li>
    <li>{ico("check")} <span>Single-price services with ASAP or 2–4 weeks: order and pay at once.</span></li>
    <li>{ico("check")} <span>Everything else: send a request, I reply with the final price, and you pay only after that.</span></li>
    <li>{ico("check")} <span>Big projects can be paid in parts: an advance, then milestones.</span></li>
  </ul>
</section>
<section class="wrap section cv" style="padding-top:0">
  <div class="s-head"><p class="label">{ico("layers")} How it works</p><h2 class="h-l split-words">Four steps. No surprises.</h2></div>
  <div class="steps">{shtml}</div>
</section>
<section class="wrap section cv" style="padding-top:0">
  <ul class="quests">
    <li class="rv">{ico("code-xml")}<h3>Design + code</h3><p>What you approve is what ships.</p></li>
    <li class="rv">{ico("clock")}<h3>Obsessed with timing</h3><p>I sweat the frames.</p></li>
    <li class="rv">{ico("check")}<h3>Honest</h3><p>Clear timelines, clear limits.</p></li>
  </ul>
</section>
''' + epilogue("", "Let’s make something <em>worth watching</em>.")
    page("services.html", "Services", "Prices and ordering: video editing, motion graphics, Blender 3D, design, web, games, simulation and robotics by THE AAMIR SHEIKH. Chapter VI.", body,
         scripts=("catalog.js",), extra=order_sheet())

# ================================================================= ORDER + FEEDBACK
def build_order():
    groups = ""
    items = CATD["items"]
    for gid, gname, icon in CAT.GROUPS:
        chips = "".join(f'<label class="chip"><input type="checkbox" name="svc" value="{esc(gname)} → {esc(items[i]["name"])}" data-id="{i}" data-group="{gid}"><span>{esc(items[i]["name"])}</span></label>'
                        for i in CATD["order"] if items[i]["g"] == gid)
        groups += f'<fieldset class="og" data-group-box="{gid}"><legend>{ico(icon)} {esc(gname)}</legend><div class="chips">{chips}</div></fieldset>'
    likes = "".join(f'<label class="chip chip--img"><input type="checkbox" name="like" value="{esc(c[1])}" data-slug="{c[0]}"><span><img src="{M}{c[0]}.webp" alt="" loading="lazy" width="160" height="90">{esc(c[1])}</span></label>' for c in CLIPS + CLIPS2)
    budget = "".join(f'<label class="chip"><input type="radio" name="budget" value="{b}"><span>{b}</span></label>' for b in ["Under ₹2k", "₹2k–5k", "₹5k–15k", "₹15k+", "Let’s talk"])
    when = "".join(f'<label class="chip"><input type="radio" name="when" value="{b}"><span>{b}</span></label>' for b in ["ASAP", "1 week", "2–4 weeks", "Flexible"])
    stars = "".join(f'<label class="star"><input type="radio" name="rating" value="{n}"><span aria-hidden="true">{ico("star")}</span><span class="sr">{n} star{"s" if n > 1 else ""}</span></label>' for n in range(1, 6))
    fb_like = "".join(f'<label class="chip"><input type="checkbox" name="liked" value="{b}"><span>{b}</span></label>' for b in ["Design", "Videos", "Music", "Interfaces", "Accessibility", "Speed", "Story"])
    acct_btn = '\n  <button type="submit" class="btn" data-send="account">' + ico("user-round") + ' Send to my account</button>'
    status_p = '<p class="form-status" role="status" aria-live="polite"></p>'
    send_btns = lambda kind: f'''<div class="send-row">
  <button type="submit" class="btn btn--solid" data-send="whatsapp">{ico("message-circle")} Send on WhatsApp</button>
  <button type="submit" class="btn" data-send="email">{ico("mail")} Send to Gmail</button>{acct_btn if kind == "order" else ""}
</div>
{"" if kind == "order" else status_p}'''
    body = page_head("VII", "Order &amp; feedback", "Pick it. <em>Send it.</em>", "Tap what you want. It arrives on my WhatsApp and Gmail, neatly formatted.", "shopping-bag")
    body += f'''<section class="wrap" style="padding-bottom:clamp(48px,8vw,120px)">
  <div class="tabs" role="tablist" aria-label="Form type">
    <button role="tab" id="tab-order" aria-controls="p-order" aria-selected="true" type="button">{ico("shopping-bag")} Order</button>
    <button role="tab" id="tab-fb" aria-controls="feedback" aria-selected="false" tabindex="-1" type="button">{ico("star")} Feedback</button>
  </div>

  <form class="oform" id="p-order" role="tabpanel" aria-labelledby="tab-order" data-form="order" novalidate>
    <ol class="wiz-steps" aria-label="Steps">
      <li><button type="button" data-wiz-to="1" aria-current="step"><b>1</b><span>Service</span></button></li>
      <li><button type="button" data-wiz-to="2"><b>2</b><span>Details</span></button></li>
      <li><button type="button" data-wiz-to="3"><b>3</b><span>Review and send</span></button></li>
    </ol>
    <div class="wiz-p" data-wiz="1">
      <div class="step-h"><b>1</b><h2 tabindex="-1">What do you want?</h2><p class="mini muted">Pick as many as you like.</p></div>
      <div class="ogs">{groups}</div>
      <div class="step-h step-h--sub"><h3>Like any of these?</h3><p class="mini muted">Optional — tap a film you want something similar to.</p></div>
      <div class="chips chips--img">{likes}</div>
      <div class="wiz-nav"><button type="button" class="btn btn--solid" data-wiz-next>Next {ico("arrow-right")}</button></div>
    </div>
    <div class="wiz-p" data-wiz="2">
      <div class="step-h"><b>2</b><h2 tabindex="-1">Budget, timing and you</h2></div>
      <fieldset class="og"><legend>{ico("shopping-bag")} Budget</legend><div class="chips">{budget}</div></fieldset>
      <fieldset class="og"><legend>{ico("clock")} When</legend><div class="chips">{when}</div></fieldset>
      <div class="fields">
        <label class="fld"><span>Name *</span><input name="name" autocomplete="name" required></label>
        <label class="fld"><span>Phone or email *</span><input name="contact" autocomplete="email" required></label>
        <label class="fld wide"><span>Anything else?</span><textarea name="details" rows="4" placeholder="Links, ideas, deadline…"></textarea></label>
      </div>
      <div class="wiz-nav"><button type="button" class="btn" data-wiz-back>{ico("arrow-left")} Back</button><button type="button" class="btn btn--solid" data-wiz-next>Next {ico("arrow-right")}</button></div>
    </div>
    <div class="wiz-p" data-wiz="3">
      <div class="step-h"><b>3</b><h2 tabindex="-1">Check it, then send it</h2></div>
      <div class="summary" aria-live="polite"><p class="label">{ico("check")} Your order</p><pre data-summary>Nothing picked yet.</pre></div>
      {send_btns("order")}
      <p class="mini muted wiz-prv">{ico("shield-check")} Your details go only to me: on WhatsApp, in Gmail or in your account here. <a class="link" href="privacy.html">How I handle your data</a></p>
      <div class="wiz-nav"><button type="button" class="btn" data-wiz-back>{ico("arrow-left")} Back</button></div>
    </div>
    {status_p}
  </form>

  <form class="oform" id="feedback" role="tabpanel" aria-labelledby="tab-fb" data-form="feedback" hidden novalidate>
    <div class="step-h"><b>1</b><h2>How was it?</h2></div>
    <fieldset class="stars"><legend class="sr">Rating out of 5</legend>{stars}</fieldset>
    <div class="step-h"><b>2</b><h2>What did you like?</h2></div>
    <div class="chips">{fb_like}</div>
    <div class="step-h"><b>3</b><h2>Tell me more</h2></div>
    <div class="fields">
      <label class="fld wide"><span>What should I improve?</span><textarea name="details" rows="4"></textarea></label>
      <label class="fld"><span>Name (optional)</span><input name="name" autocomplete="name"></label>
      <label class="fld"><span>Contact (optional)</span><input name="contact" autocomplete="email"></label>
    </div>
    <div class="summary" aria-live="polite"><p class="label">{ico("check")} Your feedback</p><pre data-summary>…</pre></div>
    {send_btns("feedback")}
  </form>
  <p class="mini muted mt-m">WhatsApp opens with your message ready — just press send. Gmail sends straight from this page.</p>
  <p class="mini muted">“Send to my account” saves the order to your account, so I can send you a price and a pay link.</p>
</section>''' + chapter_nav("order.html", "")
    page("order.html", "Order & Feedback", "Order video edits, motion graphics, 3D, design, web, games or robotics from THE AAMIR SHEIKH — or leave feedback. Sent to WhatsApp and Gmail.", body, scripts=("catalog.js",))

# ================================================================= CREDITS
CREDITS_MUSIC = [
    ("Electric Guitar (Riot)", "Strong Character — LightStockMusic", "https://pixabay.com/music/main-title-strong-character-powerful-fuzz-action-sport-rock-513742/"),
    ("Smooth Jazz (Noir)", "Smooth Instrumental Jazz Music — Tunetank", "https://pixabay.com/music/vintage-smooth-instrumental-jazz-music-349777/"),
    ("Ambient Village (Village)", "Village ambient textures, soft cowbells — DesiFreeMusic", "https://pixabay.com/music/ambient-village-ambient-textures-soft-cowbells-377886/"),
]

def build_credits():
    photos = json.load(open(os.path.join(ROOT, "_build", "photo_credits.json"))) if os.path.exists(os.path.join(ROOT, "_build", "photo_credits.json")) else {}
    mus = "".join(f'<li>{ico("disc-3")} <b>{a}</b> — <a class="link" href="{u}" target="_blank" rel="noopener">{esc(t)}</a> (Pixabay Content License)</li>' for a, t, u in CREDITS_MUSIC)
    ph = "".join(f'<li><a class="link" href="https://unsplash.com/photos/{v}" target="_blank" rel="noopener">{esc(k)}</a></li>' for k, v in photos.items())
    body = page_head("✦", "Credits", "Thank <em>you.</em>", "Free, properly licensed resources used on this site.", "award")
    body += f'''<section class="wrap" style="padding-bottom:clamp(48px,8vw,120px)">
  <div class="kit">
    <div><p class="label">{ico("headphones")} Music</p><ul class="credit-l">{mus}</ul></div>
    <div><p class="label">{ico("image")} Photos — Unsplash License</p><ul class="credit-l cols">{ph}</ul></div>
    <div><p class="label">{ico("sparkles")} Also</p><ul class="credit-l"><li>Icons: Lucide (ISC)</li><li>Fonts: Anton, Instrument Serif, Space Grotesk, Caveat (Google Fonts, OFL)</li><li>Video player: hls.js (Apache-2.0)</li><li>Sound effects: synthesised live in your browser</li><li>Drift footage © 19Bozzy92</li></ul></div>
  </div>
</section>'''
    page("credits.html", "Credits", "Music, photo, icon and font credits for theaamirsheikh.com.", body, current="credits.html")

# ================================================================= PRIVACY (step 6)
# Plain words for what the site keeps. Keep it true: when the code starts keeping something new, say so here
# and change PRIVACY_UPDATED. The text is translated in _build/i18n_privacy.py.
PRIVACY_UPDATED = ("2026-11-12", "12 Nov 2026")
PRIVACY = [
    ("user-round", "Who looks after your data", [
        "THE AAMIR SHEIKH, Tezpur, Assam, India.",
        "For any question or request about your data, write to:",
    ], "mail"),
    ("globe", "Browsing without an account", [
        "Your settings (interface, language, music, accessibility) are saved in your own browser, not on my server.",
        "Fonts come from Google Fonts, so your browser asks Google for them.",
        "Cloudflare hosts the site and handles every visit. It may keep short technical logs to keep the site safe.",
        "No analytics, no tracking, no ads.",
    ], None),
    ("lock", "When you sign in", [
        "Your email address. With Google sign-in, also your name and your Google account ID. No password: there isn’t one.",
        "A sign-in cookie that keeps you signed in for 30 days. You can sign out any time.",
        "A sign-in history: time, method, country, browser and a scrambled form of your IP address. It stops abuse and is deleted after 90 days.",
        "Email codes are stored only in scrambled form and stop working after 10 minutes.",
    ], None),
    ("shopping-bag", "When you order and pay", [
        "What you ordered, your brief, the timing and the price, and your WhatsApp number if you give it.",
        "UPI payments go straight from your UPI app to my account. This site never sees your bank details or UPI PIN. It keeps the amount, the date and the 12-digit UPI reference you type in.",
        "I use these only to do the work, send you prices and receipts, and keep my accounts.",
    ], None),
    ("message-circle", "The order form and feedback", [
        "“Send on WhatsApp” opens WhatsApp with your message, and “Send to Gmail” sends it through FormSubmit to my Gmail. Their own privacy rules apply.",
    ], None),
    ("users", "Who else handles it", [
        "Cloudflare: hosting, the database and the “are you human” check.",
        "Google: sign-in with Google, and fonts.",
        "Resend: sends the site’s emails (codes, prices, receipts).",
        "WhatsApp and FormSubmit: only if you use those buttons.",
        "I never sell your data or share it for advertising.",
    ], None),
    ("check", "Cookies", [
        "Only what sign-in needs: the sign-in cookie, a small cookie that tells the menu you are signed in, and a short-lived one during Google sign-in. No tracking or advertising cookies.",
    ], None),
    ("clock", "How long I keep it", [
        "Your account: until you ask me to delete it.",
        "Sign-in history: 90 days.",
        "Orders and payments: kept for my accounts. When your account is deleted, your name, email, WhatsApp number and briefs are removed, and only order numbers, services, amounts, dates and UPI references stay.",
    ], None),
    ("shield-check", "Your choices", [
        "See your orders any time on your account page.",
        "Ask me by email for a copy of your data, or to correct it.",
        "Ask to delete your data from your account page, or by email. I delete it within 30 days and confirm by email.",
    ], "account"),
]

def build_privacy():
    secs = ""
    for icon, heading, lines, extra in PRIVACY:
        items = "".join(f"<li>{esc(l)}</li>" for l in lines)
        more = ""
        if extra == "mail":
            more = f'<p class="prv-mail"><a class="link" href="mailto:{EMAIL}?subject=Privacy" data-no-i18n dir="ltr">{EMAIL}</a></p>'
        elif extra == "account":
            more = f'<p class="m-links"><a class="btn btn--small" href="account.html">{ico("user-round")} Your account</a></p>'
        secs += f'<section class="prv-s rv"><h2 class="prv-h">{ico(icon)} {esc(heading)}</h2><ul class="prv-l">{items}</ul>{more}</section>'
    body = page_head("✦", "Privacy", "Your data, <em>plainly.</em>", "What this site keeps about you, why, and how to have it deleted.", "shield-check")
    body += f'''<section class="wrap prv" style="padding-bottom:clamp(48px,8vw,120px)">
  {secs}
  <p class="mini muted prv-foot">Last updated: <time datetime="{PRIVACY_UPDATED[0]}" data-fmt-date data-no-i18n>{PRIVACY_UPDATED[1]}</time></p>
  <p class="mini muted">This page is translated from English. If a translation differs, the English text applies.</p>
</section>'''
    page("privacy.html", "Privacy", "What theaamirsheikh.com keeps about you, why, and how to have it deleted.", body, current="privacy.html")

# ================================================================= ACCOUNT + SIGN-IN
# Google's "G" mark, unaltered, as its sign-in branding guidelines require.
G_LOGO = ('<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true" focusable="false">'
          '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>'
          '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>'
          '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>'
          '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>')

def build_account():
    """Sign in (Google or a code by email) and, once signed in, the visitor's own orders.
    The page is one shell with four views; main.js shows the right one after asking /api/auth/me."""
    body = page_head("✦", "Account", "Your <em>account.</em>", "Sign in to order, and to see your orders in one place.", "user-round")
    body += f'''<section class="wrap acct" data-acct style="padding-bottom:clamp(48px,8vw,120px)">
  <noscript><p class="lead">Sign-in needs JavaScript.</p></noscript>
  <p class="form-status acct-status" role="status" aria-live="polite" data-acct-status></p>

  <div class="acct-card" data-view="wait"><p class="label">{ico("clock")} Checking…</p></div>

  <div class="acct-card" data-view="off" hidden><p>Sign-in is not switched on yet. Please come back soon.</p></div>

  <div class="acct-card" data-view="out" hidden>
    <a class="btn g-btn" href="/api/auth/google/start" data-google hidden>{G_LOGO}<span>Continue with Google</span></a>
    <p class="label acct-or" data-or hidden><span>or</span></p>
    <form class="acct-form" data-email-form novalidate hidden>
      <label class="fld"><span>Your email</span><input type="email" name="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" dir="ltr" required></label>
      <div class="acct-ts" data-ts></div>
      <button type="submit" class="btn btn--solid">{ico("mail")} Email me a code</button>
      <p class="mini muted">No password. I email you a 6-digit code that works for 10 minutes.</p>
    </form>
    <form class="acct-form" data-code-form novalidate hidden>
      <label class="fld"><span>Enter the 6-digit code</span><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]*" maxlength="7" dir="ltr" required></label>
      <button type="submit" class="btn btn--solid">{ico("check")} Sign in</button>
      <button type="button" class="btn btn--ghost btn--small" data-code-back>Use a different email or send a new code</button>
    </form>
    <p class="mini muted acct-prv">{ico("shield-check")} <a class="link" href="privacy.html">How I handle your data</a></p>
  </div>

  <div class="acct-card" data-view="in" hidden>
    <div>
      <p class="label">{ico("user-round")} Signed in as</p>
      <p class="h-m acct-name" data-user-name data-no-i18n></p>
      <p class="muted acct-mail" data-user-email data-no-i18n hidden></p>
    </div>
    <div>
      <p class="label">{ico("shopping-bag")} Your orders</p>
      <ul class="acct-list" data-orders data-no-i18n></ul>
      <p class="muted mt-s" data-orders-none hidden>No orders yet.</p>
    </div>
    <div class="m-links">
      <a class="btn btn--solid" href="order.html">{ico("shopping-bag")} Place an order</a>
      <a class="btn" href="admin.html" data-admin-link hidden>{ico("lock")} Admin</a>
      <button type="button" class="btn" data-signout>Sign out</button>
    </div>
    <div class="acct-del" data-del-box>
      <p class="label">{ico("shield-check")} Your data</p>
      <p class="mini muted">What I keep about you, and why: <a class="link" href="privacy.html">Privacy</a></p>
      <p class="mini acct-del-state" data-del-state data-no-i18n hidden></p>
      <div class="m-links">
        <button type="button" class="btn btn--small btn--ghost" data-del-ask>{ico("trash-2")} <span data-del-ask-t data-no-i18n>Ask to delete my data</span></button>
        <button type="button" class="btn btn--small" data-del-keep hidden><span>Keep my account</span></button>
      </div>
    </div>
  </div>

  <div class="acct-card ao" data-view="order" hidden>
    <a class="link mini ao-back" href="account.html" data-o-back>{ico("arrow-right", "flip")} All orders</a>
    <div class="ao-head"><p class="label" data-o-ref data-no-i18n></p><span class="o-s" data-o-status data-no-i18n></span></div>
    <h2 class="h-m ao-name" data-o-name data-no-i18n></h2>
    <dl class="ao-dl" data-o-facts data-no-i18n></dl>
    <div class="summary ao-pay" data-o-pay hidden>
      <p class="label">{ico("credit-card")} Amount due now</p>
      <p class="os-total" data-o-due data-no-i18n></p>
      <p class="mini muted" data-o-part data-no-i18n hidden></p>
      <div class="ao-upi" data-o-upi hidden>
        <div class="ao-phone">
          <a class="btn btn--solid ao-paybtn" data-o-paylink href="#">{ico("smartphone")} Pay with a UPI app</a>
          <p class="ao-apps mini"><span>Or open:</span> <a class="link" data-o-app="gpay" href="#" data-no-i18n>Google Pay</a> · <a class="link" data-o-app="phonepe" href="#" data-no-i18n>PhonePe</a> · <a class="link" data-o-app="paytm" href="#" data-no-i18n>Paytm</a></p>
        </div>
        <div class="ao-desk">
          <div class="ao-qr" data-o-qr></div>
          <p class="mini">Scan with any UPI app on your phone.</p>
        </div>
        <dl class="ao-dl ao-upi-dl">
          <dt>UPI ID</dt><dd><span data-o-vpa data-no-i18n dir="ltr"></span> <button type="button" class="btn btn--small btn--ghost ao-copy" data-o-copy>{ico("copy")} <span data-o-copy-t data-no-i18n>Copy</span></button></dd>
          <dt>Name</dt><dd data-o-payee data-no-i18n></dd>
          <dt>Payment note</dt><dd data-o-note data-no-i18n dir="ltr"></dd>
        </dl>
        <details class="ao-more" data-o-more><summary>If the payment fails</summary>
          <p class="mini">Some apps block payments opened from a website. Scan the QR code from another phone, or pay by hand: open your UPI app, choose “Pay UPI ID”, and use one of these IDs with the same amount and note.</p>
          <ul class="ao-backups" data-o-backups data-no-i18n></ul>
        </details>
        <form class="acct-form ao-ref" data-o-ref-form novalidate>
          <label class="fld"><span>After paying: the 12-digit UPI reference</span><input name="utr" inputmode="numeric" autocomplete="off" maxlength="16" dir="ltr" placeholder="123456789012"></label>
          <p class="mini muted">Your UPI app shows it on the receipt, as “UPI transaction ID”, “UPI Ref No.” or “UTR”.</p>
          <button type="submit" class="btn btn--solid">{ico("check")} I’ve paid: send the reference</button>
        </form>
      </div>
      <p class="mini muted" data-o-upi-off hidden>UPI payment is not switched on yet. Please come back soon.</p>
      <p class="ao-checking" data-o-checking data-no-i18n hidden></p>
    </div>
    <div data-o-plan-box hidden><p class="label">{ico("layers")} Payment plan</p><ul class="acct-list ao-plan" data-o-plan data-no-i18n></ul></div>
    <p class="ao-state" data-o-state data-no-i18n></p>
    <div data-o-brief-box hidden><p class="label">{ico("square-pen")} Your brief</p><p class="ao-brief" data-o-brief data-no-i18n dir="auto"></p></div>
    <div class="m-links"><button type="button" class="btn btn--ghost btn--small" data-o-cancel hidden><span data-o-cancel-t data-no-i18n>Cancel this order</span></button></div>
  </div>
</section>'''
    page("account.html", "Account", "Sign in to THE AAMIR SHEIKH to place orders and see them in one place.", body, current="account.html", noindex=True, scripts=("catalog.js", "qr.js"))

# ================================================================= ADMIN (owner only)
def build_admin():
    """Owner-only lists of users, orders and payments, with search and CSV export.
    The HTML holds no data: main.js asks /api/admin/* and the server refuses anyone but ADMIN_EMAIL."""
    tabs = "".join(f'<button type="button" data-tab="{k}" aria-pressed="{"true" if k == "users" else "false"}">{ico(i)} {t} <span class="adm-n" data-count="{k}"></span></button>'
                   for k, i, t in [("users", "users", "Users"), ("orders", "shopping-bag", "Orders"), ("payments", "credit-card", "Payments"), ("deletions", "trash-2", "Deletions")])
    body = page_head("✦", "Admin", "The <em>back office.</em>", "Only you can see this page: everyone who signed up, every order and every payment.", "lock")
    body += f'''<section class="wrap acct adm" data-adm style="padding-bottom:clamp(48px,8vw,120px)">
  <noscript><p class="lead">This page needs JavaScript.</p></noscript>
  <p class="form-status acct-status" role="status" aria-live="polite" data-adm-status></p>
  <div class="acct-card" data-view="wait"><p class="label">{ico("clock")} Checking…</p></div>
  <div class="acct-card" data-view="out" hidden><p>Sign in first.</p><a class="btn btn--solid" href="account.html?next=/admin.html">{ico("user-round")} Sign in</a></div>
  <div class="acct-card" data-view="no" hidden><p>This page is only for the site owner.</p></div>
  <div class="adm-in" data-view="in" hidden>
    <div class="tabs adm-tabs">{tabs}</div>
    <div class="adm-bar">
      <label class="fld adm-q"><span class="sr">Search</span>{ico("search")}<input type="search" name="q" placeholder="Search" autocomplete="off" spellcheck="false" data-adm-q></label>
      <a class="btn btn--small" href="/api/admin/users?format=csv" data-csv download>{ico("download")} Download CSV</a>
    </div>
    <p class="mini muted" data-adm-shown></p>
    <div class="adm-scroll" tabindex="0" role="region" aria-label="Users" data-adm-region><table class="adm-t" data-no-i18n><thead><tr></tr></thead><tbody></tbody></table></div>
    <p class="muted" data-adm-empty hidden></p>
  </div>
</section>'''
    drawer = f'''<div class="panel-wrap adm-drawer" id="adm-order" role="dialog" aria-modal="true" aria-labelledby="ad-h" aria-hidden="true" data-adm-order>
  <div class="panel-card">
    <div class="panel-top"><h2 id="ad-h" data-ad-ref data-no-i18n>Order</h2><button type="button" class="pill icon-pill" data-ad-close aria-label="Close">{ico("x")}</button></div>
    <p class="form-status acct-status" role="status" aria-live="polite" data-ad-status></p>
    <div class="ad-body" data-ad-body hidden>
      <section><p class="label">{ico("shopping-bag")} <span data-ad-st data-no-i18n></span></p><p class="h-m ao-name" data-ad-name data-no-i18n></p><dl class="ao-dl" data-ad-facts data-no-i18n></dl></section>
      <section><p class="label">{ico("user-round")} Customer</p><p class="ad-cust" data-ad-cust data-no-i18n></p></section>
      <section><p class="label">{ico("square-pen")} Brief</p><p class="ao-brief" data-ad-brief data-no-i18n dir="auto"></p></section>
      <section class="ad-price" data-ad-price hidden>
        <h3 class="label">{ico("credit-card")} Set the price</h3>
        <div class="ad-quick" data-ad-quick data-no-i18n></div>
        <label class="fld"><span>Price (₹)</span><input type="number" min="0" step="1" inputmode="numeric" dir="ltr" data-ad-total></label>
        <p class="mini">Split it into parts</p>
        <div class="ad-quick" data-ad-splits>
          <button type="button" class="btn btn--small" data-split="100">One payment</button>
          <button type="button" class="btn btn--small" data-split="50,50">50 / 50</button>
          <button type="button" class="btn btn--small" data-split="30,40,30">30 / 40 / 30</button>
          <button type="button" class="btn btn--small" data-split="lakh">Up to ₹1 lakh each</button>
        </div>
        <ol class="ad-parts" data-ad-parts></ol>
        <p class="mini" data-ad-sum data-no-i18n></p>
        <p class="mini ad-warn" data-ad-warn hidden>UPI apps usually allow about ₹1 lakh a day. Keep each part at or under that.</p>
        <button type="button" class="btn btn--solid" data-ad-send><span data-ad-send-t data-no-i18n>Send the price</span></button>
      </section>
      <section data-ad-plan-box hidden><p class="label">{ico("layers")} Payment plan</p><ul class="acct-list ao-plan" data-ad-plan data-no-i18n></ul>
        <div class="m-links"><button type="button" class="btn btn--small" data-ad-next hidden>Ask for the next part</button>
        <button type="button" class="btn btn--small" data-ad-resend hidden>Email the pay link again</button></div></section>
      <section class="ad-pays" data-ad-pays hidden><p class="label">{ico("credit-card")} Payments</p><ul class="ad-paylist" data-ad-paylist data-no-i18n></ul></section>
      <section data-ad-markpaid hidden><p class="label">{ico("check")} Paid some other way?</p>
        <label class="fld"><span>UPI reference (optional)</span><input inputmode="numeric" maxlength="16" dir="ltr" autocomplete="off" data-ad-mp-ref></label>
        <button type="button" class="btn btn--small" data-ad-mp><span data-ad-mp-t data-no-i18n>Mark this part paid</span></button></section>
      <section data-ad-moves hidden><p class="label">{ico("sliders-horizontal")} Status</p><div class="m-links" data-ad-move-btns data-no-i18n></div></section>
      <section><label class="fld"><span>Private note</span><textarea rows="3" maxlength="2000" data-ad-note></textarea></label>
        <p class="mini muted">Only you see this note.</p><button type="button" class="btn btn--small" data-ad-save-note>Save note</button></section>
      <section><p class="label">{ico("clock")} History</p><ul class="ad-hist" data-ad-hist data-no-i18n></ul></section>
    </div>
  </div>
</div>
'''
    page("admin.html", "Admin", "Owner-only admin page.", body, current="admin.html", noindex=True, scripts=("catalog.js",), extra=drawer)

# ================================================================= 404
# ---------------------------------------------------------------- lighthouse game (404 + play.html)
LH_WORKS = [
    # title, kind, image, link (into Work)
    ("Money Follows", "Vertical ad · 4K", M + "money-follows.webp", "projects.html#reel"),
    ("Liquid Death — spec", "Motion graphics", M + "liquid-death.webp", "projects.html#reel"),
    ("Sundown Trail", "Game · in development", "assets/img/sundown-trail-pause.webp", "projects.html#sundown-trail"),
    ("Blender Studies", "3D · lighting", B + "blender-2.webp", "projects.html#blender"),
    ("Echo Balancer", "Robotics · eYRC", "assets/img/art-echo.webp", "projects.html#echo-balancer"),
    ("Smart Bin", "IoT · SIH 2026", "assets/img/art-bin.webp", "projects.html#smart-bin"),
]

LH_TOWER = """<svg class="lh-tower" viewBox="0 0 120 300" aria-hidden="true" focusable="false">
<path d="M0 300V279Q14 262 30 270Q44 254 62 266Q80 252 96 268Q110 262 120 276V300Z" fill="#131720"/>
<path d="M40 272 48 112H72L80 272Z" fill="#2a2e3a"/>
<path class="lh-stripe" d="M45.2 168 46.5 142H73.5L74.8 168Z"/><path class="lh-stripe" d="M42.3 226 43.6 200H76.4L77.7 226Z"/>
<path d="M56 272V258Q60 251 64 258V272Z" fill="#0e1118"/>
<rect x="42" y="104" width="36" height="8" fill="#1d212b"/>
<path d="M42 104V96M51 104V96M60 104V96M69 104V96M78 104V96M42 96H78" stroke="#3b404e" stroke-width="1.6" fill="none"/>
<rect x="49" y="74" width="22" height="30" fill="#1a1d26"/><rect x="52" y="78" width="16" height="22" fill="#ffe6a6" opacity=".85"/>
<circle class="lh-lamp" cx="60" cy="89" r="6"/>
<path d="M46 76Q60 56 74 76Z" fill="#2a2e3a"/><path d="M60 61V50" stroke="#3b404e" stroke-width="2"/>
</svg>"""

def build_game(path, p):
    lost = path == "404.html"
    works = [{"t": t, "k": k, "img": p + img, "href": p + href} for t, k, img, href in LH_WORKS]
    if lost:
        intro_html = f'''<p class="label">{ico("skull")} Error 404</p>
      <h1 class="h-xl">Lost from the pack.</h1>
      <p class="lead">This page got cut in the edit.</p>
      <p class="lead">The lighthouse is on. Find the 6 hidden works in the dark.</p>'''
    else:
        intro_html = f'''<p class="label">{ico("lighthouse")} Side quest</p>
      <h1 class="h-xl">The lighthouse.</h1>
      <p class="lead">Six of my works are hidden in the dark. You have 45 seconds.</p>'''
    body = f'''<section class="wrap lh" data-lh data-works=\'{esc(json.dumps(works, ensure_ascii=False))}\'>
  <div class="lh-stage" data-lh-stage tabindex="0" role="group" aria-label="Lighthouse game" aria-describedby="lh-help">
    <div class="lh-sea" aria-hidden="true"></div>
    <div class="lh-works" aria-hidden="true"></div>
    <div class="lh-dark" aria-hidden="true"></div>
    <div class="lh-glow" aria-hidden="true"></div>
    <svg class="lh-beam" aria-hidden="true" focusable="false"><defs><linearGradient id="lh-g" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffe2a0" stop-opacity=".42"/><stop offset="1" stop-color="#ffe2a0" stop-opacity=".07"/></linearGradient></defs><polygon fill="url(#lh-g)" points="0,0 0,0 0,0 0,0"/></svg>
    {LH_TOWER}
    <div class="lh-glints" aria-hidden="true"></div>
    <div class="lh-hud" aria-hidden="true">
      <span class="pill" data-lh-tpill>{ico("clock")} <b data-lh-time>45.0</b></span>
      <span class="pill">{ico("eye")} <b data-lh-count>0/6</b></span>
      <span class="pill">{ico("trophy")} <span>Best</span> <b data-lh-best>—</b></span>
    </div>
    <div class="lh-panel" data-lh-card>
      <div>
      {intro_html}
      <div class="m-links">
        <button type="button" class="btn btn--solid" data-lh-start>{ico("search")} Start the search</button>
        <a class="btn" href="{p}index.html">{ico("house")} Find the pack</a>
        <a class="btn" href="{p}projects.html">{ico("clapperboard")} See all work</a>
      </div>
      <p class="mini" id="lh-help">Move the light with your mouse or finger. Hold it on a work to collect it. Keyboard: arrow keys move the light, Enter collects.</p>
      </div>
    </div>
    <div class="lh-panel" data-lh-end hidden>
      <div>
      <p class="lh-rank" aria-hidden="true"><b data-lh-rank>S</b><span data-lh-rank-w>Stylish</span></p>
      <h2 class="h-l" data-lh-end-h tabindex="-1">All 6 found!</h2>
      <p class="lead" data-lh-end-s></p>
      <ul class="lh-endlist" data-lh-endlist></ul>
      <div class="m-links">
        <button type="button" class="btn btn--solid" data-lh-start>{ico("rotate-ccw")} Play again</button>
        <a class="btn" href="{p}projects.html">{ico("clapperboard")} See all work</a>
        <a class="btn" href="{p}index.html">{ico("house")} Find the pack</a>
      </div>
      </div>
    </div>
  </div>
  <div class="lh-tray">
    <p class="label">{ico("star")} Found works</p>
    <ul data-lh-found><li class="none">Nothing found yet.</li></ul>
  </div>
</section>'''
    if lost:
        doc = (head("Lost", "Page not found. Find six hidden works in the dark with the lighthouse.", "404.html", p).replace("<title>", '<meta name="robots" content="noindex">\n<title>', 1)
               + "<body>\n" + header("", p) + pause_menu("", p) + settings_panel() + attract(p)
               + f'<main id="main" tabindex="-1">{body}</main>\n' + footer(p) + "</body>\n</html>\n")
        doc = re.sub(r"</em>([.,?!])", r"\1</em>", doc)
        with open(os.path.join(ROOT, path), "w", encoding="utf-8") as f: f.write(doc)
        print("wrote", path)
    else:
        page(path, "Lighthouse game", "A tiny side quest: move the lighthouse beam and find six of THE AAMIR SHEIKH’s works hidden in the dark.", body, current="play.html")

def build_404():
    build_game("404.html", "/")
    build_game("play.html", "")

def write_sitemap():
    pages = ["", "purpose.html", "struggles.html", "skills.html", "projects.html", "inspirations.html", "services.html", "order.html", "credits.html", "privacy.html", "play.html", "90-day-progress/"] + [f"skills/{s[0]}.html" for s in SKILLS]
    urls = "".join(f"<url><loc>{SITE}/{p}</loc></url>" for p in pages)
    open(os.path.join(ROOT, "sitemap.xml"), "w").write(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n')

def write_i18n():
    import i18n, i18n_more
    data = i18n.build_js()
    keys = [t[0] for t in i18n.T]
    missing = [k for k in keys if k not in i18n_more.M]
    if missing: print("WARNING missing es/ru/ar:", missing[:10])
    for i, code in enumerate(("es", "ru", "ar")):
        data[code] = {k: v[i] for k, v in i18n_more.M.items()}
    import i18n_cjk
    miss2 = [k for k in keys if k not in i18n_cjk.C]
    if miss2: print("WARNING missing zh/ko:", miss2[:10])
    for i, code in enumerate(("zh", "ko")):
        data[code] = {k: v[i] for k, v in i18n_cjk.C.items()}
    import i18n_p0, i18n_acct, i18n_admin, i18n_shop, i18n_privacy, i18n_polish   # v3.4, account/sign-in, admin, shop (v3.8), privacy (v3.10) and polish (v3.11) strings, all 8 languages in one row
    for row in i18n_p0.P + i18n_acct.P + i18n_admin.P + i18n_shop.P + i18n_privacy.P + i18n_polish.P:
        assert len(row) == 9, row[0]
        for code, val in zip(("de", "fr", "ja", "es", "ru", "ar", "zh", "ko"), row[1:]):
            data[code][row[0]] = val
    # v3.11: one small file per language, loaded only for that language (English needs none)
    d = os.path.join(ROOT, "assets", "js", "i18n"); os.makedirs(d, exist_ok=True)
    for code in I18N_LANGS:
        js = f"/* {code} translations. Generated by _build/build.py from the _build/i18n*.py files — do not edit. */\n" \
             f"(window.TAS_I18N=window.TAS_I18N||{{}})[{json.dumps(code)}]=" + json.dumps(data[code], ensure_ascii=False, separators=(",", ":")) + ";\n"
        open(os.path.join(d, code + ".js"), "w", encoding="utf-8").write(js)
    print("wrote assets/js/i18n/*.js", sum(len(data[c]) for c in I18N_LANGS), "strings")

if __name__ == "__main__":
    write_i18n(); write_catalog()
    build_home(); build_story(); build_struggles(); build_skills(); build_work(); build_inspirations(); build_services(); build_order(); build_credits(); build_privacy(); build_account(); build_admin(); build_404(); write_sitemap()
