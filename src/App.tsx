import { Canvas } from '@react-three/fiber';
import GameContainer from './components/world/GameContainer';
import Sidebar from './components/ui/Sidebar';
import TimeControls from './components/ui/TimeControls';
import TopBar from './components/ui/TopBar';
import HelpOverlay from './components/ui/HelpOverlay';
import RightRail from './components/ui/RightRail';
import WorldLawsPanel from './components/ui/WorldLawsPanel';
import AchievementWatcher from './components/ui/AchievementWatcher';

function App() {
  return (
    <div className="w-full h-full flex flex-col">
      <div className="game-container flex flex-1">
        <Canvas
          camera={{ position: [0, 50, 34], fov: 55, far: 800 }}
          gl={{ antialias: true }}
          className="w-full h-full"
        >
          <color attach="background" args={['#0b1120']} />
          <fog attach="fog" args={['#0b1120', 140, 420]} />
          <GameContainer />
        </Canvas>
        <div className="game-ui">
          <Sidebar />
          <TopBar />
          <TimeControls />
          <RightRail />
          <WorldLawsPanel />
          <AchievementWatcher />
          <HelpOverlay />
        </div>
      </div>
    </div>
  );
}

export default App;
