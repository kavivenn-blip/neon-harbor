# Neon Harbor

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun)
[![rank](https://make.fun/badge/gta6-01/kavivenn-blip/neon-harbor/rank.svg)](https://make.fun)
[![reward](https://make.fun/badge/gta6-01/kavivenn-blip/neon-harbor/reward.svg)](https://make.fun)

An open-world crime game in the spirit of GTA 6, built for the
[make.fun](https://make.fun) **gta6-01** bounty. It runs in a desktop web
browser from its own files — no build step, no network requests.

You are Rook, a driver new to Neon Harbor. Run eight jobs for fixer
Marisol Vega, steal and drive five kinds of car, dodge Dario Kaine's crew
and the harbour police, and climb from GREENHORN to HARBOR KING — all at
golden hour, 18:12, on the Sunset Strand beach road.

## Play

Open `game/index.html` directly in a desktop browser, or serve the
repository and open it over HTTP:

```sh
node serve.ts
# then open http://localhost:8080/
```

Keyboard and mouse: **WASD** move / drive, **E** enter and exit a car,
**Shift** run, **mouse** aim, **click** shoot, **1–5** switch weapon,
**Esc** pause, **M** mute. The start screen explains the rest.

## What is in the game

- A 5×5-block harbour city: downtown, Sunset Strand beach, Cargo Pier
  container docks, Harbor Towers, Palm Court and Harbor Green — with
  traffic, pedestrians, palms and a low sun over the water.
- A wanted level (1–5 stars) with police cruisers that pursue and ram,
  roadblocks from 3 stars, and a helicopter with a spotlight from 4.
- Eight story missions with stages, timers and a NEXT objective, plus
  taxi fares and twenty parcels to collect around the city.
- Combat with five weapon slots, a kill feed and tracers; a dense HUD
  with a named dispatch board, rank and respect bar, circular minimap,
  radio (Harbor FM 101.3), and portrait dialogue.
- Saving and loading from the pause menu.

## Screenshots

Four screenshots of the running game live in `screenshots/` (cover first).
They are retaken from the game itself with a fixed seed (`shots.json` lists
each shot and its URL query), so every run reproduces the same frames.

## Hand in

`main.ts` (Node 22, standard library only) copies `game/` and
`screenshots/` to `/output` and writes `/output/dossier.json`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Source layout

| File | Job |
| --- | --- |
| `game/src/config.js` | All tuned numbers: city, cars, weapons, missions, ranks, radio |
| `game/src/world.js` | The city: streets, buildings, beach, docks, sun and sky |
| `game/src/vehicles.js` | Car models and the cars the player can steal |
| `game/src/traffic.js` | Traffic, pedestrians and parked cars |
| `game/src/player.js` | Rook on foot and behind the wheel |
| `game/src/police.js` | Pursuit, roadblocks, dispatch and the helicopter |
| `game/src/missions.js` | The eight jobs, fares and parcels |
| `game/src/combat.js` | Weapons, shooting, tracers and the kill feed |
| `game/src/hud.js` | The HUD, minimap and dialogue portraits |
| `game/src/audio.js` | Synthesised sound and the radio |
| `game/src/ui.js` | Menus, toasts, saving and loading |
| `game/src/main.js` | Boot, game loop, camera and screenshot hooks |

Everything in the game — the city, the cars, the characters, the story,
the music — is original work made for this entry. No assets, names or
music from any commercial game are used. three.js r147 is vendored under
`game/vendor/` as the bounty allows.

## License

MIT — see `LICENSE`.
