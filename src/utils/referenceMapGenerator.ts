// src/utils/referenceMapGenerator.ts
import * as THREE from 'three';
import type { Tile, BiomeType } from '../types/world';

/**
 * ReferenceMapGenerator creates terrain data from an image reference
 */
export class ReferenceMapGenerator {
  private colorToBiomeMap: Map<string, BiomeType>;
  private heightMap: Map<BiomeType, number>;
  
  constructor() {
    this.initializeColorMapping();
    this.initializeHeightMapping();
  }
  
  /**
   * Initialize the mapping from colors to biome types
   */
  private initializeColorMapping() {
    // Map from color hex strings to biome types
    this.colorToBiomeMap = new Map<string, BiomeType>([
      // Water features (blues)
      ['#0D47A1', 'deep_ocean'],    // Dark blue
      ['#1565C0', 'ocean'],         // Medium blue
      ['#1976D2', 'shallow_water'], // Light blue
      ['#2196F3', 'river'],         // Bright blue
      ['#42A5F5', 'lake'],          // Very light blue
      
      // Beaches and shores (yellows and grays)
      ['#FFD54F', 'beach'],         // Sand yellow
      ['#9E9E9E', 'rocky_shore'],   // Gray
      
      // Forests (greens)
      ['#7CB342', 'grassland'],         // Light green
      ['#388E3C', 'deciduous_forest'],  // Medium green
      ['#1B5E20', 'coniferous_forest'], // Dark green
      ['#558B2F', 'taiga'],             // Blue-green
      ['#33691E', 'swamp'],             // Dark green-brown
      ['#2E7D32', 'rainforest'],        // Rich green
      ['#43A047', 'tropical_forest'],   // Bright green
      ['#26A69A', 'enchanted_forest'],  // Teal
      
      // Elevated terrain (greens and grays)
      ['#689F38', 'hills'],         // Light olive green
      ['#757575', 'mountains'],     // Gray
      
      // Cold regions (grays and whites)
      ['#9E9E9E', 'tundra'],        // Light gray
      ['#EEEEEE', 'snow'],          // Very light gray/white
      ['#BBDEFB', 'ice'],           // Very light blue
      ['#B3E5FC', 'glacier'],       // Ice blue
      
      // Arid regions (yellows and oranges)
      ['#FFD54F', 'desert'],        // Yellow
      ['#CDDC39', 'savanna'],       // Yellow-green
      ['#D84315', 'mesa'],          // Orange-brown
      ['#E65100', 'badlands'],      // Dark orange
      
      // Special biomes
      ['#6A1B9A', 'volcanic'],      // Purple
      ['#4A148C', 'corrupted'],     // Dark purple
      ['#80DEEA', 'sky_island']     // Light cyan
    ]);
  }
  
  /**
   * Initialize the mapping from biome types to height values
   */
  private initializeHeightMapping() {
    this.heightMap = new Map<BiomeType, number>([
      // Water features (below sea level)
      ['deep_ocean', -0.7],
      ['ocean', -0.5],
      ['shallow_water', -0.2],
      ['river', -0.1],
      ['lake', -0.15],
      
      // Sea level
      ['beach', 0.0],
      ['rocky_shore', 0.05],
      
      // Flat lands (slightly above sea level)
      ['grassland', 0.1],
      ['deciduous_forest', 0.15],
      ['coniferous_forest', 0.2],
      ['swamp', 0.05],
      ['marsh', 0.05],
      ['rainforest', 0.2],
      ['tropical_forest', 0.15],
      ['enchanted_forest', 0.25],
      
      // Arid regions (slightly higher)
      ['desert', 0.2],
      ['savanna', 0.15],
      ['mesa', 0.4],
      ['badlands', 0.35],
      
      // Cold regions (variable heights)
      ['taiga', 0.3],
      ['tundra', 0.25],
      ['snow', 0.4],
      ['ice', -0.05],
      ['glacier', 0.6],
      
      // Elevated terrain
      ['hills', 0.4],
      ['mountains', 0.7],
      
      // Special biomes
      ['volcanic', 0.8],
      ['corrupted', 0.3],
      ['sky_island', 1.0]
    ]);
  }
  
  /**
   * Get the closest biome type based on a color
   */
  private getClosestBiome(color: THREE.Color): BiomeType {
    // Convert the input color to hex format
    const hexColor = '#' + color.getHexString();
    
    // First try exact match
    const exactBiome = this.colorToBiomeMap.get(hexColor.toUpperCase());
    if (exactBiome) {
      return exactBiome;
    }
    
    // If no exact match, find the closest color
    let closestBiome: BiomeType = 'grassland'; // Default
    let minDistance = Infinity;
    
    // Convert hex color to r,g,b values for distance calculation
    const r1 = parseInt(hexColor.substring(1, 3), 16) / 255;
    const g1 = parseInt(hexColor.substring(3, 5), 16) / 255;
    const b1 = parseInt(hexColor.substring(5, 7), 16) / 255;
    
    this.colorToBiomeMap.forEach((biome, biomeHexColor) => {
      const r2 = parseInt(biomeHexColor.substring(1, 3), 16) / 255;
      const g2 = parseInt(biomeHexColor.substring(3, 5), 16) / 255;
      const b2 = parseInt(biomeHexColor.substring(5, 7), 16) / 255;
      
      // Calculate color distance (Euclidean distance in RGB space)
      const distance = Math.sqrt(
        Math.pow(r2 - r1, 2) +
        Math.pow(g2 - g1, 2) +
        Math.pow(b2 - b1, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        closestBiome = biome;
      }
    });
    
    return closestBiome;
  }
  
  /**
   * Generate tiles from a reference map image
   */
  public async generateTilesFromImage(
    imageUrl: string, 
    mapSize: number,
    seed: string,
    useHeightVariation: boolean = true
  ): Promise<Tile[][]> {
    return new Promise((resolve, reject) => {
      // Create an image element to load the reference map
      const img = new Image();
      
      img.onload = () => {
        // Create a canvas to access pixel data
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        if (!context) {
          reject(new Error('Could not create canvas context'));
          return;
        }
        
        // Set canvas size to match the image
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Draw the image to the canvas
        context.drawImage(img, 0, 0);
        
        // Get the image data
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const { data } = imageData;
        
        // Create the tilesData structure
        const tiles: Tile[][] = [];
        
        // Create a seeded random number generator
        const seededRandom = new Math.seedrandom(seed);
        
        // Determine scaling factors if the image size doesn't match the desired map size
        const scaleX = canvas.width / mapSize;
        const scaleY = canvas.height / mapSize;
        
        // Generate tiles based on image data
        for (let y = 0; y < mapSize; y++) {
          tiles[y] = [];
          
          for (let x = 0; x < mapSize; x++) {
            // Find the corresponding pixel in the image
            const pixelX = Math.floor(x * scaleX);
            const pixelY = Math.floor(y * scaleY);
            
            // Get pixel index in the data array (each pixel has 4 values: R, G, B, A)
            const pixelIndex = (pixelY * canvas.width + pixelX) * 4;
            
            // Extract color values
            const r = data[pixelIndex] / 255;
            const g = data[pixelIndex + 1] / 255;
            const b = data[pixelIndex + 2] / 255;
            
            // Create a Three.js color from the pixel values
            const color = new THREE.Color(r, g, b);
            
            // Determine biome type based on color
            const biomeType = this.getClosestBiome(color);
            
            // Get base height from the biome type
            let baseHeight = this.heightMap.get(biomeType) || 0;
            
            // Add some noise to height if variation is enabled
            if (useHeightVariation) {
              // Add -10% to +10% random height variation
              const heightVariation = (seededRandom() * 0.2) - 0.1;
              baseHeight += heightVariation;
            }
            
            // Cap the height between -1 and 1
            baseHeight = Math.max(-1, Math.min(1, baseHeight));
            
            // Create the tile
            tiles[y][x] = {
              x,
              y,
              type: biomeType,
              baseHeight,          // Raw height (-1 to 1)
              scaledHeight: baseHeight, // Will be adjusted later if needed
              elevation: Math.max(0, baseHeight + 1) / 2, // Normalized elevation (0 to 1)
              moisture: 0.5,       // Default moisture
              temperature: 0.5,    // Default temperature
              fertility: 0.5,      // Default fertility
              resources: [],       // No resources by default
              structure: null,     // No structure by default
              entities: []         // No entities by default
            };
          }
        }
        
        // Resolve with the generated tiles
        resolve(tiles);
      };
      
      img.onerror = () => {
        reject(new Error(`Failed to load reference map: ${imageUrl}`));
      };
      
      // Set the image source to start loading
      img.crossOrigin = "Anonymous"; // Handle cross-origin issues
      img.src = imageUrl;
    });
  }
}
