# Camera Setup and Model Scaling

This document outlines the camera configuration and model scaling in Project Aetheria.

## Camera Configuration

### Orthographic Camera

Project Aetheria uses an orthographic camera for rendering the world, which provides a consistent scale regardless of distance and works well with the game's god-like perspective.

```tsx
// App.tsx camera setup
<OrthographicCamera
  makeDefault
  position={[30, 30, 30]}
  zoom={15}
  near={0.1}
  far={1000}
/>
```

Key orthographic camera parameters:
- **position**: Camera positioned above and to the side of the world [30, 30, 30]
- **zoom**: Controls how much of the scene is visible (15 is a good balance for seeing the whole map)
- **near/far**: Defines the view frustum (0.1 to 1000)
- **makeDefault**: Marks this as the default camera for the scene

### Camera Controls

The camera uses OrbitControls from @react-three/drei to allow the player to pan, rotate, and zoom:

```tsx
// GameContainer.tsx camera controls configuration
controlsRef.current.minDistance = worldSizeUnits * 0.2;
controlsRef.current.maxDistance = worldSizeUnits * 5; // Increased for better map viewing
controlsRef.current.maxPolarAngle = Math.PI / 2.1;
controlsRef.current.enableDamping = true;
controlsRef.current.dampingFactor = 0.1;
controlsRef.current.target.set(0, 0, 0); // Center on the world
```

## Model Scaling

### Entity Scale Factors

Different entities have different scale factors to ensure they look proportionate to the world and to each other:

- Humans: 0.0005 (reduced from 0.005)
- Other entities: Various scales defined in entitySystem.ts

### Model Data Configuration

Models are configured in the ModelManager with specific scale factors and position offsets:

```typescript
// Example from modelManager.ts
['human', {
  path: './assets/models/human/Using A Fax Machine.fbx',
  scale: 0.0005, // 10x smaller than before for proper proportions
  animations: {
    'idle': 'Idle',
    'walking': 'Walking',
    'running': 'Running',
    'attacking': 'Attack'
  },
  yOffset: 0.15, // Helps prevent z-fighting with terrain
  rotationOffset: Math.PI
}]
```

## Best Practices

When adding new models or adjusting camera settings:

1. Maintain proper proportions between different entity types
2. Consider visibility at different zoom levels
3. Ensure models don't clip through terrain (adjust yOffset as needed)
4. Test camera settings with various world sizes
5. Maintain the orthographic projection for consistent visual style
