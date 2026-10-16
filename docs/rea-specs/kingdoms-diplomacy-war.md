# Kingdoms, Diplomacy, War, Alliances, Armies, Plots - Behaviour Spec

Clean-room behaviour description for an original TypeScript re-implementation. Describes behaviour, thresholds and formulas only. Ids (asset ids, trait ids) are given where needed for cross-referencing. "Unclear" is flagged explicitly. Time unit: "seconds" = simulation seconds (frame delta sums); "world time" = the in-game clock used for timestamps; "years" = in-game years (age counter ticks elsewhere).

## Contents
1. Kingdom model and lifecycle
2. Kingdom assets (races, mobs, nature) and friend/foe tag rules
3. Kingdom AI loop, kings, succession, capital, fracture
4. Opinions and diplomacy
5. Wars
6. Alliances
7. Armies
8. Plots
9. Rebellion, city capture, how kingdoms die
10. Unclear / gaps

## 1. Kingdom model and lifecycle

### 1.1 Two kinds of kingdom object
- **Civ kingdom (runtime object)**: one instance per civilization. Owns cities, buildings, units, a king, a capital, culture/language/religion references, an optional royal clan id, an optional alliance id, traits, renown, counters (births, deaths, kills, left, joined, moved, migrated, total_kings). Has an AI (section 3).
- **Wild kingdom**: one shared singleton per kingdom *asset* for mobs, animals, nomads, neutral. Ids of wild kingdoms are negative; a "civ or wild by id" lookup chooses the wild store when id < 0. Wild kingdoms have no king, capital or AI. A special "neutral" wild kingdom just holds neutral cities.
- Every kingdom has a kingdom asset (section 2). A civ kingdom's asset is the one named by the founding species' civilization-kingdom id. Its "actor asset" (species) is the king's species if a king exists, else the founder species stored at creation.

### 1.2 Defaults at creation
- power = 1; AI action timer = 5 s; new-king timer = 10 s.
- Founding from an actor: stats "kingdoms created" +1; asset chosen from the actor species; name generated from the founder's naming rules; founder joins the kingdom and becomes king (3.4); kingdom location = founder's tile; world-log entry.
- Founding by splitting from another kingdom: see section 9.

### 1.3 Periodic updates
- Every unpaused frame each civ kingdom ticks: new-king timer -= elapsed if > 0; if the kingdom has an AI: if its action timer > 0 subtract elapsed, else run the AI one step (section 3.1).
- Once per in-game year: if the king has a clan, clan renown +1.
- Unit/city/building lists on kingdoms are rebuilt lazily when flagged dirty. A kingdom whose unit died since the last rebuild is marked "preserve alive" for that rebuild.
- Renown: +1 per birth, +1 per immigrant joined, +2 per "moved" event. Deaths/kills counters mirror into the alliance if one exists.
- Tax rates: local tax and tribute tax start at global base rates; a kingdom trait flagged as the local-tax (or tribute-tax) trait overrides that rate with the trait's own rate.

### 1.4 Removal conditions
A world sweep ("dead meta objects" pass; skipped on the first pass after load; period not determined here) removes a civ kingdom when ALL hold:
1. zero buildings; 2. zero units (boats count); 3. zero cities; 4. no live projectiles owned by it; 5. its unit list is empty and it is not flagged "preserve alive".
So a kingdom survives having no king, and even no capital; it ends when its last city and last unit are gone.

### 1.5 Removal side effects (order)
1. Stats: kingdoms destroyed +1; world log.
2. All diplomacy relations involving it are deleted.
3. Clears player UI selections that pointed to it.
4. Surviving units become nomads: each living non-boat unit cancels its behaviour, leaves its faction and joins the wild kingdom of its species' wild-kingdom id. Boats are set to full health instead and left alone.
5. Every war it is in removes it with "not peace" (5.9).
6. It leaves its alliance (6.5).
7. Culture/language/religion registries flagged dirty; kingdom record archived to history storage.

### 1.6 War outcome effects on a kingdom and its units
- Won war: kingdom renown += war renown. Each unit: if it has NOT had a "was conquered" happiness entry within the last 300 time units: king renown += war renown, city leader += 20% of war renown, warrior += 5%; plus a "won war" happiness event. Unit with tag "love_peace" gets a festive status.
- Peace: kingdom renown += 25% of war renown (truncated). Each unit gets "made peace" happiness; king renown += 20%, city leader += 5%; "love_peace" -> festive status.
- Lost: kingdom renown += 10% of war renown (truncated); units "lost war" happiness; king renown += 5%.
- `timestamp_last_war` is set on a kingdom when the kingdom is done with a war (used by the war-declaration cooldown, 5.2). `timestamp_new_conquest` is set on the winner of a city capture unless the capture was by the main attacker of a rebellion war against that city's old kingdom (9.2); used by loyalty (outside this spec). `timestamp_king_rule` set when a new king is crowned (loyalty). `timestamp_alliance` set on joining/leaving an alliance (used by plots 8, alliance_timeout).

## 2. Kingdom assets and friend/foe rules

### 2.1 Asset fields (meaning)
- `civ`: a real civilization kingdom (has cities, king, AI, diplomacy). `mobs`: wild creature kingdom. `nature`: environment pseudo-kingdom (never foe of anyone). `nomads`: homeless-people kingdom. `abandoned`, `concept` (editor/UI-only "meta" kingdoms; reset to false on every clone, then set where listed), `neutral`, `brain` (brain creatures), `group_main` / `group_miniciv` / `group_minicivs_cool` / `group_creeps` (UI grouping only).
- `always_attack_each_other`: units of this same kingdom asset count each other as foes. `units_always_aggressive`, `force_look_all_chunks`: unit AI hints (enemy scan everywhere / always hostile stance).
- `is_forced_by_trait` + `forced_by_trait_kingdom_id`: a unit carrying that trait (trait id) is forced into this kingdom asset (listed below).
- `building_attractor_id`: building id that units of this kingdom walk to.
- `count_as_danger` (default true): whether units of it count as a threat in danger-zone calculations; false for neutral animals, nature/godfinger, golden_brain, concept kingdoms.
- `friendly_tags`, `enemy_tags`, `list_tags`: string sets (rules below). `friendship_for_everyone`: see 2.3.
- Colour: wild/mob kingdoms without a specific colour use a shared grey (#888888). Civ-race kingdoms have no default colour (each runtime kingdom takes a colour from the palette). Nomad colours: human #BACADD, elf #98DB8C, orc #FFCD70, dwarf #B1A0FF. Nature/ruins/abandoned have special building tint (white / "abandoned" tint). `neutral` asset has fixed palette index 83.

### 2.2 isFoe(A, B) between kingdom ASSETS (cached per ordered pair; asymmetric by design)
Evaluate in order, first match wins:
1. If A or B is `nature` -> NOT foe.
2. If A == B -> foe only if A.always_attack_each_other.
3. If A.enemy_tags has any element in common with B.list_tags -> foe.
4. (Side effect: each asset's own id is added to its own list_tags at this point - so an asset's id is effectively one of its tags, but only after its first isFoe call. In the original this makes step 3 order-dependent for matching on an id tag. For re-implementation: ALWAYS include the asset id in its own tag set from the start.)
5. If A.friendly_tags has any element in common with B.list_tags (own ids included) -> NOT foe.
6. Otherwise -> FOE. (Default is hostility; friendship must be explicitly declared.)
Because friendly tags are one-directional, A may be foe of B while B is not foe of A. A debug check exists listing such asymmetries.

### 2.3 Global tag post-processing (after all assets defined)
- Every asset gets tag `everyone`.
- Every asset that has `friendship_for_everyone` (capybara, civ_capybara, miniciv_capybara, via cloning) has its id added to the friendly tags of EVERY asset (so all assets are friendly toward capybara kingdoms; capybara kingdoms also carry friendly tag `everyone`, so they are friendly to all).

### 2.4 Civ-vs-civ is not by asset
`Kingdom.isEnemy(A, B)` (runtime kingdoms; cached, cache cleared when kingdoms change):
- B null -> true.
- Both are `civ` assets (includes real civs, mini-civs, new animal civs, and the neutral kingdom): same kingdom -> false; at war with each other -> true; else false. Asset tags are NOT consulted.
- Otherwise (at least one is a mob/nomad/nature kingdom): use asset isFoe(A.asset, B.asset).
So civs fight each other only through wars; they fight mobs through tag rules.
`isOpinionTowardsKingdomGood(A,B)`: true if same kingdom, else true when the opinion total (4) A->B >= 0.

### 2.5 Template assets (base shapes; "inherits" = clone, tag sets copied then extended)
- TEMPLATE_MOB: mobs. No tags.
- TEMPLATE_MOB_GOOD (from MOB): tag good; friendly {good, neutral, civ}; enemy {orc, bandit}.
- TEMPLATE_MOB_VERY_GOOD (from MOB_GOOD): friendly += {nature_creature, living_houses, living_plants, snowman}; enemy += {wolf, bear}.
- TEMPLATE_ANIMAL (from MOB): tag nature_creature; friendly {nature_creature, neutral_animals}.
- TEMPLATE_ANIMAL_NEUTRAL (from MOB): count_as_danger=false; tags {neutral_animals, neutral}.
- TEMPLATE_ANIMAL_PEACEFUL (from ANIMAL_NEUTRAL): friendly {good, neutral, nature_creature, civ}.
- TEMPLATE_CIV: civ; tag civ; enemy {bandit}.
- TEMPLATE_CIV_GOOD (from CIV): friendly {neutral, good}.
- TEMPLATE_NOMAD (from CIV_GOOD): civ=false, mobs=true, nomads=true.
- TEMPLATE_CIV_NEW (from CIV_GOOD).
Mini-civ construction `cloneAsMiniciv(new, from, loveNeutrals)`: copy of `from`, then mobs=false, civ=true, group_miniciv; add tag `from` and friendly tag `from` to the new asset; ADD friendly tag `new` to the original `from` asset; if loveNeutrals: add tag civ, friendly {neutral, nature_creature}.
Below, "+tag" = tag added; "+F" friendly added; "+E" enemy added; inherited sets shown in the parent.

### 2.6 Race (civ) and nomad assets
- nomads_human (NOMAD): +tag human, sliceable; +F human.
- nomads_elf: +tag elf, nature_creature, sliceable; +F elf, nature_creature.
- nomads_orc: civ=false, mobs; +tag orc, sliceable; +F orc, golden_brain, wolf, hyena.
- nomads_dwarf: +tag dwarf; +F dwarf, civ_crystal_golem.
- human / elf / dwarf / orc (the playable civ kingdom assets): copies of the matching nomads_* with civ=true, mobs=false, default colour cleared (colour comes from palette). (Quirk: they inherit the `nomads=true` flag; the flag is only read by one culture-trait check and by an editor diagnostic - treat as irrelevant.)
All civ assets: friendly {neutral, good}, enemy {bandit}, tag civ. As noted in 2.4 civ-vs-civ ignores tags.

### 2.7 "New civ" assets (animal/plant races; copies of CIV_NEW)
All have inherited tag civ, friendly {neutral, good}, enemy {bandit}. Extra tags/friends:
- civ_cat, civ_dog, civ_chicken, civ_rabbit, civ_monkey, civ_fox, civ_sheep, civ_cow, civ_wolf, civ_bear, civ_hyena, civ_rat, civ_alpaca, civ_goat, civ_penguin, civ_crocodile, civ_frog, civ_liliar, civ_lemon_man, civ_buffalo: +tag sliceable.
- civ_armadillo, civ_rhino, civ_scorpion, civ_turtle, civ_piranha, civ_acid_gentleman, civ_candy_man, civ_beetle: nothing extra.
- civ_capybara: friendship_for_everyone, +F everyone.
- civ_crab: +F crab.
- civ_snake: +tag sliceable; +F snake, miniciv_snake.
- civ_garlic_man: +tag garlic.
- civ_crystal_golem: +F dwarf.

### 2.8 Mob kingdoms (from TEMPLATE_MOB unless stated)
- bandit: +tag neutral, sliceable; +F neutral, miniciv_bandit; +E civ.
- snowman: +tag snow; +F good, snow.
- evil_mage: +tag evil; +F demon.
- white_mage (MOB_VERY_GOOD), plague_doctor (MOB_VERY_GOOD): no extras.
- necromancer: +tag evil; +F undead, miniciv_necromancer, fly; +E garlic.
- druid (MOB_GOOD): +tag nature_creature; +F nature_creature, super_pumpkin.
- undead: +F necromancer; +E garlic.
- cold_one: +tag snow; +F snow.
- demon: +F fire_elemental.
- angle: +tag good, nature_creature; +F good, neutral, civ, nature_creature, super_pumpkin, snowman.
- aliens: +tag sliceable; +F assimilators.
- mush: +tag sliceable; +F living_plants.
- greg: +tag sliceable.
- fire_elemental: +F demon, dragons, fire_skull.
- dragons: +tag sliceable; +F fire_elemental.
- living_plants: +tag nature_creature; +F nature_creature, good, neutral, mush.
- living_houses: +F living_houses.
- fire_skull: +tag undead, demon; +F demon, dragons, undead, fire_elemental.
- jumpy_skull: +tag undead; +F undead, fire_skull, necromancer.
- fairy (copy of "good"): +tag good (see "good" in 2.11).
Creeps (group_creeps, MOB): super_pumpkin (+tag sliceable; +F druid), tumor, biomass, assimilators (+F aliens).

### 2.9 Animal kingdoms
Peaceful animals (ANIMAL_PEACEFUL: friendly {good, neutral, nature_creature, civ}, tags {neutral_animals, neutral}, not danger):
- cat: +tag small, sliceable; +F living_houses, snowman; +E snake.
- dog: +tag sliceable; +F wolf, human; +E cat.
- chicken, rabbit: +tag small, sliceable.
- monkey: +tag sliceable; +F living_houses, snowman; +E snake.
- fox: +tag sliceable; +F wolf, bear.
- sheep, cow, alpaca, ostrich, frog, seal, flower_bud: +tag sliceable.
- armadillo, scorpion, turtle: nothing extra.
- raccoon: +tag sliceable, small; +F bandit.
- rat: +tag sliceable, small; +F civ_acid_gentleman, miniciv_acid_blob, acid_blob; +E cat.
- capybara: friendship_for_everyone; +F everyone.
- goat: +F nomads_dwarf, dwarf, civ_crystal_golem, crystal_sword.
- penguin: +tag sliceable; +F bandit, super_pumpkin.
- crab: +tag small; +F living_houses, snowman, crabzilla.
- crystal_sword: +E sliceable.
- lemon_snail: +tag sliceable, small. garl: +tag garlic. smore: +tag sliceable, small.
- acid_blob: +E small. unicorn: +E sliceable.
Wild aggressive animals (ANIMAL: tag nature_creature; friendly {nature_creature, neutral_animals}; dangerous):
- wolf: +tag sliceable; +F orc, dog, living_houses.
- bear: +tag sliceable; +F living_houses; +E rhino, crocodile.
- rhino: +E hyena, snake, bear, wolf, rat.
- buffalo: +tag sliceable; +F rhino; +E hyena, bear, wolf, crocodile.
- hyena: +tag sliceable; +F orc, living_houses; +E monkey.
- crocodile: +tag sliceable; +E chicken, monkey.
- piranha: +tag sliceable, small.
- snake (ANIMAL_NEUTRAL): +tag small, nature_creature; +F civ_snake, elf, nature_creature.
Mini-civ copies of animals (civ=true, mobs=false, group_miniciv; each gets friendship with its source animal and vice versa): miniciv_ + {cat, dog, chicken, rabbit, monkey, fox, sheep, cow, armadillo, raccoon, wolf, bear, rhino, buffalo, hyena, rat, alpaca, capybara (+F everyone), goat, penguin, ostrich, crab (+F crabzilla), scorpion, turtle, crocodile, snake, frog, piranha, seal, flower_bud, crystal_sword, lemon_snail, garl, smore, acid_blob, insect, unicorn}.
"Cool" mini-civs (also group_minicivs_cool; loveNeutrals true unless noted): civ_aliens (from aliens), civ_druid (from druid, loveNeutrals false, +tag sliceable), and miniciv_ + {angle, bandit, cold_one, demon, evil_mage, fire_skull, jumpy_skull, necromancer (+F necromancer, undead), plague_doctor, white_mage, fairy, snowman}, miniciv_greg (loveNeutrals false).

### 2.10 Environment and neutral
- neutral: civ+neutral concept, count_as_danger false, tags {nature_creature, neutral}; friendly {good, nature_creature, neutral}.
- neutral_animals: mobs, concept, not danger; tags {neutral, nature_creature}; friendly {good, neutral, nature_creature, living_houses, snowman, civ}.
- insect (from neutral_animals, concept=true); fly (from insect, concept reset false).
- nature, ruins, abandoned: nature+mobs+concept, not danger (abandoned also flagged abandoned). godfinger: nature, not danger.

### 2.11 Unique / forced kingdoms
- good (concept, mobs, not danger): friendly {neutral, civ, nature_creature, living_houses, snowman}; enemy {wolf, bear, orc, bandit}.
- mad: always_attack_each_other, force_look_all_chunks, mobs, units_always_aggressive; forced by unit trait "madness". (No friendly tags: everything outside nature is foe, including other "mad" units.)
- alien_mold: forced by trait "desire_alien_mold"; aggressive; attractor building "waypoint_alien_mold"; +F aliens, civ_aliens.
- computer: trait "desire_computer"; attractor "waypoint_computer"; +F assimilators.
- golden_egg: trait "desire_golden_egg"; attractor "waypoint_golden_egg"; +F chicken, civ_chicken, miniciv_chicken, sheep, civ_sheep, miniciv_sheep.
- harp: trait "desire_harp"; attractor "waypoint_harp"; +F crystal_sword, civ_crystal_golem, miniciv_crystal_sword.
(alien_mold, computer, golden_egg, harp all: force_look_all_chunks, mobs, units_always_aggressive, is_forced_by_trait.)
- possessed: force_look_all_chunks; +E nature, ruins, abandoned (the first is ignored because nature never foes; effectively hostile to everything except nature kingdoms).
- crabzilla: mobs; +tag crab; +F crab, civ_crab, miniciv_crab.
- ants: mobs; +tag nature_creature; +F good, neutral, nature_creature, living_houses.
- golden_brain: mobs, brain, not danger; +tag neutral; +F orc, bandit, neutral, civ, nature_creature, living_houses, snowman.
- corrupted_brain: mobs, brain; +tag mad.

## 3. Kingdom AI, kings, succession, capital, fracture

### 3.1 Kingdom AI loop
- The AI object only exists when the global AI-test flag is on (it is on in normal play; treat as always on).
- Job library has one job, `kingdom`, whose task list repeats forever in order: `do_checks`, `wait1`, `wait1`.
- Task library entries: `nothing` (no actions), `wait1` (one action: set the kingdom's action timer to a uniform random value in [0,1] s), `wait_random` (same with [0,5] s; defined but unused), `do_checks` (3 actions in order: check capital, check king, then random wait [0,1] s).
- Execution model: when the kingdom's action timer is <= 0 the AI executes exactly ONE action (not one task) then returns. All actions return "continue" except wait actions which also set the timer. So `do_checks` runs capital-check and king-check on consecutive frames, then waits U(0,1) s; then there is one extra frame to roll over to the next task; then `wait1` (U(0,1) s), `wait1` (U(0,1) s), loop. Mean cycle approx 1.5 s of sim time between successive king/capital checks.
- Initial timer on creation is 5 s. (Kingdom AI has no war/expansion logic; those are in the diplomacy manager (4-5), plots (8), city logic and king unit decisions.)

### 3.2 Capital check
- If the kingdom has no cities: nothing.
- If it already has a living capital: nothing.
- Otherwise capital = the city with the most buildings (strictly greater wins; first city wins ties). Setting a capital stores its id, remembers it as "last capital", and moves the kingdom's location to the city centre. Setting an invalid capital clears the id.
- A capital is cleared when that city leaves the kingdom.

### 3.3 King check (the succession algorithm) - runs every AI cycle
Step 0: if the new-king timer > 0: do nothing.
Step 1 (king alive): if the kingdom has a living king:
 - If king age > 45: 5% chance per check to add trait `golden_tooth`.
 - If the king has no clan: create a new clan founded by the king (with default traits; this immediately makes it the royal clan, see 3.5).
 - End.
Step 2 (no king): clear the king reference, then:
 A) **If the kingdom has a royal clan id** (a clan that last ruled):
   1. Find an heir from the royal clan (3.4a).
   2. If none and (kingdom culture has trait `unbroken_chain` OR the world law "rebellions" is disabled): pick a king from the city leaders (3.4b).
   3. If a king was found by either route: crown them (3.6). If additionally the culture has trait `shattered_crown` and the old royal clan still exists, run the shattered-crown event (3.8).
   4. If NO king found: if the kingdom has exactly 1 city and its capital has a leader, that leader is demoted from leader and becomes king (no move needed); if it has more than one city: run kingdom chaos (3.7). (A one-city kingdom without a leader just stays kingless and retries.)
   5. If the old royal clan no longer exists (null/dead), the royal clan id is reset to none (after the above).
 B) **No royal clan id**: pick the king from city leaders (3.4b); if found crown them; else run kingdom chaos (3.7).
A kingdom with no cities having leaders simply has no king until a leader appears.
Note: the new-king timer is set to U(5,20) s whenever a king is removed (death, abdication, conquest, becoming a rebel), so a kingless kingdom waits that long before succession.

### 3.4 Candidate selection
a) From royal clan: candidates = clan members who (i) belong to this kingdom, (ii) are alive and belong to a civ kingdom, (iii) are not already king. If the kingdom has a culture, order candidates by culture rules, else oldest first; take the first.
 Culture-based ordering (primary key last-applied wins; ties fall back to the earlier key, order of ties otherwise unspecified):
   - base key: oldest first (by creation time); reversed to youngest first if culture trait `ultimogeniture`.
   - then ONE of (first matching in this order): trait `diplomatic_ascension` -> highest "diplomacy" stat first; else `warriors_ascension` -> highest "warfare" stat; else `fames_crown` -> highest renown; else `golden_rule` -> most money.
   - then, as the dominant key, if trait `patriarchy` -> males before females; else if `matriarchy` -> females before males.
b) From leaders: candidates = the leader of each city of the kingdom (including the capital's). For each leader roll an "attribute dice" and pick the highest roll (first one wins ties; strictly greater replaces).
 Attribute dice: let M = floor(diplomacy + warfare + stewardship stats). If the leader's culture has `patriarchy` and leader is male, or `matriarchy` and leader female, M += 999. Roll two independent uniform integers in [0, M) (as the engine's randomInt(0,M), upper exclusive; M = 0 gives 0) and add them. A null candidate scores minimum int.

### 3.5 Royal clan rules
- Whenever a king is crowned or a king gets a new clan: if the king has a clan whose id differs from the stored royal clan id: if the old royal clan is still alive log "royal clan changed"; else if the new clan renown >= 10 log "new royal clan"; then store the king's clan as the royal clan. So the royal clan always becomes the current king's clan.
- When a clan is removed: for each kingdom whose royal clan it was, if clan renown >= 10 log "royal clan lost" (the id itself is reset by 3.3 A5).
- City leader selection prefers clan members, see 3.9.

### 3.6 Crowning (make king and move to capital)
1. If the new king belongs to a city: remove from army; if they were city leader, vacate that city's leader slot.
2. If the kingdom has a capital and the king's city differs: join the capital city.
3. Set king: profession becomes King; kingdom total_kings +1; ruler list gets an entry (max 20 retained, oldest dropped; previous ruler's end time is closed); crown timestamp = now; unit gets happiness event "become_king"; royal-clan update (3.5).
4. World-log "new king".
Setting a king never touches the new-king timer; removing one does.

### 3.7 Kingdom chaos / fracture (no heir)
- Candidate cities: all cities except the capital that have a leader. If none: nothing happens.
- For each candidate city in random order: if its leader is alive, the city leaves the kingdom and forms its OWN new civ kingdom with that leader as king ("fell apart", not a rebellion: no rebellion statistic; units get happiness "kingdom_fell_apart"; the new kingdom copies culture/language/religion of the old kingdom then those of the city).
- If at least one split happened: the main kingdom leaves its alliance (if any); world-log "fractured kingdom". Note the new kingdoms are NOT put at war with the old one and are not in the alliance.

### 3.8 Shattered Crown event (culture trait `shattered_crown`, only when world rebellions law is on)
Triggered after a successful succession from the royal clan (3.3 A3).
1. Candidate pretenders: royal-clan members who are valid, not the new king, not any kingdom's king. Candidate cities: all non-capital cities. Need both lists non-empty, else nothing.
2. Shuffle both. Pair pretender with city one by one until one list runs out: if the pretender is a city leader, vacate; the city becomes the seat of a new kingdom ruled by the pretender (fell apart style as in 3.7), pretender leaves army and joins that city. Record new-kingdom city counts (main kingdom starts with all its cities and decrements per split).
3. Remaining unpaired cities (if cities > pretenders): each is assigned to a RANDOM one of the new kingdoms only if that new kingdom currently has FEWER cities than the main kingdom; otherwise it stays with the main kingdom. (Join is flagged as rebellion: city rebellion stat +1, happiness "just_rebelled".)
4. If anything split: main kingdom leaves its alliance; world-log "shattered crown".

### 3.9 City leaders (feeds succession)
Every city AI cycle (cities need >= 3 units and not being captured and no leader): choose from unit pool of the whole kingdom: units that are fit to rule (alive, civ kingdom), not king, not leader, with a clan. Royal-clan members have priority; else other clan members; sorted with 3.4a rules using the city's culture. If found: leave army, join city, become leader. Fallback: among the city's units that are plain citizens (not king/leader), roll attribute dice (1 die; +2 dice if flagged favourite) and pick the highest. Leaders without a clan get a new clan.

### 3.10 King side effects
- King removed (death, leaving): profession reverts to plain unit (if still alive), current ruler record closed; new-king timer U(5,20) s. If it left alive: happiness event "lost_crown". If the king died: the world log records a murder if killed by an actor, else a plain death. The kingdom keeps existing.
- Killing a king gives the killer trait `kingslayer`.
- King's unit-level decisions (profession "king"): `king_check_new_city_foundation` (priority moderate, cooldown 60, weight 3, adult only; requires world law "kingdom expansion" on AND the kingdom has no wars; see 3.11), `king_change_kingdom_language/culture/religion` (cooldown 10 each, weight 1; run only when the king's own language/culture/religion exists and differs from the kingdom's; effect: kingdom adopts the king's), `claim_land`.
- Max cities: base = species' `civ_base_cities` + king's "cities" stat, minimum 1. "Aggression dice": false without a king; true if city count < max; else true with probability = king's `personality_aggression` stat (used by plots, 8).
- `happy`/loyalty: city is "happy" when loyalty >= 0 (loyalty is outside this spec).

### 3.11 King-driven city founding (summary)
Preconditions: kingdom has a capital; no kingdom city within reach of the capital has <= 30 units (all cities must be well populated); free settlement zones exist. Candidate source cities: cities with >= 30 adult population that do not need settlers (shuffled). For each: BFS outward over zones in waves from the city's neighbour zones that have no city, up to 4 waves; only zones found at wave 3+ (i.e. at least ~3 zones away) that are good for a new city and on the same island qualify; one random qualifying zone is taken. If no same-island zone exists for any source, a source city with transport boats may pick the nearest reachable settle-able zone on another island. Result: new city founded there, and up to 6 adult units (plus lovers and family, counted toward the 6) are moved from the source city; excluded: leaders, the king, army members, army leaders, units whose lover is the king or a leader.

## 4. Opinions and diplomacy

### 4.1 Model
- There is no explicit "diplomatic state" machine in use (an enum War/Ally/Clear exists but is unused). Relations are derived: at war = listed in an active war on opposite sides; allied = same alliance; otherwise neutral.
- A `relation` object exists per unordered kingdom pair (key by the two ids, larger id first). It stores only `timestamp_last_war_ended` (default 0 = world start; so for pairs that never fought, "years since last war" equals the world's age in years) and caches two directed opinion results. It is created lazily on first query and deleted when either kingdom is removed.
- Opinion A->B (how A feels about B) is recomputed from scratch on every query: total = sum of all opinion-factor values (integers, truncated toward zero where noted); non-zero factors are stored for display. Opinions are NOT stored/decayed over time; they are pure functions of current state. Opinion is asymmetric in some factors.
- "Opinion is good" means total >= 0.
- Every 2.0 s of unpaused time the diplomacy tick recomputes **kingdom power** for every kingdom: `power = warriors*2 + cities*5 + 1` (warriors = total warrior-profession units), sorts descending, and records `supreme` (highest) and `second` (2nd). Supreme matters for opinions and alliance rules. (Ties: sort order unspecified.) `superpowers` list exists but unused. (An achievement check also runs here - ignore.)

### 4.2 Opinion factors (all of them; value is for A = "main" looking at B = "target")
Let culture/religion/language compare by identity of the meta object. "canHavePrejudice(king)" = the king unit has emotions (a species/unit capability flag).
1. `opinion_king`: if B has a king: + floor(B.king.diplomacy stat). Else 0.
2. `opinion_kings_mood`: if A has a king: + floor(A.king "opinion" stat). Else 0.
3. `opinion_is_supreme`: -100 if B is the supreme kingdom AND the world has >= 3 civ kingdoms; else 0.
4. `opinion_borders`: -25 if the kingdoms are "close" (4.3), else +25. (Always non-zero; labelled "close borders"/"far borders".)
5. `opinion_far_lands`: +60 if NOT close, both have capitals, both capital tiles exist and are on the same island; else 0.
6. `opinion_in_war`: -500 if A treats B as enemy (i.e. at war, for civs); else 0.
7. `opinion_same_wars`: if not enemies: +50 if A and B are on the same side of some war; else 0.
8. `opinion_species`: both kings exist and A's king can have prejudice: +15 if same species (kingdom species), else -10. Else 0.
9. `opinion_zones`: d = floor((A.total_zones - B.total_zones)/5) (integer division toward zero; zones = sum of city zone counts); if d > 0 -> 0; clamp to >= -20. So a LARGER target (B more zones) makes A dislike B (negative up to -20); smaller targets give 0.
10. `opinion_peace_time`: if not enemies: y = years since the pair's last war ended; if y <= 5 (minimum_years_between_wars) -> 0; else min(floor(y), 20). For never-fought pairs y = world age years.
11. `opinion_power`: p_main = A.cities*5 + A.people; p_target = B.cities*5 + B.people; diff = p_target - p_main; if diff > 0: + floor(diff/10) (positive: A admires stronger B, unbounded); else 0. (people = non-boat population.)
12. `opinion_loyalty_traits`: only if B has a culture AND both kingdoms have kings. Take B's king's traits: for each trait with a non-zero "same_trait_mod" that A's king also has, add that mod; for each trait with a non-zero "opposite_trait_mod", add that mod once per opposite trait that A's king has. (Per-trait mod values live in the unit-trait library, outside this spec.) Else 0.
13. `opinion_culture`: if B has a culture: +15 if A's culture is the same culture, else -15 (including A having none). Else 0.
14. `opinion_religion`: same pattern, +15 / -15, only if B has a religion.
15. `opinion_language`: same, +15 / -15, only if B has a language.
16. `opinion_subspecies`: needs A king (and A king prejudice-capable) and different kingdom species: +10 if both kingdoms' main subspecies are the same, else -10. If same species -> 0.
17. `opinion_clan`: both kings exist, same subspecies, both have clans, A's king prejudice-capable: +40 if same clan, else -40.
18. `opinion_in_alliance`: +30 if both in the same alliance.
19. `opinion_truce`: if not enemies: +100 if years since pair's last war ended <= 5; else 0. (Stacks with nothing negative; note peace_time is 0 in that window.)
20. `opinion_world_era`: the current world era's "bonus_opinion" (added for every pair). Era values: age_hope +15, age_sun +5, age_dark -5, age_chaos -35, age_ash -10, age_despair -10; other eras 0.
21. `opinion_baby_king`: A has king, B has king; if A's king is NOT a baby and B's king IS a baby: -50; else 0.
22. `opinion_ethnocentric_guard`: A's culture has trait `ethnocentric_guard`, A and B share the same main subspecies, and B's culture differs from A's: -50; else 0.
23. `opinion_xenophobic`: A's culture has trait `xenophobic` and main subspecies differ: -50.
24. `opinion_xenophiles`: A's culture has trait `xenophiles` and main subspecies are the same: +20.
(Culture/subspecies values: "main subspecies" of a kingdom = the king's subspecies, else the first unit's.)
Typical neutral far-apart pair: borders +25, far_lands +60 (if same island) -> positive. Neighbours: -25. War: -500.

### 4.3 "Close" kingdoms
Two kingdoms are close if any city of A and any city of B have "nearby borders" (city-level proximity test; defined in territory code, not in this area - treat as: borders touching or within a small gap; exact radius unclear).

### 4.4 Choosing war and alliance targets (used by plots 8)
**isWarNeeded(K)** (all must hold):
- K has cities and a capital.
- K has not ended a war within the last 5 years (diplomacy_years_war_timeout = 5; ignored if K never had a war, timestamp unset).
- K currently has no wars.
- K's total warriors > 10 (diplomacy_years_war_min_warriors).
- If K has fewer than 4 cities: if there are NO free city sites anywhere -> war needed (true, stop); else if free city sites > 200 -> false; else if population < 60% of the kingdom's total possible population (sum of city housing maximums) -> false. (K with >= 4 cities always passes this step.)
**getWarTarget(K)**: army_K = K's warriors (or alliance total if K in an alliance). Candidate = every other kingdom not at war with K and not in K's alliance, with cities and a capital and age >= 5 years (minimum_kingdom_age_for_attack), whose army (or alliance total) <= army_K, whose capital is reachable (same landmass) from K's capital, whose last war with K ended >= 5 years ago (minimum_years_between_wars), and for which K's opinion of the candidate is NEGATIVE (< 0). Pick the candidate with the smallest squared distance between nearest city pair (distance -1 if either has no cities is guarded by the cities check).
**getAllianceTarget(K)**: none if K is supreme. Candidates: kingdoms not at war with K, with no wars, no alliance, not K's alliance-mate; random order; first that: has a king, is not supreme, king has no active plot, K's opinion of it >= 0, its renown >= the alliance plot's min kingdom renown (see plot `alliance_create`), AND ( (both have <= 2 cities and neither has any neighbouring kingdoms) OR (the two are "close") ).
**isThereActiveCityConquest / isThereFightBetween**: helper predicates (city being captured by the other; or an enemy army's captain standing in a city of the other) - used in UI/plots only where noted.

### 4.5 Direct diplomacy actions available (player powers; not AI)
- Spite event (`eventSpite(K)`): if more than 1 kingdom exists: start a total-war (type `spite`, K attacker, everyone defender) - see 5.3.
- Friendship event (`eventFriendship(K)`): pick a random war K is in; if K has no alliance K leaves that war (peace-leave); if K has an alliance every member leaves it; if the war is a total war it ends with Peace.
- Whisper of war (player picks kingdom A then B; see 5.4 for the full branch logic).
- Inspire / rebellion powers: see 9.
- Forced alliance power: `forceAlliance(K1, K2)` (6.6). Discord power: city's kingdom leaves its alliance (6.5).

## 5. Wars

### 5.1 War object
Fields: type id; main attacker; main defender (none for total war); attacker list; defender list; "past" lists (kingdoms that left via peace); "died" lists (kingdoms that left by losing/dying); winner (Nobody/Attackers/Defenders/Peace/Merged); counts of dead attackers/defenders; started-by actor/kingdom names; created time; died time (>0 means ended); a renown counter ("war renown").
Participation: attackers and defenders are lists of kingdoms. Total war: defenders are implicit = every kingdom except the main attacker (joining defenders is a no-op); `countDefenders` = kingdoms-1; a total war "has" every kingdom.
At war with each other (isInWarWith(X,Y)):
 - total war: true if X or Y is the main attacker.
 - otherwise true if X attacker & Y defender, or X defender & Y attacker. Allies on the SAME side are never at war via that war. Two kingdoms are "enemies" if any active war says so (cached; cache invalidated on any war change).
`getWar(A,D)`: only wars where A and D are the two MAIN parties (either order); with the "not only main" flag, any war where they are opposed.
Max stored: if more than 20 war records exist, ended wars (not marked favourite) are deleted oldest-ended first until 20 remain.

### 5.2 War types (all assets)
| id | attacker-named | forced | total | alliance_join | rebellion | can end via plot |
|---|---|---|---|---|---|---|
| normal | yes (name from attacker) | no | no | yes | no | yes |
| spite | yes | yes | yes | no | no | no |
| inspire | no (name from defender) | no | no | no | yes | yes |
| rebellion | no (name from defender) | no | no | no | yes | yes |
| whisper_of_war | yes | no | no | yes | no | no |
A `clash` type is referenced by a static field but never defined (dead). `forced_war` is only consulted by a "getForcedWar" lookup (main defender of a forced war) which the AI does not otherwise use. Names are generated from a naming template per type (text not reproduced).
Meaning of flags: `alliance_join` = when the war starts, all members of the attacker's alliance join the attackers and all members of the defender's alliance join the defenders. `rebellion` = used by city-capture logic (9.2) and rebel handling. `can_end_with_plot` = the peace plot (8) may target it.

### 5.3 Starting a war (startWar)
- Total-war type (spite): refuse if only one kingdom exists, or the attacker is already main attacker of an active total war. Otherwise the attacker leaves its alliance; a total war (no defender) is created; then for every OTHER (non-total) war the attacker is in: as attacker: if not main attacker leave it (peace-leave); if main attacker end that war with winner `Merged` (no win/loss effects); as defender: if not main defender leave it (peace-leave); if main defender it loses (removed as loser, may end the war with attackers winning).
- Normal types: refuse if attacker == defender or an active war already has exactly these two as main parties. Otherwise log, create the war (stat warsStarted +1, started-by recorded, name generated), and apply alliance_join if the type has it. No check that an ally is already fighting on the other side (unclear).
- On creation: renown starts at +5 per joining kingdom (so a normal 1v1 war starts at 10). If the attacker's kingdom culture has trait `happiness_from_war`, every unit of that kingdom whose own culture has that trait gets the happiness event "just_started_war".
- Who may start wars: only via (a) the AI plot `war_declare` (8), (b) player powers: whisper of war, spite drop, inspire, and (c) rebellion/inspire logic (9). Wars are NOT started by any periodic kingdom AI task.

### 5.4 Whisper of war (player-driven; two kingdom picks A then B)
- Same kingdom or cancelled -> nothing. If A is already enemy of B -> refused (tip "already in war").
- If A and B are on the same side of some wars: B leaves each such non-total war.
- If A and B share an alliance, A leaves it.
- If B is in any ongoing non-total war (random pick among B's wars) AND A and B have NO common enemy: A joins that war on the side opposed to B (B attacker -> A joins defenders; else A joins attackers).
- Else start a new `whisper_of_war` war with A attacker, B defender.
- Then A's king gets a "voices in my head" status. 

### 5.5 Participant leaving / losing (removeFromWar)
Parameters: kingdom K, `inPeace` flag. Two entry points: `leaveWar(K)` = war renown +25 then removeFromWar(K, peace=true); `lostWar(K)` = war renown +50, removeFromWar(K, peace=false), then re-run war update.
removeFromWar:
1. For every kingdom currently on the opposite side to K, set the pair relation's "last war ended" = now.
2. Remove K from attacker and defender lists; record in the "died" list if the leaving was not peaceful or K is dead, else in the "past" list.
3. If K was main attacker: if the war has another attacker, the new main attacker = the attacker (other than K) with the most warriors (sort by warriors descending, first not K); else the war ENDS (winner Peace if peaceful, else Defenders). If K was main defender: analogous with defenders; ends with Attackers if not peaceful else Peace. In total war main-defender replacement is not applicable.
4. If war continues: K's last-war timestamp = now; K "made peace" (peaceful) or "lost war" (not) effects apply (1.6).
5. Lists are rebuilt; caches invalidated.

### 5.6 Ending a war (endWar(war, winner))
Only if the war is active: stat peacesMade +1; record winner (unless Nobody); invalidate caches; log; for each kingdom still on either side: set its last-war timestamp and apply by winner: Attackers win -> attackers `won`, defenders `lost`; Defenders win -> reverse; Peace -> everyone `made peace`; Merged -> no effect. If not Merged, set every attacker-vs-defender pair relation's last-war-ended = now. Finally the war's died time = now (ended). Remaining kingdoms stay in the stored lists for history.

### 5.7 Automatic end conditions (checked every frame for every active war; first matching action only, then return)
1. Main attacker's kingdom object is dead -> main attacker loses (5.5 with renown +50; likely ends war with Defenders winning unless another attacker takes over).
2. Total war: if the world has <= 1 kingdom -> end, winner Attackers.
3. Non-total: main defender dead -> main defender loses (5.5).
4. Non-total and war age > 10 years: main attacker has 0 cities -> it loses; main defender has 0 cities -> it loses. (So a war younger than 10 years does not end just because a side has no cities.)
5. Any other attacker (or, non-total, defender) that is dead -> it loses (removed).
There is NO score/exhaustion/surrender rule: wars otherwise only end via the peace plot (8: `war_end` style plot, which ends with winner Peace), alliance merge (Merged), the friendship drop, the world-law "diplomacy off" (all wars end with Peace), or participants dying/leaving.

### 5.8 War stats
- Deaths of attackers/defenders are counted per war when a unit of one side kills a unit of the other (both civ kingdoms in the same war): counter +1 and war renown +1.
- War renown also +1 each in-game year, +5 per kingdom joining, +25 per peaceful leave, +50 per losing departure. War renown feeds the renown rewards in 1.6.
- A war's "age" is in years since creation; "duration" at end = end year minus start year.

### 5.9 Kingdom destruction in war
When a kingdom object is removed (1.5) it is removed from each war "not in peace" (so it counts as a loss). Dead kingdoms are kept in the war history (archived record).

### 5.10 Consequences during war (summary of how combat is driven)
Enemy status (2.4) drives unit targeting and city capture (9.2). City-level attack orders and armies are in 7.
