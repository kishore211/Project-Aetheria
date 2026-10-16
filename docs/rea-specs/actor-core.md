# Actor Core - Behaviour Spec

## 1. Overview

Clean-room behaviour spec of the individual creature ("actor") of a top-down god-sim, written so it can be re-implemented in TypeScript without reference to the original code. Everything below describes observable behaviour, numbers and ordering. Where the source was ambiguous it is flagged in section 7.

**Scope.** The single creature: its static template ("actor asset"), its numeric stat sheet and how that sheet is assembled, health/damage/armor/crit/knockback, combat flow, death, ageing, reproduction, hunger, happiness, experience, traits, statuses, and the tick order of the creature update. Not covered here (other specs): the AI decision/behaviour-tree system, cities/kingdoms/wars, subspecies genetics beyond what feeds the creature's stats, items/equipment catalogue, world tiles, spells.

**Conventions used throughout**
- Time is "world seconds" (ws). 1 month = 5 ws, 1 year = 12 months = 60 ws. A creature's age in years = floor((now - birth_time) / 60) + an "age overgrowth" offset (default 1; set to a larger value for creatures spawned as adults). Durations given as "X months" convert at 5 ws per month.
- The simulation step uses a scaled delta (`dt`, seconds of world time). All timers below count down by `dt` unless stated as "real time" (a few cosmetic cooldowns use wall-clock time).
- Distances are in tile units. "Chunk" = a fixed square block of tiles used by the spatial index (neighbourhood searches use the 3x3 chunk block around the creature).
- `p%` / "chance p" means an independent uniform roll succeeding with probability p. "int(x)" means truncation toward zero. "clamp(x,a,b)" as usual.
- "Stat" always means an entry of the creature's computed stat sheet (section 4.2); "asset" means the static template record.
- A creature always belongs to a "subspecies" (a per-population genome/trait record) if its asset allows subspecies; the subspecies supplies most innate stats and the metabolism/reproduction rules. Creatures of assets without subspecies fall back to the asset's own base stats (ants, boats, a few specials).

**Big picture.** A creature is a record (data) + a template (asset) + modifiers (traits, statuses, equipment, subspecies, clan, culture, language, level). Every time any modifier changes, the stat sheet is marked dirty and recomputed once on the next tick. Each tick the creature runs a fixed pipeline of checks (timers, tile effects, enemy targeting, AI). Hunger, ageing and natural death run on slower clocks. Combat is cooldown based; a hit is damage rolled in a range, reduced by armor percent, applied to health, with knockback and secondary effects. Death is triggered from health<=0 and processed in a deferred step.
## 2. Data model

### 2.1 Creature record (persistent state)
| Field | Type / range | Meaning |
|---|---|---|
| id | int64 | unique |
| asset_id | string | template id |
| name | string | generated at birth |
| sex | Male / Female / None | None = asexual species |
| created_time | ws | birth time (age base) |
| died_time | ws | set once when alive flips false |
| age_overgrowth | int, default 1 | years added on top of elapsed years (adult spawns set it to the template's adult age or the subspecies' breeding age) |
| health | int, default 100 (real value set at spawn to max) | current HP; clamped to [0, max] (setting directly clamps to [1, max]) |
| nutrition | int, 0..max_nutrition | hunger store (0 = starving) |
| happiness | int, -100..100 | mood; ratio = (h+100)/200 |
| stamina, mana | int, 0..max | resources |
| level | int 1..9999 | |
| experience | int | xp toward next level |
| renown, kills, births, food_consumed | int counters | |
| generation | int, default 1 | max(parent generations)+1 for newborns |
| parent_id_1/2, lover, best_friend | ids (-1 = none) | |
| family, clan, culture, language, religion, subspecies, army, city, kingdom, plot | meta-group ids | creature adopts the stats/effects of its groups |
| diplomacy, warfare, stewardship, intelligence | personal float attributes (start 0) | grow during life (4.6), added into stats |
| traits | set of trait ids | |
| equipment (weapon/armor/boots/helmet/ring/amulet), inventory, loot, money, favorite_food | | equipment contributes stats (4.2) |
| phenotype index/shade, profession | | profession in {Nothing, Unit, King, Leader, Warrior} |

### 2.2 Runtime-only state
stats (sparse stat sheet + tag set), active statuses (id -> timer), combat-action pool and spells (rebuilt with the stat sheet), attack_timer (cooldown), timer_action (wait timer), target-scan timeout, ignored-target set (cleared every 3 s), aggression list (ids that attacked this creature), attack_target, last attack type, attacker reference, shake state, velocity/height (knockback physics), cached flags (is baby/adult/egg, has weapon, immovable, ai-frozen, unconscious, has-emotions...), a 20-entry queue of recent happiness events, a stats-dirty flag.

### 2.3 Actor asset (template) fields that affect simulation
Defaults in brackets. Visual/audio/naming/UI fields are omitted.
- Base stats (`base_stats`): sparse stat sheet. For subspecies-capable assets almost all innate numbers (health, damage, speed, lifespan, armor, stamina, offspring, birth_rate, mutation, attributes) come instead from a **genome budget** (section 2.6) summed into the subspecies' stats.
- `default_attack` ["base_attack"; humanoid civ template "hands"; animal template "jaws"]: id of a pseudo-weapon used when no weapon is equipped; its stats (damage_range, range, projectiles, crit...) merge into the creature's stats (2.5).
- `only_melee_attack` [false] forces melee and resets `range` to the asset's own range (zombies).
- `actor_size` enum S0_Bug..S17_Dragon (0..17) [S13_Human]: used for rules such as "very large" (>= S17) and display; the hit radius is the `size` stat, not this.
- Flags: `flying`, `hovering`, `very_high_flyer`, `ignore_blocks`, `die_on_blocks` [true], `move_from_block` [true], `die_in_lava` [true], `damaged_by_ocean` [false], `force_ocean_creature`, `force_land_creature`, `ignore_tile_speed_multiplier`, `run_to_water_when_on_fire` [true], `cancel_beh_on_land` [true], `update_z` (uses height/gravity physics), `can_be_killed_by_stuff` [false; true for normal creatures; targets lacking it cannot be attacked], `can_be_moved_by_powers` (knockback allowed), `can_be_hurt_by_powers`, `skip_fight_logic` (never fights/never targeted by fight logic), `can_attack_buildings`, `can_attack_brains`, `immune_to_injuries` (no injury traits from hits), `immune_to_slowness`, `immune_to_tumor`, `can_level_up` [true], `has_ai_system` [true], `has_baby_form`, `use_items`, `take_items`, `can_receive_traits` [true], `has_soul`, `source_meat`/`source_meat_insect` (counts as meat food), `civ`, `special`, `unit_other`, `default_animal`, `is_boat`, `has_sprite_renderer`.
- `allowed_status_tiers` [Advanced]: statuses have a tier (Basic=1, Advanced=99; default Basic). A creature rejects a status whose tier is greater than the asset's allowed tier. `None` rejects all statuses; `Basic` rejects the Advanced ones. Boats, dragons, UFO, god finger, crabzilla, golem-like specials use Basic/None.
- `nutrition_max` [100], `months_breeding_timeout` [3] (afterglow = 3 x 5 = 15 ws breeding cooldown), `age_spawn` [18] (age given to adult spawns), `experience_given` [10] (xp and renown awarded to a killer; dragon 100), `base_throwing_range`, `species_spawn_radius` etc. (world-gen only).
- Lists: `traits` (innate trait ids), `traits_ignore`, `default_subspecies_traits` (added through the subspecies-trait list), `default_weapons` (one picked at random at spawn), `spell_ids`, `decision_ids`, `kingdom_id_wild`/`kingdom_id_civilization`, `evolution_id` + `can_evolve_into_new_species`, zombie/mush/tumor/skeleton transformation ids, `genome_parts`.
- Template inheritance: assets are produced by cloning a parent then overriding; a clone copies all fields including base stats, genome budget, traits and subspecies-trait lists; later assignments override a stat key, the genome-budget call adds to the budget value, trait lists append.

### 2.4 Stat sheet container
A sparse map statId -> float plus a set of string tags. Operations:
- read missing stat -> 0.
- assign value: if value == 0 and the stat is not "normalized" the entry is removed; otherwise created/overwritten.
- merge(other, k=1): for each entry add value*k to this sheet; union the tags.
- apply multipliers: every multiplier stat (those with `multiplier=true`) multiplies its target stat once: target += target * multiplierValue. Several multiplier sources are first summed (all flat adds), so the result is base * (1 + sum of multipliers). Only existing target entries are multiplied.
- normalize: for every present entry whose stat has `normalize=true`, clamp to [normalize_min, normalize_max].
Tags are valueless flags used as capabilities: e.g. immovable, frozen_ai, unconscious, stop_idle_animation, immunity_fire, immunity_cold, strong_mind, steal_items, generate_light, love_peace, fast_swimming, can_read_any_*.

### 2.5 Default-attack pseudo weapons
Melee ones (base_attack, hands, jaws, claws, bite, fire_hands(+flame modifier)) contribute only `damage_range` = 0.5. Ranged ones add: `rocks` range 15, crit chance 0.1, crit multiplier +0.5, projectiles 1, damage_range 0.6; `snowball` range 6, crit 0.1, crit mult +0.5, projectiles 1, damage_range 0.6 (+ice modifier). Boat weapons (boat_cannonball, boat_arrow, boat_snowball, boat_plasma_ball, boat_necro_ball, boat_fireball, boat_freeze_ball, boat_acid_ball) are in the boats table (5.9). A weapon with no stats leaves `damage_range` absent, which reads as 0 (see Open questions).

### 2.6 Genome budget (how asset numbers become innate stats)
For subspecies-capable assets the asset lists a budget per stat (e.g. health 100, damage 15, speed 10, lifespan 70, plus special tokens). At creature-population creation the budget is split greedily into discrete "genes" of fixed sizes (table 5.8); each gene adds its fixed amount, so the sum of genes for each stat is at most the budget (remainder that no gene fits is dropped). Result: the subspecies' innate stat = (asset base_stats entries) + (sum of its genes' amounts) + subspecies-trait stat mods. For re-implementation it is acceptable to treat the budget as the innate stat directly (the greedy split reproduces the budget to within the smallest gene size; the intended design also allows later mutation of genes). A mutation-stat budget (`mutation`) is meta-data (max number of random birth traits and mutations), not a combat stat. Special tokens: `bonus_sex_random` (N genes giving a bonus to males or females, 50/50), `bad` (N harmful genes).
## 3. Update loop

All creatures live in one batch container and are processed job-by-job (each job loops over all creatures, then the next job runs). "Skip rest" below means: the creature's remaining checks for this tick are skipped. There are two skip scopes: **update-skip** (all later steps including movement) and **behaviour-skip** (only the b-steps; the movement integration step still runs).

### 3.1 Per-frame order (one simulation step, `dt` = scaled delta)
World-level order around creatures: cities -> **creatures** -> buildings -> ... -> kingdoms/wars/subspecies/plots -> projectiles -> **status manager** -> era manager. Once per frame the enemy-search cache is cleared before creatures run. World time advances by `dt`; when the calendar year changes, every creature's yearly update runs (3.3).

**Phase A (computed for every live creature, order fixed)**
1. *Timers* (every tick): clear `attacker` if it died; tick jump timer; refresh current tile and in-liquid flag; apply gravity if the asset uses height physics and height != 0; if inside a boat stop here. Then (not paused and alive): apply velocity/knockback integration, tick `attack_timer` down by dt (while >= 0), tick the target-scan timeout, tick `timer_action` down by dt (while >= 0), tick the ignored-targets timer (only for creatures that can fight; it clears the ignore set every 3 ws), grow/shrink sprite scale toward `scale` stat at 0.2 per ws, and every 6th tick while moving recompute movement speed (4.13).
2. *Visibility* (cosmetic).
3. *Stats*: if the stats-dirty flag is set, rebuild the stat sheet (4.2). Dirty creatures are queued when marked, so the rebuild occurs before any behaviour that tick.

**Phase B (post jobs, strictly in this order)**
1. Become-adult events for creatures flagged this frame (4.6).
2. Hatch events (egg -> hatchling).
3. Landed events (after knockback/falling ends).
4. **Hunger tick** (only runs on frames where the global 15-ws nutrition timer has expired, see 3.2).
5. Inside-check: if the creature is in a boat, snap to the boat tile and update-skip.
6. Child components and sprite animation (visible only; no gameplay effect).
7. Dead-check: if dead run the corpse fade and update-skip; else if being magnet-lifted or `under_forces` (mid knockback) update-skip.
8. Current-tile action (4.13) - only for creatures with `can_be_killed_by_stuff`, only at height 0 and not flying.
9. If ai-frozen (tag `frozen_ai`) or unconscious (tag `unconscious`) update-skip.
10. Trait special effects (4.11) - job skips a random 0..20 frames between runs.
11. If `timer_action >= 0` (the "wait" timer) update-skip; if dead update-skip.
12. If knocked into the air (`under_forces`, or height != 0 for height-physics assets) behaviour-skip.
13. Validate/execute current attack target (4.4); if it consumed the tick behaviour-skip.
14. Scan for a new enemy (4.4) - job skips a random 0..5 frames between runs; if a target was found: stop moving, behaviour-skip.
15. Task verifier (if the running AI task has a verifier that returns Stop, cancel the task + behaviour-skip); otherwise if moving behaviour-skip.
16. If following a path, advance the path and behaviour-skip.
17. Choose a new decision (only if asset has AI, not unconscious, not possessed).
18. Natural-death roll (4.7) - only when the AI is between actions (action index 0), same gating as above; job skips a random 0..20 frames; if it kills, behaviour-skip and update-skip.
19. AI step (advance current task/behaviour).
20. Movement integration (4.13) unless immovable.
21. Shake, hover, pollination upkeep; then **death processing** for creatures whose health reached 0 this frame (queued at hit time; processed once per frame after everything, skipped only while a UI window overlays the screen).

Note on job skips: the "0..N frames" random skip is a property of the job (shared by all creatures), re-rolled after each run: the job runs, then waits a random number of frames in [0, N] before the next run.

### 3.2 Slow clocks
- **Hunger/nutrition tick**: a single global countdown timer of 15 ws. When it is <= 0 (and the world is not paused) every creature that needs food, is not an egg, and whose subspecies lacks the `energy_preserver` trait runs one nutrition tick (4.8) in the Phase-B hunger step; the timer is reset to 15 ws at the end of the frame. The timer counts down by `dt`.
- **Yearly update** (age tick, 3.3): fires for every creature on the frame the calendar year number changes (every 60 ws).
- **Status manager** (once per frame, after creatures): every status ticks down its remaining time; statuses with an action fire it every `action_interval` ws (first firing after one interval); when remaining time reaches 0 the status is finished (its finish-action fires if the owner is alive) and removed at the end of the pass.
- **Trait special effects**: see step 10 above and 4.11.
- **Enemy scan timeout**: after each scan attempt the creature waits `0.1 + U(0,1)` ws before scanning again (this countdown uses the unscaled fixed step, not the time-scaled dt).
- **Damage cooldown (real time)**: a creature that was flashed by damage in the last 0.3 real seconds is "under damage cooldown"; environmental damage (lava, water, drowning, block damage) is suppressed during it. Stamina drains from swimming also use a 0.3 real-second cooldown.
- **Shake (hit immunity window)**: every damaging hit starts a 0.3 ws shake (counts down by scaled dt). While it is active, any further hit that carries the "skip if shaking" flag is ignored entirely. Carry the flag (ignored during shake): melee weapon hits, burning, poison, ash fever, starvation, drowning, lava/fire tiles, ocean damage, heliophobia, block/gravity damage. Do not carry it (always land): projectile hits, infection, plague and tumor damage, instant "full health" kills (old age, divine, etc.).

### 3.3 Yearly update (per creature)
1. Growth state check (egg/baby/adult flags recomputed; may queue hatch/become-adult events).
2. If a subspecies exists: run the subspecies' growth hooks (e.g. a trait that adds a random negative trait each year) and with 30% chance add +1 to one of the four personal attributes (diplomacy, warfare, stewardship, intelligence), chosen at random weighted by that subspecies' attribute genome (each attribute point in the genome = one ticket; no tickets = no gain).
3. If the creature belongs to a city: +20 xp if it is the king, +10 xp if it is a city leader.
4. If sapient, age > 300 and has trait `immortal`: 50% chance to gain trait `evil`.
5. If age > 40: 30% chance to gain trait `wise`.
## 4. Mechanics

### 4.1 Derived quantities (reading the stat sheet)
- maxHealth = int(health); maxStamina = int(stamina); maxMana = int(mana). Health can never be set below 1 by a direct "set"; damage can reduce it to 0 (death trigger, 4.7).
- Attack cooldown (seconds) = 1 / attack_speed. attack_speed is clamped to [0.5, 10] so cooldown is within [0.1, 2] ws.
- Attack reach: a target is in range when squared distance < (range + target.size)^2 (centre to centre).
- Healing helpers: "restore X% of max" = int(maxHealth * X) added, clamped to max.
- Offspring cap = ceil(offspring). Hungry = nutrition/maxNutrition <= 0.5. maxNutrition = int(asset.nutrition_max + subspecies max_nutrition meta stat) (big_stomach trait: +100).
- Happiness ratio = (happiness + 100) / 200; "happy" if no emotions or ratio >= 0.6; "unhappy" only with emotions and ratio < 0.3.
- Age ratio = age_years / lifespan. "Pretty old": age >= 2, age >= adult age, ratio > 0.7.
- Mass in kg (display) = int(mass_2 * (target_scale / 0.1)).
- Water damage per tick = max(1, int(maxHealth * 0.1)).
- Starvation damage = int(maxHealth * 0.05).

### 4.2 Stat sheet assembly (the aggregation pipeline)
The sheet is rebuilt from scratch whenever it is dirty. **Triggers** that mark a creature dirty: trait added/removed; status added or finished; equipment changed or an equipped item's durability hit 0; level up; asset change; joining/leaving a clan, language, culture, subspecies, kingdom/city where effects apply; age-state changes (hatch, become adult) ; subspecies/clan/etc. trait or genome changes (these mark all their members dirty); some world-era changes for era-conditional traits; spawn. A dead creature clears the flag without rebuilding.

Rebuild order (all "merge" = add numbers, union tags; the order matters only for the multiplicative steps and normalizations noted):
1. Start empty. Reset: attack hooks, get-hit hooks, special-effect registry, combat-action pool, spell list.
2. **Innate base**: if the creature has a subspecies, merge the subspecies stat sheet and then the subspecies' male-bonus sheet (if male) or female-bonus sheet (anyone else). Otherwise merge the asset's own base stats. (The subspecies sheet = asset base stats + genome genes + subspecies traits' stats; floored at health>=1, damage>=1, lifespan>=1, speed>=1.)
3. Merge clan stats (and clan male/female bonus), language stats, culture stats (culture traits).
4. Add the creature's personal attributes into diplomacy, stewardship, intelligence, warfare.
5. Merge each active status's stat mods (and register its decision hook; note whether any active status is "removed on damage").
6. If no weapon is equipped, merge the stats of the asset's default-attack pseudo weapon (2.5).
7. Attack kind = melee if asset.only_melee_attack else the equipped weapon's (or default attack's) kind.
8. Merge every trait's stats, skipping era-conditional traits whose era flag is currently off (moon-child traits need a "moon" era; night-child traits need the darkness overlay).
9. If the creature has status `budding`, double the four attributes.
10. If sapient and king or city leader: pick a personality: start "balanced" (high = diplomacy); if diplomacy > stewardship -> "diplomat" (high = diplomacy); if diplomacy < stewardship -> "administrator" (high = stewardship); if warfare > high -> "militarist". Merge that personality's (hidden civ-only) stats.
11. **Level bonus** (computed from the running sums): health += level * 0.05 * health; mana += level * 0.02 * mana; stamina += level * 0.02 * stamina. (Level 1 already gives +5% health.)
12. skill_combat += floor(warfare / 5) * 0.01; skill_spell += floor(intelligence / 5) * 0.01; if level > 5 both += 0.1.
13. Collect special-effect/hit/attack hooks and combat actions and spells from traits and from the creature's subspecies, clan, language, culture, religion (combat actions: traits, subspecies, clan, religion; spells: traits and equipped items). Rebuild the decision list.
14. Cache flags from tags/statuses: unconscious, generate_light, immovable, frozen_ai, stop_idle_animation, sleeping, possessed, strange urge, tantrum, peaceful, clone, sick (has trait infected, plague, or [mush_spores and asset can turn into mush] or [tumor_infection and asset can turn into tumor]); emotions flag = subspecies has the "has_emotions" meta tag. When the unconscious tag appears fresh, pick a random rotation direction.
15. **Equipment**: merge every equipped item's stats and its modifiers' stats; an item with durability <= 0 is merged at x0.5.
16. If asset.only_melee_attack: set range = asset's own base range (discard bonuses).
17. **Normalize #1**: clamp every normalized stat to its [min, max] (table 5.1).
18. Post-normalize adds: cities += int(stewardship) / 6 (integer division) + 1; bonus_towers += int(warfare / 10); mana += int(intelligence * 10) (MANA_PER_INTELLIGENCE = 10).
19. **Apply multipliers**: for each multiplier stat present, target += target * multiplier (health, damage, speed, attack_speed, lifespan, stamina, mana, crit chance, diplomacy, offspring, mass_2 targets). Mult is a sum of everyone's multipliers (additive among themselves). A target stat missing from the sheet is not created.
20. Sapient only, and not trait `immortal`: offspring = ceil(int(offspring) * f), f by age ratio r: r > 0.9 -> 0.1; r > 0.7 -> 0.2; r > 0.5 -> 0.5; r > 0.3 -> 0.8; else 1.
21. Ranged attackers: range += range * era.range_weapons_multiplier (default era value 1.0, i.e. doubles; dark/night-type eras 0.5).
22. damage += warfare / 5 (float).
23. If baby: damage *= 0.5 and health *= 0.5.
24. **Normalize #2**.
25. Clamp current health, happiness, stamina, mana down to the new maxima. If the creature has the one-shot "full stats" flag (set on spawn, hatch, become-adult) refill health, stamina, mana to max and clear it.
26. Set target sprite scale = `scale` stat; if attack_timer exceeds the new cooldown, cap it to the cooldown.

Consequences worth keeping: percentage health mods stack additively with each other and apply to (flat sum + level bonus); flat damage from warfare is added after multipliers so it is not multiplied; babies halve the *final* health/damage; crit chance multipliers do nothing when no flat crit chance exists; armor is clamped to [0,99] after summing so negative armor mods can only cancel positives.

### 4.3 Health, damage, armor, crit, accuracy, knockback, dodge (numbers)
- **Damage roll** (at the moment an attack is created): base = int(damage stat). Rolled damage = int(uniform(damage_range * base, base)), where damage_range is the stat (clamped >= 0.1 when present; weapons set 0.5-0.8; hammers 0.1; absent -> 0, so roll is uniform in [0, base]). If crit: rolled damage *= int(critical_damage_multiplier) (stat default 2; `int()` truncates, so 2.5 acts as 2).
- **Crit**: chance = critical_chance (stat, >= 0, shown as %). Rolled once per attack at attack creation (so all targets hit by that swing share it).
- **Armor**: only for attack types Other and Weapon: damage *= (1 - armor/100); then damage = max(damage, 1); then (for hits caused by another creature) the special-attack check (4.4) may stun-save; final damage is truncated to int and subtracted. Other damage types (burning/fire, poison, plague, infection, tumor, drowning, starvation, ocean, gravity, explosion, acid...) ignore armor but still go through the same floor of 1 (and the friendly-fire check when a creature caused them); only instant "full health" kills (old age, divine, boat gravity) bypass both. Armor in the sheet is capped at 99, so a hit always deals >= 1.
- **Accuracy** (ranged only): see 4.4; accuracy is clamped to [1, 10]; at 10 shots are perfect.
- **Attack speed**: cooldown = 1/attack_speed (above). Cooldown starts when an attack is executed.
- **Knockback**: attacker's `knockback` stat is the impulse strength; target receives an impulse away from the hit point of strength knockback (x1 if the blow killed it, x0.5 otherwise); the vertical impulse equals the same value (when height component is 0 it defaults to the direction magnitude). Effective only for assets with `can_be_moved_by_powers`; ignored when the creature is already airborne. Flight model: per tick height += vz * dt * D and vz -= 0.3 * D * dt, with D = min(mass * 9.8, 20); horizontal travel per tick = (direction * impulse) * impulse * dt. Apex height therefore depends only on the impulse (about impulse^2 / 0.6) while flight time is 2 * impulse / (0.3 * D): heavier creatures (higher `mass`, capped at D=20) are thrown for a shorter time and so less far. The creature lands when height <= 0 (blocked tiles stop horizontal motion). After a non-lethal knockback the landing may cancel the creature's current AI job. `recoil` stat: after an attack the *attacker* is pushed backwards with strength recoil (bows have recoil 1).
- **Dodge**: not a stat; a combat action (4.4) or the `dodge` status (1 ws) during which all attacks pass through the creature.
- **Invincible** status: damage ignored. **Shield** status: armor 90 and a shield effect.
- **Weapons break armor**: when a weapon hit lands on a target without a shield, random equipment degrades (4.4).

### 4.4 Combat flow
**4.4.1 Who can fight** - all must hold: asset does not have `skip_fight_logic`; the current AI task is not flagged "ignore fight check"; not a boat with passengers; no trait `peaceful`; not inside a building/boat; and (if the creature's kingdom is flagged "units always aggressive" -> yes) else not a baby. Eggs/babies/peaceful never start fights; they can still be attacked.

**4.4.2 Who can be attacked (attacker A vs target T; checked at targeting time and again at hit time)**
- both alive; A's asset not `skip_fight_logic`.
- T creature: asset must have `can_be_killed_by_stuff`; T not inside a building/boat; if T is flying and A's attack is melee -> no; T's current AI action may declare itself unattackable; T not in a magnet; when factions are checked (not for retaliation): if A and T are enemy kingdoms, both are civilised-kingdom creatures and neither has a tantrum, then "civilians" are spared unless the world law "angry civilians" is on: a civilian (profession flag) is not attacked/attacking if (same species or the pair has a xenophile, and no xenophobe) or (same culture and same species); trait-based cannibal check: a cannibal never targets same-species creatures of its own family, and only same-species outside the family when its own family or the target's family has mostly hungry members (no family -> no).
- T building: civilised attackers never attack own-species city towers belonging to a non-civ owner in the "civilian" case; otherwise A needs `can_attack_buildings` (any building), or `can_attack_brains` and the target's kingdom is a "brain" kingdom.
- Water rules: water creatures (and not ranged) can only attack targets that are in liquid and on the same island; a land melee attacker cannot attack a target standing in liquid (unless A is itself a water creature).
- Foe-ness itself (kingdom enemy relations) is another spec.

**4.4.3 Finding a target** - requirements: canFight; not an "in liquid and cannot attack" land creature; not under status strange_urge; no current target (if it has one but its task is not a combat task, switch to the "fighting" task); scan timeout elapsed. Procedure:
1. Set timeout = 0.1 + U(0,1) ws.
2. Fetch the *enemy list* for the creature's tile chunk and kingdom: units and buildings of kingdoms hostile to this kingdom, from the own chunk plus neighbours within chunk range 1 (3x3 blocks). The own chunk is searched first (with 80% chance when range > 0, always when range = 0); only if it is empty are rings 1.. searched, stopping at the first non-empty ring, unless the kingdom is flagged "look at all chunks" (then all rings). Under the world law "peaceful monsters", mob kingdoms neither seek nor are sought. Results are cached per chunk-and-kingdom for the frame.
3. Pick a target from the list (random iteration order): if the list has more than 50 entries, with 60% chance pick the nearest else the first acceptable; otherwise nearest. Nearest uses squared tile distance; any candidate closer than 2 tiles is accepted immediately. Excluded: dead, self, creatures with ignore-listed ids, targets failing canAttackTarget, melee attackers whose target is on a different, unconnected island (or blocked tile), and civ-kingdom creatures attacking non-tower city buildings of their own species.
4. If none and the creature has an aggression list (ids of creatures that attacked it), choose the nearest living listed creature within 30 tiles that is not stunned.
5. If a target is chosen: set it, set the "fighting" task (cancelling the current job), remember it as the behaviour target.

**4.4.4 Each tick with a target**
- Drop the target if dead/destroyed (or a building no longer usable); for two civilised-kingdom creatures drop it when the pair are no longer foes, not tantrum-ing and not in the aggression list; drop it if T is an unconscious non-foe (unless the attacker itself has a tantrum).
- If T is still attackable: let inRange = squared distance < (range + T.size)^2 and ready = attack_timer <= 0 and not rotating/falling (rotation z == 0).
  - If not inRange: if distance > 50 -> drop target; if distance > 20 and T is currently fleeing ("run_away" task) -> drop target; if distance > 3, try a "before melee attack" combat action (dash, throw bomb/torch...), and if one fires, stop for this tick.
  - If the cooldown is running (even when T is out of range) or (in range but not ready, e.g. mid-rotation): stand still (stop movement); a ranged creature may use a "before range attack" action (backstep when the target is within sqrt(0.5) x range, bombs/torches at 6..50 tiles).
  - If inRange and ready: execute the attack (4.4.5) and stop movement.
- Otherwise the AI/pathing handles approach (the "fighting" task chases the target).

**4.4.5 Executing an attack**
Preconditions when the attack is invoked by an AI behaviour (the per-tick target check skips them because it has already verified range and readiness): melee attackers cannot hit airborne targets (height > 0); no attacks while in liquid unless water creature; attack ready; in range.
1. Start the cooldown: attack_timer = 1/attack_speed; remember last-attack time (used for the 0.25 ws "just attacked" check, which lets a player-controlled melee creature deflect).
2. Compute the target point: the target's position (for a moving flying target, advanced toward its next step by 3 x size). The attack vector ends (distance - target size) from the attacker toward the target.
3. Create the attack record: crit roll, knockback, `targets`, `area_of_effect`, damage, damage_range, crit multiplier, whether the weapon is metallic, projectile id (if ranged).
4. Choose the action: if the creature has spells, can cast (no `spell_silence`, no `recovery_spell`), and is not possessed, the pool is [cast-spell x3, basic attack x6] -> 1/3 chance to try a spell first; if the spell fails (mana, per-spell chance chance*(1+skill_spell), target type, health-ratio gate, minimum distance) the creature falls back to the basic attack. Else the basic attack (melee or ranged by attack kind).
5. If an action succeeded: spend its stamina/mana costs (spell 5 stamina + spell mana).
6. 50% chance of nutrition -1 when the creature needs food.
7. If the `recoil` stat > 0 push the attacker backwards by that strength.

**4.4.6 Melee hit resolution**
1. Primary target: it must pass canAttackTarget again, must not have status `dodge`, and must lie within (area_of_effect + T.size) of the hit point (3D distance incl. height); else a miss (for the primary check).
2. On a candidate hit, in this order (each may end the attack on that target):
   a. a *player-controlled* melee creature that "just attacked" deflects: result Deflect;
   b. the defender rolls "before-hit deflect" combat actions (trait `deflect_projectile`): result Deflect (attack cancelled);
   c. if the attack is a *blockable projectile*: defender rolls "block" actions (trait `block`): result Block (cancelled);
   d. defender rolls "before-hit" actions (trait `dodge`): the hit is avoided (counts as Continue; no damage);
   e. otherwise damage: roll damage (4.3), attacker gains 2 xp (if target alive at check time), call getHit on the target with attack type Weapon, then apply knockback (x1 if the target died, else x0.5 and flagged to cancel the target's job on landing), fire the attacker's on-hit effects (poison, soul harvest, health-steal, etc.), and if the attacker needs food, is a meat eater and the dead target's asset is meat (`source_meat`) set attacker nutrition to max and count a meal.
3. AoE/multi-target: after the primary target, the attack proceeds to other enemies found in the hit tile's own chunk (range 0) in random order until `targets` successful hits are reached; each candidate must be within (area_of_effect + its size) of the hit point. Block/Deflect ends the whole attack. Default `targets` = 1, area_of_effect = 0.1.
4. The slash effect, metal clank sound, etc. are cosmetic. Weapons are "metallic" per item asset: a metallic weapon hitting a metallic-weapon wielder uses a clank sound only.

**4.4.7 Ranged attacks**
- Number of projectiles = int(projectiles stat). Spawn point = attacker position moved size*scale toward the target, at height 0.6*scale (+ own height); target point = target position + 0.2*scale (adjusted for flying targets: aim ahead; target height used if target is airborne).
- Inaccuracy: if accuracy < 10, each projectile's aim point is offset by a vector of random direction and length = ((10 - accuracy)/10) * m, where m = clamp(U(0, dist/accuracy * 0.25), 0, 2) (m is rolled once per volley, direction per projectile).
- Projectile flight: ballistic with gravity 9.8, speed = projectile asset speed (+random); arrow 20, firebomb 12, torch 15, bone 15, skull 17, cannonball/fireball/acid_ball 25, madness_ball 30, shotgun_bullet 30 + U(0,7), plasma_ball 40; default 20. While in flight, any enemy of the shooter's kingdom in the nearby chunk set whose height differs by <= 3 and whose planar-with-height distance <= projectile_size + target_size is tested with the full hit pipeline (deflect, block if the projectile is blockable [arrow, snowball, bone, rock], dodge, damage). If it lands on the ground, an area attack at the landing point (with area_of_effect) runs once; no hit = miss. Damage is rolled when the volley is created (attack record), not at impact. Projectile hits never respect the shake window. Some projectiles trigger terrain effects on impact (fire, explosions) - not creature core.

**4.4.8 Advanced combat actions** granted by traits/subspecies/clan/religion. Returns false immediately if the creature has trait `slow` or has status `recovery_combat_action`. Otherwise: take the pool for the current moment, keep entries whose stamina/mana costs are affordable and whose condition holds; pick one uniformly at random; succeed with probability chance * (1 + skill_combat); on success spend its stamina cost and add status `recovery_combat_action` for its cooldown seconds. Table 5.6 lists all actions.

**4.4.9 Taking a hit** - ordered:
1. Record attack type. If the creature has any "removed on damage" status (sleeping, laughing, singing, swearing, crying), finish them.
2. Return if the debug "ignore damage" flag is on, or if the shake window is active and the hit carries the flag (3.2).
3. Set `attacker` (clears if the attacker is gone; self-damage keeps none).
4. Return if health is already 0 or status `invincible`.
5. For Weapon hits: (clank sound), and if the attacker is a creature and the defender has no `shield` status, damage equipment (4.4.10).
6. If damage reduction applies (normal hits): for types Other/Weapon multiply damage by (1 - armor/100); damage = max(damage,1); if the attacker is a creature apply the friendly-fire stun rule (4.4.11) which can set damage to 1 or 0.
7. health -= int(damage) (min 0). Set `timer_action = 0.002` (briefly pauses AI). Fire the creature's get-hit hooks (traits thorns/bubble_defense etc.). Red flash if requested. If health reached 0 queue it for the death step. Start a 0.3 ws shake.
8. For Weapon hits on creatures that are not `immune_to_injuries` and have no shield: 2% chance to gain injury trait `crippled` and independently 2% chance for `eyepatch` (each also gives happiness `just_injured` -20 if actually added).
9. Retaliation targeting: if the creature has no target and the attacker is attackable (factions ignored) and not on the ignore list: target the attacker. If it has a melee attack and a target farther than its attack range while the attacker is closer than the current target: switch to the attacker.
10. Fire each active status's and the asset's get-hit hooks (shield spawns a hit effect).
11. If health is 0: run death callbacks immediately (4.7).

**4.4.10 Equipment wear on being hit by a weapon**
For each equipped slot with durability > 0, with 50% chance skip, else it loses durability = (attacker weapon rigidity / this item rigidity, integer division) * 4. Remember if any item reached 0 (then recompute stats). The attacker's weapon (if durability > 0, with 50% chance): melee weapon loses (sum of rigidity of the defender's non-pool equipment) / 5 / own rigidity * 4 (integer divisions); ranged weapon loses 1 with 35% chance. If the attacker's weapon reaches 0 durability its stats recompute. Applies only when both attacker has a weapon and the defender has equipment.

**4.4.11 Friendly-fire / special attack logic** (only when the attacker is a creature and normal reduction applies)
- stunChance = 0.1 by default; 0.7 if either party is possessed; 0.5 if same kingdom; forced 0 if the kingdoms are enemies. An attacker with status tantrum on a non-same-kingdom victim forces stun.
- If the victim's health ratio < 0.5 and the stun roll succeeds: damage = 1, victim is stunned (4.12), gets happiness `lost_fight`, its angry status ends, "lucky" = true; if the tantrum case: the attacker's tantrum ends; 40% the attacker's anger ends too.
- If same kingdom and not Eaten damage: with 30% (always if the attacker is possessed or angry) add the attacker to the victim's aggression list (which also gives the victim status `angry`); if the attacker is possessed, spread anger: the victim's family and clan (10-tile radius call), a baby victim's city, the victim's lover and best friend; and for kings/leaders/warriors/non-babies all armies of the kingdom (unless the attacker is a king). If "lucky": damage = 0, the attacker's target is cleared, it waits 0.3 ws and its anger ends.
- Possessed attacker (not same kingdom): victim adds aggression.
The `angry` status lasts 60 ws, ends clearing the aggression list; aggression-list members are valid targets even when not enemies.

**4.4.12 Kill rewards** see 4.7.

### 4.5 Experience and levels
- Only creatures whose asset has `can_level_up` and that are alive can gain xp. Zero xp is a no-op.
- Gain sources: +2 per melee/ranged hit that lands on a still-living target; on a kill the killer gains `experience_given` of the victim's asset (default 10; dragon 100) xp *and* the same amount of renown; +20 per year for a king, +10 per year for a city leader (only while in a city); other AI behaviours (reading books, talking with culture trait "expertise exchange", eating a food that grants xp) call the same function.
- A culture trait "fast learners" multiplies every gain by its value (integer). Cap level at 9999.
- Threshold for the next level = 100 + (level - 1) * 20. Reaching it: experience resets to 0 (surplus is lost), level += 1 (+2 if the culture has trait "training potential"), stats dirty, level-up effect. At max level xp is pinned at the threshold.
- Level effects: +5% health per level, +2% stamina, +2% mana (all computed from the pre-multiplier sums, 4.2 step 11); from level 6 on +0.1 skill_combat and +0.1 skill_spell.

### 4.6 Ageing, lifespan, baby -> adult, eggs
- **Age (years)** = floor((now - birth_time)/60) + age_overgrowth. Newborn age_overgrowth = 1 (so a creature is "age 1" at birth). Ordinary spawns keep age 1 (so assets with a baby form start as babies). Spawns flagged adult (miracle births, plot-summoned units, skeletons/aliens created by effects) set age_overgrowth to ceil(age_breeding) of their subspecies, or `age_spawn` (18) for subspecies-less assets. City migrant spawns set age_overgrowth = random integer in [age_spawn, 2 x age_spawn]. Cloning copies the original's age.
- **lifespan** (stat, years; floored at 1; 0 means "never dies of old age" only when the sheet holds exactly 0, e.g. assets without subspecies). Typical: human genome 70, elf 500; traits and statuses add flat years (table 5.3/5.5) or multiply (`multiplier_lifespan`).
- **Adult age** (years): `age_adult = min(16, 1.1 * lifespan^0.55)` for normal creatures. For sapient subspecies with lifespan > 30: adult at 16, breeding age 18. For everyone else `age_breeding = age_adult`; for sapients breeding age is capped at 18. Both are recomputed whenever the subspecies stat sheet is.
- **Life stages**: Egg (asset's subspecies has an egg form, creature age < adult age, and the status `egg` is present) -> Baby (asset has a baby form and age < age_adult) -> Adult. Creatures of assets without baby form are adults immediately. Stage flags are recomputed every stat rebuild and yearly; a change queues an event: hatching (egg -> baby) or becoming adult (baby -> adult).
- **Egg**: at birth/laying, if egg-form and age < adult: status `egg` for `maturation` months * 5 ws (maturation = sum of the subspecies' `maturation` meta stats; see table 5.7). While egg: tags immovable + frozen_ai (does nothing), armor +10, cannot be happy/sad (happiness changes rejected), does not eat (hunger tick skips eggs), cannot socialize. When the status ends, hatch event: full stats refill (health, stamina, mana), 5 ws stun (+0..10%), random knock-up, the hatch hook of the egg type, happiness `just_got_out_of_egg` +20.
- **Baby**: damage and health halved (4.2 step 23), cannot start fights (unless "always aggressive" kingdom), cannot breed, cannot work unless culture rules or age >= 8 (global `child_work_age`). Babies of subspecies with trait `parental_care` get status `invincible` for 90 ws at birth.
- **Become adult event**: stats dirty + full refill (health/stamina/mana), city citizen list dirty, happiness `just_became_adult` +30, grow-up trait mutations: roll randomInt(0,3) = 0, 1 or 2 times; each picks from the grow-up trait pot (weight = trait's `rate_acquire_grow_up`; "sapient only" traits skipped for non-sapients; traits listed in the asset's `traits_ignore` are skipped) and tries to add it (fails silently on duplicate/opposite).
- **Yearly growth**: see 3.3 (personal attributes, wise/evil, subspecies growth hooks e.g. `bad_genes` adds a random "bad" trait at 1% per year).
- **Fertility decline** (sapients without `immortal`): offspring cap multiplier by age ratio (4.2 step 20).

### 4.7 Death
**Causes** (attack-type enum, 20 values): Acid, Fire, Plague, Infection, Tumor, Other, Divine, AshFever, Metamorphosis, Starvation, Eaten, Age, Weapon, None, Poison, Gravity, Drowning, Water, Explosion, Smile.
- A death is *triggered* when health reaches 0 inside the hit routine (or by a "full health" hit). The creature is queued; death callbacks fire immediately inside the hit (trait/status/asset/tile/clan/subspecies death hooks: acid/fire drops, bombs, zombification, etc.), then the death step runs once per frame.
- **Natural death** (the `Age` cause): requires world law "old age" (default on), no trait `immortal`, lifespan stat != 0, age > lifespan, the AI between actions, and it is evaluated whenever the natural-death job runs (every 1..21 frames, creature by creature). With over = age - lifespan: probability per evaluation p = clamp(1 / (1 + exp(-5 * (over / lifespan - 0.5))), 0, 0.9). At over = 0 p ~= 0.076, at over = 0.5*lifespan p = 0.5, at over = lifespan p ~= 0.92 -> capped 0.9. It deals "full health" damage (bypasses armor/shake).
- **Death step** for a creature with health 0 that is still alive:
  1. If the last attack was Weapon and either side is a civilised-kingdom creature, log a battle marker (a battle is merged if one exists within 40 tiles, else only created for sapient victims; used for UI/audio).
  2. If an attacker creature is recorded: it receives the kill reward (below) and may pick up the victim's resources (only if the attacker belongs to a city and either the species differ or the attacker has trait `savage`).
  3. `die`: for Age/Starvation/Plague/Infection/Tumor/Divine/AshFever/Metamorphosis/None/Poison/Gravity/Drowning causes the attacker reference is cleared (so no one is credited). Then: alive=false (stamp died_time once); leave boat; increment world death counters by cause and each group's death counter; **parents' children counts decrement**; happiness events: each parent `death_child` -60, best friend `death_best_friend` -25, lover `death_lover` -50 (and the lover's `fell_in_love` status finishes), every other family member that is not a parent `death_family_member` -20; cancel tasks; leave building/home; drop equipment (all equipped items go to the city whose zone the creature stands in, otherwise destroyed; on Age death inside a city items also go to the city); remove from army; if king -> kingdom loses king + log; leave city and all metas; clear target and tile target.
- **Kill reward** (for a surviving attacker): kills += 1 (and counters on its city/clan/culture/family/language/religion/subspecies/kingdom); weapon kill counter; war death counters if the kingdoms are at war; wait 0.1..1 ws if it is not already waiting; trait `bloodlust` -> happiness `just_killed` +10; takes the victim's loot (+ money) into its own loot and its inventory resources; if kills > 10 gains trait `veteran`; killed a king -> trait `kingslayer`; xp and renown += victim's `experience_given`; trait `madness` -> heals 5% max health; sapient item users that are allowed to take items take the victim's items (not from infected victims); a rage-state check can turn the killer into a demon when the "other disasters" law and era allow it (10% per kill when status rage).
- **Corpse**: there is no persistent corpse object. The dead creature stays on the map as a falling/fading sprite and is non-interactive (not attackable, no AI): it rotates onto its side (angle lerps toward 90 deg at 4 x dt per second, for assets with a death rotation), falls to the ground (jump offset -0.05 per tick), then fades: colour from white to black over 1 ws, then alpha 1 -> 0 over 1 ws; then it is destroyed. If the renderer is in the lowest-quality mode it is destroyed immediately. Specific assets (dragon, UFO) use their own death animation.
- **Yields**: the asset's `resources_given` list (e.g. meat, bones, leather, scales) is what a civilised killer's city may collect (via the inventory-pickup rule above). Eating meat is implemented in the killer's hit (4.4.6 e) and the AI, not by corpses.
- **Transformations at death** (trait death hooks): `infected` (+asset can turn into zombie) -> replaced by a zombie creature copying the original's data, name prefixed "Un"; `mush_spores` -> mush creature and spreads spores (up to 3 neighbours within radius 3, each 30%); `tumor_infection` -> tumor monster; `cursed` status death -> skeleton (if asset has a skeleton id).

### 4.8 Nutrition, stamina, mana, starvation
- Applies to creatures whose subspecies has the `needs_food` meta tag (otherwise nutrition is irrelevant). Max nutrition = asset.nutrition_max (100) + subspecies `max_nutrition` meta stat (big_stomach: +100). Spawned creatures start at 100 (clamped to max), newborns at 25 (`nutrition_start_level_baby`), freshly created creatures at max.
- **Nutrition tick** (every 15 ws, see 3.2): nutrition -= metabolic_rate, where metabolic_rate = max(1, subspecies `metabolic_rate` stat) (integer). Then:
  - if nutrition == 0: nutrition pinned at 0; if the world law "hunger" is on (default) apply starvation damage = int(maxHealth * 0.05) with cause Starvation (floored at 1, not armored); if still alive add status `starving` (60 ws, refreshed each time) - which on first receipt gives happiness `starving` -40 and, every 5 ws, nudges the AI (if in a city, not fighting, not already on a food task: if the city has suitable food start the city-food task, else cancel the current behaviour).
  - otherwise: stamina += 1 (if below max) and mana += 1 (if below max). (Stamina and mana otherwise regenerate only via AI "rest" behaviours; they never regenerate while starving.)
- Creatures with subspecies trait `energy_preserver` (e.g. bear) skip the tick (never hungry). Eggs skip.
- **Spending**: each attack executed has a 50% chance of -1 nutrition. A birth costs the mother (and father for immediate spawns) `nutrition_cost_new_baby` = 50 (checked: needs >= 50 to start a pregnancy/spawn).
- **Eating**: a food resource gives its `restore_nutrition` (x2 if it is the creature's favourite food) + `restore_health` percent (x2 for favourite) + optional xp, happiness `just_ate` (+10 plus the resource's own happiness bonus), may set/replace the favourite food (if none: chance = resource's favourite chance; if different: only if tastier and chance), may give a trait/status with the resource's give_chance (50% each of trait/status picks), increments food_consumed, and applies status `just_ate` (200 ws) which later makes the creature defecate (decision `try_to_poop`, produces a bio-product building near it - always for the default, 20% for species with a bio product - and happiness `just_pooped` +5). Eating from a tile (grazing) restores the tile type's nutrition, 30% chance to gain a biome trait. A carnivore (subspecies diet meat) that kills a creature whose asset has `source_meat` is set to max nutrition immediately (4.4.6).
- **Stamina** drains: swimming (non-water creature, not flying, not fast_swimming) loses random 1..6 per tile-action check (0.3 real-s cooldown); a water creature stranded on land likewise; costs of combat actions and spells. At stamina 0 in water the creature takes 1 Drowning damage per check (suppressed during the 0.3 real-second damage cooldown); stamina <= 0 in liquid also slows walking x0.4.

### 4.9 Reproduction
A subspecies has exactly one **method trait** (reproductive_methods group) and one **strategy trait** (reproduction_strategy group): methods: sexual, hermaphroditic, parthenogenesis, fission, budding, spores, vegetative, divine, soulborne, metamorph; strategies: oviparity (eggs), viviparity (pregnancy), neither = immediate spawn. All of these are decision-driven (the AI picks them as "decisions" with cooldowns; section 6), but the rules below are the creature-level conditions and effects.

**Common gate**: alive; age >= breeding age; nutrition >= 50 (when food is needed); no status `pregnant`; no status `afterglow`. The afterglow (breeding cooldown) lasts `months_breeding_timeout` x 5 ws = 15 ws by default (the status's own 90 ws default is overridden). The "reproduction basics" gate additionally requires: world law civ-babies (sapient) / animal-babies (others) enabled; "can make babies" (adult, children_count < ceil(offspring stat), nutrition ok); meta limits not reached (subspecies `limit_population` stat if > 0: total living members >= limit blocks; for city members: city's world-law population limit, and free housing slots unless the creature/lover is an "important person" under their offspring limit or the species is sexual and the creature has no child yet); and for non-"important" creatures a privacy check: city residents need city population < 2*max_population + 10, wild animals need fewer than 6 (asset `animal_breeding_close_units_limit`) creatures in the chunk.

**Sexual / hermaphroditic** (needs a mate): Decisions: `find_lover` (adults of breeding age without a lover, cooldown 50 s, weight 1.5) and `sexual_reproduction_try` (adults, safe from combat, canBreed, has lover, not hungry; cooldown 20 s incl. on failure; weight 2 if offspring cap not reached else 0.1).
- *Falling in love*: neither has a lover; both adults of breeding age; both need a mate; same species; subspecies-specific partner suitability (opposite sex for sexual; any for hermaphroditic) ; not related (same family for sapients, parent/child). Result: both become lovers, both get status `fell_in_love` (180 ws; happiness +40 `fallen_in_love`, a hearts effect every 2 ws).
- *Mating act*: both get afterglow; both happiness `just_kissed` +10; stop if meta limits reached; else create/merge the pair's family; the "mother" = the female partner (sexual), or a random partner (hermaphroditic); a male-only pair does nothing; the mother must pass "can make babies".
  - strategy Egg or immediate: spawn offspring now (see below).
  - strategy Pregnancy: mother gets status `pregnant` for maturation months x 5 ws (default status length 45 ws); the status slows her speed by 20%; when it ends, the pregnancy-birth routine runs (below).
- *Offspring count*: 1 guaranteed, then up to `birth_rate` (mother's stat, int) bonus rolls: the first succeeds with p = 0.5, each success multiplies p by 0.85 (p = 0.5, 0.425, 0.361, ...); the first failure stops the loop.
- *Parents*: the birth event (happiness `just_had_child` +30, stun 4 ws (+10%), nutrition -50) is applied once to each parent for immediate/egg births, and once to the mother only when a pregnancy ends. Each parent's children_count += 1 per baby (decremented when a child dies) and its `births` counter +1 per baby; a family is created/joined.

**Asexual methods** (decisions need adult, canBreed unless noted; all get a per-species cooldown, the same afterglow after birth is not applied except via birthEvent's stun):
| method | extra condition | effect |
|---|---|---|
| parthenogenesis | female | 1 immediate baby, no partner; birthEvent; no bonus rolls |
| fission | health ratio >= 0.9 | parent splits: baby spawned; parent and baby each get half of the parent's health, happiness and nutrition, stamina 0 |
| budding | health ratio >= 0.9 | parent gets status `budding` (maturation x 5 ws, attributes doubled meanwhile); at its end a baby is spawned and both get random knock-up |
| spores | status `just_ate` present | 3..10 spores are released; each drifts with a random velocity (up to min(subspecies speed/2, 10) tiles/ws per axis) for U(1, min(lifespan,120)) ws, then spawns one baby at its position if the parent still exists |
| vegetative | not already `taking_roots` | status `taking_roots` (maturation = 12 months = 60 ws; creature rooted: speed -100%, armor +10, damage/health -30%); at its end a baby spawns with status `uprooting` for its own maturation time |
| divine | no lover, age ratio >= 0.6, no trait `miracle_bearer` | creature gains `miracle_bearer`; spawns a male and a female baby (+50% a third sexless) with trait `miracle_born`; if the subspecies is viviparous female: pregnancy instead |
| soulborne | has status `soul_harvested` (gained by hitting a creature with a soul) | finishes that status, baby spawned (or pregnancy if viviparous) |
| metamorph | on-hit effect converts a different-subspecies target into a new creature of the attacker's form | (not a birth) |

**Baby creation**: asset = parent 1's asset; generation = max(parent generations) + 1; spawned on a random ground tile adjacent to parent 1 (not a parent's tile), else on parent 1's tile; parents recorded; family joined/created; baby inherits subspecies (if two parents with different subspecies and different generations: the higher generation; equal: 50/50), clan of the king (or of a city leader), the city of parent 1, culture/religion/language randomly from either parent that has one (50/50 among those that have one), phenotype from a random parent; attribute inheritance if a parent's culture has trait "ancestors knowledge": baby's best attribute (the parent's highest of intelligence/warfare/diplomacy/stewardship, first on ties in that order) = floor(parent's value * 0.5) + 1; subspecies `parental_care` -> invincible 90 ws.
- **Traits**: baby gets the subspecies' birth traits. Then (unless the subspecies has trait `genetic_mirror`, which clones every parent trait that has non-zero birth/inherit rate) inheritance: build a pool in which each parent trait with rate_birth or rate_inherit contributes (rate_birth + rate_inherit) tickets (rate_inherit defaults to 10 x rate_birth when not set); draw max(1, int(0.25 * (parent1 trait count + parent2 trait count))) times (count only traits that have rates) uniformly from the pool; each draw tries to add that trait (duplicates, opposites rejected). Then birth mutation: randomInt(0, mutation+1) random traits from the birth pot (tickets = rate_birth) excluding the asset's ignore list.
- baby nutrition = 25; sex: forced if the caller demands one; else with 50% the sex that is currently under-represented (in the parent's city if any, else in the subspecies: if females <= males -> female else male), otherwise a fair coin; egg if egg form and age < adult; stunned 10 ws; random knock-up; birth counters; stats dirty with full refill.

### 4.10 Happiness (mood)
- Only creatures whose subspecies has the `has_emotions` meta tag and that are not eggs can change happiness; all others ignore events.
- Event application: value = event.value + optional extra bonus; happiness = clamp(happiness + value, -100, 100). Events flagged "ignored by psychopaths" are dropped for creatures with trait `psychopath`. A positive/negative net value shows a happy/sad effect unless the event suppresses it. The last 20 events are kept in a queue (event index, time, extra bonus) and can be queried ("had event X within T seconds").
- There is **no passive drift** of happiness in the creature loop (no decay toward neutral); it only moves through events. At spawn a newborn gets `just_born` +50 applied to initial happiness (0 base). Stat rebuild clamps happiness to [-100,100].
- Consumers: ratio >= 0.6 "happy" (also true when no emotions), < 0.3 "unhappy" (city/kingdom aggregate mood, rebellion chances, leader sprites - other specs). Some events carry a "pot task" (cry, swear, sing, laugh, tantrum) with a pool size: they feed the AI's reaction picker (section 6). Table 5.2 lists every event and its value; events trigger from the places named in the "source" column.

### 4.11 Traits
- A creature holds a set of trait ids. Add succeeds only if: not already present; if the trait `affects_mind` the creature must not have tag `strong_mind`; the trait's "remove list" (`traits_to_remove`) is removed first; if opposite traits exist: with the "remove opposites" flag they are removed, else the add fails when any opposite is present. On success: action_on_add hook, stats dirty, trait cache cleared. Removal: hook action_on_remove, stats dirty. Opposites are symmetric (declaring A opposite of B also makes B opposite of A).
- `can_be_given=false` traits cannot be assigned by player tools; `can_be_removed=false` cannot be removed; `is_mutation_box_allowed=false` excludes it from random mutation/editor pots.
- **Acquisition channels**: (1) asset `traits` list at spawn; subspecies birth traits at birth/spawn; (2) birth inheritance + mutation (4.9); (3) grow-up mutations (4.6) from the grow-up pot; (4) biome spawn: when created on a biome tile whose biome lists spawn traits, 50% chance to add one random listed trait; (5) food gives traits; (6) injuries from hits (crippled, eyepatch at 2% each per weapon hit; `skin_burns` 50% per burning tick for creatures with skin) ; (7) infection traits spread by effects (plague spreads each effect tick: 5% chance, then each creature within 6 tiles gets it with 50%; mush spores on death, zombie bite 25%.. etc.); (8) yearly `wise` (age > 40, 30%) and `evil` for old immortals; (9) kill milestones (`veteran` after > 10 kills, `kingslayer`, ...).
- **Rates (per trait)**: `rate_birth` = tickets in the birth/mutation pot and in inheritance; `rate_inherit` = extra tickets in inheritance only (default 10 x rate_birth when unset); `rate_acquire_grow_up` = tickets in the grow-up pot; `acquire_grow_up_sapient_only` filters the latter. `spawn_random_trait_allowed` / `spawn_random_rate` (default 5 tickets) govern the "give a random trait" tool.
- **Special effects** (periodic): traits with an effect function run it on the step-10 gate: at most once per whole world second per creature, and not before the trait's own interval has passed since its last run (default 1 ws). The first pass after a stat rebuild only arms the timer. So the effective period is max(interval, 1) rounded up to the next gate pass. On-hit effects (on-hit effects) run on each landed hit; get-hit effects on being hit; death effects at the moment of death (4.7).
- **Era-conditional**: traits flagged era-only (moonchild: moon era, nightchild: darkness overlay) contribute stats only while their flag is on.
- Trait `type` (Positive/Negative/Other), `likeability` (-1..0.25; added to the chance two creatures become friends), `same_trait_mod`/`opposite_trait_mod` (added to the compatibility score between two creatures sharing / opposing the trait - social system), `combat=true` marks skill traits that give combat actions (random skill pool). Group ids only categorise.

### 4.12 Statuses (mechanics)
- A status = (asset, remaining time). **Add** (`addStatusEffect(id, overrideDuration)`): fails if the owner is dead; if the creature's `allowed_status_tiers` is lower than the status tier; if an *opposite trait* or *opposite tag* is present; if an *opposite status* is active. If the status is already active: if its asset has `allow_timer_reset=false` and no override was given, nothing happens (burning, poisoned, frozen); otherwise extend (never shorten): if remaining < the new duration, set remaining = new duration. If new: create, mark stats dirty, optionally cancel the creature's AI job and flash (statuses with cancel_actor_job when colour effect allowed), finish every status in its `remove_status` list, run `action_on_receive`.
- **Tick**: statuses are updated once per frame by the status manager (after creatures): finish when world time >= end time; periodic `action` every `action_interval`; `action_finish` on expiry if the owner lives; finished statuses are removed immediately after the pass and the owner's cached "has status" data refreshes (stats dirty was set on add; removal marks dirty too).
- **Stat mods**: while active the status's stat sheet merges into the creature's sheet (4.2 step 5). Tags in a status's sheet become creature tags (unconscious, immovable, frozen_ai...).
- **Mind statuses**: statuses flagged `affects_mind` (possessed_follower, tantrum, rage, confused) are rejected for creatures with tag `strong_mind` (same rule as mind-affecting traits, 4.11).
- **removed_on_damage**: any hit finishes these (sleeping, laughing, singing, swearing, crying).
- **Decision hooks**: some statuses register an AI decision while active (see table 5.5 `decision`).
- Durations in table 5.5 are in world seconds and are "default"; callers may override (pregnant = maturation time; egg = maturation time; afterglow = 15; stunned = given time +0..10%; sleeping given; shield from bubble_defense 5; invincible from parental care 90).

### 4.13 Environment, tile effects and movement
**Tile action (step 8)**, once per tick for killable creatures at height 0 that are not flying:
- Standing on a *blocking* tile (and not `ignore_blocks`): if asset.move_from_block and idle and no move-from-block task running, start the "move_from_block" task; if asset.die_on_blocks, not under damage cooldown, not shaking and health > 1: 1 damage (type Gravity); if not in air (or hovering) knock it with a random force (1.5..3 up) and 2% stun.
- Standing on *ground*: on a burning tile and not fire immune (tag immunity_fire) -> status `burning`; water creature (and not `force_land_creature`) loses random 1..6 stamina (0.3 real-s cooldown) and at stamina 0 takes 1 Drowning damage; boats on non-liquid die (Gravity).
- Standing in *liquid*: tiles with the "damaged when walked" flag may break; non-lava liquid finishes status `burning`; creatures that are damaged by ocean (asset flag or subspecies "damaged by water") on ocean tiles, not in cooldown/shake: damage max(1, int(0.1 * maxHealth)) (Water); any non-water, non-flying creature without tag `fast_swimming` loses random 1..6 stamina (0.3 real-s cooldown) and takes 1 Drowning damage when stamina is 0.
- Tiles that damage units (lava, etc.): if not under damage cooldown and (not lava or asset.die_in_lava) damage = tile's damage value (type Fire); if that kills a creature on lava the "cursed sacrifice" check runs.
- Buildings with a step action trigger it.
- On *landing* (end of a knock-up/jump) the tile's step action may fire (with its own chance) and optional world laws apply: exploding mushrooms, flower nap (10% -> 10 ws sleep), plant tickle (30% surprised), root prank (20% stun), entanglewood (x0.5 speed on tree tiles).

**Movement speed** (recomputed every 6th tick while moving): base = speed stat x walkMultiplier; walkMultiplier = 1 for flying/hovering(in air)/water creatures/assets that ignore tile speed; else the tile type's walk multiplier; in liquid (non-water creature): 0.4 when stamina <= 0 and not fast_swimming, and x5 if fast_swimming; times the current task's speed multiplier; trees x0.5 under the entanglewood law; floor of 1 (a speed stat of 1 or less, e.g. `slowness`'s -100, gives 1); then x0.4; then x unit_speed_multiplier 0.5 => tiles per world second = speed * mult * 0.2. Within 1 tile of the destination with speed above 3 the speed is scaled by lerp(1, 0.3, 1 - distance) (down to 0.3). Per tick the creature moves speed * dt along the path to its next step; if the step is shorter than the move budget the remainder continues into the next step (so path nodes cost no time).

**Sleep/stun/unconscious**: statuses `sleeping` and `stunned` carry the tag unconscious: the creature skips AI and movement-affecting steps (u6), tilts and is excluded as a "foe" target when not a real enemy; being stunned finishes sleeping, tantrum, surprised, singing, laughing, suspicious. `makeStunned(t)`: duration = t + U(0, 0.1 t), cancels the AI job, forces a wait of the same duration, and ends anger when the stun applies.
**Surprise**: the surprise reaction (emotion-capable only): status `surprised` 1..3 ws (if already surprised only 0.1), may defecate/jump, status `on_guard` 60 ws, schedules "investigate_curiosity", and 30% (+30% for timid subspecies) it flees ("run_away").

### 4.14 Spawn / initialisation
Spawn (player or world): create from asset; choose/inherit subspecies (new subspecies if none nearby and the asset can have one); optional biome trait roll (50%); finalize: set kingdom (wild kingdom of the asset), profession Unit, stats built; "new creature": happiness `just_born` +50 (skipped for animals without emotions), random personality: subspecies birth traits (or the asset trait list when no subspecies), grow-up mutations if spawned adult, birth mutations, random sex 50/50, egg status if applicable, full stats, nutrition at max (spawns set 100). Weapons: `default_weapons` picks one random item to equip (when the asset uses items); player spawns may grab an ownerless existing item first. Adult spawns: age_overgrowth as in 4.6 and join a city if standing in a non-neutral city that accepts them.

## 5. Content tables

Legend: ws = world seconds; "mult" = multiplier stat (adds `target * value`); all trait/status stat mods are flat adds into the sheet unless named `multiplier_*`. Anything not listed is zero/absent.

### 5.1 Stat ids (BaseStatsLibrary - every stat)
Stats in the creature sheet are floats; "clamp" applies at the two normalize steps (4.2). Meta stats (`mutation`, `maturation`, `age_adult`, `age_breeding`, `max_nutrition`, `limit_population`) live on the subspecies' separate *meta* sheet and are read from there. Template defaults come from the basic-unit template that every creature clones.

| stat id | clamp (normalized) | role | default in template | note |
|---|---|---|---|---|
| personality_aggression | [0, 1] | flat; civ AI personality axis (hidden) |  | civ-only, hidden in UI |
| personality_administration | [0, 1] | flat; civ AI personality axis (hidden) |  | civ-only, hidden in UI |
| personality_diplomatic | [0, 1] | flat; civ AI personality axis (hidden) |  | civ-only, hidden in UI |
| personality_rationality | [0, 1] | flat; civ AI personality axis (hidden) |  | civ-only, hidden in UI |
| diplomacy | [0, 999] | flat; personal attribute: social/diplomatic skill |  | civ-only, also stored per creature as personal attribute |
| warfare | [0, 999] | flat; attribute: +warfare/5 flat damage, +1 skill_combat per 5 pts, bonus towers |  | civ-only, also stored per creature as personal attribute |
| stewardship | [0, 999] | flat; attribute: city count (+1 per 6 pts) |  | civ-only, also stored per creature as personal attribute |
| intelligence | [0, 999] | flat; attribute: +10 mana per point, +1 skill_spell per 5 pts |  | civ-only, also stored per creature as personal attribute |
| lifespan | [1, inf] | flat; years until old-age risk starts |  |  |
| mutation | - | flat; meta: max random birth traits / mutation count |  |  |
| offspring | [0, 1000] | flat; cap on living children (ceil) |  |  |
| multiplier_offspring | - | multiplier of `offspring`; x offspring |  | shown as % |
| army | [0.1, inf] | flat; civ: army size factor |  | civ-only |
| cities | - | flat; civ: city cap (+int(stewardship)/6+1 added at build) |  | civ-only |
| range | - | flat; attack reach in tiles (ranged: shot range) | 1 |  |
| bonus_towers | [0, 2] | flat; civ: extra towers (+int(warfare/10)) |  | civ-only |
| damage | [1, inf] | flat; base damage per hit |  |  |
| speed | [1, inf] | flat; move speed (tiles/ws = speed*mult*0.2) |  |  |
| health | [1, inf] | flat; max HP |  |  |
| armor | [0, 99] | flat; percent damage reduction vs weapon/other hits |  |  |
| stamina | [1, inf] | flat; max stamina |  |  |
| mana | [0, inf] | flat; max mana |  |  |
| accuracy | [1, 10] | flat; ranged aim quality (10 = perfect) | 1 |  |
| targets | - | flat; max enemies hit per swing | 1 | hidden in UI |
| projectiles | - | flat; projectiles per shot |  | hidden in UI |
| experience | - | flat; (unused numeric slot) |  |  |
| happiness | [0, inf] | flat; (stat slot, clamp >= 0) |  |  |
| critical_chance | [0, inf] | flat; probability of crit (0..1) |  | shown as % |
| critical_damage_multiplier | - | flat; integer-truncated damage multiplier on crit | 2 | shown as % |
| size | - | flat; hit radius (tiles) | 0.5 | hidden in UI |
| area_of_effect | - | flat; blast radius added to target size | 0.1 | hidden in UI |
| attack_speed | [0.5, 10] | flat; attacks per second (cooldown = 1/x) | 1 |  |
| throwing_range | [1, 100] | flat; distance resources/items can be thrown |  |  |
| construction_speed | [1, 100] | flat; building work rate |  |  |
| loyalty_traits | - | flat; civ: loyalty from traits |  | civ-only |
| birth_rate | - | flat; max bonus babies per birth (probabilistic) |  |  |
| maturation | - | flat; meta: months of gestation / egg incubation / rooting |  |  |
| age_adult | - | flat; meta: years to adulthood |  | hidden in UI |
| age_breeding | - | flat; meta: years to breed |  | hidden in UI |
| max_nutrition | - | flat; meta: extra max nutrition |  |  |
| metabolic_rate | - | flat; nutrition drained per hunger tick (min 1) |  | hidden in UI |
| loyalty_mood | - | flat; civ: loyalty from mood |  | civ-only |
| opinion | - | flat; civ: opinion of its ruler |  | civ-only |
| skill_combat | - | flat; proficiency: scales combat-action chances |  | shown as % |
| skill_spell | - | flat; proficiency: scales spell-cast chance |  | shown as % |
| knockback | - | flat; impulse applied to targets | 1.5 |  |
| recoil | - | flat; impulse applied to self when attacking |  |  |
| mass | - | flat; physics weight (knockback flight, fall) | 1 |  |
| mass_2 | - | flat; display/resource mass (kg basis) |  |  |
| multiplier_mass | - | multiplier of `mass_2`; x mass_2 |  | hidden in UI, shown as % |
| limit_population | - | flat; meta: cap on subspecies population |  |  |
| multiplier_health | - | multiplier of `health`; x health |  | shown as % |
| multiplier_lifespan | - | multiplier of `lifespan`; x lifespan |  | shown as % |
| multiplier_stamina | - | multiplier of `stamina`; x stamina |  | shown as % |
| multiplier_mana | - | multiplier of `mana`; x mana |  | shown as % |
| multiplier_damage | - | multiplier of `damage`; x damage |  | shown as % |
| multiplier_crit | - | multiplier of `critical_chance`; x critical_chance |  | shown as % |
| multiplier_diplomacy | - | multiplier of `diplomacy`; x diplomacy |  | civ-only, shown as % |
| multiplier_speed | - | multiplier of `speed`; x speed |  | shown as % |
| multiplier_attack_speed | - | multiplier of `attack_speed`; x attack_speed |  | shown as % |
| scale | - | flat; body scale (visual + stats["scale"] drives sprite size) | 0.1 | shown as % |
| multiplier_supply_timer | - | flat; civ: supply timer factor | 1 | civ-only, hidden in UI |
| limit_clan_members | - | flat; civ: clan size cap |  | civ-only |
| status_chance | - | flat; chance modifier for applying statuses on hit |  |  |
| damage_range | [0.1, inf] | flat; lower bound of damage roll as fraction of damage |  | hidden in UI |

Notes: (a) `critical_damage_multiplier` default 2 means crits double damage; item/status bonuses of +0.5 do not change the truncated multiplier until they reach +1. (b) `experience`, `happiness` stat entries exist but gameplay uses the per-creature counters. (c) `status_chance` has no effect found in the creature core.

### 5.2 Happiness events (HappinessLibrary - every event)
Value is added to the creature's happiness (clamped -100..100) plus any extra bonus passed by the caller. "pot reaction" = an AI reaction task the event may feed into the reaction picker with that many tickets (section 6).

| event id | value | ignored by psychopath | pot reaction task (pool size) | source |
|---|---|---|---|---|
| death_family_member | -20 | yes | crying (5) | a non-parent family member dies |
| death_lover | -50 | yes | crying (5) | lover dies |
| death_child | -60 | yes | crying (10) | a child dies (to each parent) |
| death_best_friend | -25 | yes | crying (3) | best friend dies |
| got_robbed | -20 |  | swearing (2) | victim of theft (steal action) |
| got_poked | -5 |  | - | poked by the player |
| lost_fight | -20 |  | swearing (2) | saved by the stun rule below half health (4.4.11) |
| got_caught | -20 | yes | crying (2) | defined, no trigger found |
| paid_tax | -5 |  | swearing (1) | pays tax |
| just_ate | 10 |  | - | eats food |
| just_received_gift | 10 | yes | - | receives a gift (after talk) |
| just_gave_gift | 20 |  | - | gives a gift (after talk) |
| just_pooped | 5 |  | - | defecates |
| just_slept | 5 |  | - | a sleep ends |
| had_bad_dream | -15 |  | - | dream status received |
| had_good_dream | 15 |  | - | dream status received |
| had_nightmare | -30 |  | - | dream status received |
| slept_outside | -30 |  | - | tried to sleep outdoors |
| just_kissed | 10 | yes | singing (2) | mating act (both) |
| just_killed | 10 |  | - | kills (only with trait bloodlust) |
| become_king | 50 |  | happy_laughing (2) | crowned |
| become_leader | 40 |  | happy_laughing (2) | made city leader |
| just_won_war | 20 |  | singing (3) | own kingdom wins a war |
| just_made_peace | 5 |  | - | war ends in peace |
| just_lost_war | -20 | yes | swearing (2) | own kingdom loses a war |
| was_conquered | -20 |  | crying (2) | own city captured / kingdom conquered |
| kingdom_fell_apart | -5 | yes | swearing (2) | kingdom splits |
| just_started_war | 20 |  | - | own kingdom declares war |
| just_rebelled | 30 |  | singing (3) | city rebels |
| fallen_in_love | 40 | yes | singing (3) | status fell_in_love received |
| just_had_child | 30 | yes | singing (1) | birth event (parents) |
| just_read_book | 10 |  | - | finished reading |
| just_played | 15 | yes | happy_laughing (3) | finished a play task |
| just_talked | 10 |  | - | finished a chat |
| just_laughed | 5 |  | - | finished a laugh task |
| just_sang | 10 |  | - | finished a sing task |
| just_swore | 2 |  | - | finished a swear task |
| just_cried | 5 | yes | - | finished a cry task |
| just_talked_gossip | 14 |  | - | finished gossip |
| just_surprised | -10 |  | swearing (2) | status surprised received (no popup) |
| just_born | 50 |  | singing (1) | creation (no popup) |
| just_magnetised | -10 |  | swearing (3) | status magnetized received (no popup) |
| just_forced_power | -20 |  | - | player power forced on it (no popup) |
| just_possessed | -20 |  | - | status possessed received (no popup) |
| strange_urge | -5 |  | - | status strange_urge received (30% of the time) (no popup) |
| just_had_tantrum | 25 |  | - | tantrum ends |
| just_felt_the_divine | 40 |  | - | divine power applied |
| just_enchanted | 30 |  | - | status enchanted received |
| just_inspired | 25 |  | - | status inspired ends |
| wrote_book | 20 |  | - | authored a book |
| just_became_adult | 30 |  | - | become-adult event |
| just_got_out_of_egg | 20 |  | - | hatch event (no popup) |
| just_finished_plot | 25 |  | - | plot completed |
| just_found_house | 35 |  | - | moved into a house |
| just_lost_house | -30 |  | start_tantrum (1) | lost its home |
| just_made_friend | 40 |  | - | new best friend |
| just_injured | -20 |  | swearing (2) | gained an injury trait |
| just_cursed | -20 |  | - | status cursed received |
| starving | -40 |  | - | status starving received |
| conquered_city | 30 |  | - | own kingdom captured a city |
| lost_crown | -60 | yes | start_tantrum (4) | lost kingship |
| become_alpha | 20 |  | - | became family alpha |

### 5.3 Actor traits (ActorTraitLibrary - every trait)
Columns: *tickets* = rate_birth / rate_inherit (explicit, else 10 x birth) / rate_acquire_grow_up. `rar` = rarity R0 normal, R1 rare (default), R2 epic, R3 legendary (none beyond R1 are used for actor traits). Flags: positive/negative = trait type; `like` = likeability (added to friend-making chance); `same`/`opp` = compatibility score added when two creatures share / oppose that trait; `every N` = special-effect interval in ws; "curable/dispellable" = can be cured or removed by divine light/healing; `forced kingdom` = while present the creature belongs to that special kingdom. Stat mod names as in 5.1; `multiplier_x` values are fractional (0.5 = +50%). Opposite traits are symmetric and block adding (unless the add forces removal). Trait effects that are social/AI/culture driven are implemented in other layers; only creature-core consequences are described.

| id | group | rar | birth / inherit / grow-up tickets | stat mods | opposite traits | flags | effects / hooks |
|---|---|---|---|---|---|---|---|
| dash | skills | R1 | 0/0/0 | - | - | combat skill | combat actions: combat_dash |
| block | skills | R1 | 0/0/0 | - | - | combat skill | combat actions: combat_block |
| dodge | skills | R1 | 0/0/0 | - | - | combat skill | combat actions: combat_dodge |
| backstep | skills | R1 | 0/0/0 | - | - | combat skill | combat actions: combat_backstep |
| deflect_projectile | skills | R1 | 0/0/0 | - | - | combat skill | combat actions: combat_deflect_projectile |
| mute | body | R1 | 1/5/0 | - | - | like -0.1 | cannot cast religion spells |
| sunblessed | body | R1 | 2/5/0 | - | - | every 5 | every >=5 ws: 50% (not at night) heal 5-10% max HP |
| clumsy | physique | R0 | 5/5/0 | multiplier_lifespan=-0.5 | long_liver | - | - |
| fragile_health | health | R0 | 5/5/0 | multiplier_health=-0.5 | boosted_vitality | - | - |
| boosted_vitality | health | R1 | 5/5/0 | multiplier_health=0.5 | fragile_health | - | - |
| hard_skin | physique | R0 | 5/5/0 | armor=5 | soft_skin | - | - |
| soft_skin | physique | R0 | 5/5/0 | armor=-5 | hard_skin | - | - |
| long_liver | health | R0 | 2/5/0 | multiplier_lifespan=0.5 | clumsy | - | - |
| acid_touch | body | R1 | 0/0/0 | - | - | like -0.1 | 30% per pass: acid-terraform its tile |
| acid_blood | body | R1 | 0/5/0 | - | - | like -0.1 | on death: acid splash (5 drops at 50%; dragon-sized creatures a much bigger splash) |
| acid_proof | protection | R1 | 0/5/0 | - | - | - | marker (acid immunity checks elsewhere) |
| fire_blood | body | R1 | 0/5/0 | - | - | - | on death: fire splash (same shape as acid) |
| fire_proof | protection | R1 | 0/5/0 | - | - | - | tag immunity_fire: burning rejected and tile fire ignored ; tags: immunity_fire |
| freeze_proof | protection | R1 | 0/5/0 | - | - | - | tag immunity_cold: frozen rejected ; tags: immunity_cold |
| regeneration | health | R1 | 1/5/0 | - | - | positive; every 3 | every >=3 ws: unless infected, if hurt and not hungry, 20% -> heal 2% max HP; also 5% each to cure crippled / skin_burns / eyepatch |
| heliophobia | body | R1 | 0/10/0 | - | - | negative; every 10 | every >=10 ws: in eras with light damage and outside cold/dark biomes take int(10% max HP)+1 (type Other, armored) |
| ugly | appearance | R0 | 7/70/0 | multiplier_offspring=-0.3 | attractive | negative; like -0.1; same 5; opp -15 | - |
| fat | physique | R0 | 7/5/0 | multiplier_mass=0.3, scale=0.02, multiplier_stamina=-0.5, multiplier_damage=0.1 | agile, weightless | negative; like -0.1; same 10; opp -10 | - |
| attractive | appearance | R1 | 3/5/0 | diplomacy=2, stewardship=1, critical_chance=0.1, multiplier_offspring=0.6 | ugly | positive; like 0.1; same 10 | - |
| fast | physique | R0 | 4/5/0 | multiplier_speed=0.3, attack_speed=5 | slow | positive | - |
| slow | physique | R0 | 6/5/0 | multiplier_speed=-0.5, attack_speed=-5 | fast, agile | negative | also disables all advanced combat actions |
| gluttonous | mind | R0 | 4/5/0 | - | - | negative; same 5 | AI: eats extra at city food |
| giant | physique | R1 | 2/7/0 | scale=0.05, multiplier_health=0.5, multiplier_speed=-0.25 | tiny | positive | - |
| tiny | physique | R1 | 4/7/0 | diplomacy=-1, scale=-0.02, multiplier_health=-0.25, multiplier_speed=0.25 | giant | negative | - |
| eagle_eyed | cognitive | R0 | 3/5/0 | accuracy=5, critical_chance=0.15 | short_sighted | positive | - |
| short_sighted | cognitive | R0 | 5/5/0 | accuracy=-5, critical_chance=-0.05 | eagle_eyed | negative | - |
| infertile | health | R1 | 1/5/0 | offspring=-99999 | fertile | negative | offspring -99999 clamps to 0: cannot have children |
| fertile | health | R0 | 3/7/0 | multiplier_offspring=0.8, birth_rate=4 | infertile | positive; like 0.1 | - |
| thorns | protection | R1 | 0/5/0 | - | - | - | when hit: 50% reflect 20% of the attackers damage stat if the attacker is within 2 tiles |
| bubble_defense | protection | R1 | 0/3/0 | - | - | - | when hit: 10% gain status shield for 5 ws |
| immune | health | R1 | 1/10/0 | - | plague, tumor_infection, mush_spores, infected | positive | statuses cough/ash_fever rejected; mutually exclusive with infection traits |
| agile | physique | R1 | 3/5/0 | lifespan=3, scale=-0.01, stamina=20, skill_combat=0.2 | fat, slow | positive; same 5 | - |
| weightless | physique | R1 | 1/5/0 | - | fat | - | cached flag used by physics/AI (see open questions) |
| poisonous | body | R1 | 0/5/0 | - | - | - | no direct effect found in creature core |
| venomous | body | R1 | 0/5/0 | - | - | - | on hit: if target has skin, is not injury/poison immune: 30% status poisoned |
| poison_immune | protection | R1 | 0/5/0 | - | - | - | status poisoned rejected; venom attacks cannot poison it |
| tough | physique | R1 | 2/20/0 | armor=10, warfare=1, lifespan=4 | - | positive; same -5 | status stunned rejected |
| strong | physique | R0 | 4/40/0 | multiplier_damage=0.5, warfare=2, lifespan=3 | weak | positive; same 5; opp -10 | - |
| weak | physique | R0 | 5/50/0 | multiplier_damage=-0.5, warfare=-2, diplomacy=-2, lifespan=-6 | strong | negative; opp -10 | - |
| lustful | mind | R1 | 1/10/5 | diplomacy=-2, multiplier_offspring=0.2 | - | like 0.1 | AI: social/mating bias |
| miner | miscellaneous | R1 | 0/0/5 | - | - | positive | AI: mining job |
| psychopath | mind | R1 | 1/10/0 | - | - | negative | ignores happiness events flagged for psychopaths |
| strong_minded | mind | R1 | 0/0/0 | - | madness, desire_golden_egg, desire_harp | positive | tag strong_mind: mind-affecting traits and statuses rejected ; tags: strong_mind |
| peaceful | mind | R0 | 0/0/0 | - | - | positive | tag love_peace; cannot start fights; statuses angry/swearing rejected ; tags: love_peace |
| evil | mind | R1 | 0/0/0 | cities=-2, warfare=10 | blessed | like -0.2 | - |
| hotheaded | mind | R1 | 1/10/0 | - | - | negative; same -10 | AI: reacts when unhappy |
| thief | cognitive | R1 | 1/10/0 | - | honest, content | negative; same 10 | tag steal_items ; AI decision: try_to_steal_money ; tags: steal_items |
| stupid | cognitive | R0 | 3/30/0 | damage=5, cities=-3, intelligence=-5, diplomacy=-2, warfare=-2, stewardship=-5, loyalty_traits=-15, personality_rationality=-0.5 | genius, wise | negative; same 30 | - |
| genius | cognitive | R1 | 1/10/0 | intelligence=10, diplomacy=5, warfare=5, stewardship=7, loyalty_traits=-10, cities=3 | stupid | positive; same 20; opp -20 | tag can_read_any_book (also stat attributes) ; tags: can_read_any_book |
| deceitful | mind | R0 | 0/0/5 | diplomacy=1, stewardship=4, loyalty_traits=-20 | honest | negative; like 0.1; same -15; opp -5 | - |
| ambitious | mind | R1 | 1/10/5 | diplomacy=2, warfare=4, stewardship=1, loyalty_traits=-15, cities=5 | content | same -10 | - |
| content | mind | R0 | 2/20/5 | multiplier_supply_timer=-0.3, loyalty_traits=10, diplomacy=2, stewardship=2, warfare=-2 | ambitious, greedy, thief | positive; like 0.1; same 15 | - |
| honest | mind | R0 | 2/20/5 | stewardship=3, diplomacy=2, warfare=-2, loyalty_traits=5 | deceitful, thief | positive; like -0.1; same 10; opp -10 | - |
| paranoid | mind | R1 | 1/10/5 | diplomacy=-2, warfare=4, multiplier_supply_timer=0.5, loyalty_traits=-15, cities=-1 | - | negative | - |
| greedy | mind | R1 | 1/10/5 | diplomacy=-2, stewardship=-3, warfare=4, multiplier_supply_timer=4, loyalty_traits=-5, cities=2 | content | negative; like -0.1 | - |
| chosen_one | spirit | R1 | 0/0/0 | stamina=1000, mana=1000 | - | like 0.25 | combat actions: combat_backstep,combat_block,combat_dash,combat_deflect_projectile,combat_dodge ; spells: cast_fire, summon_lightning, teleport, summon_tornado, cast_blood_rain, cast_blood_rain, cast_cure, cast_shield, cast_grass_seeds, spawn_vegetation, cast_curse |
| moonchild | spirit | R1 | 1/5/0 | multiplier_damage=0.5, multiplier_speed=0.1, armor=1, intelligence=3 | - | moon era only | - |
| nightchild | spirit | R1 | 1/5/0 | multiplier_damage=0.5, multiplier_speed=0.1, critical_chance=0.03, warfare=3 | - | night/dark only | - |
| flesh_eater | spirit | R1 | 1/5/0 | - | - | - | on hit vs a creature: heal 5% of the TARGETs max HP |
| titan_lungs | body | R1 | 0/5/0 | multiplier_stamina=10 | - | - | - |
| heart_of_wizard | spirit | R1 | 0/5/0 | multiplier_mana=10 | - | - | - |
| battle_reflexes | mind | R1 | 0/5/0 | skill_combat=0.5 | - | - | - |
| arcane_reflexes | mind | R1 | 0/5/0 | skill_spell=0.5 | - | - | - |
| healing_aura | spirit | R1 | 0/5/0 | - | - | like 0.1; every 2 | every >=2 ws, 20%: creatures near it (3x3 chunks, ~4 tiles) not at full HP get +10 HP and lose trait plague |
| savage | spirit | R1 | 0/5/2 | - | - | positive; same 5 | city-bound killer takes victim resources even from same species |
| immortal | health | R1 | 0/0/0 | loyalty_traits=-20 | plague, boat | positive; same -20 | no natural death; no age fertility decline; sapient > 300 y: 50%/yr gains evil |
| burning_feet | spirit | R1 | 0/3/0 | - | - | - | ignites its tile and neighbours (if tile can burn) |
| cold_aura | spirit | R1 | 0/3/0 | - | - | - | cools terrain in a radius-4 brush each pass |
| lucky | spirit | R1 | 2/5/0 | lifespan=7, accuracy=4, critical_chance=0.3, birth_rate=5 | unlucky | positive; like 0.1 | - |
| unlucky | spirit | R1 | 3/5/0 | lifespan=-13, accuracy=-4, critical_chance=-0.3 | lucky | negative; like -0.1 | if nature-disaster law, >=5 cities exist, age>=30: 0.005% per pass to call a meteorite on itself |
| bloodlust | spirit | R1 | 1/5/4 | multiplier_supply_timer=1.5, loyalty_traits=-20, warfare=5, diplomacy=-2, cities=3 | pacifist | negative | - |
| pacifist | spirit | R1 | 0/5/3 | multiplier_supply_timer=-0.1, loyalty_traits=50, diplomacy=10, warfare=-4 | bloodlust | positive; like 0.1 | - |
| veteran | merits | R1 | 0/0/0 | skill_combat=0.1, multiplier_damage=0.1, multiplier_health=0.1 | - | positive; same 5; no random mutation | granted after more than 10 kills |
| wise | cognitive | R1 | 0/0/0 | diplomacy=1, stewardship=1, warfare=1, intelligence=1 | stupid, boat | positive; no random mutation | granted 30%/yr after age 40 |
| infected | acquired | R1 | 0/20/0 | multiplier_speed=0.1, loyalty_traits=-15 | immune, boat | every 1.5; no random mutation; curable/dispellable | every >=1.5 ws: damage max(10, health/10) type Infection (ignores shake); on death -> zombie ; on death (needs trait infected, asset can turn into zombie): replaced by a zombie copy named "Un..." |
| mush_spores | acquired | R1 | 0/30/0 | multiplier_speed=0.3, loyalty_traits=-15 | immune, boat | no random mutation; curable/dispellable | on death: up to 3 creatures within 3 tiles each 30% gain mush_spores ; on death (mush_spores, asset can turn into mush): replaced by mush creature |
| tumor_infection | acquired | R1 | 0/30/0 | multiplier_speed=0.3, loyalty_traits=-15 | immune, boat | no random mutation; curable/dispellable | every pass: 10% -> damage 10% max HP type Tumor (ignores shake) ; on death (tumor_infection): replaced by tumor monster |
| plague | acquired | R1 | 0/30/0 | multiplier_speed=-0.3, multiplier_damage=-0.5, stamina=-10, armor=-2, loyalty_traits=-15, lifespan=-30 | immune, immortal, contagious, boat | no random mutation; curable/dispellable | every pass: spread tick (5%: each creature within 6 tiles 50% gets plague); 10% -> damage 15% max HP + 1 type Plague (ignores shake) |
| blessed | acquired | R1 | 0/0/0 | multiplier_damage=0.5, multiplier_health=0.5, multiplier_speed=0.5, multiplier_diplomacy=0.2, multiplier_crit=0.1, lifespan=5 | evil | like 0.1; no random mutation | - |
| kingslayer | merits | R1 | 0/0/0 | multiplier_supply_timer=2, loyalty_traits=-25, diplomacy=-5, warfare=5 | - | no random mutation | granted after killing a king |
| mageslayer | merits | R1 | 0/0/0 | loyalty_traits=-10, warfare=5, critical_chance=0.03 | - | no random mutation | - |
| dragonslayer | merits | R1 | 0/0/0 | warfare=5, critical_chance=0.04, multiplier_diplomacy=0.1 | - | no random mutation | - |
| crippled | acquired | R1 | 0/0/0 | multiplier_speed=-0.5, diplomacy=-3, multiplier_offspring=-0.5 | - | negative; same 10; no random mutation; curable/dispellable | - |
| golden_tooth | appearance | R1 | 0/0/0 | diplomacy=2 | - | positive; same 5; no random mutation | - |
| eyepatch | appearance | R1 | 0/0/0 | accuracy=-5, diplomacy=1, warfare=-1, critical_chance=-0.15 | - | negative; same 20; no random mutation; curable/dispellable | - |
| skin_burns | appearance | R1 | 0/0/0 | diplomacy=-2, warfare=2, multiplier_speed=-0.25, lifespan=-5 | - | negative; same 40; no random mutation; curable/dispellable | - |
| super_health | health | R1 | 0/3/0 | lifespan=100, multiplier_health=100 | - | - | - |
| death_nuke | fun | R1 | 0/1/0 | - | death_bomb | no random mutation | on death: atomic bomb on its tile |
| death_bomb | fun | R1 | 0/1/0 | - | death_nuke | - | on death: bomb on its tile |
| death_mark | fun | R1 | 0/0/0 | - | - | no random mutation | every pass: 20% instant death (Divine) |
| energized | fun | R1 | 0/0/0 | multiplier_speed=2, lifespan=7 | boat | no random-give | on death: small lightning strike on its tile |
| mega_heartbeat | fun | R1 | 0/4/0 | - | whirlwind | like 0.1; every 5; no random mutation; no random-give | every >=5 ws: outward force pulse radius 3 |
| bomberman | skills | R1 | 0/0/0 | - | - | combat skill | combat actions: combat_throw_bomb |
| pyromaniac | skills | R1 | 0/4/2 | - | - | grow-up: sapient only | combat actions: combat_throw_torch |
| whirlwind | fun | R1 | 0/0/0 | - | mega_heartbeat | every 0.1; no random mutation; no random-give | - |
| light_lamp | miscellaneous | R1 | 0/0/0 | - | - | - | tag generate_light ; tags: generate_light |
| shiny | miscellaneous | R1 | 0/10/0 | diplomacy=5 | - | - | sparkle effect |
| flower_prints | miscellaneous | R1 | 0/10/0 | - | - | - | 30%: grows a plant on its biome tile |
| clone | special | R0 | 0/0/0 | - | - | not giveable; no random mutation | marks a cloned creature |
| boat | special | R1 | 0/0/0 | - | infected, tumor_infection, mush_spores, plague, immortal, energized, wise | not giveable; no random mutation | marker trait of boats |
| scar_of_divinity | special | R1 | 0/0/0 | - | - | not giveable; not removable; no random mutation | marker only |
| miracle_born | special | R1 | 0/0/0 | lifespan=20, multiplier_offspring=2, birth_rate=2 | - | not giveable; not removable; no random mutation | set by miracle births |
| miracle_bearer | special | R1 | 0/0/0 | - | - | not giveable; not removable; no random mutation | blocks another divine birth |
| contagious | miscellaneous | R1 | 0/0/0 | - | plague | no random mutation | if rat-plague law on: 70% x (more than 20 contagious creatures nearby) x 20% -> plague spread tick |
| zombie | special | R1 | 0/0/0 | - | - | not giveable; no random mutation | zombie marker ; cosmetic particles ; on hit vs creature: 50% (if target asset can become zombie) adds infected |
| madness | special | R1 | 0/0/0 | multiplier_speed=0.1, diplomacy=-100, loyalty_traits=-100 | strong_minded, desire_alien_mold, desire_computer, desire_golden_egg, desire_harp | like -1; not giveable; not removable; no random mutation; curable/dispellable; forced kingdom mad; affects mind (blocked by strong_mind) | while present creature belongs to the forced kingdom named in the table row ; (restores normal kingdom on removal) ; (reapplies on load) ; AI decision: madness_random_emotion |
| desire_alien_mold | special | R1 | 0/0/0 | targets=1, multiplier_crit=0.3, damage_range=0.3, armor=10 | madness, desire_computer, desire_golden_egg, desire_harp | not giveable; not removable; no random mutation; curable/dispellable; forced kingdom alien_mold; affects mind (blocked by strong_mind) | while present creature belongs to the forced kingdom named in the table row ; (restores normal kingdom on removal) ; (reapplies on load) ; AI decision: follow_desire_target |
| desire_computer | special | R1 | 0/0/0 | multiplier_health=0.3, multiplier_lifespan=0.5 | madness, desire_alien_mold, desire_golden_egg, desire_harp | not giveable; not removable; no random mutation; curable/dispellable; forced kingdom computer; affects mind (blocked by strong_mind) | while present creature belongs to the forced kingdom named in the table row ; (restores normal kingdom on removal) ; (reapplies on load) ; AI decision: follow_desire_target |
| desire_golden_egg | special | R1 | 0/0/0 | multiplier_damage=0.5 | strong_minded, madness, desire_alien_mold, desire_computer, desire_harp | not giveable; not removable; no random mutation; curable/dispellable; forced kingdom golden_egg; affects mind (blocked by strong_mind) | while present creature belongs to the forced kingdom named in the table row ; (restores normal kingdom on removal) ; (reapplies on load) ; AI decision: follow_desire_target |
| desire_harp | special | R1 | 0/0/0 | multiplier_speed=0.3, multiplier_attack_speed=0.3 | strong_minded, madness, desire_alien_mold, desire_computer, desire_golden_egg | not giveable; not removable; no random mutation; curable/dispellable; forced kingdom harp; affects mind (blocked by strong_mind) | while present creature belongs to the forced kingdom named in the table row ; (restores normal kingdom on removal) ; (reapplies on load) ; AI decision: follow_desire_target |

### 5.4 Trait groups (ActorTraitGroupLibrary)
cognitive, mind, spirit, physique, health, body, appearance, protection, skills, merits, acquired, fun, miscellaneous, special. (Presentation categories; the group id `body` also selects the birth-rate ticket column when querying the per-group rate lookup, all others select the grow-up column.)

### 5.5 Statuses (StatusLibrary - every status)
Tier Basic = allowed for every creature whose allowed tier is >= Basic; Advanced needs allowed tier Advanced. Durations are defaults and can be overridden by callers. "action every N" statuses run their action each N ws. Stat mods and tags merge into the sheet while active.

| id | tier | default duration (ws) | stat mods | tags | finishes on start | rejected when owner has | flags | effect |
|---|---|---|---|---|---|---|---|---|
| recovery_plot | Basic | 60 | - | - | - | - | - | cooldown marker (plot attempts) |
| voices_in_my_head | Basic | 180 | diplomacy=-5, personality_rationality=-0.3, opinion=-5 | - | - | - | - | mind debuff (civ stats) |
| recovery_spell | Basic | 5 | - | - | - | - | - | blocks spellcasting (set after a cast) |
| recovery_social | Basic | 60 | - | - | - | - | - | blocks socializing (cooldown marker) |
| recovery_combat_action | Basic | 1 | - | - | - | - | - | blocks advanced combat actions (duration = action cooldown) |
| starving | Advanced | 60 | - | - | - | - | action every 5 ws | on receive happiness `starving`; every 5 ws: city creatures not fighting/not on a diet task go eat city food if available else drop current behaviour |
| sleeping | Advanced | 60 | - | unconscious | tantrum/surprised | - | removed on damage | tag unconscious; on expiry: happiness `just_slept` +5 and each of the three dream statuses (bad dream, good dream, nightmare) has a 1/23 chance (about 13% any dream) |
| laughing | Advanced | 60 | - | - | - | - | removed on damage | cosmetic |
| singing | Advanced | 60 | - | - | - | - | removed on damage | cosmetic |
| swearing | Advanced | 60 | - | - | - | trait peaceful | removed on damage | cosmetic |
| crying | Advanced | 60 | - | - | - | - | removed on damage | cosmetic |
| possessed | Basic | 10 | - | - | - | - | action every 0 ws | player controls the creature (movement/attacks/jump/talk/dash per tick); happiness `just_possessed` |
| possessed_follower | Basic | 200 | - | - | - | - | mind; decision possessed_following | AI decision possessed_following; mind status |
| strange_urge | Basic | 100 | - | - | - | - | - | creature moves by urge; no enemy scanning; 70% skip of the happiness hit |
| tantrum | Basic | 120 | - | - | - | - | mind; decision do_tantrum | mind status; AI decision do_tantrum; ends -> happiness +25 |
| egg | Basic | 5 | armor=10 | immovable, frozen_ai | - | - | - | incubating egg: immovable, frozen AI, armor +10; ends -> stun + hatch |
| cursed | Basic | 300 | loyalty_traits=-100, multiplier_damage=-0.5, multiplier_health=-0.5, multiplier_speed=-0.2, multiplier_diplomacy=-0.9, lifespan=-10, multiplier_offspring=-2 | - | - | trait evil | - | on death becomes skeleton (if asset has one); big stat penalties; happiness `just_cursed` |
| spell_silence | Basic | 60 | - | - | - | - | - | blocks casting |
| spell_boost | Basic | 180 | mana=100, skill_spell=0.2 | - | - | - | - | +100 mana, +0.2 skill_spell |
| inspired | Basic | 60 | multiplier_speed=0.3, multiplier_crit=0.3, multiplier_attack_speed=0.3 | - | - | - | - | ends -> happiness `just_inspired` +25 |
| confused | Basic | 10 | - | - | - | status egg | mind; decision status_confused | mind status; AI decision status_confused |
| soul_harvested | Basic | 666 | - | - | - | - | decision status_soul_harvested | enables soulborne reproduction (AI decision status_soul_harvested) |
| magnetized | Basic | 4 | - | - | - | - | - | lifted by magnet; happiness -10 |
| rage | Basic | 300 | multiplier_damage=1 | - | - | - | mind | mind status; damage x2; may turn into a demon on kill under disaster law |
| surprised | Basic | 2 | - | - | - | - | - | no repeat (loop false); happiness -10 |
| on_guard | Basic | 60 | - | - | - | - | - | marker |
| angry | Basic | 60 | - | - | - | trait peaceful | - | ends -> clears aggression list |
| just_ate | Basic | 200 | - | - | - | - | decision try_to_poop | enables defecation decision try_to_poop (4.8) |
| festive_spirit | Basic | 100 | - | - | - | - | decision try_to_launch_fireworks | AI decision try_to_launch_fireworks |
| being_suspicious | Basic | 20 | - | - | - | - | decision run_away_being_sus | AI decision run_away_being_sus |
| had_good_dream | Basic | 90 | - | - | - | - | - | happiness +15 on receive |
| had_bad_dream | Basic | 90 | - | - | - | - | - | happiness -15 on receive |
| had_nightmare | Basic | 90 | - | - | - | - | - | happiness -30 on receive |
| stunned | Advanced | 4 | - | unconscious | sleeping/tantrum/surprised/singing/laughing/being_suspicious | trait tough; status egg | - | tag unconscious |
| afterglow | Basic | 90 | - | - | - | - | - | blocks breeding (breeding cooldown) |
| fell_in_love | Basic | 180 | - | - | - | - | action every 2 ws | hearts effect every 2 ws; happiness +40 on receive |
| pregnant | Basic | 45 | multiplier_speed=-0.2 | - | - | - | - | ends -> baby (+bonus babies) (4.9) |
| powerup | Basic | 300 | armor=1, damage=5, multiplier_damage=0.5, multiplier_crit=0.5, scale=0.1 | - | - | - | - | light; armor +1, damage +5 and x1.5, crit x1.5, scale +0.1 |
| enchanted | Basic | 120 | multiplier_damage=0.77, multiplier_speed=0.1, multiplier_diplomacy=0.1, multiplier_crit=0.1, lifespan=10 | - | - | - | - | light; happiness `just_enchanted` +30 on receive |
| slowness | Basic | 30 | speed=-100 | - | caffeinated | - | - | speed -100 (speed floor 1 => crawl); finishes caffeinated; rejected via asset immune_to_slowness (asset-level) |
| motivated | Basic | 120 | speed=10, attack_speed=2 | - | - | - | - | speed +10, attack_speed +2 flat |
| cough | Advanced | 200 | lifespan=-15, multiplier_speed=-0.1, multiplier_health=-0.1 | - | - | trait immune | - | curable |
| ash_fever | Advanced | 500 | diplomacy=-5, intelligence=-5, stewardship=-5, warfare=5, multiplier_speed=-0.1, multiplier_health=-0.6, lifespan=-45 | - | - | trait immune | action every 10 ws | every 10 ws: damage 1% max HP type AshFever; curable |
| caffeinated | Basic | 60 | intelligence=222, speed=200 | - | frozen | - | - | speed +200, intelligence +222; finishes frozen |
| frozen | Advanced | 15 | mass=100, armor=-20, speed=-10000 | immovable, frozen_ai, stop_idle_animation | burning/tantrum | trait freeze_proof; tag immunity_cold; status shield | no timer reset | immovable + frozen AI + no idle animation, speed -10000, armor -20 (armor floors at 0), mass 100; finishes burning/tantrum |
| shield | Advanced | 60 | mass=100, armor=90 | - | burning | status frozen | - | armor +90, mass +100; finishes burning; rejected while frozen; spawns a hit effect when hit |
| burning | Advanced | 30 | - | - | frozen | trait fire_proof; tag immunity_fire; status shield/tantrum | no timer reset; cancels AI job; action every 2 ws; decision run_to_water_when_on_fire | every 2 ws: 50% skin_burns injury (if asset has skin); damage 10% max HP type Fire; cancels AI job; AI decision run_to_water_when_on_fire; finishes frozen |
| poisoned | Advanced | 90 | - | - | - | trait poison_immune | no timer reset; action every 1 ws | every 1 ws: 50% (if health > 1) damage max(1, 1% current health) type Poison |
| invincible | Basic | 5 | - | - | - | - | - | all damage ignored |
| dodge | Basic | 1 | - | - | - | - | - | all attacks pass through |
| dash | Basic | 2 | multiplier_speed=1.55 | - | - | - | - | speed +155% |
| taking_roots | Advanced | 120 | mass=100, armor=10, speed=-10000, multiplier_speed=-0.3, multiplier_damage=-0.3, multiplier_health=-0.3 | immovable, stop_idle_animation, frozen_ai | - | - | - | rooted: immovable, frozen AI, speed -10000, armor +10, speed/damage/health -30%; ends -> spawns baby (4.9) |
| uprooting | Advanced | 120 | armor=20, speed=-10000, multiplier_speed=-0.3, multiplier_damage=-0.3, multiplier_health=-0.3 | immovable, frozen_ai, stop_idle_animation | - | - | - | rooted newborn: same immobility, armor +20, -30% speed/damage/health |
| budding | Basic | 60 | - | - | - | - | - | attributes x2 while active; ends -> bud baby |
| flicked | Basic | 3 | - | - | - | - | - | beetle-on-lava achievement hook only |

### 5.6 Combat actions (CombatActionLibrary)
Per use: chosen uniformly among affordable/valid actions of the pool; fires with probability `chance * (1 + skill_combat)`; then pays stamina/mana and gets a `recovery_combat_action` status of `cooldown` ws (blocking ALL advanced actions meanwhile). Checked every tick the situation occurs, so a 0.2 chance fires within a few ticks.

| id | granted by trait | pool / moment | chance | stamina | cooldown (ws) | condition | effect |
|---|---|---|---|---|---|---|---|
| combat_attack_melee | (basic) | normal attack | - | 0 | - | melee weapon | melee hit pipeline; weight 6 in attack pool |
| combat_attack_range | (basic) | normal attack | - | 0 | - | ranged weapon | spawns projectiles; weight 6 |
| combat_cast_spell | (any spell source) | normal attack | spell's own chance x (1+skill_spell) | 5 | spell recovery 5 | has spell, mana, not silenced | casts a random spell; weight 3 |
| combat_deflect_projectile | deflect_projectile | before-hit deflect (any attack) | 0.2 | 5 | 1 | - | the incoming attack is cancelled (projectiles bounce back); defender plays a punch animation, stops moving and its own attack cooldown restarts |
| combat_dodge | dodge | before hit | 0.2 | 5 | 1 | - | side-step impulse (strength 3, +/-90 deg random), status `dodge` 1 ws; the hit misses |
| combat_block | block | before hit (blockable projectiles only) | 0.2 | 5 | 0.5 | projectile marked blockable | projectile blocked, tiny push (0.1x) |
| combat_random_jump | - | none | - | 5 | 2 | - | defined but unused |
| combat_dash | dash | before melee attack (target > 3 tiles) | 0.2 | 10 | 2 | - | status `dash` (speed +155% for 2 ws) and an impulse (strength 5) |
| combat_backstep | backstep | before ranged attack (target closer than 0.707 x range) | 0.2 | 10 | 1 | not on a blocked tile | backward impulse (strength 5) |
| combat_throw_bomb | bomberman | before melee/ranged attack | 0.2 | 5 | 8 | target between 6 and 50 tiles | throws a bomb at the target tile |
| combat_throw_torch | pyromaniac | before melee/ranged attack | 0.2 | 30 | 8 | target between 6 and 50 tiles | throws a torch at the target tile |

### 5.7 Subspecies-trait numbers that feed creature rules
(Full subspecies trait list belongs to the subspecies spec; these are the values the creature rules above use.)
| trait | effect |
|---|---|
| gestation_short / moderate / long / very_long / extremely_long | maturation 2 / 4 / 9 / 20 / 50 months (pregnancy or egg incubation = months x 5 ws) |
| reproduction_strategy_viviparity | pregnancy; maturation +1 month; reproduction_strategy_oviparity = eggs (no extra) |
| reproduction_sexual | birth_rate +3, decisions find_lover + sexual_reproduction_try, tags needs_mate; hermaphroditic same but any two partners |
| reproduction_vegetative | maturation 12 months (rooting) |
| high_fecundity | birth_rate +5 |
| long_lifespan | lifespan +100 |
| big_stomach | max_nutrition +100 |
| energy_preserver | no hunger ticks |
| stomach | enables city-food eating; adding it also adds diet_omnivore |
| population_minimal / small / moderate / large / expansive | limit_population 50 / 100 / 500 / 1000 / 3000 |
| diet_* | tags used by the food/AI layer (carnivore = diet_meat, herbivore = diet_vegetation + fruits/flowers/grass/crops, omnivore = meat + fruits + vegetation, cannibalism = same-species, hematophagy = blood, ...); `diet_meat` also drives "eats the victim" in combat |
| parental_care | newborns invincible 90 ws |
| bad_genes | yearly 1%: random bad trait |
| genetic_mirror | children clone all parent traits with non-zero rates |
| aquatic | tag water_creature (see 4.13), decision random_swim |
| hovering | creature hovers above ground |
| genetic_psychosis | pretty-old creatures: yearly 1% gain madness |

### 5.8 Genome gene sizes (GeneLibrary stat genes; used to split a genome budget)
| stat | gene sizes (each gene adds exactly this) |
|---|---|
| health | 1, 10, 50, 100, 300 |
| damage | 1, 6, 10 |
| armor | 1, 6, 10 |
| speed | 1, 2, 5 |
| stamina | 10, 50, 100 |
| lifespan | 5, 20, 50, 100 |
| offspring | 1, 3, 5, 10 |
| birth_rate | 1 |
| attack_speed | 1 |
| scale | +0.03 (scale_plus), -0.01 (scale_minus) |
| diplomacy / warfare / stewardship / intelligence | 1, 2, 3 |
Special genes: `empty`, `bad` (harmful, halves neighbours' bonuses), `bonus_male`, `bonus_female` (boost male/female sheets by adjacent gene values), `mutagenic` (+1 mutation meta stat). The 80% of the time greedy picker takes the largest gene that still fits the remaining budget; 20% it shuffles.

### 5.9 Actor assets (ActorAssetLibrary)
Reading the table: innate stat = `stat overrides` (asset base stats; template default applies where absent: attack_speed 1, accuracy 1, mass 1, knockback 1.5, targets 1, area_of_effect 0.1, size 0.5, range 1, critical_damage_multiplier 2, scale 0.1) **plus** the `genome budget` (hp=health, dmg=damage, spd=speed, arm=armor, sta=stamina, life=lifespan, off=offspring, br=birth_rate, mut=mutation meta, dip/war/stw/int = attributes, bsr = random-sex bonus genes, bad = bad genes). Creatures of assets without subspecies use only the stat overrides. Damage/speed/health from `civ_*` and mobs also receive trait/item/level mods (4.2). Default size S13_Human when blank. `default_attack` is shown only when the asset sets or inherits a non-default one; blank means the asset default `base_attack` (note `$animal$` lineage sets `jaws`, civ lineage `hands`; `rocks`/`snowball` are ranged). Assets cloned from the civ, animal, insect and mob templates have an auto-generated zombie twin (id = the asset's zombie id): same stats, `unit_zombie`, `only_melee_attack`, lifespan base 0, traits + zombie + stupid, kingdom `undead`, `can_attack_brains`, no items taking, no reproduction/diet traits; plus a default `zombie` asset cloned from human. `$template$` ancestors are not listed.

| id | kind | parent | size | genome budget (stat value) | stat overrides | innate traits | diet / reproduction (subspecies traits) | wild kingdom; default attack; flags |
|---|---|---|---|---|---|---|---|---|
| `human` | sapient | civ_advanced_unit | S13_Human | hp100 sta100 mut1 bsr2 bad2 life70 dmg15 spd10 off5 dip3 war3 stw3 int3 |  |  | reproduction_strategy_viviparity,gestation_long,reproduction_sexual,bad_genes,diet_omnivore,nocturnal_dormancy | kingdom_id_wild=nomads_human default_attack=hands |
| `elf` | sapient | civ_advanced_unit | S13_Human | hp70 bsr1 sta200 life500 mut2 dmg10 spd15 off2 dip5 war2 stw2 int6 |  | weightless,moonchild,soft_skin | reproduction_strategy_viviparity,gestation_very_long,reproduction_sexual,long_lifespan,diet_frugivore,diet_granivore,diet_florivore,diet_folivore,pure | kingdom_id_wild=nomads_elf default_attack=hands civ_base_cities=3 |
| `orc` | sapient | civ_advanced_unit | S13_Human | hp150 bsr1 sta130 life50 mut2 dmg20 spd8 off10 dip2 war5 br5 stw3 int2 |  | regeneration,savage,nightchild,bloodlust | reproduction_strategy_viviparity,gestation_moderate,reproduction_sexual,bad_genes,diet_omnivore,diet_cannibalism,aggressive | kingdom_id_wild=nomads_orc default_attack=hands civ_base_cities=4 |
| `dwarf` | sapient | civ_advanced_unit | S13_Human | hp150 bsr1 sta40 life220 mut2 dmg18 spd6 off3 dip2 war3 stw5 int2 |  | miner,deflect_projectile,block,fat | reproduction_strategy_viviparity,gestation_long,reproduction_sexual,diet_omnivore | kingdom_id_wild=nomads_dwarf default_attack=hands civ_base_cities=3 |
| `fox` | animal (carnivore) | carnivore | S8_Fox | hp80 sta80 mut1 life90 dmg18 spd7 arm5 off4 |  | genius,fast | diet_carnivore,reproduction_strategy_viviparity,gestation_long,reproduction_sexual | kingdom_id_wild=fox default_attack=jaws skip_fight_logic=false can_evolve_into_new_species=true evolution_id=civ_fox |
| `buffalo` | animal (herbivore) | herbivore | S16_Buffalo | hp180 sta200 mut1 spd11 life80 dmg20 off2 |  | strong,tough | diet_herbivore,reproduction_strategy_viviparity,population_minimal,gestation_very_long,reproduction_sexual,diet_graminivore | kingdom_id_wild=buffalo skip_fight_logic=false can_evolve_into_new_species=true evolution_id=civ_buffalo source_meat=true |
| `hyena` | animal (carnivore) | carnivore | S10_Dog | hp130 sta150 mut1 spd12 life80 dmg18 arm5 off6 |  |  | diet_carnivore,reproduction_strategy_viviparity,gestation_moderate,reproduction_sexual | kingdom_id_wild=hyena default_attack=jaws skip_fight_logic=false can_evolve_into_new_species=true evolution_id=civ_hyena |
| `crocodile` | animal (carnivore) | carnivore | S15_Bear | hp180 sta40 mut1 spd5 life70 dmg30 arm15 off10 | mass=20 | tough | diet_carnivore,reproduction_strategy_oviparity,egg_shell_plain,reproduction_sexual,fins,aquatic | kingdom_id_wild=crocodile default_attack=jaws skip_fight_logic=false force_land_creature=true immune_to_slowness=true can_evolve_into_new_species=true evolution_id=civ_crocodile |
| `monkey` | animal (herbivore) | herbivore | S9_Monkey | hp80 sta150 mut1 spd14 life80 dmg12 arm5 off8 |  | genius,agile | diet_herbivore,reproduction_strategy_viviparity,gestation_long,reproduction_sexual,population_moderate | kingdom_id_wild=monkey default_attack=rocks skip_fight_logic=false can_evolve_into_new_species=true evolution_id=civ_monkey source_meat=true |
| `rhino` | animal (herbivore) | herbivore | S16_Buffalo | hp80 sta120 mut1 spd12 life80 dmg20 arm15 off2 | mass=20 targets=3 | strong,fat,dash,hard_skin | diet_herbivore,reproduction_strategy_viviparity,gestation_very_long,reproduction_sexual,population_moderate,aggressive | kingdom_id_wild=rhino skip_fight_logic=false can_evolve_into_new_species=true evolution_id=civ_rhino source_meat=true |
| `frog` | animal (peaceful) | peaceful_animal | S2_Crab | hp40 sta20 mut2 spd7 life90 dmg12 br3 off30 | damage=1 | poisonous,weightless | reproduction_strategy_oviparity,egg_bubble,reproduction_sexual,high_fecundity,population_small,diet_insectivore | kingdom_id_wild=frog skip_fight_logic=false immune_to_slowness=true can_evolve_into_new_species=true evolution_id=civ_frog source_meat=true |
| `snake` | animal (carnivore) | carnivore | S5_Snake | hp40 sta10 mut2 spd7 life150 dmg20 br3 off20 |  | poison_immune,venomous,weightless | diet_carnivore,reproduction_strategy_oviparity,egg_shell_plain,reproduction_sexual,population_small | kingdom_id_wild=snake default_attack=bite skip_fight_logic=false immune_to_slowness=true can_attack_buildings=false can_evolve_into_new_species=true evolution_id=civ_snake |
| `dog` | animal (peaceful) | peaceful_animal | S10_Dog | hp80 sta120 mut1 life20 dmg18 spd15 arm5 off5 | damage=1 | fast,dash | reproduction_strategy_viviparity,gestation_moderate,reproduction_sexual,population_small,diet_omnivore | kingdom_id_wild=dog default_attack=jaws skip_fight_logic=false can_evolve_into_new_species=true evolution_id=civ_dog source_meat=true |
| `wolf` | animal (carnivore) | carnivore | S12_Wolf | hp120 sta150 mut1 life20 dmg22 spd15 arm3 off4 |  | nightchild | diet_carnivore,reproduction_strategy_viviparity,gestation_moderate,reproduction_sexual,diet_carnivore,diet_cannibalism | kingdom_id_wild=wolf default_attack=jaws can_attack_buildings=false can_evolve_into_new_species=true evolution_id=civ_wolf |
| `bear` | animal (carnivore) | carnivore | S15_Bear | hp200 sta200 mut1 life35 dmg30 spd15 arm8 off2 | mass=2 targets=2 | strong | diet_carnivore,reproduction_strategy_viviparity,gestation_long,reproduction_sexual,cold_resistance,diet_carnivore,diet_frugivore,energy_preserver,aggressive | kingdom_id_wild=bear default_attack=claws can_attack_buildings=false can_evolve_into_new_species=true evolution_id=civ_bear |
| `piranha` | animal | animal | S4_Piranha | hp40 sta50 mut1 life10 dmg25 spd13 arm2 off20 |  |  | reproduction_strategy_oviparity,egg_roe,reproduction_sexual,high_fecundity,population_small,aggressive,diet_carnivore,diet_piscivore,diet_hematophagy,aquatic,fins | kingdom_id_wild=piranha default_attack=jaws force_land_creature=false immune_to_slowness=true can_attack_buildings=false can_evolve_into_new_species=true evolution_id=civ_piranha |
| `rabbit` | animal (herbivore) | herbivore | S6_Chicken | hp50 sta140 mut1 life15 dmg5 arm1 spd15 off12 |  | weightless,fast | diet_herbivore,reproduction_strategy_viviparity,gestation_moderate,reproduction_sexual,high_fecundity,population_small,cautious_instincts | kingdom_id_wild=rabbit can_evolve_into_new_species=true evolution_id=civ_rabbit source_meat=true |
| `cat` | animal (carnivore) | carnivore | S7_Cat | hp85 sta150 mut1 life45 dmg20 spd15 arm3 off5 |  | weightless | diet_carnivore,reproduction_strategy_viviparity,gestation_moderate,population_minimal,reproduction_sexual | kingdom_id_wild=cat default_attack=claws skip_fight_logic=false can_evolve_into_new_species=true evolution_id=civ_cat |
| `raccoon` | animal (carnivore) | carnivore | S7_Cat | hp85 sta80 mut1 life45 dmg20 spd15 arm3 off4 |  |  | diet_carnivore,reproduction_strategy_viviparity,gestation_moderate,population_moderate,reproduction_sexual | kingdom_id_wild=raccoon default_attack=claws skip_fight_logic=false can_evolve_into_new_species=true evolution_id=bandit |
| `seal` | animal (carnivore) | carnivore | S13_Human | hp200 sta30 mut1 life30 dmg20 spd4 arm10 off2 |  | agile | diet_carnivore,reproduction_strategy_viviparity,gestation_moderate,reproduction_sexual,population_moderate,diet_piscivore,aquatic,fins | kingdom_id_wild=seal default_attack=bite skip_fight_logic=false can_evolve_into_new_species=false |
| `ostrich` | animal (carnivore) | carnivore | S13_Human | hp100 sta150 mut1 life40 dmg20 spd15 arm0 off2 |  | dash,fast | diet_carnivore,reproduction_strategy_oviparity,egg_shell_plain,gestation_moderate,reproduction_sexual,diet_omnivore,population_moderate | kingdom_id_wild=ostrich default_attack=bite skip_fight_logic=false can_evolve_into_new_species=false |
| `unicorn` | animal (carnivore) | carnivore | S14_Cow | hp500 sta120 mut1 life500 dmg20 spd15 arm0 off2 |  | heart_of_wizard,healing_aura,blessed | diet_carnivore,reproduction_strategy_oviparity,egg_rainbow,gestation_moderate,reproduction_sexual,diet_omnivore,population_moderate | kingdom_id_wild=unicorn default_attack=bite skip_fight_logic=false can_evolve_into_new_species=false |
| `rat` | animal (omnivore) | omnivore | S3_Rat | hp30 sta30 mut1 life30 dmg8 arm1 spd15 off15 |  | contagious | diet_omnivore,reproduction_strategy_viviparity,gestation_short,reproduction_sexual,high_fecundity,population_minimal,diet_cannibalism | kingdom_id_wild=rat default_attack=jaws can_attack_buildings=false can_evolve_into_new_species=true evolution_id=civ_rat |
| `chicken` | animal (herbivore) | herbivore | S6_Chicken | hp35 sta30 mut1 spd7 life30 dmg5 arm1 br3 off12 |  | peaceful,weightless,content | diet_herbivore,reproduction_strategy_oviparity,egg_shell_plain,reproduction_sexual,population_small,cautious_instincts | kingdom_id_wild=chicken can_evolve_into_new_species=true evolution_id=civ_chicken source_meat=true |
| `sheep` | animal (herbivore) | herbivore | S11_Sheep | hp90 sta10 mut1 life100 dmg10 spd6 off2 |  |  | diet_herbivore,reproduction_strategy_viviparity,gestation_long,reproduction_sexual,population_moderate,diet_graminivore,cautious_instincts | kingdom_id_wild=sheep can_evolve_into_new_species=true evolution_id=civ_sheep source_meat=true |
| `cow` | animal (herbivore) | herbivore | S14_Cow | hp120 sta20 mut1 life100 dmg10 spd6 off2 |  |  | diet_herbivore,reproduction_strategy_viviparity,gestation_long,reproduction_sexual,population_moderate,diet_graminivore | kingdom_id_wild=cow can_evolve_into_new_species=true evolution_id=civ_cow source_meat=true |
| `penguin` | animal | animal | S10_Dog | hp70 sta100 mut1 spd5 life20 dmg7 arm2 off2 |  | weightless | reproduction_strategy_oviparity,egg_shell_spotted,reproduction_sexual,population_moderate,fins,diet_piscivore | kingdom_id_wild=penguin default_attack=jaws can_evolve_into_new_species=true evolution_id=civ_penguin |
| `armadillo` | animal (herbivore) | herbivore | S6_Chicken | hp200 sta50 mut1 life100 dmg20 arm20 spd8 off2 |  | hard_skin,block | diet_herbivore,reproduction_strategy_viviparity,gestation_long,reproduction_sexual,population_small | kingdom_id_wild=armadillo can_evolve_into_new_species=true evolution_id=civ_armadillo source_meat=true |
| `alpaca` | animal (herbivore) | herbivore | S12_Wolf | hp100 sta30 mut1 life20 dmg9 spd8 arm2 off3 |  | soft_skin | diet_herbivore,reproduction_strategy_viviparity,gestation_moderate,reproduction_sexual,population_small | kingdom_id_wild=alpaca can_evolve_into_new_species=true evolution_id=civ_alpaca source_meat=true |
| `capybara` | animal (herbivore) | herbivore | S12_Wolf | hp80 sta10 mut1 life10 dmg9 spd5 arm2 off4 |  | peaceful,content | diet_herbivore,reproduction_strategy_viviparity,gestation_moderate,reproduction_sexual,population_small | kingdom_id_wild=capybara can_evolve_into_new_species=true evolution_id=civ_capybara source_meat=true |
| `goat` | animal (herbivore) | herbivore | S12_Wolf | hp90 sta100 mut1 life20 dmg11 arm2 spd12 off3 |  | dash | diet_herbivore,reproduction_strategy_viviparity,gestation_moderate,reproduction_sexual,population_moderate | kingdom_id_wild=goat can_evolve_into_new_species=true evolution_id=civ_goat source_meat=true |
| `scorpion` | animal (herbivore) | herbivore | S12_Wolf | hp40 sta10 mut1 life10 dmg30 arm5 spd5 off25 |  |  | diet_herbivore,reproduction_strategy_viviparity,gestation_very_long,reproduction_sexual,population_small | kingdom_id_wild=scorpion can_evolve_into_new_species=true evolution_id=civ_scorpion source_meat=true |
| `turtle` | animal | animal | S7_Cat | hp150 sta10 mut1 life400 dmg15 spd5 arm25 br3 off20 |  | slow,weightless,genius | reproduction_strategy_oviparity,egg_colored,reproduction_sexual,fins,population_moderate,diet_algivore,diet_omnivore,cautious_instincts | kingdom_id_wild=turtle default_attack=jaws immune_to_slowness=true can_evolve_into_new_species=true evolution_id=civ_turtle |
| `crab` | animal | animal | S2_Crab | hp60 sta10 mut1 life10 dmg20 arm15 spd5 br3 off30 |  | weightless,hard_skin | reproduction_strategy_oviparity,exoskeleton,egg_roe,reproduction_sexual,diet_algivore,fins,population_minimal | kingdom_id_wild=crab default_attack=jaws can_evolve_into_new_species=true evolution_id=civ_crab |
| `crystal_sword` | animal | animal | S13_Human | hp100 sta50 mut1 life1000 dmg50 arm20 spd10 off2 |  | deflect_projectile,shiny,fire_proof,freeze_proof,light_lamp | reproduction_strategy_oviparity,egg_crystal,reproduction_budding,genetic_mirror,heat_resistance,cold_resistance,diet_lithotroph | kingdom_id_wild=crystal_sword default_attack=jaws can_evolve_into_new_species=true evolution_id=civ_crystal_golem |
| `smore` | animal | animal | S13_Human | hp300 sta10 mut3 life400 spd12 dmg30 arm5 off3 |  | flesh_eater,evil,gluttonous | reproduction_vegetative,reproduction_strategy_oviparity,egg_candy,population_small,genetic_mirror,diet_xylophagy,diet_hematophagy | kingdom_id_wild=smore default_attack=jaws can_evolve_into_new_species=true evolution_id=civ_candy_man |
| `acid_blob` | animal | animal | S13_Human | hp120 sta50 mut5 spd4 life50 dmg35 off10 |  | acid_blood,acid_proof,acid_touch,lustful,fat | reproduction_strategy_oviparity,egg_blob,reproduction_fission,genetic_mirror,bad_genes | kingdom_id_wild=acid_blob default_attack=jaws can_evolve_into_new_species=true evolution_id=civ_acid_gentleman |
| `flower_bud` | animal (peaceful) | peaceful_animal | S12_Wolf | hp50 sta50 mut3 life50 dmg3 spd7 arm5 off5 | damage=1 | peaceful,sunblessed | reproduction_vegetative,high_fecundity,population_minimal,gestation_very_long,genetic_mirror | kingdom_id_wild=flower_bud can_evolve_into_new_species=true evolution_id=civ_liliar source_meat=true |
| `lemon_snail` | animal (herbivore) | herbivore | S6_Chicken | hp50 sta10 mut3 life55 dmg12 spd4 arm10 off15 |  | slow,regeneration | diet_herbivore,reproduction_hermaphroditic,reproduction_strategy_oviparity,egg_colored,high_fecundity,population_small | kingdom_id_wild=lemon_snail can_evolve_into_new_species=true evolution_id=civ_lemon_man source_meat=true |
| `garl` | animal (herbivore) | herbivore | S6_Chicken | hp80 sta110 mut2 life5 dmg18 arm3 spd8 off4 |  | poison_immune,regeneration | diet_herbivore,reproduction_vegetative,high_fecundity,population_minimal,gestation_moderate,genetic_mirror | kingdom_id_wild=garl can_evolve_into_new_species=true evolution_id=civ_garlic_man source_meat=true |
| `bee` | flying insect | flying_insect | S0_Bug | hp1 mut1 dmg10 spd5 off20 | speed=5 health=1 damage=1 | peaceful,weightless | hovering,diet_nectarivore,reproduction_parthenogenesis | kingdom_id_wild=insect |
| `fly` | flying insect | flying_insect | S0_Bug | hp1 mut1 dmg1 spd5 off15 | speed=5 health=1 damage=1 | peaceful,weightless | hovering,diet_nectarivore,egg_bubble,reproduction_strategy_oviparity | kingdom_id_wild=fly |
| `butterfly` | flying insect | flying_insect | S0_Bug | life3 hp1 mut1 dmg1 spd5 off10 | speed=5 health=1 damage=1 | peaceful,weightless | hovering,diet_nectarivore,reproduction_strategy_oviparity,population_minimal,reproduction_sexual,gestation_moderate,egg_cocoon | kingdom_id_wild=insect |
| `grasshopper` | insect | insect | S0_Bug | hp1 mut1 dmg1 spd5 off10 | speed=5 health=1 damage=1 | peaceful |  | kingdom_id_wild=insect |
| `beetle` | insect | insect | S0_Bug | hp1 mut1 dmg1 spd5 off10 | speed=5 health=1 damage=1 | peaceful,hard_skin,slow | diet_xylophagy,population_minimal,reproduction_sexual,reproduction_strategy_oviparity,egg_cocoon | kingdom_id_wild=insect can_evolve_into_new_species=true evolution_id=civ_beetle |
| `cold_one` | monster | mob | S13_Human | hp250 sta150 mut1 life1000 dmg40 spd30 arm15 off4 |  | regeneration,cold_aura,weightless,freeze_proof | cold_resistance,long_lifespan,reproduction_metamorph,genetic_mirror,egg_ice | kingdom_id_wild=cold_one default_attack=base_attack unit_other=true default_weapons=(ice_hammer) |
| `necromancer` | monster | mob | S13_Human | hp300 sta50 mut1 life550 dmg15 spd10 arm5 off3 dip6 war8 stw6 int7 |  | regeneration,evil,fragile_health | cold_resistance,long_lifespan,reproduction_spores,genetic_mirror,egg_face,reproduction_strategy_oviparity,diet_hematophagy | kingdom_id_wild=necromancer default_attack=base_attack unit_other=true default_weapons=(necromancer_staff) |
| `druid` | monster | mob | S13_Human | hp100 sta100 life200 mut2 dmg12 spd12 arm4 off8 dip7 war5 stw8 int6 |  | regeneration,flower_prints,healing_aura | population_moderate,long_lifespan,reproduction_sexual,egg_cocoon,reproduction_strategy_oviparity | kingdom_id_wild=druid default_attack=base_attack unit_other=true default_weapons=(druid_staff) |
| `plague_doctor` | monster | mob | S13_Human | hp500 sta100 life100 mut2 dmg1 spd20 arm4 off6 dip7 war5 stw8 int6 |  | regeneration,immune,fire_proof | population_moderate,long_lifespan,reproduction_spores,genetic_mirror,egg_face,reproduction_strategy_oviparity | kingdom_id_wild=plague_doctor default_attack=base_attack unit_other=true immune_to_tumor=true has_baby_form=false default_weapons=(plague_doctor_staff) |
| `white_mage` | monster | mob | S13_Human | hp300 sta50 life500 mut1 dmg5 spd10 arm3 off2 dip8 war4 stw7 int7 |  | regeneration,freeze_proof,wise | long_lifespan,reproduction_budding,genetic_mirror,egg_orb,reproduction_strategy_oviparity,population_small | kingdom_id_wild=white_mage default_attack=base_attack unit_other=true default_weapons=(white_staff) |
| `evil_mage` | monster | mob | S13_Human | hp500 sta60 life450 mut1 dmg1 arm4 spd20 off2 dip5 war7 stw5 int8 |  | evil,fire_proof,regeneration,hotheaded | long_lifespan,reproduction_budding,genetic_mirror,egg_flames,reproduction_strategy_oviparity,population_small,diet_hematophagy | kingdom_id_wild=evil_mage default_attack=base_attack unit_other=true default_weapons=(evil_staff) |
| `skeleton` | monster | mob | S13_Human | hp100 dmg10 spd10 sta100 life100 |  | weightless,backstep,dodge,dash,block |  | kingdom_id_wild=undead default_attack=base_attack unit_other=true has_baby_form=false default_weapons=(bow_bronze, bow_steel, bow_iron, sword_steel, spear_steel, sword_iron) |
| `jumpy_skull` | monster | mob | S7_Cat | hp1 life500 dmg10 spd5 |  | weightless |  | kingdom_id_wild=jumpy_skull default_attack=base_attack unit_other=true has_baby_form=false |
| `fire_elemental` | monster | mob | S13_Human | hp5 life450 dmg10 spd10 |  | weightless,light_lamp,fire_proof,fire_blood | heat_resistance,hydrophobia,egg_flames,gestation_long,reproduction_soulborne,reproduction_strategy_oviparity | kingdom_id_wild=fire_elemental default_attack=fire_hands unit_other=true use_items=false take_items=false has_baby_form=false allowed_status_tiers=Basic die_in_lava=false |
| `fire_elemental_blob` | monster | fire_elemental | S13_Human | hp5 life450 dmg10 spd10 | speed=3 | weightless,light_lamp,fire_proof,fire_blood | heat_resistance,hydrophobia,egg_flames,gestation_long,reproduction_soulborne,reproduction_strategy_oviparity | kingdom_id_wild=fire_elemental default_attack=fire_hands unit_other=true use_items=false take_items=false has_baby_form=false allowed_status_tiers=Basic die_in_lava=false |
| `fire_elemental_horse` | monster | fire_elemental | S13_Human | hp5 life450 dmg10 spd10 | speed=20 | weightless,light_lamp,fire_proof,fire_blood | heat_resistance,hydrophobia,egg_flames,gestation_long,reproduction_soulborne,reproduction_strategy_oviparity | kingdom_id_wild=fire_elemental default_attack=fire_hands unit_other=true use_items=false take_items=false has_baby_form=false allowed_status_tiers=Basic die_in_lava=false |
| `fire_elemental_slug` | monster | fire_elemental | S13_Human | hp5 life450 dmg10 spd10 | speed=2 | weightless,light_lamp,fire_proof,fire_blood | heat_resistance,hydrophobia,egg_flames,gestation_long,reproduction_soulborne,reproduction_strategy_oviparity | kingdom_id_wild=fire_elemental default_attack=fire_hands unit_other=true use_items=false take_items=false has_baby_form=false allowed_status_tiers=Basic die_in_lava=false |
| `fire_elemental_snake` | monster | fire_elemental | S13_Human | hp5 life450 dmg10 spd10 | speed=5 | weightless,light_lamp,fire_proof,fire_blood | heat_resistance,hydrophobia,egg_flames,gestation_long,reproduction_soulborne,reproduction_strategy_oviparity | kingdom_id_wild=fire_elemental default_attack=fire_hands unit_other=true use_items=false take_items=false has_baby_form=false allowed_status_tiers=Basic die_in_lava=false |
| `ghost` | monster (no genome) | mob_no_genes | S13_Human |  | health=100 speed=10 damage=10 | weightless,fire_proof,freeze_proof |  | kingdom_id_wild=undead default_attack=base_attack unit_other=true die_on_blocks=false immune_to_injuries=true has_baby_form=false |
| `fire_skull` | monster | mob | S13_Human | hp5 dmg15 spd5 |  | evil,weightless,fire_blood,fire_proof | reproduction_soulborne,reproduction_strategy_oviparity,egg_flames | kingdom_id_wild=fire_skull default_attack=base_attack unit_other=true has_baby_form=false |
| `demon` | monster | mob | S14_Cow | hp200 sta150 mut2 life1000 dmg35 spd15 arm10 off6 |  | regeneration,burning_feet,fire_blood,evil | long_lifespan,reproduction_soulborne,egg_flames,reproduction_strategy_oviparity,bad_genes,heat_resistance,hydrophobia,diet_hematophagy | kingdom_id_wild=demon default_attack=base_attack unit_other=true die_in_lava=false default_weapons=(flame_sword) |
| `angle` | monster | mob | S14_Cow | hp200 sta200 mut2 life1000 dmg35 spd15 arm10 off7 |  | regeneration,blessed,light_lamp,psychopath | long_lifespan,egg_orb,reproduction_strategy_oviparity,bad_genes,heat_resistance,cold_resistance,reproduction_divine,pure,hovering | kingdom_id_wild=angle default_attack=base_attack unit_other=true die_in_lava=false default_weapons=(ice_hammer) |
| `fairy` | animal (peaceful) | peaceful_animal | S3_Rat | hp40 sta100 life300 mut2 dmg8 spd15 arm2 off5 | damage=1 | peaceful,weightless,healing_aura,immune,light_lamp,moonchild | diet_frugivore,diet_florivore,egg_rainbow,reproduction_sexual,reproduction_strategy_oviparity,hovering | kingdom_id_wild=fairy unit_other=true die_on_blocks=false source_meat=false move_from_block=true |
| `bandit` | monster | mob | S13_Human | hp100 sta100 life60 mut2 dmg18 spd10 arm5 off5 dip4 war6 stw3 int4 |  | bomberman,thief | reproduction_sexual,reproduction_strategy_viviparity,bad_genes,diet_omnivore | kingdom_id_wild=bandit default_attack=base_attack unit_other=true default_weapons=(spear_bronze, spear_steel, spear_iron, sword_bronze, sword_steel, sword_iron, bow_bronze, bow_steel, bow_iron) |
| `snowman` | monster | mob | S13_Human | hp100 sta50 life60 mut5 dmg10 spd10 arm5 off3 dip2 war2 stw2 int2 |  | heliophobia,regeneration,cold_aura,fat,freeze_proof | reproduction_fission,genetic_mirror,egg_ice,reproduction_strategy_oviparity,cold_resistance,hydrophobia | kingdom_id_wild=snowman default_attack=snowball unit_other=true |
| `alien` | monster | mob | S13_Human | hp100 sta150 life60 mut2 dmg18 spd10 arm5 off3 dip7 war7 stw7 int7 | lifespan=1000 | regeneration,fat,acid_blood,acid_proof | diet_omnivore,fins,cold_resistance,egg_alien,reproduction_strategy_oviparity,reproduction_sexual | kingdom_id_wild=aliens default_attack=base_attack unit_other=true default_weapons=(alien_blaster) |
| `civ_cat` | sapient (uplifted animal) | animal_civ | S13_Human | dip7 war7 stw5 int8 hp80 sta150 life100 mut2 dmg20 spd17 off5 |  | dodge,battle_reflexes | reproduction_strategy_viviparity,gestation_moderate,reproduction_sexual,diet_omnivore,inquisitive_nature | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_dog` | sapient (uplifted animal) | animal_civ | S13_Human | dip7 war7 stw5 int8 hp120 sta130 life80 mut2 dmg20 spd14 off5 |  | dash | reproduction_strategy_viviparity,gestation_moderate,reproduction_sexual,diet_omnivore | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_chicken` | sapient (uplifted animal) | animal_civ | S13_Human | dip7 war5 stw7 int8 hp60 sta30 life80 mut3 dmg10 spd7 off12 |  |  | reproduction_strategy_oviparity,egg_shell_plain,reproduction_sexual,diet_herbivore,cautious_instincts | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_rabbit` | sapient (uplifted animal) | animal_civ | S13_Human | dip7 war4 stw7 int8 hp60 sta150 life90 mut3 dmg10 spd12 off12 |  |  | reproduction_strategy_viviparity,gestation_moderate,reproduction_sexual,high_fecundity,diet_herbivore,cautious_instincts | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_monkey` | sapient (uplifted animal) | animal_civ | S13_Human | dip7 war6 stw5 int8 hp90 sta140 life80 mut2 dmg20 spd14 off8 |  |  | reproduction_strategy_viviparity,gestation_long,reproduction_sexual,diet_omnivore | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_fox` | sapient (uplifted animal) | animal_civ | S13_Human | dip7 war7 stw6 int8 hp80 sta120 life120 mut2 dmg20 spd12 off4 |  |  | reproduction_strategy_viviparity,gestation_long,reproduction_sexual,diet_omnivore | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_sheep` | sapient (uplifted animal) | animal_civ | S13_Human | dip7 war4 stw7 int6 hp90 sta30 life100 mut2 dmg10 spd6 off2 |  | greedy | reproduction_strategy_viviparity,gestation_long,reproduction_sexual,diet_omnivore,cautious_instincts | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_cow` | sapient (uplifted animal) | animal_civ | S13_Human | dip7 war4 stw7 int6 hp120 sta20 life100 mut2 dmg10 spd7 off2 |  | tough | reproduction_strategy_viviparity,gestation_long,reproduction_sexual,diet_herbivore | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_armadillo` | sapient (uplifted animal) | animal_civ | S13_Human | dip5 war7 stw7 int6 hp200 sta50 life100 mut1 dmg20 arm20 spd10 off2 |  |  | reproduction_strategy_viviparity,gestation_long,reproduction_sexual,diet_herbivore | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_wolf` | sapient (uplifted animal) | animal_civ | S13_Human | dip6 war7 stw5 int7 hp130 sta140 life80 mut1 dmg18 spd14 off4 |  |  | reproduction_strategy_viviparity,gestation_short,reproduction_sexual,diet_omnivore,diet_cannibalism,diet_folivore | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_bear` | sapient (uplifted animal) | animal_civ | S13_Human | dip5 war7 stw6 int6 hp180 sta150 life80 mut3 dmg30 arm5 spd7 off2 |  |  | reproduction_strategy_viviparity,gestation_long,reproduction_sexual,cold_resistance,diet_omnivore,energy_preserver,aggressive | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_rhino` | sapient (uplifted animal) | animal_civ | S13_Human | dip4 war9 stw5 int5 hp230 sta110 life80 mut1 dmg35 arm15 spd10 off2 |  | dash,block,hard_skin,tough,strong | reproduction_strategy_viviparity,gestation_very_long,reproduction_sexual,diet_omnivore,aggressive | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_buffalo` | sapient (uplifted animal) | animal_civ | S13_Human | dip6 war7 stw6 int6 hp160 sta120 life80 mut1 dmg18 spd10 off2 |  | tough,dash | reproduction_strategy_viviparity,gestation_very_long,reproduction_sexual,diet_omnivore | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_hyena` | sapient (uplifted animal) | animal_civ | S13_Human | dip6 war7 stw6 int7 hp130 sta140 life80 mut1 dmg18 arm5 spd14 off6 |  |  | reproduction_strategy_viviparity,gestation_moderate,reproduction_sexual,diet_omnivore | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_rat` | sapient (uplifted animal) | animal_civ | S13_Human | dip6 war5 stw6 int7 hp80 sta50 life80 mut4 dmg12 spd10 arm5 off15 |  |  | reproduction_strategy_viviparity,gestation_short,reproduction_sexual,high_fecundity,diet_omnivore | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_alpaca` | sapient (uplifted animal) | animal_civ | S13_Human | dip6 war5 stw8 int7 hp110 sta50 life150 mut1 dmg18 spd6 off3 |  | soft_skin | reproduction_strategy_viviparity,gestation_moderate,reproduction_sexual,diet_herbivore | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_capybara` | sapient (uplifted animal) | animal_civ | S13_Human | dip7 war5 stw8 int7 hp130 sta30 life90 mut1 dmg18 spd5 off4 |  | peaceful,content,arcane_reflexes | reproduction_strategy_viviparity,gestation_moderate,reproduction_sexual,diet_herbivore | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_goat` | sapient (uplifted animal) | animal_civ | S13_Human | dip6 war5 stw8 int7 hp110 sta100 life80 mut1 dmg15 spd9 off3 |  |  | reproduction_strategy_viviparity,gestation_moderate,reproduction_sexual,diet_herbivore | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_scorpion` | sapient (uplifted animal) | animal_civ | S13_Human | dip4 war8 stw5 int7 hp130 sta30 life150 mut3 dmg30 spd7 arm25 off25 |  | venomous,poison_immune | reproduction_strategy_viviparity,gestation_very_long,reproduction_sexual,diet_omnivore | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_crab` | sapient (uplifted animal) | animal_civ | S13_Human | dip5 war7 stw6 int6 hp130 sta20 life80 mut1 dmg18 spd7 arm25 off30 |  | hard_skin | reproduction_strategy_oviparity,egg_roe,reproduction_sexual,exoskeleton,diet_omnivore,diet_algivore,fins | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_penguin` | sapient (uplifted animal) | animal_civ | S13_Human | dip6 war5 stw6 int7 hp110 sta100 life80 mut1 dmg12 spd6 off2 |  | freeze_proof | reproduction_strategy_oviparity,egg_shell_plain,reproduction_sexual,fins,diet_omnivore | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_turtle` | sapient (uplifted animal) | animal_civ | S13_Human | dip6 war5 stw8 int7 hp180 sta50 life500 mut1 dmg12 spd5 arm25 off20 |  |  | reproduction_strategy_oviparity,egg_colored,reproduction_sexual,fins,diet_omnivore,cautious_instincts | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_crocodile` | sapient (uplifted animal) | animal_civ | S13_Human | dip5 war7 stw5 int6 hp130 sta60 life90 mut1 dmg20 spd6 arm10 off10 |  |  | reproduction_strategy_oviparity,egg_shell_plain,reproduction_sexual,fins,diet_omnivore,diet_cannibalism | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_snake` | sapient (uplifted animal) | animal_civ | S13_Human | dip6 war7 stw5 int7 hp80 sta40 life150 mut1 dmg18 spd10 arm5 off10 |  | venomous | reproduction_strategy_oviparity,egg_shell_plain,reproduction_sexual,diet_omnivore | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_frog` | sapient (uplifted animal) | animal_civ | S13_Human | dip6 war5 stw6 int7 hp80 sta50 life90 mut3 dmg12 spd7 off15 |  |  | reproduction_strategy_oviparity,egg_bubble,reproduction_sexual,high_fecundity,diet_omnivore | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_piranha` | sapient (uplifted animal) | animal_civ | S13_Human | dip4 war9 stw4 int7 hp40 sta50 life30 mut1 dmg30 spd7 arm5 off20 |  | battle_reflexes | reproduction_strategy_oviparity,egg_roe,reproduction_sexual,high_fecundity,aggressive,diet_carnivore,diet_cannibalism,diet_hematophagy | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_liliar` | sapient (uplifted animal) | animal_civ | S13_Human | dip9 war4 stw9 int8 hp40 sta100 life400 mut2 dmg5 spd10 off10 |  | regeneration | reproduction_vegetative,high_fecundity,population_moderate,diet_hematophagy,genetic_mirror | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_garlic_man` | sapient (uplifted animal) | animal_civ | S13_Human | dip6 war5 stw8 int7 hp80 sta100 life250 mut2 dmg12 spd12 arm5 off9 |  | poison_immune,regeneration | reproduction_vegetative,high_fecundity,population_moderate,genetic_mirror | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_lemon_man` | sapient (uplifted animal) | animal_civ | S13_Human | dip9 war5 stw8 int8 hp80 sta100 life150 mut4 dmg12 spd14 off5 |  | poison_immune,paranoid,attractive,lucky,regeneration | reproduction_hermaphroditic,high_fecundity,population_large | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_acid_gentleman` | sapient (uplifted animal) | animal_civ | S13_Human | dip4 war7 stw5 int8 hp80 sta30 life150 mut10 dmg18 spd5 arm5 off10 |  | acid_blood,acid_proof,acid_touch,poison_immune,paranoid,attractive | reproduction_strategy_oviparity,egg_blob,reproduction_fission,genetic_mirror,bad_genes,diet_omnivore,diet_cannibalism | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_crystal_golem` | sapient (uplifted animal) | animal_civ | S13_Human | dip4 war9 stw5 int7 hp250 sta60 life1000 mut1 dmg30 spd5 arm30 off2 |  | shiny,strong_minded | reproduction_strategy_oviparity,egg_crystal,reproduction_hermaphroditic,gestation_extremely_long,heat_resistance,cold_resistance,diet_lithotroph | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_candy_man` | sapient (uplifted animal) | animal_civ | S13_Human | dip9 war5 stw6 int8 hp85 sta60 life150 mut5 dmg12 spd10 off4 |  | flesh_eater,evil,gluttonous,strong_minded | reproduction_vegetative,reproduction_strategy_oviparity,egg_candy,diet_cannibalism,diet_carnivore,diet_hematophagy,genetic_mirror | kingdom_id_wild=neutral_animals default_attack=hands |
| `civ_beetle` | sapient (uplifted animal) | animal_civ | S13_Human | dip4 war9 stw7 int7 hp100 sta70 life50 mut1 dmg10 spd5 off10 |  | hard_skin,slow,strong | diet_xylophagy,diet_omnivore,high_fecundity,reproduction_sexual,reproduction_strategy_oviparity,gestation_moderate,exoskeleton,egg_cocoon | kingdom_id_wild=neutral_animals default_attack=rocks |
| `greg` | monster | mob | S15_Bear | hp500 sta200 mut2 dmg100 arm10 spd40 |  | giant,strong,regeneration | hydrophobia,diet_geophagy,diet_xylophagy,long_lifespan,high_fecundity,exoskeleton,parental_care,reproduction_strategy_oviparity,reproduction_parthenogenesis,genetic_mirror,gestation_extremely_long,voracious,egg_face | kingdom_id_wild=greg default_attack=base_attack special=true unit_other=true has_baby_form=false |
| `living_plants` | monster (no genome) | mob_no_genes | S15_Bear |  | attack_speed=70 mass=50 knockback=1.2 targets=3 health=300 speed=10 armor=0 damage=30 scale=0.25 | regeneration |  | kingdom_id_wild=living_plants default_attack=base_attack special=true use_items=false take_items=false damaged_by_ocean=true has_baby_form=false |
| `living_house` | monster (no genome) | mob_no_genes | S15_Bear |  | attack_speed=60 mass=50 knockback=1.4 targets=3 health=500 armor=1 speed=10 damage=50 scale=0.25 |  |  | kingdom_id_wild=living_houses default_attack=base_attack special=true use_items=false take_items=false damaged_by_ocean=true has_baby_form=false |
| `dragon` | special |  | S17_Dragon |  | health=1000 damage=100 speed=40 size=2 mass=4 targets=20 lifespan=10000 scale=0.3 | regeneration,strong_minded,fire_proof,fire_blood |  | flags: skip_fight_logic (attacks via its own job), ignore_blocks, height physics, can_flip, experience_given 100, not possessable/surprisable, status tier Basic, die_in_lava false, cancel_beh_on_land false, zombie form `zombie_dragon`; resources dragon_scales 10, meat 10, bones 10 |
| `zombie_dragon` | special | dragon | S17_Dragon |  | health=1000 damage=100 speed=40 size=2 mass=4 targets=20 lifespan=10000 scale=0.3 | regeneration,strong_minded,fire_proof,fire_blood,acid_blood,acid_proof |  | flags: as dragon; die_in_lava true |
| `UFO` | special |  | S17_Dragon |  | health=100 armor=5 speed=20 damage=80 lifespan=0 size=2 mass=5 scale=0.3 | strong_minded,fire_proof,light_lamp |  | flags: flying, very_high_flyer, skip_fight_logic, ignore_blocks, die_by_lightning, no skin, status tier Basic, not possessable/surprisable |
| `crabzilla` | special |  | S17_Dragon |  | health=10000 speed=50 damage=10 size=8 scale=0.25 | strong_minded |  | flags: status tier None, no AI system, skip_fight_logic, can_level_up false, ignore_blocks, not saved, controlled by dedicated code; destroyed on death |
| `god_finger` | special |  | S17_Dragon |  | mass=5 speed=50 damage=80 lifespan=10000 size=2 health=100 armor=5 scale=0.3 | light_lamp,strong_minded,fire_proof |  | flags: flying, very_high_flyer, skip_fight_logic, ignore_blocks, die_by_lightning, status tier Basic, not saved |
| `ant_black` | basic | basic_unit | S13_Human |  | speed=20 | strong_minded |  | kingdom_id_wild=ants unit_other=true skip_fight_logic=true die_on_blocks=false ignore_blocks=true force_ocean_creature=true force_land_creature=true can_be_killed_by_stuff=true update_z=true ignore_tile_speed_multiplier=true move_from_block=false run_to_water_when_on_fire=false can_be_moved_by_powers=true can_be_hurt_by_powers=true |
| `ant_green` | basic | ant_black | S13_Human |  | speed=20 | strong_minded |  | kingdom_id_wild=ants unit_other=true skip_fight_logic=true die_on_blocks=false ignore_blocks=true force_ocean_creature=true force_land_creature=true can_be_killed_by_stuff=true update_z=true ignore_tile_speed_multiplier=true move_from_block=false run_to_water_when_on_fire=false can_be_moved_by_powers=true can_be_hurt_by_powers=true |
| `ant_blue` | basic | ant_black | S13_Human |  | speed=20 | strong_minded |  | kingdom_id_wild=ants unit_other=true skip_fight_logic=true die_on_blocks=false ignore_blocks=true force_ocean_creature=true force_land_creature=true can_be_killed_by_stuff=true update_z=true ignore_tile_speed_multiplier=true move_from_block=false run_to_water_when_on_fire=false can_be_moved_by_powers=true can_be_hurt_by_powers=true |
| `ant_red` | basic | ant_black | S13_Human |  | speed=20 | strong_minded |  | kingdom_id_wild=ants unit_other=true skip_fight_logic=true die_on_blocks=false ignore_blocks=true force_ocean_creature=true force_land_creature=true can_be_killed_by_stuff=true update_z=true ignore_tile_speed_multiplier=true move_from_block=false run_to_water_when_on_fire=false can_be_moved_by_powers=true can_be_hurt_by_powers=true |
| `sand_spider` | basic | ant_black | S13_Human |  | speed=100 | strong_minded |  | kingdom_id_wild=ants unit_other=true skip_fight_logic=true die_on_blocks=false ignore_blocks=true force_ocean_creature=true force_land_creature=true can_be_killed_by_stuff=true update_z=true ignore_tile_speed_multiplier=true move_from_block=false run_to_water_when_on_fire=false can_be_moved_by_powers=true can_be_hurt_by_powers=true |
| `worm` | basic | ant_black | S13_Human |  | speed=100 | strong_minded,fire_proof |  | kingdom_id_wild=nature unit_other=true skip_fight_logic=true die_on_blocks=false ignore_blocks=true force_ocean_creature=true force_land_creature=true can_be_killed_by_stuff=false update_z=true ignore_tile_speed_multiplier=true move_from_block=false run_to_water_when_on_fire=false can_be_moved_by_powers=false can_be_hurt_by_powers=true |
| `printer` | basic | ant_black | S13_Human |  | mass=10 speed=10000 health=1 | strong_minded |  | kingdom_id_wild=nature unit_other=true skip_fight_logic=true die_on_blocks=false ignore_blocks=true force_ocean_creature=true force_land_creature=true can_be_killed_by_stuff=true update_z=true ignore_tile_speed_multiplier=true move_from_block=false run_to_water_when_on_fire=false can_be_moved_by_powers=false can_be_hurt_by_powers=true |
| `mush_unit` | creep monster | creep_mob | S13_Human | hp200 sta50 life100 mut5 dmg15 spd6 | speed=10 | weightless,mush_spores,regeneration |  | kingdom_id_wild=mush default_attack=base_attack unit_other=true |
| `mush_animal` | creep monster | mush_unit | S13_Human | hp200 sta50 life100 mut5 dmg15 spd6 | speed=10 health=5 | weightless,mush_spores,regeneration |  | kingdom_id_wild=mush default_attack=base_attack unit_other=true use_items=false take_items=false |
| `tumor_monster_unit` | monster | mob | S13_Human | hp100 sta50 life100 mut5 dmg15 spd6 |  | weightless,ugly |  | kingdom_id_wild=tumor default_attack=base_attack unit_other=true immune_to_tumor=true has_baby_form=false |
| `tumor_monster_animal` | monster | tumor_monster_unit | S13_Human | hp100 sta50 life100 mut5 dmg15 spd6 |  | weightless,ugly |  | kingdom_id_wild=tumor default_attack=base_attack unit_other=true use_items=false take_items=false immune_to_tumor=true has_baby_form=false |
| `lil_pumpkin` | monster | tumor_monster_animal | S13_Human | hp1100 sta200 life200 mut10 dmg30 spd12 |  | attractive,fat,bloodlust,thorns | egg_pumpkin,reproduction_strategy_oviparity | kingdom_id_wild=super_pumpkin default_attack=base_attack unit_other=true use_items=false take_items=false immune_to_slowness=true immune_to_tumor=true has_baby_form=false |
| `assimilator` | monster | tumor_monster_animal | S13_Human | hp1100 sta350 life200 mut10 dmg30 spd12 arm20 | damage=0 | weightless,ugly,fire_proof,bubble_defense | hydrophobia,egg_metal_box,reproduction_strategy_oviparity | kingdom_id_wild=assimilators default_attack=base_attack unit_other=true take_items=false immune_to_tumor=true has_baby_form=false default_weapons=(shotgun) |
| `bioblob` | monster | tumor_monster_animal | S13_Human | hp300 sta70 life200 mut10 dmg30 spd12 arm20 |  | weightless,ugly,strong_minded,ugly,fragile_health | egg_eyeball,reproduction_strategy_oviparity | kingdom_id_wild=biomass default_attack=base_attack unit_other=true use_items=false take_items=false immune_to_slowness=true immune_to_tumor=true has_baby_form=false |
Templates (not creatures): `$basic_unit$` (base values above), `$basic_unit_colored$` (+baby form, items, killable, attacks buildings), `$animal_base$`, `$animal_fur$`, `$animal_skin$`, `$animal$` (default attack jaws, meat), `$peaceful_animal$` (damage 1, trait peaceful), `$carnivore$`/`$herbivore$`/`$omnivore$` (diet trait), `$insect$` (size S0, speed 5, health 1, damage 1, peaceful, 5 spawn count), `$flying_insect$` (+weightless, hovering), `$civ_unit$` (+prefrontal_cortex, default attack hands, genome size 20, family group size 10, zombie-able), `$civ_advanced_unit$` (humanoid), `$animal_civ$` (uplifted-animal civ: genome dip3/war3/stw3/int3), `$mob_no_genes$`/`$mob$`/`$creep_mob$` (base_attack default; creep +speed 10).

#### 5.9.1 Boats
Common to all boats: trait `boat`, `force_ocean_creature`, `immune_to_injuries`, killable, can attack buildings, status tier Basic, mass 1000 (x physics), size 1, scale 0.25. Dies (Gravity) if on a non-liquid tile.
| template | actor size | health | speed | attack_speed | extra |
|---|---|---|---|---|---|
| boat_fishing | S15_Bear | 100 | 10 | 1 | skip_fight_logic; fishing boat |
| boat_trading_<species> | S16_Buffalo | 200 | 30 | 0.1 | + trait light_lamp; default attack by species |
| boat_transport_<species> | S17_Dragon | 1000 | 25 | 0.5 | + trait light_lamp; default attack by species |
Species -> default attack (same for trading/transport except rhino: trading uses cannonball, transport uses arrows): **boat_cannonball**: human, orc, dwarf, alpaca, armadillo, buffalo, crystal_golem, turtle, bandit, (trading only) rhino; **boat_arrow**: elf, bear, candy_man, capybara, cat, chicken, cow, crab, crocodile, dog, fox, goat, hyena, monkey, rabbit, rat, scorpion, sheep, snake, wolf, druid, bee, fairy, (transport only) rhino; **boat_acid_ball**: acid_gentleman, frog, garlic_man, lemon_man, liliar; **boat_freeze_ball**: angle, white_mage, cold_one; **boat_snowball**: penguin, snowman; **boat_necro_ball**: piranha, necromancer; **boat_fireball**: evil_mage, demon; **boat_plasma_ball**: alien, greg; **rocks**: beetle.
Boat weapons (stats merged into the boat while "unarmed"): all ranged with `targets` 4. cannonball: damage 50, range 14, aoe 3, crit 0.1, projectiles 1; arrow: damage 30, range 9, aoe 0, accuracy +4, crit 0.2, attack_speed 0.5 (additive), projectiles 5; snowball: 50 / 14 / aoe 3 / crit 0.1 / 1; plasma_ball: 65 / 20 / aoe 2 / crit 0.2 / 1; necro_ball: 45 / 12 / aoe 3 / crit 0.1 / 3 (skulls); fireball: 30 / 12 / aoe 2 / crit 0.1 / 1; freeze_ball: 30 / 12 / aoe 2 / crit 0.1 / 3 (freeze orbs); acid_ball: 50 / 14 / aoe 4 / crit 0.1 / 5. All carry crit multiplier +0.5 and the ranged template's damage_range 0.6. Because a boat is "unarmed" these weapon stats are *added* to the boat's own stats (e.g. arrow boats: attack_speed 0.5 + 0.5 = 1, accuracy 1 + 4 = 5).
## 6. Interactions

Suggested boundaries for a re-implementation (what the creature module needs from, and gives to, the rest of the game).

**Inputs the creature core reads from other systems**
- *Subspecies* (innate stat sheet + male/female sheets + meta sheet: age_adult, age_breeding, maturation, max_nutrition, limit_population, mutation; booleans: needs_food, needs_mate, is_sapient, has_emotions, diet tags, has_egg_form, is_damaged_by_water, is_water_creature, reproduction method/strategy; metabolic rate; birth traits; combat actions, spells, hooks; population count/limit; sex counts).
- *Clan / language / culture* (stat sheets, trait lookups such as fast_learners, training_potential, ancestors_knowledge, expertise_exchange, youth_reverence, tiny_legends; hooks) and *religion* (spells, combat actions, hooks).
- *Kingdom* (is enemy of X; "units always aggressive"; is civilised; is mob/brain kingdom; wild kingdom id per asset) and *city* (housing slots, population law limits, item storage on death, food availability, army membership, kingship/leader roles, per-city death/birth counters).
- *Equipment* (per-slot item: base stats + modifier stats, durability, rigidity rating, weapon type melee/ranged, projectile id, metallic flag, spells, attack hooks).
- *World*: current time, era flags (night, moon, darkness overlay, light damage, range_weapons_multiplier), world laws (hunger, old age, civ babies, animal babies, peaceful monsters, angry civilians, rat plague, nature/other disasters, entanglewood, mushrooms, nectar nap, tickles, root pranks), tile data (type: block/ground/liquid/ocean/lava, walk multiplier, damage, fire state, biome and its spawn traits, island id), chunk spatial index (units/buildings per kingdom per chunk), global timers.
- *AI layer*: decision/task system (tasks like fighting, run_away, move_from_block, investigate_curiosity, try_to_eat_city_food, sexual_reproduction_*; task flags in_combat, ignore_fight_check, diet, cancellable_by_reproduction, speed_multiplier, verifier). The creature core only sets/cancels tasks and exposes "isHungry", "canBreed", "hasLover", "isFighting", etc.

**Outputs / side effects on other systems**
- Mark dirty the stat sheets of all members when a group trait changes.
- On birth: new creature, family creation/join, city housing slot -1 (city of the parent), per-group birth counters, parents' children counters; world creature counter.
- On death: group death counters by cause, kill credit & rewards to the killer, parent child-count decrement, items to city, king removal, army removal, battle markers, achievements.
- Kill/war statistics: war death counters by cause; weapon kill counter.
- Terrain/world effects through trait/status hooks (fire, acid, explosions, lightning, forces, plague spreading).
- Social: friendship formation uses likeability, relation, happiness similarity, family (not covered here); love formation (4.9) via an AI "socialize" pairing.

**Player powers** (not covered in detail): they act as callers of addStatus/addTrait/hit/knockback/heal with attack types Divine, Fire, etc., and of "spawn" and "clone" (copy age, traits, stats; baby clones start as babies).
## 7. Open questions

1. **Fixed tick rate / time scale.** The simulation step is a fixed engine step multiplied by a speed multiplier (named speeds x0.5, x1, x2, x3, x4, x5, x10, x15, x20; the fastest speed runs extra sub-steps). The base step length was not found in the decompiled assembly (it comes from engine settings). Per-tick-sampled behaviours (natural-death hazard, combat-action rolls every tick, hit/shake windows) depend on it; a 50 Hz base (20 ms) is a reasonable assumption. Re-implementers should rescale per-tick probabilities to per-second rates.
2. **Job skip scope.** Interpreted as one random skip counter per *job* shared by all creatures (so the "0..N frames" gap applies to the whole population at once, not per creature). Per-creature jittering would give similar average rates but changes the natural-death cadence.
3. **`damage_range` when no weapon provides it**: the stat reads 0, so the roll is uniform in [0, damage] for creatures whose default weapon and equipment give none. Default melee pseudo weapons do give 0.5 (so 50-100% of damage); animals using `jaws` etc. therefore roll in [0.5, 1.0] x damage.
4. **`critical_damage_multiplier` truncation**: stat sums such as 2 + 0.5 are truncated to 2 at use. Whether this is intentional (item crit bonuses being inert below +1) is unknown.
5. **Zombie lifespan**: zombie assets set base lifespan to 0 (meaning "no old-age death") but the subspecies floor raises lifespan to at least 1 when a subspecies exists; whether zombies actually age out (they would after year 1 if so) was not verified. Treat zombies as non-ageing unless tested.
6. **`poisonous` trait** (frogs, etc.) has no code effect found in the creature core; probably consumed by the AI/food layer or purely cosmetic. Similarly `miner`, `gluttonous`, `hotheaded`, `lustful`, `light_lamp`, `genius`, `weightless` have effects outside the files read here (the `weightless` flag is cached but its consumers were not traced).
7. **`status_chance`, `experience`, `happiness` stat entries, `interval_happiness`, `interval_stamina`, `interval_mana` constants**: defined but with no consumer found in the creature core (stamina and mana regeneration run on the 15 ws hunger tick instead).
8. **Starving creatures never regenerate stamina/mana** via the tick; other regeneration (rest/sleep tasks, items, spells) lives in the AI layer, not covered.
9. **Death processing gating**: the death step is skipped while a UI window is open on screen, delaying deaths. This is almost certainly an engine/UI quirk; a re-implementation should process deaths every frame.
10. **Player-placed spawns** start at age 1 in the code path read (babies for baby-form assets); the actual spawning tools may add an adult flag - not traced.
11. **Genome**: the full gene/locus/synergy machinery (neighbour synergy bonuses, "bad" gene halving, mutation of genes, chromosomes) is only summarised (2.6, 5.8). The greedy split makes the innate stat approximately equal to the budget; exact values depend on shuffles.
12. **Stat sheets of subspecies traits and `stomach`/`amygdala`/`prefrontal_cortex` etc.** (brain/body traits) were not read: they add flags/decisions/tags and some stats; the creature rules above only use the listed ones.
13. **Friend/love formation rules** (the friendship and likeability routines, socialize decisions) were only partially read: likeability and trait same/opposite modifiers feed them; formulas are not specified here beyond the love prerequisites.
14. **Status `possessed` controls** (player steering/attacks) and the `tantrum`, `confused`, `strange_urge` behaviours are AI/decision layer.
15. **Personality** (balanced/diplomat/administrator/militarist) stat packages were not read (they only affect civ-level hidden stats).
16. **`recovery_plot`, `voices_in_my_head`, `on_guard`, `festive_spirit`** etc. are mostly markers whose consumers are in plot/city/AI code.
17. **World-law default states** other than hunger (on), old age (on) and peaceful monsters (off) were not extracted.
18. **Skill pool**: `combat=true` traits (dash, block, dodge, backstep, deflect_projectile, bomberman, pyromaniac) form a pool for random skill assignment; its distribution is outside this spec (`COMBAT_SKILLS_AMOUNT` = 5 is the max count named in the library).
19. **Eating/food resources** (restore values, tastiness, favourite chance) are resource-library data not extracted here.
20. **Projectile asset sizes/speeds/terraform effects** beyond speed and blockability are not extracted.
