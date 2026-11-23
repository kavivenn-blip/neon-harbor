/* ============================================================
   Neon Harbor — game/src/audio.js
   Job: semua suara — efek WebAudio (tembakan, ledakan, bip,
   sirene, dengung mesin) + radio Harbor FM (daftar lagu dan
   jingle pergantian lagu). AudioContext dibuat malas di
   ensure(), hanya setelah gestur pengguna; semua fungsi
   no-op aman bila audio belum di-ensure atau bila browser
   tidak punya AudioContext. Tanpa file suara, tanpa network.
   Gaya: classic script, IIFE, 'use strict', var/function saja.
   ============================================================ */
(function () {
  'use strict';

  var H = window.Harbor || (window.Harbor = {});
  var C = H.Config || {};

  /* ----------------------------------------------------------
     State audio internal.
     ---------------------------------------------------------- */
  var ctx = null;          /* AudioContext, null sampai ensure() */
  var master = null;       /* GainNode master */
  var noiseBuf = null;     /* Buffer noise putih, dibuat sekali */
  var muted = false;
  var MASTER_LEVEL = 0.4;

  /* Sirene: dua oscillator yang nadanya bergantian. */
  var sirenOsc = null;
  var sirenOsc2 = null;
  var sirenGain = null;
  var sirenOn = false;

  /* Dengung mesin: satu oscillator sawtooth + gain. */
  var engineOsc = null;
  var engineGain = null;
  var engineOn = false;

  /* ----------------------------------------------------------
     Daftar lagu cadangan (dipakai bila Config.RADIO tak ada).
     ---------------------------------------------------------- */
  var FALLBACK_SONGS = [
    { title: 'Neon Tide', artist: 'The Breakers' },
    { title: 'Sunset Run', artist: 'Marisol Vega' },
    { title: 'Harbor Lights', artist: 'Copper Line' },
    { title: 'Golden Hour', artist: 'Palm Court Club' }
  ];

  var station = 'Harbor FM 101.3';
  var songIdx = 0;

  function songList() {
    if (C.RADIO && C.RADIO.songs && C.RADIO.songs.length) { return C.RADIO.songs; }
    return FALLBACK_SONGS;
  }

  function stationDefault() {
    if (C.RADIO && C.RADIO.station) { return C.RADIO.station; }
    return 'Harbor FM 101.3';
  }
  station = stationDefault();

  /* ----------------------------------------------------------
     ensure() — buat AudioContext secara lazy. Aman dipanggil
     berkali-kali; aman bila AudioContext tidak ada.
     ---------------------------------------------------------- */
  function ensure() {
    var AC;
    if (ctx) {
      if (ctx.state === 'suspended') {
        try { ctx.resume(); } catch (e) { /* abaikan */ }
      }
      return true;
    }
    AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { return false; }
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_LEVEL;
      master.connect(ctx.destination);
      /* Buffer noise putih 1 detik, dipakai tembakan/ledakan. */
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var data = noiseBuf.getChannelData(0);
      var i;
      for (i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') { ctx.resume(); }
      return true;
    } catch (e) {
      ctx = null;
      master = null;
      return false;
    }
  }

  /* ----------------------------------------------------------
     Pembantu: oscillator sekali bunyi.
     ---------------------------------------------------------- */
  function blip(type, freqFrom, freqTo, dur, vol, when) {
    var osc, gain, t0;
    if (!ctx || !master) { return; }
    try {
      t0 = ctx.currentTime + (when || 0);
      osc = ctx.createOscillator();
      gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqFrom, t0);
      if (freqTo !== freqFrom) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t0 + dur);
      }
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (e) { /* suara gagal: game tetap jalan */ }
  }

  /* ----------------------------------------------------------
     Pembantu: semburan noise lewat filter.
     ---------------------------------------------------------- */
  function noiseBurst(dur, vol, filterFreq, filterType) {
    var src, gain, filter, t0;
    if (!ctx || !master || !noiseBuf) { return; }
    try {
      t0 = ctx.currentTime;
      src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      filter = ctx.createBiquadFilter();
      filter.type = filterType || 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    } catch (e) { /* abaikan */ }
  }

  /* ----------------------------------------------------------
     shot() — letupan: noise pendek + nada turun cepat.
     ---------------------------------------------------------- */
  function shot() {
    if (!ctx) { return; }
    noiseBurst(0.09, 0.5, 3200, 'highpass');
    blip('square', 420, 90, 0.1, 0.22, 0);
  }

  /* ----------------------------------------------------------
     explosion() — dentum panjang: noise lowpass + nada rendah.
     ---------------------------------------------------------- */
  function explosion() {
    if (!ctx) { return; }
    noiseBurst(0.7, 0.8, 420, 'lowpass');
    blip('sine', 120, 28, 0.65, 0.5, 0);
    blip('triangle', 90, 30, 0.4, 0.3, 0.05);
  }

  /* ----------------------------------------------------------
     beep(freq, dur) — bip tunggal, dipakai UI + misi.
     ---------------------------------------------------------- */
  function beep(freq, dur) {
    if (!ctx) { return; }
    blip('sine', freq || 660, freq || 660, dur || 0.12, 0.2, 0);
  }

  /* ----------------------------------------------------------
     siren(on) — sirene polisi dua nada. Dipanggil berulang
     dengan nilai yang sama tidak masalah (dijaga state).
     ---------------------------------------------------------- */
  function siren(on) {
    var t0;
    if (!ctx || !master) { return; }
    if (on && !sirenOn) {
      try {
        t0 = ctx.currentTime;
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0.0;
        sirenGain.gain.linearRampToValueAtTime(0.12, t0 + 0.2);
        sirenGain.connect(master);
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'sine';
        sirenOsc.frequency.value = 720;
        sirenOsc2 = ctx.createOscillator();
        sirenOsc2.type = 'sine';
        sirenOsc2.frequency.value = 960;
        /* LFO 0.5 Hz mengayun gain kedua oscillator bergantian:
           disederhanakan — oscillator pertama berbunyi lewat
           gain tetap, yang kedua lewat gain yang berayun. */
        var lfo = ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 1.6;
        var lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.06;
        lfo.connect(lfoGain);
        lfoGain.connect(sirenGain.gain);
        sirenOsc.connect(sirenGain);
        sirenOsc2.connect(sirenGain);
        sirenOsc.start(t0);
        sirenOsc2.start(t0);
        lfo.start(t0);
        sirenOn = true;
        sirenOsc._lfo = lfo;
      } catch (e) { sirenOn = false; }
      return;
    }
    if (!on && sirenOn) {
      try {
        if (sirenOsc) { sirenOsc.stop(); }
        if (sirenOsc2) { sirenOsc2.stop(); }
        if (sirenOsc && sirenOsc._lfo) { sirenOsc._lfo.stop(); }
      } catch (e) { /* abaikan */ }
      sirenOsc = null;
      sirenOsc2 = null;
      sirenGain = null;
      sirenOn = false;
    }
  }

  /* ----------------------------------------------------------
     engineHum(on, speed) — dengung mesin: nada naik seiring
     kecepatan (speed dalam m/s, 0..~40).
     ---------------------------------------------------------- */
  function engineHum(on, speed) {
    var t0, freq;
    if (!ctx || !master) { return; }
    if (on && !engineOn) {
      try {
        t0 = ctx.currentTime;
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 55;
        engineGain = ctx.createGain();
        engineGain.gain.value = 0.0;
        engineGain.gain.linearRampToValueAtTime(0.07, t0 + 0.3);
        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start(t0);
        engineOn = true;
      } catch (e) { engineOn = false; }
      return;
    }
    if (on && engineOn && engineOsc) {
      freq = 55 + Math.min(40, Math.abs(speed || 0)) * 4.5;
      try { engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05); } catch (e) { /* abaikan */ }
      return;
    }
    if (!on && engineOn) {
      try { engineOsc.stop(); } catch (e) { /* abaikan */ }
      engineOsc = null;
      engineGain = null;
      engineOn = false;
    }
  }

  /* ----------------------------------------------------------
     radioJingle() — jingle 3 nada pendek saat lagu berganti.
     Alias: jingle().
     ---------------------------------------------------------- */
  function radioJingle() {
    if (!ctx) { return; }
    blip('sine', 523, 523, 0.12, 0.18, 0);
    blip('sine', 659, 659, 0.12, 0.18, 0.12);
    blip('sine', 784, 784, 0.2, 0.2, 0.24);
  }

  /* ----------------------------------------------------------
     nextSong() — majukan lagu, mainkan jingle, kembalikan
     { title, artist } lagu baru.
     ---------------------------------------------------------- */
  function nextSong() {
    var list = songList();
    songIdx = (songIdx + 1) % list.length;
    radioJingle();
    return { title: list[songIdx].title, artist: list[songIdx].artist };
  }

  /* ----------------------------------------------------------
     currentSong() — { title, artist } lagu berjalan.
     ---------------------------------------------------------- */
  function currentSong() {
    var list = songList();
    var s = list[songIdx % list.length];
    return { title: s.title, artist: s.artist };
  }

  /* ----------------------------------------------------------
     setStation(name) — ganti nama stasiun radio.
     ---------------------------------------------------------- */
  function setStation(name) {
    if (name) { station = name; }
    return station;
  }

  function getStation() {
    return station;
  }

  /* ----------------------------------------------------------
     setMuted(m) / toggleMute() — dipakai tombol mute di UI.
     ---------------------------------------------------------- */
  function setMuted(m) {
    muted = !!m;
    if (master && ctx) {
      try { master.gain.value = muted ? 0 : MASTER_LEVEL; } catch (e) { /* abaikan */ }
    }
    return muted;
  }

  function toggleMute() {
    return setMuted(!muted);
  }

  function isMuted() {
    return muted;
  }

  /* ----------------------------------------------------------
     Ekspos API.
     ---------------------------------------------------------- */
  H.Sound = {
    ensure: ensure,
    shot: shot,
    explosion: explosion,
    siren: siren,
    beep: beep,
    engineHum: engineHum,
    radioJingle: radioJingle,
    jingle: radioJingle,
    nextSong: nextSong,
    currentSong: currentSong,
    setStation: setStation,
    getStation: getStation,
    setMuted: setMuted,
    toggleMute: toggleMute,
    isMuted: isMuted
  };
})();
