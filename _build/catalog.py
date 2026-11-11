# THE AAMIR SHEIKH — the price list. This is the only place prices live.
#
# build.py turns it into:
#   services.html                 the price list visitors see
#   order.html                    the chips on the WhatsApp / Gmail order form
#   assets/js/catalog.js          names and prices for the order panel, the account page and the admin page
#   functions/_lib/catalog.js     the prices the server charges (never taken from the browser)
#
# To change a price: edit it here, run  python3 _build/build.py , then push the preview.
# Amounts are whole rupees here. The database stores paise.
#
# kind   "fixed"  one price. With ASAP or 2–4 weeks it can be ordered and paid at once.
#        "range"  a low–high range. Always a request: the owner sets the final price.
#        "from"   a starting price. Always a request.
#        "quote"  price after talking. Always a request.
# unit   seconds of video one price covers. The customer picks 1–UNIT_MAX of them and the price
#        multiplies. "Longer" turns the order into a request.
# tiers  styles of one service, each with its own range. The customer picks one.
# note   a short line under the price (translated on the page).
# free   the first order of this service on an account costs nothing.

UNIT_MAX = 10
CURRENCY = "INR"

GROUPS = [
    # id, name, icon
    ("video", "Video", "clapperboard"),
    ("3d", "3D", "box"),
    ("design", "Design", "pen-tool"),
    ("web", "Web", "code-xml"),
    ("games", "Games", "gamepad-2"),
    ("sim", "Simulation and robotics", "bot"),
]

MOTION_TIERS = [
    ("plain", "No motion graphics", 200, 500),
    ("light", "Light motion", 800, 1000),
    ("heavy", "Heavy motion graphics", 1500, 3000),
]

ITEMS = [
    # id, group, name, kind, min, max, extra
    ("reels", "video", "Reels / Shorts", "range", None, None, {"tiers": MOTION_TIERS}),
    ("ads", "video", "Ads and promos", "range", None, None, {"tiers": MOTION_TIERS}),
    ("colour", "video", "Colour grading", "fixed", 3000, None, {}),
    ("youtube", "video", "YouTube video", "fixed", 1000, None, {"unit": 60}),
    ("tracking", "video", "Motion tracking", "fixed", 300, None, {"unit": 10}),
    ("kinetic", "video", "Kinetic typography", "fixed", 1000, None, {}),
    ("logoanim", "video", "Logo animation and morphing", "range", 500, 1000, {"unit": 10}),
    ("explainer", "video", "Explainer video", "fixed", 3000, None, {"unit": 180}),
    ("titles", "video", "Title sequence", "quote", None, None, {}),

    ("render", "3d", "Product render", "from", 3000, None, {"note": "Based on detail"}),
    ("model", "3d", "3D model", "range", 200, 15000, {}),
    ("anim3d", "3d", "3D animation", "range", 3000, 10000, {"unit": 10}),

    ("poster", "design", "Poster", "range", 100, 1000, {}),
    ("thumb", "design", "Thumbnail", "range", 50, 500, {"free": True, "note": "First one free (one per account)"}),
    ("logo", "design", "Logo", "fixed", 1000, None, {}),
    ("social", "design", "Social posts", "range", 200, 2000, {}),

    ("portfolio", "web", "Portfolio site", "range", 3000, 10000, {}),
    ("landing", "web", "Landing page", "range", 3000, 10000, {}),
    ("signin", "web", "Sign-in + database", "range", 20000, 50000, {"note": "With domain and 6 months of maintenance"}),
    ("scale", "web", "Scalability plans", "range", 30000, 100000, {}),
    ("sitefix", "web", "Fix / speed up my site", "quote", None, None, {}),

    ("gameui", "games", "Game UI / menus", "range", 3000, 10000, {}),
    ("proto", "games", "Prototype", "range", 15000, 200000, {}),
    ("fullgame", "games", "Final product with live monitoring", "range", 2000000, 10000000, {"note": "Everything included. Depends on server size."}),

    ("sim", "sim", "Simulation", "range", 2000, 50000, {}),
    ("simrender", "sim", "Simulation render results", "range", 5000, 50000, {}),
    ("robotics", "sim", "Robotics guidance and robot blueprints", "quote", None, None, {}),
    ("arduino", "sim", "Arduino / ESP32", "quote", None, None, {}),
    ("python", "sim", "Python script", "quote", None, None, {}),
]

# How timing changes the price, as a percentage of the base price: (low, high).
# ASAP doubles it. 2–4 weeks is 5% off. For 1 week the owner picks 100–150%.
# Flexible is agreed after talking, so the base price is only an estimate.
TIMING = [
    ("asap", "ASAP", 200, 200),
    ("week", "1 week", 100, 150),
    ("month", "2–4 weeks", 95, 95),
    ("flex", "Flexible", 100, 100),
]

# Words for each unit length, shown after the price ("₹1,000 per minute").
UNIT_WORDS = {10: "per 10 seconds", 60: "per minute", 180: "per 3 minutes"}


def data():
    """The catalog as plain data, shared by the page script and the server."""
    items, order = {}, []
    for iid, g, name, kind, lo, hi, extra in ITEMS:
        tiers = extra.get("tiers")
        if tiers:
            lo, hi = min(t[2] for t in tiers), max(t[3] for t in tiers)
        assert kind in ("fixed", "range", "from", "quote"), iid
        assert kind == "quote" or lo, iid
        assert iid not in items, iid
        items[iid] = {
            "g": g, "name": name, "kind": kind, "min": lo, "max": hi,
            "unit": extra.get("unit"), "note": extra.get("note"), "free": bool(extra.get("free")),
            "tiers": [{"id": t[0], "name": t[1], "min": t[2], "max": t[3]} for t in tiers] if tiers else None,
        }
        order.append(iid)
    return {
        "currency": CURRENCY, "unitMax": UNIT_MAX,
        "groups": [{"id": g, "name": n, "icon": i} for g, n, i in GROUPS],
        "items": items, "order": order,
        "timing": [{"id": t, "name": n, "lo": a, "hi": b} for t, n, a, b in TIMING],
        "unitWords": {str(k): v for k, v in UNIT_WORDS.items()},
    }
