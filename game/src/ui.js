/* ============================================================
   Neon Harbor — game/src/ui.js
   Job: overlay + menu — layar start, pause, game over, toast,
   simpan/muat permainan, dan semua tombol + keyboard menu.
   Modul ini tidak menggambar dunia dan tidak menghitung misi;
   ia hanya menampilkan/menyembunyikan overlay dan memanggil
   modul lain (Missions, HUD, Sound) pada momen yang tepat.
   Restart TIDAK me-reload halaman: state pemain/misi di-reset
   lalu misi 1 dimulai lagi.
   Gaya: classic script, IIFE, 'use strict', var/function saja.
   setTimeout dipakai HANYA untuk toast (diizinkan).
   ============================================================ */
(function () {
  'use strict';

  var H = window.Harbor || (window.Harbor = {});

  var SAVE_KEY = 'neon-harbor-save';

  /* ----------------------------------------------------------
     Pembantu kecil.
     ---------------------------------------------------------- */
  function $(id) { return document.getElementById(id); }

  function show(id, on) {
    var node = $(id);
    if (node) { node.style.display = on ? 'block' : 'none'; }
  }

  function setText(id, text) {
    var node = $(id);
    if (node) { node.textContent = text; }
  }

  function hideGameplayOverlays() {
    show('overlay-start', false);
    show('overlay-pause', false);
    show('overlay-over', false);
  }

  /* (toast memakai timer internal di showToast) */

  /* ----------------------------------------------------------
     showStart(S) — overlay start: judul, briefing misi 1,
     daftar kontrol, tombol Start. HUD gameplay disembunyikan
     sampai start ditekan.
     ---------------------------------------------------------- */
  function showStart(S) {
    var hud = $('hud');
    var briefTitle = $('brief-title');
    var briefText = $('brief-text');
    var first = null;
    var list = null;
    if (H.Missions && typeof H.Missions.current === 'function') {
      /* Misi 1 belum dimulai: tampilkan briefing dari Config
         lewat Missions — fallback ke teks baku bila tak ada. */
    }
    if (H.Config && H.Config.MISSIONS && H.Config.MISSIONS[0]) {
      first = H.Config.MISSIONS[0];
    }
    if (briefTitle) {
      briefTitle.textContent = first ? first.title : 'First Wheels';
    }
    if (briefText) {
      briefText.textContent = first && first.briefing
        ? first.briefing
        : 'Marisol Vega butuh mobil. Curi Anchor S di gerbang dermaga dan bawa ke garasi Palm Court.';
    }
    show('overlay-start', true);
    show('overlay-pause', false);
    show('overlay-over', false);
    if (hud) { hud.style.display = 'none'; }
    if (S) { S.started = false; }
  }

  /* ----------------------------------------------------------
     showPause(S) — overlay pause (Esc).
     ---------------------------------------------------------- */
  function showPause(S) {
    show('overlay-pause', true);
    if (S) { S.paused = true; }
  }

  function hidePause(S) {
    show('overlay-pause', false);
    if (S) { S.paused = false; }
  }

  /* ----------------------------------------------------------
     showGameOver(S) — overlay game over bila health <= 0.
     Judul di #over-title: 'BUSTED' bila wanted > 0 saat
     health habis, 'WASTED' bila tidak. Penjelasan satu
     kalimat di #over-text.
     ---------------------------------------------------------- */
  function showGameOver(S) {
    var busted = S.player.wanted > 0;
    var title = busted ? 'BUSTED' : 'WASTED';
    var text = busted
      ? 'Polisi Harbor menangkapmu dengan ' + S.player.wanted + ' bintang wanted. Kota ini belum selesai denganmu, Rook.'
      : 'Kau tumbang di jalanan Neon Harbor. Bangkit, ambil lagi mobilmu, dan selesaikan pekerjaanmu.';
    setText('over-title', title);
    setText('over-text', text);
    show('overlay-over', true);
    if (H.Sound && typeof H.Sound.siren === 'function') {
      H.Sound.siren(false);
    }
    if (H.Sound && typeof H.Sound.engineHum === 'function') {
      H.Sound.engineHum(false, 0);
    }
    if (S) {
      S.started = false;
      S.player.alive = false;
    }
  }

  /* ----------------------------------------------------------
     showToast(S, text) — toast #toast, auto-hide ~3 detik.
     ---------------------------------------------------------- */
  var toastTimer = null;
  function showToast(S, text) {
    var node = $('toast');
    if (!node) { return; }
    node.textContent = text;
    node.style.display = 'block';
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () {
      node.style.display = 'none';
      toastTimer = null;
    }, 3000);
  }

  /* ----------------------------------------------------------
     showMissionBrief(S, mission) — dialog briefing via HUD,
     dengan potret pemberi misi (marisol / dario).
     ---------------------------------------------------------- */
  function showMissionBrief(S, mission) {
    if (!mission) { return; }
    if (H.HUD && typeof H.HUD.setDialog === 'function') {
      H.HUD.setDialog(S, {
        name: mission.giver,
        role: 'Mission giver — ' + mission.title,
        text: mission.briefing,
        key: mission.giver === 'Dario Kaine' ? 'dario' : 'marisol'
      });
    }
  }

  /* ----------------------------------------------------------
     resetRun(S) — reset state awal untuk restart (tanpa
     reload halaman): pemain, uang, misi, wanted, senjata.
     ---------------------------------------------------------- */
  function resetRun(S) {
    S.player.pos.set(0, 0, 150);
    S.player.heading = 0;
    S.player.speed = 0;
    S.player.onFoot = true;
    S.player.health = 100;
    S.player.armor = 50;
    S.player.cash = 250;
    S.player.rp = 0;
    S.player.wanted = 0;
    S.player.heat = 0;
    S.player.vehicle = null;
    S.player.alive = true;
    S.cash = 250;
    S.day = 1;
    S.hour = 18.2;
    S.minutes = 1092;
    S.missionIdx = 0;
    S.mission = { idx: 0, step: 0, stepCount: 2, done: false, timer: null, carrying: 0, kills: 0 };
    if (S.combat) {
      S.combat.weaponSlot = 1;
      S.combat.ammo = { 1: 12, 2: 0, 3: 0, 4: 0 };
      S.combat.killFeed = [];
      S.combat.tracers = [];
      S.combat.lastShotAt = 0;
    }
    if (S.goons) {
      var i;
      for (i = 0; i < S.goons.length; i++) {
        if (S.goons[i] && S.goons[i].mesh && S.scene) {
          S.scene.remove(S.goons[i].mesh);
        }
      }
      S.goons = [];
    }
    if (S.police) {
      S.police.units = [];
      S.police.heli = null;
      S.police.roadblocks = [];
    }
  }

  /* ----------------------------------------------------------
     startRun(S) — mulai permainan dari overlay start:
     sembunyikan overlay, tampilkan HUD, mulai misi 1.
     ---------------------------------------------------------- */
  function startRun(S) {
    if (H.Sound && typeof H.Sound.ensure === 'function') {
      H.Sound.ensure();
    }
    hideGameplayOverlays();
    var hud = $('hud');
    if (hud) { hud.style.display = 'block'; }
    S.started = true;
    S.player.alive = true;
    if (S.missionIdx === 0 && (!S.mission || S.mission.done)) {
      if (H.Missions && typeof H.Missions.start === 'function') {
        H.Missions.start(S, 0);
      }
    } else if (H.Missions && typeof H.Missions.start === 'function' && !S.mission) {
      H.Missions.start(S, 0);
    }
  }

  /* ----------------------------------------------------------
     restartRun(S) — dipakai restart-btn DAN restart-btn-2:
     reset state, sembunyikan overlay game over, mulai lagi.
     ---------------------------------------------------------- */
  function restartRun(S) {
    resetRun(S);
    hideGameplayOverlays();
    var hud = $('hud');
    if (hud) { hud.style.display = 'block'; }
    S.started = true;
    if (H.Missions && typeof H.Missions.start === 'function') {
      H.Missions.start(S, 0);
    }
    showToast(S, 'Fresh start — good luck, Rook');
  }

  /* ----------------------------------------------------------
     saveGame(S) — simpan JSON ke localStorage. Return bool.
     ---------------------------------------------------------- */
  function saveGame(S) {
    var data;
    try {
      data = {
        cash: S.player.cash,
        rp: S.player.rp,
        missionIdx: S.missionIdx || 0,
        day: S.day || 1,
        minutes: S.minutes || 1092
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      showToast(S, 'Game saved');
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ----------------------------------------------------------
     loadGame(S) — baca save + terapkan ke S. Return true bila
     ada save, false bila tidak.
     ---------------------------------------------------------- */
  function loadGame(S) {
    var raw, data;
    try {
      raw = localStorage.getItem(SAVE_KEY);
      if (!raw) { return false; }
      data = JSON.parse(raw);
    } catch (e) {
      return false;
    }
    if (!data || typeof data !== 'object') { return false; }
    if (typeof data.cash === 'number') {
      S.player.cash = data.cash;
      S.cash = data.cash;
    }
    if (typeof data.rp === 'number') { S.player.rp = data.rp; }
    if (typeof data.missionIdx === 'number') { S.missionIdx = data.missionIdx; }
    if (typeof data.day === 'number') { S.day = data.day; }
    if (typeof data.minutes === 'number') { S.minutes = data.minutes; }
    return true;
  }

  /* ----------------------------------------------------------
     bindMenus(S) — pasang semua klik tombol + keyboard.
       start-btn    : Sound.ensure + started + sembunyikan
                      overlay + Missions.start(S,0) bila belum.
       continue-btn : loadGame lalu mulai.
       resume-btn   : tutup pause.
       restart-btn / restart-btn-2 : restart yang sama.
       save-btn / load-btn : simpan / muat.
       mute-btn     : toggle mute.
       Esc          : pause toggle. M : mute toggle.
     ---------------------------------------------------------- */
  function bindMenus(S) {
    var startBtn = $('start-btn');
    var continueBtn = $('continue-btn');
    var resumeBtn = $('resume-btn');
    var restartBtn = $('restart-btn');
    var restartBtn2 = $('restart-btn-2');
    var saveBtn = $('save-btn');
    var loadBtn = $('load-btn');
    var muteBtn = $('mute-btn');

    if (startBtn) {
      startBtn.addEventListener('click', function () { startRun(S); });
    }
    if (continueBtn) {
      continueBtn.addEventListener('click', function () {
        var had = loadGame(S);
        if (!had) {
          showToast(S, 'No save found — starting fresh');
        }
        startRun(S);
        if (had && S.missionIdx > 0 && H.Missions && typeof H.Missions.start === 'function') {
          H.Missions.start(S, S.missionIdx);
        }
      });
    }
    if (resumeBtn) {
      resumeBtn.addEventListener('click', function () { hidePause(S); });
    }
    if (restartBtn) {
      restartBtn.addEventListener('click', function () { restartRun(S); });
    }
    if (restartBtn2) {
      restartBtn2.addEventListener('click', function () { restartRun(S); });
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', function () { saveGame(S); });
    }
    if (loadBtn) {
      loadBtn.addEventListener('click', function () {
        if (loadGame(S)) {
          showToast(S, 'Save loaded');
        } else {
          showToast(S, 'No save found');
        }
      });
    }
    if (muteBtn) {
      muteBtn.addEventListener('click', function () {
        var m = false;
        if (H.Sound && typeof H.Sound.toggleMute === 'function') {
          m = H.Sound.toggleMute();
        }
        muteBtn.textContent = m ? 'UNMUTE' : 'MUTE';
        showToast(S, m ? 'Muted' : 'Sound on');
      });
    }

    document.addEventListener('keydown', function (ev) {
      var key = ev.key;
      if (key === 'Escape') {
        var pauseBox = $('overlay-pause');
        var overBox = $('overlay-over');
        var startBox = $('overlay-start');
        if (startBox && startBox.style.display !== 'none') { return; }
        if (overBox && overBox.style.display !== 'none') { return; }
        if (!S.started) { return; }
        if (pauseBox && pauseBox.style.display !== 'none') {
          hidePause(S);
        } else {
          showPause(S);
        }
      } else if (key === 'm' || key === 'M') {
        if (H.Sound && typeof H.Sound.toggleMute === 'function') {
          H.Sound.toggleMute();
        }
      }
    });
  }

  /* ----------------------------------------------------------
     Ekspos API.
     ---------------------------------------------------------- */
  H.UI = {
    showStart: showStart,
    showPause: showPause,
    hidePause: hidePause,
    showGameOver: showGameOver,
    showToast: showToast,
    bindMenus: bindMenus,
    saveGame: saveGame,
    loadGame: loadGame,
    showMissionBrief: showMissionBrief,
    startRun: startRun,
    restartRun: restartRun,
    resetRun: resetRun
  };
})();
