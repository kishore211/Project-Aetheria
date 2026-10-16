# 11 — The REA Rewrite Plan

Branch: `rea-rewrite`. Started 2026-10-15.

## Goal

Rebuild Aetheria's **simulation** from scratch with WorldBox feature parity.
Use the real mechanics recovered with REA from the WorldBox assemblies, not
the wiki approximations that phases 1–23 were built on. Keep Aetheria's
procedural renderer and UI, and connect them to the new core.

## Clean-room rule (non-negotiable)

Aetheria is MIT-licensed and public. WorldBox's code is not ours.

1. Research agents read the decompiled reference
   (`../Worldbox-REA/decompiled/`). They write **behaviour specs in plain
   language** into `docs/rea-specs/`: rules, conditions, formulas, numbers and
   content tables (ids + parameters).
2. Implementation is written **from the specs**, in Aetheria's own style.
3. Never paste or transliterate WorldBox code. Never copy its text,
   descriptions or name lists. Ids and mechanics are fine; expression is not.

## Why rewrite instead of extend

The architecture map (agent report, 2026-10-15) found:

- **No simulation core.** `useGameEngine.ts` is scheduler, calendar, weather,
  30 powers and the save applier at once. Time is `frameDelta × speed` across
  about 25 ad-hoc accumulators.
- **Render state on sim objects.** `Entity.mesh`, `Tile.color` and
  `Tile.instanceId` sit on sim objects, and `Kingdom.color` is a
  `THREE.Color`. `settlementSystem.ts` (5k lines) is constructed with a
  `THREE.Scene` and a `TerrainRenderer`.
- **Unseeded runtime.** Global `Math.random` everywhere, `uuid` ids and
  `Date.now()` timestamps. Runs are irreproducible and tests are pinned to the
  global stream.
- **No data model for content.** Creatures, traits and buildings are switch
  statements and ad-hoc tables, so reaching 400+ actor assets, 350 powers and
  190 buildings is not tractable in that shape.

WorldBox's own structure is the opposite of all four, and it is the shape the
content needs.

## Target architecture

```
src/sim/                 ← NO three.js, NO React, NO Math.random (lint-enforced)
  core/    clock (fixed step, ticks-per-frame by speed), rng (seeded streams),
           ids, events (typed sim events), world grid, scheduler
  stats/   stat ids + aggregation (asset + traits + items + statuses + metas)
  assets/  Library<T> + one library per content type (data, not code paths)
  ai/      decision system (priority layers, weights, cooldowns, softmax)
           task runner (task = ordered actions → result codes), actions,
           jobs for city/kingdom AI
  objects/ Actor, Building, City, Kingdom, Clan, Alliance, War, Army, Plot,
           Culture, Religion, Language, Subspecies, Family, Book, Item
  managers/ one per object type, update(dt) in a fixed order
  world/   tiles/biomes, growth, temperature/fire, weather, world behaviours,
           eras, laws, disasters, erosion, map generation
  player/  powers, drops, projectiles, spells, brushes
  save/    full-state serialisation (seeded, so deterministic)
src/view/                ← adapter: sim → existing renderers/store/bridges
```

**Update order:** follow the reference loop. Map layers → cities → actors →
buildings → drops → cultures → effects → world behaviours → armies → kingdoms
→ diplomacy → subspecies → plots → clans → alliances → wars → projectiles →
statuses → eras. History runs once a year.

**Time:** the new core uses the reference's own time model: world-time
seconds, months, years, and N ticks per frame by speed. Spec numbers then
apply without rescaling. This replaces Aetheria's 45-minute year.

**Determinism:** every random draw comes from a named seeded stream. A world
is reproducible from its seed plus the player's actions. Tests seed
explicitly.

## Contract the view adapter must satisfy (from the architecture map)

`worldAccess`; the store summaries (`KingdomSummary`, `VillageSummary`,
`PlotSummary`, `IdentityRow`, `OpinionRow`, events, population, hover); a
tile change feed (`syncTile`/`syncOwnership`); an entity render feed (what
`creatureLayer` + `unitIconLayer` read); the settlement queries
(`labelTargets`, `armySummaries`, `plottingIds`, `craftTiers`, names/colours);
the bridges (`emitFloater/Damage/Shot`, `requestShake/Flash`); and
`PowerContext`.

## Phases

Each phase ships green (`tsc`, `vitest`, `lint`) with headless tests, and
gets one commit per coherent change.

| # | Phase | Specs it needs | Done when |
|---|---|---|---|
| 0 | **Specs** — research agents (Sonnet), four at a time, written incrementally to disk | — | 8 spec files in `docs/rea-specs/` |
| 1 | **Core**: clock, rng, ids, events, world grid, Library<T>, stats, tile/biome assets, map gen (reuse Aetheria's generator, which is original code) | world-simulation, actor-core (stats) | headless world ticks deterministically |
| 2 | **Actors**: all actor assets, needs, aging, reproduction, combat, death, traits, statuses, movement (reuse `pathfinding.ts`), the decision → task → action AI, animal behaviour, herds | actor-core, actor-ai | animals live, breed, hunt, die in a headless 10-min run |
| 3 | **Cities**: founding, zones, buildings + construction, resources, storage, citizen jobs, city AI, economy, boats | cities-buildings-economy | civs found and grow towns headless |
| 4 | **Kingdoms**: kings, succession, opinions, diplomacy, wars, alliances, armies, plots, loyalty, rebellion | kingdoms-diplomacy-war | wars and rebellions occur headless |
| 5 | **Identity**: culture, religion, language, clans, families, books, names, conversation | identity-meta | metas spread and split |
| 6 | **Biology**: subspecies, genes, phenotypes, evolution | subspecies-genetics | a subspecies splits off |
| 7 | **World**: growth, temperature/fire, weather, world behaviours, eras, laws, disasters, erosion | world-simulation | world changes on its own |
| 8 | **Player**: every power, drops, projectiles, spells, items/crafting, achievements | powers-items-effects | every power has a test |
| 9 | **Cutover**: `src/view` adapter, rewire `useGameEngine` / UI / save, delete old sim modules and their tests, perf pass, live browser verification | — | game plays on the new core; old sim deleted |
| 10 | **History**: statistics, chronicle on sim events, world log, graphs | world-simulation | — |

Phases 2–8 depend on 1 and are otherwise mostly independent. Once the core
API is stable they can be built by parallel agents, each in its own files. The
main session owns architecture, interfaces, review and the cutover.

## Risks

- **Scale.** The reference has ~2,700 types. Parity is reached library by
  library; content tables are data entry once the machinery exists.
- **Balance.** The reference's numbers assume its map sizes and densities, so
  expect a tuning pass after cutover (headless soak runs, as in round 23).
- **The cutover is the risky step.** The old sim stays untouched and running
  on `main` until phase 9 passes live verification.
