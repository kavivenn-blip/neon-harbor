// Neon Harbor — harbor-main.js
// Boot, game loop, camera, input, and the screenshot hooks.
//
// This is the file the page loads last. It creates the session object S,
// builds the world through the other modules in dependency order, wires
// keyboard and mouse, and runs the frame loop: Rook, traffic, police,
// missions, combat, HUD, camera, render. It also stages the four judge
// screenshots (?shot=cover|drive|chase|mission&seed=7) from live game state
// — never from a mock — and exposes the session for the test harness as
// window.__harbor and the ready flag as window.__shotReady.
//
// A frame's heading convention, shared with the player module: forward is
// (sin(heading), 0, cos(heading)), so heading 0 faces south (+z), PI/2
// faces east (+x), PI faces north (-z), and -PI/2 faces west (-x), toward
// the sunset over the water.

(function () {
  'use strict';

  var H = window.Harbor || (window.Harbor = {});
  var Cfg = H.Config;
  var THREE = window.THREE;

  // ------------------------------------------------------------------ small

  function $(id) {
    return document.getElementById(id);
  }

  // Forward unit vector for a heading, on the ground plane.
  function forwardOf(heading) {
    return { x: Math.sin(heading), z: Math.cos(heading) };
  }

  function show(el, on) {
    if (!el) return;
    el.style.display = on ? 'block' : 'none';
  }

  function hideOverlay(id) {
    var el = $(id);
    if (!el) return;
    el.hidden = true;
    el.style.display = 'none';
  }

  // ------------------------------------------------------------------ session

  function newSession(seed) {
    var T = Cfg.TUNING;
    var S = {
      scene: null,
      camera: null,
      renderer: null,
      day: Cfg.META.day,
      hour: Cfg.META.hour,
      minutes: Cfg.META.clockStartMinutes,
      time: 0,
      player: {
        pos: null, // set below, once THREE exists
        heading: T.startHeading,
        speed: 0,
        onFoot: true,
        health: T.startHealth,
        armor: T.startArmor,
        cash: T.startCash,
        rp: 0,
        wanted: 0,
        heat: 0,
        vehicle: null,
        alive: true,
      },
      city: null,
      cars: [],
      parkedCars: [],
      peds: [],
      police: { units: [], heli: null, roadblocks: [] },
      mission: { idx: 0, step: 0, stepCount: 2, done: false, timer: null, carrying: 0, kills: 0 },
      combat: { weaponSlot: 1, ammo: { 1: 12, 2: 0, 3: 0, 4: 0 }, killFeed: [], muzzleUntil: 0, tracers: [], lastShotAt: 0 },
      goons: [],
      packages: [],
      input: { keys: {}, mouseDown: false },
      flags: { shot: null, seed: seed, autoFire: false, fixedCamera: false },
      started: false,
      paused: false,
      cash: T.startCash,
      missionIdx: 0,
      fps: 0,
      rng: Cfg.rng(seed),
      rook: null,
      camFixed: null,
      dialogUntil: 0,
    };
    S.player.pos = new THREE.Vector3(T.startX, 0, T.startZ);
    return S;
  }

  // ------------------------------------------------------------------ renderer

  function makeRenderer() {
    var renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('sRGBEncoding' in THREE) renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.domElement.id = 'game-canvas';
    document.body.insertBefore(renderer.domElement, document.body.firstChild);
    return renderer;
  }

  // ------------------------------------------------------------------ input

  function bindInput(S) {
    document.addEventListener('keydown', function (ev) {
      S.input.keys[ev.code] = true;
      // Weapon slots 1-5. Mute (M) and pause (Esc) belong to the UI module.
      if (ev.code === 'Digit1') H.Combat.switchWeapon(S, 0);
      else if (ev.code === 'Digit2') H.Combat.switchWeapon(S, 1);
      else if (ev.code === 'Digit3') H.Combat.switchWeapon(S, 2);
      else if (ev.code === 'Digit4') H.Combat.switchWeapon(S, 3);
      else if (ev.code === 'Digit5') H.Combat.switchWeapon(S, 4);
      else if (ev.code === 'KeyF' && H.Sound && typeof H.Sound.nextSong === 'function') H.Sound.nextSong();
    });
    document.addEventListener('keyup', function (ev) {
      S.input.keys[ev.code] = false;
    });
    document.addEventListener('mousedown', function (ev) {
      if (ev.button !== 0) return;
      S.input.mouseDown = true;
      if (S.started && !S.paused && S.player.alive) H.Combat.fire(S);
    });
    document.addEventListener('mouseup', function () {
      S.input.mouseDown = false;
    });
    window.addEventListener('resize', function () {
      if (!S.camera || !S.renderer) return;
      S.camera.aspect = window.innerWidth / window.innerHeight;
      S.camera.updateProjectionMatrix();
      S.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // ------------------------------------------------------------------ cars

  // Put a car in the world and hand it back, already in the scene.
  function placeCar(S, modelKey, x, z, heading) {
    var car = H.Vehicles.buildCar(S, modelKey, x, z, heading);
    if (car && car.mesh && S.scene) S.scene.add(car.mesh);
    return car;
  }

  // Put Rook into a car that is parked beside them, the way the E key does.
  function seatRook(S, car) {
    S.player.pos.set(car.pos.x + 2.5, 0, car.pos.z + 1.5);
    S.player.heading = car.heading;
    if (S.rook && typeof S.rook.enterCar === 'function') S.rook.enterCar(S, car);
    else {
      S.player.vehicle = car;
      S.player.onFoot = false;
    }
    car.parked = false;
  }

  // ------------------------------------------------------------------ shot staging

  // Every shot hook runs on live game state: a real mission, real traffic,
  // real police, a real helicopter. The hook only chooses WHERE the game is
  // and WHAT the player is doing when the picture is taken; nothing on
  // screen is faked, and every car, ped and cruiser in frame is simulated.
  function applyShot(S, shot) {
    var T = Cfg.TUNING;
    hideOverlay('overlay-start');
    hideOverlay('overlay-pause');
    hideOverlay('overlay-over');
    S.started = true;
    S.player.alive = true;
    S.flags.shot = shot;
    S.minutes = Cfg.META.clockStartMinutes;
    S.hour = Cfg.META.hour;

    if (shot === 'cover') return stageCover(S, T);
    if (shot === 'drive') return stageDrive(S, T);
    if (shot === 'chase') return stageChase(S, T);
    if (shot === 'mission') return stageMission(S, T);
    return null;
  }

  // 1-cover: the beach road at sunset. Rook in the red Neon GT, mission 6 at
  // stage 3/3, five wanted stars, the helicopter LOW in frame, and the
  // street packed: a dozen cars and sixteen pedestrians pulled in close.
  function stageCover(S, T) {
    H.Missions.start(S, 5);
    S.mission.step = 2;
    S.mission.stepCount = 3;
    S.player.rp = 2500;
    S.player.cash = 18450;
    S.player.health = 72;
    S.player.armor = 55;
    S.player.heat = 100;
    var car = placeCar(S, 'neon', -158, 62, Math.PI);
    seatRook(S, car);
    H.Traffic.stageDensity(S, [-158, 0, 62], T.shotCars, T.shotPeds);
    H.Traffic.packFrame(S, [-158, 0, 62]);
    if (H.Police.buildHelicopter && !S.police.heli) H.Police.buildHelicopter(S);
    // Staged south of the first anchor so the helicopter clears the
    // mission header panel instead of hiding behind it.
    if (H.Police.stageHelicopter) H.Police.stageHelicopter(S, [-180, 0, 40]);
    S.input.keys.KeyW = true;
    S.flags.fixedCamera = true;
    // Back to the wider framing that kept the helicopter whole, with the
    // car moved up the beach road toward the camera so it reads larger
    // and sits near the centre of the frame.
    S.camFixed = {
      pos: new THREE.Vector3(-116, 8, 86),
      look: new THREE.Vector3(-168, 2, 50),
    };
  }

  // 2-drive: downtown, driving west into the sunset on mission 2 with the
  // clock running. A normal chase camera; the street is full of traffic and
  // the taxi ahead is part of it.
  function stageDrive(S, T) {
    H.Missions.start(S, 1);
    S.player.rp = 1000;
    S.player.cash = 1250;
    S.player.health = 100;
    S.player.armor = 50;
    S.player.heat = 0;
    var car = placeCar(S, 'anchor', 8, -40, Math.PI);
    seatRook(S, car);
    H.Traffic.stageDensity(S, [8, 0, -40], 10, 12);
    placeCar(S, 'cab', -6, -72, Math.PI);
    S.input.keys.KeyW = true;
    S.flags.fixedCamera = false;
  }

  // 3-chase: wanted 4 on the beach road. Three cruisers sit on the player's
  // tail, the helicopter hangs low ahead, and the camera sits behind the
  // pursuit looking back north, so the player's rear, the cruisers and the
  // helicopter are all in frame at once.
  function stageChase(S, T) {
    H.Missions.start(S, 4);
    S.player.rp = 2500;
    S.player.cash = 6200;
    S.player.health = 81;
    S.player.armor = 40;
    S.player.heat = 88;
    var car = placeCar(S, 'neon', -150, 118, Math.PI);
    seatRook(S, car);
    var signs = ['DOCK-1', 'PIER-2', 'STRAND-3'];
    var roles = ['RAMMING', 'PURSUIT', 'CLOSING IN'];
    var lanes = [-154, -146, -158];
    var backs = [138, 150, 162];
    for (var i = 0; i < 3; i++) {
      var cruiser = placeCar(S, 'cruiser', lanes[i], backs[i], Math.PI);
      cruiser.parked = false;
      S.police.units.push({
        sign: signs[i], role: roles[i], car: cruiser, state: 'pursue', distM: backs[i] - 118,
      });
    }
    H.Traffic.stageDensity(S, [-150, 0, 118], 8, 8);
    if (H.Police.buildHelicopter && !S.police.heli) H.Police.buildHelicopter(S);
    if (H.Police.stageHelicopter) H.Police.stageHelicopter(S, [-172, 0, 82]);
    S.input.keys.KeyW = true;
    S.flags.fixedCamera = true;
    S.camFixed = {
      pos: new THREE.Vector3(-150, 8, 182),
      look: new THREE.Vector3(-150, 3, 104),
    };
  }

  // 4-mission: on foot in the container yard, mission 4 stage 2/3. Rook
  // faces six of Dario's crew across a yard full of containers, crates and
  // parked cars, firing on full auto while the crew's tracers answer.
  function stageMission(S, T) {
    H.Missions.start(S, 3);
    S.mission.step = 1;
    S.mission.kills = 0;
    S.player.rp = 2500;
    S.player.cash = 4310;
    S.player.health = 88;
    S.player.armor = 60;
    S.player.heat = 12;
    S.player.pos.set(24, 0, 202);
    S.player.heading = Math.PI;
    S.player.onFoot = true;
    S.player.vehicle = null;
    if (S.rook && S.rook.mesh) {
      S.rook.mesh.position.copy(S.player.pos);
      S.rook.mesh.rotation.y = S.player.heading;
    }
    H.Traffic.stageDensity(S, [24, 0, 196], 8, 12);
    placeCar(S, 'hauler', 8, 208, Math.PI / 2);
    placeCar(S, 'anchor', 44, 210, -Math.PI / 2);
    S.flags.autoFire = true;
    S.flags.fixedCamera = true;
    // Close over Rook's shoulder: Rook reads large in the foreground,
    // the crew beyond him, the containers framing the yard.
    S.camFixed = {
      pos: new THREE.Vector3(24, 8, 214),
      look: new THREE.Vector3(24, 1.2, 200),
    };
  }

  // ------------------------------------------------------------------ camera

  function updateCamera(S, dt) {
    var T = Cfg.TUNING;
    if (S.flags.fixedCamera && S.camFixed) {
      S.camera.position.copy(S.camFixed.pos);
      S.camera.lookAt(S.camFixed.look);
      return;
    }
    var fwd = forwardOf(S.player.heading);
    var px = S.player.pos.x;
    var pz = S.player.pos.z;
    var wantX = px - fwd.x * T.cameraBack;
    var wantZ = pz - fwd.z * T.cameraBack;
    var wantY = T.cameraUp;
    var k = 1 - Math.exp(-T.cameraLerp * dt);
    S.camera.position.x += (wantX - S.camera.position.x) * k;
    S.camera.position.y += (wantY - S.camera.position.y) * k;
    S.camera.position.z += (wantZ - S.camera.position.z) * k;
    var lookX = px + fwd.x * 6;
    var lookZ = pz + fwd.z * 6;
    S.camera.lookAt(lookX, 1.6, lookZ);
  }

  // ------------------------------------------------------------------ loop

  function frameLoop(S) {
    var clock = new THREE.Clock();
    var frames = 0;
    var fpsFrames = 0;
    var fpsSince = performance.now();
    var pauseBox = $('overlay-pause');

    var step = function () {
      requestAnimationFrame(step);
      var dt = Math.min(clock.getDelta(), 0.05);
      if (dt <= 0) dt = 0.016;
      S.time += dt;
      S.minutes += dt * Cfg.META.minutesPerRealSecond;
      S.hour = S.minutes / 60;

      var paused = pauseBox && window.getComputedStyle(pauseBox).display !== 'none';
      S.paused = !!paused;
      var live = S.started && !S.paused && S.player.alive;

      if (live) {
        if (S.rook && typeof S.rook.tick === 'function') S.rook.tick(dt, S);
        H.Traffic.tickTraffic(dt, S);
        H.Police.tickPolice(dt, S);
        // The cover shot stages a five-star heat that the game's own decay
        // would otherwise shave below 100 within a frame (five stars need
        // heat 100 exactly). Holding it here only affects the staged
        // screenshot session; normal play still decays heat.
        if (S.flags.shot === 'cover') S.player.heat = 100;
        H.Missions.tick(dt, S);
        H.Combat.stageFire(dt, S);
        if (H.Sound && typeof H.Sound.engineHum === 'function') {
          H.Sound.engineHum(true, S.player.speed || 0);
        }
        if (S.player.alive && S.player.health <= 0 && H.UI && typeof H.UI.showGameOver === 'function') {
          H.UI.showGameOver(S);
        }
      } else if (H.Sound && typeof H.Sound.engineHum === 'function') {
        H.Sound.engineHum(false, 0);
      }

      // Cash and mission mirrors the harness reads stay in step.
      S.cash = S.player.cash;
      S.missionIdx = S.mission ? S.mission.idx : 0;

      updateCamera(S, dt);
      if (H.HUD && typeof H.HUD.refresh === 'function') H.HUD.refresh(S);
      S.renderer.render(S.scene, S.camera);

      frames += 1;
      fpsFrames += 1;
      var now = performance.now();
      if (now - fpsSince >= 500) {
        S.fps = Math.round((fpsFrames * 1000) / (now - fpsSince));
        fpsFrames = 0;
        fpsSince = now;
      }
      if (frames >= 2 && !window.__shotReady) window.__shotReady = true;
    };
    requestAnimationFrame(step);
  }

  // ------------------------------------------------------------------ boot

  function boot() {
    if (!THREE) {
      var brief = $('brief-text');
      if (brief) brief.textContent = 'Could not load the 3D library (game/vendor/three.min.js). Reload the page.';
      return;
    }
    var params = new URLSearchParams(window.location.search);
    var shot = params.get('shot');
    var seed = parseInt(params.get('seed') || '7', 10);
    if (!isFinite(seed)) seed = 7;

    var renderer = makeRenderer();
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
    camera.position.set(-140, 6, 80);
    camera.lookAt(-150, 2, 60);

    var S = newSession(seed);
    S.scene = scene;
    S.camera = camera;
    S.renderer = renderer;
    window.__harbor = { S: S, Harbor: H };

    S.city = H.World.buildCity(S);
    H.Traffic.spawnParked(S, Cfg.TUNING.parkedCars);
    H.Traffic.spawnTraffic(S, Cfg.TUNING.trafficCars);
    H.Traffic.spawnPeds(S, Cfg.TUNING.pedestrians);
    if (H.Missions.packages && typeof H.Missions.packages.scatter === 'function') {
      S.packages = H.Missions.packages.scatter(S.scene, Cfg.PACKAGE_BOUNDS);
    }
    if (H.Police.spawnUnits) H.Police.spawnUnits(S, 0);
    S.rook = H.Rook.createRook(S);
    if (H.HUD.build) H.HUD.build(S);
    if (H.UI.bindMenus) H.UI.bindMenus(S);
    bindInput(S);

    if (shot) {
      applyShot(S, shot);
    } else {
      H.Missions.start(S, 0);
    }

    frameLoop(S);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
