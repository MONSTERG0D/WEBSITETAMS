/* THE AAMIR SHEIKH — v3 interactions. Vanilla JS, no build step.
   Interfaces (Riot / Noir / Village) · music + synthesised SFX · accessibility
   settings · order & feedback forms · HLS video player · scroll reveals. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement, ROOT = window.TAS_ROOT || "";
  root.classList.remove("no-js"); root.classList.add("js");
  var sysReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function announce(t) { var a = $("#announce"); if (a) { a.textContent = ""; setTimeout(function () { a.textContent = t; }, 40); } }

  /* ===================================================== settings state */
  var UI = {
    riot: { name: "Riot", music: "Electric Guitar", color: "#0b0b0d" },
    noir: { name: "Noir", music: "Smooth Jazz", color: "#0e1424" },
    village: { name: "Village", music: "Ambient Village", color: "#efe6d2" }
  };
  var DEF = { ui: "riot", track: "riot", link: true, vol: 55, sfx: true, amb: false, cvd: "none", bright: 100, text: 100, motion: "", links: false, music: false, lang: "en" };
  var S = {};
  try { S = JSON.parse(localStorage.getItem("tas") || "{}"); } catch (e) { S = {}; }
  Object.keys(DEF).forEach(function (k) { if (S[k] === undefined) S[k] = DEF[k]; });
  if (!UI[S.ui]) S.ui = "riot";
  if (!UI[S.track]) S.track = S.ui;
  function save() { try { localStorage.setItem("tas", JSON.stringify(S)); } catch (e) {} }
  function reduced() { return sysReduce || S.motion === "reduce"; }

  /* ===================================================== languages (EN / DE / FR / JA) */
  var LANG = { en: "English", de: "Deutsch", fr: "Français", ja: "日本語", es: "Español", ru: "Русский", ar: "العربية" };
  if (!LANG[S.lang]) S.lang = "en";
  var DICT = S.lang !== "en" ? (window.TAS_I18N || {})[S.lang] || null : null;
  function T(s) { return DICT && DICT[s] !== undefined ? DICT[s] : s; }
  function translatePage() {
    if (!DICT) return;
    $$("h1, h2, p.pull").forEach(function (el) { var k = "html:" + el.innerHTML.replace(/\s+/g, " ").trim(); if (DICT[k] !== undefined) el.innerHTML = DICT[k]; });
    var w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { var pa = n.parentNode; if (!pa || /^(SCRIPT|STYLE|TEXTAREA)$/.test(pa.nodeName) || (pa.closest && pa.closest("svg, [data-no-i18n], [lang]:not(html)"))) return 2; return n.nodeValue.trim() ? 1 : 2; } });
    var nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(function (n) { var raw = n.nodeValue, k = raw.replace(/\s+/g, " ").trim(); if (DICT[k] !== undefined) n.nodeValue = raw.match(/^\s*/)[0] + DICT[k] + raw.match(/\s*$/)[0]; });
    ["aria-label", "placeholder", "alt"].forEach(function (a) { $$("[" + a + "]").forEach(function (el) { if (el.closest("[lang]:not(html)")) return; var v = el.getAttribute(a); if (DICT[v] !== undefined) el.setAttribute(a, DICT[v]); }); });
    var parts = doc.title.split(" — "); if (DICT[parts[0]] !== undefined) { parts[0] = DICT[parts[0]]; doc.title = parts.join(" — "); }
  }
  var XF = { ja: "Dela+Gothic+One&family=Noto+Sans+JP:wght@400;700&family=Shippori+Mincho:wght@500;700", ru: "Oswald:wght@500;700&family=Manrope:wght@400;600;700&family=Playfair+Display:ital@0;1&family=Caveat:wght@600", ar: "Cairo:wght@400;600;800&family=Amiri:ital@0;1&family=Reem+Kufi:wght@600" };
  if (XF[S.lang]) { var jf = doc.createElement("link"); jf.rel = "stylesheet"; jf.href = "https://fonts.googleapis.com/css2?family=" + XF[S.lang] + "&display=swap"; doc.head.appendChild(jf); }
  try { translatePage(); } catch (e) {}
  root.classList.add("i18n-done");
  function setLang(l) { if (!LANG[l] || l === S.lang) return; S.lang = l; save(); location.reload(); }
  (function langMenu() {
    var btn = $(".lang-btn"), menu = $("#lang-menu"); if (!btn || !menu) return;
    var code = $("[data-lang-code]", btn); if (code) code.textContent = S.lang.toUpperCase();
    btn.setAttribute("aria-label", T("Language: ").replace(/:\s*$/, "") + ": " + LANG[S.lang]);
    var items = $$("[data-set-lang]", menu);
    items.forEach(function (b) { b.setAttribute("aria-checked", b.getAttribute("data-set-lang") === S.lang ? "true" : "false"); });
    var open = function (focusFirst) { menu.hidden = false; btn.setAttribute("aria-expanded", "true"); var cur = $('[aria-checked="true"]', menu) || items[0]; if (focusFirst) cur.focus(); };
    var close = function (refocus) { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); if (refocus) btn.focus(); };
    btn.addEventListener("click", function () { menu.hidden ? open(true) : close(); });
    btn.addEventListener("keydown", function (e) { if (e.key === "ArrowDown") { e.preventDefault(); open(true); } });
    menu.addEventListener("keydown", function (e) {
      var i = items.indexOf(doc.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === "Tab") close();
    });
    items.forEach(function (b) { b.addEventListener("click", function () { setLang(b.getAttribute("data-set-lang")); close(true); }); });
    doc.addEventListener("click", function (e) { if (!menu.hidden && !e.target.closest(".lang")) close(); });
  })();

  function applyVisual() {
    root.setAttribute("data-ui", S.ui);
    if (S.cvd && S.cvd !== "none") root.setAttribute("data-cvd", S.cvd); else root.removeAttribute("data-cvd");
    if (+S.bright !== 100) root.style.setProperty("--bright", S.bright / 100); else root.style.removeProperty("--bright");
    root.style.fontSize = +S.text !== 100 ? S.text + "%" : "";
    if (S.motion) root.setAttribute("data-motion", S.motion); else root.removeAttribute("data-motion");
    if (S.links) root.setAttribute("data-links", "1"); else root.removeAttribute("data-links");
    var m = $('meta[name="theme-color"]'); if (m) m.setAttribute("content", S.cvd === "contrast" ? "#000000" : UI[S.ui].color);
    syncPanel();
  }

  /* ===================================================== audio: music */
  var actx = null, master = null, musicGain = null, sfxGain = null, ambGain = null;
  var tracks = {}, curTrack = null, playing = false, unlocked = false;
  function ctx() {
    if (actx) return actx;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    actx = new AC();
    master = actx.createGain(); master.connect(actx.destination);
    musicGain = actx.createGain(); musicGain.gain.value = 0; musicGain.connect(master);
    sfxGain = actx.createGain(); sfxGain.gain.value = .5; sfxGain.connect(master);
    ambGain = actx.createGain(); ambGain.gain.value = 0; ambGain.connect(master);
    return actx;
  }
  function getTrack(k) {
    if (tracks[k]) return tracks[k];
    var a = new Audio(); a.src = ROOT + "assets/audio/" + (k === "riot" ? "guitar" : k === "noir" ? "jazz" : "village") + ".m4a";
    a.loop = true; a.preload = "auto"; a.crossOrigin = "anonymous";
    var t = { el: a, gain: null };
    if (ctx()) { try { var src = actx.createMediaElementSource(a); t.gain = actx.createGain(); t.gain.gain.value = 0; src.connect(t.gain); t.gain.connect(musicGain); } catch (e) {} }
    tracks[k] = t; return t;
  }
  function ramp(g, v, sec) { if (!g || !actx) return; var n = actx.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(v, n + sec); }
  function musicVol() { return Math.pow(S.vol / 100, 1.6) * .9; }
  function playMusic() {
    if (!ctx()) return;
    if (actx.state === "suspended") actx.resume();
    var k = S.link ? S.ui : S.track;
    var t = getTrack(k);
    if (curTrack && curTrack !== t) { var old = curTrack; ramp(old.gain, 0, 1.2); setTimeout(function () { if (old !== curTrack) old.el.pause(); }, 1300); }
    curTrack = t;
    var resumeAt = parseFloat(ss("tasT_" + k) || "0");
    if (t.el.paused && resumeAt && !t.el.currentTime) { try { t.el.currentTime = resumeAt; } catch (e) {} }
    var p = t.el.play();
    var ok = function () { playing = true; S.music = true; save(); ramp(musicGain, musicVol(), .4); ramp(t.gain, 1, 1.4); if (!t.gain) t.el.volume = Math.min(1, musicVol()); syncMusicUI(); };
    if (p && p.then) p.then(ok).catch(function () { playing = false; syncMusicUI(); }); else ok();
  }
  function stopMusic(keepPref) {
    playing = false; if (!keepPref) { S.music = false; save(); }
    if (curTrack) { var t = curTrack; ramp(t.gain, 0, .5); setTimeout(function () { if (!playing) t.el.pause(); }, 550); }
    syncMusicUI();
  }
  function toggleMusic() { if (playing) { stopMusic(); sfx("close"); announce(T("Music paused")); } else { playMusic(); sfx("open"); announce(T("Playing ") + T(UI[S.link ? S.ui : S.track].music)); } }
  function syncMusicUI() {
    $$("[data-music-toggle]").forEach(function (b) {
      b.setAttribute("aria-pressed", playing ? "true" : "false");
      if (b.classList.contains("music-btn")) b.setAttribute("aria-label", playing ? T("Pause music") + " (" + T(UI[S.link ? S.ui : S.track].music) + ")" : T("Play music"));
    });
    $$("[data-music-label]").forEach(function (l) { l.textContent = playing ? T("Pause music") : T("Play music"); });
  }
  window.addEventListener("pagehide", function () { Object.keys(tracks).forEach(function (k) { if (!tracks[k].el.paused) ss("tasT_" + k, String(tracks[k].el.currentTime)); }); });

  /* ===================================================== audio: synthesised SFX + ambience */
  var noiseBuf = null;
  function noise() {
    if (noiseBuf) return noiseBuf;
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
    var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function tone(type, f1, f2, dur, vol, when, dest) {
    var t0 = actx.currentTime + (when || 0), o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + .006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || sfxGain); o.start(t0); o.stop(t0 + dur + .05);
  }
  function burst(freq, q, dur, vol, when, type) {
    var t0 = actx.currentTime + (when || 0), s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = noise(); f.type = type || "bandpass"; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t0, Math.random()); s.stop(t0 + dur + .05);
  }
  var lastHover = 0;
  function sfx(kind) {
    if (!S.sfx || !unlocked || !ctx()) return;
    if (actx.state === "suspended") actx.resume();
    var u = S.ui;
    if (kind === "hover") { var n = Date.now(); if (n - lastHover < 90) return; lastHover = n; }
    if (u === "riot") {
      if (kind === "click") { burst(2400, 1.2, .07, .35); tone("square", 180, 90, .06, .08); }
      else if (kind === "hover") { burst(5000, 6, .025, .08); }
      else if (kind === "open") { burst(6000, 2, .28, .25); tone("sawtooth", 900, 2400, .18, .05); }
      else if (kind === "close") { burst(3000, 2, .18, .2); tone("sawtooth", 1600, 400, .15, .05); }
      else if (kind === "switch") { burst(7000, 1, .4, .3); tone("sawtooth", 110, 55, .5, .12); tone("square", 220, 110, .3, .05, .02); }
    } else if (u === "noir") {
      if (kind === "click") { tone("sine", 880, 0, .12, .12); burst(9000, .7, .05, .05, 0, "highpass"); }
      else if (kind === "hover") { burst(7000, .5, .06, .025, 0, "highpass"); }
      else if (kind === "open") { tone("sine", 523.25, 0, .9, .1); tone("sine", 783.99, 0, 1.1, .07, .06); tone("sine", 1046.5, 0, 1.2, .04, .12); }
      else if (kind === "close") { tone("sine", 783.99, 0, .7, .08); tone("sine", 523.25, 0, .9, .07, .07); }
      else if (kind === "switch") { [349.23, 440, 523.25, 659.25].forEach(function (f, i) { tone("sine", f, 0, 1.4, .07, i * .07); }); }
    } else {
      if (kind === "click") { tone("sine", 320, 180, .09, .22); tone("triangle", 640, 0, .05, .06); }
      else if (kind === "hover") { tone("sine", 1200 + Math.random() * 400, 0, .08, .03); }
      else if (kind === "open") { [1568, 2093, 2349, 2637].forEach(function (f, i) { tone("sine", f * (1 + (Math.random() - .5) * .01), 0, 1.4, .045, i * .09); }); }
      else if (kind === "close") { [2349, 1760].forEach(function (f, i) { tone("sine", f, 0, 1, .045, i * .1); }); }
      else if (kind === "switch") { tone("triangle", 196, 0, 1.2, .12); [1568, 1976, 2349].forEach(function (f, i) { tone("sine", f, 0, 1.6, .04, .1 + i * .12); }); }
    }
  }
  var ambNodes = [], ambTimer = null;
  function stopAmb() { ramp(ambGain, 0, .8); clearInterval(ambTimer); ambTimer = null; var n = ambNodes; ambNodes = []; setTimeout(function () { n.forEach(function (x) { try { x.stop(); } catch (e) {} }); }, 900); }
  function startAmb() {
    if (!S.amb || !unlocked || !ctx()) return;
    stopAmb();
    setTimeout(function () {
      if (!S.amb) return;
      var u = S.ui, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
      s.buffer = noise(); s.loop = true;
      if (u === "village") { f.type = "lowpass"; f.frequency.value = 500; g.gain.value = .12; var lfo = actx.createOscillator(), lg = actx.createGain(); lfo.frequency.value = .08; lg.gain.value = 300; lfo.connect(lg); lg.connect(f.frequency); lfo.start(); ambNodes.push(lfo); }
      else if (u === "noir") { f.type = "highpass"; f.frequency.value = 3000; g.gain.value = .03; }
      else { f.type = "lowpass"; f.frequency.value = 160; g.gain.value = .1; var hum = actx.createOscillator(), hg = actx.createGain(); hum.type = "sawtooth"; hum.frequency.value = 50; hg.gain.value = .012; hum.connect(hg); hg.connect(ambGain); hum.start(); ambNodes.push(hum); }
      s.connect(f); f.connect(g); g.connect(ambGain); s.start(); ambNodes.push(s);
      ramp(ambGain, .6, 1.5);
      ambTimer = setInterval(function () {
        if (doc.hidden) return;
        var t0 = actx.currentTime;
        if (u === "village" && Math.random() < .5) { for (var i = 0; i < 3; i++) { var o = actx.createOscillator(), og = actx.createGain(); o.frequency.setValueAtTime(2600 + Math.random() * 900, t0 + i * .12); o.frequency.exponentialRampToValueAtTime(3800 + Math.random() * 800, t0 + i * .12 + .08); og.gain.setValueAtTime(.0001, t0 + i * .12); og.gain.exponentialRampToValueAtTime(.03, t0 + i * .12 + .01); og.gain.exponentialRampToValueAtTime(.0001, t0 + i * .12 + .1); o.connect(og); og.connect(ambGain); o.start(t0 + i * .12); o.stop(t0 + i * .12 + .15); } }
        if (u === "noir") { for (var j = 0; j < 6; j++) { var b = actx.createBufferSource(), bg = actx.createGain(); b.buffer = noise(); bg.gain.value = .05 + Math.random() * .08; b.connect(bg); bg.connect(ambGain); var w = t0 + Math.random() * 2; b.start(w, Math.random(), .004); } }
      }, 2000);
    }, 950);
  }

  function unlock() {
    if (unlocked) return; unlocked = true;
    ctx(); if (actx && actx.state === "suspended") actx.resume();
    if (S.music && !playing) playMusic();
    if (S.amb) startAmb();
  }
  ["pointerdown", "keydown", "touchstart"].forEach(function (ev) { doc.addEventListener(ev, unlock, { once: true, passive: true }); });

  /* SFX hooks: clicks on interactive elements, hovers on nav + buttons */
  doc.addEventListener("click", function (e) { if (e.target.closest("a, button, label.chip, label.ui-card, label.tog, .star")) sfx("click"); }, true);
  if (canHover) doc.addEventListener("mouseover", function (e) { var t = e.target.closest(".nav a, .btn, .pill, .index-list a, .ptable a, .chip, .tile, .clip-a"); if (t && !t.contains(e.relatedTarget)) sfx("hover"); });

  /* ===================================================== change interface / music */
  function setUI(u, silent) {
    if (!UI[u] || u === S.ui) return;
    S.ui = u; if (S.link) S.track = u; save();
    root.classList.add("ui-anim");
    applyVisual();
    setTimeout(function () { root.classList.remove("ui-anim"); }, 700);
    if (!silent) { sfx("switch"); announce(T("Interface: ") + T(UI[u].name) + (S.link ? T(", music: ") + T(UI[u].music) : "")); }
    if (playing && S.link) playMusic();
    if (S.amb) startAmb();
    heroVideo();
  }
  function setTrack(k) { S.track = k; save(); if (playing) playMusic(); announce(T("Music") + ": " + T(UI[k].music)); }

  /* ===================================================== settings panel */
  var panel = $("#panel"), panelLast = null;
  function syncPanel() {
    if (!panel) return;
    $$('input[name="ui"]', panel).forEach(function (i) { i.checked = i.value === S.ui; });
    $$('input[name="track"]', panel).forEach(function (i) { i.checked = i.value === (S.link ? S.ui : S.track); i.disabled = !!S.link; });
    var tk = $("[data-tracks]", panel); if (tk) tk.style.opacity = S.link ? .5 : 1;
    var f = function (n) { return $('input[name="' + n + '"]', panel); };
    f("link").checked = !!S.link; f("sfx").checked = !!S.sfx; f("amb").checked = !!S.amb; f("vol").value = S.vol;
    f("motion").checked = S.motion === "reduce"; f("links").checked = !!S.links;
    f("bright").value = S.bright; $("#bright-v").textContent = S.bright + "%";
    f("text").value = S.text; $("#text-v").textContent = S.text + "%";
    $$('input[name="cvd"]', panel).forEach(function (i) { i.checked = i.value === (S.cvd || "none"); });
    $$('input[name="lang"]', panel).forEach(function (i) { i.checked = i.value === S.lang; });
  }
  function trap(box, e) {
    if (e.key !== "Tab") return;
    var f = $$("a[href], button:not([disabled]), input:not([disabled]), textarea, select", box).filter(function (x) { return x.offsetParent !== null || x.type === "radio" || x.type === "checkbox" || x.type === "range"; });
    if (!f.length) return; var a = f[0], z = f[f.length - 1];
    if (e.shiftKey && doc.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && doc.activeElement === z) { e.preventDefault(); a.focus(); }
  }
  function openPanel() {
    if (!panel) return; closePause(true);
    panelLast = doc.activeElement; panel.classList.add("open"); panel.setAttribute("aria-hidden", "false");
    $$("[data-panel-open]").forEach(function (b) { b.setAttribute("aria-expanded", "true"); });
    root.style.overflow = "hidden"; syncPanel(); sfx("open");
    setTimeout(function () { var c = $("[data-panel-close]", panel); if (c) c.focus(); }, 60);
  }
  function closePanel() {
    if (!panel || !panel.classList.contains("open")) return;
    panel.classList.remove("open"); panel.setAttribute("aria-hidden", "true");
    $$("[data-panel-open]").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    root.style.overflow = ""; sfx("close"); if (panelLast && panelLast.focus) panelLast.focus();
  }
  $$("[data-panel-open]").forEach(function (b) { b.addEventListener("click", openPanel); });
  if (panel) {
    panel.addEventListener("click", function (e) { if (e.target === panel || e.target.closest("[data-panel-close]")) closePanel(); });
    panel.addEventListener("keydown", function (e) { trap($(".panel-card", panel), e); });
    panel.addEventListener("change", function (e) {
      var t = e.target, n = t.name;
      if (n === "lang") setLang(t.value);
      else if (n === "ui") setUI(t.value);
      else if (n === "track") setTrack(t.value);
      else if (n === "link") { S.link = t.checked; if (S.link) S.track = S.ui; save(); syncPanel(); if (playing) playMusic(); announce(S.link ? T("Music now follows the interface") : T("Music and interface are now separate")); }
      else if (n === "sfx") { S.sfx = t.checked; save(); if (S.sfx) sfx("click"); }
      else if (n === "amb") { S.amb = t.checked; save(); if (S.amb) { unlock(); startAmb(); } else stopAmb(); }
      else if (n === "cvd") { S.cvd = t.value; save(); applyVisual(); announce(t.parentNode.textContent.trim()); }
      else if (n === "motion") { S.motion = t.checked ? "reduce" : ""; save(); applyVisual(); }
      else if (n === "links") { S.links = t.checked; save(); applyVisual(); }
    });
    panel.addEventListener("input", function (e) {
      var t = e.target, n = t.name;
      if (n === "vol") { S.vol = +t.value; save(); if (playing) ramp(musicGain, musicVol(), .1); }
      else if (n === "bright") { S.bright = +t.value; save(); applyVisual(); }
      else if (n === "text") { S.text = +t.value; save(); applyVisual(); }
    });
    var reset = $("[data-reset]", panel);
    if (reset) reset.addEventListener("click", function () { var keep = { music: S.music }; S = JSON.parse(JSON.stringify(DEF)); S.music = keep.music; save(); applyVisual(); if (playing) playMusic(); announce(T("Settings reset")); });
  }
  $$("[data-music-toggle]").forEach(function (b) { b.addEventListener("click", function () { unlock(); toggleMusic(); }); });

  /* read aloud (Web Speech API) */
  var reading = false;
  $$("[data-read]").forEach(function (b) {
    if (!("speechSynthesis" in window)) { b.hidden = true; return; }
    b.addEventListener("click", function () {
      var lbl = $("[data-read-label]", b);
      if (reading) { speechSynthesis.cancel(); reading = false; if (lbl) lbl.textContent = T("Read this page aloud"); return; }
      var main = $("main"), clone = main.cloneNode(true);
      $$('[aria-hidden="true"], script, style, video, .sr', clone).forEach(function (n) { n.remove(); });
      var text = clone.innerText || clone.textContent;
      text = text.replace(/\s+/g, " ").trim().slice(0, 12000);
      var chunks = text.match(/[^.!?]+[.!?]*/g) || [text];
      reading = true; if (lbl) lbl.textContent = T("Stop reading");
      if (playing) ramp(musicGain, musicVol() * .25, .4);
      chunks.forEach(function (c, i) {
        var u = new SpeechSynthesisUtterance(c); u.lang = { en: "en-IN", de: "de-DE", fr: "fr-FR", ja: "ja-JP", es: "es-ES", ru: "ru-RU", ar: "ar-SA" }[S.lang]; u.rate = 1;
        if (i === chunks.length - 1) u.onend = function () { reading = false; if (lbl) lbl.textContent = T("Read this page aloud"); if (playing) ramp(musicGain, musicVol(), .6); };
        speechSynthesis.speak(u);
      });
    });
  });

  /* ===================================================== pause menu */
  var pause = $("#pause"), lastFocus = null;
  function openPause() {
    if (!pause) return; lastFocus = doc.activeElement;
    pause.classList.add("open"); pause.setAttribute("aria-hidden", "false");
    $$(".menu-btn").forEach(function (b) { b.setAttribute("aria-expanded", "true"); });
    root.style.overflow = "hidden"; sfx("open");
    var first = $(".pause-list a, .pause-list button", pause); if (first) setTimeout(function () { first.focus(); }, 60);
  }
  function closePause(silent) {
    if (!pause || !pause.classList.contains("open")) return;
    pause.classList.remove("open"); pause.setAttribute("aria-hidden", "true");
    $$(".menu-btn").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    root.style.overflow = ""; if (!silent) { sfx("close"); if (lastFocus) lastFocus.focus(); }
  }
  $$(".menu-btn").forEach(function (b) { b.addEventListener("click", openPause); });
  if (pause) {
    pause.addEventListener("click", function (e) { if (e.target === pause || e.target.closest("[data-resume]")) closePause(); });
    pause.addEventListener("keydown", function (e) {
      var items = $$(".pause-list a, .pause-list button", pause);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); var i = items.indexOf(doc.activeElement);
        items[e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length].focus(); sfx("hover");
      } else trap($(".pause-card", pause), e);
    });
  }

  /* ===================================================== video player (HLS for 4K originals) */
  var player = $("#player"), pv = player && $("video", player), pt = player && $(".player-title", player), pq = player && $(".player-q", player), hls = null, playerLast = null;
  function loadHlsJs(cb) {
    if (window.Hls) return cb();
    var s = doc.createElement("script"); s.src = ROOT + "assets/js/vendor/hls.light.min.js"; s.onload = cb; s.onerror = function () { cb(true); }; doc.head.appendChild(s);
  }
  function openPlayer(t) {
    if (!player) return;
    var mp4 = t.getAttribute("data-play"), m3u8 = t.getAttribute("data-hls"), title = t.getAttribute("data-ptitle") || t.getAttribute("data-title"), ori = t.getAttribute("data-ori") || "h";
    playerLast = doc.activeElement;
    player.classList.remove("v", "h"); player.classList.add(ori);
    pv.poster = t.getAttribute("data-poster") || ""; pt.textContent = title || ""; pq.textContent = "";
    player.classList.add("open"); player.setAttribute("aria-hidden", "false"); root.style.overflow = "hidden";
    if (playing) ramp(musicGain, 0, .4);
    var go = function () { var p = pv.play(); if (p && p.catch) p.catch(function () {}); };
    if (m3u8 && pv.canPlayType("application/vnd.apple.mpegurl")) { pv.src = m3u8; pq.textContent = "Adaptive · up to 4K"; go(); }
    else if (m3u8) {
      loadHlsJs(function (err) {
        if (err || !window.Hls || !window.Hls.isSupported()) { pv.src = mp4; go(); return; }
        hls = new window.Hls({ capLevelToPlayerSize: true, startLevel: -1 });
        hls.loadSource(m3u8); hls.attachMedia(pv);
        hls.on(window.Hls.Events.LEVEL_SWITCHED, function (e, d) { var l = hls.levels[d.level]; if (l) pq.textContent = (l.height >= 2160 ? "4K" : l.height + "p") + " · original quality"; });
        hls.on(window.Hls.Events.ERROR, function (e, d) { if (d.fatal) { hls.destroy(); hls = null; pv.src = mp4; go(); } });
        go();
      });
    } else { pv.src = mp4; pq.textContent = "Original quality"; go(); }
    sfx("open");
    setTimeout(function () { $(".player-close", player).focus(); }, 60);
  }
  function closePlayer() {
    if (!player || !player.classList.contains("open")) return;
    pv.pause(); if (hls) { hls.destroy(); hls = null; } pv.removeAttribute("src"); pv.load();
    player.classList.remove("open"); player.setAttribute("aria-hidden", "true"); root.style.overflow = "";
    if (playing) ramp(musicGain, musicVol(), .8);
    sfx("close"); if (playerLast && playerLast.focus) playerLast.focus();
  }
  if (player) {
    player.addEventListener("click", function (e) { if (e.target === player || e.target.closest(".player-close") || e.target.classList.contains("player-stage")) closePlayer(); });
    player.addEventListener("keydown", function (e) { trap(player, e); });
  }
  doc.addEventListener("click", function (e) { var t = e.target.closest("[data-play]"); if (!t) return; e.preventDefault(); unlock(); openPlayer(t); });

  /* ===================================================== keyboard */
  doc.addEventListener("keydown", function (e) {
    var tag = (doc.activeElement && doc.activeElement.tagName) || "";
    if (e.key === "Escape") {
      if (intro && !intro.hidden) return enter("quiet");
      if (player && player.classList.contains("open")) return closePlayer();
      if (panel && panel.classList.contains("open")) return closePanel();
      if (pause && pause.classList.contains("open")) return closePause();
      return openPause();
    }
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "s" || e.key === "S") { e.preventDefault(); panel && panel.classList.contains("open") ? closePanel() : openPanel(); }
    else if (e.key === "m" || e.key === "M") { unlock(); toggleMusic(); }
    else if (e.key === "1" || e.key === "2" || e.key === "3") { if (!e.target.closest("form")) setUI(["riot", "noir", "village"][+e.key - 1]); }
  });

  /* ===================================================== intro (first visit each session) */
  var intro = $("#intro");
  function ready() { root.classList.add("ready"); heroVideo(); }
  function enter(mode) {
    if (!intro || intro.hidden) return;
    ss("tasIntro", "1"); unlock();
    if (mode === "sound") { S.sfx = true; save(); playMusic(); } else { stopMusic(); }
    intro.classList.add("out");
    setTimeout(function () { intro.hidden = true; intro.classList.remove("out"); root.style.overflow = ""; ready(); var m = $("#main"); if (m) m.focus({ preventScroll: true }); }, reduced() ? 0 : 650);
  }
  if (intro && !ss("tasIntro")) {
    intro.hidden = false; root.style.overflow = "hidden";
    if (!reduced()) intro.classList.add("play");
    $$("[data-enter]", intro).forEach(function (b) { b.addEventListener("click", function () { enter(b.getAttribute("data-enter")); }); });
    intro.addEventListener("keydown", function (e) { trap(intro, e); });
    setTimeout(function () { var b = $("[data-enter]", intro); if (b) b.focus(); }, reduced() ? 0 : 1500);
  } else ready();

  /* ===================================================== hero */
  function heroVideo() {
    var v = $(".hero-vid"); if (!v) return;
    if (reduced()) { v.pause(); return; }
    if (!v.getAttribute("src") && v.dataset.src) v.src = v.dataset.src;
    var p = v.play(); if (p && p.catch) p.catch(function () {});
  }
  var heroRank = $("[data-hero-rank]");
  if (heroRank) {
    var RL = ["D", "C", "B", "A", "S", "SS", "SSS"], RW = ["Dull", "Cool", "Bravo", "Absolute", "Stylish", "Sensational", "Smokin' Sexy Style"];
    var pts = 0, rcur = 0, rw = $("[data-hero-rank-w]"), bar = $(".rank-bar");
    var bump = function (n) { pts = Math.min(100, pts + n); upd(); };
    var upd = function () {
      var i = Math.min(RL.length - 1, Math.floor(pts / 15));
      if (bar) bar.style.setProperty("--rk", pts + "%");
      if (i !== rcur) { rcur = i; heroRank.textContent = RL[i]; rw.textContent = RW[i]; heroRank.classList.add("pop"); setTimeout(function () { heroRank.classList.remove("pop"); }, 220); }
    };
    doc.addEventListener("click", function () { bump(7); });
    var lastY = 0; window.addEventListener("scroll", function () { var y = window.scrollY; if (Math.abs(y - lastY) > 120) { bump(3); lastY = y; } }, { passive: true });
    setInterval(function () { if (pts > 0) { pts = Math.max(0, pts - 2); upd(); } }, 700);
  }

  /* rotating hero word */
  $$(".rot").forEach(function (r) {
    var words = $$("span", r), i = 0;
    if (words.length < 2) return;
    var fit = function (el) { r.style.width = Math.ceil(el.getBoundingClientRect().width) + "px"; };
    setTimeout(function () { fit(words[0]); }, 300);
    window.addEventListener("resize", function () { fit(words[i]); });
    setInterval(function () {
      if (doc.hidden || reduced()) return;
      var cur = words[i]; i = (i + 1) % words.length; var nx = words[i];
      cur.classList.remove("on"); cur.classList.add("out"); nx.classList.remove("out"); nx.classList.add("on"); fit(nx);
      r.setAttribute("aria-label", nx.textContent);
      setTimeout(function () { cur.classList.remove("out"); }, 700);
    }, 2600);
  });

  /* header border */
  var head = $(".site-head");
  function onScroll() { if (head) head.classList.toggle("scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* ===================================================== previews + reel */
  function loadVid(v) { if (v.dataset.src && !v.getAttribute("src")) v.src = v.dataset.src; }
  function playIn(m) { if (reduced()) return; var v = $("video", m); if (!v) return; loadVid(v); var p = v.play(); if (p && p.then) p.then(function () { m.classList.add("playing"); }).catch(function () {}); }
  function stopIn(m) { var v = $("video", m); if (!v) return; v.pause(); m.classList.remove("playing"); }
  var previews = $$(".tile-media[data-preview]");
  if (canHover) {
    previews.forEach(function (m) { var host = m.closest(".tile, .clip-a") || m; host.addEventListener("mouseenter", function () { playIn(m); }); host.addEventListener("mouseleave", function () { stopIn(m); }); });
  } else if ("IntersectionObserver" in window) {
    var vio = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting && en.intersectionRatio > .6) playIn(en.target); else stopIn(en.target); }); }, { threshold: [0, .6, 1] });
    previews.forEach(function (m) { vio.observe(m); });
  }
  var reel = $(".reel");
  if (reel) {
    var vids = $$(".reel-stage video", reel), ticks = $$(".reel-ticks button", reel);
    var rt = $(".reel-ui .title", reel), rl = $(".reel-ui .lbl", reel), rp = $(".reel-play", reel);
    var idx = -1, timer = null, visible = false;
    var show = function (i) {
      clearTimeout(timer); idx = (i + vids.length) % vids.length;
      vids.forEach(function (v, j) {
        if (j === idx) { loadVid(v); try { v.currentTime = 0; } catch (e) {} if (!reduced()) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } v.classList.add("on"); }
        else { v.classList.remove("on"); (function (vv) { setTimeout(function () { vv.pause(); }, 800); })(v); }
      });
      ticks.forEach(function (t, j) { t.classList.remove("on"); void t.offsetWidth; if (j === idx) t.classList.add("on"); t.setAttribute("aria-current", j === idx ? "true" : "false"); });
      var v = vids[idx];
      rt.textContent = v.dataset.title; rl.textContent = T(v.dataset.kind);
      ["data-play", "data-hls", "data-poster", "data-ori", "data-ptitle"].forEach(function (a) { if (v.hasAttribute(a)) rp.setAttribute(a, v.getAttribute(a)); else rp.removeAttribute(a); });
      rp.setAttribute("aria-label", "Play " + v.dataset.title + " with sound");
      if (!reduced()) timer = setTimeout(function () { if (visible) show(idx + 1); }, 6000);
    };
    ticks.forEach(function (t, j) { t.addEventListener("click", function (e) { e.stopPropagation(); show(j); }); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible) show(idx === -1 ? 0 : idx); else if (idx > -1) { vids[idx].pause(); clearTimeout(timer); }
      }, { threshold: .25 }).observe(reel);
    } else { visible = true; show(0); }
  }

  /* ===================================================== split words + reveals */
  $$(".split-words").forEach(function (el) {
    var walk = function (node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = doc.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (w) {
            if (!w) return;
            if (/^\s+$/.test(w)) { frag.appendChild(doc.createTextNode(w)); return; }
            var o = doc.createElement("span"); o.className = "w"; var i = doc.createElement("span"); i.textContent = w; o.appendChild(i); frag.appendChild(o);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && !n.classList.contains("i")) walk(n);
      });
    };
    walk(el);
    $$(".w > span", el).forEach(function (s, i) { s.style.transitionDelay = Math.min(i * .045, .9) + "s"; });
  });
  var rvs = $$(".rv, .split-words, .wipe, .ipanel, .slash-in");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }); }, { rootMargin: "0px 0px -8% 0px", threshold: .06 });
    rvs.forEach(function (el) { io.observe(el); });
  } else rvs.forEach(function (el) { el.classList.add("in"); });

  /* project index peek */
  var peek = $(".peek");
  if (peek && canHover) {
    var pimg = $("img", peek), x = 0, y = 0, tx = 0, ty = 0, raf = null;
    var loop = function () { x += (tx - x) * .18; y += (ty - y) * .18; peek.style.left = x + "px"; peek.style.top = y + "px"; raf = Math.abs(tx - x) + Math.abs(ty - y) > .5 ? requestAnimationFrame(loop) : null; };
    $$(".ptable a[data-peek]").forEach(function (a) {
      a.addEventListener("mouseenter", function (e) { pimg.src = a.dataset.peek; x = tx = e.clientX + 180; y = ty = e.clientY; peek.classList.add("show"); });
      a.addEventListener("mousemove", function (e) { tx = e.clientX + 180; ty = e.clientY; if (!raf) raf = requestAnimationFrame(loop); });
      a.addEventListener("mouseleave", function () { peek.classList.remove("show"); });
    });
  }
  /* work filters */
  var filters = $$(".filters button");
  filters.forEach(function (b) {
    b.addEventListener("click", function () {
      var f = b.dataset.filter;
      filters.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      var n = 0; $$(".mission").forEach(function (m) { var on = f === "all" || (m.dataset.tags || "").split(" ").indexOf(f) > -1; m.hidden = !on; if (on) n++; });
      announce(n + T(" missions shown"));
    });
  });
  /* style rank on Work */
  var rank = $(".rank");
  if (rank) {
    var letters = ["D", "C", "B", "A", "S", "SS", "SSS"], words = ["Dull", "Cool", "Bravo", "Absolute", "Stylish", "Sensational", "Smokin' Sexy Style"];
    var rb = $("b", rank), rs = $("span", rank), cur = -1;
    var rupd = function () {
      var max = root.scrollHeight - window.innerHeight, p = max > 0 ? window.scrollY / max : 0;
      rank.classList.toggle("show", window.scrollY > 300);
      var i = Math.min(letters.length - 1, Math.floor(p * letters.length));
      if (i !== cur) { cur = i; rb.textContent = letters[i]; rs.textContent = words[i]; rb.classList.add("pop"); setTimeout(function () { rb.classList.remove("pop"); }, 260); }
    };
    window.addEventListener("scroll", rupd, { passive: true }); rupd();
  }
  /* 90-day grid */
  $$("[data-days-start]").forEach(function (svg) {
    var start = new Date(svg.getAttribute("data-days-start") + "T00:00:00+05:30");
    var d = Math.max(0, Math.min(90, Math.floor((Date.now() - start.getTime()) / 86400000) + 1));
    $$(".days circle", svg).forEach(function (c, i) { if (i < d - 1) c.classList.add("d"); else if (i === d - 1) c.classList.add("today"); });
    var l = $("[data-days-label]", svg); if (l) l.textContent = d >= 90 ? "90 / 90 — COMPLETE" : "DAY " + d + " / 90";
  });
  /* clock + year */
  var clock = $("[data-clock]");
  if (clock) { var tick = function () { try { clock.textContent = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date()) + " IST"; } catch (e) {} }; tick(); setInterval(tick, 30000); }
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ===================================================== order + feedback forms */
  var WA = "918082285886", MAIL = "ak4418561@gmail.com";
  var tabs = $$('.tabs [role="tab"]');
  function selTab(t) {
    tabs.forEach(function (x) { var on = x === t; x.setAttribute("aria-selected", on ? "true" : "false"); x.tabIndex = on ? 0 : -1; var p = doc.getElementById(x.getAttribute("aria-controls")); if (p) p.hidden = !on; });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { selTab(t); });
    t.addEventListener("keydown", function (e) { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); var n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; selTab(n); n.focus(); } });
  });
  if (tabs.length && location.hash === "#feedback") selTab(tabs[1]);

  function vals(form, name) { return $$('input[name="' + name + '"]:checked', form).map(function (i) { return i.value; }); }
  function field(form, name) { var f = $('[name="' + name + '"]', form); return f ? f.value.trim() : ""; }
  function compose(form) {
    var kind = form.getAttribute("data-form"), L = [];
    if (kind === "order") {
      L.push("🧾 NEW ORDER — THE AAMIR SHEIKH", "");
      var svc = vals(form, "svc");
      L.push("📦 Services:"); if (svc.length) svc.forEach(function (s) { L.push("  • " + s); }); else L.push("  • (not picked yet)");
      var like = vals(form, "like"); if (like.length) { L.push("🎬 Like these:"); like.forEach(function (s) { L.push("  • " + s); }); }
      L.push("💰 Budget: " + (vals(form, "budget")[0] || "—"), "⏱️ When: " + (vals(form, "when")[0] || "—"));
    } else {
      var r = +(vals(form, "rating")[0] || 0);
      L.push("⭐ NEW FEEDBACK — THE AAMIR SHEIKH", "", "Rating: " + (r ? "★★★★★".slice(0, r) + "☆☆☆☆☆".slice(0, 5 - r) + " (" + r + "/5)" : "—"));
      var liked = vals(form, "liked"); L.push("👍 Liked: " + (liked.length ? liked.join(", ") : "—"));
    }
    L.push("👤 Name: " + (field(form, "name") || "—"), "📱 Contact: " + (field(form, "contact") || "—"));
    var d = field(form, "details"); if (d) L.push("📝 " + (kind === "order" ? "Details" : "Improve") + ": " + d);
    L.push("", "— sent from theaamirsheikh.com (" + UI[S.ui].name + " interface · " + S.lang.toUpperCase() + ")");
    return L.join("\n");
  }
  $$("form[data-form]").forEach(function (form) {
    var sum = $("[data-summary]", form), status = $(".form-status", form), sendKind = "whatsapp";
    var refresh = function () {
      sum.textContent = compose(form);
      $$(".og[data-group-box]", form).forEach(function (g) { g.classList.toggle("has", !!$("input:checked", g)); });
      var r = +(vals(form, "rating")[0] || 0); $$(".star", form).forEach(function (s, i) { s.classList.toggle("on", i < r); });
    };
    form.addEventListener("change", refresh); form.addEventListener("input", refresh);
    // preselect from ?like=slug or ?want=group
    var q = new URLSearchParams(location.search);
    if (form.getAttribute("data-form") === "order") {
      if (q.get("like")) { var li = $('input[name="like"][data-slug="' + q.get("like") + '"]', form); if (li) li.checked = true; var vi = $('input[data-group="video-editing"]', form); if (vi && /follows|death|drift|chalamet|coca/.test(q.get("like"))) vi.checked = true; }
      if (q.get("want")) {
        var map = { "video-editing": "video-editing", "modeling-3d": "3d", "graphic-design": "design", "frontend": "web", "drawing": "design", "animation": "motion-graphics", "game-dev": "games", "programming-robotics": "robotics-code" };
        var g = map[q.get("want")] || q.get("want"), box = $('[data-group-box="' + g + '"]', form);
        if (box) { box.classList.add("has"); setTimeout(function () { box.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" }); var f = $("input", box); if (f) f.focus({ preventScroll: true }); }, 400); }
      }
    }
    refresh();
    $$("[data-send]", form).forEach(function (b) { b.addEventListener("click", function () { sendKind = b.getAttribute("data-send"); }); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status.className = "form-status"; status.textContent = "";
      var isOrder = form.getAttribute("data-form") === "order";
      if (isOrder) {
        var bad = null;
        ["name", "contact"].forEach(function (n) { var f = $('[name="' + n + '"]', form); var empty = !f.value.trim(); f.setAttribute("aria-invalid", empty ? "true" : "false"); if (empty && !bad) bad = f; });
        if (!vals(form, "svc").length && !vals(form, "like").length) { status.textContent = T("Pick at least one thing you want (step 1)."); status.classList.add("err"); var c = $('input[name="svc"]', form); if (c) c.focus(); return; }
        if (bad) { status.textContent = T("Please add your name and a way to reach you."); status.classList.add("err"); bad.focus(); return; }
      } else if (!vals(form, "rating").length && !field(form, "details") && !vals(form, "liked").length) {
        status.textContent = T("Give a rating or write a line first."); status.classList.add("err"); return;
      }
      var msg = compose(form);
      if (sendKind === "whatsapp") {
        window.open("https://wa.me/" + WA + "?text=" + encodeURIComponent(msg), "_blank", "noopener");
        status.textContent = T("WhatsApp opened with your message — press send there. ✅"); status.classList.add("ok"); sfx("switch");
        return;
      }
      status.textContent = T("Sending to Gmail…");
      fetch("https://formsubmit.co/ajax/" + MAIL, {
        method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ _subject: (isOrder ? "🧾 New order" : "⭐ New feedback") + " — THE AAMIR SHEIKH", _template: "box", _captcha: "false", name: field(form, "name") || "Website visitor", contact: field(form, "contact") || "—", message: msg })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j && (j.success === "true" || j.success === true)) { status.textContent = T("Sent! I’ll get back to you soon. ✅"); status.classList.add("ok"); sfx("switch"); }
        else throw new Error("fail");
      }).catch(function () {
        status.innerHTML = "";
        var a = doc.createElement("a"); a.className = "link"; a.href = "mailto:" + MAIL + "?subject=" + encodeURIComponent(isOrder ? "New order — THE AAMIR SHEIKH" : "Feedback — THE AAMIR SHEIKH") + "&body=" + encodeURIComponent(msg);
        a.textContent = T("open your email app instead"); status.append(T("Couldn’t send from the page — "), a, T(" (message is ready)."));
        status.classList.add("err");
      });
    });
  });

  /* ===================================================== boot */
  applyVisual(); syncMusicUI();
})();
