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
  const lobby = { robots: null };    // null = automatic (fill up to 3 players)

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
      try { if (G && G.phase === 'play') { G.step = 'end'; G.deadline = 0; wait(ms(600), nextTurn); } } catch (e2) {}
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
    if (d.day !== api.today()) { d.day = api.today(); d.today = 0; }
    return d;
  }
  function sendMe(p) {
    const prof = api.prof(p);
    if (!prof) return;
    const d = record(prof);
    api.send(p, { t: T('me'), games: d.games, wins: d.wins, best: d.best, today: d.today, full: FULL_GAMES });
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
      cfg: { rounds: ROUNDS, cash: START_CASH, salary: SALARY, tax: TAX, die: DIE_MS, hop: HOP_MS, fly: FLY_MS, stars: STARS, minTurns: MIN_TURNS, maxSeats: MAX_SEATS } };
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
        robots: lobbyRobots(h), minRobots: Math.max(0, 2 - h), maxRobots: MAX_SEATS - h };
    }
    return {
      t: T('state'), phase: G.phase, ev: ev || null,
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
    Object.keys(G.takes).forEach(function (k) {
      const i = +k, key = G.takes[k];
      if (i === G.turn && G.step !== 'end' && G.step !== 'sleep') return;   // that robot is in the middle of its turn: wait for the turn to end
      delete G.takes[k];
      const p = onlineByKey(key), s = G.seats[i];
      if (!p || p.room !== ID || !s || !s.robot || seatByKey(key) >= 0) return;
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
          if (G.phase === 'play' && si === G.turn && WAITING[G.step]) armStep();
        }
      }
      sendState();
    },
    leave: function (p) {
      if (G) {
        const si = seatByKey(p.key);
        if (si >= 0) {                 // a robot plays the seat until they come back
          G.seats[si].away = true;
          if (G.phase === 'play' && si === G.turn && WAITING[G.step]) armStep();
        }
        Object.keys(G.takes).forEach(function (k) { if (G.takes[k] === p.key) delete G.takes[k]; });
        if (!inRoomList().length) {
          if (G.phase === 'over') { stopWait(); G = null; }
          else pause();
        }
      }
      if (!G && !inRoomList().length) lobby.robots = null;
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
    const seats = hs.map(function (o) {
      return { key: o.key, name: o.name, look: lookOf(o), robot: false, away: false, cash: START_CASH, pos: 0, nap: false, turns: 0 };
    });
    const nb = lobbyRobots(hs.length);
    for (let i = 0; i < nb; i++) {
      seats.push({ key: null, name: ROBOTS[i % ROBOTS.length], look: { color: TINTS[seats.length % TINTS.length], hat: 0, big: false, outfit: null },
        robot: true, away: false, cash: START_CASH, pos: 0, nap: false, turns: 0 });
    }
    G = { phase: 'play', seats: seats, own: new Array(N).fill(-1), lvl: new Array(N).fill(0), turn: 0, round: 1, step: 'roll',
      pot: POT_START, die: 0, offer: null, pay: null, card: null, upgraded: false, deadline: 0, pausedAt: 0, takes: {}, results: null, deck: [] };
    lobby.robots = null;
    fixDie = 0; fixCard = 0;
    api.toast(p.name + ' started a game of Monopoly. Come and watch, or take a robot\'s seat!', function (o) { return o.room !== ID; });
    sendState({ k: 'begin' });
    startTurn();
  });

  api.on('roll', function (p) {
    if (!mine(p, 'roll')) return;
    doRoll(false);
  });

  api.on('buy', function (p, m) {
    if (!mine(p, 'buy')) return;
    if (doBuy(!!m.yes)) {
      const prof = api.prof(p);
      if (prof) { record(prof).bought++; api.saveSoon(); }
      api.questEvent(p, T('buy'));
    }
  });

  // Upgrade: the shop just landed on (step "up"), or any own shop before rolling (step "roll"), once a turn.
  api.on('up', function (p, m) {
    if (!G || G.phase !== 'play' || G.pausedAt || p.room !== ID || seatByKey(p.key) !== G.turn) return;
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
    if (m.auto) { doPay(null); return; }
    if (!Array.isArray(m.notes) || m.notes.length !== NOTES.length) return;
    const used = [];
    for (let k = 0; k < NOTES.length; k++) {
      const n = parseInt(m.notes[k], 10);
      if (!(n >= 0 && n <= G.pay.wallet[k])) return;
      used.push(n);
    }
    if (sumNotes(used) < G.pay.amount) return;
    doPay(used);
  });

  api.on('take', function (p, m) {
    if (!G || G.phase !== 'play' || p.room !== ID || seatByKey(p.key) >= 0) return;
    const i = parseInt(m.seat, 10);
    if (!(i >= 0 && i < G.seats.length) || !G.seats[i].robot) return;
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
};
