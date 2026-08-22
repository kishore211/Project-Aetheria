# 09 — WorldBox, second pass: how it actually *looks*

The first research pass ([06](06-WORLDBOX-COMPLETE-REFERENCE.md)) catalogued
WorldBox's **systems**. It was thorough and it was aimed at the wrong question.
Three rounds of work later the owner was still saying *"I still don't feel the
map, animations and everything"* — so this pass asks only one thing: **what does
WorldBox do to make its world feel alive, and how is it done?**

## How this was gathered, honestly

Seven parallel researchers, one per subject area. `WebFetch` returned HTTP 402 on
every wiki URL, so they went through the MediaWiki API (`api.php?action=parse`)
with curl and read **raw wikitext** — which means the quotes below are source
text, not a summariser's paraphrase. One researcher bulk-fetched and grepped
**all 75 version changelog pages**, which is where most of the animation detail
turned out to live.

Total: ~275,000 characters of research across the visual, powers, creatures,
city-building, economy, UI and long-tail slices. Sprite dimensions came from
`prop=imageinfo`.

**What failed:** six parallel code-audit agents and two synthesis agents hit the
session limit. The code audit was done by hand instead, and it found the single
biggest defect in the project (§2 below), so nothing was lost that mattered.

---

## 1. The numbers that reframe everything

| Thing | WorldBox | What it tells us |
|---|---|---|
| Source tile size | **8×8 px** | Their world is *tiny* per tile. Detail comes from variety, not resolution |
| Total tiles | **185**, 71 unique before variants | Nearly 2.6 variants per unique tile on average |
| Biomes | 23 (29 with specials) | Comparable to our 28 |
| Whole-world palette | **~92 hex codes** | A deliberately small palette *is* the hand-made signal |
| Tiles with an outline | **12 of 185** | Restraint, not absence |
| Looped audio beds | **4** | Sea, ocean, map, lava |
| One-shot sound effects | **1,432** | A 358:1 ratio of one-shots to loops |
| Full-screen lighting overlays | **9**, and they stack | Not a real light pass |
| Age of Hope share of playtime | **~53%** | Novelty is rationed so that an overlay reads as an *event* |

The shape of that table is the whole lesson. WorldBox is not visually rich
because it has high-fidelity art. It is visually rich because **a small number of
cheap things are varied enormously**.

---

## 2. The defect this research exposed

Our sprite frame generator claimed a "two-frame walk cycle" and built frame two
by mirroring the bottom three rows of the sprite grid. Every template's leg rows
are horizontally symmetric — `...pp..pp...` mirrors to itself — so the two frames
were **pixel-identical for six of the seven templates**.

**There had never been a walk animation in this game.** Every creature was a
static sprite sliding across the ground. Nothing could have caught it: frames
were only ever compared by object identity, so two identical textures looked like
a working cycle.

Fixed in `0fdda63`, with the pose transform extracted as a pure function and
tested against every template. This is the answer to "the animations don't feel
right" — there were none.

Three further defects in the same code path, all the same class of mistake
(*wall-clock time in a simulated world*):

- Frame and bob timing ran off `Date.now()`, so at triple speed creatures
  skated — legs at 1×, ground at 3×.
- The bob ran at 25 Hz with 0.05-unit amplitude on a 0.4-unit creature, which is
  vibration, not a walk.
- Fleeing re-rolled `Math.random()` into the sprite offset every frame — white
  noise at frame rate, which reads as a rendering fault rather than panic.

---

## 3. Tiles: how WorldBox kills the grid

**Three random art variants per biome tile.** The `Tiles` table has literal
columns *Tile 0 / Tile 1 / Tile 2*; 52 biome rows have all three. Quote:
> *"Some tiles, such as biome tiles, have different variants to add more
> diversity to your worldscape automatically"*

Flowers ship **ten** variants each, in two palettes.

**High and low elevation art are different colours, not shaded versions of one
colour.** Grass High `5F833C` vs Grass Low `7EAF46`. Elevation is legible with no
lighting pass at all.

**Twelve tiles have a separate edge colour.** From the `Tiles` page: *"If two hex
codes listed by a tile, the one after the comma is the edge color of the tile."*
The complete list is sand, shallow water, three snow tiles, and the six
player-built wall types. The outline is spent **exactly and only** on the
waterline, the snowline, and things the player built. Everything else is flat.

**The soft coastline is baked at world-generation time, not rendered.** 0.21.0
added a three-pass noise generator — *"noise level"*, *"noise - details - a second
pass that refines the edges of tiles"*, *"noise - bonus - a third pass"* — plus
*"add ring effect — would add a smooth transition near high/low tiles and
coastlines"* and round/square edge modes.

Named boundary assets exist as real tiles: `TileWaterBorder`,
**`TileWaterBorderRunup`** (a literal beach run-up), `tileBorderPit`.

---

## 4. Water, and what animates at all

Water is **three depth tiers**, progressively darker: Shallow `55AEF0` → Close
Ocean `4084E2` → Deep Ocean `3370CC`. Movement penalty −80%/−90%.

It animates: 0.12.02 *"New improved wave effect"*, 0.22.0 *"waves effect on water
should be more visible"*. **The wiki never says how** — scrolling tile, UV shader
or overlay sprite is unknown. We chose a GPU vertex/fragment injection (`2730615`).

**Only ~6 biomes animate their ground tiles** — enchanted, swamp, inferno,
biomass, tumor, pumpkin vines. All six are biomes that *do something to units
standing on them*. Animation is a gameplay signal, not decoration.

Lava is a four-level fluid with real volume arithmetic:
`Lava3 = Lava2+Lava0 = Lava1+Lava1 = 4×Lava0`, brighter = deeper.

---

## 5. Creature variety, for almost nothing

**One greyscale asset plus a two-stop colour ramp.** WorldBox ships **52
From→To colour pairs** ("phenotypes") as shader uniforms. That is their entire
creature colour variety for the price of two `vec3`s each. The phenotype is
picked *by biome but randomised among all qualifying palettes*, so the same
species in the same place still surprises you.

**Every creature is a pair** — a beast form and an uplifted bipedal form, with
one mechanic converting between them. 56 base creatures became a 118-entry
roster; 36 of those entries were free.

**Size is one float on a base of 0.1**, with traits adding absolute deltas
(Giant +0.05, Fat +0.02, Tiny −0.02, Agile −0.01). Silhouette variety falls out
of the trait system. A *separate* 18-tier integer `creatureSize` gates predation:
a carnivore may only hunt size ≤ its own. One comparison, a whole visible food
chain.

**Held equipment is a tiny second sprite** — 4 weapon shapes × 9 material tints,
rendered ~10× oversize when zoomed in. A creature's tech tier is readable across
the map with no UI.

Animation, in their own words from the changelogs: *"units random shake
animation"*, *"jumping animations"*, horizontal sprite flip for facing, and
`action_dead_animation`. **Locomotion is a hop, not a walk cycle**, and there are
no turn frames.

---

## 6. Towns that look designed

This is the mechanism behind WorldBox towns reading as places rather than
scattered boxes:

- An **8×8 zone grid** under the world. Buildings are placed in two stages:
  choose a zone, then choose a tile inside it by the culture's rule.
- **Three siting classes.** *Cluster* buildings need a neighbour in an adjacent
  zone; *solitary* buildings need adjacent zones completely empty; *border*
  buildings need an adjacent **foreign** zone. That alone produces a dense core,
  a green belt, and frontier watchtowers with no city planner.
- **A named layout trait per culture** — perfect grid, honeycomb, rings,
  labyrinth, diagonal, checkers, rings-from-map-centre. You can identify a
  civilisation from the minimap silhouette alone.
- **Footprints grow with tier** (3×3 → 5×3 → 7×3), not just textures. Silhouette
  change is how you read a town's wealth from a zoomed-out camera.
- **Two random designs per tier**, re-rolled on each upgrade.
- **Roads for free**: each time a building is planned, connect one random
  existing building to its two nearest neighbours. Zero resource cost, plausible
  organic street mesh.
- Every settlement is anchored on one origin building; if it dies, a house is
  demolished and rebuilt there, so a town always has a centre.

---

## 7. The economy, made visible

- **Eating is a purchase.** 5 coins a meal; kings, leaders, children and the
  starving are exempt; hungry thieves rob the city treasury. One rule turns food
  from a progress bar into a class system.
- **Loot → tax → money** as three separate fields on the unit, so every wage
  visibly passes through a lord's hands.
- **Buildings yield loot per tick, scaled by tier and modified by biome**
  (T1 house 1 → T6 house 6; Town Hall T3 = 10; Clover +3, Wasteland −2). The
  architecture *is* the income graph.
- **The tool-in-hand rule** — hoe, bucket, axe, pickaxe, hammer, basket, and
  empty-handed while harvesting. The whole labour economy is readable from
  silhouettes at any zoom.
- **Inverse-scarcity job caps as step functions**: food >100 → 1 forager, else up
  to 10. The crowd in the fields visibly swells during a famine.
- **The city ledger is four one-line terms**: `+1 per 2 citizens, −1 per
  homeless, −1 per 2 warriors, −1 per 2 buildings`, clamped at zero.
  Homelessness costs twice a soldier; over-building bankrupts you.
- Jobs are **cancelled** when a unit wants to reproduce or socialise, so the
  player watches a harvest stall for a wedding.

---

## 8. Sound: the ratio is the design

**4 loops against 1,432 one-shots.** Every repeated action is round-robined from
a pool: `BushSpawn_001`–`016`, `PalmSpawn_001`–`016`, `CactusSpawn_001`–`006`,
**20 variants for placing TNT alone**, 52 generic spawn variants.

Terrain painting emits **one sound per material** — `_Sand`, `_Soil`, `_Forest`,
`_Hills`, `_Mountains`, `_DeepOceanFill`. The map sounds like a place.

The UI has three knob sizes (`SmallKnob`/`MediumKnob`/`LargeKnob`) and distinct
tab-on/tab-off sounds, so the bar feels physical under the finger.

Music is **layered from stems chosen by what the camera currently frames**
(0.21.0: *"Music depends on what is currently on screen"*), not whole tracks.

---

## 9. Lighting, weather and the world behaving on its own

**Lighting is nine named full-screen overlays that stack** — Sun, Darkness,
Night, Rain, Moon, Chaos, Magic, Winter, Ash — plus four particle systems. Not a
light pass. Despair = Darkness + Winter + Night.

**There is no day/night cycle.** Darkness is a rare *era*. WorldBox keeps the
world normal ~53% of the time precisely so that an overlay reads as an event. A
24-hour cycle spends that novelty every few minutes. *(We have a day/night cycle.
Worth reconsidering — see the plan.)*

**Clouds are one horizontally-drifting sprite with a drop type.** Weather,
plagues, buffs, biome seeding and hell-rain are all the same ~100-line system
with different `{drop, effect, colour, speed, size, age}` rows.

**A world-behaviour table** is what makes an idle WorldBox world feel alive: one
data-driven scheduler where every ambient process is a row of
`{name, interval_min, interval_max, action}` — vegetation spread 0.02–0.06
months, road decay 0.2–0.4, mineral spawn 0.4–1.0, animal spawn 0.5–0.9,
disasters every 16.

**One hidden per-tile `temperature` scalar with a threshold cascade** does
enormous work: >5 unfreeze/evaporate, >10 ignite + 50 damage, >20 detonate
explosives + strip biome, >30 soil→sand, >100 sand→lava, >160 mountain→lava.
Melting a continent is emergent rather than a bespoke power.

**Biome step-actions at ~5% chance** give tiles character for one field:
Paradox ages you a year per step, Singularity teleports you to another Singularity
tile, Corrupted curses you and turns your corpse into a ghost, Swamp costs −40%
speed.

---

## 10. UI tricks worth stealing outright

1. **Saturation as progress** — plot icons are drawn desaturated and fade to full
   colour as they fill. You read "how close" without opening anything.
2. **The six-step happiness face, absent entirely for things that cannot feel.**
   The missing icon is as informative as the icon.
3. **Percentage on the bar, raw signed number on hover.**
4. **`Esc` unwinds everything** in order: console → possession → unit focus →
   previous window → quit prompt.
5. **Colour-code numbers by threshold** — red 0–3, orange 4–19, green 20+ — so a
   panel of twenty numbers is scannable.
6. **Two orthogonal layer axes**: `Z`/`X` cycles layer *type*, `C` cycles that
   layer's *granularity* (kingdom → village → unit).
7. **Expression-cascade portraits**, priority-ordered not blended: combat → angry,
   plotting → surprised, at war → normal, disloyal → sad, else happy.
8. **Every meta gets exactly two buttons** — a List window and a Zone layer. One
   rigid law, twelve systems, one pattern to learn.
9. **Itemised signed-factor breakdowns** with named rows, explicit caps and a
   running total, so every rebellion is auditable. *(We have this for loyalty.)*
10. **Border fills fade to outlines-only as the camera descends** — how one map
    is both a strategy view and a diorama.
11. **Animated coins flying between units during trade**, and a visible effect
    when beliefs spread. Invisible simulation becomes ambient animation.
12. **Ten user-assignable hotkey slots** (`0`–`9`, `Ctrl`+digit to save).

---

## 11. What this pass concludes

The first pass asked *what does WorldBox simulate* and we built most of it. This
pass asks *what does WorldBox show you*, and the answer is a short list of very
cheap tricks applied with unusual discipline:

> **Vary a small thing enormously. Spend outline only on silhouettes that matter.
> Animate only what has meaning. Ration novelty so it stays novel. Never let a
> repeated action produce an identical sound or an identical frame.**

Our world had, until this week, **zero** per-frame animation on the terrain and
**zero** working creature animation. Every feature we added on top of that was
paint on a photograph. That is why the complaint kept coming back.

The plan that follows from this is [08-MASTER-PLAN.md](08-MASTER-PLAN.md),
Phase 16 onward.
