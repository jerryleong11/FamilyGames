// Race Track (client): racing with the cars designed in the Car Garage. Four ways to play, chosen in the lobby:
//   Race, Grand Prix, Time Trial: a circuit seen from behind the car. The road is a closed loop of pieces with a bend
//     and a height each, drawn back to front; trees, houses and the other cars are pictures scaled by distance. The car
//     accelerates by itself; the player steers (two buttons, a finger on the road, or the arrow keys), holds DRIFT to
//     slide through a bend and charge a small turbo, and uses the item from an item box with the big Item button.
//   Sprint: the first game of the Race Track, unchanged: the road scrolls sideways with 4 lanes stacked in depth; the
//     player changes lane (drag up or down, the two arrow buttons, or the arrow keys) and presses BOOST once three
//     bolts are collected.
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

  // ---- circuits: a closed loop of road pieces, driven for 3 laps and seen from behind the car ----
  var SEG = 200;         // length of one piece of road, in track units (the road is 2000 units from the middle to its edge)
  var LAPS = 3;
  var CV0 = 6400;        // top speed on a circuit, units a second
  var BOLT_MAX = 10;     // bolts a car can carry
  var BOLT_K = 0.006;    // each bolt makes the top speed this much higher
  var TURBO_K = 1.32;    // speed with the turbo item
  var TURBO_T = 2.2;     // seconds it lasts
  var RUSH_K = 1.26;     // speed in a rainbow rush
  var RUSH_T = 5;
  var MINI_K = 1.2;      // speed of the little turbo after a drift
  var STORM_K = 0.72;    // speed under a storm cloud
  var STORM_T = 3;
  var ITEMS = ['turbo', 'bubble', 'jelly', 'firework', 'magnet', 'storm', 'rush'];
  // One line per circuit. sec: the road in order, each part [pieces, turn in degrees (+ right, - left), climb in
  // hundreds of units]. The turns of a circuit add up to one full circle and the climbs to zero.
  // rows: the pieces where a row of item boxes stands.
  var CIRC = [
    { id: 'ring', scn: 0, rows: [215, 375, 710, 930],
      sec: [[80, 0, 0], [100, 90, 0], [70, 0, 26], [100, 90, 0], [50, 0, -26], [55, -35, 0], [55, 35, 0], [50, 0, 0], [100, 90, 18], [102, 0, -18], [100, 90, 0], [123, 0, 0]] },
    { id: 'bay', scn: 1, rows: [170, 460, 700, 840, 1033],
      sec: [[70, 0, 0], [80, 70, 0], [40, 0, 14], [80, -70, -14], [30, 0, 0], [130, 180, 0], [60, 0, 24], [65, 50, -24], [46, 0, 0], [65, -50, 0], [100, 0, 18], [107, 0, -18], [140, 180, 0], [40, 0, 0], [55, -30, 0], [55, 30, 0], [30, 0, 0]] },
    { id: 'city', scn: 2, rows: [158, 394, 640, 876, 1090],
      sec: [[70, 0, 0], [68, 90, 0], [40, 0, 0], [68, 90, 0], [30, 0, 0], [68, -90, 0], [50, 0, 32], [50, 0, -32], [68, 90, 0], [40, 0, 0], [68, 90, 0], [40, 0, 0], [68, -90, 0], [30, 0, 0], [68, 90, 0], [100, 0, 0], [68, 90, 0], [97, 0, -16], [100, 0, 16]] },
    { id: 'peak', scn: 3, rows: [90, 316, 523, 834, 1134],
      sec: [[50, 0, 0], [80, 0, 40], [110, 150, 20], [153, 0, 44], [110, -150, 16], [40, 0, 0], [125, 180, -40], [61, 0, -44], [80, 90, -36], [50, 0, 0], [70, -60, 0], [70, 60, 0], [30, 0, 0], [80, 90, 0], [50, 0, 0]] }
  ];
  function buildCircuit(ci) {
    var D = CIRC[ci] || CIRC[0], c = [], y = [0], i, j, s, n, r, w, sum, peak, k, h = 0, h0;
    for (i = 0; i < D.sec.length; i++) {
      s = D.sec[i]; n = s[0]; r = Math.min(14, Math.floor(n / 3)); w = []; sum = 0;
      for (j = 0; j < n; j++) { k = Math.min(1, (j + 1) / (r + 1), (n - j) / (r + 1)); w.push(k); sum += k; }   // a bend eases in and out
      peak = s[1] * Math.PI / 180 * SEG / sum;
      for (j = 0; j < n; j++) c.push(Math.round(peak * w[j] * 1000) / 1000);
      h0 = h; h += (s[2] || 0) * 100;
      for (j = 1; j <= n; j++) y.push(Math.round(h0 + (h - h0) * (0.5 - 0.5 * Math.cos(Math.PI * j / n))));
    }
    return { n: c.length, len: c.length * SEG, c: c, y: y };
  }
  // What lies on a circuit in one race: item boxes (4 in a row) and lines of bolts. The same on the server and on every tablet.
  function layoutCircuit(ci, seed) {
    var D = CIRC[ci] || CIRC[0], T = buildCircuit(ci), r = rng(seed), boxes = [], bolts = [], used = {}, i, j, s, n, x, k, q;
    for (i = 0; i < D.rows.length; i++) {
      s = D.rows[i] + Math.floor(r() * 9) - 4;
      for (j = 0; j < 4; j++) boxes.push({ z: s * SEG + 100, x: -0.66 + j * 0.44 });
      for (j = s - 5; j <= s + 5; j++) used[j] = 1;
    }
    s = 26 + Math.floor(r() * 12);
    while (s < T.n - 22) {
      n = 3 + Math.floor(r() * 3); x = r() * 1.4 - 0.7; k = r() < 0.3 ? (r() < 0.5 ? -0.07 : 0.07) : 0;   // some lines run across the road
      for (j = 0; j < n; j++) {
        q = x + k * j;
        if (!used[s + j * 2]) bolts.push({ z: (s + j * 2) * SEG + 100, x: Math.round((q < -0.8 ? -0.8 : q > 0.8 ? 0.8 : q) * 100) / 100 });
      }
      s += n * 2 + 30 + Math.floor(r() * 26);
    }
    return { boxes: boxes, bolts: bolts };
  }
  // The picture of a circuit from above, for the small map: one point per piece of road, in pieces (0, 0 = the start line).
  function mapOfCircuit(T) {
    var pts = [], a = 0, x = 0, y = 0, i, ex, ey;
    for (i = 0; i < T.n; i++) { pts.push([x, y]); a += T.c[i] / SEG; x += Math.sin(a); y -= Math.cos(a); }
    ex = x; ey = y;                                                   // what is missing for the loop to close is spread along the way
    for (i = 0; i < T.n; i++) { pts[i][0] -= ex * i / T.n; pts[i][1] -= ey * i / T.n; }
    return pts;
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
  // Circuits: a closed loop of road seen from behind the car (single race, Grand Prix, time trial)
  // =====================================================================================================
  var RW = 2000;                                     // from the middle of the road to its edge, in track units
  var CAM_H = 1158, CAM_BACK = 1768, CAM_D = 0.84;   // the camera: how high it is, how far behind the car, how wide it looks
  var DRAW_N = 90;                                   // pieces of road drawn ahead of the camera
  var FOG_N = 6;                                     // steps in which the far road fades into the haze
  var C_ACC = 2600, C_STEER = 1.8, C_CENT = 0.215, C_GRASS = 0.42, C_XMAX = 1.4;
  var DRIFT_T1 = 0.7, DRIFT_T2 = 1.6;                // seconds of sliding for the small and for the big turbo
  var CAR_WW = 760;                                  // how wide a car is on the road
  var GHOST_DT = 0.2;                                // the ghost lap is stored 5 times a second
  var BOX_S = 1.5;                                   // seconds until a taken item box is back
  var CIRCS = [
    { id: 'ring', icon: '🏡', en: 'Sunny Ring', zh: '阳光环道', py: 'yángguāng huándào', ms: 'Litar Ceria', dots: 1 },
    { id: 'bay', icon: '🏖️', en: 'Palm Bay', zh: '棕榈湾', py: 'zōnglǘ wān', ms: 'Teluk Palma', dots: 2 },
    { id: 'city', icon: '🌃', en: 'Neon City', zh: '霓虹城', py: 'níhóng chéng', ms: 'Kota Neon', dots: 3 },
    { id: 'peak', icon: '🏔️', en: 'Snowy Peak', zh: '雪山', py: 'xuěshān', ms: 'Puncak Salji', dots: 3 }
  ];
  var MODES = [
    { id: 'race', icon: '🏁', en: 'Race', zh: '比赛', py: 'bǐsài', ms: 'Lumba' },
    { id: 'gp', icon: '🏆', en: 'Grand Prix', zh: '大奖赛', py: 'dàjiǎngsài', ms: 'Grand Prix' },
    { id: 'trial', icon: '⏱️', en: 'Time Trial', zh: '计时赛', py: 'jìshísài', ms: 'Ujian Masa' },
    { id: 'sprint', icon: '💨', en: 'Sprint', zh: '冲刺赛', py: 'chōngcìsài', ms: 'Pecut' }
  ];
  var ITEM_NAMES = {
    turbo: { en: 'Turbo', zh: '涡轮加速', py: 'wōlún jiāsù', ms: 'Turbo' },
    bubble: { en: 'Bubble shield', zh: '泡泡护盾', py: 'pàopao hùdùn', ms: 'Perisai buih' },
    jelly: { en: 'Wobbly jelly', zh: '果冻', py: 'guǒdòng', ms: 'Jeli' },
    firework: { en: 'Firework', zh: '烟花', py: 'yānhuā', ms: 'Bunga api' },
    magnet: { en: 'Magnet', zh: '磁铁', py: 'cítiě', ms: 'Magnet' },
    storm: { en: 'Storm cloud', zh: '雷雨云', py: 'léiyǔyún', ms: 'Awan ribut' },
    rush: { en: 'Rainbow rush', zh: '彩虹冲刺', py: 'cǎihóng chōngcì', ms: 'Pecutan pelangi' }
  };
  var BOT_LV = [{ icon: '🐢', en: 'gentle' }, { icon: '🚗', en: 'normal' }, { icon: '🚀', en: 'fast' }];
  var RAINBOW = ['#FF4F6D', '#FF9F43', '#FFD66B', '#4FA05A', '#5AA9FF', '#9B6BFF'];
  function mix(a, b, t) { // a colour between two colours
    var o = '#', i, x, y, v;
    for (i = 1; i < 7; i += 2) { x = parseInt(a.substr(i, 2), 16); y = parseInt(b.substr(i, 2), 16); v = Math.round(x + (y - x) * t); o += (v < 16 ? '0' : '') + v.toString(16); }
    return o;
  }
  function mod(a, n) { return ((a % n) + n) % n; }

  // ---------- the look of each circuit: colours of the ground, what stands beside the road ----------
  // side: what is scattered beside the road [sprite, world units per sprite unit, how far from the road it starts];
  // post: what stands in a row right at the edge
  var CTH = [
    { scn: 0, sky: SCN[0].sky, grass: ['#7BD389', '#6FCA7E'], road: ['#757D94', '#6D758C'], rum: ['#FF4F6D', '#FFFFFF'], lane: '#FFFFFF', fog: '#D9F4FF',
      side: [['c_tree', 16, 0.2], ['c_tree', 16, 0.2], ['c_house0', 21, 0.9], ['c_house1', 21, 0.9], ['c_bush', 12, 0.1], ['c_pine', 19, 0.2], ['c_house2', 21, 0.9], ['c_bush', 12, 0.1]], post: ['c_lamp', 13, 14] },
    { scn: 1, sky: SCN[1].sky, grass: ['#F6E2A8', '#EFD691'], road: ['#8791A6', '#7F899F'], rum: ['#3B82F6', '#FFFFFF'], lane: '#FFFFFF', fog: '#FFE9B8',
      side: [['c_palm', 15, 0.25], ['c_palm', 15, 0.25], ['c_hut', 20, 0.8], ['c_umb', 13, 0.2], ['c_rock', 14, 0.1], ['c_palm', 15, 0.25], ['c_umb', 13, 0.2], ['c_bush', 12, 0.1]], post: ['c_flag', 12, 12] },
    { scn: 2, sky: SCN[2].sky, grass: ['#2C335C', '#272D54'], road: ['#3A4168', '#343B60'], rum: ['#FFC933', '#2B3046'], lane: '#FFE27A', fog: '#3A2B74',
      side: [['c_tower0', 26, 0.9], ['c_tower1', 26, 0.9], ['c_neon0', 15, 0.15], ['c_tower2', 26, 0.9], ['c_neon1', 15, 0.15], ['c_tower3', 26, 0.9], ['c_neon2', 15, 0.15], ['c_tower0', 26, 0.9]], post: ['c_lampg', 13, 10] },
    { scn: 3, sky: ['#6FB0E6', '#EAF6FF'], grass: ['#F4FAFF', '#E2EDF8'], road: ['#7C8498', '#747C91'], rum: ['#FF7A45', '#FFFFFF'], lane: '#FFFFFF', fog: '#EAF6FF',
      side: [['c_spine', 19, 0.2], ['c_spine', 19, 0.2], ['c_cabin', 21, 0.9], ['c_snowman', 12, 0.1], ['c_irock', 15, 0.1], ['c_spine', 19, 0.2], ['c_spine', 19, 0.2], ['c_irock', 15, 0.1]], post: ['c_pole', 12, 10] }
  ];
  // the far picture of the snow circuit (the other three use the pictures of the Sprint tracks)
  var SNOW = {
    back: function (g, w) {
      var x = w * 0.72, y = 104;
      g.beginPath(); g.arc(x, y, 90, 0, TAU); g.fillStyle = rad(g, x, y, 90, 'rgba(255,255,255,0.8)', 'rgba(255,255,255,0)'); g.fill();
      g.beginPath(); g.arc(x, y, 34, 0, TAU); g.fillStyle = '#FFF6C9'; g.fill();
    },
    far: function (g, w) {
      wrap3(g, w, function (g) {
        var i, x, h;
        for (i = 0; i < 5; i++) cloud(g, 120 + i * 280 + prn(i + 13) * 80, 70 + prn(i + 17) * 70, 0.8 + prn(i + 19) * 0.5, '#FFFFFF', 'rgba(150,190,230,0.5)');
        for (i = 0; i < 6; i++) { // mountains with snow on top
          x = 110 + i * 236 + prn(i + 23) * 70; h = 130 + prn(i + 29) * 90;
          poly(g, [x - h * 1.25, 340, x, 340 - h, x + h * 1.3, 340]); g.fillStyle = i % 2 ? '#8FA9CF' : '#9DB6D9'; g.fill();
          poly(g, [x, 340 - h, x + h * 1.3, 340, x + h * 0.25, 340]); g.fillStyle = 'rgba(60,90,140,0.22)'; g.fill();
          poly(g, [x - h * 0.4, 340 - h * 0.68, x, 340 - h, x + h * 0.42, 340 - h * 0.68, x + h * 0.2, 340 - h * 0.58, x + h * 0.04, 340 - h * 0.7, x - h * 0.16, 340 - h * 0.56]);
          g.fillStyle = '#FFFFFF'; g.fill();
        }
      });
      ridge(g, w, 300, 16, 3, 7, 1.1, '#DCE9F6', 340);
      ridge(g, w, 318, 9, 4, 9, 2.6, '#F4FAFF', 340);
    }
  };

  // ---------- things beside the road: each drawn once, like the sprites of the Sprint ----------
  function snowman(g) {
    g.fillStyle = SH; ell(g, 8, 1, 26, 6); g.fill();
    g.beginPath(); g.arc(0, -16, 17, 0, TAU); g.fillStyle = '#FFFFFF'; g.fill(); ol(g, 3);
    g.beginPath(); g.arc(0, -40, 12, 0, TAU); g.fillStyle = '#FFFFFF'; g.fill(); ol(g, 3);
    g.fillStyle = 'rgba(120,160,210,0.3)'; g.beginPath(); g.arc(5, -12, 12, -0.6, 1.9); g.fill();
    poly(g, [1, -40, 15, -37, 1, -35]); g.fillStyle = '#FF7A45'; g.fill(); ol(g, 1.8);
    g.fillStyle = NAVY; g.beginPath(); g.arc(-4, -44, 1.8, 0, TAU); g.arc(5, -44, 1.8, 0, TAU); g.fill();
    g.beginPath(); g.arc(0, -20, 2, 0, TAU); g.arc(0, -11, 2, 0, TAU); g.fill();
    rr(g, -10, -57, 20, 7, 2); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 2.5);
    rr(g, -6, -68, 12, 12, 2); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 2.5);
    g.strokeStyle = '#8F5A2E'; g.lineWidth = 3; g.beginPath(); g.moveTo(-15, -24); g.lineTo(-29, -36); g.moveTo(15, -24); g.lineTo(29, -34); g.stroke();
  }
  function snowPine(g) {
    tree(g, 0, 0, 1, 1);
    g.fillStyle = '#FFFFFF'; g.strokeStyle = NAVY; g.lineWidth = 2;
    [[-56, 15, 26], [-36, 21, 30], [-14, 26, 34]].forEach(function (q) {
      var top = q[0] - q[2];
      g.beginPath(); g.moveTo(0, top); g.lineTo(q[1] * 0.55, top + q[2] * 0.55); g.quadraticCurveTo(q[1] * 0.25, top + q[2] * 0.4, 0, top + q[2] * 0.56);
      g.quadraticCurveTo(-q[1] * 0.25, top + q[2] * 0.4, -q[1] * 0.55, top + q[2] * 0.55); g.closePath(); g.fill(); g.stroke();
    });
  }
  function sidePost(g, kind) { // a marker right at the edge of the road
    g.fillStyle = SH; ell(g, 5, 0, 10, 3); g.fill();
    if (kind) { // a snow pole
      rr(g, -3, -58, 6, 58, 2); g.fillStyle = '#FF7A45'; g.fill(); ol(g, 2.5);
      g.fillStyle = '#FFFFFF'; g.fillRect(-2, -46, 4, 9); g.fillRect(-2, -24, 4, 9);
    } else { // a little beach flag
      g.strokeStyle = NAVY; g.lineWidth = 5; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -64); g.stroke();
      g.strokeStyle = '#F4FBFF'; g.lineWidth = 2; g.stroke();
      g.beginPath(); g.moveTo(1, -64); g.quadraticCurveTo(14, -66, 26, -57); g.quadraticCurveTo(14, -52, 1, -46); g.closePath(); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 2.5);
    }
  }
  function neonPost(g, n) {
    var col = ['#FF6FB5', '#5CE1FF', '#FFE27A'][n % 3];
    g.fillStyle = SH; ell(g, 6, 0, 12, 3.5); g.fill();
    rr(g, -3, -62, 6, 62, 2); g.fillStyle = lin(g, -3, 0, 3, 0, '#8A92A6', '#4A5165'); g.fill(); ol(g, 2.5);
    neon(g, 0, -76, col, n);
  }
  (function () {
    var i;
    function add(name, w, h, ox, oy, fn) { SPR[name] = { w: w, h: h, ox: ox, oy: oy, draw: fn }; }
    add('c_tree', 92, 98, 42, 92, function (g) { tree(g, 0, 0, 1, 0); });
    add('c_pine', 72, 88, 34, 82, function (g) { tree(g, 0, 0, 1, 1); });
    add('c_bush', 104, 60, 48, 52, function (g) { bush(g, 0, 0, 1, 0); });
    for (i = 0; i < 3; i++) (function (n) { add('c_house' + n, 186, 132, 62, 124, function (g) { house(g, -50, 0, 100, 68, WALLS[n * 2], ROOFS[n * 2]); }); })(i);
    add('c_lamp', 60, 104, 30, 98, function (g) { lampPost(g, 0, 0, false); });
    add('c_lampg', 104, 130, 52, 124, function (g) { lampPost(g, 0, 0, true); });
    add('c_palm', 156, 156, 70, 150, function (g) { palm(g, 0, 0, 108, 14); });
    add('c_hut', 164, 96, 58, 88, function (g) { hut(g, -43, 0, 86, 52, 1); });
    add('c_umb', 116, 108, 46, 100, function (g) { umbrella(g, 0, 0, 0); });
    add('c_rock', 84, 48, 40, 40, function (g) { rock(g, 0, 0, 1); });
    add('c_flag', 44, 76, 12, 70, function (g) { sidePost(g, 0); });
    add('c_pole', 30, 68, 12, 62, function (g) { sidePost(g, 1); });
    for (i = 0; i < 4; i++) (function (n) {
      add('c_tower' + n, 132, 150 + n * 26, 58, 144 + n * 26, function (g) { tower(g, -50, 0, 100, 122 + n * 26, ['#3D4A92', '#54409A', '#2F5E98', '#653F92'][n], n * 17.7 + 3); });
    })(i);
    for (i = 0; i < 3; i++) (function (n) { add('c_neon' + n, 84, 112, 42, 104, function (g) { neonPost(g, n); }); })(i);
    add('c_spine', 72, 88, 34, 82, snowPine);
    add('c_snowman', 72, 80, 34, 74, snowman);
    add('c_cabin', 186, 132, 62, 124, function (g) { house(g, -50, 0, 100, 62, '#C98A4B', '#F4FAFF'); });
    add('c_irock', 84, 48, 40, 40, function (g) {
      g.fillStyle = SH; ell(g, 8, 2, 34, 7); g.fill();
      poly(g, [-26, 0, -30, -14, -16, -28, 6, -32, 24, -20, 28, -4, 20, 2]); g.fillStyle = '#BFE3F7'; g.fill(); ol(g, 3);
      poly(g, [-26, -13, -15, -26, 5, -29, 12, -18, -8, -12]); g.fillStyle = '#FFFFFF'; g.fill();
    });
  })();

  // ---------- the items: one small picture each, used on the road and on the Item button ----------
  function sparkle(g, x, y, r) { // a four-pointed star
    g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x + r * 0.18, y - r * 0.18, x + r, y); g.quadraticCurveTo(x + r * 0.18, y + r * 0.18, x, y + r);
    g.quadraticCurveTo(x - r * 0.18, y + r * 0.18, x - r, y); g.quadraticCurveTo(x - r * 0.18, y - r * 0.18, x, y - r); g.closePath();
  }
  function jellyShape(g, s) { // a wobbly pudding on a plate, standing on (0, 0)
    g.save(); g.scale(s, s);
    ell(g, 0, -3, 25, 6); g.fillStyle = '#FFFFFF'; g.fill(); ol(g, 2.5);
    g.beginPath(); g.moveTo(-19, -5); g.quadraticCurveTo(-22, -15, -15, -19); g.quadraticCurveTo(-13, -37, 0, -37); g.quadraticCurveTo(13, -37, 15, -19); g.quadraticCurveTo(22, -15, 19, -5);
    g.quadraticCurveTo(12, -1, 6, -5); g.quadraticCurveTo(0, -1, -6, -5); g.quadraticCurveTo(-12, -1, -19, -5); g.closePath();
    g.fillStyle = lin(g, 0, -37, 0, -3, '#B6F28A', '#4FC46A'); g.fill(); ol(g, 3);
    g.beginPath(); g.ellipse(-6, -27, 4, 7, 0.4, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fill();
    g.beginPath(); g.arc(0, -39, 4.5, 0, TAU); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 2);
    g.restore();
  }
  function fireworkShape(g) { // a rocket on a stick, pointing up
    g.strokeStyle = '#8F5A2E'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(0, 2); g.lineTo(0, 24); g.stroke();
    rr(g, -7, -12, 14, 22, 3); g.fillStyle = '#FFFFFF'; g.fill();
    g.save(); rr(g, -7, -12, 14, 22, 3); g.clip(); g.fillStyle = '#FF4F6D'; g.fillRect(-8, -8, 16, 5); g.fillRect(-8, 2, 16, 5); g.restore();
    rr(g, -7, -12, 14, 22, 3); ol(g, 2.5);
    poly(g, [-9, -11, 0, -25, 9, -11]); g.fillStyle = '#FFC933'; g.fill(); ol(g, 2.5);
    g.fillStyle = '#FFE14D'; star(g, -13, 14, 5); g.fill(); ol(g, 1.5); star(g, 13, 17, 4); g.fill(); ol(g, 1.5);
  }
  function stormShape(g, rain) {
    var L = [[-12, -2, 11], [3, -9, 14], [15, 0, 10], [1, 2, 11]], i;
    blobs(g, L, '#5B6480', 2.5);
    g.fillStyle = '#7A84A3'; for (i = 0; i < L.length; i++) { g.beginPath(); g.arc(L[i][0] - 2, L[i][1] - 3, L[i][2] - 5, 0, TAU); g.fill(); }
    boltPath(g, 1, 14, 0.62); g.fillStyle = '#FFE14D'; g.fill(); ol(g, 2);
    if (rain) { g.strokeStyle = '#74DBFF'; g.lineWidth = 3; g.beginPath(); for (i = 0; i < 3; i++) { g.moveTo(-16 + i * 15, 12); g.lineTo(-20 + i * 15, 22); } g.stroke(); }
  }
  (function () {
    function add(name, w, h, ox, oy, fn) { SPR[name] = { w: w, h: h, ox: ox, oy: oy, draw: fn }; }
    add('i_turbo', 56, 56, 28, 28, function (g) { // two arrows pointing ahead, hot colours
      var i, y;
      for (i = 1; i >= 0; i--) { y = i ? 9 : -7; poly(g, [-18, y + 9, 0, y - 12, 18, y + 9, 9, y + 9, 0, y - 1, -9, y + 9]); g.fillStyle = i ? '#FF7A45' : '#FFC933'; g.fill(); ol(g, 2.5); }
    });
    add('i_bubble', 56, 56, 28, 28, function (g) {
      g.beginPath(); g.arc(0, 0, 20, 0, TAU); g.fillStyle = rad(g, -6, -7, 26, 'rgba(255,255,255,0.95)', 'rgba(116,219,255,0.75)'); g.fill(); ol(g, 2.5);
      g.beginPath(); g.arc(0, 0, 14, Math.PI * 1.05, Math.PI * 1.55); g.strokeStyle = '#FFFFFF'; g.lineWidth = 3.5; g.stroke();
      g.beginPath(); g.arc(8, 8, 3, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill();
    });
    add('i_jelly', 56, 56, 28, 42, function (g) { jellyShape(g, 0.95); });
    add('i_firework', 56, 56, 28, 28, function (g) { g.rotate(0.5); fireworkShape(g); });
    add('i_magnet', 56, 56, 28, 28, function (g) {
      g.lineCap = 'butt';
      g.beginPath(); g.moveTo(-14, -16); g.lineTo(-14, 2); g.arc(0, 2, 14, Math.PI, 0, true); g.lineTo(14, -16);
      g.lineWidth = 15; g.strokeStyle = NAVY; g.stroke(); g.lineWidth = 9.5; g.strokeStyle = '#FF4F6D'; g.stroke();
      g.fillStyle = '#E8ECF2'; g.fillRect(-18.8, -18, 9.6, 8); g.fillRect(9.2, -18, 9.6, 8);
      g.strokeStyle = NAVY; g.lineWidth = 2.5; g.strokeRect(-19, -18.5, 10, 9); g.strokeRect(9, -18.5, 10, 9);
      g.lineCap = 'round';
    });
    add('i_storm', 56, 56, 28, 28, function (g) { g.translate(-2, -4); stormShape(g, false); });
    add('i_rush', 56, 56, 28, 30, function (g) {
      var i;
      g.lineCap = 'butt';
      g.beginPath(); g.arc(0, 8, 19, Math.PI, 0); g.lineWidth = 15; g.strokeStyle = NAVY; g.stroke();
      for (i = 0; i < 4; i++) { g.beginPath(); g.arc(0, 8, 23.5 - i * 3, Math.PI, 0); g.lineWidth = 3.2; g.strokeStyle = ['#FF4F6D', '#FFD66B', '#4FA05A', '#5AA9FF'][i]; g.stroke(); }
      g.lineCap = 'round';
      star(g, 0, 8, 9); g.fillStyle = '#FFFFFF'; g.fill(); ol(g, 2);
    });
    // the item box: a see-through crate that bobs above the road
    add('box', 76, 96, 38, 90, function (g) {
      g.fillStyle = 'rgba(27,42,73,0.20)'; ell(g, 0, 0, 22, 5); g.fill();
      rr(g, -24, -70, 48, 48, 11); g.fillStyle = lin(g, -24, -70, 24, -22, '#74E6FF', '#9B6BFF'); g.fill(); ol(g, 3);
      rr(g, -18, -64, 36, 36, 7); g.fillStyle = 'rgba(255,255,255,0.28)'; g.fill();
      sparkle(g, 0, -46, 14); g.fillStyle = '#FFFFFF'; g.fill(); ol(g, 2);
      g.fillStyle = '#FFE14D'; g.beginPath(); g.arc(-16, -62, 3, 0, TAU); g.arc(16, -30, 3, 0, TAU); g.fill();
      g.fillStyle = '#FF8FB8'; g.beginPath(); g.arc(16, -62, 3, 0, TAU); g.arc(-16, -30, 3, 0, TAU); g.fill();
    });
    add('jelly', 96, 80, 48, 70, function (g) { g.fillStyle = 'rgba(27,42,73,0.18)'; ell(g, 4, 1, 42, 8); g.fill(); jellyShape(g, 1.6); });
    add('cloud', 76, 64, 38, 30, function (g) { stormShape(g, true); });
    add('fw', 44, 60, 22, 30, fireworkShape);
  })();

  // ---------- a car seen from behind, drawn from its Car Garage design ----------
  var CR_W = 184, CR_H = 136, CR_OX = 92, CR_OY = 118;       // the cached picture, in car units (a car is 120 wide)
  var REAR_TOP = [68, 72, 98, 70, 86, 94];                   // how tall each body is from behind, for placing the name tag
  function hexOk(v, def) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : def; }
  function carOf(d) { // a design with every field in range
    function ix(v, n, def) { v = parseInt(v, 10); return v >= 0 && v < n ? v : def; }
    d = (d && typeof d === 'object') ? d : {};
    return { body: ix(d.body, 6, 1), color: hexOk(d.color, '#FF4F6D'), color2: hexOk(d.color2, '#FFFFFF'), decal: ix(d.decal, 7, 1), wheel: ix(d.wheel, 6, 0),
      wheelColor: hexOk(d.wheelColor, '#E8ECF2'), spoiler: ix(d.spoiler, 3, 1), num: ix(d.num, 10, 1), extra: ix(d.extra, 5, 0) };
  }
  function tyre(g, x, w, h, d, fr) { // a tyre standing on the ground, seen from behind; x = its middle
    var y, n = d.wheel === 3 ? 9 : 6, gold = d.wheel === 5, side = x < 0 ? 1 : -1, r = Math.min(8, w * 0.35), i;
    if (d.wheel === 3) { // chunky: knobs stick out
      g.fillStyle = '#2B3046';
      for (i = 0; i < 4; i++) { rr(g, x - w / 2 - 3, -h + 4 + i * (h - 8) / 4 + (fr ? 3 : 0), w + 6, 5, 2); g.fill(); ol(g, 2); }
    }
    rr(g, x - w / 2, -h, w, h, r); g.fillStyle = '#2B3046'; g.fill(); ol(g, 3);
    g.save(); rr(g, x - w / 2, -h, w, h, r); g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.20)'; g.lineWidth = d.wheel === 3 ? 3.5 : 2;
    for (y = -h - n + (fr ? n / 2 : 0); y < 3; y += n) { g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x, y + 3); g.lineTo(x + w / 2, y); g.stroke(); }
    if (gold) { g.fillStyle = '#FFE27A'; g.fillRect(x - 1.5, -h, 3, h); }
    g.restore();
    // the wheel colour shows on the inner side, where the rim is
    rr(g, x + side * (w / 2) - 3.5, -h * 0.8, 7, h * 0.6, 3); g.fillStyle = gold ? '#FFC933' : d.wheelColor; g.fill(); ol(g, 2);
  }
  function rearDecal(g, d, b) { // the sticker, on the back of the car (the caller clips to the body)
    var w = b.x1 - b.x0, h = b.y1 - b.y0, cx = (b.x0 + b.x1) / 2, i, j, x, q;
    if (d.decal === 1) { // two racing stripes
      g.fillStyle = d.color2; g.fillRect(cx - w * 0.17, b.y0 - 60, w * 0.11, h + 120); g.fillRect(cx + w * 0.06, b.y0 - 60, w * 0.11, h + 120);
    } else if (d.decal === 2) { // flames licking up from below
      for (j = 0; j < 2; j++) {
        q = j ? 0.6 : 1; g.fillStyle = j ? '#FFC933' : d.color2;
        g.beginPath(); g.moveTo(b.x0 - 4, b.y1 + 6);
        for (i = 0; i < 6; i++) {
          x = b.x0 + (i + 0.5) * w / 6;
          g.lineTo(x - w / 12, b.y1 - h * 0.14 * q); g.quadraticCurveTo(x - w / 30, b.y1 - h * 0.4 * q, x, b.y1 - h * (i % 2 ? 0.92 : 0.6) * q); g.quadraticCurveTo(x + w / 30, b.y1 - h * 0.4 * q, x + w / 12, b.y1 - h * 0.14 * q);
        }
        g.lineTo(b.x1 + 4, b.y1 + 6); g.closePath(); g.fill();
      }
    } else if (d.decal === 3) { // a bolt on each side
      for (i = -1; i <= 1; i += 2) { boltPath(g, cx + i * w * 0.33, b.y0 + h * 0.5, h / 38); g.fillStyle = d.color2; g.fill(); g.lineWidth = 1.5; g.strokeStyle = NAVY; g.stroke(); }
    } else if (d.decal === 4) { // stars
      g.fillStyle = d.color2;
      [[0.12, 0.3], [0.27, 0.74], [0.73, 0.28], [0.88, 0.72]].forEach(function (p) { star(g, b.x0 + p[0] * w, b.y0 + p[1] * h, Math.max(4, h * 0.17)); g.fill(); g.lineWidth = 1.2; g.strokeStyle = NAVY; g.stroke(); });
    } else if (d.decal === 5) { // a chequered band along the bottom
      q = Math.max(4, h / 4);
      for (x = b.x0 - 2, i = 0; x < b.x1 + 2; x += q, i++) for (j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#FFFFFF' : NAVY; g.fillRect(x, b.y1 - (j + 1) * q, q + 0.4, q + 0.4); }
    } else if (d.decal === 6) { // rainbow bands
      q = h * 0.62 / 6;
      for (i = 0; i < 6; i++) { g.fillStyle = RAINBOW[i]; g.fillRect(b.x0 - 4, b.y0 + h * 0.2 + i * q, w + 8, q + 0.4); }
    }
  }
  function roundel(g, x, y, r, num) { // the race number
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = '#FFFFFF'; g.fill(); ol(g, 2);
    g.fillStyle = NAVY; g.font = '700 ' + Math.round(r * 1.5) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(num), x, y + 0.8);
  }
  function wing(g, d, y, w, big) { // the spoiler: a lip, or a wing on two struts
    if (!d.spoiler) return;
    if (d.spoiler === 2 || big) {
      g.strokeStyle = NAVY; g.lineWidth = 4; g.beginPath(); g.moveTo(-w * 0.28, y + 3); g.lineTo(-w * 0.28, y - 13); g.moveTo(w * 0.28, y + 3); g.lineTo(w * 0.28, y - 13); g.stroke();
      rr(g, -w * 0.62, y - 20, w * 1.24, 8, 3); g.fillStyle = d.color2; g.fill(); ol(g, 2.5);
      rr(g, -w * 0.62 - 4, y - 24, 7, 16, 2.5); g.fillStyle = d.color; g.fill(); ol(g, 2.5);
      rr(g, w * 0.62 - 3, y - 24, 7, 16, 2.5); g.fillStyle = d.color; g.fill(); ol(g, 2.5);
    } else { rr(g, -w * 0.5, y - 6, w, 6, 3); g.fillStyle = d.color2; g.fill(); ol(g, 2.5); }
  }
  function helmet(g, x, y, r, col) {
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = col; g.fill(); ol(g, 2.5);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x - 1.5, y - r + 1.5, 3, r * 1.3);
  }
  // fr: 0 or 1, two pictures shown in turn so that the tyres roll and the flag waves; drv: the colour of the driver's helmet
  function rearCar(g, design, fr, drv) {
    var d = carOf(design), col = d.color, c2 = d.color2, dark = shade(col, -0.24), lite = shade(col, 0.22), B = d.body, i, face = null, band, top = 0, flag = null, light = null, jet = -14, GLASS = '#BFE9FF';
    function body(fn) { fn(); g.fillStyle = lin(g, 0, band.y0, 0, band.y1, lite, dark); g.fill(); g.save(); fn(); g.clip(); rearDecal(g, d, band); g.restore(); fn(); ol(g, 3); }
    function lights(x, y, w, h) { rr(g, -x - w, y, w, h, 2.5); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 2); rr(g, x, y, w, h, 2.5); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 2); }
    drv = hexOk(drv, '#FF7A45');
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.fillStyle = 'rgba(27,42,73,0.22)'; ell(g, 0, 2, 68, 9); g.fill();
    if (d.extra === 4) { // rainbow trail: a ribbon on the road behind the car
      for (i = 0; i < 6; i++) { poly(g, [-21 + i * 7, -8, -14 + i * 7, -8, -22 + i * 11 + (fr ? 2 : 0), 14, -33 + i * 11 + (fr ? 2 : 0), 14]); g.fillStyle = RAINBOW[i]; g.fill(); }
      poly(g, [-21, -8, 21, -8, 33 + (fr ? 2 : 0), 14, -33 + (fr ? 2 : 0), 14]); ol(g, 2.5);
    }
    if (B === 0) { // Racer: open wheels, a slim body, the driver's helmet on top
      g.save(); g.translate(0, -25); tyre(g, -46, 12, 18, d, fr); tyre(g, 46, 12, 18, d, fr); g.restore();
      g.strokeStyle = NAVY; g.lineWidth = 5; g.beginPath(); g.moveTo(-36, -18); g.lineTo(36, -18); g.stroke();
      tyre(g, -47, 26, 36, d, fr); tyre(g, 47, 26, 36, d, fr);
      poly(g, [-17, -31, 17, -31, 9, -51, -9, -51]); g.fillStyle = lite; g.fill(); ol(g, 3);
      helmet(g, 0, -56, 10, drv);
      band = { x0: -21, x1: 21, y0: -33, y1: -8 };
      body(function () { rr(g, -21, -33, 42, 25, 7); });
      g.beginPath(); g.arc(0, -11, 3, 0, TAU); g.fillStyle = NAVY; g.fill();
      roundel(g, 0, -22, 8, d.num);
      wing(g, d, -44, 66, false);
      top = 66; flag = [-18, -32]; light = [0, -66]; jet = -13;
    } else if (B === 1) { // Sports: wide and low, a cabin with a rear window
      tyre(g, -46, 22, 22, d, fr); tyre(g, 46, 22, 22, d, fr);
      poly(g, [-40, -44, -29, -66, 29, -66, 40, -44]); g.fillStyle = lite; g.fill(); ol(g, 3);
      poly(g, [-34, -46, -26, -62, 26, -62, 34, -46]); g.fillStyle = GLASS; g.fill();
      g.save(); poly(g, [-34, -46, -26, -62, 26, -62, 34, -46]); g.clip(); helmet(g, -12, -49, 8, drv); g.restore();
      poly(g, [-34, -46, -26, -62, 26, -62, 34, -46]); ol(g, 2.5);
      poly(g, [-29, -66, 29, -66, 25, -70, -25, -70]); g.fillStyle = shade(col, 0.4); g.fill(); ol(g, 2.5);
      band = { x0: -58, x1: 58, y0: -45, y1: -17 };
      body(function () {
        g.beginPath(); g.moveTo(-58, -12); g.lineTo(-58, -32); g.quadraticCurveTo(-58, -44, -44, -45); g.lineTo(44, -45); g.quadraticCurveTo(58, -44, 58, -32); g.lineTo(58, -12);
        g.quadraticCurveTo(58, -8, 53, -8); g.lineTo(-53, -8); g.quadraticCurveTo(-58, -8, -58, -12); g.closePath();
      });
      lights(37, -39, 16, 7);
      rr(g, -56, -17, 112, 8, 4); g.fillStyle = shade(col, -0.42); g.fill(); ol(g, 2.5);
      g.fillStyle = '#AEB6C4'; g.beginPath(); g.arc(-30, -11, 3.5, 0, TAU); g.fill(); ol(g, 2); g.beginPath(); g.arc(30, -11, 3.5, 0, TAU); g.fill(); ol(g, 2);
      roundel(g, 0, -30, 9, d.num);
      wing(g, d, -45, 80, false);
      top = 70; flag = [-48, -44]; light = [0, -70]; jet = -13;
    } else if (B === 2) { // Monster: huge tyres, the body high above the axle
      tyre(g, -45, 30, 50, d, fr); tyre(g, 45, 30, 50, d, fr);
      g.strokeStyle = NAVY; g.lineWidth = 9; g.beginPath(); g.moveTo(-30, -25); g.lineTo(30, -25); g.stroke();
      g.strokeStyle = '#AEB6C4'; g.lineWidth = 4; g.stroke();
      g.strokeStyle = NAVY; g.lineWidth = 7; g.beginPath(); g.moveTo(-22, -25); g.lineTo(-30, -50); g.moveTo(22, -25); g.lineTo(30, -50); g.stroke();
      g.strokeStyle = '#FFC933'; g.lineWidth = 3; g.stroke();
      g.beginPath(); g.arc(0, -25, 8, 0, TAU); g.fillStyle = '#8A92A6'; g.fill(); ol(g, 2.5);
      poly(g, [-34, -76, -26, -96, 26, -96, 34, -76]); g.fillStyle = lite; g.fill(); ol(g, 3);
      poly(g, [-29, -78, -23, -92, 23, -92, 29, -78]); g.fillStyle = GLASS; g.fill();
      g.save(); poly(g, [-29, -78, -23, -92, 23, -92, 29, -78]); g.clip(); helmet(g, -10, -81, 7, drv); g.restore();
      poly(g, [-29, -78, -23, -92, 23, -92, 29, -78]); ol(g, 2.5);
      band = { x0: -42, x1: 42, y0: -77, y1: -50 };
      body(function () { rr(g, -42, -77, 84, 30, 6); });
      lights(28, -72, 11, 8);
      rr(g, -45, -51, 90, 7, 3); g.fillStyle = '#AEB6C4'; g.fill(); ol(g, 2.5);
      roundel(g, 0, -63, 9, d.num);
      wing(g, d, -95, 62, false);
      top = 96; flag = [-36, -76]; light = [0, -96]; jet = -40;
    } else if (B === 3) { // Buggy: a tub, an engine, a roll cage around the driver
      g.save(); g.translate(0, -23); tyre(g, -45, 13, 20, d, fr); tyre(g, 45, 13, 20, d, fr); g.restore();
      g.strokeStyle = NAVY; g.lineWidth = 5; g.beginPath(); g.moveTo(-36, -20); g.lineTo(36, -20); g.stroke();
      tyre(g, -46, 26, 38, d, fr); tyre(g, 46, 26, 38, d, fr);
      helmet(g, 0, -47, 10, drv);
      band = { x0: -30, x1: 30, y0: -35, y1: -10 };
      body(function () { rr(g, -30, -35, 60, 25, 8); });
      rr(g, -12, -30, 24, 15, 3); g.fillStyle = '#AEB6C4'; g.fill(); ol(g, 2);
      g.fillStyle = NAVY; g.beginPath(); g.arc(-6, -22, 3, 0, TAU); g.arc(6, -22, 3, 0, TAU); g.fill();
      for (i = 0; i < 2; i++) { // the cage: a dark line, then the second colour inside it
        g.beginPath(); g.moveTo(-29, -33); g.lineTo(-21, -64); g.lineTo(21, -64); g.lineTo(29, -33);
        g.lineWidth = i ? 3.5 : 8; g.strokeStyle = i ? c2 : NAVY; g.stroke();
      }
      roundel(g, 20, -22, 7.5, d.num);
      wing(g, d, -64, 58, false);
      top = 68; flag = [-27, -40]; light = [0, -66]; jet = -9;
    } else if (B === 4) { // Rocket: a round body with fins and a big nozzle
      tyre(g, -40, 16, 22, d, fr); tyre(g, 40, 16, 22, d, fr);
      poly(g, [-22, -24, -55, -7, -51, -22, -24, -40]); g.fillStyle = c2; g.fill(); ol(g, 3);
      poly(g, [22, -24, 55, -7, 51, -22, 24, -40]); g.fillStyle = c2; g.fill(); ol(g, 3);
      g.beginPath(); g.ellipse(0, -57, 15, 12, 0, 0, TAU); g.fillStyle = GLASS; g.fill();
      g.save(); g.beginPath(); g.ellipse(0, -57, 15, 12, 0, 0, TAU); g.clip(); helmet(g, 0, -59, 7, drv); g.restore();
      g.beginPath(); g.ellipse(0, -57, 15, 12, 0, 0, TAU); ol(g, 2.5);
      band = { x0: -27, x1: 27, y0: -59, y1: -5 };
      body(function () { g.beginPath(); g.arc(0, -32, 27, 0, TAU); });
      poly(g, [-5, -56, 5, -56, 0, -84]); g.fillStyle = c2; g.fill(); ol(g, 3);
      g.beginPath(); g.arc(0, -30, 15, 0, TAU); g.fillStyle = '#8A92A6'; g.fill(); ol(g, 3);
      g.beginPath(); g.arc(0, -30, 10, 0, TAU); g.fillStyle = '#2B3046'; g.fill();
      roundel(g, -18, -50, 6.5, d.num);
      if (d.spoiler) { rr(g, d.spoiler === 2 ? -32 : -22, -76, d.spoiler === 2 ? 64 : 44, 6, 3); g.fillStyle = c2; g.fill(); ol(g, 2.5); }
      top = 84; flag = [-22, -46]; light = [12, -68]; jet = -30;
    } else { // Van: a tall box with two doors
      tyre(g, -45, 20, 22, d, fr); tyre(g, 45, 20, 22, d, fr);
      poly(g, [-48, -86, 48, -86, 43, -91, -43, -91]); g.fillStyle = shade(col, 0.4); g.fill(); ol(g, 2.5);
      band = { x0: -54, x1: 54, y0: -52, y1: -20 };
      body(function () { rr(g, -54, -87, 108, 77, 9); });
      rr(g, -46, -79, 40, 26, 4); g.fillStyle = GLASS; g.fill(); ol(g, 2.5); rr(g, 6, -79, 40, 26, 4); g.fillStyle = GLASS; g.fill(); ol(g, 2.5);
      g.strokeStyle = NAVY; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, -87); g.lineTo(0, -19); g.stroke();
      lights(46, -47, 6, 22);
      rr(g, -56, -19, 112, 9, 4); g.fillStyle = '#AEB6C4'; g.fill(); ol(g, 2.5);
      roundel(g, 0, -38, 9.5, d.num);
      wing(g, d, -90, 76, false);
      top = 92; flag = [-46, -86]; light = [0, -91]; jet = -13;
    }
    if (d.extra === 1) { // roof light: red and blue in turn
      rr(g, light[0] - 8, light[1] - 3, 16, 5, 2); g.fillStyle = '#AEB6C4'; g.fill(); ol(g, 2);
      g.beginPath(); g.arc(light[0], light[1] - 3, 6.5, Math.PI, 0); g.closePath(); g.fillStyle = fr ? '#3B82F6' : '#FF4F6D'; g.fill(); ol(g, 2);
    } else if (d.extra === 2) { // flag
      g.strokeStyle = NAVY; g.lineWidth = 3; g.beginPath(); g.moveTo(flag[0], flag[1]); g.lineTo(flag[0], flag[1] - 36); g.stroke();
      i = fr ? 3 : -2;
      g.beginPath(); g.moveTo(flag[0], flag[1] - 36); g.quadraticCurveTo(flag[0] - 11, flag[1] - 35 + i, flag[0] - 22, flag[1] - 30 - i); g.quadraticCurveTo(flag[0] - 11, flag[1] - 26 + i, flag[0], flag[1] - 23); g.closePath();
      g.fillStyle = c2; g.fill(); ol(g, 2.5);
    } else if (d.extra === 3) { // booster: a nozzle with a flame that points at the camera
      if (B !== 4) { rr(g, -12, jet - 9, 24, 17, 5); g.fillStyle = '#AEB6C4'; g.fill(); ol(g, 2.5); }
      g.beginPath(); g.arc(0, jet, fr ? 8 : 6.5, 0, TAU); g.fillStyle = '#FF7A45'; g.fill(); ol(g, 2);
      g.beginPath(); g.arc(0, jet, fr ? 4.5 : 3.5, 0, TAU); g.fillStyle = '#FFE27A'; g.fill();
    }
    return top;
  }
  // A racer's car is drawn twice per race into small pictures (the second with the tyres a little further round);
  // drawing a car anew every frame is slow on old tablets.
  function carRear(r, k) {
    var q = Math.min(3, Math.max(0.75, Math.ceil(k * V.dpr * 4) / 4)), e = r.rear, i, cnv, g;
    if (!e || e.q !== q) {
      e = r.rear = { q: q, f: [] };
      for (i = 0; i < 2; i++) {
        cnv = document.createElement('canvas'); cnv.width = Math.ceil(CR_W * q); cnv.height = Math.ceil(CR_H * q);
        g = cnv.getContext('2d'); g.scale(cnv.width / CR_W, cnv.height / CR_H); g.translate(CR_OX, CR_OY);
        try { rearCar(g, r.car, i, r.bot ? '#AEB6C4' : r.color); } catch (err) { if (window.console) console.error(err); }
        e.f.push(cnv);
      }
    }
    return e;
  }

  // ---------- the circuit race: state ----------
  var CR = null, craf = 0, clast = 0, lastCReward = null, lastGp = null, myGhost = null, cbg = null, csk = null, cstat = { n: 0, ms: 0, t0: 0 };
  // what the player is pressing: l / r / d from the buttons, kl / kr / kd from the keys, drag from a finger on the road
  var cin = { l: 0, r: 0, d: 0, kl: 0, kr: 0, kd: 0, drag: 0, dragId: null, dragX0: 0, ptr: {}, steer: 0, drift: false, pi: 0 };
  // the road as it is on the screen this frame, one entry per piece (made once: nothing is thrown away while racing)
  var PX = new Float32Array(DRAW_N + 2), PY = new Float32Array(DRAW_N + 2), PW = new Float32Array(DRAW_N + 2), PS = new Float32Array(DRAW_N + 2);
  var WX = new Float32Array(DRAW_N + 2), WY = new Float32Array(DRAW_N + 2), CLV = new Uint8Array(DRAW_N + 2);
  // cars and jellies are sorted into the pieces they stand on: BH = first of each piece, BN = next in the same piece
  var B_MAX = 64, BH = new Int16Array(DRAW_N + 2), BN = new Int16Array(B_MAX), BK = new Int8Array(B_MAX), BI = new Int16Array(B_MAX), BZ = new Float32Array(B_MAX), bCount = 0;
  var F = { camX: 0, camY: 0, frac: 0, cx: 0, hy: 0, K: 0, x: 0, y: 0, s: 0 };
  (function () { for (var i = 0; i < DRAW_N + 2; i++) CLV[i] = Math.min(FOG_N - 1, Math.floor(i * FOG_N / DRAW_N)); })();

  function segAt(T, z) { var i = Math.floor(z / SEG) % T.n; return i < 0 ? i + T.n : i; }
  function roadY(T, z) { var s = Math.floor(z / SEG), i = s % T.n, f = z / SEG - s; if (i < 0) i += T.n; return T.y[i] + (T.y[i + 1] - T.y[i]) * f; }
  function cPassed(z0, z1, oz, len) { return (oz > z0 && oz <= z1) || (oz + len > z0 && oz + len <= z1); }
  function cBack(th) { return th.scn < 3 ? SCN[th.scn] : SNOW; }
  function cFlags(me) {
    return (me.spin > 0 ? 1 : 0) | ((me.turbo > 0 || me.mini > 0) ? 2 : 0) | (me.drift < 0 ? 4 : 0) | (me.drift > 0 ? 8 : 0) | (me.shield ? 16 : 0) |
      (me.rush > 0 ? 32 : 0) | (me.storm > 0 ? 64 : 0) | (me.magnet > 0 ? 128 : 0);
  }
  function cRankCmp(a, b) { // home first in their order, then whoever is furthest
    if (a.dropped !== b.dropped) return a.dropped ? 1 : -1;
    if (a.place && b.place) return a.place - b.place;
    if (a.place) return -1;
    if (b.place) return 1;
    return b.z - a.z;
  }
  function cSay(R, html, secs) { R.banner = html; R.bannerEnd = R.clock + (secs || 2); }

  // screen particles: a fixed set that is used again and again
  function cPuff(R, x, y, n, col, kind, spread, up) {
    var i, p;
    for (i = 0; i < n; i++) {
      p = R.parts[R.pi]; R.pi = (R.pi + 1) % R.parts.length;
      p.x = x + (Math.random() - 0.5) * 16; p.y = y; p.vx = (Math.random() - 0.5) * (spread || 260); p.vy = -(up || 120) - Math.random() * 160;
      p.life = 0; p.max = 0.45 + Math.random() * 0.35; p.r = 4 + Math.random() * 4; p.col = col; p.kind = kind || 0;
    }
  }

  function cStart(m, startIn, watching) {
    var ci = CIRC[m.c] ? m.c : 0, T = buildCircuit(ci), lay = layoutCircuit(ci, m.seed), th = CTH[CIRC[ci].scn] || CTH[0], now = nowMs(), my = api.myId();
    var i, j, a, r, n = T.n, so, q, k, side, pts, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, s, lv, f, R;
    R = CR = {
      mode: m.mode === 'gp' || m.mode === 'trial' ? m.mode : 'race', ci: ci, T: T, len: T.len, lay: lay, th: th, laps: m.laps > 0 ? m.laps | 0 : LAPS, gp: m.gp || null,
      t0: now + startIn, t: -startIn / 1000, clock: 0, born: now, racers: [], byId: {}, me: null, rank: [], rankAt: 0, alive: 0, focus: null,
      haz: [], fws: [], parts: [], pi: 0, item: null, roll: 0, fwHit: 0, hurryEnd: 0, beep: 4, lastSend: 0, finClock: 0,
      camX: 0, skyX: 0, shake: 0, flash: 0, banner: '', bannerEnd: 0, infoSt: -1, sayItem: false, easy: !(lobby && lobby.easy === false), turboT: TURBO_T,
      ghost: null, ghostT0: -1, ghostZ: -1, ghostX: 0, rec: null, recT0: 0, lapZ0: 0, bumpAt: 0, starAt: 0, lost: 0, lostAt: -9, nf: 0,
      segObj: null, boltSeg: [], boxSeg: [], boltLap: null, boxOff: null, col: null, map: null, mapCv: null
    };
    for (i = 0; i < 70; i++) R.parts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 9, max: 0, r: 0, col: '#fff', kind: 0 });
    // what stands beside the road: the same every time, so a circuit can be learned
    so = R.segObj = new Array(n);
    for (i = 0; i < n; i++) { so[i] = null; R.boltSeg.push(null); R.boxSeg.push(null); }
    for (i = 4; i < n - 2; i += 2) {
      q = prn(i * 3.17 + ci * 57.3); side = (i >> 1) % 2 ? 1 : -1;
      k = th.side[Math.floor(prn(i * 1.31 + ci * 9.1) * th.side.length) % th.side.length];
      so[i] = [{ sp: sprite(k[0]), x: side * (1.5 + k[2] + q * 1.5), s: k[1] * (0.85 + prn(i + 9.5) * 0.3) }];
      if (i % 8 === 4) { // a second row further out
        k = th.side[Math.floor(prn(i * 2.77 + ci * 3.3) * th.side.length) % th.side.length];
        so[i].push({ sp: sprite(k[0]), x: -side * (3.4 + k[2] + q * 2.2), s: k[1] * (0.9 + prn(i + 4.5) * 0.3) });
      }
    }
    for (i = 7; i < n - 2; i += th.post[2]) { // a row of posts right at the edge: they show how fast the car goes
      side = (i / th.post[2] | 0) % 2 ? 1 : -1;
      (so[i] || (so[i] = [])).push({ sp: sprite(th.post[0]), x: side * 1.27, s: th.post[1] });
    }
    for (i = 0; i < lay.bolts.length; i++) { j = Math.floor(lay.bolts[i].z / SEG) % n; (R.boltSeg[j] || (R.boltSeg[j] = [])).push(i); }
    for (i = 0; i < lay.boxes.length; i++) { j = Math.floor(lay.boxes[i].z / SEG) % n; (R.boxSeg[j] || (R.boxSeg[j] = [])).push(i); }
    R.boltLap = new Int16Array(lay.bolts.length); R.boxOff = new Float32Array(lay.boxes.length);
    // the colours of the ground, fading into the haze far away
    R.col = { g: [[], []], r: [[], []], m: [[], []], l: [] };
    for (lv = 0; lv < FOG_N; lv++) {
      f = Math.pow(lv / (FOG_N - 1), 1.6) * 0.78;
      for (j = 0; j < 2; j++) { R.col.g[j].push(mix(th.grass[j], th.fog, f)); R.col.r[j].push(mix(th.road[j], th.fog, f)); R.col.m[j].push(mix(th.rum[j], th.fog, f)); }
      R.col.l.push(mix(th.lane, th.fog, f));
    }
    // the map: the loop from above, fitted into a square
    pts = mapOfCircuit(T);
    for (i = 0; i < n; i++) { minx = Math.min(minx, pts[i][0]); maxx = Math.max(maxx, pts[i][0]); miny = Math.min(miny, pts[i][1]); maxy = Math.max(maxy, pts[i][1]); }
    s = 1 / Math.max(maxx - minx, maxy - miny);
    R.map = new Float32Array(n * 2);
    for (i = 0; i < n; i++) { R.map[i * 2] = 0.5 + (pts[i][0] - (minx + maxx) / 2) * s; R.map[i * 2 + 1] = 0.5 + (pts[i][1] - (miny + maxy) / 2) * s; }
    // the racers
    for (i = 0; i < m.racers.length; i++) {
      a = m.racers[i];
      r = { rid: a.rid, pid: a.pid, name: String(a.name || '?'), color: a.color || '#FF7A45', car: a.car || (Car ? Car.defaults() : null), bot: !!a.bot,
        gz: +a.gz || 0, gx: +a.gx || 0, z: +a.gz || 0, tz: +a.gz || 0, pv: 0, at: 0, x: +a.gx || 0, tx: +a.gx || 0, f: 0, vv: 0, lean: 0, spinA: 0,
        lap: 0, done: false, place: 0, ms: 0, dropped: false, best: 0, sx: 0, sy: 0, sk: 0, seen: -1, rear: null,
        tag: { name: String(a.name || '?'), lv: a.lv || 0 } };
      r.cc = carColor(r.car); q = carOf(r.car);
      r.topH = REAR_TOP[q.body] + (q.extra === 2 ? 14 : q.extra === 1 ? 8 : 0) + (q.spoiler === 2 && q.body !== 4 ? 10 : 0);
      R.racers.push(r); R.byId[r.rid] = r;
      if (!watching && !r.bot && r.pid === my) {
        R.me = r;
        r.v = 0; r.steer = 0; r.drift = 0; r.charge = 0; r.mini = 0; r.turbo = 0; r.rush = 0; r.storm = 0; r.shield = false; r.shieldT = 0; r.magnet = 0;
        r.spin = 0; r.inv = 0; r.bolts = 0; r.lapAt = 0; r.lastLap = 0; r.fin = false; r.finMs = 0; r.off = false;
        if (q.extra === 3) R.turboT = TURBO_T + 0.5;                // the Booster extra makes a turbo last a little longer
      }
    }
    R.rank = R.racers.slice(); R.rank.sort(cRankCmp); R.alive = R.rank.length;
    if (R.mode === 'trial' && R.me && myGhost && myGhost.c === ci && Array.isArray(myGhost.d)) R.ghost = { ms: myGhost.ms, d: myGhost.d };
    lastCReward = null; lastGp = null;
    cin.l = cin.r = cin.d = cin.kl = cin.kr = cin.kd = 0; cin.drag = 0; cin.dragId = null; cin.ptr = {}; cin.steer = 0; cin.drift = false;
    cstat.n = 0; cstat.ms = 0; cstat.t0 = now;
    HC.pk = HC.lk = HC.tk = HC.bk = HC.gk = HC.hk = -1;
    setView('circ');
  }

  // ---------- my own car ----------
  function cPopShield(R, me) {
    me.shield = false; me.shieldT = 0;
    cPuff(R, me.sx, me.sy - 40 * me.sk, 10, '#BFEFFF', 0, 420, 60);
    sfx('emote');
  }
  function cHit(R, me) { // something hit my car: a spin and some bolts lost, never more than that
    var n;
    if (me.fin || me.rush > 0) return;
    if (me.shield) { cPopShield(R, me); return; }
    if (me.inv > 0) return;
    me.spin = 1.1; me.inv = 2.6; me.v *= 0.35; me.drift = 0; me.charge = 0; me.turbo = 0; me.mini = 0;
    n = Math.min(3, me.bolts); me.bolts -= n; R.lost = n; R.lostAt = R.clock; R.shake = 0.35;
    cPuff(R, me.sx, me.sy - 30 * me.sk, 8, '#FFE14D', 1, 520, 200);
    sfx('wrong');
  }
  function cUse(R) { // the Item button
    var me = R.me, k = R.item;
    if (!me || me.fin || R.t < 0 || !k || R.clock < R.roll) return;
    R.item = null;
    if (k === 'turbo') { me.turbo = R.turboT; R.flash = 0.3; sfx('car'); }
    else if (k === 'bubble') { me.shield = true; me.shieldT = 20; sfx('emote'); }
    else if (k === 'magnet') { me.magnet = 8; sfx('claim'); }
    else if (k === 'rush') { me.rush = RUSH_T; R.flash = 0.3; sfx('levelup'); }
    else sfx('emote');
    api.send({ t: 'race.use' });
  }
  function cSendPos(me) { api.send({ t: 'race.cp', z: Math.round(me.z), x: Math.round(me.x * 100) / 100, f: cFlags(me) }); }
  function cRecStart(R, tc) { // a new lap begins: the ghost starts again, and (in a time trial) so does the recording of my own lap
    var me = R.me;
    R.ghostT0 = tc; R.lapZ0 = me.lap * R.len;
    if (R.mode === 'trial') { R.rec = []; R.recT0 = tc; }
  }
  function cTouch(R, me, z0) { // what my car runs over or into
    var T = R.T, len = R.len, n = T.n, mag = me.magnet > 0, reach = mag ? 2600 : 0, wide = mag ? 1.7 : 0.21;
    var s, s0 = Math.floor(z0 / SEG), s1 = Math.floor((me.z + reach) / SEG), i, j, list, b, bz, lapK, h, o, d, zl0, zl1;
    for (s = s0; s <= s1; s++) {
      i = s % n; if (i < 0) i += n;
      lapK = Math.floor(s / n) + 2;
      list = R.boltSeg[i];
      if (list) for (j = 0; j < list.length; j++) { // bolts: each one makes the car a little faster
        b = list[j];
        if (R.boltLap[b] === lapK) continue;
        bz = (lapK - 2) * len + R.lay.bolts[b].z;
        if (bz <= z0 || bz > me.z + reach || Math.abs(R.lay.bolts[b].x - me.x) > wide) continue;
        R.boltLap[b] = lapK;
        if (me.bolts < BOLT_MAX) me.bolts++;
        cPuff(R, me.sx, me.sy - 50 * me.sk, 3, '#74DBFF', 1, 200, 160);
        if (R.clock - R.starAt > 0.09) { R.starAt = R.clock; sfx('star'); }
      }
      list = R.boxSeg[i];
      if (list && R.mode !== 'trial' && !R.item && R.clock >= R.roll) for (j = 0; j < list.length; j++) { // an item box: the server says what is inside
        b = list[j]; bz = (lapK - 2) * len + R.lay.boxes[b].z;
        if (bz <= z0 || bz > me.z || R.boxOff[b] > R.clock || Math.abs(R.lay.boxes[b].x - me.x) > 0.23) continue;
        R.boxOff[b] = R.clock + BOX_S; R.roll = R.clock + 1.1;
        api.send({ t: 'race.box', i: b });
        cPuff(R, me.sx, me.sy - 60 * me.sk, 8, '#C9B6FF', 1, 420, 200);
        sfx('chest');
        break;
      }
    }
    zl0 = mod(z0, len); zl1 = zl0 + (me.z - z0);
    for (i = R.haz.length - 1; i >= 0; i--) { // a jelly on the road
      h = R.haz[i];
      if (R.clock - h.born < 0.5 || !cPassed(zl0, zl1, h.z, len) || Math.abs(h.x - me.x) > 0.24) continue;
      R.haz.splice(i, 1);
      api.send({ t: 'race.hit', id: h.id });
      cPuff(R, me.sx, me.sy - 20 * me.sk, 9, '#8FE36B', 0, 420, 160);
      cHit(R, me);
    }
    // no driving through the car in front (not in the crowd of the start, and only when I am clearly faster)
    if (R.mode !== 'trial' && me.rush <= 0 && R.t > 3) for (i = 0; i < R.racers.length; i++) {
      o = R.racers[i];
      if (o === me || o.dropped) continue;
      d = mod(o.z - me.z, len);
      if (d > 0 && d < 1050 && Math.abs(o.x - me.x) < 0.3 && me.v > o.vv * 1.04) {
        me.v = Math.max(o.vv, me.v * 0.94); me.x += me.x >= o.x ? 0.012 : -0.012;
        if (R.clock - R.bumpAt > 0.7) { R.bumpAt = R.clock; sfx('tap'); }
      }
    }
  }
  function cStep(R, me, h, tEnd) { // one small step of my car; tEnd = race time at the end of the step
    var T = R.T, curve, sp, eff, k, vt, off, z0, tc, line, ms, lapMs, msg, was;
    if (tEnd <= 0) return;                                           // on the grid, waiting for GO
    if (me.turbo > 0) me.turbo -= h;
    if (me.mini > 0) me.mini -= h;
    if (me.rush > 0) me.rush -= h;
    if (me.storm > 0) me.storm -= h;
    if (me.magnet > 0) me.magnet -= h;
    if (me.spin > 0) me.spin -= h;
    if (me.inv > 0) me.inv -= h;
    if (me.shield) { me.shieldT -= h; if (me.shieldT <= 0) me.shield = false; }
    if (me.fin) { // home: the car rolls on by itself in the middle of the road
      me.steer = 0; me.drift = 0;
      me.x += clamp(-me.x, -h * 0.8, h * 0.8);
      me.v += clamp(CV0 * 0.4 - me.v, -3000 * h, 1500 * h);
      me.z += me.v * h;
      return;
    }
    curve = T.c[segAt(T, me.z)]; sp = Math.min(1.3, me.v / CV0);
    me.steer += clamp(cin.steer - me.steer, -h * 7, h * 7);
    // drifting: hold Drift while steering to slide through a bend; letting go fires the turbo that the slide charged
    if (me.drift) {
      if (!cin.drift || me.spin > 0 || Math.abs(me.x) > 1.12 || me.v < CV0 * 0.4) {
        if (!cin.drift && me.spin <= 0 && me.charge >= DRIFT_T1) { me.mini = me.charge >= DRIFT_T2 ? 1.4 : 0.75; R.flash = 0.12; sfx('car'); }
        me.drift = 0; me.charge = 0;
      }
    } else if (cin.drift && me.spin <= 0 && Math.abs(me.steer) > 0.3 && me.v > CV0 * 0.5 && Math.abs(me.x) < 1.05) {
      me.drift = me.steer > 0 ? 1 : -1; me.charge = 0;
    }
    if (me.spin > 0) eff = 0;
    else if (me.drift) {
      eff = me.drift * 0.06 + me.steer * 0.33;                                           // a sliding car holds its line: the arrows only nudge it
      was = me.charge;
      me.charge += h * Math.min(1, Math.abs(curve) / 2.5) * (me.steer * me.drift > 0.2 ? 1 : 0.6);   // the turbo only charges in a bend
      if ((was < DRIFT_T1 && me.charge >= DRIFT_T1) || (was < DRIFT_T2 && me.charge >= DRIFT_T2)) sfx('claim');
    } else eff = me.steer;
    me.x += C_STEER * Math.min(1, 0.25 + sp) * eff * h;
    // a bend pushes the car outward (much less while it slides, and less with easy steering)
    me.x -= C_CENT * curve * sp * sp * (me.drift ? 0.15 : R.easy ? 0.35 : 1) * h;
    if (R.easy && Math.abs(me.x) > 0.8) me.x -= (me.x > 0 ? 1 : -1) * (Math.abs(me.x) - 0.8) * 2.4 * h;   // easy steering: a soft pull back onto the road
    if (me.x > C_XMAX) me.x = C_XMAX; else if (me.x < -C_XMAX) me.x = -C_XMAX;
    // speed: the car accelerates by itself; the grass slows it
    k = 1;
    if (me.turbo > 0) k = TURBO_K; else if (me.rush > 0) k = RUSH_K; else if (me.mini > 0) k = MINI_K;
    if (me.storm > 0) k *= STORM_K;
    vt = CV0 * (1 + BOLT_K * me.bolts) * (R.easy ? 0.97 : 1) * k;
    off = Math.abs(me.x) > 1.06 && me.rush <= 0; me.off = off;
    if (me.spin > 0) vt = CV0 * 0.2; else if (off) vt = Math.min(vt, CV0 * C_GRASS);
    if (me.v < vt) me.v = Math.min(vt, me.v + C_ACC * (k > 1 ? 2.4 : 1) * h); else me.v = Math.max(vt, me.v - (me.spin > 0 ? 9000 : off ? 6500 : 2800) * h);
    z0 = me.z; me.z += me.v * h;
    cTouch(R, me, z0);
    // the line
    line = (me.lap + 1) * R.len;
    if (z0 < 0 && me.z >= 0) {
      tc = tEnd - me.z / Math.max(1, me.v);
      me.lapAt = Math.max(1, Math.round(tc * 1000));
      api.send({ t: 'race.lap', n: 0, ms: me.lapAt });
      cRecStart(R, tc);
    } else if (me.z >= line) {
      tc = tEnd - (me.z - line) / Math.max(1, me.v);
      ms = Math.max(me.lapAt + 1, Math.round(tc * 1000)); lapMs = ms - me.lapAt;
      me.lap++; me.lapAt = ms; me.lastLap = lapMs;
      if (!me.best || lapMs < me.best) me.best = lapMs;
      cSendPos(me);
      msg = { t: 'race.lap', n: me.lap, ms: ms };
      if (R.mode === 'trial' && R.rec && R.rec.length >= 20 && R.rec.length <= 796 && (!R.ghost || lapMs < R.ghost.ms)) { // my best lap so far: it becomes the ghost
        R.rec.push(R.len, Math.round(me.x * 100));
        msg.ghost = R.rec;
        R.ghost = { ms: lapMs, d: R.rec }; myGhost = { c: R.ci, ms: lapMs, d: R.rec };
      }
      api.send(msg);
      if (me.lap >= R.laps) {
        me.fin = true; me.finMs = ms; R.finClock = R.clock; R.item = null; R.roll = 0; R.rec = null; R.ghostZ = -1; R.ghostT0 = -1;
        me.turbo = me.mini = me.rush = me.storm = 0; me.drift = 0;
        for (k = 0; k < 40; k++) cPuff(R, Math.random() * V.W, V.H * 0.2 * Math.random(), 1, RAINBOW[k % 6], 1, 200, -40);
        sfx('tagwin');
      } else {
        cRecStart(R, tc);
        cSay(R, '🏁 <b>' + (me.lap + 1) + ' / ' + R.laps + '</b> · ⏱ ' + fmt(lapMs), 2.4);
        sfx('quest');
      }
    }
  }

  // ---------- the other cars ----------
  function cOnPos(m) {
    var R = CR, now = nowMs(), i, a, r, dtm, v;
    if (!R || !Array.isArray(m.p)) return;
    for (i = 0; i < m.p.length; i++) {
      a = m.p[i]; r = R.byId[a[0]];
      if (!r || r === R.me || r.done) continue;                     // a car that is home rolls on by itself
      dtm = (now - r.at) / 1000;
      if (r.at && dtm > 0.03) { v = clamp((a[1] - r.tz) / dtm, 0, 12000); r.pv = r.pv * 0.4 + v * 0.6; }
      r.tz = a[1]; r.at = now; r.tx = a[2] / 100;
      if ((a[3] & 1) && !(r.f & 1)) r.spinA = 1.1;
      r.f = a[3] | 0;
    }
  }
  function cOthers(R, dt, now) {
    var i, r, ext, want, me = R.me;
    for (i = 0; i < R.racers.length; i++) {
      r = R.racers[i];
      if (r === me) {
        r.vv = r.v; r.f = cFlags(r); r.spinA = r.spin > 0 ? r.spin : 0;
        want = r.drift ? r.drift * 1.7 : r.steer;
      } else {
        if (r.dropped) continue;
        if (r.done) { r.pv += clamp(CV0 * 0.4 - r.pv, -3000 * dt, 1500 * dt); r.z += r.pv * dt; r.x += clamp(-r.x, -dt * 0.8, dt * 0.8); r.tx = r.x; }
        else {
          ext = r.tz + r.pv * Math.min(0.3, r.at ? (now - r.at) / 1000 : 0);
          if (Math.abs(ext - r.z) > 7000) r.z = ext; else r.z += (ext - r.z) * Math.min(1, dt * 9);
        }
        want = (r.f & 4) ? -1.7 : (r.f & 8) ? 1.7 : clamp((r.tx - r.x) * 7, -1, 1);
        r.x += (r.tx - r.x) * Math.min(1, dt * 8);
        r.vv = r.pv;
        if (r.spinA > 0) r.spinA -= dt;
      }
      r.lean += clamp(want - r.lean, -dt * 9, dt * 9);
    }
  }
  function cFocus(R) { // whose car the camera follows: mine; once I am home (or if I only watch), whoever leads
    var me = R.me, f = null, i, r, humans = false;
    for (i = 0; i < R.racers.length; i++) { r = R.racers[i]; if (!r.dropped && !r.done && !r.bot && r !== me) humans = true; }
    if (me && !(me.fin && humans && R.clock - R.finClock > 2.5)) return me;
    for (i = 0; i < R.racers.length; i++) {
      r = R.racers[i];
      if (r.dropped || r.done || r === me || (humans && r.bot)) continue;
      if (!f || r.z > f.z) f = r;
    }
    return f || me || R.rank[0] || R.racers[0];
  }
  function cFx(m) { // someone used an item
    var R = CR, r, to, me, i, dur;
    if (!R) return;
    r = R.byId[m.rid]; me = R.me;
    if (m.k === 'jelly') { if (m.id > 0) R.haz.push({ id: m.id, z: +m.z || 0, x: +m.x || 0, born: R.clock }); }
    else if (m.k === 'firework') {
      to = R.byId[m.to] || null; dur = (+m.ms || 1100) / 1000;
      // it starts at the car that fired it; if that car is behind the camera, it comes in from the bottom of the screen
      if (r) R.fws.push({ from: r, to: to, t0: R.clock, dur: dur, vis: r.seen >= R.nf - 2, x: r.seen >= R.nf - 2 ? r.sx : V.W / 2, y: r.seen >= R.nf - 2 ? r.sy - 40 * r.sk : V.H + 40 });
      if (to && to === me) { R.fwHit = R.clock + dur; sfx('tagit'); }
    } else if (m.k === 'storm') {
      if (me && !me.fin && Array.isArray(m.to)) for (i = 0; i < m.to.length; i++) if (m.to[i] === me.rid) {
        if (me.rush > 0) break;
        if (me.shield) cPopShield(R, me); else { me.storm = +m.dur || STORM_T; sfx('wrong'); }
      }
    }
    if (r && r !== me && r.seen >= R.nf - 2 && R.clock - R.starAt > 0.2) { R.starAt = R.clock; sfx('emote'); }
  }

  function cframe() {
    var R = CR, now, dt, left, h, me, n, t1, i, d, tg, k;
    if (!root || view !== 'circ' || !R) { craf = 0; return; }
    craf = requestAnimationFrame(cframe);
    now = nowMs(); dt = Math.min(0.25, Math.max(0, (now - clast) / 1000)); clast = now;
    R.t = (now - R.t0) / 1000; R.clock = (now - R.born) / 1000; R.nf++;
    me = R.me;
    cin.steer = clamp((cin.r || cin.kr ? 1 : 0) - (cin.l || cin.kl ? 1 : 0) + cin.drag, -1, 1); cin.drift = !!(cin.d || cin.kd);
    if (me) { // small steps, so a slow tablet does not lose any time
      left = dt;
      while (left > 0.0001) { h = Math.min(left, 1 / 60); left -= h; cStep(R, me, h, R.t - left); }
      if (!me.fin && R.t > -0.5 && now - R.lastSend >= 95) { R.lastSend = now; cSendPos(me); }
      if (R.fwHit && R.clock >= R.fwHit) { R.fwHit = 0; cHit(R, me); }
      if (R.sayItem && R.clock >= R.roll) { R.sayItem = false; if (R.item) cSay(R, api.three(ITEM_NAMES[R.item]), 2.2); }   // the name of the item, once the wheel has stopped
      if (R.rec && !me.fin) while (R.t - R.recT0 >= (R.rec.length / 2) * GHOST_DT && R.rec.length < 800) R.rec.push(Math.round(me.z - R.lapZ0), Math.round(me.x * 100));
      if (R.ghost && R.ghostT0 >= 0) { // where the ghost of my best lap is now
        tg = (R.t - R.ghostT0) / GHOST_DT; i = Math.floor(tg); d = R.ghost.d; k = tg - i;
        if (tg >= 0 && i * 2 + 3 < d.length) { R.ghostZ = R.lapZ0 + d[i * 2] + (d[i * 2 + 2] - d[i * 2]) * k; R.ghostX = (d[i * 2 + 1] + (d[i * 2 + 3] - d[i * 2 + 1]) * k) / 100; }
        else R.ghostZ = -1;
      }
    }
    n = Math.ceil(-R.t);                                          // 3 - 2 - 1 - GO
    if (n < R.beep && n <= 3 && n >= 0) { R.beep = n; sfx(n > 0 ? 'tap' : 'right'); }
    cOthers(R, dt, now);
    if (now - R.rankAt > 200) { R.rank.sort(cRankCmp); R.rankAt = now; n = 0; for (i = 0; i < R.rank.length; i++) if (!R.rank[i].dropped) n++; R.alive = n; }
    R.focus = cFocus(R);
    if (!R.focus) return;
    R.camX += (R.focus.x * RW * 0.78 - R.camX) * Math.min(1, dt * 10);
    R.skyX += R.T.c[segAt(R.T, R.focus.z)] * (R.focus.vv / CV0) * dt * 70 * V.bgS;
    if (R.shake > 0) R.shake -= dt;
    if (R.flash > 0) R.flash -= dt;
    cRender(R, dt);
    cInfo(R);
    t1 = nowMs(); cstat.n++; cstat.ms += t1 - now;
  }

  // ---------- drawing ----------
  function buildCBg(th) { // the far picture of the circuit: drawn once, then scrolled sideways in the bends
    var d = TILE.far, q = Math.min(1.5, Math.max(0.5, Math.ceil(V.bgS * V.dpr * 4) / 4)), c, g;
    if (cbg && cbg.scn === th.scn && cbg.q === q) return;
    c = document.createElement('canvas'); c.width = Math.ceil(d.w * q); c.height = Math.ceil(d.h * q);
    g = c.getContext('2d'); g.scale(c.width / d.w, c.height / d.h); g.translate(0, -d.y); g.lineJoin = 'round'; g.lineCap = 'round';
    cBack(th).far(g, d.w);
    cbg = { scn: th.scn, q: q, c: c };
  }
  // where a thing on the road is on the screen: rel = how far ahead of the camera, xr = across the road (-1 .. 1). Fills F.x, F.y, F.s.
  function cProj(rel, xr) {
    var t = rel / SEG + F.frac, i = Math.floor(t), f = t - i, s;
    if (i < 0 || i >= DRAW_N || rel < 200) return false;
    s = CAM_D / rel * F.K;
    F.x = F.cx + (WX[i] + (WX[i + 1] - WX[i]) * f + xr * RW - F.camX) * s;
    F.y = F.hy - (WY[i] + (WY[i + 1] - WY[i]) * f - F.camY) * s;
    F.s = s;
    return true;
  }
  function bAdd(kind, idx, rel) {
    var seg = Math.floor(rel / SEG + F.frac), j, p, q;
    if (seg < 1 || seg >= DRAW_N || rel < 300 || bCount >= B_MAX) return;
    j = bCount++; BK[j] = kind; BI[j] = idx; BZ[j] = rel;
    p = -1; q = BH[seg];
    while (q >= 0 && BZ[q] > rel) { p = q; q = BN[q]; }           // the far ones are drawn first
    BN[j] = q;
    if (p < 0) BH[seg] = j; else BN[p] = j;
  }
  function cLine(c, i) { // the chequered start and finish line across the road
    var j, k, xa, xb, wa, wb, ya, yb, f0, f1, x1 = PX[i], x2 = PX[i + 1], w1 = PW[i], w2 = PW[i + 1], y1 = PY[i], y2 = PY[i + 1];
    for (k = 0; k < 2; k++) {
      f0 = k * 0.5; f1 = f0 + 0.5;
      xa = x1 + (x2 - x1) * f0; xb = x1 + (x2 - x1) * f1; wa = w1 + (w2 - w1) * f0; wb = w1 + (w2 - w1) * f1; ya = y1 + (y2 - y1) * f0; yb = y1 + (y2 - y1) * f1;
      for (j = 0; j < 10; j++) {
        c.fillStyle = (j + k) % 2 ? NAVY : '#FFFFFF';
        c.beginPath(); c.moveTo(xa + wa * (j / 5 - 1), ya); c.lineTo(xa + wa * ((j + 1) / 5 - 1), ya); c.lineTo(xb + wb * ((j + 1) / 5 - 1), yb); c.lineTo(xb + wb * (j / 5 - 1), yb); c.fill();
      }
    }
  }
  function cGantry(c, i) { // two posts and a chequered banner above the line
    var s = PS[i], x = PX[i], w = PW[i] * 1.2, y = PY[i], hgt = 1500 * s, bh = 360 * s, pw = Math.max(2, 90 * s), j, k, cw;
    if (hgt < 8 || s > 0.9) return;
    c.fillStyle = NAVY; c.fillRect(x - w - pw, y - hgt, pw, hgt); c.fillRect(x + w, y - hgt, pw, hgt);
    c.fillStyle = '#E8ECF2'; c.fillRect(x - w - pw * 0.72, y - hgt, pw * 0.44, hgt); c.fillRect(x + w + pw * 0.28, y - hgt, pw * 0.44, hgt);
    c.fillStyle = '#FFFFFF'; c.fillRect(x - w, y - hgt, w * 2, bh);
    cw = w * 2 / 14; c.fillStyle = NAVY;
    for (j = 0; j < 14; j++) for (k = 0; k < 2; k++) if ((j + k) % 2) c.fillRect(x - w + j * cw, y - hgt + k * bh / 2, cw + 0.5, bh / 2 + 0.5);
    c.lineWidth = Math.max(1.5, 30 * s); c.strokeStyle = NAVY; c.strokeRect(x - w, y - hgt, w * 2, bh);
  }
  function cDrawRacer(c, R, r, rel) {
    var k, sx, sy, e, fr, u, q, sq = 1, hop = 0, isMe = r === R.me, top, a, al;
    if (!cProj(rel, r.x)) return;
    // a car between the camera and the car it follows fades away, so that it never hides that car
    al = rel >= CAM_BACK - 250 ? 1 : clamp((rel - 500) / (CAM_BACK - 750), 0, 1);
    k = CAR_WW / 120 * F.s; sx = F.x; sy = F.y;
    r.sx = sx; r.sy = sy; r.sk = k; r.seen = R.nf;
    if (sx < -120 * k || sx > V.W + 120 * k || al < 0.04) return;
    if ((r.f & 32) && al === 1) { // rainbow rush: a glow in changing colours
      c.globalAlpha = 0.42; c.fillStyle = RAINBOW[(Math.floor(R.clock * 12) + r.rid) % 6]; ell(c, sx, sy - 40 * k, 84 * k, 62 * k); c.fill();
      c.fillStyle = RAINBOW[(Math.floor(R.clock * 12) + r.rid + 3) % 6]; ell(c, sx, sy - 40 * k, 66 * k, 48 * k); c.fill(); c.globalAlpha = 1;
    }
    if (r.spinA > 0) { u = clamp(1 - r.spinA / 1.1, 0, 1); sq = Math.cos(u * TAU * 2); if (Math.abs(sq) < 0.1) sq = sq < 0 ? -0.1 : 0.1; hop = Math.sin(u * Math.PI) * 12 * k; }
    e = carRear(r, V.ck); fr = e.f[r.vv > 300 ? (Math.floor(R.clock * 12 + r.rid) & 1) : 0];
    c.save(); c.translate(sx, sy - hop);
    if (r.lean) c.transform(1, 0, -r.lean * 0.1, 1, 0, 0);            // the car leans into the bend, and more when it slides
    if (sq !== 1) c.scale(sq, 1);
    if (R.mode === 'trial' && !isMe) al *= 0.55;                    // in a time trial the others are see-through: nobody is in the way
    if (al < 1) c.globalAlpha = al;
    c.drawImage(fr, -CR_OX * k, -CR_OY * k, CR_W * k, CR_H * k);
    c.restore();
    if (al < 0.5) return;                                           // no flames, bubble or name for a car that is fading away
    if (r.f & 2) { // turbo: flames that point at the camera
      u = (7 + 3 * Math.sin(R.clock * 40 + r.rid)) * k;
      for (q = -1; q <= 1; q += 2) {
        c.beginPath(); c.arc(sx + q * 16 * k, sy - 9 * k, u, 0, TAU); c.fillStyle = '#FF7A45'; c.fill(); c.lineWidth = 2; c.strokeStyle = NAVY; c.stroke();
        c.beginPath(); c.arc(sx + q * 16 * k, sy - 9 * k, u * 0.55, 0, TAU); c.fillStyle = '#FFE27A'; c.fill();
      }
    }
    if (r.f & 12) { // sliding: sparks at the back wheels; mine show how much turbo is charged
      a = isMe ? (r.charge >= DRIFT_T2 ? '#FF9F43' : r.charge >= DRIFT_T1 ? '#5CD4FF' : '#FFFFFF') : '#FFFFFF';
      c.fillStyle = a; c.strokeStyle = NAVY; c.lineWidth = 1.2;
      for (q = 0; q < 6; q++) {
        u = (q % 2 ? 1 : -1) * (44 + Math.random() * 22) * k;
        star(c, sx + u, sy - (2 + Math.random() * 16) * k, (3 + Math.random() * 4) * k); c.fill(); c.stroke();
      }
      c.fillStyle = 'rgba(255,255,255,0.5)';
      for (q = -1; q <= 1; q += 2) { c.beginPath(); c.arc(sx + q * 52 * k, sy - 4 * k, (9 + 4 * Math.sin(R.clock * 25 + q)) * k, 0, TAU); c.fill(); }
    }
    if (r.f & 16) { // the bubble shield
      c.beginPath(); c.arc(sx, sy - 42 * k, 72 * k, 0, TAU); c.fillStyle = 'rgba(140,220,255,0.22)'; c.fill(); c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.stroke();
      c.beginPath(); c.arc(sx, sy - 42 * k, 60 * k, Math.PI * 1.1, Math.PI * 1.5); c.lineWidth = 4; c.stroke();
    }
    top = sy - (r.topH + 6) * k - hop;
    if (r.f & 64) { // a storm cloud rains on the car
      u = k * 1.5; e = sprite('cloud');
      c.drawImage(e.c, sx - e.ox * u, top - 46 * u + Math.sin(R.clock * 6 + r.rid) * 3 * k, e.w * u, e.h * u);
      top -= 50 * u;
    }
    if (r.f & 128) { e = sprite('i_magnet'); u = k * 0.9; c.drawImage(e.c, sx - e.ox * u, top - 50 * u, e.w * u, e.h * u); top -= 50 * u; }
    if (isMe) {
      if (R.t < 1.5) { // a bouncing arrow: this one is you
        u = top - 30 - Math.abs(Math.sin(R.clock * 5)) * 10;
        poly(c, [sx - 14, u, sx + 14, u, sx, u + 18]); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 3);
      }
      if (R.clock - R.lostAt < 0.9 && R.lost > 0) { // bolts lost in a hit
        u = (R.clock - R.lostAt) / 0.9; c.globalAlpha = 1 - u;
        c.font = '700 ' + Math.round(26 * Math.max(0.7, k / 1.6)) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 5; c.strokeStyle = NAVY; c.strokeText('−' + R.lost + ' ⚡', sx, top - 14 - u * 30); c.fillStyle = '#FF8FB8'; c.fillText('−' + R.lost + ' ⚡', sx, top - 14 - u * 30);
        c.globalAlpha = 1;
      }
    } else if (k > 0.26) { // the name sits right above the car; far away it gets smaller
      u = clamp(k / 1.5, 0.5, 1);
      c.drawImage(cTag(r), sx - 120 * u, top - 34 * u, 240 * u, 36 * u);
    }
  }
  function cTag(r) { // a racer's name tag: written once into a small picture, then only copied
    var q = Math.min(2, V.dpr), cnv = r.tagCv, g;
    if (cnv && r.tagQ === q) return cnv;
    cnv = document.createElement('canvas'); cnv.width = Math.ceil(240 * q); cnv.height = Math.ceil(36 * q);
    g = cnv.getContext('2d'); g.scale(q, q);
    if (r.bot) api.label(g, '🤖 ' + r.name, 120, 34, '#E8ECF2', NAVY, 15); else api.nameTag(g, r.tag, 120, 34, false);
    r.tagCv = cnv; r.tagQ = q;
    return cnv;
  }
  function buildCSky(th, W, hy) { // the sky with its sun or moon: painted once
    var q = V.dpr, cnv, g;
    if (csk && csk.scn === th.scn && csk.W === W && csk.hy === hy && csk.q === q) return;
    cnv = document.createElement('canvas'); cnv.width = Math.max(1, Math.round(W * q)); cnv.height = Math.max(1, Math.round((hy + 2) * q));
    g = cnv.getContext('2d'); g.scale(q, q); g.lineJoin = 'round'; g.lineCap = 'round';
    g.fillStyle = lin(g, 0, 0, 0, hy, th.sky[0], th.sky[1]); g.fillRect(0, 0, W, hy + 2);
    g.translate(0, hy + 2 - 334 * V.bgS); g.scale(V.bgS, V.bgS);
    cBack(th).back(g, W / V.bgS, 1);
    csk = { scn: th.scn, W: W, hy: hy, q: q, c: cnv };
  }
  function cRender(R, dt) {
    var c = ctx, W = V.W, H = V.H, K = V.K, hy = V.hy, T = R.T, n = T.n, th = R.th, col = R.col, me = R.me, f = R.focus || me || R.racers[0];
    var camZ, base, frac, bi, i, si, rel, sc, x, dx, sAbs, lv, y1, y2, x1, x2, w1, w2, alt, list, j, o, s, u, w, q, k, lapK, p, a, e;
    if (!W || !H || !f) return;
    c.setTransform(V.dpr, 0, 0, V.dpr, 0, 0); c.lineJoin = 'round'; c.lineCap = 'round'; c.globalAlpha = 1;
    camZ = f.z - CAM_BACK; base = Math.floor(camZ / SEG); frac = camZ / SEG - base; bi = base % n; if (bi < 0) bi += n;
    F.frac = frac; F.cx = W / 2; F.hy = hy; F.K = K; F.camX = R.camX; F.camY = CAM_H + roadY(T, f.z);
    // the sky and the far picture: both painted once, then only copied
    buildCSky(th, W, hy);
    c.drawImage(csk.c, 0, 0, W, hy + 2);
    buildCBg(th);
    u = TILE.far.w * V.bgS;
    for (x = -mod(R.skyX, u); x < W; x += u) c.drawImage(cbg.c, x, hy + 2 - 304 * V.bgS, u + 0.6, 304 * V.bgS);
    c.fillStyle = col.g[0][FOG_N - 1]; c.fillRect(0, hy, W, H - hy);
    c.save();
    if (R.shake > 0) c.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8);
    // every piece of road ahead, from the camera outward: where its near edge is on the screen
    x = 0; dx = -frac * T.c[bi];
    for (i = 0; i <= DRAW_N; i++) {
      si = bi + i; if (si >= n) si -= n;
      rel = (i - frac) * SEG; if (rel < 40) rel = 40;
      sc = CAM_D / rel * K;
      WX[i] = x; WY[i] = T.y[si];
      PX[i] = F.cx + (x - F.camX) * sc; PY[i] = hy - (T.y[si] - F.camY) * sc; PW[i] = RW * sc; PS[i] = sc;
      x += dx; dx += T.c[si];
    }
    // cars, jellies and the ghost go into the piece they are on
    for (i = 0; i < DRAW_N; i++) BH[i] = -1;
    bCount = 0;
    for (i = 0; i < R.racers.length; i++) { o = R.racers[i]; if (!o.dropped) bAdd(0, i, o === f ? CAM_BACK : mod(o.z - camZ, R.len)); }
    for (i = 0; i < R.haz.length; i++) bAdd(1, i, mod(R.haz[i].z - camZ, R.len));
    if (R.ghost && R.ghostZ >= 0) bAdd(2, 0, mod(R.ghostZ - camZ, R.len));
    // back to front: the ground of each piece, then what stands on it
    for (i = DRAW_N - 1; i >= 1; i--) {
      y1 = PY[i]; y2 = PY[i + 1];
      si = bi + i; if (si >= n) si -= n;
      sAbs = base + i;
      if (y2 < y1 && y2 < H) {
        lv = CLV[i]; alt = Math.floor(sAbs / 3) & 1;
        x1 = PX[i]; x2 = PX[i + 1]; w1 = PW[i]; w2 = PW[i + 1];
        c.fillStyle = col.g[alt][lv]; c.fillRect(0, y2, W, y1 - y2 + 1);
        c.fillStyle = col.m[alt][lv]; c.beginPath(); c.moveTo(x1 - w1 * 1.13, y1 + 0.6); c.lineTo(x1 + w1 * 1.13, y1 + 0.6); c.lineTo(x2 + w2 * 1.13, y2); c.lineTo(x2 - w2 * 1.13, y2); c.fill();
        c.fillStyle = col.r[alt][lv]; c.beginPath(); c.moveTo(x1 - w1, y1 + 0.6); c.lineTo(x1 + w1, y1 + 0.6); c.lineTo(x2 + w2, y2); c.lineTo(x2 - w2, y2); c.fill();
        if (i < 46 && (Math.floor(sAbs / 2) & 1)) { // lane marks
          c.fillStyle = col.l[lv]; c.beginPath();
          c.moveTo(x1 - w1 * 0.353, y1); c.lineTo(x1 - w1 * 0.313, y1); c.lineTo(x2 - w2 * 0.313, y2); c.lineTo(x2 - w2 * 0.353, y2); c.closePath();
          c.moveTo(x1 + w1 * 0.313, y1); c.lineTo(x1 + w1 * 0.353, y1); c.lineTo(x2 + w2 * 0.353, y2); c.lineTo(x2 + w2 * 0.313, y2); c.closePath();
          c.fill();
        }
        if (si === 0) cLine(c, i);
      }
      sc = PS[i];
      list = R.segObj[si];
      if (list && sc > 0.011) for (j = 0; j < list.length; j++) { // trees, houses, posts
        o = list[j]; s = o.sp; u = o.s * sc; w = s.w * u; x = PX[i] + o.x * PW[i] - s.ox * u;
        if (x > W || x + w < 0) continue;
        c.drawImage(s.c, x, PY[i] - s.oy * u, w, s.h * u);
      }
      if (si === 0) cGantry(c, i);
      lapK = Math.floor(sAbs / n) + 2;
      list = R.boltSeg[si];
      if (list) for (j = 0; j < list.length; j++) {
        p = list[j];
        if (R.boltLap[p] === lapK || !cProj((i - frac + 0.5) * SEG, R.lay.bolts[p].x)) continue;
        s = sprite('bolt'); u = 7 * F.s;
        c.drawImage(s.c, F.x - s.ox * u, F.y - (s.oy + 36 + Math.sin(R.clock * 4 + p) * 5) * u, s.w * u, s.h * u);
      }
      list = R.boxSeg[si];
      if (list && R.mode !== 'trial') for (j = 0; j < list.length; j++) {
        p = list[j];
        if (R.boxOff[p] > R.clock || !cProj((i - frac + 0.5) * SEG, R.lay.boxes[p].x)) continue;
        s = sprite('box'); u = 8.5 * F.s;
        c.drawImage(s.c, F.x - s.ox * u, F.y - (s.oy + Math.sin(R.clock * 3 + p) * 4) * u, s.w * u, s.h * u);
      }
      for (j = BH[i]; j >= 0; j = BN[j]) {
        if (BK[j] === 0) cDrawRacer(c, R, R.racers[BI[j]], BZ[j]);
        else if (BK[j] === 1) {
          o = R.haz[BI[j]];
          if (o && cProj(BZ[j], o.x)) { s = sprite('jelly'); u = 7.5 * F.s; w = 1 + 0.07 * Math.sin(R.clock * 8 + o.id); c.drawImage(s.c, F.x - s.ox * u * w, F.y - s.oy * u / w, s.w * u * w, s.h * u / w); }
        } else if (me && cProj(BZ[j], R.ghostX)) { // the ghost of my best lap: my own car, see-through
          k = CAR_WW / 120 * F.s; e = carRear(me, V.ck);
          c.globalAlpha = 0.42; c.drawImage(e.f[0], F.x - CR_OX * k, F.y - CR_OY * k, CR_W * k, CR_H * k); c.globalAlpha = 1;
          if (k > 0.3) { // its label, with the time of that lap (written once per ghost)
            if (!R.ghostTag || R.ghostTag.ms !== R.ghost.ms) {
              e = document.createElement('canvas'); q = Math.min(2, V.dpr); e.width = Math.ceil(240 * q); e.height = Math.ceil(36 * q);
              s = e.getContext('2d'); s.scale(q, q); api.label(s, '👻 ' + fmt(R.ghost.ms), 120, 34, '#FFFFFF', NAVY, 15);
              R.ghostTag = { ms: R.ghost.ms, c: e };
            }
            u = clamp(k / 1.5, 0.5, 1);
            c.drawImage(R.ghostTag.c, F.x - 120 * u, F.y - (me.topH + 6) * k - 34 * u, 240 * u, 36 * u);
          }
        }
      }
    }
    // fireworks on their way
    for (i = R.fws.length - 1; i >= 0; i--) {
      o = R.fws[i]; u = (R.clock - o.t0) / o.dur;
      if (o.to && o.to.seen >= R.nf - 1) { x1 = o.to.sx; y1 = o.to.sy - 40 * o.to.sk; k = Math.max(0.35, o.to.sk); }
      else { x1 = PX[40]; y1 = PY[40] - 30; k = 0.35; }                                // the target is out of sight: off it goes, up the road
      if (o.from.seen >= R.nf - 1 && u < 0.15) { o.x = o.from.sx; o.y = o.from.sy - 40 * o.from.sk; }
      if (!o.vis && !(o.to && o.to.seen >= R.nf - 1)) { if (u >= 1) R.fws.splice(i, 1); continue; }   // neither end is in sight
      if (u >= 1) {
        R.fws.splice(i, 1);
        if (o.to && o.to.seen >= R.nf - 1) { cPuff(R, x1, y1, 14, RAINBOW[i % 6], 1, 520, 120); cPuff(R, x1, y1, 8, '#FFE14D', 1, 380, 200); }
        continue;
      }
      a = u * u * (3 - 2 * u); x = o.x + (x1 - o.x) * a; x2 = o.y + (y1 - o.y) * a - Math.sin(u * Math.PI) * V.H * 0.16;
      s = sprite('fw'); q = (1.6 - u * 0.9) * Math.max(0.5, k);
      c.save(); c.translate(x, x2); c.rotate(Math.atan2(x1 - o.x, Math.max(40, o.y - y1)) * 0.6); c.drawImage(s.c, -s.ox * q, -s.oy * q, s.w * q, s.h * q); c.restore();
      c.fillStyle = '#FFE14D'; c.beginPath(); c.arc(x - 6 + Math.random() * 12, x2 + 26 * q, 4 * q, 0, TAU); c.fill();
    }
    // particles
    for (i = 0; i < R.parts.length; i++) {
      p = R.parts[i];
      if (p.life >= p.max) continue;
      p.life += dt; p.vy += 700 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      a = 1 - p.life / p.max; if (a <= 0) continue;
      c.globalAlpha = a;
      if (p.kind) { star(c, p.x, p.y, p.r * (0.7 + a)); c.fillStyle = p.col; c.fill(); c.lineWidth = 1.4; c.strokeStyle = NAVY; c.stroke(); }
      else { c.beginPath(); c.arc(p.x, p.y, p.r * (1.6 - a), 0, TAU); c.fillStyle = p.col; c.fill(); }
    }
    c.globalAlpha = 1;
    c.restore();
    if (me && (me.turbo > 0 || me.rush > 0 || me.mini > 0)) { // speed lines from the middle outward
      c.strokeStyle = me.rush > 0 ? RAINBOW[Math.floor(R.clock * 10) % 6] : 'rgba(255,255,255,0.75)'; c.lineWidth = 4;
      c.beginPath();
      for (i = 0; i < 12; i++) {
        a = prn(i + 3) * TAU; u = ((R.clock * (1.6 + prn(i) * 1.2) + prn(i + 7)) % 1); q = (0.25 + u * 0.6) * W;
        c.moveTo(W / 2 + Math.cos(a) * q, hy + Math.sin(a) * q * 0.6); c.lineTo(W / 2 + Math.cos(a) * (q + 60), hy + Math.sin(a) * (q + 60) * 0.6);
      }
      c.stroke();
    }
    if (me && me.storm > 0) { // rain on my screen
      c.strokeStyle = 'rgba(116,219,255,0.7)'; c.lineWidth = 3; c.beginPath();
      for (i = 0; i < 16; i++) { x = prn(i + 31) * W; u = ((R.clock * 2.2 + prn(i + 11)) % 1) * H; c.moveTo(x, u); c.lineTo(x - 8, u + 26); }
      c.stroke();
      c.fillStyle = 'rgba(40,50,90,0.16)'; c.fillRect(0, 0, W, H);
    }
    if (R.flash > 0) { c.globalAlpha = Math.min(1, R.flash * 0.9); c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
    if (R.fwHit) { // a firework is on its way to me
      u = 1.5 + 0.4 * Math.sin(R.clock * 18);
      c.beginPath(); c.arc(W / 2, H * 0.24, 30 * u, 0, TAU); c.fillStyle = 'rgba(255,79,109,0.85)'; c.fill(); c.lineWidth = 4; c.strokeStyle = NAVY; c.stroke();
      drawSprite(c, 'i_firework', W / 2, H * 0.24, u);
    }
    drawCount(c, R);
    cHud(c, R);
    cControls(c, R);
  }
  function cMap(c, R, x, y, S) { // the small map with every racer on it
    var pad = S * 0.14, in2 = S - pad * 2, T = R.T, M = R.map, g, cnv, i, r, j, me = R.me, px, py, q = V.dpr;
    if (!R.mapCv || R.mapCv.S !== S || R.mapCv.q !== q) {
      cnv = document.createElement('canvas'); cnv.width = Math.round(S * q); cnv.height = Math.round(S * q);
      g = cnv.getContext('2d'); g.scale(q, q); g.lineJoin = 'round'; g.lineCap = 'round';
      rr(g, 2, 2, S - 4, S - 4, 16); g.fillStyle = 'rgba(255,243,214,0.86)'; g.fill(); g.lineWidth = 3; g.strokeStyle = NAVY; g.stroke();
      g.beginPath();
      for (i = 0; i < T.n; i += 3) { if (i) g.lineTo(pad + M[i * 2] * in2, pad + M[i * 2 + 1] * in2); else g.moveTo(pad + M[0] * in2, pad + M[1] * in2); }
      g.closePath();
      g.lineWidth = 9; g.strokeStyle = NAVY; g.stroke(); g.lineWidth = 5; g.strokeStyle = '#FFFFFF'; g.stroke();
      g.fillStyle = NAVY; g.fillRect(pad + M[0] * in2 - 6, pad + M[1] * in2 - 2.5, 12, 5);        // the line
      R.mapCv = { c: cnv, S: S, q: q };
    }
    c.drawImage(R.mapCv.c, x, y, S, S);
    for (i = R.rank.length - 1; i >= -1; i--) { // the leader on top, my own dot last of all
      r = i < 0 ? me : R.rank[i];
      if (!r || r.dropped || (i >= 0 && r === me)) continue;
      j = segAt(T, r.z) * 2; px = x + pad + M[j] * in2; py = y + pad + M[j + 1] * in2;
      if (r === me) { c.beginPath(); c.arc(px, py, 8.5, 0, TAU); c.fillStyle = '#FFFFFF'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = NAVY; c.stroke(); }
      c.beginPath(); c.arc(px, py, r === me ? 5.5 : r.bot ? 4.2 : 5.5, 0, TAU); c.fillStyle = r.cc; c.fill(); c.lineWidth = 2; c.strokeStyle = NAVY; c.stroke();
    }
    if (R.ghost && R.ghostZ >= 0) { j = segAt(T, R.ghostZ) * 2; c.beginPath(); c.arc(x + pad + M[j] * in2, y + pad + M[j + 1] * in2, 3.5, 0, TAU); c.fillStyle = '#FFFFFF'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = NAVY; c.stroke(); }
  }
  // the words of the top row are only put together again when their number changes
  var HC = { pk: -1, p: '', n: '', lk: -1, l: '', tk: -1, t: '', bk: -1, b: '', gk: -1, g: '', hk: -1, h: '' };
  function cHud(c, R) {
    var W = V.W, sm = V.small, h = sm ? 42 : 48, y = sm ? 13 : 12, x = V.hudL + 2, me = R.me, f = R.focus || me, trial = R.mode === 'trial';
    var w, i, place = 0, ms, S = V.mapS, k;
    c.textBaseline = 'middle';
    if (trial) { // a time trial: the lap to beat
      k = R.ghost ? R.ghost.ms : 0;
      if (k !== HC.gk) { HC.gk = k; HC.g = '👻 ' + (k ? fmt(k) : '–:––'); }
      w = sm ? 112 : 132; pill(c, x, y, w, h, '#FFD66B');
      c.font = V.fMid; c.textAlign = 'center'; c.fillStyle = NAVY; c.fillText(HC.g, x + w / 2, y + h / 2 + 1);
    } else { // my place among the racers
      for (i = 0; i < R.rank.length; i++) if (R.rank[i] === f) place = i + 1;
      k = (place || 1) * 16 + R.alive;
      if (k !== HC.pk) { HC.pk = k; HC.p = ord(place || 1); HC.n = '/' + R.alive; }
      w = sm ? 92 : 108; pill(c, x, y, w, h, '#FFD66B');
      c.fillStyle = NAVY; c.font = V.fBig; c.textAlign = 'right'; c.fillText(HC.p, x + w / 2 + 10, y + h / 2 + 1);
      c.font = V.fSub; c.textAlign = 'left'; c.fillText(HC.n, x + w / 2 + 12, y + h / 2 + 4);
    }
    x += w + 6;
    k = Math.min(R.laps, (f ? f.lap : 0) + 1);                        // laps
    if (k !== HC.lk) { HC.lk = k; HC.l = '🏁 ' + k + '/' + R.laps; }
    w = sm ? 82 : 96; pill(c, x, y, w, h, '#FFFFFF');
    c.font = V.fMid; c.textAlign = 'center'; c.fillStyle = NAVY; c.fillText(HC.l, x + w / 2, y + h / 2 + 1);
    x += w + 6;
    // the clock: of the race, or of this lap in a time trial
    ms = me && me.fin ? (trial ? me.best : me.finMs) : trial && me && me.lapAt ? R.t * 1000 - me.lapAt : Math.max(0, R.t * 1000);
    k = Math.floor(ms / 100);
    if (k !== HC.tk) { HC.tk = k; HC.t = fmt(ms); }
    w = sm ? 98 : 116; pill(c, x, y, w, h, '#FFFFFF');
    c.font = V.fTime; c.fillStyle = NAVY; c.fillText(HC.t, x + w / 2, y + h / 2 + 1);
    x += w + 6;
    if (R.hurryEnd && !(me && me.fin)) { // the first player is home: the clock is running for the others
      k = Math.max(0, Math.ceil((R.hurryEnd - nowMs()) / 1000));
      if (k !== HC.hk) { HC.hk = k; HC.h = '⏱ ' + k; }
      pill(c, x, y + (h - 34) / 2, 76, 34, '#FF4F6D');
      c.font = V.f18; c.fillStyle = '#FFFFFF'; c.fillText(HC.h, x + 38, y + h / 2 + 1);
    }
    cMap(c, R, W - S - 8, 8, S);
    if (me) { // bolts: each one makes the car a little faster
      if (me.bolts !== HC.bk) { HC.bk = me.bolts; HC.b = me.bolts + '/' + BOLT_MAX; }
      pill(c, W - 100, S + 14, 92, 32, 'rgba(255,255,255,0.92)');
      drawSprite(c, 'bolt', W - 82, S + 30, 0.42);
      c.font = V.f18; c.textAlign = 'left'; c.fillStyle = NAVY; c.fillText(HC.b, W - 66, S + 31);
    }
  }
  function cArrow(c, b, dir, down) {
    var y = roundBtn(c, b, '#FFFFFF', down), r = b.r * 0.42;
    poly(c, [b.x - dir * r * 0.45, y - r, b.x - dir * r * 0.45, y + r, b.x + dir * r * 0.75, y]); c.fillStyle = NAVY; c.fill(); c.lineWidth = 5; c.lineJoin = 'round'; c.strokeStyle = NAVY; c.stroke();
  }
  function cControls(c, R) {
    var me = R.me, b, y, it, full, pulse, lvl, r, a;
    if (!me || me.fin) return;
    c.globalAlpha = 0.9;
    cArrow(c, V.cl, -1, !!(cin.l || cin.kl || cin.steer < -0.5));
    cArrow(c, V.cr, 1, !!(cin.r || cin.kr || cin.steer > 0.5));
    // Drift: hold it in a bend; the ring fills while the turbo charges (blue, then orange)
    b = V.cd; r = b.r; lvl = me.drift ? (me.charge >= DRIFT_T2 ? 2 : me.charge >= DRIFT_T1 ? 1 : 0) : -1;
    y = roundBtn(c, b, lvl === 2 ? '#FF9F43' : lvl === 1 ? '#74DBFF' : lvl === 0 ? '#E6F4FF' : '#FFFFFF', cin.drift);
    c.lineCap = 'round'; c.strokeStyle = NAVY; c.lineWidth = Math.max(4, r * 0.11);
    c.beginPath(); c.arc(b.x + r * 0.34, y + r * 0.1, r * 0.52, Math.PI * 0.95, Math.PI * 1.5); c.stroke();          // two skid marks
    c.beginPath(); c.arc(b.x + r * 0.62, y + r * 0.22, r * 0.52, Math.PI * 0.98, Math.PI * 1.45); c.stroke();
    star(c, b.x - r * 0.3, y + r * 0.02, r * 0.17); c.fillStyle = '#FFC933'; c.fill(); c.lineWidth = 2; c.stroke();
    c.font = V.fDrift; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = NAVY; c.fillText('DRIFT', b.x, y + r * 0.58);
    if (me.drift) {
      a = clamp(me.charge / DRIFT_T2, 0, 1);
      c.beginPath(); c.arc(b.x, b.y, r + 9, -Math.PI / 2, -Math.PI / 2 + TAU * a); c.lineWidth = 11; c.strokeStyle = NAVY; c.stroke(); c.lineWidth = 5.5; c.strokeStyle = lvl === 2 ? '#FF9F43' : '#5CD4FF'; c.stroke();
    }
    if (R.mode === 'trial') { c.globalAlpha = 1; return; }                // a time trial has no items
    // Item: shows what is in the box (it spins through the items for a moment first)
    b = V.ci; r = b.r;
    it = R.clock < R.roll ? ITEMS[Math.floor(R.clock * 12) % ITEMS.length] : R.item;
    full = !!R.item && R.clock >= R.roll; pulse = full ? 0.5 + 0.5 * Math.sin(R.clock * 8) : 0;
    if (full) { c.globalAlpha = 0.35 + pulse * 0.25; c.beginPath(); c.arc(b.x, b.y, r + 14 + pulse * 7, 0, TAU); c.fillStyle = '#FFD66B'; c.fill(); c.globalAlpha = 0.9; }
    y = roundBtn(c, b, full ? '#FFD66B' : '#E3EAF3', nowMs() - cin.pi < 130);
    if (it) drawSprite(c, 'i_' + it, b.x, y, r / 31);
    else { c.globalAlpha = 0.3; drawSprite(c, 'box', b.x, y + r * 0.62, r / 70); }
    c.globalAlpha = 1;
  }
  function cInfo(R) { // the card under the top row: the circuit at the start, lap times, my result at the end
    var w = lastCReward, T = CIRCS[R.ci], st = w && R.me ? 3 : !R.me ? 2 : R.clock < R.bannerEnd ? 1 : R.t < -2.6 ? 4 : 0, h = '';
    if (st === 1) { setInfo(R.banner); R.infoSt = 1; return; }
    if (st === R.infoSt) return;
    R.infoSt = st;
    if (st === 3) {
      h = R.mode === 'trial' ? '⏱ <b>' + fmt(w.lap) + '</b>' + (w.newLap ? ' · 🎉 Best lap!' : '') : '<b>' + medal(w.place) + ' ' + ord(w.place) + '</b>' + (w.dnf ? '' : ' · ⏱ ' + fmt(w.ms));
      h += ' · ' + (w.bonus ? w.base + ' + ' + w.bonus + ' = ' : '+') + w.stars + ' ⭐';
    } else if (st === 2) h = '👀 Watching · you join the next race';
    else if (st === 4) h = (R.gp ? '🏆 ' + (R.gp.i + 1) + ' / ' + R.gp.of + ' · ' : R.mode === 'trial' ? '⏱️ ' : '') + T.icon + ' ' + api.three(T);
    setInfo(h);
  }

  // ---------- touch and keys on a circuit ----------
  function cRole(x, y) { // which button is under the finger: the nearest one that is close enough
    var best = '', bd = 1e9, list = [['i', V.ci], ['d', V.cd], ['l', V.cl], ['r', V.cr]], i, b, d;
    for (i = 0; i < 4; i++) {
      b = list[i][1]; d = Math.sqrt((x - b.x) * (x - b.x) + (y - b.y) * (y - b.y));
      if (d <= b.r + 14 && d - b.r < bd) { bd = d - b.r; best = list[i][0]; }
    }
    return best;
  }
  function cSync() {
    var k;
    cin.l = cin.r = cin.d = 0;
    for (k in cin.ptr) { if (cin.ptr[k] === 'l') cin.l = 1; else if (cin.ptr[k] === 'r') cin.r = 1; else if (cin.ptr[k] === 'd') cin.d = 1; }
  }
  function cDown(e) {
    var R = CR, r, role;
    if (view !== 'circ' || !R || !R.me || R.me.fin) return;
    r = cv.getBoundingClientRect();
    e.preventDefault();
    role = cRole(e.clientX - r.left, e.clientY - r.top);
    if (role === 'i') { cin.pi = nowMs(); cUse(R); return; }
    if (!role) { // a finger on the road steers: slide it left or right
      if (cin.dragId !== null) return;
      role = 'g'; cin.dragId = e.pointerId; cin.dragX0 = e.clientX; cin.drag = 0;
    }
    cin.ptr[e.pointerId] = role;
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    cSync();
  }
  function cMove(e) {
    var role = cin.ptr[e.pointerId], r, q;
    if (!role || view !== 'circ') return;
    if (role === 'g') { cin.drag = clamp((e.clientX - cin.dragX0) / Math.max(36, V.W * 0.06), -1, 1); return; }
    if (role === 'l' || role === 'r') { // the thumb may slide from one arrow to the other
      r = cv.getBoundingClientRect(); q = cRole(e.clientX - r.left, e.clientY - r.top);
      if ((q === 'l' || q === 'r') && q !== role) { cin.ptr[e.pointerId] = q; cSync(); }
    }
  }
  function cUp(e) {
    var role = cin.ptr[e.pointerId];
    if (!role) return;
    delete cin.ptr[e.pointerId];
    if (role === 'g') { cin.dragId = null; cin.drag = 0; }
    cSync();
  }
  function cKey(e, down) { // arrows or A / D steer, Space or Shift drifts, Enter or the up arrow uses the item
    var k = (e.key || '').toLowerCase();
    if (!root || view !== 'circ' || !CR || !CR.me) return;
    if (k === 'arrowleft' || k === 'a') cin.kl = down;
    else if (k === 'arrowright' || k === 'd') cin.kr = down;
    else if (k === ' ' || k === 'shift' || k === 'arrowdown' || k === 's') cin.kd = down;
    else if (k === 'enter' || k === 'arrowup' || k === 'w' || k === 'x') { if (down && !e.repeat) { cin.pi = nowMs(); cUse(CR); } }
    else return;
    e.preventDefault();
  }
  function cLayout() { // the sizes that depend on the screen
    var w = V.W, h = V.H, m = V.small ? 10 : 18, d = clamp(h * 0.21, 84, 124);
    V.K = Math.min(w / 2, h * 0.8); V.hy = Math.round(h * 0.42); V.bgS = V.hy / 292;
    V.fBig = '700 ' + (V.small ? 24 : 28) + 'px ' + FONT; V.fSub = '600 ' + (V.small ? 15 : 17) + 'px ' + FONT; V.fMid = '700 ' + (V.small ? 19 : 22) + 'px ' + FONT;
    V.fTime = '700 ' + (V.small ? 21 : 24) + 'px ' + FONT; V.f18 = '700 18px ' + FONT; V.fDrift = '700 ' + Math.round(d * 0.15) + 'px ' + FONT;
    V.ck = CAR_WW / 120 * CAM_D / CAM_BACK * V.K;                    // screen pixels per car unit, for my own car
    V.cl = { x: m + d / 2, y: h - m - d / 2 - 8, r: d / 2 };
    V.cr = { x: m + d * 1.5 + 14, y: h - m - d / 2 - 8, r: d / 2 };
    V.cd = { x: w - m - d / 2 - 2, y: h - m - d / 2 - 8, r: d / 2 };
    V.ci = { x: w - m - d * 1.5 - 12, y: h - m - d * 0.95 - 8, r: d / 2 };
    V.mapS = Math.round(clamp(h * 0.25, 108, 176));
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
    '.race-top h2{flex:1;min-width:0;margin:0;font-size:28px;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.race-tri{font-size:17px;font-weight:600}',
    '.race-top .pill{flex:none}',
    '.race-body{flex:1;min-height:0;display:flex;gap:10px}',
    '.race-box{background:#FFF3D6;border:4px solid #1B2A49;border-radius:22px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;min-height:0}',
    '.race-h{flex:none;font-size:19px;font-weight:700;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.race-who{flex:0 0 27%;min-width:196px;max-width:330px}',
    '.race-list{flex:1;min-height:0;display:flex;flex-direction:column;gap:5px;overflow-x:hidden;overflow-y:auto;touch-action:pan-y}',
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
    '.race-set{flex:none;width:100%;height:50px;font-size:16px;padding:0 6px;border-width:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.race-set.on{background:#B8F0C0}',
    '.race-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}',
    '.race-modes{flex:none;display:flex;gap:8px;padding:0 2px}',
    '.race-mode{flex:1 1 0;min-width:0;height:54px;border:4px solid #1B2A49;border-radius:18px;background:#fff;font-size:19px;font-weight:700;color:#1B2A49;display:flex;align-items:center;justify-content:center;gap:6px;padding:0 4px;white-space:nowrap;overflow:hidden}',
    '.race-mode i{font-style:normal;font-size:23px;line-height:1}',
    '.race-mode.on{background:#FFD66B;box-shadow:0 0 0 3px #1B2A49}',
    '.race-mode:active{transform:scale(.97)}',
    '.race-tracks{flex:none;display:flex;gap:10px;padding:2px}',
    '.race-card{flex:1 1 0;min-width:0;position:relative;border:4px solid #1B2A49;border-radius:20px;background:#fff;padding:0 4px 5px;overflow:hidden;display:flex;flex-direction:column;align-items:center;font-size:14px;font-weight:600;line-height:1.2;color:#1B2A49}',
    '.race-card canvas{display:block;width:calc(100% + 8px);margin:0 -4px 3px;border-bottom:3px solid #1B2A49}',
    '.race-card.on{background:#FFD66B;box-shadow:0 0 0 4px #1B2A49}',
    '.race-card:active{transform:scale(.97)}',
    '.race-card b{font-size:18px;white-space:nowrap}',
    '.race-nm{max-width:100%;text-align:center}',
    '.race-lv{display:inline-flex;gap:2px;margin-left:6px;vertical-align:middle}',
    '.race-lv i{width:10px;height:10px;border-radius:50%;border:2px solid #1B2A49;background:#fff}',
    '.race-lv i.f{background:#FF7A45}',
    '.race-pick{position:absolute;left:6px;top:6px;display:flex;flex-wrap:wrap;gap:3px;max-width:calc(100% - 82px)}',
    '.race-pick i{width:15px;height:15px;border-radius:5px;border:2px solid #1B2A49}',
    '.race-cups{position:absolute;right:5px;top:5px;display:flex;gap:2px}',
    '.race-cup{display:inline-flex;align-items:center;justify-content:center;width:19px;height:19px;border-radius:50%;border:2px solid #1B2A49;background:#fff;color:#C4CAD4;font-style:normal;font-size:11px;line-height:1;vertical-align:middle}',
    '.race-cup.on{color:#fff}.race-cup.on.c1{background:#D9864A}.race-cup.on.c2{background:#AEB9C9}.race-cup.on.c3{background:#FFC21A}',
    '.race-no{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;border:3px solid #1B2A49;background:#FFD66B;font-style:normal;font-size:15px;font-weight:700;line-height:1}',
    '.race-next{flex:none;font-size:15px;font-weight:700;background:#fff;border:2px solid #1B2A49;border-radius:999px;padding:0 9px;white-space:nowrap}',
    '.race-bh{flex:none;display:flex;align-items:center;gap:8px}',
    '.race-bh .race-h{flex:1;min-width:0}',
    '.race-mine{position:absolute;left:6px;background:#1B2A49;color:#fff;border-radius:999px;padding:0 8px;font-size:13px;font-weight:700;line-height:1.5;white-space:nowrap}',
    '.race-low{flex:1;min-height:0;display:flex;gap:8px}',
    '.race-board{flex:1 1 0;min-width:0}',
    '.race-bb{flex:1;min-height:0;display:flex;flex-direction:column;gap:4px;overflow:hidden}',
    '.race-board ol{flex:1;min-height:0;margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:3px;overflow:hidden}',
    '.race-board li{flex:none;display:flex;align-items:center;gap:8px;font-size:17px;font-weight:600;background:#fff;border:2px solid #1B2A49;border-radius:12px;padding:0 10px;height:27px}',
    '.race-board li.me{background:#FFE9A8}',
    '.race-board li.none{background:none;border:0;font-weight:500;height:auto;padding:4px 2px;line-height:1.25}',
    '.race-board li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.race-board li em{flex:none;font-style:normal;font-weight:700}',
    '.race-two{flex:1;min-height:0;display:flex;gap:8px}',
    '.race-two>div{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:3px}',
    '.race-two li{padding:0 6px;gap:4px}',
    '.race-ch{flex:none;font-size:15px;font-weight:700;white-space:nowrap}',
    '.race-gpc{flex:none;display:flex;gap:6px}',
    '.race-gpc div{flex:1 1 0;min-width:0;background:#fff;border:2px solid #1B2A49;border-radius:14px;padding:4px 2px;text-align:center;font-size:20px;font-weight:700;line-height:1.2;white-space:nowrap}',
    '.race-gpc div.on{background:#FFE9A8;box-shadow:0 0 0 2px #1B2A49}',
    '.race-gpc .race-cup{width:28px;height:28px;font-size:15px}',
    '.race-note{font-size:15px;font-weight:600;line-height:1.3}',
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
    '.race-panel.wide{max-width:640px}',
    '.race-panel h3{margin:0;font-size:25px;text-align:center;line-height:1.1}',
    '.race-sub{font-size:15px;font-weight:600;text-align:center}',
    '.race-rl{display:flex;flex-direction:column;gap:4px}',
    '.race-rr{flex:none;display:flex;align-items:center;gap:8px;background:#fff;border:3px solid #1B2A49;border-radius:14px;padding:0 10px;font-size:18px;font-weight:600;height:40px}',
    '.race-rr.me{background:#FFE9A8}',
    '.race-rr.gone{opacity:.5}',
    '.race-pl{flex:none;width:34px;text-align:center;font-size:22px;font-weight:700}',
    '.race-rr i{flex:none;width:20px;height:20px;border-radius:7px;border:2px solid #1B2A49}',
    '.race-rr span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.race-rr em{flex:none;font-style:normal;font-weight:700}',
    '.race-rr u{flex:none;text-decoration:none;font-weight:700;min-width:58px;text-align:right}',
    '.race-rl.c8 .race-rr{height:34px;font-size:17px}',
    '.race-rl.c8 .race-pl{font-size:19px;width:30px}',
    '.race-sum{text-align:center;font-size:20px;font-weight:700;line-height:1.25}',
    '.race-pod{display:block;width:100%;max-width:520px;align-self:center;flex:none}',
    '.race-panel .btn{flex:none;align-self:center;min-width:210px}',
    '@media (max-width:900px),(max-height:560px){' +
      '.race-back{height:48px;font-size:16px;padding:0 12px;border-width:3px}.race-top{height:48px;padding-left:138px}.race-top h2{font-size:22px}.race-tri{font-size:14px}' +
      '.race-top .pill{height:44px;font-size:20px}.race-h{font-size:17px}.race-row{height:46px;gap:4px;padding:0 5px 0 2px}.race-row canvas{width:58px;height:32px}.race-row b{font-size:16px}.race-row .race-v{display:none}.race-ok{width:28px;height:28px;font-size:15px}' +
      '.race-lobby{gap:6px;padding:8px}.race-body{gap:8px}.race-main{gap:6px}.race-mode{height:48px;font-size:15px;border-width:3px;border-radius:15px;gap:3px}.race-mode i{font-size:18px}' +
      '.race-set{height:48px;font-size:14px}.race-bots{font-size:14px;min-height:17px}.race-who{min-width:188px}.race-tracks{gap:7px}' +
      '.race-card{font-size:12px;border-radius:16px;border-width:3px}.race-card b{font-size:14px}.race-board li{font-size:14px;height:24px}.race-ch{font-size:13px}' +
      '.race-pay{font-size:13.5px}.race-pay span{padding:0 6px}.race-today{font-size:13.5px}.race-ready{height:58px;font-size:24px}.race-box{padding:6px 8px;border-radius:18px;gap:4px}' +
      '.race-gpc div{font-size:17px}.race-note{font-size:13px}.race-no{width:23px;height:23px;font-size:13px}' +
      '.race-info{top:62px;font-size:15px;border-width:3px;padding:4px 12px}.race-info b{font-size:17px}' +
      '.race-panel{padding:8px 12px;border-radius:22px;gap:5px}.race-panel h3{font-size:21px}.race-rr{height:35px;font-size:16px}.race-sum{font-size:16px}.race-panel .btn{height:50px}' +
      '.race-panel.wide{max-width:740px}.race-pod{max-width:330px}.race-rl.c8{display:grid;grid-template-rows:repeat(4,auto);grid-auto-flow:column;grid-auto-columns:1fr;gap:4px 8px}.race-rl.c8 .race-rr{height:32px;font-size:15px;padding:0 7px;gap:5px}.race-rl.c8 .race-rr u{min-width:44px}}',
    '@media (min-height:700px) and (min-width:1100px){.race-card{font-size:16px}.race-card b{font-size:21px}.race-board li{font-size:20px;height:36px}.race-h{font-size:22px}' +
      '.race-row{height:66px}.race-row canvas{width:104px;height:58px}.race-row b{font-size:21px}.race-pay{font-size:19px}.race-today{font-size:19px}.race-ready{height:84px;font-size:34px}' +
      '.race-mode{height:64px;font-size:23px}.race-mode i{font-size:28px}.race-set{height:56px;font-size:19px}.race-ch{font-size:18px}.race-gpc div{font-size:24px}.race-note{font-size:18px}.race-bots{font-size:18px}}'
  ].join('\n');

  var CT = [];                                                        // the circuits, built once
  function circ(ci) { return CT[ci] || (CT[ci] = buildCircuit(ci)); }
  function myCar() { var p = api.self(); return (p && p.car) || (Car ? Car.defaults() : null); }
  function drawThumb(canvas, ti) { // a little picture of a Sprint track for its card
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
  function drawCThumb(canvas, ci) { // a circuit's card: its far picture, the loop from above, and my car from behind
    var g = canvas.getContext('2d'), w = canvas.width, h = canvas.height, th = CTH[CIRC[ci].scn], T = circ(ci), pts = mapOfCircuit(T), p = api.self();
    var i, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, s, k = h * 0.6 / 304, ox, oy;
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
    g.fillStyle = lin(g, 0, 0, 0, h * 0.6, th.sky[0], th.sky[1]); g.fillRect(0, 0, w, h);
    g.save(); g.translate(0, h * 0.6 - 334 * k); g.scale(k, k); cBack(th).back(g, w / k, 1); cBack(th).far(g, TILE.far.w); g.restore();
    g.fillStyle = th.grass[0]; g.fillRect(0, h * 0.6, w, h * 0.4);
    g.fillStyle = th.grass[1]; g.fillRect(0, h * 0.6, w, 4);
    for (i = 0; i < T.n; i++) { minx = Math.min(minx, pts[i][0]); maxx = Math.max(maxx, pts[i][0]); miny = Math.min(miny, pts[i][1]); maxy = Math.max(maxy, pts[i][1]); }
    s = Math.min(w * 0.56 / (maxx - minx), h * 0.8 / (maxy - miny)); ox = w * 0.64 - (minx + maxx) / 2 * s; oy = h * 0.5 - (miny + maxy) / 2 * s;
    g.beginPath();
    for (i = 0; i < T.n; i += 3) { if (i) g.lineTo(ox + pts[i][0] * s, oy + pts[i][1] * s); else g.moveTo(ox + pts[0][0] * s, oy + pts[0][1] * s); }
    g.closePath();
    g.lineWidth = 17; g.strokeStyle = NAVY; g.stroke(); g.lineWidth = 10; g.strokeStyle = th.road[0]; g.stroke();
    g.lineWidth = 2; g.strokeStyle = '#FFFFFF'; g.setLineDash([7, 7]); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#FFFFFF'; g.fillRect(ox + pts[0][0] * s - 9, oy + pts[0][1] * s - 3, 18, 6); g.lineWidth = 2; g.strokeStyle = NAVY; g.strokeRect(ox + pts[0][0] * s - 9, oy + pts[0][1] * s - 3, 18, 6);
    g.translate(w * 0.17, h * 0.93); g.scale(h / 205, h / 205);
    try { rearCar(g, myCar(), 0, p ? p.color : '#FF7A45'); } catch (e) { if (window.console) console.error(e); }
    g.restore();
  }
  function buildCards(kind) { // the cards to pick from: the 3 Sprint tracks, or the 4 circuits
    var list = kind === 's' ? TRACKS : CIRCS;
    ui.tracks.innerHTML = ''; ui.cards = []; ui.cardKind = kind;
    list.forEach(function (T, i) {
      var b = el('button', 'race-card'), c = document.createElement('canvas'), dots = '', n;
      b.type = 'button'; b.setAttribute('data-quiet', ''); b.setAttribute('aria-label', T.en);
      c.width = 360; c.height = 168; b.appendChild(c);
      for (n = 0; n < 3; n++) dots += '<i' + (n < T.dots ? ' class="f"' : '') + '></i>';
      b.appendChild(el('div', 'race-pick')); b.appendChild(el('div', 'race-cups')); b.appendChild(el('div', 'race-mine'));
      b.appendChild(el('b', '', T.icon + ' ' + esc(T.en) + '<span class="race-lv" title="How hard">' + dots + '</span>'));
      b.appendChild(el('span', 'race-nm', esc(T.zh) + ' <span class="py">' + esc(T.py) + '</span>'));
      b.appendChild(el('span', 'race-nm', esc(T.ms)));
      b.addEventListener('click', function () {
        if (lobby && lobby.mode === 'gp') { sfx('deny'); api.toast('A Grand Prix drives all four circuits, one after the other.'); return; }
        sfx('tap');
        try { localStorage.setItem(kind === 's' ? 'ft_race_track' : 'ft_race_circ', String(i)); } catch (e) {}
        api.send(kind === 's' ? { t: 'race.vote', track: i } : { t: 'race.pick', c: i });
      });
      ui.tracks.appendChild(b);
      ui.cards.push({ b: b, cv: c, pick: b.querySelector('.race-pick'), cups: b.querySelector('.race-cups'), mine: b.querySelector('.race-mine') });
    });
    drawThumbs();
  }
  function buildLobby() {
    lob = el('div', 'race-lobby',
      '<div class="race-top"><h2>🏁 Race Track <span class="race-tri">赛车场 <span class="py">sàichēchǎng</span> · Litar Lumba</span></h2>' +
      '<div class="pill dark" title="Stars you can spend"><span class="ico">⭐</span><span class="race-coins">0</span></div></div>' +
      '<div class="race-body"><div class="race-box race-who"><div class="race-h">Racers</div><div class="race-list"></div><div class="race-bots"></div>' +
      '<button type="button" class="btn race-set race-botlv" data-quiet></button><button type="button" class="btn race-set race-easy" data-quiet></button></div>' +
      '<div class="race-main"><div class="race-modes"></div><div class="race-tracks"></div><div class="race-low"><div class="race-box race-board"><div class="race-bh"><div class="race-h"></div><div class="race-next"></div></div><div class="race-bb"></div></div>' +
      '<div class="race-go"><div class="race-pay"></div><div class="race-today"></div><button type="button" class="btn primary race-ready" data-quiet>🏁 Ready!</button></div></div></div></div>');
    ui.coins = lob.querySelector('.race-coins'); ui.list = lob.querySelector('.race-list'); ui.bots = lob.querySelector('.race-bots');
    ui.botlv = lob.querySelector('.race-botlv'); ui.easy = lob.querySelector('.race-easy'); ui.modes = lob.querySelector('.race-modes');
    ui.tracks = lob.querySelector('.race-tracks'); ui.boardH = lob.querySelector('.race-board .race-h'); ui.next = lob.querySelector('.race-next'); ui.bb = lob.querySelector('.race-bb');
    ui.pay = lob.querySelector('.race-pay'); ui.today = lob.querySelector('.race-today'); ui.ready = lob.querySelector('.race-ready');
    ui.cards = []; ui.cardKind = ''; ui.modeBtns = [];
    MODES.forEach(function (M) {
      var b = el('button', 'race-mode', '<i>' + M.icon + '</i>' + esc(M.en));
      b.type = 'button'; b.setAttribute('data-quiet', ''); b.title = M.en + ' · ' + M.zh + ' ' + M.py + ' · ' + M.ms;
      b.addEventListener('click', function () { sfx('tap'); api.send({ t: 'race.mode', mode: M.id }); });
      ui.modes.appendChild(b); ui.modeBtns.push(b);
    });
    ui.botlv.addEventListener('click', function () { sfx('tap'); api.send({ t: 'race.bots', lv: (((lobby && lobby.bots) | 0) + 1) % 3 }); });
    ui.easy.addEventListener('click', function () { sfx('tap'); api.send({ t: 'race.opt', easy: !(lobby && lobby.easy !== false) }); });
    ui.ready.addEventListener('click', function () {
      var me = meInLobby();
      if (lobby && lobby.phase !== 'lobby') { sfx('deny'); return; }
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
  function lines(list, max) { // lines of a best-times board
    var html = '', i;
    list = list || [];
    for (i = 0; i < list.length && i < max; i++) html += '<li' + (list[i].me ? ' class="me"' : '') + '><em>' + medal(i + 1) + '</em><span>' + esc(list[i].name) + '</span><em>' + fmt(list[i].ms) + '</em></li>';
    return html;
  }
  function gpCup(level) { return '<i class="race-cup c' + (level || 1) + (level ? ' on' : '') + '">' + (level ? '🏆' : '–') + '</i>'; }
  function renderLobby() {
    var L = lobby, me, sel, i, w, row, c, g, T, list, html, half, n, st, waiting = 0, dpr = Math.min(2, window.devicePixelRatio || 1), mode, kind, key, cb, pay;
    if (!root || !lob || !L) return;
    me = meInLobby(); st = api.me();
    mode = L.mode === 'race' || L.mode === 'gp' || L.mode === 'trial' ? L.mode : 'sprint'; kind = mode === 'sprint' ? 's' : 'c';
    key = kind === 's' ? 'vote' : 'pick';
    ui.coins.textContent = st ? st.coins : '0';
    for (i = 0; i < ui.modeBtns.length; i++) ui.modeBtns[i].className = 'race-mode' + (MODES[i].id === mode ? ' on' : '');
    if (ui.cardKind !== kind) buildCards(kind);
    // who is here
    ui.list.innerHTML = ''; ui.list.className = 'race-list' + (L.who.length > 4 ? ' many' : '');
    for (i = 0; i < L.who.length; i++) {
      w = L.who[i]; if (!w.ready) waiting++;
      row = el('div', 'race-row' + (me && w.id === me.id ? ' me' : ''));
      c = document.createElement('canvas'); c.width = Math.round(104 * dpr); c.height = Math.round(58 * dpr);
      g = c.getContext('2d'); g.scale(c.width / 104, c.height / 58);
      if (Car) Car.draw(g, 52, 53, w.car || Car.defaults(), { scale: 0.7, facing: 1, t: 0.5, moving: false, driver: w.color });
      row.appendChild(c);
      row.appendChild(el('b', '', esc(w.name)));
      T = kind === 's' ? TRACKS[w.vote] : mode === 'gp' ? null : CIRCS[w.pick];
      if (T) row.appendChild(el('span', 'race-v', T.icon));
      row.appendChild(el('span', 'race-ok' + (w.ready ? ' on' : ''), w.ready ? '✔' : '…'));
      ui.list.appendChild(row);
    }
    n = mode === 'trial' ? 0 : Math.max(0, (kind === 's' ? (L.grid || 4) : (L.cgrid || 8)) - L.who.length);
    ui.bots.innerHTML = n ? '🤖 × ' + n + ' robot car' + (n > 1 ? 's' : '') + ' will join' : mode === 'trial' ? '⏱️ No robots, no items' : '';
    w = BOT_LV[(L.bots | 0) % 3];
    ui.botlv.style.display = mode === 'race' || mode === 'gp' ? '' : 'none';
    ui.botlv.innerHTML = '🤖 Robots: ' + w.icon + ' ' + w.en;
    ui.easy.style.display = kind === 'c' ? '' : 'none';
    ui.easy.className = 'btn race-set race-easy' + (L.easy !== false ? ' on' : '');
    ui.easy.innerHTML = '🛟 Easy steering: ' + (L.easy !== false ? 'ON' : 'off');
    // the tracks, with everybody's pick
    sel = me && me[key] >= 0 ? me[key] : ((kind === 's' ? L.cur : L.ccur) | 0);
    for (i = 0; i < ui.cards.length; i++) {
      c = ui.cards[i]; html = '';
      c.b.className = 'race-card' + (mode !== 'gp' && me && me[key] === i ? ' on' : '');
      if (mode !== 'gp') for (n = 0; n < L.who.length; n++) if (L.who[n][key] === i) html += '<i style="background:' + esc(L.who[n].color) + '"></i>';
      c.pick.innerHTML = html;
      html = '';
      if (kind === 's') { w = (L.cups && L.cups[TRACKS[i].id]) | 0; for (n = 0; n < 3; n++) html += badge(n + 1, w > n); w = L.best && L.best[TRACKS[i].id]; }
      else { if (mode === 'gp') html = '<i class="race-no">' + (((L.gpOrder || [0, 1, 2, 3]).indexOf(i)) + 1) + '</i>'; cb = L.cbest && L.cbest[CIRCS[i].id]; w = cb && (mode === 'trial' ? cb.lap : cb.race || cb.lap); }
      c.cups.innerHTML = html;
      c.mine.textContent = w > 0 ? '⏱ ' + fmt(w) : ''; c.mine.style.display = w > 0 ? '' : 'none';
      c.mine.style.top = Math.max(0, c.cv.offsetHeight - 26) + 'px';
    }
    // the board: the family's best times, or the Grand Prix cups
    ui.next.style.display = 'none';
    if (kind === 's') {
      T = TRACKS[sel] || TRACKS[0]; list = (L.board && L.board[T.id]) || [];
      ui.boardH.innerHTML = '🏆 ' + T.icon + ' ' + esc(T.en);
      w = (L.cups && L.cups[T.id]) | 0; n = L.goals && L.goals[T.id];
      if (n) { ui.next.style.display = ''; ui.next.innerHTML = w >= 3 ? badge(3, true) + ' ✔' : badge(w + 1, true) + ' ' + fmt(n[w]); }   // the time to beat for the next badge
      ui.bb.innerHTML = '<ol>' + (lines(list, 5) || '<li class="none">No times yet. Be the first on the board!</li>') + '</ol>';
    } else if (mode === 'gp') {
      ui.boardH.innerHTML = '🏆 Grand Prix · 大奖赛 <span class="py">dàjiǎngsài</span>';
      w = L.gp || {}; html = '<div class="race-gpc">';
      for (i = 0; i < 3; i++) html += '<div' + (i === (L.bots | 0) ? ' class="on"' : '') + '>' + BOT_LV[i].icon + ' ' + gpCup(w.cup && w.cup[i] | 0) + '</div>';
      html += '</div><div class="race-note">4 races · points: ' + (L.gpPts || []).join(' · ') + '</div>' +
        '<div class="race-note">' + (w.n ? 'Played: ' + w.n + ' · Won: ' + (w.wins | 0) : 'Win a cup with each kind of robot!') + '</div>';
      ui.bb.innerHTML = html;
    } else {
      T = CIRCS[sel] || CIRCS[0]; cb = (L.cboard && L.cboard[T.id]) || {};
      ui.boardH.innerHTML = '🏆 ' + T.icon + ' ' + esc(T.en);
      w = L.ghost && L.ghost[T.id];
      if (mode === 'trial' && w > 0) { ui.next.style.display = ''; ui.next.innerHTML = '👻 ' + fmt(w); }
      ui.bb.innerHTML = '<div class="race-two"><div><div class="race-ch">⏱ Best lap</div><ol>' + (lines(cb.lap, 3) || '<li class="none">–</li>') + '</ol></div>' +
        '<div><div class="race-ch">🏁 Best race</div><ol>' + (lines(cb.race, 3) || '<li class="none">–</li>') + '</ol></div></div>';
    }
    // what a race pays, and the Ready button
    half = L.n >= L.cap; html = '';
    function stars(v) { return half ? Math.ceil(v / 2) : v; }
    if (kind === 's') { pay = L.pay || []; for (i = 0; i < pay.length; i++) html += '<span>' + (i < 3 ? medal(i + 1) : ord(i + 1)) + ' ' + stars(pay[i]) + ' ⭐</span>'; }
    else if (mode === 'trial') { pay = L.trialPay || [4, 2]; html = '<span>🏁 ' + stars(pay[0]) + ' ⭐</span><span>🎉 Best lap: ' + stars(pay[0] + pay[1]) + ' ⭐</span>'; }
    else {
      pay = L.cpay || [];
      for (i = 0; i < 3 && i < pay.length; i++) html += '<span>' + medal(i + 1) + ' ' + stars(pay[i]) + ' ⭐</span>';
      if (pay.length > 4) html += '<span>4th–' + pay.length + 'th: ' + stars(pay[3]) + '…' + stars(pay[pay.length - 1]) + ' ⭐</span>';
      if (mode === 'gp' && L.gpBonus) html += '<span>🏆 +' + L.gpBonus.map(stars).join(' +') + ' ⭐</span>';
    }
    ui.pay.innerHTML = html;
    if (L.phase !== 'lobby') ui.today.textContent = 'A race is on. You are in the next one!';
    else if (me && me.ready && waiting) ui.today.textContent = 'Waiting for the others…';
    else if (!L.n) ui.today.innerHTML = '🎁 First race today: <b>+' + L.bonus + ' ⭐</b>';
    else if (half) ui.today.textContent = L.cap + ' races done today: half stars until tomorrow';
    else ui.today.textContent = 'Races today: ' + L.n + ' / ' + L.cap;
    ui.ready.className = 'btn primary race-ready' + (me && me.ready ? ' on' : '');
    ui.ready.innerHTML = L.phase !== 'lobby' ? '⏳ Racing…' : me && me.ready ? '✔ Ready!' : '🏁 Ready!';
    // the first time in (and again after a reconnect, when the server has forgotten): pick the track from last time
    if (me && me[key] < 0 && autoVoted !== me.id + kind && L.phase === 'lobby' && mode !== 'gp') {
      autoVoted = me.id + kind; n = -1;
      try { n = parseInt(localStorage.getItem(kind === 's' ? 'ft_race_track' : 'ft_race_circ'), 10); } catch (e) {}
      if (!(n >= 0)) n = (kind === 's' ? L.cur : L.ccur) | 0;
      api.send(kind === 's' ? { t: 'race.vote', track: clamp(n, 0, TRACKS.length - 1) } : { t: 'race.pick', c: clamp(n, 0, CIRCS.length - 1) });
    }
  }
  function drawThumbs() {
    if (!ui.cards) return;
    ui.cards.forEach(function (c, i) { try { if (ui.cardKind === 's') drawThumb(c.cv, i); else drawCThumb(c.cv, i); } catch (e) { if (window.console) console.error(e); } });
  }

  // =====================================================================================================
  // Results
  // =====================================================================================================
  var resTimer = 0;
  function closeRes() {
    if (resTimer) { clearInterval(resTimer); resTimer = 0; }
    if (res) { res.hidden = true; res.innerHTML = ''; }
  }
  function showResults(m) { // after a Sprint
    var T = TRACKS[m.track] || TRACKS[0], my = api.myId(), w = lastReward, h, i, r, btn;
    closeRes();
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
    btn.addEventListener('click', closeRes);
    res.hidden = false;
    if (w && !w.dnf) sfx(w.place === 1 ? 'goal' : w.newBest ? 'quest' : 'right');
  }
  function drawPodium(canvas, table) { // the three best of a Grand Prix on their steps, each in their own car
    var g = canvas.getContext('2d'), W = 520, H = 166, q = canvas.width / W, order = [1, 0, 2], hs = [50, 70, 36], cols = ['#C9D2DE', '#FFD66B', '#E7A56B'], i, s, x, top;
    g.setTransform(q, 0, 0, q, 0, 0); g.clearRect(0, 0, W, H); g.lineJoin = 'round'; g.lineCap = 'round';
    for (i = 0; i < 3; i++) {
      s = table[order[i]]; x = 100 + i * 160; top = H - 6 - hs[i];
      rr(g, x - 72, top, 144, hs[i] + 12, 10); g.fillStyle = lin(g, 0, top, 0, H, cols[i], shade(cols[i], -0.18)); g.fill(); g.lineWidth = 3.5; g.strokeStyle = NAVY; g.stroke();
      g.fillStyle = NAVY; g.font = '700 26px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(order[i] + 1), x, top + hs[i] * 0.55 + 4);
      if (!s) continue;
      if (Car) Car.draw(g, x, top, s.car || Car.defaults(), { scale: 0.56, facing: 1, t: 0.5, moving: false, driver: s.bot ? '#AEB6C4' : s.pcol });
      api.label(g, (s.bot ? '🤖 ' : '') + s.name, x, top - 52, '#FFFFFF', NAVY, 14);
    }
  }
  function showCResults(m) { // after a race on a circuit: the order, or the Grand Prix table
    var T = CIRCS[m.c] || CIRCS[0], my = api.myId(), w = m.late ? null : lastCReward, gp = m.gp, G = gp && gp.final ? lastGp : null, h, i, r, btn, cv2, rows, left, N;
    closeRes();
    h = '<h3>' + (gp ? '🏆 Grand Prix · ' + (gp.i + 1) + ' / ' + gp.of : m.mode === 'trial' ? '⏱️ Time Trial' : '🏁 Race') + (gp && gp.final ? ' · 🎉' : '') + '</h3>' +
      '<div class="race-sub">' + T.icon + ' ' + api.three(T) + '</div>';
    if (gp && gp.final) h += '<canvas class="race-pod" width="1040" height="332"></canvas>';
    rows = gp ? gp.table : m.results;
    h += '<div class="race-rl' + (rows.length > 5 ? ' c8' : '') + '">';
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      h += '<div class="race-rr' + (!r.bot && r.pid === my ? ' me' : '') + (r.gone ? ' gone' : '') + '"><div class="race-pl">' + medal(gp ? r.rank : r.place) + '</div><i style="background:' + esc(r.color) + '"></i><span>' + (r.bot ? '🤖 ' : '') + esc(r.name) + '</span>';
      if (gp) h += '<em>' + (r.add ? '+' + r.add : '') + '</em><u>' + r.pts + ' pt</u>';
      else if (m.mode === 'trial') h += '<em>' + (r.lap ? fmt(r.lap) : '—') + '</em><u>' + (r.stars ? '+' + r.stars + ' ⭐' : '') + '</u>';
      else h += '<em>' + (r.ms ? fmt(r.ms) : '—') + '</em><u>' + (!r.bot && r.stars ? '+' + r.stars + ' ⭐' : '') + '</u>';
      h += '</div>';
    }
    h += '</div>';
    if (w || G) {
      h += '<div class="race-sum">';
      if (w) {
        h += (gp ? ord(w.place) + ' in this race: ' : m.mode === 'trial' ? 'Best lap ' + fmt(w.lap) + ': ' : '') + (w.bonus ? w.base + ' + ' + w.bonus + ' = ' + w.stars + ' ⭐ <span style="font-weight:600">(🎁 first race today)</span>' : (gp || m.mode === 'trial' ? '+' : 'You get ') + w.stars + ' ⭐') +
          (w.half ? '<br><span style="font-weight:600;font-size:.85em">Half stars: ' + w.cap + ' races done today</span>' : '') +
          (w.newLap || w.newRace ? '<br>🎉 ' + (w.newLap ? 'New best lap: ' + fmt(w.lap) : '') + (w.newLap && w.newRace ? ' · ' : '') + (w.newRace ? 'New best race: ' + fmt(w.ms) : '') : '');
      }
      if (G) {
        h += (w ? '<br>' : '') + '🏆 Grand Prix: ' + ord(G.rank) + ' · ' + G.pts + ' pt' + (G.bonus ? ' · +' + G.bonus + ' ⭐' : '') +
          (G.newCup ? ' · ' + gpCup(G.medal) + ' new ' + BADGE_NAMES[G.medal - 1].toLowerCase() + ' cup (' + BOT_LV[G.lv | 0].icon + ')!' : '');
      }
      h += '</div>';
    }
    N = gp && !gp.final;
    res.innerHTML = '<div class="race-panel' + (rows.length > 5 ? ' wide' : '') + '" role="dialog" aria-label="Race results">' + h + '<button type="button" class="btn primary" data-quiet>' + (N ? 'Next race ▶' : 'OK') + '</button></div>';
    btn = res.querySelector('.btn');
    if (N) { // the next race starts when everyone has tapped, or when the clock runs out
      left = Math.ceil((+gp.wait || 0) / 1000);
      btn.innerHTML = 'Next race ▶ ' + left;
      btn.addEventListener('click', function () { sfx('open'); btn.disabled = true; btn.innerHTML = '✔ Ready… ' + left; api.send({ t: 'race.ready', on: true }); });
      resTimer = setInterval(function () { left = Math.max(0, left - 1); if (btn) btn.innerHTML = (btn.disabled ? '✔ Ready… ' : 'Next race ▶ ') + left; }, 1000);
    } else btn.addEventListener('click', function () { sfx('tap'); closeRes(); });
    cv2 = res.querySelector('.race-pod');
    if (cv2) { try { drawPodium(cv2, gp.table); } catch (e) { if (window.console) console.error(e); } }
    res.hidden = false;
    if (G && G.rank <= 3) sfx('levelup'); else if (w && !w.dnf) sfx(w.place === 1 ? 'goal' : (w.newLap || w.newRace) ? 'quest' : 'right');
  }

  function layoutAll() {
    var q;
    layout(); cLayout();
    if (view === 'circ' && cv) { // a circuit paints the whole picture every frame: on a very sharp screen it is drawn a little coarser, so old tablets keep up
      q = Math.sqrt(1600000 / Math.max(1, V.W * V.H));
      if (q < V.dpr) { V.dpr = Math.max(1, q); cv.width = Math.round(V.W * V.dpr); cv.height = Math.round(V.H * V.dpr); }
    }
    if (CR) CR.mapCv = null;
  }
  function setView(v) {
    view = v;
    if (!root) return;
    lob.hidden = v !== 'lobby'; cv.style.display = v === 'lobby' ? 'none' : 'block';
    drag = null;
    if (v === 'race') {
      if (craf) { cancelAnimationFrame(craf); craf = 0; }
      CR = null; layoutAll(); last = nowMs();
      if (!raf) raf = requestAnimationFrame(frame);
    } else if (v === 'circ') {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      race = null; layoutAll(); clast = nowMs();
      if (!craf) craf = requestAnimationFrame(cframe);
    } else {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (craf) { cancelAnimationFrame(craf); craf = 0; }
      race = null; CR = null; setInfo('');
      renderLobby();
    }
  }

  // =====================================================================================================
  // Messages, opening and closing
  // =====================================================================================================
  function onMessage(m) {
    var R = race, Q = CR, r, i;
    if (!root) return;
    switch (m.t) {
      case 'race.lobby':
        if (!Array.isArray(m.who)) return;
        lobby = m;
        if (Q) Q.easy = m.easy !== false;
        if (m.phase === 'lobby' && view !== 'lobby') setView('lobby'); else renderLobby();
        break;
      // ---- Sprint ----
      case 'race.count':
        if (!Array.isArray(m.racers)) return;
        closeRes();
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
      // ---- circuits ----
      case 'race.ghost':
        if (Array.isArray(m.d)) myGhost = { c: m.c | 0, ms: +m.ms || 0, d: m.d };
        break;
      case 'race.cstart':
        if (!Array.isArray(m.racers)) return;
        closeRes();
        cStart(m, Math.max(0, +m.in || 0), false);
        break;
      case 'race.cwatch':
        if (!Array.isArray(m.racers)) return;
        cStart(m, -(+m.e || 0), true);
        Q = CR;
        if (Array.isArray(m.pos)) for (i = 0; i < m.pos.length; i++) { r = Q.byId[m.pos[i][0]]; if (r) { r.z = r.tz = +m.pos[i][1] || 0; r.x = r.tx = (+m.pos[i][2] || 0) / 100; r.f = m.pos[i][3] | 0; } }
        if (m.lapOf) for (i = 0; i < Q.racers.length; i++) Q.racers[i].lap = m.lapOf[Q.racers[i].rid] | 0;
        if (Array.isArray(m.done)) for (i = 0; i < m.done.length; i++) { r = Q.byId[m.done[i].rid]; if (r) { r.done = true; r.place = m.done[i].place; r.ms = m.done[i].ms; } }
        if (Array.isArray(m.haz)) for (i = 0; i < m.haz.length; i++) Q.haz.push({ id: m.haz[i].id, z: +m.haz[i].z || 0, x: +m.haz[i].x || 0, born: -1 });
        if (m.hurry > 0) Q.hurryEnd = nowMs() + m.hurry;
        Q.rank.sort(cRankCmp);
        break;
      case 'race.cpos': cOnPos(m); break;
      case 'race.clap':
        r = Q && Q.byId[m.rid];
        if (r) {
          r.lap = Math.max(r.lap, m.n | 0);
          if (r === Q.me && m.rec && m.n < Q.laps) cSay(Q, '🎉 Best lap! ⏱ ' + fmt(m.lap) + (m.ghost ? ' · 👻' : ''), 2.6);
        }
        break;
      case 'race.cdone':
        r = Q && Q.byId[m.rid];
        if (r) { r.done = true; r.place = m.place; r.ms = m.ms; r.f = 0; r.lap = Q.laps; r.pv = Math.max(r.pv, CV0 * 0.6); Q.rank.sort(cRankCmp); }
        break;
      case 'race.cdrop':
        r = Q && Q.byId[m.rid];
        if (r) { r.dropped = true; Q.rank.sort(cRankCmp); }
        break;
      case 'race.churry': if (Q) Q.hurryEnd = nowMs() + (+m.left || 0); break;
      case 'race.item': // what was in the box: it shows once the wheel has stopped spinning
        if (Q && Q.me && !Q.me.fin && ITEM_NAMES[m.k]) { Q.item = m.k; Q.sayItem = true; }
        break;
      case 'race.box': if (Q && m.i >= 0 && m.i < Q.boxOff.length) Q.boxOff[m.i] = Q.clock + (+m.off || 1500) / 1000; break;
      case 'race.fx': cFx(m); break;
      case 'race.hazoff':
        if (Q) for (i = Q.haz.length - 1; i >= 0; i--) if (Q.haz[i].id === m.id) Q.haz.splice(i, 1);
        break;
      case 'race.creward': lastCReward = m; break;
      case 'race.gpreward': lastGp = m; break;
      case 'race.cend':
        if (Array.isArray(m.results) && (!m.gp || Array.isArray(m.gp.table))) showCResults(m);
        break;
    }
  }
  function onKeyUp(e) { cKey(e, 0); }
  function onKeyDown(e) { onKey(e); cKey(e, 1); }
  function onBlur() { cin.kl = cin.kr = cin.kd = 0; }
  function close() {
    if (!root) return;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (craf) { cancelAnimationFrame(craf); craf = 0; }
    if (resTimer) { clearInterval(resTimer); resTimer = 0; }
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    if (root.parentNode) root.parentNode.removeChild(root);
    root = cv = ctx = lob = info = res = back = null; ui = {};
    race = null; CR = null; lobby = null; tiles = null; cbg = null; csk = null; drag = null; lastReward = null; lastCReward = null; lastGp = null; infoHtml = ''; view = 'lobby';
    cin.ptr = {}; cin.l = cin.r = cin.d = cin.kl = cin.kr = cin.kd = 0; cin.drag = 0; cin.dragId = null;
    sfx('close');
    api.leave();
  }
  function onResize() {
    if (!root) return;
    layoutAll();
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
    cv.addEventListener('pointerdown', cDown); cv.addEventListener('pointermove', cMove);
    cv.addEventListener('pointerup', cUp); cv.addEventListener('pointercancel', cUp);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    view = 'lobby'; lobby = null; race = null; CR = null; autoVoted = 0; lastReward = null; lastCReward = null; lastGp = null; infoHtml = '';
    layoutAll();
    api.enter('race');
  }

  window.FTGames = window.FTGames || {};
  window.FTGames.race = {
    init: function (a) { api = a; },
    open: open,
    onMessage: onMessage,
    onMe: function () { if (root && view === 'lobby') { var st = api.me(); if (st && ui.coins) ui.coins.textContent = st.coins; } },
    // for tests: these must give the same as the server's copies; stats() tells how long a circuit frame takes to draw
    makeTrack: makeTrack, buildCircuit: buildCircuit, layoutCircuit: layoutCircuit, mapOfCircuit: mapOfCircuit,
    stats: function () {
      var me = CR && CR.me, o = { frames: cstat.n, drawMs: cstat.ms, secs: (nowMs() - cstat.t0) / 1000, view: view };
      if (me) { o.z = me.z; o.x = me.x; o.v = me.v; o.lap = me.lap; o.bolts = me.bolts; o.item = CR.item; o.drift = me.drift; o.charge = me.charge; o.fin = me.fin; o.t = CR.t; o.curve = CR.T.c[segAt(CR.T, me.z)]; o.spin = me.spin > 0; o.storm = me.storm > 0; o.off = me.off; }
      return o;
    }
  };
})();
