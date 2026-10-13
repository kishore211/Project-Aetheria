// src/utils/entitySystemMinimal.ts
//
// Creature creation, rendering and the needs-driven AI state machine.
// Every creature is autonomous: it drinks, forages, hunts, flees, fights,
// sleeps, breeds and dies without any central script.
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import {
  isDrinkableBiome,
  isWaterBiome,
  type Entity,
  type EntityType,
  type Tile,
  type TraitId,
} from '../types/world';
import { getPixelSpriteTexture, getPixelSpriteFrames, WALK_FRAMES, gearLook, wieldsGear, type Outfit } from './pixelSprites';
import { armorBlock, claimSpoils, gearSpeed, wearAfterBlow, weaponCooldown, weaponDamage, weaponReach } from './equipment';
import { emitShot, type ShotKind } from './shotBridge';
import { handOverToLayer } from './creatureLayer';
import { wants } from './mind';
import { groundSpeed, stepOnGround } from './biomeEffects';
import { canPreyOn, growthOf, rollSize, sizeOf } from './size';
import {
  canSwim,
  findNearestStandable,
  findPath,
  isAirborne,
  isShoreTile,
  isWalkableForEntity,
} from './pathfinding';
import { applyTraits, rollTraitsForType, traitDamageFactor } from './traits';
import { simulation } from './simulation';
import { emitDamage, emitFloater } from './floatBridge';
import { applyStatus, clearStatus, FLASH_SECONDS, type StatusId } from './statusEffects';
import { updateMood } from './mood';
import { heldDirection, possession } from './possession';
import { DAYLIGHT } from './daylight';
import { applyScenario } from './scenarios';
import { bookAt, converse, readBook } from './identity';
import { STATUSES, type StatusDef } from './statusEffects';
import { speak, type Occasion } from './dialogue';

/** Who gets speech bubbles. Monsters brood; animals do not have a position. */
/** The four that come with an inner life. Everything else can be given one. */
export const BORN_SAPIENT = new Set<string>(['human', 'elf', 'dwarf', 'orc']);
const SPEAKING_TYPES = BORN_SAPIENT;

/**
 * Does this creature have an inner life?
 *
 * Born with one, or given one. The four sentient races are the default and
 * `uplifted` is the door — which is the whole of phase 19.2: one flag, and
 * every animal in the bestiary has a second entry that talks, makes friends,
 * falls in love and grieves. Everything downstream already keys off this
 * single question, so nothing else had to change to let a wolf do any of it.
 */
export const isSapient = (entity: Pick<Entity, 'type' | 'uplifted'>): boolean =>
  SPEAKING_TYPES.has(entity.type) || entity.uplifted === true;
import type { EntityIndex } from './entityManagerMinimal';

/**
 * AI States for entities
 */
export type AIState =
  | 'idle'
  | 'moving'
  | 'following'
  | 'socialising'
  | 'gathering'
  | 'hunting'
  | 'fleeing'
  | 'building'
  | 'fighting'
  | 'sleeping'
  | 'dying';

/** An instruction from the settlement system (deliver goods, build, raid). */
export interface AIOrder {
  kind: 'goto';
  x: number;
  y: number;
  purpose: 'deliver' | 'build' | 'raid' | 'return' | 'herd' | 'settle';
}

// Predator-Prey relationships
export const FOOD_CHAIN: Record<EntityType, EntityType[]> = {
  human: ['rabbit', 'deer', 'fish', 'sheep', 'chicken'],
  elf: ['fish', 'deer'],
  dwarf: ['fish'],
  orc: ['human', 'elf', 'rabbit', 'deer', 'fish', 'sheep'],
  wolf: ['rabbit', 'deer', 'sheep', 'chicken', 'goat'],
  bear: ['fish', 'rabbit', 'deer', 'human', 'sheep'],
  deer: [],
  rabbit: [],
  bird: ['beetle', 'grasshopper', 'butterfly'],
  fish: [],
  sheep: [],
  chicken: ['grasshopper', 'beetle'],
  fox: ['rabbit', 'chicken'],
  snake: ['rabbit', 'chicken'],
  dragon: ['human', 'elf', 'dwarf', 'orc', 'wolf', 'bear', 'deer', 'rabbit', 'sheep'],
  demon: ['human', 'elf', 'dwarf', 'orc'],
  zombie: ['human', 'elf', 'dwarf', 'orc'],
  skeleton: ['human', 'elf', 'dwarf'],
  elemental: [],
  bandit: ['human', 'elf'],
  cat: ['rat', 'chicken', 'fish'],
  dog: ['rabbit', 'rat', 'chicken'],
  cow: [],
  pig: [],
  crab: [],
  frog: ['bee', 'grasshopper', 'beetle', 'butterfly'],
  penguin: ['fish'],
  turtle: [],
  monkey: [],
  rat: [],
  crocodile: ['deer', 'sheep', 'fish', 'human', 'buffalo', 'pig', 'frog', 'flamingo', 'camel'],
  piranha: ['fish'],
  hyena: ['rabbit', 'deer', 'sheep', 'pig', 'ostrich', 'goat'],
  rhino: [],
  buffalo: [],
  unicorn: [],
  fairy: [],
  ghost: ['human', 'elf', 'dwarf', 'orc'],
  mage: ['human', 'elf', 'dwarf', 'orc'],
  druid: [],
  alien: ['human', 'cow', 'sheep'],
  snowman: [],
  goat: [],
  camel: [],
  ostrich: ['grasshopper', 'beetle'],
  flamingo: ['fish'],
  seal: ['fish', 'piranha'],
  polar_bear: ['seal', 'penguin', 'fish', 'human'],
  beetle: [],
  bee: [],
  butterfly: [],
  grasshopper: [],
  necromancer: ['human', 'elf', 'dwarf', 'orc'],
  plague_doctor: [],
  fire_skull: [],
  cold_one: ['human', 'elf', 'dwarf', 'orc', 'deer'],
  ufo: ['cow', 'sheep', 'human'],
  sand_spider: ['rabbit', 'rat', 'beetle', 'grasshopper', 'human'],
  acid_blob: ['human', 'elf', 'dwarf', 'orc'],
  lil_pumpkin: [],
  gummy_bear: [],
  crabzilla: ['human', 'elf', 'dwarf', 'orc', 'cow', 'buffalo', 'rhino'],
  flame_tower: [],
  ice_tower: [],
  white_mage: ['zombie', 'skeleton', 'demon', 'ghost'],
  angel: ['demon', 'zombie', 'skeleton', 'ghost', 'necromancer'],
  sandworm: ['camel', 'human', 'elf', 'dwarf', 'orc', 'goat', 'ostrich'],
  langton_ant: [],
  tumor: [],
  treant: [],
  candy_man: [],
  jumpy_skull: ['human', 'elf', 'dwarf', 'rabbit', 'chicken'],
  robot_santa: [],
  yeti: ['human', 'elf', 'dwarf', 'orc', 'penguin', 'seal', 'goat'],
  monolith: [],
  grey_goo: [],
};

/**
 * Things that are built rather than born. They stand where they were put, do
 * not eat or sleep or wander, and act only through their aura
 * (creatureAbilities.ts) — but they have health and can be torn down.
 */
export const STRUCTURES = new Set<EntityType>(['flame_tower', 'ice_tower', 'tumor', 'langton_ant', 'monolith', 'grey_goo']);

/** Reverse of FOOD_CHAIN, built once at module load. */
const PREDATORS_OF: Partial<Record<EntityType, EntityType[]>> = {};
for (const [predator, preyList] of Object.entries(FOOD_CHAIN) as [EntityType, EntityType[]][]) {
  for (const prey of preyList) {
    (PREDATORS_OF[prey] ??= []).push(predator);
  }
}

const SENTIENT: EntityType[] = ['human', 'elf', 'dwarf', 'orc'];

/** What the Peaceful Monsters law calms down. */
export const MONSTERS = new Set<EntityType>([
  'dragon', 'demon', 'zombie', 'skeleton', 'elemental', 'bandit', 'ghost', 'mage', 'alien',
  'necromancer', 'fire_skull', 'cold_one', 'ufo', 'sand_spider', 'acid_blob', 'crabzilla',
  'flame_tower', 'ice_tower', 'sandworm', 'jumpy_skull', 'tumor', 'yeti', 'grey_goo',
]);
export const isSentient = (type: EntityType): boolean => SENTIENT.includes(type);

/**
 * Generate a name for an entity based on type
 */
function generateEntityName(type: EntityType): string {
  const names: Record<EntityType, string[]> = {
    human: ['Alex', 'Jamie', 'Morgan', 'Taylor', 'Jordan', 'Casey', 'Robin', 'Quinn', 'Riley', 'Avery'],
    elf: ['Elrond', 'Galadriel', 'Legolas', 'Arwen', 'Tauriel', 'Thranduil', 'Celeborn', 'Earwen', 'Finrod', 'Luthien'],
    dwarf: ['Thorin', 'Gimli', 'Balin', 'Dwalin', 'Fili', 'Kili', 'Gloin', 'Oin', 'Bifur', 'Bofur'],
    orc: ['Gromm', 'Zugdug', 'Krag', 'Rukh', 'Muzgash', 'Grishnak', 'Bolg', 'Azog', 'Ugluk', 'Lurtz'],
    wolf: ['Alpha', 'Shadow', 'Fang', 'Luna', 'Ghost', 'Storm', 'Timber', 'Blizzard', 'Savage', 'Howler'],
    bear: ['Grizzly', 'Kodiak', 'Bruno', 'Honey', 'Ursa', 'Teddy', 'Claw', 'Moose', 'Thunder', 'Shaggy'],
    deer: ['Bambi', 'Buck', 'Stag', 'Doe', 'Dasher', 'Prancer', 'Forest', 'Speckle', 'Maple', 'Swift'],
    rabbit: ['Hopper', 'Thumper', 'Cottontail', 'Flopsy', 'Mopsy', 'Peter', 'Benny', 'Roger', 'Jasper', 'Hazel'],
    bird: ['Robin', 'Sparrow', 'Jay', 'Swift', 'Hawk', 'Raven', 'Wren', 'Finch', 'Eagle', 'Falcon'],
    sheep: ['Woolly', 'Clover', 'Dolly', 'Nimbus', 'Fluff', 'Cotton', 'Baabara', 'Pip', 'Meadow', 'Snowdrop'],
    chicken: ['Pecky', 'Henrietta', 'Clucks', 'Nugget', 'Rooster', 'Feathers', 'Yolko', 'Scratch', 'Biddy', 'Coop'],
    fox: ['Rusty', 'Vixen', 'Ember', 'Copper', 'Sly', 'Kit', 'Amber', 'Bramble', 'Cinder', 'Dusk'],
    snake: ['Hiss', 'Coil', 'Venom', 'Slither', 'Fang', 'Scale', 'Basil', 'Nagi', 'Serpens', 'Rattle'],
    fish: ['Fins', 'Bubbles', 'Scales', 'Nemo', 'Marlin', 'Dory', 'Wave', 'Splash', 'Shimmer', 'Gill'],
    dragon: ['Smaug', 'Drogon', 'Glaurung', 'Rhaegal', 'Viserion', 'Balerion', 'Meraxes', 'Vermithrax', 'Alduin', 'Fafnir'],
    demon: ['Abaddon', 'Baal', 'Lilith', 'Mephistopheles', 'Asmodeus', 'Beelzebub', 'Moloch', 'Belial', 'Mammon', 'Legion'],
    zombie: ['Shuffler', 'Rotter', 'Lurcher', 'Biter', 'Walker', 'Shambler', 'Moaner', 'Creeper', 'Stinker', 'Lurch'],
    skeleton: ['Rattlebones', 'Marrow', 'Skully', 'Ribs', 'Clatters', 'Bones', 'Creaks', 'Dusty', 'Hollow', 'Grim'],
    elemental: ['Ember', 'Gust', 'Pebble', 'Splash', 'Bolt', 'Quake', 'Frost', 'Blaze', 'Torrent', 'Spark'],
    bandit: ['Cutthroat', 'Knuckles', 'Blade', 'Shadow', 'Scar', 'Knives', 'Dagger', 'Rogue', 'Crook', 'Mugger'],
    cat: ['Whiskers', 'Mittens', 'Tom', 'Sooty', 'Ginger', 'Pounce', 'Biscuit', 'Shadow', 'Socks', 'Purrcy'],
    dog: ['Rex', 'Buddy', 'Scout', 'Biscuit', 'Rover', 'Patch', 'Bandit', 'Fetch', 'Duke', 'Pip'],
    cow: ['Daisy', 'Bessie', 'Buttercup', 'Moo', 'Clover', 'Bluebell', 'Marigold', 'Rosie', 'Hilda', 'Gertie'],
    pig: ['Truffle', 'Porkchop', 'Hamlet', 'Snout', 'Wilbur', 'Babe', 'Pickles', 'Oink', 'Mud', 'Bacon'],
    crab: ['Pinchy', 'Snips', 'Clacks', 'Shelly', 'Sideways', 'Claws', 'Barnacle', 'Krabby', 'Tide', 'Reef'],
    frog: ['Ribbit', 'Hopper', 'Croaky', 'Lily', 'Puddle', 'Toady', 'Fly', 'Bog', 'Gulp', 'Jumper'],
    penguin: ['Waddles', 'Tux', 'Pingu', 'Flipper', 'Iceberg', 'Slider', 'Mumble', 'Pebble', 'Frost', 'Dapper'],
    turtle: ['Shelly', 'Slowpoke', 'Tank', 'Mossback', 'Ancient', 'Pebble', 'Dome', 'Steady', 'Patience', 'Gramps'],
    monkey: ['Bongo', 'Coco', 'Banana', 'Chimp', 'Mischief', 'Swing', 'Kiki', 'Momo', 'Nutmeg', 'Scamp'],
    rat: ['Squeak', 'Nibbles', 'Scurry', 'Whisker', 'Cheese', 'Gnaw', 'Sewer', 'Tail', 'Pip', 'Rascal'],
    crocodile: ['Snapper', 'Jaws', 'Grin', 'Mud', 'Scales', 'Lurker', 'Gator', 'Tick-Tock', 'Old Teeth', 'Riverking'],
    piranha: ['Nibble', 'Razor', 'Chomp', 'Frenzy', 'Bite', 'Shred', 'Gnash', 'Snap', 'Fang', 'Sliver'],
    hyena: ['Cackle', 'Giggles', 'Scrounge', 'Spot', 'Snicker', 'Bone', 'Mangy', 'Grin', 'Howl', 'Scruff'],
    rhino: ['Tank', 'Horn', 'Boulder', 'Charge', 'Thunder', 'Hide', 'Grumble', 'Ram', 'Bulwark', 'Stomp'],
    buffalo: ['Bison', 'Thunder', 'Shag', 'Plains', 'Hoof', 'Brute', 'Dust', 'Horns', 'Stampede', 'Bull'],
    unicorn: ['Starlight', 'Moonbeam', 'Sparkle', 'Glimmer', 'Aurora', 'Celeste', 'Prism', 'Twinkle', 'Dawn', 'Opal'],
    fairy: ['Thistle', 'Pip', 'Bramble', 'Willow', 'Dewdrop', 'Fern', 'Glimmer', 'Moss', 'Petal', 'Wisp'],
    ghost: ['Wail', 'Mist', 'Shade', 'Murmur', 'Pale', 'Echo', 'Whisper', 'Grey Lady', 'Lament', 'Chill'],
    mage: ['Malachar', 'Vex', 'Morwen', 'Zarathos', 'Nyx', 'Severin', 'Ilsa', 'Thorne', 'Corvus', 'Obsidia'],
    druid: ['Rowan', 'Oakheart', 'Sage', 'Briar', 'Aspen', 'Hazel', 'Elder', 'Moss', 'Yarrow', 'Thornwood'],
    alien: ['Zorp', 'Glorx', 'Xyl', 'Blip', 'Quazz', 'Nebula', 'Vrrk', 'Zim', 'Plort', 'Ulgo'],
    snowman: ['Frosty', 'Carrot', 'Flurry', 'Chilly', 'Sleet', 'Slush', 'Pebbles', 'Coal', 'Drift', 'Mister Cold'],
    goat: ['Billy', 'Nanny', 'Butts', 'Crag', 'Tin Can', 'Gruff', 'Ledge', 'Beard', 'Scramble', 'Old Horn'],
    camel: ['Humphrey', 'Dune', 'Sahara', 'Spit', 'Caravan', 'Oasis', 'Lumpy', 'Mirage', 'Drift', 'Sand'],
    ostrich: ['Sprint', 'Plume', 'Kick', 'Longshanks', 'Dash', 'Gawk', 'Feathers', 'Bolt', 'Stilts', 'Strut'],
    flamingo: ['Rosie', 'Blush', 'Coral', 'Stilt', 'Pinky', 'Salmon', 'Flora', 'Wade', 'Grace', 'Bubblegum'],
    seal: ['Blubber', 'Flop', 'Whiskers', 'Splash', 'Barky', 'Floe', 'Pup', 'Sleek', 'Slick', 'Ozzy'],
    polar_bear: ['Ice', 'Nanuk', 'Blizzard', 'Frost', 'Snowpaw', 'Tundra', 'Aurora', 'Glacier', 'Whiteout', 'Polaris'],
    beetle: ['Click', 'Dung', 'Shiny', 'Scarab', 'Tank', 'Buzz', 'Crawl', 'Chitin', 'Bug', 'Roller'],
    bee: ['Buzz', 'Honey', 'Bumble', 'Stinger', 'Pollen', 'Queenie', 'Drone', 'Nectar', 'Hum', 'Waxy'],
    butterfly: ['Flutter', 'Monarch', 'Painted Lady', 'Admiral', 'Swallowtail', 'Wisp', 'Dusty', 'Glimmer', 'Sky', 'Petal'],
    grasshopper: ['Hopper', 'Chirp', 'Jiminy', 'Leaps', 'Cricket', 'Green', 'Fiddle', 'Spring', 'Kick', 'Locust'],
    necromancer: ['Mortis', 'Vael', 'Grimwald', 'Sepulchra', 'Ossian', 'Dread', 'Lich-to-be', 'Cinder', 'Morrow', 'Hollowed'],
    plague_doctor: ['Doctor Beak', 'Physick', 'Vesalius', 'The Crow', 'Galen', 'Dr. Rook', 'Leech', 'Theriac', 'Miasma', 'Remedy'],
    fire_skull: ['Cinder', 'Blaze', 'Grin', 'Ember', 'Pyre', 'Smoulder', 'Kindle', 'Ash', 'Hothead', 'Flicker'],
    cold_one: ['Rime', 'Hoarfrost', 'Winterborn', 'Sleet', 'Ymir', 'Frostbite', 'Gelid', 'Boreas', 'Chill', 'The Pale'],
    ufo: ['Visitor', 'Saucer', 'Probe', 'Beacon', 'Hover', 'Unidentified', 'Glimmer', 'Tractor', 'Signal', 'Abductor'],
    sand_spider: ['Skitter', 'Dune Widow', 'Eight', 'Burrow', 'Fangs', 'Weaver', 'Dust', 'Creep', 'Silk', 'Lurker'],
    acid_blob: ['Gloop', 'Ooze', 'Splorch', 'Goo', 'Fizz', 'Burbles', 'Slime', 'Drip', 'Corrode', 'Bloop'],
    lil_pumpkin: ['Jack', 'Gourd', 'Squash', 'Patch', 'Lantern', 'Pie', 'Spooky', 'Orange', 'Seedy', 'Hollow'],
    gummy_bear: ['Gummy', 'Jelly', 'Chewy', 'Sugarpaw', 'Sticky', 'Cherry', 'Lime', 'Squish', 'Bouncy', 'Sweetie'],
    crabzilla: ['Crabzilla', 'King Claw', 'The Tide', 'Shellshock', 'Colossus', 'Big Pinch', 'Leviathan', 'Snapjaw', 'Titan', 'Reefbreaker'],
    flame_tower: ['Pyre Spire', 'The Brazier', 'Emberwatch', 'Cinder Keep', 'Hellbeacon'],
    ice_tower: ['Rime Spire', 'The Icicle', 'Frostwatch', 'Glacier Keep', 'Winterbeacon'],
    white_mage: ['Aldwyn', 'Seraphel', 'Lumen', 'Ilyria', 'Caelum', 'Mirabel', 'Solace', 'Halvard', 'Pellam', 'Elowen'],
    angel: ['Auriel', 'Cassiel', 'Zadkiel', 'Raziel', 'Haniel', 'Seraph', 'Ophan', 'Lumiel', 'Sariel', 'Eloa'],
    sandworm: ['Shai', 'The Maker', 'Dune Eater', 'Old Man of the Desert', 'Grit', 'Sandmaw', 'Burrower', 'Quake', 'Deepmouth', 'Tunneler'],
    langton_ant: ['Langton', 'Turmite', 'Rule One', 'The Highway', 'Flipflop', 'Ant Zero', 'Chirality', 'Cell', 'Step', 'Automaton'],
    tumor: ['Growth', 'The Mass', 'Swell', 'Lump', 'Spore', 'Blight', 'Bulge', 'Pustule', 'Node', 'Knot'],
    treant: ['Oakenshield', 'Barkbeard', 'Rootfather', 'Elderbough', 'Mossheart', 'Greywood', 'Thornwise', 'Leafwarden', 'Hollowtrunk', 'Old Ring'],
    candy_man: ['Gumdrop', 'Licorice', 'Toffee', 'Marzipan', 'Fudge', 'Jellybean', 'Caramel', 'Nougat', 'Sherbet', 'Taffy'],
    jumpy_skull: ['Boing', 'Hopper', 'Clack', 'Bounce', 'Skip', 'Rattle', 'Jitter', 'Spring', 'Pogo', 'Knock'],
    robot_santa: ['SANTA-9000', 'Unit Noel', 'Claus Prime', 'Gift Protocol', 'Ho-Ho-Bot', 'Jingle.exe', 'Kringle Mk II', 'Sleighframe', 'Elfware', 'Present Tense'],
    yeti: ['Bigfoot', 'Abominable', 'Frostfang', 'Snowshoe', 'Hairy', 'Whiteout', 'Glacier', 'Tundra', 'Avalanche', 'Mountain Uncle'],
    monolith: ['The Monolith', 'The Slab', 'TMA-1', 'The Teacher', 'The Black Stone'],
    grey_goo: ['Goo', 'The Grey', 'Swarm', 'Nanite', 'Replicator'],
  };

  const nameList = names[type] ?? ['Unknown'];
  return nameList[Math.floor(Math.random() * nameList.length)];
}

interface TypeProfile {
  maxAge: number;
  maxHealth: number;
  strength: number;
  intelligence: number;
  speed: number;
  resilience: number;
}

const PROFILES: Partial<Record<EntityType, TypeProfile>> = {
  human: { maxAge: 80, maxHealth: 100, strength: 10, intelligence: 15, speed: 10, resilience: 10 },
  elf: { maxAge: 500, maxHealth: 90, strength: 8, intelligence: 18, speed: 12, resilience: 8 },
  dwarf: { maxAge: 250, maxHealth: 120, strength: 15, intelligence: 12, speed: 8, resilience: 15 },
  orc: { maxAge: 60, maxHealth: 115, strength: 18, intelligence: 8, speed: 10, resilience: 12 },
  wolf: { maxAge: 15, maxHealth: 80, strength: 12, intelligence: 8, speed: 15, resilience: 10 },
  bear: { maxAge: 25, maxHealth: 150, strength: 18, intelligence: 7, speed: 8, resilience: 15 },
  deer: { maxAge: 12, maxHealth: 70, strength: 5, intelligence: 6, speed: 16, resilience: 8 },
  rabbit: { maxAge: 5, maxHealth: 30, strength: 2, intelligence: 5, speed: 18, resilience: 4 },
  bird: { maxAge: 6, maxHealth: 25, strength: 2, intelligence: 6, speed: 20, resilience: 4 },
  fish: { maxAge: 6, maxHealth: 25, strength: 2, intelligence: 3, speed: 12, resilience: 4 },
  sheep: { maxAge: 12, maxHealth: 60, strength: 4, intelligence: 4, speed: 8, resilience: 8 },
  chicken: { maxAge: 6, maxHealth: 20, strength: 1, intelligence: 3, speed: 9, resilience: 3 },
  fox: { maxAge: 10, maxHealth: 50, strength: 8, intelligence: 10, speed: 16, resilience: 7 },
  snake: { maxAge: 12, maxHealth: 35, strength: 10, intelligence: 4, speed: 7, resilience: 6 },
  dragon: { maxAge: 900, maxHealth: 600, strength: 45, intelligence: 20, speed: 14, resilience: 35 },
  demon: { maxAge: 400, maxHealth: 260, strength: 30, intelligence: 16, speed: 12, resilience: 22 },
  zombie: { maxAge: 9999, maxHealth: 70, strength: 12, intelligence: 2, speed: 5, resilience: 12 },
  skeleton: { maxAge: 9999, maxHealth: 60, strength: 11, intelligence: 3, speed: 8, resilience: 10 },
  elemental: { maxAge: 600, maxHealth: 180, strength: 20, intelligence: 12, speed: 11, resilience: 25 },
  bandit: { maxAge: 60, maxHealth: 105, strength: 14, intelligence: 11, speed: 12, resilience: 10 },
  cat: { maxAge: 14, maxHealth: 35, strength: 5, intelligence: 9, speed: 16, resilience: 5 },
  dog: { maxAge: 14, maxHealth: 60, strength: 9, intelligence: 9, speed: 15, resilience: 8 },
  cow: { maxAge: 20, maxHealth: 110, strength: 6, intelligence: 4, speed: 6, resilience: 12 },
  pig: { maxAge: 15, maxHealth: 70, strength: 5, intelligence: 7, speed: 7, resilience: 9 },
  crab: { maxAge: 8, maxHealth: 30, strength: 4, intelligence: 2, speed: 6, resilience: 10 },
  frog: { maxAge: 6, maxHealth: 18, strength: 1, intelligence: 3, speed: 12, resilience: 3 },
  penguin: { maxAge: 18, maxHealth: 40, strength: 3, intelligence: 5, speed: 7, resilience: 7 },
  turtle: { maxAge: 150, maxHealth: 90, strength: 3, intelligence: 6, speed: 3, resilience: 25 },
  monkey: { maxAge: 25, maxHealth: 45, strength: 5, intelligence: 12, speed: 15, resilience: 5 },
  rat: { maxAge: 3, maxHealth: 12, strength: 1, intelligence: 6, speed: 14, resilience: 2 },
  crocodile: { maxAge: 70, maxHealth: 170, strength: 20, intelligence: 4, speed: 7, resilience: 18 },
  piranha: { maxAge: 8, maxHealth: 20, strength: 6, intelligence: 2, speed: 15, resilience: 3 },
  hyena: { maxAge: 16, maxHealth: 70, strength: 11, intelligence: 7, speed: 15, resilience: 9 },
  rhino: { maxAge: 45, maxHealth: 220, strength: 22, intelligence: 4, speed: 9, resilience: 24 },
  buffalo: { maxAge: 25, maxHealth: 140, strength: 14, intelligence: 4, speed: 9, resilience: 14 },
  unicorn: { maxAge: 1000, maxHealth: 160, strength: 12, intelligence: 16, speed: 18, resilience: 14 },
  fairy: { maxAge: 300, maxHealth: 30, strength: 2, intelligence: 18, speed: 18, resilience: 4 },
  ghost: { maxAge: 9999, maxHealth: 50, strength: 8, intelligence: 10, speed: 9, resilience: 30 },
  mage: { maxAge: 200, maxHealth: 120, strength: 22, intelligence: 22, speed: 9, resilience: 12 },
  druid: { maxAge: 300, maxHealth: 110, strength: 10, intelligence: 20, speed: 10, resilience: 14 },
  alien: { maxAge: 400, maxHealth: 120, strength: 16, intelligence: 24, speed: 12, resilience: 12 },
  snowman: { maxAge: 40, maxHealth: 60, strength: 6, intelligence: 4, speed: 5, resilience: 6 },
  goat: { maxAge: 14, maxHealth: 55, strength: 6, intelligence: 5, speed: 13, resilience: 8 },
  camel: { maxAge: 25, maxHealth: 120, strength: 8, intelligence: 5, speed: 9, resilience: 14 },
  ostrich: { maxAge: 20, maxHealth: 70, strength: 7, intelligence: 3, speed: 19, resilience: 7 },
  flamingo: { maxAge: 20, maxHealth: 35, strength: 2, intelligence: 4, speed: 9, resilience: 4 },
  seal: { maxAge: 25, maxHealth: 70, strength: 5, intelligence: 6, speed: 10, resilience: 10 },
  polar_bear: { maxAge: 25, maxHealth: 170, strength: 19, intelligence: 7, speed: 9, resilience: 16 },
  beetle: { maxAge: 2, maxHealth: 10, strength: 2, intelligence: 1, speed: 6, resilience: 6 },
  bee: { maxAge: 1, maxHealth: 6, strength: 2, intelligence: 3, speed: 16, resilience: 1 },
  butterfly: { maxAge: 1, maxHealth: 5, strength: 0, intelligence: 2, speed: 12, resilience: 1 },
  grasshopper: { maxAge: 1, maxHealth: 8, strength: 1, intelligence: 1, speed: 14, resilience: 2 },
  necromancer: { maxAge: 300, maxHealth: 140, strength: 14, intelligence: 22, speed: 8, resilience: 12 },
  plague_doctor: { maxAge: 70, maxHealth: 100, strength: 8, intelligence: 18, speed: 10, resilience: 12 },
  fire_skull: { maxAge: 9999, maxHealth: 40, strength: 9, intelligence: 4, speed: 16, resilience: 8 },
  cold_one: { maxAge: 500, maxHealth: 160, strength: 18, intelligence: 8, speed: 8, resilience: 20 },
  ufo: { maxAge: 9999, maxHealth: 200, strength: 12, intelligence: 30, speed: 16, resilience: 18 },
  sand_spider: { maxAge: 12, maxHealth: 60, strength: 12, intelligence: 3, speed: 14, resilience: 8 },
  acid_blob: { maxAge: 30, maxHealth: 90, strength: 10, intelligence: 2, speed: 5, resilience: 14 },
  lil_pumpkin: { maxAge: 10, maxHealth: 25, strength: 3, intelligence: 3, speed: 9, resilience: 4 },
  gummy_bear: { maxAge: 12, maxHealth: 40, strength: 4, intelligence: 4, speed: 10, resilience: 6 },
  crabzilla: { maxAge: 400, maxHealth: 900, strength: 50, intelligence: 6, speed: 7, resilience: 40 },
  flame_tower: { maxAge: 9999, maxHealth: 500, strength: 0, intelligence: 0, speed: 0, resilience: 30 },
  ice_tower: { maxAge: 9999, maxHealth: 500, strength: 0, intelligence: 0, speed: 0, resilience: 30 },
  white_mage: { maxAge: 220, maxHealth: 120, strength: 14, intelligence: 24, speed: 9, resilience: 12 },
  angel: { maxAge: 9999, maxHealth: 260, strength: 26, intelligence: 22, speed: 15, resilience: 24 },
  sandworm: { maxAge: 300, maxHealth: 700, strength: 40, intelligence: 4, speed: 9, resilience: 30 },
  langton_ant: { maxAge: 9999, maxHealth: 40, strength: 0, intelligence: 1, speed: 0, resilience: 6 },
  tumor: { maxAge: 9999, maxHealth: 160, strength: 0, intelligence: 0, speed: 0, resilience: 18 },
  treant: { maxAge: 2000, maxHealth: 420, strength: 24, intelligence: 14, speed: 5, resilience: 32 },
  candy_man: { maxAge: 40, maxHealth: 60, strength: 5, intelligence: 6, speed: 9, resilience: 6 },
  jumpy_skull: { maxAge: 9999, maxHealth: 35, strength: 9, intelligence: 3, speed: 19, resilience: 6 },
  robot_santa: { maxAge: 9999, maxHealth: 300, strength: 10, intelligence: 20, speed: 10, resilience: 30 },
  yeti: { maxAge: 120, maxHealth: 320, strength: 30, intelligence: 8, speed: 10, resilience: 22 },
  monolith: { maxAge: 9999, maxHealth: 2000, strength: 0, intelligence: 50, speed: 0, resilience: 60 },
  grey_goo: { maxAge: 9999, maxHealth: 60, strength: 0, intelligence: 0, speed: 0, resilience: 10 },
};

const DEFAULT_PROFILE: TypeProfile = {
  maxAge: 100, maxHealth: 100, strength: 10, intelligence: 10, speed: 10, resilience: 10,
};

/** A kind's base stats, for the Knowledge book. */
export const profileOf = (type: EntityType): Readonly<TypeProfile> => PROFILES[type] ?? DEFAULT_PROFILE;

/**
 * Create a new entity of the specified type
 */
export function createEntity(
  type: EntityType,
  x: number,
  y: number,
  traits?: TraitId[],
): Entity {
  const profile = PROFILES[type] ?? DEFAULT_PROFILE;

  const entity: Entity = {
    id: uuidv4(),
    type,
    name: generateEntityName(type),
    age: 0,
    maxAge: profile.maxAge,
    health: profile.maxHealth,
    maxHealth: profile.maxHealth,
    position: { x, y },
    attributes: {
      strength: profile.strength,
      intelligence: profile.intelligence,
      speed: profile.speed,
      resilience: profile.resilience,
    },
    needs: { hunger: 1.0, thirst: 1.0, rest: 1.0, social: 1.0 },
    inventory: [],
    status: [],
    // Staggered so a crowd does not breathe in unison. Two dozen creatures
    // bobbing on the same beat reads as a mechanism; the same two dozen out of
    // phase reads as a crowd.
    walkPhase: Math.random(),
    traits: traits ?? rollTraitsForType(type),
    kills: 0,
    kingdomId: null,
    villageId: null,
    carrying: null,
    job: null,
  };

  // Start part-grown so a fresh world is not entirely newborns
  entity.age = profile.maxAge * (0.2 + Math.random() * 0.25);
  applyTraits(entity);
  // After the traits, because a strong wolf is a bigger wolf.
  entity.size = rollSize(type, entity.traits);
  return entity;
}

/**
 * Create a 3D mesh for an entity based on its type
 */
export function createEntityMesh(entity: Entity): THREE.Object3D {
  const size = getEntitySize(entity);
  const container = new THREE.Object3D();
  container.name = `entity-${entity.id}`;

  const texture = getPixelSpriteTexture(entity.type, entity.subspecies);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.1,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size * 3, size * 3, 1);
  sprite.position.y = size * 1.5;
  container.add(sprite);

  const healthBar = createHealthBar(entity);
  healthBar.position.y = size * 3.4;
  container.add(healthBar);

  // Drawn by the creature layer in one batch; these objects keep the state.
  handOverToLayer(container);
  return container;
}

/**
 * Get a size based on entity type
 */
/**
 * How big to draw this one.
 *
 * Reads the creature's own size rather than a table of kinds, which is what
 * makes a crowd of wolves look like a crowd instead of a row of stamps.
 */
function getEntitySize(entity: Pick<Entity, 'type' | 'size'> & Partial<Pick<Entity, 'age' | 'maxAge'>>): number {
  // Children are drawn small and grow into their size.
  const growth = entity.age !== undefined && entity.maxAge !== undefined
    ? growthOf({ age: entity.age, maxAge: entity.maxAge })
    : 1;
  return sizeOf(entity) * growth;
}

/**
 * Create a billboarded health bar indicator for an entity
 */
function createHealthBar(entity: Entity): THREE.Object3D {
  const container = new THREE.Object3D();
  container.name = 'healthBar';

  const bgMaterial = new THREE.SpriteMaterial({ color: 0x222222, depthTest: false });
  const background = new THREE.Sprite(bgMaterial);
  background.scale.set(0.34, 0.05, 1);
  container.add(background);

  const healthPercent = entity.health / entity.maxHealth;
  const fillMaterial = new THREE.SpriteMaterial({ color: 0x00dd44, depthTest: false });
  const fill = new THREE.Sprite(fillMaterial);
  fill.scale.set(0.3 * healthPercent, 0.035, 1);
  fill.position.z = 0.001;
  container.add(fill);

  container.visible = healthPercent < 0.99;
  return container;
}

/** Human-readable animation name, surfaced in the inspector. */
export function getAnimationForEntityStatus(entity: Entity): string {
  const status = entity.status;
  if (status.includes('dead')) return 'death';
  if (status.includes('attacking')) return 'attack';
  if (status.includes('fleeing')) return 'run';
  if (status.includes('sleeping')) return 'sleep';
  if (status.includes('eating') || status.includes('drinking')) return 'eat';
  if (status.includes('moving')) return 'walk';
  return 'idle';
}

/**
 * Update the entity's mesh based on its current state.
 * `detailLevel` (0-1) comes from the camera distance: chrome and animation are
 * dropped when the map is zoomed far out.
 */
/**
 * How fast this creature covers ground, for pacing its stride.
 *
 * Mirrors the AI's own `tilesPerSecond` rather than reaching into it, because
 * this runs from the render path and the AI instance is not to hand. A small
 * duplication in exchange for the render layer not depending on the AI layer.
 */
const tilesPerSecondOf = (entity: Entity): number => {
  let speed = entity.attributes.speed * 0.12;
  if (entity.status.includes('exhausted')) speed *= 0.5;
  if (entity.status.includes('captain')) speed *= 0.72;
  return speed;
};

export function updateEntityMesh(entity: Entity, deltaTime = 1 / 60, detailLevel = 1): void {
  if (!entity.mesh) return;

  const healthBar = entity.mesh.children.find(child => child.name === 'healthBar');
  if (healthBar) {
    const healthPercent = Math.max(0, entity.health / entity.maxHealth);
    healthBar.visible = detailLevel > 0.45 && healthPercent < 0.99;
    if (healthBar.visible) {
      const fill = healthBar.children[1] as THREE.Sprite | undefined;
      if (fill) {
        fill.scale.x = Math.max(0.001, 0.3 * healthPercent);
        const material = fill.material as THREE.SpriteMaterial;
        if (healthPercent > 0.7) material.color.setHex(0x00dd44);
        else if (healthPercent > 0.3) material.color.setHex(0xffcc00);
        else material.color.setHex(0xff3322);
      }
    }
  }

  const sprite = entity.mesh.children.find(child => child instanceof THREE.Sprite) as THREE.Sprite | undefined;
  if (!sprite) return;

  // Facing and the flash pop both live in the sprite's scale, so the scale is
  // recomputed from the creature's size every frame rather than mutated in
  // place. Mutating it meant a multiplicative effect could never be undone —
  // the pop would compound and the creature would grow without limit.
  const spriteBase = getEntitySize(entity) * 3;
  if (entity.lastPosition) {
    const dx = entity.position.x - entity.lastPosition.x;
    if (Math.abs(dx) > 1e-4) entity.facing = dx > 0 ? 1 : -1;
  }
  // A brief pop on the same clock as the white flash. Colour alone is not
  // enough: an untinted sprite is already white, so lerping it toward white
  // does nothing at all — which is how the first version of this managed to be
  // invisible on exactly the creatures it most needed to work for.
  const pop = entity.flashFor !== undefined && entity.flashFor > 0
    ? 1 + Math.min(1, entity.flashFor / FLASH_SECONDS) * 0.16
    : 1;

  const baseY = getEntitySize(entity) * 1.5;
  // Squash and stretch, filled in by whichever locomotion branch runs and
  // folded into the scale once, at the end.
  let squashX = 1;
  let squashY = 1;
  const isMoving = entity.status.includes('moving');
  const material = sprite.material as THREE.SpriteMaterial;

  if (isMoving && detailLevel > 0.25) {
    // The stride clock runs on the *simulated* delta, not the wall clock.
    //
    // The old version drove both the frame and the bob off Date.now(), so at
    // triple speed a creature crossed the map three times as fast with its legs
    // moving at the same rate — it skated. Advancing the phase by distance
    // travelled instead means the feet always match the ground, at any speed,
    // and it comes out free because the delta is already here.
    const stridesPerSecond = Math.max(1.6, tilesPerSecondOf(entity) * 1.9);
    entity.walkPhase = ((entity.walkPhase ?? 0) + deltaTime * stridesPerSecond) % 1;

    const frames = getPixelSpriteFrames(entity.type, entity.subspecies, outfitOf(entity), gearLook(entity.equipment));
    const frameIndex = Math.floor(entity.walkPhase * WALK_FRAMES) % frames.length;
    if (material.map !== frames[frameIndex]) {
      material.map = frames[frameIndex];
      material.needsUpdate = true;
    }

    // A hop, not a walk.
    //
    // WorldBox creatures hop, and it is a surprising amount of why their crowds
    // read as alive: `abs(sin)` gives two soft bounces per stride with the
    // creature never actually at rest, which is a hover. Half a sine clipped at
    // zero gives one arc and then a beat of contact with the ground, and the
    // beat is the part the eye reads as weight.
    const size = getEntitySize(entity);
    const air = Math.max(0, Math.sin(entity.walkPhase * Math.PI * 2));
    // The grounded half of the cycle, peaking mid-contact — where the legs are
    // most compressed, just after landing and just before the next push.
    const contact = Math.max(0, -Math.sin(entity.walkPhase * Math.PI * 2));
    sprite.position.y = baseY + air * size * 0.26;
    squashY = 1 + air * 0.10 - contact * 0.10;
    squashX = 1 - air * 0.07 + contact * 0.08;
    sprite.position.x = 0;
    // A little lean into the direction of travel. Cheap, and it is most of what
    // makes a hop look like effort rather than sliding.
    sprite.material.rotation = -(entity.facing ?? 1) * air * 0.07;
  } else {
    entity.walkPhase = ((entity.walkPhase ?? 0) + deltaTime * 0.35) % 1;
    const frames = getPixelSpriteFrames(entity.type, entity.subspecies, outfitOf(entity), gearLook(entity.equipment));
    if (material.map !== frames[0]) {
      material.map = frames[0];
      material.needsUpdate = true;
    }
    // Idle breathing: slow, small, and always on. A creature that is perfectly
    // still reads as a placed object; one that breathes reads as alive even
    // when it is doing nothing.
    const size = getEntitySize(entity);
    const breath = Math.sin(entity.walkPhase * Math.PI * 2);
    sprite.position.y = baseY + breath * size * 0.035;

    // A twitch, on top of the breath.
    //
    // WorldBox ships a "units random shake animation" and it is the difference
    // between a queue of people and a rank of statues. It has to be a twitch
    // rather than a constant tremor — brief, damped, and rare — or a crowd
    // looks like it is shivering. The phase comes from `walkPhase`, which each
    // creature starts at a different random value, so no two twitch together.
    const TWITCH_START = 0.88;
    const inTwitch = entity.walkPhase > TWITCH_START;
    const twitch = inTwitch
      ? Math.sin((entity.walkPhase - TWITCH_START) * Math.PI * 26)
        * (1 - (entity.walkPhase - TWITCH_START) / (1 - TWITCH_START))
      : 0;
    sprite.position.x = twitch * size * 0.09;
    sprite.material.rotation = twitch * 0.05;
  }

  // The swing. A blow is a lunge toward the target and a lean into it, so a
  // battle reads as people hitting each other rather than standing in a heap
  // changing colour.
  if (entity.status.includes('attacking')) {
    const facing = entity.facing ?? 1;
    sprite.position.x += facing * getEntitySize(entity) * 0.35;
    sprite.material.rotation = -facing * 0.2;
  }

  sprite.scale.set(
    spriteBase * pop * squashX * (entity.facing ?? 1),
    spriteBase * pop * squashY,
    1,
  );

  applyStatusVisuals(entity, sprite, deltaTime);
}

/**
 * Tint and fade the sprite according to the entity's status effects.
 */
function applyStatusVisuals(entity: Entity, sprite: THREE.Sprite, deltaTime: number): void {
  const material = sprite.material as THREE.SpriteMaterial;
  entity.currentAnimation = getAnimationForEntityStatus(entity);

  material.opacity = 1;
  material.color.setHex(0xffffff);

  if (entity.status.includes('sleeping')) {
    material.opacity = 0.75;
  }

  if (entity.status.includes('fleeing')) {
    // A shake, not a re-roll. Reading a fresh random number every frame is
    // white noise at frame rate, which the eye reads as a rendering fault
    // rather than as panic; a fast sine off the walk phase reads as trembling.
    // Overrides the locomotion offset rather than adding to it: panic is the
    // only thing that matters about a fleeing creature, and two shakes summed
    // read as neither.
    sprite.position.x = Math.sin((entity.walkPhase ?? 0) * Math.PI * 24) * 0.03;
  }

  if (entity.status.includes('attacking')) {
    material.color.setHex(0xffd0c0);
  } else if (entity.status.includes('wounded')) {
    material.color.setHex(0xffb0b0);
  } else if (entity.status.includes('blessed')) {
    material.color.setHex(0xfff3c0);
  }

  // The light it is standing in, before the flash so a flash still reads
  // as a flash at midnight.
  material.color.multiply(DAYLIGHT.color);

  // The flash goes last so it overrides every status tint. Something *just
  // happened* is more urgent than what is ongoing, and the whole value of the
  // flash is that it is unmissable.
  //
  // Counted down here rather than in the AI because it is a render concern and
  // this is the one place that already has both the delta and the material.
  if (entity.flashFor !== undefined && entity.flashFor > 0) {
    // Ease out, so it reads as a flash landing rather than a lamp switching off.
    const strength = Math.max(0, Math.min(1, entity.flashFor / FLASH_SECONDS));
    material.color.lerp(WHITE_FLASH, strength * strength);
    // Decremented last, and only here, so the scale pop above and the tint
    // here always read the same value on the same frame.
    entity.flashFor -= deltaTime;
  }
}

/**
 * Creatures that fight at a distance without needing a bow: the dragon's
 * breath, a mage's bolt, a UFO's beam. WorldBox draws every one of these, and
 * a dragon that has to walk up and nibble a knight is not a dragon.
 */
export const RANGED: Partial<Record<EntityType, { reach: number; kind: ShotKind; ignite?: boolean }>> = {
  dragon: { reach: 3.2, kind: 'fire', ignite: true },
  mage: { reach: 3.5, kind: 'magic' },
  necromancer: { reach: 3, kind: 'dark' },
  ufo: { reach: 3.5, kind: 'laser' },
  white_mage: { reach: 3.5, kind: 'magic' },
  angel: { reach: 3, kind: 'magic' },
  demon: { reach: 2.4, kind: 'fire', ignite: true },
  elemental: { reach: 2.6, kind: 'magic' },
};

/**
 * Experience, from kills. WorldBox units level up as they fight and a
 * veteran is visibly harder to kill; a square root keeps the tenth level
 * reserved for the creature that has actually been through a war.
 */
export const levelOf = (entity: Pick<Entity, 'kills'>): number =>
  Math.min(10, 1 + Math.floor(Math.sqrt((entity.kills ?? 0) * 1.5)));

/** What a creature's job and office make it wear. */
export const outfitOf = (entity: Entity): Outfit =>
  entity.status.includes('king') ? 'ruler' : entity.job === 'warrior' ? 'warrior' : null;

/** Reused so the flash does not allocate a colour per creature per frame. */
const WHITE_FLASH = new THREE.Color(0xffffff);

/**
 * EntityAI - Controls the behavior of an entity
 */
export class EntityAI {
  entity: Entity;
  currentState: AIState = 'idle';
  targetTile: Tile | null = null;
  targetEntity: Entity | null = null;
  path: Tile[] = [];
  order: AIOrder | null = null;
  /** Creature this one trails (its herd alpha), and how far behind it stays. */
  anchor: Entity | null = null;
  anchorSlack = 3.5;
  /** A slot relative to the anchor — a soldier's place in its rank. */
  anchorOffset: { x: number; y: number } | null = null;

  /** Where this creature means to stand relative to its anchor. */
  private anchorPoint(anchor: Entity): { x: number; y: number } {
    const o = this.anchorOffset;
    return o ? { x: anchor.position.x + o.x, y: anchor.position.y + o.y } : anchor.position;
  }
  ticksSinceLastAction = 0;
  private index: EntityIndex | null;
  private repathCooldown = 0;
  private attackCooldown = 0;
  /** Which way a confused creature is currently staggering. */
  private confusedHeading = 0;
  private pyroCooldown = 6;
  /**
   * Seconds until this creature next checks the mood of the crowd around it.
   * Staggered by construction so a village does not do all its socialising on
   * the same tick.
   */
  private socialTimer = Math.random() * 4;
  /** Seconds spent trying to move without actually getting anywhere. */
  private stuckTimer = 0;
  private lastStuckPosition = { x: 0, y: 0 };
  /** Throttles the "am I walled in?" check, which is the expensive one. */
  private confinementCooldown = 2;

  constructor(entity: Entity, index?: EntityIndex) {
    this.entity = entity;
    this.index = index ?? null;
  }

  /** Give the unit somewhere to be (used by the settlement system). */
  setOrder(order: AIOrder | null): void {
    this.order = order;
    if (order) {
      this.targetEntity = null;
      this.targetTile = null;
      this.path = [];
      this.currentState = 'idle';
      this.ticksSinceLastAction = 99;
    }
  }

  /**
   * Update the entity's AI
   */
  update(tiles: Tile[][], deltaTime: number): void {
    this.ticksSinceLastAction += deltaTime;
    this.repathCooldown = Math.max(0, this.repathCooldown - deltaTime);
    this.attackCooldown = Math.max(0, this.attackCooldown - deltaTime);

    if (this.entity.health <= 0) {
      this.currentState = 'dying';
      this.handleDyingState();
      return;
    }

    // Carried by a boat: it owns the position until it lands, and nobody
    // gets hungry, drowns or wanders off on the way.
    if (this.entity.status.includes('aboard')) {
      this.entity.activity = 'sailing';
      return;
    }
    // A tower does nothing a creature does; its aura is all of it.
    if (STRUCTURES.has(this.entity.type)) {
      this.entity.activity = 'standing guard';
      return;
    }
    // Held by the divine magnet: the hand owns the position until it lets go.
    if (this.entity.status.includes('lifted')) {
      this.entity.activity = 'carried';
      this.path = [];
      this.targetTile = null;
      return;
    }

    this.updateNeeds(deltaTime);
    // Mood shares the needs pass: it reads the same fields, needs the same
    // delta, and gives the status timers somewhere to tick from.
    updateMood(this.entity, deltaTime);

    // What the ground does to you. Most of the map does nothing at all and the
    // roll is skipped entirely there — see the note in `stepOnGround` about
    // why the guard has to come before the draw and not after it.
    const underfoot = this.tileUnderfoot(tiles);
    if (underfoot) {
      stepOnGround(this.entity, underfoot.type, deltaTime);
      if (this.entity.health <= 0) {
        this.currentState = 'dying';
        this.handleDyingState();
        return;
      }
    }

    // Worn by the player: the keys walk it and its own mind steps aside.
    if (possession.id === this.entity.id) {
      this.possessedStep(tiles, deltaTime);
      return;
    }

    // Whatever the player has laid on it. The list is almost always empty, so
    // the whole pass is one length check for nearly every creature.
    if (this.entity.status.length > 0 && this.underSpell(deltaTime)) return;

    // Moods and bonds are checked wherever the creature happens to be, not
    // only while it stands at a bonfire. Gating them on the socialising state
    // sounded tidy and meant that anybody without a village could never make
    // a friend — and since pairing now gates reproduction, a world of
    // wanderers would quietly never grow.
    // Gated on isPerson() out here rather than inside the two methods, so an
    // animal does not even draw the next timer interval from the random
    // stream. Animals have herds, not friendships; letting a sheep spend
    // randomness on a social pass it can never reach makes herd behaviour
    // move whenever the social code does.
    if (this.isPerson()) {
      this.socialTimer -= deltaTime;
      if (this.socialTimer <= 0) {
        this.socialTimer = 2.5 + Math.random() * 3;
        this.spreadMood();
        this.exchangeIdentity();
        this.maybeBond();
      }
    }
    this.ensureStandable(tiles);
    this.trackStuck(tiles, deltaTime);
    this.maybeStartFire(tiles, deltaTime);

    // Publish what we are doing so the HUD can show it without reaching in
    const activity = this.describeActivity();
    if (activity !== this.entity.activity) {
      this.entity.activity = activity;
      this.maybeSpeak(activity);
    }

    switch (this.currentState) {
      case 'idle': this.handleIdleState(tiles); break;
      case 'moving': this.handleMovingState(tiles, deltaTime); break;
      case 'following': this.handleFollowingState(tiles, deltaTime); break;
      case 'socialising': this.handleSocialisingState(tiles, deltaTime); break;
      case 'gathering': this.handleGatheringState(); break;
      case 'hunting': this.handleHuntingState(tiles, deltaTime); break;
      case 'fleeing': this.handleFleeingState(tiles, deltaTime); break;
      case 'fighting': this.handleFightingState(deltaTime); break;
      case 'building': this.handleBuildingState(); break;
      case 'sleeping': this.handleSleepingState(deltaTime); break;
      case 'dying': this.handleDyingState(); break;
    }
  }

  /**
   * Say something, sometimes.
   *
   * Hooked to the moment the published activity changes rather than to each of
   * the thirty-odd places `currentState` is assigned — one hook, and it cannot
   * drift out of sync with what the HUD says the creature is doing.
   *
   * Two gates sit in front of it. This one is a coin flip, which spreads the
   * global speech budget across the whole population instead of letting
   * whichever creatures happen to update first spend all of it; the budget
   * itself lives in floatBridge. Both are needed: without the coin flip, the
   * same dozen units by iteration order do all the talking.
   */
  private maybeSpeak(activity: string): void {
    // Animals do not have dialogue. A wolf with a speech bubble is a cartoon,
    // and not the kind we are making.
    //
    // This check comes *before* the coin flip on purpose. With the flip first,
    // every sheep that changed activity drew from the random stream on behalf
    // of a feature that could never apply to it — which coupled herd behaviour
    // to the dialogue system and made grazing survival move whenever the
    // speech code did. Guards go cheapest and most selective first.
    if (!this.isPerson()) return;
    if (Math.random() > 0.12) return;

    const needs = this.entity.needs;
    let occasion: Occasion | null = null;

    switch (activity) {
      case 'fighting': occasion = 'fighting'; break;
      case 'fleeing': occasion = 'afraid'; break;
      case 'talking': occasion = 'bonfire'; break;
      case 'gathering': occasion = 'working'; break;
      case 'hauling': occasion = 'hauling'; break;
      case 'building': occasion = 'working'; break;
      default: {
        if (this.entity.health < this.entity.maxHealth * 0.4) occasion = 'wounded';
        else if (needs.hunger < 0.3) occasion = 'hungry';
        else if (needs.thirst < 0.3) occasion = 'thirsty';
        else if (needs.rest < 0.25) occasion = 'exhausted';
        else if (needs.social < 0.25) occasion = 'lonely';
        else if (needs.hunger > 0.8 && needs.thirst > 0.8) occasion = 'content';
        break;
      }
    }
    if (!occasion) return;

    emitFloater({
      kind: 'speech',
      text: speak(occasion, Math.random()),
      x: this.entity.position.x,
      y: this.entity.position.y,
      entityId: this.entity.id,
    });
  }

  /**
   * A short label for what this creature is up to. Deliberately more specific
   * than the raw state: "hauling" and "foraging" are both the moving state, but
   * they mean different things to a player watching the map.
   */
  private describeActivity(): string {
    if (this.entity.health <= 0) return 'dying';
    if (this.entity.status.includes('talking')) return 'talking';
    if (this.entity.status.includes('sleeping')) return 'sleeping';
    if (this.entity.status.includes('drinking')) return 'drinking';
    if (this.entity.status.includes('eating')) return 'eating';

    switch (this.currentState) {
      case 'fighting': return 'fighting';
      case 'hunting': return 'hunting';
      case 'fleeing': return 'fleeing';
      case 'gathering': return 'gathering';
      case 'sleeping': return 'sleeping';
      case 'socialising': return 'talking';
      case 'following': return 'travelling';
      case 'building': return 'building';
      case 'moving':
        if (this.entity.carrying) return 'hauling';
        if (this.order?.purpose === 'settle') return 'settling';
        if (this.order?.purpose === 'raid') return 'marching';
        return 'travelling';
      default:
        return 'idle';
    }
  }

  // -- staying unstuck ---------------------------------------------------
  //
  // An emergent world strands its inhabitants: terrain gets lowered under
  // their feet, a meteor leaves them in a crater, a river cuts them off on a
  // one-tile island. WorldBox keeps explicit escape hatches for exactly this
  // (move_from_block, check_if_stuck_on_small_land, teleport_back_home) and so
  // do we. Detection and recovery beat trying to make it impossible.

  /** If the ground under this creature stopped being viable, move it off. */
  private ensureStandable(tiles: Tile[][]): void {
    if (isAirborne(this.entity.type)) return;
    const tile = this.tileAt(tiles, Math.floor(this.entity.position.x), Math.floor(this.entity.position.y));
    if (tile && isWalkableForEntity(tile, this.entity.type)) return;

    // Swimmers get a moment to make their own way out of the water
    if (tile && canSwim(this.entity.type) && isWaterBiome(tile.type) && this.stuckTimer < 4) {
      this.addStatus('swimming');
      return;
    }
    this.removeStatus('swimming');
    this.teleportToSafety(tiles);
  }

  /** Notice a creature that means to move but is not moving. */
  private trackStuck(tiles: Tile[][], deltaTime: number): void {
    const trying = this.currentState === 'moving'
      || this.currentState === 'following'
      || this.currentState === 'hunting'
      || this.currentState === 'fleeing'
      || this.currentState === 'fighting';

    if (!trying) {
      this.stuckTimer = 0;
      this.lastStuckPosition = { ...this.entity.position };
      this.checkConfinement(tiles, deltaTime);
      return;
    }

    const moved = Math.hypot(
      this.entity.position.x - this.lastStuckPosition.x,
      this.entity.position.y - this.lastStuckPosition.y,
    );
    if (moved > 0.35) {
      this.stuckTimer = 0;
      this.lastStuckPosition = { ...this.entity.position };
      return;
    }

    this.stuckTimer += deltaTime;

    // First try: forget the errand and step somewhere it can actually stand.
    if (this.stuckTimer > 4 && this.stuckTimer - deltaTime <= 4) {
      this.nudgeOut(tiles);
      return;
    }
    // Last resort: put it back on solid ground, near home if it has one.
    if (this.stuckTimer > 14) {
      this.teleportToSafety(tiles);
    }
  }

  /**
   * A creature can be standing on perfectly good ground and still be trapped —
   * a one-tile island, a crater ringed with water, a pocket walled in by
   * mountains. It never enters a moving state, so the movement watchdog above
   * never fires. Measure the area it can actually reach instead.
   */
  private checkConfinement(tiles: Tile[][], deltaTime: number): void {
    if (isAirborne(this.entity.type)) return;
    this.confinementCooldown -= deltaTime;
    if (this.confinementCooldown > 0) return;
    this.confinementCooldown = 3;

    if (this.reachableArea(tiles, 4) > 4) return;
    // Nowhere to go: lift it out rather than let it starve where it stands.
    this.teleportToSafety(tiles);
  }

  /** Flood fill from the current tile, giving up once `limit` is exceeded. */
  private reachableArea(tiles: Tile[][], limit: number): number {
    const start = this.tileAt(tiles, Math.floor(this.entity.position.x), Math.floor(this.entity.position.y));
    if (!start) return 0;

    const seen = new Set<Tile>([start]);
    const queue: Tile[] = [start];
    while (queue.length > 0 && seen.size <= limit) {
      const tile = queue.shift()!;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const neighbour = this.tileAt(tiles, tile.x + dx, tile.y + dy);
          if (!neighbour || seen.has(neighbour)) continue;
          if (!isWalkableForEntity(neighbour, this.entity.type)) continue;
          seen.add(neighbour);
          queue.push(neighbour);
          if (seen.size > limit) return seen.size;
        }
      }
    }
    return seen.size;
  }

  /** Abandon whatever it was doing and walk to the nearest viable tile. */
  private nudgeOut(tiles: Tile[][]): void {
    this.targetEntity = null;
    this.order = null;
    this.path = [];
    const escape = findNearestStandable(
      tiles,
      Math.floor(this.entity.position.x),
      Math.floor(this.entity.position.y),
      this.entity.type,
      6,
    );
    if (escape) {
      this.targetTile = escape;
      this.currentState = 'moving';
    } else {
      this.targetTile = null;
      this.currentState = 'idle';
    }
    this.ticksSinceLastAction = 0;
  }

  /** Place the creature back on solid ground; prefer its home village. */
  private teleportToSafety(tiles: Tile[][]): void {
    const home = simulation.homePositionFor?.(this.entity) ?? null;
    const anchor = home ?? {
      x: Math.floor(this.entity.position.x),
      y: Math.floor(this.entity.position.y),
    };

    const refuge = findNearestStandable(tiles, anchor.x, anchor.y, this.entity.type, 16)
      ?? findNearestStandable(
        tiles,
        Math.floor(this.entity.position.x),
        Math.floor(this.entity.position.y),
        this.entity.type,
        24,
      );

    this.stuckTimer = 0;
    this.confinementCooldown = 6;
    this.path = [];
    this.targetTile = null;
    this.targetEntity = null;
    this.order = null;
    this.removeStatus('swimming');
    this.currentState = 'idle';
    this.ticksSinceLastAction = 0;

    if (!refuge) return;
    this.entity.position = { x: refuge.x + 0.5, y: refuge.y + 0.5 };
    this.lastStuckPosition = { ...this.entity.position };
    this.entity.lastPosition = undefined;
  }

  // -- needs -------------------------------------------------------------

  private updateNeeds(deltaTime: number): void {
    if (!simulation.laws.hunger) {
      this.entity.needs.hunger = Math.max(this.entity.needs.hunger, 0.6);
      this.entity.needs.thirst = Math.max(this.entity.needs.thirst, 0.6);
      return;
    }

    const rate = 0.0075 * deltaTime * simulation.needsMultiplier
      * (this.entity.traits?.includes('glutton') ? 1.5 : 1);
    const needs = this.entity.needs;
    needs.hunger = Math.max(0, needs.hunger - rate);
    needs.thirst = Math.max(0, needs.thirst - rate * 1.5);
    needs.rest = Math.max(0, needs.rest - rate * 0.7);
    needs.social = Math.max(0, needs.social - rate * 0.3);

    if (needs.hunger <= 0.15 || needs.thirst <= 0.15) {
      this.entity.health -= 0.8 * deltaTime;
    }

    if (needs.rest <= 0.2) this.addStatus('exhausted');
    else this.removeStatus('exhausted');
  }

  /** Pyromaniacs leave a trail of small fires behind them. */
  private maybeStartFire(tiles: Tile[][], deltaTime: number): void {
    if (!this.entity.traits?.includes('pyromaniac')) return;
    this.pyroCooldown -= deltaTime;
    if (this.pyroCooldown > 0) return;
    this.pyroCooldown = 12 + Math.random() * 20;
    const x = Math.floor(this.entity.position.x);
    const y = Math.floor(this.entity.position.y);
    if (x < 0 || x >= tiles.length || y < 0 || y >= tiles[0].length) return;
    simulation.igniteTile?.(x, y);
  }

  // -- states ------------------------------------------------------------

  private handleIdleState(tiles: Tile[][]): void {
    if (this.ticksSinceLastAction < 1.2) return;
    this.removeStatus('moving');

    // Village orders outrank personal errands unless the unit is desperate.
    const desperate = this.entity.needs.thirst <= 0.2 || this.entity.needs.hunger <= 0.2;
    if (this.order && !desperate && wants(this.entity, 'work')) {
      const target = this.tileAt(tiles, this.order.x, this.order.y);
      if (target) {
        this.targetTile = target;
        this.path = [];
        this.currentState = 'moving';
        this.ticksSinceLastAction = 0;
        return;
      }
      this.order = null;
    }

    // Graze where you stand. Animals travelling with a herd used to walk over
    // pasture without touching it and starve on the move; a mouthful from the
    // current tile costs nothing and is what grazers actually do.
    if (this.entity.needs.hunger < 0.7) {
      const here = this.tileAt(tiles, Math.floor(this.entity.position.x), Math.floor(this.entity.position.y));
      const graze = here?.resources.find(resource => resource.type === 'food' && resource.quantity > 0);
      if (graze) {
        graze.quantity -= 1;
        this.entity.needs.hunger = Math.min(1, this.entity.needs.hunger + 0.35);
        this.addTimedStatus('eating');
        if (graze.quantity <= 0) {
          const index = here!.resources.indexOf(graze);
          if (index !== -1) here!.resources.splice(index, 1);
        }
        this.ticksSinceLastAction = 0;
        return;
      }
    }

    // A straggler this far behind rejoins before doing anything else, or the
    // herd smears across the map and stops reading as a group.
    if (
      this.anchor
      && this.anchor.health > 0
      && this.anchor.id !== this.entity.id
      && this.entity.needs.hunger > 0.35
      && this.entity.needs.thirst > 0.3
    ) {
      const slot = this.anchorPoint(this.anchor);
      const gap = Math.hypot(slot.x - this.entity.position.x, slot.y - this.entity.position.y);
      if (gap > this.anchorSlack * 3) {
        this.currentState = 'following';
        this.ticksSinceLastAction = 0;
        return;
      }
    }

    // Thirst. Land animals drink from the bank; only swimmers wade in, which
    // is what stops the whole population ending up in the water.
    if (this.entity.needs.thirst <= 0.35) {
      // A town with a well drinks at home. It is most of why a well is worth
      // building: nobody walks to the river and back between errands.
      const well = this.entity.villageId ? simulation.wellFor?.(this.entity) : null;
      const wellTile = well ? this.tileAt(tiles, well.x, well.y) : null;
      if (wellTile && Math.hypot(well!.x - this.entity.position.x, well!.y - this.entity.position.y) < 14) {
        this.targetTile = wellTile;
        this.path = [];
        this.currentState = 'moving';
        this.ticksSinceLastAction = 0;
        return;
      }
      const water = this.findNearbyTile(tiles, 14, (tile) => (
        isDrinkableBiome(tile.type)
          ? canSwim(this.entity.type) || isAirborne(this.entity.type)
          : isShoreTile(tile, tiles)
      ));
      if (water) {
        this.targetTile = water;
        this.path = [];
        this.currentState = 'moving';
        this.ticksSinceLastAction = 0;
        return;
      }
    }

    // Hunger: hunt if a predator, otherwise forage
    const bloodthirsty = this.entity.traits?.includes('bloodthirsty') ?? false;
    if (this.entity.needs.hunger <= (bloodthirsty ? 0.75 : 0.4)) {
      if (this.isPredator() && wants(this.entity, 'hunt')) {
        const prey = this.findNearbyPrey();
        if (prey) {
          this.targetEntity = prey;
          this.currentState = 'hunting';
          this.ticksSinceLastAction = 0;
          return;
        }
      }
      const foodTile = this.findNearbyTile(tiles, 10, (tile) =>
        tile.resources.some(r => r.type === 'food' && r.quantity > 0));
      if (foodTile) {
        this.targetTile = foodTile;
        this.path = [];
        this.currentState = 'moving';
        this.ticksSinceLastAction = 0;
        return;
      }
    }

    // Village workers fetch building material once they are fed
    if (
      this.entity.job === 'gatherer'
      && wants(this.entity, 'work')
      && this.entity.villageId
      && !this.entity.carrying
      && this.entity.needs.hunger > 0.5
    ) {
      const supplyTile = this.findNearbyTile(tiles, 9, (tile) =>
        tile.resources.some(r => (r.type === 'wood' || r.type === 'stone') && r.quantity > 0));
      if (supplyTile) {
        this.targetTile = supplyTile;
        this.path = [];
        this.currentState = 'moving';
        this.ticksSinceLastAction = 0;
        return;
      }
    }

    // Rest — creatures prefer to sleep at night
    const nightTime = simulation.timeOfDay === 'night';
    if (this.entity.needs.rest <= (nightTime ? 0.6 : 0.2) && wants(this.entity, 'sleep')) {
      this.currentState = 'sleeping';
      this.addStatus('sleeping');
      this.ticksSinceLastAction = 0;
      return;
    }

    // Danger
    if (this.isPrey() && wants(this.entity, 'flee')) {
      const fleeRadius = this.entity.traits?.includes('coward') ? 9 : 6;
      const threat = this.findNearbyThreat(fleeRadius);
      if (threat) {
        this.targetEntity = threat;
        this.currentState = 'fleeing';
        this.ticksSinceLastAction = 0;
        return;
      }
    }

    // Keep up with the herd. This sits below survival needs and above idle
    // wandering, so an animal will still break off to drink but will otherwise
    // travel with its family instead of milling about on the spot.
    if (this.anchor && this.anchor.health > 0 && this.anchor.id !== this.entity.id) {
      const slot = this.anchorPoint(this.anchor);
      const gap = Math.hypot(slot.x - this.entity.position.x, slot.y - this.entity.position.y);
      if (gap > this.anchorSlack) {
        this.currentState = 'following';
        this.ticksSinceLastAction = 0;
        return;
      }
    }

    // Company. Villagers who have eaten and drunk want to be around other
    // people, and the bonfire is where they go — which is what makes a
    // settlement look lived in rather than like empty scenery.
    if (this.entity.needs.social <= 0.45 && this.entity.villageId && wants(this.entity, 'socialise')) {
      const gathering = simulation.gatheringPointFor?.(this.entity);
      if (gathering) {
        const spot = this.tileAt(tiles, gathering.x, gathering.y);
        if (spot) {
          const distance = Math.hypot(
            spot.x + 0.5 - this.entity.position.x,
            spot.y + 0.5 - this.entity.position.y,
          );
          if (distance < 2.5) {
            this.currentState = 'socialising';
            this.ticksSinceLastAction = 0;
            return;
          }
          this.targetTile = spot;
          this.path = [];
          this.currentState = 'moving';
          this.ticksSinceLastAction = 0;
          return;
        }
      }
    }

    // Wander. Villagers stay near home — the old behaviour let them drift off
    // across the map and left their own village looking abandoned.
    if (wants(this.entity, 'wander') && Math.random() < 0.35) {
      const home = this.entity.villageId ? simulation.homePositionFor?.(this.entity) : null;
      const anchorX = home ? home.x : Math.floor(this.entity.position.x);
      const anchorY = home ? home.y : Math.floor(this.entity.position.y);
      const range = home ? 7 : 4;

      const targetX = Math.max(0, Math.min(tiles.length - 1,
        anchorX + Math.floor(Math.random() * (range * 2 + 1)) - range));
      const targetY = Math.max(0, Math.min(tiles[0].length - 1,
        anchorY + Math.floor(Math.random() * (range * 2 + 1)) - range));
      const candidate = tiles[targetX][targetY];
      if (candidate.walkable !== false && isWalkableForEntity(candidate, this.entity.type)) {
        this.targetTile = candidate;
        this.path = [];
        this.currentState = 'moving';
      }
      this.ticksSinceLastAction = 0;
    }
  }

  /**
   * Stand around the bonfire and talk. Restores the social need for everyone
   * taking part, so villagers naturally cluster there between errands.
   */
  private handleSocialisingState(tiles: Tile[][], deltaTime: number): void {
    this.removeStatus('moving');
    this.addStatus('talking');

    this.entity.needs.social = Math.min(1, this.entity.needs.social + 0.18 * deltaTime);

    // Anyone standing here is part of the conversation
    if (this.index) {
      for (const other of this.index.query(this.entity.position.x, this.entity.position.y, 2.5)) {
        if (other.id === this.entity.id) continue;
        if (other.villageId !== this.entity.villageId) continue;
        other.needs.social = Math.min(1, other.needs.social + 0.09 * deltaTime);
      }
    }

    const gathering = simulation.gatheringPointFor?.(this.entity);
    if (!gathering || this.entity.needs.social > 0.9) {
      this.removeStatus('talking');
      this.currentState = 'idle';
      this.ticksSinceLastAction = 0;
      return;
    }

    // Drift a little so a crowd is not a single stacked sprite
    if (Math.random() < 0.02) {
      const spot = this.tileAt(tiles, gathering.x + Math.round(Math.random() * 2 - 1), gathering.y + Math.round(Math.random() * 2 - 1));
      if (spot && isWalkableForEntity(spot, this.entity.type)) {
        this.entity.lastPosition = { ...this.entity.position };
        this.entity.position = { x: spot.x + 0.5, y: spot.y + 0.5 };
      }
    }
  }

  /**
   * Catch a mood off somebody standing nearby.
   *
   * This is the mechanic that makes a crowd behave like a crowd rather than
   * like a set of individuals who happen to be adjacent — WorldBox's laughter
   * and crying spread through a village and that spreading *is* the social
   * simulation (06-WORLDBOX-COMPLETE-REFERENCE.md §6). Only the three
   * contagious statuses travel, and only between villagers who share a home:
   * a stranger walking past does not set the square laughing.
   */
  private spreadMood(): void {
    if (!this.index) return;

    const neighbours = this.index.query(this.entity.position.x, this.entity.position.y, 3);
    let caught: StatusDef | null = null;

    for (const other of neighbours) {
      if (other.id === this.entity.id) continue;
      // Same village, or both unaffiliated. A stranger walking past does not
      // set the square laughing, but two wanderers can still cheer each other
      // up.
      if ((other.villageId ?? null) !== (this.entity.villageId ?? null)) continue;
      for (const value of other.status) {
        const def = STATUSES[value as keyof typeof STATUSES];
        if (def?.contagious && !this.entity.status.includes(def.id)) {
          caught = def;
          break;
        }
      }
      if (caught) break;
    }

    if (caught) {
      // Not certain, so a mood ripples outward over a few seconds instead of
      // snapping through the whole village in one tick.
      if (Math.random() < 0.45) this.addStatus(caught.id);
      return;
    }

    // Nobody to catch anything from, so start something. A cheerful villager
    // laughs or sings; a wretched one cries, and that spreads too.
    const happiness = this.entity.happiness ?? 0;
    if (Math.random() > 0.18) return;
    if (happiness > 35) this.addStatus(Math.random() < 0.5 ? 'laughing' : 'singing');
    else if (happiness < -35) this.addStatus('crying');
  }

  /**
   * Trade identity with somebody nearby.
   *
   * Hooked to the same social pass as mood, because "two units converse" is
   * precisely that moment and scanning the neighbourhood twice for the same
   * event would be waste. The pot itself lives in identity.ts — everything
   * here does is choose who is talking.
   */
  private exchangeIdentity(): void {
    if (!this.index) return;

    // A book on the ground nearby is read before anybody is talked to. This is
    // how a culture outlives its last speaker: the text keeps arguing for it
    // long after the people who wrote it are gone.
    const book = bookAt(Math.floor(this.entity.position.x), Math.floor(this.entity.position.y));
    if (book && Math.random() < 0.5) {
      readBook(this.entity, book);
      return;
    }

    const partners = this.index
      .query(this.entity.position.x, this.entity.position.y, 2.5)
      .filter(other => other.id !== this.entity.id && isSapient(other));
    if (partners.length === 0) return;

    const other = partners[Math.floor(Math.random() * partners.length)];
    converse(this.entity, other);
  }

  /**
   * Find a friend, and maybe more.
   *
   * Pairs form on similar mood, which is WorldBox's rule and a good one: it
   * means friendships are a *product* of the simulation rather than random
   * assignment, and a village that is having a bad year makes fewer of them.
   */
  private maybeBond(): void {
    if (!this.index) return;
    if (this.entity.loverId) return;

    const mine = this.entity.happiness ?? 0;
    const candidates = this.index
      .query(this.entity.position.x, this.entity.position.y, 2.5)
      .filter(other => other.id !== this.entity.id
        && other.type === this.entity.type
        && (other.villageId ?? null) === (this.entity.villageId ?? null)
        && Math.abs((other.happiness ?? 0) - mine) < 25);

    if (candidates.length === 0) return;
    const other = candidates[Math.floor(Math.random() * candidates.length)];

    if (!this.entity.friendId) {
      this.entity.friendId = other.id;
      other.friendId ??= this.entity.id;
      applyScenario(this.entity, 'madeFriend');
      return;
    }

    // Lovers are rarer, and only ever between two adults who already get on.
    if (
      this.entity.friendId === other.id
      && !other.loverId
      && this.entity.age > this.entity.maxAge * 0.18
      && other.age > other.maxAge * 0.18
      && Math.random() < 0.2
    ) {
      this.entity.loverId = other.id;
      other.loverId = this.entity.id;
      applyScenario(this.entity, 'fellInLove');
      applyScenario(other, 'fellInLove');
    }
  }

  private tilesPerSecond(tiles?: Tile[][]): number {
    let speed = this.entity.attributes.speed * 0.12;
    if (this.entity.status.includes('exhausted')) speed *= 0.5;
    if (this.entity.status.includes('caffeinated')) speed *= 1.9;
    else if (this.entity.status.includes('inspired')) speed *= 1.3;
    if (this.entity.equipment) speed *= gearSpeed(this.entity.equipment);
    // A captain deliberately marches slower so its warband stays with it
    if (this.entity.status.includes('captain')) speed *= 0.72;
    // ...and the ground itself, which is most of what makes a swamp a swamp
    // rather than a green patch.
    if (tiles) {
      const here = this.tileUnderfoot(tiles);
      if (here) speed *= groundSpeed(here.type);
    }
    return speed;
  }

  /** The tile the creature is standing on, or null if it has wandered off. */
  private tileUnderfoot(tiles: Tile[][]): Tile | null {
    const x = Math.floor(this.entity.position.x);
    const y = Math.floor(this.entity.position.y);
    if (x < 0 || y < 0 || x >= tiles.length || y >= (tiles[0]?.length ?? 0)) return null;
    return tiles[x][y];
  }

  private handleMovingState(tiles: Tile[][], deltaTime: number): void {
    if (!this.targetTile) {
      this.currentState = 'idle';
      return;
    }
    this.addStatus('moving');

    if (this.path.length === 0) {
      const startX = Math.max(0, Math.min(tiles.length - 1, Math.floor(this.entity.position.x)));
      const startY = Math.max(0, Math.min(tiles[0].length - 1, Math.floor(this.entity.position.y)));
      const startTile = tiles[startX][startY];

      if (startTile === this.targetTile) {
        this.arriveAtTarget(startTile, tiles);
        return;
      }

      if (this.repathCooldown === 0) {
        this.repathCooldown = 0.5;
        this.path = findPath(startTile, this.targetTile, tiles, this.entity.type);
      }

      if (this.path.length === 0) {
        // No route exists. Walking the straight line anyway is what used to
        // march creatures into the sea and strand them, so give up on the
        // errand instead and let the idle state pick something reachable.
        const adjacent = Math.abs(startTile.x - this.targetTile.x) <= 1
          && Math.abs(startTile.y - this.targetTile.y) <= 1;
        if (adjacent && isWalkableForEntity(this.targetTile, this.entity.type)) {
          this.path = [this.targetTile];
        } else {
          this.targetTile = null;
          this.currentState = 'idle';
          this.ticksSinceLastAction = 0;
          this.removeStatus('moving');
          return;
        }
      }
    }

    const waypoint = this.path[0];

    // The world changes underneath a path: a tile can be flooded or raised
    // after the route was planned. Re-plan rather than walking into it.
    if (!isWalkableForEntity(waypoint, this.entity.type)) {
      this.path = [];
      this.repathCooldown = 0;
      return;
    }

    const { x, y } = this.entity.position;
    const dx = waypoint.x + 0.5 - x;
    const dy = waypoint.y + 0.5 - y;
    const length = Math.hypot(dx, dy);

    this.entity.lastPosition = { x, y };

    if (length < 0.12) {
      this.path.shift();
      if (this.path.length > 0) return;
      this.arriveAtTarget(waypoint, tiles);
      return;
    }

    const step = Math.min(this.tilesPerSecond(tiles) * deltaTime, length);
    this.entity.position = {
      x: x + (dx / length) * step,
      y: y + (dy / length) * step,
    };
  }

  /**
   * Trail the herd alpha. Deliberately direct steps rather than A*: the target
   * moves every frame, so a route would be stale before it was walked, and a
   * herd of nine re-planning constantly is pure cost for no benefit.
   */
  private handleFollowingState(tiles: Tile[][], deltaTime: number): void {
    const anchor = this.anchor;
    if (!anchor || anchor.health <= 0) {
      this.anchor = null;
      this.currentState = 'idle';
      return;
    }

    const slot = this.anchorPoint(anchor);
    const dx = slot.x - this.entity.position.x;
    const dy = slot.y - this.entity.position.y;
    const gap = Math.hypot(dx, dy);

    if (gap <= this.anchorSlack * 0.7) {
      this.removeStatus('moving');
      this.currentState = 'idle';
      this.ticksSinceLastAction = 0;
      return;
    }

    this.addStatus('moving');
    this.entity.lastPosition = { ...this.entity.position };
    const step = this.tilesPerSecond(tiles) * deltaTime;
    const nextX = this.entity.position.x + (dx / gap) * step;
    const nextY = this.entity.position.y + (dy / gap) * step;

    if (this.canStand(tiles, nextX, nextY)) {
      this.entity.position = { x: nextX, y: nextY };
      return;
    }

    // Something is in the way — walk to the alpha's tile properly instead
    const target = this.tileAt(tiles, Math.floor(anchor.position.x), Math.floor(anchor.position.y));
    if (target && isWalkableForEntity(target, this.entity.type)) {
      this.targetTile = target;
      this.path = [];
      this.currentState = 'moving';
    } else {
      this.currentState = 'idle';
    }
  }

  /** Resolve whatever the unit walked here to do. */
  private arriveAtTarget(tile: Tile, tiles: Tile[][]): void {
    // Only settle onto the tile if it is somewhere this creature can be
    if (isWalkableForEntity(tile, this.entity.type)) {
      this.entity.position = { x: tile.x + 0.5, y: tile.y + 0.5 };
    }
    this.removeStatus('moving');

    // Fulfil a village order
    if (this.order && this.order.x === tile.x && this.order.y === tile.y) {
      const order = this.order;
      this.order = null;
      this.targetTile = null;
      this.currentState = 'idle';
      this.ticksSinceLastAction = 0;
      simulation.onOrderComplete?.(this.entity, order);
      return;
    }

    if (isDrinkableBiome(tile.type) || isShoreTile(tile, tiles) || simulation.isWell?.(tile.x, tile.y)) {
      this.entity.needs.thirst = 1.0;
      this.addTimedStatus('drinking');
    } else if (this.hasHarvestableResource(tile)) {
      this.currentState = 'gathering';
      this.ticksSinceLastAction = 0;
      return;
    }

    this.targetTile = null;
    this.currentState = 'idle';
    this.ticksSinceLastAction = 0;
  }

  /** Anything this unit would stop to pick up. */
  private hasHarvestableResource(tile: Tile): boolean {
    if (tile.resources.some(r => r.type === 'food' && r.quantity > 0)) return true;
    if (this.entity.job !== 'gatherer' || !this.entity.villageId) return false;
    return tile.resources.some(r => (r.type === 'wood' || r.type === 'stone') && r.quantity > 0);
  }

  private handleGatheringState(): void {
    if (!this.targetTile) {
      this.currentState = 'idle';
      return;
    }
    if (this.ticksSinceLastAction < 0.8) return;

    const tile = this.targetTile;
    const food = tile.resources.find(r => r.type === 'food' && r.quantity > 0);
    if (food) {
      food.quantity -= 1;
      this.entity.needs.hunger = Math.min(1.0, this.entity.needs.hunger + 0.55);
      this.addTimedStatus('eating');

      // Village gatherers haul a share home instead of eating it all
      if (this.entity.job === 'gatherer' && this.entity.villageId && !this.entity.carrying) {
        this.entity.carrying = { type: 'food', quantity: 2 };
      }

      if (food.quantity <= 0) {
        const index = tile.resources.indexOf(food);
        if (index !== -1) tile.resources.splice(index, 1);
      }
    }

    // Village workers also fell timber and quarry stone
    if (this.entity.job === 'gatherer' && this.entity.villageId && !this.entity.carrying) {
      const haul = tile.resources.find(r => (r.type === 'wood' || r.type === 'stone') && r.quantity > 0);
      if (haul) {
        haul.quantity -= 1;
        this.entity.carrying = { type: haul.type, quantity: 2 };
        if (haul.quantity <= 0) {
          const index = tile.resources.indexOf(haul);
          if (index !== -1) tile.resources.splice(index, 1);
        }
      }
    }

    this.currentState = 'idle';
    this.ticksSinceLastAction = 0;
  }

  private handleHuntingState(tiles: Tile[][], deltaTime: number): void {
    const target = this.targetEntity;
    if (!target || target.health <= 0) {
      this.targetEntity = null;
      this.currentState = 'idle';
      return;
    }

    const dx = target.position.x - this.entity.position.x;
    const dy = target.position.y - this.entity.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 14) {
      this.targetEntity = null;
      this.currentState = 'idle';
      return;
    }

    const ranged = RANGED[this.entity.type];
    if (distance < 0.6 || (ranged && distance < ranged.reach)) {
      if (distance >= 0.6 && this.attackCooldown <= 0) this.shoot(target);
      this.strike(target);
      if (target.health <= 0) {
        this.entity.needs.hunger = 1.0;
        this.addTimedStatus('eating');
        this.entity.kills = (this.entity.kills ?? 0) + 1;
        this.targetEntity = null;
        this.currentState = 'idle';
      }
      return;
    }

    this.addStatus('moving');
    this.entity.lastPosition = { ...this.entity.position };
    const step = this.tilesPerSecond(tiles) * deltaTime;
    const nextX = this.entity.position.x + (dx / distance) * step;
    const nextY = this.entity.position.y + (dy / distance) * step;
    if (this.canStand(tiles, nextX, nextY)) {
      this.entity.position = { x: nextX, y: nextY };
    } else {
      this.targetEntity = null;
      this.currentState = 'idle';
    }
  }

  private handleFightingState(deltaTime: number): void {
    const target = this.targetEntity;
    if (!target || target.health <= 0) {
      this.targetEntity = null;
      this.currentState = 'idle';
      this.removeStatus('fighting');
      return;
    }

    // Badly wounded units break off and run
    if (this.entity.health < this.entity.maxHealth * 0.25) {
      this.currentState = 'fleeing';
      return;
    }

    const dx = target.position.x - this.entity.position.x;
    const dy = target.position.y - this.entity.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance < this.reach()) {
      this.addStatus('fighting');
      if (distance > 1 && this.attackCooldown <= 0) this.shoot(target);
      this.strike(target);
      if (target.health <= 0) {
        this.entity.kills = (this.entity.kills ?? 0) + 1;
        this.targetEntity = null;
        this.currentState = 'idle';
        this.removeStatus('fighting');
      }
      return;
    }

    if (distance > 12) {
      this.targetEntity = null;
      this.currentState = 'idle';
      return;
    }

    this.addStatus('moving');
    this.entity.lastPosition = { ...this.entity.position };
    const step = this.tilesPerSecond() * deltaTime;
    this.entity.position = {
      x: this.entity.position.x + (dx / distance) * step,
      y: this.entity.position.y + (dy / distance) * step,
    };
  }

  /**
   * One frame of being worn by the player.
   *
   * A little quicker than the creature walks on its own, because a possessed
   * unit that dawdles feels like steering a boat. Refuses ground the creature
   * could not stand on, so you cannot march a wolf into the sea.
   */
  private possessedStep(tiles: Tile[][], deltaTime: number): void {
    this.path = [];
    this.targetTile = null;
    const { dx, dy } = heldDirection();
    if (dx !== 0 || dy !== 0) {
      const step = this.tilesPerSecond(tiles) * 1.35 * deltaTime;
      const nx = this.entity.position.x + dx * step;
      const ny = this.entity.position.y + dy * step;
      const tile = tiles[Math.floor(nx)]?.[Math.floor(ny)];
      if (tile && isWalkableForEntity(tile, this.entity.type)) {
        this.entity.lastPosition = { ...this.entity.position };
        this.entity.position = { x: nx, y: ny };
      }
      this.addStatus('moving');
      this.entity.activity = 'travelling';
    } else {
      this.removeStatus('moving');
      this.entity.activity = 'idle';
    }
    if (possession.attackQueued) {
      possession.attackQueued = false;
      // Whoever is closest and in reach. No target is a swing at the air.
      let nearest: Entity | null = null;
      let best = 1.6 * 1.6;
      for (const other of this.index?.query(this.entity.position.x, this.entity.position.y, 1.6) ?? []) {
        if (other.id === this.entity.id || other.health <= 0) continue;
        const d = (other.position.x - this.entity.position.x) ** 2 + (other.position.y - this.entity.position.y) ** 2;
        if (d < best) { best = d; nearest = other; }
      }
      if (nearest) {
        this.attackCooldown = 0;
        this.strike(nearest);
        if (nearest.health <= 0) this.entity.kills = (this.entity.kills ?? 0) + 1;
      }
    }
  }

  /**
   * The powers that change what a creature does rather than what it feels.
   *
   * Returns true when the spell has taken the whole turn — a spellbound
   * creature stands where it is and nothing else in its AI runs.
   */
  private underSpell(deltaTime: number): boolean {
    const status = this.entity.status;
    if (status.includes('infected')) {
      // Slow on purpose: the point of a plague is the stretch where you can
      // see it coming and the village cannot.
      this.entity.health -= 1.6 * deltaTime;
      // ...and it travels, but only by contact and only between people. A
      // plague that jumped species would empty the map in a minute.
      if (this.index && Math.random() < 0.4 * deltaTime) {
        for (const other of this.index.query(this.entity.position.x, this.entity.position.y, 1.2)) {
          if (other.id === this.entity.id || !isSapient(other)) continue;
          if (other.status.includes('infected') || other.status.includes('shielded')) continue;
          applyStatus(other, 'infected');
          break;
        }
      }
    }
    if (status.includes('spellbound')) {
      this.entity.activity = 'sleeping';
      return true;
    }
    if (status.includes('confused')) {
      // A stagger, not a teleport: a small step in a direction that changes
      // often enough to look lost rather than purposeful.
      if (Math.random() < 4 * deltaTime) this.confusedHeading = Math.random() * Math.PI * 2;
      const step = this.tilesPerSecond() * 0.6 * deltaTime;
      this.entity.lastPosition = { ...this.entity.position };
      this.entity.position = {
        x: this.entity.position.x + Math.cos(this.confusedHeading) * step,
        y: this.entity.position.y + Math.sin(this.confusedHeading) * step,
      };
      this.entity.activity = 'wandering';
      return true;
    }
    if (status.includes('enraged') && this.currentState !== 'fighting' && this.index) {
      // Anyone will do. That is what makes it madness rather than war.
      let nearest: Entity | null = null;
      let best = 36;
      for (const other of this.index.query(this.entity.position.x, this.entity.position.y, 6)) {
        if (other.id === this.entity.id || other.health <= 0) continue;
        const d = (other.position.x - this.entity.position.x) ** 2
          + (other.position.y - this.entity.position.y) ** 2;
        if (d < best) { best = d; nearest = other; }
      }
      if (nearest) this.engage(nearest);
    }
    return false;
  }

  /** How far this creature's blow reaches: its weapon, or its own breath. */
  private reach(): number {
    return Math.max(weaponReach(this.entity.equipment?.weapon), RANGED[this.entity.type]?.reach ?? 0);
  }

  /** Something visible crosses the gap. Fire sets the ground it lands on alight. */
  private shoot(target: Entity): void {
    const ranged = RANGED[this.entity.type];
    emitShot(this.entity, target, ranged?.kind ?? 'arrow');
    if (ranged?.ignite && Math.random() < 0.35) {
      simulation.igniteTile?.(Math.floor(target.position.x), Math.floor(target.position.y));
    }
  }

  /** Deal one blow, respecting the attack cooldown. */
  private strike(target: Entity): void {
    if (this.attackCooldown > 0) return;
    // Turn to face what it is hitting, so the lunge goes the right way.
    const dx = target.position.x - this.entity.position.x;
    if (Math.abs(dx) > 0.05) this.entity.facing = dx > 0 ? 1 : -1;
    const weapon = this.entity.equipment?.weapon;
    this.attackCooldown = weaponCooldown(weapon);
    if (target.status.includes('shielded')) {
      // The blow lands on nothing. Still costs the attacker its swing.
      this.addTimedStatus('attacking');
      return;
    }
    const targetTraits = target.traits ?? [];
    // Checked before the roll, so a creature without the trait spends none
    // of the shared random stream on it.
    if (targetTraits.includes('nimble') && Math.random() < 0.25) {
      this.addTimedStatus('attacking');
      return;
    }
    if (targetTraits.includes('battle_reflexes') && Math.random() < 1 / 7) {
      this.addTimedStatus('attacking');
      return;
    }
    const fury = this.entity.status.includes('inspired') || this.entity.status.includes('enraged') ? 1.4 : 1;
    const venom = this.entity.traits?.includes('venomous') ? 1.35 : 1;
    const hide = targetTraits.includes('armored') ? 0.67 : 1;
    // The arm and the blade, then whatever the other side is wearing.
    const flame = weapon?.modifier === 'flaming' ? 3 : 0;
    const veteran = 1 + (levelOf(this.entity) - 1) * 0.06;
    const gifted = traitDamageFactor(this.entity, simulation.timeOfDay === 'night');
    const crit = this.entity.traits?.includes('precise') && Math.random() < 0.125 ? 2 : 1;
    const raw = (this.entity.attributes.strength * 0.6 * venom + weaponDamage(weapon) + flame) * fury * hide * veteran * gifted * crit;
    const blow = raw * (1 - armorBlock(target.equipment?.armor));
    target.health -= blow;
    if (targetTraits.includes('thorns')) {
      this.entity.health -= blow * 0.25;
      if (this.entity.health <= 0 && !this.entity.status.includes('slain')) this.entity.status.push('slain');
    }
    emitDamage(target.position.x, target.position.y, blow, target.id);
    if (weapon?.modifier === 'vampiric') {
      this.entity.health = Math.min(this.entity.maxHealth, this.entity.health + blow * 0.3);
    }
    this.addTimedStatus('attacking');
    if (!target.status.includes('wounded')) target.status.push('wounded');
    const killed = target.health <= 0;
    if (killed && !target.status.includes('slain')) target.status.push('slain');
    if (weapon || target.equipment?.armor) wearAfterBlow(this.entity, target, killed);
    if (killed && target.equipment && claimSpoils(this.entity, target, wieldsGear(this.entity.type)).length > 0) {
      emitFloater({ kind: 'speech', text: speak('looted', Math.random()), x: this.entity.position.x, y: this.entity.position.y, entityId: this.entity.id });
    }
  }

  private handleFleeingState(tiles: Tile[][], deltaTime: number): void {
    const threat = this.targetEntity;
    if (!threat) {
      this.removeStatus('fleeing');
      this.currentState = 'idle';
      return;
    }

    const dx = threat.position.x - this.entity.position.x;
    const dy = threat.position.y - this.entity.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 8 || threat.health <= 0) {
      this.targetEntity = null;
      this.removeStatus('fleeing');
      this.currentState = 'idle';
      return;
    }

    this.addStatus('fleeing');
    this.addStatus('moving');
    this.entity.lastPosition = { ...this.entity.position };

    const step = this.tilesPerSecond(tiles) * 1.25 * deltaTime;
    const dirX = -dx / (distance || 1);
    const dirY = -dy / (distance || 1);

    const candidates: Array<[number, number]> = [[dirX, dirY]];
    for (const angle of [0.6, -0.6, 1.3, -1.3]) {
      candidates.push([
        dirX * Math.cos(angle) - dirY * Math.sin(angle),
        dirX * Math.sin(angle) + dirY * Math.cos(angle),
      ]);
    }

    for (const [cx, cy] of candidates) {
      const nextX = this.entity.position.x + cx * step;
      const nextY = this.entity.position.y + cy * step;
      if (this.canStand(tiles, nextX, nextY)) {
        this.entity.position = { x: nextX, y: nextY };
        return;
      }
    }

    // Cornered: turn and fight rather than shaking against a wall forever
    if (this.entity.health > this.entity.maxHealth * 0.35) {
      this.removeStatus('fleeing');
      this.currentState = 'fighting';
    }
  }

  private handleBuildingState(): void {
    // Construction progress is driven by the settlement system.
    this.currentState = 'idle';
  }

  private handleSleepingState(deltaTime: number): void {
    this.removeStatus('moving');
    this.entity.needs.rest = Math.min(1.0, this.entity.needs.rest + 0.12 * deltaTime);
    if (this.entity.needs.rest > 0.9 || (simulation.timeOfDay !== 'night' && this.entity.needs.rest > 0.5)) {
      this.removeStatus('sleeping');
      this.currentState = 'idle';
      this.ticksSinceLastAction = 0;
    }
  }

  private handleDyingState(): void {
    this.addStatus('dead');
  }

  // -- helpers -----------------------------------------------------------

  private addStatus(status: StatusId): void {
    applyStatus(this.entity, status);
  }

  private removeStatus(status: StatusId): void {
    clearStatus(this.entity, status);
  }

  /**
   * Durations now live in the status table and tick on the game delta.
   *
   * The old version took milliseconds and expired via `setTimeout`, which meant
   * a status lasted the same *real* time at triple speed and kept counting down
   * while the game was paused — the only duration in this codebase that did not
   * run on simulated time. Callers no longer pass a length at all: how long
   * "eating" lasts is a property of eating, not of each place that sets it.
   */
  private addTimedStatus(status: StatusId): void {
    applyStatus(this.entity, status);
  }

  private tileAt(tiles: Tile[][], x: number, y: number): Tile | null {
    if (x < 0 || x >= tiles.length || y < 0 || y >= tiles[0].length) return null;
    return tiles[x][y];
  }

  private canStand(tiles: Tile[][], x: number, y: number): boolean {
    const tile = this.tileAt(tiles, Math.floor(x), Math.floor(y));
    if (!tile) return false;
    return tile.walkable !== false && isWalkableForEntity(tile, this.entity.type);
  }

  /** Closest tile within `radius` satisfying a predicate. */
  private findNearbyTile(tiles: Tile[][], radius: number, predicate: (tile: Tile) => boolean): Tile | null {
    const cx = Math.floor(this.entity.position.x);
    const cy = Math.floor(this.entity.position.y);
    let best: Tile | null = null;
    let bestDistance = Infinity;

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const tile = this.tileAt(tiles, cx + dx, cy + dy);
        if (!tile || !predicate(tile)) continue;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = tile;
        }
      }
    }
    return best;
  }

  private findNearbyPrey(): Entity | null {
    if (!this.index) return null;
    // A peaceful creature leaves the others alone until hunger forces it.
    if (this.entity.traits?.includes('peaceful') && this.entity.needs.hunger > 0.2) return null;
    const preyTypes = FOOD_CHAIN[this.entity.type] ?? [];
    if (preyTypes.length === 0) return null;

    const perception = this.entity.traits?.includes('genius') ? 12 : 8;
    let best: Entity | null = null;
    let bestDistance = Infinity;

    const tame = simulation.laws.peacefulMonsters && MONSTERS.has(this.entity.type);
    for (const candidate of this.index.query(this.entity.position.x, this.entity.position.y, perception)) {
      if (candidate.id === this.entity.id) continue;
      if (!preyTypes.includes(candidate.type)) continue;
      // Peaceful Monsters: the peoples are off the menu.
      if (tame && BORN_SAPIENT.has(candidate.type)) continue;
      // The food chain says what *kind* is prey; size says whether this animal
      // is big enough to try it. A runt fox leaves the chickens alone and a
      // monstrous one takes a deer, out of one comparison.
      if (!canPreyOn(this.entity, candidate)) continue;
      const distance = (candidate.position.x - this.entity.position.x) ** 2
        + (candidate.position.y - this.entity.position.y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best;
  }

  private findNearbyThreat(radius: number): Entity | null {
    if (!this.index) return null;
    const predators = PREDATORS_OF[this.entity.type] ?? [];
    if (predators.length === 0) return null;

    let best: Entity | null = null;
    let bestDistance = Infinity;
    for (const candidate of this.index.query(this.entity.position.x, this.entity.position.y, radius)) {
      if (!predators.includes(candidate.type)) continue;
      const distance = (candidate.position.x - this.entity.position.x) ** 2
        + (candidate.position.y - this.entity.position.y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best;
  }

  private isPredator(): boolean {
    return (FOOD_CHAIN[this.entity.type] ?? []).length > 0;
  }

  private isPrey(): boolean {
    return (PREDATORS_OF[this.entity.type] ?? []).length > 0;
  }

  /** The four sentient races, and anything that has been woken into one. */
  private isPerson(): boolean {
    return isSapient(this.entity);
  }

  /** Send this unit to fight a specific enemy (used by raids). */
  engage(target: Entity): void {
    // A creature whose fight has been switched off will not start one.
    if (!wants(this.entity, 'fight')) return;
    this.targetEntity = target;
    this.targetTile = null;
    this.path = [];
    this.currentState = 'fighting';
  }
}
