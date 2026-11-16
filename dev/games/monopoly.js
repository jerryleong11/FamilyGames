// Family Town game module "monopoly": Town Monopoly (大富翁), a property board game for 2 to 6 seats.
// Everything is decided here: dice, money, ownership, turn order, lucky cards, timers, robots and results.
// The tablets only show what this file sends and ask to roll, buy, upgrade or pay.
// Client: public/games/monopoly.js. Contract: docs/GAME-MODULES.md.
//
// Messages from a tablet:   monopoly.robots { d: 1 | -1 }   monopoly.start   monopoly.roll
//                           monopoly.buy { yes }   monopoly.up { i, yes }   monopoly.pay { notes: [n1, n5, n10, n20, n50] } or { auto: true }
//                           monopoly.take { seat }   monopoly.again
// Messages to the tablets:  monopoly.hello (the board, once)   monopoly.state (everything, with `ev` = what just happened)
//                           monopoly.me (the player's own record)
//
// Two games share the one table. The lobby chooses:   monopoly.mode { mode: 'quick' | 'big' }   monopoly.rounds { n }
//   "quick": the first game, unchanged: 24 spaces, one die, 10 rounds (everything above).
//   "big":   36 spaces, two dice, 22 shops in 8 colours with four building levels, 4 transport lines, 2 businesses,
//            auctions, trades, mortgages, two card decks, town events, players can go out. Its code is the second
//            half of this file (everything named b... / B_...). Extra messages from a tablet in the Big game:
//              monopoly.bid { add: 10 | 50 | 100, at } or { pass: true }        monopoly.wake { how: 'pay' | 'card' | 'roll' }
//              monopoly.build { i }   monopoly.sell { i }   monopoly.mort { i, on }   monopoly.raise   monopoly.skip   monopoly.think
//              monopoly.trade { to, give: { shops, cash, wake, skip }, get: { ... } }   monopoly.answer { yes }
'use strict';
module.exports = function (api) {
  const ID = api.id;
  function T(name) { return ID + '.' + name; }

  // ---------- rules ----------
  const N = 24, ROUNDS = 10, SALARY = 30, TAX = 15, POT_START = 10, MAX_SEATS = 6;
  const START_CASH = parseInt(process.env.MONOPOLY_CASH, 10) >= 0 ? parseInt(process.env.MONOPOLY_CASH, 10) : 150;   // the variable is for tests only
  const STARS = [15, 10, 7, 5];      // stars by final place: 1st, 2nd, 3rd, everyone after
  const FULL_GAMES = 3, LATER_STARS = 2, MIN_TURNS = 5;
  const NOTES = [1, 5, 10, 20, 50];
  const TINTS = ['#FF4F6D', '#3B82F6', '#37B24D', '#FF9F1C', '#9B6BFF', '#14B8C4']; // one colour per seat: buildings, flags, markers
  const ROBOTS = ['Robo Bip', 'Robo Zed', 'Robo Dot', 'Robo Max', 'Robo Pim'];
  const GROUPS = ['#FFD3A1', '#BDEBAE', '#B3DBFF', '#FFC0DB', '#D8C6FF', '#FFE584'];  // ground colour of each shop group

  // Tests only: MONOPOLY_SPEED=20 makes every wait 20 times shorter; MONOPOLY_DICE / MONOPOLY_CARDS fix the luck.
  const SPEED = Math.max(1, parseFloat(process.env.MONOPOLY_SPEED) || 1);
  function seq(s) { return String(s || '').split(',').map(function (v) { return parseInt(v, 10); }).filter(function (v) { return v >= 0; }); }
  const FIX_DICE = seq(process.env.MONOPOLY_DICE), FIX_CARDS = seq(process.env.MONOPOLY_CARDS);
  let fixDie = 0, fixCard = 0;
  function ms(n) { return Math.max(5, Math.round(n / SPEED)); }
  const TURN_MS = ms(25000), DECIDE_MS = ms(20000), PAY_MS = ms(20000), ROBOT_MS = ms(1000);
  const DIE_MS = ms(1100), HOP_MS = ms(280), LAND_MS = ms(350), CARD_MS = ms(2600), FLY_MS = ms(1700);
  const ABANDON_MS = 5 * 60000;      // a game nobody came back to for this long is dropped

  // ---------- the board: 24 spaces, clockwise from Start ----------
  function shop(g, price, icon, en, zh, py, ms_) {
    return { t: 'shop', g: g, price: price, rent: Math.round(price / 3), up: Math.ceil(price / 10) * 5, icon: icon, en: en, zh: zh, py: py, ms: ms_ };
  }
  function spot(t, icon, en, zh, py, ms_) { return { t: t, icon: icon, en: en, zh: zh, py: py, ms: ms_ }; }
  function lucky() { return spot('lucky', '🍀', 'Lucky card', '幸运卡', 'xìngyùn kǎ', 'Kad tuah'); }
  function bus() { return spot('bus', '🚌', 'Bus stop', '巴士站', 'bāshì zhàn', 'Hentian bas'); }
  const BOARD = [
    spot('start', '🚩', 'Start', '起点', 'qǐdiǎn', 'Mula'),
    shop(0, 20, '🍦', 'Ice Cream Shop', '冰淇淋店', 'bīngqílín diàn', 'Kedai aiskrim'),
    lucky(),
    shop(0, 20, '🍹', 'Juice Bar', '果汁店', 'guǒzhī diàn', 'Kedai jus'),
    shop(1, 25, '🍎', 'Fruit Stall', '水果摊', 'shuǐguǒ tān', 'Gerai buah'),
    shop(1, 25, '🍞', 'Bakery', '面包店', 'miànbāo diàn', 'Kedai roti'),
    spot('nap', '😴', 'Nap corner', '午睡角', 'wǔshuì jiǎo', 'Sudut tidur'),
    shop(2, 30, '📚', 'Book Shop', '书店', 'shūdiàn', 'Kedai buku'),
    bus(),
    shop(2, 30, '🎈', 'Toy Shop', '玩具店', 'wánjù diàn', 'Kedai mainan'),
    shop(2, 35, '🐶', 'Pet Shop', '宠物店', 'chǒngwù diàn', 'Kedai haiwan'),
    lucky(),
    spot('park', '🌳', 'Free park', '公园', 'gōngyuán', 'Taman'),
    shop(3, 40, '🌷', 'Flower Shop', '花店', 'huādiàn', 'Kedai bunga'),
    lucky(),
    shop(3, 40, '🍬', 'Sweet Shop', '糖果店', 'tángguǒ diàn', 'Kedai gula-gula'),
    bus(),
    shop(3, 45, '🍜', 'Noodle House', '面馆', 'miànguǎn', 'Kedai mi'),
    spot('tax', '🏛️', 'Town tax', '交税', 'jiāo shuì', 'Cukai bandar'),
    shop(4, 50, '🎬', 'Cinema', '电影院', 'diànyǐngyuàn', 'Pawagam'),
    shop(4, 50, '🚲', 'Bike Shop', '自行车店', 'zìxíngchē diàn', 'Kedai basikal'),
    shop(5, 55, '🎮', 'Game Arcade', '游戏厅', 'yóuxìtīng', 'Arked permainan'),
    shop(5, 55, '🤖', 'Robot Shop', '机器人店', 'jīqìrén diàn', 'Kedai robot'),
    shop(5, 60, '🏰', 'Castle Hotel', '城堡酒店', 'chéngbǎo jiǔdiàn', 'Hotel istana')
  ];
  const BUS = [], GROUP_OF = {};
  let NAP = 0, PARK = 0;
  BOARD.forEach(function (sp, i) {
    if (sp.t === 'bus') BUS.push(i);
    if (sp.t === 'nap') NAP = i;
    if (sp.t === 'park') PARK = i;
    if (sp.t === 'shop') (GROUP_OF[sp.g] = GROUP_OF[sp.g] || []).push(i);
  });

  // Lucky cards. k: gain n | lose n | each n (n > 0 everyone gives you n, n < 0 you give everyone -n) | move n steps | goto space | nap
  function card(k, n, icon, en, zh, py, ms_) { return { k: k, n: n, icon: icon, en: en, zh: zh, py: py, ms: ms_ }; }
  const CARDS = [
    card('gain', 20, '🎁', 'You found a present', '捡到一份礼物', 'jiǎn dào yí fèn lǐwù', 'Jumpa hadiah'),
    card('gain', 15, '🧹', 'You helped tidy the park', '帮忙打扫公园', 'bāngmáng dǎsǎo gōngyuán', 'Tolong bersihkan taman'),
    card('gain', 10, '🦷', 'The tooth fairy came', '牙仙子来了', 'yá xiānzǐ lái le', 'Pari-pari gigi datang'),
    card('gain', 25, '🏆', 'You won the drawing contest', '画画比赛得奖', 'huàhuà bǐsài dé jiǎng', 'Menang pertandingan melukis'),
    card('gain', 5, '💰', 'Coins under the sofa', '沙发下有硬币', 'shāfā xià yǒu yìngbì', 'Syiling di bawah sofa'),
    card('lose', 15, '🔧', 'Your bike needs fixing', '修自行车', 'xiū zìxíngchē', 'Baiki basikal'),
    card('lose', 5, '🎈', 'Your balloon flew away', '气球飞走了', 'qìqiú fēi zǒu le', 'Belon terbang'),
    card('each', -5, '🍦', 'Ice cream for everyone', '请大家吃冰淇淋', 'qǐng dàjiā chī bīngqílín', 'Belanja aiskrim untuk semua'),
    card('each', 5, '🎉', 'Everyone gives you a gift', '大家送你礼物', 'dàjiā sòng nǐ lǐwù', 'Semua beri hadiah'),
    card('goto', 0, '🚀', 'Zoom to Start', '飞到起点', 'fēi dào qǐdiǎn', 'Terbang ke Mula'),
    card('move', 3, '👟', 'Run 3 steps ahead', '往前跑三步', 'wǎng qián pǎo sān bù', 'Lari 3 langkah ke depan'),
    card('move', -2, '🐢', 'Walk 2 steps back', '往后走两步', 'wǎng hòu zǒu liǎng bù', 'Undur 2 langkah'),
    card('goto', PARK, '🌳', 'Picnic in the park', '去公园野餐', 'qù gōngyuán yěcān', 'Berkelah di taman'),
    card('nap', 0, '😴', 'So sleepy! Off to the Nap corner', '好困，去午睡', 'hǎo kùn, qù wǔshuì', 'Mengantuk, pergi tidur')
  ];

  // ---------- the one table ----------
  let G = null;                      // the running game (or its results); null = the lobby is open
  const lobby = { robots: null, mode: 'quick', rounds: 0 };    // robots: null = automatic (fill up to 3 players); rounds: for the Big game

  // One step of the game is always waiting on this single timer.
  let timer = null, pend = null;
  function wait(n, fn) {
    clearTimeout(timer);
    pend = { fn: fn, at: Date.now() + n, left: n };
    timer = setTimeout(fire, n);
  }
  function fire() {
    const p = pend;
    timer = null; pend = null;
    if (!p || !G) return;
    try { p.fn(); } catch (e) {
      console.error('monopoly: a step failed, the game moves on:', e);
      try {
        if (G && G.phase === 'play') {
          if (G.mode === 'big') bRecover();
          else { G.step = 'end'; G.deadline = 0; wait(ms(600), nextTurn); }
        }
      } catch (e2) {}
    }
  }
  function stopWait() { clearTimeout(timer); timer = null; pend = null; }
  function pause() {           // nobody is in the room: the game sleeps until somebody comes back
    if (!G || G.pausedAt) return;
    if (timer) { clearTimeout(timer); timer = null; }
    if (pend) pend.left = Math.max(0, pend.at - Date.now());
    G.pausedAt = Date.now();
  }
  function resume() {
    if (!G || !G.pausedAt) return;
    G.pausedAt = 0;
    if (pend && !timer) {
      const n = Math.max(ms(700), pend.left || 0);
      pend.at = Date.now() + n;
      if (G.deadline) G.deadline = pend.at;
      timer = setTimeout(fire, n);
    }
  }

  // ---------- small helpers ----------
  function lookOf(p) { return { color: p.color, hat: p.hat, big: !!p.big, outfit: p.outfit || null }; }
  function inRoomList() { return api.roomList(ID); }
  function onlineByKey(key) {
    let found = null;
    api.players.forEach(function (p) { if (p.key === key) found = p; });
    return found;
  }
  function seatByKey(key) {
    if (!G || !key) return -1;
    for (let i = 0; i < G.seats.length; i++) if (!G.seats[i].robot && G.seats[i].key === key) return i;
    return -1;
  }
  function record(prof) {
    const d = prof[ID] || (prof[ID] = {});
    d.games = d.games || 0; d.wins = d.wins || 0; d.best = d.best || 0; d.bought = d.bought || 0; d.owed = d.owed || 0;
    // the Big game keeps its own records next to the first ones (added later: an old save has none of them)
    d.bigGames = d.bigGames || 0; d.bigWins = d.bigWins || 0; d.bigBest = d.bigBest || 0; d.bigToday = d.bigToday || 0;
    if (d.day !== api.today()) { d.day = api.today(); d.today = 0; d.bigToday = 0; }
    return d;
  }
  function sendMe(p) {
    const prof = api.prof(p);
    if (!prof) return;
    const d = record(prof);
    api.send(p, { t: T('me'), games: d.games, wins: d.wins, best: d.best, today: d.today, full: FULL_GAMES,
      big: { games: d.bigGames, wins: d.bigWins, best: d.bigBest, today: d.bigToday, full: B_FULL, later: B_LATER } });
  }
  function payOwed(p) {              // stars from a game that ended while the player was offline
    const prof = api.prof(p);
    if (!prof || !prof[ID] || !(prof[ID].owed > 0)) return;
    const n = prof[ID].owed;
    prof[ID].owed = 0;
    api.saveSoon();
    api.addStars(p, n);
    api.send(p, { t: 'toast', msg: 'You get ' + n + ' stars from your last Monopoly game!' });
  }

  function shopsOf(si) { const out = []; for (let i = 0; i < N; i++) if (G.own[i] === si) out.push(i); return out; }
  function valueOf(i) { return BOARD[i].price + G.lvl[i] * BOARD[i].up; }
  function shopsValue(si) { return shopsOf(si).reduce(function (a, i) { return a + valueOf(i); }, 0); }
  function ownsGroup(si, g) { return GROUP_OF[g].every(function (i) { return G.own[i] === si; }); }
  function rentOf(i) {
    const sp = BOARD[i], o = G.own[i];
    return sp.rent * (1 + G.lvl[i]) * (o >= 0 && ownsGroup(o, sp.g) ? 2 : 1);
  }
  function canUp(si, i) {
    const sp = BOARD[i];
    return !!sp && sp.t === 'shop' && G.own[i] === si && G.lvl[i] < 2 && G.seats[si].cash >= sp.up && !G.upgraded;
  }
  function cheapestShop(si) {
    let best = -1;
    shopsOf(si).forEach(function (i) { if (best < 0 || BOARD[i].price < BOARD[best].price) best = i; });
    return best;
  }
  // A money change. Every one is reported with its sum (a + d = b) so the tablet can show it.
  function money(si, d, why, at) {
    const s = G.seats[si], a = s.cash;
    s.cash = a + d;
    return { s: si, a: a, d: d, b: s.cash, why: why, at: at || 0 };
  }
  // `si` owes `amount` to seat `to` (or to the park's piggy bank when to < 0). Who cannot pay gives what they
  // have, and their cheapest shop goes back to the bank. Nobody is ever knocked out.
  function charge(si, amount, to, why, sums) {
    const s = G.seats[si], paid = Math.min(s.cash, amount);
    let lost = -1;
    if (paid > 0) {
      sums.push(money(si, -paid, why));
      if (to >= 0) sums.push(money(to, paid, why + '+')); else G.pot += paid;
    }
    if (paid < amount) {
      lost = cheapestShop(si);
      if (lost >= 0) { G.own[lost] = -1; G.lvl[lost] = 0; }
    }
    return { paid: paid, lost: lost };
  }

  // The notes a player holds for an amount of coins: always some small ones, so there is something to count with.
  function walletOf(cash) {
    let r = cash, n1 = r % 5, n5 = 0, n10 = 0, n50 = 0;
    r -= n1;
    if (r >= 5) { n1 += 5; r -= 5; }
    if (r % 10 === 5) { n5 = 1; r -= 5; }
    if (r >= 10) { n5 += 2; r -= 10; }
    if (r >= 70) { n50 = 1; r -= 50; }
    while (r >= 150) { n50++; r -= 50; }
    if (r % 20 === 10) { n10 = 1; r -= 10; }
    if (r >= 40) { n10 += 2; r -= 20; }
    return [n1, n5, n10, r / 20, n50];
  }
  function sumNotes(list) { return list.reduce(function (a, n, k) { return a + n * NOTES[k]; }, 0); }
  // Auto pay: the exact amount when the notes allow it, otherwise as little too much as possible.
  function autoNotes(w, amount) {
    const used = [0, 0, 0, 0, 0];
    let rest = amount, k;
    for (k = NOTES.length - 1; k >= 0; k--) {
      const n = Math.min(w[k], Math.floor(rest / NOTES[k]));
      used[k] = n; rest -= n * NOTES[k];
    }
    if (rest > 0) {
      for (k = 0; k < NOTES.length; k++) if (w[k] > used[k] && NOTES[k] >= rest) { used[k]++; rest = 0; break; }
      for (k = 0; k < NOTES.length && rest > 0; k++) while (rest > 0 && w[k] > used[k]) { used[k]++; rest -= NOTES[k]; }
      for (k = 0; k < NOTES.length; k++) while (used[k] > 0 && sumNotes(used) - NOTES[k] >= amount) used[k]--;   // take back notes that are not needed
    }
    return used;
  }
  function changeNotes(n) {
    const out = [0, 0, 0, 0, 0];
    for (let k = NOTES.length - 1; k >= 0; k--) { out[k] = Math.floor(n / NOTES[k]); n -= out[k] * NOTES[k]; }
    return out;
  }

  // ---------- what the tablets get ----------
  function helloMsg() {
    return { t: T('hello'), board: BOARD, groups: GROUPS, cards: CARDS, tints: TINTS, notes: NOTES,
      cfg: { rounds: ROUNDS, cash: START_CASH, salary: SALARY, tax: TAX, die: DIE_MS, hop: HOP_MS, fly: FLY_MS, stars: STARS, minTurns: MIN_TURNS, maxSeats: MAX_SEATS },
      big: bHello() };
  }
  function lobbyHumans() { return inRoomList().slice(0, MAX_SEATS); }
  function lobbyRobots(h) {
    const lo = Math.max(0, 2 - h), hi = MAX_SEATS - h;
    return api.clamp(lobby.robots === null ? Math.max(0, 3 - h) : lobby.robots, lo, hi);
  }
  function stateMsg(ev) {
    if (!G) {
      const hs = lobbyHumans(), h = hs.length;
      return { t: T('state'), phase: 'lobby', ev: ev || null,
        humans: hs.map(function (p) { return { key: p.key, name: p.name, look: lookOf(p) }; }),
        robots: lobbyRobots(h), minRobots: Math.max(0, 2 - h), maxRobots: MAX_SEATS - h,
        mode: lobby.mode, rounds: lobbyRounds(), roundsOpts: B_ROUNDS };
    }
    if (G.mode === 'big') return bStateMsg(ev);
    return {
      t: T('state'), phase: G.phase, mode: 'quick', ev: ev || null,
      seats: G.seats.map(function (s, i) {
        return { key: s.robot ? null : s.key, name: s.name, robot: s.robot, away: !s.robot && s.away, look: s.look, tint: i,
          cash: s.cash, pos: s.pos, nap: s.nap, turns: s.turns, shops: shopsOf(i).length, worth: s.cash + shopsValue(i) };
      }),
      own: G.own, lvl: G.lvl, turn: G.turn, round: Math.min(G.round, ROUNDS), rounds: ROUNDS, step: G.step, pot: G.pot, die: G.die,
      offer: G.offer, pay: G.pay, card: G.card, upgraded: G.upgraded, takes: G.takes,
      left: G.deadline && !G.pausedAt ? Math.max(0, G.deadline - Date.now()) : 0,
      results: G.results
    };
  }
  function sendState(ev) { api.broadcast(stateMsg(ev), api.inRoom(ID)); }

  // ---------- turn flow ----------
  const WAITING = { roll: 1, buy: 1, up: 1, pay: 1 };   // steps that wait for the player whose turn it is
  // Sets the clock for the current step: a robot (or a robot standing in for someone away) acts after about a
  // second; a person gets their time, then the step is played for them.
  function armStep() {
    const s = G.seats[G.turn];
    if (s.robot || s.away) { G.deadline = 0; wait(ROBOT_MS, autoStep); return; }
    const n = G.step === 'roll' ? TURN_MS : G.step === 'pay' ? PAY_MS : DECIDE_MS;
    G.deadline = Date.now() + n;
    wait(n, autoStep);
  }
  function settle() { G.step = 'end'; G.deadline = 0; }      // the player has decided: the clock stops
  function endTurn(n) { settle(); wait(ms(n), nextTurn); }
  function nextTurn() {
    applyTakes();
    G.turn = (G.turn + 1) % G.seats.length;
    if (G.turn === 0) { G.round++; if (G.round > ROUNDS) { finish(); return; } }
    startTurn();
  }
  function startTurn() {
    const s = G.seats[G.turn];
    G.offer = null; G.pay = null; G.card = null; G.upgraded = false; G.deadline = 0;
    if (s.nap) {                     // the Nap corner: this turn is slept through
      s.nap = false; G.step = 'sleep';
      sendState({ k: 'sleep', s: G.turn });
      wait(ms(1800), nextTurn);
      return;
    }
    G.step = 'roll';
    armStep();
    sendState({ k: 'turn', s: G.turn });
  }

  function doRoll(auto) {
    const si = G.turn, s = G.seats[si], sums = [];
    const die = FIX_DICE.length ? api.clamp(FIX_DICE[fixDie++ % FIX_DICE.length], 1, 6) : 1 + Math.floor(Math.random() * 6);
    const from = s.pos, to = (from + die) % N;
    if (!s.robot && !s.away) s.turns++;
    s.pos = to; G.die = die; G.step = 'move'; G.deadline = 0;
    if (from + die >= N) sums.push(money(si, SALARY, 'salary', DIE_MS + (N - from) * HOP_MS));
    sendState({ k: 'roll', s: si, die: die, from: from, to: to, auto: !!auto, sums: sums });
    wait(DIE_MS + die * HOP_MS + LAND_MS, function () { land(0); });
  }

  // The token has arrived on a space. `depth` counts lucky cards that moved it there, so cards cannot chain forever.
  function land(depth) {
    const si = G.turn, s = G.seats[si], i = s.pos, sp = BOARD[i];
    if (sp.t === 'shop') {
      const o = G.own[i];
      if (o < 0) {
        if (s.cash >= sp.price) { G.step = 'buy'; G.offer = i; armStep(); sendState({ k: 'offer', s: si, i: i }); }
        else { sendState({ k: 'poor', s: si, i: i }); endTurn(1500); }
      } else if (o === si) {
        if (canUp(si, i)) { G.step = 'up'; G.offer = i; armStep(); sendState({ k: 'offer', s: si, i: i, up: true }); }
        else { sendState({ k: 'home', s: si, i: i }); endTurn(900); }
      } else due(rentOf(i), o, 'rent', i);
    } else if (sp.t === 'lucky') {
      if (depth >= 2) { sendState({ k: 'rest', s: si }); endTurn(600); return; }
      const c = drawCard();
      G.card = c; G.step = 'card';
      sendState({ k: 'card', s: si, c: c });
      wait(CARD_MS, function () { playCard(c, depth); });
    } else if (sp.t === 'bus') {       // ride on to the next bus stop
      const to = BUS[(BUS.indexOf(i) + 1) % BUS.length], sums = [];
      if (to < i) sums.push(money(si, SALARY, 'salary', ms(1300)));
      s.pos = to; G.step = 'move';
      sendState({ k: 'bus', s: si, from: i, to: to, sums: sums });
      endTurn(2300);
    } else if (sp.t === 'tax') due(TAX, -1, 'tax', i);
    else if (sp.t === 'nap') { s.nap = true; sendState({ k: 'nap', s: si }); endTurn(1700); }
    else if (sp.t === 'park') {        // whoever rests in the park finds what is in the piggy bank
      const got = G.pot, sums = [];
      if (got > 0) { sums.push(money(si, got, 'park')); G.pot = 0; }
      sendState({ k: 'park', s: si, n: got, sums: sums });
      endTurn(got ? 2000 : 900);
    } else { sendState({ k: 'rest', s: si }); endTurn(700); }
  }

  // The player on turn owes rent (to a seat) or tax (to the piggy bank).
  function due(amount, to, why, i) {
    const si = G.turn, s = G.seats[si];
    if (s.cash < amount) {
      const sums = [], r = charge(si, amount, to, why, sums);
      settle();
      sendState({ k: 'short', s: si, to: to, why: why, i: i, amount: amount, paid: r.paid, lost: r.lost, sums: sums });
      endTurn(3200);
      return;
    }
    G.step = 'pay';
    G.pay = { amount: amount, to: to, why: why, i: i, wallet: walletOf(s.cash) };
    armStep();
    sendState({ k: 'due', s: si, to: to, why: why, i: i, amount: amount });
  }
  function doPay(notes) {            // notes = what the player handed over, or null for Auto pay
    const si = G.turn, pay = G.pay, sums = [];
    const used = notes || autoNotes(pay.wallet, pay.amount), paid = sumNotes(used), change = paid - pay.amount;
    sums.push(money(si, -pay.amount, pay.why));
    if (pay.to >= 0) sums.push(money(pay.to, pay.amount, pay.why + '+')); else G.pot += pay.amount;
    G.pay = null;
    settle();
    sendState({ k: 'paid', s: si, to: pay.to, why: pay.why, i: pay.i, amount: pay.amount, paid: paid, change: change,
      used: used, back: changeNotes(change), auto: !notes, sums: sums });
    endTurn(notes ? 3000 : 2200);
  }

  function doBuy(yes) {
    const si = G.turn, s = G.seats[si], i = G.offer, sp = BOARD[i];
    G.offer = null;
    settle();
    if (!yes || !sp || sp.t !== 'shop' || G.own[i] >= 0 || s.cash < sp.price) {
      sendState({ k: 'pass', s: si, i: i });
      endTurn(700);
      return false;
    }
    const sums = [money(si, -sp.price, 'buy')];
    G.own[i] = si;
    sendState({ k: 'buy', s: si, i: i, set: ownsGroup(si, sp.g), sums: sums });
    endTurn(1700);
    return true;
  }
  function doUp(i) {                 // one step bigger: the rent goes up
    const si = G.turn, sp = BOARD[i], sums = [money(si, -sp.up, 'up')];
    G.lvl[i]++;
    G.upgraded = true;
    return { k: 'up', s: si, i: i, lvl: G.lvl[i], sums: sums };
  }

  function drawCard() {
    if (FIX_CARDS.length) return api.clamp(FIX_CARDS[fixCard++ % FIX_CARDS.length], 0, CARDS.length - 1);
    if (!G.deck.length) G.deck = api.shuffle(CARDS.map(function (c, i) { return i; }));
    return G.deck.pop();
  }
  function playCard(ci, depth) {
    const si = G.turn, s = G.seats[si], cd = CARDS[ci], sums = [];
    G.card = null;
    if (cd.k === 'gain') {
      sums.push(money(si, cd.n, 'card'));
      sendState({ k: 'cardfx', s: si, c: ci, sums: sums });
      endTurn(1800);
    } else if (cd.k === 'lose') {
      const r = charge(si, cd.n, -1, 'card', sums);
      sendState({ k: 'cardfx', s: si, c: ci, lost: r.lost, sums: sums });
      endTurn(r.lost >= 0 ? 3000 : 1800);
    } else if (cd.k === 'each') {      // presents between everybody: nobody loses a shop over a present
      const n = Math.abs(cd.n);
      let total = 0;
      G.seats.forEach(function (o, oi) {
        if (oi === si) return;
        if (cd.n > 0) { const a = Math.min(n, o.cash); if (a > 0) { sums.push(money(oi, -a, 'gift')); total += a; } }
        else { const a = Math.min(n, s.cash - total); if (a > 0) { sums.push(money(oi, a, 'gift+')); total += a; } }
      });
      if (total > 0) sums.unshift(money(si, cd.n > 0 ? total : -total, cd.n > 0 ? 'gift+' : 'gift'));
      sendState({ k: 'cardfx', s: si, c: ci, sums: sums });
      endTurn(2200);
    } else if (cd.k === 'move') {
      const from = s.pos, to = (from + cd.n + N) % N, steps = Math.abs(cd.n);
      if (cd.n > 0 && from + cd.n >= N) sums.push(money(si, SALARY, 'salary', ms(300) + (N - from) * HOP_MS));
      s.pos = to; G.step = 'move';
      sendState({ k: 'hop', s: si, c: ci, from: from, to: to, n: cd.n, sums: sums });
      wait(ms(300) + steps * HOP_MS + LAND_MS, function () { land(depth + 1); });
    } else {                           // goto a space, or off to the Nap corner
      const from = s.pos, to = cd.k === 'nap' ? NAP : cd.n;
      if (cd.k === 'goto' && to === 0 && from !== 0) sums.push(money(si, SALARY, 'salary', ms(1300)));
      s.pos = to; G.step = 'move';
      sendState({ k: 'fly', s: si, c: ci, from: from, to: to, sums: sums });
      wait(FLY_MS, function () { land(depth + 1); });
    }
  }

  // ---------- robots, and turns played for someone who is away or too slow ----------
  function bestUpgrade(si, keep) {
    let best = -1;
    shopsOf(si).forEach(function (i) {
      if (!canUp(si, i) || G.seats[si].cash - BOARD[i].up < keep) return;
      if (best < 0 || rentOf(i) > rentOf(best)) best = i;
    });
    return best;
  }
  function completes(si, i) {
    return GROUP_OF[BOARD[i].g].every(function (j) { return j === i || G.own[j] === si; });
  }
  function autoStep() {
    const si = G.turn, s = G.seats[si];
    if (G.step === 'roll') {
      if (s.robot && !G.upgraded && G.round >= 3 && Math.random() < 0.5) {   // a robot with plenty of coins sometimes makes a shop bigger first
        const i = bestUpgrade(si, 80);
        if (i >= 0) { sendState(doUp(i)); wait(ROBOT_MS, autoStep); return; }
      }
      doRoll(!s.robot);
    } else if (G.step === 'buy') {
      const sp = BOARD[G.offer];
      doBuy(s.cash - sp.price >= 15 || completes(si, G.offer));
    } else if (G.step === 'up') {
      const i = G.offer, yes = s.robot && s.cash - BOARD[i].up >= 40;
      G.offer = null;
      settle();
      sendState(yes ? doUp(i) : { k: 'pass', s: si, i: i, up: true });
      endTurn(yes ? 1500 : 700);
    } else if (G.step === 'pay') doPay(null);
  }

  // ---------- taking over a robot's seat ----------
  function applyTakes() {
    if (G.mode === 'big' && (G.step === 'auction' || G.step === 'trade')) return;   // everybody is busy with that robot: wait
    Object.keys(G.takes).forEach(function (k) {
      const i = +k, key = G.takes[k];
      if (i === G.turn && G.step !== 'end' && G.step !== 'sleep') return;   // that robot is in the middle of its turn: wait for the turn to end
      delete G.takes[k];
      const p = onlineByKey(key), s = G.seats[i];
      if (!p || p.room !== ID || !s || !s.robot || s.out || seatByKey(key) >= 0) return;
      s.robot = false; s.key = p.key; s.name = p.name; s.look = lookOf(p); s.away = false; s.turns = 0;
      api.toast(p.name + ' takes over from the robot!', api.inRoom(ID));
    });
  }

  // ---------- the end: ranking by total worth, stars, records ----------
  function finish() {
    stopWait();
    const rows = G.seats.map(function (s, i) {
      const shops = shopsValue(i);
      return { s: i, cash: s.cash, shops: shops, worth: s.cash + shops, place: 0, stars: 0, later: false, few: false };
    });
    rows.sort(function (a, b) { return b.worth - a.worth || b.cash - a.cash || a.s - b.s; });
    rows.forEach(function (r, k) {
      r.place = k + 1;
      const s = G.seats[r.s];
      if (s.robot) return;
      if (s.turns < MIN_TURNS) { r.few = true; return; }
      const prof = api.save.profiles[s.key];
      if (!prof) return;
      const d = record(prof);
      r.later = d.today >= FULL_GAMES;
      r.stars = r.later ? LATER_STARS : STARS[Math.min(r.place, STARS.length) - 1];
      d.today++; d.games++;
      if (r.place === 1) d.wins++;
      if (r.worth > d.best) { d.best = r.worth; r.best = true; }
      const p = onlineByKey(s.key);
      if (p) { api.questEvent(p, T('play')); api.addStars(p, r.stars); sendMe(p); }
      else d.owed += r.stars;          // paid out when they are back in town
    });
    api.saveSoon();
    G.phase = 'over'; G.step = 'over'; G.deadline = 0; G.offer = null; G.pay = null; G.card = null; G.takes = {};
    G.results = rows;
    sendState({ k: 'over' });
  }

  // ====================================================================================================
  // THE BIG GAME
  // 36 spaces round an 11 x 9 board, two dice, 22 shops in 8 colours with four building levels, 4 transport
  // lines, 2 businesses, auctions, trades, mortgages, two card decks, town events. A player who cannot pay
  // even after selling and mortgaging everything is out. Shares the table, the seats, the single step timer,
  // pause / resume and the seat take-over with the Quick game above.
  // ====================================================================================================
  function envInt(name, def) { const v = parseInt(process.env[name], 10); return v >= 0 ? v : def; }
  const BN = 36, B_SALARY = 200, B_BONUS = 100, B_TAX = 100, B_POT = 50, B_NAP_FEE = 50, B_MAXLVL = 4, B_TRADES = 2, B_EVERY = 3;
  const B_CASH = envInt('MONOPOLY_BCASH', 1500);                 // the variables are for tests only
  const B_NOTES = [1, 5, 10, 20, 50, 100, 500];
  const B_ROUNDS = seq(process.env.MONOPOLY_BROUNDS).length ? seq(process.env.MONOPOLY_BROUNDS) : [15, 20, 30];
  const B_RATE = [1.4, 1.0, 0.8, 0.6];                           // stars for every round played, by final place
  const B_FULL = 2, B_LATER = 3, B_MINSTARS = 3;                 // full rewards for 2 Big games a day, then 3 stars a game
  const B_MULT = [1, 4, 10, 20, 30];                             // rent = base rent x this, by building level
  const B_FARE = [30, 60, 120, 240];                             // a transport line's fare, by how many lines its owner has
  const B_BIZ = [5, 10];                                         // a business charges the dice x this (one owned, both owned)
  const B_BIDS = [10, 50, 100];
  const B_GROUPS = ['#FFD3A1', '#BDEBAE', '#B3DBFF', '#FFC0DB', '#D8C6FF', '#FFE584', '#A9E9DF', '#FFB9AC'];
  const B_BUILD = [50, 50, 100, 100, 150, 150, 200, 200];        // what one building level costs, by colour
  const FIX_BDICE = seq(process.env.MONOPOLY_BDICE), FIX_BCARDS = seq(process.env.MONOPOLY_BCARDS), FIX_BEVENTS = seq(process.env.MONOPOLY_BEVENTS);
  let fixB = 0, fixBC = 0, fixBE = 0;
  const B_TURN_MS = ms(45000), B_BUY_MS = ms(25000), B_PAY_MS = ms(30000), B_DEBT_MS = ms(45000), B_NAP_MS = ms(45000), B_EXT_MS = ms(15000);
  const TRADE_MS = ms(25000), AUC_MS = ms(10000), AUC_BID_MS = ms(6000), B_HOP_MS = ms(200), EVENT_MS = ms(4200);
  function sumN(list, notes) { return list.reduce(function (a, n, k) { return a + n * notes[k]; }, 0); }
  function lobbyRounds() { return B_ROUNDS.indexOf(lobby.rounds) >= 0 ? lobby.rounds : B_ROUNDS[Math.min(1, B_ROUNDS.length - 1)]; }

  // ---------- Big: the board, clockwise from Start (corners: 0 Start, 10 Nap corner, 18 Free park, 28 Town tax) ----------
  function bshop(g, price, icon, en, zh, py, ms_) {
    return { t: 'shop', g: g, price: price, rent: price / 10, build: B_BUILD[g], icon: icon, en: en, zh: zh, py: py, ms: ms_ };
  }
  function bline(icon, en, zh, py, ms_) { return { t: 'line', price: 200, icon: icon, en: en, zh: zh, py: py, ms: ms_ }; }
  function bbiz(icon, en, zh, py, ms_) { return { t: 'biz', price: 150, icon: icon, en: en, zh: zh, py: py, ms: ms_ }; }
  function bnews() { return spot('news', '📰', 'Town news', '小镇新闻', 'xiǎozhèn xīnwén', 'Berita bandar'); }
  const BB = [
    spot('start', '🚩', 'Start', '起点', 'qǐdiǎn', 'Mula'),
    bshop(0, 60, '🍦', 'Ice Cream Shop', '冰淇淋店', 'bīngqílín diàn', 'Kedai aiskrim'),
    lucky(),
    bshop(0, 70, '🍹', 'Juice Bar', '果汁店', 'guǒzhī diàn', 'Kedai jus'),
    bline('🚌', 'Bus Line', '巴士线', 'bāshì xiàn', 'Laluan bas'),
    bshop(1, 100, '🍎', 'Fruit Stall', '水果摊', 'shuǐguǒ tān', 'Gerai buah'),
    bnews(),
    bshop(1, 100, '🍞', 'Bakery', '面包店', 'miànbāo diàn', 'Kedai roti'),
    bshop(1, 120, '🍜', 'Noodle House', '面馆', 'miànguǎn', 'Kedai mi'),
    bbiz('🚕', 'Taxi Stand', '出租车站', 'chūzūchē zhàn', 'Hentian teksi'),
    spot('nap', '😴', 'Nap corner', '午睡角', 'wǔshuì jiǎo', 'Sudut tidur'),
    bshop(2, 140, '📚', 'Book Shop', '书店', 'shūdiàn', 'Kedai buku'),
    bshop(2, 140, '🎨', 'Art Shop', '画具店', 'huàjù diàn', 'Kedai seni'),
    bshop(2, 160, '🎸', 'Music Shop', '乐器店', 'yuèqì diàn', 'Kedai muzik'),
    bline('🚆', 'Train Line', '火车线', 'huǒchē xiàn', 'Laluan kereta api'),
    bshop(3, 180, '🧸', 'Toy Shop', '玩具店', 'wánjù diàn', 'Kedai mainan'),
    bshop(3, 180, '🐶', 'Pet Shop', '宠物店', 'chǒngwù diàn', 'Kedai haiwan'),
    bshop(3, 200, '🚲', 'Bike Shop', '自行车店', 'zìxíngchē diàn', 'Kedai basikal'),
    spot('park', '🌳', 'Free park', '公园', 'gōngyuán', 'Taman'),
    bshop(4, 220, '🌷', 'Flower Shop', '花店', 'huādiàn', 'Kedai bunga'),
    lucky(),
    bshop(4, 220, '🍬', 'Sweet Shop', '糖果店', 'tángguǒ diàn', 'Kedai gula-gula'),
    bshop(4, 240, '🍵', 'Tea House', '茶馆', 'cháguǎn', 'Kedai teh'),
    bline('⛴️', 'Ferry Line', '渡轮线', 'dùlún xiàn', 'Laluan feri'),
    bshop(5, 260, '🎬', 'Cinema', '电影院', 'diànyǐngyuàn', 'Pawagam'),
    bshop(5, 260, '🎮', 'Game Arcade', '游戏厅', 'yóuxìtīng', 'Arked permainan'),
    bnews(),
    bshop(5, 280, '🏊', 'Swimming Pool', '游泳池', 'yóuyǒngchí', 'Kolam renang'),
    spot('tax', '🏛️', 'Town tax', '交税', 'jiāo shuì', 'Cukai bandar'),
    bshop(6, 300, '🤖', 'Robot Shop', '机器人店', 'jīqìrén diàn', 'Kedai robot'),
    bshop(6, 300, '🚀', 'Rocket Shop', '火箭店', 'huǒjiàn diàn', 'Kedai roket'),
    bbiz('📦', 'Parcel Post', '快递站', 'kuàidì zhàn', 'Pos bungkusan'),
    bshop(6, 320, '🔭', 'Science Museum', '科学馆', 'kēxuéguǎn', 'Muzium sains'),
    bline('🚡', 'Cable Car', '缆车线', 'lǎnchē xiàn', 'Laluan kereta kabel'),
    bshop(7, 360, '🎡', 'Theme Park', '游乐园', 'yóulèyuán', 'Taman tema'),
    bshop(7, 400, '🏰', 'Castle Hotel', '城堡酒店', 'chéngbǎo jiǔdiàn', 'Hotel istana')
  ];
  const B_LINES = [], B_BIZS = [], B_GROUP_OF = {};
  let B_NAP = 0, B_PARK = 0;
  BB.forEach(function (sp, i) {
    if (sp.t === 'line') B_LINES.push(i);
    if (sp.t === 'biz') B_BIZS.push(i);
    if (sp.t === 'nap') B_NAP = i;
    if (sp.t === 'park') B_PARK = i;
    if (sp.t === 'shop') (B_GROUP_OF[sp.g] = B_GROUP_OF[sp.g] || []).push(i);
  });
  function bAt(en) { for (let i = 0; i < BN; i++) if (BB[i].en === en) return i; return 0; }

  // Two decks of cards. d: 0 Lucky, 1 Town news. k: gain n | lose n | each n (n > 0 everyone gives you n, n < 0 you give
  // everyone -n) | move n steps | goto space n | line (on to the next transport line) | nap | repair (n for every
  // building level you own) | keep (a card to keep: n = 0 wakes you from a nap, n = 1 skips one rent)
  function bcard(d, k, n, icon, en, zh, py, ms_) { return { d: d, k: k, n: n, icon: icon, en: en, zh: zh, py: py, ms: ms_ }; }
  const BCARDS = [
    bcard(0, 'gain', 100, '🏅', 'You won the kite contest', '风筝比赛得了第一', 'fēngzheng bǐsài dé le dì-yī', 'Menang pertandingan layang-layang'),
    bcard(0, 'gain', 50, '🎁', 'You found a present', '捡到一份礼物', 'jiǎn dào yí fèn lǐwù', 'Jumpa hadiah'),
    bcard(0, 'gain', 150, '🍋', 'Your lemonade stand was a big hit', '你的柠檬水摊大受欢迎', 'nǐ de níngméngshuǐ tān dà shòu huānyíng', 'Gerai air limau kamu laris'),
    bcard(0, 'gain', 20, '🦷', 'The tooth fairy came', '牙仙子来了', 'yá xiānzǐ lái le', 'Pari-pari gigi datang'),
    bcard(0, 'gain', 80, '🧹', 'You helped tidy the park', '帮忙打扫公园', 'bāngmáng dǎsǎo gōngyuán', 'Tolong bersihkan taman'),
    bcard(0, 'gain', 200, '💎', 'Treasure in the sandpit', '沙坑里挖到宝藏', 'shākēng lǐ wā dào bǎozàng', 'Harta karun di dalam kotak pasir'),
    bcard(0, 'lose', 50, '🔧', 'Your bike needs fixing', '修自行车', 'xiū zìxíngchē', 'Baiki basikal'),
    bcard(0, 'lose', 30, '🎈', 'Balloons for the party', '买气球开派对', 'mǎi qìqiú kāi pàiduì', 'Beli belon untuk parti'),
    bcard(0, 'each', 20, '🎉', 'Everyone gives you a gift', '大家送你礼物', 'dàjiā sòng nǐ lǐwù', 'Semua beri hadiah'),
    bcard(0, 'each', -20, '🍦', 'Ice cream for everyone', '请大家吃冰淇淋', 'qǐng dàjiā chī bīngqílín', 'Belanja aiskrim untuk semua'),
    bcard(0, 'goto', 0, '🚀', 'Zoom to Start', '飞到起点', 'fēi dào qǐdiǎn', 'Terbang ke Mula'),
    bcard(0, 'move', 3, '👟', 'Run 3 steps ahead', '往前跑三步', 'wǎng qián pǎo sān bù', 'Lari 3 langkah ke depan'),
    bcard(0, 'move', -3, '🐢', 'Walk 3 steps back', '往后走三步', 'wǎng hòu zǒu sān bù', 'Undur 3 langkah'),
    bcard(0, 'goto', B_PARK, '🌳', 'Picnic in the park', '去公园野餐', 'qù gōngyuán yěcān', 'Berkelah di taman'),
    bcard(0, 'nap', 0, '😴', 'So sleepy! Off to the Nap corner', '好困，去午睡', 'hǎo kùn, qù wǔshuì', 'Mengantuk, pergi tidur'),
    bcard(0, 'keep', 0, '⏰', 'Alarm clock: keep it to wake up from a nap', '闹钟：留着，午睡时叫醒你', 'nàozhōng: liúzhe, wǔshuì shí jiàoxǐng nǐ', 'Jam loceng: simpan untuk bangun tidur'),
    bcard(0, 'keep', 1, '🎟️', 'Free visit ticket: keep it to skip one rent', '免费参观券：留着，可以免一次租金', 'miǎnfèi cānguān quàn: liúzhe, kěyǐ miǎn yí cì zūjīn', 'Tiket lawatan percuma: simpan untuk langkau satu sewa'),
    bcard(0, 'line', 0, '🚏', 'Ride to the next transport line', '坐车到下一条交通线', 'zuò chē dào xià yì tiáo jiāotōng xiàn', 'Naik ke laluan pengangkutan seterusnya'),

    bcard(1, 'repair', 20, '⛈️', 'Storm! Fix your buildings: 20 for each floor', '暴风雨！修房子：每层 20', 'bàofēngyǔ! xiū fángzi: měi céng 20', 'Ribut! Baiki bangunan: 20 setiap tingkat'),
    bcard(1, 'gain', 100, '🗞️', 'The town paper writes about you', '小镇报纸报道了你', 'xiǎozhèn bàozhǐ bàodào le nǐ', 'Akhbar bandar menulis tentang kamu'),
    bcard(1, 'lose', 60, '🎨', 'New paint for your shop signs', '给招牌刷新漆', 'gěi zhāopai shuā xīn qī', 'Cat baharu untuk papan tanda'),
    bcard(1, 'lose', 40, '⚽', 'A football broke a window', '足球打破了窗户', 'zúqiú dǎpò le chuānghu', 'Bola memecahkan tingkap'),
    bcard(1, 'gain', 60, '🍪', 'You sold cookies at the school fair', '在学校游园会卖饼干', 'zài xuéxiào yóuyuánhuì mài bǐnggān', 'Jual biskut di pesta sekolah'),
    bcard(1, 'each', 30, '🎭', 'Your puppet show: everyone buys a ticket', '你的木偶戏：大家买票', 'nǐ de mù\'ǒuxì: dàjiā mǎi piào', 'Persembahan boneka kamu: semua beli tiket'),
    bcard(1, 'each', -30, '🍜', 'You treat everyone to noodles', '请大家吃面', 'qǐng dàjiā chī miàn', 'Belanja mi untuk semua'),
    bcard(1, 'goto', bAt('Castle Hotel'), '🏰', 'A night at the Castle Hotel', '去城堡酒店住一晚', 'qù chéngbǎo jiǔdiàn zhù yì wǎn', 'Bermalam di Hotel Istana'),
    bcard(1, 'goto', bAt('Cinema'), '🎬', 'Movie time! Go to the Cinema', '看电影时间！去电影院', 'kàn diànyǐng shíjiān! qù diànyǐngyuàn', 'Masa menonton! Pergi ke pawagam'),
    bcard(1, 'line', 0, '🚏', 'Hurry to the next transport line', '赶到下一条交通线', 'gǎn dào xià yì tiáo jiāotōng xiàn', 'Cepat ke laluan pengangkutan seterusnya'),
    bcard(1, 'move', -2, '🐌', 'Slow day: 2 steps back', '慢吞吞的一天：后退两步', 'màntūntūn de yì tiān: hòutuì liǎng bù', 'Hari perlahan: undur 2 langkah'),
    bcard(1, 'move', 5, '🚗', 'A friend gives you a lift: 5 steps ahead', '朋友载你一程：前进五步', 'péngyou zài nǐ yì chéng: qiánjìn wǔ bù', 'Kawan tumpangkan kamu: 5 langkah ke depan'),
    bcard(1, 'nap', 0, '📖', 'You read late into the night: off to the Nap corner', '看书看到很晚：去午睡角', 'kàn shū kàn dào hěn wǎn: qù wǔshuì jiǎo', 'Membaca sampai lewat malam: pergi ke sudut tidur'),
    bcard(1, 'keep', 0, '🐓', 'Rooster friend: keep it to wake up from a nap', '公鸡朋友：留着，午睡时叫醒你', 'gōngjī péngyou: liúzhe, wǔshuì shí jiàoxǐng nǐ', 'Kawan ayam jantan: simpan untuk bangun tidur'),
    bcard(1, 'keep', 1, '💳', 'Best customer card: keep it to skip one rent', '贵宾卡：留着，可以免一次租金', 'guìbīn kǎ: liúzhe, kěyǐ miǎn yí cì zūjīn', 'Kad pelanggan terbaik: simpan untuk langkau satu sewa'),
    bcard(1, 'gain', 120, '🌻', 'Your garden won first prize', '你的花园得了一等奖', 'nǐ de huāyuán dé le yī děng jiǎng', 'Taman kamu menang hadiah pertama'),
    bcard(1, 'lose', 80, '📚', 'You buy books for the town library', '给小镇图书馆买书', 'gěi xiǎozhèn túshūguǎn mǎi shū', 'Beli buku untuk perpustakaan bandar'),
    bcard(1, 'gain', 40, '🐕', 'You brought a lost puppy home', '把走丢的小狗送回家', 'bǎ zǒudiū de xiǎogǒu sòng huí jiā', 'Hantar anak anjing sesat pulang'),
    bcard(1, 'gain', 50, '🏛️', 'The Town Hall gives some tax back', '镇政府退税', 'zhèn zhèngfǔ tuì shuì', 'Dewan bandar pulangkan cukai')
  ];
  const B_DECK = [[], []];
  BCARDS.forEach(function (cd, i) { B_DECK[cd.d].push(i); });

  // Town events: every third round one of these changes the rules a little, for that round only.
  const B_EVENTS = [
    { k: 'fest', icon: '🎪', en: 'Street festival', zh: '街头庆典', py: 'jiētóu qìngdiǎn', ms: 'Pesta jalanan', fx: 'Rent ×2 on this colour' },
    { k: 'sale', icon: '🧱', en: 'Builders\' sale', zh: '建筑大减价', py: 'jiànzhù dà jiǎnjià', ms: 'Jualan murah binaan', fx: 'Building costs half' },
    { k: 'road', icon: '🚧', en: 'Roadworks', zh: '道路施工', py: 'dàolù shīgōng', ms: 'Kerja jalan', fx: 'This line is closed: no fare' },
    { k: 'payday', icon: '💰', en: 'Bonus day', zh: '奖金日', py: 'jiǎngjīn rì', ms: 'Hari bonus', fx: 'Start gives ' + (B_SALARY + B_BONUS) },
    { k: 'sun', icon: '☀️', en: 'Tax holiday', zh: '免税日', py: 'miǎnshuì rì', ms: 'Hari tanpa cukai', fx: 'No town tax' },
    { k: 'rain', icon: '🌧️', en: 'Rainy day', zh: '下雨天', py: 'xiàyǔ tiān', ms: 'Hari hujan', fx: 'Transport fares ×2' }
  ];

  function bHello() {
    return { board: BB, groups: B_GROUPS, cards: BCARDS, events: B_EVENTS, notes: B_NOTES,
      cfg: { cash: B_CASH, salary: B_SALARY, bonus: B_BONUS, tax: B_TAX, pot: B_POT, napFee: B_NAP_FEE, maxLvl: B_MAXLVL, mult: B_MULT, fares: B_FARE,
        biz: B_BIZ, bids: B_BIDS, trades: B_TRADES, every: B_EVERY, roundsOpts: B_ROUNDS, rates: B_RATE, minStars: B_MINSTARS, full: B_FULL, later: B_LATER,
        minTurns: MIN_TURNS, maxSeats: MAX_SEATS, nap: B_NAP, park: B_PARK, die: DIE_MS, hop: B_HOP_MS, fly: FLY_MS } };
  }

  // ---------- Big: who owns what, and what it costs ----------
  function bOwnable(i) { const sp = BB[i]; return !!sp && (sp.t === 'shop' || sp.t === 'line' || sp.t === 'biz'); }
  function bOwned(si) { const out = []; for (let i = 0; i < BN; i++) if (G.own[i] === si) out.push(i); return out; }
  function bWhole(si, g) { return B_GROUP_OF[g].every(function (i) { return G.own[i] === si; }); }
  function bGroupMin(g) { return Math.min.apply(null, B_GROUP_OF[g].map(function (i) { return G.lvl[i]; })); }
  function bGroupMax(g) { return Math.max.apply(null, B_GROUP_OF[g].map(function (i) { return G.lvl[i]; })); }
  function bGroupMort(g) { return B_GROUP_OF[g].some(function (i) { return !!G.mort[i]; }); }
  function bCount(si, list) { return list.filter(function (i) { return G.own[i] === si; }).length; }
  function bEvent(k) { return !!G.event && G.event.k === k; }
  function bSalary() { return B_SALARY + (bEvent('payday') ? B_BONUS : 0); }
  // What a visitor pays on space `i` right now (`dice` = what they rolled, for the two businesses).
  function bRent(i, dice) {
    const sp = BB[i], o = G.own[i];
    if (o < 0 || G.mort[i]) return 0;
    if (sp.t === 'shop') {
      const r = G.lvl[i] > 0 ? sp.rent * B_MULT[G.lvl[i]] : sp.rent * (bWhole(o, sp.g) ? 2 : 1);
      return r * (bEvent('fest') && G.event.g === sp.g ? 2 : 1);
    }
    if (sp.t === 'line') {
      if (bEvent('road') && G.event.i === i) return 0;
      return B_FARE[bCount(o, B_LINES) - 1] * (bEvent('rain') ? 2 : 1);
    }
    return (dice || 0) * B_BIZ[bCount(o, B_BIZS) - 1];
  }
  function bRentShown(i) { return BB[i].t === 'biz' ? (G.own[i] >= 0 && !G.mort[i] ? B_BIZ[bCount(G.own[i], B_BIZS) - 1] : 0) : bRent(i, 0); }
  function bBuildCost(i) { return bEvent('sale') ? BB[i].build / 2 : BB[i].build; }
  function bMortValue(i) { return BB[i].price / 2; }
  function bUnmortCost(i) { const v = bMortValue(i); return v + Math.ceil(v / 10); }       // a little more to get it back
  function bCanBuild(si, i) {      // one more level: only on a whole colour, and evenly (the lowest shop first)
    const sp = BB[i];
    return !!sp && sp.t === 'shop' && G.own[i] === si && bWhole(si, sp.g) && !bGroupMort(sp.g) && G.lvl[i] < B_MAXLVL &&
      G.lvl[i] === bGroupMin(sp.g) && G.seats[si].cash >= bBuildCost(i);
  }
  function bCanSell(si, i) {       // a level back to the bank for half: the highest shop of the colour first
    const sp = BB[i];
    return !!sp && sp.t === 'shop' && G.own[i] === si && G.lvl[i] > 0 && G.lvl[i] === bGroupMax(sp.g);
  }
  function bCanMort(si, i) {       // only when the colour has no buildings left
    return bOwnable(i) && G.own[i] === si && !G.mort[i] && (BB[i].t !== 'shop' || bGroupMax(BB[i].g) === 0);
  }
  function bCanUnmort(si, i) { return bOwnable(i) && G.own[i] === si && !!G.mort[i] && G.seats[si].cash >= bUnmortCost(i); }
  function bValue(i) { return (G.mort[i] ? BB[i].price / 2 : BB[i].price) + (G.lvl[i] || 0) * (BB[i].build || 0); }
  function bPropValue(si) { return bOwned(si).reduce(function (a, i) { return a + bValue(i); }, 0); }
  function bRaisable(si) {         // the coins a seat could still get from the bank
    return bOwned(si).reduce(function (a, i) { return a + (G.lvl[i] || 0) * (BB[i].build || 0) / 2 + (G.mort[i] ? 0 : bMortValue(i)); }, 0);
  }
  function bLevels(si) { return bOwned(si).reduce(function (a, i) { return a + (G.lvl[i] || 0); }, 0); }
  function bAlive() { return G.seats.filter(function (s) { return !s.out; }).length; }
  function bPeopleAlive() { return G.seats.filter(function (s) { return !s.out && !s.robot; }).length; }
  function bGameDone() { return bAlive() <= 1 || bPeopleAlive() === 0; }       // one left, or only robots left
  function bPerson(si) { const s = G.seats[si]; return s && !s.robot && !s.away ? onlineByKey(s.key) : null; }

  // The notes for an amount of coins: always some small ones to count with, the rest in big notes.
  function bWallet(cash) {
    const keep = [5, 2, 3, 3, 2, 3, 0], w = [0, 0, 0, 0, 0, 0, 0];
    let r = cash, k, n;
    for (k = 0; k < B_NOTES.length; k++) { n = Math.min(keep[k], Math.floor(r / B_NOTES[k])); w[k] = n; r -= n * B_NOTES[k]; }
    for (k = B_NOTES.length - 1; k >= 0; k--) { n = Math.floor(r / B_NOTES[k]); w[k] += n; r -= n * B_NOTES[k]; }
    return w;
  }
  function bAutoNotes(w, amount) {   // the exact amount when the notes allow it, otherwise as little too much as possible
    const L = B_NOTES.length, used = new Array(L).fill(0);
    let rest = amount, k;
    for (k = L - 1; k >= 0; k--) { const n = Math.min(w[k], Math.floor(rest / B_NOTES[k])); used[k] = n; rest -= n * B_NOTES[k]; }
    if (rest > 0) {
      for (k = 0; k < L; k++) if (w[k] > used[k] && B_NOTES[k] >= rest) { used[k]++; rest = 0; break; }
      for (k = 0; k < L && rest > 0; k++) while (rest > 0 && w[k] > used[k]) { used[k]++; rest -= B_NOTES[k]; }
      for (k = 0; k < L; k++) while (used[k] > 0 && sumN(used, B_NOTES) - B_NOTES[k] >= amount) used[k]--;
    }
    return used;
  }
  function bChange(n) {
    const out = new Array(B_NOTES.length).fill(0);
    for (let k = B_NOTES.length - 1; k >= 0; k--) { out[k] = Math.floor(n / B_NOTES[k]); n -= out[k] * B_NOTES[k]; }
    return out;
  }

  // ---------- Big: what the tablets get ----------
  function bStateMsg(ev) {
    const rent = [];
    for (let i = 0; i < BN; i++) rent.push(bOwnable(i) ? bRentShown(i) : 0);
    return {
      t: T('state'), phase: G.phase, mode: 'big', ev: ev || null,
      seats: G.seats.map(function (s, i) {
        return { key: s.robot ? null : s.key, name: s.name, robot: s.robot, away: !s.robot && s.away, look: s.look, tint: i,
          cash: s.cash, pos: s.pos, nap: s.nap, tries: s.tries, turns: s.turns, out: !!s.out, keep: s.keep,
          shops: bOwned(i).length, worth: s.cash + bPropValue(i) };
      }),
      own: G.own, lvl: G.lvl, mort: G.mort, rent: rent, turn: G.turn, round: Math.min(G.round, G.rounds), rounds: G.rounds, step: G.step, pot: G.pot,
      die: G.die, dice: G.dice, dbl: G.dbl, offer: G.offer, pay: G.pay, card: G.card, debt: G.debt, auc: G.auc, trade: G.trade, event: G.event,
      tradesLeft: G.tradesLeft, takes: G.takes,
      left: G.deadline && !G.pausedAt ? Math.max(0, G.deadline - Date.now()) : 0,
      results: G.results
    };
  }
  function bNewGame(seats) {
    seats.forEach(function (s) { s.out = false; s.outRound = 0; s.keep = [0, 0]; s.tries = 0; });
    G = { mode: 'big', phase: 'play', seats: seats, own: new Array(BN).fill(-1), lvl: new Array(BN).fill(0), mort: new Array(BN).fill(0),
      turn: 0, round: 1, rounds: lobbyRounds(), step: 'roll', pot: B_POT, die: 0, dice: [1, 1], dbl: 0, again: false,
      offer: null, pay: null, card: null, debt: null, auc: null, aucVal: null, trade: null, event: null, tradesLeft: B_TRADES, ext: 0, acts: 0,
      deadline: 0, pausedAt: 0, takes: {}, results: null, decks: [[], []], evDeck: [], outs: [], asked: {} };
    fixB = 0; fixBC = 0; fixBE = 0;
  }

  // ---------- Big: turn flow ----------
  const B_WAITING = { nap: 1, roll: 1, buy: 1, pay: 1, debt: 1 };      // steps that wait for the player whose turn it is
  // Sets the clock for the current step. A robot (or a robot standing in for someone away) acts after about a
  // second; a person gets their time, then the step is played for them. Auctions and trades have their own clocks.
  function bArm() {
    if (G.step === 'auction') { aucArm(); return; }
    if (G.step === 'trade') {
      const o = G.seats[G.trade.to];
      if (o.robot || o.away) { G.deadline = 0; wait(Math.round(ROBOT_MS * 1.6), bTradeAuto); }
      else { G.deadline = Date.now() + TRADE_MS; wait(TRADE_MS, bTradeAuto); }
      return;
    }
    const s = G.seats[G.turn];
    if (s.robot || s.away) { G.deadline = 0; wait(ROBOT_MS, bAuto); return; }
    const n = G.step === 'roll' ? B_TURN_MS : G.step === 'pay' ? B_PAY_MS : G.step === 'debt' ? B_DEBT_MS : G.step === 'nap' ? B_NAP_MS : B_BUY_MS;
    G.deadline = Date.now() + n;
    wait(n, bAuto);
  }
  // Somebody busy with their shops gets a little more time, but not for ever. Returns true when the clock moved.
  function bExtend() {
    const s = G.seats[G.turn];
    if (s.robot || s.away || !G.deadline || !B_WAITING[G.step] || G.ext >= 12) return false;
    if (G.deadline - Date.now() >= B_EXT_MS) return false;
    G.ext++;
    G.deadline = Date.now() + B_EXT_MS;
    wait(B_EXT_MS, bAuto);
    return true;
  }
  function bSeatChanged(si) {      // a person came back to seat `si`, or left it, in the middle of a game
    if (G.phase !== 'play') return;
    if (G.step === 'auction') { if (G.auc) aucArm(); return; }
    if (G.step === 'trade') { if (G.trade && G.trade.to === si) bArm(); return; }
    if (si === G.turn && B_WAITING[G.step]) bArm();
  }
  function bSettle() { G.step = 'end'; G.deadline = 0; }
  function bEnd(n) { bSettle(); wait(ms(n), bAfter); }
  // The turn's business is done: roll again after doubles, otherwise the next player.
  function bAfter() {
    const s = G.seats[G.turn];
    if (bGameDone()) { bFinish(); return; }
    if (G.again && !s.out && !s.nap) {
      G.again = false; G.offer = null; G.pay = null; G.card = null; G.debt = null; G.ext = 0; G.acts = 0;
      G.step = 'roll';
      bArm();
      sendState({ k: 'again', s: G.turn });
      return;
    }
    bNextTurn();
  }
  function bRecover() {            // a step failed: forget what was going on and move to the next player
    G.auc = null; G.aucVal = null; G.trade = null; G.pay = null; G.debt = null; G.offer = null; G.card = null; G.again = false;
    G.step = 'end'; G.deadline = 0;
    wait(ms(600), bNextTurn);
  }
  function bNextTurn() {
    applyTakes();
    if (bGameDone()) { bFinish(); return; }
    let fresh = false;
    for (let n = 0; n < G.seats.length; n++) {
      G.turn = (G.turn + 1) % G.seats.length;
      if (G.turn === 0) { G.round++; fresh = true; }
      if (!G.seats[G.turn].out) break;
    }
    if (G.round > G.rounds) { bFinish(); return; }
    if (fresh) {                   // a new round: the old town event is over, every third round brings a new one
      G.event = null;
      if (G.round % B_EVERY === 0) {
        G.event = bDrawEvent();
        G.step = 'event'; G.deadline = 0;
        G.offer = null; G.pay = null; G.card = null; G.debt = null;
        sendState({ k: 'event', e: G.event });
        wait(EVENT_MS, bStartTurn);
        return;
      }
    }
    bStartTurn();
  }
  function bDrawEvent() {
    let n;
    if (FIX_BEVENTS.length) n = api.clamp(FIX_BEVENTS[fixBE++ % FIX_BEVENTS.length], 0, B_EVENTS.length - 1);
    else {
      if (!G.evDeck.length) G.evDeck = api.shuffle(B_EVENTS.map(function (e, i) { return i; }));
      n = G.evDeck.pop();
    }
    const e = { k: B_EVENTS[n].k, n: n };
    if (e.k === 'fest') {          // a colour somebody owns a shop of, when there is one
      const owned = Object.keys(B_GROUP_OF).map(Number).filter(function (g) { return B_GROUP_OF[g].some(function (i) { return G.own[i] >= 0; }); });
      const pool = owned.length ? owned : Object.keys(B_GROUP_OF).map(Number);
      e.g = FIX_BEVENTS.length ? pool[0] : pool[Math.floor(Math.random() * pool.length)];
    }
    if (e.k === 'road') e.i = FIX_BEVENTS.length ? B_LINES[0] : B_LINES[Math.floor(Math.random() * B_LINES.length)];
    return e;
  }
  function bStartTurn() {
    const s = G.seats[G.turn];
    G.offer = null; G.pay = null; G.card = null; G.debt = null; G.auc = null; G.aucVal = null; G.trade = null;
    G.dbl = 0; G.again = false; G.tradesLeft = B_TRADES; G.ext = 0; G.acts = 0; G.deadline = 0;
    G.step = s.nap ? 'nap' : 'roll';
    bArm();
    sendState({ k: 'turn', s: G.turn, nap: !!s.nap });
  }
  function bDie() { return FIX_BDICE.length ? api.clamp(FIX_BDICE[fixB++ % FIX_BDICE.length], 1, 6) : 1 + Math.floor(Math.random() * 6); }

  function bRoll(auto) {
    const si = G.turn, s = G.seats[si], sums = [], a = bDie(), b = bDie(), sum = a + b, dbl = a === b, from = s.pos;
    const person = bPerson(si);
    if (!s.robot && !s.away) s.turns++;
    G.dice = [a, b]; G.die = sum; G.step = 'move'; G.deadline = 0;
    if (dbl) { G.dbl++; if (person) api.questEvent(person, T('doubles')); }
    if (dbl && G.dbl >= 3) {       // three doubles in a row: too fast! Off to the Nap corner, no more rolling
      s.pos = B_NAP; s.nap = true; s.tries = 0; G.again = false;
      sendState({ k: 'roll', s: si, dice: [a, b], from: from, to: B_NAP, dbl: true, three: true, auto: !!auto, sums: sums });
      wait(DIE_MS + FLY_MS, function () { bEnd(700); });
      return;
    }
    const to = (from + sum) % BN;
    s.pos = to; G.again = dbl;
    if (from + sum >= BN) sums.push(money(si, bSalary(), 'salary', DIE_MS + (BN - from) * B_HOP_MS));
    sendState({ k: 'roll', s: si, dice: [a, b], from: from, to: to, dbl: dbl, auto: !!auto, sums: sums });
    wait(DIE_MS + sum * B_HOP_MS + LAND_MS, function () { bLand(0); });
  }

  // Waking up from a nap: pay, use a kept card, or roll for doubles (the third try always wakes).
  function bWake(how) {
    const si = G.turn, s = G.seats[si], sums = [];
    if (how === 'pay' || how === 'card') {
      if (how === 'pay') {
        if (s.cash < B_NAP_FEE) return false;
        sums.push(money(si, -B_NAP_FEE, 'nap')); G.pot += B_NAP_FEE;
      } else {
        if (!(s.keep[0] > 0)) return false;
        s.keep[0]--;
      }
      s.nap = false; s.tries = 0; G.step = 'roll';
      bArm();
      sendState({ k: 'wake', s: si, how: how, sums: sums });
      return true;
    }
    const a = bDie(), b = bDie(), sum = a + b, from = s.pos;
    if (!s.robot && !s.away) s.turns++;
    G.dice = [a, b]; G.die = sum; G.step = 'move'; G.deadline = 0; G.again = false;
    if (a !== b && s.tries < 2) {  // still asleep
      s.tries++;
      sendState({ k: 'snore', s: si, dice: [a, b], tries: s.tries });
      wait(DIE_MS, function () { bEnd(1300); });
      return true;
    }
    const to = (from + sum) % BN;
    s.nap = false; s.tries = 0; s.pos = to;
    if (from + sum >= BN) sums.push(money(si, bSalary(), 'salary', DIE_MS + (BN - from) * B_HOP_MS));
    sendState({ k: 'roll', s: si, dice: [a, b], from: from, to: to, woke: a === b ? 'dbl' : 'late', sums: sums });
    wait(DIE_MS + sum * B_HOP_MS + LAND_MS, function () { bLand(0); });
    return true;
  }

  // The token has arrived. `depth` counts cards that moved it there, so cards cannot chain for ever.
  function bLand(depth) {
    const si = G.turn, s = G.seats[si], i = s.pos, sp = BB[i];
    if (bOwnable(i)) {
      const o = G.own[i];
      if (o < 0) {
        if (s.cash >= sp.price) { G.step = 'buy'; G.offer = i; bArm(); sendState({ k: 'offer', s: si, i: i }); }
        else { bSettle(); sendState({ k: 'poor', s: si, i: i }); wait(ms(1500), function () { bAuction(i); }); }
      } else if (o === si) { sendState({ k: 'home', s: si, i: i }); bEnd(900); }
      else if (G.mort[i]) { sendState({ k: 'free', s: si, i: i, why: 'mort' }); bEnd(1400); }
      else if (sp.t === 'line' && bEvent('road') && G.event.i === i) { sendState({ k: 'free', s: si, i: i, why: 'road' }); bEnd(1400); }
      else bDue(bRent(i, G.die), o, 'rent', i);
    } else if (sp.t === 'lucky' || sp.t === 'news') {
      if (depth >= 2) { sendState({ k: 'rest', s: si }); bEnd(600); return; }
      const c = bDraw(sp.t === 'lucky' ? 0 : 1);
      G.card = c; G.step = 'card';
      sendState({ k: 'card', s: si, c: c });
      wait(CARD_MS, function () { bPlayCard(c, depth); });
    } else if (sp.t === 'tax') {
      if (bEvent('sun')) { sendState({ k: 'free', s: si, i: i, why: 'sun' }); bEnd(1400); }
      else bDue(B_TAX, -1, 'tax', i);
    } else if (sp.t === 'nap') {     // whoever stops here falls asleep
      s.nap = true; s.tries = 0; G.again = false;
      sendState({ k: 'nap', s: si });
      bEnd(1700);
    } else if (sp.t === 'park') {
      const got = G.pot, sums = [];
      if (got > 0) { sums.push(money(si, got, 'park')); G.pot = 0; }
      sendState({ k: 'park', s: si, n: got, sums: sums });
      bEnd(got ? 2000 : 900);
    } else { sendState({ k: 'rest', s: si }); bEnd(700); }
  }

  // The player on turn owes `amount` to seat `to` (or to the park's piggy bank when to < 0).
  function bDue(amount, to, why, i) {
    const si = G.turn, s = G.seats[si];
    if (amount <= 0) { sendState({ k: 'free', s: si, i: i, why: 'zero' }); bEnd(900); return; }
    const skip = why === 'rent' && s.keep[1] > 0;
    if (s.cash >= amount) {
      G.step = 'pay'; G.debt = null;
      G.pay = { amount: amount, to: to, why: why, i: i, wallet: bWallet(s.cash), skip: skip };
      bArm();
      sendState({ k: 'due', s: si, to: to, why: why, i: i, amount: amount });
    } else if (s.cash + bRaisable(si) >= amount || skip) {     // must sell buildings or mortgage shops first
      G.step = 'debt'; G.pay = null;
      G.debt = { amount: amount, to: to, why: why, i: i, skip: skip, can: s.cash + bRaisable(si) >= amount };
      bArm();
      sendState({ k: 'debt', s: si, to: to, why: why, i: i, amount: amount });
    } else bBust(si, to, amount, why);
  }
  function bPay(notes) {             // notes = what the player handed over, or null for Auto pay
    const si = G.turn, pay = G.pay, sums = [];
    const used = notes || bAutoNotes(pay.wallet, pay.amount), paid = sumN(used, B_NOTES), change = paid - pay.amount;
    sums.push(money(si, -pay.amount, pay.why));
    if (pay.to >= 0) sums.push(money(pay.to, pay.amount, pay.why + '+')); else G.pot += pay.amount;
    G.pay = null;
    bSettle();
    sendState({ k: 'paid', s: si, to: pay.to, why: pay.why, i: pay.i, amount: pay.amount, paid: paid, change: change,
      used: used, back: bChange(change), auto: !notes, sums: sums });
    bEnd(notes ? 3000 : 2200);
  }
  function bSkip() {                 // the kept card: this rent is not paid
    const si = G.turn, s = G.seats[si], d = G.pay || G.debt;
    if (!d || !d.skip || !(s.keep[1] > 0)) return false;
    s.keep[1]--;
    G.pay = null; G.debt = null;
    bSettle();
    sendState({ k: 'skip', s: si, to: d.to, i: d.i, amount: d.amount });
    bEnd(2200);
    return true;
  }
  // After coins were raised in the "debt" step: enough now? Then the paying starts.
  function bDebtCheck() {
    const si = G.turn, s = G.seats[si], d = G.debt;
    if (!d || s.cash < d.amount) return false;
    G.debt = null; G.step = 'pay';
    G.pay = { amount: d.amount, to: d.to, why: d.why, i: d.i, wallet: bWallet(s.cash), skip: d.skip && s.keep[1] > 0 };
    bArm();
    return true;
  }
  // Out of the game: the bank takes the buildings back for half, the creditor gets the coins and the shops.
  function bBust(si, to, amount, why) {
    const s = G.seats[si], sums = [];
    let got = 0;
    bOwned(si).forEach(function (j) { if (G.lvl[j] > 0) { got += G.lvl[j] * BB[j].build / 2; G.lvl[j] = 0; } });
    if (got > 0) sums.push(money(si, got, 'sell'));
    const paid = s.cash, list = bOwned(si);
    if (paid > 0) {
      sums.push(money(si, -paid, why));
      if (to >= 0) sums.push(money(to, paid, why + '+')); else G.pot += paid;
    }
    list.forEach(function (j) { if (to >= 0) G.own[j] = to; else { G.own[j] = -1; G.mort[j] = 0; } });
    if (to >= 0) { G.seats[to].keep[0] += s.keep[0]; G.seats[to].keep[1] += s.keep[1]; }
    s.keep = [0, 0]; s.out = true; s.nap = false; s.outRound = G.round;
    G.outs.push(si);
    G.again = false; G.pay = null; G.debt = null; G.offer = null;
    bSettle();
    sendState({ k: 'bust', s: si, to: to, why: why, amount: amount, paid: paid, shops: list, sums: sums });
    bEnd(3800);
  }

  function bBuy(yes) {
    const si = G.turn, s = G.seats[si], i = G.offer, sp = BB[i];
    G.offer = null;
    bSettle();
    if (!yes || !bOwnable(i) || G.own[i] >= 0 || s.cash < sp.price) {     // not bought: everybody may bid for it
      sendState({ k: 'pass', s: si, i: i });
      wait(ms(900), function () { bAuction(i); });
      return false;
    }
    const sums = [money(si, -sp.price, 'buy')];
    G.own[i] = si;
    sendState({ k: 'buy', s: si, i: i, set: sp.t === 'shop' && bWhole(si, sp.g), sums: sums });
    bEnd(1700);
    return true;
  }
  // Building, selling a level back, mortgaging: each returns the event to send.
  function bBuild(i) {
    const si = G.own[i], sums = [money(si, -bBuildCost(i), 'build')];
    G.lvl[i]++;
    return { k: 'build', s: si, i: i, lvl: G.lvl[i], sums: sums };
  }
  function bSell(i) {
    const si = G.own[i], sums = [money(si, BB[i].build / 2, 'sell')];
    G.lvl[i]--;
    return { k: 'sell', s: si, i: i, lvl: G.lvl[i], sums: sums };
  }
  function bMort(i, on) {
    const si = G.own[i], sums = [on ? money(si, bMortValue(i), 'mort') : money(si, -bUnmortCost(i), 'unmort')];
    G.mort[i] = on ? 1 : 0;
    return { k: 'mort', s: si, i: i, on: !!on, sums: sums };
  }
  // "Auto": sells and mortgages for the player until the debt can be paid. Shops that earn least go first.
  function bAutoRaise() {
    const si = G.turn, s = G.seats[si], d = G.debt, before = s.cash, list = [];
    for (let guard = 0; guard < 200 && s.cash < d.amount; guard++) {
      let pick = -1, sell = false;
      bOwned(si).forEach(function (i) {            // 1. mortgage a shop that is not part of a whole colour
        if (bCanMort(si, i) && !(BB[i].t === 'shop' && bWhole(si, BB[i].g)) && (pick < 0 || BB[i].price < BB[pick].price)) pick = i;
      });
      if (pick < 0) {                              // 2. sell a building level, the cheapest colour first
        bOwned(si).forEach(function (i) { if (bCanSell(si, i) && (pick < 0 || BB[i].price < BB[pick].price)) pick = i; });
        sell = pick >= 0;
      }
      if (pick < 0) bOwned(si).forEach(function (i) { if (bCanMort(si, i) && (pick < 0 || BB[i].price < BB[pick].price)) pick = i; });   // 3. the rest
      if (pick < 0) break;
      if (sell) { s.cash += BB[pick].build / 2; G.lvl[pick]--; list.push({ k: 'sell', i: pick }); }
      else { s.cash += bMortValue(pick); G.mort[pick] = 1; list.push({ k: 'mort', i: pick }); }
    }
    return { k: 'raised', s: si, list: list, sums: s.cash !== before ? [{ s: si, a: before, d: s.cash - before, b: s.cash, why: 'raise', at: 0 }] : [] };
  }

  // ---------- Big: cards ----------
  function bDraw(d) {
    if (FIX_BCARDS.length) return api.clamp(FIX_BCARDS[fixBC++ % FIX_BCARDS.length], 0, BCARDS.length - 1);
    if (!G.decks[d].length) G.decks[d] = api.shuffle(B_DECK[d].slice());
    return G.decks[d].pop();
  }
  function bPlayCard(ci, depth) {
    const si = G.turn, s = G.seats[si], cd = BCARDS[ci], sums = [], from = s.pos;
    G.card = null;
    if (cd.k === 'gain') {
      sums.push(money(si, cd.n, 'card'));
      sendState({ k: 'cardfx', s: si, c: ci, sums: sums });
      bEnd(1800);
    } else if (cd.k === 'lose' || cd.k === 'repair') {
      const amount = cd.k === 'repair' ? cd.n * bLevels(si) : cd.n;
      if (amount > 0 && s.cash < amount) { bDue(amount, -1, 'card', s.pos); return; }
      if (amount > 0) { sums.push(money(si, -amount, 'card')); G.pot += amount; }
      sendState({ k: 'cardfx', s: si, c: ci, n: amount, sums: sums });
      bEnd(amount > 0 ? 2000 : 1500);
    } else if (cd.k === 'each') {      // presents between everybody: nobody goes out over a present
      const n = Math.abs(cd.n);
      let total = 0;
      G.seats.forEach(function (o, oi) {
        if (oi === si || o.out) return;
        if (cd.n > 0) { const a = Math.min(n, o.cash); if (a > 0) { sums.push(money(oi, -a, 'gift')); total += a; } }
        else { const a = Math.min(n, s.cash - total); if (a > 0) { sums.push(money(oi, a, 'gift+')); total += a; } }
      });
      if (total > 0) sums.unshift(money(si, cd.n > 0 ? total : -total, cd.n > 0 ? 'gift+' : 'gift'));
      sendState({ k: 'cardfx', s: si, c: ci, sums: sums });
      bEnd(2200);
    } else if (cd.k === 'keep') {
      s.keep[cd.n ? 1 : 0]++;
      sendState({ k: 'cardfx', s: si, c: ci, keep: cd.n ? 1 : 0, sums: sums });
      bEnd(2000);
    } else if (cd.k === 'move') {
      const to = (from + cd.n + BN) % BN, steps = Math.abs(cd.n);
      if (cd.n > 0 && from + cd.n >= BN) sums.push(money(si, bSalary(), 'salary', ms(300) + (BN - from) * B_HOP_MS));
      s.pos = to; G.step = 'move';
      sendState({ k: 'hop', s: si, c: ci, from: from, to: to, n: cd.n, sums: sums });
      wait(ms(300) + steps * B_HOP_MS + LAND_MS, function () { bLand(depth + 1); });
    } else if (cd.k === 'nap') {
      s.pos = B_NAP; s.nap = true; s.tries = 0; G.again = false; G.step = 'move';
      sendState({ k: 'fly', s: si, c: ci, from: from, to: B_NAP, nap: true, sums: sums });
      wait(FLY_MS, function () { bEnd(900); });
    } else {                           // goto a space, or on to the next transport line: passing Start pays
      let to = cd.n;
      if (cd.k === 'line') { to = B_LINES[0]; for (let n = 0; n < B_LINES.length; n++) if (B_LINES[n] > from) { to = B_LINES[n]; break; } }
      if (to < from || (to === 0 && from !== 0)) sums.push(money(si, bSalary(), 'salary', ms(1300)));
      s.pos = to; G.step = 'move';
      sendState({ k: 'fly', s: si, c: ci, from: from, to: to, sums: sums });
      wait(FLY_MS, function () { bLand(depth + 1); });
    }
  }

  // ---------- Big: auctions ----------
  // What a robot (or the robot standing in for someone away) would pay at most for space `i`.
  function bBidValue(j, i) {
    const s = G.seats[j], sp = BB[i];
    let f = 0.55 + Math.random() * 0.4;
    if (sp.t === 'shop') {
      const mates = B_GROUP_OF[sp.g].filter(function (q) { return q !== i; });
      if (mates.every(function (q) { return G.own[q] === j; })) f = 1.35;                                        // it completes the colour
      else if (mates.some(function (q) { return G.own[q] === j; })) f += 0.2;
      else if (G.own[mates[0]] >= 0 && mates.every(function (q) { return G.own[q] === G.own[mates[0]]; })) f = Math.max(f, 1);   // somebody else must not get it cheaply
    } else if (sp.t === 'line') f += 0.12 * bCount(j, B_LINES);
    else f += 0.2 * bCount(j, B_BIZS);
    if (!s.robot) f = Math.min(f, 0.7);            // careful with the coins of a person who is away
    return Math.max(0, Math.min(Math.floor(sp.price * f / 10) * 10, s.cash - 60));
  }
  function bAuction(i) {
    G.step = 'auction'; G.offer = null;
    G.auc = { i: i, bid: 0, by: -1, pass: [] };
    G.aucVal = {};
    G.deadline = Date.now() + AUC_MS;
    sendState({ k: 'auction', s: G.turn, i: i });
    aucArm();
  }
  // One timer serves the auction: the next robot bid when a robot still wants the shop, otherwise the countdown.
  function aucArm() {
    const a = G.auc, now = Date.now(), want = [];
    let open = false;
    G.seats.forEach(function (s, j) {
      if (s.out || j === a.by || s.cash < a.bid + B_BIDS[0]) return;
      if (s.robot || s.away) {
        if (G.aucVal[j] === undefined) G.aucVal[j] = bBidValue(j, a.i);
        if (G.aucVal[j] >= a.bid + B_BIDS[0]) want.push(j);
      } else if (a.pass.indexOf(j) < 0) open = true;
    });
    const left = Math.max(ms(100), G.deadline - now);
    if (want.length) {
      const j = want[Math.floor(Math.random() * want.length)];
      wait(Math.min(ms(800 + Math.random() * 1100), Math.max(ms(150), left - ms(400))), function () { bRobotBid(j); });
    } else wait(open ? left : Math.min(left, ms(1100)), aucClose);     // nobody is left to bid: the hammer falls early
  }
  function bRobotBid(j) {
    const a = G.auc, s = G.seats[j];
    if (!a) return;
    const top = Math.min(G.aucVal[j] || 0, s.cash), gap = top - a.bid;
    let add = gap >= 160 ? (Math.random() < 0.5 ? 100 : 50) : gap >= 60 ? (Math.random() < 0.6 ? 50 : 10) : 10;
    if (a.bid + add > top) add = 10;
    if (s.out || j === a.by || a.bid + add > top) { aucArm(); return; }
    bBid(j, add);
  }
  function bBid(j, add) {
    const a = G.auc, s = G.seats[j], n = a.bid + add;
    if (j === a.by || s.out || s.cash < n) return false;
    a.bid = n; a.by = j;
    G.deadline = Date.now() + AUC_BID_MS;
    sendState({ k: 'bid', s: j, n: n, i: a.i });
    aucArm();
    return true;
  }
  function aucClose() {
    const a = G.auc, i = a.i;
    G.auc = null; G.aucVal = null;
    bSettle();
    if (a.by >= 0) {
      const sums = [money(a.by, -a.bid, 'auction')];
      G.own[i] = a.by;
      const person = bPerson(a.by);
      if (person) api.questEvent(person, T('buy'));
      sendState({ k: 'sold', s: a.by, i: i, n: a.bid, set: BB[i].t === 'shop' && bWhole(a.by, BB[i].g), sums: sums });
      bEnd(2200);
    } else { sendState({ k: 'nosale', i: i }); bEnd(1300); }
  }

  // ---------- Big: trades ----------
  // One side of an offer, checked: the shops must be `si`'s and free of buildings, the coins and cards must be there.
  function bSide(x, si) {
    const s = G.seats[si], out = { shops: [], cash: 0, wake: 0, skip: 0 };
    if (!x || typeof x !== 'object') return null;
    if (x.shops !== undefined && !Array.isArray(x.shops)) return null;
    const list = x.shops || [];
    if (list.length > BN) return null;
    for (let n = 0; n < list.length; n++) {
      const i = parseInt(list[n], 10);
      if (!bOwnable(i) || G.own[i] !== si || out.shops.indexOf(i) >= 0) return null;
      if (BB[i].t === 'shop' && bGroupMax(BB[i].g) > 0) return null;
      out.shops.push(i);
    }
    out.cash = parseInt(x.cash, 10) || 0; out.wake = parseInt(x.wake, 10) || 0; out.skip = parseInt(x.skip, 10) || 0;
    if (out.cash < 0 || out.cash > s.cash || out.wake < 0 || out.wake > s.keep[0] || out.skip < 0 || out.skip > s.keep[1]) return null;
    return out;
  }
  function bSideEmpty(x) { return !x.shops.length && !x.cash && !x.wake && !x.skip; }
  // What a shop is worth to seat `j`, with the owners as in `own` (so a trade can be judged before it happens).
  function bWorthTo(j, i, own) {
    const sp = BB[i];
    let v = G.mort[i] ? sp.price * 0.55 : sp.price;
    if (sp.t === 'shop') {
      const mates = B_GROUP_OF[sp.g].filter(function (q) { return q !== i; });
      const mine = mates.filter(function (q) { return own[q] === j; }).length;
      v *= mine === mates.length ? 1.8 : mine > 0 ? 1.25 : 1;
    } else if (sp.t === 'line') v *= 1 + 0.15 * B_LINES.filter(function (q) { return q !== i && own[q] === j; }).length;
    else v *= B_BIZS.some(function (q) { return q !== i && own[q] === j; }) ? 1.4 : 1;
    return v;
  }
  // A robot judges an offer made to it: what it gets must be worth a little more than what it gives, and helping
  // the other player to a whole colour costs extra.
  function bJudge(t) {
    const me = t.to, s = G.seats[me], after = G.own.slice();
    t.give.shops.forEach(function (i) { after[i] = me; });
    t.get.shops.forEach(function (i) { after[i] = t.from; });
    let gain = t.give.cash + t.give.wake * 40 + t.give.skip * 80, loss = t.get.cash + t.get.wake * 40 + t.get.skip * 80;
    t.give.shops.forEach(function (i) { gain += bWorthTo(me, i, after); });
    t.get.shops.forEach(function (i) { loss += bWorthTo(me, i, G.own); });
    Object.keys(B_GROUP_OF).forEach(function (g) {
      const all = B_GROUP_OF[g];
      const now = all.every(function (i) { return G.own[i] === t.from; }), then = all.every(function (i) { return after[i] === t.from; });
      if (then && !now) loss += 0.5 * all.reduce(function (a, i) { return a + BB[i].price; }, 0);
    });
    if (t.get.cash > 0 && s.cash - t.get.cash < 100) return false;
    return gain >= loss * 1.05 && gain > 0;
  }
  function bTradeAuto() {            // the robot answers; for a person who is away or too slow the answer is no
    const t = G.trade;
    if (!t) return;
    bTradeDone(G.seats[t.to].robot ? bJudge(t) : false, false);
  }
  function bTradeDone(yes, cancelled) {
    const t = G.trade, sums = [], a = G.seats[t.from], b = G.seats[t.to];
    G.trade = null;
    yes = !!yes && !!bSide(t.give, t.from) && !!bSide(t.get, t.to) && !a.out && !b.out;
    if (yes) {
      t.give.shops.forEach(function (i) { G.own[i] = t.to; });
      t.get.shops.forEach(function (i) { G.own[i] = t.from; });
      if (t.give.cash > 0) { sums.push(money(t.from, -t.give.cash, 'trade')); sums.push(money(t.to, t.give.cash, 'trade+')); }
      if (t.get.cash > 0) { sums.push(money(t.to, -t.get.cash, 'trade')); sums.push(money(t.from, t.get.cash, 'trade+')); }
      a.keep[0] += t.get.wake - t.give.wake; a.keep[1] += t.get.skip - t.give.skip;
      b.keep[0] += t.give.wake - t.get.wake; b.keep[1] += t.give.skip - t.get.skip;
    }
    G.step = a.nap ? 'nap' : 'roll';
    bArm();
    sendState({ k: 'traded', s: t.from, to: t.to, yes: yes, cancelled: !!cancelled, give: t.give, get: t.get, sums: sums });
  }

  // ---------- Big: robots, and turns played for someone who is away or too slow ----------
  function bCompletes(si, i) {
    const sp = BB[i];
    return sp.t === 'shop' && B_GROUP_OF[sp.g].every(function (j) { return j === i || G.own[j] === si; });
  }
  // One useful thing a robot does with its shops before rolling: buy a mortgaged shop back, or build (evenly).
  function bRobotManage(si) {
    const s = G.seats[si];
    let best = -1;
    bOwned(si).forEach(function (i) { if (bCanUnmort(si, i) && s.cash - bUnmortCost(i) >= 400 && (best < 0 || BB[i].price > BB[best].price)) best = i; });
    if (best >= 0) return bMort(best, false);
    bOwned(si).forEach(function (i) {
      if (bCanBuild(si, i) && s.cash - bBuildCost(i) >= 200 && (best < 0 || BB[i].rent > BB[best].rent)) best = i;
    });
    return best >= 0 ? bBuild(best) : null;
  }
  // A robot that needs only one more shop for a whole colour offers its owner coins for it: a good price, and only
  // once for each shop. Returns the offer, or null.
  function bRobotOffer(si) {
    const s = G.seats[si];
    let pick = -1;
    Object.keys(B_GROUP_OF).forEach(function (g) {
      const all = B_GROUP_OF[g], rest = all.filter(function (i) { return G.own[i] !== si; });
      if (rest.length !== 1 || bGroupMax(+g) > 0) return;
      const i = rest[0], o = G.own[i];
      if (o < 0 || G.seats[o].out || G.asked[si + ':' + i]) return;
      if (pick < 0 || BB[i].price > BB[pick].price) pick = i;
    });
    if (pick < 0) return null;
    const total = B_GROUP_OF[BB[pick].g].reduce(function (a, i) { return a + BB[i].price; }, 0);
    const cash = Math.ceil((BB[pick].price + total / 2) * 1.1 / 10) * 10;
    if (s.cash - cash < 200) return null;
    G.asked[si + ':' + pick] = 1;
    return { from: si, to: G.own[pick], give: { shops: [], cash: cash, wake: 0, skip: 0 }, get: { shops: [pick], cash: 0, wake: 0, skip: 0 } };
  }
  function bAuto() {
    const si = G.turn, s = G.seats[si];
    if (G.step === 'nap') {
      if (s.robot && s.keep[0] > 0) bWake('card');
      else if (s.robot && s.cash >= 400 && G.round <= G.rounds - 2 && Math.random() < 0.6) bWake('pay');
      else bWake('roll');
    } else if (G.step === 'roll') {
      if (s.robot && G.tradesLeft === B_TRADES && G.round >= 2) {      // at most one offer in a turn
        const t = bRobotOffer(si);
        if (t) {
          G.tradesLeft--; G.step = 'trade'; G.trade = t;
          bArm();
          sendState({ k: 'trade', s: si, to: t.to });
          return;
        }
      }
      if (s.robot && G.acts < 3) {
        const ev = bRobotManage(si);
        if (ev) { G.acts++; sendState(ev); wait(ROBOT_MS, bAuto); return; }
      }
      bRoll(!s.robot);
    } else if (G.step === 'buy') {
      const sp = BB[G.offer];
      bBuy(s.cash - sp.price >= (s.robot ? 150 : 200) || bCompletes(si, G.offer));
    } else if (G.step === 'pay') {
      if (s.robot && G.pay.skip && G.pay.amount >= 100) bSkip(); else bPay(null);
    } else if (G.step === 'debt') {
      const enough = s.cash + bRaisable(si) >= G.debt.amount;
      if (G.debt.skip && (s.robot || !enough)) { bSkip(); return; }             // the kept card saves them
      if (!enough) { bBust(si, G.debt.to, G.debt.amount, G.debt.why); return; }
      const ev = bAutoRaise();
      bDebtCheck();
      sendState(ev);
    }
  }

  // ---------- Big: the end. Ranking by total worth (who went out earlier is further down), stars, records ----------
  function bFinish() {
    stopWait();
    const played = Math.max(1, Math.min(G.round, G.rounds));
    const rows = G.seats.map(function (s, i) {
      const shops = bPropValue(i);
      return { s: i, cash: s.cash, shops: shops, worth: s.cash + shops, place: 0, stars: 0, later: false, few: false, out: !!s.out };
    });
    rows.sort(function (a, b) {
      if (a.out !== b.out) return a.out ? 1 : -1;
      if (a.out) return G.outs.indexOf(b.s) - G.outs.indexOf(a.s);
      return b.worth - a.worth || b.cash - a.cash || a.s - b.s;
    });
    rows.forEach(function (r, k) {
      r.place = k + 1;
      const s = G.seats[r.s];
      if (s.robot) return;
      if (s.turns < MIN_TURNS) { r.few = true; return; }
      const prof = api.save.profiles[s.key];
      if (!prof) return;
      const d = record(prof), len = s.out ? Math.max(1, Math.min(s.outRound, played)) : played;
      r.later = d.bigToday >= B_FULL;
      r.stars = r.later ? B_LATER : Math.max(B_MINSTARS, Math.round(B_RATE[Math.min(r.place, B_RATE.length) - 1] * len));
      d.bigToday++; d.bigGames++;
      if (r.place === 1) d.bigWins++;
      if (r.worth > d.bigBest) { d.bigBest = r.worth; r.best = true; }
      const p = onlineByKey(s.key);
      if (p) { api.questEvent(p, T('play')); api.addStars(p, r.stars); sendMe(p); }
      else d.owed += r.stars;          // paid out when they are back in town
    });
    api.saveSoon();
    G.phase = 'over'; G.step = 'over'; G.deadline = 0; G.offer = null; G.pay = null; G.card = null; G.debt = null; G.auc = null; G.trade = null; G.takes = {};
    G.played = played;
    G.results = rows;
    sendState({ k: 'over' });
  }

  // ---------- Big: what a tablet may ask for ----------
  function bTurnOf(p) {              // true when `p` is the person whose turn it is in a running Big game
    return !!G && G.mode === 'big' && G.phase === 'play' && !G.pausedAt && p.room === ID && seatByKey(p.key) === G.turn;
  }
  api.on('wake', function (p, m) {
    if (!bTurnOf(p) || G.step !== 'nap') return;
    if (m.how === 'pay' || m.how === 'card' || m.how === 'roll') bWake(m.how);
  });
  api.on('build', function (p, m) {
    const i = parseInt(m.i, 10);
    if (!bTurnOf(p) || (G.step !== 'roll' && G.step !== 'nap') || !bCanBuild(G.turn, i)) return;
    const ev = bBuild(i);
    bExtend();
    sendState(ev);
  });
  api.on('sell', function (p, m) {
    const i = parseInt(m.i, 10);
    if (!bTurnOf(p) || (G.step !== 'roll' && G.step !== 'nap' && G.step !== 'debt') || !bCanSell(G.turn, i)) return;
    const ev = bSell(i);
    if (G.step !== 'debt' || !bDebtCheck()) bExtend();
    sendState(ev);
  });
  api.on('mort', function (p, m) {
    const i = parseInt(m.i, 10), on = !!m.on;
    if (!bTurnOf(p)) return;
    const free = G.step === 'roll' || G.step === 'nap';                        // before rolling: both ways; owing coins: only mortgaging
    if (on && !((free || G.step === 'debt') && bCanMort(G.turn, i))) return;
    if (!on && !(free && bCanUnmort(G.turn, i))) return;
    const ev = bMort(i, on);
    if (G.step !== 'debt' || !bDebtCheck()) bExtend();
    sendState(ev);
  });
  api.on('think', function (p) {     // the player is looking at their shops or putting a swap together: a little more time
    if (!bTurnOf(p) || (G.step !== 'roll' && G.step !== 'nap' && G.step !== 'debt')) return;
    if (bExtend()) sendState();
  });
  api.on('raise', function (p) {     // the "Auto" button of somebody who owes more than they hold
    if (!bTurnOf(p) || G.step !== 'debt' || !G.debt) return;
    if (G.seats[G.turn].cash + bRaisable(G.turn) < G.debt.amount) return;      // only their skip card can help
    const ev = bAutoRaise();
    bDebtCheck();
    sendState(ev);
  });
  api.on('skip', function (p) {
    if (!bTurnOf(p) || (G.step !== 'pay' && G.step !== 'debt')) return;
    bSkip();
  });
  api.on('bid', function (p, m) {
    if (!G || G.mode !== 'big' || G.phase !== 'play' || G.pausedAt || p.room !== ID || G.step !== 'auction' || !G.auc) return;
    const j = seatByKey(p.key), a = G.auc;
    if (j < 0 || G.seats[j].out || a.pass.indexOf(j) >= 0) return;
    if (m.pass) {
      if (a.by === j) return;
      a.pass.push(j);
      sendState({ k: 'nobid', s: j });
      aucArm();
      return;
    }
    const add = parseInt(m.add, 10);
    if (B_BIDS.indexOf(add) < 0) return;
    if (m.at !== undefined && parseInt(m.at, 10) !== a.bid) return;            // somebody else was faster: look again first
    bBid(j, add);
  });
  api.on('trade', function (p, m) {
    if (!bTurnOf(p) || (G.step !== 'roll' && G.step !== 'nap') || G.tradesLeft <= 0) return;
    const si = G.turn, to = parseInt(m.to, 10);
    if (!(to >= 0 && to < G.seats.length) || to === si || G.seats[to].out) return;
    const give = bSide(m.give, si), get = bSide(m.get, to);
    if (!give || !get || (bSideEmpty(give) && bSideEmpty(get)) || (give.cash > 0 && get.cash > 0)) return;
    G.tradesLeft--;
    G.step = 'trade';
    G.trade = { from: si, to: to, give: give, get: get };
    bArm();
    sendState({ k: 'trade', s: si, to: to });
  });
  api.on('answer', function (p, m) {
    if (!G || G.mode !== 'big' || G.phase !== 'play' || G.pausedAt || p.room !== ID || G.step !== 'trade' || !G.trade) return;
    const j = seatByKey(p.key);
    if (j === G.trade.to) bTradeDone(!!m.yes, false);
    else if (j === G.trade.from && !m.yes) bTradeDone(false, true);            // the one who asked takes the offer back
  });

  // ---------- the room ----------
  api.room({
    enter: function (p) {
      api.send(p, helloMsg());
      payOwed(p);
      sendMe(p);
      if (G && G.pausedAt) {
        if (Date.now() - G.pausedAt > ABANDON_MS) { stopWait(); G = null; }
        else resume();
      }
      if (G) {
        const si = seatByKey(p.key);
        if (si >= 0) {                 // back under the same name: the seat is theirs again
          const s = G.seats[si];
          s.away = false; s.name = p.name; s.look = lookOf(p);
          if (G.mode === 'big') bSeatChanged(si);
          else if (G.phase === 'play' && si === G.turn && WAITING[G.step]) armStep();
        }
      }
      sendState();
    },
    leave: function (p) {
      if (G) {
        const si = seatByKey(p.key);
        if (si >= 0) {                 // a robot plays the seat until they come back
          G.seats[si].away = true;
          if (G.mode === 'big') bSeatChanged(si);
          else if (G.phase === 'play' && si === G.turn && WAITING[G.step]) armStep();
        }
        Object.keys(G.takes).forEach(function (k) { if (G.takes[k] === p.key) delete G.takes[k]; });
        if (!inRoomList().length) {
          if (G.phase === 'over') { stopWait(); G = null; }
          else pause();
        }
      }
      if (!G && !inRoomList().length) { lobby.robots = null; lobby.mode = 'quick'; lobby.rounds = 0; }
      sendState();
    }
  });
  api.onJoin(function (p) { payOwed(p); });

  // true when `p` is the person whose turn it is and the game waits for `step`
  function mine(p, step) {
    return !!G && G.phase === 'play' && !G.pausedAt && p.room === ID && G.step === step && seatByKey(p.key) === G.turn;
  }

  api.on('robots', function (p, m) {
    if (G || p.room !== ID) return;
    const hs = lobbyHumans(), d = parseInt(m.d, 10);
    if ((d !== 1 && d !== -1) || !hs.some(function (o) { return o.id === p.id; })) return;
    lobby.robots = api.clamp(lobbyRobots(hs.length) + d, 0, MAX_SEATS - 1);
    sendState();
  });

  api.on('start', function (p) {
    if (G || p.room !== ID) return;
    const hs = lobbyHumans();
    if (!hs.some(function (o) { return o.id === p.id; })) return;
    const big = lobby.mode === 'big', cash = big ? B_CASH : START_CASH;
    const seats = hs.map(function (o) {
      return { key: o.key, name: o.name, look: lookOf(o), robot: false, away: false, cash: cash, pos: 0, nap: false, turns: 0 };
    });
    const nb = lobbyRobots(hs.length);
    for (let i = 0; i < nb; i++) {
      seats.push({ key: null, name: ROBOTS[i % ROBOTS.length], look: { color: TINTS[seats.length % TINTS.length], hat: 0, big: false, outfit: null },
        robot: true, away: false, cash: cash, pos: 0, nap: false, turns: 0 });
    }
    lobby.robots = null;
    fixDie = 0; fixCard = 0;
    if (big) {
      bNewGame(seats);
      api.toast(p.name + ' started a Big game of Monopoly. Come and watch, or take a robot\'s seat!', function (o) { return o.room !== ID; });
      sendState({ k: 'begin' });
      bStartTurn();
      return;
    }
    G = { mode: 'quick', phase: 'play', seats: seats, own: new Array(N).fill(-1), lvl: new Array(N).fill(0), turn: 0, round: 1, step: 'roll',
      pot: POT_START, die: 0, offer: null, pay: null, card: null, upgraded: false, deadline: 0, pausedAt: 0, takes: {}, results: null, deck: [] };
    api.toast(p.name + ' started a game of Monopoly. Come and watch, or take a robot\'s seat!', function (o) { return o.room !== ID; });
    sendState({ k: 'begin' });
    startTurn();
  });

  // The lobby: which of the two games, and how many rounds the Big game lasts.
  function inLobby(p) {
    return !G && p.room === ID && lobbyHumans().some(function (o) { return o.id === p.id; });
  }
  api.on('mode', function (p, m) {
    if (!inLobby(p) || (m.mode !== 'quick' && m.mode !== 'big')) return;
    lobby.mode = m.mode;
    sendState();
  });
  api.on('rounds', function (p, m) {
    const n = parseInt(m.n, 10);
    if (!inLobby(p) || B_ROUNDS.indexOf(n) < 0) return;
    lobby.rounds = n;
    sendState();
  });

  api.on('roll', function (p) {
    if (!mine(p, 'roll')) return;
    if (G.mode === 'big') bRoll(false); else doRoll(false);
  });

  api.on('buy', function (p, m) {
    if (!mine(p, 'buy')) return;
    if (G.mode === 'big') {
      if (bBuy(!!m.yes)) api.questEvent(p, T('buy'));
      return;
    }
    if (doBuy(!!m.yes)) {
      const prof = api.prof(p);
      if (prof) { record(prof).bought++; api.saveSoon(); }
      api.questEvent(p, T('buy'));
    }
  });

  // Upgrade: the shop just landed on (step "up"), or any own shop before rolling (step "roll"), once a turn.
  api.on('up', function (p, m) {
    if (!G || G.mode === 'big' || G.phase !== 'play' || G.pausedAt || p.room !== ID || seatByKey(p.key) !== G.turn) return;
    const i = parseInt(m.i, 10);
    if (G.step === 'up') {
      const at = G.offer, yes = !!m.yes && i === at && canUp(G.turn, at);
      G.offer = null;
      settle();
      sendState(yes ? doUp(at) : { k: 'pass', s: G.turn, i: at, up: true });
      endTurn(yes ? 1500 : 700);
    } else if (G.step === 'roll' && m.yes && i >= 0 && i < N && canUp(G.turn, i)) {
      sendState(doUp(i));              // the turn clock keeps running
    }
  });

  api.on('pay', function (p, m) {
    if (!mine(p, 'pay') || !G.pay) return;
    const big = G.mode === 'big', notes = big ? B_NOTES : NOTES;
    if (m.auto) { if (big) bPay(null); else doPay(null); return; }
    if (!Array.isArray(m.notes) || m.notes.length !== notes.length) return;
    const used = [];
    for (let k = 0; k < notes.length; k++) {
      const n = parseInt(m.notes[k], 10);
      if (!(n >= 0 && n <= G.pay.wallet[k])) return;
      used.push(n);
    }
    if (sumN(used, notes) < G.pay.amount) return;
    if (big) bPay(used); else doPay(used);
  });

  api.on('take', function (p, m) {
    if (!G || G.phase !== 'play' || p.room !== ID || seatByKey(p.key) >= 0) return;
    const i = parseInt(m.seat, 10);
    if (!(i >= 0 && i < G.seats.length) || !G.seats[i].robot || G.seats[i].out) return;
    if (G.takes[i] && G.takes[i] !== p.key) return;        // somebody else asked first
    Object.keys(G.takes).forEach(function (k) { if (G.takes[k] === p.key) delete G.takes[k]; });
    G.takes[i] = p.key;
    applyTakes();
    if (G.takes[i]) api.send(p, { t: 'toast', msg: 'The seat is yours as soon as this turn is over.' });
    sendState();
  });

  api.on('again', function (p) {
    if (!G || G.phase !== 'over' || p.room !== ID) return;
    stopWait();
    G = null;
    sendState({ k: 'lobby' });
  });

  // ---------- daily quests ----------
  api.addQuest({ type: T('play'), icon: '🎲', solo: true, tiers: [[1, 6]],
    en: 'Finish {n} game of Monopoly', zh: '玩完 {n} 局大富翁', py: 'wán wán {n} jú dàfùwēng', ms: 'Habiskan {n} permainan Monopoli' });
  api.addQuest({ type: T('buy'), icon: '🏪', solo: true, tiers: [[3, 4], [5, 6]],
    en: 'Buy {n} shops in Monopoly', zh: '在大富翁里买 {n} 家店', py: 'zài dàfùwēng lǐ mǎi {n} jiā diàn', ms: 'Beli {n} kedai dalam Monopoli' });
  api.addQuest({ type: T('doubles'), icon: '🎲', solo: true, tiers: [[2, 5], [3, 7]],
    en: 'Roll doubles {n} times in the Big Monopoly game', zh: '在大富翁大局里掷出 {n} 次对子', py: 'zài dàfùwēng dà jú lǐ zhì chū {n} cì duìzi', ms: 'Dapat dadu kembar {n} kali dalam Monopoli Besar' });
};
