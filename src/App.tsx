import { Canvas } from '@react-three/fiber';
import GameContainer from './components/world/GameContainer';
import PowerBar from './components/ui/PowerBar';
import PowerCard from './components/ui/PowerCard';
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
import AgeOverlay from './components/ui/AgeOverlay';
import PossessionBanner from './components/ui/PossessionBanner';
import { useGameStore } from './store/gameStore';
import { useHotkeys } from './hooks/useHotkeys';

function App() {
  useHotkeys();
  const uiHidden = useGameStore((state) => state.uiHidden);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="game-container flex flex-1">
        {/*
          Orthographic and straight down.
          *
          * This was a perspective camera at a 34-degree tilt, which is why the
          * map read as "Minecraft boxes": at any tilt you see the *sides* of
          * every tile, and perspective makes distant tiles lean. WorldBox is a
          * flat top-down tilemap and no amount of tile art can imitate one from
          * an angle — the geometry has to go.
          *
          * The camera keeps the default +Y up vector: OrbitControls measures its
          * polar angle *from* `camera.up`, so overriding it to -Z put the world
          * on the equator of the orbit and rendered the map edge-on as a line.
          * Straight down is expressed as a polar angle instead, in
          * GameContainer.
          */}
        <Canvas
          orthographic
          camera={{ position: [0, 200, 0], zoom: 14, near: 0.1, far: 600 }}
          gl={{ antialias: false }}
          className="w-full h-full"
        >
          <color attach="background" args={['#0b1120']} />
          <GameContainer />
        </Canvas>
        {/* Both belong to the world, not the HUD, so they survive Hide UI */}
        <MapLabels />
        {/* Under the HUD but over the world: the era colours the place, not the panels */}
        <AgeOverlay />
        <FloatingText />
        <ScreenFlash />
        <div className="game-ui">
          {/* The bar draws its own peek button while hidden, so it always mounts */}
          <PowerBar />
          <PowerCard />
          {!uiHidden && (
            <>
              <TopBar />
              <RightRail />
              <MapLayerBadge />
              <PossessionBanner />
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
