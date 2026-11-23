// world.js — Neon Harbor: pembangunan kota (tanah, jalan, gedung, pantai,
// dermaga, taman, langit sunset). Satu job: mengubah angka config + rng
// deterministik menjadi scene three.js yang bisa difoto dari segala sudut.
// Gaya: classic script + IIFE, var/function, menempel ke window.Harbor.
// Tidak ada network, tidak ada Math.random di sini (pakai S.rng).
(function () {
  'use strict';

  var H = window.Harbor || (window.Harbor = {});
  var THREE = window.THREE;

  // ------------------------------------------------------------------
  // Pembaca config yang toleran: ambil dari Harbor.Config bila ada,
  // jatuh ke nilai brief bila kunci tidak ditemukan.
  // ------------------------------------------------------------------
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

  var BLOCKS_PER_SIDE = pick('CITY.blocksPerSide', 5);
  var BLOCK_SIZE = pick('CITY.blockSize', 64);
  var ROAD_WIDTH = pick('CITY.roadWidth', 16);
  var HALF = pick('CITY.halfExtent', 200);
  var BEACH_WEST = pick('CITY.beachWestEdge', -168);
  var WATER_WEST = pick('CITY.waterWestEdge', -236);
  var DOCK_SOUTH = pick('CITY.dockSouthEdge', 168);
  var CAM_CLAMP = pick('CITY.cameraClamp', 320);

  var PAL = {
    skyTop: pick('PALETTE.skyTop', 0x2a2a55),
    skyMid: pick('PALETTE.skyMid', 0xe8833a),
    skyLow: pick('PALETTE.skyLow', 0xf7b733),
    sunCore: pick('PALETTE.sunCore', 0xfff2c0),
    sunGlow: pick('PALETTE.sunGlow', 0xff9a3c),
    fog: pick('PALETTE.fog', 0xe89a55),
    water: pick('PALETTE.water', 0x2a5a7a),
    sand: pick('PALETTE.sand', 0xd9b380),
    asphalt: pick('PALETTE.asphalt', 0x3c3c42),
    sidewalk: pick('PALETTE.sidewalk', 0x9a938a),
    buildingA: pick('PALETTE.buildingA', 0x8a7a6a),
    buildingB: pick('PALETTE.buildingB', 0x6a7a8a),
    buildingC: pick('PALETTE.buildingC', 0xa89080),
    buildingD: pick('PALETTE.buildingD', 0x5a6a7a),
    palmTrunk: pick('PALETTE.palmTrunk', 0x6a4a2a),
    palmLeaf: pick('PALETTE.palmLeaf', 0x2a7a3a)
  };

  // Garis tengah jalan: -160, -80, 0, 80, 160 di kedua sumbu.
  var ROAD_LINES = [-160, -80, 0, 80, 160];

  // Rect distrik, urutan penting: yang spesifik dulu, Downtown terakhir
  // sebagai default bila tidak masuk rect mana pun.
  var DISTRICT_RECTS = [
    { name: 'Sunset Strand', x0: -236, z0: -96, x1: -136, z1: 128 },
    { name: 'Cargo Pier', x0: -96, z0: 148, x1: 96, z1: 224 },
    { name: 'Harbor Towers', x0: 16, z0: -152, x1: 148, z1: -16 },
    { name: 'Palm Court', x0: 112, z0: 56, x1: 224, z1: 196 },
    { name: 'Harbor Green', x0: -168, z0: -208, x1: -32, z1: -72 },
    { name: 'Downtown', x0: -136, z0: -72, x1: 224, z1: 148 }
  ];

  // ------------------------------------------------------------------
  // districtAt(x, z) -> nama distrik
  // ------------------------------------------------------------------
  function districtAt(x, z) {
    var i, r;
    for (i = 0; i < DISTRICT_RECTS.length; i++) {
      r = DISTRICT_RECTS[i];
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) {
        return r.name;
      }
    }
    return 'Downtown';
  }

  // ------------------------------------------------------------------
  // RNG kecil berbasis seed untuk tekstur (tidak memakai S.rng supaya
  // urutan acak dunia tidak bergeser saat tekstur dibuat).
  // ------------------------------------------------------------------
  function seedRand(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------------
  // paintFacade(ctx, w, h, seed, baseColor): gambar fasad gedung ke
  // canvas 2d — grid jendela, sebagian menyala hangat, lantai dasar
  // lebih gelap, sedikit variasi vertikal supaya tidak terlihat datar.
  // ------------------------------------------------------------------
  function paintFacade(ctx, w, h, seed, baseColor) {
    var rng = seedRand(seed);
    var base = typeof baseColor === 'number' ? hexStr(baseColor) : baseColor;
    var cols = Math.max(3, Math.floor(w / 20));
    var rows = Math.max(5, Math.floor(h / 24));
    var cw = w / cols;
    var ch = h / rows;
    var i, j, x, y, lit, shade;

    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    // Bayangan vertikal halus: sisi kiri sedikit lebih gelap, kanan terang.
    var grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.18)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    for (j = 0; j < rows; j++) {
      for (i = 0; i < cols; i++) {
        x = i * cw + cw * 0.22;
        y = j * ch + ch * 0.24;
        lit = rng() < 0.30;
        if (lit) {
          // Jendela menyala: kuning hangat, kadang agak oranye.
          ctx.fillStyle = rng() < 0.5 ? '#ffd27a' : '#ffb45e';
          ctx.fillRect(x, y, cw * 0.56, ch * 0.52);
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(x, y, cw * 0.56, ch * 0.12);
        } else {
          shade = 18 + Math.floor(rng() * 22);
          ctx.fillStyle = 'rgb(' + shade + ',' + (shade + 4) + ',' + (shade + 12) + ')';
          ctx.fillRect(x, y, cw * 0.56, ch * 0.52);
          ctx.fillStyle = 'rgba(255,255,255,0.10)';
          ctx.fillRect(x, y, cw * 0.56, ch * 0.10);
        }
        // Bingkai tipis di bawah tiap jendela.
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(x, y + ch * 0.52, cw * 0.56, 1);
      }
    }

    // Lantai dasar lebih gelap + pintu kaca di tengah.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, h - ch * 1.1, w, ch * 1.1);
    ctx.fillStyle = '#1d2733';
    ctx.fillRect(w * 0.42, h - ch * 0.95, w * 0.16, ch * 0.95);
    ctx.fillStyle = 'rgba(255,210,122,0.55)';
    ctx.fillRect(w * 0.44, h - ch * 0.9, w * 0.12, ch * 0.5);
    // Garis lantai tipis antar tingkat.
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (j = 1; j < rows; j++) {
      ctx.fillRect(0, j * ch, w, 1);
    }
    return ctx;
  }

  // ------------------------------------------------------------------
  // Pembantu mesh kecil.
  // ------------------------------------------------------------------
  function lambert(color, extra) {
    var o = { color: color };
    var k;
    if (extra) {
      for (k in extra) { o[k] = extra[k]; }
    }
    return new THREE.MeshLambertMaterial(o);
  }

  function boxMesh(w, h, d, mat, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function flatMesh(w, d, mat, x, y, z) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    return m;
  }

  function facadeTexture(baseHex, seed) {
    var c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    var ctx = c.getContext('2d');
    paintFacade(ctx, 128, 256, seed, baseHex);
    var tex = new THREE.CanvasTexture(c);
    if (THREE.sRGBEncoding !== undefined) {
      tex.encoding = THREE.sRGBEncoding;
    }
    return tex;
  }

  function roadDashTexture() {
    var c = document.createElement('canvas');
    c.width = 64;
    c.height = 16;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#3c3c42';
    ctx.fillRect(0, 0, 64, 16);
    ctx.fillStyle = '#d8c25a';
    ctx.fillRect(8, 7, 26, 2);
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // ------------------------------------------------------------------
  // Bagian-bagian kota.
  // ------------------------------------------------------------------
  function buildGround(scene) {
    // Tanah dasar (warna trotoar) menutup seluruh daratan.
    var base = flatMesh(472, 448, lambert(0x8f887c), -6, 0, 0);
    scene.add(base);
    // Pantai pasir di barat.
    var sandW = BEACH_WEST - WATER_WEST; // 68
    var sand = flatMesh(sandW, 448, lambert(PAL.sand), WATER_WEST + sandW / 2, 0.02, 0);
    scene.add(sand);
    // Air di barat pantai, sedikit lebih rendah.
    var waterW = 260;
    var water = flatMesh(waterW, 460, lambert(PAL.water, { transparent: true, opacity: 0.96 }), WATER_WEST - waterW / 2, -0.25, 0);
    scene.add(water);
  }

  function buildRoads(scene) {
    var i, L;
    for (i = 0; i < ROAD_LINES.length; i++) {
      L = ROAD_LINES[i];
      // Jalan sumbu-x (memanjang ke timur-barat).
      var texX = roadDashTexture();
      texX.repeat.set(50, 1);
      var rx = new THREE.Mesh(new THREE.PlaneGeometry(400, ROAD_WIDTH),
        new THREE.MeshLambertMaterial({ map: texX }));
      rx.rotation.x = -Math.PI / 2;
      rx.position.set(0, 0.05, L);
      rx.receiveShadow = true;
      scene.add(rx);
      // Jalan sumbu-z (memanjang ke utara-selatan).
      var texZ = roadDashTexture();
      texZ.repeat.set(1, 50);
      var rz = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, 400),
        new THREE.MeshLambertMaterial({ map: texZ }));
      rz.rotation.x = -Math.PI / 2;
      rz.position.set(L, 0.05, 0);
      rz.receiveShadow = true;
      scene.add(rz);
      // Trotoar di kedua sisi tiap jalan.
      var sw = lambert(0xa89f92);
      scene.add(flatMesh(400, 6, sw, 0, 0.06, L - 11));
      scene.add(flatMesh(400, 6, sw, 0, 0.06, L + 11));
      scene.add(flatMesh(6, 400, sw, L - 11, 0.06, 0));
      scene.add(flatMesh(6, 400, sw, L + 11, 0.06, 0));
    }
  }

  function buildSky(scene) {
    // Langit gradient dari canvas: ungu senja di atas, oranye tengah,
    // kuning keemasan di cakrawala.
    var c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    var ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, hexStr(PAL.skyTop));
    g.addColorStop(0.55, hexStr(PAL.skyMid));
    g.addColorStop(1, hexStr(PAL.skyLow));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    var tex = new THREE.CanvasTexture(c);
    scene.background = tex;
    scene.fog = new THREE.Fog(PAL.fog, 150, 620);
  }

  function buildSun(scene) {
    // Matahari hangat dari barat rendah -> bayangan panjang ke timur.
    var sun = new THREE.DirectionalLight(0xffb060, 1.15);
    sun.position.set(-190, 58, 42);
    sun.target.position.set(40, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -240;
    sun.shadow.camera.right = 240;
    sun.shadow.camera.top = 240;
    sun.shadow.camera.bottom = -240;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 700;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(sun.target);
    var hemi = new THREE.HemisphereLight(0xffd9a8, 0x54402e, 0.85);
    scene.add(hemi);
    // Piringan matahari rendah di barat, di atas air.
    var disc = new THREE.Mesh(
      new THREE.CircleGeometry(20, 32),
      new THREE.MeshBasicMaterial({ color: PAL.sunCore, fog: false })
    );
    disc.position.set(-330, 46, 46);
    disc.rotation.y = Math.PI / 2;
    scene.add(disc);
    var glow = new THREE.Mesh(
      new THREE.CircleGeometry(46, 32),
      new THREE.MeshBasicMaterial({ color: PAL.sunGlow, transparent: true, opacity: 0.32, fog: false })
    );
    glow.position.set(-334, 46, 46);
    glow.rotation.y = Math.PI / 2;
    scene.add(glow);
  }

  function buildPalm(scene, x, z, rng) {
    var g = new THREE.Group();
    var lean = (rng() - 0.5) * 0.22;
    var trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.28, 7.5, 6),
      lambert(PAL.palmTrunk)
    );
    trunk.position.y = 3.75;
    trunk.rotation.z = lean;
    trunk.castShadow = true;
    g.add(trunk);
    // Tajuk: bola pipih hijau + 4 pelepah kotak miring.
    var canopy = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 8, 6),
      lambert(PAL.palmLeaf)
    );
    canopy.scale.set(1, 0.42, 1);
    canopy.position.set(lean * -7.5, 7.7, 0);
    canopy.castShadow = true;
    g.add(canopy);
    var k, frond;
    for (k = 0; k < 4; k++) {
      frond = new THREE.Mesh(
        new THREE.BoxGeometry(4.6, 0.08, 0.9),
        lambert(0x2f8a44)
      );
      frond.position.set(lean * -7.5, 7.4, 0);
      frond.rotation.y = (k * Math.PI) / 2 + rng() * 0.4;
      frond.rotation.z = 0.35;
      g.add(frond);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }

  function buildTree(scene, x, z, rng) {
    var g = new THREE.Group();
    var trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.34, 2.6, 6),
      lambert(0x5a3a22)
    );
    trunk.position.y = 1.3;
    trunk.castShadow = true;
    g.add(trunk);
    var h = 2.2 + rng() * 1.6;
    var canopy = new THREE.Mesh(
      new THREE.SphereGeometry(h, 8, 6),
      lambert(rng() < 0.5 ? 0x2a7a3a : 0x3a8a3a)
    );
    canopy.position.y = 2.6 + h * 0.55;
    canopy.castShadow = true;
    g.add(canopy);
    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }

  function buildStreetLights(scene) {
    var i, j, L, t;
    var poleMat = lambert(0x2a2a2e);
    var lampMat = new THREE.MeshLambertMaterial({
      color: 0xffe0a0, emissive: 0xffc860, emissiveIntensity: 0.9
    });
    var offsets = [-160, -80, 0, 80, 160];
    for (i = 0; i < ROAD_LINES.length; i++) {
      L = ROAD_LINES[i];
      for (j = 0; j < offsets.length; j++) {
        t = offsets[j];
        // Lampu di sisi jalan sumbu-x.
        var poleX = new THREE.Group();
        var px = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 7, 6), poleMat);
        px.position.y = 3.5;
        px.castShadow = true;
        poleX.add(px);
        var armX = boxMesh(0.12, 0.12, 2.2, poleMat, 0, 6.9, -1);
        poleX.add(armX);
        var headX = boxMesh(0.5, 0.18, 1.1, lampMat, 0, 6.8, -2);
        headX.castShadow = false;
        poleX.add(headX);
        poleX.position.set(t, 0, L + 9.5);
        scene.add(poleX);
        // Lampu di sisi jalan sumbu-z.
        var poleZ = new THREE.Group();
        var pz = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 7, 6), poleMat);
        pz.position.y = 3.5;
        pz.castShadow = true;
        poleZ.add(pz);
        var armZ = boxMesh(2.2, 0.12, 0.12, poleMat, -1, 6.9, 0);
        poleZ.add(armZ);
        var headZ = boxMesh(1.1, 0.18, 0.5, lampMat, -2, 6.8, 0);
        headZ.castShadow = false;
        poleZ.add(headZ);
        poleZ.position.set(L + 9.5, 0, t);
        scene.add(poleZ);
      }
    }
  }

  function buildContainers(scene, rng) {
    var palette = [0xc23b2e, 0x2a5a8a, 0x2a7a3a, 0xd87a1e, 0xe8b400, 0x3a7a8a, 0x8a3a5a];
    var gx, gz, stack, s;
    for (gx = -84; gx <= 84; gx += 24) {
      for (gz = 156; gz <= 210; gz += 18) {
        if (rng() < 0.18) { continue; }
        stack = 1 + Math.floor(rng() * 3);
        for (s = 0; s < stack; s++) {
          var col = palette[Math.floor(rng() * palette.length)];
          var cont = boxMesh(13, 2.6, 2.8, lambert(col), gx + (rng() - 0.5) * 2, 1.3 + s * 2.6, gz + (rng() - 0.5) * 2);
          cont.rotation.y = (rng() - 0.5) * 0.06;
          scene.add(cont);
        }
      }
    }
    // Peti-peti kayu berserakan di antara tumpukan.
    var k;
    for (k = 0; k < 22; k++) {
      var cx = -90 + rng() * 180;
      var cz = 152 + rng() * 66;
      var crate = boxMesh(1.6 + rng() * 1.4, 1.4 + rng(), 1.6 + rng() * 1.4,
        lambert(0x9a7a4a), cx, 0.8, cz);
      crate.rotation.y = rng() * Math.PI;
      scene.add(crate);
    }
  }

  function buildBuilding(scene, cx, cz, w, d, h, district, rng, seed) {
    var bases = [PAL.buildingA, PAL.buildingB, PAL.buildingC, PAL.buildingD];
    var base = bases[Math.floor(rng() * bases.length)];
    var tex = facadeTexture(base, seed);
    var side = new THREE.MeshLambertMaterial({ map: tex });
    var roofMat = lambert(0x4a4038);
    var mats = [side, side, roofMat, roofMat, side, side];
    var tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    tower.position.set(cx, h / 2, cz);
    tower.castShadow = true;
    tower.receiveShadow = true;
    scene.add(tower);
    // Setback lantai atas: kotak lebih kecil di puncak.
    if (h > 22) {
      var topH = h * 0.22;
      var top = boxMesh(w * 0.62, topH, d * 0.62, lambert(base), cx, h + topH / 2, cz);
      scene.add(top);
      // Kotak rooftop / AC di atas setback.
      var ac = boxMesh(w * 0.22, 1.6, d * 0.2, lambert(0x6a6a62), cx + w * 0.1, h + topH + 0.8, cz);
      scene.add(ac);
    } else {
      var ac2 = boxMesh(2.4, 1.2, 2.0, lambert(0x6a6a62), cx + w * 0.2, h + 0.6, cz - d * 0.15);
      scene.add(ac2);
    }
    // Neon strip di beberapa gedung Downtown / Palm Court.
    if ((district === 'Downtown' || district === 'Palm Court') && rng() < 0.45) {
      var neonCols = [0xff2a6a, 0x2affd8, 0xffb400, 0x7a5aff];
      var nc = neonCols[Math.floor(rng() * neonCols.length)];
      var strip = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.9, 0.35, 0.15),
        new THREE.MeshLambertMaterial({ color: nc, emissive: nc, emissiveIntensity: 1.2 })
      );
      strip.position.set(cx, h * 0.72, cz + d / 2 + 0.1);
      scene.add(strip);
    }
    return { x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2, h: h, district: district };
  }

  // ------------------------------------------------------------------
  // buildCity(S): bangun seluruh kota ke S.scene, kembalikan city.
  // ------------------------------------------------------------------
  function buildCity(S) {
    var rng = S.rng || Math.random;
    var scene = S.scene;
    var roads = [];
    var blocks = [];
    var i, j, L;

    buildSky(scene);
    buildGround(scene);
    buildRoads(scene);
    buildSun(scene);

    // Daftar ruas jalan lurus, panjang penuh -200..200.
    for (i = 0; i < ROAD_LINES.length; i++) {
      L = ROAD_LINES[i];
      roads.push({ x1: -HALF, z1: L, x2: HALF, z2: L, axis: 'x' });
      roads.push({ x1: L, z1: -HALF, x2: L, z2: HALF, axis: 'z' });
    }

    // Palem di sepanjang beach road (x ~ -172) + promenade.
    var p;
    for (p = 0; p < 24; p++) {
      buildPalm(scene, -172 + (rng() - 0.5) * 4, -180 + p * 15.5 + rng() * 5, rng);
    }
    for (p = 0; p < 6; p++) {
      buildPalm(scene, -150 + rng() * 8, -120 + p * 52 + rng() * 8, rng);
    }

    // Pepohonan di Harbor Green.
    var t;
    for (t = 0; t < 18; t++) {
      buildTree(scene, -160 + rng() * 120, -200 + rng() * 120, rng);
    }
    // Beberapa pohon di Palm Court + Downtown.
    for (t = 0; t < 8; t++) {
      buildTree(scene, 120 + rng() * 90, 70 + rng() * 110, rng);
    }

    // Kontainer + peti di Cargo Pier selatan.
    buildContainers(scene, rng);

    // Lampu jalan di semua ruas.
    buildStreetLights(scene);

    // Gedung: grid 5x5 blok di antara jalan.
    var seed = 11;
    for (i = 0; i < BLOCKS_PER_SIDE; i++) {
      for (j = 0; j < BLOCKS_PER_SIDE; j++) {
        var cx = -160 + i * 80;
        var cz = -160 + j * 80;
        var district = districtAt(cx, cz);
        seed += 17;
        // Kolom paling barat = pantai, bukan blok gedung.
        if (cx <= -120) { continue; }
        // Cargo Pier selatan = lapangan kontainer; sesekali gudang rendah.
        if (district === 'Cargo Pier' && cz >= DOCK_SOUTH - 20) {
          if (rng() < 0.3) {
            var wh = buildBuilding(scene, cx, cz, 44, 40, 10 + rng() * 4, district, rng, seed);
            blocks.push(wh);
          }
          continue;
        }
        // Harbor Green = taman; sesekali paviliun rendah.
        if (district === 'Harbor Green') {
          if (rng() < 0.35) {
            var pv = buildBuilding(scene, cx, cz, 34, 30, 9 + rng() * 4, district, rng, seed);
            blocks.push(pv);
          }
          continue;
        }
        var w = 40 + rng() * 12;
        var d = 40 + rng() * 12;
        // Menara di Harbor Towers lebih tinggi; rumah di Strand lebih rendah.
        var h;
        if (district === 'Harbor Towers') {
          h = 34 + rng() * 26; // 34..60
        } else if (district === 'Sunset Strand') {
          h = 12 + rng() * 12;
        } else {
          h = 14 + rng() * 34; // 14..48
        }
        var rec = buildBuilding(scene, cx, cz, w, d, h, district, rng, seed);
        blocks.push(rec);
      }
    }

    var city = {
      roads: roads,
      blocks: blocks,
      bounds: { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF }
    };
    S.city = city;
    return city;
  }

  H.World = {
    buildCity: buildCity,
    districtAt: districtAt
  };
  H.districtAt = districtAt;
  H.paintFacade = paintFacade;
  // Nilai yang mungkin dipakai modul lain tanpa membaca config.js.
  H._worldConsts = {
    roadLines: ROAD_LINES,
    halfExtent: HALF,
    cameraClamp: CAM_CLAMP,
    beachWestEdge: BEACH_WEST,
    waterWestEdge: WATER_WEST,
    dockSouthEdge: DOCK_SOUTH
  };
})();
