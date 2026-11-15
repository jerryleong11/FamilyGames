// Obby Tower (client): an obstacle course seen from the side that climbs a tower.
// The running and jumping is simulated here on the tablet; the server (dev/games/obby.js) owns the flags
// reached, the stars, the run clock and the best times. Everyone in the same tower sees the others climb.
(function () {
  'use strict';
  var api = null;
  var NAVY = '#1B2A49', TAU = Math.PI * 2;
  var W = 800;                        // width of a tower in world units; the screen shows the whole width
  var TX0 = 150, TX1 = 650;           // the round tower wall behind the platforms
  var EPOCH = 1760000000000;          // tower time 0 (ms); moving things are a function of the server clock

  // ---------- how the jumping feels ----------
  // Every jump has the same height (109 units, the extra jump in the air adds 47): easier to judge for small children.
  var G = 1700, JUMP = 610, JUMP2 = 400, RUN = 235, MAXFALL = 820, BOUNCE = 900, LIFT = 300;
  var COYOTE = 0.13;                  // still allowed to jump this long after running off an edge
  var BUFFER = 0.16;                  // a jump pressed this long before landing still counts
  var VBACK = 2.6;                    // seconds until a vanished cloud comes back
  var HEAD = 30, THICK = 18;          // Hard tower: platforms are solid from below (head height, platform thickness)
  var AV = 0.5;                       // avatar scale
  var EV_JUMP = 1, EV_DJUMP = 2, EV_LAND = 4, EV_BOUNCE = 8, EV_DIE = 16, EV_FLAG = 32, EV_BONK = 64;

  // ---------- the two towers: every stage is made by hand ----------
  // x from the left (0..800), y up from the floor of the stage, w = width. A stage starts on its flag platform.
  //   p x y w                 platform                    m x y w dx dy seconds [phase]         moving platform
  //   v x y w                 cloud that vanishes         o cx cy r w seconds [phase]           platform on a big wheel
  //   b x y w                 bounce pad                  sw px py len w swing seconds [phase]  swinging platform
  //   c x y w speed           conveyor belt               l x y w h                             lava block (y = its top)
  //   lp x y w                lava puddle on a platform   s x y r speed arms [angle]            spinning bar
  //   w px py len swing seconds [phase]  swinging ball    z x y dx dy seconds [phase]           spiky that walks up and down
  //   wind x y w h push lift  wind (y = its bottom; push sideways, or lift for an updraft)
  var TOWERS = {
    // Easy: wide platforms you can also jump up through from below, slow hazards
    easy: {
      vanish: 1.1, solid: false, wall: '#EADFC8', trim: '#58C06B',
      sky: [['#6CC3F5', '#CDEFFF'], ['#3F9BEA', '#A8DCFF'], ['#27489A', '#86B9F2']],
      cols: ['#7BD389', '#5AC8FA', '#FFB454', '#B79CFF', '#FF8FB8', '#5ED6C4', '#FFD66B', '#FF8A65', '#8FD3FF', '#C5E86C', '#F7A8E0', '#FFC933'],
      top: [20, 280],
      stages: [
        // 1 steps
        { h: 372, flag: [0, 800], it: [['p', 280, 62, 240], ['p', 520, 124, 220], ['p', 260, 186, 220], ['p', 500, 248, 220], ['p', 240, 310, 220]] },
        // 2 gaps
        { h: 340, flag: [440, 260], it: [['p', 190, 50, 170], ['p', 20, 112, 110], ['p', 190, 174, 150], ['p', 420, 174, 140], ['p', 640, 174, 140], ['p', 440, 236, 140], ['p', 230, 290, 160]] },
        // 3 lava puddles
        { h: 366, flag: [30, 250], it: [['p', 340, 56, 430], ['lp', 530, 56, 56], ['p', 600, 118, 180], ['p', 150, 180, 380], ['lp', 310, 180, 56], ['p', 0, 242, 120], ['p', 190, 304, 400], ['lp', 370, 304, 56]] },
        // 4 moving platforms
        { h: 366, flag: [570, 230], it: [['p', 350, 56, 160], ['m', 60, 118, 150, 150, 0, 5], ['p', 0, 180, 130], ['p', 190, 242, 150], ['m', 400, 242, 140, 220, 0, 6], ['p', 660, 304, 140]] },
        // 5 clouds that vanish
        { h: 366, flag: [330, 270], it: [['v', 660, 60, 130], ['p', 470, 122, 150], ['v', 280, 184, 130], ['v', 90, 244, 130], ['p', 280, 304, 170]] },
        // 6 bounce pads
        { h: 430, flag: [500, 260], it: [['b', 310, 25, 110], ['p', 130, 205, 200], ['b', 0, 230, 110]] },
        // 7 conveyor belts
        { h: 362, flag: [170, 260], it: [['c', 500, 56, 250, 70], ['p', 620, 118, 170], ['c', 330, 180, 230, 70], ['p', 130, 242, 150], ['c', 330, 302, 250, -70]] },
        // 8 spinning bars
        { h: 366, flag: [560, 240], it: [['p', 300, 56, 240], ['s', 420, 141, 62, 1.3, 1], ['p', 110, 118, 140], ['p', 0, 180, 120], ['p', 190, 242, 270], ['s', 325, 327, 62, -1.3, 1, 2], ['p', 520, 304, 160]] },
        // 9 wind
        { h: 430, flag: [510, 250], it: [['p', 300, 56, 140], ['wind', 100, 36, 200, 170, -110, 0], ['p', 0, 56, 110], ['wind', 10, 76, 180, 280, 0, 2600], ['p', 240, 316, 180], ['p', 480, 372, 170]] },
        // 10 swinging balls
        { h: 490, flag: [300, 260], it: [['p', 60, 56, 170], ['p', 150, 118, 400], ['w', 350, 286, 128, 1.0, 4], ['p', 620, 180, 150], ['p', 640, 242, 150], ['p', 200, 304, 380], ['w', 390, 472, 128, 1.0, 3.6, 0.3], ['p', 20, 366, 150], ['p', 60, 428, 150]] },
        // 11 a bit of everything
        { h: 372, flag: [230, 260], it: [['l', 520, 22, 280, 30], ['m', 540, 56, 130, 130, 0, 5], ['p', 690, 118, 110], ['v', 500, 180, 130], ['v', 310, 242, 130], ['p', 90, 300, 170], ['m', 300, 300, 150, 0, 54, 4]] },
        // 12 the top
        { h: 396, flag: [470, 250], it: [['b', 290, 30, 110], ['p', 60, 215, 200], ['m', 320, 277, 130, 220, 0, 5.5], ['p', 330, 339, 300], ['s', 480, 424, 62, 1.4, 1]] }
      ]
    },
    // Hard: small stone platforms that are solid from below (go round the edge), fast hazards
    hard: {
      vanish: 0.65, solid: true, wall: '#C9C2DE', trim: '#8C6BE8',
      sky: [['#F29A6B', '#FFE3AE'], ['#8E5BD0', '#F7A6B5'], ['#17153F', '#4B3A8C']],
      cols: ['#6FA8DC', '#E57373', '#9575CD', '#F06292', '#4DB6AC', '#FFB74D', '#7986CB', '#81C784', '#4FC3F7', '#BA68C8', '#FF8A65', '#FFD54F'],
      top: [100, 400],
      stages: [
        // 1 hop and skip
        { h: 420, flag: [0, 800], it: [['p', 520, 84, 110], ['p', 320, 168, 110], ['p', 130, 252, 100], ['p', 320, 336, 100]] },
        // 2 lava hop
        { h: 420, flag: [510, 200], it: [['p', 200, 84, 240], ['lp', 300, 84, 44], ['p', 40, 168, 130], ['l', 215, 212, 60, 20], ['p', 300, 252, 130], ['p', 520, 336, 110]] },
        // 3 crumbling clouds
        { h: 420, flag: [640, 160], it: [['v', 470, 84, 90], ['v', 300, 168, 90], ['v', 130, 252, 90], ['v', 20, 336, 90]] },
        // 4 bounce over the lava
        { h: 520, flag: [190, 220], it: [['l', 430, 20, 370, 30], ['b', 490, 60, 56], ['p', 650, 250, 100], ['b', 480, 275, 56], ['p', 250, 470, 110]] },
        // 5 belts and spikies
        { h: 420, flag: [0, 190], it: [['c', 260, 84, 240, -110], ['z', 300, 100, 160, 0, 3], ['p', 580, 168, 110], ['c', 300, 252, 200, 120], ['c', 40, 336, 190, -120], ['z', 80, 352, 110, 0, 2.6]] },
        // 6 windmills to jump over
        { h: 420, flag: [200, 220], it: [['p', 380, 84, 320], ['s', 570, 97, 52, 2.0, 2], ['p', 730, 168, 70], ['p', 340, 252, 350], ['s', 510, 265, 52, -2.2, 2, 1], ['p', 210, 336, 90]] },
        // 7 windy gaps
        { h: 420, flag: [40, 200], it: [['wind', 250, 0, 550, 200, -90, 0], ['p', 290, 84, 120], ['p', 510, 168, 100], ['wind', 60, 230, 560, 200, -130, 0], ['p', 200, 252, 100], ['wind', 0, 270, 100, 180, 0, 2600]] },
        // 8 swingers
        { h: 420, flag: [110, 220], it: [['sw', 500, 234, 169, 100, 0.7, 3.8], ['p', 700, 168, 100], ['p', 340, 252, 300], ['w', 490, 402, 110, 1.1, 2.8], ['p', 190, 336, 100]] },
        // 9 the big wheel
        { h: 504, flag: [360, 200], it: [['l', 580, 20, 220, 30], ['o', 610, 180, 120, 90, 7, 0], ['o', 610, 180, 120, 90, 7, 0.3333], ['o', 610, 180, 120, 90, 7, 0.6667], ['p', 350, 336, 100], ['p', 540, 420, 110]] },
        // 10 vanish and move
        { h: 420, flag: [300, 200], it: [['m', 560, 84, 90, 150, 0, 3.2], ['v', 700, 168, 90], ['v', 530, 252, 90], ['m', 180, 336, 90, 200, 0, 3.4]] },
        // 11 the gauntlet
        { h: 504, flag: [0, 170], it: [['c', 230, 84, 330, -130], ['w', 395, 234, 105, 1.1, 2.4], ['p', 630, 168, 90], ['p', 270, 252, 310], ['s', 420, 265, 50, 2.4, 2], ['v', 110, 336, 100], ['b', 20, 362, 56]] },
        // 12 the summit
        { h: 588, flag: [120, 220], it: [['l', 400, 20, 400, 30], ['v', 420, 84, 90], ['o', 650, 230, 90, 80, 5, 0], ['o', 650, 230, 90, 80, 5, 0.5], ['p', 380, 336, 100], ['p', 20, 420, 330], ['w', 170, 570, 102, 0.9, 2.4], ['wind', 0, 420, 90, 200, 0, 2600]] }
      ]
    }
  };
  var NAME = { en: 'Obby Tower', zh: '障碍塔', py: 'zhàng\'ài tǎ', ms: 'Menara Halangan' };
  var TOWER_NAME = {
    easy: { en: 'Easy Tower', zh: '简单塔', py: 'jiǎndān tǎ', ms: 'Menara Mudah' },
    hard: { en: 'Hard Tower', zh: '困难塔', py: 'kùnnan tǎ', ms: 'Menara Sukar' }
  };
  var MEDALS = { easy: [90, 150, 240], hard: [150, 240, 360] };   // seconds for gold, silver, bronze
  var SOLID = { p: 1, f: 1, m: 1, o: 1, sw: 1, v: 1, b: 1, c: 1 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); } // the same "random" number every time

  // ---------- building a tower from its stage lists (world: x right, y down, the ground is y = 0) ----------
  function make(it, base) {
    switch (it[0]) {
      case 'p': case 'v': case 'b': return { k: it[0], x: it[1], y: base - it[2], w: it[3] };
      case 'c': return { k: 'c', x: it[1], y: base - it[2], w: it[3], sp: it[4] };
      case 'm': return { k: 'm', x: it[1], y: base - it[2], w: it[3], dx: it[4], dy: -it[5], per: it[6], ph: it[7] || 0 };
      case 'o': return { k: 'o', cx: it[1], cy: base - it[2], r: it[3], w: it[4], per: it[5], ph: it[6] || 0 };
      case 'sw': return { k: 'sw', px: it[1], py: base - it[2], len: it[3], w: it[4], amp: it[5], per: it[6], ph: it[7] || 0 };
      case 'l': return { k: 'l', x: it[1], y: base - it[2], w: it[3], h: it[4] || 18 };
      case 'lp': return { k: 'l', x: it[1], y: base - it[2] - 9, w: it[3], h: 15, pud: 1 };
      case 's': return { k: 's', x: it[1], y: base - it[2], r: it[3], sp: it[4], arms: it[5] || 2, ph: it[6] || 0 };
      case 'w': return { k: 'w', px: it[1], py: base - it[2], len: it[3], amp: it[4], per: it[5], ph: it[6] || 0, r: 19 };
      case 'z': return { k: 'z', x: it[1], y: base - it[2], dx: it[3], dy: -it[4], per: it[5], ph: it[6] || 0, r: 15 };
      case 'wind': return { k: 'wind', x: it[1], y: base - it[2] - it[4], w: it[3], h: it[4], fx: it[5] || 0, fy: it[6] || 0 };
    }
    return null;
  }
  function build(id) {
    var def = TOWERS[id], tw = { id: id, def: def, n: def.stages.length, ents: [], stages: [], vd: def.vanish, solid: !!def.solid, top: 0, height: 0 };
    var base = 0, i, j, sd, stg, e;
    function add(e) { e.i = tw.ents.length; e.st = stg.i; tw.ents.push(e); stg.list.push(e.i); }
    for (i = 0; i <= tw.n; i++) {
      sd = def.stages[i] || { h: 0, flag: def.top, it: [] };   // the last "stage" is only the platform at the top
      stg = { i: i, base: base, h: sd.h, list: [], fi: 0, col: def.cols[i % def.cols.length] };
      tw.stages.push(stg);
      e = { k: 'f', x: sd.flag[0], y: base, w: sd.flag[1], flag: i, px: sd.flag[0] + sd.flag[1] / 2 };
      add(e); stg.fi = e.i;
      for (j = 0; j < sd.it.length; j++) { e = make(sd.it[j], base); if (e) add(e); }
      base -= sd.h;
    }
    tw.top = tw.stages[tw.n].base;
    tw.height = -tw.top;
    return tw;
  }
  var built = {};
  function tower(id) { return built[id] || (built[id] = build(id)); }

  // ---------- the simulation (no drawing in here: the test bot runs it too) ----------
  // where a moving thing is at tower time T (platforms: the left end of the line you stand on; balls: the centre)
  function pos(e, T, o) {
    var k = e.k, a;
    if (k === 'm' || k === 'z') { a = 0.5 - 0.5 * Math.cos(TAU * (T / e.per + e.ph)); o.x = e.x + e.dx * a; o.y = e.y + e.dy * a; }
    else if (k === 'o') { a = TAU * (T / e.per + e.ph); o.x = e.cx + e.r * Math.cos(a) - e.w / 2; o.y = e.cy + e.r * Math.sin(a); }
    else if (k === 'sw' || k === 'w') { a = e.amp * Math.sin(TAU * (T / e.per + e.ph)); o.x = e.px + e.len * Math.sin(a) - (e.w || 0) / 2; o.y = e.py + e.len * Math.cos(a); }
    else { o.x = e.x; o.y = e.y; }
    return o;
  }
  function newState() { return { x: 0, y: 0, vx: 0, vy: 0, on: -1, coy: 0, buf: 0, air: 0, held: false, f: 1, cp: 0, T: 0, van: {}, ev: 0, hit: -1 }; }
  // puts the player on the flag of stage s.cp
  function spawn(tw, s) {
    var F = tw.ents[tw.stages[s.cp].fi];
    s.x = clamp(F.px - 26, F.x + 12, F.x + F.w - 12); s.y = F.y; s.vx = s.vy = 0; s.on = F.i; s.coy = s.buf = 0; s.air = 0; s.van = {};
  }
  // a cloud is away from `vd` seconds after it was first stood on until it comes back
  function gone(tw, s, i, T) {
    var t0 = s.van[i], d;
    if (t0 === undefined) return false;
    d = T - t0;
    if (d < tw.vd) return false;
    if (d < tw.vd + VBACK) return true;
    delete s.van[i];
    return false;
  }
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, u = l ? clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0;
    dx = ax + dx * u - px; dy = ay + dy * u - py;
    return Math.sqrt(dx * dx + dy * dy);
  }
  var PA = { x: 0, y: 0 }, PB = { x: 0, y: 0 };
  var OPT = { dj: 1, ledge: 9, coy: COYOTE, haz: 0 };
  // One step of `dt` seconds. inp = { ax: -1..1, jump: held }. Sets s.ev to what happened (EV_*).
  function step(tw, s, inp, dt, o) {
    o = o || OPT;
    var ents = tw.ents, T0 = s.T, T1 = T0 + dt, e, i, j, n, list, si, want, acc, py0, best = -1, bestY = 0, wx = 0, wy = 0, a, d, cx, cy, hz = o.haz;
    var s0 = Math.max(0, s.cp - 1), s1 = Math.min(tw.n, s.cp + 1);
    s.ev = 0; s.T = T1;
    if (inp.jump && !s.held) s.buf = BUFFER; else if (s.buf > 0) s.buf -= dt;
    s.held = !!inp.jump;
    want = inp.ax * RUN; acc = (s.on >= 0 ? 2800 : 1900) * dt;
    if (s.vx < want) s.vx = Math.min(want, s.vx + acc); else if (s.vx > want) s.vx = Math.max(want, s.vx - acc);
    if (inp.ax > 0.2) s.f = 1; else if (inp.ax < -0.2) s.f = -1;
    // wind
    for (si = s0; si <= s1; si++) {
      list = tw.stages[si].list;
      for (i = 0; i < list.length; i++) {
        e = ents[list[i]];
        if (e.k === 'wind' && s.x > e.x && s.x < e.x + e.w && s.y - 20 > e.y && s.y - 20 < e.y + e.h) { wx += e.fx; wy += e.fy; }
      }
    }
    if (s.on >= 0 && ents[s.on].k === 'v' && gone(tw, s, s.on, T1)) { s.on = -1; s.coy = 0; }
    // jump: from the ground, a moment after leaving it, or once more in the air
    if (s.buf > 0) {
      if (s.on >= 0 || s.coy > 0) { s.vy = -JUMP; s.on = -1; s.coy = 0; s.buf = 0; s.ev |= EV_JUMP; }
      else if (s.air < o.dj) { s.vy = -JUMP2; s.air++; s.buf = 0; s.ev |= EV_DJUMP; }
    }
    if (s.on >= 0) {
      // standing: ride the platform
      e = ents[s.on]; pos(e, T0, PA); pos(e, T1, PB);
      s.x += PB.x - PA.x + (e.k === 'c' ? e.sp * dt : 0) + (s.vx + wx * 0.5) * dt; s.y = PB.y; s.vy = 0;
      if (s.x < PB.x - o.ledge || s.x > PB.x + e.w + o.ledge) { s.on = -1; s.coy = o.coy; }
    } else {
      if (s.coy > 0) s.coy -= dt;
      s.vy += G * dt;
      if (wy && s.vy > -LIFT) s.vy = Math.max(-LIFT, s.vy - wy * dt);
      if (s.vy > MAXFALL) s.vy = MAXFALL;
      py0 = s.y;
      s.x += (s.vx + wx) * dt; s.y += s.vy * dt;
      if (s.vy < 0 && tw.solid) {
        // Hard tower: a head that comes up under a platform stops there (clouds are soft). Near an edge it slips past.
        for (si = s0; si <= s1 && s.vy < 0; si++) {
          list = tw.stages[si].list;
          for (i = 0; i < list.length; i++) {
            e = ents[list[i]];
            if (!SOLID[e.k] || e.k === 'v') continue;
            pos(e, T1, PB);
            if (s.x <= PB.x + 4 || s.x >= PB.x + e.w - 4 || s.y - HEAD >= PB.y + THICK || s.y - HEAD <= PB.y - 2) continue;
            if (py0 - HEAD >= PB.y + THICK - 16) s.y = PB.y + THICK + HEAD;
            s.vy = 0; s.ev |= EV_BONK;
            break;
          }
        }
      }
      if (s.vy > 0) {
        // landing: platforms are solid from above only
        for (si = s0; si <= s1; si++) {
          list = tw.stages[si].list;
          for (i = 0; i < list.length; i++) {
            e = ents[list[i]];
            if (!SOLID[e.k]) continue;
            pos(e, T1, PB);
            if (s.y < PB.y || s.x < PB.x - o.ledge || s.x > PB.x + e.w + o.ledge) continue;
            pos(e, T0, PA);
            if (py0 > PA.y + 6) continue;
            if (e.k === 'v' && gone(tw, s, e.i, T1)) continue;
            if (best < 0 || PB.y < bestY) { best = e.i; bestY = PB.y; }
          }
        }
        if (best >= 0) {
          e = ents[best];
          s.y = bestY; s.vy = 0; s.on = best; s.air = 0; s.coy = 0; s.ev |= EV_LAND;
          if (e.k === 'b') { s.vy = -BOUNCE; s.on = -1; s.ev |= EV_BOUNCE; s.hit = best; }
          else if (e.k === 'v' && s.van[best] === undefined) s.van[best] = T1;
        }
      }
    }
    if (s.x < 14) { s.x = 14; if (s.vx < 0) s.vx = 0; } else if (s.x > W - 14) { s.x = W - 14; if (s.vx > 0) s.vx = 0; }
    // hazards (the hit boxes are smaller than the drawings)
    for (si = s0; si <= s1 && !(s.ev & EV_DIE); si++) {
      list = tw.stages[si].list;
      for (i = 0; i < list.length; i++) {
        e = ents[list[i]];
        if (e.k === 'l') {
          if (s.x + 7 > e.x + 3 - hz && s.x - 7 < e.x + e.w - 3 + hz && s.y > e.y + 2 - hz && s.y - 34 < e.y + e.h + hz) { s.ev |= EV_DIE; break; }
        } else if (e.k === 's') {
          if (Math.abs(s.x - e.x) > e.r + 30 || Math.abs(s.y - 20 - e.y) > e.r + 45) continue;
          n = e.arms;
          for (j = 0; j < n; j++) {
            a = e.ph + e.sp * T1 + j * TAU / n; cx = e.x + Math.cos(a) * e.r; cy = e.y + Math.sin(a) * e.r;
            d = Math.min(segDist(s.x, s.y - 10, e.x, e.y, cx, cy), segDist(s.x, s.y - 21, e.x, e.y, cx, cy), segDist(s.x, s.y - 31, e.x, e.y, cx, cy));
            if (d < 12 + hz) { s.ev |= EV_DIE; break; }
          }
          if (s.ev & EV_DIE) break;
        } else if (e.k === 'w' || e.k === 'z') {
          pos(e, T1, PB); cx = PB.x - s.x; cy = PB.y - (s.y - 21);
          if (Math.abs(cx) > 60 || Math.abs(cy) > 80) continue;
          d = e.r + 5 + hz;
          if (cx * cx + cy * cy < d * d || cx * cx + (cy - 11) * (cy - 11) < d * d || cx * cx + (cy + 10) * (cy + 10) < d * d) { s.ev |= EV_DIE; break; }
        }
      }
    }
    // fell below the stage
    if (s.cp > 0 && s.y > tw.stages[s.cp].base + 170) s.ev |= EV_DIE;
    // the next flag (or the one after, should somebody manage to skip one)
    if (!(s.ev & EV_DIE)) {
      for (j = Math.min(tw.n, s.cp + 2); j > s.cp; j--) {
        e = ents[tw.stages[j].fi];
        if (s.on === e.i || (Math.abs(s.x - e.px) < 44 && s.y <= e.y + 2 && s.y > e.y - 80)) { s.cp = j; s.ev |= EV_FLAG; break; }
      }
    }
  }

  // ---------- small drawing helpers ----------
  function shade(hex, f) { return window.Scene && window.Scene.shade ? window.Scene.shade(hex, f) : hex; }
  function rgb(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
  function mix(a, b, f) { a = rgb(a); b = rgb(b); return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * f) + ',' + Math.round(a[1] + (b[1] - a[1]) * f) + ',' + Math.round(a[2] + (b[2] - a[2]) * f) + ')'; }
  function poly(g, p) { g.beginPath(); g.moveTo(p[0], p[1]); for (var i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); }
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function star(g, x, y, r) {
    g.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    g.closePath();
  }
  function ol(g, w) { g.lineWidth = w || 3; g.strokeStyle = NAVY; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
  function medal(id, ms) {
    var m = MEDALS[id], sec = ms / 1000;
    return !ms || !m ? '' : sec <= m[0] ? '🥇' : sec <= m[1] ? '🥈' : sec <= m[2] ? '🥉' : '';
  }
  function fmt(ms) {
    var d = Math.max(0, Math.round(ms / 100)), m = Math.floor(d / 600), s = Math.floor(d / 10) % 60;
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (d % 10);
  }

  // sprite cache: static things are drawn once into small canvases and reused
  var sprites = {}, spriteCount = 0, RES = 1;
  function spr(key, w, h, draw) {
    var s = sprites[key], g;
    if (!s) {
      if (spriteCount > 90) { sprites = {}; spriteCount = 0; }   // never let the cache grow without end
      s = document.createElement('canvas'); s.width = Math.max(1, Math.ceil(w * RES)); s.height = Math.max(1, Math.ceil(h * RES));
      g = s.getContext('2d'); g.scale(RES, RES); g.lineJoin = 'round'; g.lineCap = 'round';
      draw(g); s.lw = w; s.lh = h; sprites[key] = s; spriteCount++;
    }
    return s;
  }
  // A block seen a little from above: a lit top, a darker front and an even darker right side.
  // (0, 0) is the left end of the line the players stand on; that line runs through the middle of the top face.
  function block(g, w, top, front, side, hh) {
    var d = 8;
    g.lineJoin = 'round';
    poly(g, [w, 5, w + d, -5, w + d, -5 + hh, w, 5 + hh]); g.fillStyle = side; g.fill(); ol(g, 3);
    g.beginPath(); g.rect(0, 5, w, hh); g.fillStyle = front; g.fill(); ol(g, 3);
    g.fillStyle = 'rgba(27,42,73,0.13)'; g.fillRect(1.5, hh - 2, w - 3, 5.5);
    poly(g, [0, 5, w, 5, w + d, -5, d, -5]); g.fillStyle = top; g.fill(); ol(g, 3);
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(d + 3, -2); g.lineTo(w + d - 6, -2); g.stroke();
  }
  function tri(g, x, y, r, a, fill) {   // a little arrow head pointing along angle a
    poly(g, [x + Math.cos(a) * r, y + Math.sin(a) * r, x + Math.cos(a + 2.3) * r, y + Math.sin(a + 2.3) * r, x + Math.cos(a - 2.3) * r, y + Math.sin(a - 2.3) * r]);
    g.fillStyle = fill; g.fill(); ol(g, 2);
  }
  function platSprite(e, col) {
    var k = e.k, kind = k === 'm' ? (e.dy ? 'mv' : 'mh') : k, w = e.w;
    return spr(kind + '|' + w + '|' + (k === 'p' ? col + (tw.solid ? 's' : '') : ''), w + 36, 56, function (g) {
      var i, n, list;
      g.translate(12, 16);
      if (k === 'p' && tw.solid) {
        // Hard tower: a slab of stone with a heavy underside (you cannot jump up through it)
        block(g, w, col, shade(col, -0.3), shade(col, -0.48), 18);
        g.strokeStyle = 'rgba(27,42,73,0.4)'; g.lineWidth = 2; g.beginPath();
        for (i = 22; i < w - 6; i += 30) { g.moveTo(i, 6.5); g.lineTo(i, 14); }
        for (i = 8; i < w - 6; i += 30) { g.moveTo(i, 14); g.lineTo(i, 21.5); }
        g.moveTo(1.5, 14); g.lineTo(w - 1.5, 14); g.stroke();
        g.fillStyle = NAVY; g.fillRect(0, 21, w, 3.5);
      } else if (k === 'p') {
        block(g, w, col, shade(col, -0.24), shade(col, -0.42), 18);
        for (i = 9; i < w - 5; i += 17) { g.beginPath(); g.arc(i, 5, 6.5, 0, Math.PI); g.fillStyle = col; g.fill(); ol(g, 2); }   // icing over the edge
      } else if (k === 'f') {
        block(g, w, '#FFF3D6', '#F2B94B', '#C98A1E', 18);
        g.fillStyle = NAVY;
        for (i = 0; i * 10 < w - 3; i += 2) g.fillRect(i * 10 + 1.5, 6.5, Math.min(10, w - i * 10 - 3), 6);   // a chequered band: this is a checkpoint
        for (i = 1; i * 10 < w - 3; i += 2) g.fillRect(i * 10 + 1.5, 12.5, Math.min(10, w - i * 10 - 3), 6);
      } else if (k === 'm' || k === 'o' || k === 'sw') {
        block(g, w, '#F4F8FF', '#8FA6CC', '#5F769E', 18);
        if (k === 'm') { tri(g, w / 2 - 15, 14, 7, e.dy ? -Math.PI / 2 : Math.PI, '#FFD66B'); tri(g, w / 2 + 15, 14, 7, e.dy ? Math.PI / 2 : 0, '#FFD66B'); }
        else { g.beginPath(); g.arc(w / 2, 14, 5, 0, TAU); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2); }
      } else if (k === 'c') {
        block(g, w, '#8D9AB5', '#4A5670', '#333E57', 18);
        for (i = 0; i < 2; i++) { g.beginPath(); g.arc(i ? w - 10 : 10, 14, 6, 0, TAU); g.fillStyle = '#D5DCEA'; g.fill(); ol(g, 2); g.beginPath(); g.arc(i ? w - 10 : 10, 14, 1.8, 0, TAU); g.fillStyle = NAVY; g.fill(); }
      } else if (k === 'v') {
        n = Math.max(3, Math.round(w / 21)); list = [];
        for (i = 0; i < n; i++) list.push([10 + (w - 20) * i / (n - 1) + 4, 9 + (i % 2) * 3, 14 + (i * 7 % 3) * 1.5]);
        g.strokeStyle = NAVY; g.lineWidth = 6;
        for (i = 0; i < n; i++) { g.beginPath(); g.arc(list[i][0], list[i][1], list[i][2], 0, TAU); g.stroke(); }
        g.fillStyle = '#C9DDF2';
        for (i = 0; i < n; i++) { g.beginPath(); g.arc(list[i][0], list[i][1] + 2, list[i][2], 0, TAU); g.fill(); }
        g.fillStyle = '#FFFFFF';
        for (i = 0; i < n; i++) { g.beginPath(); g.arc(list[i][0], list[i][1] - 2.5, list[i][2] - 1.5, 0, TAU); g.fill(); }
      } else if (k === 'b') {
        rr(g, 5, 26, w - 2, 9, 4); g.fillStyle = '#56617A'; g.fill(); ol(g, 3);
        g.beginPath(); g.moveTo(w / 2 - 9, 26); g.lineTo(w / 2 + 17, 21); g.lineTo(w / 2 - 9, 16); g.lineTo(w / 2 + 17, 11); g.lineTo(w / 2 + 4, 8);
        g.strokeStyle = NAVY; g.lineWidth = 7; g.stroke(); g.strokeStyle = '#D5DCEA'; g.lineWidth = 3; g.stroke();
        rr(g, 0, -5, w + 8, 14, 7); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 3);
        g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 3; g.beginPath(); g.moveTo(9, -0.5); g.lineTo(w - 1, -0.5); g.stroke();
      }
    });
  }
  function ballSprite() {   // the heavy ball that swings on a chain
    return spr('ball', 64, 64, function (g) {
      var i, a;
      g.translate(32, 32);
      for (i = 0; i < 8; i++) { a = i * TAU / 8; poly(g, [Math.cos(a) * 29, Math.sin(a) * 29, Math.cos(a + 0.3) * 17, Math.sin(a + 0.3) * 17, Math.cos(a - 0.3) * 17, Math.sin(a - 0.3) * 17]); g.fillStyle = '#C9D3E6'; g.fill(); ol(g, 2.5); }
      g.beginPath(); g.arc(0, 0, 19, 0, TAU); g.fillStyle = '#5B6785'; g.fill(); ol(g, 3);
      g.beginPath(); g.arc(-6, -7, 6, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(-6, 1, 4.5, 0, TAU); g.arc(6, 1, 4.5, 0, TAU); g.fill();
      g.fillStyle = NAVY; g.beginPath(); g.arc(-5, 2, 2, 0, TAU); g.arc(5, 2, 2, 0, TAU); g.fill();
      g.strokeStyle = NAVY; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-11, -5); g.lineTo(-3, -2); g.moveTo(11, -5); g.lineTo(3, -2); g.stroke();
    });
  }
  function spikySprite() {  // the red spiky that walks up and down
    return spr('spiky', 52, 52, function (g) {
      var i, a;
      g.translate(26, 26);
      g.beginPath();
      for (i = 0; i < 20; i++) { a = i * TAU / 20; g.lineTo(Math.cos(a) * (i % 2 ? 13 : 22), Math.sin(a) * (i % 2 ? 13 : 22)); }
      g.closePath(); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 3);
      g.beginPath(); g.arc(-4, -5, 5, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(-5, 0, 4.2, 0, TAU); g.arc(5, 0, 4.2, 0, TAU); g.fill();
      g.fillStyle = NAVY; g.beginPath(); g.arc(-4.5, 1, 1.9, 0, TAU); g.arc(4.5, 1, 1.9, 0, TAU); g.fill();
    });
  }
  function trophySprite() {
    return spr('trophy', 64, 72, function (g) {
      g.translate(32, 70);
      rr(g, -17, -10, 34, 10, 3); g.fillStyle = '#A05A2C'; g.fill(); ol(g, 3);
      g.beginPath(); g.rect(-5, -24, 10, 15); g.fillStyle = '#F2B94B'; g.fill(); ol(g, 3);
      g.beginPath(); g.moveTo(-19, -56); g.lineTo(19, -56); g.quadraticCurveTo(18, -26, 0, -22); g.quadraticCurveTo(-18, -26, -19, -56); g.closePath(); g.fillStyle = '#FFD23F'; g.fill(); ol(g, 3);
      g.strokeStyle = NAVY; g.lineWidth = 3; g.beginPath(); g.arc(-22, -45, 7, 0.5 * Math.PI, 1.6 * Math.PI); g.stroke(); g.beginPath(); g.arc(22, -45, 7, 1.4 * Math.PI, 0.5 * Math.PI); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(-9, -44, 3, 9, 0.15, 0, TAU); g.fill();
      star(g, 2, -41, 8); g.fillStyle = '#fff'; g.fill(); ol(g, 2);
    });
  }
  function cloudSprite(k) {
    return spr('cloud' + k, 190, 80, function (g) {
      var L = [[[40, 50, 24], [72, 38, 30], [110, 44, 26], [140, 52, 20]], [[36, 52, 20], [62, 42, 26], [96, 34, 30], [130, 46, 24], [156, 54, 16]], [[50, 48, 26], [88, 42, 28], [124, 50, 22]]][k], i;
      g.fillStyle = 'rgba(150,190,230,0.55)';
      for (i = 0; i < L.length; i++) { g.beginPath(); g.arc(L[i][0], L[i][1] + 6, L[i][2], 0, TAU); g.fill(); }
      g.fillStyle = '#fff';
      for (i = 0; i < L.length; i++) { g.beginPath(); g.arc(L[i][0], L[i][1], L[i][2], 0, TAU); g.fill(); }
    });
  }
  // the land far below: two rows of hills and the little houses of the town
  function farSprite(hard) {
    return spr('far' + (hard ? 1 : 0), 800, 240, function (g) {
      var x, i, y, s, ROOF = ['#E0447F', '#F08A24', '#3B5BDB', '#37B24D', '#C92A2A', '#6C4BD8'];
      function h1(x) { return 74 + Math.sin(x * TAU / 400) * 20 + Math.sin(x * TAU / 160 + 1) * 9; }
      function h2(x) { return 122 + Math.sin(x * TAU / 800 * 3 + 2) * 16 + Math.sin(x * TAU / 200) * 7; }
      g.fillStyle = hard ? '#C08FC4' : '#B5E3C0'; g.beginPath(); g.moveTo(0, 240); for (x = 0; x <= 800; x += 16) g.lineTo(x, h1(x)); g.lineTo(800, 240); g.closePath(); g.fill();
      g.fillStyle = hard ? '#9A6DB5' : '#8ED6A0'; g.beginPath(); g.moveTo(0, 240); for (x = 0; x <= 800; x += 16) g.lineTo(x, h2(x)); g.lineTo(800, 240); g.closePath(); g.fill();
      for (i = 0; i < 26; i++) {      // trees
        x = rnd(i + 5) * 800; y = h2(x) + 6 + rnd(i + 60) * 70; s = 5 + rnd(i + 90) * 5;
        g.fillStyle = hard ? '#7B4F9C' : '#5DBB72'; g.beginPath(); g.arc(x, y, s, 0, TAU); g.arc(x + s * 0.8, y + 2, s * 0.8, 0, TAU); g.fill();
      }
      for (i = 0; i < 15; i++) {      // houses
        x = 20 + i * 52 + rnd(i) * 22; y = h2(x) + 14 + rnd(i + 40) * 52; s = 13 + rnd(i + 9) * 9;
        g.fillStyle = 'rgba(27,42,73,0.16)'; g.fillRect(x + 3, y - s * 0.7 + 3, s, s * 0.7);
        g.fillStyle = hard ? '#F3DDE6' : '#FFF6E0'; g.fillRect(x, y - s * 0.7, s, s * 0.7);
        g.fillStyle = shade(ROOF[i % ROOF.length], hard ? -0.15 : 0); poly(g, [x - 3, y - s * 0.7, x + s / 2, y - s * 1.25, x + s + 3, y - s * 0.7]); g.fill();
        g.fillStyle = hard ? '#FFD66B' : '#6FA8DC'; g.fillRect(x + s * 0.3, y - s * 0.48, s * 0.25, s * 0.25);
      }
      g.fillStyle = hard ? 'rgba(245,160,150,0.22)' : 'rgba(205,239,255,0.28)'; g.fillRect(0, 0, 800, 240);   // haze: it is far away
    });
  }
  function wallSprite(tw) {
    return spr('wall' + tw.id, TX1 - TX0, 240, function (g) {
      var w = TX1 - TX0, base = tw.def.wall, y, x, row = 0, gr;
      g.fillStyle = base; g.fillRect(0, 0, w, 240);
      for (y = 0; y < 240; y += 30, row++) {
        for (x = (row % 2) * 32 - 64; x < w; x += 64) {
          if (rnd(x * 0.37 + row * 9.1) > 0.72) { g.fillStyle = rnd(x + row) > 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(27,42,73,0.07)'; g.fillRect(x + 2, y + 2, 60, 26); }
        }
      }
      g.strokeStyle = shade(base, -0.17); g.lineWidth = 2; g.beginPath(); row = 0;
      for (y = 0; y < 240; y += 30, row++) {
        g.moveTo(0, y + 1); g.lineTo(w, y + 1);
        for (x = (row % 2) * 32; x < w; x += 64) { g.moveTo(x, y + 1); g.lineTo(x, y + 31); }
      }
      g.stroke();
      gr = g.createLinearGradient(0, 0, w, 0);   // the tower is round: light on the left, shade on the right
      gr.addColorStop(0, 'rgba(255,255,255,0.05)'); gr.addColorStop(0.22, 'rgba(255,255,255,0.20)'); gr.addColorStop(0.55, 'rgba(27,42,73,0.03)'); gr.addColorStop(1, 'rgba(27,42,73,0.40)');
      g.fillStyle = gr; g.fillRect(0, 0, w, 240);
    });
  }
  function windowSprite(tw) {
    return spr('win' + tw.id, 64, 96, function (g) {
      function arch(x, y, w, h) { g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); }
      arch(4, 4, 56, 80); g.fillStyle = shade(tw.def.wall, 0.35); g.fill(); ol(g, 3.5);
      arch(11, 11, 42, 73); g.fillStyle = tw.id === 'hard' ? '#3A2F6B' : '#3F6FA8'; g.fill(); ol(g, 3);
      g.save(); arch(11, 11, 42, 73); g.clip();
      g.fillStyle = 'rgba(255,255,255,0.22)'; poly(g, [8, 60, 34, 8, 44, 8, 18, 60]); g.fill();
      g.fillStyle = tw.id === 'hard' ? 'rgba(255,214,107,0.5)' : 'rgba(255,255,255,0.12)'; g.fillRect(11, 62, 42, 22);
      g.restore();
      g.strokeStyle = NAVY; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 12); g.lineTo(32, 84); g.moveTo(11, 46); g.lineTo(53, 46); g.stroke();
      rr(g, 1, 82, 62, 10, 3); g.fillStyle = shade(tw.def.wall, 0.35); g.fill(); ol(g, 3);
    });
  }
  function doorSprite(tw) {
    return spr('door' + tw.id, 100, 130, function (g) {
      function arch(x, y, w, h) { g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); }
      arch(4, 4, 92, 124); g.fillStyle = shade(tw.def.wall, 0.35); g.fill(); ol(g, 4);
      arch(14, 14, 72, 114); g.fillStyle = '#A05A2C'; g.fill(); ol(g, 3.5);
      g.strokeStyle = 'rgba(27,42,73,0.35)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(32, 22); g.lineTo(32, 128); g.moveTo(50, 14); g.lineTo(50, 128); g.moveTo(68, 22); g.lineTo(68, 128); g.stroke();
      g.beginPath(); g.arc(72, 82, 5, 0, TAU); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2.5);
    });
  }
  function signSprite() {   // by the door: you can jump once more in the air
    return spr('sign', 96, 60, function (g) {
      function arrow(x) { poly(g, [x, 12, x + 13, 28, x + 5, 28, x + 5, 46, x - 5, 46, x - 5, 28, x - 13, 28]); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2.5); }
      rr(g, 3, 3, 90, 54, 12); g.fillStyle = '#FFF3D6'; g.fill(); ol(g, 3.5);
      arrow(26); arrow(70);
      g.strokeStyle = NAVY; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(42, 30); g.lineTo(54, 30); g.moveTo(48, 24); g.lineTo(48, 36); g.stroke();
    });
  }
  function sunSprite(hard) {
    return spr('sun' + (hard ? 1 : 0), 160, 160, function (g) {
      var gr = g.createRadialGradient(80, 80, 20, 80, 80, 80);
      gr.addColorStop(0, hard ? 'rgba(255,190,110,0.75)' : 'rgba(255,246,190,0.8)'); gr.addColorStop(1, 'rgba(255,240,180,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 160, 160);
      g.beginPath(); g.arc(80, 80, 34, 0, TAU); g.fillStyle = hard ? '#FFB45E' : '#FFE680'; g.fill();
      g.beginPath(); g.arc(70, 70, 16, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill();
    });
  }
  function moonSprite() {
    return spr('moon', 100, 100, function (g) {
      g.beginPath(); g.arc(50, 50, 36, 0, TAU); g.fillStyle = '#FFF6D8'; g.fill();
      g.fillStyle = 'rgba(180,170,200,0.45)';
      g.beginPath(); g.arc(38, 40, 8, 0, TAU); g.arc(62, 58, 11, 0, TAU); g.arc(44, 68, 5, 0, TAU); g.fill();
    });
  }

  // ---------- state of the screen ----------
  var root = null, cv = null, c = null, els = {};
  var cw = 800, ch = 480, dpr = 1, S = 1, ox = 0, vh = 480;
  var gap = 134;                   // grass shown under the ground line (world units): the touch buttons must not cover the player there
  var raf = 0, lastT = 0, tOff = 0;
  var mode = null;                 // null = closed, 'lobby', 'run', 'done'
  var info = null;                 // what the server told us: { towers, me, lb, who }
  var tw = null, st = null, run = null;
  var cam = { y: 0 };
  var others = {};                 // id -> { x, y, tx, ty, f, m, seen }
  var parts = [], pops = [], tags = [];
  var bounced = {};                // bounce pad index -> when it was last used (seconds), for the squash
  var squash = 0, deaths = 0, flash = 0;
  var touch = { id: null, dir: 0, jumps: {}, n: 0, mid: 106 };
  var hud = { flag: '', time: '', l: false, r: false, j: false };
  var clouds = [], lobbyHtml = '';
  var actx = null;

  // little sounds of our own (jump, bounce, poof); they follow the game's sound switch
  function wake() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!actx && AC) actx = new AC();
      if (actx && actx.state === 'suspended' && actx.resume) actx.resume();
    } catch (e) {}
  }
  function beep(f0, f1, d, v, type) {
    try {
      if (!window.Sfx || typeof window.Sfx.mode !== 'function' || window.Sfx.mode() === 0) return;
      wake();
      if (!actx) return;
      var t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.03);
    } catch (e) {}
  }

  var ARROW = '<svg viewBox="0 0 24 24" width="46%" height="46%" aria-hidden="true"><path d="M17 3 L5 12 L17 21 Z" fill="#1B2A49" stroke="#1B2A49" stroke-width="2.5" stroke-linejoin="round"/></svg>';
  var CSS = [
    '.obby-root{background:#8ED8F8;overflow:hidden;touch-action:none;color:#1B2A49}',
    '.obby-cv{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none}',
    '.obby-top{position:absolute;left:10px;top:10px;right:10px;display:flex;gap:8px;align-items:center;pointer-events:none}',
    '.obby-top>*{pointer-events:auto;flex:none}',
    '.obby-top .btn{height:50px;font-size:18px;padding:0 16px;border-width:3px;white-space:nowrap}',
    '.obby-ttl{flex:0 1 auto;min-width:0;font-size:19px;font-weight:600;background:#FFF3D6;border:3px solid #1B2A49;border-radius:999px;padding:0 18px;height:50px;line-height:44px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.obby-pill{height:50px;display:flex;align-items:center;gap:6px;padding:0 16px;border-radius:999px;border:3px solid #1B2A49;background:#fff;font-size:22px;font-weight:700;white-space:nowrap;pointer-events:none}',
    '.obby-pill.dark{background:#1B2A49;color:#fff;border-color:#fff;min-width:128px}',
    '.obby-lobby{position:absolute;left:0;right:0;top:68px;bottom:0;display:grid;grid-template-columns:repeat(2,minmax(0,540px));grid-template-rows:fit-content(100%);gap:12px;padding:4px 12px 16px;align-content:center;justify-content:center}',
    '.obby-card{min-width:0;min-height:0;overflow-y:auto;touch-action:pan-y;background:#FFF3D6;border:4px solid #1B2A49;border-radius:26px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;box-shadow:0 7px 0 rgba(27,42,73,.25)}',
    '.obby-wait{grid-column:1 / 3;justify-self:center;font-size:22px;font-weight:600;text-align:center}',
    '.obby-ch{display:flex;align-items:center;gap:10px}',
    '.obby-ico{flex:none;width:46px;height:62px}',
    '.obby-nm{font-size:17px;font-weight:600;line-height:1.25}',
    '.obby-nm b{font-size:23px;display:block}',
    '.obby-prog{display:flex;align-items:center;gap:8px;font-size:18px;font-weight:700}',
    '.obby-flags{flex:1;min-width:0;display:flex;gap:3px}',
    '.obby-flags i{flex:1 1 0;height:16px;border-radius:5px;border:2px solid #1B2A49;background:#fff}',
    '.obby-flags i.on{background:#58C06B}',
    '.obby-flags i.top.on{background:#FFD23F}',
    '.obby-row{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:17px;font-weight:600;flex-wrap:wrap}',
    '.obby-row b{font-size:21px}',
    '.obby-rew{display:flex;gap:6px;flex-wrap:wrap}',
    '.obby-rew span{background:#fff;border:2px solid #1B2A49;border-radius:999px;padding:1px 10px;white-space:nowrap}',
    '.obby-lb{background:#fff;border:3px solid #1B2A49;border-radius:16px;padding:6px 10px;font-size:16px;font-weight:600}',
    '.obby-lbh{font-size:15px;font-weight:700;margin-bottom:2px}',
    '.obby-lb ol{list-style:none;margin:0;padding:0}',
    '.obby-lb li{display:flex;gap:8px;align-items:center;line-height:1.45}',
    '.obby-lb li b{flex:none;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:#1B2A49;color:#fff;font-size:13px}',
    '.obby-lb li:first-child b{background:#FFD23F;color:#1B2A49}',
    '.obby-lb li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.obby-lb li em{font-style:normal;font-weight:700}',
    '.obby-lb li.me span{text-decoration:underline}',
    '.obby-lb li.none{font-weight:500;opacity:.75}',
    '.obby-now{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:15px;font-weight:600}',
    '.obby-now span{display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #1B2A49;border-radius:999px;padding:1px 10px 1px 4px;white-space:nowrap}',
    '.obby-now i{width:18px;height:18px;border-radius:6px;border:2px solid #1B2A49}',
    '.obby-btns{display:flex;gap:8px;margin-top:auto}',
    '.obby-btns .btn{flex:1 1 0;min-width:0;padding:0 8px;font-size:19px;white-space:nowrap}',
    '.obby-keys{position:absolute;left:0;right:0;bottom:0;height:0;pointer-events:none}',
    '.obby-key{position:absolute;bottom:16px;width:86px;height:86px;border-radius:50%;border:4px solid #1B2A49;background:rgba(255,255,255,.7);display:flex;align-items:center;justify-content:center}',
    '.obby-key.l{left:14px}',
    '.obby-key.r{left:112px}',
    '.obby-key.r svg{transform:scaleX(-1)}',
    '.obby-key.j{right:16px;width:112px;height:112px;background:rgba(255,214,107,.82)}',
    '.obby-key.j svg{transform:rotate(90deg)}',
    '.obby-key.on{background:#FFD66B;transform:scale(.93)}',
    '.obby-key.j.on{background:#FFB020}',
    '.obby-done{position:absolute;left:0;right:0;top:66px;display:flex;justify-content:center;pointer-events:none;padding:0 12px}',
    '.obby-dc{pointer-events:auto;background:#FFF3D6;border:4px solid #1B2A49;border-radius:26px;padding:10px 22px 12px;text-align:center;display:flex;flex-direction:column;gap:4px;align-items:center;min-width:300px;max-width:100%;box-shadow:0 7px 0 rgba(27,42,73,.25);animation:ftPop .3s ease-out}',
    '.obby-dt{font-size:28px;font-weight:700;line-height:1.1}',
    '.obby-dn{font-size:16px;font-weight:600}',
    '.obby-dtime{font-size:38px;font-weight:700;line-height:1.1}',
    '.obby-dx{font-size:18px;font-weight:600;min-height:22px}',
    '.obby-ds{font-size:24px;font-weight:700;background:#FFD66B;border:3px solid #1B2A49;border-radius:999px;padding:0 16px}',
    '.obby-dc .obby-btns{margin-top:6px;align-self:stretch}',
    '@media (max-width:900px),(max-height:560px){.obby-top .btn{font-size:16px;padding:0 12px}.obby-ttl{font-size:16px;padding:0 12px}.obby-pill{font-size:19px;padding:0 12px}.obby-pill.dark{min-width:112px}' +
      '.obby-card{padding:9px 11px;gap:6px;border-radius:22px}.obby-nm{font-size:15px}.obby-nm b{font-size:20px}.obby-row{font-size:15px}.obby-row b{font-size:18px}.obby-lb{font-size:15px;padding:4px 9px}' +
      '.obby-btns .btn{font-size:17px;height:52px}.obby-key{width:78px;height:78px}.obby-key.r{left:102px}.obby-key.j{width:100px;height:100px}' +
      '.obby-dt{font-size:23px}.obby-dtime{font-size:30px}.obby-ds{font-size:20px}.obby-dx{font-size:16px}}'
  ].join('\n');

  // ---------- opening and closing ----------
  function open() {
    if (root) return;
    if (!document.getElementById('obby-style')) { var s = document.createElement('style'); s.id = 'obby-style'; s.textContent = CSS; document.head.appendChild(s); }
    root = document.createElement('div'); root.className = 'screen obby-root';
    root.innerHTML = '<canvas class="obby-cv" aria-label="Obby Tower"></canvas>' +
      '<div class="obby-top"><button class="btn obby-back" type="button" data-quiet>Back to town</button>' +
      '<button class="btn obby-menu" type="button" hidden>🗼 Towers</button>' +
      '<div class="obby-ttl">' + api.three(NAME) + '</div>' +
      '<div class="obby-pill obby-pf" hidden></div><div class="obby-pill dark obby-pt" hidden></div></div>' +
      '<div class="obby-lobby"></div>' +
      '<div class="obby-keys" hidden><div class="obby-key l">' + ARROW + '</div><div class="obby-key r">' + ARROW + '</div><div class="obby-key j">' + ARROW + '</div></div>' +
      '<div class="obby-done" hidden></div>';
    document.body.appendChild(root);
    cv = root.querySelector('.obby-cv'); c = cv.getContext('2d');
    els = { back: root.querySelector('.obby-back'), menu: root.querySelector('.obby-menu'), ttl: root.querySelector('.obby-ttl'), pf: root.querySelector('.obby-pf'), pt: root.querySelector('.obby-pt'),
      lobby: root.querySelector('.obby-lobby'), keys: root.querySelector('.obby-keys'), kl: root.querySelector('.obby-key.l'), kr: root.querySelector('.obby-key.r'), kj: root.querySelector('.obby-key.j'), done: root.querySelector('.obby-done') };
    els.back.onclick = close;
    els.menu.onclick = function () { els.menu.blur(); toLobby(); };
    els.lobby.addEventListener('click', onLobbyClick);
    els.done.addEventListener('click', onDoneClick);
    cv.addEventListener('pointerdown', pDown); cv.addEventListener('pointermove', pMove); cv.addEventListener('pointerup', pUp); cv.addEventListener('pointercancel', pUp);
    window.addEventListener('resize', resize); window.addEventListener('blur', dropTouch);
    window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKey, true);
    info = null; run = null; st = null; others = {}; parts = []; pops = []; deaths = 0; lobbyHtml = '';
    tw = tower('easy'); makeClouds();
    setMode('lobby');
    resize();
    cam.y = gap - vh;
    lastT = 0;
    raf = requestAnimationFrame(frame);
    api.enter('obby');
  }
  function close() {
    if (!root) return;
    cancelAnimationFrame(raf); raf = 0;
    window.removeEventListener('resize', resize); window.removeEventListener('blur', dropTouch);
    window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true);
    if (root.parentNode) root.parentNode.removeChild(root);
    root = null; cv = null; c = null; els = {}; mode = null; run = null; st = null; others = {}; parts = []; pops = [];
    sprites = {}; spriteCount = 0;
    dropTouch();
    api.sfx('close');
    api.leave();     // the server ends the climb; the flags reached stay saved
  }
  function resize() {
    if (!root) return;
    cw = Math.max(200, root.clientWidth); ch = Math.max(160, root.clientHeight);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    S = Math.min(cw / W, ch / 400); ox = (cw - W * S) / 2; vh = ch / S; gap = 134 / S;
    var res = Math.max(0.75, Math.min(2.5, Math.ceil(S * dpr * 4) / 4));
    if (res !== RES) { RES = res; sprites = {}; spriteCount = 0; }
    var r = els.kr && els.kr.getBoundingClientRect();
    if (r && r.width) touch.mid = r.left - 6;
  }
  function setMode(m) {
    mode = m;
    els.lobby.hidden = m !== 'lobby';
    els.ttl.hidden = m !== 'lobby';
    els.menu.hidden = m === 'lobby';
    els.keys.hidden = m === 'lobby';
    els.pf.hidden = m === 'lobby';
    els.pt.hidden = m === 'lobby' || !run || !run.timed;
    els.done.hidden = m !== 'done';
    hud.flag = hud.time = '';
    dropTouch();
    if (m === 'lobby') renderLobby();
    resize();
  }
  function toLobby() {
    if (run) api.send({ t: 'obby.quit' });
    run = null; st = null; others = {};
    setMode('lobby');
  }

  // ---------- the entrance: pick a tower ----------
  function renderLobby() {
    if (!root || mode !== 'lobby') return;
    var html = info ? cardHtml('easy') + cardHtml('hard') : '<div class="obby-card obby-wait">Opening the tower…</div>', list, i;
    if (html === lobbyHtml) return;      // nothing changed: leave the buttons alone
    lobbyHtml = html;
    els.lobby.innerHTML = html;
    list = els.lobby.querySelectorAll('canvas');
    for (i = 0; i < list.length; i++) drawIcon(list[i], list[i].getAttribute('data-ico'));
  }
  function cardHtml(id) {
    var cfg = info.towers[id] || { stages: 12, flag: 1, first: 10, again: 3 }, d = (info.me && info.me[id]) || { top: 0, cur: 0, best: 0, fin: 0, left: 0 };
    var n = cfg.stages, i, flags = '', rows = '', now = '', rew = '', btns, lb = (info.lb && info.lb[id]) || [], who = info.who || [], pl = api.players(), me = api.self(), p;
    for (i = 1; i <= n; i++) flags += '<i class="' + (i <= d.top ? 'on' : '') + (i === n ? ' top' : '') + '"></i>';
    for (i = 0; i < lb.length; i++) rows += '<li' + (me && lb[i].name === me.name ? ' class="me"' : '') + '><b>' + (i + 1) + '</b><span>' + api.esc(lb[i].name) + '</span><em>' + medal(id, lb[i].ms) + ' ' + fmt(lb[i].ms) + '</em></li>';
    if (!rows) rows = '<li class="none">No times yet. Be the first!</li>';
    for (i = 0; i < who.length; i++) {
      p = pl[who[i][0]];
      if (p && who[i][1] === id) now += '<span><i style="background:' + api.esc(p.color) + '"></i>' + api.esc(p.name) + ' ' + (who[i][3] ? '🏆' : '🚩' + who[i][2]) + '</span>';
    }
    if (d.top < n - 1) rew += '<span>🚩 +' + cfg.flag + ' ⭐</span>';
    if (!d.fin) rew += '<span>🏆 +' + cfg.first + ' ⭐</span>';
    else if (d.left > 0) rew += '<span>🏆 +' + cfg.again + ' ⭐ · ' + d.left + ' left today</span>';
    else rew += '<span>🏆 ✔ today</span>';
    if (d.cur > 0) btns = '<button class="btn primary" type="button" data-go="' + id + '" data-from="' + d.cur + '">▶ Go on 🚩' + d.cur + '</button><button class="btn" type="button" data-go="' + id + '" data-from="0">⏱ New run</button>';
    else btns = '<button class="btn primary" type="button" data-go="' + id + '" data-from="0">⏱ Start</button>';
    return '<div class="obby-card"><div class="obby-ch"><canvas class="obby-ico" width="92" height="124" data-ico="' + id + '"></canvas><div class="obby-nm">' + api.three(TOWER_NAME[id]) + '</div></div>' +
      '<div class="obby-prog"><span>🚩</span><span class="obby-flags">' + flags + '</span><span>' + d.top + '/' + n + '</span></div>' +
      '<div class="obby-row"><span>⏱ <b>' + (d.best ? fmt(d.best) + ' ' + medal(id, d.best) : '–:––') + '</b></span><span class="obby-rew">' + rew + '</span></div>' +
      '<div class="obby-lb"><div class="obby-lbh">🏆 Family best times</div><ol>' + rows + '</ol></div>' +
      (now ? '<div class="obby-now">🧗 ' + now + '</div>' : '') +
      '<div class="obby-btns">' + btns + '</div></div>';
  }
  function drawIcon(cnv, id) {       // a little picture of the tower for its card
    var g = cnv.getContext('2d'), def = TOWERS[id], i;
    g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, 46, 62); g.lineJoin = 'round';
    g.beginPath(); g.rect(12, 20, 22, 40); g.fillStyle = def.wall; g.fill(); ol(g, 2.5);
    g.fillStyle = 'rgba(27,42,73,0.22)'; g.fillRect(27, 21, 6, 38);
    poly(g, [7, 21, 23, 4, 39, 21]); g.fillStyle = def.trim; g.fill(); ol(g, 2.5);
    g.strokeStyle = NAVY; g.lineWidth = 2; g.beginPath(); g.moveTo(23, 4); g.lineTo(23, -2); g.stroke();
    for (i = 0; i < 3; i++) { rr(g, i % 2 ? 26 : 3, 50 - i * 12, 17, 6, 2); g.fillStyle = def.cols[i * 2]; g.fill(); ol(g, 2); }
  }
  function onLobbyClick(e) {
    var el = e.target;
    while (el && el !== els.lobby && !(el.getAttribute && el.getAttribute('data-go'))) el = el.parentNode;
    if (!el || el === els.lobby) return;
    if (el.blur) el.blur();
    api.send({ t: 'obby.start', tower: el.getAttribute('data-go'), from: parseInt(el.getAttribute('data-from'), 10) || 0 });
  }
  function onDoneClick(e) {
    var el = e.target;
    while (el && el !== els.done && !(el.getAttribute && el.getAttribute('data-act'))) el = el.parentNode;
    if (!el || el === els.done || !run) return;
    if (el.blur) el.blur();
    if (el.getAttribute('data-act') === 'again') api.send({ t: 'obby.start', tower: run.tower, from: 0 });
    else toLobby();
  }

  // ---------- a climb ----------
  function now() { return window.performance && performance.now ? performance.now() : Date.now(); }
  function towerTime() { return (now() + tOff) / 1000; }
  function camTarget() { return Math.min(st.y - vh * 0.57, gap - vh); }
  function beginRun(m) {
    var id = m.tower === 'hard' ? 'hard' : 'easy';
    if (m.keep && run && run.tower === id && st) {   // the server lost our climb (a long break): it goes on from the last flag it knows
      run.acked = m.flag; run.timed = !!m.timed; run.t0 = 0; run.go = false;
      els.pt.hidden = !run.timed || mode === 'lobby';
      return;
    }
    tw = tower(id); makeClouds();
    st = newState(); st.cp = clamp(parseInt(m.flag, 10) || 0, 0, tw.n - 1); st.T = towerTime(); spawn(tw, st);
    run = { tower: id, from: st.cp, timed: !!m.timed, acked: st.cp, t0: 0, go: false, endMs: 0, lastClaim: 0, lastPos: 0, lastSync: 0, result: null };
    others = {}; parts = []; pops = []; bounced = {}; squash = 0; deaths = 0;
    setMode('run');
    cam.y = camTarget();
    api.sfx('open');
  }
  function resync() {   // the server does not know our climb any more
    if (!run || now() - run.lastSync < 2000) return;
    run.lastSync = now();
    api.send({ t: 'obby.start', tower: run.tower, from: run.acked, keep: 1 });
  }
  function readInput() {
    var k = api.keys(), ax = (k.arrowright || k.d ? 1 : 0) - (k.arrowleft || k.a ? 1 : 0), jump = !!(k[' '] || k.spacebar || k.arrowup || k.w);
    if (touch.id !== null) ax = touch.dir;
    if (touch.n > 0) jump = true;
    return { ax: ax, jump: jump };
  }
  function pop(txt, bg, up) { if (st) pops.push({ x: st.x, y: st.y - 58 - (up || 0), txt: txt, life: 0, bg: bg || '#FFD66B' }); }
  function puff(x, y, n, col, spd, kind) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, v = spd * (0.4 + Math.random() * 0.6);
      parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * 0.3, life: 0, max: 0.35 + Math.random() * 0.35, r: 2.5 + Math.random() * 3.5, col: col, k: kind || 0, rot: Math.random() * 6 });
    }
    if (parts.length > 160) parts.splice(0, parts.length - 160);
  }
  function confetti() {
    var COL = ['#FF4F6D', '#FFC933', '#5ED6C4', '#9B6BFF', '#5AA9FF', '#FF8FB8'], i;
    for (i = 0; i < 70; i++) parts.push({ x: Math.random() * W, y: cam.y - 20 - Math.random() * 260, vx: (Math.random() - 0.5) * 80, vy: 90 + Math.random() * 120, life: 0, max: 3.2 + Math.random() * 1.5, r: 4 + Math.random() * 3, col: COL[i % COL.length], k: 2, rot: Math.random() * 6, g: 0 });
  }
  function onEvents(ev, x0, y0) {
    var F;
    if (ev & EV_DIE) {
      puff(x0, y0 - 20, 14, '#FFFFFF', 150, 0);
      beep(420, 110, 0.28, 0.12, 'triangle');
      deaths++; flash = 0.25; squash = 0;
      spawn(tw, st);
      return;
    }
    if (ev & EV_JUMP) { beep(330, 560, 0.11, 0.07); squash = -0.9; puff(st.x, st.y, 3, 'rgba(255,255,255,0.8)', 50, 0); }
    if (ev & EV_DJUMP) { beep(520, 860, 0.11, 0.07); squash = -0.9; puff(st.x, st.y, 6, '#FFE680', 90, 1); }
    if (ev & EV_BOUNCE) { beep(180, 720, 0.22, 0.1, 'triangle'); squash = -1.3; bounced[st.hit] = towerTime(); }
    else if (ev & EV_LAND) { squash = 0.9; puff(st.x, st.y, 3, 'rgba(255,255,255,0.8)', 55, 0); }
    if (ev & EV_BONK) { beep(150, 90, 0.09, 0.09, 'triangle'); squash = 0.7; puff(st.x, st.y - 34, 4, 'rgba(255,255,255,0.85)', 60, 0); }
    if (ev & EV_FLAG) {
      F = tw.ents[tw.stages[st.cp].fi];
      puff(F.px, F.y - 44, 16, '#FFD23F', 170, 1);
      if (st.cp >= tw.n) finish();
      else { api.sfx('right'); pop('🚩 ' + st.cp + ' / ' + tw.n, '#fff'); }
    }
  }
  function finish() {
    run.endMs = run.timed && run.t0 ? now() - run.t0 : 0; run.falls = deaths;
    api.sfx('tagwin');
    confetti();
    setMode('done');
    renderDone();
  }
  function renderDone() {
    if (!root || !run) return;
    var r = run.result, ms = r ? r.ms : run.endMs, extra = '', stars = '', falls;
    if (r) {
      if (r.newBest) extra = '★ New best time!';
      else if (r.timed && r.best) extra = 'Your best: ' + fmt(r.best);
      if (r.rank) extra += (extra ? ' · ' : '') + '🏆 #' + r.rank + ' in the family';
      if (r.stars) stars = '<div class="obby-ds">+' + r.stars + ' ⭐</div>';
    }
    falls = run.from === 0 || deaths ? '<div class="obby-dx">' + (deaths ? '💥 ' + deaths + (deaths === 1 ? ' fall' : ' falls') : '✨ No falls!') + '</div>' : '';
    els.done.innerHTML = '<div class="obby-dc"><div class="obby-dt">🏆 You reached the top!</div><div class="obby-dn">' + api.three(TOWER_NAME[run.tower]) + '</div>' +
      (ms ? '<div class="obby-dtime">⏱ ' + fmt(ms) + ' ' + medal(run.tower, ms) + '</div>' : '') +
      '<div class="obby-dx">' + (r ? extra : '…') + '</div>' + falls + stars +
      '<div class="obby-btns"><button class="btn primary" type="button" data-act="again"' + (r ? '' : ' disabled') + '>⏱ Again</button><button class="btn" type="button" data-act="lobby"' + (r ? '' : ' disabled') + '>🗼 Towers</button></div></div>';
  }

  // ---------- messages from the server ----------
  function onMessage(m) {
    var i, o, id, list, seen;
    if (!root) return;
    switch (m.t) {
      case 'obby.hello':
        info = { towers: m.towers || {}, me: m.me || {}, lb: m.lb || {}, who: m.who || [] };
        tOff = (+m.now || Date.now()) - EPOCH - now();
        if (st) st.T = towerTime();
        if (run) {           // we are back after a dropped connection
          if (m.run && m.run.tower === run.tower) {
            run.acked = m.run.flag;
            if (run.timed && m.run.el >= 0 && mode === 'run') run.t0 = now() - m.run.el;
          } else resync();
        } else if (m.run && !m.run.fin) api.send({ t: 'obby.quit' });
        renderLobby();
        break;
      case 'obby.me': if (info) { info.me = m; renderLobby(); } break;
      case 'obby.lb': if (info) { info.lb = m.lb || {}; renderLobby(); } break;
      case 'obby.who': if (info) { info.who = m.list || []; renderLobby(); } break;
      case 'obby.run': beginRun(m); break;
      case 'obby.flag':
        if (!run) break;
        if (m.ok) {
          run.acked = m.i; run.lastClaim = 0;
          if (m.stars) { pop('+' + m.stars + ' ⭐', null, 34); api.sfx('star'); }
        } else if (m.none) resync();
        else if (typeof m.i === 'number') run.acked = m.i;
        break;
      case 'obby.done':
        if (!run) break;
        run.acked = m.i; run.result = m;
        if (m.stars) { pop('+' + m.stars + ' ⭐'); api.sfx('star'); }
        if (mode === 'done') renderDone();
        break;
      case 'obby.st':
        if (!run || !Array.isArray(m.p)) break;
        seen = now(); id = api.myId();
        for (i = 0; i < m.p.length; i++) {
          list = m.p[i];
          if (!list || list[0] === id) continue;
          o = others[list[0]];
          if (!o) o = others[list[0]] = { x: list[1], y: list[2], tx: 0, ty: 0, f: 1, m: 0, seen: 0 };
          o.tx = list[1]; o.ty = list[2]; o.f = list[3] < 0 ? -1 : 1; o.m = list[4]; o.seen = seen;
        }
        break;
    }
  }

  // ---------- touch and keys ----------
  function pDown(e) {
    if (mode !== 'run' && mode !== 'done') return;
    wake();
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left;
    if (x < cw * 0.5) { if (touch.id === null) { touch.id = e.pointerId; touch.dir = x < touch.mid ? -1 : 1; } }
    else if (!touch.jumps[e.pointerId]) { touch.jumps[e.pointerId] = 1; touch.n++; }
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    if (e.preventDefault) e.preventDefault();
  }
  function pMove(e) {
    if (e.pointerId !== touch.id) return;
    var r = cv.getBoundingClientRect();
    touch.dir = e.clientX - r.left < touch.mid ? -1 : 1;
  }
  function pUp(e) {
    if (e.pointerId === touch.id) { touch.id = null; touch.dir = 0; }
    if (touch.jumps[e.pointerId]) { delete touch.jumps[e.pointerId]; touch.n = Math.max(0, touch.n - 1); }
  }
  function dropTouch() { touch.id = null; touch.dir = 0; touch.jumps = {}; touch.n = 0; }
  function onKey(e) {   // the space bar and the arrows must not scroll the page or press a button
    if (mode !== 'run' && mode !== 'done') return;
    var k = e.key;
    if (k === ' ' || k === 'Spacebar' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') { if (e.preventDefault) e.preventDefault(); }
  }

  // ---------- every frame ----------
  function frame() {
    if (!root) return;
    raf = requestAnimationFrame(frame);
    var t = now() / 1000, dt = lastT ? Math.min(0.1, t - lastT) : 0.016, T = towerTime(), inp, d, n, i, ev, x0, y0, o, id, txt, cut = now() - 1500;
    lastT = t;
    if (st && run) {
      inp = readInput();
      if (!run.go && (inp.ax || inp.jump) && mode === 'run') {
        run.go = true;
        if (run.timed && !run.t0) { run.t0 = now(); api.send({ t: 'obby.go' }); }
      }
      d = T - st.T;
      if (!(d > 0) || d > 0.25) { st.T = T - 0.016; d = 0.016; }
      if (d > 0.05) { st.T = T - 0.05; d = 0.05; }
      n = Math.ceil(d / 0.0175); d /= n;
      for (i = 0; i < n; i++) {
        x0 = st.x; y0 = st.y;
        step(tw, st, inp, d);
        ev = st.ev;
        if (ev) onEvents(ev, x0, y0);
        if (ev & EV_DIE) break;
      }
      // tell the server where we are, and which flag we stand at (asked again until it says yes)
      if (now() - run.lastPos > 95) {
        run.lastPos = now();
        api.send({ t: 'obby.pos', x: Math.round(st.x), y: Math.round(st.y), f: st.f, m: st.on < 0 ? 2 : Math.abs(st.vx) > 30 ? 1 : 0 });
      }
      if (run.acked < st.cp && now() - run.lastClaim > 600) { run.lastClaim = now(); api.send({ t: 'obby.flag', i: run.acked + 1 }); }
      cam.y += (camTarget() - cam.y) * (1 - Math.exp(-dt * 7));
      squash *= Math.exp(-dt * 9);
      if (flash > 0) flash -= dt;
      // the pills at the top
      txt = '🚩 ' + st.cp + '/' + tw.n;
      if (txt !== hud.flag) { hud.flag = txt; els.pf.textContent = txt; }
      if (run.timed) {
        txt = '⏱ ' + (mode === 'done' ? fmt(run.result ? run.result.ms : run.endMs) : run.t0 ? fmt(now() - run.t0) : '0:00.0');
        if (txt !== hud.time) { hud.time = txt; els.pt.textContent = txt; }
      }
      if ((inp.ax < 0) !== hud.l) { hud.l = inp.ax < 0; els.kl.className = 'obby-key l' + (hud.l ? ' on' : ''); }
      if ((inp.ax > 0) !== hud.r) { hud.r = inp.ax > 0; els.kr.className = 'obby-key r' + (hud.r ? ' on' : ''); }
      if (inp.jump !== hud.j) { hud.j = inp.jump; els.kj.className = 'obby-key j' + (hud.j ? ' on' : ''); }
    } else {
      cam.y += (gap - vh - cam.y) * (1 - Math.exp(-dt * 5));
    }
    for (id in others) {
      o = others[id];
      if (o.seen < cut) { delete others[id]; continue; }
      if (Math.abs(o.tx - o.x) > 220 || Math.abs(o.ty - o.y) > 220) { o.x = o.tx; o.y = o.ty; }
      else { d = 1 - Math.exp(-dt * 14); o.x += (o.tx - o.x) * d; o.y += (o.ty - o.y) * d; }
    }
    for (i = parts.length - 1; i >= 0; i--) {
      o = parts[i]; o.life += dt;
      if (o.life >= o.max) { parts.splice(i, 1); continue; }
      o.vy += (o.g === undefined ? 320 : o.g) * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.rot += dt * 5;
    }
    for (i = pops.length - 1; i >= 0; i--) { o = pops[i]; o.life += dt; o.y -= 34 * dt; if (o.life > 1.5) pops.splice(i, 1); }
    try { draw(t, T); } catch (err) { if (window.console) console.error(err); }
  }

  // ---------- drawing ----------
  function makeClouds() {
    var p, i, n, range, layer;
    clouds = [];
    for (layer = 0; layer < 2; layer++) {
      p = layer ? 0.62 : 0.3; range = tw.height * p + 900; n = Math.ceil(range / (layer ? 85 : 110));
      for (i = 0; i < n; i++) clouds.push({ x: rnd(i * 3.3 + layer * 17) * 1200, y: 300 - rnd(i * 7.7 + layer * 5 + 1) * range, p: p, s: layer ? 0.75 + rnd(i + 2) * 0.5 : 0.4 + rnd(i + 3) * 0.3, v: (layer ? 9 : 4) + rnd(i + 8) * 6, k: i % 3, a: layer ? 0.92 : 0.7 });
    }
  }
  function drawSky(t) {
    var hard = tw.id === 'hard', a = clamp(-(cam.y + vh * 0.6) / tw.height, 0, 1), pal = tw.def.sky, u = a * 2, i = u >= 1 ? 1 : 0, f = Math.min(1, u - i), g, s, x, y, cl, al, fs, fy;
    g = c.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, mix(pal[i][0], pal[i + 1][0], f)); g.addColorStop(1, mix(pal[i][1], pal[i + 1][1], f));
    c.fillStyle = g; c.fillRect(0, 0, cw, ch);
    al = clamp((a - 0.55) / 0.4, 0, 1) * (hard ? 1 : 0.55);     // stars come out near the top
    if (al > 0.02) {
      c.fillStyle = '#fff';
      for (i = 0; i < 36; i++) { c.globalAlpha = al * (0.55 + 0.45 * Math.sin(t * 2 + i * 1.7)); c.beginPath(); c.arc(rnd(i + 1) * cw, rnd(i + 51) * ch * 0.85, 1 + rnd(i + 9) * 1.6, 0, TAU); c.fill(); }
      c.globalAlpha = 1;
    }
    s = sunSprite(hard); x = cw * 0.8; y = ch * (hard ? 0.34 : 0.1) + a * ch * (hard ? 0.9 : 0.35);
    if (y < ch) c.drawImage(s, x - 80 * S, y, 160 * S, 160 * S);
    if (hard && a > 0.35) { c.globalAlpha = clamp((a - 0.35) / 0.25, 0, 1); s = moonSprite(); c.drawImage(s, cw * 0.14, ch * 0.12 + (1 - a) * ch * 0.2, 100 * S, 100 * S); c.globalAlpha = 1; }
    // the land far below sinks slowly as we climb
    fy = ch - (240 + gap - 70) * S + (gap - (cam.y + vh)) * 0.045 * S;
    if (fy < ch) { fs = farSprite(hard); for (x = ox % (W * S) - W * S; x < cw; x += W * S) c.drawImage(fs, x, fy, W * S, 240 * S); }
    for (i = 0; i < clouds.length; i++) {
      cl = clouds[i];
      y = ch * 0.5 + (cl.y - (cam.y + vh * 0.5) * cl.p) * S;
      if (y < -90 * S || y > ch) continue;
      x = (cl.x + t * cl.v) % 1200 - 200;
      s = cloudSprite(cl.k); c.globalAlpha = cl.a; c.drawImage(s, ox + x * S, y, s.lw * cl.s * S, s.lh * cl.s * S);
    }
    c.globalAlpha = 1;
  }
  function drawWall(y0, y1) {
    var top = tw.top - 150, a = Math.max(y0, top), b = Math.min(y1, 2), s, ty, i, stg, x, col = shade(tw.def.wall, 0.35);
    if (b <= a) return;
    s = wallSprite(tw);
    c.save(); c.beginPath(); c.rect(TX0, a, TX1 - TX0, b - a); c.clip();
    for (ty = Math.floor(a / 240) * 240; ty < b; ty += 240) c.drawImage(s, TX0, ty, s.lw, s.lh + 0.5);
    c.restore();
    c.strokeStyle = NAVY; c.lineWidth = 4; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(TX0, a); c.lineTo(TX0, b); c.moveTo(TX1, a); c.lineTo(TX1, b); c.stroke();
    for (i = 0; i <= tw.n; i++) {
      stg = tw.stages[i];
      if (stg.base + 50 < y0 || stg.base - stg.h - 20 > y1) continue;
      if (i > 0) {   // a ring round the tower where a stage begins
        c.beginPath(); c.rect(TX0 - 7, stg.base + 30, TX1 - TX0 + 14, 11); c.fillStyle = tw.def.trim; c.fill(); ol(c, 3);
        c.fillStyle = 'rgba(27,42,73,0.25)'; c.fillRect(TX0 + (TX1 - TX0) * 0.62, stg.base + 31.5, (TX1 - TX0) * 0.38 + 5.5, 8);
      }
      if (stg.h > 200) { s = windowSprite(tw); x = TX0 + 40 + rnd(i * 3.7 + tw.n) * (TX1 - TX0 - 150); c.drawImage(s, x, stg.base - stg.h * 0.5 - 60, s.lw, s.lh); }
    }
    if (top + 60 > y0) {   // the battlements at the very top
      c.fillStyle = col;
      for (x = TX0 - 8; x < TX1; x += 74.5) { c.beginPath(); c.rect(x, top - 28, 44, 34); c.fill(); ol(c, 3.5); }
      c.beginPath(); c.rect(TX0 - 12, top, TX1 - TX0 + 24, 14); c.fill(); ol(c, 3.5);
    }
    if (y1 > -170) { s = doorSprite(tw); c.drawImage(s, W / 2 - 50, -128, s.lw, s.lh); s = signSprite(); c.drawImage(s, TX0 + 26, -158, s.lw, s.lh); }
  }
  function drawGround(y1) {
    var i, x;
    if (y1 < -8) return;
    c.fillStyle = '#5DBB72'; c.fillRect(-3000, 5, 6800, y1 + 40);
    c.fillStyle = 'rgba(27,42,73,0.10)'; c.fillRect(-3000, 30, 6800, y1 + 20);
    c.fillStyle = '#8FE09C'; c.fillRect(-3000, -5, 6800, 10);
    c.strokeStyle = NAVY; c.lineWidth = 3; c.beginPath(); c.moveTo(-3000, -5); c.lineTo(3800, -5); c.moveTo(-3000, 5); c.lineTo(3800, 5); c.stroke();
    c.fillStyle = '#8FE09C';
    for (i = 0; i < 26; i++) { x = rnd(i + 3) * 800; c.beginPath(); c.arc(x, 5, 6 + rnd(i) * 4, 0, Math.PI); c.fill(); }
  }
  // pass 0: wind and shadows on the wall · pass 1: platforms and lava · pass 2: things that hurt, flags
  function drawStage(stg, pass, T, t) {
    var list = stg.list, ents = tw.ents, i, e, k, x, y, s, a, j, n, u, d, v, dir, len, F;
    for (i = 0; i < list.length; i++) {
      e = ents[list[i]]; k = e.k;
      if (pass === 0) {
        if (k === 'wind') drawWind(e, t);
        else if (SOLID[k]) {
          if ((k === 'v' && st && gone(tw, st, e.i, T)) || (k === 'f' && e.flag === 0)) continue;
          pos(e, T, PB); x = Math.max(TX0 + 2, PB.x + 12); u = Math.min(TX1 - 2, PB.x + e.w + 14);
          if (u > x) { c.fillStyle = 'rgba(27,42,73,0.17)'; c.fillRect(x, PB.y + 16, u - x, 21); c.fillStyle = 'rgba(27,42,73,0.08)'; c.fillRect(x - 2, PB.y + 14, u - x + 4, 25); }
        }
      } else if (pass === 1) {
        if (k === 'l') { drawLava(e, t); continue; }
        if (!SOLID[k]) continue;
        pos(e, T, PB); x = PB.x; y = PB.y;
        if (k === 'sw') {      // the ropes
          c.strokeStyle = NAVY; c.lineWidth = 4; c.beginPath(); c.moveTo(e.px, e.py); c.lineTo(x + 8, y - 2); c.moveTo(e.px, e.py); c.lineTo(x + e.w - 2, y - 2); c.stroke();
          c.strokeStyle = '#D9B26A'; c.lineWidth = 1.8; c.stroke();
          c.beginPath(); c.arc(e.px, e.py, 6, 0, TAU); c.fillStyle = '#8D9AB5'; c.fill(); ol(c, 2.5);
        } else if (k === 'o') {  // a spoke of the wheel
          c.strokeStyle = NAVY; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(e.cx, e.cy); c.lineTo(x + e.w / 2, y + 12); c.stroke();
          c.strokeStyle = '#B9C4DA'; c.lineWidth = 3; c.stroke();
          c.beginPath(); c.arc(e.cx, e.cy, 13, 0, TAU); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 3);
        }
        if (k === 'f' && e.flag === 0) continue;     // the first flag stands on the grass
        s = platSprite(e, stg.col);
        if (k === 'v') {
          d = st && st.van[e.i] !== undefined ? T - st.van[e.i] : -1;
          if (d >= tw.vd && d < tw.vd + VBACK) {      // away: a faint outline shows where it comes back
            c.globalAlpha = 0.16; c.drawImage(s, x - 12, y - 16, s.lw, s.lh); c.globalAlpha = 1; continue;
          }
          if (d >= 0) { u = d / tw.vd; x += Math.sin(t * 55) * 2 * u; y += u * 3; c.globalAlpha = 1 - u * 0.55; }
          c.drawImage(s, x - 12, y - 16, s.lw, s.lh); c.globalAlpha = 1;
        } else if (k === 'b') {
          d = bounced[e.i] !== undefined ? T - bounced[e.i] : 9;
          u = d < 0.3 ? 1 - 0.45 * Math.sin((d / 0.3) * Math.PI) : 1;
          if (u < 1) { c.save(); c.translate(x, y + 35); c.scale(1, u); c.drawImage(s, -12, -16 - 35, s.lw, s.lh); c.restore(); }
          else c.drawImage(s, x - 12, y - 16, s.lw, s.lh);
        } else {
          c.drawImage(s, x - 12, y - 16, s.lw, s.lh);
          if (k === 'c') {     // the belt runs
            dir = e.sp > 0 ? 1 : -1; u = ((t * Math.abs(e.sp) * 0.6) % 22);
            c.strokeStyle = '#FFD66B'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath();
            for (a = 24 + (dir > 0 ? u : 22 - u); a < e.w - 22; a += 22) { c.moveTo(x + a - 4 * dir, y + 9.5); c.lineTo(x + a + 2 * dir, y + 14); c.lineTo(x + a - 4 * dir, y + 18.5); }
            c.stroke();
            c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 2.5; c.beginPath();
            for (a = 12 + (dir > 0 ? u : 22 - u); a < e.w - 6; a += 22) { c.moveTo(x + a + 2, y + 1.5); c.lineTo(x + a + 5, y - 2.5); }
            c.stroke();
          }
        }
      } else {
        if (k === 's') {
          n = e.arms;
          c.beginPath(); c.arc(e.x, e.y, 15, 0, TAU); c.fillStyle = '#8D9AB5'; c.fill(); ol(c, 3);
          c.lineCap = 'round';
          for (j = 0; j < n; j++) {
            a = e.ph + e.sp * T + j * TAU / n; x = e.x + Math.cos(a) * e.r; y = e.y + Math.sin(a) * e.r;
            c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(x, y);
            c.strokeStyle = NAVY; c.lineWidth = 17; c.stroke(); c.strokeStyle = '#FF4F6D'; c.lineWidth = 11; c.stroke();
            c.lineCap = 'butt'; c.setLineDash([9, 11]); c.lineDashOffset = -8; c.strokeStyle = '#fff'; c.stroke(); c.setLineDash([]); c.lineCap = 'round';
          }
          c.beginPath(); c.arc(e.x, e.y, 8, 0, TAU); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 3);
        } else if (k === 'w') {
          pos(e, T, PB);
          c.strokeStyle = NAVY; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(e.px, e.py); c.lineTo(PB.x, PB.y); c.stroke();
          c.strokeStyle = '#B9C4DA'; c.lineWidth = 2; c.setLineDash([5, 5]); c.stroke(); c.setLineDash([]);
          c.beginPath(); c.arc(e.px, e.py, 7, 0, TAU); c.fillStyle = '#8D9AB5'; c.fill(); ol(c, 2.5);
          s = ballSprite(); c.drawImage(s, PB.x - 32, PB.y - 32, 64, 64);
        } else if (k === 'z') {
          pos(e, T, PB); s = spikySprite();
          c.save(); c.translate(PB.x, PB.y + Math.sin(t * 9 + e.i) * 1.5); c.rotate(Math.sin(t * 5 + e.i) * 0.25); c.drawImage(s, -26, -26, 52, 52); c.restore();
        } else if (k === 'f') {
          F = e; x = F.px; y = F.y;
          if (F.flag >= tw.n) {    // the cup at the top
            s = trophySprite(); u = Math.sin(t * 2.4) * 3;
            c.fillStyle = 'rgba(27,42,73,0.18)'; c.beginPath(); c.ellipse(x, y, 24, 6, 0, 0, TAU); c.fill();
            c.drawImage(s, x - 32, y - 76 + u, 64, 72);
            for (j = 0; j < 3; j++) { a = t * 1.6 + j * TAU / 3; star(c, x + Math.cos(a) * 38, y - 44 + u + Math.sin(a) * 22, 4 + Math.sin(t * 5 + j) * 1.5); c.fillStyle = '#FFF6B0'; c.fill(); ol(c, 1.5); }
          } else {
            d = st ? st.cp >= F.flag : false;
            c.fillStyle = 'rgba(27,42,73,0.18)'; c.beginPath(); c.ellipse(x + 3, y, 11, 4, 0, 0, TAU); c.fill();
            c.strokeStyle = NAVY; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y - 1); c.lineTo(x, y - 62); c.stroke();
            c.strokeStyle = '#E8EEF7'; c.lineWidth = 2.5; c.stroke();
            u = Math.sin(t * 4 + F.flag) * 3;
            c.beginPath(); c.moveTo(x + 1, y - 62); c.quadraticCurveTo(x + 20, y - 62 + u, x + 38, y - 51 + u * 0.6); c.quadraticCurveTo(x + 20, y - 46 - u * 0.5, x + 1, y - 38); c.closePath();
            c.fillStyle = d ? '#58C06B' : '#FF4F6D'; c.fill(); ol(c, 3);
            c.beginPath(); c.arc(x, y - 64, 4.5, 0, TAU); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 2.5);
            c.fillStyle = '#fff'; c.font = '700 13px ' + api.FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(F.flag ? String(F.flag) : '★', x + 13, y - 50 + u * 0.4);
          }
        }
      }
    }
  }
  function drawLava(e, t) {
    var x = e.x, y = e.y, w = e.w, h = e.h, i, n = Math.max(3, Math.round(w / 14)), px;
    c.fillStyle = 'rgba(255,150,40,0.20)'; rr(c, x - 7, y - 13, w + 14, h + 18, 9); c.fill();
    rr(c, x, y, w, h, 5); c.fillStyle = '#F2541B'; c.fill(); ol(c, 3);
    c.fillStyle = 'rgba(120,20,10,0.28)'; c.fillRect(x + 1.5, y + h * 0.6, w - 3, h * 0.4 - 1.5);
    c.beginPath(); c.moveTo(x + 2, y + 8);
    for (i = 0; i <= n; i++) { px = x + 2 + (w - 4) * i / n; c.lineTo(px, y + 4 + Math.sin(t * 3.2 + i * 1.4 + x) * 2.2); }
    c.lineTo(x + w - 2, y + 8); c.closePath(); c.fillStyle = '#FFC233'; c.fill();
    c.fillStyle = '#FFE680';
    for (i = 0; i < 2 + (w > 120 ? 2 : 0); i++) {
      px = (t * 0.7 + rnd(i * 9.3 + x)) % 1;
      c.globalAlpha = 1 - px; c.beginPath(); c.arc(x + 8 + rnd(i * 5.1 + x) * (w - 16), y + 3 - px * 14, 2 + px * 2.5, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  }
  function drawWind(e, t) {
    var i, n = Math.max(4, Math.round(e.w * e.h / 7000)), u, x, y, dir = e.fx > 0 ? 1 : -1, a;
    c.fillStyle = e.fy ? 'rgba(190,240,255,0.30)' : 'rgba(255,255,255,0.24)'; rr(c, e.x, e.y, e.w, e.h, 16); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2.5; c.setLineDash([10, 9]); c.stroke(); c.setLineDash([]);
    c.strokeStyle = '#fff'; c.lineWidth = 3.5; c.lineCap = 'round';
    for (i = 0; i < n; i++) {
      u = (t * (e.fy ? 0.55 : 0.5) + rnd(i * 2.7 + e.x)) % 1; a = Math.sin(u * Math.PI);
      c.globalAlpha = Math.min(1, a * 1.4); c.beginPath();
      if (e.fy) {
        x = e.x + 14 + rnd(i * 3.1 + e.y) * (e.w - 28); y = e.y + e.h - u * e.h;
        c.moveTo(x, y + 16); c.lineTo(x, y - 14); c.moveTo(x - 6, y - 7); c.lineTo(x, y - 14); c.lineTo(x + 6, y - 7);
      } else {
        x = dir > 0 ? e.x + u * e.w : e.x + e.w - u * e.w; y = e.y + 14 + rnd(i * 7.7 + e.x) * (e.h - 28);
        c.moveTo(x - 20 * dir, y); c.lineTo(x + 14 * dir, y); c.moveTo(x + 7 * dir, y - 6); c.lineTo(x + 14 * dir, y); c.lineTo(x + 7 * dir, y + 6);
      }
      c.stroke();
    }
    c.globalAlpha = 1;
  }
  var ME = { color: '#FF7A45', hat: 0, big: false, name: '', lv: 0 };
  function drawGuy(p, x, y, f, m, t, sq, isMe) {
    var h;
    c.save(); c.translate(x, y);
    if (sq) c.scale(1 + sq * 0.2, 1 - sq * 0.2);
    h = api.drawAvatar(c, p, 0, 0, t, { scale: AV, facing: f, moving: m === 1 });
    c.restore();
    tags.push({ p: p, x: x, y: y - h - 5, me: isMe });
  }
  // the soft shadow under the player: on the platform below, smaller the higher the jump
  function drawShadow(T) {
    var y = 1e9, si, i, list, e, d;
    if (st.on >= 0) y = st.y;
    else for (si = Math.max(0, st.cp - 1); si <= Math.min(tw.n, st.cp + 1); si++) {
      list = tw.stages[si].list;
      for (i = 0; i < list.length; i++) {
        e = tw.ents[list[i]];
        if (!SOLID[e.k] || (e.k === 'v' && gone(tw, st, e.i, T))) continue;
        pos(e, T, PB);
        if (st.x > PB.x - 6 && st.x < PB.x + e.w + 6 && PB.y >= st.y - 2 && PB.y < y) y = PB.y;
      }
    }
    d = y - st.y;
    if (d > 260) return;
    d = 1 - d / 320;
    c.fillStyle = 'rgba(27,42,73,' + (0.22 * d).toFixed(3) + ')';
    c.beginPath(); c.ellipse(st.x + 2, y + 1, 15 * d, 4.5 * d, 0, 0, TAU); c.fill();
  }
  function drawPanel() {     // how high everybody is
    var x = cw - 26, y0 = 86, y1 = ch - 150, h = y1 - y0, i, y, id, o, p, pl = api.players(), me = api.self() || ME, list = [], ly = 1e9, r;
    if (h < 70 || !st) return;
    rr(c, x - 8, y0 - 10, 16, h + 20, 8); c.fillStyle = 'rgba(255,255,255,0.82)'; c.fill(); ol(c, 2.5);
    c.strokeStyle = 'rgba(27,42,73,0.45)'; c.lineWidth = 2; c.beginPath();
    for (i = 1; i < tw.n; i++) { y = y1 + h * tw.stages[i].base / tw.height; c.moveTo(x - 5, y); c.lineTo(x + 5, y); }
    c.stroke();
    star(c, x, y0 - 12, 11); c.fillStyle = '#FFD23F'; c.fill(); ol(c, 2.5);
    for (id in others) { o = others[id]; p = pl[id]; if (p) list.push({ p: p, y: y1 - h * clamp(-o.y / tw.height, 0, 1), me: false }); }
    list.push({ p: me, y: y1 - h * clamp(-st.y / tw.height, 0, 1), me: true });
    list.sort(function (a, b) { return b.y - a.y; });       // from the bottom up; names keep 15 px apart
    c.textAlign = 'right'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    for (i = 0; i < list.length; i++) {
      o = list[i]; o.ly = Math.min(o.y, ly - 15); ly = o.ly; r = o.me ? 9 : 7;
      c.beginPath(); c.arc(x, o.y, r, 0, TAU); c.fillStyle = o.p.color || '#FF7A45'; c.fill(); ol(c, o.me ? 3 : 2.5);
      if (o.me) { c.beginPath(); c.arc(x, o.y, 3, 0, TAU); c.fillStyle = '#fff'; c.fill(); }
      if (!o.p.name) continue;
      c.font = (o.me ? '700' : '600') + ' 13px ' + api.FONT;
      c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = 4; c.strokeText(o.p.name, x - 15, o.ly + 1);
      c.fillStyle = NAVY; c.fillText(o.p.name, x - 15, o.ly + 1);
    }
  }
  function draw(t, T) {
    var k = dpr * S, y0, y1, i, lo = -1, hi = -1, stg, o, p, id, pl = api.players(), me = api.self() || ME, sx, sy, sc;
    tags.length = 0;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSky(t);
    c.setTransform(k, 0, 0, k, dpr * ox, -k * cam.y);
    c.lineJoin = 'round';
    y0 = cam.y - 40; y1 = cam.y + vh + 40;
    drawWall(y0, y1);
    drawGround(y1);
    for (i = 0; i <= tw.n; i++) {
      stg = tw.stages[i];
      if (stg.base + 90 > y0 && stg.base - stg.h - 240 < y1) { if (lo < 0) lo = i; hi = i; }
    }
    if (lo >= 0) {
      for (i = lo; i <= hi; i++) drawStage(tw.stages[i], 0, T, t);
      for (i = lo; i <= hi; i++) drawStage(tw.stages[i], 1, T, t);
      for (i = lo; i <= hi; i++) drawStage(tw.stages[i], 2, T, t);
    }
    if (st && run) {
      c.globalAlpha = 0.72;
      for (id in others) {
        o = others[id]; p = pl[id];
        if (!p || o.y < y0 - 40 || o.y > y1 + 80) continue;
        drawGuy(p, o.x, o.y, o.f, o.m, t, 0, false);
      }
      c.globalAlpha = 1;
      drawShadow(T);
      if (flash > 0) c.globalAlpha = 0.55 + 0.45 * Math.sin(t * 40);
      drawGuy(me, st.x, st.y, st.f, st.on >= 0 && Math.abs(st.vx) > 30 ? 1 : 0, t, squash, true);
      c.globalAlpha = 1;
    }
    for (i = 0; i < parts.length; i++) {
      o = parts[i]; c.globalAlpha = Math.min(1, (1 - o.life / o.max) * 1.6); c.fillStyle = o.col;
      if (o.k === 1) { star(c, o.x, o.y, o.r + 2); c.fill(); }
      else if (o.k === 2) { c.save(); c.translate(o.x, o.y); c.rotate(o.rot); c.fillRect(-o.r, -o.r * 0.5, o.r * 2, o.r); c.restore(); }
      else { c.beginPath(); c.arc(o.x, o.y, o.r, 0, TAU); c.fill(); }
    }
    c.globalAlpha = 1;
    // on top, in screen pixels: name tags, "+1" notes and the height panel
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    sc = cw < 1000 ? 0.78 : 0.9;
    for (i = 0; i < tags.length; i++) {
      o = tags[i]; if (!o.p.name) continue;
      sx = ox + o.x * S; sy = (o.y - cam.y) * S;
      c.save(); c.translate(sx, sy); c.scale(sc, sc); api.nameTag(c, o.p, 0, 0, o.me); c.restore();
    }
    for (i = 0; i < pops.length; i++) {
      o = pops[i]; c.globalAlpha = clamp((1.5 - o.life) * 2.5, 0, 1);
      api.label(c, o.txt, clamp(ox + o.x * S, 60, cw - 60), Math.max(96, (o.y - cam.y) * S), o.bg, NAVY, cw < 1000 ? 19 : 22);
    }
    c.globalAlpha = 1;
    drawPanel();
  }

  window.FTGames = window.FTGames || {};
  window.FTGames.obby = {
    init: function (a) { api = a; },
    open: open,
    onMessage: onMessage,
    onPlayers: function () { if (root && mode === 'lobby') renderLobby(); },
    // for the test bot (scratch tests load this file in Node and play the stages)
    _sim: { TOWERS: TOWERS, tower: tower, step: step, spawn: spawn, newState: newState, pos: pos, consts: { G: G, JUMP: JUMP, RUN: RUN, COYOTE: COYOTE } }
  };
})();
