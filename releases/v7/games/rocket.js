// Rocket Base: the family gets a rocket ready before the countdown ends (docs/GAME-MODULES.md).
// Every tablet has a different part to play, and the server only sends a tablet what its part may know:
//   Hands  the only one who may press the controls, but sees them as plain grey shapes   (station.pub)
//   Eyes   sees the colours, symbols, numbers and lights of the panel, cannot press       (station.eye)
//   Book   has the picture rules of this mission, cannot see the panel                    (station.page)
// A mission is 1 to 6 stations taken from 9 kinds, with new values every time. The answer of a station
// (station.sol) stays here: every press is checked on the server and nothing here trusts a tablet.
//
// Saved: profile.rocket = { done: { "<mission>": { m: medals, ms: best time, c: launches } }, launches, day, reps, daily, dailies }
//        save.rocket    = { board: { "<mission>": { ms, m, names, day } }, launches, rot, daily: { day, ms, m, names } }
'use strict';
module.exports = function (api) {
  const ID = api.id, env = process.env;
  function envNum(name, def) { const v = parseFloat(env[name]); return isFinite(v) ? v : def; }
  const BRIEF_MS = envNum('ROCKET_BRIEF_MS', 4500);       // the card that shows everybody their part
  const TIME_SCALE = envNum('ROCKET_TIME_SCALE', 1);      // tests only: shorter countdowns
  const STALE_MS = envNum('ROCKET_STALE_MS', 60000);      // a mission with nobody in the room is dropped after this long
  const LOCK_MS = envNum('ROCKET_LOCK_MS', 450);          // after a spark the panel takes no press for a moment
  const REP_CAP = 5;                                      // repeat launches a day that pay in full; after that 1 star
  const KINDS = ['order', 'hose', 'dial', 'switch', 'grid', 'cells', 'blink', 'cargo', 'wheels'];
  const FACETS = ['col', 'sym', 'num', 'lit'];            // what an Eyes can be given: colours, symbols, numbers, lights
  const FGROUP = { 2: [['col', 'lit'], ['sym', 'num']], 3: [['col', 'lit'], ['sym'], ['num']], 4: [['col'], ['sym'], ['num'], ['lit']] };
  const SPARK_S = [4, 5, 6];                              // seconds a spark costs, by destination
  const FIRST = [3, 4, 5];                                // bonus stars for the first launch of a mission, by destination
  // tests only: ROCKET_KINDS=order,hose fixes the kinds of the stations, ROCKET_LV=2 their level, ROCKET_QUIET=1/0 the quiet card
  const FORCE = String(env.ROCKET_KINDS || '').split(',').filter(function (k) { return KINDS.indexOf(k) >= 0; });
  const FORCE_LV = envNum('ROCKET_LV', 0);
  let forceAt = 0;

  // The campaign. k: the stations as kind + level; "?" is any kind the family has met by then. q: always a quiet mission.
  const MISSIONS = [
    { d: 0, t: 150, k: ['order1'] },
    { d: 0, t: 150, k: ['hose1'] },
    { d: 0, t: 180, k: ['dial1', 'order1'] },
    { d: 0, t: 180, k: ['switch1', 'hose1'] },
    { d: 0, t: 210, k: ['grid1', 'dial1', '?1'] },
    { d: 0, t: 180, k: ['?1', '?1', '?1'] },
    { d: 1, t: 210, k: ['cells1', '?1', '?2'] },
    { d: 1, t: 210, k: ['blink1', '?2', '?2'] },
    { d: 1, t: 250, k: ['cargo1', '?2', '?2', '?1'] },
    { d: 1, t: 250, k: ['wheels1', '?2', '?2', '?2'] },
    { d: 1, t: 230, k: ['?2', '?2', '?2', '?2'], q: 1 },
    { d: 1, t: 200, k: ['?2', '?2', '?2', '?2'] },
    { d: 2, t: 300, k: ['?3', '?2', '?2', '?2', '?2'] },
    { d: 2, t: 300, k: ['?3', '?3', '?2', '?2', '?2'], q: 1 },
    { d: 2, t: 300, k: ['?3', '?3', '?3', '?2', '?2'] },
    { d: 2, t: 300, k: ['?3', '?3', '?3', '?3', '?3'] },
    { d: 2, t: 360, k: ['?3', '?3', '?3', '?3', '?3', '?3'], q: 1 },
    { d: 2, t: 330, k: ['?3', '?3', '?3', '?3', '?3', '?3'] }
  ];
  const DAILY = { t: 260, k: ['?1', '?2', '?2', '?2'] };    // the mission of the day: made from the date, the same all day
  // the kinds known by each mission, and the kind a mission brings for the first time
  (function () {
    const known = [];
    MISSIONS.forEach(function (M) {
      M.k.forEach(function (s) { const kind = s.slice(0, -1); if (kind !== '?' && known.indexOf(kind) < 0) { known.push(kind); M.fresh = kind; } });
      M.pool = known.slice();
    });
  })();
  function payOf(stations) { return Math.round(2 + 1.6 * stations); }   // 1 station 4 stars ... 6 stations 12 stars

  let run = null;            // the mission everybody in the room shares, or null in the lobby
  let clock = null, briefTimer = null, staleTimer = null;
  let seats = [];            // keys in the order the players came in: the parts go round in this order
  const pref = {};           // key -> 'hands' | 'eyes' | 'book' (nothing: any part)
  const sigAt = {};          // key -> when that player last used the signal board
  let lastHands = null;      // who was Hands in the mission before

  // ---------- small helpers ----------
  function range(n) { const a = []; for (let i = 0; i < n; i++) a.push(i); return a; }
  function fill(n, v) { return range(n).map(function () { return v; }); }
  function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  function int(v) { const n = parseInt(v, 10); return isFinite(n) ? n : -1; }
  // random numbers: Math.random for the campaign, a seeded stream for the mission of the day
  function maker(f) {
    const R = {
      ri: function (a, b) { return a + Math.floor(f() * (b - a + 1)); },
      chance: function (p) { return f() < p; },
      pick: function (list) { return list[Math.floor(f() * list.length)]; },
      shuffle: function (list) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
      sample: function (k, n) { return R.shuffle(range(k)).slice(0, n); },                                              // n different numbers below k
      nums: function (n, lo, hi) { return R.shuffle(range(hi - lo + 1)).slice(0, n).map(function (v) { return v + lo; }); }   // n different numbers from lo to hi
    };
    return R;
  }
  function seeded(seed) {
    let a = seed >>> 0;
    return maker(function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; });
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ---------- saved data ----------
  function data(p) {
    const prof = api.prof(p);
    if (!prof) return null;
    const d = prof[ID] || (prof[ID] = {});
    if (!d.done || typeof d.done !== 'object') d.done = {};          // mission -> { m: medals, ms: best time used, c: launches }
    if (typeof d.launches !== 'number') d.launches = 0;
    if (d.day !== api.today()) { d.day = api.today(); d.reps = 0; }  // reps = repeat launches paid in full today
    if (typeof d.reps !== 'number') d.reps = 0;
    if (typeof d.daily !== 'string') d.daily = '';                    // the day the mission of the day last paid its bonus
    if (typeof d.dailies !== 'number') d.dailies = 0;
    return d;
  }
  function shared() {
    const s = api.save[ID] || (api.save[ID] = {});
    if (!s.board || typeof s.board !== 'object') s.board = {};       // mission -> { ms, m, names, day }: the family board
    if (typeof s.launches !== 'number') s.launches = 0;
    if (typeof s.rot !== 'number') s.rot = 0;                         // goes up with every mission, so the parts rotate
    if (!s.daily || s.daily.day !== api.today()) s.daily = { day: api.today(), ms: 0, m: 0, names: [] };
    return s;
  }

  // ---------- the mission book is made of picture tokens: colour, symbol, number, planet, sign, arrow, drops, a control ----------
  function C(i) { return { c: i }; }
  function S(i) { return { s: i }; }
  function N(v) { return { n: v }; }
  function P(i) { return { p: i }; }
  function O(s) { return { o: s }; }
  function A(d) { return { a: d }; }     // arrow: 0 up, 1 right, 2 down, 3 left
  function D(n) { return { d: n }; }     // n drops to count
  function K(s) { return { k: s }; }     // a picture of a control

  // ---------- the nine kinds of station ----------
  // Each maker returns { pub, eye, page, sol }:
  //   pub   what Hands sees too: how many controls there are and how they stand. Never a colour, symbol, number or light.
  //   eye   what Eyes sees, in up to four parts (col, sym, num, lit) that can be dealt to different players
  //   page  the chapter of the mission book: { head, rows } of picture tokens
  //   sol   the answer, kept here
  const GEN = {
    // launch buttons: press them in the order the book gives
    order: function (lv, R) {
      if (lv <= 1) {
        const n = R.ri(3, 4), syms = R.sample(6, n), sol = R.shuffle(range(n));
        return { pub: { n: n, down: fill(n, 0) }, eye: { sym: { syms: syms } }, sol: sol, step: 0,
          page: { rows: sol.map(function (b, k) { return [N(k + 1), A(1), S(syms[b])]; }) } };
      }
      // harder: first by colour, then by number, small to big or big to small
      const n = lv === 2 ? 5 : 6, nc = lv === 2 ? 2 : 3, pal = R.sample(6, nc);
      const cols = R.shuffle(range(n).map(function (i) { return pal[i % nc]; })), nums = R.nums(n, 1, 9), rank = R.shuffle(pal), desc = R.chance(0.5);
      const sol = range(n).sort(function (a, b) { return (rank.indexOf(cols[a]) - rank.indexOf(cols[b])) || (desc ? nums[b] - nums[a] : nums[a] - nums[b]); });
      const first = [];
      rank.forEach(function (c, i) { if (i) first.push(A(1)); first.push(C(c)); });
      return { pub: { n: n, down: fill(n, 0) }, eye: { col: { cols: cols }, num: { nums: nums } }, sol: sol, step: 0,
        page: { rows: [first, desc ? [N(9), A(1), N(5), A(1), N(1)] : [N(1), A(1), N(5), A(1), N(9)]] } };
    },
    // fuel hoses: count the drops of each colour; the book says which socket the tank with that many drops feeds
    hose: function (lv, R) {
      const n = lv >= 3 ? 4 : 3, tanks = R.sample(6, n), socks = R.sample(6, n), sol = R.shuffle(range(n));
      const counts = R.nums(n, lv === 1 ? 1 : 2, lv === 1 ? 4 : lv === 2 ? 6 : 7);
      let drops = [];
      tanks.forEach(function (c, i) { for (let k = 0; k < counts[i]; k++) drops.push(c); });
      drops = R.shuffle(drops);
      return { pub: { n: n, link: fill(n, -1), sel: -1, nd: drops.length }, eye: { col: { tanks: tanks, drops: drops }, sym: { socks: socks } }, sol: sol,
        page: { rows: R.shuffle(range(n)).map(function (i) { return [D(counts[i]), N(counts[i]), A(1), S(socks[sol[i]])]; }) } };
    },
    // cargo dial: every loaded thing has a number in the book; the dial must show their sum
    dial: function (lv, R) {
      const nt = lv === 1 ? 4 : lv === 2 ? 5 : 6, syms = R.sample(6, nt), vals = R.nums(nt, 1, lv === 1 ? 5 : lv === 2 ? 6 : 9);
      const ni = lv === 1 ? 2 : lv === 2 ? 3 : R.ri(3, 4), max = lv === 1 ? 12 : lv === 2 ? 20 : 40;
      const items = lv === 1 ? R.sample(nt, ni) : range(ni).map(function () { return R.ri(0, nt - 1); });
      const target = sum(items.map(function (i) { return vals[i]; }));
      let val;
      do { val = api.clamp(target + R.ri(-5, 5), 0, max); } while (val === target);
      return { pub: { n: ni }, eye: { sym: { items: items.map(function (i) { return syms[i]; }) }, num: { val: val, max: max } }, sol: target,
        page: { head: [K('box'), O('+'), K('box'), O('='), K('dial')], rows: range(nt).map(function (i) { return [S(syms[i]), O('='), N(vals[i])]; }) } };
    },
    // planet switches: the book says which switches go up for the planet on the screen (by lamp colour, later odd / even / bigger / smaller)
    switch: function (lv, R) {
      const n = lv === 1 ? 4 : lv === 2 ? 5 : 6, np = lv === 1 ? 3 : 4, planets = R.sample(6, np);
      let rows, sol, eye;
      if (lv < 3) {
        const pal = R.sample(6, 3), lamps = R.shuffle(range(n).map(function (i) { return pal[i % 3]; }));
        const sets = R.shuffle([[0], [1], [2], [0, 1], [0, 2], [1, 2]]).slice(0, np).map(function (s) { return s.map(function (i) { return pal[i]; }); });
        rows = planets.map(function (p, k) { return [P(p), A(1)].concat(sets[k].map(C), [A(0)]); });
        sol = lamps.map(function (c) { return sets[0].indexOf(c) >= 0 ? 1 : 0; });
        eye = { sym: { planet: planets[0] }, col: { lamps: lamps } };
      } else {
        let nums, rules, pivot;
        const test = function (rule, v) { return rule === 'odd' ? v % 2 === 1 : rule === 'even' ? v % 2 === 0 : rule === 'gt' ? v > pivot : v < pivot; };
        do {
          nums = R.nums(n, 1, 9); rules = R.shuffle(['odd', 'even', 'gt', 'lt']); pivot = R.ri(3, 7);
          sol = nums.map(function (v) { return test(rules[0], v) ? 1 : 0; });
        } while (sum(sol) < 1 || sum(sol) >= n);
        rows = planets.map(function (p, k) {
          const r = rules[k];
          return [P(p), A(1)].concat(r === 'odd' ? [N(1), N(3), N(5)] : r === 'even' ? [N(2), N(4), N(6)] : [O(r === 'gt' ? '>' : '<'), N(pivot)], [A(0)]);
        });
        eye = { sym: { planet: planets[0] }, num: { nums: nums } };
      }
      return { pub: { n: n, up: fill(n, 0) }, eye: eye, sol: sol, page: { rows: R.shuffle(rows) } };
    },
    // star map: a number on the screen, the book turns it into a column symbol and a row colour
    grid: function (lv, R) {
      const cols = lv === 3 ? 5 : 4, rows = lv === 1 ? 3 : 4, need = lv === 1 ? 2 : 3, nr = lv === 1 ? 4 : lv === 2 ? 5 : 6;
      const colS = R.sample(6, cols), rowC = R.sample(6, rows), cells = R.sample(cols * rows, nr);
      const codes = lv === 3 ? R.nums(nr, 4, 14) : R.nums(nr, 1, 9);
      // level 3 shows the number as a little sum
      const shown = codes.slice(0, need).map(function (v) { if (lv < 3) return [v]; const a = R.ri(Math.max(1, v - 9), Math.min(9, v - 1)); return [a, v - a]; });
      const order = range(nr).sort(function (a, b) { return codes[a] - codes[b]; });
      return { pub: { nx: cols, ny: rows, need: need, marks: [] }, eye: { sym: { colS: colS }, col: { rowC: rowC }, num: { code: shown[0] } },
        sol: cells.slice(0, need), step: 0, x: { shown: shown },
        page: { rows: order.map(function (i) { return [N(codes[i]), A(1), S(colS[cells[i] % cols]), C(rowC[Math.floor(cells[i] / cols)])]; }) } };
    },
    // battery cells: switch on cells that add up to the number the book gives for the sign on the box
    cells: function (lv, R) {
      const n = lv === 1 ? 4 : lv === 2 ? 5 : 6, k = lv === 1 ? 2 : lv === 2 ? R.ri(2, 3) : 3, nt = lv === 1 ? 3 : lv === 2 ? 4 : 5;
      const nums = R.nums(n, 1, lv === 1 ? 5 : 9), target = sum(R.sample(n, k).map(function (i) { return nums[i]; })), syms = R.sample(6, nt);
      const others = R.shuffle(range(13).map(function (i) { return target - 6 + i; }).filter(function (v) { return v >= 2 && v !== target; })).slice(0, nt - 1);
      return { pub: { n: n, on: fill(n, 0) }, eye: { num: { nums: nums }, sym: { tag: syms[0] } }, sol: target,
        page: { head: [K('cell'), O('+'), K('cell'), O('='), O('?')], rows: R.shuffle(syms.map(function (s, i) { return [S(s), O('='), N(i ? others[i - 1] : target)]; })) } };
    },
    // signal lamp: the lamp blinks colours, the book turns every colour into the key to press
    blink: function (lv, R) {
      const n = lv === 1 ? 4 : lv === 2 ? 5 : 6, k = lv === 1 ? 3 : lv === 2 ? 4 : 5, pal = R.sample(6, k), keys = R.sample(6, n), at = R.sample(n, k);
      let seq;
      const bad = function (q) { return q.every(function (c) { return c === q[0]; }) || q.some(function (c, i) { return i > 1 && c === q[i - 1] && c === q[i - 2]; }); };
      do { seq = range(k).map(function () { return R.pick(pal); }); } while (bad(seq));
      return { pub: { n: n, len: k, got: 0 }, eye: { lit: { seq: seq }, sym: { keys: keys } }, sol: seq.map(function (c) { return at[pal.indexOf(c)]; }),
        page: { rows: R.shuffle(pal.map(function (c, i) { return [C(c), A(1), S(keys[at[i]])]; })) } };
    },
    // cargo scale: crates on the left, barrels on the right, the book says what each weighs: which side is heavier?
    cargo: function (lv, R) {
      const k = lv === 3 ? 4 : 3, hi = lv === 1 ? 5 : lv === 2 ? 6 : 9, syms = R.sample(6, k), cols = R.sample(6, k), ws = R.nums(k, 1, hi), wc = R.nums(k, 1, hi);
      const st = { pub: { round: 0, rounds: lv === 1 ? 2 : 3, nl: 0, nr: 0 }, eye: { sym: { crates: [] }, col: { barrels: [] } }, sol: 1,
        x: { syms: syms, cols: cols, ws: ws, wc: wc, lo: lv === 1 ? 1 : 2, hi: lv === 1 ? 2 : 3 },
        page: { rows: syms.map(function (s, i) { return [S(s), O('='), N(ws[i])]; }).concat(cols.map(function (c, i) { return [C(c), O('='), N(wc[i])]; })) } };
      loadCargo(st, R);
      return st;
    },
    // code wheels: turn every wheel until the symbol the book gives for its colour is at the mark
    wheels: function (lv, R) {
      const n = lv === 3 ? 4 : 3, m = lv === 1 ? 4 : lv === 2 ? 5 : 6, rims = R.sample(6, n);
      const rings = range(n).map(function () { return R.sample(6, m); }), pos = range(n).map(function () { return R.ri(0, m - 1); });
      const sol = range(n).map(function (i) { let t; do { t = R.ri(0, m - 1); } while (t === pos[i]); return rings[i][t]; });
      const rows = rims.map(function (c, i) { return [C(c), A(1), S(sol[i])]; });
      R.shuffle(range(6).filter(function (c) { return rims.indexOf(c) < 0; })).slice(0, lv === 1 ? 1 : 2).forEach(function (c) { rows.push([C(c), A(1), S(R.ri(0, 5))]); });   // colours that are not on the panel
      return { pub: { n: n, m: m }, eye: { col: { rims: rims }, sym: { rings: rings, pos: pos } }, sol: sol, page: { head: [K('wheel'), A(0)], rows: R.shuffle(rows) } };
    }
  };
  // new crates and barrels on the cargo scale; about one time in four both sides weigh the same
  function loadCargo(st, R) {
    const x = st.x, k = x.syms.length, same = R.chance(0.27);
    let left, right, a, b;
    for (let tries = 0; tries < 60; tries++) {
      left = range(R.ri(x.lo, x.hi)).map(function () { return R.ri(0, k - 1); });
      right = range(R.ri(x.lo, x.hi)).map(function () { return R.ri(0, k - 1); });
      a = sum(left.map(function (i) { return x.ws[i]; })); b = sum(right.map(function (i) { return x.wc[i]; }));
      if ((a === b) === same) break;
    }
    st.eye.sym.crates = left.map(function (i) { return x.syms[i]; });
    st.eye.col.barrels = right.map(function (i) { return x.cols[i]; });
    st.pub.nl = left.length; st.pub.nr = right.length;
    st.sol = a > b ? 0 : a === b ? 1 : 2;      // 0 the left side is heavier, 1 the same, 2 the right side
  }

  // ---------- pressing a control ----------
  // Each returns null (nothing happened) or { ok: a right step, done: the station is ready, wrong: a spark }
  const ACT = {
    order: function (st, a, i) {
      const pub = st.pub;
      if (a !== 'b' || i < 0 || i >= pub.n || pub.down[i]) return null;
      if (st.sol[st.step] !== i) return { wrong: 1 };
      pub.down[i] = 1; st.step++;
      return { ok: 1, done: st.step >= pub.n };
    },
    hose: function (st, a, i) {
      const pub = st.pub;
      if (i < 0 || i >= pub.n) return null;
      if (a === 'tk') { if (pub.link[i] >= 0) return null; pub.sel = pub.sel === i ? -1 : i; return {}; }
      if (a !== 'so' || pub.sel < 0 || pub.link.indexOf(i) >= 0) return null;
      const t = pub.sel;
      pub.sel = -1;
      if (st.sol[t] !== i) return { wrong: 1 };
      pub.link[t] = i;
      return { ok: 1, done: pub.link.every(function (v) { return v >= 0; }) };
    },
    dial: function (st, a) {
      const e = st.eye.num;
      if (a === 'up' || a === 'dn') { e.val = api.clamp(e.val + (a === 'up' ? 1 : -1), 0, e.max); return {}; }
      if (a === 'set') return e.val === st.sol ? { ok: 1, done: true } : { wrong: 1 };
      return null;
    },
    switch: function (st, a, i) {
      const pub = st.pub;
      if (a === 'sw') { if (i < 0 || i >= pub.n) return null; pub.up[i] = pub.up[i] ? 0 : 1; return {}; }
      if (a === 'set') return pub.up.every(function (v, k) { return v === st.sol[k]; }) ? { ok: 1, done: true } : { wrong: 1 };
      return null;
    },
    grid: function (st, a, i) {
      const pub = st.pub;
      if (a !== 'c' || i < 0 || i >= pub.nx * pub.ny || pub.marks.indexOf(i) >= 0) return null;
      if (st.sol[st.step] !== i) return { wrong: 1 };
      pub.marks.push(i); st.step++;
      if (st.step < pub.need) st.eye.num.code = st.x.shown[st.step];     // the next number comes on the screen
      return { ok: 1, done: st.step >= pub.need };
    },
    cells: function (st, a, i) {
      const pub = st.pub;
      if (a === 'ce') { if (i < 0 || i >= pub.n) return null; pub.on[i] = pub.on[i] ? 0 : 1; return {}; }
      if (a === 'set') return sum(st.eye.num.nums.filter(function (v, k) { return pub.on[k]; })) === st.sol ? { ok: 1, done: true } : { wrong: 1 };
      return null;
    },
    blink: function (st, a, i) {
      const pub = st.pub;
      if (a !== 'k' || i < 0 || i >= pub.n) return null;
      if (st.sol[pub.got] !== i) return { wrong: 1 };
      pub.got++;
      return { ok: 1, done: pub.got >= pub.len };
    },
    cargo: function (st, a, i, R) {
      const pub = st.pub;
      if (a !== 'pk' || i < 0 || i > 2) return null;
      const right = st.sol === i;
      if (right) pub.round++;
      if (pub.round < pub.rounds) loadCargo(st, R);     // a wrong answer also brings a new load, so guessing does not help
      return right ? { ok: 1, done: pub.round >= pub.rounds } : { wrong: 1 };
    },
    wheels: function (st, a, i) {
      const pub = st.pub, e = st.eye.sym;
      if (a === 'w') { if (i < 0 || i >= pub.n) return null; e.pos[i] = (e.pos[i] + 1) % pub.m; return {}; }
      if (a === 'set') return e.pos.every(function (v, k) { return e.rings[k][v] === st.sol[k]; }) ? { ok: 1, done: true } : { wrong: 1 };
      return null;
    }
  };

  // ---------- who is in the room, and who has which part ----------
  function here() {   // the players in the room, in the order they first came in
    const list = api.roomList(ID);
    list.forEach(function (p) { if (seats.indexOf(p.key) < 0) seats.push(p.key); });
    list.sort(function (a, b) { return seats.indexOf(a.key) - seats.indexOf(b.key); });
    return list;
  }
  function crewHere() { return here().filter(function (p) { return run.crew.indexOf(p.key) >= 0; }); }
  // Who is Hands, who is Eyes, who is Book. `rot` goes up every mission, so with nobody choosing everyone gets every part.
  // `prev` and `hands` are the parts of this mission so far: when somebody comes or goes the others keep theirs where they can.
  function assign(keys, rot, prev, hands) {
    const roles = {}, n = keys.length;
    if (!n) return { roles: roles, hands: null };
    const off = rot % n, order = keys.slice(off).concat(keys.slice(0, off));
    if (order.indexOf(hands) < 0) {
      const want = order.filter(function (k) { return pref[k] === 'hands'; }), any = order.filter(function (k) { return !pref[k]; });
      const pool = want.length ? want : any.length ? any : order;
      hands = pool.length > 1 && pool[0] === lastHands ? pool[1] : pool[0];     // never Hands twice in a row when somebody else could be
    }
    const at = order.indexOf(hands), others = order.slice(at + 1).concat(order.slice(0, at)), o = others.length;
    roles[hands] = { H: 1, E: o ? 0 : 1, B: o ? 0 : 1 };          // alone: training, everything on one tablet
    if (o === 1) roles[others[0]] = { H: 0, E: 1, B: 1 };          // two players: the other one is Eyes and Book
    if (o >= 2) {
      const E = [], B = [], rest = [];
      others.forEach(function (k) {
        const was = prev && prev[k];
        if (was && !was.H && was.E !== was.B) (was.E ? E : B).push(k);
        else if (!was && pref[k] === 'eyes') E.push(k);
        else if (!was && pref[k] === 'book') B.push(k);
        else rest.push(k);
      });
      rest.forEach(function (k) { (E.length < Math.ceil(o / 2) ? E : B).push(k); });
      if (!E.length) E.push(B.pop());
      if (!B.length) B.push(E.pop());
      E.forEach(function (k) { roles[k] = { H: 0, E: 1, B: 0 }; });
      B.forEach(function (k) { roles[k] = { H: 0, E: 0, B: 1 }; });
    }
    return { roles: roles, hands: hands };
  }
  // Deals the parts of the running mission to the crew that is in the room right now. Called again whenever somebody
  // comes or goes, so nothing is ever stuck with a player who left.
  function deal() {
    if (!run) return;
    const keys = crewHere().map(function (p) { return p.key; }), a = assign(keys, run.rot, run.roles, run.hands), roles = a.roles;
    run.roles = roles; run.hands = a.hands;
    const eyes = keys.filter(function (k) { return roles[k].E; }), books = keys.filter(function (k) { return roles[k].B; });
    if (eyes.length > 1) {      // several Eyes: one sees only the colours, another only the symbols ...
      const used = {};
      run.st.forEach(function (st) { Object.keys(st.eye).forEach(function (f) { used[f] = 1; }); });
      const groups = FGROUP[Math.min(4, eyes.length)].map(function (g) { return g.filter(function (f) { return used[f]; }); }).filter(function (g) { return g.length; });
      eyes.forEach(function (k, i) { roles[k].fac = groups[(i + run.rot) % groups.length]; });
    }
    const b = books.length, s = run.st.length;
    books.forEach(function (k) { roles[k].leaves = []; });
    if (b && b <= s) run.st.forEach(function (st, j) { roles[books[(j + run.rot) % b]].leaves.push({ st: j, rows: null }); });   // several Books: by chapter
    else if (b) {               // more Books than chapters: the lines of every chapter are shared out
      run.st.forEach(function (st, j) {
        const per = books.map(function () { return []; });
        st.page.rows.forEach(function (row, i) { per[(i + j + run.rot) % b].push(i); });
        per.forEach(function (rows, bi) { if (rows.length) roles[books[bi]].leaves.push({ st: j, rows: rows }); });
      });
      books.forEach(function (k, bi) { if (!roles[k].leaves.length) roles[k].leaves.push({ st: bi % s, rows: null }); });
    }
  }
  function roleCode(r) { return r ? (r.H ? 'H' : '') + (r.E ? 'E' : '') + (r.B ? 'B' : '') : 'W'; }   // W: came in later, watches

  // ---------- the countdown ----------
  function timeLeft() { return run.ticking ? Math.max(0, run.endsAt - Date.now()) : run.left; }
  function tick(on) {   // starts or stops the countdown (it stands still while nobody is in the room)
    clearTimeout(clock); clock = null;
    if (!run || run.phase !== 'play') return;
    if (on && !run.ticking) { run.endsAt = Date.now() + run.left; run.ticking = true; }
    if (!on && run.ticking) { run.left = timeLeft(); run.ticking = false; }
    if (run.ticking) clock = setTimeout(timeUp, Math.max(0, run.endsAt - Date.now()) + 15);
  }
  function timeUp() {
    clearTimeout(clock); clock = null;
    if (!run || run.phase !== 'play') return;
    if (timeLeft() > 0) { tick(true); return; }
    // out of time: the launch is postponed, and the family can try again at once
    run.ticking = false; run.left = 0; run.phase = 'fail';
    run.res = { ok: 0, done: run.st.filter(function (st) { return st.done; }).length, of: run.st.length, sparks: run.sparks };
    sendAll();
  }

  // ---------- a mission ----------
  function openSet(list) {   // a mission can be played if anyone in the room has launched the one before it
    const open = { 1: 1 };
    list.forEach(function (p) {
      const d = data(p);
      if (d) Object.keys(d.done).forEach(function (k) { const n = int(k); if (n >= 1 && n <= MISSIONS.length) { open[n] = 1; if (n < MISSIONS.length) open[n + 1] = 1; } });
    });
    return open;
  }
  function build(spec, pool, lvUp, R) {
    const used = {};
    spec.forEach(function (s) { if (s[0] !== '?') used[s.slice(0, -1)] = 1; });
    return spec.map(function (s) {
      let kind = s.slice(0, -1), lv = parseInt(s.slice(-1), 10) + (lvUp || 0);
      if (kind === '?') {
        let free = pool.filter(function (k) { return !used[k]; });
        if (!free.length) free = pool;
        kind = R.pick(free); used[kind] = 1;
      }
      if (FORCE.length) kind = FORCE[forceAt++ % FORCE.length];
      if (FORCE_LV) lv = FORCE_LV;
      const st = GEN[kind](api.clamp(lv, 1, 3), R);
      st.kind = kind; st.lv = api.clamp(lv, 1, 3); st.done = 0;
      return st;
    });
  }
  function endRun() {
    clearTimeout(clock); clearTimeout(briefTimer); clearTimeout(staleTimer);
    clock = briefTimer = staleTimer = null; run = null;
  }
  function start(p, which) {
    const list = here(), s = shared(), day = which === 'day';
    let M, R, d;
    if (!list.length) return;
    if (day) { const seed = hash(ID + api.today()); R = seeded(seed); M = DAILY; d = seed % 3; }
    else {
      if (which < 1 || which > MISSIONS.length || !openSet(list)[which]) { api.send(p, { t: ID + '.no' }); return; }
      M = MISSIONS[which - 1]; R = maker(Math.random); d = M.d;
    }
    endRun();
    s.rot++;
    const st = build(M.k, day ? KINDS : M.pool, 0, R), train = list.length === 1, base = Math.max(1000, Math.round(M.t * 1000 * TIME_SCALE));
    run = { n: day ? 'day' : which, d: d, day: day ? 1 : 0, train: train, R: R, st: st, phase: 'brief', briefAt: Date.now(),
      base: base, total: base * (train ? 2 : 1), left: base * (train ? 2 : 1), ticking: false, endsAt: 0,
      sparks: 0, cost: SPARK_S[d], focus: 0, crew: list.map(function (o) { return o.key; }), roles: {}, hands: null, rot: s.rot,
      quiet: '', lockUntil: 0, res: null, emptyAt: 0 };
    deal();
    lastHands = run.hands;
    // a quiet mission: one part may only use the signal board, not their voice (the family keeps to it themselves)
    const luck = day ? [R.chance(0.34), R.chance(0.5)] : [M.q || (which >= 9 && Math.random() < 0.2), Math.random() < 0.5];
    if (!train && (env.ROCKET_QUIET === '1' || (env.ROCKET_QUIET !== '0' && luck[0]))) run.quiet = list.length === 2 || luck[1] ? 'E' : 'B';
    api.saveSoon();
    briefTimer = setTimeout(beginPlay, BRIEF_MS);
    sendAll();
  }
  function beginPlay() {
    briefTimer = null;
    if (!run || run.phase !== 'brief') return;
    run.phase = 'play';
    if (crewHere().length) tick(true);
    sendAll();
  }
  // All stations are ready in time: lift-off. Medals from the time used, best times, the family board, the stars.
  function launch() {
    tick(false);
    const used = Math.max(0, run.total - run.left), f = used / run.base, medals = f <= 0.5 ? 3 : f <= 0.75 ? 2 : 1;
    const s = shared(), key = String(run.n), today = api.today(), base = payOf(run.st.length);
    const list = crewHere().filter(function (p) { return data(p); });
    const res = { ok: 1, used: used, medals: medals, sparks: run.sparks, rec: 0, pay: {}, stars: {} };
    list.forEach(function (p) {
      const d = data(p), old = d.done[key], first = run.day ? d.daily !== today : !old, best = !old || !(old.ms > 0) || used < old.ms;
      const capped = !first && d.reps >= REP_CAP;             // the daily cap on repeats
      let parts;
      if (capped) parts = [1];
      else {
        parts = run.train ? [Math.ceil((base + medals - 1) / 2)] : [base].concat(medals > 1 ? [medals - 1] : [], run.quiet ? [2] : []);
        if (first) parts.push(run.train ? 2 : run.day ? 6 : FIRST[run.d]);
        else d.reps++;
      }
      d.done[key] = { m: Math.max(medals, old ? old.m || 0 : 0), ms: best ? used : old.ms, c: (old ? old.c || 0 : 0) + 1 };
      if (run.day) { d.daily = today; d.dailies++; }
      d.launches++;
      res.pay[p.key] = { n: sum(parts), parts: parts, first: first ? 1 : 0, best: best ? 1 : 0, cap: capped ? 1 : 0 };
      res.stars[p.id] = sum(parts);
      api.addStars(p, sum(parts));
      api.questEvent(p, 'rocket.launch');
      if (list.length > 1) api.questEvent(p, 'rocket.team');
    });
    if (list.length) {
      const names = list.map(function (p) { return p.name; });
      s.launches++;
      if (run.day) { if (!(s.daily.ms > 0) || used < s.daily.ms) { s.daily = { day: today, ms: used, m: medals, names: names }; res.rec = 1; } }
      else if (!s.board[key] || !(s.board[key].ms > 0) || used < s.board[key].ms) { s.board[key] = { ms: used, m: medals, names: names, day: today }; res.rec = 1; }
    }
    run.phase = 'launch'; run.res = res;
    api.saveSoon();
    sendAll();
  }

  // ---------- what one tablet is told ----------
  function lobbyInfo(p, list) {
    const d = data(p), s = shared(), open = openSet(list);
    return {
      // per mission: destination, stations, seconds, stars, first-launch bonus, quiet card, the new kind
      meta: MISSIONS.map(function (M) { return [M.d, M.k.length, M.t, payOf(M.k.length), FIRST[M.d], M.q ? 1 : 0, M.fresh || '']; }),
      // per mission: open, my medals, my best time, the family's best time
      list: MISSIONS.map(function (M, i) { const n = i + 1, mine = d && d.done[n], fam = s.board[n]; return [open[n] ? 1 : 0, mine ? mine.m || 0 : 0, mine ? mine.ms || 0 : 0, fam ? fam.ms || 0 : 0]; }),
      board: Object.keys(s.board).map(function (k) { const b = s.board[k]; return { n: int(k), ms: b.ms, m: b.m, names: b.names }; }).filter(function (b) { return b.n >= 1; }),
      day: { ns: DAILY.k.length, t: DAILY.t, pay: payOf(DAILY.k.length), first: 6, got: d && d.daily === api.today() ? 1 : 0, ms: s.daily.ms, m: s.daily.m, names: s.daily.names },
      launches: s.launches, mine: d ? d.launches : 0, reps: d ? Math.max(0, REP_CAP - d.reps) : 0, cap: REP_CAP
    };
  }
  function stateFor(p, list) {
    const preview = run ? null : assign(list.map(function (o) { return o.key; }), shared().rot + 1, null, null).roles;
    const m = { t: ID + '.state', phase: run ? run.phase : 'lobby', pref: pref[p.key] || '' };
    m.who = list.map(function (o) {
      const r = run ? run.roles[o.key] : preview[o.key];
      return { id: o.id, r: roleCode(r), f: r && r.fac ? r.fac.map(function (f) { return f[0]; }).join('') : '', ch: r && r.leaves ? r.leaves.map(function (l) { return l.st; }) : [], pref: pref[o.key] || '' };
    });
    if (!run || run.phase === 'launch' || run.phase === 'fail') m.lobby = lobbyInfo(p, list);
    if (!run) return m;
    const r = run.roles[p.key], play = run.phase === 'play';
    m.mis = { n: run.n, d: run.d, day: run.day, train: run.train ? 1 : 0, total: run.total, base: run.base, cost: run.cost, quiet: run.quiet };
    m.left = timeLeft(); m.run = run.ticking ? 1 : 0; m.sparks = run.sparks; m.focus = run.focus;
    m.me = { H: r && r.H ? 1 : 0, E: r && r.E ? 1 : 0, B: r && r.B ? 1 : 0, W: r ? 0 : 1, fac: r && r.fac ? r.fac : null };
    if (run.phase === 'brief') m.brief = Math.max(0, BRIEF_MS - (Date.now() - run.briefAt));
    // The stations. Only while the countdown runs, and each tablet only its own part:
    //   Book alone: nothing of the panel.  Hands and watchers: pub.  Eyes: pub and the parts of eye dealt to them.
    m.st = run.st.map(function (st) {
      const v = { kind: st.kind, lv: st.lv, done: st.done };
      if (!play || (r && !r.H && !r.E)) return v;
      v.pub = st.pub;
      if (r && r.E) {
        v.eye = {};
        (r.fac || FACETS).forEach(function (f) { if (st.eye[f]) Object.keys(st.eye[f]).forEach(function (k) { v.eye[k] = st.eye[f][k]; }); });
      }
      return v;
    });
    if (play && r && r.B) {
      m.pages = r.leaves.map(function (l) {
        const st = run.st[l.st], pg = st.page;
        return { st: l.st, kind: st.kind, head: pg.head || null, rows: l.rows ? l.rows.map(function (i) { return pg.rows[i]; }) : pg.rows, part: l.rows ? 1 : 0 };
      });
    }
    if (run.res) {
      const res = run.res;
      m.res = res.ok ? { ok: 1, used: res.used, medals: res.medals, sparks: res.sparks, rec: res.rec, stars: res.stars, mine: res.pay[p.key] || null, next: !run.day && run.n < MISSIONS.length ? run.n + 1 : 0 } : res;
    }
    return m;
  }
  function sendAll() { const list = here(); list.forEach(function (p) { api.send(p, stateFor(p, list)); }); }

  // ---------- the room ----------
  api.room({
    enter: function (p) {
      clearTimeout(staleTimer); staleTimer = null;
      const list = here();
      if (run && (run.phase === 'play' || run.phase === 'brief')) {
        run.emptyAt = 0;
        if (!crewHere().length) run.crew = list.map(function (o) { return o.key; });   // nobody of the crew is left: whoever is here takes over
        deal();                                  // a crew member who lost the connection gets a part again; anyone else watches
        if (run.phase === 'play') tick(true);
      } else if (run && list.length <= 1) endRun();   // an old result with nobody left to look at it
      sendAll();
    },
    leave: function (p) {   // also called when a tablet loses its connection: the part of that player goes to the others at once
      const list = here();
      delete sigAt[p.key];
      if (!list.length) {
        seats = [];
        if (!run) return;
        if (run.phase !== 'play') { endRun(); return; }
        tick(false);
        run.emptyAt = Date.now();
        staleTimer = setTimeout(function () { staleTimer = null; if (run && !api.roomList(ID).length) endRun(); }, STALE_MS);
        return;
      }
      if (run && (run.phase === 'play' || run.phase === 'brief')) {
        if (!crewHere().length) run.crew = list.map(function (o) { return o.key; });
        deal();
      }
      sendAll();
    }
  });

  api.on('pick', function (p, m) {    // the part a player would like in the next mission
    if (p.room !== ID) return;
    const r = String(m.role || '');
    if (r === 'hands' || r === 'eyes' || r === 'book') pref[p.key] = r; else delete pref[p.key];
    sendAll();
  });
  api.on('start', function (p, m) {
    if (p.room !== ID || (run && (run.phase === 'brief' || run.phase === 'play'))) return;
    start(p, m.m === 'day' ? 'day' : int(m.m));
  });
  api.on('lobby', function (p) {      // from the result back to the list of missions
    if (p.room !== ID || !run || run.phase === 'brief' || run.phase === 'play') return;
    endRun();
    sendAll();
  });
  api.on('stop', function (p) {
    if (p.room !== ID || !run || (run.phase !== 'brief' && run.phase !== 'play') || !run.roles[p.key]) return;   // somebody who only watches cannot stop it
    endRun();
    api.toast(p.name + ' stopped the countdown.', function (o) { return o.room === ID && o.id !== p.id; });
    sendAll();
  });
  api.on('focus', function (p, m) {   // Hands turns to another station
    if (p.room !== ID || !run || run.phase !== 'play' || run.hands !== p.key) return;
    const i = int(m.i);
    if (i < 0 || i >= run.st.length || i === run.focus) return;
    run.focus = i;
    sendAll();
  });
  api.on('act', function (p, m) {     // Hands presses something on the station in front of them
    if (p.room !== ID || !run || run.phase !== 'play' || run.hands !== p.key) return;
    const idx = run.focus, st = run.st[idx], a = String(m.a || '').slice(0, 4), i = int(m.i), now = Date.now();
    if (!st || st.done || now < run.lockUntil || !run.ticking) return;
    const res = ACT[st.kind](st, a, i, run.R);
    if (!res) return;
    const at = a + (i >= 0 ? i : '');
    if (res.wrong) {                  // a spark: it costs some seconds, and nothing worse
      run.sparks++;
      run.endsAt -= run.cost * 1000;
      run.lockUntil = now + LOCK_MS;
      api.broadcast({ t: ID + '.spark', id: p.id, st: idx, at: at, cost: run.cost }, api.inRoom(ID));
      if (timeLeft() <= 0) { timeUp(); return; }
      tick(true);
      sendAll();
      return;
    }
    api.broadcast({ t: ID + '.touch', id: p.id, st: idx, at: at, ok: res.ok ? 1 : 0 }, api.inRoom(ID));
    if (res.done) {
      st.done = 1;
      api.broadcast({ t: ID + '.ready', st: idx }, api.inRoom(ID));
      if (run.st.every(function (o) { return o.done; })) { launch(); return; }
      for (let k = 1; k <= run.st.length; k++) { const j = (idx + k) % run.st.length; if (!run.st[j].done) { run.focus = j; break; } }
    }
    sendAll();
  });
  api.on('sig', function (p, m) {     // the signal board: a tap shows on every tablet in the room for a moment
    if (p.room !== ID) return;
    const k = String(m.k || ''), v = int(m.v), max = { c: 5, s: 5, n: 9, a: 3, y: 1 }[k], now = Date.now();
    if (max === undefined || v < 0 || v > max || now - (sigAt[p.key] || 0) < 150) return;
    sigAt[p.key] = now;
    api.broadcast({ t: ID + '.sig', id: p.id, k: k, v: v }, api.inRoom(ID));
  });

  // ---------- daily quests ----------
  api.addQuest({ type: 'rocket.launch', icon: '🚀', solo: true, tiers: [[1, 4], [2, 5], [3, 7]],
    en: 'Launch {n} rockets', zh: '发射 {n} 枚火箭', py: 'fāshè {n} méi huǒjiàn', ms: 'Lancarkan {n} roket' });
  api.addQuest({ type: 'rocket.team', icon: '🤝', solo: false, tiers: [[1, 5], [2, 7]],
    en: 'Launch {n} rockets with someone', zh: '和别人一起发射 {n} 枚火箭', py: 'hé biérén yìqǐ fāshè {n} méi huǒjiàn', ms: 'Lancarkan {n} roket bersama seseorang' });
};
