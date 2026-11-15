// Monster Cave (boss): the tablet side of the co-operative boss fight. See dev/games/boss.js for the rules.
// The whole cave is on screen at once, so everybody sees every orb's number, the team's sum and the number
// on the boss's shield. The server decides everything; this file draws, moves the own player and reports
// where the player is and when the player was hit.
(function () {
  'use strict';
  var api = null, root = null;
  var NAVY = '#1B2A49', TAU = Math.PI * 2, FONT = 'Fredoka, sans-serif';
  var SH = 'rgba(14,10,34,0.30)';

  // ---- the arena: the same numbers are in dev/games/boss.js ----
  var AW = 1200, AH = 760, X0 = 70, X1 = 1130, Y0 = 270, Y1 = 725;
  var BOSS = { x: 600, y: 335 }, CANNON = { x: 600, y: 610 };
  var DELIVER_R = 100, SPEED = 285, AS = 0.8, BS = 0.86;

  var BOSSES = [
    { en: 'Slime King', zh: '史莱姆王', py: 'shǐláimǔ wáng', ms: 'Raja Lendir', col: '#7BE06B', hit: '#9BF07A',
      wall: '#2B3758', wall2: '#4B5C8A', floor: '#5F7198', floor2: '#7E91B8', rock: '#566890' },
    { en: 'Rock Golem', zh: '石头巨人', py: 'shítou jùrén', ms: 'Raksasa Batu', col: '#AEB6C4', hit: '#E8C79A',
      wall: '#3A322D', wall2: '#63564A', floor: '#84735F', floor2: '#A5927B', rock: '#75665A' },
    { en: 'Fire Dragon', zh: '火龙', py: 'huǒlóng', ms: 'Naga Api', col: '#FF6B4A', hit: '#FFA23D',
      wall: '#371D2C', wall2: '#69333F', floor: '#7B4A52', floor2: '#9E666A', rock: '#6E3B46' }
  ];
  var DIFFS = [
    { en: 'Easy', zh: '简单', py: 'jiǎndān', ms: 'Mudah', a: 5, b: 10, stars: 10 },
    { en: 'Normal', zh: '普通', py: 'pǔtōng', ms: 'Biasa', a: 10, b: 20, stars: 14 },
    { en: 'Hard', zh: '困难', py: 'kùnnan', ms: 'Sukar', a: 20, b: 50, stars: 18 }
  ];
  var ORB_COL = ['#FF6B6B', '#FF9F43', '#EDB100', '#5DBB63', '#22B8A6', '#4C9BFF', '#7C7BFF', '#B46BFF', '#FF6FBF', '#E8703A', '#3F9A53', '#3B6FE0'];
  var MEDAL = ['#D58A4C', '#C6D0DB', '#FFC933'];

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

  // ---------- state ----------
  var el = {}, cv = null, c = null, W = 0, H = 0, dpr = 1, vs = 1, vox = 0, voy = 0, ts = 1;
  var stick = null, raf = 0, last = 0, T = 0, timers = [];
  var mode = 'wait';      // 'wait' (nothing from the server yet), 'lobby', 'fight', 'result'
  var L = null;           // the last lobby message
  var G = null;           // the fight on screen
  var R = null;           // the result of the last fight
  var goEnds = 0, goShown = -1, bg = null, bgKey = '', pictAt = 0, tagList = [], orbCache = {};

  function later(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function curBoss() { return G ? G.boss : (mode === 'result' && R) ? R.boss : L ? L.boss : 0; }

  // ---------- CSS ----------
  var CSS = [
    '.boss-ov{background:#241C33;overflow:hidden;touch-action:none}',
    '.boss-ov .py{font-family:system-ui,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif}',
    '.boss-cv{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none}',
    '.boss-back{position:absolute;left:10px;top:8px;z-index:6;height:48px;padding:0 16px;font-size:17px;border-width:3px;white-space:nowrap}',
    '.boss-drop{position:absolute;right:18px;bottom:18px;z-index:4;width:88px;height:88px;border-radius:50%;border:4px solid #1B2A49;background:#FFD66B;padding:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:15px;font-weight:700;line-height:1.05;box-shadow:0 5px 0 rgba(27,42,73,.4)}',
    '.boss-drop b{font-size:30px;line-height:1}',
    '.boss-drop:active{transform:scale(.94)}',
    '.boss-lay{position:absolute;left:0;top:0;right:0;bottom:0;z-index:5;display:flex;align-items:flex-start;justify-content:center;padding:8px;background:rgba(20,14,34,.5)}',
    '.boss-panel{background:#FFF3D6;color:#1B2A49;border:5px solid #1B2A49;border-radius:28px;padding:10px 14px 12px;width:100%;max-width:1040px;max-height:100%;overflow-x:hidden;overflow-y:auto;touch-action:pan-y;display:flex;flex-direction:column;gap:9px;box-shadow:0 8px 0 rgba(10,8,24,.35)}',
    '.boss-head{display:flex;align-items:center;gap:10px;min-height:50px;padding-left:158px}',
    '.boss-title{flex:none;display:flex;flex-direction:column}',
    '.boss-head h2{font-size:30px;line-height:1.05;flex:none;margin:0}',
    '.boss-tri{font-size:16px;font-weight:600;line-height:1.15}',
    '.boss-who{flex:1;min-width:0;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}',
    '.boss-who .tagc{height:32px;font-size:15px}',
    '.boss-cards{display:flex;gap:10px}',
    '.boss-card{flex:1 1 0;min-width:0;position:relative;border:4px solid #1B2A49;border-radius:22px;background:#fff;padding:6px 8px 7px;display:flex;flex-direction:column;align-items:center;gap:1px;font-size:14px;font-weight:600;line-height:1.15;text-align:center}',
    '.boss-card canvas{display:block;width:100%;height:170px;border-radius:14px;border:3px solid #1B2A49}',
    '.boss-card b{font-size:21px;margin-top:3px}',
    '.boss-card.on{background:#FFD66B;outline:4px solid #1B2A49;outline-offset:2px}',
    '.boss-card.lock{background:#E4E0D6;color:#5A5A5A}',
    '.boss-card:active{transform:scale(.97)}',
    '.boss-badge{position:absolute;right:12px;top:11px;background:#fff;color:#1B2A49;border:3px solid #1B2A49;border-radius:999px;padding:1px 9px;font-size:16px;font-weight:700;line-height:1.3}',
    '.boss-row{display:flex;gap:10px;align-items:stretch}',
    '.boss-diffs{flex:1 1 0;min-width:0;display:flex;gap:8px}',
    '.boss-diff{flex:1 1 0;min-width:0;min-height:92px;border:3px solid #1B2A49;border-radius:18px;background:#fff;font-size:13px;font-weight:600;line-height:1.2;padding:4px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center}',
    '.boss-diff>span{white-space:nowrap}',
    '.boss-diff b{font-size:20px}',
    '.boss-diff i{font-style:normal;font-size:16px;font-weight:700;white-space:nowrap}',
    '.boss-diff.on{background:#1B2A49;color:#fff}',
    '.boss-diff:active{transform:scale(.96)}',
    '.boss-shelf{flex:none;position:relative;width:232px;min-height:100px;background:#fff;border:3px solid #1B2A49;border-radius:18px;overflow:hidden}',
    '.boss-shelf canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block}',
    '.boss-go{flex:none;width:200px;display:flex;flex-direction:column;gap:4px;justify-content:center}',
    '.boss-go .btn{width:100%;height:64px;font-size:26px;padding:0 8px;white-space:nowrap}',
    '.boss-go .btn.boss-wait{background:#7BD389}',
    '.boss-left{font-size:14px;font-weight:600;text-align:center;line-height:1.25}',
    '.boss-left span{white-space:nowrap}',
    '.boss-left i{font-style:normal;opacity:.28}',
    '.boss-how{display:flex;align-items:center;justify-content:center;gap:8px;font-size:24px;font-weight:700}',
    '.boss-o,.boss-sh{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border:3px solid #1B2A49;color:#fff;font-size:22px;font-weight:700;text-shadow:0 0 3px #1B2A49,0 0 3px #1B2A49}',
    '.boss-o{border-radius:50%}',
    '.boss-sh{border-radius:8px 8px 20px 20px;background:#3B82F6;width:44px;height:46px}',
    '.boss-howt{margin-left:10px;font-size:16px;font-weight:600}',
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
    '.boss-rrow em{font-style:normal;font-weight:700;font-size:20px;white-space:nowrap}',
    '.boss-new{background:#FFD66B;border:2px solid #1B2A49;border-radius:999px;padding:0 9px;font-size:14px;font-weight:700;white-space:nowrap}',
    '.boss-res .btn{align-self:center;min-width:240px;height:60px;font-size:24px}',
    '.boss-shake{animation:boss-shake .4s}',
    '@keyframes boss-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}50%{transform:translateX(7px)}75%{transform:translateX(-4px)}}',
    '@media (min-height:700px){.boss-lay{align-items:center}.boss-head{padding-left:0}}',
    '@media (max-height:700px){.boss-card canvas{height:128px}.boss-lay.boss-mid{padding-top:62px}}',
    '@media (max-width:900px),(max-height:560px){.boss-panel{padding:8px 10px 9px;gap:7px;border-width:4px;border-radius:24px}.boss-head{min-height:46px;padding-left:150px}.boss-head h2{font-size:23px}.boss-tri{font-size:13px}.boss-who{gap:4px}.boss-who .tagc{height:28px;font-size:13px;padding:0 9px 0 4px}.boss-who .tagc i{width:17px;height:17px}' +
      '.boss-card{font-size:12px;border-width:3px;border-radius:18px;padding:5px 6px 5px}.boss-card canvas{height:122px}.boss-card b{font-size:18px;margin-top:2px}.boss-badge{font-size:14px;right:9px;top:8px}' +
      '.boss-diff{min-height:86px;font-size:11px}.boss-diff b{font-size:17px}.boss-diff i{font-size:14px}.boss-shelf{width:176px;min-height:86px}.boss-go{width:164px}.boss-go .btn{height:58px;font-size:22px}.boss-left{font-size:13px}' +
      '.boss-how{font-size:20px;gap:6px}.boss-o{width:34px;height:34px;font-size:19px}.boss-sh{width:38px;height:40px;font-size:19px}.boss-howt{display:none}' +
      '.boss-rtop canvas{width:160px;height:128px}.boss-rinfo h2{font-size:30px}.boss-rinfo .boss-sum{font-size:22px}.boss-rinfo .boss-note{font-size:14px}.boss-rrow{font-size:16px;padding:3px 10px}.boss-rrow em{font-size:18px}.boss-res .btn{height:54px;font-size:21px}' +
      '.boss-drop{width:76px;height:76px;right:12px;bottom:12px}.boss-drop b{font-size:26px}.boss-back{font-size:16px;padding:0 13px}}'
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

  // ---------- the three bosses, drawn with their feet at (0, 0), about 250 high ----------
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
  function drawBoss(g, kind, t, o) {
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (kind === 1) drawGolem(g, t, o); else if (kind === 2) drawDragon(g, t, o); else drawSlime(g, t, o);
  }

  // the boss's shield: a bubble around it and a plate in front with the number to make
  function drawShield(g, n, t, k) {
    g.save(); g.translate(0, -100); g.scale(k, k);
    var q = g.createRadialGradient(0, 0, 40, 0, 0, 176);
    q.addColorStop(0, 'rgba(140,210,255,0.03)'); q.addColorStop(0.75, 'rgba(140,210,255,0.14)'); q.addColorStop(1, 'rgba(140,210,255,0.42)');
    ell(g, 0, 0, 176, 128); g.fillStyle = q; g.fill();
    g.lineWidth = 5; g.strokeStyle = 'rgba(200,238,255,0.95)'; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.ellipse(0, 0, 158, 110, 0, Math.PI * 1.08, Math.PI * 1.36); g.stroke();
    g.beginPath(); g.ellipse(0, 0, 158, 110, 0, Math.PI * 1.42, Math.PI * 1.47); g.stroke();
    g.restore();
    g.save(); g.translate(0, 6 + Math.sin(t * 3) * 3); g.scale(k, k);
    function plate() { g.beginPath(); g.moveTo(-60, -54); g.lineTo(60, -54); g.lineTo(60, 2); g.quadraticCurveTo(56, 44, 0, 64); g.quadraticCurveTo(-56, 44, -60, 2); g.closePath(); }
    g.save(); g.translate(7, 6); plate(); g.fillStyle = '#1F4E9E'; g.fill(); ol(g, 5); g.restore();
    plate(); g.fillStyle = lin(g, -60, -54, 60, 60, '#7CCBFF', '#2F7BE0'); g.fill(); ol(g, 5);
    g.save(); plate(); g.clip(); g.fillStyle = 'rgba(255,255,255,0.28)'; poly(g, [-60, -54, -8, -54, -50, 30, -60, 30]); g.fill(); g.restore();
    g.save(); g.scale(0.84, 0.84); plate(); g.lineWidth = 3.5; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.stroke(); g.restore();
    txt(g, String(n), 0, 0, n > 9 ? 58 : 66, '#fff', NAVY, 9);
    g.restore();
  }

  // minions: a little slime, a rockling, a flame sprite. Feet at (0, 0).
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
    } else {
      g.scale(1 + b, 1 - b);
      g.beginPath(); g.moveTo(-26, 0); g.bezierCurveTo(-32, -46, 32, -46, 26, 0); g.quadraticCurveTo(0, 8, -26, 0); g.closePath();
      g.fillStyle = lin(g, -20, -40, 20, 0, '#B9F383', '#4CBD5D'); g.fill(); ol(g, 3.5);
      g.fillStyle = 'rgba(255,255,255,0.55)'; ell(g, -11, -28, 7, 4, -0.5); g.fill();
      for (i = -1; i <= 1; i += 2) { ell(g, i * 9, -17, 6.5, 6.5); g.fillStyle = '#fff'; g.fill(); ol(g, 2); ell(g, i * 9, -15.5, 3, 3); g.fillStyle = NAVY; g.fill(); }
    }
    g.restore();
  }
  // a rolling rock (a fireball for the dragon), centre at (0, 0)
  function drawRock(g, r, ang, kind) {
    var i, a;
    if (kind === 2) { g.fillStyle = 'rgba(255,138,61,0.35)'; ell(g, 0, 0, r + 9, r + 9); g.fill(); }
    ell(g, 0, 0, r, r); g.fillStyle = lin(g, -r, -r, r, r, kind === 2 ? '#FFB24A' : '#C9B8A2', kind === 2 ? '#D8452A' : '#7A6A5A'); g.fill();
    g.save(); ell(g, 0, 0, r, r); g.clip(); g.rotate(ang);
    g.fillStyle = kind === 2 ? 'rgba(255,240,160,0.75)' : 'rgba(60,45,35,0.32)';
    for (i = 0; i < 5; i++) { a = i * TAU / 5; ell(g, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.2, r * 0.13, a); g.fill(); }
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
  function padlock(g, x, y, s) {
    g.save(); g.translate(x, y); g.scale(s / 40, s / 40);
    g.lineWidth = 9; g.strokeStyle = NAVY; g.beginPath(); g.arc(0, -14, 15, Math.PI, 0); g.lineTo(15, 0); g.moveTo(-15, -14); g.lineTo(-15, 0); g.stroke();
    g.lineWidth = 4; g.strokeStyle = '#C9D2DC'; g.beginPath(); g.arc(0, -14, 15, Math.PI, 0); g.lineTo(15, 0); g.moveTo(-15, -14); g.lineTo(-15, 0); g.stroke();
    rr(g, -24, -4, 48, 38, 9); g.fillStyle = lin(g, -24, 0, 24, 0, '#FFE27A', '#F0A52A'); g.fill(); ol(g, 4);
    ell(g, 0, 11, 5.5, 5.5); g.fillStyle = NAVY; g.fill(); g.fillRect(-2.5, 12, 5, 12);
    g.restore();
  }
  function cup(g, x, y, s, col, gem) {            // a trophy standing at (x, y)
    g.save(); g.translate(x, y); g.scale(s, s);
    g.lineWidth = 7; g.strokeStyle = NAVY; g.beginPath(); g.arc(-18, -37, 9, 0.5 * Math.PI, 1.5 * Math.PI); g.stroke(); g.beginPath(); g.arc(18, -37, 9, -0.5 * Math.PI, 0.5 * Math.PI); g.stroke();
    g.lineWidth = 3; g.strokeStyle = col; g.beginPath(); g.arc(-18, -37, 9, 0.5 * Math.PI, 1.5 * Math.PI); g.stroke(); g.beginPath(); g.arc(18, -37, 9, -0.5 * Math.PI, 0.5 * Math.PI); g.stroke();
    rr(g, -17, -8, 34, 9, 3); g.fillStyle = shade(col, -0.3); g.fill(); ol(g, 2.5);
    rr(g, -5, -20, 10, 13, 2); g.fillStyle = shade(col, -0.15); g.fill(); ol(g, 2.5);
    g.beginPath(); g.moveTo(-21, -52); g.lineTo(21, -52); g.quadraticCurveTo(21, -21, 0, -18); g.quadraticCurveTo(-21, -21, -21, -52); g.closePath();
    g.fillStyle = lin(g, -21, 0, 21, 0, shade(col, 0.35), shade(col, -0.14)); g.fill(); ol(g, 3);
    g.fillStyle = 'rgba(255,255,255,0.55)'; ell(g, -12, -40, 3, 8, 0.15); g.fill();
    if (gem) { ell(g, 1, -37, 6.5, 6.5); g.fillStyle = gem; g.fill(); ol(g, 2); }
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
  function makeBg() {
    var kind = curBoss(), key = W + '|' + H + '|' + dpr + '|' + kind, g, th = BOSSES[kind], i, x, y, r, L0, R0, T0, B0, cA, cB;
    if (bg && bgKey === key) return;
    if (!bg) bg = document.createElement('canvas');
    bgKey = key; bg.width = cv.width; bg.height = cv.height;
    g = bg.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = th.wall; g.fillRect(0, 0, bg.width, bg.height);
    g.setTransform(dpr * vs, 0, 0, dpr * vs, vox * dpr, voy * dpr); g.lineJoin = 'round'; g.lineCap = 'round';
    L0 = -vox / vs - 6; R0 = (W - vox) / vs + 6; T0 = -voy / vs - 6; B0 = (H - voy) / vs + 6;   // what is on screen, in arena units
    cA = kind === 0 ? '#9BF2A0' : kind === 1 ? '#9BF2E4' : '#FFC06B'; cB = kind === 0 ? '#3FAE5A' : kind === 1 ? '#35B5A2' : '#E0662A';

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
    } else {                               // rubble
      [[110, 330], [1086, 352], [160, 716], [1050, 712], [900, 262]].forEach(function (q, n) {
        for (i = 0; i < 3; i++) { ell(g, q[0] + i * 17 - 16, q[1] - (i === 1 ? 5 : 0), 10 + seed(n * 7 + i) * 6, 7 + seed(n * 5 + i) * 3); g.fillStyle = i % 2 ? '#A69886' : '#8F8272'; g.fill(); ol(g, 2.5); }
      });
    }
    // shade under the back wall and along the sides
    g.fillStyle = lin(g, 0, 208, 0, 290, 'rgba(14,10,34,0.42)', 'rgba(14,10,34,0)'); g.fillRect(L0, 208, R0 - L0, 82);
    g.fillStyle = lin(g, 0, 0, 90, 0, 'rgba(14,10,34,0.4)', 'rgba(14,10,34,0)'); g.fillRect(L0, 200, 96 - L0, B0 - 200);
    g.fillStyle = lin(g, 1110, 0, 1200, 0, 'rgba(14,10,34,0)', 'rgba(14,10,34,0.4)'); g.fillRect(1106, 200, R0 - 1106, B0 - 200);
    g.fillStyle = lin(g, 0, 728, 0, 772, 'rgba(14,10,34,0)', 'rgba(14,10,34,0.35)'); g.fillRect(L0, 728, R0 - L0, B0 - 728);

    // back wall with a ragged foot
    function wall() {
      g.beginPath(); g.moveTo(L0, T0); g.lineTo(R0, T0); g.lineTo(R0, 214);
      for (x = 1260; x >= -60; x -= 60) g.lineTo(x, 204 + seed(x) * 18);
      g.lineTo(L0, 214); g.closePath();
    }
    wall(); g.fillStyle = lin(g, 0, 0, 0, 216, th.wall, th.wall2); g.fill();
    g.save(); wall(); g.clip();
    for (i = 0; i < 26; i++) {             // rock faces: lighter on the upper left, darker on the lower right
      x = -40 + seed(i + 600) * 1280; y = 30 + seed(i + 700) * 190; r = 40 + seed(i + 800) * 60;
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(10,8,28,0.14)';
      poly(g, [x - r, y, x - r * 0.3, y - r * 0.6, x + r * 0.8, y - r * 0.4, x + r, y + r * 0.3, x + r * 0.2, y + r * 0.6]); g.fill();
    }
    g.strokeStyle = shade(th.wall2, 0.22); g.lineWidth = 5;
    g.beginPath(); g.moveTo(1260, 200 + seed(1260) * 18); for (x = 1200; x >= -60; x -= 60) g.lineTo(x, 200 + seed(x) * 18); g.stroke();
    if (kind === 0) for (i = 0; i < 9; i++) {  // slime running down the wall
      x = 60 + i * 135 + seed(i + 900) * 50; y = 96 + seed(i + 950) * 80;
      rr(g, x - 11, -40, 22, y + 40, 11); g.fillStyle = 'rgba(123,224,107,0.8)'; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(40,120,70,0.7)'; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.45)'; rr(g, x - 6, y - 30, 5, 18, 2.5); g.fill();
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
  function addOrb(a, now, quiet) { G.orbs[a[0]] = { id: a[0], x: a[1], y: a[2], v: a[3], born: quiet ? now - 1000 : now }; }
  function spark(x, y, col, n, sp, life, r) {
    if (G.fx.length > 150) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, v = sp * (0.4 + Math.random() * 0.6);
      G.fx.push({ k: 'p', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - sp * 0.3, col: col, r: (r || 6) * (0.6 + Math.random() * 0.7), t0: tnow(), life: life * (0.6 + Math.random() * 0.4) });
    }
  }
  function newFight(m, now) {
    var i, q;
    G = {
      boss: clamp(m.boss | 0, 0, 2), diff: clamp(m.diff | 0, 0, 2), hp: m.hp, hpMax: m.hpMax, target: m.target, sum: m.sum, parts: m.parts || [],
      ends: now + m.left, dazed: now + (m.dazed || 0), angry: now + (m.angry || 0), shieldAt: now + (m.dazed || 0) - 400,
      orbs: {}, carry: m.carry || {}, down: {}, pos: {}, atks: [], rocks: [], mins: {}, fx: [],
      me: { x: m.you[0], y: m.you[1], f: 1, m: 0 }, sentAt: 0, sx: -1, sy: -1, sm: 0, sf: 1, hitAt: 0,
      flash: null, beam: 0, hurt: 0, shake: 0, wind: 0, pulse: 0, puff: 0, over: null
    };
    for (i = 0; i < m.orbs.length; i++) addOrb(m.orbs[i], now, true);
    for (i = 0; i < m.p.length; i++) { q = m.p[i]; G.pos[q[0]] = { x: q[1], y: q[2], tx: q[1], ty: q[2], f: q[3], m: q[4] }; }
    Object.keys(m.down || {}).forEach(function (id) { G.down[id] = { until: now + m.down[id][0], safe: now + m.down[id][1] }; });
    (m.atks || []).forEach(function (a) { G.atks.push({ id: a.id, z: a.z, at: now - Math.max(0, 1200 - a.in), hit: now + a.in, done: false }); });
    (m.rocks || []).forEach(function (r) { G.rocks.push({ id: r.id, x: r.x, y: r.y, vx: r.vx, vy: r.vy, r: r.r, at: now - Math.max(0, 1200 - r.in), start: now + r.in, life: r.life }); });
    (m.mins || []).forEach(function (a) { G.mins[a[0]] = { id: a[0], x: a[1], y: a[2], tx: a[1], ty: a[2], at: now, born: now + a[3] }; });
    updateDrop();
  }
  // an orb goes into the cannon: it flies there, and the number pops up
  function loaded(m, now) {
    var p = posOf(m.id) || CANNON;
    G.carry[m.id] = m.c || [];
    G.fx.push({ k: 'fly', v: m.v, x0: p.x, y0: p.y - 96, x1: CANNON.x, y1: CANNON.y - 100, t0: now, life: 240 });
    G.fx.push({ k: 'txt', s: (m.v < 0 ? '−' : '+') + Math.abs(m.v), x: CANNON.x + 74, y: CANNON.y - 120, col: m.v < 0 ? '#9FD8FF' : '#FFD66B', t0: now + 150, life: 900 });
    G.pulse = now + 200;
    if (m.id === api.myId()) updateDrop();
  }
  function eqText(sum, parts) {       // "3 + 4 = 7"; a long chain is shown as "27 + 4 = 31"
    var i, s = 0, out, lastV;
    if (!parts || !parts.length) return { left: '', sum: String(sum) };
    for (i = 0; i < parts.length; i++) s += parts[i];
    if (parts.length === 1 && s === sum) return { left: '', sum: String(sum) };
    if (parts.length <= 3 && s === sum && parts[0] > 0) {
      out = String(parts[0]);
      for (i = 1; i < parts.length; i++) out += (parts[i] < 0 ? ' − ' + (-parts[i]) : ' + ' + parts[i]);
    } else { lastV = parts[parts.length - 1]; out = (sum - lastV) + (lastV < 0 ? ' − ' + (-lastV) : ' + ' + lastV); }
    return { left: out + ' =', sum: String(sum) };
  }
  function popMinion(id) {
    var q = G.mins[id];
    if (!q) return;
    spark(q.x, q.y - 22, BOSSES[G.boss].hit, 7, 150, 420, 6);
    delete G.mins[id];
  }
  function fightMsg(m, now) {
    var me = api.myId(), i, q, o, seen, k, list, p;
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
        if (m.id !== undefined) {
          G.carry[m.id] = m.c || [];
          if (m.id === me) { if (m.fx === 'take') api.sfx('emote'); updateDrop(); }
        }
        break;
      case 'boss.sum':
        loaded(m, now); G.sum = m.sum; G.parts = m.parts || [];
        api.sfx('claim');
        break;
      case 'boss.fire':
        loaded(m, now);
        G.flash = { ok: true, eq: eqText(m.was, m.parts), target: m.was, until: now + 1500 };
        G.sum = 0; G.parts = []; G.hp = m.hp; if (m.target) G.target = m.target;
        G.dazed = now + m.dazed; G.angry = 0; G.shieldAt = now + m.dazed;
        G.atks = G.atks.filter(function (a) { return a.done; });
        (m.gone || []).forEach(popMinion);
        G.beam = now + 200; G.hurt = now + 560; G.shake = now + 650;
        for (i = 0; i < 16; i++) {       // the shield breaks into pieces
          q = Math.random() * TAU;
          G.fx.push({ k: 'p', tri: 1, x: BOSS.x + Math.cos(q) * 90, y: BOSS.y - 100 + Math.sin(q) * 70, vx: Math.cos(q) * (160 + Math.random() * 200), vy: Math.sin(q) * 200 - 120, col: i % 2 ? '#BFE9FF' : '#7CCBFF', r: 9 + Math.random() * 8, t0: now + 250, life: 800 });
        }
        api.sfx('right');
        break;
      case 'boss.over':
        loaded(m, now);
        G.flash = { ok: false, eq: eqText(m.sum, m.parts), target: m.target || G.target, until: now + 1700 };
        G.sum = 0; G.parts = []; G.angry = now + m.angry; G.puff = now + 250;
        api.sfx('wrong');
        break;
      case 'boss.ko':
        p = posOf(m.id);
        G.carry[m.id] = [];
        (m.add || []).forEach(function (a) { addOrb(a, now); });
        G.down[m.id] = { until: now + m.ms, safe: now + m.safe };
        if (p) spark(p.x, p.y - 40, '#FFD66B', 8, 170, 500, 6);
        if (m.id === me) { api.sfx('tagit'); G.shake = now + 280; updateDrop(); }
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
      G.over = { win: !!m.win, at: now }; G.atks = []; G.rocks = []; G.mins = {}; G.me.m = 0; updateDrop();
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
    dx = (pt.x - CANNON.x) / 56; dy = (pt.y - (CANNON.y - 8)) / 26; q = dx * dx + dy * dy;
    if (q < 1) { k = 1 / Math.sqrt(q || 0.0001); pt.x = CANNON.x + dx * k * 56; pt.y = CANNON.y - 8 + dy * k * 26; }
  }
  function segDist2(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy, t = l ? clamp(((px - x1) * dx + (py - y1) * dy) / l, 0, 1) : 0;
    dx = x1 + dx * t - px; dy = y1 + dy * t - py;
    return dx * dx + dy * dy;
  }
  function inZone(pt, z) {
    for (var i = 0; i < z.length; i++) {
      var s = z[i], dx, dy;
      if (s[0] === 'c') { dx = pt.x - s[1]; dy = pt.y - s[2]; if (dx * dx + dy * dy < (s[3] - 6) * (s[3] - 6)) return true; }
      else if (s[0] === 'l' && segDist2(pt.x, pt.y, s[1], s[2], s[3], s[4]) < (s[5] - 6) * (s[5] - 6)) return true;
    }
    return false;
  }
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
    var meId = api.myId(), me = G.me, dn = G.down[meId], isDown = !!dn && now < dn.until, safe = !!dn && now < dn.safe;
    var v, l, k, id, o, i, a, r, q, dx, dy;
    if (!G.over) {
      v = stick ? stick.read() : { x: 0, y: 0 }; l = Math.sqrt(v.x * v.x + v.y * v.y);
      if (!isDown && l > 0.12) {
        me.x += v.x * SPEED * dt; me.y += v.y * SPEED * dt; fix(me);
        if (v.x > 0.1) me.f = 1; else if (v.x < -0.1) me.f = -1;
        me.m = 1;
      } else me.m = 0;
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
      if (!a.done && now >= a.hit) { a.done = true; boom(a, now); if (!safe && !G.over && inZone(me, a.z)) report('a', a.id, now); }
      if (now > a.hit + 450) G.atks.splice(i, 1);
    }
    for (i = G.rocks.length - 1; i >= 0; i--) {
      r = G.rocks[i]; q = (now - r.start) / 1000;
      if (q * 1000 > r.life) { G.rocks.splice(i, 1); continue; }
      if (q >= 0 && !safe && !G.over) { dx = r.x + r.vx * q - me.x; dy = r.y + r.vy * q - me.y; if (dx * dx + dy * dy < (r.r + 12) * (r.r + 12)) report('r', r.id, now); }
    }
    for (i = G.fx.length - 1; i >= 0; i--) if (now > G.fx[i].t0 + G.fx[i].life) G.fx.splice(i, 1);
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
  function zoneShape(s, k) {            // k < 1: the inner part that grows while the warning runs
    var len, w;
    if (s[0] === 'c') { ell(c, s[1], s[2], s[3] * k, s[3] * k); return; }
    len = Math.sqrt((s[3] - s[1]) * (s[3] - s[1]) + (s[4] - s[2]) * (s[4] - s[2])); w = s[5] * k;
    c.save(); c.translate(s[1], s[2]); c.rotate(Math.atan2(s[4] - s[2], s[3] - s[1]));
    c.beginPath(); c.rect(0, -w, len, w * 2); c.restore();
  }
  function floorFx(now) {
    var mine = G.carry[api.myId()], has = mine && mine.length, pulse = 0.5 + 0.5 * Math.sin(T * 5), i, j, a, k, s, r, q, x, len, dir, col = BOSSES[G.boss].hit;
    // where the cannon takes orbs
    ell(c, CANNON.x, CANNON.y, DELIVER_R, DELIVER_R);
    c.fillStyle = 'rgba(255,214,107,' + (has ? 0.16 + pulse * 0.12 : 0.07) + ')'; c.fill();
    c.setLineDash([16, 13]); c.lineDashOffset = -T * 34; c.lineWidth = 5; c.strokeStyle = has ? '#FFD66B' : 'rgba(255,214,107,0.5)'; c.stroke(); c.setLineDash([]);
    if (G.over) return;
    c.save(); c.beginPath(); c.rect(-300, 224, AW + 600, AH); c.clip();
    for (i = 0; i < G.atks.length; i++) {
      a = G.atks[i];
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
    for (i = 0; i < G.rocks.length; i++) {   // the lane a rock is about to roll along
      r = G.rocks[i];
      if (now >= r.start) continue;
      k = clamp((now - r.at) / Math.max(1, r.start - r.at), 0, 1); dir = r.vx < 0 ? -1 : 1;
      c.fillStyle = 'rgba(255,60,70,0.18)'; c.fillRect(-300, r.y - r.r, AW + 600, r.r * 2);
      c.fillStyle = 'rgba(255,60,70,0.28)'; len = (AW + 140) * k; c.fillRect(dir > 0 ? -70 : AW + 70 - len, r.y - r.r, len, r.r * 2);
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 6;
      for (q = 0; q < 6; q++) { x = ((q * 220 + T * 260 * dir) % 1320 + 1320) % 1320 - 60; c.beginPath(); c.moveTo(x - dir * 14, r.y - 16); c.lineTo(x + dir * 6, r.y); c.lineTo(x - dir * 14, r.y + 16); c.stroke(); }
    }
    c.restore();
  }
  function bossEntity(now) {
    var kind = curBoss(), o = { dazed: false, angry: false, sleep: false, hurt: 0, wind: 0, lx: 0, ly: 0.7 }, y = BOSS.y, sc = BS, alpha = 1, rot = 0, q, k, i, a;
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
      if (k > 0.02) drawShield(c, G.target, T, k);
    }
    c.restore();
  }
  function cannonEntity(now) {
    var rec = G ? clamp(1 - (now - G.beam) / 420, 0, 1) : 0, glow = G ? clamp(G.sum / Math.max(1, G.target), 0, 1) : 0, k, a, i;
    if (G && now < G.beam) rec = 0;
    c.save(); c.translate(CANNON.x, CANNON.y);
    drawCannon(c, T, rec, glow);
    if (G && !G.over) {                    // the team's sum, floating over the barrel
      k = 1 + clamp((G.pulse + 260 - now) / 260, 0, 1) * 0.3; if (now < G.pulse) k = 1;
      c.save(); c.translate(-2, -152 + Math.sin(T * 2.4) * 3); c.scale(k, k);
      ell(c, 0, 0, 37, 37); c.fillStyle = 'rgba(255,214,107,0.3)'; c.fill();
      ell(c, 0, 0, 30, 30); c.fillStyle = lin(c, -30, -30, 30, 30, '#FFF6C8', '#FFD66B'); c.fill(); ol(c, 4);
      txt(c, String(G.sum), 0, 2, G.sum > 9 ? 34 : 40, NAVY);
      c.restore();
      if (now > G.puff && now < G.puff + 900) for (i = 0; i < 4; i++) {   // too much: grey smoke
        a = (now - G.puff) / 900; c.fillStyle = 'rgba(120,120,135,' + (0.75 * (1 - a)) + ')'; ell(c, (i - 1.5) * 20 * (1 + a), -116 - a * 70 - i * 6, 13 + a * 16, 13 + a * 16); c.fill();
      }
    }
    c.restore();
  }
  function playerEntity(p, pos, isMe, now) {
    var x = pos.x, y = pos.y, dn = G.down[p.id], down = !!dn && now < dn.until, blink = !!dn && !down && now < dn.safe, f = pos.f < 0 ? -1 : 1, hh, i, a;
    c.fillStyle = SH; ell(c, x + 3, y + 1, 27, 9); c.fill();
    if (isMe) { ell(c, x, y, 36, 13); c.lineWidth = 4.5; c.strokeStyle = '#FFD66B'; c.stroke(); }
    if (blink && Math.floor(now / 110) % 2) c.globalAlpha = 0.4;
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
    var i, j, q, hh, list, n, sp, cy, a;
    for (i = 0; i < tagList.length; i++) {
      q = tagList[i];
      c.save(); c.translate(q.x, q.y); c.scale(ts, ts); hh = api.nameTag(c, q.p, 0, 0, q.me); c.restore();
      list = q.carry || []; n = list.length; cy = q.y - hh * ts - 26;
      if (q.down) for (j = 0; j < 3; j++) { a = T * 6 + j * TAU / 3; api.starPath(c, q.x + Math.cos(a) * 32, cy + 8 + Math.sin(a) * 9, 10); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 2.5); }
      for (j = 0; j < n; j++) { sp = orbSprite(list[j], 20); c.drawImage(sp, q.x + (j - (n - 1) / 2) * 46 - sp.sz / 2, cy - sp.sz / 2 + Math.sin(T * 4 + j) * 2.5, sp.sz, sp.sz); }
    }
  }
  function topFx(now) {
    var i, f, k, x, y, sp, w;
    if (now > G.beam && now < G.beam + 520) {     // the cannon fires at the boss
      k = (now - G.beam) / 520; w = 54 * (1 - k * k);
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(170,140,255,0.5)'; c.lineWidth = w + 26; c.beginPath(); c.moveTo(CANNON.x - 2, CANNON.y - 108); c.lineTo(BOSS.x, BOSS.y - 96); c.stroke();
      c.strokeStyle = '#FFD66B'; c.lineWidth = w; c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = w * 0.45; c.stroke();
      ell(c, BOSS.x, BOSS.y - 96, 60 + k * 120, 46 + k * 90); c.fillStyle = 'rgba(255,255,255,' + (0.8 * (1 - k)) + ')'; c.fill();
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
        c.globalAlpha = 1 - k * k; txt(c, f.s, f.x, f.y - k * 56, 40, f.col, NAVY, 7); c.globalAlpha = 1;
      }
    }
    if (G.over) {
      k = clamp((now - G.over.at) / 350, 0, 1);
      c.save(); c.translate(AW / 2, 430); c.scale(0.6 + 0.4 * k * (2 - k), 0.6 + 0.4 * k * (2 - k)); c.globalAlpha = k;
      txt(c, G.over.win ? 'Victory!' : 'It got away!', 0, 0, 92, G.over.win ? '#FFD66B' : '#fff', NAVY, 16);
      c.restore(); c.globalAlpha = 1;
    }
  }
  function hud(now) {
    var small = H < 600 || W < 900, k = small ? 0.8 : 1, side = small ? 170 : 210, bw = Math.min(W - 2 * side, 560), bh = Math.round(28 * k), bx = (W - bw) / 2, by = 8;
    var n = G.hpMax, gap = n > 14 ? 2 : 3, sw = (bw - 8 - (n - 1) * gap) / n, i, fl, eq, tgt, f1, f2, hh, y, wl, ws, wt, total, x, left, col, warn;
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
    txt(c, BOSSES[G.boss].en + '  ' + G.hp + ' / ' + G.hpMax, W / 2, by + bh / 2 + 1, Math.round(17 * k), '#fff', NAVY, 4, 700);

    if (G.over) return;                // the fight is over: no sum, no clock
    // the sum so far, and the number on the shield
    fl = G.flash && now < G.flash.until ? G.flash : null;
    eq = fl ? fl.eq : eqText(G.sum, G.parts); tgt = String(fl ? fl.target : G.target);
    f1 = Math.round(25 * k); f2 = Math.round(38 * k); hh = Math.round(54 * k); y = by + bh + 6;
    c.font = '600 ' + f1 + 'px ' + FONT; wl = eq.left ? c.measureText(eq.left).width + 9 * k : 0;
    c.font = '700 ' + f2 + 'px ' + FONT; ws = c.measureText(eq.sum).width; wt = c.measureText(tgt).width;
    var aw = 46 * k, shw = 40 * k, mark = fl ? 34 * k : 0;
    total = 20 * k + wl + ws + mark + aw + shw + 6 * k + wt + 20 * k; x = (W - total) / 2;
    rr(c, x, y, total, hh, hh / 2); c.fillStyle = fl ? (fl.ok ? '#C9F5C4' : '#FFC9CF') : '#fff'; c.fill(); ol(c, 3.5);
    col = fl ? (fl.ok ? '#1F7A36' : '#B3122F') : NAVY; left = x + 20 * k;
    c.textAlign = 'left'; c.textBaseline = 'middle';
    if (eq.left) { c.font = '600 ' + f1 + 'px ' + FONT; c.fillStyle = col; c.fillText(eq.left, left, y + hh / 2 + 1); left += wl; }
    c.font = '700 ' + f2 + 'px ' + FONT; c.fillStyle = col; c.fillText(eq.sum, left, y + hh / 2 + 1); left += ws;
    if (fl) {                              // a tick or a cross
      c.save(); c.translate(left + mark / 2 + 2 * k, y + hh / 2); c.scale(k, k); c.lineWidth = 6; c.strokeStyle = col; c.beginPath();
      if (fl.ok) { c.moveTo(-9, 1); c.lineTo(-2, 9); c.lineTo(11, -9); } else { c.moveTo(-9, -9); c.lineTo(9, 9); c.moveTo(9, -9); c.lineTo(-9, 9); }
      c.stroke(); c.restore(); left += mark;
    }
    c.save(); c.translate(left + aw / 2, y + hh / 2); c.scale(k, k);         // arrow
    c.lineWidth = 5; c.strokeStyle = '#8A8F98'; c.beginPath(); c.moveTo(-12, 0); c.lineTo(11, 0); c.moveTo(3, -8); c.lineTo(12, 0); c.lineTo(3, 8); c.stroke(); c.restore(); left += aw;
    c.save(); c.translate(left + shw / 2, y + hh / 2); c.scale(k, k);        // little shield
    c.beginPath(); c.moveTo(-15, -17); c.lineTo(15, -17); c.lineTo(15, 0); c.quadraticCurveTo(14, 13, 0, 19); c.quadraticCurveTo(-14, 13, -15, 0); c.closePath();
    c.fillStyle = lin(c, -15, -17, 15, 19, '#7CCBFF', '#2F7BE0'); c.fill(); ol(c, 3.5); c.restore(); left += shw + 6 * k;
    c.font = '700 ' + f2 + 'px ' + FONT; c.textAlign = 'left'; c.fillStyle = '#2F6FCC'; c.fillText(tgt, left, y + hh / 2 + 1);

    // time left before the boss escapes
    left = G.ends - now; warn = left < 60000;
    api.label(c, '⏱ ' + clock(left), W - (small ? 62 : 76), by + Math.round(40 * k), warn ? '#FF4F6D' : '#fff', warn ? '#fff' : NAVY, Math.round(22 * k));
  }
  function draw(now) {
    var sx = 0, sy = 0, items = [], me = api.myId(), ps = api.players(), i, id, o, q, k, sp, sz, r;
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
      Object.keys(G.orbs).forEach(function (oid) {
        var ob = G.orbs[oid];
        items.push({ y: ob.y, d: function () {
          var age = (now - ob.born) / 300, kk = age >= 1 ? 1 : Math.max(0.05, age * (2 - age)), s2 = orbSprite(ob.v, 30), z = s2.sz * kk;
          c.fillStyle = SH; ell(c, ob.x + 3, ob.y + 2, 23 * kk, 8 * kk); c.fill();
          c.drawImage(s2, ob.x - z / 2, ob.y - 38 - Math.sin(T * 3 + ob.id) * 4 - z / 2, z, z);
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
          c.save(); c.translate(x, y - rk.r + 4); drawRock(c, rk.r, rk.vx * t2 / rk.r, G.boss); c.restore();
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
    g = f.g; s = Math.min(f.h / 292, f.w / 420);
    g.fillStyle = lin(g, 0, 0, 0, f.h, th.wall2, th.floor2); g.fillRect(0, 0, f.w, f.h);
    g.fillStyle = th.floor2; g.fillRect(0, f.h * 0.72, f.w, f.h * 0.28);
    g.fillStyle = 'rgba(14,10,34,0.25)'; g.fillRect(0, f.h * 0.72, f.w, 5);
    g.save(); g.translate(f.w / 2, f.h - 14 * s); g.scale(s, s);
    g.fillStyle = SH; ell(g, 12, 4, 150, 26); g.fill();
    drawBoss(g, kind, T, o);
    g.restore();
    if (locked) { g.fillStyle = 'rgba(27,42,73,0.74)'; g.fillRect(0, 0, f.w, f.h); padlock(g, f.w / 2, f.h / 2 + 4, Math.min(f.h * 0.34, 46)); }
  }
  function drawShelf() {
    var f = fit(el.shelf), g, i, x, wins, best, col, cw, py;
    if (!f || !L) return;
    g = f.g; cw = f.w / 3; py = f.h - 30;
    rr(g, 8, py + 6, f.w - 16, 7, 3); g.fillStyle = '#7A4A2B'; g.fill(); ol(g, 2.5);        // the shelf: front edge, then the top
    rr(g, 6, py, f.w - 12, 8, 3); g.fillStyle = '#C98C52'; g.fill(); ol(g, 2.5);
    for (i = 0; i < 3; i++) {
      x = cw * (i + 0.5); wins = L.w[i][0] + L.w[i][1] + L.w[i][2];
      best = L.w[i][2] ? 2 : L.w[i][1] ? 1 : 0; col = wins ? MEDAL[best] : '#E4E0D6';
      g.globalAlpha = wins ? 1 : 0.55; cup(g, x - 7, py, Math.min(1, (py - 10) / 58, cw / 74), col, wins ? BOSSES[i].col : null); g.globalAlpha = 1;
      if (wins) api.label(g, '×' + wins, x + cw * 0.27, 28, '#FFD66B', NAVY, 13);
      txt(g, wins && L.bt[i] ? '⏱ ' + clock(L.bt[i] * 1000) : wins ? '' : '?', x, f.h - 9, 13, wins ? NAVY : '#8A8F98', null, 0, 600);
    }
  }
  function show() {
    if (!root) return;
    el.lobby.hidden = mode !== 'lobby';
    el.result.hidden = mode !== 'result';
    updateDrop();
  }
  function updateDrop() {
    var list = G ? G.carry[api.myId()] : null, on = mode === 'fight' && G && !G.over && list && list.length;
    if (!el.drop) return;
    el.drop.hidden = !on;
    if (on) el.dropN.textContent = num(list[list.length - 1]);
  }
  function renderLobby() {
    var ps = api.players(), me = api.myId(), html = '', i, wins, mineReady, stars = '';
    if (!root || !L || mode !== 'lobby') return;
    Object.keys(ps).map(function (id) { return ps[id]; }).filter(function (p) { return p.room === 'boss'; }).sort(function (a, b) { return a.id - b.id; }).forEach(function (p) {
      html += '<span class="tagc' + (p.id === me ? ' me' : '') + '"><i style="background:' + api.esc(p.color) + '"></i>' + api.esc(p.name) + (L.ready.indexOf(p.id) >= 0 ? ' <em>✅</em>' : '') + '</span>';
    });
    el.who.innerHTML = html;
    for (i = 0; i < 3; i++) {
      wins = L.w[i][0] + L.w[i][1] + L.w[i][2];
      el.cards[i].card.className = 'boss-card' + (L.boss === i ? ' on' : '') + (L.can[i] ? '' : ' lock');
      el.cards[i].card.setAttribute('aria-pressed', L.boss === i ? 'true' : 'false');
      el.cards[i].badge.textContent = !L.can[i] ? '🔒' : wins ? '🏆 ' + wins : L.open[i] ? 'New!' : '👫';
      el.diffs[i].className = 'boss-diff' + (L.diff === i ? ' on' : '');
      el.diffs[i].setAttribute('aria-pressed', L.diff === i ? 'true' : 'false');
    }
    mineReady = L.ready.indexOf(me) >= 0;
    el.ready.className = 'btn ' + (mineReady ? 'boss-wait' : 'primary');
    if (!goEnds) el.ready.textContent = mineReady ? '✅ Ready' : 'Ready!';
    for (i = 0; i < 5; i++) stars += i < L.left ? '⭐' : '<i>⭐</i>';
    el.left.innerHTML = 'Big rewards left today<br><span>' + stars + '</span>';
    drawShelf();
    pictAt = 0;
  }
  function renderResult() {
    var m = R, me = api.myId(), mine = null, rows = '', b, d, note = '', sum = '';
    if (!root || !m) return;
    b = BOSSES[clamp(m.boss | 0, 0, 2)]; d = DIFFS[clamp(m.diff | 0, 0, 2)];
    (m.rows || []).forEach(function (r) {
      if (r.id === me) mine = r;
      rows += '<div class="boss-rrow' + (r.id === me ? ' me' : '') + '"><i style="background:' + api.esc(r.color || '#ccc') + '"></i><b>' + api.esc(r.name) + '</b><span>🔮 ' + (r.n | 0) + '</span>' +
        (r.first ? '<span class="boss-new">🏆 First win!</span>' : '') + '<em>+' + (r.stars | 0) + ' ⭐</em></div>';
    });
    if (mine) {
      sum = mine.first ? mine.base + ' + ' + (mine.stars - mine.base) + ' = ' + mine.stars + ' ⭐' : '+' + mine.stars + ' ⭐';
      if (m.win && mine.capped) note = 'That was win number 6 or more today. Come back tomorrow for big rewards!';
      else if (m.win && mine.first && m.boss < 2) note = '🔓 New boss: <b>' + api.esc(BOSSES[m.boss + 1].en) + '</b> · ' + tri(BOSSES[m.boss + 1]);
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
    var p, head, cards, row, diffs, go, how, rp, rtop, shelfBox;
    root = h('div', 'screen boss-ov');
    cv = h('canvas', 'boss-cv'); cv.setAttribute('aria-label', 'Monster Cave'); c = cv.getContext('2d');
    root.appendChild(cv);
    el.back = h('button', 'btn boss-back', 'Back to town'); el.back.type = 'button'; el.back.setAttribute('data-quiet', '');
    el.back.onclick = function () { api.sfx('close'); close(); };
    root.appendChild(el.back);
    el.drop = h('button', 'boss-drop', '<span>▼ Drop</span><b></b>'); el.drop.type = 'button'; el.drop.hidden = true;
    el.drop.setAttribute('aria-label', 'Put the last orb down');
    el.dropN = el.drop.querySelector('b');
    el.drop.onclick = function () { api.send({ t: 'boss.drop' }); };
    root.appendChild(el.drop);

    // lobby
    el.lobby = h('div', 'boss-lay'); el.lobby.hidden = true;
    p = h('div', 'boss-panel'); p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Monster Cave');
    head = h('div', 'boss-head', '<div class="boss-title"><h2>Monster Cave</h2><span class="boss-tri">怪兽洞 <span class="py">guàishòu dòng</span> · Gua Raksasa</span></div>');
    el.who = h('div', 'boss-who'); head.appendChild(el.who); p.appendChild(head);
    cards = h('div', 'boss-cards'); cards.setAttribute('role', 'group'); cards.setAttribute('aria-label', 'Boss');
    el.cards = [];
    BOSSES.forEach(function (b, n) {
      var card = h('button', 'boss-card'), pc = h('canvas'), badge = h('span', 'boss-badge');
      card.type = 'button'; card.setAttribute('data-quiet', ''); pc.setAttribute('aria-hidden', 'true');
      card.appendChild(pc); card.appendChild(h('b', '', api.esc(b.en))); card.appendChild(h('span', '', tri(b))); card.appendChild(badge);
      card.onclick = function () {
        if (L && L.can[n]) { api.sfx('tap'); api.send({ t: 'boss.pick', boss: n }); return; }
        api.sfx('deny'); api.toast('Beat the ' + BOSSES[n - 1].en + ' first!');
        card.classList.remove('boss-shake'); void card.offsetWidth; card.classList.add('boss-shake');
      };
      el.cards.push({ card: card, pc: pc, badge: badge }); cards.appendChild(card);
    });
    p.appendChild(cards);
    row = h('div', 'boss-row');
    diffs = h('div', 'boss-diffs'); diffs.setAttribute('role', 'group'); diffs.setAttribute('aria-label', 'Difficulty');
    el.diffs = [];
    DIFFS.forEach(function (d, n) {
      var b = h('button', 'boss-diff', '<b>' + api.esc(d.en) + '</b><span>' + api.esc(d.zh) + ' <span class="py">' + api.esc(d.py) + '</span> · ' + api.esc(d.ms) + '</span><i>🛡 ' + d.a + '–' + d.b + '</i><i>⭐ ' + d.stars + '</i>');
      b.type = 'button';
      b.onclick = function () { api.send({ t: 'boss.diff', d: n }); };
      el.diffs.push(b); diffs.appendChild(b);
    });
    row.appendChild(diffs);
    shelfBox = h('div', 'boss-shelf'); el.shelf = h('canvas'); el.shelf.setAttribute('aria-label', 'Trophy shelf'); shelfBox.appendChild(el.shelf); row.appendChild(shelfBox);
    go = h('div', 'boss-go');
    el.ready = h('button', 'btn primary', 'Ready!'); el.ready.type = 'button';
    el.ready.onclick = function () { if (L) api.send({ t: 'boss.ready', on: L.ready.indexOf(api.myId()) < 0 }); };
    el.left = h('div', 'boss-left');
    go.appendChild(el.ready); go.appendChild(el.left); row.appendChild(go);
    p.appendChild(row);
    how = h('div', 'boss-how', '<span class="boss-o" style="background:' + ORB_COL[2] + '">3</span>+<span class="boss-o" style="background:' + ORB_COL[3] + '">4</span>=<span class="boss-sh">7</span>💥' +
      '<span class="boss-howt">Carry orbs to the cannon. Make the number on the shield!</span>');
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
  function size() {
    var w = root.clientWidth, hh = root.clientHeight, d = Math.min(2, window.devicePixelRatio || 1);
    if (w === W && hh === H && d === dpr) return;
    W = w; H = hh; dpr = d;
    cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
    vs = Math.min(W / AW, H / AH) || 1; vox = (W - AW * vs) / 2; voy = (H - AH * vs) / 2;
    ts = clamp(0.8 / vs, 0.78, 1.3); bgKey = '';
    if (mode === 'lobby') drawShelf();
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
    if (mode === 'lobby' && L) {
      if (goEnds) {                   // everybody is ready: 3, 2, 1
        n = Math.max(0, Math.ceil((goEnds - now) / 1000));
        if (n !== goShown) { goShown = n; el.ready.textContent = n > 0 ? 'Go in ' + n + '…' : 'Go!'; api.sfx('tap'); }
      }
      if (now - pictAt > 140) {
        pictAt = now;
        for (i = 0; i < 3; i++) portrait(el.cards[i].pc, i, { sleep: L.boss !== i, lx: 0, ly: 0.4, hurt: 0, wind: 0 }, !L.can[i]);
      }
    } else if (mode === 'result' && R && now - pictAt > 140) {
      pictAt = now;
      portrait(el.rpic, clamp(R.boss | 0, 0, 2), { dazed: !!R.win, angry: false, lx: 0, ly: 0.4, hurt: 0, wind: 0 }, false);
    }
  }
  function onKey(e) {
    if (!root || mode !== 'fight') return;
    if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); if (!el.drop.hidden) api.send({ t: 'boss.drop' }); }
  }
  function close() {
    if (!root) return;
    if (raf) cancelAnimationFrame(raf); raf = 0;
    timers.forEach(function (t) { clearTimeout(t); }); timers = [];
    window.removeEventListener('keydown', onKey);
    if (stick) stick.destroy(); stick = null;
    if (root.parentNode) root.parentNode.removeChild(root);
    root = null; cv = null; c = null; el = {}; G = null; L = null; R = null; bg = null; bgKey = ''; mode = 'wait'; W = H = 0;
    api.leave();
  }
  function open() {
    if (root) return;
    if (!document.getElementById('boss-style')) { var st = document.createElement('style'); st.id = 'boss-style'; st.textContent = CSS; document.head.appendChild(st); }
    FONT = api.FONT || FONT; NAVY = api.NAVY || NAVY;
    mode = 'wait'; L = null; G = null; R = null; goEnds = 0; W = H = 0; bg = null; bgKey = ''; orbCache = {}; last = tnow();
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
