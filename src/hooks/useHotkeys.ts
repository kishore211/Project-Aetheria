import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { POWERS_BY_TAB, POWER_TABS, type PowerTabId } from '../utils/powers';
import { nextLayer } from '../utils/mapLayers';
import { soundManager } from '../utils/soundManager';
import { slotForKey } from '../utils/hotkeyBindings';

/**
 * Keyboard control.
 *
 * WorldBox is playable almost entirely from the keyboard, and that is a large
 * part of why it feels quick: you never travel to a menu to change what you
 * are holding. The bindings here follow theirs where we have the equivalent
 * feature (docs/project-tracker/06-WORLDBOX-COMPLETE-REFERENCE.md §12) so
 * muscle memory carries over:
 *
 *   Space         pause / resume
 *   1-9, 0        your bound power, or the nth power in the current tab
 *   Ctrl+digit    bind what you are holding to that slot (again to clear)
 *   Tab / S-Tab   cycle power tabs
 *   Z / X         cycle map layers
 *   H             hide the interface
 *   F             follow whatever is under the cursor
 *   L             world laws
 *   M             minimap
 *   N             map names
 *   + / -         zoom
 *   Esc           back out: close a panel, drop a selection, return to Inspect
 */
export const useHotkeys = (): void => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Never steal keys from a text field or a select.
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable
        || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const store = useGameStore.getState();
      const tab: PowerTabId = store.activePowerTab;

      // Ctrl/Cmd + digit binds whatever you are holding to that slot. Checked
      // before the modifier bail-out below, because it is the one binding that
      // *wants* a modifier.
      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        const slot = slotForKey(event.key);
        if (slot >= 0 && store.selectedTool) {
          event.preventDefault();
          store.bindHotkey(slot, store.selectedTool);
          soundManager.uiClick();
        }
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case ' ': {
          event.preventDefault();
          store.togglePause();
          return;
        }
        case 'Tab': {
          event.preventDefault();
          const order = POWER_TABS.map(entry => entry.id);
          const at = Math.max(0, order.indexOf(tab));
          const next = (at + (event.shiftKey ? -1 : 1) + order.length) % order.length;
          soundManager.uiClick();
          store.setActivePowerTab(order[next]);
          return;
        }
        case 'Escape': {
          // One key, one step back out of wherever you are.
          if (store.showHelp) store.setShowHelp(false);
          else if (store.showLaws) store.setShowLaws(false);
          else if (store.followEntityId) store.setFollowEntity(null);
          else if (store.selectedEntity || store.selectedTile) {
            store.setSelectedEntity(null);
            store.setSelectedTile(null);
          } else if (store.selectedTool !== 'select') store.setSelectedTool('select');
          return;
        }
        case '+':
        case '=': {
          store.requestZoom(-1);
          return;
        }
        case '-':
        case '_': {
          store.requestZoom(1);
          return;
        }
        default: break;
      }

      // Powers by number: your own binding if you have made one, otherwise
      // the nth power of the tab you are looking at, which is what the digits
      // did before slots existed. Nothing anyone has already learned breaks.
      const slot = slotForKey(event.key);
      if (slot >= 0) {
        const bound = store.hotkeySlots[slot];
        if (bound) {
          soundManager.uiClick();
          store.setSelectedTool(bound);
          return;
        }
        if (event.key === '0') return;
        const power = POWERS_BY_TAB(tab)[Number(event.key) - 1];
        if (power) {
          soundManager.uiClick();
          store.setSelectedTool(power.id);
        }
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'z': store.setMapLayer(nextLayer(store.mapLayer, -1)); break;
        case 'x': store.setMapLayer(nextLayer(store.mapLayer, 1)); break;
        case 'h': store.toggleUiHidden(); break;
        case 'l': store.setShowLaws(!store.showLaws); break;
        case 'm': store.toggleMinimap(); break;
        case 'n': store.toggleMapLabels(); break;
        case 'i': store.toggleUnitIcons(); break;
        case 'f': {
          // Follow what the pointer is over — no need to click it first.
          const hover = store.hoverTarget;
          if (hover?.kind === 'unit') {
            store.setFollowEntity(store.followEntityId === hover.id ? null : hover.id);
          } else if (store.selectedEntity) {
            store.setFollowEntity(store.followEntityId ? null : store.selectedEntity.id);
          }
          break;
        }
        default: break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
};
