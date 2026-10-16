# World Simulation Behaviour Spec

## Overview

Scope: the "world layer" of the simulation, independent of individual units, cities and kingdoms. It covers the global clock and tick scheduler, the tile grid and the layered tile model, procedural map generation, biomes and vegetation, fire / heat / lava / frost, terraforming and erosion, the list of periodic world behaviours, ambient tile effects, clouds and drop-based weather, the cycle of "world ages" (eras), the world-law toggles, random disasters, connectivity analysis (regions and islands) and the world event log.

Design summary:
- The map is a rectangular grid of square tiles. Each tile holds an integer height (0-255), a main ground type, an optional top type (biome cover, road, field, wall, snow...), and small transient state (fire flag, burned stage, heat, frozen flag, health).
- Time is advanced by a fixed per-step increment scaled by the selected game speed; every periodic process is a countdown timer measured in world seconds, so speeding the game up just runs more world seconds per real second.
- Almost every world process is a small randomised, incremental sweep: each scheduled firing touches a bounded number of random tiles/objects. Nothing is simulated globally per tick. Rates are therefore expressed as "tiles considered per firing" and "chance per consideration".
- Global modifiers: the current world age (selects weather clouds, biome growth bonus, freezing/thawing, fire spread, special periodic effects) and a set of boolean world laws (switch whole mechanics on or off).
- All random draws are plain uniform; "chance p" means success when a uniform [0,1) draw is below p.
- Conventions in this document: "tile neighbours" means the 4 orthogonal neighbours; "all neighbours" means the 8 surrounding tiles. "s" = world seconds. Asset ids are quoted in backticks only in tables.

## Data model

### Grid and spatial partitions
- Map side length in tiles = size_units x 64. Named sizes (size_units): tiny 2, small 3, standard 4 (default), large 5, huge 6, gigantic 7, titanic 8, iceberg 9. Maps are square when generated from a named size. Tile origin is a corner of the map; 
- Chunk: 16 x 16 tiles (256 tiles). Chunks per side = size_units x 4. Chunks are the unit for dirty-tracking connectivity and for local queries.
- Zone ("city zone"): 8 x 8 tiles (64 tiles). Zones are the unit used for vegetation density limits, city borders, and for counting buildings by type. Zones per side = side tiles / 8.
- Region: a connected set of tiles inside ONE chunk that share the same layer type (see below). A chunk has at least one region; a chunk of uniform layer is one region.
- Island: a maximal set of regions of the same layer type connected through adjacent-region links across chunk borders (and inside chunks). Islands are the world's connected-component structure and are also used by pathfinding (see Interactions).

### Tile record
| field | meaning |
|---|---|
| height | int 0..255, clamped on write. Drives main type during generation; afterwards the type is stored explicitly and terraforming moves along type ladders instead of re-reading height. |
| main type | one of the ground types (Tile table). |
| top type | optional overlay type (Top tile table). When present it is the tile's effective type. |
| effective type | top type if set, else main type. If the tile is "frozen" and its effective type can be frozen, the effective type becomes the snow/ice top-type named by the MAIN type's `freeze_to` (e.g. sand->snow_sand, shallow_waters->ice). A frozen tile whose effective type cannot be frozen is simply un-frozen. |
| frozen | bool flag (temporary frost). Some top types are permanently frozen (forever_frozen) and never thaw. |
| health | int, default 10. Reset to 10 whenever the main type changes or the tile freezes/thaws. Used as the frost-thaw "hit points" and as fire damage budget (burnable tiles lose `burn_rate` per ignition; at <=0 the tile is decreased one step). |
| fire | bool; plus fire start timestamp (world time). Fire tiles are tracked in a global set and counted per zone. |
| burned_stages | int 0..15; scorch overlay that fades one stage per burned-tiles sweep once the fire is out. Tiles with burned_stages>0 do not grow/spread biomes (except where a biome ignores burned stages). |
| heat | int 0..404; transient. Heated tiles are tracked in a set and decay by 1 every 1 s. |
| timestamp_type_changed | world time of last main-type change; used by lava state timers. |
| pollinated, explosion state, flash state | cosmetic / bomb bookkeeping, not needed for the world rules. |

### Layer types (TileLayerType)
Ground, Ocean, Lava, Block, Goo (plus Null). Layer type of the EFFECTIVE type is what regions/islands and pathfinding use. Mountains and summit are layer Block (impassable barrier, forms its own islands), oceans and ice-over-water are Ocean, lava tiles are Lava, grey goo is Goo, everything else Ground. Changing a tile's layer type marks its chunk (and neighbouring chunks) dirty for region/island recomputation.

### Type ladders
Every main type has `decrease_to` and `increase_to` (and `freeze_to`). "Decrease" erodes a tile one step down the height ladder, "increase" builds it up. Tiles with a top type: decreasing/increasing first REMOVES the top type (leaving the main type) and only later steps change the main type. A frozen tile: decreasing first thaws it. When world law "Gaia's covenant" is on, damage-driven decrease/increase is refused except for tiles flagged `life` or explodable.

Main-type ladder (low -> high): pit_deep_ocean / deep_ocean <-> close_ocean <-> shallow_waters <-> sand <-> soil_low <-> soil_high <-> hills <-> mountains <-> summit. (Exact per-type links in the Tile table.) Ocean types decrease to "pit" types (dry basin tiles flagged can_be_filled_with_ocean), which are refilled by water.

Rank: soil_low = Low, soil_high = High; biome tiles come in a low and a high flavour and the low/high flavour used on a tile is chosen from its main type's rank. Other main types have no rank (biomes cannot be applied except via the biome's explicit tile for special cases).

### Global state
- world_time (double, world seconds), current world-age id, age slot index (0-7), age start times, age duration, age progress (0..1), per-age pause flag, age-speed multiplier (default 1), 8 age slots.
- World laws: map id -> bool; ages also have an "enabled" flag per age id (default true).
- Heat set, fire set, burned-tiles set, per-zone fire counters, per-tile-type tile sets (hash sets updated whenever a tile's type changes: used to find e.g. all summit tiles or all tiles of a biome top-type cheaply).
- Random-order tile array copy for sweep behaviours (see Update loop).
- Island list, ground-island list, region graph.
- World log: ring of messages, limit 2000 stored for display (persisted to a DB in the original).
- Sim constants record (selected): biomes_growth_speed 5; fire_spread_time 2 s; fire_stop_time 5 s; fire_time 30 s; months_till_pool_turns_into_flora 30; interval_nutrition_decay 15 s. Others in that record concern unit/city rules and belong to other specs.

## Update loop

### Frame vs simulation tick
Per rendered frame (variable rate) the host does housekeeping (camera, input, UI, rendering) and then runs the **simulation step** N times in a row, where N = the current time-scale's `ticks` (forced to 1 while a modal window is open). Each step receives the same `elapsed` value:

    elapsed = fixedDeltaTime * time_scale.multiplier        (x2 if a 30fps lock is on)

`fixedDeltaTime` is the host engine's fixed step (not set in the decompiled code; assumed the Unity default 0.02 s; unclear). All timers in the simulation are in "world seconds" advanced by `elapsed`, never by wall-clock delta. So at speed x1, one frame advances world time by ~0.02 s regardless of FPS.

When the render-skip flag of the time scale is set, visible-object calculation and rendering only run once every 3rd frame (simulation still runs every frame).

### Time scales (WorldTimeScaleLibrary)
| id | multiplier | ticks/frame | conway_ticks | notes |
|---|---|---|---|---|
| slow_mo | 0.5 | 1 | 1 | |
| x1 | 1 | 1 | 1 | |
| x2 | 2 | 1 | 2 | |
| x3 | 3 | 1 | 3 | |
| x4 | 4 | 1 | 4 | |
| x5 | 5 | 1 | 5 | |
| x10 | 10 | 1 | 10 | |
| x15 | 15 | 1 | 15 | |
| x20 | 20 | 1 | 20 | |
| x40 | 20 | 2 | 40 | "sonic" flag; effective speed = 20 x 2 ticks. Hidden from next-speed cycling unless debug is on. |

`render_skip` is not set on any listed scale. `conway_ticks` is consumed by a cellular-automaton layer (outside this area). Selecting any non-sonic speed turns the sonic debug option off.

### Simulation step order (updateSimulation)
1. Flush dirty meta-containers/cleanup; explosion checker update; city-zone helper update.
2. If NOT paused (paused = global pause flag OR a scroll window open OR rewarded ad showing): decrement the nutrition-decay timer (if >0); advance world time (see below); taxi manager; yearly meta-history snapshot.
3. Animation time; clear enemy-finder cache; controllable-unit update.
4. Map layers: heat grid update, chunk manager update, each map layer, each map module.
5. Cities update; units (actors) update; buildings update; drop manager; cultures; stack effects; resource-throw manager.
6. **World behaviours** (see Mechanics: loop below).
7. Armies, kingdoms, diplomacy, subspecies, plots, clans, alliances, wars, projectiles, statuses.
8. Era manager update (world ages).
Note: steps 3-8 run even while paused (individual systems check pause themselves; world behaviours with `stop_when_world_on_pause` are skipped while paused).

### World time
- world_time is a double in seconds, += elapsed each non-paused step.
- 1 month = 5 world seconds; 1 year = 12 months = 60 world seconds. Day-of-month = floor(fraction of month * 30) + 1.
- Year (1-based) = floor(t/60)+1. Month (1-12) = floor((t - 60*(year0))/5)+1.
- On each year change (current year != remembered year) all units, cities and kingdoms get an age update (ageing happens once per year, not per tick).
- Month 4 is flagged as "monolith month" (used by other systems).
- At month 12 of a new year (once per year), if graphs/DB enabled, history snapshot of all managers is taken and last-year stats cleared.
- "World time elapsed since X" = world_time - X; there is also a separate real session clock (game_stats.gameTime) used for real-time elapsed.

### WorldBehaviour scheduler
Each behaviour asset owns a countdown timer initialised to its `interval`. Every sim step (in library order, enabled ones only):
1. Skip entirely if (rendering minimap and asset not enabled_on_minimap) or (world paused and asset.stop_when_world_on_pause).
2. If timer > 0, subtract elapsed; if still > 0 return.
3. Otherwise schedule next: timer += interval + uniform(0, interval_random); run action.
Each step fires a behaviour at most once. The timer keeps its overshoot (the new interval is added to a non-positive remainder instead of resetting), so short intervals catch up one firing per step; but when `elapsed` per step exceeds the interval (fast speeds), the behaviour simply fires every step and its effective work per world second falls below the nominal rate. `clear()` resets timer to interval and calls action_clear (used when the world is reloaded).

Tile-runner behaviours (lava, freeze, unfreeze, burned tiles, erosion, biomes etc.) share a pattern: a copy of the full tile array is made; each firing processes the next K tiles (K = map_chunks_across * constant) using an incremental random shuffle (Fisher-Yates step per tile) and when the cursor reaches the end the cursor wraps to 0 (array reused, continues reshuffling). Tiles are therefore each visited once per sweep in random order.

## Mechanics

### M1. Tile type changes (terraforming core)
All changes to the grid go through one routine: "terraform tile (new main type or none, new top type or none, options)". Order of effects:
1. Options preprocessing: if option remove_fire -> extinguish fire on the tile. If remove_water and the tile is ocean -> new main type = its decrease_to. If remove_top_tile and a top type exists -> new main type = effective type's decrease_to (note: this uses the effective type's ladder). If remove_roads and tile is road -> new main = decrease_to. If remove_frozen and tile is frozen -> thaw fully (damage 99).
2. If a new main type is supplied, set main and top together (main change resets health=10 and stamps timestamp_type_changed); otherwise only set the top type.
3. If the "can be farmed" property changed and the zone has no city, mark the city-site finder dirty.
4. If burned_stages>0 and the new effective type cannot be set on fire, or option remove_burned is set -> remove scorch.
5. Option remove_borders -> city-border recheck for that tile. Option flash -> brief visual flash.
6. Buildings on the tile: if option make_ruins, building becomes ruins (or is destroyed if it has no ruin form); if option destroy_buildings, building is destroyed subject to ignore_kingdoms / destroy_only (restricted to building group) / ignore_buildings filters. Independently, after any change, a building that is no longer compatible with the new tile's biome tags is ruined/destroyed, buildings that cannot sit on blocks (mountains) or on liquid are destroyed when the tile becomes such.
7. State check: if layer type changed -> chunk and neighbouring chunks dirty (region recompute; neighbours skip region recompute but recompute links); if the new layer is not Ground -> city-border recheck; ocean tiles destroy buildings that cannot float.

Helpers:
- decrease(tile): subject to Gaia check. Frozen -> thaw one step (damage 1). Else if top type -> remove top type. Else if main.decrease_to exists -> set main to it. (Tile at the bottom of ladder is unchanged.)
- increase(tile): subject to Gaia check. If top type -> remove top. Else main.increase_to.
- "damage=true" flag only matters for the Gaia law: with the law on, damage-driven changes are ignored unless the tile type is flagged `life` (creep/goo/evil walls) or explodable.
- grow greens(tile, top) = terraform top with flash. remove greens = decrease (non-damage).
- set ocean(tile): if tile type has `fill_to_ocean`, change main type to that ocean type using the water_fill terraform option (flash, destroy buildings except geysers/volcano types, remove frozen, remove fire).
- road creation = terraform top to road with option "road" (destroys nature buildings, thaws).
- acid terraform: thaw; if top type is wasteland nothing; else if any top type -> decrease; else if tile is ground -> apply wasteland low/high top by rank (low rank or high rank only).

### M2. Heat
Heat is an integer per tile (cap 404), added by explosions/lightning/lava/fire effects (terraform option add_heat) via addHeat(tile, amount). Every 1 s of (unpaused) world time every heated tile loses 1 heat; at 0 it is removed from the set.
Thresholds are evaluated each time heat is ADDED (not on decay), cumulatively:
- heat > 5: building on tile is poked (hit for 0 damage, i.e. triggers reaction); ocean-layer tile has its liquid removed (decrease) with smoke; frozen tile thaws one step; grey goo ignites; tile receives scorch (burned stage).
- heat > 10: burnable tile ignites; building that is not a ruin takes 10% of its max health (divine-type damage) and the tile ignites; units on the tile (except very high flyers and fire-immune) get the burning status and 50 damage.
- heat > 20: explodable tile detonates (if not already exploding); buildings ignite; a tile with a top type is decreased (top removed).
- (skip the rest entirely when Gaia's covenant is on)
- heat > 30: lava tile is re-lavaed (becomes top lava level); soil_low/soil_high become sand; road becomes sand (direct main-type set).
- heat > 100 and tile is sand: becomes lava (level 3).
- heat > 160: mountains or hills become lava (level 3).
"Add lava": unless the tile is already max-level lava, ignite it and set main type to lava3 using the lava_damage terraform option (flash, damage buildings 100, thaw).

### M3. Fire
Ignition `startFire(tile, force)`:
- If tile type is explodable -> detonate bomb on tile.
- Without force: fails if the type is not `burnable` or already burning. Liquids never burn. If forced it still fails on liquids.
- Ignition thaws the tile (damage 99). If a building on the tile is burnable, it is set burning (status). If tile type is burnable, a building burned, or forced: record fire start time; if type burnable: health -= burn_rate, set scorch, and if health <= 0 -> decrease tile (damage=true); then set the fire flag (added to the fire set, zone counter incremented). Returns whether a fire started. Fireworks tile also spawns a firework when ignited.
Scorch: a tile that can be set on fire receives burned_stages = 15 - uniform int in [0,9] (6..15).

Fire update (behaviour "fire", every 1 s): for each burning tile:
- elapsed = now - fire start.
- Spread allowed unless the current age has rain particles (age_tears) or Gaia's covenant is on. If elapsed >= 2 s (fire_spread_time) and spread allowed: for each of the 4 neighbours, with probability = neighbour type's fire_chance x age fire_spread_rate_bonus (1, or 2 in the sun age) try to ignite it (non-forced).
- 10% chance to emit a fire particle (cosmetic).
- Stop rules, first match: ocean type -> stop; elapsed >= 30 s (fire_time) -> stop; otherwise if elapsed > 5 s (fire_stop_time) the tile stops with probability 0.1 + (elapsed / 30) x 0.3 per update (this grows to 0.4 at 30 s).
- When a fire stops: fire flag cleared, scorch re-rolled (new burned_stages 6..15), and optionally (law "other disasters" on, age sun flag fire-elemental on, chance 1% per extinguished tile, fewer than 100 fire elementals exist) a fire-elemental creature spawns on the tile.
Rain (drop "rain") and the whole-world rain age extinguish fires; see M10.

Burned-tile sweep (behaviour "burned_tiles", 3 + [0,5) s): each tile with scorch that is not currently burning loses one burned stage; at 0 it leaves the set. (So scorch lasts ~6-15 sweeps ~ 40-100 s.)

### M4. Lava
Lava ladder: lava0 (lowest) -> lava1 -> lava2 -> lava3 (highest). All lava types are liquid, layer Lava, walk speed x0.2, are flagged to damage units (150) and set walking units on fire with 90% chance per step taken on them. Buildings flagged affected_by_lava take 40% of their max health each time the lava sweep visits their tile.
Lava update (behaviour "lava", 0.05 + [0,0.05) s): only runs when at least one lava tile exists. Per firing processes up to chunks_per_side x 15 tiles of the random tile sweep. For each lava tile:
1. Damage building on it (if affected_by_lava).
2. If law forever_lava is on: nothing else.
3. If now - timestamp_type_changed < lava_change_state_after (lava0 30 s, lava1 10 s, lava2 10 s, lava3 3 s) -> nothing.
4. If tile is lava0: if none of its 4 neighbours is lava of level >= 1 -> it cools to `hills` (lava_damage terraform). Otherwise nothing.
5. Else (level >=1), with 50% probability: "move lava":
   a. 10% chance particle.
   b. Scan the 4 neighbours in random order: any non-lava neighbour is ignited (if it is thawed-able frozen: add 15 heat and thaw fully; else startFire non-forced). Candidate target = neighbour that is not `hold_lava` (hills, mountains, summit and infernal biome tiles hold lava, i.e. lava will not flow into them) and, if lava, has a different level and a lava_increase (not level 3). Among candidates prefer: lower render depth (render_z) first; among lava candidates the lowest level.
   c. If a target exists: the source drops one level (lava_decrease) and the target becomes lava0 if it was not lava, else rises one level (lava_increase). Source level is always >= 1 here (level 0 is handled in step 4).
   d. Flash effect on the target.
   e. After the move attempt (whether or not a move happened), if the source tile's flash state is idle, 99.5% chance to force-ignite the source tile.
Net effect: lava slowly flows downhill into non-holding terrain, spreads, and cools to hills when isolated.
Putting lava out (rain drop, cooling): the tile is "increased" in the type ladder; all four lava types have increase_to = hills, so any extinguish turns lava straight into hills. Lightning on lava with heat > 20 decreases it (to sand) and throws a lava droplet with 90% chance. Ocean tiles hit by lightning lose liquid and 80% chance to spawn a rain drop.

### M5. Freezing and thawing
Freeze(tile, damage): fails if already frozen or the effective type cannot be frozen or a usable building on it prevents freezing. Sets frozen=true, health=10. If the type is `fast_freeze` (only shallow_waters and pit_shallow_waters carry the flag) each of its 4 neighbours that is also fast-freeze and freezable freezes too with 35% chance (recursively). Marks tile dirty; if the type has chunk_dirty_when_temperature, layer connectivity is recomputed.
Thaw(tile, damage): requires frozen and type can_be_unfrozen and not forever_frozen. health -= damage; if health still > 0 stop; else frozen=false, health=10. Fast-freeze tiles then thaw each neighbour with 20% chance.
Frost application sources: snow drops (M10), age_ice/age_despair global freeze, mountain summit freezing, world gen freeze of mountain tops (height > 220).
Behaviours:
- "tiles_freeze" (every 0.1 s): (a) freezeSummits: unless the age has overlay_sun, a private timer (re-armed to uniform 10-60) counts down -- NOTE it is decremented by the step's `elapsed` once per FIRING of this behaviour (not per world second), so it lasts roughly 50-300 world seconds at x1 and proportionally less at higher speeds; when it fires, EVERY summit tile gets a 20% chance (condition: not (rand<0.8)) to freeze with damage 5. (b) if the current age has global_freeze_world (age_ice, age_despair): process chunks_per_side x 10 tiles from the random sweep; each freezable tile freezes.
- "tiles_unfreeze" (every 0.01 s, i.e. every step): only when the age has global_unfreeze_world AND law forever_cold is off: process chunks_per_side x 10 sweep tiles; each temporarily frozen tile thaws with damage 5 + era temperature_damage_bonus (see Era table). Frozen tiles whose effective type is a mountain/summit type only thaw if: the era has global_unfreeze_world_mountains; otherwise never if it is a summit tile and the era lacks overlay_sun; otherwise only with 10% chance and only if at least one of its 8 neighbours is not frozen.
(An unused alternative "freeze waves" routine exists in the source but is not scheduled.)

### M6. Units and temperature
Behaviour "unit_temperatures" (0.1 + [0,0.1) s): each unit with a nonzero temperature counter moves it 1 toward 0; at 0 the entry is dropped; dead units are purged. Temperature counters are only changed by player-driven heat/cold powers (+5 / -5 per application to units on the target tiles; those powers are outside this spec): positive adds, negative subtracts; crossing > 300 gives the "burning" status and resets to 0, crossing < -200 gives "frozen" status and resets; any cold tick removes burning, any hot tick removes frozen.

### M7. Erosion and ocean
- Erosion (behaviour "erosion", 3 + [0,1) s), only if law erosion is on: shuffle all islands; for each Ground island try 5 random tiles; a tile qualifies if its type can erode to sand (default true), it is biome-capable or grass, it touches an ocean-layer tile among its 4 neighbours, and not already picked. Collect up to 5 tiles across all islands (stop at 5) and set them to `sand` main type with the "flash" terraform option (top type is removed by the type change). Net: coasts slowly turn to sand.
- Ocean fill (behaviour "ocean", 0.2 s): maintains a set of every tile whose type has can_be_filled_with_ocean (the "pit" types), registered whenever a tile's type changes. Each firing: tiles on the world edge, or tiles with an ocean neighbour, are each included with 70% chance; each included tile is converted via set-ocean if its type can_be_filled_with_ocean (pit tiles); if instead the type is explodable_by_ocean (water bomb tile), it detonates. This is how dug basins fill with water and how dry pits at the map edge flood.

### M8. Biomes and biome spread
A biome is a themed top-tile pair (a "low" tile for Low-rank soil/sand ground and a "high" tile for High-rank soil) plus lists of vegetation, minerals and creatures that may spawn on tiles of that biome (Biome table). Only soil_low and soil_high main types accept biome top tiles (`can_be_biome`); sand and hills are "special" biomes (sand supplies desert trees, hills supply minerals) that cannot be painted over.
Which top tile a biome places on tile T: main type soil_low -> biome low tile; soil_high -> biome high tile; other main types -> none.

Natural spread (behaviour "biomes", 0.05 + [0,0.05) s):
- Runs only if law grow_grass is on AND the current age is not a winter age (flag_winter: age_ice, age_despair).
- Per firing process K tiles from the random sweep, K = chunks_per_side x (5 + age.bonus_biomes_growth). If K <= 0 nothing happens (ice -20 stops all growth; dark -2 etc. slow it).
- A processed tile is a "spreader" if its effective type is a biome tile and its scorch is 0. The spreader tries to spread around itself (see below, with road-crossing and bonus tracking enabled).
- After the sweep, tiles recorded as "bonus tiles" (newly converted tiles whose biome is in the current age's `biomes` set) each immediately attempt one more spread around themselves, then the list is cleared. This gives the favoured biomes of the current age extra growth.
Spread attempt `trySpread(around tile A, spreader type S)`:
- Requires S's biome to have spread_biome = true; and if the biome names a `spread_only_in_era` age, that must be the current age (not used by any built-in biome). Creep biomes and sand/hills do not spread.
- For each of A's 4 neighbours N: skip if N is scorched, unless the spreader biome ignores scorch (infernal does). If N is a road tile and road-crossing is allowed (natural sweep only), the spread is also attempted recursively around that road tile (so biomes hop across roads). N must be biome-capable (soil_low/soil_high). Skip if N already has the same biome.
- Decide whether N converts: if N's effective type is plain soil (no biome top) or the spread is forced -> yes. Else (N already has a different biome) only if law biome_overgrowth is on: if both biomes have equal grow_strength -> 5% chance; otherwise roll uniform int in [0, S.grow_strength) vs uniform int in [0, N.grow_strength) and convert when the spreader's roll is strictly greater. (grow_strength: default 6; grass, savanna, birch/maple/rocklands/garlic/flower/celestial/clover/singularity use 5 -- see table.)
- Conversion = place the spreader biome's low/high top tile (by N's rank) with a flash. If checking bonuses and the current age lists N's new biome in its favoured set, N is queued as a bonus tile.
Forced spread (used by drops: water/blessing/powerup/etc. flagged on the biome, and acid/fire/curse): the same routine with pForce, which skips the "soil only" requirement, so the biome can replace other biomes unconditionally.
Biome seed (generic): "use seed on tile": thaw the tile; if biome-capable place the pair's low or high tile by rank; then give units on the tile the biome's always-on subspecies traits.
Tumors / biomass / super pumpkin / cybercore: creep biomes are produced by hub buildings, not by this spread; each hub kind keeps connected creep alive. See M13.

Biome-spreading buildings (terramorphing law): a building flagged spread_biome runs a timer (initially 1 s, re-armed to uniform 8-16 s); when it fires the building's biome tries one spread (non-forced, no era check) around either its own tile, or, if its tile already has that biome, around a random tile within 2 tiles.

### M9. Vegetation, flora growth and minerals
Flora is represented by buildings (trees, plants, fungi, bushes, minerals). The world supplies four growth channels:
1. Random seeds (behaviour "spawn_random_vegetation", 10 + [0,10) s): requires law vegetation_random_seeds and an age with grow_vegetation = true (false in age_sun: drought). Repeat 5 times: pick a random chunk, a random region of it; if the region's island is Ground, then try 5 random tiles of the region: skip burning tiles; if the tile's effective type has a biome with grow_vegetation_auto, 50% chance to "grow random vegetation" on it.
2. Life-seed clouds/drops (see M10): grow random vegetation (and spawn a creature) on landing.
3. Local spreading by existing flora (law-gated, interval-gated, see below).
4. Poop-to-flora conversion and mineral growth (below).
Grow random vegetation(tile, biome): pick uniformly among 3 options: tree / plant / bush. For the chosen kind, if the biome has a selector for it, the selector picks one asset id uniformly from the biome's weighted list (weights are listed as repeat counts); then the asset is placed if all of these hold: (a) the zone has not hit the asset's per-zone limit (see below) unless the check is disabled; (b) with probability = the asset's vegetation_random_chance (default 0.5) -- the roll is skipped when the caller disables it; (c) the building placement rules allow it on this tile (biome tag compatibility between asset's growth tags and tile type, free of buildings, etc. -- owned by the building spec). Statistics counters for trees/flora grown are incremented.
Sand biome trees: the selector returns a palm tree if the tile's zone or any adjacent zone has liquid, else a cactus.
Zone density limit for a flora asset: limit_per_zone (asset field); trees on Low-rank tiles halve it (min 1); law spread_density_high multiplies it by 1.5; building types are counted per category (trees, plants/flora, fruits/food, hives, poops, minerals). If the asset has limit_in_radius, any same-asset building within that zone radius also blocks it.
Flora spreading (batch update over all flora buildings of a category, only while unpaused): categories trees / plants / fungi, each with its own countdown that fires every N s: trees 50 (10 with law fast-trees), plants 40 (10 fast), fungi 30 (10 fast); requires the matching spread law (spread_trees, spread_plants, spread_fungi; all default on). On firing, every usable flora building of that category with spread enabled does: with probability spread_chance (asset field: e.g. 0.5 for the base tree, 0.3 for most plants, 0.45-0.5 for fungi, default 1) pick a random all-neighbour tile and then random-walk `spread_steps` more all-neighbour steps (typically 4-10); pick one id from the asset's spread_ids list and try to place it there (zone limit + placement rules with the "flora growth" flag).
Poop-to-flora: every 5 s each "poop" building older than 30 world months (months_till_pool_turns_into_flora) has a 30% chance (condition: not (rand<0.7)) to be destroyed and replaced by a random plant of its tile's biome (limit and random-chance checks skipped).
Minerals (behaviour "spawn_minerals", 2 + [0,3) s): requires law grow_minerals. For each Ground island with more than 20 tiles: pick a random region and a random tile; if that tile's zone or any adjacent zone already contains a mineral building -> skip island. Otherwise count = min(3, island_region_count/20 + 1); repeat count times: scan the region's tiles in random order, take the first tile whose biome has grow_minerals_auto, that is not burning, and passes a 50% roll; try placing a mineral picked from the biome's weighted mineral list (zone limit + placement rules).
Crops: farm field tiles and wheat are handled by city logic; the world only (a) decays fields (below) and (b) the "grow" step of wheat has a 50% chance to destroy the crop if the age has flag_crops_grow = false (dark, ice, despair).
Farm decay (behaviour "decay_farms", 1 + [0,1) s): builds a shuffled list of all `field` top tiles (rebuilt when empty or when the world is regenerated) and pops 10 per firing: a field outside any city is decreased; one inside a city but not in that city's planned field/farm-site sets also destroys the wheat building on it and is decreased.
Road decay (behaviour "decay_roads", 1 + [0,1) s): pick a random zone; skip if (the zone has a city whose culture can use roads) or with 50% chance; otherwise each road tile in the zone has a 50% chance (checked in random order) to be decreased (road removed).

### M10. Weather: clouds and drops
Cloud spawner (behaviour "clouds"): interval and interval_random BOTH set to the current age's cloud_interval (default 15 s; hope 25, tears 20, ice 20, ash 15, despair 16, others 15). When it fires: if the age has a cloud list, pick one cloud id uniformly from the age's weighted list (weights as repeated entries); spawn it unless (the cloud is a "normal cloud" and law clouds is off) or (the cloud is flagged considered_disaster and law disasters_nature is off). Max 200 cloud effects alive.
Cloud object: picks a random sprite and flip, speed = uniform(speed_min, speed_max) tiles/s (per cloud asset, default 1-6; normal cloud min 2; rain/rage/lightning/acid/snow/ash 1-4; lava/fire 1-3; magic 1-7); drifts in +x. It fades in at 0.2 alpha/s (0.05 in the fastest speed) up to asset max alpha (0.8, normal cloud 0.5; clamped lower when the camera is zoomed in); when its x passes the map width it fades out and is removed. Spawn position: x = uniform integer in [-50, 30), y = uniform integer in [0, map height).
Each cloud runs up to two periodic actions after it has lived 3 s (drop action only): every interval_action_1 s (default 0.05; normal cloud 2 s) pick a point within the cloud footprint (half-width ~ sprite_width x 0.08 and half-height ~ sprite_height x 0.04 tiles around its centre) and spawn the cloud's drop at that tile (falls for ~10 height units). Lightning cloud also every 0.05 s has 1% chance to strike a random tile in the right half of its footprint (50% medium, 50% small lightning).
Drops landed on a tile (weather drops):
| drop | landing effect |
|---|---|
| rain | on the tile and its 4 neighbours: extinguish fire; units lose burning/angry status, hydrophobic units take water damage else gain 10% max stamina; buildings stop burning, wheat grows a stage, rain-sensitive buildings take 20 damage; scorch removed; pit tiles fill with water; lava becomes hills; water-bomb tiles detonate; biomes flagged water-spread get a forced biome spread. |
| snow | freeze the landing tile if freezable. Then repeat up to 10 times: pick a random tile of the same chunk; if it is freezable: if it is within 11 tiles of the landing tile the loop STOPS (without freezing it), otherwise it freezes. If the landing tile is not lava: 50% chance that units within ~3 tiles get the frozen status; then, if law disasters_other is on and the age has the ice-baby flag (age_despair), eligible baby units nearby become ice creatures. |
| fire | burn the tile (forced ignition); start burning objects; biomes flagged fire-spread (infernal) spread forced. |
| life_seed | if law animals_spawn: try to spawn one wild creature from the biome list (skip if that species exceeds its max_random_amount, or if more than 3 units already within the 3x3 chunk area); if law vegetation_random_seeds: grow random vegetation (M9). |
| ash | each unit within 3 tiles: 30% cough status, 10% ash-fever status. |
| magic_rain | each unit within 3: 20% each of powerup, spell-boost, shield, caffeinated statuses; +10% max mana. |
| rage | each unit within 3: 20% rage status. |
| acid | acid terraform (M1), 20% smoke, acid-sensitive buildings take 20 damage, each unit within 3 has 60% (not-chance) to take 20 acid damage unless acid-proof; biomes flagged acid spread (wasteland) force-spread. |
| lava | add lava at the tile. |
Note: rain lands on every tile touched, so a rain cloud both douses fires and slowly floods pits and cools lava.
Whole-world rain (age_tears special effect, every 5 s): if no fire is burning anywhere, 90% of burning units stop burning and 90% of buildings extinguish. Also hydrophobic subspecies units that are not inside something take water damage with 50% chance each tick (tears, ice, despair), and thunder flashes (tears: 10% chance per tick, at most once per min(100 x speed multiplier, 600) world seconds).

### M11. World ages (eras)
The world cycles through a ring of 8 "age slots". Each slot stores an age id (or the placeholder "unknown", which is resolved to a uniformly random real age every time that slot becomes current). Exactly one age is current; its effects are read directly from the age record (Era table).
- New-world default slots: for slot number i = 1..8 pick uniformly from the ages whose default-slot list contains i; for ages flagged "linked" (dark, tears, wonders) re-roll once (after removing the pick) if the same age is already placed in another of its default slots. Resulting pattern: slot1 = hope; slot2 = one of {dark, tears, moon, wonders}; slot3 = hope; slot4 = unknown; slot5 = hope; slot6 = hope; slot7 = one of {dark, tears, moon, wonders}; slot8 = unknown. Then slot index 0 becomes current with progress 0. Players can reassign any slot (assigning the current slot swaps the age immediately without resetting the timer).
- Age duration (on entering a age): uniform integer years in [years_min, years_max) x 12 months x 5 s = x 60 s. Defaults 35-55 years (2100-3300 s); ice and despair 30-40 years. Reloading a save without a stored age starts hope.
- Progress: every non-paused step (world not paused and ages not individually paused) progress += elapsed / (duration / ages_speed_multiplier). At progress >= 1 the next slot (index+1 mod 8) becomes current with progress reset to 0. Remaining time = duration x (1 - progress).
- On entering an age: store id and start time; recompute all unit stats (ages alter stats); reset the special-effect timer to the age's interval; set the cloud spawner interval (see M10).
- Special effect: if the age has an action, it fires every `special_effect_interval` s (default 10; sun 7; tears 5) of unpaused time. Actions: sun = drought; tears = world rain + thunder + hydrophobic damage; ice, despair = hydrophobic damage + frost.
  - Drought: up to 5 random buildings of the neutral "nature" faction; each that is alive, not already ruins, flagged affected_by_drought and of kind tree becomes ruins.
  - Frost: same selection; building must be flagged affected_by_cold_temperature and be a tree or vegetation type; becomes ruins.
  - Hydrophobic damage: every unit of every subspecies that is flagged damaged-by-water, alive and not inside something, 50% chance to take water damage.
  - World rain and thunder: see end of M10.
- Darkness/night fade: a "night" multiplier rises by 0.1 per world second toward 0.6 (x player setting) while the age has overlay_darkness, else falls to 0 at the same rate. Purely visual except as a flag for traits that only act at night (age flags: overlay_darkness) or moon (flag_moon).
- Other consumers of age fields: bonus_loyalty is added to every city's loyalty and bonus_opinion to every kingdom's opinion of every other kingdom; range_weapons_multiplier: ranged units get range += range x multiplier (literal reading: default x1 doubles range, dark/despair x0.5; unclear whether intended); flag_light_damage: units with the light-sensitivity trait take 10% of max health + 1 damage per tick of that effect in non-cold, non-dark biomes; flag_crops_grow false: wheat stages have 50% chance to destroy the crop; era_disaster_* flags enable special consequences (rage status may turn a unit into a demon at 10%/tick in chaos; snow in despair may freeze babies; fires may spawn fire elementals in sun); temperature_damage_bonus scales how fast frost thaws (M5); bonus_biomes_growth (M8); grow_vegetation (M9); fire_spread_rate_bonus (M3); global_freeze_world / global_unfreeze_world(_mountains) (M5).

### M12. Disasters
Behaviour "disasters" fires every 80 s (no random part), also while the world is unpaused only. On each firing:
1. Build a pool: every disaster whose allow-list is empty or contains the current age id AND whose forbid-list is empty or does not contain it, repeated `rate` times. If empty -> nothing. Pick one uniformly from the pool.
2. Gate checks on the pick (any failure = nothing happens this firing, no re-roll): nature-type disasters need law disasters_nature; "other"-type need law disasters_other; world must have at least min_world_cities cities and at least min_world_population units.
3. Roll `chance` (probability); on success run the disaster's action.
Actions (details in the Disaster table):
- tornado: spawn a tornado effect at a random tile. small_meteorite: meteorite strike at a random tile (explosion option "meteorite_disaster": damage 500, strength 1). small_earthquake: quake at a random tile (see below). heatwave: 1-2 times pick a random ground island and ignite all 8 neighbours of a random tile of it (needs law disasters_nature again).
- Unit-spawn family (hellspawn, ice_ones_awoken, sudden_snowman, ash_bandits): if existing count of the species < max_existing_units: pick a random ground island with >= 4 regions, a random tile in it, spawn a random number in [units_min, units_max] adult units there (with items), log.
- dragon_from_farlands / alien_invasion: same limit check; spawn at the centre tile of a random zone on the left or right edge (50/50) of the map (zone row random); count in [units_min, units_max].
- biomass / tumor: limit check; choose the first city (in random order) that has a usable building, pick a random tile of a random building of it, create the creep hub building there and spawn creatures [20-30] (monsters of that kind).
- garden_surprise: limit check; first city (random order) with a living windmill: place the pumpkin hub building on a tile of it and spawn 50-100 mini pumpkin units.
- wild_mage: limit check; random ground island random tile; spawn 1 evil mage.
- underground_necromancer: limit check; random city; needs a mine building; spawn necromancer at the mine plus 5-24 skeletons in the mine's region.
- mad_thoughts: random city with population >= 50; each of its units has a 20% chance to gain the "madness" trait.
- greg_abominations: only when a debug option is on (effectively disabled in normal play).
Disasters flagged premium_only exist (small_meteorite, hellspawn, ice_ones_awoken, wild_mage, underground_necromancer) but the flag is not checked in the selection code.
Earthquake (shared by player power and small_earthquake): at most one quake active; picks a precomputed "print" shape (random from a shuffled list; steps shuffled), centred on the target tile. Every 0.05 s it applies the next 300 steps of the print (stops when the list is exhausted): for each covered tile (if Gaia allows): disaster type -> re-terraform the tile with option earthquake_disaster (buildings become ruins; top covers such as biome tiles and roads are stripped; frost is removed; an ocean main type steps down one rung, i.e. water becomes pit/dry ground one depth shallower); player "random power" quake picks 50% decrease-all or 50% increase-all with the earthquake option; scorch is removed; units on covered tiles are either confused (50%) or pushed with a random force (50%). Camera shakes while active.

### M13. Other periodic world behaviours
- Unit spawn (behaviour "unit_spawn", 24.5 + [0,30) s): needs law animals_spawn. Pick a random ground island with >= 4 regions and a random tile; if its biome allows auto-spawn: pick one creature id uniformly from the biome's weighted list; skip if that species' live count > its max_random_amount; skip if > 3 units are already within the 3x3 chunk neighbourhood; else spawn a random 2-4 of them there. (Sapient species lists are only used by a player drop power, not here.)
- Ruin rats (behaviour "ruins_rat_spawn", 30.5 + [0,3) s): needs law animals_spawn; skip if live rats > 3 x their max_random_amount; pick the first (random order) building of the "ruins" wild kingdom that is alive, a city building and has housing slots; spawn 2-4 rats at it.
- Migrants (behaviour "migrants", 80 s): needs law civ_migrants. For a random number (1..number of cities) of cities taken in random order: skip neutral cities, cities without a bonfire-type building, and cities with population > 100; if the city's main subspecies has not hit its population limit, spawn uniform 1-3 new adult-aged units (age overgrowth in [age_spawn, 2 x age_spawn)) at the bonfire with traits attractive and soft_skin, join them to the city and kingdom (counted as migrants).
- Building sparks (visual only). Grin reaper (law grin_reaper, off by default, only when no UI window open): each tick picks a random subspecies carrying the "grin mark", one random living member and kills it outright with "smile" damage (full health damage); behaviour interval 0.01-0.02 s.
- Creep decay (behaviour "creep_decay", 1 + [0,0.3) s): skipped if law forever_tumor_creep on. For each of four creep families (tumor, biomass, super pumpkin, cybercore: hub building ids with biome ids biome_tumor, biome_biomass, biome_pumpkin, biome_cybertile): gather every tile of the family's low and high top types; flood-fill (8-neighbour) from every usable hub building's tile across tiles of that biome; tiles not reached are "disconnected"; up to 3 randomly chosen disconnected tiles are decreased per family per firing (creep removed). So creep dies when its hub dies, 3 tiles at a time.
- Inferno / singularity / biomass / swamp visual behaviours: inferno fires (every 0.5 + [0,1) s, if at least 10 infernal tiles exist, each of infernal_high and infernal_low: 10% chance to force-ignite one random tile of that type, giving natural permanent flames); infernal_low animation redraw 40%; singularity/biomass tile animation redraws; swamp animation. Only the inferno fire effect affects gameplay.
- Tile effects (behaviour "waves", 0.1 + [0,0.1) s): 5 attempts per firing: choose a random tile inside the camera's visible zones; look up the tile type's effect list (weighted by `rate`, only wave_normal has rate 100, others 1) and pick one; roll the effect's `chance`; require that all 8 neighbours also have a tile type allowed for that effect; then spawn the decorative effect (limit enforced by the effect controller). Visual only; the table lists which tile types carry which cosmetic effect.
- Fire-elemental / lightning / etc. details belong to other specs.

### M14. Regions, islands and the connectivity graph
Maintained incrementally; consumed by pathfinding, spawning, disasters, erosion, mineral growth and docks.
- Dirty tracking: any change of a tile's layer type marks its chunk dirty for regions and the 8 surrounding chunks dirty for links. Recomputation is batched: the chunk manager runs at most once per 0.4 s of world time (timer re-armed to 0.4 s after a run), is skipped while nothing is dirty, and is skipped while the player is actively dragging/painting (unless every chunk is dirty, e.g. after generation or load).
- Regions (per dirty chunk): scan the chunk's 256 tiles; each unassigned tile starts a new region of its tile's layer type and flood-fills across the chunk using 8-neighbour moves between tiles of the same layer type, except that a diagonal step is forbidden when either of the two orthogonal tiles it would "cut" is a Block-layer tile (or lies off the map) -- so diagonal squeezing between two touching mountain corners is impossible. Tiles of a different layer, or outside the chunk, become the region's edge tiles. Region id = zone_id x 1000 + index in chunk. A region records which zones it overlaps. Tile order inside a region is shuffled afterwards so "random tile of region" is cheap and unbiased.
- Links: for each of the four sides of every dirty chunk, walk the border tile pairs (own edge tile vs the neighbour chunk's facing edge tile); consecutive pairs with the same layer type form one link between the two regions owning those tiles. Diagonal chunk-corner pairs also form links when same layer and not corner-blocked. Region.neighbours = regions linked to it.
- Islands: flood the region graph (BFS) to group connected regions of the same layer type into islands (type = layer of its regions). Islands cache tile count (sum of region tile counts), a list of the ground islands, a list of "edge regions" and, per island, the set of adjacent islands of other types (island neighbour graph). Dirty islands are cleared and rebuilt around changed chunks only; island objects are pooled.
- Queries (all return null / none if the pool is empty): random ground island (default requires >= 4 regions, i.e. >= ~1024 tiles at most; uniform over qualifying islands) or area-weighted (each island appears once per region); random non-ground island; random ground tile (random island then random region then random tile, falling back to any tile); count of "land islands" = ground islands with >= 4 regions; ratio helpers (ground islands / all islands, ground tiles / all tiles).
- Island helpers: goodForDocks = tile count >= 2500; reachableByCityFrom(other) = true if the two islands both neighbour a common Ocean island that is >= 2500 tiles (so cities can ship across big seas); isGoodIslandForActor: Block islands never; Ocean only for water creatures; Ground not for water creatures; Lava not for species that die in lava.
- Region path finder (long-range pathing helper): returns SamePlace if start == target or both in one full (256-tile) region; PathFound immediately if the same non-full region; DifferentIslands if the island differs (no path exists for that mover type). Otherwise a breadth-first wave is started from the TARGET region over region neighbours, numbering waves, until the start region is reached; then the path is reconstructed from the start by repeatedly stepping to the neighbour with the lowest wave number (ties broken by the neighbour whose chunk is closest, in squared chunk distance, to the target chunk). Result = ordered list of regions; the local pathfinder then only needs to route tile-to-tile inside/along this corridor. Paths are cached by "startRegion_targetRegion" (cache cleared when > 1000 entries and whenever chunks are recomputed). "simplePath" is true when every region on the wave was a full 256-tile region (open terrain).
- A pathing-friendly consequence: a tile that changes layer type (mountain raised, water dried, lava flowing, ice forming on shallow water) can open or cut routes; the connectivity data therefore lags changes by up to 0.4 s.

### M15. Map generation pipeline (new world)
Inputs: size (see Data model), a template id (Content table), template values (editable per template, defaults restored by a reset), plus a random seed. Heights start at 0 everywhere; every height write clamps to 0..255 immediately, so order of operations matters. Pipeline, in order:
1. Create grid, chunks, zones, regions; reset world laws to their defaults; create the world record (name, creation time); populate the 8 age slots (M11).
2. Height field: (a) if random_shapes_amount > 0: apply that many shapes with SUBTRACT (no visible effect since heights are still 0). (b) main noise stage (if enabled and scale_1 > 0): for every tile add floor(255 x P(x,y)) where P is 2D Perlin noise in [0,1] sampled at ((offsetX + x)/W x scale_1 x aspectX, (offsetY + y)/H x scale_1 x aspectY) with random offsets in [0,1000000) per run and aspect factors compensating non-square maps. (c) if template force_height_to > 0: set every tile's height to that value (done after the main noise, so it overrides it). (d) center gradient (if enabled): dist = distance to map centre; maxR = 0.9 x W/2; innerR = 0.6 x W/2; for tiles with dist <= maxR add int(45 x (maxR - dist)/(maxR - innerR)) (the ramp exceeds 45 inside innerR). (e) center depression (bad_apple template, 'center_gradient_mountains'): maxR = 0.3 x W/2; for EVERY tile subtract int(75 x (maxR - dist)/maxR). Inside maxR this lowers heights (up to -75 at the centre); outside maxR the term is negative so heights are RAISED (e.g. +180 at the map corner), saturating at 255. Net effect: a low basin in the centre surrounded by a ring of mountains. Reproduce literally. (f) center lake: maxR = 0.6 x W/2, innerR = 0.2 x W/2; tiles within maxR multiply height by (1 - (maxR - dist)/(maxR - innerR)); the factor is 1 at maxR, 0 at innerR, and negative nearer the centre (height clamps to 0), so a round lake of radius about 0.4 x W/2 (flat bottom) with a sloped shore up to 0.6 x W/2. (g) noise stage 2 (if enabled and scale_2 > 0): SUBTRACT noise with alpha 0.2 (max 51) at spatial scale 4 x scale_2. (h) noise stage 3 (if enabled): SUBTRACT noise alpha 0.1 (max 25) at scale 10 x scale_3. (i) low_ground flag: for each tile, if h > 150 subtract 50; then if (new) h > 130 subtract 20. (j) high_ground flag: if h < 20 add 80, else if h < 120 add 40. (k) random shapes again (subtract). (l) ring effect (if enabled): any tile whose height is exactly (a type's threshold minus one of that type's offsets) is set to the threshold (offsets: soil_high 10-17 i.e. heights 111-118 -> 128; hills 2 and -6 i.e. heights 197 and 205 -> 199; mountains 2 and 4 i.e. 208, 206 -> 210; summit 2 and 4 i.e. 228, 226 -> 230). This makes thin rim/ledge bands at plateau edges. (m) round-edge falloff: radius R = W/2 x 0.99, inner = W/2 x 0.85; tiles beyond R get height 0; tiles between inner and R are scaled by (R - dist)/(R - inner). (n) square-edge falloff: a 64-tile-wide edge mask (image-based in the original) darkens heights near all four sides; not reproducible exactly -- implement as a linear fade over 64 tiles to 0 (unclear).
3. Terrain typing: each tile main type = generator type for its height by the thresholds in the main tile table (0 deep, 30 close, 70 shallow, 98 sand, 108 soil_low, 128 soil_high, 199 hills, 210 mountains, 230 summit). Done in 4 batches for smoothness only.
4. If forbidden-knowledge start is on: enable cursed-world law.
5. If remove_mountains: decrease every rock tile up to twice (summit -> hills, mountains -> soil_high, hills -> soil_high).
6. Special layouts (template flags): anthill: everything becomes mountains; ten "rooms" (each = zones/10 random-walk zones starting from the map centre and the four corners offset by zones/10+1) are filled with soil_high; 5 tunnels between corner zones are widened to soil_high with random-walk carving (10 walks x 10 steps from every tunnel tile, only through rock); each room is carved with 20 random 15-step walks through rock. checkerboard: every chunk with (cx+cy) even becomes soil_high and a random pool biome A is seeded; odd chunks soil_low with biome B. cubicles: tile the map with random rectangular rooms of chunks (width/height each randint(2, cubicle_size+2) chunks, grown rightwards/leftwards then up/down while free chunks exist); each room becomes soil_high or soil_low (50/50) with its own random pool biome; the room's four borders (raycast between its extreme corner tiles) become mountains; one door per side (a hills tile plus its mountain neighbours made hills) at a random position not within 3 tiles of corners.
7. Third batch of random shapes with random add/subtract (only changes heights after typing; no effect on tile types -- likely cosmetic or leftover).
8. Perlin replace passes (per template): for each pass with noise scale 15 and a fresh random offset in [0,15000): for each tile compute n = floor(255 x P); for each option in order: if n > replace_height_value and the tile's main type equals `from` -> main type := `to`. (Default for most templates: n > 170 turns soil_high into soil_low, breaking up highland.)
9. Rebuild chunk regions/islands.
10. Random biomes (if enabled): repeat while there are unbiomed soil tiles: shuffle the set of soil tiles still without a biome; take the last as seed; pick a biome from the weighted pool (each biome appears generator_pot_amount times; sand/hills/creep biomes have weight 0 and creep biomes none); maxSteps = tiles in the seed's island if the island has < 400 tiles; island/2 if 400-599; island/3 if >= 600; then capped by the biome's generator_max_size when nonzero (swamp 300, mushroom 300, candy 30, corrupted 20, infernal 20). If maxSteps is 0 discard the seed. Grow a patch: keep a frontier list; repeatedly shuffle and pop one random frontier tile, paint it with the biome's low or high tile by rank, add its soil 8-neighbours not yet queued; stop when maxSteps painted or frontier empty. If the patch painted <= 10 tiles and some neighbour of the seed carries a different non-special biome, repaint the whole checked area with that biome (avoid tiny islands of odd biomes). 
11. Mountain edges (if enabled): raycast lines along all four map borders set to mountains (a closed wall around the map).
12. Freeze mountain tops (templates with freeze_mountains): every mountains tile with height > 220 is frozen (snow cap).
13. Vegetation (if enabled): 12 passes, each attempts (tileCount / 20) random tiles: skip if not ground or its zone already has >= 3 trees; if the tile's biome grows vegetation: choose uniformly among plant / tree / bush and try to place using the normal grow rules (zone limit + vegetation_random_chance 0.5 + placement rules).
14. Resources (if enabled): n = tileCount / 4000 fruit bushes (random tiles) and n / 2 beehives on random grass tiles.
15. Post: update region/island data, redraw, clear all units, start the clock at world_time 0 with the age manager on slot 0.

### M16. Terraform options and explosions
A "terraform option" is a record of switches applied when the world is hit by a power, projectile, bomb, weather drop or disaster. `damageWorld(centre, radius, option)` does, in order: optional camera shake (duration 0.3 s, step 0.01 s, intensity 2 by default); optional force push on units within the radius (force 1.5 default, damage = option damage, respecting ignore_kingdoms); then the per-tile pass over a filled round brush of that radius (clipped to the map):
1. Clear conway-life cells in range; optionally kill tornado effects; kill tile-effect sprites near the centre.
2. For each tile in the brush: grey goo flagged as damaged; if add_burned and not liquid -> scorch; if lightning_effect -> lightning rules (lava with heat > 20 is decreased and 90% flings a lava drop; ocean loses liquid and 80% emits a rain drop; spawn-drop buildings burst on alternating hits); if add_heat != 0 -> addHeat(tile, add_heat); if damage_buildings and a building is present -> building takes `damage` (buildings of ignore_kingdoms' wild factions are spared); if set_fire -> force-ignite; if explode_tile -> explosion rule below; if transform_to_wasteland and the tile did not explode -> acid terraform; if the option has add_trait -> every unit on the tile gains the trait.
Explosion rule for a tile at distance d inside radius R (m = d/R, inv = 1-m): units on the tile (except very high flyers unless applies_to_high_flyers) take `damage`; frozen tiles thaw one step; base tile damage = int(30 x inv); if <= 0 the tile is untouched; non-explodable tiles survive with probability (1 - inv) (random draw > inv -> skipped); otherwise the tile is "exploded": pixels-exploded counter++, optional explosion visual; damage -= int(damage x 0.5 x random x m); explodable tiles detonate their chain-bomb (and delayed ones arm); if tile.strength <= option.explode_strength the tile is decreased (damage=true, so Gaia can block it); a building on a tile that became liquid and cannot float is destroyed; if the tile was not liquid it gets scorch and, if explode_and_set_random_fire, 20% chance forced ignition else normal ignition attempt (burnable only).
Heights of "strength": tiles with strength 0 (oceans, lava, all vegetation tops, many props) always decrease when exploded with explode_strength >= 0; strength 2 (pit tiles), 3 (sand, soils, hills, mountains, summit by default) need explode_strength >= that.
Tile bombs: `tnt` and `water_bomb` tiles are armed/delayed and detonate with radius explode_range (10 and 9); `tnt_timed` counts down 5 s then detonates (radius 8); `landmine` detonates (radius 3) when stepped on by a non-flying unit (90% per step); `fuse` is a burnable cable that terraforms after burning; `fireworks` burns (rate 5) and terraforms after fire, launching a firework when ignited. A water_bomb flood: explodable_by_ocean -> it detonates when touched by ocean/rain water.

## Content tables

### Content: main tile types (ground ladder)
Columns: ht = generator height threshold (type is chosen when height >= ht and no higher threshold applies; "-" = never chosen by height). walk = movement speed multiplier. str = explosion resistance ("strength"; explosion option explode_strength >= str removes/decreases the tile). dec/inc/frz = decrease_to / increase_to / freeze_to (frozen tile appearance). Flags: L = liquid, G = ground (walkable), burn = can_be_set_on_fire (receives scorch), hold_lava, biome = biome id carried by the main type, farm = can be farmed, build = buildings allowed, frz? = can be frozen.
| id | layer | ht | walk | str | dec | inc | frz | flags / notes |
|---|---|---|---|---|---|---|---|---|
| deep_ocean | Ocean | 0 | 0.1 | 0 | pit_deep_ocean | pit_close_ocean | - | L, ocean, cannot freeze, no erosion-to-sand, used by generator |
| close_ocean | Ocean | 30 | 0.1 | 0 | pit_close_ocean | pit_shallow_waters | - | L, ocean, cannot freeze, no erosion-to-sand |
| shallow_waters | Ocean | 70 | 0.1 | 0 | pit_shallow_waters | sand | ice | L, ocean, freezable, fast_freeze, no erosion-to-sand |
| pit_deep_ocean | Ground | - | 1 | 2 | (none) | pit_close_ocean | - | G, dry basin, burn, can_be_filled_with_ocean -> deep_ocean, cannot freeze |
| pit_close_ocean | Ground | - | 1 | 2 | pit_deep_ocean | pit_shallow_waters | - | G, burn, fills -> close_ocean, cannot freeze |
| pit_shallow_waters | Ground | - | 1 | 2 | pit_close_ocean | sand | (none) | G, burn, fills -> shallow_waters, fast_freeze flag (inherited), cannot freeze |
| border_pit, border_water, border_water_runup | Ground | - | 1 | 3 | - | - | - | rendering helpers only; never placed by rules |
| sand | Ground | 98 | 0.5 | 3 | pit_shallow_waters | soil_low | snow_sand | G, burn, farm, build, biome_sand (special biome), build-cost 116 |
| soil_low | Ground | 108 | 1 | 3 | sand | soil_high | frozen_low | G, soil, rank Low, accepts biomes, farm, build, burn, food "worms", cost 115 |
| soil_high | Ground | 128 | 1 | 3 | soil_low | hills | frozen_high | G, soil, rank High, accepts biomes, farm, build, burn, food "worms", cost 120; ring offsets {15,16,17,14,13,12,11,10} |
| lava0 | Lava | - | 0.2 | 0 | sand | hills | - | L, lava level 0, dmg 150, cannot freeze, state timer 30 s, lava_increase lava1 |
| lava1 | Lava | - | 0.2 | 0 | sand | hills | - | lava level 1, timer 10 s, up lava2, down lava0 |
| lava2 | Lava | - | 0.2 | 0 | sand | hills | - | lava level 2, timer 10 s, up lava3, down lava1 |
| lava3 | Lava | - | 0.2 | 0 | sand | hills | - | lava level 3, timer 3 s, no up, down lava2 |
| hills | Ground | 199 | 1 | 3 | soil_high | mountains | snow_hills | G, rocks, hold_lava, burn, biome_hill (special), cost 140; ring offsets {2,-6} |
| mountains | Block | 210 | 0.5 | 3 | hills | summit | snow_block | rocks, mountains, block height 3, hold_lava, burn, cost 160; ring offsets {2,4} |
| summit | Block | 230 | 0.5 | 3 | mountains | (none) | snow_summit | rocks, mountains, summit, block height 5, hold_lava, burn, cost 160; ring offsets {2,4} |
| grey_goo | Goo | - | 0.1 | 0 | pit_deep_ocean | (none) | - | damages units (200), burnable, life, cannot freeze, cost 10 |
Notes: "ring offsets" are heights just below the threshold which the ring-effect generation step snaps up to the threshold, producing a thin ring (a visible rim) around higher plateaus (see Mechanics: map generation). Pit types are NOT produced by the generator; they appear when water tiles are decreased (dug). Sand, soil_low, soil_high have biome_tags (Sand / Soil / Soil) used for building and flora compatibility.

### Content: top tile types (overlays)
Columns: h_min = height threshold of the top tile (informational, not used by generation); walk; fire = burnable / burn_rate (health lost per ignition; default 10) / fire_chance (probability a burning neighbour ignites it per spread attempt, default 1); food = nutrition / food resource. STD = the standard biome-ground flag set: grass (counts as grass), ground, farmable, buildable, removed by freeze and by heat (remove_on_freeze / remove_on_heat), accepts further biome spread, can receive scorch. STD-nograss = same without the grass flag (wasteland, desert, crystal). Cost 120 on all "_high" variants (cost 1 for low) unless shown.
| id | h_min | walk | fire | food | biome | step action (chance per unit step; default 0.05) | flags |
|---|---|---|---|---|---|---|---|
| grass_low | 108 | 1 | y/5/0.05 | 30/herbs | biome_grass |  | STD |
| grass_high | 128 | 1 | y/5/0.06 | 30/herbs | biome_grass |  | STD, cost=120 |
| savanna_low | 108 | 1 | y/5/0.06 | 30/wheat | biome_savanna |  | STD |
| savanna_high | 128 | 1 | y/5/0.06 | 30/wheat | biome_savanna |  | STD, cost=120 |
| enchanted_low | 108 | 1 | y/4/0.03 | 30/herbs | biome_enchanted | enchanted status (clears cursed) (0.05) | STD |
| enchanted_high | 108 | 1 | y/4/0.04 | 30/herbs | biome_enchanted | enchanted status (clears cursed) (0.05) | STD |
| mushroom_low | 108 | 1 | y/4/0.03 | 30/mushrooms | biome_mushroom |  | STD |
| mushroom_high | 128 | 1 | y/4/0.03 | 30/mushrooms | biome_mushroom |  | STD, cost=120 |
| birch_low | 108 | 1 | y/4/0.03 | 30/herbs | biome_birch |  | STD |
| birch_high | 128 | 1 | y/4/0.03 | 30/herbs | biome_birch |  | STD, cost=120 |
| maple_low | 108 | 1 | y/4/0.03 | 30/herbs | biome_maple |  | STD |
| maple_high | 128 | 1 | y/4/0.03 | 30/herbs | biome_maple |  | STD, cost=120 |
| rocklands_low | 108 | 1 | y/3/0.03 | 30/herbs | biome_rocklands |  | STD |
| rocklands_high | 128 | 1 | y/3/0.03 | 30/herbs | biome_rocklands |  | STD, cost=120 |
| garlic_low | 108 | 1 | y/5/0.03 | 30/herbs | biome_garlic |  | STD |
| garlic_high | 128 | 1 | y/5/0.03 | 30/herbs | biome_garlic |  | STD, cost=120 |
| flower_low | 108 | 1 | y/5/0.03 | 30/herbs | biome_flower |  | STD |
| flower_high | 128 | 1 | y/4/0.03 | 30/herbs | biome_flower |  | STD, cost=120 |
| celestial_low | 108 | 1 | y/2/0.03 | 30/herbs | biome_celestial |  | STD |
| celestial_high | 128 | 1 | y/2/0.03 | 30/herbs | biome_celestial |  | STD, cost=120 |
| singularity_low | 108 | 1 | n/1/0.03 | 30/herbs | biome_singularity | teleport to a random singularity tile, stunned (0.1) | STD |
| singularity_high | 128 | 1 | n/1/0.03 | 30/herbs | biome_singularity | teleport to a random singularity tile, stunned (0.1) | STD, cost=120 |
| clover_low | 108 | 1 | y/4/0.03 | 30/herbs | biome_clover |  | STD |
| clover_high | 128 | 1 | y/4/0.03 | 30/herbs | biome_clover |  | STD, cost=120 |
| paradox_low | 108 | 1 | y/2/0.03 | 30/herbs | biome_paradox | +1 age step (0.1) | STD |
| paradox_high | 128 | 1 | y/2/0.03 | 30/herbs | biome_paradox | +1 age step (0.1) | STD, cost=120 |
| corrupted_low | 108 | 1 | y/1/0.02 | 30/evil_beets | biome_corrupted | cursed status (clears blessed) (0.05) | STD, build_tag=can_build_in_biome_corruption |
| corrupted_high | 128 | 1 | y/1/0.02 | 30/evil_beets | biome_corrupted | cursed status (clears blessed) (0.05) | STD, cost=120, build_tag=can_build_in_biome_corruption |
| infernal_low | 108 | 1 | n/5/0.05 | 30/peppers | biome_infernal |  | STD, hold_lava, !can_be_frozen, build_tag=can_build_in_biome_infernal, feet_no_ignite |
| infernal_high | 128 | 1 | n/5/0.06 | 30/peppers | biome_infernal |  | STD, hold_lava, !can_be_frozen, cost=120, build_tag=can_build_in_biome_infernal, feet_no_ignite |
| jungle_low | 108 | 1 | y/5/0.04 | 30/bananas | biome_jungle |  | STD |
| jungle_high | 128 | 1 | y/5/0.05 | 30/bananas | biome_jungle |  | STD, cost=120 |
| swamp_low | 108 | 0.6 | n/5/0.05 | 30/herbs | biome_swamp |  | STD, build_tag=can_build_in_biome_swamp |
| swamp_high | 128 | 0.6 | n/5/0.06 | 30/herbs | biome_swamp |  | STD, cost=120, build_tag=can_build_in_biome_swamp |
| wasteland_low | 108 | 1 | n/5/0.05 | 30/herbs | biome_wasteland |  | STD-nograss, wasteland, build_tag=can_build_in_biome_wasteland |
| wasteland_high | 128 | 1 | n/5/0.06 | 30/herbs | biome_wasteland |  | STD-nograss, wasteland, cost=120, build_tag=can_build_in_biome_wasteland |
| desert_low | 108 | 0.7 | n/5/0.05 | 30/desert_berries | biome_desert | +1% max mana (0.05) | STD-nograss, build_tag=can_build_in_biome_desert |
| desert_high | 128 | 0.7 | n/5/0.06 | 30/desert_berries | biome_desert | +1% max mana (0.05) | STD-nograss, cost=120, build_tag=can_build_in_biome_desert |
| crystal_low | 108 | 1 | n/5/0.05 | 30/crystal_salt | biome_crystal |  | STD-nograss |
| crystal_high | 128 | 1 | n/5/0.06 | 30/crystal_salt | biome_crystal |  | STD-nograss, cost=120 |
| candy_low | 108 | 1 | y/4/0.05 | 30/candy | biome_candy |  | STD |
| candy_high | 128 | 1 | y/4/0.06 | 30/candy | biome_candy |  | STD, cost=120 |
| lemon_low | 108 | 1 | y/2/0.05 | 30/lemons | biome_lemon | +1% max stamina (0.05) | STD |
| lemon_high | 128 | 1 | y/2/0.06 | 30/lemons | biome_lemon | +1% max stamina (0.05) | STD, cost=120 |
| water_bomb | - | 1 | n/10/1 |  |  |  | ground, can_build_on, explodable, explodable_delayed, can_be_filled_with_ocean, !can_be_frozen, cost=10, explode_range=9 |
| tumor_low | 108 | 0.8 | y/10/1 |  | biome_tumor | tumor-infection trait (if susceptible) (0.05) | ground, creep, life, remove_on_freeze, !can_be_frozen |
| tumor_high | 108 | 0.8 | y/10/1 |  | biome_tumor | tumor-infection trait (if susceptible) (0.05) | ground, creep, life, remove_on_freeze, !can_be_frozen |
| biomass_low | 108 | 0.8 | y/10/0.06 |  | biome_biomass | slowness status (if not immune) (0.05) | ground, creep, life, remove_on_freeze, !can_be_frozen |
| biomass_high | 108 | 0.8 | y/10/0.06 |  | biome_biomass | slowness status (if not immune) (0.05) | ground, creep, life, remove_on_freeze, !can_be_frozen |
| pumpkin_low | 108 | 0.8 | y/10/0.06 |  | biome_pumpkin | slowness status (if not immune) (0.2) | ground, creep, life, remove_on_freeze, !can_be_frozen |
| pumpkin_high | 108 | 0.8 | y/10/0.06 |  | biome_pumpkin | slowness status (if not immune) (0.2) | ground, creep, life, remove_on_freeze, !can_be_frozen |
| cybertile_low | 108 | 0.8 | n/10/1 |  | biome_cybertile |  | ground, creep, remove_on_freeze, !can_be_frozen |
| cybertile_high | 108 | 0.8 | n/10/1 |  | biome_cybertile |  | ground, creep, remove_on_freeze, !can_be_frozen |
| road | - | 1.5 | n/10/1 |  |  |  | ground, can_build_on, road, !can_be_frozen, cost=116 |
| fuse | - | 1 | y/4/1 |  |  |  | ground, can_build_on, terraform_after_fire, !can_be_frozen, cost=10 |
| field | 108 | 1 | y/4/0.4 |  |  |  | ground, farm_field, remove_on_freeze, remove_on_heat, !can_be_frozen, cost=115 |
| tnt | - | 1 | y/10/1 |  |  |  | ground, can_build_on, explodable, explodable_delayed, !can_be_frozen, cost=10, explode_range=10 |
| fireworks | - | 1 | y/5/1 |  |  |  | ground, can_build_on, terraform_after_fire, !can_be_frozen, cost=10 |
| tnt_timed | - | 1 | y/10/1 |  |  |  | ground, can_build_on, explodable, explodable_timed, !can_be_frozen, cost=10, explode_range=8, explodeTimer=5 |
| landmine | - | 1 | y/10/1 |  |  | explodes (non-flying, non-weightless units) (0.9) | ground, explodable, !can_be_frozen, cost=10, explode_range=3 |
| frozen_low | - | 1 | n/10/1 |  |  |  | ground, can_be_farm, can_build_on, can_be_unfrozen, !can_be_frozen, cost=10 |
| frozen_high | - | 1 | n/10/1 |  |  |  | ground, can_be_farm, can_build_on, can_be_unfrozen, !can_be_frozen, cost=10 |
| permafrost_low | 108 | 1 | n/5/0.05 | 30 | biome_permafrost |  | grass, ground, can_be_farm, can_build_on, remove_on_freeze, remove_on_heat, forever_frozen, can_be_biome, !can_be_frozen, build_tag=can_build_in_biome_permafrost |
| permafrost_high | 128 | 1 | n/5/0.06 | 30/pine_cones | biome_permafrost |  | grass, ground, can_be_farm, can_build_on, remove_on_freeze, remove_on_heat, forever_frozen, can_be_biome, !can_be_frozen, cost=120, build_tag=can_build_in_biome_permafrost |
| snow_sand | 108 | 1 | n/5/0.05 | 30 |  |  | grass, ground, can_be_farm, can_build_on, remove_on_freeze, remove_on_heat, can_be_unfrozen, !can_be_frozen, build_tag=can_build_in_biome_permafrost |
| ice | 108 | 1 | n/5/0.05 | 30 |  |  | grass, can_be_farm, liquid, remove_on_freeze, remove_on_heat, can_be_unfrozen, damaged_when_walked, !can_be_frozen, build_tag=can_build_in_biome_permafrost |
| snow_hills | 108 | 1 | n/5/0.05 | 30 |  |  | grass, ground, remove_on_freeze, remove_on_heat, can_be_unfrozen, !can_be_frozen, build_tag=can_build_in_biome_permafrost |
| snow_block | 108 | 1 | n/5/0.05 | 30 |  |  | grass, can_be_farm, remove_on_freeze, remove_on_heat, can_be_unfrozen, block, mountains, !can_be_frozen, block_height=3, build_tag=can_build_in_biome_permafrost |
| snow_summit | 108 | 1 | n/5/0.05 | 30 |  |  | grass, can_be_farm, remove_on_freeze, remove_on_heat, can_be_unfrozen, block, mountains, summit, !can_be_frozen, block_height=4, build_tag=can_build_in_biome_permafrost |
| wall_evil | - | 1 | n/10/1 |  |  |  | life, wall, block, !can_be_frozen, cost=10, block_height=6 |
| wall_order | - | 1 | n/10/1 |  |  |  | wall, block, !can_be_frozen, cost=10, block_height=6 |
| wall_ancient | - | 1 | n/10/1 |  |  |  | wall, block, !can_be_frozen, cost=10, block_height=6 |
| wall_wild | - | 1 | y/5/1 |  |  |  | wall, block, !can_be_frozen, cost=10, block_height=6 |
| wall_iron | - | 1 | n/10/1 |  |  |  | wall, block, !can_be_frozen, cost=10, block_height=6 |
| wall_green | - | 1 | y/5/1 |  |  |  | wall, block, !can_be_frozen, cost=10, block_height=6 |
| wall_light | - | 1 | n/10/1 |  |  |  | wall, can_be_unfrozen, block, !can_be_frozen, cost=10, block_height=20 |


Notes on top tiles: lava step action = set unit burning (unless it has fire-proof feet) and force-ignite the tile, 90% per step. Corrupted tiles also spawn a ghost copy of any soul-bearing unit that dies on them. Frozen/snow variants are shown only for completeness: `snow_sand`, `snow_hills`, `snow_block`, `snow_summit`, `ice`, `frozen_low`, `frozen_high` are the frozen appearances of sand / hills / mountains / summit / shallow water / soil_low / soil_high; they exist only as the effective type of a frozen tile and thaw back (can_be_unfrozen). `ice` is layer Ocean (walkable by ground units: it damages itself when walked on), liquid. `permafrost_low/high` are the cold biome's permanently frozen grass (forever_frozen: never thaw, not freezable). `snow_block`/`snow_summit` are Block layer. `$wall$` is a hidden template for the wall tiles (evil, order, ancient, wild, iron, green, light): block height 6 (light: 20), cannot burn except wild and green (burn rate 5), cannot be frozen, cost 10, not copy-able by finger tools; `wall_evil` is a life tile, `wall_light` is animated and thaw-able; city walls are built from these.

### Content: biomes
Weights written "name ×n" mean the id appears n times in the pick list (probability n / total). "gen pool weight" = chance weight in the map-generator biome lottery. "flags": spread = spreads naturally (M8); drop:X = a drop of kind X force-spreads this biome; dark_biome = shields light-sensitive units; cold_biome = shields heat/light-sensitive units. All normal biomes use the same four vegetation selectors (tree / plant / bush / mineral pick uniformly from the lists below); sand uses the sand-tree selector; hills use only minerals. Creep biomes have no spread, no vegetation and no wild fauna.
| biome id | low / high tile | grow_strength | gen pool weight | gen max patch | flags | trees (weight) | plants | bushes | minerals | wild creatures | sapient-capable species list |
|---|---|---|---|---|---|---|---|---|---|---|---|
| biome_grass | grass_low / grass_high | 5 | 8 | - | spread, drop:water | tree_green_1, tree_green_2, tree_green_3 | mushroom_red ×2, mushroom_green ×2, mushroom_teal ×2, mushroom_white ×2, mushroom_yellow ×2, green_herb ×4, flower ×4 | fruit_bush | mineral_stone ×4, mineral_metals ×3 | wolf, fox ×2, raccoon, sheep ×3, chicken ×3, rabbit ×3, fly ×4, beetle ×4, grasshopper ×4 | human, dwarf, orc, elf, civ_wolf, civ_fox, bandit, civ_sheep, civ_chicken, civ_rabbit |
| biome_savanna | savanna_low / savanna_high | 6 | 5 | - | spread, drop:water | savanna_tree_1 ×5, savanna_tree_2 ×5, savanna_tree_big_1, savanna_tree_big_2 | savanna_plant | fruit_bush | mineral_stone ×5, mineral_metals ×3 | rhino, hyena, buffalo, cat ×3, armadillo, ostrich ×2, fly ×4, beetle ×4 | human, dwarf, orc, elf, civ_cat, civ_rhino, civ_hyena, civ_buffalo, civ_armadillo |
| biome_jungle | jungle_low / jungle_high | 6 | 6 | - | spread, drop:water | jungle_tree | jungle_plant, jungle_flower | fruit_bush | mineral_silver ×5, mineral_metals, mineral_gems | snake, cat ×2, monkey, frog ×3, scorpion | human, dwarf, orc, elf, civ_snake, civ_cat, civ_monkey, civ_frog, civ_scorpion |
| biome_desert | desert_low / desert_high | 6 | 4 | - | spread, drop:water | desert_tree | desert_plant | - | mineral_stone ×4, mineral_metals ×3, mineral_gems, mineral_silver | cat, snake, scorpion | human, dwarf, orc, elf, civ_cat, civ_snake |
| biome_lemon | lemon_low / lemon_high | 6 | 3 | - | spread, drop:water | lemon_tree | mushroom_red, mushroom_green, mushroom_teal, mushroom_white, mushroom_yellow, green_herb ×5, flower ×5 | fruit_bush | mineral_stone ×5, mineral_metals ×3 | lemon_snail | civ_lemon_man |
| biome_permafrost | permafrost_low / permafrost_high | 6 | 3 | - | spread, cold_biome | pine_tree | snow_plant | - | mineral_stone ×4, mineral_metals ×3 | penguin ×4, bear, wolf ×2, snowman | human, cold_one, civ_penguin, civ_bear, civ_wolf, snowman |
| biome_swamp | swamp_low / swamp_high | 6 | 3 | 300 | spread, drop:water | swamp_tree | swamp_plant, swamp_plant_big | - | mineral_stone ×4, mineral_metals ×3 | crocodile, snake ×4, frog ×6, fly ×5, turtle ×3, capybara | orc, elf, bandit, civ_crocodile, civ_snake, civ_frog, civ_capybara, civ_piranha |
| biome_crystal | crystal_low / crystal_high | 6 | 2 | - | spread | crystal_tree | crystal_plant | - | - | crystal_sword ×2 | dwarf, civ_crystal_golem |
| biome_enchanted | enchanted_low / enchanted_high | 6 | 3 | - | spread, drop:blessing | enchanted_tree | flower ×5 | fruit_bush | mineral_silver ×5, mineral_metals ×2, mineral_gems | butterfly ×5, fairy | elf, white_mage, fairy |
| biome_corrupted | corrupted_low / corrupted_high | 6 | 1 | 20 | spread, dark_biome, drop:curse | corrupted_tree, corrupted_tree_big | corrupted_plant | - | mineral_bones ×7 | jumpy_skull | necromancer, jumpy_skull, plague_doctor |
| biome_infernal | infernal_low / infernal_high | 6 | 1 | 20 | spread, spread_ignore_burned_stages, drop:fire | infernal_tree, infernal_tree_big, infernal_tree_small | flame_flower | - | mineral_metals ×3, mineral_adamantine ×3 | fire_skull | evil_mage, demon, fire_skull |
| biome_candy | candy_low / candy_high | 6 | 1 | 30 | spread, drop:water | candy_tree | candy_plant | - | mineral_stone ×4, mineral_metals ×3 | smore | civ_candy_man |
| biome_mushroom | mushroom_low / mushroom_high | 6 | 1 | 300 | spread, drop:water, drop:powerup | mushroom_tree | flower ×2, mushroom_red ×2, mushroom_green ×2, mushroom_teal ×2, mushroom_white ×2, mushroom_yellow ×2 | fruit_bush | mineral_silver ×3, mineral_stone ×5, mineral_metals ×3, mineral_gems | frog ×3, sheep | civ_sheep, civ_frog |
| biome_wasteland | wasteland_low / wasteland_high | 6 | 0 | - | spread, dark_biome, drop:acid | wasteland_tree | wasteland_flower | - | mineral_stone ×4, mineral_metals ×3 | rat ×4, acid_blob | civ_acid_gentleman, civ_rat |
| biome_birch | birch_low / birch_high | 5 | 4 | - | spread, drop:water | birch_tree | birch_plant, mushroom_red, mushroom_green, mushroom_teal, mushroom_white, mushroom_yellow, green_herb ×4, flower ×4 | fruit_bush | mineral_stone ×4, mineral_metals ×3 | wolf | civ_wolf |
| biome_maple | maple_low / maple_high | 5 | 5 | - | spread, drop:water | maple_tree | maple_plant, mushroom_red, mushroom_green, mushroom_teal, mushroom_white, mushroom_yellow, green_herb ×4, flower ×4 | fruit_bush | mineral_stone ×4, mineral_metals ×3 | wolf, dog | civ_wolf, civ_dog |
| biome_rocklands | rocklands_low / rocklands_high | 5 | 2 | - | spread | rocklands_tree | rocklands_plant | - | mineral_stone ×4, mineral_metals ×3, mineral_gems | goat, alpaca | dwarf, civ_goat, civ_alpaca |
| biome_garlic | garlic_low / garlic_high | 5 | 2 | - | spread, drop:water | garlic_tree | garlic_plant | fruit_bush | mineral_stone ×4, mineral_metals ×3 | garl | civ_garlic_man |
| biome_flower | flower_low / flower_high | 5 | 3 | - | spread, drop:water | flower_tree_1, flower_tree_2, flower_tree_3 | flower_plant ×3, mushroom_red, mushroom_green, mushroom_teal, mushroom_white, mushroom_yellow, green_herb ×5, flower ×20 | fruit_bush | mineral_stone ×4, mineral_metals ×3 | flower_bud, butterfly, beetle, bee, grasshopper, fly | civ_liliar, druid |
| biome_celestial | celestial_low / celestial_high | 5 | 1 | - | spread | celestial_tree ×10, celestial_tree_small | celestial_plant | - | mineral_stone ×4, mineral_metals ×3, mineral_mythril | unicorn | - |
| biome_clover | clover_low / clover_high | 5 | 2 | - | spread, drop:water | clover_tree | clover_plant | fruit_bush | mineral_stone ×4, mineral_metals ×3, mineral_gems | rabbit, cow, butterfly ×5, bee ×3, fairy | civ_rabbit, civ_cow |
| biome_singularity | singularity_low / singularity_high | 5 | 0 | - | spread, dark_biome, drop:coffee | singularity_tree | singularity_plant | - | mineral_stone ×4, mineral_metals ×3 | angle | angle |
| biome_paradox | paradox_low / paradox_high | 5 | 0 | - | spread | paradox_tree | paradox_plant | - | mineral_stone ×4, mineral_metals ×3, mineral_mythril | scorpion | alien, civ_scorpion |
| biome_sand | - | 6 | 0 | - | special_biome, trees=sand_selector, veg_auto | - | - | - | - | crab | civ_crab |
| biome_hill | - | 6 | 0 | - | special_biome, veg_auto | - | - | - | mineral_stone ×4, mineral_metals | - | - |
| biome_biomass | biomass_low / biomass_high | 6 | 0 | - | - | - | - | - | - | - | - |
| biome_cybertile | cybertile_low / cybertile_high | 6 | 0 | - | - | - | - | - | - | - | - |
| biome_pumpkin | pumpkin_low / pumpkin_high | 6 | 0 | - | - | - | - | - | - | - | - |
| biome_tumor | tumor_low / tumor_high | 6 | 0 | - | - | - | - | - | - | - | - |
Notes: 29 biomes total (23 normal + sand and hill specials + 4 creep). Sand and hill have no top tile of their own (they are properties of the sand / hills main types). Creep biomes list their tile pair but have no vegetation, creatures or spread; they are placed only by hub buildings and removed by creep decay (M13). Each biome also carries lists of traits injected into subspecies/cultures/clans/languages/religions born on it; those are owned by the species/culture specs and omitted here. Pool weights sum to 60 over biomes that participate in generation.

### Content: world behaviours (every row)
Timer after each firing = interval + uniform(0, interval_random). "pause" = stops while the world is paused (default yes). "mini" = also runs when rendering only the minimap (default yes).
| id | interval s | + random s | pause stop | mini | effect (see mechanics ref) |
|---|---|---|---|---|---|
| grin_reaper | 0.01 | 0.01 | no | yes | M13: grin-mark reaper (law-gated, off by default) |
| zones_meta_data_visualizer | 0.4 | 0 | no | yes | UI overlay refresh only |
| debug_highlight | 0.1 | 0 | no | yes | debug only |
| disasters | 80 | 0 | yes | yes | M12 |
| migrants | 80 | 0 | yes | yes | M13 |
| decay_roads | 1 | 1 | yes | yes | M9 |
| decay_farms | 1 | 1 | yes | yes | M9 |
| spawn_random_vegetation | 10 | 10 | yes | yes | M9 |
| spawn_minerals | 2 | 3 | yes | yes | M9 |
| building_sparks | 0.1 | 1 | yes | no | cosmetic sparkles on buildings |
| unit_spawn | 24.5 | 30 | yes | yes | M13 |
| ruins_rat_spawn | 30.5 | 3 | yes | yes | M13 |
| creep_decay | 1 | 0.3 | yes | yes | M13 |
| ocean | 0.2 | 0 | yes | yes | M7 |
| tiles_freeze | 0.1 | 0 | yes | yes | M5 |
| tiles_unfreeze | 0.01 | 0 | yes | yes | M5 |
| biomes | 0.05 | 0.05 | yes | yes | M8 |
| lava | 0.05 | 0.05 | yes | yes | M4 |
| fire | 1 | 0 | yes | yes | M3 |
| burned_tiles | 3 | 5 | yes | yes | M3 |
| erosion | 3 | 1 | yes | yes | M7 |
| biome_inferno_fires | 0.5 | 1 | yes | no | M13 (gameplay: spontaneous fires on infernal tiles) |
| biome_inferno_tile_low_animations | 0.5 | 0.5 | yes | no | cosmetic |
| biome_singularity_tile_animations | 0.5 | 0.5 | yes | no | cosmetic |
| creep_biomass | 0.1 | 0.1 | yes | no | cosmetic |
| biome_low_swamp_animations | 0.1 | 0.1 | yes | no | cosmetic |
| unit_temperatures | 0.1 | 0.1 | yes | yes | M6 |
| waves | 0.1 | 0.1 | yes | no | M13 tile effects |
| clouds | 1 (then = age cloud_interval) | 1 (then = age cloud_interval) | yes | yes | M10 |
Order of execution inside a step = row order above. Note: because a behaviour fires at most once per simulation step (step = 0.02 s at x1 under the assumed fixed step), intervals below the step length (0.01) fire every step.

### Content: tile effect (cosmetic) table
Decorative sprite effects drawn on tiles; no gameplay impact. The pick on a tile is by tile-type lookup, weight = rate (wave_normal = 100, all others 1), then roll `chance`, then all 8 neighbours must be allowed types.
| effect id | chance | allowed tile types |
|---|---|---|
| wave_normal | 1.0 | close_ocean, deep_ocean, shallow_waters |
| wave_mermaid, wave_dolphin, wave_tentacle, wave_shark_fin | 0.05 each | close_ocean, deep_ocean |
| wave_bubbles | 0.05 | close_ocean, deep_ocean, shallow_waters |
| lava_effect | 0.8 | lava3, lava2 |
| flower_effect, candy_effect | 0.1 | flower_*, candy_* |
| enchanted, paradox, desert, celestial, singularity, corrupted, infernal, wind (savanna), birch, maple, permafrost, swamp, sand, mountain (hills, mountains), soil (soil_low/high), clover, garlic (infernal sprite), crystal, jungle, mushroom, lemon, grass (birch sprite), wasteland, rocklands | 0.3 each | the biome's low and high top tiles (sand: sand; mountain: hills, mountains; soil: soil_low, soil_high) |

### Content: world ages (eras)
Columns: rate = relative weight (used by the age wheel UI/random pick; not by the cycle), yrs = [min,max) duration years (default 35-55), cloud = cloud_interval s (default 15), clouds = weighted cloud list, biomes = favoured biome set for bonus growth (M8), bio+ = bonus_biomes_growth (tiles factor added to 5), temp = temperature_damage_bonus (default 1), loy/op = bonus_loyalty / bonus_opinion (all cities/kingdoms), default slots = slot numbers used in new-world population.
| id | yrs | cloud s | clouds | favoured biomes | bio+ | temp | loy/op | other flags / special effect |
|---|---|---|---|---|---|---|---|---|
| age_hope | 35-55 | 25 | normal | grass | 0 | 7 | +15/+15 | global unfreeze; light age; light-damage flag; default slots 1,3,5,6 |
| age_sun | 35-55 | 15 | normal | desert, savanna | +3 | 15 | +5/+5 | no vegetation growth (grow_vegetation false); fire spread x2; global unfreeze incl. mountains; fire elemental on fire stop 1% (law other-disasters); drought every 7 s; sun overlay/particles; light-damage |
| age_dark | 35-55 | 15 | normal | corrupted | -2 | -4 | -5/-5 | night flag; crops do not grow; ranged weapons x0.5; global unfreeze; default slots 2,7 (linked) |
| age_tears | 35-55 | 20 | rain ×5, lightning ×1, normal ×2 | swamp, mushroom, jungle | +5 | 1 | 0/0 | rain particles (stops fire spread); world rain + thunder + hydrophobic damage every 5 s; global unfreeze; default slots 2,7 (linked) |
| age_moon | 35-55 | 15 | rain ×5, normal ×5 | crystal | 0 | -3 | 0/0 | moon flag (night-only moon traits), darkness overlay, global unfreeze; default slots 2,7 |
| age_chaos | 35-55 | 15 | rage | infernal | 0 | 1 | -55/-35 | chaos flag; enraged units may become demons (law other-disasters); global unfreeze incl. mountains; light-damage |
| age_wonders | 35-55 | 15 | magic ×5, normal ×1 | enchanted, candy | 0 | 1 | 0/0 | light age; magic particles; global unfreeze incl. mountains; default slots 2,7 (linked) |
| age_ice | 30-40 | 20 | snow | permafrost | -20 | 5 | 0/0 | global FREEZE; winter flag (biome growth off); crops do not grow; hydrophobic damage + frost ruins every 10 s |
| age_ash | 35-55 | 15 | ash (cloud interval field 15) | (none) | -4 | 1 | -25/-10 | ash particles; global unfreeze |
| age_despair | 30-40 | 16 | snow | permafrost, corrupted | -2 | 3 | -10/-10 | global FREEZE; winter + night flags; crops do not grow; ranged x0.5; snow turns babies to ice creatures (law other-disasters); hydrophobic damage + frost every 10 s; condition list [dark, ice]; `force_next` = hope (not used by the cycle code) |
| age_unknown | - | - | - | - | - | - | - | placeholder in a slot: resolved to a random real age when it becomes current; default slots 4,8 |
Unused fields: `conditions` (lists of ages that may precede it) and `force_next` are stored in the data but never read by the cycle logic; the cycle is purely slot-order. Overlay alpha, particles and light colours are cosmetic.

### Content: world laws
All laws are boolean world switches; players can toggle most. Default shown. A "group" is the tab it appears in. Groups (all ids): harmony, diplomacy, civilizations, units, mobs, spawn, nature, trees, plants, fungi, biomes, weather, disasters, other.
| id | group | default | what it toggles |
|---|---|---|---|
| world_law_grin_reaper | harmony | off | M13 grin reaper kills a random grin-marked unit each tick when no UI window is open |
| world_law_gaias_covenant | harmony | off | World becomes non-destructive: damage-driven tile decrease/increase ignored (except life/explodable tiles), heat tile conversions (heat > 30 effects) disabled, fires cannot spread, grey goo cannot spread, seed-grass helper action disabled |
| world_law_civ_limit_population_100 | harmony | off | City population capped at 100 (also caps max population at min(housing,100)) |
| world_law_gene_spaghetti | units | off | when a creature genome is generated each gene is replaced by a random normal gene with 77.7% chance |
| world_law_mutant_box | units | off | new subspecies get 1-3 extra random spawn traits and births get extra mutation traits |
| world_law_hunger | units | on | starvation damage applies to unfed units |
| world_law_old_age | units | on | units die naturally of old age (immortal trait exempt) |
| world_law_glitched_noosphere | civilizations | off | new cultures/languages/etc. get 3-5 random starting traits instead of 1-2 |
| world_law_terramorphing | civilizations | on | biome-spreading buildings spread their biome (M8) |
| world_law_kingdom_expansion | civilizations | on | allows the "expand kingdom" decision when the kingdom has no enemies |
| world_law_angry_civilians | civilizations | off | civilians fight members of own/allied species instead of ignoring them |
| world_law_civ_babies | civilizations | on | civilised species may reproduce |
| world_law_civ_migrants | civilizations | on | M13 migrants |
| world_law_civ_army | civilizations | on | cities field armies (shows/uses army cap) |
| world_law_diplomacy | diplomacy | on | wars/diplomacy active; turning off stops all wars and attacks immediately |
| world_law_rites | diplomacy | on | plots of the "rite" kind allowed |
| world_law_rebellions | diplomacy | on | rebellion plots allowed |
| world_law_border_stealing | diplomacy | on | a kingdom may take over border zones of another |
| world_law_peaceful_monsters | mobs | off | monster kingdoms do not seek enemies (turning on stops monster attacks) |
| world_law_animals_babies | mobs | on | wild animals reproduce |
| world_law_forever_tumor_creep | mobs | off | creep never decays when hubs die (M13) |
| world_law_animals_spawn | spawn | on | M13 wild unit spawn, rat spawn, life-seed fauna |
| world_law_clouds | spawn | on | ordinary (normal) clouds spawn |
| world_law_drop_of_thoughts | spawn | off | life-seed fauna spawn has 50% chance to pick a sapient species from the biome |
| world_law_vegetation_random_seeds | nature | on | M9 random vegetation seeds and life-seed vegetation |
| world_law_roots_without_borders | nature | off | building placement ignores biome-tag restrictions |
| world_law_grow_minerals | nature | on | M9 mineral growth |
| world_law_erosion | nature | on | M7 coastal erosion |
| world_law_spread_density_high | nature | off | per-zone flora limits x1.5 |
| world_law_grow_grass | biomes | on | M8 natural biome spread |
| world_law_biome_overgrowth | biomes | on | M8 biomes may overrun other biomes |
| world_law_forever_lava | weather | off | lava never moves/cools |
| world_law_forever_cold | weather | off | frozen tiles never thaw by the age sweep |
| world_law_disasters_nature | disasters | on | nature disasters (tornado, meteorite, earthquake, heatwave) and disaster clouds |
| world_law_disasters_other | disasters | on | other disasters, fire elementals, rage demons, ice babies, explosive-law effects |
| world_law_rat_plague | disasters | off | contagious effect can spread among crowded units (rat plague) |
| world_law_evolution_events | other | on | monolith buildings trigger evolution events |
| world_law_spread_trees / _fungi / _plants | trees / fungi / plants | on | M9 flora spreading per category |
| world_law_spread_fast_trees / _fungi / _plants | trees / fungi / plants | off | spreading interval 10 s instead of 50 / 30 / 40 |
| world_law_entanglewood | trees | on | non-flying units standing on a tree tile move at half speed |
| world_law_bark_bites_back | trees | off | chopping a tree has 20% chance to turn it into a living tree creature |
| world_law_exploding_mushrooms | fungi | off | stepping on a fungus triggers a small explosion (radius 5, grenade option) |
| world_law_plants_tickles | plants | off | 30% chance a unit stepping on a plant is "surprised" |
| world_law_root_pranks | plants | off | 20% chance a unit stepping on a plant is stunned |
| world_law_nectar_nap | plants | off | 10% chance a unit stepping on a flower falls asleep for 10 s |
| world_law_cursed_world | (none; hidden premium) | off | cannot be turned off once on; unlocks cursed items; turned on by the "forbidden knowledge" start option |
Also each age id carries a hidden per-world "enabled" flag (default true) managed by the age UI.

### Content: disasters
Selection and gating are described in M12. Pool weight = rate. "min C / min P" = minimum number of cities / total units in the world. "allowed ages" empty = any age; "forbidden" removes ages. Type: Nature needs law disasters_nature, Other needs disasters_other (mad_thoughts, greg and the unit-spawn disasters are type Other; type defaults to Other).
| id | type | rate | chance | min C / min P | allowed ages | forbidden ages | effect |
|---|---|---|---|---|---|---|---|
| tornado | Nature | 3 | 0.5 | 3 / 100 | tears, ash, chaos, wonders, moon | - | tornado effect spawned at a random tile |
| heatwave | Nature | 4 | 0.5 | 0 / 0 | sun | - | 1-2 random ground islands: ignite all 8 neighbours of a random tile |
| small_meteorite | Nature | 5 | 0.5 | 3 / 400 | - | hope, sun | meteorite at random tile (explosion: damage 500, explode_strength 1, radius per projectile) |
| small_earthquake | Nature | 3 | 0.4 | 5 / 400 | - | hope, sun | earthquake (SmallDisaster type) centred on a random tile |
| hellspawn | Other | 2 | 0.9 | 5 / 300 | chaos | - | spawn 2-5 demons (max 5 alive) on a random ground island |
| ice_ones_awoken | Other | 2 | 0.9 | 5 / 300 | despair, ice | - | spawn 10-20 cold ones (max 5 alive) |
| sudden_snowman | Other | 3 | 0.9 | 5 / 100 | ice | - | spawn 20-40 snowmen (max 5 alive) |
| garden_surprise | Other | 1 | 0.9 | 5 / 800 | sun, wonders | - | at a city windmill: super-pumpkin hub building + 50-100 small pumpkin units (max 5 alive) |
| dragon_from_farlands | Other | 1 | 0.9 | 10 / 3000 | chaos, dark, despair | - | spawn 1 dragon (max 1 alive) at a left- or right-edge zone centre |
| ash_bandits | Other | 1 | 0.9 | 10 / 700 | ash | - | spawn 15-30 bandits (max 10 alive) on a random ground island |
| alien_invasion | Other | 1 | 0.9 | 10 / 1500 | moon | - | spawn 5-10 UFOs (max 1 alive) at a left/right edge |
| biomass | Other | 1 | 0.9 | 10 / 700 | ash | - | biomass hub in a city + 20-30 bioblobs (max 10 alive) |
| tumor | Other | 1 | 0.9 | 10 / 700 | moon | - | tumor hub in a city + 20-30 tumor monsters (max 10 alive) |
| wild_mage | Other | 1 | 0.8 | 5 / 400 | - | hope | 1 evil mage (max 1 alive) |
| underground_necromancer | Other | 2 | 0.9 | 4 / 200 | dark, despair | - | necromancer at a city mine + 5-24 skeletons (max 1 necromancer) |
| mad_thoughts | Other | 2 | 0.7 | 5 / 150 | - | hope, wonders | random city with pop >= 50: each unit 20% chance to gain madness |
| greg_abominations | Other | 1 | 0.5 | 3 / 1000 | despair | - | 30-55 "greg" units at a mine; only if a debug option is on |
Each successful disaster writes a log entry (disaster_* ids, see world log). For the unit-spawn disasters the spawned units are adults, carry starting equipment and a spawn visual plays.

### Content: clouds
| id | tint (hex) | max alpha | speed tiles/s | drop id | periodic actions | disaster flag | light |
|---|---|---|---|---|---|---|---|
| cloud_rain | #5D728C | 0.8 | 1-4 | rain | drop every 0.05 s | no | no |
| cloud_rage | #FF3030 | 0.8 | 1-4 | rage | drop 0.05 s | yes | yes |
| cloud_lightning | #445366 | 0.8 | 1-4 | rain | drop 0.05 s + 1% lightning chance every 0.05 s | yes | no |
| cloud_acid | #17D41C | 0.8 | 1-4 | acid | drop 0.05 s | yes | no |
| cloud_lava | #D17119 | 0.8 | 1-3 | lava | drop 0.05 s | yes | yes |
| cloud_fire | #D14219 | 0.8 | 1-3 | fire | drop 0.05 s | yes | yes |
| cloud_snow | #B8FFFA | 0.8 | 1-4 | snow | drop 0.05 s | yes | no |
| cloud_ash | #C6B077 | 0.8 | 1-4 | ash | drop 0.05 s | yes | no |
| cloud_magic | #C976CC | 0.8 | 1-7 (small sprites) | magic_rain | drop 0.05 s | yes | yes |
| cloud_normal | white | 0.5 | 2-6 | life_seed | drop every 2 s | no ("normal cloud": needs law clouds) | no |
Sprites: big (3 variants) for storm clouds, small (2) for magic, all 5 for normal. Cloud lifespans: drift until x > map width. Disaster-flagged clouds need law disasters_nature. cloud_lava and cloud_fire are never in a standard age list (available to player powers).

### Content: terraform options
Option fields not listed are off. dmg = building/unit damage; str = explode_strength; heat = add_heat.
| id | key switches |
|---|---|
| flash | flash only (default option) |
| nothing | no-op |
| draw | flash, thaw |
| remove | flash, destroy buildings, thaw |
| destroy | flash, destroy buildings |
| destroy_no_flash | destroy buildings, clear scorch |
| destroy_life | destroy buildings of the creep hubs (tumor, super pumpkin, biomass) only, flash, remove borders, kill tornadoes |
| tumor_attack | flash, destroy buildings except tumor faction, thaw |
| grey_goo | destroy buildings, flash, remove borders, thaw |
| road | flash, destroy buildings of type "nature" only, thaw |
| water_fill | flash, destroy buildings (except geyser, volcano, acid geyser), thaw, extinguish |
| lava_damage | flash, damage buildings 100, thaw |
| remove_lava | remove_lava flag |
| earthquake, earthquake_disaster | ruin buildings, strip top tiles, strip roads, thaw, ocean steps down, remove_lava |
| grenade | flash, damage buildings 50, force push 1.5, shake, explode tiles (str 1), random fire, pixel explosion, thaw, kill tornado, attack type explosion |
| bomb (clone of grenade) | dmg 100, str 3 |
| meteorite | dmg 1000, str 1 |
| meteorite_disaster | dmg 500, str 1 |
| ufo_explosion | grenade, spares "aliens" faction |
| atomic_bomb (clone of bomb) | dmg 10000, str 1, wasteland transform, hits very high flyers, no shake, nuke visual |
| czar_bomba (clone of bomb) | dmg 10000, str 4, wasteland, high flyers, no shake |
| crabzilla_bomb (clone of bomb) | dmg 10000, str 1, high flyers, nuke visual |
| crab_bomb | grenade variant, spares crab factions, building dmg 30, set fire, no shake |
| crab_laser (bomb clone) | dmg 200, str 1, shake 1, fire attack type |
| santa_bomb | bomb copy |
| demon_fireball | grenade variant, spares demons, building dmg 30, set fire, no shake |
| plasma_ball | grenade variant, no shake, building dmg 30 |
| torch | grenade variant, spares demons, building dmg 25, set fire, fire attack type |
| assimilator_bullet | flash, thaw, spares assimilators |
| cannonball | grenade variant, building dmg 0, force push 2, no shake |
| acid, acid_ball | grenade variants, building dmg 0, str 2, force push 0.5, no fire, acid attack type |
| lightning_power | flash, lightning rules, scorch, heat +9, dmg 77, set fire, force push 2.5, shake, thaw |
| lightning_normal | as above without heat/shake, dmg 47 |
| madness_ball | force push 0.2, gives the madness trait, flash, thaw |
| ufo_attack | flash, scorch, dmg 50, set fire, force push, shake, damage buildings, thaw |
| dragon_attack | flash, scorch, force 0.5, dmg 25, set fire, shake, damage buildings, thaw, fire attack |
| zombie_dragon_attack | as dragon_attack without fire, acid attack |
| crab_step | flash, building dmg 10, force push, explode tiles (str 1, no pixel fx), tiny shake, thaw |

### Content: map sizes
| id | size units | side tiles | chunks per side | zones (8-tile) per side |
|---|---|---|---|---|
| tiny | 2 | 128 | 8 | 16 |
| small | 3 | 192 | 12 | 24 |
| standard (default) | 4 | 256 | 16 | 32 |
| large | 5 | 320 | 20 | 40 |
| huge | 6 | 384 | 24 | 48 |
| gigantic | 7 | 448 | 28 | 56 |
| titanic | 8 | 512 | 32 | 64 |
| iceberg | 9 | 576 | 36 | 72 |
(large and above show a performance warning in the original UI.)

### Content: map generation templates
Value legend: P1/P2/P3 = Perlin stages enabled (stage scales default 5 each, editable 0-30); edges = round or square falloff or mountain wall; centre = center-gradient land; ring = ring effect; shapes = random-shape count; extras. All templates also default to random_biomes on, add_vegetation on, add_resources on unless stated. Replace = Perlin-replace passes (all templates that have one use scale 15 and `n > 170: soil_high -> soil_low`, additional options listed).
| id | stages | edges | centre / other height ops | ring | shapes | other flags | replace passes beyond the default |
|---|---|---|---|---|---|---|---|
| continent | P1 P2 P3 | round | centre gradient | yes | 5 | freeze mountain tops | - |
| box_world | P1 P2 P3 | mountain wall | centre gradient | yes | 5 | freeze mountain tops | - |
| islands | P1 P2 P3 | round | - | yes | 5 | freeze mountain tops | - |
| toast | P1 P2 P3 | square | centre gradient | - | 5 | remove mountains | - |
| pancake | P1 P2 P3 | round | centre gradient | - | 0 | remove mountains | - |
| boring_plains | P1 P2 P3 | mountain wall | centre gradient | - | 0 | remove mountains; low/high-ground options locked | (n>0: shallow_waters -> soil_low, close_ocean -> soil_low, deep_ocean -> soil_high) i.e. all water becomes land |
| checkerboard | none | - | - | - | 0 | special chunk checkerboard (soil_high/soil_low with two random biomes); mountain wall; remove mountains; only biome/vegetation/resources editable | - |
| cubicles | none | - | - | - | 0 | special rooms (cubicle_size 2, editable 2-15); mountain wall; remove mountains | - |
| dormant_volcano | P2 only | round | force height 125, centre gradient; random_biomes off | - | 0 | - | - |
| cheese | P2 only | square | force height 120, centre gradient | - | 0 | remove mountains | extra passes at scale 15: n>170: soil_high -> shallow_waters and sand -> shallow_waters; n>150: soil_high -> sand; n>130: soil_low -> sand; n>80: soil_high -> soil_low (holes in the cheese) |
| bad_apple | P1 | round | centre gradient + centre depression/mountain-ring op | - | 0 | - | - |
| donut | P2 only | round | force height 125, centre gradient, centre lake | - | 0 | - | - |
| lasagna | P1 | square | centre gradient, low ground | - | 5 | - | - |
| chaos_pearl | P1 | round | centre gradient, low ground | - | 0 | - | - |
| anthill | none | - | all mountains, special rooms and tunnels | - | 0 | special anthill; only biome/vegetation/resources editable | - |
| empty | none | - | - | - | 0 | no generation steps (every tile stays height 0 = deep ocean); no reset button | - |
Editable generation settings (UI "gen_*" ids): gen_perlin_scale_stage_1/2/3 (integer 0-30), gen_random_shapes (0-40), gen_cubicles_sizes (2-15); boolean switches: gen_random_biomes, gen_mountain_edges, gen_add_vegetation, gen_add_resources, gen_add_center_lake, gen_add_center_land, gen_round_edges, gen_square_edges, gen_ring_effect, gen_low_ground, gen_high_ground, gen_remove_mountains, gen_forbidden_knowledge (premium + achievement gated). Numeric settings step by 1 (5 with a modifier key) and wrap around min/max. Each template allows editing only the settings its flags enable (anthill/checkerboard/cubicles/empty restrict most).

### Content: world log (message ids and triggers)
Messages are appended to a persistent history (display capped at 2000 entries) with a timestamp, up to three text parameters, an optional colour per parameter, an optional unit/kingdom reference and a map location the player can jump to. Message text is localised; where an id has `variants` several phrasings exist and one is picked by timestamp modulo the variant count.
| id | group | variants | trigger (who raises it) |
|---|---|---|---|
| king_new | kings | 1 | defined but never emitted by the current code |
| king_left | kings | 1 | a kingdom's ruler leaves/abdicates |
| king_dead | kings | 1 | ruler dies without a known killer |
| king_killed | kings | 3 | ruler dies and the last attacker is a living actor |
| favorite_dead | favorite_units | 3 | a player-favourited unit dies of non-attack causes |
| favorite_killed | favorite_units | 3 | a favourited unit is killed by an attacker |
| city_new | cities | 1 | a new city is founded |
| log_city_revolted | cities | 1 | defined, never emitted |
| city_destroyed | cities | 1 | a city is destroyed |
| diplomacy_war_started | wars | 1 | war declared between two kingdoms |
| diplomacy_war_ended | wars | 1 | war ends |
| alliance_new / alliance_dissolved | (none) | 1 | alliance created / dissolved |
| kingdom_new / kingdom_destroyed | kingdoms | 1 | kingdom created / destroyed |
| kingdom_shattered / kingdom_fractured | kingdoms | 3 | defined, never emitted |
| kingdom_royal_clan_new / _changed / _dead | clans | 3 | royal clan assigned / replaced / extinct in a kingdom |
| auto_tester | - | 1 | automated test harness text |
| disaster_tornado, disaster_meteorite, disaster_hellspawn, disaster_earthquake, disaster_greg_abominations, disaster_ice_ones, disaster_sudden_snowman, disaster_garden_surprise, disaster_dragon_from_farlands, disaster_bandits, disaster_alien_invasion, disaster_biomass, disaster_tumor, disaster_heatwave, disaster_evil_mage, disaster_underground_necromancer, disaster_mad_thoughts | disasters | 1 | the matching disaster in M12 succeeded; location = disaster tile; parameter 1 = spawned unit name where applicable, parameter 2 = city name (necromancer, mad thoughts) |
Colours: neutral for creations, warning for deaths/destruction/war/disasters, good for peace and revolts.

## Interactions

Interfaces between the world layer and other systems (all described as data flow; the other systems are specified elsewhere):
- Clock -> everything: `elapsed` per step and world_time. Yearly rollover triggers ageing of every unit, city and kingdom exactly once per year change; month 12 once per year triggers history/graph snapshots; month 4 is a "monolith month" flag read by monument logic.
- Tile queries used by units/AI: effective type (walk multiplier, liquid/ground/layer for passability, damage-on-contact flag + damage, step-action + chance, food resource + nutrition for foraging, `grass`/`soil`/`can_be_farm`/`can_build_on` for city planning, `road` for movement bonus 1.5), fire flag (burn status transfer), frozen flag, biome id (spawn lists, traits, light/cold damage), height only during generation.
- Units -> world: walking on a tile fires that tile's step action with its chance; units dying on corrupted tiles leave a ghost; burning units ignite tiles; units standing on trees/plants/fungi trigger the law-gated flora reactions (half speed, stun, sleep, explosions).
- Cities / buildings -> world: city borders are zones; any non-Ground layer change recomputes borders; city farm planning reads can_be_farm / farm_field; fields that fall outside a city's plan decay (M9); roads of road-using cultures are protected from decay; buildings supply flora spread (spread_chance / spread_steps / spread_ids / limit_per_zone), minerals, creep hubs and biome spreaders; wheat reacts to rain and to eras; buildings on tiles whose type changes become ruins or are destroyed (M1).
- Kingdoms / diplomacy: age bonus_loyalty and bonus_opinion are summed into every city loyalty and every kingdom-to-kingdom opinion; law switches (diplomacy, rebellions, border stealing, kingdom expansion, rites) gate these systems.
- Species/ecology: biome tables drive wild spawns (life-seed drops, unit_spawn behaviour) and which biome a species counts as home; ages change unit stats (recomputed on every age change) and trigger status effects (burning, frozen, rage, cough, ash fever, enchanted, cursed, slowness).
- Powers / player: drops (rain, snow, fire, lava, acid, life seed, seeds of each biome, bombs) and terraform options are the player's interface to the world; bomb tiles (tnt etc.) chain via explosions; world laws and age slots are player-editable; heat/cold powers modify unit temperature counters.
- Pathfinding: movers query regions/islands (M14): island equality tells whether any route exists, the region path gives a corridor, layer types decide walkable (Ground), swimmable (Ocean), forbidden (Block, Lava unless immune); lava flow, freezing of shallow water and terraforming therefore change reachability after <= 0.4 s of lag. City-to-city boat travel uses the ocean-island graph (island >= 2500 tiles). Spawners use ground-island picks (>= 4 regions).
- Save/load: persistent world data = tile heights/types/top types/burn/fire/frozen flags, world_time, current age id + slot list + progress + durations + speed multiplier + paused flag, world-law booleans, behaviour timers and live clouds appear not to be part of the saved world record (assumed: they restart from their intervals after load). After load the age manager re-selects the saved age (default hope if missing) without touching progress.
- Rendering/UI (ignored): minimap vs gameplay render modes flag which behaviours run; debug options can disable whole subsystems (world behaviours, unit update, city update, building update).

## Open questions

Items the source does not settle, where the spec had to assume, or where the original looks accidental. A re-implementation should make an explicit choice:
1. Fixed step length. `elapsed = fixedDeltaTime x speed multiplier`; fixedDeltaTime is never assigned in the decompiled game code (engine default assumed 0.02 s). All "per frame" figures (tiles per firing, timers) scale with it. Because the step is applied once per rendered frame, wall-clock speed depends on frame rate: at x1 and 0.02 s per step a 60 world-second year takes 3000 frames (50 s at 60 fps).
2. Parallel/interleaved ordering of sweeps is engine-dependent; behaviours are called in library order every step and each uses its own timer.
3. Random-shape and square-edge masks are image assets (not in the code); only their usage is specified. Implementers must invent shapes (soft blobs, alpha 0..1, rotated, scaled 0.3-2x, offset up to +-2 shape sizes from the centre, clamped inside the map, strength 0.7 x 255) and a 64-tile edge fade.
4. Initial placement of the "extra random shapes" third batch happens after tile typing and so only changes stored heights; it is probably vestigial. Likewise the first random-shape batch runs while heights are 0 with subtract, so it is a no-op.
5. The "center mountains" step (bad_apple) raises far terrain above 255 (clamped) -- looks accidental but is the actual behaviour (see M15 e).
6. `range_weapons_multiplier` default 1 yields +100% range in normal ages and +50% in dark/despair; sign convention unclear.
7. Age fields `conditions`, `force_next`, and `rate` are not used by the cycle. The wheel UI may use them (not inspected).
8. Behaviours with intervals shorter than the step length (0.01 s) fire once per step; the original's behaviour with larger multipliers/ticks > 1 (the x40 speed runs two simulation steps per frame) is therefore twice per frame.
9. Biome vegetation placement rules (`canBuildFrom`, biome tag matching for buildings) are owned by the building system and only referenced here.
10. Freeze-wave routine (WorldBehaviourTilesTemperatureFreezeWaves) exists but is not registered as a behaviour; treated as dead code.
11. Cloud lifetime has no maximum other than leaving the map; there is no cap beyond the effect limit of 200.
12. `tile.heat` persists in memory only for heated tiles, decays 1/s globally; whether it is saved is unclear (clear() zeroes all on world reset).
13. The tile size/units of "distance" in rain/snow/drop radii (e.g. "within 3") are in tiles; the unit finder is chunk-based (radius 1 chunk, then filtered by distance) so exact membership at chunk boundaries is approximate.
14. In the unit-spawn behaviour the unit count guard (> 3 units within the 3x3 chunk neighbourhood) uses an overlapping-chunk finder; whether the centre chunk is included is assumed.
15. Disasters `premium_only` is not read in the selection routine (appears unenforced).
16. Exact numbers for biome-specific cultural traits, building asset limits (`limit_per_zone` per flora asset), building `vegetation_random_chance`, `spread_*` per asset and explosion visuals are in other assets not covered here.
17. The sim-constants record contains many unit/city numbers (e.g. interval_happiness 2 s, interval_stamina 2 s, interval_mana 10 s, interval_nutrition_decay 15 s, unit_speed_multiplier 0.5, gravity 9.8) that belong to other specs; `nutrition_decay` timer is decremented in the world step (updateTimerNutrition) but consumed by unit code.
