/* ============================================================
   Neon Harbor — game/src/hud.js
   Job: semua panel layar — header misi, dispatch polisi, slot
   senjata, rank, health/armor, cash, bintang wanted, lokasi,
   jam, radio, speedometer, minimap bundar, dialog berpotret,
   kill feed, banner air unit, dan fps.
   Elemen DOM di-cache sekali di build(); refresh() hanya
   menulis textContent / style, dan minimap di-throttle
   ~0.25 detik. Dialog memakai performance.now untuk masa
   tampil ~6 detik (bukan Date.now).
   Gaya: classic script, IIFE, 'use strict', var/function saja.
   ============================================================ */
(function () {
  'use strict';

  var H = window.Harbor || (window.Harbor = {});
  var C = H.Config || {};

  /* ----------------------------------------------------------
     Daftar ID DOM yang dikelola modul ini. ID-ID ini ditulis
     parent di index.html; jangan pakai ID lain.
     ---------------------------------------------------------- */
  var EL_IDS = [
    'hud', 'mission-title', 'mission-stage', 'mission-progress',
    'mission-timer', 'mission-objective', 'mission-next',
    'dispatch-list', 'weapon-slots', 'rank-name', 'rank-bar',
    'rp-text', 'health-bar', 'health-text', 'armor-bar',
    'armor-text', 'cash-text', 'stars', 'wanted-text',
    'location-text', 'clock-text', 'radio-text', 'speed-text',
    'car-text', 'car-cond', 'minimap', 'dialog', 'dialog-name',
    'dialog-role', 'dialog-text', 'dialog-portrait', 'killfeed',
    'airunit', 'toast', 'fps-text', 'overlay-start',
    'overlay-pause', 'overlay-over'
  ];

  /* Cache elemen + konteks minimap. */
  var el = {};
  var mapCtx = null;
  var mapSize = 160;

  /* Throttle internal. Diisi penuh supaya refresh pertama langsung
     menggambar minimap + dispatch — di mesin lambat (1-3 fps) frame
     pertama adalah frame screenshot, jadi throttle tidak boleh
     menunda gambar pertama sampai belasan frame kemudian. */
  var mapAcc = 10;
  var dispatchAcc = 10;
  var MAP_INTERVAL = 0.25;
  var DISPATCH_INTERVAL = 0.5;

  /* Tanda tangan render terakhir, supaya innerHTML tidak
     ditulis ulang tiap frame bila isinya sama. */
  var lastWeaponSig = '';
  var lastDispatchSig = '';
  var lastFeedSig = '';

  /* Dialog: performance.now() saat dialog harus hilang. */
  var dialogHideAt = 0;

  /* ----------------------------------------------------------
     Tabel rank cadangan (dipakai bila Config.rankFor tak ada).
     ---------------------------------------------------------- */
  var FALLBACK_RANKS = [
    { name: 'GREENHORN', min: 0 },
    { name: 'WHEELMAN', min: 1000 },
    { name: 'HUSTLER', min: 2500 },
    { name: 'FIXER', min: 5000 },
    { name: 'SHOT CALLER', min: 9000 },
    { name: 'HARBOR KING', min: 15000 }
  ];

  var FALLBACK_WEAPONS = [
    { slot: 0, key: 'fists', name: 'Fists', ammo: Infinity, owned: true },
    { slot: 1, key: 'pistol', name: 'Pistol', ammo: 12, owned: true },
    { slot: 2, key: 'smg', name: 'SMG', ammo: 30, owned: false },
    { slot: 3, key: 'shotgun', name: 'Shotgun', ammo: 6, owned: false },
    { slot: 4, key: 'grenade', name: 'Grenade', ammo: 3, owned: false }
  ];

  /* ----------------------------------------------------------
     Pembantu kecil.
     ---------------------------------------------------------- */
  function $(id) { return el[id] || null; }

  function setText(id, text) {
    var node = $(id);
    if (node && node.textContent !== text) { node.textContent = text; }
  }

  function setWidth(id, pct) {
    var node = $(id);
    var v = Math.max(0, Math.min(100, pct));
    if (node) { node.style.width = v + '%'; }
  }

  function show(node, on) {
    if (node) { node.style.display = on ? 'block' : 'none'; }
  }

  function money(n) {
    var s = '' + Math.floor(n);
    var out = '';
    var i;
    while (s.length > 3) {
      out = ',' + s.slice(-3) + out;
      s = s.slice(0, -3);
    }
    out = s + out;
    return '$' + out;
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function rankInfo(rp) {
    var r = null;
    var next = null;
    var i, list;
    if (typeof C.rankFor === 'function') {
      try { r = C.rankFor(rp); } catch (e) { r = null; }
    }
    if (!r) {
      list = (C.RANKS && C.RANKS.length) ? C.RANKS : FALLBACK_RANKS;
      r = list[0];
      for (i = 0; i < list.length; i++) {
        if (rp >= (list[i].min || 0)) { r = list[i]; }
      }
    }
    if (typeof H.rankNext === 'function') {
      try { next = H.rankNext(rp); } catch (e) { next = null; }
    } else if (typeof C.rankNext === 'function') {
      try { next = C.rankNext(rp); } catch (e) { next = null; }
    }
    if (!next) {
      list = (C.RANKS && C.RANKS.length) ? C.RANKS : FALLBACK_RANKS;
      next = null;
      for (i = 0; i < list.length; i++) {
        if ((list[i].min || 0) > rp) { next = list[i]; break; }
      }
    }
    // C.rankNext mengembalikan ANGKA (RP yang kurang), bukan tier.
    // Ubah angka itu menjadi tier-nya supaya pemanggil bisa membaca
    // .min dan .name; tanpa ini rp-text menampilkan "undefined".
    if (typeof next === 'number') {
      var targetMin = rp + next;
      var found = null;
      list = (C.RANKS && C.RANKS.length) ? C.RANKS : FALLBACK_RANKS;
      for (i = 0; i < list.length; i++) {
        if ((list[i].min || 0) === targetMin) { found = list[i]; break; }
      }
      if (!found) {
        for (i = 0; i < list.length; i++) {
          if ((list[i].min || 0) > rp) { found = list[i]; break; }
        }
      }
      next = found;
    }
    return { rank: r, next: next };
  }

  function weaponList() {
    if (C.WEAPONS && C.WEAPONS.length) { return C.WEAPONS; }
    return FALLBACK_WEAPONS;
  }

  function districtAt(x, z) {
    if (typeof H.districtAt === 'function') {
      try { return H.districtAt(x, z); } catch (e) { /* jatuh ke bawah */ }
    }
    if (x < -100 && z > 0) { return 'Sunset Strand'; }
    if (x < -100) { return 'Harbor Green'; }
    if (x > 60 && z > 60) { return 'Palm Court'; }
    if (z > 100) { return 'Cargo Pier'; }
    if (x > 40 && z < -40) { return 'Harbor Towers'; }
    return 'Downtown';
  }

  function roadName(x, z) {
    /* Nama jalan terdekat, disederhanakan: garis jalan sumbu-x
       disebut Avenue, sumbu-z disebut Street. */
    var nearX = Math.abs(Math.abs(x) % 40) < 6 || Math.abs(Math.abs(x) % 40) > 34;
    var nearZ = Math.abs(Math.abs(z) % 40) < 6 || Math.abs(Math.abs(z) % 40) > 34;
    if (nearX && !nearZ) { return 'Harbor Ave'; }
    if (nearZ && !nearX) { return 'Strand St'; }
    if (x < -120) { return 'Beach Rd'; }
    if (z > 120) { return 'Pier Rd'; }
    return 'Central Ave';
  }

  function currentSong() {
    if (H.Sound && typeof H.Sound.currentSong === 'function') {
      try { return H.Sound.currentSong(); } catch (e) { /* jatuh ke bawah */ }
    }
    return { title: 'Neon Tide', artist: 'The Breakers' };
  }

  function stationName() {
    if (C.RADIO && C.RADIO.station) { return C.RADIO.station; }
    return 'Harbor FM 101.3';
  }

  /* ----------------------------------------------------------
     build(S) — cache semua elemen + konteks canvas minimap.
     ---------------------------------------------------------- */
  function build(S) {
    var i, node, canvas;
    for (i = 0; i < EL_IDS.length; i++) {
      el[EL_IDS[i]] = document.getElementById(EL_IDS[i]);
    }
    canvas = el.minimap;
    if (canvas && canvas.getContext) {
      mapCtx = canvas.getContext('2d');
      mapSize = canvas.width || 160;
      if (!canvas.width) { canvas.width = 160; canvas.height = 160; }
      mapSize = canvas.width;
    }
    return true;
  }

  /* ----------------------------------------------------------
     portraitSVG(key) — potret SVG untuk dialog.
     'marisol': perempuan, rambut gelap, anting emas.
     'dario': pria, bekas luka, jas.
     'rook': topi merah, jaket teal.
     ---------------------------------------------------------- */
  function portraitSVG(key) {
    var k = key || 'rook';
    if (k === 'marisol') {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">' +
        '<rect width="96" height="96" fill="#2b1e3a"/>' +
        '<circle cx="48" cy="40" r="26" fill="#1a1210"/>' +
        '<circle cx="48" cy="46" r="18" fill="#e8b98d"/>' +
        '<path d="M30 46 Q30 22 48 20 Q66 22 66 46 L64 34 Q58 26 48 26 Q38 26 32 34 Z" fill="#1a1210"/>' +
        '<circle cx="41" cy="44" r="2.4" fill="#241a12"/>' +
        '<circle cx="55" cy="44" r="2.4" fill="#241a12"/>' +
        '<path d="M42 56 Q48 60 54 56" stroke="#8a4a3a" stroke-width="2" fill="none"/>' +
        '<circle cx="29" cy="52" r="3" fill="#ffd34d"/>' +
        '<circle cx="67" cy="52" r="3" fill="#ffd34d"/>' +
        '<path d="M22 96 L34 70 Q48 62 62 70 L74 96 Z" fill="#7a2e6d"/>' +
        '</svg>';
    }
    if (k === 'dario') {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">' +
        '<rect width="96" height="96" fill="#1c222b"/>' +
        '<circle cx="48" cy="44" r="18" fill="#d9a37e"/>' +
        '<path d="M30 38 Q32 24 48 24 Q64 24 66 38 L64 30 Q48 26 34 32 Z" fill="#3a3a3a"/>' +
        '<path d="M40 36 L46 52" stroke="#a33333" stroke-width="2.4"/>' +
        '<circle cx="41" cy="44" r="2.4" fill="#1a1a1a"/>' +
        '<circle cx="55" cy="44" r="2.4" fill="#1a1a1a"/>' +
        '<path d="M42 58 Q48 56 54 58" stroke="#5a3a2a" stroke-width="2" fill="none"/>' +
        '<path d="M20 96 L34 68 L44 74 L48 68 L52 74 L62 68 L76 96 Z" fill="#23232e"/>' +
        '<rect x="44" y="72" width="8" height="24" fill="#c22e2e"/>' +
        '</svg>';
    }
    /* rook — default */
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">' +
      '<rect width="96" height="96" fill="#0e2f33"/>' +
      '<circle cx="48" cy="46" r="18" fill="#e8b98d"/>' +
      '<path d="M28 40 Q48 18 68 40 L66 32 Q48 22 30 32 Z" fill="#c22e2e"/>' +
      '<rect x="26" y="36" width="44" height="7" rx="3" fill="#c22e2e"/>' +
      '<circle cx="41" cy="46" r="2.4" fill="#1a1a1a"/>' +
      '<circle cx="55" cy="46" r="2.4" fill="#1a1a1a"/>' +
      '<path d="M42 58 Q48 61 54 58" stroke="#8a4a3a" stroke-width="2" fill="none"/>' +
      '<path d="M20 96 L32 68 Q48 60 64 68 L76 96 Z" fill="#0f766e"/>' +
      '<rect x="44" y="70" width="8" height="26" fill="#e8e8e8"/>' +
      '</svg>';
  }

  /* ----------------------------------------------------------
     setDialog(S, dlg) — tampilkan kotak dialog ~6 detik.
     dlg = { name, role, text, key }.
     ---------------------------------------------------------- */
  function setDialog(S, dlg) {
    var box = $('dialog');
    if (!box) { return; }
    setText('dialog-name', dlg.name || '');
    setText('dialog-role', dlg.role || '');
    setText('dialog-text', dlg.text || '');
    var portrait = $('dialog-portrait');
    if (portrait) {
      portrait.innerHTML = portraitSVG(dlg.key || 'rook');
    }
    box.style.display = 'block';
    dialogHideAt = performance.now() + 6000;
    if (S) { S.dialogUntil = dialogHideAt; }
  }

  /* ----------------------------------------------------------
     clearDialog(S) — sembunyikan kotak dialog.
     ---------------------------------------------------------- */
  function clearDialog(S) {
    var box = $('dialog');
    show(box, false);
    dialogHideAt = 0;
    if (S) { S.dialogUntil = 0; }
  }

  /* ----------------------------------------------------------
     drawMinimap(S) — minimap bundar: air, pasir, kota, jalan,
     marker misi, pemain, traffic, polisi, heli, huruf N.
     ---------------------------------------------------------- */
  function drawMinimap(S) {
    var canvas, ctx, size, half, i, p, mx, mz;
    canvas = el.minimap;
    ctx = mapCtx;
    if (!canvas || !ctx) { return; }
    size = mapSize;
    half = size / 2;
    function toMap(x, z) {
      return {
        x: half + (x / 200) * (half - 6),
        y: half + (z / 200) * (half - 6)
      };
    }
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    /* Clip lingkaran. */
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.clip();
    /* Latar: air di barat/selatan, pasir di tepi, kota di tengah. */
    ctx.fillStyle = '#164e6e';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(0, size - 26, 34, 26);
    ctx.fillRect(0, 0, 16, size);
    ctx.fillStyle = '#2e2a33';
    ctx.fillRect(16, 6, size - 22, size - 12);
    /* Jalan: dari S.city.roads bila ada, fallback grid. */
    ctx.strokeStyle = '#5a5560';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (S.city && S.city.roads && S.city.roads.length) {
      for (i = 0; i < S.city.roads.length; i++) {
        p = S.city.roads[i];
        mx = toMap(p.x1, p.z1);
        mz = toMap(p.x2, p.z2);
        ctx.moveTo(mx.x, mx.y);
        ctx.lineTo(mz.x, mz.y);
      }
    } else {
      for (i = -160; i <= 160; i += 40) {
        mx = toMap(i, -200);
        mz = toMap(i, 200);
        ctx.moveTo(mx.x, mx.y);
        ctx.lineTo(mz.x, mz.y);
        mx = toMap(-200, i);
        mz = toMap(200, i);
        ctx.moveTo(mx.x, mx.y);
        ctx.lineTo(mz.x, mz.y);
      }
    }
    ctx.stroke();
    /* Marker misi (kuning, berlian). */
    if (H.Missions && typeof H.Missions.current === 'function') {
      try {
        var cur = H.Missions.current(S);
        if (cur && cur.target) {
          p = toMap(cur.target.x, cur.target.z);
          ctx.fillStyle = '#ffd34d';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - 6);
          ctx.lineTo(p.x + 5, p.y);
          ctx.lineTo(p.x, p.y + 6);
          ctx.lineTo(p.x - 5, p.y);
          ctx.closePath();
          ctx.fill();
        }
      } catch (e) { /* minimap tetap jalan tanpa marker */ }
    }
    /* Traffic (titik hijau). */
    ctx.fillStyle = '#37d67a';
    if (S.cars) {
      for (i = 0; i < S.cars.length; i++) {
        if (!S.cars[i] || !S.cars[i].pos) { continue; }
        p = toMap(S.cars[i].pos.x, S.cars[i].pos.z);
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
    }
    if (S.peds) {
      for (i = 0; i < S.peds.length; i++) {
        if (!S.peds[i] || !S.peds[i].pos) { continue; }
        p = toMap(S.peds[i].pos.x, S.peds[i].pos.z);
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
    }
    /* Polisi (titik biru). */
    ctx.fillStyle = '#4da3ff';
    if (S.police && S.police.units) {
      for (i = 0; i < S.police.units.length; i++) {
        if (!S.police.units[i] || !S.police.units[i].pos) { continue; }
        p = toMap(S.police.units[i].pos.x, S.police.units[i].pos.z);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    /* Heli (titik merah). */
    if (S.police && S.police.heli && S.police.heli.pos) {
      p = toMap(S.police.heli.pos.x, S.police.heli.pos.z);
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    /* Pemain (panah putih, ikut heading). */
    p = toMap(S.player.pos.x, S.player.pos.z);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(S.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    /* Bingkai lingkaran + huruf N. */
    ctx.restore();
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', half, 13);
  }

  /* ----------------------------------------------------------
     refreshDispatch(S) — panel dispatch dari
     Harbor.Police.dispatchUnits(S), di-throttle 0.5 detik.
     Baris: 'SIGN — ROLE — 123m'.
     ---------------------------------------------------------- */
  function refreshDispatch(S) {
    var node = $('dispatch-list');
    var units = null;
    var html = '';
    var sig = '';
    var i, u;
    if (!node) { return; }
    if (H.Police && typeof H.Police.dispatchUnits === 'function') {
      try { units = H.Police.dispatchUnits(S); } catch (e) { units = null; }
    }
    if (!units || !units.length) {
      sig = 'none';
      html = '<div class="dispatch-row">NO ACTIVE UNITS</div>';
    } else {
      for (i = 0; i < units.length; i++) {
        u = units[i];
        sig += (u.sign || u.callsign || '?') + '|';
        html += '<div class="dispatch-row">' +
          (u.sign || u.callsign || 'UNIT') + ' — ' +
          (u.role || 'PATROL') + ' — ' +
          Math.round(u.distM || u.dist || u.distance || 0) + 'm</div>';
      }
    }
    if (sig !== lastDispatchSig) {
      node.innerHTML = html;
      lastDispatchSig = sig;
    }
  }

  /* ----------------------------------------------------------
     refreshWeapons(S) — 5 slot senjata: ikon + nama + ammo
     atau LOCKED. Hanya ditulis ulang bila tanda tangannya
     berubah.
     ---------------------------------------------------------- */
  function refreshWeapons(S) {
    var node = $('weapon-slots');
    var list = weaponList();
    var icons = ['\u270A', '\u25CF', '\u2261', '\u25C9', '\u25B2'];
    var html = '';
    var sig = '';
    var i, w, ammo, active;
    if (!node) { return; }
    for (i = 0; i < list.length; i++) {
      w = list[i];
      active = (S.combat.weaponSlot === w.slot);
      if (w.owned) {
        ammo = S.combat.ammo ? S.combat.ammo[w.slot] : w.ammo;
        if (ammo === Infinity || ammo === undefined || ammo === null) {
          ammo = '\u221E';
        }
        sig += w.slot + ':' + ammo + (active ? '*' : '') + '|';
        html += '<div class="weapon-slot' + (active ? ' active' : '') + '">' +
          '<span class="w-icon">' + icons[w.slot] + '</span> ' +
          '<span class="w-name">' + w.name + '</span> ' +
          '<span class="w-ammo">' + ammo + '</span></div>';
      } else {
        sig += w.slot + ':L|';
        html += '<div class="weapon-slot locked">' +
          '<span class="w-icon">' + icons[w.slot] + '</span> ' +
          '<span class="w-name">' + w.name + '</span> ' +
          '<span class="w-ammo">LOCKED</span></div>';
      }
    }
    if (sig !== lastWeaponSig) {
      node.innerHTML = html;
      lastWeaponSig = sig;
    }
  }

  /* ----------------------------------------------------------
     refreshKillfeed(S) — 3 baris terakhir kill feed.
     ---------------------------------------------------------- */
  function refreshKillfeed(S) {
    var node = $('killfeed');
    var feed = S.combat.killFeed || [];
    var html = '';
    var sig = '';
    var i, start;
    if (!node) { return; }
    start = Math.max(0, feed.length - 3);
    for (i = start; i < feed.length; i++) {
      sig += feed[i] + '|';
      html += '<div class="feed-row">' + feed[i] + '</div>';
    }
    if (sig !== lastFeedSig) {
      node.innerHTML = html;
      lastFeedSig = sig;
    }
  }

  /* ----------------------------------------------------------
     refresh(S) — perbarui SEMUA panel dari S. Dipanggil tiap
     frame; teks ditulis tiap frame, minimap ~0.25 dtk,
     dispatch ~0.5 dtk.
     ---------------------------------------------------------- */
  function refresh(S) {
    var dt = 0.016;
    var cur = null;
    var stage = null;
    var info, song, kmh, hh, mm, wanted, starsText, i;
    var veh = S.player.vehicle;
    mapAcc += dt;
    dispatchAcc += dt;

    /* --- header misi --- */
    if (H.Missions && typeof H.Missions.current === 'function') {
      try { cur = H.Missions.current(S); } catch (e) { cur = null; }
    }
    if (cur) {
      setText('mission-title', cur.title.toUpperCase());
      setText('mission-stage', 'STAGE ' + cur.stage + '/' + cur.total);
      setWidth('mission-progress', cur.progress01 * 100);
      if (cur.timer !== null && cur.timer !== undefined) {
        setText('mission-timer', 'TIME ' + Math.floor(cur.timer / 60) + ':' + pad2(cur.timer % 60));
      } else {
        setText('mission-timer', '');
      }
      setText('mission-objective', cur.next);
      setText('mission-next', 'NEXT — ' + (cur.following || cur.next));
    } else if (H.Missions && typeof H.Missions.missionStage === 'function') {
      try { stage = H.Missions.missionStage(S); } catch (e) { stage = null; }
      if (stage) {
        setText('mission-stage', 'STAGE ' + stage.stage + '/' + stage.total);
        setText('mission-next', 'NEXT — ' + stage.next);
      }
    }

    /* --- dispatch --- */
    if (dispatchAcc >= DISPATCH_INTERVAL) {
      dispatchAcc = 0;
      refreshDispatch(S);
    }

    /* --- slot senjata --- */
    refreshWeapons(S);

    /* --- rank --- */
    info = rankInfo(S.player.rp || 0);
    setText('rank-name', info.rank ? info.rank.name : 'GREENHORN');
    if (info.next) {
      setText('rp-text', 'RP ' + Math.floor(S.player.rp || 0) + ' / ' + info.next.min);
      var base = info.rank ? (info.rank.min || 0) : 0;
      var span = info.next.min - base;
      setWidth('rank-bar', span > 0 ? ((S.player.rp - base) / span) * 100 : 100);
    } else {
      setText('rp-text', 'RP ' + Math.floor(S.player.rp || 0) + ' — MAX RANK');
      setWidth('rank-bar', 100);
    }

    /* --- health / armor --- */
    setWidth('health-bar', S.player.health);
    setText('health-text', Math.max(0, Math.round(S.player.health)) + '');
    setWidth('armor-bar', S.player.armor);
    setText('armor-text', Math.max(0, Math.round(S.player.armor)) + '');

    /* --- cash --- */
    setText('cash-text', money(S.player.cash));

    /* --- wanted --- */
    wanted = S.player.wanted || 0;
    starsText = '';
    for (i = 0; i < 5; i++) {
      starsText += (i < wanted) ? '\u2605' : '\u2606';
    }
    setText('stars', starsText);
    setText('wanted-text', wanted > 0 ? ('WANTED ' + wanted) : 'CLEAR');

    /* --- lokasi + jam --- */
    setText('location-text',
      districtAt(S.player.pos.x, S.player.pos.z) + ' \u00B7 ' +
      roadName(S.player.pos.x, S.player.pos.z));
    hh = Math.floor((S.minutes || 0) / 60) % 24;
    mm = Math.floor(S.minutes || 0) % 60;
    setText('clock-text', 'DAY ' + (S.day || 1) + ' \u00B7 ' + pad2(hh) + ':' + pad2(mm));

    /* --- radio --- */
    song = currentSong();
    setText('radio-text', stationName() + ' \u2014 ' + song.title + ' — ' + song.artist);

    /* --- speed + mobil --- */
    kmh = Math.round(Math.abs(S.player.speed || 0) * 3.6);
    setText('speed-text', kmh + ' KM/H');
    if (veh && veh.model) {
      setText('car-text', veh.model.name || 'Car');
      setText('car-cond', Math.round(veh.condition || 100) + '%');
    } else {
      setText('car-text', 'ON FOOT');
      setText('car-cond', '');
    }

    /* --- dialog: sembunyikan bila masa tampil lewat --- */
    if (dialogHideAt && performance.now() > dialogHideAt) {
      clearDialog(S);
    }

    /* --- kill feed --- */
    refreshKillfeed(S);

    /* --- banner air unit --- */
    show($('airunit'), !!(S.police && S.police.heli));

    /* --- fps --- */
    setText('fps-text', Math.round(S.fps || 0) + ' FPS');

    /* --- minimap (throttle) --- */
    if (mapAcc >= MAP_INTERVAL) {
      mapAcc = 0;
      drawMinimap(S);
    }
  }

  /* ----------------------------------------------------------
     Ekspos API.
     ---------------------------------------------------------- */
  H.HUD = {
    build: build,
    refresh: refresh,
    drawMinimap: drawMinimap,
    portraitSVG: portraitSVG,
    setDialog: setDialog,
    clearDialog: clearDialog
  };
})();
