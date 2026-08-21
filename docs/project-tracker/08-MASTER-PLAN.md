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

## Phase 15 — Identity: culture, religion, language

| # | Item | Notes |
|---|---|---|
| 15.1 | **The pot mechanic** — two units talk, both their metas enter a weighted pot, one wins | Elegant, tiny, and it gives our socialising a purpose |
| 15.2 | **Cultures** with traits that change behaviour — house spacing, warrior ratio, expansionism, xenophobia | ~15 traits, not 78 |
| 15.3 | **Religions and languages** on the same machinery, with map layers | Nearly free once 15.1 exists |
| 15.4 | **Books** — a written work carries a culture and can convert its reader | Charming and cheap |

**Gate:** two villages of the same race can drift into different cultures.

## Phase 16 — Town craft and economy

| # | Item | Notes |
|---|---|---|
| 16.1 | **Siting rules** — solitary / cluster / border placement | Why their towns look like towns and ours look scattered |
| 16.2 | **Building tiers** — houses and halls upgrade instead of multiplying | 6 house tiers, 3 hall tiers |
| 16.3 | **Race build styles** — dwarves build tidily (centre-biased), others random | Free character |
| 16.4 | **Roads** between buildings and villages | Strong visual payoff |
| 16.5 | **Coins, taxes, tribute** with money-flow particles | Their "money flow" toggle is delightful |
| 16.6 | **Jobs proper** — blacksmith, builder, farmer, miner, woodcutter, fireman, hunter, with per-job caps | We have gatherer/warrior |

**Gate:** a mature village is architecturally legible as a town.

## Phase 17 — Content and long tail

| # | Item | Notes |
|---|---|---|
| 17.1 | **More creatures** toward ~40, each with an evolved form | Their base→evolved pairing is a cheap doubling |
| 17.2 | **Fantasy biomes** — mushroom, crystal, enchanted, infernal, candy | We have 28 naturals |
| 17.3 | **Equipment** — 6 slots, rarity, generated names, kill counters | |
| 17.4 | **Diseases and plague** | |
| 17.5 | **Boats and docks** — so island maps can be colonised | Recorded as a known limitation today |
| 17.6 | **Codex / knowledge** — discover creatures, traits, biomes across worlds | Their 774-item collection hook, scaled to ~120 |
| 17.7 | **Contextual audio** — biome, faction, weather and war layers over the pad | Still zero files |
| 17.8 | **Stamps** — landscape printers | Pure toy |

---

## Progress note — after the Phase 9 / 11 / 12 pass

Done since this plan was written: 9.1-9.8, 11.1, 11.2, 12.1, 12.2, 12.4, 12.5,
plus two things not on the list that turned out to matter more than several
items that were:

- **Camera framing.** The starting camera was a fixed position, so a 128 world
  sat marooned mid-screen with sky all round it. The distance now scales to the
  world so the map runs past the frame. This was the single biggest change to
  whether the place reads as somewhere you are *above* rather than a diorama on
  a table — bigger than any individual HUD item.
- **Pacing.** Day phases 30 s → 42 s, rain gated behind a seasonal factor.

Still open in these phases: **9.9** (number tweens), **11.3** (list windows),
**11.6** (minimap layers), **12.3** (erasers). None of them is large. After
that, Phase 10 (happiness and mood) is the next thing that changes how the
world *feels* rather than how it presents itself, and it is the last of the
"talks back" work — the dialogue table built for 9.4 is the carrier it needs,
so Phase 10 widens it rather than starting over.

---

## Sequencing and why

```
9  ─ world talks back      ← do this first; pure payoff, no new simulation
10 ─ happiness & voice     ← turns sprites into characters
11 ─ ways to look          ← layers, lists, chronicle, stats
12 ─ power bar             ← now there is enough to organise
13 ─ ages                  ← world-scale drama, cheap on top of seasons
14 ─ politics              ← the deep one; needs 10 (mood) and 11 (lists)
15 ─ identity              ← needs 10 (socialising) to have a carrier
16 ─ town craft            ← makes settlements look designed
17 ─ content               ← last, because content without feedback is invisible
```

Phases 9–12 are the answer to *"it doesn't look like WorldBox"*. Phases 13–16
are the answer to *"their world feels deeper"*. Phase 17 is volume, and it is
deliberately last: **content with no feedback layer is content nobody notices**,
which is exactly the trap our first 28 biomes fell into.

## Rules for the work

1. **Every phase ships green.** `npm test`, `npm run lint`, `npm run build`,
   `npm audit` clean, verified live in the browser.
2. **Numbers get rescaled.** A WorldBox year is ~40 s; ours is 320 s. Never
   paste a cooldown straight from the wiki — the herd-cooldown lesson.
3. **Tests stay deterministic.** Seeded `Math.random` per test. A behavioural
   assertion that needs a rerun is hiding a bug. But a *single-sample*
   assertion on emergent behaviour is a tripwire, not a test: any new
   `Math.random()` call anywhere in the AI re-rolls the whole stream and the
   assertion fails for a reason that has nothing to do with the change. Where
   the claim is statistical ("a grazing herd usually survives"), loop over
   seeds and assert the distribution. `herdSystem.test.ts` learned this the
   hard way.
4. **Everything stays procedural.** No art or audio files, ever.
5. **Write the copy as we go.** A power without a description is unfinished.
6. **One commit per coherent change,** with the *why* in the message.

## Honest estimate of scale

Phases 9–12 are roughly the same size as everything built so far. Phases 13–17
are larger again. This is a long road, and the plan is ordered so that **it is
worth stopping after any phase** — each one leaves the game better on its own.
