// What creatures say.
//
// WorldBox pairs roughly twenty situations with three or four lines each and
// picks one at random (06-WORLDBOX-COMPLETE-REFERENCE.md §5). The rotation is
// the whole trick: one fixed line per situation reads as a status label, and
// three read as a person having a bad day. So every situation here has at
// least three, and they are written to be worth reading twice.

import { random } from './random';

export type Occasion =
  | 'hungry'
  | 'thirsty'
  | 'exhausted'
  | 'lonely'
  | 'content'
  | 'afraid'
  | 'fighting'
  | 'wounded'
  | 'bonfire'
  | 'working'
  | 'hauling'
  | 'newVillage'
  | 'newborn'
  | 'raiding'
  | 'burning'
  | 'blessed'
  | 'cursed'
  | 'crowned'
  | 'inLove'
  | 'grieving'
  | 'poked'
  | 'armed'
  | 'legendary'
  | 'looted'
  | 'sick'
  | 'captured'
  | 'sailing';

const LINES: Record<Occasion, string[]> = {
  armed: [
    'Finally, something pointy.',
    'Look at this. No, really, look at it.',
    'I am going to name it. I am going to name it Steve.',
    'Now I just need someone to use it on.',
  ],
  legendary: [
    'It hums when I hold it.',
    'They say it has a name. It told me so itself.',
    'This was made for a hero. It will have to settle for me.',
  ],
  looted: [
    'You will not be needing this.',
    'Finders keepers. Fighters, rather.',
    'Nice. Slightly used. Previous owner very used.',
  ],
  sick: [
    'Does anyone else feel warm?',
    'It is just a cough. It is just a cough.',
    'Do not stand so close to me.',
  ],
  captured: [
    'Different flag, same fields.',
    'I suppose we pay taxes to them now.',
    'Nobody asked us. Nobody ever asks us.',
  ],
  sailing: [
    'I joined to fight, not to be seasick.',
    'Which way is their island? Somebody knows, right?',
    'Row faster. The war will not wait.',
  ],
  hungry: [
    'I could eat a whole forest.',
    'Was that berry poisonous? Asking after.',
    'My stomach has opinions.',
    'Anything. I will eat anything.',
  ],
  thirsty: [
    'Water. Any water. Even that water.',
    'My throat is a desert with ambitions.',
    'Is the river far? Be honest.',
  ],
  exhausted: [
    'Five minutes. That is all I ask.',
    'I will sleep standing up if I must.',
    'Everything aches, including my opinions.',
  ],
  lonely: [
    'Does anyone else live here?',
    'I have been talking to a rock.',
    'The rock is a good listener, to be fair.',
  ],
  content: [
    'Good soil, good weather, no wars.',
    'Today, nothing went wrong.',
    'I have decided to be happy about it.',
    'This is a fine place to be alive.',
  ],
  afraid: [
    'Nope. Nope nope nope.',
    'It looked right at me!',
    'Running is a valid strategy.',
    'I am not brave and I am at peace with that.',
  ],
  fighting: [
    'For the village!',
    'You picked the wrong field!',
    'This is going badly for someone.',
    'I did warn them.',
  ],
  wounded: [
    'That is a lot of my blood.',
    'I have been better. Recently, even.',
    'Walk it off. Walk it off.',
  ],
  bonfire: [
    'Tell the one about the dragon again.',
    'Warmest spot in the world, this.',
    'Whose turn is it to fetch wood?',
    'Nobody go home yet.',
  ],
  working: [
    'Honest work. Terrible pay.',
    'One more load and I am done.',
    'The hall will not build itself.',
  ],
  hauling: [
    'Heavier than it looks.',
    'Granary, granary, granary.',
    'Mind your backs!',
  ],
  newVillage: [
    'We will call it home and see if it sticks.',
    'Good water, flat ground. It will do.',
    'Somebody fetch a name for this place.',
  ],
  newborn: [
    'It has your ears. Unfortunately.',
    'Another mouth. Another pair of hands.',
    'Welcome to it, little one.',
  ],
  raiding: [
    'They have grain. We have spears.',
    'Nothing personal. Mostly nothing personal.',
    'Take the granary, leave the roof.',
  ],
  burning: [
    'FIRE! FIRE! Someone else deal with it!',
    'Not the trees! Anything but the trees!',
    'This is fine. This is not fine.',
  ],
  blessed: [
    'Something is looking after us.',
    'The soil went sweet overnight.',
    'I felt that. Whatever it was, I felt it.',
  ],
  cursed: [
    'The ground has gone wrong.',
    'We have upset something enormous.',
    'Pack. Now. Do not ask why.',
  ],
  crowned: [
    'I did not ask for this. I did accept it.',
    'Somebody has to hold the seal.',
    'Long may I, and so on.',
  ],
  inLove: [
    'Oh. Oh no. Oh good.',
    'I have made a decision and it was not mine.',
    'Everything is suddenly very interesting.',
    'I would like to be wherever they are.',
  ],
  grieving: [
    'They were here yesterday.',
    'I keep turning round to tell them things.',
    'It does not feel like it happened yet.',
    'Nobody warned me it would be this quiet.',
  ],
  // The player is felt. It does not know what you are, and it is right to be
  // upset about it.
  poked: [
    'OW. What was that?',
    'Something enormous just touched me.',
    'Why? What did I do?',
    'I know you are up there.',
  ],
};

/** The last line used per occasion, so consecutive speakers do not echo. */
const lastUsed = new Map<Occasion, number>();

/** Forget which lines were used last. Called when a new world is built. */
export const resetDialogue = (): void => {
  lastUsed.clear();
};

/**
 * Pick a line.
 *
 * With three or four options, two creatures reacting to the same event have
 * roughly a one-in-three chance of saying exactly the same thing in the same
 * frame — which reads as a bug rather than as a coincidence. So a repeat of
 * the immediately previous line is nudged to the next one instead. Only the
 * previous line is remembered: the point is to avoid an obvious echo, not to
 * impose a rotation the player could learn.
 */
export const speak = (occasion: Occasion, seed = random()): string => {
  const options = LINES[occasion];
  let index = Math.floor(Math.abs(seed) * options.length) % options.length;
  if (options.length > 1 && lastUsed.get(occasion) === index) {
    index = (index + 1) % options.length;
  }
  lastUsed.set(occasion, index);
  return options[index];
};

export const OCCASION_COUNT = Object.keys(LINES).length;
export const LINE_COUNT = Object.values(LINES).reduce((total, lines) => total + lines.length, 0);
