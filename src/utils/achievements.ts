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
