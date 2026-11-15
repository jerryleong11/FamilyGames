// Family Town game module "monopoly" (client): Town Monopoly (大富翁).
// The server (dev/games/monopoly.js) runs the whole game. This file draws the board in 2.5D, hops the tokens,
// rolls the die on screen, shows every money sum, and asks the server to roll, buy, upgrade or pay.
// Contract: docs/GAME-MODULES.md.
(function () {
  'use strict';
  var api = null, root = null;
  var NAVY = '#1B2A49', TAU = Math.PI * 2, SH = 'rgba(22,48,66,0.20)';
  var FONT = "Fredoka, 'Baloo 2', 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  // Board units: one space is TW x TH, the board is 7 x 7 spaces with the 24 spaces round the edge and a lawn inside.
  var TW = 100, TH = 84, BW = 700, BH = 588, MX = 14, MT = 48, MR = 26, MB = 38, UW = BW + MX + MR, UH = BH + MT + MB;
  var DIE = { x: 350, y: 330, s: 72 };                 // middle of the front face's foot, and the size of the cube
  var SLOTS = [[74, 78], [54, 81], [91, 81], [64, 71], [84, 71], [44, 75]];   // where up to six tokens stand on one space
  var SPECIAL = { start: '#FFE08A', lucky: '#E7DBFF', bus: '#CDE7F5', tax: '#F1E4D3', nap: '#C9D4F4', park: '#BDEBAE' };
  var NOTE_COL = ['#FFFFFF', '#BFE9FF', '#C9F2C7', '#FFD0E4', '#FFE08A'];
  var WHY_ICON = { salary: '🚩', buy: '🏠', up: '⬆️', rent: '🏠', 'rent+': '🏠', tax: '🏛️', 'tax+': '🏛️', card: '🍀', 'card+': '🍀', gift: '🎁', 'gift+': '🎁', park: '🐷' };

  // ---------- state ----------
  var B = null, S = null, rec = null, mySeat = -1, myKey = '';
  var el = {}, cv = null, c = null, dpr = 1, W = 0, H = 0, k = 1, ox = 0, oy = 0;
  var base = null, sprites = {};
  var raf = 0, timers = [], t = 0;
  var anim = [], disp = [], facing = [], floats = [];
  var die = { v: 1, t0: 0, t1: 0 };
  var sumQ = [], sumBusy = false;
  var pick = [0, 0, 0, 0, 0], order = [], payKey = '', paySent = false;
  var info = -1, flash = null, flashId = 0, stageKey = null, sideKey = null, modalKey = null, actSent = false;
  var statusText = '', statusSeq = 0, deadline = 0, lastSec = -2, rollSent = false, logLines = [];

  // ---------- small helpers ----------
  function shade(hex, f) { return window.Scene && window.Scene.shade ? window.Scene.shade(hex, f) : hex; }
  function rnd(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function rr(g, x, y, w, h, r) { api.rr(g, x, y, w, h, r); }
  function poly(g, p) { g.beginPath(); g.moveTo(p[0], p[1]); for (var i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); }
  function ell(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); }
  function ol(g, w) { g.lineWidth = w || 3; g.strokeStyle = NAVY; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
  function lin(g, x0, y0, x1, y1, a, b) { var q = g.createLinearGradient(x0, y0, x1, y1); q.addColorStop(0, a); q.addColorStop(1, b); return q; }
  function blobs(g, list, fill, lw) {
    var i;
    g.strokeStyle = NAVY; g.lineWidth = lw * 2;
    for (i = 0; i < list.length; i++) { g.beginPath(); g.arc(list[i][0], list[i][1], list[i][2], 0, TAU); g.stroke(); }
    g.fillStyle = fill;
    for (i = 0; i < list.length; i++) { g.beginPath(); g.arc(list[i][0], list[i][1], list[i][2], 0, TAU); g.fill(); }
  }
  function esc(s) { return api.esc(s === undefined || s === null ? '' : s); }
  function later(ms, fn) {
    var id = setTimeout(function () {
      var i = timers.indexOf(id);
      if (i >= 0) timers.splice(i, 1);
      if (root) { try { fn(); } catch (e) { if (window.console) console.error(e); } }
    }, Math.max(0, ms));
    timers.push(id);
    return id;
  }
  function tileOrigin(i) {
    var col, row;
    i = ((i % 24) + 24) % 24;
    if (i <= 6) { col = i; row = 0; } else if (i <= 12) { col = 6; row = i - 6; } else if (i <= 18) { col = 18 - i; row = 6; } else { col = 0; row = 24 - i; }
    return { x: col * TW, y: row * TH };
  }
  function ownsGroup(si, g) {
    for (var i = 0; i < 24; i++) if (B.board[i].t === 'shop' && B.board[i].g === g && S.own[i] !== si) return false;
    return true;
  }
  function rentOf(i) {
    var q = B.board[i], o = S.own[i];
    return q.rent * (1 + (S.lvl[i] || 0)) * (o >= 0 && ownsGroup(o, q.g) ? 2 : 1);
  }
  function playing() { return !!S && !!B && S.phase === 'play'; }
  function myTurn(step) { return playing() && mySeat >= 0 && S.turn === mySeat && S.step === step; }
  function canRoll() { return myTurn('roll') && !rollSent; }
  function canUpgrade(i) {
    var q = B.board[i];
    return myTurn('roll') && q.t === 'shop' && S.own[i] === mySeat && S.lvl[i] < 2 && !S.upgraded && S.seats[mySeat].cash >= q.up;
  }
  function who(si) { return si === mySeat ? 'You' : (S.seats && S.seats[si] ? S.seats[si].name : 'Someone'); }
  function whom(si) { return si === mySeat ? 'you' : (S.seats && S.seats[si] ? S.seats[si].name : 'someone'); }
  function vb(si, they, you) { return si === mySeat ? you : they; }
  function cardSays(si, ci) { return (si === mySeat ? 'Your card: ' : who(si) + '’s card: ') + B.cards[ci].en; }
  function coin() { return '<i class="monopoly-coin"></i>'; }
  function dot(si) { return '<i class="monopoly-dot" style="background:' + B.tints[si % B.tints.length] + '"></i>'; }
  function sumPick() { var n = 0, i; for (i = 0; i < pick.length; i++) n += pick[i] * B.notes[i]; return n; }

  // ---------- styles ----------
  var CSS = [
    '.monopoly-root{background:#7BD389;display:flex;color:#1B2A49;overflow:hidden;touch-action:none}',
    '.monopoly-root .py{font-family:system-ui,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif}',
    '.monopoly-main{position:relative;flex:1 1 auto;min-width:0;height:100%;overflow:hidden}',
    '.monopoly-cv{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none}',
    '.monopoly-side{flex:none;width:30%;min-width:244px;max-width:380px;height:100%;background:#FFF3D6;border-left:4px solid #1B2A49;display:flex;flex-direction:column;gap:6px;padding:8px}',
    '.monopoly-head{flex:none;display:flex;flex-direction:row-reverse;flex-wrap:wrap;gap:6px;align-items:center}',
    '.monopoly-back{flex:none;height:48px;padding:0 14px;font-size:17px;border-width:3px;white-space:nowrap}',
    '.monopoly-round{flex:1 1 112px;min-width:0;height:40px;border-radius:999px;background:#1B2A49;color:#fff;display:flex;align-items:center;justify-content:center;gap:8px;font-size:17px;font-weight:700;white-space:nowrap;padding:0 10px}',
    '.monopoly-round b{color:#FFD66B}',
    '.monopoly-time{font-weight:700;white-space:nowrap}',
    '.monopoly-time.hot{color:#FF8A8A}',
    '.monopoly-card .monopoly-time.hot{color:#C92A2A}',
    '.monopoly-list{flex:0 1 auto;min-height:0;display:flex;flex-direction:column;gap:4px;overflow:hidden}',
    '.monopoly-log{flex:1 1 0;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;gap:1px;font-size:14px;font-weight:500;line-height:1.3;padding:0 4px;' +
      '-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 22px);mask-image:linear-gradient(to bottom,transparent 0,#000 22px)}',
    '.monopoly-log div{flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.6}',
    '.monopoly-log div:last-child{opacity:1;font-weight:600}',
    '.monopoly-row{flex:none;display:flex;align-items:center;gap:5px;height:44px;padding:0 8px 0 0;border:3px solid #1B2A49;border-radius:14px;background:#fff;font-size:16px;font-weight:600;overflow:hidden}',
    '.monopoly-row .tint{flex:none;width:11px;align-self:stretch}',
    '.monopoly-row canvas,.monopoly-chip canvas,.monopoly-rr canvas{flex:none;width:34px;height:38px;display:block}',
    '.monopoly-row .nm{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.monopoly-row .cash{flex:none;font-weight:700;white-space:nowrap}',
    '.monopoly-row .shops{flex:none;font-size:14px;white-space:nowrap}',
    '.monopoly-row.on{background:#FFE9A8;box-shadow:inset 0 0 0 2px #FFD66B}',
    '.monopoly-row.me .nm{text-decoration:underline}',
    'button.monopoly-row{width:100%;height:48px;font-family:inherit;color:inherit;text-align:left;background:#EAF9E4;cursor:pointer}',
    'button.monopoly-row:disabled{opacity:.6}',
    'button.monopoly-row:active{transform:scale(.97)}',
    '.monopoly-row .sit{flex:none;background:#FFD66B;border:2px solid #1B2A49;border-radius:999px;padding:1px 9px;font-size:14px;font-weight:700;white-space:nowrap}',
    '.monopoly-how{display:flex;flex-direction:column;gap:6px;font-size:16px;font-weight:600;line-height:1.25;background:#fff;border:3px solid #1B2A49;border-radius:16px;padding:8px 10px}',
    '.monopoly-act{flex:none;display:flex;flex-direction:column;gap:6px;justify-content:flex-end;min-height:56px}',
    '.monopoly-act .btn{width:100%}',
    '.monopoly-roll{height:62px;font-size:26px}',
    '.monopoly-roll.go{animation:ftPulse .6s ease-in-out infinite alternate}',
    '.monopoly-hint{font-size:15px;font-weight:600;text-align:center;line-height:1.25}',
    '.monopoly-status{position:absolute;z-index:3;transform:translateX(-50%);background:#1B2A49;color:#fff;border:3px solid #fff;border-radius:999px;padding:0 14px;display:flex;align-items:center;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}',
    '.monopoly-status span{overflow:hidden;text-overflow:ellipsis}',
    '.monopoly-stage{position:absolute;z-index:4;display:flex;align-items:center;justify-content:center;pointer-events:none}',
    '.monopoly-card{pointer-events:auto;background:#FFF3D6;border:4px solid #1B2A49;border-radius:1.1em;padding:.5em .7em;max-width:100%;max-height:100%;overflow:hidden;box-shadow:0 .3em 0 rgba(27,42,73,.25);display:flex;flex-direction:column;align-items:center;gap:.36em;text-align:center;font-weight:600;line-height:1.2;animation:ftPop .2s ease-out}',
    '.monopoly-hd{display:flex;align-items:center;gap:.5em;text-align:left;max-width:100%}',
    '.monopoly-pic{flex:none;width:2.5em;height:2.5em;border-radius:.7em;border:3px solid #1B2A49;display:flex;align-items:center;justify-content:center;font-size:1.25em;background:#fff;line-height:1}',
    '.monopoly-name{font-size:.86em;line-height:1.2;min-width:0}',
    '.monopoly-name b{font-size:1.22em}',
    '.monopoly-line{font-size:.95em}',
    '.monopoly-math{font-size:1.4em;font-weight:700;background:#fff;border:3px solid #1B2A49;border-radius:999px;padding:0 .7em;white-space:nowrap}',
    '.monopoly-btns{display:flex;gap:.5em;align-items:center;justify-content:center;width:100%}',
    '.monopoly-btns .btn{height:auto;min-height:48px;padding:.2em 1em;font-size:1.05em;border-width:3px;white-space:nowrap}',
    '.monopoly-big{font-size:2.6em;line-height:1.1}',
    '.monopoly-fx{font-size:1.25em;font-weight:700;border:3px solid #1B2A49;border-radius:999px;padding:0 .7em;background:#fff;white-space:nowrap}',
    '.monopoly-fx.gain{background:#DFF7D8}',
    '.monopoly-fx.loss{background:#FFE1E1}',
    '.monopoly-dot{display:inline-block;width:.8em;height:.8em;border-radius:50%;border:2px solid #1B2A49;vertical-align:-.05em;margin-right:.25em}',
    '.monopoly-coin{display:inline-block;width:.85em;height:.85em;border-radius:50%;background:#FFC933;border:2px solid #1B2A49;vertical-align:-.1em;box-shadow:inset .1em .1em 0 rgba(255,255,255,.65)}',
    '.monopoly-paying{display:flex;align-items:center;gap:.4em;width:100%;min-height:48px}',
    '.monopoly-paying .txt{flex:1;min-width:0;text-align:left;font-size:.95em;line-height:1.25}',
    '.monopoly-undo{flex:none;width:54px;height:48px;border-radius:14px;border:3px solid #1B2A49;background:#fff;font-size:22px;font-weight:700;padding:0}',
    '.monopoly-undo:disabled{opacity:.35}',
    '.monopoly-notes{display:flex;gap:.34em;justify-content:center}',
    '.monopoly-note{position:relative;flex:none;width:3.5em;height:3em;min-width:52px;min-height:48px;border:3px solid #1B2A49;border-radius:.5em;font-size:1em;font-weight:700;padding:0;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 3px rgba(255,255,255,.75)}',
    '.monopoly-note b{font-size:1.35em}',
    '.monopoly-note em{position:absolute;right:-7px;top:-9px;min-width:22px;height:22px;border-radius:11px;background:#1B2A49;color:#fff;font-size:13px;font-style:normal;line-height:22px;padding:0 4px}',
    '.monopoly-note:disabled{opacity:.3}',
    '.monopoly-note:active{transform:scale(.94)}',
    '.monopoly-mini{display:inline-block;min-width:1.9em;padding:0 .3em;border:2px solid #1B2A49;border-radius:.35em;font-size:.85em;font-weight:700;margin:0 .08em;text-align:center}',
    '.monopoly-sum{position:absolute;z-index:6;display:flex;justify-content:center;pointer-events:none}',
    '.monopoly-sum span{background:#fff;border:4px solid #1B2A49;border-radius:999px;padding:.08em .8em;font-weight:700;white-space:nowrap;box-shadow:0 .2em 0 rgba(27,42,73,.25);animation:ftPop .25s ease-out}',
    '.monopoly-sum.gain span{background:#DFF7D8}',
    '.monopoly-sum.loss span{background:#FFE1E1}',
    '.monopoly-modal{position:absolute;left:0;top:0;right:0;bottom:0;z-index:8;background:rgba(27,42,73,.4);display:flex;align-items:center;justify-content:center;padding:10px}',
    '.monopoly-panel{background:#FFF3D6;border:5px solid #1B2A49;border-radius:26px;padding:12px 16px;width:100%;max-width:560px;max-height:100%;overflow-y:auto;touch-action:pan-y;display:flex;flex-direction:column;gap:8px;align-items:center;text-align:center;box-shadow:0 8px 0 rgba(27,42,73,.25)}',
    '.monopoly-panel h2{font-size:32px;line-height:1.05;margin:0}',
    '.monopoly-tri{font-size:17px;font-weight:600}',
    '.monopoly-seats{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}',
    '.monopoly-chip{display:flex;align-items:center;gap:4px;height:48px;padding:0 12px 0 4px;border:3px solid #1B2A49;border-radius:999px;background:#fff;font-size:16px;font-weight:600;white-space:nowrap}',
    '.monopoly-robots{display:flex;align-items:center;gap:12px;font-size:20px;font-weight:700}',
    '.monopoly-robots b{min-width:22px;font-size:26px}',
    '.monopoly-robots .round{font-size:30px;font-weight:700;line-height:1}',
    '.monopoly-robots .round:disabled{opacity:.35}',
    '.monopoly-facts{font-size:16px;font-weight:600;line-height:1.3}',
    '.monopoly-panel .btn.big{margin-top:0;height:62px;font-size:28px}',
    '.monopoly-res{width:100%;display:flex;flex-direction:column;gap:4px}',
    '.monopoly-rr{display:flex;align-items:center;gap:6px;height:44px;border:3px solid #1B2A49;border-radius:14px;background:#fff;padding:0 10px 0 6px;font-size:17px;font-weight:600;text-align:left;overflow:hidden}',
    '.monopoly-rr.me{background:#FFE9A8}',
    '.monopoly-rr .pl{flex:none;width:30px;text-align:center;font-size:22px}',
    '.monopoly-rr .nm{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.monopoly-rr .sum{flex:none;white-space:nowrap}',
    '.monopoly-rr .st{flex:none;min-width:54px;text-align:right;font-weight:700;white-space:nowrap}',
    '@media (max-height:540px){.monopoly-row{height:40px;font-size:15px}.monopoly-row canvas{width:30px;height:34px}.monopoly-rr{height:38px;font-size:15px}.monopoly-rr canvas{width:30px;height:34px}' +
      '.monopoly-panel{padding:8px 12px;gap:5px;border-radius:22px}.monopoly-panel h2{font-size:26px}.monopoly-tri,.monopoly-facts{font-size:15px}.monopoly-panel .btn.big{height:54px;font-size:24px}' +
      '.monopoly-how{font-size:14px;gap:4px;padding:6px 8px}.monopoly-roll{height:56px;font-size:24px}.monopoly-side{gap:5px;padding:6px}.monopoly-round{height:36px;font-size:16px}}'
  ].join('\n');

  // ---------- the look of things on the board (all in board units) ----------
  function coinAt(g, x, y, r) {
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = '#FFC933'; g.fill(); g.lineWidth = Math.max(1.4, r * 0.28); g.strokeStyle = NAVY; g.stroke();
    g.beginPath(); g.arc(x - r * 0.25, y - r * 0.25, r * 0.34, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fill();
  }
  function spark(g, x, y, r, col) {
    var q = r * 0.3;
    poly(g, [x, y - r, x + q, y - q, x + r, y, x + q, y + q, x, y + r, x - q, y + q, x - r, y, x - q, y - q]);
    g.fillStyle = col; g.fill(); g.lineWidth = 1.4; g.strokeStyle = NAVY; g.stroke();
  }
  function clover(g, x, y, r) {
    var i, a;
    g.strokeStyle = '#2F8548'; g.lineWidth = 2.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y + r * 0.6); g.quadraticCurveTo(x + r * 0.4, y + r * 1.6, x + r * 1.1, y + r * 1.9); g.stroke();
    for (i = 0; i < 4; i++) {
      a = Math.PI / 4 + i * Math.PI / 2;
      g.beginPath(); g.arc(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78, r * 0.8, 0, TAU);
      g.fillStyle = '#4CC06A'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = NAVY; g.stroke();
    }
    g.beginPath(); g.arc(x, y, r * 0.42, 0, TAU); g.fillStyle = '#7BE08F'; g.fill();
  }
  function flower(g, x, y, col) {
    var i, a;
    for (i = 0; i < 5; i++) { a = -Math.PI / 2 + i * TAU / 5; g.beginPath(); g.arc(x + Math.cos(a) * 4.2, y + Math.sin(a) * 4.2, 3.6, 0, TAU); g.fillStyle = col; g.fill(); g.lineWidth = 1.3; g.strokeStyle = NAVY; g.stroke(); }
    g.beginPath(); g.arc(x, y, 2.8, 0, TAU); g.fillStyle = col === '#FFD66B' ? '#FF7A45' : '#FFD66B'; g.fill(); g.stroke();
  }
  function bush(g, x, y) {
    var L = [[x - 11, y - 8, 10], [x + 10, y - 7, 10], [x, y - 15, 11]], i;
    ell(g, x + 6, y + 2, 24, 5); g.fillStyle = SH; g.fill();
    blobs(g, L, '#2F8548', 2.5);
    g.fillStyle = '#48A85F'; for (i = 0; i < L.length; i++) { g.beginPath(); g.arc(L[i][0] - 2, L[i][1] - 3, L[i][2] - 4, 0, TAU); g.fill(); }
    flower(g, x - 9, y - 12, '#FF8FB8'); flower(g, x + 8, y - 8, '#FFFFFF');
  }
  // a small label: number on a pill, with a coin (price, money) or a little house (rent) in front
  function pill(g, x, y, text, bg, fg, mark) {
    g.font = '700 15px ' + FONT;
    var w = g.measureText(text).width + (mark ? 26 : 13), h = 20;
    rr(g, x, y, w, h, 10); g.fillStyle = bg; g.fill(); g.lineWidth = 2.2; g.strokeStyle = NAVY; g.stroke();
    if (mark === 'coin') coinAt(g, x + 10.5, y + 10, 6.2);
    else if (mark === 'house') {
      g.fillStyle = fg;
      poly(g, [x + 5, y + 10.5, x + 11, y + 4.5, x + 17, y + 10.5, x + 15, y + 10.5, x + 15, y + 15.5, x + 7, y + 15.5, x + 7, y + 10.5]); g.fill();
    }
    g.fillStyle = fg; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, x + (mark ? 20 : 6.5), y + h / 2 + 0.5);
  }

  // the sign in front of a shop, with its picture
  function sign(g, q) {
    var col = B.groups[q.g];
    ell(g, 81, 45, 12, 3.4); g.fillStyle = SH; g.fill();
    rr(g, 75.5, 30, 4, 14, 1.5); g.fillStyle = '#8F5A2E'; g.fill(); ol(g, 1.8);
    rr(g, 63, 7, 34, 28, 8); g.fillStyle = shade(col, -0.4); g.fill(); ol(g, 2.5);
    rr(g, 60, 4, 34, 28, 8); g.fillStyle = '#fff'; g.fill(); ol(g, 2.5);
    g.font = '20px ' + FONT; g.fillStyle = NAVY; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(q.icon, 77, 19);
  }
  var PROPS = {
    start: function (g) {
      poly(g, [10, 30, 40, 30, 40, 20, 62, 37, 40, 54, 40, 44, 10, 44]); g.fillStyle = '#FF7A45'; g.fill(); ol(g, 3);   // arrow painted on the ground
      poly(g, [13, 32.5, 40, 32.5, 40, 36, 13, 36]); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fill();
      ell(g, 88, 48, 9, 3); g.fillStyle = SH; g.fill();
      rr(g, 83, 6, 4, 42, 2); g.fillStyle = '#8D949E'; g.fill(); ol(g, 2);                                             // flag pole
      poly(g, [84, 8, 84, 27, 64, 17.5]); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 2.5);
      api.starPath(g, 77.5, 17.5, 4.2); g.fillStyle = '#fff'; g.fill();
      g.beginPath(); g.arc(85, 6, 3.2, 0, TAU); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2);
      g.font = '700 13px ' + FONT; g.fillStyle = NAVY; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('START', 9, 13);
      pill(g, 5, 61, '+' + B.cfg.salary, '#fff', '#2E7A3C', 'coin');
    },
    lucky: function (g) {
      [[18, 16, 5], [86, 13, 4.2], [88, 44, 5], [15, 44, 4.2]].forEach(function (q) { spark(g, q[0], q[1], q[2], '#FFD66B'); });
      ell(g, 56, 53, 22, 4.5); g.fillStyle = SH; g.fill();
      g.save(); g.translate(50, 30); g.rotate(-0.13);
      rr(g, -14, -19, 34, 44, 7); g.fillStyle = '#5B3FB8'; g.fill(); ol(g, 3);                                        // the card's thickness
      rr(g, -17, -22, 34, 44, 7); g.fillStyle = lin(g, 0, -22, 0, 22, '#B49BFF', '#7C5CE6'); g.fill(); ol(g, 3);
      rr(g, -13, -18, 26, 36, 4); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.8; g.stroke();
      clover(g, -1, -2, 6.2);
      g.restore();
    },
    bus: function (g) {
      var i;
      ell(g, 48, 55, 40, 5.5); g.fillStyle = SH; g.fill();
      poly(g, [70, 20, 78, 14, 78, 41, 70, 48]); g.fillStyle = '#D99A0B'; g.fill(); ol(g, 2.5);                       // the back end
      poly(g, [10, 20, 70, 20, 78, 14, 18, 14]); g.fillStyle = '#FFE9A8'; g.fill(); ol(g, 2.5);                       // the roof
      rr(g, 8, 20, 62, 28, 6); g.fillStyle = lin(g, 0, 20, 0, 48, '#FFD24A', '#FFB81C'); g.fill(); ol(g, 3);
      for (i = 0; i < 4; i++) { rr(g, 13 + i * 14, 24, 11, 10, 2.5); g.fillStyle = '#BFE9FF'; g.fill(); ol(g, 1.8); }
      g.fillStyle = '#FF4F6D'; g.fillRect(10, 37.5, 58, 3.5);
      [22, 56].forEach(function (x) {
        g.beginPath(); g.arc(x, 49, 6.5, 0, TAU); g.fillStyle = NAVY; g.fill();
        g.beginPath(); g.arc(x, 49, 2.6, 0, TAU); g.fillStyle = '#C3C9D2'; g.fill();
      });
      rr(g, 88, 14, 3.6, 38, 1.5); g.fillStyle = '#8D949E'; g.fill(); ol(g, 1.8);                                     // the stop sign
      g.beginPath(); g.arc(90, 12, 8.5, 0, TAU); g.fillStyle = '#3B82F6'; g.fill(); ol(g, 2.5);
      rr(g, 85.2, 8.8, 9.6, 6.4, 1.6); g.fillStyle = '#fff'; g.fill();
    },
    tax: function (g) {
      var i;
      ell(g, 52, 55, 42, 5.5); g.fillStyle = SH; g.fill();
      poly(g, [70, 24, 78, 19, 78, 45, 70, 50]); g.fillStyle = '#C9BBA0'; g.fill(); ol(g, 2.5);
      rr(g, 14, 24, 56, 26, 2); g.fillStyle = '#FBF4E6'; g.fill(); ol(g, 3);
      rr(g, 38.5, 35, 7, 15, 2); g.fillStyle = '#8F5A2E'; g.fill(); ol(g, 1.6);
      for (i = 0; i < 4; i++) { rr(g, 18 + i * 13.6, 27, 6, 21, 2); g.fillStyle = '#fff'; g.fill(); ol(g, 1.8); }
      poly(g, [74, 24, 82, 19, 50, 2, 42, 5]); g.fillStyle = '#B9A58A'; g.fill(); ol(g, 2.5);
      poly(g, [10, 24, 42, 5, 74, 24]); g.fillStyle = '#E9D8B8'; g.fill(); ol(g, 3);
      g.beginPath(); g.arc(42, 16.5, 4, 0, TAU); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 1.8);
      rr(g, 10, 48, 64, 6, 2); g.fillStyle = '#D8CFC0'; g.fill(); ol(g, 2.5);
      pill(g, 5, 61, '−' + B.cfg.tax, '#fff', '#C92A2A', 'coin');
    },
    nap: function (g) {
      ell(g, 50, 56, 42, 5.5); g.fillStyle = SH; g.fill();
      rr(g, 8, 14, 10, 39, 4); g.fillStyle = '#8F5A2E'; g.fill(); ol(g, 2.5);
      rr(g, 14, 31, 66, 20, 5); g.fillStyle = '#B77B45'; g.fill(); ol(g, 3);
      rr(g, 16, 25, 62, 16, 6); g.fillStyle = '#fff'; g.fill(); ol(g, 2.5);
      rr(g, 19, 21, 18, 12, 5); g.fillStyle = '#FFF8E7'; g.fill(); ol(g, 2.2);
      rr(g, 38, 22, 42, 22, 6); g.fillStyle = lin(g, 0, 22, 0, 44, '#7DB9FF', '#4A8FE8'); g.fill(); ol(g, 3);
      rr(g, 41, 24.5, 36, 4.5, 2.2); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fill();
      rr(g, 18, 49, 5, 6, 1.5); g.fillStyle = '#8F5A2E'; g.fill(); ol(g, 1.8);
      rr(g, 71, 49, 5, 6, 1.5); g.fill(); ol(g, 1.8);
      g.fillStyle = NAVY; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '700 17px ' + FONT; g.fillText('Z', 62, 13); g.font = '700 13px ' + FONT; g.fillText('z', 75, 8.5); g.font = '700 10px ' + FONT; g.fillText('z', 85, 5.5);
    },
    park: function (g) {
      var L = [[15, 24, 12], [35, 25, 12], [25, 12, 14], [25, 27, 10]], i;
      ell(g, 30, 52, 20, 4.5); g.fillStyle = SH; g.fill();
      rr(g, 21, 30, 8, 21, 3); g.fillStyle = lin(g, 21, 0, 29, 0, '#A8733F', '#774B27'); g.fill(); ol(g, 2.5);
      blobs(g, L, '#2F8548', 2.5);
      g.fillStyle = '#45A65D'; for (i = 0; i < 3; i++) { g.beginPath(); g.arc(L[i][0] - 2, L[i][1] - 3, L[i][2] - 4, 0, TAU); g.fill(); }
      g.fillStyle = '#6CC67F'; g.beginPath(); g.arc(21, 7, 5, 0, TAU); g.fill();
      // the piggy bank
      ell(g, 74, 53, 20, 4.2); g.fillStyle = SH; g.fill();
      rr(g, 60, 43, 5.5, 9, 2); g.fillStyle = '#F27BA6'; g.fill(); ol(g, 1.8);
      rr(g, 77, 43, 5.5, 9, 2); g.fill(); ol(g, 1.8);
      g.strokeStyle = NAVY; g.lineWidth = 2; g.beginPath(); g.arc(50.5, 33, 3, 0.4, 4.6); g.stroke();
      ell(g, 70, 35, 18, 13); g.fillStyle = lin(g, 0, 22, 0, 48, '#FFB9D2', '#FF8FB8'); g.fill(); ol(g, 3);
      poly(g, [60, 25, 63, 16, 69, 23]); g.fillStyle = '#F27BA6'; g.fill(); ol(g, 2.2);
      ell(g, 87, 36, 6, 5); g.fillStyle = '#FFA6C6'; g.fill(); ol(g, 2.2);
      g.fillStyle = NAVY; g.beginPath(); g.arc(85.4, 36, 1.1, 0, TAU); g.arc(88.8, 36, 1.1, 0, TAU); g.fill();
      g.beginPath(); g.arc(78.5, 30.5, 1.9, 0, TAU); g.fill();
      g.lineWidth = 2.4; g.beginPath(); g.moveTo(66, 24); g.lineTo(74, 24); g.stroke();
      coinAt(g, 70, 16, 5.6);
    }
  };
  function tile(g, q) {
    var col = q.t === 'shop' ? B.groups[q.g] : SPECIAL[q.t];
    rr(g, 2, 2, TW - 4, TH - 4, 11); g.fillStyle = lin(g, 0, 0, 0, TH, shade(col, 0.22), col); g.fill();
    g.save(); rr(g, 2, 2, TW - 4, TH - 4, 11); g.clip();
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(0, 58, TW, TH - 58);              // the footpath the tokens walk on
    g.fillStyle = 'rgba(27,42,73,0.12)'; g.fillRect(0, 56, TW, 2.4);
    g.restore();
    rr(g, 2, 2, TW - 4, TH - 4, 11); ol(g, 3);
    if (q.t === 'shop') sign(g, q); else PROPS[q.t](g, q);
  }
  function lawn(g) {
    var x = TW + 8, y = TH + 8, w = 5 * TW - 16, h = 5 * TH - 16, i, n, s, cy = DIE.y - 6;
    rr(g, x, y, w, h, 24); g.fillStyle = lin(g, 0, y, 0, y + h, '#9BE3A0', '#7CCB86'); g.fill();
    g.save(); rr(g, x, y, w, h, 24); g.clip();
    for (i = 0; i < 18; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.11)' : 'rgba(26,110,62,0.08)';
      ell(g, x + rnd(i + 3) * w, y + rnd(i + 70) * h, 24 + rnd(i + 11) * 40, 10 + rnd(i + 21) * 16); g.fill();
    }
    g.strokeStyle = 'rgba(27,42,73,0.13)'; g.lineWidth = 14; rr(g, x, y, w + 40, h + 40, 24); g.stroke();   // the rim shades the top and the left
    g.restore();
    rr(g, x, y, w, h, 24); ol(g, 3);
    // a paved round place for the die
    ell(g, 350, cy + 7, 126, 60); g.fillStyle = '#B99F5F'; g.fill();
    ell(g, 350, cy, 126, 60); g.fillStyle = '#F3E3B5'; g.fill(); ol(g, 3);
    ell(g, 350, cy, 102, 47); g.strokeStyle = 'rgba(160,128,66,0.45)'; g.lineWidth = 3; g.stroke();
    // the pile of lucky cards
    ell(g, 182, cy + 22, 34, 8); g.fillStyle = SH; g.fill();
    rr(g, 152, cy - 6, 48, 32, 6); g.fillStyle = '#5B3FB8'; g.fill(); ol(g, 3);
    rr(g, 152, cy - 15, 48, 32, 6); g.fillStyle = lin(g, 0, cy - 15, 0, cy + 17, '#B49BFF', '#7C5CE6'); g.fill(); ol(g, 3);
    rr(g, 156.5, cy - 10.5, 39, 23, 3.5); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.8; g.stroke();
    clover(g, 175, cy - 1, 5.2);
    // the bank: stacks of coins
    ell(g, 524, cy + 22, 36, 8); g.fillStyle = SH; g.fill();
    [[504, 5], [526, 8], [546, 3]].forEach(function (q) {
      for (n = 0; n < q[1]; n++) {
        ell(g, q[0], cy + 18 - n * 4.6, 11.5, 4.6); g.fillStyle = n === q[1] - 1 ? '#FFD95A' : '#F2B01E'; g.fill(); g.lineWidth = 2; g.strokeStyle = NAVY; g.stroke();
      }
    });
    // flowers and bushes
    [[136, 468, 0], [160, 476, 1], [564, 470, 2], [540, 478, 0], [130, 250, 1], [572, 236, 2], [250, 452, 2], [452, 458, 1], [300, 196, 0], [404, 190, 1]].forEach(function (q) {
      flower(g, q[0], q[1], ['#FF8FB8', '#FFD66B', '#FFFFFF'][q[2]]);
    });
    bush(g, 138, 418); bush(g, 566, 414);
    s = '大富翁';
    g.font = '700 22px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(27,42,73,0.16)'; g.fillText('TOWN MONOPOLY  ' + s, 350, y + h - 22);
  }
  // A shop building. (0,0) is the left end of the foot of its front wall. Grey = nobody's, coloured = the owner's colour.
  function drawShop(g, lvl, tint) {
    var w = 38, h = 22 + lvl * 11, dx = 9, dy = 6, rh = 12, f, i;
    var wall = tint ? shade(tint, 0.68) : '#E7E3D8', roof = tint || '#A6A298', glass = tint ? '#BFE9FF' : '#CFCBC1';
    poly(g, [w - 1, 3, w + 17, 3, w + dx + 17, -dy, w + dx, -dy - 6]); g.fillStyle = SH; g.fill();
    poly(g, [w, 0, w + dx, -dy, w + dx, -h - dy, w, -h]); g.fillStyle = shade(wall, -0.2); g.fill(); ol(g, 2.5);        // side wall
    rr(g, 0, -h, w, h, 2.5); g.fillStyle = lin(g, 0, -h, 0, 0, shade(wall, 0.3), wall); g.fill(); ol(g, 2.5);         // front wall
    for (f = 1; f <= lvl; f++) for (i = 0; i < 3; i++) {                                                             // one row of windows per extra floor
      rr(g, 4.5 + i * 10.6, -22 - f * 11 + 2.6, 7.6, 6.4, 1.5); g.fillStyle = glass; g.fill(); ol(g, 1.5);
    }
    rr(g, 5, -14, 9, 14, 2); g.fillStyle = tint ? '#8F5A2E' : '#8C877C'; g.fill(); ol(g, 1.7);                        // door
    rr(g, 18, -14, 15, 9.5, 2); g.fillStyle = glass; g.fill(); ol(g, 1.7);                                           // shop window
    for (i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#fff' : roof; g.fillRect(-1 + i * 8, -20.6, 8, 5.2); }          // striped awning
    g.beginPath(); g.rect(-1, -20.6, 40, 5.2); ol(g, 1.7);
    poly(g, [w + 3, -h, w + 3 + dx, -h - dy, w - 2 + dx * 0.6, -h - rh]); g.fillStyle = shade(roof, -0.3); g.fill(); ol(g, 2.5);
    poly(g, [-3, -h, w + 3, -h, w - 2 + dx * 0.6, -h - rh, 3 + dx * 0.6, -h - rh]);
    g.fillStyle = lin(g, 0, -h - rh, 0, -h, shade(roof, 0.25), roof); g.fill(); ol(g, 2.5);
    if (lvl >= 1) {                                                                                                  // a flag on the roof
      g.fillStyle = NAVY; g.fillRect(w - 5, -h - rh - 10, 1.8, 11);
      poly(g, [w - 3.2, -h - rh - 10, w + 6.5, -h - rh - 6.8, w - 3.2, -h - rh - 3.6]); g.fillStyle = '#fff'; g.fill(); ol(g, 1.5);
    }
    if (lvl >= 2) { api.starPath(g, 13, -h - rh - 4.5, 7); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 1.8); }           // and a gold star
  }
  function shopSprite(lvl, tint) {
    var key = (tint || 'x') + lvl, s = sprites[key], res, g;
    if (!s) {
      res = k * dpr;
      s = document.createElement('canvas'); s.width = Math.ceil(78 * res); s.height = Math.ceil(84 * res);
      g = s.getContext('2d'); g.scale(res, res); g.translate(6, 78); g.lineJoin = 'round'; g.lineCap = 'round';
      drawShop(g, lvl, tint);
      sprites[key] = s;
    }
    return s;
  }
  // A robot player, feet at (x, y).
  function drawRobot(g, x, y, tint, tt, f, moving, s) {
    var hop = moving ? Math.abs(Math.sin(tt * 10)) * 4 : Math.sin(tt * 2) * 1, blink = (tt % 3.4) > 3.25;
    g.save(); g.translate(x, y - hop * s); g.scale(s * (f < 0 ? -1 : 1), s); g.lineJoin = 'round';
    g.fillStyle = NAVY; rr(g, -13, -9, 9, 9, 3); g.fill(); rr(g, 4, -9, 9, 9, 3); g.fill();
    rr(g, -13, -34, 34, 26, 7); g.fillStyle = shade(tint, -0.32); g.fill(); ol(g, 3);
    rr(g, -18, -32, 34, 26, 7); g.fillStyle = lin(g, 0, -32, 0, -6, shade(tint, 0.12), tint); g.fill(); ol(g, 3);
    g.beginPath(); g.arc(-1, -19, 5, 0, TAU); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2);
    g.fillStyle = shade(tint, -0.15);
    g.beginPath(); g.arc(-21, -22, 5, 0, TAU); g.fill(); ol(g, 2.5);
    g.beginPath(); g.arc(19, -22, 5, 0, TAU); g.fill(); ol(g, 2.5);
    rr(g, -15, -64, 40, 31, 9); g.fillStyle = shade(tint, -0.14); g.fill(); ol(g, 3);
    rr(g, -21, -62, 40, 31, 9); g.fillStyle = lin(g, 0, -62, 0, -31, shade(tint, 0.5), shade(tint, 0.28)); g.fill(); ol(g, 3);
    rr(g, -16, -55, 30, 16, 6); g.fillStyle = NAVY; g.fill();
    g.fillStyle = '#7CF3FF';
    if (blink) { g.fillRect(-12, -47.5, 8, 2); g.fillRect(2, -47.5, 8, 2); }
    else { g.beginPath(); g.arc(-8, -47, 3.7, 0, TAU); g.arc(6, -47, 3.7, 0, TAU); g.fill(); }
    g.strokeStyle = NAVY; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(-1, -62); g.lineTo(-1, -71); g.stroke();
    g.beginPath(); g.arc(-1, -74, 4.6, 0, TAU); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 2.5);
    g.restore();
  }
  // every token is about 50 units tall, whatever the player looks like
  function avatarScale(look) {
    var h0 = look && look.outfit && window.DressDesigner ? 104 * (look.big ? 1.22 : 1) : (look && look.big ? 84 : 56) + (look && look.hat ? 34 : 12);
    return Math.max(0.42, Math.min(0.76, 50 / h0));
  }
  function drawMini(cvEl, look, robot, tint) {
    var g = cvEl.getContext('2d');
    cvEl.width = 68; cvEl.height = 76;
    g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, 34, 38);
    try {
      if (robot) drawRobot(g, 17, 36, tint, 0, 1, false, 0.44);
      else api.drawAvatar(g, look || { color: tint }, 17, 36, 0, { scale: avatarScale(look) * 0.66 });
    } catch (e) {}
  }
  function paintAvatars(box) {
    var list = box.querySelectorAll('canvas[data-av]'), i, id, n;
    for (i = 0; i < list.length; i++) {
      id = list[i].getAttribute('data-av'); n = parseInt(id.slice(1), 10);
      if (id.charAt(0) === 's' && S.seats && S.seats[n]) drawMini(list[i], S.seats[n].look, S.seats[n].robot, B.tints[n % B.tints.length]);
      else if (id.charAt(0) === 'h' && S.humans && S.humans[n]) drawMini(list[i], S.humans[n].look, false, B.tints[n % B.tints.length]);
      else drawMini(list[i], null, true, B.tints[n % B.tints.length]);
    }
  }

  // ---------- the static picture: grass, the board slab, the 24 spaces, the lawn ----------
  function buildBase() {
    var g, i, o;
    base = document.createElement('canvas'); base.width = cv.width; base.height = cv.height;
    g = base.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#7BD389'; g.fillRect(0, 0, W, H);
    for (i = 0; i < 36; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.09)' : 'rgba(26,110,62,0.09)';
      ell(g, rnd(i) * W, rnd(i + 50) * H, 18 + rnd(i + 9) * 34, 8 + rnd(i + 5) * 14); g.fill();
    }
    g.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
    g.lineJoin = 'round'; g.lineCap = 'round';
    rr(g, 3, 6, BW + 15, BH + 30, 30); g.fillStyle = 'rgba(22,48,66,0.24)'; g.fill();           // shadow of the board
    rr(g, -7, 9, BW + 14, BH + 14, 28); g.fillStyle = '#B88A52'; g.fill(); ol(g, 4);            // its thick edge
    rr(g, -7, -7, BW + 14, BH + 14, 28); g.fillStyle = '#FFF3D6'; g.fill(); ol(g, 4);           // its top
    lawn(g);
    for (i = 0; i < 24; i++) { o = tileOrigin(i); g.save(); g.translate(o.x, o.y); tile(g, B.board[i]); g.restore(); }
  }

  // ---------- tokens ----------
  function slotOf(si) {
    var pos = S.seats[si].pos, n = 0, j, o = tileOrigin(pos), sl;
    for (j = 0; j < si; j++) if (S.seats[j].pos === pos) n++;
    sl = SLOTS[n % SLOTS.length];
    return { x: o.x + sl[0], y: o.y + sl[1] };
  }
  function midOf(i) { var o = tileOrigin(i); return { x: o.x + 70, y: o.y + 77 }; }
  function startPoint(si, from) { return disp[si] ? { x: disp[si].x, y: disp[si].y } : midOf(from); }
  function hop(si, from, to, dir, delay, per) {
    var pts = [startPoint(si, from)], i = from, guard = 0;
    while (i !== to && guard++ < 30) { i = (i + dir + 24) % 24; pts.push(i === to ? slotOf(si) : midOf(i)); }
    anim[si] = { pts: pts, t0: performance.now() + delay, per: Math.max(20, per), lift: 24, last: -1 };
  }
  function fly(si, from, total) {
    anim[si] = { pts: [startPoint(si, from), slotOf(si)], t0: performance.now() + total * 0.15, per: Math.max(40, total * 0.6), lift: 120, last: -1 };
  }
  function tokenPoint(si, now) {
    var a = anim[si], d = disp[si], tg, u, seg, f, p0, p1;
    if (a) {
      u = (now - a.t0) / a.per;
      if (u <= 0) { p0 = a.pts[0]; return (disp[si] = { x: p0.x, y: p0.y, lift: 0, moving: false }); }
      seg = Math.floor(u);
      if (seg < a.pts.length - 1) {
        f = u - seg; p0 = a.pts[seg]; p1 = a.pts[seg + 1];
        if (seg !== a.last) { a.last = seg; if (si === mySeat && a.lift < 60) api.sfx('tap'); }
        if (Math.abs(p1.x - p0.x) > 1) facing[si] = p1.x > p0.x ? 1 : -1;
        return (disp[si] = { x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f, lift: Math.sin(f * Math.PI) * a.lift, moving: true });
      }
      anim[si] = null;
    }
    tg = slotOf(si);
    if (!d) d = disp[si] = { x: tg.x, y: tg.y, lift: 0, moving: false };
    d.x += (tg.x - d.x) * 0.25; d.y += (tg.y - d.y) * 0.25; d.lift = 0; d.moving = false;
    return d;
  }
  function sparkle(i) { var o = tileOrigin(i); floats.push({ kind: 'spark', x: o.x + 32, y: o.y + 28, t0: performance.now(), dur: 800 }); }
  function coinsFly(a, b) {
    var p = disp[a], q = disp[b];
    if (p && q) floats.push({ kind: 'coin', x0: p.x, y0: p.y - 30, x1: q.x, y1: q.y - 30, t0: performance.now(), dur: 1100 });
  }

  // ---------- the die: a chunky cube with a top and a side ----------
  var PIPS = [[], [[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]];
  function pips(g, v, col) {            // on a 1 x 1 face
    var p = PIPS[v] || PIPS[1], i;
    g.fillStyle = v === 1 ? '#FF4F6D' : col;
    for (i = 0; i < p.length; i++) { g.beginPath(); g.arc(0.5 + p[i][0] * 0.27, 0.5 + p[i][1] * 0.27, v === 1 ? 0.15 : 0.1, 0, TAU); g.fill(); }
  }
  function drawDie(now) {
    var s = DIE.s, dx = 17, dy = 13, v = die.v || 1, lift = 0, rot = 0, sc = 1, u, since, go = canRoll();
    if (now < die.t1) {
      u = (now - die.t0) / Math.max(1, die.t1 - die.t0);
      v = 1 + (Math.floor(now / 75) * 5 + 2) % 6;
      lift = Math.abs(Math.sin(u * Math.PI * 3)) * 50 * (1 - u * 0.75);
      rot = Math.sin(u * 21) * 0.3 * (1 - u);
    } else {
      since = now - die.t1;
      if (since < 280) sc = 1 + Math.sin(since / 280 * Math.PI) * 0.14;
      else if (go) { sc = 1 + Math.sin(now / 170) * 0.045; lift = Math.abs(Math.sin(now / 340)) * 7; }
    }
    c.fillStyle = 'rgba(22,48,66,0.22)'; ell(c, DIE.x + 12, DIE.y + 5, s * 0.66 * (1 - lift / 190), s * 0.2 * (1 - lift / 190)); c.fill();
    if (go) {                               // "tap me"
      c.strokeStyle = 'rgba(255,214,107,' + (0.55 + Math.sin(now / 170) * 0.35) + ')'; c.lineWidth = 6;
      ell(c, DIE.x + 6, DIE.y - 4, 104 + Math.sin(now / 170) * 4, 50 + Math.sin(now / 170) * 2); c.stroke();
    }
    c.save(); c.translate(DIE.x, DIE.y - lift); c.rotate(rot); c.scale(sc, sc);
    c.lineJoin = 'round';
    poly(c, [-s / 2, -s, s / 2, -s, s / 2 + dx, -s - dy, -s / 2 + dx, -s - dy]); c.fillStyle = '#FFFFFF'; c.fill(); ol(c, 4);          // top
    poly(c, [s / 2, -s, s / 2 + dx, -s - dy, s / 2 + dx, -dy, s / 2, 0]); c.fillStyle = '#C9D3E6'; c.fill(); ol(c, 4);                // side
    rr(c, -s / 2, -s, s, s, 13); c.fillStyle = lin(c, 0, -s, 0, 0, '#FFFFFF', '#E8EEF8'); c.fill(); ol(c, 4);                        // front
    c.save(); c.transform(s, 0, dx, -dy, -s / 2, -s); pips(c, v % 6 + 1, 'rgba(27,42,73,0.55)'); c.restore();
    c.save(); c.transform(dx, -dy, 0, s, s / 2, -s); pips(c, (v + 2) % 6 + 1, 'rgba(27,42,73,0.6)'); c.restore();
    c.save(); c.transform(s, 0, 0, s, -s / 2, -s); pips(c, v, NAVY); c.restore();
    c.fillStyle = 'rgba(255,255,255,0.75)'; rr(c, -s / 2 + 7, -s + 6, s * 0.42, 5, 2.5); c.fill();
    c.restore();
    if (go) api.label(c, 'Tap!', DIE.x + 4, DIE.y - s - 26 - Math.abs(Math.sin(now / 340)) * 7, '#FFD66B', NAVY, 17);
  }

  // ---------- one frame ----------
  function nameTag(g, text, x, y, mine) {
    g.font = '600 14px ' + FONT;
    var w = Math.min(86, g.measureText(text).width) + 14, h = 18;
    rr(g, x - w / 2, y - h, w, h, 9); g.fillStyle = mine ? '#FFD66B' : '#fff'; g.fill(); g.lineWidth = 2; g.strokeStyle = NAVY; g.stroke();
    g.fillStyle = NAVY; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y - h / 2 + 0.5, 86);
  }
  function drawFloats(now) {
    var i, j, f, u, a, r, v;
    for (i = floats.length - 1; i >= 0; i--) {
      f = floats[i]; u = (now - f.t0) / f.dur;
      if (u >= 1) { floats.splice(i, 1); continue; }
      if (u < 0) continue;
      if (f.kind === 'txt') {
        c.globalAlpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
        c.font = '700 24px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
        c.lineWidth = 6; c.strokeStyle = '#fff'; c.strokeText(f.text, f.x, f.y - u * 34);
        c.fillStyle = f.col; c.fillText(f.text, f.x, f.y - u * 34);
      } else if (f.kind === 'spark') {
        c.globalAlpha = 1 - u * u;
        for (j = 0; j < 8; j++) { a = j * TAU / 8 + 0.3; r = 12 + u * 40; spark(c, f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.8, 6.5 * (1 - u * 0.5), '#FFD66B'); }
      } else {
        for (j = 0; j < 5; j++) {
          v = u * 1.45 - j * 0.11;
          if (v <= 0 || v >= 1) continue;
          coinAt(c, f.x0 + (f.x1 - f.x0) * v, f.y0 + (f.y1 - f.y0) * v - Math.sin(v * Math.PI) * 64, 7.5);
        }
      }
      c.globalAlpha = 1;
    }
  }
  function drawBoard(now) {
    var items = [], seats = S.seats || [], own = S.own || [], lvl = S.lvl || [], i, q, o, tint, p, s, pts = [], sl, top, pulse;
    c.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (i = 0; i < 24; i++) {
      q = B.board[i]; o = tileOrigin(i);
      if (q.t === 'shop') {
        tint = own[i] >= 0 ? B.tints[own[i] % B.tints.length] : null;
        if (tint) {                                    // the owner's colour round the space
          rr(c, o.x + 5.5, o.y + 5.5, TW - 11, TH - 11, 8); c.strokeStyle = tint; c.lineWidth = 4.5; c.stroke();
          pill(c, o.x + 5, o.y + 61, String(rentOf(i)), tint, '#fff', 'house');
        } else pill(c, o.x + 5, o.y + 61, String(q.price), '#fff', NAVY, 'coin');
        items.push({ y: o.y + 54, shop: 1, x: o.x + 9, yy: o.y + 54, lvl: lvl[i] || 0, tint: tint });
      } else if (q.t === 'park' && S.pot !== undefined) pill(c, o.x + 5, o.y + 61, String(S.pot), '#fff', NAVY, 'coin');
    }
    if (playing() && (S.offer !== null && S.offer !== undefined)) {   // the space somebody is deciding about
      o = tileOrigin(S.offer); pulse = 0.55 + Math.sin(now / 150) * 0.4;
      rr(c, o.x + 1, o.y + 1, TW - 2, TH - 2, 12); c.strokeStyle = 'rgba(255,214,107,' + pulse + ')'; c.lineWidth = 7; c.stroke();
    }
    if (info >= 0) { o = tileOrigin(info); rr(c, o.x + 1, o.y + 1, TW - 2, TH - 2, 12); c.strokeStyle = '#fff'; c.lineWidth = 5; c.stroke(); }
    for (i = 0; i < seats.length; i++) { p = tokenPoint(i, now); pts[i] = p; items.push({ y: p.y + 0.5, seat: i, p: p }); }
    items.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < items.length; i++) {
      q = items[i];
      if (q.shop) { c.drawImage(shopSprite(q.lvl, q.tint), q.x - 6, q.yy - 78, 78, 84); continue; }
      s = seats[q.seat]; p = q.p; tint = B.tints[q.seat % B.tints.length];
      ell(c, p.x, p.y, 17, 6); c.fillStyle = tint; c.fill(); c.lineWidth = 2; c.strokeStyle = NAVY; c.stroke();       // the seat's colour under the feet
      if (s.robot) drawRobot(c, p.x, p.y - p.lift, tint, t + q.seat * 0.7, facing[q.seat] || 1, p.moving, 0.64);
      else {
        try { api.drawAvatar(c, s.look || { color: tint }, p.x, p.y - p.lift, t + q.seat * 0.7, { scale: avatarScale(s.look), facing: facing[q.seat] || 1, moving: p.moving }); } catch (e) {}
      }
    }
    drawDie(now);
    for (i = 0; i < seats.length; i++) {             // name tags, the "whose turn" arrow, Zzz
      s = seats[i]; p = pts[i]; sl = 0;
      for (q = 0; q < i; q++) if (seats[q].pos === s.pos && !pts[q].moving) sl++;
      top = p.y - p.lift - 56 - (p.moving ? 0 : (sl % 3) * 15);
      nameTag(c, s.robot ? s.name.replace('Robo ', '') : (s.away ? '🤖 ' : '') + s.name, p.x, top, i === mySeat);
      if (s.nap) { c.font = '700 15px ' + FONT; c.fillStyle = NAVY; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('Zz', p.x + 12, top - 26 - Math.sin(t * 2 + i) * 2); }
      if (playing() && i === S.turn) {
        o = top - 23 - Math.abs(Math.sin(t * 4)) * 5;
        poly(c, [p.x - 9, o, p.x + 9, o, p.x, o + 11]); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 2.5);
      }
    }
    drawFloats(now);
  }
  function tick() {
    var left = deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : -1, list, i;
    if (left === lastSec) return;
    lastSec = left;
    list = root.querySelectorAll('.monopoly-time');
    for (i = 0; i < list.length; i++) {
      list[i].textContent = left >= 0 ? '⏱ ' + left : '';
      list[i].className = 'monopoly-time' + (left >= 0 && left <= 5 ? ' hot' : '');
    }
  }
  function frame(ts) {
    if (!root) return;
    raf = requestAnimationFrame(frame);
    var now = performance.now();
    t = ts / 1000;
    if (!base && B && W > 60) buildBase();
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (base) c.drawImage(base, 0, 0); else { c.fillStyle = '#7BD389'; c.fillRect(0, 0, cv.width, cv.height); }
    if (B && S) { try { drawBoard(now); } catch (e) { if (window.console) console.error(e); } }
    tick();
  }

  // ---------- layout ----------
  function layout() {
    if (!root) return;
    var r = el.main.getBoundingClientRect(), lx, ly, lw, lh, st;
    W = Math.max(60, Math.round(r.width)); H = Math.max(60, Math.round(r.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    k = Math.min(W / UW, H / UH);
    ox = (W - UW * k) / 2 + MX * k; oy = (H - UH * k) / 2 + MT * k;
    base = null; sprites = {};
    // the notices and question cards sit on the lawn in the middle of the board
    lx = ox + (TW + 8) * k; ly = oy + (TH + 8) * k; lw = (5 * TW - 16) * k; lh = (5 * TH - 16) * k;
    st = el.status.style;
    st.left = Math.round(ox + 350 * k) + 'px'; st.top = Math.round(ly + 5 * k) + 'px'; st.height = Math.round(Math.max(30, 36 * k)) + 'px';
    st.fontSize = Math.round(Math.max(14, 17 * k)) + 'px'; st.maxWidth = Math.round(lw - 10) + 'px';
    st = el.stage.style;
    st.left = Math.round(lx + 4) + 'px'; st.top = Math.round(ly + 46 * k) + 'px'; st.width = Math.round(lw - 8) + 'px'; st.height = Math.round(lh - 46 * k - 4) + 'px';
    st.fontSize = Math.round(Math.max(15, 21 * k)) + 'px';
    st = el.sum.style;
    st.left = Math.round(lx) + 'px'; st.width = Math.round(lw) + 'px'; st.top = Math.round(ly + 3 * k) + 'px'; st.fontSize = Math.round(Math.max(20, 29 * k)) + 'px';
  }
  function onResize() { layout(); }

  // ---------- notices ----------
  function say(text) {
    statusSeq++; statusText = text || '';
    if (!root) return;
    el.status.hidden = !statusText || !S || S.phase !== 'play';
    el.status.innerHTML = '<span>' + esc(statusText) + '</span>';
    if (statusText && S && S.phase === 'play' && logLines[logLines.length - 1] !== statusText) {
      logLines.push(statusText);
      if (logLines.length > 9) logLines.shift();
    }
    el.log.innerHTML = S && S.phase === 'play' ? logLines.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') : '';
  }
  function sayLater(ms, text) { var seq = statusSeq; later(ms, function () { if (seq === statusSeq) say(text); }); }   // unless something newer was said
  function showFlash(html, ms) {
    var id = ++flashId;
    flash = { id: id, html: html };
    later(ms, function () { if (flash && flash.id === id) { flash = null; renderStage(); } });
  }
  // "150 − 40 = 110": shown to the player whose coins change
  function pumpSum() {
    var q, sign;
    if (sumBusy || !sumQ.length || !root) return;
    q = sumQ.shift(); sumBusy = true; sign = q.d < 0 ? ' − ' : ' + ';
    el.sum.className = 'monopoly-sum ' + (q.d < 0 ? 'loss' : 'gain');
    el.sum.innerHTML = '<span>' + (WHY_ICON[q.why] || '') + ' ' + q.a + sign + Math.abs(q.d) + ' = ' + q.b + '</span>';
    el.sum.hidden = false;
    later(sumQ.length > 1 ? 1500 : 2400, function () { el.sum.hidden = true; sumBusy = false; later(120, pumpSum); });
  }
  function scheduleSum(q) {
    later(q.at || 0, function () {
      var p = disp[q.s];
      if (p) floats.push({ kind: 'txt', x: p.x, y: p.y - 78, text: (q.d < 0 ? '−' : '+') + Math.abs(q.d), col: q.d < 0 ? '#D6336C' : '#2B8A3E', t0: performance.now(), dur: 1500 });
      if (q.s === mySeat) { sumQ.push(q); pumpSum(); if (q.d > 0) api.sfx('star'); }
    });
  }

  // ---------- what just happened (the `ev` of a state message) ----------
  function onEv(ev) {
    var cfg = B.cfg, now = performance.now(), n = ev.s, me = n === mySeat, q, i, mine;
    switch (ev.k) {
      case 'begin': say('The game begins! ' + cfg.rounds + ' rounds.'); api.sfx('open'); break;
      case 'lobby': say(''); break;
      case 'turn':
        flash = null;
        say(me ? 'Your turn! Tap the die.' : who(n) + '’s turn');
        if (me) api.sfx('join');
        break;
      case 'sleep': say(who(n) + ' ' + vb(n, 'is', 'are') + ' napping: no turn this time. Zzz'); break;
      case 'roll':
        die.v = ev.die; die.t0 = now; die.t1 = now + cfg.die;
        hop(n, ev.from, ev.to, 1, cfg.die, cfg.hop);
        say(who(n) + ' ' + vb(n, 'rolls', 'roll') + ' the die…');
        sayLater(cfg.die, who(n) + ' rolled ' + ev.die + '!');
        api.sfx('tap');
        break;
      case 'offer':
        q = B.board[ev.i]; if (me) info = -1;
        say(ev.up ? who(n) + ': make ' + q.en + ' bigger?' : who(n) + ': buy ' + q.en + ' for ' + q.price + '?');
        break;
      case 'buy':
        q = B.board[ev.i];
        say(who(n) + ' bought ' + q.en + (ev.set ? '. The whole colour: rent ×2!' : '!'));
        sparkle(ev.i); api.sfx('buy');
        break;
      case 'pass': say(who(n) + ' did not ' + (ev.up ? 'upgrade.' : 'buy.')); break;
      case 'poor': q = B.board[ev.i]; say(who(n) + ' cannot pay ' + q.price + ' for ' + q.en + '.'); if (me) api.sfx('deny'); break;
      case 'home': say(who(n) + ' ' + vb(n, 'visits', 'visit') + ' ' + vb(n, 'their', 'your') + ' own shop.'); break;
      case 'up':
        q = B.board[ev.i];
        say(who(n) + ' made ' + q.en + ' bigger. Rent goes up!');
        sparkle(ev.i); api.sfx('buy');
        break;
      case 'due':
        if (me) info = -1;
        say(ev.why === 'tax' ? who(n) + ' ' + vb(n, 'pays', 'pay') + ' ' + ev.amount + ' town tax.' : who(n) + ' ' + vb(n, 'owes', 'owe') + ' ' + whom(ev.to) + ' ' + ev.amount + ' rent.');
        break;
      case 'paid':
        say(who(n) + ' paid ' + ev.paid + ' for ' + ev.amount + (ev.why === 'tax' ? ' tax' : ' rent') + (ev.change ? ', change ' + ev.change + '.' : '.'));
        if (ev.to >= 0) coinsFly(n, ev.to);
        if (me) { showFlash(paidHtml(ev), 3000); api.sfx('claim'); }
        break;
      case 'short':
        say(who(n) + ' could not pay ' + ev.amount + ': gave ' + ev.paid + (ev.lost >= 0 ? ', and ' + B.board[ev.lost].en + ' goes back to the bank.' : '.'));
        if (ev.to >= 0 && ev.paid > 0) coinsFly(n, ev.to);
        if (me) { showFlash(shortHtml(ev), 3200); api.sfx('wrong'); }
        break;
      case 'card': say(who(n) + ' ' + vb(n, 'takes', 'take') + ' a Lucky card.'); api.sfx('open'); break;
      case 'cardfx':
        say(cardSays(n, ev.c) + (ev.lost >= 0 ? '. ' + B.board[ev.lost].en + ' goes back to the bank.' : '.'));
        if (me && ev.lost >= 0) api.sfx('wrong');
        break;
      case 'hop': hop(n, ev.from, ev.to, ev.n > 0 ? 1 : -1, cfg.hop, cfg.hop); say(cardSays(n, ev.c) + '.'); break;
      case 'fly': fly(n, ev.from, cfg.fly); say(cardSays(n, ev.c) + '.'); break;
      case 'bus': fly(n, ev.from, cfg.fly); say(who(n) + ' ' + vb(n, 'rides', 'ride') + ' the bus to the next stop.'); api.sfx('car'); break;
      case 'nap': say(who(n) + ' ' + vb(n, 'takes', 'take') + ' a nap and will miss a turn.'); break;
      case 'park': say(ev.n > 0 ? who(n) + ' found ' + ev.n + ' in the park’s piggy bank!' : who(n) + ' ' + vb(n, 'rests', 'rest') + ' in the park.'); break;
      case 'over':
        say('');
        mine = null;
        for (i = 0; S.results && i < S.results.length; i++) if (S.results[i].s === mySeat) mine = S.results[i];
        api.sfx(mine && mine.place === 1 ? 'levelup' : 'tagwin');
        break;
    }
    if (ev.sums) for (i = 0; i < ev.sums.length; i++) scheduleSum(ev.sums[i]);
  }

  // ---------- the side panel ----------
  function renderSide() {
    var key, html = '', i, s, act = '', robots = 0, cur, take;
    if (!S || !B) return;
    key = JSON.stringify([S.phase, S.round, S.turn, S.step, mySeat, rollSent, S.takes, S.upgraded, S.lvl, S.seats ? S.seats.map(function (o) { return [o.name, o.cash, o.shops, o.away, o.nap, o.robot]; }) : 0]);
    if (key === sideKey) return;
    sideKey = key; lastSec = -2;
    if (S.phase === 'lobby') {
      el.round.innerHTML = '🎲 Town Monopoly';
      html = '<div class="monopoly-how"><span>🎲 Roll the die and hop round the town.</span><span>🏠 Buy shops. Friends who land there pay you rent.</span>' +
        '<span>⬆️ Make a shop bigger: more rent!</span><span>🏆 The richest after ' + B.cfg.rounds + ' rounds wins.</span></div>';
      el.list.innerHTML = html; el.act.innerHTML = '';
      return;
    }
    el.round.innerHTML = S.phase === 'over' ? '🏆 Game over' : '<span>Round <b>' + S.round + '</b>/' + S.rounds + '</span><span class="monopoly-time"></span>';
    for (i = 0; i < S.seats.length; i++) {
      s = S.seats[i];
      if (s.robot) robots++;
      cur = S.takes && S.takes[i];
      take = S.phase === 'play' && mySeat < 0 && s.robot;         // a watcher may take this robot's seat
      html += (take ? '<button type="button" data-a="take" data-n="' + i + '"' + (cur && cur !== myKey ? ' disabled' : '') : '<div') +
        ' class="monopoly-row' + (S.phase === 'play' && i === S.turn ? ' on' : '') + (i === mySeat ? ' me' : '') + '">' +
        '<i class="tint" style="background:' + B.tints[i % B.tints.length] + '"></i><canvas data-av="s' + i + '"></canvas>' +
        '<span class="nm">' + (s.away ? '🤖 ' : '') + esc(s.name) + (s.nap ? ' 😴' : '') + '</span>' +
        (take ? '<span class="sit">' + (cur === myKey ? '✔ soon' : 'Sit') + '</span>' : '<span class="shops">🏠' + s.shops + '</span>') +
        '<span class="cash">' + coin() + ' ' + s.cash + '</span>' + (take ? '</button>' : '</div>');
    }
    el.list.innerHTML = html;
    paintAvatars(el.list);
    if (S.phase === 'over') act = '<div class="monopoly-hint">Thanks for playing!</div>';
    else if (mySeat < 0) {
      act = '<div class="monopoly-hint">👀 You are watching.' + (robots ? '<br>Tap a robot to take its seat.' : '<br>You can play in the next game.') + '</div>';
    } else if (S.turn === mySeat && S.step === 'roll') {
      for (i = 0, take = false; i < 24 && !take; i++) take = canUpgrade(i);   // something of mine could be made bigger first
      act = (take && !rollSent ? '<div class="monopoly-hint">⬆️ Tap one of your shops to make it bigger.</div>' : '') +
        '<button type="button" class="btn primary monopoly-roll' + (rollSent ? '' : ' go') + '" data-a="roll" data-quiet' + (rollSent ? ' disabled' : '') + '>🎲 Roll!</button>';
    } else if (S.turn === mySeat) act = '<div class="monopoly-hint">Your turn: look at the board.</div>';
    else act = '<div class="monopoly-hint">' + dot(S.turn) + esc(S.seats[S.turn].name) + ' is playing…<br>Tap a shop to look at it.</div>';
    el.act.innerHTML = act;
  }

  // ---------- the cards in the middle of the board ----------
  function shopHead(i) {
    var q = B.board[i], col = q.t === 'shop' ? B.groups[q.g] : SPECIAL[q.t];
    return '<div class="monopoly-hd"><span class="monopoly-pic" style="background:' + col + '">' + q.icon + '</span><span class="monopoly-name">' + api.three(q) + '</span></div>';
  }
  function miniNotes(list) {
    var html = '', i, j;
    for (i = list.length - 1; i >= 0; i--) for (j = 0; j < list[i]; j++) html += '<span class="monopoly-mini" style="background:' + NOTE_COL[i] + '">' + B.notes[i] + '</span>';
    return html;
  }
  function askBuy(i) {
    var q = B.board[i], cash = S.seats[mySeat].cash, dis = actSent ? ' disabled' : '';
    return '<div class="monopoly-card">' + shopHead(i) +
      '<div class="monopoly-line">Price ' + coin() + ' <b>' + q.price + '</b> &nbsp;·&nbsp; rent 🏠 <b>' + q.rent + '</b></div>' +
      '<div class="monopoly-math">' + cash + ' − ' + q.price + ' = ' + (cash - q.price) + '</div>' +
      '<div class="monopoly-btns"><button type="button" class="btn primary" data-a="buy" data-quiet' + dis + '>Buy ' + coin() + ' ' + q.price + '</button>' +
      '<button type="button" class="btn" data-a="nobuy"' + dis + '>No</button><span class="monopoly-time"></span></div></div>';
  }
  function askUp(i) {
    var q = B.board[i], cash = S.seats[mySeat].cash, now = rentOf(i), dis = actSent ? ' disabled' : '';
    return '<div class="monopoly-card">' + shopHead(i) +
      '<div class="monopoly-line">⬆️ Make it bigger? Rent 🏠 <b>' + now + '</b> → <b>' + (now / (1 + S.lvl[i]) * (2 + S.lvl[i])) + '</b></div>' +
      '<div class="monopoly-math">' + cash + ' − ' + q.up + ' = ' + (cash - q.up) + '</div>' +
      '<div class="monopoly-btns"><button type="button" class="btn primary" data-a="up" data-quiet' + dis + '>Upgrade ' + coin() + ' ' + q.up + '</button>' +
      '<button type="button" class="btn" data-a="noup"' + dis + '>No</button><span class="monopoly-time"></span></div></div>';
  }
  function askPay() {
    var p = S.pay, paid = sumPick(), need = p.amount - paid, html, i, left, parts = [];
    for (i = 0; i < order.length; i++) parts.push('<span class="monopoly-mini" style="background:' + NOTE_COL[order[i]] + '">' + B.notes[order[i]] + '</span>');
    html = '<div class="monopoly-card">' +
      '<div class="monopoly-line">' + (p.why === 'tax' ? '🏛️ Town tax' : '🏠 Rent') + ' <b style="font-size:1.35em">' + p.amount + '</b>' +
      (p.to >= 0 ? ' → ' + dot(p.to) + esc(S.seats[p.to].name) : '') + ' &nbsp;<span class="monopoly-time"></span></div>' +
      '<div class="monopoly-paying"><span class="txt">' + (parts.length ? parts.join('+') + ' = <b>' + paid + '</b>' : 'Tap your notes to pay.') +
      (need > 0 && parts.length ? '<br>' + need + ' more' : need <= 0 ? ' ✔' : '') + '</span>' +
      '<button type="button" class="monopoly-undo" data-a="undo" aria-label="Take the last note back"' + (order.length && !paySent ? '' : ' disabled') + '>↩</button></div>' +
      '<div class="monopoly-notes">';
    for (i = 0; i < B.notes.length; i++) {
      left = p.wallet[i] - pick[i];
      html += '<button type="button" class="monopoly-note" data-a="note" data-n="' + i + '" style="background:' + NOTE_COL[i] + '"' + (left > 0 && !paySent ? '' : ' disabled') + '><b>' + B.notes[i] + '</b><em>×' + left + '</em></button>';
    }
    return html + '</div><div class="monopoly-btns"><button type="button" class="btn primary" data-a="auto"' + (paySent ? ' disabled' : '') + '>Auto pay</button></div></div>';
  }
  function paidHtml(ev) {
    return '<div class="monopoly-card"><div class="monopoly-line">You paid <b>' + ev.paid + '</b> · ' + (ev.why === 'tax' ? '🏛️ tax' : '🏠 rent') + ' <b>' + ev.amount + '</b> · change <b>' + ev.change + '</b></div>' +
      '<div class="monopoly-math">' + ev.paid + ' − ' + ev.amount + ' = ' + ev.change + '</div>' +
      '<div class="monopoly-line">' + (ev.change ? 'Your change: ' + miniNotes(ev.back) : 'Exactly right, no change! ✔') + '</div></div>';
  }
  function shortHtml(ev) {
    return '<div class="monopoly-card"><div class="monopoly-big">😮</div><div class="monopoly-line">Not enough coins for ' + ev.amount + '.<br>You gave <b>' + ev.paid + '</b>.' +
      (ev.lost >= 0 ? '<br>' + B.board[ev.lost].icon + ' <b>' + esc(B.board[ev.lost].en) + '</b> goes back to the bank.' : '') + '</div></div>';
  }
  function cardHtml(ci) {
    var q = B.cards[ci], fx, cls = '';
    if (q.k === 'gain') { fx = '+' + q.n + ' ' + coin(); cls = ' gain'; }
    else if (q.k === 'lose') { fx = '−' + q.n + ' ' + coin(); cls = ' loss'; }
    else if (q.k === 'each') { fx = (q.n > 0 ? '+' + q.n : '−' + (-q.n)) + ' ' + coin() + (q.n > 0 ? ' from everyone' : ' to everyone'); cls = q.n > 0 ? ' gain' : ' loss'; }
    else if (q.k === 'move') fx = q.n > 0 ? '▶ ' + q.n + ' steps' : '◀ ' + (-q.n) + ' steps';
    else if (q.k === 'goto') fx = '➜ ' + B.board[q.n].icon + ' ' + esc(B.board[q.n].en);
    else fx = '➜ 😴';
    return '<div class="monopoly-card"><div class="monopoly-line">🍀 Lucky card for ' + dot(S.turn) + esc(S.seats[S.turn].name) + '</div><div class="monopoly-big">' + q.icon + '</div>' +
      '<div class="monopoly-name">' + api.three(q) + '</div><div class="monopoly-fx' + cls + '">' + fx + '</div></div>';
  }
  function infoHtml(i) {
    var q = B.board[i], o = S.own[i], body, btn = '';
    if (q.t === 'shop') {
      body = '<div class="monopoly-line">' + (o >= 0 ? 'Owner: ' + dot(o) + '<b>' + esc(S.seats[o].name) + '</b> · rent now 🏠 <b>' + rentOf(i) + '</b>' : 'For sale: ' + coin() + ' <b>' + q.price + '</b>') + '</div>' +
        '<div class="monopoly-line">Rent 🏠 ' + q.rent + ' · ⬆️ ' + q.rent * 2 + ' · ⬆️⬆️ ' + q.rent * 3 + '<br>Whole colour: rent ×2</div>';
      if (canUpgrade(i)) btn = '<button type="button" class="btn primary" data-a="upinfo" data-quiet>Upgrade ' + coin() + ' ' + q.up + '</button>';
    } else {
      body = '<div class="monopoly-line">' + ({
        start: 'Get ' + coin() + ' <b>' + B.cfg.salary + '</b> every time you pass.',
        lucky: 'Take a Lucky card: a nice surprise, or not!',
        bus: 'Ride the bus to the next bus stop.',
        tax: 'Pay ' + coin() + ' <b>' + B.cfg.tax + '</b>. It goes into the park’s piggy bank.',
        nap: 'Have a nap and miss one turn.',
        park: 'Take what is in the piggy bank: ' + coin() + ' <b>' + S.pot + '</b>'
      }[q.t] || '') + '</div>';
    }
    return '<div class="monopoly-card">' + shopHead(i) + body + '<div class="monopoly-btns">' + btn + '<button type="button" class="btn" data-a="closeinfo">Close</button></div></div>';
  }
  function renderStage() {
    var key = '', html = '', pk;
    if (!root) return;
    if (playing()) {
      if (S.step === 'card' && S.card !== null && S.card !== undefined) { key = 'card:' + S.card + ':' + S.turn; html = cardHtml(S.card); }
      else if (myTurn('buy') && S.offer !== null) { key = 'buy:' + S.offer + ':' + actSent; html = askBuy(S.offer); }
      else if (myTurn('up') && S.offer !== null) { key = 'up:' + S.offer + ':' + actSent; html = askUp(S.offer); }
      else if (myTurn('pay') && S.pay) {
        pk = S.round + ':' + S.pay.amount + ':' + S.pay.i + ':' + S.pay.wallet.join('.');
        if (pk !== payKey) { payKey = pk; pick = [0, 0, 0, 0, 0]; order = []; paySent = false; }
        key = 'pay:' + pk + ':' + order.join('') + ':' + paySent; html = askPay();
      } else if (flash) { key = 'flash:' + flash.id; html = flash.html; }
      else if (info >= 0) { key = 'info:' + info + ':' + S.own[info] + ':' + S.lvl[info] + ':' + canUpgrade(info) + ':' + S.pot; html = infoHtml(info); }
    }
    if (key === stageKey) return;
    stageKey = key; lastSec = -2;
    el.stage.hidden = !key;
    el.stage.innerHTML = html;
  }

  // ---------- lobby and results ----------
  function lobbyHtml() {
    var hs = S.humans || [], seated = false, i, html, cfg = B.cfg;
    for (i = 0; i < hs.length; i++) if (hs[i].key === myKey) seated = true;
    html = '<div class="monopoly-panel"><h2>Town Monopoly</h2><div class="monopoly-tri">大富翁 <span class="py">dàfùwēng</span> · Monopoli Bandar</div><div class="monopoly-seats">';
    for (i = 0; i < hs.length; i++) html += '<span class="monopoly-chip"><canvas data-av="h' + i + '"></canvas>' + esc(hs[i].name) + '</span>';
    for (i = 0; i < S.robots; i++) html += '<span class="monopoly-chip"><canvas data-av="r' + (hs.length + i) + '"></canvas>Robot</span>';
    html += '</div>';
    if (seated) {
      html += '<div class="monopoly-robots">Robots <button type="button" class="round" data-a="rob-" aria-label="One robot less"' + (S.robots <= S.minRobots ? ' disabled' : '') + '>−</button><b>' + S.robots +
        '</b><button type="button" class="round" data-a="rob+" aria-label="One robot more"' + (S.robots >= S.maxRobots ? ' disabled' : '') + '>+</button></div>';
    }
    html += '<div class="monopoly-facts">🎲 ' + cfg.rounds + ' rounds · ' + coin() + ' ' + cfg.cash + ' each · ⭐ ' + cfg.stars.join(' / ') + ' by place</div>';
    if (rec) {
      html += '<div class="monopoly-facts">My record: 🎮 ' + rec.games + ' · 🏆 ' + rec.wins + ' · best ' + coin() + ' ' + rec.best + '<br>' +
        (rec.today >= rec.full ? 'Today: ⭐ 2 for every extra game.' : 'Full star rewards today: ' + (rec.full - rec.today) + ' more game' + (rec.full - rec.today === 1 ? '' : 's') + '.') + '</div>';
    }
    html += seated ? '<button type="button" class="btn primary big" data-a="start">Start game</button>' : '<div class="monopoly-facts">The table is full. You can watch the game.</div>';
    return html + '</div>';
  }
  function resultsHtml() {
    var medals = ['🥇', '🥈', '🥉'], mine = null, note, html;
    html = '<div class="monopoly-panel"><h2>🏆 Results</h2><div class="monopoly-tri">结果 <span class="py">jiéguǒ</span> · Keputusan · ' + coin() + ' + 🏠 = total</div><div class="monopoly-res">';
    S.results.forEach(function (r) {
      var s = S.seats[r.s], me = r.s === mySeat;
      if (me) mine = r;
      html += '<div class="monopoly-rr' + (me ? ' me' : '') + '"><span class="pl">' + (medals[r.place - 1] || r.place) + '</span><canvas data-av="s' + r.s + '"></canvas>' +
        '<span class="nm">' + esc(s.name) + '</span><span class="sum">' + r.cash + ' + ' + r.shops + ' = <b>' + r.worth + '</b></span>' +
        '<span class="st">' + (r.stars ? '⭐ +' + r.stars : s.robot ? '🤖' : '') + '</span></div>';
    });
    html += '</div>';
    if (!mine) note = 'Next game you can play too!';
    else if (mine.few) note = 'Play at least ' + B.cfg.minTurns + ' turns yourself to earn stars.';
    else if (mine.later) note = 'You had your 3 full games today: ⭐ 2 for every extra game.';
    else note = (mine.best ? 'New best score! ' : '') + (mine.place === 1 ? 'You are the richest in town!' : 'Well played! ⭐ +' + mine.stars);
    return html + '<div class="monopoly-facts">' + note + '</div><button type="button" class="btn primary" data-a="again" style="min-width:60%">Play again</button></div>';
  }
  function renderModal() {
    var key = '', html = '';
    if (!root || !S || !B) return;
    if (S.phase === 'lobby') { key = 'lobby:' + JSON.stringify([S.humans, S.robots, S.minRobots, S.maxRobots, rec, myKey]); html = lobbyHtml(); }
    else if (S.phase === 'over' && S.results) { key = 'over:' + JSON.stringify([S.results, mySeat]); html = resultsHtml(); }
    if (key === modalKey) return;
    modalKey = key;
    el.modal.hidden = !key;
    el.modal.innerHTML = html;
    if (key) paintAvatars(el.modal);
  }
  function renderAll() {
    if (!root || !S || !B) return;
    el.status.hidden = !statusText || S.phase !== 'play';
    renderSide(); renderStage(); renderModal();
  }

  // ---------- messages from the server ----------
  function onState(m) {
    var prev = S, me = api.self(), i;
    S = m;
    myKey = me && me.name ? String(me.name).toLowerCase() : myKey;
    mySeat = -1;
    if (m.seats) for (i = 0; i < m.seats.length; i++) if (!m.seats[i].robot && m.seats[i].key === myKey) mySeat = i;
    deadline = m.left > 0 ? Date.now() + m.left : 0; lastSec = -2;
    rollSent = false; actSent = false;
    if (!prev || prev.phase !== m.phase || !prev.seats || !m.seats || prev.seats.length !== m.seats.length) {   // another game: forget the old animations
      anim = []; disp = []; facing = []; floats = []; sumQ = []; info = -1; flash = null; logLines = [];
      if (m.phase !== 'play') say('');
    }
    if (m.phase === 'play' && m.die && performance.now() >= die.t1) die.v = m.die;
    if (m.phase !== 'play') { info = -1; flash = null; }
    if (m.ev && B) { try { onEv(m.ev); } catch (e) { if (window.console) console.error(e); } }
    else if (m.phase === 'play' && !statusText && m.seats[m.turn]) say(m.turn === mySeat ? 'Your turn!' : m.seats[m.turn].name + '’s turn');
    renderAll();
  }
  function onMessage(m) {
    if (!root) return;
    if (m.t === 'monopoly.hello') { B = m; base = null; sprites = {}; sideKey = stageKey = modalKey = null; renderAll(); }
    else if (m.t === 'monopoly.me') { rec = m; renderAll(); }
    else if (m.t === 'monopoly.state') onState(m);
  }

  // ---------- taps ----------
  function roll() {
    if (!canRoll()) return;
    rollSent = true;
    api.send({ t: 'monopoly.roll' });
    renderSide();
  }
  function sendPay() {
    if (myTurn('pay') && S.pay) api.send({ t: 'monopoly.pay', notes: pick });
  }
  function onClick(e) {
    var b = e.target, a, n;
    while (b && b !== root && !(b.getAttribute && b.getAttribute('data-a'))) b = b.parentNode;
    if (!b || b === root || b.disabled) return;
    a = b.getAttribute('data-a'); n = parseInt(b.getAttribute('data-n'), 10);
    if (a === 'back') { close(); return; }
    if (!S || !B) return;
    if (a === 'roll') roll();
    else if (a === 'buy' || a === 'nobuy') { if (myTurn('buy') && !actSent) { actSent = true; api.send({ t: 'monopoly.buy', yes: a === 'buy' }); renderStage(); } }
    else if (a === 'up' || a === 'noup') { if (myTurn('up') && !actSent) { actSent = true; api.send({ t: 'monopoly.up', i: S.offer, yes: a === 'up' }); renderStage(); } }
    else if (a === 'upinfo') { if (info >= 0 && canUpgrade(info)) { api.send({ t: 'monopoly.up', i: info, yes: true }); info = -1; renderStage(); } }
    else if (a === 'closeinfo') { info = -1; renderStage(); }
    else if (a === 'note') {
      if (!myTurn('pay') || !S.pay || paySent || !(n >= 0) || S.pay.wallet[n] - pick[n] <= 0) return;
      pick[n]++; order.push(n);
      if (sumPick() >= S.pay.amount) { paySent = true; later(650, sendPay); }      // covered: hand it over, the change comes back
      renderStage();
    } else if (a === 'undo') { if (!paySent && order.length) { pick[order.pop()]--; renderStage(); } }
    else if (a === 'auto') { if (myTurn('pay') && !paySent) { paySent = true; api.send({ t: 'monopoly.pay', auto: true }); renderStage(); } }
    else if (a === 'rob+' || a === 'rob-') api.send({ t: 'monopoly.robots', d: a === 'rob+' ? 1 : -1 });
    else if (a === 'start') api.send({ t: 'monopoly.start' });
    else if (a === 'again') api.send({ t: 'monopoly.again' });
    else if (a === 'take') { if (n >= 0) api.send({ t: 'monopoly.take', seat: n }); }
  }
  function onPoint(e) {
    var r, ux, uy, col, row, i = -1;
    if (!playing()) return;
    r = cv.getBoundingClientRect(); ux = (e.clientX - r.left - ox) / k; uy = (e.clientY - r.top - oy) / k;
    if (canRoll() && Math.abs(ux - DIE.x - 6) < 85 && uy > DIE.y - DIE.s - 40 && uy < DIE.y + 34) { roll(); return; }
    if (S.step === 'card' || myTurn('buy') || myTurn('up') || myTurn('pay')) return;      // a question is on the board: answer it first
    col = Math.floor(ux / TW); row = Math.floor(uy / TH);
    if (col >= 0 && col < 7 && row >= 0 && row < 7) {
      if (row === 0) i = col; else if (col === 6) i = 6 + row; else if (row === 6) i = 18 - col; else if (col === 0) i = 24 - row;
    }
    if (i >= 0 && i !== info) { info = i; api.sfx('tap'); } else info = -1;
    renderStage();
  }
  function onKey(e) {
    if (e.key === ' ' || e.key === 'Enter') { if (canRoll()) { roll(); e.preventDefault(); } }
  }

  // ---------- open and close ----------
  function open() {
    var stl;
    if (root) return;
    if (!document.getElementById('monopoly-style')) { stl = document.createElement('style'); stl.id = 'monopoly-style'; stl.textContent = CSS; document.head.appendChild(stl); }
    root = document.createElement('div');
    root.className = 'screen monopoly-root';
    root.innerHTML = '<div class="monopoly-main"><canvas class="monopoly-cv" aria-label="The Monopoly board"></canvas>' +
      '<div class="monopoly-status" role="status" hidden></div><div class="monopoly-stage" hidden></div><div class="monopoly-sum" hidden></div><div class="monopoly-modal" hidden></div></div>' +
      '<div class="monopoly-side"><div class="monopoly-head"><button type="button" class="btn monopoly-back" data-a="back" data-quiet>Back to town</button><span class="monopoly-round">🎲 Town Monopoly</span></div>' +
      '<div class="monopoly-list"></div><div class="monopoly-log" aria-hidden="true"></div><div class="monopoly-act"></div></div>';
    document.body.appendChild(root);
    el = {
      main: root.querySelector('.monopoly-main'), status: root.querySelector('.monopoly-status'), stage: root.querySelector('.monopoly-stage'),
      sum: root.querySelector('.monopoly-sum'), modal: root.querySelector('.monopoly-modal'), round: root.querySelector('.monopoly-round'),
      list: root.querySelector('.monopoly-list'), log: root.querySelector('.monopoly-log'), act: root.querySelector('.monopoly-act')
    };
    cv = root.querySelector('.monopoly-cv'); c = cv.getContext('2d');
    S = null; mySeat = -1; anim = []; disp = []; facing = []; floats = []; sumQ = []; sumBusy = false;
    info = -1; flash = null; stageKey = sideKey = modalKey = null; statusText = ''; logLines = []; deadline = 0; rollSent = false; actSent = false; payKey = '';
    root.addEventListener('click', onClick);
    cv.addEventListener('pointerdown', onPoint);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    layout();
    try {     // the shop signs are text: draw the board again once the font has arrived
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { base = null; sprites = {}; });
    } catch (e) {}
    api.enter('monopoly');
    raf = requestAnimationFrame(frame);
  }
  function close() {
    var i;
    if (!root) return;
    cancelAnimationFrame(raf); raf = 0;
    for (i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers = [];
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKey);
    if (root.parentNode) root.parentNode.removeChild(root);
    root = null; cv = null; c = null; base = null; sprites = {}; el = {}; S = null;
    api.sfx('close');
    api.leave();
  }

  window.FTGames = window.FTGames || {};
  window.FTGames.monopoly = {
    init: function (a) { api = a; if (a.FONT) FONT = a.FONT; if (a.NAVY) NAVY = a.NAVY; },
    open: open,
    onMessage: onMessage
  };
})();
