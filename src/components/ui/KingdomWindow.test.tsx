import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KingdomWindow from './KingdomWindow';
import { useGameStore, type KingdomSummary } from '../../store/gameStore';
import { cleanupRoots, buttonByTitle, click, installWorld, render, resetUiState, visibleText } from './testing/harness';

const kingdom = (over: Partial<KingdomSummary> = {}): KingdomSummary => ({
  id: 'k1',
  name: 'Vale Kingdom',
  race: 'human',
  color: '#3366cc',
  population: 420,
  villages: 3,
  territory: 55,
  atWarWith: ['Ironhold'],
  ruler: 'King Aldric',
  capital: { name: 'Ashford', x: 10, y: 12 },
  army: 30,
  armed: 20,
  treasury: 340,
  upkeep: 4.5,
  allies: ['Mossgate'],
  relic: null,
  ...over,
});

const openKingdom = (over: Partial<KingdomSummary> = {}, onClose = vi.fn()) => {
  useGameStore.setState({ kingdoms: [kingdom(over)] });
  return { onClose, host: render(<KingdomWindow id="k1" onClose={onClose} />) };
};

describe('KingdomWindow', () => {
  beforeEach(resetUiState);
  afterEach(cleanupRoots);

  it('shows the realm name, ruler, population, treasury and upkeep', () => {
    openKingdom();
    const text = visibleText();
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Vale Kingdom');
    expect(text).toContain('King Aldric');
    expect(document.querySelector('[title="Population"]')?.textContent).toBe('420');
    expect(text).toContain('Treasury');
    expect(text).toContain('Gold in its towns');
    expect(text).toContain('340');
    expect(text).toContain('Army upkeep');
    expect(text).toContain('4.5 gold a minute');
  });

  it('lists its wars and allies', () => {
    openKingdom();
    expect(document.querySelector('.is-war')?.textContent).toBe('Ironhold');
    expect(document.querySelector('.is-ally')?.textContent).toBe('Mossgate');
  });

  it('closes itself when the realm disappears from the store', () => {
    const { onClose } = openKingdom();
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      useGameStore.setState({ kingdoms: [] });
    });
    expect(onClose).toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('sends each diplomacy act to the capital', () => {
    const intervene = vi.fn(() => null);
    installWorld({ intervene });
    openKingdom();

    click(buttonByTitle('Friendship:'));
    expect(intervene).toHaveBeenLastCalledWith('friendship', 10, 12);

    click(buttonByTitle('Spite:'));
    expect(intervene).toHaveBeenLastCalledWith('spite', 10, 12);

    click(buttonByTitle('Whisper of war:'));
    expect(intervene).toHaveBeenLastCalledWith('whisper', 10, 12);
    expect(intervene).toHaveBeenCalledTimes(3);
  });

  it('offers no diplomacy without a capital to aim at', () => {
    openKingdom({ capital: null });
    expect(document.querySelector('.kingdom-acts')).toBeNull();
  });
});
