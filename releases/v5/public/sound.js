// Family Town sound. Every effect and the background tune are made in code with the Web Audio API:
// there are no audio files.
//   window.Sfx = { play(name), mode(), setMode(n) }      mode: 2 = music + effects, 1 = effects only, 0 = off
// Audio unlocks by itself on the first touch or key press (browsers do not allow sound before that).
(function () {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext || null;
  var KEY = 'ft_sound', MUSIC_VOL = 0.5;
  var ctx = null, fx = null, mus = null, mel = null, noiseBuf = null, tries = 0;
  var mode = 2, unlocked = false, last = {};

  try {
    var saved = parseInt(localStorage.getItem(KEY), 10);
    if (saved === 0 || saved === 1 || saved === 2) mode = saved;
  } catch (e) {}

  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); } // MIDI note number -> frequency

  // ---------- audio graph: effects + music -> soft limiter -> speakers ----------
  function setup() {
    if (ctx || !AC) return;
    if (++tries > 3) { AC = null; return; }
    try {
      var c = new AC(), out = c.createGain(), i, n, b, d;
      out.gain.value = 0.9;
      if (c.createDynamicsCompressor) {
        var comp = c.createDynamicsCompressor();
        try { comp.threshold.value = -12; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.005; comp.release.value = 0.2; } catch (e) {}
        out.connect(comp); comp.connect(c.destination);
      } else out.connect(c.destination);
      fx = c.createGain(); fx.gain.value = 1; fx.connect(out);
      mus = c.createGain(); mus.gain.value = 0; mus.connect(out);
      mel = c.createBiquadFilter(); mel.type = 'lowpass'; mel.frequency.value = 2200; mel.connect(mus); // takes the edge off the tune
      n = Math.floor(c.sampleRate); b = c.createBuffer(1, n, c.sampleRate); d = b.getChannelData(0);
      for (i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      noiseBuf = b;
      ctx = c;
    } catch (e) { ctx = null; }
  }
  function resume() {
    try {
      if (ctx && ctx.state && ctx.state !== 'running' && ctx.resume) {
        var p = ctx.resume();
        if (p && typeof p.then === 'function') p.then(null, function () {});
      }
    } catch (e) {}
  }
  function unlock() {
    if (!AC && !ctx) return;
    setup();
    if (!ctx) return;
    resume();
    unlocked = true;
    if (mode === 2 && !document.hidden) startMusic();
  }

  // ---------- building blocks ----------
  // One note: quick attack, then fades out by the end of `d` seconds.
  //   o.a attack time, o.hold seconds at full level before fading, o.via / o.to pitch glide, o.lp low-pass cut-off
  function tone(type, f, t, d, v, o) {
    o = o || {};
    var osc = ctx.createOscillator(), g = ctx.createGain(), a = o.a || 0.008, node = osc;
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (o.via) osc.frequency.exponentialRampToValueAtTime(o.via, t + d * 0.45);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    if (o.hold) g.gain.setValueAtTime(v, t + a + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    if (o.lp) { var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lp; osc.connect(lp); node = lp; }
    node.connect(g); g.connect(fx);
    osc.start(t); osc.stop(t + d + 0.03);
  }
  // A small bell: the note plus two quieter, shorter overtones.
  function bell(m, t, d, v) {
    var f = hz(m);
    tone('sine', f, t, d, v);
    tone('sine', f * 2, t, d * 0.55, v * 0.3);
    tone('sine', f * 3.01, t, d * 0.3, v * 0.1);
  }
  // Filtered noise, for whooshes and clicks.  o.to sweeps the filter, o.q sets its sharpness, o.a the attack.
  function noise(t, d, v, kind, f, o) {
    o = o || {};
    var src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    flt.type = kind; flt.frequency.setValueAtTime(f, t);
    if (o.to) flt.frequency.exponentialRampToValueAtTime(o.to, t + d);
    if (o.q) flt.Q.value = o.q;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + (o.a || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(flt); flt.connect(g); g.connect(fx);
    src.start(t); src.stop(t + d + 0.03);
  }
  // Several notes one after another. `fn` is tone-like: fn(midi, time, index).
  function run(notes, t, gap, fn) { for (var i = 0; i < notes.length; i++) fn(notes[i], t + i * gap, i); }

  // ---------- the effects ----------
  // A run of stars climbs this scale; it starts again from the bottom after a short pause.
  var STAR = [72, 74, 76, 79, 81, 84, 86, 88], starStep = -1, starAt = 0;

  var FX = {
    tap: function (t) { tone('sine', 620, t, 0.07, 0.13, { to: 480 }); },
    open: function (t) { tone('triangle', hz(72), t, 0.12, 0.15); tone('triangle', hz(79), t + 0.08, 0.2, 0.15); },
    close: function (t) { tone('triangle', hz(79), t, 0.12, 0.13); tone('triangle', hz(72), t + 0.08, 0.2, 0.13); },
    star: function (t) {
      var now = Date.now();
      starStep = now - starAt > 2500 ? 0 : Math.min(starStep + 1, STAR.length - 1);
      starAt = now;
      bell(STAR[starStep], t, 0.32, 0.16);
      bell(STAR[starStep] + 7, t + 0.07, 0.3, 0.08);
    },
    card: function (t) { tone('sine', 440, t, 0.13, 0.12, { to: 660 }); tone('sine', 880, t + 0.11, 0.18, 0.1); },
    quest: function (t) {
      run([79, 83, 86], t, 0.09, function (m, at) { tone('triangle', hz(m), at, 0.15, 0.15); });
      bell(91, t + 0.27, 0.55, 0.13);
    },
    claim: function (t) { // coins
      tone('sine', hz(83), t, 0.09, 0.15);
      tone('sine', hz(88), t + 0.08, 0.42, 0.15);
      tone('square', hz(88), t + 0.08, 0.22, 0.025);
      bell(95, t + 0.2, 0.28, 0.05);
    },
    chest: function (t) { // lid whooshes open, treasure sparkles (about 1.9 s)
      noise(t, 0.36, 0.11, 'bandpass', 400, { to: 2400, q: 1.2, a: 0.12 });
      run([72, 76, 79, 84], t + 0.3, 0.08, function (m, at) { bell(m, at, 0.3, 0.13); });
      run([84, 88, 91], t + 0.66, 0, function (m, at) { bell(m, at, 0.95, 0.1); });
      run([96, 93, 98, 96, 100], t + 0.84, 0.11, function (m, at) { tone('sine', hz(m), at, 0.26, 0.055); });
    },
    levelup: function (t) { // a little fanfare (about 1.5 s)
      run([67, 72, 76, 79], t, 0.11, function (m, at) { tone('triangle', hz(m), at, 0.17, 0.15); tone('sine', hz(m + 12), at, 0.14, 0.05); });
      run([72, 76, 79, 84], t + 0.46, 0, function (m, at) { tone('triangle', hz(m), at, 0.98, 0.1, { hold: 0.34, a: 0.015 }); });
      noise(t + 0.42, 0.9, 0.04, 'highpass', 3000, { to: 7000, a: 0.3 });
      bell(91, t + 0.76, 0.45, 0.08); bell(96, t + 0.92, 0.5, 0.07);
    },
    buy: function (t) { // ka-ching
      noise(t, 0.05, 0.09, 'highpass', 3500);
      bell(88, t + 0.03, 0.36, 0.14); bell(93, t + 0.12, 0.5, 0.14);
    },
    deny: function (t) { tone('sine', 233, t, 0.11, 0.14, { to: 208 }); tone('sine', 208, t + 0.13, 0.17, 0.14, { to: 185 }); },
    right: function (t) { bell(76, t, 0.25, 0.14); bell(81, t + 0.1, 0.25, 0.14); bell(88, t + 0.2, 0.45, 0.14); },
    wrong: function (t) { tone('sine', 392, t, 0.3, 0.12, { to: 294, a: 0.02 }); tone('triangle', 196, t, 0.3, 0.045, { to: 147, a: 0.02 }); },
    tagit: function (t) { // boi-ing!
      tone('triangle', 330, t, 0.16, 0.16, { to: 660 });
      tone('triangle', 660, t + 0.16, 0.1, 0.14); tone('triangle', 523, t + 0.27, 0.2, 0.14);
    },
    tagwin: function (t) {
      run([72, 76, 79, 76, 79, 84], t, 0.085, function (m, at, i) { tone('triangle', hz(m), at, i === 5 ? 0.42 : 0.13, 0.14); });
      bell(96, t + 0.5, 0.4, 0.06);
    },
    emote: function (t) { tone('sine', 880, t, 0.08, 0.11, { to: 1175 }); tone('sine', 1319, t + 0.08, 0.13, 0.1); },
    join: function (t) { bell(76, t, 0.45, 0.12); bell(72, t + 0.22, 0.6, 0.12); }, // ding-dong
    goal: function (t) { // the whole family did it (about 1.7 s)
      run([60, 64, 67, 72, 76, 79, 84], t, 0.07, function (m, at) { tone('triangle', hz(m), at, 0.16, 0.13); });
      run([72, 79, 84, 88], t + 0.55, 0, function (m, at) { tone('triangle', hz(m), at, 1.1, 0.09, { hold: 0.4, a: 0.015 }); });
      noise(t + 0.5, 1, 0.04, 'highpass', 3000, { to: 8000, a: 0.3 });
      run([96, 100, 103, 96], t + 0.8, 0.12, function (m, at) { tone('sine', hz(m), at, 0.26, 0.05); });
    },
    car: function (t) { // engine starts, then beep-beep
      tone('sawtooth', 60, t, 0.5, 0.2, { via: 150, to: 95, lp: 420, a: 0.04 });
      run([0, 1], t + 0.52, 0.13, function (k, at) { tone('triangle', 494, at, k ? 0.16 : 0.1, 0.12); tone('triangle', 622, at, k ? 0.16 : 0.1, 0.07); });
    }
  };

  function play(name) {
    try {
      if (!mode || !ctx || !unlocked || document.hidden) return;
      if (!Object.prototype.hasOwnProperty.call(FX, name)) return;
      if (ctx.state && ctx.state !== 'running') { resume(); return; } // nothing queues up while the browser has audio paused
      var now = Date.now();
      if (last[name] && now - last[name] < 40) return;               // the same sound twice at once: play it once
      last[name] = now;
      FX[name](ctx.currentTime + 0.01);
    } catch (e) {}
  }

  // ---------- background music ----------
  // A slow tune in C over four chords (C, Am, F, G), 8 bars long. To stay easy on the ears it is not the
  // same every time round: the tune, then a few echoes of it, then the tune as a quiet music box, then
  // only the chords.
  var STEP = 60 / 84 / 2;                                              // one eighth note at 84 beats a minute
  var CHORDS = [[60, 64, 67], [57, 60, 64], [60, 65, 69], [59, 62, 67]];
  var BASS = [48, 45, 53, 55];
  var TUNE = [
    76, 0, 79, 0, 76, 0, 72, 0,   69, 0, 72, 0, 76, 0, 0, 0,   77, 0, 81, 0, 79, 0, 77, 0,   74, 0, 0, 0, 79, 0, 0, 0,
    76, 0, 79, 0, 84, 0, 79, 0,   81, 0, 0, 79, 76, 0, 0, 0,   77, 0, 76, 0, 74, 0, 72, 0,   74, 0, 0, 0, 71, 0, 74, 0
  ];
  var musicOn = false, timer = null, step = 0, pass = 0, nextT = 0;

  // A held note that swells in and out, so chords melt into each other and nothing clicks.
  function pad(type, m, t, d, v, a, r) {
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(hz(m), t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.setValueAtTime(v, Math.max(t + a, t + d - r));
    g.gain.linearRampToValueAtTime(0, t + d);
    osc.connect(g); g.connect(mus);
    osc.start(t); osc.stop(t + d + 0.05);
  }
  function pluck(type, m, t, d, v) {
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(hz(m), t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    g.gain.linearRampToValueAtTime(0, t + d + 0.04);
    osc.connect(g); g.connect(mel);
    osc.start(t); osc.stop(t + d + 0.08);
  }
  function scheduleStep(i, t) {
    var bar = Math.floor(i / 8) % 4, pos = i % 8, k, ch, m = TUNE[i], kind = pass % 4;
    if (pos === 0) {
      ch = CHORDS[bar];
      for (k = 0; k < ch.length; k++) pad('sine', ch[k], t, STEP * 8 + 0.5, 0.034, 0.5, 0.7);
      pad('triangle', BASS[bar], t, STEP * 3.2, 0.05, 0.03, STEP * 2.2);
    } else if (pos === 4) {
      pad('triangle', BASS[bar] + 7, t, STEP * 2.6, 0.032, 0.03, STEP * 1.8);
    }
    if (!m) return;
    if (kind === 0) pluck('triangle', m, t, STEP * 2.6, 0.05);
    else if (kind === 1) { if (Math.random() < 0.4) pluck('triangle', m, t, STEP * 2.6, 0.035); }
    else if (kind === 2) pluck('sine', m + 12, t, STEP * 2.4, 0.03);
  }
  // Runs a few times a second and books the notes for the next moment on the audio clock.
  function schedule() {
    if (!musicOn || !ctx) return;
    var now = ctx.currentTime;
    if (nextT < now - 0.05) nextT = now + 0.08;                        // the page was busy: carry on from now, do not bunch notes up
    while (nextT < now + 0.9) {
      try { scheduleStep(step, nextT); } catch (e) {}
      nextT += STEP;
      if (++step >= TUNE.length) { step = 0; pass++; }
    }
  }
  function fade(to, secs) {
    try {
      var now = ctx.currentTime;
      mus.gain.cancelScheduledValues(now);
      mus.gain.setValueAtTime(mus.gain.value, now);
      mus.gain.linearRampToValueAtTime(to, now + secs);
    } catch (e) { try { mus.gain.value = to; } catch (e2) {} }
  }
  function startMusic() {
    if (musicOn || !ctx || !mus) return;
    musicOn = true;
    fade(MUSIC_VOL, 0.8);
    if (nextT < ctx.currentTime + 0.12) nextT = ctx.currentTime + 0.12; // notes already booked are never booked twice
    timer = setInterval(schedule, 240);
    schedule();
  }
  function stopMusic() {
    if (!musicOn) return;
    musicOn = false;
    if (timer) { clearInterval(timer); timer = null; }
    fade(0, 0.3);
  }

  // ---------- public ----------
  function setMode(n) {
    n = parseInt(n, 10);
    if (!(n >= 0 && n <= 2)) n = 2;
    mode = n;
    try { localStorage.setItem(KEY, String(n)); } catch (e) {}
    if (mode === 2 && unlocked && !document.hidden) startMusic(); else stopMusic();
    return mode;
  }

  if (document && document.addEventListener) {
    // Kept on for good: a browser may pause audio again later (a call, a locked screen), and the next touch wakes it.
    ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown', 'click'].forEach(function (ev) {
      document.addEventListener(ev, unlock, true);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopMusic();
      else if (mode === 2 && unlocked) { resume(); startMusic(); }
    });
  }

  window.Sfx = { play: play, mode: function () { return mode; }, setMode: setMode };
})();
