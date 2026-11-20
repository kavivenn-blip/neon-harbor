// hud.js — the HUD: health/armor bars, cash, wanted stars, weapon/ammo,
// mission objective with distance, speedometer, radio name, and a live
// minimap (roads, player heading, waypoint, police, collectibles).
(function (global) {
  'use strict';

  function makeHUD() {
    var root = document.getElementById('hud');
    var el = {};
    ['health', 'armor', 'cash', 'stars', 'weapon', 'ammo', 'objective', 'speed', 'radio', 'dialog', 'toast'].forEach(function (id) {
      el[id] = document.getElementById(id);
    });
    var map = document.getElementById('minimap');
    var mctx = map.getContext('2d');
    return { root: root, el: el, map: map, mctx: mctx, toastTimer: 0 };
  }

  function starsHTML(wanted) {
    var s = '';
    for (var i = 0; i < 5; i++) s += '<span class="star' + (i < wanted ? ' on' : '') + '">★</span>';
    return s;
  }

  function updateHUD(h, s) {
    var el = h.el;
    el.health.style.width = Math.max(0, s.health) + '%';
    el.armor.style.width = Math.max(0, s.armor) + '%';
    el.cash.textContent = '$' + Math.floor(s.cash).toLocaleString('en-US');
    el.stars.innerHTML = starsHTML(s.wanted);
    el.weapon.textContent = s.weaponName;
    el.ammo.textContent = s.reloading ? 'RELOADING…' : (s.ammo + ' / ' + s.reserve);
    el.objective.textContent = s.objective + (s.objDist != null ? ' — ' + Math.round(s.objDist) + 'm' : '');
    el.speed.textContent = s.inCar ? Math.round(Math.abs(s.speed) * 3.6) + ' km/h' : '';
    el.speed.style.display = s.inCar ? 'block' : 'none';
    el.radio.textContent = s.inCar ? '♪ ' + s.radio : '';
    if (s.dialog) {
      el.dialog.style.display = 'block';
      el.dialog.innerHTML = '<b>' + s.dialog.who + '</b> ' + s.dialog.text;
    } else {
      el.dialog.style.display = 'none';
    }
    if (s.toast) {
      el.toast.style.display = 'block';
      el.toast.textContent = s.toast;
      h.toastTimer = 2.5;
    } else if (h.toastTimer > 0) {
      h.toastTimer -= 1 / 60;
      if (h.toastTimer <= 0) el.toast.style.display = 'none';
    }
    drawMinimap(h, s);
  }

  function drawMinimap(h, s) {
    var ctx = h.mctx, W = 180, H = 180;
    var scale = W / 520; // world -260..260
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(10, 16, 24, 0.82)';
    ctx.fillRect(0, 0, W, H);
    var toX = function (x) { return (x + 260) * scale; };
    var toY = function (z) { return (z + 260) * scale; };
    // Water (west) + beach.
    ctx.fillStyle = '#2e6f8e'; ctx.fillRect(0, 0, 18, H);
    ctx.fillStyle = '#d9c28a'; ctx.fillRect(18, 0, 10, H);
    // Roads.
    ctx.strokeStyle = '#5a6068'; ctx.lineWidth = 2;
    for (var i = 0; i <= 9; i++) {
      var c = -216 + i * 48;
      ctx.beginPath(); ctx.moveTo(toX(c), 0); ctx.lineTo(toX(c), H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, toY(c)); ctx.lineTo(W, toY(c)); ctx.stroke();
    }
    // Docks.
    ctx.fillStyle = '#6a6a6a'; ctx.fillRect(toX(-150), toY(150), 90 * scale, 80 * scale);
    // Waypoint (yellow diamond).
    if (s.waypoint) {
      ctx.fillStyle = '#ffd700';
      var wx = toX(s.waypoint.x), wy = toY(s.waypoint.z);
      ctx.beginPath();
      ctx.moveTo(wx, wy - 6); ctx.lineTo(wx + 6, wy); ctx.lineTo(wx, wy + 6); ctx.lineTo(wx - 6, wy);
      ctx.closePath(); ctx.fill();
    }
    // Collectibles (small green dots).
    if (s.packages) {
      ctx.fillStyle = '#4ade80';
      s.packages.forEach(function (p) {
        ctx.fillRect(toX(p.x) - 1, toY(p.z) - 1, 3, 3);
      });
    }
    // Police (red dots).
    if (s.police) {
      ctx.fillStyle = '#ff4444';
      s.police.forEach(function (p) {
        ctx.beginPath(); ctx.arc(toX(p.x), toY(p.z), 3, 0, 7); ctx.fill();
      });
    }
    // Player arrow (white, rotated by heading).
    var px = toX(s.x), py = toY(s.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - s.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  global.NH.makeHUD = makeHUD;
  global.NH.updateHUD = updateHUD;
})(window);
