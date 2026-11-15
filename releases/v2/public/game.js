// Family Town client: town map, players, stars, tag, Art Studio, Gallery.
// The Dress-Up Boutique and Car Garage screens live in design-dress.js / design-car.js.
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  var NAVY = '#1B2A49';
  var FONT = "Fredoka, 'Baloo 2', 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  var COLORS = ['#FF7A45', '#FF8FB8', '#5ED6C4', '#9B6BFF', '#FFC933', '#5AA9FF'];
  var HATS = ['None', 'Cap', 'Crown', 'Bow'];
  var EMOTES = ['❤️', '😂', '👋', '👍', '🎉', '😮'];
  var PALETTE = ['#1B2A49', '#FF4F6D', '#FF7A45', '#FFC933', '#4FA05A', '#3B82F6', '#9B6BFF', '#FF8FB8', '#7A4A2B', '#8A8F98'];
  var SIZES = [5, 12, 26];
  var TREES = [[120, 170], [830, 130], [60, 760], [1500, 150], [1790, 720], [2290, 130], [2310, 640], [130, 580], [150, 1000], [800, 1010], [820, 1440], [150, 1500], [1540, 1000], [1600, 1480], [2290, 1010], [2300, 1500], [560, 1010], [2200, 760], [2240, 420]];
  var Dress = window.DressDesigner || null, Car = window.CarDesigner || null;

  // ---------- state ----------
  var ws = null, me = 0, world = null, version = null, joined = false, room = 'town';
  var players = {}, stars = [], family = 0;
  var my = { x: 0, y: 0, f: 1, m: 0 };
  var look = { name: '', color: COLORS[0], hat: 0, big: false };
  var tag = { on: false, it: 0, ends: 0 };
  var keys = {}, joy = null;
  var sent = { x: 0, y: 0, m: 0, f: 1, t: 0 };

  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  function mine() { return players[me] || null; }

  // ---------- drawing helpers ----------
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function starPath(c, x, y, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    c.closePath();
  }
  // The simple block friend. Feet at (x, y).
  function drawBlock(c, x, y, p, t, s) {
    s = s || 1;
    var w = (p.big ? 62 : 56) * s, h = (p.big ? 84 : 56) * s, f = p.f < 0 ? -1 : 1;
    var hop = p.m ? Math.abs(Math.sin(t * 10)) * 5 * s : Math.sin(t * 2) * 1.2 * s;
    var top = y - h - 6 * s - hop, left = x - w / 2;
    c.save();
    c.lineJoin = 'round';
    c.fillStyle = NAVY; // feet
    c.beginPath(); c.ellipse(x - w * 0.22, y - 3 * s, 9 * s, 5 * s, 0, 0, 7); c.ellipse(x + w * 0.22, y - 3 * s, 9 * s, 5 * s, 0, 0, 7); c.fill();
    rr(c, left, top, w, h, 18 * s); c.fillStyle = p.color; c.fill(); c.lineWidth = 3.5 * s; c.strokeStyle = NAVY; c.stroke();
    var ey = top + 24 * s, ex = 13 * s;
    c.fillStyle = '#fff'; c.beginPath(); c.arc(x - ex, ey, 8.5 * s, 0, 7); c.arc(x + ex, ey, 8.5 * s, 0, 7); c.fill();
    c.fillStyle = NAVY; c.beginPath(); c.arc(x - ex + f * 3 * s, ey + 1.5 * s, 4 * s, 0, 7); c.arc(x + ex + f * 3 * s, ey + 1.5 * s, 4 * s, 0, 7); c.fill();
    c.lineWidth = 3 * s; c.lineCap = 'round'; c.beginPath(); c.arc(x + f * 2 * s, top + 36 * s, 9 * s, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    c.lineWidth = 3 * s;
    if (p.hat === 1) { // cap
      c.fillStyle = '#3B82F6'; c.beginPath(); c.arc(x, top + 4 * s, w * 0.42, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
      rr(c, f > 0 ? x : x - w * 0.62, top - 1 * s, w * 0.62, 8 * s, 4 * s); c.fill(); c.stroke();
    } else if (p.hat === 2) { // crown
      c.fillStyle = '#FFC933'; c.beginPath();
      c.moveTo(x - 22 * s, top + 3 * s); c.lineTo(x - 24 * s, top - 22 * s); c.lineTo(x - 11 * s, top - 10 * s); c.lineTo(x, top - 26 * s);
      c.lineTo(x + 11 * s, top - 10 * s); c.lineTo(x + 24 * s, top - 22 * s); c.lineTo(x + 22 * s, top + 3 * s); c.closePath(); c.fill(); c.stroke();
    } else if (p.hat === 3) { // bow
      c.fillStyle = '#FF4F9A'; var bx = x + 14 * s, by = top - 2 * s;
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx - 18 * s, by - 12 * s); c.lineTo(bx - 18 * s, by + 10 * s); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + 18 * s, by - 12 * s); c.lineTo(bx + 18 * s, by + 10 * s); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.arc(bx, by, 6 * s, 0, 7); c.fill(); c.stroke();
    }
    c.restore();
  }
  // Draws any player the way they currently look. Returns the height used, for the name tag.
  function drawPlayer(c, p, x, y, t) {
    c.fillStyle = 'rgba(27,42,73,0.18)';
    c.beginPath(); c.ellipse(x, y, p.drive && p.car ? 62 : 30, p.drive && p.car ? 12 : 9, 0, 0, 7); c.fill();
    if (p.drive && p.car && Car) { Car.draw(c, x, y, p.car, { facing: p.f, t: t, moving: !!p.m, driver: p.color }); return 92; }
    if (p.outfit && Dress) { var sc = p.big ? 1.22 : 1; Dress.draw(c, x, y, p.outfit, { facing: p.f, t: t, moving: !!p.m, scale: sc }); return 104 * sc; }
    drawBlock(c, x, y, p, t, 1);
    return (p.big ? 84 : 56) + (p.hat ? 34 : 12);
  }
  function label(c, text, x, y, bg, fg, size) {
    c.font = '600 ' + (size || 18) + 'px ' + FONT;
    var w = c.measureText(text).width + 18, h = (size || 18) + 10;
    rr(c, x - w / 2, y - h, w, h, h / 2); c.fillStyle = bg; c.fill(); c.lineWidth = 2.5; c.strokeStyle = NAVY; c.stroke();
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y - h / 2 + 1);
    return h;
  }

  // ---------- join screen ----------
  (function setupJoin() {
    look.name = store('ft_name') || '';
    look.color = store('ft_color') || COLORS[0];
    look.hat = parseInt(store('ft_hat') || '0', 10) || 0;
    look.big = store('ft_big') === '1';
    $('nameIn').value = look.name; $('bigIn').checked = look.big;
    var pc = $('preview').getContext('2d');
    function preview() {
      pc.clearRect(0, 0, 150, 170);
      drawBlock(pc, 75, 150, { color: look.color, hat: look.hat, big: look.big, f: 1, m: 0 }, 0, 1.45);
    }
    COLORS.forEach(function (col) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'sw' + (col === look.color ? ' on' : '');
      b.style.background = col; b.setAttribute('aria-label', 'Colour ' + col);
      b.onclick = function () { look.color = col; [].forEach.call($('colors').children, function (x) { x.classList.toggle('on', x === b); }); preview(); };
      $('colors').appendChild(b);
    });
    HATS.forEach(function (name, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (i === look.hat ? ' on' : ''); b.textContent = name;
      b.onclick = function () { look.hat = i; [].forEach.call($('hats').children, function (x) { x.classList.toggle('on', x === b); }); preview(); };
      $('hats').appendChild(b);
    });
    $('bigIn').onchange = function () { look.big = $('bigIn').checked; preview(); };
    preview();
    $('joinForm').addEventListener('submit', function (e) {
      e.preventDefault();
      look.name = $('nameIn').value.trim();
      if (!look.name) { $('joinErr').textContent = 'Please type your name.'; return; }
      store('ft_name', look.name); store('ft_color', look.color); store('ft_hat', String(look.hat)); store('ft_big', look.big ? '1' : '0');
      $('joinErr').textContent = ''; $('playBtn').disabled = true; $('playBtn').textContent = 'Joining…';
      connect();
    });
    try {
      if (sessionStorage.getItem('ft_auto') && look.name) { sessionStorage.removeItem('ft_auto'); setTimeout(function () { $('playBtn').click(); }, 300); }
    } catch (e) {}
  })();

  // ---------- network ----------
  function connect() {
    try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host); }
    catch (e) { joinFailed('Could not connect to the game.'); return; }
    ws.onopen = function () { send({ t: 'join', name: look.name, color: look.color, hat: look.hat, big: look.big }); };
    ws.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (e) { return; } handle(m); };
    ws.onclose = function () {
      if (joined) { $('lost').hidden = false; setTimeout(connect, 2000); }
      else if ($('playBtn').disabled) joinFailed($('joinErr').textContent || 'Could not connect to the game.');
    };
  }
  // ---------- new release check ----------
  // The page remembers which version it was loaded from. If the server later reports another one
  // (the live server was restarted on a new release), the page reloads itself to get the new game.
  var reloading = false;
  function newRelease() {
    if (reloading) return; reloading = true;
    var el = $('lost'); el.textContent = 'New version of the game! Updating…'; el.hidden = false;
    try { if (joined) sessionStorage.setItem('ft_auto', '1'); } catch (e) {} // come straight back into the town after the update
    setTimeout(function () { location.reload(); }, 1200);
  }
  function checkRelease() {
    var x = new XMLHttpRequest(); x.open('GET', '/api/status?' + Date.now()); x.timeout = 4000;
    x.onload = function () {
      var v = null; try { v = JSON.parse(x.responseText).version; } catch (e) {}
      if (!v) return;
      if (!version) version = v; else if (v !== version) newRelease();
    };
    x.send();
  }
  checkRelease();
  setInterval(checkRelease, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) checkRelease(); });

  function joinFailed(msg) { $('joinErr').textContent = msg; $('playBtn').disabled = false; $('playBtn').textContent = 'Play'; }

  function handle(m) {
    var p, i;
    switch (m.t) {
      case 'err':
        if (!joined) $('joinErr').textContent = m.msg;
        try { ws.close(); } catch (e) {}
        break;
      case 'welcome':
        if (version && version !== m.version) { newRelease(); return; } // a new release went live
        version = m.version; me = m.id; world = m.world; stars = m.stars;
        if (!joined) { my.x = m.x; my.y = m.y; toast('Drag on the left side to walk. On a laptop, use the arrow keys.'); }
        joined = true;
        $('join').hidden = true; $('lost').hidden = true; $('hud').hidden = (room === 'studio');
        if (room === 'studio') send({ t: 'room', room: 'studio' });
        sent.t = 0; sent.x = -1;
        break;
      case 'players':
        var seen = {};
        for (i = 0; i < m.list.length; i++) {
          var d = m.list[i]; p = players[d.id];
          if (!p) p = players[d.id] = { x: world ? world.spawn.x : 0, y: world ? world.spawn.y : 0, tx: 0, ty: 0, f: 1, m: 0, placed: false };
          p.id = d.id; p.name = d.name; p.color = d.color; p.hat = d.hat; p.big = d.big; p.stars = d.stars; p.room = d.room;
          p.outfit = d.outfit; p.car = d.car; p.drive = d.drive;
          seen[d.id] = 1;
        }
        Object.keys(players).forEach(function (id) { if (!seen[id]) delete players[id]; });
        family = m.family; updateHud(); renderStudioSide();
        break;
      case 'state':
        for (i = 0; i < m.p.length; i++) {
          var s = m.p[i]; p = players[s[0]];
          if (!p || s[0] === me) continue;
          p.tx = s[1]; p.ty = s[2]; p.f = s[3]; p.m = s[4];
          if (!p.placed) { p.x = p.tx; p.y = p.ty; p.placed = true; }
        }
        break;
      case 'stars': stars = m.list; break;
      case 'card': showCard(m.word); break;
      case 'toast': toast(m.msg); break;
      case 'emote': p = players[m.id]; if (p) { p.emote = EMOTES[m.e] || EMOTES[0]; p.emoteUntil = Date.now() + 2600; } break;
      case 'tag': tag.on = m.on; tag.it = m.it; tag.ends = Date.now() + m.left; updateTag(); break;
      case 'strokes': sClear(); for (i = 0; i < m.list.length; i++) sSeg(m.list[i].c, m.list[i].w, m.list[i].pts); break;
      case 'draw': sSeg(m.c, m.w, m.pts); break;
      case 'clear': sClear(); break;
      case 'guess': onGuess(m); break;
    }
  }

  // ---------- HUD ----------
  function chips(list, withRoom) {
    return list.map(function (p) {
      return '<span class="tagc"><i style="background:' + esc(p.color) + '"></i>' + esc(p.name) + (p.id === me ? ' (you)' : '') +
        ' <em>⭐' + p.stars + (withRoom && p.room === 'studio' ? ' 🎨' : '') + '</em></span>';
    }).join('');
  }
  function plist() { return Object.keys(players).map(function (id) { return players[id]; }).sort(function (a, b) { return a.id - b.id; }); }
  function updateHud() {
    var p = mine(); if (!p || !world) return;
    $('myStars').textContent = p.stars;
    $('famStars').textContent = family;
    var next = world.goals.filter(function (g) { return g > family; })[0];
    $('famGoal').textContent = next ? '/ ' + next + ' family goal' : 'all goals reached!';
    $('who').innerHTML = chips(plist(), true);
  }
  function updateTag() {
    var pill = $('tagPill');
    if (!tag.on) { pill.hidden = true; return; }
    var it = players[tag.it], left = Math.max(0, Math.ceil((tag.ends - Date.now()) / 1000));
    pill.hidden = false;
    pill.textContent = (tag.it === me ? 'You are IT! Catch someone' : (it ? it.name : 'Someone') + ' is IT. Run!') + ' · ' + left + 's';
  }
  setInterval(function () { if (tag.on) updateTag(); tickGuessTime(); }, 500);

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 3600);
  }

  // word card + reading aloud
  var cardWord = null, cardTimer = null;
  function showCard(w) {
    cardWord = w;
    $('cardPic').textContent = w.pic; $('cardEn').textContent = w.en; $('cardZh').innerHTML = esc(w.zh) + ' ' + pyHtml(w); $('cardMs').textContent = w.ms;
    $('card').hidden = false;
    clearTimeout(cardTimer); cardTimer = setTimeout(function () { $('card').hidden = true; }, 7000);
  }
  $('card').onclick = function () { if (cardWord) speak(cardWord); };
  function speak(w) {
    var syn = window.speechSynthesis; if (!syn || !window.SpeechSynthesisUtterance) return;
    try {
      syn.cancel();
      var voices = syn.getVoices() || [], hasMs = voices.some(function (v) { return /^ms/i.test(v.lang); }), hasId = voices.some(function (v) { return /^id/i.test(v.lang); });
      [[w.en, 'en-US'], [w.zh, 'zh-CN'], [w.ms, hasMs || !hasId ? 'ms-MY' : 'id-ID']].forEach(function (x) {
        var u = new SpeechSynthesisUtterance(x[0]); u.lang = x[1]; u.rate = 0.85; syn.speak(u);
      });
    } catch (e) {}
  }

  // emotes, full screen, drive
  EMOTES.forEach(function (e, i) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = e; b.setAttribute('aria-label', 'Emote ' + (i + 1));
    b.onclick = function () { send({ t: 'emote', e: i }); $('emotes').hidden = true; };
    $('emotes').appendChild(b);
  });
  $('emoteBtn').onclick = function () { $('emotes').hidden = !$('emotes').hidden; };
  $('fsBtn').onclick = function () {
    var d = document, el = d.documentElement;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    } catch (e) {}
  };
  $('driveBtn').onclick = function () { var p = mine(); if (p) send({ t: 'drive', on: !p.drive }); };

  // context action button
  var action = null;
  function doorOf(b) { return { x: b.x + b.w / 2, y: b.y + b.h + 34 }; }
  function findAction() {
    if (!world) return null;
    var best = null, bd = 125 * 125;
    world.buildings.forEach(function (b) {
      var d = doorOf(b), dx = d.x - my.x, dy = d.y - my.y, q = dx * dx + dy * dy;
      if (q < bd) { bd = q; best = b; }
    });
    if (best) {
      var txt = { studio: 'Enter Art Studio', gallery: 'Open Gallery', dress: 'Enter Dress-Up', cars: 'Enter Car Garage' }[best.id];
      return best.open && txt ? { id: best.id, text: txt } : { id: null, text: best.name + ' · coming soon' };
    }
    var g = world.playground;
    if (!tag.on && my.x > g.x && my.x < g.x + g.w && my.y > g.y && my.y < g.y + g.h + 40) return { id: 'tag', text: 'Play Tag!' };
    return null;
  }
  setInterval(function () {
    if (!joined || room !== 'town') return;
    var a = findAction(), btn = $('actBtn');
    if (!a) { btn.hidden = true; action = null; }
    else if (!action || action.text !== a.text) { btn.hidden = false; btn.textContent = a.text; btn.disabled = !a.id; }
    action = a;
    var p = mine(), d = $('driveBtn');
    d.hidden = !(p && p.car && Car && !tag.on);
    if (p) { d.textContent = p.drive ? '🚶' : '🚗'; d.setAttribute('aria-label', p.drive ? 'Get out of the car' : 'Drive my car'); }
  }, 200);
  $('actBtn').onclick = function () {
    if (!action || !action.id) return;
    var p = mine();
    if (action.id === 'studio') enterStudio();
    else if (action.id === 'gallery') openGallery();
    else if (action.id === 'tag') send({ t: 'tagStart' });
    else if (action.id === 'dress') {
      if (!Dress) return toast('Dress-Up is not ready yet.');
      Dress.open(p && p.outfit, function (d) { send({ t: 'look', outfit: d }); send({ t: 'drive', on: false }); toast('Lovely! Everyone in town can see your new look.'); });
    } else if (action.id === 'cars') {
      if (!Car) return toast('The Car Garage is not ready yet.');
      Car.open(p && p.car, function (d) { send({ t: 'look', car: d }); send({ t: 'drive', on: true }); toast('Vroom! Tap the car button to get in or out.'); }, { driver: p ? p.color : undefined });
    }
  };

  // ---------- input ----------
  var town = $('town'), ctx = town.getContext('2d'), dpr = 1, W = 0, H = 0;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight;
    town.width = Math.round(W * dpr); town.height = Math.round(H * dpr);
    fitPaper();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', function (e) { if (e.target && e.target.tagName === 'INPUT') return; keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', function () { keys = {}; joy = null; });
  town.addEventListener('pointerdown', function (e) {
    $('emotes').hidden = true;
    if (joy || !joined) return;
    joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    try { town.setPointerCapture(e.pointerId); } catch (err) {}
  });
  town.addEventListener('pointermove', function (e) {
    if (!joy || e.pointerId !== joy.id) return;
    var dx = (e.clientX - joy.ox) / 60, dy = (e.clientY - joy.oy) / 60, l = Math.sqrt(dx * dx + dy * dy);
    if (l > 1) { dx /= l; dy /= l; }
    joy.dx = dx; joy.dy = dy;
  });
  function joyEnd(e) { if (joy && e.pointerId === joy.id) joy = null; }
  town.addEventListener('pointerup', joyEnd); town.addEventListener('pointercancel', joyEnd);
  // true when another screen (a designer, the gallery) sits on top of the town
  function covered() { var el = document.elementFromPoint(8, Math.round(H * 0.6)); return !!el && el !== town; }

  function blocked(x, y) {
    for (var i = 0; i < world.buildings.length; i++) {
      var b = world.buildings[i];
      if (x > b.x - 24 && x < b.x + b.w + 24 && y > b.y + 50 && y < b.y + b.h + 12) return true;
    }
    return false;
  }

  // ---------- update ----------
  function update(dt, now) {
    if (!joined || !world) return;
    var p = mine();
    if (room === 'town') {
      var vx = 0, vy = 0;
      if (joy) { vx = joy.dx; vy = joy.dy; }
      else if ((keys.arrowleft || keys.a || keys.arrowright || keys.d || keys.arrowup || keys.w || keys.arrowdown || keys.s) && !covered()) {
        vx = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
        vy = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
      }
      var l = Math.sqrt(vx * vx + vy * vy);
      if (l > 1) { vx /= l; vy /= l; }
      if (l > 0.12) {
        var sp = (p && p.drive ? 430 : 265) * dt;
        var nx = clamp(my.x + vx * sp, 40, world.w - 40), ny = clamp(my.y + vy * sp, 90, world.h - 30);
        if (!blocked(nx, my.y)) my.x = nx;
        if (!blocked(my.x, ny)) my.y = ny;
        if (vx > 0.1) my.f = 1; else if (vx < -0.1) my.f = -1;
        my.m = 1;
      } else my.m = 0;
      if (now - sent.t > 80 && (my.x !== sent.x || my.y !== sent.y || my.m !== sent.m || my.f !== sent.f)) {
        send({ t: 'move', x: Math.round(my.x), y: Math.round(my.y), f: my.f, m: my.m });
        sent.x = my.x; sent.y = my.y; sent.m = my.m; sent.f = my.f; sent.t = now;
      }
    }
    if (p) { p.x = my.x; p.y = my.y; p.f = my.f; p.m = room === 'town' ? my.m : 0; }
    var k = Math.min(1, dt * 14);
    Object.keys(players).forEach(function (id) {
      var o = players[id]; if (o.id === me || !o.placed) return;
      o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k;
    });
  }

  // ---------- render the town ----------
  function drawBuilding(c, b) {
    var wallTop = b.y + 84;
    c.lineJoin = 'round'; c.lineWidth = 4; c.strokeStyle = NAVY;
    rr(c, b.x, wallTop, b.w, b.h - 84, 14); c.fillStyle = b.open ? b.wall : '#D9D4C7'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(b.x - 22, wallTop + 6); c.lineTo(b.x + 34, b.y); c.lineTo(b.x + b.w - 34, b.y); c.lineTo(b.x + b.w + 22, wallTop + 6); c.closePath();
    c.fillStyle = b.open ? b.roof : '#9A968C'; c.fill(); c.stroke();
    // windows
    c.fillStyle = b.open ? '#FFF6C9' : '#B9B5AA';
    rr(c, b.x + 36, wallTop + 58, 70, 60, 10); c.fill(); c.stroke();
    rr(c, b.x + b.w - 106, wallTop + 58, 70, 60, 10); c.fill(); c.stroke();
    // door
    var dx = b.x + b.w / 2;
    rr(c, dx - 36, b.y + b.h - 96, 72, 96, 14); c.fillStyle = b.open ? NAVY : '#7E7A70'; c.fill(); c.stroke();
    c.fillStyle = '#FFD66B'; c.beginPath(); c.arc(dx + 20, b.y + b.h - 46, 5, 0, 7); c.fill();
    // sign
    c.font = '700 30px ' + FONT;
    var tw = Math.max(150, c.measureText(b.name).width + 40);
    rr(c, dx - tw / 2, wallTop + 4, tw, 46, 14); c.fillStyle = '#fff'; c.fill(); c.stroke();
    c.fillStyle = NAVY; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b.name, dx, wallTop + 28);
    if (!b.open) label(c, 'Coming soon', dx, b.y + 50, '#FFD66B', NAVY, 20);
    else if (family >= 60) { // family goal 2: balloons on every open building
      [['#FF4F6D', -1], ['#5AA9FF', 1]].forEach(function (q) {
        var bx = b.x + b.w / 2 + q[1] * (b.w / 2 - 20), by = b.y - 46;
        c.lineWidth = 2; c.beginPath(); c.moveTo(bx, b.y + 4); c.lineTo(bx, by + 22); c.stroke();
        c.lineWidth = 3; c.fillStyle = q[0]; c.beginPath(); c.ellipse(bx, by, 18, 23, 0, 0, 7); c.fill(); c.stroke();
      });
    }
  }
  function drawTree(c, x, y) {
    c.lineWidth = 3.5; c.strokeStyle = NAVY;
    c.fillStyle = 'rgba(27,42,73,0.16)'; c.beginPath(); c.ellipse(x, y, 40, 12, 0, 0, 7); c.fill();
    rr(c, x - 9, y - 50, 18, 52, 6); c.fillStyle = '#8C6239'; c.fill(); c.stroke();
    c.fillStyle = '#3F9A53'; c.beginPath(); c.arc(x, y - 82, 46, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#58B56B'; c.beginPath(); c.arc(x - 12, y - 94, 20, 0, 7); c.fill();
  }
  function drawFountain(c, x, y, t) {
    c.lineWidth = 4; c.strokeStyle = NAVY;
    c.fillStyle = '#CFC9BC'; c.beginPath(); c.ellipse(x, y - 14, 86, 34, 0, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#7CCBFF'; c.beginPath(); c.ellipse(x, y - 18, 70, 24, 0, 0, 7); c.fill(); c.stroke();
    rr(c, x - 10, y - 74, 20, 58, 6); c.fillStyle = '#CFC9BC'; c.fill(); c.stroke();
    c.strokeStyle = '#BFE9FF'; c.lineWidth = 5; c.lineCap = 'round';
    for (var i = -1; i <= 1; i += 2) { c.beginPath(); c.moveTo(x, y - 76); c.quadraticCurveTo(x + i * 26, y - 112 - Math.sin(t * 4) * 5, x + i * 42, y - 26); c.stroke(); }
  }
  function drawTrophy(c, x, y) {
    c.lineWidth = 4; c.strokeStyle = NAVY; c.lineJoin = 'round';
    rr(c, x - 34, y - 26, 68, 26, 6); c.fillStyle = '#8C6239'; c.fill(); c.stroke();
    rr(c, x - 8, y - 56, 16, 32, 4); c.fillStyle = '#FFC933'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x - 36, y - 124); c.lineTo(x + 36, y - 124); c.quadraticCurveTo(x + 34, y - 62, x, y - 54); c.quadraticCurveTo(x - 34, y - 62, x - 36, y - 124); c.closePath(); c.fill(); c.stroke();
    starPath(c, x, y - 96, 15); c.fillStyle = '#fff'; c.fill();
  }

  function render(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#4FA05A'; ctx.fillRect(0, 0, W, H);
    if (!joined || !world || room === 'studio') return;
    var scale = Math.max(H / 880, 0.7); if (W / scale < 700) scale = W / 700;
    var vw = W / scale, vh = H / scale;
    var cx = vw >= world.w ? (world.w - vw) / 2 : clamp(my.x - vw / 2, 0, world.w - vw);
    var cy = vh >= world.h ? (world.h - vh) / 2 : clamp(my.y - vh * 0.56, 0, world.h - vh);
    var c = ctx;
    c.setTransform(dpr * scale, 0, 0, dpr * scale, -cx * dpr * scale, -cy * dpr * scale);

    // ground
    rr(c, 0, 0, world.w, world.h, 40); c.fillStyle = '#7BD389'; c.fill();
    c.fillStyle = '#8ADB96';
    for (var i = 0; i < 30; i++) { c.beginPath(); c.ellipse((i * 397) % world.w, (i * 613) % world.h, 70, 26, 0, 0, 7); c.fill(); }
    if (family >= 120) { // family goal 3: rainbow behind the gallery
      ['#FF4F6D', '#FF9F43', '#FFD66B', '#4FA05A', '#5AA9FF', '#9B6BFF'].forEach(function (col, n) {
        c.strokeStyle = col; c.lineWidth = 16; c.beginPath(); c.arc(1200, 470, 420 - n * 16, Math.PI, 0); c.stroke();
      });
    }
    // paths
    c.strokeStyle = '#EBD9A4'; c.lineWidth = 74; c.lineCap = 'round'; c.lineJoin = 'round';
    world.buildings.forEach(function (b) {
      var d = doorOf(b);
      c.beginPath(); c.moveTo(world.spawn.x, world.spawn.y); c.lineTo(d.x, world.spawn.y); c.lineTo(d.x, d.y - 20); c.stroke();
    });
    var g = world.playground;
    c.beginPath(); c.moveTo(world.spawn.x, world.spawn.y); c.lineTo(g.x + g.w / 2, world.spawn.y); c.lineTo(g.x + g.w / 2, g.y + g.h); c.stroke();
    c.fillStyle = '#EBD9A4'; c.beginPath(); c.arc(world.spawn.x, world.spawn.y, 160, 0, 7); c.fill();
    // playground
    rr(c, g.x, g.y, g.w, g.h, 36); c.fillStyle = '#F6E2A8'; c.fill();
    c.setLineDash([18, 14]); c.lineWidth = 5; c.strokeStyle = tag.on ? '#FF4F6D' : '#C9A85C'; c.stroke(); c.setLineDash([]);
    c.lineWidth = 4; c.strokeStyle = NAVY; c.lineJoin = 'round';
    c.fillStyle = '#5AA9FF'; c.beginPath(); c.moveTo(g.x + 70, g.y + 250); c.lineTo(g.x + 150, g.y + 110); c.lineTo(g.x + 176, g.y + 110); c.lineTo(g.x + 176, g.y + 250); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#FF7A45'; c.beginPath(); c.arc(g.x + 360, g.y + 230, 30, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(g.x + 350, g.y + 220, 9, 0, 7); c.fill();
    label(c, 'Playground · Tag', g.x + g.w / 2, g.y + 62, '#fff', NAVY, 26);

    // everything that can overlap, sorted from back to front
    var items = [];
    world.buildings.forEach(function (b) { items.push({ y: b.y + b.h, d: function () { drawBuilding(c, b); } }); });
    TREES.forEach(function (q) { items.push({ y: q[1], d: function () { drawTree(c, q[0], q[1]); } }); });
    if (family >= 25) items.push({ y: 660, d: function () { drawFountain(c, 1200, 660, t); } });
    if (family >= 200) items.push({ y: 1010, d: function () { drawTrophy(c, 1400, 1010); } });
    stars.forEach(function (s) {
      items.push({ y: s.y, d: function () {
        var bob = Math.sin(t * 3 + s.id) * 6;
        c.fillStyle = 'rgba(27,42,73,0.16)'; c.beginPath(); c.ellipse(s.x, s.y + 6, 18, 6, 0, 0, 7); c.fill();
        starPath(c, s.x, s.y - 30 + bob, 24); c.fillStyle = '#FFC933'; c.fill(); c.lineWidth = 3.5; c.strokeStyle = NAVY; c.lineJoin = 'round'; c.stroke();
      } });
    });
    Object.keys(players).forEach(function (id) {
      var p = players[id];
      if (p.room !== 'town' || (p.id !== me && !p.placed)) return;
      items.push({ y: p.y, d: function () {
        var h = drawPlayer(c, p, p.x, p.y, t + p.id * 0.7), top = p.y - h - 8;
        top -= label(c, p.name, p.x, top, p.id === me ? '#FFD66B' : '#fff', NAVY, 18) + 4;
        if (tag.on && tag.it === p.id) top -= label(c, 'IT', p.x, top, '#FF4F6D', '#fff', 20) + 4;
        if (p.emote && p.emoteUntil > Date.now()) {
          c.font = '44px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText(p.emote, p.x, top - 4);
        }
      } });
    });
    items.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < items.length; i++) items[i].d();

    // joystick
    if (joy) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = 'rgba(255,255,255,0.45)'; c.strokeStyle = NAVY; c.lineWidth = 3;
      c.beginPath(); c.arc(joy.ox, joy.oy, 62, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#FFD66B'; c.beginPath(); c.arc(joy.ox + joy.dx * 50, joy.oy + joy.dy * 50, 28, 0, 7); c.fill(); c.stroke();
    }
  }

  var last = 0;
  function frame(ts) {
    var dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    update(dt, ts); render(ts / 1000);
    requestAnimationFrame(frame);
  }

  // ---------- Art Studio ----------
  var paper = $('paper'), sctx = paper.getContext('2d'), SW = 960, SH = 600;
  var brush = { c: PALETTE[0], w: SIZES[1], eraser: false };
  var g = { phase: 'idle', drawer: 0, ends: 0, guessed: [], word: null, options: [], wrong: [] };
  var stroke = null, buf = [], pending = false, lastPt = null, spoken = 0;

  function sClear() { sctx.fillStyle = '#fff'; sctx.fillRect(0, 0, SW, SH); }
  function sSeg(col, w, pts) {
    sctx.strokeStyle = col; sctx.lineWidth = w; sctx.lineCap = 'round'; sctx.lineJoin = 'round';
    sctx.beginPath(); sctx.moveTo(pts[0], pts[1]);
    if (pts.length < 4) sctx.lineTo(pts[0] + 0.01, pts[1]);
    for (var i = 2; i < pts.length; i += 2) sctx.lineTo(pts[i], pts[i + 1]);
    sctx.stroke();
  }
  function fitPaper() {
    var wr = $('sWrap'); if (!wr || $('studio').hidden) return;
    var aw = wr.clientWidth, ah = wr.clientHeight, w = Math.min(aw, ah * SW / SH);
    paper.style.width = Math.floor(w) + 'px'; paper.style.height = Math.floor(w * SH / SW) + 'px';
  }
  function canDraw() { return g.phase === 'idle' || (g.phase === 'draw' && g.drawer === me); }
  function ppos(e) { var r = paper.getBoundingClientRect(); return { x: Math.round((e.clientX - r.left) * SW / r.width), y: Math.round((e.clientY - r.top) * SH / r.height) }; }
  function curCol() { return brush.eraser ? '#ffffff' : brush.c; }
  function curW() { return brush.eraser ? Math.max(30, brush.w * 2) : brush.w; }
  function flush() {
    if (!pending) return;
    send({ t: 'draw', c: curCol(), w: curW(), pts: buf });
    buf = lastPt ? [lastPt.x, lastPt.y] : []; pending = false;
  }
  setInterval(flush, 70);
  paper.addEventListener('pointerdown', function (e) {
    if (stroke !== null || !canDraw()) return;
    stroke = e.pointerId; try { paper.setPointerCapture(e.pointerId); } catch (err) {}
    lastPt = ppos(e); buf = [lastPt.x, lastPt.y]; pending = true;
    sSeg(curCol(), curW(), buf);
  });
  paper.addEventListener('pointermove', function (e) {
    if (e.pointerId !== stroke) return;
    var p = ppos(e); if (Math.abs(p.x - lastPt.x) + Math.abs(p.y - lastPt.y) < 2) return;
    sSeg(curCol(), curW(), [lastPt.x, lastPt.y, p.x, p.y]);
    buf.push(p.x, p.y); lastPt = p; pending = true;
    if (buf.length > 300) flush();
  });
  function strokeEnd(e) { if (e.pointerId !== stroke) return; flush(); stroke = null; lastPt = null; buf = []; }
  paper.addEventListener('pointerup', strokeEnd); paper.addEventListener('pointercancel', strokeEnd);

  PALETTE.forEach(function (col, i) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'sw' + (i === 0 ? ' on' : ''); b.style.background = col; b.setAttribute('aria-label', 'Colour ' + (i + 1));
    b.onclick = function () { brush.c = col; brush.eraser = false; $('eraserBtn').classList.remove('on'); [].forEach.call($('palette').children, function (x) { x.classList.toggle('on', x === b); }); };
    $('palette').appendChild(b);
  });
  SIZES.forEach(function (w, i) {
    var b = document.createElement('button'); b.type = 'button'; b.className = i === 1 ? 'on' : ''; b.setAttribute('aria-label', ['Thin', 'Medium', 'Thick'][i] + ' brush');
    var dot = document.createElement('i'); dot.style.width = dot.style.height = Math.min(28, w + 3) + 'px'; b.appendChild(dot);
    b.onclick = function () { brush.w = w; [].forEach.call($('sizes').children, function (x) { x.classList.toggle('on', x === b); }); };
    $('sizes').appendChild(b);
  });
  $('eraserBtn').onclick = function () { brush.eraser = !brush.eraser; $('eraserBtn').classList.toggle('on', brush.eraser); };
  var clearArm = 0;
  $('clearBtn').onclick = function () { // two taps, so a drawing is not wiped by accident
    if (!canDraw()) return;
    if (Date.now() < clearArm) { send({ t: 'clear' }); clearArm = 0; $('clearBtn').textContent = 'Clear'; return; }
    clearArm = Date.now() + 2500; $('clearBtn').textContent = 'Tap again';
    setTimeout(function () { if (Date.now() >= clearArm) $('clearBtn').textContent = 'Clear'; }, 2600);
  };
  $('saveBtn').onclick = function () {
    var btn = $('saveBtn'); btn.disabled = true;
    var x = new XMLHttpRequest(); x.open('POST', '/api/gallery'); x.setRequestHeader('Content-Type', 'application/json');
    x.onloadend = function () { btn.disabled = false; if (x.status !== 200) toast('Could not save the picture.'); };
    x.send(JSON.stringify({ name: look.name, img: paper.toDataURL('image/png') }));
  };
  $('guessBtn').onclick = function () { send({ t: g.phase === 'idle' ? 'guessStart' : 'guessStop' }); };
  $('exitStudio').onclick = function () { room = 'town'; send({ t: 'room', room: 'town' }); $('studio').hidden = true; $('hud').hidden = false; };
  function enterStudio() {
    room = 'studio'; joy = null; send({ t: 'room', room: 'studio' });
    $('studio').hidden = false; $('hud').hidden = true; $('card').hidden = true;
    sClear(); fitPaper(); renderGuess();
  }
  // Pinyin gets its own span: the Fredoka font draws "ī" wrongly, so .py uses the device font.
  function pyHtml(w) { return '<span class="py">' + esc(w.py) + '</span>'; }
  function word3(w) { return '<b>' + esc(w.en) + '</b> · ' + esc(w.zh) + ' ' + pyHtml(w) + ' · ' + esc(w.ms); }
  function onGuess(m) {
    var was = g.phase;
    g.phase = m.phase; g.drawer = m.drawer; g.ends = Date.now() + m.left; g.guessed = m.guessed || [];
    g.word = m.word || null; g.options = m.options || []; g.wrong = m.wrong || [];
    if (g.phase === 'reveal' && was !== 'reveal' && g.word) speak(g.word);
    if (!canDraw() && stroke !== null) { stroke = null; pending = false; }
    renderGuess();
  }
  function tickGuessTime() {
    var el = document.querySelector('#sStatus .time');
    if (el) el.textContent = Math.max(0, Math.ceil((g.ends - Date.now()) / 1000)) + 's';
  }
  function renderStudioSide() { $('sWho').innerHTML = chips(plist().filter(function (p) { return p.room === 'studio'; }), false); }
  function renderGuess() {
    if ($('studio').hidden) return;
    var st = $('sStatus'), op = $('sOptions'), d = players[g.drawer], dn = d ? esc(d.name) : 'Someone', time = '<span class="time"></span>';
    var names = g.guessed.map(function (id) { return players[id] ? esc(players[id].name) : ''; }).filter(Boolean).join(', ');
    op.innerHTML = '';
    $('guessBtn').textContent = g.phase === 'idle' ? 'Guessing game' : 'Stop the game';
    paper.style.cursor = canDraw() ? 'crosshair' : 'not-allowed';
    if (g.phase === 'idle') {
      st.innerHTML = 'Draw together! Everyone can draw on the same paper.';
      op.innerHTML = '<p class="hint">Guessing game: one person draws a word, the others pick it in English, 中文 and Bahasa Malaysia. Needs 2 players here.</p>';
    } else if (g.phase === 'draw' && g.drawer === me) {
      st.innerHTML = '<span class="pic">' + esc(g.word.pic) + '</span><span>Your turn! Draw: ' + word3(g.word) + '</span>' + time;
      op.innerHTML = '<p class="hint">Only you can see the word. ' + (names ? 'Guessed it: ' + names : 'Nobody has guessed yet.') + '</p>';
    } else if (g.phase === 'draw') {
      var got = g.guessed.indexOf(me) >= 0;
      st.innerHTML = '<span>' + dn + ' is drawing. ' + (got ? 'You got it!' : 'What is it?') + '</span>' + time;
      g.options.forEach(function (w, i) {
        var row = document.createElement('div'); row.className = 'opt';
        var b = document.createElement('button'); b.type = 'button'; b.className = 'pick' + (g.wrong.indexOf(i) >= 0 ? ' bad' : '');
        b.innerHTML = '<b>' + esc(w.en) + '</b><span>' + esc(w.zh) + ' ' + pyHtml(w) + '</span><span>' + esc(w.ms) + '</span>';
        b.disabled = got || g.wrong.indexOf(i) >= 0;
        b.onclick = function () { send({ t: 'guessTry', i: i }); };
        var s = document.createElement('button'); s.type = 'button'; s.className = 'say'; s.textContent = '🔊'; s.setAttribute('aria-label', 'Hear ' + w.en);
        s.onclick = function () { speak(w); };
        row.appendChild(b); row.appendChild(s); op.appendChild(row);
      });
    } else {
      st.innerHTML = '<span class="pic">' + esc(g.word.pic) + '</span><span>It was: ' + word3(g.word) + '</span>' + time;
      op.innerHTML = '<p class="hint">' + (names ? 'Well done: ' + names + '!' : 'Nobody got it this time.') + ' Next round is coming…</p>';
    }
    tickGuessTime(); renderStudioSide();
  }

  // ---------- Gallery ----------
  function openGallery() {
    room = 'gallery'; joy = null; $('gallery').hidden = false; $('hud').hidden = true;
    var grid = $('galGrid'); grid.innerHTML = '<p class="empty">Loading…</p>';
    var x = new XMLHttpRequest(); x.open('GET', '/api/gallery');
    x.onload = function () {
      var list = []; try { list = JSON.parse(x.responseText); } catch (e) {}
      if (!list.length) { grid.innerHTML = '<p class="empty">No pictures yet. Draw one in the Art Studio and tap "Hang in Gallery".</p>'; return; }
      grid.innerHTML = list.map(function (it) {
        return '<div class="frame"><img alt="Drawing by ' + esc(it.name) + '" src="/gallery/' + encodeURIComponent(it.file) + '"><p>By ' + esc(it.name) + '</p></div>';
      }).join('');
    };
    x.onerror = function () { grid.innerHTML = '<p class="empty">Could not load the gallery.</p>'; };
    x.send();
  }
  $('exitGallery').onclick = function () { room = 'town'; $('gallery').hidden = true; $('hud').hidden = false; };

  resize(); sClear();
  requestAnimationFrame(frame);
})();
