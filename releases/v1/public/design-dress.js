// Dress-Up Boutique: design a princess-style character.
// window.DressDesigner = { defaults(), draw(ctx, x, y, design, opts), open(design, onSave) }
(function () {
  'use strict';

  var OUT = '#1B2A49', LW = 2.4, TAU = Math.PI * 2;
  var SKINS = ['#FFE3CC', '#F7CFA6', '#E0AC7A', '#B57F52', '#7D5438'];
  var HAIR_COLS = ['#2B1B12', '#5A3418', '#9A5B2A', '#D99A3F', '#F6D04D', '#E0447F', '#9B6BFF', '#3B82F6', '#F3EEE2'];
  var DRESS_COLS = ['#FF8FB8', '#E0447F', '#FF4F6D', '#FF7A45', '#FFD66B', '#7BD389', '#5ED6C4', '#3B82F6', '#9B6BFF', '#FFFFFF'];
  var TRIM_COLS = ['#FFD66B', '#FFFFFF', '#FF8FB8', '#E0447F', '#9B6BFF', '#3B82F6', '#5ED6C4', '#7BD389', '#FF7A45', '#1B2A49'];
  var SHOE_COLS = ['#FF4F9A', '#FF4F6D', '#FFD66B', '#FFFFFF', '#5ED6C4', '#3B82F6', '#9B6BFF', '#1B2A49'];
  var RANGES = { hair: 6, skin: 5, head: 5, dress: 6, back: 3, item: 4 };
  var COLOR_KEYS = ['hairColor', 'dressColor', 'trimColor', 'shoeColor'];

  function defaults() {
    return { hair: 0, hairColor: '#5A3418', skin: 1, head: 1, dress: 0, dressColor: '#FF8FB8', trimColor: '#FFD66B', back: 0, item: 1, shoeColor: '#FF4F9A' };
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
    } else { // flower
      petals(ctx, -13, -85, t2);
    }
    ctx.restore();
  }
  function drawItem(ctx, d) {
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
    drawItem(ctx, d);
    ctx.restore();
  }

  // ---------- designer screen ----------
  var CSS = '' +
    '.dd-ov{position:fixed;left:0;top:0;right:0;bottom:0;z-index:30;background:#FFF3D6;color:#1B2A49;display:flex;gap:12px;padding:12px;box-sizing:border-box;font-family:inherit;touch-action:none}' +
    '.dd-ov *{box-sizing:border-box}' +
    '.dd-left{flex:none;width:36%;min-width:250px;max-width:470px;display:flex;flex-direction:column;gap:8px}' +
    '.dd-title{margin:0;font-size:30px;line-height:1.1;font-weight:700}' +
    '.dd-stage{flex:1;min-height:0;position:relative;background:#FFE3EE;border:4px solid #1B2A49;border-radius:24px;overflow:hidden}' +
    '.dd-prev{position:absolute;left:0;top:0;width:100%;height:100%;display:block}' +
    '.dd-acts{display:flex;gap:8px}' +
    '.dd-btn{flex:1;min-width:0;height:54px;padding:0 10px;border-radius:999px;border:4px solid #1B2A49;background:#fff;color:#1B2A49;font-family:inherit;font-size:20px;font-weight:700;cursor:pointer;white-space:nowrap}' +
    '.dd-btn.dd-pri{background:#FFD66B}' +
    '.dd-btn:active,.dd-th:active,.dd-sw:active{transform:scale(.95)}' +
    '.dd-right{flex:1;min-width:0;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;display:flex;flex-direction:column;gap:10px;padding-right:4px}' +
    '.dd-grp{flex:none;background:#fff;border:3px solid #1B2A49;border-radius:20px;padding:8px 12px 12px}' +
    '.dd-lbl{margin:0 0 6px;font-size:18px;font-weight:700}' +
    '.dd-row{display:flex;flex-wrap:wrap;gap:10px;padding:2px}' +
    '.dd-th{width:66px;height:70px;padding:0;border-radius:16px;border:3px solid #1B2A49;background:#EEF8FF;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
    '.dd-th canvas{width:56px;height:60px;display:block;pointer-events:none}' +
    '.dd-th.dd-on{background:#FFD66B;box-shadow:0 0 0 3px #1B2A49}' +
    '.dd-sw{width:48px;height:48px;border-radius:50%;border:3px solid #1B2A49;padding:0;cursor:pointer}' +
    '.dd-sw.dd-on{outline:4px solid #1B2A49;outline-offset:3px}' +
    '@media (max-height:560px),(max-width:860px){.dd-ov{gap:8px;padding:8px}.dd-title{font-size:22px}.dd-btn{height:48px;font-size:17px;border-width:3px}.dd-left{gap:6px}.dd-lbl{font-size:16px}}' +
    '@media (orientation:portrait) and (max-width:700px){.dd-ov{flex-direction:column}.dd-left{width:auto;max-width:none;height:46%}}';

  var GROUPS = [
    { key: 'hair', label: 'Hair', view: 'head', names: ['Long', 'Pigtails', 'Bun', 'Bob', 'Curly', 'Ponytail'] },
    { key: 'hairColor', label: 'Hair colour', colors: HAIR_COLS },
    { key: 'skin', label: 'Skin', skins: true },
    { key: 'head', label: 'On top', view: 'head', names: ['Nothing', 'Crown', 'Tiara', 'Bow', 'Flower'] },
    { key: 'dress', label: 'Dress', view: 'body', names: ['Ball gown', 'A-line dress', 'Fairy dress', 'Mermaid dress', 'Sporty outfit', 'Ruffle dress'] },
    { key: 'dressColor', label: 'Dress colour', colors: DRESS_COLS },
    { key: 'trimColor', label: 'Second colour', colors: TRIM_COLS },
    { key: 'back', label: 'Wings or cape', view: 'body', names: ['Nothing', 'Fairy wings', 'Cape'] },
    { key: 'item', label: 'In hand', view: 'body', names: ['Nothing', 'Star wand', 'Flower', 'Teddy'] },
    { key: 'shoeColor', label: 'Shoes', colors: SHOE_COLS }
  ];

  var current = null; // the open designer, if any

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function randomDesign() {
    var o = {}, k;
    for (k in RANGES) o[k] = Math.floor(Math.random() * RANGES[k]);
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

  function open(design, onSave) {
    close();
    if (!document.getElementById('dd-style')) {
      var st = document.createElement('style'); st.id = 'dd-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    var d = norm(design);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var root = el('div', 'dd-ov'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Dress-Up Boutique');
    var left = el('div', 'dd-left'), right = el('div', 'dd-right');
    var stage = el('div', 'dd-stage'), prev = el('canvas', 'dd-prev');
    prev.setAttribute('aria-label', 'Your character');
    stage.appendChild(prev);
    var surprise = el('button', 'dd-btn', 'Surprise me'); surprise.type = 'button';
    var back = el('button', 'dd-btn', 'Back'); back.type = 'button';
    var done = el('button', 'dd-btn dd-pri', 'Done'); done.type = 'button';
    var acts1 = el('div', 'dd-acts'), acts2 = el('div', 'dd-acts');
    acts1.appendChild(surprise); acts2.appendChild(back); acts2.appendChild(done);
    left.appendChild(el('h2', 'dd-title', 'Dress-Up Boutique')); left.appendChild(stage); left.appendChild(acts1); left.appendChild(acts2);
    root.appendChild(left); root.appendChild(right);

    var buttons = []; // {btn, key, value, canvas?}
    GROUPS.forEach(function (g) {
      var grp = el('div', 'dd-grp'), row = el('div', 'dd-row'), lblId = 'dd-lbl-' + g.key, lbl = el('p', 'dd-lbl', g.label), i, b, c;
      lbl.id = lblId; row.setAttribute('role', 'group'); row.setAttribute('aria-labelledby', lblId);
      function add(btn, value, canvas) {
        btn.type = 'button';
        btn.addEventListener('click', function () { d[g.key] = value; refresh(); });
        buttons.push({ btn: btn, key: g.key, value: value, canvas: canvas, view: g.view });
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
      buttons.forEach(function (o) {
        var on = String(d[o.key]).toLowerCase() === String(o.value).toLowerCase();
        if (on) o.btn.classList.add('dd-on'); else o.btn.classList.remove('dd-on');
        o.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (o.canvas) {
          var c = o.canvas.getContext('2d'), v = copy(d);
          v[o.key] = o.value;
          c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, 56, 60);
          if (o.view === 'head') draw(c, 28, 91, v, { scale: 0.8 }); else draw(c, 28, 57, v, { scale: 0.5 });
        }
      });
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
      current.raf = requestAnimationFrame(frame);
    }

    surprise.addEventListener('click', function () { d = randomDesign(); refresh(); });
    back.addEventListener('click', function () { close(); });
    done.addEventListener('click', function () {
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
