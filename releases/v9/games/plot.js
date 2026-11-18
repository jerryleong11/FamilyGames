// Home Street: every player owns a home with a garden, decorates it with things bought for stars, and visits the others.
// The server owns the catalogue, the prices, what each player owns, what stands where, and the hearts.
// Saved in profile.plot = { house, styles, inv, placed, next, hearts, mail, gave, best }.
'use strict';
module.exports = function (api) {
  const ID = api.id;
  const GW = 12, GH = 8;                 // the garden grid, in tiles
  const TW = 72, TH = 52;                // one tile in "garden pixels" (the tablets use the same numbers for walking)
  const HOUSE = { x: 4, y: 0, w: 4, h: 2 };   // the house always stands here
  const SPAWN = { x: 5.5 * TW, y: GH * TH - 22 };   // just inside the gate
  const MAX_PLACED = 60, MAX_STOCK = 48, HEART_STARS = 2, MAX_HOMES = 16;
  const HEX = /^#[0-9a-fA-F]{6}$/;
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  // ---------- catalogue ----------
  // cat: furn | plant | fun | deco | ground      cost: stars      lv: player level needed      rare: 0 common .. 3 legendary
  // w, h: footprint in tiles      pack: pieces you get for one purchase      walk: avatars can walk over it
  const ITEMS = {}, ORDER = [];
  function add(id, cat, cost, lv, rare, w, h, en, zh, py, ms, extra) {
    const it = { cat: cat, cost: cost, lv: lv, rare: rare, w: w, h: h, en: en, zh: zh, py: py, ms: ms, pack: 1, walk: cat === 'ground' };
    if (extra) Object.keys(extra).forEach(function (k) { it[k] = extra[k]; });
    it.val = Math.max(1, Math.round(cost / it.pack));   // what one placed piece adds to the home score
    ITEMS[id] = it; ORDER.push(id);
  }
  // outdoor furniture
  add('chair', 'furn', 8, 1, 0, 1, 1, 'Garden chair', '花园椅', 'huāyuán yǐ', 'kerusi taman');
  add('bench', 'furn', 15, 1, 0, 2, 1, 'Bench', '长椅', 'chángyǐ', 'bangku');
  add('parasol', 'furn', 20, 2, 0, 1, 1, 'Parasol', '遮阳伞', 'zhēyángsǎn', 'payung taman');
  add('table', 'furn', 25, 2, 0, 2, 1, 'Picnic table', '野餐桌', 'yěcān zhuō', 'meja berkelah');
  add('sandpit', 'furn', 30, 2, 0, 2, 2, 'Sandpit', '沙坑', 'shākēng', 'kotak pasir', { walk: true });
  add('doghouse', 'furn', 30, 3, 0, 1, 1, 'Dog house', '狗屋', 'gǒuwū', 'rumah anjing');
  add('bbq', 'furn', 35, 3, 0, 1, 1, 'Barbecue', '烧烤炉', 'shāokǎo lú', 'pemanggang');
  add('hammock', 'furn', 40, 4, 1, 2, 1, 'Hammock', '吊床', 'diàochuáng', 'buaian kain');
  add('swing', 'furn', 45, 3, 1, 2, 1, 'Swing', '秋千', 'qiūqiān', 'buaian');
  add('tent', 'furn', 55, 5, 1, 2, 2, 'Tent', '帐篷', 'zhàngpeng', 'khemah');
  // plants
  add('hedge', 'plant', 8, 1, 0, 1, 1, 'Hedge', '树篱', 'shùlí', 'pagar pokok');
  add('bush', 'plant', 10, 1, 0, 1, 1, 'Bush', '灌木', 'guànmù', 'pokok renek');
  add('flr', 'plant', 12, 1, 0, 1, 1, 'Red flower bed', '红花坛', 'hóng huātán', 'batas bunga merah');
  add('fly', 'plant', 12, 1, 0, 1, 1, 'Yellow flower bed', '黄花坛', 'huáng huātán', 'batas bunga kuning');
  add('flp', 'plant', 12, 2, 0, 1, 1, 'Purple flower bed', '紫花坛', 'zǐ huātán', 'batas bunga ungu');
  add('pumpkin', 'plant', 15, 2, 0, 1, 1, 'Pumpkins', '南瓜', 'nánguā', 'labu');
  add('sunflower', 'plant', 18, 2, 0, 1, 1, 'Sunflowers', '向日葵', 'xiàngrìkuí', 'bunga matahari');
  add('tree', 'plant', 20, 1, 0, 1, 1, 'Tree', '树', 'shù', 'pokok');
  add('veg', 'plant', 22, 3, 0, 1, 1, 'Vegetable patch', '菜地', 'càidì', 'kebun sayur');
  add('pine', 'plant', 25, 2, 0, 1, 1, 'Pine tree', '松树', 'sōngshù', 'pokok pain');
  add('apple', 'plant', 35, 3, 1, 1, 1, 'Apple tree', '苹果树', 'píngguǒ shù', 'pokok epal');
  add('palm', 'plant', 45, 4, 1, 1, 1, 'Coconut tree', '椰子树', 'yēzi shù', 'pokok kelapa');
  add('blossom', 'plant', 60, 5, 2, 1, 1, 'Cherry blossom', '樱花树', 'yīnghuā shù', 'pokok sakura');
  // fun things
  add('ball', 'fun', 10, 1, 0, 1, 1, 'Beach ball', '沙滩球', 'shātān qiú', 'bola pantai');
  add('goal', 'fun', 30, 2, 0, 2, 1, 'Football goal', '足球门', 'zúqiú mén', 'tiang gol');
  add('seesaw', 'fun', 35, 2, 0, 2, 1, 'Seesaw', '跷跷板', 'qiāoqiāobǎn', 'jongkang-jongket');
  add('pool', 'fun', 40, 3, 1, 2, 2, 'Paddling pool', '戏水池', 'xìshuǐ chí', 'kolam kecil', { walk: true });
  add('slide', 'fun', 50, 3, 1, 2, 1, 'Slide', '滑梯', 'huátī', 'papan gelongsor');
  add('trampoline', 'fun', 60, 4, 1, 2, 2, 'Trampoline', '蹦床', 'bèngchuáng', 'trampolin', { walk: true });
  add('pond', 'fun', 70, 5, 2, 2, 2, 'Duck pond', '鸭子池塘', 'yāzi chítáng', 'kolam itik');
  add('fountain', 'fun', 90, 6, 2, 2, 2, 'Fountain', '喷泉', 'pēnquán', 'air pancut');
  add('treehouse', 'fun', 100, 7, 2, 2, 2, 'Tree house', '树屋', 'shùwū', 'rumah pokok');
  add('carousel', 'fun', 120, 8, 3, 2, 2, 'Merry-go-round', '旋转木马', 'xuánzhuǎn mùmǎ', 'kuda pusing');
  // decorations
  add('fence', 'deco', 6, 1, 0, 1, 1, 'Picket fence', '木栅栏', 'mù zhàlan', 'pagar kayu');
  add('flag', 'deco', 12, 1, 0, 1, 1, 'Flag', '旗子', 'qízi', 'bendera');
  add('lamp', 'deco', 15, 1, 0, 1, 1, 'Garden lamp', '花园灯', 'huāyuán dēng', 'lampu taman');
  add('balloons', 'deco', 15, 1, 0, 1, 1, 'Balloons', '气球', 'qìqiú', 'belon');
  add('flamingo', 'deco', 18, 2, 0, 1, 1, 'Flamingo', '火烈鸟', 'huǒlièniǎo', 'burung flamingo');
  add('gnome', 'deco', 20, 2, 0, 1, 1, 'Garden gnome', '花园小矮人', 'huāyuán xiǎo\'ǎirén', 'orang kerdil taman');
  add('lantern', 'deco', 25, 3, 1, 1, 1, 'Lanterns', '灯笼', 'dēnglong', 'tanglung');
  add('birdbath', 'deco', 28, 3, 0, 1, 1, 'Bird bath', '小鸟水盆', 'xiǎoniǎo shuǐpén', 'tempat mandi burung');
  add('snowman', 'deco', 30, 3, 0, 1, 1, 'Snowman', '雪人', 'xuěrén', 'orang salji');
  add('arch', 'deco', 50, 4, 1, 2, 1, 'Flower arch', '花拱门', 'huā gǒngmén', 'gerbang bunga', { walk: true });
  add('windmill', 'deco', 55, 5, 1, 1, 1, 'Windmill', '风车', 'fēngchē', 'kincir angin');
  add('well', 'deco', 65, 5, 2, 1, 1, 'Wishing well', '许愿井', 'xǔyuàn jǐng', 'perigi hajat');
  add('rocket', 'deco', 75, 6, 2, 1, 1, 'Rocket', '火箭', 'huǒjiàn', 'roket');
  add('statue', 'deco', 80, 6, 2, 1, 1, 'Star statue', '星星雕像', 'xīngxing diāoxiàng', 'patung bintang');
  add('dino', 'deco', 95, 7, 2, 1, 1, 'Dinosaur', '恐龙', 'kǒnglóng', 'dinosaur');
  add('rainbow', 'deco', 110, 8, 3, 2, 1, 'Rainbow arch', '彩虹拱门', 'cǎihóng gǒngmén', 'gerbang pelangi', { walk: true });
  // ground tiles: sold four at a time
  add('path', 'ground', 5, 1, 0, 1, 1, 'Stone path', '石头小路', 'shítou xiǎolù', 'laluan batu', { pack: 4 });
  add('sand', 'ground', 5, 1, 0, 1, 1, 'Sand', '沙地', 'shādì', 'pasir', { pack: 4 });
  add('patio', 'ground', 6, 1, 0, 1, 1, 'Patio', '露台地砖', 'lùtái dìzhuān', 'jubin patio', { pack: 4 });
  add('wood', 'ground', 8, 2, 0, 1, 1, 'Wooden deck', '木地板', 'mù dìbǎn', 'lantai kayu', { pack: 4 });
  add('meadow', 'ground', 8, 2, 0, 1, 1, 'Flower meadow', '花草地', 'huā cǎodì', 'padang bunga', { pack: 4 });
  add('check', 'ground', 10, 4, 1, 1, 1, 'Checkered tiles', '格子地砖', 'gézi dìzhuān', 'jubin petak', { pack: 4 });
  add('rainbowpath', 'ground', 15, 6, 2, 1, 1, 'Rainbow path', '彩虹小路', 'cǎihóng xiǎolù', 'laluan pelangi', { pack: 4 });

  // house styles: the first two are free, the others are bought once (id "house.<n>")
  const STYLES = [
    { cost: 0, lv: 1, rare: 0, en: 'Cottage', zh: '小屋', py: 'xiǎowū', ms: 'rumah kotej' },
    { cost: 0, lv: 1, rare: 0, en: 'Log cabin', zh: '小木屋', py: 'xiǎo mùwū', ms: 'rumah kayu' },
    { cost: 50, lv: 3, rare: 1, en: 'Mushroom house', zh: '蘑菇屋', py: 'mógu wū', ms: 'rumah cendawan' },
    { cost: 70, lv: 4, rare: 1, en: 'Modern villa', zh: '别墅', py: 'biéshù', ms: 'vila moden' },
    { cost: 100, lv: 6, rare: 2, en: 'Castle', zh: '城堡', py: 'chéngbǎo', ms: 'istana' }
  ];
  // home levels: `at` = home score needed, `bonus` = stars paid once when the home first reaches it
  const LEVELS = [
    { at: 0, bonus: 0, en: 'Cosy Corner', zh: '小角落', py: 'xiǎo jiǎoluò', ms: 'Sudut Selesa' },
    { at: 120, bonus: 5, en: 'Little Garden', zh: '小花园', py: 'xiǎo huāyuán', ms: 'Taman Kecil' },
    { at: 220, bonus: 8, en: 'Pretty Yard', zh: '漂亮院子', py: 'piàoliang yuànzi', ms: 'Laman Cantik' },
    { at: 360, bonus: 10, en: 'Happy Home', zh: '快乐之家', py: 'kuàilè zhī jiā', ms: 'Rumah Ceria' },
    { at: 540, bonus: 12, en: 'Lovely Villa', zh: '可爱别墅', py: 'kě\'ài biéshù', ms: 'Vila Comel' },
    { at: 780, bonus: 15, en: 'Grand Garden', zh: '大花园', py: 'dà huāyuán', ms: 'Taman Besar' },
    { at: 1080, bonus: 18, en: 'Dream Estate', zh: '梦想庄园', py: 'mèngxiǎng zhuāngyuán', ms: 'Estet Impian' },
    { at: 1450, bonus: 20, en: 'Star Palace', zh: '星星宫殿', py: 'xīngxing gōngdiàn', ms: 'Istana Bintang' }
  ];
  const HELLO = { t: ID + '.hello', items: ITEMS, order: ORDER, styles: STYLES, levels: LEVELS, max: MAX_PLACED, maxStock: MAX_STOCK, heartStars: HEART_STARS,
    grid: { w: GW, h: GH, tw: TW, th: TH, house: HOUSE, spawn: SPAWN } };

  // ---------- a player's plot ----------
  function int(v, d) { v = parseInt(v, 10); return isFinite(v) ? v : d; }
  function profOf(key) { return has(api.save.profiles, key) ? api.save.profiles[key] : null; }
  // Returns the plot of a profile; makes the starter plot for someone who has none yet.
  function plotOf(prof) {
    let d = prof[ID];
    if (!d || typeof d !== 'object' || Array.isArray(d)) {
      d = prof[ID] = { house: { s: 0, wall: '#FFE8CC', roof: HEX.test(prof.color) ? prof.color : '#E0447F', door: '#8F5A2E' },
        styles: [], inv: {}, placed: [], next: 1, hearts: 0, mail: 0, gave: {}, best: 1 };
      // a few free things, already standing, so a new garden is not empty
      d.inv = { path: 8, tree: 1, bench: 1, flr: 1, fly: 1, bush: 1, lamp: 1 };
      const put = function (i, x, y) { d.placed.push({ n: d.next++, i: i, x: x, y: y, f: 0 }); };
      for (let y = 2; y < GH; y++) put('path', 5, y);
      put('flr', 4, 2); put('fly', 6, 2); put('tree', 1, 3); put('bush', 10, 1); put('bench', 8, 4); put('lamp', 4, 6);
      api.saveSoon();
    }
    // older or damaged saves: every field must be there
    if (!d.house || typeof d.house !== 'object') d.house = { s: 0, wall: '#FFE8CC', roof: '#E0447F', door: '#8F5A2E' };
    if (!Array.isArray(d.styles)) d.styles = [];
    if (!d.inv || typeof d.inv !== 'object') d.inv = {};
    if (!Array.isArray(d.placed)) d.placed = [];
    if (!d.gave || typeof d.gave !== 'object') d.gave = {};
    d.next = int(d.next, 1); d.hearts = int(d.hearts, 0); d.mail = int(d.mail, 0); d.best = int(d.best, 1);
    return d;
  }
  function known(o) { return o && has(ITEMS, o.i); }
  function layerOf(it) { return it.cat === 'ground' ? 0 : 1; }       // ground tiles lie under everything else
  function countPlaced(d, id) { let n = 0; d.placed.forEach(function (o) { if (o.i === id) n++; }); return n; }
  function stock(d, id) { return Math.max(0, (int(d.inv[id], 0)) - countPlaced(d, id)); }   // pieces waiting in storage
  function ownsStyle(d, s) { return s >= 0 && s < STYLES.length && (STYLES[s].cost === 0 || d.styles.indexOf(s) >= 0); }
  function score(d) {
    let n = 0;
    d.placed.forEach(function (o) { if (known(o)) n += ITEMS[o.i].val; });
    const st = STYLES[d.house.s];
    return n + (st ? st.cost : 0);
  }
  function homeLevel(sc) { let lv = 1; while (lv < LEVELS.length && sc >= LEVELS[lv].at) lv++; return lv; }
  // May this item stand with its top-left tile at (x, y)? `skip` = a placed piece to ignore (the one being moved).
  function fits(d, id, x, y, skip) {
    const it = ITEMS[id];
    if (!(x >= 0 && y >= 0 && x + it.w <= GW && y + it.h <= GH)) return false;
    if (x < HOUSE.x + HOUSE.w && x + it.w > HOUSE.x && y < HOUSE.y + HOUSE.h && y + it.h > HOUSE.y) return false;
    const layer = layerOf(it);
    return !d.placed.some(function (o) {
      if (o === skip || !known(o)) return false;
      const q = ITEMS[o.i];
      return layerOf(q) === layer && x < o.x + q.w && x + it.w > o.x && y < o.y + q.h && y + it.h > o.y;
    });
  }

  // ---------- who is where ----------
  const at = new Map();   // player id -> { key: whose plot, x, y, f, m }; only players standing inside a plot
  let tick = null, streetTimer = null;
  function onlineKey(key) { let f = null; api.players.forEach(function (p) { if (p.key === key) f = p; }); return f; }
  function inPlot(key) { return function (p) { const a = at.get(p.id); return p.room === ID && !!a && a.key === key; }; }
  function inLobby(p) { return p.room === ID && !at.has(p.id); }
  function startTick() {
    if (tick || !at.size) return;
    tick = setInterval(function () {   // positions inside the plots, 10 times a second
      if (!at.size) { clearInterval(tick); tick = null; return; }
      const groups = {};
      at.forEach(function (a, id) { (groups[a.key] = groups[a.key] || []).push([id, Math.round(a.x), Math.round(a.y), a.f, a.m]); });
      Object.keys(groups).forEach(function (key) {
        if (groups[key].length > 1) api.broadcast({ t: ID + '.st', p: groups[key] }, inPlot(key));
      });
    }, 100);
  }

  // ---------- messages to the tablets ----------
  function summary(key) {
    const prof = profOf(key), d = plotOf(prof), sc = score(d);
    return { key: key, name: prof.name || key, color: HEX.test(prof.color) ? prof.color : '#FF7A45', house: d.house, hearts: d.hearts, score: sc, lv: homeLevel(sc),
      placed: d.placed.filter(known).map(function (o) { return [o.n, o.i, o.x, o.y, o.f ? 1 : 0]; }) };
  }
  function plotMsg(key, viewer, sel) {
    const d = plotOf(profOf(key)), m = summary(key), mine = viewer.key === key;
    m.t = ID + '.plot'; m.mine = mine;
    m.canHeart = !mine && d.gave[viewer.key] !== api.today();
    if (mine) { m.inv = d.inv; m.styles = d.styles; m.mail = d.mail; if (sel) m.sel = sel; }
    return m;
  }
  function streetMsg(viewer) {
    const day = api.today(), here = {};
    at.forEach(function (a, id) { const p = api.players.get(id); if (p) (here[a.key] = here[a.key] || []).push(p.name); });
    let homes = Object.keys(api.save.profiles).filter(function (k) { const pr = profOf(k); return pr && typeof pr === 'object' && pr.name; }).map(function (k) {
      const h = summary(k), d = plotOf(profOf(k));
      h.online = !!onlineKey(k); h.here = here[k] || [];
      h.canHeart = k !== viewer.key && d.gave[viewer.key] !== day;
      return h;
    });
    homes.sort(function (a, b) { return (a.key === viewer.key ? -1 : 0) - (b.key === viewer.key ? -1 : 0) || (b.online - a.online) || (b.score - a.score); });
    homes = homes.slice(0, MAX_HOMES);
    const mine = profOf(viewer.key);
    return { t: ID + '.street', me: viewer.key, homes: homes, mail: mine ? plotOf(mine).mail : 0 };
  }
  function streetSoon() {   // the lobby cards follow what happens, but not more often than twice a second
    if (streetTimer) return;
    streetTimer = setTimeout(function () {
      streetTimer = null;
      api.players.forEach(function (p) { if (inLobby(p)) api.send(p, streetMsg(p)); });
    }, 500);
  }
  function sendPlot(key, actor, sel) {
    api.players.forEach(function (p) { if (inPlot(key)(p)) api.send(p, plotMsg(key, p, actor && p.id === actor.id ? sel : 0)); });
  }
  // The owner changed something: save, pay a first-time home level, and show everyone who is looking.
  function changed(p, d, sel) {
    api.saveSoon();
    sendPlot(p.key, p, sel);
    const lv = homeLevel(score(d));
    if (lv > d.best) {
      let bonus = 0;
      for (let l = d.best + 1; l <= lv; l++) bonus += LEVELS[l - 1].bonus;
      d.best = lv;
      api.send(p, { t: ID + '.lvup', lv: lv, stars: bonus });
      if (bonus > 0) api.addStars(p, bonus);
    }
    streetSoon();
  }
  // the plot of the player, but only while they are standing in their own garden
  function ownPlot(p) {
    const a = at.get(p.id), prof = api.prof(p);
    if (p.room !== ID || !a || a.key !== p.key || !prof) return null;
    return plotOf(prof);
  }
  function no(p, why) { api.send(p, { t: ID + '.no', why: why }); if (at.has(p.id)) api.send(p, plotMsg(at.get(p.id).key, p)); }

  // ---------- the room ----------
  api.room({
    enter: function (p) {
      const prof = api.prof(p);
      if (prof) plotOf(prof);
      api.send(p, HELLO);
      api.send(p, streetMsg(p));
      streetSoon();
    },
    leave: function (p) { at.delete(p.id); streetSoon(); }
  });
  api.onJoin(function (p) {
    streetSoon();
    const prof = api.prof(p);
    if (prof && prof[ID] && prof[ID].mail > 0) {
      const n = prof[ID].mail;
      setTimeout(function () { api.toast('📬 ' + n + ' new heart' + (n === 1 ? '' : 's') + ' for your home! Collect your stars in Home Street.', function (o) { return o.id === p.id; }); }, 2500);
    }
  });
  api.onQuit(function (p) { at.delete(p.id); streetSoon(); });

  // go into a garden (your own or someone else's), or back out to the street
  api.on('visit', function (p, m) {
    if (p.room !== ID) return;
    const key = String(m.key || '').toLowerCase(), prof = profOf(key);
    if (!prof || !prof.name) { at.delete(p.id); api.send(p, streetMsg(p)); return; }
    plotOf(prof);
    const was = at.get(p.id);
    at.set(p.id, { key: key, x: SPAWN.x + api.rnd(-110, 110), y: SPAWN.y - api.rnd(0, 40), f: 1, m: 0 });
    api.send(p, plotMsg(key, p));
    if (key !== p.key && (!was || was.key !== key)) api.questEvent(p, ID + '.visit');
    startTick();
    streetSoon();
  });
  api.on('street', function (p) {
    if (p.room !== ID) return;
    at.delete(p.id);
    api.send(p, streetMsg(p));
    streetSoon();
  });
  api.on('pos', function (p, m) {
    const a = at.get(p.id);
    if (!a) return;
    a.x = api.clamp(+m.x || 0, 0, GW * TW); a.y = api.clamp(+m.y || 0, 0, GH * TH);
    a.f = m.f < 0 ? -1 : 1; a.m = m.m ? 1 : 0;
  });

  // buy something for the storage, or a house style
  api.on('buy', function (p, m) {
    const prof = api.prof(p);
    if (p.room !== ID || !prof) return;
    const d = plotOf(prof), id = String(m.id || '');
    let why = null;
    if (id.indexOf('house.') === 0) {
      const s = int(id.slice(6), -1), st = STYLES[s];
      if (!st || String(s) !== id.slice(6)) why = 'unknown';
      else if (ownsStyle(d, s)) why = 'owned';
      else if (api.levelOf(p.stars) < st.lv) why = 'level';
      else if (!api.spend(p, st.cost)) why = 'stars';
      else d.styles.push(s);
    } else {
      const it = has(ITEMS, id) ? ITEMS[id] : null;
      if (!it) why = 'unknown';
      else if (api.levelOf(p.stars) < it.lv) why = 'level';
      else if (int(d.inv[id], 0) + it.pack > MAX_STOCK) why = 'full';
      else if (!api.spend(p, it.cost)) why = 'stars';
      else d.inv[id] = int(d.inv[id], 0) + it.pack;
    }
    if (!why) api.saveSoon();
    api.send(p, { t: ID + '.bought', id: id, ok: !why, why: why || undefined, inv: d.inv, styles: d.styles });
  });

  // edit mode, in your own garden only
  api.on('place', function (p, m) {   // from the storage onto the grid
    const d = ownPlot(p);
    if (!d) return;
    const id = String(m.id || ''), x = int(m.x, -1), y = int(m.y, -1);
    if (!has(ITEMS, id) || stock(d, id) < 1) return no(p, 'none');
    if (d.placed.filter(known).length >= MAX_PLACED) return no(p, 'full');
    if (!fits(d, id, x, y, null)) return no(p, 'spot');
    const o = { n: d.next++, i: id, x: x, y: y, f: m.f ? 1 : 0 };
    d.placed.push(o);
    api.questEvent(p, ID + '.place');
    changed(p, d, o.n);
  });
  api.on('move', function (p, m) {    // move and / or flip a piece that already stands
    const d = ownPlot(p);
    if (!d) return;
    const n = int(m.n, 0), o = d.placed.find(function (q) { return q.n === n; });
    if (!o || !known(o)) return no(p, 'none');
    const x = int(m.x, o.x), y = int(m.y, o.y);
    if (!fits(d, o.i, x, y, o)) return no(p, 'spot');
    o.x = x; o.y = y;
    if (m.f !== undefined) o.f = m.f ? 1 : 0;
    changed(p, d, o.n);
  });
  api.on('store', function (p, m) {   // back into the storage
    const d = ownPlot(p);
    if (!d) return;
    const n = int(m.n, 0), i = d.placed.findIndex(function (q) { return q.n === n; });
    if (i < 0) return no(p, 'none');
    d.placed.splice(i, 1);
    changed(p, d, 0);
  });
  api.on('house', function (p, m) {   // house style and colours
    const d = ownPlot(p);
    if (!d) return;
    const s = int(m.s, d.house.s);
    if (!ownsStyle(d, s)) return no(p, 'style');
    d.house = { s: s, wall: HEX.test(m.wall) ? m.wall : d.house.wall, roof: HEX.test(m.roof) ? m.roof : d.house.roof, door: HEX.test(m.door) ? m.door : d.house.door };
    changed(p, d, 0);
  });

  // hearts: one per visitor, per home, per day. The owner picks up the stars from the mailbox later.
  api.on('heart', function (p) {
    const a = at.get(p.id);
    if (p.room !== ID || !a || a.key === p.key) return;
    const prof = profOf(a.key);
    if (!prof) return;
    const d = plotOf(prof), day = api.today();
    if (d.gave[p.key] === day) return no(p, 'heart');
    d.gave[p.key] = day;
    d.hearts++; d.mail++;
    api.saveSoon();
    api.broadcast({ t: ID + '.fx', k: 'heart', name: p.name }, inPlot(a.key));
    sendPlot(a.key, null, 0);
    const owner = onlineKey(a.key);
    if (owner && !inPlot(a.key)(owner)) api.toast('❤️ ' + p.name + ' gave your home a heart! Your mailbox in Home Street has stars for you.', function (o) { return o.id === owner.id; });
    streetSoon();
  });
  api.on('collect', function (p) {
    const prof = api.prof(p);
    if (p.room !== ID || !prof) return;
    const d = plotOf(prof), n = d.mail;
    if (!(n > 0)) return;
    d.mail = 0;
    api.send(p, { t: ID + '.mail', n: n, stars: n * HEART_STARS });
    api.addStars(p, n * HEART_STARS);
    if (at.has(p.id)) api.send(p, plotMsg(at.get(p.id).key, p)); else api.send(p, streetMsg(p));
  });

  // ---------- daily quests ----------
  api.addQuest({ type: ID + '.place', icon: '🏡', solo: true, tiers: [[3, 4], [5, 6]],
    en: 'Place {n} things in your garden', zh: '在花园里摆放 {n} 件东西', py: 'zài huāyuán lǐ bǎifàng {n} jiàn dōngxi', ms: 'Letak {n} benda di taman kamu' });
  api.addQuest({ type: ID + '.visit', icon: '🚪', solo: false, tiers: [[1, 4]],
    en: 'Visit a family member\'s home', zh: '参观一位家人的家', py: 'cānguān yí wèi jiārén de jiā', ms: 'Lawat rumah seorang ahli keluarga' });
};
