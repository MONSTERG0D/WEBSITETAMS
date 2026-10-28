#!/usr/bin/env python3
"""Static page builder for theaamirsheikh.com (v2: light/dark, wolves, Blender).
Edit the content below, run `python3 _build/build.py` from the site root,
and every .html file is regenerated. (You can also edit the .html directly.)
"""
import os, html, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://theaamirsheikh.com"
EMAIL = "ak4418561@gmail.com"
GITHUB = "https://github.com/MONSTERG0D"
# Only the serif is downloaded (async, never blocks rendering). Sans + mono use the device's own fonts.
FONTS = "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap"

CHAPTERS = [
    # file, nav label, roman, title, one-liner
    ("purpose.html", "Story", "I", "Story", "Who I am and why this site exists."),
    ("struggles.html", "Struggles", "II", "Struggles", "The part of the run that usually gets cut."),
    ("skills.html", "Skills", "III", "Skills", "The tools I carry and how far along each one is."),
    ("projects.html", "Work", "IV", "Work", "Motion, 3D, games, robots and software — the missions log."),
    ("inspirations.html", "Inspirations", "V", "Inspirations", "Wolves, games, films and anime that left a mark."),
    ("services.html", "Services", "VI", "Services", "Side quests: what I can make for you."),
]
NAV_ORDER = ["projects.html", "purpose.html", "struggles.html", "skills.html", "inspirations.html", "services.html"]

def esc(s): return html.escape(s, quote=True)

# ---------------------------------------------------------------- media
M = "assets/media/"
B = "assets/img/blender/"
CLIPS = [
    # slug, title, kind, year/label, layout (v = vertical, h = half, t = third)
    ("money-follows", "Money Follows", "Vertical ad edit · 4K source", "2026", "v"),
    ("liquid-death", "Liquid Death — spec spot", "Motion graphics · spec ad", "2026", "v"),
    ("meant-to-be-felt", "Text Isn’t Just Text", "Kinetic typography", "2026", "h"),
    ("design-is-a-game", "Design Is Like a Game", "Kinetic typography", "2026", "t"),
    ("create-blue", "Create Something New", "Title design", "2026", "t"),
    ("chalamet-edit", "Chalamet — Fan Edit", "Edit · colour · rhythm", "2026", "t"),
]
CLIPS2 = [
    ("drift-grade", "Drift — Colour Grade", "Colour grading · footage © 19Bozzy92", "Grade", "h"),
    ("blind-justice", "Blind Justice", "3D motion graphics", "3D", "h"),
    ("drift-tracking", "Drift in the Rain — Tracking", "Motion tracking · footage © 19Bozzy92", "Track", "t"),
    ("coca-cola-doc", "Coca-Cola — How They Sell", "Documentary-style explainer · spec", "Doc", "t"),
    ("physics-robotics", "Physics × Robotics", "Motion graphics · glass UI", "Motion", "t"),
    ("lego-engineering", "LEGO — Engineering Passion", "Motion graphics · spec", "Motion", "t"),
    ("this-is-my", "This Is My…", "Text motion", "Type", "t"),
    ("ink-reveal", "Ink Reveal", "Animated render", "Render", "t"),
]
CLIP = {c[0]: c for c in CLIPS + CLIPS2}
BLENDER = [
    # file, caption, alt
    ("blender-2.webp", "Close-up · warm key light", "Blender render: a pink-iced donut with sprinkles on a plate beside a ceramic mug, close-up in warm light"),
    ("blender-5.webp", "Walnut table · wood shading", "Blender render: a walnut coffee table with tapered legs on a light wooden floor"),
    ("blender-1.webp", "Wide · a beam of sun", "Blender render: donut and mug on a dark concrete floor crossed by a beam of sunlight"),
    ("blender-3.webp", "Depth of field", "Blender render: donut, spoon and mug with shallow depth of field"),
    ("blender-4.webp", "Top-down · cool fill", "Blender render: top-down view of the donut and mug with blue shadows"),
]

# ---------------------------------------------------------------- the wolf (original icon, see _build/wolf_shape.py + wolf_gen.py)
import json as _json, sys as _sys
_sys.path.insert(0, os.path.join(ROOT, "_build"))
from wolf_shape import FAR as WOLF_FAR, DETAIL as WOLF_DETAIL, EYE as WOLF_EYE, smooth_path as _smooth
WOLF = _json.load(open(os.path.join(ROOT, "_build", "wolf.json")))
_wolf_n = [0]

def wolf_svg(label="A wolf howling at the moon"):
    import math
    _wolf_n[0] += 1; n = _wolf_n[0]
    arcs = ""
    cx, cy = 70, 26
    for r in (16, 28, 40):
        a1, a2 = math.radians(196), math.radians(262)
        arcs += f'<path d="M{cx + r*math.cos(a1):.1f} {cy + r*math.sin(a1):.1f} A{r} {r} 0 0 1 {cx + r*math.cos(a2):.1f} {cy + r*math.sin(a2):.1f}"/>'
    stars = "".join(f'<circle style="--d:{i*0.7:.1f}s" cx="{x}" cy="{y}" r="{r}"/>' for i, (x, y, r) in enumerate([(120,-30,1.6),(200,10,1.4),(260,40,1.8),(330,-10,1.3),(380,70,1.6),(-10,90,1.2),(30,160,1.1),(230,-34,1.2)]))
    far = "".join(f'<path d="{_smooth(f)}"/>' for f in WOLF_FAR)
    P = WOLF["parts"]
    def part(name, extra=""):
        cid = f"w{n}{name}"
        sh = "".join(f'<path style="--o:{k}" d="{d}"/>' for k, d in P[name]["shades"].items())
        return (f'<g class="{name}">{extra and ""}<clipPath id="{cid}"><path d="{P[name]["path"]}"/></clipPath>'
                f'<path class="body" d="{P[name]["path"]}"/><g class="sh" clip-path="url(#{cid})">{sh}</g>{extra}</g>')
    detail = WOLF_DETAIL
    eye = "M" + " L".join(f"{x} {y}" for x, y in WOLF_EYE) + " Z"
    return (f'<svg class="wolf" viewBox="-40 -60 440 410" role="img" aria-label="{esc(label)}">'
            f'<g class="stars">{stars}</g><circle class="moon" cx="24" cy="-18" r="22"/><g class="howl">{arcs}</g>'
            f'<path class="outline" d="{WOLF["body"]}"/>'
            f'<g class="fill"><g class="rig"><g class="far">{far}</g>'
            + part("torso", f'<path class="detail" d="{detail[0]}"/><path class="detail" d="{detail[1]}"/>')
            + part("tail", f'<path class="detail" d="{detail[2]}"/>')
            + part("head", f'<path class="eye" d="{eye}"/>')
            + f'</g></g><path class="ground" d="M110 343 H360"/></svg>')

# ---------------------------------------------------------------- project art (theme-aware)
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
<line x1="222" y1="150" x2="366" y2="150" style="stroke:var(--a-mute)" stroke-opacity=".5" stroke-dasharray="2 4"/>
<g font-family="ui-monospace, Menlo, monospace" font-size="9" style="fill:var(--a-mute)" letter-spacing=".08em">
<text x="40" y="34">ECHO BALANCER · eYRC 2026–27</text><text x="226" y="100">θ(t) → 0</text><text x="226" y="198">PID · LQR · COPPELIASIM</text><text x="40" y="258">TASK 1A · 1B · 1C</text></g></svg>'''
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
<text x="30" y="34">ARM CONTROL SUITE · SIM → REAL</text><text x="140" y="228">J1</text><text x="176" y="170">J2</text><text x="268" y="146">J3</text><text x="300" y="94">TARGET</text><text x="30" y="282">FK · IK · ARDUINO SERIAL</text></g></svg>'''
    if name == "bin":
        return '''<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Drawing of a smart bin sending LoRa signals to a route map">
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
<text x="30" y="34">SMART BIN · SIH 2026 · TEAM LUMOS</text><text x="88" y="262">FILL 82%</text><text x="214" y="70">LoRa SX1278</text><text x="326" y="138">PRIORITY</text><text x="230" y="262">ROUTE → DRIVER APP</text></g></svg>'''
    if name == "ninety":
        dots = "".join(f'<circle cx="{52 + (i % 15) * 21}" cy="{78 + (i // 15) * 25}" r="5.5"/>' for i in range(90))
        return ('<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A grid of ninety days, filled up to today" data-days-start="2026-09-23">'
                '<rect width="400" height="300" style="fill:var(--a-bg)"/>'
                f'<g class="days">{dots}</g>'
                '<g font-family="ui-monospace, Menlo, monospace" font-size="9" style="fill:var(--a-mute)" letter-spacing=".08em">'
                '<text x="52" y="44">90 DAY PROGRESS · ONE SMALL THING A DAY</text><text x="52" y="248" data-days-label>DAY — / 90</text></g></svg>')
    return ""

ART_MODE = {"echo": "art-night", "bin": "art-night", "arm": "art-day", "ninety": "art-day"}

def patch(text, num):
    return f'''<div class="patch" aria-hidden="true"><svg viewBox="0 0 100 100"><defs><path id="p{num}" d="M50 50 m-38 0 a38 38 0 1 1 76 0 a38 38 0 1 1 -76 0"/></defs><circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" stroke-opacity=".5"/><circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" stroke-opacity=".5"/><text font-family="ui-monospace, Menlo, monospace" font-size="8.4" letter-spacing="2.2" fill="currentColor"><textPath href="#p{num}">{esc(text)}</textPath></text></svg><b>{num}</b></div>'''

# ---------------------------------------------------------------- shell
THEME_SCRIPT = ("<script>(function(){var d=document.documentElement,t;try{t=localStorage.getItem('theme')}catch(e){}"
                "if(t!=='dark'&&t!=='light'){t=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}"
                "d.setAttribute('data-theme',t)})()</script>")

def head(title, desc, path, p):
    url = SITE + "/" + ("" if path == "index.html" else path)
    full = title if title.startswith("Aamir") else f"{title} — Aamir Sheikh"
    return f'''<!doctype html>
<html lang="en" class="no-js" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{THEME_SCRIPT}
<title>{esc(full)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#efebe3">
<meta name="color-scheme" content="light dark">
<meta property="og:type" content="website">
<meta property="og:site_name" content="The Aamir Sheikh">
<meta property="og:title" content="{esc(full)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/assets/img/og.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="{p}assets/img/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="{p}assets/img/apple-touch-icon.png">
<link rel="stylesheet" href="{p}assets/css/style.css">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="{FONTS}" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="{FONTS}"></noscript>
<script src="{p}assets/js/main.js" defer></script>
</head>
'''

SUN = '<svg class="sun-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>'
MOON = '<svg class="moon-i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z"/></svg>'
MARK = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="currentColor"/><path d="M18 46 L30 16 L35 28 L40 22 L46 46 Z" fill="var(--bg)"/><circle cx="46" cy="16" r="4" fill="var(--accent)"/></svg>'

def header(current, p):
    links = []
    for f in NAV_ORDER:
        c = next(c for c in CHAPTERS if c[0] == f)
        cur = ' aria-current="page"' if f == current else ""
        links.append(f'<a href="{p}{f}"{cur}>{c[1]}</a>')
    return f'''<a class="skip" href="#main">Skip to content</a>
<div class="grain" aria-hidden="true"></div>
<header class="site-head">
  <div class="wrap">
    <a class="wordmark" href="{p}index.html" aria-label="Aamir Sheikh — home">{MARK}Aamir Sheikh <small>CSE · Tezpur</small></a>
    <nav class="nav" aria-label="Primary">{"".join(links)}</nav>
    <div class="head-r">
      <button class="pill theme-btn" type="button" data-theme-toggle aria-label="Switch theme" title="Day / Night (T)">{SUN}{MOON}</button>
      <button class="pill menu-btn" type="button" aria-controls="pause" aria-expanded="false">Menu <kbd>Esc</kbd></button>
    </div>
  </div>
</header>
'''

def pause_menu(current, p):
    items = ['<li><button type="button" data-resume><span class="num">▸</span>Resume</button></li>',
             f'<li><a href="{p}index.html"{" aria-current=page" if current == "index.html" else ""}><span class="num">00</span>Home</a></li>']
    for f, label, roman, title, d in CHAPTERS:
        cur = ' aria-current="page"' if f == current else ""
        items.append(f'<li><a href="{p}{f}"{cur}><span class="num">{roman}</span>{title}</a></li>')
    items.append(f'<li><a href="{p}90-day-progress/"><span class="num">↗</span>90 Day Progress</a></li>')
    items.append('<li><button type="button" data-theme-toggle><span class="num">☾</span>Lights: <span data-theme-label>Day</span></button></li>')
    return f'''<div class="pause" id="pause" role="dialog" aria-modal="true" aria-label="Menu" aria-hidden="true">
  <div class="pause-card">
    <h2>Paused</h2>
    <ul class="pause-list">{"".join(items)}</ul>
    <div class="pause-foot"><span>↑ ↓ Select</span><span>T Lights</span><span>Esc Resume</span></div>
  </div>
</div>
<div class="player" id="player" role="dialog" aria-modal="true" aria-label="Video player" aria-hidden="true">
  <div class="player-bar"><span class="label player-title"></span><button class="player-close" type="button">Close ✕</button></div>
  <video controls playsinline preload="none"></video>
</div>
'''

def footer(p):
    pages = "".join(f'<li><a href="{p}{f}">{t}</a></li>' for f, l, r, t, d in CHAPTERS)
    return f'''<footer class="site-foot">
  <a class="cat" href="{p}inspirations.html#stray" aria-label="A small cat. It leads to the inspirations page."><svg viewBox="0 0 34 22" fill="currentColor" aria-hidden="true"><path class="tail" d="M7 19c-5 0-7-4-5-8 1-2 3-2 3 0-1 2 0 4 2 4z"/><path d="M8 21c-1-5 2-9 8-10l3-.3 2-4 1.6 3 2.4 0 1.6-3 1.4 4.3c1.6 1 2 3 1.6 4.6L28 21z"/></svg></a>
  <div class="wrap">
    <div class="grid">
      <div class="col big">
        <p class="label">The Aamir Sheikh</p>
        <p class="h-m mt-s" style="max-width:22em">A living record of the work, the struggle and the stories that shaped it. Updated whenever I level up.</p>
        <p class="mt-s"><a class="link" href="mailto:{EMAIL}">{EMAIL}</a></p>
      </div>
      <div class="col"><p class="label">Chapters</p><ul class="mt-s">{pages}</ul></div>
      <div class="col"><p class="label">Elsewhere</p><ul class="mt-s"><li><a href="{GITHUB}" rel="me noopener" target="_blank">GitHub ↗</a></li><li><a href="{p}90-day-progress/">90 Day Progress ↗</a></li><li><a href="mailto:{EMAIL}">Email</a></li><li><button type="button" data-theme-toggle class="link" style="color:var(--fg-2)">Lights: <span data-theme-label>Day</span></button></li></ul></div>
    </div>
    <div class="foot-base label">
      <span>© <span data-year>2026</span> Aamir Mehtab Sheikh</span>
      <span>Tezpur, Assam · <span data-clock>IST</span></span>
      <span>Run with the pack</span>
    </div>
    <p class="giant" aria-hidden="true">Aamir <em>Sheikh</em></p>
  </div>
</footer>
'''

def chapter_nav(current, p):
    files = [c[0] for c in CHAPTERS]
    i = files.index(current)
    prev = CHAPTERS[i - 1] if i > 0 else None
    nxt = CHAPTERS[i + 1] if i < len(CHAPTERS) - 1 else None
    out = '<section class="wrap section--tight"><ul class="index-list">'
    if nxt: out += f'<li><a href="{p}{nxt[0]}"><span class="num">{nxt[2]}</span><span class="t">Next: {nxt[3]}</span><span class="d">{nxt[4]}</span></a></li>'
    if prev: out += f'<li><a href="{p}{prev[0]}"><span class="num">{prev[2]}</span><span class="t">Back: {prev[3]}</span><span class="d">{prev[4]}</span></a></li>'
    return out + '</ul></section>'

def page(path, title, desc, body, current=None, night=False, depth=0):
    p = "../" * depth
    cls = ' class="night"' if night else ""
    doc = head(title, desc, path, p) + f"<body{cls}>\n" + header(current or path, p) + pause_menu(current or path, p) + f'<main id="main">\n{body}\n</main>\n' + footer(p) + "</body>\n</html>\n"
    doc = re.sub(r"</em>([.,?!])", r"\1</em>", doc)
    out = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f: f.write(doc)
    print("wrote", path)

def page_head(roman, chapter, h1, lead):
    return f'''<section class="wrap page-head">
  <span class="big-num" aria-hidden="true">{roman}</span>
  <div class="chapter rv"><span class="roman">{roman}</span><span class="label">Chapter {roman} — {chapter}</span></div>
  <h1 class="h-xl split-words">{h1}</h1>
  <p class="lead muted rv rv-d2">{lead}</p>
</section>'''

def epilogue(p, heading="Have something <em>worth building</em>?"):
    return f'''<section class="epilogue cv">
  <div class="wrap section">
    <div class="terminal rv"><span class="dim">&gt; INTERFACE 2026 // INCOMING TRANSMISSION</span><br>&gt; PRIORITY ONE: SAY HELLO<span class="cursor"></span></div>
    <h2 class="h-xl split-words mt-m" style="max-width:12em">{heading}</h2>
    <p class="mail mt-m rv"><a href="mailto:{EMAIL}">{EMAIL}</a></p>
    <div class="m-links mt-m rv"><a class="btn" href="{p}services.html">What I can make <span class="arr">→</span></a><a class="btn" href="{GITHUB}" target="_blank" rel="noopener">GitHub <span class="arr">↗</span></a></div>
  </div>
</section>'''

def video_tile_media(slug, full=False, p=""):
    src = p + M + slug + (".mp4" if full else "-loop.mp4")
    return f'''<div class="tile-media wipe" data-preview><img src="{p}{M}{slug}.webp" alt="" loading="lazy" decoding="async" width="1920" height="1080"><video muted loop playsinline preload="none" data-src="{src}" aria-hidden="true"></video></div>'''

def art_media(name):
    return f'<div class="tile-media wipe {ART_MODE[name]}">{art(name)}</div>'

# ================================================================= HOME
def build_home():
    reel_items = [("meant-to-be-felt", True), ("design-is-a-game", True), ("blind-justice", False), ("create-blue", True), ("drift-grade", False)]
    vids = ticks = ""
    for s, full in reel_items:
        c = CLIP[s]
        vids += f'<video muted playsinline loop preload="none" data-src="{M}{s}{".mp4" if full else "-loop.mp4"}" poster="{M}{s}.webp" data-full="{M}{s}.mp4" data-title="{esc(c[1])}" data-kind="{esc(c[2])}" aria-hidden="true"></video>'
        ticks += f'<button type="button" aria-label="Show {esc(c[1])}"></button>'
    chapters = "".join(f'<li class="rv"><a href="{f}"><span class="num">{r}</span><span class="t">{t}</span><span class="d">{d}</span></a></li>' for f, l, r, t, d in CHAPTERS)
    body = f'''<div class="intro" aria-hidden="true"><i></i><span>A Tezpur production</span><i></i></div>
<section class="wrap hero">
  <div class="hero-text">
    <div class="hero-meta label rv"><span>Aamir Mehtab Sheikh</span><span>B.Tech CSE, Tezpur University</span><span>Motion · 3D · Games · Robotics</span><span class="label--red">● Open for freelance</span></div>
    <h1 class="h-xl split-words">I make things <em class="rot" aria-label="move"><span class="on">move</span><span>feel</span><span>glow</span><span>howl</span></em> — pixels, players and robots.</h1>
    <div class="hero-foot">
      <p class="lead muted rv rv-d2" style="max-width:30em">I’m a computer science student who edits, animates, models in Blender, and writes the code for games and robots after hours. This site is my journal: the work, the struggle and what I’m learning on the way.</p>
      <a class="btn btn--solid rv rv-d3" href="projects.html">See the work <span class="arr">→</span></a>
    </div>
  </div>
</section>

<section class="reel" aria-label="Showreel">
  <div class="reel-stage">{vids}<button class="reel-play" type="button" aria-label="Play with sound"></button></div>
  <div class="reel-ui"><div><p class="label lbl">Showreel</p><p class="title">Showreel</p></div><div class="reel-ticks">{ticks}</div></div>
</section>

<div class="marquee" aria-hidden="true"><div><span>Design is like a game</span><span>and I like to play</span><span>Create something new</span><span>Text isn’t just text</span><span>run with the pack</span></div><div><span>Design is like a game</span><span>and I like to play</span><span>Create something new</span><span>Text isn’t just text</span><span>run with the pack</span></div></div>

<section class="wrap section cv">
  <div class="s-head"><p class="label">(01) Selected work</p><h2 class="h-l split-words">Seven missions. One direction: make people <em>feel</em> something.</h2></div>
  <div class="tiles">
    <a class="tile tile--wide rv" href="projects.html#reel">{video_tile_media("meant-to-be-felt", full=True)}<div class="tile-cap"><h3>Motion Reel 2026</h3><span class="label">14 films</span><p class="tile-kind">Kinetic type, spec ads, colour grades, tracking and 3D — including the new “Money Follows” cut.</p></div></a>
    <a class="tile rv" href="projects.html#blender"><div class="tile-media wipe"><img src="{B}blender-2.webp" alt="Blender render of a pink donut beside a mug" loading="lazy" decoding="async" width="1600" height="900"></div><div class="tile-cap"><h3>Blender Studies</h3><span class="label">3D</span><p class="tile-kind">The donut, a mug, a walnut table and a lot of light</p></div></a>
    <a class="tile rv rv-d1" href="projects.html#sundown-trail"><div class="tile-media wipe"><img src="assets/img/sundown-trail-pause.webp" alt="The paper-style pause menu from Sundown Trail" loading="lazy" decoding="async" width="780" height="1040"></div><div class="tile-cap"><h3>Sundown Trail</h3><span class="label badge-live">In dev</span><p class="tile-kind">A western game, built piece by piece</p></div></a>
    <a class="tile rv" href="projects.html#echo-balancer">{art_media("echo")}<div class="tile-cap"><h3>Echo Balancer</h3><span class="label badge-live">eYRC</span><p class="tile-kind">Teaching a robot to stand still</p></div></a>
    <a class="tile rv rv-d1" href="projects.html#robotic-arm">{art_media("arm")}<div class="tile-cap"><h3>Arm Control Suite</h3><span class="label">Robotics</span><p class="tile-kind">Simulate it, then move the real one</p></div></a>
    <a class="tile rv" href="projects.html#smart-bin">{art_media("bin")}<div class="tile-cap"><h3>Smart Bin</h3><span class="label">SIH 2026</span><p class="tile-kind">Waste pickup, by priority</p></div></a>
    <a class="tile rv rv-d1" href="projects.html#ninety-days">{art_media("ninety")}<div class="tile-cap"><h3>90 Day Progress</h3><span class="label">Live</span><p class="tile-kind">My accountability app</p></div></a>
  </div>
</section>

<section class="wrap section cv" style="padding-top:0">
  <div class="split">
    <div class="side"><p class="label">(02) The story so far</p></div>
    <div class="main wide"><p class="pull split-words">This site isn’t a résumé. It’s a <em>save file</em>.</p></div>
  </div>
  <div class="split">
    <div class="side"></div>
    <div class="main prose rv">
      <p>Every chapter here is a checkpoint: what I could do, what I couldn’t yet, and what I was trying next. Some pages are finished. Most are still loading.</p>
      <p>I study computer science at Tezpur University. Outside class I cut videos and animate type, light donuts in Blender, build a western game called Sundown Trail, and write control code that keeps a robot from falling over. They look like different jobs. To me it’s one job: making things that move people.</p>
      <p class="mt-m"><a class="btn" href="purpose.html">Read Chapter I <span class="arr">→</span></a></p>
    </div>
  </div>
</section>

<section class="wrap section cv" style="padding-top:0">
  <div class="s-head"><p class="label">(03) Chapters</p><h2 class="h-l split-words">Pick up where you left off.</h2></div>
  <ul class="index-list">{chapters}</ul>
</section>
''' + epilogue("")
    page("index.html", "Aamir Sheikh — motion designer, 3D artist, game developer, CS student",
         "Portfolio of Aamir Mehtab Sheikh: motion graphics, video editing, Blender 3D, game development and robotics from a computer science student at Tezpur University.",
         body, current="index.html")

# ================================================================= STORY
def build_story():
    body = page_head("I", "Origin", "Every game starts with a <em>tutorial</em>. This is mine.",
        "Welcome. This is where I keep a record of my work and my life as I go: what I can do, what I’m building and where I’m headed. It’s a log that keeps getting updated, not a finished résumé.")
    body += '''
<section class="wrap section cv" style="padding-top:0">
  <div class="split">
    <div class="side"><p class="label">Why this exists</p></div>
    <div class="main prose rv">
      <p class="h-m">I wanted one place that shows the whole picture: the skills, the projects in progress, the failures and the people and stories that keep me going.</p>
      <p>Most portfolios only show the highlight reel. I’d rather you see the run itself: the technologies I care about, the problems I’m stuck on and the goals I’ve set. If it does its job, you’ll leave knowing what I do <em>and</em> who I am.</p>
    </div>
  </div>
  <div class="split">
    <div class="side"><p class="label">Who I am</p></div>
    <div class="main prose rv">
      <p>I’m Aamir Mehtab Sheikh, a B.Tech Computer Science &amp; Engineering student at Tezpur University in Assam.</p>
      <p>My toolkit is a strange mix: a sketchbook, a video timeline, Blender, a game engine and a C++ compiler. I like it that way. Each one is a different way of making something people feel. A cut that lands on the beat, a render where the light falls just right, a menu that feels good to scroll and a robot that finally balances all give me the same small rush.</p>
    </div>
  </div>
  <div class="split">
    <div class="side"><p class="label">The pack</p></div>
    <div class="main prose rv">
      <p>I love wolves for one reason above the rest: a wolf is strong because of its pack. Team LUMOS at the hackathon, my eYRC team, and everyone who has answered a question I was embarrassed to ask: that’s mine.</p>
    </div>
  </div>
</section>

<section class="wrap section cv" style="padding-top:0">
  <div class="s-head"><p class="label">The run so far</p><h2 class="h-l split-words">Checkpoints.</h2></div>
  <ol class="timeline">
    <li class="rv"><span class="when">2025</span><div><h3>Joined B.Tech CSE at Tezpur University</h3><p>New city, new syllabus, and the first time I took code seriously.</p></div></li>
    <li class="rv"><span class="when">Jan 2026</span><div><h3>Shipped version one of this site</h3><p>Hand-written HTML, a few pages and a lot of blue. It worked, and I learned I could put something on the internet.</p></div></li>
    <li class="rv"><span class="when">May 2026</span><div><h3>Survived the Blender donut</h3><p>The rite of passage for every Blender beginner. Then a mug, a spoon, a walnut table and a lot of lighting experiments.</p></div></li>
    <li class="rv"><span class="when">Jun – Aug 2026</span><div><h3>Went deep on motion design</h3><p>A Liquid Death spec spot and kinetic-type studies. I learned that text can perform.</p></div></li>
    <li class="rv"><span class="when">Sep 2026</span><div><h3>Smart India Hackathon + the 90-day challenge</h3><p>Built Smart Bin with Team LUMOS and started a 90-day plan to get better at academics, programming and shipping projects.</p></div></li>
    <li class="rv"><span class="when">Oct 2026</span><div><h3>Robots, a western and a 4K ad</h3><p>eYRC Echo Balancer, software for my robotic arm, Sundown Trail and the “Money Follows” edit. Then I rebuilt this site from scratch.</p></div></li>
  </ol>
</section>

<section class="wrap section cv" style="padding-top:0">
  <div class="split">
    <div class="side"><p class="label">Where I’m headed</p></div>
    <div class="main wide">
      <ul class="offer">
        <li class="rv"><span class="n">a.</span><h3>Ship Sundown Trail</h3><p>A playable western in the browser, then on phones, with Blender-made worlds.</p></li>
        <li class="rv"><span class="n">b.</span><h3>Get strong at C++ &amp; DSA</h3><p>From the basics up, one small daily task at a time.</p></li>
        <li class="rv"><span class="n">c.</span><h3>Finish eYRC strong</h3><p>Move from simulation to a robot that balances in the real world.</p></li>
        <li class="rv"><span class="n">d.</span><h3>Take on real clients</h3><p>Motion, 3D and web work for people with something worth saying.</p></li>
      </ul>
    </div>
  </div>
</section>
''' + chapter_nav("purpose.html", "")
    page("purpose.html", "Story", "Who Aamir Sheikh is, why this site exists and where he’s headed — Chapter I.", body)

# ================================================================= STRUGGLES
def build_struggles():
    camp_ico = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-7z"/></svg>'
    trials = [
        ("Time", "There are never enough hours.", "College, competitions, editing, Blender, a game and a robot. I say yes to everything, then run out of day. Big plans are easy to make. Finishing them is the hard part.", "Small daily tasks instead of giant plans. My 90 Day Progress tracker keeps me honest, one finished thing at a time."),
        ("The learning curve", "Too much to learn, all at once.", "Control theory for eYRC, C++ from the basics, Blender, game engines, After Effects. Some weeks it feels like drinking from a fire hose.", "I learn by building. Each new idea goes into a real project the same week: a balancer, a game system or a render."),
        ("Self-doubt", "The voice that says I’m not good enough.", "There are days I question whether I can actually pull any of this off, usually right before something works.", "I keep receipts. Every finished piece on this site is evidence against that voice."),
        ("Resources", "Not always the right tools.", "Hardware is expensive, renders are slow and my laptop has opinions about 4K footage.", "Free and open tools first: Blender, Godot, Krita, DaVinci Resolve, and simulators before hardware."),
        ("Balance", "Too many tabs open in life.", "Juggling studies, projects, competitions and people means something is always waiting.", "Clear goals, honest priorities and asking for help. No wolf hunts alone."),
    ]
    rows = ""
    for i, (name, h, b, camp) in enumerate(trials, 1):
        rows += f'''<article class="trial rv">
  <div class="no">0{i}</div>
  <div class="body"><p class="label">{name}</p><h2 class="mt-s">{h}</h2><p>{b}</p></div>
  <div class="camp"><p class="label">{camp_ico} Base camp</p><p>{camp}</p></div>
</article>'''
    body = page_head("II", "A survivor is born", "Everyone shows the highlight reel. <em>Here’s the rest.</em>",
        "These are the struggles I’m dealing with right now, and what I’m doing about each one. I’m still working through all of them.")
    body += f'<section class="wrap cv" style="padding-bottom:clamp(48px,8vw,120px)">{rows}</section>'
    body += '''<section class="wrap section" style="border-top:1px solid var(--rule)">
  <p class="pull split-words">Every version of me that failed taught the <em>next one</em> something.</p>
  <p class="label mt-m rv">— Note to self, build 17</p>
</section>''' + chapter_nav("struggles.html", "")
    page("struggles.html", "Struggles", "The struggles behind the work — time, the learning curve, self-doubt — and how Aamir is fighting each one. Chapter II.", body, night=True)

# ================================================================= SKILLS
SKILLS = [
    # slug, name, notches(1-5), level, blurb, tools, tech, methods, seen-in videos, seen-in images
    ("video-editing", "Video Editing", 4, "Confident", "Cuts that land on the beat, colour that sets the mood and pacing that holds attention.",
     ["Adobe Premiere Pro", "Adobe After Effects", "DaVinci Resolve"], ["Rotoscoping", "Tracking", "Masking"],
     ["Colour correction", "Colour grading", "Compositing", "Transitions", "Motion graphics"], ["money-follows", "drift-grade", "drift-tracking", "chalamet-edit", "liquid-death", "coca-cola-doc"], []),
    ("modeling-3d", "3D Modelling", 2, "Learning", "Blocking out props and scenes in Blender, then shading and lighting them until they feel real.",
     ["Blender", "Cascadeur", "Unreal Engine"], ["Modelling", "Texturing", "Lighting", "Rendering"],
     ["Hard-surface modelling", "Sculpting", "Shading", "Depth of field"], ["blind-justice"], [b[0] for b in BLENDER]),
    ("graphic-design", "Graphic Design", 3, "Working", "Layout, type and image working together, from posters to thumbnails to titles.",
     ["Illustrator", "Photoshop", "Figma"], ["Rotoscoping", "Masking", "Recompositing"],
     ["Colour correction", "Colour grading", "Compositing", "Texturing", "Shading", "Text composition"], ["create-blue", "lego-engineering"], []),
    ("frontend", "Frontend Development", 3, "Working", "Fast, hand-written websites that work on every screen, including this one.",
     ["VS Code", "Chrome DevTools", "Figma"], ["HTML5", "CSS3", "JavaScript", "React (learning)"],
     ["Responsive design", "Mobile-first layout", "Light & dark themes", "Clean UI structure"], [], []),
    ("drawing", "Drawing & Sketching", 3, "Working", "Where every idea starts: thumbnails, characters and backgrounds.",
     ["2D Pincel", "Krita", "Sketchbook"], ["Graphics tablet", "Traditional tools"],
     ["Sketching", "Shading", "Line art", "Inking", "Colouring", "Character design", "Background art", "Concept art", "Composition"], [], []),
    ("animation", "Animation", 2, "Learning", "Frame by frame or keyframed: making things feel alive.",
     ["OpenToonz", "Adobe Animate", "Blender", "Cascadeur"], ["Frame interpolation", "Animation principles", "Upscaling"],
     ["Frame by frame", "2D animation", "3D animation"], ["ink-reveal", "meant-to-be-felt", "design-is-a-game", "this-is-my", "physics-robotics"], []),
    ("game-dev", "Game Development", 2, "Learning", "Systems, feel and atmosphere. Currently pouring all of it into Sundown Trail.",
     ["Godot", "Unreal Engine", "Unity", "Blender"], ["C++", "Collision", "Physics"],
     ["Game logic", "Modelling", "Animation", "UI / menus"], [], []),
    ("programming-robotics", "Programming & Robotics", 2, "Learning", "C++ from the ground up, Python for control and hardware that talks back.",
     ["Python", "C++", "CoppeliaSim", "Arduino IDE"], ["PID control", "LQR control", "ESP32 · LoRa", "Serial comms"],
     ["Simulation first", "Small daily practice", "Build to learn"], [], []),
]

def notches(n):
    return '<span class="notches" aria-hidden="true">' + "".join(f'<i class="{"f" if i < n else ""}"></i>' for i in range(5)) + '</span>'

def clip_html(c, p=""):
    slug, title, kind, year, ori = c
    return f'''<a class="clip {ori} rv" href="{p}{M}{slug}.mp4" data-play="{p}{M}{slug}.mp4" data-title="{esc(title)}" data-poster="{p}{M}{slug}.webp">{video_tile_media(slug, p=p)}<span class="play-ico">▶ Play</span><div class="tile-cap"><h3>{esc(title)}</h3><span class="label">{year}</span><p class="tile-kind">{esc(kind)}</p></div></a>'''

def build_skills():
    cards = ""
    for i, s in enumerate(SKILLS):
        slug, name, n, lvl, blurb, tools, tech, methods, seen, imgs = s
        cards += f'''<a class="charm rv" href="skills/{slug}.html">
  <span class="label">{i+1:02d}</span>
  <h2>{name}</h2>
  <div class="top-r">{notches(n)}<span class="notches-lbl">{lvl}</span><span class="sr">Level: {lvl}, {n} of 5</span></div>
  <p>{blurb}</p>
  <p class="tools">{" · ".join(tools)}</p>
  <span class="go" aria-hidden="true">↗</span>
</a>'''
    body = page_head("III", "Craft", "Tools change. <em>Taste</em> compounds.",
        "These are the skills I’m carrying right now. The filled notches show how much of my build each one takes: a lot of editing, and a growing amount of 3D and code.")
    body += f'''<section class="wrap cv" style="padding-bottom:clamp(48px,8vw,120px)">
  <p class="label rv" style="margin-bottom:18px">● = equipped notch · 5 max</p>
  <div class="charms">{cards}</div>
</section>''' + chapter_nav("skills.html", "")
    page("skills.html", "Skills", "Aamir Sheikh’s skills: video editing, motion graphics, Blender 3D, graphic design, frontend, drawing, animation, game development and robotics. Chapter III.", body)

    for i, s in enumerate(SKILLS):
        slug, name, n, lvl, blurb, tools, tech, methods, seen, imgs = s
        li = lambda xs: "".join(f"<li>{esc(x)}</li>" for x in xs)
        extra = ""
        if imgs:
            figs = "".join(f'<figure class="{"big" if k == 0 else ("sq" if k == 1 else "")} rv"><img src="../{B}{f}" alt="{esc(next(b[2] for b in BLENDER if b[0]==f))}" loading="lazy" decoding="async"><figcaption>{esc(next(b[1] for b in BLENDER if b[0]==f))}</figcaption></figure>' for k, f in enumerate(imgs))
            extra += f'<section class="wrap section cv" style="padding-top:0"><div class="s-head"><p class="label">Renders</p><h2 class="h-l">Made in Blender.</h2></div><div class="bgal">{figs}</div></section>'
        if seen:
            clips = "".join(clip_html(CLIP[c], p="../") for c in seen)
            extra += f'<section class="wrap section cv" style="padding-top:0"><div class="s-head"><p class="label">Seen in</p><h2 class="h-l">Proof of work.</h2></div><div class="reel-grid">{clips}</div></section>'
        prev = SKILLS[i - 1]; nxt = SKILLS[(i + 1) % len(SKILLS)]
        body = f'''<section class="wrap page-head">
  <span class="big-num" aria-hidden="true">{i+1:02d}</span>
  <div class="chapter rv"><span class="roman">III</span><span class="label"><a href="../skills.html" class="link">Skills</a> / {i+1:02d}</span></div>
  <h1 class="h-xl split-words">{name}</h1>
  <div class="top-r mt-m rv">{notches(n)}<span class="notches-lbl">{lvl} · {n}/5 notches</span></div>
  <p class="lead muted rv rv-d2">{blurb}</p>
</section>
<section class="wrap" style="padding-bottom:clamp(48px,8vw,120px)">
  <div class="kit rv">
    <div><p class="label">Software &amp; tools</p><ul>{li(tools)}</ul></div>
    <div><p class="label">Technologies</p><ul>{li(tech)}</ul></div>
    <div><p class="label">Methods</p><ul>{li(methods)}</ul></div>
  </div>
  <p class="mt-m rv"><a class="btn" href="../services.html">Hire me for this <span class="arr">→</span></a></p>
</section>
{extra}
<section class="wrap section--tight"><ul class="index-list">
  <li><a href="{nxt[0]}.html"><span class="num">→</span><span class="t">{nxt[1]}</span><span class="d">Next skill</span></a></li>
  <li><a href="{prev[0]}.html"><span class="num">←</span><span class="t">{prev[1]}</span><span class="d">Previous skill</span></a></li>
</ul></section>'''
        page(f"skills/{slug}.html", name, f"{name} — tools, technologies and methods Aamir Sheikh uses.", body, current="skills.html", depth=1)

# ================================================================= WORK
def build_work():
    clips = "".join(clip_html(c) for c in CLIPS)
    clips2 = "".join(clip_html(c) for c in CLIPS2)

    def mission(id_, tags, num, patch_txt, media, mode, title, role, text, facts, links, flip):
        dl = "".join(f"<dt>{k}</dt><dd>{v}</dd>" for k, v in facts)
        return f'''<article class="mission{' flip' if flip else ''}" id="{id_}" data-tags="{tags}">
  <div class="m-media"><div class="frame wipe {mode}">{media}{patch(patch_txt, num)}</div></div>
  <div class="m-text rv rv-d1">
    <p class="label">Mission {num}</p>
    <h2>{title}</h2>
    <p class="role">{role}</p>
    <div class="prose">{text}</div>
    <dl class="facts">{dl}</dl>
    <div class="m-links">{"".join(links)}</div>
  </div>
</article>'''

    m = mission("sundown-trail", "games", "02", "SUNDOWN TRAIL · WESTERN · IN DEVELOPMENT · ",
        '<img src="assets/img/sundown-trail-pause.webp" alt="Sundown Trail’s paper-journal pause menu: Resume, Save game, Load game, Settings, Quit to title" loading="lazy" decoding="async">', "",
        "Sundown Trail", "A western game, built one piece at a time",
        "<p>Red Dead Redemption 2 made me want to build a world, not just a level. Sundown Trail is my attempt: a frontier game with mid-poly visuals, a paper-journal interface and a lot of dust.</p><p>I’m building it one system at a time: terrain, movement, menus, then the story. The pause menu above is one of the first pieces I finished, and this site’s menu is modelled on it. Press Esc.</p>",
        [("Status", '<span class="badge-live">In development</span>'), ("Focus", "Game design · UI · Blender environment art"), ("Platform", "Browser first, then Android &amp; iOS"), ("Look", "Mid-poly, 30 fps, baked Blender textures")], [], False)
    m += mission("echo-balancer", "robotics software", "04", "ECHO BALANCER · eYRC 2026–27 · ",
        art("echo"), "art-night", "Echo Balancer", "e-Yantra Robotics Competition 2026–27",
        "<p>The challenge is to keep an unstable robot upright. I’m working through the theme’s tasks in CoppeliaSim, starting with a PID controller and then moving to LQR for smoother, more efficient balancing.</p><p>It’s the most maths I’ve ever enjoyed: every gain I tune shows up right away as a wobble or as stillness.</p>",
        [("Status", '<span class="badge-live">In progress</span>'), ("Stack", "Python · CoppeliaSim"), ("Control", "PID → LQR"), ("Competition", "eYRC by e-Yantra, IIT Bombay")], [], True)
    m += mission("robotic-arm", "robotics software", "05", "ARM CONTROL SUITE · SIM TO REAL · ",
        art("arm"), "art-day", "Arm Control Suite", "Desktop software for my robotic arm",
        "<p>I have a physical robotic arm with a gripper. I’m writing desktop software that simulates it, works out its motion, shows it in 3D and then sends the same moves to the real arm.</p><p>The goal: test a move on screen, press one button and watch the real arm do it.</p>",
        [("Status", '<span class="badge-live">In development</span>'), ("Hardware", "Robotic arm + gripper"), ("Firmware", "Arduino IDE"), ("Software", "Simulation · kinematics · 3D view · control")], [], False)
    m += mission("smart-bin", "robotics software", "06", "SMART BIN · SIH 2026 · TEAM LUMOS · ",
        art("bin"), "art-night", "Smart Bin", "Smart India Hackathon 2026 — Team LUMOS",
        "<p>An IoT system for smart waste management. Bins measure how full they are and report over long-range radio, then a priority engine tells collection drivers which bins need them first.</p>",
        [("Problem", "PS 195 · Smart Waste Management"), ("Hardware", "ESP32-C3 · radar fill sensor · SX1278 LoRa"), ("Backend", "FastAPI · MongoDB priority engine"), ("App", "React Native (Expo) driver app")],
        ['<a class="btn" href="https://github.com/BachirAfx/WasteFlow" target="_blank" rel="noopener">Code on GitHub <span class="arr">↗</span></a>'], True)
    m += mission("ninety-days", "software", "07", "90 DAY PROGRESS · ONE THING A DAY · ",
        art("ninety"), "art-day", "90 Day Progress", "A personal accountability app",
        "<p>I tend to make big plans and struggle to finish them. So I built a tracker for a 90-day challenge covering academics, programming, projects and skills, with small daily tasks and no overload.</p><p>Progress is saved on your own device, and you can export or import it as JSON.</p>",
        [("Status", "Live"), ("Stack", "React · TypeScript"), ("Storage", "localStorage · JSON export/import")],
        ['<a class="btn btn--solid" href="90-day-progress/">Open the app <span class="arr">↗</span></a>'], False)

    figs = "".join(f'<figure class="{"big" if k == 0 else ("sq" if k == 1 else "")} rv"><img src="{B}{f}" alt="{esc(alt)}" loading="lazy" decoding="async"><figcaption>{esc(cap)}</figcaption></figure>' for k, (f, cap, alt) in enumerate(BLENDER))

    index_rows = [
        ("01", "Motion Reel 2026", "Motion design · edits · grades", "2026", "#reel", f"{M}meant-to-be-felt.webp"),
        ("02", "Sundown Trail", "Game · UI · environment", "In dev", "#sundown-trail", "assets/img/sundown-trail-pause.webp"),
        ("03", "Blender Studies", "3D · lighting · shading", "2026", "#blender", f"{B}blender-2.webp"),
        ("04", "Echo Balancer", "Robotics · control · eYRC", "2026", "#echo-balancer", "assets/img/art-echo.webp"),
        ("05", "Arm Control Suite", "Robotics · software", "In dev", "#robotic-arm", "assets/img/art-arm.webp"),
        ("06", "Smart Bin", "IoT · SIH 2026", "2026", "#smart-bin", "assets/img/art-bin.webp"),
        ("07", "90 Day Progress", "Software · React", "Live", "#ninety-days", "assets/img/art-ninety.webp"),
    ]
    ptable = "".join(f'<li class="rv"><a href="{h}" data-peek="{img}"><span class="n">{n}</span><span class="t">{t}</span><span class="k">{k}</span><span class="y">{y}</span><span class="ar">↘</span></a></li>' for n, t, k, y, h, img in index_rows)

    body = page_head("IV", "Missions", "The missions <em>log.</em>",
        "Motion design, 3D, games, robots and software. Some of these are finished and most are in progress. Hover a film to preview it and click to watch with sound.")
    body += f'''<section class="wrap" style="padding-bottom:clamp(40px,6vw,80px)">
  <div class="ptable-head label"><span>No.</span><span>Project</span><span class="k">Discipline</span><span>Year</span><span></span></div>
  <ul class="ptable">{ptable}</ul>
</section>
<div class="peek" aria-hidden="true"><img alt=""></div>
<section class="wrap" style="padding-bottom:clamp(48px,8vw,120px)">
  <div class="filters" role="group" aria-label="Filter missions">
    <button type="button" data-filter="all" aria-pressed="true">All</button>
    <button type="button" data-filter="motion" aria-pressed="false">Motion</button>
    <button type="button" data-filter="3d" aria-pressed="false">3D</button>
    <button type="button" data-filter="games" aria-pressed="false">Games</button>
    <button type="button" data-filter="robotics" aria-pressed="false">Robotics</button>
    <button type="button" data-filter="software" aria-pressed="false">Software</button>
  </div>
  <article class="mission mission--full" id="reel" data-tags="motion">
    <div class="s-head" style="margin-bottom:clamp(24px,4vw,48px)"><p class="label">Mission 01</p><h2 class="h-xl split-words">Motion Reel 2026</h2><p class="muted rv">Kinetic type, spec ads, title studies, colour grades, tracking and 3D. The newest is “Money Follows”, a vertical ad cut from 4K footage. Every piece started as a single line of text and an idea about how it should feel.</p></div>
    <div class="reel-grid">{clips}</div>
    <div class="cat-head"><span class="label">Earlier</span><h2>Edits, grades &amp; 3D</h2></div>
    <div class="reel-grid">{clips2}</div>
  </article>
  {m.split('<article class="mission flip" id="echo-balancer"')[0]}
  <article class="mission mission--full" id="blender" data-tags="3d">
    <div class="s-head" style="margin-bottom:clamp(24px,4vw,48px)"><p class="label">Mission 03</p><h2 class="h-xl split-words">Blender <em>Studies</em></h2><p class="muted rv">Every Blender artist starts with the donut. Mine came with a mug, a spoon and a beam of late-afternoon light, and I kept relighting it to learn how mood changes with one lamp. Then came a walnut table with wood-grain shading and a soft studio floor.</p></div>
    <div class="bgal">{figs}</div>
    <dl class="facts mt-m rv" style="max-width:640px"><dt>Tool</dt><dd>Blender</dd><dt>Focus</dt><dd>Modelling · shading · lighting · composition</dd><dt>Next</dt><dd>Environment assets for Sundown Trail</dd></dl>
  </article>
  <article class="mission flip" id="echo-balancer"{m.split('<article class="mission flip" id="echo-balancer"')[1]}
</section>
<div class="rank" aria-hidden="true"><b>D</b><span>Dull</span></div>''' + chapter_nav("projects.html", "")
    page("projects.html", "Work", "Projects by Aamir Sheikh: a 2026 motion reel, Blender 3D studies, Sundown Trail, eYRC Echo Balancer, robotic arm software, SIH Smart Bin and 90 Day Progress. Chapter IV.", body)

# ================================================================= INSPIRATIONS
def build_inspirations():
    def P(title, meta, take, desc="", cls="", id_="", serif=False):
        idattr = f' id="{id_}"' if id_ else ""
        h = f'<h3 class="serif-i">{title}</h3>' if serif else f"<h3>{title}</h3>"
        d = f"<p>{desc}</p>" if desc else ""
        return f'<article class="panel {cls} rv"{idattr}><span class="speed"></span><p class="label">{meta}</p>{h}{d}<p class="take">{take}</p></article>'

    wolves = f'''<article class="panel w12 wolfpanel rv" id="wolves">
  <div>
    <p class="label">00 · The pack · always</p>
    <h3 class="serif-i" style="font-size:clamp(2.4rem,6vw,5rem);margin:8px 0 18px">Wolves.</h3>
    <blockquote>“For the strength of the Pack is the Wolf, and the strength of the Wolf is the Pack.”<cite>Rudyard Kipling · The Law of the Jungle · 1894</cite></blockquote>
    <p class="mt-m" style="max-width:34em">My favourite animal. Wolves are loyal to their pack but still able to walk alone, and they’re patient, smart and loud when it matters. They’re why the footer says “run with the pack”.</p>
  </div>
</article>'''
    games = "".join([
        P("Red Dead Redemption 2", "Game · 2018", "A world that doesn’t need you, which is why you care about it.", "The reason Sundown Trail exists. The journal, the pause menu and the patience all come from here.", "w8 dark"),
        P("Stray", "Game · 2022", "Tell the story with the camera at knee height.", "The cat in the footer is for this one.", "tone", "stray"),
        P("Hollow Knight", "Game · 2017", "Restraint. A tiny palette and a huge sense of place.", "", "w3"),
        P("Tomb Raider · Rise · Shadow", "Games · 2013 – 2018", "The best origin stories are about surviving, not winning.", "The struggles chapter is named after this trilogy.", "w3 red"),
        P("Marvel’s Spider-Man 2", "Game · 2023", "Movement should feel good before it means anything.", "", "w6"),
        P("NieR: Automata", "Game · 2017", "The interface can be part of the story.", "", "w3 dark"),
        P("Devil May Cry", "Games · 2001 –", "Style is a score. Earn the S rank.", "Scroll the Work page.", "w3"),
        P("Stellar Blade", "Game · 2024", "Polish is a form of respect for the player.", "", "w6 tone"),
    ])
    films = "".join([
        P("The Shawshank Redemption", "Film · 1994", "Patience is a plan. So is hope.", "", "w6 dark", serif=True),
        P("12 Angry Men", "Film · 1957", "One room, one argument, no wasted frame.", "", "w6", serif=True),
        P("The Lighthouse", "Film · 2019", "Black, white and grain can be enough.", "The film grain on this site is a quiet nod.", "tone", serif=True),
        P("Atonement", "Film · 2007", "One long take can carry a whole war.", "", "", serif=True),
        P("Fight Club", "Film · 1999", "Every frame can hide something. Make people look twice.", "", "dark", serif=True),
        P("Alien — Ripley", "Film · 1979", "Competence is the most heroic trait.", "Hence the green terminal at the bottom of each page.", "", serif=True),
        P("Mickey 17", "Film · 2025", "Each version of you gets a little better.", "", "red", serif=True),
        P("Thunderbolts*", "Film · 2025", "Broken people can still make a team.", "", "", serif=True),
        P("The Fantastic Four: First Steps", "Film · 2025", "Retro-futurism. The future as people once imagined it.", "The mission patches come from here.", "w6 tone", serif=True),
        P("Spider-Man: Brand New Day", "Film · 2026", "Starting over isn’t the same as starting from zero.", "", "w6 dark", serif=True),
        P("Puss in Boots: The Last Wish", "Film · 2022", "Animation that looks painted and moves like a comic.", "", "w6", serif=True),
        P("Aladdin", "Film · Disney", "Wonder first, logic later.", "", "w6 tone", serif=True),
    ])
    anim = "".join([
        P("Ne Zha", "Animated film · 2019", "Fight the fate people write for you.", "", "w6 red"),
        P("Jiang Ziya", "Animated film · 2020", "Ink, myth and big empty skies.", "", "w6 dark"),
        P("One Piece", "Anime · 1999 –", "Find your crew and keep sailing.", "", "tone"),
        P("Hunter × Hunter", "Anime · 2011", "Rules make power interesting.", "", ""),
        P("Dororo", "Anime · 2019", "Get back what was taken from you, one piece at a time.", "", "dark"),
        P("Dorohedoro", "Anime · 2020", "Grime and warmth can share a frame.", "", "w6"),
        P("Parasyte -the maxim-", "Anime · 2014", "Change from the inside is still change.", "", "w6 tone"),
    ])
    people = f'''
<article class="panel has-img w6 rv" style="min-height:340px"><img src="assets/img/mackesy-1.webp" alt="Charlie Mackesy illustration backdrop from The Boy, the Mole, the Fox and the Horse" loading="lazy"><div class="cap"><p class="label">Book &amp; film · Charlie Mackesy</p><h3>The Boy, the Mole, the Fox &amp; the Horse</h3></div></article>
<article class="panel w6 rv"><span class="speed"></span><p class="label">People who build quietly</p><h3 class="serif-i">Charlie Mackesy</h3><p>Inspired by people who show up every day and build quietly. A few lines of ink and a kind sentence can carry more than a blockbuster.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:auto"><img src="assets/img/mackesy-2.webp" alt="" loading="lazy" style="aspect-ratio:3/2;object-fit:cover;filter:grayscale(1)"><img src="assets/img/mackesy-3.webp" alt="" loading="lazy" style="aspect-ratio:3/2;object-fit:cover;filter:grayscale(1)"></div></article>
<a class="panel has-img w8 rv" href="{M}chalamet-edit.mp4" data-play="{M}chalamet-edit.mp4" data-title="Chalamet — fan edit" data-poster="assets/img/chalamet.webp" style="min-height:340px"><img src="assets/img/chalamet.webp" alt="Timothée Chalamet wallpaper" loading="lazy"><div class="cap"><p class="label">Actor · ▶ watch my edit</p><h3><s style="opacity:.6">Less noise, more meaning.</s> More noise, more meaning.</h3></div></a>
<article class="panel w4 red rv"><span class="speed"></span><p class="label">Design studio</p><h3>Pentagram</h3><p>The reason this site looks the way it does: big type, a strict grid and letting the work speak. Then I broke a few of the rules.</p><p class="take">Hierarchy is kindness.</p></article>
'''
    body = page_head("V", "Inspirations", "Everything I love <em>leaves a mark.</em>",
        "These are the animals, games, films, anime and people I keep coming back to, along with the one thing I took from each. You’ll find small nods to most of them hidden around this site.")
    body += f'''<section class="wrap" style="padding-bottom:clamp(48px,8vw,120px)">
  <div class="panels">{wolves}</div>
  <div class="cv"><div class="cat-head"><span class="label">01</span><h2>Games</h2></div><div class="panels">{games}</div></div>
  <div class="cv"><div class="cat-head"><span class="label">02</span><h2>Films</h2></div><div class="panels">{films}</div></div>
  <div class="cv"><div class="cat-head"><span class="label">03</span><h2>Anime &amp; animation</h2></div><div class="panels">{anim}</div></div>
  <div class="cv"><div class="cat-head"><span class="label">04</span><h2>People</h2></div><div class="panels">{people}</div></div>
  <p class="pull split-words mt-l">Feel the <em>silence</em>.</p>
</section>''' + chapter_nav("inspirations.html", "")
    page("inspirations.html", "Inspirations", "The wolves, games, films, anime and people that inspire Aamir Sheikh’s work, from Red Dead Redemption 2 to The Lighthouse to One Piece. Chapter V.", body)

# ================================================================= SERVICES
def build_services():
    body = page_head("VI", "Side quests", "Side quests <em>welcome.</em>",
        "I take on a small number of freelance projects alongside my studies. If you have a story to tell, a product to show or a site that needs to exist, let’s talk.")
    body += '''<section class="wrap" style="padding-bottom:clamp(48px,8vw,120px)">
  <ul class="offer">
    <li class="rv"><span class="n">01</span><h3>Video editing</h3><p>Reels, ads, YouTube and short films: the cut, colour grade, sound and pacing. Tools: Premiere Pro, After Effects, DaVinci Resolve.</p></li>
    <li class="rv"><span class="n">02</span><h3>Motion graphics</h3><p>Kinetic typography, title sequences, logo animations and spec ads. See the <a class="link" href="projects.html#reel">motion reel</a>.</p></li>
    <li class="rv"><span class="n">03</span><h3>3D renders</h3><p>Product shots and small scenes in Blender: modelling, shading and lighting. See the <a class="link" href="projects.html#blender">Blender studies</a>.</p></li>
    <li class="rv"><span class="n">04</span><h3>Web design &amp; development</h3><p>Fast, hand-coded sites with a clear hierarchy, a little personality, and light and dark modes, like this one.</p></li>
  </ul>
</section>
<section class="wrap section cv" style="padding-top:0">
  <div class="s-head"><p class="label">How it works</p><h2 class="h-l split-words">Four steps. No surprises.</h2></div>
  <div class="steps">
    <div class="rv"><p class="label">Step 1</p><h3>Brief</h3><p>You tell me the goal, the audience and the deadline. I ask the annoying questions.</p></div>
    <div class="rv rv-d1"><p class="label">Step 2</p><h3>Board</h3><p>References, a rough storyboard or wireframe, and an agreed direction before I build anything.</p></div>
    <div class="rv rv-d2"><p class="label">Step 3</p><h3>Build</h3><p>I make it and share progress, with two rounds of revisions included.</p></div>
    <div class="rv rv-d3"><p class="label">Step 4</p><h3>Deliver</h3><p>Final files in the formats you need, and the project files if you want them.</p></div>
  </div>
</section>
<section class="wrap section cv" style="padding-top:0">
  <div class="s-head"><p class="label">The case</p><h2 class="h-l split-words">Why work with me. <em>Three exhibits.</em></h2></div>
  <ul class="offer">
    <li class="rv"><span class="n">A</span><h3>Two languages</h3><p>I speak both design and code, so the thing you approve is the thing that ships.</p></li>
    <li class="rv"><span class="n">B</span><h3>Obsessive about feel</h3><p>Years of games and films taught me that timing is everything. I sweat the frames.</p></li>
    <li class="rv"><span class="n">C</span><h3>Honest</h3><p>Clear timelines, clear limits. If it isn’t my strength, I’ll tell you.</p></li>
  </ul>
</section>
''' + epilogue("", "Let’s make something <em>worth watching</em>.")
    page("services.html", "Services", "Hire Aamir Sheikh for video editing, motion graphics, Blender 3D renders and web design and development. Chapter VI.", body)

# ================================================================= 404
def build_404():
    body = f'''<section class="wrap lost">
  <div>
    <p class="label label--red">Error 404</p>
    <h1 class="mega mt-s" style="font-family:var(--f-serif);font-weight:400;font-style:italic">Lost from the pack.</h1>
    <p class="lead muted mt-m" style="margin-inline:auto">This page doesn’t exist, or it got cut in the edit.</p>
    <p class="mt-m"><a class="btn" href="/">Find the pack <span class="arr">→</span></a></p>
  </div>
</section>'''
    doc = head("Lost", "Page not found.", "404.html", "/") + '<body>\n' + header("", "/") + pause_menu("", "/") + f'<main id="main">{body}</main>\n' + footer("/") + "</body>\n</html>\n"
    with open(os.path.join(ROOT, "404.html"), "w", encoding="utf-8") as f: f.write(doc)
    print("wrote 404.html")

def export_art_sources():
    """Writes standalone SVGs for the Work-page hover previews (rendered to .webp by a helper)."""
    os.makedirs(os.path.join(ROOT, "_build", "art"), exist_ok=True)
    vars_day = "--a-bg:#e5dfd2;--a-ink:#15130f;--a-mute:#5c564d;--a-grid:rgba(21,19,15,.12);--a-red:#b8231f"
    vars_night = "--a-bg:#0c0b0a;--a-ink:#ece6da;--a-mute:#a59e92;--a-grid:rgba(236,230,218,.08);--a-red:#e2483d"
    for n in ("echo", "arm", "bin", "ninety"):
        v = vars_night if ART_MODE[n] == "art-night" else vars_day
        svg = art(n).replace("<svg ", f'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" style="{v}" ', 1)
        with open(os.path.join(ROOT, "_build", "art", f"art-{n}.svg"), "w") as f: f.write(svg)

if __name__ == "__main__":
    build_home(); build_story(); build_struggles(); build_skills(); build_work(); build_inspirations(); build_services(); build_404(); export_art_sources()
