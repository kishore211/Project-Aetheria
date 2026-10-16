# Social Meta Identities - Behaviour Spec (clean-room)

Scope: culture, religion, language, clan, family, books, name generation, communication.
Conventions: random integer ranges quoted as [a,b) are upper-exclusive as in the source. "chance p" = independent uniform roll succeeds with probability p. "pot" = weighted-by-repetition list, one uniform pick (an entry repeated n times has weight n). Ids (trait ids, status ids, happiness ids) are given verbatim because they are data keys. "Unclear" is flagged where the source is ambiguous. Time: the world clock counts in years/months; "year" below is a world year.

---

## 1. Shared meta machinery

### 1.1 What a "meta object" is
A meta object is a persistent group identity that actors point at (each actor holds at most one reference per kind: culture, religion, language, clan, family; also subspecies, city, kingdom, army, plot which are other areas). Every meta object has:
- a unique integer id (taken from a per-kind monotonically increasing world counter; never reused for new objects), a name, a created timestamp, a died timestamp (0 = alive), a "favorite" flag;
- a colour index into that kind's colour library;
- statistics: total_deaths, total_births, total_kills, deaths split by cause (natural/age, hunger, eaten, plague, poison, infection, tumor, acid, fire, divine, weapon, gravity, drowning, water, explosion, other), metamorphosis count, evolutions count, and `renown` (an integer score);
- a list of member actors (`units`), rebuilt lazily (see 1.4);
- for trait-bearing kinds (culture, religion, language, clan, subspecies, kingdom, etc.): a set of traits, plus derived merged stats/hooks.

### 1.2 Creation
1. Manager takes a fresh id from the world counter, stamps created_time = current world time, obtains an object (recycled instance if one is in the dead pool, otherwise new), registers it in the manager's set.
2. Kind-specific `create` fills creator provenance (see each kind), then runs "generate new meta object": picks a colour and a banner (see 1.3), then if default traits are requested and the founder's species defines default traits for that kind, loads them (see 1.5).
3. Kind managers then optionally add biome traits and random traits (kind-specific; culture does both, others see their sections).

### 1.3 Colour and banner selection
- Colour: from the kind's colour list, collect colours not currently used by any live object of the kind. Prefer the sub-set flagged "favorite" (pick uniformly); if none free, pick uniformly from non-favorite free colours; if no free colours at all, pick uniformly from the whole list. Colour can later be changed by the player; changing to the same colour is a no-op.
- Banner: a background/decor index and an icon/element index are each chosen via the kind's banner library's "new index" call (random pick; no uniqueness guarantee known). Unclear: exact selection method inside the banner library was not read.

### 1.4 Membership bookkeeping (dirty/rebuild model)
- Actors call set-culture/set-religion/etc. When an actor's reference changes, the OLD object and the NEW object are both marked "units dirty" and the manager's global dirty flag is set; the actor's stats are marked dirty so aggregated stats recompute.
- Once per update (parallel step), if the manager is dirty: every object flagged dirty clears its unit list, then the manager iterates all living actors once and appends each actor to the list of its object if that object is flagged dirty; then dirty flags clear. So `units` is only guaranteed exact right after this rebuild.
- Culture/religion/language/clan/family also keep derived lists (cities, kingdoms) via separate dirty flags (culture: kingdoms-with-this-culture and cities-with-this-culture lists rebuilt from world city/kingdom lists).
- A newly created object is flagged "preserve alive" so it survives until its first unit-list rebuild (otherwise it would be removed for having zero members before members are attached).
- `getMostUsedMeta(unit list)`: counts the meta object of each unit in the list and returns the one with the highest count (ties: whichever the sort leaves first; unstable/unclear). Used by cities/kingdoms to derive their dominant culture/religion/language.

### 1.5 Traits on meta objects
- A meta object holds a set of trait assets. Setting traits from a list (load / defaults): the list is processed in random order; a trait is added only if it exists and does not conflict with an already-held opposite trait. Hence when a saved/default list contains mutually exclusive traits, which one survives is random.
- `addTrait(trait, removeOpposites)`: no-op false if already held. If removeOpposites is true, all opposite traits are removed first. If an opposite is still held, fails. Else adds and recalculates.
- `copyTraits(list)` adds each trait that has no held opposite (used when a culture/religion/language splits). `cloneTraits` clears first then copies.
- Opposites are declared symmetric per trait; the tables below list them.
- On any trait add/remove the object recomputes its merged state: sum of every trait's base stats and "meta stats/tags", chained death/growth/birth/attack/get-hit hooks, special-effect trait list, merged decisions, merged combat actions and merged spells; then every member actor is flagged for stat recalculation. Culture additionally recalculates preferred weapons and town-plan traits.
- Random trait gift (`addRandomTrait` helper, used on creation by culture/religion/language/clan): amount N = uniform integer 1 or 2 (the source draws from [1,3) with exclusive upper bound); if the world law "glitched noosphere" is on, N is uniform in {3,4,5}. N times: pick a trait uniformly from the kind's "random spawn pot" (every trait with spawn_random_trait_allowed appears in the pot `spawn_random_rate` times; default rate 5, so by default all equally likely) and, if the trait is currently "available" (unlocked: either achievement unlocked, or discovered/explored, or cheats/debug unlock; traits with neither special effect nor tags and normal rarity count as always available), add it with remove-opposites=true. Repeats can pick the same trait (no-op the second time).
- Biome traits: `addRandomTraitFromBiome`: only if the founder's tile is a biome tile and the biome has a list for that kind. Let L = list length. Repeat L times: with chance 0.5 pick a random entry and add it (remove opposites = true). (So expected L/2 additions.) `addTraitFromBiome` (not random) adds all entries; used elsewhere (subspecies).
- Biome seed tables (kind: trait ids offered by biome). These are the lists used by the random-biome rule above:
  - Culture: celestial {serenity_now, ancestors_knowledge}; permafrost {attentive_readers, ancestors_knowledge}; swamp {bow_lovers}; wasteland {xenophobic, solitude_seekers, legacy_keepers}; singularity {ancestors_knowledge, gossip_lovers}; enchanted {training_potential, diplomatic_ascension, legacy_keepers}; jungle {spear_lovers, city_layout_raindrops}; paradox {reading_lovers, youth_reverence, ancestors_knowledge, elder_reverence, expansionists}; mushroom {animal_whisperers, pep_talks}; infernal {happiness_from_war, xenophobic}; maple {xenophiles}; flower {matriarchy, gossip_lovers}; lemon {fast_learners}; corrupted {happiness_from_war, xenophobic, ethnocentric_guard}; garlic {attentive_readers}; candy {tiny_legends}; desert {solitude_seekers, gossip_lovers}; grass {pep_talks, youth_reverence, gossip_lovers}; crystal {tiny_legends, armorsmith_mastery, weaponsmith_mastery}; birch {axe_lovers, diplomatic_ascension}; clover {elder_reverence}; savanna {sword_lovers}; rocklands {statue_lovers, training_potential, city_layout_stone_garden}.
  - Clan / Language / Religion biome tables: see their sections.
- Trait "rarity" is derived at load: achievement-locked = legendary; if it has exactly one of {runtime hooks, decisions, spells, combat actions, tags, plot} = rare; two or more = epic; otherwise normal/common. Rare+ traits need to be "explored" (discovered by the player) before they are "available" for random gifting; normal ones don't. Unclear: precise discovery rules (progress-save based) - treat as: legendary traits only via achievement; others always available in an original game.

### 1.6 Death / removal
- Each update (skipped on alternate "meta skip" ticks) every manager's check-dead pass collects objects that are "ready for removal" and removes them.
- Ready for removal = not flagged preserve-alive AND zero member units. Culture, religion and language additionally require: the object owns no books. (Clan/family have their own extra rules, see sections.)
- Removal: counted in global "forgotten" stats (culture/religion/language have dedicated counters), object marked dead (died_time stamped with current time once), removed from manager lookup, scheduled for dispose; Dispose clears lists, traits, delegates, deletes DB history rows, and the instance goes into a recycle pool.
- Yearly: each object's "last year stats" reset hook runs; history data (per-object stat rows keyed by year) is written to a history store.
- Death stat increment: when a member dies the object increments total_deaths and, only for kinds that track death types, the matching per-cause counter (cause enum mapped one-to-one; None/Other/ash-fever go to "other"). Births increment total_births, kills total_kills, only when the object is alive. Culture does not support birth counting (throws).

### 1.7 Renown
- `addRenown(n)`: integer add. `addRenown(n, p)`: adds floor(n*p). Renown is used for ranking lists and (cultures: +1 per conversion, languages/religions likewise via countConversion) and for succession "fame" sorting of actors. Per-kind sources are listed in the kind sections.

### 1.8 Spreading by "convert same species around unit"
When a new object is founded by an actor, or on plot completion: every actor in the 3x3 block of map chunks centred on the founder (chunk range 1) that is the same species as the founder and either has no city or is in the founder's city is assigned to the new object. Normal variant: only actors that currently lack that meta. "Force" variant: overwrites existing. For languages the join goes through the language-join path (stat counters); for culture/religion the plain setter.

### 1.9 Conversion gating (all of culture, religion, language)
Common preconditions for an actor to convert via talking/books:
- culture/religion: actor's subspecies must have "advanced memory"; language: "advanced communication".
- Already holding the same object: no change.
- If the actor's current culture has trait `true_roots`: refuse (applies to religion, culture and language conversions - it protects the actor from changing any of the three).
- On success: set object; countConversion on the new object (culture: +1 renown only if the actor already had a culture; religion: always count; language: counts a "new speaker" if actor had no language, otherwise a "conversion"; the old language's speakers-lost counter increments); a conversion visual effect plays.

### 1.10 Social-meta splitting plots (new / divide)
The meta-creation plots are actor decisions (plot system is another area); the conditions that define meta identity evolution:
- new_culture: actor lacks culture, subspecies has advanced memory, intelligence >= 2, level >= 1, free; on completion creates culture with default traits, sets it on actor, force-converts same-species chunk neighbours.
- new_language: actor lacks language, advanced communication, intelligence >= 3, level >= 1; creates language with default traits, joins, force-converts neighbours.
- new_religion: actor lacks religion, has culture and language, advanced memory, its culture has >= 50 members, intelligence >= 8, level >= 5, costs 25 money; creates religion with default traits, sets it, force-converts neighbours.
- culture_divide / religion_schism / language_divergence: actor must be in a city, have culture+language(+religion for religion/language plots), kingdom has >1 city, the meta must be the kingdom's own meta, have >= 1000 members and age >= 500 years (world constants), its culture must not have `legacy_keepers`, meta's creator kingdom != actor's kingdom, meta's creator clan != actor's clan, actor "wants to split" (has trait `ambitious` or status `inspired`, AND NOT being a civ-kingdom member whose kingdom's main subspecies equals the actor's own subspecies), subspecies capability. Culture divide: levels 5, int 6, costs 20 money; religion schism: lvl 5, int 6, 15 money; language divergence: lvl 5, int 8, 15 money. Result: new object with NO default traits that copies all traits of the parent; culture additionally clones and mutates the parent's naming data (see 8.6); the plotting actor and chunk neighbours (force) move to the child.
- Actor creation of a civ (found city): the founder gets a clan (if none), a language (if none and advanced communication) and a culture (if none and advanced memory), each with default traits, and chunk neighbours are converted (non-forced). The culture is renamed to the city's name.
- Babies inherit (see 6/5).

---

## 2. Culture

### 2.1 Identity and data
A culture records: creator actor (id, name, species id, subspecies, city, kingdom, clan - snapshot ids and names at founding), `original species` (the species of the founder; determines which default traits and name sets apply), name, optional parent culture id (set on divide), saved trait list, a name-template-set id, per-name-category "onomastics" data (see section 8), books it owns, `cities` and `kingdoms` lists (derived), renown, colour, banner.
- Name: generated at founding from the founder actor's culture-name generator (section 8); when founded as part of a new civ, the name is overwritten by the city's name.
- name_template_set: picked uniformly from the founder species' list of name-set ids (may be empty).
- Species link: the culture's species is stored at creation and never changes; default traits come from that species.
- Culture base stats (sum of traits' base stats, including tags) are merged into every member actor's stats; culture decisions and hooks are added to member actors' decision lists/hooks. Max level constant 5 exists (unused in the logic read; treat as UI rank cap).

### 2.2 Creation parameters
`newCulture(founder, addDefaultTraits)`: create object (section 1.2) -> if addDefaultTraits, load the species' default culture trait list (random order, conflicts resolved per 1.5) -> add biome traits from the founder's tile (rule in 1.5: L tries at 0.5 each) -> add the random-gift traits (1 or 2, or 3-5 under the glitched-noosphere law). For divides the call passes addDefaultTraits=false but still gets biome+random traits; then the parent's traits are copied in via copyTraits (opposites of already-held traits are skipped, so traits gifted randomly can block copying their opposites).

### 2.3 Behaviour hooks
- Removal: needs zero members AND zero books.
- Updating "dirty" (when culture traits change): every city of the culture is flagged status-dirty (recomputes housing limits etc).
- `isPossibleToConvertToOtherMeta` = does NOT have `true_roots`.
- Preferred weapons: union of weapon-subtypes and specific weapon assets from every held weapon/craft trait; recalculated on trait change. Used by crafting (2.5).
- Town plan: held traits flagged "town layout plan" each provide a zone predicate; a building zone is allowed only if ALL held plan predicates return true (see 2.6). Culture has "special town plans" if any held.

### 2.4 Conversions from talking and books
See sections 9 (talking) and 7 (books). Culture-specific: a culture's conversion adds renown +1 to the culture only when the converted actor already had some culture.

### 2.5 Trait catalogue (every culture trait)
Format: id [group, priority where non-zero] (opposites) {numeric value} - effect. "Random" = eligible in the random trait pot (default rate 5 each = equal weights) unless noted. Achievement-locked = only available if player achievement unlocked.

Groups (UI categories only; they carry no mechanics): harmony, architecture, town_plan, kingdom, buildings, succession, knowledge, warfare, weapons, craft, happiness, worldview, miscellaneous, special.

Kingdom/world:
- roads [architecture]: cities of this culture may build roads. While the city has >2 buildings, each build tick picks a random city building and makes roads to it. Also: world road decay ignores zones owned by a city whose culture has roads; in any other zone decay happens (each decay tick picks a random zone; unless that zone is a roads-culture city zone, with chance 0.5 the zone is skipped, otherwise each tile in random order that is a road tile with chance 0.5 loses road-ness one decay step).
- expansionists [kingdom, prio 100]: when an actor claims a zone for its city, it also claims all empty neighbouring zones (8-neighbourhood) that are valid to claim, unless the zone it claimed was taken from another city.
- tiny_legends [kingdom, prio 99] (opposite youth_reverence): children can work (treated as work-capable regardless of age).
- conscription_female_only [kingdom, 90] (opp conscription_male_only): males cannot be made warriors by a city of this culture (babies never are anyway).
- conscription_male_only [kingdom, 89] (opp female_only): females cannot be made warriors.
- join_or_die [worldview, prio 100]: attack hook on holders (via actor-level culture trait on the attacker's culture - the hook is attached to the culture trait's attack-target delegate and executes when a member attacks). Conditions, all required: attacker is a civ-kingdom member; target is an actor, alive, in a different kingdom, is a civ-kingdom member or a nomad, is sapient, does NOT have tag `strong_mind`, has health ratio <= 0.3; then chance 0.3: target leaves its previous faction (army/city/king role), joins the attacker's kingdom, both clear attack targets, target gets a random force push; the attack is consumed. The hook is merged into every member actor's attack-target hooks (member actors combine hooks from subspecies, clan, language, culture, religion in that order).
- legacy_keepers [miscellaneous]: blocks the culture-divide, religion-schism and language-divergence plots for any actor holding this culture (checked on the actor's culture, including for religion and language plots).
- true_roots [miscellaneous]: members can never convert to another culture, religion or language (1.9).
- animal_whisperers [miscellaneous]: when a civ-kingdom actor looks for a chat partner, nearby actors from "mob" kingdoms (animals) become valid partners (without this trait they are excluded).
- ancestors_knowledge [knowledge; achievement-gated: `achievementTraitExplorerCulture`]: when a baby is born, for EACH parent whose culture has the trait: find parent's highest attribute among {intelligence, warfare, diplomacy, stewardship} (strictly greater wins; compared in that order so the first max wins ties; values must be > 0 or no attribute is chosen), then set the baby's value of that attribute to floor(parent value)*0.5 + 1 (overwrites; if both parents qualify the second overwrites on the same attribute).
Buildings:
- statue_lovers [buildings] {4}: city limit of statue-type buildings +4.
- tower_lovers [buildings] {4}: limit of watch-tower-type buildings +4 (additional leader bonus_towers stat is independent).
- buildings_spread [town_plan, prio 100]: when placing buildings, no "closest to city centre" preference; first valid zone in random order wins (otherwise the valid tile closest to city centre by squared distance wins).
- city_layout_tile_wobbly_pattern [town_plan, 98] (opp grand_arrangement, moonsteps): build on zone centre tile; with chance 0.6 try a random one of its 8 neighbour tiles instead and use it if valid.
- city_layout_the_grand_arrangement [town_plan, 99] (opp wobbly, moonsteps): build only on the exact zone centre tile.
- city_layout_tile_moonsteps [town_plan, 97] (opp the other two): per zone, if (zone x + zone y) is even use the tile 3 north of the zone centre else 3 south; valid only if that tile is buildable.
 (Priority: grand_arrangement > wobbly > moonsteps when several are held; none -> random tile in zone.)
- Town-plan zone predicates (all group town_plan; mutually opposite, so a culture holds at most one; apply to non-dock, non-forced-centre buildings; a zone is excluded if the predicate is false). With zone coordinates (x,y) in zone units and the city's centre zone c:
  - city_layout_architects_eye: ring pattern measured from the MAP centre zone: allowed if (Euclid dist from map centre) mod 2 >= 1.
  - city_layout_rings: same ring pattern around the city centre zone.
  - city_layout_cross: allowed if |dx|<=1 or |dy|<=1 relative to city centre (a plus-shaped cross, 3 wide).
  - city_layout_parallels (prio 42): y even. city_layout_pillars (41): x even.
  - city_layout_claws: (x+y) mod 3 != 0.  city_layout_diamond (43): (x+y) odd.
  - city_layout_royal_checkers (44): (floor(x/2)+floor(y/2)) even.
  - city_layout_honeycomb [achievement `achievementSwarm`]: row offset = 2 if y even else 0; allowed if (x+offset) mod 4 == 0.
  - city_layout_bricks: x even AND (x+y) mod 3 != 0.  city_layout_raindrops: y even AND (x+y) mod 3 != 0.
  - city_layout_silk_web (47) lattice(spacing 2,width 1), city_layout_iron_weave (46) lattice(3,1), city_layout_monolith_mesh (45) lattice(4,2): allowed if (x mod spacing < width) OR (y mod spacing < width).
  - city_layout_pebbles (50) clusters(3,1), city_layout_stone_garden (49) clusters(4,1), city_layout_titan_footprints (48) clusters(5,1): allowed if NOT(x mod s < w) AND NOT(y mod s < w) (isolated blocks).
  - city_layout_madman_labyrinth: Perlin noise at (x*0.7, y*0.7) > 0.4.
Knowledge:
- training_potential [knowledge]: when an actor levels up, it gains an additional level (so +2 per level-up event).
- fast_learners [knowledge] {2}: all experience gained is multiplied by 2.
- reading_lovers [knowledge]: when the actor finishes reading a book whose happiness value is negative, the sign is flipped (becomes positive).
- attentive_readers [knowledge] {2}: book experience: exp := exp * trunc(exp * 2) (as written in the source this squares the book's experience, i.e. a likely bug; for a book exp of 5 it yields 5*10=50). Reimplement literally or as "x2" - flag a decision.
- expertise_exchange [knowledge] {10}: after a successful meta-spread chat (conversion step ran), both chatters gain 10 experience.
Happiness/society:
- elder_reverence [happiness] {2} (opp youth_reverence): after a chat, if the holder is an adult and the partner is older, gift (see 9.4).
- youth_reverence [happiness] (opp elder_reverence, tiny_legends): same but partner younger; also children are NOT work-capable (unless tiny_legends, which is exclusive anyway).
- pep_talks [happiness]: after the culture-spread step in a chat, chance 0.5: both gain status `inspired` (60s duration; +30% speed/crit/attack-speed multipliers; on finish happiness event `just_inspired`; also enables "wants to split meta").
- happiness_from_war [happiness]: when a kingdom with this culture declares a war (attacker side only is passed), every member of that kingdom whose own culture has the trait gets happiness event `just_started_war` (+20).
- gossip_lovers [happiness]: after the culture-spread step in a chat, both get happiness event `just_talked_gossip` (+14).
- dense_dwellings [harmony] {2} (opp solitude_seekers, hive_society): city house cap = zones*2 (before building bonuses).
- solitude_seekers [harmony] {0.5} (opp dense, hive): house cap = zones/3.
- hive_society [harmony] {10} (opp dense, solitude; achievement `achievementAntWorld`): house cap = zones*3.
  House cap rule: base = number of city zones; apply whichever trait is held; add sum of max_houses of city buildings; truncate to int.
Warfare/crafting:
- weaponsmith_mastery [warfare] {5}: weapon crafting tries +5 (item quality rolls).
- armorsmith_mastery [warfare] {5}: armour crafting tries +5.
- axe_lovers {10}, sword_lovers {10}, bow_lovers {6}, hammer_lovers {10}, spear_lovers {10} [weapons]: add that weapon subtype to the culture's preferred list.
- craft_flame_weapon [craft] {10}: preferred assets flame_sword, flame_hammer. craft_ice_weapon: ice_hammer. craft_evil_staff: evil_staff. craft_white_staff: white_staff. craft_necro_staff: necromancer_staff. craft_druid_staff: druid_staff. craft_doctor_staff: plague_doctor_staff. craft_shotgun [priority -1, not random, achievement `achievementSwordWithShotgun`]: shotgun. craft_blaster [priority -2, not random]: alien_blaster. (All values 10 but value unused in the code read.)
  Crafting rule: when crafting a weapon, subtype = random pick from culture's preferred subtypes (else default weapon pool). If culture has preferred specific assets, with chance 0.5 first try only those (shuffled, scanning from the end for the first with equipment value higher than the current one and affordable), falling back to the subtype pool.
Succession:
- patriarchy [succession, 97] (opp matriarchy) / matriarchy [96] (opp patriarchy): in successor ordering, the preferred sex (male / female) sorts first (applied LAST so it dominates the other sort keys); in "attribute dice" rolls (e.g. contested actions) the preferred sex gets +999 to the maximum so it effectively always wins; loyalty: a city whose culture == kingdom culture and has this trait gets -50 loyalty ("opinion_patriarchy"/"opinion_matriarchy") if the king is not of the preferred sex (0 otherwise or when no king / culture differs).
- ultimogeniture [succession, 96]: base age sort is youngest first (default oldest first).
- diplomatic_ascension [succession, 100] (opp warriors_ascension, fames_crown, golden_rule; tag love_peace): sort by diplomacy stat desc (overrides age).
- warriors_ascension [99] (opp diplomatic, fames_crown, golden_rule): sort by warfare stat desc.
- fames_crown [100] (opp the other three): sort by renown desc.
- golden_rule [100] (opp the other three): sort by gold coins desc.
  Only one of the four stat-sorts applies (first match in order diplomatic, warriors, fames, golden). Sort steps are sequential on one list: age, then stat, then sex - final order is dominated by the last sort; tie order within equal keys is not guaranteed (source uses unstable sort).
- shattered_crown [succession, 60]: when the king dies, a royal clan exists, and rebellions world-law is on: every member of the previous royal clan who is not rekt, not the new king and not a king pairs randomly with a non-capital city (both lists shuffled, paired until one runs out); the actor (removed as city leader if so) makes that city a new independent kingdom ("fell apart", not rebellion) and joins the city; remaining unpaired cities are each given (chance depends: only joins if the target new kingdom has fewer cities than the main kingdom after transfer) to a random new kingdom; if any shattered the kingdom leaves its alliance.
- unbroken_chain [succession, 59; achievement `achievementSuccession`]: when no royal-clan heir exists, fall back to picking a king among city leaders (the same fallback also happens if the rebellions law is off).
Worldview:
- serenity_now [worldview] (tag love_peace; opp xenophobic): actors of this culture cannot start the `new_war` plot; tag love_peace (this trait, xenophiles, diplomatic_ascension) is merged into member actors' stats and grants status `festive_spirit` when a war they are part of ends in peace or is won.
- xenophobic [worldview] (opp xenophiles, serenity_now): (a) a city of this culture won't welcome (accept as immigrant) actors of other subspecies; nor will any city accept an actor whose culture is xenophobic (unless same kingdom or same subspecies as the city's main subspecies); (b) leader/king xenophobic: loyalty "species" penalty for cities of a different species than capital is -50 (instead of -25/-5); (c) kingdom opinion: -50 toward kingdoms whose main subspecies differs.
- xenophiles [worldview] (opp xenophobic; tag love_peace): city welcomes outsiders if the outsider has no culture or also has xenophiles; leader xenophile reduces species-loyalty penalty to -5; kingdom opinion +20 toward kingdoms with same main subspecies as theirs (as written; likely intended for different subspecies - flag).
- ethnocentric_guard [worldview]: kingdom opinion -50 toward a kingdom of the same main subspecies but a different culture.
Special:
- ethno_sculpted [special; not givable, not removable, never in books, not random]: marker applied by the player editor when a culture is hand-edited. No gameplay effect found.
Immigration rule (isWelcomedToJoin): accepted if same kingdom; or same subspecies as city's main subspecies; else requires the city to have a culture, rejects if city culture or the actor's culture is xenophobic; accepts if city culture is xenophiles and actor has no culture or has xenophiles; else accepts if same species as the city's current species; otherwise rejects.

### 2.6 Culture effects on other loyalty/opinion systems (cross-reference)
- City loyalty "culture": non-capital city with a culture, kingdom has capital: +15 if same culture as capital, else -25.
- Kingdom opinion "culture": +15 if target kingdom has culture and it equals the observer's, -15 if it differs; 0 if target has none.

---

## 3. Religion

### 3.1 Identity and data
Fields: creator (actor id/name, species id, subspecies id/name, clan id/name, kingdom id/name, city id/name - snapshots), name (generated from the founder's religion-name generator, plus the founder's culture id used for name style), trait list, banner background+icon indexes, colour, books, `cities`/`kingdoms` derived lists, `possible_rites` (derived, see 3.3). The species used for default traits is the CREATOR species (never changes).
- Creation order (`newReligion`): create object, fill creator snapshot, optionally default traits (species list), generate name, THEN 1-2 random-gift traits (or 3-5 under glitched noosphere), THEN biome traits (L tries at 0.5). (Culture does biome first then random; religion the reverse.)
- Divide ("schism"): new religion with no default traits, all parent traits copied (opposite-conflict skipped), then random + biome gifts as above. (Gifts happen in `newReligion` call regardless of the default flag.)
- Removal: zero members and zero books.
- Birth counting not supported.
- Conversion adds +1 renown to the religion (always, counted on the destination).
- Members: religion is NOT merged into actor stats in this build (clan, language and culture base stats are merged; religion's are not). Religion traits therefore have effect only through: spells (3.4), rites (3.3), meta tags read via `hasMetaTag` (only `building_immunity_fire` is read), the `bloodline_bond` flag, and the plot/decision systems. The four "harmony" stat traits define +10 to a stat but no consumer was found - treat as dormant (decision for reimplementation: either apply to members, or leave dormant).

### 3.2 Who may use religion magic
`canUseReligionSpells(actor)`: actor has a religion whose spell list is non-empty; actor lacks trait `mute`; if actor is in a clan: allowed unless that clan has trait `void_ban`; if actor has no clan: forbidden when the religion has trait `bloodline_bond` (magic only for clan members), otherwise allowed. The religion's spells and decisions are only added to an actor's repertoire when this holds.
`bloodline_bond` [group the_void; no achievement]: restricts religion magic to clan members (seeded by default on some species).

### 3.3 Rites (religion traits that carry a plot)
A rite trait gives members the corresponding plot to start. Rites are only offered if the world law "rites" is enabled; each decision tick, an actor without a plot and not fighting builds a pot of all basic plots plus the religion's rite plots that are currently possible for it (each plot repeated `pot_rate` times, default presumably 1; listed below when set), shuffles, and tries to start the first plot that succeeds. Starting a (non-forced) plot costs the plot's money. Possible requires: enough money, actor level >= min_level, plus the plot's own check; can be done by king and/or city leader only (as per plot flags). Progress accumulates as the plot's progress counter; each author "work" step adds (intelligence+1) to a target which is capped at `progress_needed`; progress rises at 2 per second toward the target; when full the action fires. Plot dies if its should-continue check fails.
Common precondition for destructive rites: actor has kingdom with at least one enemy; target is a random city of a random enemy kingdom with cities. While running the actor must still have kingdom, religion, enemies, and the target city must be alive, in a kingdom that is an enemy of the actor's kingdom. After the action succeeds EVERY rite triggers the "world transformation" (3.5).
Rite catalogue (trait id [group] -> plot id: level / money / progress_needed / pot_rate; effect). All rite traits have priority -1, and are random-gift eligible by default (subject to availability) unless stated.
- rite_of_shattered_earth [destruction; achievement `achievementWatchYourMouth`] -> summon_earthquake: lvl 13, 600, 200, pot 2: starts a small-disaster earthquake at a random tile of a random zone of the target city.
- rite_of_falling_stars [destruction; ach `achievementMayday`] -> summon_meteor_rain: lvl 13, 1000, 200, pot default: spawns 3..7 inclusive meteorites at random tiles of random target-city zones, attributed to the caster.
- rite_of_roaring_skies [destruction; ach `achievementMayIInterrupt`] -> summon_thunderstorm: lvl 13, 500, 200, pot 4: one medium lightning strike at a random city tile, then 5..12 extra strikes, each at a random tile within 10 tiles of the first, delayed by uniform(0.1,0.75)*i seconds (i = strike index).
- rite_of_tempest_call [destruction] -> summon_stormfront: lvl 13, 200, 100: spawns N=5..15 inclusive lightning-cloud effects spaced evenly in Y across the target city's zone extent (step = (maxY-minY)/N), each at X = city's min X + offset in -7..7 inclusive, clamped to map.
- rite_of_infernal_wrath [destruction] -> summon_hellstorm: lvl 13, 300, 100, pot 4: same as stormfront but fire clouds, N=3..5 inclusive.
- rite_of_the_abyss [destruction] -> summon_demons [group rites_summoning]: lvl 13, 300, 100: with chance 0.0666 the target is replaced by the caster's own city (backfire); then spawns N=5..10 inclusive adult "demon" units at random tiles of the target city, NOT joining the caster's kingdom.
- rite_of_infinite_edges [protection] -> summon_angles: lvl 12, 200, 100, pot 2: spawns N=3..7 inclusive adult "angle" (angel) units in the target city that join the caster's kingdom (if the caster is a civ-kingdom member).
- rite_of_restless_dead [necromancy] -> summon_skeletons: lvl 13, 150, 100, pot 2: N=6..13 inclusive adult skeletons that join the caster's kingdom.
- rite_of_living_harvest [creation] -> summon_living_plants: lvl 13, 400, 100, pot 2: makes every building on the target city's farm-field tiles into living flora (not requiring fully grown).
- rite_of_eternal_brew [necromancy; ach `achievementGodFingerLightning`] -> big_cast_coffee [rites_merciful]: lvl 9, 100, 60, pot 2; target = caster's own city; every unit in the city gets status `caffeinated`. Requires only that the caster has a city.
- rite_of_unbroken_shield [protection] -> big_cast_bubble_shield: lvl 11, 200, 50, pot 3; target = caster's own kingdom; every warrior of the kingdom gets status `shield` (60 s default duration). Requires only a kingdom.
- rite_of_fractured_minds [the_void; ach `achievementGreg`] -> big_cast_madness: lvl 11, 600, 120: each unit in the enemy target city independently gets trait `madness` with chance 0.05.
- rite_of_entanglement [creation] -> big_cast_slowness: lvl 11, 150, 70, pot 3: every warrior in the enemy city gets status `slowness`.
- rite_of_dissent [the_void; ach `achievementNotJustACult`] -> cause_rebellion: lvl 12, 400, 70, pot 2: target city is a random NON-capital city of a random enemy kingdom; at the end a random unit of that city (must be alive) starts a rebellion (without the usual happiness check).
- rite_of_change [the_void] -> clan_ascension: lvl 7, 100 money, intelligence >= 5, cast by the king only: preconditions: actor has religion and a clan; clan lacks trait `mark_of_becoming`; clan has a chief and the actor IS the chief; the kingdom has >= 500 people; actor has trait `evil`; actor's subspecies lacks trait `pure`. Action: actor tries to "evolve via ascension" (species-evolution routine; fails -> plot fails); on success the clan gains `mark_of_becoming` and EVERY clan member switches to the evolved form's subspecies. Also gets the world transformation.
Rite intelligence/other min-stats exist on several plots but the values for plots above not listed are 0 (not required).

### 3.4 Spell traits ("magic spell" template clones)
Each of these traits adds the named spell to the religion's spell list (members who may use religion magic get it). Group shown; default group of the template is `creation` (cast_curse inherits it). A registered base template trait named by the placeholder `$magic_spell$` also exists with no spell (ignore in a reimplementation).
Spell casting (applies to every spell source: actor, subspecies, religion, species defaults): the actor can cast if it has any spell, lacks status `spell_silence` and lacks status `recovery_spell`, and is in the combat action pool (spells are a combat action added to the attack choice pool: a spell attempt is one of two entries (spell vs basic attack) in the pool, picked uniformly; if the chosen spell fails the actor falls back to a basic attack). On the attempt: pick one spell at random from a pool containing ONE random spell from each source the actor has (actor-own, subspecies, religion if allowed, species default), uniformly among those sources. Fail if mana < cost. Roll chance = spell.chance * (1 + actor stat skill_spell) (so skill_spell +0.5 gives x1.5). If cast_target is "Himself" the target becomes the caster. Entity filter: BuildingsOnly rejects unit targets; UnitsOnly rejects building targets; (Both/Tile accept). If spell.health_ratio > 0 the cast requires current health ratio < spell.health_ratio. If min_distance > 0 the target must be at least that far (tile distance, squared compare). Then the effect runs; on success the caster plays cast animation and gains status `recovery_spell` (5 s cooldown); mana is spent (cost_mana) via the combat action costs.
Spells (id: chance, min distance, mana, flags -> effect). All flagged "usable in combat" are in the combat pool; "decision" = also adds an AI decision to holders.
- teleport [religion trait group the_void; achievement `achievementTraitExplorerReligion`]: chance 0.3, mana 15, target self, only when health ratio < 0.6, usable in combat. Effect: pick a random ground region tile on a random island; fail if tile blocked or not ground; teleports the caster there, cancelling its behaviour. Decisions added: random_teleport, teleport_back_home.
- cast_silence [the_void]: 0.2, dist 6, mana 5, units only, combat. Drops a `spell_silence` area at the target (drop size 15) - victims get status spell_silence (60 s) that blocks spellcasting.
- summon_lightning [destruction]: 0.1, dist 6, mana 5, combat. Medium lightning (0.15 scale) at target tile attributed to caster.
- summon_tornado [destruction]: 0.1, dist 6, mana 10, combat. Spawns a tornado effect at the target tile resized to 1/6 (small).
- cast_curse [creation (inherited)]: 0.2, dist 4, mana 3, units only, combat. If the target already has status `cursed` fail; else spawns a `curse` drop (size 15) at the target tile.
- cast_fire [destruction]: 0.2, dist 3, mana 3, units or buildings, combat. Spawns `fire` drop (15) on the target tile plus 3 more on randomly chosen neighbour tiles. Decision: burn_tumors.
- cast_blood_rain [restoration]: 0.3, dist 0, mana 2, self, units only, only when health ratio < 0.9, combat. Spawns `blood_rain` drop at caster. Decision: check_heal (the heal behaviour fires this same effect).
- cast_grass_seeds [creation]: 0.1, mana 4, target region, tile entity, not combat. Fails if world law "gaias_covenant" on; else spawns `seeds_grass` drop.
- spawn_vegetation [creation]: 0.1, mana 5, region/tile, not combat. Spawns `fertilizer_trees` drop. Decision: spawn_fertilizer.
- spawn_skeleton [necromancy; ach `achievementTheCorruptedTrees`]: 0.2, mana 10, self, combat. Counts "skeleton" species units around the tile chunk; if more than 7 already present (count exceeds 6) fail; otherwise spawns a skeleton on a random tile of the region. Decision: make_skeleton.
- cast_shield [protection]: 0.2, mana 5, self, combat. Gives self status `shield` for 30 s (fail if already shielded).
- cast_cure [restoration]: 0.3, mana 3, friendly units only, not combat. Spawns `cure` drop at target. Decision: check_cure.
Religion special/meta traits:
- blessed_by_ashes [protection; ach `achievementSacrifice`]: meta tag `building_immunity_fire`: buildings of cities whose religion has it are not burnable.
- divine_insight [special; not givable/removable; not in books; not random]: marker for player-edited religions; no gameplay effect found.
- minds_awakening / zeal_of_conquest / path_of_unity / hand_of_order [harmony]: +10 intelligence / warfare / diplomacy / stewardship (dormant, see 3.1).

### 3.5 Transformation traits (world transformation after any rite)
Traits sands_of_ruin (biome desert), shadowroot (corrupted), echo_of_the_void (singularity), infernal_rot (infernal), cosmic_radiation (wasteland) [group transformation; never random-gifted; always carry a biome id]. After a rite action succeeds: if the caster's religion has any transformation-group traits, pick one uniformly; pick a random tile on a random island; spread that biome type there; then take a radius-2 "special" brush pattern of n cells, choose k=U[floor(n*0.25), floor(n*0.5)) distinct random cells, and forcibly spread the biome onto each (ignoring road/bonus checks). If there are no transformation traits, nothing happens (post action returns false).

### 3.6 Biome seeding and species defaults
Biome religion lists: celestial {rite_of_falling_stars}; singularity {teleport}; infernal {rite_of_the_abyss}; corrupted {rite_of_restless_dead, cast_curse, spawn_skeleton}. Species assets define `default religion traits` (many include path_of_unity; some zeal_of_conquest/hand_of_order/minds_awakening; one includes bloodline_bond).

### 3.7 Opinion/loyalty effects
- City loyalty "religion": non-capital city with religion, kingdom has capital: +15 same religion as capital, -30 different.
- Kingdom opinion "religion": target kingdom has religion: +15 if equal to observer's, -15 otherwise.
- Conversion by dreams/possession: when a possessed/dream-influenced actor interacts, for each of culture, language, religion that the influencer has, chance 0.5 the target attempts conversion to it (same gating as 1.9). If any succeeded and stun is enabled: target is stunned, pushed, gains `voices_in_my_head`; otherwise (stun enabled) chance 0.1 of an unspecified alternative (not read).
- Religion `setMetasFromCity`: an actor joining a city copies the city's culture, language and religion for each it LACKS (existing ones are kept).

---

## 4. Language

### 4.1 Identity and data
Fields: creator snapshot (actor, species, subspecies, kingdom, clan, city), name (generated from founder's language-name generator, plus founder's culture id), traits, banner (icon+background), colour, books-written counter, three speaker counters (`speakers_new`, `speakers_converted`, `speakers_lost`), books handler, `cities`/`kingdoms` lists. Species for default traits = creator species.
- Creation order (`newLanguage`): create, generate name, creator snapshot, optional species-default language traits, then 1-2 random-gift traits (3-5 glitched), then biome traits (L tries at 0.5). Splitting ("language divergence"): no defaults, copy parent traits (opposites skipped).
- Requires the founder's subspecies to have "advanced communication" (plots enforce).
- Renown: first-time speaker +1; converted speaker (actor previously had a different language) +2. When an actor leaves a language (joins another or is set to none) the old language's `speakers_lost` is incremented (always, even if it is then removed). A converted join increments `speakers_converted`; a no-previous-language join increments `speakers_new`. Setting language to none (e.g. via confusing_semantics) counts as a loss only.
- Removal: zero members and zero books. Birth counting unsupported.
- Language base stats are merged into every member actor's stats (like culture and clan).
- Language hooks: death/growth/special-effect/attack/hit hooks and decisions merged into members as for culture.

### 4.2 Trait catalogue (every language trait)
Groups (UI): knowledge, spirit, harmony, chaos, miscellaneous, special. "value" is the numeric parameter. "Book effect" means the trait's action runs for a reader each time they finish reading a book WRITTEN IN a language that has the trait (the book's language, not the reader's own). Reader-side checks are in the effect text.
Harmony:
- melodic [harmony] {3}: (a) in a chat, the holder's meta-weight in the culture/language "who converts whom" pot is +3 (see 9.3); (b) a happy actor (happiness > 50) of this language adds four extra "singing" entries to its reflection-task pot (singing becomes much more likely); no value-based roll.
- stylish_writing [harmony] {3}: in book-reading meta conversions (7.4) the weight of the reader's own meta and/or the book's meta is +3 when the reader's language / the book's language has this trait.
- beautiful_calligraphy [harmony] {2}: books written in it have their happiness value multiplied by 2 (truncated to integer; applies to negative values too).
Knowledge:
- scribble [knowledge] (opp nicely_structured_grammar): books written in it have experience capped at 1.
- nicely_structured_grammar [knowledge] {2} (opp scribble): books written in it have experience x2 (truncated). (Ignored if scribble is also held - cannot be, they are opposites.)
- enlightening_script [knowledge]: +10 intelligence to all members (stat).
- foolish_glyphs [knowledge]: -5 intelligence to all members.
- strict_spelling [knowledge]: +10 warfare to all members.
Spirit:
- magic_words [spirit; achievement `achievementTraitExplorerLanguage`]: books in it can be read by ANY actor regardless of language (readers whose own language differs or who have none can read them in a city).
- font_of_gods [spirit] {0.2}: book effect: with chance 0.2 reader gains status `enchanted` (120 s).
- ancient_runes [spirit; ach `achievementPlotsExplorer`] {0.4}: book effect: chance 0.4 reader gains `spell_boost` (180 s: +100 mana, +0.2 skill_spell).
- powerful_words [spirit] {0.2}: book effect: chance 0.2 reader gains `powerup` (300 s).
- elegant_words [spirit]: +4 offspring (stat) to all members.
Chaos (all book effects; "evil/blessed" are actor traits):
- words_of_madness [chaos; ach `achievementCursedWorld`; not random-gifted] {0.1}: if reader lacks `evil` and `blessed`, chance 0.1: reader gains trait `madness`.
- cursed_font [chaos; ach `achievementTheCorruptedTrees`] {0.2}: if reader lacks `evil`, chance 0.2: status `cursed` (300 s).
- chilly_font [chaos] {0.4}: chance 0.4 status `frozen` (15 s).
- spooky_language [chaos; ach `achievementChildNamedToto`; not random] {0.2}: if reader has a city, chance 0.2: spawn a `ghost` unit on a random neighbouring tile.
- confusing_semantics [chaos] {0.2}: chance 0.2: reader is stunned and (if it has a language) loses its language (joins "none").
- raging_paragraphs [chaos] {0.2}: chance 0.2 status `rage` (300 s, +100% damage multiplier).
- mortal_tongue [chaos; ach `achievementCursedWorld`] {0.2}: if reader lacks `evil` and `blessed`, chance 0.2: reader takes damage equal to full health (divine) = death.
- scorching_words [chaos] {0.5}: chance 0.5 status `burning` (30 s).
- doomed_glyphs [chaos; ach `achievementMultiplySpoken`; not random] {0.1}: if reader lacks trait `lucky`, world law "nature disasters" is on, chance 0.1: a meteorite disaster hits the reader's tile (attributed to reader).
Miscellaneous:
- repeated_sentences [miscellaneous; ach `achievementCloneWars`; not random] {0.1}: chance 0.1 and reader has a city, species is clonable, city has a free house slot and is not at its world-law population limit: reader is cloned.
- eternal_text [miscellaneous; ach `achievementPie`; not random]: +500 lifespan stat for members.
Special:
- divine_encryption [special; not givable/removable/in books/random]: marker for editor-edited languages; no gameplay effect.
Default random-gift eligibility: all except those flagged "not random" and the special one; achievement-gated ones need the achievement.

### 4.3 Biome language seeds
Biome -> language traits (see 1.5 rule): celestial {font_of_gods, magic_words}; swamp {scribble}; wasteland {foolish_glyphs}; singularity {repeated_sentences}; enchanted {ancient_runes, enlightening_script}; jungle {beautiful_calligraphy}; paradox {eternal_text, confusing_semantics}; mushroom {powerful_words}; infernal {raging_paragraphs}; maple {nicely_structured_grammar, melodic}; flower {elegant_words}; lemon {melodic, elegant_words}; corrupted {cursed_font}; garlic {enlightening_script}; candy {foolish_glyphs}; desert {stylish_writing}; grass {strict_spelling}; crystal {powerful_words}; clover {stylish_writing}; savanna {elegant_words}; rocklands {powerful_words}.

### 4.4 Loyalty/opinion effects
- City loyalty "language": non-capital city with language, kingdom with capital: +15 same as capital's, -20 different.
- Kingdom opinion "language": +15 same as observer's, -15 different (only if target kingdom has a language).

### 4.5 Unit-side effects
- When an actor's language changes its stats are recomputed (language stat traits above).
- Language is required to read non-magic books (7.3) and to write books (7.1), and for plots (new_religion, culture_divide, ...).
- A baby inherits language: see 5.5/6.
