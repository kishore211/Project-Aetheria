import { useCallback, useEffect, useRef } from 'react';
import { Map as MapIcon, X } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { isDataLayer, sampleRamp } from '../../utils/mapLayers';
import * as THREE from 'three';
import { worldAccess } from '../../utils/worldAccess';
import { BIOME_BASE_COLORS } from '../../utils/worldGenerator';
import type { BiomeType } from '../../types/world';

const REDRAW_INTERVAL = 220; // ms — the map does not need 60 fps

/** Reused so the redraw loop does not allocate a colour per tile. */
const scratch = new THREE.Color();

/** Water biomes, matching the terrain renderer's rule for data layers. */
const WATER = new Set<string>(['deep_ocean', 'ocean', 'shallow_water', 'river', 'lake']);
const isWater = (type: string): boolean => WATER.has(type);

/** Pre-split the biome palette into channels so the redraw loop stays cheap. */
const CHANNELS = new Map<BiomeType, [number, number, number]>();
for (const [biome, hex] of Object.entries(BIOME_BASE_COLORS) as [BiomeType, number][]) {
  CHANNELS.set(biome, [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]);
}

const hexToChannels = (hex: string): [number, number, number] => {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

/**
 * A 1px-per-tile world map. Biome colour underneath, kingdom borders blended
 * over the top, creatures as bright dots, and the camera's focus as a box.
 * Click anywhere to fly there.
 */
const Minimap = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<ImageData | null>(null);
  const showMinimap = useGameStore((state) => state.showMinimap);
  const mapLayer = useGameStore((state) => state.mapLayer);
  const toggleMinimap = useGameStore((state) => state.toggleMinimap);
  const focusTile = useGameStore((state) => state.focusTile);

  const draw = useCallback(() => {
    const access = worldAccess.current;
    const canvas = canvasRef.current;
    if (!access || !canvas) return;

    const size = access.tiles.length;
    if (size === 0) return;
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
      imageRef.current = null;
    }

    const context = canvas.getContext('2d');
    if (!context) return;

    if (!imageRef.current) {
      imageRef.current = context.createImageData(size, size);
    }
    const image = imageRef.current;
    const data = image.data;

    // The minimap answers whatever question the big map is answering. Two
    // views of one world that disagree about what they are showing is worse
    // than having no minimap: you stop trusting either of them.
    const layer = mapLayer;
    const dataLayer = isDataLayer(layer);

    for (let x = 0; x < size; x++) {
      const column = access.tiles[x];
      for (let y = 0; y < size; y++) {
        const tile = column[y];
        // Canvas rows run along y, columns along x
        const offset = (y * size + x) * 4;
        let r: number;
        let g: number;
        let b: number;

        if (dataLayer) {
          if (isWater(tile.type) && layer !== 'height') {
            // Same rule as the terrain renderer: the sea keeps the coastline
            // legible on every layer except the one measuring depth.
            [r, g, b] = [24, 43, 69];
          } else {
            const value = layer === 'height' ? tile.height
              : layer === 'rainfall' ? tile.moisture
                : layer === 'temperature' ? tile.temperature
                  : tile.fertility;
            sampleRamp(layer, value, scratch);
            r = scratch.r * 255;
            g = scratch.g * 255;
            b = scratch.b * 255;
          }
        } else {
          [r, g, b] = CHANNELS.get(tile.type) ?? [130, 130, 130];
          if (layer === 'political') {
            // Drained, exactly as the big map drains, so the claims are the
            // only saturated thing here too.
            const grey = (r + g + b) / 3;
            r = grey * 0.82 + 13;
            g = grey * 0.84 + 13;
            b = grey * 0.9 + 15;
          }
        }

        // Gentle relief shading so mountains read on the minimap
        const shade = 0.82 + tile.height * 0.36;
        r *= shade;
        g *= shade;
        b *= shade;

        if (tile.isOnFire) {
          r = 255; g = 120; b = 40;
        } else if (tile.ownerId) {
          const hex = access.kingdomColor(tile.ownerId);
          if (hex) {
            const [kr, kg, kb] = hexToChannels(hex);
            r = r * 0.35 + kr * 0.65;
            g = g * 0.35 + kg * 0.65;
            b = b * 0.35 + kb * 0.65;
          }
        }

        data[offset] = Math.min(255, r);
        data[offset + 1] = Math.min(255, g);
        data[offset + 2] = Math.min(255, b);
        data[offset + 3] = 255;
      }
    }

    // Creatures as single bright pixels
    for (const entity of access.entities()) {
      const x = Math.floor(entity.position.x);
      const y = Math.floor(entity.position.y);
      if (x < 0 || x >= size || y < 0 || y >= size) continue;
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 245;
      data[offset + 2] = 210;
      data[offset + 3] = 255;
    }

    context.putImageData(image, 0, 0);

    // Camera viewport box
    const focus = access.cameraFocus();
    const half = Math.max(2, focus.span * 0.7);
    context.strokeStyle = 'rgba(255,255,255,0.85)';
    context.lineWidth = 1;
    context.strokeRect(focus.x - half, focus.y - half, half * 2, half * 2);
  }, [mapLayer]);

  useEffect(() => {
    if (!showMinimap) return;
    draw();
    const timer = window.setInterval(draw, REDRAW_INTERVAL);
    return () => window.clearInterval(timer);
  }, [showMinimap, draw]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const access = worldAccess.current;
    if (!canvas || !access) return;
    const rect = canvas.getBoundingClientRect();
    const size = access.tiles.length;
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * size);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * size);
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    focusTile(x, y);
  };

  if (!showMinimap) {
    return (
      <button
        type="button"
        title="Show minimap"
        className="tool-btn self-end bg-secondary/90 backdrop-blur-sm border border-muted/40 rounded-md p-2 text-muted-foreground hover:text-foreground"
        onClick={toggleMinimap}
      >
        <MapIcon size={16} />
      </button>
    );
  }

  return (
    <div className="ui-panel-right self-end bg-secondary/90 backdrop-blur-sm border border-muted/40 rounded-md p-2 shadow-lg">
      <div className="flex items-center justify-between mb-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <MapIcon size={12} /> World
        </span>
        <button type="button" title="Hide minimap" onClick={toggleMinimap} className="hover:text-foreground">
          <X size={12} />
        </button>
      </div>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="block cursor-crosshair rounded"
        style={{ width: 168, height: 168, imageRendering: 'pixelated' }}
      />
    </div>
  );
};

export default Minimap;
