// Town scenery in a 2.5D look: buildings with a side wall and a roof with depth, cast shadows,
// textured ground, paved paths. Everything is drawn in code; static things are cached as sprites.
// window.Scene = { setRes(r), ground(c, world, view, t, st), items(c, world, view, t, st, list), star(c, s, t), sky(c, world, view, t) }
//   view = { x, y, w, h } the visible part of the world;  st = { family: stars of the family jar, tag: tag game on }
(function () {
  'use strict';
  var NAVY = '#1B2A49', TAU = Math.PI * 2;
  var FONT = "Fredoka, 'Baloo 2', 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  var SH = 'rgba(22,48,66,0.20)';   // shadows cast on the ground (the light comes from the top left)
  var DX = 34, DY = 20;             // "further back" is drawn this much to the right and up
  var ICONS = { studio: '🎨', gallery: '🖼️', dress: '👗', cars: '🚗', pets: '🐾', monopoly: '🎲', escape: '🗝️', race: '🏁', obby: '🧗', boss: '👾', plot: '🏡' };
  var TREES = [[120, 170], [830, 130], [60, 760], [1500, 150], [1790, 720], [2290, 130], [2310, 640], [130, 580], [150, 1000], [800, 1010], [820, 1440], [150, 1500], [1540, 1000], [1600, 1480], [2290, 1010], [2300, 1500], [560, 1010], [2200, 760], [2240, 420],
    // the east side of town
    [2420, 300], [2640, 180], [2860, 330], [3080, 170], [3300, 300], [2860, 700], [3320, 620], [3330, 1000], [2660, 1010], [2840, 1480], [3320, 1470], [2560, 430], [3140, 440], [2400, 1480]];
  var BUSHES = [[250, 520], [710, 500], [970, 470], [1430, 470], [1010, 850], [1385, 850], [640, 1400], [990, 1490], [1420, 1490], [1700, 1390], [2150, 1390], [2330, 790], [70, 1260], [940, 250], [1450, 330],
    [2450, 850], [2810, 850], [2910, 850], [3270, 850], [2820, 1390], [3290, 1390], [2700, 300], [3000, 480]];
  var ROCKS = [[430, 700], [1900, 980], [900, 1280], [2180, 1180], [1120, 1090], [260, 860], [2600, 1010], [3200, 980], [2980, 260], [3340, 1250]];
  var LAMPS = [[1030, 800], [1370, 800], [1030, 975], [1370, 975]];
  var BENCHES = [[1100, 1040], [1300, 1040]];

  // ---------- small helpers ----------
  function shade(hex, f) { // f < 0 darker, f > 0 lighter
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    function m(v) { v = Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f); return (v < 16 ? '0' : '') + v.toString(16); }
    return '#' + m(r) + m(g) + m(b);
  }
  function rnd(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); } // same "random" number every time
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function rrTop(c, x, y, w, h, r) { // only the top corners are round
    c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h); c.closePath();
  }
  function poly(c, p) { c.beginPath(); c.moveTo(p[0], p[1]); for (var i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); }
  function ell(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); }
  function ol(c, w) { c.lineWidth = w || 4; c.strokeStyle = NAVY; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
  function lin(c, x0, y0, x1, y1, a, b) { var g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
  function rad(c, x, y, r, a, b) { var g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
  function starPath(c, x, y, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    c.closePath();
  }
  // several round blobs that read as one shape: outline first, then the fill on top
  function blobs(c, list, fill, lw) {
    var i;
    c.strokeStyle = NAVY; c.lineWidth = (lw || 4) * 2;
    for (i = 0; i < list.length; i++) { c.beginPath(); c.arc(list[i][0], list[i][1], list[i][2], 0, TAU); c.stroke(); }
    c.fillStyle = fill;
    for (i = 0; i < list.length; i++) { c.beginPath(); c.arc(list[i][0], list[i][1], list[i][2], 0, TAU); c.fill(); }
  }
  function inView(v, x, y, pad) { return x > v.x - pad && x < v.x + v.w + pad && y > v.y - pad && y < v.y + v.h + pad; }

  // ---------- sprite cache: static things are drawn once, then reused as pictures ----------
  var cache = {}, RES = 1, fontOk = 0;
  // The sharpness of the sprites follows the zoom, capped at 2 so zooming in does not eat an old tablet's memory.
  function setRes(r) { r = Math.max(0.75, Math.min(2, Math.ceil(r * 4) / 4)); if (r !== RES) { RES = r; cache = {}; } }
  // (x, y) = top-left corner in the world, (w, h) = size in world units; draw(g) paints with (0,0) at that corner
  function sprite(c, key, x, y, w, h, draw) {
    var s = cache[key];
    if (!s) {
      s = document.createElement('canvas'); s.width = Math.ceil(w * RES); s.height = Math.ceil(h * RES);
      var g = s.getContext('2d'); g.scale(RES, RES); g.lineJoin = 'round'; g.lineCap = 'round';
      draw(g); cache[key] = s;
    }
    c.drawImage(s, x, y, w, h);
  }
  try { // texts are drawn into sprites, so redraw them once the Fredoka font has arrived
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fontOk = 1; cache = {}; });
  } catch (e) {}

  // ---------- ground textures ----------
  var pats = {};
  function pattern(c, name) {
    if (pats[name]) return pats[name];
    var S = 256, s = document.createElement('canvas'), g, i;
    s.width = s.height = S; g = s.getContext('2d');
    function wrap(x, y, fn) { for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) fn(x + a * S, y + b * S); } // so the tile has no seams
    if (name === 'grass') {
      g.fillStyle = '#7BD389'; g.fillRect(0, 0, S, S);
      for (i = 0; i < 22; i++) (function (i) {
        var rx = 16 + rnd(i + 9) * 26, ry = 8 + rnd(i + 5) * 12;
        g.fillStyle = i % 2 ? 'rgba(255,255,255,0.09)' : 'rgba(26,110,62,0.09)';
        wrap(rnd(i) * S, rnd(i + 50) * S, function (x, y) { ell(g, x, y, rx, ry); g.fill(); });
      })(i);
      g.lineCap = 'round'; g.lineWidth = 2.4;
      for (i = 0; i < 34; i++) (function (i) {
        g.strokeStyle = i % 3 ? '#5DBB72' : '#A2E6AC';
        wrap(rnd(i + 100) * S, rnd(i + 200) * S, function (x, y) {
          g.beginPath(); g.moveTo(x - 4.5, y); g.lineTo(x - 2.5, y - 7); g.moveTo(x, y); g.lineTo(x, y - 9.5); g.moveTo(x + 4.5, y); g.lineTo(x + 3, y - 6.5); g.stroke();
        });
      })(i);
    } else { // 'path' and 'sand': a sandy base with pebbles
      var sand = name === 'sand';
      g.fillStyle = sand ? '#F6E2A8' : '#EBD9A4'; g.fillRect(0, 0, S, S);
      for (i = 0; i < (sand ? 46 : 60); i++) (function (i) {
        var rx = (sand ? 2 : 4) + rnd(i + 7) * (sand ? 3 : 7), ry = rx * (0.55 + rnd(i + 3) * 0.3);
        g.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.45)' : i % 3 === 1 ? 'rgba(150,118,62,0.20)' : 'rgba(150,118,62,0.12)';
        wrap(rnd(i + 300) * S, rnd(i + 400) * S, function (x, y) { ell(g, x, y, rx, ry); g.fill(); });
      })(i);
    }
    pats[name] = c.createPattern(s, 'repeat');
    return pats[name];
  }

  // ---------- paths ----------
  function doorOf(b) { return { x: b.x + b.w / 2, y: b.y + b.h + 34 }; }
  var routeCache = null, routeWorld = null;
  // Each path is a list of points. Buildings below the main street get a path that goes round their left side.
  function routes(world) {
    if (routeCache && routeWorld === world) return routeCache;
    var sp = world.spawn, out = [], g = world.playground;
    world.buildings.forEach(function (b) {
      var d = doorOf(b);
      if (b.y > sp.y) out.push([sp.x, sp.y, b.x - 64, sp.y, b.x - 64, d.y + 2, d.x + 46, d.y + 2]);
      else out.push([sp.x, sp.y, d.x, sp.y, d.x, d.y - 14]);
    });
    out.push([sp.x, sp.y, g.x + g.w / 2, sp.y, g.x + g.w / 2, g.y + g.h + 4]);
    routeCache = out; routeWorld = world; flowerCache = null;
    return out;
  }
  function tracePaths(c, list, dy) {
    c.beginPath();
    list.forEach(function (p) { c.moveTo(p[0], p[1] + dy); for (var i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1] + dy); });
  }
  function nearPath(list, x, y, d) {
    for (var n = 0; n < list.length; n++) {
      var p = list[n];
      for (var i = 0; i + 3 < p.length; i += 2) {
        var x0 = Math.min(p[i], p[i + 2]) - d, x1 = Math.max(p[i], p[i + 2]) + d, y0 = Math.min(p[i + 1], p[i + 3]) - d, y1 = Math.max(p[i + 1], p[i + 3]) + d;
        if (x > x0 && x < x1 && y > y0 && y < y1) return true;
      }
    }
    return false;
  }

  // ---------- little flowers scattered on the grass (never on a path, a building or the playground) ----------
  var flowerCache = null;
  var FLOWER_COLS = ['#FF8FB8', '#FFD66B', '#FFFFFF', '#B79CFF', '#FF7A45'];
  function flowers(world) {
    if (flowerCache) return flowerCache;
    var list = [], R = routes(world), g = world.playground, i, x, y, k, n;
    for (i = 0; i < Math.round(world.w * world.h / 26000); i++) {
      x = 60 + rnd(i + 1000) * (world.w - 120); y = 110 + rnd(i + 2000) * (world.h - 170);
      if (world.buildings.some(function (b) { return x > b.x - 60 && x < b.x + b.w + 110 && y > b.y - 40 && y < b.y + b.h + 70; })) continue;
      if (x > g.x - 40 && x < g.x + g.w + 40 && y > g.y - 40 && y < g.y + g.h + 50) continue;
      if (nearPath(R, x, y, 66)) continue;
      if ((x - world.spawn.x) * (x - world.spawn.x) + (y - world.spawn.y) * (y - world.spawn.y) < 215 * 215) continue;
      if ((x - 1200) * (x - 1200) + (y - 660) * (y - 660) < 150 * 150) continue;
      n = 2 + Math.floor(rnd(i + 3000) * 3);   // a little cluster
      for (k = 0; k < n; k++) list.push([x + (rnd(i * 7 + k) - 0.5) * 52, y + (rnd(i * 11 + k) - 0.5) * 30, (i + k) % FLOWER_COLS.length]);
    }
    flowerCache = list;
    return list;
  }
  function flowerSprite(g, col) { // 28 x 36, stem base at (14, 34)
    g.strokeStyle = '#3F9A53'; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 34); g.quadraticCurveTo(12, 24, 14, 15); g.stroke();
    g.fillStyle = '#4FA05A'; ell(g, 9, 27, 5, 2.6); g.fill(); ell(g, 19, 25, 5, 2.6); g.fill();
    for (var i = 0; i < 5; i++) { var a = -Math.PI / 2 + i * TAU / 5; g.beginPath(); g.arc(14 + Math.cos(a) * 5.4, 12 + Math.sin(a) * 5.4, 4.6, 0, TAU); g.fillStyle = col; g.fill(); g.lineWidth = 1.6; g.strokeStyle = NAVY; g.stroke(); }
    g.beginPath(); g.arc(14, 12, 3.6, 0, TAU); g.fillStyle = col === '#FFD66B' ? '#FF7A45' : '#FFD66B'; g.fill(); g.lineWidth = 1.4; g.stroke();
  }

  // ---------- the ground: grass, paths, the plaza and the playground ----------
  function ground(c, world, v, t, st) {
    var sp = world.spawn, g = world.playground, R = routes(world), i;
    c.lineJoin = 'round'; c.lineCap = 'round';
    // grass
    c.save(); rr(c, 0, 0, world.w, world.h, 40); c.clip();
    c.fillStyle = pattern(c, 'grass');
    c.fillRect(Math.max(0, v.x - 4), Math.max(0, v.y - 4), v.w + 8, v.h + 8);
    c.restore();
    if (st.family >= 120) { // family goal 3: a rainbow behind the gallery
      ['#FF4F6D', '#FF9F43', '#FFD66B', '#4FA05A', '#5AA9FF', '#9B6BFF'].forEach(function (col, n) {
        c.strokeStyle = col; c.lineWidth = 16; c.beginPath(); c.arc(1200, 470, 420 - n * 16, Math.PI, 0); c.stroke();
      });
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 5; c.beginPath(); c.arc(1200, 470, 424, Math.PI, 0); c.stroke();
    }
    // paths: a darker kerb below gives them thickness, then the edge, then the paved top
    tracePaths(c, R, 8); c.strokeStyle = '#B99F5F'; c.lineWidth = 80; c.stroke();
    ell(c, sp.x, sp.y + 8, 172, 172); c.fillStyle = '#B99F5F'; c.fill();
    if (st.family >= 25) { ell(c, 1200, 668, 132, 132); c.fill(); }
    tracePaths(c, R, 0); c.strokeStyle = '#D6C080'; c.lineWidth = 82; c.stroke();
    ell(c, sp.x, sp.y, 172, 172); c.fillStyle = '#D6C080'; c.fill();
    if (st.family >= 25) { ell(c, 1200, 660, 132, 132); c.fill(); }
    tracePaths(c, R, 0); c.strokeStyle = pattern(c, 'path'); c.lineWidth = 70; c.stroke();
    ell(c, sp.x, sp.y, 166, 166); c.fillStyle = pattern(c, 'path'); c.fill();
    if (st.family >= 25) { ell(c, 1200, 660, 126, 126); c.fill(); }
    // plaza: paving rings and a star mosaic in the middle
    c.strokeStyle = 'rgba(160,128,66,0.38)'; c.lineWidth = 5;
    ell(c, sp.x, sp.y, 148, 148); c.stroke(); c.lineWidth = 4; ell(c, sp.x, sp.y, 100, 100); c.stroke();
    for (i = 0; i < 8; i++) {
      var a = i * TAU / 8, a2 = a + TAU / 16, a0 = a - TAU / 16;
      poly(c, [sp.x, sp.y, sp.x + Math.cos(a0) * 34, sp.y + Math.sin(a0) * 34, sp.x + Math.cos(a) * 84, sp.y + Math.sin(a) * 84, sp.x + Math.cos(a2) * 34, sp.y + Math.sin(a2) * 34]);
      c.fillStyle = i % 2 ? '#F7ECC8' : '#E2C987'; c.fill(); c.strokeStyle = 'rgba(160,128,66,0.5)'; c.lineWidth = 2.5; c.stroke();
    }
    // playground: a sandbox with a wooden rim that has a front face
    rr(c, g.x - 12, g.y - 2, g.w + 24, g.h + 26, 42); c.fillStyle = '#9A6B3A'; c.fill(); ol(c, 4);
    rr(c, g.x - 12, g.y - 12, g.w + 24, g.h + 24, 42); c.fillStyle = st.tag ? '#FF8FA3' : '#D2A062'; c.fill(); ol(c, 4);
    rr(c, g.x + 6, g.y + 6, g.w - 12, g.h - 12, 28); c.fillStyle = pattern(c, 'sand'); c.fill();
    c.save(); rr(c, g.x + 6, g.y + 6, g.w - 12, g.h - 12, 28); c.clip();   // the rim shades the sand along the top and left
    c.strokeStyle = 'rgba(27,42,73,0.15)'; c.lineWidth = 20; rr(c, g.x + 6, g.y + 6, g.w + 40, g.h + 40, 28); c.stroke();
    c.restore();
    rr(c, g.x + 6, g.y + 6, g.w - 12, g.h - 12, 28); ol(c, 3);
    // flowers on the grass
    var F = flowers(world);
    for (i = 0; i < F.length; i++) {
      if (!inView(v, F[i][0], F[i][1], 40)) continue;
      (function (f) { sprite(c, 'fl' + f[2], f[0] - 14, f[1] - 34, 28, 36, function (q) { flowerSprite(q, FLOWER_COLS[f[2]]); }); })(F[i]);
    }
  }

  // ---------- a building, drawn with (0,0) at the top-left corner of its rectangle ----------
  function house(g, b) {
    var w = b.w, h = b.h, open = !!b.open;
    var wall = open ? b.wall : '#D6D1C4', roof = open ? b.roof : '#9A968C';
    var wt = 106, base = h, eY = wt + 8, ov = 22, rY = 6, inset = 60, dx = w / 2, i, x, y;
    var eFL = [-ov, eY], eFR = [w + ov, eY], eBR = [w + ov + DX, eY - DY];
    var rL = [-ov + inset + DX / 2, rY], rR = [w + ov - inset + DX / 2, rY];
    var ww = w < 340 ? 62 : 74, dw = 76, dh = 100;

    // shadow on the ground to the right, and where the wall meets the ground
    poly(g, [w - 2, base + 8, w + 92, base + 8, w + DX + 92, base - DY + 2, w + DX - 2, base - DY - 30]); g.fillStyle = SH; g.fill();
    rr(g, -10, base - 8, w + 22, 24, 12); g.fillStyle = 'rgba(22,48,66,0.16)'; g.fill();

    // side wall
    poly(g, [w, base, w + DX, base - DY, w + DX, wt - DY, w, wt]); g.fillStyle = shade(wall, -0.22); g.fill(); ol(g, 4);
    function sv(u, yy) { return [w + u * DX, yy - u * DY]; }
    poly(g, sv(0.24, wt + 46).concat(sv(0.78, wt + 46), sv(0.78, wt + 92), sv(0.24, wt + 92)));
    g.fillStyle = open ? '#86C8EA' : '#A9A59B'; g.fill(); ol(g, 2.5);
    poly(g, [w, base - 20, w + DX, base - DY - 20, w + DX, base - DY, w, base]); g.fillStyle = open ? '#A9A294' : '#9F9B91'; g.fill(); ol(g, 3.5);

    // front wall
    rr(g, 0, wt - 6, w, base - wt + 6, 10);
    g.fillStyle = lin(g, 0, wt, 0, base, shade(wall, 0.14), shade(wall, -0.07)); g.fill(); ol(g, 4);
    g.strokeStyle = 'rgba(27,42,73,0.08)'; g.lineWidth = 2;
    for (y = wt + 34; y < base - 26; y += 22) { g.beginPath(); g.moveTo(7, y); g.lineTo(w - 7, y); g.stroke(); }
    g.fillStyle = lin(g, 0, eY, 0, eY + 38, 'rgba(27,42,73,0.24)', 'rgba(27,42,73,0)'); g.fillRect(2, eY, w - 4, 38);   // shade under the roof
    rr(g, -4, base - 20, w + 8, 20, 8); g.fillStyle = open ? '#CFC8BA' : '#BBB7AC'; g.fill(); ol(g, 3.5);                 // stone base

    // windows with a flower box
    function win(x, y) {
      rr(g, x, y, ww, 60, 10); g.fillStyle = '#fff'; g.fill(); ol(g, 3.5);
      rr(g, x + 7, y + 7, ww - 14, 46, 6); g.fillStyle = open ? lin(g, 0, y, 0, y + 60, '#D4F2FF', '#8ED2F4') : '#B4B0A6'; g.fill(); ol(g, 2);
      if (open) {
        g.save(); rr(g, x + 7, y + 7, ww - 14, 46, 6); g.clip(); g.fillStyle = 'rgba(255,255,255,0.6)';
        poly(g, [x + 13, y + 53, x + 31, y + 7, x + 41, y + 7, x + 23, y + 53]); g.fill();
        poly(g, [x + ww - 26, y + 53, x + ww - 15, y + 26, x + ww - 10, y + 26, x + ww - 21, y + 53]); g.fill();
        g.restore();
      }
      g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.moveTo(x + ww / 2, y + 7); g.lineTo(x + ww / 2, y + 53); g.moveTo(x + 7, y + 30); g.lineTo(x + ww - 7, y + 30); g.stroke();
      rr(g, x - 4, y + 56, ww + 8, 16, 7); g.fillStyle = open ? '#9A6236' : '#8C877C'; g.fill(); ol(g, 3);
      if (open) for (var k = 0; k < 5; k++) {
        var fx = x + 5 + k * (ww - 10) / 4;
        g.beginPath(); g.arc(fx, y + 56, 7, 0, TAU); g.fillStyle = '#4FA05A'; g.fill();
        g.beginPath(); g.arc(fx, y + 51, 4.6, 0, TAU); g.fillStyle = k % 2 ? '#FFD66B' : '#FF8FB8'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = NAVY; g.stroke();
      }
    }
    win(26, wt + 42); win(w - 26 - ww, wt + 42);

    // door: frame, panel, glass, knob
    rrTop(g, dx - dw / 2 - 7, base - dh - 7, dw + 14, dh + 7, 20); g.fillStyle = '#fff'; g.fill(); ol(g, 4);
    rrTop(g, dx - dw / 2, base - dh, dw, dh, 14);
    g.fillStyle = open ? lin(g, dx - dw / 2, 0, dx + dw / 2, 0, '#B77B45', '#8F5A2E') : '#8C877C'; g.fill(); ol(g, 3.5);
    g.strokeStyle = 'rgba(27,42,73,0.18)'; g.lineWidth = 2;
    for (x = dx - dw / 2 + 19; x < dx + dw / 2 - 6; x += 19) { g.beginPath(); g.moveTo(x, base - dh + 8); g.lineTo(x, base - 4); g.stroke(); }
    if (open) {
      g.fillStyle = 'rgba(27,42,73,0.20)'; g.fillRect(dx - dw / 2 + 2, base - dh + 2, dw - 4, 16);                          // shade of the awning
      g.beginPath(); g.arc(dx, base - dh + 38, 13, 0, TAU); g.fillStyle = '#BFE9FF'; g.fill(); ol(g, 3);
      g.beginPath(); g.arc(dx - 4, base - dh + 34, 4, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill();
      g.beginPath(); g.arc(dx + dw / 2 - 14, base - 44, 5.5, 0, TAU); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2);
    } else { // boarded up
      g.fillStyle = '#B9966B';
      [[-0.32], [0.32]].forEach(function (q) {
        g.save(); g.translate(dx, base - dh / 2); g.rotate(q[0]); rr(g, -dw / 2 - 6, -7, dw + 12, 14, 3); g.fill(); ol(g, 3); g.restore();
      });
    }
    // door step: a slab with a front face
    rr(g, dx - 62, base + 14, 124, 9, 3); g.fillStyle = '#ADA696'; g.fill(); ol(g, 3);
    poly(g, [dx - 52, base - 2, dx + 52, base - 2, dx + 62, base + 16, dx - 62, base + 16]); g.fillStyle = '#E6DFD0'; g.fill(); ol(g, 3.5);

    // roof: the darker hip on the right, the front slope with tiles, then its thickness along the eaves
    poly(g, eFR.concat(eBR, rR)); g.fillStyle = shade(roof, -0.26); g.fill(); ol(g, 4);
    var slope = eFL.concat(eFR, rR, rL);
    poly(g, slope); g.fillStyle = lin(g, 0, rY, 0, eY, shade(roof, 0.18), roof); g.fill();
    g.save(); poly(g, slope); g.clip();
    g.strokeStyle = shade(roof, -0.2); g.lineWidth = 2.4;
    for (y = eY - 15, i = 0; y > rY + 6; y -= 18, i++) {
      g.beginPath();
      for (x = -ov - 30 + (i % 2) * 13; x < w + ov + 30; x += 26) { g.moveTo(x, y); g.quadraticCurveTo(x + 13, y + 9, x + 26, y); }
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.13)'; poly(g, [-ov, eY, rL[0], rY, rL[0] + 80, rY, -ov + 56, eY]); g.fill();
    g.restore();
    poly(g, slope); ol(g, 4);
    poly(g, [eFL[0], eFL[1], eFR[0], eFR[1], eFR[0], eFR[1] + 11, eFL[0], eFL[1] + 11]); g.fillStyle = shade(roof, -0.36); g.fill(); ol(g, 3.5);
    poly(g, [eFR[0], eFR[1], eBR[0], eBR[1], eBR[0], eBR[1] + 11, eFR[0], eFR[1] + 11]); g.fillStyle = shade(roof, -0.5); g.fill(); ol(g, 3.5);
    g.beginPath(); g.moveTo(rL[0], rL[1]); g.lineTo(rR[0], rR[1]); g.strokeStyle = NAVY; g.lineWidth = 11; g.stroke();
    g.strokeStyle = shade(roof, 0.34); g.lineWidth = 4.5; g.stroke();

    // chimney
    if (open) {
      var qx = w - 80;
      poly(g, [qx + 28, -4, qx + 38, -10, qx + 38, 36, qx + 28, 44]); g.fillStyle = '#B9A58A'; g.fill(); ol(g, 3);
      g.beginPath(); g.rect(qx, -4, 28, 50); g.fillStyle = '#EADBC2'; g.fill(); ol(g, 3);
      g.strokeStyle = 'rgba(27,42,73,0.16)'; g.lineWidth = 2;
      for (y = 8; y < 44; y += 11) { g.beginPath(); g.moveTo(qx + 2, y); g.lineTo(qx + 26, y); g.stroke(); }
      poly(g, [qx - 4, -6, qx + 32, -6, qx + 43, -13, qx + 7, -13]); g.fillStyle = '#F6EBD6'; g.fill(); ol(g, 3);
      rr(g, qx - 4, -6, 36, 9, 2); g.fillStyle = '#D8C7AA'; g.fill(); ol(g, 3);
    }

    // striped awning over the door
    if (open) {
      var n = 6, aw = 136, tw2 = aw - 26, ay = base - dh - 36, sw = aw / n;
      for (i = 0; i < n; i++) {
        g.beginPath();
        g.moveTo(dx - tw2 / 2 + i * tw2 / n, ay); g.lineTo(dx - tw2 / 2 + (i + 1) * tw2 / n, ay);
        g.lineTo(dx - aw / 2 + (i + 1) * sw, ay + 26); g.arc(dx - aw / 2 + (i + 0.5) * sw, ay + 26, sw / 2, 0, Math.PI); g.closePath();
        g.fillStyle = i % 2 ? '#FFFFFF' : roof; g.fill(); ol(g, 3);
      }
    }

    // name board standing on the roof
    var name = b.name, icon = ICONS[b.id] || '', sy = 42;
    g.font = '700 30px ' + FONT;
    var tw = Math.max(176, g.measureText(name).width + (icon ? 92 : 46));
    g.fillStyle = NAVY; g.fillRect(dx - tw / 2 + 24, sy + 44, 7, 22); g.fillRect(dx + tw / 2 - 31, sy + 44, 7, 22);
    rr(g, dx - tw / 2 + 3, sy + 6, tw, 50, 15); g.fillStyle = 'rgba(27,42,73,0.28)'; g.fill();
    rr(g, dx - tw / 2, sy, tw, 50, 15); g.fillStyle = open ? '#fff' : '#ECE8DD'; g.fill(); ol(g, 4);
    g.fillStyle = NAVY; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name, dx + (icon ? 20 : 0), sy + 27);
    if (icon) { g.font = '28px ' + FONT; g.fillText(icon, dx - tw / 2 + 34, sy + 27); }

    if (!open) { // "coming soon" plate where the awning would be
      g.font = '600 21px ' + FONT;
      var cw = g.measureText('Coming soon').width + 30;
      rr(g, dx - cw / 2, base - dh - 44, cw, 34, 17); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 3);
      g.fillStyle = NAVY; g.fillText('Coming soon', dx, base - dh - 26);
    }
  }

  // ---------- trees, bushes, rocks, lamps, benches (origin at the foot of each) ----------
  function tree(g, kind) {
    var i, L;
    ell(g, 18, 3, 50, 14); g.fillStyle = SH; g.fill();
    if (kind === 1) { // pine
      rr(g, -8, -40, 16, 42, 6); g.fillStyle = lin(g, -8, 0, 8, 0, '#A8733F', '#774B27'); g.fill(); ol(g, 3.5);
      [[-30, 48, 60], [-66, 39, 56], [-98, 29, 52]].forEach(function (q) {
        poly(g, [-q[1], q[0], 0, q[0] - q[2], q[1], q[0]]); g.fillStyle = '#35966A'; g.fill();
        poly(g, [0, q[0] - q[2], q[1], q[0], 4, q[0]]); g.fillStyle = '#26764F'; g.fill();
        poly(g, [-q[1] + 12, q[0] - 6, -3, q[0] - q[2] + 12, -q[1] * 0.35, q[0] - 6]); g.fillStyle = 'rgba(255,255,255,0.16)'; g.fill();
        poly(g, [-q[1], q[0], 0, q[0] - q[2], q[1], q[0]]); ol(g, 4);
      });
      return;
    }
    rr(g, -10, -58, 20, 60, 7); g.fillStyle = lin(g, -10, 0, 10, 0, '#A8733F', '#774B27'); g.fill(); ol(g, 3.5);
    L = [[-25, -88, 32], [25, -86, 32], [0, -118, 38], [0, -84, 30]];
    blobs(g, L, '#2F8548', 4);
    g.fillStyle = '#45A65D'; for (i = 0; i < L.length; i++) { g.beginPath(); g.arc(L[i][0] - 5, L[i][1] - 6, L[i][2] - 9, 0, TAU); g.fill(); }
    g.fillStyle = '#6CC67F'; [[-30, -100, 13], [-8, -132, 16], [14, -100, 10]].forEach(function (q) { g.beginPath(); g.arc(q[0], q[1], q[2], 0, TAU); g.fill(); });
    g.fillStyle = 'rgba(255,255,255,0.35)'; ell(g, -14, -138, 7, 4); g.fill();
    if (kind === 2) [[-28, -80], [8, -106], [26, -78], [-6, -70], [-18, -112]].forEach(function (q) { // apples
      g.beginPath(); g.arc(q[0], q[1], 6.5, 0, TAU); g.fillStyle = '#FF4F6D'; g.fill(); g.lineWidth = 2; g.strokeStyle = NAVY; g.stroke();
      g.beginPath(); g.arc(q[0] - 2, q[1] - 2, 2, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill();
    });
  }
  function bush(g, n) {
    var L = [[-20, -14, 17], [18, -13, 17], [0, -25, 19]], i;
    ell(g, 10, 2, 40, 9); g.fillStyle = SH; g.fill();
    blobs(g, L, '#2F8548', 3.5);
    g.fillStyle = '#48A85F'; for (i = 0; i < L.length; i++) { g.beginPath(); g.arc(L[i][0] - 3, L[i][1] - 4, L[i][2] - 6, 0, TAU); g.fill(); }
    g.fillStyle = '#6CC67F'; g.beginPath(); g.arc(-8, -32, 7, 0, TAU); g.fill();
    [[-22, -18], [4, -30], [20, -16], [-4, -12]].forEach(function (q, k) {
      g.beginPath(); g.arc(q[0], q[1], 4.2, 0, TAU); g.fillStyle = n % 2 ? (k % 2 ? '#FF8FB8' : '#FFFFFF') : (k % 2 ? '#FFD66B' : '#FF7A45'); g.fill(); g.lineWidth = 1.5; g.strokeStyle = NAVY; g.stroke();
    });
  }
  function rock(g) {
    ell(g, 8, 2, 34, 8); g.fillStyle = SH; g.fill();
    poly(g, [-26, 0, -30, -14, -16, -28, 6, -32, 24, -20, 28, -4, 20, 2]); g.fillStyle = '#A9AFB8'; g.fill(); ol(g, 3.5);
    poly(g, [-26, -13, -15, -26, 5, -29, 12, -18, -8, -12]); g.fillStyle = '#D5DAE0'; g.fill();
    poly(g, [12, -18, 24, -19, 27, -4, 19, 1, 10, -4]); g.fillStyle = '#8D949E'; g.fill();
  }
  function lamp(g) {
    ell(g, 6, 2, 20, 6); g.fillStyle = SH; g.fill();
    g.beginPath(); g.arc(0, -108, 46, 0, TAU); g.fillStyle = rad(g, 0, -108, 46, 'rgba(255,226,122,0.55)', 'rgba(255,226,122,0)'); g.fill();
    rr(g, -9, -8, 18, 10, 4); g.fillStyle = '#5B6275'; g.fill(); ol(g, 3);
    rr(g, -3.5, -96, 7, 90, 3); g.fillStyle = lin(g, -3.5, 0, 3.5, 0, '#7A8296', '#4A5165'); g.fill(); ol(g, 3);
    rr(g, -12, -122, 24, 28, 7); g.fillStyle = '#FFF0B8'; g.fill(); ol(g, 3);
    poly(g, [-16, -122, 16, -122, 9, -132, -9, -132]); g.fillStyle = '#5B6275'; g.fill(); ol(g, 3);
    g.beginPath(); g.arc(0, -108, 5, 0, TAU); g.fillStyle = '#FFD66B'; g.fill();
  }
  function bench(g) {
    ell(g, 6, 4, 56, 10); g.fillStyle = SH; g.fill();
    g.fillStyle = '#5B6275'; [-38, 32].forEach(function (x) { rr(g, x, -24, 7, 26, 2); g.fill(); ol(g, 2.5); });
    rr(g, -48, -56, 96, 15, 5); g.fillStyle = '#C98A4B'; g.fill(); ol(g, 3);
    rr(g, -48, -39, 96, 9, 4); g.fillStyle = '#B77B45'; g.fill(); ol(g, 3);
    poly(g, [-50, -26, 50, -26, 56, -14, -56, -14]); g.fillStyle = '#DDA263'; g.fill(); ol(g, 3);
    rr(g, -56, -14, 112, 7, 3); g.fillStyle = '#A56B38'; g.fill(); ol(g, 3);
  }
  // playground things
  function slide(g) { // origin: the ground under the ladder
    ell(g, 70, 4, 112, 16); g.fillStyle = SH; g.fill();
    g.fillStyle = '#8D949E'; [[-24], [16]].forEach(function (q) { rr(g, q[0], -126, 8, 128, 3); g.fill(); ol(g, 3); });
    g.strokeStyle = NAVY; g.lineWidth = 6; g.beginPath(); [-28, -58, -88].forEach(function (y) { g.moveTo(-18, y); g.lineTo(18, y); }); g.stroke();
    g.strokeStyle = '#C3C9D2'; g.lineWidth = 2.5; g.stroke();
    // chute: underside, then the top surface with side rails
    g.beginPath(); g.moveTo(24, -112); g.bezierCurveTo(70, -108, 96, -22, 150, -12); g.lineTo(184, -12); g.lineTo(184, 0); g.lineTo(146, 0);
    g.bezierCurveTo(98, -8, 70, -86, 24, -92); g.closePath(); g.fillStyle = '#2F6FCC'; g.fill(); ol(g, 3.5);
    g.beginPath(); g.moveTo(22, -128); g.bezierCurveTo(78, -124, 100, -36, 152, -26); g.lineTo(186, -26); g.lineTo(186, -12); g.lineTo(150, -12);
    g.bezierCurveTo(96, -22, 70, -108, 22, -112); g.closePath(); g.fillStyle = '#5AA9FF'; g.fill(); ol(g, 3.5);
    g.beginPath(); g.moveTo(30, -122); g.bezierCurveTo(78, -116, 100, -34, 150, -21); g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 4; g.stroke();
    rr(g, -32, -136, 62, 16, 5); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 3.5);   // platform
    rr(g, -32, -160, 6, 28, 2); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2.5); rr(g, 24, -160, 6, 28, 2); g.fill(); ol(g, 2.5);
    rr(g, -34, -164, 66, 7, 3); g.fill(); ol(g, 2.5);
  }
  function ball(g) {
    ell(g, 6, 3, 34, 9); g.fillStyle = SH; g.fill();
    g.beginPath(); g.arc(0, -30, 30, 0, TAU); g.fillStyle = rad(g, -10, -42, 44, '#FFB088', '#F0582A'); g.fill();
    g.save(); g.beginPath(); g.arc(0, -30, 30, 0, TAU); g.clip();
    g.strokeStyle = '#FFFFFF'; g.lineWidth = 7; g.beginPath(); g.arc(-34, -30, 40, -0.9, 0.9); g.stroke();
    g.strokeStyle = '#FFD66B'; g.beginPath(); g.arc(40, -30, 40, Math.PI - 0.9, Math.PI + 0.9); g.stroke();
    g.restore();
    g.beginPath(); g.arc(0, -30, 30, 0, TAU); ol(g, 3.5);
    ell(g, -11, -44, 8, 5); g.fillStyle = 'rgba(255,255,255,0.75)'; g.fill();
  }
  function signpost(g, text) {
    ell(g, 4, 2, 22, 6); g.fillStyle = SH; g.fill();
    rr(g, -5, -78, 10, 80, 3); g.fillStyle = lin(g, -5, 0, 5, 0, '#B77B45', '#8F5A2E'); g.fill(); ol(g, 3);
    g.font = '700 24px ' + FONT;
    var tw = g.measureText(text).width + 34;
    rr(g, -tw / 2 + 3, -110, tw, 42, 12); g.fillStyle = 'rgba(27,42,73,0.25)'; g.fill();
    rr(g, -tw / 2, -114, tw, 42, 12); g.fillStyle = '#FFF3D6'; g.fill(); ol(g, 3.5);
    g.fillStyle = NAVY; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 0, -92);
  }

  // ---------- moving things, drawn every frame ----------
  function fountain(c, x, y, t) {
    var i, k;
    ell(c, x + 16, y - 4, 112, 40); c.fillStyle = SH; c.fill();
    ell(c, x, y - 6, 96, 36); c.fillStyle = '#B5AE9F'; c.fill(); ol(c, 4);                                  // basin wall
    c.fillStyle = '#B5AE9F'; c.fillRect(x - 96, y - 26, 192, 20);
    c.beginPath(); c.moveTo(x - 96, y - 26); c.lineTo(x - 96, y - 6); c.moveTo(x + 96, y - 26); c.lineTo(x + 96, y - 6); ol(c, 4);
    ell(c, x, y - 26, 96, 36); c.fillStyle = '#DDD6C8'; c.fill(); ol(c, 4);                                  // rim
    ell(c, x, y - 26, 80, 28); c.fillStyle = lin(c, 0, y - 54, 0, y, '#9ADCFF', '#4FB2EE'); c.fill(); ol(c, 3);
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 2.5;
    for (i = 0; i < 3; i++) { k = (t * 0.5 + i / 3) % 1; c.globalAlpha = 1 - k; ell(c, x, y - 26, 16 + k * 58, 6 + k * 20); c.stroke(); }
    c.globalAlpha = 1;
    rr(c, x - 11, y - 92, 22, 68, 7); c.fillStyle = lin(c, x - 11, 0, x + 11, 0, '#E6DFD0', '#B5AE9F'); c.fill(); ol(c, 3.5);
    ell(c, x, y - 92, 30, 10); c.fillStyle = '#DDD6C8'; c.fill(); ol(c, 3.5);
    c.lineCap = 'round';
    for (i = -1; i <= 1; i += 2) {
      c.beginPath(); c.moveTo(x, y - 96); c.quadraticCurveTo(x + i * 30, y - 138 - Math.sin(t * 4) * 5, x + i * 50, y - 32);
      c.strokeStyle = '#7CCBFF'; c.lineWidth = 8; c.stroke(); c.strokeStyle = '#E4F6FF'; c.lineWidth = 3.5; c.stroke();
    }
    c.beginPath(); c.moveTo(x, y - 96); c.lineTo(x, y - 122 - Math.sin(t * 5) * 4); c.strokeStyle = '#7CCBFF'; c.lineWidth = 7; c.stroke(); c.strokeStyle = '#E4F6FF'; c.lineWidth = 3; c.stroke();
  }
  function trophy(c, x, y) {
    ell(c, x + 10, y, 52, 13); c.fillStyle = SH; c.fill();
    rr(c, x - 38, y - 18, 76, 22, 6); c.fillStyle = '#774B27'; c.fill(); ol(c, 4);
    poly(c, [x - 34, y - 18, x + 34, y - 18, x + 40, y - 30, x - 28, y - 30]); c.fillStyle = '#A8733F'; c.fill(); ol(c, 4);
    rr(c, x - 8, y - 60, 16, 34, 4); c.fillStyle = lin(c, x - 8, 0, x + 8, 0, '#FFE27A', '#E0A21A'); c.fill(); ol(c, 4);
    c.beginPath(); c.moveTo(x - 36, y - 128); c.lineTo(x + 36, y - 128); c.quadraticCurveTo(x + 34, y - 66, x, y - 58); c.quadraticCurveTo(x - 34, y - 66, x - 36, y - 128); c.closePath();
    c.fillStyle = lin(c, x - 36, 0, x + 36, 0, '#FFE27A', '#E8A91C'); c.fill(); ol(c, 4);
    ell(c, x, y - 128, 36, 9); c.fillStyle = '#FFF0B8'; c.fill(); ol(c, 3.5);
    c.fillStyle = 'rgba(255,255,255,0.55)'; rr(c, x - 26, y - 118, 9, 40, 4); c.fill();
    starPath(c, x + 4, y - 96, 14); c.fillStyle = '#fff'; c.fill();
  }
  function smoke(c, x, y, t, n) {
    for (var i = 0; i < 3; i++) {
      var k = (t * 0.22 + i / 3 + n * 0.37) % 1;
      c.globalAlpha = 0.55 * (1 - k);
      c.beginPath(); c.arc(x + k * 20 + Math.sin(k * 7 + i) * 5, y - k * 56, 6 + k * 11, 0, TAU); c.fillStyle = '#fff'; c.fill();
    }
    c.globalAlpha = 1;
  }
  function balloons(c, b, t) {
    [['#FF4F6D', -1, 0], ['#5AA9FF', 1, 1.7]].forEach(function (q) {
      var ax = b.x + b.w / 2 + q[1] * (b.w / 2 + 14), ay = b.y + 112, sway = Math.sin(t * 1.4 + q[2] + b.x) * 6, bx = ax + sway, by = b.y + 26;
      c.strokeStyle = NAVY; c.lineWidth = 2; c.beginPath(); c.moveTo(ax, ay); c.quadraticCurveTo(ax + sway * 0.3, (ay + by) / 2, bx, by + 24); c.stroke();
      ell(c, bx, by, 19, 24); c.fillStyle = q[0]; c.fill(); ol(c, 3);
      ell(c, bx - 6, by - 9, 5, 7); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fill();
    });
  }

  // ---------- everything that stands up and can hide a player: pushed into `list` as { y, d } ----------
  function items(c, world, v, t, st, list) {
    var g = world.playground;
    world.buildings.forEach(function (b, n) {
      if (!inView(v, b.x + b.w / 2, b.y + b.h / 2, b.w / 2 + 180)) return;
      list.push({ y: b.y + b.h, d: function () {
        sprite(c, 'b' + b.id + (b.open ? 1 : 0) + fontOk, b.x - 50, b.y - 30, b.w + 50 + DX + 104, b.h + 74, function (q) { q.translate(50, 30); house(q, b); });
        if (b.open) smoke(c, b.x + b.w - 62, b.y - 16, t, n);
        if (b.open && st.family >= 60) balloons(c, b, t);   // family goal 2
      } });
    });
    TREES.forEach(function (q, n) {
      if (!inView(v, q[0], q[1] - 70, 150)) return;
      list.push({ y: q[1], d: function () { sprite(c, 'tree' + n % 3, q[0] - 80, q[1] - 170, 170, 190, function (s) { s.translate(80, 170); tree(s, n % 3); }); } });
    });
    BUSHES.forEach(function (q, n) {
      if (!inView(v, q[0], q[1], 80)) return;
      list.push({ y: q[1], d: function () { sprite(c, 'bush' + n % 2, q[0] - 46, q[1] - 52, 100, 66, function (s) { s.translate(46, 52); bush(s, n); }); } });
    });
    ROCKS.forEach(function (q) {
      if (!inView(v, q[0], q[1], 60)) return;
      list.push({ y: q[1], d: function () { sprite(c, 'rock', q[0] - 36, q[1] - 38, 84, 52, function (s) { s.translate(36, 38); rock(s); }); } });
    });
    LAMPS.forEach(function (q) {
      if (!inView(v, q[0], q[1] - 60, 110)) return;
      list.push({ y: q[1], d: function () { sprite(c, 'lamp', q[0] - 50, q[1] - 158, 100, 170, function (s) { s.translate(50, 158); lamp(s); }); } });
    });
    BENCHES.forEach(function (q) {
      if (!inView(v, q[0], q[1], 90)) return;
      list.push({ y: q[1] - 12, d: function () { sprite(c, 'bench', q[0] - 62, q[1] - 62, 132, 80, function (s) { s.translate(62, 62); bench(s); }); } });
    });
    if (inView(v, g.x + g.w / 2, g.y + g.h / 2, g.w)) {
      list.push({ y: g.y + 250, d: function () { sprite(c, 'slide', g.x + 60, g.y + 76, 290, 200, function (s) { s.translate(60, 174); slide(s); }); } });
      list.push({ y: g.y + 262, d: function () { sprite(c, 'ball', g.x + 322, g.y + 196, 86, 80, function (s) { s.translate(38, 66); ball(s); }); } });
      list.push({ y: g.y + 28, d: function () { sprite(c, 'sign' + fontOk, g.x + g.w / 2 - 130, g.y - 104, 260, 136, function (s) { s.translate(130, 124); signpost(s, 'Playground · Tag'); }); } });
    }
    if (st.family >= 25) list.push({ y: 660, d: function () { fountain(c, 1200, 660, t); } });   // family goal 1
    if (st.family >= 200) list.push({ y: 1010, d: function () { trophy(c, 1400, 1010); } });      // family goal 4
  }

  // ---------- a star to collect: a chunky gold star that wobbles, glows and twinkles ----------
  function star(c, s, t) {
    var bob = Math.sin(t * 3 + s.id) * 6, y = s.y - 32 + bob, sx = 0.62 + 0.38 * Math.abs(Math.cos(t * 1.6 + s.id * 1.3)), i;
    ell(c, s.x, s.y + 6, 19 - bob * 0.4, 6 - bob * 0.12); c.fillStyle = 'rgba(22,48,66,0.20)'; c.fill();
    sprite(c, 'glow', s.x - 52, y - 52, 104, 104, function (g) { g.beginPath(); g.arc(52, 52, 52, 0, TAU); g.fillStyle = rad(g, 52, 52, 52, 'rgba(255,224,102,0.55)', 'rgba(255,224,102,0)'); g.fill(); });
    c.save(); c.translate(s.x, y); c.scale(sx, 1);
    c.lineJoin = 'round';
    starPath(c, 4 / sx, 4, 24); c.fillStyle = '#C9891A'; c.fill(); c.lineWidth = 3.5; c.strokeStyle = NAVY; c.stroke();   // the thickness
    starPath(c, 0, 0, 24); c.fillStyle = '#FFC933'; c.fill(); c.stroke();
    starPath(c, -2, -3, 13); c.fillStyle = '#FFE27A'; c.fill();
    ell(c, -8, -9, 4.5, 2.6); c.fillStyle = 'rgba(255,255,255,0.85)'; c.fill();
    c.restore();
    for (i = 0; i < 3; i++) { // twinkles
      var k = (t * 0.8 + i / 3 + s.id * 0.21) % 1, a = i * 2.1 + s.id, r = 30 + i * 5, tx = s.x + Math.cos(a) * r, ty = y + Math.sin(a) * r * 0.8, q = 5 * Math.sin(k * Math.PI);
      c.fillStyle = 'rgba(255,255,255,0.95)'; poly(c, [tx, ty - q, tx + q * 0.3, ty - q * 0.3, tx + q, ty, tx + q * 0.3, ty + q * 0.3, tx, ty + q, tx - q * 0.3, ty + q * 0.3, tx - q, ty, tx - q * 0.3, ty - q * 0.3]); c.fill();
    }
  }

  // ---------- above everything: drifting cloud shadows and a few butterflies ----------
  function sky(c, world, v, t) {
    var i, x, y;
    c.fillStyle = 'rgba(20,60,70,0.07)';
    for (i = 0; i < 5; i++) {
      x = ((i * 613 + t * 16) % (world.w + 800)) - 400; y = 160 + ((i * 397) % (world.h - 320));
      if (!inView(v, x, y, 330)) continue;
      ell(c, x, y, 250, 86); c.fill(); ell(c, x + 150, y + 36, 170, 62); c.fill(); ell(c, x - 140, y + 26, 150, 54); c.fill();
    }
    for (i = 0; i < 6; i++) {
      x = 300 + ((i * 431) % (world.w - 600)) + Math.sin(t * 0.5 + i * 2) * 120 + Math.sin(t * 1.3 + i) * 30;
      y = 300 + ((i * 577) % (world.h - 600)) + Math.cos(t * 0.4 + i * 3) * 80 + Math.sin(t * 5 + i) * 6;
      if (!inView(v, x, y, 30)) continue;
      var flap = 0.25 + 0.75 * Math.abs(Math.sin(t * 9 + i)), col = ['#FF8FB8', '#FFD66B', '#B79CFF', '#7CCBFF', '#FF7A45', '#FFFFFF'][i];
      c.save(); c.translate(x, y); c.rotate(Math.sin(t * 0.5 + i * 2) * 0.4);
      c.fillStyle = col; c.strokeStyle = NAVY; c.lineWidth = 1.6;
      c.save(); c.scale(flap, 1);
      ell(c, -7, -3, 7, 6); c.fill(); c.stroke(); ell(c, 7, -3, 7, 6); c.fill(); c.stroke();
      ell(c, -5, 5, 5, 4.5); c.fill(); c.stroke(); ell(c, 5, 5, 5, 4.5); c.fill(); c.stroke();
      c.restore();
      rr(c, -1.6, -7, 3.2, 14, 1.6); c.fillStyle = NAVY; c.fill();
      c.restore();
    }
  }

  window.Scene = { setRes: setRes, ground: ground, items: items, star: star, sky: sky, shade: shade };
})();
