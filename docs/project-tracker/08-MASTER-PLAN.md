# 08 — Master Plan

Built from [06-WORLDBOX-COMPLETE-REFERENCE.md](06-WORLDBOX-COMPLETE-REFERENCE.md)
and [07-UI-TEARDOWN-AND-SPEC.md](07-UI-TEARDOWN-AND-SPEC.md). This supersedes
[04-ROADMAP.md](04-ROADMAP.md) as the working plan; 04 remains the record of
what was deliberately dropped in earlier passes.

## The thesis

WorldBox has 374 powers, 113 creatures and 774 unlockables. We will never match
that, and matching it is not what would make Aetheria good. What makes WorldBox
feel the way it does is a much shorter list, and almost all of it is **feedback
density**, not content volume:

> The world constantly tells you what it is doing — through icons above units,
> bubbles, plot progress, map layers, era overlays, and a log written in a
> human voice. Aetheria simulates nearly as much, and *says* almost none of it.

So the plan is ordered by **feel per hour of work**, not by system size.

---

## Phase 9 — The world talks back  ★ highest value

Everything here is already simulated and simply invisible. No new simulation.

| # | Item | Status | Notes |
|---|---|---|---|
| 9.1 | **Unit icon rail** — office and activity icons above each creature | ✅ done | `utils/unitIconLayer.ts` — one draw call, stable per-unit slots, culled by zoom. Plain "travelling" deliberately gets no icon: an arrow over every head is noise |
| 9.2 | **Hover tooltips** for units and tiles | ✅ done | `HoverTooltip.tsx`; 15 Hz sampling, republished only on change |
| 9.5 | **Refusal cue** — ✕ and a thunk when a power can't apply | ✅ done | Powers now return whether they acted |
| 9.6 | **Brush preview** reticle under the cursor | ✅ done | |
| 9.3 | **Floating text** — damage, heals, resource gains, births, deaths | ✅ done | `utils/floatBridge.ts` + `FloatingText.tsx`. 64-slot recycled pool, no React below the container; numbers fade out as you pull back |
| 9.4 | **Speech / thought bubbles** with written lines | ✅ done | `utils/dialogue.ts` — 18 occasions x 3-4 lines. Rationed at ~1.6/s globally with a 14 s per-unit cooldown, plus a coin flip so the budget spreads across the population. Phase 10 will widen the occasion table, not rebuild it |
| 9.7 | **Important-event flash** for big moments | ✅ done | `ScreenFlash.tsx`, four tones. Vignette not flat wash; off under `prefers-reduced-motion` |
| 9.8 | **Screen shake** on meteor/quake | ✅ done | Through `camera.setViewOffset`, *not* camera position — MapControls absorbs a position offset into its orbit state and the shake becomes a permanent random walk (measured 0.09 units of drift per lightning strike). Amplitude in screen pixels, so it reads the same at every zoom |
| 9.9 | **Number tweens** for counters and bars | todo | `useTween` hook |

Landed alongside, both found by testing the above:
- **Village leaders and kings are real units now**, so the icons have someone
  to point at and `Kingdom.kingId` refers to a person. Groundwork for Phase 14.
- **Fire no longer consumes the world.** Its spread rate gave every fire a
  branching factor near three; a single pyromaniac wiped out a 33-creature
  world in 24 seconds. Fire is now `utils/fireSystem.ts` with the cascade
  under test.

**Gate:** a player can name three things happening in the world without
clicking.

## Phase 10 — Happiness, mood and voice  ✅ done

The emotional layer, which is what makes creatures read as characters.

| # | Item | Status | Notes |
|---|---|---|---|
| 10.1 | **Happiness** −100…+100, six-step face, in the inspector and above units | ✅ done | `utils/mood.ts`. Drifts toward a baseline from needs/health/belonging rather than being set directly, so a mood is a *consequence* of a life. Slow on purpose: a mood that tracked circumstance instantly would flicker every time a creature took a drink. Only the four strong moods draw a face above a head |
| 10.2 | **Scenario table** — events that move happiness, with dialogue | ✅ done | `utils/scenarios.ts`, 22 entries. One door for every emotional event, so mood, status, speech and glyph cannot disagree |
| 10.3 | **Contagious social statuses** | ✅ done | Laughing, crying, singing spread between people who share a home, over seconds rather than in one tick |
| 10.4 | **Best friends and lovers** | ✅ done | Pair on similar mood; lovers gate reproduction for the four races. Animals exempt — herds, not pairs |
| 10.5 | **Status effects proper** | ✅ done | `utils/statusEffects.ts`, 26 typed statuses with label, glyph, duration, mood weight and flavour. Fixed a real bug: timed statuses used `setTimeout`, so they ran on the wall clock — the only durations in the codebase not on simulated time |
| 10.6 | **The player is felt** | ✅ done | The Poke power. One damage, eighteen mood, and it says so |

**Gate:** met. Creatures visibly react to their own lives, and say things.

### The lesson this phase kept teaching

Three separate times, a change here moved the random stream and broke the
herd grazing test, because animals were drawing from `Math.random()` on behalf
of features that could never apply to them — first the speech coin flip, then
the social timer. **Guards go cheapest and most selective first, and a
subsystem an entity cannot participate in must not consume its randomness.**
The test was also at fault: with 8 sheep its p10 was 0 survivors and its p90
was 10, so it was measuring its own sampling noise. It now runs 24 sheep and
asserts the mean surviving *fraction*, which held at 0.78 across streams.

---

## Phase 11 — Ways to look at the world

| # | Item | Notes |
|---|---|---|
| 11.1 | **Map layer system** | ✅ done | `utils/mapLayers.ts`. Six layers: natural, borders, height, rainfall, warmth, fertility. `Z`/`X` cycle. Ramps monotonic in lightness (enforced by test) so they survive greyscale; decoration hidden and sea muted on data layers. Culture/religion layers land with Phase 15, which is when there is anything to paint |
| 11.2 | **Map labels** | ✅ done | `utils/labelBridge.ts` + `MapLabels.tsx` |
| 11.3 | **List windows** — villages, kingdoms, wars, herds, families; click a row to fly there | One reusable panel |
| 11.4 | **Chronicle 2.0** | ✅ done | `utils/chronicle.ts` — 25 topics, 76 phrasings, no consecutive repeats. Four filter chips (not one per kind: seven is a second interface to learn) and per-kind glyphs so the log can be *skimmed*. Brought `matchesTopic` with it, because three settlement tests were asserting prose |
| 11.5 | **Statistics window** | ✅ done | `utils/worldStats.ts` + `StatsPanel.tsx`. Ring buffer of 120 samples on *simulated* time, so triple speed fills it three times as fast and a paused world records nothing |
| 11.6 | **Minimap layers** | ✅ done | Paints whatever layer the big map is painting. Two views of one world that disagree about what they show is worse than having no minimap |

**Gate:** ten different questions about the world can be answered from the map.

## Phase 12 — The power bar

| # | Item | Notes |
|---|---|---|
| 12.1 | **Bottom bar with 7 tabs + contextual Unit tab** | ✅ done | `PowerBar.tsx`; sidebar and separate time bar deleted. Bar hugs its contents rather than reserving a fixed span |
| 12.2 | **Descriptions with jokes** for every power | ✅ done | `utils/powers.ts` — catalogue is plain data, so powers can be added and re-tabbed without touching layout |
| 12.3 | **Erasers** — sponge, sickle, bucket, axe, demolish, life eraser, scissors | Mostly inverses of tools we have |
| 12.4 | **Full hotkey scheme** + cheat sheet | ✅ done | `hooks/useHotkeys.ts`; `Space 1-9 Tab Z X H F N M I L +/- Esc`. Numbers printed on the buttons, full list in the help overlay. `Esc` backs out one step at a time |
| 12.5 | **Hide UI** | ✅ done | `H`. Map labels and floaters belong to the world, not the HUD, so they stay |
| 12.6 | **World Laws 2.0** | ✅ done | Grouped, iconed, four presets, and a second line per law that changes with the switch: on it says what the rule does, off it says what your world becomes. More laws arrive with the systems that need them |

**Gate:** the toolbar scales past 60 powers and is fully keyboard-driven.

## Phase 13 — Ages  ✅ done

| # | Item | Status | Notes |
|---|---|---|---|
| 13.1 | **10 eras** with an age clock in the HUD | ✅ done | `utils/ages.ts`. Eight slots, half of them Hope — without that every age is an event, and when everything is an event nothing is. A ring in the top bar fills as the era runs out |
| 13.2 | **Screen overlay** per era | ✅ done | `AgeOverlay.tsx`, crossfaded in a rAF loop. Plain veil, not a blend mode: `soft-light` against mid-grey is the identity, so the Age of Ash looked like nothing at all |
| 13.3 | **Real rule changes** | ✅ done | Fire spread, growth and harshness multipliers, plus periodic global actions — drought, downpour, frost, derangement, ashfall, flourish. Season and age compound |
| 13.4 | **Per-era mood** | ✅ done | Stands in for their loyalty/opinion bonuses until Phase 14 has loyalty to modify |

**Gate:** met. Also a World Law, so it can be switched off — which returns the
world to Hope rather than freezing whatever era was running.

**On rescaling.** Theirs are "≥30 years"; a WorldBox year is ~40 s and ours is
~45 min, so copying the number gives a 22-hour age. Ours run ~7 minutes on the
simulated clock. This is rule 2 of *Rules for the work* in practice.

---

## Phase 14 — Politics: loyalty, plots, rebellion  ✅ mostly done

| # | Item | Status | Notes |
|---|---|---|---|
| 14.1 | **Loyalty per village**, with a visible breakdown | ✅ done | `utils/politics.ts`, 13 factors. The breakdown is the point: a rebellion you cannot see coming is indistinguishable from a bug. Five of their eighteen factors need culture/language/religion/clans/subspecies and arrive with Phase 15 rather than reading zero until then |
| 14.2 | **Rebellion** | ✅ done | 45 s below zero, then the province becomes its own kingdom and the old ruler declares war. The delay is what makes the breakdown worth opening |
| 14.3 | **Plots** | ✅ done | `utils/plots.ts`, six schemes with progress bars, an icon above the plotter, and two ways for the player to break one — kill them or bless them |
| 14.4 | **Civil stats driving behaviour** | ✅ done | diplomacy / warfare / stewardship / intrigue, derived from attributes plus a hash of the id, so nothing needs saving. Stewardship counts double and sets how wide a realm holds together |
| 14.5 | **Succession** | ✅ done | The ablest governor inherits. A weak heir drags loyalty down everywhere, so a king dying can start a rebellion |
| 14.6 | **Alliances, opinions, peace talks** | ◐ partial | Alliances and peace exist as plot outcomes and zero out tension. A full opinion matrix between kingdoms is still open |

**Gate:** met. Verified live: a distant, oversized, wretched province sat at
−36 loyalty, grew restless for 45 s, seceded, crowned its own ruler and went to
war with the realm it left — three chronicle lines, no player input.

**The hard village cap is gone.** A per-race ceiling used to stop expansion
outright; that was a placeholder for politics. Race now shifts *where loyalty
starts to suffer*, and a kingdom is free to overreach and pay for it.

---

## Phase 15 — Identity: culture, religion, language  ✅ done

| # | Item | Status | Notes |
|---|---|---|---|
| 15.1 | **The pot mechanic** | ✅ done | `utils/identity.ts`. Two speakers, each weighted 1–3 by whether their village and kingdom share their identity, one entry drawn. Measured: a settled villager converts a passing stranger about three times in four |
| 15.2 | **Cultures with traits that change behaviour** | ✅ done | Twelve traits, every one wired to something the simulation does. Spacious/dense change the *shape of the town*, which is the most visible of the lot |
| 15.3 | **Religions and languages on the same machinery, with map layers** | ✅ done | Same type, same pot. Three new map layers with a named key rather than a ramp |
| 15.4 | **Books** | ✅ done | Temples and statues write the village down; a passer-by may read it, weighted 3 v 3. How a culture outlives its last speaker |
| — | **Schism plot** | ✅ done | Not on the original list, and the gate was unreachable without it: the pot spreads identities but cannot invent one, so two towns under one kingdom would never have diverged |

**Gate:** met. Two villages of one race started as "Gormesh / the Fal Rite"; fifty
seconds later one was "Ythyn / the Eshr Mysteries".

**Loyalty is now complete-ish.** Shared culture, language and faith are wired in
at their WorldBox weights, taking the formula from 13 factors to 16. The two
still missing (clan, subspecies) need systems nothing else is asking for yet.

---

## Phase 16 — Presentation: make the world *move*  ★ the actual complaint

Built from [09-WORLDBOX-VISUAL-RESEARCH.md](09-WORLDBOX-VISUAL-RESEARCH.md).

This phase exists because the same complaint came back three times — *"I still
don't feel the map, animations and everything"* — after three rounds of work
that each added real features. The second research pass found out why: **the
terrain had zero per-frame animation and creature animation did not work at
all.** Everything built on top of that was paint on a photograph.

Ordered strictly by felt-impact per hour.

| # | Item | Status | Notes |
|---|---|---|---|
| 16.1 | **Real walk cycles** | ✅ done | The frame generator's "two-frame cycle" was a pixel-identical no-op for 6 of 7 templates. Four frames now, as a pose transform on the template, tested. `utils/pixelSprites.ts` |
| 16.2 | **Animated water** | ✅ done | Two overlapping sines, phase from world position, on the GPU via `onBeforeCompile`. A third of the map used to be frozen. `utils/terrainRenderer.ts` |
| 16.3 | **Three material variants per ground tile** | ✅ done | *The* grid-killer. WorldBox ships 3 variants for 52 biome tiles. We have one flat colour per biome plus a ±3% variant jitter — not the same thing. `utils/pixelAtlas.ts`, `utils/terrainRenderer.ts` |
| 16.4 | **Separate edge colour, spent only on the waterline and snowline** | todo | 12 of WorldBox's 185 tiles have an outline. That restraint is what makes the silhouette read. `utils/worldGenerator.ts`, `utils/terrainRenderer.ts` |
| 16.5 | **Wind sway on trees and decoration** | ✅ done | Same GPU trick as the water, on the `SpriteCloud`. `utils/spriteCloud.ts` |
| 16.6 | **Building scale-pulse** | ✅ done | WorldBox's *"little scale animations synced with flow of time speed"* — why a paused WorldBox still looks alive and a sped-up one looks frantic |
| 16.7 | **White flash + scale pop on status gain** | ✅ done | One line, and it is how 200 simultaneous agents stay readable. `utils/entitySystemMinimal.ts` |
| 16.8 | **Hop locomotion + per-unit idle shake** | todo | Their locomotion is a hop, not a walk; they ship *"units random shake animation"*. Cheap on top of 16.1 |
| 16.9 | **Sound variant pools** | ✅ done | WorldBox: 4 loops, 1,432 one-shots, 20 variants for placing TNT alone. Ours plays one identical tone per action. `utils/soundManager.ts` |
| 16.10 | **One paint sound per material** | ✅ done | `_Sand`, `_Soil`, `_Forest`, `_Mountains`. The map starts to sound like a place |
| 16.11 | **Border fills fade to outline as the camera descends** | todo | How one map is both a strategy view and a diorama |
| 16.12 | **Number tweens** (was 9.9) | ✅ done | *"Make the numbers go brrrr."* `components/ui/TopBar.tsx`, `StatsPanel.tsx` |
| 16.13 | **Saturation as progress on plot icons** | todo | Read "how close" without opening a panel. `utils/unitIconLayer.ts` |
| 16.14 | **Held-item sprites** (4 shapes × material tint) | speculative | Tech tier readable across the map with no UI. Needs an item system we do not have |

**Gate:** pause the game, look at the map, and it is still visibly alive.
**Status:** met for water, foliage, buildings and creatures. 16.4 (edge
colours), 16.8 (hop locomotion), 16.11 (border fade on zoom) and 16.13
(saturation as progress) remain — all small, none load-bearing.

---

## Phase 17 — Town craft and economy

Revised against the new research, which explained the mechanism behind
WorldBox towns looking *designed*.

| # | Item | Notes |
|---|---|---|
| 17.1 | **An 8×8 zone grid, and two-stage placement** — pick a zone, then pick a tile in it by the culture's rule | Regular spacing emerges for free; no city planner needed. `utils/settlementSystem.ts` |
| 17.2 | **Three siting classes: cluster / solitary / border** | Cluster needs a neighbour in an adjacent zone; solitary needs adjacent zones empty; border needs an adjacent *foreign* zone. Produces dense core, green belt and frontier towers with no authoring |
| 17.3 | **A named layout trait per culture** — grid, rings, honeycomb, labyrinth, diagonal | Identify a civilisation from the minimap silhouette alone. Extends the twelve culture traits from Phase 15 |
| 17.4 | **Footprints grow with tier** (1×1 → 2×2 → 3×2) rather than only swapping art | Silhouette change is how a town's wealth reads from a zoomed-out camera |
| 17.5 | **Roads for free** — when a building is planned, connect one random existing building to its two nearest neighbours | Zero resource cost, plausible organic street mesh |
| 17.6 | **Loot → tax → money as three fields on the unit** | Every wage visibly passes through a lord's hands |
| 17.7 | **Buildings yield per tick, scaled by tier and modified by biome** | The architecture *is* the income graph |
| 17.8 | **Eating is a purchase** — 5 coins, with exemptions, and hungry thieves rob the treasury | One rule turns food from a bar into a class system |
| 17.9 | **The city ledger as four one-line terms** | `+1 per 2 citizens, −1 per homeless, −1 per 2 warriors, −1 per 2 buildings`, clamped at zero |
| 17.10 | **The tool-in-hand rule** | The labour economy readable from silhouettes. Depends on 16.14 |

**Gate:** two towns of different cultures are distinguishable at a glance, from
the minimap.

---

## Phase 18 — The world behaving on its own

New phase. The research turned up two mechanisms that do a disproportionate
amount of WorldBox's "this place is alive while I am not touching it" work, and
neither is on any earlier plan.

| # | Item | Notes |
|---|---|---|
| 18.1 | **A world-behaviour table** — one scheduler where every ambient process is a row of `{name, minInterval, maxInterval, action}` | Vegetation spread, mineral surfacing, animal spawning, road decay, disasters. Replaces our scattered ad-hoc timers with one readable table |
| 18.2 | **A per-tile `temperature` scalar with a threshold cascade** | >5 thaw, >10 ignite, >20 strip biome, >30 soil→sand, >100 sand→lava. Melting a continent becomes emergent rather than a bespoke power. Merges with the existing Age harshness system |
| 18.3 | **Clouds as one drifting sprite with a drop type** | Weather, plague, blessing-rain and biome seeding all become rows in one ~100-line system |
| 18.4 | **Biome step-actions at ~5%** | Swamp −40% speed, corrupted curses you, badlands parches you. One field on the tile type, enormous character |
| 18.5 | **Disasters that consume a building** | A disaster that needs a windmill and destroys it makes the player's own infrastructure the attack surface |

**Gate:** leave the game running untouched for five minutes and things happen
that are worth watching.

---

## Phase 19 — Content and the long tail

Deliberately last, for the reason at the top of this file: content with no
feedback layer is content nobody notices. Everything here is cheap *given*
phases 16–18.

| # | Item | Notes |
|---|---|---|
| 19.1 | **Creature colour ramps** — one greyscale sprite + a two-stop palette per subspecies | WorldBox got its entire creature variety from 52 From→To pairs. This is the highest variety-per-byte item in the whole plan |
| 19.2 | **Beast/uplifted pairs** — one mechanic converts between them | 56 creatures became 118 entries; 36 were free |
| 19.3 | **Size as one float, with traits adding deltas**, plus a discrete tier gating predation | A visible food chain from one comparison |
| 19.4 | **A joke line for every creature and every biome** | Treated as a shipping requirement, not a nice-to-have. It is most of the game's voice |
| 19.5 | **More biomes and more disasters**, each with a step-action and a flavour line | Volume, but only once 18.4 makes it readable |
| 19.6 | **Ten user-assignable hotkey slots** | `0`–`9`, `Ctrl`+digit to save |

---

## Still open from earlier phases

| # | Item | Status |
|---|---|---|
| 14.6 | **A kingdom opinion matrix** | ✅ done. Signed −100…+100 per neighbouring pair with named factors, and tension now drifts *from* opinion instead of from a pair of magic constants. Peace became the same mechanism as war rather than a special case |
| 11.4 | **Three phrasings per disaster toll** | ✅ done. The counts were fixed strings, so every meteor in history ended with the same four words however many ways the meteor itself was described |

---

## Rules for the work

1. **Every phase ships green.** `npm test`, `npm run lint`, `npm run build`,
   `npm audit` clean, verified live in the browser.
2. **Numbers get rescaled.** A WorldBox year is ~40 s; ours is ~45 min. Never
   paste a cooldown from the wiki — the herd-cooldown and age-length lessons.
3. **Tests stay deterministic**, and a *statistical* claim gets a *sampled*
   test. A single-sample assertion on emergent behaviour is a tripwire: any new
   `Math.random()` call anywhere re-rolls it. `herdSystem.test.ts` learned this
   twice.
4. **A subsystem an entity cannot participate in must not consume its
   randomness.** Guards go cheapest and most selective first. This bit three
   times in Phase 10 alone.
5. **Simulated time, never wall-clock.** `setTimeout` statuses and `Date.now()`
   animation were the same bug in two places, and both were invisible.
6. **Everything stays procedural.** No art or audio files, ever.
7. **Write the copy as we go.** A power without a description is unfinished.
8. **One commit per coherent change,** with the *why* in the message.

## Honest estimate of scale

Phase 16 is a week of work and is the one that answers the actual complaint.
Phases 17–19 are each larger than 16 and each leaves the game better on its own,
so it is worth stopping after any of them.
