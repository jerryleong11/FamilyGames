// Monster Cave (boss): a co-operative boss fight where the family's weapon is adding numbers, and everybody gets
// numbers of their own size. The boss's shield has one rune per fighter, in that fighter's colour. Number orbs lie
// around the cave and are shared by everybody. Walking over one picks it up (a player carries up to 3). Carried to
// the magic cannon they are added to the player's OWN sum. When the sum is exactly the number on the player's rune
// the rune lights up; when every fighter's rune is lit the cannon fires: the shield breaks, the boss loses HP and
// is dazed. Going over the number empties only the own sum.
//
// The number on a rune is made for the player's level (p.skill, chosen on the join screen):
//   0 Little    5 to 10, adding only. Takes no minus gems and no orb bigger than the own rune.
//   1 Big kid   10 to 30, adding; minus gems on the hard fights.
//   2 Grown-up  30 to 99. The cannon takes nothing by itself: the player picks a multiplier (x1 to x9) for every
//               orb, so 56 is an orb 7 loaded x8, and 59 is 7 x 8 + 3.
// The fight's difficulty moves the numbers inside those bands and sets the pace (attacks, minions, HP).
// Nobody waits: a fighter whose rune is lit gets a bonus rune one step harder. Every bonus rune lit before the
// shot adds 1 damage, up to BONUS_CAP; after that the fast ones can only help the others. Nobody holds the shot up
// by being away: someone who leaves, loses the connection or stands still for 20 seconds does not count; a late
// joiner gets a bonus rune at once and a rune of the shield with the next one.
// The boss is kinder to the little ones: it aims at a Grown-up three times as often as at a Little fighter (a Big
// kid: twice); a Little fighter keeps the orbs when knocked down; and back on the feet a Little fighter is safe
// for 4.5 s, a Big kid 2.5 s, a Grown-up 1.5 s.
//
// Six bosses, each with its own attacks and one twist: Slime King (sticky puddles), Rock Golem (the roof comes
// down, only the marked ledges are safe), Fire Dragon (the ground keeps burning), Coral Crab (the cannon drifts on
// a raft), Clock Tortoise (the orbs change places), Storm Owl (gusts push everybody sideways).
// Four roles, one ability each, chosen in the lobby: Guard (a bubble that blocks hits), Healer (gets everybody who
// is down back up, with their orbs), Collector (pulls the orbs around in; carries 5), Runner (a dash nothing can
// hit). Each role also helps without its button: the Guard keeps the orbs when hit and gets up sooner, friends near
// the Healer get up faster (and so does the Healer), the Collector carries more, the Runner walks faster.
// The server runs the whole fight; a tablet only reports where its player is and when its player was hit.
//
// From a tablet:  boss.pick {boss}   boss.diff {d}   boss.role {r}   boss.ready {on}   boss.pos {x,y,f,m}
//                 boss.hit {k,id}   boss.drop   boss.load {m} (Grown-up: next orb times m)   boss.act (the ability)
// To the tablets: boss.lobby  boss.full (everything about the running fight)  boss.s (10 times a second: positions)
//                 boss.o (orbs appear / go / move, what a player carries)  boss.sum  boss.lit (a rune lights up)
//                 boss.over  boss.fire (the shot, and the next shield)  boss.runes (the runes after someone came or
//                 went)  boss.ko  boss.hp  boss.atk (a red zone: it hits after `in` ms)  boss.rock  boss.min (minions)
//                 boss.pud (puddles, burning ground)  boss.wind  boss.tw (the orbs are about to change places)
//                 boss.act (an ability was used)  boss.no (it was not: still cooling down)  boss.end
// A rune travels as [player id, number, sum, bonus step, has a rune of this shield, that rune is lit, skill, role,
// asleep]. Someone who does not move for 20 seconds is asleep: the shot does not wait for them.
// Saved in profile.boss: { w: wins [boss][difficulty], bt: best time per boss (seconds), day + n: wins today,
//                          orbs: orbs loaded in total, role: the role picked last }
'use strict';
module.exports = function (api) {
  const ID = api.id, rnd = api.rnd, clamp = api.clamp, inRoom = api.inRoom(ID);
  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function d2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  // The boss escapes after 6 minutes. (BOSS_LIMIT_MS and BOSS_SPEED only exist for tests: an escape without the
  // wait, and a fight whose clock runs several times faster so that many fights can be played.)
  const LIMIT_MS = Math.max(2000, parseInt(process.env.BOSS_LIMIT_MS, 10) || 360000);
  const SPEED = clamp(parseFloat(process.env.BOSS_SPEED) || 1, 1, 20);
  const GRACE_MS = 20000;      // everybody dropped out: the fight waits this long for someone to come back
  const COUNT_MS = 3000, TICK_MS = 100;
  const FULL_WINS = 5, FIRST_BONUS = 10, ESCAPE_STARS = 2, HELPER_STARS = 3, CAPPED_STARS = 2;
  const LOAD_MS = 500, TAP_MS = 250, DOWN_MS = 2000, DAZE_MS = 3000, ANGRY_MS = 6000, WARN_MS = 1200;
  const UP_SAFE = [4500, 2500, 1500];     // back on the feet, nothing hits for this long: Little, Big kid, Grown-up
  const MAX_CARRY = 3, PICK_R = 50, DELIVER_R = 100;
  const NB = 6, BONUS_CAP = 3, MAX_ORBS = 22;
  const IDLE_MS = 20000;       // someone who stands still this long no longer holds up the shot

  // ---- the arena: the same numbers are in public/games/boss.js ----
  const X0 = 70, X1 = 1130, Y0 = 270, Y1 = 725;
  const BOSS = { x: 600, y: 335 }, CANNON = { x: 600, y: 610 };

  // per difficulty: orbs on the floor (plus 3 per fighter), ms between attacks, minion and rock speed, reward,
  // HP for one player and extra HP for every further player
  const DIFF = [
    { orbs: 6, gap: 6200, min: 70, rock: 210, stars: 10, hits: 9, per: 3 },
    { orbs: 6, gap: 5000, min: 95, rock: 260, stars: 14, hits: 8, per: 3 },
    { orbs: 7, gap: 4000, min: 120, rock: 310, stars: 18, hits: 7, per: 2 }
  ];
  // The number on a rune, per skill (Little, Big kid, Grown-up): lowest and highest per difficulty, how much a
  // bonus rune goes up per step, and the top of the band (no rune ever asks for more).
  const BAND = [
    { lo: [5, 6, 7], hi: [8, 9, 10], step: 1, top: 10 },
    { lo: [10, 12, 18], hi: [15, 20, 30], step: 3, top: 30 },
    { lo: [30, 40, 54], hi: [54, 72, 99], step: 9, top: 99 }
  ];
  const TABLE = {};            // the numbers of the times tables up to 9 x 9: one orb can make those
  for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) TABLE[a * b] = true;
  // Slime King, Rock Golem, Fire Dragon, Coral Crab, Clock Tortoise, Storm Owl: how fast they attack, how fast and
  // how long their minions chase, and the twist of their cave (raft: ms per trip there and back, per difficulty;
  // twist: ms between two shuffles or gusts)
  const KIND = [
    { gap: 1, min: 1, life: 10000 },
    { gap: 0.93, min: 0.8, life: 13000 },
    { gap: 0.86, min: 1.3, life: 7500 },
    { gap: 0.9, min: 1.05, life: 9000, raft: [28000, 24000, 20000] },
    { gap: 0.85, min: 0.9, life: 11000, twist: 21000 },
    { gap: 0.8, min: 1.2, life: 8000, twist: 17000 }
  ];
  // Guard, Healer, Collector, Runner: cooldown of the ability and what it does
  const ROLE = [
    { cd: 18000, ms: 5000, r: 160 },          // a bubble on the floor: nobody inside is hit
    { cd: 10000, safe: 2500, near: 260 },     // everybody who is down gets up; near the Healer they get up faster anyway
    { cd: 12000, r: 300, carry: 5 },          // the orbs around come to the Collector's feet
    { cd: 7000, ms: 1300 }                    // a dash: fast, and nothing can hit
  ];
  const ROLE_FIRST = [3, 2, 0, 1];            // someone new gets the role the fewest others have, in this order

  let phase = 'lobby';          // 'lobby' or 'fight'
  let F = null;                 // the running fight
  let tickTimer = null, graceTimer = null, countTimer = null, countEnds = 0;
  let ready = {};               // player key -> true
  const sel = { boss: 0, diff: 0 };

  function here() { return api.roomList(ID); }
  function skillOf(p) { const v = parseInt(p.skill, 10); return v >= 0 && v <= 2 ? v : p.big ? 2 : 1; }

  // ---------- saved data ----------
  function data(p) {
    const prof = api.prof(p) || {};
    const d = prof[ID] || (prof[ID] = {});
    if (!Array.isArray(d.w)) d.w = [];
    if (!Array.isArray(d.bt)) d.bt = [];
    for (let i = 0; i < NB; i++) {              // a save from the time of three bosses gets room for six
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
    for (let j = Math.max(0, i - 1); j < NB; j++) if (beaten(d, j) > 0) return true;
    return i === 0;
  }
  function all(fn) { const out = []; for (let i = 0; i < NB; i++) out.push(fn(i)); return out; }
  // a boss can be fought when anyone in the room has unlocked it, so the older child can bring the younger along
  function canList(list) { return all(function (i) { return list.some(function (p) { return unlocked(data(p), i); }); }); }
  function savedRole(p) { const d = (api.prof(p) || {})[ID], r = d ? parseInt(d.role, 10) : -1; return r >= 0 && r <= 3 ? r : -1; }
  function roleOf(p) {
    let r = savedRole(p);
    if (r < 0) {                // the first visit: the role the fewest of the others have
      const n = [0, 0, 0, 0];
      here().forEach(function (o) { const q = o === p ? -1 : savedRole(o); if (q >= 0) n[q]++; });
      r = ROLE_FIRST[0];
      ROLE_FIRST.forEach(function (i) { if (n[i] < n[r]) r = i; });
      data(p).role = r; api.saveSoon();
    }
    return r;
  }

  // ---------- lobby ----------
  function stopCount() { clearTimeout(countTimer); countTimer = null; countEnds = 0; }
  function lobbyMsg(p, list, can) {
    const d = data(p);
    return {
      t: 'boss.lobby', boss: sel.boss, diff: sel.diff, can: can,
      ready: list.filter(function (o) { return ready[o.key]; }).map(function (o) { return o.id; }),
      go: countEnds ? Math.max(0, countEnds - Date.now()) : 0,
      w: d.w, bt: d.bt, left: Math.max(0, FULL_WINS - d.n), open: all(function (i) { return unlocked(d, i); }),
      who: list.map(function (o) { return [o.id, skillOf(o), roleOf(o)]; }),        // everybody's level and role
      band: BAND.map(function (B) { return [B.lo[sel.diff], B.hi[sel.diff]]; }),    // the numbers each level gets
      minus: sel.diff === 2, cap: BONUS_CAP
    };
  }
  function sendLobby() {
    const list = here(), can = canList(list);
    while (sel.boss > 0 && !can[sel.boss]) sel.boss--;
    list.forEach(function (p) { api.send(p, lobbyMsg(p, list, can)); });
  }
  function checkStart() {
    const list = here(), every = list.length > 0 && list.every(function (p) { return ready[p.key]; });
    if (every && !countTimer) { countEnds = Date.now() + COUNT_MS; countTimer = setTimeout(startFight, COUNT_MS); }
    else if (!every && countTimer) stopCount();
  }
  api.on('pick', function (p, m) {
    if (phase !== 'lobby' || p.room !== ID) return;
    const i = m.boss;
    if (!Number.isInteger(i) || i < 0 || i >= NB || i === sel.boss || !canList(here())[i]) return;
    sel.boss = i; ready = {}; stopCount(); sendLobby();     // a new choice: everybody says "ready" again
  });
  api.on('diff', function (p, m) {
    if (phase !== 'lobby' || p.room !== ID) return;
    const i = m.d;
    if (!Number.isInteger(i) || i < 0 || i > 2 || i === sel.diff) return;
    sel.diff = i; ready = {}; stopCount(); sendLobby();
  });
  api.on('role', function (p, m) {      // the role card: remembered for next time
    if (phase !== 'lobby' || p.room !== ID) return;
    const r = m.r;
    if (!Number.isInteger(r) || r < 0 || r > 3 || r === savedRole(p)) return;
    data(p).role = r; api.saveSoon(); sendLobby();
  });
  api.on('ready', function (p, m) {
    if (phase !== 'lobby' || p.room !== ID) return;
    if (m.on) ready[p.key] = true; else delete ready[p.key];
    checkStart(); sendLobby();
  });

  // ---------- the fight: set-up ----------
  function newPlayer(p, i, n) {
    return {
      x: Math.round(clamp(600 + (i - (n - 1) / 2) * 110, X0 + 40, X1 - 40)), y: 690, f: 1, m: 0, carry: [], spilt: [],
      down: 0, safe: 0, next: 0, n: 0, lit: 0, gain: 0, act: 0, zz: false, here: true, sk: skillOf(p), role: roleOf(p), cd: 0,
      rune: null, has: false, done: false, tier: 0, shield: -1, lastT: 0
    };
  }
  function fighters() { return here().map(function (p) { return F.pl[p.key]; }).filter(Boolean); }
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
      hpMax: D.hits + D.per * (n - 1), hp: 0, shield: 0, bonus: 0, shots: 0,
      orbs: [], nextOrb: 1, nextSpawn: 0, nextCheck: 1000,
      pl: {}, atks: [], rocks: [], mins: [], puds: [], bubs: [], todo: [], nextId: 1,
      nextAtk: 4000, nextTwist: 9000, dazed: 0, angry: 0, lastPat: -1, wind: null, cx: CANNON.x
    };
    F.hp = F.hpMax;
    list.forEach(function (p, i) { F.pl[p.key] = newPlayer(p, i, list.length); });
    newShield();
    for (let i = 0; i < wantOrbs(list.length); i++) addOrb(orbValue());
    phase = 'fight';
    list.forEach(function (p) { api.send(p, fullMsg(p)); });
    resume();
  }
  function resume() {
    clearTimeout(graceTimer); graceTimer = null;
    if (!tickTimer && F) { F.last = Date.now(); tickTimer = setInterval(safeTick, Math.max(5, Math.round(TICK_MS / SPEED))); }
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
      s = F.pl[p.key] = newPlayer(p, 0, 1);
      s.x = Math.round(rnd(300, 900));
      if (F.size < 6 && F.D && F.ft < LIMIT_MS - 60000) {   // one more fighter: the boss gets a little more HP
        F.size++; F.hpMax += F.D.per; F.hp += F.D.per;
        api.broadcast({ t: 'boss.hp', hp: F.hp, hpMax: F.hpMax }, function (o) { return o.room === ID && o.id !== p.id; });
      }
    }
    s.here = true; s.carry = []; s.spilt = []; s.down = 0; s.m = 0; s.safe = F.ft + 1500; s.sk = skillOf(p); s.act = F.ft; s.zz = false;
    if (s.shield !== F.shield) {       // not part of this shield: a bonus rune now, a rune of the shield with the next one
      s.shield = F.shield; s.has = false; s.done = false; s.tier = 0; s.rune = null;
      if (F.bonus < BONUS_CAP) giveRune(s);
    }
    checkFire();                       // (nobody with a rune of this shield is left: a new shield at once)
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
      t: 'boss.full', boss: f.boss, diff: f.diff, hp: f.hp, hpMax: f.hpMax,
      r: runesArr(), bonus: f.bonus, cap: BONUS_CAP, parts: me && me.rune ? me.rune.parts : [],
      left: Math.round(LIMIT_MS - f.ft), dazed: Math.max(0, Math.round(f.dazed - f.ft)), angry: Math.max(0, Math.round(f.angry - f.ft)),
      orbs: f.orbs.map(orbArr), carry: carry, down: down, p: pos, you: me ? [me.x, me.y] : [600, 690],
      cd: me ? Math.max(0, Math.round(me.cd - f.ft)) : 0, cx: Math.round(f.cx),
      atks: f.atks.filter(function (a) { return a.hit > f.ft; }).map(function (a) { return { id: a.id, z: a.z, in: Math.round(a.hit - f.ft) }; }),
      rocks: f.rocks.map(function (r) { return { id: r.id, x: r.x, y: r.y, vx: r.vx, vy: r.vy, r: r.r, in: Math.round(r.born - f.ft), life: r.life }; }),
      mins: f.mins.map(function (q) { return [q.id, Math.round(q.x), Math.round(q.y), Math.max(0, Math.round(q.born - f.ft))]; }),
      puds: f.puds.filter(function (q) { return q.until > f.ft; }).map(function (q) { return [q.id, q.x, q.y, q.r, q.k, Math.round(q.from - f.ft), Math.round(q.until - q.from)]; }),
      bubs: f.bubs.filter(function (b) { return b.until > f.ft; }).map(function (b) { return [b.id, b.x, b.y, b.r, Math.round(b.until - f.ft)]; }),
      wind: f.wind && f.wind.until > f.ft ? { dx: f.wind.dx, v: f.wind.v, in: Math.round(f.wind.from - f.ft), ms: Math.round(f.wind.until - f.wind.from) } : null
    };
  }

  // ---------- the shield and its runes ----------
  function pickTarget(sk, tier, not) {
    const B = BAND[sk], hi = Math.min(B.top, B.hi[F.diff] + B.step * tier), lo = Math.min(B.lo[F.diff] + B.step * tier, hi - 2);
    // a Grown-up's bonus runes (and half the runes of a hard fight) are numbers no single orb can make
    const awkward = sk === 2 && (tier > 0 || (F.diff === 2 && Math.random() < 0.5));
    let v = lo;
    for (let n = 0; n < 40; n++) {
      v = ri(lo, hi);
      if (v !== not && (!awkward || n >= 30 || !TABLE[v])) return v;
    }
    return v !== not ? v : v < hi ? v + 1 : v - 1;
  }
  function giveRune(s) {
    s.rune = { t: pickTarget(s.sk, s.tier, s.lastT), sum: 0, parts: [] };
    s.lastT = s.rune.t;
  }
  function newShield() {       // one new rune for everybody who is in the cave now
    F.shield++; F.bonus = 0;
    here().forEach(function (p) {
      const s = F.pl[p.key];
      if (!s) return;
      s.sk = skillOf(p); s.tier = 0; s.has = true; s.done = false; s.shield = F.shield;
      giveRune(s);
    });
  }
  function runesArr() {
    const out = [];
    here().forEach(function (p) {
      const s = F.pl[p.key];
      if (s) out.push([p.id, s.rune ? s.rune.t : 0, s.rune ? s.rune.sum : 0, s.tier, s.has ? 1 : 0, s.done ? 1 : 0, s.sk, s.role, awake(s) ? 0 : 1]);
    });
    return out;
  }
  function sendRunes(but) {
    api.broadcast({ t: 'boss.runes', r: runesArr(), bonus: F.bonus }, but ? function (o) { return o.room === ID && o.id !== but.id; } : inRoom);
  }
  // The shot waits for the fighters who are here, hold a rune of this shield and are awake: someone who left the
  // tablet lying (no step, no load for IDLE_MS) does not hold up the others, and counts again with the next step.
  function awake(s) { return F.ft - s.act < IDLE_MS; }
  function holders() { return fighters().filter(function (s) { return s.has && s.shield === F.shield && awake(s); }); }
  // Does the cannon fire? It does when every one of them has lit the rune the shield gave them.
  // Returns true when the runes changed without a shot (a new shield for people who had none).
  function checkFire() {
    if (!F || !here().length) return false;
    const h = holders();
    if (!h.length) {
      if (!fighters().some(awake)) return false;       // everybody stands still: nothing to do
      newShield(); return true;                        // those who are awake have no rune of this shield: a new one
    }
    if (h.every(function (s) { return s.done; })) fire();
    return false;
  }
  function fire() {
    const bonus = Math.min(BONUS_CAP, F.bonus), dmg = 1 + bonus, gone = F.mins.map(function (q) { return q.id; });
    F.hp = Math.max(0, F.hp - dmg); F.shots++; F.mins = []; F.todo = [];
    F.atks = F.atks.filter(function (a) { return a.hit <= F.ft; });       // what the boss was preparing fizzles out
    F.puds = F.puds.filter(function (q) { return q.from <= F.ft; });
    if (F.hp > 0) { newShield(); F.dazed = F.ft + DAZE_MS; F.angry = 0; F.nextAtk = Math.max(F.nextAtk, F.dazed + 900); }
    api.broadcast({ t: 'boss.fire', dmg: dmg, bonus: bonus, hp: F.hp, r: F.hp > 0 ? runesArr() : [], dazed: DAZE_MS, gone: gone }, inRoom);
    if (F.hp <= 0) endFight(true);
  }

  // ---------- orbs ----------
  function orbArr(o) { return [o.id, o.x, o.y, o.v]; }
  function onDais(x, y, pad) { const dx = (x - BOSS.x) / (225 + pad), dy = (y - 330) / (95 + pad); return dx * dx + dy * dy < 1; }
  // near the cannon; where it drifts on a raft, anywhere along its channel
  function nearCannon(x, y, r) {
    if (F.K.raft) return Math.abs(y - CANNON.y) < r * 0.55 && x > 260 && x < 940;
    return d2(x, y, CANNON.x, CANNON.y) < r * r;
  }
  function atCannon(s) { return d2(s.x, s.y, F.cx, CANNON.y) < DELIVER_R * DELIVER_R; }
  function wantOrbs(n) { return Math.min(MAX_ORBS, F.D.orbs + 3 * n); }
  function capOf(s) { return s.role === 2 ? ROLE[2].carry : MAX_CARRY; }
  // a Little fighter only takes what can help: no minus gems, nothing bigger than the own rune
  function canTake(s, v) { return s.sk > 0 || (v > 0 && v <= (s.rune ? s.rune.t : BAND[0].top)); }
  function freeSpot() {
    const pl = Object.keys(F.pl).map(function (k) { return F.pl[k]; }).filter(function (s) { return s.here; });
    for (let n = 0; n < 80; n++) {
      const x = rnd(120, 1080), y = rnd(300, 705);
      if (onDais(x, y, 45) || nearCannon(x, y, 150)) continue;
      if (n < 50 && F.orbs.some(function (o) { return d2(x, y, o.x, o.y) < 100 * 100; })) continue;
      if (n < 50 && pl.some(function (s) { return d2(x, y, s.x, s.y) < 100 * 100; })) continue;
      return { x: Math.round(x), y: Math.round(y) };
    }
    return { x: ri(140, 380), y: ri(450, 520) };
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
  // the same when every number may be taken times 1 to 9
  function reachMul(need, vals) {
    if (need <= 0) return true;
    const ok = new Uint8Array(need + 1);
    ok[0] = 1;
    vals.forEach(function (v) {
      for (let s = need; s >= v; s--) {
        if (ok[s]) continue;
        for (let m = 1; m <= 9 && v * m <= s; m++) if (ok[s - v * m]) { ok[s] = 1; break; }
      }
    });
    return !!ok[need];
  }
  // the plus numbers a fighter can use: on the floor, and in their own hands (unless they loaded nothing for a while)
  function numbersFor(s) {
    const out = [];
    F.orbs.forEach(function (o) { if (o.v > 0 && canTake(s, o.v)) out.push(o.v); });
    if (F.ft - s.gain < 15000) s.carry.forEach(function (v) { if (v > 0) out.push(v); });
    return out;
  }
  function stuck(s) {          // this fighter's rune cannot be made with the numbers in play
    if (!s.rune) return false;
    const need = s.rune.t - s.rune.sum;
    return !(s.sk === 2 ? reachMul(need, numbersFor(s)) : reach(need, numbersFor(s)));
  }
  function helpful(s) {        // an orb that brings this fighter's rune within reach
    const need = s.rune.t - s.rune.sum;
    if (s.sk === 0) return need <= 5 ? need : ri(Math.max(1, need - 5), 5);
    if (s.sk === 1) { const top = F.diff === 0 ? 6 : 9; return need <= top ? need : ri(Math.ceil(top / 2), top); }
    const fit = [];
    for (let v = 2; v <= 9; v++) if (need % v === 0 && need / v <= 9) fit.push(v);
    if (need <= 9) fit.push(need);
    return fit.length ? fit[ri(0, fit.length - 1)] : ri(6, 9);
  }
  function orbFor(sk) {        // a number that suits a fighter of this skill
    if (sk === 0) return ri(1, 5);
    if (sk === 1) return ri(1, F.diff === 0 ? 6 : 9);
    return Math.random() < 0.6 ? ri(5, 9) : ri(1, 9);
  }
  function firstStuck() {
    const list = fighters();
    for (let i = 0; i < list.length; i++) { const s = list[(i + F.ticks) % list.length]; if (stuck(s)) return s; }
    return null;
  }
  function orbValue() {
    const list = fighters(), s = firstStuck();
    if (s) return helpful(s);
    if (F.diff === 2 && Math.random() < 0.2 && list.some(function (o) { return o.sk > 0; }) &&
      F.orbs.filter(function (o) { return o.v < 0; }).length < 3) return -ri(1, 5);
    return list.length ? orbFor(list[ri(0, list.length - 1)].sk) : ri(1, 9);
  }
  // Every rune must always be reachable with the numbers in play. If one is not, a helpful orb appears
  // (and the oldest one goes when the floor is already full).
  function keepSolvable(want) {
    const s = firstStuck();
    if (!s) return;
    const msg = { t: 'boss.o', add: [] };
    if (F.orbs.length >= want + 2) msg.del = [F.orbs.shift().id];
    msg.add.push(orbArr(addOrb(helpful(s))));
    api.broadcast(msg, inRoom);
  }
  function nearSpot(s) {
    for (let n = 0; n < 16; n++) {
      const a = rnd(0, Math.PI * 2), r = rnd(64, 110);
      const x = clamp(s.x + Math.cos(a) * r, X0 + 30, X1 - 30), y = clamp(s.y + Math.sin(a) * r * 0.8, Y0 + 30, Y1 - 15);
      if (onDais(x, y, 30) || d2(x, y, F.cx, CANNON.y) < 125 * 125 || d2(x, y, s.x, s.y) < 55 * 55) continue;
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
      if (q < PICK_R * PICK_R && s.carry.length < capOf(s) && canTake(s, o.v)) {
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
    s.act = F.ft;
    const o = addOrb(s.carry.pop(), s.x, s.y, p.key);
    api.broadcast({ t: 'boss.o', add: [orbArr(o)], id: p.id, c: s.carry, fx: 'drop' }, inRoom);
  });

  // ---------- the cannon ----------
  // One orb goes into the player's own sum, times `mul` (always 1 for the children).
  function loadOrb(p, s, i, mul) {
    const r = s.rune, v = s.carry.splice(i, 1)[0];
    s.next = F.ft + (s.sk === 2 ? TAP_MS : LOAD_MS); s.n++; s.gain = F.ft; s.act = F.ft;
    data(p).orbs++; api.saveSoon();
    api.questEvent(p, 'boss.orb');
    r.sum += v * mul; r.parts.push([v, mul]);
    if (r.parts.length > 6) r.parts.splice(0, r.parts.length - 6);
    const msg = { id: p.id, v: v, m: mul, c: s.carry };
    if (r.sum === r.t) {                 // exactly the number on the rune: it lights up
      const bonus = !s.has || s.done;    // not the rune the shield asks of this fighter: it adds damage instead
      if (bonus) F.bonus++; else s.done = true;
      s.lit++; s.rune = null; s.tier++;
      const h = holders(), shot = h.length > 0 && h.every(function (o) { return o.done; });
      if (!shot) {
        // full power: no more bonus runes, the fast ones help the others now
        if (F.bonus >= BONUS_CAP) fighters().forEach(function (o) { if (o.rune && (o.done || !o.has)) o.rune = null; });
        else giveRune(s);
      }
      msg.t = 'boss.lit'; msg.was = r.t; msg.parts = r.parts; msg.b = bonus ? 1 : 0; msg.bonus = F.bonus; msg.r = runesArr();
      api.broadcast(msg, inRoom);
      if (shot) fire(); else if (!h.length && checkFire()) sendRunes();
    } else if (r.sum > r.t) {            // too much: only this player's sum empties
      msg.t = 'boss.over'; msg.sum = r.sum; msg.parts = r.parts; msg.target = r.t; msg.angry = 0;
      r.sum = 0; r.parts = [];
      if (s.sk > 0) {                    // (a Little fighter's slip does not make the boss angry)
        F.angry = F.ft + ANGRY_MS; F.nextAtk = Math.min(F.nextAtk, F.ft + 900); msg.angry = ANGRY_MS;
      }
      api.broadcast(msg, inRoom);
    } else { msg.t = 'boss.sum'; msg.sum = r.sum; msg.parts = r.parts; api.broadcast(msg, inRoom); }
  }
  // The next orb the cannon takes from a player's hands: the first one, but a minus gem waits until there is
  // enough to take away from. (The tablet shows the same orb as "next".)
  function nextOrb(s) {
    for (let k = 0; k < s.carry.length; k++) if (s.carry[k] > 0 || s.rune.sum + s.carry[k] >= 0) return k;
    return -1;
  }
  // The children's orbs go in by themselves, one by one.
  function autoLoad(p, s) { const k = nextOrb(s); if (k >= 0) loadOrb(p, s, k, 1); }
  api.on('load', function (p, m) {     // a Grown-up loads the next orb in their hands, times 1 to 9
    if (phase !== 'fight' || !F || p.room !== ID) return;
    const s = F.pl[p.key], mul = m.m;
    if (!s || s.sk !== 2 || !Number.isInteger(mul) || mul < 1 || mul > 9 || !s.rune || !s.carry.length) return;
    if (F.ft < s.down || F.ft < s.next || !atCannon(s)) return;
    const k = nextOrb(s);
    if (k < 0 || s.rune.sum + s.carry[k] * mul < 0) return;
    loadOrb(p, s, k, mul);
  });

  // ---------- the roles ----------
  function bubbled(s) { return F.bubs.some(function (b) { return F.ft < b.until && d2(s.x, s.y, b.x, b.y) < (b.r + 20) * (b.r + 20); }); }
  api.on('act', function (p) {
    if (phase !== 'fight' || !F || p.room !== ID) return;
    const s = F.pl[p.key];
    if (!s) return;
    s.act = F.ft;
    if (F.ft < s.cd) { api.send(p, { t: 'boss.no', cd: Math.round(s.cd - F.ft) }); return; }   // still cooling down
    const R = ROLE[s.role], msg = { t: 'boss.act', id: p.id, r: s.role, cd: R.cd };
    if (F.ft < s.down && s.role !== 1) return;       // knocked down: only the Healer can still act
    if (s.role === 0) {                              // Guard
      const b = { id: F.nextId++, x: s.x, y: s.y, r: R.r, until: F.ft + R.ms };
      F.bubs.push(b);
      msg.bid = b.id; msg.x = b.x; msg.y = b.y; msg.rad = b.r; msg.ms = R.ms;
    } else if (s.role === 1) {                       // Healer
      msg.up = []; msg.safe = R.safe;
      here().forEach(function (o) {
        const h = F.pl[o.key], back = [];
        if (!h || F.ft >= h.down) return;
        h.down = F.ft; h.safe = F.ft + R.safe; msg.up.push(o.id);
        h.spilt.forEach(function (id) {              // the orbs that rolled away come back, if nobody took them
          const i = F.orbs.findIndex(function (q) { return q.id === id; });
          if (i >= 0 && h.carry.length < capOf(h)) { h.carry.push(F.orbs[i].v); F.orbs.splice(i, 1); back.push(id); }
        });
        h.spilt = [];
        if (back.length) api.broadcast({ t: 'boss.o', del: back, id: o.id, c: h.carry, fx: 'take' }, inRoom);
      });
      if (!msg.up.length) { api.send(p, { t: 'boss.no', cd: 0 }); return; }   // nobody is down: the ability stays ready
    } else if (s.role === 2) {                       // Collector
      const near = F.orbs.filter(function (o) { return d2(o.x, o.y, s.x, s.y) < R.r * R.r; });
      msg.mv = [];
      near.forEach(function (o, i) {
        let a = i * Math.PI * 2 / near.length + 0.4, x = 0, y = 0;
        for (let n = 0; n < 4; n++) {
          x = clamp(s.x + Math.cos(a) * 80, X0 + 30, X1 - 30); y = clamp(s.y + Math.sin(a) * 74, Y0 + 30, Y1 - 15);
          if (!onDais(x, y, 20) && d2(x, y, s.x, s.y) > 58 * 58) break;
          a += Math.PI / 2;
        }
        o.x = Math.round(x); o.y = Math.round(y); o.skip = null;
        msg.mv.push([o.id, o.x, o.y]);
      });
    } else {                                         // Runner
      s.safe = Math.max(s.safe, F.ft + R.ms + 100);
      msg.ms = R.ms;
    }
    s.cd = F.ft + R.cd;
    api.broadcast(msg, inRoom);
  });

  // ---------- the boss's attacks: always announced first ----------
  function live() { return fighters().filter(function (s) { return F.ft >= s.down; }); }
  function anySpot() { return { x: rnd(150, 1050), y: rnd(440, 700) }; }
  // k + extra places to aim at: players first, then anywhere on the floor. The boss goes for the big ones:
  // a Grown-up is picked three times as often as a Little fighter, a Big kid twice as often.
  function aims(k, extra) {
    const pool = live(), out = [];
    while (out.length < k && pool.length) {
      let total = 0, r, i = 0;
      pool.forEach(function (s) { total += s.sk + 1; });
      r = Math.random() * total;
      while (i < pool.length - 1 && (r -= pool[i].sk + 1) >= 0) i++;
      out.push({ x: pool[i].x, y: pool[i].y });
      pool.splice(i, 1);
    }
    while (out.length < k + extra) out.push(anySpot());
    return out;
  }
  function circ(x, y, r) { return ['c', Math.round(x), Math.round(y), r]; }
  function angTo(a) { return Math.atan2(a.y - (BOSS.y + 30), a.x - BOSS.x); }
  function beam(ang, w) { return ['l', BOSS.x, BOSS.y + 30, Math.round(BOSS.x + Math.cos(ang) * 1300), Math.round(BOSS.y + 30 + Math.sin(ang) * 1300), w]; }
  function claw(d) { return circ(d < 0 ? 335 : 865, 520, 255); }                               // the left or the right side of the cave
  // A red zone on the floor; whoever stands in it after `delay` ms is hit. Shapes: ['c', x, y, r] a circle,
  // ['l', x1, y1, x2, y2, half width] a lane, ['s', x, y, r] a SAFE circle: with those, everywhere else is hit.
  function zone(shapes, delay) {
    const a = { id: F.nextId++, z: shapes, hit: F.ft + delay };
    F.atks.push(a);
    api.broadcast({ t: 'boss.atk', id: a.id, z: shapes, in: delay }, inRoom);
  }
  function later(ms, fn) { F.todo.push({ at: F.ft + ms, fn: fn }); }       // the second part of an attack
  function roll(y, dir, delay, r, k) { // something rolls across the cave along a marked lane
    const sp = Math.round(F.D.rock * (k || 1));
    const q = { id: F.nextId++, x: dir > 0 ? -70 : 1270, y: Math.round(clamp(y, 320, 700)), vx: dir * sp, vy: 0, r: r || 38, born: F.ft + delay, life: Math.round(1340 / sp * 1000) };
    F.rocks.push(q);
    api.broadcast({ t: 'boss.rock', id: q.id, x: q.x, y: q.y, vx: q.vx, vy: 0, r: q.r, in: delay, life: q.life }, inRoom);
  }
  function fall(x, delay) {            // a whirlwind comes down the cave along a marked lane
    const sp = Math.round(F.D.rock * 0.9);
    const q = { id: F.nextId++, x: Math.round(clamp(x, 110, 1090)), y: 215, vx: 0, vy: sp, r: 36, born: F.ft + delay, life: Math.round(600 / sp * 1000) };
    F.rocks.push(q);
    api.broadcast({ t: 'boss.rock', id: q.id, x: q.x, y: q.y, vx: 0, vy: q.vy, r: q.r, in: delay, life: q.life }, inRoom);
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
  // something that stays on the floor for a while: k 0 sticky slime (walking through it is slow),
  // k 1 burning ground (it knocks down)
  function puddle(x, y, r, k, delay, ms) {
    if (F.puds.length >= 8) return;
    const q = { id: F.nextId++, x: Math.round(x), y: Math.round(y), r: r, k: k, from: F.ft + delay, until: F.ft + delay + ms };
    F.puds.push(q);
    api.broadcast({ t: 'boss.pud', add: [[q.id, q.x, q.y, q.r, q.k, delay, ms]] }, inRoom);
  }
  function side() { return Math.random() < 0.5 ? 1 : -1; }
  // the squares of the Storm Owl's feather rain: every other one
  function squares(odd, fine) {
    const xs = fine ? [176, 388, 600, 812, 1024] : [247, 600, 953], ys = fine ? [385, 525, 665] : [420, 620], out = [];
    const w = fine ? 70 : 100, half2 = fine ? 36 : 76;
    xs.forEach(function (x, i) { ys.forEach(function (y, j) { if ((i + j) % 2 === odd) out.push(['l', x - half2, y, x + half2, y, w]); }); });
    return out;
  }
  // [weight, what happens (difficulty 0-2, second half of the fight), kind], per boss.
  // 'min': not while three minions are about. 'big': the boss's signature move, never the opening attack.
  const PATTERNS = [
    [ // Slime King: belly slams that leave a sticky puddle, slime balls, little slimes, now and then a rock
      [3, function (lv, p2) {
        const list = aims(lv > 0 ? 2 : 1, p2 ? 1 : 0);
        zone(list.map(function (a) { return circ(a.x, a.y, 100); }), WARN_MS);
        list.forEach(function (a) { puddle(a.x, a.y, 86, 0, WARN_MS, 6000 + lv * 1500); });
      }, 'big'],
      [3, function (lv, p2) { aims(1, 2 + lv + (p2 ? 1 : 0)).forEach(function (a, i) { zone([circ(a.x, a.y, 74)], WARN_MS + i * 320); }); }],
      [2, function (lv, p2) { hatch(1 + (lv > 0 ? 1 : 0) + (p2 ? 1 : 0)); }, 'min'],
      [2, function (lv, p2) { const a = aims(1, 1), d = side(); roll(a[0].y, d, WARN_MS); if (lv > 1 || p2) roll(a[1].y, -d, WARN_MS + 700); }]
    ],
    [ // Rock Golem: ground-splitting smashes, rolling boulders, a quake around the cannon, rocklings, and the roof
      [3, function (lv, p2) { zone(aims(lv > 0 ? 2 : 1, p2 ? 1 : 0).map(function (a) { return beam(angTo(a), 55); }), WARN_MS); }],
      [3, function (lv, p2) {
        const lanes = api.shuffle([340, 430, 520, 610, 695]), n = 2 + (lv > 1 ? 1 : 0) + (p2 ? 1 : 0), d = side();
        for (let i = 0; i < n; i++) roll(lanes[i], i % 2 ? -d : d, WARN_MS + i * 450);
      }],
      [2, function (lv, p2) {
        zone([circ(CANNON.x, CANNON.y, 155)], WARN_MS + 100);
        if (lv > 0 || p2) { const a = aims(1, 0)[0]; zone([circ(a.x, a.y, 95)], WARN_MS + 500); }
      }],
      [2, function (lv) { hatch(1 + (lv > 0 ? 1 : 0)); }, 'min'],
      [2, function (lv) {                // the roof comes down: only the three marked ledges are safe
        const r = lv > 1 ? 112 : lv > 0 ? 122 : 135;
        zone([270, 600, 930].map(function (x) { return ['s', Math.round(x + rnd(-45, 45)), Math.round(535 + rnd(-45, 55)), r]; }), WARN_MS + (lv > 1 ? 1000 : lv > 0 ? 1200 : 1500));
      }, 'big']
    ],
    [ // Fire Dragon: fans of fire breath, meteors that leave burning ground, a wall of fire, flame sprites, a fireball
      [3, function (lv, p2) {
        const a0 = angTo(aims(1, 0)[0]), d = side(), z = [beam(a0, 44), beam(a0 + d * 0.45, 44)];
        if (lv > 0) z.push(beam(a0 - d * 0.45, 44));
        if (lv > 1 && p2) z.push(beam(a0 + d * 0.9, 44));
        zone(z, WARN_MS);
      }],
      [3, function (lv, p2) {
        aims(2, 2 + lv + (p2 ? 1 : 0)).forEach(function (a, i) {
          zone([circ(a.x, a.y, 82)], WARN_MS + i * 260);
          if (i < 2 + lv) puddle(a.x, a.y, 58, 1, WARN_MS + i * 260 + 250, 3000 + lv * 1000);
        });
      }, 'big'],
      [2, function (lv, p2) {
        const xs = api.shuffle([245, 600, 955]).slice(0, lv > 0 && p2 ? 2 : 1);
        zone(xs.map(function (x) { return ['l', x, 236, x, 790, 172]; }), WARN_MS + 300);
      }],
      [2, function (lv) { hatch(2 + (lv > 1 ? 1 : 0)); }, 'min'],
      [1, function (lv, p2) { const a = aims(1, 1), d = side(); roll(a[0].y, d, WARN_MS); if (p2) roll(a[1].y, -d, WARN_MS + 600); }]
    ],
    [ // Coral Crab: a claw comes down on one side of the cave (then on the other), rows of bubbles with a gap, scuttling crabs
      [2, function (lv, p2) {
        const d = side(), w = WARN_MS + (lv > 1 ? 900 : lv > 0 ? 1100 : 1500);
        zone([claw(d)], w);
        if (lv > 0) later(w - 900, function () { zone([claw(-d)], 2100); });       // the other claw, 1.2 s after the first
        if (lv > 1 && p2) later(w + 300, function () { zone([claw(d)], 2100); });
      }, 'big'],
      [3, function (lv, p2) {
        api.shuffle([400, 520, 640]).slice(0, lv > 1 || (lv > 0 && p2) ? 2 : 1).forEach(function (y, n) {
          const gap = ri(0, 5), z = [];
          for (let i = 0; i < 6; i++) if (i !== gap && !(lv === 0 && i === (gap + 1) % 6)) z.push(circ(150 + i * 180, y, 82));
          zone(z, WARN_MS + 200 + n * 500);
        });
      }],
      [2, function (lv, p2) {
        const lanes = api.shuffle([335, 425, 515, 605, 695]), n = 2 + lv + (p2 ? 1 : 0), d = side();
        for (let i = 0; i < n; i++) roll(lanes[i], i % 2 ? -d : d, WARN_MS + i * 380, 26, 1.25);
      }],
      [2, function (lv) { hatch(1 + (lv > 0 ? 1 : 0)); }, 'min']
    ],
    [ // Clock Tortoise: the clock hand sweeps round the cave, alarm rings with a long fuse, a cog that comes back
      [2, function (lv) {
        const d = side(), n = lv > 0 ? 8 : 6, step = lv > 1 ? 280 : lv > 0 ? 340 : 440;
        const a0 = d > 0 ? 0.3 : Math.PI - 0.3, da = d * (Math.PI - 0.6) / (n - 1);
        for (let i = 0; i < n; i++) (function (k) { later(k * step, function () { zone([beam(a0 + da * k, 52)], WARN_MS - 100); }); })(i);
      }, 'big'],
      [3, function (lv, p2) {
        zone(aims(lv > 0 ? 2 : 1, 1 + (p2 ? 1 : 0)).map(function (a) { return circ(a.x, a.y, 128); }), WARN_MS + 800);
      }],
      [2, function (lv, p2) {
        const a = aims(1, 1), d = side(), y = a[0].y;
        roll(y, d, WARN_MS);
        if (lv > 0 || p2) later(Math.round(1340 / F.D.rock * 1000) + 200, function () { roll(y, -d, WARN_MS); });
        if (lv > 1 && p2) roll(a[1].y, -d, WARN_MS + 500);
      }],
      [2, function (lv) { hatch(1 + (lv > 0 ? 1 : 0)); }, 'min']
    ],
    [ // Storm Owl: feathers on every other square and then on the squares between, whirlwinds, two walls of wind
      [2, function (lv) {
        const odd = ri(0, 1), wait = lv > 1 ? 950 : lv > 0 ? 1150 : 1400, w = WARN_MS + 400;
        zone(squares(odd, lv > 1), w);
        later(w - 600, function () { zone(squares(1 - odd, lv > 1), 600 + wait); });
      }, 'big'],
      [3, function (lv, p2) {
        aims(lv > 0 ? 2 : 1, 1 + (p2 ? 1 : 0)).forEach(function (a, i) { fall(a.x, WARN_MS + i * 420); });
      }],
      [2, function (lv, p2) {
        const ys = api.shuffle([[330, 560], [330, 690], [450, 690]])[0].slice(0, lv > 0 || p2 ? 2 : 1);
        zone(ys.map(function (y) { return ['l', 40, y, 1160, y, lv > 1 ? 62 : 52]; }), WARN_MS + 200);
      }],
      [2, function (lv) { hatch(2 + (lv > 1 ? 1 : 0)); }, 'min']
    ]
  ];
  function attack() {
    const every = PATTERNS[F.boss];
    const list = every.filter(function (q, i) {
      return i !== F.lastPat && !(q[2] === 'min' && F.mins.length >= 3) && !(q[2] === 'big' && F.ft < 8000);
    });
    let total = 0, pick = list[0];
    list.forEach(function (q) { total += q[0]; });
    let r = Math.random() * total;
    for (let i = 0; i < list.length; i++) { r -= list[i][0]; if (r < 0) { pick = list[i]; break; } }
    F.lastPat = every.indexOf(pick);
    pick[1](F.diff, F.hp * 2 <= F.hpMax);
  }
  // the twist of the cave: the Clock Tortoise makes the orbs change places, the Storm Owl sends a gust
  function twist() {
    if (F.boss === 4) {
      api.broadcast({ t: 'boss.tw', in: 1000 }, inRoom);
      later(1000, function () {
        const order = api.shuffle(F.orbs), n = order.length;
        if (n < 2) return;
        const pos = order.map(function (o) { return [o.x, o.y]; });
        order.forEach(function (o, i) { const q = pos[(i + 1) % n]; o.x = q[0]; o.y = q[1]; o.skip = null; });
        api.broadcast({ t: 'boss.o', mv: order.map(function (o) { return [o.id, o.x, o.y]; }), fx: 'shuf' }, inRoom);
      });
    } else {
      F.wind = { dx: side(), v: 95 + F.diff * 15, from: F.ft + WARN_MS, until: F.ft + WARN_MS + 4500 };
      api.broadcast({ t: 'boss.wind', dx: F.wind.dx, v: F.wind.v, in: WARN_MS, ms: 4500 }, inRoom);
    }
  }

  // a tablet says its player was hit by an attack ('a'), a rock ('r'), a minion ('m') or burning ground ('p')
  api.on('hit', function (p, m) {
    if (phase !== 'fight' || !F || p.room !== ID) return;
    const s = F.pl[p.key], id = parseInt(m.id, 10), k = String(m.k);
    if (!s || F.ft < s.safe) return;
    let ok = false;
    if (k === 'a') ok = F.atks.some(function (a) { return a.id === id && F.ft >= a.hit - 500; });
    else if (k === 'r') ok = F.rocks.some(function (r) { return r.id === id && F.ft >= r.born - 400; });
    else if (k === 'p') ok = F.puds.some(function (q) { return q.id === id && q.k === 1 && F.ft >= q.from - 400 && F.ft < q.until + 400; });
    else if (k === 'm') {
      const i = F.mins.findIndex(function (q) { return q.id === id && F.ft >= q.born - 400; });
      if (i >= 0) { ok = true; F.mins.splice(i, 1); api.broadcast({ t: 'boss.min', del: [id] }, inRoom); }   // the minion pops
    }
    if (!ok || bubbled(s)) return;       // inside a Guard's bubble nothing hits
    // knocked down for 2 seconds (less for a Guard, a Healer and next to a Healer), the orbs roll away (not a Guard's
    // and not a Little fighter's), then safe for a moment (longer for the little ones); nobody is ever out of the game
    let ms = DOWN_MS;
    if (s.role === 1 || s.role === 0) ms = 1200;
    else if (fighters().some(function (h) { return h !== s && h.role === 1 && F.ft >= h.down && d2(h.x, h.y, s.x, s.y) < ROLE[1].near * ROLE[1].near; })) ms = 1000;
    s.down = F.ft + ms; s.safe = s.down + UP_SAFE[s.sk]; s.m = 0;
    const add = s.role === 0 || s.sk === 0 ? [] : spill(s);
    s.spilt = add.map(function (a) { return a[0]; });
    api.broadcast({ t: 'boss.ko', id: p.id, ms: ms, safe: ms + UP_SAFE[s.sk], add: add }, inRoom);
  });

  api.on('pos', function (p, m) {
    if (phase !== 'fight' || !F || p.room !== ID) return;
    const s = F.pl[p.key], x = +m.x, y = +m.y;
    if (!s || !isFinite(x) || !isFinite(y) || F.ft < s.down) return;
    s.x = Math.round(clamp(x, X0, X1)); s.y = Math.round(clamp(y, Y0, Y1));
    s.f = m.f < 0 ? -1 : 1; s.m = m.m ? 1 : 0; s.act = F.ft;
    pickUp(p, s);       // first come, first served
  });

  // ---------- the fight: 10 times a second ----------
  function safeTick() {
    try { tick(); }
    catch (e) { console.error('Monster Cave: the fight was stopped after an error:', e); stopFight(); sendLobby(); }
  }
  function tick() {
    if (!F) { clearInterval(tickTimer); tickTimer = null; return; }
    const now = Date.now(), dt = Math.min(300, Math.max(0, (now - F.last) * SPEED)), list = here();
    F.last = now;
    if (!list.length) { pause(); return; }
    F.ft += dt; F.ticks++;
    if (F.K.raft) F.cx = CANNON.x + 240 * Math.sin(F.ft / F.K.raft[F.diff] * Math.PI * 2);    // the cannon's raft drifts

    // orbs: picked up by walking over them, loaded while standing at the cannon (a Grown-up loads by hand)
    for (let i = 0; i < list.length; i++) {
      const p = list[i], s = F.pl[p.key];
      if (!s || F.ft < s.down) continue;
      if (s.sk === 0 && s.rune && s.carry.some(function (v) { return v > s.rune.t; })) {
        // a Little fighter's new rune is smaller than an orb still in the hands: that orb goes back on the floor
        const keep = s.carry.filter(function (v) { return v <= s.rune.t; }), big = s.carry.filter(function (v) { return v > s.rune.t; });
        s.carry = big;
        const add = spill(s);
        s.carry = keep;
        api.broadcast({ t: 'boss.o', add: add, id: p.id, c: s.carry, fx: 'drop' }, inRoom);
      }
      pickUp(p, s);
      if (s.rune && s.sk < 2 && s.carry.length && F.ft >= s.next && atCannon(s)) autoLoad(p, s);
      if (!F) return;   // that was the last hit
    }
    if (F.ft >= LIMIT_MS) { endFight(false); return; }

    const want = wantOrbs(list.length);
    if (F.orbs.length < want && F.ft >= F.nextSpawn) {
      F.nextSpawn = F.ft + 700;
      api.broadcast({ t: 'boss.o', add: [orbArr(addOrb(orbValue()))] }, inRoom);
    }
    if (F.ft >= F.nextCheck) {
      F.nextCheck = F.ft + 1000; keepSolvable(want);
      // did somebody fall asleep (or wake up)? Then the shot may not have to wait any longer.
      let turned = false;
      fighters().forEach(function (s) { const z = !awake(s); if (z !== s.zz) { s.zz = z; turned = true; } });
      if (turned) { checkFire(); if (!F) return; sendRunes(); }
    }

    // the boss
    if (F.todo.length) {
      const due = F.todo.filter(function (q) { return q.at <= F.ft; });
      if (due.length) { F.todo = F.todo.filter(function (q) { return q.at > F.ft; }); due.forEach(function (q) { q.fn(); }); }
    }
    if (F.ft >= F.nextAtk && F.ft >= F.dazed) {
      attack();
      let gap = F.D.gap * F.K.gap * rnd(0.85, 1.15);
      if (F.hp * 2 <= F.hpMax) gap *= 0.85;
      if (F.ft < F.angry) gap *= 0.55;
      F.nextAtk = F.ft + gap;
    }
    if (F.K.twist && F.ft >= F.nextTwist && F.ft >= F.dazed) { twist(); F.nextTwist = F.ft + F.K.twist * rnd(0.85, 1.15); }
    F.atks = F.atks.filter(function (a) { return F.ft < a.hit + 1500; });
    F.rocks = F.rocks.filter(function (r) { return F.ft < r.born + r.life + 300; });
    F.puds = F.puds.filter(function (q) { return F.ft < q.until + 500; });
    F.bubs = F.bubs.filter(function (b) { return F.ft < b.until; });

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
    if (F.K.raft) msg.cx = Math.round(F.cx);
    if (F.ticks % 10 === 0) msg.left = Math.round(LIMIT_MS - F.ft);
    api.broadcast(msg, inRoom);
  }

  // ---------- the end: the boss is beaten, or it escapes ----------
  function endFight(win) {
    const f = F, list = here(), secs = Math.max(1, Math.round(f.ft / 1000));
    stopFight();
    const rows = list.map(function (p) {
      const s = f.pl[p.key] || { n: 0, lit: 0, sk: skillOf(p), role: 0 }, d = data(p);
      let base = ESCAPE_STARS, first = false, capped = false;
      if (win) {
        first = beaten(d, f.boss) === 0;
        capped = d.n >= FULL_WINS;                   // full rewards for the first 5 wins of a day
        base = capped ? CAPPED_STARS : s.n > 0 ? f.D.stars : HELPER_STARS;     // the same for every level and role
        d.w[f.boss][f.diff]++; d.n++;
        if (!d.bt[f.boss] || secs < d.bt[f.boss]) d.bt[f.boss] = secs;
      }
      return { id: p.id, name: p.name, color: p.color, sk: s.sk, role: s.role, n: s.n, lit: s.lit, base: base, first: first, capped: capped, stars: base + (first ? FIRST_BONUS : 0) };
    });
    api.saveSoon();
    api.broadcast({ t: 'boss.end', win: win, boss: f.boss, diff: f.diff, secs: secs, shots: f.shots, rows: rows }, inRoom);
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
        sendRunes(p);                  // the others see the newcomer's rune
      } else { checkStart(); sendLobby(); }
    },
    leave: function (p) {
      delete ready[p.key];
      if (phase === 'fight' && F) {
        const s = F.pl[p.key];
        if (s) {
          s.here = false; s.m = 0; s.spilt = [];
          // the orbs stay in the game; the others see them fall
          if (s.carry.length) api.broadcast({ t: 'boss.o', add: spill(s), id: p.id, c: [], fx: 'drop' }, inRoom);
        }
        if (!here().length) { pause(); return; }
        checkFire();                   // the one who left no longer holds up the shot
        if (F) sendRunes();
      } else { checkStart(); sendLobby(); }
    }
  });

  // ---------- daily quests ----------
  api.addQuest({ type: 'boss.win', icon: '👾', solo: true, tiers: [[1, 6]],
    en: 'Beat a boss in the Monster Cave', zh: '在怪兽洞打败一个大怪兽', py: 'zài guàishòu dòng dǎbài yí gè dà guàishòu', ms: 'Kalahkan seekor raksasa di Gua Raksasa' });
  api.addQuest({ type: 'boss.orb', icon: '🔮', solo: true, tiers: [[8, 4], [12, 5], [18, 7]],
    en: 'Load {n} number orbs into the cannon', zh: '把 {n} 个数字球装进大炮', py: 'bǎ {n} gè shùzì qiú zhuāng jìn dàpào', ms: 'Masukkan {n} bola nombor ke dalam meriam' });
};
