import { useGameStore } from '../../store/gameStore';
import { MAP_LAYERS, isDataLayer, isIdentityLayer, sampleRamp } from '../../utils/mapLayers';

import * as THREE from 'three';

/**
 * A caption for the active map layer, with its ramp.
 *
 * A recoloured world with no caption is a world that looks broken. This is
 * also where the legend lives, because a ramp without its two ends labelled is
 * decoration rather than information.
 */
const swatch = new THREE.Color();

const MapLayerBadge = () => {
  const mapLayer = useGameStore((state) => state.mapLayer);
  const identities = useGameStore((state) => state.identities);
  if (mapLayer === 'natural') return null;

  const info = MAP_LAYERS.find((entry) => entry.id === mapLayer);
  if (!info) return null;

  const stops = isDataLayer(mapLayer)
    ? Array.from({ length: 9 }, (_, index) =>
      `#${sampleRamp(mapLayer, index / 8, swatch).getHexString()}`)
    : [];

  return (
    <div className="layer-badge">
      <div className="layer-badge-title">{info.label}</div>
      {stops.length > 0 && (
        <>
          <div className="layer-badge-ramp">
            {stops.map((color, index) => (
              <i key={index} style={{ background: color }} />
            ))}
          </div>
          <div className="layer-badge-legend">
            <span>{info.legend[0]}</span>
            <span>{info.legend[1]}</span>
          </div>
        </>
      )}
      {/* Identity layers need a key rather than a ramp: the colours mean
          particular peoples, and a colour with no name attached is decoration.
          Read from the store rather than the registry, because the registry is
          mutated by the simulation and nothing would re-render this when a
          schism mints a new culture. */}
      {isIdentityLayer(mapLayer) && (() => {
        const known = identities.filter((row) => row.kind === mapLayer).slice(0, 6);
        if (known.length === 0) {
          return (
            <div className="layer-badge-legend-single">
              Nobody has a {mapLayer} yet. Found a village.
            </div>
          );
        }
        return (
          <ul className="layer-key">
            {known.map((meta) => (
              <li key={meta.id}>
                <i style={{ background: meta.colorHex }} />
                <span>{meta.name}</span>
                {meta.holders > 0 && <em>{meta.holders}</em>}
              </li>
            ))}
          </ul>
        );
      })()}

      {stops.length === 0 && !isIdentityLayer(mapLayer) && (
        <div className="layer-badge-legend-single">{info.hint}</div>
      )}
    </div>
  );
};

export default MapLayerBadge;
