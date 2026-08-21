# 01 — STATUS: What Is Done

Everything below is implemented and verified. Gates at every step: `npm test`,
`npm run lint`, `npm run build`, plus live verification in a real browser
(screenshots and scripted runs through the game's own code paths).

## Phase 1 — Foundation (done 2026-08-20)

| Item | Detail | Evidence |
|---|---|---|
| Build repair | Fixed 68 TypeScript errors; removed deprecated `baseUrl` from tsconfig | build green |
| Dead code isolated | `entityManager.ts`, `entitySystem.ts`, `animatedSpriteFactory.ts` excluded from tsconfig + eslint (orphaned duplicates) | build green |
| Canonical types | Store imports `Entity`/`Tile`/`Season`/`TimeOfDay` from `src/types/world.ts` | InfoPanel type errors gone |
| Test harness | Vitest installed, `npm test` script, ESLint 9 flat config | 16 tests pass |
| Characterization tests | `worldGenerator.test.ts`, `pathfinding.test.ts` | all pass |

## Phase 2 — Playable Game (done 2026-08-20)

| Item | Detail | Evidence |
|---|---|---|
| Terrain generation fixed | Noise frequencies were per-tile instead of per-map → one biome everywhere. Now cycles-across-map. Temperature formula fixed (deserts were impossible) | varied continents |
| Scale unification | worldGenerator used TILE_SIZE=10 vs engine 0.5 → clicking/entities broken. Unified in `types/world.ts` | selection works |
| A* pathfinding wired | `handleMovingState` follows `findPath()` waypoints, falls back to direct steps | wolves route around water |
| Entity AI | idle / moving / gathering / hunting / fleeing / sleeping, needs-driven | creatures live |
| Tile occupancy sync | `syncTileOccupancy` moves entities between tile lists | selection finds entities |
| Procedural pixel sprites | `pixelSprites.ts` — templates × palettes, canvas-rendered, NearestFilter | visible creatures |
| All god powers | terrain, life, nature, weather, destruction, divine | each verified live |
| Fire simulation | spreads through flammable biomes, damages creatures, rain douses it, leaves badlands | tested live |
| Auto time & weather | dawn→day→dusk→night, 4 days/season; rain drifts in and out | topbar cycles |
| World events | births, deaths with causes, disasters, divine acts | World Chronicle fills |
| HUD | TopBar, EventLog, HelpOverlay, Sidebar, InfoPanel | screenshots |
| Lifecycle cleanup | World reset disposes geometries/materials/entities/effects | no leak on New World |

## Phase 3 — Juice & Polish (done 2026-08-21)

| Item | Detail | Evidence |
|---|---|---|
| Walk cycles | 2-frame gait per creature, synced to bounce | verified |
| Living sky | `SKY_COLORS` per phase, background/fog lerp each frame | dusk sky screenshot |
| Starfield & clouds | 350-point dome fading in at dusk; 10 drifting cloud sprites | screenshots |
| Selection ring | Golden ring, spins and pulses | verified |
| Birth/death bursts | Green sparkle on spawn, grey soul-puff on death | verified |
| Synthesized audio | `soundManager.ts` — WebAudio tones/noise, per-power SFX, rain ambience, mute toggle. Zero asset files | tested manually |
| UI motion | CSS keyframes for panels, modal, chronicle, tool buttons | verified |

---

## Phase 4 — Map Redesign (done 2026-08-21)

The map was 16,384 individual `BoxGeometry` meshes with 16,384 materials, tall
extruded columns and real-time shadows. Full rationale in
[03-MAP-REDESIGN.md](03-MAP-REDESIGN.md).

| Item | Detail | Evidence |
|---|---|---|
| **M1. Instanced terrain** | New `utils/terrainRenderer.ts`: one `InstancedMesh` for all tiles, per-instance matrix + colour. Raycast returns `instanceId` → tile coords. `Tile.mesh` replaced by `Tile.instanceId`. 16,384 draw calls → 4 for the whole world | `terrainRenderer.test.ts` round-trips every tile ↔ instance id; 120 fps measured live with 6 kingdoms |
| **M2. Flat profile** | `computeScaledHeight()` in `types/world.ts`: height multiplier 3.0 → 0.6, water sunken, land on a low plinth. Raw `height` (and therefore all simulation) untouched | test asserts nothing exceeds 0.8 units of relief |
| **M3. Top-down camera** | `MapControls` (pan-first), `maxPolarAngle` π/2.6, zoom range tuned to the world size, camera framed to fit the map on load | screenshot |
| **M4. Lighting diet** | No shadow maps, no shadow ground plane, `castShadow` off everywhere; ambient + directional tint only, brightened to suit `MeshLambertMaterial` | screenshot |
| **M5. Colour jitter + detail sprites** | Per-tile deterministic `variant` shifts lightness ±5%. New `utils/pixelAtlas.ts` (procedural 12×12 art atlas) + `utils/spriteCloud.ts` (custom-shader `THREE.Points` cloud, atlas slot + size + tint per point) draw trees, pines, rocks, cacti, reeds, palms, deadwood and crystals in **one** draw call, updated per tile in O(1) | screenshots |
| **M6. Minimap** | `components/ui/Minimap.tsx` — 1 px/tile `ImageData`, relief shading, kingdom colours, creature dots, camera box, click-to-fly. Redraws at ~4 fps | screenshot |
| Palette pass | Whole biome palette redone: desaturated and earthy. Seasons now *repaint* (winter lerps toward snow, autumn toward amber) instead of just dimming | screenshots + tests |
| Rivers & lakes | Rivers carve downhill from highland sources, pool into lakes in basins, and wet their banks (which the biome pass turns green) | `worldGenerator.test.ts` |
| World templates | Continents, Pangaea, Islands, Archipelago, Highlands, Great Plains — each with its own noise scale, contrast, lift and river density | test asserts archipelagos are wetter than Pangaea |

## Phase 5 — Civilization Layer (done 2026-08-21)

New `utils/settlementSystem.ts` and `utils/nameGenerator.ts`.

| Item | Detail | Evidence |
|---|---|---|
| **C1. Settlements** | Three or more unaffiliated adults of one race on fertile land found a village: a bonfire, a generated name, a granary. Villages stay ≥11 tiles apart | `settlementSystem.test.ts` |
| **C2. Territory zones** | Every building projects a claim (2–6 tiles by type). Claimed tiles render as a soft kingdom-coloured wash plus a bright border layer — two instanced quad layers, borders recomputed only around dirty tiles | test verifies every claimed tile points back at its kingdom |
| **C3. Kingdoms & names** | Per-race lexicons generate village, kingdom and ruler names ("Warchief Zugnak of the Iron Horde of Grakzul"). Kingdom colours are handed out per race without repeats. Live standings in `KingdomsPanel`, count in the TopBar, details in the inspector | screenshots |
| **C4. Jobs & resources** | Villagers are assigned gatherer or warrior roles. Gatherers forage, then fell timber and quarry stone, haul it home via an `AIOrder`, and the granary feeds hungry residents. Construction spends the store | live run: 26-building village |
| **C5. War & raids** | Shared borders grow tension (faster for orcs, scaled by border length) → war declaration → warbands ordered at the nearest enemy village → melee → buildings torn down → bonfire falls → village razed, land released, kingdom dissolved if it was the last one. Wars time out into peace | live run produced "Easterwick Commonwealth declares war on Bloodpact of Grakmash" and "Khazahold Clanhold has fallen"; two tests cover tension growth and razing |
| Building progression | 9 building types (bonfire, tent, house, farm, hall, tower, mine, temple, statue) with costs, unlock thresholds, per-village limits and a **priority order** so a village saves up for a hall instead of spending everything on tents | live run: bonfire → tents → houses → farms → towers → hall → temple → mines → statues |

## Phase 6 — Sandbox Depth (done 2026-08-21)

| Item | Detail | Evidence |
|---|---|---|
| **S1. Save/load** | `utils/saveSystem.ts`. Terrain is deterministic from (seed, size, template), so a save stores only *deltas*: reshaped tiles, ownership, creatures, villages, kingdoms. A mid-game world with 155 edited tiles = **11.7 kB**. Three slots + autosave every 150 s + file export/import, all in `SavePanel` | `saveSystem.test.ts` (5 tests) + live round trip restoring entities and tile deltas |
| **S2. Brush sizes** | 1×1 / 3×3 / 5×5 for terrain, forest, minerals and fire; disasters and divine powers scale their radius with it | live test: 5×5 mountain brush |
| **S3. World laws** | Eight switches (aging, hunger, reproduction, fire spread, biome growth, settlements, warfare, disasters) in `WorldLawsPanel`, published to the systems through `utils/simulation.ts` | tests assert needs stop draining with hunger off |
| **S4. More creatures** | Sheep, chickens, foxes and snakes added with sprites (two new art templates), profiles, food-chain entries, spawn weights and population caps | live spawn test |
| **S5. Traits** | 11 heritable traits (`utils/traits.ts`): swift, strong, tough, genius, long-lived, fertile, immortal, regeneration, pyromaniac, coward, bloodthirsty. Rolled at spawn, ~75% inherited per trait with a 12% mutation chance, shown as chips in the inspector, and they change behaviour (pyromaniacs start fires, cowards flee sooner, the bloodthirsty hunt when fed) | `traits.test.ts` (6 tests) |
| **S6. Spectate mode** | "Follow" in the inspector locks the camera to one creature's life | live test |
| **S7. Clickable chronicle** | Events carry coordinates; clicking an entry flies the camera there | live test |
| Ecology loop | Food regrows from fertility (slowly in winter), timber and stone replenish, forests creep into fertile grassland, corruption spreads, scorched badlands heal. Sampled per tick, so cost is independent of map size | live run |
| Seasons matter | Winter drains needs ~45% faster and nearly stops regrowth; the palette and the ambient score shift with it | test compares summer vs winter drain |
| Ambient score | Generative WebAudio pad — two detuned voices per chord through a low-pass, one chord every 7 s, brighter in spring/summer and darker in autumn/winter. Toggle in the TopBar | manual |
| Achievements | 14 milestones in `utils/achievements.ts`, unlocked by watching published state only, persisted in localStorage, surfaced as a toast | live: 5 unlocked during the smoke test |

## Phase 7 — Performance & Quality (done 2026-08-21)

| Item | Detail | Evidence |
|---|---|---|
| **P1. Spatial entity index** | `EntityManager` keeps 8×8-tile buckets; `query(x, y, radius)` replaces the old 289-tile scans in prey/threat search. AI perception is now O(neighbours) | 120 fps with 50+ entities and 6 kingdoms |
| **P2. Code splitting** | `manualChunks` splits three.js (696 kB) and fiber/drei (357 kB) from app code (181 kB). No chunk-size warning | build output |
| **P3. Zoom LOD** | Camera distance drives a `detailLevel`; health bars and walk-frame swaps switch off when the map is zoomed out | code + live |
| **P4. Test suite** | 61 tests across 7 files: world generation and templates, instanced-terrain mapping, pathfinding, save/load, traits, AI needs/movement/food-chain/orders, settlement founding, territory, war and razing. Ran 8× consecutively to confirm no flakes | `npm test` |
| **P5. npm audit** | Was 20 advisories (3 low / 5 moderate / 12 high). Now **0 vulnerabilities** | `npm audit` |
| **P6. Mobile & touch** | Sidebar becomes a drawer that starts closed under 700 px; right-hand panels stack in one scrolling rail instead of pinned corners; compact time bar; `touch-action: none` on the canvas; safe-area insets; `prefers-reduced-motion` respected | code |
| Frame-rate independence | AI movement was per-frame; it is now delta-based (tiles per second) | test walks the same distance at 10 fps and 50 fps |
| Dead code removed | The nine-file orphaned island (`entityManager`, `entitySystem`, `animatedSpriteFactory`, `visualizationManager`, `terrainVisualizer`, `particleSystem`, `visualSettings`, `spriteHandler`, `entitySprites`) deleted; tsconfig and eslint exclusions dropped | build green with no exclusions |
| Browserslist | `caniuse-lite` refreshed | no build warning |
| Test/debug bridge | `window.__aetheria` exposes tiles, entities, tools, camera and settlements so the game can be driven headlessly | used for the live smoke tests |

## Bugs found and fixed while finishing

- **World regenerated on every time-of-day change.** `initializeWorld` depended on the light-setup callback, so the world was rebuilt four times a game-day (visible as repeated "A new world awakens" entries and a camera reset). Dependencies narrowed to world identity only.
- **Fire deaths blamed on the gods.** Burning tiles called `damageArea`, which always reported `divine`; a pyromaniac's victims read as smitten. `damageArea` now takes a cause and fire passes `burned`.
- **Territory read as grey mush.** One 42%-opacity layer over green terrain was illegible. Split into a 26% fill plus a 92% lightened border layer, with the colour buffer pre-allocated so three compiles the instance-colour shader path.
- **Villages never built anything impressive.** Recipes were scanned cheapest-first, so timber always went on tents. Recipes now carry an explicit priority and a village builds the best thing it can afford.
- **Villagers only ever gathered food.** Wood and stone were collected by accident; gatherers now seek timber and quarry tiles once fed, and forests/hills replenish.
- **Point sprites were the wrong size.** The size formula ignored the field of view, making decoration ~half the size it should be at any zoom.
- **Birth blips could swarm.** The spawn sound is rate limited to one per 220 ms.
- **A flaky test.** A trait test compared separate random rolls; rewritten to assert the actual invariant.

## Current quality gates (2026-08-21)

- `npm test` → **61/61 pass** (stable across 8 consecutive runs)
- `npm run lint` → 0 errors, 0 warnings
- `npm run build` → green, no warnings; 181 kB app + 357 kB drei + 696 kB three (56 + 113 + 178 kB gzip)
- `npm audit` → **0 vulnerabilities**
- Live: 120 fps on a 128×128 world with 50+ creatures, 6 kingdoms and 6 villages
