import { Canvas } from '@react-three/fiber';
import GameContainer from './components/world/GameContainer';
import PowerBar from './components/ui/PowerBar';
import TopBar from './components/ui/TopBar';
import HelpOverlay from './components/ui/HelpOverlay';
import RightRail from './components/ui/RightRail';
import WorldLawsPanel from './components/ui/WorldLawsPanel';
import AchievementWatcher from './components/ui/AchievementWatcher';
import HoverTooltip from './components/ui/HoverTooltip';
import MapLabels from './components/ui/MapLabels';
import FloatingText from './components/ui/FloatingText';
import ScreenFlash from './components/ui/ScreenFlash';
import MapLayerBadge from './components/ui/MapLayerBadge';
import { useGameStore } from './store/gameStore';
import { useHotkeys } from './hooks/useHotkeys';

function App() {
  useHotkeys();
  const uiHidden = useGameStore((state) => state.uiHidden);

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
        {/* Both belong to the world, not the HUD, so they survive Hide UI */}
        <MapLabels />
        <FloatingText />
        <ScreenFlash />
        <div className="game-ui">
          {/* The bar draws its own peek button while hidden, so it always mounts */}
          <PowerBar />
          {!uiHidden && (
            <>
              <TopBar />
              <RightRail />
              <MapLayerBadge />
              <HoverTooltip />
            </>
          )}
          <WorldLawsPanel />
          <AchievementWatcher />
          <HelpOverlay />
        </div>
      </div>
    </div>
  );
}

export default App;
