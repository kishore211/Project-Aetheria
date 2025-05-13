import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import GameContainer from './components/world/GameContainer';
import Sidebar from './components/ui/Sidebar';
import TimeControls from './components/ui/TimeControls';
import InfoPanel from './components/ui/InfoPanel';
import { AssetPreloader } from './components/AssetPreloader';

// Import the preloader CSS
import './styles/preloader.css';

function App() {
  const [, setAssetsLoaded] = useState(false);
  
  // Handle asset loading completion
  const handleAssetsLoaded = () => {
    console.log('Assets successfully loaded, starting game');
    setAssetsLoaded(true);
  };

  return (
    <div className="w-full h-full flex flex-col">
      <AssetPreloader onComplete={handleAssetsLoaded}>
        <div className="game-container flex flex-1">
          <Canvas
            shadows
            gl={{ antialias: true }}
            className="w-full h-full"
          >
            {/* Use OrthographicCamera for better 2D pixel art style and full map viewing */}
            <OrthographicCamera
              makeDefault
              position={[30, 30, 30]}
              zoom={15}
              near={0.1}
              far={1000}
            />
            <GameContainer />
          </Canvas>
          <div className="game-ui">
            <Sidebar />
            <TimeControls />
            <InfoPanel />
          </div>
        </div>
      </AssetPreloader>
    </div>
  );
}

export default App;
