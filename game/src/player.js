// player.js — Neon Harbor: Rook, karakter pemain.
// Satu job: figur Rook (jaket teal, celana gelap, topi merah), gerakan
// jalan kaki WASD + lari, mengemudi (gas/rem/setir mengikuti model mobil),
// masuk/keluar mobil terdekat, dan animasi ayun lengan/kaki.
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

  var WALK_SPEED = pick('TUNING.walkSpeed', 6);
  var RUN_SPEED = pick('TUNING.runSpeed', 10);
  var ENTER_DIST = pick('TUNING.enterCarDistance', 3.5);
  var HALF = pick('CITY.halfExtent', 200);
  var HEAT_STOLEN = pick('WANTED.heatPerStolenCar', 8);
  var TURN_RATE = 2.4; // rad/detik saat jalan kaki
  var STEER_RATE = 1.7; // faktor setir mobil

  function clamp(v, lo, hi) {
    if (v < lo) { return lo; }
    if (v > hi) { return hi; }
    return v;
  }

  function lambert(color, extra) {
    var o = { color: color };
    var k;
    if (extra) {
      for (k in extra) { o[k] = extra[k]; }
    }
    return new THREE.MeshLambertMaterial(o);
  }

  // State animasi + tombol E disimpan di S._rookState supaya tick tetap
  // jalan baik dipanggil lewat controller createRook maupun H.Rook langsung.
  function rookState(S) {
    if (!S._rookState) {
      S._rookState = { phase: 0, eWas: false, mesh: null };
    }
    return S._rookState;
  }

  // ------------------------------------------------------------------
  // buildRookMesh(S): figur Rook — jaket teal, celana gelap, topi merah.
  // Lengan/kaki digantung pada pivot Group supaya bisa berayun.
  // ------------------------------------------------------------------
  function buildRookMesh(S) {
    var g = new THREE.Group();
    var jacket = lambert(0x1a7a6a); // teal
    var jacketDark = lambert(0x14584c);
    var pants = lambert(0x23232e);
    var skin = lambert(0xd9a077);
    var capRed = lambert(0xc23b2e);
    var shoe = lambert(0x1a1a1a);

    function limbBox(w, h, d, mat, x, y, z) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      return m;
    }

    // Kaki: pivot di pinggul (y 0.78), kotak menjuntai ke bawah.
    var legL = new THREE.Group();
    legL.position.set(-0.12, 0.8, 0);
    legL.add(limbBox(0.17, 0.72, 0.19, pants, 0, -0.36, 0));
    legL.add(limbBox(0.18, 0.1, 0.3, shoe, 0, -0.74, 0.04));
    g.add(legL);
    var legR = new THREE.Group();
    legR.position.set(0.12, 0.8, 0);
    legR.add(limbBox(0.17, 0.72, 0.19, pants, 0, -0.36, 0));
    legR.add(limbBox(0.18, 0.1, 0.3, shoe, 0, -0.74, 0.04));
    g.add(legR);

    // Torso jaket teal + ritsleting + saku + ikat pinggang.
    var torso = limbBox(0.54, 0.66, 0.3, jacket, 0, 1.13, 0);
    g.add(torso);
    g.add(limbBox(0.06, 0.6, 0.02, jacketDark, 0, 1.13, 0.16));
    g.add(limbBox(0.16, 0.14, 0.03, jacketDark, -0.15, 1.0, 0.16));
    g.add(limbBox(0.16, 0.14, 0.03, jacketDark, 0.15, 1.0, 0.16));
    g.add(limbBox(0.56, 0.08, 0.32, lambert(0x14141c), 0, 0.8, 0));
    // Kerah jaket terangkat.
    g.add(limbBox(0.4, 0.12, 0.26, jacketDark, 0, 1.48, 0));

    // Lengan: pivot di bahu (y 1.42), kotak menjuntai ke bawah.
    var armL = new THREE.Group();
    armL.position.set(-0.33, 1.42, 0);
    armL.add(limbBox(0.14, 0.6, 0.16, jacket, 0, -0.3, 0));
    armL.add(limbBox(0.13, 0.12, 0.15, skin, 0, -0.64, 0));
    g.add(armL);
    var armR = new THREE.Group();
    armR.position.set(0.33, 1.42, 0);
    armR.add(limbBox(0.14, 0.6, 0.16, jacket, 0, -0.3, 0));
    armR.add(limbBox(0.13, 0.12, 0.15, skin, 0, -0.64, 0));
    g.add(armR);

    // Kepala + topi merah (ciri khas Rook).
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skin);
    head.position.set(0, 1.66, 0);
    head.castShadow = true;
    g.add(head);
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.23, 0.09, 12), capRed);
    cap.position.set(0, 1.84, 0);
    cap.castShadow = true;
    g.add(cap);
    var brim = limbBox(0.3, 0.04, 0.24, capRed, 0, 1.8, 0.2);
    g.add(brim);
    // Kacamata hitam tipis — pembeda siluet dari jauh.
    g.add(limbBox(0.3, 0.06, 0.04, lambert(0x141414), 0, 1.68, 0.19));

    g.userData.limbs = { armL: armL, armR: armR, legL: legL, legR: legR };
    return g;
  }

  // ------------------------------------------------------------------
  // _nearestCar(S): mobil terdekat dalam ENTER_DIST, dari parkedCars
  // dan cars. Null bila tidak ada.
  // ------------------------------------------------------------------
  function nearestCar(S) {
    var best = null;
    var bestD = ENTER_DIST;
    var i, list, car, dx, dz, d;
    var lists = [];
    if (S.parkedCars) { lists.push(S.parkedCars); }
    if (S.cars) { lists.push(S.cars); }
    for (var l = 0; l < lists.length; l++) {
      list = lists[l];
      for (i = 0; i < list.length; i++) {
        car = list[i];
        if (!car || !car.pos) { continue; }
        dx = car.pos.x - S.player.pos.x;
        dz = car.pos.z - S.player.pos.z;
        d = Math.sqrt(dx * dx + dz * dz);
        if (d < bestD) { bestD = d; best = car; }
      }
    }
    return best;
  }

  function addHeatSafe(S, n) {
    if (H.Police && H.Police.addHeat) {
      H.Police.addHeat(S, n);
    } else if (S.player) {
      S.player.heat = clamp((S.player.heat || 0) + n, 0, 100);
    }
  }

  // ------------------------------------------------------------------
  // enterCar(S, car) / exitCar(S)
  // ------------------------------------------------------------------
  function enterCar(S, car) {
    if (!car || !S.player) { return; }
    var st = rookState(S);
    var wasParked = car.parked === true;
    S.player.onFoot = false;
    S.player.vehicle = car;
    S.player.heading = car.heading;
    S.player.pos.set(car.pos.x, 0, car.pos.z);
    S.player.speed = car.speed || 0;
    // Mobil parkir yang diambil keluar dari daftar parkir.
    if (S.parkedCars) {
      var idx = S.parkedCars.indexOf(car);
      if (idx >= 0) { S.parkedCars.splice(idx, 1); }
    }
    if (wasParked) {
      car._wasParked = true;
      car.parked = false;
      addHeatSafe(S, HEAT_STOLEN); // mencuri mobil menaikkan heat
    }
    if (st.mesh) { st.mesh.visible = false; }
  }

  function exitCar(S) {
    var car = S.player && S.player.vehicle;
    if (!car) { return; }
    var st = rookState(S);
    S.player.vehicle = null;
    S.player.onFoot = true;
    S.player.speed = 0;
    // Muncul di samping mobil (sisi tegak lurus arah hadap).
    var sx = Math.cos(S.player.heading);
    var sz = -Math.sin(S.player.heading);
    S.player.pos.set(car.pos.x + sx * 2.4, 0, car.pos.z + sz * 2.4);
    S.player.pos.x = clamp(S.player.pos.x, -HALF, HALF);
    S.player.pos.z = clamp(S.player.pos.z, -HALF, HALF);
    // Mobil yang tadinya parkir kembali jadi mobil parkir di tempatnya.
    if (car._wasParked) {
      car._wasParked = false;
      car.parked = true;
      if (S.parkedCars && S.parkedCars.indexOf(car) < 0) {
        S.parkedCars.push(car);
      }
    }
    if (st.mesh) {
      st.mesh.visible = true;
      st.mesh.position.set(S.player.pos.x, 0, S.player.pos.z);
      st.mesh.rotation.y = S.player.heading;
    }
  }

  // ------------------------------------------------------------------
  // tick(dt, S): gerakan pemain tiap frame.
  // ------------------------------------------------------------------
  function tick(dt, S) {
    var st = rookState(S);
    var keys = (S.input && S.input.keys) || {};
    var p = S.player;
    if (!p) { return; }
    var mesh = st.mesh;
    var limbs = mesh && mesh.userData ? mesh.userData.limbs : null;

    // Tombol E: edge trigger (sekali per tekanan).
    var eDown = !!keys['KeyE'];
    if (eDown && !st.eWas) {
      if (p.onFoot) {
        var near = nearestCar(S);
        if (near) { enterCar(S, near); }
      } else {
        exitCar(S);
      }
    }
    st.eWas = eDown;

    if (p.onFoot) {
      var turn = (keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0);
      p.heading += turn * TURN_RATE * dt;
      var running = !!(keys['ShiftLeft'] || keys['ShiftRight']);
      var top = running ? RUN_SPEED : WALK_SPEED;
      var fwd = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 0.5 : 0);
      var spd = fwd * top;
      p.speed = spd;
      p.pos.x += Math.sin(p.heading) * spd * dt;
      p.pos.z += Math.cos(p.heading) * spd * dt;
      p.pos.x = clamp(p.pos.x, -HALF, HALF);
      p.pos.z = clamp(p.pos.z, -HALF, HALF);
      // Ayun lengan/kaki sebanding kecepatan.
      st.phase += Math.abs(spd) * dt * 1.7;
      var swing = Math.sin(st.phase) * clamp(Math.abs(spd) / RUN_SPEED, 0, 1) * 0.6;
      if (limbs) {
        limbs.legL.rotation.x = swing;
        limbs.legR.rotation.x = -swing;
        limbs.armL.rotation.x = -swing;
        limbs.armR.rotation.x = swing;
      }
      if (mesh) {
        mesh.visible = true;
        mesh.position.set(p.pos.x, 0, p.pos.z);
        mesh.rotation.y = p.heading;
      }
    } else {
      var car = p.vehicle;
      if (car && car.pos) {
        var model = car.model || { topSpeed: 34, accel: 15, grip: 1.0 };
        var gas = keys['KeyW'] ? 1 : 0;
        var brake = keys['KeyS'] ? 1 : 0;
        var accelNow = 0;
        if (gas) { accelNow = model.accel; }
        if (brake) { accelNow = car.speed > 0.5 ? -22 : -model.accel * 0.55; }
        car.speed += accelNow * dt;
        // Gesekan + hambatan angin ringan saat tidak nge-gas.
        if (!gas && !brake) { car.speed -= car.speed * 0.55 * dt; }
        if (car.speed > model.topSpeed) { car.speed = model.topSpeed; }
        if (car.speed < -8) { car.speed = -8; }
        if (Math.abs(car.speed) < 0.05 && !gas && !brake) { car.speed = 0; }
        car._accelNow = accelNow;
        var steer = (keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0);
        car.steer = steer;
        var steerFactor = clamp(car.speed / 10, -1, 1) * (model.grip || 1);
        p.heading += steer * steerFactor * STEER_RATE * dt;
        car.heading = p.heading;
        car.pos.x += Math.sin(p.heading) * car.speed * dt;
        car.pos.z += Math.cos(p.heading) * car.speed * dt;
        car.pos.x = clamp(car.pos.x, -HALF, HALF);
        car.pos.z = clamp(car.pos.z, -HALF, HALF);
        car.mesh.rotation.y = p.heading;
        p.pos.set(car.pos.x, 0, car.pos.z);
        p.speed = car.speed;
        if (H.Vehicles && H.Vehicles.tickCarVisual) {
          H.Vehicles.tickCarVisual(car, dt);
        }
      }
      if (mesh) { mesh.visible = false; }
    }
  }

  // ------------------------------------------------------------------
  // createRook(S): bangun mesh Rook di S.player.pos, kembalikan controller.
  // Controller: pos() -> Vector3 live, heading properti numerik yang
  // selalu sama dengan S.player.heading, tick/_nearestCar/enterCar/exitCar.
  // ------------------------------------------------------------------
  function createRook(S) {
    var mesh = buildRookMesh(S);
    mesh.position.set(S.player.pos.x, 0, S.player.pos.z);
    mesh.rotation.y = S.player.heading;
    if (S.scene) { S.scene.add(mesh); }
    var st = rookState(S);
    st.mesh = mesh;
    st.phase = 0;
    st.eWas = false;

    var rook = {
      mesh: mesh,
      pos: function () { return S.player.pos; },
      tick: function (dt, s2) { tick(dt, s2 || S); },
      _nearestCar: function (s2) { return nearestCar(s2 || S); },
      enterCar: function (s2, car) { enterCar(s2 || S, car); },
      exitCar: function (s2) { exitCar(s2 || S); },
      buildRookMesh: function (s2) { return buildRookMesh(s2 || S); }
    };
    Object.defineProperty(rook, 'heading', {
      get: function () { return S.player.heading; },
      set: function (v) { S.player.heading = v; },
      enumerable: true,
      configurable: true
    });
    S._rook = rook;
    return rook;
  }

  // Namespace H.Rook: factory + semua method berdiri sendiri (memakai
  // S._rookState / S._rook bila ada) supaya main.js bisa memanggil lewat
  // jalur mana pun tanpa crash.
  var Rook = {
    createRook: createRook,
    buildRookMesh: buildRookMesh,
    tick: function (dt, S) {
      if (S._rook) { S._rook.tick(dt, S); } else { tick(dt, S); }
    },
    _nearestCar: nearestCar,
    enterCar: enterCar,
    exitCar: exitCar
  };
  H.Rook = Rook;
})();
