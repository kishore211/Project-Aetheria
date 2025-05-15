// src/components/ui/ReferenceMapUploader.tsx
import React, { useState, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';

interface ReferenceMapUploaderProps {
  onClose?: () => void;
}

const ReferenceMapUploader: React.FC<ReferenceMapUploaderProps> = ({ onClose }) => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { setReferenceMapUrl, regenerateWorld } = useGameStore();
  
  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Clear previous states
    setError(null);
    
    // Check file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    
    // Generate preview URL
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };
  
  // Handle submit button click
  const handleSubmit = async () => {
    if (!imagePreview) {
      setError('Please select an image first.');
      return;
    }
    
    try {
      setIsProcessing(true);
      
      // Store the image URL in the game store
      setReferenceMapUrl(imagePreview);
      
      // Regenerate the world using the reference map
      await regenerateWorld();
      
      // Close the modal if provided
      if (onClose) {
        onClose();
      }
    } catch (err) {
      console.error('Error processing reference map:', err);
      setError('Failed to process the reference map. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Trigger file input click
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };
  
  // Reset everything
  const handleReset = () => {
    setImagePreview(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  return (
    <div className="bg-gray-800 rounded-lg p-4 w-full max-w-md">
      <h2 className="text-xl font-bold mb-4 text-white">Upload Reference Map</h2>
      
      {/* File input (hidden) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      
      {/* Preview area */}
      <div 
        className="border-2 border-dashed border-gray-600 rounded-lg p-4 mb-4 cursor-pointer flex items-center justify-center"
        style={{ minHeight: '200px' }}
        onClick={triggerFileInput}
      >
        {imagePreview ? (
          <img 
            src={imagePreview} 
            alt="Map Reference Preview" 
            className="max-h-64 max-w-full object-contain"
          />
        ) : (
          <div className="text-center text-gray-400">
            <p>Click to select a reference map image</p>
            <p className="text-sm">(PNG, JPG, or other image formats)</p>
          </div>
        )}
      </div>
      
      {/* Error message */}
      {error && (
        <div className="text-red-500 mb-4">
          {error}
        </div>
      )}
      
      {/* Actions */}
      <div className="flex gap-2">
        <button
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded disabled:bg-blue-400"
          onClick={handleSubmit}
          disabled={!imagePreview || isProcessing}
        >
          {isProcessing ? 'Processing...' : 'Use This Map'}
        </button>
        
        <button
          className="bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded"
          onClick={handleReset}
          disabled={isProcessing}
        >
          Reset
        </button>
        
        {onClose && (
          <button
            className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded"
            onClick={onClose}
            disabled={isProcessing}
          >
            Cancel
          </button>
        )}
      </div>
      
      {/* Help text */}
      <div className="mt-4 text-gray-400 text-sm">
        <p>Your reference map colors will be mapped to game biomes.</p>
        <p>Blue areas will become water, green areas forests, etc.</p>
        <p>For best results, use a map with distinct color regions.</p>
      </div>
    </div>
  );
};

export default ReferenceMapUploader;
