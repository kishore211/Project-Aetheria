import { useRef, useEffect } from 'react';
import { OrbitControls } from '@react-three/drei';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useThree } from '@react-three/fiber';
import { useGameEngine } from '../../hooks/useGameEngine';
import { MAP_SIZES } from '../../types/world';
import { useGameStore } from '../../store/gameStore';

const GameContainer = () => {
  // Reference to orbit controls for custom configuration
  const controlsRef = useRef<OrbitControlsImpl>(null);
  
  // Game state
  const { worldSize, customWorldSize, isGamePaused } = useGameStore();
  
  // Get game engine state and methods
  const { isInitialized, worldRef } = useGameEngine();
  
  // Get Three.js camera
  const { camera } = useThree();
  
  // Configure orbit controls based on world size
  useEffect(() => {
    if (controlsRef.current && isInitialized) {
      const mapSize = worldSize === 'custom' ? customWorldSize : MAP_SIZES[worldSize];
      const worldSizeUnits = mapSize * 0.5;
      
      // Configure min/max distances
      controlsRef.current.minDistance = worldSizeUnits * 0.2;
      controlsRef.current.maxDistance = worldSizeUnits * 3;
      
      // Set maximum polar angle to prevent going below the ground plane
      controlsRef.current.maxPolarAngle = Math.PI / 2.1;
      
      // Make controls more responsive
      controlsRef.current.enableDamping = true;
      controlsRef.current.dampingFactor = 0.1;
    }
  }, [isInitialized, worldSize, customWorldSize]);
  
  return (
    <>
      {/* Main directional light representing the sun */}
      <directionalLight 
        position={[10, 20, 15]} 
        intensity={1.5} 
        castShadow 
      />
      
      {/* Ambient light for overall scene illumination */}
      <ambientLight intensity={0.5} />
      
      {/* Ground plane for reference and shadow receiving */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -0.01, 0]} 
        receiveShadow
      >
        <planeGeometry args={[1000, 1000]} />
        <shadowMaterial transparent opacity={0.2} />
      </mesh>
      
      {/* Orbit controls for camera manipulation */}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        target={[0, 0, 0]}
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2.1}
      />
    </>
  );
};

export default GameContainer;
