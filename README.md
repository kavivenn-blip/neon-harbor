# Neon Harbor

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/kavivenn-blip/neon-harbor/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/kavivenn-blip/neon-harbor/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the [make.fun gta6-01 "Make GTA 6" bounty](https://make.fun/bounty/gta6-01).

Rook is back in Neon Harbor with $250 and a busted sedan. Marisol Vega, the fixer who runs the docks, has work — if Rook can still drive. Explore a sun-soaked coastal city on foot and by car: steal cars, dodge the Harbor PD, climb the wanted ladder from 1 to 5 stars, run eight story missions, and take the Harbor from Dario Kaine's crew.

## What's in the game

- **A living city at golden hour** — downtown towers, beach, docks, suburbs and a park, generated from a seed so the world is identical every run, with a sunset sun disc over the water, palm trees along the beach road, and a slow day/night cycle.
- **On foot and by car** — walk, sprint, jump and punch; drive sedans, sports cars, trucks and taxis with real acceleration, steering and handbrake drift. Cars read as cars now: visible wheels with hubcaps, headlights and taillights, sloped windshields, a spoiler on the sports car.
- **Steal cars** — parked cars and traffic cars (the driver runs off, and the cops notice).
- **Traffic and pedestrians** — 18 cars follow the road grid, 36 pedestrians walk the sidewalks and flee from gunfire and speeding cars.
- **Wanted 1–5 stars and police** — patrol cruisers chase and ram, foot cops move in to bust you, a helicopter circles at 4+ stars, and heat decays when you slip out of sight.
- **Combat** — fists, pistol, SMG, shotgun and grenades with mouse aim, ammo and reloads, enemy goons with simple AI, and a kill feed.
- **8 story missions** — steal, deliver, taxi fares, shootout, escape, heist and a street race, plus taxi side work and 20 hidden packages.
- **A dense HUD** — health, armor, cash, wanted stars, rank and respect points, day and time, mission title with stage X/Y, progress bar, objective with distance and a NEXT step, a Harbor PD dispatch panel (named units, roles, distances), five weapon slots with icons and ammo, speedometer, car name and condition, radio station and song, district/street/grip readout, and a circular live minimap with roads, waypoint, packages and police.
- **Menus and save** — start screen, pause, controls help, volume, and save/load in localStorage with a Continue button.
- **Sound** — synthesized WebAudio: engines, sirens, gunfire, ambience, UI and a Harbor FM music loop. No audio files.

## Play

Open `game/index.html` in desktop Chrome, or serve the `game/` folder with any static server:

```
node serve.ts
```

Then open http://localhost:8080

No network requests of any kind: every script, image and sound is a file under `game/` (three.js is vendored as `game/vendor/three.min.js`).

## Controls

WASD move / drive · Shift sprint · Space jump / handbrake · E enter car, steal, collect · F punch · Click shoot · 1–5 weapons · R reload · H horn · P pause · M mute · Enter start next job

## License

MIT — see [LICENSE](LICENSE).
