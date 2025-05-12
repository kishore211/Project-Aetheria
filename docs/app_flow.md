

Product Requirements Document: Project Aetheria (A Complete WorldBox-Inspired God Simulator)

1. Introduction & Vision

1.1. Project Overview: Project Aetheria is a 3D pixel-art god simulation game where players shape vast, procedurally generated worlds, populate them with diverse races and creatures, and wield immense powers to influence the course of emergent civilizations and natural events. It aims to be a deeply engaging sandbox, offering near-limitless replayability and storytelling potential.

1.2. Core Concept ("Elevator Pitch"): "Forge worlds, breathe life into them, and witness the epic saga of civilizations. As a god in Aetheria, you command the elements, guide or torment mortals, and sculpt an ever-evolving pixel tapestry. Your creation, your rules, your story."

1.3. Goals:

Deliver a rich, feature-complete god simulation experience inspired by the depth of WorldBox.

Foster emergent gameplay through complex interactions between world systems, AI, and player actions.

Provide powerful and intuitive tools for world creation and manipulation.

Achieve a charming and detailed pixel art aesthetic.

Offer a stable, performant, and highly replayable game for desktop platforms.

1.4. Target Audience: Players who enjoy god games, grand strategy, simulation, sandbox creativity, pixel art, and emergent narrative experiences. Fans of games like WorldBox, Dwarf Fortress, and RimWorld.

1.5. Monetization: One-time purchase for the desktop application. Potential for future cosmetic DLCs or larger expansions if successful (not part of initial scope).

2. Core Gameplay Loop & Pillars

2.1. Gameplay Loop:

Genesis: Player generates or customizes a new world.

Creation & Nurturing: Player sculpts terrain, defines biomes, spawns life (flora, fauna, sentient races).

Observation & Discovery: Player watches as life unfolds, civilizations emerge, cultures develop, and ecosystems evolve.

Intervention: Player uses a wide array of god powers to help, hinder, experiment, or unleash chaos.

Evolution & Consequence: The world reacts dynamically to player actions and its own internal logic, leading to new emergent scenarios.

Iteration: Player continues to shape and observe, or starts anew with different parameters.

2.2. Core Pillars:

Unbounded Creativity: Empower players to build virtually any world they can imagine.

Emergent Storytelling: Simple rules leading to complex, unpredictable, and engaging narratives.

Living World Simulation: A dynamic ecosystem where entities have needs, behaviors, and relationships.

Meaningful Influence: Player actions, big or small, have tangible and often cascading effects.

Discovery & Wonder: The joy of seeing unique outcomes and exploring the world's possibilities.

3. World System

3.1. Procedural World Generation:

Algorithms: Utilize algorithms (e.g., Perlin/Simplex noise, Voronoi diagrams) for generating continents, islands, mountain ranges, rivers, lakes, and oceans.

Customization: Allow players to set parameters: map size (small, medium, large, custom), land/water ratio, general climate type (temperate, arid, arctic), number of ancient ruins, resource richness.

Biomes: Diverse biomes with unique characteristics:

Temperate: Plains, Forests (deciduous, coniferous), Swamps, Meadows.

Arid: Deserts (sandy, rocky), Savannas, Badlands.

Tropical: Jungles, Beaches, Volcanic.

Cold: Taiga, Tundra, Arctic Wastes, Glaciers.

Aquatic: Shallow Ocean, Deep Ocean, Coral Reefs, Trenches.

Underground: Caverns, Lava Tubes, Crystal Caves (potentially with unique resources/creatures).

Special: Enchanted Forests, Corrupted Lands, Sky Islands (if feasible).

Elevation: Multi-layered Z-axis simulation for terrain height, affecting temperature, biome distribution, and pathfinding. Cliffs, hills, valleys, plateaus.

Resource Distribution: Strategic placement of resources (minerals, fertile land, magical essences, etc.) based on biome and geology.

3.2. Environmental Systems:

Day/Night Cycle: Visual cycle affecting creature behavior (nocturnal animals, work/sleep cycles for civilizations).

Weather System: Dynamic weather patterns: rain, snow, hail, fog, wind, thunderstorms, sandstorms, blizzards. Weather influences terrain (e.g., rain makes land fertile, snow covers ground), crops, and unit movement.

Seasons: Gradual transitions between spring, summer, autumn, winter, affecting temperature, plant growth, animal behavior (migration, hibernation), and food availability.

Climate Zones: Different regions of the map can have distinct climates based on latitude, elevation, and proximity to oceans.

Natural Disasters (Beyond God Powers): Wildfires (spreading based on wind and flammability), earthquakes (can alter terrain, damage structures), volcanic eruptions (create new land, spread ash/lava), meteor strikes (rare, impactful), floods, droughts.

Ecological Simulation: Basic plant spread, forest growth/recession, water erosion (slow), soil fertility.

3.3. Map & Grid:

Tile-Based System: The world is composed of a grid of tiles. Each tile has properties: type (grass, water, mountain), biome, elevation, resources, temperature, humidity, etc.

Chunking: Divide the map into chunks for efficient rendering and simulation, loading/unloading as the player pans.

Seamless Zoom & Pan: Smooth camera controls from a high-level overview to individual tile details.

3.4. World Laws & Physics:

Basic Physics: Water flows downwards, fire spreads, structures require support (optional complexity).

Temperature & Humidity: Simulated per tile, influencing biomes, plant growth, and creature comfort.

Magic/Aether: A subtle background "energy" that can be manipulated by certain powers or influence specific biomes/creatures.

4. Entity & AI System

4.1. General Entity Properties:

Position, Health, Age (with lifespan), Name (generated or player-assignable for favorites).

Attributes/Stats (e.g., strength, speed, intelligence, resilience – varies by type).

Needs (e.g., food, water, shelter, safety, social – varies by complexity).

Behaviors (defined by AI states and scripts).

Inventory (for sentient beings and some animals).

Faction/Allegiance.

Status Effects (e.g., poisoned, blessed, diseased, inspired).

4.2. Sentient Races: At least four distinct core races:

Humans: Adaptable, versatile, fast breeders, average stats. Tend towards organized societies and technological advancement.

Orcs: Strong, resilient, aggressive, tribal. Excel in warfare, prefer harsher environments. Lower emphasis on complex infrastructure initially.

Elves: Long-lived, agile, affinity for nature and magic. Slower reproduction, prefer forests, excel at archery and diplomacy.

Dwarves: Hardy, industrious, master craftsmen and miners. Prefer mountains, build fortified underground cities, excel in defense and resource processing.

Unique Traits: Each race has specific advantages/disadvantages, preferred biomes, unique building styles, unit types, and cultural tendencies.

Life Cycle: Birth, childhood, adulthood, old age, death (natural or otherwise).

Needs: Food, water, shelter, happiness (influenced by environment, safety, resources, entertainment, religion).

Behaviors: Foraging, hunting, farming, resource gathering, crafting, building, socializing, training, patrolling, worshipping, migrating, rebelling.

4.3. Animals:

Passive: Sheep, cows, chickens, rabbits, deer (provide food, resources). Herbivores.

Neutral: Bears, wolves (attack if threatened or hungry). Can be predators or prey.

Hostile: Spiders, bandits (pre-scripted), rogue elementals (if no sentient race controls them).

Aquatic: Fish (schools), whales, sharks, crabs.

Avian: Birds (flocking behavior, aesthetic).

Ecosystem Roles: Predator-prey dynamics, grazing, pollination (abstracted).

Life Cycle & Reproduction: Animals are born, grow, reproduce, and die. Herds and packs form.

4.4. Monsters & Mythical Creatures:

Dragons: Powerful, rare, can be destructive or hoard treasure. Different elemental types.

Demons/Angels: Can be summoned or appear through rifts/events. Influence local populations.

Undead: Skeletons, zombies (can rise from graveyards or cursed lands).

Bandits/Pirates: Groups of hostile humanoids that raid settlements.

Giants, Elementals, Golems: Powerful, often tied to specific biomes or events.

Unique Abilities: These creatures possess special attacks, defenses, or influential auras.

4.5. AI Core:

Pathfinding: A* or similar algorithm for efficient movement across varied terrain and around obstacles.

Decision Making: Behavior trees, state machines, or goal-oriented action planning for individual and group AI.

Perception: Entities can "see" and "hear" (defined range), detect enemies, resources, points of interest.

Needs-Based AI: Prioritize actions based on fulfilling needs (hunger, safety, etc.).

Group Behavior: Flocking (birds, fish), herding (animals), squad formations (military), mob mentality (riots).

Learning/Adaptation (Simple): AI might slowly adapt to persistent threats or resource availability (e.g., building more defenses if attacked often).

5. Civilization & Kingdom Mechanics

5.1. Village/City Founding & Growth:

Founding Conditions: Sentient races establish settlements based on resource availability, safety, and racial preferences.

Expansion: Villages grow by constructing new buildings, attracting new inhabitants, or conquering territory. Clear visual progression of settlement size.

Population Dynamics: Birth rates, death rates, immigration, emigration, influenced by food, housing, happiness, war, disease.

Borders: Villages and kingdoms develop dynamic borders based on influence, population, and military control. Border disputes can occur.

5.2. Resource Management:

Primary Resources: Wood, stone, food (various types: meat, fruit, grains, fish), ore (iron, gold, coal, gems), fertile land.

Secondary/Processed Resources: Tools, weapons, armor, building materials (planks, bricks), clothing, luxury goods, magical reagents.

Gathering & Production Chains: Entities assigned to jobs gather raw resources, which are then processed in specialized buildings.

Storage: Granaries, storehouses for resources. Limits on storage capacity. Spoilage for food.

Needs Fulfillment: Civilizations strive to meet the food, housing, and other needs of their population. Shortages lead to unhappiness, starvation, rebellion.

5.3. Building System:

Residential: Huts, houses, manors (determines population capacity, affects happiness).

Production: Farms, pastures, lumber mills, mines, blacksmiths, workshops, bakeries, breweries, tailors, alchemist labs.

Military: Barracks, archery ranges, stables, siege workshops, walls, towers, gates.

Cultural/Civic: Temples/shrines, markets, libraries/schools, taverns, graveyards, monuments, town halls.

Utility: Roads (improve movement speed), bridges, wells, docks.

Upgrades: Buildings can be upgraded to improve efficiency, capacity, or unlock new functions/units. Visual changes with upgrades.

Construction: Requires resources and "builder" units. Placement rules (e.g., farms on fertile land, mines on ore).

5.4. Economy & Trade:

Internal Economy: Resources distributed within a kingdom.

Inter-Village/Kingdom Trade: Caravans or ships transport goods between allied or neutral settlements. Dynamic supply/demand influences prices (simplified).

Markets: Central points for exchange of goods.

Currency: Gold or other forms of currency used for trade and upkeep.

Taxation: Kingdoms can levy taxes on their population.

5.5. Culture & Knowledge:

Naming Conventions: Procedurally generated names for individuals, settlements, kingdoms, reflecting their race.

Symbols & Banners: Kingdoms develop unique banners/colors.

Technological Progression: A simple tech tree or discovery system. Civilizations unlock new buildings, units, and abilities over time through research (e.g., "Basic Metallurgy," "Advanced Farming," "Arcane Theory"). Knowledge can spread.

Cultural Identity: Over time, kingdoms develop distinct traits based on their history, leadership, and environment.

Legends & History: Important events (major battles, founding of cities, great leaders) are recorded (abstractly) and can influence cultural identity or trigger future events.

5.6. Diplomacy & Relations:

States: Peace, War, Alliance, Trade Agreement, Vassalage, Truce.

Reputation & Trust: Actions (trade, aid, aggression) influence relations between kingdoms.

Diplomacy AI: Kingdoms make decisions about war and peace based on relative strength, proximity, resources, past grievances, and racial biases.

Diplomatic Actions: Sending emissaries (abstracted), forming alliances, declaring war, offering tribute, making peace treaties.

Factions: Internal factions can emerge within kingdoms (e.g., pro-war, isolationist, religious zealots), potentially leading to civil wars or changes in leadership.

5.7. Military & Warfare:

Unit Types: Race-specific units (e.g., Human Knight, Orc Berserker, Elven Archer, Dwarven Axeman). Basic infantry, archers, cavalry, siege units, special/elite units.

Recruitment & Upkeep: Units recruited from population, require resources/gold for upkeep.

Combat Mechanics: Stats-based combat (attack, defense, damage, health, armor). Modifiers for terrain, morale, leadership. Ranged and melee attacks.

Formations & Tactics (Simple): Units can be grouped into armies. Basic AI for engaging enemies.

Sieges: Attacking fortified cities, use of siege weapons (catapults, rams). Walls and towers provide defensive bonuses.

Morale: Units can break and flee if morale is low (heavy casualties, fear).

Experience & Veterans: Units gain experience from combat, becoming more effective.

Pillaging & Conquest: Victorious armies can pillage resources, capture/destroy buildings, and claim territory.

5.8. Faith & Religion (Optional but adds depth):

Pantheons/Beliefs: Civilizations can develop religious beliefs, worshipping nature spirits, ancestors, or player-created "deities" (if the player reveals themselves through powerful acts).

Temples & Priests: Religious buildings and figures that provide happiness, social cohesion, or special blessings/units.

Religious Spread & Conflict: Religions can spread to other kingdoms, potentially leading to alliances or holy wars.

Divine Favor: Player actions can be interpreted as divine favor or wrath, influencing religious fervor.

6. God Powers System

6.1. Categories of Powers:

Creation & Terraforming: Shape land and environment.

Life & Spawning: Create and manipulate living beings.

Destruction & Chaos: Unleash devastating forces.

Benevolent & Support: Bless, heal, and aid mortals.

Malevolent & Affliction: Curse, plague, and sow discord.

Utility & Observation: Tools for information and world control.

Nature & Elemental Control: Command natural forces directly.

6.2. Detailed Power List & Effects (Examples - this list should be extensive):

Terraforming:

Raise/Lower Terrain (single tile, area)

Create Mountain, Create Volcano (dormant/active)

Dig River, Create Lake, Create Ocean

Spawn Biome (e.g., "Seed Forest," "Desertify Area")

Place Resources (e.g., "Vein of Gold," "Fertile Patch")

Smooth Terrain, Erode Terrain

Life & Spawning:

Spawn Creature (select from list of animals, monsters)

Spawn Race Unit (select race and basic unit type)

Bless Life (increase fertility in an area)

Heal Unit/Area

Resurrect Dead (rare, costly, chance of undeath)

Mutate Creature (random beneficial or detrimental changes)

Destruction & Chaos:

Meteor Strike (single, shower)

Earthquake (local, regional)

Volcanic Eruption (trigger existing volcano)

Tornado, Hurricane

Lightning Strike, Thunderstorm

Fireball, Rain of Fire

Nuke / Antimatter Bomb (extreme, world-altering)

Destroy Tile/Area

Summon Hostile Creatures (demons, undead swarm)

Benevolent & Support:

Bless Land (increase crop yield, resource output)

Inspire Population (boost happiness, productivity, or courage)

Grant Wisdom (boost research speed for a kingdom)

Shield of Faith (temporary invulnerability for units/area)

Divine Intervention (save favored unit from death)

Malevolent & Affliction:

Curse Land (reduce fertility, spawn hostile flora)

Plague/Disease (target individuals or spread through population)

Sow Discord/Madness (cause units to fight each other, reduce kingdom stability)

Drain Life (damage units, heal player or empower another effect)

Age Rapidly / Devolve

Utility & Observation:

Inspect Entity (view detailed stats, needs, thoughts, inventory)

Mark Favorite (highlight and track specific entities)

Time Control (Pause, Normal, Fast, Ultra-Fast speed)

Fog of War Toggle (reveal map)

World Stats Panel

"Divine Touch" (pick up and move small entities/objects)

Teleport Entity

Nature & Elemental Control:

Start/Stop Rain, Change Weather

Grow Trees/Plants Instantly

Command Animals (simple commands to a group of animals)

Summon Rain, Drought

Freeze Water / Melt Ice

Create Geyser

6.3. Power Unlocking/Progression: All powers available from the start ("Sandbox God Mode") is the default. Could consider a mode where powers unlock based on world age or achievements.

6.4. Power Cost/Cooldown: Most powers are free to use. Extremely potent powers (Nuke, Global Plague) might have long cooldowns or require a "divine energy" resource that slowly regenerates to prevent spamming.

7. User Interface (UI) & User Experience (UX)

7.1. Main Game UI:

Toolbar/Palette: Intuitive, icon-based selection for god powers, categorized for easy access. Customizable hotkeys.

Information Panels:

Minimap with zoom and pan.

Selected Entity Panel: Shows details of the currently selected tile, creature, or building.

Kingdom Panel: Overview of selected kingdom (population, resources, relations, armies).

World Overview Panel: Global stats (total population, number of kingdoms, dominant races, world age).

Time Controls: Clearly visible buttons for pause, play, and different game speeds.

Resource Display (Player-Specific): If divine energy is implemented, display its current level.

7.2. Entity Interaction:

Left-click to select, right-click for contextual menu (inspect, apply power, etc.).

Tooltips providing information on hover for UI elements, powers, and entities.

7.3. World Information & Statistics:

Graphs and charts showing population trends, resource distribution, dominant cultures/religions over time.

Historical event log (major battles, disasters, kingdom formations/destructions).

Map overlays/filters: show biome types, temperature, fertility, resource locations, political boundaries, religion spread.

7.4. Event Notifications & Logging:

Configurable notifications for key events (kingdom founded, war declared, major disaster, rare creature sighted).

Scrollable message log.

7.5. Customization & Settings:

Graphics: Resolution, visual effects quality, pixel scaling options.

Audio: Master, music, SFX volume sliders.

Gameplay: Autosave frequency, notification settings, UI scale.

Keybindings.

7.6. Save/Load System:

Multiple save slots.

Autosave functionality.

Cloud save support (via Electron/Steamworks if applicable).

World Sharing: Ability to export a world seed or save file for others to play.

7.7. Tutorial / Help System:

Optional, non-intrusive tutorial guiding new players through basic controls and concepts.

In-game encyclopedia explaining game mechanics, biomes, races, powers.

8. Art & Audio

8.1. Visual Style:

Pixel Art: Consistent, charming, and detailed pixel art for all tiles, entities, buildings, UI elements, and effects. Sprite size to be determined (e.g., 16x16 or 32x32 for units).

Animations: Smooth animations for movement, actions (attacking, working), building construction, power effects, weather.

Visual Effects (VFX): Impactful particle effects for spells, explosions, weather, and environmental details (e.g., flowing water, rustling leaves). Leveraging Three.js capabilities for shaders and particle systems.

Color Palette: Carefully chosen palettes for biomes and races to ensure readability and aesthetic appeal.

Day/Night Visuals: Dynamic lighting changes affecting sprite appearance and world ambiance.

8.2. Sound Design (SFX):

Distinct sounds for each god power.

Environmental ambiances for different biomes (forest sounds, wind, ocean waves, cave drips).

Creature sounds (animal calls, unit acknowledgments, battle cries, monster roars).

Building sounds (construction, workshop activity).

UI feedback sounds (clicks, notifications).

Impact sounds for combat and destruction.

8.3. Music:

Dynamic and adaptive soundtrack that changes based on game state (peaceful building, tense conflict, wondrous discovery, catastrophic event).

Ambient tracks for general gameplay.

Thematic pieces for different cultures or significant moments.

Option to toggle music on/off.

9. Technical Requirements

9.1. Platform(s): Desktop (Windows, macOS, Linux) via Electron.

9.2. Core Technologies:

Language: TypeScript

Build Tool: Vite

Rendering Engine: Three.js (using an orthographic camera for 2D rendering, leveraging its capabilities for shaders, particle effects, and scene management).

Desktop Packaging: Electron

9.3. Performance Targets:

Maintain smooth gameplay (target 60 FPS) on mid-range hardware for large maps with a significant number of active entities (e.g., 10,000+).

Efficient simulation logic to handle many concurrent AI calculations.

Optimized rendering, including culling off-screen elements and efficient batching of sprites/tiles.

9.4. Data Structures & Algorithms:

Grid-based data structures for world map.

Quadtrees or similar spatial partitioning for efficient querying of entities.

Optimized pathfinding algorithms (e.g., Jump Point Search, or A* with optimizations).

Finite State Machines or Behavior Trees for AI.

Serialization for save/load functionality.

9.5. Modding Support (Post-Launch Consideration):

Expose data files (JSON, XML) for easy modification of entities, biomes, powers.

Potential for Lua or JavaScript scripting API for more advanced modding.

10. Development Milestones / Phased Rollout

Milestone 1: Core Engine & World Rendering ("Genesis Engine")

Basic Three.js setup with orthographic camera for 2D pixel art.

Tile rendering system (simple grass/water).

Map generation (basic noise-based land/water).

Panning and zooming functionality.

Vite/TypeScript/Electron pipeline established.

Milestone 2: Basic Entities & Interaction ("Spark of Life")

Spawn one basic human-like entity type.

Simple random movement AI.

Basic god powers: spawn entity, destroy tile.

Basic UI for selecting powers.

Milestone 3: Rudimentary Civilization & Environment ("First Settlement")

Humans can gather one resource (e.g., wood from tree tiles).

Humans can build one basic structure (e.g., "hut").

Introduction of simple biomes (forest, plains).

Basic day/night cycle (visual only).

Save/Load functionality (simple).

Milestone 4: Expanding Races & AI ("The Peoples Emerge")

Introduce a second distinct race (e.g., Orcs) with unique basic traits.

More complex AI: needs (hunger), resource gathering behavior.

Basic inter-entity interaction (e.g., placeholder combat).

More god powers (terrain sculpting, basic bless/curse).

Milestone 5: Core Civilization Mechanics ("Kingdoms Rise")

Village formation and growth (multiple buildings).

Multiple resource types and simple production chains.

Basic kingdom identity (name, color).

Introduction to diplomacy (peace/war states).

First pass on military units and combat.

Milestone 6: Environmental Depth & Godly Influence ("World Shapers")

Weather system implementation.

Seasons (basic effects).

Expanded list of god powers with more impactful effects.

More diverse animal and monster types.

Milestone 7: Advanced Systems & Polish ("Age of Wonders")

Full diplomacy system.

Tech tree / knowledge progression.

Religion/faith system.

Advanced combat and siege mechanics.

Comprehensive UI/UX polish.

Sound design and music integration.

Milestone 8: Beta & Balancing ("The Living Aetheria")

All core features implemented.

Extensive playtesting and balancing.

Performance optimization.

Bug fixing.

Tutorial implementation.

Milestone 9: Release 1.0

Post-Release: Ongoing support, bug fixes, potential content updates based on player feedback.

11. Future Considerations / Potential Expansions (Beyond 1.0)

Deeper Magic Systems: More complex spellcasting for civilizations, magical artifacts.

Interdimensional Travel/Events: Portals, invasions from other planes.

Naval Gameplay: Advanced ship types, naval combat, exploration of deep oceans.

Underground World Layer: Fully fleshed-out subterranean biomes, civilizations, and dangers.

Advanced Modding Tools: Integrated workshop support.

Scenario Editor / Challenge Modes.

More Races, Creatures, and Biomes.

This PRD provides a comprehensive blueprint. The key will be to tackle development in manageable milestones, focusing on getting core systems stable and fun before adding layers of complexity. Good luck with Project Aetheria!