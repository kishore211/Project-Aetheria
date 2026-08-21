# 02 — WorldBox Research (from the internet)

Sources fetched 2026-08-21: superworldbox.com (official site + full changelog), Wikipedia "WorldBox". The fandom wiki blocks scraping (403), so details below come from the official changelog — which is actually the richest source because it documents every mechanic as it shipped.

## What WorldBox is

- 2D **top-down pixel-art** god sandbox by Maxim Karpenko (Unity). Started as a 2012 Flash game; iOS 2018, Android 2019, PC 2019, Steam 2021. Current version ~0.51.
- No goals or win state. The fun loop is: **create world → fill with life → watch emergent stories → intervene → repeat**.
- PC Gamer: "Watching the borders of a kingdom stretch, retract, and suddenly disappear tickles a part of my brain." That's the core product: **borders and history you can watch**.

## The map (critical for our redesign)

- The world is a **flat 2D tile grid** — no 3D terrain at all. Elevation is communicated by *tile color/type* (shallow water, sand, grass, hills, mountains), not geometry.
- Mountains are just **impassable tiles** with a special sprite, not raised meshes.
- Tiles have skin **variations** (3+ per type) so large areas don't look uniform.
- Special biomes have **animated tile effects** (enchanted, swamp, inferno, biomass).
- Map is divided into **chunks (64×64)** for rendering/simulation efficiency.
- A **minimap mode** replaces the detailed view when zoomed far out — this is their key performance trick ("added minimap when zooming out to improve performance and battery life").
- World generation uses **templates**: continent, islands, donut, pancake (square), muffin (round), boring plains, empty… Player picks a template + size (small → "Titanic").
- Biomes **grow/overgrow** each other over time (world law toggle); seeds powers paint biomes that then spread on their own.
- Erosion world law: tiles near water erode to sand.

## Creatures & AI

- Races: humans, orcs, elves, dwarves — each with base stats, preferred buildings, unique building sprites, skins/heads, clothes dyed in **kingdom colors**.
- Animals: sheep, wolves, bears, rabbits, chickens, cats, foxes, crocodiles, buffalo, rhinos, monkeys, snakes, penguins, turtles, crabs, piranhas… each with diets (grass/crops/insects/meat) and pack/herd behavior.
- Monsters: dragons, demons, bandits, zombies (every creature has a zombie variant), skeletons, ghosts, mushroom-people, tumor monsters, crabzilla (player-controllable kaiju), UFO/aliens.
- Units have: age/lifespan, hunger, health, **traits** (~43+: genius, evil, fast, giant, tiny, fireproof, regeneration…), inherited by children, **experience/levels**, favorite foods, mood, **inventory/equipment** (weapons with rarity: junk→legendary, kill counters, generated names).
- Life cycle: babies → adults; reproduction requires food; death from age/hunger/combat/disasters. Dead units in the corrupted biome become ghosts.

## Civilization layer (their deepest system)

- Units of a race found a **village** (bonfire = heart) → build tents → houses → halls/wells/temples/statues/barracks/watchtowers/windmills/mines/docks, upgrading over time.
- **City zones** grow outward from buildings (zone range from race base + leader stats + buildings); zones = borders you can see.
- Villages join into **kingdoms** with generated names, banners, colors (customizable). Kings and village leaders have attributes (diplomacy/warfare/stewardship/intelligence) and **personalities** that drive war/peace decisions.
- **Diplomacy**: war, peace, alliances, opinions, rebellions/revolts when loyalty is low, succession crises when kings die.
- **Cultures** spread from bonfires; unlock ~50 knowledges (techs) that gate buildings/units.
- **Economy**: resources (wood/stone/food types/metals: copper→adamantine, gems, herbs…), production chains (windmill+farms→wheat→bread), storage, taxes, trading boats between docks.
- Armies: warriors with bannermen ("generals"), squads move together, sieges capture cities with timers, watch towers defend.

## God powers (grouped as tabs in a bottom power bar)

- **World Creation**: terrain brushes (multiple sizes/shapes), biome seeds, rivers/lakes, mountains.
- **Creatures**: spawn any unit.
- **Nature**: rain/snow clouds, fertilizer, trees, minerals, beehives.
- **Destruction**: fire, lightning, meteors, tornado, earthquake, volcano, TNT, nukes, acid, grey goo, lava.
- **Other**: inspect, favorite units, magnet (pick up + drop units), divine light, blessing/curse, plague, zombie infection, hourglass (time), spectate mode.
- **World Laws** window: global toggles (old age on/off, hunger, rebellions, erosion, disasters, biome overgrowth, peace…).

## UI/UX patterns worth copying

- Bottom **power bar with tabs** (we use a left sidebar — fine for desktop web).
- **Tooltips** on hover for every power (PC).
- **Inspect windows** for unit/village/kingdom with tabs and shortcut buttons (locate, kingdom, king).
- **History/event log** with clickable entries that jump the camera to the event.
- **Minimap layers/overlays**: kingdom zones, culture zones, relationships.
- **Spectate mode**: follow one unit's life; auto-follows its killer when it dies.
- Sounds: soft per-action effects; they even removed an annoying rain sound once — restraint matters.
- **Juice**: screen shake on explosions (only when zoomed in and visible), X effect when a power can't be used, drop effects on placement, number animations in windows, health bar animations.

## Performance lessons from their changelog

1. **Minimap replaces world rendering when zoomed out** — the single biggest trick.
2. Chunked map (64×64) with chunk recalculation avoidance ("tornado won't remove liquid, to avoid recalculating chunks").
3. Long-range **pathfinding precomputes island/region connectivity** (their "region" system; a fix note says wrong region connections caused weird AI) — 66× pathfinding speedup in one update.
4. "Poppoints": idle villagers stay *inside* houses (not rendered/simulated) until needed — big city optimization.
5. Batched/instanced tile rendering (implied by tile-skin system + Unity sprite batching).
6. Explosion optimizations 10×; lava/grass logic "fill the whole world with lava without affecting performance".

## Verdict for Aetheria

We should NOT chase WorldBox 1:1 (a decade of work). The subset that makes it feel like "the same kind of game":
1. **Flat, light, readable map** (their #1 aesthetic) — see 03-MAP-REDESIGN.md.
2. Villages → borders → kingdoms → wars (visible borders = the magic).
3. Traits + named units + history log with camera jumps (emergent stories).
4. Brush sizes for powers.
5. World laws panel (cheap to build, huge sandbox value).
