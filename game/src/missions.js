// missions.js — story and the mission engine: 8 missions with briefings,
// dialogue, waypoints, timers, fail/retry and rewards, plus side activities
// (taxi fares and hidden packages). Data-driven; the main loop drives it.
(function (global) {
  'use strict';

  // Story: Rook, a wheelman back in Neon Harbor; fixer Marisol Vega;
  // rival crew boss Dario Kaine.
  var STORY = {
    hero: 'Rook',
    fixer: 'Marisol Vega',
    rival: 'Dario Kaine',
    intro: 'Rook is back in Neon Harbor with $250 and a busted sedan. Marisol Vega, the fixer who runs the docks, has work — if Rook can prove he still drives.',
  };

  var MISSIONS = [
    { id: 1, title: 'First Wheels', type: 'steal', brief: '"Borrow me a sedan from the downtown lot. Any sedan. Don\'t make a scene."', reward: 300,
      steps: [{ kind: 'goto', x: 24, z: 24, text: 'Go to the downtown car lot' }, { kind: 'steal', text: 'Steal a sedan (press E near a car)' }, { kind: 'goto', x: -100, z: 180, text: 'Deliver the sedan to Marisol\'s garage' }] },
    { id: 2, title: 'Courier Run', type: 'deliver', brief: '"A package for the beach house. Three minutes. The cops are jumpy tonight — keep it clean."', reward: 400, timer: 180,
      steps: [{ kind: 'goto', x: -190, z: -40, text: 'Pick up the package at the beach house' }, { kind: 'goto', x: 150, z: -150, text: 'Deliver it to the north suburbs' }] },
    { id: 3, title: 'Taxi Trouble', type: 'taxi', brief: '"A cabbie owes me. Drive his taxi, pick up three fares, and keep the meter running."', reward: 450,
      steps: [{ kind: 'taxi', fares: 3, text: 'Pick up 3 fares in the taxi (drive up to the $ marker)' }] },
    { id: 4, title: 'Dockside Deal', type: 'shootout', brief: '"Dario\'s crew is moving product at the docks. Shut it down. All of them."', reward: 700,
      steps: [{ kind: 'goto', x: 0, z: 185, text: 'Go to the docks' }, { kind: 'kill', count: 6, text: 'Eliminate Dario\'s crew (6)' }, { kind: 'goto', x: -100, z: 180, text: 'Report back to Marisol' }] },
    { id: 5, title: 'Hot Pursuit', type: 'escape', brief: '"You\'re hot, Rook. Lose the cops and get to the safehouse. Don\'t let them box you in."', reward: 600,
      steps: [{ kind: 'escape', text: 'Lose the wanted level (stay out of sight)' }, { kind: 'goto', x: 180, z: 120, text: 'Reach the safehouse' }] },
    { id: 6, title: 'Grand Theft Harbor', type: 'steal', brief: '"Dario parks his sports car by the marina, guarded. Take it. Make it loud."', reward: 900,
      steps: [{ kind: 'goto', x: -170, z: 60, text: 'Go to the marina lot' }, { kind: 'steal', carType: 'sports', text: 'Steal the sports car' }, { kind: 'goto', x: -100, z: 180, text: 'Bring it to Marisol\'s garage' }] },
    { id: 7, title: 'Street Race', type: 'race', brief: '"Dario\'s boys think they own these streets. Beat them through the checkpoints. Winner takes $800."', reward: 800, timer: 150,
      steps: [{ kind: 'race', points: [[-144, -144], [144, -144], [144, 144], [-144, 144], [0, 0]], text: 'Hit every checkpoint in order' }] },
    { id: 8, title: 'The Big One', type: 'heist', brief: '"The cash van leaves the bank at noon. Take it, lose the heat, and bring it to the docks. This is the one, Rook."', reward: 1500,
      steps: [{ kind: 'goto', x: 48, z: -48, text: 'Intercept the cash van downtown' }, { kind: 'steal', carType: 'truck', text: 'Take the van' }, { kind: 'escape', text: 'Lose the wanted level' }, { kind: 'goto', x: 0, z: 195, text: 'Deliver the van to the docks' }] },
  ];

  function makeMissions() {
    return {
      index: 0, active: null, step: 0, timer: 0,
      kills: 0, fares: 0, racePoint: 0, escaped: false,
      packages: 0, packagesTotal: 20, taxiFare: null,
      done: [], failed: false,
    };
  }

  function startMission(m, i) {
    var def = MISSIONS[i];
    if (!def) return null;
    m.active = def;
    m.index = i;
    m.step = 0;
    m.timer = def.timer || 0;
    m.kills = 0; m.fares = 0; m.racePoint = 0; m.escaped = false;
    m.failed = false;
    return def;
  }

  function currentStep(m) {
    return m.active ? m.active.steps[m.step] : null;
  }

  function waypoint(m) {
    var s = currentStep(m);
    if (!s) return null;
    if (s.kind === 'goto') return { x: s.x, z: s.z };
    if (s.kind === 'race' && s.points) {
      var p = s.points[Math.min(m.racePoint, s.points.length - 1)];
      return { x: p[0], z: p[1] };
    }
    if (s.kind === 'taxi' && m.taxiFare) return { x: m.taxiFare.x, z: m.taxiFare.z };
    if (s.kind === 'kill') return { x: 0, z: 185 };
    if (s.kind === 'steal') return { x: m.active.id === 6 ? -170 : 24, z: m.active.id === 6 ? 60 : 24 };
    if (s.kind === 'escape') return null;
    return null;
  }

  function objectiveText(m) {
    var s = currentStep(m);
    if (!s) return m.active ? 'Mission complete' : 'No active mission';
    var t = s.text;
    if (s.kind === 'kill') t = 'Eliminate Dario\'s crew (' + m.kills + '/' + s.count + ')';
    if (s.kind === 'taxi') t = 'Pick up fares in the taxi (' + m.fares + '/' + s.fares + ')';
    if (s.kind === 'race') t = 'Hit checkpoints in order (' + m.racePoint + '/' + s.points.length + ')';
    return t;
  }

  // Advance the mission. ctx: {x, z, inCar, carType, wanted, killed, stole}.
  // Returns {advanced, done, failed, reward}.
  function updateMission(m, dt, ctx) {
    var out = { advanced: false, done: false, failed: false, reward: 0 };
    if (!m.active) return out;
    if (m.timer > 0) {
      m.timer -= dt;
      if (m.timer <= 0) { m.failed = true; out.failed = true; return out; }
    }
    var s = currentStep(m);
    if (!s) return out;
    var near = function (x, z, r) { return Math.hypot(ctx.x - x, ctx.z - z) < r; };
    function next() {
      m.step++;
      out.advanced = true;
      if (m.step >= m.active.steps.length) {
        out.done = true;
        out.reward = m.active.reward;
        m.done.push(m.active.id);
        m.active = null;
      }
    }
    if (s.kind === 'goto') {
      if (near(s.x, s.z, 8)) next();
    } else if (s.kind === 'steal') {
      if (ctx.stole && (!s.carType || ctx.carType === s.carType)) next();
    } else if (s.kind === 'kill') {
      if (m.kills >= s.count) next();
    } else if (s.kind === 'taxi') {
      if (m.fares >= s.fares) next();
    } else if (s.kind === 'race') {
      var p = s.points[m.racePoint];
      if (p && near(p[0], p[1], 10)) {
        m.racePoint++;
        if (m.racePoint >= s.points.length) next();
        else out.advanced = true;
      }
    } else if (s.kind === 'escape') {
      // Completes the moment the wanted level is clean. Missions that need
      // heat grant it on start (main.js adds the crime when they begin).
      if (ctx.wanted === 0) next();
    }
    return out;
  }

  global.NH.STORY = STORY;
  global.NH.MISSIONS = MISSIONS;
  global.NH.makeMissions = makeMissions;
  global.NH.startMission = startMission;
  global.NH.currentStep = currentStep;
  global.NH.missionWaypoint = waypoint;
  global.NH.missionObjective = objectiveText;
  global.NH.updateMission = updateMission;
})(window);
