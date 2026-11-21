// combat.js — Neon Harbor v2 weapons (pistol, SMG, shotgun, grenade), mouse
// aiming, ammo and reload, enemy goons with simple AI, hit reactions, and
// explosions. v2: a visible muzzle flash when firing (the shot reads on
// screen) and a kill feed so the HUD can show combat results.
(function (global) {
  'use strict';
  var CFG = global.NH.CFG;

  function makeCombat(scene) {
    return {
      scene: scene,
      weapon: 'pistol',
      ammo: { pistol: 12, smg: 30, shotgun: 6, grenade: 3 },
      reserve: { pistol: 60, smg: 120, shotgun: 24, grenade: 0 },
      cooldown: 0, reloadTimer: 0,
      enemies: [], tracers: [], blasts: [],
      muzzle: 0, killFeed: [],
    };
  }

  function switchWeapon(c, name) {
    if (CFG.weapons[name]) { c.weapon = name; c.reloadTimer = 0; }
  }

  function reload(c) {
    var w = CFG.weapons[c.weapon];
    var need = w.mag - c.ammo[c.weapon];
    var take = Math.min(need, c.reserve[c.weapon]);
    if (take > 0 && c.reloadTimer <= 0) {
      c.reloadTimer = c.weapon === 'shotgun' ? 1.4 : 0.9;
      c.pendingReload = take;
    }
  }

  // Fire toward a world point. Returns {hit, x, z} for effects, or null.
  function fire(c, from, target, dt) {
    var w = CFG.weapons[c.weapon];
    if (c.cooldown > 0 || c.reloadTimer > 0) return null;
    if (c.ammo[c.weapon] <= 0) { reload(c); return null; }
    c.cooldown = 1 / w.rate;
    c.ammo[c.weapon]--;
    c.muzzle = 0.07;
    var shots = [];
    var pellets = w.pellets || 1;
    for (var i = 0; i < pellets; i++) {
      var dx = target.x - from.x, dz = target.z - from.z;
      var d = Math.hypot(dx, dz) || 1;
      var spread = (Math.random() - 0.5) * w.spread * d;
      var px = -dz / d * spread, pz = dx / d * spread;
      var hx = target.x + px, hz = target.z + pz;
      var hitEnemy = null, best = 1e9;
      c.enemies.forEach(function (e) {
        if (e.health <= 0) return;
        var ex = e.mesh.position.x - from.x, ez = e.mesh.position.z - from.z;
        var along = (ex * dx + ez * dz) / d;
        if (along < 0 || along > w.range) return;
        var perp = Math.abs(ex * dz - ez * dx) / d;
        if (perp < 1.4 && along < best) { best = along; hitEnemy = e; }
      });
      if (hitEnemy) {
        hitEnemy.health -= w.damage;
        hitEnemy.flash = 0.15;
        hx = hitEnemy.mesh.position.x; hz = hitEnemy.mesh.position.z;
      }
      shots.push({ from: { x: from.x, y: from.y || 1.4, z: from.z }, to: { x: hx, y: 1.2, z: hz } });
    }
    c.tracers.push.apply(c.tracers, shots);
    return shots;
  }

  function throwGrenade(c, from, target) {
    if (c.ammo.grenade <= 0 || c.cooldown > 0) return false;
    c.cooldown = 1 / CFG.weapons.grenade.rate;
    c.ammo.grenade--;
    c.blasts.push({ x: target.x, z: target.z, t: 0.9, r: CFG.weapons.grenade.radius });
    return true;
  }

  function spawnEnemy(c, x, z) {
    var g = new THREE.Group();
    var red = new THREE.MeshLambertMaterial({ color: 0x8a2a2a });
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.34), red);
    body.position.y = 1.05; body.castShadow = true;
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
    head.position.y = 1.62;
    var gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.3, 1.2, 0.4);
    g.add(body); g.add(head); g.add(gun);
    g.position.set(x, 0, z);
    c.scene.add(g);
    var e = { mesh: g, health: 60, flash: 0, shootTimer: 1 + Math.random(), speed: 3.2 };
    c.enemies.push(e);
    return e;
  }

  function updateCombat(c, dt, playerPos) {
    if (c.cooldown > 0) c.cooldown -= dt;
    if (c.muzzle > 0) c.muzzle -= dt;
    if (c.reloadTimer > 0) {
      c.reloadTimer -= dt;
      if (c.reloadTimer <= 0 && c.pendingReload) {
        c.ammo[c.weapon] += c.pendingReload;
        c.reserve[c.weapon] -= c.pendingReload;
        c.pendingReload = 0;
      }
    }
    // Tracers fade.
    c.tracers.forEach(function (t) { t.life = (t.life || 0.09) - dt; });
    c.tracers = c.tracers.filter(function (t) { return t.life > 0; });
    // Grenade blasts.
    var booms = [];
    c.blasts.forEach(function (b) {
      b.t -= dt;
      if (b.t <= 0) booms.push(b);
    });
    c.blasts = c.blasts.filter(function (b) { return b.t > 0; });
    booms.forEach(function (b) {
      c.enemies.forEach(function (e) {
        var d = Math.hypot(e.mesh.position.x - b.x, e.mesh.position.z - b.z);
        if (d < b.r) e.health -= CFG.weapons.grenade.damage * (1 - d / b.r / 2);
      });
    });
    // Enemies: chase the player, shoot when close.
    c.enemies.forEach(function (e) {
      if (e.health <= 0) return;
      var dx = playerPos.x - e.mesh.position.x, dz = playerPos.z - e.mesh.position.z;
      var d = Math.hypot(dx, dz) || 1;
      if (d > 14) {
        e.mesh.position.x += (dx / d) * e.speed * dt;
        e.mesh.position.z += (dz / d) * e.speed * dt;
      }
      e.mesh.rotation.y = Math.atan2(dx, dz);
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && d < 30) {
        e.shootTimer = 1.1 + Math.random() * 0.8;
        e.shotFired = true;
      }
      if (e.flash > 0) {
        e.flash -= dt;
        e.mesh.children[0].material.color.setHex(e.flash > 0 ? 0xffffff : 0x8a2a2a);
      }
    });
    var before = c.enemies.length;
    c.enemies = c.enemies.filter(function (e) {
      if (e.health <= 0) {
        c.scene.remove(e.mesh);
        // Kill feed: the HUD shows the last few takedowns.
        c.killFeed.unshift('Rook took down a Dario goon');
        if (c.killFeed.length > 3) c.killFeed.pop();
        return false;
      }
      return true;
    });
    return { killed: before - c.enemies.length, booms: booms };
  }

  global.NH.makeCombat = makeCombat;
  global.NH.switchWeapon = switchWeapon;
  global.NH.reloadCombat = reload;
  global.NH.fireCombat = fire;
  global.NH.throwGrenade = throwGrenade;
  global.NH.spawnEnemy = spawnEnemy;
  global.NH.updateCombat = updateCombat;
})(window);
