#!/usr/bin/env python3
"""Static page builder for theaamirsheikh.com.
Edit the content below, run `python3 _build/build.py` from the site root,
and the .html files are regenerated. (You can also edit the .html directly.)
"""
import os, html, json, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://theaamirsheikh.com"
EMAIL = "ak4418561@gmail.com"
GITHUB = "https://github.com/MONSTERG0D"
FONTS = "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap"

# chapter order = the story order
CHAPTERS = [
    # file, nav label, roman, title, one-liner
    ("purpose.html", "Story", "I", "Story", "Who I am and why this site exists."),
    ("struggles.html", "Struggles", "II", "Struggles", "The part of the run that usually gets cut."),
    ("skills.html", "Skills", "III", "Skills", "The tools I carry and how far along each one is."),
    ("projects.html", "Work", "IV", "Work", "Motion, games, robots and software — the missions log."),
    ("inspirations.html", "Inspirations", "V", "Inspirations", "The games, films and anime that left a mark."),
    ("services.html", "Services", "VI", "Services", "Side quests: what I can make for you."),
]
NAV_ORDER = ["projects.html", "purpose.html", "struggles.html", "skills.html", "inspirations.html", "services.html"]

def esc(s): return html.escape(s, quote=True)

# ---------------------------------------------------------------- media
M = "assets/media/"
CLIPS = [
    # slug, title, kind, year, orientation, has audio
    ("money-follows", "Money Follows", "Vertical ad edit · 4K source", "2026", "v"),
    ("liquid-death", "Liquid Death — spec spot", "Motion graphics · spec ad", "2026", "v"),
    ("meant-to-be-felt", "Text Isn’t Just Text", "Kinetic typography", "2026", "h"),
    ("design-is-a-game", "Design Is Like a Game", "Kinetic typography", "2026", "h"),
    ("create-orange", "Create — Title Study I", "Title design", "2026", "h"),
    ("create-blue", "Create Something New — Title Study II", "Title design", "2026", "t"),
    ("card-flip", "Card Flip — My First Animation", "2D animation", "2026", "t"),
    ("chalamet-edit", "Chalamet — Fan Edit", "Edit · colour · rhythm", "2026", "t"),
]
# earlier edits that were already on the old site (recovered from the GitHub repo)
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

# ---------------------------------------------------------------- svg art
def art(name):
    if name == "echo":
        return '''<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Line drawing of a self-balancing robot with a damped oscillation graph">
<defs><pattern id="eg" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#ebe5d9" stroke-opacity=".07"/></pattern></defs>
<rect width="400" height="300" fill="#0d0c0b"/><rect width="400" height="300" fill="url(#eg)"/>
<line x1="40" y1="221" x2="360" y2="221" stroke="#ebe5d9" stroke-opacity=".5"/>
<g fill="none" stroke="#ebe5d9" stroke-width="2">
<g><animateTransform attributeName="transform" type="rotate" values="-9 170 205;7 170 205;-4 170 205;2.5 170 205;-1 170 205;0 170 205;0 170 205;-9 170 205" dur="6s" repeatCount="indefinite"/>
<rect x="164" y="92" width="12" height="113" rx="2"/><circle cx="170" cy="86" r="13"/><line x1="170" y1="40" x2="170" y2="64" stroke-dasharray="3 4" stroke-opacity=".5"/></g>
<circle cx="170" cy="205" r="16"/><circle cx="170" cy="205" r="3" fill="#ebe5d9"/></g>
<path d="M226 150 C 238 110, 246 110, 256 150 S 270 182, 280 150 S 292 128, 300 150 S 310 164, 316 150 S 324 143, 330 150 S 338 154, 344 150 L 362 150" fill="none" stroke="#b8231f" stroke-width="2"/>
<line x1="222" y1="150" x2="366" y2="150" stroke="#ebe5d9" stroke-opacity=".2" stroke-dasharray="2 4"/>
<g font-family="JetBrains Mono, monospace" font-size="9" fill="#a59e92" letter-spacing=".08em">
<text x="40" y="34">ECHO BALANCER · eYRC 2026–27</text><text x="226" y="100">θ(t) → 0</text><text x="226" y="198">PID · LQR · COPPELIASIM</text><text x="40" y="258">TASK 1A · 1B · 1C</text></g></svg>'''
    if name == "arm":
        return '''<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Blueprint drawing of a robotic arm with gripper reaching a target">
<defs><pattern id="ag" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="#15130f" stroke-opacity=".07"/></pattern></defs>
<rect width="400" height="300" fill="#e6e0d4"/><rect width="400" height="300" fill="url(#ag)"/>
<path d="M30 232 A 150 150 0 0 1 310 170" fill="none" stroke="#15130f" stroke-opacity=".35" stroke-dasharray="4 5"/>
<g fill="none" stroke="#15130f" stroke-width="2" stroke-linecap="round">
<rect x="120" y="240" width="80" height="14"/><line x1="100" y1="254" x2="220" y2="254"/>
<g><animateTransform attributeName="transform" type="rotate" values="0 160 232;-6 160 232;0 160 232" dur="5s" repeatCount="indefinite"/>
<line x1="160" y1="232" x2="196" y2="150"/><circle cx="160" cy="232" r="7" fill="#e6e0d4"/>
<g><animateTransform attributeName="transform" type="rotate" values="0 196 150;10 196 150;0 196 150" dur="5s" repeatCount="indefinite"/>
<line x1="196" y1="150" x2="278" y2="122"/><circle cx="196" cy="150" r="6" fill="#e6e0d4"/>
<circle cx="278" cy="122" r="5" fill="#e6e0d4"/><path d="M282 116 l14 -6 l6 6 M282 128 l14 6 l6 -6"/></g></g></g>
<g stroke="#b8231f" stroke-width="1.5"><circle cx="318" cy="118" r="9" fill="none"/><line x1="304" y1="118" x2="332" y2="118"/><line x1="318" y1="104" x2="318" y2="132"/></g>
<g font-family="JetBrains Mono, monospace" font-size="9" fill="#5c564d" letter-spacing=".08em">
<text x="30" y="34">ARM CONTROL SUITE · SIM → REAL</text><text x="140" y="228">J1</text><text x="176" y="170">J2</text><text x="268" y="146">J3</text><text x="300" y="94">TARGET</text><text x="30" y="282">FK · IK · ARDUINO SERIAL</text></g></svg>'''
    if name == "bin":
        return '''<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Drawing of a smart bin sending LoRa signals to a route map">
<rect width="400" height="300" fill="#0d0c0b"/>
<g fill="none" stroke="#ebe5d9" stroke-width="2"><path d="M86 130 h84 l-8 104 h-68 z"/><line x1="80" y1="122" x2="176" y2="122"/><line x1="112" y1="114" x2="144" y2="114"/>
<rect x="100" y="178" width="56" height="48" fill="#b8231f" fill-opacity=".85" stroke="none"/></g>
<g fill="none" stroke="#ebe5d9" stroke-width="1.6">
<path d="M186 104 a 18 18 0 0 1 0 30"><animate attributeName="stroke-opacity" values=".2;1;.2" dur="1.8s" repeatCount="indefinite"/></path>
<path d="M196 94 a 32 32 0 0 1 0 50"><animate attributeName="stroke-opacity" values=".2;1;.2" dur="1.8s" begin=".3s" repeatCount="indefinite"/></path>
<path d="M206 84 a 46 46 0 0 1 0 70"><animate attributeName="stroke-opacity" values=".2;1;.2" dur="1.8s" begin=".6s" repeatCount="indefinite"/></path></g>
<path d="M250 230 L 278 180 L 330 196 L 316 120 L 362 92" fill="none" stroke="#ebe5d9" stroke-opacity=".45" stroke-dasharray="3 5"/>
<g fill="#ebe5d9"><circle cx="250" cy="230" r="4"/><circle cx="278" cy="180" r="4"/><circle cx="330" cy="196" r="4"/><circle cx="362" cy="92" r="4"/></g>
<circle cx="316" cy="120" r="6" fill="#b8231f"><animate attributeName="r" values="5;8;5" dur="1.6s" repeatCount="indefinite"/></circle>
<g font-family="JetBrains Mono, monospace" font-size="9" fill="#a59e92" letter-spacing=".08em">
<text x="30" y="34">SMART BIN · SIH 2026 · TEAM LUMOS</text><text x="88" y="262">FILL 82%</text><text x="214" y="70">LoRa SX1278</text><text x="326" y="138">PRIORITY</text><text x="230" y="262">ROUTE → DRIVER APP</text></g></svg>'''
    if name == "ninety":
        dots = []
        for i in range(90):
            x = 52 + (i % 15) * 21
            y = 78 + (i // 15) * 25
            dots.append(f'<circle cx="{x}" cy="{y}" r="5.5"/>')
        return ('<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A grid of ninety days, filled up to today" data-days-start="2026-09-23">'
                '<rect width="400" height="300" fill="#e6e0d4"/>'
                '<g class="days" fill="none" stroke="#15130f" stroke-width="1.4">' + "".join(dots) + '</g>'
                '<g font-family="JetBrains Mono, monospace" font-size="9" fill="#5c564d" letter-spacing=".08em">'
                '<text x="52" y="44">90 DAY PROGRESS · ONE SMALL THING A DAY</text><text x="52" y="248" data-days-label>DAY — / 90</text></g></svg>')
    return ""

def patch(text, num):
    return f'''<div class="patch" aria-hidden="true"><svg viewBox="0 0 100 100"><defs><path id="p{num}" d="M50 50 m-38 0 a38 38 0 1 1 76 0 a38 38 0 1 1 -76 0"/></defs><circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" stroke-opacity=".5"/><circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" stroke-opacity=".5"/><text font-family="JetBrains Mono, monospace" font-size="8.4" letter-spacing="2.2" fill="currentColor"><textPath href="#p{num}">{esc(text)}</textPath></text></svg><b>{num}</b></div>'''

# ---------------------------------------------------------------- shell
def head(title, desc, path, p, night=False, extra=""):
    url = SITE + "/" + ("" if path == "index.html" else path)
    full = title if title.startswith("Aamir") else f"{title} — Aamir Sheikh"
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(full)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="{'#0d0c0b' if night else '#efebe3'}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="The Aamir Sheikh">
<meta property="og:title" content="{esc(full)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/assets/img/og.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="{p}assets/img/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="{p}assets/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<link rel="stylesheet" href="{p}assets/css/style.css">
<script src="{p}assets/js/main.js" defer></script>{extra}
</head>
'''

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
    <a class="wordmark" href="{p}index.html" aria-label="Aamir Sheikh — home">Aamir Sheikh <small>CSE · Tezpur</small></a>
    <nav class="nav" aria-label="Primary">{"".join(links)}</nav>
    <button class="menu-btn" type="button" aria-controls="pause" aria-expanded="false">Menu <kbd>Esc</kbd></button>
  </div>
</header>
'''

def pause_menu(current, p):
    items = [f'<li><button type="button" data-resume><span class="num">▸</span>Resume</button></li>',
             f'<li><a href="{p}index.html"{" aria-current=page" if current=="index.html" else ""}><span class="num">00</span>Home</a></li>']
    for f, label, roman, title, d in CHAPTERS:
        cur = ' aria-current="page"' if f == current else ""
        items.append(f'<li><a href="{p}{f}"{cur}><span class="num">{roman}</span>{title}</a></li>')
    items.append(f'<li><a href="{p}90-day-progress/"><span class="num">↗</span>90 Day Progress</a></li>')
    return f'''<div class="pause" id="pause" role="dialog" aria-modal="true" aria-label="Menu" aria-hidden="true">
  <div class="pause-card">
    <h2>Paused</h2>
    <ul class="pause-list">{"".join(items)}</ul>
    <div class="pause-foot"><span>↑ ↓ Select</span><span>Esc Resume</span></div>
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
  <a class="cat" href="{p}inspirations.html#stray" aria-label="A small cat. It leads to the inspirations page."><svg viewBox="0 0 34 22" fill="currentColor" aria-hidden="true"><path class="tail" d="M7 19c-5 0-7-4-5-8 1-2 3-2 3 0-1 2 0 4 2 4z"/><path d="M8 21c-1-5 2-9 8-10l3-.3 2-4 1.6 3 2.4 0 1.6-3 1.4 4.3c1.6 1 2 3 1.6 4.6L28 21z"/><circle cx="23" cy="12.4" r=".9" fill="#efebe3"/><circle cx="27" cy="12.4" r=".9" fill="#efebe3"/></svg></a>
  <div class="wrap">
    <div class="grid">
      <div class="col big">
        <p class="label">The Aamir Sheikh</p>
        <p class="h-m mt-s" style="max-width:22em">A living record of the work, the struggle and the stories that shaped it. Updated whenever I level up.</p>
        <p class="mt-s"><a class="link" href="mailto:{EMAIL}">{EMAIL}</a></p>
      </div>
      <div class="col"><p class="label">Chapters</p><ul class="mt-s">{pages}</ul></div>
      <div class="col"><p class="label">Elsewhere</p><ul class="mt-s"><li><a href="{GITHUB}" rel="me noopener" target="_blank">GitHub ↗</a></li><li><a href="{p}90-day-progress/">90 Day Progress ↗</a></li><li><a href="mailto:{EMAIL}">Email</a></li></ul></div>
    </div>
    <div class="foot-base label">
      <span>© <span data-year>2026</span> Aamir Mehtab Sheikh</span>
      <span>Tezpur, Assam · <span data-clock>IST</span></span>
      <span>Built by hand, frame by frame</span>
    </div>
  </div>
</footer>
'''

def chapter_nav(current, p):
    files = [c[0] for c in CHAPTERS]
    i = files.index(current)
    prev = CHAPTERS[i - 1] if i > 0 else None
    nxt = CHAPTERS[i + 1] if i < len(CHAPTERS) - 1 else None
    out = '<section class="wrap section--tight"><ul class="index-list">'
    if nxt:
        out += f'<li><a href="{p}{nxt[0]}"><span class="num">{nxt[2]}</span><span class="t">Next: {nxt[3]}</span><span class="d">{nxt[4]}</span></a></li>'
    if prev:
        out += f'<li><a href="{p}{prev[0]}"><span class="num">{prev[2]}</span><span class="t">Back: {prev[3]}</span><span class="d">{prev[4]}</span></a></li>'
    out += '</ul></section>'
    return out

def page(path, title, desc, body, current=None, night=False, depth=0, extra_head=""):
    p = "../" * depth
    cls = ' class="night"' if night else ""
    doc = head(title, desc, path, p, night, extra_head) + f"<body{cls}>\n" + header(current or path, p) + pause_menu(current or path, p) + f'<main id="main">\n{body}\n</main>\n' + footer(p) + "</body>\n</html>\n"
    doc = re.sub(r"</em>([.,?!])", r"\1</em>", doc)
    out = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(doc)
    print("wrote", path)

def page_head(roman, chapter, h1, lead):
    return f'''<section class="wrap page-head">
  <div class="chapter rv"><span class="roman">{roman}</span><span class="label">Chapter {roman} — {chapter}</span></div>
  <h1 class="h-xl split-words">{h1}</h1>
  <p class="lead muted rv rv-d2">{lead}</p>
</section>'''

def epilogue(p, heading="Have something <em>worth building</em>?"):
    return f'''<section class="epilogue">
  <div class="wrap section">
    <div class="terminal rv"><span class="dim">&gt; INTERFACE 2026 // INCOMING TRANSMISSION</span><br>&gt; PRIORITY ONE: SAY HELLO<span class="cursor"></span></div>
    <h2 class="h-xl split-words mt-m" style="max-width:12em">{heading.replace("<em>", '<em class="serif-i">')}</h2>
    <p class="mail mt-m rv"><a href="mailto:{EMAIL}">{EMAIL}</a></p>
    <div class="m-links mt-m rv"><a class="btn" href="{p}services.html">What I can make <span class="arr">→</span></a><a class="btn" href="{GITHUB}" target="_blank" rel="noopener">GitHub <span class="arr">↗</span></a></div>
  </div>
</section>'''

# ---------------------------------------------------------------- tiles
def video_tile_media(slug, cls="", full=False):
    src = M + slug + (".mp4" if full else "-loop.mp4")
    return f'''<div class="tile-media {cls}" data-preview><img src="{M}{slug}.webp" alt="" loading="lazy" decoding="async"><video muted loop playsinline preload="none" data-src="{src}" aria-hidden="true"></video></div>'''

# ================================================================= HOME
def build_home():
    reel_items = [("meant-to-be-felt", True), ("design-is-a-game", True), ("create-orange", False), ("create-blue", True), ("card-flip", True)]
    vids = ""
    ticks = ""
    for i, (s, full) in enumerate(reel_items):
        c = CLIP[s]
        vids += f'<video muted playsinline loop preload="none" data-src="{M}{s}{".mp4" if full else "-loop.mp4"}" poster="{M}{s}.webp" data-full="{M}{s}.mp4" data-title="{esc(c[1])}" data-kind="{esc(c[2])}" aria-hidden="true"></video>'
        ticks += f'<button type="button" aria-label="Show {esc(c[1])}"></button>'
    chapters = "".join(
        f'<li class="rv"><a href="{f}"><span class="num">{r}</span><span class="t">{t}</span><span class="d">{d}</span></a></li>'
        for f, l, r, t, d in CHAPTERS)
    body = f'''<div class="intro" aria-hidden="true"><i></i><span>A Tezpur production</span><i></i></div>
<section class="wrap hero">
  <div class="hero-meta label rv"><span>Aamir Mehtab Sheikh</span><span>B.Tech CSE, Tezpur University</span><span>Motion · Games · Robotics</span><span class="label--red">● Open for freelance</span></div>
  <h1 class="h-xl split-words">I make things <em>move</em> — pixels, players and robots.</h1>
  <div class="hero-foot">
    <p class="lead muted rv rv-d2">I’m a computer science student who edits, animates and designs — and writes the code for games and robots after hours. This site is my journal: the work, the struggle and what I’m learning on the way.</p>
    <div class="hero-cta rv rv-d3"><a class="btn btn--solid" href="projects.html">See the work <span class="arr">→</span></a></div>
  </div>
</section>

<section class="reel" aria-label="Showreel">
  <div class="reel-stage">{vids}<button class="reel-play" type="button" aria-label="Play with sound"></button></div>
  <div class="reel-ui"><div><p class="label lbl">Showreel</p><p class="title">Showreel</p></div><div class="reel-ticks">{ticks}</div></div>
</section>

<div class="marquee" aria-hidden="true"><div><span>Design is like a game</span><span>and I like to play</span><span>Create something new</span><span>Text isn’t just text</span><span>it’s meant to be felt</span></div><div><span>Design is like a game</span><span>and I like to play</span><span>Create something new</span><span>Text isn’t just text</span><span>it’s meant to be felt</span></div></div>

<section class="wrap section">
  <div class="s-head"><p class="label">(01) Selected work</p><h2 class="h-l split-words">Six missions. One direction: make people <span class="serif-i">feel</span> something.</h2></div>
  <div class="tiles">
    <a class="tile tile--wide rv" href="projects.html#reel">{video_tile_media("meant-to-be-felt", full=True)}<div class="tile-cap"><h3>Motion Reel 2026</h3><span class="label">16 films</span><p class="tile-kind">Kinetic type, spec ads, colour grades, tracking and 3D — including the new “Money Follows” cut.</p></div></a>
    <a class="tile rv" href="projects.html#sundown-trail"><div class="tile-media"><img src="assets/img/sundown-trail-pause.webp" alt="The paper-style pause menu from Sundown Trail" loading="lazy"></div><div class="tile-cap"><h3>Sundown Trail</h3><span class="label badge-live">In dev</span><p class="tile-kind">A western game, built piece by piece</p></div></a>
    <a class="tile rv rv-d1" href="projects.html#echo-balancer"><div class="tile-media">{art("echo")}</div><div class="tile-cap"><h3>Echo Balancer</h3><span class="label badge-live">eYRC</span><p class="tile-kind">Teaching a robot to stand still</p></div></a>
    <a class="tile tile--third rv" href="projects.html#robotic-arm"><div class="tile-media">{art("arm")}</div><div class="tile-cap"><h3>Arm Control Suite</h3><span class="label">Robotics</span><p class="tile-kind">Simulate it, then move the real one</p></div></a>
    <a class="tile tile--third rv rv-d1" href="projects.html#smart-bin"><div class="tile-media">{art("bin")}</div><div class="tile-cap"><h3>Smart Bin</h3><span class="label">SIH 2026</span><p class="tile-kind">Waste pickup, by priority</p></div></a>
    <a class="tile tile--third rv rv-d2" href="projects.html#ninety-days"><div class="tile-media">{art("ninety")}</div><div class="tile-cap"><h3>90 Day Progress</h3><span class="label">Live</span><p class="tile-kind">My accountability app</p></div></a>
  </div>
</section>

<section class="wrap section" style="padding-top:0">
  <div class="split">
    <div class="side"><p class="label">(02) The story so far</p></div>
    <div class="main wide"><p class="pull split-words">This site isn’t a résumé. It’s a <em>save file.</em></p></div>
  </div>
  <div class="split">
    <div class="side"></div>
    <div class="main prose rv">
      <p>Every chapter here is a checkpoint: what I could do, what I couldn’t yet, and what I was trying next. Some pages are finished. Most are still loading.</p>
      <p>I study computer science at Tezpur University. Outside class I cut videos and animate type, build a western game called Sundown Trail, and write control code that keeps a robot from falling over. They look like different jobs. To me it’s one job: making things that move people.</p>
      <p class="mt-m"><a class="btn" href="purpose.html">Read Chapter I <span class="arr">→</span></a></p>
    </div>
  </div>
</section>

<section class="wrap section" style="padding-top:0">
  <div class="s-head"><p class="label">(03) Chapters</p><h2 class="h-l split-words">Pick up where you left off.</h2></div>
  <ul class="index-list">{chapters}</ul>
</section>
''' + epilogue("")
    page("index.html", "Aamir Sheikh — motion designer, game developer, CS student",
         "Portfolio of Aamir Mehtab Sheikh: motion graphics, video editing, game development and robotics from a computer science student at Tezpur University.",
         body, current="index.html")

# ================================================================= STORY
def build_story():
    body = page_head("I", "Origin", "Every game starts with a <em class=\"serif-i\">tutorial</em>. This is mine.",
        "Welcome. This is where I keep a record of my work and my life as I go: what I can do, what I’m building and where I’m headed. It’s a log that keeps getting updated, not a finished résumé.")
    body += '''
<section class="wrap section" style="padding-top:0">
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
      <p>My toolkit is a strange mix: a sketchbook, a video timeline, Blender, a game engine and a C++ compiler. I like it that way. Each one is a different way of making something people feel. A cut that lands on the beat, a menu that feels good to scroll through and a robot that finally balances all give me the same small rush.</p>
    </div>
  </div>
</section>

<section class="wrap section" style="padding-top:0">
  <div class="s-head"><p class="label">The run so far</p><h2 class="h-l split-words">Checkpoints.</h2></div>
  <ol class="timeline">
    <li class="rv"><span class="when">2025</span><div><h3>Joined B.Tech CSE at Tezpur University</h3><p>New city, new syllabus, and the first time I took code seriously.</p></div></li>
    <li class="rv"><span class="when">Jan 2026</span><div><h3>Shipped version one of this site</h3><p>Hand-written HTML, a few pages and a lot of blue. It worked, and I learned I could put something on the internet.</p></div></li>
    <li class="rv"><span class="when">Jun – Aug 2026</span><div><h3>Went deep on motion design</h3><p>A Liquid Death spec spot, kinetic-type studies and my very first card-flip animation. I learned that text can perform.</p></div></li>
    <li class="rv"><span class="when">Sep 2026</span><div><h3>Smart India Hackathon + the 90-day challenge</h3><p>Built Smart Bin with Team LUMOS and started a 90-day plan to get better at academics, programming and shipping projects.</p></div></li>
    <li class="rv"><span class="when">Oct 2026</span><div><h3>Robots, a western and a 4K ad</h3><p>eYRC Echo Balancer, software for my robotic arm, Sundown Trail and the “Money Follows” edit. Then I rebuilt this site from scratch.</p></div></li>
  </ol>
</section>

<section class="wrap section" style="padding-top:0">
  <div class="split">
    <div class="side"><p class="label">Where I’m headed</p></div>
    <div class="main wide">
      <ul class="offer">
        <li class="rv"><span class="n">a.</span><h3>Ship Sundown Trail</h3><p>A playable western in the browser, then on phones.</p></li>
        <li class="rv"><span class="n">b.</span><h3>Get strong at C++ &amp; DSA</h3><p>From the basics up, one small daily task at a time.</p></li>
        <li class="rv"><span class="n">c.</span><h3>Finish eYRC strong</h3><p>Move from simulation to a robot that balances in the real world.</p></li>
        <li class="rv"><span class="n">d.</span><h3>Take on real clients</h3><p>Motion and web work for people with something worth saying.</p></li>
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
        ("Time", "There are never enough hours.", "College, competitions, editing, a game and a robot. I say yes to everything, then run out of day. Big plans are easy to make. Finishing them is the hard part.", "Small daily tasks instead of giant plans. My 90 Day Progress tracker keeps me honest, one finished thing at a time."),
        ("The learning curve", "Too much to learn, all at once.", "Control theory for eYRC, C++ from the basics, Blender, game engines, After Effects. Some weeks it feels like drinking from a fire hose.", "I learn by building. Each new idea goes into a real project the same week: a balancer, a game system or a tool."),
        ("Self-doubt", "The voice that says I’m not good enough.", "There are days I question whether I can actually pull any of this off, usually right before something works.", "I keep receipts. Every finished piece on this site is evidence against that voice."),
        ("Resources", "Not always the right tools.", "Hardware is expensive, renders are slow and my laptop has opinions about 4K footage.", "Free and open tools first: Blender, Godot, Krita, DaVinci Resolve, and simulators before hardware."),
        ("Balance", "Too many tabs open in life.", "Juggling studies, projects, competitions and people means something is always waiting.", "Clear goals, honest priorities and asking mentors for help instead of carrying everything alone."),
    ]
    rows = ""
    for i, (name, h, b, camp) in enumerate(trials, 1):
        rows += f'''<article class="trial rv">
  <div class="no">0{i}</div>
  <div class="body"><p class="label">{name}</p><h2 class="mt-s">{h}</h2><p>{b}</p></div>
  <div class="camp"><p class="label">{camp_ico} Base camp</p><p>{camp}</p></div>
</article>'''
    body = page_head("II", "A survivor is born", "Everyone shows the highlight reel. <em class=\"serif-i\">Here’s the rest.</em>",
        "These are the struggles I’m dealing with right now, and what I’m doing about each one. I’m still working through all of them.")
    body += f'<section class="wrap" style="padding-bottom:clamp(48px,8vw,120px)">{rows}</section>'
    body += '''<section class="wrap section" style="border-top:1px solid var(--rule)">
  <p class="pull split-words">Every version of me that failed taught the <em>next one</em> something.</p>
  <p class="label mt-m rv">— Note to self, build 17</p>
</section>''' + chapter_nav("struggles.html", "")
    page("struggles.html", "Struggles", "The struggles behind the work — time, the learning curve, self-doubt — and how Aamir is fighting each one. Chapter II.", body, night=True)

# ================================================================= SKILLS
SKILLS = [
    # slug, name, notches(1-5), level, blurb, tools, tech, methods, seen-in
    ("video-editing", "Video Editing", 4, "Confident", "Cuts that land on the beat, colour that sets the mood and pacing that holds attention.",
     ["Adobe Premiere Pro", "Adobe After Effects", "DaVinci Resolve"], ["Rotoscoping", "Tracking", "Masking"],
     ["Colour correction", "Colour grading", "Compositing", "Transitions", "Motion graphics"], ["money-follows", "drift-grade", "drift-tracking", "chalamet-edit", "liquid-death", "coca-cola-doc"]),
    ("graphic-design", "Graphic Design", 3, "Working", "Layout, type and image working together, from posters to thumbnails to titles.",
     ["Illustrator", "Photoshop", "Figma"], ["Rotoscoping", "Masking", "Recompositing"],
     ["Colour correction", "Colour grading", "Compositing", "Texturing", "Shading", "Text composition"], ["create-orange", "create-blue", "lego-engineering"]),
    ("frontend", "Frontend Development", 3, "Working", "Fast, hand-written websites that work on every screen, including this one.",
     ["VS Code", "Chrome DevTools", "Figma"], ["HTML5", "CSS3", "JavaScript", "React (learning)"],
     ["Responsive design", "Mobile-first layout", "Clean UI structure"], []),
    ("drawing", "Drawing & Sketching", 3, "Working", "Where every idea starts: thumbnails, characters and backgrounds.",
     ["2D Pincel", "Krita", "Sketchbook"], ["Graphics tablet", "Traditional tools"],
     ["Sketching", "Shading", "Line art", "Inking", "Colouring", "Character design", "Background art", "Concept art", "Composition"], []),
    ("animation", "Animation", 2, "Learning", "Frame by frame or keyframed: making things feel alive.",
     ["OpenToonz", "Adobe Animate", "Blender", "Cascadeur"], ["Frame interpolation", "Animation principles", "Upscaling"],
     ["Frame by frame", "2D animation", "3D animation"], ["card-flip", "ink-reveal", "meant-to-be-felt", "design-is-a-game", "this-is-my", "physics-robotics"]),
    ("modeling-3d", "3D Modelling", 2, "Learning", "Blocking out worlds and props, then texturing and lighting them.",
     ["Blender", "Cascadeur", "Unreal Engine"], ["Modelling", "Texturing", "Rendering"],
     ["Hard-surface modelling", "Sculpting", "Shading"], ["blind-justice"]),
    ("game-dev", "Game Development", 2, "Learning", "Systems, feel and atmosphere. Currently pouring all of it into Sundown Trail.",
     ["Godot", "Unreal Engine", "Unity", "Blender"], ["C++", "Collision", "Physics"],
     ["Game logic", "Modelling", "Animation", "UI / menus"], []),
    ("programming-robotics", "Programming & Robotics", 2, "Learning", "C++ from the ground up, Python for control and hardware that talks back.",
     ["Python", "C++", "CoppeliaSim", "Arduino IDE"], ["PID control", "LQR control", "ESP32 · LoRa", "Serial comms"],
     ["Simulation first", "Small daily practice", "Build to learn"], []),
]

def notches(n):
    return '<span class="notches" aria-hidden="true">' + "".join(f'<i class="{"f" if i < n else ""}"></i>' for i in range(5)) + '</span>'

def build_skills():
    cards = ""
    for i, s in enumerate(SKILLS):
        slug, name, n, lvl, blurb, tools, tech, methods, seen = s
        cards += f'''<a class="charm rv" href="skills/{slug}.html">
  <div class="top"><span class="label">{i+1:02d}</span></div>
  <h2>{name}</h2>
  <div class="top-r">{notches(n)}<span class="notches-lbl">{lvl}</span><span class="sr">Level: {lvl}, {n} of 5</span></div>
  <p>{blurb}</p>
  <p class="tools">{" · ".join(tools)}</p>
  <span class="go" aria-hidden="true">↗</span>
</a>'''
    body = page_head("III", "Craft", "Tools change. <em class=\"serif-i\">Taste</em> compounds.",
        "These are the skills I’m carrying right now. The filled notches show how much of my build each one takes: a lot of editing, and a growing amount of code.")
    body += f'''<section class="wrap" style="padding-bottom:clamp(48px,8vw,120px)">
  <p class="label rv" style="margin-bottom:18px">● = equipped notch · 5 max</p>
  <div class="charms">{cards}</div>
</section>''' + chapter_nav("skills.html", "")
    page("skills.html", "Skills", "Aamir Sheikh’s skills: video editing, motion graphics, graphic design, frontend, drawing, animation, 3D, game development and robotics. Chapter III.", body)

    for i, s in enumerate(SKILLS):
        slug, name, n, lvl, blurb, tools, tech, methods, seen = s
        li = lambda xs: "".join(f"<li>{esc(x)}</li>" for x in xs)
        seen_html = ""
        if seen:
            clips = ""
            for c in seen:
                C = CLIP[c]
                ori = C[4]
                clips += f'''<a class="clip {ori} rv" href="../{M}{c}.mp4" data-play="../{M}{c}.mp4" data-title="{esc(C[1])}" data-poster="../{M}{c}.webp">{video_tile_media(c).replace('src="' + M, 'src="../' + M).replace('data-src="' + M, 'data-src="../' + M)}<div class="tile-cap"><h3>{esc(C[1])}</h3><span class="label">{C[3]}</span><p class="tile-kind">{esc(C[2])}</p></div></a>'''
            seen_html = f'<section class="wrap section" style="padding-top:0"><div class="s-head"><p class="label">Seen in</p><h2 class="h-l">Proof of work.</h2></div><div class="reel-grid">{clips}</div></section>'
        prev = SKILLS[i - 1]; nxt = SKILLS[(i + 1) % len(SKILLS)]
        body = f'''<section class="wrap page-head">
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
{seen_html}
<section class="wrap section--tight"><ul class="index-list">
  <li><a href="{nxt[0]}.html"><span class="num">→</span><span class="t">{nxt[1]}</span><span class="d">Next skill</span></a></li>
  <li><a href="{prev[0]}.html"><span class="num">←</span><span class="t">{prev[1]}</span><span class="d">Previous skill</span></a></li>
</ul></section>'''
        page(f"skills/{slug}.html", name, f"{name} — tools, technologies and methods Aamir Sheikh uses.", body, current="skills.html", depth=1)

# ================================================================= WORK
def build_work():
    def clip_html(c):
        slug, title, kind, year, ori = c
        return f'''<a class="clip {ori} rv" href="{M}{slug}.mp4" data-play="{M}{slug}.mp4" data-title="{esc(title)}" data-poster="{M}{slug}.webp">{video_tile_media(slug)}<span class="play-ico">▶ Play</span><div class="tile-cap"><h3>{esc(title)}</h3><span class="label">{year}</span><p class="tile-kind">{esc(kind)}</p></div></a>'''
    clips = "".join(clip_html(c) for c in CLIPS)
    clips2 = "".join(clip_html(c) for c in CLIPS2)

    def mission(id_, tags, num, patch_txt, media, title, role, text, facts, links):
        dl = "".join(f"<dt>{k}</dt><dd>{v}</dd>" for k, v in facts)
        ln = "".join(links)
        return f'''<article class="mission" id="{id_}" data-tags="{tags}">
  <div class="m-media rv"><div class="frame">{media}{patch(patch_txt, num)}</div></div>
  <div class="m-text rv rv-d1">
    <p class="label">Mission {num}</p>
    <h2>{title}</h2>
    <p class="role">{role}</p>
    <div class="prose">{text}</div>
    <dl class="facts">{dl}</dl>
    <div class="m-links">{ln}</div>
  </div>
</article>'''

    m = ""
    m += mission("sundown-trail", "games", "02", "SUNDOWN TRAIL · WESTERN · IN DEVELOPMENT · ",
        '<img src="assets/img/sundown-trail-pause.webp" alt="Sundown Trail’s paper-journal pause menu: Resume, Save game, Load game, Settings, Quit to title" loading="lazy">',
        "Sundown Trail", "A western game, built one piece at a time",
        "<p>Red Dead Redemption 2 made me want to build a world, not just a level. Sundown Trail is my attempt: a frontier game with mid-poly visuals, a paper-journal interface and a lot of dust.</p><p>I’m building it the way you’d eat an elephant, one system at a time: terrain, movement, menus, then the story. The pause menu above is one of the first pieces I finished.</p>",
        [("Status", '<span class="badge-live">In development</span>'), ("Focus", "Game design · UI · Blender environment art"), ("Platform", "Browser first, then Android &amp; iOS"), ("Look", "Mid-poly, 30 fps, baked Blender textures")], [])
    m += mission("echo-balancer", "robotics software", "03", "ECHO BALANCER · eYRC 2026–27 · ",
        art("echo"), "Echo Balancer", "e-Yantra Robotics Competition 2026–27",
        "<p>The challenge is to keep an unstable robot upright. I’m working through the theme’s tasks in CoppeliaSim, starting with a PID controller and then moving to LQR for smoother, more efficient balancing.</p><p>It’s the most maths I’ve ever enjoyed: every gain I tune shows up right away as a wobble or as stillness.</p>",
        [("Status", '<span class="badge-live">In progress</span>'), ("Stack", "Python · CoppeliaSim"), ("Control", "PID → LQR"), ("Competition", "eYRC by e-Yantra, IIT Bombay")], [])
    m += mission("robotic-arm", "robotics software", "04", "ARM CONTROL SUITE · SIM TO REAL · ",
        art("arm"), "Arm Control Suite", "Desktop software for my robotic arm",
        "<p>I have a physical robotic arm with a gripper. I’m writing desktop software that simulates it, works out its motion, shows it in 3D and then sends the same moves to the real arm.</p><p>The goal: test a move on screen, press one button and watch the real arm do it.</p>",
        [("Status", '<span class="badge-live">In development</span>'), ("Hardware", "Robotic arm + gripper"), ("Firmware", "Arduino IDE"), ("Software", "Simulation · kinematics · 3D view · control")], [])
    m += mission("smart-bin", "robotics software", "05", "SMART BIN · SIH 2026 · TEAM LUMOS · ",
        art("bin"), "Smart Bin", "Smart India Hackathon 2026 — Team LUMOS",
        "<p>An IoT system for smart waste management. Bins measure how full they are and report over long-range radio, then a priority engine tells collection drivers which bins need them first.</p>",
        [("Problem", "PS 195 · Smart Waste Management"), ("Hardware", "ESP32-C3 · radar fill sensor · SX1278 LoRa"), ("Backend", "FastAPI · MongoDB priority engine"), ("App", "React Native (Expo) driver app")],
        ['<a class="btn" href="https://github.com/BachirAfx/WasteFlow" target="_blank" rel="noopener">Code on GitHub <span class="arr">↗</span></a>'])
    m += mission("ninety-days", "software", "06", "90 DAY PROGRESS · ONE THING A DAY · ",
        art("ninety"), "90 Day Progress", "A personal accountability app",
        "<p>I tend to make big plans and struggle to finish them. So I built a tracker for a 90-day challenge covering academics, programming, projects and skills, with small daily tasks and no overload.</p><p>Progress is saved on your own device, and you can export or import it as JSON.</p>",
        [("Status", "Live"), ("Stack", "React · TypeScript"), ("Storage", "localStorage · JSON export/import")],
        ['<a class="btn btn--solid" href="90-day-progress/">Open the app <span class="arr">↗</span></a>'])

    body = page_head("IV", "Missions", "The missions <em class=\"serif-i\">log.</em>",
        "Motion design, games, robots and software. Some of these are finished and most are in progress. Hover a film to preview it and click to watch with sound.")
    body += f'''<section class="wrap" style="padding-bottom:clamp(48px,8vw,120px)">
  <div class="filters" role="group" aria-label="Filter missions">
    <button type="button" data-filter="all" aria-pressed="true">All</button>
    <button type="button" data-filter="motion" aria-pressed="false">Motion</button>
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
  {m}
</section>
<div class="rank" aria-hidden="true"><b>D</b><span>Dull</span></div>''' + chapter_nav("projects.html", "")
    page("projects.html", "Work", "Projects by Aamir Sheikh: a 2026 motion reel, Sundown Trail, eYRC Echo Balancer, robotic arm software, SIH Smart Bin and 90 Day Progress. Chapter IV.", body)

# ================================================================= INSPIRATIONS
def build_inspirations():
    def P(title, meta, take, desc="", cls="", id_="", serif=False):
        idattr = f' id="{id_}"' if id_ else ""
        h = f'<h3 class="serif-i">{title}</h3>' if serif else f"<h3>{title}</h3>"
        d = f"<p>{desc}</p>" if desc else ""
        return f'<article class="panel {cls} rv"{idattr}><span class="speed"></span><p class="label">{meta}</p>{h}{d}<p class="take">{take}</p></article>'

    games = "".join([
        P("Red Dead Redemption 2", "Game · 2018", "A world that doesn’t need you, which is why you care about it.", "The reason Sundown Trail exists. The journal, the pause menu and the patience all come from here.", "w8 dark"),
        P("Stray", "Game · 2022", "Tell the story with the camera at knee height.", "", "tone", "stray"),
        P("Hollow Knight", "Game · 2017", "Restraint. A tiny palette and a huge sense of place.", "", "w3"),
        P("Tomb Raider · Rise · Shadow", "Games · 2013 – 2018", "The best origin stories are about surviving, not winning.", "The struggles chapter is named after this trilogy.", "w3 red"),
        P("Marvel’s Spider-Man 2", "Game · 2023", "Movement should feel good before it means anything.", "", "w6"),
        P("NieR: Automata", "Game · 2017", "The interface can be part of the story.", "", "w3 dark"),
        P("Devil May Cry", "Games · 2001 –", "Style is a score. Earn the S rank.", "", "w3"),
        P("Stellar Blade", "Game · 2024", "Polish is a form of respect for the player.", "", "w6 tone"),
    ])
    films = "".join([
        P("The Shawshank Redemption", "Film · 1994", "Patience is a plan. So is hope.", "", "w6 dark", serif=True),
        P("12 Angry Men", "Film · 1957", "One room, one argument, no wasted frame.", "", "w6", serif=True),
        P("The Lighthouse", "Film · 2019", "Black, white and grain can be enough.", "The film grain on this site is a quiet nod.", "w4 tone", serif=True),
        P("Atonement", "Film · 2007", "One long take can carry a whole war.", "", "w4", serif=True),
        P("Fight Club", "Film · 1999", "Every frame can hide something. Make people look twice.", "", "w4 dark", serif=True),
        P("Alien — Ripley", "Film · 1979", "Competence is the most heroic trait.", "Hence the green terminal at the bottom of each page.", "w4", serif=True),
        P("Mickey 17", "Film · 2025", "Each version of you gets a little better.", "", "w4 red", serif=True),
        P("Thunderbolts*", "Film · 2025", "Broken people can still make a team.", "", "w4", serif=True),
        P("The Fantastic Four: First Steps", "Film · 2025", "Retro-futurism. The future as people once imagined it.", "The mission patches come from here.", "w6 tone", serif=True),
        P("Spider-Man: Brand New Day", "Film · 2026", "Starting over isn’t the same as starting from zero.", "", "w6 dark", serif=True),
        P("Puss in Boots: The Last Wish", "Film · 2022", "Animation that looks painted and moves like a comic.", "", "w6", serif=True),
        P("Aladdin", "Film · Disney", "Wonder first, logic later.", "", "w6 tone", serif=True),
    ])
    anim = "".join([
        P("Ne Zha", "Animated film · 2019", "Fight the fate people write for you.", "", "w6 red"),
        P("Jiang Ziya", "Animated film · 2020", "Ink, myth and big empty skies.", "The brush stroke under the headlines is a nod.", "w6 dark"),
        P("One Piece", "Anime · 1999 –", "Find your crew and keep sailing.", "", "w4 tone"),
        P("Hunter × Hunter", "Anime · 2011", "Rules make power interesting.", "", "w4"),
        P("Dororo", "Anime · 2019", "Get back what was taken from you, one piece at a time.", "", "w4 dark"),
        P("Dorohedoro", "Anime · 2020", "Grime and warmth can share a frame.", "", "w6"),
        P("Parasyte -the maxim-", "Anime · 2014", "Change from the inside is still change.", "", "w6 tone"),
    ])
    people = f'''
<article class="panel has-img w6 rv" style="min-height:340px"><img src="assets/img/mackesy-1.webp" alt="Charlie Mackesy illustration backdrop from The Boy, the Mole, the Fox and the Horse" loading="lazy"><div class="cap"><p class="label">Book &amp; film · Charlie Mackesy</p><h3>The Boy, the Mole, the Fox &amp; the Horse</h3></div></article>
<article class="panel w6 rv"><span class="speed"></span><p class="label">People who build quietly</p><h3 class="serif-i">Charlie Mackesy</h3><p>Inspired by people who show up every day and build quietly. A few lines of ink and a kind sentence can carry more than a blockbuster.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:auto"><img src="assets/img/mackesy-2.webp" alt="" loading="lazy" style="aspect-ratio:3/2;object-fit:cover;filter:grayscale(1)"><img src="assets/img/mackesy-3.webp" alt="" loading="lazy" style="aspect-ratio:3/2;object-fit:cover;filter:grayscale(1)"></div></article>
<a class="panel has-img w8 rv" href="{M}chalamet-edit.mp4" data-play="{M}chalamet-edit.mp4" data-title="Chalamet — fan edit" data-poster="assets/img/chalamet.webp" style="min-height:340px;text-align:left;cursor:pointer"><img src="assets/img/chalamet.webp" alt="Timothée Chalamet wallpaper" loading="lazy"><div class="cap"><p class="label">Actor · ▶ watch my edit</p><h3><s style="opacity:.6">Less noise, more meaning.</s> More noise, more meaning.</h3></div></a>
<article class="panel w4 red rv"><span class="speed"></span><p class="label">Design studio</p><h3>Pentagram</h3><p>The reason this site looks the way it does: big type, a strict grid and letting the work speak.</p><p class="take">Hierarchy is kindness.</p></article>
'''
    body = page_head("V", "Inspirations", "Everything I love <em class=\"serif-i\">leaves a mark.</em>",
        "These are the games, films, anime and people I keep coming back to, along with the one thing I took from each. You’ll find small nods to most of them hidden around this site. Hover a panel to see it come alive.")
    body += f'''<section class="wrap" style="padding-bottom:clamp(48px,8vw,120px)">
  <div class="cat-head"><span class="label">01</span><h2>Games</h2></div><div class="panels">{games}</div>
  <div class="cat-head"><span class="label">02</span><h2>Films</h2></div><div class="panels">{films}</div>
  <div class="cat-head"><span class="label">03</span><h2>Anime &amp; animation</h2></div><div class="panels">{anim}</div>
  <div class="cat-head"><span class="label">04</span><h2>People</h2></div><div class="panels">{people}</div>
  <p class="pull split-words mt-l">Feel the <em>silence</em>.</p>
</section>''' + chapter_nav("inspirations.html", "")
    page("inspirations.html", "Inspirations", "The games, films, anime and people that inspire Aamir Sheikh’s work, from Red Dead Redemption 2 to The Lighthouse to One Piece. Chapter V.", body)

# ================================================================= SERVICES
def build_services():
    body = page_head("VI", "Side quests", "Side quests <em class=\"serif-i\">welcome.</em>",
        "I take on a small number of freelance projects alongside my studies. If you have a story to tell, a product to show or a site that needs to exist, let’s talk.")
    body += f'''<section class="wrap" style="padding-bottom:clamp(48px,8vw,120px)">
  <ul class="offer">
    <li class="rv"><span class="n">01</span><h3>Video editing</h3><p>Reels, ads, YouTube and short films: the cut, colour grade, sound and pacing. Tools: Premiere Pro, After Effects, DaVinci Resolve.</p></li>
    <li class="rv"><span class="n">02</span><h3>Motion graphics</h3><p>Kinetic typography, title sequences, logo animations and spec ads. See the <a class="link" href="projects.html#reel">motion reel</a>.</p></li>
    <li class="rv"><span class="n">03</span><h3>Web design</h3><p>Layouts with a clear hierarchy and a little personality, designed mobile-first.</p></li>
    <li class="rv"><span class="n">04</span><h3>Web development</h3><p>Fast, hand-coded HTML, CSS and JavaScript sites like this one. No bloat, easy to host.</p></li>
  </ul>
</section>
<section class="wrap section" style="padding-top:0">
  <div class="s-head"><p class="label">How it works</p><h2 class="h-l split-words">Four steps. No surprises.</h2></div>
  <div class="steps">
    <div class="rv"><p class="label">Step 1</p><h3>Brief</h3><p>You tell me the goal, the audience and the deadline. I ask the annoying questions.</p></div>
    <div class="rv rv-d1"><p class="label">Step 2</p><h3>Board</h3><p>References, a rough storyboard or wireframe, and an agreed direction before I build anything.</p></div>
    <div class="rv rv-d2"><p class="label">Step 3</p><h3>Build</h3><p>I make it and share progress, with two rounds of revisions included.</p></div>
    <div class="rv rv-d3"><p class="label">Step 4</p><h3>Deliver</h3><p>Final files in the formats you need, and the project files if you want them.</p></div>
  </div>
</section>
<section class="wrap section" style="padding-top:0">
  <div class="s-head"><p class="label">The case</p><h2 class="h-l split-words">Why work with me. <span class="serif-i">Three exhibits.</span></h2></div>
  <ul class="offer">
    <li class="rv"><span class="n">A</span><h3>Two languages</h3><p>I speak both design and code, so the thing you approve is the thing that ships.</p></li>
    <li class="rv"><span class="n">B</span><h3>Obsessive about feel</h3><p>Years of games and films taught me that timing is everything. I sweat the frames.</p></li>
    <li class="rv"><span class="n">C</span><h3>Honest</h3><p>Clear timelines, clear limits. If it isn’t my strength, I’ll tell you.</p></li>
  </ul>
</section>
''' + epilogue("", "Let’s make something <em>worth watching</em>.")
    page("services.html", "Services", "Hire Aamir Sheikh for video editing, motion graphics, web design and web development. Chapter VI.", body)

# ================================================================= 404
def build_404():
    body = '''<section class="wrap lost">
  <div>
    <p class="label label--red">Error 404</p>
    <h1 class="mega serif-i mt-s" style="font-family:var(--f-serif);font-weight:400">Lost in the fog.</h1>
    <p class="lead muted mt-m" style="margin-inline:auto">This page doesn’t exist, or it got cut in the edit.</p>
    <p class="mt-m"><a class="btn" href="/">Respawn at home <span class="arr">→</span></a></p>
  </div>
</section>'''
    # 404 is served at any depth, so use absolute paths
    doc = head("Lost", "Page not found.", "404.html", "/", True) + '<body class="night">\n' + header("", "/") + pause_menu("", "/") + f'<main id="main">{body}</main>\n' + footer("/") + "</body>\n</html>\n"
    with open(os.path.join(ROOT, "404.html"), "w", encoding="utf-8") as f: f.write(doc)
    print("wrote 404.html")

if __name__ == "__main__":
    build_home(); build_story(); build_struggles(); build_skills(); build_work(); build_inspirations(); build_services(); build_404()
