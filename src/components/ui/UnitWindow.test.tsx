import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import UnitWindow from './UnitWindow';
import { useGameStore } from '../../store/gameStore';
import { cleanupRoots, installWorld, makeEntity, pressKey, quietCanvasEncoding, render, resetUiState, visibleText } from './testing/harness';

const openUnit = (over: Parameters<typeof makeEntity>[0] = {}) => {
  const entity = makeEntity({ name: 'Aldo', job: 'farmer', health: 40, maxHealth: 100, ...over });
  useGameStore.setState({ selectedEntity: entity });
  installWorld({ entities: () => [entity] });
  return render(<UnitWindow />);
};

describe('UnitWindow', () => {
  let restoreCanvas: () => void = () => {};
  beforeEach(() => {
    resetUiState();
    restoreCanvas = quietCanvasEncoding();
  });
  afterEach(() => {
    cleanupRoots();
    restoreCanvas();
  });

  it('shows the creature name, job and health', () => {
    openUnit();
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Aldo');
    expect(visibleText()).toContain('Aldo');
    expect(visibleText()).toContain('Job');
    expect(visibleText()).toContain('farmer');
    expect(document.querySelector('.unit-health')?.getAttribute('title')).toBe('Health 40/100');
    expect(visibleText()).toContain('40/100');
  });

  it('describes a child as young and an adult without that word', () => {
    openUnit({ age: 2, maxAge: 70 });
    expect(document.querySelector('.unit-kind')?.textContent).toContain('young');
    cleanupRoots();

    openUnit({ age: 30, maxAge: 70 });
    expect(document.querySelector('.unit-kind')?.textContent).not.toContain('young');
  });

  it('clears the selection on Escape', () => {
    openUnit();
    pressKey('Escape');
    expect(useGameStore.getState().selectedEntity).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
