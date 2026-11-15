// Race Track (server): a side-view lane racer with the cars designed in the Car Garage.
// The server owns the lobby, the start, the seed of the course, the robot cars, the finishing order, the
// rewards and the best times. Each tablet drives its own car and reports where it is about 10 times a second.
// Client part: dev/public/games/race.js. The block marked "shared" must stay the same in both files.
//
// Saved data:
//   profile.race = { best: { town: ms, beach: ms, night: ms }, cups: { town: 0..3 medals }, day: 'YYYY-MM-DD', n: rewarded races today, races, wins }
//   save.race    = { board: { town: [{ key, name, ms, day }], ... } }   the family's top 5 per track, one line per player
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
// ---------- end of the shared part ----------

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

module.exports = function (api) {
  const ID = api.id, here = api.inRoom(ID);
  const st = { phase: 'lobby', ready: {}, votes: {}, race: null, timer: null, lastTrack: 0, nextRid: 1 };

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
    return d;
  }
  function board() {
    const s = (api.save[ID] && typeof api.save[ID] === 'object') ? api.save[ID] : (api.save[ID] = {});
    if (!s.board || typeof s.board !== 'object') s.board = {};
    return s.board;
  }

  // ---------- lobby ----------
  function lobbyMsg(p) {
    const d = data(p) || { best: {}, cups: {}, n: 0 }, b = board(), top = {}, goals = {};
    GEN.forEach(function (g) {
      goals[g.id] = cupTimes(g);
      top[g.id] = (Array.isArray(b[g.id]) ? b[g.id] : []).slice(0, 5).map(function (e) { return { name: e.name, ms: e.ms, me: e.key === p.key }; });
    });
    return {
      t: 'race.lobby', phase: st.phase, you: p.id, cur: st.lastTrack,
      who: api.roomList(ID).map(function (q) {
        return { id: q.id, name: q.name, color: q.color, car: q.car || null, lv: api.levelOf(q.stars), ready: !!st.ready[q.key], vote: st.votes[q.key] >= 0 ? st.votes[q.key] : -1 };
      }),
      board: top, best: d.best, cups: d.cups, goals: goals, n: d.n, cap: DAY_CAP, pay: PAY, bonus: FIRST_BONUS, grid: GRID
    };
  }
  function sendLobby() { api.roomList(ID).forEach(function (p) { api.send(p, lobbyMsg(p)); }); }
  function maybeStart() { // the countdown starts when everyone who is here is ready
    if (st.phase !== 'lobby') return;
    const list = api.roomList(ID);
    if (list.length && list.every(function (p) { return st.ready[p.key]; })) startCount();
  }

  // ---------- a race ----------
  function pubRacer(r) { return { rid: r.rid, pid: r.pid, name: r.name, color: r.color, car: r.car, bot: r.bot, lane: r.lane, sx: r.sx, lv: r.lv }; }
  function alive(r) { return !r.dropped; }
  function posList(R) { return R.racers.filter(alive).map(function (r) { return [r.rid, Math.round(r.x), r.lane, r.f]; }); }
  function mine(R, p) { return R.racers.find(function (r) { return !r.bot && !r.dropped && r.key === p.key; }) || null; }
  function playerOf(r) { return api.roomList(ID).find(function (p) { return p.key === r.key; }) || null; }
  function stopTimer() { if (st.timer) { clearInterval(st.timer); st.timer = null; } }
  function closeRace() { st.race = null; st.phase = 'lobby'; st.ready = {}; stopTimer(); }

  function startCount() {
    const list = api.roomList(ID).slice(0, MAX_RACERS);
    // the track with the most votes; luck decides a tie; with no votes at all, the last one again
    const tally = GEN.map(function () { return 0; });
    list.forEach(function (p) { const v = st.votes[p.key]; if (v >= 0 && v < GEN.length) tally[v]++; });
    const most = Math.max.apply(null, tally);
    let ti = st.lastTrack;
    if (most > 0) {
      const tied = [];
      tally.forEach(function (n, i) { if (n === most) tied.push(i); });
      ti = tied[Math.floor(Math.random() * tied.length)];
    }
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
      ti: ti, id: T.id, seed: seed, len: T.len, items: items, racers: racers,
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
      const e = list.find(function (o) { return o.key === p.key; });
      if (!e) list.push({ key: p.key, name: p.name, ms: r.ms, day: api.today() });
      else if (r.ms < e.ms) { e.ms = r.ms; e.name = p.name; e.day = api.today(); }
      list.sort(function (a, c) { return a.ms - c.ms; });
      if (list.length > 5) list.length = 5;
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

  // ---------- robots ----------
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
    if (!R) { stopTimer(); return; }
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

  // ---------- the room ----------
  api.room({
    enter: function (p) {
      if (st.race) api.send(p, watchMsg(st.race));       // a race is on: watch until the next one
      sendLobby();
    },
    leave: function (p) {
      delete st.ready[p.key]; delete st.votes[p.key];
      const R = st.race;
      if (R) {
        const r = mine(R, p);
        if (r && !r.done) {                               // dropped from this race; the others carry on
          r.dropped = true;
          api.broadcast({ t: 'race.drop', rid: r.rid }, here);
          after(R);
        }
      }
      if (!api.roomList(ID).length) { closeRace(); return; }
      if (st.phase === 'lobby') { sendLobby(); maybeStart(); }
    }
  });

  // ---------- messages from the tablets ----------
  api.on('vote', function (p, m) {
    if (p.room !== ID) return;
    const v = parseInt(m.track, 10);
    if (!(v >= 0 && v < GEN.length)) return;
    st.votes[p.key] = v;
    if (st.phase === 'lobby') sendLobby();
  });
  api.on('ready', function (p, m) {
    if (p.room !== ID || st.phase !== 'lobby') return;
    if (m.on) st.ready[p.key] = true; else delete st.ready[p.key];
    sendLobby();
    maybeStart();
  });
  api.on('pos', function (p, m) {
    const R = st.race;
    if (!R || p.room !== ID) return;
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
    if (!R || st.phase !== 'race' || p.room !== ID) return;
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

  // ---------- daily quests ----------
  api.addQuest({ type: 'race.finish', icon: '🏁', solo: true, tiers: [[2, 5], [3, 7]],
    en: 'Finish {n} races', zh: '完成 {n} 场赛车', py: 'wánchéng {n} chǎng sàichē', ms: 'Tamatkan {n} perlumbaan' });
  api.addQuest({ type: 'race.podium', icon: '🏆', solo: true, tiers: [[2, 6], [3, 8]],
    en: 'Finish in the top 3 in {n} races', zh: '在 {n} 场赛车中进入前三名', py: 'zài {n} chǎng sàichē zhōng jìnrù qián sān míng', ms: 'Dapat tempat 3 teratas dalam {n} perlumbaan' });
};

// for tests: the course generator, to compare with the copy in the client file
module.exports.makeTrack = makeTrack;
module.exports.GEN = GEN;
