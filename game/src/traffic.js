// traffic.js — Neon Harbor: lalu lintas, pejalan kaki, mobil parkir.
// Satu job: mengisi jalanan dengan mobil bergerak + trotoar dengan pejalan
// kaki, menggerakkan semuanya tiap frame, dan men-stage mereka ke dalam
// frame kamera saat screenshot (stageDensity / packFrame) supaya dunia
// terlihat hidup, bukan hanya di minimap.
// Gaya: classic script + IIFE, var/function, menempel ke window.Harbor.
(function () {
  'use strict';

  var H = window.Harbor || (window.Harbor = {});
  var THREE = window.THREE;

  function pick(path, fallback) {
    var cur = H.Config;
    var parts = path.split('.');
    var i;
    if (!cur) { return fallback; }
    for (i = 0; i < parts.length; i++) {
      cur = cur[parts[i]];
      if (cur === undefined || cur === null) { return fallback; }
    }
    return cur;
  }

  var ROAD_LINES = [-160, -80, 0, 80, 160];
  var HALF = pick('CITY.halfExtent', 200);
  var WRAP = HALF + 6; // titik wrap mobil traffic di ujung jalan
  var TRAFFIC_MODELS = ['anchor', 'neon', 'hauler', 'cab'];

  // Jam internal modul (akumulasi dt) — dipakai untuk membandingkan
  // muzzleUntil tanpa Date.now() dan tanpa asumsi jam milik main.js.
  var _clock = 0;
  var _seenMuzzle = null;
  var _shotAtLocal = -100;

  function rngOf(S) {
    return (S && S.rng) || Math.random;
  }

  function clamp(v, lo, hi) {
    if (v < lo) { return lo; }
    if (v > hi) { return hi; }
    return v;
  }

  function dist2D(ax, az, bx, bz) {
    var dx = ax - bx;
    var dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  // Posisi anchor boleh Vector3 atau array [x, y, z].
  function anchorXZ(anchor) {
    if (!anchor) { return { x: 0, z: 0 }; }
    if (typeof anchor.x === 'number' && typeof anchor.z === 'number') {
      return { x: anchor.x, z: anchor.z };
    }
    if (anchor.length >= 3) {
      return { x: anchor[0], z: anchor[2] };
    }
    return { x: 0, z: 0 };
  }

  function anchorHeading(anchor) {
    if (anchor && typeof anchor.heading === 'number') { return anchor.heading; }
    return null;
  }

  function nearestLine(v) {
    var best = ROAD_LINES[0];
    var bd = Math.abs(v - best);
    var i, d;
    for (i = 1; i < ROAD_LINES.length; i++) {
      d = Math.abs(v - ROAD_LINES[i]);
      if (d < bd) { bd = d; best = ROAD_LINES[i]; }
    }
    return best;
  }

  // Pilih satu ruas jalan acak: sumbu + garis + lajur.
  function randomRoadSpot(S) {
    var rng = rngOf(S);
    var axis = rng() < 0.5 ? 'x' : 'z';
    var line = ROAD_LINES[Math.floor(rng() * ROAD_LINES.length)];
    var lane = (rng() < 0.5 ? -1 : 1) * 4; // offset lajur dari garis tengah
    var along = -190 + rng() * 380;
    var heading;
    if (axis === 'x') {
      heading = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      return { axis: axis, line: line, lane: lane, x: along, z: line + lane, heading: heading };
    }
    heading = rng() < 0.5 ? 0 : Math.PI;
    return { axis: axis, line: line, lane: lane, x: line + lane, z: along, heading: heading };
  }

  function placeCarOnRoad(car, spot) {
    car.road = spot.axis;
    car.heading = spot.heading;
    car.pos.set(spot.x, 0, spot.z);
    car.mesh.rotation.y = spot.heading;
  }

  // ------------------------------------------------------------------
  // spawnTraffic(S, n): isi S.cars dengan n mobil di jalan.
  // ------------------------------------------------------------------
  function spawnTraffic(S, n) {
    var rng = rngOf(S);
    var i, key, spot, car;
    if (!S.cars) { S.cars = []; }
    for (i = 0; i < n; i++) {
      key = TRAFFIC_MODELS[Math.floor(rng() * TRAFFIC_MODELS.length)];
      spot = randomRoadSpot(S);
      car = H.Vehicles.buildCar(S, key, spot.x, spot.z, spot.heading);
      placeCarOnRoad(car, spot);
      car.speed = 8 + rng() * 6; // 8..14 m/s
      car.parked = false;
      if (S.scene) { S.scene.add(car.mesh); }
      S.cars.push(car);
    }
    return S.cars;
  }

  // ------------------------------------------------------------------
  // Figur pejalan kaki sederhana: torso warna baju acak, kepala, kaki,
  // lengan; sebagian bertopi. Variasi warna supaya tidak terlihat klon.
  // ------------------------------------------------------------------
  var SHIRT_COLORS = [0xe8e8e8, 0x3a6ea5, 0xc23b2e, 0x2a7a3a, 0xe8b400, 0x8a3a5a, 0x5a4a8a, 0x2a2a2a, 0xd87a1e, 0x7a5a3a];
  var SKIN_COLORS = [0xd9a077, 0xc98a5e, 0x8a5a3a, 0xe8b88a, 0x6a4530];
  var PANTS_COLORS = [0x2a2a3a, 0x3a3a2a, 0x1a1a1a, 0x4a3a2a, 0x5a5a5a];

  function buildPedMesh(S, rng) {
    var g = new THREE.Group();
    var shirt = SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)];
    var skin = SKIN_COLORS[Math.floor(rng() * SKIN_COLORS.length)];
    var pants = PANTS_COLORS[Math.floor(rng() * PANTS_COLORS.length)];
    var shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
    var skinMat = new THREE.MeshLambertMaterial({ color: skin });
    var pantsMat = new THREE.MeshLambertMaterial({ color: pants });

    function bx(w, h, d, mat, x, y, z) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    }

    var legL = bx(0.14, 0.72, 0.16, pantsMat, -0.11, 0.36, 0);
    var legR = bx(0.14, 0.72, 0.16, pantsMat, 0.11, 0.36, 0);
    var torso = bx(0.46, 0.62, 0.26, shirtMat, 0, 1.03, 0);
    var armL = bx(0.12, 0.58, 0.14, shirtMat, -0.3, 1.02, 0);
    var armR = bx(0.12, 0.58, 0.14, shirtMat, 0.3, 1.02, 0);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), skinMat);
    head.position.set(0, 1.52, 0);
    head.castShadow = true;
    g.add(head);
    // Topi untuk ~40% pejalan kaki.
    if (rng() < 0.4) {
      var hatMat = new THREE.MeshLambertMaterial({
        color: [0xc23b2e, 0x2a5a8a, 0xe8b400, 0x2a2a2a][Math.floor(rng() * 4)]
      });
      var hat = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.09, 10), hatMat);
      hat.position.set(0, 1.68, 0);
      g.add(hat);
    }
    // Tas selempang untuk sebagian pejalan kaki — detail kecil pembeda.
    if (rng() < 0.3) {
      bx(0.1, 0.3, 0.06, new THREE.MeshLambertMaterial({ color: 0x3a2a1a }), 0.24, 1.0, 0.12);
    }
    g.userData.limbs = { legL: legL, legR: legR, armL: armL, armR: armR };
    return g;
  }

  // ------------------------------------------------------------------
  // spawnPeds(S, n): isi S.peds dengan pejalan kaki di trotoar.
  // ------------------------------------------------------------------
  function spawnPeds(S, n) {
    var rng = rngOf(S);
    var i, spot, mesh, ped;
    if (!S.peds) { S.peds = []; }
    for (i = 0; i < n; i++) {
      spot = randomRoadSpot(S);
      mesh = buildPedMesh(S, rng);
      // Trotoar: 10..12 m dari garis tengah jalan.
      var side = rng() < 0.5 ? -1 : 1;
      var off = 10 + rng() * 2;
      var px, pz;
      if (spot.axis === 'x') {
        px = spot.x;
        pz = spot.line + side * off;
      } else {
        px = spot.line + side * off;
        pz = spot.z;
      }
      mesh.position.set(px, 0, pz);
      mesh.rotation.y = spot.heading + (rng() < 0.5 ? 0 : Math.PI);
      if (S.scene) { S.scene.add(mesh); }
      ped = {
        mesh: mesh,
        pos: mesh.position,
        heading: mesh.rotation.y,
        speed: 1 + rng() * 1, // 1..2 m/s
        state: 'walk',
        fleeT: 0,
        phase: rng() * Math.PI * 2
      };
      S.peds.push(ped);
    }
    return S.peds;
  }

  // ------------------------------------------------------------------
  // spawnParked(S, n): isi S.parkedCars dengan mobil parkir di tepi jalan.
  // ------------------------------------------------------------------
  function spawnParked(S, n) {
    var rng = rngOf(S);
    var i, key, spot, car;
    if (!S.parkedCars) { S.parkedCars = []; }
    for (i = 0; i < n; i++) {
      key = TRAFFIC_MODELS[Math.floor(rng() * TRAFFIC_MODELS.length)];
      spot = randomRoadSpot(S);
      // Tepi jalan: offset lajur + 6 m ke arah luar.
      var side = spot.lane >= 0 ? 1 : -1;
      var edge = spot.line + side * (4 + 6);
      var px = spot.axis === 'x' ? spot.x : edge;
      var pz = spot.axis === 'x' ? edge : spot.z;
      car = H.Vehicles.buildCar(S, key, px, pz, spot.heading);
      car.road = spot.axis;
      car.speed = 0;
      car.parked = true;
      if (S.scene) { S.scene.add(car.mesh); }
      S.parkedCars.push(car);
    }
    return S.parkedCars;
  }

  // ------------------------------------------------------------------
  // tickTraffic(dt, S): gerakkan mobil + pejalan kaki tiap frame.
  // ------------------------------------------------------------------
  function tickTraffic(dt, S) {
    if (!S) { return; }
    _clock += dt;
    var now = _clock;
    var i, car, ped;

    // Deteksi tembakan baru: muzzleUntil berubah nilai -> catat waktu lokal.
    if (S.combat && typeof S.combat.muzzleUntil === 'number') {
      if (S.combat.muzzleUntil !== _seenMuzzle) {
        _seenMuzzle = S.combat.muzzleUntil;
        _shotAtLocal = now;
      }
    }
    var shooting = (now - _shotAtLocal) < 1.5;
    var player = S.player || null;
    var playerSpeeding = false;
    if (player && !player.onFoot && Math.abs(player.speed || 0) > 8) {
      playerSpeeding = true;
    }

    // --- Mobil traffic: lurus sepanjang sumbu road, wrap di ujung. ---
    var cars = S.cars || [];
    for (i = 0; i < cars.length; i++) {
      car = cars[i];
      if (!car || !car.pos) { continue; }
      if (car.road === 'x') {
        car.pos.x += Math.sin(car.heading) * car.speed * dt;
        if (car.pos.x > WRAP) { car.pos.x = -WRAP; }
        if (car.pos.x < -WRAP) { car.pos.x = WRAP; }
      } else {
        car.pos.z += Math.cos(car.heading) * car.speed * dt;
        if (car.pos.z > WRAP) { car.pos.z = -WRAP; }
        if (car.pos.z < -WRAP) { car.pos.z = WRAP; }
      }
      car.mesh.rotation.y = car.heading;
      if (H.Vehicles && H.Vehicles.tickCarVisual) {
        H.Vehicles.tickCarVisual(car, dt);
      }
    }

    // --- Pejalan kaki: jalan di trotoar, belok di ujung blok, lari bila
    // ada tembakan baru atau mobil pemain ngebut di dekat mereka. ---
    var peds = S.peds || [];
    for (i = 0; i < peds.length; i++) {
      ped = peds[i];
      if (!ped || !ped.pos) { continue; }
      var flee = false;
      if (shooting) { flee = true; }
      if (player && playerSpeeding) {
        var pd = dist2D(ped.pos.x, ped.pos.z, player.pos.x, player.pos.z);
        if (pd < 6) { flee = true; }
      }
      if (flee && ped.state !== 'flee') {
        ped.state = 'flee';
        ped.fleeT = 2.5;
        // Hadap menjauhi pemain (atau menjauhi pusat tembakan = pemain).
        if (player) {
          ped.heading = Math.atan2(ped.pos.x - player.pos.x, ped.pos.z - player.pos.z);
        }
      }
      if (ped.state === 'flee') {
        ped.fleeT -= dt;
        ped.pos.x += Math.sin(ped.heading) * 5.5 * dt;
        ped.pos.z += Math.cos(ped.heading) * 5.5 * dt;
        ped.phase += dt * 9;
        if (ped.fleeT <= 0) { ped.state = 'walk'; }
      } else {
        ped.pos.x += Math.sin(ped.heading) * ped.speed * dt;
        ped.pos.z += Math.cos(ped.heading) * ped.speed * dt;
        ped.phase += dt * 4 * ped.speed;
        // Belok di ujung blok / batas kota.
        if (ped.pos.x > 196 || ped.pos.x < -196 || ped.pos.z > 196 || ped.pos.z < -196) {
          ped.heading += Math.PI / 2;
          ped.pos.x = clamp(ped.pos.x, -196, 196);
          ped.pos.z = clamp(ped.pos.z, -196, 196);
        }
      }
      ped.mesh.rotation.y = ped.heading;
      // Ayun kaki/lengan sederhana.
      var limbs = ped.mesh.userData && ped.mesh.userData.limbs;
      if (limbs) {
        var swing = Math.sin(ped.phase) * (ped.state === 'flee' ? 0.7 : 0.4);
        limbs.legL.rotation.x = swing;
        limbs.legR.rotation.x = -swing;
        limbs.armL.rotation.x = -swing * 0.8;
        limbs.armR.rotation.x = swing * 0.8;
      }
    }
  }

  // ------------------------------------------------------------------
  // stageDensity(S, anchor, carCount, pedCount): pindahkan mobil traffic
  // + ped TERDEKAT ke sekitar anchor (radius 40 m), perlambat mereka.
  // ------------------------------------------------------------------
  function stageDensity(S, anchor, carCount, pedCount) {
    var a = anchorXZ(anchor);
    var rng = rngOf(S);
    var i, j, tmp;
    var cars = S.cars || [];
    var peds = S.peds || [];
    // Urutkan mobil berdasarkan jarak ke anchor (selection sederhana).
    var order = [];
    for (i = 0; i < cars.length; i++) {
      order.push({ idx: i, d: dist2D(cars[i].pos.x, cars[i].pos.z, a.x, a.z) });
    }
    for (i = 0; i < order.length; i++) {
      for (j = i + 1; j < order.length; j++) {
        if (order[j].d < order[i].d) { tmp = order[i]; order[i] = order[j]; order[j] = tmp; }
      }
    }
    var placed = 0;
    var want = Math.min(carCount || 0, order.length);
    for (i = 0; i < want; i++) {
      var car = cars[order[i].idx];
      // Jalan terdekat dari anchor, posisi acak dalam radius 40 m.
      var axis = rng() < 0.5 ? 'x' : 'z';
      var line = nearestLine(axis === 'x' ? a.z : a.x);
      var along = clamp((axis === 'x' ? a.x : a.z) + (rng() - 0.5) * 70, -190, 190);
      var lane = (rng() < 0.5 ? -1 : 1) * 4;
      var heading = axis === 'x'
        ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2)
        : (rng() < 0.5 ? 0 : Math.PI);
      if (axis === 'x') {
        car.pos.set(along, 0, line + lane);
      } else {
        car.pos.set(line + lane, 0, along);
      }
      car.road = axis;
      car.heading = heading;
      car.mesh.rotation.y = heading;
      car.speed = 4 + rng() * 2; // pelan, tetap di frame
      placed++;
    }
    // Pejalan kaki terdekat ke trotoar sekitar anchor.
    var porder = [];
    for (i = 0; i < peds.length; i++) {
      porder.push({ idx: i, d: dist2D(peds[i].pos.x, peds[i].pos.z, a.x, a.z) });
    }
    for (i = 0; i < porder.length; i++) {
      for (j = i + 1; j < porder.length; j++) {
        if (porder[j].d < porder[i].d) { tmp = porder[i]; porder[i] = porder[j]; porder[j] = tmp; }
      }
    }
    var pwant = Math.min(pedCount || 0, porder.length);
    for (i = 0; i < pwant; i++) {
      var ped = peds[porder[i].idx];
      var paxis = rng() < 0.5 ? 'x' : 'z';
      var pline = nearestLine(paxis === 'x' ? a.z : a.x);
      var side = rng() < 0.5 ? -1 : 1;
      var poff = 10 + rng() * 2;
      var palong = clamp((paxis === 'x' ? a.x : a.z) + (rng() - 0.5) * 70, -190, 190);
      if (paxis === 'x') {
        ped.pos.set(palong, 0, pline + side * poff);
        ped.heading = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        ped.pos.set(pline + side * poff, 0, palong);
        ped.heading = rng() < 0.5 ? 0 : Math.PI;
      }
      ped.mesh.rotation.y = ped.heading;
      ped.state = 'walk';
      ped.speed = 1 + rng() * 1;
    }
    return placed;
  }

  // ------------------------------------------------------------------
  // packFrame(S, anchor): 6-8 mobil dalam busur longgar di depan anchor
  // + pejalan kaki di trotoar sekitarnya. Kembalikan jumlah mobil.
  // ------------------------------------------------------------------
  function packFrame(S, anchor) {
    var a = anchorXZ(anchor);
    var rng = rngOf(S);
    var i;
    if (!S.cars) { S.cars = []; }
    if (!S.peds) { S.peds = []; }
    // Arah "depan": dari heading anchor bila ada, kalau tidak menghadap
    // pusat kota, kalau anchor di pusat pakai +z.
    var dirX = 0, dirZ = 1;
    var hd = anchorHeading(anchor);
    if (hd !== null) {
      dirX = Math.sin(hd);
      dirZ = Math.cos(hd);
    } else {
      var cx = -a.x, cz = -a.z;
      var cl = Math.sqrt(cx * cx + cz * cz);
      if (cl > 1) { dirX = cx / cl; dirZ = cz / cl; }
    }
    var want = 6 + Math.floor(rng() * 3); // 6..8
    // Pakai mobil traffic yang sudah ada dulu (yang terjauh dari anchor
    // dipindah ke frame); bila kurang, bangun mobil baru.
    var order = [];
    for (i = 0; i < S.cars.length; i++) {
      order.push({ idx: i, d: dist2D(S.cars[i].pos.x, S.cars[i].pos.z, a.x, a.z) });
    }
    for (i = 0; i < order.length; i++) {
      for (var j = i + 1; j < order.length; j++) {
        if (order[j].d > order[i].d) { var tmp = order[i]; order[i] = order[j]; order[j] = tmp; }
      }
    }
    var placed = 0;
    for (i = 0; i < want; i++) {
      // Sudut busur -60..+60 derajat dari arah depan, radius 12..30 m.
      var ang = (-60 + (i * 120) / Math.max(1, want - 1) + (rng() - 0.5) * 10) * Math.PI / 180;
      var cosA = Math.cos(ang), sinA = Math.sin(ang);
      var fx = dirX * cosA - dirZ * sinA;
      var fz = dirX * sinA + dirZ * cosA;
      var radius = 12 + (i % 3) * 6 + rng() * 4;
      var tx = a.x + fx * radius;
      var tz = a.z + fz * radius;
      // Jepret ke jalan terdekat supaya mobil tidak berdiri di atas gedung.
      var useX = Math.abs(tz - nearestLine(tz)) <= Math.abs(tx - nearestLine(tx));
      var line, lane, axis, heading;
      if (useX) {
        line = nearestLine(tz);
        lane = (rng() < 0.5 ? -1 : 1) * 4;
        axis = 'x';
        heading = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        tx = clamp(tx, -190, 190);
        tz = line + lane;
      } else {
        line = nearestLine(tx);
        lane = (rng() < 0.5 ? -1 : 1) * 4;
        axis = 'z';
        heading = rng() < 0.5 ? 0 : Math.PI;
        tx = line + lane;
        tz = clamp(tz, -190, 190);
      }
      var car;
      if (i < order.length) {
        car = S.cars[order[i].idx];
      } else {
        var key = TRAFFIC_MODELS[Math.floor(rng() * TRAFFIC_MODELS.length)];
        car = H.Vehicles.buildCar(S, key, tx, tz, heading);
        if (S.scene) { S.scene.add(car.mesh); }
        S.cars.push(car);
      }
      car.road = axis;
      car.heading = heading;
      car.pos.set(tx, 0, tz);
      car.mesh.rotation.y = heading;
      car.speed = 3 + rng() * 3;
      car.parked = false;
      placed++;
    }
    // Pejalan kaki di trotoar sekitar anchor (pakai yang terdekat).
    var porder = [];
    for (i = 0; i < S.peds.length; i++) {
      porder.push({ idx: i, d: dist2D(S.peds[i].pos.x, S.peds[i].pos.z, a.x, a.z) });
    }
    for (i = 0; i < porder.length; i++) {
      for (var k = i + 1; k < porder.length; k++) {
        if (porder[k].d < porder[i].d) { var t2 = porder[i]; porder[i] = porder[k]; porder[k] = t2; }
      }
    }
    var pwant = Math.min(6, porder.length);
    for (i = 0; i < pwant; i++) {
      var ped = S.peds[porder[i].idx];
      var side = i % 2 === 0 ? -1 : 1;
      var pline = nearestLine(a.z);
      ped.pos.set(clamp(a.x + (rng() - 0.5) * 50, -190, 190), 0, pline + side * (10 + rng() * 2));
      ped.heading = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      ped.mesh.rotation.y = ped.heading;
      ped.state = 'walk';
    }
    return placed;
  }

  H.Traffic = {
    spawnTraffic: spawnTraffic,
    spawnPeds: spawnPeds,
    spawnParked: spawnParked,
    tickTraffic: tickTraffic,
    stageDensity: stageDensity,
    packFrame: packFrame
  };
})();
