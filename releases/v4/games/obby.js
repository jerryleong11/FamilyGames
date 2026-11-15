// Obby Tower (server). Two towers of hand-made stages, each stage starting at a checkpoint flag.
// The running and jumping happens on the tablets (positions are trusted, like town movement); the server
// owns everything that pays out: which flags a climb has reached and in which order, the stars, the run
// clock, the best times and the family leaderboard.
//
//   profile.obby = { easy: { top, cur, best, fin, day, paid }, hard: { ... } }
//     top  = highest flag ever reached (the first time a flag is reached pays stars)
//     cur  = highest flag of the climb that is not finished yet ("continue" starts there)
//     best = best timed run in ms (0 = none)      fin = how many times the top was reached
//     day / paid = repeat finishes paid today (at most AGAIN_PER_DAY per tower)
//   save.obby = { easy: [{ key, name, ms, day }], hard: [...] }      the 5 best times of the family
//
// Messages from a tablet:  obby.start { tower, from }   obby.go   obby.pos { x, y, f, m }   obby.flag { i }   obby.quit
// Messages to a tablet:    obby.hello  obby.run  obby.flag  obby.done  obby.me  obby.lb  obby.who  obby.st
'use strict';
module.exports = function (api) {
  const ID = api.id;
  // stages = number of flags after the start flag; the last one is the top of the tower.
  // The stage layouts live in public/games/obby.js: keep `stages` the same as the number of stages there.
  const TOWERS = {
    easy: { stages: 12, flag: 1, first: 10, again: 3, name: 'Easy Tower' },
    hard: { stages: 12, flag: 2, first: 20, again: 6, name: 'Hard Tower' }
  };
  const MIN_FLAG_MS = 1200;      // no stage can be climbed faster (a perfect run of the shortest stage takes 1.5 s)
  const AGAIN_PER_DAY = 5;       // paid repeat finishes per tower and day
  const KEEP_MS = 4 * 60000;     // a climb survives a dropped connection this long
  const BOARD = 5;
  const WIDTH = 800;

  const runs = {};               // player key -> the climb in progress (kept by key: ids change on reconnect)
  let ticker = null, lastPurge = 0;

  function int(v, a, b) { v = parseInt(v, 10); return api.clamp(isFinite(v) ? v : 0, a, b); }
  function towerOf(v) { return v === 'easy' || v === 'hard' ? v : null; }
  // the player's saved numbers for one tower; old or damaged saves are repaired on the way
  function data(p, tower) {
    const prof = api.prof(p);
    if (!prof) return null;
    let all = prof[ID];
    if (!all || typeof all !== 'object' || Array.isArray(all)) all = prof[ID] = {};
    let d = all[tower];
    if (!d || typeof d !== 'object' || Array.isArray(d)) d = all[tower] = {};
    const n = TOWERS[tower].stages;
    d.top = int(d.top, 0, n);
    d.cur = int(d.cur, 0, n - 1);
    d.best = int(d.best, 0, 1e9);
    d.fin = int(d.fin, 0, 1e9);
    d.paid = int(d.paid, 0, 99);
    if (typeof d.day !== 'string') d.day = '';
    return d;
  }
  function board() {
    let b = api.save[ID];
    if (!b || typeof b !== 'object' || Array.isArray(b)) b = api.save[ID] = {};
    Object.keys(TOWERS).forEach(function (t) { if (!Array.isArray(b[t])) b[t] = []; });
    return b;
  }
  function boardMsg() {
    const b = board(), out = {};
    Object.keys(TOWERS).forEach(function (t) {
      out[t] = b[t].slice(0, BOARD).map(function (e) { return { name: String(e.name || '?'), ms: int(e.ms, 0, 1e9), key: String(e.key || '') }; });
    });
    return out;
  }
  // puts a timed run on the family board (one line per player); returns the player's place, 0 = not on it
  function boardAdd(tower, p, ms) {
    const list = board()[tower];
    const old = list.filter(function (e) { return e.key === p.key; })[0];
    if (old) { if (ms < old.ms) { old.ms = ms; old.day = api.today(); } old.name = p.name; }
    else list.push({ key: p.key, name: p.name, ms: ms, day: api.today() });
    list.sort(function (a, b) { return a.ms - b.ms; });
    if (list.length > BOARD) list.length = BOARD;
    for (let i = 0; i < list.length; i++) if (list[i].key === p.key) return i + 1;
    return 0;
  }
  function meMsg(p) {
    const m = { t: ID + '.me' }, day = api.today();
    Object.keys(TOWERS).forEach(function (t) {
      const d = data(p, t);
      if (d) m[t] = { top: d.top, cur: d.cur, best: d.best, fin: d.fin, left: AGAIN_PER_DAY - (d.day === day ? d.paid : 0) };
    });
    return m;
  }
  function runMsg(r, now) { return { tower: r.tower, flag: r.flag, timed: r.timed, el: r.t0 ? now - r.t0 : -1, fin: r.fin }; }
  function whoList() {
    const out = [];
    Object.keys(runs).forEach(function (k) { const r = runs[k]; if (r.id) out.push([r.id, r.tower, r.flag, r.fin ? 1 : 0]); });
    return out;
  }
  function sendWho() { api.broadcast({ t: ID + '.who', list: whoList() }, api.inRoom(ID)); }

  // climbs of players who lost the connection wait a few minutes, then they are forgotten
  function purge(now) {
    lastPurge = now;
    Object.keys(runs).forEach(function (k) {
      const r = runs[k];
      if (r.id) { const pl = api.players.get(r.id); if (!pl || pl.room !== ID) { r.id = 0; r.gone = now; } }
      if (!r.id && now - r.gone > KEEP_MS) delete runs[k];
    });
  }
  // 10 times a second everyone in a tower gets the positions of the others in the same tower
  function tick() {
    const now = Date.now(), by = {};
    let any = false;
    if (now - lastPurge > 5000) purge(now);
    Object.keys(runs).forEach(function (k) {
      const r = runs[k];
      if (!r.id) return;
      any = true;
      if (r.pos) (by[r.tower] = by[r.tower] || []).push([r.id, r.x, r.y, r.f, r.m]);
    });
    if (!any) {
      if (!Object.keys(runs).length) { clearInterval(ticker); ticker = null; }
      return;
    }
    Object.keys(runs).forEach(function (k) {
      const r = runs[k], list = by[r.tower];
      if (!r.id || !list || (list.length === 1 && list[0][0] === r.id)) return;
      const pl = api.players.get(r.id);
      if (pl) api.send(pl, { t: ID + '.st', p: list });
    });
  }
  function startTicker() { if (!ticker) ticker = setInterval(tick, 100); }

  api.room({
    enter: function (p) {
      const now = Date.now();
      purge(now);
      const r = runs[p.key];
      if (r) { r.id = p.id; r.gone = 0; startTicker(); } // back after a dropped connection: the climb goes on
      api.send(p, {
        t: ID + '.hello', now: now, towers: TOWERS, perDay: AGAIN_PER_DAY,
        me: meMsg(p), lb: boardMsg(), who: whoList(), run: r ? runMsg(r, now) : null
      });
      if (r) sendWho();
    },
    leave: function (p) {
      const r = runs[p.key];
      if (!r) return;
      if (api.players.has(p.id)) delete runs[p.key];   // walked back to town: the climb ends (flags stay saved)
      else { r.id = 0; r.gone = Date.now(); }           // connection lost: keep it for a while
      sendWho();
    }
  });

  // start a climb: from the bottom (a timed run) or from any flag of the unfinished climb
  api.on('start', function (p, m) {
    const tower = towerOf(m.tower);
    if (p.room !== ID || !tower) return;
    const d = data(p, tower);
    if (!d) return;
    const from = int(m.from, 0, d.cur), now = Date.now();
    runs[p.key] = { tower: tower, flag: from, timed: from === 0, t0: 0, made: now, lastAt: now, id: p.id, gone: 0, fin: false, x: 0, y: 0, f: 1, m: 0, pos: false };
    api.send(p, { t: ID + '.run', tower: tower, flag: from, timed: from === 0, keep: !!m.keep });
    startTicker();
    sendWho();
  });
  // the clock of a timed run starts with the first step
  api.on('go', function (p) {
    const r = runs[p.key];
    if (p.room !== ID || !r || r.id !== p.id || !r.timed || r.t0 || r.flag > 0) return;
    r.t0 = Date.now();
  });
  api.on('pos', function (p, m) {
    const r = runs[p.key];
    if (p.room !== ID || !r || r.id !== p.id || !m) return;
    r.x = Math.round(api.clamp(+m.x || 0, 0, WIDTH));
    r.y = Math.round(api.clamp(+m.y || 0, -60000, 600));
    r.f = m.f < 0 ? -1 : 1;
    r.m = int(m.m, 0, 2);
    r.pos = true;
  });
  // "I am at flag i". Flags count only in order, one after the other, and never faster than a stage can be climbed.
  api.on('flag', function (p, m) {
    if (p.room !== ID || !m) return;
    const r = runs[p.key], now = Date.now();
    if (!r || r.id !== p.id) { api.send(p, { t: ID + '.flag', ok: false, none: true }); return; }
    const cfg = TOWERS[r.tower], i = parseInt(m.i, 10);
    if (r.fin || i !== r.flag + 1) { api.send(p, { t: ID + '.flag', ok: false, i: r.flag }); return; }
    if (now - r.lastAt < MIN_FLAG_MS) { api.send(p, { t: ID + '.flag', ok: false, i: r.flag, wait: MIN_FLAG_MS - (now - r.lastAt) }); return; }
    const d = data(p, r.tower);
    if (!d) return;
    r.flag = i; r.lastAt = now;
    if (r.timed && !r.t0) r.t0 = r.made;
    const fresh = i > d.top;
    if (fresh) d.top = i;
    let stars = 0;
    if (i < cfg.stages) {
      if (i > d.cur) d.cur = i;
      if (fresh) stars = cfg.flag;
      api.send(p, { t: ID + '.flag', ok: true, i: i, stars: stars, first: fresh });
    } else {
      // the top of the tower
      const day = api.today();
      let first = false, ms = 0, newBest = false, rank = 0;
      d.fin++; d.cur = 0; r.fin = true;
      if (d.fin === 1) { first = true; stars = cfg.first; }
      else {
        if (d.day !== day) { d.day = day; d.paid = 0; }
        if (d.paid < AGAIN_PER_DAY) { d.paid++; stars = cfg.again; }
      }
      if (r.timed) {
        ms = Math.max(1, now - r.t0);
        if (!d.best || ms < d.best) { d.best = ms; newBest = true; }
        rank = boardAdd(r.tower, p, ms);
      }
      api.send(p, { t: ID + '.done', tower: r.tower, i: i, timed: r.timed, ms: ms, best: d.best, newBest: newBest, rank: rank, stars: stars, first: first,
        left: AGAIN_PER_DAY - (d.day === day ? d.paid : 0) });
      if (r.timed) api.broadcast({ t: ID + '.lb', lb: boardMsg() }, api.inRoom(ID));
      api.toast(p.name + ' reached the top of the ' + cfg.name + '!', function (o) { return o.id !== p.id; });
    }
    api.saveSoon();
    api.questEvent(p, ID + '.flag');
    if (stars > 0) api.addStars(p, stars);
    api.send(p, meMsg(p));
    sendWho();
  });
  // back to the tower entrance
  api.on('quit', function (p) {
    if (p.room !== ID || !runs[p.key]) return;
    delete runs[p.key];
    sendWho();
  });

  api.addQuest({ type: ID + '.flag', icon: '🚩', solo: true, tiers: [[6, 5], [10, 7], [15, 9]],
    en: 'Reach {n} flags in the Obby Tower', zh: '在障碍塔到达 {n} 面旗子', py: 'zài zhàng\'ài tǎ dàodá {n} miàn qízi', ms: 'Sampai ke {n} bendera di Menara Halangan' });
};
