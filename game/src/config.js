// config.js — Neon Harbor: seeded RNG, world constants, districts, palettes.
// Every system reads its numbers from here so the city is stable between runs.
(function (global) {
  'use strict';

  // mulberry32 — deterministic seeded random.
  function RNG(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var CFG = {
    seed: 20261120,
    // City grid: 9 x 9 blocks, 36 units per block, 12-unit roads.
    blocks: 9,
    block: 36,
    road: 12,
    pitch: 48, // block + road
    // Districts by region (x east, z south).
    districts: {
      downtown: { x0: -110, x1: 110, z0: -110, z1: 110, hMin: 26, hMax: 95 },
      beach: { x0: -230, x1: -150, z0: -230, z1: 230 },
      docks: { x0: -150, x1: 150, z0: 150, z1: 230 },
      suburbs: { x0: 110, x1: 230, z0: -230, z1: 150, hMin: 5, hMax: 12 },
    },
    // Day cycle: time is hours 0-24; late afternoon default (bright, warm).
    timeOfDay: 16.5,
    // Traffic / pedestrian budgets (kept low for 60 fps on real GPUs).
    trafficCars: 12,
    pedestrians: 24,
    // Wanted.
    maxWanted: 5,
    heatDecaySeconds: 10,
    // Player.
    walkSpeed: 6,
    sprintSpeed: 10,
    playerHealth: 100,
    playerArmor: 50,
    startCash: 250,
    // Weapons: name, damage, rate (shots/sec), mag, spread, range.
    weapons: {
      pistol: { name: 'Pistol', damage: 25, rate: 3, mag: 12, spread: 0.02, range: 60 },
      smg: { name: 'SMG', damage: 12, rate: 10, mag: 30, spread: 0.06, range: 45 },
      shotgun: { name: 'Shotgun', damage: 9, pellets: 8, rate: 1, mag: 6, spread: 0.12, range: 25 },
      grenade: { name: 'Grenade', damage: 90, rate: 0.7, mag: 3, spread: 0, range: 40, radius: 9 },
    },
    // Car types: top speed, accel, handling, color, label.
    cars: {
      sedan: { top: 24, accel: 14, grip: 2.2, color: 0x3a6ea5, label: 'Sedan' },
      sports: { top: 36, accel: 22, grip: 2.8, color: 0xc23b2e, label: 'Sports' },
      truck: { top: 18, accel: 9, grip: 1.6, color: 0x7a6a4a, label: 'Truck' },
      taxi: { top: 26, accel: 15, grip: 2.3, color: 0xe8b400, label: 'Taxi' },
      police: { top: 30, accel: 19, grip: 2.6, color: 0xe8e8e8, label: 'Police Cruiser' },
    },
    // Palette (sun-soaked modern city).
    palette: {
      skyDay: 0x87b5d6, skyDusk: 0xe8905a, skyNight: 0x0d1526,
      sunDay: 0xfff2d8, sunDusk: 0xffb36b,
      grass: 0x4a7c59, sand: 0xd9c28a, water: 0x2e6f8e,
      road: 0x2c2f36, sidewalk: 0x8a8d90,
      building: [0x8a7f72, 0x6e7f8a, 0x9a8a6a, 0x7a6a72, 0x5f6e5a, 0xa89a80],
    },
  };

  global.NH = global.NH || {};
  global.NH.CFG = CFG;
  global.NH.RNG = RNG;
})(window);
