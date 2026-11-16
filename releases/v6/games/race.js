// Race Track (server): racing with the cars designed in the Car Garage.
// Four ways to play, chosen in the lobby:
//   race    one race of 3 laps on a circuit, seen from behind the car: 8 racers, item boxes, drifting
//   gp      a Grand Prix: the 4 circuits in a row, points per place, a table between the races, a podium at the end
//   trial   a time trial: no robots, no items, each player against the ghost of their own best lap
//   sprint  the first game of the Race Track: a side-view dash on a straight road with 4 lanes
// The server owns the lobby, the start, the seed of every race, the robot cars, the item boxes (who gets what),
// the finishing order, the rewards and the records. Each tablet drives its own car and reports where it is
// about 10 times a second; lap times that cannot be true are refused.
// Client part: dev/public/games/race.js. The block marked "shared" must stay the same in both files.
//
// Saved data (fields are only ever added):
//   profile.race = { best: { town: ms, beach: ms, night: ms }, cups: { town: 0..3 medals },      <- Sprint records
//                    day: 'YYYY-MM-DD', n: rewarded races today, races, wins,
//                    c: { ring: { lap: ms, race: ms }, ... },      best lap and best race on each circuit
//                    gp: { n: finished, wins, cup: { '0': 1..3, '1': .., '2': .. } },   best cup per robot level (1 bronze, 2 silver, 3 gold)
//                    ghost: { ring: { ms, d: [z, x, z, x, ...] } },                     the best time-trial lap, 5 points a second
//                    easy: true | false }                                               the "Easy steering" switch
//   save.race    = { board: { town: [{ key, name, ms, day }], ... },                    Sprint: the family's top 5 per track
//                    cboard: { ring: { lap: [...], race: [...] }, ... },               circuits: top 5 laps and top 5 races
//                    pref: { mode, bots } }                                             what the lobby showed last
'use strict';

// ---------- shared with dev/public/games/race.js: keep both copies the same ----------
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

// ---- Sprint ----
const PAY = [10, 7, 5, 3];      // stars by place among all racers, robots included (5th and later: 3)
const FIRST_BONUS = 5;          // the first rewarded race of the day
const DAY_CAP = 8;              // after this many rewarded races in a day the stars are halved
const GRID = 4;                 // robots fill the grid up to this many racers
const MAX_RACERS = 8;
const COUNT_MS = 4200;          // from "everyone is ready" to GO: the grid, then 3 - 2 - 1
const TICK_MS = 100;            // robots move and positions go out 10 times a second
const HURRY_MS = 50000;         // once the first player is home, the others have this long
const VMAX = V0 * BOOST_K;
// Medals: beat these times for bronze, silver, gold. They are a share of the time a steady drive without
// boost or crash takes, rounded to half a second. Medals are for showing off: they pay no stars.
const CUP_K = [1.2, 1.08, 0.985];
function cupTimes(T) { return CUP_K.map(function (k) { return Math.round(T.len / V0 * k * 2) * 500; }); }
const BOT_NAMES = ['Zip', 'Bolt', 'Turbo', 'Dash', 'Pixel', 'Rusty'];
const BOT_GREY = '#AEB6C4';
const BOT_CARS = [
  { body: 1, color: '#5ED6C4', color2: '#FFFFFF', decal: 1, wheel: 2, wheelColor: '#E8ECF2', spoiler: 1, num: 7, extra: 0 },
  { body: 0, color: '#9B6BFF', color2: '#FFC933', decal: 3, wheel: 0, wheelColor: '#FFC933', spoiler: 2, num: 3, extra: 0 },
  { body: 3, color: '#4FA05A', color2: '#FFFFFF', decal: 5, wheel: 3, wheelColor: '#FF7A45', spoiler: 0, num: 9, extra: 2 },
  { body: 5, color: '#FF7A45', color2: '#2B3046', decal: 4, wheel: 1, wheelColor: '#5ED6C4', spoiler: 0, num: 5, extra: 1 }
];
// how fast (1 = a player who never boosts and never crashes) and how careful the robots are, by how many there are
const BOT_PACE = { 1: [0.92], 2: [0.98, 0.84], 3: [1.0, 0.92, 0.8], 4: [1.0, 0.94, 0.88, 0.8] };
const BOT_SKILL = { 1: [0.8], 2: [0.9, 0.68], 3: [0.93, 0.8, 0.62], 4: [0.93, 0.84, 0.74, 0.6] };

function isHaz(k) { return k === 'cone' || k === 'oil' || k === 'puddle' || k === 'barrier'; }

// ---- circuits ----
const MODES = ['race', 'gp', 'trial', 'sprint'];
const C_GRID = 8;                           // racers on a circuit: the players plus robots
const C_PAY = [10, 8, 7, 6, 5, 4, 3, 3];    // stars by place among the 8 racers
const GP_PTS = [10, 8, 6, 5, 4, 3, 2, 1];   // Grand Prix points by place
const GP_BONUS = [10, 6, 4];                // extra stars for the Grand Prix podium
const GP_ORDER = [0, 1, 2, 3];              // the circuits of the Grand Prix
const TRIAL_PAY = 4;                        // a finished time trial
const TRIAL_BEST = 2;                       // ... and a little more for a new best lap
const C_COUNT_MS = 4600;                    // from "everyone is ready" to GO
const C_HURRY_MS = 45000;                   // once the first player is home, the others have this long
const TABLE_MS = 16000;                     // the Grand Prix table stays this long (or until everyone taps Next)
const BOX_MS = 1500;                        // a taken item box comes back after this
const FW_MS = 1100;                         // a firework flies this long
const HAZ_MAX = 12;                         // jellies lying on the road at the same time
const STORM_MAX = 3;                        // a storm cloud reaches this many cars ahead
const BOT_NICE = [0.6, 0.3, 0];             // by robot level: how often a robot's firework, cloud or jelly turns into a turbo or a magnet
// nobody can be faster than this: every bolt, and the turbo all the way
const VABS = CV0 * (1 + BOLT_MAX * BOLT_K) * TURBO_K;
const C_BOT_NAMES = BOT_NAMES.concat(['Nova', 'Sprocket', 'Comet']);
const C_BOT_CARS = BOT_CARS.concat([
  { body: 4, color: '#3B82F6', color2: '#FFC933', decal: 2, wheel: 4, wheelColor: '#E8ECF2', spoiler: 0, num: 2, extra: 3 },
  { body: 2, color: '#FFC933', color2: '#2B3046', decal: 5, wheel: 3, wheelColor: '#FF4F6D', spoiler: 1, num: 8, extra: 0 },
  { body: 1, color: '#FF8FB8', color2: '#FFFFFF', decal: 4, wheel: 1, wheelColor: '#9B6BFF', spoiler: 2, num: 4, extra: 0 },
  { body: 0, color: '#2B3046', color2: '#5ED6C4', decal: 1, wheel: 4, wheelColor: '#5ED6C4', spoiler: 1, num: 6, extra: 0 }
]);
// how fast the 7 robots are (1 = the top speed of a player's car without bolts), for the three robot levels
const C_PACE = [
  [0.875, 0.855, 0.835, 0.815, 0.795, 0.775, 0.755],
  [0.95, 0.93, 0.91, 0.89, 0.87, 0.85, 0.83],
  [1.01, 0.99, 0.97, 0.95, 0.93, 0.91, 0.89]
];
const C_SKILL = [0.95, 0.9, 0.85, 0.8, 0.72, 0.65, 0.58];   // how well they take bends and dodge trouble
// Which item a box gives: one row per part of the field (leading, upper half, lower half, at the back),
// one weight per item in the order of ITEMS. The further back, the better.
const ITEM_W = [
  [2, 3, 4, 0, 3, 0, 0],
  [3, 2, 2, 3, 2, 1, 0],
  [3, 1, 1, 3, 1, 2, 1],
  [3, 1, 0, 2, 1, 3, 3]
];
function mod(a, n) { return ((a % n) + n) % n; }
function fwd(from, to, len) { const d = to - from; return d < 0 ? d + len : d; }                  // how far ahead on the loop
function passed(z0, z1, oz, len) { return (oz > z0 && oz <= z1) || (oz + len > z0 && oz + len <= z1); }

module.exports = function (api) {
  const ID = api.id, here = api.inRoom(ID);
  const st = { phase: 'lobby', ready: {}, votes: {}, picks: {}, race: null, timer: null, lastTrack: 0, lastCirc: 0, nextRid: 1,
    mode: 'race', botLv: 0, gp: null, tableTimer: null };

  // ---------- saved data ----------
  function data(p) { // the player's race data, made on first use; the daily count starts again each day
    const prof = api.prof(p);
    if (!prof) return null;
    const d = (prof[ID] && typeof prof[ID] === 'object') ? prof[ID] : (prof[ID] = {});
    if (!d.best || typeof d.best !== 'object') d.best = {};
    if (!d.cups || typeof d.cups !== 'object') d.cups = {};
    d.races = d.races || 0; d.wins = d.wins || 0;
    if (d.day !== api.today()) { d.day = api.today(); d.n = 0; }
    d.n = d.n || 0;
    if (!d.c || typeof d.c !== 'object') d.c = {};
    if (!d.gp || typeof d.gp !== 'object') d.gp = {};
    d.gp.n = d.gp.n || 0; d.gp.wins = d.gp.wins || 0;
    if (!d.gp.cup || typeof d.gp.cup !== 'object') d.gp.cup = {};
    if (!d.ghost || typeof d.ghost !== 'object') d.ghost = {};
    if (typeof d.easy !== 'boolean') d.easy = true;
    return d;
  }
  function shared() { return (api.save[ID] && typeof api.save[ID] === 'object') ? api.save[ID] : (api.save[ID] = {}); }
  function board() {
    const s = shared();
    if (!s.board || typeof s.board !== 'object') s.board = {};
    return s.board;
  }
  function cboard(cid) {
    const s = shared();
    if (!s.cboard || typeof s.cboard !== 'object') s.cboard = {};
    const b = (s.cboard[cid] && typeof s.cboard[cid] === 'object') ? s.cboard[cid] : (s.cboard[cid] = {});
    if (!Array.isArray(b.lap)) b.lap = [];
    if (!Array.isArray(b.race)) b.race = [];
    return b;
  }
  function boardAdd(list, p, ms) { // one line per player, the 5 best
    const e = list.find(function (o) { return o.key === p.key; });
    if (!e) list.push({ key: p.key, name: p.name, ms: ms, day: api.today() });
    else if (ms < e.ms) { e.ms = ms; e.name = p.name; e.day = api.today(); }
    list.sort(function (a, c) { return a.ms - c.ms; });
    if (list.length > 5) list.length = 5;
  }
  (function loadPref() { // the lobby opens the way it was left
    const s = shared(), q = s.pref;
    if (q && typeof q === 'object') {
      if (MODES.indexOf(q.mode) >= 0) st.mode = q.mode;
      if (q.bots >= 0 && q.bots <= 2) st.botLv = q.bots | 0;
    }
  })();
  function savePref() { shared().pref = { mode: st.mode, bots: st.botLv }; api.saveSoon(); }

  // ---------- lobby ----------
  function lobbyMsg(p) {
    const d = data(p) || { best: {}, cups: {}, n: 0, c: {}, gp: { n: 0, wins: 0, cup: {} }, ghost: {}, easy: true }, b = board(), top = {}, goals = {}, ctop = {}, ghost = {};
    function lines(list) { return (Array.isArray(list) ? list : []).slice(0, 5).map(function (e) { return { name: e.name, ms: e.ms, me: e.key === p.key }; }); }
    GEN.forEach(function (g) { goals[g.id] = cupTimes(g); top[g.id] = lines(b[g.id]); });
    CIRC.forEach(function (c) {
      const cb = cboard(c.id);
      ctop[c.id] = { lap: lines(cb.lap), race: lines(cb.race) };
      if (d.ghost[c.id] && d.ghost[c.id].ms > 0) ghost[c.id] = d.ghost[c.id].ms;
    });
    return {
      t: 'race.lobby', phase: st.phase, you: p.id, cur: st.lastTrack,
      who: api.roomList(ID).map(function (q) {
        return { id: q.id, name: q.name, color: q.color, car: q.car || null, lv: api.levelOf(q.stars), ready: !!st.ready[q.key],
          vote: st.votes[q.key] >= 0 ? st.votes[q.key] : -1, pick: st.picks[q.key] >= 0 ? st.picks[q.key] : -1 };
      }),
      board: top, best: d.best, cups: d.cups, goals: goals, n: d.n, cap: DAY_CAP, pay: PAY, bonus: FIRST_BONUS, grid: GRID,
      // the circuits
      mode: st.mode, bots: st.botLv, ccur: st.lastCirc, cgrid: C_GRID, laps: LAPS, cpay: C_PAY, gpPts: GP_PTS, gpBonus: GP_BONUS, gpOrder: GP_ORDER,
      trialPay: [TRIAL_PAY, TRIAL_BEST], cbest: d.c, cboard: ctop, gp: d.gp, ghost: ghost, easy: d.easy,
      gpOn: st.gp ? { i: st.gp.i, of: st.gp.order.length } : null
    };
  }
  function sendLobby() { api.roomList(ID).forEach(function (p) { api.send(p, lobbyMsg(p)); }); }
  function maybeStart() { // the countdown starts when everyone who is here is ready
    if (st.phase !== 'lobby') return;
    const list = api.roomList(ID);
    if (!list.length || !list.every(function (p) { return st.ready[p.key]; })) return;
    if (st.mode === 'sprint') startCount();
    else if (st.mode === 'gp') startGP();
    else startCirc(st.mode, pickCirc(list));
  }
  // the one with the most votes; luck decides a tie; with no votes at all, the last one again
  function mostVotes(list, votes, n, last) {
    const tally = [];
    for (let i = 0; i < n; i++) tally.push(0);
    list.forEach(function (p) { const v = votes[p.key]; if (v >= 0 && v < n) tally[v]++; });
    const most = Math.max.apply(null, tally);
    if (most <= 0) return last;
    const tied = [];
    tally.forEach(function (k, i) { if (k === most) tied.push(i); });
    return tied[Math.floor(Math.random() * tied.length)];
  }
  function pickCirc(list) { return mostVotes(list, st.picks, CIRC.length, st.lastCirc); }

  // ---------- a race (both kinds) ----------
  function alive(r) { return !r.dropped; }
  function mine(R, p) { return R.racers.find(function (r) { return !r.bot && !r.dropped && r.key === p.key; }) || null; }
  function playerOf(r) { return api.roomList(ID).find(function (p) { return p.key === r.key; }) || null; }
  function stopTimer() { if (st.timer) { clearInterval(st.timer); st.timer = null; } }
  function closeRace() { // back to the lobby: no race, no Grand Prix
    st.race = null; st.phase = 'lobby'; st.ready = {}; st.gp = null;
    stopTimer();
    if (st.tableTimer) { clearTimeout(st.tableTimer); st.tableTimer = null; }
  }

  // =====================================================================================================
  // Sprint: the straight road with 4 lanes
  // =====================================================================================================
  function pubRacer(r) { return { rid: r.rid, pid: r.pid, name: r.name, color: r.color, car: r.car, bot: r.bot, lane: r.lane, sx: r.sx, lv: r.lv }; }
  function posList(R) { return R.racers.filter(alive).map(function (r) { return [r.rid, Math.round(r.x), r.lane, r.f]; }); }

  function startCount() {
    const list = api.roomList(ID).slice(0, MAX_RACERS);
    const ti = mostVotes(list, st.votes, GEN.length, st.lastTrack);
    const T = GEN[ti], seed = 1 + Math.floor(Math.random() * 2147483646), items = makeTrack(ti, seed);
    // trouble right behind a ramp is jumped over: the robots do not steer around it
    items.forEach(function (it) {
      if (it.k !== 'ramp') return;
      items.forEach(function (o) { if (isHaz(o.k) && o.l === it.l && o.x > it.x + 80 && o.x < it.x + 360) o.cov = true; });
    });

    let racers = list.map(function (p) {
      return { rid: st.nextRid++, bot: false, key: p.key, pid: p.id, name: p.name, color: p.color, car: p.car || null, lv: api.levelOf(p.stars),
        lane: 0, sx: 0, x: 0, f: 0, done: false, dropped: false, ms: 0, place: 0, stars: 0 };
    });
    const nBots = Math.max(0, GRID - racers.length), names = api.shuffle(BOT_NAMES), cars = api.shuffle(BOT_CARS);
    for (let i = 0; i < nBots; i++) {
      racers.push({ rid: st.nextRid++, bot: true, key: '', pid: 0, name: names[i], color: BOT_GREY, car: cars[i % cars.length], lv: 0,
        lane: 0, sx: 0, x: 0, f: 0, done: false, dropped: false, ms: 0, place: 0, stars: 0,
        v: 0, pace: BOT_PACE[nBots][i] * (0.97 + Math.random() * 0.06), skill: BOT_SKILL[nBots][i], ptr: 0, rolled: {}, hit: {}, bolts: 1, // every race a little different
        spinEnd: -1, inv: -1, boostEnd: -1, padEnd: -1, airEnd: -1, boostAt: 0 });
    }
    racers = api.shuffle(racers);
    const lanes = api.shuffle([0, 1, 2, 3]);
    racers.forEach(function (r, i) { r.lane = lanes[i % 4]; r.sx = -Math.floor(i / 4) * 180; r.x = r.sx; });

    const now = Date.now();
    st.race = {
      kind: 's', ti: ti, id: T.id, seed: seed, len: T.len, items: items, racers: racers,
      startAt: now + COUNT_MS, lastTick: now, nDone: 0, lastMs: 0, hurryAt: 0,
      minMs: T.len / VMAX * 1000 * 0.95,                 // nobody can be faster than boosting all the way
      capAt: now + COUNT_MS + T.len / (V0 * 0.45) * 1000 // the race never lasts longer than this
    };
    st.phase = 'count'; st.ready = {}; st.lastTrack = ti;
    api.broadcast({ t: 'race.count', track: ti, seed: seed, in: COUNT_MS, racers: racers.map(pubRacer) }, here);
    stopTimer();
    st.timer = setInterval(tick, TICK_MS);
  }

  function watchMsg(R) { // for someone who walks in while a race is on
    const now = Date.now();
    return {
      t: 'race.watch', track: R.ti, seed: R.seed, e: now - R.startAt, racers: R.racers.filter(alive).map(pubRacer), pos: posList(R),
      done: R.racers.filter(function (r) { return r.done && !r.dropped; }).map(function (r) { return { rid: r.rid, place: r.place, ms: r.ms }; }),
      hurry: R.hurryAt ? Math.max(0, R.hurryAt - now) : 0
    };
  }

  // A racer crossed the line. Times never go backwards, so the order of arrival and the times always agree.
  function finishRacer(R, r, ms) {
    ms = Math.max(Math.round(ms), R.lastMs + 1); R.lastMs = ms;
    r.done = true; r.ms = ms; r.place = ++R.nDone; r.f |= 8;
    api.broadcast({ t: 'race.done', rid: r.rid, place: r.place, ms: ms }, here);
  }
  function reward(R, p, r, finished) {
    const d = data(p);
    if (!d) return;
    const half = d.n >= DAY_CAP, full = PAY[Math.min(r.place, PAY.length) - 1];
    const base = half ? Math.ceil(full / 2) : full, bonus = d.n === 0 ? FIRST_BONUS : 0;
    let newBest = false, cup = 0;
    d.n++; d.races++;
    if (finished) {
      if (r.place === 1) d.wins++;
      cupTimes(GEN[R.ti]).forEach(function (ms, i) { if (r.ms <= ms) cup = i + 1; });
      if (cup > (d.cups[R.id] || 0)) d.cups[R.id] = cup; else cup = 0;      // only a better medal than before is news
      if (!(d.best[R.id] > 0) || r.ms < d.best[R.id]) { d.best[R.id] = r.ms; newBest = true; }
      const b = board(), list = Array.isArray(b[R.id]) ? b[R.id] : (b[R.id] = []);
      boardAdd(list, p, r.ms);
    }
    r.stars = base + bonus;
    api.saveSoon();
    api.send(p, { t: 'race.reward', place: r.place, of: R.racers.filter(alive).length, ms: finished ? r.ms : 0, base: base, bonus: bonus, half: half,
      stars: r.stars, best: d.best[R.id] || 0, newBest: newBest, cup: cup, dnf: !finished, n: d.n, cap: DAY_CAP });
    api.addStars(p, r.stars);
    if (finished) {
      api.questEvent(p, 'race.finish');
      if (r.place <= 3) api.questEvent(p, 'race.podium');
    }
  }
  // After a player finished or left: is the race over, or should the others hurry?
  function after(R) {
    if (st.race !== R) return;
    const driving = R.racers.some(function (r) { return !r.bot && !r.dropped && !r.done; });
    const home = R.racers.some(function (r) { return !r.bot && r.done; });
    if (!driving) {
      if (home) endRace();
      else { closeRace(); sendLobby(); }               // every racer left before the end: nothing to pay
      return;
    }
    if (home && !R.hurryAt) { R.hurryAt = Date.now() + HURRY_MS; api.broadcast({ t: 'race.hurry', left: HURRY_MS }, here); }
  }
  function endRace() {
    const R = st.race;
    if (!R) return;
    // whoever is still driving is placed by how far they got; a player who made at least half the way still earns the place
    R.racers.filter(function (r) { return !r.done && !r.dropped; }).sort(function (a, b) { return b.x - a.x; }).forEach(function (r) {
      r.place = ++R.nDone; r.dnf = true;
      if (!r.bot && r.x >= R.len * 0.5) { const p = playerOf(r); if (p) reward(R, p, r, false); }
    });
    const results = R.racers.filter(function (r) { return r.place > 0; }).sort(function (a, b) { return a.place - b.place; }).map(function (r) {
      return { rid: r.rid, pid: r.pid, name: r.name, bot: r.bot, color: (r.car && r.car.color) || '#FF4F6D', place: r.place, ms: r.dnf ? 0 : r.ms, stars: r.stars };
    });
    api.broadcast({ t: 'race.end', track: R.ti, results: results }, here);
    closeRace();
    sendLobby();
  }

  // ---------- Sprint robots ----------
  function laneClear(R, b, lane, x0, x1) {
    for (let i = b.ptr; i < R.items.length && R.items[i].x <= x1; i++) {
      const it = R.items[i];
      if (it.l === lane && it.x >= x0 && isHaz(it.k) && !it.cov) return false;
    }
    return true;
  }
  function hasGoody(R, b, lane, x0, x1) {
    for (let i = b.ptr; i < R.items.length && R.items[i].x <= x1; i++) {
      const it = R.items[i];
      if (it.l === lane && it.x >= x0 && !it.a && !isHaz(it.k)) return true;
    }
    return false;
  }
  function simBot(R, b, dt, e, ref) {
    const items = R.items, t = e / 1000;
    if (b.done) { b.v = Math.max(0, b.v - 300 * dt); b.x += b.v * dt; b.f = 8; return; }
    while (b.ptr < items.length && items[b.ptr].x < b.x - 140) b.ptr++;
    const air = t < b.airEnd;
    // steering: each thing ahead is looked at once
    for (let i = b.ptr; i < items.length && items[i].x < b.x + 430; i++) {
      const it = items[i];
      if (it.x < b.x + 50 || b.rolled[i] || it.a) continue;
      if (isHaz(it.k)) {
        if (it.l !== b.lane || it.cov) continue;
        b.rolled[i] = 1;
        if (Math.random() > b.skill) continue;           // did not see it
        const ok = [b.lane - 1, b.lane + 1].filter(function (l) { return l >= 0 && l <= 3 && laneClear(R, b, l, b.x - 60, it.x + 260); });
        if (!ok.length) continue;
        const nice = ok.filter(function (l) { return hasGoody(R, b, l, b.x, it.x + 300); });
        const pick = nice.length ? nice : ok;
        b.lane = pick[Math.floor(Math.random() * pick.length)];
      } else if (it.k !== 'coin' && Math.abs(it.l - b.lane) === 1) {
        b.rolled[i] = 1;
        if (Math.random() < 0.15 + 0.45 * b.skill && laneClear(R, b, it.l, b.x - 60, it.x + 300)) b.lane = it.l;
      }
    }
    // what the car touches
    for (let i = b.ptr; i < items.length && items[i].x < b.x + 140; i++) {
      const it = items[i], dx = b.x - it.x;
      if (b.hit[i] || it.l !== b.lane) continue;
      if (it.k === 'ramp') {
        if (!air && dx >= -20 && dx <= 70) { b.hit[i] = 1; b.airEnd = t + AIR_T; b.v = Math.max(b.v, V0 * 0.9); }
        continue;
      }
      if (Math.abs(dx) > HW[it.k] + 40) continue;
      if (it.a) { if (air) b.hit[i] = 1; continue; }
      if (air) continue;
      if (it.k === 'coin') { b.hit[i] = 1; continue; }
      if (it.k === 'bolt') { b.hit[i] = 1; if (++b.bolts >= 3) b.boostAt = t + 0.4 + Math.random() * 1.6; continue; }
      if (it.k === 'pad') { b.hit[i] = 1; b.padEnd = t + 1.1; continue; }
      if (t < b.inv) continue;
      b.hit[i] = 1; b.boostEnd = -1;
      if (it.k === 'cone') { b.v *= 0.62; b.spinEnd = t + 0.45; b.inv = t + 0.9; }
      else if (it.k === 'puddle') { b.v *= 0.68; b.spinEnd = t + 0.4; b.inv = t + 0.6; }
      else if (it.k === 'oil') { b.v *= 0.55; b.spinEnd = t + 0.9; b.inv = t + 1.3; }
      else { b.v *= 0.25; b.spinEnd = t + 0.9; b.inv = t + 1.4; }
    }
    if (b.bolts >= 3 && t >= b.boostAt && t >= b.spinEnd) { b.bolts = 0; b.boostEnd = t + BOOST_T; }
    // speed: the robots hold back a little when they are ahead of the players and push a little when behind
    const k = t < b.boostEnd ? BOOST_K : t < b.padEnd ? PAD_K : 1;
    const band = ref === null ? 1 : 1 + api.clamp((ref - b.x) / 5000, -0.12, 0.06);
    const vt = V0 * b.pace * band * k;
    if (b.v < vt) b.v = Math.min(vt, b.v + ACC * (k > 1 ? 3 : 1) * dt); else b.v = Math.max(vt, b.v - 420 * dt);
    const nx = b.x + b.v * dt;
    b.f = (t < b.spinEnd ? 1 : 0) | (k > 1 ? 2 : 0) | (t < b.airEnd ? 4 : 0);
    if (nx >= R.len) { b.x = nx; finishRacer(R, b, e - (b.v > 1 ? (nx - R.len) / b.v * 1000 : 0)); return; }
    b.x = nx;
  }

  function tick() {
    const R = st.race;
    if (!R || R.kind !== 's') { stopTimer(); return; }
    const now = Date.now(), e = now - R.startAt, dt = Math.min(0.3, (now - R.lastTick) / 1000);
    R.lastTick = now;
    if (!api.roomList(ID).length) { closeRace(); return; }
    if (st.phase === 'count' && e >= 0) st.phase = 'race';
    if (st.phase === 'race') {
      let sum = 0, n = 0;
      R.racers.forEach(function (r) { if (!r.bot && !r.dropped && !r.done) { sum += r.x; n++; } });
      const ref = n ? sum / n : null;
      R.racers.forEach(function (r) { if (r.bot) simBot(R, r, dt, e, ref); });
      if (now >= R.capAt || (R.hurryAt && now >= R.hurryAt)) { endRace(); return; }
    }
    if (e > -600) api.broadcast({ t: 'race.pos', e: e, p: posList(R) }, here);
  }

  // =====================================================================================================
  // Circuits: single race, Grand Prix, time trial
  // =====================================================================================================
  function cPub(r) { return { rid: r.rid, pid: r.pid, name: r.name, color: r.color, car: r.car, bot: r.bot, lv: r.lv, gz: r.gz, gx: r.gx }; }
  function cPos(R) { return R.racers.filter(alive).map(function (r) { return [r.rid, Math.round(r.z), Math.round(r.x * 100), r.f]; }); }
  function gpInfo() { // the Grand Prix points so far, by racer
    const G = st.gp, R = st.race;
    if (!G) return null;
    const pts = {};
    if (R) R.racers.forEach(function (r) { const s = G.seats.find(function (o) { return o.sid === r.sid; }); if (s) pts[r.rid] = s.pts; });
    return { i: G.i, of: G.order.length, pts: pts };
  }
  function cStartMsg(R) {
    return { t: 'race.cstart', mode: R.mode, c: R.ci, seed: R.seed, laps: LAPS, lv: R.lv, racers: R.racers.filter(alive).map(cPub), gp: gpInfo() };
  }
  function cWatchMsg(R) { // for someone who walks in while a race is on
    const now = Date.now(), m = cStartMsg(R), laps = {};
    R.racers.forEach(function (r) { laps[r.rid] = r.lap; });
    m.t = 'race.cwatch'; m.e = now - R.startAt; m.pos = cPos(R); m.lapOf = laps;
    m.done = R.racers.filter(function (r) { return r.done && !r.dropped; }).map(function (r) { return { rid: r.rid, place: r.place, ms: r.ms }; });
    m.hurry = R.hurryAt ? Math.max(0, R.hurryAt - now) : 0;
    m.haz = R.haz.map(function (h) { return { id: h.id, z: h.z, x: h.x }; });
    return m;
  }
  // every racer that is still driving, the leader first
  function order(R) {
    return R.racers.filter(function (r) { return !r.dropped && !r.done; }).sort(function (a, b) { return b.z - a.z; });
  }

  // seats: who takes part. A single race or a time trial makes its seats for one race; a Grand Prix keeps them.
  function makeSeats(list, withBots, lv) {
    const seats = list.slice(0, C_GRID).map(function (p, i) {
      return { sid: i + 1, bot: false, key: p.key, pid: p.id, name: p.name, color: p.color, car: p.car || null, lv: api.levelOf(p.stars), pts: 0, last: 0, gone: false };
    });
    if (withBots) {
      const n = C_GRID - seats.length, names = api.shuffle(C_BOT_NAMES), cars = api.shuffle(C_BOT_CARS);
      for (let i = 0; i < n; i++) {
        const k = n > 1 ? Math.round(i * 6 / (n - 1)) : 2;           // spread over the 7 paces, the fast and the slow ones
        seats.push({ sid: seats.length + 1, bot: true, key: '', pid: 0, name: names[i], color: BOT_GREY, car: cars[i % cars.length], lv: 0, pts: 0, last: 0, gone: false,
          pace: C_PACE[lv][k], skill: C_SKILL[k] });
      }
    }
    return seats;
  }
  function startGP() {
    const list = api.roomList(ID);
    st.gp = { i: 0, order: GP_ORDER.slice(), lv: st.botLv, seats: makeSeats(list, true, st.botLv), lastEnd: null };
    startCirc('gp', st.gp.order[0]);
  }
  function startCirc(mode, ci) {
    const G = mode === 'gp' ? st.gp : null;
    const seats = G ? G.seats.filter(function (s) { return !s.gone; }) : makeSeats(api.roomList(ID), mode !== 'trial', st.botLv);
    const T = buildCircuit(ci), seed = 1 + Math.floor(Math.random() * 2147483646), now = Date.now();
    // the grid: by luck; in a Grand Prix the leader of the table starts at the back
    let grid = api.shuffle(seats);
    if (G && G.i > 0) grid = grid.sort(function (a, b) { return a.pts - b.pts; });
    const racers = grid.map(function (s, i) {
      const r = { rid: st.nextRid++, sid: s.sid, bot: s.bot, key: s.key, pid: s.pid, name: s.name, color: s.color, car: s.car, lv: s.lv,
        gz: -500 - i * 430, gx: i % 2 ? 0.42 : -0.42, z: 0, x: 0, f: 0, lap: 0, lapAt: 0, best: 0, newLap: false,
        done: false, dropped: false, dnf: false, ms: 0, place: 0, stars: 0, item: null, boxAt: 0 };
      r.z = r.gz; r.x = r.gx;
      if (s.bot) {
        r.v = 0; r.pace = s.pace * (0.985 + Math.random() * 0.03); r.skill = s.skill; r.lane = Math.random() * 1.4 - 0.7;
        r.spinEnd = r.turboEnd = r.rushEnd = r.miniEnd = r.stormEnd = r.magEnd = r.wideEnd = -1; r.shield = false; r.bolts = 0;
        r.boltAt = 2 + Math.random() * 4; r.itemAt = 0; r.bendT = 0; r.slide = false; r.dodge = {};
      }
      return r;
    });
    st.race = {
      kind: 'c', mode: mode, ci: ci, id: CIRC[ci].id, seed: seed, T: T, len: T.len, lay: layoutCircuit(ci, seed), lv: G ? G.lv : st.botLv, racers: racers,
      startAt: now + C_COUNT_MS, lastTick: now, nDone: 0, lastMs: 0, hurryAt: 0,
      minLap: T.len / VABS * 1000 * 0.97,                                     // a lap cannot be faster than this
      capAt: now + C_COUNT_MS + LAPS * T.len / (CV0 * 0.3) * 1000,            // the race never lasts longer than this
      haz: [], hazId: 1, boxOff: [], fws: [], rnd: rng((seed ^ 0x5F3759DF) >>> 0)
    };
    const R = st.race;
    for (let i = 0; i < R.lay.boxes.length; i++) R.boxOff.push(0);
    st.phase = 'count'; st.ready = {};
    if (!G) st.lastCirc = ci;
    if (mode === 'trial') { // each player gets the ghost of their own best lap
      api.roomList(ID).forEach(function (p) {
        const d = data(p), g = d && d.ghost[R.id];
        if (g && g.ms > 0 && Array.isArray(g.d)) api.send(p, { t: 'race.ghost', c: ci, ms: g.ms, d: g.d });
      });
    }
    const m = cStartMsg(R);
    m.in = C_COUNT_MS;
    api.broadcast(m, here);
    stopTimer();
    st.timer = setInterval(ctick, TICK_MS);
  }

  function finishC(R, r, ms) {
    ms = Math.max(Math.round(ms), R.lastMs + 1); R.lastMs = ms;
    r.done = true; r.ms = ms; r.place = ++R.nDone; r.f = 0; r.item = null;
    api.broadcast({ t: 'race.cdone', rid: r.rid, place: r.place, ms: ms }, here);
  }
  function rewardC(R, p, r, finished) {
    const d = data(p);
    if (!d) return;
    const trial = R.mode === 'trial', half = d.n >= DAY_CAP;
    const full = trial ? TRIAL_PAY + (r.newLap ? TRIAL_BEST : 0) : C_PAY[Math.min(r.place, C_PAY.length) - 1];
    const base = half ? Math.ceil(full / 2) : full, bonus = d.n === 0 ? FIRST_BONUS : 0;
    const rec = (d.c[R.id] && typeof d.c[R.id] === 'object') ? d.c[R.id] : (d.c[R.id] = {});
    let newRace = false;
    d.n++; d.races++;
    if (finished && !trial) {
      if (r.place === 1) d.wins++;
      if (!(rec.race > 0) || r.ms < rec.race) { rec.race = r.ms; newRace = true; }
      boardAdd(cboard(R.id).race, p, r.ms);
    }
    r.stars = base + bonus;
    api.saveSoon();
    api.send(p, { t: 'race.creward', mode: R.mode, place: r.place, of: R.racers.filter(alive).length, ms: finished ? r.ms : 0, lap: r.best, base: base, bonus: bonus, half: half,
      stars: r.stars, newLap: r.newLap, newRace: newRace, bestLap: rec.lap || 0, bestRace: rec.race || 0, dnf: !finished, n: d.n, cap: DAY_CAP });
    api.addStars(p, r.stars);
    if (finished) {
      api.questEvent(p, 'race.finish');
      if (r.place <= 3) api.questEvent(p, 'race.podium');
    }
  }
  function afterC(R) { // after a player finished or left: is the race over, or should the others hurry?
    if (st.race !== R) return;
    const driving = R.racers.some(function (r) { return !r.bot && !r.dropped && !r.done; });
    const home = R.racers.some(function (r) { return !r.bot && r.done; });
    if (!driving) {
      if (home) endCirc();
      else if (st.gp && api.roomList(ID).length) endCirc();      // a Grand Prix goes on for whoever is still in the room
      else { closeRace(); sendLobby(); }                          // every racer left before the end: nothing to pay
      return;
    }
    if (home && !R.hurryAt) { R.hurryAt = Date.now() + C_HURRY_MS; api.broadcast({ t: 'race.churry', left: C_HURRY_MS }, here); }
  }
  function gpTable(G) { // the seats in the order of the table
    return G.seats.slice().sort(function (a, b) { return b.pts - a.pts || (a.last || 99) - (b.last || 99) || a.sid - b.sid; });
  }
  function endCirc() {
    const R = st.race, G = st.gp;
    if (!R || R.kind !== 'c') return;
    // whoever is still driving is placed by how far they got; a player who made at least half the way still earns the place
    R.racers.filter(function (r) { return !r.done && !r.dropped; }).sort(function (a, b) { return b.z - a.z; }).forEach(function (r) {
      r.place = ++R.nDone; r.dnf = true;
      if (!r.bot && r.z >= LAPS * R.len * 0.5) { const p = playerOf(r); if (p) rewardC(R, p, r, false); }
    });
    let list = R.racers.filter(function (r) { return r.place > 0 && !r.dropped; }).sort(function (a, b) { return a.place - b.place; });
    if (R.mode === 'trial') list = list.sort(function (a, b) { return (a.best || 9e9) - (b.best || 9e9) || a.place - b.place; });   // a time trial is about the best lap
    const results = list.map(function (r, i) {
      return { rid: r.rid, pid: r.pid, name: r.name, bot: r.bot, color: (r.car && r.car.color) || '#FF4F6D', place: R.mode === 'trial' ? i + 1 : r.place,
        ms: r.dnf ? 0 : r.ms, lap: r.best, stars: r.stars };
    });
    const msg = { t: 'race.cend', mode: R.mode, c: R.ci, results: results, gp: null };
    if (G) {
      const add = {};
      list.forEach(function (r) {
        const s = G.seats.find(function (o) { return o.sid === r.sid; });
        if (!s) return;
        add[s.sid] = GP_PTS[Math.min(r.place, GP_PTS.length) - 1] || 0;
        s.pts += add[s.sid]; s.last = r.place;
      });
      const final = G.i >= G.order.length - 1, table = gpTable(G);
      msg.gp = { i: G.i, of: G.order.length, final: final, wait: final ? 0 : TABLE_MS, next: final ? -1 : G.order[G.i + 1],
        table: table.map(function (s, i) { return { sid: s.sid, pid: s.pid, name: s.name, bot: s.bot, color: (s.car && s.car.color) || '#FF4F6D', car: s.car, pcol: s.color, pts: s.pts, add: add[s.sid] || 0, gone: !!s.gone, rank: i + 1 }; }) };
      if (final) {
        table.forEach(function (s, i) { // the podium: extra stars and a cup
          if (s.bot || s.gone) return;
          const p = api.roomList(ID).find(function (q) { return q.key === s.key; }), d = p && data(p);
          if (!d) return;
          const rank = i + 1, half = d.n >= DAY_CAP, full = rank <= 3 ? GP_BONUS[rank - 1] : 0, bonus = half ? Math.ceil(full / 2) : full;
          const medal = rank <= 3 ? 4 - rank : 0, key = String(G.lv), newCup = medal > (d.gp.cup[key] || 0);
          d.gp.n++;
          if (rank === 1) d.gp.wins++;
          if (newCup) d.gp.cup[key] = medal;
          api.send(p, { t: 'race.gpreward', rank: rank, pts: s.pts, bonus: bonus, half: half && full > 0, medal: medal, newCup: newCup, lv: G.lv });
          if (bonus > 0) api.addStars(p, bonus);
        });
        api.saveSoon();
      }
      G.lastEnd = msg;
      if (!final) { // the table, then the next race
        api.broadcast(msg, here);
        st.race = null; st.phase = 'table'; st.ready = {};
        stopTimer();
        G.tableEnd = Date.now() + TABLE_MS;
        if (st.tableTimer) clearTimeout(st.tableTimer);
        st.tableTimer = setTimeout(nextGP, TABLE_MS);
        sendLobby();
        return;
      }
    }
    api.broadcast(msg, here);
    closeRace();
    sendLobby();
  }
  function nextGP() { // the next race of the Grand Prix
    const G = st.gp;
    if (st.tableTimer) { clearTimeout(st.tableTimer); st.tableTimer = null; }
    if (!G || st.phase !== 'table') return;
    const list = api.roomList(ID);
    if (!list.length) { closeRace(); return; }
    // a player who came back gets their seat back; someone new takes over the car of the last robot in the table
    G.seats.forEach(function (s) { if (!s.bot) s.gone = true; });
    list.forEach(function (p) {
      let s = G.seats.find(function (o) { return !o.bot && o.key === p.key; });
      if (!s) {
        s = gpTable(G).filter(function (o) { return o.bot; }).pop();
        if (!s) return;                                    // no robot left to replace: watch
        s.bot = false; s.key = p.key; delete s.pace; delete s.skill;
      }
      s.gone = false; s.pid = p.id; s.name = p.name; s.color = p.color; s.car = p.car || null; s.lv = api.levelOf(p.stars);
    });
    if (!G.seats.some(function (s) { return !s.bot && !s.gone; })) { closeRace(); sendLobby(); return; }
    G.i++;
    startCirc('gp', G.order[G.i]);
  }

  // ---------- items ----------
  function rollItem(R, r) {
    const act = order(R), n = act.length, i = Math.max(0, act.indexOf(r)), q = n > 1 ? i / (n - 1) : 0;
    const w = ITEM_W[q < 0.1 ? 0 : q < 0.45 ? 1 : q < 0.75 ? 2 : 3];
    let sum = 0, k;
    for (k = 0; k < w.length; k++) sum += w[k];
    let x = R.rnd() * sum, item = ITEMS[0];
    for (k = 0; k < w.length; k++) { x -= w[k]; if (x < 0) { item = ITEMS[k]; break; } }
    // gentle robots throw less at the others: more often their box holds something for themselves
    if (r.bot && (item === 'firework' || item === 'storm' || item === 'jelly') && R.rnd() < BOT_NICE[R.lv]) item = R.rnd() < 0.5 ? 'turbo' : 'magnet';
    return item;
  }
  function giveItem(R, r, i) {
    const now = Date.now();
    R.boxOff[i] = now + BOX_MS; r.boxAt = now + 1000; r.item = rollItem(R, r);
    api.broadcast({ t: 'race.box', i: i, rid: r.rid, off: BOX_MS }, here);
    if (r.bot) r.itemAt = (now - R.startAt) / 1000 + 1.6 + Math.random() * 3.5;
    else { const p = playerOf(r); if (p) api.send(p, { t: 'race.item', k: r.item }); }
  }
  function hazOff(R, h, rid) {
    const i = R.haz.indexOf(h);
    if (i >= 0) R.haz.splice(i, 1);
    api.broadcast({ t: 'race.hazoff', id: h.id, rid: rid }, here);
  }
  function hitBot(b, t) { // a robot is hit: the rainbow rush and the bubble protect it
    if (t < b.rushEnd) return;
    if (b.shield) { b.shield = false; return; }
    b.spinEnd = t + 1.1; b.v *= 0.35; b.bolts = Math.max(0, b.bolts - 3); b.turboEnd = b.miniEnd = -1;
  }
  function useItem(R, r) {
    const k = r.item, now = Date.now(), t = (now - R.startAt) / 1000;
    if (!k) return;
    r.item = null;
    const msg = { t: 'race.fx', k: k, rid: r.rid };
    if (k === 'jelly') { // dropped behind the car; it stays until someone drives into it
      const h = { id: R.hazId++, z: mod(r.z - 1000, R.len), x: api.clamp(r.x, -0.9, 0.9), by: r.rid, armAt: now + 500 };
      R.haz.push(h);
      if (R.haz.length > HAZ_MAX) hazOff(R, R.haz[0], 0);
      msg.id = h.id; msg.z = h.z; msg.x = h.x;
    } else if (k === 'firework') { // flies to the car in front
      const act = order(R), i = act.indexOf(r), to = i > 0 ? act[i - 1] : null;
      msg.to = to ? to.rid : 0; msg.ms = FW_MS;
      if (to && to.bot) R.fws.push({ at: now + FW_MS, r: to });
    } else if (k === 'storm') { // a cloud over the cars in front, the nearest three
      const act = order(R), i = act.indexOf(r);
      msg.to = []; msg.dur = STORM_T;
      for (let j = Math.max(0, i - STORM_MAX); j < i; j++) {
        const o = act[j];
        msg.to.push(o.rid);
        if (!o.bot || t < o.rushEnd) continue;
        if (o.shield) o.shield = false; else o.stormEnd = t + STORM_T;
      }
    } else if (r.bot) {
      if (k === 'turbo') r.turboEnd = t + TURBO_T;
      else if (k === 'bubble') r.shield = true;
      else if (k === 'magnet') { r.bolts = Math.min(BOLT_MAX, r.bolts + 4); r.magEnd = t + 3; }
      else if (k === 'rush') r.rushEnd = t + RUSH_T;
    }
    api.broadcast(msg, here);
  }

  // ---------- circuit robots ----------
  function simCBot(R, b, dt, e, ref, now) {
    const T = R.T, len = R.len, t = e / 1000;
    if (b.done) { // home: roll on at an easy pace
      b.v = Math.max(CV0 * 0.3, b.v - 3000 * dt); b.z += b.v * dt; b.x += api.clamp(b.lane * 0.6 - b.x, -dt, dt); b.f = 0;
      return;
    }
    const si = mod(Math.floor(b.z / SEG), T.n), cur = Math.abs(T.c[si]);
    let ahead = 0, sgn = 0, i, c2, d, want, m = 1;
    for (i = 0; i <= 18; i += 3) { c2 = T.c[(si + i) % T.n]; if (Math.abs(c2) > ahead) { ahead = Math.abs(c2); sgn = c2 < 0 ? -1 : 1; } }
    const spin = t < b.spinEnd, rush = t < b.rushEnd;
    // bends: a good robot slides through and gets a little turbo out of it
    if (cur > 2.2) { if (!b.bendT) b.slide = Math.random() < b.skill * 0.8; b.bendT += dt; }
    else if (cur < 1) { if (b.bendT > 1.2 && b.slide && !spin) b.miniEnd = t + 0.9; b.bendT = 0; b.slide = false; }
    // speed: the robots hold back a little when they are ahead of the players and push a little when behind
    if (t < b.turboEnd) m = TURBO_K; else if (rush) m = RUSH_K; else if (t < b.miniEnd) m = MINI_K;
    if (t < b.stormEnd) m *= STORM_K;
    const band = ref === null ? 1 : 1 + api.clamp((ref - b.z) / 400000, -0.08, 0.05);         // the full push or hold-back only when 3 to 5 seconds apart
    let vt = CV0 * b.pace * band * (1 + BOLT_K * b.bolts) * m * (1 - 0.08 * (1 - b.skill) * Math.min(1, ahead / 5));
    if (spin) vt = CV0 * 0.2;
    else if (Math.abs(b.x) > 1.05 && !rush) vt = Math.min(vt, CV0 * 0.5);
    if (b.v < vt) b.v = Math.min(vt, b.v + (m > 1 ? 5200 : 2600) * dt); else b.v = Math.max(vt, b.v - (spin ? 9000 : 3500) * dt);
    // where to steer: the own lane, the inside of a bend, an item box, around a jelly, around a slower car
    const zl = mod(b.z, len), k4 = Math.min(1, ahead / 4);
    want = b.lane * (1 - 0.45 * k4) + sgn * 0.4 * k4;
    if (!b.item && R.mode !== 'trial') {
      let bestD = 9;
      for (i = 0; i < R.lay.boxes.length; i++) {
        const bx = R.lay.boxes[i];
        if (R.boxOff[i] > now || fwd(zl, bx.z, len) > 3200) continue;
        d = Math.abs(bx.x - b.x);
        if (d < bestD) { bestD = d; want = bx.x; }
      }
    }
    for (i = 0; i < R.haz.length; i++) {
      const h = R.haz[i];
      if (fwd(zl, h.z, len) > 3400 || Math.abs(h.x - want) > 0.36) continue;
      if (b.dodge[h.id] === undefined) b.dodge[h.id] = Math.random() < b.skill;
      if (b.dodge[h.id]) want = h.x + ((want >= h.x ? h.x < 0.45 : h.x < -0.45) ? 0.5 : -0.5);
    }
    for (i = 0; i < R.racers.length; i++) {
      const o = R.racers[i];
      if (o === b || o.dropped) continue;
      d = o.z - b.z;
      if (d > 0 && d < 1600 && Math.abs(o.x - b.x) < 0.3) { want += b.x >= o.x ? 0.4 : -0.4; break; }
    }
    want = api.clamp(want, -0.95, 0.95);
    if (t < b.wideEnd) want = -sgn * 1.25;                                             // ran wide in a bend
    else if (cur > 3 && Math.random() < (1 - b.skill) * 0.05) b.wideEnd = t + 0.7;
    if (!spin) b.x += api.clamp(want - b.x, -1.4 * dt, 1.4 * dt);
    // forward
    const z0 = b.z;
    b.z += b.v * dt;
    const zl1 = zl + (b.z - z0);
    if (!b.item && R.mode !== 'trial') {
      for (i = 0; i < R.lay.boxes.length; i++) {
        const bx = R.lay.boxes[i];
        if (R.boxOff[i] <= now && passed(zl, zl1, bx.z, len) && Math.abs(bx.x - b.x) < 0.23) { giveItem(R, b, i); break; }
      }
    }
    for (i = R.haz.length - 1; i >= 0; i--) {
      const h = R.haz[i];
      if (now >= h.armAt && passed(zl, zl1, h.z, len) && Math.abs(h.x - b.x) < 0.25) { hazOff(R, h, b.rid); hitBot(b, t); }
    }
    if (t >= b.boltAt && !spin) { b.bolts = Math.min(BOLT_MAX, b.bolts + 1); b.boltAt = t + 2.5 + Math.random() * 4; }
    // the item: used when it makes sense, or after a while anyway
    if (b.item && t >= b.itemAt && !spin) {
      const late = t >= b.itemAt + 7, act = order(R), me = act.indexOf(b);
      let go = true;
      if (b.item === 'turbo') go = ahead < 1.5 || late;
      else if (b.item === 'jelly') go = late || (me >= 0 && me < act.length - 1 && b.z - act[me + 1].z < 3500);
      else if (b.item === 'firework') go = late || (me > 0 && act[me - 1].z - b.z < 18000);
      else if (b.item === 'storm') go = late || me > 0;
      if (go) useItem(R, b);
    }
    // the line
    if (z0 < 0 && b.z >= 0) b.lapAt = Math.max(1, Math.round(e - b.z / Math.max(1, b.v) * 1000));
    while (!b.done && b.z >= (b.lap + 1) * len) {
      const ms = Math.round(e - (b.z - (b.lap + 1) * len) / Math.max(1, b.v) * 1000), lap = Math.max(1, ms - b.lapAt);
      b.lap++; b.lapAt = ms;
      if (!b.best || lap < b.best) b.best = lap;
      api.broadcast({ t: 'race.clap', rid: b.rid, n: b.lap, ms: ms, lap: lap }, here);
      if (b.lap >= LAPS) finishC(R, b, ms);
    }
    if (b.done) return;
    b.f = (spin ? 1 : 0) | (m > 1 ? 2 : 0) | (b.slide && cur > 2.2 ? (T.c[si] < 0 ? 4 : 8) : 0) | (b.shield ? 16 : 0) | (rush ? 32 : 0) | (t < b.stormEnd ? 64 : 0) | (t < b.magEnd ? 128 : 0);
  }

  function ctick() {
    const R = st.race;
    if (!R || R.kind !== 'c') { stopTimer(); return; }
    const now = Date.now(), e = now - R.startAt, dt = Math.min(0.3, (now - R.lastTick) / 1000);
    R.lastTick = now;
    if (!api.roomList(ID).length) { closeRace(); return; }
    if (st.phase === 'count' && e >= 0) st.phase = 'race';
    if (st.phase === 'race') {
      let sum = 0, n = 0, i;
      R.racers.forEach(function (r) { if (!r.bot && !r.dropped && !r.done) { sum += r.z; n++; } });
      const ref = n ? sum / n : null;
      for (i = R.fws.length - 1; i >= 0; i--) { // fireworks that arrive at a robot
        if (now < R.fws[i].at) continue;
        const b = R.fws[i].r;
        R.fws.splice(i, 1);
        if (!b.done && !b.dropped) hitBot(b, e / 1000);
      }
      R.racers.forEach(function (r) { if (r.bot && !r.dropped) simCBot(R, r, dt, e, ref, now); });
      if (st.race !== R) return;
      if (now >= R.capAt || (R.hurryAt && now >= R.hurryAt)) { endCirc(); return; }
    }
    if (e > -600) api.broadcast({ t: 'race.cpos', e: e, p: cPos(R) }, here);
  }

  // the ghost of a lap: [z, x, z, x, ...] with z going forward and x in hundredths of the road's half width
  function cleanGhost(a, len) {
    if (!Array.isArray(a) || a.length < 20 || a.length > 800 || a.length % 2) return null;
    const out = [];
    let last = -1;
    for (let i = 0; i < a.length; i += 2) {
      const z = Math.round(+a[i]), x = Math.round(+a[i + 1]);
      if (!isFinite(z) || !isFinite(x) || z < last || z < 0 || z > len + 2000) return null;
      last = z;
      out.push(z, api.clamp(x, -200, 200));
    }
    return out;
  }

  // ---------- the room ----------
  api.room({
    enter: function (p) {
      const R = st.race;
      if (R) api.send(p, R.kind === 'c' ? cWatchMsg(R) : watchMsg(R));       // a race is on: watch until the next one
      else if (st.phase === 'table' && st.gp && st.gp.lastEnd) {             // between two races of a Grand Prix: the table
        const m = Object.assign({}, st.gp.lastEnd);
        m.gp = Object.assign({}, m.gp, { wait: Math.max(0, (st.gp.tableEnd || 0) - Date.now()) });
        m.late = true;
        api.send(p, m);
      }
      sendLobby();
    },
    leave: function (p) {
      delete st.ready[p.key]; delete st.votes[p.key]; delete st.picks[p.key];
      const R = st.race;
      if (st.gp) { const s = st.gp.seats.find(function (o) { return !o.bot && o.key === p.key; }); if (s) s.gone = true; }
      if (R) {
        const r = mine(R, p);
        if (r && !r.done) {                               // dropped from this race; the others carry on
          r.dropped = true;
          api.broadcast({ t: R.kind === 'c' ? 'race.cdrop' : 'race.drop', rid: r.rid }, here);
          if (R.kind === 'c') afterC(R); else after(R);
        }
      }
      if (!api.roomList(ID).length) { closeRace(); return; }
      if (st.phase === 'lobby') { sendLobby(); maybeStart(); }
      else if (st.phase === 'table') { sendLobby(); tableReady(); }
    }
  });
  function tableReady() { // everyone tapped Next: do not wait for the clock
    const list = api.roomList(ID);
    if (st.phase === 'table' && list.length && list.every(function (p) { return st.ready[p.key]; })) nextGP();
  }

  // ---------- messages from the tablets ----------
  api.on('vote', function (p, m) {
    if (p.room !== ID) return;
    const v = parseInt(m.track, 10);
    if (!(v >= 0 && v < GEN.length)) return;
    st.votes[p.key] = v;
    if (st.phase === 'lobby') sendLobby();
  });
  api.on('pick', function (p, m) { // the circuit a player would like
    if (p.room !== ID) return;
    const v = parseInt(m.c, 10);
    if (!(v >= 0 && v < CIRC.length)) return;
    st.picks[p.key] = v;
    if (st.phase === 'lobby') sendLobby();
  });
  api.on('mode', function (p, m) { // one way to play for the whole room: the last tap counts, and everyone gets ready again
    if (p.room !== ID || st.phase !== 'lobby' || MODES.indexOf(m.mode) < 0 || m.mode === st.mode) return;
    st.mode = m.mode; st.ready = {};
    savePref();
    sendLobby();
  });
  api.on('bots', function (p, m) { // how fast the robots are: 0 gentle, 1 normal, 2 fast
    const v = parseInt(m.lv, 10);
    if (p.room !== ID || st.phase !== 'lobby' || !(v >= 0 && v <= 2) || v === st.botLv) return;
    st.botLv = v;
    savePref();
    sendLobby();
  });
  api.on('opt', function (p, m) { // the player's own "Easy steering" switch
    if (p.room !== ID) return;
    const d = data(p);
    if (!d) return;
    d.easy = !!m.easy;
    api.saveSoon();
    api.send(p, lobbyMsg(p));
  });
  api.on('ready', function (p, m) {
    if (p.room !== ID) return;
    if (st.phase === 'table') { if (m.on) { st.ready[p.key] = true; tableReady(); } return; }
    if (st.phase !== 'lobby') return;
    if (m.on) st.ready[p.key] = true; else delete st.ready[p.key];
    sendLobby();
    maybeStart();
  });
  // ---- Sprint ----
  api.on('pos', function (p, m) {
    const R = st.race;
    if (!R || R.kind !== 's' || p.room !== ID) return;
    const r = mine(R, p);
    if (!r || r.done) return;
    const e = Date.now() - R.startAt, x = +m.x;
    if (!isFinite(x)) return;
    // a car cannot be further than full boost all the way would take it
    r.x = api.clamp(x, r.sx, Math.min(R.len + 400, Math.max(0, e) / 1000 * VMAX + 500));
    r.lane = api.clamp(parseInt(m.l, 10) || 0, 0, 3);
    r.f = (parseInt(m.f, 10) || 0) & 7;
  });
  api.on('finish', function (p, m) {
    const R = st.race;
    if (!R || R.kind !== 's' || st.phase !== 'race' || p.room !== ID) return;
    const r = mine(R, p);
    if (!r || r.done) return;
    const e = Date.now() - R.startAt;
    let ms = Math.round(+m.ms);
    if (!(ms > 0)) ms = e;
    ms = api.clamp(ms, e - 2500, e);                      // the tablet's own time, as long as it fits the server's clock
    if (ms < R.minMs || r.x < R.len * 0.97) {             // impossibly fast, or not at the line at all
      api.send(p, { t: 'race.nope' });
      return;
    }
    r.x = R.len;
    finishRacer(R, r, ms);
    reward(R, p, r, true);
    after(R);
  });
  // ---- circuits ----
  function myRacer(p) { // my car in the circuit race that is on, while it is still driving
    const R = st.race;
    if (!R || R.kind !== 'c' || p.room !== ID) return null;
    const r = mine(R, p);
    return r && !r.done ? r : null;
  }
  api.on('cp', function (p, m) { // where my car is: z along the road since the start line, x across it (-1 .. 1 is the road)
    const r = myRacer(p), R = st.race;
    if (!r) return;
    const e = Date.now() - R.startAt, z = +m.z, x = +m.x;
    if (!isFinite(z) || !isFinite(x)) return;
    // not further than the fastest possible car, and not past the next line before that lap has been accepted
    r.z = api.clamp(z, r.gz, Math.min((r.lap + 1) * R.len + 2000, r.gz + 800 + Math.max(0, e) / 1000 * VABS));
    r.x = api.clamp(x, -2, 2);
    r.f = (parseInt(m.f, 10) || 0) & 255;
  });
  api.on('lap', function (p, m) { // my car crossed the line: n = 0 at the start, then the laps done
    const r = myRacer(p), R = st.race;
    if (!r || st.phase !== 'race') return;
    const e = Date.now() - R.startAt, n = parseInt(m.n, 10);
    let ms = Math.round(+m.ms);
    if (!(ms > 0)) ms = e;
    ms = api.clamp(ms, Math.max(1, e - 2500), Math.max(1, e));      // the tablet's own time, as long as it fits the server's clock
    if (n === 0) { if (r.lap === 0 && !r.lapAt) r.lapAt = ms; return; }
    if (n !== r.lap + 1) return;
    const lap = ms - r.lapAt;
    if (lap < R.minLap || r.z < n * R.len - 3000) {                 // impossibly fast, or not at the line at all
      api.send(p, { t: 'race.nope' });
      return;
    }
    r.lap = n; r.lapAt = ms;
    if (!r.best || lap < r.best) r.best = lap;
    const d = data(p);
    let rec = false, ghost = false;
    if (d) {
      const c = (d.c[R.id] && typeof d.c[R.id] === 'object') ? d.c[R.id] : (d.c[R.id] = {});
      if (!(c.lap > 0) || lap < c.lap) { c.lap = lap; rec = true; r.newLap = true; }
      boardAdd(cboard(R.id).lap, p, lap);
      if (R.mode === 'trial' && m.ghost !== undefined) { // the drive of the best time-trial lap, to race against next time
        const g = cleanGhost(m.ghost, R.len), old = d.ghost[R.id];
        if (g && !(old && old.ms > 0 && old.ms <= lap)) { d.ghost[R.id] = { ms: lap, d: g }; ghost = true; }
      }
      api.saveSoon();
    }
    api.broadcast({ t: 'race.clap', rid: r.rid, n: n, ms: ms, lap: lap, rec: rec, ghost: ghost }, here);
    if (n >= LAPS) {
      r.z = LAPS * R.len;
      finishC(R, r, ms);
      rewardC(R, p, r, true);
      afterC(R);
    }
  });
  api.on('box', function (p, m) { // my car drove into an item box
    const r = myRacer(p), R = st.race;
    if (!r || st.phase !== 'race' || R.mode === 'trial') return;
    const i = parseInt(m.i, 10), now = Date.now();
    if (!(i >= 0 && i < R.lay.boxes.length) || r.item || now < r.boxAt || R.boxOff[i] > now) return;
    const d = fwd(mod(r.z, R.len), R.lay.boxes[i].z, R.len);
    if (d > 4000 && d < R.len - 4000) return;                       // nowhere near that box
    giveItem(R, r, i);
  });
  api.on('use', function (p) { // the Item button
    const r = myRacer(p);
    if (r && st.phase === 'race' && r.item) useItem(st.race, r);
  });
  api.on('hit', function (p, m) { // my car drove into a jelly: it is gone for everyone
    const r = myRacer(p), R = st.race;
    if (!r) return;
    const id = parseInt(m.id, 10), h = R.haz.find(function (o) { return o.id === id; });
    if (h) hazOff(R, h, r.rid);
  });

  // ---------- daily quests ----------
  api.addQuest({ type: 'race.finish', icon: '🏁', solo: true, tiers: [[2, 5], [3, 7]],
    en: 'Finish {n} races', zh: '完成 {n} 场赛车', py: 'wánchéng {n} chǎng sàichē', ms: 'Tamatkan {n} perlumbaan' });
  api.addQuest({ type: 'race.podium', icon: '🏆', solo: true, tiers: [[2, 6], [3, 8]],
    en: 'Finish in the top 3 in {n} races', zh: '在 {n} 场赛车中进入前三名', py: 'zài {n} chǎng sàichē zhōng jìnrù qián sān míng', ms: 'Dapat tempat 3 teratas dalam {n} perlumbaan' });
};

// for tests: the generators, to compare with the copies in the client file
module.exports.makeTrack = makeTrack;
module.exports.GEN = GEN;
module.exports.CIRC = CIRC;
module.exports.buildCircuit = buildCircuit;
module.exports.layoutCircuit = layoutCircuit;
module.exports.mapOfCircuit = mapOfCircuit;
module.exports.C = { SEG: SEG, LAPS: LAPS, CV0: CV0, ITEMS: ITEMS };
