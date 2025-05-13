# 3D Models Integration

This document outlines the integration of 3D models in Project Aetheria to replace sprite-based entity representations.

## Overview

The 3D model integration allows for the replacement of 2D sprite-based entities with fully animated 3D models. This provides a more immersive visual experience, particularly when combined with the first-person "God Mode" camera.

## Implementation

### Model Management

The system uses a `ModelManager` class that handles loading, instancing, and animating 3D models. This includes:

- Loading FBX models using Three.js's FBXLoader
- Creating instances of models for individual entities
- Managing animations and animation transitions
- Positioning and rotating models based on entity movement
- Scaling models appropriately for the game world (humans use scale: 0.0005)
- Positioning models with proper yOffset to prevent z-fighting with terrain

### Integration with Existing Systems

The 3D model system is integrated with the existing entity visualization system through the `VisualizationManager`. The key changes include:

1. Entity visualization now checks if an entity should use a 3D model
2. Human entities are currently set to use the Mixamo 3D model "Using A Fax Machine"
3. Model animations are mapped to entity states (idle, walking, attacking, etc.)
4. Fallback to sprite-based visualization if model loading fails

### File Structure

Models are stored in the `/public/assets/models/` directory, organized by entity type:

```
/public/assets/models/
  |-- human/
      |-- using_fax_machine.fbx
  |-- other_entity_type/
      |-- model_files.fbx
```

### Animation System

Models use an animation mixer system from Three.js, which allows for:

- Animation blending
- Animation loops
- Transitioning between animations based on entity state

## Extending the System

To add new 3D models for other entity types:

1. Add the FBX file to the appropriate directory under `/public/assets/models/`
2. Update the ModelManager's `modelDataMap` to include the new entity type
3. Configure the model parameters (scale, animations, offsets) in the model data

## Performance Considerations

For optimal performance:

- Models are preloaded for commonly used entity types
- Model instances are reused when possible
- Model complexity should be kept manageable for large numbers of entities
- Consider implementing level-of-detail (LOD) for distant entities

## Future Improvements

Planned improvements to the 3D model system:

- Support for more entity types
- Custom animations for different entity actions
- Animation blending for smoother transitions
- Level-of-detail (LOD) system for performance optimization
- Physics-based movement and interactions
