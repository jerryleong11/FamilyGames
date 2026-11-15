// Dress-Up Boutique: design a princess-style character.
// window.DressDesigner = { defaults(), draw(ctx, x, y, design, opts), open(design, onSave, opts) }
// open() takes opts.shop = { kind, items, state(), buy(id, cb) } from the game: options listed in the shop
// catalogue are locked until bought (or found in the daily chest). Without opts.shop everything is free.
(function () {
  'use strict';

  var OUT = '#1B2A49', LW = 2.4, TAU = Math.PI * 2;
  var SKINS = ['#FFE3CC', '#F7CFA6', '#E0AC7A', '#B57F52', '#7D5438'];
  var HAIR_COLS = ['#2B1B12', '#5A3418', '#9A5B2A', '#D99A3F', '#F6D04D', '#E0447F', '#9B6BFF', '#3B82F6', '#F3EEE2'];
  var DRESS_COLS = ['#FF8FB8', '#E0447F', '#FF4F6D', '#FF7A45', '#FFD66B', '#7BD389', '#5ED6C4', '#3B82F6', '#9B6BFF', '#FFFFFF'];
  var TRIM_COLS = ['#FFD66B', '#FFFFFF', '#FF8FB8', '#E0447F', '#9B6BFF', '#3B82F6', '#5ED6C4', '#7BD389', '#FF7A45', '#1B2A49'];
  var SHOE_COLS = ['#FF4F9A', '#FF4F6D', '#FFD66B', '#FFFFFF', '#5ED6C4', '#3B82F6', '#9B6BFF', '#1B2A49'];
  var RANGES = { hair: 6, skin: 5, head: 6, dress: 6, back: 4, item: 5 };
  var COLOR_KEYS = ['hairColor', 'dressColor', 'trimColor', 'shoeColor'];
  var RAINBOW = ['#FF4F6D', '#FF9F43', '#FFD66B', '#7BD389', '#5AA9FF', '#9B6BFF'];

  // Only options that are free for everyone (see dev/shop.js): bow, A-line dress, nothing on the back, flower.
  function defaults() {
    return { hair: 0, hairColor: '#5A3418', skin: 1, head: 3, dress: 1, dressColor: '#FF8FB8', trimColor: '#FFD66B', back: 0, item: 2, shoeColor: '#FF4F9A' };
  }
  function isHex(v) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v); }
  function norm(d) {
    var o = defaults(), k, v;
    if (!d || typeof d !== 'object') return o;
    for (k in RANGES) {
      v = d[k];
      if (v !== null && v !== undefined && v !== '') {
        v = +v;
        if (v === Math.floor(v) && v >= 0 && v < RANGES[k]) o[k] = v;
      }
    }
    COLOR_KEYS.forEach(function (key) { if (isHex(d[key])) o[key] = d[key]; });
    return o;
  }

  // ---------- drawing helpers ----------
  function fs(ctx, fill, lw) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.lineWidth = lw || LW; ctx.strokeStyle = OUT; ctx.stroke();
  }
  function circ(ctx, x, y, r, fill, lw) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); fs(ctx, fill, lw); }
  function oval(ctx, x, y, rx, ry, rot, fill, lw) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); fs(ctx, fill, lw); }
  function limb(ctx, x1, y1, x2, y2, col, w) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = OUT; ctx.lineWidth = w + LW * 2; ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  }
  function star(ctx, x, y, ro, ri, fill) {
    var i, a, r;
    ctx.beginPath();
    for (i = 0; i < 10; i++) {
      a = -Math.PI / 2 + i * Math.PI / 5; r = i % 2 ? ri : ro;
      if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath(); fs(ctx, fill, 2);
  }
  function petals(ctx, x, y, fill) {
    var i, a;
    for (i = 0; i < 5; i++) { a = -Math.PI / 2 + i * TAU / 5; circ(ctx, x + Math.cos(a) * 4.4, y + Math.sin(a) * 4.4, 3.4, fill, 1.8); }
    circ(ctx, x, y, 2.8, '#FFD66B', 1.8);
  }
  // scalloped edge from (x1,y) to (x2,y), n bumps hanging down by `dip`
  function scallops(ctx, x1, x2, y, n, dip) {
    var i, w = (x2 - x1) / n;
    for (i = 0; i < n; i++) ctx.quadraticCurveTo(x1 + w * (i + 0.5), y + dip * 2, x1 + w * (i + 1), y);
  }

  // ---------- behind the body ----------
  function drawBack(ctx, d, t) {
    if (d.back === 1) {
      var flap = Math.sin(t * 6) * 0.07;
      [-1, 1].forEach(function (sd) {
        ctx.save(); ctx.scale(sd, 1);
        oval(ctx, 23, -56, 17, 10.5, -0.5 + flap, '#E9F9FF');
        oval(ctx, 19, -38, 11.5, 7.5, 0.45 - flap, '#D2F0FF');
        ctx.beginPath(); ctx.moveTo(13, -50); ctx.lineTo(31, -61); ctx.lineWidth = 1.4; ctx.strokeStyle = '#8CCBE8'; ctx.stroke();
        ctx.restore();
      });
    } else if (d.back === 2) {
      ctx.beginPath();
      ctx.moveTo(-11, -49); ctx.lineTo(11, -49);
      ctx.quadraticCurveTo(31, -32, 33, -10); ctx.quadraticCurveTo(0, -2, -33, -10); ctx.quadraticCurveTo(-31, -32, -11, -49);
      ctx.closePath(); fs(ctx, d.trimColor);
    } else if (d.back === 3) { // butterfly wings (legendary)
      var fl = Math.sin(t * 5) * 0.09;
      [-1, 1].forEach(function (sd) {
        ctx.save(); ctx.scale(sd, 1);
        oval(ctx, 26, -59, 21, 14, -0.55 + fl, '#B98CFF');
        oval(ctx, 21, -35, 13.5, 10, 0.5 - fl, '#5ED6C4');
        oval(ctx, 28, -60, 11, 6.5, -0.55 + fl, '#FF8FB8', 1.6);
        circ(ctx, 37, -67, 2.6, '#FFD66B', 1.4);
        circ(ctx, 23.5, -34, 3.4, '#FFFFFF', 1.4);
        ctx.restore();
      });
    }
  }
  function drawBackHair(ctx, d) {
    var c = d.hairColor, i, a, pts;
    if (d.hair === 0) { // long
      ctx.beginPath(); ctx.moveTo(-22, -70); ctx.quadraticCurveTo(-28, -50, -24, -33); ctx.quadraticCurveTo(0, -27, 24, -33); ctx.quadraticCurveTo(28, -50, 22, -70); ctx.closePath(); fs(ctx, c);
    } else if (d.hair === 1) { // pigtails
      oval(ctx, -26, -55, 7.5, 13.5, 0.28, c); oval(ctx, 26, -55, 7.5, 13.5, -0.28, c);
    } else if (d.hair === 2) { // bun
      circ(ctx, 0, -91, 8.5, c);
    } else if (d.hair === 3) { // bob
      ctx.beginPath(); ctx.moveTo(-23, -72); ctx.quadraticCurveTo(-29, -56, -23, -45); ctx.lineTo(23, -45); ctx.quadraticCurveTo(29, -56, 23, -72); ctx.closePath(); fs(ctx, c);
    } else if (d.hair === 4) { // curly
      pts = [[-22, -51], [22, -51]];
      for (a = 150; a <= 390; a += 30) pts.push([Math.cos(a * Math.PI / 180) * 19.5, -68 + Math.sin(a * Math.PI / 180) * 19.5]);
      ctx.strokeStyle = OUT; ctx.lineWidth = LW * 2;
      for (i = 0; i < pts.length; i++) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], 7.6, 0, TAU); ctx.stroke(); }
      ctx.fillStyle = c;
      for (i = 0; i < pts.length; i++) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], 7.6, 0, TAU); ctx.fill(); }
    } else if (d.hair === 5) { // ponytail
      ctx.beginPath(); ctx.moveTo(-10, -86); ctx.quadraticCurveTo(-37, -90, -34, -62); ctx.quadraticCurveTo(-33, -48, -26, -43); ctx.quadraticCurveTo(-25, -58, -16, -70); ctx.closePath(); fs(ctx, c);
    }
  }

  // ---------- dresses: skirt part, then top part ----------
  function drawSkirt(ctx, d) {
    var c = d.dressColor, t2 = d.trimColor, i;
    if (d.dress === 0) { // ball gown
      ctx.beginPath(); ctx.moveTo(-8, -35); ctx.bezierCurveTo(-22, -34, -30, -18, -31, -6);
      scallops(ctx, -31, 31, -6, 5, 2.5);
      ctx.bezierCurveTo(30, -18, 22, -34, 8, -35); ctx.closePath(); fs(ctx, c);
      ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(-9, -6.5); ctx.quadraticCurveTo(0, -2.6, 9, -6.5); ctx.closePath(); fs(ctx, t2, 1.8);
      for (i = -2; i <= 2; i++) if (i) circ(ctx, i * 9.6 + (i > 0 ? 3 : -3), -11, 1.9, t2, 1.4);
    } else if (d.dress === 1) { // A-line
      ctx.beginPath(); ctx.moveTo(-8, -35); ctx.lineTo(-21, -9); ctx.quadraticCurveTo(0, -4, 21, -9); ctx.lineTo(8, -35); ctx.closePath(); fs(ctx, c);
      ctx.beginPath(); ctx.moveTo(-18.6, -14); ctx.quadraticCurveTo(0, -9, 18.6, -14); ctx.lineTo(21, -9); ctx.quadraticCurveTo(0, -4, -21, -9); ctx.closePath(); fs(ctx, t2, 1.8);
    } else if (d.dress === 2) { // fairy petals
      ctx.beginPath(); ctx.moveTo(-8, -35); ctx.lineTo(-23, -19);
      ctx.lineTo(-18, -10); ctx.lineTo(-13.5, -17); ctx.lineTo(-9, -8); ctx.lineTo(-4.5, -17); ctx.lineTo(0, -7); ctx.lineTo(4.5, -17); ctx.lineTo(9, -8); ctx.lineTo(13.5, -17); ctx.lineTo(18, -10);
      ctx.lineTo(23, -19); ctx.lineTo(8, -35); ctx.closePath(); fs(ctx, c);
      ctx.beginPath(); ctx.moveTo(-8, -35); ctx.lineTo(-16, -25);
      ctx.lineTo(-12, -18); ctx.lineTo(-8, -24); ctx.lineTo(-4, -17); ctx.lineTo(0, -24); ctx.lineTo(4, -17); ctx.lineTo(8, -24); ctx.lineTo(12, -18);
      ctx.lineTo(16, -25); ctx.lineTo(8, -35); ctx.closePath(); fs(ctx, t2, 1.8);
    } else if (d.dress === 3) { // mermaid
      ctx.beginPath(); ctx.moveTo(-8, -35); ctx.quadraticCurveTo(-12, -23, -7, -13); ctx.quadraticCurveTo(-12, -8, -23, -3); ctx.quadraticCurveTo(-10, 0, 0, -5); ctx.quadraticCurveTo(10, 0, 23, -3); ctx.quadraticCurveTo(12, -8, 7, -13); ctx.quadraticCurveTo(12, -23, 8, -35); ctx.closePath(); fs(ctx, c);
      ctx.beginPath(); ctx.moveTo(-7, -13); ctx.quadraticCurveTo(-12, -8, -23, -3); ctx.quadraticCurveTo(-10, 0, 0, -5); ctx.quadraticCurveTo(10, 0, 23, -3); ctx.quadraticCurveTo(12, -8, 7, -13); ctx.quadraticCurveTo(0, -10, -7, -13); ctx.closePath(); fs(ctx, t2, 1.8);
      ctx.lineWidth = 1.5; ctx.strokeStyle = t2;
      [[-3.5, -28], [3.5, -28], [0, -22], [-4, -17], [4, -17]].forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 2.6, 0.1, Math.PI - 0.1); ctx.stroke(); });
    } else if (d.dress === 4) { // sporty: trousers
      [-1, 1].forEach(function (sd) {
        ctx.beginPath(); ctx.moveTo(sd * 0.6, -26); ctx.lineTo(sd * 11, -26); ctx.lineTo(sd * 10, -5); ctx.lineTo(sd * 2, -5); ctx.closePath(); fs(ctx, t2);
      });
    } else { // tiered ruffles
      tier(ctx, -21, -8, 20, 25, c); tier(ctx, -29, -17, 14, 20, t2); tier(ctx, -36, -25, 8, 14, c);
    }
  }
  function tier(ctx, yTop, yBot, wTop, wBot, col) {
    ctx.beginPath(); ctx.moveTo(-wTop, yTop); ctx.lineTo(-wBot, yBot); scallops(ctx, -wBot, wBot, yBot, 4, 1.8); ctx.lineTo(wTop, yTop); ctx.closePath(); fs(ctx, col);
  }
  function drawTop(ctx, d) {
    var c = d.dressColor, t2 = d.trimColor;
    if (d.dress === 4) { // tunic
      ctx.beginPath(); ctx.moveTo(-10, -49); ctx.lineTo(10, -49); ctx.lineTo(13, -22); ctx.quadraticCurveTo(0, -18.5, -13, -22); ctx.closePath(); fs(ctx, c);
      ctx.beginPath(); ctx.moveTo(-10.9, -41); ctx.lineTo(10.9, -41); ctx.lineTo(11.5, -35.5); ctx.lineTo(-11.5, -35.5); ctx.closePath(); fs(ctx, t2, 1.6);
      circ(ctx, -11, -45.5, 4.8, c); circ(ctx, 11, -45.5, 4.8, c);
      return;
    }
    ctx.beginPath(); ctx.moveTo(-9.5, -49); ctx.lineTo(9.5, -49); ctx.lineTo(8, -33.5); ctx.lineTo(-8, -33.5); ctx.closePath(); fs(ctx, c);
    // waist sash
    ctx.beginPath(); ctx.moveTo(-8.6, -37.5); ctx.lineTo(8.6, -37.5); ctx.lineTo(8.2, -33); ctx.lineTo(-8.2, -33); ctx.closePath(); fs(ctx, t2, 1.6);
    if (d.dress === 0) { circ(ctx, -11, -45.5, 5.6, t2); circ(ctx, 11, -45.5, 5.6, t2); }
    else if (d.dress === 1) { oval(ctx, -4.6, -47.6, 4.6, 2.8, 0.3, t2, 1.6); oval(ctx, 4.6, -47.6, 4.6, 2.8, -0.3, t2, 1.6); }
    else if (d.dress === 2) { ctx.beginPath(); ctx.moveTo(-9.5, -49); ctx.lineTo(-5, -45); ctx.lineTo(0, -48.5); ctx.lineTo(5, -45); ctx.lineTo(9.5, -49); ctx.closePath(); fs(ctx, t2, 1.6); }
    else if (d.dress === 3) { ctx.beginPath(); ctx.moveTo(-9.5, -49); ctx.quadraticCurveTo(-5, -43, 0, -47); ctx.quadraticCurveTo(5, -43, 9.5, -49); ctx.closePath(); fs(ctx, t2, 1.6); }
    else { circ(ctx, -10.5, -46, 4.4, c); circ(ctx, 10.5, -46, 4.4, c); }
    if (d.back === 2) circ(ctx, 0, -48.5, 2.6, '#FFD66B', 1.6); // cape clasp
  }

  // ---------- head ----------
  function drawFace(ctx) {
    [-1, 1].forEach(function (sd) {
      ctx.beginPath(); ctx.ellipse(sd * 8, -65, 2.9, 3.9, 0, 0, TAU); ctx.fillStyle = OUT; ctx.fill();
      ctx.beginPath(); ctx.arc(sd * 8 + 0.9, -66.4, 1.2, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(sd * 13, -59, 3.6, 0, TAU); ctx.fillStyle = 'rgba(255,80,125,0.38)'; ctx.fill();
    });
    ctx.beginPath(); ctx.arc(0, -61.5, 5, 0.18 * Math.PI, 0.82 * Math.PI); ctx.lineWidth = 1.8; ctx.strokeStyle = OUT; ctx.stroke();
  }
  function drawFrontHair(ctx, d) {
    var c = d.hairColor, h = d.hair;
    ctx.beginPath();
    ctx.arc(0, -68, 22.4, Math.PI - 0.2, TAU + 0.2);
    ctx.lineTo(17, -63.5);
    if (h === 0 || h === 3) { ctx.quadraticCurveTo(17.5, -75.5, 10, -76.5); ctx.lineTo(-10, -76.5); ctx.quadraticCurveTo(-17.5, -75.5, -17, -63.5); }
    else if (h === 1 || h === 5) { ctx.quadraticCurveTo(18.5, -77, 9, -82); ctx.quadraticCurveTo(-1, -70, -17, -66); }
    else if (h === 2) { ctx.quadraticCurveTo(15.5, -78.5, 0, -83.5); ctx.quadraticCurveTo(-15.5, -78.5, -17, -63.5); }
    else { ctx.lineTo(17, -74); scallops(ctx, 17, -17, -74, 4, 3); ctx.lineTo(-17, -63.5); }
    ctx.closePath(); fs(ctx, c);
    ctx.beginPath(); ctx.arc(0, -68, 17.5, -2.25, -1.55); ctx.lineWidth = 2.4; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.stroke();
    if (h === 1) { circ(ctx, -21.5, -66.5, 3.3, d.trimColor, 1.8); circ(ctx, 21.5, -66.5, 3.3, d.trimColor, 1.8); }
    if (h === 5) circ(ctx, -16.5, -84, 3.3, d.trimColor, 1.8);
  }
  function drawHeadwear(ctx, d) {
    var dy = d.hair === 4 ? -3.5 : 0, t2 = d.trimColor;
    if (!d.head) return;
    ctx.save(); ctx.translate(0, dy);
    if (d.head === 1) { // crown
      ctx.beginPath(); ctx.moveTo(-11.5, -86.5); ctx.lineTo(-13.5, -99); ctx.lineTo(-6.5, -93); ctx.lineTo(0, -103); ctx.lineTo(6.5, -93); ctx.lineTo(13.5, -99); ctx.lineTo(11.5, -86.5);
      ctx.quadraticCurveTo(0, -91, -11.5, -86.5); ctx.closePath(); fs(ctx, '#FFC933');
      circ(ctx, 0, -93, 2.3, '#FF4F6D', 1.4);
      circ(ctx, -13.5, -99, 1.7, '#FFFFFF', 1.3); circ(ctx, 13.5, -99, 1.7, '#FFFFFF', 1.3); circ(ctx, 0, -103, 1.7, '#FFFFFF', 1.3);
    } else if (d.head === 2) { // tiara
      ctx.beginPath(); ctx.arc(0, -68, 21, Math.PI * 1.2, Math.PI * 1.8);
      ctx.strokeStyle = OUT; ctx.lineWidth = 6.4; ctx.stroke(); ctx.strokeStyle = '#FFC933'; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -97.5); ctx.lineTo(5, -90.5); ctx.lineTo(0, -85); ctx.lineTo(-5, -90.5); ctx.closePath(); fs(ctx, '#7FE3F2', 1.8);
      circ(ctx, -9.5, -87.6, 2, '#FFFFFF', 1.4); circ(ctx, 9.5, -87.6, 2, '#FFFFFF', 1.4);
    } else if (d.head === 3) { // bow
      ctx.save(); ctx.translate(10, -87); ctx.rotate(0.3);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-11, -7); ctx.lineTo(-10, 7); ctx.closePath(); fs(ctx, t2);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(11, -7); ctx.lineTo(10, 7); ctx.closePath(); fs(ctx, t2);
      circ(ctx, 0, 0, 3.4, t2);
      ctx.restore();
    } else if (d.head === 5) { // rainbow crown (legendary)
      var i;
      ctx.save(); rainbowCrown(ctx); ctx.clip();
      for (i = 0; i < 6; i++) { ctx.fillStyle = RAINBOW[i]; ctx.fillRect(-15.2 + i * 5.07, -110, 5.4, 26); }
      ctx.restore();
      rainbowCrown(ctx); fs(ctx, null);
      circ(ctx, -15, -101, 1.9, '#FFFFFF', 1.3); circ(ctx, 15, -101, 1.9, '#FFFFFF', 1.3);
      star(ctx, 0, -106.5, 4.8, 2.2, '#FFFFFF');
    } else { // flower
      petals(ctx, -13, -85, t2);
    }
    ctx.restore();
  }
  function rainbowCrown(ctx) {
    ctx.beginPath(); ctx.moveTo(-12.5, -86.5); ctx.lineTo(-15, -101); ctx.lineTo(-7, -94); ctx.lineTo(0, -105); ctx.lineTo(7, -94); ctx.lineTo(15, -101); ctx.lineTo(12.5, -86.5);
    ctx.quadraticCurveTo(0, -91, -12.5, -86.5); ctx.closePath();
  }
  function drawItem(ctx, d, t) {
    if (d.item === 1) {
      limb(ctx, 19, -33, 27, -55, '#FFFFFF', 1.8);
      star(ctx, 27.5, -58.5, 7.2, 3.3, '#FFD66B');
    } else if (d.item === 2) {
      limb(ctx, 19, -32, 26, -51, '#4FA05A', 1.8);
      oval(ctx, 26.5, -41, 4, 2.1, -0.7, '#7BD389', 1.5);
      petals(ctx, 26.6, -55, '#FF8FB8');
    } else if (d.item === 3) {
      var b = '#C8905A';
      circ(ctx, 18.2, -42.6, 2.6, b, 1.6); circ(ctx, 27.8, -42.6, 2.6, b, 1.6);
      oval(ctx, 23, -27.5, 5.6, 6.2, 0, b, 1.8);
      circ(ctx, 23, -37.5, 6.4, b, 1.8);
      oval(ctx, 23, -35.6, 2.9, 2.2, 0, '#F1D2A6', 1.2);
      ctx.fillStyle = OUT;
      ctx.beginPath(); ctx.arc(20.6, -39, 0.95, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(25.4, -39, 0.95, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(23, -36.3, 0.9, 0, TAU); ctx.fill();
    } else if (d.item === 4) { // magic staff (legendary)
      var tw = 0.75 + Math.sin((t || 0) * 5) * 0.25;
      limb(ctx, 16.5, -15, 26, -58, '#9B6BFF', 2.4);
      ctx.beginPath(); ctx.arc(27.2, -64.5, 7.4, 0.2 * Math.PI, 0.95 * Math.PI);
      ctx.lineWidth = 5.2; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 2.2; ctx.strokeStyle = '#FFC933'; ctx.stroke();
      circ(ctx, 27.2, -65.5, 5.8, '#7FE3F2', 2);
      ctx.beginPath(); ctx.arc(25.3, -67.5, 1.7, 0, TAU); ctx.fillStyle = '#FFFFFF'; ctx.fill();
      star(ctx, 36, -73.5, 3.6 * tw, 1.5 * tw, '#FFD66B');
      star(ctx, 19, -75, 2.8 * (1.5 - tw), 1.2 * (1.5 - tw), '#FF8FB8');
    }
  }

  // ---------- the whole character, feet at (x, y) ----------
  function draw(ctx, x, y, design, opts) {
    var d = norm(design);
    opts = opts || {};
    var s = +opts.scale > 0 ? +opts.scale : 1;
    var f = opts.facing < 0 ? -1 : 1;
    var t = +opts.t || 0;
    var mv = !!opts.moving;
    var skin = SKINS[d.skin];
    var ph = Math.sin(t * 10);
    var bob = mv ? -Math.abs(ph) * 2.6 : Math.sin(t * 2.2) * 0.9;
    var liftL = mv ? Math.max(0, ph) * 3 : 0, liftR = mv ? Math.max(0, -ph) * 3 : 0;
    var hasLegs = d.dress !== 3 && d.dress !== 4;

    ctx.save();
    ctx.translate(x, y); ctx.scale(s * f, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.globalAlpha = ctx.globalAlpha; // keep caller alpha

    ctx.beginPath(); ctx.ellipse(0, 0, 21, 4.6, 0, 0, TAU); ctx.fillStyle = 'rgba(27,42,73,0.18)'; ctx.fill();

    // shoes stay near the ground, the rest of the body bobs
    if (hasLegs) { limb(ctx, -5.5, -22 + bob, -5.5, -6 - liftL, skin, 3.6); limb(ctx, 5.5, -22 + bob, 5.5, -6 - liftR, skin, 3.6); }
    oval(ctx, -6.4, -3.6 - liftL, 6.6, 3.8, 0, d.shoeColor, 2);
    oval(ctx, 6.4, -3.6 - liftR, 6.6, 3.8, 0, d.shoeColor, 2);

    ctx.translate(0, bob);
    if (mv) ctx.rotate(ph * 0.035);
    drawBack(ctx, d, t);
    drawBackHair(ctx, d);
    drawSkirt(ctx, d);
    limb(ctx, -10, -45.5, -17, -31, skin, 3.8);
    if (d.item) limb(ctx, 10, -45.5, 19.5, -34.5, skin, 3.8); else limb(ctx, 10, -45.5, 17, -31, skin, 3.8);
    drawTop(ctx, d);
    circ(ctx, 0, -68, 20, skin);
    drawFace(ctx);
    drawFrontHair(ctx, d);
    drawHeadwear(ctx, d);
    drawItem(ctx, d, t);
    ctx.restore();
  }

  // ---------- designer screen ----------
  var CSS = '' +
    '.dd-ov{position:fixed;left:0;top:0;right:0;bottom:0;z-index:30;background:#FFF3D6;color:#1B2A49;display:flex;gap:12px;padding:12px;box-sizing:border-box;font-family:inherit;touch-action:none}' +
    '.dd-ov *{box-sizing:border-box}' +
    '.dd-ov .py{font-family:system-ui,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif}' +
    '.dd-left{flex:none;width:36%;min-width:250px;max-width:470px;display:flex;flex-direction:column;gap:8px}' +
    '.dd-title{margin:0;font-size:30px;line-height:1.1;font-weight:700}' +
    '.dd-stage{flex:1;min-height:0;position:relative;background:#FFE3EE;border:4px solid #1B2A49;border-radius:24px;overflow:hidden}' +
    '.dd-prev{position:absolute;left:0;top:0;width:100%;height:100%;display:block}' +
    '.dd-acts{display:flex;gap:8px}' +
    '.dd-btn{flex:1;min-width:0;height:54px;padding:0 10px;border-radius:999px;border:4px solid #1B2A49;background:#fff;color:#1B2A49;font-family:inherit;font-size:20px;font-weight:700;cursor:pointer;white-space:nowrap}' +
    '.dd-btn.dd-pri{background:#FFD66B}' +
    '.dd-btn.dd-dis,.dd-btn:disabled{opacity:.6}' +
    '.dd-btn:active,.dd-th:active,.dd-sw:active{transform:scale(.95)}' +
    '.dd-side{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:8px}' +
    '.dd-right{flex:1;min-width:0;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;display:flex;flex-direction:column;gap:10px;padding-right:4px}' +
    '.dd-grp{flex:none;background:#fff;border:3px solid #1B2A49;border-radius:20px;padding:8px 12px 12px}' +
    '.dd-lbl{margin:0 0 6px;font-size:18px;font-weight:700}' +
    '.dd-row{display:flex;flex-wrap:wrap;gap:10px;padding:2px}' +
    '.dd-th{position:relative;width:66px;height:70px;padding:0;border-radius:16px;border:3px solid #1B2A49;background:#EEF8FF;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
    '.dd-th canvas{width:56px;height:60px;display:block;pointer-events:none}' +
    '.dd-th.dd-r1{border-color:#5AA9FF}.dd-th.dd-r2{border-color:#9B6BFF}.dd-th.dd-r3{border-color:#FFC933}' +
    '.dd-th.dd-lock{background:#ECE7DA}' +
    '.dd-th.dd-on{background:#FFD66B;box-shadow:0 0 0 3px #1B2A49}' +
    '.dd-bdg{position:absolute;left:50%;bottom:1px;transform:translateX(-50%);background:#FFD66B;color:#1B2A49;border:2px solid #1B2A49;border-radius:999px;padding:0 6px;font-size:13px;font-weight:700;line-height:1.3;white-space:nowrap;pointer-events:none}' +
    '.dd-sw{width:48px;height:48px;border-radius:50%;border:3px solid #1B2A49;padding:0;cursor:pointer}' +
    '.dd-sw.dd-on{outline:4px solid #1B2A49;outline-offset:3px}' +
    // buy bar: sits under the option list while a locked option is being tried on
    '.dd-buy{flex:none;background:#fff;border:4px solid #1B2A49;border-radius:20px;padding:8px 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}' +
    '.dd-buy-txt{flex:1;min-width:150px;font-size:17px;font-weight:600;line-height:1.25}' +
    '.dd-buy-name b{font-size:20px}' +
    '.dd-buy-sum{font-size:20px;font-weight:700}' +
    '.dd-buy-msg{color:#B3122F}' +
    '.dd-buy-btns{display:flex;gap:8px;flex:none}' +
    '.dd-buy .dd-btn{flex:none;height:52px;padding:0 16px}' +
    '.dd-tag{display:inline-block;margin-left:6px;padding:0 8px;border:2px solid #1B2A49;border-radius:999px;font-size:13px;font-weight:700;line-height:1.4;vertical-align:middle;white-space:nowrap}' +
    '.dd-t1{background:#CFE6FF}.dd-t2{background:#E2D6FF}.dd-t3{background:#FFE9A8}' +
    '.dd-shake{animation:dd-shake .45s}' +
    '@keyframes dd-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}' +
    '@media (max-height:560px),(max-width:860px){.dd-ov{gap:8px;padding:8px}.dd-title{font-size:22px}.dd-btn{height:48px;font-size:17px;border-width:3px}.dd-left{gap:6px}.dd-lbl{font-size:16px}' +
      '.dd-buy{padding:6px 10px;border-width:3px}.dd-buy-txt{font-size:15px}.dd-buy-name b{font-size:17px}.dd-buy-sum{font-size:18px}}' +
    '@media (orientation:portrait) and (max-width:700px){.dd-ov{flex-direction:column}.dd-left{width:auto;max-width:none;height:46%}}';

  var GROUPS = [
    { key: 'hair', label: 'Hair', view: 'head', names: ['Long', 'Pigtails', 'Bun', 'Bob', 'Curly', 'Ponytail'] },
    { key: 'hairColor', label: 'Hair colour', colors: HAIR_COLS },
    { key: 'skin', label: 'Skin', skins: true },
    { key: 'head', label: 'On top', view: 'head', names: ['Nothing', 'Crown', 'Tiara', 'Bow', 'Flower', 'Rainbow crown'] },
    { key: 'dress', label: 'Dress', view: 'body', names: ['Ball gown', 'A-line dress', 'Fairy dress', 'Mermaid dress', 'Sporty outfit', 'Ruffle dress'] },
    { key: 'dressColor', label: 'Dress colour', colors: DRESS_COLS },
    { key: 'trimColor', label: 'Second colour', colors: TRIM_COLS },
    { key: 'back', label: 'Wings or cape', view: 'body', names: ['Nothing', 'Fairy wings', 'Cape', 'Butterfly wings'] },
    { key: 'item', label: 'In hand', view: 'body', names: ['Nothing', 'Star wand', 'Flower', 'Teddy', 'Magic staff'] },
    { key: 'shoeColor', label: 'Shoes', colors: SHOE_COLS }
  ];
  var RARE_NAMES = ['', 'Rare', 'Epic', 'Legendary'];

  var current = null; // the open designer, if any

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function sfx(name) { try { if (window.Sfx && typeof window.Sfx.play === 'function') window.Sfx.play(name); } catch (e) {} }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  // allowed(key, value) says whether an option may be used; without it every option may.
  function randomDesign(allowed) {
    var o = {}, k, i, ok;
    for (k in RANGES) {
      ok = [];
      for (i = 0; i < RANGES[k]; i++) if (!allowed || allowed(k, i)) ok.push(i);
      o[k] = ok.length ? pick(ok) : defaults()[k];
    }
    o.hairColor = pick(HAIR_COLS); o.dressColor = pick(DRESS_COLS); o.shoeColor = pick(SHOE_COLS);
    do { o.trimColor = pick(TRIM_COLS); } while (o.trimColor.toLowerCase() === o.dressColor.toLowerCase());
    return o;
  }
  function copy(d) { var o = {}, k; for (k in d) o[k] = d[k]; return o; }

  function close() {
    if (!current) return;
    if (current.raf) cancelAnimationFrame(current.raf);
    window.removeEventListener('resize', current.onResize);
    if (current.root.parentNode) current.root.parentNode.removeChild(current.root);
    current = null;
  }

  function open(design, onSave, opts) {
    close();
    if (!document.getElementById('dd-style')) {
      var stl = document.createElement('style'); stl.id = 'dd-style'; stl.textContent = CSS; document.head.appendChild(stl);
    }
    // The shop is optional. Without it every option is free, as before.
    var shop = (opts && opts.shop && opts.shop.items && typeof opts.shop.state === 'function') ? opts.shop : null;
    var kind = (shop && shop.kind) ? String(shop.kind) : 'outfit';
    var st = null;        // { coins, lv, owned } read again from the game at every refresh
    var bought = {};      // bought during this visit (the game's own list can arrive a moment later)
    var lastOk = {};      // per option group: the last choice the player really has
    var focusKey = null;  // which tried-on locked option the buy bar is about
    var barMsg = '', buying = null, cheerUntil = 0, cheerHtml = '', lastSig = '', lastPoll = 0;

    var d = norm(design);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var root = el('div', 'dd-ov'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Dress-Up Boutique');
    var left = el('div', 'dd-left'), side = el('div', 'dd-side'), right = el('div', 'dd-right');
    var stage = el('div', 'dd-stage'), prev = el('canvas', 'dd-prev');
    prev.setAttribute('aria-label', 'Your character');
    stage.appendChild(prev);
    var surprise = el('button', 'dd-btn', 'Surprise me'); surprise.type = 'button';
    var back = el('button', 'dd-btn', 'Back'); back.type = 'button';
    var done = el('button', 'dd-btn dd-pri', 'Done'); done.type = 'button';
    var acts1 = el('div', 'dd-acts'), acts2 = el('div', 'dd-acts');
    acts1.appendChild(surprise); acts2.appendChild(back); acts2.appendChild(done);
    left.appendChild(el('h2', 'dd-title', 'Dress-Up Boutique')); left.appendChild(stage); left.appendChild(acts1); left.appendChild(acts2);
    side.appendChild(right);
    root.appendChild(left); root.appendChild(side);

    // ----- shop helpers -----
    function alive() { return !!current && current.root === root; }
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
    function lockedKeys() { var out = [], k; for (k in RANGES) if (locked(k, d[k])) out.push(k); return out; }
    function badgeText(o) {
      if (o.item.chest) return '🎁';
      return st.lv >= (+o.item.lv || 1) ? '⭐ ' + (+o.item.cost || 0) : 'Lv ' + o.item.lv;
    }
    function nameHtml(it) {
      return '<b>' + esc(it.en) + '</b> · ' + esc(it.zh) + ' <span class="py">' + esc(it.py) + '</span> · ' + esc(it.ms) +
        (it.rare ? ' <span class="dd-tag dd-t' + it.rare + '">' + RARE_NAMES[it.rare] + '</span>' : '');
    }

    var bar = null, barTxt = null, buyBtn = null, offBtn = null;
    if (shop) {
      st = readState(); lastSig = sig(st);
      // never start with something the player does not have
      (function () { var k, def = defaults(); for (k in RANGES) if (locked(k, d[k])) d[k] = def[k]; })();
      bar = el('div', 'dd-buy'); bar.setAttribute('aria-live', 'polite'); bar.style.display = 'none';
      barTxt = el('div', 'dd-buy-txt');
      var barBtns = el('div', 'dd-buy-btns');
      offBtn = el('button', 'dd-btn', 'Take off'); offBtn.type = 'button';
      buyBtn = el('button', 'dd-btn dd-pri', 'Buy'); buyBtn.type = 'button';
      barBtns.appendChild(offBtn); barBtns.appendChild(buyBtn);
      bar.appendChild(barTxt); bar.appendChild(barBtns);
      side.appendChild(bar);
      offBtn.addEventListener('click', function () {
        sfx('tap');
        if (focusKey && locked(focusKey, d[focusKey])) d[focusKey] = lastOk[focusKey];
        barMsg = ''; refresh();
      });
      buyBtn.addEventListener('click', doBuy);
    }
    lastOk = copy(d);

    function renderBar() {
      if (!shop) return;
      var keys = lockedKeys(), key, it, html, cost, need, canBuy = false;
      if (!keys.length) {
        done.textContent = 'Done'; done.classList.remove('dd-dis');
        if (Date.now() < cheerUntil) { barTxt.innerHTML = cheerHtml; buyBtn.style.display = 'none'; offBtn.style.display = 'none'; bar.style.display = ''; }
        else bar.style.display = 'none';
        return;
      }
      key = keys.indexOf(focusKey) >= 0 ? focusKey : keys[0]; focusKey = key;
      it = itemOf(key, d[key]); cost = +it.cost || 0; need = +it.lv || 1;
      html = '<div class="dd-buy-name">' + nameHtml(it) + '</div>';
      if (it.chest) html += '<div class="dd-buy-info">🎁 Find it in the daily chest.</div>';
      else if (st.lv < need) html += '<div class="dd-buy-info">🔒 Reach level ' + need + ' to buy it. You are level ' + st.lv + '.</div>';
      else if (st.coins < cost) {
        html += '<div class="dd-buy-info">It costs ⭐ ' + cost + '. You have ⭐ ' + st.coins + '.</div>' +
          '<div class="dd-buy-sum">' + cost + ' − ' + st.coins + ' = ' + (cost - st.coins) + ' more ⭐ to find</div>';
      } else {
        canBuy = true;
        html += '<div class="dd-buy-sum">⭐ ' + st.coins + ' − ' + cost + ' = ' + (st.coins - cost) + ' left</div>';
      }
      if (keys.length > 1) html += '<div class="dd-buy-info">And ' + (keys.length - 1) + ' more to buy or take off.</div>';
      if (barMsg) html += '<div class="dd-buy-msg">' + esc(barMsg) + '</div>';
      barTxt.innerHTML = html;
      buyBtn.style.display = canBuy ? '' : 'none';
      buyBtn.disabled = !!buying; buyBtn.textContent = buying ? 'Buying…' : 'Buy ⭐ ' + cost;
      offBtn.style.display = '';
      bar.style.display = '';
      done.textContent = '🔒 Done'; done.classList.add('dd-dis');
    }
    function nudge() { // Done was tapped while something not owned is still on
      barMsg = 'Buy it first, or tap Take off.';
      renderBar(); sfx('deny');
      bar.classList.remove('dd-shake'); void bar.offsetWidth; bar.classList.add('dd-shake');
    }
    function doBuy() {
      var key = focusKey, value = key ? d[key] : null, it = key ? itemOf(key, value) : null, id, timer;
      if (buying || !it || !locked(key, value)) return;
      id = idOf(key, value);
      buying = id; barMsg = ''; renderBar();
      timer = setTimeout(function () {
        if (buying !== id) return;
        buying = null; barMsg = 'No answer yet. Try again.';
        if (alive()) renderBar();
      }, 6000);
      function answer(ok, why) {
        clearTimeout(timer);
        if (buying === id) buying = null;
        if (!alive()) return;
        if (ok || why === 'owned') {
          bought[id] = true;
          if (d[key] === value) lastOk[key] = value;
          barMsg = '';
          cheerHtml = '<div class="dd-buy-name">🎉 ' + nameHtml(it) + '</div><div class="dd-buy-sum">It is yours now!</div>';
          cheerUntil = Date.now() + 2400;
          setTimeout(function () { if (alive()) renderBar(); }, 2500);
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

    var buttons = []; // {btn, key, value, canvas?, item?, bdg?, name}
    GROUPS.forEach(function (g) {
      var grp = el('div', 'dd-grp'), row = el('div', 'dd-row'), lblId = 'dd-lbl-' + g.key, lbl = el('p', 'dd-lbl', g.label), i, b, c;
      lbl.id = lblId; row.setAttribute('role', 'group'); row.setAttribute('aria-labelledby', lblId);
      function add(btn, value, canvas) {
        var it = itemOf(g.key, value), bdg = null;
        btn.type = 'button';
        if (it) {
          if (it.rare) btn.classList.add('dd-r' + it.rare);
          bdg = el('span', 'dd-bdg'); bdg.style.display = 'none'; btn.appendChild(bdg);
        }
        btn.addEventListener('click', function () {
          sfx('tap');
          d[g.key] = value; barMsg = '';
          if (locked(g.key, value)) focusKey = g.key; else lastOk[g.key] = value;
          refresh();
          if (it) reveal(btn);
        });
        buttons.push({ btn: btn, key: g.key, value: value, canvas: canvas, view: g.view, item: it, bdg: bdg, name: btn.getAttribute('aria-label') || '' });
        row.appendChild(btn);
      }
      if (g.view) {
        for (i = 0; i < RANGES[g.key]; i++) {
          b = el('button', 'dd-th'); b.setAttribute('aria-label', g.names[i]);
          c = document.createElement('canvas'); c.width = Math.round(56 * dpr); c.height = Math.round(60 * dpr);
          b.appendChild(c); add(b, i, c);
        }
      } else if (g.skins) {
        for (i = 0; i < SKINS.length; i++) { b = el('button', 'dd-sw'); b.style.background = SKINS[i]; b.setAttribute('aria-label', 'Skin ' + (i + 1)); add(b, i); }
      } else {
        for (i = 0; i < g.colors.length; i++) { b = el('button', 'dd-sw'); b.style.background = g.colors[i]; b.setAttribute('aria-label', g.label + ' ' + (i + 1)); add(b, g.colors[i]); }
      }
      grp.appendChild(lbl); grp.appendChild(row); right.appendChild(grp);
    });

    function refresh() {
      if (shop) { st = readState(); lastSig = sig(st); }
      buttons.forEach(function (o) {
        var on = String(d[o.key]).toLowerCase() === String(o.value).toLowerCase(), lk, txt;
        if (on) o.btn.classList.add('dd-on'); else o.btn.classList.remove('dd-on');
        o.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (o.bdg) {
          lk = locked(o.key, o.value); txt = lk ? badgeText(o) : '';
          o.bdg.textContent = txt; o.bdg.style.display = lk ? '' : 'none';
          if (lk) o.btn.classList.add('dd-lock'); else o.btn.classList.remove('dd-lock');
          o.btn.setAttribute('aria-label', o.name + (lk ? ', locked, ' + txt : ''));
        }
        if (o.canvas) {
          var c = o.canvas.getContext('2d'), v = copy(d);
          v[o.key] = o.value;
          c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, 56, 60);
          if (o.view === 'head') draw(c, 28, 91, v, { scale: 0.8 }); else draw(c, 28, 57, v, { scale: 0.5 });
        }
      });
      renderBar();
    }
    function sizePrev() {
      var w = stage.clientWidth, h = stage.clientHeight;
      prev.width = Math.max(1, Math.round(w * dpr)); prev.height = Math.max(1, Math.round(h * dpr));
    }
    function frame(ts) {
      if (!current || current.root !== root) return;
      var w = stage.clientWidth, h = stage.clientHeight, c = prev.getContext('2d');
      if (w > 0 && h > 0) {
        if (prev.width !== Math.round(w * dpr) || prev.height !== Math.round(h * dpr)) sizePrev();
        var sc = Math.max(0.5, Math.min((h - 24) / 122, (w - 16) / 88));
        var fy = h - Math.max(10, h * 0.07) - 4 * sc;
        c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
        c.beginPath(); c.ellipse(w / 2, fy + 2 * sc, Math.min(w * 0.42, 46 * sc), 9 * sc, 0, 0, TAU); c.fillStyle = '#FFC4DA'; c.fill();
        draw(c, w / 2, fy, d, { scale: sc, t: (ts || 0) / 1000 });
      }
      // stars, level or owned items can change while the designer is open (a quest reward, the server's answer)
      if (shop && (ts || 0) - lastPoll > 400) { lastPoll = ts || 0; if (sig(readState()) !== lastSig) refresh(); }
      current.raf = requestAnimationFrame(frame);
    }

    surprise.addEventListener('click', function () {
      sfx('tap');
      d = randomDesign(shop ? function (k, v) { return !locked(k, v); } : null);
      lastOk = copy(d); barMsg = '';
      refresh();
    });
    back.addEventListener('click', function () { sfx('tap'); close(); });
    done.addEventListener('click', function () {
      if (shop) { st = readState(); if (lockedKeys().length) { nudge(); return; } }
      sfx('tap');
      var out = copy(d);
      close();
      if (typeof onSave === 'function') onSave(out);
    });

    document.body.appendChild(root);
    current = { root: root, raf: 0, onResize: sizePrev };
    window.addEventListener('resize', sizePrev);
    sizePrev(); refresh();
    current.raf = requestAnimationFrame(frame);
  }

  window.DressDesigner = { defaults: defaults, draw: draw, open: open };
})();
