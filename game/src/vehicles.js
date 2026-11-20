// vehicles.js — car factory and arcade driving: acceleration, steering,
// handbrake drift, damage, enter/exit, and stealing (parked or traffic cars).
(function (global) {
  'use strict';
  var CFG = global.NH.CFG;

  var wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  var wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  var glassMat = new THREE.MeshLambertMaterial({ color: 0x223344 });

  function makeCarMesh(type, colorHex) {
    var spec = CFG.cars[type] || CFG.cars.sedan;
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: colorHex !== undefined ? colorHex : spec.color });
    var body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 4.2), bodyMat);
    body.position.y = 0.55; body.castShadow = true;
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2), glassMat);
    cabin.position.set(0, 1.1, -0.2); cabin.castShadow = true;
    g.add(body); g.add(cabin);
    if (type === 'truck') {
      var bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 1.8),
        new THREE.MeshLambertMaterial({ color: 0x4a4a4a }));
      bed.position.set(0, 1.1, -1.1); bed.castShadow = true;
      g.add(bed);
    }
    var wheels = [];
    [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]].forEach(function (p) {
      var w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(p[0], 0.38, p[1]);
      g.add(w); wheels.push(w);
    });
    if (type === 'police') {
      var bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5),
        new THREE.MeshLambertMaterial({ color: 0x222222 }));
      bar.position.set(0, 1.5, -0.2);
      g.add(bar);
      var l1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      l1.position.set(-0.32, 1.62, -0.2);
      var l2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x2244ff }));
      l2.position.set(0.32, 1.62, -0.2);
      g.add(l1); g.add(l2);
      g.userData.lights = [l1, l2];
    }
    if (type === 'taxi') {
      var sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4),
        new THREE.MeshBasicMaterial({ color: 0xffe600 }));
      sign.position.set(0, 1.55, -0.2);
      g.add(sign);
    }
    g.userData.wheels = wheels;
    return g;
  }

  // Arcade car state: { mesh, type, speed, heading, damage, driver, parked }.
  function makeCar(scene, type, x, z, heading, colorHex) {
    var mesh = makeCarMesh(type, colorHex);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading || 0;
    scene.add(mesh);
    var car = {
      mesh: mesh, type: type, spec: CFG.cars[type] || CFG.cars.sedan,
      speed: 0, heading: heading || 0, damage: 0,
      driver: null, parked: true, horn: 0,
    };
    return car;
  }

  function driveCar(car, input, dt, world) {
    var spec = car.spec;
    if (input.forward) car.speed += spec.accel * dt;
    if (input.back) car.speed -= spec.accel * 0.75 * dt;
    if (!input.forward && !input.back) car.speed *= (1 - 0.6 * dt);
    var drift = input.handbrake ? 0.45 : 1;
    var steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    car.heading += steer * spec.grip * drift * dt * Math.sign(car.speed || 1) * Math.min(1, Math.abs(car.speed) / 8 + 0.25);
    if (input.handbrake) car.speed *= (1 - 1.4 * dt);
    car.speed = Math.max(-spec.top * 0.4, Math.min(spec.top, car.speed));
    var nx = car.mesh.position.x + Math.sin(car.heading) * car.speed * dt;
    var nz = car.mesh.position.z + Math.cos(car.heading) * car.speed * dt;
    var hit = world.collides(nx, nz, 1.6);
    if (hit) {
      car.speed *= -0.25;
      car.damage += Math.abs(car.speed) * 0.4 + 2;
      nx = car.mesh.position.x; nz = car.mesh.position.z;
    }
    nx = Math.max(-260, Math.min(260, nx));
    nz = Math.max(-260, Math.min(260, nz));
    car.mesh.position.x = nx;
    car.mesh.position.z = nz;
    car.mesh.rotation.y = car.heading;
    var spin = car.speed * dt * 2.4;
    car.mesh.userData.wheels.forEach(function (w) { w.rotation.x += spin; });
    if (car.mesh.userData.lights) {
      var on = Math.floor(performance.now() / 260) % 2 === 0;
      car.mesh.userData.lights[0].material.color.setHex(on ? 0xff2222 : 0x441111);
      car.mesh.userData.lights[1].material.color.setHex(on ? 0x111144 : 0x2244ff);
    }
    return car;
  }

  global.NH.makeCar = makeCar;
  global.NH.driveCar = driveCar;
  global.NH.makeCarMesh = makeCarMesh;
})(window);
