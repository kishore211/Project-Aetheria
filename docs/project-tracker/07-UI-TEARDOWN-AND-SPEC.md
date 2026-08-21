# 07 — UI Teardown and Redesign Spec

Companion to [06-WORLDBOX-COMPLETE-REFERENCE.md](06-WORLDBOX-COMPLETE-REFERENCE.md).
Written after the player's note: *"our game UI animation should be changed a
little bit, I still don't see WorldBox-level UI, or it doesn't look like that."*

That instinct is right, and this document tries to say **precisely why** rather
than "make it prettier". The conclusion up front:

> Our UI is a competent *dashboard*. WorldBox's is an *instrument panel for a
> living world*. The gap is not styling — it is that their interface is mostly
> made of things that respond to the simulation, and ours is mostly made of
> things that respond to clicks.

We are **not** copying their art. Every pixel in Aetheria is generated in code,
and that stays true. What follows is functional design.

---

## 1. Where our UI actually stands

| Region | Ours today |
|---|---|
| Left | Fixed 240 px sidebar: New World, size, template, brush, 22 tools in 6 labelled groups, seed |
| Top centre | Pill: population, kingdoms, calendar, time of day, weather, music, mute |
| Right rail | Minimap → inspector → kingdoms list → chronicle, stacked in a scrolling column |
| Bottom centre | Pause + three speeds |
| Modals | World Laws (8 toggles), Save/Load, Help |
| Motion | Panels slide/fade in on mount; tool buttons lift on hover, dip on press; chronicle entries slide in |

It is clean, readable, responsive, and touch-aware. It is also **inert**: after
the first half-second of mount animations, nothing in the UI moves unless the
player moves it. The world can be at war and the interface looks identical.

## 2. The gap, itemised

Twenty-two specific things WorldBox's interface does that ours does not. Ranked
by how much each one changes the *feel* per unit of work.

### Tier A — the world talks back (this is the whole gap)

| # | WorldBox | Ours | Why it matters |
|---|---|---|---|
| A1 | **Icons above units**: task, profession, happiness, plot, favourite | Nothing above units but a health bar | At a glance you can see who is farming, who is scheming, who is miserable. This is the single biggest "alive" signal |
| A2 | **Speech and thought bubbles**, with real lines tied to happiness events | Nothing | Units become characters instead of sprites |
| A3 | **Plot icons that fill with colour** as a scheme progresses | Nothing | Turns war from a surprise into dread. Best idea in their game |
| A4 | **Hover tooltips** on units and on zones | Nothing — you must click | Removes all friction from reading the world |
| A5 | **Floating numbers / effect text** on damage, gifts, taxes, happiness | Nothing | Every interaction currently happens silently |
| A6 | **Relationship arrows** from the selected unit: destination, lover, house, family, parents, kids, attack target | Nothing | Makes one creature's life legible in a second |
| A7 | **Important-events flash** the moment something major happens | Chronicle line only | The chronicle scrolls past; the world doesn't announce itself |

### Tier B — ways to look at the world

| # | WorldBox | Ours |
|---|---|---|
| B1 | **10 map layers** (kingdom, village, clan, religion, culture, language, family, subspecies, army, alliance), cycled with `Z`/`X`, with a layer *state* on `C` | One always-on kingdom overlay |
| B2 | **Map names** drawn per layer | No labels on the map at all |
| B3 | **List windows** per meta — villages, wars, armies, families, plots… | Kingdoms panel only |
| B4 | **Filterable history log** with per-type icons and 2–8 rotating phrasings | Flat list, one phrasing, one icon style |
| B5 | **World statistics + graphs + population pyramid** | Population count in the top bar |
| B6 | **Minimap icon layers** — leaders, armies, battles, boats, species | Creature dots and kingdom colour |

### Tier C — the toolbar itself

| # | WorldBox | Ours |
|---|---|---|
| C1 | **Bottom power bar, 8 tabs**, 15–117 powers each, contextual **Unit tab** | Left sidebar, 22 tools, no tabs, no contextual tab |
| C2 | **Nine eraser tools** (sponge, sickle, bucket, pickaxe, spade, axe, demolish, life eraser, scissors) | None — every tool is additive |
| C3 | **Brush size and shape** on `Alt`+wheel, with a cursor preview | Three buttons, no preview of what will be hit |
| C4 | **A full hotkey scheme** incl. 10 player-assignable slots | None |
| C5 | **Hide-UI** (`H`) for screenshots | None |
| C6 | **A joke in every power description** | Terse, sensible hints |
| C7 | **Stamps** — 14 landscape printers | None |

### Tier D — polish that reads as production value

| # | WorldBox | Ours |
|---|---|---|
| D1 | **Age overlays** — full-screen colour wash + particle layer per era | Sky tint by time of day |
| D2 | **Screen shake** on big impacts (only when zoomed in enough to see it) | None |
| D3 | **An "X" / refusal cue** when a power can't be used there | Silent no-op |
| D4 | **Number tweens** in windows (values count up, bars glide) | Values snap |
| D5 | **Contextual audio** — location, faction, weather and unit music banks | One ambient pad |
| D6 | **Loading-screen tips and blurbs** | None |

---

## 3. The diagnosis in one line each

- **Our UI is silent.** Nothing in it is driven by the simulation except four
  counters and a scrolling log.
- **Our UI is modal.** To learn anything you must click a thing and read a
  panel. WorldBox lets you *hover*, or just *look at the map*.
- **Our toolbar is a list, not an instrument.** It does not scale, has no
  context, and has no keyboard.
- **Our world has one lens.** WorldBox has ten, and switching them is a
  keystroke.

---

## 4. The redesign

Four workstreams. Each is independently shippable and independently valuable.

### W1 — Bottom power bar with tabs *(replaces the sidebar)*

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                          [world]     │
│                        ~ the map ~                                   │
│                                                                      │
│  ┌─ tooltip ─┐                                    ┌─ inspector ─┐    │
│  └───────────┘                                    └─────────────┘    │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ ◉ World  ⛰ Shape  👁 Observe  🐾 Life  🌿 Nature  💥 Ruin  ✨ Divine │  ← tabs
│ ┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐   brush ◦ ○ ◯   ⏸ ▶ ▶▶ ▶▶▶  │  ← powers
│ └──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘                                │
└──────────────────────────────────────────────────────────────────────┘
```

- Seven standing tabs plus a **Unit tab that appears only while something is
  selected**, exactly as theirs does.
- Tab contents (ours, mapped onto our real feature set):
  - **World** — pause, speed, world laws, ages, chronicle, statistics, saves,
    new world, template, size, help, hide UI
  - **Shape** — raise, lower, water, mountain, forest, plus the new erasers
  - **Observe** — map layers, map names, unit icons, bubbles, arrows, tooltips,
    minimap toggles, kingdom/village/family/war lists
  - **Life** — the four races, animals, monsters, population density
  - **Nature** — trees, minerals, rain, biome seeds
  - **Ruin** — fire, quake, meteor, lightning
  - **Divine** — bless, curse, and later: magnet, light, shield, sleep
- Brush selector and time controls live **on the bar**, not in separate corners.
- Every power gets a **two-line tooltip: what it does, and a joke.** This is
  cheap and it is most of the personality.
- The sidebar is retired. On phones the bar becomes horizontally scrollable —
  which is what WorldBox does on mobile anyway.

### W2 — The world talks back *(Tier A — do this first)*

1. **Unit icon rail.** A small stack above each creature, drawn as one more
   `SpriteCloud` (we already have the machinery — atlas + points + per-instance
   slot/size/tint, one draw call). Slots: task (gathering, hauling, building,
   fighting, fleeing, sleeping, socialising), profession (king, leader, captain,
   warrior), happiness face (6 steps), plot, favourite. Culled by zoom via the
   existing `detailLevel`.
2. **Speech bubbles.** A second `SpriteCloud`-style layer, or short-lived DOM
   labels projected to screen space for readability. Triggered by happiness
   events, socialising, and combat. Lines come from a written table (see W4).
3. **Hover tooltip.** Raycast on mouse-move (throttled, reusing the existing
   picking path). Over a unit: name, species, job, health, happiness, village.
   Over a tile: biome, owner, resources. This alone removes most clicking.
4. **Floating text.** Damage, healing, gifts, taxes, happiness deltas — rise and
   fade. Reuses `effectsManager`.
5. **Relationship arrows** for the selected unit, drawn as thin lines in the
   scene: destination, home, lover, family, target.
6. **Refusal cue.** When a power can't apply (spawning a fish on a mountain), a
   red "✕" pops at the cursor and a soft thunk plays, instead of nothing.
7. **Screen shake** on meteor/quake/nuke, scaled by distance and disabled when
   zoomed out — their exact rule.

### W3 — Ways to look *(Tier B)*

1. **Map layers.** Generalise the territory overlay we already have into a
   layer system with a selector: kingdom, village, culture, religion, family,
   herd, biome, elevation, ownership-history. `Z`/`X` to cycle. The renderer
   already supports per-instance colour on two overlay meshes; this is mostly
   plumbing plus a colour-source function per layer.
2. **Map labels.** Kingdom and village names drawn on the map at low zoom,
   fading in as you zoom out — this is what makes a map read as a *map*.
3. **List windows.** One reusable panel component; feed it villages, kingdoms,
   wars, herds, families. Click a row → fly there.
4. **Chronicle 2.0.** Filter chips (life, death, kingdom, war, disaster,
   divine), per-kind icons, and **2–4 phrasings per event type** chosen at
   random. Their multi-phrasing is why 200 hours of logs stay readable.
5. **Statistics window.** Population over time, deaths by cause, kingdom
   territory over time, species breakdown. We already collect all of it; a
   small canvas line chart is enough.

### W4 — Voice and motion *(Tiers C/D)*

1. **Write the copy.** ~60 power descriptions with jokes, ~40 law flavour lines,
   ~25 status one-liners, ~30 happiness dialogue lines, ~40 chronicle phrasings.
   This is a writing task, not an engineering one, and it is the highest
   feel-per-hour item in the entire plan.
2. **Hotkeys.** `Space` pause · `H` hide UI · `Tab` cycle tab · `Z`/`X` layer ·
   `F` follow · `Esc` cancel · `1`–`9` power slots · `Ctrl`+wheel speed ·
   `Alt`+wheel brush · `WASD` pan · `Q`/`E` zoom. Plus a keybinding cheat-sheet
   in Help.
3. **Erasers.** Sponge (clear fire/ruins), sickle (clear decoration), bucket
   (remove water), axe (remove trees), demolish (remove buildings), life eraser,
   scissors (release territory). Cheap — they are mostly inverse operations of
   tools we already have.
4. **Brush preview.** A translucent ring/square of affected tiles under the
   cursor, updated on mouse-move. Removes all guesswork from area tools.
5. **Number tweens.** A tiny `useTween` hook so counters count and bars glide.
6. **Ages.** Ten eras with a screen-wide colour wash, a particle layer, and real
   rule changes. Sits on top of the season system we already have.
7. **Contextual audio.** Layer the existing generative pad: a biome/faction
   voice on top, a weather layer, a war layer. No files, still.

---

## 5. What we deliberately will not copy

- **Their art.** All of ours stays procedural.
- **374 powers.** We will land ~60 with real descriptions rather than 374 stubs.
- **The knowledge cube.** A 4-D tesseract toy is charming and irrelevant.
- **Possession as a full character controller** (jump/dash/backstep/steal/swear)
  — spectate + follow already covers the intent at a fraction of the cost.
- **Mobile-first density.** Their bar assumes a phone; we can afford tooltips
  and hover, which are strictly better on desktop, and degrade to tap on touch.

---

## 6. Acceptance criteria

The redesign is done when, **without clicking anything**, a player can look at
the screen for ten seconds and tell you:

1. Which kingdoms exist and roughly who is winning *(map layer + labels)*
2. That someone is planning a war *(plot icon filling)*
3. Which of these villagers is a warrior, which is hauling wood, and which is
   miserable *(unit icons)*
4. What era the world is in *(age overlay)*
5. What just happened *(important-event flash + chronicle)*

And when hovering anything explains it, every power reads like it was written by
a person, and every number that changes is seen to change.
