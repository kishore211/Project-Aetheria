// src/utils/terrainVisualizer.ts
import * as THREE from 'three';
import { BiomeType, Tile } from '../types/world';

/**
 * Handles rendering the terrain with pixelated Minecraft-like textures
 */
export class TerrainVisualizer {
  private textureLoader: THREE.TextureLoader;
  private textures: Record<string, THREE.Texture>;

  constructor() {
    this.textureLoader = new THREE.TextureLoader();
    this.textures = {};
    this.loadTextures();
  }
  
  /**
   * Load Minecraft textures from examples folder
   */
  private loadTextures(): void {
    // Load individual textures
    const textureUrls = {
      grass: '/examples/textures/minecraft/grass.png',
      dirt: '/examples/textures/minecraft/dirt.png',
      grass_dirt: '/examples/textures/minecraft/grass_dirt.png',
      atlas: '/examples/textures/minecraft/atlas.png',
      water: '/examples/textures/lava/cloud.png',
      sand: '/examples/textures/grid.png',
      snow: '/examples/textures/cm_gray.png',
      stone: '/examples/textures/noise.png',
    };
    
    // Load each texture
    for (const [key, url] of Object.entries(textureUrls)) {
      const texture = this.textureLoader.load(url);
      
      // Configure texture for pixelated rendering
      texture.magFilter = THREE.NearestFilter; 
      texture.minFilter = THREE.NearestFilter;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1, 1);
      
      this.textures[key] = texture;
    }
    
    // Set up texture atlas (using individual textures instead of an atlas for simplicity)
  }
  
  /**
   * Create a terrain material based on biome type
   */
  public createTerrainMaterial(biomeType: BiomeType): THREE.Material {
    // Pick the appropriate texture based on biome
    let texture: THREE.Texture;
    
    switch (biomeType) {
      case 'grassland':
      case 'deciduous_forest':
      case 'coniferous_forest':
        texture = this.textures.grass_dirt || this.textures.grass;
        break;
        
      case 'desert':
      case 'savanna':
      case 'mesa':
      case 'beach':
        texture = this.textures.sand;
        break;
        
      case 'deep_ocean':
      case 'ocean':
      case 'shallow_water':
      case 'river':
      case 'lake':
        texture = this.textures.water;
        break;
        
      case 'tundra':
      case 'snow':
      case 'ice':
      case 'glacier':
        texture = this.textures.snow;
        break;
        
      case 'hills':
      case 'mountains':
      case 'rocky_shore':
        texture = this.textures.stone;
        break;
        
      default:
        texture = this.textures.grass;
    }
    
    // Create material with the selected texture
    return new THREE.MeshLambertMaterial({
      map: texture,
      transparent: biomeType.includes('water'),
      side: THREE.DoubleSide
    });
  }
  
  /**
   * Create a terrain mesh for a tile
   */
  public createTerrainTile(tile: Tile, tileSize: number, heightMultiplier: number): THREE.Mesh {
    // Create geometry for the tile
    const geometry = new THREE.PlaneGeometry(tileSize, tileSize, 1, 1);
    
    // Rotate to face up
    geometry.rotateX(-Math.PI / 2);
    
    // Create material based on biome
    const material = this.createTerrainMaterial(tile.type);
    
    // Create the mesh
    const mesh = new THREE.Mesh(geometry, material);
    
    // Position at the tile coordinates
    mesh.position.set(
      tile.x * tileSize,
      tile.scaledHeight * heightMultiplier,
      tile.y * tileSize
    );
    
    // Add metadata for interaction
    mesh.userData.tileX = tile.x;
    mesh.userData.tileY = tile.y;
    mesh.userData.biomeType = tile.type;
    
    return mesh;
  }
  
  /**
   * Create a water tile with animated texture
   */
  public createWaterTile(tile: Tile, tileSize: number): THREE.Mesh {
    // Create geometry
    const geometry = new THREE.PlaneGeometry(tileSize, tileSize, 1, 1);
    geometry.rotateX(-Math.PI / 2);
    
    // Special water material with animation
    const material = new THREE.MeshPhongMaterial({
      map: this.textures.water,
      transparent: true,
      opacity: 0.8,
      color: 0x3388ff,
      side: THREE.DoubleSide,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    
    // Position slightly above the actual terrain height to avoid z-fighting
    const waterHeight = tile.type === 'deep_ocean' ? 0.05 : 
                         tile.type === 'ocean' ? 0.1 : 0.15;
    
    mesh.position.set(
      tile.x * tileSize,
      waterHeight,
      tile.y * tileSize
    );
    
    mesh.userData.tileX = tile.x;
    mesh.userData.tileY = tile.y;
    mesh.userData.biomeType = tile.type;
    mesh.userData.isWater = true;
    
    return mesh;
  }
  
  /**
   * Create a simple structure on a tile (tree, rock, etc.)
   */
  public createStructure(
    structureType: string, 
    position: { x: number, y: number }, 
    height: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    switch (structureType) {
      case 'sapling':
      case 'young_tree':
      case 'mature_tree':
      case 'ancient_tree':
        group.add(this.createTree(structureType, position, height));
        break;
      case 'rock_outcrop':
      case 'boulder':
        group.add(this.createRock(structureType, position, height));
        break;
      case 'bush':
        group.add(this.createBush(position, height));
        break;
      // More structure types could be added here
    }
    
    return group;
  }
  
  /**
   * Create a pixelated tree
   */
  private createTree(type: string, position: { x: number, y: number }, height: number): THREE.Group {
    const group = new THREE.Group();
    
    // Adjust tree size based on type
    let trunkHeight = 0.5;
    let leavesSize = 0.8;
    
    switch (type) {
      case 'sapling':
        trunkHeight = 0.2;
        leavesSize = 0.3;
        break;
      case 'young_tree':
        trunkHeight = 0.4;
        leavesSize = 0.6;
        break;
      case 'mature_tree':
        trunkHeight = 0.8;
        leavesSize = 1.0;
        break;
      case 'ancient_tree':
        trunkHeight = 1.2;
        leavesSize = 1.5;
        break;
    }
    
    // Create trunk (brown cube)
    const trunkGeometry = new THREE.BoxGeometry(0.1, trunkHeight, 0.1);
    const trunkMaterial = new THREE.MeshLambertMaterial({ 
      map: this.textures.dirt,
      color: 0x8B4513 // Brown
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(position.x, height + trunkHeight / 2, position.y);
    
    // Create leaves (green cube)
    const leavesGeometry = new THREE.BoxGeometry(leavesSize, leavesSize, leavesSize);
    const leavesMaterial = new THREE.MeshLambertMaterial({ 
      map: this.textures.grass, 
      color: 0x228B22, // Forest green
      transparent: true,
      alphaTest: 0.5
    });
    const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
    leaves.position.set(position.x, height + trunkHeight + leavesSize / 3, position.y);
    
    // Add to group
    group.add(trunk);
    group.add(leaves);
    
    return group;
  }
  
  /**
   * Create a pixelated rock
   */
  private createRock(type: string, position: { x: number, y: number }, height: number): THREE.Group {
    const group = new THREE.Group();
    
    // Adjust rock size based on type
    let rockSize = type === 'boulder' ? 0.5 : 0.3;
    
    // Create rock geometry
    const rockGeometry = new THREE.BoxGeometry(rockSize, rockSize, rockSize);
    const rockMaterial = new THREE.MeshLambertMaterial({ 
      map: this.textures.stone,
      color: 0x888888
    });
    const rock = new THREE.Mesh(rockGeometry, rockMaterial);
    rock.position.set(position.x, height + rockSize / 2, position.y);
    
    // Add to group
    group.add(rock);
    
    return group;
  }
  
  /**
   * Create a pixelated bush
   */
  private createBush(position: { x: number, y: number }, height: number): THREE.Group {
    const group = new THREE.Group();
    
    // Bush size
    const bushSize = 0.4;
    
    // Create bush geometry
    const bushGeometry = new THREE.BoxGeometry(bushSize, bushSize, bushSize);
    const bushMaterial = new THREE.MeshLambertMaterial({ 
      map: this.textures.grass,
      color: 0x228B22, // Forest green
      transparent: true,
      alphaTest: 0.5
    });
    const bush = new THREE.Mesh(bushGeometry, bushMaterial);
    bush.position.set(position.x, height + bushSize / 2, position.y);
    
    // Add to group
    group.add(bush);
    
    return group;
  }
  
  /**
   * Create a marker for resources on a tile
   */
  public createResourceMarker(
    resourceType: string, 
    position: { x: number, y: number }, 
    height: number
  ): THREE.Sprite {
    // Create a billboard sprite for the resource
    const spriteMap = new THREE.TextureLoader().load('/examples/textures/sprites/circle.png');
    
    let color: THREE.Color;
    
    switch (resourceType) {
      case 'wood':
        color = new THREE.Color(0x8B4513); // Brown
        break;
      case 'stone':
        color = new THREE.Color(0x888888); // Gray
        break;
      case 'food':
        color = new THREE.Color(0xFFD700); // Gold
        break;
      case 'iron':
        color = new THREE.Color(0xCC8866); // Rusty
        break;
      case 'gold':
        color = new THREE.Color(0xFFD700); // Gold
        break;
      case 'mana':
        color = new THREE.Color(0x8A2BE2); // Purple
        break;
      default:
        color = new THREE.Color(0xFFFFFF); // White
    }
    
    const spriteMaterial = new THREE.SpriteMaterial({ 
      map: spriteMap,
      color: color,
      transparent: true,
      opacity: 0.8
    });
    
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(0.3, 0.3, 1);
    sprite.position.set(position.x, height + 0.3, position.y);
    
    return sprite;
  }
  
  /**
   * Update water animation (call in render loop)
   */
  public updateWaterAnimation(time: number): void {
    if (this.textures.water) {
      // Animate water by shifting texture coordinates
      this.textures.water.offset.x = Math.sin(time * 0.1) * 0.05;
      this.textures.water.offset.y = Math.cos(time * 0.1) * 0.05;
    }
  }
}
