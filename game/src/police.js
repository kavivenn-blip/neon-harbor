// police.js — Neon Harbor: sistem wanted + polisi + helikopter.
// Satu job: mengubah heat pemain menjadi bintang wanted, men-spawn unit
// cruiser sesuai band bintang (dispatch call sign berurutan), mengejar +
// menabrak pemain, memasang roadblock di bintang 3+, dan menerbangkan
// helikopter berspotlight di bintang 4-5.
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

  var HEAT_PER_STAR = pick('WANTED.heatPerStar', 20);
  var MAX_STARS = pick('WANTED.maxStars', 5);
  var HEAT_DECAY = pick('WANTED.heatDecayPerSecond', 1.2);
  var HELI_HEIGHT = pick('TUNING.heliHeight', 42);
  var HELI_SHOT_HEIGHT = pick('TUNING.heliShotHeight', 20);
  var HALF = pick('CITY.halfExtent', 200);

  // Jumlah cruiser per bintang 0..5; heli hanya 4-5; roadblock 3-5.
  var CRUISERS_PER_STAR = [0, 1, 2, 3, 3, 4];

  // Call sign dispatch, dipakai BERURUTAN saat unit ditambah.
  var DISPATCH_SIGNS = [
    { sign: 'DOCK-1', role: 'RAMMING' },
    { sign: 'PIER-2', role: 'PURSUIT' },
    { sign: 'STRAND-3', role: 'SHORE WATCH' },
    { sign: 'TOWER-4', role: 'RESPONDING' },
    { sign: 'COURT-5', role: 'CLOSING IN' },
    { sign: 'GREEN-6', role: 'PATROL' },
    { sign: 'AIR-1', role: 'SPOTLIGHT' },
    { sign: 'DOCK-7', role: 'ROADBLOCK' }
  ];

  // Unit patroli yang ditampilkan HUD saat wanted 0 (jarak fallback).
  var IDLE_PATROL = [
    { sign: 'GREEN-6', role: 'PATROL', distM: 120 },
    { sign: 'TOWER-4', role: 'PATROL', distM: 240 },
    { sign: 'COURT-5', role: 'PATROL', distM: 380 }
  ];

  function clamp(v, lo, hi) {
    if (v < lo) { return lo; }
    if (v > hi) { return hi; }
    return v;
  }

  function clampStar(n) {
    return clamp(Math.floor(n || 0), 0, MAX_STARS);
  }

  function dist2D(ax, az, bx, bz) {
    var dx = ax - bx;
    var dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function wrapAngle(a) {
    while (a > Math.PI) { a -= Math.PI * 2; }
    while (a < -Math.PI) { a += Math.PI * 2; }
    return a;
  }

  function turnToward(current, target, maxStep) {
    var d = wrapAngle(target - current);
    if (d > maxStep) { d = maxStep; }
    if (d < -maxStep) { d = -maxStep; }
    return current + d;
  }

  function policeState(S) {
    if (!S.police) {
      S.police = { units: [], heli: null, roadblocks: [] };
    }
    if (!S.police.units) { S.police.units = []; }
    return S.police;
  }

  function rngOf(S) {
    return (S && S.rng) || Math.random;
  }

  // ------------------------------------------------------------------
  // heatToWanted(heat): bintang 0..5.
  // ------------------------------------------------------------------
  function heatToWanted(heat) {
    return clamp(Math.floor((heat || 0) / HEAT_PER_STAR), 0, MAX_STARS);
  }

  // ------------------------------------------------------------------
  // addHeat(S, n): tambah heat pemain, clamp 0..100.
  // ------------------------------------------------------------------
  function addHeat(S, n) {
    if (!S.player) { return; }
    S.player.heat = clamp((S.player.heat || 0) + n, 0, 100);
  }

  // ------------------------------------------------------------------
  // spawnUnits(S, wantedStars): sesuaikan jumlah unit dengan band bintang.
  // Unit baru memakai DISPATCH_SIGNS berurutan; kelebihan dihapus dari
  // belakang (mesh-nya juga dikeluarkan dari scene).
  // ------------------------------------------------------------------
  function spawnUnits(S, wantedStars) {
    var stars = clampStar(wantedStars);
    var want = CRUISERS_PER_STAR[stars];
    var pol = policeState(S);
    var rng = rngOf(S);
    var p = S.player ? S.player.pos : { x: 0, z: 0 };
    var i, unit, car, ang, rx, rz, heading;

    while (pol.units.length < want) {
      i = pol.units.length;
      var ds = DISPATCH_SIGNS[i] || { sign: 'UNIT-' + (i + 1), role: 'PURSUIT' };
      // Spawn di ring 40..70 m dari pemain, menghadap ke pemain.
      ang = rng() * Math.PI * 2;
      rx = clamp(p.x + Math.cos(ang) * (40 + rng() * 30), -HALF, HALF);
      rz = clamp(p.z + Math.sin(ang) * (40 + rng() * 30), -HALF, HALF);
      heading = Math.atan2(p.x - rx, p.z - rz);
      car = H.Vehicles.buildCar(S, 'cruiser', rx, rz, heading);
      car.road = 'z';
      car.speed = 10 + rng() * 6;
      if (S.scene) { S.scene.add(car.mesh); }
      unit = {
        sign: ds.sign,
        role: ds.role,
        car: car,
        state: 'pursue',
        distM: dist2D(rx, rz, p.x, p.z)
      };
      pol.units.push(unit);
    }
    while (pol.units.length > want) {
      unit = pol.units.pop();
      if (unit && unit.car && unit.car.mesh && S.scene) {
        S.scene.remove(unit.car.mesh);
      }
    }
    return pol.units;
  }

  // ------------------------------------------------------------------
  // buildHelicopter(S): bodi + boom ekor + rotor utama/ekor + skid +
  // lampu sorot (cone + SpotLight) mengarah ke bawah-depan.
  // ------------------------------------------------------------------
  function buildHelicopter(S) {
    var pol = policeState(S);
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: 0x223344 });
    var whiteMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    var darkMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
    var glassMat = new THREE.MeshLambertMaterial({
      color: 0x14202c, emissive: 0x0a141e, emissiveIntensity: 0.6
    });

    function bx(w, h, d, mat, x, y, z) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    }

    bx(2.2, 1.4, 4.2, bodyMat, 0, 0, 0); // bodi
    bx(2.24, 0.5, 4.24, whiteMat, 0, -0.1, 0); // strip putih
    bx(1.8, 0.8, 0.9, glassMat, 0, 0.1, 2.0); // kokpit kaca depan
    bx(0.5, 0.5, 4.6, bodyMat, 0, 0.25, -4.2); // boom ekor
    bx(0.12, 1.6, 1.0, whiteMat, 0, 0.7, -6.4); // sirip ekor
    // Rotor ekor kecil di ujung boom.
    var tailRotor = new THREE.Group();
    var tr1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 0.12), darkMat);
    tailRotor.add(tr1);
    var tr2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 1.8), darkMat);
    tailRotor.add(tr2);
    tailRotor.position.set(0.35, 0.4, -6.4);
    g.add(tailRotor);
    // Skid pendarat.
    var skidL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.4, 6), darkMat);
    skidL.rotation.x = Math.PI / 2;
    skidL.position.set(-0.95, -1.05, 0);
    g.add(skidL);
    var skidR = skidL.clone();
    skidR.position.x = 0.95;
    g.add(skidR);
    bx(0.1, 0.4, 0.1, darkMat, -0.95, -0.8, 1.2);
    bx(0.1, 0.4, 0.1, darkMat, 0.95, -0.8, 1.2);
    bx(0.1, 0.4, 0.1, darkMat, -0.95, -0.8, -1.2);
    bx(0.1, 0.4, 0.1, darkMat, 0.95, -0.8, -1.2);
    // Lampu sorot: cone tembus pandang + SpotLight.
    var beamMat = new THREE.MeshLambertMaterial({
      color: 0xfff2c0, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide
    });
    var beam = new THREE.Mesh(new THREE.ConeGeometry(4.5, 16, 16, 1, true), beamMat);
    beam.position.set(0, -8.5, 2.5);
    beam.rotation.x = Math.PI; // kerucut mengarah ke bawah
    g.add(beam);
    var lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 1.6 })
    );
    lamp.position.set(0, -0.8, 2.2);
    g.add(lamp);
    var spot = new THREE.SpotLight(0xfff2c0, 1.4, 70, 0.45, 0.4, 1);
    spot.position.set(0, -0.8, 2.2);
    g.add(spot);
    var spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, -16, 4);
    g.add(spotTarget);
    spot.target = spotTarget;

    // Rotor utama: dua bilah bersilangan di atas bodi.
    var rotor = new THREE.Group();
    var blade1 = new THREE.Mesh(new THREE.BoxGeometry(11, 0.09, 0.4), darkMat);
    rotor.add(blade1);
    var blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, 11), darkMat);
    rotor.add(blade2);
    var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 8), whiteMat);
    rotor.add(hub);
    rotor.position.set(0, 1.05, 0);
    g.add(rotor);

    var p = S.player ? S.player.pos : { x: 0, z: 0 };
    g.position.set(p.x + 25, HELI_HEIGHT, p.z + 25);
    if (S.scene) { S.scene.add(g); }
    var heli = {
      mesh: g,
      rotor: rotor,
      tailRotor: tailRotor,
      beam: beam,
      spot: spot,
      pos: g.position,
      angle: 0
    };
    pol.heli = heli;
    return heli;
  }

  // ------------------------------------------------------------------
  // stageHelicopter(S, anchor): tempatkan heli RENDAH (heliShotHeight)
  // di depan-samping anchor supaya TERLIHAT di frame kamera.
  // ------------------------------------------------------------------
  function stageHelicopter(S, anchor) {
    var pol = policeState(S);
    if (!pol.heli) { buildHelicopter(S); }
    var heli = pol.heli;
    if (!heli) { return null; }
    var ax = 0, az = 0, hd = null;
    if (anchor) {
      if (typeof anchor.x === 'number') { ax = anchor.x; az = anchor.z; }
      else if (anchor.length >= 3) { ax = anchor[0]; az = anchor[2]; }
      if (typeof anchor.heading === 'number') { hd = anchor.heading; }
    }
    var fx = 0, fz = 1;
    if (hd !== null) {
      fx = Math.sin(hd);
      fz = Math.cos(hd);
    } else {
      var cx = -ax, cz = -az;
      var cl = Math.sqrt(cx * cx + cz * cz);
      if (cl > 1) { fx = cx / cl; fz = cz / cl; }
    }
    // Depan-samping: 16 m ke depan, 10 m ke kanan.
    var px = -fz, pz = fx; // vektor kanan (tegak lurus depan)
    heli.pos.set(
      ax + fx * 16 + px * 10,
      HELI_SHOT_HEIGHT,
      az + fz * 16 + pz * 10
    );
    heli.angle = Math.atan2(ax - heli.pos.x, az - heli.pos.z);
    heli.rotor.rotation.y += 0.6;
    return heli;
  }

  // ------------------------------------------------------------------
  // dispatchUnits(S): daftar unit untuk HUD.
  // ------------------------------------------------------------------
  function dispatchUnits(S) {
    var pol = policeState(S);
    var wanted = S.player ? (S.player.wanted || 0) : 0;
    var out = [];
    var i, u;
    if (wanted > 0) {
      for (i = 0; i < pol.units.length; i++) {
        u = pol.units[i];
        out.push({ sign: u.sign, role: u.role, distM: Math.round(u.distM || 0) });
      }
      if (pol.heli) {
        var hp = pol.heli.pos;
        var pp = S.player.pos;
        out.push({
          sign: 'AIR-1',
          role: 'SPOTLIGHT',
          distM: Math.round(dist2D(hp.x, hp.z, pp.x, pp.z))
        });
      }
      return out;
    }
    // Wanted 0: 3 unit patroli; pakai jarak nyata bila unit itu ada.
    for (i = 0; i < IDLE_PATROL.length; i++) {
      var idle = IDLE_PATROL[i];
      var found = null;
      for (var k = 0; k < pol.units.length; k++) {
        if (pol.units[k].sign === idle.sign) { found = pol.units[k]; break; }
      }
      out.push({
        sign: idle.sign,
        role: 'PATROL',
        distM: found ? Math.round(found.distM || idle.distM) : idle.distM
      });
    }
    return out;
  }

  // ------------------------------------------------------------------
  // tickPolice(dt, S): tiap frame — decay heat, hitung wanted, sesuaikan
  // unit + heli, kejar / tabrak / roadblock, update jarak tiap unit.
  // ------------------------------------------------------------------
  function tickPolice(dt, S) {
    if (!S || !S.player) { return; }
    var pol = policeState(S);
    var p = S.player;
    var rng = rngOf(S);

    // Wanted dihitung dari heat SEBELUM decay frame ini: heat 100 harus
    // terlihat sebagai 5 bintang di frame itu juga (bila decay dulu,
    // 100 langsung jadi 99,98 dan bintang 5 tidak pernah tercapai).
    var wanted = heatToWanted(p.heat);
    p.wanted = wanted;
    p.heat = Math.max(0, (p.heat || 0) - HEAT_DECAY * dt);

    // Jumlah unit harus cocok dengan band bintang.
    var wantCount = CRUISERS_PER_STAR[wanted];
    if (pol.units.length !== wantCount) {
      spawnUnits(S, wanted);
    }

    // Helikopter: ada di bintang 4-5, hilang di bawah itu.
    var wantHeli = wanted >= 4;
    if (wantHeli && !pol.heli) { buildHelicopter(S); }
    if (!wantHeli && pol.heli) {
      if (S.scene) { S.scene.remove(pol.heli.mesh); }
      pol.heli = null;
    }

    var i, unit, car, dx, dz, dist;
    var cruiserSpec = H.carModel ? H.carModel('cruiser') : { topSpeed: 42, accel: 20 };
    var topSpeed = cruiserSpec.topSpeed || 42;

    for (i = 0; i < pol.units.length; i++) {
      unit = pol.units[i];
      car = unit.car;
      if (!car || !car.pos) { continue; }
      dx = p.pos.x - car.pos.x;
      dz = p.pos.z - car.pos.z;
      dist = Math.sqrt(dx * dx + dz * dz);
      unit.distM = dist;

      // Unit terakhir jadi roadblock saat bintang >= 3.
      if (wanted >= 3 && i === pol.units.length - 1 && pol.units.length > 1) {
        unit.state = 'roadblock';
        var aheadX = p.pos.x + Math.sin(p.heading) * 20;
        var aheadZ = p.pos.z + Math.cos(p.heading) * 20;
        var tdx = aheadX - car.pos.x;
        var tdz = aheadZ - car.pos.z;
        var tdist = Math.sqrt(tdx * tdx + tdz * tdz);
        var targetHeading = p.heading + Math.PI / 2; // melintang di jalan
        car.heading = turnToward(car.heading, targetHeading, 2.4 * dt);
        if (tdist > 1.5) {
          car.speed = Math.min(24, car.speed + 18 * dt);
          car.pos.x += Math.sin(car.heading) * car.speed * dt;
          car.pos.z += Math.cos(car.heading) * car.speed * dt;
        } else {
          car.speed = 0;
          car.heading = targetHeading;
        }
        car.mesh.rotation.y = car.heading;
        if (H.Vehicles && H.Vehicles.tickCarVisual) {
          H.Vehicles.tickCarVisual(car, dt);
        }
        continue;
      }

      // Pursue: setir ke arah pemain, kejar mendekati topSpeed cruiser.
      unit.state = dist < 4 ? 'ram' : 'pursue';
      var desired = Math.atan2(dx, dz);
      car.heading = turnToward(car.heading, desired, 2.3 * dt);
      var targetSpeed = dist > 60 ? topSpeed : topSpeed * 0.85;
      if (car.speed < targetSpeed) {
        car.speed = Math.min(targetSpeed, car.speed + 20 * dt);
      } else if (car.speed > targetSpeed) {
        car.speed = Math.max(targetSpeed, car.speed - 12 * dt);
      }
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      car.pos.x = clamp(car.pos.x, -HALF - 10, HALF + 10);
      car.pos.z = clamp(car.pos.z, -HALF - 10, HALF + 10);
      car.mesh.rotation.y = car.heading;

      // Ram: sentuh pemain dalam 4 m -> dorong + damage kecil.
      if (dist < 4) {
        var push = 26 * dt;
        var nx = dx / (dist || 1);
        var nz = dz / (dist || 1);
        // Dorong pemain menjauhi mobil polisi.
        p.pos.x -= nx * push * 0.4;
        p.pos.z -= nz * push * 0.4;
        p.pos.x = clamp(p.pos.x, -HALF, HALF);
        p.pos.z = clamp(p.pos.z, -HALF, HALF);
        var dmg = 5 * dt;
        if ((p.armor || 0) > 0) {
          p.armor = Math.max(0, p.armor - dmg);
        } else if ((p.health || 0) > 0) {
          p.health = Math.max(0, p.health - dmg);
        }
        car.speed *= (1 - 1.5 * dt);
        if (car.speed < 4) { car.speed = 4; }
      }
      if (H.Vehicles && H.Vehicles.tickCarVisual) {
        H.Vehicles.tickCarVisual(car, dt);
      }
    }

    // Helikopter: orbit pelan di atas pemain, rotor berputar, sorot ikut.
    if (pol.heli) {
      var heli = pol.heli;
      heli.angle += dt * 0.18;
      var hx = p.pos.x + Math.cos(heli.angle) * 30;
      var hz = p.pos.z + Math.sin(heli.angle) * 30;
      var lerp = Math.min(1, dt * 1.6);
      heli.pos.x += (hx - heli.pos.x) * lerp;
      heli.pos.z += (hz - heli.pos.z) * lerp;
      heli.pos.y += (HELI_HEIGHT - heli.pos.y) * Math.min(1, dt * 1.2);
      heli.rotor.rotation.y += dt * 18;
      if (heli.tailRotor) { heli.tailRotor.rotation.z += dt * 24; }
      heli.mesh.rotation.y = Math.atan2(p.pos.x - heli.pos.x, p.pos.z - heli.pos.z);
      // Sorot mengarah ke pemain (target spotlight mengikuti).
      if (heli.spot && heli.spot.target) {
        var local = heli.mesh.worldToLocal
          ? heli.mesh.worldToLocal(new THREE.Vector3(p.pos.x, 0, p.pos.z))
          : null;
        if (local) { heli.spot.target.position.copy(local); }
      }
    }
  }

  H.Police = {
    spawnUnits: spawnUnits,
    tickPolice: tickPolice,
    dispatchUnits: dispatchUnits,
    buildHelicopter: buildHelicopter,
    stageHelicopter: stageHelicopter,
    heatToWanted: heatToWanted,
    addHeat: addHeat
  };
})();
