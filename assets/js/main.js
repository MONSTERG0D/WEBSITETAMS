/* THE AAMIR SHEIKH — interactions. Vanilla, no dependencies. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canHover = window.matchMedia("(hover: hover)").matches;
  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }

  /* ---------- header border on scroll ---------- */
  var head = $(".site-head");
  function onScroll() { if (head) head.classList.toggle("scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* ---------- letterbox intro (home, once per session) ---------- */
  var intro = $(".intro");
  if (intro && !reduce && !store("seenIntro")) {
    store("seenIntro", "1");
    intro.classList.add("play");
    setTimeout(function () { intro.classList.add("go"); }, 900);
    setTimeout(function () { intro.classList.add("done"); }, 1500);
    setTimeout(function () { intro.classList.remove("play"); }, 2700);
  }

  /* ---------- pause menu ---------- */
  var pause = $("#pause"), lastFocus = null;
  function openPause() {
    if (!pause) return;
    lastFocus = doc.activeElement;
    pause.classList.add("open"); pause.setAttribute("aria-hidden", "false");
    $$(".menu-btn").forEach(function (b) { b.setAttribute("aria-expanded", "true"); });
    root.style.overflow = "hidden";
    var first = $(".pause-list a, .pause-list button", pause); if (first) setTimeout(function () { first.focus(); }, 60);
  }
  function closePause() {
    if (!pause || !pause.classList.contains("open")) return;
    pause.classList.remove("open"); pause.setAttribute("aria-hidden", "true");
    $$(".menu-btn").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    root.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  }
  $$(".menu-btn").forEach(function (b) { b.addEventListener("click", openPause); });
  if (pause) {
    pause.addEventListener("click", function (e) { if (e.target === pause || e.target.closest("[data-resume]")) closePause(); });
    pause.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var f = $$("a, button", pause); if (!f.length) return;
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && doc.activeElement === z) { e.preventDefault(); a.focus(); }
    });
    // arrow keys move through the menu like a game
    pause.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      var items = $$(".pause-list a, .pause-list button", pause), i = items.indexOf(doc.activeElement);
      e.preventDefault();
      var n = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[n].focus();
    });
  }

  /* ---------- lightbox player ---------- */
  var player = $("#player"), pv = player && $("video", player), pt = player && $(".player-title", player);
  function openPlayer(src, title, poster) {
    if (!player) return;
    pv.src = src; if (poster) pv.poster = poster;
    pt.textContent = title || "";
    player.classList.add("open"); player.setAttribute("aria-hidden", "false");
    root.style.overflow = "hidden";
    pv.muted = false; var p = pv.play(); if (p && p.catch) p.catch(function () {});
    $(".player-close", player).focus();
  }
  function closePlayer() {
    if (!player || !player.classList.contains("open")) return;
    pv.pause(); pv.removeAttribute("src"); pv.load();
    player.classList.remove("open"); player.setAttribute("aria-hidden", "true");
    root.style.overflow = "";
  }
  if (player) {
    player.addEventListener("click", function (e) { if (e.target === player || e.target.closest(".player-close")) closePlayer(); });
  }
  doc.addEventListener("click", function (e) {
    var t = e.target.closest("[data-play]");
    if (!t) return;
    e.preventDefault();
    openPlayer(t.getAttribute("data-play"), t.getAttribute("data-title"), t.getAttribute("data-poster"));
  });

  /* ---------- keyboard: Esc = pause / back ---------- */
  doc.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (player && player.classList.contains("open")) return closePlayer();
    if (pause && pause.classList.contains("open")) return closePause();
    var tag = (doc.activeElement && doc.activeElement.tagName) || "";
    if (tag !== "INPUT" && tag !== "TEXTAREA") openPause();
  });

  /* ---------- lazy hover/scroll video previews ---------- */
  function loadVid(v) {
    if (v.dataset.src && !v.src) { v.src = v.dataset.src; }
  }
  function playIn(media) {
    var v = $("video", media); if (!v) return;
    loadVid(v);
    var p = v.play(); if (p && p.then) p.then(function () { media.classList.add("playing"); }).catch(function () {}); else media.classList.add("playing");
  }
  function stopIn(media) {
    var v = $("video", media); if (!v) return;
    v.pause(); media.classList.remove("playing");
  }
  var previews = $$(".tile-media[data-preview]");
  if (!reduce) {
    if (canHover) {
      previews.forEach(function (m) {
        var host = m.closest(".tile, .clip") || m;
        host.addEventListener("mouseenter", function () { playIn(m); });
        host.addEventListener("mouseleave", function () { stopIn(m); });
        host.addEventListener("focus", function () { playIn(m); }, true);
        host.addEventListener("blur", function () { stopIn(m); }, true);
      });
    } else if ("IntersectionObserver" in window) {
      var vio = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting && en.intersectionRatio > .6) playIn(en.target); else stopIn(en.target); });
      }, { threshold: [0, .6, 1] });
      previews.forEach(function (m) { vio.observe(m); });
    }
  }

  /* ---------- home reel: cycles muted loops ---------- */
  var reel = $(".reel");
  if (reel) {
    var vids = $$(".reel-stage video", reel), ticks = $$(".reel-ticks button", reel);
    var rt = $(".reel-ui .title", reel), rl = $(".reel-ui .lbl", reel), rp = $(".reel-play", reel);
    var idx = -1, timer = null, visible = false;
    function show(i) {
      if (timer) clearTimeout(timer);
      idx = (i + vids.length) % vids.length;
      vids.forEach(function (v, j) {
        if (j === idx) { loadVid(v); v.currentTime = 0; var p = v.play(); if (p && p.catch) p.catch(function () {}); v.classList.add("on"); }
        else { v.classList.remove("on"); (function (vv) { setTimeout(function () { vv.pause(); }, 800); })(v); }
      });
      ticks.forEach(function (t, j) { t.classList.remove("on"); void t.offsetWidth; if (j === idx) t.classList.add("on"); });
      var v = vids[idx];
      rt.textContent = v.dataset.title; rl.textContent = v.dataset.kind;
      rp.setAttribute("data-play", v.dataset.full); rp.setAttribute("data-title", v.dataset.title); rp.setAttribute("data-poster", v.poster);
      rp.setAttribute("aria-label", "Play " + v.dataset.title + " with sound");
      if (!reduce) timer = setTimeout(function () { if (visible) show(idx + 1); }, 6000);
    }
    ticks.forEach(function (t, j) { t.addEventListener("click", function (e) { e.stopPropagation(); show(j); }); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible && idx === -1) show(0);
        else if (visible) { var v = vids[idx]; v.play().catch(function () {}); if (!timer) show(idx); }
        else if (idx > -1) { vids[idx].pause(); clearTimeout(timer); timer = null; }
      }, { threshold: .25 }).observe(reel);
    } else { visible = true; show(0); }
  }

  /* ---------- reveal on scroll ---------- */
  $$(".split-words").forEach(function (el) {
    if (el.dataset.split) return; el.dataset.split = 1;
    var walk = function (node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = doc.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (w) {
            if (!w) return;
            if (/^\s+$/.test(w)) { frag.appendChild(doc.createTextNode(w)); return; }
            var o = doc.createElement("span"); o.className = "w";
            var i = doc.createElement("span"); i.textContent = w; o.appendChild(i); frag.appendChild(o);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && !n.classList.contains("brush")) walk(n);
        else if (n.nodeType === 1) { var o2 = doc.createElement("span"); o2.className = "w"; var i2 = doc.createElement("span"); n.parentNode.replaceChild(o2, n); i2.appendChild(n); o2.appendChild(i2); }
      });
    };
    walk(el);
    $$(".w > span", el).forEach(function (s, i) { s.style.transitionDelay = Math.min(i * 0.045, .9) + "s"; });
  });
  var rvs = $$(".rv, .split-words, .brush");
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
    rvs.forEach(function (el) { io.observe(el); });
  } else rvs.forEach(function (el) { el.classList.add("in"); });

  /* ---------- work filters ---------- */
  var filters = $$(".filters button");
  filters.forEach(function (b) {
    b.addEventListener("click", function () {
      var f = b.dataset.filter;
      filters.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      $$(".mission").forEach(function (m) {
        m.hidden = !(f === "all" || (m.dataset.tags || "").split(" ").indexOf(f) > -1);
      });
    });
  });

  /* ---------- style rank (Work page) ---------- */
  var rank = $(".rank");
  if (rank) {
    var letters = ["D", "C", "B", "A", "S", "SS", "SSS"], words = ["Dull", "Cool", "Bravo", "Absolute", "Stylish", "Sensational", "Smokin' Sexy Style"];
    var rb = $("b", rank), rs = $("span", rank), cur = -1;
    var upd = function () {
      var max = doc.documentElement.scrollHeight - window.innerHeight;
      var p = max > 0 ? window.scrollY / max : 0;
      rank.classList.toggle("show", window.scrollY > 300);
      var i = Math.min(letters.length - 1, Math.floor(p * letters.length));
      if (i !== cur) { cur = i; rb.textContent = letters[i]; rs.textContent = words[i]; rb.classList.add("pop"); setTimeout(function () { rb.classList.remove("pop"); }, 260); }
    };
    window.addEventListener("scroll", upd, { passive: true }); upd();
  }

  /* ---------- local time in Tezpur ---------- */
  var clock = $("[data-clock]");
  if (clock) {
    var tick = function () {
      try { clock.textContent = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date()) + " IST"; } catch (e) {}
    };
    tick(); setInterval(tick, 30000);
  }
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- 90-day grid ---------- */
  $$("[data-days-start]").forEach(function (svg) {
    var start = new Date(svg.getAttribute("data-days-start") + "T00:00:00+05:30");
    var d = Math.floor((Date.now() - start.getTime()) / 86400000) + 1;
    d = Math.max(0, Math.min(90, d));
    $$(".days circle", svg).forEach(function (c, i) { if (i < d - 1) c.classList.add("d"); else if (i === d - 1) c.classList.add("today"); });
    var l = $("[data-days-label]", svg); if (l) l.textContent = d >= 90 ? "90 / 90 — COMPLETE" : "DAY " + d + " / 90";
  });

  /* ---------- the cat ---------- */
  var cat = $(".cat");
  if (cat) cat.addEventListener("click", function () { cat.animate && cat.animate([{ transform: "translateY(0)" }, { transform: "translateY(-14px)" }, { transform: "translateY(0)" }], { duration: 420, easing: "cubic-bezier(.2,.7,.1,1)" }); });
})();
