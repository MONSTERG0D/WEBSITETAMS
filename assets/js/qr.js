/* THE AAMIR SHEIKH — a small QR code maker for the UPI pay box (v3.9). Written for this site, no library.
   Byte mode, error correction level M, versions 1–20, the mask with the lowest penalty.
   window.TAS_QR.svg(text, label) returns an <svg> string; window.TAS_QR.matrix(text) the grid of modules. */
(function () {
  "use strict";
  // per version, level M: [ec codewords per block, blocks in group 1, data codewords each, blocks in group 2, data codewords each]
  var M = [null,
    [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
    [30, 1, 50, 4, 51], [22, 6, 36, 2, 37], [22, 8, 37, 1, 38], [24, 4, 40, 5, 41], [24, 5, 41, 5, 42],
    [28, 7, 45, 3, 46], [28, 10, 46, 1, 47], [26, 9, 43, 4, 44], [26, 3, 44, 11, 45], [26, 3, 41, 13, 42]];

  function utf8(text) {
    var out = [], s = unescape(encodeURIComponent(text));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  /* ---------- Reed–Solomon over GF(256), polynomial 0x11D */
  var EXP = [], LOG = [];
  (function () { var x = 1; for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; } for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  function mul(a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; }
  function generator(n) {
    var g = [1];
    for (var i = 0; i < n; i++) {
      var next = [];
      for (var j = 0; j <= g.length; j++) next[j] = (j < g.length ? g[j] : 0) ^ (j > 0 ? mul(g[j - 1], EXP[i]) : 0);
      g = next;
    }
    return g;   // g[0] is the highest power (always 1)
  }
  function ecc(data, n) {
    var g = generator(n), r = data.slice();
    for (var k = 0; k < n; k++) r.push(0);
    for (var i = 0; i < data.length; i++) {
      var c = r[i];
      if (c) for (var j = 0; j < g.length; j++) r[i + j] ^= mul(g[j], c);
    }
    return r.slice(data.length);
  }

  /* ---------- data codewords, split into blocks and interleaved */
  function codewords(bytes) {
    var v, cap, t;
    for (v = 1; v <= 20; v++) {
      t = M[v]; cap = t[1] * t[2] + t[3] * t[4];
      if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= cap * 8) break;
    }
    if (v > 20) throw new Error("QR: text too long");
    var bits = [];
    function put(val, n) { for (var i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) { var b = 0; for (var j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }
    for (var p = 0; data.length < cap; p++) data.push(p % 2 ? 0x11 : 0xEC);
    var blocks = [], ecs = [], at = 0, n;
    for (n = 0; n < t[1] + t[3]; n++) {
      var len = n < t[1] ? t[2] : t[4], blk = data.slice(at, at + len); at += len;
      blocks.push(blk); ecs.push(ecc(blk, t[0]));
    }
    var out = [], maxLen = Math.max(t[2], t[4]);
    for (i = 0; i < maxLen; i++) blocks.forEach(function (b) { if (i < b.length) out.push(b[i]); });
    for (i = 0; i < t[0]; i++) ecs.forEach(function (e) { out.push(e[i]); });
    return { version: v, words: out };
  }

  /* ---------- the grid */
  function build(text) {
    var cw = codewords(utf8(text)), v = cw.version, size = v * 4 + 17;
    var mod = [], fn = [], r, c, i, j;
    for (r = 0; r < size; r++) { mod.push([]); fn.push([]); for (c = 0; c < size; c++) { mod[r].push(false); fn[r].push(false); } }
    function set(x, y, dark) { mod[y][x] = !!dark; fn[y][x] = true; }

    // timing lines
    for (i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    // finders with their white separators
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (p) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var x = p[0] + dx, y = p[1] + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    });
    // alignment patterns
    if (v > 1) {
      var count = Math.floor(v / 7) + 2, step = Math.ceil((v * 4 + 4) / (count * 2 - 2)) * 2, pos = [6];
      for (var k = size - 7; pos.length < count; k -= step) pos.splice(1, 0, k);
      pos.forEach(function (ay, a) {
        pos.forEach(function (ax, b) {
          if ((a === 0 && b === 0) || (a === 0 && b === count - 1) || (a === count - 1 && b === 0)) return;
          for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        });
      });
    }
    // reserve the format areas (filled per mask) and the dark module
    for (i = 0; i < 9; i++) { fn[8][i] = fn[i][8] = true; }
    for (i = 0; i < 8; i++) { fn[8][size - 1 - i] = true; fn[size - 1 - i][8] = true; }
    set(8, size - 8, true);
    // version information (version 7 and up)
    if (v >= 7) {
      var rem = v;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vb = (v << 12) | rem;
      for (i = 0; i < 18; i++) {
        var bit = (vb >>> i) & 1, a2 = size - 11 + (i % 3), b2 = Math.floor(i / 3);
        set(a2, b2, bit); set(b2, a2, bit);
      }
    }
    // data, in the zigzag from the bottom right
    var bitsAll = [];
    cw.words.forEach(function (w) { for (var q = 7; q >= 0; q--) bitsAll.push((w >>> q) & 1); });
    var idx = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (j = 0; j < 2; j++) {
          var x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
          if (!fn[y][x] && idx < bitsAll.length) { mod[y][x] = bitsAll[idx] === 1; idx++; }
        }
      }
    }

    function format(mask) {
      var data = (0 << 3) | mask, rm = data;   // level M = 00
      for (var q = 0; q < 10; q++) rm = (rm << 1) ^ ((rm >>> 9) * 0x537);
      return ((data << 10) | rm) ^ 0x5412;
    }
    function drawFormat(g, mask) {
      var fb = format(mask), q;
      function s(x, y, d) { g[y][x] = !!d; }
      for (q = 0; q <= 5; q++) s(8, q, (fb >>> q) & 1);
      s(8, 7, (fb >>> 6) & 1); s(8, 8, (fb >>> 7) & 1); s(7, 8, (fb >>> 8) & 1);
      for (q = 9; q < 15; q++) s(14 - q, 8, (fb >>> q) & 1);
      for (q = 0; q < 8; q++) s(size - 1 - q, 8, (fb >>> q) & 1);
      for (q = 8; q < 15; q++) s(8, size - 15 + q, (fb >>> q) & 1);
      s(8, size - 8, 1);
    }
    var MASKS = [
      function (x, y) { return (x + y) % 2 === 0; },
      function (x, y) { return y % 2 === 0; },
      function (x) { return x % 3 === 0; },
      function (x, y) { return (x + y) % 3 === 0; },
      function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
      function (x, y) { return x * y % 2 + x * y % 3 === 0; },
      function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; },
      function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }
    ];
    function masked(mask) {
      var g = mod.map(function (row) { return row.slice(); });
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) g[y][x] = !g[y][x];
      drawFormat(g, mask);
      return g;
    }
    function penalty(g) {
      var p = 0, x, y, run, dark = 0;
      function lines(get) {
        for (var a = 0; a < size; a++) {
          run = 1;
          var seq = [];
          for (var b = 0; b < size; b++) seq.push(get(a, b));
          for (b = 1; b <= size; b++) {
            if (b < size && seq[b] === seq[b - 1]) run++;
            else { if (run >= 5) p += run - 2; run = 1; }
          }
          for (b = 0; b + 11 <= size; b++) {   // 1:1:3:1:1 finder-like runs with 4 light modules on one side
            var w = seq.slice(b, b + 11).map(Number).join("");
            if (w === "10111010000" || w === "00001011101") p += 40;
          }
        }
      }
      lines(function (a, b) { return g[a][b]; });
      lines(function (a, b) { return g[b][a]; });
      for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) {
        var c0 = g[y][x];
        if (c0 === g[y][x + 1] && c0 === g[y + 1][x] && c0 === g[y + 1][x + 1]) p += 3;
      }
      for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (g[y][x]) dark++;
      p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
      return p;
    }
    var best = null, bestP = Infinity;
    for (var m = 0; m < 8; m++) { var g = masked(m), pp = penalty(g); if (pp < bestP) { bestP = pp; best = g; } }
    return best;
  }

  function svg(text, label) {
    var g = build(text), n = g.length, q = 4, d = "";
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (g[y][x]) d += "M" + (x + q) + " " + (y + q) + "h1v1h-1z";
    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
    return '<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + q * 2) + " " + (n + q * 2) + '" shape-rendering="crispEdges" role="img" aria-label="' + esc(label || "QR code") + '">' +
      '<rect width="100%" height="100%" fill="#fff"/><path fill="#000" d="' + d + '"/></svg>';
  }

  window.TAS_QR = { svg: svg, matrix: build };
})();
