# Cities, Buildings and Economy - Behaviour Spec

Clean-room behaviour description. Units: "tick" = one simulation update of an object; "seconds" = world-time seconds (delta-scaled). Unclear points are marked UNCLEAR.

## 1. City lifecycle

### 1.0 Vocabulary and constants

- **Zone**: an 8x8-tile square (64 tiles) of the map. A city owns a set of zones. Zone adjacency comes in two flavours: *4-neighbours* (left/right/up/down) and *8-neighbours* (adds diagonals).
- **Chunk**: 16x16 tiles (used for "nearby unit" scans).
- **Island**: connected landmass; many checks require "same island".
- Times: "world time" seconds advance with simulation delta; city "age" and kingdom "age" are measured in world years. Years are used by loyalty (section 10).
- A city belongs to exactly one kingdom at any time. A city with no citizens belongs to the neutral wild kingdom.
- Global world-law switches that gate behaviour (on/off toggles, defaults in brackets): kingdom expansion = new cities [on]; border stealing = a city may claim zones owned by ANY other city, ally or not, as long as the zone touches its own territory [on]; civ army = conscription [on]; population cap of 100 per city [off]; rebellions [on]; roots-without-borders (ignores biome growth tags for placement) [off]; bark-bites-back (chopped trees may wake) [off]; peaceful monsters (monsters do not create danger zones) [off].

### 1.1 City state (data a re-implementation needs)

Per city: id, name, founder id + founder species, kingdom, culture/language/religion refs (optional), leader (optional), zone list, building lists (by type id and by building id), stockpile list, storage list, citizen list (excluding boats), boat list, army ref, timers (`timer_build`, `timer_action`, `timer_build_boat`, `timer_supply`, `timer_trade`, warrior timer, capture timer), capture ticks (0..100), `being_captured_by`, a "kingdom-joined" timestamp, a "shrink" timestamp, lists of road tiles pending, cached farm tile sets, "danger zones", counters of citizens by profession, a task-count record, a job table, and a status block (below).

Status block, recomputed whenever the city is flagged dirty (units added/removed, zone added/removed, building change):
- population = number of non-boat citizens; children = number alive and baby; adults = population - children.
- housing_total = sum of `housing_slots` over all finished (not under construction) buildings of the city. housing_occupied = min(population, housing_total). housing_free = housing_total - housing_occupied (decremented by 1 each time a baby is born, until next recompute).
- houses_max (house-count cap): start from number of zones owned; if the city's culture has trait `dense_dwellings` multiply by 2, `solitude_seekers` divide by 3, `hive_society` multiply by 3; then add each owned building's `max_houses` value; truncate to integer. (Debug "unlimited houses" overrides to 9999.)
- maximum_items = 15 (equipment slots per equipment type kept by the city).
- warrior_slots = number of "attacker" job slots computed by the task planner (section 3.4); warriors_current = citizens whose profession is warrior.
- hungry/sick/male/female/housed/homeless/families counts (informational).

Housing and population limits:
- Births in a city are blocked when the city has no free housing slot (housing_free == 0), with exceptions for important persons / first child of a sexual-reproduction couple (see reproduction spec, not this one), and are blocked entirely when the 100-pop world law is on and the city has >= 100 people. `getPopulationMaximum` = housing_total, capped to 100 when that law is on.
- A breeding spot is "private" only if the city has fewer than (2 x population maximum + 10) citizens.
- `needSettlers` (does this city want incoming settlers / is it a poor source of settlers): true if city age < 5 years; false if population >= 22; false if population < 22 AND housing_free == 0 AND age > 10 years AND count of house-type buildings (including unfinished) > 2; otherwise true.

### 1.2 Founding a city (three entry paths)

All three create the city with `newCity`: the new city takes the founder's kingdom, records founder id/species, then claims the chosen zone plus every one of its 8 neighbouring zones that currently has no city (so a new city starts with up to 9 zones). It then marks the "place finder" dirty, copies culture/language/religion from the founder, computes its centre tile and generates a name from the founder.

**Path A - nomad starts a civilization** (decision `try_to_start_new_civilization`): candidate = adult, sapient, not fighting, not a king, no city; decision cooldown 30 s; weight 1; priority "high". The task first aborts if any enemy-kingdom unit is within 1 chunk (3x3 chunks) on the same island. Then fails if: the founder's kingdom is forced by a trait; the founder already has a city; the founder's current zone is not "good for new city" (below); the founder species' civilisation kingdom is not a civ kingdom. Special case: if any 4-neighbour zone of the founder's zone has a city on the same island, that city simply claims the founder's zone and no new city is founded. Otherwise: create a new civ kingdom with the founder as king, build the first city on the founder's zone, founder joins it, a default clan/language/culture are created for the founder (language only if species has advanced communication, culture only if advanced memory), and same-species units around the founder are converted into the new city/kingdom metas.

**Path B - citizen of a civ kingdom founds a city where he stands** (decision `build_civ_city_here`): adult, in a civ kingdom, has no city, no enemy within 1 chunk on same island, cooldown 60 s, weight 1. Task: abort if current zone already has a city; abort if kingdom-expansion law is off; abort if zone not good for new city; else found city in his kingdom and join it.

**Path C - king-led expansion** (decision `king_check_new_city_foundation`, cooldown 60 s, weight 3, adult, law on, kingdom has no enemies). Steps:
1. Abort if kingdom has no capital.
2. Abort if any city of the kingdom that is reachable from the capital has <= 30 citizens (a small city blocks expansion).
3. Recompute the place finder; abort if there are no possible zones.
4. Source cities = kingdom cities that have a tile, >= 30 adults and `needSettlers` false; shuffled. Abort if none.
5. For each source city (random order) look for a target zone on the same island: ring 0 = the city's neighbour zones (zones adjacent to its border) that have no city; each next ring = 4-neighbours of the previous ring that have no city and were not visited. Rings 0..3 are explored; only zones in ring 3 (the 4th ring) are candidates, and they must be good for new city for this species and on the same island; choose one candidate at random. If none, try cities that own a transport boat: choose the zone from the global possible-zone list that is nearest (squared distance) to the city and reachable and settleable for the species.
6. Found the city (Path-A style zone claim) and move up to 6 adults from the source city into it: random order; skip children, the city leader, the king, army group leaders, anyone in an army, anyone whose lover is king or leader, anyone already in the new city; also move a mover's lover and family members (counting toward the cap of 6 total).

**"Good for new city" (zone test)**: the zone must have no city; no 8-neighbour zone may have a city (when place-finder is dirty); the zone must pass the "can start city" test: no city, ALL 64 tiles are ground (i.e. no water/lava), no hill tiles; the zone centre island must have >= 300 tiles; the zone must not lie within 4 four-neighbour steps (travelling only through zones that have no city and over ground-connected regions) of any border zone of any existing city on the same island (so a 'ring 3' candidate of Path C is only valid where it is farther than that Manhattan-style distance, which mostly happens diagonally or beside other terrain); and the founder's subspecies must be able to settle the zone's biome (below). When the founder already has a city, the zone must also not be adjacent to that city's own neighbour zones.

**Biome settle check** (per zone, per subspecies): count tiles of the zone that matter for building (tile types flagged "biome check"). `soil` tiles are tallied separately. Non-biome tiles and biome tiles whose "only allowed with tag" is absent or possessed by the subspecies count as *adapted*; biome tiles whose required tag the subspecies lacks count as *not adapted*. Net soil = soil - adapted - not adapted. The zone is settleable if net soil > notAdapted, OR notAdapted <= adapted. (Direct from code; the soil subtraction looks odd but is reproduced here.)

### 1.3 Joining / migrating

- `check_join_city` / `check_join_empty_nearby_city` (decisions, cooldown 10 s, unique, moderate priority; only for citizens with no city whose kingdom is not trait-forced): the citizen enters the city whose zone he stands on if `isPossibleToJoin`, otherwise looks for the best city within range. Neutral cities can always be joined; joining a neutral city makes the city part of the joiner's kingdom (or the joiner founds a new kingdom if he has none).
- `isWelcomedToJoin(actor)`: yes if same kingdom; yes if same subspecies as the city's main subspecies; otherwise no if the city has no culture; no if city culture has `xenophobic` or the actor's culture has it; if city culture has `xenophiles`: yes if actor has no culture or the actor's culture also has `xenophiles`; else yes only if same species as the city's main species.
- `isPossibleToJoin(actor)`: false if it is already his city; true if the city is neutral; false if not welcomed; if the actor already has a city: false if he is a king or a city leader or his current city has fewer people than this city (people only move to larger-or-equal cities); else true.
- Nearby-city search range for nomads without a city: 20 tiles from the actor to the city centre; non-nomads of a different kingdom: 3x that (60). City must be on the actor's island, non-neutral, welcoming; a city of the actor's own kingdom beats a foreign one.

### 1.4 Leader

Checked in the city AI task `do_checks`, first step:
- If the city has a leader without a clan, a new clan is created for him.
- Find a leader when: the city has >= 3 citizens, has no leader, and is not being captured.
  1. Candidates from clans: scan all citizens of all cities in the kingdom that are fit to rule, are not king/leader and belong to a clan. Members of the kingdom's royal clan are preferred; otherwise any clan member. If the city has a culture the pick uses the culture's age/trait ordering; otherwise the oldest wins. The pick is moved into this city (leaving any army) and becomes leader.
  2. Else for each non-king, non-leader citizen that is in the plain "citizen" profession: roll "attribute dice" with 1 die (3 dice if the citizen is a favorite). One die = uniform integer in [0, diplomacy + warfare + stewardship]; the culture traits `patriarchy`/`matriarchy` add 999 to the maximum for males/females respectively. The highest total becomes leader.
- Leader effects: profession set to Leader, `total_leaders` counter++, a happiness event, ruler history. A leader cannot be the kingdom's king. Leader is removed on death (city.hasLeader detects dead leaders lazily). City age tick (yearly): a leader that has a clan gains +1 renown.
- Leaders (and kings) are the only citizens running the `claim_land` decision (section 2.3).

### 1.5 Capital

The kingdom picks a capital in its own `do_checks`: if the kingdom has cities and has no living capital, the capital becomes the city with the most buildings (first wins ties). Capital is cleared when the capital city leaves the kingdom/is destroyed. Capital status matters for loyalty (section 10), rebellion (the capital never rebels) and neighbour/connection checks.

### 1.6 Capture / conquest

Each time the world rebuilds its "units per zone" snapshot, every city's capture-point table and danger-zone set are cleared and then refilled: for every living unit standing in a zone owned by a city (and not inside a building/boat), if the unit's profession can capture (warrior, king, leader) it calls the city's conquest hook: a unit of a civ kingdom gives +1 point to its own kingdom if that kingdom is the city's own kingdom or is at war with it. Separately, any unit whose kingdom counts as a danger source, is an enemy of the city's kingdom, and (if it is a civ unit) can capture, marks the zone it stands on as a *danger zone* of that city (peaceful-monsters law suppresses this for monsters). A city with >= 1 danger zone is "in danger" and will not start construction. Watch towers also give their own kingdom 10 points per finished tower at every capture step. The capture logic runs every 0.1 s of world time:

1. Dominating kingdom = the kingdom with the most points in the current snapshot (first one wins ties).
2. If nobody has points: capture ticks drop by 0.5; at 0 the capture state resets.
3. Defenders present = own-kingdom points > 0 and city has at least one warrior. If `being_captured_by` is dead it is cleared.
4. Capture ticks DROP by 1 if the city's own kingdom dominates, or if defenders are present and the own kingdom is the only party present.
5. Otherwise, the dominating kingdom must be an enemy of the city's kingdom, and (if defenders are present) capture ticks must already be at least 5 - else nothing happens this step. If there is no current capturer, or it is the same dominator: ticks += 1 + 1 * elapsed_seconds (so ~1.0x+ per 0.1 s -> ~10-11 per second of world time), and the capturer is set. If a different capturer is already set and the dominator is an enemy of it: ticks -= 0.5. Otherwise (allies of the capturer) ticks += 1 + elapsed.
6. When ticks reach 100, capture completes.
- "Is being captured" = at least one party other than the own kingdom has points. Being captured blocks building, leader selection and warrior conscription.
- Xenophobic unit special case: a xenophobic civ unit of another species standing in the city does not add capture points; instead, if none of the city's citizens are standing inside the city's own zones, all citizens are removed from any army and from the city, and the leader is removed (the city dies of emptiness).

**On capture completion** (`finishCapture`): reset capture; recompute neighbours; the winner's kingdom gets a "new city captured" happiness bump. The city normally joins the winner. Exception: look through the winner's wars that include the city's old kingdom and where the two are on opposite sides (total wars are ignored); stop searching (winner takes it) at the first such war in which the winner is itself a main attacker or main defender. In a war where the old kingdom was the attacking side, candidate = that war's main defender; where it was the defending side, candidate = main attacker; the candidate must not be destroyed. If the candidate borders the city (is in the city's neighbour-kingdom set) it wins the city; else if the winner borders the city the winner takes it; else the candidate takes it. Finally, if the candidate's species differs from the old kingdom's species, the winner takes it instead. If a rebellion-type war has the joiner as main attacker against the city's old kingdom, no "new conquest" timestamp is recorded; otherwise the joiner's `timestamp_new_conquest` = now (feeds loyalty). Then the city switches kingdom (section 1.7) with "was conquered" bookkeeping (conquest counters++, units get a "was_conquered" happiness event), and all warriors of the city lose warrior status and its army is disbanded.

### 1.7 Switching kingdom

`setKingdom`: marks kingdom lists dirty; if the city was a capital, that kingdom's capital is cleared; stores kingdom; remembers `last_kingdom_id` (unless neutral). Full switch (conquest, rebellion, join): remove from the previous kingdom (capital cleared if needed), set new kingdom, move every citizen and boat to the new kingdom (kings of the old kingdom among them trigger "king left"; citizens receive a happiness event), set the city's "joined kingdom" timestamp = now, recolour all city buildings to the new kingdom, mark zone drawing dirty, and tell the new kingdom it captured from the old one (diplomacy relation lookup). `makeOwnKingdom(actor, rebellion?)`: remove from kingdom, remove leader, create a new civ kingdom whose king is `actor`, force all units into it (happiness event `just_rebelled` for rebellion or `kingdom_fell_apart`), copy culture/language/religion from the previous kingdom to the new one.

### 1.8 Neutralisation, abandonment, destruction

- Every frame after unit refresh: any non-wild-kingdom city with 0 citizens switches to the neutral kingdom and all its buildings are set to the neutral kingdom.
- `border_shrink` task (runs even for empty cities): if the city has no citizens, and at least 3.0 world-seconds passed since its last shrink, one random border zone (a zone of the city adjacent to a non-city zone) is removed; timestamp reset.
- A city is removed (destroyed) when it owns zero zones: leader removed, army disbanded, zone owners cleared, citizens' city cleared, equipment list cleared, removed from its kingdom (clearing capital); city/culture/kingdom/language/religion lists are marked dirty; "city destroyed" stat++.
- Abandoned zones: whenever zones change the city is flagged; the next abandon check (world frame) runs a flood fill from every non-dock building through zones of the city (zones must have ground; connectivity is through ground regions). Zones not reached by any building are removed. If the flood fill finds two or more disconnected areas, the largest area is kept and all zones of every smaller area are removed. A city without buildings skips this check.
- Buildings standing in a zone that has no city become *abandoned* (owned by the "abandoned" wild kingdom): if they cannot be abandoned (bonfire type) they become ruins (or are destroyed if the asset has no ruin state); under-construction ones are destroyed. Other city buildings stay as abandoned shells until a city claims their zone again; when the city building lists are rebuilt, every usable city-building inside a city's zones is re-owned by the city's kingdom.
## 2. Zones and borders

### 2.1 Zone ownership

- A zone has at most one owner city. Adding a zone to a city first removes it from its previous owner. Any add/remove marks the city status dirty and the "place for new cities" map dirty, and recomputes the city's centre.
- Removing a zone flags the city for an "abandoned zone" re-check (section 1.8) and clears the zone's owner.
- **Border zones** of a city = zones the city owns that have at least one 8-neighbour not owned by the city. **Neighbour zones** = those non-owned 8-neighbours. **Neighbour cities** = owners of neighbour zones (split into same-kingdom neighbours and other-kingdom neighbours; the set of foreign kingdoms is also kept). Recomputed with the status block.
- **City centre point** (used for distances): average of all owned zone centres, then snap to the owned zone whose centre is closest to that average; the point is that zone centre shifted +2 in y (render units). If the city has no zones the centre is "in the void".
- **City main tile** (spawn point/anchor for most logic): the tile of the city's bonfire if it has one; else the tile of the highest-`priority` non-dock building on non-ocean ground (random among buildings when scanning, ties keep the first found); else the centre tile of the first owned zone that is not ocean. If none, the city has no main tile (many behaviours then skip it). Zones are kept sorted by squared distance of their centre tile to the main tile at each status recompute.
- Two cities "nearby border" each other if any 8-neighbour of any zone of the smaller one belongs to the other.
- Two cities are "connected via kingdom" if there is a chain of same-kingdom neighbour-city links from the capital to the city, searched breadth-first for up to 30 rings (give up after).
- Zone range constant: **13** zones (debug cheat makes it unlimited).

### 2.2 Claiming new zones (border growth)

Only a king or a city leader grows borders (they alone carry the `claim_land` decision). Decision parameters: moderate priority, cooldown 60 s (also applied when launch conditions fail), weight = 2 + 0.02 x stewardship stat (stewardship/5 x 0.1). Launch condition: the unit has a city and `canGrowZones` is true: growth system enabled, the city is not flagged for abandoned-zone recheck, and the city has at least one citizen.

Task `claim_land` (holds a flag hand tool), in order:
1. **Pick a target zone.**
   - Start a breadth-first wave from the zone of the city main tile, up to 13 rings (wave number) plus an optional bonus range. Rings are measured in 4-neighbour steps; additionally a candidate zone must lie within a Euclidean radius of 0.75 x 13 = 9.75 zones (comparison on squared distance <= 95.06) from the main-tile zone, else the wave does not expand *through* it (a zone just outside the radius is still recorded as visited and can be chosen by the 30% branch below, but is never expanded).
   - A zone is skipped (not entered) if it belongs to another city (in normal mode), has zero ground tiles, or if the actor's subspecies cannot settle its biome (section 1.2). Zone-to-zone movement is only allowed through ground-connected map regions (water splits the wave). The wave stops as soon as a claimable zone has been found in the current ring.
   - Claimable zone = (the leader's subspecies can settle the biome) AND (it has no city, OR it belongs to another city and the border-stealing law is on).
   - Choice: with probability 0.7 pick (randomly) a 4-neighbour of a random border zone that is claimable, on the same island as the main tile and within the 9.75-zone radius (first match in random order; if none, the task fails). With probability 0.3 pick a random claimable zone from the set visited by the wave (fail if none).
   - Fail (end the task) if there is no target or the target already belongs to the city.
2. Walk to the zone: the zone centre tile if it is on the actor's island, else a random tile of the zone on the actor's island; fail if impossible.
3. Perform 21 repetitions of: flip direction, a jump animation (0.5 s up/0.5 s down units), spawn a border-marker visual. (Total about 21 jump cycles; exact seconds depend on animation timing, UNCLEAR.)
4. Claim: re-validate (zone still claimable by the city, settleable by the actor's subspecies, and at least one 4-neighbour of the zone belongs to the city; otherwise stop with no effect). Add the zone to the city. If the actor's culture has trait `expansionists` (or fast-growth debug option) AND the zone was previously ownerless, also claim every 8-neighbour zone that has no city and still passes the same validation. The claimer gains loot = 5 coins (`coins_for_zone`), spawns a marker effect, and the job ends.

### 2.3 Border shrink and zone loss

- Empty city (0 citizens): one random border zone removed every >= 3 world-seconds (section 1.8).
- Zones can be taken by an enemy only through the claiming path above when the border-stealing law is on. There is a defined "border steal" city action (for each of up to 3 attempts: pick a random building of the city, look at the 4-neighbour zones of its zone, take the first one that belongs to an enemy-kingdom city and contains no civ buildings), but it is NOT scheduled in the city's default AI cycle - treat it as dormant.
- When a zone leaves a city, buildings in it become abandoned (section 1.8).
## 3. City AI (jobs and tasks)

### 3.1 Scheduler

Each city owns an AI object. Per city update (every frame, even when paused for the timers listed first):
1. Always: `timer_build`, `timer_supply`, `timer_trade`, warrior timer count down by elapsed seconds. If status flagged dirty, recompute status; if citizen list flagged dirty, regroup citizens by profession.
2. If the world is paused stop here. Otherwise `timer_build_boat` counts down; then if `timer_action` > 0 it counts down, else the AI executes ONE action step; then "single tasks" tick; then the capture update (section 1.6).
3. A city AI job named `city` is cycled forever. Its task list in order: `check_army`, `wait1`, `do_checks`, `wait1`, `border_shrink`, `wait1`, `produce_boat`, `wait1`, `supply_kingdom_cities`, `wait1`, `produce_resources`, `wait1`, `check_farms`, then repeat. A task is a list of actions executed one per AI step; an action returns *continue* (go to next action), *stop* (abort the task), or *restart*. Actions are skipped (task stopped) when the city has no zones or no citizens, except `border_shrink` (always runs).
4. Wait actions set `timer_action` to a random real number: `wait1` -> uniform [0,1] s; `wait5` -> exactly 5 s. Inside `do_checks` the pauses are uniform [0.1, 1.0] s.
5. One extra "single task" runs in parallel: `build`, with interval 0 (every frame) - the action itself throttles to once per 5 s (below). Cities start with this single task attached.
6. A one-shot action list `do_initial_load_check` (just `check citizen tasks`) is run when a city is force-initialised (e.g. after loading).

### 3.2 Task catalogue (city AI)

| Task | Actions (in order) |
|---|---|
| `nothing` | none |
| `wait1` | random wait 0..1 s |
| `wait5` | wait 5 s |
| `random_wait_test` | three waits of 5..10 s (test only) |
| `do_checks` | check leader, wait(0.1..1), check attack zone, wait(0.1..1), check citizen tasks, wait(0.1..1) |
| `do_initial_load_check` | check citizen tasks |
| `check_army` | check army |
| `border_shrink` | border shrink |
| `produce_boat` | produce boat |
| `supply_kingdom_cities` | supply kingdom cities |
| `produce_resources` | produce resources |
| `check_farms` | check farms |
| `build` (single) | build |

Rough full-cycle time: 6 waits at mean 0.5 s + 3 do_checks waits at mean 0.55 s ~ 4.7 s plus one frame per action.

### 3.3 City actions

**check army**: if the city has no warriors, nothing. Drop the army reference if the army died. If the city has warriors but no army, create a new army led by a random warrior.

**check leader**: see 1.4.

**check attack zone** (military target selection): validate the current target city: invalid if dead, if the city has no warriors, if its kingdom is no longer an enemy, or if it is unreachable from this city. Clear target city/zone if invalid; clear the target zone if it no longer belongs to the target city. If the city already holds an attack-zone order, stop. If there is no target: only proceed if the city has an army AND army size / max warriors >= 0.7; then pick the enemy-war city (from the wars of this kingdom) that is reachable and has the smallest squared distance between city centres. Set the target city; target zone = zone of a random building of the target (or a random own zone if the target has no buildings).

**check citizen tasks**: the job planner, see 3.4.

**border shrink**: see 1.8.

**produce boat**: stop if `timer_build_boat` > 0 (initial 10 s) or the city has no finished docks. Choose a random finished docks building; its component builds a boat (below); the boat joins the city's kingdom and city; `timer_build_boat` = 10 s. Boat building rules: pick a random boat type allowed by the dock (fishing dock: fishing only; full docks: fishing, trading, transport) mapped to the city's species-specific boat actor; abort if that dock already has a boat of that type (max 1 per type per dock); abort if the city lacks the boat's resource cost; abort if the dock has no valid ocean tiles (it recomputes; a dock with none destroys itself); pick a random dock ocean tile whose water body is large enough for docks; spawn the boat there; pay the cost (section 8).

**supply kingdom cities** (resource balancing between cities of a kingdom): requires culture, kingdom with more than 1 city, `timer_supply` <= 0, and at least one stockpile. Take one random usable stockpile; collect resource slots whose amount exceeds that resource's `supply_bound_give`. For each other city of the kingdom in random order, for each such resource in random order: if the other city's total of that resource is below the resource's `supply_bound_take`, move `supply_give` units from this city to a random stockpile of the other city; then set `timer_supply` = 30 s x leader's `multiplier_supply_timer` stat (if a leader exists), minimum 10 s; and stop after the first transfer. (Constants per resource in section 6.)

**produce resources** (crafting): see section 6.4.

**check farms**: see section 3.6 (farm tile cache, also recomputed with every status recompute).

**build**: see section 4.

### 3.4 Citizen job planner (`check citizen tasks`)

Run every cycle in `do_checks`. Output: a table `jobs[job] = number of slots`, plus the current "occupied" count (citizens currently holding each job).

Inputs/aggregates computed first:
- `occupied` rebuilt from citizens' current job.
- `citizens_left` = adult population.
- Task counters scanned over the city's zones: **fires** = fires burning in its zones plus fires in neighbour zones that have no city; **trees** = tree buildings in zones (counted only if some stockpile has room for wood); **minerals** (mineral-type buildings, always counted); **ruins** (ruin buildings, always); **bushes** (buildings in the food set that still have a harvestable resource, counted only if a stockpile has room for berries); **plants** (flora buildings, counted only if room for herbs); **hives** (buildings in the *food* set with something to collect, counted only if room for honey; implementation scans the same set as bushes - UNCLEAR whether hives are in that set); **poops** (manure, only if room for fertilizer); **farm_fields** (field tiles without a building), **wheats** (field tiles with fully grown wheat), **farms_total** (all field tiles); **roads** = 1 if the city has road tiles pending, else 0. "Room" means some usable stockpile holds less than that resource's `storage_max` (default 50; berries/honey/herbs 100).
- Food stock = sum of food in all storages. Herb/fruit/honey gatherer cap: food > 100 -> 1; > 60 -> 4; > 40 -> 5; <= 20 -> 10; 21..40 -> 7. Woodcutter cap: 1 if the city holds > 15 wood else 3.
- Fire-fighter cap: if fires > 0 and the city is NOT "under danger fire" (leader immune to fire counts as not in danger; danger means fires > 0 and leader not immune) then cap = 2 if the city has <= 5 citizens else 3; otherwise cap = number of fires.
- Warriors are needed only if the civ-army law is on, adults > 15 and the food check passes (always true). Possible warriors = floor(adults x army multiplier), where army multiplier = species `civ_base_army_multiplier` (default 0.35) + leader `army` stat + leader `warfare` stat x 2/100.

Allocation loop: repeat rounds until the citizens are exhausted (safety stop after 2 x adults rounds). In each round, for each job in the listed order, if `current slots < task cap` and (no job cap or `current slots < job cap`), add the per-round amount, limited by remaining citizens:

| Order | Job | Added per round | Task cap | Job cap | Requires |
|---|---|---|---|---|---|
| 1 | fireman | up to fire cap at once | fire cap | - | - |
| 2 | builder | 1 | 3 | - | a building under construction |
| 3 | gatherer_bushes | 1 | bushes | herb cap | a finished storage building |
| 4 | gatherer_herbs | 1 | plants | herb cap | storage |
| 5 | gatherer_honey | 1 | hives | herb cap | storage |
| 6 | farmer | 1 | farmable ground tiles around the windmill | - | a windmill |
| 7 | farmer | 1 | farms_total (only if the current world era lets crops grow) | - | windmill |
| 8 | miner_deposit | 1 | minerals | - | storage |
| 9 | woodcutter | 1 | trees | wood cap | storage |
| 10 | miner | 1 | 5 | - | a mine building |
| 11 | attacker | 2 | possible warriors | - | warriors needed |
| 12 | road_builder | 1 | roads | 1 | - |
| 13 | cleaner | 1 | ruins | 1 | - |
| 14 | hunter | 1 | 1 | - | storage |
| 15 | manure_cleaner | 1 | poops | 3 | storage |

`warrior_slots` in the status = slots given to attacker.

### 3.5 Assigning a citizen to a job (`find_city_job` decision and city.setCitizenJob)

Decision `find_city_job`: needs a city, being on the city's island, the city having any slot at all, the citizen able to work (adults always; non-adults: yes if their culture has `tiny_legends`; no if it has `youth_reverence`; otherwise yes once at least 8 years old - `child_work_age`), and (city population <= 30 or the citizen is not a warrior). Cooldown 50 s, priority high; weight 2 (1 if hungry, 0.3 if starving).

Selection order, first success wins:
1. If the city is not being captured, warrior timer expired, the citizen is a plain civilian, the city holds > 10 gold, then try to conscript (below).
2. Else try high-priority jobs in order: fireman (only if citizen not fire-immune), builder.
3. Else, if the city has no food at all: try the "no-food" jobs: gatherer_bushes, gatherer_herbs, gatherer_honey.
4. Else walk the normal job list (gatherers, farmer, hunter, woodcutter, miner, miner_deposit, road_builder, cleaner, manure_cleaner; not attacker) starting after the last-tried index (round-robin), taking the first job that has a free slot; kings may not take farmer/miner/miner_deposit; leaders may not take those either.
A job is free if slots > 0 and occupied < slots. Taking it increments occupied and sets the citizen's job.

Conscription: not possible if army full (warriors >= attacker slots), if baby, or culture trait `conscription_male_only` (females excluded) / `conscription_female_only` (males excluded). On success: profession warrior, gets a weapon from the city stock if he has none and understands items. Next-conscription timer = 15 s - leader warfare/2 (min 1 s); halved if the city has a barracks. A warrior is demoted (timer 30 s) when the army is over its slot limit.

A job is released (citizen stops) when occupied > slots (checked by the `check_end_job` task at the end of cycles).

### 3.6 Farm cache

On every status recompute and in `check_farms`: if the city has a windmill, scan the map chunks of the region of the windmill and its neighbouring regions; for zones owned by this city, for each tile within squared distance 81 (radius 9 tiles) of the windmill tile: tiles whose terrain type can be farmed are "places for farms"; tiles of type "field" are farm fields; fields holding a wheat building are crops. Fully grown wheat (max growth stage) forms the "grown wheat" set.

### 3.7 Citizen behaviours that serve city jobs

Unit job `unit_citizen` loops `make_decision` then `check_city_destroyed` (ends job and drops warrior status if the city vanished). When the citizen holds a city job the job-specific loop runs. Each job ends with `end_job` or `check_end_job`. Details (durations are waits/animations in seconds):

| Job | Task sequence |
|---|---|
| fireman | `put_out_fire`: find fire zone, walk, find closest fire tile, walk, jump 1s, extinguish, wait 1-2 s |
| hunter | random move, `do_hunting`: find nearest meat-giving non-same-kingdom animal in a 3-chunk radius, age >= 3, walk to it, attack; then deliver resources |
| builder | `try_build_building` -> `build_building` (section 4.3) |
| cleaner | `cleaning`: find ruin, walk, 0.3 s, 3 hammer swings + 1 final, remove ruin, deliver |
| manure_cleaner | `manure_cleaning`: find manure, walk, 5 gather beats of 1 s, extract (gives fertilizer), deliver, repeat until job-restart limit 6 or starving-with-food |
| road_builder | `build_road`: find a pending road tile, walk, 0.2 s, 3 swings + 1 final, create road tile (+1 coin), 1-2 s wait, repeat (restart limit 10) |
| woodcutter | `chop_trees`: find tree, walk, 7 chop beats of 1 s, extract (wood), deliver |
| miner_deposit | `mine_deposit`: find mineral, walk, 6 beats, extract, deliver, repeat (limit 3) |
| gatherer_bushes | `collect_fruits`: find fruit building (restart limit 5), 4+1 beats, extract (berries..), deliver |
| gatherer_herbs | `collect_herbs`: same with vegetation buildings (restart limit 4) |
| gatherer_honey | `collect_honey`: hive (restart limit 3) |
| miner | `mine`: find a mine building, walk, stay inside 10-15 s, mine roll (see 6.3), exit, wander, wait 1-2 s, repeat (limit 3) |
| farmer | cycle: `farmer_make_field`, `farmer_plant_crops`, `farmer_harvest`, `farmer_fertilize_crops`, `farmer_random_move`, `check_end_job`, `check_city_destroyed` (details in 6.2) |
| attacker | `make_decision` (warrior decisions, see war spec) |

"Deliver" (`addActionsForDeliverResources`): only if the unit carries resources: wait 0.7-1.2 s; find the nearest usable storage on the same island (for wheat, a windmill first); walk next to it; look; 0.1 s animation; throw ONE item at a time into the building (animation duration = distance clamped to [1,1.5] s; each thrown item gives the unit loot = that resource's `loot_value`, default 1) with a 0.2 s wait, stepping back until the inventory is empty; wait 0-0.2 s.
`BehCheckNeeds(n)` at the end of gather loops: stop the loop if the restart count reached n, or if the unit is starving and the city has any food (so he can go eat).

Other city decisions for citizens (priority/cooldown/weight):
- `store_resources` (high, 5 s, 3.1): carrying resources, city has a finished storage, and (not a warrior or inside own borders).
- `try_to_eat_city_food` (high, 10 s, 2.6): hungry citizen, city has food suitable for his diet (section 6.5).
- `give_tax` (high, 90 s, 2.55): inside own city borders and loot >= 5 (kingdom loot minimum).
- `generate_loot` (moderate, 60 s, 1.5): civ citizen with a house: stay in house 2-6 s then gain loot (section 7.2).
- `city_idle_walking` (low, 5 s, 0.5) when the city has zones; `try_to_return_to_home_city` (moderate, 15 s, 3, adult, has city, outside own borders and island); `try_to_take_city_item` (moderate, 180 s, 1.5, city has any stored equipment); `make_items` (moderate, 90 s, 0.4, has house, in own borders, city has strategic resource > 10); `stay_in_own_home` (low, 15 s, 0.5, has house, happiness ratio <= 0.5, 20% roll); `find_house` (any citizen without a house takes the first finished building in the city with a free resident slot, else a family member's house by evicting a same-family resident; gains the house's `housing_happiness` as a happiness event).
## 4. Building placement, construction, upgrades, ruins

### 4.1 When a city builds

The `build` single task runs every frame but acts only when ALL hold: the city's build timer is <= 0; the building system is enabled; the city is not being captured; the city is not "in danger" (no enemy danger zones). When it acts it sets the build timer to 5 s (0.2 s in the fast-upgrade debug mode) and runs one *build tick*:

1. **Roads (only if the city has more than 2 buildings and its culture has trait `roads`)**: pick one random building; if the city has no pending road tiles and that building is road-eligible and not on liquid, connect it with up to two other road-eligible buildings on the same island: for each of the two closest (other) road-eligible buildings, compute a land path between the two tiles (roads allowed); skip when both ends are already on the same road network or when the path is longer than 20 tiles; the non-road tiles of the path are queued as the city's "pending road tiles" (cleared as soon as they become road). Road builders (max 1 job) consume them.
2. If the city is "under danger fire" (fires burning in its zones/neighbour zones and the leader is not fire-immune): stop.
3. **Only one construction at a time**: if any building of the city is still under construction, remember it and stop.
4. Compute the list of candidate build orders (4.2). If the affordable list is empty stop. Pick ONE affordable order uniformly at random.
5. If the order is an *upgrade*: choose a random existing building of that order's building id and try to upgrade it (4.5). Else try to place a new building (4.3). 
6. (Fast-construction debug completes it instantly.)

### 4.2 Build orders (templates) and candidate filter

Each species (see section 11) has a *build order template* (an ordered list of orders). Each order has: `id`, `limit_type` (max buildings of that building *type* in the city, 0 = unlimited), `required_pop`, `required_buildings` (number of buildings the city must already own), `check_house_limit`, `check_full_village`, `min_zones`, `upgrade` flag, `requirements_orders` (other orders whose building must exist), `requirements_types` (building type ids that must exist and be finished). An order resolves to a concrete building id through the species' architecture (section 11), e.g. `order_house_0` -> `house_human_0` for humans.

An order is a candidate when ALL of these pass (using `count` = buildings of the order's building *type id* including unfinished ones):
- `min_zones` == 0 or city zone count >= `min_zones`.
- If `check_house_limit`: `housing_free` must be <= 10 AND `count` < status.houses_max.
- If `limit_type` != 0: effective limit = `limit_type` plus culture bonuses (watch towers: + value of culture trait `tower_lovers` (4) + leader stat `bonus_towers`; statues: + value of `statue_lovers` (4)); `count` must be < effective limit.
- If `check_full_village`: housing_free must be 0 (no shipped order uses this).
- population >= `required_pop`; number of city buildings >= `required_buildings`.
- Every `requirements_orders` entry: the city owns at least one building of that order's asset, OR of any asset reachable by following `upgrade_to` from it (e.g. a requirement on `house_0` is met by `house_1`...); fails if the chain ends without finding one.
- Every `requirements_types` entry: the city has a *finished* building of that type.
- If the order is an upgrade: the city owns at least one building of the order's building id. If it is a normal order for a dock: a valid dock tile must exist (4.4).
Candidates are then split by whether the city can pay the cost (wood/stone/common metals/gold, section 7); a cost-short candidate is dropped from this tick. Quirk: for an *upgrade* order this affordability test uses the cost of the building being upgraded (the order's own building), whereas the upgrade itself (4.6) then requires and spends the cost of the *target* building; if the target is dearer the attempt silently fails that tick.

Build order templates (`limit,pop,bldgs` = limit_type, required_pop, required_buildings; "U" = upgrade order; reqO = required orders; reqT = required types; houseLim = check_house_limit; minZ = min_zones; blank = 0/none). All orders listed in evaluation order, but the pick is uniform among those valid.

**`build_order_basic`** (default civ template, used by all simple civ species not listed elsewhere):
| # | Order | limit | pop | bldgs | other | reqO | reqT |
|---|---|---|---|---|---|---|---|
| 1 | bonfire | 1 | | | | | |
| 2 | stockpile | 1 | | | | | |
| 3 | hall_0 | 1 | | | | bonfire | |
| 4 | house_0 | none | | | houseLim | bonfire | |
| 5 | watch_tower | 1 | 30 | 10 | | bonfire, hall_0 | |
| 6 | temple | 1 | 90 | 20 | minZ 20 | bonfire, hall_0, statue | |
| 7 | statue | 1 | 70 | 15 | | | hall |
| 8 | well | 1 | 20 | 10 | | | hall |
| 9 | mine | 1 | 20 | 10 | | | bonfire, hall |
| 10 | library | 1 | 50 | 15 | | | bonfire, hall |
| 11 | docks_0 | 5 | | 2 | | bonfire | |
| 12 | U docks_0 | | | | | docks_0 | |
| 13 | windmill_0 | 1 | 6 | 5 | | bonfire | |
| 14 | barracks | 1 | 50 | 16 | minZ 20 | | bonfire, hall |
| 15 | training_dummy | 3 | 50 | 16 | minZ 20 | | barracks |

**`build_order_basic_2`**: same as basic but WITHOUT `statue` and `well`; `temple` requires only bonfire + hall_0; `mine` requires reqT bonfire+hall (as written above, no reqO). Used by: cold_one, necromancer, plague_doctor, evil_mage, fire_skull, demon, angle, snowman, alien civs.

**`build_order_advanced`** (human, orc, elf, dwarf):
| # | Order | limit | pop | bldgs | other | reqO | reqT |
|---|---|---|---|---|---|---|---|
| 1 | hall_0 | 1 | | | | bonfire | |
| 2 | bonfire | 1 | | | | | |
| 3 | stockpile | 1 | | | | | |
| 4 | house_0 | none | | | houseLim | bonfire | |
| 5 | tent | none | | | houseLim | bonfire | |
| 6 | U tent | | | | | tent | |
| 7 | U house_0 | | | | | hall_0, house_0 | |
| 8 | U house_1 | | | | | hall_1, house_1 | |
| 9 | U house_2 | | | | | hall_1, house_2 | |
| 10 | U house_3 | | | | | hall_2, house_3 | |
| 11 | U house_4 | | | | | hall_2, house_4 | |
| 12 | U hall_0 | | 30 | 8 | | house_1 | |
| 13 | U hall_1 | | 100 | 20 | | statue, mine, barracks | |
| 14 | windmill_0 | 1 | 6 | 5 | | bonfire | |
| 15 | U windmill_0 | | 40 | 10 | | | |
| 16 | docks_0 | 5 | | 2 | | bonfire | |
| 17 | U docks_0 | | | | | docks_0 | |
| 18 | well | 1 | 20 | 10 | | | hall |
| 19 | mine | 1 | 20 | 10 | | bonfire, hall_0 | |
| 20 | barracks | 1 | 50 | 16 | minZ 20 | hall_1 | |
| 21 | training_dummy | 3 | 50 | 16 | minZ 20 | | barracks |
| 22 | watch_tower | 1 | 30 | 10 | | bonfire, hall_0 | |
| 23 | temple | 1 | 90 | 20 | minZ 20 | bonfire, hall_1, statue | |
| 24 | statue | 1 | 70 | 15 | | hall_1 | |
| 25 | library | 1 | 50 | 15 | | | bonfire, hall |
| 26 | market | 1 | 60 | 15 | | | bonfire, hall |

Notes: (a) the requirement lines are *as implemented* where a later "reqO/reqT" belongs to the order just above it. (b) "U X" upgrades one existing X building into its `upgrade_to` building (4.5). (c) House limit means each house order is only valid while free housing <= 10 and the count of house-type buildings (tents included) < houses_max, so houses are built only when the city is nearly full. (d) Orders whose building type has count >= limit are dropped, e.g. one hall at a time.

### 4.3 Placing a new building

Given the chosen order's building asset:
1. Re-check resources; abort if short.
2. Choose a target tile:
   - **training dummy**: pick a random finished barracks; collect free, buildable tiles in the ring adjacent to its footprint (wave 1) and the ring adjacent to those (wave 2); pick a random wave-2 tile (fail if none).
   - **docks**: the dock tile finder (4.4).
   - otherwise, if the asset has `prefer_replace_house` (the bonfire): look through the city's buildings in random order for a house-like building (has housing slots) whose `priority` is <= the new asset's priority and whose tile passes the placement test; use that tile. (So a bonfire can be built over a house.)
   - otherwise build the candidate zone list: every city zone for which: if the asset is "single" the zone and its 8 neighbours contain no civ buildings; if the asset is "batch" no zone among the zone and its 8 neighbours holds a civ building flagged "single" that belongs to this city; if the asset is "borders" the zone is adjacent (8-neighbour) to a zone not owned by the city.
   - If candidate zones exist: if the asset is "center" (windmill) first try zone-centre tiles only; if that gave nothing (or asset is not "center") run the general search: iterate candidate zones in random order; skip a zone when the culture has a special town plan and the city is not tiny (tiny = housing_total < 10 AND zones < 20; tiny cities ignore plans) and the plan does not allow the zone (plans are zone predicates keyed by culture traits, see 4.7); the tile inside the zone depends on the culture's layout: *Random* (default): a random valid tile of the zone; *CenterTile* (culture trait `city_layout_the_grand_arrangement`): the zone centre tile only; *Moonsteps* (`city_layout_tile_moonsteps`): the tile 3 above the zone centre when (zone x + zone y) is even else 3 below the centre; *CenterTileDrunk* (`city_layout_tile_wobbly_pattern`): zone centre, but with 60% probability swapped for a random 8-neighbour tile of it if that is valid. For docks, always random tile. Among zones that produce a tile, take the one nearest (squared distance) the city main tile - unless the culture has `buildings_spread` (or there is no main tile) in which case the first success is taken.
   - If the asset needs farm ground (windmill): the chosen tile's map region and each neighbouring region within a city-owned chunk are scanned and the number of farmable ground tiles must exceed 30; otherwise abandon the placement.
3. Create the building at that tile. If it has a construction stage it is marked "under construction". Pay the cost (take wood, gold, stone, common metals from storages in that order). Remember it as the city's building under construction. Count `housesBuilt` stat.
4. A new building without a construction stage is immediately complete.

**Tile validity (`canBuildFrom`)** for building B at tile T for city C (a `fundament` is the footprint: left/right/top/bottom extents around T; width = left+right+1, height = top+bottom+1):
- If the species' main subspecies is adaptation-restricted and B is a city building with adaptation checks, every footprint tile of a "biome" terrain type that demands a subspecies tag must be a tag the subspecies has (also T itself).
- Every footprint tile must exist on the map; must be on the same island as the city main tile (docks excepted); must belong to a zone owned by C; if B is `only_build_tiles` the terrain must allow building; if biome growth tags are on and the world law "roots without borders" is off, B's growth tags must overlap the terrain's tags (city buildings have none, so pass); liquid terrain is rejected unless B can be placed on liquid; B with `destroy_on_liquid` cannot sit on ocean; the tile must pass the tile-level `canBuildOn(B)` (existing buildings/blocking terrain rule; ruins are replaceable by assets that remove ruins).
- If B demands a free neighbourhood (`check_for_close_building`, default true for city buildings, false for bonfire) and the placement is a new build: the one-tile band left of the footprint, right of the footprint, and two tiles below the bottom row and two tiles above the top row must not contain any usable city building (outside-map counts as occupied).
- Docks: footprint must contain at least one suitable ocean tile (good for a new dock) and no ground tile, and at least one footprint tile must touch a ground tile on the city's island.

### 4.4 Dock site finder

Needs the species' dock asset (`docks_<architecture>` for the species). Iterate city zones in random order; a zone qualifies if it contains liquid tiles, its map chunk has more than one region, and some ocean region in the chunk is "good for a new dock". Within a qualifying zone pick the first random ocean tile where the dock asset passes tile validity. Docks cost no stone at stage 1 (fishing docks), see table.

### 4.5 Construction by builders

- A building flagged "under construction" has progress counter 0. The progress required to finish: bonfire 30, stockpile 10, well 200, training dummy 100, mine 300, everything else 50. Finishing happens when progress > required (strictly greater).
- Builders: job `builder` (up to 3 builder slots while something is under construction). Task `try_build_building` finds the city's unfinished building; then `build_building` repeats: if still unfinished, pick a construction tile (a random tile of the building; for docks a tile of a neighbouring zone's dock-site), walk there, then do 5 rounds of [check still unfinished, look at it, hammer animation, add progress]; each progress add = 2 + the builder subspecies' `construction_speed` stat (>= 2). The hit that finishes the building gives the builder 6 coins of loot (`coins_for_building`). After 5 rounds the task restarts.
- Construction stage effects: unfinished buildings add no housing, cannot be upgraded, cannot house residents; storage checks use finished buildings for "has storage".
- Housing buildings with no construction stage (house_0..5 of the 4 classic races, hall_1, hall_2, windmill_1) are complete when placed or upgraded.

### 4.6 Upgrades

Upgrade attempt: the building must be finished, owned by a civ kingdom (for city buildings) and flagged `can_be_upgraded`; the target asset is its `upgrade_to`. The city must hold the target's *full* construction cost. If the footprint changes, the new footprint must still be valid at the same origin. On success: swap asset instantly, re-run its stats, restore full health, refill tiles, mark zone dirty; then pay the cost. Upgrade chains (humans; other classic races identical with their ids): tent -> house_0 -> house_1 -> house_2 -> house_3 -> house_4 -> house_5; hall_0 -> hall_1 -> hall_2; windmill_0 -> windmill_1; fishing_docks -> docks. Generated (non-classic) architectures can only upgrade fishing docks to docks.

### 4.7 Town plans (culture trait zone masks)

A culture trait in group `town_plan` supplies a predicate over a candidate zone (zone grid coordinates x,y; c = the city's centre zone; zone distance `d` = Euclidean distance in zone units). A culture may hold several plan traits; a zone is allowed only if ALL pass. Trait id -> predicate:

| Trait id | Zone allowed when |
|---|---|
| city_layout_architects_eye | (distance from the MAP centre zone) mod 2 >= 1 (concentric rings around the map centre) |
| city_layout_rings | (distance from the city centre zone c) mod 2 >= 1 |
| city_layout_madman_labyrinth | Perlin noise at (0.7 x, 0.7 y) > 0.4 |
| city_layout_honeycomb | (x + (2 if y is even else 0)) mod 4 == 0 |
| city_layout_bricks | x even AND (x + y) mod 3 != 0 |
| city_layout_raindrops | y even AND (x + y) mod 3 != 0 |
| city_layout_cross | |x - cx| <= 1 OR |y - cy| <= 1 |
| city_layout_claws | (x + y) mod 3 != 0 |
| city_layout_pebbles / stone_garden / titan_footprints | x mod s >= 1 AND y mod s >= 1 with s = 3 / 4 / 5 |
| city_layout_silk_web / iron_weave / monolith_mesh | x mod s < w OR y mod s < w with (s, w) = (2,1) / (3,1) / (4,2) |
| city_layout_royal_checkers | (x div 2 + y div 2) is even (integer division) |
| city_layout_diamond | (x + y) is odd |
| city_layout_parallels | y even |
| city_layout_pillars | x even |

The trait `buildings_spread` belongs to the same group but is not a mask: it disables the "nearest to city main tile" preference in 4.3.

### 4.8 Ruins, abandonment, destruction

- A building at 0 health becomes *ruins* if its asset has a ruin state (else it is destroyed); ruins at 0 health are destroyed. Ruined buildings belong to the "ruins" wild kingdom. Under-construction buildings that are destroyed vanish.
- Ruins of fishing docks (flag `auto_remove_ruin`) and non-civ ruins auto-remove 300 s after becoming ruins; civ ruins stay until a cleaner removes them.
- Cleaner (`cleaning`): targets ruins AND abandoned buildings in the city's zones (first zone, in random order, that has any); destroys the target; unit receives 1 wood if the ruin's asset cost wood > 0, 1 stone if cost stone > 0 (tree-type ruins give 1 wood), and 1 coin of loot; ruins count (`ruins` task counter) feeds the `cleaner` slot (max 1).
- Buildings in zones lost by a city are abandoned (1.8). A dock that stands on ground or whose city has only 1 building takes 1000 damage each update (self-destructs); a dock with no valid ocean tiles destroys itself.
- Tile placement rule: a new building may replace ruins on a tile when its asset has `remove_ruins` (default true).
## 5. Building table

Source: the building asset table. Every building has `id`; below only gameplay-relevant attributes are listed (art, sounds, shadows are omitted). Defaults for all *city buildings* (template): footprint/size as listed, health 1500 unless listed, construction progress needed 50, can be abandoned (all except bonfire), road-eligible (`road`), placement `batch` (see 4.3) unless listed otherwise, adaptation check on, kingdom-coloured, burnable, damaged by tornado/acid/lava, `destroy_on_liquid`, `only_build_tiles` and `check_for_close_building` true (bonfire: no close-building check). Default `has_construction_stage` = yes; exceptions listed in 5.2.

**Columns**: Size = footprint width x height in tiles (from left/right/top/bottom extents; the building origin tile is the bottom-centre-ish anchor: `left` tiles to its left, `right` to its right, `top` above, `bottom` below). Cost = wood(W) stone(S) common-metals(M) gold(G). HS = housing slots. Hap = `housing_happiness` (happiness event amount when a citizen takes it as home). Loot = `loot_generation` coins per `generate_loot` visit. MaxH = `max_houses` (adds to city house cap). Book = book slots. Pri = `priority` (picks the city main tile; larger wins; bonfire replaces buildings with priority <= its own). Prog = construction progress needed. Flags: single/batch/center/borders/farms/replace = placement rules from 4.3.

### 5.1 Shared (race-neutral) city buildings

| id | type | HP | Size | Cost | HS | MaxH | Pri | Prog | Flags / notes |
|---|---|---|---|---|---|---|---|---|---|
| bonfire | type_bonfire | 1500 | 5x3 | free | - | 3 | 120 | 30 | replace (may overwrite a house), no close-building check, not abandonable (becomes ruins), batch off, produces biome food (5.3), is the city main tile |
| stockpile | type_stockpile | 1500 | 7x6 | free | - | - | 100 | 10 | storage; stockpile (resources are delivered here); burnable |
| stockpile_fireproof | type_stockpile | 1500 | 7x6 | free | - | - | 100 | 10 | as stockpile but fireproof (used by evil_mage and demon architectures) |
| well | type_well | 1500 | 5x2 | S20 M1 G5 | - | 3 | 21 | 200 | |
| statue | type_statue | 1500 | 3x3 | S5 G25 | - | 3 | 27 | 50 | |
| mine | type_mine | 1500 | 5x3 | G15 | - | - | 50 | 300 | single placement (zone and neighbours free of civ buildings); miners work inside it (6.3) |
| training_dummy | type_training_dummies | 1500 | 1x1 | W5 G5 | - | 3 | 23 | 100 | placed within 2 tiles of a barracks; burnable |

### 5.2 Classic race buildings (human; orc, elf, dwarf are identical with ids `*_orc_*`, `*_elf_*`, `*_dwarf_*`)

All use the `kingdom colour` and civ group of their race. Exceptions to the default flags are in Notes. "Prog" 50 unless stated.

| id | type | HP | Size | Cost | HS | Hap | Loot | MaxH | Book | Pri | Upgrade to | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| tent_human | type_house | 50 | 5x3 | W1 | 3 | 5 | 1 | - | - | - | house_human_0 | burnable; has construction stage; batch |
| house_human_0 | type_house | 100 | 3x3 | W5 | 3 | 6 | 1 | - | - | - | house_human_1 | burnable; NO construction stage (instant); upgraded from tent |
| house_human_1 | type_house | 150 | 3x3 | W4 | 4 | 7 | 2 | - | - | - | house_human_2 | burnable; no construction stage |
| house_human_2 | type_house | 200 | 3x3 | S5 | 4 | 7 | 3 | - | - | - | house_human_3 | stone; fireproof |
| house_human_3 | type_house | 250 | 5x3 | S10 | 5 | 9 | 4 | - | - | - | house_human_4 | fireproof |
| house_human_4 | type_house | 350 | 7x3 | S15 | 6 | 10 | 5 | - | - | - | house_human_5 | fireproof |
| house_human_5 | type_house | 400 | 7x3 | S20 M2 G10 | 7 | 11 | 6 | - | - | - | - | final level |
| hall_human_0 | type_hall | 200 | 7x5 | W10 S5 | 5 | 10 | 3 | 2 | 5 | 100 | hall_human_1 | storage; houses people; burnable; produces biome food; has construction stage; `ignore_other_buildings_for_upgrade` |
| hall_human_1 | type_hall | 400 | 7x5 | S10 M1 G20 | 8 | 15 | 5 | 2 | 5 | 100 | hall_human_2 | fireproof; no construction stage |
| hall_human_2 | type_hall | 600 | 7x5 | S15 M1 G100 | 12 | 20 | 10 | 2 | 5 | 100 | - | |
| watch_tower_human | type_watch_tower | 3000 | 3x2 | S20 M1 G5 | - | - | - | - | - | 22 | - | **single** + **borders** placement (batch off); tower: fires arrows, damage 50, knockback 1, 6 projectiles per volley, 1 target, area 1, reload 3 s (base tower defaults); fireproof; +10 capture points per capture step |
| barracks_human | type_barracks | 1500 | 7x5 | S5 M2 G15 | - | - | - | - | - | 22 | - | fireproof; halves the conscription timer |
| temple_human | type_temple | 1500 | 5x4 | S10 M2 G30 | - | - | - | 2 | - | 26 | - | fireproof |
| library_human | type_library | 1500 | 5x4 | S10 M2 G30 | - | - | - | - | 10 | 26 | - | fireproof; holds 10 books |
| market_human | type_market | 1500 | 7x5 | W10 S5 M2 G100 | - | - | - | - | - | 26 | - | burnable (no code effect found for markets beyond being a building; UNCLEAR) |
| fishing_docks_human | type_docks | 1500 | 5x5 | W10 | - | - | - | 1 | - | 20 | docks_human | **docks**: placed on water touching land; not road-eligible; fireproof; may sit on liquid; boats: fishing only; auto-removes ruins; has construction stage |
| docks_human | type_docks | 1500 | 5x5 | W10 S6 | - | - | - | 1 | - | 20 | - | upgraded from fishing docks; boats: fishing, trading, transport |
| windmill_human_0 | type_windmill | 1500 | 3x3 | W5 G5 | - | - | - | - | - | 23 | windmill_human_1 | **single + center + farms** placement; storage that accepts food only; fireproof; wheat delivery target; has construction stage |
| windmill_human_1 | type_windmill | 1500 | 3x3 | S5 M5 G30 | - | - | - | - | - | 23 | - | no construction stage |

Race differences: only the **dwarf** houses: house_dwarf_3 HS 6, house_dwarf_4 HS 8, house_dwarf_5 HS 10 (everything else equal; dwarf hall_2 has the same stats as human). Orc/elf/dwarf ids follow the same patterns (`tent_<race>`, `house_<race>_0..5`, `hall_<race>_0..2`, `windmill_<race>_0..1`, `fishing_docks_<race>`, `docks_<race>`, `watch_tower_<race>`, `barracks_<race>`, `temple_<race>`, `library_<race>`, `market_<race>`). Upgrade chains stay inside the race.

### 5.3 Generated architectures (all other civ species, ~45 architectures)

For each architecture whose template flag "generate buildings" is set (everything except human/orc/elf/dwarf), these building ids are created automatically by cloning the *human* building of the same order and changing: group = civ building, `can_be_upgraded` = false (except fishing docks, which upgrade to the architecture's docks), has construction stage = yes (every generated building, including houses, must be built), burnable = architecture setting (false for evil_mage, demon, crystal_golem), optional biome-spread. Generated ids (A = architecture id, e.g. `civ_cat`): `fishing_docks_A` (order docks_0), `docks_A` (docks_1), `house_A_0`, `hall_A_0`, `windmill_A_0`, `watch_tower_A`, `temple_A`, `library_A`, `barracks_A`. Footprint overrides: hall (7 wide x 5 tall like human), temple 5x4, watch tower 3x2, library 5x3 (smaller than human's 5x4), house/docks/windmill/barracks as human. All stats (cost, HP, housing...) otherwise equal the human equivalents, so e.g. `house_A_0`: HP 100, W5, 3 housing slots, +6 happiness, loot 1.
Shared (non-styled) buildings used by every architecture: bonfire, statue, well, stockpile (fireproof variant for evil_mage and demon), mine, training_dummy. The generated architectures therefore have no tent, no house levels 1-5, no hall levels 1-2, no windmill level 1 and no market.

### 5.4 Nature / resource buildings (neutral, `ignored by cities` unless noted; "buildings" in the engine sense)

Common behaviour: trees and plants are "flora" that spread over time (trees: up to 10 spread steps at 0.5 chance per attempt; fungi trees 0.45; flower trees 0.3; small plants 5 steps at 0.3 - parameters of the base assets; per-id variations are not enumerated), only grow on terrain whose biome tags include one of the listed tags, are limited per zone, can be burned/destroyed, give `nutrition restore` to animals eating them, and give resources when harvested by citizens (tree: chopping removes the tree, 20% chance for `become alive` trees or when the world law "bark bites back" is on to turn into a living creature instead; plant: harvested plants are destroyed; poop & mineral: removed; fruit bush: 20% destroyed, otherwise fruit hidden for 90 s; hive: honey reset to 0). Default tag "default" means the engine's zero-valued tag (the plain temperate biome; UNCLEAR which).

| id | kind | hp | resources given when harvested | grows on biome tags | max per zone | nutrition restore | notes |
|---|---|---|---|---|---|---|---|
| tree_green_1 | tree | 10 | wood x5 | default | 3 | 40 | burns; choppable; drought-sensitive |
| tree_green_2 | tree | 10 | wood x5 | default | 3 | 40 | burns; choppable; drought-sensitive |
| tree_green_3 | tree | 10 | wood x5 | default | 3 | 40 | burns; choppable; drought-sensitive |
| corrupted_tree | tree | 10 | wood x5 | corrupted | 4 | 40 | burns; choppable; may wake as a creature when chopped; drought-sensitive |
| corrupted_tree_big | tree | 10 | wood x5 | corrupted | 4 | 40 | burns; choppable; may wake as a creature when chopped; drought-sensitive |
| enchanted_tree | tree | 10 | wood x5 | green,clover,flower,garlic,maple,birch,enchanted | 4 | 40 | burns; choppable; drought-sensitive |
| swamp_tree | tree | 10 | wood x5 | swamp | 2 | 40 | burns; choppable; drought-sensitive |
| savanna_tree_1 | tree | 10 | wood x5 | savanna | 3 | 40 | burns; choppable; drought-sensitive |
| savanna_tree_2 | tree | 10 | wood x5 | savanna | 3 | 40 | burns; choppable; drought-sensitive |
| savanna_tree_big_1 | tree | 10 | wood x5 | savanna | 3 | 40 | burns; choppable; drought-sensitive |
| savanna_tree_big_2 | tree | 10 | wood x5 | savanna | 3 | 40 | burns; choppable; drought-sensitive |
| mushroom_tree | tree | 10 | wood x5, mushrooms x1 | mushroom,green | 2 | 40 | burns; choppable; drought-sensitive |
| jungle_tree | tree | 10 | wood x5, bananas x1 | jungle | 8 | 40 | burns; choppable; drought-sensitive |
| infernal_tree | tree | 10 | wood x5 | infernal | 3 | 40 | choppable |
| infernal_tree_small | tree | 10 | wood x5 | infernal | 3 | 40 | choppable |
| infernal_tree_big | tree | 10 | wood x5 | infernal | 3 | 40 | choppable |
| cacti_tree | tree | 10 | wood x5 | sand | 3 | 40 | burns; choppable |
| palm_tree | tree | 10 | wood x5, coconut x1 | sand | 3 | 40 | burns; choppable; drought-sensitive |
| desert_tree | tree | 10 | wood x5 | desert | 1 | 40 | burns; choppable |
| crystal_tree | tree | 10 | wood x5, stone x1, gems x1, common_metals x1 | crystal,rocklands | 1 | 40 | choppable |
| wasteland_tree | tree | 10 | wood x5 | soil,wasteland | 3 | 40 | burns; choppable; drought-sensitive |
| candy_tree | tree | 10 | wood x5, candy x3 | candy | 1 | 40 | burns; choppable; drought-sensitive |
| lemon_tree | tree | 10 | wood x5, lemons x3 | lemon,green | 1 | 40 | burns; choppable; drought-sensitive |
| pine_tree | tree | 10 | wood x5, pine_cones x3 | soil,green,permafrost | 3 | 40 | burns; choppable; drought-sensitive |
| birch_tree | tree | 10 | wood x5 | green,birch | 3 | 40 | burns; choppable; drought-sensitive |
| maple_tree | tree | 10 | wood x5 | green,maple | 3 | 40 | burns; choppable; drought-sensitive |
| garlic_tree | tree | 10 | wood x5 | garlic | 3 | 40 | burns; choppable; drought-sensitive |
| flower_tree_1 | tree | 10 | wood x5 | flower | 3 | 40 | burns; choppable; drought-sensitive |
| flower_tree_2 | tree | 10 | wood x5 | flower | 3 | 40 | burns; choppable; drought-sensitive |
| flower_tree_3 | tree | 10 | wood x5 | flower | 3 | 40 | burns; choppable; drought-sensitive |
| rocklands_tree | tree | 10 | wood x5 | rocklands | 3 | 40 | burns; choppable; drought-sensitive |
| celestial_tree | tree | 10 | wood x5, celestial_avocado x3, wood x100 | celestial | 1 | 40 | burns; drought-sensitive |
| celestial_tree_small | tree | 10 | wood x5, celestial_avocado x1 | celestial | 15 | 40 | burns; choppable; drought-sensitive |
| singularity_tree | tree | 10 | wood x5 | singularity | 1 | 40 | burns; choppable; drought-sensitive |
| clover_tree | tree | 10 | wood x5 | clover | 3 | 40 | burns; choppable; drought-sensitive |
| paradox_tree | tree | 10 | wood x5 | paradox | 1 | 40 | burns; choppable; drought-sensitive |
| desert_plant | plant | 10 | desert_berries x1 | desert | 3 | 10 | burns |
| crystal_plant | plant | 10 | gems x1, crystal_salt x1, common_metals x2 | crystal | 2 | 10 |  |
| candy_plant | plant | 10 | candy x1 | candy | 5 | 10 | burns |
| snow_plant | plant | 10 | herbs x1, snow_cucumbers x1 | permafrost | 4 | 10 | burns |
| green_herb | plant | 10 | herbs x1 | green,lemon,jungle | 5 | 10 | burns |
| corrupted_plant | plant | 10 | evil_beets x1 | corrupted | 5 | 10 | burns |
| jungle_plant | plant | 10 | herbs x1 | jungle | 6 | 10 | burns |
| savanna_plant | plant | 10 | herbs x1, wheat x1 | savanna | 5 | 10 | burns |
| mushroom_red | plant | 10 | mushrooms x1 | lemon,green,mushroom | 9 | 10 | burns |
| mushroom_green | plant | 10 | mushrooms x1 | lemon,green,mushroom | 9 | 10 | burns |
| mushroom_teal | plant | 10 | mushrooms x1 | lemon,green,mushroom | 9 | 10 | burns |
| mushroom_white | plant | 10 | mushrooms x1 | lemon,green,mushroom | 9 | 10 | burns |
| mushroom_yellow | plant | 10 | mushrooms x1 | lemon,green,mushroom | 9 | 10 | burns |
| flower | plant | 10 | herbs x1 | lemon,green,mushroom,enchanted | 5 | 15 | burns |
| flame_flower | plant | 10 | peppers x1 | infernal | 5 | 15 |  |
| jungle_flower | plant | 10 | herbs x1 | jungle | 5 | 15 | burns |
| wasteland_flower | plant | 10 | herbs x1 | wasteland | 5 | 15 | burns |
| swamp_plant | plant | 10 | herbs x1 | swamp | 4 | 10 | burns |
| swamp_plant_big | plant | 10 | herbs x1 | swamp | 4 | 10 | burns |
| birch_plant | plant | 10 | herbs x1 | birch,green | 5 | 15 | burns |
| maple_plant | plant | 10 | herbs x1 | maple,green | 5 | 15 | burns |
| flower_plant | plant | 10 | herbs x1 | flower,green | 5 | 15 | burns |
| garlic_plant | plant | 10 | herbs x1 | garlic,green | 5 | 15 | burns |
| rocklands_plant | plant | 10 | herbs x1 | rocklands | 5 | 15 | burns |
| celestial_plant | plant | 10 | herbs x1 | celestial | 5 | 15 | burns |
| singularity_plant | plant | 10 | herbs x1 | singularity | 5 | 15 | burns |
| clover_plant | plant | 10 | herbs x1 | clover,green | 5 | 15 | burns |
| paradox_plant | plant | 10 | herbs x1 | paradox | 5 | 15 | burns |
| poop | poops | 10 | fertilizer x1 | default | - | - | burns |
| fruit_bush | fruits | 10 | berries x3 | lemon,green,mushroom,enchanted,jungle,savanna,maple,birch,flower,garlic,clover | 1 | 30 | burns |
| wheat | wheat | 10 | wheat x1 | field | - | 20 | burns |
| beehive | hives | 100 | honey x1 | default | - | - | burns |

(Plants with no `burns` flag: crystal_plant, flame_flower. Sources: plant "vegetation"/"flower" types are the `herbs`/food collectables; `type_tree`, `type_vegetation`, `type_fruits`, `type_mineral`, `type_poop`, `type_hive` are the type ids used by gatherer searches.)

Minerals (`type_mineral`, HP 10, 1 per zone, can be destroyed, ignored by cities, spawn via biome mineral pools; removed when mined):

| id | resources given | nutrition restore |
|---|---|---|
| mineral_bones | bones x3, stone x1 | 30 |
| mineral_adamantine | adamantine x1, stone x1 | 60 |
| mineral_mythril | mythril x1, stone x1 | 40 |
| mineral_gems | gems x1, stone x1 | 70 |
| mineral_stone | stone x3 | 30 |
| mineral_metals | common_metals x2, stone x1 | 30 |
| mineral_gold | gold x20, stone x20 | 30 |
| mineral_silver | silver x1, stone x1 | 30 |

Wheat (`type_crops`): grows through stages: grow timer accumulates world seconds; stage n+1 is reached when the timer reaches 50 x (n+1) seconds (so 50, 100, 150 ...), up to the final stage (number of stages comes from art; UNCLEAR). Planted on field tiles by farmers; fully grown wheat can be harvested for 1 wheat; unless the current world era lets crops grow, each growth step has a 50% chance to destroy the crop. Fertilizer sets the crop to its final stage immediately.
Beehive (`type_hive`, HP 100): 5 housing slots for bees, honey counter 0..10 (+1 per bee visit); when it reaches 10 it becomes harvestable (1 honey x1 per `resources_given`; unit gets `honey` x1).
Fruit bush (`type_fruits`): harvestable resource regrows 90 s after being harvested.

### 5.5 Special / world buildings (not city-built)

| id | notes |
|---|---|
| golden_brain | HP 10000, nature, ignore placement checks, inhabitable by some creatures |
| corrupted_brain | HP 10000, tower: shoots `madness_ball` |
| monolith | HP 50000 |
| waypoint_alien_mold, waypoint_computer, waypoint_golden_egg, waypoint_harp | HP 10000, waypoint markers, global limit 1 each |
| flame_tower | HP 1000, tower shooting fireball; spawns `demon` units; kingdom demon; 5 housing slots |
| ice_tower | HP 1000, ice tower; spawns `cold_one` units; 5 housing slots |
| angle_tower | HP 1000, spawns `angle` units |
| tumor, biomass, super_pumpkin, cybercore | creep buildings HP 1500, spawn `tumor_monster_animal`, `bioblob`, `lil_pumpkin`, `assimilator` respectively and convert tiles to their creep top-tile |
| volcano, geyser, geyser_acid | drop spreaders: periodically spawn lava / rain / acid drops in radius 2-8 / 2-17 / 2-15 tiles |
## 6. Resources and food

### 6.1 Resource catalogue

Resource types: `Currency` (gold), `Strategic` (wood, stone, metals, gems, bones, leather, fertilizer, silver, mythril, adamantine, dragon scales), `Ingredient_Food` (wheat), `Food` (ready-to-eat items), `Ingredient` (default, unused). Every resource has these defaults unless the table overrides: per-storage-slot hard maximum 999; `produce_min` 10; `storage_max` 50 (soft: the gatherer demand test of section 3.4, see 7.1); `loot_value` 1 coin per unit delivered; `money_cost` 2 (price of one unit of food); `favorite_food_chance` 0.5; `tastiness` 1; supply bounds 30/10/10 (above which a city may give / below which another may receive / units per transfer); `give_chance` 0. Fields `trade_bound`, `trade_give`, `trade_cost`, `mine_rate`, `drop_max` exist but trade/mining do not read them (only `drop_max` 30 is used when dropping resource sprites) - treat as dead data. "nutr" = nutrition points restored on eating (nutrition is 0..100+); "health%" = fraction of max health restored; mana/stamina points; "happy" = happiness delta passed to the `just_ate` happiness event; XP = experience given. "gifts" lists the trait/status ids that may be granted with the `n` after `#` being a relative weight (UNCLEAR whether "#n" is weight; it is a suffix on the id string in the source). Gold has no food values. Diet tags decide which species may eat it (`diet_*` ids).

| id | type | nutr | health% | mana | stam | happy | XP | taste | fav-chance | diet tags | recipe (needs ALL, each x amount) | produce_min | storage_max | supply give-above / take-below / chunk | gifts on eating (chance) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| wheat | Ingredient_Food | 50 | 0.05 | 5 | 5 | 5 | 0 | 0.1 | 0.1 | diet_crops | - | 10 | 50 | 100/20/10 | - |
| bread | Food | 100 | 0.1 | 10 | 10 | 10 | 10 | 0.5 | 0.5 | diet_crops | wheat x1 | 50 | 50 | 30/10/10 | - |
| sushi | Food | 70 | 0.2 | 20 | 20 | 20 | 5 | 0.6 | 0.5 | diet_fish,diet_meat | fish,herbs x1 | 10 | 50 | 30/10/10 | traits: fast#5 (0.1) |
| jam | Food | 100 | 0.3 | 40 | 40 | 25 | 15 | 0.9 | 0.5 | diet_fruits,diet_vegetation | berries,herbs x2 | 10 | 50 | 30/10/10 | traits: regeneration#3 (0.1) |
| cider | Food | 55 | 0.25 | 25 | 25 | 20 | 10 | 0.7 | 0.5 | diet_fruits | berries x3 | 10 | 50 | 30/10/10 | - |
| ale | Food | 45 | 0.2 | 20 | 20 | 20 | 10 | 0.6 | 0.5 | diet_crops | wheat x3 | 10 | 50 | 30/10/10 | traits: poison_immune#1; status: slowness (0.4) |
| burger | Food | 100 | 0.4 | 25 | 35 | 25 | 9 | 0.85 | 0.5 | diet_meat,diet_crops,diet_vegetation | meat,bread,herbs x1 | 10 | 50 | 30/10/10 | traits: fat#1; status: slowness (0.05) |
| pie | Food | 100 | 0.4 | 35 | 25 | 25 | 10 | 0.9 | 0.5 | diet_meat,diet_crops | meat,wheat x1 | 10 | 50 | 30/10/10 | traits: fat#1; status: slowness (0.05) |
| tea | Food | 20 | 0.25 | 40 | 10 | 10 | 10 | 0.3 | 0.5 | diet_vegetation | herbs x1 | 10 | 50 | 30/10/10 | status: caffeinated (0.1) |
| berries | Food | 30 | 0.35 | 15 | 10 | 12 | 5 | 0.55 | 0.5 | diet_fruits | - | 10 | 100 | 30/10/10 | - |
| bananas | Food | 25 | 0.4 | 15 | 10 | 10 | 5 | 0.55 | 0.5 | diet_fruits | - | 10 | 100 | 30/10/10 | traits: unlucky (0.05) |
| coconut | Food | 30 | 0.45 | 15 | 10 | 15 | 10 | 0.55 | 0.5 | diet_fruits | - | 10 | 100 | 30/10/10 | status: shield#1 (0.1) |
| crystal_salt | Food | 20 | 0.2 | 20 | 10 | 10 | 5 | 0.2 | 0.5 | diet_minerals | - | 10 | 100 | 30/10/10 | traits: madness#10,strong_minded#1; status: caffeinated#3,slowness#6 (0.1) |
| desert_berries | Food | 25 | 0.35 | 15 | 10 | 12 | 5 | 0.55 | 0.5 | diet_fruits | - | 10 | 100 | 30/10/10 | traits: poison_immune#1; status: poisoned#2,slowness#2 (0.1) |
| evil_beets | Food | 25 | 0.4 | 15 | 25 | 15 | 5 | 0.1 | 0.5 | diet_vegetation | - | 10 | 100 | 30/10/10 | traits: pyromaniac#1,evil#3 (0.1) |
| mushrooms | Food | 20 | 0.4 | 15 | 15 | 15 | 5 | 0.2 | 0.5 | diet_vegetation | - | 10 | 100 | 30/10/10 | traits: madness#1,strong_minded#1,paranoid#5,content#10; status: powerup#10,slowness#3 (0.1) |
| peppers | Food | 30 | 0.4 | 25 | 15 | 20 | 5 | 0.3 | 0.5 | diet_vegetation | - | 10 | 100 | 30/10/10 | traits: fire_proof#5,fire_blood#5; status: burning (0.1) |
| herbs | Food | 25 | 0.5 | 25 | 10 | 5 | 5 | 0.1 | 0.5 | diet_vegetation | - | 10 | 100 | 30/10/10 | - |
| fish | Food | 50 | 0.3 | 25 | 10 | 15 | 5 | 0.25 | 0.5 | diet_fish,diet_meat | - | 10 | 50 | 30/10/10 | traits: tough#5,strong#5 (0.1) |
| candy | Food | 40 | 0.4 | 25 | 10 | 40 | 5 | 1 | 0.5 | diet_fruits | - | 10 | 50 | 30/10/10 | traits: fat#10,tiny#5,giant#5,bloodlust#1 (0.1) |
| worms | Food | 10 | 0.2 | 10 | 10 | -5 | 5 | 0.1 | 0.5 | diet_meat | - | 10 | 50 | 30/10/10 | - |
| snow_cucumbers | Food | 30 | 0.35 | 25 | 10 | 10 | 5 | 0.2 | 0.5 | diet_vegetation | - | 10 | 50 | 30/10/10 | traits: freeze_proof#1; status: frozen (0.1) |
| celestial_avocado | Food | 100 | 0.55 | 50 | 50 | 50 | 10 | 1.1 | 0.5 | diet_fruits | - | 10 | 50 | 30/10/10 | traits: sunblessed#1 (0.1) |
| pine_cones | Food | 15 | 0.15 | 10 | 10 | 10 | 5 | 0.1 | 0.5 | diet_crops | - | 10 | 50 | 30/10/10 | traits: freeze_proof#10,tough#1,strong#1,regeneration#1; status: frozen (0.1) |
| lemons | Food | 20 | 0.3 | 10 | 10 | 10 | 5 | 0.2 | 0.5 | diet_fruits | - | 10 | 50 | 30/10/10 | traits: eagle_eyed#5,regeneration#3 (0.1) |
| meat | Food | 60 | 0.5 | 10 | 25 | 20 | 5 | 0.5 | 0.5 | diet_meat | - | 10 | 50 | 30/10/10 | traits: tough#5,strong#5 (0.1) |
| honey | Food | 15 | 0.45 | 10 | 25 | 35 | 10 | 0.5 | 0.5 | diet_fruits,diet_flowers | - | 10 | 100 | 30/10/10 | - |
| wood | Strategic | 50 | 0.45 | 15 | 15 | 10 | 0 | 0.2 | 0.5 | diet_wood | - | 10 | 50 | 30/10/10 | - |
| stone | Strategic | 20 | 0.2 | 10 | 10 | 5 | 0 | 0.1 | 0.5 | diet_minerals | - | 10 | 50 | 30/10/10 | - |
| silver | Strategic | 35 | 0.3 | 25 | 15 | 20 | 0 | 0.4 | 0.5 | diet_minerals | - | 10 | 50 | 30/10/10 | - |
| mythril | Strategic | 45 | 0.4 | 30 | 25 | 25 | 0 | 0.6 | 0.5 | diet_minerals | - | 10 | 50 | 30/10/10 | - |
| adamantine | Strategic | 55 | 0.5 | 45 | 40 | 35 | 0 | 0.8 | 0.5 | diet_minerals | - | 10 | 50 | 30/10/10 | - |
| dragon_scales | Strategic | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.5 | - | - | 10 | 50 | 30/10/10 | - |
| common_metals | Strategic | 35 | 0.3 | 15 | 15 | 10 | 0 | 0.2 | 0.5 | diet_minerals | - | 10 | 100 | 30/10/10 | - |
| bones | Strategic | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | 0.5 | diet_minerals | - | 10 | 50 | 30/10/10 | - |
| leather | Strategic | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.5 | - | - | 10 | 50 | 30/10/10 | - |
| gems | Strategic | 35 | 0.3 | 15 | 25 | 15 | 0 | 1 | 0.5 | diet_minerals | - | 10 | 50 | 30/10/10 | - |
| fertilizer | Strategic | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.5 | - | - | 10 | 50 | 30/10/10 | - |
| gold | Currency | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.5 | - | - | 10 | 50 | 600/10/100 | - |

Special non-table values: `gold`: type Currency, maximum 999, supply give-above 600, take-below 10, 100 per transfer. `wheat`: supply give-above 100, take-below 20; also `food=true` so it counts as food in storage and can be eaten by crop-diet species. `bread`: maximum 999, `produce_min` 50. `common_metals` and `berries`/`bananas`/`coconut`/`crystal_salt`/`desert_berries`/`evil_beets`/`mushrooms`/`peppers`/`herbs`/`honey`: storage_max 100 as listed. `wood`, `stone`, `common_metals`, `silver`, `mythril`, `adamantine`, `gems`, `bones` are "minerals/wood" edible by species whose diet is wood/minerals; they are not `food`. `dragon_scales`, `leather`, `fertilizer`: strategic only, no food values. The strategic resource list (for "enough resources to craft items") is every resource of type Strategic: city has any with amount > 10.

### 6.2 Gathering (who gets what)

All gather jobs end by walking the load to storage ("Deliver", 3.7). A unit carries a *resource inventory*; each harvest adds `resources_given` of the target building to it.

| Source building | Job | Per harvest | Side effects |
|---|---|---|---|
| tree (any `type_tree`) | woodcutter | its resource list (5 wood; some trees add food/gems...) | tree falls and is removed (the 20% revive chance only applies to `become alive` trees or with the bark-bites-back law) |
| fruit bush (`type_fruits`) | gatherer_bushes | 3 berries | 20% destroyed, else hidden for 90 s |
| vegetation/flower (`type_vegetation`) | gatherer_herbs | its list (usually 1 herb) | plant destroyed |
| beehive | gatherer_honey | 1 honey; only when the hive's honey counter hit 10 | counter reset to 0 |
| mineral deposit | miner_deposit | the deposit's list; each unit of the list; a unit with trait `miner` gains +1 of each listed amount with 50% chance | deposit removed |
| manure (`type_poop`) | manure_cleaner | 1 fertilizer | removed; needs room for fertilizer |
| ripe wheat | farmer (harvest) | 1 wheat | crop destroyed |
| hunting (any kill by a citizen that has a city) | hunter | each entry of the victim species' drop table (e.g. 1-2 meat, bones, leather; dragon 10 meat/10 bones/10 scales; some species drop herbs/jam/etc.) scaled by (victim mass / drop_per_mass + 1) with drop_per_mass 50 (crystal salt 150), clamped to 1..30 per entry; goes into the killer's inventory unless victim and killer are the same species (savage trait overrides) | animal dies |
| boat fishing | fishing boat | 1 fish per cast; returns after > 10 fish | |
| ruins | cleaner | 1 wood and/or 1 stone | see 4.8 |

Every unit delivered gives the carrier loot = `loot_value` (1) per unit.

**Farming cycle** (job `farmer`, tasks repeat in this order; a farmer is only created if the city has a windmill):
1. `farmer_make_field`: choose the tile among cached "places for farms" nearest (squared distance) to the windmill, not already targeted by another unit, on the farmer's island and either empty or holding only flora; first preference tiles that touch (are surrounded by) existing field tiles; fall back to any such tile. Walk, 6 hoe swings, then convert the tile to a *field* (only if the terrain can be farmed and the occupying building, if any, is flora); loot +1.
2. `farmer_plant_crops`: if the city already has fully grown wheat do nothing (go harvest instead); else pick the nearest field tile (cached farm fields) that is free of buildings (or has a flora building that is not wheat), walk, 4 swings, plant wheat (loot +1), wait 1-2 s, check needs (restart cap 6), repeat.
3. `farmer_harvest`: find nearest *fully grown* wheat (cache), walk to it, 3+1 gather beats, extract (1 wheat), deliver to the windmill if on the same island else nearest food storage, check needs (cap 6), repeat.
4. `farmer_fertilize_crops`: find storage, walk there, take 5 fertilizer from the city (only if >= 5 in stock), then 5 times: find a random not-fully-grown crop, walk to it, throw fertilizer, fertilize (crop jumps to its final growth stage immediately, loot +1); deliver leftovers; wait 1-2 s; check needs (cap 6).
5. `farmer_random_move` (move to a random tile in the region, 65% same region), then `check_end_job`, `check_city_destroyed`.
Wheat growth: see 5.4. Crops can fail: whenever a crop grows and the current world era does not support crops, it has a 50% chance of being destroyed.

**Mining** (building `mine`, job `miner`, max 5 slots): task: find a finished mine building on the island, walk in, stay inside 10-15 s, run the mining roll, exit, wander to a random tile, wait 1-2 s, check needs (cap 3). Roll: 40% nothing; else a new *mineral deposit building* is created near the mine tile: from the mine's biome mineral pool (terrain-specific list) or, if none, a default weighted pool (gems 5/35, stone 20/35, common metals 10/35); if the mine tile (and its footprint and neighbours) is not on a biome terrain, the deposit is plain stone. Miner earns +1 coin. Deposits are then collected by `miner_deposit` workers. So metal/gems flow: mine -> deposit -> worker -> stockpile.

### 6.3 Surplus trickle from the ground

Every hall-type and bonfire building (flag `produce_biome_food`) runs a 90 s timer: when it fires, pick a random tile of the building's footprint, read the terrain's `food_resource` (fall back to the terrain's main type); if the city holds < 10 of that resource, add 1 to a random stockpile. Terrain food values (from the terrain table): most grass/forest/flower biome tops give `herbs`; farmland gives `wheat`; mushroom biomes `mushrooms`; corrupted `evil_beets`; infernal `peppers`; the rest per terrain (not fully enumerated here).

### 6.4 Production chains (crafting)

City action `produce resources` (once per cycle ~5 s): the species has a *production list* (humans: bread, pie; elves: bread, jam, sushi, cider; orcs: bread, burger, tea; dwarves: bread, ale; every other civ species: bread). For each product in random order:
1. Let `have` = city total of the product (sum over all usable storages). Skip unless `have` <= `maximum` (999).
2. Batch size = floor(population / 10) + 1; if `have` < the product's `produce_min`, batch size = `produce_min` (bread 50, others 10).
3. Repeat batch size times: stop if the city total already equals `maximum`; require the city to hold at least `ingredients_amount` of EVERY ingredient in the recipe; consume `ingredients_amount` of each ingredient; add 1 product to a random usable stockpile (stop if there is none).
Recipes (all ingredients required, `x n` units of each): bread = wheat x1; pie = meat x1 + wheat x1; jam = berries x2 + herbs x2; sushi = fish x1 + herbs x1; cider = berries x3; ale = wheat x3; burger = meat x1 + bread x1 + herbs x1; tea = herbs x1.
Because bread is produced with a minimum stock of 50 loaves, a city with wheat in stock converts it quickly (up to 50 per cycle) until it holds 50 bread, then only floor(pop/10)+1 per cycle.

### 6.5 Food, hunger and consumption

- Nutrition per unit: max 100 + subspecies bonus (`max_nutrition` stat); every 15 world-seconds (`interval_nutrition_decay`) nutrition decreases by max(1, subspecies metabolic rate); at 0 the unit is *starving*: it takes damage = 5% of max health per decay tick and gets the `starving` status; stamina/mana only regenerate while not starving. A unit is *hungry* when nutrition/max <= 0.5 (and it needs food).
- Citizens eat from the city: decision `try_to_eat_city_food` (hungry, has city, city storage holds food the unit's diet allows; cooldown 10 s; weight 2.6; high priority). Task: check affordability, walk to a random tile (in the city), wait 0.1 s, 3 x 0.2 s animations, eat, 3 x 0.2 s animations, wait 1-5 s.
- Affordability: free if the unit is a king, a city leader, a baby, or currently starving; everyone else needs money > 5 coins (`min_coins_before_city_food`) to start AND at least `money_cost` (2) per item at the moment of eating, paid from the unit's money. (Gluttonous units may eat a second item if they can pay.)
- Choosing the food: the unit's favorite food if the city has any; else the first storage (in the city storage order, finished or not but usable) that can offer food: within a storage the food slots are sorted by amount (largest first) and the first with amount > 0 allowed by the unit's diet wins; if no food slot qualifies, non-food slots (e.g. wood, stone for those diets) are tried. The city loses 1 unit and `total_food_consumed` increases.
- Effects of eating: experience; happiness event `just_ate` with `restore_happiness`; nutrition += `restore_nutrition` (capped at max), health += `restore_health` fraction of max health; if the item is the unit's favorite both are doubled; the favorite food is updated: with no favorite yet, the item becomes favorite with the resource's `favorite_food_chance`; with a favorite already, the new item replaces it if its tastiness is higher and a `favorite_food_chance` roll succeeds; then with probability `give_chance`, each of (a trait gift, a status gift) is applied with a 50% coin flip choosing one random entry from the lists.
- Food total for the city = sum of all storage food slots (Food + Ingredient_Food types). `hasAnyFood` is food total > 0; "enough food for army" is always true.
- Hunger-driven reassignment: gatherers/farmers end their task early (`BehCheckNeeds`) when starving while the city has any food, so they can go eat; with zero food the "no food" gatherer jobs are given priority in 3.5.
## 7. Storage, distribution, gold and taxes

### 7.1 Storage model

- **Storage buildings**: every building with `storage` = true. Stockpiles (type_stockpile) are the delivery targets; halls (type_hall, any level) also store; windmills store food only. A city lists `stockpiles` (stockpile type only) and `storages` (all of them). A storage/stockpile is *usable* if alive, not ruined, not being removed.
- **Slots**: each storage building has a map resource-id -> amount. Adding to a slot clamps at the resource's `maximum` (999) *per building*. The city's amount of a resource = sum over usable storages (halls and windmills included). City food = sum of all food-type slots.
- **Adding**: `addResourcesToRandomStockpile` picks a random usable stockpile (uniform) and adds there. Delivery by units goes to the *nearest usable storage on the same island* (squared tile distance); food-only deliveries (wheat) prefer the windmill. Units drop items one at a time (3.7).
- **Taking**: `takeResource` walks the city's storage list in order, taking min(slot amount, still needed) from each usable storage until satisfied. It does not fail if the city is short (takes what exists).
- **Room test** (decides whether gatherer jobs exist): "city has room for X" = some usable stockpile holds less than X's `storage_max` (50 default; 100 for berries, herbs, honey, bananas, coconut, crystal salt, desert berries, evil beets, mushrooms, peppers, snow cucumbers, common metals). This is not enforced when units deliver; it only gates job demand.
- **Initial reserve for crafting items**: "city has resources for new items" = any Strategic resource amount in one storage > 10.
- Equipment storage: the city keeps up to 15 items per equipment type (weapon, helmet, armor, boots, ring, amulet) in a separate list. Items taken from citizens (replaced equipment, deaths) are added if below 15, otherwise replace the first stored item (in list order) that is worth less than the new one, if any. Citizens use `try_to_take_city_item` (cooldown 180 s) to take a random item if it is better than what they wear (previous item returns to the city). Warriors receive a weapon when conscripted if they have none. (Item stats are outside this spec.)
- **Books**: halls (5 slots) and libraries (10 slots) hold books; destroyed buildings burn their books.

### 7.2 Money flow (gold, loot, taxes)

Two kinds of personal currency per unit: **loot** (coins earned by work, taxable) and **money** (spendable). The city's **gold** is a resource in stockpiles.

*Earning loot* (+n coins into `loot`, capped 99999): claiming a zone +5; building completion hit +6; road tile +1; field +1; planting +1; fertilizing +1; mining roll +1; cleaning +1; each delivered resource unit +1 (loot_value); a house visit (`generate_loot` decision: unit with a home building stays 2-6 s) +max(1, house `loot_generation` + biome loot) where biome loot values: crystal +2, enchanted +1, clover +3, singularity +3, corrupted -1, wasteland -2 (and 0 elsewhere); kills: the victim's loot and money transfer to the killer's loot.

*Taxes* (decision `give_tax`: inside own city borders, loot >= 5 (`kingdom.getLootMin`), cooldown 90 s, weight 2.55, high priority; the tax step itself executes in place):
1. King: all loot converted to his money (no tax).
2. Unit in a city without a leader: loot converted to own money.
3. Ordinary citizen: pays `local tax rate` of the loot (floor of loot x rate) into the *leader's loot*; the rest becomes the citizen's money. Local rate = 0.5 by default; kingdom traits override: `tax_rate_local_high` 0.7, `tax_rate_local_low` 0.2.
4. City leader: if the kingdom has no king, loot converted to own money. Otherwise pays `tribute rate` (0.5 default; kingdom traits `tax_rate_tribute_high` 0.7 / `tax_rate_tribute_low` 0.2) of loot to the *king's loot*; of the remainder, half (floor) is added to the city stockpile as **gold** and the other half becomes the leader's money.
The king in turn converts his loot to money on his own `give_tax`. So city gold comes only from leader tributes, trade boats (8.2), and gold mineral deposits (a deposit gives 20 gold + 20 stone). City gold pays building costs (7.3), boat costs, and is checked by conscription (> 10).

*Spending money*: citizens pay `money_cost` (2) per food item eaten unless eating for free (6.5); item crafting (`make_items`, decision cooldown 90 s, weight 0.4, needs a house, being in own borders and the city holding a strategic resource > 10): the crafter tries one weapon and up to 5 rounds of armor/accessory+weapon crafts; each craft needs the crafter's money >= item cost plus the item's one or two resource costs available in the city; it pays and the city's resources are consumed; the new item is only made if its value beats the crafter's current item for that slot. The `rebellion` plot costs 15 money.

### 7.3 Construction costs

Costs are 4 integers (wood, stone, common metals, gold) taken from the city's storages at the moment a building is placed (new) or upgraded. The city can pay if each of the four amounts is available in total. Payment takes from storages in list order. (Debug "infinite resources" bypasses.) Costs are listed per building in section 5; boats cost per section 8.

### 7.4 Supply between cities

See 3.3 `supply kingdom cities`. Concretely for gold: a city donates 100 gold to a kingdom-mate with < 10 gold when its own selected stockpile holds > 600; for most items it donates 10 when it holds > 30 in that stockpile and the receiver holds < 10 in total; wheat: above 100 / below 20, 10 per transfer. Only cities with a culture take part; the timer is 30 s (x leader's supply-timer multiplier stat, min 10 s).
## 8. Trade, traders and boats

### 8.1 Docks and boats

- Docks are city buildings (fishing docks then upgraded docks). A dock exposes up to 4 candidate "ocean tiles": the tiles 4 left of, 5 right of, 4 below, and 7 above the dock's anchor tile, counting only those that are valid for boats. If none are valid the dock destroys itself (checked when recalculated). A dock self-destructs if any of its footprint tiles is ground, or if it is the only building of its city.
- Each dock keeps a counter of boats per boat type; **max 1 boat of each type per dock**. A boat is built only by the `produce boat` city action: once every >= 10 s (timer starts at 10 s), picking a random finished docks building. A fishing dock can only make fishing boats; an upgraded dock can make fishing, trading and transport boats (type chosen uniformly among the dock's allowed types, so a failed pick just wastes the cycle).
- Boat costs (paid from the city): fishing boat wood 5 + gold 5; trading boat wood 10 + gold 10; transport boat wood 5 + common metals 2 + gold 20. Boat stats: fishing HP 100, speed 10; trading HP 200, speed 30, can fight (cannonball); transport HP 1000, speed 25 (fights with cannonballs, holds up to 100 passengers). Each architecture has its own boat actor ids (e.g. `boat_trading_<arch>`, `boat_transport_<arch>`); fishing boat shared (`boat_fishing`).
- Boat behaviour (decision loop, each decision cooldown/weights in order): `boat_check_existence` (cd 5 s, w 1), `boat_danger_check` (cd 5, w 1.25: if in liquid, flee to a water tile; wait 3-10 s), `boat_idle` (cd 5, w 0.75: drift to a random neutral ocean tile, wait 3-10 s), `boat_check_limits` (cd 15, w 1: if the home dock is full -> go into the dock, wait 0-3 s, stay 2-4 s, and if the dock holds more than 1 boat of the type the surplus boat is destroyed). Type-specific: fishing (cd 1, w 1.3), trading (cd 1, w 1.3), transport check (moderate priority, cd 1, w 1.3).
- Boats belong to the city and kingdom of their dock and are removed with them.

### 8.2 Fishing and trading

- **Fishing** (boat_fishing): pick a random water tile in the current or an adjacent water region, sail there, wait, cast (visual), wait 5-10 s, collect 1 fish, wait 1-2 s; repeat until the boat carries more than 10 fish (>= 11), then run `return to dock`: go to the home dock, stay inside 2-4 s, unload the cargo into a random stockpile of the city, repair, leave. So a fishing trip yields 11 fish.
- **Trading** (boat_trading): needs a home dock; choose a target dock on the same ocean (island of water tiles) from the water body's dock list, in random order, that has a city, is not the boat's home dock, is usable, not abandoned, whose city's kingdom is not an enemy of the boat's kingdom, and has valid ocean tiles. Sail to a water tile at that dock, stay inside 2-5 s, then the boat receives **5 gold** (independent of the partner), leaves, and runs `return to dock` (unloading the 5 gold into the home city's stockpile). No goods are exchanged; the partner city gets nothing. (The `trade_*` resource fields and the city `timer_trade` are unused.)

### 8.3 Taxi / transport boats (units crossing water)

A `TaxiRequest` = {start tile, target tile, kingdom, set of passengers, optional assigned boat, state}. States: Pending -> Assigned -> Loading -> Transporting -> Finished. The `TaxiManager` holds the global list.
- **Creating requests**: (a) a citizen standing on an island different from his home city's island (city-job attackers: unless the city's attack target zone is on his island) runs `try_to_return_to_home_city` (cd 15 s, w 3, adult): requests a ride to the city's main tile; (b) warriors run `check_warrior_transport` (cd 6 s, w 2): if the city has an attack-zone order whose target is on another island (and the warrior is not already standing in an enemy city), request a ride to that zone's centre. A request is *merged* into an existing non-transporting, non-finished request of the same kingdom with the same start island and target island; otherwise a new one is created. Units already inside a boat do not request.
- **Maintenance** every 5 s: requests that are no longer legit (no assigned boat and no passengers left) finish. Passengers are removed from a request when dead, when they leave the start island, or when they are already on the target island.
- **Boat assignment** (transport boats, `boat_transport_check` -> `boat_transport_check_taxi`): a transport boat with no passengers looks up the request it already serves, else the Pending, still-legit request of the same kingdom with the most passengers; if found it is Assigned and the boat runs `go load`.
- **Loading** (`boat_transport_go_load`): the boat sails to a pick-up point (the home dock's ocean tile if it is on the passengers' water body, else a water tile found near the start tile), waits, then repeats loading rounds: every round each unembarked passenger that is not fighting and not on another boat task is forced into the boat (walk to a shore tile near the boat and embark if within 5 tiles of the boat or the boat is near a dock); the request is `Loading`; the boat waits 12 s per round; up to 4+1 rounds or 100 passengers or when everyone is aboard. If nobody boarded the request is cancelled; else state Transporting, late passengers are dropped from the request, and the boat's destination is the request's target tile.
- **Passenger transport check** (boat that has passengers): destination = the city's attack target zone centre if the boat carries more than 5 passengers and its city has an attack order, else the city's main tile; the boat sails to a water tile near it.
- **Unloading**: land passengers on a ground tile near the target (searching neighbours of the landing ray), finish the request, wait 3-10 s, end the job.
Taxi use is purely an island-bridging mechanism for citizens and armies; there are no fares.

### 8.4 Other trade-like flows

- **Inter-city supply** (3.3, 7.4) is the only goods trade; it is automatic within a kingdom.
- **Tribute and local tax** (7.2) move gold upward.
- No market building behaviour exists in the inspected code (the `market` building is a prerequisite-free decoration with a cost; UNCLEAR whether other scripts use it).
## 9. Citizen job counts

The number of citizens doing each job is recomputed every cycle (~5 s) by the planner of section 3.4. The job table is a *slot count per job*, filled round-robin from the adult population; a job never receives more citizens than its slots, so the sum of all slots can be less than the adult population (the remainder are idle/walking). Slots are sized from the *adult* count only, but any citizen that `canWork` (3.5, includes children of 8+ years) may occupy one. Citizens take slots lazily through `find_city_job` (3.5); surplus occupants drop out when slots shrink.

Summary of slot formulas (A = adults in the city):

| Job | Slots |
|---|---|
| fireman | 0 if no fire; if fires exist and city not in fire danger: 2 (city <= 5 citizens) or 3; if in fire danger: number of fires |
| builder | 3 while any building is under construction, else 0 |
| gatherer_bushes / herbs / honey | each: min(count of harvestable targets with stockpile room, herb cap) where herb cap = 1 (food > 100), 4 (>60), 5 (>40), 7 (21..40), 10 (<= 20); need a finished storage |
| farmer | up to max(#farmable tiles near windmill, #field tiles if crops can grow); 0 without a windmill |
| miner_deposit | number of mineral deposits in city zones (storage required) |
| woodcutter | min(#trees with wood room, 1 if wood > 15 else 3) |
| miner | 5 if the city has a mine building |
| attacker (warrior slots) | up to floor(A x army multiplier), granted 2 per planner round; only if A > 15 and the army law is on. Army multiplier = species base 0.35 + leader army stat + leader warfare stat x 0.02 |
| road_builder | 1 if road tiles pending |
| cleaner | 1 if ruins/abandoned shells exist |
| hunter | 1 (storage required) |
| manure_cleaner | min(#manure piles with fertilizer room, 3) |

Worked examples (planner output, all stockpile rooms available):
- 12 adults, a storage, a building under construction, food 30, wood 5, 3 bushes, 6 plants, 2 deposits, 8 trees, no windmill/mine, no army (A <= 15): builders 3, bushes 2, herbs 2, deposits 2, woodcutters 2, hunter 1 (the 12 citizens run out).
- 40 adults, storage+windmill+mine, food 50, wood 20, bushes 6, plants 10, hives 2, minerals 3, trees 15, farmable tiles 12, 1 road, 2 ruins, 3 manure: bushes 4, herbs 4, honey 2, farmers 8, deposits 3, woodcutters 1, miners 4, attackers 8, road builder 1, cleaner 1, hunter 1, manure 3 (all 40 used).
- 100 adults, same infrastructure, food 200: bushes 1, herbs 1, honey 1, farmers 30, deposits 3, woodcutters 1, miners 5, attackers 36, cleaner 1, hunter 1, manure 3 (83 slots; 17 citizens have no slot).
## 10. Loyalty and rebellion

### 10.1 Loyalty value

`loyalty(city)` = integer sum of all factors below. It is cached and recomputed when more than 3 world-seconds old (or on demand). A city in the neutral kingdom has loyalty 0. A city is **happy** when loyalty >= 0; **unhappy** when < 0 (`isHappy` is the only consumer of the sign: rebellion checks and unhappy-city counts). Zero-valued factors are omitted. "capital-relative" factors return 0 for the capital city itself. "age" values are whole years (1 year = 60 world seconds). Truncation toward zero is used for all float -> int conversions. If the kingdom has no capital, all capital-relative factors return 0.

### 10.2 Every factor

| # | id | Value |
|---|---|---|
| 1 | king_diplomacy | If the kingdom has a living king: + (king diplomacy stat + 2 x king stewardship stat) |
| 2 | leader_diplomacy | If the city has a living leader: - (leader diplomacy + 2 x leader stewardship) |
| 3 | leader_loyalty | leader's `loyalty_traits` stat (sum of trait contributions, see list below) + (if the kingdom has a king) the trait-affinity mod between leader and king: for each trait of the leader that has a "same trait" modifier and which the king also has, add that modifier; for each trait of the leader that has an "opposite trait" modifier, add it once per opposite trait the king has (modifier values live on traits; per-trait values not enumerated, UNCLEAR) |
| 4 | population | capital-relative: let n = min(30, floor(|city population - capital population| / 3)); +n if the city is no larger than the capital, else -n |
| 5 | zones | capital-relative: n = min(5, floor(|city zones - capital zones| / 20)); +n if the city has no more zones than the capital else -n |
| 6 | distance | capital-relative: - floor(distance between city centre and capital centre in tiles / 10) |
| 7 | capital | +1000 for the capital itself (makes the capital always happy) |
| 8 | mood | leader's mood stat `loyalty_mood`: mood sad -5, normal 0, happy +10, angry -15, dark -20 |
| 9 | new_city | city age a (years) <= 15: + (15 - a) x 5 |
| 10 | new_kingdom | kingdom age a <= 5: + (5 - a) x 5 |
| 11 | cities | capital-relative: if kingdom city count > max cities (species base 4 + king `cities` stat, min 1): (maxCities - count) x 25 (negative) |
| 12 | superior_enemies | if the kingdom has enemies: sum of enemies' power minus own power, halved, clamped to [0, 50] (stronger enemies = more loyalty) |
| 13 | close_to_capital | capital-relative: +20 if this city's border touches the capital's |
| 14 | connected_to_capital | capital-relative, only if capital and city have the same species: +20 if connected through same-kingdom neighbour cities (2.1) else -35 |
| 15 | culture | capital-relative, needs a culture: +15 same culture as capital's, else -25 |
| 16 | language | capital-relative, needs a language: +15 same, else -20 |
| 17 | religion | capital-relative, needs a religion: +15 same, else -30 |
| 18 | species | capital-relative: 0 if same species; else -25 (-5 if the leader has the xenophiles culture trait); -50 if the leader has xenophobic or the king has xenophobic |
| 19 | subspecies | capital-relative, same species only: +15 if same main subspecies else -15 |
| 20 | clan | capital-relative, needs both leader and king: if their subspecies differ 0; else +30 same clan, -20 different |
| 21 | new_conquest | kingdom's last conquest `y` years ago (only if it has conquered anything), y <= 10: (10 - y) x 30 |
| 22 | part_of_kingdom | years since the city joined its current kingdom y <= 10: (10 - y) x 10 |
| 23 | supreme_kingdom | +100 if there are > 1 kingdoms and this is the top-ranked (supreme) kingdom |
| 24 | second_best_kingdom | +50 if > 2 kingdoms and this is the second-ranked |
| 25 | king_rule | with a king, y = years since his rule began: 0 if y < 5; else min(y, 40) |
| 26 | loyalty_world_era | current world age bonus: hope +15, sun +5, dark -5, chaos -55, ash -25, despair -10, other ages 0 |
| 27 | loyalty_baby_king | -50 if the king is younger than 18 |
| 28 | opinion_patriarchy | -50 if the city's culture equals the kingdom's culture, has trait `patriarchy`, and the king is not male |
| 29 | opinion_matriarchy | -50 if same culture condition, trait `matriarchy`, and the king is not female |

`loyalty_traits` per trait (leader factor 3): stupid -15, genius -10, deceitful -20, ambitious -15, content +10, honest +5, paranoid -15, greedy -5, immortal -20, bloodlust -20, pacifist +50, infected -15, mush_spores -15, tumor_infection -15, plague -15, kingslayer -25, mageslayer -10, madness -100.

### 10.3 Rebellion trigger

Rebellion is a **plot** (a scheme a unit plans over time; plot machinery - progress timers, who may start it - is in the plot spec). A unit may start the `rebellion` plot only when the rebellion world law is on, diplomacy is on, and the plot's `check_is_possible` passes for the acting unit (who must be a city leader or otherwise allowed; level >= 2, stewardship >= 6, warfare >= 5, pays 15 money):
1. Not the king; not a pacifist.
2. His kingdom has > 1 city and has a capital; kingdom age > 15 years (`rebellions_min_age`).
3. His city is not happy (loyalty < 0) and is not the capital.
4. His city has >= 10 warriors (`rebellions_min_warriors`).
5. Warrior strength: city warriors >= capital warriors x (1 - 0.1 x number of unhappy cities in the kingdom).
6. The kingdom is not already the main defender of a rebellion war, and no active rebellion plot targets this kingdom.
7. If the kingdom has 6 or fewer cities, it must have MORE cities than its max-city allowance (`4 + king cities stat`).
The plot continues only while the planner is still a city leader of a non-capital city and not king.

On success (`startRebellion(leader)`): the leader's city leaves the old kingdom to form a **new kingdom with the leader as king** (counters: cities rebelled++; units get `just_rebelled` happiness); a war of type rebellion is started with the old kingdom as attacker (or the new kingdom joins an existing rebellion war as defender); the old kingdom's allies that like it join the attackers; every city of the old kingdom whose citizens are among the plotters also joins the rebels; then up to min(newKingdomMaxCities - 1, floor(oldCityCount / 3)) extra cities are recruited: repeatedly pick among the rebel cities' neighbours (else any old-kingdom city) in random order a city that is not the capital, is unhappy (when the plot was not forced), and passes a 50% coin flip, and flip it to the rebels (cities rebelled++).
A second plot, `cause_rebellion` (level >= 12, 400 money, progress 70 at pot-rate 2, king or leader as initiator, needs enemies; targets a random non-capital city of a random enemy kingdom), ignores happiness: when it completes, a random citizen of the target city becomes the rebel leader and the same rebellion procedure runs.
## 11. Architecture styles

An *architecture* is the mapping from abstract build orders to concrete building ids plus boat actor ids and a few style flags. Every civ species names one (`architecture id`); several species can share one (e.g. raccoon and plague-doctor species use `civ_bandit`; seal, ostrich and piranha use `civ_piranha`; unicorn uses `civ_white_mage`; fire skull, fire elemental and demon use `civ_demon`; jumpy skull uses `civ_necromancer`).

Fields: generate-buildings flag (create buildings automatically from a source architecture), generation target (always `human`), spread-biome id (optional), burnable-buildings flag (default true), `building_ids_for_construction` (order id -> building id), `styled_building_orders` (orders whose building is style-specific), `shared_building_orders` (order -> shared building id), boat actor ids: fishing (default `boat_fishing`), trading, transport.

Resolving an order: look up the order id in the architecture's table. Classic architectures (human, orc, elf, dwarf) have 19 styled orders: docks_0, tent, house_0..house_5, hall_0..hall_2, windmill_0, windmill_1, docks_1, watch_tower, temple, library, market, barracks. Ids are built as: tent -> `tent_<A>`; house k -> `house_<A>_<k>`; hall k -> `hall_<A>_<k>`; windmill k -> `windmill_<A>_<k>`; docks_0 -> `fishing_docks_<A>`; docks_1 -> `docks_<A>`; watch tower -> `watch_tower_<A>`; temple/library/market/barracks -> `temple_<A>` etc. Shared orders (same for every architecture): bonfire -> `bonfire`, statue -> `statue`, well -> `well`, stockpile -> `stockpile`, mine -> `mine`, training_dummy -> `training_dummy`.

Generated architectures (everything else) have only 9 styled orders: docks_0, docks_1, house_0, hall_0, windmill_0, watch_tower, temple, library, barracks (same id patterns with A = the architecture id, e.g. `house_civ_cat_0`), plus the 6 shared orders; their buildings are cloned from human buildings as described in 5.3. Consequences: such species cannot build tents, house levels, hall upgrades, windmill upgrades, markets, and cannot service build orders that reference those (their templates never include them).

Per-architecture settings:
| Architecture | Spread biome (terraforms ground around its buildings every 8-16 s within 2 tiles, only when the terramorphing law is on) | Burnable | Stockpile |
|---|---|---|---|
| human, orc, elf, dwarf | - | yes | stockpile |
| civ_necromancer | corrupted | yes | stockpile |
| civ_druid | jungle | yes | stockpile |
| civ_evil_mage | - | NO | stockpile_fireproof |
| civ_demon | infernal | NO | stockpile_fireproof |
| civ_cold_one | permafrost | yes | stockpile |
| civ_snowman | permafrost | yes | stockpile |
| civ_penguin | permafrost | yes | stockpile |
| civ_garlic_man | garlic | yes | stockpile |
| civ_lemon_man | lemon | yes | stockpile |
| civ_acid_gentleman | wasteland | yes | stockpile |
| civ_crystal_golem | crystal | NO | stockpile |
| civ_candy_man | candy | yes | stockpile |
| civ_liliar | flower | yes | stockpile |
| all others (alien, bee, beetle, fairy, white_mage, bandit, angle, greg and all animal civs: cat, dog, chicken, rabbit, monkey, fox, sheep, cow, armadillo, wolf, bear, rhino, buffalo, hyena, rat, alpaca, capybara, goat, scorpion, crab, turtle, crocodile, snake, frog, piranha) | - | yes | stockpile |

Boats: every architecture has a trading boat `boat_trading_<key>` and a transport boat `boat_transport_<key>` where key = the architecture id without its `civ_` prefix (human, orc, elf, dwarf, necromancer, cat, ...), plus the shared fishing boat `boat_fishing`; their stats are the three templates in 8.1.

Which build-order template a species uses: advanced = human, elf, orc, dwarf; basic_2 = cold_one, necromancer, plague_doctor, evil_mage, fire_skull, demon, angle, snowman, civ_alien; basic = every other civ species (default).
