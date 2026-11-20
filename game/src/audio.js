// audio.js — synthesized WebAudio sound: engine hum, sirens, gunfire,
// ambience, UI blips, and a music loop. No audio files, no network.
(function (global) {
  'use strict';

  function makeAudio() {
    var ctx = null;
    var a = {
      volume: 0.5, muted: false, started: false,
      engineOsc: null, engineGain: null, sirenTimer: 0, musicTimer: 0, musicStep: 0,
    };
    function ensure() {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        a.ctx = ctx;
        // Engine: saw + lowpass, gain by speed.
        a.engineOsc = ctx.createOscillator();
        a.engineOsc.type = 'sawtooth';
        a.engineOsc.frequency.value = 50;
        var filt = ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 400;
        a.engineGain = ctx.createGain();
        a.engineGain.gain.value = 0;
        a.engineOsc.connect(filt); filt.connect(a.engineGain); a.engineGain.connect(ctx.destination);
        a.engineOsc.start();
      }
      if (ctx.state === 'suspended') ctx.resume();
      a.started = true;
      return ctx;
    }
    a.ensure = ensure;
    a.setVolume = function (v) { a.volume = Math.max(0, Math.min(1, v)); };
    a.setMuted = function (m) { a.muted = m; if (a.engineGain) a.engineGain.gain.value = 0; };
    function blip(freq, dur, type, vol) {
      if (!a.started || a.muted || !ctx) return;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime((vol || 0.15) * a.volume, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + dur);
    }
    a.uiClick = function () { blip(660, 0.07, 'square', 0.1); };
    a.pickup = function () { blip(880, 0.12, 'sine', 0.2); blip(1320, 0.15, 'sine', 0.15); };
    a.cash = function () { blip(990, 0.1, 'sine', 0.2); blip(1480, 0.18, 'sine', 0.2); };
    a.busted = function () { blip(220, 0.5, 'sawtooth', 0.25); blip(165, 0.7, 'sawtooth', 0.25); };
    function noiseBurst(dur, vol, freq) {
      if (!a.started || a.muted || !ctx) return;
      var len = Math.floor(ctx.sampleRate * dur);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = freq || 1800;
      var g = ctx.createGain();
      g.gain.value = vol * a.volume;
      src.connect(f); f.connect(g); g.connect(ctx.destination);
      src.start();
    }
    a.gunshot = function () { noiseBurst(0.12, 0.5, 2200); };
    a.explosion = function () { noiseBurst(0.7, 0.8, 500); };
    a.horn = function () { blip(370, 0.25, 'square', 0.2); blip(466, 0.25, 'square', 0.15); };
    a.siren = function (dt) {
      if (!a.started || a.muted || !ctx) return;
      a.sirenTimer -= dt;
      if (a.sirenTimer <= 0) {
        a.sirenTimer = 0.45;
        a.sirenHigh = !a.sirenHigh;
        blip(a.sirenHigh ? 950 : 700, 0.4, 'sine', 0.08);
      }
    };
    a.engine = function (speed01, inCar) {
      if (!a.started || !a.engineGain) return;
      var target = (a.muted || !inCar) ? 0 : (0.02 + speed01 * 0.09) * a.volume;
      a.engineGain.gain.value += (target - a.engineGain.gain.value) * 0.1;
      a.engineOsc.frequency.value = 45 + speed01 * 110;
    };
    // Music loop: a lazy minor-key bass + pad arpeggio, one step per call.
    var bassNotes = [55, 55, 65.41, 49, 55, 55, 73.42, 65.41];
    a.music = function (dt) {
      if (!a.started || a.muted || !ctx) return;
      a.musicTimer -= dt;
      if (a.musicTimer <= 0) {
        a.musicTimer = 0.42;
        var n = bassNotes[a.musicStep % bassNotes.length];
        a.musicStep++;
        blip(n, 0.4, 'triangle', 0.12);
        if (a.musicStep % 4 === 0) blip(n * 4, 0.5, 'sine', 0.05);
      }
    };
    return a;
  }

  global.NH.makeAudio = makeAudio;
})(window);
