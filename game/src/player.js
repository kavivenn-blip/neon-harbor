// player.js — Neon Harbor v2 on-foot protagonist "Rook": walk, sprint, jump,
// punch, and the third-person follow camera. Also owns the on-foot / in-car
// state switch. v2: Rook reads as a person — a cap, a jacket with a collar,
// and legs that swing; no more plain box + ball head.
(function (global) {
  'use strict';
  var CFG = global.NH.CFG;

  function makePlayerMesh() {
    var g = new THREE.Group();
    var jacket = new THREE.MeshLambertMaterial({ color: 0x2e5a8a });
    var jacketDark = new THREE.MeshLambertMaterial({ color: 0x1e3a5a });
    var skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
    var pants = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
    var capMat = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
    // Torso with a collar band so the jacket reads as clothing.
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), jacket);
    torso.position.y = 1.14; torso.castShadow = true;
    var collar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), jacketDark);
    collar.position.y = 1.52;
    // Head + cap (brim forward) + hair at the back.
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), skin);
    head.position.y = 1.72; head.castShadow = true;
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.25, 0.1, 12), capMat);
    cap.position.y = 1.88;
    var brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.22), capMat);
    brim.position.set(0, 1.85, 0.26);
    var hair = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.12),
      new THREE.MeshLambertMaterial({ color: 0x2a1a0a }));
    hair.position.set(0, 1.68, -0.18);
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.24), pants);
    legL.position.set(-0.16, 0.38, 0); legL.castShadow = true;
    var legR = legL.clone(); legR.position.x = 0.16;
    var armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.2), jacket);
    armL.position.set(-0.42, 1.2, 0); armL.castShadow = true;
    var armR = armL.clone(); armR.position.x = 0.42;
    g.add(torso); g.add(collar); g.add(head); g.add(cap); g.add(brim); g.add(hair);
    g.add(legL); g.add(legR); g.add(armL); g.add(armR);
    g.userData = { legL: legL, legR: legR, armL: armL, armR: armR };
    return g;
  }

  function makePlayer(scene, x, z) {
    var mesh = makePlayerMesh();
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    return {
      mesh: mesh, heading: 0, vy: 0, grounded: true,
      health: CFG.playerHealth, armor: CFG.playerArmor,
      cash: CFG.startCash, inCar: null, punchTimer: 0, walkPhase: 0,
    };
  }

  // Move the player on foot. input: {forward,back,left,right,sprint,jump,punch}.
  // Returns 'punched' when a punch swing starts.
  function movePlayer(p, input, dt, world, camera) {
    var speed = input.sprint ? CFG.sprintSpeed : CFG.walkSpeed;
    var fx = Math.sin(camera.heading), fz = Math.cos(camera.heading);
    var rx = Math.cos(camera.heading), rz = -Math.sin(camera.heading);
    var mx = 0, mz = 0;
    if (input.forward) { mx += fx; mz += fz; }
    if (input.back) { mx -= fx; mz -= fz; }
    if (input.right) { mx += rx; mz += rz; }
    if (input.left) { mx -= rx; mz -= rz; }
    var len = Math.hypot(mx, mz);
    var moving = len > 0.01;
    if (moving) {
      mx /= len; mz /= len;
      p.heading = Math.atan2(mx, mz);
      var nx = p.mesh.position.x + mx * speed * dt;
      var nz = p.mesh.position.z + mz * speed * dt;
      if (!world.collides(nx, p.mesh.position.z, 0.5)) p.mesh.position.x = nx;
      if (!world.collides(p.mesh.position.x, nz, 0.5)) p.mesh.position.z = nz;
      p.mesh.position.x = Math.max(-260, Math.min(260, p.mesh.position.x));
      p.mesh.position.z = Math.max(-260, Math.min(260, p.mesh.position.z));
      p.walkPhase += dt * speed * 1.6;
    }
    // Jump / gravity.
    if (input.jump && p.grounded) { p.vy = 7; p.grounded = false; }
    if (!p.grounded) {
      p.vy -= 22 * dt;
      p.mesh.position.y += p.vy * dt;
      if (p.mesh.position.y <= 0) { p.mesh.position.y = 0; p.vy = 0; p.grounded = true; }
    }
    // Walk swing.
    var sw = moving ? Math.sin(p.walkPhase) * 0.55 : 0;
    p.mesh.userData.legL.rotation.x = sw;
    p.mesh.userData.legR.rotation.x = -sw;
    p.mesh.userData.armL.rotation.x = -sw * 0.7;
    p.mesh.userData.armR.rotation.x = sw * 0.7;
    p.mesh.rotation.y = p.heading;
    // Punch.
    var punched = false;
    if (input.punch && p.punchTimer <= 0) { p.punchTimer = 0.45; punched = true; }
    if (p.punchTimer > 0) {
      p.punchTimer -= dt;
      var ext = Math.sin((0.45 - Math.max(0, p.punchTimer)) / 0.45 * Math.PI) * 0.9;
      p.mesh.userData.armR.rotation.x = -ext;
    }
    return punched;
  }

  // Third-person camera: follows target (player or car), mouse orbits the heading.
  function makeCamera(camera) {
    return {
      heading: 0, pitch: 0.32, dist: 9,
      update: function (target, dt) {
        var tx = target.x, ty = target.y || 1.5, tz = target.z;
        var cx = tx - Math.sin(this.heading) * Math.cos(this.pitch) * this.dist;
        var cz = tz - Math.cos(this.heading) * Math.cos(this.pitch) * this.dist;
        var cy = ty + Math.sin(this.pitch) * this.dist + 1.2;
        camera.position.x += (cx - camera.position.x) * Math.min(1, dt * 6);
        camera.position.y += (cy - camera.position.y) * Math.min(1, dt * 6);
        camera.position.z += (cz - camera.position.z) * Math.min(1, dt * 6);
        camera.lookAt(tx, ty, tz);
      },
    };
  }

  global.NH.makePlayer = makePlayer;
  global.NH.movePlayer = movePlayer;
  global.NH.makeCamera = makeCamera;
})(window);
