// src/utils/animatedSpriteFactory.ts
import * as THREE from 'three';
import { SpriteData } from './spriteHandler';

/**
 * Class to manage animated sprite creation and animation
 */
export class AnimatedSpriteFactory {
  private textureLoader: THREE.TextureLoader;
  private clock: THREE.Clock;
  private spriteAnimations: Map<string, {
    sprite: THREE.Sprite;
    spriteData: SpriteData;
    currentAnimation: string;
    currentFrame: number;
    elapsed: number;
  }>;

  constructor() {
    this.textureLoader = new THREE.TextureLoader();
    this.clock = new THREE.Clock();
    this.spriteAnimations = new Map();
  }

  /**
   * Create a new animated sprite
   */
  public createAnimatedSprite(
    id: string,
    spriteData: SpriteData,
    position: { x: number; y: number; z: number },
    scale: number = 1.0,
    initialAnimation: string = 'idle'
  ): THREE.Sprite {
    // Load texture
    const texture = this.textureLoader.load(spriteData.textureUrl);
    
    // Configure texture for pixel-perfect rendering
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    
    // Create sprite material
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1
    });
    
    // Create sprite
    const sprite = new THREE.Sprite(material);
    sprite.position.set(position.x, position.y, position.z);
    sprite.scale.set(scale, scale, 1);
    
    // Set initial animation frame
    this.setFrame(sprite, spriteData, 0);
    
    // Add to animations map for updates
    this.spriteAnimations.set(id, {
      sprite,
      spriteData,
      currentAnimation: initialAnimation,
      currentFrame: 0,
      elapsed: 0
    });
    
    return sprite;
  }

  /**
   * Set the current animation for a sprite
   */
  public setAnimation(id: string, animationName: string): void {
    const data = this.spriteAnimations.get(id);
    if (!data) return;
    
    // Only change if different animation and animation exists
    if (data.currentAnimation !== animationName && 
        data.spriteData.animations && 
        data.spriteData.animations[animationName]) {
      data.currentAnimation = animationName;
      
      // Reset to first frame of animation
      if (data.spriteData.animations[animationName]) {
        data.currentFrame = data.spriteData.animations[animationName].startFrame;
        this.setFrame(data.sprite, data.spriteData, data.currentFrame);
      }
      
      // Reset elapsed time
      data.elapsed = 0;
    }
  }

  /**
   * Set a specific frame on the sprite
   */
  private setFrame(sprite: THREE.Sprite, spriteData: SpriteData, frame: number): void {
    if (!(sprite.material instanceof THREE.SpriteMaterial) || !sprite.material.map) {
      return;
    }
    
    // Calculate UV coordinates for the frame
    const frameCol = frame % spriteData.columns;
    const frameRow = Math.floor(frame / spriteData.columns);
    
    const uvOffsetX = frameCol / spriteData.columns;
    const uvOffsetY = 1 - (frameRow + 1) / spriteData.rows; // Y is inverted in UV space
    const uvSizeX = 1 / spriteData.columns;
    const uvSizeY = 1 / spriteData.rows;
    
    // Apply texture offset and scale for the sprite frame
    sprite.material.map.offset.set(uvOffsetX, uvOffsetY);
    sprite.material.map.repeat.set(uvSizeX, uvSizeY);
  }

  /**
   * Update all animated sprites
   */
  public update(): void {
    const deltaTime = this.clock.getDelta();
    
    for (const [_, data] of this.spriteAnimations.entries()) {
      // Skip if no animation is set
      if (!data.currentAnimation || 
          !data.spriteData.animations || 
          !data.spriteData.animations[data.currentAnimation]) {
        continue;
      }
      
      // Get animation parameters
      const anim = data.spriteData.animations[data.currentAnimation];
      const frameCount = anim.endFrame - anim.startFrame + 1;
      
      // Only animate if we have multiple frames and a valid FPS
      if (frameCount > 1 && data.spriteData.animationFPS > 0) {
        // Update elapsed time
        data.elapsed += deltaTime;
        
        // Calculate frame based on elapsed time and FPS
        const frameTime = 1.0 / data.spriteData.animationFPS;
        const totalFrameTime = frameTime * frameCount;
        
        // Calculate current frame
        let newFrameIndex;
        
        if (anim.loop) {
          // Loop animation
          const elapsedModLoop = data.elapsed % totalFrameTime;
          newFrameIndex = Math.floor(elapsedModLoop / frameTime);
        } else {
          // Play once animation
          newFrameIndex = Math.min(Math.floor(data.elapsed / frameTime), frameCount - 1);
        }
        
        // Convert to actual frame number
        const newFrame = anim.startFrame + newFrameIndex;
        
        // Update frame if changed
        if (newFrame !== data.currentFrame) {
          data.currentFrame = newFrame;
          this.setFrame(data.sprite, data.spriteData, newFrame);
        }
      }
    }
  }

  /**
   * Clean up and remove sprite animation tracking
   */
  public removeAnimation(id: string): void {
    this.spriteAnimations.delete(id);
  }
}
