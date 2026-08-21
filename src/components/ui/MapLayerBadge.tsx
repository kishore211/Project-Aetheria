import { useGameStore } from '../../store/gameStore';
import { MAP_LAYERS, isDataLayer, sampleRamp } from '../../utils/mapLayers';
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
      {stops.length === 0 && <div className="layer-badge-legend-single">{info.hint}</div>}
    </div>
  );
};

export default MapLayerBadge;
