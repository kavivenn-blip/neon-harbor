// ui.js — screens and persistence: the start screen, pause menu, controls
// help, a volume setting, save/load in localStorage (with a Continue
// button), and the busted / wasted / mission-failed / ending screens.
(function (global) {
  'use strict';
  var SAVE_KEY = 'neonharbor-save-v1';

  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveGame(state) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: Math.floor(state.cash),
        missionIndex: state.missionIndex,
        packages: state.packages,
        savedAt: new Date().toISOString(),
      }));
      return true;
    } catch (e) { return false; }
  }

  function makeUI(callbacks) {
    var ui = {
      screen: 'start', // start | playing | paused | busted | wasted | ending
      settings: { volume: 0.5, music: true },
      callbacks: callbacks || {},
    };
    var save = loadSave();
    ui.hasSave = !!save;
    ui.save = save;
    var startBtn = document.getElementById('start-btn');
    var contBtn = document.getElementById('continue-btn');
    if (contBtn) contBtn.style.display = save ? 'block' : 'none';
    if (startBtn) startBtn.addEventListener('click', function () { ui.start(false); });
    if (contBtn) contBtn.addEventListener('click', function () { ui.start(true); });
    var resumeBtn = document.getElementById('resume-btn');
    if (resumeBtn) resumeBtn.addEventListener('click', function () { ui.resume(); });
    var restartBtn = document.getElementById('restart-btn');
    if (restartBtn) restartBtn.addEventListener('click', function () { ui.start(false); });
    var retryBtn = document.getElementById('retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', function () { if (ui.callbacks.retryMission) ui.callbacks.retryMission(); });
    var vol = document.getElementById('volume');
    if (vol) vol.addEventListener('input', function () {
      ui.settings.volume = Number(vol.value);
      if (ui.callbacks.volume) ui.callbacks.volume(ui.settings.volume);
    });
    ui.show = function (name) {
      ui.screen = name;
      ['start-screen', 'pause-screen', 'end-screen'].forEach(function (id) {
        var n = document.getElementById(id);
        if (n) n.style.display = 'none';
      });
      var map = { start: 'start-screen', paused: 'pause-screen', busted: 'end-screen', wasted: 'end-screen', ending: 'end-screen' };
      var target = map[name];
      if (target) {
        var n = document.getElementById(target);
        if (n) n.style.display = 'flex';
      }
      var endTitle = document.getElementById('end-title');
      var endText = document.getElementById('end-text');
      if (name === 'busted' && endTitle) {
        endTitle.textContent = 'BUSTED';
        if (endText) endText.textContent = 'The Harbor PD took you in. You lost $200 bail and woke up at the safehouse.';
      }
      if (name === 'wasted' && endTitle) {
        endTitle.textContent = 'WASTED';
        if (endText) endText.textContent = 'You got taken out. Marisol patched you up — minus $200 in hospital bills.';
      }
      if (name === 'ending' && endTitle) {
        endTitle.textContent = 'NEON HARBOR — COMPLETE';
        if (endText) endText.textContent = 'All eight jobs done. Dario is finished, and the Harbor is yours, Rook.';
      }
      var hud = document.getElementById('hud');
      if (hud) hud.style.display = name === 'playing' ? 'block' : 'none';
    };
    ui.start = function (cont) {
      ui.show('playing');
      if (ui.callbacks.start) ui.callbacks.start(cont);
    };
    ui.resume = function () {
      ui.show('playing');
      if (ui.callbacks.resume) ui.callbacks.resume();
    };
    ui.pause = function () {
      if (ui.screen === 'playing') ui.show('paused');
    };
    return ui;
  }

  global.NH.makeUI = makeUI;
  global.NH.loadSave = loadSave;
  global.NH.saveGame = saveGame;
})(window);
