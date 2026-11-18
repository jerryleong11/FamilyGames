// Escape Room (client). Co-operative puzzle rooms: every tablet shows the same room and the same puzzle
// device, but each one holds different clue cards, so the family has to talk. The server keeps the answer;
// this file only draws what it is told and sends the presses. See docs/GAME-MODULES.md.
(function () {
  'use strict';
  var ID = 'escape';
  var api = null, root = null, cv = null, g = null, W = 0, H = 0, dpr = 1, raf = 0, lastDraw = 0;
  var el = {}, lay = null, bg = { key: '', cv: null };
  var st = null, stAt = 0;      // the last state from the server, and when it arrived
  var ui = null;                // what only this tablet knows: the card on show, animations
  var ctls = [];                // everything that can be tapped on the canvas this frame, in screen pixels
  var T = { x: 0, y: 0, s: 1 }; // where the thing being drawn sits on the screen (for the tap areas)

  var NAVY = '#1B2A49', CREAM = '#FFF3D6', YEL = '#FFD66B', GREEN = '#7BD389', WATER = '#4DB6F0', TAU = Math.PI * 2;
  var FONT = "Fredoka, 'Baloo 2', 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  // shape number i (circle, square, triangle, star, diamond, heart) always has colour i
  var COLS = ['#FF4F6D', '#3B82F6', '#4FA05A', '#FFC933', '#9B6BFF', '#FF7A45'];
  var THEMES = [
    { wall: '#9CCBFF', pat: 'stripe', floor: '#D9A066', rug: '#FF8FB8', door: '#B77B45' },
    { wall: '#B9E3B0', pat: 'dots', floor: '#C98A4B', rug: '#FFD66B', door: '#8F5A2E' },
    { wall: '#C9B8FF', pat: 'stars', floor: '#8C7BC4', rug: '#5ED6C4', door: '#6C4BD8' },
    { wall: '#DDD6C6', pat: 'brick', floor: '#A7AEBA', rug: '#FF7A45', door: '#7A4A2B' },
    { wall: '#FFC2D9', pat: 'diamond', floor: '#F2D9A0', rug: '#9B6BFF', door: '#E0447F' },
    { wall: '#9FE0DA', pat: 'wave', floor: '#E6C58A', rug: '#3B82F6', door: '#2F9E83' }
  ];
  var BODY = { lock: '#F0705A', keys: '#C98A4B', count: '#5AA9FF', seq: '#9B6BFF', scale: '#4FB3A5', memory: '#4C5FD5', grid: '#4FA05A', clock: '#E0447F', lights: '#6B7388', pipes: '#2F9E83' };
  var OPEN_S = 4.2;   // how long the door animation runs on the server

  var CSS = [
    '.esc-root{background:#22314F;overflow:hidden;touch-action:none;color:#1B2A49}',
    '.esc-cv{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none}',
    '.esc-top{position:absolute;left:8px;right:8px;top:8px;height:52px;display:flex;align-items:center;gap:8px;pointer-events:none}',
    '.esc-top>*{pointer-events:auto;flex:none}',
    '.esc-top .btn{height:52px;font-size:18px;padding:0 16px;white-space:nowrap}',
    '.esc-top .esc-mid{flex:1 1 auto;min-width:0;display:flex;justify-content:center;pointer-events:none}',
    '.esc-pill{height:48px;padding:0 14px;border-radius:999px;border:3px solid #1B2A49;background:#fff;display:flex;align-items:center;gap:10px;font-size:22px;font-weight:700;white-space:nowrap}',
    '.esc-dots{display:flex;gap:5px;align-items:center}',
    '.esc-dots i{display:block;width:17px;height:24px;border:2.5px solid #1B2A49;border-radius:7px 7px 2px 2px;background:#fff}',
    '.esc-dots i.ok{background:#7BD389}',
    '.esc-dots i.now{background:#FFD66B}',
    '.esc-fast{display:flex;align-items:center;gap:3px;font-size:18px}',
    '.esc-fast b{display:block;width:40px;height:12px;border:2.5px solid #1B2A49;border-radius:999px;overflow:hidden;background:#fff}',
    '.esc-fast b i{display:block;height:100%;background:#FF7A45}',
    '.esc-top .esc-hint{background:#FFD66B;animation:ftPop .3s ease-out}',
    '.esc-hint small{font-size:14px;font-weight:700;margin-left:2px}',
    '.esc-pill.esc-stars{background:#1B2A49;color:#fff;border-color:#fff}',
    '.esc-stop.ask{width:auto;padding:0 14px;border-radius:999px;background:#FF4F6D;color:#fff;font-size:18px;font-weight:700;border-color:#fff}',
    '.esc-panel{position:absolute;left:12px;top:70px;bottom:12px;right:27%;margin:auto;max-width:700px;max-height:470px;background:#FFF3D6;border:5px solid #1B2A49;border-radius:28px;padding:14px 18px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;touch-action:pan-y;box-shadow:0 8px 0 rgba(27,42,73,.25)}',
    '.esc-panel .py{font-family:system-ui,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif}',
    '.esc-h{display:flex;align-items:center;gap:12px}',
    '.esc-h h2{font-size:30px;line-height:1.05}',
    '.esc-ico{font-size:42px;line-height:1}',
    '.esc-tri{font-size:16px;font-weight:600}',
    '.esc-how{display:flex;align-items:center;gap:6px;background:#fff;border:3px solid #1B2A49;border-radius:18px;padding:6px 12px;font-size:15px;font-weight:600;line-height:1.2}',
    '.esc-how span{font-size:26px;line-height:1}',
    '.esc-how i{font-style:normal;font-size:20px;opacity:.5}',
    '.esc-how em{font-style:normal;flex:1;min-width:0;margin-left:8px}',
    '.esc-modes{display:flex;gap:12px;flex:1 1 auto;min-height:112px}',
    '.esc-mode{flex:1;min-width:0;border:4px solid #1B2A49;border-radius:24px;padding:6px 10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:15px;font-weight:600;line-height:1.2;box-shadow:0 5px 0 rgba(27,42,73,.3)}',
    '.esc-mode:active{transform:translateY(3px);box-shadow:0 2px 0 rgba(27,42,73,.3)}',
    '.esc-mode b{font-size:30px;line-height:1.05}',
    '.esc-mode .esc-st{font-size:20px;letter-spacing:2px;line-height:1}',
    '.esc-easy{background:#BFF0C6}',
    '.esc-hard{background:#FFC9A3}',
    '.esc-best{background:#fff;border:2.5px solid #1B2A49;border-radius:999px;padding:1px 12px;font-size:16px;font-weight:700;margin-top:4px}',
    '.esc-info{font-size:16px;font-weight:600;line-height:1.35}',
    '.esc-keys{font-size:20px;letter-spacing:1px}',
    '.esc-keys .used{opacity:.25}',
    '.esc-big{font-size:44px;font-weight:700;line-height:1.05;display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
    '.esc-badge{background:#FFD66B;border:3px solid #1B2A49;border-radius:999px;padding:3px 12px;font-size:17px;font-weight:700;line-height:1.2}',
    '.esc-sum{font-size:24px;font-weight:700;background:#fff;border:3px solid #1B2A49;border-radius:18px;padding:6px 14px}',
    '.esc-sum small{font-size:15px;font-weight:600;display:block}',
    '.esc-again{font-size:17px;font-weight:700}',
    '@media (max-width:900px),(max-height:560px){.esc-top .btn{font-size:16px;padding:0 12px}.esc-pill{font-size:19px;padding:0 10px;gap:7px}' +
      '.esc-panel{padding:9px 14px;gap:7px;border-width:4px;border-radius:24px}.esc-h h2{font-size:24px}.esc-ico{font-size:34px}.esc-tri{font-size:15px}' +
      '.esc-how{font-size:14px;padding:4px 10px}.esc-how span{font-size:22px}.esc-modes{min-height:100px}.esc-mode b{font-size:25px}.esc-mode{font-size:14px}' +
      '.esc-info{font-size:14.5px}.esc-big{font-size:34px}.esc-sum{font-size:20px}.esc-best{font-size:15px}}'
  ].join('\n');

  // ---------- small helpers ----------
  function freshUi() {
    return { card: 0, cardSig: '', press: {}, marks: {}, hop: {}, flash: {}, ang: {}, pops: [], shake: 0, openAt: 0, fadeAt: 0, deny: 0, dealt: 0, stopAsk: 0, panelSig: '', hud: {} };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(k) { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); }
  function shade(hex, f) { return window.Scene && window.Scene.shade ? window.Scene.shade(hex, f) : hex; }
  function rr(q, x, y, w, h, r) { api.rr(q, x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); }
  function rrTop(q, x, y, w, h, r) { // only the top corners are round
    q.beginPath(); q.moveTo(x, y + h); q.lineTo(x, y + r); q.quadraticCurveTo(x, y, x + r, y); q.lineTo(x + w - r, y);
    q.quadraticCurveTo(x + w, y, x + w, y + r); q.lineTo(x + w, y + h); q.closePath();
  }
  function ol(q, w) { q.lineWidth = w || 3; q.strokeStyle = NAVY; q.lineJoin = 'round'; q.lineCap = 'round'; q.stroke(); }
  function lin(q, x0, y0, x1, y1, a, b) { var gr = q.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; }
  function poly(q, p) { q.beginPath(); q.moveTo(p[0], p[1]); for (var i = 2; i < p.length; i += 2) q.lineTo(p[i], p[i + 1]); q.closePath(); }
  function text(q, s, x, y, size, col, weight, align) {
    q.font = (weight || 700) + ' ' + size + 'px ' + FONT; q.fillStyle = col || NAVY; q.textAlign = align || 'center'; q.textBaseline = 'middle'; q.fillText(s, x, y);
  }
  function mmss(ms) { var s = Math.floor(ms / 1000); return (s < 600 ? '0' : '') + Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function names(list) { return list.map(function (p) { return p.name; }).join(', '); }
  function show(node, on) { if (node.hidden === on) node.hidden = !on; }
  function setText(node, s) { if (node._s !== s) { node._s = s; node.textContent = s; } }

  // ---------- drawn things that several puzzles share ----------
  function shape(q, s, x, y, r, col, lw) {
    q.beginPath();
    if (s === 0) q.arc(x, y, r, 0, TAU);
    else if (s === 1) rr(q, x - r * 0.88, y - r * 0.88, r * 1.76, r * 1.76, r * 0.3);
    else if (s === 2) { q.moveTo(x, y - r); q.lineTo(x + r * 1.05, y + r * 0.82); q.lineTo(x - r * 1.05, y + r * 0.82); q.closePath(); }
    else if (s === 3) api.starPath(q, x, y + r * 0.05, r * 1.15);
    else if (s === 4) { q.moveTo(x, y - r * 1.1); q.lineTo(x + r * 0.82, y); q.lineTo(x, y + r * 1.1); q.lineTo(x - r * 0.82, y); q.closePath(); }
    else {
      q.moveTo(x, y + r * 0.95); q.bezierCurveTo(x - r * 1.55, y - r * 0.1, x - r * 0.75, y - r * 1.25, x, y - r * 0.4);
      q.bezierCurveTo(x + r * 0.75, y - r * 1.25, x + r * 1.55, y - r * 0.1, x, y + r * 0.95); q.closePath();
    }
    q.fillStyle = col; q.fill(); ol(q, lw || 3);
    q.fillStyle = 'rgba(255,255,255,0.45)'; q.beginPath(); q.ellipse(x - r * 0.3, y - r * 0.32, r * 0.2, r * 0.12, -0.6, 0, TAU); q.fill();
  }
  function token(q, c, x, y, r) {   // a colour of the sequence: a round button with its own sign, so colours are never the only clue
    q.beginPath(); q.arc(x, y, r, 0, TAU); q.fillStyle = lin(q, 0, y - r, 0, y + r, shade(COLS[c], 0.2), COLS[c]); q.fill(); ol(q, 3);
    shape(q, c, x, y, r * 0.48, '#FFFFFF', 2);
  }
  function tri(q, x, y, r, dir, col) {   // an arrow head: dir 0 up, 1 right, 2 down, 3 left
    q.save(); q.translate(x, y); q.rotate(dir * Math.PI / 2);
    q.beginPath(); q.moveTo(0, -r); q.lineTo(r * 0.95, r * 0.7); q.lineTo(-r * 0.95, r * 0.7); q.closePath();
    q.fillStyle = col || NAVY; q.fill(); q.lineJoin = 'round'; q.lineWidth = 3; q.strokeStyle = col || NAVY; q.stroke();
    q.restore();
  }
  function tick(q, x, y, r) {
    q.beginPath(); q.moveTo(x - r, y); q.lineTo(x - r * 0.3, y + r * 0.7); q.lineTo(x + r, y - r * 0.7);
    q.lineCap = 'round'; q.lineJoin = 'round'; q.lineWidth = r * 0.78; q.strokeStyle = NAVY; q.stroke(); q.lineWidth = r * 0.36; q.strokeStyle = '#fff'; q.stroke();
  }
  function undoIcon(q, x, y, r) {
    q.beginPath(); q.arc(x, y + 2, r, Math.PI, Math.PI * 2.25); q.lineCap = 'round'; q.lineWidth = 5; q.strokeStyle = NAVY; q.stroke();
    poly(q, [x - r - 8, y - 1, x - r + 8, y - 1, x - r, y + 10]); q.fillStyle = NAVY; q.fill();
  }
  function padlock(q, x, y, r, col) {
    q.beginPath(); q.arc(x, y - r * 0.35, r * 0.55, Math.PI, 0); q.lineCap = 'butt'; q.lineWidth = r * 0.34 + 4; q.strokeStyle = NAVY; q.stroke(); q.lineWidth = r * 0.34; q.strokeStyle = '#C3C9D2'; q.stroke();
    rr(q, x - r, y - r * 0.35, r * 2, r * 1.45, r * 0.3); q.fillStyle = col; q.fill(); ol(q, 2.5);
    q.beginPath(); q.arc(x, y + r * 0.35, r * 0.22, 0, TAU); q.fillStyle = NAVY; q.fill();
  }
  function weight(q, x, y, w, n) {   // a brass weight with its number, centre (x, y)
    var h = w * 0.84;
    q.beginPath(); q.arc(x, y - h * 0.52, w * 0.15, 0, TAU); q.fillStyle = '#7A8296'; q.fill(); ol(q, 2.5);
    poly(q, [x - w * 0.3, y - h * 0.4, x + w * 0.3, y - h * 0.4, x + w * 0.5, y + h * 0.5, x - w * 0.5, y + h * 0.5]);
    q.fillStyle = lin(q, x - w / 2, 0, x + w / 2, 0, '#98A1B5', '#5B6275'); q.fill(); ol(q, 2.5);
    if (n !== '') text(q, String(n), x, y + h * 0.1, w * (String(n).length > 1 ? 0.4 : 0.5), '#fff', 700);
  }
  // the bit of a key: the shaft starts at x and the teeth hang down from it; u is the size of one step
  function keyShape(q, x, y, teeth, u, col) {
    var n = teeth.length, tw = u * 2.2, i, x0, x1, d;
    q.beginPath();
    q.moveTo(x, y - u * 0.7); q.lineTo(x + n * tw + u, y - u * 0.7); q.lineTo(x + n * tw + u, y + u * 0.7);
    for (i = n - 1; i >= 0; i--) {
      x1 = x + (i + 1) * tw; x0 = x + i * tw + u * 0.5; d = y + u * (1 + teeth[i] * 1.45);
      q.lineTo(x1, y + u * 0.7); q.lineTo(x1, d); q.lineTo(x0, d); q.lineTo(x0, y + u * 0.7);
    }
    q.lineTo(x, y + u * 0.7); q.closePath();
    q.fillStyle = col; q.fill();
  }
  function gem(q, x, y, r, i, num) {
    poly(q, [x - r, y - r * 0.25, x - r * 0.5, y - r * 0.85, x + r * 0.5, y - r * 0.85, x + r, y - r * 0.25, x, y + r]);
    q.fillStyle = COLS[i % 6]; q.fill(); ol(q, 3);
    poly(q, [x - r * 0.5, y - r * 0.85, x + r * 0.5, y - r * 0.85, x + r * 0.28, y - r * 0.25, x - r * 0.28, y - r * 0.25]); q.fillStyle = 'rgba(255,255,255,0.42)'; q.fill();
    if (num) text(q, String(i + 1), x, y + r * 0.12, r * 0.85, '#fff', 700);
  }
  function flag(q, x, y, r) {
    q.beginPath(); q.moveTo(x - r * 0.45, y + r); q.lineTo(x - r * 0.45, y - r); q.lineWidth = 4; q.strokeStyle = NAVY; q.lineCap = 'round'; q.stroke();
    poly(q, [x - r * 0.45, y - r, x + r * 0.95, y - r * 0.45, x - r * 0.45, y + r * 0.1]); q.fillStyle = '#FF4F6D'; q.fill(); ol(q, 2.5);
  }
  function bulb(q, x, y, r, on) {
    if (on) {
      var gr = q.createRadialGradient(x, y - r * 0.1, r * 0.3, x, y - r * 0.1, r * 1.7);
      gr.addColorStop(0, 'rgba(255,226,122,0.75)'); gr.addColorStop(1, 'rgba(255,226,122,0)');
      q.fillStyle = gr; q.beginPath(); q.arc(x, y - r * 0.1, r * 1.7, 0, TAU); q.fill();
    }
    rr(q, x - r * 0.32, y + r * 0.5, r * 0.64, r * 0.42, 3); q.fillStyle = '#B5BCCB'; q.fill(); ol(q, 2.5);
    q.beginPath(); q.arc(x, y - r * 0.12, r * 0.74, 0, TAU); q.fillStyle = on ? '#FFE27A' : '#7C86A3'; q.fill(); ol(q, 3);
    q.fillStyle = on ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)'; q.beginPath(); q.ellipse(x - r * 0.26, y - r * 0.4, r * 0.2, r * 0.12, -0.6, 0, TAU); q.fill();
  }
  var PIPS = [[], [[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]];
  function pips(q, x, y, d, n) { (PIPS[n] || []).forEach(function (o) { q.beginPath(); q.arc(x + o[0] * d, y + o[1] * d, d * 0.36, 0, TAU); q.fillStyle = NAVY; q.fill(); }); }
  function sun(q, x, y, r, now) {
    var i, a, sp = (now || 0) / 5000;
    for (i = 0; i < 8; i++) {
      a = i * TAU / 8 + sp;
      q.beginPath(); q.moveTo(x + Math.cos(a - 0.2) * r * 1.08, y + Math.sin(a - 0.2) * r * 1.08); q.lineTo(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.6);
      q.lineTo(x + Math.cos(a + 0.2) * r * 1.08, y + Math.sin(a + 0.2) * r * 1.08); q.closePath(); q.fillStyle = '#FFC933'; q.fill(); ol(q, Math.max(1.5, r * 0.07));
    }
    q.beginPath(); q.arc(x, y, r, 0, TAU); q.fillStyle = '#FFE27A'; q.fill(); ol(q, Math.max(2, r * 0.09));
  }
  function moon(q, x, y, r) {
    q.beginPath(); q.arc(x, y, r, 0.35 * Math.PI, 1.65 * Math.PI); q.arc(x + r * 0.55, y, r * 0.78, 1.42 * Math.PI, 0.58 * Math.PI, true); q.closePath();
    q.fillStyle = '#FFF0B8'; q.fill(); ol(q, Math.max(2, r * 0.09));
  }
  function hand(q, cx, cy, ang, len, wd, col) {   // a clock hand; ang 0 points at 12
    q.beginPath(); q.moveTo(cx - Math.sin(ang) * 8, cy + Math.cos(ang) * 8); q.lineTo(cx + Math.sin(ang) * len, cy - Math.cos(ang) * len);
    q.lineCap = 'round'; q.lineWidth = wd + 5; q.strokeStyle = NAVY; q.stroke(); q.lineWidth = wd; q.strokeStyle = col; q.stroke();
  }
  function pail(q, x, y, r, col, full) {
    q.beginPath(); q.arc(x, y - r * 0.75, r * 0.85, Math.PI, 0); q.lineWidth = 2.5; q.strokeStyle = NAVY; q.stroke();
    poly(q, [x - r, y - r * 0.8, x + r, y - r * 0.8, x + r * 0.72, y + r, x - r * 0.72, y + r]); q.fillStyle = lin(q, x - r, 0, x + r, 0, shade(col, 0.15), shade(col, -0.15)); q.fill(); ol(q, 3);
    q.beginPath(); q.ellipse(x, y - r * 0.8, r, r * 0.24, 0, 0, TAU); q.fillStyle = full ? WATER : shade(col, -0.4); q.fill(); ol(q, 2.5);
  }
  function eye(q, x, y, r) {
    q.beginPath(); q.moveTo(x - r, y); q.quadraticCurveTo(x, y - r * 1.1, x + r, y); q.quadraticCurveTo(x, y + r * 1.1, x - r, y); q.closePath(); q.fillStyle = '#fff'; q.fill(); ol(q, 2.5);
    q.beginPath(); q.arc(x, y, r * 0.38, 0, TAU); q.fillStyle = NAVY; q.fill();
  }
  // an angle that glides to where it should be (pipes turning, clock hands)
  function glide(key, target) {
    var cur = ui.ang[key], d;
    if (cur === undefined) { ui.ang[key] = target; return target; }
    d = ((target - cur) % TAU + TAU) % TAU; if (d > Math.PI) d -= TAU;
    cur += Math.abs(d) < 0.01 ? d : d * 0.3;
    ui.ang[key] = cur;
    return cur;
  }

  // ---------- things to tap ----------
  function reg(id, x, y, w, h, o) { ctls.push({ id: id, x: T.x + x * T.s, y: T.y + y * T.s, w: w * T.s, h: h * T.s, msg: o.msg || null, local: o.local || null }); }
  // A chunky push button. Draws it, remembers where it is for taps, and returns how far it is pushed in.
  function button(q, id, x, y, w, h, fill, o) {
    o = o || {};
    var dn = Date.now() - (ui.press[id] || 0) < 170 ? 3 : 0, r = o.r || 14;
    rr(q, x, y + 4, w, h - 4, r); q.fillStyle = shade(fill, -0.4); q.fill(); ol(q, 3);
    rr(q, x, y + dn, w, h - 5, r); q.fillStyle = lin(q, 0, y, 0, y + h, shade(fill, 0.2), fill); q.fill(); ol(q, 3);
    rr(q, x + 4, y + dn + 4, w - 8, (h - 5) * 0.36, r - 4); q.fillStyle = 'rgba(255,255,255,0.25)'; q.fill();
    if (o.off) { rr(q, x, y + dn, w, h - 5, r); q.fillStyle = 'rgba(255,243,214,0.6)'; q.fill(); }
    reg(id, x, y, w, h, o);
    return dn;
  }

  // ---------- the puzzle devices: size(pub) in design pixels, draw(q, pub, room, now, done) ----------
  var DEV = {};
  function dialW(n) { return n >= 4 ? 78 : n === 3 ? 100 : 124; }
  DEV.dials = {
    size: function (pub) { return { w: pub.vals.length * dialW(pub.vals.length), h: 318 }; },
    draw: function (q, pub, room, now, done) {
      var n = pub.vals.length, cw = dialW(n), i, x, w, cx, hd, dn;
      for (i = 0; i < n; i++) {
        x = i * cw + 4; w = cw - 8; cx = x + w / 2; hd = pub.heads[i];
        if (hd.s !== undefined) shape(q, hd.s, cx, 20, 15, COLS[hd.s]);            // count this shape
        else if (hd.lock) padlock(q, cx, 22, 14, COLS[hd.c]);                       // the key for this lock
        else { rr(q, cx - 17, 4, 34, 32, 10); q.fillStyle = COLS[hd.c]; q.fill(); ol(q, 3); }   // the digit of this colour
        dn = button(q, 'dial' + i + 'u', x, 44, w, 54, '#FFFFFF', { msg: { a: 'dial', i: i, d: 1 }, off: !!pub.fix[i] });
        tri(q, cx, 69 + dn, 13, 0);
        rr(q, x, 104, w, 80, 14); q.fillStyle = done || pub.fix[i] ? '#C9F2D0' : '#FFFFFF'; q.fill();
        q.save(); rr(q, x, 104, w, 80, 14); q.clip(); q.fillStyle = lin(q, 0, 104, 0, 124, 'rgba(27,42,73,0.20)', 'rgba(27,42,73,0)'); q.fillRect(x, 104, w, 20); q.restore();
        rr(q, x, 104, w, 80, 14); ol(q, 3.5);
        text(q, String(pub.vals[i]), cx, 147, 58, NAVY, 700);
        if (pub.fix[i]) padlock(q, x + w - 14, 120, 7, GREEN);
        dn = button(q, 'dial' + i + 'd', x, 190, w, 54, '#FFFFFF', { msg: { a: 'dial', i: i, d: -1 }, off: !!pub.fix[i] });
        tri(q, cx, 214 + dn, 13, 2);
      }
      dn = button(q, 'check', 4, 256, n * cw - 8, 62, GREEN, { msg: { a: 'check' } });
      tick(q, n * cw / 2, 284 + dn, 15);
    }
  };
  DEV.seq = {
    size: function () { return { w: 300, h: 306 }; },
    draw: function (q, pub, room, now) {
      var len = pub.len, n = pub.n, gap = 300 / len, r = Math.min(20, gap / 2 - 4), per = n > 4 ? 3 : 2, bw = (300 - (per - 1) * 8) / per, bh = 84, i, cx, bx, by, dn;
      rr(q, 0, 0, 300, 58, 16); q.fillStyle = '#2A3558'; q.fill(); ol(q, 3);        // the row that fills up
      for (i = 0; i < len; i++) {
        cx = gap * (i + 0.5);
        if (i < pub.got.length) token(q, pub.got[i], cx, 29, r);
        else if (pub.fix[i] >= 0) { q.globalAlpha = 0.5 + 0.2 * Math.sin(now / 220); token(q, pub.fix[i], cx, 29, r); q.globalAlpha = 1; }
        else { q.beginPath(); q.arc(cx, 29, r - 3, 0, TAU); q.fillStyle = '#151D38'; q.fill(); q.lineWidth = 2; q.strokeStyle = '#56618F'; q.stroke(); }
      }
      for (i = 0; i < n; i++) {
        bx = (i % per) * (bw + 8); by = 68 + Math.floor(i / per) * (bh + 8);
        dn = button(q, 'col' + i, bx, by, bw, bh, COLS[i], { msg: { a: 'press', c: i } });
        shape(q, i, bx + bw / 2, by + bh / 2 - 3 + dn, 20, '#FFFFFF');
      }
      dn = button(q, 'back', 0, 252, 300, 54, '#FFFFFF', { msg: { a: 'back' }, off: !pub.got.length });
      undoIcon(q, 150, 275 + dn, 12);
    }
  };
  DEV.scale = {
    size: function () { return { w: 304, h: 324 }; },
    draw: function (q, pub, room, now, done) {
      var px = 152, py = 30, arm = 94, a = ui.ang.scale || 0, want = done ? 0 : pub.tip * 0.14, i, n, bw, dn, total = 0, s, size;
      a += (want - a) * 0.15; ui.ang.scale = a;
      rr(q, 0, 0, 304, 170, 14); q.fillStyle = lin(q, 0, 0, 0, 170, '#DDF1FF', '#F4FBFF'); q.fill(); ol(q, 3);
      poly(q, [px - 40, 164, px + 40, 164, px + 26, 148, px - 26, 148]); q.fillStyle = '#8A93A8'; q.fill(); ol(q, 3);
      rr(q, px - 6, py, 12, 122, 4); q.fillStyle = lin(q, px - 6, 0, px + 6, 0, '#C3C9D2', '#7A8296'); q.fill(); ol(q, 3);
      var lx = px - Math.cos(a) * arm, ly = py - Math.sin(a) * arm, rx = px + Math.cos(a) * arm, ry = py + Math.sin(a) * arm;
      q.beginPath(); q.moveTo(lx, ly); q.lineTo(rx, ry); q.lineCap = 'round'; q.lineWidth = 12; q.strokeStyle = NAVY; q.stroke(); q.lineWidth = 6; q.strokeStyle = done ? GREEN : YEL; q.stroke();
      q.beginPath(); q.arc(px, py, 9, 0, TAU); q.fillStyle = '#FF7A45'; q.fill(); ol(q, 3);
      function pan(x, y) {
        q.beginPath(); q.moveTo(x, y); q.lineTo(x - 50, y + 56); q.moveTo(x, y); q.lineTo(x + 50, y + 56); q.lineWidth = 2.5; q.strokeStyle = NAVY; q.stroke();
        poly(q, [x - 57, y + 56, x + 57, y + 56, x + 44, y + 70, x - 44, y + 70]); q.fillStyle = lin(q, 0, y + 56, 0, y + 70, '#E3B36F', '#B77B45'); q.fill(); ol(q, 3);
      }
      pan(lx, ly); pan(rx, ry);
      // the objects on the left: every one is drawn, so they can be counted
      var objs = [];
      pub.left.forEach(function (o) { for (var k = 0; k < o.n; k++) objs.push(o.s); });
      objs.forEach(function (sh, k) { var row = Math.floor(k / 5), cnt = Math.min(5, objs.length - row * 5); shape(q, sh, lx - (cnt - 1) * 11 + (k % 5) * 22, ly + 43 - row * 23, 10.5, COLS[sh], 2.5); });
      if (pub.goal) api.label(q, '= ' + pub.goal, lx, ly + 100, YEL, NAVY, 16);
      // the weights on the right
      pub.pan.forEach(function (wv, k) { var row = Math.floor(k / 4), cnt = Math.min(4, pub.pan.length - row * 4); weight(q, rx - (cnt - 1) * 13 + (k % 4) * 26, ry + 42 - row * 26, 24, wv); total += wv; });
      // the sum of the weights, so adding happens while playing
      s = pub.pan.length ? pub.pan.join(' + ') + ' = ' + total : '0';
      q.font = '700 22px ' + FONT; size = Math.min(22, 22 * 292 / Math.max(1, q.measureText(s).width));
      text(q, s, 152, 188, size, NAVY, 700);
      n = pub.ws.length; bw = (304 - (n - 1) * 8) / n;
      for (i = 0; i < n; i++) {
        dn = button(q, 'w' + pub.ws[i], i * (bw + 8), 204, bw, 54, '#FFFFFF', { msg: { a: 'add', w: pub.ws[i] }, off: pub.pan.length >= 8 });
        text(q, '+', i * (bw + 8) + bw / 2 - 20, 229 + dn, 24, NAVY, 700);
        weight(q, i * (bw + 8) + bw / 2 + 8, 230 + dn, 32, pub.ws[i]);
      }
      dn = button(q, 'undo', 0, 266, 96, 58, '#FFFFFF', { msg: { a: 'undo' }, off: !pub.pan.length });
      undoIcon(q, 48, 291 + dn, 12);
      dn = button(q, 'check', 104, 266, 200, 58, GREEN, { msg: { a: 'check' } });
      tick(q, 204, 292 + dn, 15);
    }
  };
  DEV.cells = {
    geo: function (pub) {
      var grid = pub.kind === 'grid', cell = grid ? (pub.cols > 4 ? 50 : 58) : (pub.cols > 3 ? 68 : 86), head = grid ? 44 : 0;
      return { cell: cell, head: head, w: head + pub.cols * cell, h: head + pub.rows * cell };
    },
    size: function (pub) { var G = this.geo(pub); return { w: G.w, h: G.h + 66 }; },
    draw: function (q, pub, room, now, done) {
      var G = this.geo(pub), c = G.cell, kind = pub.kind, i, x, y, cx, cy, dn, on, fix, gems = 0, by = G.h + 8;
      rr(q, G.head - 3, G.head - 3, pub.cols * c + 6, pub.rows * c + 6, 12); q.fillStyle = kind === 'grid' ? '#C99A5B' : '#27356B'; q.fill(); ol(q, 3);
      if (kind === 'grid') {
        for (i = 0; i < pub.cols; i++) { q.beginPath(); q.arc(G.head + (i + 0.5) * c, 20, 16, 0, TAU); q.fillStyle = NAVY; q.fill(); text(q, String(i + 1), G.head + (i + 0.5) * c, 21, 21, '#fff', 700); }
        for (i = 0; i < pub.rows; i++) shape(q, pub.rowS[i], 20, G.head + (i + 0.5) * c, 13.5, COLS[pub.rowS[i]], 2.5);
      }
      for (i = 0; i < pub.on.length; i++) {
        x = G.head + (i % pub.cols) * c; y = G.head + Math.floor(i / pub.cols) * c; cx = x + c / 2; cy = y + c / 2;
        on = pub.on[i]; fix = pub.fix[i]; dn = Date.now() - (ui.press['c' + i] || 0) < 170 ? 2 : 0;
        if (kind === 'memory') {
          rr(q, x + 4, y + 4 + dn, c - 8, c - 8, 12); q.fillStyle = fix || (done && on) ? GREEN : on ? YEL : '#4C5FA8'; q.fill(); ol(q, 3);
          rr(q, x + 9, y + 9 + dn, c - 18, (c - 18) * 0.34, 7); q.fillStyle = 'rgba(255,255,255,0.22)'; q.fill();
          if (fix) padlock(q, cx, cy + dn, 9, '#fff');
        } else if (kind === 'lights') {
          rr(q, x + 4, y + 4 + dn, c - 8, c - 8, 12); q.fillStyle = on ? '#52609A' : '#3A4570'; q.fill(); ol(q, 3);
          bulb(q, cx, cy + dn - 2, c * 0.36, on);
          if (pub.tip === i) { q.beginPath(); q.arc(cx, cy, c * 0.4 + 3 * Math.sin(now / 150), 0, TAU); q.lineWidth = 5; q.strokeStyle = '#FF7A45'; q.setLineDash([9, 7]); q.stroke(); q.setLineDash([]); }
        } else {   // a patch of sand: a flag where somebody wants to dig, a gem where one was found
          rr(q, x + 3, y + 3 + dn, c - 6, c - 6, 8); q.fillStyle = ((i % pub.cols) + Math.floor(i / pub.cols)) % 2 ? '#F6E2A8' : '#EFD592'; q.fill(); q.lineWidth = 2; q.strokeStyle = 'rgba(27,42,73,0.35)'; q.stroke();
          if (fix || (done && on)) gem(q, cx, cy + dn, c * 0.3, gems++, false);
          else if (on) flag(q, cx + 2, cy + dn, c * 0.28);
        }
        reg('c' + i, x, y, c, c, { msg: { a: 'cell', i: i } });
      }
      if (kind === 'lights') { dn = button(q, 'reset', 0, by, G.w, 58, '#FFFFFF', { msg: { a: 'reset' } }); undoIcon(q, G.w / 2, by + 25 + dn, 12); return; }
      dn = button(q, 'check', 0, by, G.w, 58, GREEN, { msg: { a: 'check' } });
      tick(q, G.w / 2, by + 26 + dn, 15);
      if (kind === 'grid') {   // how many flags are out
        var have = 0;
        pub.on.forEach(function (v) { if (v) have++; });
        for (i = 0; i < pub.max; i++) { q.globalAlpha = i < have ? 1 : 0.3; flag(q, 26 + i * 24, by + 27 + dn, 11); }
        q.globalAlpha = 1;
      }
    }
  };
  DEV.clock = {
    size: function () { return { w: 304, h: 344 }; },
    draw: function (q, pub, room, now, done) {
      var cx = 152, cy = 106, R = 102, i, a, dn, day = pub.day;
      q.beginPath(); q.arc(cx + 3, cy + 5, R + 3, 0, TAU); q.fillStyle = 'rgba(27,42,73,0.25)'; q.fill();
      q.beginPath(); q.arc(cx, cy, R, 0, TAU); q.fillStyle = day ? lin(q, 0, cy - R, 0, cy + R, '#FFF6C9', '#BDE9FF') : lin(q, 0, cy - R, 0, cy + R, '#1F2B5C', '#4C5FA8'); q.fill();
      q.lineWidth = 6; q.strokeStyle = done ? '#2E9E4F' : NAVY; q.stroke();
      if (day) sun(q, cx, cy + 46, 13, now); else { moon(q, cx, cy + 46, 15); q.fillStyle = '#fff'; [[-52, -30, 3], [48, -44, 2.5], [-30, 50, 2.5], [60, 20, 3]].forEach(function (o) { api.starPath(q, cx + o[0], cy + o[1], o[2] * 2); q.fill(); }); }
      for (i = 1; i <= 12; i++) { a = i * TAU / 12 - Math.PI / 2; text(q, String(i), cx + Math.cos(a) * (R - 17), cy + Math.sin(a) * (R - 17) + 1, 19, day ? NAVY : '#fff', 700); }
      hand(q, cx, cy, glide('cm', pub.m * TAU / 12), 72, 6, '#3B82F6');
      hand(q, cx, cy, glide('ch', pub.h * TAU / 12), 46, 10, '#FF4F6D');
      q.beginPath(); q.arc(cx, cy, 8, 0, TAU); q.fillStyle = NAVY; q.fill();
      [0, 1].forEach(function (which) {   // the short red hand, the long blue hand: one step back, one step on
        var x0 = which * 158, col = which ? '#3B82F6' : '#FF4F6D', fixed = !!pub.fix[which], mx = x0 + 73;
        dn = button(q, 'h' + which + 'd', x0, 220, 50, 56, '#FFFFFF', { msg: { a: 'hand', which: which, d: -1 }, off: fixed }); tri(q, x0 + 25, 245 + dn, 12, 3);
        q.beginPath(); q.arc(mx, 246, 20, 0, TAU); q.fillStyle = fixed ? '#C9F2D0' : '#fff'; q.fill(); ol(q, 2.5);
        hand(q, mx, 251, 0, which ? 17 : 10, which ? 3.5 : 6, col);
        dn = button(q, 'h' + which + 'u', x0 + 96, 220, 50, 56, '#FFFFFF', { msg: { a: 'hand', which: which, d: 1 }, off: fixed }); tri(q, x0 + 121, 245 + dn, 12, 1);
      });
      dn = button(q, 'sky', 0, 286, 96, 58, day ? '#BDE9FF' : '#34427A', { msg: { a: 'sky' }, off: !!pub.fix[2] });
      if (day) sun(q, 48, 312 + dn, 11, 0); else moon(q, 48, 312 + dn, 14);
      dn = button(q, 'check', 104, 286, 200, 58, GREEN, { msg: { a: 'check' } });
      tick(q, 204, 312 + dn, 15);
    }
  };
  DEV.pipes = {
    geo: function (pub) { var c = pub.cols > 4 ? 50 : 62; return { c: c, l: 30, w: 64 + pub.cols * c, h: pub.rows * c }; },
    size: function (pub) { var G = this.geo(pub); return { w: G.w, h: G.h }; },
    draw: function (q, pub, room, now, done) {
      var G = this.geo(pub), c = G.c, rev = (done && room.reveal) || {}, wet = {}, i, x, y, row, pw = Math.round(c * 0.36), type, full;
      (rev.wet || []).forEach(function (j) { wet[j] = 1; });
      rr(q, G.l - 3, -3, pub.cols * c + 6, G.h + 6, 10); q.fillStyle = '#BFD9E6'; q.fill(); ol(q, 3);
      for (row = 0; row < pub.rows; row++) {
        y = row * c + c / 2; x = G.l + pub.cols * c;
        rr(q, 2, y - 9, G.l - 3, 18, 4); q.fillStyle = rev.tap === row ? WATER : '#9AA7B8'; q.fill(); ol(q, 3);       // the tap of this row
        q.beginPath(); q.arc(12, y - 13, 9.5, 0, TAU); q.fillStyle = COLS[row]; q.fill(); ol(q, 3);
        q.beginPath(); q.arc(12, y - 13, 3, 0, TAU); q.fillStyle = '#fff'; q.fill();
        rr(q, x + 2, y - 8, 9, 16, 3); q.fillStyle = rev.pail === row ? WATER : '#9AA7B8'; q.fill(); ol(q, 2.5);         // the spout and the bucket
        pail(q, x + 19, y + 10, 12, COLS[row], rev.pail === row);
      }
      for (i = 0; i < pub.tiles.length; i++) {
        x = G.l + (i % pub.cols) * c; y = Math.floor(i / pub.cols) * c; type = pub.tiles[i]; full = !!wet[i];
        rr(q, x + 2, y + 2, c - 4, c - 4, 8); q.fillStyle = pub.fix[i] ? '#C9F2D0' : '#EEF6FA'; q.fill(); q.lineWidth = 2; q.strokeStyle = 'rgba(27,42,73,0.28)'; q.stroke();
        q.save(); q.translate(x + c / 2, y + c / 2); q.rotate(glide('p' + i, pub.rot[i] * Math.PI / 2));
        q.beginPath();
        if (type === 0) { q.moveTo(0, -c / 2 + 1); q.lineTo(0, c / 2 - 1); }
        else if (type === 1) { q.moveTo(0, -c / 2 + 1); q.quadraticCurveTo(0, 0, c / 2 - 1, 0); }
        else { q.moveTo(0, -c / 2 + 1); q.lineTo(0, c / 2 - 1); q.moveTo(0, 0); q.lineTo(c / 2 - 1, 0); }
        q.lineCap = 'butt'; q.lineJoin = 'round';
        q.lineWidth = pw; q.strokeStyle = NAVY; q.stroke();
        q.lineWidth = pw - 6; q.strokeStyle = full ? WATER : pub.fix[i] ? '#7FB98D' : '#A9B4C4'; q.stroke();
        if (full) { q.setLineDash([5, 9]); q.lineDashOffset = -now / 45; q.lineWidth = 4; q.strokeStyle = 'rgba(255,255,255,0.8)'; q.stroke(); q.setLineDash([]); }
        else { q.lineWidth = 2.5; q.strokeStyle = 'rgba(255,255,255,0.45)'; q.stroke(); }
        q.restore();
        reg('t' + i, x, y, c, c, { msg: { a: 'rot', i: i } });
      }
    }
  };

  // ---------- the clue cards (220 x 300 design pixels; the top 42 are a coloured strip) ----------
  function slotIcon(q, x, y, slot, of) {   // which dial this clue is for: its place in the row and its colour
    for (var i = 0; i < of; i++) {
      var on = i === slot, r = on ? 10 : 6.5, cx = x + 9 + i * 21;
      rr(q, cx - r, y - r, r * 2, r * 2, on ? 5 : 4); q.fillStyle = on ? COLS[slot] : '#FFFFFF'; q.fill(); ol(q, on ? 3 : 2);
    }
  }
  function rowDots(q, row, rows) {   // which row (pipes): the colours of the rows from top to bottom
    for (var i = 0; i < rows; i++) {
      q.beginPath(); q.arc(196, 150 + (i - (rows - 1) / 2) * 30, i === row ? 12 : 7, 0, TAU);
      q.globalAlpha = i === row ? 1 : 0.4; q.fillStyle = COLS[i]; q.fill(); ol(q, i === row ? 3.5 : 2); q.globalAlpha = 1;
    }
  }
  var CARD = {
    sum: function (q, cd) {
      slotIcon(q, 14, 23, cd.slot, cd.of);
      var s = cd.text;
      text(q, s, 110, 118, s.length <= 6 ? 56 : s.length <= 9 ? 44 : 34, NAVY, 700);
      text(q, '=', 50, 214, 46, NAVY, 700);
      rr(q, 82, 174, 86, 82, 14); q.fillStyle = '#fff'; q.fill(); ol(q, 3.5);
      text(q, '?', 125, 217, 52, COLS[cd.slot], 700);
    },
    cnt: function (q, cd) {
      slotIcon(q, 14, 23, cd.slot, cd.of);
      shape(q, cd.s, 172, 23, 10, COLS[cd.s], 2.5); text(q, '?', 197, 24, 22, NAVY, 700);     // how many of these?
      cd.items.forEach(function (it) { shape(q, it[0], 18 + it[1] * 184, 56 + it[2] * 232, 14, COLS[it[0]]); });
    },
    pic: function (q, cd) {
      q.beginPath(); q.arc(26, 23, 13, 0, TAU); q.fillStyle = NAVY; q.fill(); text(q, String(cd.n + 1), 26, 24, 18, '#fff', 700);
      eye(q, 190, 23, 12);
      var k, sy;
      rr(q, 8, 50, 204, 242, 12); q.fillStyle = lin(q, 0, 50, 0, 292, '#C98A4B', '#9A6236'); q.fill(); ol(q, 3.5);      // a cupboard with four shelves
      rr(q, 18, 59, 184, 224, 6); q.fillStyle = '#FBE9C4'; q.fill(); ol(q, 2.5);
      for (k = 0; k < 4; k++) {
        sy = 59 + k * 56;
        q.fillStyle = 'rgba(27,42,73,0.10)'; q.fillRect(19.5, sy + 1, 181, 9);
        if (k < 3) { rr(q, 16, sy + 50, 188, 8, 3); q.fillStyle = '#B77B45'; q.fill(); ol(q, 2.5); }
      }
      cd.items.forEach(function (it) {   // the things stand on the shelves
        var row = Math.min(3, Math.floor(it[2] * 4));
        shape(q, it[0], 31 + it[1] * 158, 59 + row * 56 + (row < 3 ? 36 : 40), 12, COLS[it[0]]);
      });
    },
    seq: function (q, cd) {
      var i, on;
      for (i = 0; i < cd.of; i++) {   // where in the row these two belong
        on = i >= cd.from && i < cd.from + cd.items.length;
        q.beginPath(); q.arc(18 + i * 15, 23, on ? 6.5 : 4, 0, TAU); q.fillStyle = on ? NAVY : 'rgba(27,42,73,0.3)'; q.fill();
      }
      rr(q, 12, 56, 196, 232, 10); q.fillStyle = lin(q, 0, 56, 0, 288, '#C98A4B', '#9A6236'); q.fill(); ol(q, 3.5);   // a painting in its frame
      rr(q, 26, 70, 168, 204, 5); q.fillStyle = '#FFFDF4'; q.fill(); ol(q, 2.5);
      cd.items.forEach(function (c, k) {
        var cx = 68 + k * 84;
        q.beginPath(); q.arc(cx, 108, 18, 0, TAU); q.fillStyle = NAVY; q.fill(); text(q, String(cd.from + k + 1), cx, 109, 23, '#fff', 700);
        tri(q, cx, 142, 7, 2);
        token(q, c, cx, 204, 36);
      });
    },
    hole: function (q, cd) {
      var col = COLS[cd.slot], n = cd.teeth.length, u = n > 3 ? 9 : 11;
      slotIcon(q, 14, 23, cd.slot, cd.of);
      q.beginPath(); q.arc(110, 114, 44, Math.PI, 0); q.lineTo(154, 142); q.moveTo(66, 114); q.lineTo(66, 142);
      q.lineCap = 'butt'; q.lineWidth = 22; q.strokeStyle = NAVY; q.stroke(); q.lineWidth = 14; q.strokeStyle = '#C3C9D2'; q.stroke();
      rr(q, 30, 134, 160, 150, 20); q.fillStyle = lin(q, 0, 134, 0, 284, shade(col, 0.18), shade(col, -0.08)); q.fill(); ol(q, 4);
      rr(q, 46, 154, 128, 110, 12); q.fillStyle = '#F4F7FB'; q.fill(); ol(q, 3);
      keyShape(q, 110 - (n * u * 2.2 + u) / 2, 182, cd.teeth, u, NAVY);       // the outline of the key that fits
    },
    rack: function (q, cd) {
      var n = cd.keys.length, rowH = Math.min(80, 248 / n), i;
      q.beginPath(); q.arc(24, 23, 9, 0, TAU); q.lineWidth = 4.5; q.strokeStyle = NAVY; q.stroke();
      for (i = 0; i < n; i++) {
        var k = cd.keys[i], nt = k.teeth.length, u = nt > 3 ? 7.5 : 9, y = 48 + rowH * (i + 0.5) - u * 1.2, x = 94;
        if (i) { q.beginPath(); q.moveTo(14, 48 + rowH * i); q.lineTo(206, 48 + rowH * i); q.lineWidth = 2; q.strokeStyle = 'rgba(27,42,73,0.15)'; q.stroke(); }
        q.beginPath(); q.arc(30, y + u * 1.2, 18, 0, TAU); q.fillStyle = NAVY; q.fill(); text(q, String(k.n), 30, y + u * 1.2 + 1, 24, '#fff', 700);
        keyShape(q, x, y, k.teeth, u, '#FFC933'); ol(q, 3);
        q.beginPath(); q.arc(x - u * 1.5, y, u * 1.9, 0, TAU); q.fillStyle = '#FFC933'; q.fill(); ol(q, 3);
        q.beginPath(); q.arc(x - u * 1.8, y, u * 0.65, 0, TAU); q.fillStyle = CREAM; q.fill(); ol(q, 2.5);
      }
    },
    weigh: function (q, cd) {
      weight(q, 26, 26, 22, '');
      shape(q, cd.s, 58, 166, 38, COLS[cd.s], 4);
      text(q, '=', 116, 168, 46, NAVY, 700);
      weight(q, 170, 170, 66, cd.w);
    },
    flash: function (q, cd, now) {
      var key = 'f' + cd.i, n = cd.size, c = Math.min(56, 176 / n), gx = 110 - n * c / 2, gy = 52, i, x, y, k, lit, dn;
      if (!ui.flash[key]) ui.flash[key] = now + 700;      // the first look comes by itself
      k = (now - ui.flash[key]) / cd.ms; lit = k >= 0 && k < 1;
      eye(q, 26, 23, 13);
      rr(q, gx - 5, gy - 5, n * c + 10, n * c + 10, 12); q.fillStyle = '#27356B'; q.fill(); ol(q, 3);
      for (i = 0; i < n * n; i++) {
        x = gx + (i % n) * c; y = gy + Math.floor(i / n) * c;
        rr(q, x + 3, y + 3, c - 6, c - 6, 9); q.fillStyle = lit && cd.cells.indexOf(i) >= 0 ? YEL : '#4C5FA8'; q.fill(); ol(q, 2.5);
      }
      if (lit) { rr(q, gx, gy + n * c + 9, n * c * (1 - k), 7, 3.5); q.fillStyle = '#FF7A45'; q.fill(); }
      dn = button(q, 'eye' + cd.i, 50, 244, 120, 52, YEL, { off: lit, local: function () { if (Date.now() - ui.flash[key] > cd.ms + 300) ui.flash[key] = Date.now() + 150; } });
      eye(q, 110, 267 + dn, 17);
    },
    gcol: function (q, cd) {
      var k;
      gem(q, 28, 22, 13, cd.gem, true);
      if (cd.text) text(q, cd.text, 110, 98, cd.text.length > 6 ? 38 : 48, NAVY, 700);
      else { rr(q, 70, 56, 80, 80, 16); q.fillStyle = '#fff'; q.fill(); ol(q, 3.5); pips(q, 110, 96, 20, cd.n); }
      q.beginPath(); q.moveTo(110, 144); q.lineTo(110, 160); q.lineWidth = 7; q.strokeStyle = NAVY; q.lineCap = 'round'; q.stroke(); tri(q, 110, 166, 13, 2);   // down the column
      for (k = 0; k < 3; k++) { q.globalAlpha = 1 - k * 0.28; rr(q, 86, 186 + k * 35, 48, 31, 7); q.fillStyle = '#F3DDA0'; q.fill(); ol(q, 2.5); }
      q.globalAlpha = 1;
    },
    grow: function (q, cd) {
      var k;
      gem(q, 28, 22, 13, cd.gem, true);
      shape(q, cd.s, 110, 108, 40, COLS[cd.s], 4);
      q.beginPath(); q.moveTo(22, 214); q.lineTo(40, 214); q.lineWidth = 8; q.strokeStyle = NAVY; q.lineCap = 'round'; q.stroke(); tri(q, 46, 214, 14, 1);      // along the row
      for (k = 0; k < 3; k++) { q.globalAlpha = 1 - k * 0.28; rr(q, 70 + k * 46, 192, 40, 44, 8); q.fillStyle = '#F3DDA0'; q.fill(); ol(q, 2.5); }
      q.globalAlpha = 1;
    },
    hand: function (q, cd) {
      var col = cd.which ? '#3B82F6' : '#FF4F6D', wd = cd.which ? 6 : 10, cx = 110, cy = 172, R = 94, i, a;
      q.beginPath(); q.moveTo(16, 23); q.lineTo(16 + (cd.which ? 44 : 24), 23); q.lineCap = 'round'; q.lineWidth = wd + 5; q.strokeStyle = NAVY; q.stroke(); q.lineWidth = wd; q.strokeStyle = col; q.stroke();
      if (cd.text) {   // Hard: the number this hand points at is a sum
        q.beginPath(); q.moveTo(34, 104); q.lineTo(34 + (cd.which ? 78 : 46), 104); q.lineWidth = wd + 9; q.strokeStyle = NAVY; q.stroke(); q.lineWidth = wd + 4; q.strokeStyle = col; q.stroke();
        tri(q, 150, 104, 12, 1); text(q, '?', 186, 106, 46, col, 700);
        text(q, cd.text, 110, 206, cd.text.length > 6 ? 38 : 50, NAVY, 700);
        return;
      }
      q.beginPath(); q.arc(cx, cy, R, 0, TAU); q.fillStyle = '#fff'; q.fill(); ol(q, 4);      // Easy: a clock without numbers, count the marks
      for (i = 0; i < 12; i++) { a = i * TAU / 12 - Math.PI / 2; q.beginPath(); q.arc(cx + Math.cos(a) * (R - 13), cy + Math.sin(a) * (R - 13), i % 3 ? 3.5 : 5.5, 0, TAU); q.fillStyle = NAVY; q.fill(); }
      text(q, '12', cx, cy - R + 34, 18, NAVY, 700);
      hand(q, cx, cy, cd.n * TAU / 12, cd.which ? 68 : 44, wd, col);
      q.beginPath(); q.arc(cx, cy, 8, 0, TAU); q.fillStyle = NAVY; q.fill();
    },
    sky: function (q, cd, now) {
      sun(q, 26, 23, 7, 0); moon(q, 54, 23, 10);
      rr(q, 14, 56, 192, 232, 14); q.fillStyle = cd.day ? lin(q, 0, 56, 0, 288, '#7CCBF5', '#DFF3FF') : lin(q, 0, 56, 0, 288, '#141F45', '#3F4F94'); q.fill(); ol(q, 3.5);
      if (cd.day) {
        sun(q, 110, 156, 42, now);
        q.fillStyle = '#fff'; [[62, 244, 26], [92, 236, 32], [124, 246, 24]].forEach(function (o) { q.beginPath(); q.arc(o[0], o[1], o[2] * 0.6, 0, TAU); q.fill(); });
      } else {
        moon(q, 104, 160, 50);
        q.fillStyle = '#FFF0B8'; [[50, 90, 7], [170, 110, 9], [160, 230, 7], [60, 240, 6], [182, 176, 5]].forEach(function (o, k) { api.starPath(q, o[0], o[1], o[2] * (1 + 0.15 * Math.sin(now / 300 + k))); q.fill(); });
      }
    },
    lamps: function (q, cd) {
      var c = 62, gx = 17, gy = 78, i, row, x, y;
      bulb(q, 26, 23, 13, true);
      rr(q, gx - 6, gy - 6, 198, 198, 14); q.fillStyle = '#27356B'; q.fill(); ol(q, 3);
      for (i = 0; i < 9; i++) {
        row = Math.floor(i / 3); x = gx + (i % 3) * c; y = gy + row * c;
        rr(q, x + 3, y + 3, c - 6, c - 6, 10);
        if (row === cd.row) { q.fillStyle = cd.cells[i % 3] ? '#52609A' : '#3A4570'; q.fill(); ol(q, 2.5); bulb(q, x + c / 2, y + c / 2 - 2, c * 0.36, !!cd.cells[i % 3]); }
        else { q.fillStyle = '#34406E'; q.fill(); text(q, '?', x + c / 2, y + c / 2 + 1, 26, '#7482B8', 700); }
      }
    },
    tap: function (q, cd, now) {
      var col = COLS[cd.row], k, y;
      q.beginPath(); q.arc(26, 23, 11, 0, TAU); q.fillStyle = col; q.fill(); ol(q, 3);
      rowDots(q, cd.row, cd.rows);
      // the one tap that has water: a pipe, a round handle in its colour, drops falling
      q.beginPath(); q.moveTo(12, 150); q.lineTo(96, 150); q.quadraticCurveTo(130, 150, 130, 186);
      q.lineCap = 'butt'; q.lineWidth = 34; q.strokeStyle = NAVY; q.stroke(); q.lineWidth = 26; q.strokeStyle = '#A9B4C4'; q.stroke();
      q.lineWidth = 5; q.strokeStyle = 'rgba(255,255,255,0.5)'; q.beginPath(); q.moveTo(14, 143); q.lineTo(96, 143); q.stroke();
      rr(q, 64, 108, 14, 28, 4); q.fillStyle = '#7A8296'; q.fill(); ol(q, 3);
      q.beginPath(); q.arc(71, 100, 27, 0, TAU); q.fillStyle = lin(q, 0, 73, 0, 127, shade(col, 0.2), col); q.fill(); ol(q, 4);
      q.beginPath(); q.arc(71, 100, 9, 0, TAU); q.fillStyle = '#fff'; q.fill(); ol(q, 3);
      for (k = 0; k < 3; k++) {
        y = 194 + ((now / 9 + k * 32) % 96);
        q.beginPath(); q.moveTo(130, y - 11); q.quadraticCurveTo(140, y + 4, 130, y + 8); q.quadraticCurveTo(120, y + 4, 130, y - 11); q.closePath(); q.fillStyle = WATER; q.fill(); ol(q, 2.5);
      }
    },
    pail: function (q, cd, now) {
      var col = COLS[cd.row];
      pail(q, 26, 26, 11, col, false);
      rowDots(q, cd.row, cd.rows);
      q.beginPath(); q.ellipse(98, 256, 62, 12, 0, 0, TAU); q.fillStyle = 'rgba(27,42,73,0.16)'; q.fill();
      pail(q, 96, 190, 62, col, false);                       // the bucket that wants the water
      api.starPath(q, 96, 200, 24 + 2 * Math.sin(now / 260)); q.fillStyle = '#fff'; q.fill(); ol(q, 3);
    }
  };

  // ---------- the layout of one screen ----------
  function layout() {
    var pad = W < 900 ? 8 : 14, top = 68;
    var floorH = Math.round(clamp(H * 0.2, 90, 160));
    var cardW = Math.round(clamp(W * 0.29, 220, 380)), sideW = Math.round(clamp(W * 0.24, 184, 320)), dw;
    lay = { pad: pad, top: top, floorY: H - floorH, floorH: floorH,
      card: { x: pad, y: top, w: cardW, h: H - top - pad },
      dev: { x: pad * 2 + cardW, y: top + 4, w: W - cardW - sideW - pad * 4, h: H - top - pad - 10 },
      side: { x: W - sideW - pad, y: top, w: sideW, h: H - top - pad },
      av: clamp(H / 780, 0.62, 1), tag: clamp(H / 700, 0.72, 1) };
    dw = Math.round(clamp(sideW * 0.46, 86, 150));
    lay.door = { w: dw, h: Math.round(dw * 1.6), x: Math.round(lay.side.x + sideW / 2 - dw / 2) };
    lay.door.y = lay.floorY - lay.door.h;
  }
  function resize() {
    if (!root) return;
    W = root.clientWidth || window.innerWidth; H = root.clientHeight || window.innerHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    layout();
    bg.key = '';
  }

  // ---------- the room itself: painted once per theme and size, then reused as a picture ----------
  function paintRoom(q, th) {
    var fy = lay.floorY, S = lay.side, D = lay.door, i, x, y;
    q.fillStyle = lin(q, 0, 0, 0, fy, shade(th.wall, 0.16), shade(th.wall, -0.06)); q.fillRect(0, 0, W, fy);
    q.save(); q.beginPath(); q.rect(0, 0, W, fy); q.clip();
    if (th.pat === 'stripe') { q.fillStyle = 'rgba(255,255,255,0.17)'; for (x = 10; x < W; x += 64) q.fillRect(x, 0, 30, fy); }
    else if (th.pat === 'dots') { q.fillStyle = 'rgba(255,255,255,0.34)'; for (y = 20, i = 0; y < fy; y += 40, i++) for (x = (i % 2) * 25; x < W; x += 50) { q.beginPath(); q.arc(x, y, 5, 0, TAU); q.fill(); } }
    else if (th.pat === 'stars') { q.fillStyle = 'rgba(255,255,255,0.38)'; for (y = 24, i = 0; y < fy; y += 56, i++) for (x = 20 + (i % 2) * 40; x < W; x += 80) { api.starPath(q, x, y, 9); q.fill(); } }
    else if (th.pat === 'brick') { q.strokeStyle = 'rgba(27,42,73,0.13)'; q.lineWidth = 2; for (y = 0, i = 0; y < fy; y += 30, i++) { q.beginPath(); q.moveTo(0, y); q.lineTo(W, y); for (x = (i % 2) * 35; x < W; x += 70) { q.moveTo(x, y); q.lineTo(x, y + 30); } q.stroke(); } }
    else if (th.pat === 'diamond') { q.strokeStyle = 'rgba(255,255,255,0.34)'; q.lineWidth = 2; q.beginPath(); for (x = -fy; x < W + fy; x += 46) { q.moveTo(x, 0); q.lineTo(x + fy, fy); q.moveTo(x + fy, 0); q.lineTo(x, fy); } q.stroke(); }
    else { q.strokeStyle = 'rgba(255,255,255,0.36)'; q.lineWidth = 3; for (y = 26; y < fy; y += 38) { q.beginPath(); q.moveTo(0, y); for (x = 0; x <= W; x += 40) { q.quadraticCurveTo(x + 10, y - 9, x + 20, y); q.quadraticCurveTo(x + 30, y + 9, x + 40, y); } q.stroke(); } }
    q.restore();
    q.fillStyle = lin(q, 0, 0, 0, 120, 'rgba(27,42,73,0.34)', 'rgba(27,42,73,0)'); q.fillRect(0, 0, W, 120);          // shade under the ceiling
    // a string of little flags along the top of the wall
    var by = lay.top + 2, n = Math.ceil(W / 46) + 1, sag = function (xx) { return by + 9 * Math.abs(Math.sin(xx / 230 * Math.PI)); };
    q.beginPath(); for (i = 0; i <= n * 4; i++) { x = i * 11.5; if (i) q.lineTo(x, sag(x)); else q.moveTo(x, sag(x)); } q.lineWidth = 2.5; q.strokeStyle = NAVY; q.stroke();
    for (i = 0; i < n; i++) { x = 20 + i * 46; y = sag(x); poly(q, [x - 13, y, x + 13, y, x, y + 25]); q.fillStyle = COLS[i % 6]; q.fill(); ol(q, 2.5); }
    // a window above the door, where the wall is tall enough
    var wy0 = lay.top + 46, free = D.y - 62 - wy0;
    if (free > 86) {
      var ww = Math.min(S.w * 0.62, 156), wh = Math.min(free, 124), wx = S.x + S.w / 2 - ww / 2, wy = wy0 + (free - wh) / 2;
      rr(q, wx - 9, wy - 9, ww + 18, wh + 18, 14); q.fillStyle = '#fff'; q.fill(); ol(q, 4);
      rr(q, wx, wy, ww, wh, 8); q.fillStyle = lin(q, 0, wy, 0, wy + wh, '#7CCBF5', '#DFF3FF'); q.fill();
      q.save(); rr(q, wx, wy, ww, wh, 8); q.clip();
      q.fillStyle = '#fff'; [[0.3, 0.62, 17], [0.44, 0.52, 22], [0.6, 0.64, 16]].forEach(function (o) { q.beginPath(); q.arc(wx + ww * o[0], wy + wh * o[1], o[2], 0, TAU); q.fill(); });
      q.fillStyle = 'rgba(255,255,255,0.45)'; poly(q, [wx + ww * 0.62, wy + wh, wx + ww * 0.86, wy, wx + ww * 0.98, wy, wx + ww * 0.74, wy + wh]); q.fill();
      q.restore();
      rr(q, wx, wy, ww, wh, 8); ol(q, 2.5);
      q.beginPath(); q.moveTo(wx + ww / 2, wy); q.lineTo(wx + ww / 2, wy + wh); q.moveTo(wx, wy + wh / 2); q.lineTo(wx + ww, wy + wh / 2); q.lineWidth = 9; q.strokeStyle = NAVY; q.stroke(); q.lineWidth = 5; q.strokeStyle = '#fff'; q.stroke();
      poly(q, [wx - 16, wy + wh + 9, wx + ww + 16, wy + wh + 9, wx + ww + 24, wy + wh + 21, wx - 8, wy + wh + 21]); q.fillStyle = shade(th.wall, -0.36); q.fill(); ol(q, 3);
    }
    // skirting board, floor boards that run towards the back wall
    q.fillStyle = shade(th.wall, -0.3); q.fillRect(0, fy - 16, W, 16);
    q.fillStyle = 'rgba(255,255,255,0.28)'; q.fillRect(0, fy - 16, W, 3);
    q.fillStyle = NAVY; q.fillRect(0, fy - 19, W, 3);
    q.fillStyle = lin(q, 0, fy, 0, H, shade(th.floor, -0.14), shade(th.floor, 0.12)); q.fillRect(0, fy, W, H - fy);
    q.strokeStyle = 'rgba(27,42,73,0.17)'; q.lineWidth = 2;
    for (i = -16; i <= 16; i++) { q.beginPath(); q.moveTo(W / 2 + i * W / 18, fy); q.lineTo(W / 2 + i * W / 18 * 2.2, H); q.stroke(); }
    [0.2, 0.55].forEach(function (k) { q.beginPath(); q.moveTo(0, fy + lay.floorH * k); q.lineTo(W, fy + lay.floorH * k); q.stroke(); });
    q.fillStyle = lin(q, 0, fy, 0, fy + 24, 'rgba(27,42,73,0.30)', 'rgba(27,42,73,0)'); q.fillRect(0, fy, W, 24);
    q.fillStyle = NAVY; q.fillRect(0, fy - 1.5, W, 3);
    // the rug where the family waits by the door
    var rx = S.x + S.w / 2, ry = fy + lay.floorH * 0.62;
    q.beginPath(); q.ellipse(rx, ry, S.w * 0.5, lay.floorH * 0.36, 0, 0, TAU); q.fillStyle = th.rug; q.fill(); ol(q, 3);
    q.beginPath(); q.ellipse(rx, ry, S.w * 0.5 - 9, lay.floorH * 0.36 - 7, 0, 0, TAU); q.setLineDash([9, 8]); q.lineWidth = 2.5; q.strokeStyle = 'rgba(255,255,255,0.85)'; q.stroke(); q.setLineDash([]);
    // a plant in a pot beside the door
    q.save(); q.translate(S.x + S.w - 16 * lay.av, fy + 6); q.scale(lay.av * 1.1, lay.av * 1.1);
    q.beginPath(); q.ellipse(10, 2, 34, 8, 0, 0, TAU); q.fillStyle = 'rgba(22,48,66,0.22)'; q.fill();
    var L = [[-17, -64, 16], [16, -66, 17], [0, -88, 20], [-1, -58, 15]];
    q.strokeStyle = NAVY; q.lineWidth = 7; L.forEach(function (o) { q.beginPath(); q.arc(o[0], o[1], o[2], 0, TAU); q.stroke(); });
    q.fillStyle = '#2F8548'; L.forEach(function (o) { q.beginPath(); q.arc(o[0], o[1], o[2], 0, TAU); q.fill(); });
    q.fillStyle = '#49A862'; L.forEach(function (o) { q.beginPath(); q.arc(o[0] - 4, o[1] - 5, o[2] - 7, 0, TAU); q.fill(); });
    poly(q, [-20, -42, 20, -42, 14, 0, -14, 0]); q.fillStyle = lin(q, -20, 0, 20, 0, '#EE9A66', '#B5562B'); q.fill(); ol(q, 3);
    rr(q, -24, -48, 48, 12, 4); q.fillStyle = '#F2A777'; q.fill(); ol(q, 3);
    q.restore();
    // the corners of the room are a little darker
    q.fillStyle = lin(q, 0, 0, 70, 0, 'rgba(27,42,73,0.22)', 'rgba(27,42,73,0)'); q.fillRect(0, 0, 70, H);
    q.fillStyle = lin(q, W - 70, 0, W, 0, 'rgba(27,42,73,0)', 'rgba(27,42,73,0.22)'); q.fillRect(W - 70, 0, 70, H);
  }
  function roomSprite(ti) {
    var key = ti + ':' + W + 'x' + H + '@' + dpr;
    if (bg.key !== key || !bg.cv) {
      var s = bg.cv || document.createElement('canvas'), q;
      s.width = Math.round(W * dpr); s.height = Math.round(H * dpr);
      q = s.getContext('2d'); q.setTransform(dpr, 0, 0, dpr, 0, 0); q.lineJoin = 'round'; q.lineCap = 'round';
      paintRoom(q, THEMES[ti]);
      bg.key = key; bg.cv = s;
    }
    return bg.cv;
  }

  // ---------- the door ----------
  function drawDoor(th, k, now, num) {   // k: 0 shut ... 1 wide open
    var D = lay.door, x = D.x, y = D.y, w = D.w, h = D.h, lw, sk, i, a;
    rrTop(g, x - 10, y - 10, w + 20, h + 10, 18); g.fillStyle = '#FFF8E8'; g.fill(); ol(g, 4);
    rrTop(g, x, y, w, h, 10); g.fillStyle = k > 0 ? lin(g, 0, y, 0, y + h, '#FFFFFF', '#FFE27A') : '#1B2A49'; g.fill(); ol(g, 3);
    if (k > 0) {   // light falls out of the next room
      g.save(); rrTop(g, x, y, w, h, 10); g.clip(); g.globalAlpha = 0.5 * k; g.fillStyle = '#fff';
      for (i = 0; i < 6; i++) { a = i * TAU / 6 + now / 2600; poly(g, [x + w / 2, y + h * 0.55, x + w / 2 + Math.cos(a) * h, y + h * 0.55 + Math.sin(a) * h, x + w / 2 + Math.cos(a + 0.28) * h, y + h * 0.55 + Math.sin(a + 0.28) * h]); g.fill(); }
      g.restore(); g.globalAlpha = 1;
    }
    lw = w * (1 - 0.8 * k); sk = k * h * 0.06;
    if (k <= 0) rrTop(g, x, y, w, h, 10); else poly(g, [x, y, x + lw, y - sk, x + lw, y + h + sk, x, y + h]);   // the door swings on its left edge
    g.fillStyle = lin(g, x, 0, x + lw, 0, shade(th.door, 0.18), shade(th.door, -0.12)); g.fill(); ol(g, 3.5);
    if (lw > 30) {
      g.strokeStyle = 'rgba(27,42,73,0.2)'; g.lineWidth = 2;
      for (i = 1; i < 4; i++) { g.beginPath(); g.moveTo(x + lw * i / 4, y + 10); g.lineTo(x + lw * i / 4, y + h - 4); g.stroke(); }
      g.beginPath(); g.arc(x + lw / 2, y + h * 0.26, lw * 0.17, 0, TAU); g.fillStyle = '#BFE9FF'; g.fill(); ol(g, 3);
      g.beginPath(); g.arc(x + lw - Math.max(9, lw * 0.14), y + h * 0.56, Math.max(4, lw * 0.06), 0, TAU); g.fillStyle = YEL; g.fill(); ol(g, 2.5);
    }
    // above the door: the number of the room and a lamp, red while it is locked
    if (num) {
      rr(g, x + w / 2 - 25, y - 46, 50, 28, 10); g.fillStyle = '#fff'; g.fill(); ol(g, 3);
      text(g, String(num), x + w / 2 - 9, y - 31, 19, NAVY, 700);
      g.beginPath(); g.arc(x + w / 2 + 12, y - 32, 7, 0, TAU); g.fillStyle = k > 0 ? '#3DCB6C' : (Math.floor(now / 600) % 2 ? '#FF4F6D' : '#C7334E'); g.fill(); ol(g, 2.5);
    }
  }

  // ---------- the players in the room ----------
  function roomPlayers() {
    var all = api.players(), list = [];
    if (st) st.who.forEach(function (w) { if (all[w.id]) list.push({ p: all[w.id], w: w }); });
    return list;
  }
  function drawAvatars(now, openT) {
    var list = roomPlayers(), n = list.length, me = api.myId(), S = lay.side, D = lay.door;
    if (!n) return;
    var rows = n > 4 ? 2 : 1, per = Math.ceil(n / rows), sc = lay.av * (rows > 1 ? 0.8 : 1), tagS = lay.tag * (rows > 1 ? 0.84 : 1), walk = openT >= 0 ? ease((openT - 1.7) / 1.5) : 0;
    var tx = D.x + D.w / 2, ty = lay.floorY + 8, playing = st.phase === 'play' && st.room;
    list.forEach(function (o, i) {   // up to four stand in one row; more make a back row and a front row
      var row = Math.floor(i / per), col = i % per, cnt = row === rows - 1 ? n - per * row : per;
      var x = S.x + 12 + (S.w - 24) * (col + 0.5) / cnt, y = lay.floorY + lay.floorH * (rows === 1 ? (cnt > 2 && col % 2 ? 0.84 : 0.6) : row ? 0.97 : 0.16);
      o.x = x + (tx - x) * walk; o.y = y + (ty - y) * walk; o.s = sc * (1 - 0.35 * walk); o.a = walk > 0.75 ? Math.max(0, 1 - (walk - 0.75) / 0.25) : 1;
    });
    list.sort(function (a, b) { return a.y - b.y; });
    list.forEach(function (o) {
      var p = o.p, id = p.id, cheer = openT >= 0.15 && openT < 1.6, moving = now - (ui.hop[id] || 0) < 450 || cheer || (walk > 0 && walk < 1), h, top, bw, bx, gain, k, s;
      if (o.a <= 0) return;
      g.globalAlpha = o.a;
      g.fillStyle = 'rgba(22,48,66,0.22)'; g.beginPath(); g.ellipse(o.x + 5 * o.s, o.y, 30 * o.s, 9 * o.s, 0, 0, TAU); g.fill();
      h = api.drawAvatar(g, p, o.x, o.y, now / 1000 + id * 0.7, { scale: o.s, facing: walk > 0 && tx > o.x ? 1 : -1, moving: moving });
      top = o.y - h - 8 * o.s;
      if (walk < 0.4) {
        g.save(); g.translate(o.x, top); g.scale(tagS, tagS);
        top -= (api.nameTag(g, p, 0, 0, id === me) + 4) * tagS;
        if (playing) {   // what this player has in hand: clue cards, and (when only some may press) the buttons
          bw = (o.w.n ? 30 : 0) + (st.room.split && o.w.op ? 30 : 0); bx = -bw / 2;
          if (o.w.n) {
            rr(g, bx + 4, -59, 22, 27, 5); g.fillStyle = CREAM; g.fill(); ol(g, 2.5);
            text(g, String(o.w.n), bx + 15, -45, 16, NAVY, 700); bx += 30;
          }
          if (st.room.split && o.w.op) { g.beginPath(); g.arc(bx + 15, -45, 14, 0, TAU); g.fillStyle = YEL; g.fill(); ol(g, 2.5); text(g, '✋', bx + 15, -44, 16); }
        }
        g.restore();
      }
      gain = st.room && st.room.gain ? st.room.gain[id] : 0;
      if (gain && openT >= 0.25 && openT < 2.3) {   // the stars this player just earned float up
        k = (openT - 0.25) / 2.05; s = '+' + gain + ' ⭐';
        g.globalAlpha = 1 - k * k; g.font = '700 ' + Math.round(30 * lay.tag) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
        g.lineWidth = 7; g.strokeStyle = NAVY; g.strokeText(s, o.x, top - 20 - k * 46); g.fillStyle = YEL; g.fillText(s, o.x, top - 20 - k * 46);
      }
      g.globalAlpha = 1;
    });
  }

  // ---------- the device in the middle of the room ----------
  function drawDevice(now, openT) {
    var room = st.room, pub = room.pub, D = DEV[pub.dev], B = lay.dev, done = st.phase === 'open';
    if (!D) return;
    var size = D.size(pub), m = 12, dx = 17, dy = 12, fw = size.w + m * 2, fh = size.h + m * 2;
    var s = Math.min(B.w / (fw + dx + 4), B.h / (fh + dy + 4), 1.7), ox = B.x + (B.w - (fw + dx) * s) / 2, oy = B.y + B.h - fh * s, age = now - ui.shake, col = BODY[room.type] || '#5AA9FF', k;
    if (age < 520) ox += Math.sin(age / 26) * 9 * (1 - age / 520);       // a wrong answer shakes it
    g.save(); g.translate(ox, oy); g.scale(s, s);
    rr(g, 10, fh - 10, fw + dx + 4, 22, 11); g.fillStyle = 'rgba(22,48,66,0.26)'; g.fill();                                  // shadow on the floor
    poly(g, [8, 3, 8 + dx, 3 - dy, fw + dx - 2, 3 - dy, fw - 2, 3]); g.fillStyle = shade(col, 0.3); g.fill(); ol(g, 4);         // top
    poly(g, [fw - 3, 3, fw + dx - 2, 3 - dy, fw + dx - 2, fh - dy - 8, fw - 3, fh - 8]); g.fillStyle = shade(col, -0.36); g.fill(); ol(g, 4);   // side
    rr(g, 0, 0, fw, fh, 16); g.fillStyle = lin(g, 0, 0, 0, fh, shade(col, 0.12), shade(col, -0.1)); g.fill(); ol(g, 4);         // front
    rr(g, 6, 6, fw - 12, fh - 12, 11); g.fillStyle = CREAM; g.fill(); ol(g, 3);
    [22, 40].forEach(function (lx, i) {   // two little lamps on top: red while locked, green when it opens
      g.beginPath(); g.arc(lx + dx / 2, 3 - dy / 2, 4.5, 0, TAU); g.fillStyle = done ? '#3DCB6C' : (Math.floor(now / 500) % 2 === i ? '#FF4F6D' : '#B93A52'); g.fill(); ol(g, 2);
    });
    g.translate(m, m);
    T = { x: ox + m * s, y: oy + m * s, s: s };
    D.draw(g, pub, room, now, done);
    if (done && openT >= 0) {   // a big tick pops up
      k = ease(openT / 0.35);
      g.globalAlpha = k * (openT > 1.3 ? Math.max(0, 1 - (openT - 1.3) / 0.4) : 1);   // it goes away again, so the solved device can be seen
      g.beginPath(); g.arc(size.w / 2, size.h / 2, 50 * (0.6 + 0.4 * k), 0, TAU); g.fillStyle = '#3DCB6C'; g.fill(); ol(g, 5);
      tick(g, size.w / 2, size.h / 2 + 2, 26 * (0.6 + 0.4 * k));
      g.globalAlpha = 1;
    }
    g.restore();
    lay.devTop = oy - dy * s; lay.devCx = ox + fw * s / 2;
    if (!st.op && st.phase === 'play') {   // this tablet only looks: a small sign on the device says so
      g.beginPath(); g.arc(ox + fw * s - 6, oy + 4, 17, 0, TAU); g.fillStyle = '#fff'; g.fill(); ol(g, 3); text(g, '👀', ox + fw * s - 6, oy + 5, 17);
    }
  }

  // ---------- my clue cards ----------
  function holdersAndOps() {
    var out = { ops: [], holders: [] };
    roomPlayers().forEach(function (o) { if (o.p.id === api.myId()) return; if (o.w.op) out.ops.push(o.p); if (o.w.n) out.holders.push(o.p); });
    return out;
  }
  function drawCard(now) {
    var B = lay.card, cards = st.cards || [], n = cards.length, tabsH = n > 1 ? 58 : 0, noteH = 30;
    var s = Math.min((B.w - 8) / 220, (B.h - tabsH - noteH - 18) / 300, 1.7), cw = 220 * s, ch = 300 * s, x = B.x + (B.w - cw) / 2, y = B.y + 12 * s, cd, i, tw, tx, who, note = '', age = now - ui.dealt;
    if (ui.card >= n) ui.card = 0;
    cd = cards[ui.card];
    g.save(); g.translate(x, y); g.scale(s, s);
    T = { x: x, y: y, s: s };
    if (age < 900) { rr(g, -7, -7, 234, 314, 22); g.fillStyle = 'rgba(255,214,107,' + (0.9 * (1 - age / 900)) + ')'; g.fill(); }     // new cards were dealt
    rr(g, 5, 7, 220, 300, 18); g.fillStyle = 'rgba(27,42,73,0.3)'; g.fill();
    rr(g, 0, 0, 220, 300, 18); g.fillStyle = CREAM; g.fill();
    g.save(); rr(g, 0, 0, 220, 300, 18); g.clip(); g.fillStyle = cd ? '#FFE39A' : '#E4DCC6'; g.fillRect(0, 0, 220, 43); g.fillStyle = 'rgba(27,42,73,0.12)'; g.fillRect(0, 43, 220, 3); g.restore();
    rr(g, 0, 0, 220, 300, 18); ol(g, 4);
    rr(g, 84, -10, 52, 19, 7); g.fillStyle = lin(g, 0, -10, 0, 9, '#D4D9E1', '#8A93A8'); g.fill(); ol(g, 3);                           // the clip that holds the paper
    who = holdersAndOps();
    if (cd && CARD[cd.k]) CARD[cd.k](g, cd, now);
    else {   // no clue on this tablet: this player presses, the others tell
      text(g, '✋', 110, 112, 78);
      who.holders.slice(0, 3).forEach(function (p, k, arr) {
        var px = 110 + (k - (arr.length - 1) / 2) * 62;
        api.drawAvatar(g, p, px, 262, now / 1000 + k, { scale: 0.62, facing: 1 });
        rr(g, px + 2, 168, 34, 26, 9); g.fillStyle = '#fff'; g.fill(); ol(g, 2.5); poly(g, [px + 8, 192, px + 18, 192, px + 6, 202]); g.fillStyle = '#fff'; g.fill(); ol(g, 2.5);
        g.fillStyle = '#fff'; g.fillRect(px + 8, 188, 10, 5); text(g, '…', px + 19, 178, 20, NAVY, 700);
      });
    }
    g.restore();
    y += ch + 10;
    if (n > 1) {   // flip between my cards
      T = { x: 0, y: 0, s: 1 };
      if (n <= 4) {   // one numbered button for each card
        tw = Math.min(52, (B.w - (n - 1) * 6) / n); tx = B.x + (B.w - n * tw - (n - 1) * 6) / 2;
        for (i = 0; i < n; i++) (function (i) {
          var dn = button(g, 'tab' + i, tx + i * (tw + 6), y, tw, 50, i === ui.card ? YEL : '#FFFFFF', { r: 16, local: function () { ui.card = i; } });
          text(g, String(i + 1), tx + i * (tw + 6) + tw / 2, y + 23 + dn, 24, NAVY, 700);
        })(i);
      } else {        // many cards: one back, one on, so the buttons stay big
        tx = B.x + (B.w - 196) / 2;
        i = button(g, 'tabp', tx, y, 58, 50, '#FFFFFF', { r: 16, local: function () { ui.card = (ui.card + n - 1) % n; } }); tri(g, tx + 28, y + 23 + i, 11, 3);
        rr(g, tx + 64, y + 4, 68, 40, 14); g.fillStyle = '#fff'; g.fill(); ol(g, 3);
        text(g, (ui.card + 1) + ' / ' + n, tx + 98, y + 25, 21, NAVY, 700);
        i = button(g, 'tabn', tx + 138, y, 58, 50, YEL, { r: 16, local: function () { ui.card = (ui.card + 1) % n; } }); tri(g, tx + 168, y + 23 + i, 11, 1);
      }
      y += 58;
    }
    // one short line for the grown-ups: who to talk to
    if (st.phase === 'play') {
      if (!n && who.holders.length) note = 'Ask ' + names(who.holders) + '!';
      else if (!st.op && who.ops.length) note = 'Tell ' + names(who.ops) + '!';
      else if (n && st.who.length > 1) note = 'Tell the others!';
      if (note && y + 28 <= H - 2) { g.font = '600 15px ' + FONT; if (g.measureText(note).width > B.w - 22) note = note.slice(0, 20) + '…!'; api.label(g, note, B.x + B.w / 2, y + 27, '#fff', NAVY, 15); }
    }
  }

  // ---------- who is touching what ----------
  function drawMarks(now) {
    var all = api.players(), me = api.myId(), i, k, m, p, age;
    for (i = 0; i < ctls.length; i++) {
      k = ctls[i]; m = ui.marks[k.id];
      if (!m) continue;
      age = now - m.t; p = all[m.id];
      if (age > 1300 || !p) { delete ui.marks[k.id]; continue; }
      g.globalAlpha = age < 900 ? 1 : 1 - (age - 900) / 400;
      rr(g, k.x - 3, k.y - 3, k.w + 6, k.h + 6, 16); g.lineWidth = 9; g.strokeStyle = NAVY; g.stroke(); g.lineWidth = 5; g.strokeStyle = p.color; g.stroke();
      if (m.id !== me) api.label(g, p.name, clamp(k.x + k.w / 2, 50, W - 50), k.y - 2, p.color, '#fff', 14);
      g.globalAlpha = 1;
    }
  }

  // ---------- one frame ----------
  function draw(now) {
    var phase = st ? st.phase : 'wait', room = st && st.room, ti = (room ? room.theme : 0) % THEMES.length, th = THEMES[ti], openT = -1, k, age, who;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineJoin = 'round'; g.lineCap = 'round';
    ctls = [];
    g.drawImage(roomSprite(ti), 0, 0, W, H);
    if (phase === 'open') openT = (now - ui.openAt) / 1000;
    drawDoor(th, phase === 'open' ? ease((openT - 0.5) / 0.8) : phase === 'done' ? 1 : 0, now, room || phase === 'done' ? Math.min((st.idx || 0) + 1, st.total || 4) : 0);
    if (room) drawDevice(now, openT);
    drawAvatars(now, openT);
    if (room) {
      drawCard(now);
      drawMarks(now);
      age = now - ui.deny;
      if (age < 1500 && lay.devCx) {   // tapped the device without being allowed: show who can
        who = holdersAndOps().ops;
        g.globalAlpha = age < 1100 ? 1 : 1 - (age - 1100) / 400;
        api.label(g, '✋ ' + (who.length ? names(who) : ''), lay.devCx, Math.max(lay.top + 36, lay.devTop + 40), '#FF4F6D', '#fff', 20);
        g.globalAlpha = 1;
      }
    }
    for (k = ui.pops.length - 1; k >= 0; k--) {   // short notices that float up
      age = (now - ui.pops[k].t) / 1500;
      if (age >= 1) { ui.pops.splice(k, 1); continue; }
      g.globalAlpha = 1 - age * age;
      api.label(g, ui.pops[k].s, ui.pops[k].x, ui.pops[k].y - age * 40, ui.pops[k].bg, NAVY, 20);
      g.globalAlpha = 1;
    }
    // going through the door: the picture goes dark, and comes back in the next room
    k = 0;
    if (phase === 'open' && openT > OPEN_S - 0.6) k = clamp((openT - (OPEN_S - 0.6)) / 0.5, 0, 1);
    else if (now - ui.fadeAt < 500) k = 1 - (now - ui.fadeAt) / 500;
    if (k > 0) { g.fillStyle = 'rgba(20,28,52,' + k + ')'; g.fillRect(0, 0, W, H); }
  }
  function frame(ts) {
    if (!root) return;
    raf = requestAnimationFrame(frame);
    if (ts - lastDraw < 30) return;   // about 30 pictures a second is plenty and is kind to old tablets
    lastDraw = ts;
    var now = Date.now();
    try { draw(now); } catch (e) { if (window.console) console.error(e); }
    hud(now);
  }

  // ---------- the bar at the top ----------
  function hud(now) {
    var playing = !!(st && st.room && (st.phase === 'play' || st.phase === 'open')), run, t, i, cls, left, ask;
    show(el.run, playing); show(el.stars, playing); show(el.stop, playing);
    if (!playing) { show(el.hint, false); return; }
    run = st.clock + (st.tick ? now - stAt : 0); t = st.room.t + (st.tick ? now - stAt : 0);
    setText(el.time, mmss(run));
    cls = '';
    for (i = 0; i < st.total; i++) cls += '<i class="' + (i < st.idx || (i === st.idx && st.phase === 'open') ? 'ok' : i === st.idx ? 'now' : '') + '"></i>';
    if (ui.hud.dots !== cls) { ui.hud.dots = cls; el.dots.innerHTML = cls; }
    setText(el.stars, '⭐ +' + (st.paid || 0));
    show(el.hint, st.phase === 'play' && t >= st.room.hintAfter && st.room.hintLeft > 0);
    left = st.room.fast && !st.room.hints && st.phase === 'play' ? 1 - t / st.room.fast : 0;
    show(el.fast, left > 0);
    i = Math.round(left * 50) * 2;
    if (left > 0 && ui.hud.fast !== i) { ui.hud.fast = i; el.fastBar.style.width = i + '%'; }
    ask = now - ui.stopAsk < 3000;
    if (ui.hud.ask !== ask) { ui.hud.ask = ask; el.stop.className = 'round esc-stop' + (ask ? ' ask' : ''); el.stop.textContent = ask ? 'End run? ✔' : '✖'; }
  }

  // ---------- the panel before a run (Easy or Hard) and after it (the time and the stars) ----------
  function bestLine(key) {
    var mine = st.best && st.best[key], fam = st.fam && st.fam[key];
    return '<span class="esc-best">⏱ ' + (mine > 0 ? mmss(mine) : '– –') + '</span>' + (fam && fam.ms > 0 ? '<span>Family: ' + mmss(fam.ms) + '</span>' : '');
  }
  function modeButtons() {
    return '<div class="esc-modes">' +
      '<button type="button" class="esc-mode esc-easy" data-diff="0" data-quiet><span class="esc-st">⭐</span><b>Easy</b><span>简单 <span class="py">jiǎndān</span> · Mudah</span>' + bestLine('easy') + '</button>' +
      '<button type="button" class="esc-mode esc-hard" data-diff="1" data-quiet><span class="esc-st">⭐⭐⭐</span><b>Hard</b><span>困难 <span class="py">kùnnan</span> · Sukar</span>' + bestLine('hard') + '</button>' +
      '</div>';
  }
  function panel() {
    var phase = st ? st.phase : '', html = '', left, i, keys = '', sum, id = api.myId(), gains;
    if (phase !== 'lobby' && phase !== 'done') { show(el.panel, false); ui.panelSig = ''; return; }
    left = Math.max(0, (st.cap || 3) - (st.today || 0));
    for (i = 0; i < (st.cap || 3); i++) keys += '<span' + (i < left ? '' : ' class="used"') + '>🗝️</span>';
    if (phase === 'lobby') {
      html = '<div class="esc-h"><span class="esc-ico">🗝️</span><div><h2>Escape Room</h2><div class="esc-tri">密室逃脱 <span class="py">mìshì táotuō</span> · Bilik Lolos</div></div></div>' +
        '<div class="esc-how"><span>👀</span><i>›</i><span>💬</span><i>›</i><span>✋</span><i>›</i><span>🚪</span><em>Everyone gets different clues. Look, tell each other, and open 4 doors together!</em></div>' +
        modeButtons() +
        '<div class="esc-info"><span class="esc-keys">' + keys + '</span> ' + (left ? 'Star runs left today: ' + left + ' · each room ⭐ 3, all four rooms ⭐ +5' : 'Today\'s star runs are used up: each room still gives ⭐ 1') +
        (st.rooms ? ' · 🚪 ' + st.rooms + ' rooms opened so far' : '') + '</div>';
    } else {
      sum = st.sum || {}; gains = st.gains || [];
      html = '<div class="esc-h"><span class="esc-ico">🎉</span><div><h2>You escaped!</h2><div class="esc-tri">逃出来了！ <span class="py">táo chūlái le</span> · Berjaya keluar!</div></div></div>' +
        '<div class="esc-big">⏱ ' + mmss(sum.ms || 0) + (sum.mine && sum.mine[id] ? '<span class="esc-badge">New best!</span>' : '') + (sum.fam ? '<span class="esc-badge">Family record!</span>' : '') + '</div>' +
        '<div class="esc-sum">' + (gains.length ? gains.join(' + ') + ' = ' + (st.paid || 0) + ' ⭐' : '0 ⭐') +
        (gains.length && !st.full ? '<small>Today\'s star runs are used up: ⭐ 1 per room</small>' : '') + '</div>' +
        '<div class="esc-again">Play again:</div>' + modeButtons();
    }
    if (html !== ui.panelSig) { ui.panelSig = html; el.panel.innerHTML = html; }
    show(el.panel, true);
  }

  // ---------- messages from the server ----------
  function onState(m, now) {
    var prev = st, sig;
    st = m; stAt = now;
    if (m.phase === 'play' && (!prev || prev.phase !== 'play' || prev.idx !== m.idx)) {   // a new room
      ui.card = 0; ui.flash = {}; ui.ang = {}; ui.marks = {}; ui.shake = 0; ui.deny = 0; ui.fadeAt = now;
      if (prev && prev.phase === 'lobby') api.sfx('open');
    }
    if (m.phase === 'open' && (!prev || prev.phase !== 'open' || prev.idx !== m.idx)) {
      if (prev && prev.phase === 'play') {
        ui.openAt = now; api.sfx('right');
        setTimeout(function () { if (root) api.sfx('open'); }, 600);
        if (m.room.gain && m.room.gain[api.myId()]) setTimeout(function () { if (root) api.sfx('star'); }, 350);
        if (m.room.quick) ui.pops.push({ s: '⚡ +1 ⭐', x: W / 2, y: lay.top + 70, bg: YEL, t: now });
      } else ui.openAt = now - 1600;   // came in while the door was already opening
    }
    if (m.phase === 'done' && prev && prev.phase !== 'done') api.sfx('goal');
    sig = (m.cards || []).map(function (c) { return c.i; }).join(',');
    if (prev && prev.phase === 'play' && m.phase === 'play' && prev.idx === m.idx && sig !== ui.cardSig) { ui.dealt = now; ui.card = 0; api.sfx('claim'); }   // somebody came or went: new cards
    ui.cardSig = sig;
    panel();
  }
  function onMessage(m) {
    if (!root) return;
    var now = Date.now();
    if (m.t === ID + '.state') onState(m, now);
    else if (m.t === ID + '.touch') {
      ui.marks[m.at] = { id: m.id, t: now }; ui.hop[m.id] = now;
      if (m.id !== api.myId()) ui.press[m.at] = now;
    }
    else if (m.t === ID + '.wrong') { ui.shake = now; api.sfx('wrong'); }
    else if (m.t === ID + '.hinted') { api.sfx('quest'); ui.pops.push({ s: '💡 −1 ⭐', x: W / 2, y: lay.top + 70, bg: YEL, t: now }); }
    else if (m.t === ID + '.nohint') api.sfx('deny');
  }

  // ---------- taps ----------
  function onDown(e) {
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, i, k, m, key;
    for (i = ctls.length - 1; i >= 0; i--) {
      k = ctls[i];
      if (x < k.x - 2 || x > k.x + k.w + 2 || y < k.y - 2 || y > k.y + k.h + 2) continue;
      e.preventDefault();
      if (k.local) { ui.press[k.id] = Date.now(); api.sfx('tap'); k.local(); return; }
      if (!st || st.phase !== 'play' || !k.msg) return;
      if (!st.op) { ui.deny = Date.now(); api.sfx('deny'); return; }
      ui.press[k.id] = Date.now(); api.sfx('tap');
      m = { t: ID + '.act' };
      for (key in k.msg) if (Object.prototype.hasOwnProperty.call(k.msg, key)) m[key] = k.msg[key];
      api.send(m);
      return;
    }
  }
  function onClick(e) {
    var t = e.target, diff;
    while (t && t !== root && t.nodeType === 1) {
      if (t.classList.contains('esc-back')) { api.sfx('close'); close(); return; }
      if (t.classList.contains('esc-hint')) { api.send({ t: ID + '.hint' }); return; }
      if (t.classList.contains('esc-stop')) {
        if (Date.now() - ui.stopAsk < 3000) { ui.stopAsk = 0; api.send({ t: ID + '.stop' }); } else ui.stopAsk = Date.now();   // the second tap ends the run
        return;
      }
      diff = t.getAttribute('data-diff');
      if (diff !== null) { api.sfx('open'); api.send({ t: ID + '.start', diff: diff === '1' ? 1 : 0 }); return; }
      t = t.parentNode;
    }
  }

  // ---------- opening and closing the screen ----------
  function open() {
    if (root) return;
    if (!document.getElementById(ID + '-style')) { var css = document.createElement('style'); css.id = ID + '-style'; css.textContent = CSS; document.head.appendChild(css); }
    ui = freshUi(); st = null; lastDraw = 0;
    root = document.createElement('div'); root.className = 'screen esc-root';
    root.innerHTML = '<canvas class="esc-cv" aria-label="Escape room"></canvas>' +
      '<div class="esc-top">' +
      '<button type="button" class="btn esc-back" data-quiet>Back to town</button>' +
      '<div class="esc-mid"><div class="esc-pill esc-run" hidden><span class="esc-dots"></span><span class="esc-time">00:00</span><span class="esc-fast" hidden>⚡<b><i></i></b></span></div></div>' +
      '<button type="button" class="btn esc-hint" data-quiet hidden>💡 Hint <small>−1⭐</small></button>' +
      '<div class="esc-pill esc-stars" hidden></div>' +
      '<button type="button" class="round esc-stop" aria-label="End this run" hidden>✖</button>' +
      '</div>' +
      '<div class="esc-panel" hidden></div>';
    document.body.appendChild(root);
    cv = root.querySelector('.esc-cv'); g = cv.getContext('2d');
    el = { run: root.querySelector('.esc-run'), dots: root.querySelector('.esc-dots'), time: root.querySelector('.esc-time'), fast: root.querySelector('.esc-fast'),
      fastBar: root.querySelector('.esc-fast i'), hint: root.querySelector('.esc-hint'), stars: root.querySelector('.esc-stars'), stop: root.querySelector('.esc-stop'), panel: root.querySelector('.esc-panel') };
    root.addEventListener('click', onClick);
    cv.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', resize);
    resize();
    raf = requestAnimationFrame(frame);
    api.enter(ID);
  }
  function close() {
    if (!root) return;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener('resize', resize);
    root.removeEventListener('click', onClick);
    cv.removeEventListener('pointerdown', onDown);
    if (root.parentNode) root.parentNode.removeChild(root);
    root = null; cv = null; g = null; st = null; ctls = []; bg.cv = null; bg.key = '';
    api.leave();
  }

  window.FTGames = window.FTGames || {};
  window.FTGames[ID] = {
    init: function (a) { api = a; },
    open: open,
    onMessage: onMessage
  };
})();
