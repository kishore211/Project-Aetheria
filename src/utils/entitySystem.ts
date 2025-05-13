// src/utils/entitySystem.ts
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import {
  Entity,
  EntityType,
  Race,
  Tile,
  BiomeType,
  ResourceType,
} from '../types/world';

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
          strength: 6,
          intelligence: 6,
          speed: 16,
          resilience: 8,
        },
      };
      
    case 'rabbit':
      return {
        ...baseEntity,
        maxAge: 8,
        maxHealth: 30,
        attributes: {
          ...baseEntity.attributes,
          strength: 3,
          intelligence: 5,
          speed: 18,
          resilience: 4,
        },
      };
      
    case 'fish':
      return {
        ...baseEntity,
        maxAge: 5,
        maxHealth: 20,
        attributes: {
          ...baseEntity.attributes,
          strength: 2,
          intelligence: 2,
          speed: 8,
          resilience: 3,
        },
      };
      
    case 'bird':
      return {
        ...baseEntity,
        maxAge: 5,
        maxHealth: 15,
        attributes: {
          ...baseEntity.attributes,
          strength: 2,
          intelligence: 6,
          speed: 20,
          resilience: 3,
        },
      };
      
    // Monsters
    case 'dragon':
      return {
        ...baseEntity,
        maxAge: 1000,
        maxHealth: 500,
        attributes: {
          ...baseEntity.attributes,
          strength: 30,
          intelligence: 20,
          speed: 15,
          resilience: 30,
        },
      };
      
    case 'demon':
      return {
        ...baseEntity,
        maxAge: 888, // Auspicious in demonic lore
        maxHealth: 300,
        attributes: {
          ...baseEntity.attributes,
          strength: 25,
          intelligence: 18,
          speed: 18,
          resilience: 25,
        },
      };

    case 'zombie':
      return {
        ...baseEntity,
        maxAge: 1000, // Undead, so very long life
        maxHealth: 150,
        needs: {
          ...baseEntity.needs,
          hunger: 0.2, // Always hungry for brains
          thirst: 1.0, // Don't need water
          rest: 1.0,   // Don't need rest
          social: 0.5, // Prefer groups of zombies
        },
        attributes: {
          ...baseEntity.attributes,
          strength: 15,
          intelligence: 2,
          speed: 5,
          resilience: 20,
        },
      };
      
    case 'skeleton':
      return {
        ...baseEntity,
        maxAge: 1000, // Undead, so very long life
        maxHealth: 100,
        needs: {
          ...baseEntity.needs,
          hunger: 1.0, // Don't need food
          thirst: 1.0, // Don't need water
          rest: 1.0,   // Don't need rest
          social: 0.3, // Solo or small groups
        },
        attributes: {
          ...baseEntity.attributes,
          strength: 10,
          intelligence: 4,
          speed: 8,
          resilience: 15,
        },
      };
      
    case 'bandit':
      return {
        ...baseEntity,
        maxAge: 60,
        attributes: {
          ...baseEntity.attributes,
          strength: 12,
          intelligence: 10,
          speed: 12,
          resilience: 10,
        },
      };
      
    case 'elemental':
      return {
        ...baseEntity,
        maxAge: 300,
        maxHealth: 250,
        attributes: {
          ...baseEntity.attributes,
          strength: 20,
          intelligence: 15,
          speed: 10,
          resilience: 20,
        },
      };
      
    // Default catch-all
    default:
      return baseEntity;
  }
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
 * Create a 3D mesh for an entity based on its type
 */
export function createEntityMesh(entity: Entity): THREE.Object3D {
  // Choose color based on entity type
  const colorMap: Record<EntityType, number> = {
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
  
  // Choose size based on entity type
  const sizeMap: Record<EntityType, number> = {
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
  
  // Create a simple shape for each entity type
  const color = colorMap[entity.type] || 0xffffff;
  const size = sizeMap[entity.type] || 0.15;
  
  // Creating the container to hold all parts of the entity mesh
  const container = new THREE.Object3D();
  
  // Add a health indicator on top of all entities
  const healthBar = createHealthBar(entity);
  healthBar.position.set(0, size * 1.5, 0); // Position above the entity
  container.add(healthBar);
  
  // Create mesh based on entity type
  let mesh: THREE.Mesh;
  
  switch (entity.type) {
    case 'human':
    case 'elf':
    case 'dwarf':
    case 'orc':
    case 'bandit':
      // Bipedal entities get a humanoid shape
      mesh = createHumanoidMesh(color, size);
      break;
      
    case 'wolf':
    case 'bear':
    case 'deer':
    case 'rabbit':
      // Quadruped animals get an animal shape
      mesh = createQuadrupedMesh(color, size);
      break;
      
    case 'bird':
      // Birds get a bird shape
      mesh = createBirdMesh(color, size);
      break;
      
    case 'fish':
      // Fish get a fish shape
      mesh = createFishMesh(color, size);
      break;
      
    case 'dragon':
      // Dragons get a special dragon mesh
      mesh = createDragonMesh(color, size);
      break;
      
    case 'zombie':
    case 'skeleton':
      // Undead get a decayed humanoid shape
      mesh = createHumanoidMesh(color, size, true);
      break;
      
    case 'demon':
      // Demons get a special demon mesh
      mesh = createDemonMesh(color, size);
      break;
      
    case 'elemental':
      // Elementals get a special elemental mesh
      mesh = createElementalMesh(color, size);
      break;
      
    default:
      // Default simple sphere for anything not specified
      const geometry = new THREE.SphereGeometry(size, 8, 8);
      const material = new THREE.MeshLambertMaterial({ color });
      mesh = new THREE.Mesh(geometry, material);
  }
  
  container.add(mesh);
  return container;
}

/**
 * Create a health bar indicator for an entity
 */
function createHealthBar(entity: Entity): THREE.Object3D {
  const container = new THREE.Object3D();
  
  // Background (gray bar)
  const bgGeometry = new THREE.BoxGeometry(0.2, 0.03, 0.01);
  const bgMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
  const background = new THREE.Mesh(bgGeometry, bgMaterial);
  
  // Health indicator (green to red based on health percentage)
  const healthPercent = entity.health / entity.maxHealth;
  const healthWidth = 0.2 * healthPercent;
  
  const healthGeometry = new THREE.BoxGeometry(healthWidth, 0.03, 0.015);
  
  // Color based on health percentage (green to yellow to red)
  let healthColor;
  if (healthPercent > 0.7) {
    healthColor = 0x00ff00; // Green
  } else if (healthPercent > 0.3) {
    healthColor = 0xffff00; // Yellow
  } else {
    healthColor = 0xff0000; // Red
  }
  
  const healthMaterial = new THREE.MeshBasicMaterial({ color: healthColor });
  const healthBar = new THREE.Mesh(healthGeometry, healthMaterial);
  
  // Position the health bar to align left with the background
  healthBar.position.set((healthWidth - 0.2) / 2, 0, 0.005);
  
  container.add(background);
  container.add(healthBar);
  
  return container;
}

/**
 * Create a humanoid mesh
 */
function createHumanoidMesh(color: number, size: number, undead: boolean = false): THREE.Mesh {
  // Create a group to hold all the parts
  const humanoid = new THREE.Group();
  
  // Material based on if undead or not
  const material = new THREE.MeshLambertMaterial({ 
    color,
    roughness: undead ? 0.9 : 0.5,
    metalness: 0.0
  });
  
  // Body (cylinder)
  const bodyGeometry = new THREE.CylinderGeometry(size * 0.3, size * 0.4, size * 0.8, 8);
  const body = new THREE.Mesh(bodyGeometry, material);
  humanoid.add(body);
  
  // Head (sphere)
  const headGeometry = new THREE.SphereGeometry(size * 0.3, 8, 8);
  const head = new THREE.Mesh(headGeometry, material);
  head.position.y = size * 0.5;
  humanoid.add(head);
  
  // Arms (cylinders)
  const armGeometry = new THREE.CylinderGeometry(size * 0.1, size * 0.1, size * 0.7, 8);
  
  const leftArm = new THREE.Mesh(armGeometry, material);
  leftArm.position.set(size * 0.3, size * 0.1, 0);
  leftArm.rotation.z = Math.PI / 4;
  humanoid.add(leftArm);
  
  const rightArm = new THREE.Mesh(armGeometry, material);
  rightArm.position.set(-size * 0.3, size * 0.1, 0);
  rightArm.rotation.z = -Math.PI / 4;
  humanoid.add(rightArm);
  
  // Legs (cylinders)
  const legGeometry = new THREE.CylinderGeometry(size * 0.15, size * 0.1, size * 0.6, 8);
  
  const leftLeg = new THREE.Mesh(legGeometry, material);
  leftLeg.position.set(size * 0.15, -size * 0.5, 0);
  humanoid.add(leftLeg);
  
  const rightLeg = new THREE.Mesh(legGeometry, material);
  rightLeg.position.set(-size * 0.15, -size * 0.5, 0);
  humanoid.add(rightLeg);
  
  return humanoid;
}

/**
 * Create a quadruped (animal) mesh
 */
function createQuadrupedMesh(color: number, size: number): THREE.Mesh {
  // Create a group for the animal
  const animal = new THREE.Group();
  
  // Material
  const material = new THREE.MeshLambertMaterial({ color });
  
  // Body (ellipsoid)
  const bodyGeometry = new THREE.SphereGeometry(size, 8, 8);
  bodyGeometry.scale(1.5, 1, 1);
  const body = new THREE.Mesh(bodyGeometry, material);
  animal.add(body);
  
  // Head (sphere)
  const headGeometry = new THREE.SphereGeometry(size * 0.5, 8, 8);
  const head = new THREE.Mesh(headGeometry, material);
  head.position.set(size * 1.2, size * 0.3, 0);
  animal.add(head);
  
  // Legs (cylinders)
  const legGeometry = new THREE.CylinderGeometry(size * 0.1, size * 0.1, size * 0.7, 8);
  
  const positions = [
    [size * 0.6, -size * 0.5, size * 0.4],    // Front right
    [size * 0.6, -size * 0.5, -size * 0.4],   // Front left
    [-size * 0.6, -size * 0.5, size * 0.4],   // Back right
    [-size * 0.6, -size * 0.5, -size * 0.4]   // Back left
  ];
  
  positions.forEach(pos => {
    const leg = new THREE.Mesh(legGeometry, material);
    leg.position.set(pos[0], pos[1], pos[2]);
    animal.add(leg);
  });
  
  // Tail (for some animals)
  const tailGeometry = new THREE.CylinderGeometry(size * 0.1, size * 0.05, size * 0.8, 8);
  const tail = new THREE.Mesh(tailGeometry, material);
  tail.position.set(-size * 1.2, 0, 0);
  tail.rotation.z = Math.PI / 3; // Angle the tail up slightly
  animal.add(tail);
  
  return animal;
}

/**
 * Create a bird mesh
 */
function createBirdMesh(color: number, size: number): THREE.Mesh {
  const bird = new THREE.Group();
  
  // Material
  const material = new THREE.MeshLambertMaterial({ color });
  
  // Body
  const bodyGeometry = new THREE.SphereGeometry(size, 8, 8);
  bodyGeometry.scale(1.2, 1, 1);
  const body = new THREE.Mesh(bodyGeometry, material);
  bird.add(body);
  
  // Head
  const headGeometry = new THREE.SphereGeometry(size * 0.6, 8, 8);
  const head = new THREE.Mesh(headGeometry, material);
  head.position.set(size * 0.8, size * 0.3, 0);
  bird.add(head);
  
  // Beak
  const beakGeometry = new THREE.ConeGeometry(size * 0.2, size * 0.6, 8);
  const beakMaterial = new THREE.MeshLambertMaterial({ color: 0xffdf00 });
  const beak = new THREE.Mesh(beakGeometry, beakMaterial);
  beak.position.set(size * 1.4, size * 0.3, 0);
  beak.rotation.z = -Math.PI / 2;
  bird.add(beak);
  
  // Wings
  const wingGeometry = new THREE.BoxGeometry(size * 0.8, size * 0.1, size * 1.6);
  
  const rightWing = new THREE.Mesh(wingGeometry, material);
  rightWing.position.set(0, size * 0.3, size * 0.8);
  bird.add(rightWing);
  
  const leftWing = new THREE.Mesh(wingGeometry, material);
  leftWing.position.set(0, size * 0.3, -size * 0.8);
  bird.add(leftWing);
  
  // Tail
  const tailGeometry = new THREE.BoxGeometry(size * 0.6, size * 0.1, size * 0.4);
  const tail = new THREE.Mesh(tailGeometry, material);
  tail.position.set(-size * 0.8, size * 0.1, 0);
  bird.add(tail);
  
  // Bird is now complete
  return bird;
}

/**
 * Create a fish mesh
 */
function createFishMesh(color: number, size: number): THREE.Mesh {
  const fish = new THREE.Group();
  
  // Material
  const material = new THREE.MeshLambertMaterial({ color });
  
  // Body (tapered cylinder)
  const bodyGeometry = new THREE.CylinderGeometry(size * 0.5, size * 0.1, size * 1.5, 8);
  bodyGeometry.rotateZ(Math.PI / 2); // Rotate to horizontal position
  const body = new THREE.Mesh(bodyGeometry, material);
  fish.add(body);
  
  // Tail fin
  const tailGeometry = new THREE.BoxGeometry(size * 0.1, size * 0.8, size * 0.05);
  const tail = new THREE.Mesh(tailGeometry, material);
  tail.position.set(-size * 0.8, 0, 0);
  fish.add(tail);
  
  // Top fin
  const topFinGeometry = new THREE.BoxGeometry(size * 0.6, size * 0.4, size * 0.05);
  const topFin = new THREE.Mesh(topFinGeometry, material);
  topFin.position.set(0, size * 0.4, 0);
  fish.add(topFin);
  
  // Side fins
  const sideFinGeometry = new THREE.BoxGeometry(size * 0.3, size * 0.05, size * 0.3);
  
  const rightFin = new THREE.Mesh(sideFinGeometry, material);
  rightFin.position.set(0, 0, size * 0.4);
  rightFin.rotation.x = Math.PI / 4; // Angle the fin outward
  fish.add(rightFin);
  
  const leftFin = new THREE.Mesh(sideFinGeometry, material);
  leftFin.position.set(0, 0, -size * 0.4);
  leftFin.rotation.x = -Math.PI / 4; // Angle the fin outward
  fish.add(leftFin);
  
  return fish;
}

/**
 * Create a dragon mesh
 */
function createDragonMesh(color: number, size: number): THREE.Mesh {
  const dragon = new THREE.Group();
  
  // Material
  const material = new THREE.MeshLambertMaterial({ color });
  const eyeMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 }); // Red eyes
  
  // Body (large elongated sphere)
  const bodyGeometry = new THREE.SphereGeometry(size, 16, 16);
  bodyGeometry.scale(2.5, 1.5, 1.5);
  const body = new THREE.Mesh(bodyGeometry, material);
  dragon.add(body);
  
  // Neck (tapered cylinder)
  const neckGeometry = new THREE.CylinderGeometry(size * 0.5, size * 0.8, size * 1.5, 8);
  const neck = new THREE.Mesh(neckGeometry, material);
  neck.position.set(size * 1.5, size * 1.0, 0);
  neck.rotation.z = -Math.PI / 4; // Angle the neck up
  dragon.add(neck);
  
  // Head
  const headGeometry = new THREE.SphereGeometry(size * 0.8, 16, 16);
  headGeometry.scale(1.5, 1, 1);
  const head = new THREE.Mesh(headGeometry, material);
  head.position.set(size * 2.3, size * 2.0, 0);
  dragon.add(head);
  
  // Eyes
  const eyeGeometry = new THREE.SphereGeometry(size * 0.2, 8, 8);
  
  const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  rightEye.position.set(size * 2.6, size * 2.2, size * 0.4);
  dragon.add(rightEye);
  
  const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  leftEye.position.set(size * 2.6, size * 2.2, -size * 0.4);
  dragon.add(leftEye);
  
  // Wings
  const wingGeometry = new THREE.BoxGeometry(size * 2.5, size * 0.1, size * 3);
  
  const rightWing = new THREE.Mesh(wingGeometry, material);
  rightWing.position.set(size * 0.5, size * 0.8, size * 2);
  rightWing.rotation.x = Math.PI / 6; // Angle the wing out and up
  rightWing.rotation.y = Math.PI / 6;
  dragon.add(rightWing);
  
  const leftWing = new THREE.Mesh(wingGeometry, material);
  leftWing.position.set(size * 0.5, size * 0.8, -size * 2);
  leftWing.rotation.x = -Math.PI / 6; // Angle the wing out and up
  leftWing.rotation.y = -Math.PI / 6;
  dragon.add(leftWing);
  
  // Tail
  const tailGeometry = new THREE.CylinderGeometry(size * 0.6, size * 0.1, size * 3, 8);
  const tail = new THREE.Mesh(tailGeometry, material);
  tail.position.set(-size * 2, size * 0.3, 0);
  tail.rotation.z = Math.PI / 2; // Horizontal tail
  dragon.add(tail);
  
  // Legs
  const legGeometry = new THREE.CylinderGeometry(size * 0.25, size * 0.15, size, 8);
  
  const positions = [
    [size, -size, size], // Front right
    [size, -size, -size], // Front left
    [-size, -size, size], // Back right
    [-size, -size, -size] // Back left
  ];
  
  positions.forEach(pos => {
    const leg = new THREE.Mesh(legGeometry, material);
    leg.position.set(pos[0], pos[1] + size/2, pos[2]);
    dragon.add(leg);
  });
  
  return dragon;
}

/**
 * Create a demon mesh
 */
function createDemonMesh(color: number, size: number): THREE.Mesh {
  // Base on humanoid but add demon-specific features
  const demon = createHumanoidMesh(color, size);
  
  // Material for extra parts
  const material = new THREE.MeshLambertMaterial({ color });
  
  // Horns
  const hornGeometry = new THREE.ConeGeometry(size * 0.1, size * 0.4, 8);
  
  const leftHorn = new THREE.Mesh(hornGeometry, material);
  leftHorn.position.set(size * 0.2, size * 0.8, 0);
  leftHorn.rotation.z = -Math.PI / 6; // Angle outward
  demon.add(leftHorn);
  
  const rightHorn = new THREE.Mesh(hornGeometry, material);
  rightHorn.position.set(-size * 0.2, size * 0.8, 0);
  rightHorn.rotation.z = Math.PI / 6; // Angle outward
  demon.add(rightHorn);
  
  // Wings
  const wingGeometry = new THREE.BoxGeometry(size * 1.5, size * 0.1, size * 1);
  
  const leftWing = new THREE.Mesh(wingGeometry, material);
  leftWing.position.set(size * 0.5, size * 0.3, 0);
  leftWing.rotation.y = Math.PI / 6; // Angle back
  leftWing.rotation.x = -Math.PI / 6; // Angle up
  demon.add(leftWing);
  
  const rightWing = new THREE.Mesh(wingGeometry, material);
  rightWing.position.set(-size * 0.5, size * 0.3, 0);
  rightWing.rotation.y = -Math.PI / 6; // Angle back
  rightWing.rotation.x = -Math.PI / 6; // Angle up
  demon.add(rightWing);
  
  // Tail
  const tailGeometry = new THREE.CylinderGeometry(size * 0.1, size * 0.05, size * 1.2, 8);
  const tail = new THREE.Mesh(tailGeometry, material);
  tail.position.set(0, -size * 0.6, -size * 0.3);
  tail.rotation.x = Math.PI / 4; // Angle back and down
  demon.add(tail);
  
  return demon;
}

/**
 * Create an elemental mesh
 */
function createElementalMesh(color: number, size: number): THREE.Mesh {
  // Base shape (sphere or cube)
  const baseGeometry = Math.random() < 0.5 ? 
    new THREE.SphereGeometry(size, 16, 16) : 
    new THREE.BoxGeometry(size * 2, size * 2, size * 2);
  
  // Material with glow effect
  const material = new THREE.MeshLambertMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.9
  });
  
  // Create main body
  const elemental = new THREE.Mesh(baseGeometry, material);
  
  // Add some floating geometric shapes around it
  const smallShapes = new THREE.Group();
  
  const numShapes = Math.floor(Math.random() * 5) + 3;
  for (let i = 0; i < numShapes; i++) {
    // Random shape type
    let shapeGeometry;
    const shapeType = Math.floor(Math.random() * 3);
    switch (shapeType) {
      case 0:
        shapeGeometry = new THREE.SphereGeometry(size * 0.2, 8, 8);
        break;
      case 1:
        shapeGeometry = new THREE.BoxGeometry(size * 0.3, size * 0.3, size * 0.3);
        break;
      case 2:
        shapeGeometry = new THREE.TetrahedronGeometry(size * 0.3);
        break;
    }
    
    const shape = new THREE.Mesh(shapeGeometry, material);
    
    // Position randomly around the main body
    const angle = Math.random() * Math.PI * 2;
    const radius = size * 1.5;
    const height = (Math.random() - 0.5) * size;
    
    shape.position.set(
      Math.cos(angle) * radius,
      height, 
      Math.sin(angle) * radius
    );
    
    smallShapes.add(shape);
  }
  
  const group = new THREE.Group();
  group.add(elemental);
  group.add(smallShapes);
  
  return group;
}

/**
 * Update the entity's mesh based on its current state
 */
export function updateEntityMesh(entity: Entity): void {
  if (!entity.mesh) return;
  
  // Update health bar
  const healthBar = entity.mesh.children.find(child => 
    child instanceof THREE.Object3D && child.children.length === 2);
    
  if (healthBar) {
    // Get the current health percentage
    const healthPercent = entity.health / entity.maxHealth;
    
    // Update the health bar width
    const healthBarFill = healthBar.children[1];
    if (healthBarFill instanceof THREE.Mesh) {
      // Scale the health bar to the current percentage
      healthBarFill.scale.x = healthPercent;
      
      // Update the position to keep it left-aligned
      healthBarFill.position.x = (0.2 * healthPercent - 0.2) / 2;
      
      // Update the color based on health percentage
      const material = healthBarFill.material as THREE.MeshBasicMaterial;
      if (material) {
        if (healthPercent > 0.7) {
          material.color.setHex(0x00ff00); // Green
        } else if (healthPercent > 0.3) {
          material.color.setHex(0xffff00); // Yellow
        } else {
          material.color.setHex(0xff0000); // Red
        }
      }
    }
  }
  
  // Additional visual updates based on entity status
  // For example, change colors, add effects, etc.
  if (entity.status.includes('sleeping')) {
    // Add a "z" particle effect or change color to indicate sleeping
    // This would require a particle system
  } else if (entity.status.includes('fleeing')) {
    // Maybe add a fading trail or different animation
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
   * Update the entity's behavior
   * @param tiles - The world tiles
   * @param deltaTime - Time since last update
   */
  update(tiles: Tile[][], deltaTime: number): void {
    // Increment ticks
    this.ticksSinceLastAction += deltaTime;
    
    // Check if entity is alive
    if (this.entity.health <= 0) {
      this.die();
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
        this.handleGatheringState();
        break;
      case 'hunting':
        this.handleHuntingState();
        break;
      case 'fleeing':
        this.handleFleeingState();
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
    this.entity.needs.hunger -= 0.01 * deltaTime;
    this.entity.needs.thirst -= 0.015 * deltaTime;
    this.entity.needs.rest -= 0.005 * deltaTime;
    this.entity.needs.social -= 0.002 * deltaTime;
    
    // Clamp values
    this.entity.needs.hunger = Math.max(0, Math.min(1, this.entity.needs.hunger));
    this.entity.needs.thirst = Math.max(0, Math.min(1, this.entity.needs.thirst));
    this.entity.needs.rest = Math.max(0, Math.min(1, this.entity.needs.rest));
    this.entity.needs.social = Math.max(0, Math.min(1, this.entity.needs.social));
    
    // If needs are critically low, entity takes damage
    if (this.entity.needs.hunger <= 0.1) {
      this.entity.health -= 0.05 * deltaTime;
    }
    
    if (this.entity.needs.thirst <= 0.1) {
      this.entity.health -= 0.1 * deltaTime;
    }
    
    // Age the entity
    this.entity.age += 0.01 * deltaTime;
    
    // Entity starts to die of old age
    if (this.entity.age >= this.entity.maxAge * 0.9) {
      this.entity.health -= 0.02 * deltaTime;
    }
  }

  /**
   * Handle idle behavior - decide what to do next based on needs
   */
  private handleIdleState(tiles: Tile[][]): void {
    if (this.ticksSinceLastAction < 1) return; // Wait a bit before deciding
    
    this.ticksSinceLastAction = 0;
    
    // Priority of needs
    if (this.entity.needs.thirst < 0.3) {
      this.findWaterSource(tiles);
      return;
    }
    
    if (this.entity.needs.hunger < 0.3) {
      this.findFoodSource(tiles);
      return;
    }
    
    if (this.entity.needs.rest < 0.2) {
      this.currentState = 'sleeping';
      this.ticksToNextStateChange = 5; // Sleep for 5 ticks
      return;
    }
    
    // Social/reproduction needs - try to find others of the same kind
    if (this.entity.needs.social < 0.3 || (this.entity.needs.social > 0.7 && this.canReproduce())) {
      this.findSocialInteraction(tiles);
      return;
    }
    
    // Exploration or random movement
    if (Math.random() < 0.3) {
      this.moveRandomly(tiles);
    }
  }

  /**
   * Handle moving behavior
   */
  private handleMovingState(tiles: Tile[][]): void {
    if (this.path.length === 0 || !this.targetTile) {
      this.currentState = 'idle';
      return;
    }
    
    // Move along path
    const nextTile = this.path[0];
    
    // Calculate distance to next tile
    const dx = nextTile.x - this.entity.position.x;
    const dy = nextTile.y - this.entity.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < 0.1) {
      // Reached the next tile in the path
      this.path.shift();
      
      // Update entity position to exact tile center
      this.entity.position.x = nextTile.x;
      this.entity.position.y = nextTile.y;
      
      // Check if we've reached the destination
      if (this.path.length === 0) {
        // We've reached the target
        if (nextTile === this.targetTile) {
          this.arriveAtTarget();
        } else {
          this.currentState = 'idle';
        }
      }
    } else {
      // Move towards the next tile
      const speed = this.entity.attributes.speed * 0.01;
      const normalizedDx = dx / distance;
      const normalizedDy = dy / distance;
      
      this.entity.position.x += normalizedDx * speed;
      this.entity.position.y += normalizedDy * speed;
    }
  }

  /**
   * Handle gathering behavior
   */
  private handleGatheringState(): void {
    if (this.ticksSinceLastAction < 2) {
      this.ticksSinceLastAction += 0.1; // Gathering takes time
      return;
    }
    
    if (!this.targetTile) {
      this.currentState = 'idle';
      return;
    }
    
    // Find a resource to gather
    const resources = this.targetTile.resources;
    if (resources.length > 0) {
      const resourceToGather = resources[0];
      
      // Transfer some resource to entity's inventory
      const gatherAmount = Math.min(1, resourceToGather.quantity);
      resourceToGather.quantity -= gatherAmount;
      
      // Add to inventory or create new entry
      const existingResource = this.entity.inventory.find(r => r.type === resourceToGather.type);
      if (existingResource) {
        existingResource.quantity += gatherAmount;
      } else {
        this.entity.inventory.push({
          type: resourceToGather.type,
          quantity: gatherAmount,
          discovered: true
        });
      }
      
      // If gathered food, satisfy hunger
      if (resourceToGather.type === 'food') {
        this.entity.needs.hunger = Math.min(1, this.entity.needs.hunger + 0.3);
      }
      
      // Remove resource if depleted
      if (resourceToGather.quantity <= 0) {
        this.targetTile.resources = this.targetTile.resources.filter(r => r.quantity > 0);
      }
    }
    
    // Done gathering
    this.ticksSinceLastAction = 0;
    this.currentState = 'idle';
  }

  /**
   * Handle hunting behavior
   */
  private handleHuntingState(): void {
    if (!this.targetEntity) {
      this.currentState = 'idle';
      return;
    }
    
    // If we reach the target, attack it
    const dx = this.targetEntity.position.x - this.entity.position.x;
    const dy = this.targetEntity.position.y - this.entity.position.y;
    const distanceToTarget = Math.sqrt(dx * dx + dy * dy);
    
    if (distanceToTarget < 1.0) {
      // Attack the target
      const damage = this.entity.attributes.strength * 0.2;
      this.targetEntity.health -= damage;
      
      // Add status effect
      this.targetEntity.status.push('wounded');
      
      // Target might flee
      if (this.targetEntity.health < this.targetEntity.maxHealth * 0.3) {
        // 50% chance the target flees
        if (Math.random() < 0.5) {
          // Target would enter fleeing state here
        }
      }
      
      // If target dies, get food
      if (this.targetEntity.health <= 0) {
        // Add food to inventory
        const foodAmount = 2 + Math.floor(Math.random() * 3);
        const existingFood = this.entity.inventory.find(r => r.type === 'food');
        
        if (existingFood) {
          existingFood.quantity += foodAmount;
        } else {
          this.entity.inventory.push({
            type: 'food',
            quantity: foodAmount,
            discovered: true
          });
        }
        
        // Reset state
        this.targetEntity = null;
        this.currentState = 'idle';
      }
    } else {
      // Move towards the target
      this.currentState = 'moving';
      this.targetTile = this.getEntityTile(this.targetEntity);
      // Would calculate path here
    }
  }

  /**
   * Handle fleeing behavior
   */
  private handleFleeingState(): void {
    if (!this.targetEntity) {
      this.currentState = 'idle';
      return;
    }
    
    // Try to move in the opposite direction of the threat
    const dx = this.entity.position.x - this.targetEntity.position.x;
    const dy = this.entity.position.y - this.targetEntity.position.y;
    
    // Normalize the direction
    const distance = Math.sqrt(dx * dx + dy * dy);
    const normalizedDx = dx / distance;
    const normalizedDy = dy / distance;
    
    // Try to move away
    const speed = this.entity.attributes.speed * 0.012;
    this.entity.position.x += normalizedDx * speed;
    this.entity.position.y += normalizedDy * speed;
    
    // If we've gotten far enough away, go back to idle
    if (distance > 10) {
      this.currentState = 'idle';
      this.targetEntity = null;
    }
  }

  /**
   * Handle building behavior
   */
  private handleBuildingState(): void {
    // Building logic not implemented yet
    this.currentState = 'idle';
  }

  /**
   * Handle fighting behavior
   */
  private handleFightingState(): void {
    this.handleHuntingState(); // Uses same logic as hunting for now
  }

  /**
   * Handle sleeping behavior
   */
  private handleSleepingState(): void {
    this.ticksToNextStateChange--;
    
    // Recover energy while sleeping
    this.entity.needs.rest = Math.min(1.0, this.entity.needs.rest + 0.1);
    
    if (this.ticksToNextStateChange <= 0) {
      this.currentState = 'idle';
    }
  }

  /**
   * Handle reproduction behavior
   */
  private handleReproducingState(): void {
    // Reproduction logic not implemented yet
    this.currentState = 'idle';
  }

  /**
   * Handle dying behavior
   */
  private handleDyingState(): void {
    // Entity is dead, just waiting to be removed
    this.entity.status.push('dead');
  }

  /**
   * Find a water source
   */
  private findWaterSource(tiles: Tile[][]): void {
    // Find nearest water tile
    const waterTiles = this.findTilesByType(tiles, ['deep_ocean', 'ocean', 'shallow_water', 'river', 'lake']);
    
    if (waterTiles.length > 0) {
      // Sort by distance and pick the closest one
      const closestWaterTile = this.findClosestTile(waterTiles);
      if (closestWaterTile) {
        this.targetTile = closestWaterTile;
        // Would calculate path here
        this.currentState = 'moving';
      }
    } else {
      // No water found, continue idle
      this.moveRandomly(tiles);
    }
  }

  /**
   * Find a food source
   */
  private findFoodSource(tiles: Tile[][]): void {
    // Check if the entity is predator and should hunt
    if (this.isPredator()) {
      this.findPreyToHunt(tiles);
      return;
    }
    
    // Otherwise look for food resources (berries, plants, etc.)
    const foodTiles = this.findTilesWithResource(tiles, 'food');
    
    if (foodTiles.length > 0) {
      const closestFoodTile = this.findClosestTile(foodTiles);
      if (closestFoodTile) {
        this.targetTile = closestFoodTile;
        this.currentState = 'moving';
        // Would calculate path here
      }
    } else {
      // No food found, move randomly
      this.moveRandomly(tiles);
    }
  }

  /**
   * Find prey to hunt
   */
  private findPreyToHunt(tiles: Tile[][]): void {
    // Find tiles with potential prey
    const preyEntities: Entity[] = [];
    
    // Get list of prey types for this predator
    const preyTypes = this.getPreyTypes();
    
    // Check all tiles for prey
    for (let x = 0; x < tiles.length; x++) {
      for (let y = 0; y < tiles[x].length; y++) {
        const tile = tiles[x][y];
        const prey = tile.entities.filter(e => 
          preyTypes.includes(e.type) && e.health > 0
        );
        
        preyEntities.push(...prey);
      }
    }
    
    if (preyEntities.length > 0) {
      // Sort by distance and pick the closest one
      let closestDistance = Infinity;
      let closestPrey: Entity | null = null;
      
      for (const prey of preyEntities) {
        const dx = prey.position.x - this.entity.position.x;
        const dy = prey.position.y - this.entity.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPrey = prey;
        }
      }
      
      if (closestPrey) {
        this.targetEntity = closestPrey;
        this.currentState = 'hunting';
      }
    } else {
      // No prey found, move randomly
      this.moveRandomly(tiles);
    }
  }

  /**
   * Find social interactions with other entities
   */
  private findSocialInteraction(tiles: Tile[][]): void {
    // Find entities of the same type for social interaction
    const socialEntities: Entity[] = [];
    
    // Check nearby tiles for same-type entities
    for (let x = 0; x < tiles.length; x++) {
      for (let y = 0; y < tiles[x].length; y++) {
        const tile = tiles[x][y];
        const similarEntities = tile.entities.filter(e => 
          e.type === this.entity.type && e.id !== this.entity.id && e.health > 0
        );
        
        socialEntities.push(...similarEntities);
      }
    }
    
    if (socialEntities.length > 0) {
      // Sort by distance and pick the closest one
      let closestDistance = Infinity;
      let closestEntity: Entity | null = null;
      
      for (const otherEntity of socialEntities) {
        const dx = otherEntity.position.x - this.entity.position.x;
        const dy = otherEntity.position.y - this.entity.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < closestDistance) {
          closestDistance = distance;
          closestEntity = otherEntity;
        }
      }
      
      if (closestEntity) {
        // Move towards the other entity
        this.targetEntity = closestEntity;
        this.targetTile = this.getEntityTile(closestEntity);
        this.currentState = 'moving';
      }
    } else {
      // No social entities found, move randomly
      this.moveRandomly(tiles);
    }
  }

  /**
   * Move randomly to explore
   */
  private moveRandomly(tiles: Tile[][]): void {
    const currentTile = this.getCurrentTile(tiles);
    if (!currentTile) return;
    
    // Get neighboring tiles
    const neighbors = this.getNeighbors(tiles, currentTile);
    
    // Filter to only walkable tiles
    const walkableNeighbors = neighbors.filter(tile => 
      tile.walkable !== false && 
      this.canEntityWalkOnBiome(tile.type)
    );
    
    if (walkableNeighbors.length > 0) {
      // Pick a random walkable neighbor
      const randomIndex = Math.floor(Math.random() * walkableNeighbors.length);
      this.targetTile = walkableNeighbors[randomIndex];
      this.path = [this.targetTile]; // Simple one-tile path
      this.currentState = 'moving';
    }
  }

  /**
   * When entity arrives at a target
   */
  private arriveAtTarget(): void {
    if (!this.targetTile) {
      this.currentState = 'idle';
      return;
    }
    
    // Handle different target types
    if (this.targetTile.type === 'water' || 
        this.targetTile.type === 'shallow_water' || 
        this.targetTile.type === 'ocean' || 
        this.targetTile.type === 'river' || 
        this.targetTile.type === 'lake') {
      // Drink water
      this.entity.needs.thirst = 1.0;
      
      // Done drinking
      this.currentState = 'idle';
      
    } else if (this.targetTile.resources.some(r => r.type === 'food' && r.quantity > 0)) {
      // Start gathering food
      this.currentState = 'gathering';
      
    } else if (this.targetTile.entities.some(e => 
      e.id !== this.entity.id && e.type === this.entity.type)) {
      // Social interaction
      this.entity.needs.social = 1.0;
      
      // Check for reproduction
      if (this.canReproduce() && 
          this.targetTile.entities.some(e => 
            e.id !== this.entity.id && 
            e.type === this.entity.type && 
            e.age >= e.maxAge * 0.3 && // Adult
            e.age <= e.maxAge * 0.7)) { // Not too old
        
        // Start reproduction
        this.currentState = 'reproducing';
      } else {
        // Just socialized, go back to idle
        this.currentState = 'idle';
      }
      
    } else {
      // Nothing special here, back to idle
      this.currentState = 'idle';
    }
  }

  /**
   * Check if entity is a predator
   */
  private isPredator(): boolean {
    return ['wolf', 'bear', 'dragon', 'demon', 'orc'].includes(this.entity.type);
  }

  /**
   * Get prey types for this predator
   */
  private getPreyTypes(): EntityType[] {
    switch (this.entity.type) {
      case 'wolf':
        return ['rabbit', 'deer'];
      case 'bear':
        return ['fish', 'deer', 'human'];
      case 'dragon':
        return ['human', 'elf', 'dwarf', 'orc', 'wolf', 'bear'];
      case 'orc':
        return ['human', 'elf'];
      case 'demon':
        return ['human', 'elf', 'dwarf', 'orc'];
      default:
        return [];
    }
  }

  /**
   * Check if entity can reproduce
   */
  private canReproduce(): boolean {
    return (
      this.entity.age >= this.entity.maxAge * 0.3 &&
      this.entity.age <= this.entity.maxAge * 0.7 &&
      this.entity.health >= this.entity.maxHealth * 0.7
    );
  }

  /**
   * Die method
   */
  private die(): void {
    this.entity.health = 0;
    this.entity.status.push('dead');
    this.currentState = 'dying';
  }

  /**
   * Utility: Find tiles by biome type
   */
  private findTilesByType(tiles: Tile[][], types: BiomeType[]): Tile[] {
    const matchingTiles: Tile[] = [];
    
    for (let x = 0; x < tiles.length; x++) {
      for (let y = 0; y < tiles[x].length; y++) {
        if (types.includes(tiles[x][y].type)) {
          matchingTiles.push(tiles[x][y]);
        }
      }
    }
    
    return matchingTiles;
  }

  /**
   * Utility: Find tiles with specific resources
   */
  private findTilesWithResource(tiles: Tile[][], resourceType: ResourceType): Tile[] {
    const matchingTiles: Tile[] = [];
    
    for (let x = 0; x < tiles.length; x++) {
      for (let y = 0; y < tiles[x].length; y++) {
        if (tiles[x][y].resources.some(r => r.type === resourceType && r.quantity > 0)) {
          matchingTiles.push(tiles[x][y]);
        }
      }
    }
    
    return matchingTiles;
  }

  /**
   * Utility: Find closest tile from a list
   */
  private findClosestTile(tileList: Tile[]): Tile | null {
    if (tileList.length === 0) return null;
    
    let closestDistance = Infinity;
    let closestTile = tileList[0];
    
    for (const tile of tileList) {
      const dx = tile.x - this.entity.position.x;
      const dy = tile.y - this.entity.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < closestDistance) {
        closestDistance = distance;
        closestTile = tile;
      }
    }
    
    return closestTile;
  }

  /**
   * Utility: Get entity's current tile
   */
  private getCurrentTile(tiles: Tile[][]): Tile | null {
    const x = Math.floor(this.entity.position.x);
    const y = Math.floor(this.entity.position.y);
    
    if (x >= 0 && x < tiles.length && y >= 0 && y < tiles[0].length) {
      return tiles[x][y];
    }
    
    return null;
  }

  /**
   * Utility: Get neighboring tiles
   */
  private getNeighbors(tiles: Tile[][], tile: Tile): Tile[] {
    const neighbors: Tile[] = [];
    const { x, y } = tile;
    
    // Check 8 surrounding tiles
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue; // Skip the center tile
        
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx >= 0 && nx < tiles.length && ny >= 0 && ny < tiles[0].length) {
          neighbors.push(tiles[nx][ny]);
        }
      }
    }
    
    return neighbors;
  }

  /**
   * Utility: Get tile from entity
   */
  private getEntityTile(entity: Entity): Tile | null {
    const x = Math.floor(entity.position.x);
    const y = Math.floor(entity.position.y);
    
    // This would need access to the tiles array from somewhere
    // For now it's a stub that returns null
    return null;
  }

  /**
   * Check if entity can walk on a specific biome
   */
  private canEntityWalkOnBiome(biomeType: BiomeType): boolean {
    // Water creatures can swim
    if (this.entity.type === 'fish') {
      return ['deep_ocean', 'ocean', 'shallow_water', 'river', 'lake'].includes(biomeType);
    }
    
    // Birds can go anywhere
    if (this.entity.type === 'bird') {
      return true;
    }
    
    // Most land creatures avoid water
    if (['deep_ocean', 'ocean'].includes(biomeType)) {
      return false;
    }
    
    // Some creatures might have biome preferences
    switch (this.entity.type) {
      case 'elf':
        // Elves prefer forests
        return !['deep_ocean', 'ocean', 'volcanic'].includes(biomeType);
      case 'dwarf':
        // Dwarves prefer mountains
        return !['deep_ocean', 'ocean', 'shallow_water', 'river', 'lake'].includes(biomeType);
      case 'orc':
        // Orcs can traverse most terrain
        return !['deep_ocean', 'ocean'].includes(biomeType);
      default:
        // Most entities avoid deep water
        return !['deep_ocean', 'ocean'].includes(biomeType);
    }
  }
}

/**
 * Create a new entity based on type (3D version)
 * This is a duplicate implementation that needs to be consolidated with the original createEntity
 */
export function createEntity3D(
  type: EntityType,
  x: number, 
  y: number,
  name?: string
): Entity {
  const id = uuidv4();
  
  // Base entity properties
  let entity: Entity = {
    id,
    type,
    name: name || generateName(type),
    age: 0,
    maxAge: 100, // Will be adjusted based on type
    health: 100,
    maxHealth: 100, // Will be adjusted based on type
    position: { x, y },
    attributes: {
      strength: 5,
      intelligence: 5,
      speed: 5,
      resilience: 5
    },
    needs: {
      hunger: 1.0,
      thirst: 1.0,
      rest: 1.0,
      social: 1.0
    },
    inventory: [],
    faction: undefined,
    status: [],
    mesh: null
  };
  
  // Customize entity based on type
  switch (type) {
    case 'human':
      entity.maxAge = 80;
      entity.attributes.intelligence = 8;
      entity.attributes.speed = 6;
      break;
      
    case 'elf':
      entity.maxAge = 300;
      entity.attributes.intelligence = 9;
      entity.attributes.speed = 8;
      entity.attributes.strength = 6;
      break;
      
    case 'dwarf':
      entity.maxAge = 150;
      entity.attributes.strength = 8;
      entity.attributes.resilience = 9;
      entity.attributes.speed = 4;
      break;
      
    case 'orc':
      entity.maxAge = 60;
      entity.attributes.strength = 10;
      entity.attributes.resilience = 8;
      entity.attributes.intelligence = 4;
      break;
      
    case 'wolf':
      entity.maxAge = 15;
      entity.attributes.speed = 9;
      entity.attributes.strength = 7;
      entity.needs.social = 0.7; // Wolves are pack animals
      break;
      
    case 'bear':
      entity.maxAge = 25;
      entity.attributes.strength = 12;
      entity.attributes.resilience = 10;
      entity.attributes.speed = 7;
      entity.maxHealth = 150;
      entity.health = 150;
      break;
      
    case 'deer':
      entity.maxAge = 10;
      entity.attributes.speed = 10;
      entity.attributes.strength = 3;
      entity.attributes.intelligence = 4;
      break;
      
    case 'rabbit':
      entity.maxAge = 5;
      entity.attributes.speed = 11;
      entity.attributes.strength = 1;
      entity.maxHealth = 30;
      entity.health = 30;
      break;
      
    case 'bird':
      entity.maxAge = 3;
      entity.attributes.speed = 12;
      entity.maxHealth = 20;
      entity.health = 20;
      break;
      
    case 'fish':
      entity.maxAge = 4;
      entity.attributes.speed = 8;
      entity.maxHealth = 25;
      entity.health = 25;
      break;
      
    case 'dragon':
      entity.maxAge = 1000;
      entity.attributes.strength = 20;
      entity.attributes.intelligence = 15;
      entity.attributes.speed = 15;
      entity.attributes.resilience = 20;
      entity.maxHealth = 500;
      entity.health = 500;
      break;
      
    case 'demon':
      entity.maxAge = 800;
      entity.attributes.strength = 15;
      entity.attributes.intelligence = 12;
      entity.attributes.speed = 10;
      entity.attributes.resilience = 15;
      entity.maxHealth = 300;
      entity.health = 300;
      break;
      
    case 'zombie':
      entity.maxAge = 999; // Undead
      entity.attributes.strength = 6;
      entity.attributes.intelligence = 1;
      entity.attributes.speed = 3;
      entity.attributes.resilience = 8;
      entity.needs = {
        hunger: 0.5, // Always hungry for brains
        thirst: 1.0, // Undead don't need water
        rest: 1.0,   // Undead don't need rest
        social: 1.0  // Undead don't need social
      };
      break;
  }
  
  return entity;
}

/**
 * Create a 3D mesh for an entity (3D Model version)
 * This is a duplicate implementation that needs to be consolidated with the original createEntityMesh
 */
export function createEntityMesh3D(entity: Entity): THREE.Object3D {
  // Base geometry based on entity type
  let geometry: THREE.BufferGeometry;
  let color: number;
  
  // Size scale for different entities
  const sizeMap: Record<EntityType, number> = {
    human: 0.3,
    elf: 0.3,
    dwarf: 0.25,
    orc: 0.35,
    wolf: 0.25,
    bear: 0.4,
    deer: 0.3,
    rabbit: 0.15,
    bird: 0.15,
    fish: 0.2,
    dragon: 0.8,
    demon: 0.5,
    zombie: 0.3,
    skeleton: 0.3,
    elemental: 0.4,
    bandit: 0.3
  };
  
  // Color based on entity type
  const colorMap: Record<EntityType, THREE.Color> = {
    human: new THREE.Color(0xFFD700), // Human: Gold
    elf: new THREE.Color(0x32CD32),   // Elf: Lime green
    dwarf: new THREE.Color(0xA52A2A), // Dwarf: Brown
    orc: new THREE.Color(0x006400),   // Orc: Dark green
    wolf: new THREE.Color(0x708090),  // Wolf: Slate gray
    bear: new THREE.Color(0x8B4513),  // Bear: Brown
    deer: new THREE.Color(0xD2B48C),  // Deer: Tan
    rabbit: new THREE.Color(0xF5F5DC), // Rabbit: Beige
    bird: new THREE.Color(0x4169E1),  // Bird: Royal blue
    fish: new THREE.Color(0x40E0D0),  // Fish: Turquoise
    dragon: new THREE.Color(0x8A2BE2), // Dragon: Blue violet
    demon: new THREE.Color(0xDC143C), // Demon: Crimson
    zombie: new THREE.Color(0x3CB371), // Zombie: Medium sea green
    skeleton: new THREE.Color(0xF0FFFF), // Skeleton: Azure
    elemental: new THREE.Color(0x00FFFF), // Elemental: Cyan
    bandit: new THREE.Color(0x2F4F4F)  // Bandit: Dark slate gray
  };
  
  const size = sizeMap[entity.type] || 0.3;
  const entityColor = colorMap[entity.type] || new THREE.Color(0xFF00FF);
  
  // Create geometry based on type
  if (['human', 'elf', 'dwarf', 'orc', 'zombie', 'skeleton', 'bandit'].includes(entity.type)) {
    // Humanoid: capsule
    geometry = new THREE.CapsuleGeometry(size / 2, size, 8, 8);
  } else if (['wolf', 'bear', 'deer', 'rabbit'].includes(entity.type)) {
    // Four-legged: box with adjusted dimensions
    geometry = new THREE.BoxGeometry(size * 1.5, size * 0.8, size);
  } else if (entity.type === 'bird') {
    // Bird: sphere
    geometry = new THREE.SphereGeometry(size, 8, 8);
  } else if (entity.type === 'fish') {
    // Fish: cone
    geometry = new THREE.ConeGeometry(size, size * 2, 8);
  } else if (entity.type === 'dragon') {
    // Dragon: more complex combination (for now a larger capsule)
    geometry = new THREE.CapsuleGeometry(size / 2, size * 2, 8, 8);
  } else {
    // Default
    geometry = new THREE.BoxGeometry(size, size, size);
  }
  
  // Create material
  const material = new THREE.MeshStandardMaterial({
    color: entityColor,
    emissive: entityColor.clone().multiplyScalar(0.2),
    roughness: 0.7,
    metalness: 0.3
  });
  
  // Create mesh
  const mesh = new THREE.Mesh(geometry, material);
  
  // Adjust position to be above ground
  mesh.position.y = size / 2;
  
  // Add to entity
  entity.mesh = mesh;
  
  return mesh;
}

/**
 * Update entity mesh position based on entity data (3D Model version)
 * This is a duplicate implementation that needs to be consolidated with the original updateEntityMesh
 */
export function updateEntityMesh3D(entity: Entity): void {
  if (!entity.mesh) return;
  
  // Update position
  entity.mesh.position.x = entity.position.x;
  entity.mesh.position.z = entity.position.y; // y in data becomes z in 3D
}

/**
 * Generate a random name for an entity
 */
function generateName(entityType: EntityType): string {
  // Simple name generation - would be expanded with more varied names
  const humanNames = ['Alan', 'Beth', 'Carlos', 'Diana', 'Elias', 'Fiona', 'George', 'Hannah'];
  const elfNames = ['Arwen', 'Legolas', 'Galadriel', 'Elrond', 'Tauriel', 'Thranduil'];
  const dwarfNames = ['Gimli', 'Thorin', 'Balin', 'Dwalin', 'Gloin', 'Bombur'];
  const orcNames = ['Gork', 'Mork', 'Gruk', 'Azog', 'Bolg', 'Shagrat'];
  const animalNames = ['Spot', 'Rover', 'Fluffy', 'Hunter', 'Swift', 'Shadow'];
  const monsterNames = ['Doom', 'Smaug', 'Balrog', 'Darkness', 'Terror', 'Blight'];
  
  let nameList: string[];
  
  switch (true) {
    case entityType === 'human':
      nameList = humanNames;
      break;
    case entityType === 'elf':
      nameList = elfNames;
      break;
    case entityType === 'dwarf':
      nameList = dwarfNames;
      break;
    case entityType === 'orc':
      nameList = orcNames;
      break;
    case ['wolf', 'bear', 'deer', 'rabbit', 'bird', 'fish'].includes(entityType):
      nameList = animalNames;
      break;
    default:
      nameList = monsterNames;
  }
  
  const randomIndex = Math.floor(Math.random() * nameList.length);
  const baseName = nameList[randomIndex];
  
  // Add a unique identifier for non-sentient beings
  if (!['human', 'elf', 'dwarf', 'orc'].includes(entityType)) {
    const id = Math.floor(Math.random() * 1000);
    return `${baseName}-${id}`;
  }
  
  return baseName;
}
