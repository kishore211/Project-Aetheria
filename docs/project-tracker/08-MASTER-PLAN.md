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

## Phase 10 — Happiness, mood and voice

The emotional layer, which is what makes creatures read as characters.

| # | Item | Notes |
|---|---|---|
| 10.1 | **Happiness** −100…+100, six-step face icon, shown in the inspector and above units | Ours has needs but no mood |
| 10.2 | **Scenario table** — ~20 events that move happiness, each with 3–4 lines of dialogue | Meal +10, gift +20, lost a child −60, slept outside −30, poked by the player −5 |
| 10.3 | **Contagious social statuses** — laughing, crying, singing spread nearby and draw units in | This is how crowds form on their own |
| 10.4 | **Best friends and lovers** — pair on similar happiness; lovers gate reproduction | Replaces our "reproduce alone" model |
| 10.5 | **Status effects proper** — a real typed table with icon, duration, source, flavour line, replacing our ad-hoc status strings | ~20 statuses, not 57 |
| 10.6 | **The player is felt** — poking a unit hurts it and it says so | Their sharpest bit of writing |

**Gate:** creatures visibly react to their own lives, and say things.

## Phase 11 — Ways to look at the world

| # | Item | Notes |
|---|---|---|
| 11.1 | **Map layer system** | ✅ done | `utils/mapLayers.ts`. Six layers: natural, borders, height, rainfall, warmth, fertility. `Z`/`X` cycle. Ramps monotonic in lightness (enforced by test) so they survive greyscale; decoration hidden and sea muted on data layers. Culture/religion layers land with Phase 15, which is when there is anything to paint |
| 11.2 | **Map labels** | ✅ done | `utils/labelBridge.ts` + `MapLabels.tsx` |
| 11.3 | **List windows** — villages, kingdoms, wars, herds, families; click a row to fly there | One reusable panel |
| 11.4 | **Chronicle 2.0** — filter chips, per-kind icons, 2–4 rotating phrasings per event | Their multi-phrasing is why long logs stay readable |
| 11.5 | **Statistics window** — population, deaths by cause, territory over time, species mix | We already collect all of it |
| 11.6 | **Minimap layers** — leaders, armies, battles, species | Extend the existing minimap |

**Gate:** ten different questions about the world can be answered from the map.

## Phase 12 — The power bar

| # | Item | Notes |
|---|---|---|
| 12.1 | **Bottom bar with 7 tabs + contextual Unit tab** | ✅ done | `PowerBar.tsx`; sidebar and separate time bar deleted. Bar hugs its contents rather than reserving a fixed span |
| 12.2 | **Descriptions with jokes** for every power | ✅ done | `utils/powers.ts` — catalogue is plain data, so powers can be added and re-tabbed without touching layout |
| 12.3 | **Erasers** — sponge, sickle, bucket, axe, demolish, life eraser, scissors | Mostly inverses of tools we have |
| 12.4 | **Full hotkey scheme** + cheat sheet | ✅ done | `hooks/useHotkeys.ts`; `Space 1-9 Tab Z X H F N M I L +/- Esc`. Numbers printed on the buttons, full list in the help overlay. `Esc` backs out one step at a time |
| 12.5 | **Hide UI** | ✅ done | `H`. Map labels and floaters belong to the world, not the HUD, so they stay |
| 12.6 | **World Laws 2.0** — grouped, iconed, with flavour lines, ~20 laws | Ours has 8 bare toggles |

**Gate:** the toolbar scales past 60 powers and is fully keyboard-driven.

## Phase 13 — Ages

| # | Item | Notes |
|---|---|---|
| 13.1 | **10 eras** with an age clock in the HUD | Hope, Sun, Dark, Tears, Moon, Chaos, Wonders, Ice, Ash, Despair |
| 13.2 | **Screen overlay + particle layer** per era | Sits on the season system we already have |
| 13.3 | **Real rule changes** — drought kills trees, frost kills crops, chaos turns creatures, rain douses fire | Their global actions, scaled to our clock |
| 13.4 | **Loyalty / opinion modifiers** per era | Feeds Phase 14 |

**Gate:** the world visibly enters and leaves an era, and it matters.

## Phase 14 — Politics: loyalty, plots, rebellion

The deepest remaining system, and the one with the biggest story payoff.

| # | Item | Notes |
|---|---|---|
| 14.1 | **Loyalty per village** — a visible breakdown of ~10 factors (distance from capital, size vs capital, shared culture, over-expansion, losing wars) | Ours has a hard village limit instead |
| 14.2 | **Rebellion** — loyalty below zero → a village secedes and the old kingdom declares war | Their signature moment |
| 14.3 | **Plots** — schemes with a progress bar and an icon above the plotter, cancellable by killing them or by divine light | The best design idea in their game |
| 14.4 | **Kings, leaders, clans** with civil stats (diplomacy, warfare, stewardship, intelligence) driving behaviour | We have a ruler *name* only |
| 14.5 | **Succession** — heirs, shattered crowns, fractured kingdoms | Rich chronicle material |
| 14.6 | **Alliances, opinions, peace talks** | Beyond our tension→war→peace |

**Gate:** an empire can tear itself apart without the player touching it.

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

Still open in these phases: 9.9 (number tweens), 11.3 (list windows), 11.4
(Chronicle 2.0), 11.5 (statistics), 11.6 (minimap layers), 12.3 (erasers),
12.6 (World Laws 2.0). 11.4 is the most valuable of those: the chronicle is
already the main place the world speaks in prose, and it currently has one
phrasing per event and no filters.

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
