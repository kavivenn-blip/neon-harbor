// police.js — wanted level 1-5, patrol cars that chase and ram, roadblocks,
// foot cops, a helicopter at high heat, heat decay, and busted/wasted.
(function (global) {
  'use strict';
  var CFG = global.NH.CFG;

  function makePolice(scene, world) {
    return {
      wanted: 0, heat: 0, lastSeen: 0, bustedTimer: 0,
      cruisers: [], cops: [], heli: null, roadblock: null,
      scene: scene, world: world,
    };
  }

  function addCrime(police, amount, x, z) {
    police.heat = Math.min(100, police.heat + amount);
    var want = police.wanted;
    if (police.heat >= 85) police.wanted = 5;
    else if (police.heat >= 65) police.wanted = 4;
    else if (police.heat >= 45) police.wanted = 3;
    else if (police.heat >= 25) police.wanted = 2;
    else if (police.heat >= 8) police.wanted = 1;
    if (police.wanted !== want) police.lastSeen = 0;
  }

  function spawnCruiser(police, x, z) {
    var p = police.world.randomRoadPoint();
    var car = global.NH.makeCar(police.scene, 'police', p.x, p.z, 0);
    car.parked = false;
    car.driver = { ai: true, police: true };
    police.cruisers.push(car);
    return car;
  }

  function spawnCop(police, x, z) {
    var g = new THREE.Group();
    var navy = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.34), navy);
    body.position.y = 1.05; body.castShadow = true;
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xc98a5a }));
    head.position.y = 1.62;
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 10), navy);
    cap.position.y = 1.8;
    g.add(body); g.add(head); g.add(cap);
    g.position.set(x + 6, 0, z + 6);
    police.scene.add(g);
    var cop = { mesh: g, x: g.position.x, z: g.position.z, speed: 4.5 };
    police.cops.push(cop);
    return cop;
  }

  function makeHeli(scene) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x2a3a4a }));
    body.castShadow = true;
    var rotor = new THREE.Mesh(new THREE.BoxGeometry(7, 0.08, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    rotor.position.y = 0.9;
    var light = new THREE.Mesh(new THREE.ConeGeometry(6, 18, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
    light.position.y = -9;
    light.rotation.x = Math.PI;
    g.add(body); g.add(rotor); g.add(light);
    g.userData.rotor = rotor;
    scene.add(g);
    return g;
  }

  function updatePolice(police, dt, playerPos, inCar) {
    var w = police.wanted;
    // Keep the right number of cruisers out.
    while (police.cruisers.length < w && police.cruisers.length < 5) spawnCruiser(police, playerPos.x, playerPos.z);
    while (police.cruisers.length > w) {
      var gone = police.cruisers.pop();
      police.scene.remove(gone.mesh);
    }
    // Cruisers chase and ram.
    police.cruisers.forEach(function (car) {
      var dx = playerPos.x - car.mesh.position.x;
      var dz = playerPos.z - car.mesh.position.z;
      var dist = Math.hypot(dx, dz) || 1;
      var wantHeading = Math.atan2(dx, dz);
      var dh = wantHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += Math.max(-1.9 * dt, Math.min(1.9 * dt, dh));
      var target = Math.min(car.spec.top, 10 + w * 4);
      car.speed += (target - car.speed) * Math.min(1, dt * 0.8);
      car.mesh.position.x += Math.sin(car.heading) * car.speed * dt;
      car.mesh.position.z += Math.cos(car.heading) * car.speed * dt;
      car.mesh.rotation.y = car.heading;
      if (dist < 3.2) {
        car.speed *= 0.4;
        police.ram = { x: car.mesh.position.x, z: car.mesh.position.z };
      }
    });
    // Foot cops at wanted 2+.
    if (w >= 2) {
      while (police.cops.length < w - 1) spawnCop(police, playerPos.x, playerPos.z);
    } else {
      while (police.cops.length > 0) {
        var c = police.cops.pop();
        police.scene.remove(c.mesh);
      }
    }
    police.cops.forEach(function (cop) {
      var dx = playerPos.x - cop.x, dz = playerPos.z - cop.z;
      var d = Math.hypot(dx, dz) || 1;
      cop.x += (dx / d) * cop.speed * dt;
      cop.z += (dz / d) * cop.speed * dt;
      cop.mesh.position.x = cop.x;
      cop.mesh.position.z = cop.z;
      cop.mesh.rotation.y = Math.atan2(dx, dz);
      cop.dist = d;
    });
    // Helicopter at wanted 4+.
    if (w >= 4 && !police.heli) police.heli = makeHeli(police.scene);
    if (w < 4 && police.heli) { police.scene.remove(police.heli); police.heli = null; }
    if (police.heli) {
      police.heli.position.set(playerPos.x + 10, 42, playerPos.z + 10);
      police.heli.userData.rotor.rotation.y += dt * 22;
      police.heli.lookAt(playerPos.x, 0, playerPos.z);
    }
    // Heat decay when no pursuer is near.
    var nearest = 999;
    police.cruisers.forEach(function (car) {
      nearest = Math.min(nearest, Math.hypot(car.mesh.position.x - playerPos.x, car.mesh.position.z - playerPos.z));
    });
    police.cops.forEach(function (cop) { nearest = Math.min(nearest, cop.dist || 999); });
    if (nearest > 70) {
      police.lastSeen += dt;
      if (police.lastSeen > CFG.heatDecaySeconds) {
        police.heat = Math.max(0, police.heat - dt * 4);
        if (police.heat < 8) police.wanted = 0;
        else if (police.heat < 25) police.wanted = 1;
        else if (police.heat < 45) police.wanted = 2;
        else if (police.heat < 65) police.wanted = 3;
        else if (police.heat < 85) police.wanted = 4;
      }
    } else {
      police.lastSeen = 0;
    }
    // Busted: a foot cop stays touching the on-foot player.
    var busted = false;
    if (!inCar) {
      police.cops.forEach(function (cop) {
        if ((cop.dist || 999) < 1.6) police.bustedTimer += dt; else police.bustedTimer = 0;
      });
      if (police.bustedTimer > 2) busted = true;
    }
    return { busted: busted, nearest: nearest };
  }

  global.NH.makePolice = makePolice;
  global.NH.addCrime = addCrime;
  global.NH.updatePolice = updatePolice;
  global.NH.spawnCruiser = spawnCruiser;
})(window);
