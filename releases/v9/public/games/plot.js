// Home Street (client): every player's own home and garden. A lobby with a card for every family home,
// then the garden itself: walk around with the others, decorate it in edit mode, buy things in the garden shop.
// The server (games/plot.js) owns the catalogue, the prices and every plot; this file draws and asks.
(function () {
  'use strict';
  var api = null, root = null;
  var NAVY = '#1B2A49', TAU = Math.PI * 2, SH = 'rgba(22,48,66,0.20)';
  var TW = 72, TH = 52, GW = 12, GH = 8, PW = GW * TW, PH = GH * TH;   // the garden: tiles, and its size in garden pixels
  var HOUSE = { x: 4, y: 0, w: 4, h: 2 }, SPAWN = { x: 5.5 * TW, y: PH - 22 }, GATE = 5.5 * TW, DOORX = -36;
  var MT = 126, MS = 50;               // room around the garden: above (house, trees) and beside (hedges)
  var DX = 28, DY = 17;                // "further back" is drawn this much to the right and up
  var AV = 0.8;                        // avatars are a little smaller than in town

  // ---------- small drawing helpers (the same style as scene.js) ----------
  function shade(hex, f) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    function m(v) { v = Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f); return (v < 16 ? '0' : '') + v.toString(16); }
    return '#' + m(r) + m(g) + m(b);
  }
  function rnd(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function rrTop(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h); c.closePath();
  }
  function poly(c, p) { c.beginPath(); c.moveTo(p[0], p[1]); for (var i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); }
  function ell(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); }
  function ol(c, w) { c.lineWidth = w || 3.5; c.strokeStyle = NAVY; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
  function lin(c, x0, y0, x1, y1, a, b) { var g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
  function rad(c, x, y, r, a, b) { var g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
  function starPath(c, x, y, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    c.closePath();
  }
  function blobs(c, list, fill, lw) {   // round blobs that read as one shape: outline first, fill on top
    var i;
    c.strokeStyle = NAVY; c.lineWidth = (lw || 4) * 2;
    for (i = 0; i < list.length; i++) { c.beginPath(); c.arc(list[i][0], list[i][1], list[i][2], 0, TAU); c.stroke(); }
    c.fillStyle = fill;
    for (i = 0; i < list.length; i++) { c.beginPath(); c.arc(list[i][0], list[i][1], list[i][2], 0, TAU); c.fill(); }
  }
  function sh(c, x, y, rx, ry) { ell(c, x, y, rx, ry); c.fillStyle = SH; c.fill(); }
  function tube(c, w, col) { c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = NAVY; c.lineWidth = w + 5; c.stroke(); c.strokeStyle = col; c.lineWidth = w; c.stroke(); }   // the current path as an outlined pipe
  // a box standing on the ground: front face from x to x + w with its bottom at y, `d` deep (drawn to the right and up)
  function box(c, x, y, w, h, d, col, lw) {
    var dx = d * 0.62, dy = d * 0.38;
    poly(c, [x + w, y, x + w + dx, y - dy, x + w + dx, y - h - dy, x + w, y - h]); c.fillStyle = shade(col, -0.24); c.fill(); ol(c, lw);
    poly(c, [x, y - h, x + w, y - h, x + w + dx, y - h - dy, x + dx, y - h - dy]); c.fillStyle = shade(col, 0.22); c.fill(); ol(c, lw);
    c.beginPath(); c.rect(x, y - h, w, h); c.fillStyle = lin(c, 0, y - h, 0, y, shade(col, 0.06), shade(col, -0.08)); c.fill(); ol(c, lw);
  }
  function bloom(c, x, y, r, col, mid) {   // a little flower head
    for (var i = 0; i < 5; i++) { var a = -Math.PI / 2 + i * TAU / 5; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.52, 0, TAU); c.fillStyle = col; c.fill(); c.lineWidth = 1.5; c.strokeStyle = NAVY; c.stroke(); }
    c.beginPath(); c.arc(x, y, r * 0.42, 0, TAU); c.fillStyle = mid; c.fill(); c.lineWidth = 1.3; c.strokeStyle = NAVY; c.stroke();
  }
  function wob(c, cx, cy, rx, ry, k, seed) {   // a round shape with a wobbly edge (a pond)
    c.beginPath();
    for (var i = 0; i < 40; i++) { var a = i * TAU / 40, r = k * (1 + 0.07 * Math.sin(a * 3 + seed) + 0.04 * Math.sin(a * 5 + seed * 2)); c.lineTo(cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r); }
    c.closePath();
  }
  function puffs(c, x, y, t, n) {   // smoke
    for (var i = 0; i < 3; i++) {
      var k = (t * 0.25 + i / 3 + n * 0.37) % 1;
      c.globalAlpha = 0.6 * (1 - k);
      c.beginPath(); c.arc(x + k * 14 + Math.sin(k * 7 + i) * 4, y - k * 40, 4 + k * 8, 0, TAU); c.fillStyle = '#fff'; c.fill();
    }
    c.globalAlpha = 1;
  }
  function twinkle(c, x, y, q) {   // a four-point sparkle
    if (q <= 0.2) return;
    c.fillStyle = 'rgba(255,255,255,0.95)';
    poly(c, [x, y - q, x + q * 0.3, y - q * 0.3, x + q, y, x + q * 0.3, y + q * 0.3, x, y + q, x - q * 0.3, y + q * 0.3, x - q, y, x - q * 0.3, y - q * 0.3]); c.fill();
  }
  function twinkles(c, t, pts) { for (var i = 0; i < pts.length; i++) twinkle(c, pts[i][0], pts[i][1], 6 * Math.sin(((t * 0.7 + i / pts.length) % 1) * Math.PI)); }
  var glowImg = null;
  function glow(c, x, y, r, a) {   // warm light around a lamp
    if (!glowImg) {
      glowImg = document.createElement('canvas'); glowImg.width = glowImg.height = 96;
      var g = glowImg.getContext('2d'); g.fillStyle = rad(g, 48, 48, 48, 'rgba(255,226,122,0.75)', 'rgba(255,226,122,0)'); g.fillRect(0, 0, 96, 96);
    }
    c.globalAlpha = a; c.drawImage(glowImg, x - r, y - r, r * 2, r * 2); c.globalAlpha = 1;
  }
  function duck(c, x, y, f, s) {
    c.save(); c.translate(x, y); c.scale(f * s, s);
    ell(c, 0, 0, 10, 6.5); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 2);
    c.beginPath(); c.arc(8, -7, 5.5, 0, TAU); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 2);
    poly(c, [12, -8, 19, -6, 12, -4]); c.fillStyle = '#FF7A45'; c.fill(); ol(c, 1.5);
    c.beginPath(); c.arc(9.5, -8.5, 1.2, 0, TAU); c.fillStyle = NAVY; c.fill();
    c.beginPath(); c.moveTo(-5, -1); c.quadraticCurveTo(0, 4, 5, -1); c.lineWidth = 1.5; c.strokeStyle = '#E0A21A'; c.stroke();
    c.restore();
  }

  // ---------- the things: each is drawn with (0, 0) at the middle of the front edge of its tiles ----------
  // ART[id] = { top: the highest point (for the picture size), s: the part that never moves (cached as a sprite),
  //             a: the moving part, drawn every frame, s2: a still part in front of the moving part, flat: lies on the ground }
  var ART = {};
  function art(id, top, s, o) { var a = { top: top, s: s }, k; if (o) for (k in o) a[k] = o[k]; ART[id] = a; }

  // --- outdoor furniture ---
  art('chair', -66, function (g) {
    sh(g, 6, -10, 26, 7);
    g.fillStyle = '#8F5A2E'; [-18, 13].forEach(function (x) { rr(g, x, -30, 5, 20, 2); g.fill(); ol(g, 2.5); });
    rr(g, -19, -64, 38, 32, 8); g.fillStyle = lin(g, 0, -64, 0, -32, '#6FE0CF', '#3CB5A3'); g.fill(); ol(g, 3);
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 4; g.beginPath(); g.moveTo(-8, -57); g.lineTo(-8, -39); g.moveTo(5, -57); g.lineTo(5, -39); g.stroke();
    poly(g, [-19, -34, 19, -34, 25, -22, -25, -22]); g.fillStyle = '#8CEBDB'; g.fill(); ol(g, 3);
    rr(g, -25, -22, 50, 7, 3); g.fillStyle = '#2F9E83'; g.fill(); ol(g, 3);
  });
  art('bench', -78, function (g) {
    g.translate(0, -12); g.scale(1.12, 1.12);
    sh(g, 6, 4, 56, 10);
    g.fillStyle = '#5B6275'; [-38, 32].forEach(function (x) { rr(g, x, -24, 7, 26, 2); g.fill(); ol(g, 2.5); });
    rr(g, -48, -56, 96, 15, 5); g.fillStyle = '#C98A4B'; g.fill(); ol(g, 3);
    rr(g, -48, -39, 96, 9, 4); g.fillStyle = '#B77B45'; g.fill(); ol(g, 3);
    poly(g, [-50, -26, 50, -26, 56, -14, -56, -14]); g.fillStyle = '#DDA263'; g.fill(); ol(g, 3);
    rr(g, -56, -14, 112, 7, 3); g.fillStyle = '#A56B38'; g.fill(); ol(g, 3);
  });
  art('parasol', -126, function (g) {
    function top() {
      g.beginPath(); g.moveTo(-46, -86); g.quadraticCurveTo(-42, -120, 0, -122); g.quadraticCurveTo(42, -120, 46, -86);
      g.quadraticCurveTo(34.5, -78, 23, -86); g.quadraticCurveTo(11.5, -78, 0, -86); g.quadraticCurveTo(-11.5, -78, -23, -86); g.quadraticCurveTo(-34.5, -78, -46, -86); g.closePath();
    }
    sh(g, 10, -10, 40, 10);
    ell(g, 0, -14, 13, 5); g.fillStyle = '#8D949E'; g.fill(); ol(g, 2.5);
    rr(g, -3, -100, 6, 87, 3); g.fillStyle = lin(g, -3, 0, 3, 0, '#F2ECDD', '#A9A294'); g.fill(); ol(g, 2.5);
    ell(g, 0, -87, 44, 8); g.fillStyle = '#B3122F'; g.fill();
    top(); g.fillStyle = '#FF4F6D'; g.fill();
    g.save(); top(); g.clip();
    g.fillStyle = '#fff'; poly(g, [0, -124, -23, -76, 0, -76]); g.fill(); poly(g, [0, -124, 23, -76, 46, -76, 50, -90]); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.25)'; ell(g, -22, -110, 16, 7); g.fill();
    g.fillStyle = 'rgba(27,42,73,0.10)'; g.fillRect(20, -124, 30, 50);
    g.restore();
    top(); ol(g, 3);
    g.beginPath(); g.arc(0, -123, 4, 0, TAU); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2);
  });
  art('table', -78, function (g) {
    var tx = -56, ty = -42, dx = 18.6, dy = 11.4;
    sh(g, 12, -8, 64, 11);
    g.fillStyle = '#8F5A2E'; [[-50, -12], [36, -12], [-32, -23], [54, -23]].forEach(function (q) { rr(g, q[0], q[1] - 32, 7, 32, 2); g.fill(); ol(g, 2.5); });
    box(g, tx, ty, 100, 8, 30, '#C98A4B', 3);
    poly(g, [tx + 32, ty - 8, tx + 68, ty - 8, tx + 68 + dx, ty - 8 - dy, tx + 32 + dx, ty - 8 - dy]); g.fillStyle = '#FF6B81'; g.fill(); ol(g, 2.5);   // a red runner
    rr(g, tx + 32, ty - 8, 36, 15, 3); g.fillStyle = '#E0344F'; g.fill(); ol(g, 2.5);
    g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(tx + 44, ty - 6); g.lineTo(tx + 44, ty + 5); g.moveTo(tx + 56, ty - 6); g.lineTo(tx + 56, ty + 5); g.stroke();
    [[tx + 22, ty - 14], [tx + 92, ty - 14]].forEach(function (q) { ell(g, q[0], q[1], 10, 4.5); g.fillStyle = '#fff'; g.fill(); ol(g, 2); ell(g, q[0], q[1], 5, 2.2); g.fillStyle = '#FFD66B'; g.fill(); });
    rr(g, tx + 54, ty - 34, 12, 18, 3); g.fillStyle = '#9ADCFF'; g.fill(); ol(g, 2.5);                                                                    // a jug
    rr(g, tx + 54, ty - 26, 12, 10, 3); g.fillStyle = '#FF9F43'; g.fill();
    rr(g, tx + 54, ty - 34, 12, 18, 3); ol(g, 2.5);
  });
  art('sandpit', -104, function (g) {
    var i;
    rr(g, -62, -90, 134, 88, 12); g.fillStyle = SH; g.fill();
    rr(g, -68, -88, 132, 84, 12); g.fillStyle = '#9A6B3A'; g.fill(); ol(g, 3.5);
    rr(g, -68, -98, 132, 84, 12); g.fillStyle = '#D2A062'; g.fill(); ol(g, 3.5);
    rr(g, -57, -89, 110, 66, 7); g.fillStyle = '#F6E2A8'; g.fill();
    g.save(); rr(g, -57, -89, 110, 66, 7); g.clip();
    for (i = 0; i < 26; i++) { ell(g, -57 + rnd(i + 3) * 110, -89 + rnd(i + 40) * 66, 2 + rnd(i) * 2.5, 1.4 + rnd(i + 9)); g.fillStyle = i % 2 ? 'rgba(255,255,255,0.5)' : 'rgba(150,118,62,0.22)'; g.fill(); }
    g.strokeStyle = 'rgba(27,42,73,0.15)'; g.lineWidth = 14; rr(g, -57, -89, 150, 100, 7); g.stroke();
    g.restore();
    rr(g, -57, -89, 110, 66, 7); ol(g, 2.5);
    ell(g, -28, -40, 17, 6); g.fillStyle = '#E3C77E'; g.fill();                                           // a sand castle
    rr(g, -39, -58, 22, 18, 3); g.fillStyle = '#EDD592'; g.fill(); ol(g, 2.5);
    [-39, -31, -23].forEach(function (x) { rr(g, x, -63, 6, 7, 1.5); g.fillStyle = '#EDD592'; g.fill(); ol(g, 2); });
    g.strokeStyle = NAVY; g.lineWidth = 2; g.beginPath(); g.moveTo(-28, -62); g.lineTo(-28, -76); g.stroke(); poly(g, [-28, -76, -18, -72, -28, -68]); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 1.8);
    poly(g, [18, -52, 40, -52, 37, -34, 21, -34]); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 2.5);        // bucket
    g.beginPath(); g.arc(29, -52, 11, Math.PI, 0); g.lineWidth = 2.5; g.strokeStyle = '#fff'; g.stroke();
    ell(g, 29, -52, 11, 3.5); g.fillStyle = '#B3122F'; g.fill(); ol(g, 2);
  }, { flat: true });
  art('doghouse', -84, function (g) {
    sh(g, 12, -10, 38, 9);
    poly(g, [24, -12, 37, -20, 37, -50, 24, -44]); g.fillStyle = '#D9BE9A'; g.fill(); ol(g, 3);
    rr(g, -24, -47, 48, 35, 4); g.fillStyle = lin(g, 0, -47, 0, -12, '#FFF1DD', '#F2D9B8'); g.fill(); ol(g, 3);
    g.beginPath(); g.moveTo(-10, -12); g.lineTo(-10, -27); g.arc(0, -27, 10, Math.PI, 0); g.lineTo(10, -12); g.closePath(); g.fillStyle = '#4A3526'; g.fill(); ol(g, 2.5);
    poly(g, [30, -45, 44, -54, 32, -80, 22, -74]); g.fillStyle = '#A8321A'; g.fill(); ol(g, 3);
    poly(g, [-30, -45, 30, -45, 22, -74, -22, -74]); g.fillStyle = lin(g, 0, -74, 0, -45, '#F0623C', '#D0461F'); g.fill(); ol(g, 3);
    g.strokeStyle = 'rgba(27,42,73,0.2)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-26, -55); g.lineTo(27, -55); g.moveTo(-24, -65); g.lineTo(25, -65); g.stroke();
    rr(g, -8, -44, 16, 6, 3); g.fillStyle = '#fff'; g.fill(); ol(g, 1.8);                                 // a bone over the door
    ell(g, -22, -11, 8, 3.5); g.fillStyle = '#5AA9FF'; g.fill(); ol(g, 2);                                // a bowl
  });
  art('bbq', -82, function (g) {
    sh(g, 8, -10, 28, 8);
    g.beginPath(); g.moveTo(-11, -40); g.lineTo(-18, -12); g.moveTo(11, -40); g.lineTo(18, -12); g.moveTo(0, -40); g.lineTo(2, -18); tube(g, 2.5, '#A9AFB8');
    g.beginPath(); g.arc(0, -46, 24, 0, Math.PI); g.closePath(); g.fillStyle = lin(g, -24, 0, 24, 0, '#5B6275', '#2B3040'); g.fill(); ol(g, 3);
    g.beginPath(); g.arc(0, -49, 24, Math.PI, 0); g.closePath(); g.fillStyle = lin(g, -24, 0, 24, 0, '#FF7A5A', '#C9381C'); g.fill(); ol(g, 3);
    rr(g, -25, -50, 50, 5, 2); g.fillStyle = '#D5DAE0'; g.fill(); ol(g, 2.5);
    rr(g, -7, -80, 14, 7, 3); g.fillStyle = NAVY; g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; ell(g, -10, -62, 7, 4); g.fill();
  }, { a: function (c, t) { puffs(c, 0, -84, t, 1); } });
  art('hammock', -86, function (g) {
    function cloth() { g.beginPath(); g.moveTo(-54, -70); g.quadraticCurveTo(0, -38, 56, -70); g.quadraticCurveTo(0, -2, -54, -70); g.closePath(); }
    var i;
    sh(g, 8, -8, 66, 10);
    [-62, 54].forEach(function (x) { rr(g, x, -82, 9, 72, 3); g.fillStyle = lin(g, x, 0, x + 9, 0, '#C98A4B', '#8F5A2E'); g.fill(); ol(g, 3); });
    cloth(); g.fillStyle = '#FFF3D6'; g.fill();
    g.save(); cloth(); g.clip();
    for (i = 0; i < 8; i++) { g.fillStyle = ['#5ED6C4', '#FFF3D6', '#FF8FB8', '#FFF3D6'][i % 4]; g.fillRect(-56 + i * 14, -74, 14, 74); }
    g.fillStyle = 'rgba(27,42,73,0.12)'; g.beginPath(); g.moveTo(-54, -70); g.quadraticCurveTo(0, -2, 56, -70); g.quadraticCurveTo(0, -18, -54, -70); g.fill();
    g.restore();
    cloth(); ol(g, 3);
    ell(g, -30, -55, 13, 6); g.fillStyle = '#fff'; g.fill(); ol(g, 2.5);
  });
  art('swing', -124, function (g) {
    sh(g, 10, -8, 70, 11);
    g.beginPath(); g.moveTo(-44, -24); g.lineTo(-51, -116); g.moveTo(74, -24); g.lineTo(53, -116); tube(g, 5, '#C9304E');
    g.beginPath(); g.moveTo(-64, -8); g.lineTo(-51, -116); g.lineTo(53, -116); g.lineTo(58, -8); tube(g, 6, '#FF4F6D');
  }, { a: function (c, t) {
    var a = Math.sin(t * 2.4) * 0.3, L = 82, px = Math.sin(a) * L, py = -114 + Math.cos(a) * L;
    c.strokeStyle = NAVY; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-13, -114); c.lineTo(px - 14, py); c.moveTo(15, -114); c.lineTo(px + 14, py); c.stroke();
    c.save(); c.translate(px, py); c.rotate(-a); rr(c, -20, -3, 40, 8, 3); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 2.5); c.restore();
  } });
  art('tent', -134, function (g) {
    sh(g, 22, -16, 86, 18);
    poly(g, [54, -16, 0, -112, 36, -130, 88, -44]); g.fillStyle = '#D9772A'; g.fill(); ol(g, 3.5);
    poly(g, [-56, -16, 0, -112, 54, -16]); g.fillStyle = lin(g, -56, 0, 54, 0, '#FFC06E', '#FF9F43'); g.fill(); ol(g, 3.5);
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 4; g.beginPath(); g.moveTo(-40, -22); g.lineTo(-6, -92); g.stroke();
    poly(g, [-20, -16, 0, -72, 20, -16]); g.fillStyle = '#5A3A22'; g.fill(); ol(g, 3);
    poly(g, [-20, -16, 0, -72, -6, -16]); g.fillStyle = '#FFE0A8'; g.fill(); ol(g, 2.5);
    g.strokeStyle = NAVY; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, -112); g.lineTo(0, -128); g.stroke();
    poly(g, [0, -128, 14, -123, 0, -118]); g.fillStyle = '#5AA9FF'; g.fill(); ol(g, 2);
  });

  // --- plants ---
  function tree(g, kind) {   // 0 round tree, 1 pine, 2 apple tree, 3 cherry blossom
    var i, L, pink = kind === 3;
    g.translate(0, -14); g.scale(0.8, 0.8);
    sh(g, 18, 3, 50, 14);
    if (kind === 1) {
      rr(g, -8, -40, 16, 42, 6); g.fillStyle = lin(g, -8, 0, 8, 0, '#A8733F', '#774B27'); g.fill(); ol(g, 3.5);
      [[-30, 48, 60], [-66, 39, 56], [-98, 29, 52]].forEach(function (q) {
        poly(g, [-q[1], q[0], 0, q[0] - q[2], q[1], q[0]]); g.fillStyle = '#35966A'; g.fill();
        poly(g, [0, q[0] - q[2], q[1], q[0], 4, q[0]]); g.fillStyle = '#26764F'; g.fill();
        poly(g, [-q[1] + 12, q[0] - 6, -3, q[0] - q[2] + 12, -q[1] * 0.35, q[0] - 6]); g.fillStyle = 'rgba(255,255,255,0.16)'; g.fill();
        poly(g, [-q[1], q[0], 0, q[0] - q[2], q[1], q[0]]); ol(g, 4);
      });
      return;
    }
    rr(g, -10, -58, 20, 60, 7); g.fillStyle = lin(g, -10, 0, 10, 0, pink ? '#9A6A52' : '#A8733F', pink ? '#5E3A2A' : '#774B27'); g.fill(); ol(g, 3.5);
    L = [[-25, -88, 32], [25, -86, 32], [0, -118, 38], [0, -84, 30]];
    blobs(g, L, pink ? '#E86FA3' : '#2F8548', 4);
    g.fillStyle = pink ? '#F9A0C4' : '#45A65D'; for (i = 0; i < L.length; i++) { g.beginPath(); g.arc(L[i][0] - 5, L[i][1] - 6, L[i][2] - 9, 0, TAU); g.fill(); }
    g.fillStyle = pink ? '#FFD0E2' : '#6CC67F'; [[-30, -100, 13], [-8, -132, 16], [14, -100, 10]].forEach(function (q) { g.beginPath(); g.arc(q[0], q[1], q[2], 0, TAU); g.fill(); });
    g.fillStyle = 'rgba(255,255,255,0.35)'; ell(g, -14, -138, 7, 4); g.fill();
    if (kind === 2) [[-28, -80], [8, -106], [26, -78], [-6, -70], [-18, -112]].forEach(function (q) {
      g.beginPath(); g.arc(q[0], q[1], 6.5, 0, TAU); g.fillStyle = '#FF4F6D'; g.fill(); g.lineWidth = 2; g.strokeStyle = NAVY; g.stroke();
      g.beginPath(); g.arc(q[0] - 2, q[1] - 2, 2, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill();
    });
    if (pink) [[-28, -80], [8, -106], [28, -80], [-6, -68], [-20, -114], [22, -116], [2, -138]].forEach(function (q) { bloom(g, q[0], q[1], 6, '#fff', '#FFD66B'); });
  }
  art('tree', -142, function (g) { tree(g, 0); });
  art('pine', -142, function (g) { tree(g, 1); });
  art('apple', -142, function (g) { tree(g, 2); });
  art('blossom', -142, function (g) { tree(g, 3); }, { a: function (c, t) {   // petals drifting down
    for (var i = 0; i < 4; i++) {
      var k = (t * 0.22 + i / 4) % 1;
      c.globalAlpha = Math.min(1, (1 - k) * 2);
      ell(c, -32 + i * 21 + Math.sin(k * 8 + i * 2) * 9, -100 + k * 92, 3.6, 2.4); c.fillStyle = '#FFB3D1'; c.fill();
    }
    c.globalAlpha = 1;
  } });
  art('palm', -158, function (g) {
    var i;
    function frond(x1, y1, cx, cy, col) {
      g.beginPath(); g.moveTo(8, -118); g.quadraticCurveTo(cx, cy, x1, y1); g.quadraticCurveTo(cx * 0.75 + 2, cy + 22, 8, -118); g.closePath();
      g.fillStyle = col; g.fill(); ol(g, 3);
    }
    sh(g, 16, -12, 42, 11);
    g.beginPath(); g.moveTo(-9, -12); g.quadraticCurveTo(-8, -70, 2, -118); g.lineTo(14, -116); g.quadraticCurveTo(6, -70, 9, -12); g.closePath();
    g.fillStyle = lin(g, -9, 0, 12, 0, '#D2A866', '#8F6A38'); g.fill(); ol(g, 3.5);
    g.strokeStyle = 'rgba(27,42,73,0.28)'; g.lineWidth = 2;
    for (i = 0; i < 6; i++) { g.beginPath(); g.moveTo(-8 + i * 1.5, -26 - i * 15); g.quadraticCurveTo(1 + i * 1.5, -21 - i * 15, 9 + i * 0.7, -27 - i * 15); g.stroke(); }
    frond(-62, -88, -44, -142, '#2F8548'); frond(76, -86, 58, -140, '#2F8548');
    frond(-52, -128, -22, -156, '#45A65D'); frond(66, -126, 38, -156, '#45A65D');
    frond(-22, -154, -2, -150, '#6CC67F'); frond(40, -154, 20, -150, '#6CC67F');
    [[1, -113], [15, -112], [8, -104]].forEach(function (q) { g.beginPath(); g.arc(q[0], q[1], 6.5, 0, TAU); g.fillStyle = '#7A4A2B'; g.fill(); ol(g, 2.5); });
  });
  art('bush', -52, function (g) {
    var L = [[-20, -14, 17], [18, -13, 17], [0, -25, 19]], i;
    g.translate(0, -12);
    sh(g, 10, 2, 40, 9);
    blobs(g, L, '#2F8548', 3.5);
    g.fillStyle = '#48A85F'; for (i = 0; i < L.length; i++) { g.beginPath(); g.arc(L[i][0] - 3, L[i][1] - 4, L[i][2] - 6, 0, TAU); g.fill(); }
    g.fillStyle = '#6CC67F'; g.beginPath(); g.arc(-8, -32, 7, 0, TAU); g.fill();
    [[-22, -18], [4, -30], [20, -16], [-4, -12]].forEach(function (q, k) { g.beginPath(); g.arc(q[0], q[1], 4.2, 0, TAU); g.fillStyle = k % 2 ? '#FF8FB8' : '#FFFFFF'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = NAVY; g.stroke(); });
  });
  function bed(g) {   // a raised bed of soil with a wooden front
    sh(g, 8, -8, 40, 9);
    rr(g, -31, -46, 62, 34, 9); g.fillStyle = '#7A4A2B'; g.fill(); ol(g, 3);
    g.fillStyle = 'rgba(255,255,255,0.10)'; rr(g, -27, -43, 54, 10, 5); g.fill();
    rr(g, -31, -19, 62, 11, 5); g.fillStyle = '#C98A4B'; g.fill(); ol(g, 3);
  }
  function flowerBed(g, col, mid) {
    bed(g);
    [[-19, -34, 20], [0, -38, 26], [19, -34, 20], [-10, -24, 16], [10, -24, 18]].forEach(function (q) {
      g.strokeStyle = '#3F9A53'; g.lineWidth = 3; g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0], q[1] - q[2]); g.stroke();
      ell(g, q[0] - 4, q[1] - 5, 4.5, 2.4); g.fillStyle = '#4FA05A'; g.fill(); ell(g, q[0] + 4, q[1] - 8, 4.5, 2.4); g.fill();
      bloom(g, q[0], q[1] - q[2], 7.5, col, mid);
    });
  }
  art('flr', -76, function (g) { flowerBed(g, '#FF4F6D', '#FFD66B'); });
  art('fly', -76, function (g) { flowerBed(g, '#FFD66B', '#FF7A45'); });
  art('flp', -76, function (g) { flowerBed(g, '#B79CFF', '#FFF3D6'); });
  art('hedge', -68, function (g) {
    var i;
    sh(g, 10, -8, 44, 8);
    poly(g, [36, -10, 46, -22, 46, -62, 36, -52]); g.fillStyle = '#226B3A'; g.fill(); ol(g, 3);
    poly(g, [-36, -52, 36, -52, 46, -64, -26, -64]); g.fillStyle = '#6CC67F'; g.fill(); ol(g, 3);
    rr(g, -36, -52, 72, 42, 6); g.fillStyle = lin(g, 0, -52, 0, -10, '#48A85F', '#2F8548'); g.fill(); ol(g, 3);
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 2.5;
    for (i = 0; i < 7; i++) { var x = -28 + rnd(i + 5) * 56, y = -46 + rnd(i + 12) * 28; g.beginPath(); g.arc(x, y, 5, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
  });
  art('pumpkin', -52, function (g) {
    function pk(x, y, r) {
      ell(g, x, y - r * 0.8, r, r * 0.8); g.fillStyle = rad(g, x - r * 0.3, y - r * 1.1, r * 1.5, '#FFBE6E', '#EE7424'); g.fill(); ol(g, 3);
      g.strokeStyle = 'rgba(150,60,10,0.45)'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y - r * 0.8, r * 0.45, r * 0.8, 0, 0, TAU); g.stroke();
      rr(g, x - 2.5, y - r * 1.6 - 6, 5, 9, 2); g.fillStyle = '#4FA05A'; g.fill(); ol(g, 2);
    }
    sh(g, 8, -10, 36, 8);
    g.beginPath(); g.moveTo(-28, -14); g.quadraticCurveTo(-6, -26, 26, -16); g.strokeStyle = '#3F9A53'; g.lineWidth = 3; g.stroke();
    ell(g, 28, -18, 8, 4.5); g.fillStyle = '#4FA05A'; g.fill(); ol(g, 2);
    pk(-15, -20, 14); pk(11, -11, 19);
  });
  art('sunflower', -106, function (g) {
    sh(g, 8, -10, 30, 7);
    [[-18, -78, 12], [16, -86, 13], [0, -100, 15]].forEach(function (q, k) {
      g.beginPath(); g.moveTo(q[0] * 0.5, -12); g.quadraticCurveTo(q[0] * 0.4, -50, q[0], q[1]); tube(g, 3, '#4FA05A');
      ell(g, q[0] * 0.6 - 8, -40 - k * 8, 8, 4); g.fillStyle = '#4FA05A'; g.fill(); ol(g, 2);
      for (var i = 0; i < 10; i++) { var a = i * TAU / 10; g.beginPath(); g.ellipse(q[0] + Math.cos(a) * q[2] * 0.8, q[1] + Math.sin(a) * q[2] * 0.8, q[2] * 0.5, q[2] * 0.28, a, 0, TAU); g.fillStyle = '#FFD23F'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = NAVY; g.stroke(); }
      g.beginPath(); g.arc(q[0], q[1], q[2] * 0.58, 0, TAU); g.fillStyle = '#8A5A33'; g.fill(); ol(g, 2);
      g.beginPath(); g.arc(q[0] - 2, q[1] - 2, q[2] * 0.2, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fill();
    });
  });
  art('veg', -62, function (g) {
    bed(g);
    [[-18, -36], [4, -38], [22, -34]].forEach(function (q) {                                             // cabbages
      g.beginPath(); g.arc(q[0], q[1], 9, 0, TAU); g.fillStyle = '#7BD389'; g.fill(); ol(g, 2.5);
      g.beginPath(); g.arc(q[0], q[1] - 1, 4.5, 0, TAU); g.fillStyle = '#B8F0BF'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#3F9A53'; g.stroke();
    });
    [[-20, -22], [-6, -24], [8, -22], [21, -24]].forEach(function (q) {                                  // carrots
      g.strokeStyle = '#3F9A53'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] - 4, q[1] - 9); g.moveTo(q[0], q[1]); g.lineTo(q[0], q[1] - 11); g.moveTo(q[0], q[1]); g.lineTo(q[0] + 4, q[1] - 9); g.stroke();
      ell(g, q[0], q[1], 3.6, 2.6); g.fillStyle = '#FF7A45'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = NAVY; g.stroke();
    });
  });

  // --- fun things ---
  art('ball', -52, function (g) {
    g.translate(0, -12); g.scale(0.62, 0.62);
    sh(g, 6, 3, 34, 9);
    g.beginPath(); g.arc(0, -30, 30, 0, TAU); g.fillStyle = rad(g, -10, -42, 44, '#FFB088', '#F0582A'); g.fill();
    g.save(); g.beginPath(); g.arc(0, -30, 30, 0, TAU); g.clip();
    g.strokeStyle = '#FFFFFF'; g.lineWidth = 7; g.beginPath(); g.arc(-34, -30, 40, -0.9, 0.9); g.stroke();
    g.strokeStyle = '#FFD66B'; g.beginPath(); g.arc(40, -30, 40, Math.PI - 0.9, Math.PI + 0.9); g.stroke();
    g.restore();
    g.beginPath(); g.arc(0, -30, 30, 0, TAU); ol(g, 4.5);
    ell(g, -11, -44, 8, 5); g.fillStyle = 'rgba(255,255,255,0.75)'; g.fill();
  });
  art('goal', -96, function (g) {
    var i, net = [-60, -88, 60, -88, 76, -30, -44, -30];
    sh(g, 12, -8, 72, 10);
    poly(g, net); g.fillStyle = 'rgba(255,255,255,0.32)'; g.fill();
    poly(g, [-60, -88, -60, -10, -44, -30]); g.fill(); poly(g, [60, -88, 60, -10, 76, -30]); g.fill();
    g.save(); poly(g, [-60, -88, 60, -88, 76, -30, 60, -10, -60, -10]); g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.6;
    for (i = -80; i < 90; i += 13) { g.beginPath(); g.moveTo(i, -90); g.lineTo(i + 16, -8); g.stroke(); }
    for (i = -78; i < -10; i += 12) { g.beginPath(); g.moveTo(-64, i); g.lineTo(80, i); g.stroke(); }
    g.restore();
    g.beginPath(); g.moveTo(-44, -30); g.lineTo(76, -30); g.lineTo(60, -10); g.moveTo(-44, -30); g.lineTo(-60, -10); g.lineWidth = 2.5; g.strokeStyle = NAVY; g.stroke();
    g.beginPath(); g.moveTo(-60, -10); g.lineTo(-60, -88); g.lineTo(60, -88); g.lineTo(60, -10); tube(g, 5, '#FFFFFF');
  });
  art('seesaw', -70, function (g) {
    sh(g, 8, -8, 62, 9);
    poly(g, [14, -12, 0, -42, 9, -46, 23, -18]); g.fillStyle = '#2F6FCC'; g.fill(); ol(g, 3);
    poly(g, [-14, -12, 0, -42, 14, -12]); g.fillStyle = '#5AA9FF'; g.fill(); ol(g, 3);
  }, { a: function (c, t) {
    c.save(); c.translate(0, -44); c.rotate(Math.sin(t * 1.8) * 0.2);
    rr(c, -64, -4, 128, 9, 4); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 3);
    [-62, 40].forEach(function (x) { rr(c, x, -9, 22, 7, 3); c.fillStyle = '#FF4F6D'; c.fill(); ol(c, 2.5); });
    c.strokeStyle = NAVY; c.lineWidth = 3; c.beginPath(); c.moveTo(-36, -4); c.lineTo(-36, -18); c.moveTo(-41, -18); c.lineTo(-31, -18); c.moveTo(36, -4); c.lineTo(36, -18); c.moveTo(31, -18); c.lineTo(41, -18); c.stroke();
    c.restore();
  } });
  art('pool', -104, function (g) {
    var i;
    sh(g, 12, -44, 76, 44);
    ell(g, 0, -45, 68, 41); g.fillStyle = '#D9478F'; g.fill(); ol(g, 3.5);
    g.fillStyle = '#D9478F'; g.fillRect(-68, -59, 136, 14);
    ell(g, 0, -59, 68, 41); g.fillStyle = '#FF8FB8'; g.fill(); ol(g, 3.5);
    g.fillStyle = '#fff'; for (i = 0; i < 12; i++) { var a = i * TAU / 12 + 0.2; ell(g, Math.cos(a) * 61, -59 + Math.sin(a) * 36, 3.4, 2.4); g.fill(); }
    ell(g, 0, -59, 53, 30); g.fillStyle = lin(g, 0, -89, 0, -29, '#A8E3FF', '#4FB2EE'); g.fill(); ol(g, 3);
    g.save(); ell(g, 0, -59, 53, 30); g.clip(); g.strokeStyle = 'rgba(27,42,73,0.14)'; g.lineWidth = 10; ell(g, 6, -52, 57, 33); g.stroke(); g.restore();
  }, { flat: true, a: function (c, t) {
    var i, k;
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2;
    for (i = 0; i < 2; i++) { k = (t * 0.4 + i / 2) % 1; c.globalAlpha = 1 - k; ell(c, -14, -62, 8 + k * 26, 3 + k * 12); c.stroke(); }
    c.globalAlpha = 1;
    duck(c, 22 + Math.sin(t * 0.7) * 10, -56 + Math.sin(t * 2.2) * 1.5, Math.cos(t * 0.7) > 0 ? 1 : -1, 1);
  } });
  art('slide', -118, function (g) {
    g.translate(-46, -12); g.scale(0.62, 0.62);
    sh(g, 70, 4, 112, 16);
    g.fillStyle = '#8D949E'; [[-24], [16]].forEach(function (q) { rr(g, q[0], -126, 8, 128, 3); g.fill(); ol(g, 4); });
    g.strokeStyle = NAVY; g.lineWidth = 7; g.beginPath(); [-28, -58, -88].forEach(function (y) { g.moveTo(-18, y); g.lineTo(18, y); }); g.stroke();
    g.strokeStyle = '#C3C9D2'; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.moveTo(24, -112); g.bezierCurveTo(70, -108, 96, -22, 150, -12); g.lineTo(184, -12); g.lineTo(184, 0); g.lineTo(146, 0);
    g.bezierCurveTo(98, -8, 70, -86, 24, -92); g.closePath(); g.fillStyle = '#2F6FCC'; g.fill(); ol(g, 4.5);
    g.beginPath(); g.moveTo(22, -128); g.bezierCurveTo(78, -124, 100, -36, 152, -26); g.lineTo(186, -26); g.lineTo(186, -12); g.lineTo(150, -12);
    g.bezierCurveTo(96, -22, 70, -108, 22, -112); g.closePath(); g.fillStyle = '#5AA9FF'; g.fill(); ol(g, 4.5);
    g.beginPath(); g.moveTo(30, -122); g.bezierCurveTo(78, -116, 100, -34, 150, -21); g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 4; g.stroke();
    rr(g, -32, -136, 62, 16, 5); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 4.5);
    rr(g, -32, -160, 6, 28, 2); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 3.5); rr(g, 24, -160, 6, 28, 2); g.fill(); ol(g, 3.5);
    rr(g, -34, -164, 66, 7, 3); g.fill(); ol(g, 3.5);
  });
  art('trampoline', -106, function (g) {
    var i, a;
    sh(g, 14, -38, 76, 44);
    g.fillStyle = '#8D949E'; [[-58, -40], [52, -40], [-34, -14], [28, -14]].forEach(function (q) { rr(g, q[0], q[1] - 16, 7, 22, 2); g.fill(); ol(g, 2.5); });
    ell(g, 0, -52, 68, 41); g.fillStyle = '#2456B8'; g.fill(); ol(g, 3.5);
    g.fillStyle = '#2456B8'; g.fillRect(-68, -62, 136, 10);
    ell(g, 0, -62, 68, 41); g.fillStyle = lin(g, -68, 0, 68, 0, '#6DB4FF', '#3B82F6'); g.fill(); ol(g, 3.5);
    ell(g, 0, -62, 53, 31); g.fillStyle = '#2B3350'; g.fill(); ol(g, 3);
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2;
    for (i = 0; i < 18; i++) { a = i * TAU / 18; g.beginPath(); g.moveTo(Math.cos(a) * 54, -62 + Math.sin(a) * 31.5); g.lineTo(Math.cos(a) * 60, -62 + Math.sin(a) * 35.5); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.10)'; ell(g, -12, -70, 28, 12); g.fill();
    starPath(g, 0, -62, 12); g.fillStyle = 'rgba(255,214,107,0.9)'; g.fill();
  }, { flat: true });
  art('pond', -112, function (g) {
    var i, a;
    wob(g, 4, -48, 66, 44, 1, 1); g.fillStyle = 'rgba(22,48,66,0.14)'; g.fill();
    wob(g, 0, -52, 66, 44, 1, 1); g.fillStyle = '#B5AE9F'; g.fill(); ol(g, 3.5);
    for (i = 0; i < 14; i++) { a = i * TAU / 14 + 0.2; ell(g, Math.cos(a) * 61, -52 + Math.sin(a) * 40, 7, 4.5); g.fillStyle = i % 2 ? '#DDD6C8' : '#C9C2B4'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = 'rgba(27,42,73,0.4)'; g.stroke(); }
    wob(g, 0, -52, 66, 44, 0.8, 1); g.fillStyle = lin(g, 0, -90, 0, -16, '#9ADCFF', '#3FA0E0'); g.fill(); ol(g, 3);
    g.save(); wob(g, 0, -52, 66, 44, 0.8, 1); g.clip(); g.strokeStyle = 'rgba(27,42,73,0.16)'; g.lineWidth = 10; wob(g, 7, -45, 66, 44, 0.84, 1); g.stroke(); g.restore();
    [[-22, -40, 10], [26, -66, 8], [8, -34, 7]].forEach(function (q, k) {                                    // lily pads
      g.beginPath(); g.ellipse(q[0], q[1], q[2], q[2] * 0.6, 0, 0.5, TAU - 0.2); g.lineTo(q[0], q[1]); g.closePath(); g.fillStyle = '#4FA05A'; g.fill(); g.lineWidth = 1.8; g.strokeStyle = NAVY; g.stroke();
      if (k === 0) bloom(g, q[0] - 1, q[1] - 3, 5, '#FF8FB8', '#FFD66B');
    });
    g.lineCap = 'round';
    [[-50, -70, 26], [-44, -74, 32], [-38, -70, 24]].forEach(function (q) {                                 // reeds
      g.strokeStyle = '#3F9A53'; g.lineWidth = 3; g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] + 2, q[1] - q[2]); g.stroke();
      rr(g, q[0] - 1, q[1] - q[2] - 9, 6, 12, 3); g.fillStyle = '#7A4A2B'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = NAVY; g.stroke();
    });
  }, { a: function (c, t) {
    var a = t * 0.5, k = (t * 0.5) % 1;
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 2; c.globalAlpha = 1 - k; ell(c, 14, -58, 6 + k * 18, 2.5 + k * 8); c.stroke(); c.globalAlpha = 1;
    duck(c, Math.cos(a) * 26, -54 + Math.sin(a) * 13 + Math.sin(t * 3) * 1, -Math.sin(a) > 0 ? 1 : -1, 1.05);
  } });
  art('fountain', -132, function (g) {
    g.translate(0, -34); g.scale(0.66, 0.66);
    ell(g, 16, -4, 112, 40); g.fillStyle = SH; g.fill();
    ell(g, 0, -6, 96, 36); g.fillStyle = '#B5AE9F'; g.fill(); ol(g, 5);
    g.fillStyle = '#B5AE9F'; g.fillRect(-96, -26, 192, 20);
    g.beginPath(); g.moveTo(-96, -26); g.lineTo(-96, -6); g.moveTo(96, -26); g.lineTo(96, -6); ol(g, 5);
    ell(g, 0, -26, 96, 36); g.fillStyle = '#DDD6C8'; g.fill(); ol(g, 5);
    ell(g, 0, -26, 80, 28); g.fillStyle = lin(g, 0, -54, 0, 0, '#9ADCFF', '#4FB2EE'); g.fill(); ol(g, 4);
    rr(g, -11, -92, 22, 68, 7); g.fillStyle = lin(g, -11, 0, 11, 0, '#E6DFD0', '#B5AE9F'); g.fill(); ol(g, 4.5);
    ell(g, 0, -92, 30, 10); g.fillStyle = '#DDD6C8'; g.fill(); ol(g, 4.5);
  }, { a: function (c, t) {
    var i, k;
    c.save(); c.translate(0, -34); c.scale(0.66, 0.66);
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 2.5;
    for (i = 0; i < 3; i++) { k = (t * 0.5 + i / 3) % 1; c.globalAlpha = 1 - k; ell(c, 0, -26, 16 + k * 58, 6 + k * 20); c.stroke(); }
    c.globalAlpha = 1; c.lineCap = 'round';
    for (i = -1; i <= 1; i += 2) {
      c.beginPath(); c.moveTo(0, -96); c.quadraticCurveTo(i * 30, -138 - Math.sin(t * 4) * 5, i * 50, -32);
      c.strokeStyle = '#7CCBFF'; c.lineWidth = 8; c.stroke(); c.strokeStyle = '#E4F6FF'; c.lineWidth = 3.5; c.stroke();
    }
    c.beginPath(); c.moveTo(0, -96); c.lineTo(0, -122 - Math.sin(t * 5) * 4); c.strokeStyle = '#7CCBFF'; c.lineWidth = 7; c.stroke(); c.strokeStyle = '#E4F6FF'; c.lineWidth = 3; c.stroke();
    c.restore();
  } });
  art('treehouse', -200, function (g) {
    var L = [[-50, -132, 34], [50, -130, 34], [0, -166, 40], [-24, -118, 28], [30, -116, 28]], i, y;
    sh(g, 24, -18, 86, 20);
    g.beginPath(); g.moveTo(-22, -18); g.quadraticCurveTo(-12, -60, -18, -104); g.lineTo(18, -104); g.quadraticCurveTo(12, -60, 24, -18); g.closePath();
    g.fillStyle = lin(g, -22, 0, 24, 0, '#B07A45', '#774B27'); g.fill(); ol(g, 3.5);
    blobs(g, L, '#2F8548', 4);
    g.fillStyle = '#45A65D'; for (i = 0; i < L.length; i++) { g.beginPath(); g.arc(L[i][0] - 5, L[i][1] - 6, L[i][2] - 9, 0, TAU); g.fill(); }
    g.fillStyle = '#6CC67F'; [[-56, -144, 12], [-8, -182, 15], [44, -146, 10]].forEach(function (q) { g.beginPath(); g.arc(q[0], q[1], q[2], 0, TAU); g.fill(); });
    box(g, -48, -84, 86, 6, 26, '#A56B38', 3);                                                        // the floor
    box(g, -38, -90, 64, 42, 22, '#E0A868', 3);                                                       // the cabin
    g.strokeStyle = 'rgba(27,42,73,0.16)'; g.lineWidth = 2; for (y = -122; y < -92; y += 10) { g.beginPath(); g.moveTo(-36, y); g.lineTo(24, y); g.stroke(); }
    rr(g, -30, -124, 20, 18, 4); g.fillStyle = '#BFE9FF'; g.fill(); ol(g, 2.5);
    g.strokeStyle = NAVY; g.lineWidth = 2; g.beginPath(); g.moveTo(-20, -124); g.lineTo(-20, -106); g.moveTo(-30, -115); g.lineTo(-10, -115); g.stroke();
    rrTop(g, 0, -118, 18, 28, 8); g.fillStyle = '#8F5A2E'; g.fill(); ol(g, 2.5);
    poly(g, [32, -130, 48, -140, 38, -164, 24, -156]); g.fillStyle = '#A8321A'; g.fill(); ol(g, 3);  // roof
    poly(g, [-46, -130, 32, -130, 24, -156, -38, -156]); g.fillStyle = lin(g, 0, -156, 0, -130, '#F0623C', '#D0461F'); g.fill(); ol(g, 3);
    g.beginPath(); g.moveTo(-34, -18); g.lineTo(-34, -86); g.moveTo(-20, -18); g.lineTo(-20, -86); tube(g, 2.5, '#DDA263');   // ladder
    g.strokeStyle = NAVY; g.lineWidth = 3; g.beginPath(); for (y = -30; y > -84; y -= 13) { g.moveTo(-34, y); g.lineTo(-20, y); } g.stroke();
    g.strokeStyle = NAVY; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-6, -156); g.lineTo(-6, -178); g.stroke();
    poly(g, [-6, -178, 10, -173, -6, -167]); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2);
  });
  function horse(c, x, y, f, col) {
    c.save(); c.translate(x, y); c.scale(f, 1); c.lineCap = 'round';
    c.strokeStyle = NAVY; c.lineWidth = 3.5; c.beginPath(); c.moveTo(-7, 4); c.lineTo(-10, 13); c.moveTo(7, 4); c.lineTo(11, 13); c.stroke();
    c.beginPath(); c.moveTo(-12, -2); c.quadraticCurveTo(-21, 0, -19, 8); c.strokeStyle = '#FFD66B'; c.lineWidth = 3; c.stroke();
    ell(c, 0, 0, 13, 8); c.fillStyle = col; c.fill(); ol(c, 2.5);
    poly(c, [5, -4, 11, -17, 21, -14, 23, -8, 15, -7, 13, 1]); c.fillStyle = col; c.fill(); ol(c, 2.5);
    c.beginPath(); c.moveTo(7, -6); c.lineTo(12, -17); c.strokeStyle = '#FFD66B'; c.lineWidth = 3; c.stroke();
    c.beginPath(); c.arc(17, -12, 1.4, 0, TAU); c.fillStyle = NAVY; c.fill();
    rr(c, -6, -9, 11, 6, 2); c.fillStyle = '#FF4F6D'; c.fill(); ol(c, 1.8);
    c.restore();
  }
  art('carousel', -176, function (g) {
    sh(g, 14, -38, 82, 34);
    ell(g, 0, -34, 66, 30); g.fillStyle = '#B3122F'; g.fill(); ol(g, 3.5);
    g.fillStyle = '#B3122F'; g.fillRect(-66, -46, 132, 12);
    ell(g, 0, -46, 66, 30); g.fillStyle = lin(g, -66, 0, 66, 0, '#FFE27A', '#F2B63C'); g.fill(); ol(g, 3.5);
    g.strokeStyle = 'rgba(160,100,20,0.45)'; g.lineWidth = 3; ell(g, 0, -46, 48, 21); g.stroke();
    ell(g, 0, -120, 62, 17); g.fillStyle = '#7A1026'; g.fill();                                                 // under the roof
    rr(g, -7, -124, 14, 82, 4); g.fillStyle = lin(g, -7, 0, 7, 0, '#FFF0B8', '#E0A21A'); g.fill(); ol(g, 3);
    g.strokeStyle = '#FF4F6D'; g.lineWidth = 3; g.beginPath(); for (var y = -112; y < -50; y += 14) { g.moveTo(-6, y); g.lineTo(6, y + 6); } g.stroke();
  }, { a: function (c, t) {
    var list = [], k, a;
    for (k = 0; k < 4; k++) { a = t * 0.8 + k * TAU / 4; list.push({ x: Math.cos(a) * 46, y: -46 + Math.sin(a) * 19, f: -Math.sin(a) > 0 ? 1 : -1, k: k }); }
    list.sort(function (p, q) { return p.y - q.y; });
    list.forEach(function (h) {
      var bob = Math.sin(t * 3 + h.k * 1.7) * 5;
      c.strokeStyle = NAVY; c.lineWidth = 4; c.beginPath(); c.moveTo(h.x, -118); c.lineTo(h.x, h.y); c.stroke();
      c.strokeStyle = '#FFD66B'; c.lineWidth = 2; c.stroke();
      horse(c, h.x, h.y - 22 + bob, h.f, ['#FFFFFF', '#FFB3D1', '#BFE9FF', '#E2D6FF'][h.k]);
    });
  }, s2: function (g) {
    var i, a, pts = [];
    for (i = 0; i <= 8; i++) { a = Math.PI - i * Math.PI / 8; pts.push([Math.cos(a) * 72, -120 + Math.sin(a) * 22]); }
    function shape() { g.beginPath(); g.moveTo(0, -170); for (var j = 0; j < pts.length; j++) g.lineTo(pts[j][0], pts[j][1]); g.closePath(); }
    for (i = 0; i < 8; i++) { poly(g, [0, -170, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]); g.fillStyle = i % 2 ? '#FFFFFF' : '#FF4F6D'; g.fill(); }
    g.save(); shape(); g.clip(); g.fillStyle = 'rgba(27,42,73,0.12)'; g.fillRect(24, -172, 60, 80); g.fillStyle = 'rgba(255,255,255,0.22)'; poly(g, [0, -170, -64, -112, -40, -104]); g.fill(); g.restore();
    shape(); ol(g, 3.5);
    for (i = 0; i <= 8; i++) { g.beginPath(); g.arc(pts[i][0], pts[i][1] + 2, 5, 0, TAU); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2); }
    g.beginPath(); g.arc(0, -172, 7, 0, TAU); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2.5);
  } });

  // --- decorations ---
  art('fence', -62, function (g) {
    sh(g, 6, -16, 40, 5);
    g.fillStyle = '#E3E7EE'; rr(g, -36, -46, 72, 6, 2); g.fill(); ol(g, 2.5); rr(g, -36, -30, 72, 6, 2); g.fill(); ol(g, 2.5);
    [-31, -13, 5, 23].forEach(function (x) {
      poly(g, [x, -18, x, -52, x + 5, -60, x + 10, -52, x + 10, -18]); g.fillStyle = '#FFFFFF'; g.fill(); ol(g, 2.5);
      g.fillStyle = 'rgba(27,42,73,0.13)'; g.fillRect(x + 7, -51, 2, 32);
    });
  });
  art('flag', -114, function (g) {
    sh(g, 6, -12, 16, 5);
    ell(g, 0, -14, 9, 4); g.fillStyle = '#8D949E'; g.fill(); ol(g, 2.5);
    rr(g, -2.5, -106, 5, 93, 2); g.fillStyle = lin(g, -2.5, 0, 2.5, 0, '#E3E7EE', '#8D949E'); g.fill(); ol(g, 2.5);
    g.beginPath(); g.arc(0, -108, 5, 0, TAU); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2);
  }, { a: function (c, t) {
    var i, u, n = 8, w = 42, h = 26, x0 = 3, y0 = -102;
    function dy(u) { return Math.sin(t * 5 - u * 5) * 4 * u; }
    c.beginPath(); c.moveTo(x0, y0);
    for (i = 1; i <= n; i++) { u = i / n; c.lineTo(x0 + u * w, y0 + dy(u)); }
    for (i = n; i >= 0; i--) { u = i / n; c.lineTo(x0 + u * w, y0 + h + dy(u)); }
    c.closePath(); c.fillStyle = '#FF4F6D'; c.fill(); ol(c, 2.5);
    starPath(c, x0 + w * 0.48, y0 + h / 2 + dy(0.48), 7.5); c.fillStyle = '#FFD66B'; c.fill();
  } });
  art('lamp', -112, function (g) {
    g.translate(0, -12); g.scale(0.74, 0.74);
    sh(g, 6, 2, 20, 6);
    rr(g, -9, -8, 18, 10, 4); g.fillStyle = '#5B6275'; g.fill(); ol(g, 4);
    rr(g, -3.5, -96, 7, 90, 3); g.fillStyle = lin(g, -3.5, 0, 3.5, 0, '#7A8296', '#4A5165'); g.fill(); ol(g, 4);
    rr(g, -12, -122, 24, 28, 7); g.fillStyle = '#FFF0B8'; g.fill(); ol(g, 4);
    poly(g, [-16, -122, 16, -122, 9, -132, -9, -132]); g.fillStyle = '#5B6275'; g.fill(); ol(g, 4);
    g.beginPath(); g.arc(0, -108, 5, 0, TAU); g.fillStyle = '#FFD66B'; g.fill();
  }, { a: function (c, t) { glow(c, 0, -92, 38, 0.7 + 0.3 * Math.sin(t * 3)); } });
  art('balloons', -124, function (g) {
    sh(g, 4, -12, 14, 5);
    rr(g, -8, -24, 16, 13, 4); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2.5);
  }, { a: function (c, t) {
    [['#FF4F6D', -18, 0, 0], ['#5AA9FF', 17, 1.7, 0], ['#7BD389', -1, 3.1, 16]].forEach(function (q) {
      var bx = q[1] + Math.sin(t * 1.5 + q[2]) * 5, by = -88 - q[3] + Math.sin(t * 2 + q[2]) * 2;
      c.strokeStyle = NAVY; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, -22); c.quadraticCurveTo(q[1] * 0.3, -50, bx, by + 17); c.stroke();
      ell(c, bx, by, 13, 17); c.fillStyle = q[0]; c.fill(); ol(c, 2.5);
      ell(c, bx - 4, by - 6, 3.5, 5); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fill();
    });
  } });
  art('flamingo', -98, function (g) {
    sh(g, 6, -12, 20, 6);
    g.beginPath(); g.moveTo(2, -44); g.lineTo(2, -14); g.moveTo(-4, -44); g.lineTo(-7, -30); g.lineTo(3, -26); tube(g, 2, '#FFB3D1');
    g.beginPath(); g.moveTo(8, -56); g.bezierCurveTo(28, -62, 0, -78, 16, -88); tube(g, 6, '#FF8FB8');
    ell(g, -2, -52, 18, 12); g.fillStyle = lin(g, 0, -64, 0, -40, '#FFB3D1', '#FF7FB0'); g.fill(); ol(g, 3);
    g.beginPath(); g.ellipse(-7, -52, 10, 6, 0.3, 0, TAU); g.fillStyle = '#F0669E'; g.fill();
    g.beginPath(); g.arc(18, -89, 7, 0, TAU); g.fillStyle = '#FF8FB8'; g.fill(); ol(g, 2.5);
    poly(g, [23, -91, 34, -86, 24, -82]); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2);
    poly(g, [29, -88.5, 34, -86, 28, -84]); g.fillStyle = NAVY; g.fill();
    g.beginPath(); g.arc(19, -91, 1.6, 0, TAU); g.fillStyle = NAVY; g.fill();
  });
  art('gnome', -74, function (g) {
    sh(g, 6, -10, 22, 6);
    ell(g, -8, -13, 8, 4.5); g.fillStyle = '#5A3A22'; g.fill(); ol(g, 2.5); ell(g, 8, -13, 8, 4.5); g.fill(); ol(g, 2.5);
    rr(g, -15, -42, 30, 29, 9); g.fillStyle = lin(g, -15, 0, 15, 0, '#6DB4FF', '#2F6FCC'); g.fill(); ol(g, 3);
    rr(g, -15, -25, 30, 5, 2); g.fillStyle = NAVY; g.fill(); rr(g, -4, -27, 8, 8, 2); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 1.5);
    g.beginPath(); g.arc(0, -46, 11, 0, TAU); g.fillStyle = '#FFD9B8'; g.fill(); ol(g, 2.5);
    g.beginPath(); g.moveTo(-12, -45); g.quadraticCurveTo(-14, -27, 0, -21); g.quadraticCurveTo(14, -27, 12, -45); g.quadraticCurveTo(0, -37, -12, -45); g.closePath(); g.fillStyle = '#fff'; g.fill(); ol(g, 2.5);
    g.beginPath(); g.arc(0, -44, 3.6, 0, TAU); g.fillStyle = '#FFB38A'; g.fill(); ol(g, 1.5);
    g.fillStyle = NAVY; g.beginPath(); g.arc(-5, -49, 1.7, 0, TAU); g.arc(5, -49, 1.7, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(-15, -51); g.quadraticCurveTo(-5, -60, 4, -74); g.quadraticCurveTo(10, -62, 15, -51); g.quadraticCurveTo(0, -57, -15, -51); g.closePath(); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 2.5);
  });
  art('lantern', -112, function (g) {
    sh(g, 6, -12, 20, 5);
    rr(g, -9, -20, 18, 8, 3); g.fillStyle = '#8F5A2E'; g.fill(); ol(g, 2.5);
    rr(g, -3.5, -106, 7, 90, 3); g.fillStyle = lin(g, -3.5, 0, 3.5, 0, '#C98A4B', '#8F5A2E'); g.fill(); ol(g, 2.5);
    rr(g, -31, -106, 62, 6, 3); g.fillStyle = '#B77B45'; g.fill(); ol(g, 2.5);
    [-23, 23].forEach(function (x) {
      g.strokeStyle = NAVY; g.lineWidth = 2; g.beginPath(); g.moveTo(x, -100); g.lineTo(x, -92); g.moveTo(x, -62); g.lineTo(x, -52); g.stroke();
      ell(g, x, -77, 12, 14); g.fillStyle = rad(g, x - 4, -82, 18, '#FF7A7A', '#D92E2E'); g.fill(); ol(g, 2.5);
      g.strokeStyle = 'rgba(120,10,10,0.4)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(x, -77, 5, 14, 0, 0, TAU); g.stroke();
      g.fillStyle = '#FFD66B'; rr(g, x - 7, -93, 14, 4, 2); g.fill(); ol(g, 1.8); rr(g, x - 7, -65, 14, 4, 2); g.fill(); ol(g, 1.8);
      rr(g, x - 2, -54, 4, 8, 2); g.fillStyle = '#FFD66B'; g.fill();
    });
  }, { a: function (c, t) { glow(c, -23, -77, 26, 0.55 + 0.25 * Math.sin(t * 2.6)); glow(c, 23, -77, 26, 0.55 + 0.25 * Math.sin(t * 2.6 + 1.5)); } });
  art('birdbath', -76, function (g) {
    sh(g, 8, -10, 28, 7);
    ell(g, 0, -14, 16, 6); g.fillStyle = '#B5AE9F'; g.fill(); ol(g, 2.5);
    rr(g, -6, -46, 12, 32, 4); g.fillStyle = lin(g, -6, 0, 6, 0, '#E6DFD0', '#A9A294'); g.fill(); ol(g, 2.5);
    g.beginPath(); g.moveTo(-27, -52); g.quadraticCurveTo(-20, -38, 0, -38); g.quadraticCurveTo(20, -38, 27, -52); g.closePath(); g.fillStyle = '#B5AE9F'; g.fill(); ol(g, 3);
    ell(g, 0, -52, 27, 8); g.fillStyle = '#E6DFD0'; g.fill(); ol(g, 3);
    ell(g, 0, -52, 21, 5.5); g.fillStyle = '#7CCBFF'; g.fill(); ol(g, 2);
  }, { a: function (c, t) {
    var hop = (t % 3) < 0.6 ? Math.abs(Math.sin(t * 10)) * 4 : 0, x = 17, y = -60 - hop;
    ell(c, x, y, 8, 6); c.fillStyle = '#5AA9FF'; c.fill(); ol(c, 2);
    c.beginPath(); c.arc(x - 6, y - 6, 4.5, 0, TAU); c.fillStyle = '#5AA9FF'; c.fill(); ol(c, 2);
    poly(c, [x - 10, y - 7, x - 16, y - 5, x - 10, y - 4]); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 1.4);
    poly(c, [x + 6, y - 2, x + 15, y - 6, x + 8, y + 2]); c.fillStyle = '#2F6FCC'; c.fill(); ol(c, 1.6);
    c.beginPath(); c.arc(x - 7, y - 7, 1.1, 0, TAU); c.fillStyle = NAVY; c.fill();
  } });
  art('snowman', -102, function (g) {
    function ball(y, r) { g.beginPath(); g.arc(0, y, r, 0, TAU); g.fillStyle = rad(g, -r * 0.35, y - r * 0.4, r * 1.6, '#FFFFFF', '#C6DAF0'); g.fill(); ol(g, 3); }
    sh(g, 8, -10, 30, 8);
    g.beginPath(); g.moveTo(-14, -50); g.lineTo(-32, -62); g.moveTo(14, -50); g.lineTo(32, -62); tube(g, 2.5, '#8F5A2E');
    ball(-30, 20); ball(-54, 15); ball(-74, 11);
    rr(g, -12, -68, 24, 6, 3); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 2); rr(g, 5, -66, 7, 15, 3); g.fill(); ol(g, 2);
    g.fillStyle = NAVY; [[0, -50], [0, -58], [0, -34], [-4, -77], [4, -77]].forEach(function (q) { g.beginPath(); g.arc(q[0], q[1], 1.9, 0, TAU); g.fill(); });
    poly(g, [0, -75, 13, -72, 0, -70]); g.fillStyle = '#FF7A45'; g.fill(); ol(g, 1.8);
    rr(g, -12, -87, 24, 5, 2); g.fillStyle = NAVY; g.fill(); rr(g, -8, -100, 16, 14, 2); g.fill();
    g.fillStyle = '#FF4F6D'; g.fillRect(-8, -91, 16, 3.5);
  });
  art('arch', -128, function (g) {
    var i, u, v, x, y, cols = ['#FF8FB8', '#FFFFFF', '#FFD66B'];
    sh(g, -50, -6, 14, 5); sh(g, 62, -6, 14, 5);
    g.beginPath(); g.moveTo(-56, -8); g.lineTo(-56, -70); g.bezierCurveTo(-56, -136, 56, -136, 56, -70); g.lineTo(56, -8); tube(g, 10, '#4FA05A');
    g.beginPath(); g.moveTo(-58, -12); g.lineTo(-58, -70); g.bezierCurveTo(-58, -134, 52, -136, 53, -76); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 3; g.stroke();
    for (i = 0; i <= 10; i++) {
      u = i / 10; v = 1 - u;
      x = v * v * v * -56 + 3 * v * v * u * -56 + 3 * v * u * u * 56 + u * u * u * 56; y = v * v * v * -70 + 3 * v * v * u * -136 + 3 * v * u * u * -136 + u * u * u * -70;
      ell(g, x + (i % 2 ? 7 : -7), y + 4, 6, 3.5); g.fillStyle = '#6CC67F'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = NAVY; g.stroke();
      bloom(g, x, y, 7, cols[i % 3], i % 3 === 2 ? '#FF7A45' : '#FFD66B');
    }
    [-56, 56].forEach(function (px, k) { bloom(g, px, -44, 6.5, cols[k], '#FFD66B'); bloom(g, px, -22, 6.5, cols[k + 1], '#FFD66B'); });
  });
  art('windmill', -132, function (g) {
    sh(g, 12, -10, 36, 9);
    poly(g, [19, -14, 30, -22, 22, -86, 13, -82]); g.fillStyle = '#D9C9A8'; g.fill(); ol(g, 3);
    poly(g, [-23, -14, 19, -14, 13, -82, -17, -82]); g.fillStyle = lin(g, -23, 0, 19, 0, '#FFF8E6', '#F0E2C0'); g.fill(); ol(g, 3);
    rrTop(g, -9, -36, 15, 22, 7); g.fillStyle = '#8F5A2E'; g.fill(); ol(g, 2.5);
    g.beginPath(); g.arc(-2, -58, 6, 0, TAU); g.fillStyle = '#8ED2F4'; g.fill(); ol(g, 2.5);
    g.beginPath(); g.moveTo(-20, -81); g.quadraticCurveTo(0, -116, 24, -85); g.closePath(); g.fillStyle = '#D0461F'; g.fill(); ol(g, 3);
  }, { a: function (c, t) {
    c.save(); c.translate(-1, -88); c.rotate(t * 1.1);
    for (var i = 0; i < 4; i++) {
      c.rotate(TAU / 4);
      rr(c, 1.5, -42, 13, 30, 2); c.fillStyle = '#FFF8E6'; c.fill(); ol(c, 2);
      c.strokeStyle = 'rgba(27,42,73,0.3)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(2, -32); c.lineTo(14, -32); c.moveTo(2, -22); c.lineTo(14, -22); c.stroke();
      rr(c, -2, -43, 4, 43, 2); c.fillStyle = '#8F5A2E'; c.fill(); ol(c, 1.8);
    }
    c.restore();
    c.beginPath(); c.arc(-1, -88, 5, 0, TAU); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 2);
  } });
  art('well', -108, function (g) {
    var i;
    sh(g, 12, -12, 36, 10);
    ell(g, 0, -16, 26, 10); g.fillStyle = '#A9A294'; g.fill(); ol(g, 3);
    g.fillStyle = lin(g, -26, 0, 26, 0, '#DDD6C8', '#9F988A'); g.fillRect(-26, -40, 52, 24);
    g.beginPath(); g.moveTo(-26, -40); g.lineTo(-26, -16); g.moveTo(26, -40); g.lineTo(26, -16); ol(g, 3);
    g.strokeStyle = 'rgba(27,42,73,0.25)'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(-25, -27); g.quadraticCurveTo(0, -19, 25, -27);
    for (i = -16; i <= 16; i += 16) { g.moveTo(i, -31); g.lineTo(i, -22); g.moveTo(i + 8, -20); g.lineTo(i + 8, -10); } g.stroke();
    ell(g, 0, -40, 26, 10); g.fillStyle = '#EDE6D8'; g.fill(); ol(g, 3);
    ell(g, 0, -40, 19, 6.5); g.fillStyle = '#27507F'; g.fill(); ol(g, 2.5);
    [-25, 19].forEach(function (x) { rr(g, x, -88, 6, 48, 2); g.fillStyle = lin(g, x, 0, x + 6, 0, '#C98A4B', '#8F5A2E'); g.fill(); ol(g, 2.5); });
    rr(g, -22, -74, 44, 4, 2); g.fillStyle = '#8F5A2E'; g.fill(); ol(g, 2);
    g.strokeStyle = NAVY; g.lineWidth = 1.8; g.beginPath(); g.moveTo(0, -70); g.lineTo(0, -56); g.stroke();
    poly(g, [-6, -57, 6, -57, 5, -47, -5, -47]); g.fillStyle = '#A9AFB8'; g.fill(); ol(g, 2);
    poly(g, [33, -84, 42, -90, 31, -108, 23, -104]); g.fillStyle = '#A8321A'; g.fill(); ol(g, 3);
    poly(g, [-33, -84, 33, -84, 23, -104, -23, -104]); g.fillStyle = lin(g, 0, -104, 0, -84, '#F0623C', '#D0461F'); g.fill(); ol(g, 3);
  });
  art('rocket', -114, function (g) {
    function body() { g.beginPath(); g.moveTo(-14, -20); g.lineTo(-14, -72); g.quadraticCurveTo(-13, -98, 0, -110); g.quadraticCurveTo(13, -98, 14, -72); g.lineTo(14, -20); g.closePath(); }
    sh(g, 8, -10, 28, 7);
    poly(g, [-12, -40, -28, -14, -10, -20]); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 2.5);
    poly(g, [12, -40, 28, -14, 10, -20]); g.fillStyle = '#C9304E'; g.fill(); ol(g, 2.5);
    rr(g, -8, -22, 16, 8, 3); g.fillStyle = '#5B6275'; g.fill(); ol(g, 2.5);
    body(); g.fillStyle = lin(g, -14, 0, 14, 0, '#FFFFFF', '#C3CEDD'); g.fill();
    g.save(); body(); g.clip(); g.fillStyle = '#FF4F6D'; g.fillRect(-16, -112, 32, 28); g.fillStyle = '#5AA9FF'; g.fillRect(-16, -36, 32, 6); g.restore();
    body(); ol(g, 3);
    g.beginPath(); g.arc(0, -64, 8, 0, TAU); g.fillStyle = '#8ED2F4'; g.fill(); ol(g, 2.5);
    g.beginPath(); g.arc(-2.5, -66.5, 2.6, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill();
    poly(g, [-4, -34, 0, -12, 4, -34]); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 2.2);
  }, { a: function (c, t) { twinkles(c, t, [[-22, -84], [20, -100], [24, -56]]); } });
  art('statue', -112, function (g) {
    sh(g, 12, -10, 34, 9);
    box(g, -20, -12, 34, 20, 16, '#CFC8BA', 3);
    rr(g, -1, -56, 8, 24, 3); g.fillStyle = lin(g, -1, 0, 7, 0, '#FFE27A', '#E0A21A'); g.fill(); ol(g, 2.5);
    starPath(g, 7, -76, 27); g.fillStyle = '#C9891A'; g.fill(); ol(g, 3);
    starPath(g, 3, -79, 27); g.fillStyle = '#FFC933'; g.fill(); ol(g, 3);
    starPath(g, 1, -82, 14); g.fillStyle = '#FFE27A'; g.fill();
    ell(g, -7, -89, 5, 2.8); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill();
  }, { a: function (c, t) { twinkles(c, t, [[-26, -96], [32, -92], [4, -112]]); } });
  art('dino', -96, function (g) {
    var G1 = '#5CC76B', G2 = '#3E9E50';
    sh(g, 6, -10, 38, 9);
    g.beginPath(); g.moveTo(-8, -40); g.quadraticCurveTo(-38, -34, -44, -14); g.quadraticCurveTo(-24, -16, -4, -18); g.closePath(); g.fillStyle = G1; g.fill(); ol(g, 3);   // tail
    [[-16, -58], [-21, -46], [-25, -34]].forEach(function (q) { poly(g, [q[0] + 5, q[1] - 5, q[0] - 6, q[1] - 2, q[0] + 2, q[1] + 6]); g.fillStyle = '#FF9F43'; g.fill(); ol(g, 2.2); });   // spikes
    rr(g, -13, -27, 12, 17, 5); g.fillStyle = G2; g.fill(); ol(g, 3); rr(g, 4, -27, 12, 17, 5); g.fill(); ol(g, 3);
    rr(g, -6, -90, 38, 34, 13); g.fillStyle = G1; g.fill(); ol(g, 3);                                     // head
    g.beginPath(); g.ellipse(0, -40, 19, 24, 0.12, 0, TAU); g.fillStyle = G1; g.fill(); ol(g, 3);         // body
    g.fillStyle = G1; g.fillRect(-2, -66, 16, 10);
    g.beginPath(); g.ellipse(6, -37, 10, 15, 0.12, 0, TAU); g.fillStyle = '#D8F5B0'; g.fill();
    rr(g, 12, -50, 13, 6, 3); g.fillStyle = G2; g.fill(); ol(g, 2.2);
    g.beginPath(); g.arc(11, -78, 6, 0, TAU); g.fillStyle = '#fff'; g.fill(); ol(g, 2);
    g.beginPath(); g.arc(12.5, -77.5, 2.6, 0, TAU); g.fillStyle = NAVY; g.fill();
    g.beginPath(); g.arc(27, -80, 1.4, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(8, -66); g.quadraticCurveTo(20, -60, 30, -68); g.lineWidth = 2.5; g.strokeStyle = NAVY; g.stroke();
    poly(g, [16, -64.5, 19, -59.5, 22, -64]); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 1.3; g.stroke();
    [[2, -89], [11, -91]].forEach(function (q) { poly(g, [q[0], q[1] + 1, q[0] + 4, q[1] - 8, q[0] + 8, q[1] + 1]); g.fillStyle = '#FF9F43'; g.fill(); ol(g, 2); });
  });
  art('rainbow', -96, function (g) {
    var cols = ['#FF4F6D', '#FF9F43', '#FFD66B', '#4FA05A', '#5AA9FF', '#9B6BFF'], i;
    function cloud(x) { var L = [[x - 13, -14, 10], [x, -20, 13], [x + 13, -14, 10]]; blobs(g, L, '#FFFFFF', 3); g.fillStyle = 'rgba(90,169,255,0.18)'; ell(g, x + 3, -10, 18, 5); g.fill(); }
    sh(g, -50, -6, 22, 5); sh(g, 62, -6, 22, 5);
    g.lineCap = 'butt';
    g.beginPath(); g.arc(0, -14, 53, Math.PI, 0); g.strokeStyle = NAVY; g.lineWidth = 48; g.stroke();
    for (i = 0; i < 6; i++) { g.beginPath(); g.arc(0, -14, 70.5 - i * 7, Math.PI, 0); g.strokeStyle = cols[i]; g.lineWidth = 7.5; g.stroke(); }
    g.beginPath(); g.arc(0, -14, 72, Math.PI * 1.1, Math.PI * 1.6); g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2.5; g.stroke();
    g.lineCap = 'round';
    cloud(-53); cloud(53);
  }, { a: function (c, t) { twinkles(c, t, [[-40, -74], [0, -96], [42, -70], [-66, -40]]); } });

  // --- ground tiles: they fill their tile, with a low front edge ---
  function tileArt(kind) {
    return function (g) {
      var i, x, y;
      g.translate(-TW / 2, -TH);
      function base(col, edge) { g.fillStyle = edge; g.fillRect(0, 0, TW, TH); g.fillStyle = col; g.fillRect(0, 0, TW, TH - 5); }
      if (kind === 'path' || kind === 'sand') {
        base(kind === 'sand' ? '#F6E2A8' : '#EBD9A4', kind === 'sand' ? '#D2B66C' : '#B99F5F');
        for (i = 0; i < (kind === 'sand' ? 16 : 9); i++) {
          x = 6 + rnd(i + 3) * 60; y = 5 + rnd(i + 30) * 36;
          ell(g, x, y, kind === 'sand' ? 1.5 + rnd(i) * 2 : 5 + rnd(i) * 6, kind === 'sand' ? 1.2 : 3 + rnd(i + 8) * 3);
          g.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.5)' : 'rgba(150,118,62,0.22)'; g.fill();
        }
      } else if (kind === 'patio') {
        base('#DCD7CB', '#A9A294');
        g.strokeStyle = '#B5AE9F'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(TW / 2, 0); g.lineTo(TW / 2, TH - 5); g.moveTo(0, (TH - 5) / 2); g.lineTo(TW, (TH - 5) / 2); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(3, 3, TW / 2 - 6, 4); g.fillRect(TW / 2 + 3, (TH - 5) / 2 + 3, TW / 2 - 6, 4);
      } else if (kind === 'wood') {
        base('#DDA263', '#8F5A2E');
        g.strokeStyle = '#A56B38'; g.lineWidth = 2;
        g.beginPath(); for (y = 15.6; y < TH - 6; y += 15.6) { g.moveTo(0, y); g.lineTo(TW, y); } g.moveTo(26, 0); g.lineTo(26, 15.6); g.moveTo(50, 15.6); g.lineTo(50, 31.2); g.moveTo(18, 31.2); g.lineTo(18, TH - 5); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(0, 1, TW, 3); g.fillRect(0, 17, TW, 3); g.fillRect(0, 32.6, TW, 3);
      } else if (kind === 'meadow') {
        g.fillStyle = '#93E09C'; g.fillRect(0, 0, TW, TH);
        g.strokeStyle = '#5DBB72'; g.lineWidth = 2; g.lineCap = 'round';
        for (i = 0; i < 6; i++) { x = 6 + rnd(i + 60) * 60; y = 10 + rnd(i + 70) * 38; g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x - 2, y - 6); g.moveTo(x + 2, y); g.lineTo(x + 2, y - 7); g.stroke(); }
        for (i = 0; i < 7; i++) { g.beginPath(); g.arc(8 + rnd(i + 80) * 56, 7 + rnd(i + 90) * 38, 3.3, 0, TAU); g.fillStyle = ['#FF8FB8', '#FFFFFF', '#FFD66B', '#B79CFF'][i % 4]; g.fill(); g.lineWidth = 1.3; g.strokeStyle = NAVY; g.stroke(); }
        return;
      } else if (kind === 'check') {
        base('#FFFFFF', '#2F6FCC');
        g.fillStyle = '#6DB4FF'; g.fillRect(0, 0, TW / 2, (TH - 5) / 2); g.fillRect(TW / 2, (TH - 5) / 2, TW / 2, (TH - 5) / 2);
        g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, 0, TW, 3);
      } else {   // rainbow path
        base('#FFFFFF', '#7A5BD0');
        ['#FF9AAE', '#FFC48A', '#FFE9A0', '#A8E6B0', '#A8D4FF', '#CDB8FF'].forEach(function (col, n) { g.fillStyle = col; g.fillRect(0, n * (TH - 5) / 6, TW, (TH - 5) / 6 + 0.5); });
        g.fillStyle = 'rgba(255,255,255,0.9)'; [[14, 10], [50, 22], [28, 36], [62, 40]].forEach(function (q) { poly(g, [q[0], q[1] - 4, q[0] + 1.3, q[1] - 1.3, q[0] + 4, q[1], q[0] + 1.3, q[1] + 1.3, q[0], q[1] + 4, q[0] - 1.3, q[1] + 1.3, q[0] - 4, q[1], q[0] - 1.3, q[1] - 1.3]); g.fill(); });
      }
      g.strokeStyle = 'rgba(27,42,73,0.28)'; g.lineWidth = 1.5; g.strokeRect(0.75, 0.75, TW - 1.5, TH - 1.5);
    };
  }
  ['path', 'sand', 'patio', 'wood', 'meadow', 'check', 'rainbowpath'].forEach(function (k) { art(k, -TH, tileArt(k), { tile: true }); });
  // something the server sells that this page does not know yet: a gift box
  art('_', -58, function (g) {
    sh(g, 8, -10, 28, 7);
    box(g, -20, -12, 36, 30, 14, '#FF8FB8', 3);
    g.fillStyle = '#FFD66B'; g.fillRect(-6, -42, 8, 30); g.beginPath(); g.arc(-8, -46, 6, 0, TAU); g.arc(4, -46, 6, 0, TAU); g.fill(); ol(g, 2);
  });

  // ---------- the houses: (0, 0) is the middle of the front edge of the house tiles; the door is at DOORX ----------
  function groundShadow(g, x0, w, base) {
    poly(g, [x0 + w - 2, base + 6, x0 + w + 62, base + 6, x0 + w + DX + 62, base - DY, x0 + w + DX - 2, base - DY - 20]); g.fillStyle = SH; g.fill();
    rr(g, x0 - 8, base - 6, w + 18, 16, 8); g.fillStyle = 'rgba(22,48,66,0.16)'; g.fill();
  }
  function win(g, x, y, w, h) {
    rr(g, x, y, w, h, 7); g.fillStyle = '#fff'; g.fill(); ol(g, 3);
    rr(g, x + 5, y + 5, w - 10, h - 10, 4); g.fillStyle = lin(g, 0, y, 0, y + h, '#D4F2FF', '#8ED2F4'); g.fill(); ol(g, 2);
    g.save(); rr(g, x + 5, y + 5, w - 10, h - 10, 4); g.clip(); g.fillStyle = 'rgba(255,255,255,0.6)'; poly(g, [x + 9, y + h - 5, x + 20, y + 5, x + 27, y + 5, x + 16, y + h - 5]); g.fill(); g.restore();
    g.strokeStyle = '#fff'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(x + w / 2, y + 5); g.lineTo(x + w / 2, y + h - 5); g.moveTo(x + 5, y + h / 2); g.lineTo(x + w - 5, y + h / 2); g.stroke();
  }
  function flowerBox(g, x, y, w) {
    rr(g, x - 3, y, w + 6, 11, 5); g.fillStyle = '#9A6236'; g.fill(); ol(g, 2.5);
    for (var k = 0; k < 4; k++) {
      var fx = x + 4 + k * (w - 8) / 3;
      g.beginPath(); g.arc(fx, y, 5.5, 0, TAU); g.fillStyle = '#4FA05A'; g.fill();
      g.beginPath(); g.arc(fx, y - 4, 3.6, 0, TAU); g.fillStyle = k % 2 ? '#FFD66B' : '#FF8FB8'; g.fill(); g.lineWidth = 1.3; g.strokeStyle = NAVY; g.stroke();
    }
  }
  function doorArt(g, x, base, w, h, col, arch) {
    rrTop(g, x - w / 2 - 5, base - h - 5, w + 10, h + 5, arch + 5); g.fillStyle = '#fff'; g.fill(); ol(g, 3.5);
    rrTop(g, x - w / 2, base - h, w, h, arch); g.fillStyle = lin(g, x - w / 2, 0, x + w / 2, 0, shade(col, 0.16), shade(col, -0.16)); g.fill(); ol(g, 3);
    g.strokeStyle = 'rgba(27,42,73,0.18)'; g.lineWidth = 2;
    for (var q = x - w / 2 + 11; q < x + w / 2 - 4; q += 11) { g.beginPath(); g.moveTo(q, base - h + Math.max(8, arch)); g.lineTo(q, base - 3); g.stroke(); }
    g.beginPath(); g.arc(x, base - h + Math.max(22, arch + 6), 8, 0, TAU); g.fillStyle = '#BFE9FF'; g.fill(); ol(g, 2.5);
    g.beginPath(); g.arc(x + w / 2 - 9, base - h / 2 + 6, 3.6, 0, TAU); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 1.8);
  }
  function doorStep(g, x, base) {
    rr(g, x - 34, base + 5, 68, 7, 3); g.fillStyle = '#ADA696'; g.fill(); ol(g, 2.5);
    poly(g, [x - 28, base - 3, x + 28, base - 3, x + 34, base + 7, x - 34, base + 7]); g.fillStyle = '#E6DFD0'; g.fill(); ol(g, 3);
  }
  function chimney(g, qx, top, h) {
    poly(g, [qx + 22, top, qx + 30, top - 5, qx + 30, top + h - 8, qx + 22, top + h]); g.fillStyle = '#B9A58A'; g.fill(); ol(g, 3);
    g.beginPath(); g.rect(qx, top, 22, h); g.fillStyle = '#EADBC2'; g.fill(); ol(g, 3);
    g.strokeStyle = 'rgba(27,42,73,0.16)'; g.lineWidth = 2; for (var y = top + 10; y < top + h - 2; y += 10) { g.beginPath(); g.moveTo(qx + 2, y); g.lineTo(qx + 20, y); g.stroke(); }
    poly(g, [qx - 3, top - 2, qx + 25, top - 2, qx + 34, top - 8, qx + 6, top - 8]); g.fillStyle = '#F6EBD6'; g.fill(); ol(g, 3);
    rr(g, qx - 3, top - 2, 28, 8, 2); g.fillStyle = '#D8C7AA'; g.fill(); ol(g, 3);
  }
  var HOUSES = [
    // 0: cottage
    function (g, wall, roof, door) {
      var x0 = -120, w = 240, base = -8, wt = -98, eY = wt + 6, ov = 16, rY = -170, inset = 46, i, x, y;
      var eFL = [x0 - ov, eY], eFR = [x0 + w + ov, eY], eBR = [x0 + w + ov + DX, eY - DY], rL = [x0 - ov + inset + DX / 2, rY], rR = [x0 + w + ov - inset + DX / 2, rY];
      groundShadow(g, x0, w, base);
      poly(g, [x0 + w, base, x0 + w + DX, base - DY, x0 + w + DX, wt - DY, x0 + w, wt]); g.fillStyle = shade(wall, -0.22); g.fill(); ol(g, 3.5);
      rr(g, x0, wt - 4, w, base - wt + 4, 8); g.fillStyle = lin(g, 0, wt, 0, base, shade(wall, 0.14), shade(wall, -0.07)); g.fill(); ol(g, 3.5);
      g.strokeStyle = 'rgba(27,42,73,0.08)'; g.lineWidth = 2; for (y = wt + 30; y < base - 18; y += 18) { g.beginPath(); g.moveTo(x0 + 6, y); g.lineTo(x0 + w - 6, y); g.stroke(); }
      g.fillStyle = lin(g, 0, eY, 0, eY + 28, 'rgba(27,42,73,0.24)', 'rgba(27,42,73,0)'); g.fillRect(x0 + 2, eY, w - 4, 28);
      rr(g, x0 - 3, base - 13, w + 6, 13, 6); g.fillStyle = '#CFC8BA'; g.fill(); ol(g, 3);
      [x0 + 14, x0 + 132, x0 + 186].forEach(function (wx) { win(g, wx, wt + 28, 40, 40); flowerBox(g, wx, wt + 66, 40); });
      doorArt(g, DOORX, base, 44, 62, door, 14); doorStep(g, DOORX, base);
      poly(g, eFR.concat(eBR, rR)); g.fillStyle = shade(roof, -0.26); g.fill(); ol(g, 3.5);
      var slope = eFL.concat(eFR, rR, rL);
      poly(g, slope); g.fillStyle = lin(g, 0, rY, 0, eY, shade(roof, 0.18), roof); g.fill();
      g.save(); poly(g, slope); g.clip();
      g.strokeStyle = shade(roof, -0.2); g.lineWidth = 2.2;
      for (y = eY - 13, i = 0; y > rY + 5; y -= 15, i++) { g.beginPath(); for (x = x0 - ov - 30 + (i % 2) * 11; x < x0 + w + ov + 30; x += 22) { g.moveTo(x, y); g.quadraticCurveTo(x + 11, y + 8, x + 22, y); } g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,0.13)'; poly(g, [x0 - ov, eY, rL[0], rY, rL[0] + 64, rY, x0 - ov + 46, eY]); g.fill();
      g.restore();
      poly(g, slope); ol(g, 3.5);
      poly(g, [eFL[0], eFL[1], eFR[0], eFR[1], eFR[0], eFR[1] + 9, eFL[0], eFL[1] + 9]); g.fillStyle = shade(roof, -0.36); g.fill(); ol(g, 3);
      poly(g, [eFR[0], eFR[1], eBR[0], eBR[1], eBR[0], eBR[1] + 9, eFR[0], eFR[1] + 9]); g.fillStyle = shade(roof, -0.5); g.fill(); ol(g, 3);
      g.beginPath(); g.moveTo(rL[0], rL[1]); g.lineTo(rR[0], rR[1]); g.strokeStyle = NAVY; g.lineWidth = 9; g.stroke(); g.strokeStyle = shade(roof, 0.34); g.lineWidth = 3.6; g.stroke();
      chimney(g, 62, -186, 40);
    },
    // 1: log cabin with a gable
    function (g, wall, roof, door) {
      var x0 = -120, w = 240, base = -8, wt = -90, y, x, eL = [x0 - 14, wt + 6], eR = [x0 + w + 14, wt + 6], ax = 0, ay = -176;
      groundShadow(g, x0, w, base);
      poly(g, [x0 + w, base, x0 + w + DX, base - DY, x0 + w + DX, wt - DY, x0 + w, wt]); g.fillStyle = shade(wall, -0.3); g.fill(); ol(g, 3.5);
      rr(g, x0, wt, w, base - wt, 8); g.fillStyle = wall; g.fill();
      g.save(); rr(g, x0, wt, w, base - wt, 8); g.clip();
      for (y = wt; y < base; y += 14) { g.fillStyle = lin(g, 0, y, 0, y + 14, shade(wall, 0.18), shade(wall, -0.2)); g.fillRect(x0, y, w, 14); g.fillStyle = 'rgba(27,42,73,0.35)'; g.fillRect(x0, y + 12.6, w, 1.6); }
      g.restore(); rr(g, x0, wt, w, base - wt, 8); ol(g, 3.5);
      for (y = wt + 7; y < base - 2; y += 14) [x0 + 6, x0 + w - 6].forEach(function (cx) { g.beginPath(); g.arc(cx, y, 5.5, 0, TAU); g.fillStyle = shade(wall, 0.32); g.fill(); g.lineWidth = 2; g.strokeStyle = NAVY; g.stroke(); });
      [x0 + 20, x0 + 150].forEach(function (wx) {
        [wx - 9, wx + 40].forEach(function (sx) { rr(g, sx, wt + 20, 9, 40, 2); g.fillStyle = roof; g.fill(); ol(g, 2.5); });
        win(g, wx, wt + 20, 40, 40);
      });
      doorArt(g, DOORX, base, 44, 60, door, 5); doorStep(g, DOORX, base);
      poly(g, [ax, ay, eR[0], eR[1], eR[0] + DX, eR[1] - DY, ax + DX, ay - DY]); g.fillStyle = shade(roof, -0.28); g.fill(); ol(g, 3.5);    // the far side of the roof
      chimney(g, 74, -172, 46);
      poly(g, [x0 - 2, wt + 4, ax, ay + 8, x0 + w + 2, wt + 4]); g.fillStyle = shade(wall, 0.12); g.fill();
      g.save(); poly(g, [x0 - 2, wt + 4, ax, ay + 8, x0 + w + 2, wt + 4]); g.clip();
      g.strokeStyle = 'rgba(27,42,73,0.16)'; g.lineWidth = 2; for (x = x0 + 10; x < x0 + w; x += 16) { g.beginPath(); g.moveTo(x, wt + 4); g.lineTo(x, ay); g.stroke(); }
      g.restore();
      poly(g, [x0 - 2, wt + 4, ax, ay + 8, x0 + w + 2, wt + 4]); ol(g, 3.5);
      g.beginPath(); g.moveTo(eL[0], eL[1]); g.lineTo(ax, ay); g.lineTo(eR[0], eR[1]); tube(g, 9, roof);
      g.beginPath(); g.moveTo(eL[0] + 4, eL[1] - 3); g.lineTo(ax, ay - 3); g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 2.5; g.stroke();
      g.beginPath(); g.arc(0, -124, 13, 0, TAU); g.fillStyle = '#fff'; g.fill(); ol(g, 3);
      g.beginPath(); g.arc(0, -124, 8.5, 0, TAU); g.fillStyle = '#8ED2F4'; g.fill(); ol(g, 2);
      g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-8, -124); g.lineTo(8, -124); g.moveTo(0, -132); g.lineTo(0, -116); g.stroke();
    },
    // 2: mushroom house
    function (g, wall, roof, door) {
      var base = -8;
      function cap() { g.beginPath(); g.moveTo(-134, -100); g.bezierCurveTo(-132, -178, -62, -204, 0, -204); g.bezierCurveTo(62, -204, 132, -178, 134, -100); g.quadraticCurveTo(0, -76, -134, -100); g.closePath(); }
      ell(g, 22, -8, 112, 20); g.fillStyle = SH; g.fill();
      g.beginPath(); g.moveTo(-80, base); g.quadraticCurveTo(-92, -60, -66, -106); g.lineTo(66, -106); g.quadraticCurveTo(92, -60, 80, base); g.quadraticCurveTo(0, base + 9, -80, base); g.closePath();
      g.fillStyle = lin(g, -84, 0, 86, 0, shade(wall, 0.14), shade(wall, -0.2)); g.fill(); ol(g, 3.5);
      ell(g, 0, -100, 128, 22); g.fillStyle = shade(wall, -0.32); g.fill(); ol(g, 3.5);
      cap(); g.fillStyle = lin(g, -134, 0, 134, 0, shade(roof, 0.16), shade(roof, -0.2)); g.fill();
      g.save(); cap(); g.clip();
      g.fillStyle = '#fff';
      [[-74, -142, 21, 14], [-8, -176, 25, 15], [64, -152, 19, 13], [-110, -108, 13, 9], [18, -118, 21, 12], [102, -114, 14, 9], [-44, -112, 12, 8]].forEach(function (q) { ell(g, q[0], q[1], q[2], q[3]); g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(27,42,73,0.35)'; g.stroke(); });
      g.fillStyle = 'rgba(255,255,255,0.18)'; ell(g, -60, -176, 46, 14); g.fill();
      g.restore();
      cap(); ol(g, 3.5);
      doorArt(g, DOORX, base, 44, 60, door, 22); doorStep(g, DOORX, base);
      g.beginPath(); g.arc(34, -54, 19, 0, TAU); g.fillStyle = '#fff'; g.fill(); ol(g, 3);
      g.beginPath(); g.arc(34, -54, 13.5, 0, TAU); g.fillStyle = lin(g, 0, -68, 0, -40, '#D4F2FF', '#8ED2F4'); g.fill(); ol(g, 2);
      g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(21, -54); g.lineTo(47, -54); g.moveTo(34, -67); g.lineTo(34, -41); g.stroke();
      flowerBox(g, 18, -36, 32);
    },
    // 3: modern villa
    function (g, wall, roof, door) {
      var x0 = -120, w = 240, base = -8, x;
      groundShadow(g, x0, w, base);
      box(g, x0, base, w, 78, 45, wall, 3.5);
      box(g, x0 - 6, base - 78, w + 12, 9, 45, roof, 3.5);
      g.strokeStyle = NAVY; g.lineWidth = 2.5; g.beginPath();                                              // balcony rail
      for (x = x0 + 4; x < x0 + 96; x += 13) { g.moveTo(x, base - 87); g.lineTo(x, base - 106); }
      g.moveTo(x0 + 2, base - 106); g.lineTo(x0 + 96, base - 106); g.stroke();
      box(g, x0 + 96, base - 87, 138, 58, 45, wall, 3.5);
      box(g, x0 + 90, base - 145, 150, 8, 45, roof, 3.5);
      rr(g, x0 + 108, base - 134, 114, 34, 5); g.fillStyle = '#fff'; g.fill(); ol(g, 3);
      rr(g, x0 + 113, base - 129, 104, 24, 3); g.fillStyle = lin(g, 0, base - 129, 0, base - 105, '#D4F2FF', '#8ED2F4'); g.fill(); ol(g, 2);
      g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0 + 148, base - 129); g.lineTo(x0 + 148, base - 105); g.moveTo(x0 + 182, base - 129); g.lineTo(x0 + 182, base - 105); g.stroke();
      rr(g, x0 + 124, base - 66, 104, 54, 5); g.fillStyle = '#fff'; g.fill(); ol(g, 3);
      rr(g, x0 + 129, base - 61, 94, 44, 3); g.fillStyle = lin(g, 0, base - 61, 0, base - 17, '#D4F2FF', '#7CCBFF'); g.fill(); ol(g, 2);
      g.save(); rr(g, x0 + 129, base - 61, 94, 44, 3); g.clip(); g.fillStyle = 'rgba(255,255,255,0.55)'; poly(g, [x0 + 140, base - 17, x0 + 166, base - 61, x0 + 180, base - 61, x0 + 154, base - 17]); g.fill(); g.restore();
      g.strokeStyle = '#fff'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(x0 + 176, base - 61); g.lineTo(x0 + 176, base - 17); g.stroke();
      win(g, x0 + 12, base - 62, 36, 36);
      doorArt(g, DOORX, base, 44, 62, door, 4); doorStep(g, DOORX, base);
      rr(g, x0 + 30, base - 100, 18, 13, 3); g.fillStyle = '#D0461F'; g.fill(); ol(g, 2.5);                 // a plant on the balcony
      blobs(g, [[x0 + 33, base - 106, 7], [x0 + 45, base - 106, 7], [x0 + 39, base - 113, 8]], '#48A85F', 2.5);
    },
    // 4: castle
    function (g, wall, roof, door) {
      var base = -8, x, i;
      function tower(tx, side) {
        var w = 52, top = -138;
        if (side) { poly(g, [tx + w, base, tx + w + 14, base - 9, tx + w + 14, top - 9, tx + w, top]); g.fillStyle = shade(wall, -0.26); g.fill(); ol(g, 3.5); }
        g.beginPath(); g.rect(tx, top, w, base - top); g.fillStyle = lin(g, tx, 0, tx + w, 0, shade(wall, 0.14), shade(wall, -0.1)); g.fill(); ol(g, 3.5);
        g.strokeStyle = 'rgba(27,42,73,0.14)'; g.lineWidth = 2;
        for (i = 0; i < 6; i++) { var sx = tx + 6 + rnd(i + tx) * 30, sy = top + 22 + i * 19; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 14, sy); g.stroke(); }
        rr(g, tx - 5, top - 7, w + 10, 12, 3); g.fillStyle = shade(wall, -0.14); g.fill(); ol(g, 3);
        poly(g, [tx - 8, top - 7, tx + w / 2, top - 58, tx + w + 8, top - 7]); g.fillStyle = lin(g, tx, 0, tx + w, 0, shade(roof, 0.2), shade(roof, -0.22)); g.fill(); ol(g, 3.5);
        g.strokeStyle = NAVY; g.lineWidth = 2.5; g.beginPath(); g.moveTo(tx + w / 2, top - 58); g.lineTo(tx + w / 2, top - 76); g.stroke();
        poly(g, [tx + w / 2, top - 76, tx + w / 2 + 15, top - 71, tx + w / 2, top - 65]); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2);
        rrTop(g, tx + w / 2 - 6, top + 30, 12, 26, 6); g.fillStyle = '#3A4A6B'; g.fill(); ol(g, 2.5);
      }
      groundShadow(g, -126, 250, base);
      g.beginPath(); g.rect(-84, -94, 168, 86); g.fillStyle = lin(g, 0, -94, 0, base, shade(wall, 0.1), shade(wall, -0.08)); g.fill(); ol(g, 3.5);
      for (x = -76; x < 76; x += 28) { rr(g, x, -108, 17, 16, 2); g.fillStyle = shade(wall, 0.1); g.fill(); ol(g, 3); }
      g.strokeStyle = 'rgba(27,42,73,0.14)'; g.lineWidth = 2;
      for (i = 0; i < 9; i++) { x = -70 + rnd(i + 20) * 130; var y = -84 + rnd(i + 31) * 64; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 16, y); g.stroke(); }
      tower(-128, false); tower(76, true);
      doorArt(g, DOORX, base, 48, 66, door, 24); doorStep(g, DOORX, base);
      rrTop(g, 24, -72, 26, 36, 13); g.fillStyle = '#fff'; g.fill(); ol(g, 3);
      rrTop(g, 29, -67, 16, 27, 8); g.fillStyle = '#8ED2F4'; g.fill(); ol(g, 2);
      poly(g, [-60, -94, -12, -94, -36, -76]); g.fillStyle = roof; g.fill(); ol(g, 3);                     // a pennant over the gate
    }
  ];
  var HSMOKE = [[73, -194], [85, -180], null, null, null];   // where the chimney is, per style

  // ---------- the fence along the street, the mailbox ----------
  function frontFence(g) {   // (0, 0) = the left end of the garden's front edge
    var x;
    function part(a, b) {
      g.fillStyle = SH; g.fillRect(a, 15, b - a, 6);
      g.fillStyle = '#E3E7EE'; rr(g, a, -8, b - a, 6, 2); g.fill(); ol(g, 2.5); rr(g, a, 5, b - a, 6, 2); g.fill(); ol(g, 2.5);
    }
    part(-38, GATE - 44); part(GATE + 44, PW + 38);
    for (x = -34; x < PW + 28; x += 18) {
      if (x + 10 > GATE - 46 && x < GATE + 46) continue;
      poly(g, [x, 17, x, -16, x + 5, -24, x + 10, -16, x + 10, 17]); g.fillStyle = '#FFFFFF'; g.fill(); ol(g, 2.5);
      g.fillStyle = 'rgba(27,42,73,0.13)'; g.fillRect(x + 7, -15, 2, 31);
    }
    [GATE - 52, GATE + 40].forEach(function (px) {
      rr(g, px, -34, 12, 53, 3); g.fillStyle = lin(g, px, 0, px + 12, 0, '#E0A868', '#A56B38'); g.fill(); ol(g, 3);
      g.beginPath(); g.arc(px + 6, -36, 7, 0, TAU); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2.5);
    });
  }
  function mailbox(g, up) {   // (0, 0) = the foot of its post
    sh(g, 5, 2, 17, 5);
    rr(g, -3.5, -32, 7, 34, 2); g.fillStyle = lin(g, -3.5, 0, 3.5, 0, '#C98A4B', '#8F5A2E'); g.fill(); ol(g, 2.5);
    rrTop(g, -18, -58, 36, 28, 13); g.fillStyle = lin(g, 0, -58, 0, -30, '#FF7A8F', '#D92E4E'); g.fill(); ol(g, 3);
    rr(g, -10, -47, 20, 5, 2); g.fillStyle = NAVY; g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; ell(g, -8, -53, 6, 2.5); g.fill();
    if (up) { rr(g, 17, -70, 4, 26, 2); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2); rr(g, 17, -70, 14, 9, 2); g.fill(); ol(g, 2); }
    else { rr(g, 17, -40, 16, 4, 2); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2); }
  }

  // ---------- the catalogue (sent by the server when the room opens) ----------
  var CAT = { items: {}, order: [], styles: [], levels: [], max: 60, maxStock: 48, heartStars: 2 };
  var RARE = ['', 'Rare', 'Epic', 'Legendary'];
  var CATS = [
    { id: 'furn', pic: 'chair', en: 'Furniture', zh: '家具', py: 'jiājù', ms: 'Perabot' },
    { id: 'plant', pic: 'tree', en: 'Plants', zh: '植物', py: 'zhíwù', ms: 'Tumbuhan' },
    { id: 'fun', pic: 'ball', en: 'Fun', zh: '好玩的', py: 'hǎowán de', ms: 'Permainan' },
    { id: 'deco', pic: 'lamp', en: 'Decor', zh: '装饰', py: 'zhuāngshì', ms: 'Hiasan' },
    { id: 'ground', pic: 'path', en: 'Ground', zh: '地面', py: 'dìmiàn', ms: 'Lantai' }
  ];
  var WALLS = ['#FFE8CC', '#FFFFFF', '#FFD3E0', '#CFE6FF', '#D3F9D8', '#FFE9A8', '#E2D6FF'];
  var ROOFS = ['#E0447F', '#D0461F', '#F08A24', '#2F9E83', '#2F6FCC', '#6C4BD8', '#5B6275'];
  var DOORS = ['#8F5A2E', '#D0461F', '#2F6FCC', '#2F9E83', '#FFC933', '#6C4BD8', '#FF8FB8'];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hexOr(v, d) { return /^#[0-9a-fA-F]{6}$/.test(v) ? v : d; }
  function esc(s) { return api.esc(s === undefined || s === null ? '' : s); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined && html !== null) e.innerHTML = html; return e; }
  function itemOf(id) { return CAT.items[id] || { cat: 'deco', cost: 0, lv: 1, rare: 0, w: 1, h: 1, pack: 1, walk: false, en: String(id), zh: '', py: '', ms: '' }; }
  function artOf(id) { return ART[id] || ART._; }

  // ---------- sprites: every still drawing is made once and then reused as a picture ----------
  var cache = {}, RES = 1, houseKeys = [];
  function setRes(r) { r = Math.max(0.75, Math.min(2, Math.ceil(r * 4) / 4)); if (r !== RES) { RES = r; cache = {}; houseKeys = []; } }
  function sprite(key, w, h, draw) {   // w and h in garden pixels
    var s = cache[key], g;
    if (!s) {
      s = document.createElement('canvas'); s.width = Math.ceil(w * RES); s.height = Math.ceil(h * RES);
      g = s.getContext('2d'); g.scale(RES, RES); g.lineJoin = 'round'; g.lineCap = 'round';
      draw(g); cache[key] = s;
    }
    return s;
  }
  var boxes = {};
  function boxOf(id) {   // the rectangle a thing is drawn in, around its origin (the same on both sides, so it can be flipped)
    var b = boxes[id], it, a, W, D, pad, top;
    if (b) return b;
    it = itemOf(id); a = artOf(id); W = it.w * TW; D = it.h * TH; pad = a.tile ? 0 : 48; top = Math.min(a.top, -D) - (a.tile ? 0 : 10);
    b = boxes[id] = { x: -W / 2 - pad, y: top, w: W + pad * 2, h: -top + (a.tile ? 0 : 22) };
    return b;
  }
  function itemSprite(id, flip, part) {
    var key = id + (flip ? '<' : '>') + part, b, a;
    if (cache[key]) return cache[key];
    b = boxOf(id); a = artOf(id);
    return sprite(key, b.w, b.h, function (g) { g.translate(-b.x, -b.y); if (flip) g.scale(-1, 1); a[part](g); });
  }
  function drawItem(c, id, x, y, flip, t) {   // a thing with its origin at (x, y)
    var b = boxOf(id), a = artOf(id);
    c.drawImage(itemSprite(id, flip, 's'), x + b.x, y + b.y, b.w, b.h);
    if (a.a) { c.save(); c.translate(x, y); if (flip) c.scale(-1, 1); a.a(c, t); c.restore(); }
    if (a.s2) c.drawImage(itemSprite(id, flip, 's2'), x + b.x, y + b.y, b.w, b.h);
  }
  var HB = { x: -200, y: -236, w: 400, h: 262 };
  function drawHouse(c, h, t) {
    var s = HOUSES[h.s] ? h.s : 0, key = 'H' + s + h.wall + h.roof + h.door, x = (HOUSE.x + HOUSE.w / 2) * TW, y = (HOUSE.y + HOUSE.h) * TH, sm = HSMOKE[s];
    if (!cache[key]) {   // colours are tried out a lot: keep only the latest pictures
      houseKeys.push(key); if (houseKeys.length > 10) delete cache[houseKeys.shift()];
      sprite(key, HB.w, HB.h, function (g) { g.translate(-HB.x, -HB.y); HOUSES[s](g, h.wall, h.roof, h.door); });
    }
    c.drawImage(cache[key], x + HB.x, y + HB.y, HB.w, HB.h);
    if (sm) puffs(c, x + sm[0], y + sm[1], t, 0);
  }
  // one thing alone, fitted into a small picture of w x h screen pixels (shop cards, storage, tabs)
  function paintItem(cvs, id, w, h) {
    var c = cvs.getContext('2d'), it = itemOf(id), a = artOf(id), W = it.w * TW, D = it.h * TH;
    var x0 = -W / 2 - (a.tile ? 0 : 14), x1 = W / 2 + (a.tile ? 0 : 22), y0 = Math.min(a.top, -D) - 2, y1 = a.tile ? 0 : 10, k = Math.min(w / (x1 - x0), h / (y1 - y0), 1.3);
    cvs.width = w * 2; cvs.height = h * 2; cvs.style.width = w + 'px'; cvs.style.height = h + 'px';
    c.setTransform(2 * k, 0, 0, 2 * k, 2 * (w / 2 - (x0 + x1) / 2 * k), 2 * (h / 2 - (y0 + y1) / 2 * k));
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.save(); a.s(c); c.restore();
    if (a.a) { c.save(); a.a(c, 0.6); c.restore(); }
    if (a.s2) { c.save(); a.s2(c); c.restore(); }
  }
  function paintHouse(cvs, h, w, hh) {
    var c = cvs.getContext('2d'), s = HOUSES[h.s] ? h.s : 0, k = Math.min(w / 330, hh / 250);
    cvs.width = w * 2; cvs.height = hh * 2; cvs.style.width = w + 'px'; cvs.style.height = hh + 'px';
    c.setTransform(2 * k, 0, 0, 2 * k, 2 * (w / 2 - 14 * k), 2 * (hh / 2 + 118 * k));
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.save(); HOUSES[s](c, h.wall, h.roof, h.door); c.restore();
  }

  // ---------- a plot: the data from the server, made ready for drawing ----------
  var revs = 0;
  function readPlot(m) {
    var h = m.house || {}, p = { key: m.key, name: m.name || '', color: hexOr(m.color, '#FF7A45'), mine: !!m.mine, hearts: m.hearts || 0, score: m.score || 0, lv: m.lv || 1,
      canHeart: !!m.canHeart, mail: m.mail || 0, inv: m.inv || {}, styles: m.styles || [], placed: [],
      house: { s: HOUSES[h.s] ? h.s : 0, wall: hexOr(h.wall, '#FFE8CC'), roof: hexOr(h.roof, '#E0447F'), door: hexOr(h.door, '#8F5A2E') } };
    (m.placed || []).forEach(function (q) { p.placed.push({ n: q[0], i: q[1], x: q[2], y: q[3], f: q[4] ? 1 : 0 }); });
    prep(p);
    return p;
  }
  // what follows from the list of placed things: the draw order, where avatars cannot walk, the bouncy and splashy spots
  function prep(p) {
    var i, x, y;
    p.rev = ++revs; p.block = []; p.spots = [];
    for (i = 0; i < GW * GH; i++) p.block.push(0);
    for (y = HOUSE.y; y < HOUSE.y + HOUSE.h; y++) for (x = HOUSE.x; x < HOUSE.x + HOUSE.w; x++) p.block[y * GW + x] = 1;
    p.list = [{ y: (HOUSE.y + HOUSE.h) * TH, x: 0, d: function (c, t) { drawHouse(c, p.house, t); } }];
    p.placed.forEach(function (o) {
      var it = itemOf(o.i), a = artOf(o.i), X = (o.x + it.w / 2) * TW, Y = (o.y + it.h) * TH, tx, ty;
      if (it.cat === 'ground') return;
      if (!it.walk) for (ty = o.y; ty < o.y + it.h; ty++) for (tx = o.x; tx < o.x + it.w; tx++) if (tx >= 0 && ty >= 0 && tx < GW && ty < GH) p.block[ty * GW + tx] = 1;
      if (o.i === 'trampoline' || o.i === 'pool') p.spots.push({ k: o.i, x: X, y: Y - TH });
      p.list.push({ y: a.flat ? o.y * TH + 1 : Y, x: X, n: o.n, d: function (c, t) { drawItem(c, o.i, X, Y, o.f, t); } });
    });
    p.list.push({ y: PH + 16, x: 0, d: function (c) { c.drawImage(cache.fence || sprite('fence', PW + 96, 76, fenceArt), -48, PH - 46, PW + 96, 76); } });
    p.list.push({ y: PH + 40, x: 1, d: function (c, t) {
      var up = p.mine && p.mail > 0;
      c.drawImage(up ? cache.mail1 || sprite('mail1', 80, 96, mailArt1) : cache.mail0 || sprite('mail0', 80, 96, mailArt0), GATE + 82 - 30, PH + 38 - 80, 80, 96);
      if (up) twinkles(c, t, MAILTW);
    } });
  }
  var MAILTW = [[GATE + 62, PH - 22], [GATE + 108, PH - 30], [GATE + 86, PH - 44]];
  function fenceArt(g) { g.translate(48, 46); frontFence(g); }
  function mailArt0(g) { g.translate(30, 80); mailbox(g, false); }
  function mailArt1(g) { g.translate(30, 80); mailbox(g, true); }
  function byDepth(a, b) { return a.y - b.y || a.x - b.x; }
  function fitsAt(p, id, x, y, skipN) {   // the same rule as on the server
    var it = itemOf(id), layer = it.cat === 'ground' ? 0 : 1, i, o, q;
    if (!(x >= 0 && y >= 0 && x + it.w <= GW && y + it.h <= GH)) return false;
    if (x < HOUSE.x + HOUSE.w && x + it.w > HOUSE.x && y < HOUSE.y + HOUSE.h && y + it.h > HOUSE.y) return false;
    for (i = 0; i < p.placed.length; i++) {
      o = p.placed[i]; q = itemOf(o.i);
      if (o.n === skipN || (q.cat === 'ground' ? 0 : 1) !== layer) continue;
      if (x < o.x + q.w && x + it.w > o.x && y < o.y + q.h && y + it.h > o.y) return false;
    }
    return true;
  }
  function stockOf(p, id) { var n = p.inv[id] || 0; p.placed.forEach(function (o) { if (o.i === id) n--; }); return Math.max(0, n); }

  // ---------- the ground: lawn, hedges, the street in front, and the ground tiles ----------
  var grassSrc = null;
  function grassTile() {
    if (grassSrc) return grassSrc;
    var S = 256, s = document.createElement('canvas'), g, i; s.width = s.height = S; g = s.getContext('2d');
    function wrap(x, y, fn) { for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) fn(x + a * S, y + b * S); }
    g.fillStyle = '#7BD389'; g.fillRect(0, 0, S, S);
    for (i = 0; i < 22; i++) (function (i) {
      var rx = 16 + rnd(i + 9) * 26, ry = 8 + rnd(i + 5) * 12;
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.09)' : 'rgba(26,110,62,0.09)';
      wrap(rnd(i) * S, rnd(i + 50) * S, function (x, y) { ell(g, x, y, rx, ry); g.fill(); });
    })(i);
    g.lineCap = 'round'; g.lineWidth = 2.4;
    for (i = 0; i < 34; i++) (function (i) {
      g.strokeStyle = i % 3 ? '#5DBB72' : '#A2E6AC';
      wrap(rnd(i + 100) * S, rnd(i + 200) * S, function (x, y) { g.beginPath(); g.moveTo(x - 4.5, y); g.lineTo(x - 2.5, y - 7); g.moveTo(x, y); g.lineTo(x, y - 9.5); g.moveTo(x + 4.5, y); g.lineTo(x + 3, y - 6.5); g.stroke(); });
    })(i);
    grassSrc = s;
    return s;
  }
  // L = { s: screen pixels per garden pixel, ox, oy: where the garden's top-left corner is on the screen, w, h: the screen size }
  function layout(w, h, bot) {
    var s = Math.min(w / (PW + MS * 2), (h - bot) / (MT + PH + 26));
    return { s: s, ox: (w - PW * s) / 2, oy: MT * s + Math.max(0, (h - bot - (MT + PH + 26) * s) * 0.6), w: w, h: h };
  }
  function drawGround(c, p, L, dpr, grid) {
    var s = L.s * dpr, vx = -L.ox / L.s, vy = -L.oy / L.s, vw = L.w / L.s, vh = L.h / L.s, i, x, y, list = [];
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, Math.ceil(L.w * dpr), Math.ceil(L.h * dpr));
    c.setTransform(s, 0, 0, s, L.ox * dpr, L.oy * dpr);
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.fillStyle = c.createPattern(grassTile(), 'repeat'); c.fillRect(vx, vy, vw, vh);
    c.fillStyle = 'rgba(16,84,60,0.20)';                                              // outside the garden the grass is darker
    c.fillRect(vx, vy, vw, -8 - vy); c.fillRect(vx, PH + 8, vw, vy + vh - PH - 8); c.fillRect(vx, -8, -8 - vx, PH + 16); c.fillRect(PW + 8, -8, vx + vw - PW - 8, PH + 16);
    // the street: pavement, kerb, road
    c.fillStyle = '#EDE6D4'; c.fillRect(vx, PH + 30, vw, 32);
    c.strokeStyle = 'rgba(27,42,73,0.14)'; c.lineWidth = 2; c.beginPath(); for (x = Math.floor(vx / 54) * 54; x < vx + vw; x += 54) { c.moveTo(x, PH + 30); c.lineTo(x, PH + 62); } c.stroke();
    c.fillStyle = '#B5AE9F'; c.fillRect(vx, PH + 62, vw, 7);
    c.fillStyle = '#7F889B'; c.fillRect(vx, PH + 69, vw, Math.max(0, vy + vh - PH - 69));
    c.fillStyle = 'rgba(255,255,255,0.75)'; for (x = Math.floor(vx / 96) * 96; x < vx + vw; x += 96) { rr(c, x, PH + 112, 46, 7, 3); c.fill(); }
    c.strokeStyle = 'rgba(27,42,73,0.35)'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(vx, PH + 30); c.lineTo(vx + vw, PH + 30); c.moveTo(vx, PH + 69); c.lineTo(vx + vw, PH + 69); c.stroke();
    // the lawn, with a faint chessboard so the tiles can be counted
    rr(c, -8, -8, PW + 16, PH + 16, 12); c.fillStyle = c.createPattern(grassTile(), 'repeat'); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.055)';
    for (y = 0; y < GH; y++) for (x = 0; x < GW; x++) if ((x + y) % 2) c.fillRect(x * TW, y * TH, TW, TH);
    c.fillStyle = lin(c, 0, 0, 0, 16, 'rgba(22,48,66,0.16)', 'rgba(22,48,66,0)'); c.fillRect(0, 0, PW, 16);   // shade of the back hedge
    rr(c, -8, -8, PW + 16, PH + 16, 12); c.strokeStyle = 'rgba(27,42,73,0.22)'; c.lineWidth = 3; c.stroke();
    // the way in, under the gate
    rr(c, GATE - 34, PH - 2, 68, 36, 6); c.fillStyle = '#EBD9A4'; c.fill(); c.strokeStyle = 'rgba(27,42,73,0.3)'; c.lineWidth = 2; c.stroke();
    for (i = 0; i < 5; i++) { ell(c, GATE - 22 + rnd(i + 7) * 44, PH + 6 + rnd(i + 17) * 22, 5 + rnd(i) * 4, 3 + rnd(i + 2) * 2); c.fillStyle = i % 2 ? 'rgba(255,255,255,0.5)' : 'rgba(150,118,62,0.22)'; c.fill(); }
    // hedges behind and beside the garden
    for (y = 14; y <= PH + 2; y += 34) { list.push([-28, y, 22 + rnd(y) * 5]); list.push([PW + 28, y, 22 + rnd(y + 3) * 5]); }
    for (x = -30; x <= PW + 30; x += 33) list.push([x, -27 + rnd(x + 1) * 5, 23 + rnd(x) * 6]);
    blobs(c, list, '#2F8548', 3.5);
    c.fillStyle = '#48A85F'; for (i = 0; i < list.length; i++) { c.beginPath(); c.arc(list[i][0] - 3, list[i][1] - 4, list[i][2] - 6, 0, TAU); c.fill(); }
    c.fillStyle = '#6CC67F'; for (i = 0; i < list.length; i += 2) { c.beginPath(); c.arc(list[i][0] - 8, list[i][1] - 11, 6, 0, TAU); c.fill(); }
    // ground tiles
    p.placed.forEach(function (o) { var it = itemOf(o.i); if (it.cat === 'ground') drawItem(c, o.i, (o.x + it.w / 2) * TW, (o.y + it.h) * TH, o.f, 0); });
    if (grid) {   // edit mode: the tiles are easier to see
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.5; c.beginPath();
      for (x = 0; x <= GW; x++) { c.moveTo(x * TW, 0); c.lineTo(x * TW, PH); }
      for (y = 0; y <= GH; y++) { c.moveTo(0, y * TH); c.lineTo(PW, y * TH); }
      c.stroke();
    }
  }
  // a whole plot as a still picture (the cards on Home Street)
  function drawStill(cvs, p, w, h) {
    var c = cvs.getContext('2d'), L = layout(w, h, -14), list;
    cvs.width = w * 2; cvs.height = h * 2;
    drawGround(c, p, L, 2, false);
    list = p.list.slice().sort(byDepth);
    list.forEach(function (e) { e.d(c, 0.6); });
  }

  // ---------- what is open right now ----------
  var view = 'street', street = null, cur = null, panel = null, els = {};
  var cv = null, ctx = null, bg = null, bgOk = false, L = null, dpr = 1, raf = 0, lastTs = 0, stick = null;
  var me = { x: SPAWN.x, y: SPAWN.y, f: 1, m: 0, h: 80, lift: 0 }, others = {}, stAt = 0, sent = { x: -1, y: -1, m: 0, f: 1, t: 0 };
  var edit = { on: false, sel: 0, arm: null, armF: 0, drag: null }, trayStale = false, othersN = 0, cards = {}, cardOrder = '';
  var fx = [], shopSt = { cat: 'furn', sel: null, msg: '', busy: false }, houseSt = { s: 0, msg: '', busy: false };

  var CSS = [
    '.plot-root{background:#BFE8FF;color:#1B2A49;display:flex;flex-direction:column;overflow:hidden;touch-action:none}',
    '.plot-root .py{font-family:system-ui,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif}',
    '.plot-root button{touch-action:manipulation}',
    '.plot-root .plot-ti{touch-action:pan-y}',
    '.plot-nav{position:absolute;left:10px;top:10px;z-index:6;display:flex;gap:8px}',
    '.plot-nav .btn{height:52px;padding:0 16px;font-size:18px;white-space:nowrap;border-width:3px}',
    '.plot-coins{height:52px;font-size:22px;flex:none;white-space:nowrap}',
    // Home Street: the lobby
    '.plot-street{flex:1;min-height:0;display:flex;flex-direction:column;background:linear-gradient(#BFE8FF,#E4F6FF 120px,#A6E3B0 120px,#8FD99C)}',
    '.plot-sh{display:flex;align-items:center;gap:12px;padding:10px 12px 6px 168px;min-height:72px}',
    '.plot-sh h2{margin:0;font-size:30px;line-height:1.05;white-space:nowrap}',
    '.plot-sub{font-size:16px;font-weight:600;flex:1;min-width:0;line-height:1.2}',
    '.plot-mailbar{margin:0 12px 8px;background:#FFE9A8;border:3px solid #1B2A49;border-radius:20px;padding:6px 8px 6px 14px;display:flex;align-items:center;gap:10px;font-size:19px;font-weight:700}',
    '.plot-mailbar span{flex:1;min-width:0}',
    '.plot-mailbar .btn{height:50px;border-width:3px;white-space:nowrap}',
    '.plot-homes{flex:1;min-height:0;overflow-y:auto;touch-action:pan-y;-webkit-overflow-scrolling:touch;display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));grid-auto-rows:max-content;gap:12px;padding:6px 12px 16px;align-content:start}',
    '.plot-home{background:#FFF3D6;border:4px solid #1B2A49;border-radius:22px;padding:8px 8px 10px;display:flex;flex-direction:column;gap:2px;text-align:left;font-size:15px;font-weight:600;line-height:1.2;box-shadow:0 5px 0 rgba(27,42,73,.22);min-width:0}',
    '.plot-home:active{transform:translateY(3px);box-shadow:0 2px 0 rgba(27,42,73,.22)}',
    '.plot-home.me{background:#FFE9A8}',
    '.plot-home canvas{display:block;width:100%;height:auto;border-radius:14px;border:3px solid #1B2A49;background:#7BD389;margin-bottom:4px}',
    '.plot-hn{display:flex;align-items:center;gap:6px;font-size:20px;min-width:0}',
    '.plot-hn i{flex:none;width:20px;height:20px;border-radius:7px;border:2.5px solid #1B2A49}',
    '.plot-hn b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.plot-hn em{font-style:normal;font-weight:600;font-size:15px;opacity:.8;white-space:nowrap}',
    '.plot-hn u{flex:none;margin-left:auto;width:14px;height:14px;border-radius:50%;background:#37B24D;border:2.5px solid #1B2A49;text-decoration:none}',
    '.plot-hn u.off{background:#C9C4B8}',
    '.plot-ht b{background:#1B2A49;color:#fff;border-radius:999px;padding:0 8px;font-size:14px;margin-right:4px}',
    '.plot-ht{font-size:17px;font-weight:700}',
    '.plot-h3{font-size:14px}',
    '.plot-hs{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:16px;font-weight:700;margin-top:2px}',
    '.plot-wait{font-size:22px;font-weight:600;padding:20px}',
    // inside a garden
    '.plot-yard{flex:1;min-height:0;display:flex}',
    '.plot-stage{flex:1;min-width:0;position:relative;overflow:hidden;background:#7BD389}',
    '.plot-cv{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none}',
    '.plot-topr{position:absolute;right:10px;top:10px;pointer-events:none}',
    '.plot-bot{position:absolute;left:10px;right:10px;bottom:10px;display:flex;align-items:flex-end;gap:8px;pointer-events:none}',
    '.plot-info{pointer-events:none;height:52px;min-width:0;background:#fff;border:3px solid #1B2A49;border-radius:999px;padding:0 16px 0 10px;display:flex;align-items:center;gap:9px;font-size:19px;font-weight:700;white-space:nowrap;overflow:hidden}',
    '.plot-info i{flex:none;width:24px;height:24px;border-radius:8px;border:2.5px solid #1B2A49}',
    '.plot-info .plot-lv{background:#1B2A49;color:#fff;border-radius:999px;padding:1px 10px;font-size:15px}',
    '.plot-info .plot-ttl{font-weight:600}',
    '.plot-acts{margin-left:auto;display:flex;gap:8px;pointer-events:auto;flex:none}',
    '.plot-acts .btn{white-space:nowrap;border-width:3px;padding:0 18px}',
    '.plot-acts .plot-mailBtn{background:#FFE9A8;animation:ftPulse .7s ease-in-out infinite alternate}',
    '.plot-acts .plot-heartBtn{background:#FFD3E0}',
    '.plot-sel{pointer-events:auto;flex:1;min-width:0;background:#FFF3D6;border:3px solid #1B2A49;border-radius:20px;padding:5px 6px 5px 12px;display:flex;align-items:center;gap:8px;font-size:16px;font-weight:600;line-height:1.15;min-height:60px}',
    '.plot-sel > span{flex:1;min-width:0}',
    '.plot-sel .btn{flex:none;height:50px;padding:0 12px;font-size:17px;border-width:3px;white-space:nowrap}',
    // storage beside the garden while decorating
    '.plot-tray{flex:none;width:226px;background:#FFF3D6;border-left:4px solid #1B2A49;display:flex;flex-direction:column;gap:6px;padding:8px}',
    '.plot-tbtns{display:grid;grid-template-columns:1fr 1fr;gap:6px}',
    '.plot-tbtns .btn{height:50px;padding:0 4px;font-size:17px;border-width:3px;white-space:nowrap}',
    '.plot-tbtns .plot-doneBtn{grid-column:1 / 3}',
    '.plot-tlabel{font-size:16px;font-weight:700;display:flex;justify-content:space-between;gap:6px;white-space:nowrap}',
    '.plot-tlist{flex:1;min-height:0;overflow-y:auto;touch-action:pan-y;-webkit-overflow-scrolling:touch;display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:max-content;gap:6px;align-content:start;padding:2px}',
    '.plot-ti{position:relative;background:#fff;border:3px solid #1B2A49;border-radius:14px;padding:3px 2px 4px;display:flex;flex-direction:column;align-items:center;font-size:12.5px;font-weight:600;line-height:1.1;min-height:84px;touch-action:pan-y;text-align:center;min-width:0}',
    '.plot-ti.on{background:#FFD66B;outline:3px solid #1B2A49;outline-offset:1px}',
    '.plot-ti canvas{display:block;pointer-events:none}',
    '.plot-ti i{position:absolute;right:2px;top:2px;background:#1B2A49;color:#fff;border-radius:999px;font-size:12px;font-weight:700;padding:1px 6px;font-style:normal}',
    '.plot-empty{grid-column:1 / 3;font-size:15px;font-weight:600;line-height:1.3;padding:6px 4px}',
    // the garden shop and the house panel
    '.plot-panel{position:absolute;left:0;top:0;right:0;bottom:0;z-index:4;background:#FFF3D6;display:flex;flex-direction:column;gap:8px;padding:10px 12px}',
    '.plot-ph{display:flex;align-items:center;gap:8px;padding-left:158px;min-height:52px}',
    '.plot-ph h2{margin:0;font-size:24px;line-height:1.05;flex:1;min-width:0}',
    '.plot-ph h2 small{display:block;font-size:14px;font-weight:600}',
    '.plot-ph .btn{height:52px;border-width:3px;flex:none}',
    '.plot-tabs{display:flex;gap:6px;flex:1;min-width:0}',
    '.plot-tab{flex:0 1 auto;height:52px;min-width:54px;padding:0 12px 0 4px;border-radius:999px;border:3px solid #1B2A49;background:#fff;font-size:17px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:2px}',
    '.plot-tab.on{background:#FFD66B;outline:3px solid #1B2A49;outline-offset:1px}',
    '.plot-tab canvas{flex:none}',
    '.plot-catname{font-size:16px;font-weight:600;margin:-2px 2px}',
    '.plot-grid{flex:1;min-height:0;overflow-y:auto;touch-action:pan-y;-webkit-overflow-scrolling:touch;display:grid;grid-template-columns:repeat(auto-fill,minmax(134px,1fr));grid-auto-rows:max-content;gap:9px;align-content:start;padding:3px 3px 8px}',
    '.plot-card{position:relative;background:#fff;border:4px solid #1B2A49;border-radius:18px;padding:4px 4px 6px;display:flex;flex-direction:column;align-items:center;gap:1px;font-size:13px;font-weight:600;line-height:1.15;text-align:center;min-height:164px;min-width:0}',
    '.plot-card b{font-size:15.5px}',
    '.plot-card canvas{display:block}',
    '.plot-card.on{background:#FFF0B8;outline:4px solid #1B2A49;outline-offset:1px}',
    '.plot-card:active,.plot-ti:active,.plot-tab:active{transform:scale(.97)}',
    '.plot-root .plot-r1{border-color:#5AA9FF}', '.plot-root .plot-r2{border-color:#9B6BFF}', '.plot-root .plot-r3{border-color:#F5B301}',
    '.plot-price{margin-top:auto;font-style:normal;background:#FFD66B;border:2.5px solid #1B2A49;border-radius:999px;padding:1px 10px;font-size:15px;font-weight:700;white-space:nowrap}',
    '.plot-price.lock{background:#E4E0D6}', '.plot-price.own{background:#D3F9D8}',
    '.plot-price small{font-size:12px}',
    '.plot-have{position:absolute;left:4px;top:4px;background:#1B2A49;color:#fff;border-radius:999px;font-size:12px;font-weight:700;padding:1px 7px;font-style:normal}',
    '.plot-tag{display:inline-block;margin-left:6px;padding:0 8px;border:2px solid #1B2A49;border-radius:999px;font-size:13px;font-weight:700;line-height:1.4;vertical-align:middle;white-space:nowrap}',
    '.plot-t1{background:#CFE6FF}', '.plot-t2{background:#E2D6FF}', '.plot-t3{background:#FFE9A8}',
    '.plot-buy{flex:none;background:#fff;border:4px solid #1B2A49;border-radius:22px;padding:6px 10px;display:flex;align-items:center;gap:10px;min-height:76px}',
    '.plot-buy canvas{flex:none}',
    '.plot-btxt{flex:1;min-width:0;font-size:16px;font-weight:600;line-height:1.2}',
    '.plot-bname b{font-size:19px}',
    '.plot-bsum{font-size:21px;font-weight:700}',
    '.plot-bmsg{color:#B3122F}', '.plot-bmsg.ok{color:#2E7A3C}',
    '.plot-buy .btn{flex:none;height:56px;white-space:nowrap}', '.plot-buy .btn.plot-dim{opacity:.55}',
    '.plot-hint{font-size:17px;font-weight:600;line-height:1.25}',
    '.plot-hbuy{flex-wrap:wrap}', '.plot-hbuy .plot-btxt{flex:1 1 230px}', '.plot-hbuy .btn{flex:1 1 120px}',
    '.plot-shake{animation:plot-shake .45s}',
    '@keyframes plot-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}',
    '.plot-hbody{flex:1;min-height:0;display:flex;gap:10px}',
    '.plot-hleft{flex:0 0 42%;min-width:0;display:flex;flex-direction:column;gap:8px}',
    '.plot-hprev{flex:1;min-height:0;background:linear-gradient(#BFE8FF,#E4F6FF 62%,#8FD99C 62%);border:4px solid #1B2A49;border-radius:22px;display:flex;align-items:center;justify-content:center;overflow:hidden}',
    '.plot-hright{flex:1;min-width:0;background:#fff;border:4px solid #1B2A49;border-radius:22px;padding:8px 12px 12px;overflow-y:auto;touch-action:pan-y;-webkit-overflow-scrolling:touch}',
    '.plot-lbl{font-size:17px;font-weight:700;margin:10px 0 5px}', '.plot-lbl:first-child{margin-top:0}',
    '.plot-row{display:flex;flex-wrap:wrap;gap:8px;padding:2px}',
    '.plot-root .sw{width:48px;height:48px}',
    '.plot-sty{position:relative;background:#E9F6E4;border:3px solid #1B2A49;border-radius:16px;padding:3px 4px 5px;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:14px;font-weight:700;line-height:1.1;min-width:96px}',
    '.plot-sty.on{background:#FFD66B;outline:4px solid #1B2A49;outline-offset:1px}',
    '.plot-sty .plot-price{font-size:13px;padding:0 8px}',
    '@media (min-width:1000px) and (min-height:600px){.plot-homes{grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px;padding:8px 16px 18px}.plot-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}.plot-card{font-size:14px}.plot-card b{font-size:17px}}',
    '@media (max-width:900px),(max-height:560px){' +
      '.plot-nav .btn{height:50px;font-size:17px;padding:0 13px}.plot-coins{height:48px;font-size:20px}' +
      '.plot-sh{padding-left:150px;min-height:66px}.plot-sh h2{font-size:25px}.plot-sub{font-size:14px}' +
      '.plot-info{font-size:16px;gap:6px;height:50px;padding:0 12px 0 8px}.plot-info .plot-ttl{display:none}.plot-acts .btn{height:52px;font-size:18px;padding:0 14px}' +
      '.plot-tray{width:184px;padding:6px}.plot-tbtns .btn{font-size:15px;height:48px}.plot-ti{font-size:11.5px;min-height:78px}' +
      '.plot-sel{font-size:14px;padding:4px 5px 4px 10px;min-height:56px}.plot-sel .btn{height:48px;font-size:15px;padding:0 9px}' +
      '.plot-panel{padding:8px 10px;gap:6px}.plot-ph{padding-left:140px}.plot-ph h2{font-size:20px}.plot-ph h2 small{font-size:12.5px}.plot-tab{padding:0 4px}.plot-tab span{display:none}' +
      '.plot-buy{min-height:66px;padding:4px 8px;border-width:3px;border-radius:18px}.plot-btxt{font-size:14px}.plot-bname b{font-size:16px}.plot-bsum{font-size:18px}.plot-buy .btn{height:52px;font-size:18px;padding:0 14px}' +
      '.plot-card{min-height:150px;font-size:12px}.plot-card b{font-size:14px}.plot-hint{font-size:15px}.plot-catname{font-size:14px}' +
      '.plot-lbl{font-size:15px;margin:6px 0 3px}.plot-sty{min-width:0;width:74px;font-size:11.5px;padding:3px 2px 4px}.plot-sty .plot-price{font-size:12px;padding:0 6px}.plot-row{gap:6px}.plot-hright{padding:6px 8px 8px}}'
  ].join('\n');

  // ---------- opening and closing ----------
  function open() {
    if (root) return;
    if (!document.getElementById('plot-style')) { var stl = el('style'); stl.id = 'plot-style'; stl.textContent = CSS; document.head.appendChild(stl); }
    root = el('div', 'screen plot-root');
    root.innerHTML =
      '<div class="plot-nav"><button class="btn" type="button" data-quiet data-a="town">Back to town</button><button class="btn" type="button" data-a="street" hidden>🏘️ Street</button></div>' +
      '<div class="plot-street">' +
        '<div class="plot-sh"><h2>Home Street</h2><div class="plot-sub">家园街 <span class="py">jiāyuán jiē</span> · Jalan Rumah<br>Tap a home to visit it.</div><span class="pill plot-coins"><span class="ico">⭐</span><b>0</b></span></div>' +
        '<div class="plot-mailbar" hidden><span></span><button class="btn primary" type="button" data-quiet data-a="collect">Collect</button></div>' +
        '<div class="plot-homes"></div>' +
      '</div>' +
      '<div class="plot-yard" hidden>' +
        '<div class="plot-stage"><canvas class="plot-cv" aria-label="The garden"></canvas>' +
          '<div class="plot-topr"><span class="pill plot-coins"><span class="ico">⭐</span><b>0</b></span></div>' +
          '<div class="plot-bot"><div class="plot-info"></div><div class="plot-sel" hidden></div><div class="plot-acts"></div></div>' +
        '</div>' +
        '<div class="plot-tray" hidden>' +
          '<div class="plot-tbtns"><button class="btn" type="button" data-a="shop">🛒 Shop</button><button class="btn" type="button" data-a="house">🏠 House</button><button class="btn primary plot-doneBtn" type="button" data-a="done">✔ Done</button></div>' +
          '<div class="plot-tlabel"><span>📦 Storage</span><span class="plot-count"></span></div>' +
          '<div class="plot-tlist"></div>' +
        '</div>' +
      '</div>' +
      '<div class="plot-panel" hidden></div>';
    document.body.appendChild(root);
    function q(s) { return root.querySelector(s); }
    els = { streetBtn: q('[data-a="street"]'), street: q('.plot-street'), mailbar: q('.plot-mailbar'), homes: q('.plot-homes'), yard: q('.plot-yard'), stage: q('.plot-stage'),
      info: q('.plot-info'), sel: q('.plot-sel'), acts: q('.plot-acts'), tray: q('.plot-tray'), tlist: q('.plot-tlist'), count: q('.plot-count'), panel: q('.plot-panel') };
    cv = q('.plot-cv'); ctx = cv.getContext('2d');
    root.addEventListener('click', onClick);
    cv.addEventListener('pointerdown', cvDown); cv.addEventListener('pointermove', cvMove); cv.addEventListener('pointerup', cvUp); cv.addEventListener('pointercancel', cvUp);
    window.addEventListener('resize', onResize);
    view = 'street'; street = null; cards = {}; cardOrder = ''; cur = null; panel = null; others = {}; othersN = 0; fx = []; bgOk = false; lastTs = 0; trayStale = false;
    edit = { on: false, sel: 0, arm: null, armF: 0, drag: null };
    updateCoins(); renderStreet();
    raf = requestAnimationFrame(frame);
    api.enter('plot');
  }
  function close() {
    if (!root) return;
    cancelAnimationFrame(raf); raf = 0;
    window.removeEventListener('resize', onResize);
    if (stick) { stick.destroy(); stick = null; }
    if (root.parentNode) root.parentNode.removeChild(root);
    root = null; cv = null; ctx = null; bg = null; cur = null; street = null; els = {}; panel = null;
    api.leave();
  }
  // every button that is always there
  function onClick(e) {
    var t = e.target, a;
    while (t && t !== root && !(t.getAttribute && t.getAttribute('data-a'))) t = t.parentNode;
    if (!t || t === root || t.disabled) return;
    a = t.getAttribute('data-a');
    if (a === 'town') { api.sfx('close'); close(); }
    else if (a === 'street') goStreet();
    else if (a === 'collect') api.send({ t: 'plot.collect' });
    else if (a === 'shop') openPanel('shop');
    else if (a === 'house') openPanel('house');
    else if (a === 'done') setEdit(false);
    else if (a === 'edit') setEdit(true);
    else if (a === 'heart') { t.disabled = true; api.send({ t: 'plot.heart' }); }
    else if (a === 'flip') flipSel();
    else if (a === 'store') storeSel();
  }
  function updateCoins() {
    if (!root) return;
    var st = api.me(), list = root.querySelectorAll('.plot-coins b'), i;
    for (i = 0; i < list.length; i++) list[i].textContent = st ? st.coins : 0;
  }
  function myNums() { return api.me() || { coins: 0, lv: 1 }; }

  // ---------- Home Street: a card for every family home ----------
  function renderStreet() {
    if (!root || view !== 'street') return;
    var st = street, n, order, same;
    if (!st) { els.homes.innerHTML = '<p class="plot-wait">Looking down the street…</p>'; els.mailbar.hidden = true; cardOrder = ''; return; }
    n = st.mail || 0;
    els.mailbar.hidden = !(n > 0);
    if (n > 0) els.mailbar.firstChild.innerHTML = '📬 ' + n + ' new ❤️ for your home!&nbsp; ' + n + ' × ' + CAT.heartStars + ' = ' + (n * CAT.heartStars) + ' ⭐';
    order = st.homes.map(function (h) { return h.key; }).join('|');
    same = order === cardOrder && els.homes.children.length === st.homes.length;
    if (!same) els.homes.innerHTML = '';
    cardOrder = order;
    st.homes.forEach(function (h) {
      var lv = CAT.levels[(h.lv || 1) - 1] || { en: '', zh: '', py: '', ms: '' }, mine = h.key === st.me, b, pic, sig = JSON.stringify(h) + mine + RES, old = cards[h.key];
      if (old && old.sig === sig) { if (!same) els.homes.appendChild(old.el); return; }
      b = el('button', 'plot-home' + (mine ? ' me' : '')); pic = el('canvas');
      b.type = 'button'; b.setAttribute('data-quiet', ''); b.setAttribute('aria-label', 'Visit the home of ' + h.name);
      b.appendChild(pic);
      b.appendChild(el('span', 'plot-hn', '<i style="background:' + esc(hexOr(h.color, '#FF7A45')) + '"></i><b>' + esc(mine ? 'My home' : h.name) + '</b>' + (mine ? '<em>' + esc(h.name) + '</em>' : '') + '<u' + (h.online ? '' : ' class="off"') + '></u>'));
      b.appendChild(el('span', 'plot-ht', '<b>Lv ' + (h.lv || 1) + '</b>' + esc(lv.en)));
      b.appendChild(el('span', 'plot-h3', esc(lv.zh) + ' <span class="py">' + esc(lv.py) + '</span> · ' + esc(lv.ms)));
      b.appendChild(el('span', 'plot-hs', '<span>🏆 ' + (h.score || 0) + '</span><span>❤️ ' + (h.hearts || 0) + '</span>' + (h.here && h.here.length ? '<span>👣 ' + esc(h.here.join(', ')) + '</span>' : '')));
      b.onclick = function () { api.sfx('open'); api.send({ t: 'plot.visit', key: h.key }); };
      if (same && old && old.el.parentNode === els.homes) els.homes.replaceChild(b, old.el); else els.homes.appendChild(b);
      cards[h.key] = { sig: sig, el: b };
      try { drawStill(pic, readPlot(h), 300, 178); } catch (err) { if (window.console) console.error(err); }
    });
  }
  function goStreet() {
    if (!root) return;
    api.send({ t: 'plot.street' });
    view = 'street'; cur = null; panel = null;
    edit.on = false; edit.sel = 0; edit.arm = null; edit.drag = null;
    if (stick) { stick.destroy(); stick = null; }
    els.panel.hidden = true; els.panel.innerHTML = ''; els.yard.hidden = true; els.tray.hidden = true; els.street.hidden = false; els.streetBtn.hidden = true;
    renderStreet();
  }

  // ---------- inside a garden ----------
  function showPlot(m) {
    var same = view === 'plot' && cur && cur.key === m.key;
    cur = readPlot(m);
    if (!same) {
      view = 'plot'; panel = null; others = {}; othersN = 0; fx = [];
      edit.on = false; edit.sel = 0; edit.arm = null; edit.drag = null;
      me.x = SPAWN.x + (Math.random() - 0.5) * 220; me.y = SPAWN.y - Math.random() * 40; me.f = 1; me.m = 0;
      els.panel.hidden = true; els.panel.innerHTML = ''; els.street.hidden = true; els.tray.hidden = true; els.yard.hidden = false;
      if (stick) stick.destroy();
      stick = api.stick(cv);
      fit();
    }
    sent.t = 0; sent.x = -1;
    if (edit.sel && !placedN(edit.sel)) edit.sel = 0;
    if (m.sel && !edit.drag && !edit.arm && !edit.sel) edit.sel = m.sel;   // what I just put down is picked, unless I am busy with something else
    if (edit.arm && stockOf(cur, edit.arm) < 1) edit.arm = null;
    bgOk = false;
    renderHud();
    if (panel === 'house') renderHousePanel();
  }
  function placedN(n) { if (!cur) return null; for (var i = 0; i < cur.placed.length; i++) if (cur.placed[i].n === n) return cur.placed[i]; return null; }
  function fit() {
    if (!root || view !== 'plot' || !cv) return;
    var r = els.stage.getBoundingClientRect(), w = Math.max(240, Math.round(r.width)), h = Math.max(180, Math.round(r.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    L = layout(w, h, 70);
    setRes(L.s * dpr);
    bgOk = false;
  }
  function onResize() { fit(); if (panel === 'house') renderHouseBuy(); }
  function renderHud() {
    if (!root || view !== 'plot' || !cur) return;
    var lv = CAT.levels[cur.lv - 1] || { en: '' }, next = CAT.levels[cur.lv], html = '';
    els.streetBtn.hidden = edit.on || !!panel;
    els.info.hidden = edit.on; els.sel.hidden = !edit.on; els.acts.hidden = edit.on;
    els.info.innerHTML = '<i style="background:' + esc(cur.color) + '"></i><span>' + esc(cur.mine ? 'My home' : cur.name) + '</span><span class="plot-lv">Lv ' + cur.lv + '</span><span class="plot-ttl">' + esc(lv.en) + '</span>' +
      '<span>🏆 ' + cur.score + (cur.mine && next ? '<small> / ' + next.at + '</small>' : '') + '</span><span>❤️ ' + cur.hearts + '</span>';
    if (cur.mine) {
      if (cur.mail > 0) html += '<button class="btn plot-mailBtn" type="button" data-quiet data-a="collect">📬 +' + (cur.mail * CAT.heartStars) + ' ⭐</button>';
      html += '<button class="btn primary" type="button" data-a="edit">✏️ Decorate</button>';
    } else {
      html += '<button class="btn plot-heartBtn" type="button" data-quiet data-a="heart"' + (cur.canHeart ? '' : ' disabled') + '>' + (cur.canHeart ? '❤️ Give a heart' : '❤️ Given today') + '</button>';
    }
    els.acts.innerHTML = html;
    if (edit.on) { renderTray(); renderSel(); }
  }
  function setEdit(on) {
    if (!cur || !cur.mine) on = false;
    edit.on = on; edit.sel = 0; edit.arm = null; edit.drag = null;
    els.tray.hidden = !on;
    if (stick) { stick.destroy(); stick = null; }
    if (!on) stick = api.stick(cv);
    me.m = 0;
    fit(); renderHud();
  }

  // ----- decorating: the storage, picking things up, putting them down -----
  function renderTray() {
    if (!root || !cur) return;
    var box = els.tlist, any = false;
    if (edit.drag && edit.drag.kind === 'new') { trayStale = true; return; }   // the button under the finger must stay
    trayStale = false;
    els.count.textContent = cur.placed.length + ' / ' + CAT.max;
    box.innerHTML = '';
    CAT.order.forEach(function (id) {
      var n = stockOf(cur, id), it, b, pic;
      if (n < 1) return;
      any = true; it = itemOf(id);
      b = el('button', 'plot-ti' + (edit.arm === id ? ' on' : '')); b.type = 'button'; b.setAttribute('data-quiet', ''); b.setAttribute('data-id', id); b.setAttribute('aria-label', it.en);
      pic = el('canvas'); paintItem(pic, id, 70, 50); b.appendChild(pic);
      b.appendChild(el('span', '', esc(it.en)));
      b.appendChild(el('i', '', '×' + n));
      b.addEventListener('pointerdown', function (e) { trayDown(e, id, b); });
      b.addEventListener('pointermove', trayMove); b.addEventListener('pointerup', trayUp); b.addEventListener('pointercancel', trayCancel);
      box.appendChild(b);
    });
    if (!any) box.appendChild(el('div', 'plot-empty', 'Your storage is empty.<br>Tap 🛒 Shop to buy new things for your garden!'));
  }
  function renderSel() {
    if (!root || !cur || !edit.on) return;
    var o = edit.sel ? placedN(edit.sel) : null, it;
    if (o) {
      it = itemOf(o.i);
      els.sel.innerHTML = '<span>' + api.three(it) + '</span><button class="btn" type="button" data-a="flip">↔ Flip</button><button class="btn" type="button" data-a="store">📦 Put away</button>';
    } else if (edit.arm) {
      it = itemOf(edit.arm);
      els.sel.innerHTML = '<span>' + api.three(it) + '<br>Tap a spot in the garden to put it there.</span>';
    } else {
      els.sel.innerHTML = '<span>Tap a thing in 📦, then tap the garden (or drag it there). Tap a thing in the garden to move it, flip it or put it away.</span>';
    }
  }
  function toWorld(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left - L.ox) / L.s, y: (e.clientY - r.top - L.oy) / L.s, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom }; }
  // which placed thing is under this point: the picture first (front to back), then the tile
  function pick(wx, wy) {
    var list = cur.placed.filter(function (o) { return itemOf(o.i).cat !== 'ground'; }), i, o, it, b, X, Y, lx, ly, sp, tx = Math.floor(wx / TW), ty = Math.floor(wy / TH);
    list.sort(function (a, b2) { return (b2.y + itemOf(b2.i).h) - (a.y + itemOf(a.i).h) || b2.x - a.x; });
    for (i = 0; i < list.length; i++) {
      o = list[i]; it = itemOf(o.i); b = boxOf(o.i); X = (o.x + it.w / 2) * TW; Y = (o.y + it.h) * TH; lx = wx - X; ly = wy - Y;
      if (lx < b.x || ly < b.y || lx > b.x + b.w || ly > b.y + b.h) continue;
      try {
        sp = itemSprite(o.i, o.f, 's');
        if (sp.getContext('2d').getImageData(Math.floor((lx - b.x) * RES), Math.floor((ly - b.y) * RES), 1, 1).data[3] > 110) return o;
      } catch (err) {}
    }
    for (i = 0; i < list.length; i++) { o = list[i]; it = itemOf(o.i); if (tx >= o.x && tx < o.x + it.w && ty >= o.y && ty < o.y + it.h) return o; }
    for (i = cur.placed.length - 1; i >= 0; i--) { o = cur.placed[i]; if (itemOf(o.i).cat === 'ground' && tx === o.x && ty === o.y) return o; }
    return null;
  }
  function dragTo(d, w) {
    var it = itemOf(d.id);
    d.over = w.inside;
    d.tx = clamp(Math.round(w.x / TW - d.gx), 0, GW - it.w); d.ty = clamp(Math.round(w.y / TH - d.gy), 0, GH - it.h);
    d.ok = w.inside && fitsAt(cur, d.id, d.tx, d.ty, d.n || 0);
  }
  function cvDown(e) {
    if (!edit.on || !cur || panel) return;
    if (edit.drag) { if (e.isPrimary === false) return; edit.drag = null; }
    var w = toWorld(e), o, it, tx, ty;
    if (edit.arm) {
      it = itemOf(edit.arm); tx = clamp(Math.floor(w.x / TW - (it.w - 1) / 2), 0, GW - it.w); ty = clamp(Math.floor(w.y / TH - (it.h - 1) / 2), 0, GH - it.h);
      if (w.x > -30 && w.x < PW + 30 && w.y > -30 && w.y < PH + 30 && fitsAt(cur, edit.arm, tx, ty, 0)) { tryPlace(edit.arm, tx, ty, edit.armF); return; }
    }
    o = pick(w.x, w.y);
    if (o) {
      edit.sel = o.n; edit.arm = null;
      edit.drag = { kind: 'move', pid: e.pointerId, id: o.i, n: o.n, f: o.f, gx: w.x / TW - o.x, gy: w.y / TH - o.y, sx: e.clientX, sy: e.clientY, moved: false, tx: o.x, ty: o.y, ok: true, over: true };
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      api.sfx('tap'); renderTray(); renderSel();
    } else if (edit.arm) api.sfx('deny');   // it does not fit there
    else if (edit.sel) { edit.sel = 0; renderSel(); }
  }
  function cvMove(e) {
    var d = edit.drag;
    if (!d || d.kind !== 'move' || d.pid !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 10) return;
    d.moved = true; dragTo(d, toWorld(e));
  }
  function cvUp(e) {
    var d = edit.drag, o;
    if (!d || d.kind !== 'move' || d.pid !== e.pointerId) return;
    edit.drag = null;
    o = placedN(d.n);
    if (!d.moved || !o || e.type === 'pointercancel') return;
    if (!d.over) { storeSel(); return; }                            // let go over the storage: put it away
    if (d.tx === o.x && d.ty === o.y) return;
    if (!d.ok) { api.sfx('deny'); return; }
    o.x = d.tx; o.y = d.ty; prep(cur); bgOk = false;
    api.sfx('right'); spark((o.x + itemOf(o.i).w / 2) * TW, (o.y + itemOf(o.i).h) * TH - 20);
    api.send({ t: 'plot.move', n: o.n, x: o.x, y: o.y });
  }
  function trayDown(e, id, btn) {
    if (!cur) return;
    if (edit.drag) { if (e.isPrimary === false) return; edit.drag = null; }   // a second finger is ignored; a drag whose end was never seen is dropped
    var it = itemOf(id);
    edit.drag = { kind: 'new', pid: e.pointerId, id: id, n: 0, f: 0, gx: it.w / 2, gy: it.h / 2 + (e.pointerType === 'touch' ? 0.5 : 0), sx: e.clientX, sy: e.clientY, moved: false, tx: 0, ty: 0, ok: false, over: false, btn: btn };
    try { btn.setPointerCapture(e.pointerId); } catch (err) {}
  }
  function trayMove(e) {
    var d = edit.drag;
    if (!d || d.kind !== 'new' || d.pid !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 12) return;
    if (!d.moved) { d.moved = true; edit.sel = 0; edit.arm = null; markArm(); renderSel(); }
    dragTo(d, toWorld(e));
  }
  function trayUp(e) {
    var d = edit.drag;
    if (!d || d.kind !== 'new' || d.pid !== e.pointerId) return;
    edit.drag = null;
    if (!d.moved) {                                                  // a tap: hold this thing ready, the next tap in the garden puts it down
      edit.arm = edit.arm === d.id ? null : d.id; edit.armF = 0; edit.sel = 0;
      api.sfx('tap'); markArm(); renderSel();
    } else if (d.over) tryPlace(d.id, d.tx, d.ty, 0);
    if (trayStale) renderTray();
  }
  function trayCancel(e) { var d = edit.drag; if (d && d.kind === 'new' && d.pid === e.pointerId) { edit.drag = null; if (trayStale) renderTray(); } }
  function markArm() {
    var list = els.tlist ? els.tlist.children : [], i;
    for (i = 0; i < list.length; i++) if (list[i].getAttribute('data-id')) list[i].className = 'plot-ti' + (edit.arm === list[i].getAttribute('data-id') ? ' on' : '');
  }
  function tryPlace(id, tx, ty, f) {
    if (!cur || stockOf(cur, id) < 1) return;
    if (cur.placed.length >= CAT.max) { api.sfx('deny'); api.toast('Your garden is full: ' + CAT.max + ' things. Put something away first.'); return; }
    if (!fitsAt(cur, id, tx, ty, 0)) { api.sfx('deny'); return; }
    cur.placed.push({ n: -Date.now(), i: id, x: tx, y: ty, f: f ? 1 : 0 });   // shown at once; the server's answer replaces it
    prep(cur); bgOk = false;
    api.sfx('right'); spark((tx + itemOf(id).w / 2) * TW, (ty + itemOf(id).h) * TH - 20);
    api.send({ t: 'plot.place', id: id, x: tx, y: ty, f: f ? 1 : 0 });
    if (stockOf(cur, id) < 1) edit.arm = null;
    renderTray(); renderSel();
  }
  function flipSel() {
    var o = placedN(edit.sel);
    if (!o) return;
    o.f = o.f ? 0 : 1; prep(cur); bgOk = false;
    if (o.n > 0) api.send({ t: 'plot.move', n: o.n, x: o.x, y: o.y, f: o.f });
  }
  function storeSel() {
    var o = placedN(edit.sel), i;
    if (!o) return;
    i = cur.placed.indexOf(o); cur.placed.splice(i, 1); prep(cur); bgOk = false;
    edit.sel = 0;
    if (o.n > 0) api.send({ t: 'plot.store', n: o.n });
    api.sfx('tap'); renderTray(); renderSel();
  }

  // ----- the garden shop -----
  function openPanel(which) {
    if (!cur || !cur.mine) return;
    panel = which; els.panel.hidden = false; els.streetBtn.hidden = true;
    shopSt.sel = null; shopSt.msg = ''; shopSt.busy = false; houseSt.s = cur.house.s; houseSt.msg = ''; houseSt.busy = false;
    if (which === 'shop') buildShop(); else buildHouse();
  }
  function closePanel() {
    panel = null; els.panel.hidden = true; els.panel.innerHTML = '';
    bgOk = false; renderHud();
  }
  function panelHead(inner) {
    var head = el('div', 'plot-ph'), done = el('button', 'btn primary', 'Done');
    head.appendChild(inner);
    head.appendChild(el('span', 'pill plot-coins', '<span class="ico">⭐</span><b>' + myNums().coins + '</b>'));
    done.type = 'button'; done.setAttribute('data-quiet', ''); done.onclick = function () { api.sfx('close'); closePanel(); };
    head.appendChild(done);
    return head;
  }
  function priceTag(it, owned) {
    var st = myNums();
    if (owned) return '<em class="plot-price own">✔</em>';
    if (st.lv < it.lv) return '<em class="plot-price lock">🔒 Lv ' + it.lv + '</em>';
    return '<em class="plot-price">⭐ ' + it.cost + (it.pack > 1 ? ' <small>×' + it.pack + '</small>' : '') + '</em>';
  }
  function buildShop() {
    var P = els.panel, tabs = el('div', 'plot-tabs'), grid = el('div', 'plot-grid'), ct = CATS[0], wide = window.innerWidth >= 1000 && window.innerHeight >= 600;
    P.innerHTML = '';
    CATS.forEach(function (q) {
      var b = el('button', 'plot-tab' + (q.id === shopSt.cat ? ' on' : '')), pc = el('canvas');
      b.type = 'button'; b.setAttribute('aria-label', q.en);
      paintItem(pc, q.pic, 40, 36); b.appendChild(pc); b.appendChild(el('span', '', q.en));
      b.onclick = function () { shopSt.cat = q.id; shopSt.sel = null; shopSt.msg = ''; buildShop(); };
      tabs.appendChild(b);
      if (q.id === shopSt.cat) ct = q;
    });
    P.appendChild(panelHead(tabs));
    P.appendChild(el('div', 'plot-catname', '🛒 Garden shop · ' + api.three(ct)));
    CAT.order.forEach(function (id) {
      var it = CAT.items[id], b, pc, have;
      if (!it || it.cat !== shopSt.cat) return;
      have = cur.inv[id] || 0;
      b = el('button', 'plot-card plot-r' + (it.rare || 0) + (shopSt.sel === id ? ' on' : '')); b.type = 'button'; b.setAttribute('data-id', id);
      pc = el('canvas'); paintItem(pc, id, wide ? 128 : 104, wide ? 92 : 76); b.appendChild(pc);
      b.appendChild(el('b', '', esc(it.en)));
      b.appendChild(el('span', '', esc(it.zh) + ' <span class="py">' + esc(it.py) + '</span>'));
      b.appendChild(el('span', '', esc(it.ms)));
      b.insertAdjacentHTML('beforeend', priceTag(it, false) + (have ? '<i class="plot-have">📦 ' + have + '</i>' : ''));
      b.onclick = function () {
        var list = grid.children, i;
        shopSt.sel = id; shopSt.msg = '';
        for (i = 0; i < list.length; i++) list[i].classList.toggle('on', list[i] === b);
        renderBuy();
      };
      grid.appendChild(b);
    });
    P.appendChild(grid);
    els.buyBar = el('div', 'plot-buy'); P.appendChild(els.buyBar);
    renderBuy();
  }
  // the bar under the shop: the name in three languages, the sum, the Buy button
  function buyHtml(it, st, msg, okMsg) {
    var html = '<div class="plot-btxt"><div class="plot-bname">' + api.three(it) + (it.rare ? ' <span class="plot-tag plot-t' + it.rare + '">' + RARE[it.rare] + '</span>' : '') + '</div>';
    if (st.lv < it.lv) html += '<div class="plot-bmsg">🔒 For level ' + it.lv + '. You are level ' + st.lv + '.</div>';
    else if (st.coins < it.cost) html += '<div class="plot-bsum">' + it.cost + ' − ' + st.coins + ' = ' + (it.cost - st.coins) + ' more ⭐ to find</div>';
    else html += '<div class="plot-bsum">⭐ ' + st.coins + ' − ' + it.cost + ' = ' + (st.coins - it.cost) + ' left</div>';
    if (okMsg) html += '<div class="plot-bmsg ok">' + okMsg + '</div>';
    else if (msg) html += '<div class="plot-bmsg">' + msg + '</div>';
    return html + '</div>';
  }
  function buyButton(bar, id, it, st, state) {
    var b;
    if (st.lv < it.lv) return;   // not for this level yet: nothing to press
    b = el('button', 'btn primary' + (st.coins < it.cost ? ' plot-dim' : ''), state.busy ? 'Buying…' : 'Buy ⭐ ' + it.cost);
    b.type = 'button'; b.setAttribute('data-quiet', ''); b.disabled = !!state.busy;
    b.onclick = function () {
      var now = myNums();
      if (now.lv < it.lv || now.coins < it.cost) { api.sfx('deny'); bar.classList.remove('plot-shake'); void bar.offsetWidth; bar.classList.add('plot-shake'); return; }
      state.busy = true; b.disabled = true; b.textContent = 'Buying…';
      api.send({ t: 'plot.buy', id: id });
      setTimeout(function () { if (state.busy) { state.busy = false; if (panel === 'shop') renderBuy(); else if (panel === 'house') renderHouseBuy(); } }, 4000);   // no answer: the connection dropped
    };
    bar.appendChild(b);
  }
  function renderBuy() {
    var bar = els.buyBar, id = shopSt.sel, it, st = myNums(), pc;
    if (!bar || panel !== 'shop') return;
    if (!id || !CAT.items[id]) { bar.innerHTML = '<span class="plot-hint">Tap a thing to see its price. What you buy goes into your storage 📦, and it is yours for good.</span>'; return; }
    it = CAT.items[id];
    bar.innerHTML = '';
    pc = el('canvas'); paintItem(pc, id, 70, 56); bar.appendChild(pc);
    bar.insertAdjacentHTML('beforeend', buyHtml(it, st, shopSt.about === id ? shopSt.err : '', shopSt.about === id ? shopSt.msg : ''));
    buyButton(bar, id, it, st, shopSt);
  }
  function onBought(m) {
    var isHouse = String(m.id).indexOf('house.') === 0, it = isHouse ? CAT.styles[parseInt(String(m.id).slice(6), 10)] : CAT.items[m.id], state = isHouse ? houseSt : shopSt, why, card, tag;
    state.busy = false; state.err = ''; state.msg = ''; state.about = m.id;
    if (cur && cur.mine) { if (m.inv) cur.inv = m.inv; if (m.styles) cur.styles = m.styles; }
    if (m.ok) {
      api.sfx('buy');
      state.msg = isHouse ? 'It is yours! 🎉' : (it && it.pack > 1 ? it.pack + ' pieces are in your storage 📦' : 'It is in your storage 📦');
      if (isHouse && cur) {   // a new house style is put on straight away
        cur.house.s = parseInt(String(m.id).slice(6), 10); houseSt.s = cur.house.s; bgOk = false;
        sendHouse();
      }
    } else {
      api.sfx('deny');
      why = { stars: 'Not enough stars yet.', level: 'Your level is not high enough yet.', full: 'You have plenty of these already.', owned: 'You already have this.' }[m.why];
      state.err = why || 'That did not work. Try again.';
    }
    if (panel === 'shop') {
      card = els.panel.querySelector('.plot-card[data-id="' + m.id + '"]');
      if (card && m.ok && cur) { tag = card.querySelector('.plot-have'); if (!tag) { tag = el('i', 'plot-have'); card.appendChild(tag); } tag.textContent = '📦 ' + (cur.inv[m.id] || 0); }
      renderBuy();
    } else if (panel === 'house') renderHousePanel();
    if (edit.on) renderTray();
  }

  // ----- the house: style and colours -----
  function styleOwned(s) { var st = CAT.styles[s]; return !!st && (st.cost === 0 || (cur && cur.styles.indexOf(s) >= 0)); }
  function sendHouse() { api.send({ t: 'plot.house', s: cur.house.s, wall: cur.house.wall, roof: cur.house.roof, door: cur.house.door }); }
  function buildHouse() {
    var P = els.panel, body = el('div', 'plot-hbody'), left = el('div', 'plot-hleft'), right = el('div', 'plot-hright');
    P.innerHTML = '';
    P.appendChild(panelHead(el('h2', '', 'My house<small>我的房子 <span class="py">wǒ de fángzi</span> · Rumah saya</small>')));
    els.hprev = el('div', 'plot-hprev'); els.hprev.appendChild(el('canvas'));
    els.hbuy = el('div', 'plot-buy plot-hbuy');
    left.appendChild(els.hprev); left.appendChild(els.hbuy);
    els.hright = right;
    body.appendChild(left); body.appendChild(right); P.appendChild(body);
    renderHousePanel();
  }
  function renderHousePanel() {
    if (!root || panel !== 'house' || !cur || !els.hright) return;
    var right = els.hright, row, top = right.scrollTop, small = window.innerWidth < 1000 || window.innerHeight < 600;
    right.innerHTML = '';
    right.appendChild(el('div', 'plot-lbl', 'Style'));
    row = el('div', 'plot-row');
    CAT.styles.forEach(function (st, s) {
      var b = el('button', 'plot-sty plot-r' + (st.rare || 0) + (houseSt.s === s ? ' on' : '')), pc = el('canvas');
      b.type = 'button'; b.setAttribute('aria-label', st.en);
      paintHouse(pc, { s: s, wall: cur.house.wall, roof: cur.house.roof, door: cur.house.door }, small ? 64 : 88, small ? 48 : 66); b.appendChild(pc);
      b.appendChild(el('span', '', esc(st.en)));
      b.insertAdjacentHTML('beforeend', priceTag({ lv: st.lv, cost: st.cost, pack: 1 }, styleOwned(s)));
      b.onclick = function () {
        houseSt.s = s; houseSt.msg = ''; houseSt.err = '';
        if (styleOwned(s) && cur.house.s !== s) { cur.house.s = s; bgOk = false; sendHouse(); }
        renderHousePanel();
      };
      row.appendChild(b);
    });
    right.appendChild(row);
    [['Walls', 'wall', WALLS], ['Roof', 'roof', ROOFS], ['Door', 'door', DOORS]].forEach(function (q) {
      right.appendChild(el('div', 'plot-lbl', q[0]));
      row = el('div', 'plot-row');
      q[2].forEach(function (col) {
        var b = el('button', 'sw' + (cur.house[q[1]].toUpperCase() === col ? ' on' : ''));
        b.type = 'button'; b.style.background = col; b.setAttribute('aria-label', q[0] + ' ' + col);
        b.onclick = function () { cur.house[q[1]] = col; bgOk = false; sendHouse(); renderHousePanel(); };
        row.appendChild(b);
      });
      right.appendChild(row);
    });
    right.scrollTop = top;
    renderHouseBuy();
  }
  function renderHouseBuy() {
    if (!root || panel !== 'house' || !cur || !els.hbuy) return;
    var s = houseSt.s, st = CAT.styles[s] || CAT.styles[0], bar = els.hbuy, r = els.hprev.getBoundingClientRect(), nums = myNums();
    paintHouse(els.hprev.firstChild, { s: s, wall: cur.house.wall, roof: cur.house.roof, door: cur.house.door }, Math.max(120, Math.floor(r.width - 12)), Math.max(90, Math.floor(r.height - 12)));
    bar.innerHTML = '';
    if (!st) return;
    if (styleOwned(s)) bar.innerHTML = '<div class="plot-btxt"><div class="plot-bname">' + api.three(st) + (st.rare ? ' <span class="plot-tag plot-t' + st.rare + '">' + RARE[st.rare] + '</span>' : '') + '</div><div class="plot-bmsg ok">' + (houseSt.about === 'house.' + s && houseSt.msg ? houseSt.msg : 'This is your house. Pick its colours!') + '</div></div>';
    else { bar.insertAdjacentHTML('beforeend', buyHtml(st, nums, houseSt.about === 'house.' + s ? houseSt.err : '', '')); buyButton(bar, 'house.' + s, st, nums, houseSt); }
  }

  // ---------- effects ----------
  function spark(x, y) { fx.push({ k: 's', x: x, y: y, t0: 0 }); }
  function heartPath(c, x, y, r) { c.beginPath(); c.moveTo(x, y + r * 0.9); c.bezierCurveTo(x - r * 1.6, y - r * 0.1, x - r * 0.8, y - r * 1.3, x, y - r * 0.45); c.bezierCurveTo(x + r * 0.8, y - r * 1.3, x + r * 1.6, y - r * 0.1, x, y + r * 0.9); c.closePath(); }
  function drawFx(c, t) {
    var i, f, k, j, a;
    for (i = fx.length - 1; i >= 0; i--) {
      f = fx[i]; if (!f.t0) f.t0 = t;
      k = (t - f.t0) / (f.k === 'h' ? 2.6 : 0.6);
      if (k >= 1) { fx.splice(i, 1); continue; }
      if (f.k === 's') { for (j = 0; j < 6; j++) { a = j * TAU / 6 + 0.4; twinkle(c, f.x + Math.cos(a) * (14 + k * 38), f.y + Math.sin(a) * (10 + k * 26), 9 * (1 - k)); } }
      else {
        for (j = 0; j < 14; j++) {
          a = (k * 1.3 - j * 0.045); if (a < 0 || a > 1) continue;
          c.globalAlpha = Math.min(1, (1 - a) * 2.5);
          heartPath(c, PW * (0.12 + 0.76 * rnd(j + 5)) + Math.sin(a * 9 + j) * 14, PH * (0.9 - 0.75 * rnd(j + 40)) - a * 150, 13 + rnd(j) * 9);
          c.fillStyle = j % 3 ? '#FF4F6D' : '#FF8FB8'; c.fill(); c.lineWidth = 3; c.strokeStyle = NAVY; c.stroke();
        }
        c.globalAlpha = 1;
      }
    }
  }

  // ---------- walking, and one frame ----------
  function blockedAt(x, y) {
    var tx = Math.floor(x / TW), ty = Math.floor(y / TH);
    return tx < 0 || ty < 0 || tx >= GW || ty >= GH || !!cur.block[ty * GW + tx];
  }
  function standOn(x, y) {
    for (var i = 0; i < cur.spots.length; i++) { var s = cur.spots[i], dx = (x - s.x) / 50, dy = (y - s.y) / 28; if (dx * dx + dy * dy < 1) return s.k; }
    return null;
  }
  function step(dt, now) {
    var v = stick && !edit.on && !panel ? stick.read() : { x: 0, y: 0 }, nx, ny, id, o;
    me.m = (v.x || v.y) ? 1 : 0;
    if (me.m) {
      if (v.x > 0.15) me.f = 1; else if (v.x < -0.15) me.f = -1;
      nx = clamp(me.x + v.x * 250 * dt, 14, PW - 14); ny = clamp(me.y + v.y * 220 * dt, 8, PH - 5);
      if (blockedAt(me.x, me.y) || !blockedAt(nx, ny)) { me.x = nx; me.y = ny; }   // already inside something (it was put on top of me): walk out freely
      else if (!blockedAt(nx, me.y)) me.x = nx;
      else if (!blockedAt(me.x, ny)) me.y = ny;
    }
    if (now - sent.t > 100 && (Math.abs(me.x - sent.x) > 0.5 || Math.abs(me.y - sent.y) > 0.5 || me.m !== sent.m || me.f !== sent.f)) {
      sent.t = now; sent.x = me.x; sent.y = me.y; sent.m = me.m; sent.f = me.f;
      api.send({ t: 'plot.pos', x: Math.round(me.x), y: Math.round(me.y), f: me.f, m: me.m });
    }
    if (othersN && now - stAt > 700) { others = {}; othersN = 0; }   // alone in the garden: the server sends no positions
    for (id in others) { o = others[id]; o.x += (o.tx - o.x) * Math.min(1, dt * 14); o.y += (o.ty - o.y) * Math.min(1, dt * 14); }
  }
  function avatar(list, p, a, t) {
    var on = standOn(a.x, a.y), lift = 0, moving = !!a.m;
    if (on === 'trampoline') { lift = -(12 + Math.abs(Math.sin(t * 5.2 + (p.id || 0) * 1.3)) * 46); moving = false; }
    else if (on === 'pool') lift = -6;
    a.lift = lift;
    list.push({ y: a.y, x: a.x, d: function (c) {
      var k;
      ell(c, a.x, a.y + (on ? -10 : 0), lift < -24 ? 17 : 24, lift < -24 ? 5 : 7); c.fillStyle = 'rgba(27,42,73,0.18)'; c.fill();
      a.h = api.drawAvatar(c, p, a.x, a.y + lift, t, { scale: AV, facing: a.f, moving: moving }) || 80;
      if (on === 'pool') {
        c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 2.5; k = (t * 1.2 + (p.id || 0) * 0.3) % 1;
        c.globalAlpha = 1 - k; ell(c, a.x, a.y + lift + 1, 18 + k * 14, 6 + k * 5); c.stroke(); c.globalAlpha = 1;
        ell(c, a.x, a.y + lift + 1, 20, 6.5); c.fillStyle = 'rgba(124,203,255,0.75)'; c.fill();
      }
    } });
  }
  function frame(ts) {
    if (!root) return;
    raf = requestAnimationFrame(frame);
    var t = ts / 1000, dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;
    if (view !== 'plot' || !cur || !L) return;
    step(dt, ts);
    if (panel) return;   // the garden is behind the shop
    draw(t);
  }
  function draw(t) {
    var c = ctx, s = L.s * dpr, list, d = edit.drag && edit.drag.moved ? edit.drag : null, P = api.players(), myId = api.myId(), id, o, it, i, X, Y, b, tags = [], p;
    if (!bg) bg = document.createElement('canvas');
    if (bg.width !== cv.width || bg.height !== cv.height) { bg.width = cv.width; bg.height = cv.height; bgOk = false; }
    if (!bgOk) { drawGround(bg.getContext('2d'), cur, L, dpr, edit.on); bgOk = true; }
    c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(bg, 0, 0);
    c.setTransform(s, 0, 0, s, L.ox * dpr, L.oy * dpr);
    c.lineJoin = 'round'; c.lineCap = 'round';
    list = d && d.n ? cur.list.filter(function (e) { return e.n !== d.n; }) : cur.list.slice();
    p = api.self();
    if (p) { avatar(list, p, me, t); tags.push([p, me, true]); }
    for (id in others) { p = P[id]; if (p && +id !== myId) { avatar(list, p, others[id], t); tags.push([p, others[id], false]); } }
    list.sort(byDepth);
    if (edit.on && edit.sel && !d) {   // the picked thing: a yellow frame around its tiles
      o = placedN(edit.sel);
      if (o) { it = itemOf(o.i); rr(c, o.x * TW + 2, o.y * TH + 2, it.w * TW - 4, it.h * TH - 4, 8); c.fillStyle = 'rgba(255,214,107,' + (0.35 + 0.15 * Math.sin(t * 6)) + ')'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#FFD66B'; c.stroke(); c.lineWidth = 1.5; c.strokeStyle = NAVY; c.stroke(); }
    }
    for (i = 0; i < list.length; i++) list[i].d(c, t);
    if (d && d.over) {   // the thing being dragged: green where it fits, red where it does not
      it = itemOf(d.id); X = (d.tx + it.w / 2) * TW; Y = (d.ty + it.h) * TH; b = boxOf(d.id);
      rr(c, d.tx * TW + 2, d.ty * TH + 2, it.w * TW - 4, it.h * TH - 4, 8); c.fillStyle = d.ok ? 'rgba(255,255,255,0.55)' : 'rgba(255,79,109,0.6)'; c.fill();
      c.globalAlpha = 0.85; drawItem(c, d.id, X, Y - 6, d.f, t); c.globalAlpha = 1;
      rr(c, d.tx * TW + 2, d.ty * TH + 2, it.w * TW - 4, it.h * TH - 4, 8); c.lineWidth = 4; c.strokeStyle = d.ok ? '#2E7A3C' : '#B3122F'; c.stroke(); c.lineWidth = 1.5; c.strokeStyle = '#fff'; c.stroke();
    }
    drawFx(c, t);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (i = 0; i < tags.length; i++) { o = tags[i][1]; tags[i].push(L.ox + o.x * L.s, L.oy + (o.y + (o.lift || 0) - (o.h || 80)) * L.s - 6); }
    tags.sort(function (a, b2) { return b2[4] - a[4]; });
    for (i = 0; i < tags.length; i++) {
      for (X = 0; X < i; X++) if (Math.abs(tags[i][3] - tags[X][3]) < 96 && tags[i][4] > tags[X][4] - 31) tags[i][4] = tags[X][4] - 31;
      api.nameTag(c, tags[i][0], tags[i][3], Math.max(30, tags[i][4]), tags[i][2]);
    }
    if (stick) stick.draw(c);
  }

  // ---------- messages from the server ----------
  function onMessage(m) {
    var i, q, seen, o, lv;
    if (m.t === 'plot.hello') {
      boxes = {};
      CAT = { items: m.items || {}, order: m.order || [], styles: m.styles || [], levels: m.levels || [], max: m.max || 60, maxStock: m.maxStock || 48, heartStars: m.heartStars || 2 };
      if (root && view === 'plot' && cur) api.send({ t: 'plot.visit', key: cur.key });   // back after a dropped connection: walk into the same garden again
      return;
    }
    if (!root) return;
    switch (m.t) {
      case 'plot.street':
        street = m;
        if (view === 'street') renderStreet();
        break;
      case 'plot.plot': showPlot(m); break;
      case 'plot.st':
        seen = {}; stAt = performance.now(); othersN = m.p.length;
        for (i = 0; i < m.p.length; i++) {
          q = m.p[i]; seen[q[0]] = 1; o = others[q[0]];
          if (!o) o = others[q[0]] = { x: q[1], y: q[2], h: 80, lift: 0 };
          o.tx = q[1]; o.ty = q[2]; o.f = q[3]; o.m = q[4];
        }
        for (q in others) if (!seen[q]) delete others[q];
        break;
      case 'plot.bought': onBought(m); break;
      case 'plot.no':
        api.sfx('deny');
        if (m.why === 'spot') api.toast('Something is already there.');
        else if (m.why === 'full') api.toast('Your garden is full: ' + CAT.max + ' things.');
        else if (m.why === 'heart') api.toast('You already gave a heart here today. Come back tomorrow!');
        break;
      case 'plot.fx':
        if (m.k === 'heart' && view === 'plot') { fx.push({ k: 'h', t0: 0 }); api.sfx('star'); api.toast('❤️ ' + (m.name || 'Someone') + ' gave this home a heart!'); }
        break;
      case 'plot.mail':
        api.sfx('claim');
        api.toast('📬 ' + m.n + ' ❤️ × ' + CAT.heartStars + ' = ' + m.stars + ' ⭐ for you!');
        break;
      case 'plot.lvup':
        lv = CAT.levels[m.lv - 1] || { en: '', zh: '' };
        api.sfx('levelup');
        api.toast('🏡 Home level ' + m.lv + ': ' + lv.en + ' · ' + lv.zh + '!' + (m.stars ? ' +' + m.stars + ' ⭐' : ''));
        break;
    }
  }

  window.FTGames = window.FTGames || {};
  window.FTGames.plot = {
    init: function (a) { api = a; },
    open: open,
    onMessage: onMessage,
    onMe: function () {
      if (!root) return;
      updateCoins();
      if (panel === 'shop') renderBuy(); else if (panel === 'house') renderHouseBuy();
    }
  };
})();
