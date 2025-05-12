# Pixelated Aesthetic in Project Aetheria

This document explains the implementation of the pixelated aesthetic and graphical style in Project Aetheria.

## Overview

Project Aetheria uses a hybrid approach combining 3D terrain with 2D sprite-based entities. This creates a unique visual style that maintains the charm of classic god games while utilizing modern rendering techniques.

## Key Features

### 1. Sprite-Based Entity System

- Entities are rendered as billboarded sprites that always face the camera
- Sprite sheets enable frame-based animations for various entity states
- Pixel art aesthetic is preserved with `THREE.NearestFilter` for crisp textures

### 2. Animation System

- Different animations based on entity states (idle, walking, attacking, etc.)
- Directional sprite flipping based on movement direction
- Visual effects for status changes (wounded, fleeing, dead, etc.)

### 3. Fallback Mechanism

The sprite system includes a fallback hierarchy:
1. First tries to load PNG files from `/public/assets/textures/entities/`
2. Falls back to base64 encoded sprites if files aren't found
3. Creates simple placeholder sprites if no textures are available

### 4. Status Visualizations

Entities display their status through visual cues:
- Health bars that change color based on remaining health
- Orientation changes (e.g., dead entities rotate horizontally)
- Transparency effects for different states
- Color tinting for status effects
- Animation selection based on current state

## Implementation Details

### Sprite Sheets

Each entity sprite sheet follows a standardized format:
- 4x4 grid (16 frames total)
- Rows are organized by animation type:
  - Row 1: Idle animation (frames 0-3)
  - Row 2: Movement animation (frames 4-7)
  - Row 3: Action animation (attacking/gathering) (frames 8-11)
  - Row 4: Status animation (hurt/dying) (frames 12-15)

### Key Files

- `entitySystemMinimal.ts`: Handles entity creation and state updates
- `spriteHandler.ts`: Manages sprite loading, animation, and effects
- `entitySprites.ts`: Contains base64 encoded sprite placeholders
- `/public/assets/textures/entities/`: Directory for PNG sprite sheets

### Particle System

The particle system uses sprites to create dynamic visual effects:

- **Particle Types**:
  - Footsteps/dust when entities move
  - Splash effects for water interaction
  - Blood particles for combat
  - Magic/healing particles for special abilities
  - Weather effects (snow, rain) for environmental conditions
  - Fire and smoke for environmental features

- **Implementation**:
  - Uses sprite textures from `/public/assets/textures/particles/`
  - Dynamically creates and manages particle lifetimes
  - Applies physics (gravity, velocity) to particles
  - Adjusts particle appearance based on entity status and biome type

### Minecraft-Style Terrain

The terrain system uses textures inspired by Minecraft:

- Pixelated textures are applied to terrain tiles
- Different textures based on biome type (grass, sand, snow, etc.)
- Water has animated textures with flowing effect
- Simple 3D structures (trees, rocks) use block-like geometries with pixel textures

## Using the System

The sprite system automatically handles entity visuals based on their type and state. The game engine simply needs to update entity status values, and the visualization system will reflect these changes appropriately.

```typescript
// Example: Entity visualization update
function updateEntityVisualization(entity, deltaTime) {
  // Get appropriate sprite data and animation
  const spriteData = getSpriteDataForEntity(entity.type);
  const animationName = getAnimationForEntityStatus(entity);
  
  // Update animation frame
  if (entity.mesh && entity.mesh instanceof THREE.Sprite) {
    // Update animation
    entity.animationFrame = animateSprite(
      entity.mesh, 
      spriteData, 
      animationName, 
      deltaTime, 
      entity.animationFrame || 0
    );
    
    // Apply status visual effects
    applyStatusEffectsToSprite(entity.mesh, entity);
    
    // Update direction based on movement
    updateSpriteDirection(entity.mesh, entity);
    
    // Create particles for status effects
    if (entity.status.includes('wounded')) {
      particleSystem.createEffect('blood', entity.position, 0.8);
    }
  }
}
```

## Future Improvements

- Create full sprite sheets for all entity types with proper animations
- Implement seasonal variations for entities
- Add environmental interaction animations
- Create smooth transitions between animations
- Enhance particle effects for more activities and weather conditions
- Add dynamic lighting that interacts with the sprites
- Implement shader effects for special abilities and environmental features
