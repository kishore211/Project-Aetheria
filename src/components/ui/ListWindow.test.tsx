import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ListWindow from './ListWindow';
import { useGameStore, type KingdomSummary, type OpinionRow, type PlotSummary, type VillageSummary } from '../../store/gameStore';
import { registerMeta } from '../../utils/identity';
import { foundFaith } from '../../utils/religion';
import type { Item } from '../../utils/equipment';
import { cleanupRoots, click, installWorld, makeEntity, quietCanvasEncoding, render, resetUiState, visibleText } from './testing/harness';

const TABS = ['Realms', 'Towns', 'Species', 'Armies', 'Items', 'Standing', 'Plots', 'Clans', 'Faiths', 'Cultures', 'Tongues', 'Starred'];

const tabButton = (label: string): HTMLButtonElement => {
  const hit = Array.from(document.querySelectorAll<HTMLButtonElement>('button.list-tab'))
    .find((button) => button.textContent?.startsWith(label));
  if (!hit) throw new Error(`no register tab "${label}"`);
  return hit;
};

const openRegister = () => render(<ListWindow open onClose={() => {}} />);

const sword: Item = {
  id: 'i1', slot: 'weapon', kind: 'sword', material: 'steel', quality: 'legendary', modifier: 'sharp',
  name: 'Dawnbreaker', kills: 3, madeIn: 'Ashford', owners: ['Aldo'], durability: 90,
};

const kingdom: KingdomSummary = {
  id: 'k1', name: 'Vale Kingdom', race: 'human', color: '#3366cc', population: 420, villages: 1,
  territory: 55, atWarWith: ['Ironhold'], ruler: 'King Aldric', capital: null, army: 30, armed: 20,
  treasury: 340, upkeep: 4.5, allies: [], relic: null,
};

const village: VillageSummary = {
  id: 'v1', name: 'Ashford', kingdomName: 'Vale Kingdom', color: '#3366cc', capital: true,
  population: 9, buildings: 3, territory: 12, x: 4, y: 5, loyalty: 10, secedesIn: null,
};

const plot: PlotSummary = {
  id: 'p1', kind: 'coup', label: 'Coup', description: 'A plot to seize the crown', glyph: '!',
  plotterName: 'Brann', subjectName: 'King Aldric', targetName: null, share: 0.4, age: 30,
  conspirators: 2, hostile: true, x: 4, y: 5,
};

const opinion: OpinionRow = {
  a: 'Vale Kingdom', b: 'Ironhold', colorA: '#3366cc', colorB: '#aa3333', score: -40,
  factors: [{ label: 'border raids', value: -40 }], atWar: true, allied: false,
};

describe('ListWindow', () => {
  let restoreCanvas: () => void = () => {};
  beforeEach(() => {
    resetUiState();
    restoreCanvas = quietCanvasEncoding();
  });
  afterEach(() => {
    cleanupRoots();
    restoreCanvas();
  });

  it('renders nothing while closed', () => {
    render(<ListWindow open={false} onClose={() => {}} />);
    expect(document.body.textContent).not.toContain("The World's Register");
  });

  it('opens on the realms tab and shows the register title', () => {
    openRegister();
    expect(visibleText()).toContain("The World's Register");
    expect(tabButton('Realms').className).toContain('is-on');
  });

  it('renders every tab without throwing when the world is empty', () => {
    openRegister();
    for (const label of TABS) {
      click(tabButton(label));
      expect(tabButton(label).className).toContain('is-on');
      expect(document.querySelector('.list-empty')).not.toBeNull();
    }
  });

  it('renders every tab with rows when the world has something in each', () => {
    const culture = registerMeta({ id: 'culture-1', kind: 'culture', name: 'Ashen Way', colorHex: '#8a6d3b', traits: [] });
    const faith = registerMeta({ id: 'faith-1', kind: 'religion', name: 'Lantern Creed', colorHex: '#ffd84a', traits: [] });
    const tongue = registerMeta({ id: 'tongue-1', kind: 'language', name: 'Vale Tongue', colorHex: '#55aa55', traits: [] });
    foundFaith(faith, null, null, 0.5);

    const aldo = makeEntity({
      id: 'e1', name: 'Aldo', clan: 'Oakfolk', favourite: true, kills: 3,
      cultureId: culture.id, religionId: faith.id, languageId: tongue.id,
      equipment: { weapon: sword },
    });
    useGameStore.setState({
      kingdoms: [kingdom], villages: [village], plots: [plot], opinions: [opinion],
    });
    installWorld({
      entities: () => [aldo],
      armies: () => [{
        id: 'a1', captainId: 'e1', captain: 'Aldo', kingdomId: 'k1', kingdom: 'Vale Kingdom', color: '#3366cc',
        race: 'human', home: 'Ashford', soldiers: 12, armed: 10, x: 4, y: 5, marchingOn: null,
      }],
    });

    openRegister();
    for (const label of TABS) {
      click(tabButton(label));
      expect(document.querySelector('.list-empty'), `${label} should have rows`).toBeNull();
    }

    click(tabButton('Starred'));
    expect(visibleText()).toContain('Aldo');
    click(tabButton('Items'));
    expect(visibleText()).toContain('Dawnbreaker');
    click(tabButton('Realms'));
    expect(visibleText()).toContain('Vale Kingdom');
  });
});
