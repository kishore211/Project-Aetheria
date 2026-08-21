# Project Aetheria

A WorldBox-inspired god simulation game. Shape a living pixel world, fill it with life, and watch emergent stories unfold — then intervene with divine powers.

## The Game

You are the god of a procedurally generated 3D pixel world. Every creature is autonomous: it wanders, drinks when thirsty, hunts or forages when hungry, flees predators, sleeps when exhausted, reproduces, ages, and dies. Every birth, death, and catastrophe is recorded in the **World Chronicle**.

### Features

- **Procedural worlds** — seeded continents with 28+ biomes: oceans, beaches, grasslands, four forest types, deserts, savannas, mesas, swamps, taiga, tundra, snow, volcanic peaks, and more
- **Living ecosystem** — food chains (wolves hunt rabbits and deer, bears hunt fish and humans…), A* pathfinding around water and mountains, needs-driven AI
- **Day/night cycle & seasons** — time flows automatically: dawn → day → dusk → night, four days per season, four seasons per year; lighting and terrain colors shift to match
- **Dynamic weather** — rain drifts in and out on its own or at your command, dousing fires
- **Fire simulation** — flames spread through flammable biomes, burn creatures, and leave scorched badlands
- **God powers**
  - *Terrain*: raise/lower land, place water, mountains, forests
  - *Life*: spawn humans, elves, dwarves, orcs, biome-appropriate animals, and monsters
  - *Nature*: plant trees, unearth mineral veins
  - *Weather*: summon or dismiss rain
  - *Destruction*: fire, earthquakes, meteor strikes, lightning
  - *Divine*: blessings (heal + fertilize + purify) and curses (corrupt + wither)
- **Procedural pixel-art sprites** — every creature type has a hand-designed pixel look rendered from code, no image assets required
- **World Chronicle** — a live event feed of births, deaths, disasters, and divine acts

## Getting Started

```bash
npm install
npm run dev      # start at http://localhost:3000
```

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check + production bundle |
| `npm test` | Vitest unit tests (world generation, pathfinding) |
| `npm run lint` | ESLint |

## Controls

- **Left click** — use the selected tool / select tiles & creatures
- **Right-drag** — rotate the camera
- **Middle-drag** — pan
- **Scroll** — zoom
- **Time controls** (bottom center) — pause, 1×, 2×, 3× speed
- **New World** — regenerate with a fresh seed (current seed shown in the sidebar)

## Architecture

```
src/
  hooks/useGameEngine.ts        game loop, tools, fire/weather/time simulation
  store/gameStore.ts            Zustand state (world params, UI, events)
  utils/worldGenerator.ts       seeded terrain, biomes, resources
  utils/entityManagerMinimal.ts entity lifecycle, occupancy, area damage/heal
  utils/entitySystemMinimal.ts  needs-driven AI state machine, sprites
  utils/pathfinding.ts          A* with per-species terrain costs
  utils/pixelSprites.ts         procedural canvas pixel-art textures
  utils/effectsManager.ts       meteors, lightning, flames, rain, auras
  components/ui/                sidebar, top bar, chronicle, inspector, help
```

## License

This project is licensed under the MIT License.
