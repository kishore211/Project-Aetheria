// src/utils/particleSystem.ts
import * as THREE from 'three';
import { currentVisualSettings } from './visualSettings';

/**
 * Represents a particle effect in the game
 */
export interface ParticleEffect {
  id: string;
  position: { x: number; y: number; z: number };
  type: ParticleType;
  duration: number;  // Total lifetime in seconds
  elapsed: number;   // Elapsed time in seconds
  particles: THREE.Points | null;
  system: ParticleSystem;
  emissionRate: number; // Particles per second
  nextEmissionTime: number;
}

/**
 * Types of particle effects
 */
export enum ParticleType {
  FOOTSTEP = 'footstep',
  DUST = 'dust',
  SPLASH = 'splash',
  BLOOD = 'blood',
  SMOKE = 'smoke',
  FIRE = 'fire',
  SPARKS = 'sparks',
  MAGIC = 'magic',
  SNOW = 'snow',
  LEAVES = 'leaves',
  HEALING = 'healing',
}

/**
 * Configuration for a particle effect
 */
interface ParticleConfig {
  spriteUrl: string;
  color: THREE.Color;
  size: number;
  count: number;
  spread: number;
  opacity: number;
  lifetime: { min: number; max: number };
  gravity: number;
  speed: { min: number; max: number };
  blending: THREE.Blending;
  fadeOut: boolean;
  rotation?: boolean;
  scale?: { x: number; y: number };
}

/**
 * Handles particle effects in the game world
 */
export class ParticleSystem {
  private scene: THREE.Scene;
  private textureLoader: THREE.TextureLoader;
  private particleEffects: Map<string, ParticleEffect>;
  private clock: THREE.Clock;
  private particleConfigs: Map<ParticleType, ParticleConfig>;
  private particleGeometries: Map<ParticleType, THREE.BufferGeometry>;
  private particleMaterials: Map<ParticleType, THREE.PointsMaterial>;
  
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.textureLoader = new THREE.TextureLoader();
    this.particleEffects = new Map();
    this.clock = new THREE.Clock();
    this.particleConfigs = new Map();
    this.particleGeometries = new Map();
    this.particleMaterials = new Map();
    
    // Initialize particle configurations
    this.initParticleConfigs();
  }
  
  /**
   * Initialize particle configs for all effect types
   */
  private initParticleConfigs(): void {
    // Footprint/dust particles
    this.particleConfigs.set(ParticleType.FOOTSTEP, {
      spriteUrl: '/examples/textures/sprites/circle.png',
      color: new THREE.Color(0xbbbbbb),
      size: 0.08,
      count: 3,
      spread: 0.05,
      opacity: 0.6,
      lifetime: { min: 0.5, max: 1.0 },
      gravity: 0,
      speed: { min: 0.01, max: 0.03 },
      blending: THREE.NormalBlending,
      fadeOut: true
    });
    
    // Water splash
    this.particleConfigs.set(ParticleType.SPLASH, {
      spriteUrl: '/examples/textures/sprites/circle.png',
      color: new THREE.Color(0x88ccff),
      size: 0.1,
      count: 8,
      spread: 0.15,
      opacity: 0.7,
      lifetime: { min: 0.5, max: 1.2 },
      gravity: 0.5,
      speed: { min: 0.05, max: 0.1 },
      blending: THREE.AdditiveBlending,
      fadeOut: true
    });
    
    // Blood effect
    this.particleConfigs.set(ParticleType.BLOOD, {
      spriteUrl: '/examples/textures/sprites/disc.png',
      color: new THREE.Color(0xaa0000),
      size: 0.08,
      count: 8,
      spread: 0.2,
      opacity: 0.8,
      lifetime: { min: 0.8, max: 1.5 },
      gravity: 0.8,
      speed: { min: 0.03, max: 0.1 },
      blending: THREE.NormalBlending,
      fadeOut: true
    });
    
    // Smoke effect
    this.particleConfigs.set(ParticleType.SMOKE, {
      spriteUrl: '/examples/textures/sprites/ball.png',
      color: new THREE.Color(0x999999),
      size: 0.25,
      count: 10,
      spread: 0.2,
      opacity: 0.5,
      lifetime: { min: 2.0, max: 4.0 },
      gravity: -0.05, // Smoke rises
      speed: { min: 0.01, max: 0.05 },
      blending: THREE.NormalBlending,
      fadeOut: true,
      scale: { x: 1.0, y: 1.5 } // Stretched vertically
    });
    
    // Fire effect
    this.particleConfigs.set(ParticleType.FIRE, {
      spriteUrl: '/examples/textures/sprites/spark1.png',
      color: new THREE.Color(0xff5500),
      size: 0.15,
      count: 20,
      spread: 0.1,
      opacity: 0.8,
      lifetime: { min: 0.8, max: 1.2 },
      gravity: -0.2, // Fire rises
      speed: { min: 0.05, max: 0.1 },
      blending: THREE.AdditiveBlending,
      fadeOut: true,
      rotation: true
    });
    
    // Sparks effect
    this.particleConfigs.set(ParticleType.SPARKS, {
      spriteUrl: '/examples/textures/sprites/spark1.png',
      color: new THREE.Color(0xffcc00),
      size: 0.06,
      count: 15,
      spread: 0.3,
      opacity: 1.0,
      lifetime: { min: 0.3, max: 1.0 },
      gravity: 0.3,
      speed: { min: 0.1, max: 0.2 },
      blending: THREE.AdditiveBlending,
      fadeOut: true
    });
    
    // Magic effect
    this.particleConfigs.set(ParticleType.MAGIC, {
      spriteUrl: '/examples/textures/sprites/disc.png',
      color: new THREE.Color(0x88ffff),
      size: 0.12,
      count: 15,
      spread: 0.4,
      opacity: 0.9,
      lifetime: { min: 1.0, max: 2.0 },
      gravity: -0.05,
      speed: { min: 0.05, max: 0.1 },
      blending: THREE.AdditiveBlending,
      fadeOut: true,
      rotation: true
    });
    
    // Snow effect
    this.particleConfigs.set(ParticleType.SNOW, {
      spriteUrl: '/examples/textures/sprites/snowflake1.png',
      color: new THREE.Color(0xffffff),
      size: 0.1,
      count: 50,
      spread: 5.0, // Wide area
      opacity: 0.7,
      lifetime: { min: 4.0, max: 8.0 },
      gravity: 0.05,
      speed: { min: 0.02, max: 0.04 },
      blending: THREE.NormalBlending,
      fadeOut: false,
      rotation: true
    });
    
    // Leaves effect
    this.particleConfigs.set(ParticleType.LEAVES, {
      spriteUrl: '/examples/textures/sprites/circle.png',
      color: new THREE.Color(0x44aa44),
      size: 0.08,
      count: 10,
      spread: 1.0,
      opacity: 0.8,
      lifetime: { min: 3.0, max: 6.0 },
      gravity: 0.03,
      speed: { min: 0.02, max: 0.05 },
      blending: THREE.NormalBlending,
      fadeOut: true,
      rotation: true
    });
    
    // Healing effect
    this.particleConfigs.set(ParticleType.HEALING, {
      spriteUrl: '/examples/textures/sprites/disc.png',
      color: new THREE.Color(0x00ff88),
      size: 0.1,
      count: 12,
      spread: 0.2,
      opacity: 0.8,
      lifetime: { min: 1.0, max: 1.5 },
      gravity: -0.1, // Float upward
      speed: { min: 0.03, max: 0.06 },
      blending: THREE.AdditiveBlending,
      fadeOut: true
    });
  }
  
  /**
   * Preload all particle textures
   */
  public preloadTextures(): Promise<void[]> {
    const texturePromises: Promise<void>[] = [];
    
    // Load each unique texture
    const uniqueTexturePaths = new Set<string>();
    this.particleConfigs.forEach(config => {
      uniqueTexturePaths.add(config.spriteUrl);
    });
    
    for (const path of uniqueTexturePaths) {
      const texturePromise = new Promise<void>((resolve) => {
        this.textureLoader.load(
          path,
          () => {
            resolve();
          },
          undefined,
          (error) => {
            console.error(`Error loading particle texture ${path}:`, error);
            resolve(); // Resolve anyway to not block loading
          }
        );
      });
      
      texturePromises.push(texturePromise);
    }
    
    return Promise.all(texturePromises);
  }
  
  /**
   * Create a new particle effect at the specified position
   */
  public createEffect(
    type: ParticleType,
    position: { x: number; y: number; z: number },
    duration = 1.0,
    scale = 1.0
  ): string {
    // Check if particle effects are enabled in settings
    if (!currentVisualSettings.enableParticleEffects) {
      return '';
    }
    
    const config = this.particleConfigs.get(type);
    if (!config) {
      console.error(`Unknown particle type: ${type}`);
      return '';
    }
    
    // Create a unique ID for this effect
    const id = `${type}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    // Create or reuse geometry for this particle type
    let geometry = this.particleGeometries.get(type);
    if (!geometry) {
      geometry = new THREE.BufferGeometry();
      this.particleGeometries.set(type, geometry);
    }
    
    // Create or reuse material for this particle type
    let material = this.particleMaterials.get(type);
    if (!material) {
      const texture = this.textureLoader.load(config.spriteUrl);
      material = new THREE.PointsMaterial({
        size: config.size * scale,
        map: texture,
        blending: config.blending,
        depthWrite: false,
        transparent: true,
        vertexColors: true
      });
      this.particleMaterials.set(type, material);
    }
    
    // Create points for all particles
    const particleSystem = new THREE.Points(geometry, material);
    
    // Position the particle system
    particleSystem.position.set(position.x, position.y, position.z);
    this.scene.add(particleSystem);
    
    // Create the effect object
    const effect: ParticleEffect = {
      id,
      position: { ...position },
      type,
      duration,
      elapsed: 0,
      particles: particleSystem,
      system: this,
      emissionRate: config.count / duration,
      nextEmissionTime: 0
    };
    
    // Store the effect
    this.particleEffects.set(id, effect);
    
    return id;
  }
  
  /**
   * Update all particle effects
   */
  public update(): void {
    if (!currentVisualSettings.enableParticleEffects) return;
    
    const delta = this.clock.getDelta();
    
    // Update each effect
    this.particleEffects.forEach((effect, id) => {
      // Update elapsed time
      effect.elapsed += delta;
      
      // Remove expired effects
      if (effect.elapsed >= effect.duration) {
        this.removeEffect(id);
        return;
      }
      
      // Update particles based on their type
      this.updateParticleEffect(effect, delta);
    });
  }
  
  /**
   * Update a specific particle effect
   */
  private updateParticleEffect(effect: ParticleEffect, delta: number): void {
    const config = this.particleConfigs.get(effect.type);
    if (!config || !effect.particles) return;
    
    // Add more particles over time for continuous effects
    if (effect.elapsed >= effect.nextEmissionTime && effect.elapsed < effect.duration * 0.8) {
      const numNewParticles = Math.floor(effect.emissionRate * delta);
      if (numNewParticles > 0) {
        this.emitParticles(effect, numNewParticles);
        effect.nextEmissionTime = effect.elapsed + 1.0 / effect.emissionRate;
      }
    }
    
    // Update existing particles
    if (effect.particles.geometry instanceof THREE.BufferGeometry) {
      const positions = effect.particles.geometry.getAttribute('position');
      const velocities = effect.particles.geometry.getAttribute('velocity');
      const lifetimes = effect.particles.geometry.getAttribute('lifetime');
      const colors = effect.particles.geometry.getAttribute('color');
      
      if (!positions || !velocities || !lifetimes || !colors) return;
      
      for (let i = 0; i < positions.count; i++) {
        // Update lifetime
        const currentLifetime = lifetimes.getX(i);
        const maxLifetime = lifetimes.getY(i);
        const newLifetime = currentLifetime + delta;
        lifetimes.setX(i, newLifetime);
        
        // Skip dead particles
        if (newLifetime >= maxLifetime) continue;
        
        // Update position based on velocity
        const vx = velocities.getX(i);
        const vy = velocities.getY(i);
        const vz = velocities.getZ(i);
        
        positions.setX(i, positions.getX(i) + vx * delta);
        positions.setY(i, positions.getY(i) + vy * delta);
        positions.setZ(i, positions.getZ(i) + vz * delta);
        
        // Apply gravity
        velocities.setY(i, vy - config.gravity * delta);
        
        // Update opacity based on lifetime
        if (config.fadeOut) {
          const lifeRatio = 1.0 - newLifetime / maxLifetime;
          colors.setW(i, config.opacity * lifeRatio);
        }
      }
      
      positions.needsUpdate = true;
      velocities.needsUpdate = true;
      lifetimes.needsUpdate = true;
      colors.needsUpdate = true;
    }
  }
  
  /**
   * Emit new particles for an effect
   */
  private emitParticles(effect: ParticleEffect, count: number): void {
    const config = this.particleConfigs.get(effect.type);
    if (!config || !effect.particles) return;
    
    // Create new particles
    const positions = [];
    const velocities = [];
    const colors = [];
    const lifetimes = [];
    
    for (let i = 0; i < count; i++) {
      // Random position within spread radius
      const offsetX = (Math.random() - 0.5) * 2 * config.spread;
      const offsetY = (Math.random() - 0.5) * 2 * config.spread;
      const offsetZ = (Math.random() - 0.5) * 2 * config.spread;
      
      // Calculate velocity (direction + speed)
      const speed = config.speed.min + Math.random() * (config.speed.max - config.speed.min);
      const angle = Math.random() * Math.PI * 2;
      const vx = Math.cos(angle) * speed;
      const vy = (Math.random() * 0.5 + 0.5) * speed; // Mostly upward
      const vz = Math.sin(angle) * speed;
      
      // Set lifetime
      const lifetime = config.lifetime.min + Math.random() * (config.lifetime.max - config.lifetime.min);
      
      // Add to arrays
      positions.push(offsetX, offsetY, offsetZ);
      velocities.push(vx, vy, vz);
      colors.push(
        config.color.r,
        config.color.g,
        config.color.b,
        config.opacity
      );
      lifetimes.push(0, lifetime); // Current lifetime, max lifetime
    }
    
    // Update the geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.Float32BufferAttribute(velocities, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geometry.setAttribute('lifetime', new THREE.Float32BufferAttribute(lifetimes, 2));
    
    // Update the particle system
    if (effect.particles.geometry instanceof THREE.BufferGeometry) {
      effect.particles.geometry.dispose();
    }
    effect.particles.geometry = geometry;
  }
  
  /**
   * Remove an effect by ID
   */
  public removeEffect(id: string): void {
    const effect = this.particleEffects.get(id);
    if (!effect) return;
    
    // Remove from scene
    if (effect.particles) {
      this.scene.remove(effect.particles);
      if (effect.particles.geometry instanceof THREE.BufferGeometry) {
        effect.particles.geometry.dispose();
      }
      if (effect.particles.material instanceof THREE.Material) {
        effect.particles.material.dispose();
      }
    }
    
    // Remove from effects list
    this.particleEffects.delete(id);
  }
  
  /**
   * Create a footstep effect at an entity's position
   */
  public createFootstepEffect(position: { x: number; y: number }, biomeType: string): string {
    const z = 0.01; // Just above ground level
    
    // Adjust particle type based on biome
    let particleType = ParticleType.FOOTSTEP;
    
    if (['ocean', 'shallow_water', 'river', 'lake'].includes(biomeType)) {
      particleType = ParticleType.SPLASH;
    } else if (['snow', 'tundra', 'ice', 'glacier'].includes(biomeType)) {
      particleType = ParticleType.SNOW;
    } else if (['desert', 'savanna', 'mesa', 'badlands'].includes(biomeType)) {
      particleType = ParticleType.DUST;
    }
    
    return this.createEffect(particleType, { x: position.x, y: position.y, z }, 0.5);
  }
  
  /**
   * Create an attack effect at the target position
   */
  public createAttackEffect(position: { x: number; y: number }): string {
    // Create blood particles just above ground level
    return this.createEffect(ParticleType.BLOOD, { x: position.x, y: position.y, z: 0.2 }, 1.0);
  }
  
  /**
   * Create a healing effect at an entity's position
   */
  public createHealingEffect(position: { x: number; y: number }): string {
    // Create healing particles around the entity
    return this.createEffect(ParticleType.HEALING, { x: position.x, y: position.y, z: 0.2 }, 1.0);
  }
  
  /**
   * Create a magic effect at a position
   */
  public createMagicEffect(position: { x: number; y: number }): string {
    // Create magic particles
    return this.createEffect(ParticleType.MAGIC, { x: position.x, y: position.y, z: 0.2 }, 1.5);
  }
  
  /**
   * Create weather particle effects
   */
  public createWeatherEffect(
    weatherType: string, 
    center: { x: number; y: number }, 
    radius: number
  ): string {
    let particleType: ParticleType;
    let duration = 10.0;
    const z = 5.0; // High above the ground
    
    switch (weatherType) {
      case 'snow':
      case 'blizzard':
        particleType = ParticleType.SNOW;
        break;
      case 'rain':
      case 'heavy_rain':
      case 'thunderstorm':
        particleType = ParticleType.SPLASH;
        duration = 5.0;
        break;
      case 'sandstorm':
        particleType = ParticleType.DUST;
        break;
      default:
        return ''; // No effect for clear weather
    }
    
    return this.createEffect(
      particleType,
      { x: center.x, y: center.y, z },
      duration,
      radius
    );
  }
}
