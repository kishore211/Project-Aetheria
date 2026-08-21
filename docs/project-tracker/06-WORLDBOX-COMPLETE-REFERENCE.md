# 06 — WorldBox: Complete Reference

Third and final research pass, 2026-08-21. Source: the Official WorldBox Wiki
(316 pages, enumerated via `Special:AllPages`), read through a real browser
because Fandom returns HTTP 402 to plain fetches.

**How to read this document.** It is a *reference*, not a wish list. Every
section states what WorldBox does, with its real numbers where the wiki gives
them, and then what Aetheria does today. The plan built from it is
[08-MASTER-PLAN.md](08-MASTER-PLAN.md); the UI half is
[07-UI-TEARDOWN-AND-SPEC.md](07-UI-TEARDOWN-AND-SPEC.md).

## 0. Coverage — what was actually read

Being precise about this matters, because "I read the whole wiki" is the kind of
claim that quietly becomes untrue.

**Read in full (26 pages)** — every page that defines a *mechanism*:

Powers · Hotkeys · World History · World Laws · Happiness · Status Effects ·
Units · Unit Tasks · Jobs · Ages · Plots · Loyalty · Economy · Knowledge ·
Cultures · Families · Villages · Kingdoms · City Building · Map Creation ·
Sounds of Worldbox · (plus, from pass two: Villages, Kingdoms, Unit Tasks,
Jobs, Families, Map Creation re-read against 0.51)

**Catalogued, not transcribed (≈290 pages).** The rest of the wiki is
overwhelmingly *content*, not mechanics, and it falls into five shapes:

| Shape | Count | Example pages | Why cataloguing is enough |
|---|---|---|---|
| Version changelogs | ~60 | `0.1.15`, `0.51.0 - Armybox` | Historical; the mechanics they introduced are documented on the system pages |
| Creature stat blocks | ~55 | `Wolf and Howleer`, `Crab and Crablin` | One template repeated: stats, diet, evolution. Numbers matter only if we clone their roster |
| Biome pages | ~30 | `Candy Biome`, `Paradox Biome` | Colour + flora + spread rules per biome |
| Building pages | ~20 | `Town Hall`, `Watch Tower`, `Docks` | Tier costs; the *rules* are on City Building |
| Trait / resource / disaster stubs | ~125 | `Adamantine`, `Tornado`, `Clan Traits` | Long enumerations; the counts are in §9 |

Where a system page was read in full, the numbers below are theirs. Where it was
catalogued, this document says so rather than inventing detail.

---

## 1. Scale — the numbers that frame everything

| Thing | WorldBox | Aetheria today |
|---|---|---|
| Map sizes | 128² (Tiny) → 512² (Titanic), 7 presets | 64² / 128² / 256², 3 presets |
| Creatures | 113 unlockable units (118 spawnable) | 20 |
| Powers | **374**, in 8 tabs | 22, in a sidebar |
| Creature traits | 116 | 11 |
| Subspecies traits | 204 | — |
| Culture / language / clan / religion traits | 78 / 26 / 29 / 40 | — |
| Status effects | 57 | ~12 ad-hoc strings |
| Plots (foreseeable schemes) | 28 | — |
| Ages / eras | 10 | — (4 seasons only) |
| Biomes | ~30 | 28 |
| Buildings | ~20 types, most with tiers | 9, untiered |
| Music / sounds | ~192 tracks, ~1,400 sfx | 1 procedural pad, 12 sfx |
| Total unlockables ("Knowledge") | **774** | 14 achievements |
| Time | 1 month ≈ 3–4 s, so 1 year ≈ 40 s | 1 year = 320 s |

Two conclusions worth stating plainly:

1. **We are not going to match the content volume, and should not try.** 374
   powers and 774 unlockables are a decade of accretion. What we can match is
   the *density of feedback* — the systems that make a small world feel deep.
2. **Their clock is 8× faster than ours.** A WorldBox year is ~40 seconds, ours
   is 320. Everything they express "per year" happens far more often in play
   than the raw number suggests. Any number copied from the wiki must be
   rescaled to our clock, which is exactly the mistake we avoided with herd
   cooldowns in Phase 8.

---

## 2. Powers — the 8-tab bar

WorldBox has **374 powers across 8 tabs**. The tab list is itself the
information architecture of the whole game:

| Tab | Powers | Contents |
|---|---|---|
| **Main** | 15 | Not powers at all — the game's front door: pause, hourglass (time), world statistics, world laws, ages, world history, game statistics, new world, saves, settings, achievements, community, **hide UI**, workshop |
| **World Shaping** | 47 | Terrain heights (deep ocean → summit), 6 wall types, shovel up/down, and a set of *editing* tools: finger (copy pixels), vortex, sponge, sickle, bucket, pickaxe, spade, axe, demolish, life eraser, scissors (remove zones), paint (expand borders), border brush, plus 14 "printer" stamps that draw whole landscapes |
| **Noosphere and Life** | 61 | The HUD toolkit — see §3 |
| **Animals, Creatures, Monsters** | 117 | Spawners, each with a one-line joke ("Orcs: warriors with a heart of gold and a head of stone") |
| **Nature and Disasters** | 53 | Temperature hot/cold, lightning, earthquake, tornado, rain, fire, acid, lava, **21 biome seeds**, fertilizers, 5 ore types, geysers, volcano, and **11 cloud types** (rain, thunder, hell, acid, lava, ash, magic, snow, rage, life) |
| **Destruction and Chaos** | 37 | 12 explosives escalating grenade → Tsar Bomba, heat-ray, meteorite, grey goo, plague, madness, zombie infection, 4 "desire" items, Conway's Game of Life |
| **Other** | 31 | Divine magnet, divine light, monolith, blood rain, shield, blessing, curse, coffee, powerup, clone rain, sleep, **6 "dust" powers that make creatures forget** (language, family, kingdom, culture, religion, everything), and trait/loot rains |
| **Unit** | 8 | Contextual — appears only when a unit is selected: main info, possession, favourite, follow, … |

### Patterns worth stealing

- **Tabs, not a scrolling list.** Eight tabs of 15–117 items each. Ours is one
  sidebar of 22 buttons.
- **Every power has a one-line description with a joke in it.** This is most of
  the game's personality and costs nothing but writing.
- **A contextual tab.** Selecting a unit adds a whole tab of unit actions.
- **Erasers are first-class.** Sponge, sickle, bucket, pickaxe, spade, axe,
  demolish, life eraser, scissors — nine distinct *removal* tools. We have none;
  everything we do is additive.
- **Stamps.** 14 "printer" powers draw a labyrinth, a spiral, a star fort. Pure
  toy value.
- **Hide UI is a power.** The bar can get out of the way (also hotkey `H`).

---

## 3. The Noosphere tab — WorldBox's real UI

61 "powers" that are actually the observability layer. This single tab is the
biggest gap between their UI and ours.

**Map layers** — one per meta, each toggleable, plus a master switch:
army, alliance, kingdom, village, clan, religion, culture, language, family,
subspecies. Plus `Map Zones` (show zones for the selected layer) and
`Map Names` (labels drawn per layer). Hotkeys `Z`/`X` cycle layer, `C` cycles
the layer's *state* (e.g. culture by kingdom / by village / by unit).

**List windows** — a browsable list per meta: wars, plots, armies, alliances,
kingdoms, villages, clans, religions, cultures, languages, families,
subspecies, favourites, favourite items.

**Map icons** — independently toggleable: species icons, kings and leaders,
boats, armies, battles, army targets, important events, meta pins, **happiness
icons**, highlighted favourites, **task icons**, money flow (animated coins
between units during trade and taxation), **speech and thought bubbles**,
conversation effects.

**Hover tooltips** — for zones and for units.

**Relationship arrows**, drawn from the selected unit: destination, lover,
house, family, parents, kids, attack target.

**Diplomacy interventions** — spite (everyone hates this kingdom), friendship
(force peace), inspiration (make a village its own kingdom), whisper of war,
discord (break an alliance), unity (form one).

---

## 4. Units

### Anatomy of a unit
Name (editable, 30 chars, glows when player-edited) · sprite · statuses ·
traits · inventory (weapon, helmet, armour, boots, ring, amulet) · species ·
gender · metas · stats · profession · current task · generation · genealogy ·
**mind** (a graph of neurons) · possession · lover · best friend · favourite
flag.

### Stats tracked
Age (with exact birth day) · health · **happiness** · mana · stamina · hunger
(+ favourite food) · damage · armour · critical chance · speed · attack speed ·
**civil stats: diplomacy, warfare, stewardship, intelligence** · lifespan (soft,
not a cap) · level + experience · **renown** · children (and max children) ·
births · kills · loot and coins · mass · personality (kings and leaders).

### Lovers and best friends
- **Lover:** searched for nearby first, then within the village. Both must be
  adult, unpartnered, same species.
- **Best friend:** formed when two units converse and their *happiness values
  are similar*. One per unit. Independent of lovers.

### Neurons
Since 0.50 every action is a "neuron" that fires on conditions at intervals,
with a weight and a priority band: `idle`, `growth`, `cognitive`, `survival`,
`immediate`. **The player can enable and disable individual neurons per unit** —
editing a creature's mind.

---

## 5. Happiness — the emotional layer

Range **−100 to +100**, displayed as a percentage `(value + 100) / 200`.
Six-step icon: Max Happy (90–100%) · Very Happy (70–89) · Happy (60–69) ·
Neutral (40–59) · Sad (10–39) · Very Sad (0–9).

Effects are deliberately small: below 50% units stay home longer, and similar
happiness makes two units become best friends. It is mostly *expression*.

### The scenario table
Every event that moves happiness has: an icon, a value, a source, whether
psychopaths ignore it, a "pot amount" (how strongly it feeds the reflection
task), and **four rotating lines of dialogue** the unit can say.

| Scenario | Δ | Sample line |
|---|---|---|
| Lost a child | −60 | "You were my brightest light." |
| Lost a lover | −50 | "I thought we had more time..." |
| Slept outside | −30 | "No shelter again." |
| Had a nightmare | −30 | "I couldn't move... I couldn't scream." |
| Lost a best friend | −25 | "Everything feels empty now." |
| Got robbed / lost a fight / was conquered / lost a war | −20 | "I will get you next time!" |
| Had a bad dream | −15 | "It felt so real..." |
| Paid taxes | −5 | "There goes my hard work..." |
| Got poked *(by the player)* | −5 | "Isn't it strange, to create something that hates you?" |
| Relieved themselves / took a nap | +5 | "I feel lighter now!" |
| Had a meal / received a gift | +10 | "That hit the spot!" |
| Had a good dream | +15 | "If only real life was that nice." |
| Gave a gift / won a war | +20 | "Giving feels nice." |
| Rebelled | +30 | "No more chains, no more masters!" |
| Fell in love / became a leader | +40 | — |
| Became a king | +50 | "I hope I don't mess this up." |

That single table is more characterisation than our entire game currently has.
Note the poke line: the player clicking a unit *hurts* it, and it knows.

---

## 6. Status effects

**57 statuses**, each with an icon, effect, source, duration, an "opposite", a
tier (Basic / Advanced), and a one-line flavour description — "Reality slips
sideways", "Blaming the gods", "Moving at the speed of a bad idea!".

The mechanically interesting part: **statuses are socially contagious**.
Laughing, singing, crying and swearing spread to nearby units for a couple of
seconds and *draw other units over*. Damage cancels them. That is how crowds
form organically.

Examples: Plot Recovery (60 s, can't scheme) · Social Recovery (60 s, can't
converse) · Dash (+155% speed, 2 s) · Inspired (+30% speed/crit/attack speed,
+25 happiness on expiry) · Confused (random movement; from forgetting a meta,
earthquakes, gene edits; strong-minded units immune) · Angry (attacks others;
from being robbed or sworn at; ended by water or divine light) · Tantrum (120 s,
attacks the nearest unit, +25 happiness on expiry) · Festive Spirit (launches
fireworks, costs 10 coins).

---

## 7. Civilization

### Villages
- Founded on a **3×3 block of zones**, a zone being 8×8 tiles — **576 tiles**.
- Borders grow via the leader's `claim_land` task, prioritised by stewardship.
  The Expansionists culture trait allows claiming 8 zones at once.
- **Max houses = number of zones** (×3 with Hive Society, ×2 Dense Dwellings,
  ÷3 Solitude Seekers, +3 per training dummy/statue/well, +2 per temple).
- Storage: resources, food, and 3 of each equipment slot (6 with Armory
  knowledge). A unit dying on village ground donates its items.
- Losing all population → abandoned → decays zone by zone.
- Stats tracked per village include joined / left / moved counts, money,
  founding date, tribute and tax, loyalty, meta breakdowns, a **population
  pyramid** and **graphs**.

### Building rules (this is why our villages look scattered)
- One building planned per **month**, one at a time. Blocked while hostiles are
  inside the borders, while being captured, or while anything is on fire.
- Candidate buildings are filtered by: tech (culture knowledge), zone count
  (barracks and temples need ≥20 zones), per-city limits (1 bonfire / windmill /
  statue / well / mine / barracks; 5 docks), population, existing building
  count, prerequisite buildings, and stored resources. Then one is picked at
  random from what remains.
- **Siting classes:**
  - *Solitary* (mine, watch tower, windmill) — the zone and all adjacent zones
    must contain no civ buildings.
  - *Cluster* (houses, halls) — the zone or an adjacent one must contain a
    finished building, and no solitary buildings.
  - *Border* (watch tower) — at least one adjacent zone must belong to someone
    else.
  - Bonfire is first; if destroyed the village demolishes a house to rebuild it.
  - Docks need a large enough body of water.
- **Dwarves build tidily** — 20% chance of the zone's centre tile, 80% adjacent
  to it. Humans, elves and orcs pick at random. Dwarven towns visibly differ.

### Kingdoms
Name · banner (texture + symbol + colour) · **motto** · wars · opinions ·
king · villages · traits · metas · stats (money, founding date, past kings,
heir, tribute) · founder species · population pyramid and graphs.

Capital: first village, +1000 loyalty, never rebels, houses the king.

Village limit by race: humans +5, orcs +4, elves/dwarves +3, +1 for having a
king, +1 per 6 stewardship, and trait modifiers (Ambitious +5, Bloodlust/Genius
+3, Greedy +2, Paranoid −1, Evil −2, Stupid −3). Exceeding it costs **−25
loyalty per excess village** — a soft limit expressed through unrest.

### Colonisation
Requires an adult king, no active war, and the Kingdom Expansion law.
Blocked if every reachable village has ≤30 people. A source village needs ≥30
adults and one of: >5 years old, OR population >22, OR (<22 population, no free
housing, >10 years old, >2 houses). It sends **6–12 settlers** plus up to six
family members (lovers first; children, leaders, kings and captains stay). Same
island preferred; otherwise a transport boat carries them.

### Loyalty — an 18-factor formula, shown as a breakdown
King's leadership `diplomacy + stewardship×2`, minus the same for the leader ·
a long list of trait modifiers (Pacifist +50 … Madness −100) · trait *matches*
between king and leader · trait *opposites* · population difference from the
capital (÷3, cap 30) · area difference (÷20, cap 5) · distance to capital (÷10)
· capital +1000 · new village (15−age)×5 · new kingdom (5−age)×5 · cities over
the limit ×25 · superior enemies (+0…+50: losing wars *increases* loyalty) ·
bordering the capital +20 · connected to the capital +20 / −35 · same culture
+15 / −25 · same language +15 / −20 · same religion +15 / −30 · different
species −25 (−5 Xenophile, −50 Xenophobe) · same subspecies +15 / −15 · same
clan as the king +30 / −20.

Below zero, a village can rebel and found its own kingdom; the old kingdom
immediately declares war on it.

### Plots — 28 foreseeable schemes
Kings, leaders and clan members plan things *in advance*. A plot icon appears
above the plotter and **fills with colour as it progresses**; the player can
open it to see who is planning, when they started, how many are involved, and a
progress bar. Diplomacy plots need 60 progress. The player can cancel a plot by
killing the plotter or using divine light, and can *force* a plot (which gives
the unit "Voices in My Head" for 180 s: −5 diplomacy and −5 opinion).

Categories: diplomacy (alliances, peace, wars, rebellions), magical rites
(wrathful / summoning / merciful / various, gated on religion traits), meta
plots (create or split a culture, language, religion), and others.

This is the single best design idea in the game: **it converts random events
into anticipation.**

### Cultures, languages, religions — the "pot" mechanic
All three spread identically, and it is elegant:

- When two units converse, both their cultures go into a pot. A unit's culture
  is added **again** if it matches their city's, and **again** if it matches
  their kingdom's. One entry is drawn at random and wins. Pot = 1–3 of each.
- Books work the same way: reader's culture ×3 (×6 with Stylish Writing), the
  book's culture ×3 (×6). Pot = 0–6 vs 3–6.
- Dream-weaver subspecies can convert sleeping units (50%).
- Conversion fails if the subspecies lacks Advanced Hippocampus, or if the
  culture has True Roots.
- A culture is forgotten when no unit and no book carries it.
- Splitting requires a plot with ~11 conditions (≥1000 units, ≥500 years old,
  leader with ≥6 intelligence, and so on).

Cultures affect house spacing and patterns, how warriors are hired, how youth
and elders are treated, architecture (roads, watchtowers, statues), succession
rules, and weapon crafting and preference.

### Economy — four currencies
**Gold** (village resource, max 999, only from mines and trade boats) ·
**Loot** (personal, pre-tax) · **Money/coins** (loot after tax) ·
**Cash** = loot + money (what thieves target).

Loot is earned for real work: 6 per building, 5 per zone claimed, 1 per road
tile / crop action / ore / cleanup / stockpile delivery, plus passive income
from your house by tier (tent 1 → town hall tier 3: 10). Biomes modify it
(Clover +3, Crystal +2, Corrupted −1, Wasteland −2).

Money is spent on **food (5 coins a meal**, unless king, leader, child or
starving), gifts, fireworks (10), crafting, repairs (50% of gold cost) and
plots. Taxes: citizens pay 20/50/70% to the village leader by kingdom trait;
leaders pay the same as tribute to the king. Paying costs 5 happiness (10 at
70%).

Gold builds: well 20, watch tower 20, house tiers 5/10/15/20, town hall
5/10/15, temple 10, library 10, barracks 5, market 5, statue 5, windmill T2 5,
docks T2 6. A village needs >10 gold to hire a warrior.

### Jobs — staffed by demand, capped
Professions: **king** (lives in the capital, receives tribute, chooses the big
plots), **leader** (governs a village, can rebel), **captain** (one per village,
army follows it, *deliberately moves slower so they keep up*), **warrior**
(hired above population 15; max = `adult population × (0.35 + leader warfare
bonus)`).

Basic jobs: blacksmith (at population 15) · builder (max 3) · cleaner (1) ·
manure cleaner (3) · farmer (unlimited, needs a windmill) · fireman (unlimited,
extinguishes 3×3) · bush/herb/honey gatherer (**1 if food >100, 4 if >60, 5 if
>40, 7 if >20, else 10**) · hunter (1) · miner and miner-deposit · road builder
(1) · woodcutter (1 if wood >15, else 3).

**Jobs are cancelled when a unit wants to reproduce or socialise** — social life
outranks work.

---

## 8. World systems

### Ages — 10 world eras, ≥30 years each
Hope (the default, ~53% of play) · Sun · Dark · Tears · Moon · Chaos · Wonders ·
Ice · Ash · Despair, plus "Unknown" slots. An **Age Clock** with 8 slots
controls the rotation: slots 1/3/5/6 are Hope, 2/7 are one of Dark/Tears/Moon/
Wonders, 4/8 are unknown.

Each age carries: a **full-screen overlay** and **particle layer** (sun, rain,
darkness, moon, chaos, magic, winter, ash), a **cloud type and interval**, a
loyalty bonus, an opinion bonus, a temperature range, a biome-growth modifier,
and **global actions**:

- *Sun* — drought kills 5 random trees per trigger; fire spreads ×2; snowmen
  take 100 damage a tick; vegetation growth off.
- *Tears* — global rain; 90% chance to clear burning from any unit or building;
  fire elementals take 30 damage a tick.
- *Ice / Despair* — world freezes; frosting kills 5 random plants per trigger;
  50% of crops die between growth stages.
- *Dark* — weapon range halved; 50% crop loss.
- *Chaos* — the Rage status turns creatures into demons; loyalty −55.
- *Despair* — snow clouds turn children into Cold Ones; forces Hope next.

Two traits (moonchild, nightchild) only function in specific ages.

### World Laws — grouped, iconed, with flavour
Categories: Harmony · Diplomacy · Civilizations · Units · Mobs · Spawn ·
Nature · Trees · Plants · Fungi · Biomes. Roughly 40 laws, each with an icon, a
description, a **one-line flavour quote**, and a documented default.

Examples of the flavour, because the tone is half the value: Diplomacy — "The
game of thrones never ends" · Rebellions — "The people's patience has limits" ·
Stealing Borders — "It's free real estate" · Old Age — "Time claims all in the
end" · Gaia's Covenant — "You once gave it life. Now you give it peace" ·
Handsome Migrants — "Too handsome to trust. Totally up to something".

Mechanically notable ones we lack: 100 People (settlement population cap) ·
Gaia's Covenant (disasters stop damaging terrain) · Stealing Borders ·
Terramorphing (buildings spread their species' biome) · Angry Villagers
(whether civilians are valid targets) · Handsome Migrants (1–4 attractive
migrants appear at bonfires every 16 months when population ≤100) · Erosion ·
Entanglewood (trees slow units 20%) · Bark Bites Back · Plants Tickles · Root
Pranks · Nectar Nap · Exploding Mushrooms · Forever Creep.

### World History — a filterable, iconed log
Filter types: Kings · Favourite units · Cities · Kingdoms · Wars · Clans ·
Disasters · misc. Every entry has an icon and, crucially, **2–8 alternative
phrasings** chosen at random:

> "[king] flees [city] as it has fallen" / "The [city] of [kingdom] has fallen,
> and [king] flees to regroup" / "Losing [city] — [king] flees to save their
> life"

Notable entries we have no equivalent for: kingdom_shattered ("its lands
divided among the heirs"), kingdom_fractured, royal clan changes, and 15
distinct disaster announcements each with its own voice ("Observing how farmers
treated plant life, the pumpkins decided it was time to harvest puny souls!").

### Knowledge — 774 unlockables, collected across all worlds
113 creatures · 95 items · 45 genes · 116 creature traits · 204 subspecies
traits · 78 culture traits · 26 language traits · 29 clan traits · 40 religion
traits · 28 plots. Unlocked by *encountering* them. Separate from achievements,
and deliberately a longer grind. Includes a purely decorative 4-D "knowledge
cube" toy with ~12 knobs.

### Audio
~192 music tracks in 8 banks — **Locations 36, Base 35, Factions 28, Weather 7,
Buildings 3, Unique 23, Unit 54, Other 6** — and ~1,400 sounds in 18 banks,
including a dedicated **UI bank (15)** and **in-game UI bank (16)**. The lesson
is not the volume, it is that music is **contextual**: it responds to where you
are looking, who lives there, and the weather.

### Hotkeys — a complete keyboard scheme
`Space` pause · `H` hide UI · `Tab` / `Shift+Tab` cycle power tabs ·
`Z` / `X` cycle map zone layer · `C` cycle zone state · `F` follow the unit
under the cursor · `G` possess it · `Q`/`E` or `+`/`-` smooth zoom ·
`WASD`/arrows pan · `Ctrl`+wheel game speed · `Alt`+wheel brush size ·
`Esc` back/cancel · `Del` life eraser (again → demolish) · `0`–`9` ten custom
hotkey slots the player fills themselves · `Enter` toggle the selected power ·
`Shift` held = "many mod" (rapid spawn, rapid drop) · arrows/`Tab` navigate
inside windows and cycle between metas.

While possessing a unit: `Space` jump · `Shift` dash · `Ctrl` backstep ·
`F` swear · `Q` steal · `T` talk.

---

## 9. Content inventory (for scoping, not for cloning)

- **Creatures (113):** 4 civilised races; ~35 animals each with an *evolved*
  counterpart (Wolf → Howleer, Crab → Crablin, Sheep → Baakin); ~12 plant and
  food monsters (Lemon Man, Candy Man, Garlic Man, Acid Gentleman); mages
  (evil, white, necromancer, druid, plague doctor); demons, angles, aliens,
  UFOs, zombies, skeletons, tumours, biomass, pumpkins, assimilators, dragons,
  fairies, unicorns, ghosts, fire skulls, elementals; 8 insects; 5 Langton-ant
  variants that terraform as they walk; and jokes (Greg, Tutorial Bear, Robot
  Santa, Crabzilla).
- **Biomes (~30):** the naturals plus Candy, Garlic, Lemon, Mushroom, Crystal,
  Enchanted, Arcane Desert, Rocklands, Permafrost, Flower, Clover, Celestial,
  Singularity Swamp, Paradox, Corrupted, Infernal, Wasteland.
- **Buildings (~20):** bonfire, tents, houses (6 tiers), town hall (3 tiers),
  windmill + farms, wells, mines, barracks, watch towers, statues, temples,
  libraries, markets, docks (2 tiers), training dummies, roads, plus 3 hostile
  towers (ice, flame, angle).
- **Resources:** stone, wood, bone, leather, common metals, silver, gold,
  mythril, adamantine, gems, biomass, infinity coin.
- **Disasters (~15 scripted events):** earthquake, heatwave, meteorite,
  tornado, bandits, biomass, dragon from farlands, evil mage, garden surprise,
  Greg abominations, ice ones, mad thoughts, underground necromancer, sudden
  snowman, alien invasion, hellspawn, tumour.

---

## 10. The ten ideas that actually make it feel like WorldBox

Stripping away content volume, this is what the wiki says the game *is*:

1. **Plots** — you see war and rebellion coming, with a progress bar, and can
   intervene. Anticipation instead of surprise.
2. **Happiness with dialogue** — units have an emotional state and *say things
   about it*, including about you poking them.
3. **Contagious social statuses** — laughing, crying and singing spread and
   pull crowds together.
4. **Map layers** — ten different ways to recolour the world by identity, with
   names drawn on the map.
5. **Ages** — world-scale eras that repaint the screen and change the rules for
   30+ years at a time.
6. **The pot mechanic** — culture, language and religion spread through
   conversation and books by weighted lottery.
7. **Loyalty as a visible breakdown** — 18 named factors adding up to a number
   that decides whether a province revolts.
8. **Siting rules** — solitary / cluster / border placement is why their towns
   look like towns and ours look like scatter plots.
9. **Erasers and stamps** — the toolset is symmetrical (build *and* unbuild) and
   includes pure toys.
10. **Voice** — 374 power descriptions, 40 law flavour lines, 57 status
    one-liners, and multi-phrasing on every history entry. It is written, not
    generated.

Items 1–8 are mechanics; 9–10 are craft. **None of them require 774
unlockables.** That is the whole thesis of [08-MASTER-PLAN.md](08-MASTER-PLAN.md).
