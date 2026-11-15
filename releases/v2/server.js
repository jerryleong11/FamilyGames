// Family Town game server. Serves the game pages and keeps all players in sync.
// Run through tools/run.js (start-live / start-dev), or directly: node server.js
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocketServer = require('ws').WebSocketServer;
const WORDS = require('./words');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUB = path.join(__dirname, 'public');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const GAL = path.join(DATA, 'gallery');
const SAVE_FILE = path.join(DATA, 'save.json');
let VERSION = 'dev';
try { VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf8')).version || 'dev'; } catch (e) {}
fs.mkdirSync(GAL, { recursive: true });

// ---------- saved data (lives on the laptop, not on the tablets) ----------
let save = { profiles: {}, family: 0, gallery: [] };
try { save = Object.assign(save, JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'))); } catch (e) {}
let saveTimer = null;
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(function () {
    saveTimer = null;
    try {
      fs.writeFileSync(SAVE_FILE + '.tmp', JSON.stringify(save, null, 1));
      fs.renameSync(SAVE_FILE + '.tmp', SAVE_FILE);
    } catch (e) { console.error('Could not save:', e.message); }
  }, 800);
}

// ---------- the town ----------
const WORLD = {
  w: 2400, h: 1600, spawn: { x: 1200, y: 880 },
  buildings: [
    { id: 'studio', name: 'Art Studio', x: 300, y: 220, w: 360, h: 250, open: true, wall: '#FF8FB8', roof: '#E0447F' },
    { id: 'gallery', name: 'Gallery', x: 1020, y: 180, w: 360, h: 250, open: true, wall: '#FFD66B', roof: '#F08A24' },
    { id: 'dress', name: 'Dress-Up', x: 700, y: 560, w: 300, h: 250, open: true, wall: '#F7B8E0', roof: '#B04AA0' },
    { id: 'cars', name: 'Car Garage', x: 1400, y: 560, w: 300, h: 250, open: true, wall: '#FFB07A', roof: '#D0461F' },
    { id: 'pets', name: 'Pet Home', x: 300, y: 1090, w: 360, h: 250, open: false, wall: '#8FE3C8', roof: '#2F9E83' },
    { id: 'monopoly', name: 'Monopoly', x: 1020, y: 1190, w: 360, h: 250, open: false, wall: '#B9A6FF', roof: '#6C4BD8' },
    { id: 'escape', name: 'Escape Room', x: 1740, y: 1090, w: 360, h: 250, open: false, wall: '#9CCBFF', roof: '#2F6FCC' }
  ],
  playground: { x: 1680, y: 200, w: 480, h: 340 },
  goals: [25, 60, 120, 200]
};
const MAX_PLAYERS = 8;
const STAR_COUNT = 9;

const players = new Map(); // id -> player
let nextId = 1;
let stars = [];
let nextStar = 1;

function rnd(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function inRect(x, y, r, pad) { return x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad; }
function freeSpot() {
  for (let n = 0; n < 60; n++) {
    const x = rnd(100, WORLD.w - 100), y = rnd(140, WORLD.h - 100);
    if (!WORLD.buildings.some(function (b) { return inRect(x, y, b, 70); })) return { x: Math.round(x), y: Math.round(y) };
  }
  return { x: WORLD.spawn.x, y: WORLD.spawn.y };
}
function addStar() { const s = freeSpot(); s.id = nextStar++; stars.push(s); }
for (let i = 0; i < STAR_COUNT; i++) addStar();

function send(p, obj) { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(obj)); }
function broadcast(obj, filter) {
  const s = JSON.stringify(obj);
  players.forEach(function (p) { if (p.ws.readyState === 1 && (!filter || filter(p))) p.ws.send(s); });
}
function inRoom(room) { return function (p) { return p.room === room; }; }
function roomList(room) { return Array.from(players.values()).filter(inRoom(room)).sort(function (a, b) { return a.id - b.id; }); }
function pub(p) { return { id: p.id, name: p.name, color: p.color, hat: p.hat, big: p.big, stars: p.stars, room: p.room, outfit: p.outfit, car: p.car, drive: p.drive }; }
// A design (outfit or car) is a small flat object of numbers and colours made by the designer screens.
function cleanDesign(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const out = {}, keys = Object.keys(d).slice(0, 16);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i], v = d[k];
    if (!/^[a-zA-Z0-9_]{1,16}$/.test(k)) continue;
    if (typeof v === 'number' && isFinite(v)) out[k] = clamp(Math.round(v), 0, 99);
    else if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}
function sendPlayers() { broadcast({ t: 'players', list: Array.from(players.values()).map(pub), family: save.family }); }
function toast(msg, filter) { broadcast({ t: 'toast', msg: msg }, filter); }

function addStars(p, n) {
  const before = save.family;
  p.stars += n;
  save.family += n;
  const prof = save.profiles[p.key];
  if (prof) prof.stars = p.stars;
  WORLD.goals.forEach(function (g) {
    if (before < g && save.family >= g) toast('Family goal reached: ' + g + ' stars! Something new appeared in town.');
  });
  saveSoon();
  sendPlayers();
}

// ---------- Art Studio: shared drawing + guessing game ----------
let strokes = [];
const guess = { phase: 'idle', drawer: 0, word: null, options: [], ends: 0, guessed: {}, wrong: {}, timer: null, last: 0 };
const ROUND_MS = 75000, REVEAL_MS = 7000;

function guessMsg(p) {
  const m = { t: 'guess', phase: guess.phase, drawer: guess.drawer, left: Math.max(0, guess.ends - Date.now()), guessed: Object.keys(guess.guessed).map(Number) };
  if (guess.phase === 'draw') {
    if (p.id === guess.drawer) m.word = guess.word;
    else { m.options = guess.options; m.wrong = guess.wrong[p.id] || []; }
  }
  if (guess.phase === 'reveal') m.word = guess.word;
  return m;
}
function sendGuess() { roomList('studio').forEach(function (p) { send(p, guessMsg(p)); }); }
function clearCanvas() { strokes = []; broadcast({ t: 'clear' }, inRoom('studio')); }
function stopGuess() {
  clearTimeout(guess.timer);
  guess.phase = 'idle'; guess.drawer = 0; guess.word = null; guess.options = [];
  sendGuess();
}
function startRound() {
  clearTimeout(guess.timer);
  const list = roomList('studio');
  if (list.length < 2) { stopGuess(); return; }
  const next = list.find(function (p) { return p.id > guess.last; }) || list[0];
  guess.last = next.id;
  guess.drawer = next.id;
  const pool = WORDS.slice().sort(function () { return Math.random() - 0.5; });
  guess.word = pool[0];
  guess.options = pool.slice(0, 4).sort(function () { return Math.random() - 0.5; });
  guess.guessed = {}; guess.wrong = {};
  guess.phase = 'draw';
  guess.ends = Date.now() + ROUND_MS;
  clearCanvas();
  sendGuess();
  guess.timer = setTimeout(endRound, ROUND_MS);
}
function endRound() {
  clearTimeout(guess.timer);
  if (guess.phase !== 'draw') return;
  guess.phase = 'reveal';
  guess.ends = Date.now() + REVEAL_MS;
  sendGuess();
  guess.timer = setTimeout(startRound, REVEAL_MS);
}
function studioChanged() {
  if (guess.phase === 'idle') return;
  const list = roomList('studio');
  if (list.length < 2) { stopGuess(); toast('The guessing game needs 2 players.', inRoom('studio')); return; }
  if (guess.phase === 'draw') {
    if (!list.some(function (p) { return p.id === guess.drawer; })) { endRound(); return; }
    if (list.every(function (p) { return p.id === guess.drawer || guess.guessed[p.id]; })) { endRound(); return; }
  }
  sendGuess();
}

// ---------- Tag in the playground ----------
const tag = { on: false, it: 0, ends: 0, cool: 0 };
const TAG_MS = 90000;
function tagMsg() { return { t: 'tag', on: tag.on, it: tag.it, left: Math.max(0, tag.ends - Date.now()) }; }
function stopTag(reward) {
  if (!tag.on) return;
  tag.on = false;
  if (reward) {
    roomList('town').forEach(function (p) { if (p.id !== tag.it) addStars(p, 3); });
    toast('Tag is over! Everyone who is not "it" gets 3 stars.');
  }
  broadcast(tagMsg());
}
function tickTag(now) {
  if (!tag.on) return;
  const town = roomList('town');
  if (town.length < 2) { stopTag(false); return; }
  let it = players.get(tag.it);
  if (!it || it.room !== 'town') { it = town[0]; tag.it = it.id; broadcast(tagMsg()); }
  if (now >= tag.ends) { stopTag(true); return; }
  if (now < tag.cool) return;
  for (let i = 0; i < town.length; i++) {
    const o = town[i];
    if (o.id === it.id) continue;
    const dx = o.x - it.x, dy = o.y - it.y;
    if (dx * dx + dy * dy < 62 * 62) {
      tag.it = o.id; tag.cool = now + 1800;
      broadcast(tagMsg());
      toast(o.name + ' is "it" now!');
      break;
    }
  }
}

// ---------- messages from players ----------
function cleanName(s) { return String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12); }
function onJoin(ws, m) {
  const name = cleanName(m.name);
  if (!name) return ws.send(JSON.stringify({ t: 'err', msg: 'Please type a name.' }));
  const key = name.toLowerCase();
  if (players.size >= MAX_PLAYERS) return ws.send(JSON.stringify({ t: 'err', msg: 'The town is full.' }));
  if (Array.from(players.values()).some(function (p) { return p.key === key; })) return ws.send(JSON.stringify({ t: 'err', msg: 'Someone is already playing as ' + name + '.' }));
  let prof = save.profiles[key];
  if (!prof) prof = save.profiles[key] = { name: name, stars: 0 };
  prof.name = name;
  prof.color = /^#[0-9a-fA-F]{6}$/.test(m.color) ? m.color : '#FF7A45';
  prof.hat = clamp(parseInt(m.hat, 10) || 0, 0, 3);
  prof.big = !!m.big;
  saveSoon();
  const spot = { x: WORLD.spawn.x + rnd(-90, 90), y: WORLD.spawn.y + rnd(-50, 50) };
  const p = { id: nextId++, ws: ws, key: key, name: name, color: prof.color, hat: prof.hat, big: prof.big, stars: prof.stars || 0, outfit: cleanDesign(prof.outfit), car: cleanDesign(prof.car), drive: false, x: spot.x, y: spot.y, f: 1, m: 0, room: 'town', alive: true };
  ws.player = p;
  players.set(p.id, p);
  send(p, { t: 'welcome', id: p.id, version: VERSION, world: WORLD, x: p.x, y: p.y, stars: stars });
  send(p, tagMsg());
  sendPlayers();
  toast(name + ' joined the town!', function (o) { return o.id !== p.id; });
  console.log(name + ' joined (' + players.size + ' online)');
}
function onMessage(ws, m) {
  const p = ws.player;
  if (!p) { if (m.t === 'join') onJoin(ws, m); return; }
  switch (m.t) {
    case 'move':
      if (p.room !== 'town') return;
      p.x = clamp(+m.x || 0, 30, WORLD.w - 30); p.y = clamp(+m.y || 0, 60, WORLD.h - 20);
      p.f = m.f < 0 ? -1 : 1; p.m = m.m ? 1 : 0;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i], dx = s.x - p.x, dy = s.y - (p.y - 24);
        if (dx * dx + dy * dy < 54 * 54) {
          stars.splice(i, 1);
          broadcast({ t: 'stars', list: stars });
          send(p, { t: 'card', word: WORDS[Math.floor(Math.random() * WORDS.length)] });
          addStars(p, 1);
          setTimeout(function () { if (stars.length < STAR_COUNT) { addStar(); broadcast({ t: 'stars', list: stars }); } }, 4000);
          break;
        }
      }
      break;
    case 'room':
      if (m.room !== 'town' && m.room !== 'studio') return;
      if (p.room === m.room) return;
      p.room = m.room; p.m = 0;
      if (m.room === 'studio') { send(p, { t: 'strokes', list: strokes }); send(p, guessMsg(p)); }
      sendPlayers();
      studioChanged();
      break;
    case 'look': // saved from the Dress-Up Boutique or the Car Garage
      {
        const prof = save.profiles[p.key];
        if (m.outfit !== undefined) { p.outfit = cleanDesign(m.outfit); if (prof) prof.outfit = p.outfit; }
        if (m.car !== undefined) { p.car = cleanDesign(m.car); if (prof) prof.car = p.car; if (!p.car) p.drive = false; }
        saveSoon();
        sendPlayers();
      }
      break;
    case 'drive':
      p.drive = !!m.on && !!p.car && !tag.on;
      sendPlayers();
      break;
    case 'emote':
      broadcast({ t: 'emote', id: p.id, e: clamp(parseInt(m.e, 10) || 0, 0, 5) });
      break;
    case 'draw':
      if (p.room !== 'studio' || !Array.isArray(m.pts) || m.pts.length < 2 || m.pts.length > 400) return;
      if (guess.phase === 'reveal' || (guess.phase === 'draw' && p.id !== guess.drawer)) return;
      {
        const st = { c: /^#[0-9a-fA-F]{6}$/.test(m.c) ? m.c : '#1B2A49', w: clamp(+m.w || 6, 2, 60), pts: m.pts.map(function (v) { return Math.round(+v || 0); }) };
        strokes.push(st);
        if (strokes.length > 6000) strokes.splice(0, 1000);
        broadcast({ t: 'draw', c: st.c, w: st.w, pts: st.pts }, function (o) { return o.room === 'studio' && o.id !== p.id; });
      }
      break;
    case 'clear':
      if (p.room !== 'studio') return;
      if (guess.phase === 'reveal' || (guess.phase === 'draw' && p.id !== guess.drawer)) return;
      clearCanvas();
      break;
    case 'guessStart':
      if (p.room !== 'studio' || guess.phase !== 'idle') return;
      if (roomList('studio').length < 2) { send(p, { t: 'toast', msg: 'The guessing game needs 2 players in the studio.' }); return; }
      startRound();
      break;
    case 'guessStop':
      if (p.room === 'studio' && guess.phase !== 'idle') stopGuess();
      break;
    case 'guessTry':
      if (p.room !== 'studio' || guess.phase !== 'draw' || p.id === guess.drawer || guess.guessed[p.id]) return;
      {
        const opt = guess.options[parseInt(m.i, 10)];
        if (!opt) return;
        if (opt.i === guess.word.i) {
          guess.guessed[p.id] = true;
          addStars(p, (guess.wrong[p.id] || []).length ? 1 : 2);
          const d = players.get(guess.drawer);
          if (d) addStars(d, 1);
          studioChanged();
        } else {
          (guess.wrong[p.id] = guess.wrong[p.id] || []).push(parseInt(m.i, 10));
          send(p, guessMsg(p));
        }
      }
      break;
    case 'tagStart':
      if (p.room !== 'town' || tag.on) return;
      if (roomList('town').length < 2) { send(p, { t: 'toast', msg: 'Tag needs 2 players in town.' }); return; }
      tag.on = true; tag.it = p.id; tag.ends = Date.now() + TAG_MS; tag.cool = Date.now() + 3000;
      players.forEach(function (o) { o.drive = false; }); // tag is on foot, so it stays fair
      sendPlayers();
      broadcast(tagMsg());
      toast('Tag! ' + p.name + ' is "it". Run!');
      break;
  }
}
function onLeave(ws) {
  const p = ws.player;
  if (!p || !players.has(p.id)) return;
  players.delete(p.id);
  sendPlayers();
  studioChanged();
  toast(p.name + ' left the town.');
  console.log(p.name + ' left (' + players.size + ' online)');
}

// ---------- web server ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
function sendFile(res, file) {
  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}
const server = http.createServer(function (req, res) {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ version: VERSION, players: players.size, names: Array.from(players.values()).map(function (p) { return p.name; }) }));
    return;
  }
  if (url === '/api/gallery' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(save.gallery.slice().reverse()));
    return;
  }
  if (url === '/api/gallery' && req.method === 'POST') {
    let body = '', tooBig = false;
    req.on('data', function (c) { body += c; if (body.length > 3e6) { tooBig = true; req.destroy(); } });
    req.on('end', function () {
      if (tooBig) return;
      try {
        const j = JSON.parse(body), pre = 'data:image/png;base64,';
        if (String(j.img).indexOf(pre) !== 0) throw new Error('bad image');
        const file = Date.now() + '.png';
        fs.writeFileSync(path.join(GAL, file), Buffer.from(j.img.slice(pre.length), 'base64'));
        save.gallery.push({ file: file, name: cleanName(j.name) || 'Someone', ts: Date.now() });
        while (save.gallery.length > 40) save.gallery.shift(); // older files stay on disk, just leave the wall
        saveSoon();
        toast((cleanName(j.name) || 'Someone') + ' hung a new picture in the Gallery!');
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
      } catch (e) { res.writeHead(400); res.end('{"ok":false}'); }
    });
    return;
  }
  if (url.indexOf('/gallery/') === 0) { sendFile(res, path.join(GAL, path.basename(url))); return; }
  const rel = path.normalize(url === '/' ? '/index.html' : url);
  const file = path.join(PUB, rel);
  if (file.indexOf(PUB) !== 0) { res.writeHead(403); res.end(); return; }
  sendFile(res, file);
});

const wss = new WebSocketServer({ server: server, maxPayload: 256 * 1024 });
wss.on('connection', function (ws) {
  ws.alive = true;
  ws.on('pong', function () { ws.alive = true; });
  ws.on('message', function (data) {
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (m && typeof m === 'object') { try { onMessage(ws, m); } catch (e) { console.error(e); } }
  });
  ws.on('close', function () { onLeave(ws); });
  ws.on('error', function () {});
});

// positions go out 12 times a second
setInterval(function () {
  const now = Date.now();
  tickTag(now);
  if (!players.size) return;
  const list = [];
  players.forEach(function (p) { if (p.room === 'town') list.push([p.id, Math.round(p.x), Math.round(p.y), p.f, p.m]); });
  broadcast({ t: 'state', p: list }, inRoom('town'));
}, 80);
setInterval(function () {
  wss.clients.forEach(function (ws) { if (!ws.alive) { ws.terminate(); return; } ws.alive = false; try { ws.ping(); } catch (e) {} });
}, 15000);

server.listen(PORT, '0.0.0.0', function () {
  console.log('');
  console.log('  Family Town  [' + VERSION + ']  is running.');
  console.log('  On this laptop:   http://localhost:' + PORT);
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (k) {
    nets[k].forEach(function (n) {
      if ((n.family === 'IPv4' || n.family === 4) && !n.internal) console.log('  On the tablets:   http://' + n.address + ':' + PORT);
    });
  });
  console.log('  Saved data:       ' + DATA);
  console.log('  Keep this window open while playing. Close it to stop the game.');
  console.log('');
});
