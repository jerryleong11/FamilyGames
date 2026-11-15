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
  var Dress = window.DressDesigner || null, Car = window.CarDesigner || null, Scene = window.Scene;

  // ---------- state ----------
  var ws = null, me = 0, world = null, version = null, joined = false, room = 'town';
  var GAMES = window.FTGames = window.FTGames || {}; // pets, race, obby ...: one file each in games/, see docs/GAME-MODULES.md
  var ROOM_ICON = { studio: '🎨', pets: '🐾', race: '🏁', obby: '🧗', boss: '👾', monopoly: '🎲', escape: '🗝️', plot: '🏡' };
  var pops = []; // "+1" floating up from my player when stars come in
  var players = {}, stars = [], family = 0;
  var my = { x: 0, y: 0, f: 1, m: 0 };
  var look = { name: '', color: COLORS[0], hat: 0, big: false };
  var tag = { on: false, it: 0, ends: 0 };
  var keys = {}, joy = null;
  var sent = { x: 0, y: 0, m: 0, f: 1, t: 0 };
  // growth system: the shop catalogue (from "welcome") and this player's own numbers (from "me")
  var shop = null, meState = null, buyWait = {}, gotList = false, famKnown = false;

  // sounds live in sound.js; the game must work without it
  function sfx(name) { try { if (window.Sfx && typeof window.Sfx.play === 'function') window.Sfx.play(name); } catch (e) {} }

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
    c.lineWidth = 3.5 * s; c.strokeStyle = NAVY;
    rr(c, left + 7 * s, top - 5 * s, w, h, 18 * s); c.fillStyle = Scene.shade(p.color, -0.28); c.fill(); c.stroke();   // the side, for a chunky 2.5D block
    rr(c, left, top, w, h, 18 * s); c.fillStyle = p.color; c.fill(); c.stroke();
    c.save(); rr(c, left, top, w, h, 18 * s); c.clip();
    c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.ellipse(left + w * 0.3, top + h * 0.12, w * 0.42, h * 0.2, -0.3, 0, 7); c.fill();
    c.fillStyle = 'rgba(27,42,73,0.12)'; c.fillRect(left, top + h * 0.78, w, h * 0.22);
    c.restore();
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
  // Name tag above a player: a dark "Lv 3" part on the left when the level is known, then the name.
  function nameTag(c, p, x, y, own) {
    var size = 18, h = size + 10, lt = p.lv ? 'Lv ' + p.lv : '', lw = 0;
    c.font = '600 ' + size + 'px ' + FONT;
    var nw = c.measureText(p.name).width + 18;
    if (lt) { c.font = '700 14px ' + FONT; lw = c.measureText(lt).width + 16; }
    var w = nw + lw, left = x - w / 2;
    rr(c, left, y - h, w, h, h / 2); c.fillStyle = own ? '#FFD66B' : '#fff'; c.fill();
    if (lt) {
      c.save(); rr(c, left, y - h, w, h, h / 2); c.clip();
      c.fillStyle = NAVY; c.fillRect(left, y - h, lw, h); c.restore();
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(lt, left + lw / 2 + 2, y - h / 2 + 1);
    }
    rr(c, left, y - h, w, h, h / 2); c.lineWidth = 2.5; c.strokeStyle = NAVY; c.stroke();
    c.font = '600 ' + size + 'px ' + FONT; c.fillStyle = NAVY; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(p.name, left + lw + nw / 2 - (lt ? 2 : 0), y - h / 2 + 1);
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
        shop = m.shop || null; meState = null; // an older server sends neither "shop" nor "me": the game then plays as before
        if (!joined) { my.x = m.x; my.y = m.y; toast('Drag on the left side to walk. On a laptop, use the arrow keys.'); }
        joined = true;
        $('join').hidden = true; $('lost').hidden = true; $('hud').hidden = (room !== 'town');
        if (room === 'studio' || GAMES[room]) send({ t: 'room', room: room });
        sent.t = 0; sent.x = -1;
        break;
      case 'players':
        var seen = {}, fresh = false, goalHit = false, wasDrive = !!(mine() && mine().drive);
        for (i = 0; i < m.list.length; i++) {
          var d = m.list[i]; p = players[d.id];
          if (!p) {
            p = players[d.id] = { x: world ? world.spawn.x : 0, y: world ? world.spawn.y : 0, tx: 0, ty: 0, f: 1, m: 0, placed: false };
            if (gotList && d.id !== me) fresh = true;
          }
          p.id = d.id; p.name = d.name; p.color = d.color; p.hat = d.hat; p.big = d.big; p.stars = d.stars; p.room = d.room;
          p.outfit = d.outfit; p.car = d.car; p.drive = d.drive; p.lv = d.lv || 0; p.ext = d.ext || {};
          seen[d.id] = 1;
        }
        Object.keys(players).forEach(function (id) { if (!seen[id]) delete players[id]; });
        if (famKnown && world) world.goals.forEach(function (gl) { if (family < gl && m.family >= gl) goalHit = true; });
        family = m.family; famKnown = true; gotList = true;
        updateHud(); renderStudioSide();
        if (goalHit) sfx('goal'); else if (fresh) sfx('join');
        if (!wasDrive && mine() && mine().drive) sfx('car');
        gameEvent('onPlayers');
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
      case 'got': sfx('star'); if (room === 'town') pops.push({ n: m.n || 1, t0: Date.now() }); break;
      case 'toast': toast(m.msg); break;
      case 'emote': p = players[m.id]; if (p) { p.emote = EMOTES[m.e] || EMOTES[0]; p.emoteUntil = Date.now() + 2600; if (room === 'town') sfx('emote'); } break;
      case 'tag':
        var wasOn = tag.on, wasIt = tag.it, wasEnds = tag.ends;
        tag.on = !!m.on; tag.it = m.it; tag.ends = Date.now() + m.left; updateTag();
        if (tag.on && tag.it === me && (!wasOn || wasIt !== me)) sfx('tagit');
        else if (wasOn && !tag.on && wasIt !== me && Date.now() > wasEnds - 2500) sfx('tagwin'); // time ran out and I was not "it"
        break;
      case 'me':
        if (!Array.isArray(m.owned)) m.owned = [];
        meState = m; updateHud(); renderQuests(); gameEvent('onMe');
        break;
      case 'questDone': onQuestDone(m); break;
      case 'levelup': celebrate({ kind: 'level', lv: m.lv, items: Array.isArray(m.items) ? m.items : [] }); break;
      case 'bought': onBought(m); break;
      case 'chestOpen': celebrate({ kind: 'chest', stars: m.stars || 0, item: m.item || null, streak: m.streak || 0 }); break;
      case 'strokes': sClear(); for (i = 0; i < m.list.length; i++) sSeg(m.list[i].c, m.list[i].w, m.list[i].pts); break;
      case 'draw': sSeg(m.c, m.w, m.pts); break;
      case 'clear': sClear(); break;
      case 'guess': onGuess(m); break;
      default: // "pets.state", "race.go" ...: messages for a game module
        var dot = String(m.t).indexOf('.'), gm = dot > 0 ? GAMES[m.t.slice(0, dot)] : null;
        if (gm && typeof gm.onMessage === 'function') { try { gm.onMessage(m); } catch (e) { if (window.console) console.error(e); } }
    }
  }

  // ---------- HUD ----------
  function chips(list, withRoom) {
    // Your own chip is yellow, like your name tag. In town the chip shows the level; without levels (older server) the stars.
    return list.map(function (p) {
      return '<span class="tagc' + (p.id === me ? ' me' : '') + '"><i style="background:' + esc(p.color) + '"></i>' + esc(p.name) +
        (p.lv ? ' <b class="lvc">Lv ' + p.lv + '</b>' : '') +
        (withRoom && p.lv ? '' : ' <em>⭐' + p.stars + '</em>') + (withRoom && ROOM_ICON[p.room] ? ' <em>' + ROOM_ICON[p.room] + '</em>' : '') + '</span>';
    }).join('');
  }
  function plist() { return Object.keys(players).map(function (id) { return players[id]; }).sort(function (a, b) { return a.id - b.id; }); }
  // how far through the current level, 0-100
  function lvPct(st) {
    if (st.lvNext === null || st.lvNext === undefined) return 100;
    var span = st.lvNext - st.lvAt;
    return span > 0 ? clamp(Math.round((st.stars - st.lvAt) * 100 / span), 0, 100) : 100;
  }
  function updateHud() {
    var p = mine(), st = meState, qb = $('questBtn'), n = 0;
    $('myStars').textContent = st ? st.coins : (p ? p.stars : 0); // stars that can be spent
    $('lvPill').hidden = !st;
    if (st) { $('lvNum').textContent = 'Lv ' + st.lv; $('lvFill').style.width = lvPct(st) + '%'; }
    if (st && st.quests && st.quests.list) {
      st.quests.list.forEach(function (x) { if (x.done && !x.claimed) n++; });
      if (st.quests.chest === 'ready') n++;
      qb.hidden = false;
    } else qb.hidden = true;
    $('questDot').hidden = !n; $('questDot').textContent = n;
    qb.classList.toggle('has', n > 0);
    qb.setAttribute('aria-label', n ? 'Quests: ' + n + ' reward' + (n === 1 ? '' : 's') + ' waiting' : 'Quests');
    if (!p || !world) return;
    $('famStars').textContent = family;
    var next = world.goals.filter(function (g) { return g > family; })[0];
    $('famGoal').innerHTML = next ? '/ ' + next + '<span class="wo"> family goal</span>' : '<span class="wo">all goals reached!</span>';
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

  // reading a word aloud in three languages (used by the guessing game)
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
    b.setAttribute('data-quiet', ''); // the emote sound plays when the server echoes it
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

  // sound button: music + effects -> effects only -> off
  var SND_ICON = ['🔇', '🔊', '🎵'], SND_NAME = ['Sound is off', 'Sound effects only', 'Music and sound effects'];
  function sndMode() { try { return window.Sfx && typeof window.Sfx.mode === 'function' ? window.Sfx.mode() : -1; } catch (e) { return -1; } }
  function updateSnd() {
    var b = $('sndBtn'), m = sndMode();
    if (m < 0 || typeof window.Sfx.setMode !== 'function') { b.hidden = true; return; }
    b.hidden = false; b.textContent = SND_ICON[m] || SND_ICON[1]; b.setAttribute('aria-label', SND_NAME[m] || 'Sound');
  }
  $('sndBtn').onclick = function () {
    var m = sndMode(); if (m < 0) return;
    try { window.Sfx.setMode(m === 2 ? 1 : m === 1 ? 0 : 2); } catch (e) {}
    updateSnd(); toast(SND_NAME[sndMode()] || 'Sound');
  };
  updateSnd();

  // A soft tap for every button that has no sound of its own (data-quiet). The designers make their own sounds.
  document.addEventListener('click', function (e) {
    var el = e.target, btn = null;
    while (el && el.nodeType === 1) {
      if (!btn && el.tagName === 'BUTTON') btn = el;
      if (el.classList && (el.classList.contains('dd-ov') || el.classList.contains('cd-ov'))) return;
      el = el.parentNode;
    }
    if (btn && !btn.disabled && btn.getAttribute('data-quiet') === null) sfx('tap');
  }, true);

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
      if (!txt && GAMES[best.id] && typeof GAMES[best.id].open === 'function') txt = 'Enter ' + best.name;
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
    if (action.id === 'studio') { sfx('open'); enterStudio(); }
    else if (action.id === 'gallery') { sfx('open'); openGallery(); }
    else if (action.id === 'tag') { sfx('tap'); send({ t: 'tagStart' }); }
    else if (GAMES[action.id]) {
      sfx('open');
      try { GAMES[action.id].open(); } catch (e) { if (window.console) console.error(e); toast('Something went wrong opening this game.'); }
    }
    else if (action.id === 'dress') {
      if (!Dress) return toast('Dress-Up is not ready yet.');
      sfx('open');
      Dress.open(p && p.outfit, function (d) { send({ t: 'look', outfit: d }); send({ t: 'drive', on: false }); toast('Lovely! Everyone in town can see your new look.'); }, { shop: shopFor('outfit') });
    } else if (action.id === 'cars') {
      if (!Car) return toast('The Car Garage is not ready yet.');
      sfx('open');
      Car.open(p && p.car, function (d) { send({ t: 'look', car: d }); send({ t: 'drive', on: true }); toast('Vroom! Tap the car button to get in or out.'); }, { driver: p ? p.color : undefined, shop: shopFor('car') });
    }
  };

  // ---------- shop: what the Dress-Up and Car Garage screens need to lock, price and sell things ----------
  // Undefined when the server has no shop: the designers then leave everything free, as before.
  function shopFor(kind) {
    if (!shop || !shop.items || !meState) return undefined;
    return {
      kind: kind,
      items: shop.items,
      state: function () { // always the latest numbers
        var own = {}, list = (meState && meState.owned) || [], i;
        for (i = 0; i < list.length; i++) own[list[i]] = true;
        return { coins: meState ? meState.coins : 0, lv: meState ? meState.lv : 1, owned: own };
      },
      buy: buyItem
    };
  }
  function buyItem(id, cb) {
    var old = buyWait[id];
    if (old) { clearTimeout(old.timer); if (typeof old.cb === 'function') old.cb(false, 'unknown'); }
    var entry = { cb: cb, timer: 0 };
    entry.timer = setTimeout(function () { // no answer: the connection dropped, or the server is an older one
      if (buyWait[id] !== entry) return;
      delete buyWait[id];
      if (typeof cb === 'function') cb(false, 'unknown');
    }, 5000);
    buyWait[id] = entry;
    send({ t: 'buy', id: id });
  }
  function onBought(m) {
    var it = shop && shop.items ? shop.items[m.id] : null, w = buyWait[m.id];
    if (m.ok && meState && meState.owned.indexOf(m.id) < 0) { // the "me" update may arrive after this message
      meState.owned.push(m.id);
      if (it && it.cost) meState.coins = Math.max(0, meState.coins - it.cost);
      updateHud();
    }
    if (!w) return;
    delete buyWait[m.id]; clearTimeout(w.timer);
    if (typeof w.cb === 'function') w.cb(!!m.ok, m.ok ? undefined : (m.why || 'unknown'));
  }

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
        var sp = (p && p.drive ? (p.car && p.car.extra === 3 ? 500 : 430) : 265) * dt; // the rocket booster makes a car faster
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

  // ---------- render the town (the scenery itself is drawn by scene.js) ----------
  function render(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#4FA05A'; ctx.fillRect(0, 0, W, H);
    if (!joined || !world || room !== 'town') return;
    var scale = Math.max(H / 880, 0.7); if (W / scale < 700) scale = W / 700;
    var vw = W / scale, vh = H / scale;
    var cx = vw >= world.w ? (world.w - vw) / 2 : clamp(my.x - vw / 2, 0, world.w - vw);
    var cy = vh >= world.h ? (world.h - vh) / 2 : clamp(my.y - vh * 0.56, 0, world.h - vh);
    var c = ctx;
    c.setTransform(dpr * scale, 0, 0, dpr * scale, -cx * dpr * scale, -cy * dpr * scale);

    var view = { x: cx, y: cy, w: vw, h: vh }, st = { family: family, tag: tag.on }, i;
    Scene.setRes(dpr * scale);
    Scene.ground(c, world, view, t, st);

    // everything that can overlap, sorted from back to front
    var items = [];
    Scene.items(c, world, view, t, st, items);
    stars.forEach(function (s) { items.push({ y: s.y, d: function () { Scene.star(c, s, t); } }); });
    Object.keys(players).forEach(function (id) {
      var p = players[id];
      if (p.room !== 'town' || (p.id !== me && !p.placed)) return;
      items.push({ y: p.y, d: function () {
        var h = drawPlayer(c, p, p.x, p.y, t + p.id * 0.7), top = p.y - h - 8;
        top -= nameTag(c, p, p.x, top, p.id === me) + 4;
        if (tag.on && tag.it === p.id) top -= label(c, 'IT', p.x, top, '#FF4F6D', '#fff', 20) + 4;
        if (p.emote && p.emoteUntil > Date.now()) {
          c.font = '44px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText(p.emote, p.x, top - 4);
        }
      } });
    });
    Object.keys(GAMES).forEach(function (id) { // e.g. pets walking next to their owners
      if (typeof GAMES[id].town === 'function') { try { GAMES[id].town(c, t, view, items); } catch (e) {} }
    });
    items.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < items.length; i++) items[i].d();
    Scene.sky(c, world, view, t);
    for (i = pops.length - 1; i >= 0; i--) { // "+1" floats up from my player
      var age = (Date.now() - pops[i].t0) / 900;
      if (age >= 1) { pops.splice(i, 1); continue; }
      c.globalAlpha = 1 - age * age; c.font = '700 34px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
      c.lineWidth = 7; c.strokeStyle = NAVY; c.strokeText('+' + pops[i].n + ' ⭐', my.x, my.y - 150 - age * 70);
      c.fillStyle = '#FFD66B'; c.fillText('+' + pops[i].n + ' ⭐', my.x, my.y - 150 - age * 70); c.globalAlpha = 1;
    }

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
  $('exitStudio').onclick = function () { sfx('close'); room = 'town'; send({ t: 'room', room: 'town' }); $('studio').hidden = true; $('hud').hidden = false; };
  function enterStudio() {
    room = 'studio'; joy = null; send({ t: 'room', room: 'studio' });
    $('studio').hidden = false; $('hud').hidden = true;
    sClear(); fitPaper(); renderGuess();
  }
  // Pinyin gets its own span: the Fredoka font draws "ī" wrongly, so .py uses the device font.
  function pyHtml(w) { return '<span class="py">' + esc(w.py) + '</span>'; }
  function word3(w) { return '<b>' + esc(w.en) + '</b> · ' + esc(w.zh) + ' ' + pyHtml(w) + ' · ' + esc(w.ms); }
  function onGuess(m) {
    var was = g.phase, hadMe = g.guessed.indexOf(me) >= 0, hadGot = g.guessed.length, hadWrong = g.wrong.length;
    g.phase = m.phase; g.drawer = m.drawer; g.ends = Date.now() + m.left; g.guessed = m.guessed || [];
    g.word = m.word || null; g.options = m.options || []; g.wrong = m.wrong || [];
    if (g.phase === 'draw' && was === 'draw') {
      if (g.drawer === me ? g.guessed.length > hadGot : (!hadMe && g.guessed.indexOf(me) >= 0)) sfx('right'); // I got it, or someone got my drawing
      else if (g.wrong.length > hadWrong) sfx('wrong');
    }
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
  $('exitGallery').onclick = function () { sfx('close'); room = 'town'; $('gallery').hidden = true; $('hud').hidden = false; };

  // ---------- Quests: three a day, then the daily chest ----------
  // name of a quest or a shop item in the three languages, stacked (tri) or on one line (triLine)
  function tri(o) { return '<b>' + esc(o.en) + '</b><span>' + esc(o.zh) + ' <span class="py">' + esc(o.py) + '</span></span><span>' + esc(o.ms) + '</span>'; }
  function triLine(o) { return '<b>' + esc(o.en) + '</b> · ' + esc(o.zh) + ' <span class="py">' + esc(o.py) + '</span> · ' + esc(o.ms); }
  function bar(pct) { return '<span class="lvBar wide"><i style="width:' + pct + '%"></i></span>'; }
  function renderQuests() {
    if ($('quests').hidden) return;
    var st = meState, q = st && st.quests, list = $('qList'), ch = $('qChest'), lv = $('qLv');
    if (!st || !q || !q.list) { lv.innerHTML = ''; ch.hidden = true; list.innerHTML = '<p class="hint">Quests are not ready yet.</p>'; return; }
    lv.innerHTML = '<b>Level ' + st.lv + '</b>' + bar(lvPct(st)) +
      '<span>' + (st.lvNext === null || st.lvNext === undefined ? 'Top level!' : Math.max(0, st.lvNext - st.stars) + ' ⭐ to level ' + (st.lv + 1)) + '</span>';
    list.innerHTML = q.list.map(function (x, i) {
      var have = Math.min(x.have, x.n), pct = x.n > 0 ? Math.round(have * 100 / x.n) : 100, act;
      if (x.claimed) act = '<span class="qDone">✔ ⭐ ' + x.reward + '</span>';
      else if (x.done) act = '<button class="btn primary" type="button" data-quiet data-claim="' + i + '">Claim ⭐ ' + x.reward + '</button>';
      else act = '<span class="qRew">⭐ ' + x.reward + '</span>';
      return '<div class="qRow' + (x.claimed ? ' ok' : x.done ? ' ready' : '') + '"><span class="qIco">' + esc(x.icon || '⭐') + '</span>' +
        '<span class="qTxt">' + tri(x) + '</span>' +
        '<span class="qProg">' + bar(pct) + '<em>' + have + ' / ' + x.n + '</em></span><span class="qAct">' + act + '</span></div>';
    }).join('');
    var left = q.list.filter(function (x) { return !x.claimed; }).length, note, act;
    if (q.chest === 'ready') { note = 'All quests done. Open your chest!'; act = '<button class="btn primary" type="button" data-quiet data-chest="1">Open!</button>'; }
    else if (q.chest === 'opened') { note = 'Opened today. Come back tomorrow for a new one!'; act = '<span class="qDone">✔</span>'; }
    else { note = 'Finish and claim ' + left + ' more quest' + (left === 1 ? '' : 's') + ' to open it.'; act = '<span class="qRew">🔒</span>'; }
    ch.hidden = false;
    ch.className = 'qChest' + (q.chest === 'ready' ? ' ready' : '');
    ch.innerHTML = '<span class="qIco">🎁</span><span class="qTxt"><b>Daily chest</b><span>每日宝箱 <span class="py">měirì bǎoxiāng</span> · Peti harian</span><span class="qNote">' + note + '</span></span>' +
      (q.streak > 0 ? '<span class="qStreak">🔥 ' + q.streak + (q.streak === 1 ? ' day' : ' days') + '</span>' : '') + '<span class="qAct">' + act + '</span>';
  }
  function closeQuests() { if ($('quests').hidden) return; sfx('close'); $('quests').hidden = true; }
  $('questBtn').onclick = function () { sfx('open'); joy = null; $('emotes').hidden = true; $('quests').hidden = false; renderQuests(); };
  $('exitQuests').onclick = closeQuests;
  $('quests').addEventListener('click', function (e) {
    if (e.target === $('quests')) { closeQuests(); return; } // a tap beside the panel closes it
    var el = e.target, i, x, q = meState && meState.quests;
    while (el && el !== this) {
      if (el.tagName === 'BUTTON' && !el.disabled && q) {
        if (el.getAttribute('data-claim') !== null) {
          i = parseInt(el.getAttribute('data-claim'), 10); x = q.list ? q.list[i] : null;
          if (x && x.done && !x.claimed) { el.disabled = true; sfx('claim'); send({ t: 'claim', i: i }); }
          return;
        }
        if (el.getAttribute('data-chest') !== null) {
          if (q.chest === 'ready') { el.disabled = true; send({ t: 'chest' }); } // the chest sound plays when it opens
          return;
        }
      }
      el = el.parentNode;
    }
  });
  function onQuestDone(m) {
    var q = meState && meState.quests && meState.quests.list ? meState.quests.list[m.i] : null;
    sfx('quest');
    toast((q ? 'Quest done: ' + q.en + '! ' : 'Quest done! ') + 'Tap 📋 for your reward.');
  }

  // ---------- celebrations: level up, daily chest ----------
  // One small card in the middle of the screen. Only the card takes taps, so the town stays playable around it.
  // Waiting ones are merged or dropped, so they never pile up.
  var celebQ = [], celebNow = null, celebTimer = null;
  var CONF = ['#FF4F6D', '#FFC933', '#5AA9FF', '#7BD389', '#9B6BFF', '#FF8FB8', '#FF7A45'];
  var confP = [], confRaf = 0, confLast = 0, confAge = 0;
  function celebrate(o) {
    var i;
    if (o.kind === 'level') {
      for (i = 0; i < celebQ.length; i++) {
        if (celebQ[i].kind === 'level') { celebQ[i].lv = Math.max(celebQ[i].lv, o.lv); celebQ[i].items = celebQ[i].items.concat(o.items); return; }
      }
    }
    if (celebQ.length >= 3) return;
    celebQ.push(o);
    if (!celebNow) nextCeleb();
  }
  function itemOf(id) { return shop && shop.items && shop.items[id] ? shop.items[id] : null; }
  // the item on the default character or car, so the child sees what it is
  function drawItemPic(cv, id) {
    var q = String(id).split('.'), val = parseInt(q[2], 10), c, d;
    try {
      c = cv.getContext('2d'); c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, 160, 130);
      if (q[0] === 'outfit' && Dress) { d = Dress.defaults(); d[q[1]] = val; Dress.draw(c, 80, 124, d, { scale: 1.05, t: 0 }); }
      else if (q[0] === 'car' && Car) { d = Car.defaults(); d[q[1]] = val; Car.draw(c, 80, 112, d, { scale: 1, t: 0 }); }
    } catch (e) {}
  }
  function nextCeleb() {
    clearTimeout(celebTimer);
    celebNow = celebQ.shift() || null;
    var box = $('celeb'), card = $('celebCard'), o = celebNow, html, it, items;
    if (!o) { box.hidden = true; return; }
    if (o.kind === 'level') {
      items = o.items.filter(function (id, n) { return itemOf(id) && o.items.indexOf(id) === n; });
      html = '<span class="cBig">Level ' + o.lv + '!</span>' +
        '<span class="cSub">第 ' + o.lv + ' 级 <span class="py">dì ' + o.lv + ' jí</span> · Tahap ' + o.lv + '</span>';
      if (items.length) {
        html += '<span class="cNew">New in the shops:</span>';
        items.slice(0, 6).forEach(function (id) {
          it = itemOf(id);
          html += '<span class="cIt">' + (id.indexOf('car.') === 0 ? '🚗 ' : '👗 ') + triLine(it) + (it.cost ? ' <em>⭐ ' + it.cost + '</em>' : '') + '</span>';
        });
        if (items.length > 6) html += '<span class="cIt">and ' + (items.length - 6) + ' more</span>';
      }
    } else {
      it = o.item ? itemOf(o.item) : null;
      html = '<span class="cBig">🎁 +' + o.stars + ' ⭐</span>' +
        '<span class="cSub">Daily chest · 每日宝箱 <span class="py">měirì bǎoxiāng</span> · Peti harian</span>';
      if (o.item) {
        html += '<canvas id="celebPic" class="cPic" width="320" height="260" aria-hidden="true"></canvas>' +
          '<span class="cNew">' + (it && it.rare === 3 ? 'Legendary find!' : 'You found:') + '</span>' +
          '<span class="cIt">' + (it ? triLine(it) : 'A special item') + '</span>' +
          '<span class="cHint">' + (String(o.item).indexOf('car.') === 0 ? 'It is waiting in the Car Garage.' : 'It is waiting in Dress-Up.') + '</span>';
      }
      if (o.streak > 1) html += '<span class="cHint">🔥 ' + o.streak + ' days in a row!</span>';
    }
    card.innerHTML = html + '<span class="cHint">Tap to close</span>';
    box.hidden = false;
    if (o.kind === 'chest' && o.item && $('celebPic')) drawItemPic($('celebPic'), o.item);
    sfx(o.kind === 'level' ? 'levelup' : 'chest');
    confetti();
    celebTimer = setTimeout(nextCeleb, o.kind === 'level' ? 7000 : 9000); // goes away by itself too
  }
  $('celebCard').onclick = function () { nextCeleb(); };
  function confetti() {
    var cv = $('confetti'), w, h, i;
    if (!cv.getContext) return;
    w = cv.width = window.innerWidth; h = cv.height = window.innerHeight;
    confP = [];
    for (i = 0; i < 80; i++) {
      confP.push({ x: Math.random() * w, y: -20 - Math.random() * h * 0.7, vx: (Math.random() - 0.5) * 120, vy: 150 + Math.random() * 230,
        r: 5 + Math.random() * 6, a: Math.random() * 6.3, va: (Math.random() - 0.5) * 9, c: CONF[i % CONF.length] });
    }
    confAge = 0; confLast = 0;
    if (!confRaf) confRaf = requestAnimationFrame(confFrame);
  }
  function confFrame(ts) {
    var cv = $('confetti'), c = cv.getContext('2d'), dt = confLast ? Math.min(0.05, (ts - confLast) / 1000) : 0.016, alive = false, i, p;
    confLast = ts; confAge += dt;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    for (i = 0; i < confP.length; i++) {
      p = confP[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt;
      if (p.y > cv.height + 20) continue;
      alive = true;
      c.save(); c.translate(p.x, p.y); c.rotate(p.a); c.fillStyle = p.c; c.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r); c.restore();
    }
    if (alive && confAge < 6 && celebNow) confRaf = requestAnimationFrame(confFrame);
    else { confRaf = 0; confP = []; c.clearRect(0, 0, cv.width, cv.height); }
  }

  // ---------- game modules: what games/<id>.js files may use (docs/GAME-MODULES.md) ----------
  function gameEvent(name) {
    Object.keys(GAMES).forEach(function (id) {
      if (typeof GAMES[id][name] === 'function') { try { GAMES[id][name](); } catch (e) { if (window.console) console.error(e); } }
    });
  }
  // A drag-anywhere joystick on `el`; arrow keys and WASD count too. read() gives { x, y } between -1 and 1.
  function makeStick(el) {
    var st = { on: false, ox: 0, oy: 0, dx: 0, dy: 0, id: null };
    function down(e) { if (st.id !== null) return; st.id = e.pointerId; st.on = true; st.ox = e.clientX; st.oy = e.clientY; st.dx = st.dy = 0; try { el.setPointerCapture(e.pointerId); } catch (err) {} }
    function move(e) {
      if (e.pointerId !== st.id) return;
      var dx = (e.clientX - st.ox) / 60, dy = (e.clientY - st.oy) / 60, l = Math.sqrt(dx * dx + dy * dy);
      if (l > 1) { dx /= l; dy /= l; }
      st.dx = dx; st.dy = dy;
    }
    function up(e) { if (e.pointerId !== st.id) return; st.id = null; st.on = false; st.dx = st.dy = 0; }
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    st.read = function () {
      if (st.on) return { x: st.dx, y: st.dy };
      var x = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0), y = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0), l = Math.sqrt(x * x + y * y);
      return l > 1 ? { x: x / l, y: y / l } : { x: x, y: y };
    };
    // draws the stick; `c` must be in CSS pixels of the page (no camera transform) with (0,0) at the element's top-left
    st.draw = function (c) {
      if (!st.on) return;
      var r = el.getBoundingClientRect(), x = st.ox - r.left, y = st.oy - r.top;
      c.fillStyle = 'rgba(255,255,255,0.45)'; c.strokeStyle = NAVY; c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, 62, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#FFD66B'; c.beginPath(); c.arc(x + st.dx * 50, y + st.dy * 50, 28, 0, 7); c.fill(); c.stroke();
    };
    st.destroy = function () { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    return st;
  }
  var api = {
    send: send, toast: toast, sfx: sfx, esc: esc, clamp: clamp, FONT: FONT, NAVY: NAVY,
    myId: function () { return me; },
    me: function () { return meState; },            // my own numbers: { stars, coins, lv, owned, quests } or null
    self: mine,                                     // my entry in players()
    players: function () { return players; },       // id -> { id, name, color, hat, big, lv, room, outfit, car, ext }
    world: function () { return world; },
    room: function () { return room; },
    // go into the game's own room (hides the town and its buttons) and back out to the town
    enter: function (id) { room = id; joy = null; keys = {}; $('emotes').hidden = true; send({ t: 'room', room: id }); $('hud').hidden = true; },
    leave: function () { if (room === 'town') return; room = 'town'; keys = {}; send({ t: 'room', room: 'town' }); $('hud').hidden = false; },
    // a name in three languages, pinyin in the device font: three({ en, zh, py, ms })
    three: function (o) { return '<b>' + esc(o.en) + '</b> · ' + esc(o.zh) + ' <span class="py">' + esc(o.py) + '</span> · ' + esc(o.ms); },
    // draws a player the way they look in town, feet at (x, y); o = { scale, facing: 1|-1, moving, car: true to draw their car }
    // returns the height drawn, for placing a name tag
    drawAvatar: function (c, p, x, y, t, o) {
      o = o || {};
      var s = o.scale > 0 ? o.scale : 1, f = o.facing < 0 ? -1 : 1, mv = !!o.moving, sc;
      if (o.car && Car) { Car.draw(c, x, y, p.car || Car.defaults(), { facing: f, t: t, moving: mv, driver: p.color, scale: s }); return 92 * s; }
      if (p.outfit && Dress) { sc = (p.big ? 1.22 : 1) * s; Dress.draw(c, x, y, p.outfit, { facing: f, t: t, moving: mv, scale: sc }); return 104 * sc; }
      drawBlock(c, x, y, { color: p.color, hat: p.hat, big: p.big, f: f, m: mv ? 1 : 0 }, t, s);
      return ((p.big ? 84 : 56) + (p.hat ? 34 : 12)) * s;
    },
    nameTag: nameTag,                               // nameTag(c, player, x, y, isMe): the pill above a player, returns its height
    label: label, rr: rr, starPath: starPath,
    stick: makeStick,
    keys: function () { return keys; }              // keys held down right now, lower case: { arrowleft: true, ' ': true }
  };
  Object.keys(GAMES).forEach(function (id) {
    try { if (typeof GAMES[id].init === 'function') GAMES[id].init(api); }
    catch (e) { if (window.console) console.error('Game "' + id + '" did not start:', e); delete GAMES[id]; }
  });

  resize(); sClear();
  requestAnimationFrame(frame);
})();
