// src/components/AssetPreloader.tsx
import React, { useEffect } from 'react';
import { useAssetPreloader } from '../hooks/useAssetPreloader';

interface AssetPreloaderProps {
  onComplete: () => void;
  children?: React.ReactNode;
}

/**
 * Component to preload assets before rendering the main content
 */
export function AssetPreloader({ onComplete, children }: AssetPreloaderProps) {
  const { loading, complete, progress, errors } = useAssetPreloader();
  
  useEffect(() => {
    if (complete) {
      onComplete();
    }
  }, [complete, onComplete]);

  if (loading || !complete) {
    return (
      <div className="preloader">
        <div className="preloader-content">
          <h2>Project Aetheria</h2>
          <div className="preloader-progress">
            <div className="preloader-bar" style={{ width: `${progress}%` }}></div>
            <div className="preloader-text">{progress}%</div>
          </div>
          <div className="preloader-status">Loading assets...</div>
          
          {errors.length > 0 && (
            <div className="preloader-errors">
              {errors.map((error, index) => (
                <div key={index} className="preloader-error">{error}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
}
