// Neon Harbor — harbor-config.js
// The single place where the game's numbers live: the city grid, the cars,
// the weapons, the eight jobs, the ranks, the radio and the dispatch board.
// Every other module reads from here and never hard-codes a tuned value, so
// a balance change is one edit in this file and nothing else moves.
//
// This file holds data only. It builds no meshes, touches no DOM and starts
// no timers; the systems that use the data live in their own modules.

(function () {
  'use strict';

  var H = window.Harbor || (window.Harbor = {});

  // ------------------------------------------------------------------ meta

  var META = {
    title: 'Neon Harbor',
    subtitle: 'An open-world crime game in the spirit of GTA 6',
    day: 1,
    // Golden hour: the sun sits low over the water at 18:12 and the whole
    // city turns orange. Every screenshot is taken at this hour.
    hour: 18.2,
    clockStartMinutes: 18 * 60 + 12,
    // One in-game minute passes every few real seconds, so the clock creeps
    // forward during play without ever leaving golden hour in a screenshot.
    minutesPerRealSecond: 0.35,
    seed: 7,
  };

  // ------------------------------------------------------------------ city

  // The city is a grid of square blocks split by avenues (north-south) and
  // streets (east-west). The beach and the water sit on the west edge, the
  // container docks on the south edge; the middle is downtown.
  var CITY = {
    blocksPerSide: 5,
    blockSize: 64,
    roadWidth: 16,
    // Half-width of the built-up area, in metres, from the centre.
    halfExtent: 200,
    beachWestEdge: -168,
    waterWestEdge: -236,
    dockSouthEdge: 168,
    // How far the camera may ever wander from the centre.
    cameraClamp: 320,
  };

  // Named places the missions and the shot hooks point at. Coordinates are
  // metres on the ground plane, x east, z south, y up.
  var PLACES = {
    pierGate: { x: -36, z: 186, label: 'Cargo Pier Gate' },
    containerYard: { x: 24, z: 196, label: 'Container Yard' },
    palmGarage: { x: 128, z: -118, label: 'Palm Court Garage' },
    strandPromenade: { x: -192, z: 36, label: 'Sunset Strand' },
    towerPlaza: { x: 64, z: -64, label: 'Harbor Towers Plaza' },
    courtCafe: { x: 148, z: 118, label: 'Palm Court Cafe' },
    greenPark: { x: -118, z: -138, label: 'Harbor Green' },
    hideout: { x: 182, z: 182, label: 'Hideout' },
    ferryTerminal: { x: -176, z: -52, label: 'Ferry Terminal' },
    fishMarket: { x: -84, z: 150, label: 'Fish Market' },
    centralCross: { x: 0, z: 0, label: 'Central Crossing' },
    northGate: { x: 20, z: -196, label: 'North Gate' },
  };

  // Districts are rectangles over the map. districtAt (in the world module)
  // answers which one a point belongs to; the HUD prints the name.
  var DISTRICTS = [
    { name: 'Sunset Strand', x0: -236, z0: -96, x1: -136, z1: 128, tint: 0xe8833a },
    { name: 'Cargo Pier', x0: -96, z0: 148, x1: 96, z1: 224, tint: 0x7a6a55 },
    { name: 'Harbor Towers', x0: 16, z0: -152, x1: 148, z1: -16, tint: 0x4a6a8a },
    { name: 'Palm Court', x0: 112, z0: 56, x1: 224, z1: 196, tint: 0xc9a227 },
    { name: 'Harbor Green', x0: -168, z0: -208, x1: -32, z1: -72, tint: 0x4a7a3a },
    { name: 'Downtown', x0: -136, z0: -72, x1: 224, z1: 148, tint: 0x8a8a8a },
  ];

  // ------------------------------------------------------------------ cars

  // Five cars the player can steal and drive. topSpeed is metres per second
  // at full throttle on a straight road; grip scales cornering.
  var CAR_MODELS = [
    { key: 'anchor', name: 'Anchor S', kind: 'sedan', color: 0x3a6ea5,
      topSpeed: 34, accel: 15, grip: 1.0, length: 4.6, width: 1.9,
      blurb: 'A dependable harbour sedan, everywhere in the city.' },
    { key: 'neon', name: 'Neon GT', kind: 'sports', color: 0xc23b2e,
      topSpeed: 48, accel: 22, grip: 1.25, length: 4.4, width: 2.0,
      blurb: 'A low red coupe with a spoiler. The one worth stealing.' },
    { key: 'hauler', name: 'Dock Hauler', kind: 'truck', color: 0x5a5a52,
      topSpeed: 26, accel: 10, grip: 0.8, length: 6.2, width: 2.3,
      blurb: 'A flatbed that carries containers, not corners.' },
    { key: 'cab', name: 'Harbor Cab', kind: 'taxi', color: 0xe8b400,
      topSpeed: 32, accel: 14, grip: 1.0, length: 4.6, width: 1.9,
      blurb: 'Yellow, dented, always in a hurry.' },
    { key: 'cruiser', name: 'Harbor Interceptor', kind: 'police', color: 0xf2f2f2,
      topSpeed: 42, accel: 20, grip: 1.15, length: 4.8, width: 2.0,
      blurb: 'Black-and-white, light bar, no patience.' },
  ];

  // ------------------------------------------------------------------ weapons

  // Five HUD slots. Slot 0 is fists (no ammo, always available). The rest
  // are picked up through play; the HUD shows LOCKED until owned.
  var WEAPONS = [
    { slot: 0, key: 'fists', name: 'Fists', damage: 12, rate: 2.2, range: 2.2,
      ammo: Infinity, reserve: Infinity, owned: true, icon: 'FST' },
    { slot: 1, key: 'pistol', name: 'Pistol', damage: 22, rate: 3.0, range: 42,
      ammo: 12, reserve: 60, owned: true, icon: 'PST' },
    { slot: 2, key: 'smg', name: 'SMG', damage: 13, rate: 9.0, range: 34,
      ammo: 30, reserve: 120, owned: false, icon: 'SMG' },
    { slot: 3, key: 'shotgun', name: 'Shotgun', damage: 16, rate: 1.1, range: 18,
      pellets: 6, ammo: 6, reserve: 24, owned: false, icon: 'SGN' },
    { slot: 4, key: 'grenade', name: 'Grenade', damage: 90, rate: 0.8, range: 26,
      ammo: 3, reserve: 6, owned: false, icon: 'GRN' },
  ];

  // ------------------------------------------------------------------ ranks

  // Respect points (RP) buy rank. Rank is shown in the HUD with a progress
  // bar to the next tier; missions pay 1000 RP, packages 50, fares 100.
  var RANKS = [
    { name: 'GREENHORN', min: 0 },
    { name: 'WHEELMAN', min: 1000 },
    { name: 'HUSTLER', min: 2500 },
    { name: 'FIXER', min: 5000 },
    { name: 'SHOT CALLER', min: 9000 },
    { name: 'HARBOR KING', min: 15000 },
  ];

  var RP_PAY = { mission: 1000, package: 50, fare: 100, takedown: 25 };

  // ------------------------------------------------------------------ police

  // Heat 0-100 drives the wanted stars: 1 star per 20 heat, capped at 5.
  // Each star band changes what the police do; the HUD dispatch panel lists
  // the units that band puts on the street.
  var WANTED = {
    heatPerStar: 20,
    maxStars: 5,
    heatDecayPerSecond: 1.2,
    heatPerShot: 6,
    heatPerHitPed: 15,
    heatPerStolenCar: 8,
    bands: [
      { stars: 0, cruisers: 0, heli: false, roadblock: false, note: 'Patrol only' },
      { stars: 1, cruisers: 1, heli: false, roadblock: false, note: 'One unit responding' },
      { stars: 2, cruisers: 2, heli: false, roadblock: false, note: 'Pursuit in progress' },
      { stars: 3, cruisers: 3, heli: false, roadblock: true, note: 'Roadblock ahead' },
      { stars: 4, cruisers: 3, heli: true, roadblock: true, note: 'Air unit deployed' },
      { stars: 5, cruisers: 4, heli: true, roadblock: true, note: 'Maximum response' },
    ],
  };

  // Dispatch call signs. A unit keeps its sign for the whole session so the
  // HUD reads like a real board: sign, role, distance.
  var DISPATCH_SIGNS = [
    { sign: 'DOCK-1', role: 'RAMMING' },
    { sign: 'PIER-2', role: 'PURSUIT' },
    { sign: 'STRAND-3', role: 'SHORE WATCH' },
    { sign: 'TOWER-4', role: 'RESPONDING' },
    { sign: 'COURT-5', role: 'CLOSING IN' },
    { sign: 'GREEN-6', role: 'PATROL' },
    { sign: 'AIR-1', role: 'SPOTLIGHT' },
    { sign: 'DOCK-7', role: 'ROADBLOCK' },
  ];

  // ------------------------------------------------------------------ radio

  var RADIO = {
    station: 'Harbor FM 101.3',
    songs: [
      { title: 'Neon Tide', artist: 'The Breakers' },
      { title: 'Sunset Run', artist: 'Marisol Vega' },
      { title: 'Harbor Lights', artist: 'Copper Line' },
      { title: 'Golden Hour', artist: 'Palm Court Club' },
    ],
    // Seconds between songs; a short jingle plays on every change.
    songSeconds: 90,
  };

  // ------------------------------------------------------------------ missions

  // Eight jobs, one story: Rook, a driver new to Neon Harbor, runs jobs for
  // fixer Marisol Vega while Dario Kaine's crew tries to push them out.
  // A step is one HUD objective. Kinds:
  //   steal    take the car parked at the step's place
  //   drive    reach the step's place in any car
  //   onfoot   reach the step's place on foot
  //   deliver  reach the step's place carrying the job's cargo
  //   clear    eliminate the step's count of crew at the place
  //   escape   drop wanted to zero, anywhere
  //   pickup   collect the step's count of fares or packages at the place
  //   wait     stand at the place for the step's seconds
  var MISSIONS = [
    {
      id: 1, title: 'First Wheels', giver: 'Marisol Vega',
      briefing: 'You need wheels before you need a reputation. Take the Anchor S at the pier gate and bring it to the Palm Court garage.',
      reward: 300, rp: 1000,
      steps: [
        { kind: 'steal', label: 'Steal the Anchor S', place: 'pierGate' },
        { kind: 'drive', label: 'Drive it to the Palm Court garage', place: 'palmGarage' },
      ],
    },
    {
      id: 2, title: 'Courier Run', giver: 'Marisol Vega',
      briefing: 'Three parcels, three districts, one clock. The clients pay for speed, not excuses.',
      reward: 450, rp: 1000, timerSeconds: 180,
      steps: [
        { kind: 'pickup', label: 'Collect the parcels at the fish market', place: 'fishMarket', count: 3 },
        { kind: 'deliver', label: 'Drop the first parcel at Harbor Towers', place: 'towerPlaza' },
        { kind: 'deliver', label: 'Drop the second parcel at the ferry terminal', place: 'ferryTerminal' },
        { kind: 'deliver', label: 'Drop the last parcel at the hideout', place: 'hideout' },
      ],
    },
    {
      id: 3, title: 'Harbor Taxi', giver: 'Marisol Vega',
      briefing: 'The cabs are short a driver and the tourists are short on patience. Two fares, no complaints.',
      reward: 200, rp: 1000,
      steps: [
        { kind: 'steal', label: 'Borrow a Harbor Cab', place: 'courtCafe' },
        { kind: 'pickup', label: 'Pick up a fare at Sunset Strand', place: 'strandPromenade', count: 1 },
        { kind: 'deliver', label: 'Drop the fare at Harbor Towers', place: 'towerPlaza' },
        { kind: 'pickup', label: 'Pick up a fare at the green', place: 'greenPark', count: 1 },
        { kind: 'deliver', label: 'Drop the fare at the ferry terminal', place: 'ferryTerminal' },
      ],
    },
    {
      id: 4, title: 'Dockside Crew', giver: 'Marisol Vega',
      briefing: "Dario's crew is leaning on the dockworkers. Go to the container yard and send them a message they can read.",
      reward: 600, rp: 1000,
      steps: [
        { kind: 'onfoot', label: 'Reach the container yard on foot', place: 'containerYard' },
        { kind: 'clear', label: "Deal with Dario's crew", place: 'containerYard', count: 6 },
        { kind: 'escape', label: 'Lose the heat', place: 'containerYard' },
      ],
    },
    {
      id: 5, title: 'Hot Pursuit', giver: 'Dario Kaine',
      briefing: "Dario wants you gone, and he sent half the harbour police to say it. Get to Palm Court with the tail still on you, then vanish.",
      reward: 500, rp: 1000,
      steps: [
        { kind: 'drive', label: 'Reach Palm Court with the police behind you', place: 'courtCafe' },
        { kind: 'escape', label: 'Break the pursuit and go quiet', place: 'courtCafe' },
      ],
    },
    {
      id: 6, title: 'The Getaway', giver: 'Marisol Vega',
      briefing: 'A red Neon GT is sitting at the strand with the keys in it and Dario\'s name on the title. Take it to the garage before he notices.',
      reward: 800, rp: 1000,
      steps: [
        { kind: 'steal', label: 'Steal the Neon GT', place: 'strandPromenade' },
        { kind: 'drive', label: 'Lose any tail on the way', place: 'towerPlaza' },
        { kind: 'drive', label: 'Deliver it to the Palm Court garage', place: 'palmGarage' },
      ],
    },
    {
      id: 7, title: 'Sunset Pickup', giver: 'Marisol Vega',
      briefing: 'Marisol is waiting on the strand promenade at sunset. Pick her up, take her to the towers, and do not let the tail catch up.',
      reward: 550, rp: 1000,
      steps: [
        { kind: 'drive', label: 'Reach the strand promenade', place: 'strandPromenade' },
        { kind: 'pickup', label: 'Pick up Marisol', place: 'strandPromenade', count: 1 },
        { kind: 'deliver', label: 'Drive Marisol to Harbor Towers', place: 'towerPlaza' },
      ],
    },
    {
      id: 8, title: 'Harbor King', giver: 'Marisol Vega',
      briefing: 'One last job: lift the shipment from the container yard, shake the whole harbour off your tail, and bring it to the hideout. Do this and the city is yours.',
      reward: 1500, rp: 2000,
      steps: [
        { kind: 'pickup', label: 'Grab the shipment at the container yard', place: 'containerYard', count: 1 },
        { kind: 'drive', label: 'Run the shipment across town', place: 'greenPark' },
        { kind: 'escape', label: 'Lose the maximum heat', place: 'greenPark' },
        { kind: 'deliver', label: 'Deliver the shipment to the hideout', place: 'hideout' },
      ],
    },
  ];

  // Twenty parcels scattered around the city for the free-roam collector.
  // The packages module spreads them once, at boot, inside these bounds.
  var PACKAGE_BOUNDS = { x0: -180, z0: -180, x1: 190, z1: 190, count: 20 };

  // ------------------------------------------------------------------ palette

  // Sunset palette. The sky, the fog, the sun disc and the street lights
  // all draw from these, so the frame reads as one golden hour.
  var PALETTE = {
    skyTop: 0x2a2a55,
    skyMid: 0xe8833a,
    skyLow: 0xf7b733,
    sunCore: 0xfff2c0,
    sunGlow: 0xff9a3c,
    fog: 0xe89a55,
    water: 0x2a5a7a,
    sand: 0xd9b380,
    asphalt: 0x3c3c42,
    sidewalk: 0x9a938a,
    buildingA: 0x8a7a6a,
    buildingB: 0x6a7a8a,
    buildingC: 0xa89080,
    buildingD: 0x5a6a7a,
    palmTrunk: 0x6a4a2a,
    palmLeaf: 0x2a7a3a,
  };

  // ------------------------------------------------------------------ tuning

  var TUNING = {
    // Street life the player sees while driving around.
    trafficCars: 18,
    pedestrians: 36,
    parkedCars: 14,
    // How many the shot hooks pull into frame for a dense screenshot.
    shotCars: 12,
    shotPeds: 16,
    // Movement.
    walkSpeed: 6,
    runSpeed: 10,
    enterCarDistance: 3.5,
    // Camera: metres behind and above the player, and how fast it follows.
    cameraBack: 9,
    cameraUp: 4.2,
    cameraLerp: 6,
    // Helicopter hover height for normal play; the shot hooks fly it lower.
    heliHeight: 42,
    heliShotHeight: 20,
    // The player's starting spot: on the beach road, facing the sunset.
    startX: -150,
    startZ: 60,
    startHeading: Math.PI / 2,
    startCash: 250,
    startHealth: 100,
    startArmor: 50,
  };

  // ------------------------------------------------------------------ helpers

  function rankFor(rp) {
    var found = RANKS[0];
    for (var i = 0; i < RANKS.length; i++) {
      if (rp >= RANKS[i].min) found = RANKS[i];
      else break;
    }
    return found;
  }

  // Respect points still needed for the next tier, or 0 at the top.
  function rankNext(rp) {
    for (var i = 0; i < RANKS.length; i++) {
      if (rp < RANKS[i].min) return RANKS[i].min - rp;
    }
    return 0;
  }

  function missionById(id) {
    for (var i = 0; i < MISSIONS.length; i++) {
      if (MISSIONS[i].id === id) return MISSIONS[i];
    }
    return MISSIONS[0];
  }

  function placeByName(name) {
    return PLACES[name] || PLACES.centralCross;
  }

  function weaponBySlot(slot) {
    for (var i = 0; i < WEAPONS.length; i++) {
      if (WEAPONS[i].slot === slot) return WEAPONS[i];
    }
    return WEAPONS[0];
  }

  // Deterministic RNG (mulberry32). Every module that needs randomness
  // takes the session's rng, so a screenshot URL with a fixed seed renders
  // the same street every time. Never use Math.random in world building.
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  H.Config = {
    META: META,
    CITY: CITY,
    PLACES: PLACES,
    DISTRICTS: DISTRICTS,
    CAR_MODELS: CAR_MODELS,
    WEAPONS: WEAPONS,
    RANKS: RANKS,
    RP_PAY: RP_PAY,
    WANTED: WANTED,
    DISPATCH_SIGNS: DISPATCH_SIGNS,
    RADIO: RADIO,
    MISSIONS: MISSIONS,
    PACKAGE_BOUNDS: PACKAGE_BOUNDS,
    PALETTE: PALETTE,
    TUNING: TUNING,
    rankFor: rankFor,
    rankNext: rankNext,
    missionById: missionById,
    placeByName: placeByName,
    weaponBySlot: weaponBySlot,
    rng: rng,
    clamp: clamp,
    lerp: lerp,
  };
})();
