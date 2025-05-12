import { Canvas } from '@react-three/fiber';
import GameContainer from './components/world/GameContainer';
import Sidebar from './components/ui/Sidebar';
import TimeControls from './components/ui/TimeControls';
import InfoPanel from './components/ui/InfoPanel';

function App() {
  return (
    <div className="w-full h-full flex flex-col">
      <div className="game-container flex flex-1">
        <Canvas
          shadows
          camera={{ position: [10, 10, 10], fov: 60 }}
          gl={{ antialias: true }}
          className="w-full h-full"
        >
          <GameContainer />
        </Canvas>
        <div className="game-ui">
          <Sidebar />
          <TimeControls />
          <InfoPanel />
        </div>
      </div>
    </div>
  );
}

export default App;
