/* The pricing rules. build.py copies this file, word for word, into assets/js/catalog.js (the
   order panel's live price) and functions/_lib/catalog.js (the price the server charges), so the
   two can never disagree. Plain ES5 on purpose: it has to run in every browser and in Cloudflare.
   Amounts are whole rupees. CATALOG is defined just above this text in both files. */

function pct(r, p) { return Math.round(r * p / 100); }

function timingOf(id) {
  for (var i = 0; i < CATALOG.timing.length; i++) if (CATALOG.timing[i].id === id) return CATALOG.timing[i];
  return null;
}

/* What one service costs with the customer's choices.
   o = { tier, units, timing, firstFree }
     units      how many lengths of video (1 to unitMax), or 0 for "longer than that"
     firstFree  set by the server only: this account has no earlier order of a "free" service
   Returns { error: "service" | "tier" | "units" | "timing" } when a choice is missing or not on the
   list. Otherwise:
     instant  true: the price is final and the customer can pay straight away
     amount   that final price (also 0 when the first-one-free rule applies)
     est      a guide for requests: { min, max, from }. max null means one figure; from means "from"
     free     the first-one-free rule applied */
function quote(id, o) {
  var it = CATALOG.items[id];
  if (!it) return { error: "service" };
  o = o || {};
  var tier = null, i;
  if (it.tiers) {
    for (i = 0; i < it.tiers.length; i++) if (it.tiers[i].id === o.tier) tier = it.tiers[i];
    if (!tier) return { error: "tier" };
  }
  var units = 1, longer = false;
  if (it.unit) {
    units = Number(o.units);
    if (units === 0) longer = true;
    else if (!(units >= 1 && units <= CATALOG.unitMax && Math.floor(units) === units)) return { error: "units" };
  }
  var t = timingOf(o.timing);
  if (!t) return { error: "timing" };
  var kind = tier ? "range" : it.kind, lo = tier ? tier.min : it.min, hi = tier ? tier.max : it.max;
  var q = { instant: false, amount: null, est: null, free: false, kind: kind };
  if (it.free && o.firstFree) { q.free = true; q.amount = 0; return q; }
  if (kind === "quote") return q;
  if (longer) { q.est = { min: pct(lo, t.lo), max: null, from: true }; return q; }
  var a = lo * units, b = hi === null || hi === undefined ? null : hi * units;
  if (kind === "fixed" && t.lo === t.hi && t.id !== "flex") { q.instant = true; q.amount = pct(a, t.lo); return q; }
  if (kind === "fixed") { q.est = { min: pct(a, t.lo), max: t.hi !== t.lo ? pct(a, t.hi) : null, from: false }; return q; }
  if (kind === "from" || b === null) { q.est = { min: pct(a, t.lo), max: null, from: true }; return q; }
  q.est = { min: pct(a, t.lo), max: pct(b, t.hi), from: false };
  return q;
}

/* "3:00" for 3 units of a 60-second service. null when the service has no length. */
function lengthOf(id, units) {
  var it = CATALOG.items[id];
  if (!it || !it.unit || !units) return null;
  var s = it.unit * units, m = Math.floor(s / 60), r = s % 60;
  return m + ":" + (r < 10 ? "0" : "") + r;
}
