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
| 9.9 | **Number tweens** for counters and bars | ✅ done | Landed as 16.12 |

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
| 16.4 | **Edge colour, spent only on the waterline** | ✅ done | 12 of WorldBox's 185 tiles have an outline. That restraint is what makes the silhouette read. `utils/worldGenerator.ts`, `utils/terrainRenderer.ts` |
| 16.5 | **Wind sway on trees and decoration** | ✅ done | Same GPU trick as the water, on the `SpriteCloud`. `utils/spriteCloud.ts` |
| 16.6 | **Building scale-pulse** | ✅ done | WorldBox's *"little scale animations synced with flow of time speed"* — why a paused WorldBox still looks alive and a sped-up one looks frantic |
| 16.7 | **White flash + scale pop on status gain** | ✅ done | One line, and it is how 200 simultaneous agents stay readable. `utils/entitySystemMinimal.ts` |
| 16.8 | **Hop locomotion + per-unit idle shake** | ✅ done | `abs(sin)` was two soft bounces with no rest in them — a hover. Half a sine clipped at zero gives one arc and a beat of ground contact, and the beat is what reads as weight. Squash and stretch on the same clock; idle gets a brief damped twitch phased per creature |
| 16.9 | **Sound variant pools** | ✅ done | WorldBox: 4 loops, 1,432 one-shots, 20 variants for placing TNT alone. Ours plays one identical tone per action. `utils/soundManager.ts` |
| 16.10 | **One paint sound per material** | ✅ done | `_Sand`, `_Soil`, `_Forest`, `_Mountains`. The map starts to sound like a place |
| 16.11 | **Border fills fade to outline as the camera descends** | ✅ done | The border firms up as the fill thins: a line one tile wide gets *harder* to see as you approach it |
| 16.12 | **Number tweens** (was 9.9) | ✅ done | *"Make the numbers go brrrr."* `components/ui/TopBar.tsx`, `StatsPanel.tsx` |
| 16.13 | **Saturation as progress on plot icons** | ✅ done | A fresh plot is nearly grey, a ripe one is blood red. `plottingIds()` carries the share now, and the furthest-along scheme wins when somebody runs two |
| 16.14 | **Held-item sprites** (4 shapes × material tint) | ✅ done | No item system needed after all. Not wood/stone/bronze/iron — bronze and wood are the same warm brown at eight pixels, so the two rungs that matter most would be the two nobody could tell apart. Brown, grey, pale steel, gold |

**Gate:** pause the game, look at the map, and it is still visibly alive.
**Status:** met, and the phase is complete.

---

## Phase 17 — Town craft and economy

Revised against the new research, which explained the mechanism behind
WorldBox towns looking *designed*.

| # | Item | Notes |
|---|---|---|
| 17.1 | **A zone grid, and two-stage placement** | ✅ done. 3×3 zones rather than their 8×8, because a whole town here is six tiles across |
| 17.2 | **Three siting classes: cluster / solitary / border** | ✅ done. Verified live: towers on the outer ring, temple five tiles out, houses packed in the middle. Has a relaxed fallback, because a solitary building that can find nowhere fails *silently* |
| 17.3 | **A layout per culture** — ordered, concentric, honeycomb, diagonal, scattered | ✅ done. The test compares rendered ASCII shapes, which caught `honeycomb` reducing algebraically to `diagonal` |
| 17.4 | **Footprints grow with tier** | ✅ done. Tier 3 stands on four tiles. Every tile of a footprint is tested, not just the anchor — a hall whose corner is on good ground otherwise puts its far side in a lake — and demolition matches the whole block |
| 17.5 | **Roads for free** | ✅ done. Two neighbours rather than one, because one gives a tree with no loops and a real village has junctions. Additive over the biome, so an abandoned site loses its roads |
| 17.6 | **Loot → tax → money as three fields** | ✅ done |
| 17.7 | **Buildings yield, modified by ground** | ✅ done. Fertile 1.4×, badlands 0.6×, corrupted 0.4× — siting becomes a decision |
| 17.8 | **Eating is a purchase** | ✅ done |
| 17.9 | **The city ledger as four one-line terms** | ✅ done. Tested including that a new three-founder village is not already in deficit |
| 17.10 | **The tool-in-hand rule** | ✅ done. Driven by what a creature is *doing*, not what it is; the load decides between axe and pick. Idle hands stay empty, or the tools stop meaning anything |

**Gate:** met, and the phase is complete. Towns have streets, roads, a
treasury and a skyline with a hierarchy in it; two cultures build visibly
different shapes; and you can read a settlement's tech level off the tools in
its people's hands from across the map.

### A note on the map itself

The owner's "when you zoom in it looks like square boxes" turned out to be two
measurable things, both now fixed (`29bc806`): tiles were 0.44 units tall on a
0.5-unit base — very nearly cubes — and their top faces were one flat colour.
Decoding a real WorldBox tile to pixels showed an 8×8 sprite with a mottled
interior of three shades 4% apart, cut corners and a waterline-only edge. See
[10-TILE-ART-SPEC.md](10-TILE-ART-SPEC.md) if present, and §3 of
[09](09-WORLDBOX-VISUAL-RESEARCH.md).

---

## Phase 18 — The world behaving on its own

New phase. The research turned up two mechanisms that do a disproportionate
amount of WorldBox's "this place is alive while I am not touching it" work, and
neither is on any earlier plan.

| # | Item | Notes |
|---|---|---|
| 18.1 | **A world-behaviour table** | ✅ done. Eight rows, one scheduler. Reading the table down is what found the three missing rows: ore surfacing, wildlife refilling a hunted-out forest, and roads fading from a settlement nobody lives in. Each row draws its own next gap, because one clock and a modulo makes every process with a common factor fire together |
| 18.2 | **A per-tile `temperature` scalar with a threshold cascade** | ✅ done. Their ladder's *shape*, none of its numbers — theirs ignite at 10, which on our scale would put half the map permanently alight. Calibrating the fire found a real bug: a sustained source settles at ~25× its rate, and the by-eye figure settled four rungs up and turned every forest fire into a lava field |
| 18.3 | **Clouds as one drifting sprite with a drop type** | ✅ done. Rain is the one with consequence: it is the world's only counterweight to the thermal ladder, so a fire season now ends on its own |
| 18.4 | **Biome step-actions at ~5%** | ✅ done. Speed always on and never announced; the hazard per simulated *second*, because per frame means the world hurts more on a fast machine. Most of the map is deliberately free — if everywhere is difficult then nowhere is |
| 18.5 | **Disasters that consume a building** | ✅ done. Eight of them. Also settles the oldest problem with random disasters — nothing to aim at in an empty world — since the targeting now falls out: no works, no attack surface |

**Gate:** met. Leave it running and vegetation creeps, ore surfaces, wildlife
returns, roads fade, rain puts fires out, and something a village built falls
down.

---

## Phase 19 — Content and the long tail

Deliberately last, for the reason at the top of this file: content with no
feedback layer is content nobody notices. Everything here is cheap *given*
phases 16–18.

| # | Item | Notes |
|---|---|---|
| 19.1 | **Creature colour ramps** | ✅ done. Ours are not greyscale, so this *relights*: every palette entry reduced to its brightness and read back off a two-stop ramp. Eyes are never remapped — do that and a field of wolves becomes a field of coloured smudges |
| 19.2 | **Beast/uplifted pairs** | ✅ done. One flag. Everything downstream already keyed off one question — does this thing have an inner life — so nothing else had to change to let a wolf make a friend |
| 19.3 | **Size as one float, plus a discrete tier gating predation** | ✅ done. The obvious rule — strictly bigger — survives every intuition and then forbids wolves from hunting deer. One band above, and a test walks every pair in FOOD_CHAIN so the next person to retune a size finds out immediately |
| 19.4 | **A joke line for every creature and every biome** | ✅ done. Keyed off the creature's id, not `Math.random`: a line that changes each time you look is noise, and drawing from the shared stream while painting a panel would make the simulation depend on which panels are open |
| 19.5 | **More biomes and more disasters** | ✅ done. Ash, salt flat and bloom, none of them generated — each exists because a system produces it. A biome with no provenance is a colour on a palette |
| 19.6 | **Ten user-assignable hotkey slots** | ✅ done. An unbound digit still does exactly what it did before, and the bar shows the real binding rather than the tab position |

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

## Phase 20 — The replica pass  ✅ done

The owner's verdict after Phase 19 was that it still did not look or play
like WorldBox, and up close the map "looks like squares". This pass went
back to the reference and closed the visible gaps rather than adding depth
to systems that already existed.

| # | Item | Status | Notes |
|---|---|---|---|
| 20.1 | **The map is one painted image** | ✅ done | `utils/mapPainter.ts`. Eight pixels a tile, painted per pixel: interpolated land/height/depth fields (smoothstepped, so a lone tile is a blob rather than a diamond), domain-warped biome choice so edges meander, sea banded by distance to the coast with a foam line, rivers that stay joined on diagonals, crag-lit rock with snow on the ridges, and trees, rocks, reeds and cacti as pixel stamps with cast shadows drawn bottom-to-top. The boxes stay, invisible, for picking only |
| 20.2 | **Territory in the shader** | ✅ done | One-pixel border inside each realm plus a wash, from an owner texture; no more quads per tile |
| 20.3 | **One daylight** | ✅ done | `utils/daylight.ts`. Map, buildings, boats and creatures share the time-of-day tint; icons and labels opt out |
| 20.4 | **Outlines and shading on every sprite** | ✅ done | Derived from the template, so every creature, colour ramp and walk frame gets it. Buildings redrawn with outlines, two-tone roofs, lit windows, at proportions that stand over their people |
| 20.5 | **~75 more powers** | ✅ done | `utils/extraPowers.ts`: terrain by height, sponge and three stamps, ten biome seeds, aimable clouds, heat and cold, tornado, volcano, geyser, lava, acid, grenade → atomic and a void bomb, plague that raises its dead, madness, confusion, divine light, shield, coffee, inspire, sleep, clone, four dusts of forgetting, six diplomacy powers on a Realms tab, and a spawner per creature |
| 20.6 | **Statuses that change behaviour** | ✅ done | Shielded blocks every blow, caffeinated nearly doubles pace, spellbound stands still, confused staggers, enraged attacks the nearest, infected weakens, spreads by contact and rises as a zombie |
| 20.7 | **22 more creatures** | ✅ done | 42 in all, seven new sprite templates; each with food-chain place checked against size bands, herd size, ramps, flavour, habitat and spawner |
| 20.8 | **Boats** | ✅ done | `utils/boats.ts`. Fishing fleets, merchants between friendly ports, and transports that carry settlers to another island when the home one is full |
| 20.9 | **Possession and WASD** | ✅ done | `utils/possession.ts`. G to wear a creature; WASD walks it, Space strikes, Esc lets go. The same keys pan the map otherwise |
| 20.10 | **Relationship lines, fire, Huge maps** | ✅ done | Lines to lover, friend and home; fire pixels flicker in the shader; a 384² preset |
| 20.11 | **Five seeded lands** | ✅ done | Candy, crystal, mushroom, infernal, wasteland — painted materials, decoration, ground effects, wildlife, flavour |
| 20.12 | **Seven more world laws** | ✅ done | Rebellions, Kingdom Expansion, Diplomacy, 100 People, Handsome Migrants, Entanglewood, Erosion; saved laws merge over defaults |
| 20.13 | **Nine more traits** | ✅ done | Fireproof, Giant, Tiny, Venomous, Peaceful, Lucky, Nimble, Glutton, Thick-skinned — each with a mechanic, rolls guarded |
| 20.14 | **Outfits, cloud shadows, snowline** | ✅ done | Warriors in steel, rulers in gold; clouds throw shadows; snow caps get an edge |
| 20.15 | **Fifteen more milestones** | ✅ done | One per new system, keyed to the chronicle lines they already write |
| 20.16 | **Partial texture uploads** | ✅ done | An edit uploads only the patch it touched: brushing a Huge map went from 18 to 120 fps |
| 20.17 | **A ten-minute soak test** | ✅ done | Every system at once, asserting the invariants that must hold between them |

**Still not WorldBox, honestly:** the content long tail (they have ~113
creatures, 374 powers, 774 unlockables), equipment as items, armies as
formations, and the mind/neuron editor. The thesis at the top of this file
still holds — the gap that mattered was what the world looks like and what
the player can do to it, and that is the gap this phase closed.

## Phase 21 — Past the replica  (in progress)

The owner asked for the replica to keep going until it was WorldBox and
then better. This phase takes the gaps Phase 20 named honestly — items,
armies, the content long tail — and the things that only show at scale.

| # | Item | Status | Notes |
|---|---|---|---|
| 21.1 | **Audit clean** | ✅ done | Non-breaking `npm audit fix`, then Tailwind 3 → 4 with the official tool. Its renames of plain words in game text (and one event name, `blur` → `blur-sm`) were reverted by hand |
| 21.2 | **Weapons and armour as items** | ✅ done | `utils/equipment.ts`. Smiths forge from the craft tier and the store; five shapes, nine materials, quality, modifiers, legendary names; wear, breakage, looting from the dead; drawn on the sprite; saved |
| 21.3 | **Arrows and breath** | ✅ done | `utils/shotBridge.ts`. Archers, and six creatures that fight at range — dragon and demon fire that can set the ground alight, bolts, a dark bolt, a beam |
| 21.4 | **Armies in ranks; towns captured** | ✅ done | `utils/army.ts`. Warbands fall in four abreast behind the captain at war; a fallen town changes flag with its land and people (orcs still burn) |
| 21.5 | **Twenty more creatures** | ✅ done | 62 in all. Six with auras on their own clock: necromancer, Cold One, fire skull, plague doctor, bee, Crabzilla (`utils/creatureAbilities.ts`) |
| 21.6 | **Magnet and new powers** | ✅ done | `utils/magnet.ts`; twelve trait gifts and an eraser, rain of arms, gold rain, youth, love potion, locusts, cluster bomb |
| 21.7 | **Town buildings and racial styles** | ✅ done | Windmill, barracks, smithy, library, each with an effect; every race builds in its own materials |
| 21.8 | **Banners** | ✅ done | `utils/heraldry.ts`. Field, division and charge from the kingdom id; in the list and on the map |
| 21.9 | **Families, clans, levels** | ✅ done | `utils/families.ts`. Surnames down the generations, parents remembered; units level from kills |
| 21.10 | **Realm card** | ✅ done | Ruler, seat, army, allies, relic, from the kingdom list |
| 21.11 | **One draw call for every creature** | ✅ done | `utils/creatureLayer.ts`. 2,000 creatures: 4,022 calls and 10.5 ms → 23 calls and ~0.1 ms |
| 21.12 | **House tiers** | ✅ done | Hut → stone house → manor, gated on hall and temple/library |
| 21.13 | **Deterministic test ids** | ✅ done | uuid was the hidden source of the one-in-ten unreproducible failures |
| 21.14 | **Monster visits** | ✅ done | `utils/monsterEvents.ts`. Dragon, UFO, Crabzilla, bandits, necromancer, Cold Ones in winter — aimed at a town, each with its precondition |
| 21.15 | **Night windows, seasonal fields, lunges** | ✅ done | Windows keep their light after dark; farms green/gold/frost; attackers lunge and face their target |
| 21.16 | **The mind editor** | ✅ done | `utils/mind.ts`. Eight drives switchable per creature in the inspector |
| 21.17 | **Demographics from a headless 30-minute game** | ✅ done | Random deaths were a quarter of a human life; caps were tiny; migrants were most of the chronicle; the wild emptied as towns grew. All four fixed; a glacier re-freezing spam found the same way |
| 21.18 | **Favourites, Knowledge book, watchtowers** | ✅ done | `utils/knowledge.ts`. Star creatures; a bestiary remembered across worlds; towers shoot monsters and enemies |
| 21.19 | **Twenty laws; flame and ice towers; wells, markets, docks** | ✅ done | Animal spawns, Monster visits, Peaceful monsters, Forging; hostile towers as placeable structures; three town buildings with effects |
| 21.20 | **Alliance and town layers; winter snow on trees** | ✅ done | Two more map layers; canopies and rocks dusted with snow in winter |
| 21.21 | **Ten more creatures** | ✅ done | 74 in all: white mage, angel, sandworm, Langton's ant, tumor, treant, candy man, jumpy skull, Robot Santa, yeti — each with its own behaviour |
| 21.22 | **Wars cross the sea; wars of succession** | ✅ done | Warbands take ship for enemies on other islands; a contested crown can split a great realm |
| 21.23 | **Seventeen scripted visits** | ✅ done | Plus mad thoughts, snowmen, hellspawn, alien invasion, evil mage, plague (with a doctor half the time) |

## Where this ended up

Phases 16 through 19 are complete, along with the two items carried over from
earlier. What is worth recording is not the list but the four things the work
kept teaching, because they are the ones that will come up again:

**The map problem was structural, not decorative.** Three rounds of tile art
did not fix "it looks like square boxes" because each tile was its own instance
and a shader that can only see its own tile draws four perfectly straight
edges. The fix was to put the whole map in a texture so a fragment can read its
*neighbour* — and then the dithered boundaries, the per-pixel coastline and the
grain that survives across a seam all fell out of that one change.

**Numbers off a wiki are wrong here, and the way to find out is to check them
against something.** Their ignition threshold of 10 would have set half our map
alight. The fire heat, picked by eye, settled four rungs up the ladder and
turned every forest fire into a lava field — visible only by asking where it
*settles* rather than how hot it feels. The predation rule forbade wolves from
hunting deer, visible only by walking every pair in the food chain.

**Tests on emergent behaviour must be sampled, and the ones that are not will
lie.** The colonisation test was pinned to the exact global `Math.random`
sequence, so adding a single `THREE.Texture` — whose uuid costs four draws —
turned it red while colonisation still happened on nine streams in twelve.

**One idea, applied once, is usually worth more than the feature it replaces.**
A drop type turned weather, plague, blessing and seeding into four rows. A
precondition turned random disasters into a reason to think about what you
build. One flag doubled the bestiary. A two-stop ramp turned one wolf into a
dozen. None of those were large; all of them changed what the world *is*.
