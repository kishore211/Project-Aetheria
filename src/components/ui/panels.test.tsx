import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import TopBar from './TopBar';
import PowerBar from './PowerBar';
import KingdomsPanel from './KingdomsPanel';
import { useGameStore, type KingdomSummary } from '../../store/gameStore';
import { cleanupRoots, render, resetUiState, visibleText } from './testing/harness';

const kingdom = (over: Partial<KingdomSummary> = {}): KingdomSummary => ({
  id: 'k1', name: 'Vale Kingdom', race: 'human', color: '#3366cc', population: 420, villages: 2,
  territory: 55, atWarWith: [], ...over,
});

describe('top-level HUD panels', () => {
  beforeEach(resetUiState);
  afterEach(cleanupRoots);

  it('TopBar renders the population and clock with an empty world', () => {
    render(<TopBar />);
    expect(visibleText()).toContain('Year');
  });

  it('PowerBar renders its power tabs without throwing', () => {
    render(<PowerBar />);
    expect(document.querySelectorAll('button').length).toBeGreaterThan(0);
  });

  it('KingdomsPanel stays hidden until a kingdom exists', () => {
    render(<KingdomsPanel />);
    expect(document.querySelector('.ui-panel-right')).toBeNull();
  });

  it('KingdomsPanel lists each realm with its size and wars', () => {
    useGameStore.setState({
      kingdoms: [kingdom(), kingdom({ id: 'k2', name: 'Ironhold', atWarWith: ['Vale Kingdom'] })],
    });
    render(<KingdomsPanel />);
    const text = visibleText();
    expect(text).toContain('Kingdoms (2)');
    expect(text).toContain('Vale Kingdom');
    expect(text).toContain('420 souls');
    expect(text).toContain('at war with Vale Kingdom');
  });
});
