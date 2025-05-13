// src/utils/deviceCapabilities.ts
// Helper functions to detect device capabilities

/**
 * Check if the current device has sufficient GPU capabilities to render 3D models
 */
export function canSupport3DModels(): boolean {
  // Check for WebGL support
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      console.warn('WebGL not supported. Falling back to sprite mode.');
      return false;
    }
    
    // Check if WebGL version and extensions support complex 3D rendering
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      console.log('Using GPU: ' + renderer);
      
      // Check if this is a weak GPU (e.g., most Intel integrated)
      // This is a simplified check that could be improved with a more complete list
      const lowPowerGPUs = [
        'intel', 'hd graphics', 'uhd graphics', 
        'gma', 'mali-', 'adreno', 'powervr'
      ];
      
      const isLowPower = lowPowerGPUs.some(gpu => 
        renderer.toLowerCase().includes(gpu)
      );
      
      if (isLowPower) {
        console.warn('Low-power GPU detected. Falling back to sprite mode for better performance.');
        return false;
      }
    }
    
    // Check available memory (Chrome only)
    const performance = window.performance as any;
    if (performance && performance.memory) {
      const maxMemory = performance.memory.jsHeapSizeLimit;
      if (maxMemory < 512 * 1024 * 1024) { // Less than 512MB
        console.warn('Limited memory available. Falling back to sprite mode.');
        return false;
      }
    }
    
    return true;
  } catch (e) {
    console.error('Error checking WebGL support:', e);
    return false;
  }
}

/**
 * Get device performance tier (high, medium, low)
 */
export function getDevicePerformanceTier(): 'high' | 'medium' | 'low' {
  // Check for hardware concurrency (CPU cores/threads)
  const cores = navigator.hardwareConcurrency || 2;
  
  // Check for device memory (in GB) - modern browsers only
  const memory = (navigator as any).deviceMemory || 4;
  
  if (cores >= 8 && memory >= 8) {
    return 'high';
  } else if (cores >= 4 && memory >= 4) {
    return 'medium';
  } else {
    return 'low';
  }
}
