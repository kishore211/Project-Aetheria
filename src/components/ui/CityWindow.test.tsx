import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import CityWindow from './CityWindow';
import { useGameStore } from '../../store/gameStore';
import type { WorldAccess } from '../../utils/worldAccess';
import { cleanupRoots, click, installWorld, makeTileAt, pressKey, render, resetUiState, visibleText } from './testing/harness';

type Village = NonNullable<ReturnType<WorldAccess['villageInfo']>>;

const village = (over: Partial<Village> = {}): Village => ({
  name: 'Ashford',
  kingdomId: 'k1',
  kingdomName: 'Vale Kingdom',
  kingdomColor: '#3366cc',
  race: 'human',
  store: { food: 80, wood: 40, stone: 15, gold: 120 },
  jobs: { farmer: 4, young: 2 },
  population: 9,
  buildings: 3,
  territory: 12,
  capital: false,
  identity: { culture: null, cultureColor: null, cultureTraits: [], language: null, religion: null },
  treasury: {
    wages: 12.5, purchases: 6, festivals: 0, income: 9, bought: { wood: 2, stone: 1, food: 3 }, unpaidSoldiers: 0,
  },
  loyalty: null,
  loyaltyFactors: [],
  restless: 0,
  secedesIn: null,
  ruler: null,
  rulerStats: null,
  ...over,
});

const openTown = (townOver: Partial<Village> = {}) => {
  useGameStore.setState({ selectedTile: makeTileAt(4, 5) });
  installWorld({ villageInfo: () => village(townOver) });
  return render(<CityWindow />);
};

describe('CityWindow', () => {
  beforeEach(resetUiState);
  afterEach(cleanupRoots);

  it('shows the town, its realm and what its people do', () => {
    openTown();
    const text = visibleText();
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Ashford');
    expect(text).toContain('Ashford');
    expect(text).toContain('Realm');
    expect(text).toContain('Vale Kingdom');
    expect(text).toContain('At work');
    expect(text).toContain('4 farmers');
    expect(text).toContain('2 children');
  });

  it('shows the treasury: gold, wages, market spending and income', () => {
    openTown();
    const text = visibleText();
    expect(text).toContain('Treasury');
    expect(text).toContain('Gold in the chest');
    expect(text).toContain('120');
    expect(text).toContain('Wages, last minute');
    expect(text).toContain('12.5');
    expect(text).toContain('Spent at market');
    expect(text).toContain('Income, last minute');
    expect(text).toContain('+9');
  });

  it('warns about unpaid soldiers only when there are some', () => {
    openTown();
    expect(visibleText()).not.toContain('unpaid');
    cleanupRoots();

    openTown({ treasury: { ...village().treasury, unpaidSoldiers: 1 } });
    expect(visibleText()).toContain('1 soldier is unpaid.');
    cleanupRoots();

    openTown({ treasury: { ...village().treasury, unpaidSoldiers: 3 } });
    expect(visibleText()).toContain('3 soldiers are unpaid.');
  });

  it('renders nothing when no tile is selected', () => {
    installWorld({ villageInfo: () => village() });
    render(<CityWindow />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('clears the selection on Escape', () => {
    openTown();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    pressKey('Escape');
    expect(useGameStore.getState().selectedTile).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('clears the selection from the close button', () => {
    openTown();
    const close = document.querySelector<HTMLButtonElement>('button[title="Close (Esc)"]');
    expect(close).not.toBeNull();
    click(close!);
    expect(useGameStore.getState().selectedTile).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
