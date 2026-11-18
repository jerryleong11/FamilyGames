// Monster Cave (boss): the tablet side of the co-operative boss fight. See dev/games/boss.js for the rules.
// The whole cave is on screen at once, so everybody sees every orb's number, every fighter's rune on the boss's
// shield and who carries what. Each tablet shows its own sum and its own rune big; a Little fighter also gets dots
// to count (under every orb and in the sum), a Grown-up a times pad (x1 to x9) for loading the cannon. The role's
// ability, the Drop button and the times pad stand in a column to the right of the cave floor. The server decides
// everything; this file draws, moves the own player and reports where the player is and when the player was hit.
(function () {
  'use strict';
  var api = null, root = null;
  var NAVY = '#1B2A49', TAU = Math.PI * 2, FONT = 'Fredoka, sans-serif';
  var SH = 'rgba(14,10,34,0.30)';

  // ---- the arena: the same numbers are in dev/games/boss.js ----
  var AW = 1200, AH = 760, X0 = 70, X1 = 1130, Y0 = 270, Y1 = 725;
  var BOSS = { x: 600, y: 335 }, CANNON = { x: 600, y: 610 };
  var DELIVER_R = 100, SPEED = 285, AS = 0.8, BS = 0.86, NB = 6;

  // col: the boss's own colour, hit: its attacks, then the colours of its cave and of the crystals on the wall
  var BOSSES = [
    { en: 'Slime King', zh: '史莱姆王', py: 'shǐláimǔ wáng', ms: 'Raja Lendir', col: '#7BE06B', hit: '#9BF07A',
      wall: '#2B3758', wall2: '#4B5C8A', floor: '#5F7198', floor2: '#7E91B8', rock: '#566890', cA: '#9BF2A0', cB: '#3FAE5A' },
    { en: 'Rock Golem', zh: '石头巨人', py: 'shítou jùrén', ms: 'Raksasa Batu', col: '#AEB6C4', hit: '#E8C79A',
      wall: '#3A322D', wall2: '#63564A', floor: '#84735F', floor2: '#A5927B', rock: '#75665A', cA: '#9BF2E4', cB: '#35B5A2' },
    { en: 'Fire Dragon', zh: '火龙', py: 'huǒlóng', ms: 'Naga Api', col: '#FF6B4A', hit: '#FFA23D',
      wall: '#371D2C', wall2: '#69333F', floor: '#7B4A52', floor2: '#9E666A', rock: '#6E3B46', cA: '#FFC06B', cB: '#E0662A' },
    { en: 'Coral Crab', zh: '珊瑚蟹', py: 'shānhú xiè', ms: 'Ketam Karang', col: '#FF8A6B', hit: '#8FE3FF',
      wall: '#1E3B4A', wall2: '#3E7384', floor: '#A08E6A', floor2: '#C6B58A', rock: '#5F8C8E', cA: '#FFB5C8', cB: '#E0607F' },
    { en: 'Clock Tortoise', zh: '时钟龟', py: 'shízhōng guī', ms: 'Kura-kura Jam', col: '#5FBF8A', hit: '#FFD66B',
      wall: '#1F3027', wall2: '#3F5E4A', floor: '#5F8468', floor2: '#82A688', rock: '#567A5F', cA: '#FFE08A', cB: '#D9A02A' },
    { en: 'Storm Owl', zh: '风暴猫头鹰', py: 'fēngbào māotóuyīng', ms: 'Burung Hantu Ribut', col: '#9B8CFF', hit: '#E8E4FF',
      wall: '#241F42', wall2: '#4A3F7A', floor: '#6B6698', floor2: '#8C88B8', rock: '#5A5288', cA: '#C9B6FF', cB: '#7C5BE0' }
  ];
  var DIFFS = [
    { en: 'Easy', zh: '简单', py: 'jiǎndān', ms: 'Mudah', stars: 10 },
    { en: 'Normal', zh: '普通', py: 'pǔtōng', ms: 'Biasa', stars: 14 },
    { en: 'Hard', zh: '困难', py: 'kùnnan', ms: 'Sukar', stars: 18 }
  ];
  var SKILLS = [{ ico: '🐣', en: 'Little' }, { ico: '🧒', en: 'Big kid' }, { ico: '🧑', en: 'Grown-up' }];
  var ROLES = [
    { ico: '🛡', en: 'Guard', zh: '守卫', py: 'shǒuwèi', ms: 'Pengawal', hint: 'A bubble that blocks hits' },
    { ico: '💚', en: 'Healer', zh: '治疗师', py: 'zhìliáoshī', ms: 'Penyembuh', hint: 'Gets friends back up' },
    { ico: '🧲', en: 'Collector', zh: '收集者', py: 'shōujízhě', ms: 'Pengumpul', hint: 'Pulls orbs in, carries 5' },
    { ico: '⚡', en: 'Runner', zh: '飞毛腿', py: 'fēimáotuǐ', ms: 'Pelari', hint: 'Dashes through danger' }
  ];
  var ORB_COL = ['#FF6B6B', '#FF9F43', '#EDB100', '#5DBB63', '#22B8A6', '#4C9BFF', '#7C7BFF', '#B46BFF', '#FF6FBF', '#E8703A', '#3F9A53', '#3B6FE0'];

  // ---------- small helpers ----------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function shade(hex, f) { return window.Scene && window.Scene.shade ? window.Scene.shade(hex, f) : hex; }
  function seed(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function rr(g, x, y, w, h, r) { api.rr(g, x, y, w, h, r); }
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function poly(g, p) { g.beginPath(); g.moveTo(p[0], p[1]); for (var i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); }
  function ol(g, w) { g.lineWidth = w || 4; g.strokeStyle = NAVY; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
  function lin(g, x0, y0, x1, y1, a, b) { var q = g.createLinearGradient(x0, y0, x1, y1); q.addColorStop(0, a); q.addColorStop(1, b); return q; }
  function txt(g, s, x, y, size, fill, stroke, lw, weight) {
    g.font = (weight || 700) + ' ' + size + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (stroke) { g.lineJoin = 'round'; g.lineWidth = lw || 5; g.strokeStyle = stroke; g.strokeText(s, x, y); }
    g.fillStyle = fill; g.fillText(s, x, y);
  }
  function num(v) { return v < 0 ? '−' + (-v) : String(v); }
  function clock(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function tri(o) { return api.esc(o.zh) + ' <span class="py">' + api.esc(o.py) + '</span> · ' + api.esc(o.ms); }
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function tnow() { return window.performance && performance.now ? performance.now() : Date.now(); }
  function kindOf(v) { return clamp(v | 0, 0, NB - 1); }

  // ---------- state ----------
  var el = {}, cv = null, c = null, W = 0, H = 0, dpr = 1, vs = 1, vox = 0, voy = 0, ts = 1, COL = 110, hx = 0, backW = 140;
  var stick = null, raf = 0, last = 0, T = 0, timers = [];
  var mode = 'wait';      // 'wait' (nothing from the server yet), 'lobby', 'fight', 'result'
  var L = null;           // the last lobby message
  var G = null;           // the fight on screen
  var R = null;           // the result of the last fight
  var goEnds = 0, goShown = -1, bg = null, bgKey = '', pictAt = 0, tagList = [], orbCache = {}, ui = {};

  function later(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function curBoss() { return kindOf(G ? G.boss : (mode === 'result' && R) ? R.boss : L ? L.boss : 0); }
  // a player's level (0 Little, 1 Big kid, 2 Grown-up) and role, as the server last told
  function whoOf(id) {
    var r = G && G.runes[id], p, i;
    if (r) return [r.sk, r.role];
    if (L && L.who) for (i = 0; i < L.who.length; i++) if (L.who[i][0] === id) return [L.who[i][1], L.who[i][2]];
    p = api.players()[id];
    return [p ? (p.skill >= 0 && p.skill <= 2 ? p.skill : p.big ? 2 : 1) : 1, 0];
  }
  function colOf(id) { var p = api.players()[id]; return p && p.color ? p.color : '#3B82F6'; }

  // ---------- CSS ----------
  var CSS = [
    '.boss-ov{background:#241C33;overflow:hidden;touch-action:none}',
    '.boss-ov .py{font-family:system-ui,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif}',
    '.boss-cv{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none}',
    '.boss-back{position:absolute;left:10px;top:8px;z-index:6;height:48px;padding:0 16px;font-size:17px;border-width:3px;white-space:nowrap}',
    // the column to the right of the cave floor: times pad (Grown-up), the role's ability, Drop
    '.boss-side{position:absolute;right:0;top:0;bottom:0;z-index:4;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:8px;padding:52px 0 10px;pointer-events:none}',
    '.boss-side>*{pointer-events:auto;flex:none}',
    '.boss-rnd{position:relative;overflow:hidden;width:88px;height:88px;border-radius:50%;border:4px solid #1B2A49;background:#FFD66B;color:#1B2A49;padding:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:15px;font-weight:700;line-height:1.05;box-shadow:0 5px 0 rgba(27,42,73,.4)}',
    '.boss-rnd b{font-size:30px;line-height:1}',
    '.boss-rnd:active{transform:scale(.94)}',
    '.boss-act b{font-size:42px;line-height:1.1}',
    '.boss-act i{position:absolute;left:0;right:0;bottom:0;height:0;background:rgba(27,42,73,.6)}',
    '.boss-act span{position:absolute;left:0;right:0;top:50%;margin-top:-17px;font-size:30px;line-height:34px;color:#fff;text-shadow:0 0 4px #1B2A49,0 0 4px #1B2A49}',
    '.boss-act.wait{background:#B9B4C6}',
    '.boss-act.idle{background:#E6E1D2}',
    '.boss-act.idle b{opacity:.45}',
    '.boss-act.go{animation:boss-pulse .5s infinite alternate}',
    '@keyframes boss-pulse{from{box-shadow:0 5px 0 rgba(27,42,73,.4),0 0 0 0 rgba(93,187,99,.9)}to{box-shadow:0 5px 0 rgba(27,42,73,.4),0 0 0 9px rgba(93,187,99,.35)}}',
    '.boss-pad{display:grid;grid-template-columns:54px 54px;gap:4px}',
    '.boss-pad button{width:54px;height:54px;border:3px solid #1B2A49;border-radius:14px;background:#fff;color:#1B2A49;font:700 22px Fredoka,sans-serif;padding:0;box-shadow:0 3px 0 rgba(27,42,73,.4)}',
    '.boss-pad button:active{transform:scale(.93);background:#FFD66B}',
    '.boss-pad.off button{background:#CFCBDA;color:#6C6880;box-shadow:none}',
    '.boss-nx{width:54px;height:54px;display:flex;align-items:center;justify-content:center;border-radius:50%;border:3px dashed rgba(255,255,255,.7);color:#fff;font-size:26px;font-weight:700;text-shadow:0 0 3px #1B2A49,0 0 3px #1B2A49}',
    '.boss-nx.has{border:3px solid #1B2A49;background:#FF9F43}',
    // the lobby and the result
    '.boss-lay{position:absolute;left:0;top:0;right:0;bottom:0;z-index:5;display:flex;align-items:flex-start;justify-content:center;padding:8px;background:rgba(20,14,34,.5)}',
    '.boss-panel{background:#FFF3D6;color:#1B2A49;border:5px solid #1B2A49;border-radius:28px;padding:10px 14px 12px;width:100%;max-width:1180px;max-height:100%;overflow-x:hidden;overflow-y:auto;touch-action:pan-y;display:flex;flex-direction:column;gap:9px;box-shadow:0 8px 0 rgba(10,8,24,.35)}',
    '.boss-head{display:flex;align-items:center;gap:10px;min-height:50px;padding-left:158px}',
    '.boss-title{flex:none;display:flex;flex-direction:column}',
    '.boss-head h2{font-size:30px;line-height:1.05;flex:none;margin:0}',
    '.boss-tri{font-size:16px;font-weight:600;line-height:1.15}',
    '.boss-who{flex:1;min-width:0;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}',
    '.boss-who .tagc{height:32px;font-size:15px}',
    '.boss-who .tagc u{text-decoration:none;font-weight:700;background:#1B2A49;color:#fff;border-radius:999px;padding:0 8px;font-size:13px;line-height:20px}',
    '.boss-cards{display:flex;gap:8px}',
    '.boss-card{flex:1 1 0;min-width:0;position:relative;border:4px solid #1B2A49;border-radius:20px;background:#fff;color:#1B2A49;padding:5px 5px 6px;display:flex;flex-direction:column;align-items:center;gap:1px;font-size:13px;font-weight:600;line-height:1.15;text-align:center}',
    '.boss-card canvas{display:block;width:100%;height:150px;border-radius:13px;border:3px solid #1B2A49}',
    '.boss-card b{font-size:19px;margin-top:3px;white-space:nowrap}',
    '.boss-card>span{display:block}',
    '.boss-card em{font-style:normal;font-weight:700;min-height:15px}',
    '.boss-card.on{background:#FFD66B;outline:4px solid #1B2A49;outline-offset:2px}',
    '.boss-card.lock{background:#E4E0D6;color:#5A5A5A}',
    '.boss-card:active{transform:scale(.97)}',
    '.boss-badge{position:absolute;right:9px;top:9px;background:#fff;color:#1B2A49;border:3px solid #1B2A49;border-radius:999px;padding:1px 8px;font-size:15px;font-weight:700;line-height:1.3}',
    '.boss-roles{display:flex;gap:8px}',
    '.boss-role{flex:1 1 0;min-width:0;min-height:66px;position:relative;border:3px solid #1B2A49;border-radius:18px;background:#fff;color:#1B2A49;padding:4px 8px;display:flex;align-items:center;gap:8px;text-align:left;font-size:13px;font-weight:600;line-height:1.15}',
    '.boss-role>b{flex:none;font-size:36px;line-height:1}',
    '.boss-role>span{display:flex;flex-direction:column;min-width:0}',
    '.boss-role>span>b{font-size:19px}',
    '.boss-role>span>i{font-style:normal;opacity:.75}',
    '.boss-role.on{background:#FFD66B;outline:4px solid #1B2A49;outline-offset:2px}',
    '.boss-role:active{transform:scale(.97)}',
    '.boss-role u{position:absolute;right:7px;top:6px;display:flex;gap:3px;text-decoration:none}',
    '.boss-role u i{width:14px;height:14px;border-radius:5px;border:2px solid #1B2A49}',
    '.boss-row{display:flex;gap:10px;align-items:stretch}',
    '.boss-diffs{flex:1 1 0;min-width:0;display:flex;gap:8px}',
    '.boss-diff{flex:1 1 0;min-width:0;min-height:74px;border:3px solid #1B2A49;border-radius:18px;background:#fff;color:#1B2A49;font-size:13px;font-weight:600;line-height:1.2;padding:4px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center}',
    '.boss-diff>span{white-space:nowrap}',
    '.boss-diff b{font-size:20px}',
    '.boss-diff i{font-style:normal;font-size:16px;font-weight:700;white-space:nowrap}',
    '.boss-diff.on{background:#1B2A49;color:#fff}',
    '.boss-diff:active{transform:scale(.96)}',
    '.boss-nums{flex:none;min-width:236px;background:#fff;border:3px solid #1B2A49;border-radius:18px;padding:3px 6px;display:flex;flex-direction:column;justify-content:center;font-size:17px;font-weight:700;line-height:1.25}',
    '.boss-nums div{display:flex;align-items:center;gap:7px;white-space:nowrap;border-radius:9px;padding:0 6px}',
    '.boss-nums div.me{background:#FFD66B}',
    '.boss-nums small{font-size:13px;font-weight:600;opacity:.8}',
    '.boss-go{flex:none;width:200px;display:flex;flex-direction:column;gap:4px;justify-content:center}',
    '.boss-go .btn{width:100%;height:60px;font-size:26px;padding:0 8px;white-space:nowrap}',
    '.boss-go .btn.boss-wait{background:#7BD389}',
    '.boss-left{font-size:14px;font-weight:600;text-align:center;line-height:1.25}',
    '.boss-left span{white-space:nowrap}',
    '.boss-left i{font-style:normal;opacity:.28}',
    '.boss-how{display:flex;align-items:center;justify-content:center;gap:7px;font-size:22px;font-weight:700;flex-wrap:nowrap;white-space:nowrap}',
    '.boss-o,.boss-sh{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border:3px solid #1B2A49;color:#fff;font-size:21px;font-weight:700;text-shadow:0 0 3px #1B2A49,0 0 3px #1B2A49}',
    '.boss-o{border-radius:50%}',
    '.boss-sh{border-radius:8px 8px 19px 19px;background:#3B82F6;width:42px;height:44px}',
    '.boss-sep{width:3px;height:30px;background:rgba(27,42,73,.25);border-radius:2px;margin:0 6px}',
    '.boss-howt{margin-left:8px;font-size:15px;font-weight:600;white-space:normal;line-height:1.2}',
    '.boss-res{max-width:760px;align-self:center}',
    '.boss-lay.boss-mid{align-items:center}',
    '.boss-rtop{display:flex;gap:14px;align-items:stretch}',
    '.boss-rtop canvas{flex:none;display:block;width:210px;height:170px;border-radius:16px;border:3px solid #1B2A49}',
    '.boss-rinfo{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;justify-content:center}',
    '.boss-rinfo h2{font-size:38px;line-height:1.05;margin:0;color:#E0447F}',
    '.boss-rinfo .boss-sum{font-size:26px;font-weight:700}',
    '.boss-rinfo .boss-note{font-size:16px;font-weight:600;line-height:1.25}',
    '.boss-rows{display:flex;flex-direction:column;gap:6px}',
    '.boss-rrow{display:flex;align-items:center;gap:10px;background:#fff;border:3px solid #1B2A49;border-radius:16px;padding:5px 12px;font-size:18px;font-weight:600}',
    '.boss-rrow.me{background:#FFF8DC}',
    '.boss-rrow i{flex:none;width:24px;height:24px;border-radius:8px;border:2px solid #1B2A49}',
    '.boss-rrow b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.boss-rrow span{white-space:nowrap}',
    '.boss-rrow em{font-style:normal;font-weight:700;font-size:20px;white-space:nowrap}',
    '.boss-new{background:#FFD66B;border:2px solid #1B2A49;border-radius:999px;padding:0 9px;font-size:14px;font-weight:700;white-space:nowrap}',
    '.boss-res .btn{align-self:center;min-width:240px;height:60px;font-size:24px}',
    '.boss-shake{animation:boss-shake .4s}',
    '@keyframes boss-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}50%{transform:translateX(7px)}75%{transform:translateX(-4px)}}',
    '@media (min-height:700px){.boss-lay{align-items:center}.boss-head{padding-left:0}}',
    '@media (max-height:700px){.boss-card canvas{height:112px}.boss-lay.boss-mid{padding-top:62px}}',
    '@media (max-height:600px){.boss-rnd{width:74px;height:74px;font-size:13px}.boss-rnd b{font-size:25px}.boss-act b{font-size:34px}.boss-side{gap:6px;padding:48px 0 6px}' +
      '.boss-pad{grid-template-columns:48px 48px;gap:3px}.boss-pad button,.boss-nx{width:48px;height:48px}.boss-pad button{font-size:20px;border-radius:12px}}',
    '@media (max-width:900px),(max-height:560px){.boss-panel{padding:8px 10px 9px;gap:7px;border-width:4px;border-radius:24px}.boss-head{min-height:46px;padding-left:150px}.boss-head h2{font-size:23px}.boss-tri{font-size:13px}.boss-who{gap:4px}.boss-who .tagc{height:28px;font-size:13px;padding:0 7px 0 4px;gap:4px}.boss-who .tagc i{width:17px;height:17px}.boss-who .tagc u{font-size:12px;padding:0 6px;line-height:18px}' +
      '.boss-cards{gap:6px}.boss-card{font-size:11px;border-width:3px;border-radius:16px;padding:4px 3px 4px}.boss-card canvas{height:84px;border-radius:11px}.boss-card b{font-size:15px;margin-top:2px}.boss-badge{font-size:12px;right:6px;top:6px;border-width:2px;padding:0 6px}' +
      '.boss-roles{gap:6px}.boss-role{min-height:54px;font-size:11px;padding:3px 6px;gap:5px;border-radius:15px}.boss-role>b{font-size:28px}.boss-role>span>b{font-size:15px}.boss-role>span>i{display:none}.boss-role u i{width:12px;height:12px}' +
      '.boss-diff{min-height:62px;font-size:11px;border-radius:15px}.boss-diff b{font-size:16px}.boss-diff i{font-size:13px}.boss-nums{min-width:186px;font-size:14px;border-radius:15px}.boss-nums small{font-size:11px}.boss-go{width:156px}.boss-go .btn{height:52px;font-size:21px}.boss-left{font-size:12px}' +
      '.boss-how{font-size:18px;gap:5px}.boss-o{width:30px;height:30px;font-size:17px}.boss-sh{width:34px;height:36px;font-size:17px}.boss-howt{display:none}.boss-sep{height:24px;margin:0 3px}' +
      '.boss-rtop canvas{width:160px;height:128px}.boss-rinfo h2{font-size:30px}.boss-rinfo .boss-sum{font-size:22px}.boss-rinfo .boss-note{font-size:14px}.boss-rrow{font-size:16px;padding:3px 10px}.boss-rrow em{font-size:18px}.boss-res .btn{height:54px;font-size:21px}' +
      '.boss-back{font-size:16px;padding:0 13px}}'
  ].join('\n');

  // ---------- orbs ----------
  // An orb is drawn once per number and size, then reused as a picture. Minus orbs are dark six-sided gems.
  function orbSprite(v, r) {
    var key = v + '_' + r, s = orbCache[key];
    if (s) return s;
    var pad = 5, size = (r + pad) * 2, q = 2, g, col = v < 0 ? '#34326E' : ORB_COL[(v - 1) % ORB_COL.length], i, a, gr;
    s = document.createElement('canvas'); s.width = s.height = size * q; s.sz = size;
    g = s.getContext('2d'); g.scale(q, q); g.translate(size / 2, size / 2); g.lineJoin = 'round';
    function shape() {
      if (v >= 0) { ell(g, 0, 0, r, r); return; }
      g.beginPath(); for (i = 0; i < 6; i++) { a = -Math.PI / 2 + i * TAU / 6; g.lineTo(Math.cos(a) * r * 1.06, Math.sin(a) * r * 1.06); } g.closePath();
    }
    gr = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
    gr.addColorStop(0, shade(col, 0.5)); gr.addColorStop(0.55, col); gr.addColorStop(1, shade(col, -0.32));
    shape(); g.fillStyle = gr; g.fill();
    g.save(); shape(); g.clip();
    g.fillStyle = 'rgba(255,255,255,0.55)'; ell(g, -r * 0.34, -r * 0.5, r * 0.36, r * 0.18, -0.5); g.fill();
    if (v < 0) { g.strokeStyle = 'rgba(160,215,255,0.8)'; g.lineWidth = 2.5; g.beginPath(); for (i = 0; i < 6; i++) { a = -Math.PI / 2 + i * TAU / 6; g.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8); } g.closePath(); g.stroke(); }
    g.restore();
    shape(); ol(g, r > 24 ? 3.5 : 3);
    txt(g, num(v), 0, r * 0.06, Math.round(r * (Math.abs(v) > 9 || v < 0 ? 0.95 : 1.18)), '#fff', NAVY, r > 24 ? 6 : 4.5);
    orbCache[key] = s;
    return s;
  }
  // For a Little fighter: the same number as dots to count, in rows of five, on a small plate under the orb.
  function dotSprite(v) {
    var key = 'd' + v, s = orbCache[key], q = 2, n = Math.min(10, v), cols = Math.min(5, n), rows = n > 5 ? 2 : 1, w = cols * 15 + 9, hh = rows * 15 + 8, g, i;
    if (s) return s;
    s = document.createElement('canvas'); s.width = w * q; s.height = hh * q; s.w = w; s.h = hh;
    g = s.getContext('2d'); g.scale(q, q);
    rr(g, 1.5, 1.5, w - 3, hh - 3, 9); g.fillStyle = '#FFF3D6'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = NAVY; g.stroke();
    g.fillStyle = NAVY;
    for (i = 0; i < n; i++) { ell(g, 4.5 + 7.5 + (i % 5) * 15, 4 + 7.5 + Math.floor(i / 5) * 15, 5.5, 5.5); g.fill(); }
    orbCache[key] = s;
    return s;
  }

  // ---------- the six bosses, drawn with their feet at (0, 0), about 250 high ----------
  // o = { dazed, angry, sleep, hurt 0-1, wind 0-1 (winding up an attack), lx / ly where the eyes look }
  function eyeBall(g, x, y, r, o, t, iris) {
    var a, q, lx, ly;
    if (o.dazed) {            // a spinning spiral
      ell(g, x, y, r, r); g.fillStyle = '#fff'; g.fill(); ol(g, 3.5);
      g.beginPath(); for (a = 0; a < 11; a += 0.4) { q = r * 0.8 * a / 11; g.lineTo(x + Math.cos(a + t * 7) * q, y + Math.sin(a + t * 7) * q); }
      g.lineWidth = 3; g.strokeStyle = NAVY; g.stroke();
      return;
    }
    if (o.sleep || (t % 4.2) > 4.05) {   // closed
      g.beginPath(); g.arc(x, y - r * 0.25, r * 0.8, 0.15 * Math.PI, 0.85 * Math.PI); g.lineWidth = 4.5; g.strokeStyle = NAVY; g.lineCap = 'round'; g.stroke();
      return;
    }
    ell(g, x, y, r, r); g.fillStyle = '#fff'; g.fill(); ol(g, 3.5);
    lx = (o.lx || 0) * r * 0.34; ly = (o.ly === undefined ? 0.6 : o.ly) * r * 0.3;
    ell(g, x + lx, y + ly, r * 0.54, r * 0.54); g.fillStyle = iris || NAVY; g.fill();
    if (iris) { ell(g, x + lx, y + ly, r * 0.2, r * 0.38); g.fillStyle = NAVY; g.fill(); }
    ell(g, x + lx - r * 0.2, y + ly - r * 0.22, r * 0.15, r * 0.15); g.fillStyle = '#fff'; g.fill();
  }
  function brows(g, x, y, w, o) {       // angry eyebrows
    if (!o.angry) return;
    g.lineWidth = 7; g.strokeStyle = NAVY; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-x - w, y - w * 0.5); g.lineTo(-x + w, y + w * 0.3); g.moveTo(x + w, y - w * 0.5); g.lineTo(x - w, y + w * 0.3); g.stroke();
  }

  function drawSlime(g, t, o) {
    var b = Math.sin(t * 2.6) * 0.03 + o.wind * 0.1 - o.hurt * 0.08, i, by;
    var c1 = o.angry ? '#E3E86C' : '#B9F383', c2 = o.angry ? '#93B233' : '#4CBD5D';
    function body() {
      g.beginPath(); g.moveTo(-128, -8);
      g.bezierCurveTo(-152, -104, -94, -184, 0, -184); g.bezierCurveTo(94, -184, 152, -104, 128, -8);
      g.quadraticCurveTo(116, 14, 90, 3); g.quadraticCurveTo(68, 18, 42, 5); g.quadraticCurveTo(8, 20, -24, 5);
      g.quadraticCurveTo(-58, 18, -86, 3); g.quadraticCurveTo(-114, 14, -128, -8); g.closePath();
    }
    g.save(); g.scale(1 + b, 1 - b);
    body(); g.fillStyle = lin(g, -90, -180, 90, 10, c1, c2); g.fill();
    g.save(); body(); g.clip();
    g.fillStyle = 'rgba(16,80,70,0.24)'; ell(g, 134, -70, 80, 150, 0.2); g.fill();          // the darker side
    g.fillStyle = 'rgba(16,80,70,0.16)'; g.fillRect(-170, -30, 340, 60);
    g.fillStyle = 'rgba(255,255,255,0.6)'; ell(g, -66, -142, 36, 15, -0.6); g.fill();        // shine
    g.fillStyle = 'rgba(255,255,255,0.45)'; ell(g, -102, -102, 8, 8); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2.5;                               // bubbles rising inside
    for (i = 0; i < 3; i++) { by = -24 - ((t * 16 + i * 37) % 96); g.beginPath(); g.arc(-74 + i * 72, by, 5 + i * 2, 0, TAU); g.stroke(); }
    g.restore();
    body(); ol(g, 5);
    eyeBall(g, -44, -106, 24, o, t); eyeBall(g, 44, -106, 24, o, t);
    brows(g, 44, -136, 22, o);
    g.fillStyle = 'rgba(255,120,150,0.5)'; ell(g, -84, -76, 15, 9); g.fill(); ell(g, 84, -76, 15, 9); g.fill();
    if (o.dazed) { ell(g, 0, -58, 11, 13 + Math.sin(t * 8) * 3); g.fillStyle = '#3B1E3A'; g.fill(); ol(g, 3.5); }
    else if (o.sleep) { g.beginPath(); g.arc(0, -70, 16, 0.2 * Math.PI, 0.8 * Math.PI); g.lineWidth = 4.5; g.strokeStyle = NAVY; g.stroke(); }
    else {
      g.beginPath();
      if (o.angry) { g.moveTo(-40, -52); g.quadraticCurveTo(0, -84, 40, -52); g.quadraticCurveTo(0, -40, -40, -52); }
      else { g.moveTo(-42, -70); g.quadraticCurveTo(0, -24 - o.wind * 20, 42, -70); g.quadraticCurveTo(0, -60, -42, -70); }
      g.closePath(); g.fillStyle = '#3B1E3A'; g.fill(); ol(g, 4);
      g.fillStyle = '#fff'; poly(g, o.angry ? [-18, -64, -6, -64, -12, -53] : [-16, -64, -4, -62, -10, -52]); g.fill(); ol(g, 2);
      poly(g, o.angry ? [6, -64, 18, -64, 12, -53] : [4, -62, 16, -64, 10, -52]); g.fillStyle = '#fff'; g.fill(); ol(g, 2);
    }
    // the crown
    g.save(); g.translate(0, -180); g.rotate(-0.1 + (o.dazed ? Math.sin(t * 6) * 0.2 : 0));
    poly(g, [-44, 6, -52, -42, -27, -20, 0, -54, 27, -20, 52, -42, 44, 6]); g.fillStyle = lin(g, -50, 0, 50, 0, '#FFE680', '#F0A52A'); g.fill(); ol(g, 4);
    rr(g, -46, -7, 92, 15, 5); g.fillStyle = '#E08A1F'; g.fill(); ol(g, 3.5);
    [[-52, -42, '#FF4F6D'], [0, -54, '#5AA9FF'], [52, -42, '#FF4F6D']].forEach(function (q) { ell(g, q[0], q[1], 7.5, 7.5); g.fillStyle = q[2]; g.fill(); ol(g, 2.5); });
    ell(g, 0, 0, 6, 5); g.fillStyle = '#9BE8FF'; g.fill(); ol(g, 2);
    g.fillStyle = 'rgba(255,255,255,0.6)'; ell(g, -30, -8, 3, 9, 0.1); g.fill();
    g.restore();
    g.restore();
  }

  function drawGolem(g, t, o) {
    var bob = Math.sin(t * 1.8) * 4, up = o.wind * 46, jit = o.hurt * Math.sin(t * 70) * 5, i;
    var s1 = '#C3C9D4', s2 = '#8A93A3', s3 = '#5F6878', glow = o.angry ? '#FF4A3D' : '#FFB03B';
    function rock(x, y, w, hh, r, a) {
      g.save(); g.translate(x, y); g.rotate(a || 0);
      rr(g, -w / 2 + 8, -hh / 2 + 6, w, hh, r); g.fillStyle = s3; g.fill(); ol(g, 4);                     // the side face
      rr(g, -w / 2, -hh / 2, w, hh, r); g.fillStyle = lin(g, -w / 2, -hh / 2, w / 2, hh / 2, s1, s2); g.fill(); ol(g, 4);
      g.fillStyle = 'rgba(255,255,255,0.3)'; ell(g, -w * 0.18, -hh * 0.27, w * 0.24, hh * 0.1, -0.25); g.fill();
      g.restore();
    }
    g.save(); g.translate(jit, 0);
    rock(-52, -26, 72, 54, 20); rock(52, -26, 72, 54, 20);                                                  // legs
    rock(-134, -126 + bob - up * 0.6, 62, 70, 24, -0.16); rock(134, -126 - bob - up * 0.6, 62, 70, 24, 0.16); // shoulders
    rock(0, -112 + bob * 0.3, 196, 128, 44);                                                               // body
    // glowing cracks on the chest
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-34, -150 + bob * 0.3); g.lineTo(-12, -124 + bob * 0.3); g.lineTo(-28, -104 + bob * 0.3); g.lineTo(0, -82 + bob * 0.3); g.lineTo(22, -100 + bob * 0.3); g.lineTo(12, -70 + bob * 0.3);
    g.strokeStyle = o.angry ? 'rgba(255,74,61,0.35)' : 'rgba(255,176,59,0.35)'; g.lineWidth = 14; g.stroke();
    g.strokeStyle = glow; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#6FBF5B'; ell(g, -70, -168 + bob * 0.3, 22, 9, -0.2); g.fill(); ol(g, 3); ell(g, 66, -62 + bob * 0.3, 16, 7, 0.3); g.fillStyle = '#6FBF5B'; g.fill(); ol(g, 3); // moss
    rock(-152, -58 + bob * 1.4 - up, 76, 66, 24); rock(152, -58 - bob * 1.4 - up, 76, 66, 24);              // fists
    // crystals on the shoulders
    [[-146, -160 + bob - up * 0.6, -0.3], [146, -160 - bob - up * 0.6, 0.3]].forEach(function (q) {
      g.save(); g.translate(q[0], q[1]); g.rotate(q[2]);
      poly(g, [-10, 4, -4, -30, 6, -22, 12, 4]); g.fillStyle = lin(g, -10, 0, 12, 0, '#9BF2E4', '#35B5A2'); g.fill(); ol(g, 3);
      g.restore();
    });
    rock(0, -202 + bob * 0.6, 116, 80, 28);                                                                // head
    for (i = -1; i <= 1; i += 2) {
      if (o.dazed) { g.lineWidth = 6; g.strokeStyle = NAVY; g.beginPath(); g.moveTo(i * 28 - 10, -214 + bob * 0.6); g.lineTo(i * 28 + 10, -196 + bob * 0.6); g.moveTo(i * 28 + 10, -214 + bob * 0.6); g.lineTo(i * 28 - 10, -196 + bob * 0.6); g.stroke(); continue; }
      if (o.sleep) { g.lineWidth = 5; g.strokeStyle = NAVY; g.beginPath(); g.moveTo(i * 28 - 13, -204 + bob * 0.6); g.lineTo(i * 28 + 13, -204 + bob * 0.6); g.stroke(); continue; }
      ell(g, i * 28, -206 + bob * 0.6, 22, 17); g.fillStyle = o.angry ? 'rgba(255,74,61,0.3)' : 'rgba(255,176,59,0.3)'; g.fill();
      poly(g, o.angry ? [i * 28 - 15, -214 + bob * 0.6 + (i < 0 ? -5 : 5), i * 28 + 15, -214 + bob * 0.6 + (i < 0 ? 5 : -5), i * 28 + 14, -196 + bob * 0.6, i * 28 - 14, -196 + bob * 0.6]
        : [i * 28 - 15, -215 + bob * 0.6, i * 28 + 15, -215 + bob * 0.6, i * 28 + 14, -196 + bob * 0.6, i * 28 - 14, -196 + bob * 0.6]);
      g.fillStyle = glow; g.fill(); ol(g, 3.5);
      g.fillStyle = '#FFF6C8'; ell(g, i * 28 + (o.lx || 0) * 5, -204 + bob * 0.6, 5, 5); g.fill();
    }
    g.beginPath(); g.moveTo(-26, -178 + bob * 0.6); g.lineTo(-13, -172 + bob * 0.6); g.lineTo(0, -178 + bob * 0.6); g.lineTo(13, -172 + bob * 0.6); g.lineTo(26, -178 + bob * 0.6);
    g.lineWidth = 5; g.strokeStyle = NAVY; g.stroke();                                                      // mouth
    poly(g, [-18, -240 + bob * 0.6, -8, -262 + bob * 0.6, 0, -244 + bob * 0.6, 10, -256 + bob * 0.6, 20, -240 + bob * 0.6]);
    g.fillStyle = lin(g, -18, 0, 20, 0, '#9BF2E4', '#35B5A2'); g.fill(); ol(g, 3);                          // crystal crest
    g.restore();
  }

  function drawDragon(g, t, o) {
    var bob = Math.sin(t * 2.2) * 5, flap = Math.sin(t * 5) * 0.2 - o.wind * 0.55, jit = o.hurt * Math.sin(t * 70) * 5, i, a, fl;
    var r1 = o.angry ? '#FF8F4A' : '#FF7A55', r2 = '#D63A36', r3 = '#A32530', bel = '#FFE08A';
    g.save(); g.translate(jit, 0); g.lineCap = 'round'; g.lineJoin = 'round';
    // tail with a flame at the tip
    g.beginPath(); g.moveTo(54, -40); g.bezierCurveTo(140, -6, 196, -40, 176, -100);
    g.strokeStyle = NAVY; g.lineWidth = 32; g.stroke(); g.strokeStyle = r2; g.lineWidth = 24; g.stroke();
    fl = 1 + Math.sin(t * 13) * 0.14;
    g.save(); g.translate(176, -104); g.rotate(-0.25); g.scale(fl, fl);
    g.beginPath(); g.moveTo(-15, 6); g.quadraticCurveTo(-22, -20, 0, -46); g.quadraticCurveTo(22, -20, 15, 6); g.closePath(); g.fillStyle = '#FF8A3D'; g.fill(); ol(g, 3.5);
    g.beginPath(); g.moveTo(-7, 4); g.quadraticCurveTo(-10, -10, 0, -24); g.quadraticCurveTo(10, -10, 7, 4); g.closePath(); g.fillStyle = '#FFE27A'; g.fill();
    g.restore();
    // wings
    for (i = -1; i <= 1; i += 2) {
      g.save(); g.translate(i * 54, -138 + bob); g.scale(i, 1); g.rotate(-0.32 + flap);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(118, -84); g.quadraticCurveTo(150, -30, 152, 14); g.quadraticCurveTo(128, -2, 112, 30); g.quadraticCurveTo(92, 6, 74, 36); g.quadraticCurveTo(50, 14, 22, 34); g.closePath();
      g.fillStyle = lin(g, 0, -80, 150, 30, '#C8424A', r3); g.fill(); ol(g, 4);
      g.lineWidth = 3; g.strokeStyle = 'rgba(27,42,73,0.5)'; g.beginPath(); g.moveTo(8, 0); g.lineTo(112, 28); g.moveTo(8, 0); g.lineTo(74, 34); g.moveTo(8, 0); g.lineTo(146, 8); g.stroke();
      g.restore();
    }
    // feet
    for (i = -1; i <= 1; i += 2) { ell(g, i * 46, -10, 34, 16); g.fillStyle = r2; g.fill(); ol(g, 4); g.fillStyle = '#FFF3D6'; poly(g, [i * 46 - 22, -4, i * 46 - 14, 8, i * 46 - 8, -4]); g.fill(); ol(g, 2); poly(g, [i * 46 - 4, -2, i * 46 + 4, 10, i * 46 + 10, -2]); g.fill(); ol(g, 2); }
    // body
    ell(g, 0, -88 + bob * 0.4, 88, 88); g.fillStyle = lin(g, -70, -170, 70, -10, r1, r2); g.fill();
    g.save(); ell(g, 0, -88 + bob * 0.4, 88, 88); g.clip();
    g.fillStyle = 'rgba(90,10,30,0.26)'; ell(g, 96, -70, 60, 120, 0.15); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)'; ell(g, -46, -138, 26, 12, -0.6); g.fill();
    g.restore();
    ell(g, 0, -88 + bob * 0.4, 88, 88); ol(g, 5);
    ell(g, 0, -72 + bob * 0.4, 52, 62); g.fillStyle = bel; g.fill(); ol(g, 3.5);                             // belly plates
    g.strokeStyle = 'rgba(190,120,30,0.6)'; g.lineWidth = 3;
    for (i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-40 + i * 3, -100 + i * 22 + bob * 0.4); g.quadraticCurveTo(0, -90 + i * 22 + bob * 0.4, 40 - i * 3, -100 + i * 22 + bob * 0.4); g.stroke(); }
    // head
    g.save(); g.translate(0, -182 + bob);
    for (i = -1; i <= 1; i += 2) { poly(g, [i * 30, -32, i * 52, -72, i * 52 - i * 22, -40]); g.fillStyle = '#FFF3D6'; g.fill(); ol(g, 3.5); }   // horns
    poly(g, [-12, -44, 0, -64, 12, -44]); g.fillStyle = r3; g.fill(); ol(g, 3.5);
    ell(g, 0, 0, 66, 48); g.fillStyle = lin(g, -50, -45, 50, 40, r1, r2); g.fill(); ol(g, 5);
    g.fillStyle = 'rgba(255,255,255,0.28)'; ell(g, -32, -28, 20, 8, -0.4); g.fill();
    ell(g, 0, 24, 44, 26); g.fillStyle = shade(r1, 0.22); g.fill(); ol(g, 4);                                 // snout
    g.fillStyle = NAVY; ell(g, -15, 16, 4.5, 6, 0.3); g.fill(); ell(g, 15, 16, 4.5, 6, -0.3); g.fill();
    eyeBall(g, -30, -12, 17, o, t, '#FFC933'); eyeBall(g, 30, -12, 17, o, t, '#FFC933');
    brows(g, 30, -34, 16, o);
    if (o.angry || o.wind > 0.3) {                         // fire in the mouth
      fl = 1 + Math.sin(t * 17) * 0.16;
      g.beginPath(); g.moveTo(-22, 34); g.quadraticCurveTo(0, 34 + 40 * fl, 22, 34); g.closePath(); g.fillStyle = '#FF8A3D'; g.fill(); ol(g, 3);
      g.beginPath(); g.moveTo(-11, 35); g.quadraticCurveTo(0, 35 + 22 * fl, 11, 35); g.closePath(); g.fillStyle = '#FFE27A'; g.fill();
    } else if (o.dazed) { ell(g, 0, 36, 9, 7); g.fillStyle = '#3B1E3A'; g.fill(); ol(g, 3); }
    else { g.beginPath(); g.moveTo(-22, 34); g.quadraticCurveTo(0, o.sleep ? 38 : 46, 22, 34); g.lineWidth = 4; g.strokeStyle = NAVY; g.stroke(); }
    if (!o.dazed) for (i = -1; i <= 1; i += 2) {           // smoke from the nose
      a = (t * 0.7 + (i > 0 ? 0.5 : 0)) % 1;
      g.fillStyle = 'rgba(255,255,255,' + (0.5 * (1 - a)) + ')'; ell(g, i * 17 + i * a * 14, 10 - a * 34, 5 + a * 8, 5 + a * 8); g.fill();
    }
    g.restore();
    g.restore();
  }

  // Coral Crab: a wide shell with coral growing on it, eyes on stalks and two big claws that open when it winds up
  function drawCrab(g, t, o) {
    var bob = Math.sin(t * 2.4) * 3, jit = o.hurt * Math.sin(t * 70) * 5, i, k, a;
    var c1 = o.angry ? '#FF8A5A' : '#FFA58A', c2 = '#EC5B48', c3 = '#B5362F';
    g.save(); g.translate(jit, 0); g.lineCap = 'round'; g.lineJoin = 'round';
    for (i = -1; i <= 1; i += 2) for (k = 0; k < 3; k++) {       // legs
      a = Math.sin(t * 6 + k * 1.4 + (i > 0 ? 1.2 : 0)) * 5;
      g.beginPath(); g.moveTo(i * 92, -58 + k * 8); g.quadraticCurveTo(i * (146 + k * 8), -92 + k * 14 + a, i * (150 + k * 14), -6);
      g.strokeStyle = NAVY; g.lineWidth = 20; g.stroke(); g.strokeStyle = c2; g.lineWidth = 12; g.stroke();
    }
    for (i = -1; i <= 1; i += 2) {                               // claws
      g.save(); g.translate(i * 150, -146 + bob - o.wind * 30); g.scale(i, 1); g.rotate(-0.2 - o.wind * 0.25);
      g.beginPath(); g.moveTo(-46, 66); g.quadraticCurveTo(-34, 22, -4, 8); g.strokeStyle = NAVY; g.lineWidth = 30; g.stroke(); g.strokeStyle = c2; g.lineWidth = 22; g.stroke();
      a = 0.16 + o.wind * 0.5 + Math.sin(t * 3 + i) * 0.05;
      g.save(); g.rotate(a);                                     // the lower finger
      g.beginPath(); g.moveTo(-20, 10); g.quadraticCurveTo(22, 30, 62, -4); g.quadraticCurveTo(30, 2, 10, -14); g.closePath(); g.fillStyle = c3; g.fill(); ol(g, 4);
      g.restore();
      g.save(); g.rotate(-a);                                    // the big upper one
      g.beginPath(); g.moveTo(-30, 12); g.bezierCurveTo(-46, -44, 6, -84, 66, -50); g.quadraticCurveTo(34, -40, 20, -8); g.quadraticCurveTo(-4, 14, -30, 12); g.closePath();
      g.fillStyle = lin(g, -30, -70, 50, 10, c1, c2); g.fill(); ol(g, 4.5);
      g.fillStyle = 'rgba(255,255,255,0.4)'; ell(g, -8, -44, 16, 7, -0.7); g.fill();
      g.restore();
      g.restore();
    }
    // shell
    ell(g, 0, -86 + bob, 124, 78); g.fillStyle = lin(g, -100, -160, 100, -10, c1, c2); g.fill();
    g.save(); ell(g, 0, -86 + bob, 124, 78); g.clip();
    g.fillStyle = 'rgba(120,20,30,0.24)'; ell(g, 130, -60 + bob, 80, 120, 0.2); g.fill();
    g.fillStyle = 'rgba(120,20,30,0.14)'; g.fillRect(-140, -40 + bob, 280, 50);
    g.fillStyle = 'rgba(255,255,255,0.45)'; ell(g, -62, -136 + bob, 36, 13, -0.4); g.fill();
    g.fillStyle = 'rgba(255,240,220,0.5)';
    [[-78, -92, 9], [-50, -70, 6], [74, -104, 8], [52, -74, 6], [88, -76, 5], [-96, -68, 5]].forEach(function (q) { ell(g, q[0], q[1] + bob, q[2], q[2] * 0.8); g.fill(); });
    g.restore();
    ell(g, 0, -86 + bob, 124, 78); ol(g, 5);
    // coral on its back
    [[-66, -150, -0.3, '#FF8FB8'], [70, -146, 0.35, '#8FE3FF'], [4, -164, 0, '#FFD66B']].forEach(function (q) {
      g.save(); g.translate(q[0], q[1] + bob); g.rotate(q[2]);
      g.beginPath(); g.moveTo(0, 6); g.lineTo(0, -24); g.moveTo(0, -8); g.lineTo(-13, -26); g.moveTo(0, -14); g.lineTo(13, -30);
      g.strokeStyle = NAVY; g.lineWidth = 13; g.stroke(); g.strokeStyle = q[3]; g.lineWidth = 6.5; g.stroke();
      g.restore();
    });
    // eyes on stalks
    for (i = -1; i <= 1; i += 2) {
      g.beginPath(); g.moveTo(i * 34, -138 + bob); g.lineTo(i * 40, -178 + bob * 1.6);
      g.strokeStyle = NAVY; g.lineWidth = 15; g.stroke(); g.strokeStyle = c2; g.lineWidth = 8; g.stroke();
      eyeBall(g, i * 40, -190 + bob * 1.6, 21, o, t);
    }
    brows(g, 40, -216 + bob * 1.6, 18, o);
    g.fillStyle = 'rgba(255,255,255,0.35)'; ell(g, -70, -70 + bob, 14, 8); g.fill(); ell(g, 70, -70 + bob, 14, 8); g.fill();
    if (o.dazed) { ell(g, 0, -66 + bob, 10, 12 + Math.sin(t * 8) * 3); g.fillStyle = '#3B1E3A'; g.fill(); ol(g, 3.5); }
    else {
      g.beginPath();
      if (o.angry) { g.moveTo(-30, -58 + bob); g.quadraticCurveTo(0, -80 + bob, 30, -58 + bob); }
      else { g.moveTo(-30, -74 + bob); g.quadraticCurveTo(0, o.sleep ? -66 + bob : -48 + bob - o.wind * 10, 30, -74 + bob); }
      g.lineWidth = 5; g.strokeStyle = NAVY; g.stroke();
    }
    g.restore();
  }

  // Clock Tortoise: a big shell with a clock face (the hands race when it winds up) and a wind-up key on top
  function drawTortoise(g, t, o) {
    var bob = Math.sin(t * 1.6) * 3, jit = o.hurt * Math.sin(t * 70) * 5, i, a, spin = o.dazed ? t * 9 : t * 0.9 + o.wind * 4;
    var c1 = '#9BE0A8', c2 = '#3F9E6A', c3 = '#2A7250', sk1 = o.angry ? '#E9D97A' : '#CDE89A', sk2 = '#8FBF5F';
    function dome() { g.beginPath(); g.moveTo(-150, -34); g.bezierCurveTo(-150, -150, -84, -226, 0, -226); g.bezierCurveTo(84, -226, 150, -150, 150, -34); g.quadraticCurveTo(0, -4, -150, -34); g.closePath(); }
    g.save(); g.translate(jit, 0); g.lineCap = 'round'; g.lineJoin = 'round';
    for (i = -1; i <= 1; i += 2) {                               // feet
      ell(g, i * 118, -18, 40, 22, i * 0.25); g.fillStyle = sk2; g.fill(); ol(g, 4);
      g.fillStyle = '#FFF3D6'; ell(g, i * 140, -10, 7, 5); g.fill(); ell(g, i * 124, -4, 7, 5); g.fill();
    }
    // the key
    g.save(); g.translate(0, -226 + bob); g.rotate(Math.sin(spin * 2) * 0.5);
    rr(g, -6, -22, 12, 26, 4); g.fillStyle = '#D9A02A'; g.fill(); ol(g, 3.5);
    ell(g, -18, -34, 15, 12); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 3.5); ell(g, 18, -34, 15, 12); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 3.5);
    g.fillStyle = shade('#FFD66B', -0.35); ell(g, -18, -34, 6, 4.5); g.fill(); ell(g, 18, -34, 6, 4.5); g.fill();
    g.restore();
    // shell
    g.save(); g.translate(0, bob);
    dome(); g.fillStyle = lin(g, -110, -220, 110, -20, c1, c2); g.fill();
    g.save(); dome(); g.clip();
    g.fillStyle = 'rgba(10,60,40,0.26)'; ell(g, 150, -100, 80, 160, 0.15); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.4)'; ell(g, -84, -176, 38, 14, -0.7); g.fill();
    g.strokeStyle = 'rgba(20,80,50,0.45)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(-136, -90); g.lineTo(-86, -112); g.moveTo(136, -90); g.lineTo(86, -112); g.moveTo(-94, -196); g.lineTo(-58, -172); g.moveTo(94, -196); g.lineTo(58, -172); g.moveTo(-60, -34); g.lineTo(-48, -58); g.moveTo(60, -34); g.lineTo(48, -58); g.stroke();
    g.restore();
    dome(); ol(g, 5);
    g.beginPath(); g.moveTo(-150, -34); g.quadraticCurveTo(0, -4, 150, -34); g.quadraticCurveTo(0, -30, -150, -34); g.closePath(); g.fillStyle = '#D9A02A'; g.fill(); ol(g, 4);   // brass rim
    // the clock face
    ell(g, 0, -122, 74, 74); g.fillStyle = '#D9A02A'; g.fill(); ol(g, 4.5);
    ell(g, 0, -122, 62, 62); g.fillStyle = lin(g, -50, -180, 50, -70, '#FFFBEA', '#F3E3B0'); g.fill(); ol(g, 3);
    g.strokeStyle = NAVY;
    for (i = 0; i < 12; i++) { a = i * TAU / 12; g.lineWidth = i % 3 ? 2.5 : 5; g.beginPath(); g.moveTo(Math.cos(a) * 50, -122 + Math.sin(a) * 50); g.lineTo(Math.cos(a) * 57, -122 + Math.sin(a) * 57); g.stroke(); }
    g.lineWidth = 7; g.strokeStyle = o.angry ? '#E0344F' : NAVY; g.beginPath(); g.moveTo(0, -122); g.lineTo(Math.cos(spin * 0.4 - 1.57) * 28, -122 + Math.sin(spin * 0.4 - 1.57) * 28); g.stroke();
    g.lineWidth = 5; g.beginPath(); g.moveTo(0, -122); g.lineTo(Math.cos(spin * 2.2 - 1.57) * 46, -122 + Math.sin(spin * 2.2 - 1.57) * 46); g.stroke();
    ell(g, 0, -122, 7, 7); g.fillStyle = '#E0344F'; g.fill(); ol(g, 2.5);
    g.restore();
    // head
    g.save(); g.translate(0, -34 + bob * 0.5 + o.wind * 8);
    ell(g, 0, 0, 50, 38); g.fillStyle = lin(g, -40, -34, 40, 34, sk1, sk2); g.fill(); ol(g, 5);
    g.fillStyle = 'rgba(255,255,255,0.35)'; ell(g, -22, -20, 16, 6, -0.4); g.fill();
    eyeBall(g, -21, -8, 13, o, t); eyeBall(g, 21, -8, 13, o, t);
    brows(g, 21, -26, 12, o);
    g.fillStyle = 'rgba(255,120,150,0.45)'; ell(g, -36, 8, 9, 5); g.fill(); ell(g, 36, 8, 9, 5); g.fill();
    if (o.dazed) { ell(g, 0, 18, 7, 6); g.fillStyle = '#3B1E3A'; g.fill(); ol(g, 3); }
    else { g.beginPath(); g.moveTo(-15, 15); g.quadraticCurveTo(0, o.angry ? 8 : o.sleep ? 19 : 26, 15, 15); g.lineWidth = 4.5; g.strokeStyle = NAVY; g.stroke(); }
    g.restore();
    g.restore();
  }

  // Storm Owl: hovers on spread wings, big yellow eyes, a lightning bolt on its chest
  function drawOwl(g, t, o) {
    var bob = Math.sin(t * 2.6) * 7 - 14, flap = Math.sin(t * 6) * 0.22 - o.wind * 0.6, jit = o.hurt * Math.sin(t * 70) * 5, i, k;
    var p1 = o.angry ? '#B59CFF' : '#A99BFF', p2 = '#6A55D8', p3 = '#43359C', bel = '#E8E4FF';
    function body() { g.beginPath(); g.moveTo(0, -214); g.bezierCurveTo(74, -214, 100, -150, 92, -92); g.bezierCurveTo(86, -40, 46, -14, 0, -14); g.bezierCurveTo(-46, -14, -86, -40, -92, -92); g.bezierCurveTo(-100, -150, -74, -214, 0, -214); g.closePath(); }
    g.save(); g.translate(jit, bob); g.lineCap = 'round'; g.lineJoin = 'round';
    for (i = -1; i <= 1; i += 2) {                               // wings with three rows of feathers
      g.save(); g.translate(i * 70, -150); g.scale(i, 1); g.rotate(-0.2 + flap);
      g.beginPath(); g.moveTo(0, -6); g.quadraticCurveTo(80, -70, 156, -50); g.quadraticCurveTo(150, -22, 132, -8); g.quadraticCurveTo(140, 12, 116, 24); g.quadraticCurveTo(118, 44, 90, 48); g.quadraticCurveTo(86, 66, 56, 62); g.quadraticCurveTo(40, 78, 8, 64); g.closePath();
      g.fillStyle = lin(g, 0, -60, 140, 60, p2, p3); g.fill(); ol(g, 4.5);
      g.strokeStyle = 'rgba(232,228,255,0.6)'; g.lineWidth = 3.5;
      g.beginPath(); g.moveTo(18, 4); g.quadraticCurveTo(76, -28, 128, -26); g.moveTo(22, 28); g.quadraticCurveTo(66, 8, 106, 10); g.moveTo(22, 48); g.quadraticCurveTo(48, 40, 74, 42); g.stroke();
      g.restore();
    }
    for (i = -1; i <= 1; i += 2) {                               // talons
      g.fillStyle = '#FFC933'; for (k = -1; k <= 1; k++) { ell(g, i * 34 + k * 11, -6, 7, 13, k * 0.3); g.fill(); ol(g, 3); }
    }
    for (i = -1; i <= 1; i += 2) { poly(g, [i * 34, -204, i * 74, -252, i * 76, -184]); g.fillStyle = p2; g.fill(); ol(g, 4.5); }   // ear tufts
    body(); g.fillStyle = lin(g, -80, -210, 80, -20, p1, p2); g.fill();
    g.save(); body(); g.clip();
    g.fillStyle = 'rgba(30,10,90,0.26)'; ell(g, 104, -100, 60, 130, 0.12); g.fill();
    ell(g, 0, -74, 58, 66); g.fillStyle = bel; g.fill();
    g.strokeStyle = 'rgba(106,85,216,0.55)'; g.lineWidth = 3.5;
    for (k = 0; k < 3; k++) for (i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 26 - 9 + (k % 2) * 13, -92 + k * 22); g.lineTo(i * 26 + (k % 2) * 13, -84 + k * 22); g.lineTo(i * 26 + 9 + (k % 2) * 13, -92 + k * 22); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.35)'; ell(g, -50, -186, 26, 10, -0.6); g.fill();
    g.restore();
    body(); ol(g, 5);
    poly(g, [8, -112, -14, -76, 0, -76, -10, -44, 18, -86, 4, -86]); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 3);              // the bolt
    for (i = -1; i <= 1; i += 2) { ell(g, i * 38, -152, 38, 38); g.fillStyle = shade(p1, 0.3); g.fill(); ol(g, 3.5); }           // face discs
    eyeBall(g, -38, -152, 27, o, t, '#FFC933'); eyeBall(g, 38, -152, 27, o, t, '#FFC933');
    brows(g, 38, -188, 22, o);
    poly(g, [-13, -134, 13, -134, 0, o.wind > 0.3 || o.angry ? -102 : -110]); g.fillStyle = '#FFA53D'; g.fill(); ol(g, 3.5);   // beak
    g.restore();
  }
  function drawBoss(g, kind, t, o) {
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (kind === 1) drawGolem(g, t, o); else if (kind === 2) drawDragon(g, t, o); else if (kind === 3) drawCrab(g, t, o);
    else if (kind === 4) drawTortoise(g, t, o); else if (kind === 5) drawOwl(g, t, o); else drawSlime(g, t, o);
  }

  // ---------- the shield: a bubble round the boss, and one rune plate per fighter ----------
  function drawBubble(g, k) {
    g.save(); g.translate(0, -100); g.scale(k, k);
    var q = g.createRadialGradient(0, 0, 40, 0, 0, 176);
    q.addColorStop(0, 'rgba(140,210,255,0.03)'); q.addColorStop(0.75, 'rgba(140,210,255,0.14)'); q.addColorStop(1, 'rgba(140,210,255,0.42)');
    ell(g, 0, 0, 176, 128); g.fillStyle = q; g.fill();
    g.lineWidth = 5; g.strokeStyle = 'rgba(200,238,255,0.95)'; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.ellipse(0, 0, 158, 110, 0, Math.PI * 1.08, Math.PI * 1.36); g.stroke();
    g.beginPath(); g.ellipse(0, 0, 158, 110, 0, Math.PI * 1.42, Math.PI * 1.47); g.stroke();
    g.restore();
  }
  function plate(g) { g.beginPath(); g.moveTo(-60, -54); g.lineTo(60, -54); g.lineTo(60, 2); g.quadraticCurveTo(56, 44, 0, 64); g.quadraticCurveTo(-56, 44, -60, 2); g.closePath(); }
  // One rune, centred on (0, 0), 120 wide before scaling. It is drawn in the fighter's colour and fills up from
  // the bottom as their sum grows. r = { t: the number (0: lit, nothing more to do), sum, has, done }.
  // A bonus rune (the fighter's own is lit already, or they came late) has a gold rim and a star.
  function drawRune(g, r, col, sc) {
    var lit = !r.t, bonus = r.done || !r.has, f = lit ? 1 : clamp(r.sum / r.t, 0, 1);
    g.save(); g.scale(sc, sc);
    g.save(); g.translate(7, 6); plate(g); g.fillStyle = shade(col, -0.6); g.fill(); ol(g, 5); g.restore();     // the side face
    plate(g); g.fillStyle = lit ? lin(g, -60, -54, 60, 60, '#FFF9D6', '#FFD66B') : lin(g, -60, -54, 60, 60, shade(col, -0.16), shade(col, -0.46)); g.fill();
    g.save(); plate(g); g.clip();
    if (!lit && f > 0) { g.fillStyle = lin(g, -60, -54, 60, 60, shade(col, 0.3), col); g.fillRect(-66, 66 - 122 * f, 132, 122 * f + 2); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(-66, 66 - 122 * f - 2, 132, 4); }
    g.fillStyle = 'rgba(255,255,255,0.2)'; poly(g, [-60, -54, -8, -54, -50, 30, -60, 30]); g.fill();
    g.restore();
    plate(g); ol(g, 5);
    g.save(); g.scale(0.84, 0.84); plate(g); g.lineWidth = bonus && !lit ? 5 : 3.5; g.strokeStyle = bonus && !lit ? '#FFD66B' : 'rgba(255,255,255,0.85)'; g.stroke(); g.restore();
    if (lit) { g.lineWidth = 15; g.strokeStyle = NAVY; g.beginPath(); g.moveTo(-26, 2); g.lineTo(-7, 22); g.lineTo(28, -22); g.stroke(); g.lineWidth = 8; g.strokeStyle = '#3FAE5A'; g.stroke(); }
    else txt(g, String(r.t), 0, 2, r.t > 9 ? 56 : 66, '#fff', NAVY, 9);
    if (bonus && !lit) { api.starPath(g, 0, -56, 17); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 3.5); }
    if (r.done && !lit) {                // the rune of the shield is lit already: a tick in the corner
      ell(g, 50, -46, 19, 19); g.fillStyle = '#5DBB63'; g.fill(); ol(g, 3.5);
      g.lineWidth = 5; g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(41, -46); g.lineTo(48, -39); g.lineTo(59, -53); g.stroke();
    }
    g.restore();
  }

  // minions: a little slime, a rockling, a flame sprite, a baby crab, a hatchling, a storm puff. Feet at (0, 0).
  function drawMinion(g, kind, t, id) {
    var b = Math.sin(t * 8 + id) * 0.1, i;
    g.fillStyle = SH; ell(g, 3, 1, 24, 8); g.fill();
    g.save();
    if (kind === 1) {
      g.translate(0, -Math.abs(Math.sin(t * 9 + id)) * 6);
      g.fillStyle = NAVY; ell(g, -12, -2, 9, 5); g.fill(); ell(g, 12, -2, 9, 5); g.fill();
      rr(g, -20, -40, 46, 38, 13); g.fillStyle = '#5F6878'; g.fill(); ol(g, 3.5);
      rr(g, -24, -44, 46, 38, 13); g.fillStyle = lin(g, -24, -44, 22, -6, '#C3C9D4', '#8A93A3'); g.fill(); ol(g, 3.5);
      for (i = -1; i <= 1; i += 2) { poly(g, [i * 10 - 7 - 1, -32, i * 10 + 7 - 1, -32, i * 10 + 6 - 1, -22, i * 10 - 6 - 1, -22]); g.fillStyle = '#FFB03B'; g.fill(); ol(g, 2.5); }
    } else if (kind === 2) {
      g.scale(1 - b, 1 + b);
      g.beginPath(); g.moveTo(-22, -6); g.quadraticCurveTo(-30, -34, -6, -52); g.quadraticCurveTo(-4, -40, 6, -62); g.quadraticCurveTo(32, -34, 22, -6); g.quadraticCurveTo(0, 6, -22, -6); g.closePath();
      g.fillStyle = lin(g, 0, -60, 0, 0, '#FFC93D', '#FF6A2A'); g.fill(); ol(g, 3.5);
      g.beginPath(); g.moveTo(-11, -6); g.quadraticCurveTo(-14, -22, 0, -34); g.quadraticCurveTo(14, -22, 11, -6); g.closePath(); g.fillStyle = '#FFF0A0'; g.fill();
      g.fillStyle = NAVY; ell(g, -8, -20, 4, 5.5); g.fill(); ell(g, 8, -20, 4, 5.5); g.fill();
    } else if (kind === 3) {
      g.translate(Math.sin(t * 12 + id) * 3, 0);
      g.lineWidth = 8; g.strokeStyle = NAVY; g.beginPath(); g.moveTo(-20, -12); g.lineTo(-30, -2); g.moveTo(20, -12); g.lineTo(30, -2); g.stroke();
      g.lineWidth = 4; g.strokeStyle = '#EC5B48'; g.stroke();
      ell(g, 0, -18, 25, 17); g.fillStyle = lin(g, -20, -34, 20, 0, '#FFA58A', '#EC5B48'); g.fill(); ol(g, 3.5);
      for (i = -1; i <= 1; i += 2) { ell(g, i * 26, -34, 9, 7, i * 0.5); g.fillStyle = '#EC5B48'; g.fill(); ol(g, 3); ell(g, i * 9, -36, 6, 6); g.fillStyle = '#fff'; g.fill(); ol(g, 2); ell(g, i * 9, -35, 2.6, 2.6); g.fillStyle = NAVY; g.fill(); }
    } else if (kind === 4) {
      g.translate(0, -Math.abs(Math.sin(t * 7 + id)) * 3);
      ell(g, 20, -12, 11, 9); g.fillStyle = '#CDE89A'; g.fill(); ol(g, 3);
      g.fillStyle = NAVY; ell(g, 23, -14, 2.4, 2.4); g.fill();
      g.beginPath(); g.moveTo(-24, -6); g.bezierCurveTo(-24, -42, 18, -42, 18, -6); g.quadraticCurveTo(-3, 2, -24, -6); g.closePath();
      g.fillStyle = lin(g, -20, -36, 16, 0, '#9BE0A8', '#3F9E6A'); g.fill(); ol(g, 3.5);
      ell(g, -3, -20, 9, 9); g.fillStyle = '#FFFBEA'; g.fill(); ol(g, 2.5);
      g.lineWidth = 2.5; g.strokeStyle = NAVY; g.beginPath(); g.moveTo(-3, -20); g.lineTo(-3 + Math.cos(t * 6 + id) * 6, -20 + Math.sin(t * 6 + id) * 6); g.stroke();
    } else if (kind === 5) {
      g.translate(0, -8 + Math.sin(t * 6 + id) * 4);
      g.beginPath(); g.arc(-13, -18, 14, 0, TAU); g.arc(6, -26, 17, 0, TAU); g.arc(18, -14, 12, 0, TAU); g.arc(0, -12, 14, 0, TAU);
      g.fillStyle = '#B9B2E6'; g.fill(); ol(g, 6); g.fillStyle = '#D9D4FA'; g.fill();
      g.fillStyle = NAVY; ell(g, -5, -19, 3.4, 4.6); g.fill(); ell(g, 9, -19, 3.4, 4.6); g.fill();
      poly(g, [2, -6, -6, 6, 0, 6, -4, 16, 8, 2, 2, 2]); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2);
    } else {
      g.scale(1 + b, 1 - b);
      g.beginPath(); g.moveTo(-26, 0); g.bezierCurveTo(-32, -46, 32, -46, 26, 0); g.quadraticCurveTo(0, 8, -26, 0); g.closePath();
      g.fillStyle = lin(g, -20, -40, 20, 0, '#B9F383', '#4CBD5D'); g.fill(); ol(g, 3.5);
      g.fillStyle = 'rgba(255,255,255,0.55)'; ell(g, -11, -28, 7, 4, -0.5); g.fill();
      for (i = -1; i <= 1; i += 2) { ell(g, i * 9, -17, 6.5, 6.5); g.fillStyle = '#fff'; g.fill(); ol(g, 2); ell(g, i * 9, -15.5, 3, 3); g.fillStyle = NAVY; g.fill(); }
    }
    g.restore();
  }
  // what rolls across the cave, centre at (0, 0): a rock, a fireball (dragon), a spiral shell (crab), a cog
  // (tortoise), a whirlwind (owl)
  function drawRock(g, r, ang, kind) {
    var i, a, k;
    if (kind === 5) {
      for (i = 0; i < 5; i++) {
        k = i / 4; a = ang * 1.4 + i * 1.3;
        ell(g, Math.cos(a) * 8 * (1 - k * 0.4), r * 0.9 - k * r * 2.4, r * (0.4 + k * 0.9), r * (0.16 + k * 0.2));
        g.fillStyle = i % 2 ? 'rgba(232,228,255,0.85)' : 'rgba(169,155,255,0.85)'; g.fill(); ol(g, 3);
      }
      return;
    }
    if (kind === 4) {
      g.save(); g.rotate(ang);
      g.beginPath(); for (i = 0; i < 16; i++) { a = i * TAU / 16; k = i % 2 ? r * 1.12 : r * 0.86; g.lineTo(Math.cos(a - 0.1) * k, Math.sin(a - 0.1) * k); g.lineTo(Math.cos(a + 0.1) * k, Math.sin(a + 0.1) * k); } g.closePath();
      g.fillStyle = lin(g, -r, -r, r, r, '#FFE08A', '#C98A1E'); g.fill(); ol(g, 4);
      ell(g, 0, 0, r * 0.5, r * 0.5); g.fillStyle = '#8A5A12'; g.fill(); ol(g, 3);
      g.lineWidth = 4; g.strokeStyle = NAVY; g.beginPath(); g.moveTo(-r * 0.5, 0); g.lineTo(r * 0.5, 0); g.moveTo(0, -r * 0.5); g.lineTo(0, r * 0.5); g.stroke();
      g.restore();
      return;
    }
    if (kind === 2) { g.fillStyle = 'rgba(255,138,61,0.35)'; ell(g, 0, 0, r + 9, r + 9); g.fill(); }
    ell(g, 0, 0, r, r); g.fillStyle = kind === 2 ? lin(g, -r, -r, r, r, '#FFB24A', '#D8452A') : kind === 3 ? lin(g, -r, -r, r, r, '#FFC2B0', '#E0607F') : lin(g, -r, -r, r, r, '#C9B8A2', '#7A6A5A'); g.fill();
    g.save(); ell(g, 0, 0, r, r); g.clip(); g.rotate(ang);
    if (kind === 3) {                  // a spiral
      g.strokeStyle = 'rgba(140,30,60,0.6)'; g.lineWidth = 3.5; g.beginPath();
      for (a = 0; a < 15; a += 0.4) g.lineTo(Math.cos(a) * r * a / 15, Math.sin(a) * r * a / 15);
      g.stroke();
    } else {
      g.fillStyle = kind === 2 ? 'rgba(255,240,160,0.75)' : 'rgba(60,45,35,0.32)';
      for (i = 0; i < 5; i++) { a = i * TAU / 5; ell(g, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.2, r * 0.13, a); g.fill(); }
    }
    g.restore();
    ell(g, 0, 0, r, r); ol(g, 4);
    g.fillStyle = 'rgba(255,255,255,0.3)'; ell(g, -r * 0.35, -r * 0.45, r * 0.3, r * 0.14, -0.6); g.fill();
  }
  // the magic cannon, wheels on the floor at (0, 0), barrel pointing at the boss
  function drawCannon(g, t, recoil, glow) {
    var i, y = recoil * 12;
    g.fillStyle = SH; ell(g, 8, 4, 72, 20); g.fill();
    for (i = -1; i <= 1; i += 2) {                                   // wheels
      ell(g, i * 50 + 5, -18, 13, 22); g.fillStyle = '#5A3A22'; g.fill(); ol(g, 4);
      ell(g, i * 50, -18, 13, 22); g.fillStyle = '#B77B45'; g.fill(); ol(g, 4);
      ell(g, i * 50, -18, 5, 9); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2.5);
    }
    rr(g, -40, -34, 88, 34, 10); g.fillStyle = '#6F4526'; g.fill(); ol(g, 4);         // carriage, side then front
    rr(g, -44, -38, 88, 34, 10); g.fillStyle = lin(g, 0, -38, 0, -4, '#C98C52', '#9A6236'); g.fill(); ol(g, 4);
    g.save(); g.translate(0, y);
    poly(g, [-30, -30, 36, -30, 30, -104, -22, -104]); g.fillStyle = '#4A35A8'; g.fill(); ol(g, 4);   // barrel side
    poly(g, [-34, -30, 30, -30, 24, -104, -28, -104]); g.fillStyle = lin(g, -34, 0, 30, 0, '#A98BFF', '#6A4BD8'); g.fill(); ol(g, 4);
    g.fillStyle = 'rgba(255,255,255,0.35)'; poly(g, [-26, -34, -16, -34, -18, -100, -24, -100]); g.fill();
    rr(g, -36, -50, 68, 12, 5); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 3.5);
    rr(g, -32, -88, 60, 11, 5); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 3.5);
    api.starPath(g, -2, -68, 10); g.fillStyle = '#FFF3D6'; g.fill(); ol(g, 2.5);
    ell(g, -2, -104, 30, 12); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 4);            // muzzle
    ell(g, -2, -104, 21, 7.5); g.fillStyle = glow > 0 ? 'rgb(' + Math.round(60 + glow * 195) + ',' + Math.round(40 + glow * 200) + ',' + Math.round(120 + glow * 100) + ')' : '#3C2878'; g.fill(); ol(g, 3);
    g.restore();
  }
  function drawRaft(g, t) {             // the Coral Crab's cave: the cannon stands on a raft in the channel
    var i;
    g.save(); g.translate(0, Math.sin(t * 2) * 2);
    rr(g, -92, -6, 196, 44, 12); g.fillStyle = '#6F4526'; g.fill(); ol(g, 4);
    rr(g, -98, -14, 196, 44, 12); g.fillStyle = lin(g, 0, -14, 0, 30, '#D9A56B', '#A8733F'); g.fill(); ol(g, 4);
    g.strokeStyle = 'rgba(27,42,73,0.4)'; g.lineWidth = 3;
    for (i = 1; i < 5; i++) { g.beginPath(); g.moveTo(-98 + i * 39, -12); g.lineTo(-98 + i * 39, 28); g.stroke(); }
    g.restore();
  }
  function padlock(g, x, y, s) {
    g.save(); g.translate(x, y); g.scale(s / 40, s / 40);
    g.lineWidth = 9; g.strokeStyle = NAVY; g.beginPath(); g.arc(0, -14, 15, Math.PI, 0); g.lineTo(15, 0); g.moveTo(-15, -14); g.lineTo(-15, 0); g.stroke();
    g.lineWidth = 4; g.strokeStyle = '#C9D2DC'; g.beginPath(); g.arc(0, -14, 15, Math.PI, 0); g.lineTo(15, 0); g.moveTo(-15, -14); g.lineTo(-15, 0); g.stroke();
    rr(g, -24, -4, 48, 38, 9); g.fillStyle = lin(g, -24, 0, 24, 0, '#FFE27A', '#F0A52A'); g.fill(); ol(g, 4);
    ell(g, 0, 11, 5.5, 5.5); g.fillStyle = NAVY; g.fill(); g.fillRect(-2.5, 12, 5, 12);
    g.restore();
  }

  // ---------- the cave itself: drawn once into a picture, again after a resize or for another boss ----------
  function stone(g, x, y, r, col) {              // a boulder standing on the floor, foot at (x, y)
    g.fillStyle = SH; ell(g, x + r * 0.3, y, r * 1.05, r * 0.3); g.fill();
    g.beginPath(); g.moveTo(x - r, y); g.quadraticCurveTo(x - r * 1.08, y - r * 0.9, x - r * 0.35, y - r * 1.25);
    g.quadraticCurveTo(x + r * 0.5, y - r * 1.45, x + r * 0.95, y - r * 0.7); g.quadraticCurveTo(x + r * 1.12, y - r * 0.1, x + r * 0.8, y); g.closePath();
    g.fillStyle = lin(g, x - r, y - r * 1.3, x + r, y, shade(col, 0.3), shade(col, -0.24)); g.fill(); ol(g, 4);
    g.fillStyle = 'rgba(255,255,255,0.2)'; ell(g, x - r * 0.3, y - r * 0.95, r * 0.36, r * 0.13, -0.4); g.fill();
  }
  function crystal(g, x, y, s, a, b) {           // a cluster of three shards growing at (x, y)
    var q = g.createRadialGradient(x, y - 26 * s, 4, x, y - 26 * s, 70 * s);
    q.addColorStop(0, a); q.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalAlpha = 0.35; g.fillStyle = q; ell(g, x, y - 26 * s, 70 * s, 70 * s); g.fill(); g.globalAlpha = 1;
    [[-16, -0.42, 34], [14, 0.36, 40], [0, -0.04, 58]].forEach(function (d) {
      g.save(); g.translate(x + d[0] * s, y); g.rotate(d[1]); g.scale(s, s);
      poly(g, [-11, 0, -9, -d[2] + 12, 0, -d[2], 9, -d[2] + 12, 11, 0]); g.fillStyle = a; g.fill();
      poly(g, [0, 0, 0, -d[2], 9, -d[2] + 12, 11, 0]); g.fillStyle = b; g.fill();
      poly(g, [-11, 0, -9, -d[2] + 12, 0, -d[2], 9, -d[2] + 12, 11, 0]); ol(g, 3);
      g.fillStyle = 'rgba(255,255,255,0.6)'; poly(g, [-7, -6, -6, -d[2] + 16, -3, -d[2] + 12, -3, -6]); g.fill();
      g.restore();
    });
  }
  function gear(g, x, y, r, n) {                 // a cog set into the floor (the Clock Tortoise's cave)
    var i, a, k;
    g.beginPath();
    for (i = 0; i < n * 2; i++) { a = i * TAU / (n * 2); k = i % 2 ? r : r * 0.84; g.lineTo(x + Math.cos(a - 0.07) * k, y + Math.sin(a - 0.07) * k * 0.5); g.lineTo(x + Math.cos(a + 0.07) * k, y + Math.sin(a + 0.07) * k * 0.5); }
    g.closePath(); g.fillStyle = 'rgba(255,214,107,0.16)'; g.fill(); g.lineWidth = 3.5; g.strokeStyle = 'rgba(120,84,20,0.45)'; g.stroke();
    ell(g, x, y, r * 0.42, r * 0.21); g.stroke();
  }
  function makeBg() {
    var kind = curBoss(), key = W + '|' + H + '|' + dpr + '|' + COL + '|' + kind, g, th = BOSSES[kind], i, x, y, r, L0, R0, T0, B0, cA = th.cA, cB = th.cB;
    if (bg && bgKey === key) return;
    if (!bg) bg = document.createElement('canvas');
    bgKey = key; bg.width = cv.width; bg.height = cv.height;
    g = bg.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = th.wall; g.fillRect(0, 0, bg.width, bg.height);
    g.setTransform(dpr * vs, 0, 0, dpr * vs, vox * dpr, voy * dpr); g.lineJoin = 'round'; g.lineCap = 'round';
    L0 = -vox / vs - 6; R0 = (W - vox) / vs + 6; T0 = -voy / vs - 6; B0 = (H - voy) / vs + 6;   // what is on screen, in arena units

    // floor
    g.fillStyle = lin(g, 0, 210, 0, 760, th.floor, th.floor2); g.fillRect(L0, 200, R0 - L0, B0 - 200);
    for (i = 0; i < 80; i++) {             // worn flagstones
      x = -60 + seed(i) * 1320; y = 236 + seed(i + 100) * 540; r = 24 + seed(i + 200) * 48;
      g.fillStyle = i % 3 ? 'rgba(255,255,255,0.06)' : 'rgba(20,14,40,0.08)';
      ell(g, x, y, r, r * 0.42, (seed(i + 300) - 0.5) * 0.5); g.fill();
    }
    g.strokeStyle = 'rgba(20,14,40,0.18)'; g.lineWidth = 3;
    for (i = 0; i < 18; i++) {             // cracks
      x = seed(i + 400) * 1200; y = 262 + seed(i + 500) * 470;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 16, y + 8); g.lineTo(x + 30, y + 2); g.lineTo(x + 44, y + 12); g.stroke();
    }
    if (kind === 0) {                      // slime puddles near the edges
      [[112, 318, 44], [1092, 356, 38], [150, 704, 50], [1040, 716, 46], [330, 262, 30], [880, 258, 34]].forEach(function (q) {
        ell(g, q[0], q[1], q[2], q[2] * 0.36); g.fillStyle = 'rgba(123,224,107,0.55)'; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(40,120,70,0.55)'; g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.4)'; ell(g, q[0] - q[2] * 0.35, q[1] - q[2] * 0.1, q[2] * 0.22, q[2] * 0.06, -0.2); g.fill();
      });
    } else if (kind === 2) {               // glowing cracks of lava
      [[90, 700, 1], [1110, 690, -1], [120, 300, 1], [1080, 310, -1], [420, 742, 1], [800, 744, -1]].forEach(function (q) {
        g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] + q[2] * 26, q[1] - 12); g.lineTo(q[0] + q[2] * 44, q[1] + 4); g.lineTo(q[0] + q[2] * 76, q[1] - 8); g.lineTo(q[0] + q[2] * 96, q[1] + 8);
        g.strokeStyle = 'rgba(255,138,61,0.3)'; g.lineWidth = 13; g.stroke(); g.strokeStyle = '#FF9A3D'; g.lineWidth = 4.5; g.stroke(); g.strokeStyle = '#FFE27A'; g.lineWidth = 1.6; g.stroke();
      });
    } else if (kind === 3) {               // the channel the cannon's raft drifts along, and starfish in the sand
      rr(g, 236, 566, 728, 92, 44); g.fillStyle = shade(th.floor, -0.3); g.fill(); ol(g, 4);
      rr(g, 244, 574, 712, 78, 38); g.fillStyle = lin(g, 0, 574, 0, 652, '#7FDDF0', '#3FA5C8'); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3.5;
      for (i = 0; i < 9; i++) { x = 290 + i * 78; y = 596 + (i % 3) * 16; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 12, y - 7, x + 24, y); g.quadraticCurveTo(x + 36, y + 7, x + 48, y); g.stroke(); }
      [[118, 330, '#FF8FB8'], [1084, 360, '#FFD66B'], [150, 700, '#FFD66B'], [1050, 706, '#FF8FB8'], [890, 268, '#FFB07A']].forEach(function (q, n) {
        g.save(); g.translate(q[0], q[1]); g.rotate(n); g.scale(1, 0.6); api.starPath(g, 0, 0, 20); g.fillStyle = q[2]; g.fill(); ol(g, 3); g.restore();
      });
    } else if (kind === 4) {               // cogs set into the floor
      gear(g, 240, 470, 150, 12); gear(g, 960, 480, 130, 10); gear(g, 420, 690, 90, 8); gear(g, 800, 700, 100, 9); gear(g, 600, 480, 70, 8);
    } else if (kind === 5) {               // feathers the storm blew in
      for (i = 0; i < 14; i++) {
        x = 110 + seed(i + 2000) * 980; y = 290 + seed(i + 2100) * 420;
        g.save(); g.translate(x, y); g.rotate(seed(i + 2200) * 3); g.scale(1, 0.55);
        g.beginPath(); g.moveTo(-20, 0); g.quadraticCurveTo(0, -12, 22, 0); g.quadraticCurveTo(0, 12, -20, 0); g.closePath(); g.fillStyle = i % 2 ? 'rgba(232,228,255,0.5)' : 'rgba(169,155,255,0.5)'; g.fill();
        g.lineWidth = 2; g.strokeStyle = 'rgba(27,42,73,0.35)'; g.stroke(); g.beginPath(); g.moveTo(-20, 0); g.lineTo(22, 0); g.stroke();
        g.restore();
      }
    } else {                               // rubble
      [[110, 330], [1086, 352], [160, 716], [1050, 712], [900, 262]].forEach(function (q, n) {
        for (i = 0; i < 3; i++) { ell(g, q[0] + i * 17 - 16, q[1] - (i === 1 ? 5 : 0), 10 + seed(n * 7 + i) * 6, 7 + seed(n * 5 + i) * 3); g.fillStyle = i % 2 ? '#A69886' : '#8F8272'; g.fill(); ol(g, 2.5); }
      });
    }
    // shade under the back wall and along the sides; right of the floor it is dark, the buttons stand there
    g.fillStyle = lin(g, 0, 208, 0, 290, 'rgba(14,10,34,0.42)', 'rgba(14,10,34,0)'); g.fillRect(L0, 208, R0 - L0, 82);
    g.fillStyle = lin(g, 0, 0, 90, 0, 'rgba(14,10,34,0.4)', 'rgba(14,10,34,0)'); g.fillRect(L0, 200, 96 - L0, B0 - 200);
    g.fillStyle = lin(g, 1110, 0, 1200, 0, 'rgba(14,10,34,0)', 'rgba(14,10,34,0.4)'); g.fillRect(1106, 200, 96, B0 - 200);
    g.fillStyle = 'rgba(14,10,34,0.4)'; g.fillRect(1200, 200, R0 - 1200, B0 - 200);
    g.fillStyle = lin(g, 0, 728, 0, 772, 'rgba(14,10,34,0)', 'rgba(14,10,34,0.35)'); g.fillRect(L0, 728, R0 - L0, B0 - 728);

    // back wall with a ragged foot
    function wall() {
      g.beginPath(); g.moveTo(L0, T0); g.lineTo(R0, T0); g.lineTo(R0, 214);
      for (x = Math.ceil(R0 / 60) * 60; x >= -60; x -= 60) g.lineTo(x, 204 + seed(x) * 18);
      g.lineTo(L0, 214); g.closePath();
    }
    wall(); g.fillStyle = lin(g, 0, 0, 0, 216, th.wall, th.wall2); g.fill();
    g.save(); wall(); g.clip();
    for (i = 0; i < 30; i++) {             // rock faces: lighter on the upper left, darker on the lower right
      x = -40 + seed(i + 600) * 1480; y = 30 + seed(i + 700) * 190; r = 40 + seed(i + 800) * 60;
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(10,8,28,0.14)';
      poly(g, [x - r, y, x - r * 0.3, y - r * 0.6, x + r * 0.8, y - r * 0.4, x + r, y + r * 0.3, x + r * 0.2, y + r * 0.6]); g.fill();
    }
    g.strokeStyle = shade(th.wall2, 0.22); g.lineWidth = 5;
    g.beginPath(); for (x = Math.ceil(R0 / 60) * 60; x >= -60; x -= 60) g.lineTo(x, 200 + seed(x) * 18); g.stroke();
    if (kind === 0) for (i = 0; i < 9; i++) {  // slime running down the wall
      x = 60 + i * 135 + seed(i + 900) * 50; y = 96 + seed(i + 950) * 80;
      rr(g, x - 11, -40, 22, y + 40, 11); g.fillStyle = 'rgba(123,224,107,0.8)'; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(40,120,70,0.7)'; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.45)'; rr(g, x - 6, y - 30, 5, 18, 2.5); g.fill();
    }
    if (kind === 5) [[150, 40], [520, 20], [820, 50], [1090, 30]].forEach(function (q) {     // lightning in the rock
      g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] - 16, q[1] + 44); g.lineTo(q[0] + 8, q[1] + 52); g.lineTo(q[0] - 12, q[1] + 104); g.lineTo(q[0] + 14, q[1] + 116);
      g.strokeStyle = 'rgba(201,182,255,0.3)'; g.lineWidth = 12; g.stroke(); g.strokeStyle = '#E8E4FF'; g.lineWidth = 3.5; g.stroke();
    });
    if (kind === 3) for (i = 0; i < 7; i++) {  // water running down the wall
      x = 90 + i * 170 + seed(i + 900) * 40;
      g.fillStyle = 'rgba(143,227,255,0.35)'; rr(g, x - 7, -40, 14, 190 + seed(i + 950) * 40, 7); g.fill();
    }
    g.restore();
    wall(); g.lineWidth = 4; g.strokeStyle = NAVY; g.stroke();
    for (i = 0; i < 15; i++) {             // stalactites
      x = L0 + 30 + i * (R0 - L0 - 60) / 14 + (seed(i + 1000) - 0.5) * 36; r = 15 + seed(i + 1100) * 14; y = T0 + 54 + seed(i + 1200) * 62;
      poly(g, [x - r, T0, x + r, T0, x, y]); g.fillStyle = shade(th.wall2, 0.1); g.fill();
      poly(g, [x, T0, x + r, T0, x, y]); g.fillStyle = shade(th.wall, -0.1); g.fill();
      poly(g, [x - r, T0, x + r, T0, x, y]); ol(g, 3.5);
    }
    crystal(g, 300, 208, 1, cA, cB); crystal(g, 908, 206, 0.9, cA, cB); crystal(g, 86, 214, 0.7, cA, cB); crystal(g, 1128, 212, 0.75, cA, cB);
    // torch holders on the wall (the flames are drawn every frame)
    [176, 1024].forEach(function (tx) {
      poly(g, [tx - 9, 150, tx + 9, 150, tx + 5, 190, tx - 5, 190]); g.fillStyle = '#8A5A33'; g.fill(); ol(g, 3.5);
      rr(g, tx - 15, 140, 30, 13, 5); g.fillStyle = '#C9D2DC'; g.fill(); ol(g, 3.5);
    });
    // boulders along both sides
    for (i = 0; i < 8; i++) {
      stone(g, 18 + seed(i + 1300) * 22, 262 + i * 66 + seed(i + 1400) * 14, 30 + seed(i + 1500) * 14, th.rock);
      stone(g, 1182 - seed(i + 1600) * 22, 256 + i * 66 + seed(i + 1700) * 14, 30 + seed(i + 1800) * 14, th.rock);
    }
    // the boss's stone platform
    ell(g, BOSS.x + 10, 352, 202, 68); g.fillStyle = SH; g.fill();
    ell(g, BOSS.x, 346, 196, 64); g.fillStyle = shade(th.rock, -0.22); g.fill(); ol(g, 4);
    ell(g, BOSS.x, 330, 196, 64); g.fillStyle = lin(g, 404, 280, 796, 390, shade(th.rock, 0.42), shade(th.rock, 0.1)); g.fill(); ol(g, 4);
    ell(g, BOSS.x, 330, 166, 50); g.lineWidth = 3.5; g.strokeStyle = 'rgba(27,42,73,0.28)'; g.stroke();
    for (i = 0; i < 10; i++) { x = BOSS.x + Math.cos(i * TAU / 10) * 181; y = 330 + Math.sin(i * TAU / 10) * 57; ell(g, x, y, 5, 3); g.fillStyle = cA; g.fill(); }
  }

  // ---------- messages from the server ----------
  function posOf(id) { return !G ? null : id === api.myId() ? G.me : G.pos[id] || null; }
  function addOrb(a, now, quiet) { G.orbs[a[0]] = { id: a[0], x: a[1], y: a[2], v: a[3], born: quiet ? now - 1000 : now, mt: 0 }; }
  function moveOrbs(list, now) {       // orbs slide to a new place (the Collector's pull, the Clock Tortoise's shuffle)
    (list || []).forEach(function (a) {
      var ob = G.orbs[a[0]];
      if (!ob) return;
      ob.fx = ob.x; ob.fy = ob.y; ob.mt = now; ob.x = a[1]; ob.y = a[2];
    });
  }
  function spark(x, y, col, n, sp, life, r) {
    if (G.fx.length > 150) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, v = sp * (0.4 + Math.random() * 0.6);
      G.fx.push({ k: 'p', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - sp * 0.3, col: col, r: (r || 6) * (0.6 + Math.random() * 0.7), t0: tnow(), life: life * (0.6 + Math.random() * 0.4) });
    }
  }
  // the runes as the server sends them: [id, number, sum, bonus step, has a rune of this shield, it is lit, skill, role, asleep]
  function setRunes(list, now) {
    var old = G.runes, i, a, o, r;
    G.runes = {}; G.order = [];
    for (i = 0; i < (list || []).length; i++) {
      a = list[i]; o = old[a[0]];
      G.runes[a[0]] = { id: a[0], t: a[1], sum: a[2], tier: a[3], has: !!a[4], done: !!a[5], sk: a[6], role: a[7], zz: !!a[8], born: o && o.t === a[1] && o.tier === a[3] ? o.born : now };
      G.order.push(a[0]);
    }
    r = G.runes[api.myId()];
    if (!r || !r.t || !r.sum) G.parts = [];      // a new rune of my own: the sum starts again
    ui.key = '';
  }
  function runeSpots() {               // where each fighter's rune is drawn: mine big in the middle, the others beside the boss
    var me = api.myId(), others = [], out = {}, i, n, sl, sc;
    for (i = 0; i < G.order.length; i++) if (G.order[i] !== me) others.push(G.order[i]);
    if (G.runes[me]) out[me] = { x: BOSS.x, y: BOSS.y - 6, sc: 0.84 };
    n = others.length; sc = n <= 2 ? 0.66 : 0.52;
    sl = n <= 2 ? [[-226, -126], [226, -126]] : [[-204, -172], [204, -172], [-204, -98], [204, -98], [-278, -172], [278, -172], [-278, -98], [278, -98]];
    for (i = 0; i < n && i < sl.length; i++) out[others[i]] = { x: BOSS.x + sl[i][0], y: BOSS.y + sl[i][1], sc: sc };
    return out;
  }
  function newFight(m, now) {
    var i, q;
    G = {
      boss: kindOf(m.boss), diff: clamp(m.diff | 0, 0, 2), hp: m.hp, hpMax: m.hpMax, runes: {}, order: [], parts: m.parts || [], bonus: m.bonus || 0, cap: m.cap || 3,
      ends: now + m.left, dazed: now + (m.dazed || 0), angry: now + (m.angry || 0), shieldAt: now + (m.dazed || 0) - 400,
      orbs: {}, carry: m.carry || {}, down: {}, pos: {}, atks: [], rocks: [], mins: {}, puds: [], bubs: [], fx: [], dashes: {},
      me: { x: m.you[0], y: m.you[1], f: 1, m: 0 }, sentAt: 0, sx: -1, sy: -1, sm: 0, sf: 1, hitAt: 0,
      cx: m.cx || CANNON.x, ctx: m.cx || CANNON.x, cdAt: now + (m.cd || 0), cdLen: Math.max(1, m.cd || 1), dash: 0, gust: null, tock: 0,
      flash: null, beam: 0, hurt: 0, shake: 0, wind: 0, pulse: 0, puff: 0, over: null
    };
    setRunes(m.r, now - 1000);
    G.parts = m.parts || [];
    for (i = 0; i < m.orbs.length; i++) addOrb(m.orbs[i], now, true);
    for (i = 0; i < m.p.length; i++) { q = m.p[i]; G.pos[q[0]] = { x: q[1], y: q[2], tx: q[1], ty: q[2], f: q[3], m: q[4] }; }
    Object.keys(m.down || {}).forEach(function (id) { G.down[id] = { until: now + m.down[id][0], safe: now + m.down[id][1] }; });
    (m.atks || []).forEach(function (a) { G.atks.push({ id: a.id, z: a.z, at: now - Math.max(0, 1200 - a.in), hit: now + a.in, done: false }); });
    (m.rocks || []).forEach(function (r) { G.rocks.push({ id: r.id, x: r.x, y: r.y, vx: r.vx, vy: r.vy, r: r.r, at: now - Math.max(0, 1200 - r.in), start: now + r.in, life: r.life }); });
    (m.mins || []).forEach(function (a) { G.mins[a[0]] = { id: a[0], x: a[1], y: a[2], tx: a[1], ty: a[2], at: now, born: now + a[3] }; });
    (m.puds || []).forEach(function (a) { addPud(a, now); });
    (m.bubs || []).forEach(function (a) { G.bubs.push({ id: a[0], x: a[1], y: a[2], r: a[3], at: now - 400, until: now + a[4] }); });
    if (m.wind) G.gust = { dx: m.wind.dx, v: m.wind.v, from: now + m.wind.in, until: now + m.wind.in + m.wind.ms };
    ui = {};
  }
  function addPud(a, now) { G.puds.push({ id: a[0], x: a[1], y: a[2], r: a[3], k: a[4], from: now + a[5], until: now + a[5] + a[6] }); }
  // an orb goes into the cannon: it flies there, and the number pops up
  function loaded(m, now) {
    var p = posOf(m.id) || { x: G.cx, y: CANNON.y }, mine = m.id === api.myId(), v = m.v * (m.m || 1);
    G.carry[m.id] = m.c || [];
    G.fx.push({ k: 'fly', v: m.v, x0: p.x, y0: p.y - 96, x1: G.cx, y1: CANNON.y - 100, t0: now, life: 240 });
    if (mine) {
      G.fx.push({ k: 'txt', s: (v < 0 ? '−' : '+') + Math.abs(v), x: G.cx + 74, y: CANNON.y - 120, col: v < 0 ? '#9FD8FF' : '#FFD66B', t0: now + 150, life: 900 });
      G.pulse = now + 200;
    }
    ui.key = '';
  }
  // "3 + 4 = 7"; a Grown-up's orbs come with their multiplier: "7×8 + 3 = 59". A long chain is shown as "27 + 4 = 31".
  function term(q) { var v = Math.abs(q[0]); return q[1] > 1 ? v + '×' + q[1] : String(v); }
  function eqText(sum, parts) {
    var i, s = 0, out, lastQ;
    if (!parts || !parts.length) return { left: '', sum: String(sum) };
    for (i = 0; i < parts.length; i++) s += parts[i][0] * parts[i][1];
    if (parts.length === 1 && s === sum && parts[0][1] === 1) return { left: '', sum: String(sum) };
    if (parts.length <= 3 && s === sum && parts[0][0] > 0) {
      out = term(parts[0]);
      for (i = 1; i < parts.length; i++) out += (parts[i][0] < 0 ? ' − ' : ' + ') + term(parts[i]);
    } else { lastQ = parts[parts.length - 1]; out = (sum - lastQ[0] * lastQ[1]) + (lastQ[0] < 0 ? ' − ' : ' + ') + term(lastQ); }
    return { left: out + ' =', sum: String(sum) };
  }
  function popMinion(id) {
    var q = G.mins[id];
    if (!q) return;
    spark(q.x, q.y - 22, BOSSES[G.boss].hit, 7, 150, 420, 6);
    delete G.mins[id];
  }
  function fightMsg(m, now) {
    var me = api.myId(), i, q, o, seen, k, list, p, r, sp;
    switch (m.t) {
      case 'boss.s':
        seen = {};
        for (i = 0; i < m.p.length; i++) {
          q = m.p[i]; seen[q[0]] = 1;
          if (q[0] === me) continue;
          o = G.pos[q[0]] || (G.pos[q[0]] = { x: q[1], y: q[2] });
          o.tx = q[1]; o.ty = q[2]; o.f = q[3]; o.m = q[4];
        }
        for (k in G.pos) if (!seen[k]) delete G.pos[k];
        seen = {}; list = m.m || [];
        for (i = 0; i < list.length; i++) {
          q = list[i]; seen[q[0]] = 1;
          o = G.mins[q[0]] || (G.mins[q[0]] = { id: q[0], x: q[1], y: q[2], at: now - 2000, born: now - 1 });
          o.tx = q[1]; o.ty = q[2];
        }
        for (k in G.mins) if (!seen[k]) delete G.mins[k];
        if (m.cx !== undefined) G.ctx = m.cx;
        if (m.left !== undefined) G.ends = now + m.left;
        break;
      case 'boss.o':
        (m.del || []).forEach(function (id) {
          var ob = G.orbs[id];
          if (!ob) return;
          spark(ob.x, ob.y - 36, m.fx === 'take' ? '#FFFFFF' : '#C9C2E0', m.fx === 'take' ? 5 : 8, 120, 350, 5);
          delete G.orbs[id];
        });
        (m.add || []).forEach(function (a) { addOrb(a, now); });
        if (m.mv) { moveOrbs(m.mv, now); if (m.fx === 'shuf') { G.tock = 0; api.sfx('card'); } }
        if (m.id !== undefined) {
          G.carry[m.id] = m.c || [];
          if (m.id === me) { if (m.fx === 'take') api.sfx('emote'); ui.key = ''; }
        }
        break;
      case 'boss.sum':
        loaded(m, now); r = G.runes[m.id]; if (r) r.sum = m.sum;
        if (m.id === me) { G.parts = m.parts || []; api.sfx('claim'); }
        break;
      case 'boss.lit':                 // somebody's rune lights up
        loaded(m, now);
        sp = runeSpots()[m.id];
        if (sp) spark(sp.x, sp.y, m.b ? '#FFD66B' : colOf(m.id), 14, 230, 650, 7);
        G.bonus = m.bonus || 0;
        setRunes(m.r, now);
        if (m.id === me) { G.flash = { ok: true, eq: eqText(m.was, m.parts), target: m.was, n: m.was, until: now + 1400 }; G.parts = []; api.sfx('right'); }
        else api.sfx('star');
        break;
      case 'boss.over':
        loaded(m, now); r = G.runes[m.id]; if (r) r.sum = 0;
        if (m.angry) G.angry = now + m.angry;
        if (m.id === me) {
          G.flash = { ok: false, eq: eqText(m.sum, m.parts), target: m.target, n: m.sum, until: now + 1700 };
          G.parts = []; G.puff = now + 250; api.sfx('wrong');
        }
        break;
      case 'boss.fire':                // every rune is lit: the cannon fires
        G.hp = m.hp; G.bonus = 0; setRunes(m.r, now + 500); G.parts = [];
        G.dazed = now + m.dazed; G.angry = 0; G.shieldAt = now + m.dazed;
        G.atks = G.atks.filter(function (a) { return a.done; });
        G.puds = G.puds.filter(function (a) { return a.from <= now; });
        (m.gone || []).forEach(popMinion);
        G.beam = now + 200; G.hurt = now + 560; G.shake = now + 650;
        G.fx.push({ k: 'txt', s: '−' + m.dmg, x: BOSS.x + 150, y: BOSS.y - 190, col: '#FF6B7F', t0: now + 350, life: 1500, big: 1 });
        for (i = 0; i < 16; i++) {       // the shield breaks into pieces
          q = Math.random() * TAU;
          G.fx.push({ k: 'p', tri: 1, x: BOSS.x + Math.cos(q) * 90, y: BOSS.y - 100 + Math.sin(q) * 70, vx: Math.cos(q) * (160 + Math.random() * 200), vy: Math.sin(q) * 200 - 120, col: i % 2 ? '#BFE9FF' : '#7CCBFF', r: 9 + Math.random() * 8, t0: now + 250, life: 800 });
        }
        api.sfx('quest');
        break;
      case 'boss.runes': G.bonus = m.bonus || 0; setRunes(m.r, now); break;
      case 'boss.ko':
        p = posOf(m.id);
        G.carry[m.id] = G.carry[m.id] && m.add && !m.add.length ? G.carry[m.id] : [];     // a Guard keeps the orbs
        (m.add || []).forEach(function (a) { addOrb(a, now); });
        G.down[m.id] = { until: now + m.ms, safe: now + m.safe };
        if (p) spark(p.x, p.y - 40, '#FFD66B', 8, 170, 500, 6);
        if (m.id === me) { api.sfx('tagit'); G.shake = now + 280; G.dash = 0; ui.key = ''; }
        break;
      case 'boss.hp': G.hp = m.hp; G.hpMax = m.hpMax; break;
      case 'boss.atk':
        G.atks.push({ id: m.id, z: m.z, at: now, hit: now + m.in, done: false });
        G.wind = Math.max(G.wind, now + Math.min(1200, m.in));
        break;
      case 'boss.rock':
        G.rocks.push({ id: m.id, x: m.x, y: m.y, vx: m.vx, vy: m.vy, r: m.r, at: now, start: now + m.in, life: m.life });
        G.wind = Math.max(G.wind, now + Math.min(1200, m.in));
        break;
      case 'boss.min':
        (m.add || []).forEach(function (a) { G.mins[a[0]] = { id: a[0], x: a[1], y: a[2], tx: a[1], ty: a[2], at: now, born: now + a[3] }; });
        if (m.add && m.add.length) G.wind = Math.max(G.wind, now + 1200);
        (m.del || []).forEach(popMinion);
        break;
      case 'boss.pud': (m.add || []).forEach(function (a) { addPud(a, now); }); break;
      case 'boss.wind':
        G.gust = { dx: m.dx < 0 ? -1 : 1, v: m.v, from: now + m.in, until: now + m.in + m.ms };
        G.wind = Math.max(G.wind, now + 1200);
        break;
      case 'boss.tw': G.tock = now + m.in; G.wind = Math.max(G.wind, now + m.in); api.sfx('tap'); break;
      case 'boss.act':                 // somebody used their role's ability
        p = posOf(m.id);
        if (m.id === me) { G.cdAt = now + m.cd; G.cdLen = m.cd; api.sfx('card'); }
        if (m.r === 0) G.bubs.push({ id: m.bid, x: m.x, y: m.y, r: m.rad, at: now, until: now + m.ms });
        else if (m.r === 1) {
          (m.up || []).forEach(function (id) {
            var q2 = posOf(id);
            G.down[id] = { until: now, safe: now + m.safe };
            if (q2) spark(q2.x, q2.y - 50, '#7BE08A', 10, 150, 700, 7);
            if (id === me) ui.key = '';
          });
          if (p) G.fx.push({ k: 'ring', x: p.x, y: p.y, col: '#7BE08A', r: 520, t0: now, life: 600 });
        } else if (m.r === 2) {
          moveOrbs(m.mv, now);
          if (p) G.fx.push({ k: 'ring', x: p.x, y: p.y, col: '#FF8FB8', r: 300, t0: now, life: 450, inw: 1 });
        } else {
          G.dashes[m.id] = now + m.ms;
          G.down[m.id] = { until: now, safe: now + m.ms + 100 };
          if (m.id === me) G.dash = now + m.ms;
        }
        break;
      case 'boss.no':                  // my ability is not ready yet (or there is nobody to help)
        if (m.cd > 0) { G.cdAt = now + m.cd; G.cdLen = Math.max(G.cdLen, m.cd); }
        api.sfx('deny');
        break;
    }
  }
  function onMessage(m) {
    if (!root || !m) return;
    var now = tnow();
    if (m.t === 'boss.lobby') {
      L = m; goEnds = m.go ? now + m.go : 0; goShown = -1;
      if (mode === 'wait' || mode === 'lobby' || (mode === 'fight' && !(G && G.over))) { G = null; mode = 'lobby'; }
      show(); renderLobby();
    } else if (m.t === 'boss.full') {
      R = null; newFight(m, now); mode = 'fight'; show();
    } else if (m.t === 'boss.end') {
      R = m;
      if (!G) { mode = 'result'; show(); renderResult(); return; }
      G.over = { win: !!m.win, at: now }; G.atks = []; G.rocks = []; G.mins = {}; G.puds = []; G.bubs = []; G.gust = null; G.me.m = 0; ui.key = '';
      api.sfx(m.win ? 'tagwin' : 'deny');
      if (m.win) for (var i = 0; i < 5; i++) later(300 + i * 280, function () { if (G && G.over) spark(BOSS.x + (Math.random() - 0.5) * 220, BOSS.y - 60 - Math.random() * 150, ['#FFD66B', '#FF8FB8', '#7CCBFF', '#9BF07A'][Math.floor(Math.random() * 4)], 12, 260, 900, 8); });
      later(2700, function () { if (!root || R !== m) return; G = null; mode = 'result'; show(); renderResult(); });
    } else if (G && !G.over) fightMsg(m, now);
    else if (G && m.t === 'boss.fire') fightMsg(m, now);
  }

  // ---------- the fight: my own player, the others, and what can hit me ----------
  function fix(pt) {                  // keep a player on the floor: off the boss's platform and out of the cannon
    var dx, dy, q, k;
    pt.x = clamp(pt.x, X0, X1); pt.y = clamp(pt.y, Y0, Y1);
    dx = (pt.x - BOSS.x) / 225; dy = (pt.y - 330) / 95; q = dx * dx + dy * dy;
    if (q < 1) {
      k = 1 / Math.sqrt(q || 0.0001); pt.x = BOSS.x + dx * k * 225; pt.y = 330 + dy * k * 95;
      if (pt.y < Y0) { pt.y = Y0; pt.x = BOSS.x + (dx < 0 ? -1 : 1) * 225 * Math.sqrt(1 - Math.pow((Y0 - 330) / 95, 2)); }
    }
    dx = (pt.x - G.cx) / 56; dy = (pt.y - (CANNON.y - 8)) / 26; q = dx * dx + dy * dy;
    if (q < 1) { k = 1 / Math.sqrt(q || 0.0001); pt.x = clamp(G.cx + dx * k * 56, X0, X1); pt.y = CANNON.y - 8 + dy * k * 26; }
  }
  function segDist2(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy, t = l ? clamp(((px - x1) * dx + (py - y1) * dy) / l, 0, 1) : 0;
    dx = x1 + dx * t - px; dy = y1 + dy * t - py;
    return dx * dx + dy * dy;
  }
  // Is this point hit when the zone goes off? A zone of safe circles ('s') hits everywhere else.
  function inZone(pt, z) {
    var i, s, dx, dy;
    if (z.length && z[0][0] === 's') {
      for (i = 0; i < z.length; i++) { dx = pt.x - z[i][1]; dy = pt.y - z[i][2]; if (dx * dx + dy * dy < (z[i][3] + 6) * (z[i][3] + 6)) return false; }
      return true;
    }
    for (i = 0; i < z.length; i++) {
      s = z[i];
      if (s[0] === 'c') { dx = pt.x - s[1]; dy = pt.y - s[2]; if (dx * dx + dy * dy < (s[3] - 6) * (s[3] - 6)) return true; }
      else if (s[0] === 'l' && segDist2(pt.x, pt.y, s[1], s[2], s[3], s[4]) < (s[5] - 6) * (s[5] - 6)) return true;
    }
    return false;
  }
  function inBubble(pt, now) {
    for (var i = 0; i < G.bubs.length; i++) { var b = G.bubs[i], dx = pt.x - b.x, dy = pt.y - b.y; if (now < b.until && dx * dx + dy * dy < b.r * b.r) return true; }
    return false;
  }
  function atCannon(pt) { var dx = pt.x - G.cx, dy = pt.y - CANNON.y; return dx * dx + dy * dy < DELIVER_R * DELIVER_R; }
  function report(k, id, now) {       // tell the server I was hit (it knocks me down and scatters my orbs)
    if (now - G.hitAt < 400) return;
    G.hitAt = now;
    api.send({ t: 'boss.hit', k: k, id: id });
  }
  function boom(a, now) {             // a zone goes off
    var col = BOSSES[G.boss].hit, i, s;
    for (i = 0; i < a.z.length; i++) { s = a.z[i]; if (s[0] === 'c') spark(s[1], s[2] - 10, col, 7, 190, 480, 7); }
    if (now > G.shake) G.shake = now + 130;
  }
  function update(dt, now) {
    var meId = api.myId(), me = G.me, dn = G.down[meId], isDown = !!dn && now < dn.until, safe = !!dn && now < dn.safe, prot = safe || inBubble(me, now);
    var v, l, k, id, o, i, a, r, q, dx, dy, sp, moved = false;
    G.cx += (G.ctx - G.cx) * Math.min(1, dt * 10);
    if (!G.over) {
      v = stick ? stick.read() : { x: 0, y: 0 }; l = Math.sqrt(v.x * v.x + v.y * v.y);
      sp = SPEED * (whoOf(meId)[1] === 3 ? 1.12 : 1);            // a Runner is a little faster, and much faster in a dash
      if (now < G.dash) sp *= 2.1;
      else for (i = 0; i < G.puds.length; i++) {                 // sticky slime
        q = G.puds[i];
        if (q.k === 0 && now >= q.from && now < q.until && (me.x - q.x) * (me.x - q.x) + (me.y - q.y) * (me.y - q.y) < q.r * q.r) { sp *= 0.5; break; }
      }
      if (!isDown && l > 0.12) {
        me.x += v.x * sp * dt; me.y += v.y * sp * dt; moved = true;
        if (v.x > 0.1) me.f = 1; else if (v.x < -0.1) me.f = -1;
        me.m = 1;
      } else me.m = 0;
      if (G.gust && now >= G.gust.from && now < G.gust.until && !isDown && now >= G.dash) { me.x += G.gust.dx * G.gust.v * dt; moved = true; }   // the storm pushes
      if (moved || G.ctx !== G.cx) fix(me);
      if (now - G.sentAt > 100 && (me.x !== G.sx || me.y !== G.sy || me.m !== G.sm || me.f !== G.sf)) {
        api.send({ t: 'boss.pos', x: Math.round(me.x), y: Math.round(me.y), f: me.f, m: me.m });
        G.sentAt = now; G.sx = me.x; G.sy = me.y; G.sm = me.m; G.sf = me.f;
      }
    }
    k = Math.min(1, dt * 12);          // the others glide to where the server last saw them
    for (id in G.pos) { o = G.pos[id]; o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; }
    for (id in G.mins) {
      o = G.mins[id]; o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k;
      if (!G.over && !safe && now >= o.born) { dx = o.x - me.x; dy = o.y - me.y; if (dx * dx + dy * dy < 38 * 38) report('m', o.id, now); }
    }
    for (i = G.atks.length - 1; i >= 0; i--) {
      a = G.atks[i];
      if (!a.done && now >= a.hit) { a.done = true; boom(a, now); if (!prot && !G.over && inZone(me, a.z)) report('a', a.id, now); }
      if (now > a.hit + 450) G.atks.splice(i, 1);
    }
    for (i = G.rocks.length - 1; i >= 0; i--) {
      r = G.rocks[i]; q = (now - r.start) / 1000;
      if (q * 1000 > r.life) { G.rocks.splice(i, 1); continue; }
      if (q >= 0 && !prot && !G.over) { dx = r.x + r.vx * q - me.x; dy = r.y + r.vy * q - me.y; if (dx * dx + dy * dy < (r.r + 12) * (r.r + 12)) report('r', r.id, now); }
    }
    for (i = G.puds.length - 1; i >= 0; i--) {
      q = G.puds[i];
      if (now > q.until) { G.puds.splice(i, 1); continue; }
      if (q.k === 1 && now >= q.from && !prot && !G.over && (me.x - q.x) * (me.x - q.x) + (me.y - q.y) * (me.y - q.y) < (q.r - 8) * (q.r - 8)) report('p', q.id, now);
    }
    for (i = G.bubs.length - 1; i >= 0; i--) if (now > G.bubs[i].until) G.bubs.splice(i, 1);
    if (G.gust && now > G.gust.until) G.gust = null;
    for (i = G.fx.length - 1; i >= 0; i--) if (now > G.fx[i].t0 + G.fx[i].life) G.fx.splice(i, 1);
  }
  // the next orb the cannon takes from my hands (the same rule as on the server)
  function nextOrb() {
    var me = api.myId(), list = G.carry[me] || [], r = G.runes[me], i;
    if (!r || !r.t) return null;
    for (i = 0; i < list.length; i++) if (list[i] > 0 || r.sum + list[i] >= 0) return list[i];
    return null;
  }
  function tapLoad(n) {               // a Grown-up loads the next orb, times n
    var now = tnow(), dn = G ? G.down[api.myId()] : null, v, r;
    if (!G || G.over || mode !== 'fight') return;
    v = nextOrb(); r = G.runes[api.myId()];
    // not at the cannon, nothing in the hands, knocked down, or a minus gem that would take away more than there is
    if (v === null || !atCannon(G.me) || (dn && now < dn.until) || r.sum + v * n < 0) { api.sfx('deny'); return; }
    api.send({ t: 'boss.load', m: n });
  }
  function useRole() {
    if (!G || G.over || mode !== 'fight') return;
    api.send({ t: 'boss.act' });
  }

  // ---------- drawing the fight ----------
  function torches() {
    [176, 1024].forEach(function (x, n) {
      var f = 1 + Math.sin(T * 11 + n * 2) * 0.12, q = c.createRadialGradient(x, 126, 4, x, 126, 86);
      q.addColorStop(0, 'rgba(255,200,90,0.42)'); q.addColorStop(1, 'rgba(255,200,90,0)');
      c.fillStyle = q; ell(c, x, 126, 86, 86); c.fill();
      c.save(); c.translate(x, 142); c.scale(f, f);
      c.beginPath(); c.moveTo(-13, 0); c.quadraticCurveTo(-19, -22, 0, -46); c.quadraticCurveTo(19, -22, 13, 0); c.closePath(); c.fillStyle = '#FF8A3D'; c.fill(); ol(c, 3);
      c.beginPath(); c.moveTo(-6, -1); c.quadraticCurveTo(-9, -12, 0, -25); c.quadraticCurveTo(9, -12, 6, -1); c.closePath(); c.fillStyle = '#FFE27A'; c.fill();
      c.restore();
    });
  }
  // A zone as a path: a circle, or a lane with round ends (exactly the place that is hit).
  // k < 1: the inner part that grows while the warning runs
  function zoneShape(s, k) {
    var len, w;
    if (s[0] === 'c') { ell(c, s[1], s[2], s[3] * k, s[3] * k); return; }
    len = Math.sqrt((s[3] - s[1]) * (s[3] - s[1]) + (s[4] - s[2]) * (s[4] - s[2])); w = s[5] * k;
    c.save(); c.translate(s[1], s[2]); c.rotate(Math.atan2(s[4] - s[2], s[3] - s[1]));
    c.beginPath(); c.moveTo(0, -w); c.lineTo(len, -w); c.arc(len, 0, w, -Math.PI / 2, Math.PI / 2); c.lineTo(0, w); c.arc(0, 0, w, Math.PI / 2, Math.PI * 1.5); c.closePath();
    c.restore();
  }
  function safeZone(a, now) {           // the roof comes down: everything is red but the safe ledges
    var z = a.z, k, j, s;
    c.beginPath(); c.rect(-300, 224, AW + 600, AH);
    for (j = 0; j < z.length; j++) { c.moveTo(z[j][1] + z[j][3], z[j][2]); c.arc(z[j][1], z[j][2], z[j][3], 0, TAU); }
    if (now < a.hit) {
      k = clamp((now - a.at) / Math.max(1, a.hit - a.at), 0, 1);
      c.fillStyle = 'rgba(255,50,60,' + (0.2 + k * 0.22 + 0.08 * Math.sin(T * 12)) + ')'; c.fill('evenodd');
      for (j = 0; j < 16; j++) {       // the shadows of falling rocks grow where it is not safe
        s = { x: 110 + seed(j + a.id) * 980, y: 290 + seed(j * 3 + a.id + 50) * 420 };
        if (!inZone(s, z)) continue;
        ell(c, s.x, s.y, 12 + k * 30, 5 + k * 12); c.fillStyle = 'rgba(40,10,20,' + (0.15 + k * 0.3) + ')'; c.fill();
      }
      for (j = 0; j < z.length; j++) {
        s = z[j];
        ell(c, s[1], s[2], s[3], s[3]); c.fillStyle = 'rgba(90,225,130,0.30)'; c.fill();
        c.setLineDash([16, 10]); c.lineDashOffset = T * 40; c.lineWidth = 7; c.strokeStyle = '#fff'; c.stroke(); c.lineWidth = 4; c.strokeStyle = '#3FAE5A'; c.stroke(); c.setLineDash([]);
        c.lineWidth = 15; c.strokeStyle = NAVY; c.beginPath(); c.moveTo(s[1] - 26, s[2] + 2); c.lineTo(s[1] - 7, s[2] + 22); c.lineTo(s[1] + 28, s[2] - 22); c.stroke(); c.lineWidth = 8; c.strokeStyle = '#7BE08A'; c.stroke();
        ell(c, s[1], s[2], s[3] * (1 - k), s[3] * (1 - k)); c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke();      // a ring that closes: time is running out
      }
    } else {
      k = (now - a.hit) / 450;
      if (k < 1) { c.globalAlpha = (1 - k) * 0.7; c.fillStyle = BOSSES[G.boss].hit; c.fill('evenodd'); c.globalAlpha = 1; }
    }
  }
  function floorFx(now) {
    var mine = G.carry[api.myId()], has = mine && mine.length, pulse = 0.5 + 0.5 * Math.sin(T * 5), i, j, a, k, s, r, q, x, y, len, dir, col = BOSSES[G.boss].hit;
    // sticky slime and burning ground
    for (i = 0; i < G.puds.length; i++) {
      q = G.puds[i];
      if (now < q.from) continue;
      k = clamp((now - q.from) / 300, 0, 1) * clamp((q.until - now) / 500, 0, 1);
      if (q.k === 0) {
        c.globalAlpha = k * 0.85;
        ell(c, q.x, q.y, q.r, q.r * 0.9); c.fillStyle = '#7BE06B'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#2E8A4C'; c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.45)'; ell(c, q.x - q.r * 0.35, q.y - q.r * 0.3, q.r * 0.26, q.r * 0.1, -0.3); c.fill();
        for (j = 0; j < 3; j++) { a = (T * 0.6 + j / 3) % 1; ell(c, q.x + (j - 1) * q.r * 0.4, q.y + q.r * 0.2 - a * 14, 5 + a * 5, 5 + a * 5); c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,255,255,' + (0.7 * (1 - a)) + ')'; c.stroke(); }
        c.globalAlpha = 1;
      } else {
        c.globalAlpha = k;
        ell(c, q.x, q.y, q.r, q.r); c.fillStyle = 'rgba(255,90,40,0.38)'; c.fill();
        c.setLineDash([10, 8]); c.lineDashOffset = -T * 30; c.lineWidth = 4; c.strokeStyle = '#FFE27A'; c.stroke(); c.setLineDash([]);
        for (j = 0; j < 5; j++) {
          a = j * TAU / 5 + 0.4; x = q.x + Math.cos(a) * q.r * 0.52; y = q.y + Math.sin(a) * q.r * 0.52 + 6; r = 1 + Math.sin(T * 12 + j * 2) * 0.18;
          c.beginPath(); c.moveTo(x - 10, y); c.quadraticCurveTo(x - 14, y - 16 * r, x, y - 34 * r); c.quadraticCurveTo(x + 14, y - 16 * r, x + 10, y); c.closePath(); c.fillStyle = '#FF8A3D'; c.fill(); ol(c, 2.5);
          c.beginPath(); c.moveTo(x - 5, y); c.quadraticCurveTo(x - 6, y - 8 * r, x, y - 17 * r); c.quadraticCurveTo(x + 6, y - 8 * r, x + 5, y); c.closePath(); c.fillStyle = '#FFE27A'; c.fill();
        }
        c.globalAlpha = 1;
      }
    }
    // where the cannon takes orbs
    ell(c, G.cx, CANNON.y, DELIVER_R, DELIVER_R);
    c.fillStyle = 'rgba(255,214,107,' + (has ? 0.16 + pulse * 0.12 : 0.07) + ')'; c.fill();
    c.setLineDash([16, 13]); c.lineDashOffset = -T * 34; c.lineWidth = 5; c.strokeStyle = has ? '#FFD66B' : 'rgba(255,214,107,0.5)'; c.stroke(); c.setLineDash([]);
    // a Guard's bubble: nothing hits inside
    for (i = 0; i < G.bubs.length; i++) {
      q = G.bubs[i]; k = clamp((now - q.at) / 200, 0, 1);
      if (q.until - now < 1000 && Math.floor(now / 120) % 2) continue;        // it flickers before it goes
      ell(c, q.x, q.y, q.r * k, q.r * k); c.fillStyle = 'rgba(120,200,255,0.2)'; c.fill(); c.lineWidth = 6; c.strokeStyle = 'rgba(210,240,255,0.95)'; c.stroke();
      c.lineWidth = 7; c.strokeStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.arc(q.x, q.y, q.r * k * 0.86, Math.PI * 1.1, Math.PI * 1.4); c.stroke();
    }
    if (G.over) return;
    c.save(); c.beginPath(); c.rect(-300, 224, AW + 600, AH); c.clip();
    for (i = 0; i < G.atks.length; i++) {
      a = G.atks[i];
      if (a.z.length && a.z[0][0] === 's') { safeZone(a, now); continue; }
      if (now < a.hit) {                // the warning: a red zone that fills up
        k = clamp((now - a.at) / Math.max(1, a.hit - a.at), 0, 1);
        for (j = 0; j < a.z.length; j++) {
          s = a.z[j];
          zoneShape(s, 1); c.fillStyle = 'rgba(255,60,70,0.20)'; c.fill();
          c.setLineDash([14, 10]); c.lineDashOffset = -T * 40; c.lineWidth = 4.5; c.strokeStyle = 'rgba(255,60,70,' + (0.7 + 0.3 * Math.sin(T * 14)) + ')'; c.stroke(); c.setLineDash([]);
          zoneShape(s, k); c.fillStyle = 'rgba(255,60,70,0.30)'; c.fill();
        }
      } else {                          // and the blow itself
        k = (now - a.hit) / 450;
        if (k < 1) { c.globalAlpha = (1 - k) * 0.85; for (j = 0; j < a.z.length; j++) { zoneShape(a.z[j], 1); c.fillStyle = col; c.fill(); zoneShape(a.z[j], 0.3 + k * 0.7); c.fillStyle = '#fff'; c.fill(); } c.globalAlpha = 1; }
      }
    }
    for (i = 0; i < G.rocks.length; i++) {   // the lane something is about to roll (or blow) along
      r = G.rocks[i];
      if (now >= r.start) continue;
      k = clamp((now - r.at) / Math.max(1, r.start - r.at), 0, 1);
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 6;
      if (r.vx) {
        dir = r.vx < 0 ? -1 : 1;
        c.fillStyle = 'rgba(255,60,70,0.18)'; c.fillRect(-300, r.y - r.r, AW + 600, r.r * 2);
        c.fillStyle = 'rgba(255,60,70,0.28)'; len = (AW + 140) * k; c.fillRect(dir > 0 ? -70 : AW + 70 - len, r.y - r.r, len, r.r * 2);
        for (q = 0; q < 6; q++) { x = ((q * 220 + T * 260 * dir) % 1320 + 1320) % 1320 - 60; c.beginPath(); c.moveTo(x - dir * 14, r.y - 16); c.lineTo(x + dir * 6, r.y); c.lineTo(x - dir * 14, r.y + 16); c.stroke(); }
      } else {
        c.fillStyle = 'rgba(255,60,70,0.18)'; c.fillRect(r.x - r.r, 224, r.r * 2, AH);
        c.fillStyle = 'rgba(255,60,70,0.28)'; c.fillRect(r.x - r.r, 224, r.r * 2, 540 * k);
        for (q = 0; q < 4; q++) { y = 240 + (q * 150 + T * 240) % 540; c.beginPath(); c.moveTo(r.x - 16, y - 14); c.lineTo(r.x, y + 6); c.lineTo(r.x + 16, y - 14); c.stroke(); }
      }
    }
    c.restore();
    if (G.gust) {                       // the Storm Owl's gust: arrows first, then streaks that fly across
      dir = G.gust.dx; k = now < G.gust.from ? 1 : 0;
      c.lineCap = 'round';
      if (k) {
        c.globalAlpha = 0.55 + 0.45 * Math.sin(T * 16);
        for (i = 0; i < 3; i++) {
          x = 300 + i * 300; y = 470 + (i % 2) * 150;
          c.lineWidth = 22; c.strokeStyle = NAVY; c.beginPath(); c.moveTo(x - dir * 60, y); c.lineTo(x + dir * 50, y); c.moveTo(x + dir * 16, y - 36); c.lineTo(x + dir * 54, y); c.lineTo(x + dir * 16, y + 36); c.stroke();
          c.lineWidth = 12; c.strokeStyle = '#E8E4FF'; c.stroke();
        }
        c.globalAlpha = 1;
      } else {
        c.lineWidth = 5; c.strokeStyle = 'rgba(232,228,255,0.75)';
        for (i = 0; i < 16; i++) {
          x = ((i * 137 + T * 700 * dir) % 1400 + 1400) % 1400 - 100; y = 280 + (i * 61) % 440;
          c.beginPath(); c.moveTo(x, y); c.lineTo(x - dir * (50 + (i % 3) * 30), y); c.stroke();
        }
      }
    }
  }
  function bossEntity(now) {
    var kind = curBoss(), o = { dazed: false, angry: false, sleep: false, hurt: 0, wind: 0, lx: 0, ly: 0.7 }, y = BOSS.y, sc = BS, alpha = 1, rot = 0, q, k, i, a, spots, id, r, sp, n;
    if (G) {
      o.dazed = now < G.dazed; o.angry = !o.dazed && now < G.angry;
      o.hurt = clamp((G.hurt - now) / 360, 0, 1); if (now < G.hurt - 360) o.hurt = 0;
      q = clamp((G.wind - now) / 1200, 0, 1); o.wind = o.dazed ? 0 : Math.sin(q * Math.PI);
      o.lx = clamp((G.me.x - BOSS.x) / 420, -1, 1);
      if (G.over) {
        q = clamp((now - G.over.at - 600) / 1700, 0, 1);
        if (G.over.win) { o.dazed = true; o.angry = false; sc = BS * (1 - q * 0.8); alpha = 1 - q * q; rot = q * q * 9; }
        else { o.dazed = false; y -= q * q * 460; alpha = 1 - q * q; }
      }
    } else if (mode === 'result') return;      // beaten or gone: the platform is empty
    else o.sleep = true;
    c.fillStyle = SH; ell(c, BOSS.x + 14, BOSS.y + 6, 150 * sc / BS * alpha, 30 * alpha); c.fill();
    c.save(); c.translate(BOSS.x, y); c.globalAlpha = alpha;
    c.save(); if (rot) { c.translate(0, -100); c.rotate(rot); c.translate(0, 100); } c.scale(sc, sc); drawBoss(c, kind, T, o); c.restore();
    if (o.dazed && alpha > 0.3) for (i = 0; i < 4; i++) {         // stars going round its head
      a = T * 4 + i * TAU / 4; api.starPath(c, Math.cos(a) * 78, -212 + Math.sin(a) * 16, 12); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 2.5);
    }
    if (o.angry) {                                                 // steaming with anger
      for (i = 0; i < 3; i++) { a = (T * 1.2 + i / 3) % 1; c.fillStyle = 'rgba(255,255,255,' + (0.7 * (1 - a)) + ')'; ell(c, (i - 1) * 84, -206 - a * 50, 9 + a * 10, 9 + a * 10); c.fill(); }
      c.save(); c.translate(98, -196); c.scale(1 + Math.sin(T * 12) * 0.12, 1 + Math.sin(T * 12) * 0.12);
      c.lineWidth = 7; c.strokeStyle = '#FF3B4E'; c.beginPath(); c.moveTo(-14, -5); c.quadraticCurveTo(-4, -5, -5, -15); c.moveTo(14, -5); c.quadraticCurveTo(4, -5, 5, -15); c.moveTo(-14, 5); c.quadraticCurveTo(-4, 5, -5, 15); c.moveTo(14, 5); c.quadraticCurveTo(4, 5, 5, 15); c.stroke();
      c.restore();
    }
    if (o.sleep) for (i = 0; i < 3; i++) { a = (T * 0.5 + i / 3) % 1; c.globalAlpha = 1 - a; txt(c, 'z', 96 + a * 46, -190 - a * 70, 26 + a * 22, '#fff', NAVY, 5); c.globalAlpha = 1; }
    if (G && !G.over && !o.dazed) {
      k = clamp((now - G.shieldAt) / 380, 0, 1); k = k * (2 - k);
      if (k > 0.02) drawBubble(c, k);
    }
    c.restore();
    if (!G || G.over) return;
    // the runes of the shield: mine in the middle, the others' beside the boss
    spots = runeSpots();
    for (i = G.order.length - 1; i >= 0; i--) {
      id = G.order[i]; r = G.runes[id]; sp = spots[id];
      if (!sp || (!r.t && !r.done)) continue;
      k = clamp((now - r.born) / 300, 0, 1); k = k * (2 - k);
      if (k <= 0.02) continue;
      c.save(); c.translate(sp.x, sp.y + Math.sin(T * 3 + id) * 3);
      if (r.zz) c.globalAlpha = 0.5;       // asleep: the shot does not wait for this rune
      drawRune(c, r, colOf(id), sp.sc * k); c.globalAlpha = 1;
      if (r.zz) for (a = 0; a < 2; a++) { q = (T * 0.6 + a / 2) % 1; c.globalAlpha = 1 - q; txt(c, 'z', 40 * sp.sc + q * 26, -50 * sp.sc - q * 34, 22 + q * 14, '#fff', NAVY, 5); c.globalAlpha = 1; }
      c.restore();
    }
    // every bonus rune adds to the shot: three sockets on the front of the platform
    n = Math.min(G.cap, G.bonus);
    for (i = 0; i < G.cap; i++) {
      a = BOSS.x + (i - (G.cap - 1) / 2) * 46; q = BOSS.y + 74 - Math.abs(i - (G.cap - 1) / 2) * 7;
      api.starPath(c, a, q, i < n ? 17 + Math.sin(T * 6 + i) * 1.5 : 14); c.fillStyle = i < n ? '#FFD66B' : 'rgba(20,14,40,0.35)'; c.fill();
      c.lineWidth = 3; c.strokeStyle = i < n ? NAVY : 'rgba(255,255,255,0.45)'; c.stroke();
    }
  }
  function cannonEntity(now) {
    var r = G ? G.runes[api.myId()] : null, sum = r && r.t ? r.sum : 0, x = G ? G.cx : CANNON.x;
    var rec = G ? clamp(1 - (now - G.beam) / 420, 0, 1) : 0, glow = r && r.t ? clamp(sum / r.t, 0, 1) : 0, k, a, i;
    if (G && now < G.beam) rec = 0;
    c.save(); c.translate(x, CANNON.y);
    if (curBoss() === 3) drawRaft(c, T);
    drawCannon(c, T, rec, glow);
    if (G && !G.over && r && r.t) {        // my own sum, floating over the barrel
      k = 1 + clamp((G.pulse + 260 - now) / 260, 0, 1) * 0.3; if (now < G.pulse) k = 1;
      c.save(); c.translate(-2, -152 + Math.sin(T * 2.4) * 3); c.scale(k, k);
      ell(c, 0, 0, 37, 37); c.fillStyle = 'rgba(255,214,107,0.3)'; c.fill();
      ell(c, 0, 0, 30, 30); c.fillStyle = lin(c, -30, -30, 30, 30, '#FFF6C8', '#FFD66B'); c.fill(); ol(c, 4);
      txt(c, String(sum), 0, 2, sum > 9 ? 34 : 40, NAVY);
      c.restore();
    }
    if (G && !G.over && now > G.puff && now < G.puff + 900) for (i = 0; i < 4; i++) {   // too much: grey smoke
      a = (now - G.puff) / 900; c.fillStyle = 'rgba(120,120,135,' + (0.75 * (1 - a)) + ')'; ell(c, (i - 1.5) * 20 * (1 + a), -116 - a * 70 - i * 6, 13 + a * 16, 13 + a * 16); c.fill();
    }
    c.restore();
  }
  function playerEntity(p, pos, isMe, now) {
    var x = pos.x, y = pos.y, dn = G.down[p.id], down = !!dn && now < dn.until, dash = now < (G.dashes[p.id] || 0), blink = !!dn && !down && !dash && now < dn.safe, f = pos.f < 0 ? -1 : 1, hh, i;
    c.fillStyle = SH; ell(c, x + 3, y + 1, 27, 9); c.fill();
    if (isMe) { ell(c, x, y, 36, 13); c.lineWidth = 4.5; c.strokeStyle = '#FFD66B'; c.stroke(); }
    if (dash) for (i = 1; i <= 3; i++) { c.globalAlpha = 0.5 - i * 0.13; ell(c, x - f * i * 26, y - 34, 22, 34); c.fillStyle = '#FFD66B'; c.fill(); }     // a streak behind a dashing Runner
    c.globalAlpha = blink && Math.floor(now / 110) % 2 ? 0.4 : 1;
    if (down) {
      c.save(); c.translate(x, y - 14); c.rotate(1.3 * f);
      api.drawAvatar(c, p, 0, 24, 0, { scale: AS, facing: f, moving: false });
      c.restore();
      hh = 46;
    } else hh = api.drawAvatar(c, p, x, y, T + p.id * 0.7, { scale: AS, facing: f, moving: !!pos.m });
    c.globalAlpha = 1;
    tagList.push({ p: p, x: x, y: y - hh - 6, me: isMe, carry: G.carry[p.id], down: down });
  }
  function drawTags() {
    var i, j, q, hh, list, n, sp, cy, a, step, w;
    for (i = 0; i < tagList.length; i++) {
      q = tagList[i];
      c.save(); c.translate(q.x, q.y); c.scale(ts, ts); hh = api.nameTag(c, q.p, 0, 0, q.me);
      // the role, next to the name
      c.font = '600 18px ' + FONT; w = c.measureText(q.p.name).width + 18; if (q.p.lv) { c.font = '700 14px ' + FONT; w += c.measureText('Lv ' + q.p.lv).width + 16; }
      c.font = '20px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = NAVY; c.fillText(ROLES[whoOf(q.p.id)[1]].ico, w / 2 + 15, -hh / 2 + 1);
      c.restore();
      list = q.carry || []; n = list.length; cy = q.y - hh * ts - 26; step = n > 3 ? 38 : 46;
      if (q.down) for (j = 0; j < 3; j++) { a = T * 6 + j * TAU / 3; api.starPath(c, q.x + Math.cos(a) * 32, cy + 8 + Math.sin(a) * 9, 10); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 2.5); }
      for (j = 0; j < n; j++) { sp = orbSprite(list[j], 20); c.drawImage(sp, q.x + (j - (n - 1) / 2) * step - sp.sz / 2, cy - sp.sz / 2 + Math.sin(T * 4 + j) * 2.5, sp.sz, sp.sz); }
    }
  }
  function topFx(now) {
    var i, f, k, x, y, sp, w;
    if (now > G.beam && now < G.beam + 520) {     // the cannon fires at the boss
      k = (now - G.beam) / 520; w = 54 * (1 - k * k);
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(170,140,255,0.5)'; c.lineWidth = w + 26; c.beginPath(); c.moveTo(G.cx - 2, CANNON.y - 108); c.lineTo(BOSS.x, BOSS.y - 96); c.stroke();
      c.strokeStyle = '#FFD66B'; c.lineWidth = w; c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = w * 0.45; c.stroke();
      ell(c, BOSS.x, BOSS.y - 96, 60 + k * 120, 46 + k * 90); c.fillStyle = 'rgba(255,255,255,' + (0.8 * (1 - k)) + ')'; c.fill();
    }
    if (G.tock && now < G.tock + 200) {           // tick, tock: the orbs are about to change places (they wobble)
      k = clamp(1 - (G.tock - now) / 1000, 0, 1);
      c.globalAlpha = 0.8 * (1 - k * 0.7); c.lineWidth = 10; c.strokeStyle = '#FFD66B';
      ell(c, BOSS.x, BOSS.y - 60, 120 + k * 560, 90 + k * 420); c.stroke(); c.globalAlpha = 1;
    }
    for (i = 0; i < G.fx.length; i++) {
      f = G.fx[i]; k = (now - f.t0) / f.life;
      if (k < 0 || k > 1) continue;
      if (f.k === 'p') {
        x = f.x + f.vx * k * f.life / 1000; y = f.y + f.vy * k * f.life / 1000 + 260 * k * k * f.life / 1000;
        c.globalAlpha = 1 - k * k; c.fillStyle = f.col;
        if (f.tri) { c.save(); c.translate(x, y); c.rotate(k * 9 + i); poly(c, [-f.r, f.r * 0.6, 0, -f.r, f.r, f.r * 0.6]); c.fill(); c.lineWidth = 2; c.strokeStyle = NAVY; c.stroke(); c.restore(); }
        else { ell(c, x, y, f.r * (1 - k * 0.5), f.r * (1 - k * 0.5)); c.fill(); }
        c.globalAlpha = 1;
      } else if (f.k === 'fly') {
        sp = orbSprite(f.v, 20); x = f.x0 + (f.x1 - f.x0) * k; y = f.y0 + (f.y1 - f.y0) * k - Math.sin(k * Math.PI) * 50;
        c.drawImage(sp, x - sp.sz / 2, y - sp.sz / 2, sp.sz, sp.sz);
      } else if (f.k === 'txt') {
        c.globalAlpha = 1 - k * k; txt(c, f.s, f.x, f.y - k * 56, f.big ? 76 : 40, f.col, NAVY, f.big ? 12 : 7); c.globalAlpha = 1;
      } else if (f.k === 'ring') {     // a Healer's wave goes out, a Collector's pull comes in
        w = f.inw ? f.r * (1 - k) : f.r * k;
        c.globalAlpha = 1 - k; ell(c, f.x, f.y, w, w); c.lineWidth = 9; c.strokeStyle = f.col; c.stroke(); c.globalAlpha = 1;
      }
    }
    if (G.over) {
      k = clamp((now - G.over.at) / 350, 0, 1);
      c.save(); c.translate(AW / 2, 430); c.scale(0.6 + 0.4 * k * (2 - k), 0.6 + 0.4 * k * (2 - k)); c.globalAlpha = k;
      txt(c, G.over.win ? 'Victory!' : 'It got away!', 0, 0, 92, G.over.win ? '#FFD66B' : '#fff', NAVY, 16);
      c.restore(); c.globalAlpha = 1;
    }
  }
  // My own sum and the number on my rune, under the boss's HP. A Little fighter sees the rune's number as places
  // for dots that fill up, so "how many more?" can be counted.
  function pill(now, k, y) {
    var me = api.myId(), r = G.runes[me], fl = G.flash && now < G.flash.until ? G.flash : null, sk = whoOf(me)[0], col = colOf(me);
    var hh = Math.round(54 * k), f1 = Math.round(25 * k), f2 = Math.round(38 * k), aw = 46 * k, shw = 44 * k, mark = fl ? 34 * k : 0;
    var eq, tgt, n, wl, ws, wt, total, x, left, ink, dots = 0, dw = 0, i, d;
    if (!fl && (!r || !r.t)) {             // no rune of my own right now: mine is lit and the shot is at full power
      if (!r || !r.done) return;
      total = 150 * k; x = hx - total / 2;
      rr(c, x, y, total, hh, hh / 2); c.fillStyle = '#C9F5C4'; c.fill(); ol(c, 3.5);
      c.save(); c.translate(x + 36 * k, y + hh / 2); c.scale(k, k); c.lineWidth = 7; c.strokeStyle = '#1F7A36'; c.beginPath(); c.moveTo(-11, 1); c.lineTo(-3, 10); c.lineTo(13, -10); c.stroke(); c.restore();
      for (i = 0; i < G.cap; i++) { api.starPath(c, x + (72 + i * 26) * k, y + hh / 2, 11 * k); c.fillStyle = i < G.bonus ? '#FFC933' : '#fff'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = NAVY; c.stroke(); }
      return;
    }
    eq = fl ? fl.eq : eqText(r.sum, G.parts); n = fl ? fl.n : r.sum; tgt = String(fl ? fl.target : r.t);
    if (sk === 0) { dots = Math.min(10, +tgt); d = 16 * k; dw = dots * d + 10 * k; eq = { left: '', sum: eq.sum }; }
    c.font = '600 ' + f1 + 'px ' + FONT; wl = eq.left ? c.measureText(eq.left).width + 9 * k : 0;
    c.font = '700 ' + f2 + 'px ' + FONT; ws = c.measureText(eq.sum).width; wt = c.measureText(tgt).width;
    total = 20 * k + dw + wl + ws + mark + aw + shw + 6 * k + wt + 20 * k; x = hx - total / 2;
    rr(c, x, y, total, hh, hh / 2); c.fillStyle = fl ? (fl.ok ? '#C9F5C4' : '#FFC9CF') : '#fff'; c.fill(); ol(c, 3.5);
    ink = fl ? (fl.ok ? '#1F7A36' : '#B3122F') : NAVY; left = x + 20 * k;
    for (i = 0; i < dots; i++) {           // the places for dots: full ones are what is in the cannon already
      ell(c, left + d * (i + 0.5), y + hh / 2, d * 0.38, d * 0.38);
      c.fillStyle = i < n ? ink : '#fff'; c.fill(); c.lineWidth = 2.2; c.strokeStyle = i < n ? ink : '#9AA0AC'; c.stroke();
    }
    left += dw;
    c.textAlign = 'left'; c.textBaseline = 'middle';
    if (eq.left) { c.font = '600 ' + f1 + 'px ' + FONT; c.fillStyle = ink; c.fillText(eq.left, left, y + hh / 2 + 1); left += wl; }
    c.font = '700 ' + f2 + 'px ' + FONT; c.fillStyle = ink; c.fillText(eq.sum, left, y + hh / 2 + 1); left += ws;
    if (fl) {                              // a tick or a cross
      c.save(); c.translate(left + mark / 2 + 2 * k, y + hh / 2); c.scale(k, k); c.lineWidth = 6; c.strokeStyle = ink; c.beginPath();
      if (fl.ok) { c.moveTo(-9, 1); c.lineTo(-2, 9); c.lineTo(11, -9); } else { c.moveTo(-9, -9); c.lineTo(9, 9); c.moveTo(9, -9); c.lineTo(-9, 9); }
      c.stroke(); c.restore(); left += mark;
    }
    c.save(); c.translate(left + aw / 2, y + hh / 2); c.scale(k, k);         // arrow
    c.lineWidth = 5; c.strokeStyle = '#8A8F98'; c.beginPath(); c.moveTo(-12, 0); c.lineTo(11, 0); c.moveTo(3, -8); c.lineTo(12, 0); c.lineTo(3, 8); c.stroke(); c.restore(); left += aw;
    c.save(); c.translate(left + shw / 2, y + hh / 2 - 1); c.scale(k * 0.33, k * 0.33);   // my rune, small
    plate(c); c.fillStyle = lin(c, -60, -54, 60, 60, shade(col, 0.25), col); c.fill(); ol(c, 11);
    if (r && r.t && (r.done || !r.has)) { api.starPath(c, 0, 4, 34); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 8); }
    c.restore(); left += shw + 6 * k;
    c.font = '700 ' + f2 + 'px ' + FONT; c.textAlign = 'left'; c.fillStyle = NAVY; c.fillText(tgt, left, y + hh / 2 + 1);
  }
  function hud(now) {
    var small = H < 600 || W < 900, k = small ? 0.8 : 1, bl = backW + 18, bh = Math.round(28 * k), by = 8;
    var bw = Math.max(160, Math.min(560, 2 * (hx - bl), 2 * (W - COL - 8 - hx))), bx = hx - bw / 2;
    var n = G.hpMax, gap = n > 14 ? 2 : 3, sw = (bw - 8 - (n - 1) * gap) / n, i, left, warn;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.lineJoin = 'round'; c.lineCap = 'round';
    // the boss's HP: one piece for every hit it can still take
    rr(c, bx, by, bw, bh, bh / 2); c.fillStyle = '#2A2140'; c.fill(); ol(c, 3.5);
    c.save(); rr(c, bx + 3, by + 3, bw - 6, bh - 6, (bh - 6) / 2); c.clip();
    for (i = 0; i < n; i++) {
      c.fillStyle = i < G.hp ? lin(c, 0, by, 0, by + bh, '#FF8FA3', '#E8334F') : 'rgba(255,255,255,0.10)';
      c.fillRect(bx + 4 + i * (sw + gap), by + 3, sw, bh - 6);
    }
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(bx, by + 3, bw, (bh - 6) * 0.35);
    c.restore();
    txt(c, BOSSES[G.boss].en + '  ' + G.hp + ' / ' + G.hpMax, hx, by + bh / 2 + 1, Math.round(17 * k), '#fff', NAVY, 4, 700);

    if (G.over) return;                // the fight is over: no sum, no clock
    pill(now, k, by + bh + 6);
    // time left before the boss escapes, above the buttons
    left = G.ends - now; warn = left < 60000;
    api.label(c, '⏱ ' + clock(left), W - COL / 2, by + Math.round(40 * k), warn ? '#FF4F6D' : '#fff', warn ? '#fff' : NAVY, Math.round(22 * k));
  }
  function orbXY(ob, now) {             // where an orb is: it slides when it was pulled or shuffled
    var k = ob.mt ? clamp((now - ob.mt) / 450, 0, 1) : 1;
    if (k >= 1) return ob;
    k = k * (2 - k);
    return { x: ob.fx + (ob.x - ob.fx) * k, y: ob.fy + (ob.y - ob.fy) * k - Math.sin(k * Math.PI) * 40 };
  }
  function draw(now) {
    var sx = 0, sy = 0, items = [], me = api.myId(), ps = api.players(), i, mr, little, top;
    makeBg();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(bg, 0, 0);
    if (G && now < G.shake) { sx = (Math.random() - 0.5) * 9; sy = (Math.random() - 0.5) * 9; }
    c.setTransform(dpr * vs, 0, 0, dpr * vs, (vox + sx) * dpr, (voy + sy) * dpr);
    c.lineJoin = 'round'; c.lineCap = 'round';
    torches();
    if (G) floorFx(now);
    tagList = [];
    items.push({ y: BOSS.y, d: function () { bossEntity(now); } });
    items.push({ y: CANNON.y, d: function () { cannonEntity(now); } });
    if (G) {
      mr = G.runes[me]; little = whoOf(me)[0] === 0; top = mr && mr.t ? mr.t : 10;
      Object.keys(G.orbs).forEach(function (oid) {
        var ob = G.orbs[oid], at = orbXY(ob, now);
        items.push({ y: at.y, d: function () {
          var age = (now - ob.born) / 300, kk = age >= 1 ? 1 : Math.max(0.05, age * (2 - age)), s2 = orbSprite(ob.v, 30), z = s2.sz * kk, ds;
          var wob = G.tock && now < G.tock ? Math.sin(T * 40 + ob.id) * 4 : 0;
          var mine = !little || (ob.v > 0 && ob.v <= top);       // a Little fighter cannot take minus gems or too big numbers
          c.fillStyle = SH; ell(c, at.x + 3, at.y + 2, 23 * kk, 8 * kk); c.fill();
          if (!mine) c.globalAlpha = 0.4;
          c.drawImage(s2, at.x + wob - z / 2, at.y - 38 - Math.sin(T * 3 + ob.id) * 4 - z / 2, z, z);
          c.globalAlpha = 1;
          if (little && mine && kk >= 1) { ds = dotSprite(ob.v); c.drawImage(ds, at.x - ds.w / 2, at.y + 1 - (ds.h > 30 ? 6 : 0), ds.w, ds.h); }
        } });
      });
      Object.keys(ps).forEach(function (pid) {
        var p = ps[pid], pos = p.id === me ? G.me : G.pos[p.id];
        if (!pos || (p.room !== 'boss' && p.id !== me)) return;
        items.push({ y: pos.y, d: function () { playerEntity(p, pos, p.id === me, now); } });
      });
      Object.keys(G.mins).forEach(function (mid) {
        var mn = G.mins[mid];
        items.push({ y: mn.y, d: function () {
          var kk = clamp((now - mn.at) / Math.max(1, mn.born - mn.at), 0, 1);
          c.save(); c.translate(mn.x, mn.y);
          if (kk < 1) {                  // hatching: a warning ring first
            ell(c, 0, 0, 40, 15); c.fillStyle = 'rgba(255,60,70,0.25)'; c.fill(); c.setLineDash([10, 8]); c.lineWidth = 4; c.strokeStyle = 'rgba(255,60,70,0.9)'; c.stroke(); c.setLineDash([]);
            c.scale(0.25 + kk * 0.75, 0.25 + kk * 0.75); c.globalAlpha = 0.45 + kk * 0.55;
          }
          drawMinion(c, G.boss, T, mn.id); c.globalAlpha = 1;
          c.restore();
        } });
      });
      for (i = 0; i < G.rocks.length; i++) (function (rk) {
        var t2 = (now - rk.start) / 1000;
        if (t2 < 0) return;
        items.push({ y: rk.y + rk.vy * t2, d: function () {
          var x = rk.x + rk.vx * t2, y = rk.y + rk.vy * t2;
          c.fillStyle = SH; ell(c, x + 6, y + 4, rk.r, rk.r * 0.34); c.fill();
          c.save(); c.translate(x, y - rk.r + 4); drawRock(c, rk.r, (rk.vx || rk.vy) * t2 / rk.r, G.boss); c.restore();
        } });
      })(G.rocks[i]);
    }
    items.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < items.length; i++) items[i].d();
    if (G) {
      topFx(now);
      drawTags();
      hud(now);
      if (stick && !G.over) stick.draw(c);
    }
  }

  // ---------- the buttons beside the cave: my role's ability, Drop, and a Grown-up's times pad ----------
  function updateSide(now) {
    var me = api.myId(), on = mode === 'fight' && G && !G.over, list, who, left, secs, key, anyDown = false, id, nx, ready, st;
    if (!el.side) return;
    if (!on) { if (ui.on !== false) { ui.on = false; ui.key = ''; el.side.hidden = true; } return; }
    list = G.carry[me] || []; who = whoOf(me); left = Math.max(0, G.cdAt - now); secs = Math.ceil(left / 1000);
    for (id in G.down) if (now < G.down[id].until) { anyDown = true; break; }
    nx = nextOrb(); ready = who[0] === 2 && nx !== null && atCannon(G.me);
    st = left > 0 ? 'wait' : who[1] === 1 ? (anyDown ? 'go' : 'idle') : '';
    key = [list.join(','), who[0], who[1], secs, st, nx, ready ? 1 : 0, Math.round(left / Math.max(1, G.cdLen) * 20)].join('|');
    if (ui.on !== true) { ui.on = true; el.side.hidden = false; }
    if (key === ui.key) return;
    ui.key = key;
    el.drop.style.visibility = list.length ? 'visible' : 'hidden';
    if (list.length) el.dropN.textContent = num(list[list.length - 1]);
    el.act.className = 'boss-rnd boss-act' + (st ? ' ' + st : '');
    el.actIco.textContent = ROLES[who[1]].ico;
    el.actIco.style.opacity = left > 0 ? '0.35' : '';
    el.actFill.style.height = (left > 0 ? Math.round(left / Math.max(1, G.cdLen) * 100) : 0) + '%';
    el.actN.textContent = left > 0 ? String(secs) : '';
    el.act.setAttribute('aria-label', ROLES[who[1]].en + (left > 0 ? ': ready in ' + secs + ' seconds' : ': ' + ROLES[who[1]].hint));
    el.pad.hidden = who[0] !== 2;
    el.pad.className = 'boss-pad' + (ready ? '' : ' off');
    el.padNext.className = 'boss-nx' + (nx !== null ? ' has' : '');
    el.padNext.textContent = nx !== null ? num(nx) : '';
    el.padNext.style.background = nx === null ? '' : nx < 0 ? '#34326E' : ORB_COL[(nx - 1) % ORB_COL.length];
  }

  // ---------- the lobby and the result panel ----------
  function fit(cn) {
    var w = cn.clientWidth, hh = cn.clientHeight, q = Math.min(2, window.devicePixelRatio || 1), g;
    if (w < 2 || hh < 2) return null;
    if (cn.width !== Math.round(w * q) || cn.height !== Math.round(hh * q)) { cn.width = Math.round(w * q); cn.height = Math.round(hh * q); }
    g = cn.getContext('2d'); g.setTransform(q, 0, 0, q, 0, 0); g.clearRect(0, 0, w, hh); g.lineJoin = 'round'; g.lineCap = 'round';
    return { g: g, w: w, h: hh };
  }
  function portrait(cn, kind, o, locked) {
    var f = fit(cn), g, th = BOSSES[kind], s;
    if (!f) return;
    g = f.g; s = Math.min(f.h / 292, f.w / 400);
    g.fillStyle = lin(g, 0, 0, 0, f.h, th.wall2, th.floor2); g.fillRect(0, 0, f.w, f.h);
    g.fillStyle = th.floor2; g.fillRect(0, f.h * 0.72, f.w, f.h * 0.28);
    g.fillStyle = 'rgba(14,10,34,0.25)'; g.fillRect(0, f.h * 0.72, f.w, 5);
    g.save(); g.translate(f.w / 2, f.h - 14 * s); g.scale(s, s);
    g.fillStyle = SH; ell(g, 12, 4, 150, 26); g.fill();
    drawBoss(g, kind, T, o);
    g.restore();
    if (locked) { g.fillStyle = 'rgba(27,42,73,0.74)'; g.fillRect(0, 0, f.w, f.h); padlock(g, f.w / 2, f.h / 2 + 4, Math.min(f.h * 0.34, 46)); }
  }
  function show() {
    if (!root) return;
    el.lobby.hidden = mode !== 'lobby';
    el.result.hidden = mode !== 'result';
    ui.key = '';
  }
  function wins(i) { var w = L && L.w && L.w[i]; return w ? (w[0] | 0) + (w[1] | 0) + (w[2] | 0) : 0; }
  function renderLobby() {
    var ps = api.players(), me = api.myId(), html = '', i, n, mineReady, stars = '', who = {}, mine, band, kinds;
    if (!root || !L || mode !== 'lobby') return;
    band = L.band || [[5, 8], [10, 15], [30, 54]];
    (L.who || []).forEach(function (q) { who[q[0]] = q; });
    mine = who[me] || whoOf(me);
    // who is here: their level, the numbers their runes will ask for, and a tick when they are ready
    Object.keys(ps).map(function (id) { return ps[id]; }).filter(function (p) { return p.room === 'boss'; }).sort(function (a, b) { return a.id - b.id; }).forEach(function (p) {
      var q = who[p.id] || [p.id].concat(whoOf(p.id));
      html += '<span class="tagc' + (p.id === me ? ' me' : '') + '"><i style="background:' + api.esc(p.color) + '"></i>' + SKILLS[q[1]].ico + ' ' + api.esc(p.name) +
        ' <u>' + band[q[1]][0] + '–' + band[q[1]][1] + '</u>' + (L.ready.indexOf(p.id) >= 0 ? ' <em>✅</em>' : '') + '</span>';
    });
    el.who.innerHTML = html;
    for (i = 0; i < NB; i++) {
      n = wins(i);
      el.cards[i].card.className = 'boss-card' + (L.boss === i ? ' on' : '') + (L.can[i] ? '' : ' lock');
      el.cards[i].card.setAttribute('aria-pressed', L.boss === i ? 'true' : 'false');
      el.cards[i].badge.textContent = !L.can[i] ? '🔒' : n ? '🏆 ' + n : L.open[i] ? 'New!' : '👫';
      el.cards[i].best.textContent = n && L.bt && L.bt[i] ? '⏱ ' + clock(L.bt[i] * 1000) : '';
    }
    for (i = 0; i < 3; i++) {
      el.diffs[i].className = 'boss-diff' + (L.diff === i ? ' on' : '');
      el.diffs[i].setAttribute('aria-pressed', L.diff === i ? 'true' : 'false');
    }
    for (i = 0; i < 4; i++) {              // the role cards: mine is yellow, the dots show who else took it
      html = '';
      (L.who || []).forEach(function (q) { if (q[2] === i && ps[q[0]]) html += '<i style="background:' + api.esc(ps[q[0]].color) + '"></i>'; });
      el.roles[i].card.className = 'boss-role' + (mine[mine.length - 1] === i ? ' on' : '');
      el.roles[i].card.setAttribute('aria-pressed', mine[mine.length - 1] === i ? 'true' : 'false');
      el.roles[i].dots.innerHTML = html;
    }
    // what kind of numbers each level gets in this fight
    kinds = ['dots to count ●●●', L.minus ? 'plus and minus' : 'adding', 'times: 7 × 8'];
    html = '';
    for (i = 0; i < 3; i++) html += '<div' + (mine[mine.length - 2] === i ? ' class="me"' : '') + '>' + SKILLS[i].ico + ' ' + band[i][0] + '–' + band[i][1] + ' <small>' + kinds[i] + '</small></div>';
    el.nums.innerHTML = html;
    mineReady = L.ready.indexOf(me) >= 0;
    el.ready.className = 'btn ' + (mineReady ? 'boss-wait' : 'primary');
    if (!goEnds) el.ready.textContent = mineReady ? '✅ Ready' : 'Ready!';
    for (i = 0; i < 5; i++) stars += i < L.left ? '⭐' : '<i>⭐</i>';
    el.left.innerHTML = 'Big rewards left today<br><span>' + stars + '</span>';
    pictAt = 0;
  }
  function renderResult() {
    var m = R, me = api.myId(), mine = null, rows = '', b, d, note = '', sum = '';
    if (!root || !m) return;
    b = BOSSES[kindOf(m.boss)]; d = DIFFS[clamp(m.diff | 0, 0, 2)];
    (m.rows || []).forEach(function (r) {
      if (r.id === me) mine = r;
      rows += '<div class="boss-rrow' + (r.id === me ? ' me' : '') + '"><i style="background:' + api.esc(r.color || '#ccc') + '"></i><b>' + SKILLS[clamp(r.sk | 0, 0, 2)].ico + ' ' + api.esc(r.name) + '</b>' +
        '<span>' + ROLES[clamp(r.role | 0, 0, 3)].ico + '</span><span>🔮 ' + (r.n | 0) + '</span><span>✨ ' + (r.lit | 0) + '</span>' +
        (r.first ? '<span class="boss-new">🏆 First win!</span>' : '') + '<em>+' + (r.stars | 0) + ' ⭐</em></div>';
    });
    if (mine) {
      sum = mine.first ? mine.base + ' + ' + (mine.stars - mine.base) + ' = ' + mine.stars + ' ⭐' : '+' + mine.stars + ' ⭐';
      if (m.win && mine.capped) note = 'That was win number 6 or more today. Come back tomorrow for big rewards!';
      else if (m.win && mine.first && m.boss < NB - 1) note = '🔓 New boss: <b>' + api.esc(BOSSES[m.boss + 1].en) + '</b> · ' + tri(BOSSES[m.boss + 1]);
      else if (m.win && !mine.n) note = 'Load an orb into the cannon next time to earn more.';
      else if (!m.win) note = 'The boss ran away after 6 minutes. Try again!';
    }
    el.rhead.innerHTML = (m.win ? '<h2>Victory!</h2><span class="boss-tri">胜利 <span class="py">shènglì</span> · Menang</span>' : '<h2>It got away!</h2><span class="boss-tri">逃走了 <span class="py">táozǒu le</span> · Terlepas</span>') +
      '<span class="boss-note"><b>' + api.esc(b.en) + '</b> · ' + tri(b) + ' · ' + api.esc(d.en) + ' · ⏱ ' + clock((m.secs | 0) * 1000) + '</span>' +
      (sum ? '<span class="boss-sum">' + sum + '</span>' : '') + (note ? '<span class="boss-note">' + note + '</span>' : '');
    el.rrows.innerHTML = rows;
    pictAt = 0;
    if (m.win) api.sfx('goal');
  }
  function build() {
    var p, head, cards, roles, row, diffs, go, how, rp, rtop, i;
    root = h('div', 'screen boss-ov');
    cv = h('canvas', 'boss-cv'); cv.setAttribute('aria-label', 'Monster Cave'); c = cv.getContext('2d');
    root.appendChild(cv);
    el.back = h('button', 'btn boss-back', 'Back to town'); el.back.type = 'button'; el.back.setAttribute('data-quiet', '');
    el.back.onclick = function () { api.sfx('close'); close(); };
    root.appendChild(el.back);

    // beside the cave: the times pad (Grown-up only), my role's ability, Drop
    el.side = h('div', 'boss-side'); el.side.hidden = true;
    el.pad = h('div', 'boss-pad'); el.pad.hidden = true; el.pad.setAttribute('role', 'group'); el.pad.setAttribute('aria-label', 'Load the next orb times');
    for (i = 1; i <= 9; i++) (function (n) {
      var b = h('button', '', '×' + n); b.type = 'button'; b.setAttribute('data-quiet', ''); b.setAttribute('aria-label', 'times ' + n);
      b.onclick = function () { tapLoad(n); };
      el.pad.appendChild(b);
    })(i);
    el.padNext = h('span', 'boss-nx'); el.padNext.setAttribute('aria-label', 'The next orb'); el.pad.appendChild(el.padNext);
    el.side.appendChild(el.pad);
    el.act = h('button', 'boss-rnd boss-act', '<i></i><b></b><span></span>'); el.act.type = 'button'; el.act.setAttribute('data-quiet', '');
    el.actFill = el.act.querySelector('i'); el.actIco = el.act.querySelector('b'); el.actN = el.act.querySelector('span');
    el.act.onclick = useRole;
    el.side.appendChild(el.act);
    el.drop = h('button', 'boss-rnd boss-drop', '<span>▼ Drop</span><b></b>'); el.drop.type = 'button';
    el.drop.setAttribute('aria-label', 'Put the last orb down');
    el.dropN = el.drop.querySelector('b');
    el.drop.onclick = function () { api.send({ t: 'boss.drop' }); };
    el.side.appendChild(el.drop);
    root.appendChild(el.side);

    // lobby
    el.lobby = h('div', 'boss-lay'); el.lobby.hidden = true;
    p = h('div', 'boss-panel'); p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Monster Cave');
    head = h('div', 'boss-head', '<div class="boss-title"><h2>Monster Cave</h2><span class="boss-tri">怪兽洞 <span class="py">guàishòu dòng</span> · Gua Raksasa</span></div>');
    el.who = h('div', 'boss-who'); head.appendChild(el.who); p.appendChild(head);
    cards = h('div', 'boss-cards'); cards.setAttribute('role', 'group'); cards.setAttribute('aria-label', 'Boss');
    el.cards = [];
    BOSSES.forEach(function (b, n) {
      var card = h('button', 'boss-card'), pc = h('canvas'), badge = h('span', 'boss-badge'), best = h('em');
      card.type = 'button'; card.setAttribute('data-quiet', ''); pc.setAttribute('aria-hidden', 'true');
      card.appendChild(pc); card.appendChild(h('b', '', api.esc(b.en)));
      card.appendChild(h('span', '', api.esc(b.zh) + ' <span class="py">' + api.esc(b.py) + '</span>')); card.appendChild(h('span', '', api.esc(b.ms)));
      card.appendChild(best); card.appendChild(badge);
      card.onclick = function () {
        if (L && L.can[n]) { api.sfx('tap'); api.send({ t: 'boss.pick', boss: n }); return; }
        api.sfx('deny'); api.toast('Beat the ' + BOSSES[n - 1].en + ' first!');
        card.classList.remove('boss-shake'); void card.offsetWidth; card.classList.add('boss-shake');
      };
      el.cards.push({ card: card, pc: pc, badge: badge, best: best }); cards.appendChild(card);
    });
    p.appendChild(cards);
    roles = h('div', 'boss-roles'); roles.setAttribute('role', 'group'); roles.setAttribute('aria-label', 'Your role');
    el.roles = [];
    ROLES.forEach(function (r, n) {
      var card = h('button', 'boss-role', '<b>' + r.ico + '</b><span><b>' + api.esc(r.en) + '</b><span>' + tri(r) + '</span><i>' + api.esc(r.hint) + '</i></span><u></u>');
      card.type = 'button';
      card.onclick = function () { api.send({ t: 'boss.role', r: n }); };
      el.roles.push({ card: card, dots: card.querySelector('u') }); roles.appendChild(card);
    });
    p.appendChild(roles);
    row = h('div', 'boss-row');
    diffs = h('div', 'boss-diffs'); diffs.setAttribute('role', 'group'); diffs.setAttribute('aria-label', 'Difficulty');
    el.diffs = [];
    DIFFS.forEach(function (d, n) {
      var b = h('button', 'boss-diff', '<b>' + api.esc(d.en) + '</b><span>' + api.esc(d.zh) + ' <span class="py">' + api.esc(d.py) + '</span> · ' + api.esc(d.ms) + '</span><i>⭐ ' + d.stars + '</i>');
      b.type = 'button';
      b.onclick = function () { api.send({ t: 'boss.diff', d: n }); };
      el.diffs.push(b); diffs.appendChild(b);
    });
    row.appendChild(diffs);
    el.nums = h('div', 'boss-nums'); el.nums.setAttribute('aria-label', 'The numbers each level gets'); row.appendChild(el.nums);
    go = h('div', 'boss-go');
    el.ready = h('button', 'btn primary', 'Ready!'); el.ready.type = 'button';
    el.ready.onclick = function () { if (L) api.send({ t: 'boss.ready', on: L.ready.indexOf(api.myId()) < 0 }); };
    el.left = h('div', 'boss-left');
    go.appendChild(el.ready); go.appendChild(el.left); row.appendChild(go);
    p.appendChild(row);
    how = h('div', 'boss-how', '<span class="boss-o" style="background:' + ORB_COL[2] + '">3</span>+<span class="boss-o" style="background:' + ORB_COL[3] + '">4</span>=<span class="boss-sh">7</span>' +
      '<span class="boss-sep"></span>🧑 <span class="boss-o" style="background:' + ORB_COL[6] + '">7</span>×8=<span class="boss-sh" style="background:#9B6BFF">56</span>' +
      '<span class="boss-sep"></span><span class="boss-sh" style="background:#FF7A45">✓</span><span class="boss-sh" style="background:#5ED6C4">✓</span><span class="boss-sh" style="background:#9B6BFF">✓</span>💥' +
      '<span class="boss-howt">Carry orbs to the cannon and make the number on your own rune. When every rune is lit, the cannon fires!</span>');
    p.appendChild(how);
    el.lobby.appendChild(p); root.appendChild(el.lobby);

    // result
    el.result = h('div', 'boss-lay boss-mid'); el.result.hidden = true;
    rp = h('div', 'boss-panel boss-res'); rp.setAttribute('role', 'dialog'); rp.setAttribute('aria-label', 'Result');
    rtop = h('div', 'boss-rtop');
    el.rpic = h('canvas'); el.rpic.setAttribute('aria-hidden', 'true'); rtop.appendChild(el.rpic);
    el.rhead = h('div', 'boss-rinfo'); rtop.appendChild(el.rhead);
    rp.appendChild(rtop);
    el.rrows = h('div', 'boss-rows'); rp.appendChild(el.rrows);
    el.again = h('button', 'btn primary', 'Continue'); el.again.type = 'button';
    el.again.onclick = function () { R = null; mode = L ? 'lobby' : 'wait'; show(); renderLobby(); };
    rp.appendChild(el.again);
    el.result.appendChild(rp); root.appendChild(el.result);
    document.body.appendChild(root);
  }

  // ---------- frame loop, open and close ----------
  // The cave floor keeps a column free on the right for the buttons, so they never cover the fight.
  function size() {
    var w = root.clientWidth, hh = root.clientHeight, d = Math.min(2, window.devicePixelRatio || 1);
    if (w === W && hh === H && d === dpr) return;
    W = w; H = hh; dpr = d;
    cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
    COL = Math.round(clamp(W * 0.13, 104, 140));
    vs = Math.min(H / AH, (W - COL) / 1112) || 1;
    vox = Math.max(-24 * vs, (W - COL - AW * vs) / 2); voy = (H - AH * vs) / 2;
    hx = vox + 600 * vs; backW = el.back.offsetWidth || 140;
    el.side.style.width = Math.max(COL, Math.round(W - vox - (X1 + 12) * vs)) + 'px';
    ts = clamp(0.8 / vs, 0.78, 1.3); bgKey = '';
  }
  function frame() {
    if (!root) return;
    raf = requestAnimationFrame(frame);
    var now = tnow(), dt = Math.min(0.05, (now - last) / 1000 || 0.016), n, i;
    last = now; T = now / 1000;
    size();
    if (W < 2 || H < 2) return;
    if (G) update(dt, now);
    draw(now);
    updateSide(now);
    if (mode === 'lobby' && L) {
      if (goEnds) {                   // everybody is ready: 3, 2, 1
        n = Math.max(0, Math.ceil((goEnds - now) / 1000));
        if (n !== goShown) { goShown = n; el.ready.textContent = n > 0 ? 'Go in ' + n + '…' : 'Go!'; api.sfx('tap'); }
      }
      if (now - pictAt > 140) {
        pictAt = now;
        for (i = 0; i < NB; i++) portrait(el.cards[i].pc, i, { sleep: L.boss !== i, lx: 0, ly: 0.4, hurt: 0, wind: 0 }, !L.can[i]);
      }
    } else if (mode === 'result' && R && now - pictAt > 140) {
      pictAt = now;
      portrait(el.rpic, kindOf(R.boss), { dazed: !!R.win, angry: false, lx: 0, ly: 0.4, hurt: 0, wind: 0 }, false);
    }
  }
  function onKey(e) {                 // on the laptop: space drops, E or Enter uses the ability, 1 to 9 load times that
    if (!root || mode !== 'fight' || !G || G.over) return;
    if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); if ((G.carry[api.myId()] || []).length) api.send({ t: 'boss.drop' }); }
    else if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') { e.preventDefault(); useRole(); }
    else if (e.key >= '1' && e.key <= '9' && e.key.length === 1 && whoOf(api.myId())[0] === 2) tapLoad(+e.key);
  }
  function close() {
    if (!root) return;
    if (raf) cancelAnimationFrame(raf); raf = 0;
    timers.forEach(function (t) { clearTimeout(t); }); timers = [];
    window.removeEventListener('keydown', onKey);
    if (stick) stick.destroy(); stick = null;
    if (root.parentNode) root.parentNode.removeChild(root);
    root = null; cv = null; c = null; el = {}; G = null; L = null; R = null; bg = null; bgKey = ''; mode = 'wait'; W = H = 0; ui = {};
    api.leave();
  }
  function open() {
    if (root) return;
    if (!document.getElementById('boss-style')) { var st = document.createElement('style'); st.id = 'boss-style'; st.textContent = CSS; document.head.appendChild(st); }
    FONT = api.FONT || FONT; NAVY = api.NAVY || NAVY;
    mode = 'wait'; L = null; G = null; R = null; goEnds = 0; W = H = 0; bg = null; bgKey = ''; orbCache = {}; ui = {}; last = tnow();
    build();
    stick = api.stick(cv);
    window.addEventListener('keydown', onKey);
    api.enter('boss');
    raf = requestAnimationFrame(frame);
  }

  window.FTGames = window.FTGames || {};
  window.FTGames.boss = {
    init: function (a) { api = a; },
    open: open,
    onMessage: onMessage,
    onPlayers: function () { if (root && mode === 'lobby') renderLobby(); }
  };
})();
