# Actor AI - Behaviour Spec (clean-room)

Scope: how creatures (animals and sapient citizens) decide what to do and carry it out.
All numbers are as observed in the reference implementation. "Unclear" is stated where the source did not settle a point.
Time units: "seconds" means simulated world seconds (the same clock used for cooldowns and wait timers).

Contents
1. Decision system (utility selection)
2. Decision table (every decision)
3. Task machinery (AI runner, results, jobs)
4. Task library (every task and its ordered actions)
5. Action classes grouped by purpose
6. Actor jobs and citizen jobs
7. Herds, families, movement targets, islands, re-decision cadence

---

## 1. Decision system (utility selection)

### 1.1 Data model

A **decision** has: id, optional task id (the task actually started; if blank the task id equals the decision id), a priority layer, a base weight (default 1), an optional custom-weight rule, a cooldown (seconds), an optional "launch check" (boolean rule on the actor), and flags:

| flag | meaning |
|---|---|
| unique | not in any shared list; only reaches an actor via a source that explicitly grants it (see 1.4) |
| list_civ / list_baby / list_animal | which shared list a non-unique decision joins (checked in order baby, animal, civ, else "others") |
| cooldown_on_launch_failure | if the launch check returns false, still start the cooldown |
| only_adult | actor must be adult |
| only_mob | actor must NOT belong to a civilization kingdom |
| only_herd | actor species must have herd-following enabled |
| only_sapient | actor must be sapient |
| only_safe | actor must not currently have an attack target (not fighting) |
| only_hungry | actor nutrition ratio <= 0.5 (and actor must need food at all) |
| only_special | declared but unused by the selector |

Decision indices are assigned in table order (section 2) and index the per-actor cooldown and enable arrays.

### 1.2 Priority layers ("neural layers")

Five layers, index 0..4: Minimal(0), Low(1), Moderate(2), High(3), Critical(4). Only layer 4 is flagged **critical**. Each layer asset also stores a "chance to go to next layer" (0, 0.3, 0.2, 0.1, 0 for layers 0..4) but NOTHING reads it - it is dead data; do not implement it.

### 1.3 Selection algorithm (one call = one decision for one actor)

1. Flip a **priority-level coin**: with probability 0.8 "priority mode" is ON for this call; 20% it starts OFF.
2. Build the candidate list from these sources, in this order:
   a. If the actor's species is a boat: no shared lists at all. Otherwise:
      - animal (not sapient and not a special "other" unit type): the animal list;
      - else if the actor is in a civilization kingdom: the civ list, plus the city list if it has a city (the city list is always empty in the reference);
      - if baby (any kind): also the children list;
      - always: the "others" list.
   b. The species' own decision list (decisions attached to the actor species asset).
   c. The actor's personal decision list (collected from its traits, clan, culture, language, religion (only if it may use religion spells), subspecies, profession, spells, equipped weapon, family/city/plot/clan meta-type defaults, and active status effects; see 1.4).
3. A decision becomes a **candidate** only if ALL hold:
   - (priority mode ON and its layer < best layer seen so far) is false (cheap early-out; see note);
   - it is not on cooldown (see 1.5);
   - it is not disabled on this actor;
   - its flag requirements (only_*) pass;
   - its launch check (if any) returns true. If it returns false and cooldown_on_launch_failure is set, the cooldown starts anyway.
4. When a candidate is added: if its layer is critical (layer 4), priority mode is forced ON for the rest of the call. While priority mode is ON, the "best layer seen" is raised to the candidate's layer if higher.
5. After registration: if priority mode is ON, only candidates whose layer equals the best layer are kept; otherwise all candidates stay. For each kept candidate the weight is the fixed weight, or the custom-weight rule's result if one exists.
6. If there are no candidates: no decision (actor keeps doing nothing this call; the AI runner will call again later, see 3/7).
7. **Weight to chance**: chance_i = e^(weight_i) (natural exponential, randomness factor 1). Draw r uniform in [0,1) times the sum of chances; walk the list in order accumulating chances; pick the first item whose running total exceeds r (falls back to the last). So weights are log-odds: weight difference of 1 means ~2.72x as likely; 0.1 vs 3 is ~1:18.
8. On pick (gameplay mode): the cooldown timestamp of the chosen decision is set to "now" (only if its cooldown value is non-zero). The task (task id, else decision id) is then started on the actor and the actor's "last decision id" is recorded.

Note on step 3's early-out: because candidates are tested in list order, a low-layer candidate registered before a high-layer one stays in its own layer bucket but is simply not used later; the result is the same as filtering at the end. A implementer may simply: collect all valid candidates, decide priority mode (coin, or forced by any critical candidate), keep only the max layer if ON.

Effective behaviour: 80% of the time (always, if any critical decision is valid) only the highest-layer valid decisions compete; 20% of the time all valid decisions compete together, which is how Minimal/Low "idle" decisions occasionally win over urgent ones.

A "simulation" variant (used by the UI mind tab) skips cooldowns/disable/launch checks/priority and only uses the isPossible flags + weights; it never sets cooldowns. Not needed for gameplay.

### 1.4 Where unique decisions come from (grants)

Decision ids granted by source (unique decisions only reach actors this way):
- **Subspecies traits** (actor's subspecies): advanced_hippocampus: try_to_read. wernicke_area: socialize_initial_check. amygdala: run_away_from_carnivore, run_away, reflection. prefrontal_cortex (sapience): check_lover_city, find_city_job, build_civ_city_here, try_to_return_to_home_city, try_to_start_new_civilization, check_join_city, check_join_empty_nearby_city. hibernation-group traits: nocturnal_dormancy: sleep_at_dark_age; circadian_drift: sleep_at_light_age; winter_slumberers: sleep_at_winter_age; chaos_driven: sleep_when_not_chaos_age. sleep cycles: polyphasic_sleep, monophasic_sleep (same-named decisions). reproduction traits: sexual and hermaphroditic: sexual_reproduction_try + find_lover; spores: asexual_reproduction_spores; fission; budding; parthenogenesis; vegetative; divine (each its same-named asexual_reproduction_* decision). stomach: try_to_eat_city_food. aquatic: random_swim. pollinating: pollinate. dreamweavers: try_affect_dreams. shiny_love and a chaos-group cognitive trait: try_to_steal_money. Diet traits grant diet_* decisions: xylophagy->diet_wood; geophagy->diet_tiles; lithotroph->diet_minerals; algivore->diet_algae; piscivore->diet_fish; frugivore->diet_fruits; florivore->diet_flowers; nectarivore->diet_nectar; granivore->diet_crops; folivore->diet_vegetation; graminivore->diet_grass; carnivore->diet_meat; hematophagy->diet_blood; insectivore->diet_meat_insect; cannibalism->diet_same_species; herbivore->fruits+vegetation+flowers+grass+crops; omnivore->fruits+vegetation+meat.
- **Actor traits**: thief (cognitive): try_to_steal_money; madness: madness_random_emotion; the four "desire_*" traits: follow_desire_target.
- **Clan traits**: blood_pact: banish_unruly_clan_members; deathbound: kill_unruly_clan_members.
- **Professions**: king: king_check_new_city_foundation, king_change_kingdom_language/culture/religion, claim_land. leader (city leader): leader_change_city_language/culture/religion, claim_land. warrior: warrior_try_join_army_group, check_warrior_limit, city_walking_to_danger_zone, warrior_army_captain_idle_walking_city, warrior_army_captain_waiting, warrior_army_leader_move_random, warrior_army_leader_move_to_attack_target, warrior_army_follow_leader, warrior_random_move, check_warrior_transport, warrior_train_with_dummy.
- **Meta-type defaults** (given to every member): family: family_check_existence, family_alpha_move, family_group_follow, family_group_leave, child_follow_parent. city (any actor with a city, not boats): give_tax, store_resources, make_items, find_house, try_to_take_city_item, repair_equipment, city_idle_walking, replenish_energy. plot: check_plot. clan: try_new_plot (it is also a civ-list decision).
- **Status effects** while active: possessed_follower: possessed_following; tantrum: do_tantrum; confused: status_confused; soul_harvested: status_soul_harvested; just_ate: try_to_poop; festive_spirit: try_to_launch_fireworks; being_suspicious: run_away_being_sus; burning: run_to_water_when_on_fire.
- **Species-level** (actor assets): boats get the 7 boat_* decisions; the bee species gets bee_find_hive and bee_create_hive; attack_golden_brain is granted to the cold_one, necromancer, skeleton and demon mob species; the jumpy_skull mob gets check_swearing; the plague_doctor mob gets random_move_towards_civ_building. Fixed-job actors (god finger, dragon, UFO, ants, worm, printer) get no decisions; they run their job only.
- Decisions not listed above and not unique come from the shared lists (1.3 step 2a); see the table in section 2 for which list.
- **Spells** (actor's known spells; spell ids in brackets): [teleport]: random_teleport + teleport_back_home; [cast_fire]: burn_tumors; [cast_blood_rain]: check_heal; [spawn_vegetation]: spawn_fertilizer; [spawn_skeleton]: make_skeleton; [cast_cure]: check_cure. Equipped weapons can also carry decisions (none observed in the files read).
- The 'unique' flag is only about shared lists; every decision in section 2 marked U arrives through exactly the sources above.

### 1.5 Cooldowns and per-actor enable/disable

- Each actor keeps, per decision index, a "last used" world-time stamp (0 = never/expired) and a "disabled" bit. Both are cleared when the actor's decision data is reset.
- A decision is on cooldown while (now - stamp) <= cooldown seconds; once elapsed time exceeds the cooldown the stamp is reset to 0. A cooldown value of 0 means no cooldown is ever recorded.
- Cooldown is stamped when the decision is CHOSEN (always) and when the launch check fails (only if cooldown_on_launch_failure).
- Disabled decisions are skipped entirely in gameplay selection. Disabling is a debug/UI feature (clicking a neuron in the mind tab toggles it, also makes the actor "confused" briefly); a simulation tool, not core gameplay. The centre neuron toggles all.

### 1.6 Entry point and gating

The decision call (`make decision for actor`) is only made when the actor runs the task action "make_decision" (section 4/5): that action queues the actor to a deferred batch that runs the decision on the next tick, before the AI runner (eggs never decide; the action itself ends the task). The deferred call:
- is skipped if the actor is unconscious, possessed, or its species has no AI system;
- if the actor's stats are "dirty" (pending recalculation), sets the task "wait" (a 0.5-1.3 s random wait) and decides nothing;
- else runs section 1.3 and, if a decision was chosen, REPLACES the current task with the decision's task. Replacing a task with the default clean flag first runs the actor's clear-behaviour hook: leaves any building the actor is inside, drops the attack target, zeroes the action wait timer, clears the tile target and stops movement, and nulls the tile/building/actor/book behaviour targets. The job (and its task index) is NOT cleared by this.

---

## 2. Decision table (every decision)

Legend: L0..L4 = priority layer. W = weight (chance = e^W). CD = cooldown seconds. "Task" blank = task id equals decision id. List: U = unique (granted, section 1.4), Oth = shared "others" list, Civ = civ-only list, Baby = children list, Ani = animal list. Flags: adult / mob (non-civ) / herd / sapient / safe (not fighting) / hungry (nutrition <= 50%) / CDF (cooldown on launch failure). "Launch" = the extra boolean rule; blank = none.

### 2.1 General movement and survival
| id | task | L | W | CD | list/flags | launch |
|---|---|---|---|---|---|---|
| swim_to_island | | 4 | 4 | 1 | Oth | actor is not on a "stable place" (see 7.5) |
| move_to_water | | 4 | 4 | 1 | Oth | same as above |
| random_move | | 0 | 0.2 | 1 | Oth | |
| random_fun_move | | 1 | 0.2 | 10 | Ani | |
| wait5 | | 0 | 0.1 | 10 | Oth | |
| random_swim | | 1 | 2 | 10 | U | |
| random_teleport | | 1 | 0.5 | 20 | U | |
| teleport_back_home | | 1 | 1 | 60 | U | has city AND 30% coin AND city tile exists AND it is on a different island from the actor |
| random_move_towards_civ_building | | 1 | 0.5 | 10 | U | |
| check_if_stuck_on_small_land | | 3 | 3 | 90 | Oth | the island under the actor is not "good" for it (7.5) |

### 2.2 Danger, fighting, status-driven (L3/L4)
| id | task | L | W | CD | flags | launch |
|---|---|---|---|---|---|---|
| run_away_from_carnivore | | 3 | 2 | 10 | U | actor is an animal, not itself carnivore, and a carnivore enemy is near on the same island |
| run_away | | 3 | 3.1 | 10 | U | actor has an attack target and health ratio > 0.2 |
| run_away_being_sus | run_away | 3 | 5 | 10 | U | always true (granted only by the "being suspicious" status) |
| do_tantrum | | 4 | 3 | 1 | U | (status tantrum) |
| possessed_following | | 4 | 3 | 1 | U | (status possessed follower) |
| status_confused | | 4 | 3.5 | 1 | U | (status confused) |
| run_to_water_when_on_fire | | 4 | 5 | 1 | U | species flag "runs to water when on fire" |
| status_soul_harvested | | 3 | custom: 2 if offspring limit not reached else 0.1 | 40 | U, safe, CDF | always true; counts a "reproduction neuron" fire on the subspecies |
| check_swearing | swearing | 3 | 0.1 | 60 | U, CDF | 10% coin |
| check_heal | | 2 | 0.5 | 5 | U | |
| check_cure | | 2 | 0.5 | 15 | U | 30% coin |
| burn_tumors | | 3 | 0.5 | 10 | U | 50% coin |
| make_skeleton | | 2 | 0.5 | 10 | U | |
| spawn_fertilizer | | 2 | 0.5 | 10 | U | |
| attack_golden_brain | | 3 | 1 | 60 | U, mob | |
| follow_desire_target | | 3 | 4 | 5 | U | |

### 2.3 Needs: eating, sleeping, bodily
| id | task | L | W | CD | flags | launch |
|---|---|---|---|---|---|---|
| diet_wood | | 3 | 1 | 30 | U safe hungry | |
| diet_tiles, diet_minerals, diet_algae, diet_fish, diet_fruits, diet_flowers, diet_nectar, diet_crops, diet_vegetation | | 3 | 1 | 10 | U safe hungry | (each) |
| diet_grass | | 3 | 1 | 20 | U safe hungry | |
| diet_meat, diet_blood, diet_meat_insect | | 3 | 0.96 | 25 | U safe hungry | |
| diet_same_species | | 3 | 0.3 | 60 | U safe hungry | nutrition ratio < 0.1 AND actor has status "starving" |
| try_to_eat_city_food | | 3 | 2.6 | 10 | U hungry | has city AND city has food suitable for the subspecies diet |
| try_to_steal_money | | 2 | 1 | 60 | U | hungry AND can get food from a city |
| bored_sleep | decide_where_to_sleep | 0 | 0.05 | 90 | Oth safe | |
| polyphasic_sleep | decide_where_to_sleep | 1 | 0.8 | 90 | U safe | |
| monophasic_sleep | decide_where_to_sleep | 1 | 0.75 | 200 | U safe | |
| sleep_at_winter_age | decide_where_to_sleep | 2 | 1 | 30 | U safe | current era is winter |
| sleep_at_dark_age | decide_where_to_sleep | 2 | 1 | 30 | U safe | current era is night |
| sleep_when_not_chaos_age | decide_where_to_sleep | 2 | 1 | 30 | U safe | era is not a chaos era |
| sleep_at_light_age | decide_where_to_sleep | 2 | 1 | 30 | U safe | era is a light era |
| try_to_poop | | 2 | 1.5 | 60 | U | actor size is not the smallest "bug" size AND subspecies lacks spore reproduction |
| replenish_energy | | 2 | 0.3 | 30 | U | stamina or mana not full AND city has a well |
| repair_equipment | | 2 | 0.3 | 300 | U | has equipment AND city has barracks |

### 2.4 Reproduction (all L3, unique)
Custom weight for all but vegetative: 2 if actor has not reached its offspring limit, else 0.1. Every success of a launch check also bumps a per-subspecies "reproduction neuron" counter (statistics only).
| id | CD | flags | launch |
|---|---|---|---|
| sexual_reproduction_try | 20 | adult safe CDF | can breed AND has lover AND not hungry |
| asexual_reproduction_divine | 60 | adult CDF | can breed AND has NO lover AND lacks trait "miracle_bearer" AND age ratio >= 0.6 |
| asexual_reproduction_fission | 20 | adult CDF | can breed AND health ratio >= 0.9 |
| asexual_reproduction_budding | 50 | adult CDF | can breed AND health ratio >= 0.9 |
| asexual_reproduction_parthenogenesis | 40 | adult CDF | is female AND can breed |
| asexual_reproduction_spores | 60 | adult CDF | can breed AND has status "just_ate" |
| asexual_reproduction_vegetative | 30 | adult CDF, fixed W 2.5 | can breed AND lacks status "taking_roots" |
| find_lover (L3, W1.5, CD50) | | adult | no lover AND is of breeding age |
| check_lover_city (L3, W1.5, CD30) | | adult | not king, not city leader, is female, has lover; lover has a city and a house; actor is not in the same city |

### 2.5 Family / herd (animals; see 7.1)
| id | L | W | CD | flags | launch |
|---|---|---|---|---|---|
| family_check_existence | 3 | 2 | 60 | U | family has <= 1 member |
| family_alpha_move | 2 | 0.8 | 200 | U herd | not sapient AND is the family alpha |
| family_group_follow | 2 | 0.7 | 5 | U herd | not sapient AND not alpha |
| family_group_leave | 1 | 0.5 | 20 | U herd adult safe | not sapient AND family is full AND not alpha |
| family_group_join_or_new_herd | 3 | 0.3 | 60 | Oth herd | not sapient AND has no family |
| child_follow_parent | 2 | 0.2 | 10 | U | family has founders AND actor is baby |
| child_random_flips / child_play_at_one_spot / child_random_jump | 1 | 0.1 each | 5 | Baby list | |

### 2.6 Social, mind, clan, plot
| id | task | L | W | CD | flags | launch |
|---|---|---|---|---|---|---|
| socialize_initial_check | | 2 | 0.5 | 30 | U | actor can socialize |
| reflection | | 2 | 2.5 | 100 | U | subspecies can process emotions |
| madness_random_emotion | | 3 | 2.5 | 60 | U | has subspecies that can process emotions |
| try_to_read | | 2 | 1 | 120 | U adult | has city, intelligence stat > 5, city has a book this actor can read |
| try_affect_dreams | | 2 | 1.5 | 120 | U adult | |
| try_to_launch_fireworks | | 2 | 1.5 | 60 | U | actor has enough money for the fireworks cost |
| try_new_plot | | 2 | 1.5 | 40 | Civ adult safe | has no plot AND has a clan |
| check_plot | | 3 | 5 | 3 | U safe | has a plot |
| kill_unruly_clan_members / banish_unruly_clan_members | | 3 | 3 | 200 | U | actor is the clan chief AND kingdom has enemies |

### 2.7 Civilian life (sapient)
| id | task | L | W | CD | flags | launch |
|---|---|---|---|---|---|---|
| try_to_start_new_civilization | | 3 | 1 | 30 | U sapient safe adult | not a king AND no city |
| check_join_city | | 2 | 1 | 10 | U | no city AND kingdom not "forced by trait" |
| check_join_empty_nearby_city | | 2 | 1 | 10 | U | same as above |
| build_civ_city_here | | 2 | 1 | 60 | U adult | is in a civ kingdom AND no city AND no enemy near on the same island |
| try_to_return_to_home_city | | 2 | 3 | 15 | U adult | has city AND not inside own city borders AND not on city's island |
| random_move_near_house | | 0 | 0.3 | 30 | Oth | has a house |
| stay_in_own_home | | 1 | 0.5 | 15 | Civ | has house AND happiness ratio <= 0.5 AND 20% coin |
| generate_loot | | 2 | 1.5 | 60 | Civ | has house |
| try_to_take_city_item | | 2 | 1.5 | 180 | U adult | in own city borders AND city stock has any item |
| make_items | | 2 | 0.4 | 90 | U adult | has house, in own borders, city has resources for new items |
| city_idle_walking | | 1 | 0.5 | 5 | U | city has claimed zones (note: reads actor.city without null check; only granted when actor has a city) |
| store_resources | | 3 | 3.1 | 5 | U | actor is carrying resources AND city has a storage building AND (not a warrior OR inside own borders) |
| find_city_job | | 3 | custom: 2; 1 if hungry; 0.3 if starving | 50 | U | has city AND on city's island AND city has any job slots AND actor can work AND (city adult+child population <= 30 OR actor not a warrior) |
| claim_land | | 2 | custom: 2 + stewardship/5*0.1 | 60 | U CDF | has city AND city can still grow zones |
| give_tax | | 3 | 2.55 | 90 | U CDF | in own city borders AND carried loot >= kingdom's minimum loot |
| check_city_destroyed | | 2 | 0.5 | 10 | Civ | no city AND profession exists AND profession is cancelled when no city |
| find_house | | 2 | 0.5 | 10 | U | no house |

### 2.8 Kings, leaders, warriors
| id | L | W | CD | flags | launch |
|---|---|---|---|---|---|
| king_check_new_city_foundation | 2 | 3 | 60 | U adult | world law "kingdom expansion" is on AND kingdom has no enemies |
| king_change_kingdom_language / _culture / _religion | 2 | 1 | 10 | U | actor has that meta-object AND kingdom's current one differs from the actor's |
| leader_change_city_language / _culture / _religion | 2 | 1 | 10 | U | has city, has that meta-object, city's differs |
| warrior_try_join_army_group | 3 | 3 | 5 | U | has city AND not in an army |
| check_warrior_limit | 2 | 0.7 | 60 | U | has city AND in own borders |
| city_walking_to_danger_zone | 3 | 2.7 | 5 | U | has city, city is in danger, in own borders |
| warrior_army_captain_idle_walking_city | 2 | 1.3 | 20 | U | has city, is army captain (group leader), city has NO attack-zone order |
| warrior_army_captain_waiting | 2 | 1.5 | 20 | U | same as above |
| warrior_army_leader_move_random | 2 | 1.5 | 1 | U | has city AND is army leader |
| warrior_army_leader_move_to_attack_target | 3 | 2 | 1 | U | has city, is army leader, city has attack-zone order |
| warrior_army_follow_leader | 3 | 2 | 1 | U | has city, is a rank-and-file army member, army has a captain, same island as captain, city has attack-zone order |
| warrior_random_move | 1 | 1.6 | 4 | U | has city, is army member, and (army has no captain OR captain is on another island) |
| check_warrior_transport | 2 | 2 | 6 | U | |
| warrior_train_with_dummy | 2 | 1.1 | 100 | U | has city, in own borders, city not in danger, city has a training-dummy building |

### 2.9 Boats and bees (species-granted, all unique)
| id | L | W | CD |
|---|---|---|---|
| boat_check_existence | 1 | 1 | 5 |
| boat_danger_check | 1 | 1.25 | 5 |
| boat_idle | 1 | 0.75 | 5 |
| boat_check_limits | 1 | 1 | 15 |
| boat_fishing | 1 | 1.3 | 1 |
| boat_trading | 1 | 1.3 | 1 |
| boat_transport_check | 2 | 1.3 | 1 |
| pollinate (launch: not a bee, or bee has a home building) | 1 | 1.3 | 10 |
| bee_find_hive (mob only; not civ; has no home building) | 2 | 1.5 | 20 |
| bee_create_hive (mob only; no home building; is female; CDF) | 2 | 1.5 | 200 |

Boats receive no shared lists (section 1.3), so only these compete for them.

---

## 3. Task machinery (AI runner)

### 3.1 Vocabulary
- **Action** ("behaviour"): one atomic step, returns a BehResult.
- **Task**: an ordered list of actions plus flags (3.5). A task may also have a *verifier* action, run every tick (3.4).
- **Job**: an ordered list of task ids (optionally with per-entry conditions), optionally "random". A job is the actor's standing routine; a task is the current step; an action is the current micro-step.
- **Decision**: chooses a task directly (section 1), temporarily overriding the job's flow.

### 3.2 Per-actor AI state
job (or none), task_index (position in the job), current task (or none), action_index, restarts counter (counts RestartTask results; informational), a one-slot "scheduled task id", a shuffled order array for random jobs, and optional list of "single actions" (periodic one-shot tasks; only city AI uses it for actors' purposes - actors have none).

### 3.3 Runner (executes one action step per call)
Called once per actor per tick, but only when the per-tick gating in 3.4 lets it through.
1. If no current task: **pick next task** (3.3.1). If still none, return.
2. If action_index >= number of actions in the task: the task is finished: current task cleared, action_index = -1. Return (next tick picks a new task).
3. Run the action at action_index. The action base class first applies declarative "error checks" (see 3.6); if an error is found the result is **Stop** without running the action. Otherwise it runs the action.
4. If the action replaced the task meanwhile (task is now none), do nothing more.
5. Apply the result:

| BehResult | meaning / effect |
|---|---|
| Continue | advance to the next action next tick (action_index + 1) |
| Stop | end the task now (current task cleared; the job is untouched, so the next task in the job is picked next tick) |
| RepeatStep | stay on the same action; it is executed again next tick |
| Skip | do nothing this tick (the action has itself switched the task or otherwise wants no index change); index unchanged |
| StepBack | action_index - 1 (floored at 0), so the previous action runs again |
| RestartTask | action_index = 0 and restarts + 1 (re-runs the whole task) |
| ActiveTaskReturn | treated exactly like Skip (no state change) - reserved for "active" tasks |
| ImmediateRun | immediately run the runner again in the same tick (no index change; used after switching tasks so the new task's first action runs without a tick delay) |

Helper conventions: "force task" = set another task (default: cleaning movement state) and return Skip; "force task immediate" = same but return ImmediateRun. "Set next task" action = force task (clean flag and "force first action now" flag are per-use arguments).

#### 3.3.1 Picking the next task (when no task is active)
1. If a **scheduled task** id is stored: start it (clearing movement state), clear the slot, done. (Used for "investigate curiosity" and "run away" interrupts; the scheduled tile target for curiosity is stored on the actor.)
2. If no job: ask the actor for its default job (3.7) and set it (task_index = 0).
3. If task_index >= number of entries in the job: wrap to 0.
4. Take the entry at task_index and increment it. For a *random* job, the entries are visited in a shuffled order. IMPORTANT quirk: the shuffle is generated only when task_index is 0 and the stored shuffle array's length differs from the entry count, i.e. effectively ONCE per actor per list size; later loops reuse the same order. (A faithful port may reshuffle every cycle; the observable difference is small, but note it.)
5. If the entry has conditions: all must return their expected boolean (each condition is a check on the actor with an expected true/false); if all pass start the task, otherwise start the task "nothing" (an empty task that ends next tick, which advances to the next entry).
6. Starting a task: clean flag (default true) runs the clear-behaviour hook (section 1.6 text); action_index = 0, restarts = 0; optionally runs the first action's index immediately; fires "task switched" listeners (sprite refresh).

### 3.4 Per-tick gating around the runner (actor update chain, in order)
After timers/hunger/dead-check/tile effects, for each actor each tick:
1. If frozen or unconscious: stop (nothing else this tick).
2. **Action wait**: if the action timer (set by wait actions or by `makeWait`) is >= 0, stop. The timer is decreased by elapsed simulated time every tick, so AI proceeds once it is below 0. (A wait of 0 still costs about one tick.)
3. If under external force (being thrown, etc.) or in the air/falling for species that update height: skip behaviour (below steps) this tick.
4. **Current attack target check**: if the task ignores fights, skip; if the actor has an attack target, may drop it (target dead; civ-vs-civ should stop; target unconscious and not foe; target too far: > 20 distance if the target is running away, > 50 otherwise), otherwise try to attack / hold position; if it did something, skip behaviour.
5. **Find enemy target** (this step is run for the whole actor batch only on a thinned schedule: after each run it is skipped for a random 0-5 ticks; and each actual search per actor also arms a 0.1 to 1.1 s timeout): if the actor can fight and has an attack target but its task is not a combat task, set task "fighting" and CLEAR THE JOB (the job restarts from a fresh default pick afterwards); otherwise search for a target (see combat spec); if one is found, stop movement, start "fighting" (job cleared), skip behaviour. Aggression memory (recently-aggressing actors) is used as a fallback within 30 distance.
6. **Task verifier**: if the current task has a verifier and it returns Stop: cancel all behaviour (end job, clear task, clear movement/targets), skip. Otherwise, if the actor is currently moving along a path, skip (the AI does not advance while the actor walks; the next action runs after arrival).
7. If following a computed path: advance the path one step; skip.
8. The queued **decision** (section 1.6) runs if this actor was queued by "make_decision" (it fires one tick after the task requested it).
9. Natural-death check, only when action_index == 0 (run on a thinned schedule: after each run it is skipped for a random 0-20 ticks).
10. **AI runner** (3.3). Actors whose species has no AI system, or that are possessed, are never run.

Net cadence: an actor takes at most one action step per tick, and only when it is neither waiting nor walking. Decisions therefore happen when the job reaches the "make_decision" task, i.e. after the previous task completes, not on a fixed timer (see 7.5).

### 3.5 Task flags
speed_multiplier (scales walk speed while the task is active; 2 for fleeing, 0.8 for army leaders), ignore_fight_check (target-dropping step in 3.4 is skipped; task is not interrupted by combat check), in_combat (task counts as combat; prevents re-entering "fighting"), move_from_block, diet (an eating task; the periodic hunger status will not re-trigger city-food eating while a diet task is running), flag_boat_related (actor is already in a boat-transport flow; boat loading will not grab it again), cancellable_by_socialize / cancellable_by_reproduction (idle-type tasks that may be interrupted when another actor wants to talk to / breed with this one; an actor whose task lacks the flag is not 'ready to talk' / the breeding partner is not interrupted; the interrupter forces the partner into the reproduction task with its job cleared), force_hand_tool (an item shown in the hand while doing the task), icon, locale key, single_interval (unused for actors).

### 3.6 Action error checks (declarative preconditions; any failure = Stop)
Common to every actor action: actor's current tile must have a region and island. Optional per-action requirements: city present and alive; tile target set; actor target set and alive; building target set and alive (or "usable" for some). Individual actions can add their own errors (section 5).

### 3.7 Default job selection (when an actor has no job)
- egg: job "egg" (wait 1-10 s then end the job; loops).
- sapient and baby: one of species' baby jobs (default "decision").
- sapient with a city: warriors use species attacker job list (default "attacker"); others use citizen job list (default "unit_citizen").
- sapient in a civ kingdom but no city: kingdom job list (default "decision").
- otherwise (including animals): the species' own job list (random member if several); if empty, none (the actor idles).
Species-specific jobs override these (e.g. crab, dragon, ufo, ant, worm, skeleton; section 6.1).

---

## 4. Actor task library (every task id and its ordered actions)

Notation: `A > B > C` = actions executed in that order (each takes at least one AI tick; see 3.4). `[ ... ] x N` = the bracketed group is repeated N times back to back. `RandomWait(a-b)` = action wait uniform in [a, b] seconds; `Wait(t)` = exact wait. `StayInBuildingTarget(a, b)` = hidden inside the building for a random a..b s. Action ids are described one by one in section 5. Task flags column: S = interruptible by socialize requests, R = interruptible by breeding requests, F = ignores the combat target check (not dropped/interrupted by it), C = combat task, D = eating task, B = boat-transport flow task, M = "move away from block" task; `speed xN` = walk speed multiplier; `tool:` = item shown in hand.
`DELIVER_RESOURCES` expands to: CheckHasResources (Stop if nothing carried) > RandomWait(0.7-1.2) > CityActorFindStorage (nearest usable storage on the island; the "wheat storage" variant prefers a windmill on the island, else any food storage) > FindRaycastTileForBuildingTarget (stand-off tile along the line to the storage, within the actor's throw distance, same island) > GoToTileTarget > LookAtBuildingTarget > AngleAnimation(Building, wait 0.1) > ThrowResources (moves ONE carried item per execution into the stockpile, adds the item's loot value to actor loot, 0.2 s wait; returns StepBack while items remain, so it loops until the inventory is empty) > RandomWait(0-0.2).
`SetNextTask(x, clean, force)` replaces the running task with x (Skip result).
"-" in the flags column = none; "(none)" = task with no actions ends on the very next tick.

Tasks are initialised in groups (mobs, socializing, subspecies traits, reproduction, children, status, kings, leaders, warriors, sleep, poop, thinking/happiness, clan, boats, dragons, fingers, UFOs, then "nothing" and "fighting"); the grouping has no behavioural meaning.

| task id | flags | ordered actions |
|---|---|---|
| nothing | SR | (none: ends immediately) |
| fighting | C | FightCheckEnemyIsOk > GoToActorTarget(SameTile, water, attackable-check) > RestartTask |
| move_from_block | MF | MoveAwayFromBlock > GoToTileTarget [water, blocks] |
| swim_to_island | F | GoToStablePlace > GoOrSwimToTileTarget |
| move_to_water | F | GoToStablePlace > GoOrSwimToTileTarget |
| check_if_stuck_on_small_land | F | CheckIfOnSmallLand > WalkIntoWaterCorner > GoOrSwimToTileTarget |
| pollinate | - | BeeCheckHome > FindBuilding(type_flower) > GetTargetBuildingMainTile > GoToTileTarget > RandomWait(1-3) > Pollinate > BeeCheckReturnHome > GetTargetBuildingMainTile > GoToTileTarget > BeeReturnHome |
| bee_find_hive | - | BeeCheckNoHome > FindBuilding(type_hive) > GetTargetBuildingMainTile > GoToTileTarget > BeeJoinHive > BeeReturnHome |
| bee_create_hive | - | BeeCheckNoHome > FindTile(Biome) > GoToTileTarget > [AngleAnimation(Tile, wait 0.5)] x5 > BeeCreateHive > BeeJoinHive > BeeReturnHome |
| random_move | - | FindRandomTile > GoToTileTarget > RandomWait(0-1) |
| random_fun_move | - | [FindRandomNeighbourTile > GoToTileTarget > RandomWait(0-0.01)] x6 |
| run_away | F speed x2 | FindRandomFarTile > GoToTileTarget > RandomWait(0-1) |
| run_away_from_carnivore | F speed x2 | FindRandomFarTile > GoToTileTarget > RandomWait(0-1) |
| print_start | - | PrinterSetup |
| print_step | - | PrinterStep |
| worm_move | - | FindRandomTile8Directions > WormDive > GoToTileTarget [water, blocks] > WormDig |
| sandspider_move | - | FindRandomTile4Directions > SandspiderCheckSand > SandspiderCheckDie > GoToTileTarget [water, blocks] > SandspiderBuildSand |
| ant_black_island | - | FindRandomTile4Directions > GoToTileTarget [water, blocks] > BlackAntBuildIsland |
| ant_black_sand | - | FindRandomTile4Directions > GoToTileTarget [water, blocks] > BlackAntBuildSand |
| ant_red_move | - | AntSetup > FindRandomTile4Directions > GoToTileTarget [water, blocks] > AntSwitchGround |
| ant_blue_move | - | FindRandomTile4Directions > GoToTileTarget [water, blocks] > BlueAntSwitchGround |
| ant_green_move | - | FindRandomTile4Directions > GoToTileTarget [water, blocks] > GreenAntSwitchGround |
| random_wait_short_1 | SR | RandomWait(0-0.1) |
| investigate_curiosity | SR | CheckCuriosityTile > GoToTileTarget > RandomWait(1-3) > ActorReverseFlip > RandomWait(1-3) > FindRandomNeighbourTile > GoToTileTarget > RandomWait(1-3) > ActorReverseFlip > RandomWait(1-2) |
| random_animal_move | SR | AnimalFindTile > GoToTileTarget > RandomWait(3-6) |
| random_move_towards_civ_building | SR | FindRandomCivBuildingTile > GoToTileTarget > RandomWait(1-4) |
| stay_in_random_house | SR | CityActorFindBuilding(random_house_building) > GetTargetBuildingMainTile > GoToTileTarget > StayInBuildingTarget(10, 60) > ExitBuilding |
| stay_in_own_home | SR | BuildingTargetHome > GetTargetBuildingMainTile > GoToTileTarget > StayInBuildingTarget(10, 60) > ExitBuilding |
| generate_loot | SR | BuildingTargetHome > GetTargetBuildingMainTile > GoToTileTarget > StayInBuildingTarget(2, 6) > GenerateLootFromHouse > ExitBuilding |
| random_swim | - | RandomSwim > RandomWait(0-2) |
| make_decision | - | MakeDecision |
| try_new_plot | - | TryNewPlot |
| check_plot | - | CheckPlot |
| progress_plot | - tool:coffee_cup | CheckPlotIsOk > ActorReverseFlip > Wait(2) > CheckPlotProgress > SpawnPlotProgressEffect > CheckNeeds(0) > RestartTask |
| try_to_eat_city_food | D | CheckHasMoneyForCityFood > FindRandomTile > GoToTileTarget > RandomWait(0-0.1) > [AngleAnimation(Tile, wait 0.2)] x3 > TryToEatCityFood > [AngleAnimation(Tile, wait 0.2)] x3 > RandomWait(1-5) |
| find_house | - | FindHouse |
| random_move_near_house | SR | FindRandomFrontTileNearHouse > GoToTileTarget > RandomWait(1-6) |
| end_job | - | EndJob |
| check_end_job | - | CheckEndCityActorJob |
| check_city_destroyed | - | CheckCityDestroyed |
| build_civ_city_here | - | CheckBuildCity > EndJob |
| try_to_start_new_civilization | - | CheckEnemyNotNear > CheckStartCivilization |
| check_join_city | - | JoinCity > EndJob |
| check_join_empty_nearby_city | - | FindNearbyPotentialCivCityToJoin |
| try_to_read | RS tool:book | TryToRead > [FindRandomNeighbourTile > GoToTileTarget > SpawnHmmEffect > [AngleAnimation(Nothing, wait 1)] x5 > ActorReverseFlip > [AngleAnimation(Nothing, wait 1)] x5] x7 > FinishReading |
| citizen | - | RandomWait(1-5) > FindRandomTile > GoToTileTarget |
| try_to_take_city_item | - | ActorTryToTakeItemFromCity |
| city_idle_walking | SR | CityActorGetRandomIdleTile > GoToTileTarget > RandomWait(3-6) |
| city_walking_to_danger_zone | - | CityActorGetRandomDangerZone > GoToTileTarget > RandomWait(3-6) |
| find_city_job | - | CityActorFindNewJob |
| give_tax | - | ActorGiveTax |
| do_hunting | RCF | FindTargetForHunter > GoToActorTarget(SameTile, attackable-check) > AttackActorHuntingTarget > DELIVER_RESOURCES |
| make_items | - | BuildingTargetHome > GetTargetBuildingMainTile > GoToTileTarget > StayInBuildingTarget(10, 15) > MakeItem > ActorTryToTakeItemFromCity > ExitBuilding |
| cleaning | SR tool:hammer | CityActorFindBuilding(ruins) > GetTargetBuildingMainTile > GoToTileTarget > RandomWait(0.3-0.3) > LookAtBuildingTarget > [AngleAnimation(Ruin, wait 1)] x3 > AngleAnimation(Ruin, wait 0) > RemoveRuins > DELIVER_RESOURCES |
| manure_cleaning | R tool:basket | CityActorFindBuilding(type_poop) > GetTargetBuildingMainTile > GoToTileTarget > LookAtBuildingTarget > [ResourceGatheringAnimation(wait 1)] x5 > ExtractResourcesFromBuilding > DELIVER_RESOURCES > CheckNeeds(6) > RestartTask |
| put_out_fire | - tool:bucket | CityActorFindFireZone > GoToTileTarget > CityActorFindClosestFire > GoToTileTarget > JumpingAnimation(1, 1) > CityActorRemoveFire > RandomWait(1-2) |
| try_build_building | - tool:hammer | CityActorFindBuilding(new_building) > SetNextTask(build_building, false, true) |
| build_building | - tool:hammer | CheckStillUnderConstruction > FindConstructionTile > GoToTileTarget > [CheckStillUnderConstruction > LookAtBuildingTarget > AngleAnimation(Building, wait 0) > BuildTarget] x5 > RestartTask |
| build_road | - tool:hammer | FindTile(NewRoad) > GoToTileTarget > RandomWait(0-0.2) > [AngleAnimation(Tile, wait 1)] x3 > AngleAnimation(Tile, wait 0) > CityActorCreateRoad > RandomWait(1-2) > CheckNeeds(10) > RestartTask |
| collect_fruits | R tool:basket | CityActorFindBuilding(type_fruits) > GetTargetBuildingMainTile > GoToTileTarget > LookAtBuildingTarget > [ResourceGatheringAnimation(wait 1)] x4 > ResourceGatheringAnimation(wait 0) > ExtractResourcesFromBuilding > DELIVER_RESOURCES > CheckNeeds(5) > RestartTask |
| collect_honey | R tool:basket | CityActorFindBuilding(type_hive) > GetTargetBuildingMainTile > GoToTileTarget > LookAtBuildingTarget > [ResourceGatheringAnimation(wait 1)] x4 > ResourceGatheringAnimation(wait 0) > ExtractResourcesFromBuilding > DELIVER_RESOURCES > CheckNeeds(3) > RestartTask |
| claim_land | R tool:flag | ActorCheckZoneTarget > GoToTileTarget > [ActorReverseFlip > JumpingAnimation(0.5, 0.5) > SpawnCityBorderEffect] x21 > ClaimZoneForCityActorBorder > SpawnCityBorderEffect(5) > EndJob |
| collect_herbs | R tool:basket | CityActorFindBuilding(type_vegetation) > GetTargetBuildingMainTile > GoToTileTarget > LookAtBuildingTarget > [ResourceGatheringAnimation(wait 1)] x4 > ResourceGatheringAnimation(wait 0) > ExtractResourcesFromBuilding > DELIVER_RESOURCES > CheckNeeds(4) > RestartTask |
| chop_trees | R tool:axe | CityActorFindBuilding(type_tree) > GetTargetBuildingMainTile > GoToTileTarget > LookAtBuildingTarget > [ResourceGatheringAnimation(wait 1)] x7 > ResourceGatheringAnimation(wait 0) > ExtractResourcesFromBuilding > DELIVER_RESOURCES |
| mine_deposit | R tool:pickaxe | CityActorFindBuilding(type_mineral) > GetTargetBuildingMainTile > GoToTileTarget > LookAtBuildingTarget > [ResourceGatheringAnimation(wait 1)] x6 > ResourceGatheringAnimation(wait 0) > ExtractResourcesFromBuilding > DELIVER_RESOURCES > CheckNeeds(3) > RestartTask |
| farmer_make_field | R tool:hoe | FindTileForFarm > GoToTileTarget > [AngleAnimation(Tile, wait 1)] x6 > MakeFarm > RandomWait(1-2) |
| farmer_plant_crops | R tool:hoe | FindFarmField > GoToTileTarget > [AngleAnimation(Tile, wait 1)] x4 > PlantCrops > RandomWait(1-2) > CheckNeeds(6) > RestartTask |
| farmer_harvest | - tool:hoe | FindWheat > GoToBuildingTarget > [ResourceGatheringAnimation(wait 1)] x3 > ResourceGatheringAnimation(wait 0) > ExtractResourcesFromBuilding > DELIVER_RESOURCES(wheat storage) > CheckNeeds(6) > RestartTask |
| farmer_fertilize_crops | R tool:bucket | CityActorFindStorage > GoToBuildingTarget > AngleAnimation(Building, wait 1) > CityActorGetResourceFromStorage(fertilizer, 5) > [CityActorFindUngrownCrop > GoToBuildingTarget > AngleAnimation(Building, wait 0) > ThrowResourceAnimation(fertilizer) > Wait > CityActorFertilizeCrop] x5 > DELIVER_RESOURCES > RandomWait(1-2) > CheckNeeds(6) > RestartTask |
| farmer_random_move | - tool:hoe | FindRandomFarmTile > GoToTileTarget > RandomWait(1-3) |
| store_resources | - | DELIVER_RESOURCES |
| mine | - tool:pickaxe | CityActorFindBuilding(type_mine) > GoToBuildingTarget > StayInBuildingTarget(10, 15) > GetResourcesFromMine > ExitBuilding > FindRandomTile > GoToTileTarget > RandomWait(1-2) > CheckNeeds(3) > RestartTask |
| try_to_return_to_home_city | B | TaxiCheck > RandomWait(0-1) > TaxiFindShipTile > GoToTileTarget > TaxiEmbark |
| force_into_a_boat | B | TaxiFindShipTile > GoToTileTarget > TaxiEmbark |
| embark_into_boat | B | TaxiEmbark |
| sit_inside_boat | B | TaxiSitInside > TaxiSitInside > TaxiSitInside |
| wait | SR | RandomWait(0.5-1.3) |
| wait5 | SR | RandomWait(1-5) |
| wait10 | SR | RandomWait(1-10) |
| replenish_energy | R | FindBuilding(type_well) > GoToBuildingTarget > [AngleAnimation(Building, wait 1)] x5 > ReplenishEnergy |
| repair_equipment | R | CheckCanRepairEquipment > FindBuilding(type_barracks) > GoToBuildingTarget > [AngleAnimation(Building, wait 1)] x5 > RepairEquipment |
| try_to_steal_money | - | FindTargetToStealFrom > GoToActorTarget(NearbyTileClosest) > [AngleAnimation(Actor, wait 0.3)] x2 > StealFromTarget > SetNextTask(run_away) |
| reflection | - | Reflection |
| madness_random_emotion | - | MadnessRandomEmotion |
| happy_laughing | - | TryFindTargetWithStatusNearby(laughing, crying, swearing, singing) > GoToTileTarget > [ActorAddStatus(laughing, 2, false) > [AngleAnimation(Nothing, wait 0.2)] x3 > ActorReverseFlip > Wait(0.3)] x4 > AddHappiness(just_laughed) |
| singing | - | TryFindTargetWithStatusNearby(laughing, crying, swearing, singing) > GoToTileTarget > [JumpingAnimation(0, 5) > ActorAddStatus(singing, 3, false) > [AngleAnimation(Nothing, wait 0.4) > ActorReverseFlip > Wait(0.1)] x3] x5 > AddHappiness(just_sang) > FinishSinging |
| swearing | - | TryFindTargetWithStatusNearby(laughing, crying, swearing, singing) > GoToTileTarget > [ActorAddStatus(swearing, 2, false) > [AngleAnimation(Nothing, wait 0.2)] x3 > ActorReverseFlip > Wait(0.3)] x4 > AddHappiness(just_swore) |
| crying | - | TryFindTargetWithStatusNearby(laughing, crying, swearing, singing) > GoToTileTarget > [ActorAddStatus(crying, 2, false) > [AngleAnimation(Nothing, wait 0.2)] x3 > ActorReverseFlip > Wait(0.3)] x4 > AddHappiness(just_cried) |
| possessed_following | - | TryFindTargetWithStatusNearby(possessed) > CopyAggro > GoToTileTarget > FindRandomNeighbourTile > GoToTileTarget > RandomWait(0.5-2) > RandomSocializeTopic(1.5, 3, 0.1) |
| start_tantrum | - | [ActorReverseFlip > JumpingAnimation(0.1, 0.1)] x6 > ActorAddStatus(tantrum, 60) |
| do_tantrum | - | FindTantrumTarget > GoToActorTarget(RaycastWithAttackRange, attackable-check) > AddAggroForBehTarget |
| punch_a_tree | - | FindBuilding(type_tree) > GoToBuildingTarget > [ResourceGatheringAnimation(wait 1)] x2 > GetDamaged(1, Gravity) > ActorAddStatus(crying, 5, false, true) > RandomWait(1-2) |
| punch_a_building | - | FindBuilding(type_house) > GoToBuildingTarget > [ResourceGatheringAnimation(wait 1)] x2 > GetDamaged(1, Gravity) > ActorAddStatus(crying, 5, false, true) > RandomWait(1-2) |
| start_fire | - | Wait |
| kill_unruly_clan_members | - | ClanChiefCheckMembersToKill |
| banish_unruly_clan_members | - | ClanChiefCheckMembersToBanish |
| try_to_poop | - | DecideWhereToPoop |
| try_to_launch_fireworks | - | TryFindTargetWithStatusNearby(laughing, crying, swearing, singing) > GoToTileTarget > [ActorAddStatus(laughing, 2, false) > [AngleAnimation(Nothing, wait 0.2)] x3 > ActorReverseFlip > Wait(0.3)] x1 > LaunchFireworks > AddHappiness(just_laughed) > FindRandomTile > GoToTileTarget > RandomWait(0-1) |
| poop_inside | - | BuildingTargetHome > GetTargetBuildingMainTile > GoToTileTarget > StayInBuildingTarget(10, 60) > PoopInside > ExitBuilding |
| poop_outside | - | FindTile(FreeTile) > GoToTileTarget > [ActorReverseFlip > JumpingAnimation(0.5, 0.5)] x4 > PoopOutside |
| decide_where_to_sleep | - | DecideWhereToSleep |
| sleep_inside | - | BuildingTargetHome > GetTargetBuildingMainTile > GoToTileTarget > StayInBuildingTarget > TrySleep |
| sleep_outside | - | FindTile(FreeTile) > GoToTileTarget > RandomWait(1-3) > ActorReverseFlip > RandomWait(1-3) > FindRandomNeighbourTile > GoToTileTarget > RandomWait(1-3) > ActorReverseFlip > RandomWait(1-2) > TrySleep(true) |
| king_check_new_city_foundation | - | KingCheckNewCityFoundation |
| king_change_kingdom_language | - | ChangeKingdomLanguage |
| king_change_kingdom_culture | - | ChangeKingdomCulture |
| king_change_kingdom_religion | - | ChangeKingdomReligion |
| warrior_random_move | - | FindRandomTile > GoToTileTarget |
| warrior_army_captain_idle_walking_city | SR | CityActorGetRandomBorderTile > GoToTileTarget > RandomWait(3-6) |
| warrior_army_captain_waiting | SR | CityActorGetRandomBorderTile > GoToTileTarget > RandomWait(10-20) |
| check_warrior_limit | - | CheckCityActorWarriorLimit |
| warrior_try_join_army_group | - | CheckCityActorArmyGroup > RandomWait(1-2) |
| warrior_army_leader_move_random | - speed x0.8 | FindRandomTile > GoToTileTarget > RandomWait(10-20) |
| warrior_army_leader_move_to_attack_target | - speed x0.8 | VERIFIER VerifierAttackZone > CityActorCheckAttack > GoToTileTarget > RandomWait(1-4) |
| warrior_army_follow_leader | - | FindTileNearbyGroupLeader > GoToTileTarget > RandomWait(1-2) |
| check_warrior_transport | B | CityActorWarriorTaxiCheck > RandomWait(1-5) > TaxiFindShipTile > GoToTileTarget > TaxiEmbark |
| warrior_train_with_dummy | - | CityActorFindBuilding(type_training_dummies) > GetTargetBuildingMainTile > GoToTileTarget > LookAtBuildingTarget > [AngleAnimation(Building, wait 0) > ActorAddExperience(0, 2) > RandomWait(0-2) > DealDamageToTargetBuilding(0.05, 0.15)] x10 > ActorTryToAddRandomCombatSkill > RandomWait(3-6) |
| leader_change_city_language | - | ChangeCityActorLanguage |
| leader_change_city_culture | - | ChangeCityActorCulture |
| leader_change_city_religion | - | ChangeCityActorReligion |
| strange_urge_finish | - | [FindRandomNeighbourTile > GoToTileTarget > RandomWait(0.5-5)] x6 |
| status_confused | - | [FindRandomNeighbourTile > GoToTileTarget > RandomWait(0-0.01)] x6 |
| status_soul_harvested | - | StartShake > [ActorReverseFlip > JumpingAnimation(0.1, 0.1)] x12 > CheckSoulBorneReproduction |
| diet_tiles | SRD | FindTileForEating > GoToTileTarget [water, blocks] > [AngleAnimation(Tile, wait 1)] x10 > ConsumeTargetTile > RandomWait(1-2) |
| diet_wood | SRD | FindBuilding(type_tree) > GoToBuildingTarget > [ResourceGatheringAnimation(wait 1)] x4 > ConsumeTargetBuilding > RandomWait(1-2) |
| diet_minerals | SRD | FindBuilding(type_mineral) > GoToBuildingTarget > [ResourceGatheringAnimation(wait 1)] x4 > ConsumeTargetBuilding > RandomWait(1-2) |
| diet_fruits | SRD | FindBuilding(type_fruits) > GoToBuildingTarget > [ResourceGatheringAnimation(wait 1)] x4 > ConsumeTargetBuilding > RandomWait(1-2) |
| diet_vegetation | SRD | FindBuilding(type_vegetation) > GoToBuildingTarget > [ResourceGatheringAnimation(wait 1)] x4 > ConsumeTargetBuilding > RandomWait(1-2) |
| diet_flowers | SRD | FindBuilding(type_flower) > GoToBuildingTarget > [ResourceGatheringAnimation(wait 1)] x4 > ConsumeTargetBuilding > RandomWait(1-2) |
| diet_nectar | SRD | FindBuilding(type_flower) > GoToBuildingTarget > [ResourceGatheringAnimation(wait 1)] x4 > NectarNectarFromFlower > RandomWait(1-2) |
| diet_crops | SRD | FindBuilding(type_crops) > GoToBuildingTarget > [ResourceGatheringAnimation(wait 1)] x4 > ConsumeTargetBuilding > RandomWait(1-2) |
| diet_grass | SRD | FindTile(Grass) > GoToTileTarget > [AngleAnimation(Tile, wait 1)] x4 > ConsumeGrass > RandomWait(1-2) |
| diet_meat | RFD | FindMeatSource > GoToActorTarget(SameTile, attackable-check) > ConsumeActorTarget |
| diet_blood | RFD | FindMeatSource(Meat, false) > GoToActorTarget(SameTile, attackable-check) > ConsumeActorsBloodTarget |
| diet_meat_insect | D | FindMeatInsectSource > GoToActorTarget(SameTile, attackable-check) > ConsumeActorTarget |
| diet_same_species | D | FindMeatSameSpeciesSource(false) > GoToActorTarget(SameTile, attackable-check) > ConsumeActorTarget |
| diet_algae | D | FindTile(Water) > GoOrSwimToTileTarget > [AngleAnimation(Tile, wait 1)] x4 > ReplenishNutrition |
| diet_fish | D | FindTile(Water) > GoOrSwimToTileTarget > [AngleAnimation(Tile, wait 1)] x4 > ReplenishNutrition |
| family_alpha_move | SR | FamilyAlphaMove > GoToTileTarget |
| family_group_follow | SR | FamilyFollowAlpha > GoToActorTarget(SameRegion) |
| family_check_existence | - | FamilyCheckMembers |
| family_group_leave | - | FamilyGroupLeave |
| family_group_join_or_new_herd | - | FamilyGroupJoin > FamilyGroupNew |
| attack_golden_brain | - | FindGoldenBrain > GoToBuildingTarget |
| follow_desire_target | - | FindDesireWaypoint > GoToBuildingTarget |
| crab_eat | D | AnimalCheckHungry > RandomWait(2-5) > FindTileBeach > GoOrSwimToTileTarget > [AngleAnimation(Tile, wait 1)] x4 > ReplenishNutrition |
| crab_danger_check | - | CheckIfOnGround > ActiveCrabDangerCheck |
| crab_burrow | - | CheckIfOnGround > FindRandomTile > GoToTileTarget > CrabBurrow |
| make_skeleton | - | MagicMakeSkeleton > RandomWait(3-3) |
| skeleton_move | - | SkeletonFindTile > GoToTileTarget > RandomWait(3-6) |
| spawn_fertilizer | - | SpawnTreeFertilizer > RandomWait(1-3) |
| check_cure | - | CheckCure > RandomWait(1-3) |
| burn_tumors | - | BurnTumorTiles > RandomWait(1-3) |
| check_heal | - | Heal > RandomWait(1-3) |
| random_teleport | - | RandomTeleport > RandomWait(0-0.5) |
| teleport_back_home | - | TeleportHome > RandomWait(0-0.5) |
| run_to_water_when_on_fire | - | ShortRandomMove > GoToTileTarget > ShortRandomMove > GoToTileTarget > ShortRandomMove > GoToTileTarget > FindTileWhenOnFire > GoOrSwimToTileTarget |
| short_move | S | ShortRandomMove > GoToTileTarget |
| godfinger_find_target | - | FingerSetFlying(true) > FingerFindTarget > FingerGoTowardsTileTarget(5) > FingerSetFlying(true, 2) > GoToTileTarget > SetNextTask(godfinger_draw) |
| godfinger_draw | - | FingerCheckCanDraw > FingerSetFlying(false) > FingerFindCloseTile > FingerWaitForFlying > FingerDrawToTileTarget > SetNextTask(godfinger_find_target) |
| godfinger_move | - | FingerSetFlying(true) > RandomWait(0.1-0.4) > FingerFindRandomTile > FingerGoTowardsTileTarget |
| godfinger_random_fun_move | - | FingerSetFlying(true) > [FingerFindRandomTile(5) > FingerGoTowardsTileTarget(5) > RandomWait(0-0.01)] x6 |
| godfinger_circle_move | - | FingerSetFlying(true) > RandomWait(0.1-0.4) > FingerGoToCircleTarget(25, 75) |
| godfinger_circle_move_small | - | FingerSetFlying(true) > RandomWait(0.1-0.4) > FingerGoToCircleTarget(5, 15) |
| godfinger_circle_move_big | - | FingerSetFlying(true) > RandomWait(0.1-0.4) > FingerGoToCircleTarget(75, 150) |
| dragon_fly | - | DragonSetAnimation(Fly, true, false) > ActorSetFlying(true) > DragonSleepy > DragonCheckAttackTargetAlive > DragonZombieFindGoldenBrain > DragonCheckAttackTile > DragonCheckAttackCity > DragonFindRandomTile > GoToTileTarget > RepeatTaskChance(0.7) |
| dragon_sleep | - | DragonSetAnimation(SleepStart, false) > ActorSetFlip(false) > ActorSetFlying(false) > DragonFinishAnimation > DragonSetAnimation(SleepLoop) > DragonSleep > DragonFinishAnimation > SetNextTask(dragon_wakeup) |
| dragon_wakeup | - | DragonSetAnimation(SleepUp, false) > ActorSetFlip(false) > DragonFinishAnimation |
| dragon_slide | - | DragonSetAnimation(Slide, false) > ActorSetFlying(true) > DragonSleepy > ActorAddStatus(invincible, 2) > ActorSetBool(justSlid, true) > DragonSlide |
| dragon_land | - | DragonSetAnimation(Landing, false) > DragonSleepy > DragonCheckAttackTargetAlive > DragonCheckOverTargetCity > DragonFinishAnimation > ActorSetFlying(false) > DragonCantLand(dragon_up) > DragonLanded > DragonCheckOverTargetActor > DragonCheckOverTargetCity > ActorSetInt(justLanded, 2) |
| dragon_land_attack | - | DragonSetAnimation(LandAttack, false) > DragonSleepy > ActorSetFlying(false) > DragonLandAttack |
| dragon_up | - | DragonSetAnimation(Up, false) > DragonFlyUp > DragonSleepy > ActorSetFlying(true) > DragonFinishAnimation > ActorSetBool(justUp, true) > ActorCheckBool(justGotHit, dragon_fly) |
| dragon_idle | - | DragonSetAnimation(Idle) > ActorSetFlying(false) > DragonIdle > DragonFinishAnimation |
| ufo_idle | - | SetActorSpeed(20) > UFOBeam > UFOCheckExplore |
| ufo_hit | - | UFOSelectTarget |
| ufo_flee | - | SetActorSpeed(100) > UFOBeam > GetRandomZoneTile > GoToTileTarget |
| ufo_fly | - | SetActorSpeed(20) > UFOBeam > UFOFindTarget > GoToTileTarget > UFOCheckAttackCity > UFOExplore |
| ufo_explore | - | SetActorSpeed(10) > UFOBeam > GetRandomZoneTile > GoToTileTarget > UFOCheckExplore |
| ufo_chase | - | SetActorSpeed(50) > GoToTileTarget > SetNextTask(ufo_attack) |
| ufo_attack | - | UFOBeam(true) |
| boat_check_existence | - | BoatCheckExistence |
| boat_check_limits | - | BoatCheckLimit > BoatCheckHomeDocks > BoatSetHomeDockTarget > BoatFindTileInDock > GoToTileTarget > RandomWait(0-3) > StayInBuildingTarget(2, 4) > BoatRemoveIfLimit > ExitBuilding |
| boat_idle | - | BoatDamageCheck > BoatFindOceanNeutralTile > GoToTileTarget > RandomWait(3-10) |
| boat_danger_check | - | CheckIfInLiquid > BoatDangerCheck > BoatFindWaterTile > GoToTileTarget > RandomWait(3-10) |
| boat_transport_check | - | RandomWait(0-1) > BoatTransportCheck |
| boat_transport_check_taxi | - | BoatFindRequest |
| boat_transport_go_load | - | BoatTransportFindTilePickUp > GoToTileTarget > RandomWait(0-1) > BoatTransportDoLoading > SetNextTask(boat_transport_go_unload, false) |
| boat_transport_go_unload | - | RandomWait(0-1) > BoatTransportFindTileUnload > GoToTileTarget [water] > RandomWait(0-1) > BoatTransportUnloadUnits > RandomWait(3-10) > EndJob |
| boat_trading | - | BoatCheckHomeDocks > BoatFindTargetForTrade > BoatFindTileInDock > GoToTileTarget > StayInBuildingTarget(2, 5) > BoatMakeTrade > ExitBuilding > SetNextTask(boat_return_to_dock) |
| boat_fishing | - | BoatCheckHomeDocks > BoatFindWaterTile > GoToTileTarget > RandomWait(0-1) > BoatFishing > RandomWait(5-10) > BoatCollectFish > RandomWait(1-2) > BoatCheckFishingRepeat |
| boat_return_to_dock | - | BoatCheckHomeDocks > BoatSetHomeDockTarget > BoatFindTileInDock > GoToTileTarget > RandomWait(0-3) > StayInBuildingTarget(2, 4) > UnloadResources > RepairInDock > ExitBuilding > EndJob |
| asexual_reproduction_budding | - | [StartShake(0.1, 0.1) > ActorReverseFlip] x4 > CheckReproductionBasics > CheckBuddingReproduction |
| asexual_reproduction_divine | - | [StartShake(0.1, 0.1) > ActorReverseFlip] x4 > CheckReproductionBasics > CheckDivineReproduction |
| asexual_reproduction_spores | - | StartShake > [ActorReverseFlip > JumpingAnimation(0.1, 0.1)] x4 > CheckReproductionBasics > CheckSporeReproduction |
| asexual_reproduction_fission | - | [StartShake(0.1, 0.1) > ActorReverseFlip] x4 > CheckReproductionBasics > CheckFissionReproduction |
| asexual_reproduction_vegetative | - | [StartShake(0.1, 0.1) > ActorReverseFlip] x4 > CheckReproductionBasics > FindTile(Dirt) > GoToTileTarget > CheckVegetativeReproduction |
| asexual_reproduction_parthenogenesis | - | [StartShake(0.1, 0.1) > ActorReverseFlip] x4 > CheckReproductionBasics > CheckParthenogenesisReproduction |
| check_lover_city | - | CheckSameCityActorLover |
| find_lover | - | FindLover |
| sexual_reproduction_try | - | CheckReproductionBasics > SexualReproductionTry |
| sexual_reproduction_check_outside | - | CheckSexualReproductionOutside |
| sexual_reproduction_inside | - | CheckSexualReproductionCiv |
| sexual_reproduction_outside | - | GoToActorTarget(SameTile) > RandomWait(0-0.5) > AnimalBreedingTime > RandomWait(0-0.5) > AnimalBreedingTime > RandomWait(0-0.5) > AnimalBreedingTime > RandomWait(0-0.5) > CheckForBabiesFromSexualReproduction > RandomWait(1-3) |
| sexual_reproduction_civ_go | - | BuildingTargetLoverHome > GetTargetBuildingMainTile > GoToTileTarget > [RandomWait(1-2) > CheckForLover > RandomWait(1-2)] x6 |
| sexual_reproduction_civ_action | - | [StayInBuildingTarget(1, 2) > ShakeBuilding > SpawnHeartsFromBuilding] x5 > CheckForBabiesFromSexualReproduction > ExitBuilding |
| sexual_reproduction_civ_wait | - | [StayInBuildingTarget(1, 2)] x5 > ExitBuilding |
| child_random_flips | S | [ActorReverseFlip > JumpingAnimation(0.2, 0.2)] x4 > ActorChangeHappiness(just_played) |
| child_play_at_one_spot | S | ActorReverseFlip > JumpingAnimation(1.5, 1.5) > ActorReverseFlip > ActorChangeHappiness(just_played) |
| child_random_jump | S | [ActorReverseFlip > JumpingAnimation(1.5, 1.5)] x2 > ActorRandomJump > RandomWait(1-3) > ActorChangeHappiness(just_played) |
| child_follow_parent | S | ChildFindRandomFamilyParent > GoToActorTarget(SameRegion) > RepeatTaskChance(0.1) |
| try_affect_dreams | - | FindTile(FreeTile) > GoToTileTarget > [ActorReverseFlip > JumpingAnimation(0.5, 0.5)] x4 > AffectDreams |
| socialize_initial_check | - | SocializeStartCheck |
| socialize_try_to_start_near_bonfire | - | CityActorFindBuilding(type_bonfire) > FindRandomTileNearBuildingTarget > GoToTileTarget > TryToSocialize |
| socialize_try_to_start_immediate | - | TryToSocialize |
| socialize_go_to_target | - | GoToActorTarget(NearbyTileClosest) > CheckNearActorTarget > SetNextTask(socialize_do_talk, false) |
| socialize_do_talk | - | DoTalk > FinishTalk > RandomWait(1-2) |
| socialize_receiving | - | SocializeTalk |

Task-library notes:
- Every decision id (or its task id, section 2) is a task id in this table. Tasks that no decision points at are entered another way: via jobs (section 6: put_out_fire, chop_trees, farmer_*, godfinger_*, dragon_*, ufo_*, ant/worm/sandspider moves, print_*, crab_*, skeleton_move, end_job, check_end_job, check_city_destroyed, citizen, do_hunting, build_*), as scheduled interrupts (investigate_curiosity, run_away), via SetNextTask chains or force-task calls (progress_plot, sleep_inside/outside, poop_inside/outside, sexual_reproduction_*, socialize_*, happy_laughing, singing, crying, swearing, start_tantrum, punch_a_*, boat_transport_*, boat_return_to_dock), or by other systems calling set-task directly (fighting, move_from_block, force_into_a_boat, embark_into_boat, sit_inside_boat, short_move, strange_urge_finish, ufo_hit/ufo_flee, wait, random_wait_short_1). random_animal_move, stay_in_random_house and start_fire (a bare 1 s wait) are defined but no entry point was found in the files read - unclear.
- Chains created by SetNextTask / force-task: try_build_building -> build_building; try_to_steal_money -> run_away; socialize_go_to_target -> socialize_do_talk; godfinger_find_target <-> godfinger_draw; dragon_sleep -> dragon_wakeup; ufo_chase -> ufo_attack; boat_transport_go_load -> boat_transport_go_unload; boat_trading -> boat_return_to_dock.
- Tasks that loop by RestartTask until CheckNeeds' restart cap (so "bounded gather loops"): manure_cleaning 6, collect_fruits 5, collect_herbs 4, collect_honey 3, mine_deposit 3, mine 3, build_road 10, farmer_plant_crops 6, farmer_harvest 6, farmer_fertilize_crops 6; progress_plot cap 0 (= unbounded, runs until the plot fails/finishes). build_building and fighting loop until their check action Stops them.
- Social/emote tasks (happy_laughing, singing, swearing, crying, try_to_launch_fireworks) first look for a nearby actor already showing one of those emotions and walk next to it (emotional contagion), else a free tile in the chunk.

---

## 5. Action classes grouped by purpose

Every action returns Continue unless stated. "Stop" ends the current task (job unaffected). "Needs X" = the generic precondition check (3.6) stops the task first if X is missing. Action names are ids; parameters are in parentheses. Distances: "chunk" = 16x16 tiles; "N-chunk neighbourhood" = the (2N+1)x(2N+1) block of chunks around the actor. "Region" = a small pathfinding cell of connected same-type tiles; "island" = a large connected area of same-layer (ground / ocean / lava / block) tiles; "zone" = a city-claim cell.

Base preconditions used by families of actions: city actions (CityActor*) need a living city; building-target actions need a living building target (some need it "usable" = finished and not destroyed); tile-target actions need a tile target; actor-target actions need a living actor target. All actions need the actor to be on a tile whose region/island is known.


### 5.1 Task flow and control

- **ActorCheckBool(flag,task)** - if the actor's data flag is set: clear it and force-switch to the named task (Skip); else Continue.
- **EndJob** - ends the actor's job (and citizen job); the next idle tick picks a new job. Continue.
- **MakeDecision** - eggs: Stop. Otherwise queues the actor for the deferred decision step (section 1.6) and returns Stop (task ends; the decision then sets the new task).
- **RepeatTaskChance(p)** - RestartTask with probability p else Continue.
- **RestartTask** - always RestartTask.
- **SetNextTask(task,clean,force)** - switches to the given task now (Skip result).

### 5.2 Waiting

- **RandomWait(min=0,max=1,land)** - sets the action wait to a uniform random value in [min,max] seconds (optionally lands hovering actors). Continue.
- **Wait(t=1)** - sets the action wait to exactly t seconds. Continue.

### 5.3 Generic animation, state and utility

- **ActorRandomJump** - small random hop (side power 1-5, height 1-2, random direction) with dodge effect. Continue.
- **ActorReverseFlip / ActorSetFlip(flip)** - toggle/set sprite facing. Continue.
- **ActorSetBool / ActorSetInt(name,value)** - store a named flag/int in actor data. Continue.
- **ActorSetFlying(flag)** - sets flying state. Continue.
- **AngleAnimation(target,sound,wait,angle,checkFlip,landIfHover)** - plays a lunge/tilt animation toward a tile, building, ruin or actor target (requires that target; building shakes 0.3 s; actor target hidden inside something -> Stop); optional sound; sets action wait to the wait value. Continue.
- **CheckEnemyNotNear** - Stop if an enemy is near on the same island.
- **CheckIfInLiquid** - Continue only if in liquid. |  CheckIfOnGround: Continue only if NOT in liquid.
- **GetDamaged(dmg,type)** - actor takes that damage; Continue if alive, else Stop.
- **JumpingAnimation(wait, jumpTime)** - sets the jump-animation timer and the action wait. Continue.
- **LookAtBuildingTarget(0.3)** - faces the building target and waits the given time.
- **SetActorSpeed(v)** - sets the actor's speed stat to v (UFO speeds 10/20/50/100). Continue.
- **ShakeBuilding(time=0.7,ix,iy)** - shakes the usable building target (visual). Continue.
- **SpawnCityBorderEffect / SpawnHmmEffect / SpawnPlotProgressEffect** - purely visual effect spawns. Continue.
- **StartShake(time,wait)** - actor shakes; action wait set to wait. Continue.
- **TeleportHome** - Stop without a city/zones; teleports with effect to a random tile of a random city zone, cancelling behaviours; cast animation. Continue.

### 5.4 Status, emotion and mood

- **ActorAddStatus(id,dur,effect,addWait)** - adds status (optional duration override, optional visual effect); if addWait, also sets the action wait to that duration. Continue.
- **ActorChangeHappiness(id) / AddHappiness(id)** - applies a named happiness event to the actor. Continue.
- **FinishSinging** - no-op (Continue).
- **MadnessRandomEmotion** - 50%: adds one of status laughing/crying/swearing for 10 s and Continue; 50%: force-switches (no clean, first action now) to one of tasks happy_laughing / crying / swearing.
- **Reflection** - builds a weighted bag of task ids and force-switches to a random pick (no clean, first action now); Stop if bag empty. Happy = happiness > 50; unhappy = happiness < -70. Super-positivity subspecies bag: 3x happy_laughing, singing, child_random_flips, child_play_at_one_spot, child_random_jump. Otherwise: for each entry in the actor's recent happiness-event history add that event's pot task id x its pot amount; hotheaded +4 swearing; aggressive subspecies with happiness < 0 +1 start_tantrum; hotheaded with happiness<0 +1 start_tantrum; if happy: 3x happy_laughing, 1 singing (+4 more if melodic language), babies add 2 each of child_random_flips/child_play_at_one_spot/child_random_jump, adults add wait5; if unhappy: unless "strong mind" tag 2 crying + 1 start_tantrum (happiness <= -100: +3 crying, +1 tantrum), 2 swearing, 2 punch_a_tree, 2 punch_a_building, 1 wait5, pyromaniac +1 start_fire; if neutral: wait5.

### 5.5 Choosing movement targets and walking

- **AnimalFindTile** - 80%: look for a nearby "druid" species actor in surrounding chunk and target a random tile of its region (animals gravitate to druids); else (or none found): current region, 50% swap to a random neighbour region, random tile; Stop if none.
- **CheckCuriosityTile** - needs a scheduled tile target (consumed): 60% (+30% for subspecies trait curious) to investigate, else Stop; target = walkable tile around it next to the actor; Stop if none.
- **CheckIfOnSmallLand** - Stop if the island under the actor is already good for it (continue only when stuck on a too-small island).
- **FindBuilding(type)** - searches all chunks around the actor (random order) for a building of that type key; prefers one on the same island (returns immediately), else the last one seen on another island; Stop if none. Continue.
- **FindDesireWaypoint** - kingdom has an "attractor" building type: targets the closest building of that type; Stop if none or closer than 10 tiles.
- **FindGoldenBrain** - Stop under the peaceful-monsters law or if no golden-brain building exists; else building target = the closest one.
- **FindRandomCivBuildingTile** - 65%: random tile of own region; else a civ city building within 1 chunk on the same island -> random tile of that building's region; else random tile of own region; Stop if the region is empty.
- **FindRandomFarTile** - random-walks 5 hops across neighbouring regions (stopping early if none) and targets a random tile in the final region; Stop if empty. (Used for fleeing.)
- **FindRandomFarmTile** - 65% random tile in own region; else 50% a random neighbour region; random tile in it; Stop if none.
- **FindRandomFrontTileNearHouse** - Stop if no home; if the door tile is on another island: target the house tile itself if on the actor's island else Stop; else random tile among the 3 tiles to each side along the door's row (door x-2..x+2, same island); Stop if none.
- **FindRandomNeighbourTile** - target = a random walkable tile adjacent to the actor; Stop if none.
- **FindRandomTile** - THE wander picker: 65%: random tile of the current region; otherwise, with 50% switch to a random neighbouring region, then a random tile of that region (own region if no switch). Stop if the chosen region has no tiles. (Regions are small pathfinding cells.)
- **FindRandomTileNearBuildingTarget** - Stop if no building target or it is on another island; 20% chance to hop to a random neighbouring region of the building's region; random tile there.
- **FindTile(type)** - NewRoad: asks the city for the next road tile to build (Stop if none). Other types: asks the chunk finder for a tile of that kind (biome, free tile, grass, dirt, water, ...) within the actor's chunk surroundings; Stop if none.
- **FindTileBeach** - looks in the own region (else in each neighbouring region) for an edge tile of the region that is ocean, picks one at random; Stop if none.
- **GetRandomZoneTile** - tile target = random tile in a random chunk around the actor.
- **GetTargetBuildingMainTile** - tile target = building target's main tile.
- **GoOrSwimToTileTarget** - same as go-to-tile-target but allowed to path through water (swimming).
- **GoToActorTarget(type, pathOnWater, checkCanAttack, calibrate, dist, sameIsland=true, checkInside=true)** - requires an actor target; Stop if (optional) target not attackable, target on another island, or target hidden inside something. Destination tile by type: SameTile = target's tile; SameRegion = random tile in target's region; NearbyTile = a tile next to the target on the actor's island; NearbyTileClosest = nearest such tile; RaycastWithAttackRange = first tile on the line to the target (same island) that is within attack range of the target (else the target tile; if that is the actor's own tile: Continue). No tile or path fails: target added to the actor's ignore list, Stop. Calibrate flag lets the mover re-aim if the target moves more than the check distance (2) (applied by the movement update).
- **GoToBuildingTarget(pathOnWater)** - requires building target; paths to the building's tile. Continue (path failure not checked).
- **GoToTileTarget(walkOnWater, walkOnBlocks)** - requires tile target; asks the pathfinder (section 7.3); path failure -> Stop. Continue (the actor then walks; the AI is paused while moving).
- **RandomSwim** - moves the actor 1 step onto a random adjacent liquid tile (immediate step, sets it as the tile target). Continue.
- **ShortRandomMove** - target = a random adjacent tile whose layer type (land/ocean/lava) matches the current tile; Stop if none.
- **SkeletonFindTile** - like animal wander but attracted to necromancers: if a necromancer-species actor is within the chunk surroundings: random tile in its region (always, no percentage); else own region with 50% neighbour region; Stop if empty.

### 5.6 Island / terrain stability

- **GoToStablePlace** - Stop if the island under the actor is already good for it. Else (1) look in the surrounding chunks for the nearest region of a different good island that is connected to the actor's island (by the island-connectivity test, always checking from the smaller island) and take a random tile there; (2) if none: for each good, connected island compute its border region closest to the actor and keep up to the 4 nearest within 15 distance of the best; 80% pick one of those and go to a random tile in it; otherwise (or none) pick a random tile in the actor's own region (50%) or a neighbouring region (50%) to wander. Continue.
- **MoveAwayFromBlock** - Stop unless the actor is standing on a "block" island (e.g. trapped in solid terrain); looks for the nearest edge tile of the own region, then neighbouring regions, then the island's inside edges, that belongs to a different island with > 5 tiles and is safe for the actor (not ocean if damaged by ocean, not lava if it dies in lava); target = that tile; Stop if none.
- **WalkIntoWaterCorner** - Stop if island is already good for the actor; else target the nearest ocean edge tile among the island's inside-edge regions (so a land animal stuck on a tiny island swims off); Stop if none.

### 5.7 Eating

- **AnimalCheckHungry** - Stop unless hungry.
- **ConsumeActorTarget** - StepBack if the target is farther than 1 tile; actor waits 0.3 s and bites: damage = 15% of target max health + 1 (type "eaten"), poisoned if target is poisonous; nutrition gained = damage dealt while it lives; when the target dies nutrition set to full and "just ate" set. Target's behaviour is cancelled. RepeatStep while target alive, else Continue.
- **ConsumeActorsBloodTarget** - same as above but 5% max health + 1 damage, +10 nutrition per bite, full nutrition on the kill; no poison check.
- **ConsumeGrass** - Stop if tile target is not grass; strips the top tile layer (grass becomes bare ground), nutrition handled via the tile consume helper. Continue.
- **ConsumeTargetBuilding** - fruit building: if it has resources, extract them and restore nutrition by the asset's value, count consumed. Other building: start destroying it and restore nutrition. Continue.
- **ConsumeTargetTile** - Stop unless tile type is edible by earth-eaters; consume top tile and terraform the tile into a deep pit/ocean tile. Continue.
- **FindMeatSource(type, checkFactions)** - keeps the current actor target if still valid; else the closest valid prey within 2 chunks (60 distance cap; with 50% the search order is randomised and may stop early with 50% chance per hit). Valid prey: not self, attackable (faction check optional), not larger than the hunter (actor size), same island; by type: meat = prey species flagged as meat source and a different species; same-species = same species; insect = flagged insect meat and different species. Stop if none. (Insect and same-species variants are thin wrappers.)
- **FindTileForEating** - a tile edible by earth-eaters among the 8 neighbours, else in the actor's region (random pick among candidates); Stop if none.
- **NectarNectarFromFlower** - Stop unless the building target is a flower; if alive restores half of the flower's nutrition value and counts consumed (flower not destroyed); eat animation. Continue.
- **ReplenishNutrition** - nutrition to maximum and "just ate" set; counts consumed. Continue.
- **TryToEatCityFood** - Stop if city has no suitable food; picks a food item (actor's favourite first); pays its money cost unless food is free for this person (Stop if cannot afford); eats it (city stock -1, nutrition restored); gluttonous actors repeat once more if they can afford. Continue.

### 5.8 Sleep, waste, energy

- **DecideWhereToPoop** - adult with a house inside its city borders on the same island: force poop_inside; otherwise force poop_outside (switch without cleaning, first action immediately).
- **DecideWhereToSleep** - house in own borders on same island: force sleep_inside; else sleep_outside.
- **LaunchFireworks** - Stop if actor lacks the fireworks cost in money; else ends festive_spirit status, spawns fireworks, pays the cost. Continue.
- **PoopInside** - finishes pooping; the subspecies' random bio product (default plain waste -> nothing built) is built near the actor if it is something else. Continue.
- **PoopOutside** - drops waste on the ground with a small push. Continue.
- **ReplenishEnergy** - mana and stamina to max. Continue.
- **TrySleep(outside)** - makes the actor sleep for a duration and (sapient with a city but no house) gives a "slept outside" unhappiness. Duration: no subspecies = 20 s; hibernating (winter+winter_slumberers, night+nocturnal_dormancy, non-chaos era+chaos_driven, light age+circadian_drift) = 100 s; else random 20-60 s (monophasic sleepers 40-90 s), +another random roll of the same range if trait prolonged_rest. Continue.

### 5.9 Reproduction and mating

- **AnimalBreedingTime** - requires actor target within 1 tile else Stop; both shake, partner waits 2 s, hearts effect. Continue.
- **CheckBuddingReproduction** - Stop if already has "budding" status; else adds budding status lasting the subspecies maturation time (the child appears when it ends) and counts a reproduction. Continue.
- **CheckDivineReproduction** - Stop if the actor has trait miracle_bearer; else starts a miracle birth. Continue.
- **CheckFissionReproduction** - makes a baby by fission. Continue.
- **CheckForBabiesFromSexualReproduction** - needs lover else Stop; both get afterglow status and a "just kissed" happiness event; Stop if meta (population/family) limits are reached; counts reproduction act; then tries to make babies (details owned by the reproduction spec: the mother is the female parent, family is joined/created). Continue.
- **(detail of CheckForBabiesFromSexualReproduction)** - ensures the couple share a family (creates a new one at current tile otherwise). Mother = female parent (sexual) or random parent (hermaphroditic). If a mother exists, can make babies and (is not a male of a sexual species): strategy egg or immediate-spawn -> babies spawn now; strategy pregnancy -> mother gets status "pregnant" lasting the maturation time and a baby is born at its end. Counts a reproduction.
- **CheckForLover (civ mating handshake)** - requires a lover and a usable building target. If the lover is in task sexual_reproduction_civ_go targeting the same building and is past its 4th action (arrived): both enter the building, lover switches to sexual_reproduction_civ_wait, actor to sexual_reproduction_civ_action. If the lover is not in the "go" task: Stop. Otherwise Continue (keep waiting).
- **CheckParthenogenesisReproduction** - makes a baby by parthenogenesis. Continue.
- **CheckReproductionBasics** - Stop if the world law for civ babies (sapient) or animal babies (others) is off; Stop unless actor can breed; Stop if it cannot make babies or a meta limit (population caps) is reached; Stop if the actor is neither an "important person" nor in a place private enough for breeding. Else Continue.
- **CheckSexualReproductionCiv** - civ actors need a house and a lover; Stop if the lover's task is not interruptible for reproduction; else forces the lover (job cleared, timer reset) into sexual_reproduction_civ_go and the actor into the same.
- **CheckSexualReproductionOutside** - needs both partners able to breed and a lover; moves the actor into task sexual_reproduction_outside (job cleared) targeting the lover and makes the lover wait; RepeatStep result. Otherwise afterglow and Stop.
- **CheckSoulBorneReproduction** - needs status soul_harvested and not pregnant and no meta limit; consumes the status and starts a soulborne birth. Else Stop.
- **CheckSporeReproduction** - spawns spores around the actor.
- **CheckVegetativeReproduction** - Stop if status taking_roots already; else add taking_roots lasting maturation time (the plant child appears at the end). Continue.
- **FindLover** - looks at units in the 1-chunk neighbourhood for the first one that is alive, has a subspecies, is not self and "can fall in love" with the actor; failing that a random city mate (inside own city borders). If found, they become lovers. Always Continue.
- **SexualReproductionTry** - counts an attempt; if the actor has a house inside its city borders on the same island: force task sexual_reproduction_inside, else sexual_reproduction_check_outside (both without clean, first action immediately).
- **SpawnHeartsFromBuilding** - Stop without a lover; gives both partners the afterglow status and spawns heart effects. Continue.

### 5.10 Herd / family

- **ChildFindRandomFamilyParent** - Stop if the family has no founders; picks a random founder as actor target; Stop if the child is inside its own city borders but that parent is not.
- **FamilyAlphaMove** - herbivore: target a random tile in the region of the nearest plant building (within 3 chunks, same island; stops searching if closer than 5 tiles); carnivore: region of the nearest actor within 3 chunks that is a different species and family and is a meat source (stops if closer than ~2.2 tiles), else a random tile on its island. If nothing found: force task random_move. (Note: the chosen tile is re-randomised inside its region twice.)
- **FamilyCheckMembers** - Stop if the family has more than one member; else actor leaves its family. Continue.
- **FamilyFollowAlpha** - Stop if no family or actor is alpha; re-evaluates the alpha; Stop if actor became alpha, alpha missing, on another island, or farther than 400 distance units (Euclidean on world positions; tile = 1 unit, so effectively 'anywhere reasonable on the island' - the scale is unclear); else actor target = alpha.
- **FamilyGroupJoin** - Stop if already in a family; joins the nearest same-species family (nearby family lookup) if any. Continue.
- **FamilyGroupLeave** - Stop unless in a full family; leaves it. Continue.
- **FamilyGroupNew** - Stop if in a family; finds a nearby (4 chunks; species family-spawn radius) same-species, same-subspecies, family-less actor on the same island; none -> Stop; else creates a new family with both. Continue.

### 5.11 Socializing, theft, dreams

- **AffectDreams** - picks a random sleeping actor (alive, with subspecies that has advanced memory or advanced communication) and tries to convert that sleeper to the dreamer's cultural/meta groups; Stop if none.
- **CheckNearActorTarget** - requires actor target; Stop if the actor cannot talk with it; Continue if within 2 distance (squared < 4); else RestartTask (walk again).
- **DoTalk** - Stop if no target, target dead or lying down, or (unless both have a telepathic link) farther than 4 tiles. Each actor counts talks; once the count exceeds a random 5-10 returns Continue (conversation over). Otherwise one talk beat: counter+1; 40% own topic icon cleared, else 40% the partner's cleared; else 45% chance to copy the partner's topic; both face each other; partner is switched to task socialize_receiving; sound; both wait the same random 1.1-3.3 s; RepeatStep.
- **FindTargetToStealFrom** - gathers up to rand(1..3) units within rand(1..3) chunk range on the same island that carry cash; picks the nearest; Stop if none.
- **FinishTalk** - Stop if the partner is gone/lying. Resets both socialize counters; 70% good talk (+10 happiness "just talked" to both) else bad (-15); both get status recovery_social; on a good talk also rolls for falling in love and becoming best friends; then spreads cultural/language/religion (see below), possible gifts, learning transfer; both wait a shared random 1.1-3.3 s. Continue.
- **(FinishTalk detail: meta spread)** - only between actors whose subspecies have advanced memory (culture, religion) / advanced communication (language). Winner is chosen by lottery: each side has 3 tickets (+ melodic-language trait bonus; +1 for each of city/kingdom whose group equals that side's group); a missing side yields the other's group; both actors convert to the winner. Culture traits add effects: pep_talks 50% inspired status, expertise_exchange gives xp, gossip_lovers gives happiness.
- **(FinishTalk detail: gifts & learning)** - cultures with youth_reverence (talking to someone younger) or elder_reverence (older) and an adult talker: chance 20% (+30% if related or important to the partner) the talker gifts the partner an item and/or money -> happiness events for both. Learning transfer: for each of intelligence, warfare, diplomacy, stewardship, with 30% chance the lower stat of the two rises by 1 toward the higher one.
- **RandomSocializeTopic(min,max,chance)** - clears topic icon; Stop unless the actor's subspecies has advanced communication; passes a chance roll; waits random [min,max]. Continue.
- **SocializeStartCheck** - telepathic link: force socialize_try_to_start_immediate; else if the city has a bonfire: socialize_try_to_start_near_bonfire; else socialize_try_to_start_immediate (no clean).
- **SocializeTalk** - passive (marks the actor as socializing; the partner drives the talk).
- **StealFromTarget** - Stop if target gone/inside something or farther than 2 tiles. If the victim can see the thief: 40% steal (victim stunned 1 s, thief waits 0.9 s, victim gains aggro vs thief); not seen: 70% steal (victim stunned 5 s, thief waits 1 s); else thief waits 1 s and Stops. A steal moves some of the victim's cash to the thief; Continue.
- **TryFindTargetWithStatusNearby(statuses...)** - finds the closest other unit on the same island in the 1-chunk neighbourhood that has any of the listed statuses; target tile = a tile next to it on the actor's island and actor target set; if no such unit: a free tile in the chunk; Stop if none.
- **TryToSocialize** - picks a random talk partner (see below); lovers may form; both socialize counters reset; with a mutual telepathic link goes straight to socialize_do_talk else socialize_go_to_target (no clean). Stop if nobody.
- **(TryToSocialize partner choice)** - scans units in the 1-chunk neighbourhood (2 with telepathic link, which also adds family members as normal and parents as best candidates); candidate must be talk-able; civ actors may only talk to civ-kingdom units (mobs only if the actor's culture has trait animal_whisperers); non-civ actors only to the same species. If the species needs opposite-sex partners, candidates who the actor could fall in love with are "best". Pick random among best, else among all; scan may stop early (random) when order is shuffled.

### 5.12 Reading

- **FinishReading** - needs the book target alive (else Stop). Applies: 50% chance of the book's actor trait; happiness (sign flipped to positive for cultures with trait reading_lovers), experience (boosted by culture trait attentive_readers) and mana from the book; book attribute bonuses to actor data; language-trait read actions; the book type's read action; conversion of actor to the book's culture/language/religion by weighted lottery (actor's current group weight 3, book's group weight 3, each +stylish-writing bonus if the language has that trait/book has it) - a different winner means conversion; kings and city leaders also may (50% each) add the book's culture/language/religion trait to their own group; book read counter +1. Continue.
- **TryToRead** - Stop if city has no readable book; actors with tag can_read_any_book pick any city book, others need a language and a city book of that language; marks the book as read and stores it as book target. Continue.

### 5.13 Plots

- **CheckPlot** - Stop if no plot; if the base plot check fails leave plot and Stop; else force task progress_plot.
- **CheckPlotIsOk** - base check failing leaves plot and Stops.
- **CheckPlotProgress** - base check; plot gets progress equal to actor's intelligence stat; if plot no longer active the actor leaves it and Stops.
- **TryNewPlot** - if the actor has no plot and is not fighting: collects all possible basic plots (and its religion's rites when the rites law is on) whose own check passes, each repeated by its pot-rate weight, shuffles, and starts the first one the plot manager accepts. Always Continue.

### 5.14 Clan

- **ClanChiefCheckMembersToBanish** - every clan member who is a foe of the chief is removed from the clan (the chief is not).
- **ClanChiefCheckMembersToKill** - every clan member who is a foe of the chief takes full-health divine damage (dies).

### 5.15 Culture / language / religion adoption

- **ChangeCityActorCulture/Language/Religion** - if the actor has that meta group, the actor's city adopts it. Continue.
- **ChangeKingdomCulture/Language/Religion** - if the actor has that meta group, its kingdom adopts it. Continue.

### 5.16 City life: jobs, building, land, taxes

- **ActorCheckZoneTarget** - asks the city growth helper for a zone to claim; Stop if none or already the city's; target tile = zone centre if on actor's island, else random zone tile on actor's island; Stop if none. Continue.
- **ActorGiveTax** - if king or city has no leader: converts all carried loot to own money. City leader: pays tribute (kingdom tribute rate share of loot to king's loot; of the rest half goes to city gold stockpile, half to own money); if no king keeps all. Ordinary citizen: kingdom local tax rate share of loot to city leader's loot, rest to own money. Continue.
- **ActorTryToTakeItemFromCity** - for each equipment type list in city stock, actor takes (equips) a suitable item from the city. Continue.
- **BuildTarget** - requires tile target and city; Stop if the target building is no longer under construction; else adds the actor's construction-speed worth of progress; if that completes a build step it awards the actor a configured coin amount of loot. Continue.
- **BuildingTargetHome** - building target = actor's home building; Stop if none.
- **BuildingTargetLoverHome** - needs a lover; target = home of whichever of the couple has one (if both: the male's home); Stop if neither.
- **CheckBuildCity** - Stop if the current zone already belongs to a city, or the kingdom-expansion law is off, or the zone is not good for a new city; else founds a new city in the zone and the actor joins it. Continue.
- **CheckCanRepairEquipment** - Stop unless the actor has equipment where at least one worn item needs repair and the actor's money >= item gold cost * repair-cost multiplier.
- **CheckCityDestroyed** - if actor has no city: stop being a warrior if its profession is cancelled without a city, end job, Stop. Else Continue.
- **CheckEndCityActorJob** - if more citizens occupy the actor's citizen job than the city currently wants slots for: end job, Stop. Else Continue.
- **CheckHasMoneyForCityFood** - Stop unless actor can get food from the city (has enough money).
- **CheckNeeds(maxRestarts)** - Stop when the task's restart count has reached maxRestarts (if > 0); if actor is starving and city has any food: end job and Stop; else Continue. (Used to bound repeating gather loops.)
- **CheckSameCityActorLover** - actor leaves its home and army and joins its lover's city. Continue.
- **CheckStartCivilization** - actor founds a city and starts a civilization.
- **CheckStillUnderConstruction** - Stop if the building target is no longer under construction.
- **CityActorCreateRoad** - creates a road tile at tile target; actor gains configured coin loot. Continue.
- **CityActorFertilizeCrop** - Stop if crop already max level or actor has no fertilizer; consumes 1 fertilizer, grows the crop fully, coin loot reward.
- **CityActorFindBuilding(type)** - sets building target using the shared building finder for the given building-type key (comma-separated list picks one randomly each time); never fails here (target may be null, later actions error-check it).
- **CityActorFindNewJob** - asks the city to assign this actor a citizen job (section 6.3). Continue.
- **CityActorFindStorage** - building target = city storage nearest to the actor; Stop if none.
- **CityActorFindUngrownCrop** - random city crop building that exists and is not at max growth; Stop if none.
- **CityActorGetRandomBorderTile** - Stop if city has no zones or no border zones; random tile of a random border zone; Stop if not ground.
- **CityActorGetRandomDangerZone** - Stop unless city has zones and is in danger; first danger zone with a random tile on the actor's island becomes target; Stop if none.
- **CityActorGetRandomIdleTile** - Stop if no zones. Prefers a finished bonfire (random bonfire tile; with 30% chance instead a random tile of its region, with 30% of those a neighbouring region). Else random city tile: if actor is outside the city or 20% chance, a random tile in a random city zone (must be on same island) else a random tile in actor's own region.
- **CityActorGetResourceFromStorage(res,n)** - Stop if no storage or fewer than n of the resource; takes n from city stock into actor inventory.
- **ClaimZoneForCityActorBorder** - Stop if the actor's current zone is no longer good to claim; else adds the zone to the actor's city; if the actor's culture has trait expansionists (or fast-growth debug) and the zone was not stolen from another city, also claims every neighbouring free zone that is still good; coin loot reward. Continue.
- **FindConstructionTile** - tile target = the building's construction access tile.
- **FindFarmField** - Stop if any fully grown wheat exists in the city; else the nearest (squared distance) empty or clearable farm-field tile in the city that is not already targeted, same island; Stop if none.
- **FindHouse** - Stop if already housed; picks the first finished city building with a free resident slot; else tries to share a family member's house (checks up to 5 random relatives in the same city, evicts nothing but frees a slot occupied by a same-family resident); sets home and applies a "found house" happiness event scaled by the house's housing happiness. Stop if none.
- **FindNearbyPotentialCivCityToJoin** - actor joins the city of the zone it stands in if that city is not neutral and welcomes it; else the best welcoming city on the same island within the nomad "far city" range (x3 for non-nomads of another kingdom); cities of the actor's own kingdom beat others. Leaves previous faction and army, joins city. Stop if none.
- **FindTileForFarm** - needs a windmill in the city (else Stop); among the city's computed farm-place tiles on the actor's island that are empty or clearable and not already targeted, prefers the one nearest the windmill that has farm field tiles adjacent; else the nearest without that requirement; Stop if none.
- **FindWheat** - nearest (same island, not targeted) fully grown, usable wheat building in the city's grown-wheat list; sets tile and building targets; Stop if none.
- **GenerateLootFromHouse** - Stop without a house; adds loot = max(1, home building's loot value + biome loot value under the house).
- **JoinCity** - Stop if the zone under the actor has no city or the city cannot be joined by it. A neutral city: adopts the actor's kingdom if that is a civ kingdom, else a NEW civ kingdom is founded around the actor (actor gets default culture/language/clan, city and kingdom take its metas). If the city's kingdom differs the actor leaves its previous faction. Actor joins the city and takes the city's culture/language/religion. Continue.
- **KingCheckNewCityFoundation** - Stop unless kingdom has a capital; Stop if any kingdom city reachable from the capital has <= 30 units (wait until cities are populated); recompute settle-able zones, Stop if none. Candidate source cities: those with >= 30 adults that need no settlers, shuffled. First tries each source city's same-island expansion: flood fill by waves over free zones adjacent to the source city (4 waves max); zones reached at wave > 2 (i.e. >= 3 zones away) that are good for a new city and on the same island are candidates; random one chosen. If none, tries source cities owning transport boats: the nearest reachable settle-able zone (biome must suit the actor's subspecies). Founds the new city there and moves up to 6 adult units (plus their lover and family where eligible; not leaders, kings, army members, or people whose lover is king/leader) from the source city, cancelling their behaviours. Continue.
- **MakeFarm** - Stop if the tile cannot be farmland or has a building that cannot be cleared for farms; terraforms the top layer to farm field; coin loot. Continue.
- **MakeItem** - tries to craft one random weapon from city resources, then up to 5 random equipment pieces (stops at the first failure). Continue.
- **PlantCrops** - Stop unless tile is an empty farm field; builds a "wheat" crop building there; coin loot. Continue.
- **RemoveRuins** - gives the actor 1 wood (wood-yielding tree) or 1 wood/1 stone depending on the ruin's cost; destroys the ruin; coin loot. Continue.
- **RepairEquipment** - for each worn item needing repair, pays gold cost * repair multiplier if affordable and fully repairs it; marks stats dirty if anything was repaired. Continue.

### 5.17 Resource gathering and delivery

- **ExtractResourcesFromBuilding** - requires a usable building target; extracts from the building (it loses stock/destroys per its own rule) and the actor gains the building's "resources given" items in inventory; mineral buildings give +1 to miner-trait actors with 50% chance.
- **GetResourcesFromMine** - 40% nothing; else picks a mineral building from the biome's mineral pool (default pool weights: gems 5, stone 20, metals 10) and tries to build it next to the mine; actor gets coin loot. Continue.
- **ResourceGatheringAnimation(wait,sound,land)** - needs a usable building target; Stop if the building is a gatherable that has nothing to collect; plays gathering animation, advances the building's gathering timer, shakes it, waits the given time. Continue.
- **ThrowResourceAnimation(res)** - visual: a thrown resource sprite flies to the building's stockpile point (duration clamp 1-1.5 s). Continue.
- **UnloadResources** - if carrying resources, gives all inventory resources to the city stockpile. Continue.

### 5.18 Fire fighting

- **CityActorFindClosestFire** - Stop if the actor's current zone has no fires; finds the nearest burning tile (no building) in the zone; then walks the straight line from the fire toward the actor and takes the tile closest to the fire that is at least 2 tiles away from it as the stand-off position; Stop if none. Continue.
- **CityActorFindFireZone** - among own city zones and neighbouring unowned zones, picks the nearest (to actor) zone with fires; target = the closest non-burning, building-free tile in it; Stop if none.
- **CityActorRemoveFire** - requires tile target; extinguishes every burning tile and burning building in the actor's current zone. Continue.
- **FindTileWhenOnFire** - random ocean-type region tile in the actor's chunk, else in the 8 neighbouring chunks; Stop if none.

### 5.19 Army and warriors

- **CheckCityActorArmyGroup** - non-civ actors drop any army; if the city has an army whose group is in the city and has a leader, the actor joins it. Continue.
- **CheckCityActorWarriorLimit** - Stop if outside own city borders; else asks the city to re-validate whether this warrior still fits the limit (it may stop being a warrior). Continue.
- **CityActorCheckAttack** - (verifier-guarded army move) Stop if army in city with leader and city says not ok to send army, or no attacked city/zone, or the attack zone centre is on another island. If the actor is outside the target city's zones: target a random tile of the attack zone. Else if the attacked city has a watch tower on the same island: random tile in the tower's region. Else a random tile in an adjacent target-city zone, else a random tile in any target-city zone on the actor's island; Stop if none.
- **CityActorWarriorTaxiCheck** - Stop if standing in an enemy-kingdom city; if the city has an attack order whose target zone is on another island: files a taxi (boat) request for this actor to that zone centre and Continue; else Stop.
- **FindTileNearbyGroupLeader** - Stop if no army or no captain; if the captain is walking a path: a random tile in the region of the path's final tile; else a random tile of the captain's region (if that region has < 20 tiles, of a random neighbour region).
- **VerifierAttackZone (task verifier)** - returns Stop (cancelling the task and job) unless: actor has a city, the city has an attack-zone order, the target zone has a city and that city's kingdom is an enemy of the actor's kingdom.

### 5.20 Combat-related

- **AddAggroForBehTarget** - requires actor target; registers aggression toward it. Continue.
- **AttackActorHuntingTarget** - in water and cannot attack: Stop. Target gone: wait 0.5 s, Continue. In range: attack; ranged weapons wait 0.5 s after; target dead -> Continue, alive -> RepeatStep. Out of range -> StepBack (re-run the approach).
- **CopyAggro** - if there is an actor target: copy its aggression list and add every nearby (1-chunk) unit on the same island that has the target in its aggro list.
- **DealDamageToTargetBuilding(min,max)** - damage = max(1, actor damage stat * random multiplier in [min,max]) to the building target, slash effect. (target building required).
- **FightCheckEnemyIsOk** - validates the attack target each loop: Stop (and drop target) if no target / dead / should no longer be pursued / cannot be attacked (also adds it to the ignore list) / out of range and unreachable (land creature vs target in liquid or flying; water creature vs target on land unless force-land) / farther than sight range+1 chunks. Else actor target = attack target. Continue.
- **FindTantrumTarget** - keeps a valid current target; else the closest valid attackable actor within the 1-chunk neighbourhood (not stunned unless it is a foe; random-ordered scan that stops early with 50% per hit); none -> force task random_move.
- **FindTargetForHunter** - keeps a valid target; else the closest actor within 3 chunks that is of a different kingdom, attackable, a meat source and at least 3 years old; Stop if none.

### 5.21 Spell-like abilities

- **BurnTumorTiles** - Stop unless standing on ground; finds "creep" (tumor) tiles in own region (else the first neighbouring region having any), casts fire at a random one, cast animation. Stop if none.
- **CheckCure** - Stop unless on ground; searches units in the 1-chunk neighbourhood for one that can be cured (curable trait/status); casts cure on it, cast animation. Stop if none.
- **Heal** - Stop if at full health; else casts the blood-rain heal spell on itself, cast animation. Continue.
- **MagicMakeSkeleton** - Stop if more than 6 skeleton-species units already within the chunk surroundings; random tile of own region (Stop if occupied by units); cast animation; spawns a skeleton there. Continue.
- **RandomTeleport** - Stop unless at full health; 30% roll else Stop; casts the teleport spell on itself (needs to succeed else Stop); cast animation. Continue.
- **SpawnTreeFertilizer** - 30% roll else Stop; only on ground tile in a biome that does not auto-grow vegetation; looks in own region for tiles of non-grass biomes that DO auto-grow vegetation; casts spawn-vegetation on a random one; cast animation. Stop if none.

### 5.22 Skills

- **ActorTryToAddRandomCombatSkill** - 15% chance: add a random combat-skill trait and Continue; otherwise Stop.

### 5.23 Buildings (enter/exit)

- **ExitBuilding** - requires a usable building target; actor leaves the building; building does a tiny shake. Continue.
- **StayInBuildingTarget(min,max)** - actor goes "inside" the usable building target (hidden) for random [min,max] s, clears its tile target; building shakes 0.5. Continue.

### 5.24 Boats and taxi (sea transport)

- **BoatCheckExistence** - boat without home building: starts a timer on first check; after more than 2 in-game months the boat is destroyed (full-health explosion damage). With a home building the timer is cleared.
- **BoatCheckFishingRepeat** - if fish carried <= 10: RestartTask (keep fishing); else force task boat_return_to_dock.
- **BoatCheckHomeDocks** - re-checks/assigns the boat's home dock; Stop if the boat has no home building.
- **BoatCheckLimit** - Continue only if the home dock is full (capacity reached); else Stop.
- **BoatCollectFish** - +1 fish in inventory.
- **BoatDamageCheck** - if health ratio < 0.8 and a home dock exists: cancel everything and force boat_return_to_dock.
- **BoatDangerCheck** - Continue only if recently attacked (else Stop); if also health ratio < 0.25 and a home dock exists: cancel all, force boat_return_to_dock.
- **BoatFindOceanNeutralTile** - if has home dock and already near it: Stop; else target a water tile of the same ocean from the dock; else a random boat-valid tile (Stop if none or if that tile lies in an enemy-kingdom city zone).
- **BoatFindRequest** - cancels a stale taxi request, asks the taxi manager for a new request for this boat; none -> Stop; else assigns it and forces boat_transport_go_load.
- **BoatFindTargetForTrade** - picks a trade-partner dock; sets it as building target; Stop if none.
- **BoatFindTileInDock** - building target must be a civ building; target = an ocean tile of the same ocean next to its dock; Stop if none.
- **BoatFindWaterTile** - tile target = random tile valid for a boat.
- **BoatFishing** - spawns a fishing-net effect on an ocean tile 3-4 tiles away (visual only).
- **BoatMakeTrade** - +5 gold to boat inventory.
- **BoatRemoveIfLimit** - if home dock is over capacity: boat is destroyed, Stop.
- **BoatSetHomeDockTarget** - building target = home dock; Stop if none.
- **BoatTransportCheck** - if carrying passengers: destination = city attack-zone centre if >5 passengers and city has an attack order, else city centre tile; force boat_transport_go_unload (no clean); Stop if no destination. With no passengers: force boat_transport_check_taxi.
- **BoatTransportDoLoading** - no request: cancel work, Stop. Keeps loading while wait counter <= 4 and passengers < 100 and not everyone embarked: each request actor not in boat, not fighting and not already in a boat task is woken, cancelled and given task force_into_a_boat; state Loading; waits 12 s and increments wait counter; RepeatStep. When done: no passengers -> cancel work, Stop; else state Transporting, late passengers cancelled, destination = request's target tile; Continue.
- **BoatTransportFindTilePickUp** - request invalid -> cancel work, Stop. If home dock's ocean tile is on the same island as the pickup start: go to the dock (already near: stay, reset wait counter); else search an ocean tile near the pickup start (none -> cancel work, Stop).
- **BoatTransportFindTileUnload** - target = ocean tile near the destination; Stop if none.
- **BoatTransportUnloadUnits** - finds landing tile from ocean toward destination (steps to an adjacent ground tile if ocean), unloads all passengers there, finishes the taxi request.
- **RepairInDock** - if hurt: restores up to 100 HP, waits ceil(HP/25) seconds inside the dock building, shakes it; RepeatStep until full health. Continue.
- **TaxiCheck** - Stop if the city has no tile. Needs a ride home if: attacker-job citizens are on another island than the city AND (the city has no attack order OR the attack target island differs from where they stand); other citizens just need to be on a different island from the city. If so files a taxi request to the city tile. Else Stop.
- **TaxiEmbark** - Stop unless the actor has a taxi request with an assigned boat in the Loading state; boards if the boat is within 5 tiles or near its dock (clears tile target, embarks). Else Stop.
- **TaxiFindShipTile** - needs a Loading request with an assigned boat; target = a tile in the dock's region when picking up near the dock, else the raycast embarking tile toward the boat; Stop if none.
- **TaxiSitInside** - waits 1 s and RestartTask (passengers idle inside the boat until unloaded).

### 5.25 Bees

- **BeeCheckHome** - non-bee species: Continue; bee: Continue only if it has a home building else Stop.
- **BeeCheckNoHome** - Continue only if no home building else Stop.
- **BeeCheckReturnHome** - Stop if no home; else building target = home.
- **BeeCreateHive** - Stop if any beehive is within 2 chunks; else builds a beehive on tile target and targets it.
- **BeeJoinHive** - home building = building target.
- **BeeReturnHome** - Stop if home destroyed or farther than 3 tiles; if carrying 3 pollen and standing on the home hive: pollen 0, civ bee puts 1 honey in inventory else hive gets honey; wait 3 s.
- **Pollinate** - Stop if not on a building; on a flower building: pollen +1 and the tile is pollinated; non-bee carriers convert 10 pollen into 1 honey (civ kingdoms only); waits random 4-10 s. Continue.

### 5.26 Special mobs (ants, worm, sandspider, crab, printer)

- **AntSetup** - first time only: picks two different random ground types out of {deep ocean, close ocean, shallow water, sand, low soil, high soil, hills, mountains}, stored on actor.
- **AntSwitchGround (red ant)** - turn-based painter: if tile target is type2, paint it type1 else paint type2; after more than 3 steps turn (clockwise when on type2 / counter-clockwise otherwise) and reset step counter.
- **BlackAntBuildIsland** - steps counter in actor data; liquid under target forces 20 steps; while steps>0 paints mountains (turn clockwise) alternating with hills (turn counter-clockwise) and decrements; at 0: sets steps 40, random direction, switches to task ant_black_sand and Stops.
- **BlackAntBuildSand** - while steps>0 paints sand on tile target unless it is hills/mountains, picks random direction each step; at 0 switches to ant_black_island and Stops.
- **BlueAntSwitchGround** - liquid tile -> turn clockwise and paint sand; otherwise turn counter-clockwise and paint shallow water.
- **CrabBurrow** - burrow animation; if hungry or no different-species actor around: end job, Stop; else wait random 10-20 s and RepeatStep.
- **FindRandomTile4Directions** - keeps a persistent heading (random on first use) and targets the next tile in that heading; if there is none, a random neighbour.
- **FindRandomTile8Directions** - worm wander: keeps a heading and a remaining-step counter. While steps remain and the actor has not yet reached its tile target it waits (Continue); else when steps run out draws a new counter (random between rand(1..5) and rand(10..59)) and turns to a random heading allowed from the current one (first time: any of 8). Each call spends 1 step and targets the next tile in the heading; if off-map resets and RepeatStep.
- **GreenAntSwitchGround** - ground cycler: liquid -> paint sand, turn counter-clockwise; sand -> low soil, turn clockwise; low soil -> high soil, counter-clockwise; high soil -> low soil, clockwise; other -> sand, counter-clockwise. Heading wraps.
- **PrinterSetup** - (pixel-art "printer" actor) first call records origin, step count; when all steps done the actor dies, Stop.
- **PrinterStep** - executes N steps per tick of a print template: teleports to the origin+offset tile, lowers/terraforms the tile; RestartTask until done, then Stop.
- **SandspiderBuildSand** - if tile target is not sand: paint it sand and ant_steps+1 (clears direction-changed flag); else 10% chance steps+1. Continue.
- **SandspiderCheckDie** - dies (removed without corpse) if no tile target or ant_steps > 20; Stop.
- **SandspiderCheckSand** - if the next tile target is sand and the heading was not already changed this step: picks a different random heading, marks changed, RestartTask (so it re-aims); else Continue.
- **WormDig** - if the worm's size > 0 and the target tile height < 220: raises/lowers terrain under a brush of that size (removes top layer, else raises or lowers the tile type; mountains/hills are not raised); otherwise only a flash. RestartTask.
- **WormDive** - counts down dive steps; when it hits 0 draws a new count between rand(1..5) and rand(10..59) and randomly grows or shrinks size by 1 (clamped 0..2). Continue.

### 5.27 Dragon

- **DragonCantLand(task)** - if the dragon cannot land here: force the named task; else Continue.
- **DragonCheckAttackCity** - if no tile target and a city to attack is remembered with attacks left: target = random tile within land-attack range of a random tile in a random building zone of that city and spend one attack; if the city is gone/empty or attacks exhausted the memory is cleared.
- **DragonCheckAttackTargetAlive** - drops dead/null actors from the dragon's aggro set.
- **DragonCheckAttackTile** - with aggro targets: nearest target sets the tile target (random tile within land-attack range of it); if not the last landing tile and within land-attack range and can land: force dragon_land. If flying and any target is within slide range: force dragon_slide.
- **DragonCheckOverTargetActor** - (skipped under "peaceful monsters" law) if it has aggro targets, can land and targets are within land-attack range: force dragon_land_attack.
- **DragonCheckOverTargetCity** - (skipped under peaceful monsters) with a remembered city and attacks left: 80% nothing; else if flying, cannot land and slide targets exist and a coin flip: spend an attack, force dragon_slide; if on the ground and can land: spend an attack, force dragon_land_attack.
- **DragonFindRandomTile** - if no tile target: random tile within 100 of the dragon, retried up to 5 more times until it is ground or lava; if still none, the closest of 8 random ground tiles; stores as tile target. (If the world has no ground at all, any tile.)
- **DragonFinishAnimation** - RepeatStep until a flip animation is done and the current animation reached its last frame.
- **DragonFlyUp** - resets the land-attack counter to 0.
- **DragonIdle** - if aggro targets exist Continue; else idles for random 1-3 s via RepeatStep.
- **DragonLandAttack** - on animation frame 4 arms the attack, on frame 5 hits: for each tile in the land-attack footprint, attack it if it has units, otherwise with 50% chance; increments the land-attack counter; RepeatStep until the animation ends.
- **DragonLanded** - remembers the tile it landed on.
- **DragonSetAnimation(state,looped,restart)** - waits for flip animation; switches animation state. Continue.
- **DragonSleep** - faces unflipped, resets "sleepiness" to 0; first call draws a sleep duration 10-80 s; each tick regains 1 HP with 10% chance if hurt; RepeatStep until the duration has elapsed.
- **DragonSleepy** - (non-zombie) increments a sleepiness counter stored on the dragon.
- **DragonSlide** - on animation frame 7 attacks tiles in the flip-direction attack footprint (always if units present, else 50%); RepeatStep to animation end.
- **DragonZombieFindGoldenBrain** - only for zombie dragons with no targets or city target: if any golden-brain building exists, heads for the nearest one (lands if within land-attack range, else tile target within land-attack range of it).

### 5.28 UFO

- **UFOBeam(enabled)** - disabled: hides beam. Enabled: starts the beam animation; at animation frame 4 damages every tile within radius 4 of the UFO with the UFO attack terraform; RepeatStep until the animation ends, then hides it.
- **UFOCheckAttackCity** - if a city is marked and the UFO stands on a usable building (and monsters are not peaceful): force ufo_attack; else if attacks remain: RestartTask; else Continue.
- **UFOCheckExplore** - if exploring ticks remain: decrement; over a city zone: mark that city as target with random 3-9 attacks and force ufo_fly; else keep ufo_explore going (RestartTask / force ufo_explore). Else Continue.
- **UFOExplore** - sets exploring ticks to random 3-6.
- **UFOFindTarget** - if attacks remain on a live city with buildings: target = random tile in a random building's zone and spend one attack; if city is gone/empty: clear. With no target: random tile within 100 that is ground (retry 5 times; else nearest of 8 random ground tiles). Continue.
- **UFOSelectTarget** - from its aggro list picks the closest living actor; if it belongs to a city and none is marked, marks that city with 3-9 attacks; tile target = target's tile; force ufo_chase (no clean). Clears aggro list.

### 5.29 God-finger (auto-sculpting AI)

- **FingerCheckCanDraw** - verifies the god-finger actor stands inside its set of target tiles (else Stop).
- **FingerDrawToTileTarget** - picks a random brush (circle/special shapes sized 10%-33% of the target tile count) and a god power appropriate to the surrounding terrain (power chosen with weights from neighbouring tile/biome types, separate lists for drawing over water and over ground); moves along a curved path (Bezier through 1-4 random waypoints within 25 tiles) to the target; waits 0.5 s. Stop if the path fails.
- **FingerFindCloseTile** - random target tile (same region as the finger if it is already inside the target set); Stop if no target tiles.
- **FingerFindRandomTile(range=75)** - random tile within range of the finger.
- **FingerFindTarget** - if no target tile set exists, builds one: 95% (with >20 pit tiles) a patch of up to 1200 tiles of the nearest pit/ocean type (65% tile sampling) to "fill"; else, weighted by how much non-ground world exists, ocean-island patches (reuse current island with 60%) or ground patches (65% tile sampling); picks one target tile. (Exact later branches: unclear; this is the god-finger auto-sculpting AI, not core creature behaviour.)
- **FingerGoToCircleTarget(min,max)** - picks radius R in [min,max]; builds 4 candidate arcs (left/right/top/bottom half-circle waypoint triples) discarding arcs with off-map points; follows a curved path through a random arc and back to the start (circular flourish); Stop if no arc valid.
- **FingerGoTowardsTileTarget(r=25)** - curved path from current tile through 2 random waypoints near the start and 2 near the target (each within r), ending near the target; Stop if the path fails.
- **FingerSetFlying(flag,height)** - sets flying; target flight height = given or random 5-13 when flying, 0.3 when landed.
- **FingerWaitForFlying** - RepeatStep until the finger's height reached its target height.

### 5.30 Misc

- **ActiveCrabDangerCheck** - if hungry: continue. If an actor of a different species is within the surrounding chunk: cancel all behaviour and switch actor job to crab_burrow. Continue.
- **ActorAddExperience(min,max)** - adds random integer xp in [min,max] inclusive. Continue.

---

## 6. Actor jobs and citizen jobs

### 6.1 Actor job library (standing routines; a job is a cyclic list of task ids)
A job loops: after its last entry the index wraps to the first. Entries with conditions run only if all conditions evaluate to their expected value at the moment the entry is reached; otherwise the empty task "nothing" runs instead (skipping that entry for this cycle). "random" jobs visit entries in a shuffled order (see 3.3.1 quirk).

Civilian/citizen routines (a citizen job id is also an actor job id):
| job id | task cycle |
|---|---|
| unit_citizen | make_decision > check_city_destroyed |
| decision | make_decision (default job of every actor, all animals, sapient children, kingdom-less sapients and no-city civ members) |
| attacker | make_decision (warriors with a city) |
| fireman | put_out_fire > end_job |
| hunter | random_move > do_hunting > end_job |
| builder | try_build_building > end_job |
| cleaner | cleaning > end_job |
| manure_cleaner | manure_cleaning > end_job |
| road_builder | build_road > end_job |
| woodcutter | chop_trees > end_job |
| miner | mine > end_job |
| miner_deposit | mine_deposit > end_job |
| gatherer_bushes | collect_fruits > end_job |
| gatherer_herbs | collect_herbs > end_job |
| gatherer_honey | collect_honey > end_job |
| farmer | farmer_make_field > farmer_plant_crops > farmer_harvest > farmer_fertilize_crops > farmer_random_move > check_end_job > check_city_destroyed |

end_job clears the job AND the citizen-job slot, so the next idle tick falls back to the default job (unit_citizen or attacker, whose make_decision restarts the decision loop). check_end_job (farmer only) ends the job if more citizens hold this job than the city currently wants.

Creature/mob routines:
| job id | task cycle / notes |
|---|---|
| egg | wait10 (1-10 s) > end_job (loops; eggs never decide) |
| random_move | random_move |
| random_swim | random_swim |
| crab | swim_to_island > crab_danger_check > random_move > crab_danger_check > crab_eat > crab_danger_check (no entry point found that assigns it; the crab species uses the default decision job - unclear) |
| crab_burrow | crab_burrow (assigned dynamically by crab_danger_check) |
| skeleton_job | skeleton_move > make_decision |
| ant_black | ant_black_island > ant_black_sand |
| ant_red / ant_blue / ant_green | ant_red_move / ant_blue_move / ant_green_move |
| worm_job | worm_move |
| sandspider_job | sandspider_move |
| printer_job | print_start > print_step |
| ufo_job | ufo_idle > ufo_fly > ufo_explore |
| godfinger_job (random) | godfinger_move x2, godfinger_find_target, godfinger_random_fun_move x2, godfinger_circle_move x2, godfinger_circle_move_big x2, godfinger_circle_move_small x2 (11 entries; the duplicates double their share) |
| dragon_job (random) | see below |

dragon_job entries and conditions (all conditions must be true unless marked NOT):
- dragon_slide: flying; peaceful-monsters law off; dragon has aggro targets; can slide (has slide targets and did not just slide; the "just slid" flag is consumed by this check).
- dragon_fly: flying.
- dragon_land: flying; can land (standing over ground, or lava if it does not die in lava) and not on its last-landed tile and not "just flew up" (flag consumed).
- dragon_sleep: NOT flying; sleepiness counter > 10; NOT has targets; NOT has a city target; no other unit on its tile.
- dragon_wakeup: NOT flying; currently in task dragon_sleep or dragon_wakeup.
- dragon_land_attack: NOT flying; peaceful law off; land-attacks since takeoff < 2 AND (a marked city with attacks left is under it, or targets are within land-attack range, or (zombie dragon) a golden-brain building is within range).
- dragon_idle: NOT flying; NOT has targets; NOT has a city target.
- dragon_up: NOT flying; "just landed" counter is 0 (the counter is decremented on every check, starting at 2 after a landing); NOT can-land-attack.

### 6.2 Which job an actor gets (recap of 3.7)
Default-job rules by actor type are in 3.7. A citizen job assignment (6.3) replaces the actor's job immediately with the job of the same id (the running task is not cleared; the new job's first entry starts when the current task finishes).

### 6.3 Citizen jobs (city labour allocation)

Assets (CitizenJobAsset): id, priority (high-priority class), priority_no_food (class used only when the city has no food), common_job (only common jobs are assignable by the allocator; "attacker" is not common), ok_for_king, ok_for_leader (false for farmer, miner, miner_deposit), only_leaders (checked, but no job sets it), should_be_assigned (condition; only fireman has one: the actor must not be immune to fire), default actor job (= its own id).
Lists built at load: HIGH = common jobs with priority > 0 in registration order: fireman (10), builder (9). HIGH_FOOD = common jobs with priority_no_food > 0: gatherer_bushes, gatherer_herbs, gatherer_honey (all 10). NORMAL = common jobs with priority 0, registration order: gatherer_bushes, gatherer_herbs, gatherer_honey, farmer, hunter, woodcutter, miner, miner_deposit, road_builder, cleaner, manure_cleaner. (Gatherers are in both HIGH_FOOD and NORMAL.)

#### 6.3.1 Per-city slot computation (runs on the city's own AI loop)
The city runs its own cycle of tasks (check_army, do_checks, border_shrink, produce_boat, supply_kingdom_cities, produce_resources, check_farms, each separated by wait1 = random 0-1 s); "do_checks" includes the citizen-task step, so slots are recomputed roughly every 4-6 seconds per city. Each recompute:
1. Clear the allocated-slots table. Recount "occupied" per job by counting city units whose citizen job is set.
2. Count available tasks (CityTasksData): fires (burning tiles and buildings in own and neighbouring unowned zones), trees (only if the city stockpile has room for wood), minerals, ruins, bushes/hives (buildings with collectable resources, only if stock room for berries/honey), plants (only if room for herbs), poops (only if room for fertilizer), farm field tiles / total fields / ripe wheat, road-to-build flag (1 if any road tile pending).
3. Let citizens_left = number of adults (population_adults). Derived limits:
   - warriors wanted only if the civ-army world law is on AND adults > 15 (food check always true): max warriors = floor(adults x army multiplier), where multiplier = species base army multiplier + leader's "army" stat + leader's warfare x 2 / 100.
   - max herb/berry/honey collectors: city food total > 100 -> 1; > 60 -> 4; > 40 -> 5; <= 20 -> 10; otherwise (21..40) 7.
   - max woodcutters: 1 if the city has > 15 wood else 3.
   - max firemen: the fire count; if the city is not "under danger fire" (leader is immune, or no fires) and there are fires, it is set to 2 when the city has <= 5 units else 3.
4. Repeat up to (2 x adults + 1) passes the following ordered attempts, each of which adds `add` slots to a job when (current slots < task availability cap) and (current slots < job cap if one exists), clamped to the citizens still unassigned:
   fireman (add = maxFires, cap = maxFires); builder (add 1, cap 3, only if the city has a building waiting to be built); if the city has a storage building: gatherer_bushes, gatherer_herbs, gatherer_honey (add 1; caps = number of such tasks; job cap = max collectors); if a windmill exists: farmer (add 1, cap = number of planned farm places); if the era lets crops grow and a windmill exists: farmer again (cap = total field tiles); with storage: miner_deposit (cap = minerals), woodcutter (cap = trees, job cap = max woodcutters); with a mine building: miner (add 1, cap 5); if warriors wanted: attacker (add 2, cap = max warriors); road_builder (add 1, cap = 1 if road pending, job cap 1); cleaner (add 1, cap = ruins, job cap 1); with storage: hunter (add 1, cap 1) and manure_cleaner (add 1, cap = poops, job cap 3).
   Because it loops in passes, slots are handed out round-robin across job types until citizens run out or every cap is met.
5. The attacker slot count becomes the city's "warrior slots" (army size limit).

#### 6.3.2 Assigning a job to one citizen (decision find_city_job -> task find_city_job)
The `find_city_job` decision (L3, weight 2 / 1 hungry / 0.3 starving, cooldown 50 s; launch check in section 2.7) runs the city's assign step for that actor:
1. **Warrior conversion** (checked first): if the city is not being captured, its warrior timer has run out, the actor's profession is plain "unit", the city has more than 10 gold, enough food for an army (always true) and the actor may be conscripted (army not full = warriors < warrior slots; actor is not a baby; culture traits conscription_male_only / conscription_female_only exclude the other sex) -> the actor becomes a warrior (gets a weapon from city stock if it has none, city warrior count +1). The warrior timer is then set to 15 s minus (leader warfare stat / 2), floored at 1 s, halved if the city has barracks; it counts down in simulated seconds. A warrior that no longer fits (army over its limit) loses the profession and the timer is set to 30 s.
2. Else try the HIGH list in order (fireman, builder).
3. Else, only if the city has no food at all, try HIGH_FOOD in order.
4. Else rotate through NORMAL starting after the job last tried for this city (the pointer advances before each test, wraps); skip king-forbidden / leader-forbidden jobs for kings / city leaders; take the first job that passes.
A job "passes" if: the job's should_be_assigned condition (if any) is true AND the city has a free slot for it (allocated > 0 and occupied < allocated). Taking a job increments occupied and sets the actor's citizen job (and actor job, 6.1).
Nothing found: the actor simply keeps its current routine and will retry after the 50 s cooldown.

#### 6.3.3 Releasing
A job ends when its job cycle runs end_job, when a check action Stops with end-job (CheckNeeds when the citizen is starving and the city has food; CheckCityDestroyed), when the actor's behaviours are cancelled (cancel-all clears job and citizen job), or when combat starts (the "fighting" task clears the job). The city's slot table is recomputed regardless, so oversubscribed jobs shed workers through check_end_job (farmer) or naturally when each task ends.

#### 6.3.4 Related status trigger
The "starving" status (duration 60 s, action every 5 s): if the actor has a city, is not fighting and not in an eating task: when the city has food suitable for its diet it forces task try_to_eat_city_food; otherwise it cancels all current behaviour. Hunger therefore overrides jobs.

---

## 7. Herds, families, movement targets, island checks, re-decision cadence

### 7.1 Herd / family following (animals)
- A species opts in with a "social structure" setting: a group noun, a family size limit (observed values 4 to 200, default 20; civilians use a limit of 10), whether a family is created when a creature spawns, and a "follow herd" flag (true for every animal species that sets a social structure; false for the sapient "family" structure). Decisions flagged only_herd need that flag. All herd decisions additionally refuse sapient actors.
- A family has a species and a size. "Full" means members > limit (strictly greater). The **alpha** is the living member with the earliest creation time (the oldest); it is re-evaluated whenever a follower checks (when the cached alpha dies or leaves). Becoming alpha gives a "become alpha" happiness event. Founders are the one or two actors that created the family (used by children to find a parent).
- Joining: decision family_group_join_or_new_herd (no family; L3, weight 0.3, cooldown 60): first tries to join the nearest same-species family that is not full, on the same island, found among units within the 4-chunk neighbourhood and a tile radius = species family-spawn radius (default 30 tiles); if none, looks for a same-species, same-subspecies, family-less unit within that radius on the same island and forms a new family with it; otherwise nothing happens.
- Dissolving: family_check_existence (L3, weight 2, cooldown 60) fires when the family has <= 1 member and removes the actor from it.
- Leaving: family_group_leave (L1, weight 0.5, cooldown 20; adult, safe) fires only when the family is full and the actor is not alpha; actor leaves (it will re-join or found another via the join decision later).
- Alpha movement: family_alpha_move (L2, weight 0.8, cooldown 200). Herbivores go to a random tile in the region of the nearest plant building (looked up within 3 chunks, same island; a plant closer than ~5 tiles is taken immediately); carnivores go to the region of the nearest meat-source actor of another species and family (within 3 chunks, same island; closer than ~2.2 tiles is taken immediately) else a random tile on their island. If nothing is found the task is replaced by random_move. Other diets: no target (random_move).
- Follower movement: family_group_follow (L2, weight 0.7, cooldown 5). The follower targets the alpha (must be on the same island and within 400 distance units) and walks to a random tile in the alpha's region (so it clusters loosely instead of stacking on the same tile). Because the cooldown is 5 s and the task takes a few seconds, followers refresh their destination roughly every 5-10 s.
- Children: child_follow_parent (L2, weight 0.2, cooldown 10): target = a random founder of the family (skipped if the child is inside its own city border but the parent is not); go to a random tile in the parent's region; 10% chance to repeat the whole task immediately.
- Civilians use families only for housing (BehFindHouse shares a relative's home) and the 'family' founders/lovers logic of reproduction; they do not follow an alpha.
- There is no leader election beyond "oldest member"; nothing else coordinates herd members.

### 7.2 How movement targets are chosen (summary of the finder actions)
- **Idle wander (default)**: with 65% a random tile in the current region; otherwise 50% a random tile in a random neighbouring region, else (50%) the current region again. Regions are small cells (roughly a chunk or smaller), so trips are short (a few to ~20 tiles). Used by random_move (decision random_move, weight 0.2, L0), warriors, farmers (random farm tile, same pattern), fleeing uses 5 hops across neighbouring regions instead ("far tile").
- **Hop / jitter**: adjacent walkable tile on the same island (random_fun_move x6 hops, confused x6, short moves).
- **Animal wander near druids/necromancers**: for species-specific tasks, 80% (druid) / 100% (necromancer, skeletons) of the time target a tile in the region of the nearest actor of that species within the chunk surroundings.
- **Targets by need**: food (nearest valid prey / building type / tile type), house (door front), storage, bonfire, workplace buildings (random within city zones, same island, unclaimed target tiles), zones to claim, danger zones, border tiles for army idling, attack-zone tiles for armies, captain's path end for soldiers.
- **Building search**: city actors look inside their city zones (flora, trees, minerals, fruit, hives, poop), skipping buildings already targeted by someone else (tile "targeted" mark), not on another island, trees only if choppable and having resources; non-city seekers use a chunk-wide search (random chunk order; prefers same island).
- **Actor-relative**: nearest tile around the actor target on the same island ("nearby tile"), the target's tile, or a random tile in the target's region.
- Every target-finding action returns Stop when nothing is found, which ends the task; the next AI tick picks the next job step, usually make_decision, so a failed search just causes a new decision.

### 7.3 Walking and pathfinding behaviour the AI depends on
- GoToTileTarget asks the pathfinder for a route; it returns Stop if no route exists. Flyers always succeed with a straight line. Boats refuse targets that are not valid boat tiles.
- Route parameters: ground creatures path over land (not over water unless the action allows it, or the actor is already in liquid); water creatures path through ocean (and over ground only if flagged "force land creature" or when currently out of water); fire-immune actors may cross fire and lava; burning actors may cross fire; block tiles only when the action asks (worm/ant moves, move_from_block).
- If start and target are on different islands the route is only attempted when the islands are "connected" (checked from the smaller island) and the target tile type is passable for the actor; otherwise the move fails.
- While walking, the AI is paused (3.4 step 6); on arrival the next action runs. Walk speed = actor speed x task speed multiplier (2 for fleeing, 0.8 for army leaders, ...).
- When a go-to-actor action is used with "calibrate", the mover re-aims at a moving target if it has moved more than the check distance (2 tiles by default).
- Actors being thrown/falling or hovering (height != 0) skip AI until grounded.

### 7.4 Island and stability checks
- **Stable place** (isInStablePlace): a land creature is stable unless it stands in ocean, or on lava if it dies in lava; a water creature is stable only if it is NOT on ground (unless it is a "force land creature"). Decisions swim_to_island and move_to_water (both L4 critical, weight 4, cooldown 1, non-unique "others" list) fire when the actor is not stable; their task goes to the nearest connected island good for the actor (GoToStablePlace) then swims/walks there. Being critical, they pre-empt everything.
- **Good island for an actor** (isGoodIslandForActor): not a "block" island; ocean islands only for water creatures; ground islands not for water creatures; lava only for creatures that survive lava; more than 5 tiles; and if fewer than 100 tiles, at least as many tiles as actors on it (overcrowded tiny islands are bad).
- check_if_stuck_on_small_land (L3, weight 3, cooldown 90, others list): fires when the island is not good; task: re-check the island, then target the nearest ocean tile along the island's border regions and walk/swim there. From the water the actor is "not stable", so the critical swim_to_island decision then carries it to a good island.
- try_to_return_to_home_city (L2, weight 3, cooldown 15, adults with city): fires when outside own city borders AND not on the city's island; the task requests a boat taxi. Warriors have check_warrior_transport (L2, weight 2, cooldown 6) for the same with attack targets.
- Many decisions require "same island" for their targets (food, partners, followers, army captain, danger zones); this is checked with a simple region->island identity comparison.
- Regions/islands are recomputed by the world; creatures never need to recompute them themselves.

### 7.5 How often an actor re-decides
Decisions are not on a global timer. The flow per actor is:
1. The actor's job reaches its make_decision entry (decision/unit_citizen/attacker/skeleton jobs) - this happens whenever the previous task finishes.
2. One tick later the decision is evaluated (section 1) and the chosen task replaces the empty task slot.
3. The task plays out (typically 2-30 s: a wander is FindRandomTile + walk + 0-1 s wait, a nap 20-100 s, an eat ~10 s, a work trip tens of seconds, army waits 10-20 s).
4. When the task ends (all actions done, or any action Stops) the job cycle continues (usually straight to make_decision again; for citizens check_city_destroyed runs in between each loop).
So the effective decision rate is "once per completed task"; very short tasks (confused, hops, random_move) re-decide within a few seconds; long tasks (sleep, work trips) rarely. Cooldowns (section 2) then stop the same decision from repeating too quickly: e.g. random_move (cooldown 1) can repeat, while sleep decisions (cooldown 30-200) cannot.
Other things that re-route an actor outside this loop (all clear the current task):
- Combat: the target check (3.4 step 4/5) can set task "fighting" (job cleared) at any tick unless the task ignores fights; after the fight the job restarts from its default.
- Scheduled interrupts: on being surprised (emotional species only) the actor stops, looks at the noise tile, waits ~1-3 s and runs investigate_curiosity next (60% chance to investigate, +30% for curious subspecies); additionally 30% (+30% timid subspecies) it cancels everything and flees with run_away next. A "just ate" actor that is surprised poops.
- Starving status (every 5 s): forces eating city food (section 6.3.4).
- Stats recalculation pending: the decision step is replaced by the "wait" task.
- Stun: cancels all behaviour and waits 5 s (+0-10%).
- Social/breeding requests: idle-type tasks flagged S/R can be hijacked by another actor starting a conversation / mating handshake; the interrupted actor is forced into the reply task with its job cleared.
- Being unconscious, possessed or frozen pauses the AI entirely.
- Natural death is checked only when the actor is at action index 0 (between tasks), so lives end at task boundaries.
- Citizens' job-slot recomputation (6.3.1) and warrior timers run on city time, independent of individual actors.

### 7.6 Quick checklist for a re-implementation
1. Per-tick AI gate: wait timer, force/fall, combat checks, verifier, movement pause, then (optional decision) and one action step.
2. Jobs as cyclic task lists; tasks as action lists with the 8 result codes; make_decision as an ordinary task that ends the task.
3. Utility selection: candidate lists by actor class + per-actor granted lists; per-actor cooldown/disable arrays indexed by decision index; coin 0.8 for priority mode (forced by any valid layer-4 candidate); chance = exp(weight); roulette-wheel pick.
4. City-level slot allocator feeding citizen jobs; round-robin NORMAL list pointer per city.
5. Region-based wander picker (65/35 own/neighbour region).
6. Family: oldest member = alpha; followers pick random tile in alpha's region every ~5 s.
