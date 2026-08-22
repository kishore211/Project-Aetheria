// The world's history, in a voice.
//
// WorldBox writes every world-history entry two to four different ways and
// picks one (06-WORLDBOX-COMPLETE-REFERENCE.md §8). That single decision is
// why their log stays readable after two hundred entries and ours did not: one
// fixed phrasing per event turns a chronicle into a machine log. Twelve wolves
// dying of old age in a row reads as twelve identical lines, and the eye stops
// going there.
//
// So every topic below has at least two phrasings, and the writing is meant to
// sound like somebody keeping a record rather than a system emitting a string.

export type ChronicleTopic =
  | 'born'
  | 'died_old'
  | 'died_combat'
  | 'died_starved'
  | 'died_burned'
  | 'died_divine'
  | 'died_health'
  | 'died_sudden'
  | 'village_founded'
  | 'kingdom_founded'
  | 'village_settled'
  | 'village_settled_from'
  | 'village_abandoned'
  | 'settlers_leave'
  | 'hall_raised'
  | 'monument_raised'
  | 'secession'
  | 'coup'
  | 'alliance'
  | 'festival'
  | 'plot_abandoned'
  | 'book_written'
  | 'schism'
  | 'converted'
  | 'crowned_king'
  | 'succession_none'
  | 'war_declared'
  | 'peace'
  | 'kingdom_fallen'
  | 'meteor'
  | 'quake'
  | 'lightning'
  | 'blessing'
  | 'curse';

/**
 * Template variables. `{n}` is a count and is only used by phrasings that
 * check for it, so a caller with nothing to report never produces
 * "— 0 perished".
 */
export interface ChronicleVars {
  name?: string;
  type?: string;
  a?: string;
  b?: string;
  n?: number;
}

const TEMPLATES: Record<ChronicleTopic, string[]> = {
  born: [
    '{name} the {type} was born',
    '{name} entered the world, a {type} and already hungry',
    'A {type} was born, and named {name}',
  ],

  died_old: [
    '{name} the {type} died of old age',
    '{name} the {type} reached the end of a long life',
    'Old age took {name} the {type}',
  ],
  died_combat: [
    '{name} the {type} was slain',
    '{name} the {type} fell fighting',
    '{name} the {type} did not walk away from the fight',
  ],
  died_starved: [
    '{name} the {type} starved',
    '{name} the {type} died with an empty stomach',
    'Hunger finished {name} the {type}',
  ],
  died_burned: [
    '{name} the {type} was consumed by fire',
    'Fire took {name} the {type}',
    '{name} the {type} burned',
  ],
  died_divine: [
    '{name} the {type} was struck down by divine power',
    '{name} the {type} displeased something enormous',
    'Something reached down and unmade {name} the {type}',
  ],
  died_health: [
    '{name} the {type} perished',
    '{name} the {type} did not recover',
    '{name} the {type} succumbed',
  ],
  died_sudden: [
    '{name} the {type} died suddenly',
    '{name} the {type} simply stopped',
    'No one is sure what happened to {name} the {type}',
  ],

  village_founded: [
    '{name} was founded',
    '{name} was raised on open ground',
    'Somebody drove a stake in and called it {name}',
  ],
  kingdom_founded: [
    '{a} is founded at {name}, led by {b}',
    '{b} declares {a}, with {name} as its seat',
    '{name} becomes the first town of {a}, under {b}',
  ],
  village_settled: [
    '{name} is settled under {a}',
    '{a} raises a new town at {name}',
    '{name} joins {a}',
  ],
  village_settled_from: [
    '{name} is founded by settlers from {a}',
    'Settlers out of {a} build {name}',
    '{name} rises where the party from {a} stopped walking',
  ],
  village_abandoned: [
    '{name} stands empty and falls to ruin',
    'The last of {name} left, and the roofs came down',
    '{name} is nobody\'s home now',
  ],
  settlers_leave: [
    'Settlers leave {name} to found a new home',
    'A party walks out of {name} looking for room',
    '{name} sends its overflow into the wild',
  ],
  hall_raised: [
    '{name} raises a great hall',
    '{name} finishes its hall, and it is enormous',
    'The hall at {name} is finished',
  ],
  monument_raised: [
    '{name} completes a {type}',
    '{name} finishes its {type}',
    'A {type} now stands at {name}',
  ],

  secession: [
    '{name} declares itself free of {a}, and calls itself {b}',
    '{name} will not answer to {a} any longer — it is {b} now',
    '{a} has lost {name}. The banners over it read {b}',
    '{name} raises its own flag as {b}, and {a} will not forgive it',
  ],
  coup: [
    '{name} takes the throne of {a} out from under {b}',
    '{b} is no longer ruler of {a}. {name} is.',
    'The crown of {a} changes heads. {name} was ready; {b} was not.',
  ],
  alliance: [
    '{a} and {b} swear to stand together',
    '{a} and {b} sign something, and mean most of it',
    'An alliance binds {a} to {b}',
  ],
  festival: [
    '{a} holds a feast, and {name} pays for it',
    '{name} throws {a} a festival it could not really afford',
    'There is a feast in {a}. Nobody asks where the grain came from.',
  ],
  plot_abandoned: [
    '{name} thinks better of the {type}',
    '{name} lets the {type} go',
    'Whatever {name} was planning, the {type} is off',
  ],

  schism: [
    '{name} decides it is its own people, and calls itself {a}',
    'The folk of {name} are {a} now, and say so',
    '{name} breaks with its neighbours. There are {a} in the world from today.',
  ],
  book_written: [
    '{a} sets down {name}',
    '{name} is written at {a}',
    'The scribes of {a} finish {name}',
  ],
  converted: [
    '{name} comes round to the {type} of {a}',
    '{name} has taken up the {type} of {a}',
    'Something in {a} persuaded {name}. It is their {type} now.',
  ],

  crowned_king: [
    '{name} takes the crown of {a}',
    '{name} is raised up to rule {a}',
    'The seal of {a} passes to {name}',
  ],
  succession_none: [
    '{a} has nobody left to crown',
    'No hand is left to hold the seal of {a}',
    '{a} is a kingdom with an empty throne',
  ],

  war_declared: [
    '{a} declares war on {b}',
    '{a} has had enough of {b}',
    '{a} marches on {b}',
    'The peace between {a} and {b} is over',
  ],
  peace: [
    '{a} and {b} agree to peace',
    '{a} and {b} have run out of reasons to fight',
    '{a} and {b} lay down their spears',
  ],
  kingdom_fallen: [
    '{a} has fallen',
    '{a} is no more',
    'Nothing is left of {a} but the name',
  ],

  meteor: [
    'A meteor devastates the region',
    'A rock the size of a hall comes out of the sky',
    'The sky opens and something lands',
  ],
  quake: [
    'An earthquake reshapes the land',
    'The ground heaves and settles somewhere new',
    'The land shrugs',
  ],
  lightning: [
    'Lightning strikes',
    'A bolt finds the ground',
    'Thunder, and then the smell of it',
  ],
  blessing: [
    'A blessing radiates outward',
    'Warmth spreads across the land',
    'Something kind passes over the ground',
  ],
  curse: [
    'Dark corruption spreads',
    'The ground turns against everything on it',
    'Something foul takes root',
  ],
};

/** Which templates the last call used, so consecutive entries do not echo. */
const lastUsed = new Map<ChronicleTopic, number>();

const fill = (template: string, vars: ChronicleVars): string =>
  template
    .replace('{name}', vars.name ?? '')
    .replace('{type}', vars.type ?? '')
    .replace('{a}', vars.a ?? '')
    .replace('{b}', vars.b ?? '')
    .replace('{n}', String(vars.n ?? 0));

/**
 * Write one chronicle line.
 *
 * Suffixes are appended by the caller rather than baked into the templates,
 * because a count only sometimes exists and "A meteor devastates the region —
 * 0 perished" is worse than saying nothing.
 */
export const chronicle = (
  topic: ChronicleTopic,
  vars: ChronicleVars = {},
  seed = Math.random(),
): string => {
  const options = TEMPLATES[topic];
  let index = Math.floor(Math.abs(seed) * options.length) % options.length;
  if (options.length > 1 && lastUsed.get(topic) === index) {
    index = (index + 1) % options.length;
  }
  lastUsed.set(topic, index);
  return fill(options[index], vars);
};

/** Map a death cause onto its topic. */
export const deathTopic = (cause: string): ChronicleTopic => {
  switch (cause) {
    case 'old_age': return 'died_old';
    case 'combat': return 'died_combat';
    case 'starvation': return 'died_starved';
    case 'burned': return 'died_burned';
    case 'divine': return 'died_divine';
    case 'health': return 'died_health';
    default: return 'died_sudden';
  }
};

/**
 * Phrasings for the count a disaster or blessing leaves behind.
 *
 * The templates above cannot carry these, because a count only sometimes
 * exists — "A meteor devastates the region — 0 perished" is worse than saying
 * nothing. So the suffix is appended by the caller, which until now meant every
 * meteor in the world's history ended with the same four words however many
 * different ways the meteor itself was described.
 */
const TOLLS: Record<'dead' | 'slain' | 'claimed' | 'healed', string[]> = {
  dead: [
    ' — {n} perished',
    ', and {n} did not get up',
    '. {n} dead.',
  ],
  slain: [
    ' — {n} slain',
    ', taking {n} with it',
    '. {n} did not see it coming.',
  ],
  claimed: [
    ' — {n} souls claimed',
    ', and {n} were taken',
    '. {n} belong to it now.',
  ],
  healed: [
    ', healing {n} creatures',
    '. {n} felt it, and were mended.',
    ' — {n} made whole',
  ],
};

const lastToll = new Map<string, number>();

/**
 * The tail of a disaster line. Returns an empty string for a count of zero, so
 * a caller can append it unconditionally.
 */
export const toll = (
  kind: keyof typeof TOLLS,
  count: number,
  seed = Math.random(),
): string => {
  if (count <= 0) return '';
  const options = TOLLS[kind];
  let index = Math.floor(Math.abs(seed) * options.length) % options.length;
  if (options.length > 1 && lastToll.get(kind) === index) {
    index = (index + 1) % options.length;
  }
  lastToll.set(kind, index);
  return options[index].replace('{n}', String(count));
};

/**
 * Does a line read as one of `topic`'s phrasings?
 *
 * Exists for tests. Asserting `message.includes('is founded')` was fine while
 * every event had exactly one wording and became wrong the moment they had
 * three — three settlement tests broke on this change, all of them asserting
 * prose when what they meant was "an event of this kind happened". Matching
 * against the templates keeps that assertion true as the writing grows.
 */
export const matchesTopic = (message: string, topic: ChronicleTopic): boolean =>
  TEMPLATES[topic].some((template) => {
    const pattern = template
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\{(name|type|a|b|n)\\\}/g, '.+');
    return new RegExp(`^${pattern}`).test(message);
  });

/** Counts of everything, for the test that keeps the writing honest. */
export const TOPIC_COUNT = Object.keys(TEMPLATES).length;
export const PHRASING_COUNT = Object.values(TEMPLATES)
  .reduce((total, options) => total + options.length, 0);
