import { createStatLibrary } from './stat-asset';
import { STAT_DEFS } from './stat-data';

export * from './stat-asset';
export * from './stat-container';
export { STAT_DEFS } from './stat-data';

/** Library of the starter stats (not frozen, so tests/mods can extend a fresh one). */
export function createDefaultStatLibrary() {
  return createStatLibrary(STAT_DEFS);
}
