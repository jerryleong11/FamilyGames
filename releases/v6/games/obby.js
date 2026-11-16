// Obby Tower (server). Two towers of hand-made stages in chapters of six, each stage starting at a checkpoint flag,
// and four ways to play them: Climb (the towers at your own pace), Race (a chapter, everybody at once),
// Rising lava (how high before the lava gets you) and the Endless tower (a new tower every day, made by code).
// The running and jumping happens on the tablets (positions are trusted, like town movement); the server owns
// everything that pays out: which flags a climb has reached and in which order, the stars, the clocks, the rounds,
// the records and the family leaderboards.
//
//   profile.obby = { easy: { ... }, hard: { ... }, race: { ... }, lava: { ... }, endless: { ... } }
//   per tower:
//     top  = highest flag ever reached (the first time a flag is reached pays stars)
//     cur  = highest flag of the climb that is not finished yet ("go on" starts there)
//     best = best timed run of the FIRST 12 STAGES in ms (0 = none): the whole tower when it was first released
//     fin  = how many times flag 12 (the top of that first tower) was reached
//     day / paid = repeat finishes of the 12-stage tower paid on that day (kept as they were; not counted any more)
//     full = best timed run of the whole tower in ms       tops = how many times the real top was reached
//     ch   = [ms x 5] best time of each chapter (0 = none)  cd / cp = repeat chapters paid today (at most CH_PER_DAY)
//   race    = { day, paid, n, wins, ghost: { easy0: { ms, s } ... } }   paid races today, races, wins, best race of a chapter with its recording
//   lava    = { day, paid, n, wins, best: { easy, hard } }              paid rounds today, rounds, wins, highest climb in metres
//   endless = { day, top, paid, n, best, bday }                        today's highest flag and stars, climbs, highest flag ever and its day
//   save.obby = { easy: [], hard: [],                     the 5 best times of the family for the first 12 stages (as before)
//                 full: { easy, hard }, chap: { easy: [[] x 5], hard }, race: [], lava: { easy, hard }, endless: { day, today, all } }
//
// Messages from a tablet:  obby.start { tower, from } | { mode: 'endless' }   obby.go   obby.pos { x, y, f, m }   obby.flag { i }
//                          obby.quit   obby.ready { mode, tower, ch, on }   obby.watch { mode }   obby.out   obby.ghost { s }
// Messages to a tablet:    obby.hello  obby.run  obby.flag  obby.done  obby.me  obby.lb  obby.who  obby.st
//                          obby.pt (who is ready)  obby.rk (a round as it stands)  obby.fin (my race)  obby.out (the lava got me)
//                          obby.res (a round is over)  obby.over (my endless climb is over)
'use strict';
module.exports = function (api) {
  const ID = api.id;
  const CHAP = 6;                // stages in a chapter; a chapter ends on a rest platform
  const OLD = 12;                // stages of the tower as it was first released: `best` and the old boards are times for those
  // stages = number of flags after the start flag; the last one is the top of the tower.
  // The stage layouts live in public/games/obby.js: keep `stages` and `h` (the height of every stage) the same as there.
  //   flag = stars for a new flag, chest = stars for the rest platform of each chapter the first time (chest[1] is what the
  //   top of the 12-stage tower paid: `first`), rep = stars for a chapter climbed again, race = [winner, finisher],
  //   lava = stars per flag in a lava round
  const TOWERS = {
    easy: { stages: 30, flag: 1, first: 10, again: 3, chest: [4, 10, 6, 8, 12], rep: 2, race: [4, 2], lava: 0.5, name: 'Easy Tower',
      h: [372, 340, 366, 366, 366, 430, 362, 366, 430, 490, 372, 396, 372, 372, 372, 372, 372, 394, 372, 372, 502, 372, 372, 434, 600, 600, 700, 580, 600, 700] },
    hard: { stages: 30, flag: 2, first: 20, again: 6, chest: [8, 20, 12, 14, 20], rep: 4, race: [6, 3], lava: 0.75, name: 'Hard Tower',
      h: [420, 420, 420, 520, 420, 420, 420, 420, 504, 420, 504, 588, 420, 420, 420, 420, 420, 554, 420, 420, 420, 420, 504, 504, 680, 680, 760, 760, 680, 780] }
  };
  const MIN_FLAG_MS = 1200;      // no stage can be climbed faster (a perfect run of the shortest stage takes 1.4 s)
  const CH_PER_DAY = 8;          // paid repeat chapters per tower and day
  const RACE_PER_DAY = 6;        // paid races per day
  const LAVA_PER_DAY = 5;        // paid lava rounds per day
  const LAVA_MAX = 8, LAVA_WIN = 2;   // most stars for the flags of a lava round, and what the last one climbing gets on top
  const ENDLESS_N = 60;          // stages of the tower of the day (public/games/obby.js makes them)
  const ENDLESS_STARS = 20;      // stars the endless tower pays per day (1 for a flag that is new today, 2 for every fifth)
  const KEEP_MS = 4 * 60000;     // a climb survives a dropped connection this long
  const BOARD = 5, CBOARD = 3;
  const WIDTH = 800;
  const GATHER_MS = 10000;       // after the first "ready" the others have this long to join
  const ALL_READY_MS = 1500;     // ... or this long when everybody at the entrance is ready
  const COUNT_MS = 3500;         // 3, 2, 1, go
  const RACE_AFTER_MS = 40000;   // a race ends this long after the winner arrived
  const RACE_MAX_MS = 6 * 60000, LAVA_MAX_MS = 9 * 60000;
  const LAVA_LAST_MS = 20000;    // the last one climbing has this long for the record once the others are out
  // the lava: starts h0 units under the ground, rises with v0 units a second and gets faster by a every second
  const LAVA = { easy: { h0: 300, v0: 16, a: 0.24 }, hard: { h0: 320, v0: 13, a: 0.18 } };
  const GHOST_MAX = 6000;        // longest recording of a race that is kept (characters)

  const runs = {};               // player key -> the climb in progress (kept by key: ids change on reconnect)
  const parties = { race: party('race'), lava: party('lava') };
  let ticker = null, lastPurge = 0;

  function int(v, a, b) { v = parseInt(v, 10); return api.clamp(isFinite(v) ? v : 0, a, b); }
  function towerOf(v) { return v === 'easy' || v === 'hard' ? v : null; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function party(mode) { return { mode: mode, state: 'idle', tower: 'easy', ch: 0, ready: {}, next: null, startAt: 0, at: 0, members: {}, n: 0, done: 0, firstFin: 0, lastOut: 0 }; }
  // how high a flag is above the ground (world units)
  function baseOf(tower, flag) { const h = TOWERS[tower].h; let y = 0; for (let i = 0; i < flag && i < h.length; i++) y += h[i]; return y; }
  function lavaAt(tower, ms) { const L = LAVA[tower], t = Math.max(0, ms) / 1000; return -L.h0 + L.v0 * t + L.a * t * t / 2; }

  // ---------- saved data ----------
  function all(p) {
    const prof = api.prof(p);
    if (!prof) return null;
    if (!obj(prof[ID])) prof[ID] = {};
    return prof[ID];
  }
  // the player's saved numbers for one tower; old or damaged saves are repaired on the way (fields are only ever added)
  function data(p, tower) {
    const a = all(p);
    if (!a) return null;
    let d = a[tower];
    if (!obj(d)) d = a[tower] = {};
    const n = TOWERS[tower].stages;
    d.top = int(d.top, 0, n);
    d.cur = int(d.cur, 0, n - 1);
    d.best = int(d.best, 0, 1e9);
    d.fin = int(d.fin, 0, 1e9);
    d.paid = int(d.paid, 0, 99);
    if (typeof d.day !== 'string') d.day = '';
    d.full = int(d.full, 0, 1e9);
    d.tops = int(d.tops, 0, 1e9);
    d.cp = int(d.cp, 0, 99);
    if (typeof d.cd !== 'string') d.cd = '';
    if (!Array.isArray(d.ch)) d.ch = [];
    for (let i = 0; i < n / CHAP; i++) d.ch[i] = int(d.ch[i], 0, 1e9);
    d.ch.length = n / CHAP;
    return d;
  }
  // the player's saved numbers for a way to play ('race', 'lava', 'endless'); a new day starts the daily counts again
  function mdata(p, mode) {
    const a = all(p);
    if (!a) return null;
    let d = a[mode];
    if (!obj(d)) d = a[mode] = {};
    const day = api.today();
    d.paid = int(d.paid, 0, 999);
    d.n = int(d.n, 0, 1e9);
    if (mode === 'endless') { d.top = int(d.top, 0, ENDLESS_N); d.best = int(d.best, 0, ENDLESS_N); if (typeof d.bday !== 'string') d.bday = ''; }
    else d.wins = int(d.wins, 0, 1e9);
    if (mode === 'race' && !obj(d.ghost)) d.ghost = {};
    if (mode === 'lava') { if (!obj(d.best)) d.best = {}; d.best.easy = int(d.best.easy, 0, 1e6); d.best.hard = int(d.best.hard, 0, 1e6); }
    if (d.day !== day) { d.day = day; d.paid = 0; if (mode === 'endless') d.top = 0; }
    return d;
  }
  function list(v) { return Array.isArray(v) ? v.filter(obj) : []; }
  function board() {
    let b = api.save[ID];
    if (!obj(b)) b = api.save[ID] = {};
    Object.keys(TOWERS).forEach(function (t) { if (!Array.isArray(b[t])) b[t] = []; });
    if (!obj(b.full)) b.full = {};
    if (!obj(b.chap)) b.chap = {};
    if (!obj(b.lava)) b.lava = {};
    Object.keys(TOWERS).forEach(function (t) {
      b.full[t] = list(b.full[t]); b.lava[t] = list(b.lava[t]);
      if (!Array.isArray(b.chap[t])) b.chap[t] = [];
      for (let i = 0; i < TOWERS[t].stages / CHAP; i++) b.chap[t][i] = list(b.chap[t][i]);
    });
    b.race = list(b.race);
    if (!obj(b.endless)) b.endless = {};
    b.endless.all = list(b.endless.all);
    b.endless.today = list(b.endless.today);
    if (b.endless.day !== api.today()) { b.endless.day = api.today(); b.endless.today = []; }
    return b;
  }
  // puts a result on a family list (one line per player, the best `size` stay); returns the player's place, 0 = not on it
  function put(l, p, field, v, low, size) {
    const old = l.filter(function (e) { return e && e.key === p.key; })[0];
    if (old) { if (low ? v < old[field] : v > old[field]) { old[field] = v; old.day = api.today(); } old.name = p.name; }
    else { const e = { key: p.key, name: p.name, day: api.today() }; e[field] = v; l.push(e); }
    l.sort(function (a, b) { return low ? a[field] - b[field] : b[field] - a[field]; });
    if (l.length > size) l.length = size;
    for (let i = 0; i < l.length; i++) if (l[i].key === p.key) return i + 1;
    return 0;
  }
  function rows(l, field, size) {
    return list(l).slice(0, size).map(function (e) { const o = { name: String(e.name || '?'), key: String(e.key || '') }; o[field] = int(e[field], 0, 1e9); return o; });
  }
  function boardMsg() {
    const b = board(), out = { full: {}, chap: {}, lava: {} };
    Object.keys(TOWERS).forEach(function (t) {
      out[t] = rows(b[t], 'ms', BOARD);                       // the first 12 stages (the old board)
      out.full[t] = rows(b.full[t], 'ms', BOARD);
      out.chap[t] = b.chap[t].map(function (l) { return rows(l, 'ms', CBOARD); });
      out.lava[t] = rows(b.lava[t], 'h', BOARD);
    });
    out.race = rows(b.race, 'wins', BOARD);
    out.endless = { day: b.endless.day, today: rows(b.endless.today, 'n', BOARD), all: rows(b.endless.all, 'n', BOARD) };
    return out;
  }
  function sendBoard() { api.broadcast({ t: ID + '.lb', lb: boardMsg() }, api.inRoom(ID)); }
  function meMsg(p) {
    const m = { t: ID + '.me' }, day = api.today();
    Object.keys(TOWERS).forEach(function (t) {
      const d = data(p, t);
      if (d) m[t] = { top: d.top, cur: d.cur, best: d.best, fin: d.fin, full: d.full, tops: d.tops, ch: d.ch.slice(), left: CH_PER_DAY - (d.cd === day ? d.cp : 0) };
    });
    const r = mdata(p, 'race'), l = mdata(p, 'lava'), e = mdata(p, 'endless');
    if (r) {
      m.race = { left: RACE_PER_DAY - r.paid, wins: r.wins, n: r.n, best: {} };
      Object.keys(r.ghost).forEach(function (k) { if (obj(r.ghost[k])) m.race.best[k] = int(r.ghost[k].ms, 0, 1e9); });
    }
    if (l) m.lava = { left: LAVA_PER_DAY - l.paid, wins: l.wins, n: l.n, best: { easy: l.best.easy, hard: l.best.hard } };
    if (e) m.endless = { top: e.top, best: e.best, left: Math.max(0, ENDLESS_STARS - e.paid), n: e.n };
    return m;
  }

  // ---------- who is where ----------
  function place(r) { return r.mode === 'tower' ? r.tower : r.mode; }     // players in the same place see each other
  function active(r) { return !!r && !r.over && !r.out && !r.watch && !r.fin; }
  function runMsg(r, now) {
    const m = { mode: r.mode, tower: r.tower, flag: r.flag, from: r.from, end: r.end, timed: r.timed, ct: r.ct, fin: r.fin, out: !!r.out, over: !!r.over, watch: !!r.watch,
      el: r.t0 ? now - r.t0 : r.timed && r.go ? now - r.go : -1, cel: r.c0 ? now - r.c0 : r.ct && r.go ? now - r.go : -1 };
    if (r.party) { m.at = r.party.at; m.n = r.party.n; if (r.mode === 'lava') m.lava = LAVA[r.tower]; }
    if (r.mode === 'endless') m.seed = r.day;
    return m;
  }
  function whoList() {
    const out = [];
    Object.keys(runs).forEach(function (k) { const r = runs[k]; if (r.id && !r.watch && !r.over && !r.out) out.push([r.id, place(r), r.flag, r.fin ? 1 : 0, r.tower]); });
    return out;
  }
  function sendWho() { api.broadcast({ t: ID + '.who', list: whoList() }, api.inRoom(ID)); }
  function online(key) { let f = null; api.roomList(ID).forEach(function (pl) { if (pl.key === key) f = pl; }); return f; }
  function partyMsg() {
    const out = { t: ID + '.pt', now: Date.now() };
    Object.keys(parties).forEach(function (k) {
      const P = parties[k];
      out[k] = { state: P.state, tower: P.tower, ch: P.ch, at: P.startAt, ready: Object.keys(P.ready).map(function (key) { return P.ready[key]; }), next: P.next,
        on: Object.keys(P.members).map(function (key) { const mb = P.members[key]; return [mb.name, mb.flag, mb.fin ? 1 : mb.out ? 2 : 0]; }) };
    });
    return out;
  }
  function sendParty() { api.broadcast(partyMsg(), api.inRoom(ID)); }
  // a round as it stands, for everybody in it: [id, name, flag, time of arrival, out, metres]
  function sendRank(P) {
    const l = Object.keys(P.members).map(function (key) { const mb = P.members[key]; return [mb.id, mb.name, mb.flag, mb.fin, mb.out ? 1 : 0, mb.h]; });
    Object.keys(runs).forEach(function (k) { const r = runs[k]; if (r.party === P && r.id) { const pl = api.players.get(r.id); if (pl) api.send(pl, { t: ID + '.rk', mode: P.mode, list: l }); } });
  }

  // climbs of players who lost the connection wait a few minutes, then they are forgotten
  function purge(now) {
    lastPurge = now;
    Object.keys(runs).forEach(function (k) {
      const r = runs[k];
      if (r.id) { const pl = api.players.get(r.id); if (!pl || pl.room !== ID) { r.id = 0; r.gone = now; } }
      if (!r.id && (now - r.gone > KEEP_MS || r.over || r.watch)) delete runs[k];
    });
  }
  // 10 times a second everyone gets the positions of the others in the same place; the rounds move on
  function tick() {
    const now = Date.now(), by = {};
    let any = false;
    if (now - lastPurge > 5000) purge(now);
    Object.keys(parties).forEach(function (k) { if (parties[k].state !== 'idle') { any = true; partyTick(parties[k], now); } });
    Object.keys(runs).forEach(function (k) {
      const r = runs[k];
      if (!r.id) return;
      any = true;
      if (r.pos && !r.watch && !r.out && !r.over) (by[place(r)] = by[place(r)] || []).push([r.id, r.x, r.y, r.f, r.m]);
    });
    if (!any) {
      if (!Object.keys(runs).length) { clearInterval(ticker); ticker = null; }
      return;
    }
    Object.keys(runs).forEach(function (k) {
      const r = runs[k], l = by[place(r)];
      if (!r.id || !l || (l.length === 1 && l[0][0] === r.id)) return;
      const pl = api.players.get(r.id);
      if (pl) api.send(pl, { t: ID + '.st', p: l });
    });
  }
  function startTicker() { if (!ticker) ticker = setInterval(tick, 100); }

  // ---------- Climb: the towers at your own pace ----------
  function towerFlag(p, r, i, now) {
    const cfg = TOWERS[r.tower], d = data(p, r.tower), day = api.today();
    if (!d) return;
    const begun = r.go || r.made;
    if (r.timed && !r.t0) r.t0 = begun;
    if (r.ct && !r.c0) r.c0 = begun;
    const fresh = i > d.top, out = { t: ID + '.flag', ok: true, i: i, stars: 0, first: fresh };
    let stars = 0, lb = false;
    if (fresh) d.top = i;
    if (i % CHAP) { if (fresh) stars = cfg.flag; }
    else {
      // the rest platform at the end of a chapter: a chest the first time, a little for climbing the whole chapter again
      const k = i / CHAP - 1;
      if (fresh) stars = cfg.chest[k];
      else if (r.from <= i - CHAP) {
        if (d.cd !== day) { d.cd = day; d.cp = 0; }
        if (d.cp < CH_PER_DAY) { d.cp++; stars = cfg.rep; }
      }
      out.ch = { k: k, ms: 0, best: d.ch[k], newBest: false, rank: 0 };
      if (r.c0) {                // the chapter was climbed from its first flag: it has a time
        const ms = Math.max(1, now - r.c0);
        if (!d.ch[k] || ms < d.ch[k]) { d.ch[k] = ms; out.ch.newBest = true; }
        out.ch.ms = ms; out.ch.best = d.ch[k];
        out.ch.rank = put(board().chap[r.tower][k], p, 'ms', ms, true, CBOARD);
        lb = true;
      }
      r.c0 = now;                // the next chapter starts here
      if (i === OLD) {
        // the top of the tower as it was first released: its times stay the record of the first 12 stages
        d.fin++;
        if (r.timed) {
          const ms = Math.max(1, now - r.t0);
          out.old = { ms: ms, newBest: false, rank: 0 };
          if (!d.best || ms < d.best) { d.best = ms; out.old.newBest = true; }
          out.old.best = d.best;
          out.old.rank = put(board()[r.tower], p, 'ms', ms, true, BOARD);
          lb = true;
        }
      }
    }
    if (i < cfg.stages) {
      if (i > d.cur) d.cur = i;
      out.stars = stars;
      api.send(p, out);
    } else {
      // the top of the tower
      let ms = 0, newBest = false, rank = 0;
      d.tops++; d.cur = 0; r.fin = true;
      if (r.timed) {
        ms = Math.max(1, now - r.t0);
        if (!d.full || ms < d.full) { d.full = ms; newBest = true; }
        rank = put(board().full[r.tower], p, 'ms', ms, true, BOARD);
        lb = true;
      }
      api.send(p, { t: ID + '.done', tower: r.tower, i: i, timed: r.timed, ms: ms, best: d.full, newBest: newBest, rank: rank, stars: stars, first: fresh, ch: out.ch,
        left: CH_PER_DAY - (d.cd === day ? d.cp : 0) });
      api.toast(p.name + ' reached the top of the ' + cfg.name + '!', function (o) { return o.id !== p.id; });
    }
    if (lb) sendBoard();
    return stars;
  }

  // ---------- Race and Rising lava: rounds for everybody who pressed Ready ----------
  // players at the entrance (not in the middle of a climb)
  function idle() { return api.roomList(ID).filter(function (pl) { return !active(runs[pl.key]); }); }
  function begin(P, now) {
    const race = P.mode === 'race', start = race ? P.ch * CHAP : 0, end = race ? start + CHAP : TOWERS[P.tower].stages;
    const who = api.roomList(ID).filter(function (pl) { return P.ready[pl.key] && !active(runs[pl.key]); });
    P.ready = {}; P.next = null;
    if (!who.length) { P.state = 'idle'; sendParty(); return; }
    // whoever still watches the last round goes back to the entrance
    Object.keys(runs).forEach(function (k) { const r = runs[k]; if (r.party === P) { const pl = r.id && api.players.get(r.id); delete runs[k]; if (pl && !who.some(function (w) { return w.key === k; })) api.send(pl, { t: ID + '.run', mode: P.mode, gone: true }); } });
    P.members = {}; P.n = who.length; P.done = 0; P.firstFin = 0; P.lastOut = 0; P.at = now + COUNT_MS; P.state = 'run';
    who.forEach(function (pl) {
      P.members[pl.key] = { key: pl.key, name: pl.name, id: pl.id, flag: start, fin: 0, out: false, safe: false, outAt: 0, h: 0, stars: 0, place: 0, paid: false, under: 0 };
      runs[pl.key] = { mode: P.mode, tower: P.tower, flag: start, from: start, end: end, timed: false, ct: false, t0: 0, c0: 0, go: 0, made: now, lastAt: P.at, id: pl.id, gone: 0, fin: false,
        x: 0, y: 0, f: 1, m: 0, pos: false, hmax: 0, party: P };
      const m = { t: ID + '.run', mode: P.mode, tower: P.tower, flag: start, end: end, at: P.at, now: now, n: P.n };
      if (!race) m.lava = LAVA[P.tower];
      else if (P.n === 1) {      // alone: against the ghost of the best race of this chapter
        const g = mdata(pl, 'race').ghost[P.tower + P.ch];
        if (obj(g) && g.ms > 0) m.ghost = { ms: int(g.ms, 0, 1e9), s: typeof g.s === 'string' ? g.s : '' };
      }
      api.send(pl, m);
    });
    sendParty(); sendWho(); sendRank(P);
  }
  function partyTick(P, now) {
    if (P.state === 'gather') {
      Object.keys(P.ready).forEach(function (key) { if (!online(key)) delete P.ready[key]; });
      if (!Object.keys(P.ready).length) { P.state = 'idle'; sendParty(); return; }
      // everybody at the entrance is ready: no need to wait for more
      if (P.startAt > now + ALL_READY_MS && idle().every(function (pl) { return P.ready[pl.key]; })) { P.startAt = now + ALL_READY_MS; sendParty(); }
      if (now >= P.startAt) begin(P, now);
      return;
    }
    if (P.state !== 'run') return;
    const keys = Object.keys(P.members);
    if (P.mode === 'race') {
      const open = keys.filter(function (k) { const mb = P.members[k]; return !mb.fin && !mb.out; });
      if (!open.length || (P.firstFin && now > P.firstFin + RACE_AFTER_MS) || now > P.at + RACE_MAX_MS) endRound(P, now);
      return;
    }
    // the lava catches whoever stands still, lost the connection or does not say so
    if (now < P.at) return;
    const lava = lavaAt(P.tower, now - P.at);
    keys.forEach(function (k) {
      const mb = P.members[k], r = runs[k];
      if (mb.out || mb.safe || !r || r.party !== P) return;
      const h = r.pos ? -r.y : baseOf(P.tower, mb.flag);
      if (h < lava - 50) { mb.under += 100; if (mb.under > 1500 || !r.id) lavaOut(P, mb, r, now); } else mb.under = 0;
    });
    const alive = keys.filter(function (k) { const mb = P.members[k]; return !mb.out && !mb.safe; });
    if (!alive.length || (P.n > 1 && alive.length === 1 && P.lastOut && now > P.lastOut + LAVA_LAST_MS) || now > P.at + LAVA_MAX_MS) endRound(P, now);
  }
  // the lava got this player (or the player left): the flags reached pay now
  function lavaOut(P, mb, r, now) {
    if (mb.out || mb.safe) return;
    const cfg = TOWERS[P.tower], pl = online(mb.key);
    const lo = baseOf(P.tower, mb.flag), hi = mb.flag < cfg.stages ? baseOf(P.tower, mb.flag + 1) + 60 : lo;
    mb.out = true; mb.outAt = now; P.lastOut = now;
    mb.h = Math.round(api.clamp(r ? r.hmax : 0, lo, Math.max(lo, hi)) / 10);      // metres
    if (r) r.out = true;
    lavaPay(P, mb, pl, 0);
    sendRank(P); sendWho();
  }
  function lavaPay(P, mb, pl, bonus) {
    if (!pl) return;
    const md = mdata(pl, 'lava'), flags = mb.flag;
    let stars = 0, rec = false, rank = 0;
    if (!mb.paid) {
      mb.paid = true; md.n++;
      if (flags > 0 && md.paid < LAVA_PER_DAY) { md.paid++; mb.counted = true; stars = Math.min(LAVA_MAX, Math.ceil(flags * TOWERS[P.tower].lava)); }
      if (flags >= 3) api.questEvent(pl, ID + '.mode');
    }
    if (bonus && mb.counted) stars += bonus;
    if (mb.h > md.best[P.tower]) { md.best[P.tower] = mb.h; rec = true; }
    if (mb.h > 0) { rank = put(board().lava[P.tower], pl, 'h', mb.h, false, BOARD); }
    mb.stars += stars;
    api.saveSoon();
    if (stars > 0) api.addStars(pl, stars);
    api.send(pl, { t: ID + '.out', tower: P.tower, h: mb.h, flag: flags, stars: mb.stars, best: md.best[P.tower], rec: rec, rank: rank, safe: mb.safe, left: LAVA_PER_DAY - md.paid, win: !!bonus });
    api.send(pl, meMsg(pl));
    if (rec || rank) sendBoard();
  }
  function endRound(P, now) {
    const keys = Object.keys(P.members), race = P.mode === 'race', start = race ? P.ch * CHAP : 0;
    let order;
    if (race) {
      // whoever did not arrive: a star for trying when at least two flags were reached
      keys.forEach(function (k) {
        const mb = P.members[k], pl = online(k);
        if (mb.fin || mb.paid || !pl) return;
        const md = mdata(pl, 'race');
        mb.paid = true; md.n++;
        if (mb.flag - start >= 2 && !mb.left && md.paid < RACE_PER_DAY) { md.paid++; mb.stars = 1; api.addStars(pl, 1); }
        if (mb.flag - start >= 3) api.questEvent(pl, ID + '.mode');
        api.send(pl, meMsg(pl));
      });
      order = keys.map(function (k) { return P.members[k]; }).sort(function (a, b) { return (a.fin || 1e12) - (b.fin || 1e12) || b.flag - a.flag; });
    } else {
      // still climbing when the round ends: the winner
      keys.forEach(function (k) { const mb = P.members[k]; if (!mb.out && !mb.safe) { const r = runs[k]; lavaOut(P, mb, r && r.party === P ? r : null, now + 1); } });
      order = keys.map(function (k) { return P.members[k]; }).sort(function (a, b) { return (b.safe ? 1 : 0) - (a.safe ? 1 : 0) || (a.safe ? a.fin - b.fin : b.outAt - a.outAt) || b.h - a.h; });
      if (P.n > 1 && order[0].flag > 0) {
        const pl = online(order[0].key);
        if (pl) { const md = mdata(pl, 'lava'); md.wins++; lavaPay(P, order[0], pl, LAVA_WIN); }
      }
    }
    order.forEach(function (mb, i) { mb.place = i + 1; });
    const res = { t: ID + '.res', mode: P.mode, tower: P.tower, ch: P.ch, n: P.n,
      rows: order.map(function (mb) { return { name: mb.name, key: mb.key, flag: mb.flag, ms: mb.fin, h: mb.h, place: mb.place, stars: mb.stars, safe: mb.safe, done: race ? mb.fin > 0 : true }; }) };
    Object.keys(runs).forEach(function (k) {
      const r = runs[k];
      if (r.party !== P) return;
      r.over = true;
      const pl = r.id && api.players.get(r.id);
      if (pl) api.send(pl, res); else delete runs[k];
    });
    api.saveSoon();
    P.members = {}; P.state = 'idle';
    if (Object.keys(P.ready).length) {       // some are ready for the next round already
      if (P.next) { P.tower = P.next.tower; P.ch = P.next.ch; }
      P.state = 'gather'; P.startAt = now + GATHER_MS / 2;
    }
    P.next = null;
    sendParty(); sendWho(); sendBoard();
  }
  function raceFlag(p, r, i, now) {
    const P = r.party, mb = P.members[p.key];
    if (!mb) return 0;
    mb.flag = i;
    if (i < r.end) { api.send(p, { t: ID + '.flag', ok: true, i: i, stars: 0, first: false }); sendRank(P); return 0; }
    // at the top flag of the chapter
    const cfg = TOWERS[P.tower], md = mdata(p, 'race'), d = data(p, P.tower), ms = Math.max(1, now - P.at), gk = P.tower + P.ch, solo = P.n === 1;
    const old = obj(md.ghost[gk]) ? int(md.ghost[gk].ms, 0, 1e9) : 0, pb = !old || ms < old;
    let stars = 0, rank = 0;
    r.fin = true; mb.fin = ms; mb.place = ++P.done; mb.paid = true; md.n++;
    if (mb.place === 1) P.firstFin = now;
    if (pb) { md.ghost[gk] = { ms: ms, s: '' }; r.ghostKey = gk; r.ghostUntil = now + 20000; }    // the tablet sends the recording next
    if (md.paid < RACE_PER_DAY) {
      md.paid++;
      stars = solo ? cfg.race[1] + (pb && old ? 1 : 0) : mb.place === 1 ? cfg.race[0] : cfg.race[1];
    }
    if (!solo && mb.place === 1) { md.wins++; put(board().race, p, 'wins', md.wins, false, BOARD); }
    if (d) { if (!d.ch[P.ch] || ms < d.ch[P.ch]) d.ch[P.ch] = ms; rank = put(board().chap[P.tower][P.ch], p, 'ms', ms, true, CBOARD); }
    mb.stars = stars;
    api.send(p, { t: ID + '.fin', tower: P.tower, ch: P.ch, i: i, place: mb.place, n: P.n, ms: ms, stars: stars, pb: pb, beat: pb && !!old, best: pb ? ms : old, rank: rank, left: RACE_PER_DAY - md.paid });
    api.questEvent(p, ID + '.mode');
    sendRank(P); sendBoard();
    return stars;
  }
  function lavaFlag(p, r, i, now) {
    const P = r.party, mb = P.members[p.key];
    if (!mb) return 0;
    mb.flag = i;
    api.send(p, { t: ID + '.flag', ok: true, i: i, stars: 0, first: false });
    if (i >= r.end) {            // out of the top of the tower: the lava cannot follow
      mb.safe = true; mb.fin = now - P.at; mb.outAt = now; mb.h = Math.round(baseOf(P.tower, i) / 10); r.fin = true; P.lastOut = P.lastOut || now;
      lavaPay(P, mb, p, 0);
    }
    sendRank(P);
    return 0;
  }

  // ---------- the Endless tower: a new one every day ----------
  function endlessFlag(p, r, i) {
    const md = mdata(p, 'endless'), b = board(), out = { t: ID + '.flag', ok: true, i: i, stars: 0, first: false, rec: false };
    let stars = 0;
    if (i > md.top) {            // new for today
      md.top = i; out.first = true;
      stars = Math.min(i % 5 ? 1 : 2, Math.max(0, ENDLESS_STARS - md.paid));
      md.paid += stars;
      put(b.endless.today, p, 'n', i, false, BOARD);
    }
    if (i > md.best) { md.best = i; md.bday = api.today(); out.rec = true; put(b.endless.all, p, 'n', i, false, BOARD); }
    out.stars = stars; r.earned = (r.earned || 0) + stars;
    api.send(p, out);
    if (out.first || out.rec) sendBoard();
    if (i >= r.end) { r.fin = true; endlessOver(p, r, true); }
    return stars;
  }
  function endlessOver(p, r, top) {
    const md = mdata(p, 'endless'), b = board();
    function rankIn(l) { for (let i = 0; i < l.length; i++) if (l[i].key === p.key) return i + 1; return 0; }
    md.n++;
    if (md.best > 0) put(b.endless.all, p, 'n', md.best, false, BOARD);       // (a best from before the board knew it)
    if (r.flag >= 3) api.questEvent(p, ID + '.mode');
    api.send(p, { t: ID + '.over', mode: 'endless', flag: r.flag, top: !!top, today: md.top, best: md.best, stars: r.earned || 0, left: Math.max(0, ENDLESS_STARS - md.paid),
      rankToday: rankIn(b.endless.today), rankAll: rankIn(b.endless.all) });
    delete runs[p.key];
    api.saveSoon();
    api.send(p, meMsg(p));
  }

  // a climb ends because the player went back to the entrance or to town
  function endRun(p, r) {
    const P = r.party, mb = P && P.members[p.key];
    if (r.mode === 'endless' && !r.fin) { endlessOver(p, r, false); return; }
    if (mb && P.state === 'run' && !r.over && !r.watch) {
      if (r.mode === 'lava') lavaOut(P, mb, r, Date.now());
      else if (!mb.fin) { mb.out = true; mb.left = true; sendRank(P); }
    }
    delete runs[p.key];
  }
  function unready(p) {
    let ch = false;
    Object.keys(parties).forEach(function (k) {
      const P = parties[k];
      if (!P.ready[p.key]) return;
      delete P.ready[p.key]; ch = true;
      if (P.state === 'gather' && !Object.keys(P.ready).length) P.state = 'idle';
    });
    return ch;
  }

  api.room({
    enter: function (p) {
      const now = Date.now();
      purge(now);
      const r = runs[p.key];
      if (r) {                   // back after a dropped connection: the climb goes on
        r.id = p.id; r.gone = 0;
        if (r.party && r.party.members[p.key]) r.party.members[p.key].id = p.id;
        startTicker();
      }
      api.send(p, {
        t: ID + '.hello', now: now, towers: TOWERS, chap: CHAP, perDay: CH_PER_DAY, day: api.today(), endlessN: ENDLESS_N,
        caps: { race: RACE_PER_DAY, lava: LAVA_PER_DAY, lavaMax: LAVA_MAX, lavaWin: LAVA_WIN, endless: ENDLESS_STARS },
        me: meMsg(p), lb: boardMsg(), who: whoList(), pt: partyMsg(), run: r ? runMsg(r, now) : null
      });
      if (r) { sendWho(); if (r.party && r.party.state === 'run') sendRank(r.party); }
    },
    leave: function (p) {
      const r = runs[p.key], ch = unready(p);
      if (r) {
        if (api.players.has(p.id)) endRun(p, r);            // walked back to town: the climb ends (flags stay saved)
        else { r.id = 0; r.gone = Date.now(); }             // connection lost: keep it for a while
        sendWho();
      }
      if (ch) sendParty();
    }
  });

  // start a climb: from the bottom (a timed run), from the first flag of a chapter reached before (its time counts),
  // or from any flag of the unfinished climb. { mode: 'endless' } starts the tower of the day.
  api.on('start', function (p, m) {
    if (p.room !== ID || !m) return;
    const now = Date.now(), old = runs[p.key];
    if (m.mode === 'endless') {
      if (old) endRun(p, old);
      unready(p);
      runs[p.key] = { mode: 'endless', tower: 'day', flag: 0, from: 0, end: ENDLESS_N, timed: false, ct: false, t0: 0, c0: 0, go: 0, made: now, lastAt: now, id: p.id, gone: 0, fin: false,
        x: 0, y: 0, f: 1, m: 0, pos: false, hmax: 0, day: api.today(), earned: 0 };
      api.send(p, { t: ID + '.run', mode: 'endless', tower: 'day', seed: runs[p.key].day, flag: 0, end: ENDLESS_N });
      startTicker(); sendWho(); sendParty();
      return;
    }
    const tower = towerOf(m.tower);
    if (!tower) return;
    const d = data(p, tower);
    if (!d) return;
    if (old) endRun(p, old);
    unready(p);
    let from = int(m.from, 0, TOWERS[tower].stages - 1);
    if (from % CHAP || from > d.top) from = Math.min(from, d.cur);
    runs[p.key] = { mode: 'tower', tower: tower, flag: from, from: from, end: TOWERS[tower].stages, timed: from === 0, ct: from % CHAP === 0, t0: 0, c0: 0, go: 0, made: now, lastAt: now, id: p.id, gone: 0, fin: false,
      x: 0, y: 0, f: 1, m: 0, pos: false, hmax: 0 };
    api.send(p, { t: ID + '.run', mode: 'tower', tower: tower, flag: from, timed: from === 0, ct: from % CHAP === 0, keep: !!m.keep });
    startTicker(); sendWho(); sendParty();
  });
  // the clocks of a climb start with the first step
  api.on('go', function (p) {
    const r = runs[p.key];
    if (p.room !== ID || !r || r.id !== p.id || r.mode !== 'tower' || r.go || r.flag !== r.from) return;
    r.go = Date.now();
  });
  api.on('pos', function (p, m) {
    const r = runs[p.key];
    if (p.room !== ID || !r || r.id !== p.id || !m || r.watch) return;
    r.x = Math.round(api.clamp(+m.x || 0, 0, WIDTH));
    r.y = Math.round(api.clamp(+m.y || 0, -60000, 600));
    r.f = m.f < 0 ? -1 : 1;
    r.m = int(m.m, 0, 2);
    r.pos = true;
    if (-r.y > r.hmax) r.hmax = -r.y;
  });
  // "I am at flag i". Flags count only in order, one after the other, and never faster than a stage can be climbed.
  api.on('flag', function (p, m) {
    if (p.room !== ID || !m) return;
    const r = runs[p.key], now = Date.now();
    if (!r || r.id !== p.id || r.watch) { api.send(p, { t: ID + '.flag', ok: false, none: true }); return; }
    const i = parseInt(m.i, 10);
    if (r.fin || r.over || r.out || i !== r.flag + 1 || i > r.end) { api.send(p, { t: ID + '.flag', ok: false, i: r.flag }); return; }
    if (now - r.lastAt < MIN_FLAG_MS) { api.send(p, { t: ID + '.flag', ok: false, i: r.flag, wait: MIN_FLAG_MS - (now - r.lastAt) }); return; }
    if (r.mode === 'endless' && r.day !== api.today()) { endlessOver(p, r, false); sendWho(); return; }   // midnight: there is a new tower now
    r.flag = i; r.lastAt = now;
    const stars = r.mode === 'tower' ? towerFlag(p, r, i, now) : r.mode === 'race' ? raceFlag(p, r, i, now) : r.mode === 'lava' ? lavaFlag(p, r, i, now) : endlessFlag(p, r, i);
    api.saveSoon();
    api.questEvent(p, ID + '.flag');
    if (stars > 0) api.addStars(p, stars);
    api.send(p, meMsg(p));
    sendWho();
  });
  // the lava got me / my hearts are gone
  api.on('out', function (p) {
    const r = runs[p.key];
    if (p.room !== ID || !r || r.id !== p.id || r.watch || r.over || r.out || r.fin) return;
    if (r.mode === 'endless') { endlessOver(p, r, false); sendWho(); }
    else if (r.mode === 'lava' && r.party.members[p.key] && Date.now() >= r.party.at) lavaOut(r.party, r.party.members[p.key], r, Date.now());
  });
  // ready (or not any more) for the next race / lava round; the first one ready chooses the tower and the chapter
  api.on('ready', function (p, m) {
    if (p.room !== ID || !m) return;
    const P = parties[m.mode], r = runs[p.key];
    if (!P || active(r)) return;
    if (m.on === false || m.on === 0) { if (unready(p)) sendParty(); return; }
    if (P.state === 'idle' || (P.state === 'run' && !Object.keys(P.ready).length)) {
      const tower = towerOf(m.tower), ch = P.mode === 'race' ? int(m.ch, 0, TOWERS.easy.stages / CHAP - 1) : 0;
      if (!tower) return;
      if (P.mode === 'race') { const d = data(p, tower); if (!d || d.top < ch * CHAP) return; }      // only a chapter the player has reached
      if (P.state === 'idle') { P.tower = tower; P.ch = ch; P.state = 'gather'; P.startAt = Date.now() + GATHER_MS; }
      else P.next = { tower: tower, ch: ch };
      api.toast(p.name + (P.mode === 'race' ? ' wants to race! 🏁' : ' dares the lava! 🌋'), function (o) { return o.room === ID && o.id !== p.id; });
    }
    Object.keys(parties).forEach(function (k) { if (parties[k] !== P && parties[k].ready[p.key]) { delete parties[k].ready[p.key]; if (parties[k].state === 'gather' && !Object.keys(parties[k].ready).length) parties[k].state = 'idle'; } });
    P.ready[p.key] = p.name;
    startTicker();
    sendParty();
  });
  // look at a round that is on
  api.on('watch', function (p, m) {
    if (p.room !== ID || !m) return;
    const P = parties[m.mode], r = runs[p.key];
    if (!P || P.state !== 'run' || active(r)) return;
    if (r) endRun(p, r);
    const race = P.mode === 'race', start = race ? P.ch * CHAP : 0;
    runs[p.key] = { mode: P.mode, tower: P.tower, flag: start, from: start, end: race ? start + CHAP : TOWERS[P.tower].stages, watch: true, id: p.id, gone: 0, fin: false, x: 0, y: 0, f: 1, m: 0, pos: false, hmax: 0, party: P, made: Date.now(), lastAt: 0 };
    const msg = { t: ID + '.run', mode: P.mode, tower: P.tower, flag: start, end: runs[p.key].end, at: P.at, now: Date.now(), n: P.n, watch: true };
    if (!race) msg.lava = LAVA[P.tower];
    api.send(p, msg);
    startTicker();
    sendRank(P);
  });
  // the recording of my best race of a chapter, for my ghost
  api.on('ghost', function (p, m) {
    const r = runs[p.key];
    if (p.room !== ID || !r || !m || !r.ghostKey || Date.now() > r.ghostUntil) return;
    if (typeof m.s !== 'string' || m.s.length > GHOST_MAX || m.s.length % 3 || !/^[A-Za-z0-9_-]*$/.test(m.s)) return;
    const g = mdata(p, 'race').ghost[r.ghostKey];
    if (obj(g)) { g.s = m.s; api.saveSoon(); }
    r.ghostKey = '';
  });
  // back to the tower entrance
  api.on('quit', function (p) {
    const r = runs[p.key];
    if (p.room !== ID || !r) return;
    endRun(p, r);
    sendWho();
  });

  api.addQuest({ type: ID + '.flag', icon: '🚩', solo: true, tiers: [[6, 5], [10, 7], [15, 9]],
    en: 'Reach {n} flags in the Obby Tower', zh: '在障碍塔到达 {n} 面旗子', py: 'zài zhàng\'ài tǎ dàodá {n} miàn qízi', ms: 'Sampai ke {n} bendera di Menara Halangan' });
  api.addQuest({ type: ID + '.mode', icon: '🌋', solo: true, tiers: [[2, 5], [3, 7], [4, 9]],
    en: 'Play {n} rounds of Race, Lava or Endless in the Obby Tower', zh: '在障碍塔玩 {n} 局比赛、岩浆或无尽塔', py: 'zài zhàng\'ài tǎ wán {n} jú bǐsài, yánjiāng huò wújìn tǎ', ms: 'Main {n} pusingan Lumba, Lava atau Menara Tanpa Henti di Menara Halangan' });
};
