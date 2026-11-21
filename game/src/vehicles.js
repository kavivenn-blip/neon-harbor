// vehicles.js — Neon Harbor v2 car factory and arcade driving: acceleration,
// steering, handbrake drift, damage, enter/exit, and stealing (parked or
// traffic cars). v2: cars read as cars — big visible wheels with hubcaps,
// headlights + taillights, a sloped windshield, a spoiler on sports cars,
// and a lower, wider stance so the silhouette is not a plain box.
(function (global) {
  'use strict';
  var CFG = global.NH.CFG;

  var wheelGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.32, 12);
  var wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  var hubGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.34, 10);
  var hubMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc2 });
  var glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2a38 });
  var lightFrontMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  var lightRearMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });

  function makeCarMesh(type, colorHex) {
    var spec = CFG.cars[type] || CFG.cars.sedan;
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: colorHex !== undefined ? colorHex : spec.color });
    // Lower, wider body so the car reads as a car, not a box.
    var body = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.62, 4.4), bodyMat);
    body.position.y = 0.52; body.castShadow = true;
    // Sloped hood + trunk (two angled boxes) break the slab silhouette.
    var hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.32, 1.1), bodyMat);
    hood.position.set(0, 0.78, 1.45); hood.rotation.x = -0.18; hood.castShadow = true;
    var trunk = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 0.9), bodyMat);
    trunk.position.set(0, 0.76, -1.6); trunk.rotation.x = 0.16; trunk.castShadow = true;
    // Cabin: glass with a sloped windshield.
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.62, 1.9), glassMat);
    cabin.position.set(0, 1.05, -0.25); cabin.castShadow = true;
    var shield = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.5, 0.08), glassMat);
    shield.position.set(0, 0.95, 0.72); shield.rotation.x = -0.5; shield.castShadow = true;
    g.add(body); g.add(hood); g.add(trunk); g.add(cabin); g.add(shield);
    if (type === 'truck') {
      var bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 1.8),
        new THREE.MeshLambertMaterial({ color: 0x4a4a4a }));
      bed.position.set(0, 1.05, -1.15); bed.castShadow = true;
      g.add(bed);
    }
    if (type === 'sports') {
      // Rear spoiler + side skirts: the sports silhouette.
      var wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.5), bodyMat);
      wing.position.set(0, 1.25, -2.05); wing.castShadow = true;
      g.add(wing);
      var skirtL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 3.4), bodyMat);
      skirtL.position.set(-1.02, 0.32, 0); g.add(skirtL);
      var skirtR = skirtL.clone(); skirtR.position.x = 1.02; g.add(skirtR);
    }
    // Headlights (front, +z is forward) + taillights (rear).
    [[-0.7, 2.22], [0.7, 2.22]].forEach(function (p) {
      var hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), lightFrontMat);
      hl.position.set(p[0], 0.62, p[1]);
      g.add(hl);
    });
    [[-0.7, -2.22], [0.7, -2.22]].forEach(function (p) {
      var tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.08), lightRearMat);
      tl.position.set(p[0], 0.62, p[1]);
      g.add(tl);
    });
    // Wheels: big, dark, with a light hubcap so they read at a glance.
    var wheels = [];
    [[-0.98, 1.45], [0.98, 1.45], [-0.98, -1.45], [0.98, -1.45]].forEach(function (p) {
      var w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(p[0], 0.46, p[1]);
      w.castShadow = true;
      var hub = new THREE.Mesh(hubGeo, hubMat);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(p[0], 0.46, p[1]);
      g.add(w); g.add(hub); wheels.push(w);
    });
    if (type === 'police') {
      var bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5),
        new THREE.MeshLambertMaterial({ color: 0x222222 }));
      bar.position.set(0, 1.5, -0.25);
      g.add(bar);
      var l1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      l1.position.set(-0.32, 1.62, -0.25);
      var l2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x2244ff }));
      l2.position.set(0.32, 1.62, -0.25);
      g.add(l1); g.add(l2);
      g.userData.lights = [l1, l2];
    }
    if (type === 'taxi') {
      var sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4),
        new THREE.MeshBasicMaterial({ color: 0xffe600 }));
      sign.position.set(0, 1.55, -0.25);
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
