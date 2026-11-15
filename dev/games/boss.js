// Monster Cave (boss): a co-operative boss fight where the family's weapon is adding numbers.
// Number orbs lie around the cave. Walking over one picks it up (a player carries up to 3). Carried to the
// magic cannon they are loaded one by one and added to the team's sum. When the sum is exactly the number on
// the boss's shield the cannon fires: the shield breaks, the boss loses 1 HP and is dazed. Going over the
// number empties the cannon and makes the boss angry. The server runs the whole fight; a tablet only reports
// where its player is and when its player was hit.
//
// From a tablet:  boss.pick {boss}   boss.diff {d}   boss.ready {on}   boss.pos {x,y,f,m}   boss.hit {k,id}   boss.drop
// To the tablets: boss.lobby  boss.full (everything about the running fight)  boss.s (10 times a second: positions)
//                 boss.o (orbs appear / go, what a player carries)  boss.sum  boss.fire  boss.over  boss.ko  boss.hp
//                 boss.atk (a red zone: it hits after `in` ms)  boss.rock  boss.min (minions)  boss.end
// Saved in profile.boss: { w: wins [boss][difficulty], bt: best time per boss (seconds), day + n: wins today,
//                          orbs: orbs loaded in total }
'use strict';
module.exports = function (api) {
  const ID = api.id, rnd = api.rnd, clamp = api.clamp, inRoom = api.inRoom(ID);
  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function d2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  // The boss escapes after 6 minutes. (BOSS_LIMIT_MS only exists so a test can see an escape without waiting.)
  const LIMIT_MS = Math.max(2000, parseInt(process.env.BOSS_LIMIT_MS, 10) || 360000);
  const GRACE_MS = 20000;      // everybody dropped out: the fight waits this long for someone to come back
  const COUNT_MS = 3000, TICK_MS = 100;
  const FULL_WINS = 5, FIRST_BONUS = 10, ESCAPE_STARS = 2, HELPER_STARS = 3, CAPPED_STARS = 2;
  const LOAD_MS = 500, DOWN_MS = 2000, SAFE_MS = 3500, DAZE_MS = 3000, ANGRY_MS = 8000, WARN_MS = 1200;
  const MAX_CARRY = 3, PICK_R = 50, DELIVER_R = 100;

  // ---- the arena: the same numbers are in public/games/boss.js ----
  const X0 = 70, X1 = 1130, Y0 = 270, Y1 = 725;
  const BOSS = { x: 600, y: 335 }, CANNON = { x: 600, y: 610 };

  // targets, orb numbers, how many orbs lie around, ms between attacks, minion and rock speed, reward,
  // HP for one player and extra HP for every further player
  const DIFF = [
    { tMin: 5, tMax: 10, oMax: 5, minus: 0, orbs: 7, gap: 6200, min: 70, rock: 210, stars: 10, hits: 9, per: 3 },
    { tMin: 10, tMax: 20, oMax: 9, minus: 0, orbs: 8, gap: 5000, min: 95, rock: 260, stars: 14, hits: 8, per: 3 },
    { tMin: 20, tMax: 50, oMax: 12, minus: 0.28, minusTop: 5, minusMax: 3, orbs: 10, gap: 4000, min: 120, rock: 310, stars: 18, hits: 7, per: 2 }
  ];
  // Slime King, Rock Golem, Fire Dragon: how fast they attack, how fast and how long their minions chase
  const KIND = [
    { gap: 1, min: 1, life: 10000 },
    { gap: 0.93, min: 0.8, life: 13000 },
    { gap: 0.86, min: 1.3, life: 7500 }
  ];

  let phase = 'lobby';          // 'lobby' or 'fight'
  let F = null;                 // the running fight
  let tickTimer = null, graceTimer = null, countTimer = null, countEnds = 0;
  let ready = {};               // player key -> true
  const sel = { boss: 0, diff: 0 };

  function here() { return api.roomList(ID); }

  // ---------- saved data ----------
  function data(p) {
    const prof = api.prof(p) || {};
    const d = prof[ID] || (prof[ID] = {});
    if (!Array.isArray(d.w)) d.w = [];
    if (!Array.isArray(d.bt)) d.bt = [];
    for (let i = 0; i < 3; i++) {
      if (!Array.isArray(d.w[i])) d.w[i] = [0, 0, 0];
      for (let j = 0; j < 3; j++) d.w[i][j] = Math.max(0, parseInt(d.w[i][j], 10) || 0);
      d.bt[i] = Math.max(0, parseInt(d.bt[i], 10) || 0);
    }
    d.orbs = Math.max(0, parseInt(d.orbs, 10) || 0);
    if (d.day !== api.today()) { d.day = api.today(); d.n = 0; }
    d.n = Math.max(0, parseInt(d.n, 10) || 0);
    return d;
  }
  function beaten(d, i) { return d.w[i][0] + d.w[i][1] + d.w[i][2]; }
  // A boss is unlocked after beating the one before it. Someone who was brought along and beat a later boss
  // keeps that boss (and the next one) too.
  function unlocked(d, i) {
    for (let j = Math.max(0, i - 1); j < 3; j++) if (beaten(d, j) > 0) return true;
    return i === 0;
  }
  // a boss can be fought when anyone in the room has unlocked it, so the older child can bring the younger along
  function canList(list) { return [0, 1, 2].map(function (i) { return list.some(function (p) { return unlocked(data(p), i); }); }); }

  // ---------- lobby ----------
  function stopCount() { clearTimeout(countTimer); countTimer = null; countEnds = 0; }
  function lobbyMsg(p, list, can) {
    const d = data(p);
    return {
      t: 'boss.lobby', boss: sel.boss, diff: sel.diff, can: can,
      ready: list.filter(function (o) { return ready[o.key]; }).map(function (o) { return o.id; }),
      go: countEnds ? Math.max(0, countEnds - Date.now()) : 0,
      w: d.w, bt: d.bt, left: Math.max(0, FULL_WINS - d.n), open: [0, 1, 2].map(function (i) { return unlocked(d, i); })
    };
  }
  function sendLobby() {
    const list = here(), can = canList(list);
    while (sel.boss > 0 && !can[sel.boss]) sel.boss--;
    list.forEach(function (p) { api.send(p, lobbyMsg(p, list, can)); });
  }
  function checkStart() {
    const list = here(), all = list.length > 0 && list.every(function (p) { return ready[p.key]; });
    if (all && !countTimer) { countEnds = Date.now() + COUNT_MS; countTimer = setTimeout(startFight, COUNT_MS); }
    else if (!all && countTimer) stopCount();
  }
  api.on('pick', function (p, m) {
    if (phase !== 'lobby' || p.room !== ID) return;
    const i = parseInt(m.boss, 10);
    if (!(i >= 0 && i < 3) || i === sel.boss || !canList(here())[i]) return;
    sel.boss = i; ready = {}; stopCount(); sendLobby();     // a new choice: everybody says "ready" again
  });
  api.on('diff', function (p, m) {
    if (phase !== 'lobby' || p.room !== ID) return;
    const i = parseInt(m.d, 10);
    if (!(i >= 0 && i < 3) || i === sel.diff) return;
    sel.diff = i; ready = {}; stopCount(); sendLobby();
  });
  api.on('ready', function (p, m) {
    if (phase !== 'lobby' || p.room !== ID) return;
    if (m.on) ready[p.key] = true; else delete ready[p.key];
    checkStart(); sendLobby();
  });

  // ---------- the fight: set-up ----------
  function newPlayer(i, n) {
    return { x: Math.round(clamp(600 + (i - (n - 1) / 2) * 110, X0 + 40, X1 - 40)), y: 690, f: 1, m: 0, carry: [], down: 0, safe: 0, next: 0, n: 0, here: true };
  }
  function newTarget(not) {
    let v = ri(F.D.tMin, F.D.tMax);
    if (v === not) v = v < F.D.tMax ? v + 1 : v - 1;
    return v;
  }
  function startFight() {
    stopCount();
    const list = here();
    ready = {};
    if (!list.length || phase !== 'lobby') return;
    const can = canList(list);
    while (sel.boss > 0 && !can[sel.boss]) sel.boss--;
    const D = DIFF[sel.diff], n = Math.min(6, list.length);
    F = {
      boss: sel.boss, diff: sel.diff, D: D, K: KIND[sel.boss], ft: 0, last: Date.now(), ticks: 0, size: n,
      hpMax: D.hits + D.per * (n - 1), hp: 0, target: 0, sum: 0, parts: [], gain: 0,
      orbs: [], nextOrb: 1, nextSpawn: 0, nextCheck: 1000,
      pl: {}, atks: [], rocks: [], mins: [], nextId: 1,
      nextAtk: 4000, dazed: 0, angry: 0, lastPat: -1
    };
    F.hp = F.hpMax; F.target = newTarget(0);
    list.forEach(function (p, i) { F.pl[p.key] = newPlayer(i, list.length); });
    for (let i = 0; i < wantOrbs(list.length); i++) addOrb(orbValue());
    phase = 'fight';
    list.forEach(function (p) { api.send(p, fullMsg(p)); });
    resume();
  }
  function resume() {
    clearTimeout(graceTimer); graceTimer = null;
    if (!tickTimer && F) { F.last = Date.now(); tickTimer = setInterval(safeTick, TICK_MS); }
  }
  function pause() {      // nobody is in the cave: stop the clock and wait a little for a reconnect
    clearInterval(tickTimer); tickTimer = null;
    clearTimeout(graceTimer); graceTimer = setTimeout(function () { if (!here().length) stopFight(); }, GRACE_MS);
  }
  function stopFight() {
    clearInterval(tickTimer); tickTimer = null;
    clearTimeout(graceTimer); graceTimer = null;
    F = null; phase = 'lobby'; ready = {};
  }
  function joinFight(p) {  // someone walks in while the fight is on (or comes back after a dropped connection)
    let s = F.pl[p.key];
    if (!s) {
      s = F.pl[p.key] = newPlayer(0, 1);
      s.x = Math.round(rnd(300, 900));
      if (F.size < 6 && F.D && F.ft < LIMIT_MS - 60000) {   // one more fighter: the boss gets a little more HP
        F.size++; F.hpMax += F.D.per; F.hp += F.D.per;
        api.broadcast({ t: 'boss.hp', hp: F.hp, hpMax: F.hpMax }, function (o) { return o.room === ID && o.id !== p.id; });
      }
    }
    s.here = true; s.carry = []; s.down = 0; s.m = 0; s.safe = F.ft + 1500;
  }
  function fullMsg(p) {
    const f = F, list = here(), carry = {}, down = {}, pos = [], me = f.pl[p.key];
    list.forEach(function (o) {
      const s = f.pl[o.key];
      if (!s) return;
      carry[o.id] = s.carry;
      if (f.ft < s.safe) down[o.id] = [Math.max(0, Math.round(s.down - f.ft)), Math.round(s.safe - f.ft)];
      pos.push([o.id, s.x, s.y, s.f, s.m]);
    });
    return {
      t: 'boss.full', boss: f.boss, diff: f.diff, hp: f.hp, hpMax: f.hpMax, target: f.target, sum: f.sum, parts: f.parts,
      left: Math.round(LIMIT_MS - f.ft), dazed: Math.max(0, Math.round(f.dazed - f.ft)), angry: Math.max(0, Math.round(f.angry - f.ft)),
      orbs: f.orbs.map(orbArr), carry: carry, down: down, p: pos, you: me ? [me.x, me.y] : [600, 690],
      atks: f.atks.filter(function (a) { return a.hit > f.ft; }).map(function (a) { return { id: a.id, z: a.z, in: Math.round(a.hit - f.ft) }; }),
      rocks: f.rocks.map(function (r) { return { id: r.id, x: r.x, y: r.y, vx: r.vx, vy: r.vy, r: r.r, in: Math.round(r.born - f.ft), life: r.life }; }),
      mins: f.mins.map(function (q) { return [q.id, Math.round(q.x), Math.round(q.y), Math.max(0, Math.round(q.born - f.ft))]; })
    };
  }

  // ---------- orbs ----------
  function orbArr(o) { return [o.id, o.x, o.y, o.v]; }
  function onDais(x, y, pad) { const dx = (x - BOSS.x) / (225 + pad), dy = (y - 330) / (95 + pad); return dx * dx + dy * dy < 1; }
  function wantOrbs(n) { return F.D.orbs + Math.min(4, Math.max(0, n - 1)); }
  function freeSpot() {
    const pl = Object.keys(F.pl).map(function (k) { return F.pl[k]; }).filter(function (s) { return s.here; });
    for (let n = 0; n < 80; n++) {
      const x = rnd(120, 1080), y = rnd(300, 705);
      if (onDais(x, y, 45) || d2(x, y, CANNON.x, CANNON.y) < 150 * 150) continue;
      if (n < 50 && F.orbs.some(function (o) { return d2(x, y, o.x, o.y) < 100 * 100; })) continue;
      if (n < 50 && pl.some(function (s) { return d2(x, y, s.x, s.y) < 100 * 100; })) continue;
      return { x: Math.round(x), y: Math.round(y) };
    }
    return { x: ri(140, 380), y: ri(560, 700) };
  }
  function addOrb(v, x, y, skip) {
    const s = x === undefined ? freeSpot() : { x: Math.round(x), y: Math.round(y) };
    const o = { id: F.nextOrb++, x: s.x, y: s.y, v: v, skip: skip || null };
    F.orbs.push(o);
    return o;
  }
  // can some of these numbers add up to exactly `need`?
  function reach(need, vals) {
    if (need <= 0) return true;
    const ok = new Uint8Array(need + 1);
    ok[0] = 1;
    vals.forEach(function (v) { for (let s = need; s >= v; s--) if (ok[s - v]) ok[s] = 1; });
    return !!ok[need];
  }
  // the plus numbers in play: on the floor, and in the hands of players (unless nothing was loaded for a while)
  function positives() {
    const out = F.orbs.filter(function (o) { return o.v > 0; }).map(function (o) { return o.v; });
    if (F.ft - F.gain < 15000) Object.keys(F.pl).forEach(function (k) { const s = F.pl[k]; if (s.here) s.carry.forEach(function (v) { if (v > 0) out.push(v); }); });
    return out;
  }
  function helpful(need) { return need <= F.D.oMax ? need : ri(Math.ceil(F.D.oMax / 2), F.D.oMax); }
  function orbValue() {
    const D = F.D, need = F.target - F.sum;
    if (D.minus && Math.random() < D.minus && F.orbs.filter(function (o) { return o.v < 0; }).length < D.minusMax) return -ri(1, D.minusTop);
    if (!reach(need, positives())) return helpful(need);
    return ri(1, D.oMax);
  }
  // The target must always be reachable with the numbers in play. If it is not, a helpful orb appears
  // (and the oldest one goes when the floor is already full).
  function keepSolvable(want) {
    const need = F.target - F.sum;
    if (reach(need, positives())) return;
    const msg = { t: 'boss.o', add: [] };
    if (F.orbs.length >= want + 2) msg.del = [F.orbs.shift().id];
    msg.add.push(orbArr(addOrb(helpful(need))));
    api.broadcast(msg, inRoom);
  }
  function nearSpot(s) {
    for (let n = 0; n < 16; n++) {
      const a = rnd(0, Math.PI * 2), r = rnd(64, 110);
      const x = clamp(s.x + Math.cos(a) * r, X0 + 30, X1 - 30), y = clamp(s.y + Math.sin(a) * r * 0.8, Y0 + 30, Y1 - 15);
      if (onDais(x, y, 30) || d2(x, y, CANNON.x, CANNON.y) < 125 * 125 || d2(x, y, s.x, s.y) < 55 * 55) continue;
      if (n < 10 && F.orbs.some(function (o) { return d2(x, y, o.x, o.y) < 72 * 72; })) continue;
      return { x: x, y: y };
    }
    return { x: clamp(s.x + (s.x < 600 ? 80 : -80), X0 + 30, X1 - 30), y: clamp(s.y + 45, Y0 + 30, Y1 - 15) };
  }
  // everything a player carries falls on the floor around them
  function spill(s) {
    const add = s.carry.map(function (v) { const q = nearSpot(s); return orbArr(addOrb(v, q.x, q.y)); });
    s.carry = [];
    return add;
  }
  function pickUp(p, s) {
    if (F.ft < s.down) return;
    for (let i = F.orbs.length - 1; i >= 0; i--) {
      const o = F.orbs[i], q = d2(s.x, s.y, o.x, o.y);
      if (o.skip === p.key) { if (q > 90 * 90) o.skip = null; continue; }   // just put down by this player
      if (q < PICK_R * PICK_R && s.carry.length < MAX_CARRY) {
        F.orbs.splice(i, 1);
        s.carry.push(o.v);
        api.broadcast({ t: 'boss.o', del: [o.id], id: p.id, c: s.carry, fx: 'take' }, inRoom);
      }
    }
  }
  api.on('drop', function (p) {        // put the last orb back on the floor
    if (phase !== 'fight' || !F || p.room !== ID) return;
    const s = F.pl[p.key];
    if (!s || !s.carry.length || F.ft < s.down) return;
    const o = addOrb(s.carry.pop(), s.x, s.y, p.key);
    api.broadcast({ t: 'boss.o', add: [orbArr(o)], id: p.id, c: s.carry, fx: 'drop' }, inRoom);
  });

  // ---------- the cannon ----------
  // The cannon takes one orb. A minus orb waits in the player's hands until there is enough to take away from.
  function load(p, s) {
    let i = -1;
    for (let k = 0; k < s.carry.length; k++) if (s.carry[k] > 0 || F.sum + s.carry[k] >= 0) { i = k; break; }
    if (i < 0) return;
    const v = s.carry.splice(i, 1)[0];
    s.next = F.ft + LOAD_MS; s.n++; F.gain = F.ft;
    data(p).orbs++; api.saveSoon();
    api.questEvent(p, 'boss.orb');
    F.sum += v; F.parts.push(v);
    if (F.parts.length > 8) F.parts.splice(0, F.parts.length - 8);
    if (F.sum === F.target) {            // exactly the number on the shield: fire!
      const was = F.target, parts = F.parts, gone = F.mins.map(function (q) { return q.id; });
      F.hp--; F.sum = 0; F.parts = []; F.mins = [];
      F.atks = F.atks.filter(function (a) { return a.hit <= F.ft; });   // what the boss was preparing fizzles out
      if (F.hp > 0) { F.target = newTarget(was); F.dazed = F.ft + DAZE_MS; F.angry = 0; F.nextAtk = Math.max(F.nextAtk, F.dazed + 900); }
      api.broadcast({ t: 'boss.fire', id: p.id, v: v, c: s.carry, was: was, parts: parts, hp: F.hp, target: F.hp > 0 ? F.target : 0, dazed: DAZE_MS, gone: gone }, inRoom);
      if (F.hp <= 0) endFight(true);
    } else if (F.sum > F.target) {       // too much: the cannon empties and the boss gets angry
      const sum = F.sum, parts = F.parts;
      F.sum = 0; F.parts = [];
      F.angry = F.ft + ANGRY_MS; F.nextAtk = Math.min(F.nextAtk, F.ft + 900);
      api.broadcast({ t: 'boss.over', id: p.id, v: v, c: s.carry, sum: sum, parts: parts, target: F.target, angry: ANGRY_MS }, inRoom);
    } else api.broadcast({ t: 'boss.sum', id: p.id, v: v, c: s.carry, sum: F.sum, parts: F.parts }, inRoom);
  }

  // ---------- the boss's attacks: always announced first ----------
  function live() { return here().map(function (p) { return F.pl[p.key]; }).filter(function (s) { return s && F.ft >= s.down; }); }
  function anySpot() { return { x: rnd(150, 1050), y: rnd(440, 700) }; }
  // k + extra places to aim at: players first, then anywhere on the floor
  function aims(k, extra) {
    const out = api.shuffle(live()).slice(0, k).map(function (s) { return { x: s.x, y: s.y }; });
    while (out.length < k + extra) out.push(anySpot());
    return out;
  }
  function circ(x, y, r) { return ['c', Math.round(x), Math.round(y), r]; }
  function angTo(a) { return Math.atan2(a.y - (BOSS.y + 30), a.x - BOSS.x); }
  function beam(ang, w) { return ['l', BOSS.x, BOSS.y + 30, Math.round(BOSS.x + Math.cos(ang) * 1300), Math.round(BOSS.y + 30 + Math.sin(ang) * 1300), w]; }
  function zone(shapes, delay) {       // a red zone on the floor; whoever stands in it after `delay` ms is hit
    const a = { id: F.nextId++, z: shapes, hit: F.ft + delay };
    F.atks.push(a);
    api.broadcast({ t: 'boss.atk', id: a.id, z: shapes, in: delay }, inRoom);
  }
  function roll(y, dir, delay) {       // a rock rolls across the cave along a marked lane
    const sp = F.D.rock;
    const r = { id: F.nextId++, x: dir > 0 ? -70 : 1270, y: Math.round(clamp(y, 320, 700)), vx: dir * sp, vy: 0, r: 38, born: F.ft + delay, life: Math.round(1340 / sp * 1000) };
    F.rocks.push(r);
    api.broadcast({ t: 'boss.rock', id: r.id, x: r.x, y: r.y, vx: r.vx, vy: 0, r: r.r, in: delay, life: r.life }, inRoom);
  }
  function hatch(n) {                  // small minions that chase the players for a while
    n = Math.min(n, 4 - F.mins.length);
    const add = [];
    for (let i = 0; i < n; i++) {
      const q = { id: F.nextId++, x: BOSS.x + (i - (n - 1) / 2) * 170 + rnd(-25, 25), y: 462 + rnd(-10, 25), born: F.ft + WARN_MS, die: F.ft + WARN_MS + F.K.life };
      F.mins.push(q);
      add.push([q.id, Math.round(q.x), Math.round(q.y), WARN_MS]);
    }
    if (add.length) api.broadcast({ t: 'boss.min', add: add }, inRoom);
  }
  function side() { return Math.random() < 0.5 ? 1 : -1; }
  // [weight, what happens (difficulty 0-2, second half of the fight)], per boss
  const PATTERNS = [
    [ // Slime King: belly slams, slime balls, little slimes, now and then a rock
      [3, function (lv, p2) { zone(aims(lv > 0 ? 2 : 1, p2 ? 1 : 0).map(function (a) { return circ(a.x, a.y, 100); }), WARN_MS); }],
      [3, function (lv, p2) { aims(1, 2 + lv + (p2 ? 1 : 0)).forEach(function (a, i) { zone([circ(a.x, a.y, 74)], WARN_MS + i * 320); }); }],
      [2, function (lv, p2) { hatch(1 + (lv > 0 ? 1 : 0) + (p2 ? 1 : 0)); }, 'min'],
      [2, function (lv, p2) { const a = aims(1, 1), d = side(); roll(a[0].y, d, WARN_MS); if (lv > 1 || p2) roll(a[1].y, -d, WARN_MS + 700); }]
    ],
    [ // Rock Golem: ground-splitting smashes, rolling boulders, a quake around the cannon, rocklings
      [3, function (lv, p2) { zone(aims(lv > 0 ? 2 : 1, p2 ? 1 : 0).map(function (a) { return beam(angTo(a), 55); }), WARN_MS); }],
      [3, function (lv, p2) {
        const lanes = api.shuffle([340, 430, 520, 610, 695]), n = 2 + (lv > 1 ? 1 : 0) + (p2 ? 1 : 0), d = side();
        for (let i = 0; i < n; i++) roll(lanes[i], i % 2 ? -d : d, WARN_MS + i * 450);
      }],
      [2, function (lv, p2) {
        zone([circ(CANNON.x, CANNON.y, 155)], WARN_MS + 100);
        if (lv > 0 || p2) { const a = aims(1, 0)[0]; zone([circ(a.x, a.y, 95)], WARN_MS + 500); }
      }],
      [2, function (lv) { hatch(1 + (lv > 0 ? 1 : 0)); }, 'min']
    ],
    [ // Fire Dragon: fans of fire breath, meteor rain, a wall of fire, quick flame sprites, a fireball
      [3, function (lv, p2) {
        const a0 = angTo(aims(1, 0)[0]), d = side(), z = [beam(a0, 44), beam(a0 + d * 0.45, 44)];
        if (lv > 0) z.push(beam(a0 - d * 0.45, 44));
        if (lv > 1 && p2) z.push(beam(a0 + d * 0.9, 44));
        zone(z, WARN_MS);
      }],
      [3, function (lv, p2) { aims(2, 2 + lv + (p2 ? 1 : 0)).forEach(function (a, i) { zone([circ(a.x, a.y, 82)], WARN_MS + i * 260); }); }],
      [2, function (lv, p2) {
        const xs = api.shuffle([245, 600, 955]).slice(0, lv > 0 && p2 ? 2 : 1);
        zone(xs.map(function (x) { return ['l', x, 236, x, 790, 172]; }), WARN_MS + 300);
      }],
      [2, function (lv) { hatch(2 + (lv > 1 ? 1 : 0)); }, 'min'],
      [1, function (lv, p2) { const a = aims(1, 1), d = side(); roll(a[0].y, d, WARN_MS); if (p2) roll(a[1].y, -d, WARN_MS + 600); }]
    ]
  ];
  function attack() {
    const all = PATTERNS[F.boss];
    const list = all.filter(function (q, i) { return i !== F.lastPat && !(q[2] === 'min' && F.mins.length >= 3); });
    let total = 0, pick = list[0];
    list.forEach(function (q) { total += q[0]; });
    let r = Math.random() * total;
    for (let i = 0; i < list.length; i++) { r -= list[i][0]; if (r < 0) { pick = list[i]; break; } }
    F.lastPat = all.indexOf(pick);
    pick[1](F.diff, F.hp * 2 <= F.hpMax);
  }

  // a tablet says its player was hit by an attack ('a'), a rock ('r') or a minion ('m')
  api.on('hit', function (p, m) {
    if (phase !== 'fight' || !F || p.room !== ID) return;
    const s = F.pl[p.key], id = parseInt(m.id, 10), k = String(m.k);
    if (!s || F.ft < s.safe) return;
    let ok = false;
    if (k === 'a') ok = F.atks.some(function (a) { return a.id === id && F.ft >= a.hit - 500; });
    else if (k === 'r') ok = F.rocks.some(function (r) { return r.id === id && F.ft >= r.born - 400; });
    else if (k === 'm') {
      const i = F.mins.findIndex(function (q) { return q.id === id && F.ft >= q.born - 400; });
      if (i >= 0) { ok = true; F.mins.splice(i, 1); api.broadcast({ t: 'boss.min', del: [id] }, inRoom); }   // the minion pops
    }
    if (!ok) return;
    // knocked down for 2 seconds, the orbs roll away; nobody is ever out of the game
    s.down = F.ft + DOWN_MS; s.safe = F.ft + SAFE_MS; s.m = 0;
    api.broadcast({ t: 'boss.ko', id: p.id, ms: DOWN_MS, safe: SAFE_MS, add: spill(s) }, inRoom);
  });

  api.on('pos', function (p, m) {
    if (phase !== 'fight' || !F || p.room !== ID) return;
    const s = F.pl[p.key], x = +m.x, y = +m.y;
    if (!s || !isFinite(x) || !isFinite(y) || F.ft < s.down) return;
    s.x = Math.round(clamp(x, X0, X1)); s.y = Math.round(clamp(y, Y0, Y1));
    s.f = m.f < 0 ? -1 : 1; s.m = m.m ? 1 : 0;
    pickUp(p, s);       // first come, first served
  });

  // ---------- the fight: 10 times a second ----------
  function safeTick() {
    try { tick(); }
    catch (e) { console.error('Monster Cave: the fight was stopped after an error:', e); stopFight(); sendLobby(); }
  }
  function tick() {
    if (!F) { clearInterval(tickTimer); tickTimer = null; return; }
    const now = Date.now(), dt = Math.min(300, Math.max(0, now - F.last)), list = here();
    F.last = now;
    if (!list.length) { pause(); return; }
    F.ft += dt; F.ticks++;

    // orbs: picked up by walking over them, loaded while standing at the cannon
    for (let i = 0; i < list.length; i++) {
      const p = list[i], s = F.pl[p.key];
      if (!s || F.ft < s.down) continue;
      pickUp(p, s);
      if (s.carry.length && F.ft >= s.next && d2(s.x, s.y, CANNON.x, CANNON.y) < DELIVER_R * DELIVER_R) load(p, s);
      if (!F) return;   // that was the last hit
    }
    if (F.ft >= LIMIT_MS) { endFight(false); return; }

    const want = wantOrbs(list.length);
    if (F.orbs.length < want && F.ft >= F.nextSpawn) {
      F.nextSpawn = F.ft + 700;
      api.broadcast({ t: 'boss.o', add: [orbArr(addOrb(orbValue()))] }, inRoom);
    }
    if (F.ft >= F.nextCheck) { F.nextCheck = F.ft + 1000; keepSolvable(want); }

    // the boss
    if (F.ft >= F.nextAtk && F.ft >= F.dazed) {
      attack();
      let gap = F.D.gap * F.K.gap * rnd(0.85, 1.15);
      if (F.hp * 2 <= F.hpMax) gap *= 0.85;
      if (F.ft < F.angry) gap *= 0.55;
      F.nextAtk = F.ft + gap;
    }
    F.atks = F.atks.filter(function (a) { return F.ft < a.hit + 1500; });
    F.rocks = F.rocks.filter(function (r) { return F.ft < r.born + r.life + 300; });

    // minions walk towards the nearest player who is on their feet
    const gone = [];
    F.mins = F.mins.filter(function (q) { if (F.ft >= q.die) { gone.push(q.id); return false; } return true; });
    if (gone.length) api.broadcast({ t: 'boss.min', del: gone }, inRoom);
    const prey = live().filter(function (s) { return F.ft >= s.safe; }), step = F.D.min * F.K.min * dt / 1000;
    F.mins.forEach(function (q, i) {
      if (F.ft < q.born) return;
      let best = null, bd = 1e12;
      prey.forEach(function (s) { const d = d2(q.x, q.y, s.x, s.y); if (d < bd) { bd = d; best = s; } });
      if (best && bd > 1) { const d = Math.sqrt(bd), k = Math.min(d, step) / d; q.x += (best.x - q.x) * k; q.y += (best.y - q.y) * k; }
      for (let j = 0; j < i; j++) {     // not on top of each other
        const o = F.mins[j];
        if (d2(q.x, q.y, o.x, o.y) < 46 * 46) { q.x += q.x < o.x ? -3 : 3; q.y += q.y < o.y ? -2 : 2; }
      }
      q.x = clamp(q.x, X0, X1); q.y = clamp(q.y, Y0, Y1);
    });

    // where everybody is
    const msg = { t: 'boss.s', p: [] };
    list.forEach(function (p) { const s = F.pl[p.key]; if (s) msg.p.push([p.id, s.x, s.y, s.f, s.m]); });
    if (F.mins.length) msg.m = F.mins.map(function (q) { return [q.id, Math.round(q.x), Math.round(q.y)]; });
    if (F.ticks % 10 === 0) msg.left = Math.round(LIMIT_MS - F.ft);
    api.broadcast(msg, inRoom);
  }

  // ---------- the end: the boss is beaten, or it escapes ----------
  function endFight(win) {
    const f = F, list = here(), secs = Math.max(1, Math.round(f.ft / 1000));
    stopFight();
    const rows = list.map(function (p) {
      const s = f.pl[p.key] || { n: 0 }, d = data(p);
      let base = ESCAPE_STARS, first = false, capped = false;
      if (win) {
        first = beaten(d, f.boss) === 0;
        capped = d.n >= FULL_WINS;                   // full rewards for the first 5 wins of a day
        base = capped ? CAPPED_STARS : s.n > 0 ? f.D.stars : HELPER_STARS;
        d.w[f.boss][f.diff]++; d.n++;
        if (!d.bt[f.boss] || secs < d.bt[f.boss]) d.bt[f.boss] = secs;
      }
      return { id: p.id, name: p.name, color: p.color, n: s.n, base: base, first: first, capped: capped, stars: base + (first ? FIRST_BONUS : 0) };
    });
    api.saveSoon();
    api.broadcast({ t: 'boss.end', win: win, boss: f.boss, diff: f.diff, secs: secs, rows: rows }, inRoom);
    list.forEach(function (p, i) {
      if (win) api.questEvent(p, 'boss.win');
      api.addStars(p, rows[i].stars);
    });
    sendLobby();
  }

  // ---------- the room ----------
  api.room({
    enter: function (p) {
      if (phase === 'fight' && F) {
        joinFight(p);
        resume();
        api.send(p, fullMsg(p));
      } else { checkStart(); sendLobby(); }
    },
    leave: function (p) {
      delete ready[p.key];
      if (phase === 'fight' && F) {
        const s = F.pl[p.key];
        if (s) {
          s.here = false; s.m = 0;
          // the orbs stay in the game; the others see them fall
          if (s.carry.length) api.broadcast({ t: 'boss.o', add: spill(s), id: p.id, c: [], fx: 'drop' }, inRoom);
        }
        if (!here().length) pause();
      } else { checkStart(); sendLobby(); }
    }
  });

  // ---------- daily quests ----------
  api.addQuest({ type: 'boss.win', icon: '👾', solo: true, tiers: [[1, 6]],
    en: 'Beat a boss in the Monster Cave', zh: '在怪兽洞打败一个大怪兽', py: 'zài guàishòu dòng dǎbài yí gè dà guàishòu', ms: 'Kalahkan seekor raksasa di Gua Raksasa' });
  api.addQuest({ type: 'boss.orb', icon: '🔮', solo: true, tiers: [[8, 4], [12, 5], [18, 7]],
    en: 'Load {n} number orbs into the cannon', zh: '把 {n} 个数字球装进大炮', py: 'bǎ {n} gè shùzì qiú zhuāng jìn dàpào', ms: 'Masukkan {n} bola nombor ke dalam meriam' });
};
