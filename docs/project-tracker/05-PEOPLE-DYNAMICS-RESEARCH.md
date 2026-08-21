# 05 — People Dynamics: What WorldBox Actually Does

Research pass 2, fetched 2026-08-21 from the Official WorldBox Wiki (the pages
that blocked scraping last time are readable through a real browser). This
document exists to answer one question: **why does Aetheria's world feel empty
and static compared to WorldBox, when it has more or less the same features?**

Sources:
- [Villages](https://the-official-worldbox-wiki.fandom.com/wiki/Villages)
- [Kingdoms](https://the-official-worldbox-wiki.fandom.com/wiki/Kingdoms)
- [Unit Tasks](https://the-official-worldbox-wiki.fandom.com/wiki/Unit_Tasks)
- [Jobs](https://the-official-worldbox-wiki.fandom.com/wiki/Jobs)
- [Families](https://the-official-worldbox-wiki.fandom.com/wiki/Families)
- [Map Creation](https://the-official-worldbox-wiki.fandom.com/wiki/Map_Creation)

---

## 1. The scale mismatch (the biggest finding)

WorldBox map sizes, in tiles:

| Name | Tiles |
|---|---|
| Tiny | 128×128 |
| Small | 192×192 |
| Standard | 256×256 |
| Large | 320×320 |
| Titanic | 512×512 |

**Aetheria's "Medium" (128×128) is WorldBox's *smallest* map.** And on that
smallest map, a WorldBox village claims **3×3 zones at founding, where a zone is
8×8 tiles — 576 tiles**. It grows from there.

Aetheria's villages claim a 4-tile radius from a bonfire: about **50 tiles**,
growing to maybe 150. That is **4–10× too small for the map**, which is exactly
why the world reads as a big empty green expanse with a few specks on it.

Two things follow:
- Village claims must be far larger, and must keep growing on their own.
- The map needs *more* settlements on it, which means colonisation (§3).

## 2. Anti-stuck machinery is a first-class feature

WorldBox's task list contains, as named behaviours:

- `move_from_block` — get out of a position you should not be in
- `check_if_stuck_on_small_land` — notice you are stranded on a tiny island
- `swim_to_island` — swim across water to reach land
- `random_swim` / `move_to_water` — deliberate water movement
- `try_to_return_to_home_city` — walk home
- `teleport_back_home` — **give up and teleport home**
- `run_to_water_when_on_fire`

That last one is telling: a decade-old commercial god game still keeps an
explicit "if this unit is hopelessly stuck, put it back where it belongs" escape
hatch. Emergent simulations strand their agents; the fix is not to prevent every
case, it is to detect and recover.

Aetheria has none of this, and three concrete bugs that create it:

1. `handleMovingState` **never checks walkability**. When A* fails it falls back
   to `path = [targetTile]` and walks a straight line — through water, through
   mountains, into anything.
2. `isWalkableForEntity` only blocks `deep_ocean` and `ocean` for land
   creatures, so shallow water, rivers and lakes are freely walkable and a
   creature can simply stand in the sea.
3. Nothing detects a creature that cannot move. A unit in a lowered pit or a
   meteor crater, or on a one-tile island, fails its wander check every tick
   and stands there until it starves.

That is the reported "people are falling into the holes and not coming back".

## 3. Kingdoms grow by colonising, not by expanding one village

The rule set for founding a *second* village:

- The kingdom needs an adult king, must not be at war, and the Kingdom
  Expansion law must be on.
- A kingdom whose reachable villages all have **≤30 people** cannot found a new
  one.
- To be chosen to send settlers a village needs **≥30 adults**, and one of:
  older than 5 years, OR population over 22, OR (population under 22, no free
  housing, older than 10 years, more than 2 houses).
- The chosen village sends **6–12 settlers**, plus up to six family members
  (lovers move first; children, leaders, kings and captains do not go).
- Settlement prefers free zones on the same island; otherwise a transport boat
  carries settlers to another island.

Aetheria has **no colonisation at all**. A kingdom is founded with one village
and dies with one village. Every "kingdom" in the game is really just a village
with a fancy name — which is precisely the "how they become / how it is
outlined" problem.

Also worth copying:
- **Capitals.** The first village is the capital, gets a loyalty bonus and never
  rebels. Kings live there.
- **Village limits by race** — humans +5, orcs +4, elves/dwarves +3, plus
  bonuses from the king's stewardship and traits. Exceeding the limit costs
  **-25 loyalty per excess village**, which is what triggers rebellions.
- **Borders grow through a leader task** (`claim_land`), prioritised by the
  leader's stewardship — not as a side effect of building.
- **Village decay.** A village that loses its whole population becomes
  abandoned and decays zone by zone.

## 4. Animals move in herds, and herds migrate

Family/herd decisions, with WorldBox's own cooldowns:

| Decision | Effect | Cooldown |
|---|---|---|
| `family_alpha_move` | The alpha picks a direction — herbivores head toward buildings, carnivores toward other creatures, otherwise random | **200 s** |
| `family_group_follow` | Everyone else follows the alpha | 5 s |
| `family_group_join_or_new_herd` | A loner tries to join a nearby family | 60 s |
| `family_group_leave` | An adult leaves a full family (only when safe) | 20 s |
| `family_check_existence` | A family of one dissolves | 60 s |

Family types: **None**, **Normal** (no alpha), **Alpha** (oldest member leads).

This is the single cheapest source of "the world is alive". One animal in ten
picks a destination a long way off every few minutes and eight others follow it
across the map. Aetheria's animals each wander independently inside a 4-tile
box, which is why nothing appears to *go* anywhere.

## 5. Villagers have somewhere to be

Village life is made of small, visible errands:

- `city_idle_walking`, `random_move_near_house`, `stay_in_own_home`,
  `find_house` — villagers orbit their homes and the village centre
- `socialize_try_to_start_near_bonfire`, `socialize_go_to_target`,
  `socialize_do_talk`, `socialize_receiving` — **units walk to each other and
  talk, and the bonfire is the meeting point**
- `child_follow_parent` — children trail their parents
- `find_lover`, `check_lover_city` — pairing before reproduction
- `chop_trees`, `mine_deposit`, `collect_fruits`, `collect_herbs`,
  `farmer_make_field`, `farmer_plant_crops`, `farmer_harvest`,
  `store_resources`, `claim_land`, `try_build_building`, `build_road`
- `try_to_eat_city_food`, `give_tax`, `put_out_fire`, `cleaning`

Aetheria's villagers gather and deliver, and that is all. The `social` need
exists on every creature and **does nothing** — it drains and is never
satisfied.

## 6. Jobs are staffed by demand, with hard caps

Concrete numbers worth copying:

- Warriors are hired once a village passes **population 15**; max warriors =
  `adult population × (0.35 + leader warfare bonus)`.
- One **captain** per village. Warriors follow their captain, and the captain
  *deliberately moves slower so the army keeps up*. Armies move as a group.
- Gatherer headcount scales inversely with the granary: >100 food → 1 gatherer,
  >60 → 4, >40 → 5, >20 → 7, otherwise 10.
- Woodcutters: 1 if the village has >15 wood, otherwise 3.
- Builders max 3, cleaners 1, hunters 1.
- Jobs are cancelled when a unit wants to reproduce or socialise — social life
  outranks work.

Aetheria assigns a flat 12% of a village to warriors (35% at war) and everyone
else to "gatherer", with no caps tied to what the village actually needs.

## 7. What this meant for Aetheria — all done

Ranked by how much the world would *feel* different per unit of work. Every one
of these is now built; details and evidence in
[01-STATUS.md](01-STATUS.md#phase-8--people-dynamics-done-2026-08-21).

1. ✅ **Stranding bugs fixed.** Movement validates the ground it walks onto,
   water is off-limits to weak swimmers, land animals drink from the bank, and
   there are three escape hatches: a movement watchdog, a flood-fill
   confinement check, and a last-resort teleport toward home.
2. ✅ **Herds with a leading alpha** (`utils/herdSystem.ts`). Deer herds now
   cross 20 tiles together.
3. ✅ **Colonisation.** Villages send 3–5 settlers who walk to a site and found
   the village on arrival. Kingdoms reach 3–5 villages and ~1,000 tiles.
4. ✅ **Bigger, self-expanding claims.** Claim radii roughly doubled and
   villages work their borders outward over time; a capital reaches ~520 tiles,
   in the same league as WorldBox's 576.
5. ✅ **Socialising at the bonfire.** The `social` need is finally satisfiable.
6. ✅ **Warbands** behind a captain that marches at 72% speed.
7. ✅ **Demand-driven jobs with caps**, gatherers scaling inversely with the
   granary exactly as WorldBox's do.

Deliberately still out of scope (see [04-ROADMAP.md](04-ROADMAP.md)): cultures
and knowledge trees, religion, money and taxation, items and equipment, boats,
loyalty/rebellion plots, and the full 118-creature roster.
