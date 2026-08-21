# Project Aetheria

A WorldBox-inspired god simulation. Shape a living pixel world, fill it with
life, and watch civilizations rise, spread their borders, and go to war — then
intervene with divine powers.

Every sprite, texture and sound in the game is generated in code at runtime.
There are no art or audio assets.

## The game

You are the god of a procedurally generated pixel world. There is nothing to
win. The loop is **create → populate → watch → intervene → repeat**.

### The world

- **Six world templates** — Continents, Pangaea, Islands, Archipelago,
  Highlands, Great Plains — each with its own landmass scale, relief and river
  density, on any seed you like.
- **28 biomes** from deep ocean to volcanic peaks, painted in an earthy palette
  with per-tile shade variation so no two patches of grassland look identical.
- **Rivers and lakes** carved downhill from highland sources, pooling in basins
  and greening their own banks.
- **Day/night and seasons** — dawn → day → dusk → night, four days a season,
  four seasons a year. The sky, the light and the land all change colour;
  winter pales the grass and autumn turns the forests amber.
- **Weather** that drifts in on its own or at your command, and douses fires.

### Life

- **Twenty creature types** — humans, elves, dwarves and orcs; wolves, bears,
  deer, rabbits, foxes, sheep, chickens, snakes, birds and fish; dragons,
  demons, zombies, skeletons, elementals and bandits.
- **Nobody is scripted.** Every creature drinks when thirsty, forages or hunts
  when hungry, flees predators, sleeps at night, fights, breeds and dies. A*
  pathfinding routes them around water and mountains.
- **Eleven heritable traits** — swift, strong, tough, genius, long-lived,
  fertile, immortal, regenerating, pyromaniac, coward, bloodthirsty. Children
  usually inherit their parent's traits, occasionally mutate a new one, and
  the traits genuinely change behaviour: a pyromaniac leaves fires behind it.
- **A working ecology** — food regrows from soil fertility, timber and stone
  replenish, forests creep into fertile land, corruption spreads, and burned
  ground slowly heals.

### Civilization

- **Villages found themselves.** Put three of one race on good land and they
  raise a bonfire, name their settlement, and get to work.
- **Borders you can watch grow.** Every building projects a claim; the tiles it
  holds are washed in the kingdom's colour and outlined in a brighter border.
- **Kingdoms** with generated names, rulers and colours — "the Iron Horde of
  Grakzul, led by Warchief Zugnak".
- **Work and building** — villagers are assigned jobs, forage and haul timber
  and stone home, and their village spends the store on tents, houses, farms,
  towers, mines, a great hall, a temple and statues.
- **War.** Kingdoms that share a border build tension — orcs faster than
  anyone. Tension becomes a declaration, warbands march on the nearest enemy
  village, buildings come down, and when a bonfire falls the settlement is
  razed and its land released. Lose every village and your kingdom passes into
  history.

### Your powers

| Group | Powers |
|---|---|
| Terrain | raise, lower, flood, raise mountains, grow forest |
| Life | humans, elves, dwarves, orcs, wildlife, monsters |
| Nature | plant trees, unearth minerals, summon or dismiss rain |
| Destruction | fire, earthquake, meteor, lightning |
| Divine | blessing (heal, fertilise, purify, extinguish), curse (corrupt) |

All area powers honour a **1×1 / 3×3 / 5×5 brush**.

### Reading your world

- **World Chronicle** — a live history of births, deaths (with causes),
  disasters, divine acts, foundings and wars. Click any entry to fly there.
- **Minimap** — one pixel per tile with kingdom colours, creature dots and your
  camera's position. Click to travel.
- **Inspector** — tiles, creatures (needs, traits, kills, status) and villages
  (granary, buildings, territory). "Follow" a creature to watch one life play
  out.
- **Kingdoms panel** — live standings: souls, villages, territory, active wars.
- **World Laws** — switch off aging, hunger, reproduction, fire spread, biome
  growth, settlements or war and see what a world does without them.
- **Save & load** — three slots, an autosave, and file export/import.
- **Achievements** — fourteen milestones, from your first spark of life to
  watching a thriving world fall silent.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check + production bundle |
| `npm test` | Vitest suite (61 tests) |
| `npm run lint` | ESLint |

## Controls

- **Left click** — use the selected tool; inspect tiles and creatures
- **Drag** — pan the map
- **Right-drag** — rotate
- **Scroll / pinch** — zoom
- **Time controls** (bottom centre) — pause, 1×, 2×, 3×
- **New World** — regenerate from a fresh seed (shown in the sidebar)

Works on touch: the tool panel becomes a drawer and the camera is
drag-and-pinch.

## Architecture

The whole world renders in four draw calls. Terrain is one `InstancedMesh` with
a per-instance matrix and colour; kingdom borders are two more instanced quad
layers; and every tree, rock and building is a point in a custom-shader sprite
cloud that samples a procedurally drawn atlas. Clicking the map raycasts the
instanced mesh once and converts the `instanceId` straight back to tile
coordinates.

```
src/
  hooks/useGameEngine.ts         game loop, tools, fire/weather/ecology, camera
  store/gameStore.ts             Zustand state (world, UI, laws, events)
  types/world.ts                 canonical types + the visual height profile
  utils/
    worldGenerator.ts            seeded terrain, climate, rivers, biomes, palette
    terrainRenderer.ts           instanced terrain, borders, decoration
    pixelAtlas.ts                procedural pixel-art atlases
    spriteCloud.ts               one-draw-call billboarded sprite cloud
    entityManagerMinimal.ts      lifecycle, spatial index, area effects, LOD
    entitySystemMinimal.ts       needs-driven AI, combat, orders, sprites
    settlementSystem.ts          villages, kingdoms, borders, work, war
    nameGenerator.ts             per-race village/kingdom/ruler names
    traits.ts                    heritable traits
    pathfinding.ts               A* with per-species terrain costs
    effectsManager.ts            meteors, lightning, flames, rain, sky
    saveSystem.ts                delta-based saves
    soundManager.ts              synthesized SFX and a generative score
    simulation.ts                shared world-law / season context
  components/ui/                 sidebar, top bar, minimap, rail, panels
```

Project history, decisions and what was deliberately left out live in
[docs/project-tracker/](docs/project-tracker/).

## License

MIT.
