import {
  Baby, CloudLightning, Flag, Flame, Handshake, Hourglass, Scale, Ship, Sprout, Swords,
  TreePine, UserPlus, Users, Utensils, Waves, X, Rabbit, Skull, HeartHandshake, Hammer,
} from 'lucide-react';
import { useGameStore, DEFAULT_WORLD_LAWS, type WorldLaws } from '../../store/gameStore';
import { soundManager } from '../../utils/soundManager';

/**
 * The sandbox switchboard.
 *
 * This was eight bare toggles in one flat list. WorldBox groups its laws,
 * gives each an icon, and writes a line under every one that tells you what
 * the world becomes without it — which is the actual question you are asking
 * when you reach for the switch
 * (06-WORLDBOX-COMPLETE-REFERENCE.md §10). A toggle labelled "Old age" tells
 * you what it controls; "nothing dies of anything but violence" tells you what
 * you are about to make.
 */
interface Law {
  key: keyof WorldLaws;
  label: string;
  icon: typeof Flame;
  /** What the rule does while it is on. */
  description: string;
  /** What the world becomes with it off. */
  without: string;
}

interface LawGroup {
  title: string;
  blurb: string;
  laws: Law[];
}

const GROUPS: LawGroup[] = [
  {
    title: 'Life',
    blurb: 'What it costs to be alive here.',
    laws: [
      {
        key: 'aging', label: 'Old age', icon: Hourglass,
        description: 'Creatures grow old and die.',
        without: 'Nobody dies of anything but violence. Your first generation is your only one.',
      },
      {
        key: 'hunger', label: 'Hunger and thirst', icon: Utensils,
        description: 'Needs drain, and starvation kills.',
        without: 'Nothing has to eat, so nothing has to travel. Villages stop hauling and just stand there.',
      },
      {
        key: 'reproduction', label: 'Reproduction', icon: Baby,
        description: 'Creatures breed and pass their traits on.',
        without: 'No new anybody. Whatever you place is all there will ever be.',
      },
    ],
  },
  {
    title: 'The land',
    blurb: 'Whether the world does anything on its own.',
    laws: [
      {
        key: 'biomeGrowth', label: 'Growth and decay', icon: Sprout,
        description: 'Forests creep outward, corruption spreads, scars heal.',
        without: 'The map you generate is the map you keep. Nothing grows back.',
      },
      {
        key: 'fireSpread', label: 'Fire spread', icon: Flame,
        description: 'Flames jump to neighbouring tiles, faster on dry ground.',
        without: 'Fire burns exactly where you put it and no further. Safer. Less interesting.',
      },
      {
        key: 'disasters', label: 'Natural disasters', icon: CloudLightning,
        description: 'The world may strike on its own.',
        without: 'Every catastrophe from here on is yours, and everyone knows it.',
      },
      {
        key: 'ages', label: 'Ages of the world', icon: Hourglass,
        description: 'Eras arrive and change the rules — drought, frost, ash, chaos.',
        without: 'One long temperate afternoon, for ever.',
      },
      {
        key: 'erosion', label: 'Erosion', icon: Waves,
        description: 'The sea takes slow bites out of low, soft coast.',
        without: 'Coastlines stay exactly where you drew them. "Patient water" is off duty.',
      },
      {
        key: 'wildlife', label: 'Animal spawns', icon: Rabbit,
        description: 'Wild animals return to the land that suits them.',
        without: 'What is hunted out stays hunted out. The wild only shrinks.',
      },
      {
        key: 'monsterVisits', label: 'Monster visits', icon: Skull,
        description: 'Dragons, UFOs, bandits, Crabzilla and the Cold Ones come to the towns.',
        without: 'Monsters only arrive when you put them there.',
      },
      {
        key: 'peacefulMonsters', label: 'Peaceful monsters', icon: HeartHandshake,
        description: 'Monsters leave the four peoples alone.',
        without: 'Monsters do what monsters do.',
      },
      {
        key: 'entanglewood', label: 'Entanglewood', icon: TreePine,
        description: 'Forests slow everyone who walks through them by a fifth.',
        without: 'A wood is just trees. The roots have stopped taking it personally.',
      },
    ],
  },
  {
    title: 'Civilisation',
    blurb: 'Whether anybody organises.',
    laws: [
      {
        key: 'settlements', label: 'Settlements', icon: Scale,
        description: 'Races found villages, take jobs, and build.',
        without: 'Nothing is ever founded. A world of wanderers with nowhere to walk back to.',
      },
      {
        key: 'warfare', label: 'Warfare', icon: Swords,
        description: 'Kingdoms build tension, declare war, and raid.',
        without: 'Borders stop where they stop. Permanent, brittle peace.',
      },
      {
        key: 'diplomacy', label: 'Diplomacy', icon: Handshake,
        description: 'Kings make alliances. The game of thrones never ends.',
        without: 'Every realm stands alone, and remembers it.',
      },
      {
        key: 'rebellions', label: 'Rebellions', icon: Flag,
        description: 'An unhappy province can break away. The people\u2019s patience has limits.',
        without: 'Loyalty can sink as low as it likes. Nobody ever does anything about it.',
      },
      {
        key: 'colonisation', label: 'Kingdom expansion', icon: Ship,
        description: 'Kingdoms send settlers out — overland, or by boat to other islands.',
        without: 'Every kingdom is one town for ever.',
      },
      {
        key: 'populationCap', label: '100 People', icon: Users,
        description: 'No town grows past a hundred souls.',
        without: 'Towns grow as large as the food allows.',
      },
      {
        key: 'forging', label: 'Forging', icon: Hammer,
        description: 'Smiths arm the people in whatever metal the town can work.',
        without: 'Everyone fights with their hands. A war of fists.',
      },
      {
        key: 'migrants', label: 'Handsome migrants', icon: UserPlus,
        description: 'Small towns sometimes attract strangers. Too handsome to trust.',
        without: 'A village of three stays a village of three.',
      },
    ],
  },
];

/**
 * Presets. The point of a sandbox switchboard is the interesting *combinations*,
 * and finding those by flipping eight switches is work the player should not
 * have to do to discover that the game can do this at all.
 */
const PRESETS: Array<{ label: string; blurb: string; laws: WorldLaws }> = [
  {
    label: 'Everything on',
    blurb: 'The world as intended.',
    laws: { ...DEFAULT_WORLD_LAWS },
  },
  {
    label: 'Peaceable',
    blurb: 'They build, they never fight, and nothing falls out of the sky.',
    laws: { ...DEFAULT_WORLD_LAWS, warfare: false, disasters: false },
  },
  {
    label: 'Deathless',
    blurb: 'Nothing ages, nothing starves. Watch a population run away with itself.',
    laws: { ...DEFAULT_WORLD_LAWS, aging: false, hunger: false },
  },
  {
    label: 'Diorama',
    blurb: 'Everything off. A world that only moves when you move it.',
    laws: {
      aging: false, hunger: false, reproduction: false, disasters: false,
      fireSpread: false, biomeGrowth: false, settlements: false, warfare: false,
      ages: false, rebellions: false, colonisation: false, diplomacy: false,
      populationCap: false, migrants: false, entanglewood: false, erosion: false,
      wildlife: false, monsterVisits: false, peacefulMonsters: false, forging: false,
    },
  },
];

const sameLaws = (a: WorldLaws, b: WorldLaws): boolean =>
  (Object.keys(a) as Array<keyof WorldLaws>).every((key) => a[key] === b[key]);

const WorldLawsPanel = () => {
  const showLaws = useGameStore((state) => state.showLaws);
  const setShowLaws = useGameStore((state) => state.setShowLaws);
  const worldLaws = useGameStore((state) => state.worldLaws);
  const toggleWorldLaw = useGameStore((state) => state.toggleWorldLaw);
  const setWorldLaws = useGameStore((state) => state.setWorldLaws);

  if (!showLaws) return null;

  const activeCount = Object.values(worldLaws).filter(Boolean).length;
  const total = Object.keys(worldLaws).length;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="ui-modal w-full max-w-lg max-h-[88vh] overflow-y-auto bg-secondary rounded-xl shadow-2xl border border-muted/50 p-5 text-foreground">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Scale size={18} className="text-amber-300" />
            World Laws
          </h2>
          <button
            type="button"
            onClick={() => setShowLaws(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-muted-foreground text-sm mb-3">
          Rewrite the rules. Changes take effect immediately —{' '}
          <span className="text-foreground">{activeCount} of {total}</span> laws in force.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-4">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              title={preset.blurb}
              className={`law-preset ${sameLaws(worldLaws, preset.laws) ? 'is-on' : ''}`}
              onClick={() => { soundManager.uiClick(); setWorldLaws(preset.laws); }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {GROUPS.map((group) => (
          <section key={group.title} className="mb-4 last:mb-0">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </h3>
            <p className="text-[0.7rem] text-muted-foreground/70 mb-1.5">{group.blurb}</p>
            <ul className="space-y-1.5">
              {group.laws.map((law) => {
                const enabled = worldLaws[law.key];
                const Glyph = law.icon;
                return (
                  <li key={law.key}>
                    <button
                      type="button"
                      onClick={() => { soundManager.uiClick(); toggleWorldLaw(law.key); }}
                      className={`law-row ${enabled ? 'is-on' : ''}`}
                    >
                      <span className={`law-switch ${enabled ? 'is-on' : ''}`}>
                        <i />
                      </span>
                      <Glyph size={15} className="shrink-0 mt-0.5 opacity-80" />
                      <span className="min-w-0 text-left">
                        <span className="block text-sm font-medium">{law.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {enabled ? law.description : law.without}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
};

export default WorldLawsPanel;
