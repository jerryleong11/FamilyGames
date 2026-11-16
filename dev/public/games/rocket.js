// Rocket Base (client). The family gets a rocket ready before the countdown ends, and every tablet has a
// different part: Hands presses but sees only grey shapes, Eyes sees the real panel but cannot press, Book has
// the picture rules. The server sends each tablet only what its part may know and checks every press;
// this file draws what it is told. See docs/GAME-MODULES.md.
(function () {
  'use strict';
  var ID = 'rocket';
  var api = null, root = null, cv = null, g = null, W = 0, H = 0, dpr = 1, raf = 0, lastDraw = 0;
  var el = {}, lay = null, bg = { key: '', cv: null };
  var st = null, stAt = 0;      // the last state from the server, and when it arrived
  var ui = null;                // what only this tablet knows: what is on show, animations
  var ctls = [];                // everything that can be tapped on the canvas this frame, in screen pixels
  var T = { x: 0, y: 0, s: 1 }; // where the thing being drawn sits on the screen (for the tap areas)

  var NAVY = '#1B2A49', CREAM = '#FFF3D6', YEL = '#FFD66B', GREEN = '#3DCB6C', RED = '#E02D48', TAU = Math.PI * 2;
  var GREY = '#B9C0CC', GREY2 = '#8E98A9', GLASS = '#18224A';
  var FONT = "Fredoka, 'Baloo 2', 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  var COLS = ['#E02D48', '#FF9326', '#FFD93B', '#3DAE5A', '#3B82F6', '#9B5DE5'];   // red, orange, yellow, green, blue, purple
  var PLANETS = [['#E8C27A', 'ring'], ['#E0523F', 'patch'], ['#4DA3FF', 'swirl'], ['#5CC46A', 'spots'], ['#A77BF3', 'bands'], ['#FFD93B', 'moon']];
  var DEST = [
    { en: 'Moon', zh: '月球', py: 'yuèqiú', ms: 'Bulan', sky: ['#0B1437', '#243B8A', '#6E8FE0'], pl: ['#F3EDCF', 'spots'], ground: '#9AA7B8' },
    { en: 'Mars', zh: '火星', py: 'huǒxīng', ms: 'Marikh', sky: ['#2A1240', '#7A2E5E', '#F08A5B'], pl: ['#E0523F', 'patch'], ground: '#A9A1A6' },
    { en: 'Saturn', zh: '土星', py: 'tǔxīng', ms: 'Zuhal', sky: ['#120B32', '#3B1F73', '#8B5FD0'], pl: ['#E8C27A', 'ring'], ground: '#9C9CB8' }
  ];
  var ROLE = {
    H: { ico: '✋', en: 'Hands', zh: '手', py: 'shǒu', ms: 'Tangan', tip: 'Only you can press. Your visor is fogged, so ask the others!' },
    E: { ico: '👀', en: 'Eyes', zh: '眼睛', py: 'yǎnjing', ms: 'Mata', tip: 'You see the real panel. Tell Hands what to press!' },
    B: { ico: '📖', en: 'Book', zh: '书', py: 'shū', ms: 'Buku', tip: 'You have the mission book. Find the rule and tell the others!' },
    W: { ico: '⏳', en: 'Watching', zh: '观看', py: 'guānkàn', ms: 'Menonton', tip: 'This mission has started. You are in the next one!' }
  };
  var STN = {
    order: { en: 'Launch Buttons', zh: '发射按钮', py: 'fāshè ànniǔ', ms: 'Butang Pelancar' },
    hose: { en: 'Fuel Hoses', zh: '燃料管', py: 'ránliào guǎn', ms: 'Hos Bahan Api' },
    dial: { en: 'Cargo Dial', zh: '货物表盘', py: 'huòwù biǎopán', ms: 'Dail Kargo' },
    'switch': { en: 'Planet Switches', zh: '行星开关', py: 'xíngxīng kāiguān', ms: 'Suis Planet' },
    grid: { en: 'Star Map', zh: '星图', py: 'xīngtú', ms: 'Peta Bintang' },
    cells: { en: 'Battery Cells', zh: '电池', py: 'diànchí', ms: 'Sel Bateri' },
    blink: { en: 'Signal Lamp', zh: '信号灯', py: 'xìnhàodēng', ms: 'Lampu Isyarat' },
    cargo: { en: 'Cargo Scale', zh: '货物秤', py: 'huòwù chèng', ms: 'Penimbang Kargo' },
    wheels: { en: 'Code Wheels', zh: '密码轮', py: 'mìmǎ lún', ms: 'Roda Kod' }
  };
  var BODY = { order: '#F0705A', hose: '#2F9E83', dial: '#5AA9FF', 'switch': '#9B6BFF', grid: '#4C5FD5', cells: '#E8A93B', blink: '#E0447F', cargo: '#4FB3A5', wheels: '#7A8BC9' };
  var FAC = { col: '🎨', sym: '🔣', num: '🔢', lit: '💡' };
  var SIGS = [];
  (function () {
    var i;
    for (i = 0; i < 6; i++) SIGS.push(['c', i]);
    for (i = 0; i < 6; i++) SIGS.push(['s', i]);
    for (i = 0; i < 10; i++) SIGS.push(['n', i]);
    for (i = 0; i < 4; i++) SIGS.push(['a', i]);
    SIGS.push(['y', 1]); SIGS.push(['y', 0]);
  })();

  var CSS = [
    '.rk-root{background:#0B1437;overflow:hidden;touch-action:none;color:#1B2A49}',
    '.rk-cv{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none}',
    '.rk-top{position:absolute;left:8px;right:8px;top:8px;height:52px;display:flex;align-items:center;gap:8px;pointer-events:none}',
    '.rk-top>*{pointer-events:auto;flex:none}',
    '.rk-top .btn{height:52px;font-size:18px;padding:0 16px;white-space:nowrap}',
    '.rk-mid{flex:1 1 auto;min-width:0;display:flex;justify-content:center;align-items:center;gap:8px;pointer-events:none}',
    '.rk-pill{height:48px;padding:0 14px;border-radius:999px;border:3px solid #1B2A49;background:#fff;display:flex;align-items:center;gap:6px;font-size:20px;font-weight:700;white-space:nowrap}',
    '.rk-clock{min-width:118px;justify-content:center;font-size:32px;background:#1B2A49;color:#FFD66B;border-color:#fff;letter-spacing:1px}',
    '.rk-clock.low{background:#E02D48;color:#fff}',
    '.rk-clock.hit{background:#FFD93B;color:#1B2A49;transform:scale(1.12)}',
    '.rk-sigb.on{background:#FFD66B}',
    '.rk-stop.ask{width:auto;padding:0 14px;border-radius:999px;background:#FF4F6D;color:#fff;font-size:18px;font-weight:700;border-color:#fff}',
    '.rk-pl{display:inline-block;width:22px;height:22px;border-radius:50%;border:2.5px solid #1B2A49;position:relative;flex:none;vertical-align:middle}',
    '.rk-pl0{background:radial-gradient(circle at 65% 62%,#C9C3A5 0,#C9C3A5 18%,#F3EDCF 20%)}',
    '.rk-pl1{background:radial-gradient(circle at 35% 40%,#B5382B 0,#B5382B 22%,#E0523F 24%)}',
    '.rk-pl2{background:#E8C27A;margin:0 5px}',
    '.rk-pl2:after{content:"";position:absolute;left:-8px;right:-8px;top:6px;height:5px;border:2.5px solid #1B2A49;border-radius:50%;background:#B98A4A;transform:rotate(-18deg)}',
    '.rk-cap{position:absolute;text-align:center;font-size:15px;font-weight:600;line-height:22px;height:22px;color:#fff;white-space:nowrap;overflow:hidden;pointer-events:none}',
    '.rk-cap>span{display:inline-block;background:rgba(11,20,55,.82);border-radius:999px;padding:0 14px}',
    '.rk-cap .py,.rk-panel .py{font-family:system-ui,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif}',
    '.rk-panel{position:absolute;background:#FFF3D6;border:5px solid #1B2A49;border-radius:28px;padding:12px 16px;display:flex;flex-direction:column;gap:8px;overflow-y:auto;touch-action:pan-y;box-shadow:0 8px 0 rgba(11,20,55,.35);font-size:16px;font-weight:600;line-height:1.3}',
    '.rk-h{display:flex;align-items:center;gap:10px}',
    '.rk-h h2{font-size:28px;line-height:1.05}',
    '.rk-ico{font-size:40px;line-height:1}',
    '.rk-ttl{flex:1;min-width:0}',
    '.rk-tri{font-size:15px;font-weight:600}',
    '.rk-go{flex:none;font-size:22px;height:56px}',
    '.rk-tabs{display:flex;gap:6px}',
    '.rk-tab{flex:1 1 0;min-width:0;height:48px;border-radius:16px;border:3px solid #1B2A49;background:#fff;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:5px;padding:0 4px;white-space:nowrap}',
    '.rk-tab.on{background:#1B2A49;color:#fff}',
    '.rk-tab.on .rk-pl{border-color:#fff}',
    '.rk-tab.nar{flex:0 0 56px}',
    '.rk-grid{display:flex;gap:6px}',
    '.rk-m{flex:1 1 0;min-width:0;height:78px;border-radius:18px;border:3px solid #1B2A49;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:0;position:relative;font-size:28px;font-weight:700;line-height:1;box-shadow:0 4px 0 rgba(27,42,73,.3)}',
    '.rk-m.on{background:#FFD66B;outline:4px solid #1B2A49;outline-offset:1px}',
    '.rk-m.shut{background:#E4DCC6;color:#8A8576;box-shadow:none}',
    '.rk-m em{position:absolute;right:4px;top:3px;font-size:13px;font-style:normal}',
    '.rk-mds{display:inline-flex;gap:2px}',
    '.rk-mds i{display:block;width:17px;height:17px;border-radius:50%;border:2px solid #1B2A49;background:#fff;color:transparent;font-style:normal;font-size:11px;line-height:13px;text-align:center}',
    '.rk-mds i.on{background:#FFC933;color:#1B2A49}',
    '.rk-mds.big i{width:46px;height:46px;border-width:4px;font-size:30px;line-height:38px}',
    '.rk-info{background:#fff;border:3px solid #1B2A49;border-radius:18px;padding:6px 12px;font-size:15px;display:flex;flex-direction:column;gap:1px}',
    '.rk-info b{font-size:17px}',
    '.rk-info small{font-weight:600;font-size:13px}',
    '.rk-new{color:#B3122F}',
    '.rk-roles{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
    '.rk-roles .chip{height:48px;padding:0 12px;font-size:17px;white-space:nowrap}',
    '.rk-crew{display:flex;gap:6px;flex-wrap:wrap;font-size:15px}',
    '.rk-crew span{background:#fff;border:2.5px solid #1B2A49;border-radius:999px;padding:1px 10px;white-space:nowrap}',
    '.rk-crew span.me{background:#FFD66B}',
    '.rk-note{font-size:14px;font-weight:600}',
    '.rk-how{display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:#fff;border:3px solid #1B2A49;border-radius:18px;padding:4px 12px;font-size:14px;font-weight:600}',
    '.rk-how span{font-size:24px;line-height:1}',
    '.rk-how i{font-style:normal;font-size:20px;opacity:.5}',
    '.rk-how em{font-style:normal}',
    '@media (max-height:620px){.rk-how,.rk-more{display:none}}',
    '.rk-list{display:flex;flex-direction:column;gap:5px}',
    '.rk-row{display:flex;align-items:center;gap:8px;background:#fff;border:2.5px solid #1B2A49;border-radius:14px;padding:3px 10px;font-size:15px}',
    '.rk-row b{font-size:19px;min-width:24px;text-align:center}',
    '.rk-row span:last-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}',
    '.rk-day{height:auto;min-height:78px;font-size:20px;gap:4px;padding:8px}',
    '.rk-you{display:flex;flex-direction:column;gap:6px}',
    '.rk-part{display:flex;align-items:center;gap:12px;background:#fff;border:3px solid #1B2A49;border-radius:18px;padding:6px 14px;font-size:18px}',
    '.rk-part b{font-size:24px}',
    '.rk-part small{display:block;font-size:14px;font-weight:600}',
    '.rk-pico{font-size:44px;line-height:1}',
    '.rk-quiet{background:#DCD3FF;border:3px solid #1B2A49;border-radius:18px;padding:6px 14px;font-size:16px}',
    '.rk-quiet small{display:block;font-size:14px}',
    '.rk-bar{height:16px;border:3px solid #1B2A49;border-radius:999px;background:#fff;overflow:hidden;flex:none}',
    '.rk-bar i{display:block;height:100%;width:0;background:#3DCB6C}',
    '.rk-res{display:flex;align-items:center;gap:14px;flex-wrap:wrap}',
    '.rk-big{font-size:38px;font-weight:700;line-height:1.05;display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.rk-badge{background:#FFD66B;border:3px solid #1B2A49;border-radius:999px;padding:3px 12px;font-size:16px;font-weight:700;line-height:1.2}',
    '.rk-sum{font-size:24px;font-weight:700;background:#fff;border:3px solid #1B2A49;border-radius:18px;padding:6px 14px}',
    '.rk-sum small{font-size:14px;font-weight:600;display:block}',
    '.rk-btns{display:flex;gap:8px;flex-wrap:wrap}',
    '.rk-btns .btn{font-size:19px;padding:0 18px}',
    '@media (max-width:900px),(max-height:560px){.rk-top .btn{font-size:16px;padding:0 12px}.rk-pill{font-size:17px;padding:0 10px}.rk-clock{font-size:28px;min-width:104px}' +
      '.rk-panel{padding:8px 12px;gap:6px;border-width:4px;border-radius:24px;font-size:15px}.rk-h h2{font-size:23px}.rk-ico{font-size:32px}.rk-tri{font-size:14px}.rk-go{font-size:19px;height:48px;padding:0 14px}' +
      '.rk-tab{font-size:14px}.rk-m{height:62px;font-size:24px}.rk-info{font-size:14px;padding:4px 10px}.rk-info b{font-size:15px}.rk-roles .chip{padding:0 9px;font-size:15px}.rk-crew{font-size:14px}' +
      '.rk-big{font-size:30px}.rk-sum{font-size:20px}.rk-mds.big i{width:40px;height:40px;font-size:26px;line-height:32px}.rk-part{font-size:16px;padding:4px 12px}.rk-part b{font-size:20px}.rk-pico{font-size:36px}.rk-btns .btn{font-size:17px;padding:0 14px}}'
  ].join('\n');

  // ---------- small helpers ----------
  function freshUi() {
    return { view: 0, tab: 'panel', board: false, press: {}, marks: {}, hop: {}, slide: {}, ang: {}, spin: {}, sigs: [], fx: [], pops: [], puffs: [], conf: [],
      phaseAt: 0, blink0: 0, sparkAt: 0, shake: 0, deny: 0, dealt: 0, stopAsk: 0, hold: null, readyAt: 0, sel: 0, ltab: -1, briefMs: 0, panelSig: '', capSig: '', misSig: '', hud: {}, puffAt: 0, last: 0 };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(k) { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); }
  function shade(hex, f) { return window.Scene && window.Scene.shade ? window.Scene.shade(hex, f) : hex; }
  function prnd(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function rr(q, x, y, w, h, r) { api.rr(q, x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); }
  function circ(q, x, y, r) { q.beginPath(); q.arc(x, y, Math.max(0, r), 0, TAU); }
  function ol(q, w) { q.lineWidth = w || 3; q.strokeStyle = NAVY; q.lineJoin = 'round'; q.lineCap = 'round'; q.stroke(); }
  function lin(q, x0, y0, x1, y1, a, b) { var gr = q.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; }
  function poly(q, p) { q.beginPath(); q.moveTo(p[0], p[1]); for (var i = 2; i < p.length; i += 2) q.lineTo(p[i], p[i + 1]); q.closePath(); }
  function text(q, s, x, y, size, col, weight, align) {
    q.font = (weight || 700) + ' ' + size + 'px ' + FONT; q.fillStyle = col || NAVY; q.textAlign = align || 'center'; q.textBaseline = 'middle'; q.fillText(s, x, y);
  }
  function numOn(q, v, x, y, size, light) {   // a number; on a coloured button it is white with a dark edge
    q.font = '700 ' + size + 'px ' + FONT; q.textAlign = 'center'; q.textBaseline = 'middle';
    if (light) { q.lineJoin = 'round'; q.lineWidth = Math.max(4, size * 0.17); q.strokeStyle = NAVY; q.strokeText(String(v), x, y); }
    q.fillStyle = light ? '#fff' : NAVY; q.fillText(String(v), x, y);
  }
  function mmss(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function show(node, on) { if (node && node.hidden === on) node.hidden = !on; }
  function setText(node, s) { if (node._s !== s) { node._s = s; node.textContent = s; } }
  function setHtml(node, s) { if (node._s !== s) { node._s = s; node.innerHTML = s; } }
  function three(o) { return api.three(o); }
  function slide(key, target) { var c = ui.slide[key]; if (c === undefined) c = target; c += Math.abs(target - c) < 0.5 ? target - c : (target - c) * 0.35; ui.slide[key] = c; return c; }
  function glide(key, target) {   // an angle that turns the short way to where it should be
    var cur = ui.ang[key], d;
    if (cur === undefined) { ui.ang[key] = target; return target; }
    d = ((target - cur) % TAU + TAU) % TAU; if (d > Math.PI) d -= TAU;
    cur += Math.abs(d) < 0.01 ? d : d * 0.3;
    ui.ang[key] = cur;
    return cur;
  }
  function tick(q, x, y, r) {
    q.beginPath(); q.moveTo(x - r, y); q.lineTo(x - r * 0.3, y + r * 0.7); q.lineTo(x + r, y - r * 0.7);
    q.lineCap = 'round'; q.lineJoin = 'round'; q.lineWidth = r * 0.78; q.strokeStyle = NAVY; q.stroke(); q.lineWidth = r * 0.36; q.strokeStyle = '#fff'; q.stroke();
  }
  function cross(q, x, y, r) {
    q.beginPath(); q.moveTo(x - r, y - r); q.lineTo(x + r, y + r); q.moveTo(x + r, y - r); q.lineTo(x - r, y + r);
    q.lineCap = 'round'; q.lineWidth = r * 0.8; q.strokeStyle = NAVY; q.stroke(); q.lineWidth = r * 0.4; q.strokeStyle = '#fff'; q.stroke();
  }
  function tri(q, x, y, r, dir, col) {   // an arrow head: dir 0 up, 1 right, 2 down, 3 left
    q.save(); q.translate(x, y); q.rotate(dir * Math.PI / 2);
    q.beginPath(); q.moveTo(0, -r); q.lineTo(r * 0.95, r * 0.7); q.lineTo(-r * 0.95, r * 0.7); q.closePath();
    q.fillStyle = col || NAVY; q.fill(); q.lineJoin = 'round'; q.lineWidth = 3; q.strokeStyle = col || NAVY; q.stroke();
    q.restore();
  }
  function arrow(q, x, y, r, dir, col) {  // a whole arrow with its shaft
    q.save(); q.translate(x, y); q.rotate(dir * Math.PI / 2);
    q.beginPath(); q.moveTo(0, r); q.lineTo(0, -r * 0.2); q.lineCap = 'round'; q.lineWidth = r * 0.42; q.strokeStyle = col || NAVY; q.stroke();
    q.beginPath(); q.moveTo(0, -r); q.lineTo(r * 0.72, -r * 0.1); q.lineTo(-r * 0.72, -r * 0.1); q.closePath(); q.fillStyle = col || NAVY; q.fill(); q.lineJoin = 'round'; q.lineWidth = r * 0.16; q.stroke();
    q.restore();
  }

  // ---------- the six symbols, the planets, the little pictures of the stations ----------
  // 0 star, 1 moon, 2 ringed planet, 3 cloud, 4 comet, 5 gem.  Always one colour, so a colour never gives a symbol away.
  function sym(q, i, x, y, r, col) {
    col = col || NAVY;
    q.fillStyle = col; q.strokeStyle = col; q.lineJoin = 'round'; q.lineCap = 'round';
    if (i === 0) { api.starPath(q, x, y + r * 0.06, r * 1.14); q.fill(); }
    else if (i === 1) { q.beginPath(); q.arc(x - r * 0.12, y, r, 0.32 * Math.PI, 1.68 * Math.PI); q.arc(x + r * 0.46, y, r * 0.8, 1.42 * Math.PI, 0.58 * Math.PI, true); q.closePath(); q.fill(); }
    else if (i === 2) { circ(q, x, y, r * 0.6); q.fill(); q.beginPath(); q.ellipse(x, y, r * 1.14, r * 0.36, -0.4, 0, TAU); q.lineWidth = r * 0.2; q.stroke(); }
    else if (i === 3) {
      q.beginPath(); q.arc(x - r * 0.5, y + r * 0.22, r * 0.46, 0, TAU); q.arc(x + r * 0.52, y + r * 0.22, r * 0.46, 0, TAU); q.fill();
      circ(q, x - r * 0.08, y - r * 0.18, r * 0.62); q.fill(); q.fillRect(x - r * 0.5, y + r * 0.1, r, r * 0.58);
    } else if (i === 4) {
      circ(q, x - r * 0.42, y + r * 0.42, r * 0.5); q.fill();
      q.beginPath(); q.moveTo(x - r * 0.1, y + r * 0.02); q.lineTo(x + r * 0.95, y - r * 0.95); q.moveTo(x - r * 0.52, y - r * 0.22); q.lineTo(x + r * 0.28, y - r * 0.98); q.moveTo(x + r * 0.14, y + r * 0.5); q.lineTo(x + r * 0.98, y - r * 0.3);
      q.lineWidth = r * 0.22; q.stroke();
    } else {
      poly(q, [x - r, y - r * 0.22, x - r * 0.5, y - r * 0.82, x + r * 0.5, y - r * 0.82, x + r, y - r * 0.22, x, y + r]); q.fill();
      q.beginPath(); q.moveTo(x - r * 0.86, y - r * 0.22); q.lineTo(x + r * 0.86, y - r * 0.22); q.moveTo(x - r * 0.3, y - r * 0.22); q.lineTo(x, y + r * 0.7); q.lineTo(x + r * 0.3, y - r * 0.22);
      q.lineWidth = Math.max(1.2, r * 0.1); q.strokeStyle = '#fff'; q.stroke();
    }
  }
  function plate(q, x, y, r) { circ(q, x, y, r); q.fillStyle = '#fff'; q.fill(); ol(q, Math.max(2, r * 0.12)); }
  function planetDraw(q, col, kind, x, y, r) {
    var lw = Math.max(2, r * 0.1), k;
    function ring(a0, a1) {
      q.beginPath(); q.ellipse(x, y, r * 1.6, r * 0.44, -0.3, a0, a1); q.lineCap = 'butt';
      q.lineWidth = r * 0.24 + lw * 2; q.strokeStyle = NAVY; q.stroke(); q.lineWidth = r * 0.24; q.strokeStyle = '#B98A4A'; q.stroke();
    }
    if (kind === 'ring') ring(Math.PI, TAU);
    circ(q, x, y, r); q.fillStyle = lin(q, x - r, y - r, x + r, y + r, shade(col, 0.3), shade(col, -0.22)); q.fill();
    q.save(); circ(q, x, y, r); q.clip();
    if (kind === 'patch') { q.fillStyle = shade(col, -0.3); [[-0.3, -0.2, 0.4], [0.4, 0.35, 0.34], [0.25, -0.55, 0.2]].forEach(function (o) { q.beginPath(); q.ellipse(x + o[0] * r, y + o[1] * r, o[2] * r * 1.3, o[2] * r, 0.4, 0, TAU); q.fill(); }); }
    else if (kind === 'swirl') { q.strokeStyle = 'rgba(255,255,255,0.85)'; q.lineWidth = r * 0.2; q.lineCap = 'round'; q.beginPath(); q.arc(x - r * 0.1, y + r * 0.1, r * 0.5, 0.2, Math.PI * 1.3); q.stroke(); q.beginPath(); q.arc(x + r * 0.3, y - r * 0.4, r * 0.3, Math.PI, TAU); q.stroke(); }
    else if (kind === 'spots') { q.fillStyle = shade(col, -0.2); [[-0.35, -0.3, 0.26], [0.35, 0.1, 0.3], [-0.15, 0.5, 0.2], [0.3, -0.55, 0.14]].forEach(function (o) { circ(q, x + o[0] * r, y + o[1] * r, o[2] * r); q.fill(); }); }
    else if (kind === 'bands') { for (k = -2; k <= 2; k++) { q.fillStyle = k % 2 ? shade(col, 0.35) : shade(col, -0.25); q.fillRect(x - r, y + k * r * 0.4 - r * 0.12, r * 2, r * 0.24); } }
    else if (kind === 'ring') { q.fillStyle = shade(col, -0.16); q.fillRect(x - r, y - r * 0.5, r * 2, r * 0.2); q.fillRect(x - r, y + r * 0.35, r * 2, r * 0.16); }
    q.restore();
    circ(q, x, y, r); ol(q, lw);
    if (kind === 'ring') ring(0, Math.PI);
    if (kind === 'moon') { circ(q, x + r * 1.15, y - r * 0.75, r * 0.3); q.fillStyle = '#D9DEE8'; q.fill(); ol(q, lw); }
  }
  function kico(q, kind, x, y, r, col) {
    var i;
    q.fillStyle = col; q.strokeStyle = col; q.lineCap = 'round'; q.lineJoin = 'round'; q.lineWidth = Math.max(2, r * 0.26);
    if (kind === 'order') { [[-0.65, -0.5], [0.65, -0.5], [0, 0.6]].forEach(function (o) { circ(q, x + o[0] * r, y + o[1] * r, r * 0.42); q.fill(); }); }
    else if (kind === 'hose') { q.beginPath(); q.moveTo(x - r * 0.8, y - r * 0.8); q.bezierCurveTo(x - r * 0.8, y + r * 0.6, x + r * 0.8, y - r * 0.6, x + r * 0.8, y + r * 0.8); q.stroke(); circ(q, x - r * 0.8, y - r * 0.8, r * 0.3); q.fill(); circ(q, x + r * 0.8, y + r * 0.8, r * 0.3); q.fill(); }
    else if (kind === 'dial') { circ(q, x, y, r * 0.95); q.stroke(); q.beginPath(); q.moveTo(x, y); q.lineTo(x + r * 0.5, y - r * 0.5); q.stroke(); }
    else if (kind === 'switch') { rr(q, x - r * 0.34, y - r, r * 0.68, r * 2, r * 0.34); q.stroke(); circ(q, x, y - r * 0.5, r * 0.5); q.fill(); }
    else if (kind === 'grid') { for (i = 0; i < 9; i++) { rr(q, x - r + (i % 3) * r * 0.7, y - r + Math.floor(i / 3) * r * 0.7, r * 0.56, r * 0.56, 2); if (i === 5) q.fill(); else { q.lineWidth = Math.max(1.5, r * 0.14); q.stroke(); } } }
    else if (kind === 'cells') { rr(q, x - r * 0.6, y - r * 0.7, r * 1.2, r * 1.7, r * 0.2); q.stroke(); q.fillRect(x - r * 0.25, y - r * 1.05, r * 0.5, r * 0.3); q.fillRect(x - r * 0.3, y, r * 0.6, r * 0.7); }
    else if (kind === 'blink') { circ(q, x, y + r * 0.1, r * 0.55); q.fill(); for (i = 0; i < 5; i++) { var a = Math.PI + i * Math.PI / 4; q.beginPath(); q.moveTo(x + Math.cos(a) * r * 0.8, y + r * 0.1 + Math.sin(a) * r * 0.8); q.lineTo(x + Math.cos(a) * r * 1.1, y + r * 0.1 + Math.sin(a) * r * 1.1); q.stroke(); } }
    else if (kind === 'cargo') { q.beginPath(); q.moveTo(x - r, y - r * 0.4); q.lineTo(x + r, y - r * 0.4); q.moveTo(x, y - r * 0.4); q.lineTo(x, y + r * 0.8); q.moveTo(x - r * 0.5, y + r * 0.85); q.lineTo(x + r * 0.5, y + r * 0.85); q.stroke(); circ(q, x - r * 0.8, y + r * 0.05, r * 0.3); q.fill(); circ(q, x + r * 0.8, y + r * 0.05, r * 0.3); q.fill(); }
    else { circ(q, x, y, r * 0.8); q.stroke(); for (i = 0; i < 6; i++) { circ(q, x + Math.cos(i * TAU / 6) * r * 0.8, y + Math.sin(i * TAU / 6) * r * 0.8, r * 0.22); q.fill(); } }
  }

  // ---------- things to tap ----------
  function reg(id, x, y, w, h, msg, local) { ctls.push({ id: id, x: T.x + x * T.s, y: T.y + y * T.s, w: w * T.s, h: h * T.s, msg: msg || null, local: local || null }); }
  function isDown(id) { return Date.now() - (ui.press[id] || 0) < 170; }
  // A chunky block that stands up from the panel: lit front, darker edge below. Returns how far it is pushed in.
  function block(q, id, x, y, w, h, fill, o) {
    o = o || {};
    var r = o.r === undefined ? 14 : o.r, dp = o.down ? 5 : isDown(id) ? 4 : 0;
    rr(q, x, y + 6, w, h - 6, r); q.fillStyle = shade(fill, -0.42); q.fill(); ol(q, 3);
    rr(q, x, y + dp, w, h - 6, r); q.fillStyle = lin(q, 0, y, 0, y + h, shade(fill, 0.2), fill); q.fill(); ol(q, 3);
    rr(q, x + 5, y + dp + 4, w - 10, (h - 6) * 0.3, Math.max(2, r - 5)); q.fillStyle = 'rgba(255,255,255,0.3)'; q.fill();
    if (o.down) { rr(q, x, y + dp, w, h - 6, r); q.fillStyle = 'rgba(27,42,73,0.14)'; q.fill(); }
    if (o.msg || o.local) reg(id, x, y, w, h, o.msg, o.local);
    return dp;
  }
  function knob(q, id, cx, cy, r, fill, o) {   // the same, round
    o = o || {};
    var dp = o.down ? 5 : isDown(id) ? 4 : 0;
    circ(q, cx, cy + 6, r); q.fillStyle = shade(fill, -0.42); q.fill(); ol(q, 3);
    circ(q, cx, cy + dp, r); q.fillStyle = lin(q, 0, cy - r, 0, cy + r, shade(fill, 0.2), fill); q.fill(); ol(q, 3);
    q.beginPath(); q.ellipse(cx - r * 0.3, cy + dp - r * 0.46, r * 0.4, r * 0.2, -0.5, 0, TAU); q.fillStyle = 'rgba(255,255,255,0.36)'; q.fill();
    if (o.down) { circ(q, cx, cy + dp, r); q.fillStyle = 'rgba(27,42,73,0.16)'; q.fill(); }
    if (o.msg || o.local) reg(id, cx - r, cy - r, r * 2, r * 2 + 6, o.msg, o.local);
    return dp;
  }
  function setBar(q, seen) {   // the wide bar that says "this is how it should be"
    var dp = block(q, 'set', 20, 240, 400, 58, seen ? GREEN : GREY, { r: 22, msg: { a: 'set' } });
    if (seen) tick(q, 220, 266 + dp, 15);
    else { rr(q, 180, 260 + dp, 80, 12, 6); q.fillStyle = GREY2; q.fill(); }
  }

  // ---------- the nine stations, each drawn in a box of 440 x 300 ----------
  // s = { kind, lv, done, pub }; e = what this tablet sees of it (nothing for Hands: every control is then a grey shape).
  var KIND = {};
  KIND.order = function (q, s, e, now, seen) {
    var p = s.pub, n = p.n, per = n <= 4 ? n : 3, rows = Math.ceil(n / per), r = n <= 3 ? 58 : n === 4 ? 47 : 50, gap = n === 4 ? 108 : 140, i, row, col, cnt, cx, cy, dp;
    for (i = 0; i < n; i++) {
      row = Math.floor(i / per); col = i % per; cnt = row === rows - 1 ? n - per * row : per;
      cx = 220 + (col - (cnt - 1) / 2) * gap; cy = rows === 1 ? 142 : 76 + row * 140;
      dp = knob(q, 'b' + i, cx, cy, r, e.cols ? COLS[e.cols[i]] : e.syms || e.nums ? '#F7F9FC' : GREY, { down: !!p.down[i], msg: { a: 'b', i: i } });
      if (e.syms) sym(q, e.syms[i], cx, cy + dp - 3, r * 0.5);
      if (e.nums) numOn(q, e.nums[i], cx, cy + dp - 2, r, !!e.cols);
      if (p.down[i] && seen) { circ(q, cx + r * 0.72, cy - r * 0.72, 13); q.fillStyle = GREEN; q.fill(); ol(q, 2.5); tick(q, cx + r * 0.72, cy - r * 0.72, 6); }
    }
  };
  KIND.hose = function (q, s, e, now, seen) {
    var p = s.pub, n = p.n, gap = 440 / n, i, j, x, col, dp, nd = p.nd, rows = nd > 11 ? 2 : 1, per = Math.ceil(nd / rows), cell, dr, k;
    function at(i) { return gap * (i + 0.5); }
    for (i = 0; i < n; i++) {   // the hoses that are plugged in run behind the fuel window
      j = p.link[i];
      if (j < 0) continue;
      q.beginPath(); q.moveTo(at(i), 90); q.bezierCurveTo(at(i), 160, at(j), 140, at(j), 218);
      q.lineCap = 'round'; q.lineWidth = 17; q.strokeStyle = NAVY; q.stroke(); q.lineWidth = 11; q.strokeStyle = e.tanks ? COLS[e.tanks[i]] : GREY2; q.stroke();
    }
    rr(q, 14, 108, 412, 72, 16); q.fillStyle = e.drops ? GLASS : seen ? '#3A456E' : '#CDD3DD'; q.fill(); ol(q, 3.5);
    cell = 404 / per; dr = Math.min(13, cell * 0.36);
    for (k = 0; k < nd; k++) {   // the drops to count
      x = 18 + cell * ((k % per) + 0.5); j = 144 + (rows === 1 ? 0 : (Math.floor(k / per) - 0.5) * 32);
      q.beginPath(); q.moveTo(x, j - dr * 1.25); q.quadraticCurveTo(x + dr * 1.3, j + dr * 0.5, x, j + dr); q.quadraticCurveTo(x - dr * 1.3, j + dr * 0.5, x, j - dr * 1.25); q.closePath();
      q.fillStyle = e.drops ? COLS[e.drops[k]] : seen ? '#56618F' : GREY2; q.fill(); ol(q, 2.5);
    }
    for (i = 0; i < n; i++) {   // the tanks
      x = at(i); col = e.tanks ? COLS[e.tanks[i]] : GREY;
      dp = block(q, 'tk' + i, x - 42, 4, 84, 86, col, { r: 20, down: p.link[i] >= 0, msg: { a: 'tk', i: i } });
      rr(q, x - 24, 22 + dp, 48, 14, 7); q.fillStyle = 'rgba(27,42,73,0.25)'; q.fill();
      circ(q, x, 58 + dp, 11); q.fillStyle = shade(col, -0.3); q.fill(); ol(q, 2.5);
      if (p.sel === i) {       // the hose of this tank is in Hands' hand
        rr(q, x - 48, -1, 96, 97, 24); q.lineWidth = 9; q.strokeStyle = NAVY; q.stroke(); q.lineWidth = 4; q.strokeStyle = '#fff'; q.stroke();
        q.beginPath(); q.moveTo(x, 90); q.quadraticCurveTo(x + 22, 108, x + 10, 126); q.lineCap = 'round'; q.lineWidth = 17; q.strokeStyle = NAVY; q.stroke(); q.lineWidth = 11; q.strokeStyle = e.tanks ? col : GREY2; q.stroke();
      }
    }
    for (j = 0; j < n; j++) {   // the sockets
      x = at(j);
      dp = block(q, 'so' + j, x - 42, 206, 84, 90, e.socks ? '#F7F9FC' : GREY, { r: 18, down: p.link.indexOf(j) >= 0, msg: { a: 'so', i: j } });
      circ(q, x, 224 + dp, 10); q.fillStyle = NAVY; q.fill();
      if (e.socks) sym(q, e.socks[j], x, 262 + dp, 19);
    }
  };
  KIND.dial = function (q, s, e, now, seen) {
    var p = s.pub, n = p.n, i, x, y, dp, cx = 326, cy = 84, a, know = e.val !== undefined;
    rr(q, 8, 10, 200, 218, 16); q.fillStyle = e.items ? GLASS : seen ? '#3A456E' : '#CDD3DD'; q.fill(); ol(q, 3.5);   // what is loaded
    for (i = 0; i < n; i++) {
      x = n === 1 ? 108 : n === 3 && i === 2 ? 108 : 58 + (i % 2) * 100; y = n <= 2 ? 119 : 66 + Math.floor(i / 2) * 106;
      rr(q, x - 38, y - 36, 76, 76, 12); q.fillStyle = e.items ? '#E9B872' : GREY; q.fill(); ol(q, 3);
      q.beginPath(); q.moveTo(x - 38, y - 12); q.lineTo(x + 38, y - 12); q.lineWidth = 2; q.strokeStyle = 'rgba(27,42,73,0.25)'; q.stroke();
      if (e.items) { plate(q, x, y + 4, 25); sym(q, e.items[i], x, y + 4, 15); }
    }
    circ(q, cx, cy + 5, 76); q.fillStyle = 'rgba(27,42,73,0.25)'; q.fill();                                              // the dial
    circ(q, cx, cy, 76); q.fillStyle = lin(q, 0, cy - 76, 0, cy + 76, seen ? '#7C8FB8' : '#C9CFD9', seen ? '#52628A' : '#A3ACBA'); q.fill(); ol(q, 4);
    circ(q, cx, cy, 60); q.fillStyle = know ? '#FFFDF4' : seen ? '#3A456E' : '#D5DAE3'; q.fill(); ol(q, 3);
    for (i = 0; i <= 10; i++) { a = Math.PI * 0.75 + i * Math.PI * 1.5 / 10; q.beginPath(); q.moveTo(cx + Math.cos(a) * 68, cy + Math.sin(a) * 68); q.lineTo(cx + Math.cos(a) * 74, cy + Math.sin(a) * 74); q.lineWidth = 3; q.strokeStyle = seen ? '#fff' : GREY2; q.stroke(); }
    if (know) {
      text(q, String(e.val), cx, cy + 3, 56, NAVY, 700);
      a = glide('dial', Math.PI * 0.75 + (e.val / (e.max || 1)) * Math.PI * 1.5);
      tri(q, cx + Math.cos(a) * 49, cy + Math.sin(a) * 49, 7, 0, RED);
    }
    dp = block(q, 'dn', 246, 170, 74, 60, seen ? '#FFFFFF' : GREY, { msg: { a: 'dn' } }); if (seen) tri(q, 283, 197 + dp, 14, 2, NAVY);
    dp = block(q, 'up', 332, 170, 74, 60, seen ? '#FFFFFF' : GREY, { msg: { a: 'up' } }); if (seen) tri(q, 369, 195 + dp, 14, 0, NAVY);
    setBar(q, seen);
  };
  KIND['switch'] = function (q, s, e, now, seen) {
    var p = s.pub, n = p.n, w = 420 / n, i, cx, up, ky, know = e.planet !== undefined;
    rr(q, 146, 2, 148, 92, 16); q.fillStyle = know ? GLASS : seen ? '#3A456E' : '#CDD3DD'; q.fill(); ol(q, 4);   // the screen with the planet
    if (know) {
      q.fillStyle = '#fff'; [[166, 20, 2], [270, 30, 1.6], [180, 74, 1.5], [262, 76, 2]].forEach(function (o) { circ(q, o[0], o[1], o[2]); q.fill(); });
      planetDraw(q, PLANETS[e.planet][0], PLANETS[e.planet][1], 220, 48, 27);
    }
    for (i = 0; i < n; i++) {
      cx = 10 + w * (i + 0.5); up = p.up[i];
      if (e.lamps) { circ(q, cx, 118, 14); q.fillStyle = COLS[e.lamps[i]]; q.fill(); ol(q, 3); circ(q, cx - 4, 113, 4); q.fillStyle = 'rgba(255,255,255,0.6)'; q.fill(); }
      else if (e.nums) { rr(q, cx - 19, 101, 38, 34, 9); q.fillStyle = '#fff'; q.fill(); ol(q, 3); text(q, String(e.nums[i]), cx, 119, 25, NAVY, 700); }
      else { circ(q, cx, 118, 14); q.fillStyle = seen ? '#56618F' : GREY2; q.fill(); ol(q, 3); }
      rr(q, cx - 14, 142, 28, 86, 14); q.fillStyle = seen ? '#39445F' : GREY2; q.fill(); ol(q, 3);
      ky = slide('sw' + i, up ? 160 : 210);
      circ(q, cx, ky + 4, 22); q.fillStyle = 'rgba(27,42,73,0.3)'; q.fill();
      circ(q, cx, ky, 22); q.fillStyle = up ? (seen ? YEL : '#E6E9EF') : (seen ? '#F7F9FC' : GREY); q.fill(); ol(q, 3);
      circ(q, cx - 6, ky - 7, 6); q.fillStyle = 'rgba(255,255,255,0.5)'; q.fill();
      reg('sw' + i, cx - w / 2, 98, w, 136, { a: 'sw', i: i });
    }
    setBar(q, seen);
  };
  KIND.grid = function (q, s, e, now, seen) {
    var p = s.pub, cw = 68, ch = p.ny > 3 ? 58 : 72, gx = Math.round((440 - 78 - p.nx * cw) / 2) + 78, gy = 62, i, x, y, c, r, mark, dp, str;
    rr(q, gx - 78, 2, 70, 54, 12); q.fillStyle = e.code ? GLASS : seen ? '#3A456E' : '#CDD3DD'; q.fill(); ol(q, 3.5);     // the number on the screen
    if (e.code) { str = e.code.join(' + '); text(q, str, gx - 43, 24, str.length > 2 ? 22 : 32, YEL, 700); }
    for (i = 0; i < p.need; i++) {   // how many stars the map wants
      if (seen) api.starPath(q, gx - 43 + (i - (p.need - 1) / 2) * 16, 46, 6); else circ(q, gx - 43 + (i - (p.need - 1) / 2) * 16, 44, 4.5);
      q.fillStyle = i < p.marks.length ? (seen ? YEL : '#fff') : (seen ? '#56618F' : GREY2); q.fill();
    }
    for (c = 0; c < p.nx; c++) { x = gx + c * cw + cw / 2; circ(q, x, 30, 22); q.fillStyle = e.colS ? '#fff' : GREY; q.fill(); ol(q, 3); if (e.colS) sym(q, e.colS[c], x, 30, 13); }
    for (r = 0; r < p.ny; r++) { y = gy + r * ch + ch / 2; rr(q, gx - 62, y - 20, 46, 40, 12); q.fillStyle = e.rowC ? COLS[e.rowC[r]] : GREY; q.fill(); ol(q, 3); }
    rr(q, gx - 4, gy - 4, p.nx * cw + 8, p.ny * ch + 8, 14); q.fillStyle = seen ? '#27356B' : '#A3ACBA'; q.fill(); ol(q, 3.5);
    for (i = 0; i < p.nx * p.ny; i++) {
      x = gx + (i % p.nx) * cw; y = gy + Math.floor(i / p.nx) * ch; mark = p.marks.indexOf(i) >= 0;
      dp = block(q, 'c' + i, x + 3, y + 3, cw - 6, ch - 6, mark ? (seen ? YEL : '#E6E9EF') : (seen ? '#6B7CC9' : GREY), { r: 10, down: mark, msg: { a: 'c', i: i } });
      if (mark && seen) { api.starPath(q, x + cw / 2, y + ch / 2 + dp - 2, 17); q.fillStyle = '#fff'; q.fill(); ol(q, 2.5); }
    }
  };
  KIND.cells = function (q, s, e, now, seen) {
    var p = s.pub, n = p.n, w = 420 / n, bw = Math.min(86, w - 10), i, cx, on, dp, know = e.tag !== undefined;
    rr(q, 158, 2, 124, 68, 16); q.fillStyle = know ? '#fff' : seen ? '#3A456E' : '#CDD3DD'; q.fill(); ol(q, 4);   // the sign on the battery box
    if (know) sym(q, e.tag, 220, 36, 23);
    for (i = 0; i < n; i++) {
      cx = 10 + w * (i + 0.5); on = p.on[i];
      rr(q, cx - 13, 80 + (on ? 5 : 0), 26, 16, 5); q.fillStyle = seen ? '#7C8FB8' : GREY2; q.fill(); ol(q, 3);
      dp = block(q, 'ce' + i, cx - bw / 2, 90, bw, 136, on ? (seen ? YEL : '#E6E9EF') : (e.nums ? '#F7F9FC' : GREY), { r: 16, down: !!on, msg: { a: 'ce', i: i } });
      if (e.nums) text(q, String(e.nums[i]), cx, 154 + dp, 46, NAVY, 700);
      if (on && seen) { rr(q, cx - bw / 2 + 8, 198 + dp, bw - 16, 10, 5); q.fillStyle = GREEN; q.fill(); ol(q, 2); }
    }
    setBar(q, seen);
  };
  KIND.blink = function (q, s, e, now, seen) {
    var p = s.pub, n = p.n, per = n <= 4 ? n : 3, i, c = -1, k = -1, t, cyc, x, y, w, h, dp, row, col, cnt;
    if (e.seq) { cyc = e.seq.length * 820 + 1400; t = (now - ui.blink0) % cyc; k = Math.floor(t / 820); if (k < e.seq.length && t % 820 < 580) c = e.seq[k]; else k = -1; }
    rr(q, 146, 0, 148, 104, 22); q.fillStyle = seen ? '#39445F' : '#CDD3DD'; q.fill(); ol(q, 4);
    if (c >= 0) { circ(q, 220, 48, 54); q.fillStyle = 'rgba(255,255,255,0.16)'; q.fill(); }
    circ(q, 220, 48, 38); q.fillStyle = c >= 0 ? COLS[c] : e.seq ? '#1F2740' : seen ? '#56618F' : GREY2; q.fill(); ol(q, 4);   // the lamp
    q.beginPath(); q.ellipse(208, 34, 13, 7, -0.5, 0, TAU); q.fillStyle = 'rgba(255,255,255,' + (c >= 0 ? 0.6 : 0.2) + ')'; q.fill();
    if (e.seq) for (i = 0; i < e.seq.length; i++) { circ(q, 220 + (i - (e.seq.length - 1) / 2) * 13, 94, i === k ? 4.5 : 3); q.fillStyle = i === k ? '#fff' : '#7482B8'; q.fill(); }
    for (i = 0; i < p.len; i++) {   // one peg for every press the lamp wants
      circ(q, 220 + (i - (p.len - 1) / 2) * 28, 122, 9); q.fillStyle = i < p.got ? (seen ? GREEN : '#F2F4F8') : (seen ? '#56618F' : GREY2); q.fill(); ol(q, 2.5);
    }
    for (i = 0; i < n; i++) {
      row = Math.floor(i / per); col = i % per; cnt = n <= 4 ? n : (row ? n - 3 : 3);
      w = n <= 4 ? Math.min(100, 420 / n - 8) : 128; h = n <= 4 ? 140 : 68;
      x = 220 + (col - (cnt - 1) / 2) * (w + 8) - w / 2; y = n <= 4 ? 146 : 142 + row * 78;
      dp = block(q, 'k' + i, x, y, w, h, e.keys ? '#F7F9FC' : GREY, { msg: { a: 'k', i: i } });
      if (e.keys) sym(q, e.keys[i], x + w / 2, y + h / 2 + dp - 3, n <= 4 ? 28 : 21);
    }
  };
  KIND.cargo = function (q, s, e, now, seen) {
    var p = s.pub, a = 0.03 * Math.sin(now / 700), px = 220, py = 56, arm = 140, i, x, y, dp;
    var lx = px - Math.cos(a) * arm, ly = py - Math.sin(a) * arm, rx = px + Math.cos(a) * arm, ry = py + Math.sin(a) * arm;
    for (i = 0; i < p.rounds; i++) { circ(q, 220 + (i - (p.rounds - 1) / 2) * 28, 14, 9); q.fillStyle = i < p.round ? (seen ? GREEN : '#F2F4F8') : (seen ? '#56618F' : GREY2); q.fill(); ol(q, 2.5); }
    poly(q, [178, 196, 262, 196, 246, 176, 194, 176]); q.fillStyle = seen ? '#7C8FB8' : GREY2; q.fill(); ol(q, 3);
    rr(q, px - 7, py, 14, 124, 5); q.fillStyle = seen ? lin(q, px - 7, 0, px + 7, 0, '#C3C9D2', '#7A8296') : GREY; q.fill(); ol(q, 3);
    q.beginPath(); q.moveTo(lx, ly); q.lineTo(rx, ry); q.lineCap = 'round'; q.lineWidth = 13; q.strokeStyle = NAVY; q.stroke(); q.lineWidth = 7; q.strokeStyle = seen ? YEL : '#DCE0E7'; q.stroke();
    circ(q, px, py, 10); q.fillStyle = seen ? '#FF7A45' : GREY; q.fill(); ol(q, 3);
    function pan(cx, cy, cnt, draw) {
      var k, bx;
      q.beginPath(); q.moveTo(cx, cy); q.lineTo(cx - 62, cy + 104); q.moveTo(cx, cy); q.lineTo(cx + 62, cy + 104); q.lineWidth = 2.5; q.strokeStyle = NAVY; q.stroke();
      poly(q, [cx - 70, cy + 104, cx + 70, cy + 104, cx + 58, cy + 118, cx - 58, cy + 118]); q.fillStyle = seen ? lin(q, 0, cy + 104, 0, cy + 118, '#E3B36F', '#B77B45') : GREY; q.fill(); ol(q, 3);
      for (k = 0; k < cnt; k++) { bx = cx + (k - (cnt - 1) / 2) * 44; draw(k, bx, cy + 104); }
    }
    pan(lx, ly, p.nl, function (k, bx, by) {      // crates with a sign
      rr(q, bx - 20, by - 40, 40, 40, 6); q.fillStyle = e.crates ? '#E9B872' : seen ? '#9AA5BD' : GREY; q.fill(); ol(q, 3);
      if (e.crates) { circ(q, bx, by - 20, 14); q.fillStyle = '#fff'; q.fill(); sym(q, e.crates[k], bx, by - 20, 9.5); }
    });
    pan(rx, ry, p.nr, function (k, bx, by) {      // barrels with a colour
      rr(q, bx - 18, by - 44, 36, 44, 10); q.fillStyle = e.barrels ? COLS[e.barrels[k]] : seen ? '#9AA5BD' : GREY; q.fill(); ol(q, 3);
      q.beginPath(); q.moveTo(bx - 18, by - 30); q.lineTo(bx + 18, by - 30); q.moveTo(bx - 18, by - 14); q.lineTo(bx + 18, by - 14); q.lineWidth = 2.5; q.strokeStyle = 'rgba(27,42,73,0.45)'; q.stroke();
    });
    for (i = 0; i < 3; i++) {   // which side is heavier: left, the same, right
      x = 10 + i * 145;
      dp = block(q, 'pk' + i, x, 210, 130, 86, seen ? '#FFFFFF' : GREY, { r: 18, msg: { a: 'pk', i: i } });
      if (!seen) continue;
      y = 250 + dp; a = (i - 1) * 0.3;
      q.save(); q.translate(x + 65, y - 6); q.rotate(a);
      q.beginPath(); q.moveTo(-40, 0); q.lineTo(40, 0); q.lineCap = 'round'; q.lineWidth = 8; q.strokeStyle = NAVY; q.stroke();
      q.restore();
      poly(q, [x + 65, y - 4, x + 79, y + 20, x + 51, y + 20]); q.fillStyle = NAVY; q.fill();
    }
  };
  KIND.wheels = function (q, s, e, now, seen) {
    var p = s.pub, n = p.n, m = p.m, R = n === 3 ? 68 : 52, gap = 440 / n, step = TAU / m, cy = 122, i, k, cx, a, ka, top, x, y;
    for (i = 0; i < n; i++) {
      cx = gap * (i + 0.5);
      a = glide('w' + i, -(e.pos ? e.pos[i] : (ui.spin['w' + i] || 0)) * step);
      circ(q, cx + 3, cy + 6, R); q.fillStyle = 'rgba(27,42,73,0.28)'; q.fill();
      circ(q, cx, cy, R); q.fillStyle = e.rims ? COLS[e.rims[i]] : GREY; q.fill(); ol(q, 4);
      circ(q, cx, cy, R - 11); q.fillStyle = e.rings ? '#FFFDF4' : seen ? '#C9D2E3' : '#D5DAE3'; q.fill(); ol(q, 3);
      for (k = 0; k < m; k++) {
        ka = a + k * step - Math.PI / 2; x = cx + Math.cos(ka) * (R - 11) * 0.66; y = cy + Math.sin(ka) * (R - 11) * 0.66;
        top = e.pos && k === e.pos[i];
        if (e.rings) sym(q, e.rings[i][k], x, y, R * (top ? 0.23 : 0.17), top ? NAVY : '#5B6890');
        else { circ(q, x, y, R * 0.1); q.fillStyle = GREY2; q.fill(); }
      }
      circ(q, cx, cy, R * 0.16); q.fillStyle = seen ? '#7C8FB8' : GREY2; q.fill(); ol(q, 3);
      tri(q, cx, cy - R - 13, 10, 2, seen ? RED : GREY2);     // the mark at the top
      reg('w' + i, cx - R, cy - R - 8, R * 2, R * 2 + 16, { a: 'w', i: i });
    }
    setBar(q, seen);
  };

  // ---------- the mission book: pages of picture tokens (no sentences) ----------
  function tokW(t) { return t.d !== undefined ? 1.9 : t.o !== undefined ? 0.62 : t.a !== undefined ? 0.74 : 1; }
  function tokDraw(q, t, x, y, S) {   // x: the left edge of its place, y: the middle, S: the size of one place
    var cx = x + tokW(t) * S / 2, r = S * 0.4, i, n, per, dx, dy, dr;
    if (t.c !== undefined) { rr(q, cx - r, y - r, r * 2, r * 2, r * 0.42); q.fillStyle = COLS[t.c]; q.fill(); ol(q, Math.max(2, S * 0.06)); rr(q, cx - r * 0.7, y - r * 0.74, r * 1.4, r * 0.5, r * 0.2); q.fillStyle = 'rgba(255,255,255,0.3)'; q.fill(); }
    else if (t.s !== undefined) { plate(q, cx, y, r); sym(q, t.s, cx, y, r * 0.6); }
    else if (t.n !== undefined) { circ(q, cx, y, r); q.fillStyle = NAVY; q.fill(); text(q, String(t.n), cx, y + 1, r * (String(t.n).length > 1 ? 1.05 : 1.3), '#fff', 700); }
    else if (t.p !== undefined) planetDraw(q, PLANETS[t.p][0], PLANETS[t.p][1], cx, y, r * 0.86);
    else if (t.o !== undefined) text(q, t.o, cx, y + 1, S * 0.6, NAVY, 700);
    else if (t.a !== undefined) arrow(q, cx, y, S * 0.3, t.a, NAVY);
    else if (t.d !== undefined) {     // drops to count, in rows of four
      n = t.d; per = Math.min(4, n); dr = Math.min(S * 0.16, S * 1.7 / (per * 2.7));
      for (i = 0; i < n; i++) {
        dx = cx + ((i % per) - (Math.min(per, n - Math.floor(i / per) * per) - 1) / 2) * dr * 2.7; dy = y + (Math.floor(i / per) - (Math.ceil(n / per) - 1) / 2) * dr * 2.9;
        q.beginPath(); q.moveTo(dx, dy - dr * 1.3); q.quadraticCurveTo(dx + dr * 1.3, dy + dr * 0.5, dx, dy + dr); q.quadraticCurveTo(dx - dr * 1.3, dy + dr * 0.5, dx, dy - dr * 1.3); q.closePath();
        q.fillStyle = '#BFE3FF'; q.fill(); ol(q, 2);
      }
    } else if (t.k === 'box') { rr(q, cx - r, y - r, r * 2, r * 2, r * 0.3); q.fillStyle = '#E9B872'; q.fill(); ol(q, 2.5); }
    else if (t.k === 'dial') { circ(q, cx, y, r); q.fillStyle = '#FFFDF4'; q.fill(); ol(q, 2.5); q.beginPath(); q.moveTo(cx, y); q.lineTo(cx + r * 0.55, y - r * 0.55); q.lineWidth = 3; q.strokeStyle = RED; q.stroke(); }
    else if (t.k === 'cell') { rr(q, cx - r * 0.62, y - r * 0.8, r * 1.24, r * 1.8, r * 0.25); q.fillStyle = YEL; q.fill(); ol(q, 2.5); rr(q, cx - r * 0.25, y - r * 1.1, r * 0.5, r * 0.32, 2); q.fillStyle = NAVY; q.fill(); }
    else if (t.k === 'wheel') { circ(q, cx, y, r); q.fillStyle = '#FFFDF4'; q.fill(); ol(q, 2.5); circ(q, cx, y, r * 0.3); q.fillStyle = NAVY; q.fill(); tri(q, cx, y - r - 3, r * 0.3, 2, RED); }
  }
  function pageDraw(q, pg) {
    var rows = pg.rows, n = rows.length, cols = n >= 5 ? 2 : 1, per = Math.ceil(n / cols), colW = 396 / cols, cellH = 232 / per, i, j, row, units, S, x, y, c, maxU = 0, hx;
    rr(q, 4, 6, 440, 300, 16); q.fillStyle = 'rgba(11,20,55,0.3)'; q.fill();
    rr(q, 0, 0, 440, 300, 16); q.fillStyle = '#FFFDF4'; q.fill();
    q.save(); rr(q, 0, 0, 440, 300, 16); q.clip(); q.fillStyle = '#FFE39A'; q.fillRect(0, 0, 440, 54); q.fillStyle = 'rgba(27,42,73,0.12)'; q.fillRect(0, 54, 440, 3); q.restore();
    rr(q, 0, 0, 440, 300, 16); ol(q, 4);
    for (i = 0; i < 5; i++) { rr(q, -9, 34 + i * 54, 26, 13, 6); q.fillStyle = lin(q, 0, 34 + i * 54, 0, 47 + i * 54, '#D4D9E1', '#8A93A8'); q.fill(); ol(q, 2.5); }   // the rings that hold the book
    circ(q, 52, 27, 20); q.fillStyle = BODY[pg.kind] || '#5AA9FF'; q.fill(); ol(q, 3); kico(q, pg.kind, 52, 27, 10, '#fff');
    if (pg.head) { hx = 88; pg.head.forEach(function (t) { tokDraw(q, t, hx, 28, 36); hx += tokW(t) * 36; }); }
    if (pg.part) text(q, '· · ·', 404, 28, 22, NAVY, 700);      // another Book has the rest of this chapter
    rows.forEach(function (r) { var u = 0; r.forEach(function (t) { u += tokW(t); }); if (u > maxU) maxU = u; });
    S = Math.min(cellH - 8, (colW - 14) / maxU, 66);
    for (i = 0; i < n; i++) {
      c = Math.floor(i / per); j = i % per; row = rows[i]; units = 0;
      row.forEach(function (t) { units += tokW(t); });
      x = 32 + c * colW + (colW - units * S) / 2; y = 62 + cellH * (j + 0.5);
      if (j) { q.beginPath(); q.moveTo(38 + c * colW, 62 + cellH * j); q.lineTo(22 + (c + 1) * colW, 62 + cellH * j); q.lineWidth = 2; q.strokeStyle = 'rgba(27,42,73,0.13)'; q.stroke(); }
      row.forEach(function (t) { tokDraw(q, t, x, y, S); x += tokW(t) * S; });
    }
    if (cols > 1) { q.beginPath(); q.moveTo(32 + colW, 68); q.lineTo(32 + colW, 288); q.lineWidth = 2; q.strokeStyle = 'rgba(27,42,73,0.13)'; q.stroke(); }
  }

  // ---------- the layout of one screen ----------
  function layout() {
    var pad = W < 900 ? 8 : 12, top = 66, sideW = Math.round(clamp(W * 0.3, 236, 400)), gh = Math.round(clamp(H * 0.2, 88, 150)), rh;
    lay = { pad: pad, top: top, capH: 24, gy: H - gh, gh: gh,
      side: { x: W - sideW - pad, y: top, w: sideW, h: H - top - pad },
      main: { x: pad, y: top, w: W - sideW - pad * 3, h: H - top - pad } };
    rh = Math.round(Math.min(H * 0.54, lay.gy - top - 30));
    lay.rk = { x: Math.round(lay.side.x + sideW * 0.62), y: lay.gy + Math.round(gh * 0.14), h: rh, w: Math.round(rh * 0.25) };
    lay.pl = { r: Math.round(clamp(sideW * 0.11, 26, 44)) };
    lay.pl.x = lay.side.x + lay.pl.r + 14; lay.pl.y = top + lay.pl.r + 16;
    lay.tw = { x: lay.rk.x - lay.rk.w / 2 - rh * 0.27, w: rh * 0.12, top: lay.rk.y - rh * 0.93, bot: lay.rk.y - 6 };
    if (el.panel) {
      el.panel.style.left = lay.main.x + 'px'; el.panel.style.top = lay.main.y + 'px';
      el.panel.style.width = Math.min(lay.main.w, 780) + 'px'; el.panel.style.maxHeight = lay.main.h + 'px';
      el.cap.style.left = lay.main.x + 'px'; el.cap.style.width = lay.main.w + 'px'; el.cap.style.top = (H - pad - 22) + 'px';
    }
  }
  function resize() {
    if (!root) return;
    W = root.clientWidth || window.innerWidth; H = root.clientHeight || window.innerHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    layout();
    bg.key = '';
  }

  // ---------- the launch site: painted once per destination and size, then reused as a picture ----------
  function paintBg(q, d) {
    var D = DEST[d], gy = lay.gy, R = lay.rk, P = lay.pl, TW = lay.tw, h = R.h, i, x, y, pw, gr, seg;
    gr = q.createLinearGradient(0, 0, 0, gy); gr.addColorStop(0, D.sky[0]); gr.addColorStop(0.62, D.sky[1]); gr.addColorStop(1, D.sky[2]);
    q.fillStyle = gr; q.fillRect(0, 0, W, gy);
    q.fillStyle = '#fff';
    for (i = 0; i < 110; i++) { q.globalAlpha = 0.3 + prnd(i + 40) * 0.65; circ(q, prnd(i * 3 + d * 7) * W, prnd(i * 3 + 1) * gy * 0.86, 0.7 + prnd(i * 3 + 2) * 1.5); q.fill(); }
    q.globalAlpha = 1;
    gr = q.createRadialGradient(P.x, P.y, P.r * 0.6, P.x, P.y, P.r * 2.4); gr.addColorStop(0, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    q.fillStyle = gr; circ(q, P.x, P.y, P.r * 2.4); q.fill();
    planetDraw(q, D.pl[0], D.pl[1], P.x, P.y, P.r);                 // where the rocket is going
    q.fillStyle = shade(D.sky[1], -0.5);                             // hills far away
    q.beginPath(); q.moveTo(0, gy);
    for (x = 0; x <= W + 30; x += 30) q.lineTo(x, gy - 14 - 30 * Math.abs(Math.sin(x / 210 + d * 2)) - 8 * Math.sin(x / 61));
    q.lineTo(W, gy); q.closePath(); q.fill();
    q.fillStyle = lin(q, 0, gy, 0, H, shade(D.ground, -0.18), shade(D.ground, 0.12)); q.fillRect(0, gy, W, H - gy);   // the concrete field
    q.strokeStyle = 'rgba(27,42,73,0.16)'; q.lineWidth = 2;
    for (i = -14; i <= 14; i++) { q.beginPath(); q.moveTo(R.x + i * W / 16, gy); q.lineTo(R.x + i * W / 16 * 2.4, H); q.stroke(); }
    [0.34, 0.72].forEach(function (k) { q.beginPath(); q.moveTo(0, gy + lay.gh * k); q.lineTo(W, gy + lay.gh * k); q.stroke(); });
    q.fillStyle = lin(q, 0, gy, 0, gy + 22, 'rgba(11,20,55,0.35)', 'rgba(11,20,55,0)'); q.fillRect(0, gy, W, 22);
    q.fillStyle = NAVY; q.fillRect(0, gy - 1.5, W, 3);
    // the pad: a slab with a lit top, a striped front and a darker side
    pw = h * 0.74; x = R.x - pw / 2 - h * 0.1; y = R.y;
    q.fillStyle = 'rgba(11,20,55,0.25)'; q.beginPath(); q.ellipse(R.x + 16, y + 22, pw * 0.62, 12, 0, 0, TAU); q.fill();
    poly(q, [x + pw, y + 4, x + pw + 16, y - 10, x + pw + 16, y + 8, x + pw, y + 20]); q.fillStyle = '#5F6A80'; q.fill(); ol(q, 3);
    poly(q, [x, y + 4, x + 16, y - 10, x + pw + 16, y - 10, x + pw, y + 4]); q.fillStyle = '#C9D2E0'; q.fill(); ol(q, 3);
    rr(q, x, y + 4, pw, 16, 3); q.fillStyle = YEL; q.fill();
    q.save(); rr(q, x, y + 4, pw, 16, 3); q.clip(); q.fillStyle = NAVY;
    for (i = -1; i < pw / 22 + 1; i++) { poly(q, [x + i * 22, y + 20, x + i * 22 + 10, y + 20, x + i * 22 + 22, y + 4, x + i * 22 + 12, y + 4]); q.fill(); }
    q.restore(); rr(q, x, y + 4, pw, 16, 3); ol(q, 3);
    // the gantry tower
    seg = TW.w * 1.15;
    q.lineCap = 'round'; q.lineJoin = 'round';
    function beam(pts, w, col) { q.beginPath(); q.moveTo(pts[0], pts[1]); for (var k = 2; k < pts.length; k += 2) q.lineTo(pts[k], pts[k + 1]); q.lineWidth = w + 5; q.strokeStyle = NAVY; q.stroke(); q.lineWidth = w; q.strokeStyle = col; q.stroke(); }
    for (y = TW.bot, i = 0; y - seg > TW.top - 2; y -= seg, i++) beam(i % 2 ? [TW.x, y, TW.x + TW.w, y - seg] : [TW.x + TW.w, y, TW.x, y - seg], 3, '#C7402B');
    beam([TW.x, TW.bot, TW.x, TW.top], 5, '#F0654A'); beam([TW.x + TW.w, TW.bot, TW.x + TW.w, TW.top], 5, '#C7402B');
    for (y = TW.bot - seg * 2; y > TW.top; y -= seg * 2) beam([TW.x - 5, y, TW.x + TW.w + 5, y], 4, '#F0654A');
    beam([TW.x - 7, TW.top, TW.x + TW.w + 7, TW.top], 6, '#F0654A');
    beam([TW.x + TW.w / 2, TW.top, TW.x + TW.w / 2, TW.top - h * 0.07], 3, '#F0654A');
  }
  function bgSprite(d) {
    var key = d + ':' + W + 'x' + H + '@' + dpr, s, q;
    if (bg.key !== key || !bg.cv) {
      s = bg.cv || document.createElement('canvas');
      s.width = Math.round(W * dpr); s.height = Math.round(H * dpr);
      q = s.getContext('2d'); q.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintBg(q, d);
      bg.key = key; bg.cv = s;
    }
    return bg.cv;
  }

  // ---------- the rocket ----------
  function rocket(q, x, y, h, w, flame, now) {   // stands on (x, y); flame 0..1
    var i, f, fw;
    if (flame > 0) {
      f = flame * (0.85 + 0.15 * Math.sin(now / 37)); fw = w * 0.42;
      [['#FF7A1F', 1, 0.62], ['#FFD93B', 0.72, 0.42], ['#FFFFFF', 0.4, 0.22]].forEach(function (o, k) {
        var len = h * o[2] * f * (1 + 0.08 * Math.sin(now / 29 + k)), hw = fw * o[1];
        q.beginPath(); q.moveTo(x - hw, y - 2); q.quadraticCurveTo(x - hw * 1.2, y + len * 0.45, x, y + len); q.quadraticCurveTo(x + hw * 1.2, y + len * 0.45, x + hw, y - 2); q.closePath();
        q.fillStyle = o[0]; q.fill(); if (!k) ol(q, 3);
      });
    }
    [-1, 1].forEach(function (sd) {   // the two fins
      poly(q, [x + sd * w * 0.48, y - h * 0.3, x + sd * (w * 0.5 + h * 0.15), y - h * 0.03, x + sd * (w * 0.5 + h * 0.15), y + h * 0.02, x + sd * w * 0.46, y - h * 0.07]);
      q.fillStyle = sd < 0 ? '#12A0B5' : '#0A6B7C'; q.fill(); ol(q, 3.5);
    });
    poly(q, [x - w * 0.3, y - h * 0.07, x + w * 0.3, y - h * 0.07, x + w * 0.4, y, x - w * 0.4, y]); q.fillStyle = '#4A5468'; q.fill(); ol(q, 3.5);   // the engine
    function body() {
      q.beginPath(); q.moveTo(x - w / 2, y - h * 0.07); q.lineTo(x - w / 2, y - h * 0.68);
      q.bezierCurveTo(x - w / 2, y - h * 0.86, x - w * 0.2, y - h * 0.96, x, y - h); q.bezierCurveTo(x + w * 0.2, y - h * 0.96, x + w / 2, y - h * 0.86, x + w / 2, y - h * 0.68);
      q.lineTo(x + w / 2, y - h * 0.07); q.closePath();
    }
    body(); i = q.createLinearGradient(x - w / 2, 0, x + w / 2, 0); i.addColorStop(0, '#FFFFFF'); i.addColorStop(0.55, '#EEF3FA'); i.addColorStop(1, '#B4C1D6'); q.fillStyle = i; q.fill();
    q.save(); body(); q.clip();
    q.fillStyle = lin(q, x - w / 2, 0, x + w / 2, 0, '#14B3CA', '#0A6B7C'); q.fillRect(x - w, y - h * 1.02, w * 2, h * 0.27);      // the nose
    q.fillStyle = YEL; q.fillRect(x - w, y - h * 0.4, w * 2, h * 0.045);
    q.fillStyle = '#0C8599'; q.fillRect(x - w, y - h * 0.16, w * 2, h * 0.1);
    q.restore();
    body(); ol(q, 4);
    circ(q, x, y - h * 0.57, w * 0.27); q.fillStyle = YEL; q.fill(); ol(q, 3);                                  // the window
    circ(q, x, y - h * 0.57, w * 0.18); q.fillStyle = '#8FD3FF'; q.fill(); ol(q, 2.5);
    circ(q, x - w * 0.06, y - h * 0.585, w * 0.06); q.fillStyle = 'rgba(255,255,255,0.8)'; q.fill();
    api.starPath(q, x, y - h * 0.28, w * 0.2); q.fillStyle = '#FF7A45'; q.fill(); ol(q, 2.5);
  }
  function puff(x, y, vx, vy, r, life, col) { if (ui.puffs.length < 90) ui.puffs.push({ x: x, y: y, vx: vx, vy: vy, r: r, t: 0, life: life, col: col || '#fff' }); }
  function drawPuffs(dt) {
    var i, p, k;
    for (i = ui.puffs.length - 1; i >= 0; i--) {
      p = ui.puffs[i]; p.t += dt;
      if (p.t >= p.life) { ui.puffs.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; k = p.t / p.life;
      g.globalAlpha = 0.85 * (1 - k * k);
      circ(g, p.x, p.y, p.r * (1 + k * 2.4)); g.fillStyle = p.col; g.fill();
    }
    g.globalAlpha = 1;
  }
  function drawSite(now, dt) {
    var R = lay.rk, TW = lay.tw, phase = st ? st.phase : 'lobby', tL = (now - ui.phaseAt) / 1000, lift = 0, flame = 0, shake = 0, arm = 1, n, i, y, lamp, ax, k, px, py, a, sc, low;
    if (phase === 'launch') {
      flame = clamp(tL / 0.5, 0, 1); arm = 1 - ease(tL / 0.8);
      if (tL > 0.9) lift = 0.6 * H * (tL - 0.9) * (tL - 0.9);
      if (tL < 3.2) shake = Math.sin(now / 23) * 2;
      if (tL < 2.6) for (i = 0; i < 2; i++) puff(R.x + (Math.random() - 0.5) * R.w, R.y - 4, (Math.random() - 0.5) * 420, -Math.random() * 30, 9 + Math.random() * 8, 1.5 + Math.random(), i ? '#fff' : '#E4E9F2');
    } else if (phase === 'fail') {
      if (tL < 2 && now - ui.puffAt > 45) { ui.puffAt = now; puff(R.x + (Math.random() < 0.5 ? -1 : 1) * R.w * 0.5, R.y - R.h * (0.08 + Math.random() * 0.3), (Math.random() - 0.5) * 220, -50 - Math.random() * 60, 9 + Math.random() * 8, 2 + Math.random() * 1.4, Math.random() < 0.5 ? '#fff' : '#E4E9F2'); }
    } else if (now - ui.puffAt > 700) { ui.puffAt = now; puff(R.x + (Math.random() - 0.5) * R.w * 1.4, R.y - 6, (Math.random() - 0.5) * 30, -16, 4, 2, '#fff'); }
    // the arm that holds the rocket, and one lamp on the tower for every station
    ax = TW.x + TW.w; y = R.y - R.h * 0.5;
    if (arm > 0.02) {
      g.beginPath(); g.moveTo(ax, y); g.lineTo(ax + (R.x - R.w / 2 - ax + 4) * arm, y); g.lineCap = 'round'; g.lineWidth = 11; g.strokeStyle = NAVY; g.stroke(); g.lineWidth = 6; g.strokeStyle = '#F0654A'; g.stroke();
    }
    n = st && st.st ? st.st.length : 0; low = phase === 'play' && st.left - (st.run ? now - stAt : 0) < 15000;
    for (i = 0; i < n; i++) {
      lamp = st.st[i].done || phase === 'launch';
      circ(g, TW.x + TW.w / 2, TW.bot - (i + 1) * (TW.bot - TW.top) / (n + 1), Math.max(5, TW.w * 0.26));
      g.fillStyle = lamp ? GREEN : phase === 'fail' ? '#7A1F30' : i === st.focus && Math.floor(now / 450) % 2 ? YEL : '#55617E'; g.fill(); ol(g, 2.5);
    }
    circ(g, TW.x + TW.w / 2, TW.top - R.h * 0.07, 6); g.fillStyle = phase === 'fail' || (low && Math.floor(now / 250) % 2) ? RED : Math.floor(now / 800) % 2 ? '#FF9FAE' : '#8A2A3A'; g.fill(); ol(g, 2.5);
    if (lift < H + R.h * 1.4) rocket(g, R.x + shake, R.y - lift, R.h, R.w, flame, now);
    if (phase === 'launch' && lift > 0 && lift < H + R.h) for (i = 0; i < 2; i++) puff(R.x + (Math.random() - 0.5) * 14, R.y - lift + R.h * 0.3, (Math.random() - 0.5) * 60, 60, 8, 1.1, '#F1F4F9');
    drawPuffs(dt);
    if (phase === 'launch' && tL > 2.5) {   // far away: the little rocket flies to where it is going
      k = ease((tL - 2.5) / 2.6); px = R.x + (lay.pl.x + lay.pl.r * 0.9 - R.x) * k; py = lay.top - 30 + (lay.pl.y - lay.top + 30) * k - Math.sin(k * Math.PI) * -30;
      a = Math.atan2(lay.pl.y - lay.top + 30, lay.pl.x - R.x) + Math.PI / 2; sc = 0.2 * (1 - 0.45 * k);
      if (k < 1) { g.save(); g.translate(px, py); g.rotate(a); rocket(g, 0, R.h * sc * 0.5, R.h * sc, R.w * sc, 1, now); g.restore(); }
      else {
        api.starPath(g, lay.pl.x + lay.pl.r * 0.9, lay.pl.y - lay.pl.r * 0.2, 9 + 3 * Math.sin(now / 160)); g.fillStyle = YEL; g.fill(); ol(g, 2.5);
        circ(g, lay.pl.x, lay.pl.y, lay.pl.r * (1.3 + ((now / 900) % 1) * 0.8)); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,' + (0.7 * (1 - (now / 900) % 1)) + ')'; g.stroke();
      }
    }
  }

  // ---------- the family at their consoles ----------
  function people() {
    var all = api.players(), list = [];
    if (st) st.who.forEach(function (w) { if (all[w.id]) list.push({ p: all[w.id], w: w }); });
    return list;
  }
  function roleIcons(r) { return r === 'W' ? [ROLE.W.ico] : r.split('').map(function (c) { return ROLE[c].ico; }); }
  function isQuiet(r) { return !!(st && st.mis && st.mis.quiet && r !== 'W' && r.indexOf(st.mis.quiet) >= 0 && (st.phase === 'play' || st.phase === 'brief')); }
  function drawPeople(now) {
    var list = people(), n = list.length, S = lay.side, me = api.myId(), phase = st.phase, tL = (now - ui.phaseAt) / 1000;
    if (!n) return;
    var rows = n > 4 ? 2 : 1, per = Math.ceil(n / rows), sc = clamp(S.w / (per * 96), 0.4, 0.72) * clamp(H / 600, 0.82, 1.2) * (rows > 1 ? 0.9 : 1), tagS = clamp(sc * 1.3, 0.6, 0.95) * (rows > 1 ? 0.86 : 1);
    var cheer = phase === 'launch' && tL > 0.9 && tL < 6;
    list.forEach(function (o, i) {
      var row = Math.floor(i / per), col = i % per, cnt = row === rows - 1 ? n - per * row : per;
      o.x = S.x + 4 + (S.w - 8) * (col + 0.5) / cnt + (rows > 1 ? (row ? -0.2 : 0.2) * (S.w - 8) / per : 0);   // two rows: the front row stands in the gaps
      o.y = Math.min(lay.gy + lay.gh * (rows === 1 ? 0.74 : row ? 0.9 : 0.16), H - 12 * sc - 3);
      o.hi = rows === 1 && cnt > 2 && col % 2 ? 1 : 0;      // every second name tag sits higher, so they do not cover each other
    });
    list.sort(function (a, b) { return a.y - b.y; });
    list.forEach(function (o) {
      var p = o.p, id = p.id, r = o.w.r, h, top, k, icons, bx, dw = 60 * sc, dh = 20 * sc, dk = o.y + 10 * sc, gain, s, sig, age;
      g.fillStyle = 'rgba(11,20,55,0.3)'; g.beginPath(); g.ellipse(o.x + 5 * sc, o.y, 34 * sc, 9 * sc, 0, 0, TAU); g.fill();
      h = api.drawAvatar(g, p, o.x, o.y - 4 * sc, now / 1000 + id * 0.7, { scale: sc, facing: 1, moving: cheer || now - (ui.hop[id] || 0) < 450 });
      // the console in front of them: lit top, darker front
      poly(g, [o.x - dw / 2, dk - dh, o.x - dw / 2 + 7 * sc, dk - dh - 7 * sc, o.x + dw / 2 + 7 * sc, dk - dh - 7 * sc, o.x + dw / 2, dk - dh]); g.fillStyle = '#DCE6F2'; g.fill(); ol(g, 2.5);
      poly(g, [o.x + dw / 2, dk - dh, o.x + dw / 2 + 7 * sc, dk - dh - 7 * sc, o.x + dw / 2 + 7 * sc, dk - 7 * sc, o.x + dw / 2, dk]); g.fillStyle = '#34466E'; g.fill(); ol(g, 2.5);
      rr(g, o.x - dw / 2, dk - dh, dw, dh, 4 * sc); g.fillStyle = lin(g, 0, dk - dh, 0, dk, '#6F86B5', '#4A5F8C'); g.fill(); ol(g, 2.5);
      rr(g, o.x - dw * 0.3, dk - dh * 0.76, dw * 0.6, dh * 0.5, 3 * sc); g.fillStyle = r === 'W' ? '#55617E' : Math.floor(now / 600 + id) % 2 ? '#8FF0B0' : '#5ED68A'; g.fill(); ol(g, 2);
      top = o.y - 4 * sc - h - 6 * sc - o.hi * 46 * tagS;
      g.save(); g.translate(o.x, top); g.scale(tagS, tagS);
      k = api.nameTag(g, p, 0, 0, id === me);
      icons = roleIcons(r);
      if (isQuiet(r)) icons.push('🔇');
      bx = -(icons.length * 30) / 2;
      icons.forEach(function (ic, j) {   // the part of this player
        circ(g, bx + 15 + j * 30, -k - 17, 14); g.fillStyle = ic === ROLE.H.ico ? YEL : ic === '🔇' ? '#DCD3FF' : '#fff'; g.fill(); ol(g, 2.5);
        text(g, ic, bx + 15 + j * 30, -k - 16, 16);
      });
      g.restore();
      top -= (k + 34) * tagS;
      for (s = ui.sigs.length - 1; s >= 0; s--) if (ui.sigs[s].id === id) { sig = ui.sigs[s]; break; }   // what they just signalled
      if (sig && now - sig.t < 3000) {
        age = now - sig.t; g.globalAlpha = age < 2500 ? 1 : 1 - (age - 2500) / 500;
        rr(g, o.x - 17, top - 38, 34, 34, 11); g.fillStyle = '#fff'; g.fill(); ol(g, 2.5);
        sigIcon(g, sig.k, sig.v, o.x, top - 21, 11);
        g.globalAlpha = 1;
      }
      gain = phase === 'launch' && st.res && st.res.stars ? st.res.stars[id] : 0;
      if (gain && tL > 1.4 && tL < 4.4) {   // the stars this player just earned float up
        k = (tL - 1.4) / 3; s = '+' + gain + ' ⭐';
        g.globalAlpha = 1 - k * k; g.font = '700 ' + Math.round(34 * tagS) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
        g.lineWidth = 7; g.strokeStyle = NAVY; g.strokeText(s, o.x, top - 14 - k * 50); g.fillStyle = YEL; g.fillText(s, o.x, top - 14 - k * 50);
        g.globalAlpha = 1;
      }
    });
  }

  // ---------- the control panel (or the mission book) on the left ----------
  function pageFor(i) { var list = st.pages || [], k; for (k = 0; k < list.length; k++) if (list[k].st === i) return list[k]; return null; }
  function bookSide() { var me = st.me; return !!me.B && ((!me.E && !me.H) || ui.tab === 'book'); }
  function drawTabs(fx, fy, fw) {
    var me = st.me, n = st.st.length, i, x, y = fy + 9, dp, s, both = me.B && (me.E || me.H), tx;
    T = { x: 0, y: 0, s: 1 };
    for (i = 0; i < n; i++) (function (i) {
      s = st.st[i]; x = fx + 12 + i * 62;
      dp = block(g, 'tab' + i, x, y, 56, 48, s.done ? '#BFF0C6' : i === st.focus ? YEL : '#FFFFFF', { r: 14, local: function () {
        ui.view = i; ui.hold = null; ui.blink0 = Date.now();
        if (st.me.H && i !== st.focus) api.send({ t: ID + '.focus', i: i });
      } });
      kico(g, s.kind, x + 28, y + 21 + dp, 14, NAVY);
      if (s.done) { circ(g, x + 47, y + 7, 10); g.fillStyle = GREEN; g.fill(); ol(g, 2.5); tick(g, x + 47, y + 7, 4.5); }
      else if (i === st.focus) { circ(g, x + 47, y + 7, 11); g.fillStyle = '#fff'; g.fill(); ol(g, 2.5); text(g, ROLE.H.ico, x + 47, y + 8, 12); }
      if (me.B && pageFor(i)) { circ(g, x + 8, y + 7, 9); g.fillStyle = CREAM; g.fill(); ol(g, 2.5); text(g, ROLE.B.ico, x + 8, y + 8, 10); }
      if (i === ui.view) { rr(g, x + 10, y + 50, 36, 6, 3); g.fillStyle = '#fff'; g.fill(); }
    })(i);
    if (both) {   // this tablet is Eyes and Book: two tabs
      tx = fx + fw - 12 - 124;
      [['panel', ROLE.E.ico], ['book', ROLE.B.ico]].forEach(function (o, j) {
        dp = block(g, 'side' + o[0], tx + j * 62, y, 58, 48, ui.tab === o[0] ? YEL : '#FFFFFF', { r: 14, local: function () { ui.tab = o[0]; } });
        text(g, o[1], tx + j * 62 + 29, y + 22 + dp, 22);
      });
    }
  }
  function fog(x, y, w, h, now) {   // Hands' visor
    var k, cx, cy, gr;
    g.save(); rr(g, x, y, w, h, 16); g.clip();
    g.fillStyle = 'rgba(226,231,239,0.2)'; g.fillRect(x, y, w, h);
    for (k = 0; k < 3; k++) {
      cx = x + ((now / (46 + k * 12) + k * w / 2.4) % (w + 300)) - 150; cy = y + h * (0.22 + 0.28 * k);
      gr = g.createRadialGradient(cx, cy, 6, cx, cy, 150); gr.addColorStop(0, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, 150, 60, 0, 0, TAU); g.fill();
    }
    g.restore();
  }
  function drawPanel(now) {
    var M = lay.main, me = st.me, fx = M.x, fy = M.y, fw = M.w - 14, fh = M.h - lay.capH - 4, bx = fx + 10, by = fy + 66, bw = fw - 20, bh = fh - 76, dx = 14, dy = 10;
    var n = st.st.length, view, s, e, seen, sc, ox, oy, age, pg, book = bookSide(), col, k, who;
    if (ui.hold && now > ui.hold.until) { ui.hold = null; ui.view = st.focus; ui.blink0 = now; ui.ang = {}; }
    view = clamp(ui.view, 0, n - 1); s = st.st[view]; col = book ? '#B77B45' : BODY[s.kind] || '#5E7CB8';
    // the console: lit top, darker side, front
    rr(g, fx + 8, fy + fh - 6, fw + dx, 16, 8); g.fillStyle = 'rgba(11,20,55,0.35)'; g.fill();
    poly(g, [fx + 8, fy + 4, fx + 8 + dx, fy + 4 - dy, fx + fw + dx - 2, fy + 4 - dy, fx + fw - 2, fy + 4]); g.fillStyle = shade(col, 0.32); g.fill(); ol(g, 4);
    poly(g, [fx + fw - 4, fy + 4, fx + fw + dx - 2, fy + 4 - dy, fx + fw + dx - 2, fy + fh - dy - 8, fx + fw - 4, fy + fh - 8]); g.fillStyle = shade(col, -0.4); g.fill(); ol(g, 4);
    rr(g, fx, fy, fw, fh, 20); g.fillStyle = lin(g, 0, fy, 0, fy + fh, shade(col, 0.1), shade(col, -0.12)); g.fill(); ol(g, 4);
    drawTabs(fx, fy, fw);
    if (book) {
      pg = pageFor(view);
      sc = Math.min(bw / 462, bh / 314, 2); ox = bx + (bw - 440 * sc) / 2 + 5 * sc; oy = by + (bh - 300 * sc) / 2;
      g.save(); g.translate(ox, oy); g.scale(sc, sc); T = { x: ox, y: oy, s: sc };
      if (pg) pageDraw(g, pg);
      else {   // this chapter is with another Book
        rr(g, 0, 0, 440, 300, 16); g.fillStyle = '#C98A4B'; g.fill(); ol(g, 4);
        rr(g, 18, 16, 404, 268, 10); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.4)'; g.stroke();
        circ(g, 220, 96, 44); g.fillStyle = BODY[s.kind]; g.fill(); ol(g, 4); kico(g, s.kind, 220, 96, 22, '#fff');
        who = people().filter(function (o) { return o.w.ch.indexOf(view) >= 0 && o.p.id !== api.myId(); });
        who.slice(0, 3).forEach(function (o, j, arr) {
          var px = 220 + (j - (arr.length - 1) / 2) * 120;
          api.drawAvatar(g, o.p, px, 268, now / 1000 + j, { scale: 0.7, facing: 1 });
          api.nameTag(g, o.p, px, 190, false);
        });
      }
      g.restore();
      return;
    }
    e = s.eye || {}; seen = !!s.eye;
    rr(g, bx, by, bw, bh, 16); g.fillStyle = seen ? '#E3EBF7' : '#DADFE7'; g.fill(); ol(g, 3.5);
    g.save(); rr(g, bx, by, bw, bh, 16); g.clip(); g.fillStyle = lin(g, 0, by, 0, by + 26, 'rgba(27,42,73,0.16)', 'rgba(27,42,73,0)'); g.fillRect(bx, by, bw, 26); g.restore();
    [[bx + 12, by + 12], [bx + bw - 12, by + 12], [bx + 12, by + bh - 12], [bx + bw - 12, by + bh - 12]].forEach(function (o) { circ(g, o[0], o[1], 4); g.fillStyle = '#9AA5BD'; g.fill(); ol(g, 1.5); });
    if (!s.pub) return;
    sc = Math.min((bw - 12) / 448, (bh - 12) / 306, 2); ox = bx + (bw - 440 * sc) / 2; oy = by + (bh - 300 * sc) / 2;
    age = now - ui.shake;
    if (age < 520) ox += Math.sin(age / 26) * 9 * (1 - age / 520);     // a spark shakes it
    g.save(); g.translate(ox, oy); g.scale(sc, sc); T = { x: ox, y: oy, s: sc };
    KIND[s.kind](g, s, e, now, seen);
    g.restore();
    if (!seen) fog(bx, by, bw, bh, now);
    if (s.done) {   // this station is ready
      k = ease((now - ui.readyAt) / 300);
      g.globalAlpha = 0.92; circ(g, bx + bw / 2, by + bh / 2, 58 * (0.6 + 0.4 * k)); g.fillStyle = GREEN; g.fill(); ol(g, 5); g.globalAlpha = 1;
      tick(g, bx + bw / 2, by + bh / 2 + 2, 28 * (0.6 + 0.4 * k));
    }
    lay.pan = { x: bx, y: by, w: bw, h: bh };
    if (me.W) api.label(g, ROLE.W.ico + ' Watching. You are in the next mission!', bx + bw / 2, by + bh - 10, '#fff', NAVY, W < 900 ? 15 : 18);
  }
  function drawMarks(now) {   // who is touching what
    var all = api.players(), me = api.myId(), i, k, m, p, age;
    if (bookSide() || ui.view !== st.focus) return;
    for (i = 0; i < ctls.length; i++) {
      k = ctls[i]; m = ui.marks[k.id];
      if (!m) continue;
      age = now - m.t; p = all[m.id];
      if (age > 1100 || !p) { delete ui.marks[k.id]; continue; }
      g.globalAlpha = age < 700 ? 1 : 1 - (age - 700) / 400;
      rr(g, k.x - 3, k.y - 3, k.w + 6, k.h + 6, 18); g.lineWidth = 9; g.strokeStyle = NAVY; g.stroke(); g.lineWidth = 5; g.strokeStyle = p.color; g.stroke();
      if (m.id !== me) api.label(g, p.name, clamp(k.x + k.w / 2, 50, W - 50), k.y - 2, p.color, '#fff', 14);
      g.globalAlpha = 1;
    }
  }

  // ---------- the signal board ----------
  function sigIcon(q, k, v, x, y, r) {
    if (k === 'c') { circ(q, x, y, r); q.fillStyle = COLS[v]; q.fill(); ol(q, Math.max(2, r * 0.12)); circ(q, x - r * 0.3, y - r * 0.32, r * 0.2); q.fillStyle = 'rgba(255,255,255,0.5)'; q.fill(); }
    else if (k === 's') sym(q, v, x, y, r * 0.86);
    else if (k === 'n') text(q, String(v), x, y + 1, r * 1.9, NAVY, 700);
    else if (k === 'a') arrow(q, x, y, r * 0.95, v, NAVY);
    else if (v) { circ(q, x, y, r); q.fillStyle = GREEN; q.fill(); ol(q, Math.max(2, r * 0.12)); tick(q, x, y, r * 0.5); }
    else { circ(q, x, y, r); q.fillStyle = RED; q.fill(); ol(q, Math.max(2, r * 0.12)); cross(q, x, y, r * 0.42); }
  }
  function drawBoard() {
    var S = lay.side, gap = 5, cols = Math.max(4, Math.floor((S.w - 14) / 58)), rows = Math.ceil(SIGS.length / cols), size, x0, y0, i, x, y, dp;
    size = Math.min(66, (S.w - 14 - (cols - 1) * gap) / cols, (S.h - 16 - (rows - 1) * gap) / rows);
    x0 = S.x + (S.w - cols * size - (cols - 1) * gap) / 2; y0 = S.y + 8;
    rr(g, S.x, S.y, S.w, rows * (size + gap) + 11, 18); g.fillStyle = CREAM; g.fill(); ol(g, 4);
    T = { x: 0, y: 0, s: 1 };
    for (i = 0; i < SIGS.length; i++) (function (o) {
      x = x0 + (i % cols) * (size + gap); y = y0 + Math.floor(i / cols) * (size + gap);
      dp = block(g, 'sg' + o[0] + o[1], x, y, size, size, '#FFFFFF', { r: 13, local: function () { api.send({ t: ID + '.sig', k: o[0], v: o[1] }); } });
      sigIcon(g, o[0], o[1], x + size / 2, y + size / 2 - 3 + dp, size * 0.3);
    })(SIGS[i]);
  }
  function drawSignals(now) {   // what somebody just signalled: big, on every tablet, for a moment
    var list = ui.sigs, all = api.players(), play = st.phase === 'play', B = play ? lay.main : lay.side, n, size, x, y, i, s, age, p, k;
    while (list.length && now - list[0].t > 3400) list.shift();
    n = Math.min(list.length, 4);
    if (!n) return;
    size = Math.min(clamp(H / 6.4, 62, 104), (B.w - 20) / n - 8); y = play ? lay.top + size / 2 + 4 : lay.top + lay.pl.r * 2 + 34 + size / 2;
    for (i = 0; i < n; i++) {
      s = list[list.length - n + i]; age = now - s.t; p = all[s.id];
      k = age < 160 ? 0.7 + 0.3 * (age / 160) : 1;
      x = B.x + B.w / 2 + (i - (n - 1) / 2) * (size + 8);
      g.globalAlpha = age < 2900 ? 1 : Math.max(0, 1 - (age - 2900) / 500);
      rr(g, x - size * k / 2 + 3, y - size * k / 2 + 5, size * k, size * k, 20); g.fillStyle = 'rgba(11,20,55,0.35)'; g.fill();
      rr(g, x - size * k / 2, y - size * k / 2, size * k, size * k, 20); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 9; g.strokeStyle = NAVY; g.stroke(); g.lineWidth = 5; g.strokeStyle = p ? p.color : YEL; g.stroke();
      sigIcon(g, s.k, s.v, x, y, size * k * 0.3);
      if (p) api.label(g, p.name, x, y + size * k / 2 + 16, p.color, '#fff', 13);
      g.globalAlpha = 1;
    }
  }

  // ---------- sparks, notices, confetti ----------
  function drawFx(now) {
    var i, f, k, a, j, r, age;
    for (i = ui.fx.length - 1; i >= 0; i--) {
      f = ui.fx[i]; k = (now - f.t) / 650;
      if (k >= 1) { ui.fx.splice(i, 1); continue; }
      g.globalAlpha = 1 - k * k;
      g.beginPath();
      for (j = 0; j < 16; j++) { a = j * TAU / 16 + f.rot; r = (j % 2 ? 20 : 52) * (0.5 + k); g.lineTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r); }
      g.closePath(); g.fillStyle = '#FFE55C'; g.fill(); ol(g, 3.5);
      circ(g, f.x, f.y, 12 * (0.5 + k)); g.fillStyle = '#fff'; g.fill();
      g.globalAlpha = 1;
    }
    age = now - ui.sparkAt;
    if (age < 350) { g.lineWidth = 16; g.strokeStyle = 'rgba(255,229,92,' + (0.8 * (1 - age / 350)) + ')'; g.strokeRect(0, 0, W, H); }   // every tablet sees the spark
    for (i = ui.pops.length - 1; i >= 0; i--) {
      f = ui.pops[i]; k = (now - f.t) / 1600;
      if (k >= 1) { ui.pops.splice(i, 1); continue; }
      g.globalAlpha = 1 - k * k;
      api.label(g, f.s, f.x, f.y + k * (f.up ? -40 : 34), f.bg || YEL, f.fg || NAVY, f.size || 22);
      g.globalAlpha = 1;
    }
    if (st.phase === 'launch') {   // confetti over the family
      k = (now - ui.phaseAt) / 1000;
      if (k > 1 && k < 7) ui.conf.forEach(function (c, n) {
        var y = lay.top + ((k - 1) * c.v) % (H - lay.top), x = c.x + Math.sin(k * 2 + n) * 14;
        g.save(); g.translate(x, y); g.rotate(k * c.w + n); g.globalAlpha = k > 6 ? 7 - k : 1; g.fillStyle = COLS[n % 6]; g.fillRect(-5, -3, 10, 6); g.restore();
      });
      g.globalAlpha = 1;
    }
    age = now - ui.deny;
    if (age < 1500 && lay.pan && st.phase === 'play') {   // tapped the panel without being Hands: show who is
      a = people().filter(function (o) { return o.w.r.indexOf('H') >= 0; })[0];
      g.globalAlpha = age < 1100 ? 1 : 1 - (age - 1100) / 400;
      api.label(g, ROLE.H.ico + ' ' + (a ? a.p.name : ''), lay.pan.x + lay.pan.w / 2, lay.pan.y + 44, RED, '#fff', 20);
      g.globalAlpha = 1;
    }
    age = now - ui.dealt;
    if (age < 2200 && lay.pan && st.phase === 'play') {   // the parts were dealt again because somebody came or went
      g.globalAlpha = age < 1700 ? 1 : 1 - (age - 1700) / 500;
      api.label(g, roleIcons(myCode()).join(' ') + '  New parts!', lay.main.x + lay.main.w / 2, lay.pan.y + lay.pan.h - 12, YEL, NAVY, 20);
      g.globalAlpha = 1;
    }
  }
  function myCode() { var me = st && st.me; return !me ? 'W' : me.W ? 'W' : (me.H ? 'H' : '') + (me.E ? 'E' : '') + (me.B ? 'B' : ''); }

  // ---------- one frame ----------
  function draw(now) {
    var phase = st ? st.phase : 'wait', d = 0, dt = Math.min(0.1, (now - (ui.last || now)) / 1000), meta;
    ui.last = now;
    if (st && st.mis) d = st.mis.d;
    else if (st && st.lobby && ui.sel > 0) { meta = st.lobby.meta[ui.sel - 1]; d = meta ? meta[0] : 0; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineJoin = 'round'; g.lineCap = 'round';
    ctls = []; lay.pan = null;
    g.drawImage(bgSprite(d % DEST.length), 0, 0, W, H);
    drawSite(now, dt);
    if (!st) return;
    drawPeople(now);
    if (phase === 'play' && st.st) { drawPanel(now); drawMarks(now); }
    if (ui.board) drawBoard();
    drawSignals(now);
    drawFx(now);
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

  // ---------- the bar at the top, and when the panels show ----------
  function hud(now) {
    var phase = st ? st.phase : '', play = phase === 'play', left, s, cls, ask, mis, me, txt, want, bar, view, cap = '';
    show(el.clock, play || phase === 'fail'); show(el.zap, play); show(el.stop, (play || phase === 'brief') && !!st.me && !st.me.W); show(el.mis, !!(st && st.mis)); show(el.sigb, !!st);
    if (st && st.mis) {
      mis = st.mis; me = st.me || {};
      txt = (mis.day ? '📅' : '🚀 ' + mis.n) + ' <i class="rk-pl rk-pl' + mis.d + '"></i> ' + roleIcons(myCode()).join('') + (me.fac ? me.fac.map(function (f) { return FAC[f]; }).join('') : '') + (isQuiet(myCode()) ? '🔇' : '');
      if (ui.misSig !== txt) { ui.misSig = txt; el.mis.innerHTML = txt; }
    }
    if (play) {
      left = Math.max(0, st.left - (st.run ? now - stAt : 0));
      setText(el.clock, mmss(left));
      cls = 'rk-pill rk-clock' + (now - ui.sparkAt < 450 ? ' hit' : left < 15000 ? ' low' : '');
      if (ui.hud.cls !== cls) { ui.hud.cls = cls; el.clock.className = cls; }
      s = Math.ceil(left / 1000);
      if (left < 10000 && s > 0 && st.run && s !== ui.hud.sec) { ui.hud.sec = s; api.sfx('tap'); }
      setText(el.zap, '⚡ ' + st.sparks);
      view = st.st[clamp(ui.view, 0, st.st.length - 1)];
      cap = '<span>' + three(STN[view.kind]) + '</span>';
    } else if (phase === 'fail') { setText(el.clock, '0:00'); if (ui.hud.cls !== 'f') { ui.hud.cls = 'f'; el.clock.className = 'rk-pill rk-clock low'; } }
    if (ui.capSig !== cap) { ui.capSig = cap; el.cap.innerHTML = cap; }
    show(el.cap, !!cap);
    if (phase === 'brief') { bar = el.panel.querySelector('.rk-bar i'); if (bar && ui.briefMs) bar.style.width = Math.round(100 * clamp(1 - (st.brief - (now - stAt)) / ui.briefMs, 0, 1)) + '%'; }
    // the panel with the result comes when the rocket is on its way (or the steam has cleared)
    want = phase === 'lobby' || phase === 'brief' || (phase === 'launch' && now - ui.phaseAt > 3000) || (phase === 'fail' && now - ui.phaseAt > 1500);
    show(el.panel, want);
    ask = now - ui.stopAsk < 3000;
    if (ui.hud.ask !== ask) { ui.hud.ask = ask; el.stop.className = 'round rk-stop' + (ask ? ' ask' : ''); el.stop.textContent = ask ? 'Stop? ✔' : '✖'; }
    if (ui.hud.board !== ui.board) { ui.hud.board = ui.board; el.sigb.className = 'round rk-sigb' + (ui.board ? ' on' : ''); }
  }

  // ---------- the panels: the list of missions, the card with my part, the result ----------
  function medals(n, big) { var s = '<span class="rk-mds' + (big ? ' big' : '') + '">', i; for (i = 0; i < 3; i++) s += '<i' + (i < n ? ' class="on"' : '') + '>★</i>'; return s + '</span>'; }
  function crewHtml() {
    var all = api.players(), me = api.myId();
    return '<div class="rk-crew">' + st.who.map(function (w) { var p = all[w.id]; return p ? '<span' + (w.id === me ? ' class="me"' : '') + '>' + roleIcons(w.r).join('') + ' ' + api.esc(p.name) + '</span>' : ''; }).join('') + '</div>';
  }
  function lobbyHtml() {
    var L = st.lobby, tab = ui.ltab, sel = ui.sel, h, i, n, m, li, body = '', info = '', open = sel === 'day' || (L.list[sel - 1] && L.list[sel - 1][0]), alone = st.who.length < 2, myRole;
    h = '<div class="rk-h"><span class="rk-ico">🚀</span><div class="rk-ttl"><h2>Rocket Base</h2><div class="rk-tri">火箭基地 <span class="py">huǒjiàn jīdì</span> · Pangkalan Roket</div></div>' +
      '<button type="button" class="btn primary rk-go" data-act="go" data-quiet' + (open && tab !== 'board' ? '' : ' disabled') + '>Start 🚀</button></div>';
    h += '<div class="rk-tabs">' + DEST.map(function (D, d) { return '<button type="button" class="rk-tab' + (tab === d ? ' on' : '') + '" data-act="tab" data-v="' + d + '"><i class="rk-pl rk-pl' + d + '"></i>' + D.en + '</button>'; }).join('') +
      '<button type="button" class="rk-tab' + (tab === 'day' ? ' on' : '') + '" data-act="tab" data-v="day">📅 Daily</button>' +
      '<button type="button" class="rk-tab nar' + (tab === 'board' ? ' on' : '') + '" data-act="tab" data-v="board" aria-label="Family board">🏆</button></div>';
    if (tab === 'board') {
      body = '<div class="rk-info"><div><b>Family board</b> · 🚀 ' + L.launches + ' launches together · mine: ' + L.mine + '</div></div><div class="rk-list">' +
        (L.board.length ? L.board.slice().sort(function (a, b) { return a.n - b.n; }).map(function (b) {
          return '<div class="rk-row"><b>' + b.n + '</b><i class="rk-pl rk-pl' + L.meta[b.n - 1][0] + '"></i>' + medals(b.m) + '<span>⏱ ' + mmss(b.ms) + '</span><span>' + api.esc((b.names || []).join(', ')) + '</span></div>';
        }).join('') : '<div class="rk-note">No rocket has left yet. The best time and the crew of every mission will be kept here.</div>') +
        (L.day.ms ? '<div class="rk-row"><b>📅</b>' + medals(L.day.m) + '<span>⏱ ' + mmss(L.day.ms) + '</span><span>' + api.esc((L.day.names || []).join(', ')) + '</span></div>' : '') + '</div>';
      return h + body;
    }
    if (tab === 'day') {
      body = '<div class="rk-grid"><button type="button" class="rk-m rk-day on" data-act="sel" data-n="day"><span>📅 Mission of the day</span><span class="rk-tri">每日任务 <span class="py">měirì rènwu</span> · Misi Harian</span></button></div>';
      info = '<div class="rk-info"><div><b>The same mission for the whole family today</b></div><div>🔧 ' + L.day.ns + ' stations · ⏱ ' + mmss(L.day.t * 1000) + ' · ⭐ ' + L.day.pay + (L.day.got ? ' <small>(today\'s bonus is taken)</small>' : ' <small>(+' + L.day.first + ' the first time today)</small>') + '</div>' +
        (L.day.ms ? '<div>Family today: ⏱ ' + mmss(L.day.ms) + ' ' + medals(L.day.m) + ' ' + api.esc((L.day.names || []).join(', ')) + '</div>' : '') + '</div>';
    } else {
      body = '<div class="rk-grid">';
      for (i = 0; i < 6; i++) {
        n = tab * 6 + i + 1; m = L.meta[n - 1]; li = L.list[n - 1];
        if (!m) continue;
        body += '<button type="button" class="rk-m' + (sel === n ? ' on' : '') + (li[0] ? '' : ' shut') + '" data-act="sel" data-n="' + n + '">' + (li[0] ? n : '🔒') + (m[5] ? '<em>🔇</em>' : '') + (li[0] ? medals(li[1]) : '<span class="rk-tri">' + n + '</span>') + '</button>';
      }
      body += '</div>';
      m = L.meta[sel - 1]; li = L.list[sel - 1];
      if (m) info = '<div class="rk-info"><div><b>Mission ' + sel + '</b> · ' + three(DEST[m[0]]) + '</div>' +
        (li[0] ? '<div>🔧 ' + m[1] + (m[1] > 1 ? ' stations' : ' station') + ' · ⏱ ' + mmss(m[2] * 1000) + ' · ⭐ ' + m[3] + (li[1] ? '' : ' <small>(+' + m[4] + ' first launch)</small>') + (m[5] ? ' · 🔇 quiet mission' : '') + '</div>' : '<div>🔒 Launch mission ' + (sel - 1) + ' first.</div>') +
        (m[6] ? '<div class="rk-new">New: ' + three(STN[m[6]]) + '</div>' : '') +
        (li[2] || li[3] ? '<div>' + (li[2] ? 'My best ⏱ ' + mmss(li[2]) + ' ' + medals(li[1]) : '') + (li[3] ? ' · Family ⏱ ' + mmss(li[3]) : '') + '</div>' : '') + '</div>';
    }
    myRole = myCodeOf(api.myId());
    h += body + info +
      '<div class="rk-roles"><span>My part:</span>' + [['', '🎲', 'Any'], ['hands', ROLE.H.ico, 'Hands'], ['eyes', ROLE.E.ico, 'Eyes'], ['book', ROLE.B.ico, 'Book']].map(function (o) {
        return '<button type="button" class="chip' + (st.pref === o[0] ? ' on' : '') + '" data-act="role" data-r="' + o[0] + '">' + o[1] + ' ' + o[2] + '</button>';
      }).join('') + '</div>' +
      crewHtml() +
      (alone ? '<div class="rk-note">🎓 <b>Training</b> · 训练 <span class="py">xùnliàn</span> · Latihan: alone you have every part, a long countdown and half the stars.</div>'
        : '<div class="rk-tri">' + myRole.split('').map(function (c) { return ROLE[c].ico + ' ' + three(ROLE[c]); }).join(' + ') + '</div>') +
      '<div class="rk-how"><span>✋</span><em>presses, sees only grey</em><i>+</i><span>👀</span><em>sees the panel</em><i>+</i><span>📖</span><em>has the rules</em><i>›</i><span>💬</span><i>›</i><span>🚀</span></div>' +
      '<div class="rk-note rk-more">Repeat launches that pay in full today: ' + L.reps + ' of ' + L.cap + '. A first launch always pays in full.</div>';
    return h;
  }
  function myCodeOf(id) { var k; for (k = 0; k < st.who.length; k++) if (st.who[k].id === id) return st.who[k].r; return 'W'; }
  function briefHtml() {
    var mis = st.mis, code = myCode(), q = mis.quiet, parts;
    parts = (code === 'W' ? ['W'] : code.split('')).map(function (c) {
      var extra = c === 'E' && st.me.fac ? ' You see only: ' + st.me.fac.map(function (f) { return FAC[f] + ' ' + { col: 'colours', sym: 'symbols', num: 'numbers', lit: 'lights' }[f]; }).join(', ') + '.' : '';
      return '<div class="rk-part"><span class="rk-pico">' + ROLE[c].ico + '</span><div>' + three(ROLE[c]) + '<small>' + ROLE[c].tip + extra + '</small></div></div>';
    }).join('');
    return '<div class="rk-h"><span class="rk-ico">' + (mis.day ? '📅' : '🚀') + '</span><div class="rk-ttl"><h2>' + (mis.day ? 'Mission of the day' : 'Mission ' + mis.n) + (mis.train ? ' · Training' : '') + '</h2><div class="rk-tri">' + three(DEST[mis.d]) +
      (mis.train ? ' · 训练 <span class="py">xùnliàn</span> · Latihan' : '') + '</div></div></div>' +
      '<div class="rk-you">' + parts + '</div>' +
      (q ? '<div class="rk-quiet">🔇 <b>Quiet mission</b> · 安静任务 <span class="py">ānjìng rènwu</span> · Misi Senyap<small>' + ROLE[q].ico + ' ' + ROLE[q].en + ' may only use the signal board 📣, no talking! (+2 ⭐)</small></div>' : '') +
      crewHtml() + '<div class="rk-bar"><i></i></div>';
  }
  function resultHtml() {
    var res = st.res || {}, mis = st.mis, mine = res.mine, h, note = '', cur = mis.day ? 'day' : mis.n, nextOpen = res.next && st.lobby && st.lobby.list[res.next - 1] && st.lobby.list[res.next - 1][0];
    if (!res.ok) {
      return '<div class="rk-h"><span class="rk-ico">💨</span><div class="rk-ttl"><h2>Launch postponed</h2><div class="rk-tri">发射推迟 <span class="py">fāshè tuīchí</span> · Pelancaran ditangguhkan</div></div></div>' +
        '<div class="rk-big">🔧 ' + res.done + ' / ' + res.of + '<span class="rk-badge">⚡ ' + res.sparks + '</span></div>' +
        '<div class="rk-note">The countdown ran out. Nothing is broken: the rocket is waiting, and the parts go round. Try again!</div>' +
        '<div class="rk-btns"><button type="button" class="btn primary" data-act="start" data-n="' + cur + '" data-quiet>Try again ↻</button><button type="button" class="btn" data-act="lobby">Missions</button></div>';
    }
    h = '<div class="rk-h"><span class="rk-ico">🚀</span><div class="rk-ttl"><h2>Lift-off!</h2><div class="rk-tri">发射成功！ <span class="py">fāshè chénggōng</span> · Berjaya dilancarkan!</div></div></div>' +
      '<div class="rk-res">' + medals(res.medals, true) + '<div class="rk-big">⏱ ' + mmss(res.used) + (mine && mine.best ? '<span class="rk-badge">New best!</span>' : '') + (res.rec ? '<span class="rk-badge">Family record!</span>' : '') + '</div></div>';
    if (mine) {
      if (mine.cap) note = 'Today\'s repeat launches are used up: ⭐ 1 each. A first launch still pays in full.';
      else note = (mis.train ? 'Training pays half. ' : '') + (mine.first ? 'With the bonus for the first launch!' : '') + (mis.quiet && !mis.train ? ' Quiet mission: +2.' : '');
      h += '<div class="rk-sum">' + (mine.parts.length > 1 ? mine.parts.join(' + ') + ' = ' : '') + mine.n + ' ⭐' + (note ? '<small>' + note + '</small>' : '') + '</div>';
    } else h += '<div class="rk-note">You watched this one. You are in the next mission!</div>';
    return h + '<div class="rk-btns">' + (nextOpen ? '<button type="button" class="btn primary" data-act="start" data-n="' + res.next + '" data-quiet>Mission ' + res.next + ' ▶</button>' : '') +
      '<button type="button" class="btn' + (nextOpen ? '' : ' primary') + '" data-act="start" data-n="' + cur + '" data-quiet>Again ↻</button><button type="button" class="btn" data-act="lobby">Missions</button></div>';
  }
  function panel() {
    var phase = st ? st.phase : '', html = '';
    if (phase === 'lobby') html = lobbyHtml();
    else if (phase === 'brief') html = briefHtml();
    else if (phase === 'launch' || phase === 'fail') html = resultHtml();
    if (html !== ui.panelSig) { ui.panelSig = html; el.panel.innerHTML = html; if (phase !== 'lobby') el.panel.scrollTop = 0; }
  }

  // ---------- messages from the server ----------
  function onState(m, now) {
    var prev = st, was = prev ? prev.phase : '', i, L, code;
    st = m; stAt = now;
    if (m.phase !== was) {
      ui.phaseAt = now; ui.hold = null; ui.hud.sec = 0;
      if (m.phase === 'brief') { ui.briefMs = m.brief || 4500; api.sfx('open'); ui.board = false; }
      if (m.phase === 'play') {
        ui.view = m.focus; ui.tab = 'panel'; ui.marks = {}; ui.ang = {}; ui.slide = {}; ui.spin = {}; ui.blink0 = now; ui.readyAt = 0;
        ui.board = isQuiet(myCode());       // on a quiet mission the signal board is open for the quiet one
        if (was === 'brief') api.sfx('car');
      }
      if (m.phase === 'launch') {
        ui.board = false;
        if (was === 'play') { api.sfx('car'); setTimeout(function () { if (root) api.sfx('goal'); }, 900); if (m.res && m.res.mine) setTimeout(function () { if (root) api.sfx('star'); }, 1700); }
        else ui.phaseAt = now - 8000;       // came in when the rocket had already left
        ui.conf = [];
        for (i = 0; i < 44; i++) ui.conf.push({ x: lay.side.x + Math.random() * lay.side.w, v: 110 + Math.random() * 130, w: 2 + Math.random() * 4 });
      }
      if (m.phase === 'fail') { ui.board = false; if (was === 'play') api.sfx('deny'); else ui.phaseAt = now - 8000; }
    }
    if (m.phase === 'lobby' && m.lobby && (ui.ltab === -1 || was !== 'lobby')) {   // open the list at the next mission to fly
      L = m.lobby.list; ui.sel = 1;
      for (i = 0; i < L.length; i++) if (L[i][0]) { ui.sel = i + 1; if (!L[i][1]) break; }
      if (prev && prev.mis && prev.mis.day) { ui.sel = 'day'; ui.ltab = 'day'; }
      else ui.ltab = Math.floor((ui.sel - 1) / 6);
    }
    if (m.phase === 'play' && prev && prev.phase === 'play') {
      if (m.focus !== prev.focus) {
        if (m.st[prev.focus] && m.st[prev.focus].done && !prev.st[prev.focus].done && ui.view === prev.focus) ui.hold = { until: now + 1100 };   // let the finished station be seen for a moment
        else { ui.view = m.focus; ui.hold = null; ui.blink0 = now; ui.ang = {}; ui.slide = {}; }
      }
      code = function (s) { return JSON.stringify([s.me, (s.pages || []).map(function (p) { return [p.st, p.rows.length]; })]); };
      if (code(m) !== code(prev)) { ui.dealt = now; api.sfx('claim'); if (!m.me.B || (!m.me.E && !m.me.H)) ui.tab = 'panel'; }
    }
    panel();
  }
  function ctlAt(id) { for (var i = 0; i < ctls.length; i++) if (ctls[i].id === id) return ctls[i]; return null; }
  function onMessage(m) {
    if (!root) return;
    var now = Date.now(), k;
    if (m.t === ID + '.state') onState(m, now);
    else if (m.t === ID + '.touch') {
      ui.hop[m.id] = now;
      if (st && m.st === st.focus) { ui.marks[m.at] = { id: m.id, t: now }; if (m.id !== api.myId()) ui.press[m.at] = now; if (m.at.charAt(0) === 'w') ui.spin[m.at] = (ui.spin[m.at] || 0) + 1; }
      if (m.ok) api.sfx('card');
    } else if (m.t === ID + '.spark') {
      ui.sparkAt = now; ui.shake = now; ui.hop[m.id] = now;
      k = st && m.st === ui.view && !bookSide() ? ctlAt(m.at) : null;
      ui.fx.push(k ? { x: k.x + k.w / 2, y: k.y + k.h / 2, t: now, rot: Math.random() } : { x: lay.rk.x, y: lay.rk.y - lay.rk.h * 0.45, t: now, rot: Math.random() });
      ui.pops.push({ s: '⚡ −' + m.cost + ' s', x: W / 2, y: lay.top + 34, t: now, bg: '#FFE55C' });
      api.sfx('wrong');
    } else if (m.t === ID + '.ready') { ui.readyAt = now; api.sfx('right'); }
    else if (m.t === ID + '.sig') { ui.sigs.push({ id: m.id, k: m.k, v: m.v, t: now }); if (ui.sigs.length > 12) ui.sigs.shift(); ui.hop[m.id] = now; api.sfx('emote'); }
    else if (m.t === ID + '.no') api.sfx('deny');
  }

  // ---------- taps ----------
  function onDown(e) {
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, i, k, m;
    for (i = ctls.length - 1; i >= 0; i--) {
      k = ctls[i];
      if (x < k.x - 2 || x > k.x + k.w + 2 || y < k.y - 2 || y > k.y + k.h + 2) continue;
      e.preventDefault();
      if (k.local) { ui.press[k.id] = Date.now(); api.sfx('tap'); k.local(); return; }
      if (!st || st.phase !== 'play' || !k.msg) return;
      if (!st.me.H) { ui.deny = Date.now(); api.sfx('deny'); return; }      // only Hands can press
      if (ui.view !== st.focus || ui.hold || st.st[st.focus].done) return;
      ui.press[k.id] = Date.now(); api.sfx('tap');
      m = { t: ID + '.act', a: k.msg.a };
      if (k.msg.i !== undefined) m.i = k.msg.i;
      api.send(m);
      return;
    }
  }
  function onClick(e) {
    var t = e.target, act, v;
    while (t && t !== root && t.nodeType === 1) {
      act = t.getAttribute('data-act');
      if (act) {
        if (t.disabled) return;
        if (act === 'back') { api.sfx('close'); close(); }
        else if (act === 'board') ui.board = !ui.board;
        else if (act === 'stop') { if (Date.now() - ui.stopAsk < 3000) { ui.stopAsk = 0; api.send({ t: ID + '.stop' }); } else ui.stopAsk = Date.now(); }   // the second tap stops the countdown
        else if (act === 'tab') { v = t.getAttribute('data-v'); ui.ltab = v === 'day' || v === 'board' ? v : parseInt(v, 10); if (v === 'day') ui.sel = 'day'; else if (v !== 'board') ui.sel = firstOpen(ui.ltab); panel(); }
        else if (act === 'sel') { v = t.getAttribute('data-n'); ui.sel = v === 'day' ? 'day' : parseInt(v, 10); panel(); }
        else if (act === 'role') api.send({ t: ID + '.pick', role: t.getAttribute('data-r') || 'auto' });
        else if (act === 'go') { api.sfx('open'); api.send({ t: ID + '.start', m: ui.sel }); }
        else if (act === 'start') { v = t.getAttribute('data-n'); api.sfx('open'); api.send({ t: ID + '.start', m: v === 'day' ? 'day' : parseInt(v, 10) }); }
        else if (act === 'lobby') api.send({ t: ID + '.lobby' });
        return;
      }
      t = t.parentNode;
    }
  }
  function firstOpen(d) {   // in a destination: the first mission still without a medal, else its last open one
    var L = st && st.lobby ? st.lobby.list : [], i, n, best = d * 6 + 1;
    for (i = 0; i < 6; i++) { n = d * 6 + i + 1; if (L[n - 1] && L[n - 1][0]) { best = n; if (!L[n - 1][1]) break; } }
    return best;
  }

  // ---------- opening and closing the screen ----------
  function open() {
    if (root) return;
    if (!document.getElementById(ID + '-style')) { var css = document.createElement('style'); css.id = ID + '-style'; css.textContent = CSS; document.head.appendChild(css); }
    ui = freshUi(); st = null; lastDraw = 0;
    root = document.createElement('div'); root.className = 'screen rk-root';
    root.innerHTML = '<canvas class="rk-cv" aria-label="Rocket Base"></canvas>' +
      '<div class="rk-top">' +
      '<button type="button" class="btn rk-back" data-act="back" data-quiet>Back to town</button>' +
      '<div class="rk-pill rk-mis" hidden></div>' +
      '<div class="rk-mid"><div class="rk-pill rk-clock" hidden>0:00</div><div class="rk-pill rk-zap" hidden>⚡ 0</div></div>' +
      '<button type="button" class="round rk-sigb" data-act="board" aria-label="Signal board" hidden>📣</button>' +
      '<button type="button" class="round rk-stop" data-act="stop" aria-label="Stop this mission" hidden>✖</button>' +
      '</div>' +
      '<div class="rk-cap" hidden></div>' +
      '<div class="rk-panel" hidden></div>';
    document.body.appendChild(root);
    cv = root.querySelector('.rk-cv'); g = cv.getContext('2d');
    el = { mis: root.querySelector('.rk-mis'), clock: root.querySelector('.rk-clock'), zap: root.querySelector('.rk-zap'), sigb: root.querySelector('.rk-sigb'),
      stop: root.querySelector('.rk-stop'), cap: root.querySelector('.rk-cap'), panel: root.querySelector('.rk-panel') };
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
    root = null; cv = null; g = null; st = null; ctls = []; el = {}; bg.cv = null; bg.key = '';
    api.leave();
  }

  window.FTGames = window.FTGames || {};
  window.FTGames[ID] = {
    init: function (a) { api = a; },
    open: open,
    onMessage: onMessage,
    onPlayers: function () { if (root && st && st.phase !== 'play') panel(); }
  };
})();
