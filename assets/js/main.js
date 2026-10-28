/* THE AAMIR SHEIKH — interactions v2. Vanilla, no dependencies. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;
  root.classList.remove("no-js");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ---------- theme (initial value is set by the inline <head> script) ---------- */
  function setTheme(t, animate) {
    if (animate) { root.classList.add("theme-anim"); setTimeout(function () { root.classList.remove("theme-anim"); }, 700); }
    root.setAttribute("data-theme", t);
    ls("theme", t);
    var m = $('meta[name="theme-color"]'); if (m) m.setAttribute("content", t === "dark" ? "#0f0e0d" : "#efebe3");
    $$("[data-theme-label]").forEach(function (el) { el.textContent = t === "dark" ? "Night" : "Day"; });
    $$(".theme-btn").forEach(function (b) { b.setAttribute("aria-label", t === "dark" ? "Switch to light mode" : "Switch to dark mode"); b.setAttribute("aria-pressed", t === "dark" ? "true" : "false"); });
    if (t === "dark") howl();
  }
  function toggleTheme() { setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark", true); }
  $$("[data-theme-toggle]").forEach(function (b) { b.addEventListener("click", toggleTheme); });

  /* ---------- header border ---------- */
  setTimeout(function () { setTheme(root.getAttribute("data-theme") || "light", false); }, 0);
  var head = $(".site-head");
  function onScroll() { if (head) head.classList.toggle("scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* ---------- letterbox intro (home, once per session) ---------- */
  var intro = $(".intro");
  if (intro && !reduce && !ss("seenIntro")) {
    ss("seenIntro", "1");
    intro.classList.add("play");
    setTimeout(function () { intro.classList.add("go"); }, 700);
    setTimeout(function () { intro.classList.add("done"); }, 1200);
    setTimeout(function () { intro.classList.remove("play"); }, 2300);
  }

  /* ---------- wolf: draw on load, howl at night ---------- */
  var wolves = $$(".wolf");
  function howl() {
    if (reduce) return;
    (wolves || []).forEach(function (w) { w.classList.remove("howling"); void w.getBoundingClientRect(); w.classList.add("howling"); });
  }
  wolves.forEach(function (w) {
    if (!reduce) w.classList.add("draw");
    w.addEventListener("click", howl);
  });
  if (wolves.length && !reduce) {
    setTimeout(howl, 2600);
    setInterval(function () { if (!doc.hidden) howl(); }, 7000);
  }

  /* ---------- rotating hero word ---------- */
  $$(".rot").forEach(function (r) {
    var words = $$("span", r), i = 0;
    if (words.length < 2 || reduce) return;
    setInterval(function () {
      if (doc.hidden) return;
      var cur = words[i]; i = (i + 1) % words.length; var nx = words[i];
      cur.classList.remove("on"); cur.classList.add("out");
      nx.classList.remove("out"); nx.classList.add("on");
      setTimeout(function () { cur.classList.remove("out"); }, 700);
    }, 2600);
  });

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
      var items = $$(".pause-list a, .pause-list button", pause);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        var i = items.indexOf(doc.activeElement);
        items[e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length].focus();
      } else if (e.key === "Tab") {
        var f = $$("a, button", pause), a = f[0], z = f[f.length - 1];
        if (e.shiftKey && doc.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && doc.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    });
  }

  /* ---------- lightbox player ---------- */
  var player = $("#player"), pv = player && $("video", player), pt = player && $(".player-title", player);
  function openPlayer(src, title, poster) {
    if (!player) return;
    pv.src = src; pv.poster = poster || "";
    pt.textContent = title || "";
    player.classList.add("open"); player.setAttribute("aria-hidden", "false");
    root.style.overflow = "hidden";
    var p = pv.play(); if (p && p.catch) p.catch(function () {});
    $(".player-close", player).focus();
  }
  function closePlayer() {
    if (!player || !player.classList.contains("open")) return;
    pv.pause(); pv.removeAttribute("src"); pv.load();
    player.classList.remove("open"); player.setAttribute("aria-hidden", "true");
    root.style.overflow = "";
  }
  if (player) player.addEventListener("click", function (e) { if (e.target === player || e.target.closest(".player-close")) closePlayer(); });
  doc.addEventListener("click", function (e) {
    var t = e.target.closest("[data-play]");
    if (!t) return;
    e.preventDefault();
    openPlayer(t.getAttribute("data-play"), t.getAttribute("data-title"), t.getAttribute("data-poster"));
  });

  /* ---------- keys: Esc = pause/back, T = theme ---------- */
  doc.addEventListener("keydown", function (e) {
    var tag = (doc.activeElement && doc.activeElement.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === "Escape") {
      if (player && player.classList.contains("open")) return closePlayer();
      if (pause && pause.classList.contains("open")) return closePause();
      openPause();
    } else if ((e.key === "t" || e.key === "T") && !e.metaKey && !e.ctrlKey && !e.altKey) toggleTheme();
  });

  /* ---------- lazy hover / in-view video previews ---------- */
  function loadVid(v) { if (v.dataset.src && !v.getAttribute("src")) v.src = v.dataset.src; }
  function playIn(m) { var v = $("video", m); if (!v) return; loadVid(v); var p = v.play(); if (p && p.then) p.then(function () { m.classList.add("playing"); }).catch(function () {}); }
  function stopIn(m) { var v = $("video", m); if (!v) return; v.pause(); m.classList.remove("playing"); }
  var previews = $$(".tile-media[data-preview]");
  if (!reduce) {
    if (canHover) {
      previews.forEach(function (m) {
        var host = m.closest(".tile, .clip") || m;
        host.addEventListener("mouseenter", function () { playIn(m); });
        host.addEventListener("mouseleave", function () { stopIn(m); });
      });
    } else if ("IntersectionObserver" in window) {
      var vio = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting && en.intersectionRatio > .6) playIn(en.target); else stopIn(en.target); });
      }, { threshold: [0, .6, 1] });
      previews.forEach(function (m) { vio.observe(m); });
    }
  }

  /* ---------- home reel ---------- */
  var reel = $(".reel");
  if (reel) {
    var vids = $$(".reel-stage video", reel), ticks = $$(".reel-ticks button", reel);
    var rt = $(".reel-ui .title", reel), rl = $(".reel-ui .lbl", reel), rp = $(".reel-play", reel);
    var idx = -1, timer = null, visible = false;
    var show = function (i) {
      clearTimeout(timer);
      idx = (i + vids.length) % vids.length;
      vids.forEach(function (v, j) {
        if (j === idx) { loadVid(v); try { v.currentTime = 0; } catch (e) {} var p = v.play(); if (p && p.catch) p.catch(function () {}); v.classList.add("on"); }
        else { v.classList.remove("on"); (function (vv) { setTimeout(function () { vv.pause(); }, 800); })(v); }
      });
      ticks.forEach(function (t, j) { t.classList.remove("on"); void t.offsetWidth; if (j === idx) t.classList.add("on"); });
      var v = vids[idx];
      rt.textContent = v.dataset.title; rl.textContent = v.dataset.kind;
      rp.setAttribute("data-play", v.dataset.full); rp.setAttribute("data-title", v.dataset.title); rp.setAttribute("data-poster", v.poster);
      rp.setAttribute("aria-label", "Play " + v.dataset.title + " with sound");
      if (!reduce) timer = setTimeout(function () { if (visible) show(idx + 1); }, 6000);
    };
    ticks.forEach(function (t, j) { t.addEventListener("click", function (e) { e.stopPropagation(); show(j); }); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible && idx === -1) show(0);
        else if (visible) show(idx);
        else if (idx > -1) { vids[idx].pause(); clearTimeout(timer); }
      }, { threshold: .25 }).observe(reel);
    } else { visible = true; show(0); }
  }

  /* ---------- split words + reveal on scroll ---------- */
  $$(".split-words").forEach(function (el) {
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
        } else if (n.nodeType === 1 && n.classList.contains("rot")) {
          var o2 = doc.createElement("span"); o2.className = "w"; var i2 = doc.createElement("span");
          n.parentNode.replaceChild(o2, n); i2.appendChild(n); o2.appendChild(i2);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(el);
    $$(".w > span", el).forEach(function (s, i) { s.style.transitionDelay = Math.min(i * 0.045, .9) + "s"; });
  });
  var rvs = $$(".rv, .split-words, .wipe, .giant, .notches");
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: .06 });
    rvs.forEach(function (el) { io.observe(el); });
  } else rvs.forEach(function (el) { el.classList.add("in"); });

  /* ---------- project index: floating preview ---------- */
  var peek = $(".peek");
  if (peek && canHover && !reduce) {
    var pimg = $("img", peek), x = 0, y = 0, tx = 0, ty = 0, raf = null;
    var loop = function () { x += (tx - x) * .18; y += (ty - y) * .18; peek.style.left = x + "px"; peek.style.top = y + "px"; raf = Math.abs(tx - x) + Math.abs(ty - y) > .5 ? requestAnimationFrame(loop) : null; };
    $$(".ptable a[data-peek]").forEach(function (a) {
      a.addEventListener("mouseenter", function (e) { pimg.src = a.dataset.peek; x = tx = e.clientX + 170; y = ty = e.clientY; peek.classList.add("show"); });
      a.addEventListener("mousemove", function (e) { tx = e.clientX + 170; ty = e.clientY; if (!raf) raf = requestAnimationFrame(loop); });
      a.addEventListener("mouseleave", function () { peek.classList.remove("show"); });
    });
  }

  /* ---------- work filters ---------- */
  var filters = $$(".filters button");
  filters.forEach(function (b) {
    b.addEventListener("click", function () {
      var f = b.dataset.filter;
      filters.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      $$(".mission").forEach(function (m) { m.hidden = !(f === "all" || (m.dataset.tags || "").split(" ").indexOf(f) > -1); });
    });
  });

  /* ---------- style rank (Work page) ---------- */
  var rank = $(".rank");
  if (rank) {
    var letters = ["D", "C", "B", "A", "S", "SS", "SSS"], words = ["Dull", "Cool", "Bravo", "Absolute", "Stylish", "Sensational", "Smokin' Sexy Style"];
    var rb = $("b", rank), rs = $("span", rank), cur = -1;
    var upd = function () {
      var max = root.scrollHeight - window.innerHeight, p = max > 0 ? window.scrollY / max : 0;
      rank.classList.toggle("show", window.scrollY > 300);
      var i = Math.min(letters.length - 1, Math.floor(p * letters.length));
      if (i !== cur) { cur = i; rb.textContent = letters[i]; rs.textContent = words[i]; rb.classList.add("pop"); setTimeout(function () { rb.classList.remove("pop"); }, 260); }
    };
    window.addEventListener("scroll", upd, { passive: true }); upd();
  }

  /* ---------- 90-day grid ---------- */
  $$("[data-days-start]").forEach(function (svg) {
    var start = new Date(svg.getAttribute("data-days-start") + "T00:00:00+05:30");
    var d = Math.max(0, Math.min(90, Math.floor((Date.now() - start.getTime()) / 86400000) + 1));
    $$(".days circle", svg).forEach(function (c, i) { if (i < d - 1) c.classList.add("d"); else if (i === d - 1) c.classList.add("today"); });
    var l = $("[data-days-label]", svg); if (l) l.textContent = d >= 90 ? "90 / 90 — COMPLETE" : "DAY " + d + " / 90";
  });

  /* ---------- clock + year ---------- */
  var clock = $("[data-clock]");
  if (clock) {
    var tick = function () { try { clock.textContent = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date()) + " IST"; } catch (e) {} };
    tick(); setInterval(tick, 30000);
  }
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- the cat ---------- */
  var cat = $(".cat");
  if (cat && cat.animate) cat.addEventListener("mouseenter", function () { cat.animate([{ transform: "translateY(-100%)" }, { transform: "translateY(-150%)" }, { transform: "translateY(-100%)" }], { duration: 420, easing: "cubic-bezier(.2,.7,.1,1)" }); });
})();
