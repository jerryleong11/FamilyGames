// Pet Home (server): eggs, hatching, caring for pets, the pet that follows its owner, the collection
// book and pet trading. Everything is saved in profile.pets:
//   list   = the pets: { id, sp, name, xp, hun, hap, cl, t, born, pa, gd }
//            hun / hap / cl (0-100) are the values at the moment `t`; what they are now is worked out from
//            the time gone by, so pets also get hungry while the server is off.  pa = last play, gd = last gift day
//   eggs   = eggs in the incubator: { id, k, have }   (k = egg kind, have = stars of warmth so far)
//   active = id of the pet that walks with its owner (0 = none)      seen = species ever owned (the book)
//   ls     = the owner's earned stars when the eggs were last warmed  tr / gf = today's trades and gifts
'use strict';
module.exports = function (api) {
  const ID = api.id;
  const HOUR = 3600000;
  const MAX_PETS = 12, MAX_EGGS = 3, MAX_TRADES = 3, MAX_GIFTS = 3;
  const PLAY_CD = 30000;                        // a pet can play again after this long
  const HUN_H = 3.5, HAP_H = 2.5, CL_H = 2;     // points lost per hour by the pet that is out with its owner
  const REST = 0.25;                            // pets resting at home nap, so they lose much less
  const STAGE_XP = [0, 40, 120];                // baby, young, grown
  const HUNGRY = 25;                            // below this a pet is sad and stops growing
  const ROOM = { w: 1200, h: 660, x0: 70, x1: 1130, y0: 332, y1: 636 };

  // rarity: 0 common, 1 rare, 2 epic, 3 legendary. The tablets hold the pictures and the three-language names.
  const SPECIES = [
    { id: 'puppy', r: 0, en: 'Puppy' }, { id: 'kitten', r: 0, en: 'Kitten' }, { id: 'bunny', r: 0, en: 'Bunny' },
    { id: 'chick', r: 0, en: 'Chick' }, { id: 'turtle', r: 0, en: 'Turtle' },
    { id: 'fox', r: 1, en: 'Fox' }, { id: 'panda', r: 1, en: 'Panda' }, { id: 'penguin', r: 1, en: 'Penguin' }, { id: 'owl', r: 1, en: 'Owl' },
    { id: 'lion', r: 2, en: 'Lion cub' }, { id: 'elephant', r: 2, en: 'Elephant' }, { id: 'dino', r: 2, en: 'Dino' },
    { id: 'unicorn', r: 3, en: 'Unicorn' }, { id: 'dragon', r: 3, en: 'Dragon' }
  ];
  const SP = {};
  SPECIES.forEach(function (s) { SP[s.id] = s; });
  // cost in stars, level needed, stars of warmth to hatch, chances in % for common / rare / epic / legendary
  const EGGS = [
    { cost: 20, lv: 1, need: 5, odds: [75, 20, 4, 1] },
    { cost: 60, lv: 4, need: 12, odds: [35, 45, 16, 4] },
    { cost: 150, lv: 8, need: 25, odds: [0, 45, 40, 15] }
  ];
  const FOODS = [
    { cost: 1, hun: 20, hap: 0, xp: 4 },
    { cost: 2, hun: 45, hap: 6, xp: 9 },
    { cost: 3, hun: 80, hap: 15, xp: 15 }
  ];
  const GIFT = [2, 3, 4, 6];                    // stars a grown pet gives once a day, by rarity
  const NAMES = ['Coco', 'Mochi', 'Lucky', 'Bubbles', 'Peanut', 'Cookie', 'Luna', 'Max', 'Bella', 'Milo',
    'Daisy', 'Teddy', 'Pepper', 'Sunny', 'Ginger', 'Oreo', 'Snowy', 'Tiger', 'Pudding', 'Nemo',
    'Rocky', 'Honey', 'Momo', 'Kiki', 'Toto', 'Bobo', 'Nala', 'Simba', 'Pixel', 'Star'];
  const CFG = { t: ID + '.cfg', eggs: EGGS, foods: FOODS, stage: STAGE_XP, cd: PLAY_CD, names: NAMES, gift: GIFT,
    max: { pets: MAX_PETS, eggs: MAX_EGGS, trades: MAX_TRADES, gifts: MAX_GIFTS }, hungry: HUNGRY };

  api.addQuest({ type: 'pets.feed', icon: '🍖', solo: true, tiers: [[2, 4], [3, 5]],
    en: 'Feed your pet {n} times', zh: '喂宠物 {n} 次', py: 'wèi chǒngwù {n} cì', ms: 'Beri haiwan makan {n} kali' });
  api.addQuest({ type: 'pets.hatch', icon: '🥚', solo: true, tiers: [[1, 6]],
    en: 'Hatch {n} egg', zh: '孵出 {n} 个蛋', py: 'fūchū {n} gè dàn', ms: 'Tetaskan {n} biji telur' });

  // ---------- saved data ----------
  function pct(v, def) { v = +v; return isFinite(v) ? Math.max(0, Math.min(100, v)) : def; }
  function int(v) { v = parseInt(v, 10); return isFinite(v) ? v : 0; }
  function stageOf(xp) { return xp >= STAGE_XP[2] ? 2 : xp >= STAGE_XP[1] ? 1 : 0; }
  function cleanPetName(s) { return Array.from(api.cleanName(s)).slice(0, 10).join('').trim(); }
  const checked = {}; // player key -> the saved data was looked over once since the server started
  function data(p) {
    const prof = api.prof(p);
    if (!prof) return null;
    let d = prof[ID];
    if (!d || typeof d !== 'object' || Array.isArray(d)) {
      // a first visit: one warm egg is waiting in the incubator, ready to hatch
      d = prof[ID] = { v: 1, list: [], eggs: [{ id: 1, k: 0, have: EGGS[0].need }], next: 2, active: 0, seen: [], ls: p.stars, hatched: 0 };
      api.saveSoon();
    }
    if (!checked[p.key]) { // a save edited by hand, or from an older version, must never break the game
      checked[p.key] = true;
      const t = Date.now();
      d.list = (Array.isArray(d.list) ? d.list : []).filter(function (x) { return x && typeof x === 'object' && int(x.id) > 0 && SP[x.sp]; }).slice(0, MAX_PETS);
      d.list.forEach(function (x) {
        x.id = int(x.id); x.xp = Math.max(0, Math.round(+x.xp || 0));
        x.hun = pct(x.hun, 60); x.hap = pct(x.hap, 60); x.cl = pct(x.cl, 80);
        x.t = x.t > 0 && x.t <= t ? +x.t : t;
        x.name = cleanPetName(x.name) || SP[x.sp].en;
      });
      d.eggs = (Array.isArray(d.eggs) ? d.eggs : []).filter(function (e) { return e && typeof e === 'object' && int(e.id) > 0 && EGGS[e.k]; }).slice(0, MAX_EGGS);
      d.eggs.forEach(function (e) { e.id = int(e.id); e.have = Math.max(0, Math.min(EGGS[e.k].need, +e.have || 0)); });
      d.seen = (Array.isArray(d.seen) ? d.seen : []).filter(function (s) { return SP[s]; });
      d.list.forEach(function (x) { if (d.seen.indexOf(x.sp) < 0) d.seen.push(x.sp); });
      let top = 0;
      d.list.concat(d.eggs).forEach(function (x) { if (x.id > top) top = x.id; });
      if (!(d.next > top)) d.next = top + 1;
      if (!d.list.some(function (x) { return x.id === d.active; })) d.active = d.list.length ? d.list[0].id : 0;
      if (typeof d.ls !== 'number' || !(d.ls <= p.stars)) d.ls = p.stars;
    }
    return d;
  }
  function petOf(d, id) { id = int(id); for (let i = 0; i < d.list.length; i++) if (d.list[i].id === id) return d.list[i]; return null; }
  // what a pet's numbers are right now
  function cur(pet, d, t) {
    const k = (pet.id === d.active ? 1 : REST) * Math.max(0, t - (pet.t || t)) / HOUR;
    return { hun: pct(pet.hun - HUN_H * k, 0), hap: pct(pet.hap - HAP_H * k, 0), cl: pct(pet.cl - CL_H * k, 0) };
  }
  // writes "now" into every pet. Always call this before a number or the active pet changes.
  function settle(d, t) {
    d.list.forEach(function (pet) { const s = cur(pet, d, t); pet.hun = s.hun; pet.hap = s.hap; pet.cl = s.cl; pet.t = t; });
  }
  function counter(d, key) { // { day, n } that starts again every day
    const day = api.today();
    if (!d[key] || d[key].day !== day) d[key] = { day: day, n: 0 };
    return d[key];
  }
  function left(d, key, max) { const c = d[key]; return c && c.day === api.today() ? Math.max(0, max - c.n) : max; }
  function giftOf(pet, d, s) { // stars waiting as a gift, or 0
    if (stageOf(pet.xp) < 2 || pet.gd === api.today() || left(d, 'gf', MAX_GIFTS) <= 0) return 0;
    return s.hun >= 50 && s.hap >= 50 && s.cl >= 40 ? GIFT[SP[pet.sp].r] : 0;
  }
  function sad(s) { return s.hun < HUNGRY || s.hap < 20; }
  function view(pet, d, t) {
    const s = cur(pet, d, t);
    return { id: pet.id, sp: pet.sp, name: pet.name, xp: pet.xp, st: stageOf(pet.xp), hun: Math.round(s.hun), hap: Math.round(s.hap), cl: Math.round(s.cl),
      cd: Math.max(0, PLAY_CD - (t - (pet.pa || 0))), gift: giftOf(pet, d, s) };
  }
  function sendMe(p, extra) {
    const d = data(p);
    if (!d) return;
    const t = Date.now();
    const m = { t: ID + '.me', pets: d.list.map(function (pet) { return view(pet, d, t); }),
      eggs: d.eggs.map(function (e) { return { id: e.id, k: e.k, have: e.have, need: EGGS[e.k].need }; }),
      active: d.active, seen: d.seen, trades: left(d, 'tr', MAX_TRADES), gifts: left(d, 'gf', MAX_GIFTS) };
    if (extra) Object.keys(extra).forEach(function (k) { m[k] = extra[k]; });
    api.send(p, m);
  }
  function no(p, a, why) { api.send(p, { t: ID + '.no', a: a, why: why }); }
  function inHome(p) { return p.room === ID; }
  function others(p) { return function (o) { return o.room === ID && o.id !== p.id; }; }
  function fx(p, a) { api.broadcast({ t: ID + '.fx', id: p.id, a: a }, others(p)); }

  // What everyone may see of a player: the pet that walks with them.
  const moodSent = {};
  api.ext(function (p) {
    const prof = api.prof(p), d = prof && prof[ID];
    if (!d || !d.active || !Array.isArray(d.list)) return undefined;
    const pet = petOf(d, d.active);
    if (!pet || !SP[pet.sp]) return undefined;
    const m = sad(cur(pet, d, Date.now())) ? 0 : 1;
    moodSent[p.key] = m;
    return { s: pet.sp, n: String(pet.name), g: stageOf(pet.xp || 0), m: m };
  });

  // ---------- eggs warm up while their owner earns stars anywhere in the game ----------
  let watchTimer = null, ticks = 0;
  function warm(p) {
    const d = data(p);
    if (!d) return;
    if (d.ls > p.stars) d.ls = p.stars;
    const gain = p.stars - d.ls;
    if (gain <= 0) return;
    d.ls = p.stars;
    let changed = false, ready = false;
    d.eggs.forEach(function (e) {
      const need = EGGS[e.k].need;
      if (e.have >= need) return;
      e.have = Math.min(need, e.have + gain); changed = true;
      if (e.have >= need) ready = true;
    });
    api.saveSoon();
    if (changed) sendMe(p);
    if (ready) api.send(p, { t: ID + '.ready' });
  }
  function watch() {
    if (!api.players.size) { clearInterval(watchTimer); watchTimer = null; return; }
    let moodChanged = false;
    ticks++;
    api.players.forEach(function (p) {
      warm(p);
      if (ticks % 30) return;
      // now and then: has the walking pet become hungry (or been cheered up) since everyone last saw it?
      const prof = api.prof(p), d = prof && prof[ID], pet = d && d.active ? petOf(d, d.active) : null;
      if (pet && (sad(cur(pet, d, Date.now())) ? 0 : 1) !== moodSent[p.key]) moodChanged = true;
    });
    if (moodChanged) api.sendPlayers();
  }
  api.onJoin(function (p) {
    const d = data(p);
    if (!watchTimer) watchTimer = setInterval(watch, 1000);
    if (d && d.active) api.sendPlayers(); // the first list went out before this module looked at the save
    setTimeout(function () { // an egg is waiting: say so once the welcome notice has been read
      const q = api.players.get(p.id), e = q && data(q);
      if (e && e.eggs.some(function (x) { return x.have >= EGGS[x.k].need; }) && e.list.length < MAX_PETS) api.send(q, { t: ID + '.ready' });
    }, 6000);
  });
  api.onQuit(function () { if (!api.players.size && watchTimer) { clearInterval(watchTimer); watchTimer = null; } });

  // ---------- the room: everyone inside sees everybody walk around ----------
  const pos = new Map(); // player id -> { x, y, f, m }
  let roomTimer = null, dirty = false, quiet = 0;
  function roomTick() {
    const list = api.roomList(ID);
    if (!list.length) { clearInterval(roomTimer); roomTimer = null; pos.clear(); return; }
    if (!dirty && ++quiet < 10) return;
    dirty = false; quiet = 0;
    api.broadcast({ t: ID + '.st', p: list.map(function (q) { const o = pos.get(q.id) || { x: 600, y: 600, f: 1, m: 0 }; return [q.id, o.x, o.y, o.f, o.m]; }) }, api.inRoom(ID));
  }
  api.room({
    enter: function (p) {
      const spot = { x: Math.round(600 + api.rnd(-90, 90)), y: Math.round(596 + api.rnd(-18, 18)), f: 1, m: 0 };
      pos.set(p.id, spot);
      dirty = true;
      if (!roomTimer) roomTimer = setInterval(roomTick, 100);
      api.send(p, CFG);
      sendMe(p, { you: { x: spot.x, y: spot.y } });
      api.send(p, { t: ID + '.trade', st: 'off' });
    },
    leave: function (p) {
      pos.delete(p.id);
      dirty = true;
      if (trades[p.key]) endTrade(trades[p.key], 'left');
    }
  });
  api.on('pos', function (p, m) {
    if (!inHome(p)) return;
    pos.set(p.id, { x: Math.round(api.clamp(+m.x || 0, ROOM.x0, ROOM.x1)), y: Math.round(api.clamp(+m.y || 0, ROOM.y0, ROOM.y1)), f: m.f < 0 ? -1 : 1, m: m.m ? 1 : 0 });
    dirty = true;
  });
  api.on('get', function (p) { if (inHome(p)) sendMe(p); });

  // ---------- eggs ----------
  api.on('buy', function (p, m) {
    const d = data(p), k = int(m.k), egg = EGGS[k];
    if (!d || !inHome(p)) return;
    if (!egg || String(m.k) !== String(k)) return no(p, 'buy', 'unknown');
    if (d.eggs.length >= MAX_EGGS) return no(p, 'buy', 'eggs');
    if (api.levelOf(p.stars) < egg.lv) return no(p, 'buy', 'level');
    const before = api.coins(p);
    if (!api.spend(p, egg.cost)) return no(p, 'buy', 'stars');
    const e = { id: d.next++, k: k, have: 0 };
    d.eggs.push(e);
    api.saveSoon();
    sendMe(p);
    api.send(p, { t: ID + '.did', a: 'buy', egg: e.id, k: k, sum: [before, egg.cost, before - egg.cost] });
    fx(p, 'buy');
  });
  // which pet is inside: first the rarity by the egg's chances, then a species of that rarity.
  // Species the player has never had are three times as likely, so the book fills up.
  function rollPet(k, d) {
    const odds = EGGS[k].odds;
    let x = Math.random() * 100, r = 0;
    while (r < 3 && x >= odds[r]) { x -= odds[r]; r++; }
    const pool = [];
    SPECIES.forEach(function (s) { if (s.r === r) { pool.push(s); if (d.seen.indexOf(s.id) < 0) pool.push(s, s); } });
    return pool[Math.floor(Math.random() * pool.length)];
  }
  api.on('hatch', function (p, m) {
    const d = data(p);
    if (!d || !inHome(p)) return;
    const i = d.eggs.findIndex(function (e) { return e.id === int(m.egg); });
    if (i < 0) return no(p, 'hatch', 'unknown');
    const egg = d.eggs[i];
    if (egg.have < EGGS[egg.k].need) return no(p, 'hatch', 'cold');
    if (d.list.length >= MAX_PETS) return no(p, 'hatch', 'full');
    const t = Date.now(), sp = rollPet(egg.k, d), isNew = d.seen.indexOf(sp.id) < 0;
    settle(d, t);
    const pet = { id: d.next++, sp: sp.id, name: NAMES[Math.floor(Math.random() * NAMES.length)], xp: 0, hun: 50, hap: 75, cl: 100, t: t, born: t };
    d.eggs.splice(i, 1);
    d.list.push(pet);
    if (isNew) d.seen.push(sp.id);
    d.hatched = (d.hatched || 0) + 1;
    const walks = !d.active;
    if (walks) d.active = pet.id;
    api.saveSoon();
    sendMe(p);
    api.send(p, { t: ID + '.hatched', pet: view(pet, d, t), isNew: isNew, k: egg.k, r: sp.r });
    api.questEvent(p, 'pets.hatch');
    if (sp.r === 3) api.toast(p.name + ' hatched a LEGENDARY ' + sp.en + '!', function (o) { return o.id !== p.id; });
    else api.toast(p.name + ' hatched ' + (/^[AEIOU]/.test(sp.en) ? 'an ' : 'a ') + sp.en + '!', others(p));
    fx(p, 'hatch');
    if (walks) api.sendPlayers();
  });

  // ---------- naming, choosing the pet that walks along, saying goodbye ----------
  api.on('name', function (p, m) {
    const d = data(p), pet = d && petOf(d, m.pet), name = cleanPetName(m.name);
    if (!pet || !inHome(p)) return;
    if (!name) return no(p, 'name', 'empty');
    pet.name = name;
    api.saveSoon();
    sendMe(p);
    api.send(p, { t: ID + '.did', a: 'name', pet: pet.id });
    if (pet.id === d.active) api.sendPlayers();
  });
  api.on('active', function (p, m) {
    const d = data(p), id = int(m.pet);
    if (!d || !inHome(p)) return;
    if (id && !petOf(d, id)) return no(p, 'active', 'unknown');
    if (id === d.active) return;
    settle(d, Date.now()); // the pet going home starts napping from now, the other one starts walking
    d.active = id;
    api.saveSoon();
    sendMe(p);
    api.send(p, { t: ID + '.did', a: 'active', pet: id });
    api.sendPlayers();
  });
  api.on('free', function (p, m) { // the pet moves to the farm: the only way to make room, asked twice on the tablet
    const d = data(p), pet = d && petOf(d, m.pet);
    if (!pet || !inHome(p)) return;
    if (pet.id === d.active || d.list.length < 2) return no(p, 'free', 'active');
    if (trades[p.key] && trades[p.key].offer[p.key] === pet.id) return no(p, 'free', 'trading');
    d.list.splice(d.list.indexOf(pet), 1);
    api.saveSoon();
    sendMe(p);
    api.send(p, { t: ID + '.did', a: 'free', pet: pet.id, name: pet.name });
  });

  // ---------- care ----------
  function grow(pet, xp) { // returns the new stage when the pet just grew up a stage, else 0
    const was = stageOf(pet.xp);
    pet.xp = Math.min(9999, pet.xp + xp);
    return stageOf(pet.xp) > was ? stageOf(pet.xp) : 0;
  }
  // after a care action: save, tell the owner, show the others in the room, and refresh the walking pet for everyone
  function cared(p, d, pet, a, o, wasSad) {
    const t = Date.now();
    api.saveSoon();
    sendMe(p);
    o.t = ID + '.did'; o.a = a; o.pet = pet.id;
    api.send(p, o);
    fx(p, a);
    if (pet.id === d.active && (o.up || wasSad !== sad(cur(pet, d, t)))) api.sendPlayers();
  }
  api.on('feed', function (p, m) {
    const d = data(p), pet = d && petOf(d, m.pet), food = FOODS[int(m.food)];
    if (!pet || !inHome(p)) return;
    if (!food || String(m.food) !== String(int(m.food))) return no(p, 'feed', 'unknown');
    settle(d, Date.now());
    if (pet.hun >= 95) return no(p, 'feed', 'fullup');
    const wasSad = sad(pet), before = api.coins(p);
    if (!api.spend(p, food.cost)) return no(p, 'feed', 'stars');
    pet.hun = pct(pet.hun + food.hun, 100); pet.hap = pct(pet.hap + food.hap, 100); pet.cl = pct(pet.cl - 3, 0);
    const up = grow(pet, food.xp);
    api.questEvent(p, 'pets.feed');
    cared(p, d, pet, 'feed', { food: int(m.food), xp: food.xp, up: up, sum: [before, food.cost, before - food.cost] }, wasSad);
  });
  api.on('play', function (p, m) {
    const d = data(p), pet = d && petOf(d, m.pet), t = Date.now();
    if (!pet || !inHome(p)) return;
    if (t - (pet.pa || 0) < PLAY_CD) return no(p, 'play', 'tired');
    settle(d, t);
    const wasSad = sad(pet), xp = pet.hun < HUNGRY ? 0 : 3; // a hungry pet still plays, but it does not grow
    pet.pa = t;
    pet.hap = pct(pet.hap + 12, 100); pet.hun = pct(pet.hun - 5, 0); pet.cl = pct(pet.cl - 6, 0);
    const up = grow(pet, xp);
    cared(p, d, pet, 'play', { toy: api.clamp(int(m.toy), 0, 2), xp: xp, up: up, hungry: xp ? 0 : 1 }, wasSad);
  });
  api.on('wash', function (p, m) {
    const d = data(p), pet = d && petOf(d, m.pet);
    if (!pet || !inHome(p)) return;
    settle(d, Date.now());
    const wasSad = sad(pet), dirtyPet = pet.cl < 60, xp = dirtyPet && pet.hun >= HUNGRY ? 4 : 0;
    pet.cl = 100;
    if (dirtyPet) pet.hap = pct(pet.hap + 8, 100);
    const up = grow(pet, xp);
    cared(p, d, pet, 'wash', { xp: xp, up: up }, wasSad);
  });
  api.on('gift', function (p, m) { // a well cared-for grown pet brings a few stars once a day
    const d = data(p), pet = d && petOf(d, m.pet), t = Date.now();
    if (!pet || !inHome(p)) return;
    const n = giftOf(pet, d, cur(pet, d, t));
    if (!n) return no(p, 'gift', 'none');
    pet.gd = api.today();
    counter(d, 'gf').n++;
    api.saveSoon();
    api.addStars(p, n);
    sendMe(p);
    api.send(p, { t: ID + '.did', a: 'gift', pet: pet.id, stars: n });
  });

  // ---------- trading: one pet for one pet, both players confirm, at most MAX_TRADES a day each ----------
  const trades = {}; // player key -> { a, b, st: 'ask' | 'pick', offer: { key: pet id }, ok: { key: true }, timer }
  function byKey(key) { let out = null; api.players.forEach(function (p) { if (p.key === key) out = p; }); return out; }
  function sendTrade(tr) {
    [tr.a, tr.b].forEach(function (key) {
      const p = byKey(key), o = byKey(key === tr.a ? tr.b : tr.a);
      if (!p || !o) return;
      const d = data(p), e = data(o), t = Date.now();
      const mine = petOf(d, tr.offer[p.key]), theirs = petOf(e, tr.offer[o.key]);
      api.send(p, { t: ID + '.trade', st: tr.st, asker: key === tr.a, who: o.id, name: o.name,
        mine: mine ? view(mine, d, t) : null, theirs: theirs ? view(theirs, e, t) : null, okMe: !!tr.ok[p.key], okThem: !!tr.ok[o.key] });
    });
  }
  function endTrade(tr, why) {
    clearTimeout(tr.timer);
    [tr.a, tr.b].forEach(function (key) {
      if (trades[key] !== tr) return;
      delete trades[key];
      const p = byKey(key);
      if (p) api.send(p, { t: ID + '.trade', st: 'off', why: why });
    });
  }
  function idle(tr, ms) { clearTimeout(tr.timer); tr.timer = setTimeout(function () { endTrade(tr, 'timeout'); }, ms); }
  api.on('tradeAsk', function (p, m) {
    const q = api.players.get(int(m.to)), d = data(p);
    if (!d || !inHome(p)) return;
    if (trades[p.key]) return no(p, 'trade', 'busyme');
    if (!q || q.id === p.id || !inHome(q)) return no(p, 'trade', 'gone');
    const e = data(q);
    if (!e || trades[q.key]) return no(p, 'trade', 'busy');
    if (!d.list.length) return no(p, 'trade', 'nopet');
    if (!e.list.length) return no(p, 'trade', 'theirnopet');
    if (left(d, 'tr', MAX_TRADES) <= 0) return no(p, 'trade', 'cap');
    if (left(e, 'tr', MAX_TRADES) <= 0) return no(p, 'trade', 'theircap');
    const tr = { a: p.key, b: q.key, st: 'ask', offer: {}, ok: {}, timer: null };
    trades[p.key] = trades[q.key] = tr;
    idle(tr, 30000);
    sendTrade(tr);
  });
  api.on('tradeAnswer', function (p, m) {
    const tr = trades[p.key];
    if (!tr || tr.st !== 'ask' || tr.b !== p.key) return;
    if (!m.ok) return endTrade(tr, 'no');
    tr.st = 'pick';
    idle(tr, 180000);
    sendTrade(tr);
  });
  api.on('tradeOffer', function (p, m) {
    const tr = trades[p.key], d = data(p);
    if (!tr || tr.st !== 'pick' || !d) return;
    const pet = petOf(d, m.pet);
    if (!pet) return;
    tr.offer[p.key] = pet.id;
    tr.ok = {}; // a changed offer must be looked at again by both
    idle(tr, 180000);
    sendTrade(tr);
  });
  api.on('tradeConfirm', function (p, m) {
    const tr = trades[p.key];
    if (!tr || tr.st !== 'pick') return;
    const other = tr.a === p.key ? tr.b : tr.a;
    if (!m.ok) { delete tr.ok[p.key]; sendTrade(tr); return; }
    // the tablet says which two pets it was showing; if an offer changed in the meantime this tap does not count
    if (!tr.offer[p.key] || !tr.offer[other] || int(m.mine) !== tr.offer[p.key] || int(m.theirs) !== tr.offer[other]) { sendTrade(tr); return; }
    tr.ok[p.key] = true;
    if (tr.ok[tr.a] && tr.ok[tr.b]) swap(tr); else sendTrade(tr);
  });
  api.on('tradeCancel', function (p) { if (trades[p.key]) endTrade(trades[p.key], 'cancel'); });
  function swap(tr) {
    const pa = byKey(tr.a), pb = byKey(tr.b);
    if (!pa || !pb || !inHome(pa) || !inHome(pb)) return endTrade(tr, 'left');
    const da = data(pa), db = data(pb);
    // ownership is checked now, at the moment of the swap
    const xa = da && petOf(da, tr.offer[tr.a]), xb = db && petOf(db, tr.offer[tr.b]);
    if (!xa || !xb) {
      if (!xa) delete tr.offer[tr.a];
      if (!xb) delete tr.offer[tr.b];
      tr.ok = {};
      sendTrade(tr);
      return;
    }
    if (left(da, 'tr', MAX_TRADES) <= 0 || left(db, 'tr', MAX_TRADES) <= 0) return endTrade(tr, 'cap');
    const t = Date.now();
    settle(da, t); settle(db, t);
    const actA = da.active === xa.id, actB = db.active === xb.id, nameA = xa.name, nameB = xb.name;
    da.list.splice(da.list.indexOf(xa), 1);
    db.list.splice(db.list.indexOf(xb), 1);
    xa.id = db.next++; xb.id = da.next++; // ids are per owner
    db.list.push(xa); da.list.push(xb);
    if (actA) da.active = xb.id;
    if (actB) db.active = xa.id;
    if (da.seen.indexOf(xb.sp) < 0) da.seen.push(xb.sp);
    if (db.seen.indexOf(xa.sp) < 0) db.seen.push(xa.sp);
    counter(da, 'tr').n++; counter(db, 'tr').n++;
    api.saveSoon();
    clearTimeout(tr.timer);
    delete trades[tr.a]; delete trades[tr.b];
    sendMe(pa); sendMe(pb);
    api.send(pa, { t: ID + '.traded', got: view(xb, da, t), gave: nameA, name: pb.name });
    api.send(pb, { t: ID + '.traded', got: view(xa, db, t), gave: nameB, name: pa.name });
    api.send(pa, { t: ID + '.trade', st: 'off', why: 'done' });
    api.send(pb, { t: ID + '.trade', st: 'off', why: 'done' });
    api.sendPlayers();
  }
};
