// src/hooks/useAssetPreloader.ts
import { useState, useEffect } from 'react';
import { ensureModelsLoaded } from '../utils/modelPreloader';

interface PreloadState {
  loading: boolean;
  complete: boolean;
  progress: number;
  errors: string[];
}

/**
 * Custom hook for preloading game assets before starting the game
 */
export function useAssetPreloader() {
  const [state, setState] = useState<PreloadState>({
    loading: true,
    complete: false,
    progress: 0,
    errors: []
  });

  useEffect(() => {
    const loadAssets = async () => {
      setState({
        loading: true,
        complete: false,
        progress: 10,
        errors: []
      });

      try {
        // Preload 3D models
        console.log('Preloading 3D models...');
        setState(prev => ({ ...prev, progress: 30 }));
        
        const modelsLoaded = await ensureModelsLoaded();
        
        if (!modelsLoaded) {
          console.warn('Some 3D models failed to preload, continuing with placeholders');
          setState(prev => ({
            ...prev,
            errors: [...prev.errors, 'Some 3D models failed to load and will use placeholders instead.']
          }));
        }
        
        setState(prev => ({ ...prev, progress: 70 }));
        
        // Preload other assets here if needed
        // ...
        
        // Mark loading as complete
        setState({
          loading: false,
          complete: true,
          progress: 100,
          errors: state.errors
        });
        
        console.log('Asset preloading complete!');
      } catch (error) {
        console.error('Asset preloading error:', error);
        setState(prev => ({
          ...prev, 
          loading: false,
          errors: [...prev.errors, `Asset preloading error: ${error instanceof Error ? error.message : String(error)}`]
        }));
      }
    };
    
    loadAssets();
  }, []);
  
  return state;
}
