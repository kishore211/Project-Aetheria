# 04 — ROADMAP: What Is Left

Every item that was on this list when the project was picked up has been built
and moved to [01-STATUS.md](01-STATUS.md): the map redesign (Tier 1), the
civilization layer (Tier 2), sandbox depth (Tier 3) and the performance and
quality work (Tier 4). A later people-dynamics pass
([05-PEOPLE-DYNAMICS-RESEARCH.md](05-PEOPLE-DYNAMICS-RESEARCH.md)) added herds
and migration, colonisation, growing borders, village social life and warbands,
and fixed the bugs that stranded creatures.

What follows is what is **deliberately not built**, and why. Nothing here is
half-finished — the game is complete and playable as it stands.

---

## Deliberately out of scope

These were listed in the original PRD ([../app_flow.md](../app_flow.md)) and are
each a project in their own right. Attempting them would have meant shipping a
shallower version of everything above.

- **Cultures and technology trees** — WorldBox's ~50 knowledges gating buildings
  and units. Aetheria's progression is resource-driven instead.
- **Trade and economy chains** — production chains (farm → wheat → bread), docks,
  trade boats, taxation. Villages have a granary and a timber/stone store; there
  is no market.
- **Religion and faith** — temples exist as buildings, not as a system.
- **Naval movement and combat** — nothing crosses open ocean.
- **Sieges with equipment** — raids are melee and building damage; no rams,
  ladders or capture timers.
- **Underground layers** — mines are surface buildings.
- **Multiplayer and cloud saves** — saves are local (localStorage + file).
- **Electron packaging** — the game runs in the browser.

## Nice-to-have, not attempted

- **Kingdom banners and heraldry** — kingdoms have generated names, rulers and
  colours, but no generated flag art.
- **Families and lineage** — creatures inherit traits from a parent, but there
  is no family meta, no lovers, and children do not follow their parents.
- **Boats** — settlers walk, so colonisation cannot cross open water. On an
  archipelago map a kingdom is confined to its island.
- **Diplomacy beyond war and peace** — no alliances, opinions, rebellions or
  succession crises. Tension, war, conquest, peace and abandonment are
  modelled. WorldBox drives rebellion off a per-village *loyalty* number, with
  -25 per village a kingdom holds beyond its race's limit; Aetheria uses a hard
  village limit instead and has no loyalty at all.
- **Unit equipment and levels** — creatures have traits, attributes and a kill
  count; there are no weapons or experience levels.
- **Zombie variants per creature** — zombies and skeletons exist as their own
  types; curse-death does not convert a creature into an undead version of
  itself.
- **Animated special-biome tiles** — enchanted and corrupted land is coloured and
  decorated, not animated.

## Known limitations

- **Saves regenerate tile resources.** A save stores terrain edits, ownership,
  creatures and settlements, but not per-tile berry/timber counts — the ecology
  re-seeds them within seconds, and storing them would have dominated the
  payload. Village granaries *are* saved.
- **`worldSize: 'large'` (256×256) is untested at scale.** The instanced renderer
  and spatial index are built for it (65,536 tiles is still 4 draw calls), but
  the balance of village founding and river density was tuned on 128×128.
- **Diplomacy needs shared borders.** Kingdoms that never touch never fight, so
  on island maps war is rare by design.
- **No pointer-lock or keyboard camera.** Camera control is mouse/touch only.

## If work continues

In rough order of value per unit of effort:

1. **Loyalty and rebellions** — the tension model and village limits already
   exist; adding a loyalty number per village (falling as a kingdom
   over-expands, as WorldBox does) would let colonies break away and would
   deepen the civilization layer the most for the least new machinery.
2. **Kingdom inspector with history** — a panel per kingdom listing its villages,
   wars won and lost, and rulers over time. All the data is already tracked.
3. **Heraldry generator** — procedural banners from the kingdom colour and race,
   drawn with the same canvas-atlas technique as everything else.
4. **256×256 tuning pass** — verify frame rate and rebalance founding density.
5. **Equipment and unit levels** — the most content-heavy of the remaining ideas.
