// Milestones. Purely for flavour — nothing in the simulation depends on them.
// Unlocks live in localStorage so a player's collection survives a reload.

export interface Achievement {
  id: string;
  title: string;
  description: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-world', title: 'Let There Be Land', description: 'Create your first world.' },
  { id: 'first-life', title: 'Spark of Life', description: 'Put a living creature into the world.' },
  { id: 'menagerie', title: 'Menagerie', description: 'Keep a hundred creatures alive at once.' },
  { id: 'civilisation', title: 'First Fire', description: 'Watch a race found its first village.' },
  { id: 'empire', title: 'Empire', description: 'See one kingdom hold three villages.' },
  { id: 'dynasty', title: 'Dynasty', description: 'Rule a kingdom of forty souls.' },
  { id: 'warmonger', title: 'Casus Belli', description: 'Let two kingdoms go to war.' },
  { id: 'conqueror', title: 'Salt the Earth', description: 'See a village razed by raiders.' },
  { id: 'cataclysm', title: 'Cataclysm', description: 'Drop a meteor on your creation.' },
  { id: 'inferno', title: 'Inferno', description: 'Set the world alight.' },
  { id: 'benevolent', title: 'Benevolent', description: 'Bless the land instead of breaking it.' },
  { id: 'extinction', title: 'Silence', description: 'Watch a thriving world fall empty.' },
  { id: 'archivist', title: 'Archivist', description: 'Save a world for another day.' },
  { id: 'elder', title: 'Full Circle', description: 'Let a creature die peacefully of old age.' },
  { id: 'seafarers', title: 'Seafarers', description: 'Watch settlers set sail for another island.' },
  { id: 'landfall', title: 'Landfall', description: 'See a boatload of settlers come ashore on new land.' },
  { id: 'archipelago', title: 'Archipelago', description: 'Raise an island out of the sea.' },
  { id: 'second-sun', title: 'Second Sun', description: 'Drop the atomic bomb. You know what you did.' },
  { id: 'absence', title: 'Absence', description: 'Erase a piece of the world with the void.' },
  { id: 'twister', title: 'Twister', description: 'Set a tornado walking.' },
  { id: 'hot-spot', title: 'Hot Spot', description: 'Raise a volcano.' },
  { id: 'patient-zero', title: 'Patient Zero', description: 'Watch the plague raise its first dead.' },
  { id: 'kingmaker', title: 'Kingmaker', description: 'Give a province the idea that it could rule itself.' },
  { id: 'whisperer', title: 'Whisperer', description: 'Start a war with a word in a king\u2019s ear.' },
  { id: 'peacemaker', title: 'Peacemaker', description: 'End a quarrel with a touch of friendship.' },
  { id: 'double', title: 'Double Trouble', description: 'Clone a creature.' },
  { id: 'lethe', title: 'Lethe', description: 'Make people forget who they were.' },
  { id: 'strangers', title: 'Handsome Strangers', description: 'Welcome migrants to a struggling town.' },
  { id: 'puppeteer', title: 'Puppeteer', description: 'Possess a creature and walk around in it.' },
  { id: 'new-banner', title: 'New Banner', description: 'Watch a town fall to another kingdom and change its flag.' },
  { id: 'legend', title: 'The Stuff of Legend', description: 'See a smith forge a named, legendary item.' },
  { id: 'heirloom', title: 'Heirloom', description: 'Watch a named weapon taken off the body of its last owner.' },
  { id: 'here-be-dragons', title: 'Here Be Dragons', description: 'Have a dragon come down on one of your towns of its own accord.' },
  { id: 'close-encounter', title: 'Close Encounter', description: 'See the lights come for the cattle.' },
  { id: 'kaiju', title: 'Kaiju', description: 'Watch the sea stand up and walk ashore.' },
];

export const ACHIEVEMENTS_BY_ID = new Map(ACHIEVEMENTS.map((entry) => [entry.id, entry]));

const STORAGE_KEY = 'aetheria.achievements';

export const loadUnlocked = (): string[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

export const persistUnlocked = (ids: string[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable — achievements simply will not persist */
  }
};
