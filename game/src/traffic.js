// traffic.js — Neon Harbor v2 city life: traffic cars that follow the road
// grid and pedestrians who walk the sidewalks, cross at intersections, and
// flee from danger. v2: more of both (18 cars, 36 peds), pedestrians with
// legs + caps so they read as people, and a stageDensity helper that gathers
// traffic + peds near a point so screenshots show a busy street.
(function (global) {
  'use strict';
  var CFG = global.NH.CFG;

  function makeTraffic(scene, world) {
    var rnd = global.NH.RNG(CFG.seed + 7);
    var types = ['sedan', 'sedan', 'taxi', 'truck', 'sports'];
    var cars = [];
    for (var i = 0; i < CFG.trafficCars; i++) {
      var p = world.randomRoadPoint();
      var axis = Math.abs(p.x) > Math.abs(p.z) ? 'z' : 'x';
      var dir = rnd() < 0.5 ? 1 : -1;
      var type = types[Math.floor(rnd() * types.length)];
      var car = global.NH.makeCar(scene, type, p.x, p.z, axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI));
      car.parked = false;
      car.driver = { ai: true };
      car.traffic = { axis: axis, dir: dir, speed: 7 + rnd() * 5 };
      cars.push(car);
    }
    return { cars: cars, rnd: rnd };
  }

  function updateTraffic(t, dt, world, danger) {
    var lines = world.roadLines;
    t.cars.forEach(function (car) {
      var tr = car.traffic;
      var sp = tr.speed;
      // Slow near the player / danger.
      if (danger && Math.hypot(car.mesh.position.x - danger.x, car.mesh.position.z - danger.z) < 14) sp *= 0.35;
      var nx = car.mesh.position.x, nz = car.mesh.position.z;
      if (tr.axis === 'x') nx += tr.dir * sp * dt; else nz += tr.dir * sp * dt;
      // At an intersection, sometimes turn onto the cross road.
      var onLine = lines.some(function (l) { return Math.abs((tr.axis === 'x' ? nx : nz) - l) < 1.2; });
      if (onLine && t.rnd() < dt * 0.5) {
        tr.axis = tr.axis === 'x' ? 'z' : 'x';
        tr.dir = t.rnd() < 0.5 ? 1 : -1;
        car.heading = tr.axis === 'x' ? (tr.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (tr.dir > 0 ? 0 : Math.PI);
        car.mesh.rotation.y = car.heading;
      }
      // Wrap around the city edge.
      if (nx > 215) nx = -215; if (nx < -215) nx = 215;
      if (nz > 215) nz = -215; if (nz < -215) nz = 215;
      car.mesh.position.x = nx;
      car.mesh.position.z = nz;
      car.speed = sp;
    });
  }

  // Gather traffic + peds near a point (for screenshot staging): move the
  // first N traffic cars onto the road ahead/behind the point and the first
  // M peds onto the nearby sidewalk, so the frame reads busy. They keep
  // driving/walking afterwards — the shot is taken within seconds.
  function stageDensity(traffic, peds, x, z, heading, nCars, nPeds) {
    var rnd = global.NH.RNG(1234);
    var count = 0;
    traffic.cars.forEach(function (car) {
      if (count >= nCars) return;
      count++;
      var ahead = (count % 2 === 0 ? 1 : -1) * (10 + rnd() * 26);
      var lane = (rnd() < 0.5 ? -2.6 : 2.6);
      var cx = x + Math.sin(heading) * ahead + Math.cos(heading) * lane;
      var cz = z + Math.cos(heading) * ahead - Math.sin(heading) * lane;
      car.mesh.position.x = cx;
      car.mesh.position.z = cz;
      car.heading = heading + (count % 2 === 0 ? 0 : Math.PI);
      car.mesh.rotation.y = car.heading;
      car.traffic.axis = 'z';
      car.traffic.dir = count % 2 === 0 ? 1 : -1;
      car.traffic.speed = 5 + rnd() * 4;
    });
    var pc = 0;
    peds.peds.forEach(function (p) {
      if (pc >= nPeds) return;
      pc++;
      var side = pc % 2 === 0 ? 1 : -1;
      p.x = x + Math.sin(heading) * (6 + rnd() * 22) + Math.cos(heading) * side * 8;
      p.z = z + Math.cos(heading) * (6 + rnd() * 22) - Math.sin(heading) * side * 8;
      p.mesh.position.x = p.x;
      p.mesh.position.z = p.z;
      p.fleeing = 0;
    });
  }

  function makePedestrians(scene, world) {
    var rnd = global.NH.RNG(CFG.seed + 21);
    var shirts = [0xd8d8d8, 0x4a7a9a, 0x9a4a4a, 0x4a9a5a, 0xc2a23a, 0x7a5a9a];
    var peds = [];
    for (var i = 0; i < CFG.pedestrians; i++) {
      var g = new THREE.Group();
      var shirt = new THREE.MeshLambertMaterial({ color: shirts[i % shirts.length] });
      var skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
      var pants = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
      // Torso + head + legs + arms + cap: a person, not a box on a ball.
      var body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), shirt);
      body.position.y = 1.08; body.castShadow = true;
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
      head.position.y = 1.62;
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.09, 10), shirt);
      cap.position.y = 1.78;
      var legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.22), pants);
      legL.position.set(-0.14, 0.36, 0);
      var legR = legL.clone(); legR.position.x = 0.14;
      var armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.17), shirt);
      armL.position.set(-0.36, 1.1, 0);
      var armR = armL.clone(); armR.position.x = 0.36;
      g.add(body); g.add(head); g.add(cap); g.add(legL); g.add(legR); g.add(armL); g.add(armR);
      g.userData = { legL: legL, legR: legR, armL: armL, armR: armR };
      var p = world.randomRoadPoint();
      // Stand on the sidewalk: offset 8 units from the road line.
      var px = p.x + (rnd() < 0.5 ? 8 : -8), pz = p.z + (rnd() < 0.5 ? 8 : -8);
      g.position.set(px, 0, pz);
      scene.add(g);
      peds.push({
        mesh: g, x: px, z: pz, heading: rnd() * Math.PI * 2,
        speed: 1.2 + rnd() * 1.2, target: null, fleeing: 0, phase: rnd() * 6,
      });
    }
    return { peds: peds, rnd: rnd };
  }

  function updatePedestrians(pd, dt, world, threat) {
    pd.peds.forEach(function (p) {
      var flee = 0;
      if (threat) {
        var d = Math.hypot(p.x - threat.x, p.z - threat.z);
        if (d < (threat.radius || 18)) { flee = 1; p.fleeing = 1.2; }
      }
      if (p.fleeing > 0) {
        p.fleeing -= dt;
        // v2 fix: the threat (muzzle flash) can fade while a ped is still
        // fleeing — keep the current heading instead of reading a null threat.
        if (threat) {
          var dx = p.x - threat.x, dz = p.z - threat.z;
          var l = Math.hypot(dx, dz) || 1;
          p.heading = Math.atan2(dx / l, dz / l);
        }
        p.speed = 5;
      } else {
        p.speed = 1.2 + (p.phase % 1);
        if (!p.target || Math.hypot(p.x - p.target.x, p.z - p.target.z) < 2) {
          var t = world.randomRoadPoint();
          p.target = { x: t.x + 8, z: t.z + 8 };
        }
        p.heading = Math.atan2(p.target.x - p.x, p.target.z - p.z);
      }
      var nx = p.x + Math.sin(p.heading) * p.speed * dt;
      var nz = p.z + Math.cos(p.heading) * p.speed * dt;
      if (!world.collides(nx, nz, 0.4)) { p.x = nx; p.z = nz; }
      p.x = Math.max(-215, Math.min(215, p.x));
      p.z = Math.max(-215, Math.min(215, p.z));
      p.mesh.position.x = p.x;
      p.mesh.position.z = p.z;
      p.mesh.rotation.y = p.heading;
      p.phase += dt * p.speed * 2;
      p.mesh.position.y = Math.abs(Math.sin(p.phase)) * 0.06;
      // Walk swing (v2): legs + arms move so peds read as walking.
      var sw = Math.sin(p.phase) * 0.5;
      if (p.mesh.userData.legL) {
        p.mesh.userData.legL.rotation.x = sw;
        p.mesh.userData.legR.rotation.x = -sw;
        p.mesh.userData.armL.rotation.x = -sw * 0.7;
        p.mesh.userData.armR.rotation.x = sw * 0.7;
      }
    });
  }

  global.NH.makeTraffic = makeTraffic;
  global.NH.updateTraffic = updateTraffic;
  global.NH.stageDensity = stageDensity;
  global.NH.makePedestrians = makePedestrians;
  global.NH.updatePedestrians = updatePedestrians;
})(window);
