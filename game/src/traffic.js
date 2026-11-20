// traffic.js — city life: traffic cars that follow the road grid and pedestrians
// who walk the sidewalks, cross at intersections, and flee from danger.
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

  function makePedestrians(scene, world) {
    var rnd = global.NH.RNG(CFG.seed + 21);
    var shirts = [0xd8d8d8, 0x4a7a9a, 0x9a4a4a, 0x4a9a5a, 0xc2a23a, 0x7a5a9a];
    var peds = [];
    for (var i = 0; i < CFG.pedestrians; i++) {
      var g = new THREE.Group();
      var shirt = new THREE.MeshLambertMaterial({ color: shirts[i % shirts.length] });
      var body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.32), shirt);
      body.position.y = 1.05; body.castShadow = true;
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0xc98a5a }));
      head.position.y = 1.62;
      g.add(body); g.add(head);
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
        var dx = p.x - threat.x, dz = p.z - threat.z;
        var l = Math.hypot(dx, dz) || 1;
        p.heading = Math.atan2(dx / l, dz / l);
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
    });
  }

  global.NH.makeTraffic = makeTraffic;
  global.NH.updateTraffic = updateTraffic;
  global.NH.makePedestrians = makePedestrians;
  global.NH.updatePedestrians = updatePedestrians;
})(window);
