// Escape Room: co-operative puzzle rooms for the whole family (docs/GAME-MODULES.md).
// A run is a chain of 4 rooms taken from 10 kinds of puzzle, with new values every time.
// Every room has a "device" that all tablets show the same way, and clue cards that are dealt out:
// a card is only ever sent to the one player who holds it, so the family has to talk to get out.
// The server keeps the solution, checks every answer and pays the stars. Nothing here trusts a tablet.
//
// Saved: profile.escape = { rooms, runs, best: { easy: ms, hard: ms }, day, today }
//        save.escape    = { runs, best: { easy: { ms, names, day }, hard: { ... } } }
'use strict';
module.exports = function (api) {
  const ID = api.id;
  const env = process.env;
  const ROOMS = 4;                      // rooms in one run
  const FULL_RUNS = 3;                  // runs a day that pay the full reward; after that 1 star per room
  const HINT_AFTER = env.ESCAPE_HINT_MS ? parseInt(env.ESCAPE_HINT_MS, 10) : 45000;   // the Hint button comes after this long in a room
  const HINT_GAP = 4000;                // between two hints
  const OPEN_MS = env.ESCAPE_OPEN_MS ? parseInt(env.ESCAPE_OPEN_MS, 10) : 4200;       // the door animation
  const FAST_MS = 75000;                // Hard: a room solved this fast without a hint pays 1 star more
  const STALE_MS = 10 * 60000;          // an abandoned run is dropped after this long with nobody in the room
  const TYPES = ['lock', 'seq', 'keys', 'scale', 'memory', 'grid', 'clock', 'lights', 'count', 'pipes'];
  const DIAL_TYPES = { lock: 1, keys: 1, count: 1 };
  const THEMES = 6;
  // tests only: ESCAPE_TYPES=lock,seq,... fixes the order of the puzzle kinds
  const FORCE = String(env.ESCAPE_TYPES || '').split(',').filter(function (t) { return TYPES.indexOf(t) >= 0; });
  let forceAt = 0;

  let run = null;          // the run everybody in the room shares, or null while choosing Easy / Hard
  let openTimer = null;
  let lastTypes = [];      // the kinds of the run before, so the next run brings other ones

  // ---------- small helpers ----------
  function ri(a, b) { return Math.floor(api.rnd(a, b + 1)); }   // whole number from a to b
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function range(n) { const a = []; for (let i = 0; i < n; i++) a.push(i); return a; }
  function zeros(n) { return range(n).map(function () { return 0; }); }
  function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  function int(v) { const n = parseInt(v, 10); return isFinite(n) ? n : -1; }
  // a stopwatch that can pause: the run clock and the room clock stand still while nobody is in the room
  function watch() { return { acc: 0, at: 0 }; }
  function swOn(w) { if (!w.at) w.at = Date.now(); }
  function swOff(w) { if (w.at) { w.acc += Date.now() - w.at; w.at = 0; } }
  function swGet(w) { return w.acc + (w.at ? Date.now() - w.at : 0); }
  // n places on a jittered grid, as [x, y] between 0 and 1, so drawn objects never sit on top of each other
  function scatter(n, cols, rows) {
    return api.shuffle(range(cols * rows)).slice(0, n).map(function (i) {
      return [Math.round(((i % cols) + 0.5 + api.rnd(-0.13, 0.13)) / cols * 1000) / 1000, Math.round((Math.floor(i / cols) + 0.5 + api.rnd(-0.16, 0.16)) / rows * 1000) / 1000];
    });
  }
  // a tiny sum whose answer is d
  function sumClue(d, hard) {
    const opts = [];
    if (d >= 2 && !hard) { const a = ri(1, d - 1); opts.push(a + ' + ' + (d - a)); }
    { const b = ri(1, hard ? 9 : Math.max(1, 10 - d)); opts.push((d + b) + ' − ' + b); }
    if (hard) {
      for (let a = 2; a <= 4; a++) if (d % a === 0 && d / a >= 2 && d / a <= 6) opts.push(a + ' × ' + (d / a));
      const x = ri(2, 9), y = ri(1, 9), z = x + y - d;
      if (z >= 1 && z <= 9) opts.push(x + ' + ' + y + ' − ' + z);
    }
    return pick(opts);
  }

  // ---------- saved data ----------
  function data(p) {
    const prof = api.prof(p);
    if (!prof) return null;
    const d = prof[ID] || (prof[ID] = {});
    if (typeof d.rooms !== 'number') d.rooms = 0;     // rooms solved in total
    if (typeof d.runs !== 'number') d.runs = 0;       // runs finished in total
    if (!d.best || typeof d.best !== 'object') d.best = {};
    if (d.day !== api.today()) { d.day = api.today(); d.today = 0; }   // today = full-reward runs used today
    if (typeof d.today !== 'number') d.today = 0;
    return d;
  }
  function shared() {
    const s = api.save[ID] || (api.save[ID] = {});
    if (!s.best || typeof s.best !== 'object') s.best = {};
    if (typeof s.runs !== 'number') s.runs = 0;
    return s;
  }

  // ---------- the ten puzzles ----------
  // Each maker returns { pub, cards, sol, hintMax, split }:
  //   pub    what every tablet may see of the device (never the answer)
  //   cards  the clues; each one is sent only to the player who holds it
  //   sol    the answer, kept here
  //   split  true: the players who hold cards cannot press the device, the others can (when 2+ play)
  const NB3 = range(9).map(function (i) {
    const x = i % 3, y = Math.floor(i / 3), a = [i];
    if (x > 0) a.push(i - 1); if (x < 2) a.push(i + 1); if (y > 0) a.push(i - 3); if (y < 2) a.push(i + 3);
    return a;
  });
  function press3(on, i) { NB3[i].forEach(function (j) { on[j] = on[j] ? 0 : 1; }); }
  // the fewest presses that turn the panel `on` into `target` (the 3x3 game always has exactly one such set)
  function lightsPlan(on, target) {
    let best = null;
    for (let mask = 0; mask < 512; mask++) {
      const a = on.slice(), cells = [];
      for (let i = 0; i < 9; i++) if (mask & (1 << i)) { press3(a, i); cells.push(i); }
      if (a.every(function (v, i) { return v === target[i]; }) && (!best || cells.length < best.length)) best = cells;
    }
    return best || [];
  }
  // pipe tiles: 0 straight, 1 elbow, 2 tee.  Directions: 0 up, 1 right, 2 down, 3 left
  function openings(type, rot) { return (type === 0 ? [0, 2] : type === 1 ? [0, 1] : [0, 1, 2]).map(function (d) { return (d + rot) % 4; }); }
  // the tiles the water runs through when the right tap reaches the right bucket, otherwise null
  function flow(r) {
    const pub = r.pub, cols = pub.cols, rows = pub.rows, DXY = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    function op(i) { return openings(pub.tiles[i], pub.rot[i]); }
    const start = r.sol.tap * cols, end = r.sol.pail * cols + cols - 1;
    if (op(start).indexOf(3) < 0 || op(end).indexOf(1) < 0) return null;
    const seen = {}, queue = [start];
    seen[start] = 1;
    while (queue.length) {
      const i = queue.shift(), x = i % cols, y = Math.floor(i / cols);
      op(i).forEach(function (d) {
        const nx = x + DXY[d][0], ny = y + DXY[d][1];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return;
        const j = ny * cols + nx;
        if (seen[j] || op(j).indexOf((d + 2) % 4) < 0) return;
        seen[j] = 1; queue.push(j);
      });
    }
    return seen[end] ? Object.keys(seen).map(Number) : null;
  }

  const MAKE = {
    // number lock: every digit has its own clue, a tiny sum or a count of drawn objects
    lock: function (hard) {
      const n = hard ? 4 : 3, sol = [], cards = [], kinds = api.shuffle(['sum', 'cnt', 'sum', 'cnt']).slice(0, n);
      for (let i = 0; i < n; i++) {
        if (kinds[i] === 'sum') {
          const d = ri(0, 9);
          sol.push(d); cards.push({ k: 'sum', slot: i, of: n, text: sumClue(d, hard) });
        } else {
          const d = ri(hard ? 3 : 1, 9), s = ri(0, 5), junk = hard ? ri(2, 4) : 0;
          sol.push(d);
          cards.push({ k: 'cnt', slot: i, of: n, s: s, items: scatter(d + junk, 5, 3).map(function (q, j) { return [j < d ? s : (s + 1 + ri(0, 4)) % 6, q[0], q[1]]; }) });
        }
      }
      return { pub: { dev: 'dials', vals: zeros(n), min: 0, max: 9, heads: range(n).map(function (i) { return { c: i }; }), fix: zeros(n) }, cards: cards, sol: sol, hintMax: n - 1 };
    },
    // shape keys: some players see the outline of each keyhole, others hold the numbered keys
    keys: function (hard) {
      const nl = hard ? 3 : 2, nk = hard ? 8 : 6, nt = hard ? 4 : 3, seen = {}, keys = [];
      while (keys.length < nk) {
        const t = range(nt).map(function () { return ri(1, 3); }), sig = t.join('');
        if (!seen[sig] && t.some(function (v) { return v !== t[0]; })) { seen[sig] = 1; keys.push(t); }   // no two keys alike, none with all teeth the same
      }
      const sol = api.shuffle(range(nk)).slice(0, nl).map(function (i) { return i + 1; });
      const cards = sol.map(function (num, i) { return { k: 'hole', slot: i, of: nl, teeth: keys[num - 1] }; });
      const all = keys.map(function (t, i) { return { n: i + 1, teeth: t }; }), half = Math.ceil(nk / 2);
      cards.push({ k: 'rack', keys: all.slice(0, half) }, { k: 'rack', keys: all.slice(half) });
      return { pub: { dev: 'dials', vals: range(nl).map(function () { return 1; }), min: 1, max: nk, heads: range(nl).map(function (i) { return { c: i, lock: 1 }; }), fix: zeros(nl) }, cards: cards, sol: sol, hintMax: nl - 1 };
    },
    // hidden objects: every picture holds some of them; the counts of all pictures are added up
    count: function (hard) {
      const kinds = api.shuffle(range(6)), nc = hard ? 3 : 2, per = range(nc).map(function () { return []; }), sol = [];
      for (let j = 0; j < 3; j++) {
        const total = ri(hard ? 3 : 2, hard ? 9 : 7);
        sol.push(total);
        for (let n = 0; n < total; n++) {
          const free = range(nc).filter(function (c) { return per[c].length < 13; });
          per[pick(free)].push(kinds[j]);
        }
      }
      if (hard) per.forEach(function (list) { const extra = ri(1, 3); for (let n = 0; n < extra; n++) list.push(kinds[3]); });   // a kind nobody asks for
      const cards = per.map(function (list, c) {
        const spots = scatter(list.length, 5, 4);
        return { k: 'pic', n: c, items: api.shuffle(list).map(function (s, i) { return [s, spots[i][0], spots[i][1]]; }) };
      });
      return { pub: { dev: 'dials', vals: zeros(3), min: 0, max: 9, heads: range(3).map(function (j) { return { s: kinds[j] }; }), fix: zeros(3) }, cards: cards, sol: sol, hintMax: 2 };
    },
    // colour sequence: the order hangs on a painting (in pieces), someone else has the buttons
    seq: function (hard) {
      const len = hard ? 6 : 4, n = hard ? 6 : 4, sol = [], cards = [];
      for (let i = 0; i < len; i++) { let c; do { c = ri(0, n - 1); } while (i && c === sol[i - 1]); sol.push(c); }
      for (let i = 0; i < len; i += 2) cards.push({ k: 'seq', from: i, of: len, items: sol.slice(i, i + 2) });
      return { pub: { dev: 'seq', len: len, n: n, got: [], fix: range(len).map(function () { return -1; }) }, cards: cards, sol: sol, hintMax: len - 2, split: true };
    },
    // balance scales: what each object weighs is on the cards; weights go on the other side until both are equal
    scale: function (hard) {
      const nk = hard ? 3 : 2, ws = hard ? [1, 2, 5, 10] : [1, 2, 5];
      let left, total, pieces;
      do {
        const kinds = api.shuffle(range(6)).slice(0, nk);
        left = kinds.map(function (s) { return { s: s, n: ri(1, hard ? 3 : 2), w: ri(hard ? 2 : 1, hard ? 9 : 5) }; });
        total = sum(left.map(function (o) { return o.n * o.w; }));
        pieces = 0;
        let rest = total;
        ws.slice().reverse().forEach(function (w) { pieces += Math.floor(rest / w); rest %= w; });
      } while (total < (hard ? 12 : 4) || total > (hard ? 45 : 15) || pieces > 6);
      return { pub: { dev: 'scale', left: left.map(function (o) { return { s: o.s, n: o.n }; }), ws: ws, pan: [], tip: 0, goal: 0 },
        cards: left.map(function (o) { return { k: 'weigh', s: o.s, w: o.w }; }), sol: total, hintMax: 1 };
    },
    // memory tiles: the pattern flashes on the cards, someone else repeats it on the device
    memory: function (hard) {
      const size = hard ? 4 : 3, k = hard ? 6 : 4, cells = api.shuffle(range(size * size)).slice(0, k), ms = hard ? 2000 : 3000;
      return { pub: { dev: 'cells', kind: 'memory', cols: size, rows: size, on: zeros(size * size), fix: zeros(size * size) },
        cards: [{ k: 'flash', size: size, cells: cells.slice(0, k / 2), ms: ms }, { k: 'flash', size: size, cells: cells.slice(k / 2), ms: ms }],
        sol: cells, hintMax: k - 2, split: true };
    },
    // grid treasure: the column and the row of each gem are on different cards, someone else taps the grid
    grid: function (hard) {
      const size = hard ? 5 : 4, gems = hard ? 3 : 2, cells = api.shuffle(range(size * size)).slice(0, gems), rowS = api.shuffle(range(6)).slice(0, size), cards = [];
      cells.forEach(function (cell, gi) {
        const col = cell % size + 1;
        cards.push(hard ? { k: 'gcol', gem: gi, text: sumClue(col, true) } : { k: 'gcol', gem: gi, n: col });
        cards.push({ k: 'grow', gem: gi, s: rowS[Math.floor(cell / size)] });
      });
      return { pub: { dev: 'cells', kind: 'grid', cols: size, rows: size, on: zeros(size * size), fix: zeros(size * size), max: gems, rowS: rowS },
        cards: cards, sol: cells, hintMax: gems - 1, split: true };
    },
    // clock: the short hand, the long hand and day or night are three separate picture clues
    clock: function (hard) {
      let h, m, day;
      do { h = ri(1, 12); m = hard ? ri(1, 12) : pick([3, 6, 9, 12]); day = Math.random() < 0.5 ? 1 : 0; } while (h === 12 && m === 12);
      return { pub: { dev: 'clock', h: 12, m: 12, day: 1, fix: [0, 0, 0] },
        cards: [hard ? { k: 'hand', which: 0, text: sumClue(h, true) } : { k: 'hand', which: 0, n: h },
          hard ? { k: 'hand', which: 1, text: sumClue(m, true) } : { k: 'hand', which: 1, n: m }, { k: 'sky', day: day }],
        sol: { h: h, m: m, day: day }, hintMax: 2 };
    },
    // lights: pressing a lamp flips it and its neighbours; the cards show which lamps must glow in the end
    lights: function (hard) {
      let target;
      do { target = range(9).map(function () { return Math.random() < 0.55 ? 1 : 0; }); } while (sum(target) < 3 || sum(target) > 7);
      const on = target.slice();
      api.shuffle(range(9)).slice(0, hard ? ri(4, 5) : ri(2, 3)).forEach(function (i) { press3(on, i); });
      return { pub: { dev: 'cells', kind: 'lights', cols: 3, rows: 3, on: on, fix: zeros(9), tip: -1 },
        cards: range(3).map(function (r) { return { k: 'lamps', row: r, cells: target.slice(r * 3, r * 3 + 3) }; }), sol: target, start: on.slice(), hintMax: 2 };
    },
    // pipes: turn the tiles until the tap that has water reaches the right bucket; which tap and which bucket are clues
    pipes: function (hard) {
      const cols = hard ? 5 : 4, rows = hard ? 4 : 3, n = cols * rows;
      let r;
      do {
        const tiles = zeros(n).map(function () { return -1; }), want = zeros(n), path = [], tap = ri(0, rows - 1), pail = ri(0, rows - 1);
        const put = function (y, x, type, rot) { tiles[y * cols + x] = type; want[y * cols + x] = rot; path.push(y * cols + x); };
        let y = tap;
        for (let x = 0; x < cols; x++) {
          const to = x === cols - 1 ? pail : ri(0, rows - 1);
          if (to === y) put(y, x, 0, 1);
          else {
            const down = to > y;
            put(y, x, 1, down ? 2 : 3);
            for (let v = y + (down ? 1 : -1); v !== to; v += down ? 1 : -1) put(v, x, 0, 0);
            put(to, x, 1, down ? 0 : 1);
          }
          y = to;
        }
        for (let i = 0; i < n; i++) if (tiles[i] < 0) tiles[i] = pick([0, 1, 1, 1, 2]);
        r = { pub: { dev: 'pipes', cols: cols, rows: rows, tiles: tiles, rot: range(n).map(function () { return ri(0, 3); }), fix: zeros(n) },
          cards: [{ k: 'tap', row: tap, rows: rows }, { k: 'pail', row: pail, rows: rows }], sol: { tap: tap, pail: pail, path: path, want: want }, hintMax: 3 };
      } while (flow(r));
      return r;
    }
  };

  // ---------- pressing the device ----------
  // Each returns null (nothing happened) or { at: which control, done: solved, wrong: a wrong answer }
  const ACT = {
    dials: function (r, a, m) {
      const pub = r.pub;
      if (a === 'dial') {
        const i = int(m.i), d = +m.d > 0 ? 1 : -1;
        if (i < 0 || i >= pub.vals.length || pub.fix[i]) return null;
        let v = pub.vals[i] + d;
        if (v > pub.max) v = pub.min;
        if (v < pub.min) v = pub.max;
        pub.vals[i] = v;
        return { at: 'dial' + i + (d > 0 ? 'u' : 'd') };
      }
      if (a === 'check') { const ok = pub.vals.every(function (v, i) { return v === r.sol[i]; }); return { at: 'check', done: ok, wrong: !ok }; }
      return null;
    },
    seq: function (r, a, m) {
      const pub = r.pub;
      if (a === 'back') { if (!pub.got.length) return null; pub.got.pop(); return { at: 'back' }; }
      if (a !== 'press') return null;
      const c = int(m.c);
      if (c < 0 || c >= pub.n || pub.got.length >= pub.len) return null;
      pub.got.push(c);
      if (pub.got.length < pub.len) return { at: 'col' + c };
      const ok = pub.got.every(function (v, i) { return v === r.sol[i]; });
      if (!ok) pub.got = [];
      return { at: 'col' + c, done: ok, wrong: !ok };
    },
    scale: function (r, a, m) {
      const pub = r.pub;
      if (a === 'add') {
        const w = int(m.w);
        if (pub.ws.indexOf(w) < 0 || pub.pan.length >= 8) return null;
        pub.pan.push(w); pub.tip = 0;
        return { at: 'w' + w };
      }
      if (a === 'undo') { if (!pub.pan.length) return null; pub.pan.pop(); pub.tip = 0; return { at: 'undo' }; }
      if (a === 'check') {
        const have = sum(pub.pan);
        pub.tip = have > r.sol ? 1 : have < r.sol ? -1 : 0;     // which side goes down: 1 the weights, -1 the objects
        return { at: 'check', done: have === r.sol, wrong: have !== r.sol };
      }
      return null;
    },
    cells: function (r, a, m) {
      const pub = r.pub, n = pub.on.length;
      if (a === 'cell') {
        const i = int(m.i);
        if (i < 0 || i >= n) return null;
        if (pub.kind === 'lights') {
          press3(pub.on, i);
          if (pub.tip === i) pub.tip = -1;
          return { at: 'c' + i, done: pub.on.every(function (v, j) { return v === r.sol[j]; }) };
        }
        if (pub.fix[i]) return null;
        if (pub.kind === 'grid' && !pub.on[i] && sum(pub.on) >= pub.max) return null;   // only as many flags as there are gems
        pub.on[i] = pub.on[i] ? 0 : 1;
        return { at: 'c' + i };
      }
      if (a === 'reset' && pub.kind === 'lights') { pub.on = r.start.slice(); pub.tip = -1; return { at: 'reset' }; }
      if (a === 'check' && pub.kind !== 'lights') {
        const ok = sum(pub.on) === r.sol.length && r.sol.every(function (i) { return pub.on[i]; });
        if (!ok && pub.kind === 'grid') pub.on = pub.on.map(function (v, i) { return pub.fix[i] ? 1 : 0; });   // the flags come out again
        return { at: 'check', done: ok, wrong: !ok };
      }
      return null;
    },
    clock: function (r, a, m) {
      const pub = r.pub;
      if (a === 'hand') {
        const which = int(m.which) === 1 ? 1 : 0, d = +m.d > 0 ? 1 : -1, key = which ? 'm' : 'h';
        if (pub.fix[which]) return null;
        pub[key] = (pub[key] - 1 + d + 12) % 12 + 1;
        return { at: 'h' + which + (d > 0 ? 'u' : 'd') };
      }
      if (a === 'sky') { if (pub.fix[2]) return null; pub.day = pub.day ? 0 : 1; return { at: 'sky' }; }
      if (a === 'check') { const ok = pub.h === r.sol.h && pub.m === r.sol.m && pub.day === r.sol.day; return { at: 'check', done: ok, wrong: !ok }; }
      return null;
    },
    pipes: function (r, a, m) {
      const pub = r.pub;
      if (a !== 'rot') return null;
      const i = int(m.i);
      if (i < 0 || i >= pub.rot.length || pub.fix[i]) return null;
      pub.rot[i] = (pub.rot[i] + 1) % 4;
      return { at: 't' + i, done: !!flow(r) };
    }
  };
  // what the tablets get to see once the room is solved
  function reveal(r) {
    if (r.type === 'pipes') return { tap: r.sol.tap, pail: r.sol.pail, wet: flow(r) || [] };
    return {};
  }

  // ---------- hints: each one shows a little more; true when something new was shown ----------
  function giveHint(r) {
    const pub = r.pub, sol = r.sol;
    let i;
    switch (r.type) {
      case 'lock': case 'keys': case 'count':
        for (i = 0; i < sol.length; i++) if (!pub.fix[i] && pub.vals[i] !== sol[i]) { pub.vals[i] = sol[i]; pub.fix[i] = 1; return true; }
        for (i = 0; i < sol.length; i++) if (!pub.fix[i]) { pub.fix[i] = 1; return true; }
        return false;
      case 'seq':   // the next colour that is still missing, shown faintly in its place
        i = -1;
        for (let k = pub.got.length; k < pub.len && i < 0; k++) if (pub.fix[k] < 0) i = k;
        if (i < 0) i = pub.fix.indexOf(-1);
        if (i < 0) return false;
        pub.fix[i] = sol[i];
        return true;
      case 'scale':
        if (pub.goal) return false;
        pub.goal = sol;
        return true;
      case 'memory': case 'grid': {
        const open = sol.filter(function (c) { return !pub.fix[c]; });
        if (!open.length) return false;
        const c = open.filter(function (x) { return !pub.on[x]; })[0];
        i = c === undefined ? open[0] : c;
        pub.on[i] = 1; pub.fix[i] = 1;
        if (r.type === 'grid') {   // a flag in a wrong place makes room for the gem
          for (let j = 0; j < pub.on.length && sum(pub.on) > pub.max; j++) if (pub.on[j] && !pub.fix[j] && sol.indexOf(j) < 0) pub.on[j] = 0;
          for (let j = 0; j < pub.on.length && sum(pub.on) > pub.max; j++) if (pub.on[j] && !pub.fix[j]) pub.on[j] = 0;
        }
        return true;
      }
      case 'clock':
        if (pub.h !== sol.h && !pub.fix[0]) { pub.h = sol.h; pub.fix[0] = 1; return true; }
        if (pub.m !== sol.m && !pub.fix[1]) { pub.m = sol.m; pub.fix[1] = 1; return true; }
        if (pub.day !== sol.day && !pub.fix[2]) { pub.day = sol.day; pub.fix[2] = 1; return true; }
        return false;
      case 'lights': {
        const plan = lightsPlan(pub.on, sol);
        if (!plan.length || pub.tip >= 0) return false;
        pub.tip = plan[0];
        return true;
      }
      case 'pipes':
        for (i = 0; i < sol.path.length; i++) {
          const c = sol.path[i], same = pub.tiles[c] === 0 ? pub.rot[c] % 2 === sol.want[c] % 2 : pub.rot[c] === sol.want[c];
          if (!pub.fix[c] && !same) { pub.rot[c] = sol.want[c]; pub.fix[c] = 1; return true; }
        }
        return false;
    }
    return false;
  }

  // ---------- who is in the room, who holds which card ----------
  function here() {   // the players in the room, in the order they first sat down in this run
    const list = api.roomList(ID);
    if (run) {
      list.forEach(function (p) { if (run.seats.indexOf(p.key) < 0) run.seats.push(p.key); });
      list.sort(function (a, b) { return run.seats.indexOf(a.key) - run.seats.indexOf(b.key); });
    }
    return list;
  }
  // Deals every card to someone who is in the room right now. Called again whenever somebody comes or goes,
  // so no clue is ever stuck with a player who left.
  function deal() {
    if (!run || !run.room) return;
    const r = run.room, list = here(), n = list.length;
    r.hold = {}; r.ops = {};
    if (!n) return;
    const off = (run.off + run.idx) % n, order = list.slice(off).concat(list.slice(0, off)).map(function (p) { return p.key; });
    let holders = order;
    if (r.split && n > 1) holders = order.slice(n >= 4 ? 2 : 1).slice(0, r.cards.length);   // the first one or two only press
    order.forEach(function (k) { r.hold[k] = []; if (!r.split || n === 1 || holders.indexOf(k) < 0) r.ops[k] = 1; });
    r.cards.forEach(function (cd, i) { r.hold[holders[i % holders.length]].push(i); });
  }

  // ---------- what one tablet is told ----------
  function stateFor(p) {
    const d = data(p), list = here(), r = run && run.room;
    const m = { t: ID + '.state', phase: run ? run.phase : 'lobby', cap: FULL_RUNS, today: d ? d.today : 0, best: d ? d.best : {}, rooms: d ? d.rooms : 0, fam: shared().best,
      who: list.map(function (o) { return { id: o.id, op: r && r.ops[o.key] ? 1 : 0, n: r && r.hold[o.key] ? r.hold[o.key].length : 0 }; }) };
    if (!run) return m;
    m.diff = run.diff; m.idx = Math.min(run.idx, ROOMS); m.total = ROOMS;
    m.clock = swGet(run.sw); m.tick = run.sw.at ? 1 : 0;
    m.paid = run.paid[p.key] || 0; m.gains = run.gains[p.key] || [];
    m.full = run.full[p.key] === false ? 0 : 1;
    if (run.phase === 'done') { m.sum = run.sum; return m; }
    m.room = { type: r.type, theme: r.theme, pub: r.pub, t: swGet(r.sw), hintAfter: HINT_AFTER, hints: r.hints, hintLeft: r.hintMax - r.hints, fast: run.diff ? FAST_MS : 0, split: r.split ? 1 : 0 };
    m.cards = (r.hold[p.key] || []).map(function (i) { return Object.assign({ i: i }, r.cards[i]); });
    m.op = r.ops[p.key] ? 1 : 0;
    if (run.phase === 'open') { m.room.reveal = r.reveal; m.room.gain = r.gain; m.room.quick = r.quick ? 1 : 0; }
    return m;
  }
  function sendAll() { here().forEach(function (p) { api.send(p, stateFor(p)); }); }

  // ---------- the run ----------
  function newRun(diff) {
    let types;
    if (FORCE.length) { types = range(ROOMS).map(function () { return FORCE[forceAt++ % FORCE.length]; }); }
    else {
      const pool = api.shuffle(TYPES.filter(function (t) { return lastTypes.indexOf(t) < 0; })).concat(api.shuffle(lastTypes));
      types = [];
      pool.forEach(function (t) {   // new kinds first, and never more than two number-dial rooms in a run
        if (types.length >= ROOMS) return;
        if (DIAL_TYPES[t] && types.filter(function (x) { return DIAL_TYPES[x]; }).length >= 2) return;
        types.push(t);
      });
      types = api.shuffle(types);
    }
    lastTypes = types.slice();
    run = { diff: diff, idx: -1, types: types, themes: api.shuffle(range(THEMES)).slice(0, ROOMS), sw: watch(), phase: 'play', room: null,
      paid: {}, gains: {}, full: {}, seats: [], off: ri(0, 7), emptyAt: 0, sum: null };
    nextRoom();
  }
  function endRun() { clearTimeout(openTimer); openTimer = null; run = null; }
  function nextRoom() {
    openTimer = null;
    if (!run) return;
    run.idx++;
    if (run.idx >= ROOMS) { finish(); return; }
    const type = run.types[run.idx], r = MAKE[type](!!run.diff);
    r.type = type; r.theme = run.themes[run.idx]; r.sw = watch(); r.hints = 0; r.hintAt = 0; r.split = !!r.split; r.hold = {}; r.ops = {};
    run.room = r; run.phase = 'play';
    deal();
    if (here().length) { swOn(run.sw); swOn(r.sw); }
    sendAll();
  }
  // The room is solved: the door opens, everybody who is in the room is paid, then the next room comes.
  function solved() {
    const r = run.room, list = here();
    swOff(run.sw); swOff(r.sw);
    r.quick = !!run.diff && !r.hints && swGet(r.sw) <= FAST_MS;
    const base = 3 - (r.hints ? 1 : 0) + (r.quick ? 1 : 0);
    r.gain = {}; r.reveal = reveal(r);
    run.phase = 'open';
    list.forEach(function (p) {
      const d = data(p);
      if (!d) return;
      if (run.full[p.key] === undefined) {   // this run counts as one of today's full-reward runs with the first room paid
        run.full[p.key] = d.today < FULL_RUNS;
        if (run.full[p.key]) d.today++;
      }
      const n = run.full[p.key] ? base : 1;
      r.gain[p.id] = n;
      run.paid[p.key] = (run.paid[p.key] || 0) + n;
      (run.gains[p.key] = run.gains[p.key] || []).push(n);
      d.rooms++;
      api.addStars(p, n);
      api.questEvent(p, 'escape.room');
      if (list.length > 1) api.questEvent(p, 'escape.team');
    });
    api.saveSoon();
    sendAll();
    clearTimeout(openTimer);
    openTimer = setTimeout(nextRoom, OPEN_MS);
  }
  // All four rooms are done: the finishing bonus and the best times.
  function finish() {
    const key = run.diff ? 'hard' : 'easy', ms = swGet(run.sw), s = shared();
    const list = here().filter(function (p) { return run.gains[p.key] && data(p); });   // only those who solved a room in this run
    const record = list.length > 0 && (!s.best[key] || !(s.best[key].ms > 0) || ms < s.best[key].ms);
    run.phase = 'done'; run.room = null;
    run.sum = { ms: ms, diff: run.diff, fam: record ? 1 : 0, mine: {}, bonus: {} };
    list.forEach(function (p) {
      const d = data(p);
      d.runs++;
      if (!(d.best[key] > 0) || ms < d.best[key]) { d.best[key] = ms; run.sum.mine[p.id] = 1; }
      if (run.full[p.key]) {
        run.sum.bonus[p.id] = 5;
        run.paid[p.key] += 5; run.gains[p.key].push(5);
        api.addStars(p, 5);
      }
    });
    if (list.length) {
      s.runs++;
      if (record) s.best[key] = { ms: ms, names: list.map(function (p) { return p.name; }), day: api.today() };
    }
    api.saveSoon();
    sendAll();
  }

  // ---------- the room ----------
  api.room({
    enter: function (p) {
      const alone = api.roomList(ID).length <= 1;
      if (run && alone && (run.phase === 'done' || (run.emptyAt && Date.now() - run.emptyAt > STALE_MS))) endRun();
      if (run) {
        run.emptyAt = 0;
        deal();
        if (run.phase === 'play') { swOn(run.sw); swOn(run.room.sw); }
      }
      sendAll();
    },
    leave: function () {   // also called when a tablet loses its connection: the cards of that player go to the others at once
      if (!run) { sendAll(); return; }
      if (!api.roomList(ID).length) {
        swOff(run.sw);
        if (run.room) swOff(run.room.sw);
        run.emptyAt = Date.now();
        return;
      }
      deal();
      sendAll();
    }
  });

  api.on('start', function (p, m) {
    if (p.room !== ID || (run && run.phase !== 'done')) return;
    newRun(int(m.diff) === 1 ? 1 : 0);
  });
  api.on('stop', function (p) {
    if (p.room !== ID || !run) return;
    const was = run.phase;
    endRun();
    if (was !== 'done') api.toast(p.name + ' ended the escape run.', function (o) { return o.room === ID && o.id !== p.id; });
    sendAll();
  });
  api.on('act', function (p, m) {
    if (p.room !== ID || !run || run.phase !== 'play') return;
    const r = run.room;
    if (!r.ops[p.key]) return;
    const res = ACT[r.pub.dev](r, String(m.a || ''), m);
    if (!res) return;
    api.broadcast({ t: ID + '.touch', id: p.id, at: res.at }, api.inRoom(ID));
    if (res.done) { solved(); return; }
    if (res.wrong) api.broadcast({ t: ID + '.wrong', id: p.id }, api.inRoom(ID));
    sendAll();
  });
  api.on('hint', function (p) {
    if (p.room !== ID || !run || run.phase !== 'play') return;
    const r = run.room, now = Date.now();
    if (swGet(r.sw) < HINT_AFTER - 400 || r.hints >= r.hintMax || now - r.hintAt < HINT_GAP) return;
    if (!giveHint(r)) { api.send(p, { t: ID + '.nohint' }); return; }
    r.hints++; r.hintAt = now;
    api.broadcast({ t: ID + '.hinted', id: p.id }, api.inRoom(ID));
    if ((r.type === 'pipes' && flow(r)) || (r.type === 'lights' && r.pub.on.every(function (v, i) { return v === r.sol[i]; }))) { solved(); return; }
    sendAll();
  });

  // ---------- daily quests ----------
  api.addQuest({ type: 'escape.room', icon: '🗝️', solo: true, tiers: [[2, 4], [3, 5], [4, 6]],
    en: 'Solve {n} escape rooms', zh: '解开 {n} 个密室', py: 'jiěkāi {n} gè mìshì', ms: 'Selesaikan {n} bilik teka-teki' });
  api.addQuest({ type: 'escape.team', icon: '🤝', solo: false, tiers: [[2, 5], [4, 7]],
    en: 'Solve {n} escape rooms with someone', zh: '和别人一起解开 {n} 个密室', py: 'hé biérén yìqǐ jiěkāi {n} gè mìshì', ms: 'Selesaikan {n} bilik teka-teki bersama seseorang' });
};
