// Town map: a small map on the town screen and a big one when it is tapped. Both show where everybody is,
// which way they are walking and which building they are in. Tapping a place or a person on the big map
// puts a guide arrow next to your player that points the way there.
// Plugs into game.js like a game module (window.FTGames.map) but has no building, room or server part.
(function () {
  'use strict';
  var TAU = Math.PI * 2;
  var ICON = { studio: '🎨', gallery: '🖼️', dress: '👗', cars: '🚗', pets: '🐾', monopoly: '🎲', escape: '🗝️', race: '🏁', obby: '🧗', boss: '👾', plot: '🏡' };
  var api = null, mini = null, root = null, big = null, listEl = null, bigTimer = 0;
  var target = null;   // { kind: 'b', id } a building, or { kind: 'p', key } a player (by name, which survives a reconnect)
  var tracks = {};     // player id -> { x, y, t, a } to work out which way somebody is walking
  var hits = [];       // what can be tapped on the big map: { x, y, r, target, name } in canvas pixels

  var CSS = '' +
    '.map-mini{position:absolute;left:14px;top:76px;width:176px;height:84px;padding:0;border:3px solid #1B2A49;border-radius:16px;background:#8ADB96;overflow:hidden;display:block}' +
    '.map-mini canvas{display:block;width:100%;height:100%}' +
    '.map-mini:active{transform:scale(.97)}' +
    '.map-ov{background:#FFF3D6;display:flex;flex-direction:column;gap:10px;padding:12px}' +
    '.map-head{flex:none;display:flex;align-items:center;gap:12px}' +
    '.map-head h2{font-size:28px;line-height:1.1}' +
    '.map-head .tri{font-size:16px;font-weight:600}' +
    '.map-head .btn{flex:none}' +
    '.map-body{flex:1;min-height:0;display:flex;gap:12px}' +
    '.map-stage{flex:1;min-width:0;position:relative;border:4px solid #1B2A49;border-radius:22px;background:#4FA05A;overflow:hidden}' +
    '.map-stage canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none}' +
    '.map-side{flex:none;width:270px;display:flex;flex-direction:column;gap:8px;overflow-y:auto;touch-action:pan-y}' +
    '.map-row{display:flex;align-items:center;gap:10px;min-height:60px;padding:6px 12px;border:3px solid #1B2A49;border-radius:18px;background:#fff;text-align:left;font-size:17px;font-weight:600;line-height:1.2;width:100%}' +
    '.map-row.me{background:#FFD66B}' +
    '.map-row.on{box-shadow:0 0 0 4px #FF4F6D}' +
    '.map-row i{flex:none;width:26px;height:26px;border-radius:9px;border:3px solid #1B2A49}' +
    '.map-row b{display:block;font-size:19px}' +
    '.map-row span span{font-weight:500}' +
    '.map-row em{font-style:normal;margin-left:auto;font-size:22px}' +
    '.map-hint{font-size:16px;font-weight:500;line-height:1.3}' +
    '@media (max-width:760px),(max-height:520px){.map-mini{top:64px;width:146px;height:70px}.map-ov{padding:8px;gap:6px}.map-head h2{font-size:22px}.map-side{width:200px}.map-row{min-height:52px;font-size:15px;padding:4px 10px}.map-row b{font-size:17px}}' +
    '@media (orientation:portrait) and (max-width:700px){.map-body{flex-direction:column}.map-side{width:auto;max-height:38%}}';

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function door(b) { return { x: b.x + b.w / 2, y: b.y + b.h + 34 }; }
  function building(id) {
    var w = api.world(), i;
    if (w) for (i = 0; i < w.buildings.length; i++) if (w.buildings[i].id === id) return w.buildings[i];
    return null;
  }
  function byKey(key) {
    var ps = api.players(), id;
    for (id in ps) if (String(ps[id].name).toLowerCase() === key) return ps[id];
    return null;
  }
  // which part of town a spot is in, in words
  function area(x, y) {
    var w = api.world(), g = w.playground, best = null, bd = 1e12;
    if (x > g.x - 20 && x < g.x + g.w + 20 && y > g.y - 20 && y < g.y + g.h + 30) return 'Playground';
    if ((x - w.spawn.x) * (x - w.spawn.x) + (y - w.spawn.y) * (y - w.spawn.y) < 230 * 230) return 'Town square';
    w.buildings.forEach(function (b) {
      var d = door(b), q = (d.x - x) * (d.x - x) + (d.y - 60 - y) * (d.y - 60 - y);
      if (q < bd) { bd = q; best = b; }
    });
    return best ? 'near ' + best.name : 'in town';
  }
  // where a player is shown: their own spot in town, or the door of the building they are inside
  function where(p) {
    var b = p.room !== 'town' ? building(p.room) : null, d;
    if (b) { d = door(b); return { x: d.x, y: d.y - 20, text: 'in ' + b.name, icon: ICON[b.id] || '🚪', inside: b }; }
    return { x: p.x, y: p.y, text: area(p.x, p.y), icon: '', inside: null };
  }
  // which way everybody is walking, from how their spot changed since the last look
  function track() {
    var ps = api.players(), now = Date.now(), id, p, k, dx, dy;
    for (id in ps) {
      p = ps[id]; k = tracks[id];
      if (!k) { tracks[id] = { x: p.x, y: p.y, t: now, a: null, at: 0 }; continue; }
      if (now - k.t < 280) continue;
      dx = p.x - k.x; dy = p.y - k.y;
      if (p.room === 'town' && dx * dx + dy * dy > 14 * 14) { k.a = Math.atan2(dy, dx); k.at = now; }
      else if (now - k.at > 900) k.a = null;
      k.x = p.x; k.y = p.y; k.t = now;
    }
    for (id in tracks) if (!ps[id]) delete tracks[id];
  }
  function targetSpot() { // where the guide arrow leads: { x, y, name, icon } or null when the target is gone
    var b, p, wh;
    if (!target) return null;
    if (target.kind === 'b') { b = building(target.id); if (!b) return null; wh = door(b); return { x: wh.x, y: wh.y, name: b.name, icon: ICON[b.id] || '' }; }
    p = byKey(target.key);
    if (!p) return null;
    wh = where(p);
    return { x: wh.x, y: wh.y, name: p.name, icon: wh.icon, color: p.color };
  }
  function setTarget(t, name) {
    target = t;
    api.sfx(t ? 'open' : 'close');
    if (t) api.toast('Follow the yellow arrow to ' + name + '!');
  }

  // ---------- drawing the map (the same picture small and big) ----------
  function paint(c, W, H, isBig) {
    var w = api.world(), ps = api.players(), meId = api.myId();
    if (!w) return;
    var s = Math.min(W / w.w, H / w.h), ox = (W - w.w * s) / 2, oy = (H - w.h * s) / 2, u = 1 / s; // u: world units in one pixel
    var sp = w.spawn, g = w.playground, id, p, list = [], inside = {}, tp;
    function X(x) { return ox + x * s; } function Y(y) { return oy + y * s; }
    hits = [];
    c.clearRect(0, 0, W, H);
    c.save(); c.translate(ox, oy); c.scale(s, s);
    c.lineJoin = 'round'; c.lineCap = 'round';
    api.rr(c, 0, 0, w.w, w.h, 60); c.fillStyle = '#8ADB96'; c.fill();
    // paths, like in the town
    c.strokeStyle = '#EBD9A4'; c.lineWidth = Math.max(70, 3.2 * u);
    w.buildings.forEach(function (b) {
      var d = door(b);
      c.beginPath(); c.moveTo(sp.x, sp.y);
      if (b.y > sp.y) { c.lineTo(b.x - 64, sp.y); c.lineTo(b.x - 64, d.y + 2); c.lineTo(d.x + 46, d.y + 2); }
      else { c.lineTo(d.x, sp.y); c.lineTo(d.x, d.y - 14); }
      c.stroke();
    });
    c.beginPath(); c.moveTo(sp.x, sp.y); c.lineTo(g.x + g.w / 2, sp.y); c.lineTo(g.x + g.w / 2, g.y + g.h); c.stroke();
    c.beginPath(); c.arc(sp.x, sp.y, 166, 0, TAU); c.fillStyle = '#EBD9A4'; c.fill();
    api.rr(c, g.x, g.y, g.w, g.h, 40); c.fillStyle = '#F6E2A8'; c.fill(); c.lineWidth = 2.5 * u; c.strokeStyle = '#C99556'; c.stroke();
    // buildings: a wall and a roof in their own colours
    w.buildings.forEach(function (b) {
      var open = !!b.open;
      c.lineWidth = (isBig ? 3 : 1.6) * u; c.strokeStyle = api.NAVY;
      api.rr(c, b.x, b.y + 80, b.w, b.h - 80, 22); c.fillStyle = open ? b.wall : '#D6D1C4'; c.fill(); c.stroke();
      api.rr(c, b.x - 18, b.y + 6, b.w + 36, 110, 30); c.fillStyle = open ? b.roof : '#9A968C'; c.fill(); c.stroke();
    });
    c.restore();

    if (isBig) { // names and icons, drawn in pixels so they stay readable
      var fs = Math.max(11, Math.min(15, 62 * s)), placed = [];
      c.textAlign = 'center'; c.textBaseline = 'middle';
      w.buildings.slice().sort(function (a, b) { return a.x - b.x; }).forEach(function (b) {
        var cx = X(b.x + b.w / 2), cy = Y(b.y + b.h / 2 + 30), on = target && target.kind === 'b' && target.id === b.id, tw, y, clash;
        c.font = Math.round(Math.max(18, 120 * s)) + 'px ' + api.FONT; c.fillText(ICON[b.id] || '', cx, cy);
        // the name goes under the building, or above it when a neighbour's name is already in the way
        c.font = '600 ' + fs + 'px ' + api.FONT; tw = c.measureText(b.name).width + 18;
        y = Y(b.y + b.h) + fs + 13;
        clash = placed.some(function (q) { return Math.abs(q.x - cx) < (q.w + tw) / 2 + 2 && Math.abs(q.y - y) < fs + 12; });
        if (clash) y = Y(b.y) - 3;
        placed.push({ x: cx, y: y, w: tw });
        api.label(c, b.name, cx, y, on ? '#FFD66B' : '#fff', api.NAVY, fs);
        hits.push({ x: cx, y: Y(b.y + b.h / 2), r: Math.max(34, b.w * s * 0.6), target: { kind: 'b', id: b.id }, name: b.name });
      });
      api.label(c, 'Playground', X(g.x + g.w / 2), Y(g.y + g.h / 2) + 10, '#fff', api.NAVY, fs);
    }

    // the line to where the guide arrow leads
    tp = targetSpot(); p = api.self();
    if (tp && p && p.room === 'town') {
      c.setLineDash(isBig ? [10, 8] : [5, 4]); c.lineWidth = isBig ? 4 : 2; c.strokeStyle = '#FF4F6D';
      c.beginPath(); c.moveTo(X(p.x), Y(p.y)); c.lineTo(X(tp.x), Y(tp.y)); c.stroke(); c.setLineDash([]);
    }

    // players: people inside the same building fan out around its door; me on top
    for (id in ps) list.push(ps[id]);
    list.sort(function (a, b) { return (a.id === meId ? 1 : 0) - (b.id === meId ? 1 : 0) || a.id - b.id; });
    list.forEach(function (q) {
      var wh = where(q), x = X(wh.x), y = Y(wh.y), me = q.id === meId, r = isBig ? (me ? 15 : 12) : (me ? 6.5 : 5), k = tracks[q.id], n;
      if (wh.inside) { n = inside[wh.inside.id] = (inside[wh.inside.id] || 0) + 1; x += (n - 1) * (r * 2 + 3) * (n % 2 ? 1 : -1) * 0.5 + (n > 1 ? (n % 2 ? r : -r) : 0); }
      if (k && k.a !== null && !wh.inside) { // which way they are walking
        c.save(); c.translate(x, y); c.rotate(k.a);
        c.beginPath(); c.moveTo(r + (isBig ? 13 : 7), 0); c.lineTo(r + 2, -(isBig ? 8 : 4)); c.lineTo(r + 2, isBig ? 8 : 4); c.closePath();
        c.fillStyle = q.color; c.fill(); c.lineWidth = isBig ? 2.5 : 1.5; c.strokeStyle = api.NAVY; c.stroke();
        c.restore();
      }
      if (me) { c.beginPath(); c.arc(x, y, r + (isBig ? 6 : 3.5) + Math.sin(Date.now() / 220) * (isBig ? 2 : 1), 0, TAU); c.fillStyle = 'rgba(255,255,255,0.75)'; c.fill(); }
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = q.color; c.fill(); c.lineWidth = isBig ? 3 : 2; c.strokeStyle = api.NAVY; c.stroke();
      if (isBig) { // a small name above the dot (the level is in the list beside the map)
        api.label(c, q.name, x, y - r - 5, me ? '#FFD66B' : '#fff', api.NAVY, 13);
        if (!me) hits.push({ x: x, y: y - 12, r: 34, target: { kind: 'p', key: String(q.name).toLowerCase() }, name: q.name });
      }
    });
    if (!isBig) { c.font = '15px ' + api.FONT; c.textAlign = 'right'; c.textBaseline = 'bottom'; c.fillText('🔍', W - 4, H - 2); }
  }
  function fit(cv) { // size a canvas for its box; gives the box size back
    var dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    if (w < 2 || h < 2) return null;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h };
  }

  // ---------- the big map ----------
  function listRows() {
    var ps = api.players(), meId = api.myId(), list = [], id, tp = targetSpot();
    if (!listEl) return;
    for (id in ps) list.push(ps[id]);
    list.sort(function (a, b) { return (b.id === meId ? 1 : 0) - (a.id === meId ? 1 : 0) || a.id - b.id; });
    listEl.innerHTML = '';
    list.forEach(function (q) {
      var wh = where(q), me = q.id === meId, key = String(q.name).toLowerCase(), on = target && target.kind === 'p' && target.key === key;
      var b = el('button', 'map-row' + (me ? ' me' : '') + (on ? ' on' : ''));
      b.type = 'button'; b.disabled = me;
      b.innerHTML = '<i style="background:' + api.esc(q.color) + '"></i><span><b>' + api.esc(q.name) + (q.lv ? ' · Lv ' + q.lv : '') + '</b><span>' + api.esc(wh.text) + '</span></span><em>' + (wh.icon || (me ? '' : '➜')) + '</em>';
      b.setAttribute('aria-label', q.name + ', ' + wh.text + (me ? '' : '. Tap to be shown the way.'));
      if (!me) b.onclick = function () { if (on) setTarget(null); else { setTarget({ kind: 'p', key: key }, q.name); close(); } };
      listEl.appendChild(b);
    });
    if (tp) {
      var stop = el('button', 'btn', 'Stop the arrow'); stop.type = 'button';
      stop.onclick = function () { setTarget(null); listRows(); };
      listEl.appendChild(stop);
    }
    listEl.appendChild(el('p', 'map-hint', list.length > 1 ? 'Tap a person or a place and a yellow arrow shows you the way.' : 'Tap a place and a yellow arrow shows you the way.'));
  }
  function drawBig() {
    if (!root || !big) return;
    var box = fit(big);
    track();
    if (box) paint(big.getContext('2d'), box.w, box.h, true);
  }
  function close() {
    if (!root) return;
    clearInterval(bigTimer); bigTimer = 0;
    window.removeEventListener('resize', drawBig);
    if (root.parentNode) root.parentNode.removeChild(root);
    root = null; big = null; listEl = null;
    api.sfx('close');
  }
  function open() {
    if (root || !api.world()) return;
    api.sfx('open');
    root = el('div', 'screen map-ov'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Town map');
    var head = el('div', 'map-head'), back = el('button', 'btn', 'Back'), title = el('h2');
    back.type = 'button'; back.setAttribute('data-quiet', ''); back.onclick = close;
    title.innerHTML = 'Town map <span class="tri">地图 <span class="py">dìtú</span> · Peta</span>';
    head.appendChild(back); head.appendChild(title);
    var body = el('div', 'map-body'), stage = el('div', 'map-stage');
    big = el('canvas'); big.setAttribute('aria-label', 'Map of the town with everybody on it');
    listEl = el('div', 'map-side');
    stage.appendChild(big); body.appendChild(stage); body.appendChild(listEl);
    root.appendChild(head); root.appendChild(body);
    big.addEventListener('pointerdown', function (e) {
      var r = big.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null, bd = 1e9, i, d;
      for (i = 0; i < hits.length; i++) {
        d = Math.sqrt((hits[i].x - x) * (hits[i].x - x) + (hits[i].y - y) * (hits[i].y - y));
        if (d < hits[i].r && d < bd) { bd = d; best = hits[i]; }
      }
      if (!best) return;
      setTarget(best.target, best.name);
      close();
    });
    document.body.appendChild(root);
    window.addEventListener('resize', drawBig);
    listRows(); drawBig();
    bigTimer = setInterval(function () { drawBig(); }, 150);
  }

  // ---------- the small map on the town screen ----------
  function drawMini() {
    if (!mini || root || api.room() !== 'town' || !api.world()) return;
    var cv = mini.firstChild, box = fit(cv);
    track();
    if (box) paint(cv.getContext('2d'), box.w, box.h, false);
  }

  // ---------- the guide arrow in the town ----------
  function town(c, t, view, items) {
    var me = api.self(), tp, dx, dy, d, a, R, ax, ay, steps, text;
    if (!target || !me) return;
    tp = targetSpot();
    if (!tp) { target = null; return; }                       // the person left the game
    dx = tp.x - me.x; dy = tp.y - me.y; d = Math.sqrt(dx * dx + dy * dy);
    if (d < 120) { target = null; api.sfx('right'); api.toast('You are here: ' + tp.name + '! 🎉'); return; }
    a = Math.atan2(dy, dx); R = 104 + Math.sin(t * 5) * 9; ax = me.x + Math.cos(a) * R; ay = me.y - 44 + Math.sin(a) * R * 0.8;
    steps = Math.max(1, Math.round(d / 60)); text = (tp.icon ? tp.icon + ' ' : '') + tp.name + ' · ' + steps + ' 👣';
    items.push({ y: 1e9, d: function () {                       // on top of everything
      c.save(); c.translate(ax, ay); c.rotate(a); c.lineJoin = 'round';
      c.beginPath(); c.moveTo(34, 0); c.lineTo(4, -24); c.lineTo(4, -10); c.lineTo(-26, -10); c.lineTo(-26, 10); c.lineTo(4, 10); c.lineTo(4, 24); c.closePath();
      c.fillStyle = 'rgba(27,42,73,0.25)'; c.translate(3, 5); c.fill(); c.translate(-3, -5);
      c.fillStyle = '#FFD66B'; c.fill(); c.lineWidth = 4; c.strokeStyle = api.NAVY; c.stroke();
      c.restore();
      api.label(c, text, me.x, me.y + 44, '#FFD66B', api.NAVY, 17);
      if (tp.x > view.x && tp.x < view.x + view.w && tp.y > view.y && tp.y < view.y + view.h) { // in sight: a bouncing pin on it
        var by = tp.y - 150 - Math.abs(Math.sin(t * 4)) * 22;
        c.beginPath(); c.moveTo(tp.x, by + 44); c.lineTo(tp.x - 17, by + 12); c.arc(tp.x, by, 21, Math.PI * 0.8, Math.PI * 0.2); c.closePath();
        c.fillStyle = '#FF4F6D'; c.fill(); c.lineWidth = 4; c.strokeStyle = api.NAVY; c.stroke();
        c.beginPath(); c.arc(tp.x, by, 8, 0, TAU); c.fillStyle = '#fff'; c.fill();
      }
    } });
  }

  window.FTGames = window.FTGames || {};
  window.FTGames.map = {
    init: function (a) {
      api = a;
      var hud = document.getElementById('hud');
      if (!hud) return;
      var st = document.createElement('style'); st.id = 'map-style'; st.textContent = CSS; document.head.appendChild(st);
      mini = el('button', 'map-mini'); mini.type = 'button'; mini.setAttribute('aria-label', 'Town map: see where everybody is'); mini.setAttribute('data-quiet', '');
      mini.appendChild(el('canvas'));
      mini.onclick = open;
      hud.appendChild(mini);
      setInterval(drawMini, 200);
    },
    town: town,
    onPlayers: function () { if (root) listRows(); }
  };
})();
