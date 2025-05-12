// src/utils/visualSettings.ts
/**
 * Visual settings for the game
 * This file contains settings that control the appearance of the game
 */

// Visual Style Options
export enum VisualStyle {
  PIXELATED = 'pixelated',  // 2D sprite-based pixelated look
  LOW_POLY = 'low-poly',    // Simple 3D models
  DETAILED = 'detailed'     // More detailed 3D models
}

// Game visual settings
export interface VisualSettings {
  style: VisualStyle;
  usePixelation: boolean;        // Apply pixel filter to the entire scene
  showEntityLabels: boolean;     // Show name labels above entities
  showHealthBars: boolean;       // Show health bars for entities
  showStatusEffects: boolean;    // Show status effect icons/animations
  enableShadows: boolean;        // Enable shadows
  enableParticleEffects: boolean; // Enable particle effects
  colorMode: 'normal' | 'high-contrast' | 'monochrome'; // Color mode for accessibility
}

// Default visual settings
export const DEFAULT_VISUAL_SETTINGS: VisualSettings = {
  style: VisualStyle.PIXELATED,
  usePixelation: true,
  showEntityLabels: true,
  showHealthBars: true,
  showStatusEffects: true,
  enableShadows: true,
  enableParticleEffects: true,
  colorMode: 'normal'
};

// Current game visual settings
export let currentVisualSettings: VisualSettings = { ...DEFAULT_VISUAL_SETTINGS };

/**
 * Update visual settings
 * @param newSettings Partial settings to update
 */
export function updateVisualSettings(newSettings: Partial<VisualSettings>): void {
  currentVisualSettings = {
    ...currentVisualSettings,
    ...newSettings
  };
  
  // Apply settings immediately
  applyVisualSettings();
}

/**
 * Apply the current visual settings to the game
 */
function applyVisualSettings(): void {
  console.log('Applying visual settings:', currentVisualSettings);
  
  // Apply different settings based on the visual style
  if (currentVisualSettings.style === VisualStyle.PIXELATED) {
    document.body.classList.add('pixelated-mode');
    document.body.classList.remove('low-poly-mode', 'detailed-mode');
  } 
  else if (currentVisualSettings.style === VisualStyle.LOW_POLY) {
    document.body.classList.add('low-poly-mode');
    document.body.classList.remove('pixelated-mode', 'detailed-mode');
  }
  else if (currentVisualSettings.style === VisualStyle.DETAILED) {
    document.body.classList.add('detailed-mode');
    document.body.classList.remove('pixelated-mode', 'low-poly-mode');
  }
  
  // Apply pixelation filter if enabled
  if (currentVisualSettings.usePixelation) {
    document.body.classList.add('enable-pixelation');
  } else {
    document.body.classList.remove('enable-pixelation');
  }
  
  // Apply color mode
  document.body.classList.remove('color-normal', 'color-high-contrast', 'color-monochrome');
  document.body.classList.add(`color-${currentVisualSettings.colorMode}`);
  
  // Dispatch event so components can react to changes
  window.dispatchEvent(new CustomEvent('visualSettingsChanged', { 
    detail: currentVisualSettings 
  }));
}

/**
 * Initialize visual settings
 */
export function initVisualSettings(): void {
  // Apply default settings
  applyVisualSettings();
}
