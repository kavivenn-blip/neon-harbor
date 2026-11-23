/* ============================================================
   Neon Harbor — game/src/missions.js
   Job: daftar 8 misi cerita + mesin langkah misi + paket liar.
   Modul ini TIDAK tahu cara menggambar kota atau menggerakkan
   pemain; ia hanya membaca S (state sesi) dan memutuskan apakah
   langkah yang sedang berjalan sudah selesai, lalu membayar
   hadiahnya. Semua jarak diukur di bidang XZ.
   Gaya: classic script, IIFE, 'use strict', var/function saja.
   ============================================================ */
(function () {
  'use strict';

  var H = window.Harbor || (window.Harbor = {});
  var C = H.Config || {};

  /* ----------------------------------------------------------
     Tabel tempat cadangan. Dipakai hanya bila Harbor.Config
     belum menyediakan placeByName / PLACES (misalnya saat
     modul dimuat sebelum config). Koordinatnya sama dengan
     yang ditulis di config: sudut kota -200..200.
     ---------------------------------------------------------- */
  var FALLBACK_PLACES = {
    pierGate:        { x: -36,  z: 186,  label: 'Cargo Pier Gate' },
    containerYard:   { x: 24,   z: 196,  label: 'Container Yard' },
    palmGarage:      { x: 128,  z: -118, label: 'Palm Court Garage' },
    strandPromenade: { x: -192, z: 36,   label: 'Sunset Strand' },
    towerPlaza:      { x: 64,   z: -64,  label: 'Harbor Towers' },
    courtCafe:       { x: 148,  z: 118,  label: 'Palm Court Cafe' },
    greenPark:       { x: -118, z: -138, label: 'Harbor Green' },
    hideout:         { x: 182,  z: 182,  label: 'Rook Hideout' },
    ferryTerminal:   { x: -176, z: -52,  label: 'Ferry Terminal' },
    fishMarket:      { x: -84,  z: 150,  label: 'Fish Market' },
    centralCross:    { x: 0,    z: 0,    label: 'Central Cross' },
    northGate:       { x: 20,   z: -196, label: 'North Gate' }
  };

  /* ----------------------------------------------------------
     Tabel misi cadangan (8 misi). Dipakai hanya bila
     Harbor.Config.MISSIONS tidak tersedia. Bentuk tiap misi:
     { id, title, giver, briefing, reward, rp, timerSeconds,
       steps: [{ kind, label, place, count, seconds }] }
     Arti kind:
       steal   = masuk mobil di dekat place
       drive   = di mobil, sampai dalam 12 m dari place
       onfoot  = jalan kaki, sampai dalam 8 m dari place
       deliver = carrying > 0 dan dalam 12 m dari place
       clear   = S.mission.kills >= count
       escape  = S.player.wanted === 0
       pickup  = dalam 10 m dari place, carrying += count
       wait    = diam dalam 10 m selama seconds
     ---------------------------------------------------------- */
  var FALLBACK_MISSIONS = [
    {
      id: 1, title: 'First Wheels', giver: 'Marisol Vega',
      briefing: 'Rook, aku butuh mobil. Ambil Anchor S di gerbang dermaga, bawa ke garasi Palm Court. Jangan bikin ribut.',
      reward: 300, rp: 1000, timerSeconds: null,
      steps: [
        { kind: 'steal', label: 'Steal the Anchor S', place: 'pierGate' },
        { kind: 'drive', label: 'Drive it to the Palm Court garage', place: 'palmGarage' }
      ]
    },
    {
      id: 2, title: 'Courier Run', giver: 'Marisol Vega',
      briefing: 'Tiga parsel ikan — maksudku, parsel biasa — harus sampai sebelum jam berganti. Cepat, tapi jangan menabrak semua orang.',
      reward: 450, rp: 1000, timerSeconds: 180,
      steps: [
        { kind: 'pickup', label: 'Collect the parcels at the fish market', place: 'fishMarket', count: 3 },
        { kind: 'deliver', label: 'Drop the first parcel at Harbor Towers', place: 'towerPlaza' },
        { kind: 'deliver', label: 'Drop the second parcel at the ferry terminal', place: 'ferryTerminal' },
        { kind: 'deliver', label: 'Drop the last parcel at the hideout', place: 'hideout' }
      ]
    },
    {
      id: 3, title: 'Harbor Taxi', giver: 'Marisol Vega',
      briefing: 'Taksi kota kekurangan sopir malam ini. Pinjam satu kab, antar dua penumpang, dan jangan minta tip dengan pistol.',
      reward: 200, rp: 1000, timerSeconds: null,
      steps: [
        { kind: 'steal', label: 'Borrow a Harbor Cab', place: 'courtCafe' },
        { kind: 'pickup', label: 'Pick up a fare at Sunset Strand', place: 'strandPromenade', count: 1 },
        { kind: 'deliver', label: 'Drop the fare at Harbor Towers', place: 'towerPlaza' },
        { kind: 'pickup', label: 'Pick up a fare at the green', place: 'greenPark', count: 1 },
        { kind: 'deliver', label: 'Drop the fare at the ferry terminal', place: 'ferryTerminal' }
      ]
    },
    {
      id: 4, title: 'Dockside Crew', giver: 'Marisol Vega',
      briefing: 'Kru Dario menguasai container yard. Datang jalan kaki, bereskan keenamnya, lalu hilang sebelum sirene datang.',
      reward: 600, rp: 1000, timerSeconds: null,
      steps: [
        { kind: 'onfoot', label: 'Reach the container yard on foot', place: 'containerYard' },
        { kind: 'clear', label: "Deal with Dario's crew", place: 'containerYard', count: 6 },
        { kind: 'escape', label: 'Lose the heat', place: 'containerYard' }
      ]
    },
    {
      id: 5, title: 'Hot Pursuit', giver: 'Dario Kaine',
      briefing: 'Kau pikir bisa main di kotaku tanpa izin? Buktikan kau bisa lolos dari patroli, lalu kita bicara.',
      reward: 500, rp: 1000, timerSeconds: null,
      steps: [
        { kind: 'drive', label: 'Reach Palm Court with the police behind you', place: 'courtCafe' },
        { kind: 'escape', label: 'Break the pursuit and go quiet', place: 'courtCafe' }
      ]
    },
    {
      id: 6, title: 'The Getaway', giver: 'Marisol Vega',
      briefing: 'Neon GT terparkir di strand, kuncinya di dalam. Ambil, buang ekor di tengah kota, antar ke garasi.',
      reward: 800, rp: 1000, timerSeconds: null,
      steps: [
        { kind: 'steal', label: 'Steal the Neon GT', place: 'strandPromenade' },
        { kind: 'drive', label: 'Lose any tail on the way', place: 'towerPlaza' },
        { kind: 'drive', label: 'Deliver it to the Palm Court garage', place: 'palmGarage' }
      ]
    },
    {
      id: 7, title: 'Sunset Pickup', giver: 'Marisol Vega',
      briefing: 'Jemput aku di promenade saat matahari turun. Bawa aku ke Harbor Towers. Dan Rook — mandi dulu tidak sempat, jadi jangan ngebut.',
      reward: 550, rp: 1000, timerSeconds: null,
      steps: [
        { kind: 'drive', label: 'Reach the strand promenade', place: 'strandPromenade' },
        { kind: 'pickup', label: 'Pick up Marisol', place: 'strandPromenade', count: 1 },
        { kind: 'drive', label: 'Drive Marisol to Harbor Towers', place: 'towerPlaza' }
      ]
    },
    {
      id: 8, title: 'Harbor King', giver: 'Marisol Vega',
      briefing: 'Satu kiriman terakhir, Rook. Ambil di container yard, bawa melintasi kota dengan panas maksimal di belakangmu, dan serahkan di hideout. Setelah ini, pelabuhan ini milikmu.',
      reward: 1500, rp: 2000, timerSeconds: null,
      steps: [
        { kind: 'pickup', label: 'Grab the shipment at the container yard', place: 'containerYard', count: 1 },
        { kind: 'drive', label: 'Run the shipment across town', place: 'greenPark' },
        { kind: 'escape', label: 'Lose the maximum heat', place: 'greenPark' },
        { kind: 'deliver', label: 'Deliver the shipment to the hideout', place: 'hideout' }
      ]
    }
  ];

  /* Jarak (meter) untuk tiap jenis penyelesaian langkah. */
  var REACH_DRIVE = 12;
  var REACH_ONFOOT = 8;
  var REACH_PICKUP = 10;
  var REACH_PACKAGE = 3;

  /* ----------------------------------------------------------
     Pembantu kecil.
     ---------------------------------------------------------- */
  function missionList() {
    if (C.MISSIONS && C.MISSIONS.length) { return C.MISSIONS; }
    return FALLBACK_MISSIONS;
  }

  function missionByIndex(idx) {
    var list = missionList();
    if (idx < 0 || idx >= list.length) { return null; }
    return list[idx];
  }

  function placePos(name) {
    var p = null;
    if (typeof C.placeByName === 'function') {
      try { p = C.placeByName(name); } catch (e) { p = null; }
    }
    if (!p && C.PLACES && C.PLACES[name]) { p = C.PLACES[name]; }
    if (!p) { p = FALLBACK_PLACES[name]; }
    if (!p) { return { x: 0, z: 0, label: name }; }
    return { x: p.x, z: p.z, label: p.label || name };
  }

  function dist2D(ax, az, bx, bz) {
    var dx = ax - bx;
    var dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function playerDistTo(S, place) {
    var p = placePos(place);
    return dist2D(S.player.pos.x, S.player.pos.z, p.x, p.z);
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

  function beep(freq, dur) {
    if (H.Sound && typeof H.Sound.beep === 'function') {
      H.Sound.beep(freq, dur);
    }
  }

  function showBriefing(S, mission) {
    if (H.UI && typeof H.UI.showMissionBrief === 'function') {
      H.UI.showMissionBrief(S, mission);
      return;
    }
    if (H.HUD && typeof H.HUD.setDialog === 'function') {
      H.HUD.setDialog(S, {
        name: mission.giver,
        role: 'Mission giver',
        text: mission.briefing,
        key: mission.giver === 'Dario Kaine' ? 'dario' : 'marisol'
      });
    }
  }

  function crewAlive(S) {
    var n = 0;
    var i;
    if (!S.goons) { return 0; }
    for (i = 0; i < S.goons.length; i++) {
      if (S.goons[i] && S.goons[i].alive) { n++; }
    }
    return n;
  }

  /* ----------------------------------------------------------
     spawnCrew(S, place, count)
     Membangun `count` goon di busur 10-16 m di depan place.
     Tiap goon: THREE.Group berisi jaket merah, celana gelap,
     kepala, dan senjata. Disimpan ke S.goons.
     ---------------------------------------------------------- */
  function spawnCrew(S, place, count) {
    var out = [];
    var base = placePos(place);
    var i, goon, mesh, torso, legs, head, gun, angle, radius, gx, gz;
    var rng = (typeof S.rng === 'function') ? S.rng : null;
    if (!S.goons) { S.goons = []; }
    for (i = 0; i < count; i++) {
      angle = (rng ? rng() : 0.5) * Math.PI * 2;
      radius = 10 + (rng ? rng() : 0.5) * 6;
      gx = base.x + Math.cos(angle) * radius;
      gz = base.z + Math.sin(angle) * radius;
      mesh = new THREE.Group();
      /* torso: jaket merah */
      torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.72, 0.36),
        new THREE.MeshLambertMaterial({ color: 0xc22e2e })
      );
      torso.position.y = 1.05;
      mesh.add(torso);
      /* celana gelap */
      legs = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.72, 0.3),
        new THREE.MeshLambertMaterial({ color: 0x23232e })
      );
      legs.position.y = 0.36;
      mesh.add(legs);
      /* kepala */
      head = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0xd9a37e })
      );
      head.position.y = 1.62;
      mesh.add(head);
      /* topi gelap */
      var cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.27, 0.1, 10),
        new THREE.MeshLambertMaterial({ color: 0x1a1a22 })
      );
      cap.position.y = 1.8;
      mesh.add(cap);
      /* senjata di tangan */
      gun = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.55),
        new THREE.MeshLambertMaterial({ color: 0x111111 })
      );
      gun.position.set(0.36, 1.05, 0.2);
      mesh.add(gun);
      mesh.position.set(gx, 0, gz);
      mesh.rotation.y = angle + Math.PI;
      if (S.scene) { S.scene.add(mesh); }
      goon = {
        mesh: mesh,
        pos: mesh.position,
        health: 100,
        alive: true
      };
      S.goons.push(goon);
      out.push(goon);
    }
    return out;
  }

  /* ----------------------------------------------------------
     start(S, idx) — mulai misi index 0-based.
     ---------------------------------------------------------- */
  function start(S, idx) {
    var mission = missionByIndex(idx);
    if (!mission) { return false; }
    var first = mission.steps && mission.steps[0];
    S.mission = {
      idx: idx,
      step: 0,
      stepCount: mission.steps.length,
      done: false,
      timer: mission.timerSeconds || null,
      carrying: 0,
      kills: 0,
      _waitAcc: 0,
      _crewSpawned: false
    };
    S.missionIdx = idx;
    if (first && first.kind === 'clear') {
      spawnCrew(S, first.place, first.count || 6);
      S.mission._crewSpawned = true;
    }
    showBriefing(S, mission);
    toast(S, 'NEW JOB — ' + mission.title);
    return true;
  }

  /* ----------------------------------------------------------
     completeStep(S) — majukan satu langkah secara manual.
     Dipakai tick() dan jalur debug. Mengembalikan true bila
     masih ada langkah berikut, false bila misi selesai.
     ---------------------------------------------------------- */
  function completeStep(S) {
    var m = S.mission;
    var mission, step;
    if (!m || m.done) { return false; }
    mission = missionByIndex(m.idx);
    if (!mission) { return false; }
    step = mission.steps[m.step];
    if (step && step.kind === 'deliver' && m.carrying > 0) {
      m.carrying -= 1;
    }
    if (step && step.kind === 'pickup') {
      m.carrying += (step.count || 1);
    }
    m.step += 1;
    m._waitAcc = 0;
    beep(660, 0.12);
    if (m.step >= m.stepCount) {
      finishMission(S, mission);
      return false;
    }
    var next = mission.steps[m.step];
    toast(S, 'NEXT — ' + next.label);
    return true;
  }

  /* ----------------------------------------------------------
     finishMission(S, mission) — bayar hadiah, lanjutkan ke
     misi berikut, atau tutup cerita bila misi 8 selesai.
     ---------------------------------------------------------- */
  function finishMission(S, mission) {
    var reward = mission.reward || 0;
    var rpGain = mission.rp || 1000;
    var nextIdx = S.mission.idx + 1;
    S.player.cash += reward;
    S.player.rp += rpGain;
    S.cash = S.player.cash;
    S.mission.done = true;
    S.mission.carrying = 0;
    toast(S, 'JOB DONE — +$' + reward + '  +' + rpGain + ' RP');
    beep(880, 0.2);
    if (H.Sound && typeof H.Sound.radioJingle === 'function') {
      H.Sound.radioJingle();
    }
    if (mission.id === 4) {
      if (H.Combat && typeof H.Combat.giveWeapon === 'function') {
        H.Combat.giveWeapon(S, 'smg');
        toast(S, 'NEW WEAPON — SMG unlocked');
      }
    }
    if (nextIdx < missionList().length) {
      start(S, nextIdx);
      return;
    }
    if (H.HUD && typeof H.HUD.setDialog === 'function') {
      H.HUD.setDialog(S, {
        name: 'Marisol Vega',
        role: 'Harbor King',
        text: 'Itu dia, Rook. Pelabuhan ini sekarang milikmu. Harbor King — jangan sia-siakan.',
        key: 'marisol'
      });
    }
    toast(S, 'HARBOR KING — cerita selesai. Teruslah berkendara.');
  }

  /* ----------------------------------------------------------
     stepIsDone(S, step, dt) — apakah langkah berjalan sudah
     selesai pada frame ini? Efek samping pickup/wait dicatat
     di sini (carrying, _waitAcc).
     ---------------------------------------------------------- */
  function stepIsDone(S, step, dt) {
    var m = S.mission;
    var d = 0;
    var place = step.place;
    switch (step.kind) {
      case 'steal':
        d = place ? playerDistTo(S, place) : 9999;
        return S.player.vehicle !== null && d <= REACH_DRIVE;
      case 'drive':
        d = place ? playerDistTo(S, place) : 9999;
        return S.player.vehicle !== null && d <= REACH_DRIVE;
      case 'onfoot':
        d = place ? playerDistTo(S, place) : 9999;
        return S.player.onFoot && d <= REACH_ONFOOT;
      case 'deliver':
        d = place ? playerDistTo(S, place) : 9999;
        return m.carrying > 0 && d <= REACH_DRIVE;
      case 'clear':
        return m.kills >= (step.count || 1);
      case 'escape':
        return S.player.wanted === 0;
      case 'pickup':
        d = place ? playerDistTo(S, place) : 9999;
        return d <= REACH_PICKUP;
      case 'wait':
        d = place ? playerDistTo(S, place) : 9999;
        if (d <= REACH_PICKUP) {
          m._waitAcc = (m._waitAcc || 0) + dt;
          return m._waitAcc >= (step.seconds || 5);
        }
        m._waitAcc = 0;
        return false;
      default:
        return false;
    }
  }

  /* ----------------------------------------------------------
     collectFreePackages(S) — paket free-roam: dekat < 3 m,
     paket hilang, +50 RP.
     ---------------------------------------------------------- */
  function collectFreePackages(S) {
    var i, pkg, d;
    if (!S.packages || !S.packages.length) { return; }
    for (i = 0; i < S.packages.length; i++) {
      pkg = S.packages[i];
      if (!pkg || pkg.taken) { continue; }
      d = dist2D(S.player.pos.x, S.player.pos.z, pkg.pos.x, pkg.pos.z);
      if (d < REACH_PACKAGE) {
        pkg.taken = true;
        if (pkg.mesh) { pkg.mesh.visible = false; }
        S.player.rp += 50;
        toast(S, '+50 RP — package found');
        beep(990, 0.1);
      }
    }
  }

  /* ----------------------------------------------------------
     tick(dt, S) — dipanggil tiap frame oleh main.js.
     ---------------------------------------------------------- */
  function tick(dt, S) {
    var m = S.mission;
    var mission, step;
    if (!S.started) { return; }
    collectFreePackages(S);
    if (!m || m.done) { return; }
    mission = missionByIndex(m.idx);
    if (!mission) { return; }
    /* Hitung mundur timer bila ada. */
    if (m.timer !== null && m.timer !== undefined) {
      m.timer -= dt;
      if (m.timer <= 0) {
        m.timer = 0;
        toast(S, 'JOB FAILED — out of time. Try again.');
        beep(220, 0.4);
        start(S, m.idx);
        return;
      }
    }
    step = mission.steps[m.step];
    if (!step) { return; }
    /* Langkah clear: pastikan kru sudah muncul. */
    if (step.kind === 'clear' && !m._crewSpawned) {
      spawnCrew(S, step.place, step.count || 6);
      m._crewSpawned = true;
      toast(S, "Dario's crew is here — deal with them");
    }
    if (stepIsDone(S, step, dt)) {
      completeStep(S);
    }
  }

  /* ----------------------------------------------------------
     current(S) — ringkasan misi berjalan untuk HUD / minimap.
     ---------------------------------------------------------- */
  function current(S) {
    var m = S.mission;
    var mission, step, place;
    var empty = {
      title: 'No job yet', giver: '', stage: 0, total: 0,
      next: 'Start the engine', progress01: 0, timer: null,
      target: { x: 0, z: 0, label: 'Central Cross' }
    };
    if (!m) { return empty; }
    mission = missionByIndex(m.idx);
    if (!mission) { return empty; }
    if (m.done) {
      return {
        title: mission.title, giver: mission.giver,
        stage: m.stepCount, total: m.stepCount,
        next: 'Job done', progress01: 1, timer: null,
        target: { x: 0, z: 0, label: 'Harbor King' }
      };
    }
    step = mission.steps[m.step];
    place = step && step.place ? placePos(step.place) : { x: 0, z: 0, label: '' };
    var following = mission.steps[m.step + 1];
    return {
      title: mission.title,
      giver: mission.giver,
      stage: m.step + 1,
      total: m.stepCount,
      next: step ? step.label : 'Job done',
      following: following ? following.label : 'Finish the job',
      progress01: m.stepCount ? (m.step / m.stepCount) : 0,
      timer: (m.timer === null || m.timer === undefined) ? null : Math.max(0, Math.ceil(m.timer)),
      target: { x: place.x, z: place.z, label: place.label }
    };
  }

  /* ----------------------------------------------------------
     missionStage(S) — versi ringkas untuk HUD.
     ---------------------------------------------------------- */
  function missionStage(S) {
    var c = current(S);
    return { stage: c.stage, total: c.total, next: c.next };
  }

  /* ----------------------------------------------------------
     scatter(scene, bounds) — sebar 20 paket free-roam.
     Dipanggil SEKALI saat boot. RNG deterministik lokal
     (mulberry32, seed tetap) supaya penempatan stabil antar
     run dan tidak memakai Math.random.
     ---------------------------------------------------------- */
  function scatterPackages(scene, bounds) {
    var out = [];
    var b = bounds || { x0: -180, z0: -180, x1: 190, z1: 190, count: 20 };
    var count = b.count || 20;
    var seed = 20261123;
    var i, x, z, mesh, glow, pkg;
    function rng() {
      seed |= 0;
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    for (i = 0; i < count; i++) {
      x = b.x0 + rng() * (b.x1 - b.x0);
      z = b.z0 + rng() * (b.z1 - b.z0);
      mesh = new THREE.Group();
      var box = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.45, 0.7),
        new THREE.MeshLambertMaterial({ color: 0xffd34d, emissive: 0x8a6d00 })
      );
      box.position.y = 0.35;
      mesh.add(box);
      glow = new THREE.Mesh(
        new THREE.BoxGeometry(0.78, 0.1, 0.78),
        new THREE.MeshBasicMaterial({ color: 0xffe98a })
      );
      glow.position.y = 0.06;
      mesh.add(glow);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = rng() * Math.PI * 2;
      if (scene) { scene.add(mesh); }
      pkg = { mesh: mesh, pos: mesh.position, taken: false };
      out.push(pkg);
    }
    return out;
  }

  /* ----------------------------------------------------------
     Ekspos API. Catatan kontrak: scatter diekspos sebagai
     Harbor.Missions.packages = { scatter } (SATU bentuk).
     ---------------------------------------------------------- */
  H.Missions = {
    start: start,
    tick: tick,
    current: current,
    missionStage: missionStage,
    completeStep: completeStep,
    spawnCrew: spawnCrew,
    packages: { scatter: scatterPackages }
  };
})();
