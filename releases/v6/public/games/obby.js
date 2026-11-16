// Obby Tower (client): an obstacle course seen from the side that climbs a tower.
// The running and jumping is simulated here on the tablet; the server (dev/games/obby.js) owns the flags
// reached, the stars, the clocks, the rounds and the records. Everyone in the same place sees the others climb.
// Two towers of 30 hand-made stages in five chapters (garden, castle, ice, clouds, space), and four ways to play
// them, chosen at the entrance: Climb, Race (a chapter, everybody at once, alone against the ghost of your best race),
// Rising lava (the last one climbing wins) and the Endless tower (made by code from the seed of the day).
// The panel at the right edge shows everybody in the room; a tap on somebody or a drag along the height bar looks
// away from your own player (only on this tablet), a move or a jump comes back.
(function () {
  'use strict';
  var api = null;
  var NAVY = '#1B2A49', TAU = Math.PI * 2;
  var W = 800;                        // width of a tower in world units; the screen shows the whole width
  var TX0 = 150, TX1 = 650;           // the round tower wall behind the platforms
  var EPOCH = 1760000000000;          // tower time 0 (ms); moving things are a function of the server clock

  // ---------- how the jumping feels ----------
  // Every jump has the same height (109 units, the extra jump in the air adds 47): easier to judge for small children.
  var G = 1700, JUMP = 610, JUMP2 = 400, RUN = 235, MAXFALL = 820, BOUNCE = 900, LIFT = 300;
  var COYOTE = 0.13;                  // still allowed to jump this long after running off an edge
  var BUFFER = 0.16;                  // a jump pressed this long before landing still counts
  var VBACK = 2.6;                    // seconds until a vanished cloud comes back
  var HEAD = 30, THICK = 18;          // Hard tower: platforms are solid from below (head height, platform thickness)
  var AV = 0.5;                       // avatar scale
  var EV_JUMP = 1, EV_DJUMP = 2, EV_LAND = 4, EV_BOUNCE = 8, EV_DIE = 16, EV_FLAG = 32, EV_BONK = 64, EV_TP = 128;
  var ICE = 420;                      // how fast you speed up and slow down on ice (2800 on everything else)
  var ICG = 550;                      // half the gravity of a falling icicle
  var CHAP = 6;                       // stages in a chapter; a chapter ends on a rest platform

  // ---------- the two towers: every stage is made by hand ----------
  // x from the left (0..800), y up from the floor of the stage, w = width. A stage starts on its flag platform.
  //   p x y w                 platform                    m x y w dx dy seconds [phase]         moving platform
  //   v x y w                 cloud that vanishes         o cx cy r w seconds [phase]           platform on a big wheel
  //   b x y w                 bounce pad                  sw px py len w swing seconds [phase]  swinging platform
  //   c x y w speed           conveyor belt               l x y w h                             lava block (y = its top)
  //   lp x y w                lava puddle on a platform   s x y r speed arms [angle]            spinning bar
  //   w px py len swing seconds [phase]  swinging ball    z x y dx dy seconds [phase]           spiky that walks up and down
  //   wind x y w h push lift  wind (y = its bottom; push sideways, or lift for an updraft)
  //   i x y w                 ice: slippery                ic x y drop seconds [phase]           icicle that hangs at y and falls `drop`
  //   tp x y x2 y2            door at (x, y) to (x2, y2)   lz x y len up seconds on [phase]      laser from (x, y), `len` long to the right
  //                                                        (up = 1: upwards), on for the part `on` of its seconds
  //   a stage with g: 0.5 has half the gravity
  // The first 12 stages of each tower are the tower as it was first released: never change them (flags and times were set on them).
  var TOWERS = {
    // Easy: wide platforms you can also jump up through from below, slow hazards
    easy: {
      vanish: 1.1, solid: false, wall: '#EADFC8', trim: '#58C06B', looks: ['e0', 'e1', 'e2', 'e3', 'e4'],
      sky: [['#6CC3F5', '#CDEFFF'], ['#3F9BEA', '#A8DCFF'], ['#27489A', '#86B9F2']],
      cols: ['#7BD389', '#5AC8FA', '#FFB454', '#B79CFF', '#FF8FB8', '#5ED6C4', '#FFD66B', '#FF8A65', '#8FD3FF', '#C5E86C', '#F7A8E0', '#FFC933'],
      top: [200, 400],
      stages: [
        // 1 steps
        { h: 372, flag: [0, 800], it: [['p', 280, 62, 240], ['p', 520, 124, 220], ['p', 260, 186, 220], ['p', 500, 248, 220], ['p', 240, 310, 220]] },
        // 2 gaps
        { h: 340, flag: [440, 260], it: [['p', 190, 50, 170], ['p', 20, 112, 110], ['p', 190, 174, 150], ['p', 420, 174, 140], ['p', 640, 174, 140], ['p', 440, 236, 140], ['p', 230, 290, 160]] },
        // 3 lava puddles
        { h: 366, flag: [30, 250], it: [['p', 340, 56, 430], ['lp', 530, 56, 56], ['p', 600, 118, 180], ['p', 150, 180, 380], ['lp', 310, 180, 56], ['p', 0, 242, 120], ['p', 190, 304, 400], ['lp', 370, 304, 56]] },
        // 4 moving platforms
        { h: 366, flag: [570, 230], it: [['p', 350, 56, 160], ['m', 60, 118, 150, 150, 0, 5], ['p', 0, 180, 130], ['p', 190, 242, 150], ['m', 400, 242, 140, 220, 0, 6], ['p', 660, 304, 140]] },
        // 5 clouds that vanish
        { h: 366, flag: [330, 270], it: [['v', 660, 60, 130], ['p', 470, 122, 150], ['v', 280, 184, 130], ['v', 90, 244, 130], ['p', 280, 304, 170]] },
        // 6 bounce pads
        { h: 430, flag: [500, 260], it: [['b', 310, 25, 110], ['p', 130, 205, 200], ['b', 0, 230, 110]] },
        // 7 conveyor belts
        { h: 362, flag: [170, 260], it: [['c', 500, 56, 250, 70], ['p', 620, 118, 170], ['c', 330, 180, 230, 70], ['p', 130, 242, 150], ['c', 330, 302, 250, -70]] },
        // 8 spinning bars
        { h: 366, flag: [560, 240], it: [['p', 300, 56, 240], ['s', 420, 141, 62, 1.3, 1], ['p', 110, 118, 140], ['p', 0, 180, 120], ['p', 190, 242, 270], ['s', 325, 327, 62, -1.3, 1, 2], ['p', 520, 304, 160]] },
        // 9 wind
        { h: 430, flag: [510, 250], it: [['p', 300, 56, 140], ['wind', 100, 36, 200, 170, -110, 0], ['p', 0, 56, 110], ['wind', 10, 76, 180, 280, 0, 2600], ['p', 240, 316, 180], ['p', 480, 372, 170]] },
        // 10 swinging balls
        { h: 490, flag: [300, 260], it: [['p', 60, 56, 170], ['p', 150, 118, 400], ['w', 350, 286, 128, 1.0, 4], ['p', 620, 180, 150], ['p', 640, 242, 150], ['p', 200, 304, 380], ['w', 390, 472, 128, 1.0, 3.6, 0.3], ['p', 20, 366, 150], ['p', 60, 428, 150]] },
        // 11 a bit of everything
        { h: 372, flag: [230, 260], it: [['l', 520, 22, 280, 30], ['m', 540, 56, 130, 130, 0, 5], ['p', 690, 118, 110], ['v', 500, 180, 130], ['v', 310, 242, 130], ['p', 90, 300, 170], ['m', 300, 300, 150, 0, 54, 4]] },
        // 12 the top
        { h: 396, flag: [470, 250], it: [['b', 290, 30, 110], ['p', 60, 215, 200], ['m', 320, 277, 130, 220, 0, 5.5], ['p', 330, 339, 300], ['s', 480, 424, 62, 1.4, 1]] },
        // ---- chapter 3, ice ----
        // 13 ice steps
        { h: 372, flag: [20, 280], it: [['i', 110, 62, 260], ['i', 420, 124, 240], ['i', 240, 186, 230], ['p', 500, 248, 200], ['i', 200, 310, 260]] },
        // 14 icicles
        { h: 372, flag: [470, 260], it: [['p', 200, 62, 230], ['p', 20, 124, 150], ['p', 200, 186, 260], ['ic', 330, 288, 100, 3.0], ['p', 500, 248, 200], ['ic', 600, 350, 100, 3.4, 0.4], ['p', 260, 310, 220]] },
        // 15 slide past the spiky
        { h: 372, flag: [470, 300], it: [['i', 150, 62, 290], ['z', 190, 78, 210, 0, 5], ['p', 0, 124, 120], ['i', 150, 186, 300], ['p', 500, 248, 160], ['i', 240, 310, 230]] },
        // 16 frozen lifts
        { h: 372, flag: [20, 260], it: [['m', 320, 62, 130, 200, 0, 5.5], ['p', 680, 124, 120], ['i', 380, 186, 260], ['m', 210, 248, 130, 0, 62, 4]] },
        // 17 icicle alley
        { h: 372, flag: [0, 170], it: [['i', 200, 62, 560], ['p', 690, 124, 110], ['p', 250, 186, 420], ['ic', 330, 164, 90, 2.8], ['ic', 450, 164, 90, 3.2, 0.3], ['ic', 570, 164, 90, 3.0, 0.6], ['p', 60, 248, 160], ['p', 280, 310, 200]] },
        // 18 the ice summit
        { h: 394, flag: [430, 300], it: [['i', 130, 62, 260], ['b', 20, 90, 110], ['i', 160, 270, 300], ['ic', 300, 372, 80, 3.0], ['ic', 400, 372, 80, 3.0, 0.5], ['p', 520, 332, 160]] },
        // ---- chapter 4, clouds ----
        // 19 the first door
        { h: 372, flag: [200, 400], it: [['p', 620, 62, 160], ['tp', 740, 62, 90, 186], ['p', 20, 186, 180], ['p', 240, 248, 180], ['p', 470, 310, 180]] },
        // 20 the clouds or the door
        { h: 372, flag: [140, 280], it: [['v', 470, 62, 130], ['v', 640, 124, 130], ['p', 420, 186, 170], ['tp', 450, 186, 705, 310], ['p', 620, 310, 170], ['v', 230, 248, 130], ['v', 60, 310, 130]] },
        // 21 the updraft
        { h: 502, flag: [230, 360], it: [['p', 620, 56, 150], ['wind', 610, 76, 180, 280, 0, 2600], ['p', 380, 316, 180], ['tp', 410, 316, 100, 440], ['p', 30, 440, 170]] },
        // 22 the crumbling bridge
        { h: 372, flag: [240, 260], it: [['p', 560, 62, 140], ['v', 410, 124, 100], ['v', 300, 124, 100], ['v', 190, 124, 100], ['v', 80, 124, 100], ['p', 0, 186, 120], ['m', 170, 248, 130, 250, 0, 6], ['p', 600, 310, 160]] },
        // 23 which door?
        { h: 372, flag: [300, 260], it: [['p', 600, 62, 180], ['tp', 745, 62, 60, 186], ['p', 60, 62, 180], ['tp', 95, 62, 430, 0], ['p', 20, 186, 200], ['v', 270, 248, 120], ['v', 440, 310, 120]] },
        // 24 the sky gate
        { h: 434, flag: [590, 210], it: [['v', 420, 62, 130], ['v', 240, 124, 130], ['p', 20, 186, 180], ['tp', 50, 186, 720, 310], ['p', 640, 310, 160], ['m', 380, 310, 130, 130, 0, 5], ['p', 160, 372, 170]] },
        // ---- chapter 5, space: half the gravity ----
        // 25 moon steps
        { h: 600, g: 0.5, flag: [330, 400], it: [['p', 100, 150, 180], ['p', 420, 300, 180], ['p', 120, 450, 180]] },
        // 26 laser gates
        { h: 600, g: 0.5, flag: [430, 260], it: [['p', 40, 150, 340], ['lz', 210, 150, 180, 1, 3.2, 0.45], ['p', 500, 300, 220], ['p', 160, 450, 240], ['lz', 280, 450, 180, 1, 3.2, 0.45, 0.5]] },
        // 27 the float lift
        { h: 700, g: 0.5, flag: [20, 240], it: [['m', 320, 150, 140, 160, 0, 6], ['p', 650, 300, 150], ['lz', 440, 380, 200, 0, 3.6, 0.4], ['m', 440, 450, 140, 0, 120, 5]] },
        // 28 asteroids
        { h: 580, g: 0.5, flag: [150, 250], it: [['v', 470, 150, 130], ['v', 660, 290, 130], ['p', 360, 430, 180], ['z', 330, 460, 0, 120, 3.5]] },
        // 29 the laser ladder
        { h: 600, g: 0.5, flag: [60, 240], it: [['p', 370, 150, 200], ['lz', 350, 225, 240, 0, 3.0, 0.5], ['p', 80, 300, 200], ['lz', 60, 375, 240, 0, 3.0, 0.5, 0.5], ['p', 370, 450, 200]] },
        // 30 up to the stars
        { h: 700, g: 0.5, flag: [500, 240], it: [['b', 380, 40, 110], ['p', 100, 440, 220], ['m', 380, 560, 140, 180, 0, 5.5], ['lz', 180, 630, 440, 0, 3.4, 0.4]] }
      ]
    },
    // Hard: small stone platforms that are solid from below (go round the edge), fast hazards
    hard: {
      vanish: 0.65, solid: true, wall: '#C9C2DE', trim: '#8C6BE8', looks: ['h0', 'h1', 'h2', 'h3', 'h4'],
      sky: [['#F29A6B', '#FFE3AE'], ['#8E5BD0', '#F7A6B5'], ['#17153F', '#4B3A8C']],
      cols: ['#6FA8DC', '#E57373', '#9575CD', '#F06292', '#4DB6AC', '#FFB74D', '#7986CB', '#81C784', '#4FC3F7', '#BA68C8', '#FF8A65', '#FFD54F'],
      top: [200, 400],
      stages: [
        // 1 hop and skip
        { h: 420, flag: [0, 800], it: [['p', 520, 84, 110], ['p', 320, 168, 110], ['p', 130, 252, 100], ['p', 320, 336, 100]] },
        // 2 lava hop
        { h: 420, flag: [510, 200], it: [['p', 200, 84, 240], ['lp', 300, 84, 44], ['p', 40, 168, 130], ['l', 215, 212, 60, 20], ['p', 300, 252, 130], ['p', 520, 336, 110]] },
        // 3 crumbling clouds
        { h: 420, flag: [640, 160], it: [['v', 470, 84, 90], ['v', 300, 168, 90], ['v', 130, 252, 90], ['v', 20, 336, 90]] },
        // 4 bounce over the lava
        { h: 520, flag: [190, 220], it: [['l', 430, 20, 370, 30], ['b', 490, 60, 56], ['p', 650, 250, 100], ['b', 480, 275, 56], ['p', 250, 470, 110]] },
        // 5 belts and spikies
        { h: 420, flag: [0, 190], it: [['c', 260, 84, 240, -110], ['z', 300, 100, 160, 0, 3], ['p', 580, 168, 110], ['c', 300, 252, 200, 120], ['c', 40, 336, 190, -120], ['z', 80, 352, 110, 0, 2.6]] },
        // 6 windmills to jump over
        { h: 420, flag: [200, 220], it: [['p', 380, 84, 320], ['s', 570, 97, 52, 2.0, 2], ['p', 730, 168, 70], ['p', 340, 252, 350], ['s', 510, 265, 52, -2.2, 2, 1], ['p', 210, 336, 90]] },
        // 7 windy gaps
        { h: 420, flag: [40, 200], it: [['wind', 250, 0, 550, 200, -90, 0], ['p', 290, 84, 120], ['p', 510, 168, 100], ['wind', 60, 230, 560, 200, -130, 0], ['p', 200, 252, 100], ['wind', 0, 270, 100, 180, 0, 2600]] },
        // 8 swingers
        { h: 420, flag: [110, 220], it: [['sw', 500, 234, 169, 100, 0.7, 3.8], ['p', 700, 168, 100], ['p', 340, 252, 300], ['w', 490, 402, 110, 1.1, 2.8], ['p', 190, 336, 100]] },
        // 9 the big wheel
        { h: 504, flag: [360, 200], it: [['l', 580, 20, 220, 30], ['o', 610, 180, 120, 90, 7, 0], ['o', 610, 180, 120, 90, 7, 0.3333], ['o', 610, 180, 120, 90, 7, 0.6667], ['p', 350, 336, 100], ['p', 540, 420, 110]] },
        // 10 vanish and move
        { h: 420, flag: [300, 200], it: [['m', 560, 84, 90, 150, 0, 3.2], ['v', 700, 168, 90], ['v', 530, 252, 90], ['m', 180, 336, 90, 200, 0, 3.4]] },
        // 11 the gauntlet
        { h: 504, flag: [0, 170], it: [['c', 230, 84, 330, -130], ['w', 395, 234, 105, 1.1, 2.4], ['p', 630, 168, 90], ['p', 270, 252, 310], ['s', 420, 265, 50, 2.4, 2], ['v', 110, 336, 100], ['b', 20, 362, 56]] },
        // 12 the summit
        { h: 588, flag: [120, 220], it: [['l', 400, 20, 400, 30], ['v', 420, 84, 90], ['o', 650, 230, 90, 80, 5, 0], ['o', 650, 230, 90, 80, 5, 0.5], ['p', 380, 336, 100], ['p', 20, 420, 330], ['w', 170, 570, 102, 0.9, 2.4], ['wind', 0, 420, 90, 200, 0, 2600]] },
        // ---- chapter 3, ice ----
        // 13 icy hops
        { h: 420, flag: [100, 400], it: [['i', 560, 84, 130], ['i', 360, 168, 120], ['i', 160, 252, 120], ['p', 360, 336, 110]] },
        // 14 icicle rain
        { h: 420, flag: [540, 200], it: [['p', 330, 84, 130], ['ic', 395, 230, 130, 2.6, 0.5], ['p', 120, 168, 130], ['ic', 185, 314, 130, 2.6], ['p', 330, 252, 130], ['p', 120, 336, 130]] },
        // 15 slide and spikies
        { h: 420, flag: [320, 200], it: [['i', 560, 84, 220], ['z', 600, 100, 140, 0, 2.8], ['i', 260, 168, 220], ['z', 300, 184, 140, 0, 2.4, 0.5], ['p', 60, 252, 110], ['i', 250, 336, 200]] },
        // 16 the frozen wheel
        { h: 420, flag: [530, 180], it: [['l', 0, 20, 230, 30], ['i', 320, 84, 130], ['o', 170, 236, 105, 90, 7, 0], ['o', 170, 236, 105, 90, 7, 0.3333], ['o', 170, 236, 105, 90, 7, 0.6667], ['p', 330, 336, 110]] },
        // 17 belts under the icicles
        { h: 420, flag: [520, 200], it: [['c', 240, 84, 240, -110], ['ic', 330, 230, 130, 2.4], ['ic', 420, 230, 130, 2.4, 0.5], ['p', 40, 168, 120], ['c', 250, 252, 240, 120], ['p', 580, 336, 110]] },
        // 18 the frozen summit
        { h: 554, flag: [300, 200], it: [['v', 560, 84, 90], ['i', 700, 168, 100], ['i', 440, 252, 180], ['b', 330, 278, 56], ['p', 120, 470, 130]] },
        // ---- chapter 4, clouds ----
        // 19 the door
        { h: 420, flag: [330, 380], it: [['p', 150, 84, 110], ['tp', 180, 84, 705, 252], ['p', 650, 252, 110], ['v', 470, 336, 90]] },
        // 20 the crumbling stairs
        { h: 420, flag: [240, 160], it: [['v', 460, 84, 80], ['v', 600, 168, 80], ['v', 710, 252, 90], ['tp', 770, 252, 65, 336], ['v', 20, 336, 90]] },
        // 21 the storm
        { h: 420, flag: [180, 160], it: [['wind', 340, 0, 460, 150, 90, 0], ['p', 420, 84, 100], ['p', 620, 168, 100], ['sw', 400, 380, 150, 100, 0.7, 3.8], ['p', 140, 336, 110]] },
        // 22 over the lava to the door
        { h: 420, flag: [330, 180], it: [['p', 600, 84, 190], ['lp', 660, 84, 44], ['tp', 755, 84, 75, 252], ['p', 20, 252, 120], ['v', 220, 336, 90]] },
        // 23 the updraft
        { h: 504, flag: [390, 180], it: [['p', 640, 84, 110], ['wind', 650, 104, 150, 260, 0, 2600], ['p', 470, 336, 110], ['tp', 495, 336, 120, 420], ['p', 70, 420, 100]] },
        // 24 the sky summit
        { h: 504, flag: [250, 180], it: [['v', 500, 84, 90], ['m', 620, 168, 90, 90, 0, 3], ['v', 470, 252, 90], ['sw', 250, 460, 150, 100, 0.7, 3.6], ['p', 0, 420, 90]] },
        // ---- chapter 5, space: half the gravity ----
        // 25 moon hops
        { h: 680, g: 0.5, flag: [170, 400], it: [['p', 650, 170, 110], ['p', 380, 340, 110], ['p', 100, 510, 110]] },
        // 26 the laser wall
        { h: 680, g: 0.5, flag: [300, 180], it: [['p', 560, 170, 120], ['p', 300, 340, 120], ['p', 560, 510, 120], ['lz', 490, 40, 600, 1, 2.8, 0.5]] },
        // 27 lifts in space
        { h: 760, g: 0.5, flag: [240, 180], it: [['m', 500, 170, 90, 180, 0, 4], ['lz', 440, 255, 330, 0, 3, 0.45], ['v', 300, 340, 90], ['m', 100, 510, 90, 0, 120, 4]] },
        // 28 the asteroid wheel
        { h: 760, g: 0.5, flag: [270, 180], it: [['p', 540, 170, 100], ['o', 300, 430, 110, 90, 8, 0], ['o', 300, 430, 110, 90, 8, 0.5], ['z', 490, 520, 0, 160, 2.8], ['p', 560, 600, 110]] },
        // 29 the laser ladder
        { h: 680, g: 0.5, flag: [250, 180], it: [['p', 520, 170, 120], ['lz', 480, 270, 200, 0, 2.4, 0.5], ['p', 260, 340, 120], ['lz', 220, 440, 200, 0, 2.4, 0.5, 0.5], ['p', 520, 510, 120], ['lz', 480, 610, 200, 0, 2.4, 0.5]] },
        // 30 the last star
        { h: 780, g: 0.5, flag: [240, 180], it: [['b', 500, 60, 56], ['v', 660, 470, 90], ['m', 380, 600, 90, 160, 0, 3.6]] }
      ]
    }
  };
  var NAME = { en: 'Obby Tower', zh: '障碍塔', py: 'zhàng\'ài tǎ', ms: 'Menara Halangan' };
  var TOWER_NAME = {
    easy: { en: 'Easy Tower', zh: '简单塔', py: 'jiǎndān tǎ', ms: 'Menara Mudah' },
    hard: { en: 'Hard Tower', zh: '困难塔', py: 'kùnnan tǎ', ms: 'Menara Sukar' }
  };
  var MEDALS = { easy: [90, 150, 240], hard: [150, 240, 360] };   // seconds for gold, silver, bronze
  var SOLID = { p: 1, f: 1, m: 1, o: 1, sw: 1, v: 1, b: 1, c: 1, i: 1 };
  // How a chapter looks: the tower wall, the ring where a stage begins, the glass of the windows, six platform colours
  // and the colours of the sky at the top of the chapter. e = Easy tower (and the endless tower), h = Hard tower.
  var LOOKS = {
    e0: { kind: 'brick', wall: '#EADFC8', trim: '#58C06B', glass: '#3F6FA8', sky: ['#3F9BEA', '#A8DCFF'], cols: ['#7BD389', '#5AC8FA', '#FFB454', '#B79CFF', '#FF8FB8', '#5ED6C4'] },
    e1: { kind: 'brick', wall: '#EADFC8', trim: '#58C06B', glass: '#3F6FA8', sky: ['#27489A', '#86B9F2'], cols: ['#FFD66B', '#FF8A65', '#8FD3FF', '#C5E86C', '#F7A8E0', '#FFC933'] },
    e2: { kind: 'ice', wall: '#DCEFF8', trim: '#6CC6EE', glass: '#5B8FD0', sky: ['#4E9FDC', '#E6F7FF'], cols: ['#9BD8F5', '#B5F0E6', '#8FC4F5', '#C9D8FF', '#A5E8FF', '#9FE0C8'] },
    e3: { kind: 'cloud', wall: '#F8EAF1', trim: '#F2B94B', glass: '#C77BB0', sky: ['#E77FA8', '#FFE2B0'], cols: ['#FFB8D2', '#FFD28A', '#C8B6FF', '#9EE6CF', '#FFA9A0', '#FFE27A'] },
    e4: { kind: 'space', wall: '#4A4E7E', trim: '#5ED6C4', glass: '#FFD66B', sky: ['#0C0E2B', '#2B2463'], cols: ['#5ED6C4', '#FF8FB8', '#FFD66B', '#8FA8FF', '#C5E86C', '#FF8A65'] },
    h0: { kind: 'brick', wall: '#C9C2DE', trim: '#8C6BE8', glass: '#3A2F6B', sky: ['#8E5BD0', '#F7A6B5'], cols: ['#6FA8DC', '#E57373', '#9575CD', '#F06292', '#4DB6AC', '#FFB74D'] },
    h1: { kind: 'brick', wall: '#C9C2DE', trim: '#8C6BE8', glass: '#3A2F6B', sky: ['#17153F', '#4B3A8C'], cols: ['#7986CB', '#81C784', '#4FC3F7', '#BA68C8', '#FF8A65', '#FFD54F'] },
    h2: { kind: 'ice', wall: '#B9D2E6', trim: '#3F9BD6', glass: '#274A8C', sky: ['#123A5E', '#59C3C9'], cols: ['#6FB8E0', '#7FD6CF', '#8FA6E8', '#5FC8F0', '#A0B8F5', '#6FD0B8'] },
    h3: { kind: 'cloud', wall: '#E3CDE0', trim: '#E0913A', glass: '#7A3F86', sky: ['#5A2E7E', '#F49A7A'], cols: ['#E889B0', '#F0B25E', '#A58CF0', '#6FCFB5', '#F08C7E', '#E8CC5A'] },
    h4: { kind: 'space', wall: '#34365F', trim: '#FF6F91', glass: '#5ED6C4', sky: ['#05051A', '#231A4F'], cols: ['#FF6F91', '#5ED6C4', '#FFC94D', '#7C8CFF', '#B0E05A', '#FF9466'] }
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); } // the same "random" number every time

  // ---------- building a tower from its stage lists (world: x right, y down, the ground is y = 0) ----------
  function make(it, base) {
    switch (it[0]) {
      case 'p': case 'v': case 'b': case 'i': return { k: it[0], x: it[1], y: base - it[2], w: it[3] };
      case 'ic': return { k: 'ic', x: it[1], y: base - it[2], drop: it[3], per: it[4], ph: it[5] || 0, r: 8 };
      case 'tp': return { k: 'tp', x: it[1], y: base - it[2], tx: it[3], ty: base - it[4] };
      case 'lz': return it[4] ? { k: 'lz', x: it[1], y: base - it[2] - it[3], w: 0, h: it[3], per: it[5], on: it[6], ph: it[7] || 0 } : { k: 'lz', x: it[1], y: base - it[2], w: it[3], h: 0, per: it[5], on: it[6], ph: it[7] || 0 };
      case 'c': return { k: 'c', x: it[1], y: base - it[2], w: it[3], sp: it[4] };
      case 'm': return { k: 'm', x: it[1], y: base - it[2], w: it[3], dx: it[4], dy: -it[5], per: it[6], ph: it[7] || 0 };
      case 'o': return { k: 'o', cx: it[1], cy: base - it[2], r: it[3], w: it[4], per: it[5], ph: it[6] || 0 };
      case 'sw': return { k: 'sw', px: it[1], py: base - it[2], len: it[3], w: it[4], amp: it[5], per: it[6], ph: it[7] || 0 };
      case 'l': return { k: 'l', x: it[1], y: base - it[2], w: it[3], h: it[4] || 18 };
      case 'lp': return { k: 'l', x: it[1], y: base - it[2] - 9, w: it[3], h: 15, pud: 1 };
      case 's': return { k: 's', x: it[1], y: base - it[2], r: it[3], sp: it[4], arms: it[5] || 2, ph: it[6] || 0 };
      case 'w': return { k: 'w', px: it[1], py: base - it[2], len: it[3], amp: it[4], per: it[5], ph: it[6] || 0, r: 19 };
      case 'z': return { k: 'z', x: it[1], y: base - it[2], dx: it[3], dy: -it[4], per: it[5], ph: it[6] || 0, r: 15 };
      case 'wind': return { k: 'wind', x: it[1], y: base - it[2] - it[4], w: it[3], h: it[4], fx: it[5] || 0, fy: it[6] || 0 };
    }
    return null;
  }
  function build(id, def) {
    var tw = { id: id, def: def, n: def.stages.length, ents: [], stages: [], vd: def.vanish, solid: !!def.solid, top: 0, height: 0, per: def.per || CHAP };
    var base = 0, i, j, sd, stg, e, ch, tp = 0;
    function add(e) { e.i = tw.ents.length; e.st = stg.i; tw.ents.push(e); stg.list.push(e.i); }
    for (i = 0; i <= tw.n; i++) {
      sd = def.stages[i] || { h: 0, flag: def.top, it: [] };   // the last "stage" is only the platform at the top
      ch = Math.floor(Math.min(i, tw.n - 1) / tw.per);
      // the first 12 stages keep their own colours; later chapters take theirs from the chapter's look
      stg = { i: i, base: base, h: sd.h, list: [], fi: 0, g: sd.g || 1, ch: ch, look: def.looks[ch % def.looks.length], col: '' };
      stg.col = def.cols && i < def.cols.length ? def.cols[i] : LOOKS[stg.look].cols[i % CHAP];
      tw.stages.push(stg);
      e = { k: 'f', x: sd.flag[0], y: base, w: sd.flag[1], flag: i, px: sd.flag[0] + sd.flag[1] / 2 };
      add(e); stg.fi = e.i;
      for (j = 0; j < sd.it.length; j++) { e = make(sd.it[j], base); if (e) { if (e.k === 'tp') e.n = tp++; add(e); } }
      base -= sd.h;
    }
    tw.top = tw.stages[tw.n].base;
    tw.height = -tw.top;
    return tw;
  }
  var built = {};
  function tower(id) { return built[id] || (built[id] = build(id, TOWERS[id])); }
  // the endless tower of a day: made by code from the day's seed, the same on every tablet
  var dayBuilt = null;
  function dayTower(seed) {
    if (!dayBuilt || dayBuilt.seed !== seed) { dayBuilt = build('day', genTower(seed)); dayBuilt.seed = seed; }
    return dayBuilt;
  }

  // ---------- the endless tower: stages made by code from a seed ----------
  // A stage is a row of hops built from pieces the test bot has proven on thousands of made stages: gaps and heights stay
  // inside what one jump reaches, and a thing that hurts never sits under or over the next platform.
  var ENDLESS_N = 60;                 // stages in the tower of the day
  function hash(str) { var h = 2166136261, i; for (i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {                // whole-number maths only: the same numbers on every tablet
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // stage i (0 = the lowest) on top of the flag platform `flag` = [x, w]; returns the stage and the next flag platform
  function genStage(r, i, flag) {
    var theme = Math.floor(i / 5) % 5, d = Math.min(1, i / 45), low = theme === 4, R = low ? 140 : 62;
    var hops = low ? 3 + Math.floor(r() * 2) : 4 + Math.floor(r() * 3), gmin = low ? 40 : 20, gmax = Math.round(low ? 80 + 70 * d : 40 + 55 * d);
    var wmin = Math.round(190 - 70 * d), hz = 0.15 + 0.5 * d, it = [], y = 0, k, w, g, x, kind, u, c, per, pend = [], door = false;
    var cur = { a: flag[0], b: flag[0] + flag[1] }, dir = (cur.a + cur.b) / 2 < 400 ? 1 : -1;
    function ri(a, b) { return a + Math.floor(r() * (b - a + 1)); }
    function r2() { return Math.round(r() * 100) / 100; }
    // where a piece `w` wide goes: `gp` away from the platform we stand on, on the side we are walking to
    function place(w, gp) {
      var x;
      if (cur.b - cur.a > 700) return ri(60, 740 - w);          // from the ground: anywhere
      x = dir > 0 ? cur.b + gp : cur.a - gp - w;
      if (x < 0 || x + w > W) { dir = -dir; x = dir > 0 ? cur.b + gp : cur.a - gp - w; }
      return Math.round(clamp(x, 0, W - w));                     // at a wall it ends up partly over us: jump up through it
    }
    // A spinner, a laser or an icicle reaches two steps up: it is only kept when the next two pieces are not over it.
    function settle(nx, nw) {
      var i, p;
      for (i = pend.length - 1; i >= 0; i--) {
        p = pend[i];
        if (!(nx + nw < p.c - 100 || nx > p.c + 100)) pend.splice(i, 1);
        else if (--p.left <= 0) { it.push(p.it); pend.splice(i, 1); }
      }
    }
    function hurt(c, item) { if (k < hops - 1) pend.push({ c: c, it: item, left: 2 }); }      // never on the last platform under the flag
    for (k = 0; k < hops; k++) {
      y += R; u = r(); g = ri(gmin, gmax); kind = 'p';
      if (theme === 2 && u < 0.55) kind = 'i';
      else if (theme === 3 && u < 0.4) kind = 'v';
      else if (theme === 3 && u < 0.62 && !door && k < hops - 1) kind = 'tp';
      else if (theme === 1 && u < 0.3) kind = 'm';
      else if (theme === 1 && u < 0.5) kind = 'c';
      else if (u > 0.9) kind = 'm';
      else if (u > 0.82) kind = 'v';
      else if (u > 0.74 && !low && k < hops - 1) kind = 'b';
      if (kind === 'm') {
        // a platform that goes to and fro: we get on at its near end and carry on from its far end
        w = low ? 140 : 130; u = ri(100, 180); x = place(w + u, Math.min(g, gmin + 30));
        it.push(['m', x, y, w, u, 0, Math.round((6 - 1.5 * d) * 10) / 10, r2()]);
        settle(x, w + u);
        cur = dir > 0 ? { a: x + u, b: x + u + w } : { a: x, b: x + w };
      } else if (kind === 'b') {
        // a bounce pad low beside us, then a platform 180 above the pad
        y = y - R + 28; x = place(110, ri(0, 20)); it.push(['b', x, y, 110]); settle(x, 110); cur = { a: x, b: x + 110 };
        y += 180; w = Math.max(wmin, 170); x = place(w, ri(10, 50)); it.push(['p', x, y, w]); settle(x, w); cur = { a: x, b: x + w };
      } else if (kind === 'tp') {
        // a door at the far end of a platform; it leads to the other side of the tower, two steps up
        w = 170; x = place(w, g); it.push(['p', x, y, w]); settle(x, w);
        c = dir > 0 ? x + w - 34 : x + 34;
        u = x + w / 2 < 400 ? ri(560, 620) : ri(20, 80);
        it.push(['p', u, y + 2 * R, 170], ['tp', c, y, u + 85, y + 2 * R]); settle(u, 170);
        y += 2 * R; cur = { a: u, b: u + 170 }; dir = u < 400 ? 1 : -1; door = true; k++;
      } else {
        // a platform; a wide one may carry something that hurts
        u = r();
        w = kind === 'v' ? ri(110, 130) : kind === 'c' ? ri(220, 260) : u < hz ? ri(240, 290) : ri(wmin, wmin + 50);
        x = place(w, g);
        if (kind === 'c') it.push(['c', x, y, w, (r() < 0.5 ? -1 : 1) * Math.round(50 + 50 * d)]); else it.push([kind, x, y, w]);
        settle(x, w);
        if ((kind === 'p' || kind === 'i') && u < hz) {
          u = r(); c = Math.round(x + w / 2); per = Math.round((3.4 - 0.8 * d) * 10) / 10;
          if (theme === 2 && u < 0.6) hurt(c, ['ic', c + ri(-40, 40), y + 150, 120, per, r2()]);
          else if (low && u < 0.6) it.push(['lz', x - 20, y + 75, w + 40, 0, per, 0.45, r2()]);
          else if (theme === 1 && u < 0.5) hurt(c, ['lz', c, y, 150, 1, per, 0.45, r2()]);
          else if (kind === 'p' && u < 0.3) it.push(['lp', c - 28, y, 56]);
          else if (kind === 'p' && u < 0.65) it.push(['z', x + 40, y + 16, w - 80, 0, Math.round((5 - 1.5 * d) * 10) / 10, r2()]);
          else if (kind === 'p') hurt(c, ['s', c, y + 85, 62, (r() < 0.5 ? -1 : 1) * Math.round((1.1 + 0.5 * d) * 10) / 10, 1, r2()]);
        }
        cur = { a: x, b: x + w };
      }
    }
    y += R; w = (i + 1) % 5 === 0 ? 320 : Math.round(230 - 50 * d); x = place(w, ri(gmin, gmax)); settle(x, w);
    return { def: low ? { h: y, g: 0.5, flag: flag, it: it } : { h: y, flag: flag, it: it }, next: [x, w] };
  }
  function genTower(seed) {
    var E = TOWERS.easy, def = { gen: true, vanish: 0.95, solid: false, per: 5, wall: E.wall, trim: E.trim, sky: E.sky, looks: E.looks, stages: [], top: null };
    var flag = [0, W], i, st;
    for (i = 0; i < ENDLESS_N; i++) { st = genStage(rng(hash(seed + '#' + i)), i, flag); def.stages.push(st.def); flag = st.next; }
    def.top = flag;
    return def;
  }

  // ---------- the simulation (no drawing in here: the test bot runs it too) ----------
  // where a moving thing is at tower time T (platforms: the left end of the line you stand on; balls: the centre)
  function pos(e, T, o) {
    var k = e.k, a;
    if (k === 'm' || k === 'z') { a = 0.5 - 0.5 * Math.cos(TAU * (T / e.per + e.ph)); o.x = e.x + e.dx * a; o.y = e.y + e.dy * a; }
    else if (k === 'o') { a = TAU * (T / e.per + e.ph); o.x = e.cx + e.r * Math.cos(a) - e.w / 2; o.y = e.cy + e.r * Math.sin(a); }
    else if (k === 'sw' || k === 'w') { a = e.amp * Math.sin(TAU * (T / e.per + e.ph)); o.x = e.px + e.len * Math.sin(a) - (e.w || 0) / 2; o.y = e.py + e.len * Math.cos(a); }
    else if (k === 'ic') {      // hangs for half of its time, then falls; far away (y = 1e7) while it is gone
      a = T / e.per + e.ph; a -= Math.floor(a); o.x = e.x;
      if (a < 0.5) o.y = e.y + 16; else { a = (a - 0.5) * e.per; a = ICG * a * a; o.y = a > e.drop ? 1e7 : e.y + 16 + a; }
    }
    else { o.x = e.x; o.y = e.y; }
    return o;
  }
  function newState() { return { x: 0, y: 0, vx: 0, vy: 0, on: -1, coy: 0, buf: 0, air: 0, held: false, f: 1, cp: 0, T: 0, van: {}, ev: 0, hit: -1, tpc: 0 }; }
  function laserOn(e, T) { var u = T / e.per + e.ph; return u - Math.floor(u) < e.on; }
  // puts the player on the flag of stage s.cp
  function spawn(tw, s) {
    var F = tw.ents[tw.stages[s.cp].fi];
    s.x = clamp(F.px - 26, F.x + 12, F.x + F.w - 12); s.y = F.y; s.vx = s.vy = 0; s.on = F.i; s.coy = s.buf = 0; s.air = 0; s.van = {}; s.tpc = 0;
  }
  // a cloud is away from `vd` seconds after it was first stood on until it comes back
  function gone(tw, s, i, T) {
    var t0 = s.van[i], d;
    if (t0 === undefined) return false;
    d = T - t0;
    if (d < tw.vd) return false;
    if (d < tw.vd + VBACK) return true;
    delete s.van[i];
    return false;
  }
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, u = l ? clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0;
    dx = ax + dx * u - px; dy = ay + dy * u - py;
    return Math.sqrt(dx * dx + dy * dy);
  }
  var PA = { x: 0, y: 0 }, PB = { x: 0, y: 0 };
  var OPT = { dj: 1, ledge: 9, coy: COYOTE, haz: 0 };
  // One step of `dt` seconds. inp = { ax: -1..1, jump: held }. Sets s.ev to what happened (EV_*).
  function step(tw, s, inp, dt, o) {
    o = o || OPT;
    var ents = tw.ents, T0 = s.T, T1 = T0 + dt, e, i, j, n, list, si, want, acc, py0, best = -1, bestY = 0, wx = 0, wy = 0, a, d, cx, cy, hz = o.haz;
    var s0 = Math.max(0, s.cp - 1), s1 = Math.min(tw.n, s.cp + 1), grav = G * tw.stages[s.cp].g;
    s.ev = 0; s.T = T1;
    if (s.tpc > 0) s.tpc -= dt;
    if (inp.jump && !s.held) s.buf = BUFFER; else if (s.buf > 0) s.buf -= dt;
    s.held = !!inp.jump;
    want = inp.ax * RUN; acc = (s.on >= 0 ? (ents[s.on].k === 'i' ? ICE : 2800) : 1900) * dt;
    if (s.vx < want) s.vx = Math.min(want, s.vx + acc); else if (s.vx > want) s.vx = Math.max(want, s.vx - acc);
    if (inp.ax > 0.2) s.f = 1; else if (inp.ax < -0.2) s.f = -1;
    // wind
    for (si = s0; si <= s1; si++) {
      list = tw.stages[si].list;
      for (i = 0; i < list.length; i++) {
        e = ents[list[i]];
        if (e.k === 'wind' && s.x > e.x && s.x < e.x + e.w && s.y - 20 > e.y && s.y - 20 < e.y + e.h) { wx += e.fx; wy += e.fy; }
      }
    }
    if (s.on >= 0 && ents[s.on].k === 'v' && gone(tw, s, s.on, T1)) { s.on = -1; s.coy = 0; }
    // jump: from the ground, a moment after leaving it, or once more in the air
    if (s.buf > 0) {
      if (s.on >= 0 || s.coy > 0) { s.vy = -JUMP; s.on = -1; s.coy = 0; s.buf = 0; s.ev |= EV_JUMP; }
      else if (s.air < o.dj) { s.vy = -JUMP2; s.air++; s.buf = 0; s.ev |= EV_DJUMP; }
    }
    if (s.on >= 0) {
      // standing: ride the platform
      e = ents[s.on]; pos(e, T0, PA); pos(e, T1, PB);
      s.x += PB.x - PA.x + (e.k === 'c' ? e.sp * dt : 0) + (s.vx + wx * 0.5) * dt; s.y = PB.y; s.vy = 0;
      if (s.x < PB.x - o.ledge || s.x > PB.x + e.w + o.ledge) { s.on = -1; s.coy = o.coy; }
    } else {
      if (s.coy > 0) s.coy -= dt;
      s.vy += grav * dt;
      if (wy && s.vy > -LIFT) s.vy = Math.max(-LIFT, s.vy - wy * dt);
      if (s.vy > MAXFALL) s.vy = MAXFALL;
      py0 = s.y;
      s.x += (s.vx + wx) * dt; s.y += s.vy * dt;
      if (s.vy < 0 && tw.solid) {
        // Hard tower: a head that comes up under a platform stops there (clouds are soft). Near an edge it slips past.
        for (si = s0; si <= s1 && s.vy < 0; si++) {
          list = tw.stages[si].list;
          for (i = 0; i < list.length; i++) {
            e = ents[list[i]];
            if (!SOLID[e.k] || e.k === 'v') continue;
            pos(e, T1, PB);
            if (s.x <= PB.x + 4 || s.x >= PB.x + e.w - 4 || s.y - HEAD >= PB.y + THICK || s.y - HEAD <= PB.y - 2) continue;
            if (py0 - HEAD >= PB.y + THICK - 16) s.y = PB.y + THICK + HEAD;
            s.vy = 0; s.ev |= EV_BONK;
            break;
          }
        }
      }
      if (s.vy > 0) {
        // landing: platforms are solid from above only
        for (si = s0; si <= s1; si++) {
          list = tw.stages[si].list;
          for (i = 0; i < list.length; i++) {
            e = ents[list[i]];
            if (!SOLID[e.k]) continue;
            pos(e, T1, PB);
            if (s.y < PB.y || s.x < PB.x - o.ledge || s.x > PB.x + e.w + o.ledge) continue;
            pos(e, T0, PA);
            if (py0 > PA.y + 6) continue;
            if (e.k === 'v' && gone(tw, s, e.i, T1)) continue;
            if (best < 0 || PB.y < bestY) { best = e.i; bestY = PB.y; }
          }
        }
        if (best >= 0) {
          e = ents[best];
          s.y = bestY; s.vy = 0; s.on = best; s.air = 0; s.coy = 0; s.ev |= EV_LAND;
          if (e.k === 'b') { s.vy = -BOUNCE; s.on = -1; s.ev |= EV_BOUNCE; s.hit = best; }
          else if (e.k === 'v' && s.van[best] === undefined) s.van[best] = T1;
        }
      }
    }
    if (s.x < 14) { s.x = 14; if (s.vx < 0) s.vx = 0; } else if (s.x > W - 14) { s.x = W - 14; if (s.vx > 0) s.vx = 0; }
    // hazards (the hit boxes are smaller than the drawings)
    for (si = s0; si <= s1 && !(s.ev & EV_DIE); si++) {
      list = tw.stages[si].list;
      for (i = 0; i < list.length; i++) {
        e = ents[list[i]];
        if (e.k === 'l') {
          if (s.x + 7 > e.x + 3 - hz && s.x - 7 < e.x + e.w - 3 + hz && s.y > e.y + 2 - hz && s.y - 34 < e.y + e.h + hz) { s.ev |= EV_DIE; break; }
        } else if (e.k === 's') {
          if (Math.abs(s.x - e.x) > e.r + 30 || Math.abs(s.y - 20 - e.y) > e.r + 45) continue;
          n = e.arms;
          for (j = 0; j < n; j++) {
            a = e.ph + e.sp * T1 + j * TAU / n; cx = e.x + Math.cos(a) * e.r; cy = e.y + Math.sin(a) * e.r;
            d = Math.min(segDist(s.x, s.y - 10, e.x, e.y, cx, cy), segDist(s.x, s.y - 21, e.x, e.y, cx, cy), segDist(s.x, s.y - 31, e.x, e.y, cx, cy));
            if (d < 12 + hz) { s.ev |= EV_DIE; break; }
          }
          if (s.ev & EV_DIE) break;
        } else if (e.k === 'lz') {
          d = 3 + hz;
          if (s.x + 7 > e.x - d && s.x - 7 < e.x + e.w + d && s.y > e.y - d && s.y - 34 < e.y + e.h + d && laserOn(e, T1)) { s.ev |= EV_DIE; break; }
        } else if (e.k === 'tp') {
          if (s.tpc <= 0 && Math.abs(s.x - e.x) < 16 && s.y <= e.y + 4 && s.y > e.y - 52) {   // through the door
            s.x = e.tx; s.y = e.ty - 2; s.vx = 0; s.vy = 0; s.on = -1; s.coy = 0; s.air = 0; s.tpc = 0.6; s.ev |= EV_TP; s.hit = e.i;
            break;
          }
        } else if (e.k === 'w' || e.k === 'z' || e.k === 'ic') {
          pos(e, T1, PB); cx = PB.x - s.x; cy = PB.y - (s.y - 21);
          if (e.k === 'ic' && PB.y === e.y + 16) continue;        // an icicle only hurts while it falls
          if (Math.abs(cx) > 60 || Math.abs(cy) > 80) continue;
          d = e.r + 5 + hz;
          if (cx * cx + cy * cy < d * d || cx * cx + (cy - 11) * (cy - 11) < d * d || cx * cx + (cy + 10) * (cy + 10) < d * d) { s.ev |= EV_DIE; break; }
        }
      }
    }
    // fell below the stage
    if (s.cp > 0 && s.y > tw.stages[s.cp].base + 170) s.ev |= EV_DIE;
    // the next flag (or the one after, should somebody manage to skip one)
    if (!(s.ev & EV_DIE)) {
      for (j = Math.min(tw.n, s.cp + 2); j > s.cp; j--) {
        e = ents[tw.stages[j].fi];
        if (s.on === e.i || (Math.abs(s.x - e.px) < 44 && s.y <= e.y + 2 && s.y > e.y - 80)) { s.cp = j; s.ev |= EV_FLAG; break; }
      }
    }
  }

  // ---------- small drawing helpers ----------
  function shade(hex, f) { return window.Scene && window.Scene.shade ? window.Scene.shade(hex, f) : hex; }
  function rgb(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
  function mix(a, b, f) { a = rgb(a); b = rgb(b); return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * f) + ',' + Math.round(a[1] + (b[1] - a[1]) * f) + ',' + Math.round(a[2] + (b[2] - a[2]) * f) + ')'; }
  function poly(g, p) { g.beginPath(); g.moveTo(p[0], p[1]); for (var i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); }
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function star(g, x, y, r) {
    g.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    g.closePath();
  }
  function heart(g, x, y, r) {
    g.beginPath(); g.moveTo(x, y + r * 0.9); g.bezierCurveTo(x - r * 1.5, y - r * 0.2, x - r * 0.7, y - r * 1.2, x, y - r * 0.4);
    g.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.5, y - r * 0.2, x, y + r * 0.9); g.closePath();
  }
  function ol(g, w) { g.lineWidth = w || 3; g.strokeStyle = NAVY; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
  function medal(id, ms, full) {
    var m = (full ? MEDALS_FULL : MEDALS)[id], sec = ms / 1000;
    return !ms || !m ? '' : sec <= m[0] ? '🥇' : sec <= m[1] ? '🥈' : sec <= m[2] ? '🥉' : '';
  }
  function fmt(ms) {
    var d = Math.max(0, Math.round(ms / 100)), m = Math.floor(d / 600), s = Math.floor(d / 10) % 60;
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (d % 10);
  }
  function fmtS(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function placeTxt(n) { return n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : n + '.'; }

  // sprite cache: static things are drawn once into small canvases and reused
  var sprites = {}, spriteCount = 0, RES = 1;
  function spr(key, w, h, draw) {
    var s = sprites[key], g;
    if (!s) {
      if (spriteCount > 140) { sprites = {}; spriteCount = 0; }   // never let the cache grow without end
      s = document.createElement('canvas'); s.width = Math.max(1, Math.ceil(w * RES)); s.height = Math.max(1, Math.ceil(h * RES));
      g = s.getContext('2d'); g.scale(RES, RES); g.lineJoin = 'round'; g.lineCap = 'round';
      draw(g); s.lw = w; s.lh = h; sprites[key] = s; spriteCount++;
    }
    return s;
  }
  // A block seen a little from above: a lit top, a darker front and an even darker right side.
  // (0, 0) is the left end of the line the players stand on; that line runs through the middle of the top face.
  function block(g, w, top, front, side, hh) {
    var d = 8;
    g.lineJoin = 'round';
    poly(g, [w, 5, w + d, -5, w + d, -5 + hh, w, 5 + hh]); g.fillStyle = side; g.fill(); ol(g, 3);
    g.beginPath(); g.rect(0, 5, w, hh); g.fillStyle = front; g.fill(); ol(g, 3);
    g.fillStyle = 'rgba(27,42,73,0.13)'; g.fillRect(1.5, hh - 2, w - 3, 5.5);
    poly(g, [0, 5, w, 5, w + d, -5, d, -5]); g.fillStyle = top; g.fill(); ol(g, 3);
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(d + 3, -2); g.lineTo(w + d - 6, -2); g.stroke();
  }
  function tri(g, x, y, r, a, fill) {   // a little arrow head pointing along angle a
    poly(g, [x + Math.cos(a) * r, y + Math.sin(a) * r, x + Math.cos(a + 2.3) * r, y + Math.sin(a + 2.3) * r, x + Math.cos(a - 2.3) * r, y + Math.sin(a - 2.3) * r]);
    g.fillStyle = fill; g.fill(); ol(g, 2);
  }
  function platSprite(e, stg) {
    var k = e.k, kind = k === 'm' ? (e.dy ? 'mv' : 'mh') : k, w = e.w, col = stg.col, lk = LOOKS[stg.look].kind;
    var rest = k === 'f' && e.flag > 0 && (e.flag % tw.per === 0 || e.flag === tw.n), space = k === 'p' && lk === 'space';
    return spr(kind + '|' + w + '|' + (k === 'p' ? col + (tw.solid ? 's' : '') + (space ? 'x' : lk === 'ice' ? 'i' : '') : k === 'i' ? (tw.solid ? 's' : '') : rest ? 'r' : ''), w + 36, 56, function (g) {
      var i, n, list;
      g.translate(12, 16);
      if (space) {
        // space chapter: a metal deck with little lights
        block(g, w, '#E3E8F2', '#5B6785', '#3A445C', 18);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(1.5, 6.5, w - 3, 4);
        for (i = 13; i < w - 7; i += 24) { g.beginPath(); g.arc(i, 15, 4.2, 0, TAU); g.fillStyle = col; g.fill(); ol(g, 2); }
        if (tw.solid) { g.fillStyle = NAVY; g.fillRect(0, 21, w, 3.5); }
      } else if (k === 'p' && tw.solid) {
        // Hard tower: a slab of stone with a heavy underside (you cannot jump up through it)
        block(g, w, col, shade(col, -0.3), shade(col, -0.48), 18);
        g.strokeStyle = 'rgba(27,42,73,0.4)'; g.lineWidth = 2; g.beginPath();
        for (i = 22; i < w - 6; i += 30) { g.moveTo(i, 6.5); g.lineTo(i, 14); }
        for (i = 8; i < w - 6; i += 30) { g.moveTo(i, 14); g.lineTo(i, 21.5); }
        g.moveTo(1.5, 14); g.lineTo(w - 1.5, 14); g.stroke();
        g.fillStyle = NAVY; g.fillRect(0, 21, w, 3.5);
      } else if (k === 'p') {
        block(g, w, col, shade(col, -0.24), shade(col, -0.42), 18);
        for (i = 9; i < w - 5; i += 17) { g.beginPath(); g.arc(i, 5, 6.5, 0, Math.PI); g.fillStyle = lk === 'ice' ? '#FFFFFF' : col; g.fill(); ol(g, 2); }   // icing (snow in the ice chapter) over the edge
      } else if (k === 'i') {
        // ice: pale and glassy, with shine lines and little icicles underneath
        for (i = 16; i < w - 8; i += 34) { poly(g, [i - 5, 22, i + 5, 22, i, 33]); g.fillStyle = '#CDEFFF'; g.fill(); ol(g, 2); }
        block(g, w, '#F2FBFF', '#93D6F5', '#5FA9D6', 18);
        g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2.5; g.beginPath();
        for (i = 14; i < w - 12; i += 30) { g.moveTo(i, 19); g.lineTo(i + 9, 9); g.moveTo(i + 7, 19); g.lineTo(i + 11, 14.5); }
        g.stroke();
        if (tw.solid) { g.fillStyle = NAVY; g.fillRect(0, 21, w, 3.5); }
      } else if (k === 'f') {
        block(g, w, '#FFF3D6', rest ? '#FF8FB8' : '#F2B94B', rest ? '#C9577F' : '#C98A1E', 18);
        g.fillStyle = NAVY;
        for (i = 0; i * 10 < w - 3; i += 2) g.fillRect(i * 10 + 1.5, 6.5, Math.min(10, w - i * 10 - 3), 6);   // a chequered band: this is a checkpoint
        for (i = 1; i * 10 < w - 3; i += 2) g.fillRect(i * 10 + 1.5, 12.5, Math.min(10, w - i * 10 - 3), 6);
      } else if (k === 'm' || k === 'o' || k === 'sw') {
        block(g, w, '#F4F8FF', '#8FA6CC', '#5F769E', 18);
        if (k === 'm') { tri(g, w / 2 - 15, 14, 7, e.dy ? -Math.PI / 2 : Math.PI, '#FFD66B'); tri(g, w / 2 + 15, 14, 7, e.dy ? Math.PI / 2 : 0, '#FFD66B'); }
        else { g.beginPath(); g.arc(w / 2, 14, 5, 0, TAU); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2); }
      } else if (k === 'c') {
        block(g, w, '#8D9AB5', '#4A5670', '#333E57', 18);
        for (i = 0; i < 2; i++) { g.beginPath(); g.arc(i ? w - 10 : 10, 14, 6, 0, TAU); g.fillStyle = '#D5DCEA'; g.fill(); ol(g, 2); g.beginPath(); g.arc(i ? w - 10 : 10, 14, 1.8, 0, TAU); g.fillStyle = NAVY; g.fill(); }
      } else if (k === 'v') {
        n = Math.max(3, Math.round(w / 21)); list = [];
        for (i = 0; i < n; i++) list.push([10 + (w - 20) * i / (n - 1) + 4, 9 + (i % 2) * 3, 14 + (i * 7 % 3) * 1.5]);
        g.strokeStyle = NAVY; g.lineWidth = 6;
        for (i = 0; i < n; i++) { g.beginPath(); g.arc(list[i][0], list[i][1], list[i][2], 0, TAU); g.stroke(); }
        g.fillStyle = '#C9DDF2';
        for (i = 0; i < n; i++) { g.beginPath(); g.arc(list[i][0], list[i][1] + 2, list[i][2], 0, TAU); g.fill(); }
        g.fillStyle = '#FFFFFF';
        for (i = 0; i < n; i++) { g.beginPath(); g.arc(list[i][0], list[i][1] - 2.5, list[i][2] - 1.5, 0, TAU); g.fill(); }
      } else if (k === 'b') {
        rr(g, 5, 26, w - 2, 9, 4); g.fillStyle = '#56617A'; g.fill(); ol(g, 3);
        g.beginPath(); g.moveTo(w / 2 - 9, 26); g.lineTo(w / 2 + 17, 21); g.lineTo(w / 2 - 9, 16); g.lineTo(w / 2 + 17, 11); g.lineTo(w / 2 + 4, 8);
        g.strokeStyle = NAVY; g.lineWidth = 7; g.stroke(); g.strokeStyle = '#D5DCEA'; g.lineWidth = 3; g.stroke();
        rr(g, 0, -5, w + 8, 14, 7); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 3);
        g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 3; g.beginPath(); g.moveTo(9, -0.5); g.lineTo(w - 1, -0.5); g.stroke();
      }
    });
  }
  function ballSprite() {   // the heavy ball that swings on a chain
    return spr('ball', 64, 64, function (g) {
      var i, a;
      g.translate(32, 32);
      for (i = 0; i < 8; i++) { a = i * TAU / 8; poly(g, [Math.cos(a) * 29, Math.sin(a) * 29, Math.cos(a + 0.3) * 17, Math.sin(a + 0.3) * 17, Math.cos(a - 0.3) * 17, Math.sin(a - 0.3) * 17]); g.fillStyle = '#C9D3E6'; g.fill(); ol(g, 2.5); }
      g.beginPath(); g.arc(0, 0, 19, 0, TAU); g.fillStyle = '#5B6785'; g.fill(); ol(g, 3);
      g.beginPath(); g.arc(-6, -7, 6, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(-6, 1, 4.5, 0, TAU); g.arc(6, 1, 4.5, 0, TAU); g.fill();
      g.fillStyle = NAVY; g.beginPath(); g.arc(-5, 2, 2, 0, TAU); g.arc(5, 2, 2, 0, TAU); g.fill();
      g.strokeStyle = NAVY; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-11, -5); g.lineTo(-3, -2); g.moveTo(11, -5); g.lineTo(3, -2); g.stroke();
    });
  }
  function spikySprite() {  // the red spiky that walks up and down
    return spr('spiky', 52, 52, function (g) {
      var i, a;
      g.translate(26, 26);
      g.beginPath();
      for (i = 0; i < 20; i++) { a = i * TAU / 20; g.lineTo(Math.cos(a) * (i % 2 ? 13 : 22), Math.sin(a) * (i % 2 ? 13 : 22)); }
      g.closePath(); g.fillStyle = '#FF4F6D'; g.fill(); ol(g, 3);
      g.beginPath(); g.arc(-4, -5, 5, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(-5, 0, 4.2, 0, TAU); g.arc(5, 0, 4.2, 0, TAU); g.fill();
      g.fillStyle = NAVY; g.beginPath(); g.arc(-4.5, 1, 1.9, 0, TAU); g.arc(4.5, 1, 1.9, 0, TAU); g.fill();
    });
  }
  function icicleSprite() { // hangs with its top middle at (12, 3); the part that hurts is its middle
    return spr('icicle', 24, 40, function (g) {
      g.translate(12, 3);
      poly(g, [-8, 0, 8, 0, 3.5, 19, 0, 34, -3.5, 19]); g.fillStyle = '#BFE9FF'; g.fill(); ol(g, 2.5);
      poly(g, [-4.5, 3, -1, 3, -1.5, 19]); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill();
    });
  }
  var TPCOL = ['#9B6BFF', '#FF6FA5', '#3CC9B4', '#FFA53C'];
  function doorInSprite(n) {  // a magic door, feet at (26, 66)
    return spr('tp' + n, 52, 70, function (g) {
      var col = TPCOL[n % TPCOL.length], gr;
      function arch(w, h) { g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2, -h + w / 2); g.arc(0, -h + w / 2, w / 2, Math.PI, 0); g.lineTo(w / 2, 0); g.closePath(); }
      g.translate(26, 66);
      arch(44, 62); g.fillStyle = col; g.fill(); ol(g, 3);
      arch(30, 52);
      gr = g.createRadialGradient(0, -26, 2, 0, -26, 30); gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(0.55, shade(col, 0.5)); gr.addColorStop(1, shade(col, -0.45));
      g.fillStyle = gr; g.fill(); ol(g, 2.5);
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2.5; g.beginPath(); g.arc(0, -26, 9, 0.4, 3.6); g.stroke(); g.beginPath(); g.arc(0, -26, 15, 3.4, 6.4); g.stroke();
    });
  }
  function chestSprite(open) {  // the little treasure on a rest platform, feet at (24, 44)
    return spr('chest' + (open ? 1 : 0), 48, 48, function (g) {
      g.translate(24, 44);
      if (open) {
        poly(g, [-17, -22, -14, -40, 14, -40, 17, -22]); g.fillStyle = '#8A4A20'; g.fill(); ol(g, 3);
        g.beginPath(); g.ellipse(0, -22, 13, 5, 0, 0, TAU); g.fillStyle = '#FFE680'; g.fill();
        star(g, 0, -29, 7); g.fillStyle = '#FFD23F'; g.fill(); ol(g, 2);
      }
      rr(g, -17, -22, 34, 22, 4); g.fillStyle = '#B5692E'; g.fill(); ol(g, 3);
      g.fillStyle = '#FFD23F'; g.fillRect(-4, -20.5, 8, 19);
      g.strokeStyle = NAVY; g.lineWidth = 2; g.strokeRect(-4, -20.5, 8, 19);
      if (!open) {
        g.beginPath(); g.moveTo(-17, -21); g.quadraticCurveTo(-17, -37, 0, -37); g.quadraticCurveTo(17, -37, 17, -21); g.closePath(); g.fillStyle = '#C97F3C'; g.fill(); ol(g, 3);
        g.fillStyle = '#FFD23F'; g.fillRect(-4, -35, 8, 14); g.strokeRect(-4, -35, 8, 14);
        rr(g, -5, -26, 10, 10, 3); g.fillStyle = '#FFF3D6'; g.fill(); ol(g, 2);
      }
    });
  }
  function trophySprite() {
    return spr('trophy', 64, 72, function (g) {
      g.translate(32, 70);
      rr(g, -17, -10, 34, 10, 3); g.fillStyle = '#A05A2C'; g.fill(); ol(g, 3);
      g.beginPath(); g.rect(-5, -24, 10, 15); g.fillStyle = '#F2B94B'; g.fill(); ol(g, 3);
      g.beginPath(); g.moveTo(-19, -56); g.lineTo(19, -56); g.quadraticCurveTo(18, -26, 0, -22); g.quadraticCurveTo(-18, -26, -19, -56); g.closePath(); g.fillStyle = '#FFD23F'; g.fill(); ol(g, 3);
      g.strokeStyle = NAVY; g.lineWidth = 3; g.beginPath(); g.arc(-22, -45, 7, 0.5 * Math.PI, 1.6 * Math.PI); g.stroke(); g.beginPath(); g.arc(22, -45, 7, 1.4 * Math.PI, 0.5 * Math.PI); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(-9, -44, 3, 9, 0.15, 0, TAU); g.fill();
      star(g, 2, -41, 8); g.fillStyle = '#fff'; g.fill(); ol(g, 2);
    });
  }
  function cloudSprite(k) {
    return spr('cloud' + k, 190, 80, function (g) {
      var L = [[[40, 50, 24], [72, 38, 30], [110, 44, 26], [140, 52, 20]], [[36, 52, 20], [62, 42, 26], [96, 34, 30], [130, 46, 24], [156, 54, 16]], [[50, 48, 26], [88, 42, 28], [124, 50, 22]]][k], i;
      g.fillStyle = 'rgba(150,190,230,0.55)';
      for (i = 0; i < L.length; i++) { g.beginPath(); g.arc(L[i][0], L[i][1] + 6, L[i][2], 0, TAU); g.fill(); }
      g.fillStyle = '#fff';
      for (i = 0; i < L.length; i++) { g.beginPath(); g.arc(L[i][0], L[i][1], L[i][2], 0, TAU); g.fill(); }
    });
  }
  // the land far below: two rows of hills and the little houses of the town
  function farSprite(hard) {
    return spr('far' + (hard ? 1 : 0), 800, 240, function (g) {
      var x, i, y, s, ROOF = ['#E0447F', '#F08A24', '#3B5BDB', '#37B24D', '#C92A2A', '#6C4BD8'];
      function h1(x) { return 74 + Math.sin(x * TAU / 400) * 20 + Math.sin(x * TAU / 160 + 1) * 9; }
      function h2(x) { return 122 + Math.sin(x * TAU / 800 * 3 + 2) * 16 + Math.sin(x * TAU / 200) * 7; }
      g.fillStyle = hard ? '#C08FC4' : '#B5E3C0'; g.beginPath(); g.moveTo(0, 240); for (x = 0; x <= 800; x += 16) g.lineTo(x, h1(x)); g.lineTo(800, 240); g.closePath(); g.fill();
      g.fillStyle = hard ? '#9A6DB5' : '#8ED6A0'; g.beginPath(); g.moveTo(0, 240); for (x = 0; x <= 800; x += 16) g.lineTo(x, h2(x)); g.lineTo(800, 240); g.closePath(); g.fill();
      for (i = 0; i < 26; i++) {      // trees
        x = rnd(i + 5) * 800; y = h2(x) + 6 + rnd(i + 60) * 70; s = 5 + rnd(i + 90) * 5;
        g.fillStyle = hard ? '#7B4F9C' : '#5DBB72'; g.beginPath(); g.arc(x, y, s, 0, TAU); g.arc(x + s * 0.8, y + 2, s * 0.8, 0, TAU); g.fill();
      }
      for (i = 0; i < 15; i++) {      // houses
        x = 20 + i * 52 + rnd(i) * 22; y = h2(x) + 14 + rnd(i + 40) * 52; s = 13 + rnd(i + 9) * 9;
        g.fillStyle = 'rgba(27,42,73,0.16)'; g.fillRect(x + 3, y - s * 0.7 + 3, s, s * 0.7);
        g.fillStyle = hard ? '#F3DDE6' : '#FFF6E0'; g.fillRect(x, y - s * 0.7, s, s * 0.7);
        g.fillStyle = shade(ROOF[i % ROOF.length], hard ? -0.15 : 0); poly(g, [x - 3, y - s * 0.7, x + s / 2, y - s * 1.25, x + s + 3, y - s * 0.7]); g.fill();
        g.fillStyle = hard ? '#FFD66B' : '#6FA8DC'; g.fillRect(x + s * 0.3, y - s * 0.48, s * 0.25, s * 0.25);
      }
      g.fillStyle = hard ? 'rgba(245,160,150,0.22)' : 'rgba(205,239,255,0.28)'; g.fillRect(0, 0, 800, 240);   // haze: it is far away
    });
  }
  // the wall of a chapter: bricks (with frost in the ice chapter, gold stars in the clouds) or the metal plates of the space chapter
  function wallSprite(lk) {
    var L = LOOKS[lk];
    return spr('wall' + lk, TX1 - TX0, 240, function (g) {
      var w = TX1 - TX0, base = L.wall, y, x, row = 0, gr;
      g.fillStyle = base; g.fillRect(0, 0, w, 240);
      if (L.kind === 'space') {
        for (y = 0; y < 240; y += 60, row++) {
          for (x = (row % 2) * 62 - 124; x < w; x += 124) {
            g.fillStyle = rnd(x * 0.31 + row * 7.3) > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(10,12,40,0.12)'; g.fillRect(x + 2, y + 2, 120, 56);
            g.fillStyle = 'rgba(255,255,255,0.3)';
            g.beginPath(); g.arc(x + 9, y + 9, 2.2, 0, TAU); g.arc(x + 115, y + 9, 2.2, 0, TAU); g.arc(x + 9, y + 51, 2.2, 0, TAU); g.arc(x + 115, y + 51, 2.2, 0, TAU); g.fill();
            if (rnd(x * 0.7 + row * 3.1) > 0.6) { g.fillStyle = rnd(x + row * 5) > 0.5 ? L.trim : '#FFD66B'; g.fillRect(x + 50, y + 26, 20, 6); }   // a little light
          }
        }
        g.strokeStyle = shade(base, -0.3); g.lineWidth = 2.5; g.beginPath(); row = 0;
        for (y = 0; y < 240; y += 60, row++) {
          g.moveTo(0, y + 1); g.lineTo(w, y + 1);
          for (x = (row % 2) * 62; x < w; x += 124) { g.moveTo(x, y + 1); g.lineTo(x, y + 61); }
        }
        g.stroke();
      } else {
        for (y = 0; y < 240; y += 30, row++) {
          for (x = (row % 2) * 32 - 64; x < w; x += 64) {
            if (rnd(x * 0.37 + row * 9.1) > 0.72) { g.fillStyle = rnd(x + row) > 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(27,42,73,0.07)'; g.fillRect(x + 2, y + 2, 60, 26); }
            if (L.kind === 'ice' && rnd(x * 0.53 + row * 4.7) > 0.5) { g.fillStyle = 'rgba(255,255,255,0.75)'; rr(g, x + 3, y + 2, 58, 7, 3.5); g.fill(); }
            if (L.kind === 'cloud' && rnd(x * 0.61 + row * 2.9) > 0.78) { star(g, x + 32, y + 15, 7); g.fillStyle = 'rgba(242,185,75,0.6)'; g.fill(); }
          }
        }
        g.strokeStyle = shade(base, -0.17); g.lineWidth = 2; g.beginPath(); row = 0;
        for (y = 0; y < 240; y += 30, row++) {
          g.moveTo(0, y + 1); g.lineTo(w, y + 1);
          for (x = (row % 2) * 32; x < w; x += 64) { g.moveTo(x, y + 1); g.lineTo(x, y + 31); }
        }
        g.stroke();
      }
      gr = g.createLinearGradient(0, 0, w, 0);   // the tower is round: light on the left, shade on the right
      gr.addColorStop(0, 'rgba(255,255,255,0.05)'); gr.addColorStop(0.22, 'rgba(255,255,255,0.20)'); gr.addColorStop(0.55, 'rgba(27,42,73,0.03)'); gr.addColorStop(1, 'rgba(27,42,73,0.40)');
      g.fillStyle = gr; g.fillRect(0, 0, w, 240);
    });
  }
  function windowSprite(lk) {
    var L = LOOKS[lk];
    return spr('win' + lk, 64, 96, function (g) {
      function arch(x, y, w, h) { g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); }
      if (L.kind === 'space') {      // a round window with a planet in it
        g.beginPath(); g.arc(32, 46, 28, 0, TAU); g.fillStyle = shade(L.wall, 0.4); g.fill(); ol(g, 3.5);
        g.beginPath(); g.arc(32, 46, 21, 0, TAU); g.fillStyle = '#0C0E2B'; g.fill(); ol(g, 3);
        g.save(); g.beginPath(); g.arc(32, 46, 19.5, 0, TAU); g.clip();
        g.beginPath(); g.arc(40, 54, 11, 0, TAU); g.fillStyle = L.glass; g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(22, 36, 1.6, 0, TAU); g.arc(30, 58, 1.2, 0, TAU); g.arc(44, 34, 1.4, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.2)'; poly(g, [10, 60, 34, 22, 42, 22, 18, 60]); g.fill();
        g.restore();
        return;
      }
      arch(4, 4, 56, 80); g.fillStyle = shade(L.wall, 0.35); g.fill(); ol(g, 3.5);
      arch(11, 11, 42, 73); g.fillStyle = L.glass; g.fill(); ol(g, 3);
      g.save(); arch(11, 11, 42, 73); g.clip();
      g.fillStyle = 'rgba(255,255,255,0.22)'; poly(g, [8, 60, 34, 8, 44, 8, 18, 60]); g.fill();
      g.fillStyle = tw.solid ? 'rgba(255,214,107,0.5)' : 'rgba(255,255,255,0.12)'; g.fillRect(11, 62, 42, 22);
      g.restore();
      g.strokeStyle = NAVY; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 12); g.lineTo(32, 84); g.moveTo(11, 46); g.lineTo(53, 46); g.stroke();
      rr(g, 1, 82, 62, 10, 3); g.fillStyle = L.kind === 'ice' ? '#FFFFFF' : shade(L.wall, 0.35); g.fill(); ol(g, 3);
    });
  }
  function doorSprite(wall) {
    return spr('door' + wall, 100, 130, function (g) {
      function arch(x, y, w, h) { g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); }
      arch(4, 4, 92, 124); g.fillStyle = shade(wall, 0.35); g.fill(); ol(g, 4);
      arch(14, 14, 72, 114); g.fillStyle = '#A05A2C'; g.fill(); ol(g, 3.5);
      g.strokeStyle = 'rgba(27,42,73,0.35)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(32, 22); g.lineTo(32, 128); g.moveTo(50, 14); g.lineTo(50, 128); g.moveTo(68, 22); g.lineTo(68, 128); g.stroke();
      g.beginPath(); g.arc(72, 82, 5, 0, TAU); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2.5);
    });
  }
  function signSprite() {   // by the door: you can jump once more in the air
    return spr('sign', 96, 60, function (g) {
      function arrow(x) { poly(g, [x, 12, x + 13, 28, x + 5, 28, x + 5, 46, x - 5, 46, x - 5, 28, x - 13, 28]); g.fillStyle = '#FFD66B'; g.fill(); ol(g, 2.5); }
      rr(g, 3, 3, 90, 54, 12); g.fillStyle = '#FFF3D6'; g.fill(); ol(g, 3.5);
      arrow(26); arrow(70);
      g.strokeStyle = NAVY; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(42, 30); g.lineTo(54, 30); g.moveTo(48, 24); g.lineTo(48, 36); g.stroke();
    });
  }
  function sunSprite(hard) {
    return spr('sun' + (hard ? 1 : 0), 160, 160, function (g) {
      var gr = g.createRadialGradient(80, 80, 20, 80, 80, 80);
      gr.addColorStop(0, hard ? 'rgba(255,190,110,0.75)' : 'rgba(255,246,190,0.8)'); gr.addColorStop(1, 'rgba(255,240,180,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 160, 160);
      g.beginPath(); g.arc(80, 80, 34, 0, TAU); g.fillStyle = hard ? '#FFB45E' : '#FFE680'; g.fill();
      g.beginPath(); g.arc(70, 70, 16, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill();
    });
  }
  function moonSprite() {
    return spr('moon', 100, 100, function (g) {
      g.beginPath(); g.arc(50, 50, 36, 0, TAU); g.fillStyle = '#FFF6D8'; g.fill();
      g.fillStyle = 'rgba(180,170,200,0.45)';
      g.beginPath(); g.arc(38, 40, 8, 0, TAU); g.arc(62, 58, 11, 0, TAU); g.arc(44, 68, 5, 0, TAU); g.fill();
    });
  }
  function planetSprite() { // far away in the space chapter
    return spr('planet', 120, 90, function (g) {
      g.beginPath(); g.arc(60, 45, 28, 0, TAU); g.fillStyle = '#F2A65A'; g.fill();
      g.fillStyle = 'rgba(160,80,40,0.35)'; g.beginPath(); g.ellipse(60, 38, 26, 5, 0, 0, TAU); g.ellipse(60, 54, 24, 4, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(50, 35, 12, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,230,160,0.8)'; g.lineWidth = 5; g.beginPath(); g.ellipse(60, 45, 52, 11, -0.25, 0, TAU); g.stroke();
    });
  }
  // the chapters of a tower, from the bottom: where they begin and end (heights above the ground) and how they look
  function chapters(t) {
    var n, c, a, b;
    if (t.chs) return t.chs;
    t.chs = []; n = Math.ceil(t.n / t.per);
    for (c = 0; c < n; c++) { a = c * t.per; b = Math.min(t.n, a + t.per); t.chs.push({ a: a, b: b, lo: -t.stages[a].base, hi: -t.stages[b].base, look: t.stages[a].look }); }
    return t.chs;
  }
  function chapterAt(t, h) {   // the chapter at this height
    var l = chapters(t), i;
    for (i = 0; i < l.length - 1; i++) if (h < l[i].hi) return i;
    return l.length - 1;
  }

  // ---------- names (labels only, always in three languages) ----------
  var MEDALS_FULL = { easy: [300, 480, 720], hard: [540, 840, 1260] };   // the whole tower: seconds for gold, silver, bronze
  var MODE_NAME = {
    climb: { en: 'Climb', zh: '爬塔', py: 'pá tǎ', ms: 'Panjat menara' },
    race: { en: 'Race', zh: '比赛', py: 'bǐsài', ms: 'Perlumbaan' },
    lava: { en: 'Rising lava', zh: '岩浆上升', py: 'yánjiāng shàngshēng', ms: 'Lava naik' },
    endless: { en: 'Endless tower', zh: '无尽塔', py: 'wújìn tǎ', ms: 'Menara tanpa henti' }
  };
  var MODE_ICON = { climb: '🗼', race: '🏁', lava: '🌋', endless: '⏫', tower: '🗼' };
  var CHAPS = [
    { icon: '🌱', en: 'Garden', zh: '花园', py: 'huāyuán', ms: 'Taman' },
    { icon: '🏰', en: 'Castle', zh: '城堡', py: 'chéngbǎo', ms: 'Istana' },
    { icon: '❄️', en: 'Ice', zh: '冰雪', py: 'bīngxuě', ms: 'Ais' },
    { icon: '☁️', en: 'Clouds', zh: '云朵', py: 'yúnduǒ', ms: 'Awan' },
    { icon: '🚀', en: 'Space', zh: '太空', py: 'tàikōng', ms: 'Angkasa' }
  ];
  var HEARTS = 5;                  // falls allowed in one climb of the endless tower (a rest platform gives one back)
  var GHOST_DT = 150;              // the recording of a race: one point every 150 ms, three letters each
  var LOOK_MS = 5000;              // looking at somebody else ends by itself after this long without a touch
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  // ---------- state of the screen ----------
  var root = null, cv = null, c = null, els = {};
  var cw = 800, ch = 480, dpr = 1, S = 1, ox = 0, vh = 480;
  var gap = 134;                   // grass shown under the ground line (world units): the touch buttons must not cover the player there
  var raf = 0, lastT = 0, tOff = 0;
  var mode = null;                 // null = closed, 'lobby', 'run', 'done'
  var tab = 'climb';               // the way to play shown at the entrance: 'climb', 'race', 'lava', 'endless'
  var sel = { rt: 'easy', rc: 0, lt: 'easy' };    // what is picked for a race (tower, chapter) and for the lava (tower)
  var info = null;                 // what the server told us: { towers, me, lb, who, pt, day, caps }
  var tw = null, st = null, run = null;
  var look = null;                 // looking away from my own player: { id: whom (0 = just scrolling), y, last, auto }
  var cam = { y: 0 };
  var others = {};                 // id -> { x, y, tx, ty, f, m, seen }
  var parts = [], pops = [], tags = [];
  var bounced = {};                // bounce pad index -> when it was last used (seconds), for the squash
  var squash = 0, deaths = 0, flash = 0;
  var touch = { id: null, dir: 0, jumps: {}, n: 0, mid: 106 };
  var hud = { flag: '', time: '', extra: '', l: false, r: false, j: false, who: '', look: '', cd: '' };
  var bar = { id: null, y0: 0, x0: 0, t0: 0, moved: false };
  var clouds = [], lobbyHtml = '';
  var actx = null;

  // little sounds of our own (jump, bounce, poof); they follow the game's sound switch
  function wake() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!actx && AC) actx = new AC();
      if (actx && actx.state === 'suspended' && actx.resume) actx.resume();
    } catch (e) {}
  }
  function beep(f0, f1, d, v, type) {
    try {
      if (!window.Sfx || typeof window.Sfx.mode !== 'function' || window.Sfx.mode() === 0) return;
      wake();
      if (!actx) return;
      var t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.03);
    } catch (e) {}
  }

  var ARROW = '<svg viewBox="0 0 24 24" width="46%" height="46%" aria-hidden="true"><path d="M17 3 L5 12 L17 21 Z" fill="#1B2A49" stroke="#1B2A49" stroke-width="2.5" stroke-linejoin="round"/></svg>';
  var CSS = [
    '.obby-root{background:#8ED8F8;overflow:hidden;touch-action:none;color:#1B2A49}',
    '.obby-cv{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none}',
    '.obby-top{position:absolute;left:10px;top:10px;right:10px;display:flex;gap:8px;align-items:center;pointer-events:none}',
    '.obby-top>*{pointer-events:auto;flex:none}',
    '.obby-top .btn{height:50px;font-size:18px;padding:0 16px;border-width:3px;white-space:nowrap}',
    '.obby-tabs{display:flex;gap:6px}',
    '.obby-tabs[hidden]{display:none}',
    '.obby-top .obby-tab{padding:0 13px}',
    '.obby-tab.on{background:#FFD66B}',
    '.obby-ttl{flex:0 1 auto;min-width:0;font-size:19px;font-weight:600;background:#FFF3D6;border:3px solid #1B2A49;border-radius:999px;padding:0 18px;height:50px;line-height:44px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.obby-pill{height:50px;display:flex;align-items:center;gap:6px;padding:0 16px;border-radius:999px;border:3px solid #1B2A49;background:#fff;font-size:22px;font-weight:700;white-space:nowrap;pointer-events:none}',
    '.obby-pill.dark{background:#1B2A49;color:#fff;border-color:#fff;min-width:128px}',
    '.obby-pill[hidden]{display:none}',
    '.obby-lobby{position:absolute;left:0;right:0;top:68px;bottom:0;display:grid;grid-template-columns:repeat(2,minmax(0,540px));grid-template-rows:fit-content(100%);gap:12px;padding:4px 12px 14px;align-content:center;justify-content:center}',
    '.obby-lobby[hidden]{display:none}',
    '.obby-card{min-width:0;min-height:0;overflow-y:auto;touch-action:pan-y;background:#FFF3D6;border:4px solid #1B2A49;border-radius:26px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;box-shadow:0 7px 0 rgba(27,42,73,.25)}',
    '.obby-wait{grid-column:1 / 3;justify-self:center;font-size:22px;font-weight:600;text-align:center}',
    '.obby-ch{display:flex;align-items:center;gap:10px}',
    '.obby-ico{flex:none;width:40px;height:54px}',
    '.obby-emo{flex:none;width:54px;height:54px;border-radius:16px;border:3px solid #1B2A49;background:#fff;font-size:32px;line-height:48px;text-align:center}',
    '.obby-nm{font-size:16px;font-weight:600;line-height:1.25}',
    '.obby-nm b{font-size:22px;display:block}',
    '.obby-sub{font-size:15px;font-weight:600;line-height:1.25}',
    '.obby-sub b{font-size:18px}',
    '.obby-prog{display:flex;align-items:center;gap:8px;font-size:18px;font-weight:700}',
    '.obby-flags{flex:1;min-width:0;display:flex;gap:2px}',
    '.obby-flags i{flex:1 1 0;height:15px;border-radius:4px;border:2px solid #1B2A49;background:#fff}',
    '.obby-flags i.on{background:#58C06B}',
    '.obby-flags i.top{margin-right:4px}',
    '.obby-flags i.top.on{background:#FFD23F}',
    '.obby-chaps{display:flex;gap:5px}',
    '.obby-chap{flex:1 1 0;min-width:0;height:54px;padding:0 2px;border-width:3px;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.1;font-size:17px;gap:2px;white-space:nowrap}',
    '.obby-chap i{font-style:normal;font-size:12.5px;font-weight:600}',
    '.obby-chap.done{background:#D5F3DB}',
    '.obby-chap.on{background:#FFD66B}',
    '.obby-chap.on:disabled{opacity:1}',
    '.obby-seg{display:flex;gap:6px}',
    '.obby-seg .btn{flex:1 1 0;min-width:0;height:50px;padding:0 6px;font-size:18px;border-width:3px;white-space:nowrap}',
    '.obby-seg .btn.on{background:#FFD66B}',
    '.obby-seg .btn.on:disabled{opacity:1}',
    '.obby-row{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:16px;font-weight:600;flex-wrap:wrap}',
    '.obby-row b{font-size:19px}',
    '.obby-rew{display:flex;gap:5px;flex-wrap:wrap;font-size:15px;font-weight:600}',
    '.obby-rew span{background:#fff;border:2px solid #1B2A49;border-radius:999px;padding:1px 9px;white-space:nowrap}',
    '.obby-state{background:#fff;border:3px dashed #1B2A49;border-radius:16px;padding:5px 10px;font-size:16px;font-weight:600;min-height:40px;display:flex;flex-wrap:wrap;gap:3px 10px;align-items:center}',
    '.obby-state b{font-size:22px;margin-left:auto}',
    '.obby-lb{background:#fff;border:3px solid #1B2A49;border-radius:16px;padding:5px 10px;font-size:16px;font-weight:600;min-width:0}',
    '.obby-lbh{font-size:14.5px;font-weight:700;margin-bottom:2px;white-space:nowrap;overflow:hidden;display:flex;justify-content:space-between;gap:6px}',
    '.obby-lbh b{font-size:15.5px}',
    '.obby-lb ol{list-style:none;margin:0;padding:0}',
    '.obby-lb li{display:flex;gap:7px;align-items:center;line-height:1.45}',
    '.obby-lb li b{flex:none;width:21px;height:21px;line-height:21px;text-align:center;border-radius:50%;background:#1B2A49;color:#fff;font-size:13px}',
    '.obby-lb li:first-child b{background:#FFD23F;color:#1B2A49}',
    '.obby-lb li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.obby-lb li em{font-style:normal;font-weight:700;white-space:nowrap}',
    '.obby-lb li.me span{text-decoration:underline}',
    '.obby-lb li.none{font-weight:500;opacity:.75}',
    '.obby-lb2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px}',
    '.obby-now{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:15px;font-weight:600}',
    '.obby-now span{display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #1B2A49;border-radius:999px;padding:1px 10px 1px 4px;white-space:nowrap}',
    '.obby-now i{width:18px;height:18px;border-radius:6px;border:2px solid #1B2A49}',
    '.obby-btns{display:flex;gap:8px;margin-top:auto}',
    '.obby-btns .btn{flex:1 1 0;min-width:0;padding:0 8px;font-size:19px;white-space:nowrap}',
    '.obby-keys{position:absolute;left:0;right:0;bottom:0;height:0;pointer-events:none}',
    '.obby-key{position:absolute;bottom:16px;width:86px;height:86px;border-radius:50%;border:4px solid #1B2A49;background:rgba(255,255,255,.7);display:flex;align-items:center;justify-content:center}',
    '.obby-key.l{left:14px}',
    '.obby-key.r{left:112px}',
    '.obby-key.r svg{transform:scaleX(-1)}',
    '.obby-key.j{right:16px;width:112px;height:112px;background:rgba(255,214,107,.82)}',
    '.obby-key.j svg{transform:rotate(90deg)}',
    '.obby-key.on{background:#FFD66B;transform:scale(.93)}',
    '.obby-key.j.on{background:#FFB020}',
    // the panel at the right edge: everybody in the room (tap = look at them) and the height bar (drag = look up and down)
    '.obby-bar{position:absolute;right:0;top:74px;bottom:138px;width:54px;touch-action:none;cursor:ns-resize}',
    '.obby-who{position:absolute;right:56px;top:72px;bottom:142px;display:flex;flex-direction:column;flex-wrap:wrap-reverse;align-content:flex-start;gap:4px;pointer-events:none}',
    '.obby-who[hidden],.obby-bar[hidden],.obby-look[hidden]{display:none}',
    '.obby-pc{pointer-events:auto;flex:none;width:112px;height:48px;padding:0 6px 0 5px;border-radius:16px;border:3px solid #1B2A49;background:rgba(255,255,255,.86);display:flex;align-items:center;gap:6px;font-size:15px;font-weight:700;text-align:left;touch-action:manipulation;color:#1B2A49}',
    '.obby-pc i{flex:none;width:20px;height:20px;border-radius:7px;border:2.5px solid #1B2A49}',
    '.obby-pc span{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.12}',
    '.obby-pc b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.obby-pc em{font-style:normal;font-size:13.5px;white-space:nowrap}',
    '.obby-pc.me{background:rgba(255,214,107,.92)}',
    '.obby-pc.on{background:#1B2A49;color:#fff;border-color:#fff}',
    '.obby-pc.off{opacity:.62}',
    '.obby-look{position:absolute;left:50%;bottom:52px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}',
    '.obby-lookn{background:#1B2A49;color:#fff;border:3px solid #fff;border-radius:999px;padding:3px 18px;font-size:21px;font-weight:700;white-space:nowrap;max-width:60vw;overflow:hidden;text-overflow:ellipsis}',
    '.obby-backme{pointer-events:auto;height:62px;font-size:22px;padding:0 26px;white-space:nowrap;box-shadow:0 5px 0 rgba(27,42,73,.3)}',
    '.obby-backme[hidden]{display:none}',
    '.obby-done{position:absolute;left:0;right:0;top:66px;display:flex;justify-content:center;pointer-events:none;padding:0 12px}',
    '.obby-done[hidden]{display:none}',
    '.obby-dc{pointer-events:auto;background:#FFF3D6;border:4px solid #1B2A49;border-radius:26px;padding:10px 22px 12px;text-align:center;display:flex;flex-direction:column;gap:4px;align-items:center;min-width:300px;max-width:100%;max-height:calc(100vh - 80px);overflow-y:auto;touch-action:pan-y;box-shadow:0 7px 0 rgba(27,42,73,.25);animation:ftPop .3s ease-out}',
    '.obby-dc.mini{padding:6px 18px 8px;min-width:0;border-radius:22px}',
    '.obby-dt{font-size:28px;font-weight:700;line-height:1.1}',
    '.obby-dn{font-size:16px;font-weight:600}',
    '.obby-dtime{font-size:38px;font-weight:700;line-height:1.1}',
    '.obby-dx{font-size:18px;font-weight:600;min-height:22px}',
    '.obby-ds{font-size:24px;font-weight:700;background:#FFD66B;border:3px solid #1B2A49;border-radius:999px;padding:0 16px}',
    '.obby-dl{align-self:stretch;list-style:none;margin:2px 0;padding:0;background:#fff;border:3px solid #1B2A49;border-radius:16px;font-size:18px;font-weight:600}',
    '.obby-dl li{display:flex;gap:10px;align-items:center;padding:2px 12px;line-height:1.5}',
    '.obby-dl li+li{border-top:2px solid rgba(27,42,73,.15)}',
    '.obby-dl li.me{background:#FFF0B8}',
    '.obby-dl li:first-child{border-radius:13px 13px 0 0}',
    '.obby-dl li:last-child{border-radius:0 0 13px 13px}',
    '.obby-dl li b{flex:none;min-width:30px;text-align:left}',
    '.obby-dl li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}',
    '.obby-dl li em{font-style:normal;font-weight:700;white-space:nowrap}',
    '.obby-dc .obby-btns{margin-top:6px;align-self:stretch}',
    '@media (max-width:1150px){.obby-ttl{display:none}}',
    '@media (max-width:900px),(max-height:560px){.obby-top{gap:6px}.obby-top .btn{font-size:16px;padding:0 11px}.obby-top .obby-tab{padding:0 9px}.obby-tabs{gap:4px}.obby-pill{font-size:18px;padding:0 10px}.obby-pill.dark{min-width:104px}' +
      '.obby-card{padding:8px 11px;gap:5px;border-radius:22px}.obby-ico{width:34px;height:46px}.obby-emo{width:44px;height:44px;font-size:26px;line-height:38px;border-radius:13px}.obby-nm{font-size:14px}.obby-nm b{font-size:19px}' +
      '.obby-row{font-size:14.5px}.obby-row b{font-size:17px}.obby-lb{font-size:14.5px;padding:3px 9px}.obby-lb li{line-height:1.35}.obby-rew{font-size:13.5px}.obby-chap{height:50px;font-size:15.5px}.obby-chap i{font-size:12px}.obby-seg .btn{height:48px;font-size:16px}.obby-state{font-size:14.5px;min-height:36px}' +
      '.obby-btns .btn{font-size:17px;height:50px}.obby-key{width:78px;height:78px}.obby-key.r{left:102px}.obby-key.j{width:100px;height:100px}.obby-who{bottom:130px}.obby-pc{width:104px;font-size:14px}' +
      '.obby-dt{font-size:22px}.obby-dtime{font-size:28px}.obby-ds{font-size:19px}.obby-dx{font-size:15.5px}.obby-dl{font-size:15.5px}.obby-backme{height:56px;font-size:20px}.obby-lookn{font-size:18px}}'
  ].join('\n');

  // ---------- opening and closing ----------
  function open() {
    if (root) return;
    if (!document.getElementById('obby-style')) { var s = document.createElement('style'); s.id = 'obby-style'; s.textContent = CSS; document.head.appendChild(s); }
    root = document.createElement('div'); root.className = 'screen obby-root';
    root.innerHTML = '<canvas class="obby-cv" aria-label="Obby Tower"></canvas>' +
      '<div class="obby-top"><button class="btn obby-back" type="button" data-quiet>Back to town</button>' +
      '<button class="btn obby-menu" type="button" hidden>🗼 Towers</button>' +
      '<div class="obby-tabs"><button class="btn obby-tab" type="button" data-tab="climb">🗼 Climb</button><button class="btn obby-tab" type="button" data-tab="race">🏁 Race</button>' +
      '<button class="btn obby-tab" type="button" data-tab="lava">🌋 Lava</button><button class="btn obby-tab" type="button" data-tab="endless">⏫ Endless</button></div>' +
      '<div class="obby-ttl">' + api.three(NAME) + '</div>' +
      '<div class="obby-pill obby-pf" hidden></div><div class="obby-pill dark obby-pt" hidden></div><div class="obby-pill obby-px" hidden></div></div>' +
      '<div class="obby-lobby"></div>' +
      '<div class="obby-bar" hidden></div><div class="obby-who" hidden></div>' +
      '<div class="obby-look" hidden><div class="obby-lookn"></div><button class="btn primary obby-backme" type="button">↩ Back to me</button></div>' +
      '<div class="obby-keys" hidden><div class="obby-key l">' + ARROW + '</div><div class="obby-key r">' + ARROW + '</div><div class="obby-key j">' + ARROW + '</div></div>' +
      '<div class="obby-done" hidden></div>';
    document.body.appendChild(root);
    cv = root.querySelector('.obby-cv'); c = cv.getContext('2d');
    function q(s) { return root.querySelector(s); }
    els = { back: q('.obby-back'), menu: q('.obby-menu'), tabs: q('.obby-tabs'), ttl: q('.obby-ttl'), pf: q('.obby-pf'), pt: q('.obby-pt'), px: q('.obby-px'),
      lobby: q('.obby-lobby'), keys: q('.obby-keys'), kl: q('.obby-key.l'), kr: q('.obby-key.r'), kj: q('.obby-key.j'), done: q('.obby-done'),
      bar: q('.obby-bar'), who: q('.obby-who'), look: q('.obby-look'), lookn: q('.obby-lookn'), backme: q('.obby-backme') };
    els.back.onclick = close;
    els.menu.onclick = function () { els.menu.blur(); toLobby(); };
    els.tabs.addEventListener('click', onTabClick);
    els.lobby.addEventListener('click', onLobbyClick);
    els.done.addEventListener('click', onDoneClick);
    els.who.addEventListener('click', onWhoClick);
    els.backme.onclick = function () { els.backme.blur(); endLook(); };
    els.bar.addEventListener('pointerdown', barDown); els.bar.addEventListener('pointermove', barMove); els.bar.addEventListener('pointerup', barUp); els.bar.addEventListener('pointercancel', barUp);
    cv.addEventListener('pointerdown', pDown); cv.addEventListener('pointermove', pMove); cv.addEventListener('pointerup', pUp); cv.addEventListener('pointercancel', pUp);
    window.addEventListener('resize', resize); window.addEventListener('blur', dropTouch);
    window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKey, true);
    info = null; run = null; st = null; look = null; others = {}; parts = []; pops = []; deaths = 0; lobbyHtml = '';
    tw = tower('easy'); makeClouds();
    setMode('lobby');
    resize();
    cam.y = gap - vh;
    lastT = 0;
    raf = requestAnimationFrame(frame);
    api.enter('obby');
  }
  function close() {
    if (!root) return;
    cancelAnimationFrame(raf); raf = 0;
    window.removeEventListener('resize', resize); window.removeEventListener('blur', dropTouch);
    window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true);
    if (root.parentNode) root.parentNode.removeChild(root);
    root = null; cv = null; c = null; els = {}; mode = null; run = null; st = null; look = null; others = {}; parts = []; pops = [];
    sprites = {}; spriteCount = 0;
    dropTouch();
    api.sfx('close');
    api.leave();     // the server ends the climb; the flags reached stay saved
  }
  function resize() {
    if (!root) return;
    cw = Math.max(200, root.clientWidth); ch = Math.max(160, root.clientHeight);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    S = Math.min(cw / W, ch / 400); ox = (cw - W * S) / 2; vh = ch / S; gap = 134 / S;
    var res = Math.max(0.75, Math.min(2.5, Math.ceil(S * dpr * 4) / 4));
    if (res !== RES) { RES = res; sprites = {}; spriteCount = 0; }
    var r = els.kr && els.kr.getBoundingClientRect();
    if (r && r.width) touch.mid = r.left - 6;
  }
  function setMode(m) {
    var lobby = m === 'lobby', spec = !!run && run.spec;
    mode = m;
    els.lobby.hidden = !lobby;
    els.ttl.hidden = !lobby;
    els.tabs.hidden = !lobby;
    els.menu.hidden = lobby;
    els.keys.hidden = lobby || spec;
    els.pf.hidden = lobby;
    els.pt.hidden = true;
    els.px.hidden = lobby;
    els.bar.hidden = lobby;
    els.who.hidden = lobby;
    els.done.hidden = m !== 'done';
    if (lobby) { els.look.hidden = true; look = null; }
    hud.flag = hud.time = hud.extra = hud.who = hud.look = '';
    dropTouch();
    if (lobby) renderLobby();
    resize();
  }
  function toLobby(quiet) {
    if (run && !quiet) api.send({ t: 'obby.quit' });
    run = null; st = null; others = {}; look = null;
    setMode('lobby');
  }

  // ---------- the entrance: pick a way to play ----------
  function renderLobby() {
    if (!root || mode !== 'lobby') return;
    var html, list, i;
    if (!info) html = '<div class="obby-card obby-wait">Opening the tower…</div>';
    else if (tab === 'race') html = raceHtml();
    else if (tab === 'lava') html = lavaHtml();
    else if (tab === 'endless') html = endlessHtml();
    else html = cardHtml('easy') + cardHtml('hard');
    list = els.tabs.children;
    for (i = 0; i < list.length; i++) list[i].className = 'btn obby-tab' + (list[i].getAttribute('data-tab') === tab ? ' on' : '');
    if (html === lobbyHtml) return;      // nothing changed: leave the buttons alone
    lobbyHtml = html;
    els.lobby.innerHTML = html;
    list = els.lobby.querySelectorAll('canvas');
    for (i = 0; i < list.length; i++) drawIcon(list[i], list[i].getAttribute('data-ico'));
    hud.cd = '';
  }
  function myKey() { var me = api.self(); return me && me.name ? String(me.name).toLowerCase() : ''; }
  // a family list: who, and what val(entry) says about them
  function boardHtml(title, list, val, max, mine) {
    var rows = '', i, key = myKey();
    list = list || [];
    for (i = 0; i < list.length && i < max; i++) rows += '<li' + (list[i].key === key ? ' class="me"' : '') + '><b>' + (i + 1) + '</b><span>' + api.esc(list[i].name) + '</span><em>' + val(list[i]) + '</em></li>';
    if (!rows) rows = '<li class="none">–</li>';
    return '<div class="obby-lb"><div class="obby-lbh"><span>' + title + '</span>' + (mine ? '<b>' + mine + '</b>' : '') + '</div><ol>' + rows + '</ol></div>';
  }
  function whoHtml(place) {             // who is climbing there right now
    var who = info.who || [], pl = api.players(), i, p, out = '';
    for (i = 0; i < who.length; i++) {
      p = pl[who[i][0]];
      if (p && who[i][1] === place) out += '<span><i style="background:' + api.esc(p.color) + '"></i>' + api.esc(p.name) + ' ' + (who[i][3] ? '🏆' : '🚩' + who[i][2]) + '</span>';
    }
    return out ? '<div class="obby-now">🧗 ' + out + '</div>' : '';
  }
  function cardHtml(id) {
    var cfg = info.towers[id] || {}, d = (info.me && info.me[id]) || {}, lb = info.lb || {}, n = cfg.stages || 30, nc = Math.ceil(n / CHAP), top = d.top || 0, cur = d.cur || 0, chb = d.ch || [], chest = cfg.chest || [];
    var i, k, flags = '', chaps = '', rew = '', btns, open, done;
    for (i = 1; i <= n; i++) flags += '<i class="' + (i <= top ? 'on' : '') + (i % CHAP === 0 ? ' top' : '') + '"></i>';
    for (k = 0; k < nc; k++) {
      open = top >= k * CHAP; done = top >= (k + 1) * CHAP;
      chaps += '<button class="btn obby-chap' + (done ? ' done' : '') + '" type="button" data-a="go" data-tower="' + id + '" data-from="' + (k * CHAP) + '"' + (open ? '' : ' disabled') + '><span>' + CHAPS[k % CHAPS.length].icon + ' ' + (k + 1) + '</span><i>' +
        (!open ? '🔒' : chb[k] ? '⏱ ' + fmtS(chb[k]) : done ? '✔' : '▶') + '</i></button>';
    }
    if (top < n) {
      rew += '<span>🚩 +' + cfg.flag + ' ⭐</span>';
      k = Math.floor(top / CHAP);
      if (chest[k]) rew += '<span>🎁 ' + CHAPS[k % CHAPS.length].icon + ' +' + chest[k] + ' ⭐</span>';
    }
    if (top >= CHAP) rew += d.left > 0 ? '<span>🔁 +' + cfg.rep + ' ⭐ · ' + d.left + ' left</span>' : '<span>🔁 ✔ today</span>';
    if (cur > 0) btns = '<button class="btn primary" type="button" data-a="go" data-tower="' + id + '" data-from="' + cur + '">▶ Go on 🚩' + cur + '</button><button class="btn" type="button" data-a="go" data-tower="' + id + '" data-from="0">⏱ New run</button>';
    else btns = '<button class="btn primary" type="button" data-a="go" data-tower="' + id + '" data-from="0">⏱ Start</button>';
    return '<div class="obby-card"><div class="obby-ch"><canvas class="obby-ico" width="92" height="124" data-ico="' + id + '"></canvas><div class="obby-nm">' + api.three(TOWER_NAME[id]) + '</div></div>' +
      '<div class="obby-prog"><span>🚩</span><span class="obby-flags">' + flags + '</span><span>' + top + '/' + n + '</span></div>' +
      '<div class="obby-chaps">' + chaps + '</div>' +
      '<div class="obby-rew">' + rew + '</div>' +
      '<div class="obby-lb2">' + boardHtml('🏆 🚩1–12', lb[id], function (e) { return fmt(e.ms); }, 3, d.best ? '⏱ ' + fmt(d.best) + ' ' + medal(id, d.best) : '') + boardHtml('🏆 🚩1–' + n, lb.full && lb.full[id], function (e) { return fmt(e.ms); }, 3, d.full ? '⏱ ' + fmt(d.full) + ' ' + medal(id, d.full, true) : '') + '</div>' +
      whoHtml(id) +
      '<div class="obby-btns">' + btns + '</div></div>';
  }
  function partyOf(md) { var p = (info.pt && info.pt[md]) || {}; return { state: p.state || 'idle', tower: p.tower === 'hard' ? 'hard' : 'easy', ch: p.ch || 0, at: p.at || 0, ready: p.ready || [], on: p.on || [] }; }
  function amReady(P) { var me = api.self(); return !!me && P.ready.indexOf(me.name) >= 0; }
  function segHtml(pick, v, lock) {
    return '<div class="obby-seg"><button class="btn' + (v === 'easy' ? ' on' : '') + '" type="button" data-a="pick" data-k="' + pick + '" data-v="easy"' + (lock ? ' disabled' : '') + '>' + api.esc(TOWER_NAME.easy.en) + '</button>' +
      '<button class="btn' + (v === 'hard' ? ' on' : '') + '" type="button" data-a="pick" data-k="' + pick + '" data-v="hard"' + (lock ? ' disabled' : '') + '>' + api.esc(TOWER_NAME.hard.en) + '</button></div>';
  }
  // who is ready, the countdown, or the round that is on
  function stateHtml(md, P) {
    var i, out = '';
    if (P.state === 'run') {
      for (i = 0; i < P.on.length; i++) out += '<span>' + api.esc(P.on[i][0]) + ' ' + (P.on[i][2] === 1 ? '🏁' : P.on[i][2] === 2 ? '✖' : '🚩' + P.on[i][1]) + '</span>';
      out = '<span>' + MODE_ICON[md] + ' …</span>' + out;
      for (i = 0; i < P.ready.length; i++) out += '<span>✔ ' + api.esc(P.ready[i]) + '</span>';
      return '<div class="obby-state">' + out + '</div>';
    }
    for (i = 0; i < P.ready.length; i++) out += '<span>✔ ' + api.esc(P.ready[i]) + '</span>';
    if (P.state === 'gather') out += '<b class="obby-cd" data-at="' + P.at + '"></b>';
    else out = '<span>🙋 ' + MODE_ICON[md] + ' 3 · 2 · 1 …</span>';
    return '<div class="obby-state">' + out + '</div>';
  }
  function readyBtns(md, P) {
    var ready = amReady(P), ico = MODE_ICON[md];
    if (P.state === 'run') return '<button class="btn" type="button" data-a="watch" data-mode="' + md + '">👀 Watch</button>' +
      (ready ? '<button class="btn" type="button" data-a="unready" data-mode="' + md + '">✖ Not ready</button>' : '<button class="btn primary" type="button" data-a="ready" data-mode="' + md + '">' + ico + ' Next round</button>');
    if (ready) return '<button class="btn" type="button" data-a="unready" data-mode="' + md + '">✖ Not ready</button>';
    return '<button class="btn primary" type="button" data-a="ready" data-mode="' + md + '">' + ico + (P.state === 'gather' ? ' Join!' : ' Ready!') + '</button>';
  }
  function raceHtml() {
    var P = partyOf('race'), lock = P.state === 'gather', tower = lock ? P.tower : sel.rt, me = info.me || {}, d = me[tower] || {}, r = me.race || { left: 0, best: {} }, lb = info.lb || {};
    var cfg = info.towers[tower] || {}, top = d.top || 0, nc = Math.ceil((cfg.stages || 30) / CHAP), k, chaps = '', best, ch, pay = cfg.race || [0, 0];
    if (!lock && top < sel.rc * CHAP) sel.rc = 0;
    ch = lock ? P.ch : sel.rc;
    for (k = 0; k < nc; k++) {
      best = (r.best || {})[tower + k];
      chaps += '<button class="btn obby-chap' + (k === ch ? ' on' : '') + '" type="button" data-a="pick" data-k="rc" data-v="' + k + '"' + (!lock && top >= k * CHAP ? '' : ' disabled') + '><span>' + CHAPS[k % CHAPS.length].icon + ' ' + (k + 1) + '</span><i>' +
        (top < k * CHAP ? '🔒' : best ? '👻 ' + fmtS(best) : '▶') + '</i></button>';
    }
    best = (r.best || {})[tower + ch];
    return '<div class="obby-card"><div class="obby-ch"><div class="obby-emo">🏁</div><div class="obby-nm">' + api.three(MODE_NAME.race) + '</div></div>' +
      segHtml('rt', tower, lock) + '<div class="obby-chaps">' + chaps + '</div>' +
      '<div class="obby-sub">' + CHAPS[ch % CHAPS.length].icon + ' ' + api.three(CHAPS[ch % CHAPS.length]) + '</div>' +
      '<div class="obby-rew"><span>🥇 +' + pay[0] + ' ⭐</span><span>🏁 +' + pay[1] + ' ⭐</span><span>👻 +' + (pay[1] + 1) + ' ⭐</span><span>' + (r.left > 0 ? r.left + ' left today' : '✔ today') + '</span></div>' +
      stateHtml('race', P) + '<div class="obby-btns">' + readyBtns('race', P) + '</div></div>' +
      '<div class="obby-card"><div class="obby-row"><span>👻 ' + api.esc(TOWER_NAME[tower].en) + ' ' + CHAPS[ch % CHAPS.length].icon + (ch + 1) + ' <b>' + (best ? fmt(best) : '–:––') + '</b></span><span>🏆 <b>' + (r.wins || 0) + '</b></span></div>' +
      boardHtml('⏱ ' + api.esc(TOWER_NAME[tower].en) + ' ' + CHAPS[ch % CHAPS.length].icon + (ch + 1), lb.chap && lb.chap[tower] && lb.chap[tower][ch], function (e) { return fmt(e.ms); }, 3) +
      boardHtml('🏆 ' + api.esc(MODE_NAME.race.en) + ' 🥇', lb.race, function (e) { return '🥇 × ' + e.wins; }, 5) + whoHtml('race') + '</div>';
  }
  function lavaHtml() {
    var P = partyOf('lava'), lock = P.state === 'gather', tower = lock ? P.tower : sel.lt, me = info.me || {}, l = me.lava || { left: 0, best: {} }, lb = info.lb || {}, caps = info.caps || {};
    var cfg = info.towers[tower] || {}, best = (l.best || {})[tower] || 0;
    return '<div class="obby-card"><div class="obby-ch"><div class="obby-emo">🌋</div><div class="obby-nm">' + api.three(MODE_NAME.lava) + '</div></div>' +
      segHtml('lt', tower, lock) +
      '<div class="obby-sub">' + api.three(TOWER_NAME[tower]) + '</div>' +
      '<div class="obby-rew"><span>' + (cfg.lava === 0.5 ? '🚩🚩 = ⭐' : '🚩🚩🚩🚩 = ⭐⭐⭐') + '</span><span>max ' + (caps.lavaMax || 8) + ' ⭐</span><span>🥇 +' + (caps.lavaWin || 2) + ' ⭐</span><span>' + (l.left > 0 ? l.left + ' left today' : '✔ today') + '</span></div>' +
      stateHtml('lava', P) + '<div class="obby-btns">' + readyBtns('lava', P) + '</div></div>' +
      '<div class="obby-card"><div class="obby-row"><span>⬆ ' + api.esc(TOWER_NAME[tower].en) + ' <b>' + (best ? best + ' m' : '–') + '</b></span><span>🏆 <b>' + (l.wins || 0) + '</b></span></div>' +
      boardHtml('🏆 ⬆ ' + api.esc(TOWER_NAME[tower].en), lb.lava && lb.lava[tower], function (e) { return '⬆ ' + e.h + ' m'; }, 5) + whoHtml('lava') + '</div>';
  }
  function dayTxt(day) { var p = String(day || '').split('-'); return p.length === 3 ? parseInt(p[2], 10) + '.' + parseInt(p[1], 10) + '.' : ''; }
  function endlessHtml() {
    var me = info.me || {}, e = me.endless || { top: 0, best: 0, left: 0 }, lb = (info.lb && info.lb.endless) || {}, caps = info.caps || {}, i, hearts = '';
    for (i = 0; i < HEARTS; i++) hearts += '❤️';
    return '<div class="obby-card"><div class="obby-ch"><div class="obby-emo">⏫</div><div class="obby-nm">' + api.three(MODE_NAME.endless) + '</div></div>' +
      '<div class="obby-row"><span>📅 <b>' + dayTxt(info.day) + '</b></span><span>' + hearts + '</span></div>' +
      '<div class="obby-row"><span>📅 🚩 <b>' + (e.top || 0) + '</b></span><span>🏅 🚩 <b>' + (e.best || 0) + '</b></span></div>' +
      '<div class="obby-rew"><span>🚩 +1 ⭐</span><span>🚩×5 +2 ⭐</span><span>' + (e.left > 0 ? e.left + ' ⭐ left today' : '✔ today') + '</span></div>' +
      whoHtml('endless') +
      '<div class="obby-btns"><button class="btn primary" type="button" data-a="endless">▶ Start</button></div></div>' +
      '<div class="obby-card">' + boardHtml('📅 ' + dayTxt(lb.day || info.day) + ' 🏆', lb.today, function (x) { return '🚩 ' + x.n; }, 5) + boardHtml('🏅 🏆', lb.all, function (x) { return '🚩 ' + x.n; }, 5) + '</div>';
  }
  function drawIcon(cnv, id) {       // a little picture of the tower for its card
    var g = cnv.getContext('2d'), def = TOWERS[id], i;
    if (!def) return;
    g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, 46, 62); g.lineJoin = 'round';
    g.beginPath(); g.rect(12, 20, 22, 40); g.fillStyle = def.wall; g.fill(); ol(g, 2.5);
    g.fillStyle = 'rgba(27,42,73,0.22)'; g.fillRect(27, 21, 6, 38);
    poly(g, [7, 21, 23, 4, 39, 21]); g.fillStyle = def.trim; g.fill(); ol(g, 2.5);
    g.strokeStyle = NAVY; g.lineWidth = 2; g.beginPath(); g.moveTo(23, 4); g.lineTo(23, -2); g.stroke();
    for (i = 0; i < 3; i++) { rr(g, i % 2 ? 26 : 3, 50 - i * 12, 17, 6, 2); g.fillStyle = def.cols[i * 2]; g.fill(); ol(g, 2); }
  }
  function onTabClick(e) {
    var el = e.target;
    while (el && el !== els.tabs && !(el.getAttribute && el.getAttribute('data-tab'))) el = el.parentNode;
    if (!el || el === els.tabs) return;
    if (el.blur) el.blur();
    tab = el.getAttribute('data-tab');
    renderLobby();
  }
  function sendReady(md) {
    api.send({ t: 'obby.ready', mode: md, tower: md === 'race' ? sel.rt : sel.lt, ch: sel.rc, on: true });
  }
  function onLobbyClick(e) {
    var el = e.target, a, md;
    while (el && el !== els.lobby && !(el.getAttribute && el.getAttribute('data-a'))) el = el.parentNode;
    if (!el || el === els.lobby || el.disabled) return;
    if (el.blur) el.blur();
    a = el.getAttribute('data-a'); md = el.getAttribute('data-mode');
    if (a === 'go') api.send({ t: 'obby.start', tower: el.getAttribute('data-tower'), from: parseInt(el.getAttribute('data-from'), 10) || 0 });
    else if (a === 'pick') {
      if (el.getAttribute('data-k') === 'rc') sel.rc = parseInt(el.getAttribute('data-v'), 10) || 0;
      else sel[el.getAttribute('data-k')] = el.getAttribute('data-v') === 'hard' ? 'hard' : 'easy';
      renderLobby();
    }
    else if (a === 'ready') sendReady(md);
    else if (a === 'unready') api.send({ t: 'obby.ready', mode: md, on: false });
    else if (a === 'watch') api.send({ t: 'obby.watch', mode: md });
    else if (a === 'endless') api.send({ t: 'obby.start', mode: 'endless' });
  }
  function onDoneClick(e) {
    var el = e.target, a, md;
    while (el && el !== els.done && !(el.getAttribute && el.getAttribute('data-act'))) el = el.parentNode;
    if (!el || el === els.done || !run) return;
    if (el.blur) el.blur();
    a = el.getAttribute('data-act'); md = run.mode;
    if (a === 'again' && md === 'tower') api.send({ t: 'obby.start', tower: run.tower, from: 0 });
    else if (a === 'again' && md === 'endless') api.send({ t: 'obby.start', mode: 'endless' });
    else if (a === 'again') {          // ready for the next round of the same race / lava
      if (md === 'race') { sel.rt = run.tower === 'hard' ? 'hard' : 'easy'; sel.rc = Math.floor(run.from / CHAP); } else sel.lt = run.tower === 'hard' ? 'hard' : 'easy';
      tab = md;
      toLobby();
      sendReady(md);
    }
    else if (a === 'hide') { run.hide = true; setMode('run'); }
    else { if (md !== 'tower') tab = md === 'endless' ? 'endless' : md; toLobby(); }
  }

  // ---------- a climb ----------
  function now() { return window.performance && performance.now ? performance.now() : Date.now(); }
  function towerTime() { return (now() + tOff) / 1000; }
  function serverNow() { return now() + tOff + EPOCH; }
  function syncClock(srv) {
    var off = (+srv) - EPOCH - now();
    if (!srv || Math.abs(off - tOff) < 250) return;
    tOff = off;
    if (st) st.T = towerTime();
    if (run && run.at) run.goAt = run.at - EPOCH - tOff;
  }
  function myPlace() { return !run ? '' : run.mode === 'tower' ? run.tower : run.mode; }     // players in the same place see each other
  // the lava of a lava round: where its surface is right now (world y; it rises, so this gets smaller)
  function lavaLevel() {
    var L = run.lava, s = (serverNow() - run.at) / 1000;
    if (!L) return 1e6;
    if (s < 0) s = 0;
    return L.h0 - L.v0 * s - L.a * s * s / 2;
  }
  // the best of the others who is still climbing (whoever is in a round and not yet at its end)
  function leader() {
    var id, o, best = null, done = {}, i;
    if (run && run.rk) for (i = 0; i < run.rk.length; i++) if (run.rk[i][3] || run.rk[i][4]) done[run.rk[i][0]] = 1;
    for (id in others) { o = others[id]; if (!done[id] && (!best || o.y < best.y)) best = o; }
    if (!best) for (id in others) { o = others[id]; if (!best || o.y < best.y) best = o; }
    return best;
  }
  function lookAt() {      // whom the view follows right now (null: nobody, just the place look.y)
    if (!look || !look.id) return null;
    return look.id === -1 ? leader() : others[look.id] || null;
  }
  function camTarget() {
    var o, y;
    if (look) {
      o = lookAt();
      y = o ? o.y - vh * 0.57 : look.id === -1 && run.lava ? Math.min(lavaLevel(), 0) - vh * 0.7 : look.id ? cam.y : look.y;
      return clamp(y, tw.top - vh * 0.75, gap - vh);
    }
    return Math.min(st.y - vh * 0.57, gap - vh);
  }
  // ---------- looking at the others (only on this tablet: the server and the other players do not notice) ----------
  // While I look away my own player waits where it is: it is not moved and nothing on the screen can hurt it.
  function startLook(id, y, auto) {
    if (!run || !st || mode === 'lobby') return;
    if (!look) {
      look = { id: 0, y: cam.y, last: now(), auto: false, T0: towerTime(), on: st.on, off: 0 };
      if (st.on >= 0) { pos(tw.ents[st.on], st.T, PB); look.off = st.x - PB.x; }
      dropTouch();
    }
    look.id = id; look.last = now(); look.auto = !!auto || run.spec;
    if (!id) look.y = clamp(y, tw.top - vh * 0.75, gap - vh);
  }
  function endLook() {
    var k, dtp;
    if (!look) return;
    if (run && run.spec) { look.id = -1; look.auto = true; look.last = now(); return; }      // no player of my own to go back to: follow the best one
    if (st && run) {
      dtp = towerTime() - look.T0;       // clouds I stood on wait with me
      for (k in st.van) st.van[k] += dtp;
      st.T = towerTime();
      run.grace = now() + 900;           // and whatever swings through my place just now does not count
    }
    look = null;
  }
  function goSpec() {      // I have no player any more (the lava got me, or I only watch): the view follows the others
    if (!run) return;
    run.spec = true; look = null;
    startLook(-1, 0, true);
    if (els.keys) els.keys.hidden = true;
    dropTouch();
  }
  function barRange() {    // the heights the bar at the edge shows: the chapter of a race, else the whole tower
    if (run && run.mode === 'race') return [-tw.stages[run.from].base, -tw.stages[Math.min(tw.n, run.end)].base];
    return [0, tw.height];
  }
  function barLook(e) {
    var r = cv.getBoundingClientRect(), y = e.clientY - r.top, y0 = 86, y1 = ch - 150, rg = barRange(), h = rg[0] + clamp((y1 - y) / (y1 - y0), 0, 1) * (rg[1] - rg[0]);
    startLook(0, -h - vh * 0.5, false);
  }
  function barDown(e) {
    if (bar.id !== null || !run || !st) return;
    bar.id = e.pointerId; bar.y0 = e.clientY; bar.moved = false;
    try { els.bar.setPointerCapture(e.pointerId); } catch (err) {}
    if (look) look.last = now();
    if (e.preventDefault) e.preventDefault();
  }
  function barMove(e) {
    if (e.pointerId !== bar.id) return;
    if (!bar.moved && Math.abs(e.clientY - bar.y0) < 6) return;
    bar.moved = true;
    barLook(e);
  }
  function barUp(e) {
    var r, y, i, m, best = null;
    if (e.pointerId !== bar.id) return;
    bar.id = null;
    if (bar.moved || e.type === 'pointercancel') { if (look) look.last = now(); return; }
    // a tap: on somebody's marker = follow them, anywhere else = look at that height
    r = cv.getBoundingClientRect(); y = e.clientY - r.top;
    for (i = 0; i < (bar.marks || []).length; i++) { m = bar.marks[i]; if (Math.abs(m.y - y) < 26 && (!best || Math.abs(m.y - y) < Math.abs(best.y - y))) best = m; }
    if (!best) barLook(e);
    else if (best.me) endLook();
    else startLook(best.id, 0, false);
  }
  function onWhoClick(e) {
    var el = e.target, id;
    while (el && el !== els.who && !(el.getAttribute && el.getAttribute('data-id'))) el = el.parentNode;
    if (!el || el === els.who || el.disabled) return;
    if (el.blur) el.blur();
    id = el.getAttribute('data-id');
    if (id === 'me') endLook();
    else if (others[id]) startLook(id, 0, false);
  }
  // the list at the edge: everybody in the room with colour, name and flag; those in my place can be looked at
  function renderWho() {
    var pl = api.players(), mine = api.myId(), who = (info && info.who) || [], by = {}, rk = {}, list = [], i, id, p, w, o, html = '', me = api.self() || ME, at = lookAt(), txt, cls, can;
    if (!run || !st) return;
    for (i = 0; i < who.length; i++) by[who[i][0]] = who[i];
    for (i = 0; i < (run.rk || []).length; i++) rk[run.rk[i][0]] = run.rk[i];
    for (id in pl) {
      p = pl[id];
      if (!p || p.room !== 'obby' || String(id) === String(mine)) continue;
      w = by[id]; o = rk[id];
      can = !!others[id];
      if (o && o[4]) txt = run.mode === 'lava' ? '✖ ' + o[5] + ' m' : '✖';
      else if (w) txt = (w[1] === myPlace() ? '' : MODE_ICON[w[1]] || '🗼') + (w[3] ? '🏆' : '🚩' + (run.mode === 'race' && w[1] === 'race' ? w[2] - run.from : w[2]));
      else txt = '🚪';
      list.push({ id: id, p: p, txt: txt, can: can, f: w ? w[2] : -1 });
    }
    list.sort(function (a, b) { return (b.can ? 1 : 0) - (a.can ? 1 : 0) || b.f - a.f || (a.p.name < b.p.name ? -1 : 1); });
    txt = run.spec ? (run.watch ? '👀' : '✖') : '🚩' + (run.mode === 'race' ? Math.min(st.cp, run.end) - run.from : st.cp);
    html = '<button class="obby-pc me' + (look || run.spec ? '' : ' on') + '" type="button" data-id="me"' + (run.spec ? ' disabled' : '') + '><i style="background:' + api.esc(me.color || '#FF7A45') + '"></i><span><b>' + api.esc(me.name || '') + '</b><em>' + txt + '</em></span></button>';
    for (i = 0; i < list.length && i < 11; i++) {
      o = list[i]; cls = 'obby-pc' + (o.can ? '' : ' off') + (at && String(at.id) === String(o.id) ? ' on' : '');
      html += '<button class="' + cls + '" type="button" data-id="' + api.esc(String(o.id)) + '"' + (o.can ? '' : ' disabled') + '><i style="background:' + api.esc(o.p.color || '#fff') + '"></i><span><b>' + api.esc(o.p.name || '') + '</b><em>' + o.txt + '</em></span></button>';
    }
    if (html !== hud.who) { hud.who = html; els.who.innerHTML = html; }
    // whose view this is, and the way back
    txt = !look ? '' : at ? '👀 ' + ((pl[at.id] || {}).name || '') : look.id ? '👀 …' : '👀 ↕';
    txt += '|' + (run.spec ? 1 : 0);
    if (txt !== hud.look) {
      hud.look = txt;
      els.look.hidden = !look;
      els.lookn.textContent = txt.split('|')[0];
      els.backme.hidden = !!run.spec;
    }
  }

  function beginRun(m) {
    var md = m.mode === 'race' || m.mode === 'lava' || m.mode === 'endless' ? m.mode : 'tower', id = m.tower === 'hard' ? 'hard' : 'easy';
    if (m.gone) {              // the next round began without us: back to the entrance
      if (run && run.mode === md && (run.res || run.spec)) { tab = md; toLobby(true); }
      return;
    }
    if (md === 'tower' && m.keep && run && run.mode === 'tower' && run.tower === id && st) {   // the server lost our climb (a long break): it goes on from the last flag it knows
      run.acked = m.flag; run.timed = !!m.timed; run.ct = !!m.ct; run.t0 = 0; run.c0 = 0; run.go = false;
      return;
    }
    syncClock(m.now);
    tw = md === 'endless' ? dayTower(String(m.seed || (info && info.day) || 'day')) : tower(id);
    makeClouds();
    st = newState(); st.cp = clamp(parseInt(m.flag, 10) || 0, 0, tw.n - 1); st.T = towerTime(); spawn(tw, st);
    run = { mode: md, tower: tw.id, from: st.cp, end: clamp(parseInt(m.end, 10) || tw.n, st.cp + 1, tw.n), timed: !!m.timed, ct: !!m.ct, acked: st.cp, t0: 0, c0: 0, go: false, endMs: 0,
      lastClaim: 0, lastPos: 0, lastSync: 0, result: null, at: +m.at || 0, goAt: 0, n: m.n || 1, lava: m.lava || null, spec: false, watch: !!m.watch, out: false, reached: false, dead: false,
      hearts: HEARTS, rk: [], ghost: null, rec: [], fin: null, outRes: null, res: null, over: null, grace: 0, freeze: 0, hide: false, count: '', maxH: 0 };
    if (run.at) run.goAt = run.at - EPOCH - tOff;
    if (m.ghost && m.ghost.ms > 0) run.ghost = { ms: m.ghost.ms, s: typeof m.ghost.s === 'string' ? m.ghost.s : '' };
    others = {}; parts = []; pops = []; bounced = {}; squash = 0; deaths = 0; look = null;
    setMode('run');
    if (run.watch) goSpec();
    cam.y = camTarget();
    api.sfx('open');
  }
  function resync() {   // the server does not know our climb any more
    if (!run || now() - run.lastSync < 2000) return;
    run.lastSync = now();
    if (run.mode === 'tower') api.send({ t: 'obby.start', tower: run.tower, from: run.acked, keep: 1 });
    else if (!run.res && !run.over) { api.toast('The round is over.'); toLobby(true); }
  }
  var ZERO = { ax: 0, jump: false };
  function readInput() {
    var k = api.keys(), ax = (k.arrowright || k.d ? 1 : 0) - (k.arrowleft || k.a ? 1 : 0), jump = !!(k[' '] || k.spacebar || k.arrowup || k.w);
    if (touch.id !== null) ax = touch.dir;
    if (touch.n > 0) jump = true;
    return { ax: ax, jump: jump };
  }
  function pop(txt, bg, up, max) { if (st) pops.push({ x: st.x, y: st.y - 58 - (up || 0), txt: txt, life: 0, max: max || 1.5, bg: bg || '#FFD66B' }); }
  function puff(x, y, n, col, spd, kind) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, v = spd * (0.4 + Math.random() * 0.6);
      parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * 0.3, life: 0, max: 0.35 + Math.random() * 0.35, r: 2.5 + Math.random() * 3.5, col: col, k: kind || 0, rot: Math.random() * 6 });
    }
    if (parts.length > 160) parts.splice(0, parts.length - 160);
  }
  function confetti(n) {
    var COL = ['#FF4F6D', '#FFC933', '#5ED6C4', '#9B6BFF', '#5AA9FF', '#FF8FB8'], i;
    for (i = 0; i < (n || 70); i++) parts.push({ x: Math.random() * W, y: cam.y - 20 - Math.random() * 260, vx: (Math.random() - 0.5) * 80, vy: 90 + Math.random() * 120, life: 0, max: 3.2 + Math.random() * 1.5, r: 4 + Math.random() * 3, col: COL[i % COL.length], k: 2, rot: Math.random() * 6, g: 0 });
  }
  // the recording of a race for the ghost: a point every 150 ms, x in steps of 4 and the height above the first flag in steps of 5
  function ghostPush() {
    var v = (clamp(Math.round(st.x / 4), 0, 255) << 10) | clamp(Math.round((tw.stages[run.from].base - st.y) / 5), 0, 1023);
    run.rec.push(B64.charAt(v >> 12) + B64.charAt((v >> 6) & 63) + B64.charAt(v & 63));
  }
  function ghostAt(g, ms, o) {
    var n = Math.floor(g.s.length / 3), u = ms / GHOST_DT, i = Math.floor(u), f = u - i, a, b;
    function rd(k) { var q = k * 3, v = (B64.indexOf(g.s.charAt(q)) << 12) | (B64.indexOf(g.s.charAt(q + 1)) << 6) | B64.indexOf(g.s.charAt(q + 2)); return [(v >> 10) * 4, (v & 1023) * 5]; }
    if (n < 2 || i < 0) return false;
    if (i >= n - 1) { i = n - 2; f = 1; }
    a = rd(i); b = rd(i + 1);
    o.x = a[0] + (b[0] - a[0]) * f; o.y = tw.stages[run.from].base - (a[1] + (b[1] - a[1]) * f); o.f = b[0] < a[0] ? -1 : 1; o.m = Math.abs(b[0] - a[0]) > 3 ? 1 : 0;
    return true;
  }
  function onEvents(ev, x0, y0) {
    var F, e, rest;
    if (ev & EV_DIE) {
      puff(x0, y0 - 20, 14, '#FFFFFF', 150, 0);
      beep(420, 110, 0.28, 0.12, 'triangle');
      deaths++; flash = 0.25; squash = 0;
      spawn(tw, st);
      if (run.mode === 'endless' && !run.dead) {      // a fall costs a heart; without hearts the climb is over
        run.hearts--; run.freeze = now() + 700;
        pop(run.hearts > 0 ? '💔' : '💔 0', '#fff');
        if (run.hearts <= 0) { run.dead = true; api.send({ t: 'obby.out' }); api.sfx('wrong'); setMode('done'); renderDone(); }
      }
      return;
    }
    if (ev & EV_JUMP) { beep(330, 560, 0.11, 0.07); squash = -0.9; puff(st.x, st.y, 3, 'rgba(255,255,255,0.8)', 50, 0); }
    if (ev & EV_DJUMP) { beep(520, 860, 0.11, 0.07); squash = -0.9; puff(st.x, st.y, 6, '#FFE680', 90, 1); }
    if (ev & EV_BOUNCE) { beep(180, 720, 0.22, 0.1, 'triangle'); squash = -1.3; bounced[st.hit] = towerTime(); }
    else if (ev & EV_LAND) { squash = 0.9; puff(st.x, st.y, 3, 'rgba(255,255,255,0.8)', 55, 0); }
    if (ev & EV_BONK) { beep(150, 90, 0.09, 0.09, 'triangle'); squash = 0.7; puff(st.x, st.y - 34, 4, 'rgba(255,255,255,0.85)', 60, 0); }
    if (ev & EV_TP) {          // through a door
      e = tw.ents[st.hit];
      beep(300, 1200, 0.25, 0.09); puff(e.x, e.y - 28, 10, TPCOL[e.n % TPCOL.length], 120, 1); puff(st.x, st.y - 20, 12, TPCOL[e.n % TPCOL.length], 140, 1);
      cam.y = cam.y + (camTarget() - cam.y) * 0.5;
    }
    if (ev & EV_FLAG) {
      F = tw.ents[tw.stages[st.cp].fi];
      puff(F.px, F.y - 44, 16, '#FFD23F', 170, 1);
      rest = st.cp % tw.per === 0;
      if (run.mode === 'race') {
        if (st.cp >= run.end) { if (!run.reached) { run.reached = true; run.endMs = now() - run.goAt; ghostPush(); api.sfx('tagwin'); confetti(); setMode('done'); renderDone(); if (run.n > 1) startLook(-1, 0, true); } }
        else { api.sfx('right'); pop('🚩 ' + (st.cp - run.from) + ' / ' + (run.end - run.from), '#fff'); }
      } else if (st.cp >= tw.n) {
        if (run.mode === 'tower') finish();
        else if (!run.reached) { run.reached = true; api.sfx('tagwin'); confetti(); if (run.mode === 'lava') { setMode('done'); renderDone(); if (run.n > 1) startLook(-1, 0, true); } }
      } else {
        api.sfx('right');
        pop('🚩 ' + st.cp + (run.mode === 'tower' ? ' / ' + tw.n : ''), '#fff');
        if (rest && run.mode === 'tower') { run.c0 = now(); confetti(30); }
        if (rest && run.mode === 'endless' && run.hearts < HEARTS) { run.hearts++; pop('❤️ +1', '#fff', 34); }
      }
    }
  }
  function finish() {         // the top of a tower
    run.endMs = run.timed && run.t0 ? now() - run.t0 : 0; run.falls = deaths;
    api.sfx('tagwin');
    confetti();
    setMode('done');
    renderDone();
  }
  function btnsHtml(again, ok) {
    return '<div class="obby-btns"><button class="btn primary" type="button" data-act="again"' + (ok ? '' : ' disabled') + '>' + again + '</button><button class="btn" type="button" data-act="lobby"' + (ok ? '' : ' disabled') + '>🗼 Towers</button></div>';
  }
  function renderDone() {
    if (!root || !run) return;
    var r, o, ms, extra = '', stars = '', falls, rows = '', i, e, key = myKey(), mine = null, race, title, html = '';
    if (run.mode === 'tower') {
      r = run.result; ms = r ? r.ms : run.endMs;
      if (r) {
        if (r.newBest) extra = '★ New best time!';
        else if (r.timed && r.best) extra = 'Your best: ' + fmt(r.best);
        if (r.rank) extra += (extra ? ' · ' : '') + '🏆 #' + r.rank + ' in the family';
        if (r.stars) stars = '<div class="obby-ds">+' + r.stars + ' ⭐</div>';
      }
      falls = run.from === 0 || deaths ? '<div class="obby-dx">' + (deaths ? '💥 ' + deaths + (deaths === 1 ? ' fall' : ' falls') : '✨ No falls!') + '</div>' : '';
      html = '<div class="obby-dc"><div class="obby-dt">🏆 You reached the top!</div><div class="obby-dn">' + api.three(TOWER_NAME[run.tower]) + '</div>' +
        (ms ? '<div class="obby-dtime">⏱ ' + fmt(ms) + ' ' + medal(run.tower, ms, true) + '</div>' : '') +
        '<div class="obby-dx">' + (r ? extra : '…') + '</div>' +
        (r && r.ch && r.ch.ms ? '<div class="obby-dx">' + CHAPS[r.ch.k % CHAPS.length].icon + ' ⏱ ' + fmt(r.ch.ms) + (r.ch.newBest ? ' ★' : '') + '</div>' : '') + falls + stars + btnsHtml('⏱ Again', !!r) + '</div>';
    } else if (run.res) {
      // a race or a lava round is over: everybody and what they got
      r = run.res; race = r.mode === 'race';
      for (i = 0; i < r.rows.length; i++) {
        e = r.rows[i]; if (e.key === key) mine = e;
        rows += '<li' + (e.key === key ? ' class="me"' : '') + '><b>' + placeTxt(e.place) + '</b><span>' + api.esc(e.name) + '</span><em>' +
          (race ? (e.ms ? '⏱ ' + fmt(e.ms) : '🚩 ' + (e.flag - Math.floor(r.ch * CHAP))) : '⬆ ' + e.h + ' m') + (e.stars ? ' · +' + e.stars + ' ⭐' : '') + '</em></li>';
      }
      if (race) {
        title = !mine ? '🏁 The race is over' : mine.ms ? (r.n > 1 && mine.place === 1 ? '🏆 You won the race!' : '🏁 You made it!') : '🏁 The race is over';
        o = run.fin;
        if (o) extra = o.beat ? '👻 You beat your ghost! ★' : o.pb ? '★ New best time!' : o.best ? '👻 Your best: ' + fmt(o.best) : '';
      } else {
        title = !mine ? '🌋 The round is over' : mine.safe ? '🏆 You escaped the lava!' : r.n > 1 && mine.place === 1 ? '🏆 Last one climbing!' : '🌋 The lava got you!';
        o = run.outRes;
        if (o) extra = o.rec ? '★ New record: ⬆ ' + o.h + ' m' : o.best ? 'Your best: ⬆ ' + o.best + ' m' : '';
      }
      html = '<div class="obby-dc"><div class="obby-dt">' + title + '</div><div class="obby-dn">' + api.three(MODE_NAME[r.mode]) + ' · ' + api.esc((TOWER_NAME[r.tower] || TOWER_NAME.easy).en) + (race ? ' ' + CHAPS[r.ch % CHAPS.length].icon + (r.ch + 1) : '') + '</div>' +
        '<ol class="obby-dl">' + rows + '</ol>' + (extra ? '<div class="obby-dx">' + extra + '</div>' : '') + btnsHtml(MODE_ICON[r.mode] + ' Again', true) + '</div>';
    } else if (run.mode === 'endless') {
      o = run.over;
      html = '<div class="obby-dc"><div class="obby-dt">' + (o && o.top ? '🏆 The top of today\'s tower!' : run.dead || o ? '💔 No hearts left' : '⏫') + '</div><div class="obby-dn">' + api.three(MODE_NAME.endless) + '</div>' +
        '<div class="obby-dtime">🚩 ' + (o ? o.flag : st.cp) + '</div>' +
        '<div class="obby-dx">' + (o ? '📅 🚩 ' + o.today + (o.rankToday ? ' (#' + o.rankToday + ')' : '') + ' · 🏅 🚩 ' + o.best : '…') + '</div>' +
        (o && o.stars ? '<div class="obby-ds">+' + o.stars + ' ⭐</div>' : '') + btnsHtml('▶ Again', !!o) + '</div>';
    } else if (run.mode === 'race') {
      // at the flag, the others are still racing
      o = run.fin;
      html = '<div class="obby-dc mini"><div class="obby-dt">🏁 ' + (o ? placeTxt(o.place) + ' ' : '') + '⏱ ' + fmt(o ? o.ms : run.endMs) + (o && o.stars ? ' · +' + o.stars + ' ⭐' : '') + '</div>' +
        '<div class="obby-dx">' + (o ? (o.beat ? '👻 You beat your ghost! ★' : o.pb ? '★ New best time!' : '⏳ …') : '…') + '</div></div>';
    } else {
      // the lava got me (or I am out of the top): the round goes on for the others
      o = run.outRes;
      html = '<div class="obby-dc mini"><div class="obby-dt">' + (o ? (o.safe ? '🏆 ' : '🌋 ') + '⬆ ' + o.h + ' m · 🚩 ' + o.flag + (o.stars ? ' · +' + o.stars + ' ⭐' : '') : '🌋 …') + '</div>' +
        '<div class="obby-dx">' + (o ? (o.rec ? '★ New record!' : o.best ? 'Your best: ⬆ ' + o.best + ' m' : '') : '') + '</div></div>';
    }
    els.done.innerHTML = html;
  }

  // ---------- messages from the server ----------
  function onMessage(m) {
    var i, o, id, list, seen, k;
    if (!root) return;
    switch (m.t) {
      case 'obby.hello':
        info = { towers: m.towers || {}, me: m.me || {}, lb: m.lb || {}, who: m.who || [], pt: m.pt || {}, day: m.day || '', caps: m.caps || {} };
        tOff = (+m.now || Date.now()) - EPOCH - now();
        if (st) st.T = towerTime();
        if (run) {           // we are back after a dropped connection
          if (m.run && (m.run.mode || 'tower') === run.mode && m.run.tower === run.tower && !m.run.over) {
            run.acked = m.run.flag;
            if (run.mode === 'tower' && mode === 'run') {
              if (run.timed && m.run.el >= 0) run.t0 = now() - m.run.el;
              if (m.run.cel >= 0) run.c0 = now() - m.run.cel;
            }
            if (m.run.at) { run.at = m.run.at; run.goAt = run.at - EPOCH - tOff; }
            if (m.run.out && !run.spec) { run.out = true; goSpec(); }
          } else resync();
        } else if (m.run && !m.run.fin) api.send({ t: 'obby.quit' });
        renderLobby();
        break;
      case 'obby.me': if (info) { info.me = m; renderLobby(); } break;
      case 'obby.lb': if (info) { info.lb = m.lb || {}; renderLobby(); } break;
      case 'obby.who': if (info) { info.who = m.list || []; renderLobby(); } break;
      case 'obby.pt': syncClock(m.now); if (info) { info.pt = m; renderLobby(); } break;
      case 'obby.run': beginRun(m); break;
      case 'obby.rk': if (run && m.mode === run.mode) run.rk = Array.isArray(m.list) ? m.list : []; break;
      case 'obby.flag':
        if (!run) break;
        if (m.ok) {
          run.acked = m.i; run.lastClaim = 0;
          if (m.stars) { pop('+' + m.stars + ' ⭐', null, 34); api.sfx(m.ch && m.first ? 'chest' : 'star'); }
          if (m.ch) {          // a chapter is done: the rest platform
            k = CHAPS[m.ch.k % CHAPS.length];
            pop(k.icon + ' ✔' + (m.ch.ms ? '  ⏱ ' + fmt(m.ch.ms) + (m.ch.newBest ? ' ★' : '') : ''), '#D5F3DB', 68, 3.2);
            if (m.old) pop('⏱ 🚩1–12  ' + fmt(m.old.ms) + (m.old.newBest ? ' ★' : ''), '#fff', 102, 3.2);
          }
          if (m.rec && run.mode === 'endless') pop('🏅 ★', '#fff', 68);
        } else if (m.none) resync();
        else if (typeof m.i === 'number') run.acked = m.i;
        break;
      case 'obby.done':
        if (!run) break;
        run.acked = m.i; run.result = m;
        if (m.stars) { pop('+' + m.stars + ' ⭐'); api.sfx('star'); }
        if (mode === 'done') renderDone();
        break;
      case 'obby.fin':         // my race: place, time, stars
        if (!run || run.mode !== 'race') break;
        run.acked = m.i; run.fin = m;
        if (m.pb && run.rec.length > 1) api.send({ t: 'obby.ghost', s: run.rec.join('') });
        if (m.stars) { pop('+' + m.stars + ' ⭐'); api.sfx('star'); }
        if (mode === 'done') renderDone();
        break;
      case 'obby.out':         // the lava got me (or I am out of the top): how high, what for
        if (!run || run.mode !== 'lava') break;
        if (m.stars && (!run.outRes || m.stars > run.outRes.stars)) api.sfx('star');
        run.outRes = m;
        if (!m.safe && !run.spec) { run.out = true; goSpec(); }
        if (!run.res) { setMode('done'); renderDone(); }
        break;
      case 'obby.res':         // the round is over
        if (!run || run.mode !== m.mode) break;
        run.res = m;
        if (!run.reached) run.endMs = Math.max(0, now() - run.goAt);
        api.sfx(m.mode === 'race' ? 'goal' : 'tagwin');
        setMode('done'); renderDone();
        break;
      case 'obby.over':        // my endless climb is over
        if (!run || run.mode !== 'endless') break;
        run.over = m; run.dead = true;
        if (m.top) { api.sfx('tagwin'); confetti(); }
        setMode('done'); renderDone();
        break;
      case 'obby.st':
        if (!run || !Array.isArray(m.p)) break;
        seen = now(); id = api.myId();
        for (i = 0; i < m.p.length; i++) {
          list = m.p[i];
          if (!list || list[0] === id) continue;
          o = others[list[0]];
          if (!o) o = others[list[0]] = { id: list[0], x: list[1], y: list[2], tx: 0, ty: 0, f: 1, m: 0, seen: 0 };
          o.tx = list[1]; o.ty = list[2]; o.f = list[3] < 0 ? -1 : 1; o.m = list[4]; o.seen = seen;
        }
        break;
    }
  }

  // ---------- touch and keys ----------
  function pDown(e) {
    if (mode !== 'run' && mode !== 'done') return;
    wake();
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left;
    if (x < cw * 0.5) { if (touch.id === null) { touch.id = e.pointerId; touch.dir = x < touch.mid ? -1 : 1; } }
    else if (!touch.jumps[e.pointerId]) { touch.jumps[e.pointerId] = 1; touch.n++; }
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    if (e.preventDefault) e.preventDefault();
  }
  function pMove(e) {
    if (e.pointerId !== touch.id) return;
    var r = cv.getBoundingClientRect();
    touch.dir = e.clientX - r.left < touch.mid ? -1 : 1;
  }
  function pUp(e) {
    if (e.pointerId === touch.id) { touch.id = null; touch.dir = 0; }
    if (touch.jumps[e.pointerId]) { delete touch.jumps[e.pointerId]; touch.n = Math.max(0, touch.n - 1); }
  }
  function dropTouch() { touch.id = null; touch.dir = 0; touch.jumps = {}; touch.n = 0; }
  function onKey(e) {   // the space bar and the arrows must not scroll the page or press a button
    if (mode !== 'run' && mode !== 'done') return;
    var k = e.key;
    if (k === ' ' || k === 'Spacebar' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') { if (e.preventDefault) e.preventDefault(); }
  }

  // ---------- every frame ----------
  function hudText() {
    var txt, n, i, a, ch, hearts;
    if (run.mode === 'race') txt = '🚩 ' + (Math.min(st.cp, run.end) - run.from) + '/' + (run.end - run.from);
    else if (run.mode === 'lava') txt = (run.out ? '✖ ' : '') + '🚩 ' + st.cp + ' · ⬆ ' + Math.round(run.maxH / 10) + ' m';
    else txt = '🚩 ' + st.cp + (run.mode === 'tower' ? '/' + tw.n : '');
    if (run.watch) txt = '👀';
    if (txt !== hud.flag) { hud.flag = txt; els.pf.textContent = txt; }
    // the dark pill: a clock, the lava, or the hearts
    txt = '';
    if (run.mode === 'tower') {
      if (run.timed) txt = '⏱ ' + (mode === 'done' ? fmt(run.result ? run.result.ms : run.endMs) : run.t0 ? fmt(now() - run.t0) : '0:00.0');
      else if ((run.ct || run.c0) && st.cp < tw.n) txt = '⏱ ' + (run.c0 ? fmt(now() - run.c0) : '0:00.0');
    } else if (run.mode === 'race') txt = '⏱ ' + (run.fin ? fmt(run.fin.ms) : run.reached || run.res ? fmt(run.endMs) : now() > run.goAt ? fmt(now() - run.goAt) : '0:00.0');
    else if (run.mode === 'lava') txt = run.spec || run.reached ? '🌋 ⬆ ' + Math.max(0, Math.round(-lavaLevel() / 10)) + ' m' : '🌋 ' + Math.max(0, Math.round((lavaLevel() - st.y) / 10)) + ' m';
    else { hearts = ''; for (i = 0; i < run.hearts; i++) hearts += '❤️'; txt = hearts || '💔'; }
    if (txt !== hud.time) { hud.time = txt; els.pt.textContent = txt; els.pt.hidden = !txt || mode === 'lobby'; }
    // the third pill: the chapter, my place, who is still climbing, today's best
    if (run.mode === 'tower') { ch = tw.stages[Math.min(st.cp, tw.n - 1)].ch; txt = CHAPS[ch % CHAPS.length].icon + ' ' + (ch + 1); }
    else if (run.mode === 'race') { txt = run.fin ? placeTxt(run.fin.place) : '🏁 ' + run.n; }
    else if (run.mode === 'lava') { n = 0; a = 0; for (i = 0; i < run.rk.length; i++) { n++; if (!run.rk[i][4]) a++; } txt = '🧗 ' + a + '/' + (n || run.n); }
    else txt = '📅 🚩 ' + Math.max(st.cp, (info && info.me && info.me.endless && info.me.endless.top) || 0);
    if (txt !== hud.extra) { hud.extra = txt; els.px.textContent = txt; }
  }
  function frame() {
    if (!root) return;
    raf = requestAnimationFrame(frame);
    var t = now() / 1000, dt = lastT ? Math.min(0.1, t - lastT) : 0.016, T = towerTime(), inp, d, n, i, ev, x0, y0, o, id, txt, cut = now() - 1500, el, wait;
    lastT = t;
    if (st && run) {
      wait = run.goAt && now() < run.goAt;                    // 3, 2, 1 ...
      inp = run.spec ? ZERO : readInput();
      if (look && !run.spec && (inp.ax || inp.jump)) endLook();           // a move or a jump: back to my own player
      if (look && !look.auto && now() - look.last > LOOK_MS) endLook();   // or nobody touched the panel for a while
      if (look && look.id > 0 && !others[look.id]) { if (run.spec) look.id = -1; else endLook(); }   // whoever I looked at is gone
      if (wait || run.dead || now() < run.freeze) inp = ZERO;
      if (!run.spec && !look) {
        if (run.mode === 'tower' && !run.go && (inp.ax || inp.jump) && mode === 'run') {
          run.go = true;
          if (run.timed && !run.t0) run.t0 = now();
          if (run.ct && !run.c0) run.c0 = now();
          if (run.timed || run.ct) api.send({ t: 'obby.go' });
        }
        d = T - st.T;
        if (!(d > 0) || d > 0.25) { st.T = T - 0.016; d = 0.016; }
        if (d > 0.05) { st.T = T - 0.05; d = 0.05; }
        n = Math.ceil(d / 0.0175); d /= n;
        for (i = 0; i < n; i++) {
          x0 = st.x; y0 = st.y;
          step(tw, st, inp, d);
          ev = st.ev;
          if ((ev & EV_DIE) && now() < run.grace && st.y <= tw.stages[st.cp].base + 170) ev &= ~EV_DIE;   // just back from looking away
          if (ev) onEvents(ev, x0, y0);
          if (ev & EV_DIE) break;
          if (!run || !st) return;
        }
      } else if (!run.spec && look && st.on >= 0) {
        // looking away: my player waits (and rides along if it stands on something that moves)
        pos(tw.ents[st.on], T, PB); st.x = PB.x + look.off; st.y = PB.y;
      }
      if (!run.spec) {
        if (-st.y > run.maxH) run.maxH = -st.y;
        // the lava is real for everybody, looking or not
        if (run.mode === 'lava' && !run.out && !run.reached && !wait && st.y > lavaLevel() + 8) {
          run.out = true;
          api.send({ t: 'obby.out' });
          puff(st.x, st.y - 16, 22, '#FFC233', 190, 0); puff(st.x, st.y - 16, 10, '#F2541B', 120, 0);
          beep(260, 60, 0.5, 0.14, 'sawtooth');
          goSpec();
        }
      }
      if (!run.spec) {
        // tell the server where we are, and which flag we stand at (asked again until it says yes)
        if (now() - run.lastPos > 95) {
          run.lastPos = now();
          api.send({ t: 'obby.pos', x: Math.round(st.x), y: Math.round(st.y), f: st.f, m: st.on < 0 ? 2 : Math.abs(st.vx) > 30 ? 1 : 0 });
        }
        if (run.acked < Math.min(st.cp, run.end) && !run.dead && now() - run.lastClaim > 600) { run.lastClaim = now(); api.send({ t: 'obby.flag', i: run.acked + 1 }); }
        if (run.mode === 'race' && !wait && !run.reached) while (run.rec.length * GHOST_DT <= now() - run.goAt && run.rec.length < 1999) ghostPush();
      }
      // 3, 2, 1, go
      if (run.goAt) {
        d = run.goAt - now();
        txt = d > 0 ? String(Math.min(3, Math.ceil(d / 1000))) : d > -900 ? 'GO!' : '';
        if (txt !== run.count) { run.count = txt; if (txt === 'GO!') beep(660, 990, 0.35, 0.12, 'triangle'); else if (txt) beep(440, 440, 0.16, 0.1, 'triangle'); }
      }
      cam.y += (camTarget() - cam.y) * (1 - Math.exp(-dt * 7));
      squash *= Math.exp(-dt * 9);
      if (flash > 0) flash -= dt;
      hudText();
      renderWho();
      if ((inp.ax < 0) !== hud.l) { hud.l = inp.ax < 0; els.kl.className = 'obby-key l' + (hud.l ? ' on' : ''); }
      if ((inp.ax > 0) !== hud.r) { hud.r = inp.ax > 0; els.kr.className = 'obby-key r' + (hud.r ? ' on' : ''); }
      if (inp.jump !== hud.j) { hud.j = inp.jump; els.kj.className = 'obby-key j' + (hud.j ? ' on' : ''); }
    } else {
      cam.y += (gap - vh - cam.y) * (1 - Math.exp(-dt * 5));
      // the countdown of a round that gathers its players
      el = els.lobby && els.lobby.querySelector('.obby-cd');
      if (el) { txt = String(Math.max(0, Math.ceil((parseInt(el.getAttribute('data-at'), 10) - serverNow()) / 1000))); if (txt !== hud.cd) { hud.cd = txt; el.textContent = '⏳ ' + txt; } }
    }
    for (id in others) {
      o = others[id];
      if (o.seen < cut) { delete others[id]; continue; }
      if (Math.abs(o.tx - o.x) > 220 || Math.abs(o.ty - o.y) > 220) { o.x = o.tx; o.y = o.ty; }
      else { d = 1 - Math.exp(-dt * 14); o.x += (o.tx - o.x) * d; o.y += (o.ty - o.y) * d; }
    }
    for (i = parts.length - 1; i >= 0; i--) {
      o = parts[i]; o.life += dt;
      if (o.life >= o.max) { parts.splice(i, 1); continue; }
      o.vy += (o.g === undefined ? 320 : o.g) * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.rot += dt * 5;
    }
    for (i = pops.length - 1; i >= 0; i--) { o = pops[i]; o.life += dt; o.y -= 34 * dt; if (o.life > o.max) pops.splice(i, 1); }
    try { draw(t, T); } catch (err) { if (window.console) console.error(err); }
  }

  // ---------- drawing ----------
  var STARS = { e0: 0, e1: 0.5, e2: 0.1, e3: 0.15, e4: 1, h0: 0.25, h1: 1, h2: 0.8, h3: 0.5, h4: 1 };   // how many stars are out at the top of a chapter
  function makeClouds() {
    var p, i, n, range, layer;
    clouds = [];
    for (layer = 0; layer < 2; layer++) {
      p = layer ? 0.62 : 0.3; range = tw.height * p + 900; n = Math.ceil(range / (layer ? 85 : 110));
      for (i = 0; i < n; i++) clouds.push({ x: rnd(i * 3.3 + layer * 17) * 1200, y: 300 - rnd(i * 7.7 + layer * 5 + 1) * range, p: p, s: layer ? 0.75 + rnd(i + 2) * 0.5 : 0.4 + rnd(i + 3) * 0.3, v: (layer ? 9 : 4) + rnd(i + 8) * 6, k: i % 3, a: layer ? 0.92 : 0.7 });
    }
  }
  function drawSky(t) {
    var hard = tw.solid, hgt = -(cam.y + vh * 0.6), chs = chapters(tw), k = chapterAt(tw, hgt), C = chs[k], f = clamp((hgt - C.lo) / Math.max(1, C.hi - C.lo), 0, 1);
    var p0 = k ? LOOKS[chs[k - 1].look].sky : tw.def.sky[0], p1 = LOOKS[C.look].sky, kind = LOOKS[C.look].kind;
    var a = clamp(hgt / (chs[1] ? chs[1].hi : tw.height), 0, 6), g, s, x, y, cl, al, fs, fy, i, mul;
    g = c.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, mix(p0[0], p1[0], f)); g.addColorStop(1, mix(p0[1], p1[1], f));
    c.fillStyle = g; c.fillRect(0, 0, cw, ch);
    al = (k ? STARS[chs[k - 1].look] || 0 : 0); al += ((STARS[C.look] || 0) - al) * f;     // stars come out as the sky gets dark
    if (al > 0.02) {
      c.fillStyle = '#fff';
      for (i = 0; i < 36; i++) { c.globalAlpha = al * (0.55 + 0.45 * Math.sin(t * 2 + i * 1.7)); c.beginPath(); c.arc(rnd(i + 1) * cw, rnd(i + 51) * ch * 0.85, 1 + rnd(i + 9) * 1.6, 0, TAU); c.fill(); }
      c.globalAlpha = 1;
    }
    s = sunSprite(hard); x = cw * 0.8; y = ch * (hard ? 0.34 : 0.1) + a * ch * (hard ? 0.9 : 0.35);
    if (y < ch) c.drawImage(s, x - 80 * S, y, 160 * S, 160 * S);
    if (hard && a > 0.35) { y = ch * 0.12 + (1 - a) * ch * 0.2; if (y > -100 * S) { c.globalAlpha = clamp((a - 0.35) / 0.25, 0, 1); s = moonSprite(); c.drawImage(s, cw * 0.14, y, 100 * S, 100 * S); c.globalAlpha = 1; } }
    if (kind === 'space') { c.globalAlpha = clamp(f * 4, 0, 1); s = planetSprite(); c.drawImage(s, cw * 0.1, ch * 0.2 + f * ch * 0.12, 120 * S, 90 * S); c.globalAlpha = 1; }
    // the land far below sinks slowly as we climb
    fy = ch - (240 + gap - 70) * S + (gap - (cam.y + vh)) * 0.045 * S;
    if (fy < ch) { fs = farSprite(hard); for (x = ox % (W * S) - W * S; x < cw; x += W * S) c.drawImage(fs, x, fy, W * S, 240 * S); }
    mul = kind === 'space' ? clamp(1 - f * 5, 0, 1) : 1;      // no clouds in space
    if (mul > 0.02) for (i = 0; i < clouds.length; i++) {
      cl = clouds[i];
      y = ch * 0.5 + (cl.y - (cam.y + vh * 0.5) * cl.p) * S;
      if (y < -90 * S || y > ch) continue;
      x = (cl.x + t * cl.v) % 1200 - 200;
      s = cloudSprite(cl.k); c.globalAlpha = cl.a * mul; c.drawImage(s, ox + x * S, y, s.lw * cl.s * S, s.lh * cl.s * S);
    }
    c.globalAlpha = 1;
    if (kind === 'ice') {      // it snows in the ice chapter
      c.fillStyle = '#fff'; al = Math.min(1, f * 5, (1 - f) * 5 + 0.3);
      for (i = 0; i < 28; i++) {
        y = ((rnd(i + 70) + t * (0.05 + rnd(i + 3) * 0.05)) % 1) * ch; x = (rnd(i + 20) * cw + Math.sin(t * 0.9 + i) * 22 + cw) % cw;
        c.globalAlpha = al * (0.5 + rnd(i + 40) * 0.5); c.beginPath(); c.arc(x, y, 1.6 + rnd(i + 11) * 2.2, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    }
  }
  function drawWall(y0, y1) {
    var chs = chapters(tw), top = tw.top - 150, a, b, s, ty, i, stg, x, C, col = shade(LOOKS[chs[chs.length - 1].look].wall, 0.35), big;
    for (i = 0; i < chs.length; i++) {     // every chapter has its own wall
      C = chs[i]; a = Math.max(y0, i === chs.length - 1 ? top : -C.hi); b = Math.min(y1, i ? -C.lo : 2);
      if (b <= a) continue;
      s = wallSprite(C.look);
      c.save(); c.beginPath(); c.rect(TX0, a, TX1 - TX0, b - a); c.clip();
      for (ty = Math.floor(a / 240) * 240; ty < b; ty += 240) c.drawImage(s, TX0, ty, s.lw, s.lh + 0.5);
      c.restore();
    }
    a = Math.max(y0, top); b = Math.min(y1, 2);
    if (b <= a) return;
    c.strokeStyle = NAVY; c.lineWidth = 4; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(TX0, a); c.lineTo(TX0, b); c.moveTo(TX1, a); c.lineTo(TX1, b); c.stroke();
    for (i = 0; i <= tw.n; i++) {
      stg = tw.stages[i];
      if (stg.base + 50 < y0 || stg.base - stg.h - 20 > y1) continue;
      if (i > 0) {   // a ring round the tower where a stage begins; a golden one where a chapter begins
        big = i % tw.per === 0 && i < tw.n;
        c.beginPath(); c.rect(TX0 - 7, stg.base + 30, TX1 - TX0 + 14, big ? 15 : 11); c.fillStyle = big ? '#FFD23F' : LOOKS[tw.stages[i - 1].look].trim; c.fill(); ol(c, 3);
        c.fillStyle = 'rgba(27,42,73,0.25)'; c.fillRect(TX0 + (TX1 - TX0) * 0.62, stg.base + 31.5, (TX1 - TX0) * 0.38 + 5.5, big ? 12 : 8);
      }
      if (stg.h > 200) { s = windowSprite(stg.look); x = TX0 + 40 + rnd(i * 3.7 + 12) * (TX1 - TX0 - 150); c.drawImage(s, x, stg.base - stg.h * 0.5 - 60, s.lw, s.lh); }
    }
    if (top + 60 > y0) {   // the battlements at the very top
      c.fillStyle = col;
      for (x = TX0 - 8; x < TX1; x += 74.5) { c.beginPath(); c.rect(x, top - 28, 44, 34); c.fill(); ol(c, 3.5); }
      c.beginPath(); c.rect(TX0 - 12, top, TX1 - TX0 + 24, 14); c.fill(); ol(c, 3.5);
    }
    if (y1 > -170) { s = doorSprite(LOOKS[chs[0].look].wall); c.drawImage(s, W / 2 - 50, -128, s.lw, s.lh); s = signSprite(); c.drawImage(s, TX0 + 26, -158, s.lw, s.lh); }
  }
  function drawGround(y1) {
    var i, x;
    if (y1 < -8) return;
    c.fillStyle = '#5DBB72'; c.fillRect(-3000, 5, 6800, y1 + 40);
    c.fillStyle = 'rgba(27,42,73,0.10)'; c.fillRect(-3000, 30, 6800, y1 + 20);
    c.fillStyle = '#8FE09C'; c.fillRect(-3000, -5, 6800, 10);
    c.strokeStyle = NAVY; c.lineWidth = 3; c.beginPath(); c.moveTo(-3000, -5); c.lineTo(3800, -5); c.moveTo(-3000, 5); c.lineTo(3800, 5); c.stroke();
    c.fillStyle = '#8FE09C';
    for (i = 0; i < 26; i++) { x = rnd(i + 3) * 800; c.beginPath(); c.arc(x, 5, 6 + rnd(i) * 4, 0, Math.PI); c.fill(); }
  }
  function line(x0, y0, x1, y1) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
  // what stands on a rest platform: a chest (a heart in the endless tower) and a sign for the chapter that begins here
  function drawRest(F, t) {
    var x = F.px + 60 <= F.x + F.w - 26 ? F.px + 60 : F.px - 60, sx = x > F.px ? F.px - 54 : F.px + 54, y = F.y, s, got, k = Math.floor(F.flag / tw.per), u;
    got = !!st && st.cp >= F.flag;
    if (tw.def.gen) {
      if (!got) { u = Math.sin(t * 3 + F.flag) * 4; heart(c, x, y - 34 + u, 13); c.fillStyle = '#FF4F6D'; c.fill(); ol(c, 3); c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.arc(x - 6, y - 40 + u, 3.2, 0, TAU); c.fill(); }
    } else {
      if (!got && run && run.mode === 'tower' && info && info.me && info.me[tw.id]) got = info.me[tw.id].top >= F.flag;     // taken on an earlier climb
      c.fillStyle = 'rgba(27,42,73,0.18)'; c.beginPath(); c.ellipse(x + 3, y, 19, 5, 0, 0, TAU); c.fill();
      s = chestSprite(got); c.drawImage(s, x - 24, y - 44, 48, 48);
    }
    if (sx > F.x + 20 && sx < F.x + F.w - 20) {
      c.strokeStyle = NAVY; c.lineWidth = 5; c.lineCap = 'round'; line(sx, y - 1, sx, y - 30);
      rr(c, sx - 18, y - 56, 36, 30, 8); c.fillStyle = '#FFF3D6'; c.fill(); ol(c, 3);
      c.fillStyle = NAVY; c.font = '600 18px ' + api.FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(CHAPS[k % CHAPS.length].icon, sx, y - 40);
    }
  }
  function drawGate(F) {      // the finish of a race
    var x0 = Math.max(F.x + 8, F.px - 78), x1 = Math.min(F.x + F.w - 8, F.px + 78), y = F.y, i, n = Math.round((x1 - x0) / 13), w = (x1 - x0) / n;
    c.strokeStyle = NAVY; c.lineWidth = 7; c.lineCap = 'round'; line(x0, y - 1, x0, y - 104); line(x1, y - 1, x1, y - 104);
    c.strokeStyle = '#E8EEF7'; c.lineWidth = 3; line(x0, y - 1, x0, y - 104); line(x1, y - 1, x1, y - 104);
    c.beginPath(); c.rect(x0, y - 104, x1 - x0, 26); c.fillStyle = '#fff'; c.fill();
    c.fillStyle = NAVY;
    for (i = 0; i < n; i++) c.fillRect(x0 + i * w, y - 104 + (i % 2) * 13, w, 13);
    c.beginPath(); c.rect(x0, y - 104, x1 - x0, 26); ol(c, 3);
  }
  // pass 0: wind and shadows on the wall · pass 1: platforms and lava · pass 2: things that hurt, doors, flags
  function drawStage(stg, pass, T, t) {
    var list = stg.list, ents = tw.ents, i, e, k, x, y, s, a, j, n, u, d, dir, F, col;
    for (i = 0; i < list.length; i++) {
      e = ents[list[i]]; k = e.k;
      if (pass === 0) {
        if (k === 'wind') drawWind(e, t);
        else if (SOLID[k]) {
          if ((k === 'v' && st && gone(tw, st, e.i, T)) || (k === 'f' && e.flag === 0)) continue;
          pos(e, T, PB); x = Math.max(TX0 + 2, PB.x + 12); u = Math.min(TX1 - 2, PB.x + e.w + 14);
          if (u > x) { c.fillStyle = 'rgba(27,42,73,0.17)'; c.fillRect(x, PB.y + 16, u - x, 21); c.fillStyle = 'rgba(27,42,73,0.08)'; c.fillRect(x - 2, PB.y + 14, u - x + 4, 25); }
        }
      } else if (pass === 1) {
        if (k === 'l') { drawLava(e, t); continue; }
        if (!SOLID[k]) continue;
        pos(e, T, PB); x = PB.x; y = PB.y;
        if (k === 'sw') {      // the ropes
          c.strokeStyle = NAVY; c.lineWidth = 4; c.beginPath(); c.moveTo(e.px, e.py); c.lineTo(x + 8, y - 2); c.moveTo(e.px, e.py); c.lineTo(x + e.w - 2, y - 2); c.stroke();
          c.strokeStyle = '#D9B26A'; c.lineWidth = 1.8; c.stroke();
          c.beginPath(); c.arc(e.px, e.py, 6, 0, TAU); c.fillStyle = '#8D9AB5'; c.fill(); ol(c, 2.5);
        } else if (k === 'o') {  // a spoke of the wheel
          c.strokeStyle = NAVY; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(e.cx, e.cy); c.lineTo(x + e.w / 2, y + 12); c.stroke();
          c.strokeStyle = '#B9C4DA'; c.lineWidth = 3; c.stroke();
          c.beginPath(); c.arc(e.cx, e.cy, 13, 0, TAU); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 3);
        }
        if (k === 'f' && e.flag === 0) continue;     // the first flag stands on the grass
        s = platSprite(e, stg);
        if (k === 'v') {
          d = st && st.van[e.i] !== undefined ? T - st.van[e.i] : -1;
          if (d >= tw.vd && d < tw.vd + VBACK) {      // away: a faint outline shows where it comes back
            c.globalAlpha = 0.16; c.drawImage(s, x - 12, y - 16, s.lw, s.lh); c.globalAlpha = 1; continue;
          }
          if (d >= 0 && d < tw.vd) { u = d / tw.vd; x += Math.sin(t * 55) * 2 * u; y += u * 3; c.globalAlpha = 1 - u * 0.55; }
          c.drawImage(s, x - 12, y - 16, s.lw, s.lh); c.globalAlpha = 1;
        } else if (k === 'b') {
          d = bounced[e.i] !== undefined ? T - bounced[e.i] : 9;
          u = d < 0.3 ? 1 - 0.45 * Math.sin((d / 0.3) * Math.PI) : 1;
          if (u < 1) { c.save(); c.translate(x, y + 35); c.scale(1, u); c.drawImage(s, -12, -16 - 35, s.lw, s.lh); c.restore(); }
          else c.drawImage(s, x - 12, y - 16, s.lw, s.lh);
        } else {
          c.drawImage(s, x - 12, y - 16, s.lw, s.lh);
          if (k === 'c') {     // the belt runs
            dir = e.sp > 0 ? 1 : -1; u = ((t * Math.abs(e.sp) * 0.6) % 22);
            c.strokeStyle = '#FFD66B'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath();
            for (a = 24 + (dir > 0 ? u : 22 - u); a < e.w - 22; a += 22) { c.moveTo(x + a - 4 * dir, y + 9.5); c.lineTo(x + a + 2 * dir, y + 14); c.lineTo(x + a - 4 * dir, y + 18.5); }
            c.stroke();
            c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 2.5; c.beginPath();
            for (a = 12 + (dir > 0 ? u : 22 - u); a < e.w - 6; a += 22) { c.moveTo(x + a + 2, y + 1.5); c.lineTo(x + a + 5, y - 2.5); }
            c.stroke();
          }
        }
      } else {
        if (k === 's') {
          n = e.arms;
          c.beginPath(); c.arc(e.x, e.y, 15, 0, TAU); c.fillStyle = '#8D9AB5'; c.fill(); ol(c, 3);
          c.lineCap = 'round';
          for (j = 0; j < n; j++) {
            a = e.ph + e.sp * T + j * TAU / n; x = e.x + Math.cos(a) * e.r; y = e.y + Math.sin(a) * e.r;
            c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(x, y);
            c.strokeStyle = NAVY; c.lineWidth = 17; c.stroke(); c.strokeStyle = '#FF4F6D'; c.lineWidth = 11; c.stroke();
            c.lineCap = 'butt'; c.setLineDash([9, 11]); c.lineDashOffset = -8; c.strokeStyle = '#fff'; c.stroke(); c.setLineDash([]); c.lineCap = 'round';
          }
          c.beginPath(); c.arc(e.x, e.y, 8, 0, TAU); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 3);
        } else if (k === 'w') {
          pos(e, T, PB);
          c.strokeStyle = NAVY; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(e.px, e.py); c.lineTo(PB.x, PB.y); c.stroke();
          c.strokeStyle = '#B9C4DA'; c.lineWidth = 2; c.setLineDash([5, 5]); c.stroke(); c.setLineDash([]);
          c.beginPath(); c.arc(e.px, e.py, 7, 0, TAU); c.fillStyle = '#8D9AB5'; c.fill(); ol(c, 2.5);
          s = ballSprite(); c.drawImage(s, PB.x - 32, PB.y - 32, 64, 64);
        } else if (k === 'z') {
          pos(e, T, PB); s = spikySprite();
          c.save(); c.translate(PB.x, PB.y + Math.sin(t * 9 + e.i) * 1.5); c.rotate(Math.sin(t * 5 + e.i) * 0.25); c.drawImage(s, -26, -26, 52, 52); c.restore();
        } else if (k === 'ic') {
          // an icicle: it shakes before it falls, breaks, and grows again
          u = T / e.per + e.ph; u -= Math.floor(u); s = icicleSprite();
          c.beginPath(); c.ellipse(e.x, e.y + 2, 11, 5, 0, 0, TAU); c.fillStyle = '#EAF8FF'; c.fill(); ol(c, 2);
          if (u < 0.5) c.drawImage(s, e.x - 12 + (u > 0.3 ? Math.sin(t * 55) * 1.8 * (u - 0.3) / 0.2 : 0), e.y - 3, 24, 40);
          else {
            d = (u - 0.5) * e.per; d = ICG * d * d;
            if (d <= e.drop) c.drawImage(s, e.x - 12, e.y - 3 + d, 24, 40);
            else { a = clamp((u - 0.8) / 0.2, 0, 1); if (a > 0.05) { c.save(); c.translate(e.x, e.y); c.scale(a, a); c.drawImage(s, -12, -3, 24, 40); c.restore(); } }
          }
        } else if (k === 'lz') {
          // a laser: bright while it is on, a thin blinking line just before, dots while it is off
          u = T / e.per + e.ph; u -= Math.floor(u); x = e.x + e.w; y = e.y + e.h; c.lineCap = 'round';
          if (u < e.on) {
            c.strokeStyle = 'rgba(255,59,107,0.32)'; c.lineWidth = 15; line(e.x, e.y, x, y);
            c.strokeStyle = '#FF3B6B'; c.lineWidth = 7; line(e.x, e.y, x, y);
            c.strokeStyle = '#fff'; c.lineWidth = 2.5; line(e.x, e.y, x, y);
          } else if ((1 - u) * e.per < 0.7) {
            if (Math.sin(t * 30) > -0.2) { c.strokeStyle = 'rgba(255,59,107,0.8)'; c.lineWidth = 3; line(e.x, e.y, x, y); }
          } else { c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 2.5; c.setLineDash([3, 11]); line(e.x, e.y, x, y); c.setLineDash([]); }
          for (j = 0; j < 2; j++) {
            a = j ? x : e.x; d = j ? y : e.y;
            rr(c, a - 9, d - 9, 18, 18, 5); c.fillStyle = '#56617A'; c.fill(); ol(c, 2.5);
            c.beginPath(); c.arc(a, d, 4, 0, TAU); c.fillStyle = u < e.on ? '#FF3B6B' : '#FFD66B'; c.fill();
          }
        } else if (k === 'tp') {
          // a door, and a glowing ring where it leads
          col = TPCOL[e.n % TPCOL.length]; a = 0.5 + 0.5 * Math.sin(t * 4 + e.n);
          c.beginPath(); c.ellipse(e.tx, e.ty - 1, 21, 6.5, 0, 0, TAU); c.fillStyle = col; c.globalAlpha = 0.45 + 0.35 * a; c.fill(); c.globalAlpha = 1; ol(c, 2.5);
          c.beginPath(); c.ellipse(e.tx, e.ty - 1, 11, 3.2, 0, 0, TAU); c.fillStyle = '#fff'; c.fill();
          c.fillStyle = col;
          for (j = 0; j < 3; j++) { u = (t * 0.8 + j / 3) % 1; c.globalAlpha = 1 - u; star(c, e.tx + Math.sin(j * 2.1 + t) * 12, e.ty - 8 - u * 34, 5 - u * 3); c.fill(); }
          c.globalAlpha = 1;
          s = doorInSprite(e.n); c.drawImage(s, e.x - 26, e.y - 66, 52, 70);
          c.fillStyle = '#fff';
          for (j = 0; j < 2; j++) { a = t * 3 + j * Math.PI; star(c, e.x + Math.cos(a) * 8, e.y - 26 + Math.sin(a) * 13, 3.5); c.fill(); }
        } else if (k === 'f') {
          F = e; x = F.px; y = F.y;
          if (F.flag >= tw.n) {    // the cup at the top
            s = trophySprite(); u = Math.sin(t * 2.4) * 3;
            c.fillStyle = 'rgba(27,42,73,0.18)'; c.beginPath(); c.ellipse(x, y, 24, 6, 0, 0, TAU); c.fill();
            c.drawImage(s, x - 32, y - 76 + u, 64, 72);
            for (j = 0; j < 3; j++) { a = t * 1.6 + j * TAU / 3; star(c, x + Math.cos(a) * 38, y - 44 + u + Math.sin(a) * 22, 4 + Math.sin(t * 5 + j) * 1.5); c.fillStyle = '#FFF6B0'; c.fill(); ol(c, 1.5); }
          } else {
            if (F.flag > 0 && F.flag % tw.per === 0) drawRest(F, t);
            if (run && run.mode === 'race' && F.flag === run.end) drawGate(F);
            d = st ? st.cp >= F.flag : false;
            c.fillStyle = 'rgba(27,42,73,0.18)'; c.beginPath(); c.ellipse(x + 3, y, 11, 4, 0, 0, TAU); c.fill();
            c.strokeStyle = NAVY; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y - 1); c.lineTo(x, y - 62); c.stroke();
            c.strokeStyle = '#E8EEF7'; c.lineWidth = 2.5; c.stroke();
            u = Math.sin(t * 4 + F.flag) * 3;
            c.beginPath(); c.moveTo(x + 1, y - 62); c.quadraticCurveTo(x + 20, y - 62 + u, x + 38, y - 51 + u * 0.6); c.quadraticCurveTo(x + 20, y - 46 - u * 0.5, x + 1, y - 38); c.closePath();
            c.fillStyle = d ? '#58C06B' : '#FF4F6D'; c.fill(); ol(c, 3);
            c.beginPath(); c.arc(x, y - 64, 4.5, 0, TAU); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 2.5);
            c.fillStyle = '#fff'; c.font = '700 13px ' + api.FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(F.flag ? String(F.flag) : '★', x + 13, y - 50 + u * 0.4);
          }
        }
      }
    }
  }
  function drawLava(e, t) {
    var x = e.x, y = e.y, w = e.w, h = e.h, i, n = Math.max(3, Math.round(w / 14)), px;
    c.fillStyle = 'rgba(255,150,40,0.20)'; rr(c, x - 7, y - 13, w + 14, h + 18, 9); c.fill();
    rr(c, x, y, w, h, 5); c.fillStyle = '#F2541B'; c.fill(); ol(c, 3);
    c.fillStyle = 'rgba(120,20,10,0.28)'; c.fillRect(x + 1.5, y + h * 0.6, w - 3, h * 0.4 - 1.5);
    c.beginPath(); c.moveTo(x + 2, y + 8);
    for (i = 0; i <= n; i++) { px = x + 2 + (w - 4) * i / n; c.lineTo(px, y + 4 + Math.sin(t * 3.2 + i * 1.4 + x) * 2.2); }
    c.lineTo(x + w - 2, y + 8); c.closePath(); c.fillStyle = '#FFC233'; c.fill();
    c.fillStyle = '#FFE680';
    for (i = 0; i < 2 + (w > 120 ? 2 : 0); i++) {
      px = (t * 0.7 + rnd(i * 9.3 + x)) % 1;
      c.globalAlpha = 1 - px; c.beginPath(); c.arc(x + 8 + rnd(i * 5.1 + x) * (w - 16), y + 3 - px * 14, 2 + px * 2.5, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  }
  // the lava of a lava round: a sea that rises and hides everything below
  function drawLavaSea(t, y1) {
    var ly = lavaLevel(), x, i, u, g;
    if (ly > y1 + 40) return;
    function wave(x, o) { return ly + o + Math.sin(t * 2.4 + x * 0.045) * 5 + Math.sin(t * 1.3 + x * 0.021) * 4; }
    g = c.createLinearGradient(0, ly - 90, 0, ly); g.addColorStop(0, 'rgba(255,140,40,0)'); g.addColorStop(1, 'rgba(255,140,40,0.5)');
    c.fillStyle = g; c.fillRect(-3000, ly - 90, 6800, 96);
    c.beginPath(); c.moveTo(-3000, y1 + 80); c.lineTo(-3000, ly);
    for (x = -900; x <= 1700; x += 25) c.lineTo(x, wave(x, 0));
    c.lineTo(3800, ly); c.lineTo(3800, y1 + 80); c.closePath();
    c.fillStyle = '#F2541B'; c.fill(); ol(c, 4);
    c.beginPath(); c.moveTo(-900, wave(-900, 2));
    for (x = -900; x <= 1700; x += 25) c.lineTo(x, wave(x, 2));
    for (x = 1700; x >= -900; x -= 25) c.lineTo(x, wave(x + 40, 13));
    c.closePath(); c.fillStyle = '#FFC233'; c.fill();
    c.fillStyle = 'rgba(120,20,10,0.32)'; c.fillRect(-3000, ly + 60, 6800, Math.max(0, y1 + 80 - ly - 60));
    c.fillStyle = '#FFE680';
    for (i = 0; i < 12; i++) { u = (t * 0.6 + rnd(i * 3.3)) % 1; c.globalAlpha = 1 - u; c.beginPath(); c.arc(rnd(i * 7.7) * 800, ly + 4 - u * 30, 3 + u * 5, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
  }
  function drawWind(e, t) {
    var i, n = Math.max(4, Math.round(e.w * e.h / 7000)), u, x, y, dir = e.fx > 0 ? 1 : -1, a;
    c.fillStyle = e.fy ? 'rgba(190,240,255,0.30)' : 'rgba(255,255,255,0.24)'; rr(c, e.x, e.y, e.w, e.h, 16); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2.5; c.setLineDash([10, 9]); c.stroke(); c.setLineDash([]);
    c.strokeStyle = '#fff'; c.lineWidth = 3.5; c.lineCap = 'round';
    for (i = 0; i < n; i++) {
      u = (t * (e.fy ? 0.55 : 0.5) + rnd(i * 2.7 + e.x)) % 1; a = Math.sin(u * Math.PI);
      c.globalAlpha = Math.min(1, a * 1.4); c.beginPath();
      if (e.fy) {
        x = e.x + 14 + rnd(i * 3.1 + e.y) * (e.w - 28); y = e.y + e.h - u * e.h;
        c.moveTo(x, y + 16); c.lineTo(x, y - 14); c.moveTo(x - 6, y - 7); c.lineTo(x, y - 14); c.lineTo(x + 6, y - 7);
      } else {
        x = dir > 0 ? e.x + u * e.w : e.x + e.w - u * e.w; y = e.y + 14 + rnd(i * 7.7 + e.x) * (e.h - 28);
        c.moveTo(x - 20 * dir, y); c.lineTo(x + 14 * dir, y); c.moveTo(x + 7 * dir, y - 6); c.lineTo(x + 14 * dir, y); c.lineTo(x + 7 * dir, y + 6);
      }
      c.stroke();
    }
    c.globalAlpha = 1;
  }
  var ME = { color: '#FF7A45', hat: 0, big: false, name: '', lv: 0 }, GH = { x: 0, y: 0, f: 1, m: 0 };
  function drawGuy(p, x, y, f, m, t, sq, isMe, noTag) {
    var h;
    c.save(); c.translate(x, y);
    if (sq) c.scale(1 + sq * 0.2, 1 - sq * 0.2);
    h = api.drawAvatar(c, p, 0, 0, t, { scale: AV, facing: f, moving: m === 1 });
    c.restore();
    if (!noTag) tags.push({ p: p, x: x, y: y - h - 5, me: isMe });
    return h;
  }
  // the soft shadow under the player: on the platform below, smaller the higher the jump
  function drawShadow(T) {
    var y = 1e9, si, i, list, e, d;
    if (st.on >= 0) y = st.y;
    else for (si = Math.max(0, st.cp - 1); si <= Math.min(tw.n, st.cp + 1); si++) {
      list = tw.stages[si].list;
      for (i = 0; i < list.length; i++) {
        e = tw.ents[list[i]];
        if (!SOLID[e.k] || (e.k === 'v' && gone(tw, st, e.i, T))) continue;
        pos(e, T, PB);
        if (st.x > PB.x - 6 && st.x < PB.x + e.w + 6 && PB.y >= st.y - 2 && PB.y < y) y = PB.y;
      }
    }
    d = y - st.y;
    if (d > 260) return;
    d = 1 - d / 320;
    c.fillStyle = 'rgba(27,42,73,' + (0.22 * d).toFixed(3) + ')';
    c.beginPath(); c.ellipse(st.x + 2, y + 1, 15 * d, 4.5 * d, 0, 0, TAU); c.fill();
  }
  // the bar at the edge: how high everybody is (and the lava). Dragging along it looks up and down the tower.
  function drawPanel() {
    var x = cw - 26, y0 = 86, y1 = ch - 150, h = y1 - y0, i, y, id, o, p, pl = api.players(), me = api.self() || ME, list = [], r, rg, lo, hi, hh, at = lookAt();
    bar.marks = list;
    if (h < 70 || !st || !run) return;
    rg = barRange(); lo = rg[0]; hi = Math.max(lo + 1, rg[1]);
    function py(v) { return y1 - h * clamp((v - lo) / (hi - lo), 0, 1); }
    rr(c, x - 8, y0 - 10, 16, h + 20, 8); c.fillStyle = 'rgba(255,255,255,0.82)'; c.fill();
    if (run.mode === 'lava') {
      y = py(-lavaLevel());
      c.save(); rr(c, x - 8, y0 - 10, 16, h + 20, 8); c.clip();
      c.fillStyle = '#F2541B'; c.fillRect(x - 8, y, 16, y1 + 12 - y); c.fillStyle = '#FFC233'; c.fillRect(x - 8, y, 16, 3);
      c.restore();
    }
    rr(c, x - 8, y0 - 10, 16, h + 20, 8); ol(c, 2.5);
    c.strokeStyle = 'rgba(27,42,73,0.5)'; c.lineWidth = 2; c.beginPath();
    for (i = 1; i < tw.n; i++) {
      hh = -tw.stages[i].base;
      if (hh <= lo || hh >= hi) continue;
      y = py(hh);
      if (i % tw.per === 0) { c.moveTo(x - 8, y); c.lineTo(x + 8, y); } else if (tw.n <= 36 || run.mode === 'race') { c.moveTo(x - 4, y); c.lineTo(x + 4, y); }
    }
    c.stroke();
    star(c, x, y0 - 12, 11); c.fillStyle = '#FFD23F'; c.fill(); ol(c, 2.5);
    if (look) {        // the part of the tower on the screen
      y = py(-cam.y - vh * 0.2); hh = py(-cam.y - vh * 0.8);
      rr(c, x - 12, y, 24, Math.max(8, hh - y), 5); c.strokeStyle = '#FFD66B'; c.lineWidth = 5; c.stroke(); c.strokeStyle = NAVY; c.lineWidth = 2; c.stroke();
    }
    for (id in others) { o = others[id]; p = pl[id]; if (p) list.push({ id: id, p: p, y: py(-o.y), me: false }); }
    if (!run.spec) list.push({ id: 'me', p: me, y: py(-st.y), me: true });
    list.sort(function (a, b) { return (a.me ? 1 : 0) - (b.me ? 1 : 0); });
    for (i = 0; i < list.length; i++) {
      o = list[i]; r = o.me ? 9 : 7.5;
      if (at && String(at.id) === String(o.id)) { c.beginPath(); c.arc(x, o.y, r + 5, 0, TAU); c.fillStyle = '#FFD66B'; c.fill(); ol(c, 2); }
      c.beginPath(); c.arc(x, o.y, r, 0, TAU); c.fillStyle = o.p.color || '#FF7A45'; c.fill(); ol(c, o.me ? 3 : 2.5);
      if (o.me) { c.beginPath(); c.arc(x, o.y, 3, 0, TAU); c.fillStyle = '#fff'; c.fill(); }
    }
  }
  // a race or a lava round as it stands: who is first, who is out
  function drawRank() {
    var rk = run.rk || [], list = [], i, o, id = api.myId(), y = 76, txt, w, mine, race = run.mode === 'race', fs = cw < 1000 ? 15 : 17, hgt = fs + 10;
    for (i = 0; i < rk.length; i++) {
      o = rk[i]; mine = String(o[0]) === String(id);
      list.push({ name: o[1], flag: o[2], fin: o[3], out: o[4], m: o[5], me: mine, h: mine && !run.spec ? -st.y : others[o[0]] ? -others[o[0]].y : -tw.stages[clamp(o[2], 0, tw.n)].base });
    }
    if (list.length < 2 && !run.ghost) return;
    list.sort(function (a, b) { return race ? ((a.fin || 1e12) - (b.fin || 1e12)) || (a.out - b.out) || (b.h - a.h) : (a.out - b.out) || (a.out ? b.m - a.m : b.h - a.h); });
    if (run.ghost) list.push({ ghost: true });
    c.font = '600 ' + fs + 'px ' + api.FONT; c.textAlign = 'left'; c.textBaseline = 'middle';
    for (i = 0; i < list.length && i < 9; i++) {
      o = list[i];
      if (o.ghost) txt = '👻  ⏱ ' + fmt(run.ghost.ms);
      else txt = (i + 1) + '  ' + o.name + '  ' + (race ? (o.fin ? '🏁 ' + fmt(o.fin) : o.out ? '✖' : '🚩' + (o.flag - run.from)) : o.fin ? '🏆' : o.out ? '✖ ' + o.m + ' m' : '⬆ ' + Math.max(0, Math.round(o.h / 10)) + ' m');
      w = c.measureText(txt).width + 20;
      rr(c, 12, y, w, hgt, hgt / 2); c.fillStyle = o.me ? '#FFD66B' : o.out ? 'rgba(214,220,232,0.88)' : 'rgba(255,255,255,0.9)'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = NAVY; c.stroke();
      c.fillStyle = NAVY; c.fillText(txt, 22, y + hgt / 2 + 1);
      y += hgt + 4;
    }
  }
  function draw(t, T) {
    var k = dpr * S, y0, y1, i, lo = -1, hi = -1, stg, o, p, id, pl = api.players(), me = api.self() || ME, sx, sy, sc, gy = null, d, fs;
    tags.length = 0;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSky(t);
    c.setTransform(k, 0, 0, k, dpr * ox, -k * cam.y);
    c.lineJoin = 'round';
    y0 = cam.y - 40; y1 = cam.y + vh + 40;
    drawWall(y0, y1);
    drawGround(y1);
    for (i = 0; i <= tw.n; i++) {
      stg = tw.stages[i];
      if (stg.base + 90 > y0 && stg.base - stg.h - 240 < y1) { if (lo < 0) lo = i; hi = i; }
    }
    if (lo >= 0) {
      for (i = lo; i <= hi; i++) drawStage(tw.stages[i], 0, T, t);
      for (i = lo; i <= hi; i++) drawStage(tw.stages[i], 1, T, t);
      for (i = lo; i <= hi; i++) drawStage(tw.stages[i], 2, T, t);
    }
    if (st && run) {
      c.globalAlpha = 0.72;
      for (id in others) {
        o = others[id]; p = pl[id];
        if (!p || o.y < y0 - 40 || o.y > y1 + 80) continue;
        drawGuy(p, o.x, o.y, o.f, o.m, t, 0, false);
      }
      // alone in a race: the ghost of my best race runs along
      if (run.ghost && run.ghost.s && run.goAt && now() > run.goAt && ghostAt(run.ghost, now() - run.goAt, GH)) {
        c.globalAlpha = 0.38; d = drawGuy(me, GH.x, GH.y, GH.f, GH.m, t, 0, false, true); gy = GH.y - d - 4;
      }
      c.globalAlpha = 1;
      if (!run.spec) {
        drawShadow(T);
        if (flash > 0) c.globalAlpha = 0.55 + 0.45 * Math.sin(t * 40);
        else if (look) c.globalAlpha = 0.6 + 0.2 * Math.sin(t * 5);       // I am looking away: my player waits
        drawGuy(me, st.x, st.y, st.f, st.on >= 0 && Math.abs(st.vx) > 30 && !look ? 1 : 0, t, squash, true);
        c.globalAlpha = 1;
      }
    }
    for (i = 0; i < parts.length; i++) {
      o = parts[i]; c.globalAlpha = Math.min(1, (1 - o.life / o.max) * 1.6); c.fillStyle = o.col;
      if (o.k === 1) { star(c, o.x, o.y, o.r + 2); c.fill(); }
      else if (o.k === 2) { c.save(); c.translate(o.x, o.y); c.rotate(o.rot); c.fillRect(-o.r, -o.r * 0.5, o.r * 2, o.r); c.restore(); }
      else { c.beginPath(); c.arc(o.x, o.y, o.r, 0, TAU); c.fill(); }
    }
    c.globalAlpha = 1;
    if (run && run.mode === 'lava') drawLavaSea(t, y1);
    // on top, in screen pixels: name tags, "+1" notes, the height bar, the ranking and the countdown
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    sc = cw < 1000 ? 0.78 : 0.9;
    for (i = 0; i < tags.length; i++) {
      o = tags[i]; if (!o.p.name) continue;
      sx = ox + o.x * S; sy = (o.y - cam.y) * S;
      c.save(); c.translate(sx, sy); c.scale(sc, sc); api.nameTag(c, o.p, 0, 0, o.me); c.restore();
    }
    if (gy !== null) api.label(c, '👻', ox + GH.x * S, (gy - cam.y) * S, '#fff', NAVY, cw < 1000 ? 15 : 17);
    for (i = 0; i < pops.length; i++) {
      o = pops[i]; c.globalAlpha = clamp((o.max - o.life) * 2.5, 0, 1);
      api.label(c, o.txt, clamp(ox + o.x * S, 90, cw - 90), Math.max(96, (o.y - cam.y) * S), o.bg, NAVY, cw < 1000 ? 19 : 22);
    }
    c.globalAlpha = 1;
    if (st && run) {
      if (run.mode === 'lava' && !run.spec) {      // the lava is close under the screen: the bottom glows
        d = clamp(1 - (lavaLevel() - (cam.y + vh)) / 260, 0, 1);
        if (d > 0 && lavaLevel() > cam.y + vh) { o = c.createLinearGradient(0, ch - 90, 0, ch); o.addColorStop(0, 'rgba(255,90,30,0)'); o.addColorStop(1, 'rgba(255,90,30,' + (0.55 * d * (0.75 + 0.25 * Math.sin(t * 6))).toFixed(3) + ')'); c.fillStyle = o; c.fillRect(0, ch - 90, cw, 90); }
      }
      drawPanel();
      if (run.mode === 'race' || run.mode === 'lava') drawRank();
      if (run.count) {
        fs = Math.round(Math.min(ch * 0.34, cw * 0.2));
        c.font = '700 ' + fs + 'px ' + api.FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
        c.strokeStyle = NAVY; c.lineWidth = fs * 0.16; c.strokeText(run.count, cw / 2, ch * 0.42);
        c.fillStyle = run.count === 'GO!' ? '#58C06B' : '#FFD66B'; c.fillText(run.count, cw / 2, ch * 0.42);
      }
    }
  }

  window.FTGames = window.FTGames || {};
  window.FTGames.obby = {
    init: function (a) { api = a; },
    open: open,
    onMessage: onMessage,
    onPlayers: function () { if (root && mode === 'lobby') renderLobby(); },
    // for the test bot (scratch tests load this file in Node and play the stages)
    _sim: { TOWERS: TOWERS, tower: tower, dayTower: dayTower, genTower: genTower, build: build, step: step, spawn: spawn, newState: newState, pos: pos, consts: { G: G, JUMP: JUMP, RUN: RUN, COYOTE: COYOTE } },
    // for the tests in the browser: what the screen is doing right now
    _dbg: function () {
      return { mode: mode, tab: tab, camY: cam.y, vh: vh, gap: gap, look: look ? { id: look.id, auto: look.auto } : null, others: Object.keys(others),
        st: st ? { x: st.x, y: st.y, cp: st.cp, on: st.on } : null,
        run: run ? { mode: run.mode, tower: run.tower, from: run.from, end: run.end, acked: run.acked, spec: run.spec, out: run.out, reached: run.reached, hearts: run.hearts, n: run.n, rec: run.rec.length, ghost: run.ghost ? run.ghost.ms : 0 } : null };
    }
  };
})();
