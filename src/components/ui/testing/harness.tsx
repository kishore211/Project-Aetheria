import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useGameStore } from '../../../store/gameStore';
import { worldAccess, type WorldAccess } from '../../../utils/worldAccess';
import { resetIdentity } from '../../../utils/identity';
import { resetFaiths } from '../../../utils/religion';
import type { Entity, Tile } from '../../../types/world';

// Tell React 19 that a test harness is driving updates, so it does not warn
// about state changes made outside an act() scope.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Mounted {
  root: Root;
  host: HTMLElement;
}

const mounted: Mounted[] = [];

/**
 * Mount a component into a fresh div on document.body. Portalled windows land
 * on document.body directly, so `cleanupRoots` unmounts them too.
 */
export const render = (ui: ReactElement): HTMLElement => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(ui);
  });
  mounted.push({ root, host });
  return host;
};

/** Unmount every root and remove its host, and clear any portalled leftovers. */
export const cleanupRoots = (): void => {
  while (mounted.length > 0) {
    const entry = mounted.pop()!;
    act(() => {
      entry.root.unmount();
    });
    entry.host.remove();
  }
  document.body.innerHTML = '';
};

/** The text a player would read on screen, across the whole document. */
export const visibleText = (): string => document.body.textContent ?? '';

/** The first button whose title attribute starts with `prefix`. */
export const buttonByTitle = (prefix: string): HTMLButtonElement => {
  const hit = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
    .find((button) => (button.getAttribute('title') ?? '').startsWith(prefix));
  if (!hit) throw new Error(`no button with title starting "${prefix}"`);
  return hit;
};

export const click = (element: HTMLElement): void => {
  act(() => {
    element.click();
  });
};

export const pressKey = (key: string): void => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  });
};

/** Minimal world handle; every method a window does not exercise returns an empty answer. */
export const stubWorld = (over: Partial<WorldAccess> = {}): WorldAccess => ({
  tiles: [],
  entities: () => [],
  kingdomColor: () => undefined,
  cameraFocus: () => ({ x: 0, y: 0, span: 10 }),
  captureSave: () => {
    throw new Error('captureSave is not used by this test');
  },
  herdInfo: () => null,
  villageInfo: () => null,
  ...over,
});

export const installWorld = (over: Partial<WorldAccess> = {}): WorldAccess => {
  const world = stubWorld(over);
  worldAccess.current = world;
  return world;
};

/** A creature with every field the windows read, at adult age unless overridden. */
export const makeEntity = (over: Partial<Entity> = {}): Entity => ({
  id: 'e1',
  type: 'human',
  name: 'Test',
  age: 30,
  maxAge: 70,
  health: 100,
  maxHealth: 100,
  position: { x: 0, y: 0 },
  attributes: { strength: 5, intelligence: 5, speed: 5, resilience: 5 },
  needs: { hunger: 1, thirst: 1, rest: 1, social: 1 },
  inventory: [],
  status: [],
  ...over,
});

/** A bare tile: the windows only read its coordinates. */
export const makeTileAt = (x: number, y: number): Tile => ({ x, y } as Tile);

/** Reset the stores and singletons every window test depends on. */
export const resetUiState = (): void => {
  worldAccess.current = null;
  resetIdentity();
  resetFaiths();
  useGameStore.setState({
    selectedTile: null,
    selectedEntity: null,
    kingdoms: [],
    villages: [],
    plots: [],
    opinions: [],
    followEntityId: null,
    showHelp: false,
  });
};

/**
 * jsdom has no canvas encoder, so toDataURL logs "not implemented" for every
 * sprite it is asked to encode. Portraits fall back to no image on an empty
 * URL, which is what a player sees when a sprite cannot be drawn. Returns the
 * restore function for afterEach.
 */
export const quietCanvasEncoding = (): (() => void) => {
  const original = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = () => '';
  return () => {
    HTMLCanvasElement.prototype.toDataURL = original;
  };
};
