# 04 — ROADMAP: Everything Left To Do

Ordered by priority. Each item lists **what**, **why**, **how**, and **files**. Move items to [01-STATUS.md](01-STATUS.md) when done.

---

## Tier 1 — Map Redesign (next up; full spec in [03-MAP-REDESIGN.md](03-MAP-REDESIGN.md))

- [ ] **M1. Instanced terrain** — one InstancedMesh, per-instance color/matrix, raycast by instanceId. *Files: worldGenerator.ts, useGameEngine.ts, types/world.ts*
- [ ] **M2. Flat profile** — height multiplier 3.0 → 0.6; visual only, simulation untouched. *Files: types/world.ts, worldGenerator.ts*
- [ ] **M3. Top-down camera** — high default pitch, map-style pan/zoom limits. *Files: GameContainer.tsx*
- [ ] **M4. Lighting diet** — no terrain shadows, no shadow plane, keep tint lights. *Files: GameContainer.tsx, useGameEngine.ts, App.tsx*
- [ ] **M5. Tile color jitter + detail sprites** — per-tile shade variation; tree/rock billboards on forests/mountains. *Files: worldGenerator.ts, pixelSprites.ts*
- [ ] **M6. Minimap panel** — 1px/tile canvas, dirty-tile redraw, click-to-jump. *New: components/ui/Minimap.tsx*

## Tier 2 — Civilization Layer (the WorldBox magic: borders & kingdoms)

- [ ] **C1. Settlements** — sentient races found a village when ≥3 same-race units cluster on fertile land; bonfire structure; village grows houses as population grows. *New: utils/settlementSystem.ts; hooks into entityManagerMinimal*
- [ ] **C2. Territory zones** — villages claim tiles outward from buildings (zone range); render as tinted overlay per kingdom color; the "watching borders grow" magic. *Extend Tile with `ownerId`; overlay via instanced color blend or second transparent instanced layer*
- [ ] **C3. Kingdoms & names** — deterministic name generator per race; kingdom color; TopBar count; kingdom inspector panel. *New: utils/nameGenerator.ts; InfoPanel extension*
- [ ] **C4. Jobs & resources** — villagers gather wood/food/stone to a village store; construction consumes it. *Extend EntityAI gathering state to deliver to village*
- [ ] **C5. War & raids** — adjacent kingdoms accumulate tension → raid parties; capture/burn buildings; chronicle entries + minimap flashes. *settlementSystem + EntityAI fighting state (currently placeholder)*

## Tier 3 — Sandbox Depth

- [ ] **S1. Save/load** — versioned JSON of tiles+entities+time in localStorage, 3 slots + autosave; export/import file. Strip meshes (rebuild on load). *New: utils/saveSystem.ts; Sidebar UI*
- [ ] **S2. Brush sizes** — 1/3/5-tile radius selector for terrain/biome/divine powers (WorldBox staple). *Store `brushSize`; applyToolEffect loops radius; Sidebar selector*
- [ ] **S3. World laws panel** — toggles: hunger, aging, reproduction, disasters, fire spread, biome overgrowth. *Store slice + modal; guards in entityManager/engine sim loops*
- [ ] **S4. More creatures** — sheep, chicken, fox, snake + spawn weights; zombie variants on curse death. *pixelSprites templates + palettes; FOOD_CHAIN entries; spawn-animal candidates*
- [ ] **S5. Traits** — 8–10 unit traits (fast, strong, genius, immortal, pyromaniac…), random at spawn, inherited by children, shown in InfoPanel. *createEntity + EntityAI modifiers*
- [ ] **S6. Spectate mode** — click "follow" on a unit; camera tracks it; auto-follow killer on death (WorldBox signature). *useGameEngine camera follow + InfoPanel button*
- [ ] **S7. Clickable chronicle** — event entries store tile coords; click jumps camera. *GameEvent.position; EventLog onClick*

## Tier 4 — Performance & Quality

- [ ] **P1. Spatial entity index** — grid buckets for findNearbyPrey/Threat instead of tile scans (needed >300 entities). *entityManagerMinimal*
- [ ] **P2. Code splitting** — dynamic import three/drei chunk; kill the 500 kB warning. *vite.config.ts manualChunks*
- [ ] **P3. Zoom LOD** — hide health bars + skip walk-frame swaps when camera is far (WorldBox minimap trick, lite version). *updateEntityVisual with camera distance*
- [ ] **P4. E2E test suite** — Playwright specs: new world, spawn, power effects, chronicle entries, save/load round trip. *New: e2e/ folder*
- [ ] **P5. npm audit triage** — 20 advisories (3 low/5 moderate/12 high) in dev-tooling chain; review, upgrade where safe. *package.json*
- [ ] **P6. Mobile layout** — collapsible sidebar, touch camera controls, safe-area insets. *CSS + Sidebar*

## Tier 5 — Deferred / Nice-to-have

- [ ] Music loop (procedural ambient via soundManager oscillator pads)
- [ ] Seasons affecting gameplay (winter kills crops, animals hibernate)
- [ ] Rivers/lakes generation (currently only ocean-height water)
- [ ] Kingdom banners/heraldry generator
- [ ] Steam-style achievements panel (localStorage)
- [ ] World generation templates (continent/islands/donut — WorldBox-style picker)
- [ ] Full PRD systems intentionally out of scope for now: cultures/tech trees, trade boats/economy chains, religion, taxation, naval combat, sieges with equipment, underground layers, multiplayer, cloud saves, Electron packaging

## Known issues (small)

- [ ] Rain sound continues if muted mid-rain then unmuted while clear (edge case in soundManager rain state)
- [ ] Reproduction event can spam sound with very high populations — consider rate-limiting `spawn()` SFX
- [ ] `spriteHandler.ts` still exports the legacy sprite-sheet path (ENTITY_SPRITES) — unused by the active mesh path; candidate for cleanup when sheets return
- [ ] Browserslist data 16 months old (`npx update-browserslist-db@latest` — cosmetic warning)
