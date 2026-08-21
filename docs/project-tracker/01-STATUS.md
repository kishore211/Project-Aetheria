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

---

## Phase 8 — People Dynamics (done 2026-08-21)

Driven by a second research pass —
[05-PEOPLE-DYNAMICS-RESEARCH.md](05-PEOPLE-DYNAMICS-RESEARCH.md) — after the
world was judged to look "big and empty, people not roaming", with creatures
"falling into holes and not coming back".

### Stranding, fixed

Three bugs conspired to strand creatures:

| Bug | Fix |
|---|---|
| `handleMovingState` never checked walkability. When A* failed it walked a straight line to the target, marching creatures through water and mountains | Unreachable errands are abandoned; a path is re-planned when a tile on it stops being passable |
| `isWalkableForEntity` only blocked `deep_ocean`/`ocean`, so any land animal could stand in a lake | Water is off-limits except to strong swimmers fording shallows; land animals drink from the bank via `isShoreTile` |
| Nothing detected a creature that could not move | Three escape hatches, following WorldBox's own (`move_from_block`, `check_if_stuck_on_small_land`, `teleport_back_home`): a 4-second movement watchdog, a flood-fill confinement check for creatures walled into good ground, and a last-resort teleport that prefers the unit's home village |

Also fixed: diagonal A* steps could cut the corner between two blocked tiles,
which is how a creature briefly appeared to stand in the sea while walking
around a bay. Cornered animals now turn and fight instead of vibrating against
a wall.

**Evidence:** 90 animals spawned along coastlines and river banks, 25 s at 3×.
Only strong swimmers were ever in water; 75 of 92 covered more than 1.5 tiles
in 20 s. 11 regression tests in `stranding.test.ts`.

### Herds (`utils/herdSystem.ts`)

Animals gather into families capped per species (sheep 9, deer 8, wolf 5,
bear 2; snakes solitary; the civilised races never herd). The oldest is the
alpha; every ~50 s it picks somewhere far off — grazers toward the most fertile
ground in reach, hunters toward prey — and the rest trail it via a new
`following` AI state using direct steps rather than A*, because the target moves
every frame. Herds churn: adults peel off full herds to start new ones, and a
herd down to one animal dissolves. Cooldowns are WorldBox's, scaled to our much
shorter day.

**Evidence:** deer herds moved 20+ tiles together in 25 s; 26–32 herds alive in
a populated world. 11 tests.

### Colonisation and borders

| Item | Detail |
|---|---|
| Scale | A WorldBox village claims 576 tiles at founding on a map the size of our "medium"; ours claimed ~50. Claim radii roughly doubled (bonfire 4→7, hall 6→9) and village spacing raised 11→16 |
| Growing borders | Villages work their claim outward over time (WorldBox's `claim_land`), capped by how built-up they are, so borders visibly creep instead of only jumping when a building appears |
| Colonisation | A settled village with people to spare picks a site a good walk away and sends 3–5 settlers, who found the village **on arrival** — the player watches it happen. One expedition per kingdom at a time; no expansion while any village is small or while at war. Village limits by race (human 5, orc 4, elf/dwarf 3) |
| Capitals | The first village is the capital; the title passes if it falls |
| Decay | A village whose people are all gone falls to ruin and releases its land, instead of leaving dead borders on the map |
| Cost | `claimTerritory` now diffs gained/lost tiles instead of repainting hundreds of them on every build |

**Evidence:** two kingdoms grew to three villages each holding 1,027 and 556
tiles; capitals reached ~640 tiles and 18–20 buildings. 6 tests.

### Village life

| Item | Detail |
|---|---|
| Socialising | The `social` need drained and was never satisfied. Villagers now walk to their bonfire and talk, restoring the need for everyone present, and cluster there between errands |
| Staying home | Idle wandering picked a tile near wherever the unit happened to be, so villagers drifted off and left their own village looking abandoned. They now roam within ~7 tiles of home |
| Warbands | One captain per village (the strongest warrior); the rest anchor to it and only the captain gets marching orders. It moves at 72 % speed so the band keeps up, instead of warriors trickling in one at a time |
| Jobs by demand | Warriors once a village has 8 people (15 %, 40 % at war); gatherers scale inversely with the granary as WorldBox's do — 1 when full, everyone when empty |
| Grazing | Herds walked over pasture without touching it and starved on the move. Grazers now take a mouthful from the tile they stand on, and keeping up with the herd yields to hunger and thirst |

**Evidence:** social need recovered from 0.05 to a median of 0.64 in 14 s of
play; starvation events went from several per run to zero; 6 captains appointed
across 8 villages.

### Bugs found while building this

- **Village ids came from a per-instance counter,** so two settlement systems
  both minted `village-1` and a stale one could intercept a villager's
  delivery — the granary would never fill. Ids are now globally unique.
- **Systems relied on the engine wiring `simulation.onOrderComplete`.**
  Constructed anywhere else they looked functional and silently received
  nothing. Settlement and herd systems now register their own handlers.
- **Colonisation was gated on a food stockpile,** which a busy village always
  spends feeding people, so only *poor* villages could expand.
- **Existing gatherers filled every job slot** before warriors were considered,
  so no village ever armed itself.
- **A\* cleared all 16,384 tiles on every call.** It now stamps tiles with a
  search generation and invalidates lazily, with a 4,000-expansion ceiling.

### Test determinism

Behavioural assertions on an unseeded simulation are coin flips that hide real
regressions behind reruns — five separate "flakes" during this phase turned out
to be three real bugs and three assertions measuring the wrong moment.
`Math.random` is now replaced with a seeded stream before every test, so a
failure is reproducible and means something.

**Gates after Phase 8:** `npm test` 93/93 (stable across repeated runs),
`npm run lint` clean, `npm run build` clean, `npm audit` 0 vulnerabilities,
**119 fps with 197 creatures, 4 kingdoms, 8 villages and 32 herds** on a
128×128 map. Save/load round trip verified with the new village fields
(4 villages, 2 kingdoms, 100 creatures, capitals and claim bonuses identical).

---

## Current quality gates (2026-08-21)

- `npm test` → **93/93 pass**, deterministic (seeded `Math.random` per test)
- `npm run lint` → 0 errors, 0 warnings
- `npm run build` → green, no warnings; ~185 kB app + 357 kB drei + 696 kB three (gzip 57 + 113 + 178 kB)
- `npm audit` → **0 vulnerabilities**
- Live: **119 fps** on a 128×128 world with 197 creatures, 4 kingdoms, 8 villages and 32 herds
