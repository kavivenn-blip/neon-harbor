/* ============================================================
   Neon Harbor — game/src/combat.js
   Job: menembak, senjata, tracer, muzzle flash, ledakan, dan
   kill feed. Modul ini tidak menggambar dunia dan tidak
   memutuskan misi; ia hanya mengubah S.combat / S.goons /
   S.player.heat saat pemain menembak, dan membersihkan efek
   tembakan yang sudah kedaluwarsa tiap frame.
   Gaya: classic script, IIFE, 'use strict', var/function saja.
   Tanpa Math.random (pakai S.rng) dan tanpa Date.now — jam
   permainan diakumulasi dari dt di stageFire.
   ============================================================ */
(function () {
  'use strict';

  var H = window.Harbor || (window.Harbor = {});
  var C = H.Config || {};

  /* ----------------------------------------------------------
     Tabel senjata cadangan — dipakai hanya bila
     Harbor.Config.WEAPONS tidak tersedia. Bentuk tiap entri:
     { slot, key, name, damage, rate, range, ammo, reserve,
       owned, pellets }
     rate = tembakan per detik, range = meter, ammo = isi
     magasin awal, reserve = cadangan awal.
     ---------------------------------------------------------- */
  var FALLBACK_WEAPONS = [
    { slot: 0, key: 'fists',   name: 'Fists',   damage: 12, rate: 2.2, range: 2.2, ammo: Infinity, reserve: Infinity, owned: true,  pellets: 1 },
    { slot: 1, key: 'pistol',  name: 'Pistol',  damage: 22, rate: 3.0, range: 42,  ammo: 12, reserve: 60,  owned: true,  pellets: 1 },
    { slot: 2, key: 'smg',     name: 'SMG',     damage: 13, rate: 9.0, range: 34,  ammo: 30, reserve: 120, owned: false, pellets: 1 },
    { slot: 3, key: 'shotgun', name: 'Shotgun', damage: 16, rate: 1.1, range: 18,  ammo: 6,  reserve: 24,  owned: false, pellets: 6 },
    { slot: 4, key: 'grenade', name: 'Grenade', damage: 90, rate: 0.8, range: 26,  ammo: 3,  reserve: 6,   owned: false, pellets: 1 }
  ];

  /* Konstanta tempur. */
  var MELEE_RANGE = 2.2;
  var CONE_HALF = 0.38;        /* setengah sudut kerucut tembak (rad) */
  var CONE_SHOTGUN = 0.55;     /* shotgun menyebar lebih lebar */
  var TRACER_LIFE = 0.5;       /* detik tracer terlihat */
  var MUZZLE_LIFE = 0.08;      /* detik muzzle flash menyala */
  var BLAST_RADIUS = 8;        /* radius ledakan granat (m) */
  var BLAST_LIFE = 0.6;        /* detik bola ledakan terlihat */
  var HEAT_PER_SHOT = 6;       /* panas per tembakan */
  var RP_TAKEDOWN = 25;        /* RP per goon yang tumbang */
  var AUTO_FIRE_GAP = 0.6;     /* jeda tembak otomatis (detik) */
  var KILL_FEED_MAX = 3;

  /* Jam permainan internal (detik), diakumulasi dari dt. */
  var gameClock = 0;
  /* Mesh muzzle flash (dibuat malas saat tembakan pertama). */
  var muzzleMesh = null;
  /* Bola ledakan yang sedang mengembang. */
  var blasts = [];

  /* ----------------------------------------------------------
     Pembantu kecil.
     ---------------------------------------------------------- */
  function weaponList() {
    if (C.WEAPONS && C.WEAPONS.length) { return C.WEAPONS; }
    return FALLBACK_WEAPONS;
  }

  function heatPerStar() {
    if (C.WANTED && C.WANTED.heatPerStar) { return C.WANTED.heatPerStar; }
    return 20;
  }

  function maxStars() {
    if (C.WANTED && C.WANTED.maxStars) { return C.WANTED.maxStars; }
    return 5;
  }

  function heatPerShot() {
    if (C.WANTED && C.WANTED.heatPerShot) { return C.WANTED.heatPerShot; }
    return HEAT_PER_SHOT;
  }

  function rpTakedown() {
    if (C.RP_PAY && C.RP_PAY.takedown) { return C.RP_PAY.takedown; }
    return RP_TAKEDOWN;
  }

  function toast(S, text) {
    if (H.UI && typeof H.UI.showToast === 'function') {
      H.UI.showToast(S, text);
      return;
    }
    var el = document.getElementById('toast');
    if (el) {
      el.textContent = text;
      el.style.display = 'block';
    }
  }

  function playShot() {
    if (H.Sound && typeof H.Sound.shot === 'function') { H.Sound.shot(); }
  }

  function playBoom() {
    if (H.Sound && typeof H.Sound.explosion === 'function') { H.Sound.explosion(); }
  }

  function playClick() {
    if (H.Sound && typeof H.Sound.beep === 'function') { H.Sound.beep(140, 0.08); }
  }

  function addHeat(S, amount) {
    S.player.heat = (S.player.heat || 0) + amount;
    var stars = Math.floor(S.player.heat / heatPerStar());
    if (stars > maxStars()) { stars = maxStars(); }
    if (stars < 0) { stars = 0; }
    S.player.wanted = stars;
  }

  function angleDiff(a, b) {
    var d = a - b;
    while (d > Math.PI) { d -= Math.PI * 2; }
    while (d < -Math.PI) { d += Math.PI * 2; }
    return d;
  }

  function dist2D(ax, az, bx, bz) {
    var dx = ax - bx;
    var dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /* ----------------------------------------------------------
     currentWeapon(S) — spec senjata aktif dari Config.
     ---------------------------------------------------------- */
  function currentWeapon(S) {
    var list = weaponList();
    var slot = S.combat.weaponSlot;
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].slot === slot) { return list[i]; }
    }
    return list[0];
  }

  /* ----------------------------------------------------------
     switchWeapon(S, slot) — ganti slot bila senjata owned.
     ---------------------------------------------------------- */
  function switchWeapon(S, slot) {
    var list = weaponList();
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].slot === slot) {
        if (!list[i].owned) { return false; }
        S.combat.weaponSlot = slot;
        return true;
      }
    }
    return false;
  }

  /* ----------------------------------------------------------
     giveWeapon(S, key) — hadiah misi: buka senjata + isi
     ammo awal. Aman bila key tidak dikenal (no-op).
     ---------------------------------------------------------- */
  function giveWeapon(S, key) {
    var list = weaponList();
    var i, w;
    for (i = 0; i < list.length; i++) {
      if (list[i].key === key) {
        w = list[i];
        w.owned = true;
        if (S.combat.ammo) {
          S.combat.ammo[w.slot] = w.ammo;
        }
        toast(S, 'NEW WEAPON — ' + w.name);
        return true;
      }
    }
    return false;
  }

  /* ----------------------------------------------------------
     killFeedPush(S, text) — simpan maksimal 3 baris terakhir.
     ---------------------------------------------------------- */
  function killFeedPush(S, text) {
    if (!S.combat.killFeed) { S.combat.killFeed = []; }
    S.combat.killFeed.push(text);
    while (S.combat.killFeed.length > KILL_FEED_MAX) {
      S.combat.killFeed.shift();
    }
  }

  /* ----------------------------------------------------------
     dropGoon(S, goon) — goon tumbang: sembunyikan mesh,
     catat kill, beri RP, tambah panas.
     ---------------------------------------------------------- */
  function dropGoon(S, goon) {
    if (!goon.alive) { return; }
    goon.alive = false;
    goon.health = 0;
    if (goon.mesh) { goon.mesh.visible = false; }
    killFeedPush(S, 'Rook dropped a crewman');
    S.player.rp += rpTakedown();
    if (S.mission) { S.mission.kills = (S.mission.kills || 0) + 1; }
  }

  /* ----------------------------------------------------------
     hurtGoon(S, goon, damage) — beri damage; bila habis,
     tumbangkan.
     ---------------------------------------------------------- */
  function hurtGoon(S, goon, damage) {
    if (!goon.alive) { return; }
    goon.health -= damage;
    if (goon.health <= 0) { dropGoon(S, goon); }
  }

  /* ----------------------------------------------------------
     goonsInCone(S, range, halfAngle) — goon hidup di dalam
     kerucut arah hadap pemain, diurutkan dari yang terdekat.
     ---------------------------------------------------------- */
  function goonsInCone(S, range, halfAngle) {
    var out = [];
    var px = S.player.pos.x;
    var pz = S.player.pos.z;
    var heading = S.player.heading;
    var i, goon, d, bearing;
    if (!S.goons) { return out; }
    for (i = 0; i < S.goons.length; i++) {
      goon = S.goons[i];
      if (!goon || !goon.alive) { continue; }
      d = dist2D(px, pz, goon.pos.x, goon.pos.z);
      if (d > range) { continue; }
      bearing = Math.atan2(goon.pos.x - px, goon.pos.z - pz);
      if (Math.abs(angleDiff(bearing, heading)) > halfAngle) { continue; }
      out.push({ goon: goon, dist: d });
    }
    out.sort(function (a, b) { return a.dist - b.dist; });
    return out;
  }

  /* ----------------------------------------------------------
     makeTracer(S, from, to) — garis tipis dari pemain ke arah
     tembak, disimpan ke S.combat.tracers dengan umur 0.5 dtk.
     ---------------------------------------------------------- */
  function makeTracer(S, from, to) {
    var geo, mat, line, tracer;
    if (!S.scene || !window.THREE) { return; }
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(
      [from.x, from.y, from.z, to.x, to.y, to.z], 3));
    mat = new THREE.LineBasicMaterial({ color: 0xffe98a, transparent: true, opacity: 0.95 });
    line = new THREE.Line(geo, mat);
    S.scene.add(line);
    tracer = { line: line, life: TRACER_LIFE };
    if (!S.combat.tracers) { S.combat.tracers = []; }
    S.combat.tracers.push(tracer);
  }

  /* ----------------------------------------------------------
     shotEndPoint(S, range) — ujung garis tembak: posisi
     pemain + arah heading sejauh range, setinggi dada.
     ---------------------------------------------------------- */
  function shotEndPoint(S, range) {
    var h = S.player.heading;
    return {
      x: S.player.pos.x + Math.sin(h) * range,
      y: 1.3,
      z: S.player.pos.z + Math.cos(h) * range
    };
  }

  function muzzlePoint(S) {
    var h = S.player.heading;
    return {
      x: S.player.pos.x + Math.sin(h) * 0.9,
      y: 1.35,
      z: S.player.pos.z + Math.cos(h) * 0.9
    };
  }

  /* ----------------------------------------------------------
     showMuzzle(S) — nyalakan flash kuning di ujung laras.
     ---------------------------------------------------------- */
  function showMuzzle(S) {
    var p;
    if (!S.scene || !window.THREE) { return; }
    if (!muzzleMesh) {
      muzzleMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.95 })
      );
      S.scene.add(muzzleMesh);
    }
    p = muzzlePoint(S);
    muzzleMesh.position.set(p.x, p.y, p.z);
    muzzleMesh.visible = true;
    S.combat.muzzleUntil = gameClock + MUZZLE_LIFE;
  }

  function hideMuzzle() {
    if (muzzleMesh) { muzzleMesh.visible = false; }
  }

  /* ----------------------------------------------------------
     fireMelee(S) — tinju: goon hidup < 2.2 m kena damage.
     ---------------------------------------------------------- */
  function fireMelee(S) {
    var w = currentWeapon(S);
    var px = S.player.pos.x;
    var pz = S.player.pos.z;
    var i, goon, d, hitAny;
    hitAny = false;
    if (!S.goons) { return; }
    for (i = 0; i < S.goons.length; i++) {
      goon = S.goons[i];
      if (!goon || !goon.alive) { continue; }
      d = dist2D(px, pz, goon.pos.x, goon.pos.z);
      if (d <= MELEE_RANGE) {
        hurtGoon(S, goon, w.damage);
        hitAny = true;
      }
    }
    if (hitAny) { playShot(); }
    S.combat.lastShotAt = gameClock;
  }

  /* ----------------------------------------------------------
     fireGun(S, w) — pistol / SMG / shotgun: kurangi ammo,
     tracer, muzzle, damage ke goon dalam kerucut.
     ---------------------------------------------------------- */
  function fireGun(S, w) {
    var slot = w.slot;
    var ammo = S.combat.ammo ? S.combat.ammo[slot] : 0;
    var from, to, halfAngle, pellets, p, hits, target;
    if (!ammo || ammo <= 0) {
      playClick();
      toast(S, 'NO AMMO — ' + w.name);
      return;
    }
    if (S.combat.ammo) { S.combat.ammo[slot] = ammo - 1; }
    from = muzzlePoint(S);
    to = shotEndPoint(S, w.range);
    makeTracer(S, from, to);
    showMuzzle(S);
    playShot();
    addHeat(S, heatPerShot());
    halfAngle = (w.key === 'shotgun') ? CONE_SHOTGUN : CONE_HALF;
    pellets = w.pellets || 1;
    hits = goonsInCone(S, w.range, halfAngle);
    for (p = 0; p < pellets; p++) {
      if (!hits.length) { break; }
      /* Pellet pertama selalu kena yang terdekat; pellet
         berikut menyebar ke target berikutnya bila ada. */
      target = hits[Math.min(p, hits.length - 1)].goon;
      hurtGoon(S, target, w.damage);
    }
    S.combat.lastShotAt = gameClock;
  }

  /* ----------------------------------------------------------
     fireGrenade(S, w) — ledakan radius 8 m di titik jatuh
     (26 m ke arah hadap), damage 90 ke semua goon di radius.
     ---------------------------------------------------------- */
  function fireGrenade(S, w) {
    var slot = w.slot;
    var ammo = S.combat.ammo ? S.combat.ammo[slot] : 0;
    var h = S.player.heading;
    var cx, cz, i, goon, d, blast;
    if (!ammo || ammo <= 0) {
      playClick();
      toast(S, 'NO AMMO — Grenade');
      return;
    }
    if (S.combat.ammo) { S.combat.ammo[slot] = ammo - 1; }
    cx = S.player.pos.x + Math.sin(h) * 12;
    cz = S.player.pos.z + Math.cos(h) * 12;
    playBoom();
    addHeat(S, heatPerShot() * 2);
    if (!S.goons) { S.goons = []; }
    for (i = 0; i < S.goons.length; i++) {
      goon = S.goons[i];
      if (!goon || !goon.alive) { continue; }
      d = dist2D(cx, cz, goon.pos.x, goon.pos.z);
      if (d <= BLAST_RADIUS) { hurtGoon(S, goon, w.damage); }
    }
    if (S.scene && window.THREE) {
      blast = new THREE.Mesh(
        new THREE.SphereGeometry(BLAST_RADIUS, 14, 10),
        new THREE.MeshBasicMaterial({
          color: 0xff9a3d, transparent: true, opacity: 0.55
        })
      );
      blast.position.set(cx, 1.2, cz);
      blast.scale.set(0.15, 0.15, 0.15);
      S.scene.add(blast);
      blasts.push({ mesh: blast, life: BLAST_LIFE, max: BLAST_LIFE });
    }
    S.combat.lastShotAt = gameClock;
  }

  /* ----------------------------------------------------------
     fire(S) — tembak dengan senjata aktif.
     ---------------------------------------------------------- */
  function fire(S) {
    var w = currentWeapon(S);
    if (!S.player.alive) { return; }
    if (w.slot === 0) {
      fireMelee(S);
      return;
    }
    if (w.key === 'grenade') {
      fireGrenade(S, w);
      return;
    }
    fireGun(S, w);
  }

  /* ----------------------------------------------------------
     pruneTracers(S, dt) — perbarui / hapus tracer kedaluwarsa.
     ---------------------------------------------------------- */
  function pruneTracers(S, dt) {
    var list = S.combat.tracers;
    var i, t;
    if (!list) { return; }
    for (i = list.length - 1; i >= 0; i--) {
      t = list[i];
      t.life -= dt;
      if (t.life <= 0) {
        if (S.scene && t.line) { S.scene.remove(t.line); }
        if (t.line && t.line.geometry) { t.line.geometry.dispose(); }
        if (t.line && t.line.material) { t.line.material.dispose(); }
        list.splice(i, 1);
      }
    }
  }

  /* ----------------------------------------------------------
     updateBlasts(S, dt) — kembangkan lalu hapus bola ledakan.
     ---------------------------------------------------------- */
  function updateBlasts(S, dt) {
    var i, b, k;
    for (i = blasts.length - 1; i >= 0; i--) {
      b = blasts[i];
      b.life -= dt;
      k = 1 - (b.life / b.max);
      if (k < 0) { k = 0; }
      if (k > 1) { k = 1; }
      b.mesh.scale.set(0.15 + k, 0.15 + k, 0.15 + k);
      b.mesh.material.opacity = 0.55 * (1 - k);
      if (b.life <= 0) {
        if (S.scene) { S.scene.remove(b.mesh); }
        if (b.mesh.geometry) { b.mesh.geometry.dispose(); }
        if (b.mesh.material) { b.mesh.material.dispose(); }
        blasts.splice(i, 1);
      }
    }
  }

  /* ----------------------------------------------------------
     stageFire(dt, S) — dipanggil tiap frame oleh main.js:
     tembak otomatis bila S.flags.autoFire, bersihkan tracer,
     padamkan muzzle flash bila waktunya lewat.
     ---------------------------------------------------------- */
  function stageFire(dt, S) {
    var w;
    gameClock += dt;
    if (S.flags && S.flags.autoFire && S.player.alive) {
      w = currentWeapon(S);
      if (w.slot !== 0 && gameClock - (S.combat.lastShotAt || 0) >= AUTO_FIRE_GAP) {
        fire(S);
      }
    }
    pruneTracers(S, dt);
    updateBlasts(S, dt);
    if (muzzleMesh && gameClock > (S.combat.muzzleUntil || 0)) {
      hideMuzzle();
    }
  }

  /* ----------------------------------------------------------
     Ekspos API.
     ---------------------------------------------------------- */
  H.Combat = {
    fire: fire,
    stageFire: stageFire,
    currentWeapon: currentWeapon,
    switchWeapon: switchWeapon,
    giveWeapon: giveWeapon
  };
})();
