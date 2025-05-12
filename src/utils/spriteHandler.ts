// src/utils/spriteHandler.ts
import * as THREE from 'three';
import { 
  DEFAULT_ENTITY_SPRITE,
  HUMAN_SPRITE,
  WOLF_SPRITE, 
  DEER_SPRITE,
  RABBIT_SPRITE
} from '../assets/textures/entities/entitySprites';

/**
 * SpriteData contains information for loading and using sprite textures
 */
export interface SpriteData {
  textureUrl: string;           // Path to the sprite texture
  columns: number;              // Number of columns in the sprite sheet
  rows: number;                 // Number of rows in the sprite sheet
  totalFrames: number;          // Total number of frames
  animationFPS: number;         // Frames per second for animation
  animations?: {                // Named animations
    [key: string]: {
      startFrame: number;       // First frame of the animation
      endFrame: number;         // Last frame of the animation
      loop?: boolean;           // Whether the animation should loop
    }
  };
}

/**
 * Default sprite data for entities when specific texture is not available
 */
export const DEFAULT_SPRITE: SpriteData = {
  textureUrl: '/assets/textures/entities/default.png',
  columns: 1,
  rows: 1,
  totalFrames: 1,
  animationFPS: 0
};

// Sprite data for single-image sprites from examples
export const EXAMPLE_SPRITES: Record<string, SpriteData> = {
  human: {
    textureUrl: '/assets/textures/entities/human.png',
    columns: 1,
    rows: 1,
    totalFrames: 1,
    animationFPS: 0,
    animations: {
      idle: { startFrame: 0, endFrame: 0, loop: true },
      walk: { startFrame: 0, endFrame: 0, loop: true },
      attack: { startFrame: 0, endFrame: 0, loop: false },
      hurt: { startFrame: 0, endFrame: 0, loop: false }
    }
  },
  wolf: {
    textureUrl: '/assets/textures/entities/wolf.png',
    columns: 1,
    rows: 1,
    totalFrames: 1,
    animationFPS: 0,
    animations: {
      idle: { startFrame: 0, endFrame: 0, loop: true },
      walk: { startFrame: 0, endFrame: 0, loop: true },
      attack: { startFrame: 0, endFrame: 0, loop: false },
      hurt: { startFrame: 0, endFrame: 0, loop: false }
    }
  },
  deer: {
    textureUrl: '/assets/textures/entities/deer.png',
    columns: 1,
    rows: 1,
    totalFrames: 1,
    animationFPS: 0,
    animations: {
      idle: { startFrame: 0, endFrame: 0, loop: true },
      walk: { startFrame: 0, endFrame: 0, loop: true },
      flee: { startFrame: 0, endFrame: 0, loop: true },
      hurt: { startFrame: 0, endFrame: 0, loop: false }
    }
  },
  rabbit: {
    textureUrl: '/assets/textures/entities/rabbit.png',
    columns: 1,
    rows: 1,
    totalFrames: 1,
    animationFPS: 0,
    animations: {
      idle: { startFrame: 0, endFrame: 0, loop: true },
      walk: { startFrame: 0, endFrame: 0, loop: true },
      flee: { startFrame: 0, endFrame: 0, loop: true },
      hurt: { startFrame: 0, endFrame: 0, loop: false }
    }
  }
};

/**
 * Map of entity types to their sprite data
 */
export const ENTITY_SPRITES: Record<string, SpriteData> = {
  human: {
    textureUrl: '/assets/textures/entities/human.png',
    columns: 4,
    rows: 4,
    totalFrames: 16,
    animationFPS: 8,
    animations: {
      idle: { startFrame: 0, endFrame: 3, loop: true },
      walk: { startFrame: 4, endFrame: 7, loop: true },
      attack: { startFrame: 8, endFrame: 11, loop: false },
      hurt: { startFrame: 12, endFrame: 15, loop: false }
    }
  },
  elf: {
    textureUrl: '/assets/textures/entities/elf.png',
    columns: 4,
    rows: 4,
    totalFrames: 16,
    animationFPS: 8,
    animations: {
      idle: { startFrame: 0, endFrame: 3, loop: true },
      walk: { startFrame: 4, endFrame: 7, loop: true },
      attack: { startFrame: 8, endFrame: 11, loop: false },
      hurt: { startFrame: 12, endFrame: 15, loop: false }
    }
  },
  wolf: {
    textureUrl: '/assets/textures/entities/wolf.png',
    columns: 4,
    rows: 4,
    totalFrames: 16,
    animationFPS: 10,
    animations: {
      idle: { startFrame: 0, endFrame: 3, loop: true },
      walk: { startFrame: 4, endFrame: 7, loop: true },
      attack: { startFrame: 8, endFrame: 11, loop: false },
      hurt: { startFrame: 12, endFrame: 15, loop: false }
    }
  },
  deer: {
    textureUrl: '/assets/textures/entities/deer.png',
    columns: 4,
    rows: 4,
    totalFrames: 16,
    animationFPS: 8,
    animations: {
      idle: { startFrame: 0, endFrame: 3, loop: true },
      walk: { startFrame: 4, endFrame: 7, loop: true },
      flee: { startFrame: 8, endFrame: 11, loop: true },
      hurt: { startFrame: 12, endFrame: 15, loop: false }
    }
  },
  rabbit: {
    textureUrl: '/assets/textures/entities/rabbit.png',
    columns: 4,
    rows: 4,
    totalFrames: 16,
    animationFPS: 12,
    animations: {
      idle: { startFrame: 0, endFrame: 3, loop: true },
      walk: { startFrame: 4, endFrame: 7, loop: true },
      flee: { startFrame: 8, endFrame: 11, loop: true },
      hurt: { startFrame: 12, endFrame: 15, loop: false }
    }
  },
  bird: {
    textureUrl: '/assets/textures/entities/bird.png',
    columns: 4,
    rows: 4,
    totalFrames: 16,
    animationFPS: 12,
    animations: {
      idle: { startFrame: 0, endFrame: 3, loop: true },
      fly: { startFrame: 4, endFrame: 7, loop: true },
      peck: { startFrame: 8, endFrame: 11, loop: false },
      hurt: { startFrame: 12, endFrame: 15, loop: false }
    }
  },
  dragon: {
    textureUrl: '/assets/textures/entities/dragon.png',
    columns: 4,
    rows: 4,
    totalFrames: 16,
    animationFPS: 8,
    animations: {
      idle: { startFrame: 0, endFrame: 3, loop: true },
      fly: { startFrame: 4, endFrame: 7, loop: true },
      attack: { startFrame: 8, endFrame: 11, loop: false },
      fireball: { startFrame: 12, endFrame: 15, loop: false }
    }
  }
};

// Texture cache to avoid reloading the same textures
const textureCache: Map<string, THREE.Texture> = new Map();

/**
 * Load a texture with caching
 */
export function loadTexture(url: string): THREE.Texture {
  if (textureCache.has(url)) {
    const cachedTexture = textureCache.get(url);
    if (cachedTexture) return cachedTexture;
  }
  
  // Create texture loader
  const loader = new THREE.TextureLoader();
  
  // Set default texture while loading
  const placeholder = new THREE.Texture();
  textureCache.set(url, placeholder);
  
  // Start async loading
  loader.load(
    url,
    (loadedTexture) => {
      // Configure texture for pixel art
      loadedTexture.magFilter = THREE.NearestFilter; // Prevents blurry textures
      loadedTexture.minFilter = THREE.NearestFilter;
      loadedTexture.needsUpdate = true;
      
      // Update cache with actual texture
      textureCache.set(url, loadedTexture);
    },
    undefined,
    (error) => {
      console.error(`Error loading texture ${url}:`, error);
    }
  );
  
  return placeholder;
}

/**
 * Create a sprite material with the proper texture coordinates
 */
export function createSpriteMaterial(spriteData: SpriteData, frame: number = 0): THREE.SpriteMaterial {
  const texture = loadTexture(spriteData.textureUrl);
  
  // Calculate UV coordinates for the frame
  const frameCol = frame % spriteData.columns;
  const frameRow = Math.floor(frame / spriteData.columns);
  
  const uvOffsetX = frameCol / spriteData.columns;
  const uvOffsetY = 1 - (frameRow + 1) / spriteData.rows; // Y is inverted in UV space
  const uvSizeX = 1 / spriteData.columns;
  const uvSizeY = 1 / spriteData.rows;
  
  // Apply texture offset and scale for the sprite frame
  texture.offset.set(uvOffsetX, uvOffsetY);
  texture.repeat.set(uvSizeX, uvSizeY);
  
  return new THREE.SpriteMaterial({ 
    map: texture,
    transparent: true,
    alphaTest: 0.1 // Allows transparent pixels
  });
}

/**
 * Create a billboard plane that always faces the camera
 */
export function createBillboardSprite(spriteData: SpriteData, frame: number = 0, scale: number = 1): THREE.Sprite {
  const material = createSpriteMaterial(spriteData, frame);
  const sprite = new THREE.Sprite(material);
  
  // Set size based on scale
  sprite.scale.set(scale, scale, 1);
  
  return sprite;
}

/**
 * Animates a sprite by updating its texture coordinate
 */
export function animateSprite(
  sprite: THREE.Sprite, 
  spriteData: SpriteData,
  animation: string | null = null,
  deltaTime = 0,
  currentFrame = 0
) {
  if (!animation || !spriteData.animations?.[animation]) {
    return currentFrame; // No animation to play
  }
  
  const anim = spriteData.animations[animation];
  const frameCount = anim.endFrame - anim.startFrame + 1;
  
  // Calculate the new frame based on deltaTime and FPS
  const frameAdvance = deltaTime * spriteData.animationFPS;
  let nextFrame = currentFrame + frameAdvance;
  
  // Handle animation looping or completion
  if (nextFrame > anim.endFrame) {
    if (anim.loop) {
      // Loop back to beginning
      nextFrame = anim.startFrame + (nextFrame - anim.endFrame - 1) % frameCount;
    } else {
      // Stop at last frame
      nextFrame = anim.endFrame;
    }
  }
  
  // Update sprite material with new frame
  if (Math.floor(nextFrame) !== Math.floor(currentFrame)) {
    const material = sprite.material as THREE.SpriteMaterial;
    if (material && material.map) {
      const frameCol = Math.floor(nextFrame) % spriteData.columns;
      const frameRow = Math.floor(Math.floor(nextFrame) / spriteData.columns);
      
      const uvOffsetX = frameCol / spriteData.columns;
      const uvOffsetY = 1 - (frameRow + 1) / spriteData.rows; // Y is inverted in UV space
      
      material.map?.offset.set(uvOffsetX, uvOffsetY);
    }
  }
  
  return nextFrame;
}

/**
 * Create a placeholder sprite for entities without specific textures
 */
export function createPlaceholderSprite(color: number, scale: number = 1): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Convert hex color to RGB
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;
    
    // Draw a simple pixelated shape
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, 16, 16);
    
    // Add some pixel details
    ctx.fillStyle = `rgb(${Math.min(255, r + 40)},${Math.min(255, g + 40)},${Math.min(255, b + 40)})`;
    ctx.fillRect(2, 2, 12, 2); // Head
    ctx.fillRect(4, 4, 8, 8);  // Body
    ctx.fillRect(4, 12, 2, 4); // Left leg
    ctx.fillRect(10, 12, 2, 4); // Right leg
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true
  });
  
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale, scale, 1);
  
  return sprite;
}

/**
 * Get the appropriate animation name based on entity status
 */
export function getAnimationForEntityStatus(
  entity: { status: string[] },
  defaultAnimation = 'idle'
): string {
  // Priority order for animations
  if (entity.status.includes('dead')) {
    return 'hurt'; // Use hurt animation for dead entities
  } 
  
  if (entity.status.includes('attacking')) {
    return 'attack';
  }
  
  if (entity.status.includes('wounded')) {
    return 'hurt';
  }
  
  if (entity.status.includes('fleeing')) {
    return 'flee'; // Some entities have flee, others use walk
  }
  
  if (entity.status.includes('moving')) {
    return 'walk';
  }
  
  // Default to idle animation
  return defaultAnimation;
}

/**
 * Get appropriate sprite data for an entity type
 */
export function getSpriteDataForEntity(entityType: string): SpriteData {
  // First try to get from the standard sprite sheets
  if (ENTITY_SPRITES[entityType]) {
    return ENTITY_SPRITES[entityType];
  }
  
  // Then check the example sprites 
  if (EXAMPLE_SPRITES[entityType]) {
    return EXAMPLE_SPRITES[entityType];
  }
  
  // Fall back to default
  return DEFAULT_SPRITE;
}

/**
 * Tries to load a sprite texture from the file path, falls back to base64 encoded version
 */
export function loadSpriteTextureWithFallback(entityType: string): THREE.Texture {
  const textureLoader = new THREE.TextureLoader();
  let texture: THREE.Texture;
  
  // Try to load the file path version first
  const filePath = `/assets/textures/entities/${entityType}.png`;
  
  // Get any corresponding base64 fallback
  let fallbackBase64: string | null = null;
  switch (entityType) {
    case 'human':
    case 'elf':
    case 'dwarf':
    case 'orc':
    case 'bandit':
      fallbackBase64 = HUMAN_SPRITE;
      break;
    case 'wolf':
    case 'bear':
      fallbackBase64 = WOLF_SPRITE;
      break;
    case 'deer':
      fallbackBase64 = DEER_SPRITE;
      break;
    case 'rabbit':
      fallbackBase64 = RABBIT_SPRITE;
      break;
    default:
      // No fallback available
      break;
  }
  
  // Try loading the file
  try {
    texture = textureLoader.load(filePath, 
      // Success callback
      (loadedTexture) => {
        // Configure texture for pixel art
        loadedTexture.magFilter = THREE.NearestFilter;
        loadedTexture.minFilter = THREE.NearestFilter;
      },
      // Progress callback
      undefined,
      // Error callback - fallback to base64
      () => {
        console.log(`Failed to load ${filePath}, using fallback`);
        if (fallbackBase64) {
          const fallbackTexture = textureLoader.load(fallbackBase64);
          fallbackTexture.magFilter = THREE.NearestFilter;
          fallbackTexture.minFilter = THREE.NearestFilter;
          return fallbackTexture;
        }
      }
    );
    
    // Configure texture for pixel art
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    
    return texture;
  } catch (error) {
    // If loading fails for any reason, use the fallback
    if (fallbackBase64) {
      texture = textureLoader.load(fallbackBase64);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      return texture;
    }
    
    // If no fallback, create a plain color texture
    const color = getEntityColorHex(entityType);
    return createPlainColorTexture(color);
  }
}

/**
 * Get entity color as hex value for use in fallback textures
 */
function getEntityColorHex(type: string): number {
  // Choose color based on entity type
  const colorMap: Record<string, number> = {
    human: 0xe0ac69,     // Tan
    elf: 0xc2e085,       // Light green
    dwarf: 0xad6f3b,     // Brown
    orc: 0x758a52,       // Olive green
    wolf: 0x808080,      // Gray
    bear: 0x8b4513,      // Brown
    deer: 0xd2b48c,      // Tan
    rabbit: 0xffffff,    // White
    bird: 0x00aaff,      // Blue
    fish: 0x80cbc4,      // Teal
    dragon: 0xff4444,    // Red
    demon: 0x8b0000,     // Dark red
    zombie: 0x95a561,    // Greenish gray
    skeleton: 0xf5f5dc,  // Bone
    elemental: 0x00ffaa, // Bright cyan
    bandit: 0x424242     // Dark gray
  };
  
  return colorMap[type] || 0xffffff; // White as default
}

/**
 * Create a plain colored texture for entities with no sprite
 */
function createPlainColorTexture(color: number): THREE.Texture {
  // Create a canvas to draw on
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  
  // Draw a simple shape
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Convert hex color to RGB
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;
    
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, 16, 16);
  }
  
  // Create texture from canvas
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  
  return texture;
}

/**
 * Apply visual effects to a sprite based on entity status
 */
export function applyStatusEffectsToSprite(
  sprite: THREE.Sprite,
  entity: { status: string[] }
): void {
  if (!sprite.material || !(sprite.material instanceof THREE.SpriteMaterial)) {
    return;
  }

  const material = sprite.material;
  
  // Reset first
  material.opacity = 1.0;
  material.color.set(0xffffff);
  
  // Apply effects based on status
  if (entity.status.includes('dead')) {
    // Dead entities are grayscale and semi-transparent
    material.color.set(0x888888);
    material.opacity = 0.7;
    // For dead entities, adjust their scale instead of rotation (rotation is read-only)
    sprite.scale.y = Math.abs(sprite.scale.y) * 0.7;
  }
  else if (entity.status.includes('sleeping')) {
    // Sleeping entities are slightly darker
    material.color.set(0xdddddd);
  }
  else if (entity.status.includes('wounded') || entity.status.includes('bleeding')) {
    // Wounded entities have a red tint
    material.color.set(0xff8888);
  }
  else if (entity.status.includes('poisoned')) {
    // Poisoned entities have a green tint
    material.color.set(0x88ff88);
  }
  else if (entity.status.includes('frozen')) {
    // Frozen entities have a blue tint
    material.color.set(0x8888ff);
  }
  else if (entity.status.includes('blessed') || entity.status.includes('healing')) {
    // Blessed entities have a golden glow
    material.color.set(0xffffaa);
  }
  else if (entity.status.includes('attacking')) {
    // Attacking entities have a slight red tint
    material.color.set(0xffaaaa);
  }
}

/**
 * Flip sprite horizontally based on movement direction
 */
export function updateSpriteDirection(
  sprite: THREE.Sprite,
  entity: { position: { x: number; y: number }; lastPosition?: { x: number; y: number } }
): void {
  if (!entity.lastPosition) return;
  
  // Calculate movement direction
  const dx = entity.position.x - entity.lastPosition.x;
  
  // Only flip if there's significant horizontal movement
  if (Math.abs(dx) > 0.01) {
    // Flip the sprite by scaling
    if (dx < 0) {
      // Moving left
      sprite.scale.x = -Math.abs(sprite.scale.x);
    } else {
      // Moving right
      sprite.scale.x = Math.abs(sprite.scale.x);
    }
  }
}

/**
 * Add visual effects to the scene based on entity status
 * Returns any particle IDs created
 */
export function createStatusEffectParticles(
  entity: { status: string[]; position: { x: number; y: number } },
  particleSystem: any  // Avoiding circular import with ParticleSystem type
): string[] {
  if (!particleSystem) return [];
  
  const particleIds: string[] = [];
  
  // Create different particles based on status
  if (entity.status.includes('bleeding') || entity.status.includes('wounded')) {
    const id = particleSystem.createEffect(
      'blood',
      { x: entity.position.x, y: entity.position.y, z: 0.2 },
      0.8
    );
    if (id) particleIds.push(id);
  }
  
  if (entity.status.includes('healing')) {
    const id = particleSystem.createHealingEffect({
      x: entity.position.x,
      y: entity.position.y
    });
    if (id) particleIds.push(id);
  }
  
  if (entity.status.includes('attacking')) {
    // Create sparks at a slight offset in attack direction
    const id = particleSystem.createEffect(
      'sparks',
      { x: entity.position.x + 0.2, y: entity.position.y, z: 0.3 },
      0.5
    );
    if (id) particleIds.push(id);
  }
  
  if (entity.status.includes('magic') || entity.status.includes('spellcasting')) {
    const id = particleSystem.createMagicEffect({
      x: entity.position.x,
      y: entity.position.y
    });
    if (id) particleIds.push(id);
  }
  
  // Return IDs of created particles
  return particleIds;
}
