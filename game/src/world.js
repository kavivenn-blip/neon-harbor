// world.js — Neon Harbor city generation: districts, roads, buildings, beach,
// docks, park, water, bridge, and the day/night sun. Seeded, so the world is
// identical on every run. Exposes road helpers and building colliders.
(function (global) {
  'use strict';
  var CFG = global.NH.CFG;

  // Canvas texture: a building facade with lit windows (one shared texture).
  function facadeTexture() {
    var c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#b8ab96'; g.fillRect(0, 0, 128, 256);
    var rnd = global.NH.RNG(99);
    for (var y = 8; y < 248; y += 16) {
      for (var x = 8; x < 120; x += 16) {
        g.fillStyle = rnd() < 0.45 ? '#ffd98a' : (rnd() < 0.5 ? '#2c3a4a' : '#5a6a7a');
        g.fillRect(x, y, 10, 12);
      }
    }
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function buildWorld(scene) {
    var rnd = global.NH.RNG(CFG.seed);
    var P = CFG.palette;
    var world = { colliders: [], roadLines: [], spawn: {}, buildings: 0 };
    var half = (CFG.blocks * CFG.pitch) / 2; // 216

    // --- Ground ---
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2 + 80, half * 2 + 80),
      new THREE.MeshLambertMaterial({ color: P.grass })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // --- Beach (west edge): sand strip + water plane ---
    var sand = new THREE.Mesh(
      new THREE.PlaneGeometry(46, half * 2 + 80),
      new THREE.MeshLambertMaterial({ color: P.sand })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(-half - 23, 0.05, 0);
    sand.receiveShadow = true;
    scene.add(sand);
    var water = new THREE.Mesh(
      new THREE.PlaneGeometry(120, half * 2 + 80),
      new THREE.MeshLambertMaterial({ color: P.water })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(-half - 106, 0.02, 0);
    scene.add(water);

    // --- Roads: grid lines + sidewalks ---
    var roadMat = new THREE.MeshLambertMaterial({ color: P.road });
    var walkMat = new THREE.MeshLambertMaterial({ color: P.sidewalk });
    for (var i = 0; i <= CFG.blocks; i++) {
      var c = -half + i * CFG.pitch;
      world.roadLines.push(c);
      [[c, 0, CFG.road, half * 2], [0, c, half * 2, CFG.road]].forEach(function (r) {
        var road = new THREE.Mesh(new THREE.PlaneGeometry(r[2], r[3]), roadMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(r[0], 0.1, r[1]);
        road.receiveShadow = true;
        scene.add(road);
      });
    }
    // Road centre dashes (cheap: small white planes every 12 units on the two main avenues).
    var dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d8 });
    for (var d = -half; d < half; d += 12) {
      [[0, d], [d, 0]].forEach(function (p) {
        var dash = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.7), dashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(p[0], 0.12, p[1]);
        scene.add(dash);
      });
    }

    // --- Buildings (shared materials + facade texture) ---
    var facade = facadeTexture();
    var mats = P.building.map(function (col) {
      return new THREE.MeshLambertMaterial({ color: col, map: facade });
    });
    var plainMats = P.building.map(function (col) {
      return new THREE.MeshLambertMaterial({ color: col });
    });
    function districtAt(x, z) {
      var D = CFG.districts;
      if (x >= D.downtown.x0 && x <= D.downtown.x1 && z >= D.downtown.z0 && z <= D.downtown.z1) return 'downtown';
      if (x >= D.beach.x0 && x <= D.beach.x1) return 'beach';
      if (z >= D.docks.z0 && z <= D.docks.z1) return 'docks';
      return 'suburbs';
    }
    world.districtAt = districtAt;
    var bGeo = new THREE.BoxGeometry(1, 1, 1);
    for (var bx = 0; bx < CFG.blocks; bx++) {
      for (var bz = 0; bz < CFG.blocks; bz++) {
        var cx = -half + bx * CFG.pitch + CFG.pitch / 2;
        var cz = -half + bz * CFG.pitch + CFG.pitch / 2;
        var dist = districtAt(cx, cz);
        if (dist === 'beach') continue;
        // Park block (one green block near downtown north).
        if (bx === 4 && bz === 2) {
          var park = new THREE.Mesh(new THREE.PlaneGeometry(CFG.block, CFG.block),
            new THREE.MeshLambertMaterial({ color: 0x3f6b45 }));
          park.rotation.x = -Math.PI / 2;
          park.position.set(cx, 0.15, cz);
          park.receiveShadow = true;
          scene.add(park);
          for (var t = 0; t < 8; t++) {
            var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 3, 6),
              new THREE.MeshLambertMaterial({ color: 0x6a4a2a }));
            trunk.position.set(cx + (rnd() - 0.5) * 28, 1.5, cz + (rnd() - 0.5) * 28);
            trunk.castShadow = true;
            var crown = new THREE.Mesh(new THREE.ConeGeometry(3.2, 7, 8),
              new THREE.MeshLambertMaterial({ color: 0x2e5a34 }));
            crown.position.set(trunk.position.x, 6, trunk.position.z);
            crown.castShadow = true;
            scene.add(trunk); scene.add(crown);
          }
          continue;
        }
        var n = dist === 'downtown' ? 2 : (dist === 'docks' ? 1 : 2);
        for (var k = 0; k < n; k++) {
          var w = 10 + rnd() * 14, d = 10 + rnd() * 14;
          var h;
          if (dist === 'downtown') h = CFG.districts.downtown.hMin + rnd() * (CFG.districts.downtown.hMax - CFG.districts.downtown.hMin);
          else if (dist === 'docks') h = 8 + rnd() * 8;
          else h = CFG.districts.suburbs.hMin + rnd() * (CFG.districts.suburbs.hMax - CFG.districts.suburbs.hMin);
          var px = cx + (k === 0 ? -8 : 8) + (rnd() - 0.5) * 4;
          var pz = cz + (rnd() - 0.5) * 10;
          var mat = mats[Math.floor(rnd() * mats.length)];
          var b = new THREE.Mesh(bGeo, mat);
          b.scale.set(w, h, d);
          b.position.set(px, h / 2, pz);
          b.castShadow = true; b.receiveShadow = true;
          scene.add(b);
          world.colliders.push({ x0: px - w / 2, x1: px + w / 2, z0: pz - d / 2, z1: pz + d / 2 });
          world.buildings++;
          // Rooftop box on tall towers.
          if (h > 40 && rnd() < 0.5) {
            var roof = new THREE.Mesh(bGeo, plainMats[1]);
            roof.scale.set(w * 0.4, 3, d * 0.4);
            roof.position.set(px, h + 1.5, pz);
            scene.add(roof);
          }
        }
      }
    }

    // --- Docks: containers + cranes ---
    var contCols = [0xb03a2e, 0x2e6f8e, 0x8a6d1f, 0x3a7a4a];
    for (var ci = 0; ci < 26; ci++) {
      var cm = new THREE.MeshLambertMaterial({ color: contCols[ci % contCols.length] });
      var cont = new THREE.Mesh(bGeo, cm);
      cont.scale.set(12, 2.6, 2.6);
      cont.position.set(-120 + (ci % 13) * 20, 1.3 + Math.floor(ci / 13) * 2.7, 190 + (rnd() - 0.5) * 6);
      cont.castShadow = true;
      scene.add(cont);
      world.colliders.push({ x0: cont.position.x - 6, x1: cont.position.x + 6, z0: cont.position.z - 1.3, z1: cont.position.z + 1.3 });
    }
    for (var cr = 0; cr < 3; cr++) {
      var crane = new THREE.Group();
      var legMat = new THREE.MeshLambertMaterial({ color: 0xc2a23a });
      var leg = new THREE.Mesh(bGeo, legMat);
      leg.scale.set(3, 34, 3); leg.position.y = 17; leg.castShadow = true;
      var arm = new THREE.Mesh(bGeo, legMat);
      arm.scale.set(2, 2, 42); arm.position.set(0, 32, 12); arm.castShadow = true;
      crane.add(leg); crane.add(arm);
      crane.position.set(-90 + cr * 80, 0, 205);
      scene.add(crane);
    }

    // --- Bridge over the water (west) ---
    var bridge = new THREE.Mesh(new THREE.PlaneGeometry(60, 14),
      new THREE.MeshLambertMaterial({ color: P.road }));
    bridge.rotation.x = -Math.PI / 2;
    bridge.position.set(-half - 46, 0.2, -40);
    bridge.receiveShadow = true;
    scene.add(bridge);

    // --- Sun / sky by time of day ---
    var sun = new THREE.DirectionalLight(0xfff2d8, 1.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
    sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
    sun.shadow.camera.far = 500;
    scene.add(sun);
    var hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a2f28, 0.85);
    scene.add(hemi);
    function setTime(hours) {
      var t = ((hours % 24) + 24) % 24;
      var ang = (t / 24) * Math.PI * 2 - Math.PI / 2; // 6h sunrise, 18h sunset
      var elev = Math.sin(ang);
      sun.position.set(Math.cos(ang) * 220, Math.max(elev, 0.3) * 220, 90);
      var day = Math.max(0, Math.min(1, elev * 2 + 0.45));
      var dusk = Math.max(0, 1 - Math.abs(elev) * 4) * (t > 12 ? 1 : 0.4);
      var sky = new THREE.Color(P.skyDay).lerp(new THREE.Color(P.skyNight), 1 - day);
      sky.lerp(new THREE.Color(P.skyDusk), Math.min(0.45, dusk));
      scene.background = sky;
      scene.fog = new THREE.Fog(sky.getHex(), 180, 520);
      sun.intensity = 0.55 + day * 1.05;
      sun.color.setHex(dusk > 0.3 ? P.sunDusk : P.sunDay);
      hemi.intensity = 0.45 + day * 0.55;
      world.timeOfDay = t;
    }
    world.setTime = setTime;
    setTime(CFG.timeOfDay);

    // --- Road helpers ---
    world.roadLines = world.roadLines;
    world.isOnRoad = function (x, z) {
      for (var i = 0; i < world.roadLines.length; i++) {
        if (Math.abs(x - world.roadLines[i]) < CFG.road / 2 + 1) return true;
        if (Math.abs(z - world.roadLines[i]) < CFG.road / 2 + 1) return true;
      }
      return false;
    };
    world.randomRoadPoint = function () {
      var line = world.roadLines[Math.floor(rnd() * world.roadLines.length)];
      var along = (rnd() * 2 - 1) * (half - 12);
      return rnd() < 0.5 ? { x: line, z: along } : { x: along, z: line };
    };
    world.collides = function (x, z, r) {
      for (var i = 0; i < world.colliders.length; i++) {
        var c = world.colliders[i];
        if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return c;
      }
      return null;
    };
    world.spawn = { x: 24, z: 60 };
    return world;
  }

  global.NH.buildWorld = buildWorld;
})(window);
