// Race Track (client): a side-view lane racer with the cars designed in the Car Garage.
// The road scrolls sideways with 4 lanes stacked in depth. The car drives by itself; the player changes lane
// (drag up or down, the two arrow buttons, or the arrow keys) and presses BOOST once three bolts are collected.
// Server part: dev/games/race.js. The block marked "shared" must stay the same in both files.
(function () {
  'use strict';
  var api = null, root = null, Car = null;
  var NAVY = '#1B2A49', TAU = Math.PI * 2, SH = 'rgba(22,48,66,0.20)';
  var FONT = "Fredoka, 'Baloo 2', 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";

  // ---------- shared with dev/games/race.js: keep both copies the same ----------
  var V0 = 460;          // cruising speed in track units a second (a car is about 125 units long)
  var BOOST_K = 1.55;    // speed while boosting
  var PAD_K = 1.35;      // speed on a boost pad
  var ACC = 300;         // how fast a car picks up speed
  var AIR_T = 0.95;      // seconds in the air after a ramp
  var BOOST_T = 2.2;     // seconds a boost lasts
  // one line per track: length, the gap between two groups of things, the chance of each kind of group
  // (what is left is a ramp), how mean the trouble is, and the mix of cone / puddle / oil (the rest: barrier)
  var GEN = [
    { id: 'town', len: 30000, g0: 560, g1: 820, haz: 0.38, bolt: 0.22, coin: 0.18, pad: 0.10, hard: 0, mix: [0.45, 0.80, 0.90] },
    { id: 'beach', len: 32000, g0: 480, g1: 720, haz: 0.46, bolt: 0.21, coin: 0.14, pad: 0.09, hard: 1, mix: [0.35, 0.60, 0.80] },
    { id: 'night', len: 34000, g0: 410, g1: 620, haz: 0.54, bolt: 0.20, coin: 0.11, pad: 0.07, hard: 2, mix: [0.30, 0.45, 0.70] }
  ];
  var HW = { cone: 24, oil: 58, puddle: 60, barrier: 30, bolt: 30, coin: 26, pad: 75, ramp: 45 }; // half lengths along the road
  function rng(seed) { // mulberry32: the same numbers on the server and on every tablet
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // The course: a list of { k: kind, x: place along the road, l: lane 0 (far) .. 3 (near), a: 1 = up in the air }.
  // Kinds: cone, puddle, oil, barrier (trouble), bolt (fills the boost), coin (star token), pad (boost pad), ramp.
  function makeTrack(ti, seed) {
    var T = GEN[ti] || GEN[0], r = rng(seed), out = [], x = 1500, n = 0, lastBolt = -1;
    var q, l, l2, ext, pat, i, dir, free;
    function ri(k) { return Math.floor(r() * k); }
    function add(k, px, lane, air) { out.push({ k: k, x: Math.round(px), l: lane, a: air ? 1 : 0 }); }
    function hazard() { var h = r(); return h < T.mix[0] ? 'cone' : h < T.mix[1] ? 'puddle' : h < T.mix[2] ? 'oil' : 'barrier'; }
    function other(lane) { var o = ri(3); return o >= lane ? o + 1 : o; }
    function next(lane) { return lane < 3 ? lane + 1 : lane - 1; }
    while (x < T.len - 1500) {
      q = r(); l = ri(4); ext = 0;
      if (n - lastBolt > 3) q = T.haz + 0.0001;                           // never a long stretch without a bolt
      if (q < T.haz) {
        pat = r();
        if (pat < 0.32) {                                                 // one thing in the way, sometimes a bolt beside it
          add(hazard(), x, l);
          if (r() < 0.35) add('bolt', x, other(l));
        } else if (pat < 0.52) {                                          // a row of cones
          for (i = 0; i < 3; i++) add('cone', x + i * 95, l);
          ext = 190;
        } else if (pat < 0.74) {                                          // two things in two lanes
          add(hazard(), x, l); add(hazard(), x + (T.hard ? 0 : 150), other(l));
          ext = T.hard ? 0 : 150;
        } else if (pat < 0.88) {                                          // slalom
          l2 = next(l);
          add('cone', x, l); add('cone', x + 340, l2); add('cone', x + 680, l);
          ext = 680;
        } else {                                                          // a wall: one lane, or two on the harder tracks
          l2 = next(l);
          add('barrier', x, l);
          if (T.hard) add('barrier', x, l2);
          if (T.hard > 1 && r() < 0.5) {
            free = [];
            for (i = 0; i < 4; i++) if (i !== l && i !== l2) free.push(i);
            add('cone', x, free[ri(2)]);
          }
        }
      } else if (q < T.haz + T.bolt) {
        add('bolt', x, l); lastBolt = n;
      } else if (q < T.haz + T.bolt + T.coin) {                           // a line of star tokens, straight or across the lanes
        dir = ri(3) - 1;
        for (i = 0; i < 5; i++) {
          l2 = l + dir * Math.floor(i / 2);
          add('coin', x + i * 110, l2 < 0 ? 0 : l2 > 3 ? 3 : l2);
        }
        ext = 440;
      } else if (q < T.haz + T.bolt + T.coin + T.pad) {                   // a boost pad with tokens behind it
        add('pad', x, l);
        for (i = 0; i < 3; i++) add('coin', x + 260 + i * 110, l);
        ext = 480;
      } else {                                                            // a ramp: tokens in the air, trouble underneath
        add('ramp', x, l);
        add('coin', x + 120, l, 1); add('coin', x + 210, l, 1); add('coin', x + 300, l, 1);
        add(r() < 0.5 ? 'puddle' : 'cone', x + 230, l);
        ext = 520;
      }
      n++;
      x += ext + T.g0 + r() * (T.g1 - T.g0);
    }
    out.sort(function (a, b) { return a.x - b.x || a.l - b.l; });
    return out;
  }
  // ---------- end of the shared part ----------

  var ROCKET_T = 2.9;    // the Rocket booster extra makes a boost last a little longer
  var JUMP_H = 95;       // how high a ramp throws the car
  var LANE_V = 7;        // lanes a second when changing lane
  var TRACKS = [
    { id: 'town', icon: '🏡', en: 'Sunny Town', zh: '阳光小镇', py: 'yángguāng xiǎozhèn', ms: 'Pekan Ceria', dots: 1 },
    { id: 'beach', icon: '🏖️', en: 'Palm Beach', zh: '棕榈海滩', py: 'zōnglǘ hǎitān', ms: 'Pantai Palma', dots: 2 },
    { id: 'night', icon: '🌃', en: 'Night City', zh: '不夜城', py: 'bùyèchéng', ms: 'Kota Malam', dots: 3 }
  ];
  // The picture is 560 units high. Lanes: where the wheels touch, how big things are drawn, how far they lean right.
  var DH = 560, ROAD_T = 324, ROAD_B = 526, CAR_K = 0.92;
  var LY = [358, 405, 456, 510], LS = [0.80, 0.87, 0.94, 1.02], LDX = [30, 20, 10, 0];
  var ROOF = [48, 53, 77, 61, 62, 62];   // how tall each car body of the Car Garage is, for placing the name tag
  function carColor(car) { return car && /^#[0-9a-fA-F]{6}$/.test(car.color) ? car.color : '#FF4F6D'; }

  // ---------- small helpers ----------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return api.esc(s === undefined || s === null ? '' : s); }
  function sfx(n) { try { api.sfx(n); } catch (e) {} }
  function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function fmt(ms) { // 65432 -> "1:05.4"
    var d = Math.floor(Math.max(0, ms) / 100), s = Math.floor(d / 10) % 60;
    return Math.floor(d / 600) + ':' + (s < 10 ? '0' : '') + s + '.' + (d % 10);
  }
  function ord(n) { return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); }
  function medal(n) { return n >= 1 && n <= 3 ? ['🥇', '🥈', '🥉'][n - 1] : n + '.'; }
  // star badges for beating a track's target times: 1 bronze, 2 silver, 3 gold (not the same thing as the place medals)
  var BADGE_NAMES = ['Bronze', 'Silver', 'Gold'];
  function badge(level, on) { return '<i class="race-cup c' + level + (on ? ' on' : '') + '">★</i>'; }
  function lane(arr, lp) { // a value between two lanes while the car is changing lane
    var i = Math.floor(lp);
    if (i < 0) return arr[0];
    if (i >= 3) return arr[3];
    return arr[i] + (arr[i + 1] - arr[i]) * (lp - i);
  }
  function shade(hex, f) { // f < 0 darker, f > 0 lighter
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    function m(v) { v = Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f); return (v < 16 ? '0' : '') + v.toString(16); }
    return '#' + m(r) + m(g) + m(b);
  }
  function prn(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); } // the same "random" number every time
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function poly(c, p) { c.beginPath(); c.moveTo(p[0], p[1]); for (var i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); }
  function ell(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); }
  function ol(c, w) { c.lineWidth = w || 3; c.strokeStyle = NAVY; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
  function lin(c, x0, y0, x1, y1, a, b) { var g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
  function rad(c, x, y, r, a, b) { var g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
  function star(c, x, y, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    c.closePath();
  }
  function boltPath(c, x, y, s) { poly(c, [x + 4 * s, y - 16 * s, x - 10 * s, y + 2 * s, x - 1 * s, y + 2 * s, x - 5 * s, y + 16 * s, x + 10 * s, y - 3 * s, x + 1 * s, y - 3 * s]); }
  function blobs(c, list, fill, lw) { // round blobs that read as one shape: outline first, then the fill
    var i;
    c.strokeStyle = NAVY; c.lineWidth = lw * 2;
    for (i = 0; i < list.length; i++) { c.beginPath(); c.arc(list[i][0], list[i][1], list[i][2], 0, TAU); c.stroke(); }
    c.fillStyle = fill;
    for (i = 0; i < list.length; i++) { c.beginPath(); c.arc(list[i][0], list[i][1], list[i][2], 0, TAU); c.fill(); }
  }
  // draws the same thing one tile to the left, in place, and one tile to the right, so a tile has no seam
  function wrap3(g, w, fn) { for (var k = -1; k <= 1; k++) { g.save(); g.translate(k * w, 0); fn(g); g.restore(); } }

  // ---------- scenery pieces (2.5D: a lit front, a darker side to the right, a soft shadow) ----------
  function ridge(g, w, base, amp, k1, k2, ph, col, bottom) { // a row of hills that joins up at the tile edges
    g.beginPath(); g.moveTo(0, bottom);
    for (var x = 0; x <= w; x += 20) g.lineTo(x, base - amp * (0.6 * Math.sin(x / w * TAU * k1 + ph) + 0.4 * Math.sin(x / w * TAU * k2 + ph * 2.3)));
    g.lineTo(w, bottom); g.closePath(); g.fillStyle = col; g.fill();
  }
  function cloud(g, x, y, s, col, sh) {
    g.fillStyle = sh; ell(g, x, y + 7 * s, 48 * s, 12 * s); g.fill();
    g.fillStyle = col;
    [[-26, 0, 20], [0, -12, 27], [28, -2, 21], [4, 4, 24]].forEach(function (q) { g.beginPath(); g.arc(x + q[0] * s, y + q[1] * s, q[2] * s, 0, TAU); g.fill(); });
  }
  var WALLS = ['#FF8FB8', '#FFD66B', '#8FE3C8', '#9CCBFF', '#FFB07A', '#B9A6FF'], ROOFS = ['#E0447F', '#F08A24', '#2F9E83', '#2F6FCC', '#D0461F', '#6C4BD8'];
  function house(g, x, base, w, h, wall, roof) {
    var dx = 16, dy = 9, rh = h * 0.52, top = base - h;
    poly(g, [x + w, base, x + w + 46, base, x + w + 46 + dx, base - dy, x + w + dx, base - dy]); g.fillStyle = SH; g.fill();
    poly(g, [x + w, base, x + w + dx, base - dy, x + w + dx, top - dy, x + w, top]); g.fillStyle = shade(wall, -0.24); g.fill(); ol(g, 2.5);
    g.beginPath(); g.rect(x, top, w, h); g.fillStyle = lin(g, 0, top, 0, base, shade(wall, 0.16), wall); g.fill(); ol(g, 2.5);
    rr(g, x + w * 0.13, base - h * 0.6, w * 0.24, h * 0.6, 3); g.fillStyle = '#A56B38'; g.fill(); ol(g, 2);
    rr(g, x + w * 0.5, top + h * 0.26, w * 0.34, h * 0.36, 3); g.fillStyle = '#fff'; g.fill(); ol(g, 2);
    g.fillStyle = '#9BDCF8'; g.fillRect(x + w * 0.5 + 3, top + h * 0.26 + 3, w * 0.34 - 6, h * 0.36 - 6);
    g.fillStyle = '#fff'; g.fillRect(x + w * 0.67 - 1.2, top + h * 0.26 + 2, 2.4, h * 0.36 - 4);
    poly(g, [x + w + 6, top, x + w + 6 + dx, top - dy, x + w - 8 + dx * 0.6, top - rh]); g.fillStyle = shade(roof, -0.28); g.fill(); ol(g, 2.5);
    poly(g, [x - 6, top, x + w + 6, top, x + w - 8 + dx * 0.6, top - rh, x + 10 + dx * 0.6, top - rh]);
    g.fillStyle = lin(g, 0, top - rh, 0, top, shade(roof, 0.22), roof); g.fill(); ol(g, 2.5);
    g.fillStyle = shade(roof, -0.36); g.fillRect(x - 6, top - 1, w + 12, 5); g.strokeStyle = NAVY; g.lineWidth = 2; g.strokeRect(x - 6, top - 1, w + 12, 5);
  }
  function tree(g, x, base, s, kind) {
    var L, i;
    g.fillStyle = SH; ell(g, x + 9 * s, base + 1, 28 * s, 6 * s); g.fill();
    rr(g, x - 5 * s, base - 30 * s, 10 * s, 32 * s, 3 * s); g.fillStyle = lin(g, x - 5 * s, 0, x + 5 * s, 0, '#A8733F', '#774B27'); g.fill(); ol(g, 2.5);
    if (kind) { // pine
      [[-14, 26, 34], [-36, 21, 30], [-56, 15, 26]].forEach(function (q) {
        poly(g, [x - q[1] * s, base + q[0] * s, x, base + (q[0] - q[2]) * s, x + q[1] * s, base + q[0] * s]); g.fillStyle = '#35966A'; g.fill();
        poly(g, [x, base + (q[0] - q[2]) * s, x + q[1] * s, base + q[0] * s, x + 2 * s, base + q[0] * s]); g.fillStyle = '#26764F'; g.fill();
        poly(g, [x - q[1] * s, base + q[0] * s, x, base + (q[0] - q[2]) * s, x + q[1] * s, base + q[0] * s]); ol(g, 2.5);
      });
      return;
    }
    L = [[x - 13 * s, base - 44 * s, 17 * s], [x + 13 * s, base - 43 * s, 17 * s], [x, base - 61 * s, 20 * s], [x, base - 42 * s, 15 * s]];
    blobs(g, L, '#2F8548', 2.5);
    g.fillStyle = '#45A65D'; for (i = 0; i < L.length; i++) { g.beginPath(); g.arc(L[i][0] - 3 * s, L[i][1] - 3 * s, L[i][2] - 5 * s, 0, TAU); g.fill(); }
    g.fillStyle = '#6CC67F'; g.beginPath(); g.arc(x - 5 * s, base - 68 * s, 8 * s, 0, TAU); g.fill();
  }
  function bush(g, x, base, s, n) {
    var L = [[x - 20 * s, base - 14 * s, 17 * s], [x + 18 * s, base - 13 * s, 17 * s], [x, base - 25 * s, 19 * s]], i;
    g.fillStyle = SH; ell(g, x + 10 * s, base + 2, 40 * s, 8 * s); g.fill();
    blobs(g, L, '#2F8548', 2.5);
    g.fillStyle = '#48A85F'; for (i = 0; i < L.length; i++) { g.beginPath(); g.arc(L[i][0] - 3 * s, L[i][1] - 4 * s, L[i][2] - 6 * s, 0, TAU); g.fill(); }
    [[-22, -18], [4, -30], [20, -16]].forEach(function (q, k) {
      g.beginPath(); g.arc(x + q[0] * s, base + q[1] * s, 4 * s, 0, TAU); g.fillStyle = n % 2 ? (k % 2 ? '#FF8FB8' : '#FFFFFF') : (k % 2 ? '#FFD66B' : '#FF7A45'); g.fill(); g.lineWidth = 1.5; g.strokeStyle = NAVY; g.stroke();
    });
  }
  function lampPost(g, x, base, glow) {
    g.fillStyle = SH; ell(g, x + 6, base, 13, 3.5); g.fill();
    if (glow) { g.beginPath(); g.arc(x, base - 74, 46, 0, TAU); g.fillStyle = rad(g, x, base - 74, 46, 'rgba(255,226,122,0.6)', 'rgba(255,226,122,0)'); g.fill(); }
    rr(g, x - 6, base - 6, 12, 7, 2); g.fillStyle = '#5B6275'; g.fill(); ol(g, 2.5);
    rr(g, x - 2.5, base - 66, 5, 62, 2); g.fillStyle = lin(g, x - 3, 0, x + 3, 0, '#8A92A6', '#4A5165'); g.fill(); ol(g, 2.5);
    rr(g, x - 8, base - 85, 16, 21, 5); g.fillStyle = glow ? '#FFF0B8' : '#F4FBFF'; g.fill(); ol(g, 2.5);
    poly(g, [x - 11, base - 85, x + 11, base - 85, x + 6, base - 92, x - 6, base - 92]); g.fillStyle = '#5B6275'; g.fill(); ol(g, 2.5);
  }
  function palm(g, x, base, h, lean) {
    var tx = x + lean, ty = base - h, A = [-2.75, -2.2, -1.55, -0.95, -0.4], i, a, ex, ey, cx, cy;
    g.fillStyle = SH; ell(g, x + 10, base + 1, 22, 5); g.fill();
    g.beginPath(); g.moveTo(x, base); g.quadraticCurveTo(x + lean * 0.1, base - h * 0.55, tx, ty);
    g.lineCap = 'round'; g.lineWidth = 13; g.strokeStyle = NAVY; g.stroke(); g.lineWidth = 8; g.strokeStyle = '#B77B45'; g.stroke();
    g.lineWidth = 2.5; g.strokeStyle = '#D9A066'; g.beginPath(); g.moveTo(x - 2, base - 3); g.quadraticCurveTo(x + lean * 0.1 - 2, base - h * 0.55, tx - 2, ty + 3); g.stroke();
    for (i = 0; i < A.length; i++) {
      a = A[i]; ex = tx + Math.cos(a) * 56; ey = ty + Math.sin(a) * 30 + 22; cx = tx + Math.cos(a) * 34; cy = ty + Math.sin(a) * 42 - 6;
      g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(cx, cy, ex, ey); g.quadraticCurveTo(cx + 2, cy + 20, tx, ty + 5); g.closePath();
      g.fillStyle = i % 2 ? '#3FA45A' : '#2F8548'; g.fill(); ol(g, 2.5);
    }
    g.fillStyle = '#7A4A2B'; g.beginPath(); g.arc(tx - 4, ty + 6, 5, 0, TAU); g.fill(); ol(g, 2); g.beginPath(); g.arc(tx + 5, ty + 7, 5, 0, TAU); g.fill(); ol(g, 2);
  }
  function hut(g, x, base, w, h, n) {
    var dx = 14, dy = 8, top = base - h, i, cols = n % 2 ? ['#FF4F6D', '#FFFFFF'] : ['#3B82F6', '#FFFFFF'];
    poly(g, [x + w, base, x + w + 40, base, x + w + 40 + dx, base - dy, x + w + dx, base - dy]); g.fillStyle = SH; g.fill();
    poly(g, [x + w, base, x + w + dx, base - dy, x + w + dx, top - dy, x + w, top]); g.fillStyle = '#B98A52'; g.fill(); ol(g, 2.5);
    g.beginPath(); g.rect(x, top, w, h); g.fillStyle = lin(g, 0, top, 0, base, '#F3D9A6', '#DDB779'); g.fill(); ol(g, 2.5);
    g.strokeStyle = 'rgba(27,42,73,0.16)'; g.lineWidth = 2; for (i = 1; i < 5; i++) { g.beginPath(); g.moveTo(x + i * w / 5, top + 2); g.lineTo(x + i * w / 5, base - 2); g.stroke(); }
    rr(g, x + w * 0.2, top + h * 0.34, w * 0.6, h * 0.38, 3); g.fillStyle = '#5A3B25'; g.fill(); ol(g, 2);
    rr(g, x + w * 0.14, top + h * 0.7, w * 0.72, 7, 2); g.fillStyle = '#FFF3D6'; g.fill(); ol(g, 2);
    poly(g, [x + w + 8, top + 4, x + w + 8 + dx, top + 4 - dy, x + w + dx * 0.5, top - 26]); g.fillStyle = shade(cols[0], -0.3); g.fill(); ol(g, 2.5);
    for (i = 0; i < 6; i++) {
      poly(g, [x - 8 + i * (w + 16) / 6, top + 4, x - 8 + (i + 1) * (w + 16) / 6, top + 4, x + 8 + (i + 1) * (w - 16) / 6 + dx * 0.5, top - 26, x + 8 + i * (w - 16) / 6 + dx * 0.5, top - 26]);
      g.fillStyle = cols[i % 2]; g.fill(); ol(g, 2);
    }
  }
  function umbrella(g, x, base, n) {
    var col = ['#FF4F6D', '#FFC933', '#5ED6C4'][n % 3], i;
    g.fillStyle = SH; ell(g, x + 14, base + 1, 34, 6); g.fill();
    g.strokeStyle = NAVY; g.lineWidth = 5; g.beginPath(); g.moveTo(x, base); g.lineTo(x + 5, base - 56); g.stroke();
    g.strokeStyle = '#F4FBFF'; g.lineWidth = 2; g.stroke();
    g.save(); g.translate(x + 5, base - 54); g.rotate(0.09);
    g.beginPath(); g.arc(0, 0, 40, Math.PI, 0); g.closePath(); g.fillStyle = col; g.fill();
    g.fillStyle = '#FFFFFF';
    for (i = 0; i < 2; i++) { g.beginPath(); g.moveTo(0, -40); g.quadraticCurveTo(-30 + i * 44, -34, -32 + i * 48, 0); g.lineTo(-16 + i * 48, 0); g.quadraticCurveTo(-16 + i * 40, -30, 0, -40); g.fill(); }
    g.beginPath(); g.arc(0, 0, 40, Math.PI, 0); g.closePath(); ol(g, 2.5);
    g.restore();
    rr(g, x + 22, base - 12, 34, 8, 3); g.fillStyle = n % 2 ? '#5AA9FF' : '#FF8FB8'; g.fill(); ol(g, 2);  // a towel
  }
  function tower(g, x, base, w, h, col, seed) {
    var dx = 14, dy = 8, top = base - h, cols = Math.max(2, Math.floor((w - 10) / 17)), rows = Math.floor((h - 14) / 20), gx = (w - 10) / cols, i, j, q;
    poly(g, [x + w, base, x + w + dx, base - dy, x + w + dx, top - dy, x + w, top]); g.fillStyle = shade(col, -0.34); g.fill(); ol(g, 2.5);
    poly(g, [x, top, x + w, top, x + w + dx, top - dy, x + dx, top - dy]); g.fillStyle = shade(col, 0.2); g.fill(); ol(g, 2.5);
    g.beginPath(); g.rect(x, top, w, h); g.fillStyle = lin(g, 0, top, 0, base, shade(col, 0.12), shade(col, -0.1)); g.fill(); ol(g, 2.5);
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
      q = prn(seed + i * 7.3 + j * 13.1);
      g.fillStyle = q < 0.46 ? '#FFE27A' : q < 0.58 ? '#7FE0EA' : q < 0.66 ? '#FF9CC9' : 'rgba(12,16,44,0.55)';
      g.fillRect(x + 7 + i * gx, top + 9 + j * 20, gx - 5, 11);
    }
  }
  function neon(g, x, y, col, n) { // a glowing sign on a wall
    g.save(); g.shadowColor = col; g.shadowBlur = 12; g.lineJoin = 'round'; g.lineCap = 'round';
    rr(g, x - 26, y - 15, 52, 30, 8); g.fillStyle = 'rgba(12,16,44,0.8)'; g.fill(); g.lineWidth = 3.5; g.strokeStyle = col; g.stroke();
    g.lineWidth = 3;
    if (n % 3 === 0) { star(g, x, y, 10); g.stroke(); }
    else if (n % 3 === 1) { boltPath(g, x, y, 0.62); g.stroke(); }
    else { g.beginPath(); g.moveTo(x - 14, y + 4); g.lineTo(x - 5, y - 6); g.lineTo(x + 3, y + 4); g.lineTo(x + 13, y - 6); g.stroke(); }
    g.restore();
  }
  function rock(g, x, base, s) {
    g.fillStyle = SH; ell(g, x + 8 * s, base + 2, 34 * s, 7 * s); g.fill();
    poly(g, [x - 26 * s, base, x - 30 * s, base - 14 * s, x - 16 * s, base - 28 * s, x + 6 * s, base - 32 * s, x + 24 * s, base - 20 * s, x + 28 * s, base - 4 * s, x + 20 * s, base + 2 * s]); g.fillStyle = '#A9AFB8'; g.fill(); ol(g, 3);
    poly(g, [x - 26 * s, base - 13 * s, x - 15 * s, base - 26 * s, x + 5 * s, base - 29 * s, x + 12 * s, base - 18 * s, x - 8 * s, base - 12 * s]); g.fillStyle = '#D5DAE0'; g.fill();
  }
  function tuft(g, x, base, col) {
    g.strokeStyle = col; g.lineWidth = 3.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - 7, base); g.lineTo(x - 11, base - 15); g.moveTo(x, base); g.lineTo(x, base - 21); g.moveTo(x + 7, base); g.lineTo(x + 12, base - 14); g.stroke();
  }
  function flower(g, x, base, col) {
    g.strokeStyle = '#3F9A53'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, base); g.lineTo(x, base - 18); g.stroke();
    for (var i = 0; i < 5; i++) { var a = -Math.PI / 2 + i * TAU / 5; g.beginPath(); g.arc(x + Math.cos(a) * 5.4, base - 21 + Math.sin(a) * 5.4, 4.6, 0, TAU); g.fillStyle = col; g.fill(); g.lineWidth = 1.5; g.strokeStyle = NAVY; g.stroke(); }
    g.beginPath(); g.arc(x, base - 21, 3.4, 0, TAU); g.fillStyle = col === '#FFD66B' ? '#FF7A45' : '#FFD66B'; g.fill(); g.stroke();
  }
  function kerb(g, w, y, top, face, cols) { // striped kerb stones with a darker front face
    for (var x = 0, i = 0; x < w; x += 40, i++) {
      poly(g, [x + 3, y, x + 43, y, x + 40, y + top, x, y + top]); g.fillStyle = cols[i % 2]; g.fill();
      g.fillStyle = shade(cols[i % 2], -0.32); g.fillRect(x, y + top, 40, face);
    }
    g.fillStyle = NAVY; g.fillRect(0, y - 1.5, w, 2.5); g.fillRect(0, y + top + face - 1, w, 2.5);
  }

  // ---------- the three tracks: sky, things far away, things behind the road, the roadside, the front edge ----------
  var SCN = [
    { // Sunny Town
      sky: ['#63C0F0', '#D9F4FF'], verge: '#7BD389', near: '#69C67C', kerb: ['#FF4F6D', '#FFFFFF'], road: ['#757D94', '#5D647A'], line: '#FFFFFF',
      back: function (g, w) {
        var x = w * 0.74, y = 112;
        g.beginPath(); g.arc(x, y, 92, 0, TAU); g.fillStyle = rad(g, x, y, 92, 'rgba(255,240,170,0.75)', 'rgba(255,240,170,0)'); g.fill();
        g.beginPath(); g.arc(x, y, 40, 0, TAU); g.fillStyle = '#FFE27A'; g.fill();
        g.beginPath(); g.arc(x - 12, y - 12, 12, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fill();
      },
      far: function (g, w) {
        wrap3(g, w, function (g) {
          for (var i = 0; i < 6; i++) cloud(g, 90 + i * 232 + prn(i + 3) * 70, 76 + prn(i + 11) * 100, 0.75 + prn(i + 5) * 0.6, '#FFFFFF', 'rgba(140,196,234,0.55)');
        });
        ridge(g, w, 236, 46, 2, 5, 0.8, '#9BDDB0', 340);
        ridge(g, w, 270, 30, 3, 7, 2.1, '#74CC8C', 340);
      },
      mid: function (g, w) {
        ridge(g, w, 296, 5, 3, 8, 0.5, '#86D697', 340);
        wrap3(g, w, function (g) {
          var x = 30, i = 0, q, hw;
          while (x < w - 130) {
            q = prn(i * 3.7 + 1);
            if (i % 3 === 2) { tree(g, x + 34, 308, 0.95 + q * 0.5, i % 2); x += 92 + q * 60; }
            else { hw = 84 + q * 40; house(g, x, 308, hw, 56 + prn(i + 40) * 34, WALLS[i % 6], ROOFS[i % 6]); x += hw + 50 + prn(i + 9) * 50; }
            i++;
          }
        });
      },
      side: function (g, w) {
        var x, i;
        g.fillStyle = '#FFFFFF'; g.strokeStyle = NAVY; g.lineWidth = 2; g.lineJoin = 'round';
        g.beginPath(); g.rect(-4, 288, w + 8, 4); g.rect(-4, 298, w + 8, 4); g.fill(); g.stroke();
        for (x = 4; x < w; x += 16) { g.beginPath(); g.moveTo(x, 308); g.lineTo(x, 284); g.lineTo(x + 4, 279); g.lineTo(x + 8, 284); g.lineTo(x + 8, 308); g.closePath(); g.fill(); g.stroke(); }
        for (i = 0; i < 2; i++) { lampPost(g, 170 + i * 640, 310, false); bush(g, 480 + i * 640, 311, 0.75, i); }
      },
      fg: function (g, w) {
        wrap3(g, w, function (g) {
          var i;
          for (i = 0; i < 5; i++) bush(g, 130 + i * 320 + prn(i + 70) * 120, 574, 1.45, i);
          for (i = 0; i < 9; i++) flower(g, 50 + i * 178 + prn(i + 90) * 60, 564, ['#FF8FB8', '#FFD66B', '#FFFFFF', '#B79CFF'][i % 4]);
        });
      }
    },
    { // Palm Beach
      sky: ['#4FBDF0', '#FFE9B8'], verge: '#F6E2A8', near: '#EFD691', kerb: ['#3B82F6', '#FFFFFF'], road: ['#8791A6', '#6D768C'], line: '#FFFFFF',
      back: function (g, w) {
        var x = w * 0.7, y = 128, i;
        g.beginPath(); g.arc(x, y, 110, 0, TAU); g.fillStyle = rad(g, x, y, 110, 'rgba(255,225,150,0.8)', 'rgba(255,225,150,0)'); g.fill();
        g.beginPath(); g.arc(x, y, 48, 0, TAU); g.fillStyle = '#FFD66B'; g.fill();
        g.beginPath(); g.arc(x - 14, y - 14, 14, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fill();
        g.fillStyle = lin(g, 0, 238, 0, 312, '#2FA6E0', '#86E4EC'); g.fillRect(0, 238, w, 76);            // the sea
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(0, 238, w, 2.5);
        g.fillStyle = 'rgba(255,240,180,0.5)';
        for (i = 0; i < 6; i++) g.fillRect(x - 34 + i * 3 - (i % 2) * 14, 244 + i * 10, 68 - i * 5 + (i % 2) * 26, 3.5);
      },
      far: function (g, w) {
        wrap3(g, w, function (g) {
          var i, x, s;
          for (i = 0; i < 4; i++) cloud(g, 150 + i * 350 + prn(i + 23) * 90, 70 + prn(i + 31) * 80, 0.8 + prn(i + 25) * 0.5, '#FFFFFF', 'rgba(255,214,160,0.55)');
          for (i = 0; i < 3; i++) { // islands on the horizon
            x = 190 + i * 470 + prn(i + 41) * 90; s = 0.8 + prn(i + 43) * 0.6;
            g.beginPath(); g.ellipse(x, 240, 96 * s, 30 * s, 0, Math.PI, 0); g.fillStyle = '#4FB38A'; g.fill();
            g.beginPath(); g.ellipse(x - 14 * s, 240, 62 * s, 19 * s, 0, Math.PI, 0); g.fillStyle = '#6BC9A0'; g.fill();
            g.fillStyle = '#F6E2A8'; g.fillRect(x - 96 * s, 238, 192 * s, 3.5);
          }
          for (i = 0; i < 2; i++) { // sailing boats
            x = 420 + i * 640 + prn(i + 51) * 120;
            poly(g, [x - 20, 262, x + 22, 262, x + 15, 271, x - 14, 271]); g.fillStyle = '#FFFFFF'; g.fill(); ol(g, 2);
            poly(g, [x, 262, x, 228, x + 20, 258]); g.fillStyle = i ? '#FF7A45' : '#FF4F6D'; g.fill(); ol(g, 2);
            poly(g, [x - 3, 260, x - 3, 238, x - 17, 260]); g.fillStyle = '#FFF3D6'; g.fill(); ol(g, 2);
          }
          g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2.5; g.lineCap = 'round';
          for (i = 0; i < 26; i++) { x = prn(i + 61) * w; s = 250 + prn(i + 63) * 50; g.beginPath(); g.moveTo(x, s); g.quadraticCurveTo(x + 9, s - 4, x + 18, s); g.stroke(); }
        });
      },
      mid: function (g, w) {
        ridge(g, w, 294, 4, 4, 9, 1.3, '#FFFFFF', 340);
        ridge(g, w, 298, 4, 4, 9, 1.3, '#F6E2A8', 340);
        wrap3(g, w, function (g) {
          var x = 50, i = 0, q;
          while (x < w - 150) {
            q = prn(i * 2.9 + 4);
            if (i % 4 === 1) { hut(g, x, 310, 86, 52, i); x += 150 + q * 60; }
            else if (i % 4 === 3) { umbrella(g, x + 30, 311, i); x += 120 + q * 70; }
            else { palm(g, x + 22, 311, 96 + q * 50, (prn(i + 7) - 0.35) * 44); x += 112 + q * 90; }
            i++;
          }
        });
      },
      side: function (g, w) {
        var x, i;
        g.lineCap = 'round';
        g.beginPath(); for (x = 0; x < w; x += 80) { g.moveTo(x + 4, 291); g.quadraticCurveTo(x + 44, 305, x + 84, 291); }
        g.strokeStyle = NAVY; g.lineWidth = 5.5; g.stroke(); g.strokeStyle = '#FFF3D6'; g.lineWidth = 2.5; g.stroke();
        for (x = 0; x < w; x += 80) { rr(g, x, 284, 9, 26, 3); g.fillStyle = lin(g, x, 0, x + 9, 0, '#C98A4B', '#8F5A2E'); g.fill(); ol(g, 2.5); }
        for (i = 0; i < 2; i++) { // a surfboard stuck in the sand, and a beach ball
          x = 250 + i * 640;
          g.save(); g.translate(x, 310); g.rotate(0.14);
          g.beginPath(); g.ellipse(0, -34, 11, 36, 0, 0, TAU); g.fillStyle = i ? '#5ED6C4' : '#FF8FB8'; g.fill(); ol(g, 2.5);
          g.fillStyle = '#FFFFFF'; g.fillRect(-2, -64, 4, 58);
          g.restore();
          g.fillStyle = SH; ell(g, x + 330, 311, 13, 3.5); g.fill();
          g.beginPath(); g.arc(x + 324, 300, 11, 0, TAU); g.fillStyle = '#FFFFFF'; g.fill();
          g.beginPath(); g.moveTo(x + 324, 300); g.arc(x + 324, 300, 11, -0.4, 0.9); g.closePath(); g.fillStyle = '#FF4F6D'; g.fill();
          g.beginPath(); g.moveTo(x + 324, 300); g.arc(x + 324, 300, 11, 2.2, 3.5); g.closePath(); g.fillStyle = '#3B82F6'; g.fill();
          g.beginPath(); g.arc(x + 324, 300, 11, 0, TAU); ol(g, 2.5);
        }
      },
      fg: function (g, w) {
        wrap3(g, w, function (g) {
          var i, x;
          for (i = 0; i < 4; i++) rock(g, 220 + i * 400 + prn(i + 60) * 150, 570, 1.25);
          for (i = 0; i < 7; i++) tuft(g, 70 + i * 228 + prn(i + 80) * 90, 566, i % 2 ? '#8FBF5A' : '#6FAF55');
          for (i = 0; i < 3; i++) { x = 90 + i * 530 + prn(i + 95) * 120; star(g, x, 549, 11); g.fillStyle = '#FF7A45'; g.fill(); ol(g, 2.5); }
        });
      }
    },
    { // Night City
      sky: ['#0E1438', '#51308A'], verge: '#2C335C', near: '#252B50', kerb: ['#FFC933', '#2B3046'], road: ['#3A4168', '#2A2F50'], line: '#FFE27A',
      back: function (g, w, t) {
        var x = w * 0.76, y = 108, i, a;
        for (i = 0; i < 34; i++) {
          a = 0.45 + 0.45 * Math.sin(t * (1.2 + prn(i + 7) * 2) + i * 1.7);
          g.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
          g.beginPath(); g.arc(prn(i + 1) * w, 16 + prn(i + 3) * 190, 1.2 + prn(i + 5) * 1.6, 0, TAU); g.fill();
        }
        g.beginPath(); g.arc(x, y, 86, 0, TAU); g.fillStyle = rad(g, x, y, 86, 'rgba(255,246,201,0.45)', 'rgba(255,246,201,0)'); g.fill();
        g.beginPath(); g.arc(x, y, 36, 0, TAU); g.fillStyle = '#FFF6C9'; g.fill();
        g.fillStyle = 'rgba(210,190,140,0.55)';
        g.beginPath(); g.arc(x - 12, y - 8, 7, 0, TAU); g.fill(); g.beginPath(); g.arc(x + 12, y + 10, 9, 0, TAU); g.fill(); g.beginPath(); g.arc(x + 9, y - 16, 4, 0, TAU); g.fill();
      },
      far: function (g, w) {
        wrap3(g, w, function (g) {
          var x = 0, i = 0, bw, bh, a, b;
          while (x < w) {
            bw = 52 + prn(i + 2) * 70; bh = 60 + prn(i + 21) * 140;
            g.fillStyle = i % 2 ? '#232B60' : '#1E2553'; g.fillRect(x, 334 - bh, bw + 1, bh);
            g.fillStyle = 'rgba(255,233,168,0.75)';
            for (a = 0; a < Math.floor((bw - 8) / 12); a++) for (b = 0; b < Math.floor((bh - 30) / 15); b++) if (prn(i * 31 + a * 7 + b * 13) < 0.33) g.fillRect(x + 6 + a * 12, 334 - bh + 8 + b * 15, 5, 7);
            if (i % 4 === 1) { g.fillStyle = '#1E2553'; g.fillRect(x + bw / 2 - 1.5, 334 - bh - 24, 3, 24); g.fillStyle = '#FF4F6D'; g.beginPath(); g.arc(x + bw / 2, 334 - bh - 25, 3, 0, TAU); g.fill(); }
            x += bw; i++;
          }
        });
      },
      mid: function (g, w) {
        g.fillStyle = '#1A2048'; g.fillRect(0, 300, w, 40);
        wrap3(g, w, function (g) {
          var x = 20, i = 0, bw, bh;
          while (x < w - 170) {
            bw = 92 + prn(i + 2) * 66; bh = 86 + prn(i + 31) * 96;
            tower(g, x, 310, bw, bh, ['#3D4A92', '#54409A', '#2F5E98', '#653F92'][i % 4], i * 17.7);
            if (i % 2 === 0) neon(g, x + bw / 2, 310 - Math.min(bh - 24, 46), ['#FF6FB5', '#5CE1FF', '#FFE27A'][i % 3], i);
            x += bw + 30 + prn(i + 13) * 40; i++;
          }
        });
      },
      side: function (g, w) {
        var x, i;
        for (x = 12; x < w; x += 64) { rr(g, x, 290, 6, 20, 2); g.fillStyle = '#8D949E'; g.fill(); ol(g, 2); }
        g.beginPath(); g.rect(-4, 288, w + 8, 8); g.fillStyle = lin(g, 0, 288, 0, 296, '#E1E6EE', '#9AA3B2'); g.fill(); ol(g, 2.5);
        for (x = 12; x < w; x += 64) { g.fillStyle = x % 128 < 64 ? '#FF4F6D' : '#FFE27A'; g.fillRect(x, 290, 6, 4); }
        for (i = 0; i < 2; i++) lampPost(g, 170 + i * 640, 310, true);
      },
      pools: function (g) { // the street lamps light the road
        for (var i = 0; i < 2; i++) {
          g.save(); g.translate(190 + i * 640, 372); g.scale(1, 0.24);
          g.beginPath(); g.arc(0, 0, 210, 0, TAU); g.fillStyle = rad(g, 0, 0, 210, 'rgba(255,226,122,0.30)', 'rgba(255,226,122,0)'); g.fill();
          g.restore();
        }
      },
      fg: function (g, w) {
        wrap3(g, w, function (g) {
          for (var i = 0; i < 5; i++) {
            var x = 110 + i * 320;
            g.beginPath(); g.arc(x, 522, 22, 0, TAU); g.fillStyle = rad(g, x, 522, 22, 'rgba(92,225,255,0.5)', 'rgba(92,225,255,0)'); g.fill();
            rr(g, x - 8, 520, 16, 50, 5); g.fillStyle = lin(g, x - 8, 0, x + 8, 0, '#4A5380', '#262C52'); g.fill(); ol(g, 3);
            g.fillStyle = '#5CE1FF'; g.fillRect(x - 6.5, 528, 13, 6); g.fillStyle = '#FF6FB5'; g.fillRect(x - 6.5, 540, 13, 5);
          }
        });
      }
    }
  ];
  // the ground tile: the far verge with its things, both kerbs and the road with its lane marks
  function paintGround(g, w, scn) {
    var i, x, ys = [370, 418, 470], th = [3.6, 4.4, 5.2];
    g.fillStyle = scn.verge; g.fillRect(0, 300, w, 16);
    g.fillStyle = 'rgba(27,42,73,0.10)'; g.fillRect(0, 300, w, 3);
    scn.side(g, w);
    kerb(g, w, 312, 8, 4, scn.kerb);
    g.fillStyle = lin(g, 0, ROAD_T, 0, ROAD_B, scn.road[0], scn.road[1]); g.fillRect(0, ROAD_T, w, ROAD_B - ROAD_T);
    for (i = 0; i < 150; i++) { // a little grain
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(27,42,73,0.10)';
      ell(g, prn(i + 200) * w, ROAD_T + 8 + prn(i + 400) * (ROAD_B - ROAD_T - 16), 3 + prn(i + 600) * 7, 1.2 + prn(i + 700) * 1.6); g.fill();
    }
    if (scn.pools) scn.pools(g, w);
    g.fillStyle = 'rgba(27,42,73,0.16)'; g.fillRect(0, ROAD_T, w, 7);           // the far kerb shades the road
    g.fillStyle = scn.line; g.globalAlpha = 0.85;
    g.fillRect(0, ROAD_T + 9, w, 3); g.fillRect(0, ROAD_B - 10, w, 4.5);
    for (i = 0; i < 3; i++) for (x = 20; x < w; x += 160) { poly(g, [x + 5, ys[i] - th[i] / 2, x + 77, ys[i] - th[i] / 2, x + 72, ys[i] + th[i] / 2, x, ys[i] + th[i] / 2]); g.fill(); }
    g.globalAlpha = 1;
    kerb(g, w, ROAD_B, 11, 7, scn.kerb);
    g.fillStyle = scn.near; g.fillRect(0, ROAD_B + 18, w, DH - ROAD_B - 18);
  }

  // ---------- things on the road: each drawn once, 2 px per unit, origin where it touches the road ----------
  function plank(g, x, y, w, h) { // red and white warning stripes
    g.save(); rr(g, x, y, w, h, 3); g.clip();
    g.fillStyle = '#FFFFFF'; g.fillRect(x, y, w, h);
    g.fillStyle = '#FF4F6D';
    for (var i = -1; i < w / 20 + 1; i++) { poly(g, [x + i * 20, y + h, x + i * 20 + 10, y + h, x + i * 20 + 10 + h, y, x + i * 20 + h, y]); g.fill(); }
    g.restore();
    rr(g, x, y, w, h, 3); ol(g, 2.5);
  }
  function slick(g, col, rim, sheen) { // a puddle or an oil patch lying on the road
    var L = [[-18, 0, 44, 13], [22, 2, 38, 11], [0, -4, 34, 10], [-42, 3, 19, 7], [46, -2, 15, 6]], i;
    g.strokeStyle = NAVY; g.lineWidth = 5;
    for (i = 0; i < L.length; i++) { ell(g, L[i][0], L[i][1], L[i][2], L[i][3]); g.stroke(); }
    g.fillStyle = rim; for (i = 0; i < L.length; i++) { ell(g, L[i][0], L[i][1], L[i][2], L[i][3]); g.fill(); }
    g.fillStyle = col; for (i = 0; i < L.length; i++) { ell(g, L[i][0], L[i][1] - 1.5, L[i][2] - 4, L[i][3] - 2.5); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.75)'; ell(g, -24, -4, 12, 2.6); g.fill(); ell(g, 18, -1, 7, 1.8); g.fill();
    if (sheen) {
      g.lineWidth = 2.2; g.lineCap = 'round';
      g.strokeStyle = 'rgba(180,130,255,0.9)'; g.beginPath(); g.ellipse(-6, 1, 24, 5, 0, 0.3, 2.6); g.stroke();
      g.strokeStyle = 'rgba(94,214,196,0.9)'; g.beginPath(); g.ellipse(12, 3, 19, 4, 0, 3.5, 5.7); g.stroke();
      g.strokeStyle = 'rgba(255,143,184,0.9)'; g.beginPath(); g.ellipse(-22, 4, 12, 3, 0, 0.4, 2.4); g.stroke();
    }
  }
  var SPR = {
    cone: { w: 64, h: 68, ox: 28, oy: 60, draw: function (g) {
      g.fillStyle = SH; ell(g, 9, -1, 26, 6); g.fill();
      poly(g, [-20, -6, 16, -6, 22, -13, -14, -13]); g.fillStyle = '#FFA869'; g.fill(); ol(g, 2.5);
      rr(g, -20, -6, 36, 6, 2); g.fillStyle = '#D9541E'; g.fill(); ol(g, 2.5);
      function body() { g.beginPath(); g.moveTo(-10, -9); g.lineTo(-2.5, -50); g.quadraticCurveTo(1, -56, 4.5, -50); g.lineTo(12, -9); g.closePath(); }
      body(); g.fillStyle = lin(g, -10, 0, 12, 0, '#FF9A4D', '#E8551F'); g.fill();
      g.save(); body(); g.clip(); g.fillStyle = '#FFFFFF'; g.fillRect(-12, -40, 26, 8); g.fillRect(-12, -25, 26, 7);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-7, -52, 4, 44); g.restore();
      body(); ol(g, 3);
    } },
    barrier: { w: 112, h: 86, ox: 48, oy: 78, draw: function (g) {
      g.fillStyle = SH; ell(g, 12, 0, 50, 7); g.fill();
      [-30, 26].forEach(function (x) {
        rr(g, x - 7, -7, 20, 7, 2); g.fillStyle = '#5B6275'; g.fill(); ol(g, 2.5);
        rr(g, x, -52, 6, 47, 2); g.fillStyle = '#AEB6C4'; g.fill(); ol(g, 2.5);
      });
      plank(g, -40, -30, 80, 11);
      poly(g, [-40, -56, 40, -56, 47, -63, -33, -63]); g.fillStyle = '#FFFFFF'; g.fill(); ol(g, 2.5);
      poly(g, [40, -56, 47, -63, 47, -45, 40, -38]); g.fillStyle = '#C92A2A'; g.fill(); ol(g, 2.5);
      plank(g, -40, -56, 80, 18);
      [-27, 31].forEach(function (x) {
        g.beginPath(); g.arc(x, -67, 6.5, 0, TAU); g.fillStyle = '#FFC933'; g.fill(); ol(g, 2.5);
        g.beginPath(); g.arc(x - 2, -69, 2.2, 0, TAU); g.fillStyle = '#FFF6C9'; g.fill();
      });
    } },
    oil: { w: 136, h: 40, ox: 68, oy: 20, draw: function (g) { slick(g, '#3A2C5C', '#1D1633', true); } },
    puddle: { w: 136, h: 40, ox: 68, oy: 20, draw: function (g) { slick(g, '#A5E2FA', '#5AB6E8', false); } },
    bolt: { w: 76, h: 76, ox: 38, oy: 38, draw: function (g) {
      g.beginPath(); g.arc(0, 0, 36, 0, TAU); g.fillStyle = rad(g, 0, 0, 36, 'rgba(92,212,255,0.6)', 'rgba(92,212,255,0)'); g.fill();
      g.beginPath(); g.arc(0, 0, 22, 0, TAU); g.fillStyle = lin(g, 0, -22, 0, 22, '#74DBFF', '#1E8FE0'); g.fill(); ol(g, 3);
      g.beginPath(); g.arc(0, 0, 17, Math.PI * 1.05, Math.PI * 1.6); g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 3; g.stroke();
      boltPath(g, 0, 0, 1.05); g.fillStyle = '#FFE14D'; g.fill(); ol(g, 2.5);
    } },
    coin: { w: 52, h: 52, ox: 26, oy: 26, draw: function (g) {
      g.beginPath(); g.arc(0, 0, 21, 0, TAU); g.fillStyle = lin(g, -15, -15, 15, 15, '#FFEC96', '#F2A81D'); g.fill(); ol(g, 3);
      g.beginPath(); g.arc(0, 0, 15.5, 0, TAU); g.strokeStyle = '#D98A0A'; g.lineWidth = 2; g.stroke();
      star(g, 0, 0.5, 10); g.fillStyle = '#FFF6C9'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = '#B8730A'; g.stroke();
      g.beginPath(); g.arc(0, 0, 18, Math.PI * 1.1, Math.PI * 1.5); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2.5; g.stroke();
    } },
    pad: { w: 196, h: 56, ox: 98, oy: 26, draw: function (g) {
      var i, cx;
      function sk(x, y) { return [x - y * 0.53, y]; }
      poly(g, [-84, 18, 70, 18, 70, 25, -84, 25]); g.fillStyle = '#0C8062'; g.fill(); ol(g, 3);
      poly(g, [-84, 18, 70, 18, 88, -16, -66, -16]); g.fillStyle = lin(g, -84, 0, 88, 0, '#3BE3B0', '#12B88C'); g.fill(); ol(g, 3);
      g.fillStyle = '#FFFFFF';
      for (i = 0; i < 3; i++) {
        cx = -46 + i * 46;
        g.beginPath();
        [[-12, 11], [0, 11], [13, 0], [0, -11], [-12, -11], [1, 0]].forEach(function (q, n) { var p = sk(q[0], q[1]); if (n) g.lineTo(cx + p[0], 1 + p[1]); else g.moveTo(cx + p[0], 1 + p[1]); });
        g.closePath(); g.fill(); g.lineWidth = 1.8; g.strokeStyle = NAVY; g.stroke();
      }
    } },
    ramp: { w: 180, h: 100, ox: 72, oy: 82, draw: function (g) {
      var i, u;
      function pt(a, b) { return [-60 + 116 * a + 18 * b, -48 * a - 14 * b]; }
      poly(g, [-58, 3, 60, 3, 104, -10, 76, -15]); g.fillStyle = SH; g.fill();
      poly(g, [56, 0, 74, -14, 74, -62, 56, -48]); g.fillStyle = '#C97F0E'; g.fill(); ol(g, 3);
      poly(g, [-60, 0, 56, -48, 74, -62, -42, -14]); g.fillStyle = lin(g, -60, 0, 74, -62, '#FFEC96', '#FFC933'); g.fill(); ol(g, 3);
      g.fillStyle = '#FF7A45';
      for (i = 0; i < 2; i++) {
        u = 0.3 + i * 0.3;
        g.beginPath();
        [[u, 0.16], [u + 0.13, 0.5], [u, 0.84], [u + 0.09, 0.84], [u + 0.22, 0.5], [u + 0.09, 0.16]].forEach(function (q, n) { var p = pt(q[0], q[1]); if (n) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
        g.closePath(); g.fill(); g.lineWidth = 1.8; g.strokeStyle = NAVY; g.stroke();
      }
      poly(g, [-60, 0, 56, -48, 56, 0]); g.fillStyle = lin(g, 0, -48, 0, 0, '#FFB52E', '#F08A24'); g.fill();
      g.save(); poly(g, [-60, 0, 56, -48, 56, 0]); g.clip(); g.fillStyle = 'rgba(27,42,73,0.82)';
      for (i = 0; i < 6; i++) { poly(g, [-44 + i * 22, 0, -33 + i * 22, 0, -19 + i * 22, -50, -30 + i * 22, -50]); g.fill(); }
      g.restore();
      poly(g, [-60, 0, 56, -48, 56, 0]); ol(g, 3);
    } }
  };
  var sprites = {};
  function sprite(kind) {
    var s = sprites[kind], d, c, g;
    if (s) return s;
    d = SPR[kind]; c = document.createElement('canvas'); c.width = d.w * 2; c.height = d.h * 2;
    g = c.getContext('2d'); g.scale(2, 2); g.translate(d.ox, d.oy); g.lineJoin = 'round'; g.lineCap = 'round';
    d.draw(g);
    return (sprites[kind] = { c: c, w: d.w, h: d.h, ox: d.ox, oy: d.oy });
  }
  function drawSprite(c, kind, x, y, sc) { var s = sprite(kind); c.drawImage(s.c, x - s.ox * sc, y - s.oy * sc, s.w * sc, s.h * sc); }

  // ---------- the view: canvas size, scale, the cached scenery tiles ----------
  var cv = null, ctx = null, V = { W: 0, H: 0, S: 1, oy: 0, dpr: 1, R: 0, camL: 0, sky: null, small: false, hudL: 170, up: null, dn: null, bo: null, press: {} };
  // each tile: width and the band of the picture it covers (in units), and how fast it scrolls (1 = with the road)
  var TILE = { far: { w: 1400, y: 30, h: 304, par: 0.1 }, mid: { w: 1800, y: 100, h: 236, par: 0.3 }, ground: { w: 1280, y: 190, h: 370, par: 1 }, fg: { w: 1600, y: 480, h: 80, par: 1.45 } };
  var tiles = null;
  function buildTiles(ti) {
    var scn = SCN[ti], out = { ti: ti }, name, d, c, g;
    for (name in TILE) {
      d = TILE[name]; c = document.createElement('canvas');
      c.width = Math.ceil(d.w * V.R); c.height = Math.ceil(d.h * V.R);
      g = c.getContext('2d'); g.scale(c.width / d.w, c.height / d.h); g.translate(0, -d.y); g.lineJoin = 'round'; g.lineCap = 'round';
      if (name === 'ground') paintGround(g, d.w, scn); else scn[name](g, d.w);
      out[name] = c;
    }
    tiles = out;
  }
  function drawTile(c, name) {
    var d = TILE[name], img = tiles[name], S = V.S, w = d.w * S, off = ((V.camL * d.par) % d.w + d.w) % d.w, x = -off * S;
    if (x > -12) x -= w;
    for (; x < V.W + 12; x += w) c.drawImage(img, x, V.oy + d.y * S, w + 0.7, d.h * S);
  }
  function layout() {
    if (!root || !cv) return;
    var w = root.clientWidth || window.innerWidth, h = root.clientHeight || window.innerHeight, R, m, d, db;
    V.dpr = Math.min(2, window.devicePixelRatio || 1); V.W = w; V.H = h;
    V.S = Math.min(h / DH, w / 760); V.oy = h - DH * V.S; V.small = w < 900 || h < 560; V.sky = null;
    cv.width = Math.round(w * V.dpr); cv.height = Math.round(h * V.dpr);
    R = Math.min(1.5, Math.max(0.5, Math.ceil(V.S * V.dpr * 4) / 4));
    if (R !== V.R) { V.R = R; tiles = null; }
    m = V.small ? 10 : 18; d = clamp(h * 0.18, 64, 100); db = clamp(h * 0.24, 92, 128);
    V.up = { x: m + d / 2, y: h - m - d * 1.5 - 12, r: d / 2 };
    V.dn = { x: m + d / 2, y: h - m - d / 2 - 4, r: d / 2 };
    V.bo = { x: w - m - db / 2 - 6, y: h - m - db / 2 - 8, r: db / 2 };
    V.hudL = back ? back.offsetLeft + back.offsetWidth + 14 : 170;
  }

  // ---------- state ----------
  var view = 'lobby', lobby = null, race = null, raf = 0, last = 0, autoVoted = 0, lastReward = null, infoHtml = '';
  var back = null, lob = null, info = null, res = null, ui = {};

  // =====================================================================================================
  // The race
  // =====================================================================================================
  function startRace(m, startIn, watching) {
    var T = GEN[m.track] ? m.track : 0, items = makeTrack(T, m.seed), i, j, it, o, a, r, my = api.myId(), now = nowMs();
    // star tokens above a ramp hang where a jumping car flies
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (it.k !== 'ramp') continue;
      for (j = i + 1; j < items.length && items[j].x < it.x + 420; j++) {
        o = items[j];
        if (o.a && o.l === it.l) { a = clamp((o.x - it.x + 20) / (V0 * AIR_T), 0, 1); o.up = 26 + 4 * JUMP_H * a * (1 - a); }
      }
    }
    race = {
      ti: T, len: GEN[T].len, items: items, t0: now + startIn, t: -startIn / 1000, clock: 0, born: now,
      racers: [], byId: {}, me: null, ip: 0, parts: [], hurryEnd: 0, shake: 0, flash: 0, beep: 4, frac: 0.24, focus: null,
      finClock: 0, lastSend: 0, rank: [], rankAt: 0, boostT: BOOST_T, confetti: 0
    };
    for (i = 0; i < m.racers.length; i++) {
      a = m.racers[i];
      r = { rid: a.rid, pid: a.pid, name: String(a.name || '?'), color: a.color || '#FF7A45', car: a.car || (Car ? Car.defaults() : null), bot: !!a.bot,
        sx: +a.sx || 0, x: +a.sx || 0, tx: +a.sx || 0, pv: 0, at: 0, lane: a.lane | 0, lp: a.lane | 0, f: 0, vv: 0,
        spinA: 0, spinD: 0.7, spinK: 1, airA: 0, done: false, place: 0, ms: 0, dropped: false,
        tag: { name: String(a.name || '?'), lv: a.lv || 0 } };
      r.cc = carColor(r.car);                                         // the car's own colour: on the progress bar and in the results
      r.roof = ROOF[r.car && r.car.body >= 0 && r.car.body < ROOF.length ? r.car.body : 1] + (r.car && (r.car.extra === 1 || r.car.extra === 2 || r.car.spoiler === 2) ? 9 : 0);
      race.racers.push(r); race.byId[r.rid] = r;
      if (!watching && !r.bot && r.pid === my) {
        race.me = r;
        r.v = 0; r.spin = 0; r.boost = 0; r.pad = 0; r.air = 0; r.inv = 0; r.meter = 1; r.coins = 0; r.fin = false; r.finMs = 0;
        if (r.car && r.car.extra === 3) race.boostT = ROCKET_T;
      }
    }
    lastReward = null;
    V.camL = (race.me ? race.me.x : 0) - V.W * race.frac / V.S;
    setView('race');
  }

  // ---- my own car ----
  function steer(d) {
    var R = race, me = R && R.me, to;
    if (!me || me.fin) return;
    to = clamp(me.lane + d, 0, 3);
    if (to !== me.lane) { me.lane = to; sfx('tap'); }
  }
  function boost() {
    var R = race, me = R && R.me;
    if (!me || me.fin || R.t < 0 || me.meter < 3 || me.boost > 0) return;
    me.meter = 0; me.boost = R.boostT; me.pad = 0; R.flash = 0.35;
    sfx('car');
  }
  function puff(R, x, y, n, col, o) {
    o = o || {};
    for (var i = 0; i < n; i++) {
      R.parts.push({ x: x + (Math.random() - 0.5) * (o.sx || 20), y: y - Math.random() * (o.sy || 6), vx: (o.vx || 0) + (Math.random() - 0.5) * (o.rx || 120),
        vy: (o.vy || -40) - Math.random() * (o.ry || 60), g: o.g || 0, life: 0, max: (o.max || 0.5) * (0.7 + Math.random() * 0.6), r: (o.r || 5) * (0.7 + Math.random() * 0.6), col: col, grow: o.grow || 0, kind: o.kind || 0, rot: Math.random() * 6 });
    }
    if (R.parts.length > 110) R.parts.splice(0, R.parts.length - 110);
  }
  function hit(R, me, it) {
    var px = me.x + lane(LDX, me.lp), py = lane(LY, me.lp), d;
    me.boost = 0; me.pad = 0;
    if (it.k === 'cone') {
      me.v *= 0.62; me.spin = me.spinD = 0.45; me.spinK = 0; me.inv = 0.9; R.shake = 0.15;
      puff(R, it.x + LDX[it.l], LY[it.l] - 20, 1, '', { kind: 1, vx: 260, rx: 60, vy: -260, ry: 60, g: 900, max: 0.9, r: 1 });
      sfx('wrong');
    } else if (it.k === 'puddle') {
      me.v *= 0.68; me.spin = me.spinD = 0.4; me.spinK = 0; me.inv = 0.6;
      puff(R, px + 20, py - 6, 12, '#A5E2FA', { vx: 120, rx: 260, vy: -150, ry: 160, g: 700, max: 0.6, r: 5, sx: 60 });
      sfx('emote');
    } else if (it.k === 'oil') {
      me.v *= 0.55; me.spin = me.spinD = 0.9; me.spinK = 1; me.inv = 1.3; R.shake = 0.25;
      d = me.lane <= 0 ? 1 : me.lane >= 3 ? -1 : (Math.random() < 0.5 ? -1 : 1);     // the car slides into the next lane
      me.lane += d;
      puff(R, px, py - 6, 8, '#3A2C5C', { rx: 220, vy: -80, ry: 90, g: 500, max: 0.5, r: 5, sx: 50 });
      sfx('wrong');
    } else {
      me.v *= 0.25; me.spin = me.spinD = 0.9; me.spinK = 1; me.inv = 1.4; R.shake = 0.3;
      puff(R, px + 40, py - 30, 9, '#FFE14D', { kind: 2, rx: 420, vy: -120, ry: 260, g: 600, max: 0.5, r: 7 });
      sfx('deny');
    }
  }
  function touch(R, me) { // what my car runs into
    var items = R.items, i, it, dx, off, px, py;
    while (R.ip < items.length && items[R.ip].x < me.x - 170) R.ip++;
    for (i = R.ip; i < items.length; i++) {
      it = items[i]; dx = it.x - me.x;
      if (dx > 170) break;
      if (it.h) continue;
      off = Math.abs(it.l - me.lp);
      if (it.k === 'ramp') {
        if (me.air <= 0 && dx <= 20 && dx >= -70 && off < 0.6) {
          it.h = 1; me.air = AIR_T; me.v = Math.max(me.v, V0 * 0.9);
          puff(R, me.x + lane(LDX, me.lp) - 30, lane(LY, me.lp) - 4, 5, 'rgba(255,255,255,0.8)', { vx: -80, rx: 80, max: 0.4, r: 6, grow: 14 });
          sfx('tagit');
        }
        continue;
      }
      if (it.k === 'bolt' || it.k === 'coin') {
        if (Math.abs(dx) > HW[it.k] + 55 || off > 0.75) continue;
        if (it.a ? me.air <= 0 : me.air > 0.12) continue;
        it.h = 1; px = it.x + LDX[it.l]; py = LY[it.l] - (it.up || 30);
        if (it.k === 'bolt') {
          me.meter = Math.min(3, me.meter + 1);
          puff(R, px, py, 7, '#74DBFF', { kind: 2, rx: 260, vy: -60, ry: 200, g: 300, max: 0.5, r: 5 });
          sfx(me.meter >= 3 ? 'quest' : 'claim');
        } else {
          me.coins++;
          puff(R, px, py, 4, '#FFE14D', { kind: 2, rx: 200, vy: -80, ry: 160, g: 300, max: 0.4, r: 4 });
          sfx('star');
        }
        continue;
      }
      if (it.k === 'pad') {
        if (me.air <= 0.12 && Math.abs(dx) < HW.pad + 30 && off < 0.6) { it.h = 1; me.pad = 1.1; R.flash = 0.2; sfx('emote'); }
        continue;
      }
      if (me.air > 0.12 || me.inv > 0 || Math.abs(dx) > HW[it.k] + 40 || off > 0.5) continue;
      it.h = 1;
      hit(R, me, it);
    }
  }
  function step(R, me, h, tEnd) { // one small step of my car; tEnd = race time at the end of the step
    var k, vt, d, was;
    d = me.lane - me.lp; me.lp += clamp(d, -LANE_V * h, LANE_V * h);
    if (tEnd <= 0) return;
    if (me.fin) { me.v = Math.max(0, me.v - 300 * h); me.x += me.v * h; return; }   // roll out behind the line
    k = me.boost > 0 ? BOOST_K : me.pad > 0 ? PAD_K : 1; vt = V0 * k;
    if (me.v < vt) me.v = Math.min(vt, me.v + ACC * (k > 1 ? 3 : 1) * h); else me.v = Math.max(vt, me.v - 420 * h);
    me.x += me.v * h;
    was = me.air;
    if (me.boost > 0) me.boost -= h;
    if (me.pad > 0) me.pad -= h;
    if (me.spin > 0) me.spin -= h;
    if (me.inv > 0) me.inv -= h;
    if (me.air > 0) me.air -= h;
    if (was > 0 && me.air <= 0) puff(R, me.x + lane(LDX, me.lp), lane(LY, me.lp) - 2, 7, 'rgba(255,255,255,0.8)', { rx: 240, vy: -20, ry: 40, max: 0.45, r: 6, grow: 16, sx: 80 });
    touch(R, me);
    if (me.x >= R.len) {
      me.fin = true; me.boost = 0; me.pad = 0; me.spin = 0;
      me.finMs = Math.max(1, Math.round((tEnd - (me.v > 1 ? (me.x - R.len) / me.v : 0)) * 1000));
      R.finClock = R.clock; R.confetti = 1;
      api.send({ t: 'race.pos', x: R.len, l: me.lane, f: 0 });
      api.send({ t: 'race.finish', ms: me.finMs, coins: me.coins });
      sfx('tagwin');
    }
  }
  function flagsOf(me) { return (me.spin > 0 ? 1 : 0) | ((me.boost > 0 || me.pad > 0) ? 2 : 0) | (me.air > 0 ? 4 : 0); }

  // ---- the other cars ----
  function onPos(m) {
    var R = race, now = nowMs(), i, a, r, dtm, v;
    if (!R || !Array.isArray(m.p)) return;
    for (i = 0; i < m.p.length; i++) {
      a = m.p[i]; r = R.byId[a[0]];
      if (!r || r === R.me || r.done) continue;                     // a car that is home rolls out by itself
      dtm = (now - r.at) / 1000;
      if (r.at && dtm > 0.03) { v = clamp((a[1] - r.tx) / dtm, 0, 900); r.pv = r.pv * 0.4 + v * 0.6; }
      r.tx = a[1]; r.at = now; r.lane = clamp(a[2] | 0, 0, 3);
      if ((a[3] & 1) && !(r.f & 1)) { r.spinA = r.spinD = 0.7; r.spinK = 1; }
      if ((a[3] & 4) && !(r.f & 4)) r.airA = AIR_T;
      r.f = a[3] | 0;
    }
  }
  function moveOthers(R, dt, now) {
    var i, r, ext, d;
    for (i = 0; i < R.racers.length; i++) {
      r = R.racers[i];
      if (r === R.me) {
        r.vv = r.v; r.f = flagsOf(r);
        r.spinA = r.spin > 0 ? r.spin : 0; r.airA = r.air > 0 ? r.air : 0;
        continue;
      }
      if (r.dropped) continue;
      if (r.done) { r.pv = Math.max(0, r.pv - 300 * dt); r.x = Math.min(r.x + r.pv * dt, R.len + 420); }
      else {
        ext = r.tx + r.pv * Math.min(0.3, r.at ? (now - r.at) / 1000 : 0);
        if (Math.abs(ext - r.x) > 700) r.x = ext; else r.x += (ext - r.x) * Math.min(1, dt * 9);
      }
      r.vv = r.pv;
      d = r.lane - r.lp; r.lp += clamp(d, -LANE_V * dt, LANE_V * dt);
      if (r.spinA > 0) r.spinA -= dt;
      if (r.airA > 0) r.airA -= dt;
    }
  }
  function ranking(R) { // finished cars in their order, then everybody else by how far they are
    var list = [], i;
    for (i = 0; i < R.racers.length; i++) if (!R.racers[i].dropped) list.push(R.racers[i]);
    list.sort(function (a, b) {
      if (a.place && b.place) return a.place - b.place;
      if (a.place) return -1;
      if (b.place) return 1;
      return b.x - a.x;
    });
    return list;
  }
  function camera(R, dt) {
    var me = R.me, f = null, i, r, want, target, humans = false;
    for (i = 0; i < R.racers.length; i++) { r = R.racers[i]; if (!r.dropped && !r.done && !r.bot && r !== me) humans = true; }
    if (me && !(me.fin && humans && R.clock - R.finClock > 1.8)) f = me;
    else {
      for (i = 0; i < R.racers.length; i++) { // whoever leads among the players still driving, else among the robots
        r = R.racers[i];
        if (r.dropped || r.done || r === me || (humans && r.bot)) continue;
        if (!f || r.x > f.x) f = r;
      }
      if (!f) f = me || R.rank[0] || R.racers[0];
    }
    R.focus = f;
    want = (f === me && me.boost > 0) ? 0.17 : 0.24;
    R.frac += (want - R.frac) * Math.min(1, dt * 3);
    target = (f ? f.x : 0) - V.W * R.frac / V.S;
    if (f === me && Math.abs(target - V.camL) < 300) V.camL = target;
    else V.camL += (target - V.camL) * Math.min(1, dt * 6);
  }

  function frame() {
    var R = race, now, dt, left, h, me, n;
    if (!root || view !== 'race' || !R) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    now = nowMs(); dt = Math.min(0.25, Math.max(0, (now - last) / 1000)); last = now;
    R.t = (now - R.t0) / 1000; R.clock = (now - R.born) / 1000;
    me = R.me;
    if (me) { // small steps, so a slow tablet does not lose any time
      left = dt;
      while (left > 0.0001) { h = Math.min(left, 1 / 60); left -= h; step(R, me, h, R.t - left); }
      if (!me.fin && R.t > -0.5 && now - R.lastSend >= 95) { R.lastSend = now; api.send({ t: 'race.pos', x: Math.round(me.x), l: me.lane, f: flagsOf(me) }); }
    }
    n = Math.ceil(-R.t);                                          // 3 - 2 - 1 - GO
    if (n < R.beep && n <= 3 && n >= 0) { R.beep = n; sfx(n > 0 ? 'tap' : 'right'); }
    moveOthers(R, dt, now);
    if (now - R.rankAt > 200 || !R.rank.length) { R.rank = ranking(R); R.rankAt = now; }
    camera(R, dt);
    if (R.shake > 0) R.shake -= dt;
    if (R.flash > 0) R.flash -= dt;
    render(R, dt);
    updateInfo();
  }

  // ---- drawing ----
  function flame(c, x, y, sc, t) {
    var L = (38 + Math.sin(t * 43) * 9) * sc, hg = 9 * sc;
    function shape(len, hh) { c.beginPath(); c.moveTo(x, y - hh); c.quadraticCurveTo(x - len * 0.6, y - hh * 0.9, x - len, y); c.quadraticCurveTo(x - len * 0.6, y + hh * 0.9, x, y + hh); c.closePath(); }
    shape(L, hg); c.fillStyle = '#FF7A45'; c.fill(); c.lineWidth = 2 * sc; c.strokeStyle = NAVY; c.stroke();
    shape(L * 0.55, hg * 0.55); c.fillStyle = '#FFE27A'; c.fill();
  }
  function boxCar(c, x, y, s, col) { // only if the Car Garage script is missing
    c.save(); c.translate(x, y); c.scale(s, s);
    rr(c, -58, -34, 116, 26, 9); c.fillStyle = col; c.fill(); ol(c, 3);
    rr(c, -26, -50, 54, 22, 8); c.fillStyle = '#BFE9FF'; c.fill(); ol(c, 3);
    [-36, 36].forEach(function (q) { c.beginPath(); c.arc(q, -12, 12, 0, TAU); c.fillStyle = '#2B3046'; c.fill(); ol(c, 3); });
    c.restore();
  }
  // A designed car is drawn only four times per race, into small pictures: three with the wheels a little further
  // round each time (shown in turn, so they spin) and one standing still. Drawing it anew every frame is slow on old tablets.
  var CAR_W = 214, CAR_H = 110, CAR_OX = 134, CAR_OY = 101;
  function carFrame(r, moving, clock) {
    var q = Math.min(2.25, Math.ceil(V.S * LS[3] * CAR_K * V.dpr * 4) / 4), e = r.spr, i, cnv, g;
    if (!e || e.q !== q) {
      e = r.spr = { q: q, f: [] };
      for (i = 0; i < 4; i++) {
        cnv = document.createElement('canvas'); cnv.width = Math.ceil(CAR_W * q); cnv.height = Math.ceil(CAR_H * q);
        g = cnv.getContext('2d'); g.scale(cnv.width / CAR_W, cnv.height / CAR_H);
        Car.draw(g, CAR_OX, CAR_OY, r.car, { scale: 1, facing: 1, t: i * 0.0465, moving: i < 3, driver: r.bot ? '#AEB6C4' : r.color });
        e.f.push(cnv);
      }
    }
    return e.f[moving ? Math.floor(clock * 22 + r.rid * 1.7) % 3 : 3];
  }
  function drawRacer(c, R, r) {
    var S = V.S, lp = r.lp, sc = S * lane(LS, lp), sx = (r.x - V.camL + lane(LDX, lp)) * S, sy = V.oy + lane(LY, lp) * S;
    var h = 0, rot = 0, u, cy, top, k = sc * CAR_K, isMe = r === R.me;
    if (sx < -170 * S || sx > V.W + 170 * S) return;
    if (r.airA > 0) { u = clamp(1 - r.airA / AIR_T, 0, 1); h = 4 * JUMP_H * u * (1 - u); rot = -0.26 + 0.5 * u; }
    if (r.spinA > 0) {
      u = clamp(1 - r.spinA / r.spinD, 0, 1);
      if (r.spinK) { rot += u * TAU; h += Math.sin(u * Math.PI) * 16; } else { rot += Math.sin(u * TAU * 2) * 0.26 * (1 - u); h += Math.sin(u * Math.PI) * 6; }
    }
    cy = sy - h * sc;
    if (h > 3) { c.fillStyle = 'rgba(27,42,73,' + (0.22 - 0.1 * Math.min(1, h / 90)).toFixed(2) + ')'; ell(c, sx, sy, 60 * k * (1 - 0.25 * Math.min(1, h / 90)), 6 * k); c.fill(); }
    c.save();
    if (rot) { c.translate(sx, cy - 26 * k); c.rotate(rot); c.translate(-sx, -(cy - 26 * k)); }
    if (r.f & 2) flame(c, sx - 62 * k, cy - 21 * k, k, R.clock + r.rid);
    if (Car) c.drawImage(carFrame(r, r.vv > 40, R.clock), sx - CAR_OX * k, cy - CAR_OY * k, CAR_W * k, CAR_H * k);
    else boxCar(c, sx, cy, k, r.color);
    c.restore();
    // the name sits right on the roof, so it is clear which car it belongs to; the others' names are a little smaller
    top = cy - (r.roof + 5) * k;
    u = clamp(S / 1.05, 0.8, 1);                                      // on a small screen the cars are small, so are the names
    if (r.bot) api.label(c, '🤖 ' + r.name, sx, top, '#E8ECF2', NAVY, Math.round(14 * u));
    else if (isMe) { c.save(); c.translate(sx, top); c.scale(u, u); api.nameTag(c, r.tag, 0, 0, true); c.restore(); }
    else { c.save(); c.translate(sx, top); c.scale(u * 0.85, u * 0.85); api.nameTag(c, r.tag, 0, 0, false); c.restore(); }
    if (isMe && R.t < 1.5) { // a bouncing arrow: this one is you
      u = top - 36 - Math.abs(Math.sin(R.clock * 5)) * 10;
      poly(c, [sx - 13, u, sx + 13, u, sx, u + 17]); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 3);
    }
  }
  function drawItem(c, R, it) {
    var S = V.S, sc = S * LS[it.l], sx = (it.x - V.camL + LDX[it.l]) * S, sy = V.oy + LY[it.l] * S, k, s, up;
    if (it.h && (it.k === 'cone' || it.k === 'bolt' || it.k === 'coin')) return;
    if (it.k === 'bolt') {
      c.fillStyle = 'rgba(27,42,73,0.16)'; ell(c, sx, sy, 17 * sc, 4.5 * sc); c.fill();
      drawSprite(c, 'bolt', sx, sy - (34 + Math.sin(R.clock * 4 + it.x * 0.01) * 4) * sc, sc);
    } else if (it.k === 'coin') {
      k = Math.abs(Math.cos(R.clock * 3.2 + it.x * 0.013)); if (k < 0.2) k = 0.2;
      up = it.up || 28;
      c.fillStyle = it.a ? 'rgba(27,42,73,0.08)' : 'rgba(27,42,73,0.16)'; ell(c, sx, sy, 13 * sc, 3.5 * sc); c.fill();
      s = sprite('coin'); c.drawImage(s.c, sx - s.ox * sc * k, sy - up * sc - s.oy * sc, s.w * sc * k, s.h * sc);
    } else drawSprite(c, it.k, sx, sy, sc);
  }
  // The start line and the finish line: a chequered band across the road and a flag pole on each side.
  // The far pole stands behind the cars; the near pole is drawn in front of them, its flag high above the road.
  function gate(c, R, X, fin, front) {
    var S = V.S, x0 = (X - V.camL) * S, oy = V.oy, j, i, y0, y1, a, b, cw = 17 * S, rows = 8, col = fin ? NAVY : '#4FA05A';
    var px = front ? x0 - 7 * S : x0 + 43 * S, pb = oy + (front ? 541 : 316) * S, pt = pb - (front ? 296 : 156) * S;
    var fw = (front ? 66 : 52) * S, fh = (front ? 44 : 35) * S, lw = (front ? 9 : 7) * S, wave = Math.sin(R.clock * 6 + (front ? 1 : 0)) * 4 * S;
    if (x0 < -300 * S || x0 > V.W + 300 * S) return;
    function sk(y) { return 34 * S * (ROAD_B - y) / (ROAD_B - ROAD_T); }
    function cloth() {
      c.beginPath(); c.moveTo(px, pt); c.quadraticCurveTo(px + fw * 0.5, pt + wave, px + fw, pt + 3 * S - wave); c.lineTo(px + fw, pt + fh - wave);
      c.quadraticCurveTo(px + fw * 0.5, pt + fh + wave, px, pt + fh); c.closePath();
    }
    if (!front) {
      for (j = 0; j < rows; j++) {
        y0 = ROAD_T + j * (ROAD_B - ROAD_T) / rows; y1 = y0 + (ROAD_B - ROAD_T) / rows; a = sk(y0); b = sk(y1);
        for (i = 0; i < 2; i++) {
          poly(c, [x0 + a + i * cw, oy + y0 * S, x0 + a + (i + 1) * cw, oy + y0 * S, x0 + b + (i + 1) * cw, oy + y1 * S, x0 + b + i * cw, oy + y1 * S]);
          c.fillStyle = (i + j) % 2 ? col : '#FFFFFF'; c.fill();
        }
      }
    }
    c.lineCap = 'round';
    c.strokeStyle = NAVY; c.lineWidth = lw; c.beginPath(); c.moveTo(px, pb); c.lineTo(px, pt - 4 * S); c.stroke();
    c.strokeStyle = '#E8ECF2'; c.lineWidth = lw * 0.5; c.stroke();
    rr(c, px - lw, pb - lw * 0.6, lw * 2, lw * 1.1, lw * 0.3); c.fillStyle = '#5B6275'; c.fill(); c.lineWidth = 2.5 * S; c.strokeStyle = NAVY; c.stroke();
    cloth(); c.fillStyle = fin ? '#FFFFFF' : '#5DBB72'; c.fill();
    c.save(); cloth(); c.clip();
    if (fin) {
      c.fillStyle = NAVY;
      for (i = 0; i < 5; i++) for (j = 0; j < 4; j++) if ((i + j) % 2) c.fillRect(px + i * fw / 5, pt - 8 * S + j * (fh + 16 * S) / 4, fw / 5 + 0.5, (fh + 16 * S) / 4 + 0.5);
    } else {
      c.fillStyle = '#FFFFFF'; c.fillRect(px, pt + fh * 0.36, fw, fh * 0.28);
    }
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(px + fw * 0.28, pt - 10 * S, fw * 0.16, fh + 20 * S);
    c.restore();
    cloth(); c.lineWidth = 3 * S; c.strokeStyle = NAVY; c.stroke();
    c.beginPath(); c.arc(px, pt - 6 * S, lw * 0.75, 0, TAU); c.fillStyle = '#FFD66B'; c.fill(); c.lineWidth = 2.5 * S; c.stroke();
  }
  function drawParts(c, R, dt) {
    var S = V.S, i, p, a, x, y, s;
    for (i = R.parts.length - 1; i >= 0; i--) {
      p = R.parts[i]; p.life += dt;
      if (p.life >= p.max) { R.parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 9;
      a = 1 - p.life / p.max; x = (p.x - V.camL) * S; y = V.oy + p.y * S;
      if (p.kind === 1) { // a cone knocked away
        s = sprite('cone'); c.save(); c.translate(x, y); c.rotate(p.rot); c.globalAlpha = Math.min(1, a * 2);
        c.drawImage(s.c, -s.ox * S * 0.9, -s.oy * S * 0.9 + 26 * S, s.w * S * 0.9, s.h * S * 0.9); c.restore();
      } else if (p.kind === 2) { // a little star
        c.globalAlpha = a; star(c, x, y, p.r * S * (0.6 + a)); c.fillStyle = p.col; c.fill(); c.lineWidth = 1.5; c.strokeStyle = NAVY; c.stroke();
      } else {
        c.globalAlpha = a * 0.9; c.beginPath(); c.arc(x, y, (p.r + p.grow * (1 - a)) * S, 0, TAU); c.fillStyle = p.col; c.fill();
      }
    }
    c.globalAlpha = 1;
  }
  function pill(c, x, y, w, h, bg) { rr(c, x, y, w, h, h / 2); c.fillStyle = bg; c.fill(); c.lineWidth = 3; c.strokeStyle = NAVY; c.stroke(); }
  function roundBtn(c, b, face, down) { // a chunky button: a darker rim underneath, the face on top
    var y = b.y + (down ? 4 : 0);
    c.beginPath(); c.arc(b.x, b.y + 7, b.r, 0, TAU); c.fillStyle = shade(face, -0.35); c.fill(); c.lineWidth = 4; c.strokeStyle = NAVY; c.stroke();
    c.beginPath(); c.arc(b.x, y, b.r, 0, TAU); c.fillStyle = face; c.fill(); c.stroke();
    c.beginPath(); c.arc(b.x, y, b.r - 7, Math.PI * 1.08, Math.PI * 1.55); c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 4; c.lineCap = 'round'; c.stroke();
    return y;
  }
  function drawControls(c, R) {
    var me = R.me, now = nowMs(), y, b, r, i, a0, full, pulse, P = V.press;
    if (!me || me.fin) return;
    c.globalAlpha = 0.88;
    [[V.up, -1, 'up'], [V.dn, 1, 'dn']].forEach(function (q) {
      b = q[0]; r = b.r * 0.42;
      y = roundBtn(c, b, '#FFFFFF', now - (P[q[2]] || 0) < 130);
      poly(c, [b.x - r, y + q[1] * -r * 0.45, b.x + r, y + q[1] * -r * 0.45, b.x, y + q[1] * r * 0.75]); c.fillStyle = NAVY; c.fill(); c.lineWidth = 5; c.lineJoin = 'round'; c.strokeStyle = NAVY; c.stroke();
    });
    b = V.bo; full = me.meter >= 3 && me.boost <= 0; pulse = full ? 0.5 + 0.5 * Math.sin(R.clock * 8) : 0;
    if (full) { c.beginPath(); c.arc(b.x, b.y, b.r + 16 + pulse * 7, 0, TAU); c.fillStyle = 'rgba(255,214,107,' + (0.35 + pulse * 0.25).toFixed(2) + ')'; c.fill(); }
    y = roundBtn(c, b, me.boost > 0 ? '#FF7A45' : full ? '#FFD66B' : '#E3EAF3', now - (P.bo || 0) < 130);
    boltPath(c, b.x, y - b.r * 0.16, b.r / 30); c.fillStyle = full || me.boost > 0 ? '#FFFFFF' : '#B9C4D4'; c.fill(); c.lineWidth = 3; c.strokeStyle = NAVY; c.stroke();
    c.font = '700 ' + Math.round(b.r * 0.34) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = NAVY;
    c.fillText('BOOST', b.x, y + b.r * 0.55);
    // three bolt lights around the button; while boosting, a ring that runs down
    c.lineCap = 'round';
    if (me.boost > 0) {
      a0 = -Math.PI / 2;
      c.beginPath(); c.arc(b.x, b.y, b.r + 9, a0, a0 + TAU * clamp(me.boost / R.boostT, 0, 1)); c.lineWidth = 11; c.strokeStyle = NAVY; c.stroke(); c.lineWidth = 5.5; c.strokeStyle = '#FF7A45'; c.stroke();
    } else {
      for (i = 0; i < 3; i++) {
        a0 = -Math.PI / 2 - 1.2 + i * 0.86;
        c.beginPath(); c.arc(b.x, b.y, b.r + 9, a0, a0 + 0.68); c.lineWidth = 12; c.strokeStyle = NAVY; c.stroke();
        c.lineWidth = 6.5; c.strokeStyle = i < me.meter ? '#5CD4FF' : '#FFFFFF'; c.stroke();
      }
    }
    c.globalAlpha = 1;
  }
  function drawHud(c, R) {
    var W = V.W, sm = V.small, h = sm ? 42 : 48, y = sm ? 13 : 12, tw = sm ? 100 : 118, pw = sm ? 92 : 108, xr = W - 10, me = R.me;
    var ms = me && me.fin ? me.finMs : Math.max(0, R.t * 1000), n = R.rank.length, place = 0, i, r, x0, x1, cy, bw, px, s, left;
    c.textBaseline = 'middle';
    pill(c, xr - tw, y, tw, h, '#FFFFFF');
    c.font = '700 ' + (sm ? 21 : 24) + 'px ' + FONT; c.textAlign = 'center'; c.fillStyle = NAVY; c.fillText(fmt(ms), xr - tw / 2, y + h / 2 + 1);
    if (me) {
      for (i = 0; i < n; i++) if (R.rank[i] === me) place = i + 1;
      pill(c, xr - tw - 8 - pw, y, pw, h, '#FFD66B');
      c.fillStyle = NAVY;
      c.font = '700 ' + (sm ? 24 : 28) + 'px ' + FONT; c.textAlign = 'right'; c.fillText(ord(place || 1), xr - tw - 8 - pw / 2 + 10, y + h / 2 + 1);
      c.font = '600 ' + (sm ? 15 : 17) + 'px ' + FONT; c.textAlign = 'left'; c.fillText('/' + n, xr - tw - 8 - pw / 2 + 12, y + h / 2 + 4);
      // star tokens: only a score
      pill(c, xr - 86, y + h + 6, 86, 32, 'rgba(255,255,255,0.92)');
      drawSprite(c, 'coin', xr - 66, y + h + 22, 0.52);
      c.font = '700 19px ' + FONT; c.textAlign = 'left'; c.fillStyle = NAVY; c.fillText(String(me.coins), xr - 50, y + h + 23);
    }
    if (R.hurryEnd && !(me && me.fin)) { // the first player is home: the clock is running for the others
      left = Math.max(0, Math.ceil((R.hurryEnd - nowMs()) / 1000));
      pill(c, xr - tw - 8 - pw, y + h + 6, pw, 32, '#FF4F6D');
      c.font = '700 18px ' + FONT; c.textAlign = 'center'; c.fillStyle = '#FFFFFF'; c.fillText('⏱ ' + left, xr - tw - 8 - pw / 2, y + h + 23);
    }
    // the progress bar with every racer on it
    x0 = V.hudL + 12; x1 = W - (tw + pw + 8 + 10) - 26; cy = y + h / 2; bw = x1 - x0;
    if (bw < 70) return;
    rr(c, x0 - 12, cy - 9, bw + 24, 18, 9); c.fillStyle = 'rgba(255,255,255,0.92)'; c.fill(); c.lineWidth = 3; c.strokeStyle = NAVY; c.stroke();
    if (me) { rr(c, x0 - 9, cy - 6, Math.max(12, clamp(me.x / R.len, 0, 1) * bw + 9), 12, 6); c.fillStyle = '#FFD66B'; c.fill(); }
    for (i = 0; i < 3; i++) for (s = 0; s < 2; s++) { c.fillStyle = (i + s) % 2 ? '#FFFFFF' : NAVY; c.fillRect(x1 + 2 + s * 6, cy - 9 + i * 6, 6, 6); }  // the flag at the end
    c.lineWidth = 2; c.strokeStyle = NAVY; c.strokeRect(x1 + 2, cy - 9, 12, 18);
    for (i = n - 1; i >= 0; i--) {
      r = R.rank[i];
      if (r === me) continue;
      px = x0 + clamp(r.x / R.len, 0, 1) * bw;
      c.beginPath(); c.arc(px, cy, r.bot ? 7 : 9, 0, TAU); c.fillStyle = r.cc; c.fill(); c.lineWidth = 2.5; c.strokeStyle = NAVY; c.stroke();
      if (r.bot) { c.fillStyle = NAVY; c.fillRect(px - 3.5, cy - 1.5, 2.6, 2.6); c.fillRect(px + 1, cy - 1.5, 2.6, 2.6); }
    }
    if (me) {
      px = x0 + clamp(me.x / R.len, 0, 1) * bw;
      c.beginPath(); c.arc(px, cy, 12, 0, TAU); c.fillStyle = '#FFFFFF'; c.fill(); c.lineWidth = 3; c.strokeStyle = NAVY; c.stroke();
      c.beginPath(); c.arc(px, cy, 7.5, 0, TAU); c.fillStyle = me.cc; c.fill(); c.lineWidth = 2; c.stroke();
    }
  }
  function drawCount(c, R) {
    var t = R.t, txt = null, k = 0, col = '#FFFFFF', s, x = V.W / 2, y = V.H * 0.4;
    if (t < 0 && t >= -3) { txt = String(Math.ceil(-t)); k = 1 - (-t - Math.floor(-t)); if (txt === '0') txt = '1'; }
    else if (t >= 0 && t < 0.9) { txt = 'GO!'; k = t / 0.9; col = '#8FE89B'; }
    if (!txt) return;
    s = (V.small ? 120 : 170) * (1.3 - 0.3 * Math.min(1, k * 5));
    c.save(); c.globalAlpha = k > 0.75 ? Math.max(0, (1 - k) * 4) : 1;
    c.font = '700 ' + Math.round(s) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.lineWidth = s * 0.16; c.strokeStyle = NAVY; c.strokeText(txt, x, y);
    c.fillStyle = col; c.fillText(txt, x, y);
    c.restore();
  }
  function render(R, dt) {
    var c = ctx, W = V.W, H = V.H, S = V.S, scn = SCN[R.ti], items = R.items, i, l, x0, x1, vis = [[], [], [], []], cars = [[], [], [], []], r, me = R.me;
    if (!W || !H) return;
    c.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    c.lineJoin = 'round'; c.lineCap = 'round'; c.globalAlpha = 1;
    if (!V.sky) V.sky = lin(c, 0, 0, 0, V.oy + 330 * S, scn.sky[0], scn.sky[1]);
    c.fillStyle = V.sky; c.fillRect(0, 0, W, H);
    c.save(); c.translate(0, V.oy); c.scale(S, S); scn.back(c, W / S, R.clock); c.restore();
    if (!tiles || tiles.ti !== R.ti) buildTiles(R.ti);
    c.save();
    if (R.shake > 0) c.translate((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 7);
    drawTile(c, 'far'); drawTile(c, 'mid'); drawTile(c, 'ground');
    gate(c, R, 150, false, false); gate(c, R, R.len, true, false);
    // what is on the road, lane by lane from the far side to the near side
    x0 = V.camL - 240; x1 = V.camL + W / S + 240;
    for (i = 0; i < items.length; i++) { if (items[i].x < x0) continue; if (items[i].x > x1) break; vis[items[i].l].push(items[i]); }
    for (i = 0; i < R.racers.length; i++) { r = R.racers[i]; if (!r.dropped) cars[clamp(Math.round(r.lp), 0, 3)].push(r); }
    for (l = 0; l < 4; l++) {
      for (i = 0; i < vis[l].length; i++) drawItem(c, R, vis[l][i]);
      cars[l].sort(function (a, b) { return (a === me ? 1 : 0) - (b === me ? 1 : 0) || a.x - b.x; });
      for (i = 0; i < cars[l].length; i++) drawRacer(c, R, cars[l][i]);
    }
    drawParts(c, R, dt);
    gate(c, R, 150, false, true); gate(c, R, R.len, true, true);
    drawTile(c, 'fg');
    c.restore();
    if (me && (me.boost > 0 || me.pad > 0)) { // speed lines
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 4;
      for (i = 0; i < 9; i++) {
        x0 = W + 200 - ((R.clock * (900 + i * 120) + i * 211) % (W + 400)); x1 = V.oy + (150 + prn(i + 5) * 380) * S;
        c.beginPath(); c.moveTo(x0, x1); c.lineTo(x0 + 70 + i * 12, x1); c.stroke();
      }
    }
    if (R.flash > 0) { c.fillStyle = 'rgba(255,255,255,' + (R.flash * 0.9).toFixed(2) + ')'; c.fillRect(0, 0, W, H); }
    if (R.confetti) { // I crossed the line
      R.confetti = 0;
      for (i = 0; i < 40; i++) puff(R, V.camL + Math.random() * W / S, 60 + Math.random() * 120, 1, ['#FF4F6D', '#FFD66B', '#5ED6C4', '#9B6BFF', '#FF8FB8'][i % 5], { kind: 2, rx: 160, vy: 60, ry: -120, g: 260, max: 1.6, r: 7 });
    }
    drawCount(c, R);
    drawHud(c, R);
    drawControls(c, R);
  }

  // ---- touch and keys ----
  function inBtn(b, x, y) { var dx = x - b.x, dy = y - b.y; return dx * dx + dy * dy <= (b.r + 12) * (b.r + 12); }
  var drag = null;
  function onDown(e) {
    var R = race, r, x, y;
    if (view !== 'race' || !R || !R.me || R.me.fin) return;
    r = cv.getBoundingClientRect(); x = e.clientX - r.left; y = e.clientY - r.top;
    e.preventDefault();
    if (inBtn(V.bo, x, y)) { V.press.bo = nowMs(); boost(); return; }
    if (inBtn(V.up, x, y)) { V.press.up = nowMs(); steer(-1); return; }
    if (inBtn(V.dn, x, y)) { V.press.dn = nowMs(); steer(1); return; }
    if (drag) return;
    drag = { id: e.pointerId, y: e.clientY };
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  }
  function onMove(e) {
    var th;
    if (!drag || e.pointerId !== drag.id) return;
    th = Math.max(30, V.H * 0.075);                               // this far up or down is one lane
    while (e.clientY - drag.y > th) { drag.y += th; steer(1); }
    while (e.clientY - drag.y < -th) { drag.y -= th; steer(-1); }
  }
  function onUp(e) { if (drag && e.pointerId === drag.id) drag = null; }
  function onKey(e) {
    var k = (e.key || '').toLowerCase();
    if (!root || view !== 'race' || !race || !race.me || e.repeat) return;
    if (k === 'arrowup' || k === 'w') { V.press.up = nowMs(); steer(-1); }
    else if (k === 'arrowdown' || k === 's') { V.press.dn = nowMs(); steer(1); }
    else if (k === ' ' || k === 'arrowright' || k === 'enter' || k === 'd') { V.press.bo = nowMs(); boost(); }
    else return;
    e.preventDefault();
  }

  // ---- the card under the progress bar: the track name at the start, my result at the end ----
  function setInfo(html) {
    if (!info || html === infoHtml) return;
    infoHtml = html; info.innerHTML = html; info.hidden = !html;
  }
  function updateInfo() {
    var R = race, T, w = lastReward, h = '';
    if (view !== 'race' || !R) { setInfo(''); return; }
    T = TRACKS[R.ti];
    if (w) {
      h = '<b>' + medal(w.place) + ' ' + ord(w.place) + '</b>' + (w.dnf ? '' : ' · ⏱ ' + fmt(w.ms)) + ' · ' +
        (w.bonus ? w.base + ' + ' + w.bonus + ' = ' : '+') + w.stars + ' ⭐' + (w.cup ? ' · ' + badge(w.cup, true) + ' ' + BADGE_NAMES[w.cup - 1] + '!' : w.newBest ? ' · 🎉 Best time!' : '');
    } else if (!R.me) h = '👀 Watching · the next race starts soon';
    else if (R.t < -2.9) h = T.icon + ' ' + api.three(T);
    setInfo(h);
  }

  // =====================================================================================================
  // The lobby
  // =====================================================================================================
  var CSS = [
    '.race-root{background:#8ED8F8;color:#1B2A49;overflow:hidden;font-family:inherit;touch-action:none}',
    '.race-root .py{font-family:system-ui,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif}',
    '.race-cv{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none}',
    '.race-back{position:absolute;left:10px;top:10px;z-index:9;height:52px;font-size:18px;padding:0 16px;white-space:nowrap}',
    '.race-lobby{position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;gap:8px;padding:10px;background:linear-gradient(#8ED8F8,#DDF5FF)}',
    '.race-top{flex:none;height:52px;display:flex;align-items:center;gap:10px;padding-left:168px}',
    '.race-top h2{flex:1;min-width:0;font-size:28px;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.race-tri{font-size:17px;font-weight:600}',
    '.race-top .pill{flex:none}',
    '.race-body{flex:1;min-height:0;display:flex;gap:10px}',
    '.race-box{background:#FFF3D6;border:4px solid #1B2A49;border-radius:22px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;min-height:0}',
    '.race-h{flex:none;font-size:19px;font-weight:700;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.race-who{flex:0 0 29%;min-width:200px;max-width:350px}',
    '.race-list{flex:1;min-height:0;display:flex;flex-direction:column;gap:5px;overflow:hidden}',
    '.race-row{flex:none;height:56px;display:flex;align-items:center;gap:6px;background:#fff;border:3px solid #1B2A49;border-radius:16px;padding:0 8px 0 4px;overflow:hidden}',
    '.race-row.me{background:#FFE9A8}',
    '.race-row canvas{flex:none;width:86px;height:48px}',
    '.race-row b{flex:1;min-width:0;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.race-row .race-v{flex:none;font-size:20px;line-height:1}',
    '.race-ok{flex:none;width:32px;height:32px;border-radius:50%;border:3px solid #1B2A49;background:#fff;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;color:#8A8F98}',
    '.race-ok.on{background:#7BD389;color:#1B2A49;animation:ftPop .25s ease-out}',
    '.race-list.many .race-row{height:38px}',
    '.race-list.many .race-row canvas{display:none}',
    '.race-list.many .race-row b{padding-left:6px}',
    '.race-bots{flex:none;font-size:16px;font-weight:600;min-height:20px}',
    '.race-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}',
    '.race-tracks{flex:none;display:flex;gap:10px;padding:2px}',
    '.race-card{flex:1 1 0;min-width:0;position:relative;border:4px solid #1B2A49;border-radius:20px;background:#fff;padding:0 4px 5px;overflow:hidden;display:flex;flex-direction:column;align-items:center;font-size:14px;font-weight:600;line-height:1.2;color:#1B2A49}',
    '.race-card canvas{display:block;width:calc(100% + 8px);margin:0 -4px 3px;border-bottom:3px solid #1B2A49}',
    '.race-card.on{background:#FFD66B;box-shadow:0 0 0 4px #1B2A49}',
    '.race-card:active{transform:scale(.97)}',
    '.race-card b{font-size:18px}',
    '.race-nm{max-width:100%;text-align:center}',
    '.race-lv{display:inline-flex;gap:2px;margin-left:6px;vertical-align:middle}',
    '.race-lv i{width:10px;height:10px;border-radius:50%;border:2px solid #1B2A49;background:#fff}',
    '.race-lv i.f{background:#FF7A45}',
    '.race-pick{position:absolute;left:6px;top:6px;display:flex;flex-wrap:wrap;gap:3px;max-width:calc(100% - 82px)}',
    '.race-pick i{width:15px;height:15px;border-radius:5px;border:2px solid #1B2A49}',
    '.race-cups{position:absolute;right:5px;top:5px;display:flex;gap:2px}',
    '.race-cup{display:inline-flex;align-items:center;justify-content:center;width:19px;height:19px;border-radius:50%;border:2px solid #1B2A49;background:#fff;color:#C4CAD4;font-style:normal;font-size:11px;line-height:1;vertical-align:middle}',
    '.race-cup.on{color:#fff}.race-cup.on.c1{background:#D9864A}.race-cup.on.c2{background:#AEB9C9}.race-cup.on.c3{background:#FFC21A}',
    '.race-next{flex:none;font-size:15px;font-weight:700;background:#fff;border:2px solid #1B2A49;border-radius:999px;padding:0 9px;white-space:nowrap}',
    '.race-bh{flex:none;display:flex;align-items:center;gap:8px}',
    '.race-bh .race-h{flex:1;min-width:0}',
    '.race-mine{position:absolute;left:6px;background:#1B2A49;color:#fff;border-radius:999px;padding:0 8px;font-size:13px;font-weight:700;line-height:1.5;white-space:nowrap}',
    '.race-low{flex:1;min-height:0;display:flex;gap:8px}',
    '.race-board{flex:1 1 0;min-width:0}',
    '.race-board ol{flex:1;min-height:0;margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:3px;overflow:hidden}',
    '.race-board li{flex:none;display:flex;align-items:center;gap:8px;font-size:17px;font-weight:600;background:#fff;border:2px solid #1B2A49;border-radius:12px;padding:0 10px;height:27px}',
    '.race-board li.me{background:#FFE9A8}',
    '.race-board li.none{background:none;border:0;font-weight:500;height:auto;padding:4px 2px;line-height:1.25}',
    '.race-board li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.race-board li em{flex:none;font-style:normal;font-weight:700}',
    '.race-go{flex:0 0 42%;min-width:0;display:flex;flex-direction:column;gap:6px;justify-content:flex-end}',
    '.race-pay{display:flex;flex-wrap:wrap;gap:4px 5px;justify-content:center;font-size:16px;font-weight:700}',
    '.race-pay span{background:#fff;border:2px solid #1B2A49;border-radius:999px;padding:1px 8px;white-space:nowrap}',
    '.race-today{text-align:center;font-size:16px;font-weight:600;line-height:1.2;min-height:20px}',
    '.race-ready{flex:none;height:72px;font-size:28px;width:100%;padding:0 8px;white-space:nowrap}',
    '.race-ready.on{background:#7BD389}',
    '.race-info{position:absolute;left:50%;top:70px;transform:translateX(-50%);z-index:5;background:#FFF3D6;border:4px solid #1B2A49;border-radius:20px;padding:5px 16px;font-size:18px;font-weight:600;text-align:center;max-width:92%;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.race-info b{font-size:21px}',
    '.race-res{position:absolute;left:0;top:0;right:0;bottom:0;z-index:8;background:rgba(27,42,73,.55);display:flex;align-items:center;justify-content:center;padding:10px;touch-action:auto}',
    '.race-panel{background:#FFF3D6;border:5px solid #1B2A49;border-radius:28px;padding:12px 16px;width:100%;max-width:560px;max-height:100%;overflow-y:auto;touch-action:pan-y;display:flex;flex-direction:column;gap:7px;animation:ftPop .3s ease-out}',
    '.race-panel h3{margin:0;font-size:25px;text-align:center;line-height:1.1}',
    '.race-sub{font-size:15px;font-weight:600;text-align:center}',
    '.race-rl{display:flex;flex-direction:column;gap:4px}',
    '.race-rr{flex:none;display:flex;align-items:center;gap:8px;background:#fff;border:3px solid #1B2A49;border-radius:14px;padding:0 10px;font-size:18px;font-weight:600;height:40px}',
    '.race-rr.me{background:#FFE9A8}',
    '.race-pl{flex:none;width:34px;text-align:center;font-size:22px;font-weight:700}',
    '.race-rr i{flex:none;width:20px;height:20px;border-radius:7px;border:2px solid #1B2A49}',
    '.race-rr span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.race-rr em{flex:none;font-style:normal;font-weight:700}',
    '.race-rr u{flex:none;text-decoration:none;font-weight:700;min-width:58px;text-align:right}',
    '.race-sum{text-align:center;font-size:20px;font-weight:700;line-height:1.25}',
    '.race-panel .btn{flex:none;align-self:center;min-width:210px}',
    '@media (max-width:900px),(max-height:560px){' +
      '.race-back{height:48px;font-size:16px;padding:0 12px;border-width:3px}.race-top{height:48px;padding-left:138px}.race-top h2{font-size:22px}.race-tri{font-size:14px}' +
      '.race-top .pill{height:44px;font-size:20px}.race-h{font-size:17px}.race-row{height:50px}.race-row canvas{width:74px;height:42px}.race-row b{font-size:16px}' +
      '.race-card{font-size:12.5px;border-radius:16px}.race-card b{font-size:15px}.race-board li{font-size:15px;height:25px}' +
      '.race-pay{font-size:14px}.race-today{font-size:14px}.race-ready{height:62px;font-size:24px}.race-box{padding:6px 8px;border-radius:18px}' +
      '.race-info{top:62px;font-size:15px;border-width:3px;padding:4px 12px}.race-info b{font-size:17px}' +
      '.race-panel{padding:8px 12px;border-radius:22px;gap:5px}.race-panel h3{font-size:21px}.race-rr{height:35px;font-size:16px}.race-sum{font-size:17px}.race-panel .btn{height:50px}}',
    '@media (min-height:700px) and (min-width:1100px){.race-card{font-size:16px}.race-card b{font-size:21px}.race-board li{font-size:20px;height:36px}.race-h{font-size:22px}' +
      '.race-row{height:66px}.race-row canvas{width:104px;height:58px}.race-row b{font-size:21px}.race-pay{font-size:19px}.race-today{font-size:19px}.race-ready{height:84px;font-size:34px}}'
  ].join('\n');

  function myCar() { var p = api.self(); return (p && p.car) || (Car ? Car.defaults() : null); }
  function drawThumb(canvas, ti) { // a little picture of the track for its card
    var g = canvas.getContext('2d'), w = canvas.width, h = canvas.height, k = h / 470, scn = SCN[ti], p = api.self();
    function put(kind, x, l, up) { var s = sprite(kind), sc = LS[l]; g.drawImage(s.c, x + LDX[l] - s.ox * sc, LY[l] - (up || 0) - s.oy * sc, s.w * sc, s.h * sc); }
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
    g.fillStyle = lin(g, 0, 0, 0, h * 0.62, scn.sky[0], scn.sky[1]); g.fillRect(0, 0, w, h);
    g.scale(k, k); g.translate(0, -84);
    scn.back(g, w / k, 1); scn.far(g, TILE.far.w); scn.mid(g, TILE.mid.w); paintGround(g, TILE.ground.w, scn);
    put('cone', 600, 1); put('bolt', 760, 2, 34); put('coin', 470, 3, 28); put('coin', 560, 3, 28);
    if (ti > 0) put('barrier', 800, 0);
    if (ti > 1) put('oil', 640, 3);
    if (Car) Car.draw(g, 250, LY[2], myCar(), { scale: LS[2] * CAR_K * 1.3, facing: 1, t: 0.5, moving: true, driver: p ? p.color : '#FF7A45' });
    g.restore();
  }
  function buildLobby() {
    lob = el('div', 'race-lobby',
      '<div class="race-top"><h2>🏁 Race Track <span class="race-tri">赛车场 <span class="py">sàichēchǎng</span> · Litar Lumba</span></h2>' +
      '<div class="pill dark" title="Stars you can spend"><span class="ico">⭐</span><span class="race-coins">0</span></div></div>' +
      '<div class="race-body"><div class="race-box race-who"><div class="race-h">Racers</div><div class="race-list"></div><div class="race-bots"></div></div>' +
      '<div class="race-main"><div class="race-tracks"></div><div class="race-low"><div class="race-box race-board"><div class="race-bh"><div class="race-h"></div><div class="race-next"></div></div><ol></ol></div>' +
      '<div class="race-go"><div class="race-pay"></div><div class="race-today"></div><button type="button" class="btn primary race-ready" data-quiet>🏁 Ready!</button></div></div></div></div>');
    ui.coins = lob.querySelector('.race-coins'); ui.list = lob.querySelector('.race-list'); ui.bots = lob.querySelector('.race-bots');
    ui.tracks = lob.querySelector('.race-tracks'); ui.boardH = lob.querySelector('.race-board .race-h'); ui.next = lob.querySelector('.race-next'); ui.board = lob.querySelector('.race-board ol');
    ui.pay = lob.querySelector('.race-pay'); ui.today = lob.querySelector('.race-today'); ui.ready = lob.querySelector('.race-ready');
    ui.cards = [];
    TRACKS.forEach(function (T, i) {
      var b = el('button', 'race-card'), c = document.createElement('canvas'), dots = '', n;
      b.type = 'button'; b.setAttribute('data-quiet', ''); b.setAttribute('aria-label', T.en);
      c.width = 360; c.height = 168; b.appendChild(c);
      for (n = 0; n < 3; n++) dots += '<i' + (n < T.dots ? ' class="f"' : '') + '></i>';
      b.appendChild(el('div', 'race-pick')); b.appendChild(el('div', 'race-cups')); b.appendChild(el('div', 'race-mine'));
      b.appendChild(el('b', '', T.icon + ' ' + esc(T.en) + '<span class="race-lv" title="How hard">' + dots + '</span>'));
      b.appendChild(el('span', 'race-nm', esc(T.zh) + ' <span class="py">' + esc(T.py) + '</span>'));
      b.appendChild(el('span', 'race-nm', esc(T.ms)));
      b.addEventListener('click', function () {
        sfx('tap');
        try { localStorage.setItem('ft_race_track', String(i)); } catch (e) {}
        api.send({ t: 'race.vote', track: i });
      });
      ui.tracks.appendChild(b);
      ui.cards.push({ b: b, cv: c, pick: b.querySelector('.race-pick'), cups: b.querySelector('.race-cups'), mine: b.querySelector('.race-mine') });
    });
    ui.ready.addEventListener('click', function () {
      var me = meInLobby();
      sfx(me && me.ready ? 'tap' : 'open');
      api.send({ t: 'race.ready', on: !(me && me.ready) });
    });
    root.appendChild(lob);
  }
  function meInLobby() {
    var i, my;
    if (!lobby || !Array.isArray(lobby.who)) return null;
    my = lobby.you || api.myId();
    for (i = 0; i < lobby.who.length; i++) if (lobby.who[i].id === my) return lobby.who[i];
    return null;
  }
  function renderLobby() {
    var L = lobby, me, sel, i, w, row, c, g, T, list, html, half, n, st, waiting = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!root || !lob || !L) return;
    me = meInLobby(); st = api.me();
    ui.coins.textContent = st ? st.coins : '0';
    // who is here
    ui.list.innerHTML = ''; ui.list.className = 'race-list' + (L.who.length > 5 ? ' many' : '');
    for (i = 0; i < L.who.length; i++) {
      w = L.who[i]; if (!w.ready) waiting++;
      row = el('div', 'race-row' + (me && w.id === me.id ? ' me' : ''));
      c = document.createElement('canvas'); c.width = Math.round(104 * dpr); c.height = Math.round(58 * dpr);
      g = c.getContext('2d'); g.scale(c.width / 104, c.height / 58);
      if (Car) Car.draw(g, 52, 53, w.car || Car.defaults(), { scale: 0.7, facing: 1, t: 0.5, moving: false, driver: w.color });
      row.appendChild(c);
      row.appendChild(el('b', '', esc(w.name)));
      if (w.vote >= 0 && TRACKS[w.vote]) row.appendChild(el('span', 'race-v', TRACKS[w.vote].icon));
      row.appendChild(el('span', 'race-ok' + (w.ready ? ' on' : ''), w.ready ? '✔' : '…'));
      ui.list.appendChild(row);
    }
    n = Math.max(0, (L.grid || 4) - L.who.length);
    ui.bots.innerHTML = n ? '🤖 × ' + n + ' robot car' + (n > 1 ? 's' : '') + ' will join' : '';
    // the tracks, with everybody's pick
    sel = me && me.vote >= 0 ? me.vote : (L.cur | 0);
    for (i = 0; i < ui.cards.length; i++) {
      c = ui.cards[i]; html = '';
      c.b.className = 'race-card' + (me && me.vote === i ? ' on' : '');
      for (n = 0; n < L.who.length; n++) if (L.who[n].vote === i) html += '<i style="background:' + esc(L.who[n].color) + '"></i>';
      c.pick.innerHTML = html;
      w = (L.cups && L.cups[TRACKS[i].id]) | 0; html = '';
      for (n = 0; n < 3; n++) html += badge(n + 1, w > n);
      c.cups.innerHTML = html;
      w = L.best && L.best[TRACKS[i].id];
      c.mine.textContent = w > 0 ? '⏱ ' + fmt(w) : ''; c.mine.style.display = w > 0 ? '' : 'none';
      c.mine.style.top = Math.max(0, c.cv.offsetHeight - 26) + 'px';
    }
    // the family's best times on the picked track
    T = TRACKS[sel] || TRACKS[0]; list = (L.board && L.board[T.id]) || [];
    ui.boardH.innerHTML = '🏆 ' + T.icon + ' ' + esc(T.en);
    w = (L.cups && L.cups[T.id]) | 0; n = L.goals && L.goals[T.id];
    ui.next.style.display = n ? '' : 'none';
    if (n) ui.next.innerHTML = w >= 3 ? badge(3, true) + ' ✔' : badge(w + 1, true) + ' ' + fmt(n[w]);   // the time to beat for the next badge
    html = '';
    for (i = 0; i < list.length; i++) html += '<li' + (list[i].me ? ' class="me"' : '') + '><em>' + medal(i + 1) + '</em><span>' + esc(list[i].name) + '</span><em>' + fmt(list[i].ms) + '</em></li>';
    ui.board.innerHTML = html || '<li class="none">No times yet. Be the first on the board!</li>';
    // what a race pays, and the Ready button
    half = L.n >= L.cap; html = '';
    for (i = 0; i < (L.pay || []).length; i++) html += '<span>' + (i < 3 ? medal(i + 1) : ord(i + 1)) + ' ' + (half ? Math.ceil(L.pay[i] / 2) : L.pay[i]) + ' ⭐</span>';
    ui.pay.innerHTML = html;
    if (me && me.ready && waiting) ui.today.textContent = 'Waiting for the others…';
    else if (!L.n) ui.today.innerHTML = '🎁 First race today: <b>+' + L.bonus + ' ⭐</b>';
    else if (half) ui.today.textContent = L.cap + ' races done today: half stars until tomorrow';
    else ui.today.textContent = 'Races today: ' + L.n + ' / ' + L.cap;
    ui.ready.className = 'btn primary race-ready' + (me && me.ready ? ' on' : '');
    ui.ready.innerHTML = me && me.ready ? '✔ Ready!' : '🏁 Ready!';
    // the first time in (and again after a reconnect, when the server has forgotten): pick the track from last time
    if (me && me.vote < 0 && autoVoted !== me.id && L.phase === 'lobby') {
      autoVoted = me.id; n = 0;
      try { n = parseInt(localStorage.getItem('ft_race_track'), 10) || 0; } catch (e) {}
      api.send({ t: 'race.vote', track: clamp(n, 0, TRACKS.length - 1) });
    }
  }
  function drawThumbs() { if (ui.cards) ui.cards.forEach(function (c, i) { try { drawThumb(c.cv, i); } catch (e) { if (window.console) console.error(e); } }); }

  function showResults(m) {
    var T = TRACKS[m.track] || TRACKS[0], my = api.myId(), w = lastReward, h, i, r, btn;
    h = '<h3>🏁 ' + T.icon + ' ' + esc(T.en) + '</h3><div class="race-sub">' + esc(T.zh) + ' <span class="py">' + esc(T.py) + '</span> · ' + esc(T.ms) + '</div><div class="race-rl">';
    for (i = 0; i < m.results.length; i++) {
      r = m.results[i];
      h += '<div class="race-rr' + (!r.bot && r.pid === my ? ' me' : '') + '"><div class="race-pl">' + medal(r.place) + '</div><i style="background:' + esc(r.color) + '"></i><span>' +
        (r.bot ? '🤖 ' : '') + esc(r.name) + '</span><em>' + (r.ms ? fmt(r.ms) : '—') + '</em><u>' + (!r.bot && r.stars ? '+' + r.stars + ' ⭐' : '') + '</u></div>';
    }
    h += '</div>';
    if (w) {
      h += '<div class="race-sum">' + (w.bonus ? w.base + ' + ' + w.bonus + ' = ' + w.stars + ' ⭐ <span style="font-weight:600">(🎁 first race today)</span>' : 'You get ' + w.stars + ' ⭐') +
        (w.half ? '<br><span style="font-weight:600;font-size:.85em">Half stars: ' + w.cap + ' races done today</span>' : '') +
        (w.newBest ? '<br>🎉 New best time: ' + fmt(w.ms) : '') +
        (w.cup ? '<br>' + badge(w.cup, true) + ' New ' + BADGE_NAMES[w.cup - 1] + ' star for your time!' : '') +
        (race && race.me ? '<br><span style="font-weight:600;font-size:.85em">Star tokens collected: ' + race.me.coins + '</span>' : '') + '</div>';
    }
    res.innerHTML = '<div class="race-panel" role="dialog" aria-label="Race results">' + h + '<button type="button" class="btn primary">OK</button></div>';
    btn = res.querySelector('.btn');
    btn.addEventListener('click', function () { res.hidden = true; res.innerHTML = ''; });
    res.hidden = false;
    if (w && !w.dnf) sfx(w.place === 1 ? 'goal' : w.newBest ? 'quest' : 'right');
  }

  function setView(v) {
    view = v;
    if (!root) return;
    lob.hidden = v !== 'lobby'; cv.style.display = v === 'race' ? 'block' : 'none';
    drag = null;
    if (v === 'race') {
      layout(); last = nowMs();
      if (!raf) raf = requestAnimationFrame(frame);
    } else {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      race = null; setInfo('');
      renderLobby();
    }
  }

  // =====================================================================================================
  // Messages, opening and closing
  // =====================================================================================================
  function onMessage(m) {
    var R = race, r, i;
    if (!root) return;
    switch (m.t) {
      case 'race.lobby':
        if (!Array.isArray(m.who)) return;
        lobby = m;
        if (m.phase === 'lobby' && view !== 'lobby') setView('lobby'); else renderLobby();
        break;
      case 'race.count':
        if (!Array.isArray(m.racers)) return;
        res.hidden = true; res.innerHTML = '';
        startRace(m, Math.max(0, +m.in || 0), false);
        break;
      case 'race.watch':
        if (!Array.isArray(m.racers)) return;
        startRace(m, -(+m.e || 0), true);
        R = race;
        if (Array.isArray(m.pos)) for (i = 0; i < m.pos.length; i++) { r = R.byId[m.pos[i][0]]; if (r) { r.x = r.tx = m.pos[i][1]; r.lane = r.lp = clamp(m.pos[i][2] | 0, 0, 3); r.f = m.pos[i][3] | 0; } }
        if (Array.isArray(m.done)) for (i = 0; i < m.done.length; i++) { r = R.byId[m.done[i].rid]; if (r) { r.done = true; r.place = m.done[i].place; r.ms = m.done[i].ms; } }
        if (m.hurry > 0) R.hurryEnd = nowMs() + m.hurry;
        R.rank = ranking(R);
        V.camL = (R.rank[0] ? R.rank[0].x : 0) - V.W * R.frac / V.S;
        break;
      case 'race.pos': onPos(m); break;
      case 'race.done':
        r = R && R.byId[m.rid];
        if (r) { r.done = true; r.place = m.place; r.ms = m.ms; r.f = 0; r.pv = Math.max(r.pv, 320); r.x = Math.max(r.x, R.len - 140); R.rank = ranking(R); }
        break;
      case 'race.drop':
        r = R && R.byId[m.rid];
        if (r) { r.dropped = true; R.rank = ranking(R); }
        break;
      case 'race.hurry': if (R) R.hurryEnd = nowMs() + (+m.left || 0); break;
      case 'race.reward': lastReward = m; updateInfo(); break;
      case 'race.nope': api.toast('The stopwatch did not believe that! Wait for the others.'); break;
      case 'race.end':
        if (Array.isArray(m.results)) showResults(m);
        break;
    }
  }
  function close() {
    if (!root) return;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKey);
    if (root.parentNode) root.parentNode.removeChild(root);
    root = cv = ctx = lob = info = res = back = null; ui = {};
    race = null; lobby = null; tiles = null; drag = null; lastReward = null; infoHtml = ''; view = 'lobby';
    sfx('close');
    api.leave();
  }
  function onResize() {
    if (!root) return;
    layout();
    if (view === 'lobby') renderLobby();
  }
  function open() {
    var s;
    if (root) return;
    Car = window.CarDesigner || null;
    if (!document.getElementById('race-style')) { s = document.createElement('style'); s.id = 'race-style'; s.textContent = CSS; document.head.appendChild(s); }
    root = el('div', 'screen race-root');
    cv = el('canvas', 'race-cv'); cv.setAttribute('aria-label', 'The race'); cv.style.display = 'none'; ctx = cv.getContext('2d');
    root.appendChild(cv);
    buildLobby();
    info = el('div', 'race-info'); info.hidden = true; root.appendChild(info);
    res = el('div', 'race-res'); res.hidden = true; root.appendChild(res);
    back = el('button', 'btn race-back', 'Back to town'); back.type = 'button'; back.setAttribute('data-quiet', '');
    back.addEventListener('click', close);
    root.appendChild(back);
    document.body.appendChild(root);
    cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    view = 'lobby'; lobby = null; race = null; autoVoted = 0; lastReward = null; infoHtml = '';
    layout();
    drawThumbs();
    api.enter('race');
  }

  window.FTGames = window.FTGames || {};
  window.FTGames.race = {
    init: function (a) { api = a; },
    open: open,
    onMessage: onMessage,
    onMe: function () { if (root && view === 'lobby') { var st = api.me(); if (st && ui.coins) ui.coins.textContent = st.coins; } },
    makeTrack: makeTrack      // for tests: must give the same course as the server's copy
  };
})();
