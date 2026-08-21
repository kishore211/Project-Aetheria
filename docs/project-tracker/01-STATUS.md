# 01 — STATUS: What Is Done

Everything below is implemented, tested, and verified live in the browser (Playwright-driven, screenshots taken). Gates at every step: `npm test` (16 passing), `npm run lint` (0 errors), `npm run build` (green).

## Phase 1 — Foundation (done 2026-08-20)

| Item | Detail | Evidence |
|---|---|---|
| Build repair | Fixed 68 TypeScript errors; removed deprecated `baseUrl` from tsconfig | build green |
| Dead code isolated | `entityManager.ts`, `entitySystem.ts`, `animatedSpriteFactory.ts` excluded from tsconfig + eslint (orphaned duplicates, kept for reference) | build green |
| Canonical types | Store now imports `Entity`/`Tile`/`Season`/`TimeOfDay` from `src/types/world.ts` instead of weaker local copies | InfoPanel type errors gone |
| Test harness | Vitest installed, `npm test` script, ESLint 9 flat config | 16 tests pass |
| Characterization tests | `worldGenerator.test.ts` (biome mapping, day/night color), `pathfinding.test.ts` (walkability, wall routing, unreachable) | all pass |

## Phase 2 — Playable Game (done 2026-08-20)

| Item | Detail | Evidence |
|---|---|---|
| Terrain generation fixed | Noise frequencies were 0.08–0.6 across normalized coords → whole map was one biome. Now cycles-across-map (3/8/20). Temperature formula fixed (was capped at 0.58 → deserts impossible) | varied continents verified in screenshot |
| Scale unification | worldGenerator used TILE_SIZE=10 vs engine 0.5 → clicking/entities broken. Unified: TILE_SIZE=0.5, MIN_TILE_HEIGHT=0.05, HEIGHT_MULT=3.0 in both `types/world.ts` and `worldGenerator.ts` | selection works |
| A* pathfinding wired | `handleMovingState` computes path via `findPath()`, follows waypoints, falls back to direct for adjacent targets. `isWalkableForEntity` exported | wolves route around water |
| Entity AI complete | idle (needs priority → wander), moving, gathering (eat food resources), hunting (chase+attack via FOOD_CHAIN), fleeing (run from predators), sleeping (rest recovery) | creatures move/hunt live |
| Tile occupancy sync | `syncTileOccupancy` moves entities between tile lists as they walk | selection finds entities |
| Procedural pixel sprites | `pixelSprites.ts` — 5 templates (humanoid/quadruped/critter/fish/dragon) × palettes for all 16 types, canvas-rendered, NearestFilter | visible creatures in screenshots |
| All god powers | plant-trees, unearth-minerals, summon-rain toggle, fire (ignite), earthquake (terrain shift + damage), meteor (falling projectile + crater + volcanic tiles + fires), lightning (bolt + kill), blessing (heal/fertilize/purify), curse (corrupt) | each verified live, chronicle entries |
| Fire simulation | `burningTilesRef` set; spreads to FLAMMABLE_BIOMES, damages entities, rain extinguishes 3× faster, burned tiles → badlands | tested live |
| Auto time | dawn→day→dusk→night (20s/phase), 4 days/season, 4 seasons/year via `advanceDay` | topbar cycles verified |
| Weather system | store `weather` clear/rain; natural drift (8% start, 30% stop per 12s) + manual toggle; rain particle field | rain seen live |
| World events | `GameEvent` store slice; births, deaths (with names/causes), disasters, divine acts; capped at 50 | World Chronicle fills live |
| HUD | TopBar (population/calendar/time/weather), EventLog (collapsible World Chronicle), HelpOverlay (how to play), Sidebar (categorized tools + seed), InfoPanel (tile/entity inspector) | screenshots |
| Click-through fix | Engine ignores clicks where `event.target !== gl.domElement` | modal clicks no longer hit world |
| Lifecycle cleanup | World reset disposes geometries/materials/entities/effects; entity death disposes meshes | no leak on New World |
| Population publishing | `setPopulation` every 1s from manager | topbar count live |
| README rewrite | Describes actual game, controls, architecture | committed |

## Phase 3 — Juice & Polish (done 2026-08-21)

| Item | Detail | Evidence |
|---|---|---|
| Walk cycles | 2-frame gait per creature (leg-row mirroring in `getPixelSpriteFrames`), synced to bounce | verified |
| Living sky | `SKY_COLORS` per phase, `scene.background`/fog lerp each frame | dusk purple sky screenshot |
| Starfield | 350-point dome, fades in at dusk/night | screenshot |
| Drifting clouds | 10 procedural radial-gradient sprites, drift + wraparound | screenshot |
| Selection ring | Golden ring, spins + pulses (replaced wireframe box) | verified |
| Birth/death bursts | Green sparkle on spawn, gray soul-puff on death via `onEntitySpawn`/`onEntityDeath` | verified |
| Synthesized audio | `soundManager.ts` — WebAudio tones/noise: per-power SFX, rain ambience loop, UI blips, mute toggle in TopBar. Zero asset files | tested manually |
| UI motion | CSS keyframes: sidebar slide-in, topbar/timebar fade-up, modal pop, chronicle item slide, tool button hover/active/glow | verified |
| Palette pass | Softened mesa/badlands/desert/savanna from harsh orange-red to terracotta/dry-grass | screenshot comparison |

## Current quality gates (2026-08-21)

- `npm test` → 16/16 pass
- `npm run lint` → 0 errors, 0 warnings
- `npm run build` → green (bundle 1.15 MB minified / ~320 KB gzip — code-splitting is a roadmap item)
- Manual + Playwright live verification of every feature listed above
