import { MATERIAL_COLOR, type Item } from '../../utils/equipment';

/**
 * Item icons in pixels, the way WorldBox draws an item in its slot: the
 * working part in the item's metal, the grip in wood. `m` is metal, `g` grip,
 * `k` outline, `h` highlight.
 */
const ICONS: Record<string, string[]> = {
  sword: [
    '..........kk',
    '.........khk',
    '........khmk',
    '.......khmk.',
    '......khmk..',
    '.....khmk...',
    '.k..khmk....',
    '.kkkhmk.....',
    '..kmmk......',
    '.kgkkk......',
    'kgk..k......',
    'kk..........',
  ],
  axe: [
    '......kkk...',
    '.....khmmk..',
    '....khmmmmk.',
    '....kgkmmmk.',
    '...kgk.kmk..',
    '..kgk...k...',
    '.kgk........',
    'kgk.........',
    'kk..........',
    '............',
    '............',
    '............',
  ],
  spear: [
    '.........kkk',
    '........khmk',
    '.......khmmk',
    '......kgkmk.',
    '.....kgk.k..',
    '....kgk.....',
    '...kgk......',
    '..kgk.......',
    '.kgk........',
    'kgk.........',
    'kk..........',
    '............',
  ],
  hammer: [
    '....kkkk....',
    '...khmmmk...',
    '..khmmmmmk..',
    '..kmmmmmmk..',
    '...kkgkkk...',
    '.....gk.....',
    '.....gk.....',
    '.....gk.....',
    '.....gk.....',
    '.....gk.....',
    '....kkkk....',
    '............',
  ],
  bow: [
    '...kk.......',
    '..kgk.k.....',
    '.kgk...k....',
    '.kgk....k...',
    'kgk......k..',
    'kgk.......k.',
    'kgk......k..',
    '.kgk....k...',
    '.kgk...k....',
    '..kgk.k.....',
    '...kk.......',
    '............',
  ],
  armor: [
    '..kkk..kkk..',
    '.khmkkkkmmk.',
    'khmmmmmmmmmk',
    'kmmkmmmmkmmk',
    '.kkkmmmmkkk.',
    '...kmmmmk...',
    '...khmmmk...',
    '...kmmmmk...',
    '...kmmmmk...',
    '...kkkkkk...',
    '............',
    '............',
  ],
};

const lighten = (hex: string, k: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.min(255, Math.round(v + (255 - v) * k)).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
};

const ItemIcon = ({ item, kind, size = 28 }: { item?: Item | null; kind?: string; size?: number }) => {
  const shape = ICONS[item?.kind ?? kind ?? 'sword'] ?? ICONS.sword;
  const metal = item ? MATERIAL_COLOR[item.material] : '#5b6150';
  const palette: Record<string, string> = {
    k: item ? '#1a1410' : '#2a3021', m: metal, h: lighten(metal, 0.45), g: item ? '#7a4e26' : '#4a503d',
  };
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden>
      {shape.flatMap((row, y) => row.split('').map((key, x) => (
        key === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={palette[key]} />
      )))}
    </svg>
  );
};

export default ItemIcon;
