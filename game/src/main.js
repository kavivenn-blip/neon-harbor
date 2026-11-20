// main.js — Neon Harbor boot and game loop: input, state machine, driving and
// walking, stealing, wanted crimes, missions, combat, HUD, audio, save/load,
// and the ?shot= debug hooks used only to frame screenshots.
(function (global) {
  'use strict';
  var CFG = global.NH.CFG;

  function params() {
    var q = {};
    location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
      var p = kv.split('=');
      if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    return q;
  }

  function boot() {
    var Q = params();
    var canvas = document.getElementById('game');
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    } catch (e) {
      document.body.innerHTML = '<p style="color:#fff;padding:40px">Neon Harbor needs WebGL. Please open it in desktop Chrome.</p>';
      return;
    }
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
    camera.position.set(0, 8, 70);
    addEventListener('resize', function () {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });

    var world = global.NH.buildWorld(scene);
    if (Q.time) world.setTime(parseFloat(Q.time));
    var player = global.NH.makePlayer(scene, world.spawn.x, world.spawn.z);
    var cam = global.NH.makeCamera(camera);
    cam.heading = Math.PI; // face north into the city
    var traffic = global.NH.makeTraffic(scene, world);
    var peds = global.NH.makePedestrians(scene, world);
    var police = global.NH.makePolice(scene, world);
    var combat = global.NH.makeCombat(scene);
    var missions = global.NH.makeMissions();
    var hud = global.NH.makeHUD();
    var audio = global.NH.makeAudio();
    var ui = global.NH.makeUI({
      start: function (cont) { startGame(cont); },
      resume: function () { paused = false; },
      retryMission: function () { retryMission(); },
      volume: function (v) { audio.setVolume(v); },
    });

    // Parked cars around the city (stealable), parked ON roads in a lane,
    // heading along the road — never inside a building block.
    var parked = [];
    var rnd = global.NH.RNG(CFG.seed + 41);
    var parkTypes = ['sedan', 'sedan', 'sports', 'truck', 'taxi', 'sedan', 'sports'];
    var lines = world.roadLines;
    for (var i = 0; i < 14; i++) {
      var line = lines[Math.floor(rnd() * lines.length)];
      var along = (rnd() * 2 - 1) * 200;
      var lane = (rnd() < 0.5 ? -2.6 : 2.6);
      var horizontal = rnd() < 0.5;
      var px = horizontal ? along : line + lane;
      var pz = horizontal ? line + lane : along;
      var heading = horizontal ? (rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rnd() < 0.5 ? 0 : Math.PI);
      var type = parkTypes[i % parkTypes.length];
      var car = global.NH.makeCar(scene, type, px, pz, heading);
      car.parked = true;
      parked.push(car);
    }
    // The hero sports car for mission 6 (marina lot) and the cash van (mission 8).
    var marinaCar = global.NH.makeCar(scene, 'sports', -170, 60, 0, 0xffd700);
    marinaCar.parked = true; parked.push(marinaCar);
    var cashVan = global.NH.makeCar(scene, 'truck', 48, -48, Math.PI / 2, 0x2a4a6a);
    cashVan.parked = true; parked.push(cashVan);

    // Collectibles: 20 hidden packages (glowing green boxes).
    var packages = [];
    var pkgGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    var pkgMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
    for (var pi = 0; pi < 20; pi++) {
      var pp = world.randomRoadPoint();
      var pkg = new THREE.Mesh(pkgGeo, pkgMat);
      pkg.position.set(pp.x + 8, 0.6, pp.z + 8);
      scene.add(pkg);
      packages.push({ mesh: pkg, x: pkg.position.x, z: pkg.position.z, taken: false });
    }

    // --- State ---
    var state = {
      screen: 'start', paused: false, time: 0, frames: 0, fps: 0, fpsT: 0,
      toast: null, dialog: null, dialogT: 0,
      radio: 'Harbor FM', radioIdx: 0,
      stoleFlag: false, stoleType: null,
      missionStarted: false, gameOver: false,
    };
    var paused = false;
    var keys = {};
    var mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false };
    var raycaster = new THREE.Raycaster();
    var aimPoint = new THREE.Vector3(0, 1.2, 0);

    function showDialog(who, text, seconds) {
      state.dialog = { who: who, text: text };
      state.dialogT = seconds || 6;
    }
    function toast(text) { state.toast = text; }

    function startGame(cont) {
      audio.ensure();
      var save = cont ? global.NH.loadSave() : null;
      if (save) {
        player.cash = save.cash || CFG.startCash;
        missions.index = save.missionIndex || 0;
        missions.packages = save.packages || 0;
      }
      state.screen = 'playing';
      ui.show('playing');
      if (!state.missionStarted) {
        state.missionStarted = true;
        showDialog('Marisol Vega', global.NH.STORY.intro, 8);
        setTimeout(function () { beginMission(missions.index); }, 1000);
      }
    }

    function beginMission(i) {
      var def = global.NH.startMission(missions, i);
      if (!def) { endGame(); return; }
      showDialog('Marisol Vega', def.brief, 8);
      if (def.id === 5) global.NH.addCrime(police, 45, player.mesh.position.x, player.mesh.position.z); // start hot
      if (def.id === 4) spawnGoons(6, 24, 185);
      if (def.id === 6) spawnGoons(3, -170, 60);
      if (def.id === 8) spawnGoons(2, 48, -48);
      toast('Mission ' + def.id + ': ' + def.title);
    }

    function spawnGoons(n, x, z) {
      for (var i = 0; i < n; i++) {
        global.NH.spawnEnemy(combat, x + (Math.random() - 0.5) * 24, z + (Math.random() - 0.5) * 24);
      }
    }

    function retryMission() {
      var i = missions.index;
      missions.active = null;
      player.health = CFG.playerHealth;
      player.armor = CFG.playerArmor;
      police.wanted = 0; police.heat = 0;
      player.mesh.position.set(world.spawn.x, 0, world.spawn.z);
      if (player.inCar) exitCar();
      ui.show('playing');
      state.screen = 'playing';
      beginMission(i);
    }

    function endGame() {
      state.screen = 'ending';
      ui.show('ending');
      global.NH.saveGame({ cash: player.cash, missionIndex: missions.index, packages: missions.packages });
    }

    function busted() {
      player.cash = Math.max(0, player.cash - 200);
      police.wanted = 0; police.heat = 0; police.bustedTimer = 0;
      respawn();
      state.screen = 'busted';
      ui.show('busted');
      audio.busted();
    }

    function wasted() {
      player.cash = Math.max(0, player.cash - 200);
      police.wanted = 0; police.heat = 0;
      respawn();
      state.screen = 'wasted';
      ui.show('wasted');
      audio.busted();
    }

    function respawn() {
      player.health = CFG.playerHealth;
      player.armor = CFG.playerArmor;
      if (player.inCar) exitCar();
      player.mesh.position.set(world.spawn.x, 0, world.spawn.z);
      player.mesh.position.y = 0;
      cam.heading = Math.PI;
    }

    // --- Input ---
    addEventListener('keydown', function (e) {
      keys[e.code] = true;
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (state.screen === 'playing') { paused = !paused; if (paused) ui.show('paused'); else ui.show('playing'); }
      }
      if (e.code === 'KeyM') { audio.setMuted(!audio.muted); toast(audio.muted ? 'Sound muted' : 'Sound on'); }
      if (e.code === 'KeyR' && state.screen === 'playing') global.NH.reloadCombat(combat);
      if (e.code === 'Digit1') global.NH.switchWeapon(combat, 'pistol');
      if (e.code === 'Digit2') global.NH.switchWeapon(combat, 'smg');
      if (e.code === 'Digit3') global.NH.switchWeapon(combat, 'shotgun');
      if (e.code === 'Digit4') global.NH.switchWeapon(combat, 'grenade');
      if (e.code === 'KeyH' && player.inCar) audio.horn();
      if (e.code === 'KeyE') interact();
      if (e.code === 'KeyF') state.punch = true;
    });
    addEventListener('keyup', function (e) { keys[e.code] = false; });
    addEventListener('mousemove', function (e) {
      mouse.x = e.clientX; mouse.y = e.clientY;
      var ch = document.getElementById('crosshair');
      ch.style.left = mouse.x + 'px'; ch.style.top = mouse.y + 'px';
    });
    addEventListener('mousedown', function (e) {
      if (e.button === 0 && state.screen === 'playing' && !paused) {
        mouse.down = true;
        shoot();
      }
    });
    addEventListener('mouseup', function () { mouse.down = false; });

    function aimTarget() {
      var ndc = new THREE.Vector2((mouse.x / innerWidth) * 2 - 1, -(mouse.y / innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      var t = -raycaster.ray.origin.y / raycaster.ray.direction.y;
      if (t > 0 && t < 200) {
        aimPoint.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, t);
        aimPoint.y = 1.2;
      }
      return aimPoint;
    }

    function shoot() {
      if (state.screen !== 'playing' || paused) return;
      var from = player.inCar
        ? { x: player.inCar.mesh.position.x, y: 1.4, z: player.inCar.mesh.position.z }
        : { x: player.mesh.position.x, y: 1.4, z: player.mesh.position.z };
      if (combat.weapon === 'grenade') {
        if (global.NH.throwGrenade(combat, from, aimTarget())) { audio.explosion(); global.NH.addCrime(police, 10, from.x, from.z); }
        return;
      }
      var shots = global.NH.fireCombat(combat, from, aimTarget(), 0);
      if (shots) {
        audio.gunshot();
        drawTracers(shots);
        global.NH.addCrime(police, 4, from.x, from.z);
      }
    }

    // Tracer lines (thin glowing boxes, fade in combat update).
    var tracerGroup = new THREE.Group();
    scene.add(tracerGroup);
    function drawTracers(shots) {
      shots.forEach(function (s) {
        var len = Math.hypot(s.to.x - s.from.x, s.to.z - s.from.z);
        var geo = new THREE.BoxGeometry(0.06, 0.06, len);
        var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe9a0 }));
        m.position.set((s.from.x + s.to.x) / 2, 1.3, (s.from.z + s.to.z) / 2);
        m.rotation.y = Math.atan2(s.to.x - s.from.x, s.to.z - s.from.z);
        tracerGroup.add(m);
        setTimeout(function () { tracerGroup.remove(m); geo.dispose(); }, 90);
      });
    }

    function nearestCar(maxD) {
      var best = null, bd = maxD;
      var all = parked.concat(traffic.cars).concat(police.cruisers);
      all.forEach(function (car) {
        var d = Math.hypot(car.mesh.position.x - player.mesh.position.x, car.mesh.position.z - player.mesh.position.z);
        if (d < bd) { bd = d; best = car; }
      });
      return best;
    }

    function interact() {
      if (state.screen !== 'playing' || paused) return;
      if (player.inCar) { exitCar(); return; }
      // Collect a package.
      for (var i = 0; i < packages.length; i++) {
        var pk = packages[i];
        if (!pk.taken && Math.hypot(pk.x - player.mesh.position.x, pk.z - player.mesh.position.z) < 2.5) {
          pk.taken = true;
          pk.mesh.visible = false;
          missions.packages++;
          player.cash += 50;
          audio.pickup();
          toast('Hidden package found (' + missions.packages + '/20) +$50');
          return;
        }
      }
      // Enter / steal a car.
      var car = nearestCar(4);
      if (car) {
        var wasTraffic = car.driver && car.driver.ai;
        var wasParked = car.parked;
        player.inCar = car;
        car.parked = false;
        car.driver = { player: true };
        player.mesh.visible = false;
        state.stoleFlag = true;
        state.stoleType = car.type;
        if (wasTraffic) {
          global.NH.addCrime(police, 12, player.mesh.position.x, player.mesh.position.z);
          toast('You jacked a ' + car.spec.label + ' — the driver ran off! (+heat)');
          spawnFleeingDriver(car);
        } else if (wasParked) {
          global.NH.addCrime(police, 5, player.mesh.position.x, player.mesh.position.z);
          toast('You stole a ' + car.spec.label);
        } else {
          toast('You got in the ' + car.spec.label);
        }
        audio.uiClick();
      }
    }

    function spawnFleeingDriver(car) {
      // A pedestrian sprints away from the jacked car.
      var p = peds.peds[0];
      if (p) {
        p.x = car.mesh.position.x + 2; p.z = car.mesh.position.z + 2;
        p.fleeing = 3;
      }
    }

    function exitCar() {
      var car = player.inCar;
      if (!car) return;
      player.inCar = null;
      car.driver = null;
      car.parked = false;
      player.mesh.visible = true;
      var a = car.heading;
      player.mesh.position.set(
        car.mesh.position.x + Math.sin(a + Math.PI / 2) * 2.5, 0,
        car.mesh.position.z + Math.cos(a + Math.PI / 2) * 2.5);
      player.heading = a;
    }

    // --- Taxi fares (mission 3) ---
    function taxiTick(dt) {
      var step = global.NH.currentStep(missions);
      if (!missions.active || !step || step.kind !== 'taxi') return;
      if (!player.inCar || player.inCar.type !== 'taxi') return;
      if (!missions.taxiFare) {
        var p = world.randomRoadPoint();
        missions.taxiFare = { x: p.x, z: p.z };
        toast('Fare waiting — drive to the $ marker');
      }
      var f = missions.taxiFare;
      var d = Math.hypot(player.inCar.mesh.position.x - f.x, player.inCar.mesh.position.z - f.z);
      if (d < 7) {
        missions.fares++;
        player.cash += 60;
        audio.cash();
        toast('Fare complete +$60 (' + missions.fares + '/' + step.fares + ')');
        missions.taxiFare = null;
      }
    }

    // --- Debug hooks (?shot=...) — frame a scenario for screenshots only. ---
    function applyShotHooks() {
      var shot = Q.shot;
      if (Q.mission) beginMission(parseInt(Q.mission, 10) - 1);
      if (Q.tp) {
        var parts = Q.tp.split(',');
        player.mesh.position.set(parseFloat(parts[0]), 0, parseFloat(parts[1]));
      }
      if (Q.wanted) global.NH.addCrime(police, parseInt(Q.wanted, 10) * 18, 0, 0);
      if (!shot) return;
      state.screen = 'playing';
      ui.show('playing');
      state.missionStarted = true;
      if (shot === 'start') {
        player.mesh.position.set(24, 0, 24);
        beginMission(0);
      } else if (shot === 'drive') {
        var sc = global.NH.makeCar(scene, 'sports', 24, 100, 0);
        player.inCar = sc; sc.driver = { player: true }; player.mesh.visible = false;
        sc.speed = 20;
        beginMission(1);
      } else if (shot === 'chase') {
        var cc = global.NH.makeCar(scene, 'sports', 24, 80, 0);
        player.inCar = cc; cc.driver = { player: true }; player.mesh.visible = false;
        cc.speed = 18;
        global.NH.addCrime(police, 55, 24, 80);
        showDialog('Marisol Vega', 'You\'re hot, Rook. Lose the cops and get to the safehouse.', 6);
        // One cruiser in the oncoming lane ahead (head-on pass) for the shot.
        var cr = global.NH.spawnCruiser(police, 20, 100);
        cr.mesh.position.set(20, 0, 100); cr.heading = Math.PI;
      } else if (shot === 'mission') {
        player.mesh.position.set(24, 0, 172);
        beginMission(3);
        // beginMission already spawned 6 goons; line them up in the camera view
        // (north of the player, still inside the docks at z > 150).
        combat.enemies.forEach(function (e, i) { e.mesh.position.set(14 + i * 4, 0, 160); });
        showDialog('Marisol Vega', '"Dario\'s crew is moving product at the docks. Shut it down."', 6);
      }
      world.setTime(17.5);
    }

    // --- Main loop ---
    var clock = new THREE.Clock();
    var fpsAcc = 0, fpsN = 0;
    function loop() {
      requestAnimationFrame(loop);
      var dt = Math.min(clock.getDelta(), 0.05);
      state.time += dt;
      // FPS meter.
      fpsAcc += dt; fpsN++;
      if (fpsAcc >= 1) { state.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
      if (state.screen !== 'playing' || paused) {
        if (state.screen === 'start') {
          // Idle orbit on the start screen.
          cam.heading += dt * 0.05;
          cam.update({ x: 0, y: 20, z: 0 }, dt);
          world.setTime(16.5);
        }
        renderer.render(scene, camera);
        return;
      }
      var input = {
        forward: keys.KeyW || keys.ArrowUp,
        back: keys.KeyS || keys.ArrowDown,
        left: keys.KeyA || keys.ArrowLeft,
        right: keys.KeyD || keys.ArrowRight,
        sprint: keys.ShiftLeft || keys.ShiftRight,
        jump: keys.Space,
        punch: !!state.punch,
        handbrake: keys.Space,
      };
      // Screenshot hooks: keep the car cruising for drive/chase shots.
      if ((Q.shot === 'drive' || Q.shot === 'chase') && player.inCar) input.forward = true;
      state.punch = false;
      var px = player.mesh.position.x, pz = player.mesh.position.z;
      if (player.inCar) {
        global.NH.driveCar(player.inCar, input, dt, world);
        px = player.inCar.mesh.position.x; pz = player.inCar.mesh.position.z;
        cam.heading = player.inCar.heading + Math.PI;
        cam.dist = 13; cam.pitch = 0.22;
        // Hitting a pedestrian with the car is a crime.
        peds.peds.forEach(function (p) {
          if (Math.abs(player.inCar.speed) > 6 && Math.hypot(p.x - px, p.z - pz) < 2.2) {
            p.fleeing = 2;
            p.x += (p.x - px) * 0.6; p.z += (p.z - pz) * 0.6;
            global.NH.addCrime(police, 15, px, pz);
          }
        });
      } else {
        var punched = global.NH.movePlayer(player, input, dt, world, cam);
        if (punched) {
          // Punch hits nearby enemies / peds.
          combat.enemies.forEach(function (e) {
            if (Math.hypot(e.mesh.position.x - px, e.mesh.position.z - pz) < 2.2) {
              e.health -= 20; e.flash = 0.15;
            }
          });
        }
        cam.heading += ((player.heading + Math.PI) - cam.heading) * Math.min(1, dt * 2);
        cam.dist = 9; cam.pitch = 0.32;
      }
      // Camera target.
      var target = player.inCar
        ? { x: player.inCar.mesh.position.x, y: 1.5, z: player.inCar.mesh.position.z }
        : { x: px, y: 1.5, z: pz };
      cam.update(target, dt);
      // Traffic + pedestrians.
      global.NH.updateTraffic(traffic, dt, world, { x: px, z: pz });
      var threat = combat.muzzle > 0 || (player.inCar && Math.abs(player.inCar.speed) > 10)
        ? { x: px, z: pz, radius: 20 } : null;
      global.NH.updatePedestrians(peds, dt, world, threat);
      // Police.
      var pres = global.NH.updatePolice(police, dt, { x: px, z: pz }, !!player.inCar);
      if (pres.busted) { busted(); }
      if (police.ram) {
        player.health -= 4;
        police.ram = null;
      }
      // Combat.
      var cres = global.NH.updateCombat(combat, dt, { x: px, z: pz });
      missions.kills += cres.killed;
      // Enemy shots can hurt the player.
      combat.enemies.forEach(function (e) {
        if (e.shotFired) {
          e.shotFired = false;
          if (Math.random() < 0.4) damagePlayer(6);
        }
      });
      // Missions.
      if (missions.active) {
        var mres = global.NH.updateMission(missions, dt, {
          x: px, z: pz, inCar: !!player.inCar,
          carType: player.inCar ? player.inCar.type : null,
          wanted: police.wanted, killed: missions.kills,
          stole: state.stoleFlag,
        });
        state.stoleFlag = false;
        if (mres.advanced) audio.pickup();
        if (mres.done) {
          player.cash += mres.reward;
          audio.cash();
          toast('Mission complete! +$' + mres.reward);
          global.NH.saveGame({ cash: player.cash, missionIndex: missions.index + 1, packages: missions.packages });
          var next = missions.index + 1;
          if (next >= global.NH.MISSIONS.length) { endGame(); }
          else setTimeout(function () { beginMission(next); }, 1500);
        }
        if (mres.failed) {
          showDialog('Marisol Vega', 'Mission failed. Press the retry button — the Harbor still needs you.', 6);
          state.screen = 'busted';
          ui.show('busted');
          document.getElementById('end-title').textContent = 'MISSION FAILED';
          document.getElementById('end-text').textContent = 'The job went south. Retry it — Marisol is waiting.';
        }
      }
      taxiTick(dt);
      // Health.
      if (player.health <= 0) { wasted(); }
      // Audio.
      var spd01 = player.inCar ? Math.abs(player.inCar.speed) / player.inCar.spec.top : 0;
      audio.engine(spd01, !!player.inCar);
      if (police.wanted > 0) audio.siren(dt);
      audio.music(dt);
      // Dialog timer.
      if (state.dialogT > 0) {
        state.dialogT -= dt;
        if (state.dialogT <= 0) state.dialog = null;
      }
      // HUD.
      var wp = missions.active ? global.NH.missionWaypoint(missions) : null;
      global.NH.updateHUD(hud, {
        health: player.health, armor: player.armor, cash: player.cash,
        wanted: police.wanted,
        weaponName: CFG.weapons[combat.weapon].name,
        ammo: combat.ammo[combat.weapon], reserve: combat.reserve[combat.weapon],
        reloading: combat.reloadTimer > 0,
        objective: missions.active ? global.NH.missionObjective(missions) : 'Free roam — press Enter to start the next job',
        objDist: wp ? Math.hypot(wp.x - px, wp.z - pz) : null,
        waypoint: wp, x: px, z: pz,
        heading: player.inCar ? player.inCar.heading : player.heading,
        speed: player.inCar ? player.inCar.speed : 0,
        inCar: !!player.inCar,
        radio: state.radio,
        dialog: state.dialog,
        toast: state.toast,
        packages: packages.filter(function (p) { return !p.taken; }),
        police: police.cruisers.map(function (c) { return { x: c.mesh.position.x, z: c.mesh.position.z }; }),
      });
      state.toast = null;
      renderer.render(scene, camera);
    }

    function damagePlayer(n) {
      if (player.armor > 0) {
        var absorbed = Math.min(player.armor, n);
        player.armor -= absorbed;
        player.health -= (n - absorbed);
      } else {
        player.health -= n;
      }
    }

    // Start-mission key (Enter) when free-roaming.
    addEventListener('keydown', function (e) {
      if (e.code === 'Enter' && state.screen === 'playing' && !missions.active) {
        beginMission(missions.index);
      }
    });

    applyShotHooks();
    // Test hooks.
    window.__game = {
      state: state, player: player, police: police, missions: missions,
      combat: combat, world: world, parked: parked,
      fps: function () { return state.fps; },
      teleport: function (x, z) {
        if (player.inCar) { player.inCar.mesh.position.set(x, 0, z); }
        else { player.mesh.position.set(x, 0, z); }
      },
      pos: function () {
        return player.inCar
          ? { x: player.inCar.mesh.position.x, z: player.inCar.mesh.position.z, inCar: true }
          : { x: player.mesh.position.x, z: player.mesh.position.z, inCar: false };
      },
    };
    loop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
