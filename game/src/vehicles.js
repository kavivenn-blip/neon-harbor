// vehicles.js — Neon Harbor: spesifikasi + model 3D mobil.
// Satu job: dari kunci model (anchor/neon/hauler/cab/cruiser) membangun
// THREE.Group yang terbaca sebagai mobil di 1280x720 — bodi rendah/lebar,
// kap miring, kabin + kaca miring, 4 roda besar, lampu menyala.
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

  function hexStr(n) {
    var s = Math.round(n).toString(16);
    while (s.length < 6) { s = '0' + s; }
    return '#' + s;
  }

  // ------------------------------------------------------------------
  // Tabel model dari brief (dipakai bila Harbor.Config tidak menyediakannya).
  // key, name, kind, color, topSpeed (m/s), accel, grip, length, width.
  // ------------------------------------------------------------------
  var FALLBACK_MODELS = {
    anchor: { key: 'anchor', name: 'Anchor S', kind: 'sedan', color: 0x3a6ea5, topSpeed: 34, accel: 15, grip: 1.0, length: 4.6, width: 1.9 },
    neon: { key: 'neon', name: 'Neon GT', kind: 'sports', color: 0xc23b2e, topSpeed: 48, accel: 22, grip: 1.25, length: 4.4, width: 2.0 },
    hauler: { key: 'hauler', name: 'Dock Hauler', kind: 'truck', color: 0x5a5a52, topSpeed: 26, accel: 10, grip: 0.8, length: 6.2, width: 2.3 },
    cab: { key: 'cab', name: 'Harbor Cab', kind: 'taxi', color: 0xe8b400, topSpeed: 32, accel: 14, grip: 1.0, length: 4.6, width: 1.9 },
    cruiser: { key: 'cruiser', name: 'Harbor Interceptor', kind: 'police', color: 0xf2f2f2, topSpeed: 42, accel: 20, grip: 1.15, length: 4.8, width: 2.0 }
  };

  function modelTable() {
    var cfg = pick('CAR_MODELS', null);
    if (cfg && cfg.anchor && cfg.neon) { return cfg; }
    return FALLBACK_MODELS;
  }

  // ------------------------------------------------------------------
  // carModel(key): spec mobil + derived colorHex '#rrggbb' untuk HUD.
  // ------------------------------------------------------------------
  function carModel(key) {
    var table = modelTable();
    var raw = table[key] || table.anchor;
    return {
      key: raw.key || key,
      name: raw.name,
      kind: raw.kind,
      color: raw.color,
      colorHex: hexStr(raw.color),
      topSpeed: raw.topSpeed,
      accel: raw.accel,
      grip: raw.grip,
      length: raw.length,
      width: raw.width
    };
  }

  // ------------------------------------------------------------------
  // Pembantu material/mesh.
  // ------------------------------------------------------------------
  function lambert(color, extra) {
    var o = { color: color };
    var k;
    if (extra) {
      for (k in extra) { o[k] = extra[k]; }
    }
    return new THREE.MeshLambertMaterial(o);
  }

  function addBox(group, w, h, d, mat, x, y, z, rx) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (rx) { m.rotation.x = rx; }
    m.castShadow = true;
    group.add(m);
    return m;
  }

  // Roda: holder Group di posisi roda; ban silinder di dalamnya (sumbu
  // diputar ke sumbu-x) + hubcap terang di sisi luar. Putaran jalan
  // dilakukan dengan memutar holder pada sumbu-x (sumbu poros roda).
  function addWheel(group, x, z, radius, tireMat, hubMat) {
    var holder = new THREE.Group();
    holder.position.set(x, radius, z);
    var tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.32, 14), tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    holder.add(tire);
    var side = x >= 0 ? 1 : -1;
    var hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.52, radius * 0.52, 0.34, 10), hubMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.x = side * 0.02;
    holder.add(hub);
    // Baut tengah kecil supaya roda tidak terlihat polos dari samping.
    var bolt = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.16, radius * 0.16, 0.36, 6), lambert(0x222222));
    bolt.rotation.z = Math.PI / 2;
    holder.add(bolt);
    group.add(holder);
    return holder;
  }

  function addLampPair(group, z, y, w, color, emissive, intensity) {
    var lampMat = new THREE.MeshLambertMaterial({
      color: color, emissive: emissive, emissiveIntensity: intensity
    });
    var pair = new THREE.Group();
    var left = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.2, 0.08), lampMat);
    left.position.set(-w * 0.28, y, z);
    pair.add(left);
    var right = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.2, 0.08), lampMat);
    right.position.set(w * 0.28, y, z);
    pair.add(right);
    // Strip penghubung tipis di antara kedua lampu.
    var bar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, 0.07, 0.06), lampMat);
    bar.position.set(0, y, z);
    pair.add(bar);
    group.add(pair);
    return pair;
  }

  // ------------------------------------------------------------------
  // buildCar(S, modelKey, x, z, heading): bangun mobil lengkap.
  // Muka mobil menghadap +z lokal; heading 0 = ke +z, PI/2 = ke +x.
  // ------------------------------------------------------------------
  function buildCar(S, modelKey, x, z, heading) {
    var spec = carModel(modelKey);
    var L = spec.length;
    var W = spec.width;
    var g = new THREE.Group();
    var bodyMat = lambert(spec.color);
    var darkMat = lambert(0x1a1a1c);
    var trimMat = lambert(0x2e2e32);
    var glassMat = new THREE.MeshLambertMaterial({
      color: 0x14202c, emissive: 0x0a141e, emissiveIntensity: 0.6
    });
    var tireMat = lambert(0x141414);
    var hubMat = lambert(0xc8c8c8);
    var isTruck = spec.kind === 'truck';
    var wheelR = isTruck ? 0.52 : 0.42;

    if (isTruck) {
      // --- Truk: kabin depan tegak + flatbed + kontainer di bak. ---
      addBox(g, W, 0.5, L, trimMat, 0, 0.55, 0); // sasis
      addBox(g, W * 0.96, 1.5, L * 0.3, bodyMat, 0, 1.35, L * 0.32); // kabin
      addBox(g, W * 0.8, 0.7, 0.1, glassMat, 0, 1.55, L * 0.48, 0.12); // kaca depan
      addBox(g, W * 0.9, 0.12, L * 0.28, lambert(0x3a3a3a), 0, 2.14, L * 0.32); // atap kabin
      addBox(g, W * 0.98, 0.22, L * 0.58, lambert(0x444444), 0, 0.92, -L * 0.2); // flatbed
      addBox(g, W * 0.88, 1.7, L * 0.5, lambert(0x3a7a8a), 0, 1.9, -L * 0.2); // kontainer bak
      addBox(g, W * 0.9, 0.1, L * 0.52, lambert(0x2a5a6a), 0, 2.78, -L * 0.2); // tutup kontainer
      // Bumper + grille depan.
      addBox(g, W * 1.0, 0.3, 0.14, darkMat, 0, 0.5, L / 2 + 0.02);
      addBox(g, W * 0.6, 0.5, 0.1, trimMat, 0, 1.0, L / 2 + 0.02);
    } else {
      // --- Mobil penumpang: bodi rendah/lebar, kap + bagasi miring. ---
      addBox(g, W, 0.55, L, bodyMat, 0, 0.62, 0); // bodi utama
      addBox(g, W * 0.98, 0.2, L * 0.96, darkMat, 0, 0.32, 0); // skirt bawah
      // Kap depan miring ke bawah, bagasi belakang miring ke bawah.
      addBox(g, W * 0.9, 0.2, L * 0.26, bodyMat, 0, 0.86, L * 0.34, 0.22);
      addBox(g, W * 0.9, 0.18, L * 0.22, bodyMat, 0, 0.86, -L * 0.36, -0.18);
      // Kabin + atap.
      addBox(g, W * 0.78, 0.5, L * 0.4, bodyMat, 0, 1.12, -L * 0.05);
      addBox(g, W * 0.76, 0.07, L * 0.34, bodyMat, 0, 1.39, -L * 0.05);
      // Kaca depan + belakang miring, gelap.
      addBox(g, W * 0.72, 0.06, L * 0.17, glassMat, 0, 1.2, L * 0.16, 0.5);
      addBox(g, W * 0.72, 0.06, L * 0.15, glassMat, 0, 1.2, -L * 0.27, -0.45);
      // Jendela samping gelap di kedua sisi kabin.
      addBox(g, 0.04, 0.34, L * 0.34, glassMat, W * 0.4, 1.14, -L * 0.05);
      addBox(g, 0.04, 0.34, L * 0.34, glassMat, -W * 0.4, 1.14, -L * 0.05);
      // Side skirt + bumper depan/belakang.
      addBox(g, 0.1, 0.16, L * 0.68, darkMat, W / 2 + 0.01, 0.3, 0);
      addBox(g, 0.1, 0.16, L * 0.68, darkMat, -W / 2 - 0.01, 0.3, 0);
      addBox(g, W * 1.02, 0.2, 0.14, darkMat, 0, 0.46, L / 2 + 0.01);
      addBox(g, W * 1.02, 0.2, 0.14, darkMat, 0, 0.46, -L / 2 - 0.01);
      // Grille depan tipis.
      addBox(g, W * 0.5, 0.12, 0.06, trimMat, 0, 0.72, L / 2 + 0.03);
      // Spoiler untuk sports.
      if (spec.kind === 'sports') {
        addBox(g, 0.08, 0.22, 0.08, darkMat, W * 0.32, 1.0, -L * 0.44);
        addBox(g, 0.08, 0.22, 0.08, darkMat, -W * 0.32, 1.0, -L * 0.44);
        addBox(g, W * 0.92, 0.06, 0.42, darkMat, 0, 1.14, -L * 0.44);
        // Strip neon tipis di bawah spoiler — ciri khas Neon GT.
        addBox(g, W * 0.8, 0.05, 0.05,
          new THREE.MeshLambertMaterial({ color: 0xff2a6a, emissive: 0xff2a6a, emissiveIntensity: 1.0 }),
          0, 1.1, -L * 0.46);
      }
      // Papan taksi kuning di atap.
      if (spec.kind === 'taxi') {
        var signMat = new THREE.MeshLambertMaterial({
          color: 0xffe14d, emissive: 0xe8b400, emissiveIntensity: 0.8
        });
        addBox(g, 0.72, 0.2, 0.34, signMat, 0, 1.54, -L * 0.05);
      }
      // Polisi: light bar merah/biru + pintu hitam.
      if (spec.kind === 'police') {
        addBox(g, W * 0.62, 0.09, 0.3, darkMat, 0, 1.47, -L * 0.05);
        var redMat = new THREE.MeshLambertMaterial({
          color: 0xff2a22, emissive: 0xff2a22, emissiveIntensity: 1.6
        });
        var blueMat = new THREE.MeshLambertMaterial({
          color: 0x2a5aff, emissive: 0x2a5aff, emissiveIntensity: 1.6
        });
        addBox(g, W * 0.28, 0.14, 0.32, redMat, -W * 0.15, 1.55, -L * 0.05);
        addBox(g, W * 0.28, 0.14, 0.32, blueMat, W * 0.15, 1.55, -L * 0.05);
        var doorMat = lambert(0x141414);
        addBox(g, 0.03, 0.52, L * 0.3, doorMat, W / 2 + 0.01, 0.72, -L * 0.02);
        addBox(g, 0.03, 0.52, L * 0.3, doorMat, -W / 2 - 0.01, 0.72, -L * 0.02);
        // Strip hitam di kap — livery interceptor.
        addBox(g, W * 0.4, 0.04, L * 0.26, doorMat, 0, 0.97, L * 0.34);
      }
    }

    // Lampu depan (kuning-putih menyala) + belakang (merah menyala).
    var head = addLampPair(g, L / 2 + 0.04, 0.74, W, 0xfff2c0, 0xffe9a0, 1.4);
    var tail = addLampPair(g, -L / 2 - 0.04, 0.74, W, 0xff2a22, 0xd21f1a, 1.2);

    // 4 roda besar, terlihat jelas dari samping.
    var wheels = [];
    var zx = isTruck ? L * 0.36 : L * 0.32;
    wheels.push(addWheel(g, W / 2 + 0.03, zx, wheelR, tireMat, hubMat));
    wheels.push(addWheel(g, -W / 2 - 0.03, zx, wheelR, tireMat, hubMat));
    wheels.push(addWheel(g, W / 2 + 0.03, -zx, wheelR, tireMat, hubMat));
    wheels.push(addWheel(g, -W / 2 - 0.03, -zx, wheelR, tireMat, hubMat));

    g.position.set(x || 0, 0, z || 0);
    g.rotation.y = heading || 0;

    var car = {
      mesh: g,
      pos: g.position,
      heading: heading || 0,
      road: 'z',
      speed: 0,
      steer: 0,
      model: spec,
      color: spec.color,
      condition: 100,
      parked: false,
      wheels: wheels,
      lights: { head: head, tail: tail }
    };
    return car;
  }

  // ------------------------------------------------------------------
  // tickCarVisual(car, dt): putar roda sesuai kecepatan, miringkan bodi
  // sedikit saat belok. Aman bila wheels kosong / car null.
  // ------------------------------------------------------------------
  function tickCarVisual(car, dt) {
    if (!car || !car.mesh) { return; }
    var i, w;
    var r = 0.42;
    if (car.model && car.model.kind === 'truck') { r = 0.52; }
    if (car.wheels) {
      for (i = 0; i < car.wheels.length; i++) {
        w = car.wheels[i];
        if (w) { w.rotation.x += ((car.speed || 0) * dt) / r; }
      }
    }
    var targetRoll = 0;
    if (typeof car.steer === 'number' && car.speed) {
      targetRoll = -car.steer * Math.min(0.06, Math.abs(car.speed) * 0.002);
    }
    car.mesh.rotation.z += (targetRoll - car.mesh.rotation.z) * Math.min(1, dt * 6);
    // Sedikit angguk saat akselerasi / pengereman keras.
    var targetPitch = 0;
    if (typeof car._accelNow === 'number') {
      targetPitch = -car._accelNow * 0.0012;
    }
    car.mesh.rotation.x += (targetPitch - car.mesh.rotation.x) * Math.min(1, dt * 4);
  }

  H.carModel = carModel;
  H.Vehicles = {
    buildCar: buildCar,
    tickCarVisual: tickCarVisual,
    carModel: carModel
  };
})();
