// Pet Home (client): the pets and eggs drawn in code, the pet that follows its owner in town, and the
// Pet Home room with its stations (egg shop, incubator, food bowl, bath, play mat, trade table, my pets).
// Server side: dev/games/pets.js. Contract: docs/GAME-MODULES.md.
(function () {
  'use strict';
  var api = null, root = null;
  var TAU = Math.PI * 2, NAVY = '#1B2A49', SHADOW = 'rgba(22,48,66,0.20)';
  var PET_K = 0.8;                                  // pets are drawn a little smaller than people
  var STAGE_K = [0.7, 0.86, 1], HEAD_K = [1.13, 1.05, 1]; // baby, young, grown: size, and how big the head is

  // ---------- names (labels only, always in the three languages) ----------
  var SPECIES = [
    { id: 'puppy', r: 0, en: 'Puppy', zh: '小狗', py: 'xiǎogǒu', ms: 'Anak anjing' },
    { id: 'kitten', r: 0, en: 'Kitten', zh: '小猫', py: 'xiǎomāo', ms: 'Anak kucing' },
    { id: 'bunny', r: 0, en: 'Bunny', zh: '小兔', py: 'xiǎotù', ms: 'Arnab' },
    { id: 'chick', r: 0, en: 'Chick', zh: '小鸡', py: 'xiǎojī', ms: 'Anak ayam' },
    { id: 'turtle', r: 0, en: 'Turtle', zh: '乌龟', py: 'wūguī', ms: 'Kura-kura' },
    { id: 'fox', r: 1, en: 'Fox', zh: '狐狸', py: 'húli', ms: 'Rubah' },
    { id: 'panda', r: 1, en: 'Panda', zh: '熊猫', py: 'xióngmāo', ms: 'Panda' },
    { id: 'penguin', r: 1, en: 'Penguin', zh: '企鹅', py: 'qǐ\'é', ms: 'Penguin' },
    { id: 'owl', r: 1, en: 'Owl', zh: '猫头鹰', py: 'māotóuyīng', ms: 'Burung hantu' },
    { id: 'lion', r: 2, en: 'Lion cub', zh: '小狮子', py: 'xiǎo shīzi', ms: 'Anak singa' },
    { id: 'elephant', r: 2, en: 'Elephant', zh: '小象', py: 'xiǎoxiàng', ms: 'Anak gajah' },
    { id: 'dino', r: 2, en: 'Dino', zh: '小恐龙', py: 'xiǎo kǒnglóng', ms: 'Dinosaur' },
    { id: 'unicorn', r: 3, en: 'Unicorn', zh: '独角兽', py: 'dújiǎoshòu', ms: 'Unikorn' },
    { id: 'dragon', r: 3, en: 'Dragon', zh: '小龙', py: 'xiǎolóng', ms: 'Naga' }
  ];
  var SPI = {};
  SPECIES.forEach(function (s) { SPI[s.id] = s; });
  var RARITY = [
    { en: 'Common', zh: '普通', py: 'pǔtōng', ms: 'Biasa', col: '#8E9AAD' },
    { en: 'Rare', zh: '稀有', py: 'xīyǒu', ms: 'Jarang', col: '#3B9BFF' },
    { en: 'Epic', zh: '史诗', py: 'shǐshī', ms: 'Epik', col: '#9B6BFF' },
    { en: 'Legendary', zh: '传说', py: 'chuánshuō', ms: 'Legenda', col: '#FFB400' }
  ];
  var EGG_NAMES = [
    { en: 'Common egg', zh: '普通蛋', py: 'pǔtōng dàn', ms: 'Telur biasa' },
    { en: 'Rare egg', zh: '稀有蛋', py: 'xīyǒu dàn', ms: 'Telur jarang' },
    { en: 'Royal egg', zh: '皇家蛋', py: 'huángjiā dàn', ms: 'Telur diraja' }
  ];
  var FOOD_NAMES = [
    { en: 'Biscuit', zh: '饼干', py: 'bǐnggān', ms: 'Biskut' },
    { en: 'Fruit bowl', zh: '水果碗', py: 'shuǐguǒ wǎn', ms: 'Mangkuk buah' },
    { en: 'Cake', zh: '蛋糕', py: 'dàngāo', ms: 'Kek' }
  ];
  var TOY_NAMES = [
    { en: 'Ball', zh: '球', py: 'qiú', ms: 'Bola' },
    { en: 'Bubbles', zh: '泡泡', py: 'pàopao', ms: 'Buih' },
    { en: 'Feather', zh: '羽毛', py: 'yǔmáo', ms: 'Bulu' }
  ];
  var WASH_NAME = { en: 'Wash', zh: '洗澡', py: 'xǐzǎo', ms: 'Mandi' };
  var STAGES = [
    { en: 'Baby', zh: '宝宝', py: 'bǎobao', ms: 'Bayi' },
    { en: 'Young', zh: '少年', py: 'shàonián', ms: 'Muda' },
    { en: 'Grown', zh: '长大了', py: 'zhǎngdà le', ms: 'Dewasa' }
  ];
  var BOOK_NAME = { en: 'Pet Book', zh: '宠物图鉴', py: 'chǒngwù tújiàn', ms: 'Buku Haiwan' };

  // ---------- drawing helpers: `g` is the canvas being drawn on, `K` the pose of the pet being drawn ----------
  var g = null;
  var K = { t: 0, f: 1, sad: false, joy: false, blink: false, walk: 0, wag: 0, st: 0, hk: 1, nod: 0, lw: 3 };
  function E(x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function fill(col) { g.fillStyle = col; g.fill(); }
  function line(w) { g.lineWidth = w || K.lw; g.strokeStyle = NAVY; g.stroke(); }
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function poly(c, p) { c.beginPath(); c.moveTo(p[0], p[1]); for (var i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); }
  function starP(c, x, y, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.48 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    c.closePath();
  }
  function heartP(c, x, y, s) {
    c.beginPath(); c.moveTo(x, y + s * 0.9);
    c.bezierCurveTo(x - s * 1.5, y - s * 0.2, x - s * 0.8, y - s * 1.3, x, y - s * 0.45);
    c.bezierCurveTo(x + s * 0.8, y - s * 1.3, x + s * 1.5, y - s * 0.2, x, y + s * 0.9); c.closePath();
  }
  // a round body part with volume: lit from the top left of the screen, a darker lower right, an outline
  function ball(x, y, rx, ry, col, rot) {
    E(x, y, rx, ry, rot); fill(col);
    g.save(); g.clip();
    g.beginPath(); g.rect(x - rx - ry, y - rx - ry, (rx + ry) * 2, (rx + ry) * 2);
    g.moveTo(x - K.f * rx * 0.2 + rx, y - ry * 0.24); g.ellipse(x - K.f * rx * 0.2, y - ry * 0.24, rx, ry, 0, 0, TAU);
    g.fillStyle = 'rgba(27,42,73,0.14)'; g.fill('evenodd');
    E(x - K.f * rx * 0.42, y - ry * 0.5, rx * 0.26, ry * 0.17, -0.5 * K.f); fill('rgba(255,255,255,0.45)');
    g.restore();
    E(x, y, rx, ry, rot); line();
  }
  function part(x, y, rx, ry, col, rot) { E(x, y, rx, ry, rot); fill(col); line(K.lw * 0.85); }
  function leg(x, top, w, col) { rr(g, x - w / 2, top, w, -top, Math.min(w / 2, 5)); fill(col); line(K.lw * 0.85); }
  function tube(p, w, col) { // a thick curved line with an outline: tails, necks, trunks
    g.beginPath(); g.moveTo(p[0], p[1]); g.bezierCurveTo(p[2], p[3], p[4], p[5], p[6], p[7]);
    g.lineWidth = w + K.lw * 1.8; g.strokeStyle = NAVY; g.stroke();
    g.lineWidth = w; g.strokeStyle = col; g.stroke();
  }
  function tri(a, b, c, d, e, f, col, lw) {
    g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.lineTo(e, f); g.closePath(); fill(col);
    if (lw !== 0) line(lw || K.lw * 0.85);
  }
  function solid(path, col, inner) { // any outline shape; `inner` paints inside it
    path(); fill(col);
    if (inner) { g.save(); path(); g.clip(); inner(); g.restore(); }
    path(); line();
  }
  function shadeIn(x, y, rx, ry) { // the darker lower right, for shapes that are not a ball
    g.beginPath(); g.rect(x - rx * 2, y - ry * 2, rx * 4, ry * 4);
    g.moveTo(x - K.f * rx * 0.2 + rx, y - ry * 0.22); g.ellipse(x - K.f * rx * 0.2, y - ry * 0.22, rx, ry, 0, 0, TAU);
    g.fillStyle = 'rgba(27,42,73,0.14)'; g.fill('evenodd');
    E(x - K.f * rx * 0.42, y - ry * 0.52, rx * 0.24, ry * 0.15, -0.5 * K.f); fill('rgba(255,255,255,0.4)');
  }
  // the head turns a little with the mood, is bigger on babies, and nods while eating
  function head(px, py, fn) {
    g.save(); g.translate(px, py + (K.sad ? 2 : 0) + K.nod * 6); g.rotate(K.nod * 0.16); g.scale(K.hk, K.hk); g.translate(-px, -py);
    fn(); g.restore();
  }
  function eyes(x, y, gap, s, light) {
    var i, ex, col = light ? '#fff' : NAVY;
    for (i = -1; i <= 1; i += 2) {
      ex = x + i * gap;
      if (K.blink || K.joy) {
        g.beginPath();
        if (K.joy) { g.moveTo(ex - 3.6 * s, y + 1.4 * s); g.quadraticCurveTo(ex, y - 4.6 * s, ex + 3.6 * s, y + 1.4 * s); }
        else { g.moveTo(ex - 3.3 * s, y - 0.5 * s); g.quadraticCurveTo(ex, y + 2.6 * s, ex + 3.3 * s, y - 0.5 * s); }
        g.lineWidth = 2.3 * s; g.strokeStyle = col; g.stroke();
        continue;
      }
      if (light) { E(ex, y, 3.5 * s, 4 * s); fill('#fff'); E(ex + 0.3 * s, y + 0.4 * s, 2.1 * s, 2.5 * s); fill(NAVY); }
      else { E(ex, y, 3.3 * s, 4.3 * s); fill(NAVY); E(ex - K.f * 1.1 * s, y - 1.7 * s, 1.35 * s, 1.35 * s); fill('#fff'); }
      if (K.sad) { // worried brows
        g.beginPath(); g.moveTo(ex + i * 5 * s, y - 4.4 * s); g.lineTo(ex - i * 3 * s, y - 7.6 * s);
        g.lineWidth = 2 * s; g.strokeStyle = col; g.stroke();
      }
    }
    if (K.sad) { // a tear
      ex = x + gap + 1.5 * s;
      g.beginPath(); g.moveTo(ex, y + 5 * s); g.quadraticCurveTo(ex + 3.6 * s, y + 10.5 * s, ex, y + 11.5 * s); g.quadraticCurveTo(ex - 3.6 * s, y + 10.5 * s, ex, y + 5 * s);
      fill('#7CC8FF'); line(1.2);
    } else { // rosy cheeks
      E(x - gap - 4.5 * s, y + 6 * s, 3.8 * s, 2.3 * s); fill('rgba(255,110,150,0.42)');
      E(x + gap + 4.5 * s, y + 6 * s, 3.8 * s, 2.3 * s); fill('rgba(255,110,150,0.42)');
    }
  }
  function nose(x, y, w, col) {
    g.beginPath(); g.moveTo(x - w, y - w * 0.5); g.lineTo(x + w, y - w * 0.5); g.lineTo(x, y + w * 0.65); g.closePath();
    g.fillStyle = col; g.fill(); g.lineWidth = 1.6; g.strokeStyle = col; g.stroke();
  }
  function wmouth(x, y, w) { // the "w" mouth of cats and dogs
    g.beginPath();
    if (K.sad) { g.moveTo(x - w, y + 3); g.quadraticCurveTo(x, y - 1, x + w, y + 3); }
    else {
      if (K.joy) { g.moveTo(x - w * 0.8, y + 1); g.quadraticCurveTo(x, y + w * 2.2, x + w * 0.8, y + 1); g.closePath(); fill('#FF7FA0'); line(1.6); g.beginPath(); }
      g.moveTo(x - w, y); g.quadraticCurveTo(x - w * 0.5, y + w * 0.75, x, y); g.quadraticCurveTo(x + w * 0.5, y + w * 0.75, x + w, y);
    }
    g.lineWidth = 2; g.strokeStyle = NAVY; g.stroke();
  }
  function smile(x, y, w) {
    g.beginPath();
    if (K.sad) { g.moveTo(x - w, y + 2.5); g.quadraticCurveTo(x, y - 1.5, x + w, y + 2.5); }
    else if (K.joy) { g.moveTo(x - w, y); g.quadraticCurveTo(x, y + w * 1.9, x + w, y); g.closePath(); fill('#C2374F'); }
    else { g.moveTo(x - w, y); g.quadraticCurveTo(x, y + w * 0.9, x + w, y); }
    g.lineWidth = 2; g.strokeStyle = NAVY; g.stroke();
  }
  // growing up shows: a young pet wears a red collar, a grown one also a gold star tag
  function collar(x, y, w) {
    if (K.st < 1) return;
    tube([x - w, y, x - w * 0.4, y + 4.5, x + w * 0.4, y + 4.5, x + w, y], 3.6, '#FF4F6D');
    if (K.st > 1) { starP(g, x, y + 9.5, 5.8); fill('#FFD23F'); line(1.6); }
  }

  // ---------- the 14 species. Origin: the ground under the middle of the pet, which looks to the right ----------
  function puppy() {
    g.save(); g.translate(-21, -25); g.rotate(K.wag * 1.5); tube([0, 0, -7, -3, -13, -9, -12, -19], 6.5, '#EBB06D'); g.restore();
    leg(-9 - K.walk * 3, -15, 10, '#C8935A'); leg(16 + K.walk * 3, -15, 10, '#C8935A');
    ball(-3, -24, 23, 15.5, '#EBB06D');
    leg(-15 + K.walk * 3, -15, 10.5, '#EBB06D'); leg(10 - K.walk * 3, -15, 10.5, '#EBB06D');
    head(6, -34, function () {
      var d = K.sad ? 0.28 : 0;
      ball(6, -50, 23, 19.5, '#EBB06D');
      E(15.5, -53.5, 8, 8.5); fill('rgba(169,101,47,0.5)');
      E(6.5, -42.5, 11.5, 8.5); fill('#FFF0D2');
      part(-14.5, -47, 7.5, 14.5, '#A9652F', 0.32 + d); part(27.5, -47, 7.5, 14.5, '#A9652F', -0.32 - d);
      eyes(6.5, -54, 9.5, 1);
      nose(6.5, -46.5, 3.6, NAVY); wmouth(6.5, -43, 4.6);
    });
    collar(6, -31, 11);
  }
  function kitten() {
    g.save(); g.translate(-20, -21); g.rotate(K.wag); tube([0, 0, -20, 4, -6, -26, -19, -40], 5.5, '#AEB7CC'); part(-19.5, -41, 4.2, 4.2, '#7D88A2'); g.restore();
    leg(-9 - K.walk * 3, -14, 8.5, '#8E98B0'); leg(15 + K.walk * 3, -14, 8.5, '#8E98B0');
    ball(-3, -22.5, 21, 14.5, '#AEB7CC');
    g.beginPath(); g.moveTo(-19, -31); g.lineTo(-18, -25.5); g.moveTo(-13, -34.5); g.lineTo(-12, -28.5); g.moveTo(-7, -36); g.lineTo(-6.5, -30);
    g.lineWidth = 2.6; g.strokeStyle = '#7D88A2'; g.stroke();
    leg(-15 + K.walk * 3, -14, 9, '#AEB7CC'); leg(10 - K.walk * 3, -14, 9, '#AEB7CC');
    head(6, -33, function () {
      tri(-15, -58, -13.5, -80, 3, -65, '#AEB7CC'); tri(-11, -62, -11, -73, -3.5, -66, '#FFB3C7', 0);
      tri(9, -65, 25.5, -80, 27, -58, '#AEB7CC'); tri(15.5, -66, 23, -73, 23, -62, '#FFB3C7', 0);
      ball(6, -48, 23.5, 19, '#AEB7CC');
      g.beginPath(); g.moveTo(6, -66); g.lineTo(6, -60.5); g.moveTo(-0.5, -65); g.lineTo(0.5, -60.5); g.moveTo(12.5, -65); g.lineTo(11.5, -60.5);
      g.lineWidth = 2.4; g.strokeStyle = '#7D88A2'; g.stroke();
      E(6.5, -41.5, 9, 6.5); fill('#fff');
      eyes(6.5, -51, 10, 1.08);
      nose(6.5, -45.3, 2.7, '#FF7FA0'); wmouth(6.5, -42.6, 4.2);
      g.beginPath(); g.moveTo(-6, -43.5); g.lineTo(-18, -45.5); g.moveTo(-6, -41); g.lineTo(-18, -39.5); g.moveTo(19, -43.5); g.lineTo(31, -45.5); g.moveTo(19, -41); g.lineTo(31, -39.5);
      g.lineWidth = 1.5; g.strokeStyle = NAVY; g.stroke();
    });
    collar(6, -30, 11);
  }
  function bunny() {
    part(-21, -13, 8.5, 8.5, '#FFFDF8');
    part(-9, -4.5, 10, 5.5, '#E6DED2');
    ball(-2, -22, 19, 20, '#FFFDF8');
    part(9, -5, 13, 6, '#FFFDF8');
    head(4, -36, function () {
      var d = K.sad ? 0.55 : Math.sin(K.t * 2.1) * 0.05;
      g.save(); g.translate(-3, -65); g.rotate(-0.14 - d); part(0, -18, 7, 19.5, '#FFFDF8'); E(0, -17, 3.3, 13); fill('#FFB3C7'); g.restore();
      g.save(); g.translate(13, -65); g.rotate(0.2 + d); part(0, -18, 7, 19.5, '#FFFDF8'); E(0, -17, 3.3, 13); fill('#FFB3C7'); g.restore();
      ball(5, -51, 21, 18, '#FFFDF8');
      eyes(6, -53, 9, 1);
      nose(6, -47.5, 2.4, '#FF7FA0'); wmouth(6, -45, 3.8);
      if (!K.sad && !K.joy) { rr(g, 4.3, -43.4, 3.6, 3.8, 1); fill('#fff'); line(1.2); }
    });
    part(8, -25, 4.5, 6, '#FFFDF8');
    collar(5, -34.5, 10);
  }
  function chick() {
    var flap = K.walk * 0.4 + (K.joy ? Math.sin(K.t * 16) * 0.5 : 0);
    g.beginPath(); g.moveTo(-8, -7); g.lineTo(-8, -1); g.moveTo(8, -7); g.lineTo(8, -1); g.lineWidth = 3; g.strokeStyle = '#E0701C'; g.stroke();
    part(-7, -1.8, 6.5, 3, '#FF8A2B'); part(9, -1.8, 6.5, 3, '#FF8A2B');
    part(-4.5, -53, 2.8, 6.5, '#FFD94D', -0.5); part(1, -55.5, 2.8, 7.5, '#FFD94D', 0); part(6.5, -53, 2.8, 6.5, '#FFD94D', 0.5);
    ball(0, -27, 22, 25, '#FFD94D');
    g.save(); g.translate(-19, -32); g.rotate(0.35 + flap); part(-1, 9, 6.5, 11, '#F0BE2E'); g.restore();
    g.save(); g.translate(19, -32); g.rotate(-0.35 - flap); part(1, 9, 6.5, 11, '#F0BE2E'); g.restore();
    eyes(2, -37, 9, 1.05);
    if (K.joy) { tri(-3.5, -32.5, 7.5, -32.5, 2, -28.5, '#FF8A2B', 2); tri(-2.5, -28, 6.5, -28, 2, -23.5, '#FF8A2B', 2); }
    else tri(-3.5, -32, 7.5, -32, 2, -25, '#FF8A2B', 2);
    collar(2, -20, 12);
  }
  function turtle() {
    var bob = K.sad ? 3 : Math.sin(K.t * 2) * 0.8;
    tri(-33, -13, -43, -8, -32, -6, '#B5E384');
    part(-17 - K.walk * 2.5, -4, 8.5, 6, '#93C468'); part(15 + K.walk * 2.5, -4, 8.5, 6, '#93C468');
    head(18, -16, function () {
      tube([14, -17, 20, -19, 24, -22, 27, -24 + bob], 9, '#B5E384');
      ball(30, -27 + bob, 13.5, 12.5, '#B5E384');
      eyes(31, -29 + bob, 5.8, 0.8);
      smile(31, -22 + bob, 3.2);
    });
    solid(function () { g.beginPath(); g.moveTo(-36, -9); g.bezierCurveTo(-37, -52, 23, -54, 25, -9); g.closePath(); }, '#3FA66C', function () {
      E(-6, -34, 9.5, 8); fill('#2C7C4F'); E(-23, -21, 7.5, 6.5); fill('#2C7C4F'); E(11, -21, 7.5, 6.5); fill('#2C7C4F'); E(-6, -17, 6, 4.5); fill('#2C7C4F');
      shadeIn(-6, -28, 31, 24);
    });
    rr(g, -39, -13, 67, 8.5, 4); fill('#F4E3A1'); line(K.lw * 0.85);
    part(-23 + K.walk * 2.5, -3.5, 9, 6, '#B5E384'); part(12 - K.walk * 2.5, -3.5, 9, 6, '#B5E384');
    collar(30, -14.5 + bob, 6.5);
  }
  function fox() {
    function tail() { g.beginPath(); g.moveTo(2, 2); g.bezierCurveTo(-32, 12, -50, -22, -24, -50); g.bezierCurveTo(-17, -36, -7, -20, 3, -9); g.closePath(); }
    g.save(); g.translate(-17, -20); g.rotate(K.wag * 0.8);
    solid(tail, '#FF8D3A', function () { E(-27, -45, 14, 14); fill('#fff'); });
    g.restore();
    leg(-9 - K.walk * 3, -14, 8.5, '#5B3521'); leg(15 + K.walk * 3, -14, 8.5, '#5B3521');
    ball(-3, -22.5, 21, 14.5, '#FF8D3A');
    E(8, -21, 8, 8); fill('#fff');
    leg(-15 + K.walk * 3, -14, 9, '#FF8D3A'); leg(10 - K.walk * 3, -14, 9, '#FF8D3A');
    rr(g, -19.5 + K.walk * 3, -6.5, 9, 6.5, 3.5); fill('#5B3521'); rr(g, 5.5 - K.walk * 3, -6.5, 9, 6.5, 3.5); fill('#5B3521');
    head(6, -33, function () {
      tri(-17, -57, -15, -87, 2, -66, '#FF8D3A'); tri(-16.2, -73, -15, -87, -8.5, -78, '#5B3521', 0); tri(-13, -62, -12.5, -71, -5.5, -66, '#fff', 0);
      tri(10, -66, 27, -87, 29, -57, '#FF8D3A'); tri(20.5, -78, 27, -87, 28.2, -73, '#5B3521', 0); tri(17.5, -66, 24.5, -71, 25, -62, '#fff', 0);
      solid(function () {
        g.beginPath(); g.moveTo(6, -68); g.bezierCurveTo(20, -68, 29, -60, 30, -50); g.lineTo(37, -42);
        g.bezierCurveTo(28, -33, 16, -30, 6, -30); g.bezierCurveTo(-4, -30, -16, -33, -25, -42); g.lineTo(-18, -50); g.bezierCurveTo(-17, -60, -8, -68, 6, -68); g.closePath();
      }, '#FF8D3A', function () {
        E(-12, -36, 15, 9); fill('#fff'); E(24, -36, 15, 9); fill('#fff'); E(6, -36, 10, 9.5); fill('#fff');
        shadeIn(6, -49, 31, 20);
      });
      eyes(6, -51, 10, 1);
      nose(6, -41.5, 3, NAVY); wmouth(6, -38.4, 3.4);
    });
    collar(6, -30.5, 11);
  }
  function panda() {
    part(-13, -4.5, 10.5, 6, '#2B3046'); part(14, -4.5, 10.5, 6, '#2B3046');
    ball(0, -23, 23, 21, '#FFFFFF');
    part(-20, -27, 7, 12.5, '#2B3046', 0.35); part(20, -27, 7, 12.5, '#2B3046', -0.35);
    head(3, -40, function () {
      part(-13, -70, 8.5, 8.5, '#2B3046'); part(21, -70, 8.5, 8.5, '#2B3046');
      ball(4, -54, 24, 20, '#FFFFFF');
      E(-5.5, -55, 7, 8.5, 0.45); fill('#2B3046'); E(14.5, -55, 7, 8.5, -0.45); fill('#2B3046');
      eyes(4.5, -55, 10, 0.95, true);
      nose(4.5, -47, 3, '#2B3046'); wmouth(4.5, -44, 3.6);
    });
    collar(4, -35, 12);
  }
  function penguin() {
    var flap = K.walk * 0.3 + (K.joy ? Math.sin(K.t * 15) * 0.45 : 0);
    part(-9, -2.5, 9.5, 5, '#FF9F2E'); part(9, -2.5, 9.5, 5, '#FF9F2E');
    ball(0, -36, 23, 34, '#3A4A7A');
    E(1, -28, 15.5, 22); fill('#fff'); E(-6.5, -50, 9.5, 9); fill('#fff'); E(9.5, -50, 9.5, 9); fill('#fff');
    g.save(); g.translate(-21, -42); g.rotate(0.3 + flap); part(-2, 13, 5.5, 14, '#3A4A7A'); g.restore();
    g.save(); g.translate(21, -42); g.rotate(-0.3 - flap); part(2, 13, 5.5, 14, '#3A4A7A'); g.restore();
    eyes(1.5, -51, 8, 1);
    tri(-3.5, -46, 6.5, -46, 1.5, -40, '#FF9F2E', 2);
    collar(1.5, -36.5, 12);
  }
  function owl() {
    var flap = K.walk * 0.25 + (K.joy ? Math.sin(K.t * 15) * 0.4 : 0), i, r;
    part(-8, -2, 7.5, 4, '#FF9F2E'); part(8, -2, 7.5, 4, '#FF9F2E');
    tri(-21, -52, -25, -76, -6, -62, '#B9824F'); tri(21, -52, 25, -76, 6, -62, '#B9824F');
    solid(function () {
      g.beginPath(); g.moveTo(0, -68); g.bezierCurveTo(20, -68, 27, -52, 26, -36); g.bezierCurveTo(25, -14, 15, -3, 0, -3);
      g.bezierCurveTo(-15, -3, -25, -14, -26, -36); g.bezierCurveTo(-27, -52, -20, -68, 0, -68); g.closePath();
    }, '#B9824F', function () {
      E(0, -21, 15, 17); fill('#F6DDB5');
      g.beginPath();
      for (r = 0; r < 3; r++) for (i = -1; i <= 1; i++) { if (r === 2 && i) continue; g.moveTo(i * 8 + (r % 2 ? 4 : 0) - 3, -28 + r * 8); g.quadraticCurveTo(i * 8 + (r % 2 ? 4 : 0), -24 + r * 8, i * 8 + (r % 2 ? 4 : 0) + 3, -28 + r * 8); }
      g.lineWidth = 2; g.strokeStyle = '#B9824F'; g.stroke();
      shadeIn(0, -36, 27, 33);
    });
    part(-24, -30, 7, 17, '#7C4F2C', 0.18 + flap); part(24, -30, 7, 17, '#7C4F2C', -0.18 - flap);
    E(-9.5, -48, 11.5, 11.5); fill('#F6DDB5'); E(9.5, -48, 11.5, 11.5); fill('#F6DDB5');
    part(-9.5, -48, 7.6, 7.6, '#FFD66B'); part(9.5, -48, 7.6, 7.6, '#FFD66B');
    eyes(0, -48, 9.5, 1);
    tri(-4, -43.5, 4, -43.5, 0, -36.5, '#FF9F2E', 2);
    collar(0, -33.5, 12);
  }
  function lion() {
    var i, a;
    g.save(); g.translate(-22, -23); g.rotate(K.wag); tube([0, 0, -12, -2, -18, -10, -17, -22], 5, '#FFC759'); part(-17, -25, 5.5, 6.5, '#C96F1F'); g.restore();
    leg(-9 - K.walk * 3, -14, 10, '#DBA440'); leg(16 + K.walk * 3, -14, 10, '#DBA440');
    ball(-3, -22.5, 22, 15, '#FFC759');
    leg(-15 + K.walk * 3, -14, 10.5, '#FFC759'); leg(10 - K.walk * 3, -14, 10.5, '#FFC759');
    head(6, -34, function () {
      g.strokeStyle = NAVY; g.lineWidth = K.lw * 2;
      for (i = 0; i < 11; i++) { a = i * TAU / 11 + 0.2; g.beginPath(); g.arc(6 + Math.cos(a) * 20, -50 + Math.sin(a) * 20, 9.5, 0, TAU); g.stroke(); }
      g.fillStyle = '#C96F1F';
      for (i = 0; i < 11; i++) { a = i * TAU / 11 + 0.2; g.beginPath(); g.arc(6 + Math.cos(a) * 20, -50 + Math.sin(a) * 20, 9.5, 0, TAU); g.fill(); }
      E(6, -50, 21, 21); g.fill();
      part(-9, -67, 6.5, 6.5, '#FFC759'); part(21, -67, 6.5, 6.5, '#FFC759');
      ball(6, -49, 18.5, 17, '#FFC759');
      E(6, -43, 9.5, 7); fill('#FFEDC2');
      eyes(6, -52, 8, 0.95);
      nose(6, -46, 3.2, '#8A4A1C'); wmouth(6, -43, 4);
    });
    collar(6, -30.5, 9.5);
  }
  function elephant() {
    var fl = Math.sin(K.t * 3) * 0.07 + K.walk * 0.08;
    tube([-25, -30, -31, -28, -34, -24, -34, -18], 3.2, '#A3BBDB'); part(-34, -15.5, 3, 4, '#7F99BF');
    leg(-8 - K.walk * 3, -16, 13, '#8AA3C6'); leg(17 + K.walk * 3, -16, 13, '#8AA3C6');
    ball(-4, -27, 25, 18, '#A3BBDB');
    leg(-16 + K.walk * 3, -16, 13.5, '#A3BBDB'); leg(9 - K.walk * 3, -16, 13.5, '#A3BBDB');
    collar(6, -32, 11);
    head(6, -38, function () {
      g.save(); g.translate(-10, -54); g.rotate(-fl - (K.sad ? 0.25 : 0)); ball(-12, 0, 14, 17, '#A3BBDB'); E(-11, 1, 8.5, 11.5); fill('#FFC4D6'); g.restore();
      g.save(); g.translate(22, -54); g.rotate(fl + (K.sad ? 0.25 : 0)); ball(12, 0, 14, 17, '#A3BBDB'); E(11, 1, 8.5, 11.5); fill('#FFC4D6'); g.restore();
      ball(6, -53, 21, 19, '#A3BBDB');
      if (K.joy) tube([6, -47, 6, -36, 24, -32, 25, -50], 8.5, '#A3BBDB');
      else tube([6, -47, 5, -36, 5, -25, 16, -25], 8.5, '#A3BBDB');
      g.beginPath(); g.moveTo(2.5, -41); g.lineTo(9.5, -41); g.moveTo(2, -36); g.lineTo(9, -36); g.lineWidth = 1.6; g.strokeStyle = '#7F99BF'; g.stroke();
      eyes(6, -57, 10.5, 1);
    });
  }
  function dino() {
    tri(-8, -72, -8, -85, 3, -76, '#FF9A3D'); tri(-17, -61, -23, -73, -10, -70, '#FF9A3D'); tri(-18, -45, -28, -53, -16, -56, '#FF9A3D');
    tri(-19, -31, -30, -37, -19, -42, '#FF9A3D'); tri(-29, -24, -34, -33, -23, -29, '#FF9A3D'); tri(-40, -14, -45, -23, -34, -19, '#FF9A3D');
    g.save(); g.translate(-8, -20); g.rotate(K.wag * 0.5); g.translate(8, 20);
    solid(function () { g.beginPath(); g.moveTo(-6, -36); g.bezierCurveTo(-26, -32, -40, -20, -51, -8); g.bezierCurveTo(-38, -3, -20, -3, -4, -8); g.closePath(); }, '#5CC998');
    g.restore();
    leg(-9 - K.walk * 3, -14, 12, '#4AAE82'); part(-6 - K.walk * 3, -3, 9, 4.2, '#4AAE82');
    ball(0, -28, 19, 21, '#5CC998');
    E(4.5, -24, 11.5, 14.5); fill('#DDF6C6');
    leg(8 + K.walk * 3, -14, 12.5, '#5CC998'); part(11.5 + K.walk * 3, -3, 9.5, 4.4, '#5CC998');
    tube([12, -35, 16, -34, 19, -32, 20, -29], 3.6, '#5CC998');
    head(4, -44, function () {
      ball(7, -59, 23, 16.5, '#5CC998');
      eyes(7, -62, 10.5, 1);
      g.beginPath();
      if (K.sad) { g.moveTo(-3, -50); g.quadraticCurveTo(7, -54, 17, -50); }
      else { g.moveTo(-6, -52); g.quadraticCurveTo(7, -45, 20, -52); }
      g.lineWidth = 2; g.strokeStyle = NAVY; g.stroke();
      if (!K.sad) { tri(-0.5, -49.6, 3, -48.6, 1.3, -45.4, '#fff', 1.2); tri(11, -48.6, 14.5, -49.6, 12.7, -45.4, '#fff', 1.2); }
    });
    collar(4, -42, 9.5);
  }
  function unicorn() {
    function hleg(x, w, col) { leg(x, -22, w, col); rr(g, x - w / 2, -6, w, 6, 2.5); fill('#B58CFF'); line(K.lw * 0.75); }
    g.save(); g.translate(-24, -33); g.rotate(K.wag * 0.7);
    tube([0, 0, -18, 0, -24, 12, -20, 23], 5, '#B58CFF'); tube([0, 0, -14, 2, -18, 16, -12, 27], 5, '#FF8FC8'); tube([0, -1, -10, 4, -10, 16, -4, 25], 4.5, '#7FD4FF');
    g.restore();
    hleg(-10 - K.walk * 3.5, 8, '#E4E6F2'); hleg(15 + K.walk * 3.5, 8, '#E4E6F2');
    ball(-4, -32, 23, 13.5, '#FFFFFF');
    hleg(-17 + K.walk * 3.5, 8.5, '#FFFFFF'); hleg(9 - K.walk * 3.5, 8.5, '#FFFFFF');
    starP(g, -12, -33, 4.4); fill('#FFD23F'); line(1.3);
    head(5, -40, function () {
      tube([6, -37, 7, -44, 8, -50, 9, -56], 14, '#FFFFFF');
      part(-9, -41, 6.5, 6.5, '#B58CFF'); part(-10.5, -50, 7.5, 7.5, '#FF8FC8'); part(-10.5, -60, 7.5, 7.5, '#B58CFF'); part(-6, -70, 7.5, 7.5, '#FF8FC8');
      tri(-4, -72, -2.5, -85, 5.5, -76, '#FFFFFF'); tri(15, -76, 22.5, -85, 23.5, -72, '#FFFFFF');
      tri(5.5, -77, 10, -102, 14.5, -77, '#FFD23F');
      g.beginPath(); g.moveTo(7.3, -84); g.lineTo(12.8, -86.5); g.moveTo(8.6, -91.5); g.lineTo(11.6, -93); g.lineWidth = 1.5; g.strokeStyle = '#D99A00'; g.stroke();
      ball(10, -63, 18, 16, '#FFFFFF');
      part(3.5, -77, 7, 5.2, '#FF8FC8', -0.3);
      E(11, -55.5, 10, 6.5); fill('#FFE1EC');
      E(7.5, -55.5, 1.1, 1.4); fill('#E58AAC'); E(14.5, -55.5, 1.1, 1.4); fill('#E58AAC');
      eyes(10.5, -65, 8.5, 1);
      smile(11, -52.3, 2.6);
    });
    collar(7.5, -45.5, 8);
  }
  function dragon() {
    var fl = Math.sin(K.t * (K.joy ? 16 : 5)) * (K.joy ? 0.3 : 0.14) + K.walk * 0.12;
    function wing(x, y, dir) {
      g.save(); g.translate(x, y); g.scale(dir, 1); g.rotate(-fl);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(7, -42); g.quadraticCurveTo(13, -28, 24, -33); g.quadraticCurveTo(23, -20, 32, -18); g.quadraticCurveTo(21, -11, 15, 0); g.closePath();
      fill('#FF86AE'); line();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(7, -42); g.moveTo(0, 0); g.lineTo(24, -33); g.moveTo(0, 0); g.lineTo(32, -18); g.lineWidth = 1.8; g.strokeStyle = '#D9567F'; g.stroke();
      g.restore();
    }
    wing(15, -37, 1); wing(-11, -37, -1);
    g.save(); g.translate(-20, -20); g.rotate(K.wag * 0.6); tube([0, 0, -20, 5, -30, -11, -22, -27], 6.5, '#9B66F2'); tri(-29.5, -27.5, -21, -42, -14.5, -26, '#FFA53D'); g.restore();
    leg(-9 - K.walk * 3, -14, 10, '#7F4FD6'); leg(16 + K.walk * 3, -14, 10, '#7F4FD6');
    ball(-3, -23, 22, 15.5, '#9B66F2');
    E(4, -19, 12, 8.5); fill('#FFE39C');
    g.beginPath(); g.moveTo(-5, -21); g.quadraticCurveTo(4, -18.5, 13, -21); g.moveTo(-3, -16); g.quadraticCurveTo(4, -13.8, 11, -16); g.lineWidth = 1.6; g.strokeStyle = '#E5B452'; g.stroke();
    leg(-15 + K.walk * 3, -14, 10.5, '#9B66F2'); leg(10 - K.walk * 3, -14, 10.5, '#9B66F2');
    head(6, -34, function () {
      tri(-9, -64, -14.5, -85, -1, -68, '#FFF2D8'); tri(13, -68, 26.5, -85, 21, -64, '#FFF2D8');
      tri(-14, -58, -28, -61, -15, -48, '#FF86AE'); tri(26, -58, 40, -61, 27, -48, '#FF86AE');
      tri(1.5, -68, 6, -77, 10.5, -68, '#FFA53D');
      ball(6, -51, 22, 18, '#9B66F2');
      E(6, -43.5, 12, 7.5); fill('#C3A2FF');
      E(2, -44.5, 1.2, 1.5); fill('#6A3FC0'); E(10, -44.5, 1.2, 1.5); fill('#6A3FC0');
      eyes(6, -55, 10, 1.05);
      smile(6, -40.3, 3.4);
      if (!K.sad && !K.joy) tri(9.2, -39.6, 11.6, -39.9, 10.6, -36.6, '#fff', 1.1);
    });
    collar(6, -31.5, 11);
  }
  // h = height at full size, sw = half width of the ground shadow, bc = middle of the body (for dirt spots)
  var PET = {
    puppy: { draw: puppy, h: 74, sw: 27, bc: [-3, -22] }, kitten: { draw: kitten, h: 84, sw: 26, bc: [-3, -21] },
    bunny: { draw: bunny, h: 108, sw: 23, bc: [-2, -20] }, chick: { draw: chick, h: 66, sw: 22, bc: [0, -22] },
    turtle: { draw: turtle, h: 56, sw: 38, bc: [-6, -27] }, fox: { draw: fox, h: 92, sw: 27, bc: [-3, -21] },
    panda: { draw: panda, h: 84, sw: 26, bc: [0, -20] }, penguin: { draw: penguin, h: 74, sw: 24, bc: [0, -22] },
    owl: { draw: owl, h: 80, sw: 26, bc: [0, -20] }, lion: { draw: lion, h: 84, sw: 27, bc: [-5, -21] },
    elephant: { draw: elephant, h: 78, sw: 30, bc: [-6, -25] }, dino: { draw: dino, h: 90, sw: 30, bc: [0, -24] },
    unicorn: { draw: unicorn, h: 106, sw: 28, bc: [-5, -31] }, dragon: { draw: dragon, h: 90, sw: 28, bc: [-4, -21] }
  };
  // Draws a pet with its feet at (x, y). o = { scale, stage 0-2, facing 1|-1, t, moving, sad, joy, dirty, nod,
  // still: no blinking or wagging (for pictures), noShadow, seed }. Returns the height drawn.
  function drawPet(c, x, y, sp, o) {
    o = o || {};
    var P = PET[sp] || PET.puppy, st = o.stage > 0 ? Math.min(2, o.stage) : 0, sc = (o.scale || 1) * STAGE_K[st], f = o.facing < 0 ? -1 : 1;
    var t = (o.t || 0) + (o.seed || 0) * 1.7, sad = !!o.sad, joy = !!o.joy && !sad, hop;
    if (o.still) hop = 0;
    else if (o.moving) hop = Math.abs(Math.sin(t * 9)) * (sad ? 3 : 7);
    else if (joy) hop = Math.abs(Math.sin(t * 10)) * 9;
    else hop = sad ? 0 : Math.sin(t * 2.3) * 0.9;
    g = c;
    K.t = t; K.f = f; K.sad = sad; K.joy = joy; K.st = st; K.hk = HEAD_K[st]; K.nod = o.nod || 0;
    K.blink = !o.still && !joy && (t * 0.31) % 1 > 0.95;
    K.walk = o.moving ? Math.sin(t * 9) : 0;
    K.wag = o.still ? 0 : sad ? Math.sin(t * 1.4) * 0.04 : Math.sin(t * (joy ? 13 : 6)) * (joy ? 0.32 : 0.18);
    K.lw = sc > 1.5 ? 3 / Math.pow(sc / 1.5, 0.45) : 3;
    c.save(); c.translate(x, y); c.lineJoin = 'round'; c.lineCap = 'round';
    if (!o.noShadow) { c.fillStyle = SHADOW; c.beginPath(); c.ellipse(4 * sc, 0, P.sw * sc * (1 - hop / 40), 6.5 * sc, 0, 0, TAU); c.fill(); }
    c.translate(0, -hop * sc); c.scale(f * sc, sc);
    P.draw();
    if (o.dirty) {
      g.fillStyle = 'rgba(122,74,43,0.72)';
      E(P.bc[0] - 9, P.bc[1] + 3, 4.2, 3.2); g.fill(); E(P.bc[0] + 7, P.bc[1] - 5, 3.2, 2.6); g.fill(); E(P.bc[0] + 1, P.bc[1] + 8, 2.8, 2.2); g.fill(); E(P.bc[0] + 12, P.bc[1] + 5, 2.4, 2); g.fill();
    }
    c.restore();
    return P.h * sc;
  }

  // ---------- eggs ----------
  var EGG_COL = ['#FFF2D2', '#8FD3FF', '#A678F5'];
  var CRACK = [-27, -27, -17, -34, -9, -24, 0, -35, 9, -25, 17, -34, 27, -27];
  function eggPath(c) {
    c.beginPath(); c.moveTo(0, -62); c.bezierCurveTo(17, -62, 26, -37, 26, -22); c.bezierCurveTo(26, -7, 14, 0, 0, 0);
    c.bezierCurveTo(-14, 0, -26, -7, -26, -22); c.bezierCurveTo(-26, -37, -17, -62, 0, -62); c.closePath();
  }
  // o = { scale, rot, crack 0-1, part: 1 the top shell only, 2 the bottom shell only, noShadow }
  function drawEgg(c, x, y, k, o) {
    o = o || {};
    var s = o.scale || 1, i, n;
    c.save(); c.translate(x, y); c.lineJoin = 'round'; c.lineCap = 'round';
    if (!o.noShadow) { c.fillStyle = SHADOW; c.beginPath(); c.ellipse(5 * s, 0, 24 * s, 6 * s, 0, 0, TAU); c.fill(); }
    c.scale(s, s); c.rotate(o.rot || 0);
    if (o.part) { // one half of the broken shell
      c.beginPath(); c.moveTo(-40, o.part === 1 ? -80 : 10);
      for (i = 0; i < CRACK.length; i += 2) c.lineTo(CRACK[i] * 1.2, CRACK[i + 1]);
      c.lineTo(40, o.part === 1 ? -80 : 10); c.closePath(); c.clip();
    }
    eggPath(c); c.fillStyle = EGG_COL[k] || EGG_COL[0]; c.fill();
    c.save(); eggPath(c); c.clip();
    if (k === 1) {
      c.strokeStyle = '#fff'; c.lineWidth = 5; c.beginPath(); c.moveTo(-31, -28);
      for (i = 0; i < 8; i++) c.lineTo(-23 + i * 8, i % 2 ? -27 : -36);
      c.stroke();
      c.fillStyle = '#fff'; starP(c, -8, -48, 5); c.fill(); starP(c, 9, -13, 5.5); c.fill(); starP(c, -13, -12, 3.5); c.fill();
    } else if (k === 2) {
      c.fillStyle = '#FFD23F'; c.fillRect(-30, -38, 60, 12);
      c.beginPath(); for (i = 0; i < 7; i++) { c.moveTo(-31.5 + i * 9, -37.5); c.lineTo(-27 + i * 9, -46); c.lineTo(-22.5 + i * 9, -37.5); } c.fill();
      c.strokeStyle = '#C99700'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-30, -26); c.lineTo(30, -26); c.stroke();
      ['#FF6FA5', '#7FE3FF', '#FF6FA5'].forEach(function (col, q) { c.beginPath(); c.arc(-13 + q * 13, -32, 3.6, 0, TAU); c.fillStyle = col; c.fill(); c.lineWidth = 1.3; c.strokeStyle = NAVY; c.stroke(); });
      c.fillStyle = '#FFE680'; for (i = 0; i < 4; i++) { c.beginPath(); c.arc(-15 + i * 10, -15 + (i % 2) * 6, 2.4, 0, TAU); c.fill(); }
      c.fillStyle = '#E3D2FF'; starP(c, 0, -53, 4.2); c.fill();
    } else {
      c.fillStyle = '#8FE3C8';
      [[-10, -42, 6.5], [10, -27, 7.5], [-13, -15, 5.5], [11, -50, 4], [1, -8, 4.5], [-2, -27, 3]].forEach(function (q) { c.beginPath(); c.arc(q[0], q[1], q[2], 0, TAU); c.fill(); });
    }
    c.beginPath(); c.rect(-40, -72, 80, 84); c.moveTo(22, -27); c.ellipse(-5, -27, 27, 34, 0, 0, TAU); c.fillStyle = 'rgba(27,42,73,0.15)'; c.fill('evenodd');
    c.beginPath(); c.ellipse(-10, -44, 4.5, 9, 0.5, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fill();
    c.restore();
    eggPath(c); c.lineWidth = 3; c.strokeStyle = NAVY; c.stroke();
    if (o.crack > 0 || o.part) {
      n = o.part ? CRACK.length : Math.max(4, Math.round(o.crack * CRACK.length / 2) * 2);
      c.beginPath(); c.moveTo(CRACK[0], CRACK[1]);
      for (i = 2; i < n && i < CRACK.length; i += 2) c.lineTo(CRACK[i], CRACK[i + 1]);
      c.lineWidth = 2.6; c.strokeStyle = NAVY; c.stroke();
    }
    c.restore();
  }

  // ---------- small pictures for the buttons: foods, toys, soap (origin in the middle, about 44 px big) ----------
  function icon(c, name) {
    var i;
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; c.lineWidth = 2.5; c.strokeStyle = NAVY;
    function fs(col, w) { c.fillStyle = col; c.fill(); c.lineWidth = w || 2.5; c.strokeStyle = NAVY; c.stroke(); }
    function circ(x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); }
    if (name === 'food0') { // a bone-shaped biscuit
      c.rotate(-0.5);
      c.lineWidth = 5; [[-13, -5], [-13, 5], [13, -5], [13, 5]].forEach(function (q) { circ(q[0], q[1], 6.5); c.stroke(); });
      rr(c, -13, -5.5, 26, 11, 3); c.stroke();
      c.fillStyle = '#E9B872'; [[-13, -5], [-13, 5], [13, -5], [13, 5]].forEach(function (q) { circ(q[0], q[1], 6.5); c.fill(); });
      c.fillRect(-13, -5.5, 26, 11);
      c.fillStyle = '#B77B45'; [[-5, -1], [2, 2], [7, -2]].forEach(function (q) { circ(q[0], q[1], 1.3); c.fill(); });
    } else if (name === 'food1') { // a bowl of fruit
      circ(-8, -5, 9.5); fs('#FF4F6D'); circ(8, -5, 8.5); fs('#FF9F2E'); circ(1, -11, 7); fs('#B58CFF');
      c.beginPath(); c.ellipse(-7, -16, 5, 2.4, -0.5, 0, TAU); fs('#4FA05A', 1.6);
      c.beginPath(); c.moveTo(-19, 0); c.lineTo(19, 0); c.quadraticCurveTo(17, 17, 0, 17); c.quadraticCurveTo(-17, 17, -19, 0); c.closePath(); fs('#5AA9FF');
      c.beginPath(); c.moveTo(-13, 6); c.quadraticCurveTo(0, 10, 13, 6); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.7)'; c.stroke();
    } else if (name === 'food2') { // a cupcake with a cherry
      poly(c, [-12, 2, 12, 2, 9, 18, -9, 18]); fs('#F6C98A');
      c.beginPath(); c.moveTo(-4.5, 4); c.lineTo(-3.5, 16); c.moveTo(4.5, 4); c.lineTo(3.5, 16); c.lineWidth = 1.6; c.strokeStyle = '#C98A4B'; c.stroke();
      c.lineWidth = 5; c.strokeStyle = NAVY; [[-8, -1, 8], [8, -1, 8], [0, -8, 9]].forEach(function (q) { circ(q[0], q[1], q[2]); c.stroke(); });
      c.fillStyle = '#FF8FC8'; [[-8, -1, 8], [8, -1, 8], [0, -8, 9]].forEach(function (q) { circ(q[0], q[1], q[2]); c.fill(); });
      circ(0, -18, 4.6); fs('#FF4F6D', 2); circ(-1.5, -19.5, 1.3); c.fillStyle = 'rgba(255,255,255,0.8)'; c.fill();
    } else if (name === 'toy0') { // a beach ball
      circ(0, 0, 17); c.fillStyle = '#fff'; c.fill();
      c.save(); circ(0, 0, 17); c.clip();
      ['#FF4F6D', '#FFD23F', '#5AA9FF'].forEach(function (col, q) { c.beginPath(); c.moveTo(-4, -6); c.arc(-4, -6, 40, q * TAU / 3 + 0.3, q * TAU / 3 + 0.3 + TAU / 6); c.closePath(); c.fillStyle = col; c.fill(); });
      c.restore();
      circ(0, 0, 17); c.lineWidth = 2.5; c.strokeStyle = NAVY; c.stroke();
      circ(-4, -6, 3); c.fillStyle = '#fff'; c.fill();
    } else if (name === 'toy1') { // soap bubbles
      [[-7, 4, 11], [9, -7, 8], [8, 11, 5.5]].forEach(function (q) {
        circ(q[0], q[1], q[2]); c.fillStyle = 'rgba(160,220,255,0.55)'; c.fill(); c.lineWidth = 2.2; c.strokeStyle = '#3B9BFF'; c.stroke();
        c.beginPath(); c.arc(q[0], q[1], q[2] * 0.62, Math.PI * 1.05, Math.PI * 1.5); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke();
      });
    } else if (name === 'toy2') { // a feather on a stick
      c.beginPath(); c.moveTo(-17, 17); c.lineTo(0, 0); c.lineWidth = 6; c.strokeStyle = NAVY; c.stroke(); c.lineWidth = 2.6; c.strokeStyle = '#C98A4B'; c.stroke();
      c.beginPath(); c.moveTo(-2, 2); c.bezierCurveTo(-8, -16, 6, -22, 18, -19); c.bezierCurveTo(22, -6, 14, 6, -2, 2); c.closePath(); fs('#FF8FC8');
      c.beginPath(); c.moveTo(-1, 1); c.lineTo(15, -16); c.moveTo(4, -4); c.lineTo(3, -13); c.moveTo(8, -8); c.lineTo(16, -7); c.lineWidth = 1.6; c.strokeStyle = '#D9567F'; c.stroke();
    } else { // 'soap'
      c.save(); c.rotate(-0.3); rr(c, -15, -3, 30, 18, 7); fs('#FF9EC4'); rr(c, -9, 1, 18, 9, 4); c.lineWidth = 1.6; c.strokeStyle = '#E0739F'; c.stroke(); c.restore();
      for (i = 0; i < 4; i++) { circ([-10, 1, 11, -3][i], [-10, -15, -9, -6][i], [6, 7.5, 5, 3.5][i]); c.fillStyle = 'rgba(255,255,255,0.9)'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#3B9BFF'; c.stroke(); }
    }
    c.restore();
  }

  // ---------- cached pictures ----------
  var thumbs = {};
  // a square picture of a species, px by px; sil = only its dark shape (not yet in the book)
  function thumb(sp, st, px, sil) {
    var key = sp + '|' + st + '|' + px + '|' + (sil ? 1 : 0), cv = thumbs[key], c, P, s;
    if (cv) return cv;
    P = PET[sp] || PET.puppy;
    cv = document.createElement('canvas'); cv.width = cv.height = px * 2; c = cv.getContext('2d'); c.scale(2, 2);
    s = Math.min((px - 10) / (P.h * STAGE_K[st]), (px - 6) / (104 * STAGE_K[st]));
    drawPet(c, px / 2 + 4 * s * STAGE_K[st], px - 6, sp, { scale: s, stage: st, still: true, noShadow: sil });
    if (sil) { c.globalCompositeOperation = 'source-in'; c.fillStyle = '#5C6884'; c.fillRect(0, 0, px, px); c.globalCompositeOperation = 'source-over'; }
    thumbs[key] = cv;
    return cv;
  }
  function pic(px, sp, st, sil) { // a new canvas element showing that picture
    var cv = document.createElement('canvas'), src = thumb(sp, st, px, sil);
    cv.width = cv.height = px * 2; cv.style.width = cv.style.height = px + 'px'; cv.setAttribute('aria-hidden', 'true');
    cv.getContext('2d').drawImage(src, 0, 0);
    return cv;
  }

  // ---------- a pet walks after its owner ----------
  // fo = { x, y, f, m }: where the pet is. It trots to a spot just behind the owner and hops while it moves.
  function follow(fo, ox, oy, of, dt, top) {
    var tx = ox - of * 62, ty = oy + 8, dx = tx - fo.x, dy = ty - fo.y, d = Math.sqrt(dx * dx + dy * dy), sp;
    if (d > 460) { fo.x = tx; fo.y = ty; fo.m = 0; fo.f = of; return; }
    if (d > 16 || (fo.m && d > 4)) {
      sp = Math.min(top, 70 + d * 4.5) * dt;
      if (sp > d) sp = d;
      fo.x += dx / d * sp; fo.y += dy / d * sp; fo.m = 1;
      if (Math.abs(dx) > 3) fo.f = dx > 0 ? 1 : -1;
    } else { fo.m = 0; }
  }
  var townFol = {}, townT = 0, townStamp = 0;
  function townHook(c, t, view, items) {
    var ps = api.players(), me = api.myId(), dt = Math.max(0, Math.min(0.1, t - townT)), stamp = ++townStamp;
    townT = t;
    Object.keys(ps).forEach(function (id) {
      var p = ps[id], e = p.ext && p.ext.pets, fo;
      if (!e || p.room !== 'town' || !PET[e.s] || (p.id !== me && p.placed === false)) return;
      fo = townFol[id];
      if (!fo) fo = townFol[id] = { x: p.x - (p.f < 0 ? -56 : 56), y: p.y + 8, f: p.f < 0 ? -1 : 1, m: 0 };
      fo.stamp = stamp;
      follow(fo, p.x, p.y, p.f < 0 ? -1 : 1, dt, p.drive ? 560 : 330);
      if (fo.x < view.x - 90 || fo.x > view.x + view.w + 90 || fo.y < view.y - 40 || fo.y > view.y + view.h + 130) return;
      items.push({ y: fo.y, d: function () {
        drawPet(c, fo.x, fo.y, e.s, { scale: PET_K, stage: e.g, facing: fo.f, t: t, moving: !!fo.m, sad: e.m === 0, seed: p.id });
        api.label(c, String(e.n), fo.x, fo.y + 31, '#fff', NAVY, 13); // the name sits under the pet, clear of its owner's name tag
      } });
    });
    Object.keys(townFol).forEach(function (id) { if (townFol[id].stamp !== stamp) delete townFol[id]; });
  }

  // ---------- what the server told this tablet ----------
  // CFG holds the prices and limits (the server sends its own on entering; these are the same numbers).
  var CFG = {
    eggs: [{ cost: 20, lv: 1, need: 5, odds: [75, 20, 4, 1] }, { cost: 60, lv: 4, need: 12, odds: [35, 45, 16, 4] }, { cost: 150, lv: 8, need: 25, odds: [0, 45, 40, 15] }],
    foods: [{ cost: 1, hun: 20, hap: 0, xp: 4 }, { cost: 2, hun: 45, hap: 6, xp: 9 }, { cost: 3, hun: 80, hap: 15, xp: 15 }],
    stage: [0, 40, 120], cd: 30000, gift: [2, 3, 4, 6], hungry: 25,
    names: ['Coco', 'Mochi', 'Lucky', 'Bubbles', 'Peanut', 'Cookie', 'Luna', 'Max', 'Bella', 'Milo', 'Daisy', 'Teddy', 'Pepper', 'Sunny', 'Ginger',
      'Oreo', 'Snowy', 'Tiger', 'Pudding', 'Nemo', 'Rocky', 'Honey', 'Momo', 'Kiki', 'Toto', 'Bobo', 'Nala', 'Simba', 'Pixel', 'Star'],
    max: { pets: 12, eggs: 3, trades: 3, gifts: 3 }
  };
  var S = null;                 // my pets and eggs: { pets, eggs, active, seen, trades, gifts, at }
  var trade = { st: 'off' };    // the trade I am in: { st: 'off' | 'ask' | 'pick', asker, who, name, mine, theirs, okMe, okThem }
  var WHY = {
    stars: 'Not enough stars yet.', level: 'Your level is not high enough yet.', eggs: 'The incubator is full. Hatch an egg first!',
    cold: 'This egg is not warm enough yet. Earn more stars!', full: 'Your pet home is full. A pet can move to the farm to make room.',
    fullup: 'Tummy is full!', tired: 'Your pet needs a little rest.', none: 'No gift right now.',
    active: 'This pet is walking with you. Pick another one first.', trading: 'This pet is in a trade right now.',
    gone: 'That player is not in the Pet Home.', busy: 'That player is busy with another trade.', busyme: 'You are in a trade already.',
    nopet: 'Hatch a pet first.', theirnopet: 'That player has no pet yet.', cap: 'No swaps left today. Come back tomorrow!',
    theircap: 'That player has no swaps left today.', empty: 'Please pick a name.'
  };
  var TRADE_OFF = { no: 'No swap this time.', cancel: 'The swap was cancelled.', left: 'The other player left. The swap is off.',
    timeout: 'That took too long. The swap is off.', cap: 'No swaps left today.' };

  function esc(s) { return api.esc(s === undefined || s === null ? '' : s); }
  function n3(o) { return '<b>' + esc(o.en) + '</b><span>' + esc(o.zh) + ' <span class="py">' + esc(o.py) + '</span></span><span>' + esc(o.ms) + '</span>'; }
  function petById(id) { var i; if (!S) return null; for (i = 0; i < S.pets.length; i++) if (S.pets[i].id === id) return S.pets[i]; return null; }
  function coins() { var m = api.me(); return m ? m.coins : 0; }
  function isSad(pet) { return pet.hun < CFG.hungry || pet.hap < 20; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function up(node, attr) { // the nearest element, from `node` upwards, that has this attribute
    while (node && node !== root && node.nodeType === 1) { if (node.getAttribute(attr) !== null) return node; node = node.parentNode; }
    return null;
  }
  function picHtml(sp, st, px, sil) { return '<span class="pets-pic" data-pic="' + sp + '|' + st + '|' + px + '|' + (sil ? 1 : 0) + '"></span>'; }
  function tagHtml(r) { var R = RARITY[r]; return '<span class="pets-tag pets-r' + r + '">' + esc(R.en) + ' · ' + esc(R.zh) + ' <span class="py">' + esc(R.py) + '</span> · ' + esc(R.ms) + '</span>'; }
  // fills the placeholders written by picHtml and the little icon canvases
  function fillPics(node) {
    var list = node.querySelectorAll('[data-pic]'), i, q, a, c;
    for (i = 0; i < list.length; i++) { q = list[i]; a = q.getAttribute('data-pic').split('|'); q.removeAttribute('data-pic'); q.appendChild(pic(+a[2], a[0], +a[1], a[3] === '1')); }
    list = node.querySelectorAll('canvas[data-ic]');
    for (i = 0; i < list.length; i++) {
      q = list[i]; a = q.getAttribute('data-ic'); q.removeAttribute('data-ic');
      c = q.getContext('2d'); c.setTransform(2, 0, 0, 2, 0, 0); c.translate(q.width / 4, q.height / 4);
      if (a.indexOf('egg') === 0) drawEgg(c, 0, q.height / 4 - 3, +a.slice(3), { scale: (q.height / 2 - 6) / 64, noShadow: true });
      else icon(c, a);
    }
  }

  // ---------- look ----------
  var CSS = [
    '.pets-root{background:#AEE6D1;color:#1B2A49;overflow:hidden;touch-action:none}',
    '.pets-root .py{font-family:system-ui,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif}',
    '.pets-cv{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none}',
    '.pets-top{position:absolute;left:10px;right:10px;top:8px;z-index:2;display:flex;gap:8px;align-items:center;pointer-events:none}',
    '.pets-top>*{pointer-events:auto;flex:none}',
    '.pets-top .btn{height:52px;padding:0 14px;font-size:19px;border-width:3px;white-space:nowrap}',
    '.pets-top .pill{height:52px;font-size:22px}',
    '.pets-top .pets-gap{flex:1;pointer-events:none}',
    '.pets-hb.pets-has{background:#FFD66B;animation:ftPulse .7s ease-in-out infinite alternate}',
    '.pets-act{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);height:64px;padding:0 28px;font-size:24px;white-space:nowrap;box-shadow:0 5px 0 rgba(27,42,73,.28)}',
    '.pets-act:active{transform:translateX(-50%) scale(.96)}',
    '.pets-dim{position:absolute;left:0;top:0;right:0;bottom:0;background:rgba(27,42,73,.5);display:flex;align-items:center;justify-content:center;padding:8px}',
    '.pets-panel{position:relative;z-index:3;background:#FFF3D6;border:5px solid #1B2A49;border-radius:26px;width:100%;max-width:800px;max-height:100%;display:flex;flex-direction:column;overflow:hidden;animation:petsIn .16s ease-out}',
    '@keyframes petsIn{from{opacity:0}to{opacity:1}}',
    '.pets-panel.pets-narrow{max-width:560px}',
    '.pets-ph{flex:none;display:flex;align-items:center;gap:10px;padding:6px 8px 2px 16px}',
    '.pets-pt{flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:baseline;gap:0 10px;line-height:1.15}',
    '.pets-pt b{font-size:26px}',
    '.pets-pt>span{font-size:15px;font-weight:600}',
    '.pets-ph .pill{height:44px;font-size:20px;flex:none}',
    '.pets-pb{flex:1;min-height:0;overflow-y:auto;touch-action:pan-y;-webkit-overflow-scrolling:touch;padding:4px 12px 12px;display:flex;flex-direction:column;gap:8px}',
    '.pets-pb>*{flex:none}',
    '.pets-pic{display:inline-flex;flex:none}',
    '.pets-pic canvas{display:block}',
    '.pets-n3{display:flex;flex-direction:column;line-height:1.15;font-size:13px;font-weight:600}',
    '.pets-n3 b{font-size:16px}',
    '.pets-tag{display:inline-block;padding:1px 9px;border:2px solid #1B2A49;border-radius:999px;font-size:13px;font-weight:700;line-height:1.35;white-space:nowrap;background:#E9EEF4}',
    '.pets-tag.pets-r1{background:#CFE6FF}', '.pets-tag.pets-r2{background:#E2D6FF}', '.pets-tag.pets-r3{background:#FFE9A8}',
    '.pets-small{font-size:15px;font-weight:600}',
    '.pets-big{font-size:24px;font-weight:700;line-height:1.15}',
    '.pets-center{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;font-size:20px;font-weight:600;padding:8px 4px;line-height:1.3}',
    // egg shop
    '.pets-eggs{display:flex;gap:12px;padding:6px 6px 2px}',
    '.pets-egg{flex:1;min-width:0;background:#fff;border:3px solid #1B2A49;border-radius:20px;padding:4px 6px 8px;display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center}',
    '.pets-egg.on{background:#FFF8DC;outline:4px solid #1B2A49;outline-offset:2px}',
    '.pets-egg:active{transform:scale(.97)}',
    '.pets-egg canvas{display:block}',
    '.pets-odds{display:flex;gap:2px 7px;font-size:13px;font-weight:700;flex-wrap:wrap;justify-content:center}',
    '.pets-odds i,.pets-leg i{display:inline-block;width:11px;height:11px;border-radius:50%;border:1.5px solid #1B2A49;margin-right:3px;vertical-align:-1px}',
    '.pets-need{font-size:14px;font-weight:600}',
    '.pets-price{background:#FFD66B;border:2.5px solid #1B2A49;border-radius:999px;padding:0 14px;font-size:18px;font-weight:700}',
    '.pets-egg.lock .pets-price{background:#E4E0D6}',
    '.pets-leg{display:flex;gap:2px 14px;flex-wrap:wrap;justify-content:center;font-size:13px;font-weight:600}',
    '.pets-buy{display:flex;align-items:center;gap:10px;background:#fff;border:3px solid #1B2A49;border-radius:20px;padding:6px 8px 6px 14px;min-height:72px}',
    '.pets-buyt{flex:1;min-width:0;font-size:16px;font-weight:600;line-height:1.25}',
    '.pets-sum{font-size:22px;font-weight:700}',
    '.pets-buy .btn{flex:none;white-space:nowrap}',
    // incubator, hatching, naming
    '.pets-slots{display:flex;gap:10px;justify-content:center}',
    '.pets-slot{flex:1;max-width:230px;background:#fff;border:3px solid #1B2A49;border-radius:20px;padding:6px;display:flex;flex-direction:column;align-items:center;gap:2px}',
    '.pets-slot canvas{display:block}',
    '.pets-slotl{min-height:58px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;text-align:center}',
    '.pets-slotl .btn{padding:0 26px}',
    '.pets-mut{opacity:.65;font-size:16px;font-weight:600}',
    '.pets-hatc{display:block;width:100%;height:230px;border-radius:18px;background:#E8F7FF;border:3px solid #1B2A49}',
    '.pets-rev{display:flex;align-items:center;gap:12px;min-height:76px}',
    '.pets-revt{flex:1;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:3px;font-size:17px;font-weight:600;line-height:1.2}',
    '.pets-revt .pets-big b{font-size:26px}',
    '.pets-new{background:#FFD66B;border:2.5px solid #1B2A49;border-radius:999px;padding:0 12px;font-weight:700;font-size:15px}',
    '.pets-rev .btn{flex:none;white-space:nowrap}',
    '.pets-nm{display:flex;gap:12px;align-items:center}',
    '.pets-nmc{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}',
    '.pets-nml{font-size:17px;font-weight:600}',
    '.pets-nmr{display:flex;gap:8px}',
    '.pets-in{flex:1;min-width:0;height:56px;border:3px solid #1B2A49;border-radius:16px;padding:0 14px;font-size:24px;font-weight:700;background:#fff;-webkit-user-select:text;user-select:text;touch-action:auto}',
    '.pets-names{display:flex;flex-wrap:wrap;gap:8px}',
    '.pets-names .chip{height:48px;min-width:48px;padding:0 13px;font-size:17px}',
    // caring for a pet
    '.pets-strip{display:flex;gap:9px;overflow-x:auto;touch-action:pan-x;-webkit-overflow-scrolling:touch;padding:6px 6px 7px}',
    '.pets-th{position:relative;flex:none;width:62px;height:62px;border-radius:16px;border:3px solid #1B2A49;background:#fff;padding:0;display:flex;align-items:center;justify-content:center}',
    '.pets-th.on{background:#FFD66B;outline:3px solid #1B2A49;outline-offset:2px}',
    '.pets-th canvas{display:block}',
    '.pets-strip.pets-tight{gap:7px;padding-left:4px;padding-right:4px}',
    '.pets-tight .pets-th{width:54px;height:54px;border-radius:14px}',
    '.pets-th i{position:absolute;right:-6px;top:-7px;font-style:normal;font-size:14px;line-height:1;background:#fff;border:2px solid #1B2A49;border-radius:999px;padding:2px 3px}',
    '.pets-care{display:flex;gap:10px;min-height:0}',
    '.pets-stage{position:relative;flex:none;width:230px;height:240px;border:3px solid #1B2A49;border-radius:20px;overflow:hidden;background:#E8F7FF}',
    '.pets-stage canvas{display:block;width:100%;height:100%}',
    '.pets-snote{position:absolute;left:6px;right:6px;bottom:6px;background:#fff;border:2.5px solid #1B2A49;border-radius:14px;padding:2px 8px;font-size:14px;font-weight:700;line-height:1.2;text-align:center}',
    '.pets-snote.bad{background:#FFE1E6}',
    '.pets-gift{position:absolute;right:6px;top:6px;width:62px;height:62px;border-radius:50%;border:3px solid #1B2A49;background:#FFD66B;font-size:30px;padding:0;animation:ftPulse .6s ease-in-out infinite alternate}',
    '.pets-side{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}',
    '.pets-nrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.pets-pn{font-size:26px;line-height:1.1}',
    '.pets-sp3{font-size:15px;font-weight:600}',
    '.pets-bars{display:grid;grid-template-columns:1fr 1fr;gap:4px 14px}',
    '.pets-bar{display:flex;align-items:center;gap:6px;font-size:15px;font-weight:700}',
    '.pets-bar>span{width:22px;text-align:center;font-size:16px;flex:none}',
    '.pets-bar>i{flex:1;height:16px;border-radius:999px;border:2.5px solid #1B2A49;background:#fff;overflow:hidden;display:block}',
    '.pets-bar>i>b{display:block;height:100%;background:#FF9F43}',
    '.pets-bar>i>b.p{background:#FF7FA8}', '.pets-bar>i>b.c{background:#5AA9FF}', '.pets-bar>i>b.x{background:#FFC933}',
    '.pets-bar.low>i>b{background:#E0304F}',
    '.pets-bar>em{font-style:normal;min-width:28px;text-align:right;flex:none}',
    '.pets-xpl{font-size:14px;font-weight:600}',
    '.pets-acts{display:flex;gap:8px}',
    '.pets-card{flex:1;min-width:0;background:#fff;border:3px solid #1B2A49;border-radius:18px;padding:3px 4px 6px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;text-align:center;min-height:96px}',
    '.pets-card:active{transform:scale(.97)}',
    '.pets-card:disabled{opacity:.5}',
    '.pets-card canvas{display:block;width:44px;height:44px}',
    '.pets-card.pets-wide{flex-direction:row;gap:14px}',
    '.pets-card.pets-wide canvas{width:56px;height:56px}',
    '.pets-eff{font-size:14px;font-weight:700}',
    '.pets-crow{display:flex;align-items:center;gap:6px;justify-content:center;flex-wrap:wrap}',
    '.pets-cost{background:#FFD66B;border:2.5px solid #1B2A49;border-radius:999px;padding:0 9px;font-size:15px;font-weight:700;white-space:nowrap}',
    '.pets-fsum{font-size:13px;font-weight:700;white-space:nowrap}',
    '.pets-ibtns{display:flex;gap:8px;flex-wrap:wrap}',
    '.pets-ibtns .btn{flex:1;white-space:nowrap;padding:0 12px;font-size:18px}',
    // the book
    '.pets-book{display:flex;gap:12px;align-items:stretch}',
    '.pets-grid{flex:none;display:grid;grid-template-columns:repeat(5,82px);gap:9px;padding:6px}',
    '.pets-cell{position:relative;width:82px;height:82px;border-radius:18px;border:3px solid #1B2A49;background:#fff;padding:0;display:flex;align-items:center;justify-content:center}',
    '.pets-cell.no{background:#E4E0D6}',
    '.pets-cell.on{outline:4px solid #1B2A49;outline-offset:2px;background:#FFF8DC}',
    '.pets-cell em{position:absolute;right:-5px;top:-7px;font-style:normal;font-size:13px;font-weight:700;background:#FFD66B;border:2px solid #1B2A49;border-radius:999px;padding:0 6px}',
    '.pets-det{flex:1;min-width:0;background:#fff;border:3px solid #1B2A49;border-radius:20px;padding:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;text-align:center;font-size:15px;font-weight:600}',
    '.pets-det .pets-n3{font-size:16px}', '.pets-det .pets-n3 b{font-size:24px}',
    '.pets-src{display:flex;gap:10px;align-items:center;justify-content:center;font-size:15px;font-weight:700}',
    '.pets-src span{display:flex;align-items:center;gap:2px}',
    '.pets-src canvas{width:26px;height:32px;display:block}',
    // trading
    '.pets-tlist{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}',
    '.pets-tp{width:150px;background:#fff;border:3px solid #1B2A49;border-radius:20px;padding:4px 6px 8px;display:flex;flex-direction:column;align-items:center;gap:1px;font-size:15px;font-weight:600}',
    '.pets-tp b{font-size:20px}',
    '.pets-tp canvas{display:block;width:80px;height:75px}',
    '.pets-tr{display:flex;align-items:stretch;gap:8px;justify-content:center}',
    '.pets-tcol{flex:1;max-width:300px;min-width:0;background:#fff;border:3px solid #1B2A49;border-radius:20px;padding:4px 6px;display:flex;flex-direction:column;align-items:center;gap:1px;text-align:center;font-size:14px;font-weight:600}',
    '.pets-tcol.ok{background:#DDF6D2}',
    '.pets-tl{font-size:17px;font-weight:700}',
    '.pets-tn{font-size:21px;line-height:1.1}',
    '.pets-tq{width:84px;height:84px;display:flex;align-items:center;justify-content:center;font-size:54px;font-weight:700;opacity:.35}',
    '.pets-tok{font-size:16px;font-weight:700;min-height:20px;color:#2E7A3C}',
    '.pets-tmid{align-self:center;font-size:40px;font-weight:700;flex:none}',
    '.pets-tbtns{display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap}',
    '.pets-tbtns .btn{white-space:nowrap}',
    '.pets-th.pets-b1,.pets-cell.pets-b1{border-color:#3B9BFF}', '.pets-th.pets-b2,.pets-cell.pets-b2{border-color:#9B6BFF}', '.pets-th.pets-b3,.pets-cell.pets-b3{border-color:#F0A800}',
    '@media (max-height:520px){.pets-pt b{font-size:22px}.pets-pb{gap:6px;padding-bottom:8px}.pets-hatc{height:200px}.pets-center{gap:7px;font-size:18px}}',
    '@media (max-width:700px){.pets-top .btn{padding:0 10px;font-size:17px}.pets-stage{width:170px}.pets-grid{grid-template-columns:repeat(4,70px)}.pets-cell{width:70px;height:70px}}'
  ].join('\n');
  function addStyle() {
    if (document.getElementById('pets-style')) return;
    var s = document.createElement('style'); s.id = 'pets-style'; s.textContent = CSS; document.head.appendChild(s);
  }

  // ---------- the room ----------
  // Room units: 1200 x 660. The wall ends at y = 250; people walk on the floor between (X0, Y0) and (X1, Y1).
  var RW = 1200, RH = 660, WALL = 250, X0 = 70, X1 = 1130, Y0 = 332, Y1 = 636;
  // ux, uy = where to stand to use it (rx, ry = how far that reaches), bx, by = its floating sign, hit = tap area
  var STN = [
    { id: 'shop', icon: '🥚', ux: 200, uy: 352, rx: 100, ry: 78, bx: 200, by: 62, hit: [76, 50, 326, 322], en: 'Egg Shop', zh: '蛋店', py: 'dàn diàn', ms: 'Kedai Telur' },
    { id: 'inc', icon: '🐣', ux: 500, uy: 352, rx: 100, ry: 78, bx: 500, by: 132, hit: [400, 150, 612, 322], en: 'Incubator', zh: '孵蛋器', py: 'fūdànqì', ms: 'Inkubator' },
    { id: 'home', icon: '🐾', ux: 727, uy: 352, rx: 92, ry: 78, bx: 727, by: 122, hit: [644, 140, 822, 322], en: 'My Pets', zh: '我的宠物', py: 'wǒ de chǒngwù', ms: 'Haiwan Saya' },
    { id: 'bath', icon: '🛁', ux: 965, uy: 352, rx: 116, ry: 78, bx: 965, by: 84, hit: [838, 100, 1096, 322], en: 'Bath', zh: '洗澡', py: 'xǐzǎo', ms: 'Mandi' },
    { id: 'feed', icon: '🍖', ux: 236, uy: 566, rx: 100, ry: 60, bx: 236, by: 404, hit: [130, 430, 340, 546], en: 'Food Bowl', zh: '食盆', py: 'shípén', ms: 'Mangkuk Makanan' },
    { id: 'trade', icon: '🤝', ux: 600, uy: 496, rx: 74, ry: 46, bx: 600, by: 366, hit: [540, 386, 660, 470], en: 'Trade Table', zh: '交换桌', py: 'jiāohuàn zhuō', ms: 'Meja Tukar' },
    { id: 'play', icon: '🎾', ux: 950, uy: 532, rx: 150, ry: 84, bx: 950, by: 404, hit: [806, 452, 1094, 612], en: 'Play Mat', zh: '游戏垫', py: 'yóuxì diàn', ms: 'Tikar Main' }
  ];
  var STN_BY = {};
  STN.forEach(function (s) { STN_BY[s.id] = s; });
  // things standing on the floor that cannot be walked through: [x0, y0, x1, y1]
  var BLOCKS = [[140, 500, 290, 540], [548, 438, 652, 466], [1016, 462, 1088, 490]];

  var el = {}, raf = 0, lastTs = 0, frameN = 0, W = 0, H = 0, dpr = 1, vs = 1, vx = 0, vy = 0, bg = null, sprites = {};
  var stick = null, my = { x: 600, y: 596, f: 1, m: 0 }, sent = { x: -1, y: -1, f: 1, m: 0, t: 0 }, needSpot = false, goal = null, tap = null;
  var others = {}, fols = {}, fxs = [], near = null, nearShown = 0, panel = null, pollTimer = 0, roomSig = '';

  function paw(c, x, y, s, col) {
    c.fillStyle = col;
    c.beginPath(); c.ellipse(x, y + 4 * s, 9 * s, 7 * s, 0, 0, TAU); c.fill();
    [[-9, -5], [-3.2, -10], [3.6, -10], [9.4, -5]].forEach(function (q) { c.beginPath(); c.arc(x + q[0] * s, y + q[1] * s, 3.5 * s, 0, TAU); c.fill(); });
  }
  function spark4(c, x, y, r) {
    c.beginPath(); c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r); c.closePath();
  }
  function fo(c, col, w) { c.fillStyle = col; c.fill(); c.lineWidth = w || 4; c.strokeStyle = NAVY; c.stroke(); }
  // the food bowl (origin: the middle of its base); sack = also the bag of food behind it
  function drawBowl(c, sack) {
    var i;
    if (sack) {
      c.fillStyle = SHADOW; c.beginPath(); c.ellipse(-6, 2, 78, 12, 0, 0, TAU); c.fill();
      c.save(); c.translate(-62, -6);
      poly(c, [-17, -76, 19, -76, 25, -93, -23, -93]); fo(c, '#E9CF90', 3.5);
      rr(c, -25, -80, 52, 80, 13); fo(c, '#F6E2B0');
      c.fillStyle = 'rgba(27,42,73,0.10)'; rr(c, 9, -78, 16, 76, 9); c.fill();
      c.beginPath(); c.moveTo(-19, -78); c.lineTo(21, -78); c.lineWidth = 6; c.strokeStyle = '#FF6FA5'; c.stroke();
      paw(c, -1, -40, 1.15, '#C98A4B');
      c.restore();
    }
    poly(c, [-40, -34, 40, -34, 31, 0, -31, 0]); fo(c, '#FF6B6B');
    c.fillStyle = 'rgba(27,42,73,0.13)'; poly(c, [12, -34, 40, -34, 31, 0, 8, 0]); c.fill();
    c.beginPath(); c.ellipse(0, -34, 41, 11, 0, 0, TAU); fo(c, '#FF9A9A');
    c.beginPath(); c.ellipse(0, -35, 32, 7.5, 0, 0, TAU); fo(c, '#B5773F', 2.5);
    c.fillStyle = '#8C5A2B'; for (i = 0; i < 9; i++) { c.beginPath(); c.arc(-24 + i * 6, -36 + (i % 3) * 2.2, 2.2, 0, TAU); c.fill(); }
    c.fillStyle = '#fff'; rr(c, -9, -19, 18, 6, 3); c.fill();
    [[-10, -19], [-10, -13], [10, -19], [10, -13]].forEach(function (q) { c.beginPath(); c.arc(q[0], q[1], 4, 0, TAU); c.fill(); });
  }
  function drawTable(c) {
    c.fillStyle = SHADOW; c.beginPath(); c.ellipse(8, 2, 46, 9, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(0, -3, 24, 7, 0, 0, TAU); fo(c, '#A56B38', 3);
    rr(c, -7, -46, 14, 44, 4); fo(c, '#B77B45', 3);
    c.beginPath(); c.ellipse(0, -44, 54, 17, 0, 0, TAU); fo(c, '#C98A4B');
    c.beginPath(); c.ellipse(0, -50, 54, 17, 0, 0, TAU); fo(c, '#F2C98A');
    c.save(); c.translate(0, -50); c.scale(1, 0.32); c.lineWidth = 9;
    c.beginPath(); c.arc(0, 0, 30, Math.PI * 1.12, Math.PI * 1.86); c.strokeStyle = '#FF6FA5'; c.stroke();
    poly(c, [36, -30, 40, -2, 16, -12]); c.fillStyle = '#FF6FA5'; c.fill();
    c.beginPath(); c.arc(0, 0, 30, Math.PI * 0.12, Math.PI * 0.86); c.strokeStyle = '#5AA9FF'; c.stroke();
    poly(c, [-36, 30, -40, 2, -16, 12]); c.fillStyle = '#5AA9FF'; c.fill();
    c.restore();
  }
  function drawToys(c) {
    c.fillStyle = SHADOW; c.beginPath(); c.ellipse(6, 2, 36, 8, 0, 0, TAU); c.fill();
    rr(c, -3, -76, 6, 70, 3); fo(c, '#F6E2B0', 3);
    [['#FF6B6B', 28], ['#FFD66B', 23], ['#7BD389', 18], ['#5AA9FF', 13]].forEach(function (q, i) {
      c.beginPath(); c.ellipse(0, -8 - i * 15, q[1], 9, 0, 0, TAU); fo(c, q[0], 3);
      c.beginPath(); c.ellipse(-q[1] * 0.45, -11 - i * 15, q[1] * 0.25, 2.4, 0, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.55)'; c.fill();
    });
    c.beginPath(); c.arc(0, -78, 6.5, 0, TAU); fo(c, '#FF8FC8', 3);
  }
  function drawBall(c) {
    c.fillStyle = SHADOW; c.beginPath(); c.ellipse(5, 1, 22, 6, 0, 0, TAU); c.fill();
    c.save(); c.translate(0, -19); c.scale(1.12, 1.12); icon(c, 'toy0'); c.restore();
  }
  // a floor prop, drawn once into a picture and then reused; (x, y) is where its base stands
  function prop(c, name, x, y, w, h, ox, oy, draw) {
    var s = sprites[name], q, k = dpr * vs;
    if (!s) {
      s = sprites[name] = document.createElement('canvas'); s.width = Math.ceil(w * k); s.height = Math.ceil(h * k);
      q = s.getContext('2d'); q.scale(k, k); q.translate(ox, oy); q.lineJoin = 'round'; q.lineCap = 'round';
      draw(q);
    }
    c.drawImage(s, x - ox, y - oy, w, h);
  }

  // Everything in the room that never moves, painted once per screen size: wall, floor, rugs, the stations at the wall.
  function buildBg() {
    var cv = document.createElement('canvas'), c, A, B, T, Z, x, y, i, n;
    cv.width = el.cv.width; cv.height = el.cv.height;
    c = cv.getContext('2d'); c.setTransform(dpr * vs, 0, 0, dpr * vs, vx * dpr, vy * dpr);
    c.lineJoin = 'round'; c.lineCap = 'round';
    A = -vx / vs - 2; B = (W - vx) / vs + 2; T = -vy / vs - 2; Z = RH + 4; // the part of the room this screen shows
    function ol(w) { c.lineWidth = w || 4; c.strokeStyle = NAVY; c.stroke(); }
    function lin(x0, y0, x1, y1, a, b) { var q = c.createLinearGradient(x0, y0, x1, y1); q.addColorStop(0, a); q.addColorStop(1, b); return q; }

    // wall with paw-print wallpaper, panelling and a skirting board
    c.fillStyle = lin(0, T, 0, WALL, '#CDF3E4', '#A9E4CF'); c.fillRect(A, T, B - A, WALL - T);
    for (y = WALL - 88, n = 0; y > T - 30; y -= 62, n++) for (x = Math.floor(A / 104) * 104 + (n % 2) * 52; x < B; x += 104) paw(c, x, y, 1, 'rgba(255,255,255,0.36)');
    c.fillStyle = '#FFF3D6'; c.fillRect(A, 196, B - A, 54);
    c.strokeStyle = 'rgba(27,42,73,0.09)'; c.lineWidth = 2; c.beginPath();
    for (x = Math.floor(A / 46) * 46; x < B; x += 46) { c.moveTo(x, 203); c.lineTo(x, 238); }
    c.stroke();
    c.fillStyle = '#F0D9A0'; c.fillRect(A, 190, B - A, 9); c.fillStyle = '#C98A4B'; c.fillRect(A, 240, B - A, 10);
    c.strokeStyle = NAVY; c.lineWidth = 3; c.beginPath(); c.moveTo(A, 190); c.lineTo(B, 190); c.moveTo(A, 199); c.lineTo(B, 199); c.moveTo(A, 240); c.lineTo(B, 240); c.moveTo(A, 250); c.lineTo(B, 250); c.stroke();
    // floor boards
    c.fillStyle = lin(0, WALL, 0, Z, '#F0C686', '#F8DBA9'); c.fillRect(A, WALL + 1.5, B - A, Z - WALL);
    c.strokeStyle = 'rgba(150,100,45,0.30)'; c.lineWidth = 2.5; c.beginPath();
    for (y = WALL + 46, n = 0; y < Z + 46; y += 46, n++) {
      c.moveTo(A, y); c.lineTo(B, y);
      for (x = Math.floor(A / 250) * 250 + (n * 137) % 250; x < B; x += 250) { c.moveTo(x, y - 46); c.lineTo(x, y); }
    }
    c.stroke();
    c.fillStyle = lin(0, WALL, 0, WALL + 34, 'rgba(27,42,73,0.20)', 'rgba(27,42,73,0)'); c.fillRect(A, WALL + 1.5, B - A, 34);

    // a window between the incubator and the pet house
    rr(c, 528, 28, 164, 100, 20); fo(c, '#fff');
    rr(c, 537, 37, 146, 82, 13); c.fillStyle = lin(0, 37, 0, 119, '#9EDBFF', '#E3F6FF'); c.fill();
    c.save(); rr(c, 537, 37, 146, 82, 13); c.clip();
    c.fillStyle = '#FFE27A'; c.beginPath(); c.arc(654, 62, 15, 0, TAU); c.fill();
    c.fillStyle = '#fff'; [[560, 80, 12], [576, 73, 15], [594, 81, 11]].forEach(function (q) { c.beginPath(); c.arc(q[0], q[1], q[2], 0, TAU); c.fill(); });
    c.fillStyle = '#8FD39A'; c.beginPath(); c.ellipse(580, 128, 80, 24, 0, 0, TAU); c.fill(); c.beginPath(); c.ellipse(670, 130, 60, 26, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)'; poly(c, [546, 119, 580, 37, 602, 37, 568, 119]); c.fill();
    c.restore();
    rr(c, 537, 37, 146, 82, 13); ol(3);
    c.beginPath(); c.moveTo(610, 38); c.lineTo(610, 118); c.lineWidth = 9; c.strokeStyle = NAVY; c.stroke(); c.lineWidth = 4; c.strokeStyle = '#fff'; c.stroke();
    rr(c, 518, 123, 184, 13, 6); fo(c, '#F0D9A0', 3.5);
    // a picture
    rr(c, 336, 118, 56, 66, 8); fo(c, '#fff', 3.5); rr(c, 343, 125, 42, 52, 4); c.fillStyle = '#FFE1EC'; c.fill(); ol(2);
    heartP(c, 364, 151, 11); c.fillStyle = '#FF7FA8'; c.fill(); ol(2);
    // both ends of the room: a pillar and a plant
    [[-8, 1], [RW + 8, -1]].forEach(function (q) {
      var px = q[0] + q[1] * 46, py = 320, L = [[-16, -72, 17], [16, -74, 17], [0, -100, 20], [0, -66, 15]];
      c.fillStyle = 'rgba(27,42,73,0.10)';
      if (q[1] > 0) c.fillRect(A, T, q[0] - A, Z - T); else c.fillRect(q[0], T, B - q[0], Z - T);
      rr(c, q[0] - 13, T - 20, 26, WALL - T + 22, 8); fo(c, '#E9C98F');
      c.fillStyle = SHADOW; c.beginPath(); c.ellipse(px + 8, py + 2, 34, 8, 0, 0, TAU); c.fill();
      c.strokeStyle = NAVY; c.lineWidth = 8; L.forEach(function (b) { c.beginPath(); c.arc(px + b[0], py + b[1], b[2], 0, TAU); c.stroke(); });
      c.fillStyle = '#2F8548'; L.forEach(function (b) { c.beginPath(); c.arc(px + b[0], py + b[1], b[2], 0, TAU); c.fill(); });
      c.fillStyle = '#48A85F'; [[-19, -76, 10], [12, -79, 10], [-4, -106, 12]].forEach(function (b) { c.beginPath(); c.arc(px + b[0], py + b[1], b[2], 0, TAU); c.fill(); });
      poly(c, [px - 22, py - 46, px + 22, py - 46, px + 16, py, px - 16, py]); fo(c, '#FF9F6B', 3.5);
      rr(c, px - 26, py - 53, 52, 12, 5); fo(c, '#FFB68A', 3.5);
    });

    // rugs on the floor (each has a little thickness): the round rug, the feeding mat, the play mat, the door mat
    c.beginPath(); c.ellipse(600, 490, 226, 78, 0, 0, TAU); fo(c, '#D9739A');
    c.beginPath(); c.ellipse(600, 484, 226, 78, 0, 0, TAU); fo(c, '#FFB3C7');
    c.beginPath(); c.ellipse(600, 484, 198, 64, 0, 0, TAU); c.strokeStyle = '#fff'; c.lineWidth = 6; c.setLineDash([1, 17]); c.stroke(); c.setLineDash([]);
    rr(c, 114, 492, 248, 104, 38); fo(c, '#86B6DE');
    rr(c, 114, 486, 248, 104, 38); fo(c, '#BFE3FF');
    rr(c, 128, 500, 220, 76, 26); c.strokeStyle = '#fff'; c.lineWidth = 5; c.setLineDash([1, 15]); c.stroke(); c.setLineDash([]);
    rr(c, 804, 458, 292, 160, 16); fo(c, '#6FA8C9');
    c.save(); rr(c, 804, 452, 292, 160, 16); c.clip();
    for (i = 0; i < 8; i++) { c.fillStyle = ['#FFD66B', '#7FD4FF', '#FF9EC4', '#8FE3C8'][(i + (i > 3 ? 2 : 0)) % 4]; c.fillRect(804 + (i % 4) * 73, 452 + (i > 3 ? 80 : 0), 73, 80); }
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 4; c.beginPath();
    for (i = 1; i < 4; i++) { c.moveTo(804 + i * 73, 452); c.lineTo(804 + i * 73, 612); }
    c.moveTo(804, 532); c.lineTo(1096, 532); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.6)';
    starP(c, 840, 492, 17); c.fill(); c.beginPath(); c.arc(986, 492, 15, 0, TAU); c.fill(); heartP(c, 913, 574, 15); c.fill(); poly(c, [1059, 556, 1077, 588, 1041, 588]); c.fill();
    c.restore();
    rr(c, 804, 452, 292, 160, 16); ol(4);
    rr(c, 528, 628, 144, 28, 9); fo(c, '#C98A4B', 3.5);
    c.strokeStyle = '#E9B872'; c.lineWidth = 3; c.beginPath(); for (x = 544; x < 664; x += 14) { c.moveTo(x, 634); c.lineTo(x, 650); } c.stroke();

    // ----- egg shop: a counter with a striped awning and one egg of each kind -----
    c.fillStyle = SHADOW; poly(c, [310, 320, 356, 320, 372, 302, 326, 302]); c.fill();
    poly(c, [308, 240, 324, 228, 324, 306, 308, 318]); fo(c, '#E0739F');
    rr(c, 92, 238, 216, 80, 10); c.fillStyle = '#FF9EC4'; c.fill();
    c.save(); rr(c, 92, 238, 216, 80, 10); c.clip();
    c.fillStyle = 'rgba(255,255,255,0.55)'; for (x = 112; x < 308; x += 44) c.fillRect(x, 238, 20, 80);
    c.fillStyle = 'rgba(27,42,73,0.10)'; c.fillRect(92, 300, 216, 18);
    c.restore(); rr(c, 92, 238, 216, 80, 10); ol(4);
    heartP(c, 200, 278, 13); c.fillStyle = '#fff'; c.fill(); ol(2.5);
    poly(c, [92, 240, 308, 240, 324, 228, 108, 228]); fo(c, '#FFE3EE');
    rr(c, 99, 118, 9, 114, 4); fo(c, '#fff', 3); rr(c, 291, 118, 9, 114, 4); fo(c, '#fff', 3);
    for (i = 0; i < 6; i++) {
      c.beginPath(); c.moveTo(86 + i * 38, 96); c.lineTo(86 + (i + 1) * 38, 96); c.lineTo(74 + (i + 1) * 42, 124);
      c.arc(74 + (i + 0.5) * 42, 124, 21, 0, Math.PI); c.closePath(); fo(c, i % 2 ? '#fff' : '#FF6FA5', 3);
    }
    rr(c, 82, 87, 236, 12, 5); fo(c, '#E0447F', 3);
    for (i = 0; i < 3; i++) {
      c.beginPath(); c.ellipse(140 + i * 60, 234, 20, 6, 0, 0, TAU); fo(c, '#E8C27A', 2.5);
      drawEgg(c, 140 + i * 60, 233, i, { scale: 0.62, noShadow: true });
    }

    // ----- incubator: a machine with three glass domes -----
    c.fillStyle = SHADOW; poly(c, [598, 320, 644, 320, 656, 304, 610, 304]); c.fill();
    rr(c, 414, 230, 192, 80, 14); fo(c, '#9FB1D0');
    rr(c, 404, 240, 192, 78, 14); c.fillStyle = lin(0, 240, 0, 318, '#EEF3FB', '#C9D6EC'); c.fill(); ol(4);
    for (i = 0; i < 3; i++) {
      x = 445 + i * 55;
      c.beginPath(); c.ellipse(x, 236, 19, 6, 0, 0, TAU); fo(c, '#E8C27A', 2.5);
      c.beginPath(); c.moveTo(x - 25, 242); c.lineTo(x - 25, 184); c.arc(x, 184, 25, Math.PI, 0); c.lineTo(x + 25, 242); c.closePath();
      c.fillStyle = 'rgba(214,240,255,0.5)'; c.fill(); ol(3);
      c.beginPath(); c.arc(x, 184, 17, Math.PI * 1.08, Math.PI * 1.42); c.lineWidth = 3.5; c.strokeStyle = 'rgba(255,255,255,0.95)'; c.stroke();
      rr(c, x - 28, 238, 56, 10, 5); fo(c, '#8FA3C8', 3);
      rr(c, x - 21, 257, 42, 12, 6); fo(c, '#fff', 2.5);
    }
    c.beginPath(); c.arc(430, 296, 9, 0, TAU); fo(c, '#FFD66B', 2.5); c.beginPath(); c.moveTo(430, 296); c.lineTo(435, 290); ol(2.5);
    rr(c, 452, 288, 96, 16, 8); fo(c, '#DDE6F5', 2.5);
    c.beginPath(); for (x = 464; x < 542; x += 12) { c.moveTo(x, 292.5); c.lineTo(x, 299.5); } c.lineWidth = 2.5; c.strokeStyle = 'rgba(27,42,73,0.35)'; c.stroke();
    c.beginPath(); c.arc(570, 296, 9, 0, TAU); fo(c, '#FF8FA3', 2.5);

    // ----- the pet house: where my pets live -----
    c.fillStyle = SHADOW; poly(c, [794, 320, 844, 320, 858, 302, 808, 302]); c.fill();
    poly(c, [792, 212, 806, 200, 806, 306, 792, 318]); fo(c, '#D9A93A');
    rr(c, 662, 204, 130, 114, 8); fo(c, '#FFD66B');
    c.fillStyle = 'rgba(27,42,73,0.10)'; c.fillRect(664, 214, 126, 12);
    poly(c, [727, 148, 741, 138, 822, 200, 808, 212]); fo(c, '#C7473C');
    poly(c, [644, 214, 727, 148, 810, 214]); fo(c, '#FF7A6B');
    c.fillStyle = 'rgba(255,255,255,0.22)'; poly(c, [658, 209, 727, 154, 742, 166, 690, 209]); c.fill();
    c.beginPath(); c.moveTo(699, 318); c.lineTo(699, 274); c.arc(727, 274, 28, Math.PI, 0); c.lineTo(755, 318); c.closePath(); fo(c, '#6B4226');
    c.beginPath(); c.ellipse(727, 313, 24, 6, 0, 0, TAU); fo(c, '#FF9EC4', 2.5);
    c.beginPath(); c.arc(727, 226, 13, 0, TAU); fo(c, '#fff', 3); paw(c, 727, 226, 0.72, NAVY);

    // ----- bath: tiles, a shower and a tub full of foam -----
    rr(c, 838, 104, 256, 142, 14); c.fillStyle = '#DDF3FF'; c.fill();
    c.save(); rr(c, 838, 104, 256, 142, 14); c.clip(); c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath();
    for (x = 870; x < 1094; x += 32) { c.moveTo(x, 104); c.lineTo(x, 246); }
    for (y = 136; y < 246; y += 32) { c.moveTo(838, y); c.lineTo(1094, y); }
    c.stroke(); c.restore();
    rr(c, 838, 104, 256, 142, 14); c.lineWidth = 3; c.strokeStyle = 'rgba(27,42,73,0.4)'; c.stroke();
    c.beginPath(); c.moveTo(1064, 236); c.lineTo(1064, 150); c.quadraticCurveTo(1064, 128, 1040, 128);
    c.lineWidth = 11; c.strokeStyle = NAVY; c.stroke(); c.lineWidth = 5; c.strokeStyle = '#C9D2E0'; c.stroke();
    c.beginPath(); c.ellipse(1034, 133, 17, 8, -0.25, 0, TAU); fo(c, '#AEB6C4', 3);
    c.fillStyle = SHADOW; c.beginPath(); c.ellipse(985, 318, 124, 12, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(884, 312, 13, 7, 0, 0, TAU); fo(c, '#FFC933', 3); c.beginPath(); c.ellipse(1050, 312, 13, 7, 0, 0, TAU); fo(c, '#FFC933', 3);
    function tub() { c.beginPath(); c.moveTo(850, 240); c.lineTo(1084, 240); c.bezierCurveTo(1084, 290, 1064, 310, 1040, 310); c.lineTo(894, 310); c.bezierCurveTo(870, 310, 850, 290, 850, 240); c.closePath(); }
    tub(); c.fillStyle = lin(850, 0, 1084, 0, '#FFFFFF', '#D9E4F1'); c.fill();
    c.save(); tub(); c.clip(); c.fillStyle = '#7FD4FF'; c.fillRect(840, 264, 260, 12); c.restore();
    tub(); ol(4);
    n = [[866, 232, 12], [886, 225, 15], [910, 230, 13], [934, 223, 16], [960, 229, 14], [986, 223, 16], [1012, 229, 14], [1036, 224, 15], [1062, 231, 12]];
    c.strokeStyle = NAVY; c.lineWidth = 6; n.forEach(function (q) { c.beginPath(); c.arc(q[0], q[1], q[2], 0, TAU); c.stroke(); });
    c.fillStyle = '#fff'; n.forEach(function (q) { c.beginPath(); c.arc(q[0], q[1], q[2], 0, TAU); c.fill(); });
    rr(c, 842, 234, 250, 15, 7.5); fo(c, '#F4F8FC', 3.5);
    c.beginPath(); c.ellipse(902, 215, 13, 9.5, 0, 0, TAU); fo(c, '#FFD94D', 3); c.beginPath(); c.arc(911, 203, 7.5, 0, TAU); fo(c, '#FFD94D', 3);
    poly(c, [917, 202, 925, 204.5, 917, 207]); fo(c, '#FF8A2B', 2); c.beginPath(); c.arc(912.5, 201.5, 1.5, 0, TAU); c.fillStyle = NAVY; c.fill();
    return cv;
  }

  function wob(t, i) { var u = (t * 0.8 + i * 0.33) % 1; return u < 0.45 ? Math.sin(u / 0.45 * TAU * 3) * 0.16 : 0; }
  // the parts of the stations that move: my eggs in the incubator, bubbles over the bath, sleepy z's
  function dyn(c, t) {
    var i, e, x, y, f, u;
    for (i = 0; i < 3; i++) {
      e = S && S.eggs[i]; x = 445 + i * 55;
      if (!e) continue;
      f = Math.min(1, e.have / e.need);
      drawEgg(c, x, 234, e.k, { scale: 0.6, noShadow: true, rot: f >= 1 ? wob(t, i) : 0 });
      if (f > 0.05) { rr(c, x - 19, 259, 38 * f, 8, 4); c.fillStyle = f >= 1 ? '#4FA05A' : '#FF9F43'; c.fill(); }
      if (f >= 1) {
        y = 150 - Math.abs(Math.sin(t * 4 + i)) * 8;
        c.beginPath(); c.arc(x, y, 12, 0, TAU); c.fillStyle = '#FF4F6D'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke();
        c.font = '700 18px ' + api.FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText('!', x, y + 1);
      }
    }
    for (i = 0; i < 5; i++) {
      u = (t * 0.2 + i * 0.21) % 1; x = 876 + i * 42 + Math.sin(t * 1.3 + i * 2) * 7; y = 214 - u * 78;
      c.globalAlpha = u > 0.75 ? (1 - u) * 4 : 1;
      c.beginPath(); c.arc(x, y, 4.5 + (i % 3) * 2.4, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.75)'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#5AA9FF'; c.stroke();
      c.globalAlpha = 1;
    }
    if (S && S.pets.length > 1) {
      c.font = '700 20px ' + api.FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = NAVY;
      for (i = 0; i < 3; i++) { u = (t * 0.3 + i * 0.33) % 1; c.globalAlpha = (1 - u) * 0.8; c.fillText('z', 752 + u * 26 + i * 3, 262 - u * 44); }
      c.globalAlpha = 1;
    }
  }
  function badges(c, t) {
    STN.forEach(function (s, i) {
      var on = near === s, y = s.by + Math.sin(t * 2.2 + i) * 3, r = on ? 26 : 21, dot = false;
      c.beginPath(); c.arc(s.bx + 2, y + 3, r, 0, TAU); c.fillStyle = 'rgba(27,42,73,0.22)'; c.fill();
      c.beginPath(); c.arc(s.bx, y, r, 0, TAU); c.fillStyle = on ? '#FFD66B' : '#fff'; c.fill(); c.lineWidth = 3.5; c.strokeStyle = NAVY; c.stroke();
      c.font = (on ? 28 : 22) + 'px ' + api.FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = NAVY; c.fillText(s.icon, s.bx, y + 2);
      if (s.id === 'home' && S) S.pets.forEach(function (q) { if (q.gift) dot = true; });
      if (dot) { c.beginPath(); c.arc(s.bx + r * 0.75, y - r * 0.75, 8, 0, TAU); c.fillStyle = '#FF4F6D'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#fff'; c.stroke(); }
    });
  }
  // little things that float up and fade: hearts, bubbles, sparkles, words
  function emit(list, k, x, y, n, txt) {
    for (var i = 0; i < n; i++) list.push({ k: k, x: x + (n > 1 ? rnd(-24, 24) : 0), y: y + (n > 1 ? rnd(-12, 12) : 0), vx: rnd(-22, 22), vy: -rnd(38, 78), t0: Date.now() + i * 110, life: 1200, s: rnd(0.8, 1.25), txt: txt });
  }
  function drawFx(c, list) {
    var now = Date.now(), i, p, u, x, y;
    for (i = list.length - 1; i >= 0; i--) {
      p = list[i]; u = (now - p.t0) / p.life;
      if (u >= 1) { list.splice(i, 1); continue; }
      if (u < 0) continue;
      x = p.x + p.vx * u; y = p.y + p.vy * u * p.life / 1000;
      c.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1;
      if (p.k === 'heart') { heartP(c, x, y, 8 * p.s); c.fillStyle = '#FF5C8A'; c.fill(); c.lineWidth = 2; c.strokeStyle = NAVY; c.stroke(); }
      else if (p.k === 'bub') {
        c.beginPath(); c.arc(x, y, 7.5 * p.s, 0, TAU); c.fillStyle = 'rgba(200,236,255,0.8)'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#3B9BFF'; c.stroke();
        c.beginPath(); c.arc(x, y, 4.4 * p.s, Math.PI * 1.05, Math.PI * 1.5); c.strokeStyle = '#fff'; c.stroke();
      } else if (p.k === 'spark') { spark4(c, x, y, 10 * p.s); c.fillStyle = '#FFD23F'; c.fill(); c.lineWidth = 1.8; c.strokeStyle = NAVY; c.stroke(); }
      else {
        c.font = '700 22px ' + api.FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
        c.lineWidth = 5; c.strokeStyle = NAVY; c.strokeText(p.txt, x, y); c.fillStyle = '#FFD66B'; c.fillText(p.txt, x, y);
      }
      c.globalAlpha = 1;
    }
  }
  function bubble(c, x, y, txt) { // a small thought bubble over a pet
    c.beginPath(); c.arc(x, y - 15, 15, 0, TAU); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = NAVY; c.stroke();
    c.beginPath(); c.arc(x - 9, y + 3, 3, 0, TAU); c.fill(); c.stroke();
    c.font = '17px ' + api.FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = NAVY; c.fillText(txt, x, y - 14);
  }

  function resize() {
    if (!root) return;
    dpr = Math.min(2, window.devicePixelRatio || 1); W = root.clientWidth || window.innerWidth; H = root.clientHeight || window.innerHeight;
    el.cv.width = Math.round(W * dpr); el.cv.height = Math.round(H * dpr);
    vs = Math.min(W / RW, H / RH); vx = (W - RW * vs) / 2; vy = H - RH * vs;
    bg = null; sprites = {};
    fitPanel();
  }
  function blocked(x, y) {
    for (var i = 0; i < BLOCKS.length; i++) if (x > BLOCKS[i][0] && x < BLOCKS[i][2] && y > BLOCKS[i][1] && y < BLOCKS[i][3]) return true;
    return false;
  }
  function reach(s, x, y) { var dx = (x - s.ux) / s.rx, dy = (y - s.uy) / s.ry; return dx * dx + dy * dy; }
  // does the straight walk from (x0, y0) to (x1, y1) bump into something standing on the floor?
  function hits(x0, y0, x1, y1) {
    var n = Math.max(2, Math.ceil(Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)) / 10)), i, k, x, y, b;
    for (i = 1; i <= n; i++) {
      x = x0 + (x1 - x0) * i / n; y = y0 + (y1 - y0) * i / n;
      for (k = 0; k < BLOCKS.length; k++) { b = BLOCKS[k]; if (x > b[0] - 4 && x < b[2] + 4 && y > b[1] - 4 && y < b[3] + 4) return true; }
    }
    return false;
  }
  // The points to walk through to get from (x, y) to (gx, gy): straight there, or round the corners of what is in the way.
  function route(x, y, gx, gy) {
    var nodes = [[x, y], [gx, gy]], dist = [], prev = [], done = [], path = [], i, j, best, d, P = 16;
    if (!hits(x, y, gx, gy)) return [[gx, gy]];
    BLOCKS.forEach(function (b) {
      [[b[0] - P, b[1] - P], [b[2] + P, b[1] - P], [b[0] - P, b[3] + P], [b[2] + P, b[3] + P]].forEach(function (q) {
        if (q[0] >= X0 && q[0] <= X1 && q[1] >= Y0 && q[1] <= Y1) nodes.push(q);
      });
    });
    for (i = 0; i < nodes.length; i++) { dist[i] = i ? Infinity : 0; prev[i] = -1; }
    for (;;) { // shortest way through the corners
      best = -1;
      for (i = 0; i < nodes.length; i++) if (!done[i] && (best < 0 || dist[i] < dist[best])) best = i;
      if (best < 0 || dist[best] === Infinity || best === 1) break;
      done[best] = true;
      for (j = 0; j < nodes.length; j++) {
        if (done[j] || hits(nodes[best][0], nodes[best][1], nodes[j][0], nodes[j][1])) continue;
        d = dist[best] + Math.sqrt(Math.pow(nodes[j][0] - nodes[best][0], 2) + Math.pow(nodes[j][1] - nodes[best][1], 2));
        if (d < dist[j]) { dist[j] = d; prev[j] = best; }
      }
    }
    if (dist[1] === Infinity) return [[gx, gy]];
    for (i = 1; i > 0; i = prev[i]) path.unshift(nodes[i]);
    return path;
  }
  // (x, y), or the nearest spot beside it when that is inside or squeezed against something on the floor
  function clearOf(x, y) {
    var i, b, l, r, t, d, m;
    for (i = 0; i < BLOCKS.length; i++) {
      b = BLOCKS[i];
      if (x > b[0] - 6 && x < b[2] + 6 && y > b[1] - 6 && y < b[3] + 6) {
        l = x - b[0]; r = b[2] - x; t = y - b[1]; d = b[3] - y; m = Math.min(l, r, t, d);
        if (m === d) y = b[3] + 9; else if (m === t) y = b[1] - 9; else if (m === l) x = b[0] - 9; else x = b[2] + 9;
      }
    }
    return [api.clamp(x, X0, X1), api.clamp(y, Y0, Y1)];
  }
  function walkTo(x, y, station) {
    var from = clearOf(my.x, my.y), to = clearOf(api.clamp(x, X0, X1), api.clamp(y, Y0, Y1)), pts = route(from[0], from[1], to[0], to[1]);
    if (from[0] !== my.x || from[1] !== my.y) pts.unshift(from); // first one step away from what I am standing against
    goal = { pts: pts, s: station || null, until: lastTs + 8000 };
  }

  function step(dt, now) {
    var v = { x: 0, y: 0 }, l, sp, nx, ny, dx, dy, d, s, q, best = null, bd = 1, ps = api.players(), meId = api.myId(), k = Math.min(1, dt * 14);
    if (!panel && stick) v = stick.read();
    l = Math.sqrt(v.x * v.x + v.y * v.y);
    if (l > 1) { v.x /= l; v.y /= l; l = 1; }
    if (l > 0.12 || panel) goal = null;
    else if (goal) { // a tap on the floor or on a station: walk there
      q = goal.pts[0]; dx = q[0] - my.x; dy = q[1] - my.y; d = Math.sqrt(dx * dx + dy * dy);
      if (d < 9 && goal.pts.length > 1) { goal.pts.shift(); q = goal.pts[0]; dx = q[0] - my.x; dy = q[1] - my.y; d = Math.sqrt(dx * dx + dy * dy); }
      if (d < 9 || now > goal.until) { s = goal.s; goal = null; if (s && reach(s, my.x, my.y) < 1) openStation(s.id); }
      else { v.x = dx / d; v.y = dy / d; l = 1; }
    }
    if (l > 0.12) {
      sp = 270 * dt;
      nx = api.clamp(my.x + v.x * sp, X0, X1); ny = api.clamp(my.y + v.y * sp, Y0, Y1);
      if (!blocked(nx, my.y)) my.x = nx;
      if (!blocked(my.x, ny)) my.y = ny;
      if (v.x > 0.1) my.f = 1; else if (v.x < -0.1) my.f = -1;
      my.m = 1;
    } else my.m = 0;
    if (now - sent.t > 90 && (my.x !== sent.x || my.y !== sent.y || my.m !== sent.m || my.f !== sent.f)) {
      api.send({ t: 'pets.pos', x: Math.round(my.x), y: Math.round(my.y), f: my.f, m: my.m });
      sent.x = my.x; sent.y = my.y; sent.m = my.m; sent.f = my.f; sent.t = now;
    }
    Object.keys(others).forEach(function (id) { var o = others[id]; o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; });
    // every walking pet in the room trots after its owner
    Object.keys(ps).forEach(function (id) {
      var p = ps[id], o = p.id === meId ? my : others[id], f;
      if (p.room !== 'pets' || !o || !p.ext || !p.ext.pets) { delete fols[id]; return; }
      f = fols[id] || (fols[id] = { x: o.x - o.f * 56, y: o.y + 8, f: o.f, m: 0, joy: 0 });
      follow(f, o.x, o.y, o.f, dt, 330);
    });
    Object.keys(fols).forEach(function (id) { if (!ps[id]) delete fols[id]; });
    // which station am I standing at?
    STN.forEach(function (q) { var r = reach(q, my.x, my.y); if (r < bd) { bd = r; best = q; } });
    near = best;
    if (!panel && nearShown !== (near ? near.id : 0)) {
      nearShown = near ? near.id : 0;
      el.act.hidden = !near;
      if (near) el.act.textContent = near.icon + ' ' + near.en;
    }
  }

  function drawRoom(t) {
    var c = el.ctx, items = [], ps = api.players(), meId = api.myId(), now = Date.now(), i;
    if (!bg) bg = buildBg();
    c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(bg, 0, 0);
    c.setTransform(dpr * vs, 0, 0, dpr * vs, vx * dpr, vy * dpr);
    c.lineJoin = 'round'; c.lineCap = 'round';
    dyn(c, t);
    items.push({ y: 528, d: function () { prop(c, 'bowl', 230, 528, 240, 140, 150, 118, function (q) { drawBowl(q, true); }); } });
    items.push({ y: 452, d: function () { prop(c, 'table', 600, 452, 150, 100, 70, 84, drawTable); } });
    items.push({ y: 478, d: function () { prop(c, 'toys', 1052, 478, 100, 110, 44, 96, drawToys); } });
    items.push({ y: 586, d: function () { prop(c, 'ball', 856, 586, 70, 60, 30, 50, drawBall); } });
    Object.keys(ps).forEach(function (id) {
      var p = ps[id], isMe = p.id === meId, o = isMe ? my : others[id], f = fols[id];
      if (p.room !== 'pets' || !o) return;
      items.push({ y: o.y, d: function () {
        c.fillStyle = 'rgba(27,42,73,0.18)'; c.beginPath(); c.ellipse(o.x, o.y, 30, 9, 0, 0, TAU); c.fill();
        var h = api.drawAvatar(c, p, o.x, o.y, t + p.id * 0.7, { facing: o.f, moving: !!o.m });
        api.nameTag(c, p, o.x, o.y - h - 8, isMe);
      } });
      if (f && p.ext && p.ext.pets && PET[p.ext.pets.s]) items.push({ y: f.y, d: function () {
        var e = p.ext.pets, mine = isMe && S ? petById(S.active) : null, top;
        top = f.y - 6 - drawPet(c, f.x, f.y, e.s, { scale: PET_K, stage: e.g, facing: f.f, t: t, moving: !!f.m, sad: e.m === 0, joy: f.joy > now, dirty: !!mine && mine.cl < 40, seed: p.id });
        api.label(c, String(e.n), f.x, f.y + 31, isMe ? '#FFD66B' : '#fff', NAVY, 13);
        if (mine && mine.gift) bubble(c, f.x - o.f * 14, top, '🎁');
        else if (e.m === 0) bubble(c, f.x - o.f * 14, top, '🍖');
      } });
    });
    items.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < items.length; i++) items[i].d();
    badges(c, t);
    drawFx(c, fxs);
    if (goal && !goal.s) { // where a tap on the floor is taking me
      i = goal.pts[goal.pts.length - 1];
      c.beginPath(); c.ellipse(i[0], i[1], 16 + Math.sin(t * 8) * 3, 6 + Math.sin(t * 8), 0, 0, TAU); c.lineWidth = 3; c.strokeStyle = 'rgba(27,42,73,0.45)'; c.stroke();
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (stick && !panel) stick.draw(c);
  }

  function frame(ts) {
    if (!root) return;
    raf = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts; frameN++;
    step(dt, ts);
    if (!panel || frameN % 4 === 0) drawRoom(ts / 1000); // behind a panel the room only needs a slow redraw
    if (panel) {
      if (panel.draw) panel.draw(ts / 1000);
      if (panel.tick && frameN % 12 === 0) panel.tick();
    }
  }

  // ---------- taps in the room ----------
  function tapDown(e) { tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now() }; }
  function tapUp(e) {
    var q = tap, r, x, y, i, s, f, o, ps, id;
    tap = null;
    if (!q || q.id !== e.pointerId || panel) return;
    if (Math.abs(e.clientX - q.x) + Math.abs(e.clientY - q.y) > 14 || Date.now() - q.t > 450) return; // that was a drag: walking
    r = el.cv.getBoundingClientRect(); x = (e.clientX - r.left - vx) / vs; y = (e.clientY - r.top - vy) / vs;
    f = fols[api.myId()];
    if (f && Math.abs(x - f.x) < 36 && y < f.y + 12 && y > f.y - 84) { api.sfx('open'); showPanel(panelCare('info')); return; }
    ps = api.players();
    for (id in others) {
      o = others[id];
      if (ps[id] && ps[id].room === 'pets' && Math.abs(x - o.x) < 34 && y < o.y + 10 && y > o.y - 112) { api.sfx('open'); showPanel(panelTrade()); return; }
    }
    for (i = 0; i < STN.length; i++) {
      s = STN[i];
      if (x > s.hit[0] && x < s.hit[2] && y > s.hit[1] && y < s.hit[3]) {
        if (reach(s, my.x, my.y) < 1) openStation(s.id);
        else walkTo(s.ux, s.uy, s);
        return;
      }
    }
    if (y > Y0 - 40) walkTo(x, y, null);
  }
  function openStation(id) {
    goal = null; api.sfx('open');
    if (id === 'shop') showPanel(panelShop());
    else if (id === 'inc') showPanel(panelInc());
    else if (id === 'home') showPanel(panelCare('info'));
    else if (id === 'bath') showPanel(panelCare('wash'));
    else if (id === 'feed') showPanel(panelCare('feed'));
    else if (id === 'play') showPanel(panelCare('play'));
    else if (id === 'trade') showPanel(panelTrade());
  }

  // ---------- panels: one at a time, on top of the room ----------
  // a panel is { el, body, on: { action: fn(button) }, refresh(), draw(t), tick(), did(m), onClose() }
  function mkPanel(name, withCoins, cls) {
    var p = { el: document.createElement('div'), on: {} };
    p.el.className = 'pets-panel' + (cls ? ' ' + cls : '');
    p.el.setAttribute('role', 'dialog'); p.el.setAttribute('aria-label', name.en);
    p.el.innerHTML = '<div class="pets-ph"><span class="pets-pt"><b>' + esc(name.en) + '</b><span>' + esc(name.zh) + ' <span class="py">' + esc(name.py) + '</span> · ' + esc(name.ms) + '</span></span>' +
      (withCoins ? '<span class="pill dark" title="Stars you can spend"><span class="ico">⭐</span><span class="pets-pc">' + coins() + '</span></span>' : '') +
      '<button class="round" type="button" data-a="x" data-quiet aria-label="Close">✕</button></div><div class="pets-pb"></div>';
    p.body = p.el.lastChild;
    p.coin = p.el.querySelector('.pets-pc');
    return p;
  }
  function showPanel(p) {
    closePanel();
    panel = p; el.dim.appendChild(p.el); el.dim.hidden = false; el.act.hidden = true;
    fitPanel();
    if (p.refresh) p.refresh();
  }
  // Panels are laid out for 800 x 480 and simply made bigger on a bigger screen, so text and buttons grow with it.
  function fitPanel() {
    if (!panel) return;
    var k = Math.max(1, Math.min(1.45, W / 880, H / 528)), k2 = (H - 76) / 470, roomy = k2 >= 1;
    if (roomy) k = Math.min(k, k2); // tall enough: the panel fits under the top bar, so "Back to town" stays in reach
    el.dim.style.paddingTop = roomy ? '68px' : '';
    panel.el.style.transform = k > 1.001 ? 'scale(' + k.toFixed(3) + ')' : '';
    panel.el.style.maxHeight = Math.floor((H - (roomy ? 76 : 16)) / k) + 'px';
  }
  function closePanel() {
    var p = panel;
    if (!p) return;
    panel = null;
    if (p.onClose) p.onClose();
    el.dim.hidden = true; el.dim.innerHTML = '';
    nearShown = -1;
  }
  function refreshPanel(moneyOnly) {
    if (!panel) return;
    if (panel.coin) panel.coin.textContent = coins();
    if (panel.refresh && (!moneyOnly || panel.money)) panel.refresh();
  }

  // ----- egg shop -----
  function panelShop() {
    var p = mkPanel(STN_BY.shop, true), sel = 0, busy = 0, cheer = 0, cards = [], txt, btn;
    p.money = true;
    p.body.innerHTML = '<div class="pets-eggs"></div><div class="pets-leg">' + RARITY.map(function (r) {
      return '<span><i style="background:' + r.col + '"></i>' + esc(r.en) + ' · ' + esc(r.zh) + ' <span class="py">' + esc(r.py) + '</span> · ' + esc(r.ms) + '</span>';
    }).join('') + '</div><div class="pets-buy"><div class="pets-buyt"></div><button class="btn primary" type="button" data-a="buy" data-quiet>Buy</button></div>';
    CFG.eggs.forEach(function (e, k) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'pets-egg'; b.setAttribute('data-a', 'egg'); b.setAttribute('data-k', k);
      b.innerHTML = '<canvas data-ic="egg' + k + '" width="140" height="156" style="width:70px;height:78px"></canvas><span class="pets-n3">' + n3(EGG_NAMES[k]) + '</span>' +
        '<span class="pets-odds">' + e.odds.map(function (o, r) { return o ? '<span><i style="background:' + RARITY[r].col + '"></i>' + o + '%</span>' : ''; }).join('') + '</span>' +
        '<span class="pets-need">Hatches after ' + e.need + ' ⭐</span><span class="pets-price"></span>';
      p.body.firstChild.appendChild(b); cards.push(b);
    });
    fillPics(p.body);
    txt = p.body.querySelector('.pets-buyt'); btn = p.body.querySelector('[data-a="buy"]');
    p.refresh = function () {
      var me = api.me() || { coins: 0, lv: 1 }, n = S ? S.eggs.length : 0, e = CFG.eggs[sel], h, can = false;
      cards.forEach(function (b, k) {
        var lock = me.lv < CFG.eggs[k].lv;
        b.className = 'pets-egg' + (k === sel ? ' on' : '') + (lock ? ' lock' : '');
        b.lastChild.textContent = lock ? '🔒 Level ' + CFG.eggs[k].lv : '⭐ ' + CFG.eggs[k].cost;
      });
      if (Date.now() < cheer) h = '<div class="pets-sum">It is in the incubator now!</div><div>Earn stars anywhere in town to warm it up.</div>';
      else if (me.lv < e.lv) h = '<div>🔒 Reach level ' + e.lv + ' to buy this egg. You are level ' + me.lv + '.</div>';
      else if (n >= CFG.max.eggs) h = '<div>The incubator is full (' + n + ' / ' + CFG.max.eggs + ' eggs). Hatch one first!</div>';
      else if (me.coins < e.cost) h = '<div>It costs ⭐ ' + e.cost + '. You have ⭐ ' + me.coins + '.</div><div class="pets-sum">' + e.cost + ' − ' + me.coins + ' = ' + (e.cost - me.coins) + ' more ⭐ to find</div>';
      else { can = true; h = '<div class="pets-sum">⭐ ' + me.coins + ' − ' + e.cost + ' = ' + (me.coins - e.cost) + ' left</div><div>Your eggs: ' + n + ' / ' + CFG.max.eggs + '</div>'; }
      txt.innerHTML = h;
      btn.style.display = can && Date.now() >= cheer ? '' : 'none';
      btn.disabled = Date.now() < busy; btn.textContent = 'Buy ⭐ ' + e.cost;
    };
    p.on.egg = function (b) { sel = +b.getAttribute('data-k') || 0; cheer = 0; p.refresh(); };
    p.on.buy = function () {
      if (Date.now() < busy) return;
      busy = Date.now() + 1500; api.send({ t: 'pets.buy', k: sel }); p.refresh();
      setTimeout(function () { if (panel === p) p.refresh(); }, 1600);
    };
    p.did = function (m) {
      if (m.a !== 'buy') return;
      busy = 0; cheer = Date.now() + 2600; p.refresh();
      setTimeout(function () { if (panel === p) p.refresh(); }, 2700);
    };
    p.no = function () { busy = 0; p.refresh(); };
    return p;
  }

  // ----- incubator -----
  function panelInc() {
    var p = mkPanel(STN_BY.inc), slots = [], wait = 0, i, d;
    p.body.innerHTML = '<div class="pets-slots"></div><p class="hint" style="text-align:center">⭐ Every star you earn anywhere in town warms your eggs. When the ring is full, tap the egg!</p>';
    for (i = 0; i < CFG.max.eggs; i++) {
      d = document.createElement('div'); d.className = 'pets-slot';
      d.innerHTML = '<canvas width="300" height="320" style="width:150px;height:160px" aria-hidden="true"></canvas><div class="pets-slotl"></div>';
      p.body.firstChild.appendChild(d);
      slots.push({ cv: d.firstChild, c: d.firstChild.getContext('2d'), l: d.lastChild, sig: '' });
    }
    p.refresh = function () {
      slots.forEach(function (sl, n) {
        var e = S && S.eggs[n], sig = e ? e.id + '|' + e.have : '-';
        if (sig === sl.sig) return;
        sl.sig = sig;
        if (!e) { sl.l.innerHTML = '<span class="pets-mut">Empty. Buy an egg at the egg shop 🥚</span>'; sl.cv.removeAttribute('data-a'); return; }
        if (e.have >= e.need) {
          sl.l.innerHTML = '<button class="btn primary" type="button" data-a="hatch" data-egg="' + e.id + '" data-quiet>Hatch!</button>';
          sl.cv.setAttribute('data-a', 'hatch'); sl.cv.setAttribute('data-egg', e.id);
        } else { sl.l.innerHTML = '<span>' + e.have + ' / ' + e.need + ' ⭐</span>'; sl.cv.removeAttribute('data-a'); }
      });
    };
    p.draw = function (t) {
      slots.forEach(function (sl, n) {
        var e = S && S.eggs[n], c = sl.c, f, ready;
        c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, 150, 160); c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath(); c.ellipse(75, 136, 42, 11, 0, 0, TAU); c.fillStyle = '#E8C27A'; c.fill(); c.lineWidth = 3; c.strokeStyle = NAVY; c.stroke();
        if (!e) {
          c.save(); c.translate(75, 134); c.scale(1.2, 1.2); eggPath(c); c.restore();
          c.setLineDash([6, 9]); c.lineWidth = 3; c.strokeStyle = 'rgba(27,42,73,0.3)'; c.stroke(); c.setLineDash([]);
          return;
        }
        f = Math.min(1, e.have / e.need); ready = f >= 1;
        if (ready) { c.beginPath(); c.arc(75, 86, 52 + Math.sin(t * 5) * 3, 0, TAU); c.fillStyle = 'rgba(255,214,107,0.45)'; c.fill(); }
        c.beginPath(); c.arc(75, 86, 62, 0, TAU); c.lineWidth = 10; c.strokeStyle = 'rgba(27,42,73,0.12)'; c.stroke();
        if (f > 0) { c.beginPath(); c.arc(75, 86, 62, -Math.PI / 2, -Math.PI / 2 + TAU * f); c.lineWidth = 10; c.strokeStyle = ready ? '#4FA05A' : '#FF9F43'; c.stroke(); }
        drawEgg(c, 75, 134, e.k, { scale: 1.2, rot: ready ? wob(t, n) : 0, noShadow: true });
      });
    };
    p.on.hatch = function (b) {
      if (Date.now() < wait) return;
      if (S && S.pets.length >= CFG.max.pets) { api.sfx('deny'); api.toast(WHY.full); return; }
      wait = Date.now() + 1500; api.send({ t: 'pets.hatch', egg: +b.getAttribute('data-egg') });
    };
    return p;
  }

  // ----- an egg hatches: wobble, crack, the pet, then its name -----
  function panelHatch(m) {
    var p = mkPanel(STN_BY.inc), sp = SPI[m.pet.sp] || SPECIES[0], t0 = Date.now(), shown = false, rang = false, hc, rev;
    p.body.innerHTML = '<canvas class="pets-hatc" aria-hidden="true"></canvas><div class="pets-rev" style="visibility:hidden"><div class="pets-revt">' + tagHtml(sp.r) +
      '<span class="pets-big">' + api.three(sp) + '</span>' + (m.isNew ? '<span class="pets-new">NEW in your Pet Book! ' + (S ? S.seen.length : 1) + ' / ' + SPECIES.length + '</span>' : '') +
      '</div><button class="btn primary" type="button" data-a="nameit">Give it a name</button></div>';
    hc = p.body.firstChild; rev = p.body.lastChild;
    api.sfx('card');
    p.draw = function (t) {
      var w = hc.clientWidth, h = hc.clientHeight, c, u = (Date.now() - t0) / 1000, cx, gy, s, P, k, e, i, a, col = RARITY[sp.r].col;
      if (w < 2) return;
      if (hc.width !== w * 2 || hc.height !== h * 2) { hc.width = w * 2; hc.height = h * 2; }
      c = hc.getContext('2d'); c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, w, h); c.lineJoin = 'round'; c.lineCap = 'round';
      cx = w / 2; gy = h - 30;
      if (u > 1.5) { // rays in the colour of the rarity
        c.save(); c.translate(cx, gy - 66); c.rotate(t * 0.5); c.fillStyle = col; c.globalAlpha = 0.24;
        for (i = 0; i < 12; i++) { c.rotate(TAU / 12); c.beginPath(); c.moveTo(0, 0); c.lineTo(-26, -w); c.lineTo(26, -w); c.closePath(); c.fill(); }
        c.restore();
      }
      c.fillStyle = 'rgba(27,42,73,0.12)'; c.beginPath(); c.ellipse(cx, gy + 4, 110, 15, 0, 0, TAU); c.fill();
      if (u < 1.5) drawEgg(c, cx, gy, m.k, { scale: 2, rot: Math.sin(u * 22) * 0.035 * (1 + u * 3), crack: u / 1.5, noShadow: true });
      else {
        k = Math.min(1, (u - 1.5) / 0.5);
        e = k < 1 ? 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2) : 1; // pops out a little too big, then settles
        P = PET[m.pet.sp] || PET.puppy; s = Math.min(2.6, (h - 64) / (P.h * STAGE_K[0]));
        drawPet(c, cx, gy, m.pet.sp, { scale: s * Math.max(0.05, e), stage: 0, t: t, joy: u < 4, noShadow: true });
        if (k < 1) {
          c.globalAlpha = 1 - k;
          drawEgg(c, cx - 70 * k, gy - 80 * k, m.k, { scale: 2, rot: -k, part: 1, noShadow: true });
          drawEgg(c, cx + 60 * k, gy + 4 * k, m.k, { scale: 2, rot: k * 0.5, part: 2, noShadow: true });
          c.beginPath(); c.arc(cx, gy - 60, 30 + k * w * 0.6, 0, TAU); c.fillStyle = '#fff'; c.globalAlpha = (1 - k) * 0.85; c.fill();
          c.globalAlpha = 1;
        }
        for (i = 0; i < 9; i++) { // twinkles
          a = (t * 0.9 + i * 0.37) % 1;
          spark4(c, cx + Math.sin(i * 2.4) * w * 0.4, gy - 20 - ((i * 53) % (h - 60)), 9 * Math.sin(a * Math.PI));
          c.fillStyle = i % 2 ? '#FFD23F' : '#fff'; c.fill();
        }
        if (!rang) { rang = true; api.sfx(sp.r >= 2 ? 'levelup' : 'right'); }
      }
      if (u > 2 && !shown) { shown = true; rev.style.visibility = ''; }
    };
    p.on.nameit = function () {
      var pet = petById(m.pet.id);
      if (pet) showPanel(panelName(pet, function () { showPanel(panelCare('info', pet.id)); }));
      else closePanel();
    };
    return p;
  }

  // ----- a name: pick one from the list or type one -----
  function panelName(pet, back) {
    var sp = SPI[pet.sp] || SPECIES[0], p = mkPanel({ en: 'Name', zh: '名字', py: 'míngzi', ms: 'Nama' }), input, wait = 0;
    p.body.innerHTML = '<div class="pets-nm">' + picHtml(pet.sp, pet.st, 92) + '<div class="pets-nmc"><div class="pets-nml">' + api.three(sp) + '</div>' +
      '<div class="pets-nmr"><input class="pets-in" type="text" maxlength="10" autocomplete="off" autocapitalize="words" spellcheck="false" aria-label="Pet name"><button class="btn primary" type="button" data-a="nameok" data-quiet>OK</button></div></div></div>' +
      '<div class="pets-names">' + CFG.names.map(function (n) { return '<button class="chip' + (n === pet.name ? ' on' : '') + '" type="button" data-a="nm" data-n="' + esc(n) + '">' + esc(n) + '</button>'; }).join('') + '</div>';
    fillPics(p.body);
    input = p.body.querySelector('input'); input.value = pet.name;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); p.on.nameok(); } });
    p.on.nm = function (b) {
      input.value = b.getAttribute('data-n');
      [].forEach.call(p.body.querySelectorAll('.chip'), function (x) { x.classList.toggle('on', x === b); });
    };
    p.on.nameok = function () {
      var v = input.value.trim();
      if (Date.now() < wait) return;
      if (!v) { api.sfx('deny'); api.toast(WHY.empty); return; }
      if (v === pet.name) { api.sfx('tap'); back(); return; }
      wait = Date.now() + 1200; api.send({ t: 'pets.name', pet: pet.id, name: v });
    };
    p.did = function (m) { if (m.a === 'name') { api.sfx('right'); back(); } };
    return p;
  }

  // ----- caring for a pet: the food bowl, the play mat, the bath, and "my pets" -----
  function panelCare(mode, sel) {
    var p = mkPanel(mode === 'feed' ? STN_BY.feed : mode === 'play' ? STN_BY.play : mode === 'wash' ? STN_BY.bath : STN_BY.home, mode === 'feed');
    var anim = null, pfx = [], built = false, strip, side, stc, giftBtn, noteEl, note = '', noteBad = false, sig = '', wait = 0;
    p.money = mode === 'feed';
    function cur() { return petById(sel); }
    function cdLeft(pet) { return Math.max(0, pet.cd - (Date.now() - S.at)); }
    function bar(ico, cls, v, low) { return '<div class="pets-bar' + (low ? ' low' : '') + '"><span>' + ico + '</span><i><b class="' + cls + '" style="width:' + v + '%"></b></i><em>' + v + '</em></div>'; }
    function sideHtml(pet) {
      var sp = SPI[pet.sp] || SPECIES[0], st = pet.st, me = api.me() || { coins: 0 }, h, cd, act;
      note = ''; noteBad = false;
      var pc = st < 2 ? Math.round((pet.xp - CFG.stage[st]) * 100 / (CFG.stage[st + 1] - CFG.stage[st])) : 100;
      h = '<div class="pets-nrow"><b class="pets-pn">' + esc(pet.name) + '</b>' + tagHtml(sp.r) + '</div><div class="pets-sp3">' + api.three(sp) + '</div>' +
        '<div class="pets-bars">' + bar('🍖', 'h', pet.hun, pet.hun < CFG.hungry) + bar('💛', 'p', pet.hap, pet.hap < 20) + bar('💧', 'c', pet.cl, pet.cl < 40) +
        '<div class="pets-bar"><span>⭐</span><i><b class="x" style="width:' + pc + '%"></b></i><em>' + (st < 2 ? pet.xp + '/' + CFG.stage[st + 1] : '★') + '</em></div></div>' +
        '<div class="pets-xpl">' + api.three(STAGES[st]) + (st < 2 ? ' → ' + esc(STAGES[st + 1].en) : '') + '</div>';
      if (mode === 'feed') {
        h += '<div class="pets-acts">' + CFG.foods.map(function (f, i) {
          var poor = me.coins < f.cost;
          return '<button class="pets-card" type="button" data-a="feed" data-i="' + i + '" data-quiet' + (pet.hun >= 95 ? ' disabled' : '') + '>' +
            '<canvas data-ic="food' + i + '" width="88" height="88" aria-hidden="true"></canvas><span class="pets-n3">' + n3(FOOD_NAMES[i]) + '</span>' +
            '<span class="pets-eff">🍖 +' + f.hun + (f.hap ? '  💛 +' + f.hap : '') + '</span>' +
            '<span class="pets-crow"><span class="pets-cost">⭐ ' + f.cost + '</span><span class="pets-fsum">' + (poor ? (f.cost - me.coins) + ' more ⭐' : me.coins + ' − ' + f.cost + ' = ' + (me.coins - f.cost)) + '</span></span></button>';
        }).join('') + '</div>';
        if (pet.hun >= 95) note = 'Tummy is full!';
        else if (pet.hun < CFG.hungry) { note = 'I am hungry!'; noteBad = true; }
      } else if (mode === 'play') {
        cd = cdLeft(pet);
        h += '<div class="pets-acts">' + TOY_NAMES.map(function (nm, i) {
          return '<button class="pets-card" type="button" data-a="play" data-i="' + i + '" data-quiet' + (cd > 0 ? ' disabled' : '') + '>' +
            '<canvas data-ic="toy' + i + '" width="88" height="88" aria-hidden="true"></canvas><span class="pets-n3">' + n3(nm) + '</span><span class="pets-eff">💛 +12</span></button>';
        }).join('') + '</div>';
        if (cd > 0) note = '💤 A little rest… ' + Math.ceil(cd / 1000);
        else if (pet.hun < CFG.hungry) { note = 'I am hungry!'; noteBad = true; }
        else note = 'Playing is free. Pick a toy!';
      } else if (mode === 'wash') {
        h += '<div class="pets-acts"><button class="pets-card pets-wide" type="button" data-a="wash" data-quiet><canvas data-ic="soap" width="112" height="112" aria-hidden="true"></canvas>' +
          '<span class="pets-n3">' + n3(WASH_NAME) + '</span><span class="pets-eff">💧 100</span></button></div>';
        note = pet.cl < 60 ? 'Time for a bath!' : 'Nice and clean. A bath is free.';
      } else {
        act = pet.id === S.active;
        h += '<div class="pets-ibtns"><button class="btn primary" type="button" data-a="walk"' + (act ? ' disabled' : '') + '>' + (act ? '🐾 Walking with you' : '🐾 Walk with me') + '</button>' +
          '<button class="btn" type="button" data-a="rename">✏️ Name</button>' + (!act && S.pets.length > 1 ? '<button class="btn" type="button" data-a="farm">🏡 Farm</button>' : '') + '</div>' +
          '<p class="hint">Look after your pet in this room: 🍖 food bowl, 🎾 play mat, 🛁 bath. A grown, happy pet brings a gift every day!</p>';
      }
      return h;
    }
    p.refresh = function () {
      var pets = S ? S.pets : [], pet, ns;
      if (!pets.length) {
        built = false; stc = null;
        p.body.innerHTML = '<div class="pets-center"><canvas data-ic="egg0" width="160" height="180" style="width:80px;height:90px"></canvas><div>You have no pet yet.<br>Hatch an egg in the incubator! 🐣</div></div>';
        fillPics(p.body);
        return;
      }
      if (!built) {
        built = true; sig = '';
        p.body.innerHTML = '<div class="pets-strip"></div><div class="pets-care"><div class="pets-stage"><canvas aria-hidden="true"></canvas><button type="button" class="pets-gift" data-a="gift" data-quiet aria-label="Take the gift" hidden>🎁</button><div class="pets-snote" hidden></div></div><div class="pets-side"></div></div>';
        strip = p.body.firstChild; side = p.body.querySelector('.pets-side'); stc = p.body.querySelector('.pets-stage canvas'); giftBtn = p.body.querySelector('.pets-gift'); noteEl = p.body.querySelector('.pets-snote');
      }
      if (!cur()) sel = petById(S.active) ? S.active : pets[0].id;
      ns = pets.map(function (q) { return q.id + q.sp + q.st + (q.gift ? 'g' : '') + (q.hun < CFG.hungry ? 'h' : '') + (q.id === S.active ? 'a' : ''); }).join(',') + '|' + sel;
      if (ns !== sig) {
        sig = ns; strip.innerHTML = '';
        strip.className = 'pets-strip' + (pets.length > 10 ? ' pets-tight' : '');
        pets.forEach(function (q) {
          var b = document.createElement('button'), r = (SPI[q.sp] || SPECIES[0]).r;
          b.type = 'button'; b.className = 'pets-th pets-b' + r + (q.id === sel ? ' on' : ''); b.setAttribute('data-a', 'pet'); b.setAttribute('data-pet', q.id); b.setAttribute('aria-label', q.name);
          b.appendChild(pic(pets.length > 10 ? 44 : 50, q.sp, q.st));
          if (q.gift || q.hun < CFG.hungry || q.id === S.active) b.insertAdjacentHTML('beforeend', '<i>' + (q.gift ? '🎁' : q.hun < CFG.hungry ? '🍖' : '🐾') + '</i>');
          strip.appendChild(b);
        });
      }
      pet = cur();
      side.innerHTML = sideHtml(pet); fillPics(side);
      giftBtn.hidden = !pet.gift;
      noteEl.hidden = !note; noteEl.textContent = note; noteEl.className = 'pets-snote' + (noteBad ? ' bad' : '');
    };
    p.tick = function () { // the rest after playing counts down
      var pet = cur(), cd;
      if (mode !== 'play' || !pet || !built) return;
      cd = cdLeft(pet);
      if (cd > 0) noteEl.textContent = '💤 A little rest… ' + Math.ceil(cd / 1000);
      else if (side.querySelector('.pets-card:disabled')) p.refresh();
    };
    p.draw = function (t) {
      var pet = cur(), c, w, h, s, P, gy, cx, now = Date.now(), a = anim, u = 0, i, x, y, joy = false, nod = 0;
      if (!built || !stc || !pet) return;
      w = stc.clientWidth; h = stc.clientHeight;
      if (w < 2) return;
      if (stc.width !== w * 2 || stc.height !== h * 2) { stc.width = w * 2; stc.height = h * 2; }
      c = stc.getContext('2d'); c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, w, h); c.lineJoin = 'round'; c.lineCap = 'round';
      c.fillStyle = '#F6DDB0'; c.fillRect(0, h - 76, w, 76);
      c.fillStyle = 'rgba(27,42,73,0.10)'; c.fillRect(0, h - 76, w, 5);
      P = PET[pet.sp] || PET.puppy; gy = h - 44; cx = w / 2 - (mode === 'feed' ? 22 : 0);
      s = Math.min(2.3, (h - 76) / (P.h * STAGE_K[pet.st]), (w - 24) / (104 * STAGE_K[pet.st]));
      if (a) { u = (now - a.t0) / a.len; if (u >= 1) { anim = a = null; } }
      if (a) {
        joy = true;
        if (a.a === 'feed') { joy = u > 0.8; nod = u > 0.22 && u < 0.8 ? Math.abs(Math.sin((u - 0.22) * 24)) : 0; }
      }
      if (mode === 'wash') { // the back rim of the tub
        c.beginPath(); c.ellipse(cx, gy - 30, Math.min(w / 2 - 8, 96), 15, 0, 0, TAU); c.fillStyle = '#C9EBFF'; c.fill(); c.lineWidth = 3; c.strokeStyle = NAVY; c.stroke();
      }
      drawPet(c, cx, gy - (mode === 'wash' ? 10 : 0), pet.sp, { scale: s, stage: pet.st, t: t, sad: isSad(pet) && !a, joy: joy, nod: nod, dirty: pet.cl < 40 && !(a && a.a === 'wash' && u > 0.6), noShadow: mode === 'wash' });
      if (mode === 'feed') {
        c.save(); c.translate(w - 44, gy + 6); c.scale(0.8, 0.8); c.fillStyle = SHADOW; c.beginPath(); c.ellipse(6, 2, 46, 9, 0, 0, TAU); c.fill(); drawBowl(c, false); c.restore();
        if (a && a.a === 'feed' && u < 0.3) { c.save(); c.translate(w - 44, gy - 150 + Math.min(1, u / 0.22) * 118); icon(c, 'food' + a.i); c.restore(); }
      } else if (mode === 'wash') {
        x = Math.min(w / 2 - 8, 96);
        c.beginPath(); c.moveTo(cx - x, gy - 30); c.lineTo(cx + x, gy - 30); c.bezierCurveTo(cx + x, gy + 6, cx + x - 22, gy + 20, cx + x - 40, gy + 20);
        c.lineTo(cx - x + 40, gy + 20); c.bezierCurveTo(cx - x + 22, gy + 20, cx - x, gy + 6, cx - x, gy - 30); c.closePath();
        c.fillStyle = '#fff'; c.fill(); c.lineWidth = 3; c.strokeStyle = NAVY; c.stroke();
        c.fillStyle = '#7FD4FF'; c.fillRect(cx - x + 6, gy - 12, x * 2 - 12, 8);
        c.strokeStyle = NAVY; c.lineWidth = 5;
        for (i = 0; i < 9; i++) { c.beginPath(); c.arc(cx - x + 12 + i * (x * 2 - 24) / 8, gy - 33 - (i % 2) * 5, 11 + (i % 3) * 2, 0, TAU); c.stroke(); }
        c.fillStyle = '#fff';
        for (i = 0; i < 9; i++) { c.beginPath(); c.arc(cx - x + 12 + i * (x * 2 - 24) / 8, gy - 33 - (i % 2) * 5, 11 + (i % 3) * 2, 0, TAU); c.fill(); }
        if (a && a.a === 'wash' && u < 0.75) { // foam on the pet while it is scrubbed
          for (i = 0; i < 7; i++) {
            x = cx + Math.sin(i * 2.2 + t * 3) * 34 * s / 2; y = gy - 40 - ((i * 37) % 60) * s / 2 - 20;
            c.beginPath(); c.arc(x, y, 9 + (i % 3) * 3, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.92)'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#5AA9FF'; c.stroke();
          }
        }
      } else if (a && a.a === 'play') {
        if (a.i === 0) { // the ball bounces across
          c.save(); c.translate(-20 + u * (w + 40), gy - 20 - Math.abs(Math.sin(u * Math.PI * 3)) * 70); c.rotate(u * 9); icon(c, 'toy0'); c.restore();
        } else if (a.i === 1) {
          for (i = 0; i < 8; i++) {
            y = gy - ((u * 1.3 + i * 0.13) % 1) * (h - 40); x = 20 + ((i * 67) % (w - 40)) + Math.sin(t * 3 + i) * 8;
            c.beginPath(); c.arc(x, y, 7 + (i % 3) * 3, 0, TAU); c.fillStyle = 'rgba(200,236,255,0.75)'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#3B9BFF'; c.stroke();
          }
        } else { c.save(); c.translate(cx + Math.sin(u * 14) * 50, 44 + Math.cos(u * 14) * 8); c.rotate(Math.sin(u * 14) * 0.5 + 2.4); c.scale(1.3, 1.3); icon(c, 'toy2'); c.restore(); }
      }
      drawFx(c, pfx);
    };
    function go(msg) { if (anim || Date.now() < wait) return false; wait = Date.now() + 900; api.send(msg); return true; }
    p.on.pet = function (b) { sel = +b.getAttribute('data-pet'); anim = null; p.refresh(); };
    p.on.feed = function (b) {
      var pet = cur(), i = +b.getAttribute('data-i') || 0;
      if (!pet) return;
      if (coins() < CFG.foods[i].cost) { api.sfx('deny'); api.toast(WHY.stars); return; }
      go({ t: 'pets.feed', pet: pet.id, food: i });
    };
    p.on.play = function (b) { var pet = cur(); if (pet) go({ t: 'pets.play', pet: pet.id, toy: +b.getAttribute('data-i') || 0 }); };
    p.on.wash = function () { var pet = cur(); if (pet) go({ t: 'pets.wash', pet: pet.id }); };
    p.on.gift = function () { var pet = cur(); if (pet) go({ t: 'pets.gift', pet: pet.id }); };
    p.on.walk = function () { var pet = cur(); if (pet) api.send({ t: 'pets.active', pet: pet.id }); };
    p.on.rename = function () { var pet = cur(); if (pet) showPanel(panelName(pet, function () { showPanel(panelCare(mode, pet.id)); })); };
    p.on.farm = function () { var pet = cur(); if (pet) showPanel(panelFarm(pet, function () { showPanel(panelCare(mode)); })); };
    p.did = function (m) {
      var w = stc ? stc.clientWidth : 230, h = stc ? stc.clientHeight : 240;
      if (m.pet !== sel || !built) return;
      if (m.a === 'feed') { anim = { a: 'feed', i: m.food, t0: Date.now(), len: 1800 }; emit(pfx, 'txt', w / 2, 30, 1, '−' + m.sum[1] + ' ⭐'); setTimeout(function () { emit(pfx, 'heart', w / 2 - 20, h - 120, 4); }, 1300); }
      else if (m.a === 'play') { anim = { a: 'play', i: m.toy, t0: Date.now(), len: 1900 }; emit(pfx, 'heart', w / 2, h - 130, 5); if (m.hungry) api.toast('Fun! But a hungry pet does not grow. Feed it at the food bowl.'); }
      else if (m.a === 'wash') { anim = { a: 'wash', i: 0, t0: Date.now(), len: 1900 }; emit(pfx, 'bub', w / 2, h - 110, 7); setTimeout(function () { emit(pfx, 'spark', w / 2, h - 120, 5); }, 1300); }
      else if (m.a === 'gift') { anim = { a: 'gift', i: 0, t0: Date.now(), len: 1500 }; emit(pfx, 'spark', w / 2, h - 110, 6); emit(pfx, 'txt', w / 2, 40, 1, '+' + m.stars + ' ⭐'); }
      if (m.xp) emit(pfx, 'txt', w / 2 + 40, 60, 1, '+' + m.xp + ' XP');
    };
    return p;
  }

  // ----- a pet moves to the farm (the only way to make room): asked clearly, "stay" is the big button -----
  function panelFarm(pet, back) {
    var p = mkPanel({ en: 'Farm', zh: '农场', py: 'nóngchǎng', ms: 'Ladang' }, false, 'pets-narrow');
    p.body.innerHTML = '<div class="pets-center">' + picHtml(pet.sp, pet.st, 110) + '<div>Send <b>' + esc(pet.name) + '</b> to live on the farm?<br><span class="pets-small">It will be happy there, but it will not come back.</span></div>' +
      '<div class="pets-tbtns"><button class="btn primary" type="button" data-a="keep">No, stay with me</button><button class="btn" type="button" data-a="bye" data-quiet>Yes, goodbye</button></div></div>';
    fillPics(p.body);
    p.on.keep = back;
    p.on.bye = function () { api.send({ t: 'pets.free', pet: pet.id }); };
    p.did = function (m) { if (m.a === 'free') { api.sfx('close'); api.toast(m.name + ' moved to the farm. Bye bye!'); back(); } };
    return p;
  }

  // ----- the collection book -----
  function panelBook() {
    var p = mkPanel(BOOK_NAME), sel = null, count = document.createElement('span');
    count.className = 'pill dark'; p.el.firstChild.insertBefore(count, p.el.firstChild.lastChild);
    p.refresh = function () {
      var seen = {}, have = {}, s, h, det;
      (S ? S.seen : []).forEach(function (id) { seen[id] = 1; });
      (S ? S.pets : []).forEach(function (q) { have[q.sp] = (have[q.sp] || 0) + 1; });
      if (!sel) sel = (S && S.seen.length ? S.seen[S.seen.length - 1] : SPECIES[0].id);
      s = SPI[sel] || SPECIES[0];
      count.textContent = (S ? S.seen.length : 0) + ' / ' + SPECIES.length;
      if (seen[s.id]) det = picHtml(s.id, 2, 140) + tagHtml(s.r) + '<span class="pets-n3">' + n3(s) + '</span><span>' + (have[s.id] ? 'You have ' + have[s.id] : 'You had one before') + '</span>';
      else {
        det = picHtml(s.id, 2, 140, true) + tagHtml(s.r) + '<span class="pets-big">? ? ?</span><span>Hatch eggs to find it:</span><span class="pets-src">' +
          CFG.eggs.map(function (e, k) { return e.odds[s.r] ? '<span><canvas data-ic="egg' + k + '" width="52" height="64" aria-hidden="true"></canvas>' + e.odds[s.r] + '%</span>' : ''; }).join('') + '</span>';
      }
      h = '<div class="pets-book"><div class="pets-grid">' + SPECIES.map(function (q) {
        return '<button type="button" class="pets-cell pets-b' + q.r + (seen[q.id] ? '' : ' no') + (sel === q.id ? ' on' : '') + '" data-a="sp" data-sp="' + q.id + '" aria-label="' + (seen[q.id] ? esc(q.en) : 'Not found yet') + '">' +
          picHtml(q.id, 2, 66, !seen[q.id]) + (have[q.id] ? '<em>' + have[q.id] + '</em>' : '') + '</button>';
      }).join('') + '</div><div class="pets-det">' + det + '</div></div>';
      p.body.innerHTML = h; fillPics(p.body);
    };
    p.on.sp = function (b) { sel = b.getAttribute('data-sp'); p.refresh(); };
    return p;
  }

  // ----- trading: choose a player, both pick a pet, both say yes -----
  function panelTrade() {
    var p = mkPanel(STN_BY.trade), wait = 0;
    p.id = 'trade';
    function col(title, pet, ok, empty) {
      var sp = pet ? SPI[pet.sp] || SPECIES[0] : null;
      return '<div class="pets-tcol' + (ok ? ' ok' : '') + '"><div class="pets-tl">' + title + '</div>' +
        (pet ? picHtml(pet.sp, pet.st, 84) + '<b class="pets-tn">' + esc(pet.name) + '</b>' + tagHtml(sp.r) + '<span>' + api.three(sp) + '</span><span>' + api.three(STAGES[pet.st]) + '</span>'
          : '<div class="pets-tq">?</div><span>' + empty + '</span>') + '<div class="pets-tok">' + (ok ? '✔ Yes!' : '') + '</div></div>';
    }
    p.refresh = function () {
      var st = trade.st, h, ps = api.players(), meId = api.myId(), list = [], left = S ? S.trades : 0, cvs, i, c, q;
      if (st === 'ask' && trade.asker) h = '<div class="pets-center"><div>Asking <b>' + esc(trade.name) + '</b> to swap pets…</div><button class="btn" type="button" data-a="tcancel">Cancel</button></div>';
      else if (st === 'ask') {
        h = '<div class="pets-center"><div class="pets-big">' + esc(trade.name) + ' wants to swap a pet with you!</div>' +
          '<div class="pets-tbtns"><button class="btn" type="button" data-a="tno">No thanks</button><button class="btn primary" type="button" data-a="tyes">Yes, let us look</button></div></div>';
      } else if (st === 'pick') {
        h = '<div class="pets-tr">' + col('You give', trade.mine, trade.okMe, 'Tap one of your pets below') + '<div class="pets-tmid">⇄</div>' +
          col(esc(trade.name) + ' gives', trade.theirs, trade.okThem, esc(trade.name) + ' is choosing…') + '</div><div class="pets-strip' + (S && S.pets.length > 10 ? ' pets-tight' : '') + '">' +
          (S ? S.pets : []).map(function (x) {
            return '<button type="button" class="pets-th pets-b' + (SPI[x.sp] || SPECIES[0]).r + (trade.mine && trade.mine.id === x.id ? ' on' : '') + '" data-a="pet" data-pet="' + x.id + '" aria-label="' + esc(x.name) + '">' + picHtml(x.sp, x.st, S.pets.length > 10 ? 44 : 50) + '</button>';
          }).join('') + '</div><div class="pets-tbtns"><button class="btn" type="button" data-a="tcancel">Cancel</button>' +
          (!trade.mine ? '<span class="pets-small">Pick the pet you want to give.</span>'
            : !trade.theirs ? '<span class="pets-small">Waiting for ' + esc(trade.name) + ' to pick a pet…</span>'
              : trade.okMe ? '<button class="btn" type="button" data-a="tunok">Wait, not yet</button><span class="pets-small">Waiting for ' + esc(trade.name) + '…</span>'
                : '<button class="btn primary" type="button" data-a="tok" data-quiet>✔ Swap ' + esc(trade.mine.name) + ' for ' + esc(trade.theirs.name) + '</button>') + '</div>';
      } else {
        Object.keys(ps).forEach(function (id) { if (ps[id].room === 'pets' && ps[id].id !== meId) list.push(ps[id]); });
        h = '<div class="pets-center">';
        if (!S || !S.pets.length) h += '<div>You need a pet to swap. Hatch an egg first! 🐣</div>';
        else if (left <= 0) h += '<div>You have swapped ' + CFG.max.trades + ' pets today. Come back tomorrow!</div>';
        else if (!list.length) h += '<div>Nobody else is in the Pet Home right now.<br>Ask someone to come in and swap pets with you!</div>';
        else {
          h += '<div>Who do you want to swap a pet with?</div><div class="pets-tlist">' + list.map(function (x) {
            var e = x.ext && x.ext.pets;
            return '<button type="button" class="pets-tp" data-a="task" data-id="' + x.id + '"><canvas data-av="' + x.id + '" width="160" height="150" aria-hidden="true"></canvas><b>' + esc(x.name) + '</b><span>' + (e ? '🐾 ' + esc(e.n) : 'no pet yet') + '</span></button>';
          }).join('') + '</div>';
        }
        h += '<div class="pets-small">One pet for one pet, and both must say yes. Swaps left today: ' + left + ' / ' + CFG.max.trades + '</div></div>';
      }
      p.body.innerHTML = h; fillPics(p.body);
      cvs = p.body.querySelectorAll('canvas[data-av]');
      for (i = 0; i < cvs.length; i++) {
        q = ps[cvs[i].getAttribute('data-av')];
        if (!q) continue;
        c = cvs[i].getContext('2d'); c.setTransform(2, 0, 0, 2, 0, 0);
        try { api.drawAvatar(c, q, 40, 72, 0, { scale: 0.6 }); } catch (e) {}
      }
    };
    function once(msg) { if (Date.now() < wait) return; wait = Date.now() + 500; api.send(msg); }
    p.on.task = function (b) { once({ t: 'pets.tradeAsk', to: +b.getAttribute('data-id') }); };
    p.on.tyes = function () { once({ t: 'pets.tradeAnswer', ok: true }); };
    p.on.tno = function () { once({ t: 'pets.tradeAnswer', ok: false }); };
    p.on.tcancel = function () { api.send({ t: 'pets.tradeCancel' }); };
    p.on.pet = function (b) { api.send({ t: 'pets.tradeOffer', pet: +b.getAttribute('data-pet') }); };
    p.on.tok = function () { if (trade.mine && trade.theirs) { api.sfx('tap'); once({ t: 'pets.tradeConfirm', ok: true, mine: trade.mine.id, theirs: trade.theirs.id }); } };
    p.on.tunok = function () { api.send({ t: 'pets.tradeConfirm', ok: false }); };
    p.onClose = function () { if (trade.st !== 'off') api.send({ t: 'pets.tradeCancel' }); };
    return p;
  }
  function panelGot(m) {
    var p = mkPanel(STN_BY.trade, false, 'pets-narrow'), sp = SPI[m.got.sp] || SPECIES[0];
    p.body.innerHTML = '<div class="pets-center"><div class="pets-big">You and ' + esc(m.name) + ' swapped pets!</div>' + picHtml(m.got.sp, m.got.st, 120) +
      '<div><b class="pets-pn">' + esc(m.got.name) + '</b> ' + tagHtml(sp.r) + '<br><span class="pets-small">' + api.three(sp) + '</span></div>' +
      '<button class="btn primary" type="button" data-a="hello">Hello, ' + esc(m.got.name) + '!</button></div>';
    fillPics(p.body);
    p.on.hello = function () { showPanel(panelCare('info', m.got.id)); };
    return p;
  }

  // ---------- the overlay ----------
  function hud() {
    var has = false;
    if (!root) return;
    el.coin.textContent = coins();
    el.np.textContent = (S ? S.pets.length : 0) + '/' + CFG.max.pets;
    el.nb.textContent = (S ? S.seen.length : 0) + '/' + SPECIES.length;
    if (S) S.pets.forEach(function (q) { if (q.gift) has = true; });
    el.hbPets.classList.toggle('pets-has', has);
  }
  function onClick(e) {
    var b, a;
    if (e.target === el.dim) { api.sfx('close'); closePanel(); return; } // a tap beside the panel closes it
    b = up(e.target, 'data-a');
    if (!b || b.disabled) return;
    a = b.getAttribute('data-a');
    if (a === 'back') close();
    else if (a === 'x') { api.sfx('close'); closePanel(); }
    else if (a === 'mypets') showPanel(panelCare('info'));
    else if (a === 'book') showPanel(panelBook());
    else if (a === 'act') { if (near) openStation(near.id); }
    else if (panel && panel.on[a]) panel.on[a](b);
  }
  function open() {
    if (root || !api) return;
    addStyle();
    root = document.createElement('div'); root.className = 'screen pets-root';
    root.innerHTML = '<canvas class="pets-cv" aria-label="The Pet Home room"></canvas>' +
      '<div class="pets-top"><button class="btn" type="button" data-a="back" data-quiet>Back to town</button>' +
      '<div class="pill dark" title="Stars you can spend"><span class="ico">⭐</span><span class="pets-coin">0</span></div><span class="pets-gap"></span>' +
      '<button class="btn pets-hb" type="button" data-a="mypets" aria-label="My pets">🐾 <span class="pets-np"></span></button>' +
      '<button class="btn pets-hb" type="button" data-a="book" aria-label="Pet book">📖 <span class="pets-nb"></span></button></div>' +
      '<button class="btn primary pets-act" type="button" data-a="act" data-quiet hidden></button><div class="pets-dim" hidden></div>';
    document.body.appendChild(root);
    el.cv = root.querySelector('.pets-cv'); el.ctx = el.cv.getContext('2d'); el.coin = root.querySelector('.pets-coin');
    el.np = root.querySelector('.pets-np'); el.nb = root.querySelector('.pets-nb'); el.hbPets = root.querySelector('[data-a="mypets"]');
    el.act = root.querySelector('.pets-act'); el.dim = root.querySelector('.pets-dim');
    stick = api.stick(el.cv);
    el.cv.addEventListener('pointerdown', tapDown); el.cv.addEventListener('pointerup', tapUp);
    root.addEventListener('click', onClick);
    window.addEventListener('resize', resize);
    needSpot = true; my.x = 600; my.y = 596; my.f = 1; my.m = 0; sent.x = -1; sent.t = 0;
    goal = null; tap = null; others = {}; fols = {}; fxs = []; near = null; nearShown = -1; panel = null; trade = { st: 'off' }; roomSig = '';
    api.enter('pets');
    resize(); hud();
    lastTs = 0; frameN = 0; raf = requestAnimationFrame(frame);
    pollTimer = setInterval(function () { if (root && !document.hidden) api.send({ t: 'pets.get' }); }, 30000); // hunger and happiness move slowly
  }
  function close() {
    if (!root) return;
    cancelAnimationFrame(raf); raf = 0; clearInterval(pollTimer); pollTimer = 0;
    window.removeEventListener('resize', resize);
    closePanel();
    if (stick) stick.destroy();
    stick = null;
    if (root.parentNode) root.parentNode.removeChild(root);
    root = null; bg = null; sprites = {}; el = {}; others = {}; fols = {}; fxs = []; near = null; goal = null; trade = { st: 'off' };
    api.sfx('close');
    api.leave();
  }

  // ---------- messages from the server ----------
  function roomFx(id, a) {
    var f = fols[id], o = id === api.myId() ? my : others[id], x, y;
    if (f) { x = f.x; y = f.y - 46; f.joy = Date.now() + 1600; } else if (o) { x = o.x; y = o.y - 90; } else return;
    if (a === 'feed' || a === 'play') emit(fxs, 'heart', x, y, 4);
    else if (a === 'wash') emit(fxs, 'bub', x, y, 6);
    else if (a === 'hatch') { emit(fxs, 'spark', x, y, 6); emit(fxs, 'heart', x, y, 3); }
    else if (a === 'gift') emit(fxs, 'spark', x, y, 5);
    else if (a === 'buy' && o) emit(fxs, 'spark', o.x, o.y - 100, 3);
  }
  function onDid(m) {
    var a = m.a, pet = petById(m.pet);
    if (a === 'feed' || a === 'buy') api.sfx('buy');
    else if (a === 'play') api.sfx('emote');
    else if (a === 'wash') api.sfx('card');
    else if (a === 'gift') api.sfx('claim');
    else if (a === 'active') api.sfx('right');
    roomFx(api.myId(), a);
    if (m.up && pet) { api.sfx('levelup'); api.toast(pet.name + ' grew up! ' + STAGES[m.up].en + ' · ' + STAGES[m.up].zh + ' · ' + STAGES[m.up].ms); }
    if (panel && panel.did) panel.did(m);
  }
  function onTrade(m) {
    var was = trade.st;
    trade = m && m.st ? m : { st: 'off' };
    if (trade.st === 'off') {
      if (was !== 'off' && TRADE_OFF[m.why]) api.toast(TRADE_OFF[m.why]);
      if (panel && panel.id === 'trade') panel.refresh();
      return;
    }
    if (!panel || panel.id !== 'trade') { if (trade.st === 'ask' && !trade.asker) api.sfx('join'); showPanel(panelTrade()); }
    else panel.refresh();
  }
  function onMessage(m) {
    var t = String(m.t).slice(5), seen, i, q, o;
    if (t === 'cfg') { ['eggs', 'foods', 'stage', 'cd', 'names', 'gift', 'max', 'hungry'].forEach(function (k) { if (m[k] !== undefined && m[k] !== null) CFG[k] = m[k]; }); return; }
    if (t === 'me') {
      if (!Array.isArray(m.pets) || !Array.isArray(m.eggs) || !Array.isArray(m.seen)) return;
      S = m; S.at = Date.now();
      if (!root) return;
      if (m.you) { // I just came in (or came back after a dropped connection)
        if (needSpot) { my.x = +m.you.x || 600; my.y = +m.you.y || 596; needSpot = false; }
        sent.x = -1; sent.t = 0;
      }
      hud(); refreshPanel();
      return;
    }
    if (t === 'ready') { api.sfx('quest'); api.toast(root ? 'An egg is ready! Tap it in the incubator. 🐣' : 'An egg is ready to hatch! Go to the Pet Home. 🐣'); return; }
    if (!root) return;
    if (t === 'st') {
      seen = {};
      for (i = 0; i < m.p.length; i++) {
        q = m.p[i]; seen[q[0]] = 1;
        if (q[0] === api.myId()) continue;
        o = others[q[0]] || (others[q[0]] = { x: q[1], y: q[2], tx: q[1], ty: q[2], f: 1, m: 0 });
        o.tx = q[1]; o.ty = q[2]; o.f = q[3] < 0 ? -1 : 1; o.m = q[4] ? 1 : 0;
      }
      Object.keys(others).forEach(function (id) { if (!seen[id]) { delete others[id]; delete fols[id]; } });
    } else if (t === 'did') onDid(m);
    else if (t === 'no') { api.sfx('deny'); api.toast(WHY[m.why] || 'That did not work. Try again.'); if (panel && panel.no) panel.no(m); }
    else if (t === 'hatched') showPanel(panelHatch(m));
    else if (t === 'fx') roomFx(m.id, m.a);
    else if (t === 'trade') onTrade(m);
    else if (t === 'traded') { trade = { st: 'off' }; api.sfx('chest'); showPanel(panelGot(m)); }
  }
  function onPlayers() {
    var ps, sig = '';
    if (!root) return;
    if (panel && panel.id === 'trade' && trade.st === 'off') { // someone came into or left the room: show the new list
      ps = api.players();
      Object.keys(ps).forEach(function (id) { if (ps[id].room === 'pets') sig += id + (ps[id].ext && ps[id].ext.pets ? ps[id].ext.pets.n : '') + ','; });
      if (sig !== roomSig) { roomSig = sig; panel.refresh(); }
    }
  }
  function onMe() { if (root) { hud(); refreshPanel(true); } }

  window.FTGames = window.FTGames || {};
  window.FTGames.pets = {
    init: function (a) { api = a; },
    open: function () { open(); },
    onMessage: function (m) { onMessage(m); },
    onPlayers: function () { onPlayers(); },
    onMe: function () { onMe(); },
    town: function (c, t, view, items) { townHook(c, t, view, items); }
  };
})();
