// Car Garage: design a race car. Exposes window.CarDesigner { defaults, draw, open }.
// A design is a flat object: { body, color, color2, decal, wheel, wheelColor, spoiler, num, extra }.
// open(design, onSave, opts): opts.driver is the helmet colour; opts.shop = { kind, items, state(), buy(id, cb) }
// comes from the game and locks the options listed in the shop catalogue until they are bought (or found in
// the daily chest). Without opts.shop everything is free.
(function () {
  'use strict';

  var NAVY = '#1B2A49', TIRE = '#2B3046', GLASS = '#BFE9FF', TAU = Math.PI * 2;
  var FONT = "Fredoka, 'Baloo 2', 'Trebuchet MS', sans-serif";
  var COLORS = ['#FF4F6D', '#FF7A45', '#FFC933', '#4FA05A', '#5ED6C4', '#3B82F6', '#9B6BFF', '#FF8FB8', '#FFFFFF', '#2B3046'];
  var RIMS = ['#E8ECF2', '#FFC933', '#FF4F6D', '#5ED6C4', '#9B6BFF', '#FF7A45'];
  var DECALS = ['None', 'Stripes', 'Flames', 'Bolt', 'Stars', 'Checks', 'Rainbow'];
  var SPOILERS = ['None', 'Small', 'Big wing'];
  var EXTRAS = ['None', 'Roof light', 'Flag', 'Booster', 'Rainbow trail'];
  var WHEELS = ['Classic', 'Star', 'Disc', 'Chunky', 'Turbine', 'Golden'];
  var RAINBOW = ['#FF4F6D', '#FF9F43', '#FFD66B', '#4FA05A', '#5AA9FF', '#9B6BFF'];
  var GOLD = '#FFC933';

  function isHex(v) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v); }
  function idx(v, n, def) { v = parseInt(v, 10); return (v >= 0 && v < n) ? v : def; }
  function shade(hex, f) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    function m(v) { v = f < 0 ? v * (1 + f) : v + (255 - v) * f; v = Math.round(v); return (v < 16 ? '0' : '') + v.toString(16); }
    return '#' + m(r) + m(g) + m(b);
  }
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function ol(c, w) { c.lineWidth = w || 3; c.strokeStyle = NAVY; c.stroke(); }
  function star(c, x, y, ro, ri, rot) {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = (rot || 0) - Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? ri : ro;
      if (i) c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    c.closePath();
  }
  function lamp(c, x, y, rx, ry, col) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = col; c.fill(); ol(c, 2); }

  // ---------- body shapes (origin: ground under the middle of the car, nose to the right) ----------
  var BODIES = [
    { name: 'Racer', wheels: [{ x: -40, r: 16 }, { x: 42, r: 13 }], open: true, seat: { x: -3, y: -37, r: 8 },
      door: { x: -16, y: -19, r: 8 }, sp: { x: -55, y: -30 }, roof: { x: -24, y: -43 }, rear: { x: -60, y: -18 }, band: { x0: -60, x1: 66, y0: -34, y1: -8 },
      path: function (c) {
        c.beginPath(); c.moveTo(-60, -11); c.lineTo(-60, -25); c.quadraticCurveTo(-59, -31, -50, -32); c.lineTo(-34, -34);
        c.quadraticCurveTo(-30, -43, -22, -43); c.quadraticCurveTo(-15, -43, -13, -33); c.lineTo(8, -31);
        c.quadraticCurveTo(40, -24, 62, -15); c.quadraticCurveTo(67, -12, 62, -8); c.lineTo(-56, -8); c.quadraticCurveTo(-60, -8, -60, -11); c.closePath();
      },
      front: function (c, d) {
        rr(c, -34, -25, 44, 15, 6); c.fillStyle = shade(d.color, -0.14); c.fill(); ol(c, 2);        // side pod
        c.beginPath(); c.ellipse(-22, -37, 4, 3, 0, 0, TAU); c.fillStyle = NAVY; c.fill();           // air intake
        rr(c, 48, -10, 22, 6, 3); c.fillStyle = d.color2; c.fill(); ol(c, 2.5);                      // front wing
        rr(c, 65, -18, 5, 14, 2); c.fillStyle = d.color2; c.fill(); ol(c, 2.5);
      } },
    { name: 'Sports', wheels: [{ x: -38, r: 13 }, { x: 38, r: 13 }], arch: true, seat: { x: 3, y: -39, r: 7 },
      door: { x: -8, y: -21, r: 8.5 }, sp: { x: -55, y: -31 }, roof: { x: -4, y: -51 }, rear: { x: -64, y: -15 }, band: { x0: -64, x1: 66, y0: -32, y1: -7 },
      path: function (c) {
        c.beginPath(); c.moveTo(-63, -11); c.lineTo(-64, -22); c.quadraticCurveTo(-64, -30, -54, -31); c.lineTo(-40, -33);
        c.quadraticCurveTo(-28, -51, -8, -51); c.lineTo(4, -51); c.quadraticCurveTo(18, -50, 31, -34); c.lineTo(52, -30);
        c.quadraticCurveTo(65, -27, 66, -17); c.lineTo(66, -11); c.quadraticCurveTo(66, -7, 61, -7); c.lineTo(-58, -7); c.quadraticCurveTo(-63, -7, -63, -11); c.closePath();
      },
      win: function (c) {
        c.beginPath(); c.moveTo(-34, -34); c.quadraticCurveTo(-24, -46, -8, -46); c.lineTo(3, -46); c.quadraticCurveTo(14, -45, 24, -34); c.closePath();
      },
      front: function (c) {
        c.beginPath(); c.moveTo(-6, -46); c.lineTo(-8, -34); c.lineWidth = 2.5; c.strokeStyle = NAVY; c.stroke(); // pillar
        lamp(c, 59, -22, 5, 3.5, '#FFE27A'); lamp(c, -61, -23, 2.5, 4, '#FF4F6D');
      } },
    { name: 'Monster', wheels: [{ x: -36, r: 22 }, { x: 36, r: 22 }], seat: { x: 10, y: -63, r: 6.5 },
      door: { x: 9, y: -46, r: 7.5 }, sp: { x: -50, y: -56 }, roof: { x: 6, y: -75 }, rear: { x: -58, y: -44 }, band: { x0: -58, x1: 61, y0: -56, y1: -36 },
      path: function (c) {
        c.beginPath(); c.moveTo(-58, -40); c.lineTo(-58, -52); c.quadraticCurveTo(-58, -56, -54, -56); c.lineTo(-18, -56); c.lineTo(-12, -72);
        c.quadraticCurveTo(-11, -75, -7, -75); c.lineTo(20, -75); c.quadraticCurveTo(24, -75, 26, -72); c.lineTo(34, -57); c.lineTo(54, -54);
        c.quadraticCurveTo(61, -53, 61, -46); c.lineTo(61, -40); c.quadraticCurveTo(61, -36, 57, -36); c.lineTo(-54, -36); c.quadraticCurveTo(-58, -36, -58, -40); c.closePath();
      },
      win: function (c) { c.beginPath(); c.moveTo(-11, -58); c.lineTo(-6, -70); c.lineTo(19, -70); c.lineTo(26, -58); c.closePath(); },
      back: function (c) {
        c.strokeStyle = NAVY; c.lineWidth = 7; c.beginPath(); c.moveTo(-36, -22); c.lineTo(-28, -38); c.moveTo(36, -22); c.lineTo(28, -38); c.moveTo(-36, -24); c.lineTo(36, -24); c.stroke();
        c.strokeStyle = '#AEB6C4'; c.lineWidth = 3; c.beginPath(); c.moveTo(-36, -22); c.lineTo(-28, -38); c.moveTo(36, -22); c.lineTo(28, -38); c.moveTo(-36, -24); c.lineTo(36, -24); c.stroke();
      },
      front: function (c) { rr(c, 56, -43, 9, 7, 2); c.fillStyle = '#AEB6C4'; c.fill(); ol(c, 2); lamp(c, 56, -49, 3, 3, '#FFE27A'); } },
    { name: 'Buggy', wheels: [{ x: -38, r: 17 }, { x: 40, r: 14 }], open: true, seat: { x: -2, y: -39, r: 8 },
      door: { x: 4, y: -19, r: 7.5 }, sp: { x: -50, y: -33 }, roof: { x: -8, y: -59 }, rear: { x: -56, y: -22 }, band: { x0: -56, x1: 60, y0: -33, y1: -10 },
      path: function (c) {
        c.beginPath(); c.moveTo(-54, -14); c.lineTo(-56, -28); c.quadraticCurveTo(-56, -33, -50, -33); c.lineTo(-20, -33); c.lineTo(-10, -28); c.lineTo(22, -28);
        c.quadraticCurveTo(42, -28, 56, -21); c.quadraticCurveTo(61, -18, 60, -13); c.quadraticCurveTo(59, -10, 55, -10); c.lineTo(-50, -10); c.quadraticCurveTo(-53, -10, -54, -14); c.closePath();
      },
      front: function (c, d) {
        function cage() { c.beginPath(); c.moveTo(-36, -32); c.lineTo(-27, -58); c.lineTo(12, -58); c.lineTo(25, -28); c.moveTo(-27, -58); c.lineTo(-14, -31); }
        cage(); c.lineWidth = 7.5; c.strokeStyle = NAVY; c.stroke();
        cage(); c.lineWidth = 3; c.strokeStyle = d.color2; c.stroke();
        lamp(c, 53, -22, 4, 3.5, '#FFE27A');
      } },
    { name: 'Rocket', wheels: [{ x: -34, r: 11 }, { x: 28, r: 11 }], seat: { x: 6, y: -44, r: 6.5 },
      door: { x: -24, y: -23, r: 8.5 }, sp: { x: -30, y: -37 }, roof: { x: 6, y: -54 }, rear: { x: -62, y: -23 }, band: { x0: -58, x1: 44, y0: -38, y1: -9 },
      path: function (c) {
        c.beginPath(); c.moveTo(-56, -14); c.quadraticCurveTo(-61, -26, -52, -36); c.lineTo(8, -38); c.quadraticCurveTo(44, -36, 69, -22);
        c.quadraticCurveTo(44, -10, 10, -9); c.lineTo(-50, -9); c.quadraticCurveTo(-55, -10, -56, -14); c.closePath();
      },
      win: function (c) { c.beginPath(); c.moveTo(-12, -38); c.quadraticCurveTo(-9, -54, 6, -54); c.quadraticCurveTo(22, -52, 28, -37); c.closePath(); },
      back: function (c, d) {
        c.beginPath(); c.moveTo(-52, -34); c.lineTo(-67, -60); c.lineTo(-50, -60); c.lineTo(-30, -36); c.closePath(); c.fillStyle = d.color2; c.fill(); ol(c, 3);
        c.beginPath(); c.moveTo(-54, -32); c.lineTo(-66, -34); c.lineTo(-66, -13); c.lineTo(-54, -15); c.closePath(); c.fillStyle = '#AEB6C4'; c.fill(); ol(c, 3);
      },
      inside: function (c, d) { c.fillStyle = d.color2; c.fillRect(44, -40, 30, 34); c.fillStyle = NAVY; c.fillRect(42.5, -40, 3, 34); },
      front: function (c, d) {
        c.beginPath(); c.moveTo(-50, -12); c.lineTo(-62, -3); c.lineTo(-40, -3); c.lineTo(-30, -12); c.closePath(); c.fillStyle = d.color2; c.fill(); ol(c, 2.5); // low side fin
      } },
    { name: 'Van', wheels: [{ x: -38, r: 13 }, { x: 40, r: 13 }], arch: true, seat: { x: 23, y: -46, r: 6.5 },
      door: { x: -6, y: -23, r: 9 }, sp: { x: -55, y: -60 }, roof: { x: -8, y: -60 }, rear: { x: -64, y: -18 }, band: { x0: -64, x1: 67, y0: -36, y1: -7 },
      path: function (c) {
        c.beginPath(); c.moveTo(-64, -11); c.lineTo(-64, -52); c.quadraticCurveTo(-64, -60, -56, -60); c.lineTo(24, -60); c.quadraticCurveTo(32, -60, 37, -53); c.lineTo(48, -39);
        c.lineTo(60, -35); c.quadraticCurveTo(67, -33, 67, -25); c.lineTo(67, -11); c.quadraticCurveTo(67, -7, 62, -7); c.lineTo(-60, -7); c.quadraticCurveTo(-64, -7, -64, -11); c.closePath();
      },
      win: function (c) {
        c.beginPath(); c.moveTo(11, -54); c.lineTo(25, -54); c.quadraticCurveTo(30, -54, 33, -50); c.lineTo(42, -39); c.lineTo(11, -39); c.closePath();
        c.moveTo(-50, -54); c.lineTo(4, -54); c.lineTo(4, -39); c.lineTo(-54, -39); c.lineTo(-54, -50); c.quadraticCurveTo(-54, -54, -50, -54); c.closePath();
      },
      front: function (c) {
        c.beginPath(); c.moveTo(-25, -54); c.lineTo(-25, -39); c.lineWidth = 2.5; c.strokeStyle = NAVY; c.stroke();
        lamp(c, 61, -26, 4, 4, '#FFE27A'); lamp(c, -62, -28, 2.5, 5, '#FF4F6D');
        rr(c, 58, -15, 12, 6, 2); c.fillStyle = '#AEB6C4'; c.fill(); ol(c, 2);
      } }
  ];

  function defaults() {
    return { body: 1, color: '#FF4F6D', color2: '#FFFFFF', decal: 1, wheel: 0, wheelColor: '#E8ECF2', spoiler: 1, num: 1, extra: 0 };
  }
  function norm(d) {
    var def = defaults(); d = (d && typeof d === 'object') ? d : {};
    return {
      body: idx(d.body, BODIES.length, def.body),
      color: isHex(d.color) ? d.color : def.color,
      color2: isHex(d.color2) ? d.color2 : def.color2,
      decal: idx(d.decal, DECALS.length, def.decal),
      wheel: idx(d.wheel, WHEELS.length, def.wheel),
      wheelColor: isHex(d.wheelColor) ? d.wheelColor : def.wheelColor,
      spoiler: idx(d.spoiler, SPOILERS.length, def.spoiler),
      num: idx(d.num, 10, def.num),
      extra: idx(d.extra, EXTRAS.length, def.extra)
    };
  }

  // ---------- parts ----------
  function drawWheel(c, x, r, style, rim, ang) {
    var i, a, k = r * 0.62;
    if (style === 5) rim = GOLD;                     // golden wheels are gold whatever the wheel colour
    c.save(); c.translate(x, -r);
    if (style === 3) {
      c.fillStyle = TIRE; c.strokeStyle = NAVY; c.lineWidth = 2;
      for (i = 0; i < 10; i++) { c.save(); c.rotate(ang + i * TAU / 10); rr(c, -2.6, -r - 2.4, 5.2, 5, 1.5); c.fill(); c.stroke(); c.restore(); }
    }
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = TIRE; c.fill(); ol(c, 3);
    if (style === 5) { c.beginPath(); c.arc(0, 0, r * 0.83, 0, TAU); c.lineWidth = Math.max(1.6, r * 0.11); c.strokeStyle = '#FFE27A'; c.stroke(); } // gold tyre trim
    c.rotate(ang);
    c.beginPath(); c.arc(0, 0, k, 0, TAU); c.fillStyle = rim; c.fill(); ol(c, 2);
    c.strokeStyle = NAVY; c.lineWidth = 2;
    if (style === 0) {
      c.beginPath(); for (i = 0; i < 5; i++) { a = i * TAU / 5; c.moveTo(0, 0); c.lineTo(Math.cos(a) * k, Math.sin(a) * k); } c.stroke();
      c.beginPath(); c.arc(0, 0, r * 0.2, 0, TAU); c.fillStyle = shade(rim, -0.25); c.fill(); c.stroke();
    } else if (style === 1) {
      star(c, 0, 0, k * 0.92, k * 0.42, 0); c.fillStyle = shade(rim, -0.3); c.fill(); c.lineWidth = 1.5; c.stroke();
    } else if (style === 2) {
      c.fillStyle = NAVY; for (i = 0; i < 5; i++) { a = i * TAU / 5; c.beginPath(); c.arc(Math.cos(a) * k * 0.62, Math.sin(a) * k * 0.62, r * 0.09, 0, TAU); c.fill(); }
      c.beginPath(); c.arc(0, 0, r * 0.16, 0, TAU); c.fill();
    } else if (style === 3) {
      c.lineWidth = Math.max(3, r * 0.2); c.beginPath(); c.moveTo(-k, 0); c.lineTo(k, 0); c.moveTo(0, -k); c.lineTo(0, k); c.stroke();
      c.beginPath(); c.arc(0, 0, r * 0.2, 0, TAU); c.fillStyle = rim; c.fill(); c.lineWidth = 2; c.stroke();
    } else if (style === 5) {                        // golden (legendary): fine spokes and a pale star
      c.strokeStyle = shade(GOLD, -0.35); c.lineWidth = 1.6; c.beginPath();
      for (i = 0; i < 8; i++) { a = i * TAU / 8; c.moveTo(0, 0); c.lineTo(Math.cos(a) * k, Math.sin(a) * k); }
      c.stroke();
      star(c, 0, 0, k * 0.68, k * 0.3, 0); c.fillStyle = '#FFF6C9'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = NAVY; c.stroke();
    } else {
      c.beginPath();
      for (i = 0; i < 6; i++) { a = i * TAU / 6; c.moveTo(0, 0); c.quadraticCurveTo(Math.cos(a + 0.7) * k * 0.6, Math.sin(a + 0.7) * k * 0.6, Math.cos(a) * k, Math.sin(a) * k); }
      c.stroke();
      c.beginPath(); c.arc(0, 0, r * 0.14, 0, TAU); c.fillStyle = NAVY; c.fill();
    }
    c.restore();
  }

  function drawDecal(c, d, b) {
    var w = b.x1 - b.x0, h = b.y1 - b.y0, ym = b.y0 + h * 0.42, i, x, y;
    if (d.decal === 1) {
      c.fillStyle = d.color2; c.fillRect(b.x0 - 4, ym - 3.5, w + 8, 6.5); c.fillRect(b.x0 - 4, ym + 5, w + 8, 2.6);
    } else if (d.decal === 2) {
      var xf = b.x1 - w * 0.3, th = h / 3, L = [w * 0.42, w * 0.3, w * 0.38];
      function tongues(col, k) {
        c.fillStyle = col; c.beginPath();
        for (i = 0; i < 3; i++) {
          y = b.y0 + i * th;
          c.moveTo(xf + 2, y - 1); c.quadraticCurveTo(xf - L[i] * k * 0.5, y - 2, xf - L[i] * k, y + th * 0.3);
          c.quadraticCurveTo(xf - L[i] * k * 0.45, y + th * 0.75, xf + 2, y + th + 1); c.closePath();
        }
        c.fill(); c.fillRect(xf, b.y0 - 6, b.x1 - xf + 8, h + 12);
      }
      tongues(d.color2, 1); c.save(); c.translate((b.x1 - xf) * 0.5 + 6, 0); tongues('#FFC933', 0.6); c.restore();
    } else if (d.decal === 3) {
      var P = [8, -1, -9, 0.12, -1, 0.12, -8, 1, 11, -0.2, 2, -0.2], cx = [b.x0 + w * 0.24, b.x0 + w * 0.7];
      for (i = 0; i < 2; i++) {
        c.beginPath();
        for (var j = 0; j < 12; j += 2) { x = cx[i] + P[j] * 1.1; y = b.y0 + h * 0.5 + P[j + 1] * h * 0.46; if (j) c.lineTo(x, y); else c.moveTo(x, y); }
        c.closePath(); c.fillStyle = d.color2; c.fill(); ol(c, 1.5);
      }
    } else if (d.decal === 4) {
      var S = [0.08, 0.3, 5, 0.24, 0.72, 4, 0.4, 0.3, 4.5, 0.6, 0.7, 5.5, 0.76, 0.28, 4, 0.9, 0.66, 4.5];
      c.fillStyle = d.color2;
      for (i = 0; i < S.length; i += 3) { star(c, b.x0 + S[i] * w, b.y0 + S[i + 1] * h, S[i + 2], S[i + 2] * 0.45, i); c.fill(); ol(c, 1); }
    } else if (d.decal === 5) {
      var q = 6, n = 0;
      for (x = b.x0 - 2; x < b.x0 + w * 0.32; x += q, n++) {
        for (y = b.y0 - 6, i = 0; y < b.y1 + 6; y += q, i++) { c.fillStyle = (n + i) % 2 ? '#FFFFFF' : NAVY; c.fillRect(x, y, q, q); }
      }
    } else if (d.decal === 6) {                      // rainbow (legendary): six bands along the side
      var bh = h * 0.72 / 6, by0 = b.y0 + h * 0.1;
      for (i = 0; i < 6; i++) { c.fillStyle = RAINBOW[i]; c.fillRect(b.x0 - 6, by0 + i * bh, w + 12, bh + 0.4); }
      c.fillStyle = NAVY; c.fillRect(b.x0 - 6, by0 - 1.2, w + 12, 1.2); c.fillRect(b.x0 - 6, by0 + 6 * bh, w + 12, 1.2);
    }
  }

  function drawSpoiler(c, d, p) {
    if (!d.spoiler) return;
    var big = d.spoiler === 2, hgt = big ? 19 : 9;
    c.strokeStyle = NAVY; c.lineWidth = big ? 4 : 3.5; c.beginPath();
    c.moveTo(p.x + 3, p.y + 5); c.lineTo(p.x, p.y - hgt + 2);
    if (big) { c.moveTo(p.x - 7, p.y + 5); c.lineTo(p.x - 9, p.y - hgt + 2); }
    c.stroke();
    rr(c, p.x - (big ? 17 : 12), p.y - hgt - (big ? 5 : 4), big ? 30 : 22, big ? 7 : 5.5, 2.5); c.fillStyle = d.color2; c.fill(); ol(c, 2.5);
    if (big) { rr(c, p.x - 19, p.y - hgt - 10, 5, 17, 2); c.fillStyle = d.color; c.fill(); ol(c, 2.5); }
  }

  function drawFlame(c, x, y, len, hgt) {
    c.beginPath(); c.moveTo(x, y - hgt); c.quadraticCurveTo(x - len * 0.6, y - hgt * 0.9, x - len, y); c.quadraticCurveTo(x - len * 0.6, y + hgt * 0.9, x, y + hgt); c.closePath();
  }

  function draw(ctx, x, y, design, opts) {
    var d = norm(design), o = opts || {};
    var s = o.scale > 0 ? o.scale : 1, f = o.facing < 0 ? -1 : 1, t = +o.t || 0, mv = !!o.moving;
    var B = BODIES[d.body], i, wv, k;
    var bounce = mv ? Math.sin(t * 17) * 0.8 : 0, ang = mv ? t * 9 : 0.5;
    var drv = isHex(o.driver) ? o.driver : null;

    ctx.save();
    ctx.translate(x, y); ctx.scale(s * f, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([]); ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(27,42,73,0.16)'; ctx.beginPath(); ctx.ellipse(0, 1.5, 64, 5, 0, 0, TAU); ctx.fill();

    if (d.extra === 4) {                             // rainbow trail (legendary): a ribbon flying behind the car
      var tl = mv ? 62 : 22, tx = B.rear.x + 6, ty = B.rear.y;
      var ribbon = function (off, len) {
        var n, q;
        ctx.beginPath();
        for (n = 0; n <= 10; n++) {
          q = n / 10;
          if (n) ctx.lineTo(tx - q * len, ty + off + Math.sin(t * 8 + q * 5.5) * 2.6 * q); else ctx.moveTo(tx, ty + off);
        }
      };
      ctx.lineCap = 'butt';
      ribbon(0, tl + 1.6); ctx.lineWidth = 19; ctx.strokeStyle = NAVY; ctx.stroke();
      for (i = 0; i < 6; i++) { ribbon(-6.5 + i * 2.6, tl); ctx.lineWidth = 3; ctx.strokeStyle = RAINBOW[i]; ctx.stroke(); }
      ctx.lineCap = 'round';
    }
    if (mv && d.extra !== 3 && d.extra !== 4) {      // exhaust puffs
      for (i = 0; i < 3; i++) {
        k = (t * 1.6 + i / 3) % 1;
        ctx.globalAlpha = 0.75 * (1 - k); ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = NAVY; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(B.rear.x - 5 - k * 26, -9 - k * 9, 2.5 + k * 5, 0, TAU); ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.save(); ctx.translate(0, bounce);
    if (B.back) B.back(ctx, d);
    if (d.extra === 2) {                             // flag
      var fx = B.sp.x + 9, fy = B.sp.y + 4, top = fy - 32; wv = Math.sin(t * 7) * (mv ? 3 : 1.2);
      ctx.strokeStyle = NAVY; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, top); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(fx, top); ctx.quadraticCurveTo(fx - 10, top + 1 + wv, fx - 20, top + 6 - wv); ctx.quadraticCurveTo(fx - 10, top + 9 + wv, fx, top + 12); ctx.closePath();
      ctx.fillStyle = d.color2; ctx.fill(); ol(ctx, 2.5);
    }
    if (d.extra === 3) {                             // rocket booster
      var bx = B.rear.x, by = B.rear.y, fl = mv ? 20 + Math.sin(t * 40) * 5 : 9;
      drawFlame(ctx, bx - 8, by, fl, 6); ctx.fillStyle = '#FF7A45'; ctx.fill(); ol(ctx, 2);
      drawFlame(ctx, bx - 8, by, fl * 0.55, 3.2); ctx.fillStyle = '#FFE27A'; ctx.fill();
      rr(ctx, bx - 10, by - 7, 20, 14, 4); ctx.fillStyle = '#AEB6C4'; ctx.fill(); ol(ctx, 2.5);
      ctx.fillStyle = NAVY; ctx.fillRect(bx - 4, by - 7, 2.5, 14);
    }
    drawSpoiler(ctx, d, B.sp);
    function helmet() {
      var p = B.seat;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fillStyle = drv; ctx.fill(); ol(ctx, 2.5);
      rr(ctx, p.x + p.r * 0.05, p.y - p.r * 0.35, p.r * 0.95, p.r * 0.7, p.r * 0.3); ctx.fillStyle = '#DDF3FF'; ctx.fill(); ol(ctx, 1.6);
    }
    if (drv && B.open) helmet();

    B.path(ctx); ctx.fillStyle = d.color; ctx.fill();
    ctx.save(); B.path(ctx); ctx.clip();
    drawDecal(ctx, d, B.band);
    if (B.inside) B.inside(ctx, d);
    if (B.arch) { ctx.fillStyle = NAVY; for (i = 0; i < B.wheels.length; i++) { ctx.beginPath(); ctx.arc(B.wheels[i].x, -B.wheels[i].r, B.wheels[i].r + 4, 0, TAU); ctx.fill(); } }
    ctx.restore();
    B.path(ctx); ol(ctx, 3);

    if (B.win) {
      B.win(ctx); ctx.fillStyle = GLASS; ctx.fill();
      if (drv) { ctx.save(); B.win(ctx); ctx.clip(); helmet(); ctx.restore(); }
      B.win(ctx); ol(ctx, 2.5);
    }
    if (B.front) B.front(ctx, d);

    ctx.beginPath(); ctx.arc(B.door.x, B.door.y, B.door.r, 0, TAU); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ol(ctx, 2);   // race number
    ctx.save(); ctx.translate(B.door.x, B.door.y); ctx.scale(f, 1);
    ctx.fillStyle = NAVY; ctx.font = '700 ' + Math.round(B.door.r * 1.45) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(d.num), 0, 0.8); ctx.restore();

    if (d.extra === 1) {                             // roof light
      var on = Math.floor(t * 4) % 2 === 0;
      if (mv) { ctx.globalAlpha = 0.3; ctx.fillStyle = on ? '#FF4F6D' : '#3B82F6'; ctx.beginPath(); ctx.arc(B.roof.x, B.roof.y - 5, 11, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.beginPath(); ctx.arc(B.roof.x, B.roof.y - 2.5, 5.5, Math.PI, 0); ctx.closePath(); ctx.fillStyle = on ? '#FF4F6D' : '#3B82F6'; ctx.fill(); ol(ctx, 2);
      rr(ctx, B.roof.x - 7, B.roof.y - 3.5, 14, 4, 1.5); ctx.fillStyle = '#AEB6C4'; ctx.fill(); ol(ctx, 2);
    }
    ctx.restore();

    for (i = 0; i < B.wheels.length; i++) drawWheel(ctx, B.wheels[i].x, B.wheels[i].r, d.wheel, d.wheelColor, ang);
    ctx.restore();
  }

  // ---------- designer overlay ----------
  var CSS = [
    '.cd-ov{position:fixed;left:0;top:0;right:0;bottom:0;z-index:30;background:#FFF3D6;color:#1B2A49;display:flex;gap:12px;padding:12px;font-family:inherit;touch-action:none}',
    '.cd-ov .py{font-family:system-ui,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif}',
    '.cd-left{flex:1 1 46%;min-width:0;display:flex;flex-direction:column;gap:10px}',
    '.cd-title{margin:0;font-size:30px;line-height:1.1}',
    '.cd-stage{flex:1;min-height:0;border:4px solid #1B2A49;border-radius:22px;overflow:hidden;background:#BDE9FF}',
    '.cd-cv{display:block;width:100%;height:100%}',
    '.cd-bar{display:flex;gap:8px}',
    '.cd-bar .btn{flex:1;padding:0 10px;white-space:nowrap}',
    '.cd-bar .btn.cd-dis{opacity:.6}',
    '.cd-side{flex:1 1 54%;min-width:0;min-height:0;display:flex;flex-direction:column;gap:8px}',
    '.cd-right{flex:1;min-height:0;background:#fff;border:4px solid #1B2A49;border-radius:22px;padding:12px 14px 16px;overflow-y:auto;touch-action:pan-y;-webkit-overflow-scrolling:touch}',
    '.cd-lbl{font-size:18px;font-weight:700;margin:12px 0 6px}',
    '.cd-lbl:first-child{margin-top:0}',
    '.cd-row{display:flex;flex-wrap:wrap;gap:8px;padding:2px}',
    '.cd-ov .sw{width:48px;height:48px}',
    '.cd-ov .chip{height:48px;min-width:48px;padding:0 14px}',
    '.cd-pic{border:3px solid #1B2A49;border-radius:16px;background:#E9F6E4;padding:2px 4px 4px;display:flex;flex-direction:column;align-items:center;font-size:14px;font-weight:600;line-height:1.1}',
    '.cd-pic canvas{display:block}',
    '.cd-pic.on{background:#FFD66B;outline:4px solid #1B2A49;outline-offset:2px}',
    '.cd-pic:active{transform:scale(.96)}',
    '.cd-ov .cd-r1{border-color:#5AA9FF}',
    '.cd-ov .cd-r2{border-color:#9B6BFF}',
    '.cd-ov .cd-r3{border-color:#FFC933}',
    '.cd-bdg{display:inline-block;margin-left:6px;background:#FFD66B;color:#1B2A49;border:2px solid #1B2A49;border-radius:999px;padding:0 7px;font-size:13px;font-weight:700;line-height:1.35;white-space:nowrap;vertical-align:middle}',
    '.cd-pic .cd-bdg{margin:3px 0 0}',
    // buy bar: sits under the option list while a locked option is being tried on
    '.cd-buy{flex:none;background:#fff;border:4px solid #1B2A49;border-radius:22px;padding:8px 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
    '.cd-buy-txt{flex:1;min-width:150px;font-size:17px;font-weight:600;line-height:1.25}',
    '.cd-buy-name b{font-size:20px}',
    '.cd-buy-sum{font-size:20px;font-weight:700}',
    '.cd-buy-msg{color:#B3122F}',
    '.cd-buy-btns{display:flex;gap:8px;flex:none}',
    '.cd-buy .btn{height:52px;padding:0 16px;white-space:nowrap}',
    '.cd-tag{display:inline-block;margin-left:6px;padding:0 8px;border:2px solid #1B2A49;border-radius:999px;font-size:13px;font-weight:700;line-height:1.4;vertical-align:middle;white-space:nowrap}',
    '.cd-t1{background:#CFE6FF}',
    '.cd-t2{background:#E2D6FF}',
    '.cd-t3{background:#FFE9A8}',
    '.cd-shake{animation:cd-shake .45s}',
    '@keyframes cd-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}',
    '@media (max-width:900px),(max-height:560px){.cd-title{font-size:24px}.cd-bar .btn{height:50px;font-size:17px}.cd-lbl{font-size:16px}.cd-ov{gap:8px;padding:8px}' +
      '.cd-buy{padding:6px 10px;border-width:3px}.cd-buy-txt{font-size:15px}.cd-buy-name b{font-size:17px}.cd-buy-sum{font-size:18px}.cd-buy .btn{font-size:17px;border-width:3px}}',
    '@media (orientation:portrait) and (max-width:700px){.cd-ov{flex-direction:column}.cd-left{flex:0 0 46%}.cd-side{flex:1 1 auto}}'
  ].join('\n');
  var RARE_NAMES = ['', 'Rare', 'Epic', 'Legendary'];
  var LOCKABLE = ['body', 'decal', 'wheel', 'spoiler', 'extra']; // the option groups the shop can lock
  var current = null;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function sfx(name) { try { if (window.Sfx && typeof window.Sfx.play === 'function') window.Sfx.play(name); } catch (e) {} }

  function open(design, onSave, opts) {
    if (current) current.close();
    if (!document.getElementById('cd-style')) { var stl = el('style'); stl.id = 'cd-style'; stl.textContent = CSS; document.head.appendChild(stl); }
    var d = norm(design), driver = (opts && isHex(opts.driver)) ? opts.driver : '#FF7A45';
    // The shop is optional. Without it every option is free, as before.
    var shop = (opts && opts.shop && opts.shop.items && typeof opts.shop.state === 'function') ? opts.shop : null;
    var kind = (shop && shop.kind) ? String(shop.kind) : 'car';
    var st = null;        // { coins, lv, owned } read again from the game at every refresh
    var bought = {};      // bought during this visit (the game's own list can arrive a moment later)
    var lastOk = {};      // per option group: the last choice the player really has
    var focusKey = null;  // which tried-on locked option the buy bar is about
    var barMsg = '', buying = null, cheerUntil = 0, cheerHtml = '', lastSig = '', lastPoll = 0;

    var ov = el('div', 'cd-ov'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Car Garage');
    var left = el('div', 'cd-left'), side = el('div', 'cd-side'), right = el('div', 'cd-right');
    var stage = el('div', 'cd-stage'), cv = el('canvas', 'cd-cv'), bar = el('div', 'cd-bar');
    cv.setAttribute('aria-label', 'Your car');
    left.appendChild(el('h2', 'cd-title', 'Car Garage'));
    stage.appendChild(cv); left.appendChild(stage); left.appendChild(bar);
    side.appendChild(right);
    ov.appendChild(left); ov.appendChild(side);

    var refreshers = [], raf = 0, closed = false;
    var back = el('button', 'btn', 'Back'), rnd = el('button', 'btn', 'Surprise me'), done = el('button', 'btn primary', 'Done');
    back.type = rnd.type = done.type = 'button';

    // ----- shop helpers -----
    function readState() {
      var s = null, owned = {}, i;
      try { s = shop.state(); } catch (e) {}
      s = s || {};
      if (Array.isArray(s.owned)) { for (i = 0; i < s.owned.length; i++) owned[s.owned[i]] = true; }
      else if (s.owned && typeof s.owned === 'object') owned = s.owned;
      return { coins: Math.max(0, Math.floor(+s.coins || 0)), lv: Math.max(1, Math.floor(+s.lv || 1)), owned: owned };
    }
    function sig(s) { return s.coins + '|' + s.lv + '|' + Object.keys(s.owned).length; }
    function idOf(key, value) { return kind + '.' + key + '.' + value; }
    function itemOf(key, value) { return (shop && typeof value === 'number') ? (shop.items[idOf(key, value)] || null) : null; }
    function locked(key, value) {
      var id = idOf(key, value);
      return !!itemOf(key, value) && !(st && st.owned[id]) && !bought[id];
    }
    function lockedKeys() { var out = [], i; for (i = 0; i < LOCKABLE.length; i++) if (locked(LOCKABLE[i], d[LOCKABLE[i]])) out.push(LOCKABLE[i]); return out; }
    function badgeText(it) {
      if (it.chest) return '🎁';
      return st.lv >= (+it.lv || 1) ? '⭐ ' + (+it.cost || 0) : 'Lv ' + it.lv;
    }
    function nameHtml(it) {
      return '<b>' + esc(it.en) + '</b> · ' + esc(it.zh) + ' <span class="py">' + esc(it.py) + '</span> · ' + esc(it.ms) +
        (it.rare ? ' <span class="cd-tag cd-t' + it.rare + '">' + RARE_NAMES[it.rare] + '</span>' : '');
    }

    var buyBar = null, barTxt = null, buyBtn = null, offBtn = null;
    if (shop) {
      st = readState(); lastSig = sig(st);
      // never start with something the player does not have
      (function () { var i, k, def = defaults(); for (i = 0; i < LOCKABLE.length; i++) { k = LOCKABLE[i]; if (locked(k, d[k])) d[k] = def[k]; } })();
      buyBar = el('div', 'cd-buy'); buyBar.setAttribute('aria-live', 'polite'); buyBar.style.display = 'none';
      barTxt = el('div', 'cd-buy-txt');
      var barBtns = el('div', 'cd-buy-btns');
      offBtn = el('button', 'btn', 'Put back'); offBtn.type = 'button';
      buyBtn = el('button', 'btn primary', 'Buy'); buyBtn.type = 'button';
      barBtns.appendChild(offBtn); barBtns.appendChild(buyBtn);
      buyBar.appendChild(barTxt); buyBar.appendChild(barBtns);
      side.appendChild(buyBar);
      offBtn.addEventListener('click', function () {
        sfx('tap');
        if (focusKey && locked(focusKey, d[focusKey])) d[focusKey] = lastOk[focusKey];
        barMsg = ''; refresh();
      });
      buyBtn.addEventListener('click', doBuy);
    }
    LOCKABLE.forEach(function (k) { lastOk[k] = d[k]; });

    function renderBar() {
      if (!shop) return;
      var keys = lockedKeys(), key, it, html, cost, need, canBuy = false;
      if (!keys.length) {
        done.textContent = 'Done'; done.classList.remove('cd-dis');
        if (Date.now() < cheerUntil) { barTxt.innerHTML = cheerHtml; buyBtn.style.display = 'none'; offBtn.style.display = 'none'; buyBar.style.display = ''; }
        else buyBar.style.display = 'none';
        return;
      }
      key = keys.indexOf(focusKey) >= 0 ? focusKey : keys[0]; focusKey = key;
      it = itemOf(key, d[key]); cost = +it.cost || 0; need = +it.lv || 1;
      html = '<div class="cd-buy-name">' + nameHtml(it) + '</div>';
      if (it.chest) html += '<div class="cd-buy-info">🎁 Find it in the daily chest.</div>';
      else if (st.lv < need) html += '<div class="cd-buy-info">🔒 Reach level ' + need + ' to buy it. You are level ' + st.lv + '.</div>';
      else if (st.coins < cost) {
        html += '<div class="cd-buy-info">It costs ⭐ ' + cost + '. You have ⭐ ' + st.coins + '.</div>' +
          '<div class="cd-buy-sum">' + cost + ' − ' + st.coins + ' = ' + (cost - st.coins) + ' more ⭐ to find</div>';
      } else {
        canBuy = true;
        html += '<div class="cd-buy-sum">⭐ ' + st.coins + ' − ' + cost + ' = ' + (st.coins - cost) + ' left</div>';
      }
      if (keys.length > 1) html += '<div class="cd-buy-info">And ' + (keys.length - 1) + ' more to buy or put back.</div>';
      if (barMsg) html += '<div class="cd-buy-msg">' + esc(barMsg) + '</div>';
      barTxt.innerHTML = html;
      buyBtn.style.display = canBuy ? '' : 'none';
      buyBtn.disabled = !!buying; buyBtn.textContent = buying ? 'Buying…' : 'Buy ⭐ ' + cost;
      offBtn.style.display = '';
      buyBar.style.display = '';
      done.textContent = '🔒 Done'; done.classList.add('cd-dis');
    }
    function nudge() { // Done was tapped while something not owned is still on the car
      barMsg = 'Buy it first, or tap Put back.';
      renderBar(); sfx('deny');
      buyBar.classList.remove('cd-shake'); void buyBar.offsetWidth; buyBar.classList.add('cd-shake');
    }
    function doBuy() {
      var key = focusKey, value = key ? d[key] : null, it = key ? itemOf(key, value) : null, id, timer;
      if (buying || !it || !locked(key, value)) return;
      id = idOf(key, value);
      buying = id; barMsg = ''; renderBar();
      timer = setTimeout(function () {
        if (buying !== id) return;
        buying = null; barMsg = 'No answer yet. Try again.';
        if (!closed) renderBar();
      }, 6000);
      function answer(ok, why) {
        clearTimeout(timer);
        if (buying === id) buying = null;
        if (closed) return;
        if (ok || why === 'owned') {
          bought[id] = true;
          if (d[key] === value) lastOk[key] = value;
          barMsg = '';
          cheerHtml = '<div class="cd-buy-name">🎉 ' + nameHtml(it) + '</div><div class="cd-buy-sum">It is yours now!</div>';
          cheerUntil = Date.now() + 2400;
          setTimeout(function () { if (!closed) renderBar(); }, 2500);
          sfx('buy');
        } else {
          barMsg = why === 'stars' ? 'Not enough stars yet.' : why === 'level' ? 'Your level is not high enough yet.' :
            why === 'chest' ? 'This one comes from the daily chest.' : 'That did not work. Try again.';
          sfx('deny');
        }
        refresh();
      }
      try {
        if (typeof shop.buy !== 'function') throw new Error('no buy');
        shop.buy(id, answer);
      } catch (e) { answer(false, 'unknown'); }
    }
    // keep the tapped button in view when the buy bar opens under the list
    function reveal(btn) {
      var r = right.getBoundingClientRect(), q = btn.getBoundingClientRect();
      if (q.bottom > r.bottom - 6) right.scrollTop += q.bottom - r.bottom + 12;
    }

    function refresh() {
      if (shop) { st = readState(); lastSig = sig(st); }
      for (var i = 0; i < refreshers.length; i++) refreshers[i]();
      renderBar();
    }
    function group(title) { right.appendChild(el('div', 'cd-lbl', title)); var row = el('div', 'cd-row'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', title); right.appendChild(row); return row; }
    function mark(b, on) { if (on) b.classList.add('on'); else b.classList.remove('on'); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    function bind(b, key, val) {
      var it = itemOf(key, val), bdg = null;
      b.type = 'button';
      if (it) {
        if (it.rare) b.classList.add('cd-r' + it.rare);
        bdg = el('span', 'cd-bdg'); bdg.style.display = 'none'; b.appendChild(bdg);
      }
      b.addEventListener('click', function () {
        sfx('tap');
        d[key] = val; barMsg = '';
        if (locked(key, val)) focusKey = key; else if (key in lastOk) lastOk[key] = val;
        refresh();
        if (it) reveal(b);
      });
      refreshers.push(function () {
        mark(b, d[key] === val);
        if (bdg) {
          var lk = locked(key, val);
          bdg.textContent = lk ? badgeText(it) : ''; bdg.style.display = lk ? '' : 'none';
        }
      });
    }
    function chips(title, key, names) {
      var row = group(title);
      names.forEach(function (n, i) { var b = el('button', 'chip', n); bind(b, key, i); row.appendChild(b); });
    }
    function swatches(title, key, list) {
      var row = group(title);
      list.forEach(function (col) { var b = el('button', 'sw'); b.style.background = col; b.setAttribute('aria-label', title + ' ' + col); bind(b, key, col); row.appendChild(b); });
    }
    function pics(title, key, names, cw, ch, paint) {
      var row = group(title);
      names.forEach(function (n, i) {
        var b = el('button', 'cd-pic'), c = el('canvas');
        c.width = cw * 2; c.height = ch * 2; c.style.width = cw + 'px'; c.style.height = ch + 'px'; c.setAttribute('aria-hidden', 'true');
        b.appendChild(c); b.appendChild(el('span', '', n)); bind(b, key, i); row.appendChild(b);
        refreshers.push(function () { var x = c.getContext('2d'); x.setTransform(2, 0, 0, 2, 0, 0); x.clearRect(0, 0, cw, ch); paint(x, i, cw, ch); });
      });
    }

    pics('Car', 'body', BODIES.map(function (b) { return b.name; }), 92, 58, function (x, i, w, h) {
      var m = norm(d); m.body = i; m.extra = 0; draw(x, w / 2, h - 5, m, { scale: 0.6 });
    });
    swatches('Colour', 'color', COLORS);
    swatches('Second colour', 'color2', COLORS);
    chips('Sticker', 'decal', DECALS);
    pics('Wheels', 'wheel', WHEELS, 56, 46, function (x, i, w, h) {
      x.save(); x.translate(0, h / 2 + 19); x.lineJoin = 'round'; x.lineCap = 'round'; drawWheel(x, w / 2, 19, i, d.wheelColor, 0.5); x.restore();
    });
    swatches('Wheel colour', 'wheelColor', RIMS);
    chips('Spoiler', 'spoiler', SPOILERS);
    chips('Number', 'num', ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    chips('Extra', 'extra', EXTRAS);

    function close() {
      if (closed) return; closed = true;
      if (raf) cancelAnimationFrame(raf); raf = 0;
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      if (current && current.close === close) current = null;
    }
    back.addEventListener('click', function () { sfx('tap'); close(); });
    rnd.addEventListener('click', function () {
      function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
      function ri(n) { return Math.floor(Math.random() * n); }
      // only options the player may use (everything, when there is no shop)
      function free(key, n) { var ok = [], i; for (i = 0; i < n; i++) if (!locked(key, i)) ok.push(i); return ok.length ? pick(ok) : defaults()[key]; }
      sfx('tap');
      d.body = free('body', BODIES.length); d.color = pick(COLORS); do { d.color2 = pick(COLORS); } while (d.color2 === d.color);
      d.decal = free('decal', DECALS.length); d.wheel = free('wheel', WHEELS.length); d.wheelColor = pick(RIMS); d.spoiler = free('spoiler', SPOILERS.length); d.num = ri(10); d.extra = free('extra', EXTRAS.length);
      LOCKABLE.forEach(function (k) { lastOk[k] = d[k]; });
      barMsg = '';
      refresh();
    });
    done.addEventListener('click', function () {
      if (shop) { st = readState(); if (lockedKeys().length) { nudge(); return; } }
      sfx('tap');
      var out = norm(d); close(); if (typeof onSave === 'function') onSave(out);
    });
    bar.appendChild(back); bar.appendChild(rnd); bar.appendChild(done);

    var cx = cv.getContext('2d'), t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    function frame(now) {
      if (closed) return;
      raf = requestAnimationFrame(frame);
      // stars, level or owned items can change while the garage is open (a quest reward, the server's answer)
      if (shop && (now || 0) - lastPoll > 400) { lastPoll = now || 0; if (sig(readState()) !== lastSig) refresh(); }
      var w = stage.clientWidth, h = stage.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
      if (w < 2 || h < 2) return;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      var t = ((now || Date.now()) - t0) / 1000, gy = Math.round(h * 0.76), s = Math.min(w / 205, (gy - 12) / 104), i, off;
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx.fillStyle = '#BDE9FF'; cx.fillRect(0, 0, w, h);
      cx.fillStyle = '#FFE27A'; cx.beginPath(); cx.arc(w * 0.86, h * 0.16, Math.min(w, h) * 0.07, 0, TAU); cx.fill();
      cx.fillStyle = '#9BDDA4'; off = (t * 30) % (w * 0.7);
      for (i = -1; i < 3; i++) { cx.beginPath(); cx.ellipse(i * w * 0.7 + w * 0.3 - off, gy, w * 0.34, h * 0.2, 0, Math.PI, 0); cx.fill(); }
      cx.fillRect(0, gy - h * 0.06, w, h * 0.06 + 2);
      cx.fillStyle = '#5B6275'; cx.fillRect(0, gy - 2 * s, w, h);
      cx.fillStyle = NAVY; cx.fillRect(0, gy - 2 * s - 3, w, 4);
      cx.fillStyle = '#FFFFFF'; off = (t * 260) % 90;
      for (i = -1; i < w / 90 + 1; i++) cx.fillRect(i * 90 + 90 - off, gy + (h - gy) * 0.5, 46, 6);
      draw(cx, w / 2, gy, d, { scale: s, t: t, moving: true, driver: driver });
    }

    current = { close: close };
    document.body.appendChild(ov);
    refresh();
    raf = requestAnimationFrame(frame);
  }

  window.CarDesigner = { defaults: defaults, draw: draw, open: open };
})();
