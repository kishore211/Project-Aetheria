// src/utils/entitySystemMinimal.ts
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import {
  Entity,
  EntityType,
  Tile,
} from '../types/world';
import {
  getAnimationForEntityStatus,
} from './spriteHandler';
import { getPixelSpriteTexture, getPixelSpriteFrames } from './pixelSprites';
import { findPath, isWalkableForEntity } from './pathfinding';

/**
 * AI States for entities
 */
export type AIState =
  | 'idle'
  | 'moving'
  | 'gathering'
  | 'hunting'
  | 'fleeing'
  | 'building'
  | 'fighting'
  | 'sleeping'
  | 'dying'
  | 'reproducing';

// Predator-Prey relationships
export const FOOD_CHAIN: Record<EntityType, EntityType[]> = {
  human: ['rabbit', 'deer', 'fish'],
  elf: ['fish', 'deer'],
  dwarf: ['fish'],
  orc: ['human', 'elf', 'rabbit', 'deer', 'fish'],
  wolf: ['rabbit', 'deer'],
  bear: ['fish', 'rabbit', 'deer', 'human'],
  deer: [],
  rabbit: [],
  bird: [],
  fish: [],
  dragon: ['human', 'elf', 'dwarf', 'orc', 'wolf', 'bear', 'deer', 'rabbit'],
  demon: ['human', 'elf', 'dwarf', 'orc'],
  zombie: ['human', 'elf', 'dwarf', 'orc'],
  skeleton: ['human', 'elf', 'dwarf'],
  elemental: [],
  bandit: ['human', 'elf']
};

// Entity personality traits that affect behavior
export interface EntityPersonality {
  aggression: number; // 0-1: How likely to attack or be territorial
  curiosity: number; // 0-1: How likely to explore new areas
  sociality: number; // 0-1: How much they seek out others of their kind
  caution: number; // 0-1: How risk-averse they are
}

/**
 * Generate a name for an entity based on type
 */
function generateEntityName(type: EntityType): string {
  // Name lists by race/type
  const names: Record<EntityType, string[]> = {
    human: ['Alex', 'Jamie', 'Morgan', 'Taylor', 'Jordan', 'Casey', 'Robin', 'Quinn', 'Riley', 'Avery'],
    elf: ['Elrond', 'Galadriel', 'Legolas', 'Arwen', 'Tauriel', 'Thranduil', 'Celeborn', 'Eärwen', 'Finrod', 'Lúthien'],
    dwarf: ['Thorin', 'Gimli', 'Balin', 'Dwalin', 'Fíli', 'Kíli', 'Glóin', 'Óin', 'Bifur', 'Bofur'],
    orc: ['Gromm', 'Zugdug', 'Krag', 'Rukh', 'Muzgash', 'Grishnak', 'Bolg', 'Azog', 'Ugluk', 'Lurtz'],
    wolf: ['Alpha', 'Shadow', 'Fang', 'Luna', 'Ghost', 'Storm', 'Timber', 'Blizzard', 'Savage', 'Howler'],
    bear: ['Grizzly', 'Kodiak', 'Bruno', 'Honey', 'Ursa', 'Teddy', 'Claw', 'Moose', 'Thunder', 'Shaggy'],
    deer: ['Bambi', 'Buck', 'Stag', 'Doe', 'Dasher', 'Prancer', 'Forest', 'Speckle', 'Maple', 'Swift'],
    rabbit: ['Hopper', 'Thumper', 'Cottontail', 'Flopsy', 'Mopsy', 'Peter', 'Benny', 'Roger', 'Jasper', 'Hazel'],
    bird: ['Robin', 'Sparrow', 'Jay', 'Swift', 'Hawk', 'Raven', 'Wren', 'Finch', 'Eagle', 'Falcon'],
    fish: ['Fins', 'Bubbles', 'Scales', 'Nemo', 'Marlin', 'Dory', 'Wave', 'Splash', 'Shimmer', 'Gill'],
    dragon: ['Smaug', 'Drogon', 'Glaurung', 'Rhaegal', 'Viserion', 'Balerion', 'Meraxes', 'Vermithrax', 'Alduin', 'Fafnir'],
    demon: ['Abaddon', 'Baal', 'Lilith', 'Mephistopheles', 'Asmodeus', 'Beelzebub', 'Moloch', 'Belial', 'Mammon', 'Legion'],
    zombie: ['Shuffler', 'Rotter', 'Lurcher', 'Biter', 'Walker', 'Shambler', 'Moaner', 'Creeper', 'Stinker', 'Lurch'],
    skeleton: ['Rattlebones', 'Marrow', 'Skully', 'Ribs', 'Clatters', 'Bones', 'Creaks', 'Dusty', 'Hollow', 'Grim'],
    elemental: ['Ember', 'Gust', 'Pebble', 'Splash', 'Bolt', 'Quake', 'Frost', 'Blaze', 'Torrent', 'Spark'],
    bandit: ['Cutthroat', 'Knuckles', 'Blade', 'Shadow', 'Scar', 'Knives', 'Dagger', 'Rogue', 'Crook', 'Mugger']
  };
  
  // Choose a random name from the list, or use a generic one if no list exists
  const nameList = names[type] || ['Unknown'];
  const randomIndex = Math.floor(Math.random() * nameList.length);
  return nameList[randomIndex];
}

/**
 * Create a new entity of the specified type
 */
export function createEntity(type: EntityType, x: number, y: number): Entity {
  // Generate a unique id
  const id = uuidv4();
  
  // Generate a name based on type
  const name = generateEntityName(type);
  
  // Base attributes for all entities
  const baseEntity: Entity = {
    id,
    type,
    name,
    age: 0,
    maxAge: 100, // Default
    health: 100,
    maxHealth: 100,
    position: { x, y },
    attributes: {
      strength: 10,
      intelligence: 10,
      speed: 10,
      resilience: 10,
    },
    needs: {
      hunger: 1.0, // Full (0.0 = starving)
      thirst: 1.0, // Full (0.0 = dehydrated)
      rest: 1.0,   // Full (0.0 = exhausted)
      social: 1.0, // Full (0.0 = lonely)
    },
    inventory: [],
    status: [],
  };

  // Customize by entity type
  switch (type) {
    // Intelligent races
    case 'human':
      return {
        ...baseEntity,
        maxAge: 80,
        attributes: {
          ...baseEntity.attributes,
          strength: 10,
          intelligence: 15,
          speed: 10,
          resilience: 10,
        },
      };
      
    case 'elf':
      return {
        ...baseEntity,
        maxAge: 500,
        attributes: {
          ...baseEntity.attributes,
          strength: 8,
          intelligence: 18,
          speed: 12,
          resilience: 8,
        },
      };
      
    case 'dwarf':
      return {
        ...baseEntity,
        maxAge: 250,
        attributes: {
          ...baseEntity.attributes,
          strength: 15,
          intelligence: 12,
          speed: 8,
          resilience: 15,
        },
      };
      
    case 'orc':
      return {
        ...baseEntity,
        maxAge: 60,
        attributes: {
          ...baseEntity.attributes,
          strength: 18,
          intelligence: 8,
          speed: 10,
          resilience: 12,
        },
      };
      
    // Animals
    case 'wolf':
      return {
        ...baseEntity,
        maxAge: 15,
        maxHealth: 80,
        attributes: {
          ...baseEntity.attributes,
          strength: 12,
          intelligence: 8,
          speed: 15,
          resilience: 10,
        },
      };
      
    case 'bear':
      return {
        ...baseEntity,
        maxAge: 25,
        maxHealth: 150,
        attributes: {
          ...baseEntity.attributes,
          strength: 18,
          intelligence: 7,
          speed: 8,
          resilience: 15,
        },
      };

    case 'deer':
      return {
        ...baseEntity,
        maxAge: 12,
        maxHealth: 70,
        attributes: {
          ...baseEntity.attributes,
          strength: 5,
          intelligence: 6,
          speed: 16,
          resilience: 8,
        },
      };
      
    case 'rabbit':
      return {
        ...baseEntity,
        maxAge: 5,
        maxHealth: 30,
        attributes: {
          ...baseEntity.attributes,
          strength: 2,
          intelligence: 5,
          speed: 18,
          resilience: 4,
        },
      };
      
    // Default for any other entity type
    default:
      return baseEntity;
  }
}

/**
 * Create a 3D mesh for an entity based on its type
 */
export function createEntityMesh(entity: Entity): THREE.Object3D {
  // Base configuration
  const size = getEntitySize(entity.type);
  
  // Create a container for all parts of the entity mesh
  const container = new THREE.Object3D();
  
  // Procedurally generated pixel-art sprite (no file assets required)
  const texture = getPixelSpriteTexture(entity.type);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.1,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size * 3, size * 3, 1);
  sprite.position.y = size * 1.5;
  
  container.add(sprite);
  
  // Add a health bar
  const healthBar = createHealthBar(entity);
  healthBar.position.y = size * 3.4;
  container.add(healthBar);
  
  return container;
}

/**
 * Get a size based on entity type
 */
function getEntitySize(type: EntityType): number {
  // Choose size based on entity type
  const sizeMap: Record<string, number> = {
    human: 0.15,
    elf: 0.17,
    dwarf: 0.12,
    orc: 0.18,
    wolf: 0.12,
    bear: 0.2,
    deer: 0.15,
    rabbit: 0.07,
    bird: 0.05,
    fish: 0.08,
    dragon: 0.35,
    demon: 0.25,
    zombie: 0.16,
    skeleton: 0.16,
    elemental: 0.2,
    bandit: 0.15
  };
  
  return sizeMap[type] || 0.15; // Default size
}

/**
 * Create a billboarded health bar indicator for an entity
 */
function createHealthBar(entity: Entity): THREE.Object3D {
  const container = new THREE.Object3D();
  container.name = 'healthBar';
  
  // Background (dark bar)
  const bgMaterial = new THREE.SpriteMaterial({ color: 0x222222, depthTest: false });
  const background = new THREE.Sprite(bgMaterial);
  background.scale.set(0.34, 0.05, 1);
  container.add(background);
  
  // Health fill (green to red based on health percentage)
  const healthPercent = entity.health / entity.maxHealth;
  const fillMaterial = new THREE.SpriteMaterial({ color: 0x00dd44, depthTest: false });
  const fill = new THREE.Sprite(fillMaterial);
  fill.scale.set(0.3 * healthPercent, 0.035, 1);
  fill.position.z = 0.001;
  container.add(fill);
  
  // Hidden until the entity takes damage
  container.visible = healthPercent < 0.99;
  
  return container;
}

/**
 * Update the entity's mesh based on its current state
 * @param entity The entity to update
 * @param deltaTime Time elapsed since last update (for animations)
 */
export function updateEntityMesh(entity: Entity, deltaTime: number = 1/60): void {
  if (!entity.mesh) return;
  
  // Update health bar
  const healthBar = entity.mesh.children.find(child => child.name === 'healthBar');
    
  if (healthBar) {
    // Get the current health percentage
    const healthPercent = Math.max(0, entity.health / entity.maxHealth);
    healthBar.visible = healthPercent < 0.99;
    
    const fill = healthBar.children[1] as THREE.Sprite | undefined;
    if (fill) {
      fill.scale.x = Math.max(0.001, 0.3 * healthPercent);
      const material = fill.material as THREE.SpriteMaterial;
      if (healthPercent > 0.7) {
        material.color.setHex(0x00dd44);
      } else if (healthPercent > 0.3) {
        material.color.setHex(0xffcc00);
      } else {
        material.color.setHex(0xff3322);
      }
    }
  }
  
  // Update sprite animation based on entity state
  const sprite = entity.mesh.children.find(child => child instanceof THREE.Sprite) as THREE.Sprite;
  if (sprite) {
    // Make sprite face the direction the entity is moving
    if (entity.lastPosition) {
      const movingRight = entity.position.x > entity.lastPosition.x;
      // Flip the sprite by scaling
      if (movingRight && sprite.scale.x < 0) {
        sprite.scale.x = Math.abs(sprite.scale.x);
      } else if (!movingRight && sprite.scale.x > 0) {
        sprite.scale.x = -Math.abs(sprite.scale.x);
      }
    }
    
    // Add a small bounce effect while moving
    const baseY = getEntitySize(entity.type) * 1.5;
    if (entity.lastPosition && 
        (entity.position.x !== entity.lastPosition.x || entity.position.y !== entity.lastPosition.y)) {
      // Add movement status for animation selection
      if (!entity.status.includes('moving')) {
        entity.status.push('moving');
      }
      
      // Small bounce effect while moving
      const bounceHeight = 0.05;
      const bounceFrequency = 5;
      sprite.position.y = baseY + Math.abs(Math.sin(Date.now() / 200 * bounceFrequency)) * bounceHeight;

      // Two-frame walk cycle synced to the bounce
      const frames = getPixelSpriteFrames(entity.type);
      const frameIndex = Math.floor(Date.now() / 180) % 2;
      const material = sprite.material as THREE.SpriteMaterial;
      if (material.map !== frames[frameIndex]) {
        material.map = frames[frameIndex];
        material.needsUpdate = true;
      }
    } else {
      sprite.position.y = baseY;
      const frames = getPixelSpriteFrames(entity.type);
      const material = sprite.material as THREE.SpriteMaterial;
      if (material.map !== frames[0]) {
        material.map = frames[0];
        material.needsUpdate = true;
      }
      if (entity.status.includes('moving')) {
        // Remove movement status when stopped
        const index = entity.status.indexOf('moving');
        if (index !== -1) entity.status.splice(index, 1);
      }
    }
  }
  
  // Update entity visualization based on status
  updateEntityVisualization(entity, deltaTime);
}

/**
 * Update entity visualization based on status
 * Applies visual effects to represent different states
 * @param entity The entity to update
 * @param deltaTime Time elapsed since last update (for animations)
 */
function updateEntityVisualization(entity: Entity, _deltaTime: number): void {
  if (!entity.mesh) return;
  
  // Get sprite component
  const sprite = entity.mesh.children.find(child => child instanceof THREE.Sprite) as THREE.Sprite;
  if (!sprite) return;
  
  // Handle status effects
  const material = sprite.material as THREE.SpriteMaterial;
  
  // Reset any previous effects
  material.opacity = 1.0;
  
  // Track the current animation name for future sheet-based sprites
  entity.currentAnimation = getAnimationForEntityStatus(entity);
  
  // Apply visual effects based on status
  if (entity.status.includes('dead')) {
    // Dead entities fade out and become transparent
    material.opacity = 0.5;
    // Rotate to appear fallen (only for non-billboarded sprites)
    sprite.rotation.z = -Math.PI / 2;
  }
  else if (entity.status.includes('sleeping')) {
    // Sleeping entities appear slightly transparent
    material.opacity = 0.8;
  }
  else if (entity.status.includes('fleeing')) {
    // Fleeing entities can shake slightly to show panic
    const shakeAmount = 0.05;
    sprite.position.x += (Math.random() - 0.5) * shakeAmount;
    sprite.position.y += (Math.random() - 0.5) * shakeAmount;
  }
  else if (entity.status.includes('attacking')) {
    // Attacking entities can flash slightly red
    material.color?.offsetHSL(0, 0.2, 0); // Increase saturation for redder appearance
  }
  else if (entity.status.includes('wounded')) {
    // Wounded entities flash red
    material.color?.offsetHSL(0, 0.3, -0.1); 
  }
  else if (entity.status.includes('drinking') || entity.status.includes('eating')) {
    // Entities that are eating or drinking have a slight blue/green tint
    material.color?.offsetHSL(0.3, 0.1, 0);
  }
}

/**
 * EntityAI - Controls the behavior of an entity
 */
export class EntityAI {
  entity: Entity;
  currentState: AIState = 'idle';
  targetTile: Tile | null = null;
  targetEntity: Entity | null = null;
  path: Tile[] = [];
  ticksSinceLastAction = 0;
  ticksToNextStateChange = 0;

  constructor(entity: Entity) {
    this.entity = entity;
  }

  /**
   * Update the entity's AI
   */
  update(tiles: Tile[][], deltaTime: number): void {
    this.ticksSinceLastAction += deltaTime;
    
    // Check if entity is alive
    if (this.entity.health <= 0) {
      this.currentState = 'dying';
      return;
    }

    // Update needs
    this.updateNeeds(deltaTime);

    // Handle current state
    switch (this.currentState) {
      case 'idle':
        this.handleIdleState(tiles);
        break;
      case 'moving':
        this.handleMovingState(tiles);
        break;
      case 'gathering':
        this.handleGatheringState(tiles);
        break;
      case 'hunting':
        this.handleHuntingState(tiles);
        break;
      case 'fleeing':
        this.handleFleeingState(tiles);
        break;
      case 'building':
        this.handleBuildingState();
        break;
      case 'fighting':
        this.handleFightingState();
        break;
      case 'sleeping':
        this.handleSleepingState();
        break;
      case 'reproducing':
        this.handleReproducingState();
        break;
      case 'dying':
        this.handleDyingState();
        break;
    }
  }

  /**
   * Update the entity's needs based on time passed
   */
  private updateNeeds(deltaTime: number): void {
    // Decrease needs over time
    const decreaseRate = 0.01 * deltaTime;
    
    this.entity.needs.hunger = Math.max(0, this.entity.needs.hunger - decreaseRate);
    this.entity.needs.thirst = Math.max(0, this.entity.needs.thirst - decreaseRate * 1.5);
    this.entity.needs.rest = Math.max(0, this.entity.needs.rest - decreaseRate * 0.7);
    this.entity.needs.social = Math.max(0, this.entity.needs.social - decreaseRate * 0.3);
    
    // Apply effects of low needs
    if (this.entity.needs.hunger <= 0.2 || this.entity.needs.thirst <= 0.2) {
      // Very hungry or thirsty - decrease health
      this.entity.health -= 0.1 * deltaTime;
    }
    
    if (this.entity.needs.rest <= 0.2) {
      // Very tired - decrease movement speed
      if (!this.entity.status.includes('exhausted')) {
        this.entity.status.push('exhausted');
      }
    } else if (this.entity.status.includes('exhausted')) {
      // Remove exhausted status if rested enough
      const index = this.entity.status.indexOf('exhausted');
      this.entity.status.splice(index, 1);
    }
  }

  /**
   * Handle the idle state - decide what to do next
   */
  private handleIdleState(tiles: Tile[][]): void {
    // Don't make new decisions too quickly
    if (this.ticksSinceLastAction < 2) return;
    
    // First, check for critical needs
    if (this.entity.needs.thirst <= 0.3) {
      // Find water
      const waterTile = this.findNearbyWater(tiles);
      if (waterTile) {
        this.targetTile = waterTile;
        this.path = [];
        this.currentState = 'moving';
        this.ticksSinceLastAction = 0;
        return;
      }
    }
    
    // Very hungry - if predator, hunt for food
    if (this.entity.needs.hunger <= 0.3) {
      const isPredator = this.isPredator();
      
      if (isPredator) {
        const prey = this.findNearbyPrey(tiles);
        if (prey) {
          this.targetEntity = prey;
          this.currentState = 'hunting';
          this.ticksSinceLastAction = 0;
          return;
        }
      }
      
      // Look for food resources if not a predator or no prey found
      const foodTile = this.findNearbyFood(tiles);
      if (foodTile) {
        this.targetTile = foodTile;
        this.path = [];
        this.currentState = 'moving';
        this.ticksSinceLastAction = 0;
        return;
      }
    }
    
    // Very tired - rest
    if (this.entity.needs.rest <= 0.2) {
      this.currentState = 'sleeping';
      this.ticksSinceLastAction = 0;
      return;
    }
    
    // Check if there are threats nearby
    if (this.isPrey()) {
      const threat = this.findNearbyThreat(tiles);
      if (threat) {
        this.targetEntity = threat;
        this.currentState = 'fleeing';
        this.ticksSinceLastAction = 0;
        return;
      }
    }
    
    // Basic placeholder behavior: just wander around
    if (Math.random() < 0.3) {  // Only wander sometimes
      const currentX = Math.floor(this.entity.position.x);
      const currentY = Math.floor(this.entity.position.y);
      
      const range = 3;
      const moveX = Math.floor(Math.random() * (range * 2 + 1)) - range;
      const moveY = Math.floor(Math.random() * (range * 2 + 1)) - range;
      
      const targetX = Math.max(0, Math.min(tiles.length - 1, currentX + moveX));
      const targetY = Math.max(0, Math.min(tiles[0].length - 1, currentY + moveY));
      
      const candidate = tiles[targetX][targetY];
      if (candidate.walkable !== false && isWalkableForEntity(candidate, this.entity.type)) {
        this.targetTile = candidate;
        this.path = [];
        this.currentState = 'moving';
      }
      
      this.ticksSinceLastAction = 0;
    }
  }

  /**
   * Handle the moving state - follow an A* path towards the target
   */
  private handleMovingState(tiles: Tile[][]): void {
    if (!this.targetTile) {
      this.currentState = 'idle';
      return;
    }

    // Compute a path once per target using A*
    if (this.path.length === 0) {
      const startX = Math.max(0, Math.min(tiles.length - 1, Math.floor(this.entity.position.x)));
      const startY = Math.max(0, Math.min(tiles[0].length - 1, Math.floor(this.entity.position.y)));
      const startTile = tiles[startX][startY];
      if (startTile !== this.targetTile) {
        this.path = findPath(startTile, this.targetTile, tiles, this.entity.type);
      }
      if (this.path.length === 0) {
        // Unreachable or adjacent: walk directly at the target
        this.path = [this.targetTile];
      }
    }

    const waypoint = this.path[0];
    const { x, y } = this.entity.position;
    const dx = waypoint.x - x;
    const dy = waypoint.y - y;
    const length = Math.sqrt(dx * dx + dy * dy);

    this.entity.lastPosition = { x, y };

    if (length < 0.15) {
      // Waypoint reached; advance along the path
      this.path.shift();
      if (this.path.length > 0) return;

      // Full path complete: arrive at the target tile
      this.entity.position = { x: waypoint.x, y: waypoint.y };
      const targetType = this.targetTile.type;

      if (['shallow_water', 'river', 'lake'].includes(targetType)) {
        this.entity.needs.thirst = 1.0;
        this.entity.status.push('drinking');
        setTimeout(() => {
          const index = this.entity.status.indexOf('drinking');
          if (index !== -1) this.entity.status.splice(index, 1);
        }, 3000);
      } else if (this.targetTile.resources.some(r => r.type === 'food')) {
        this.currentState = 'gathering';
        return;
      }

      this.targetTile = null;
      this.currentState = 'idle';
      return;
    }

    let speed = this.entity.attributes.speed / 100;
    if (this.entity.status.includes('exhausted')) {
      speed *= 0.5;
    }
    const stepSize = Math.min(0.05 * speed * 60 * (1 / 60) * 4, length);

    this.entity.position = {
      x: x + (dx / length) * stepSize,
      y: y + (dy / length) * stepSize,
    };
  }

  /**
   * Handle gathering behavior
   */
  private handleGatheringState(_tiles: Tile[][]): void {
    // Can't gather without a target tile
    if (!this.targetTile) {
      this.currentState = 'idle';
      return;
    }
    
    // Gathering takes time
    if (this.ticksSinceLastAction < 1) {
      return;
    }
    
    // Find food resources in the tile
    const foodResources = this.targetTile.resources.filter(r => r.type === 'food');
    
    if (foodResources.length > 0) {
      // Gather some food
      const resource = foodResources[0];
      const amountToGather = Math.min(1, resource.quantity);
      
      // Reduce resource quantity
      resource.quantity -= amountToGather;
      
      // Satisfy hunger
      this.entity.needs.hunger = Math.min(1.0, this.entity.needs.hunger + 0.5);
      
      // Update status
      this.entity.status.push('eating');
      
      // Remove the status after a short time
      setTimeout(() => {
        const index = this.entity.status.indexOf('eating');
        if (index !== -1) this.entity.status.splice(index, 1);
      }, 3000);
      
      // Remove empty resources
      if (resource.quantity <= 0) {
        const resourceIndex = this.targetTile.resources.indexOf(resource);
        if (resourceIndex !== -1) {
          this.targetTile.resources.splice(resourceIndex, 1);
        }
      }
    }
    
    // Done gathering
    this.currentState = 'idle';
    this.ticksSinceLastAction = 0;
  }

  /**
   * Handle hunting behavior
   */
  private handleHuntingState(_tiles: Tile[][]): void {
    // Check if we still have a target
    if (!this.targetEntity) {
      this.currentState = 'idle';
      return;
    }
    
    // Calculate distance to target
    const dx = this.targetEntity.position.x - this.entity.position.x;
    const dy = this.targetEntity.position.y - this.entity.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // If we're close enough, attack
    if (distance < 0.5) {
      // Apply damage based on strength
      const damage = this.entity.attributes.strength / 5;
      this.targetEntity.health -= damage;
      
      // Add status effects
      this.targetEntity.status.push('wounded');
      this.entity.status.push('attacking');
      
      // Remove the status after a short time
      setTimeout(() => {
        const index = this.entity.status.indexOf('attacking');
        if (index !== -1) this.entity.status.splice(index, 1);
      }, 1000);
      
      // Check if prey is killed
      if (this.targetEntity.health <= 0) {
        // Satisfy hunger
        this.entity.needs.hunger = 1.0;
        
        // Update status
        this.entity.status.push('eating');
        
        // Remove the status after a short time
        setTimeout(() => {
          const index = this.entity.status.indexOf('eating');
          if (index !== -1) this.entity.status.splice(index, 1);
        }, 3000);
        
        // Target is now dead, so go back to idle
        this.targetEntity = null;
        this.currentState = 'idle';
        return;
      }
      
      // Target might try to flee
      // (This would trigger in the target's AI next update)
      
      // Reset action counter for next attack
      this.ticksSinceLastAction = 0;
    } else {
      // Move towards the target
      this.entity.lastPosition = { ...this.entity.position };
      
      // Calculate direction to move
      const dirX = dx / distance;
      const dirY = dy / distance;
      
      // Apply movement scaled by entity speed
      let speed = this.entity.attributes.speed / 100;
      
      // Reduce speed if exhausted
      if (this.entity.status.includes('exhausted')) {
        speed *= 0.5;
      }
      
      const stepSize = 0.05 * speed;
      
      this.entity.position = {
        x: this.entity.position.x + dirX * stepSize,
        y: this.entity.position.y + dirY * stepSize,
      };
    }
  }

  /**
   * Handle fleeing behavior
   */
  private handleFleeingState(tiles: Tile[][]): void {
    // Check if we still have a threat
    if (!this.targetEntity) {
      this.currentState = 'idle';
      return;
    }
    
    // Calculate distance to threat
    const dx = this.targetEntity.position.x - this.entity.position.x;
    const dy = this.targetEntity.position.y - this.entity.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // If we're far enough away, stop fleeing
    if (distance > 5) {
      this.targetEntity = null;
      this.currentState = 'idle';
      return;
    }
    
    // Add status effect
    if (!this.entity.status.includes('fleeing')) {
      this.entity.status.push('fleeing');
    }
    
    // Move away from threat
    this.entity.lastPosition = { ...this.entity.position };
    
    // Calculate direction to flee (opposite of threat direction)
    const dirX = -dx / distance;
    const dirY = -dy / distance;
    
    // Apply movement scaled by entity speed
    let speed = this.entity.attributes.speed / 100;
    
    // Extra speed boost when fleeing (adrenaline)
    speed *= 1.2;
    
    // Reduce speed if exhausted
    if (this.entity.status.includes('exhausted')) {
      speed *= 0.7;
    }
    
    const stepSize = 0.05 * speed;
    
    // Calculate new position
    const newX = this.entity.position.x + dirX * stepSize;
    const newY = this.entity.position.y + dirY * stepSize;
    
    // Check if new position is valid (inside map and walkable)
    const tileX = Math.floor(newX);
    const tileY = Math.floor(newY);
    
    if (tileX >= 0 && tileX < tiles.length && tileY >= 0 && tileY < tiles[0].length) {
      if (tiles[tileX][tileY].walkable !== false) {
        this.entity.position = { x: newX, y: newY };
      } else {
        // Try to move in a slightly different direction if blocked
        const angle = Math.random() * Math.PI / 2 - Math.PI / 4; // -45 to +45 degrees
        const adjustedDirX = dirX * Math.cos(angle) - dirY * Math.sin(angle);
        const adjustedDirY = dirX * Math.sin(angle) + dirY * Math.cos(angle);
        
        const adjustedX = this.entity.position.x + adjustedDirX * stepSize;
        const adjustedY = this.entity.position.y + adjustedDirY * stepSize;
        
        const adjustedTileX = Math.floor(adjustedX);
        const adjustedTileY = Math.floor(adjustedY);
        
        if (adjustedTileX >= 0 && adjustedTileX < tiles.length && 
            adjustedTileY >= 0 && adjustedTileY < tiles[0].length) {
          if (tiles[adjustedTileX][adjustedTileY].walkable !== false) {
            this.entity.position = { x: adjustedX, y: adjustedY };
          }
        }
      }
    }
  }

  /**
   * Handle building behavior
   */
  private handleBuildingState(): void {
    // Placeholder for building logic
    this.currentState = 'idle';
  }

  /**
   * Handle fighting behavior
   */
  private handleFightingState(): void {
    // Placeholder for fighting logic
    this.currentState = 'idle';
  }

  /**
   * Handle sleeping behavior
   */
  private handleSleepingState(): void {
    // Restore rest need
    this.entity.needs.rest = Math.min(1.0, this.entity.needs.rest + 0.01);
    
    // When rested enough, return to idle
    if (this.entity.needs.rest > 0.8) {
      this.currentState = 'idle';
    }
  }

  /**
   * Handle reproduction behavior
   */
  private handleReproducingState(): void {
    // Placeholder for reproduction logic
    this.currentState = 'idle';
  }

  /**
   * Handle dying behavior
   */
  private handleDyingState(): void {
    // Entity is dead - nothing to do until it's removed
    if (!this.entity.status.includes('dead')) {
      this.entity.status.push('dead');
    }
  }

  /**
   * Find nearby water tiles
   */
  private findNearbyWater(tiles: Tile[][]): Tile | null {
    const currentX = Math.floor(this.entity.position.x);
    const currentY = Math.floor(this.entity.position.y);
    const searchRadius = 10;
    
    let closestWaterTile: Tile | null = null;
    let closestDistance = searchRadius * 2;
    
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      for (let dy = -searchRadius; dy <= searchRadius; dy++) {
        const x = currentX + dx;
        const y = currentY + dy;
        
        // Check bounds
        if (x < 0 || x >= tiles.length || y < 0 || y >= tiles[0].length) continue;
        
        const tile = tiles[x][y];
        if (['shallow_water', 'river', 'lake'].includes(tile.type)) {
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestWaterTile = tile;
          }
        }
      }
    }
    
    return closestWaterTile;
  }

  /**
   * Find nearby food resources
   */
  private findNearbyFood(tiles: Tile[][]): Tile | null {
    const currentX = Math.floor(this.entity.position.x);
    const currentY = Math.floor(this.entity.position.y);
    const searchRadius = 8;
    
    let closestFoodTile: Tile | null = null;
    let closestDistance = searchRadius * 2;
    
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      for (let dy = -searchRadius; dy <= searchRadius; dy++) {
        const x = currentX + dx;
        const y = currentY + dy;
        
        // Check bounds
        if (x < 0 || x >= tiles.length || y < 0 || y >= tiles[0].length) continue;
        
        const tile = tiles[x][y];
        if (tile.resources.some(r => r.type === 'food' && r.quantity > 0)) {
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestFoodTile = tile;
          }
        }
      }
    }
    
    return closestFoodTile;
  }

  /**
   * Find nearby prey
   */
  private findNearbyPrey(tiles: Tile[][]): Entity | null {
    if (!this.isPredator()) return null;
    
    const possiblePrey = FOOD_CHAIN[this.entity.type] || [];
    if (possiblePrey.length === 0) return null;
    
    const currentX = Math.floor(this.entity.position.x);
    const currentY = Math.floor(this.entity.position.y);
    const searchRadius = 8;
    
    let closestPrey: Entity | null = null;
    let closestDistance = searchRadius * 2;
    
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      for (let dy = -searchRadius; dy <= searchRadius; dy++) {
        const x = currentX + dx;
        const y = currentY + dy;
        
        // Check bounds
        if (x < 0 || x >= tiles.length || y < 0 || y >= tiles[0].length) continue;
        
        const tile = tiles[x][y];
        for (const entity of tile.entities) {
          if (possiblePrey.includes(entity.type) && entity.health > 0) {
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < closestDistance) {
              closestDistance = distance;
              closestPrey = entity;
            }
          }
        }
      }
    }
    
    return closestPrey;
  }

  /**
   * Find nearby threats (predators that might hunt this entity)
   */
  private findNearbyThreat(tiles: Tile[][]): Entity | null {
    const currentX = Math.floor(this.entity.position.x);
    const currentY = Math.floor(this.entity.position.y);
    const searchRadius = 6;
    
    let closestThreat: Entity | null = null;
    let closestDistance = searchRadius * 2;
    
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      for (let dy = -searchRadius; dy <= searchRadius; dy++) {
        const x = currentX + dx;
        const y = currentY + dy;
        
        // Check bounds
        if (x < 0 || x >= tiles.length || y < 0 || y >= tiles[0].length) continue;
        
        const tile = tiles[x][y];
        for (const entity of tile.entities) {
          // Check if this entity is a predator to our entity type
          const predatorPreys = FOOD_CHAIN[entity.type] || [];
          if (predatorPreys.includes(this.entity.type) && entity.health > 0) {
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < closestDistance) {
              closestDistance = distance;
              closestThreat = entity;
            }
          }
        }
      }
    }
    
    return closestThreat;
  }

  /**
   * Check if this entity is a predator
   */
  private isPredator(): boolean {
    const preyList = FOOD_CHAIN[this.entity.type] || [];
    return preyList.length > 0;
  }
  
  /**
   * Check if this entity is a prey animal (can be hunted)
   */
  private isPrey(): boolean {
    // Check if any predator has this entity type in its prey list
    for (const [_predatorType, preyList] of Object.entries(FOOD_CHAIN)) {
      if (preyList.includes(this.entity.type)) {
        return true;
      }
    }
    return false;
  }
}
