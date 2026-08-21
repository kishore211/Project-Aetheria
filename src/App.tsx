import { Canvas } from '@react-three/fiber';
import GameContainer from './components/world/GameContainer';
import Sidebar from './components/ui/Sidebar';
import TimeControls from './components/ui/TimeControls';
import InfoPanel from './components/ui/InfoPanel';
import TopBar from './components/ui/TopBar';
import EventLog from './components/ui/EventLog';
import HelpOverlay from './components/ui/HelpOverlay';

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
          <color attach="background" args={['#0b1120']} />
          <fog attach="fog" args={['#0b1120', 60, 160]} />
          <GameContainer />
        </Canvas>
        <div className="game-ui">
          <Sidebar />
          <TopBar />
          <TimeControls />
          <InfoPanel />
          <EventLog />
          <HelpOverlay />
        </div>
      </div>
    </div>
  );
}

export default App;
