import React from 'react';
import { Pause, Play, FastForward } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';

const TimeControls: React.FC = () => {
  const { 
    gameSpeed, 
    setGameSpeed, 
    isGamePaused, 
    togglePause,
    season,
    year
  } = useGameStore();
  
  return (
    <div className="ui-timebar fixed bottom-3 left-1/2 -translate-x-1/2 bg-secondary/95 backdrop-blur border border-muted/40 px-3 py-1.5 rounded-full flex items-center gap-2 sm:gap-3 shadow-lg">
      {/* Time controls */}
      <div className="flex items-center space-x-2">
        <button
          onClick={togglePause}
          className="tool-btn w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-muted rounded-full hover:bg-muted/80"
          title={isGamePaused ? "Play" : "Pause"}
        >
          {isGamePaused ? <Play size={18} /> : <Pause size={18} />}
        </button>
        
        <button
          onClick={() => setGameSpeed(1)}
          className={`tool-btn w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full ${
            gameSpeed === 1 && !isGamePaused ? 'bg-accent text-accent-foreground' : 'bg-muted hover:bg-muted/80'
          }`}
          title="Normal Speed"
        >
          <FastForward size={18} />
        </button>
        
        <button
          onClick={() => setGameSpeed(2)}
          className={`tool-btn w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full ${
            gameSpeed === 2 && !isGamePaused ? 'bg-accent text-accent-foreground' : 'bg-muted hover:bg-muted/80'
          }`}
          title="Fast Speed"
        >
          <div className="flex">
            <FastForward size={18} />
            <FastForward size={18} className="-ml-3" />
          </div>
        </button>
        
        <button
          onClick={() => setGameSpeed(3)}
          className={`tool-btn w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full ${
            gameSpeed === 3 && !isGamePaused ? 'bg-accent text-accent-foreground' : 'bg-muted hover:bg-muted/80'
          }`}
          title="Ultra Speed"
        >
          <div className="flex">
            <FastForward size={18} />
            <FastForward size={18} className="-ml-3" />
            <FastForward size={18} className="-ml-3" />
          </div>
        </button>
      </div>
      
      {/* Time information — the top bar already carries the full calendar */}
      <div className="hidden md:block text-foreground text-xs whitespace-nowrap">
        <span className="mr-2">Year {year}</span>
        <span className="capitalize text-muted-foreground">{season}</span>
      </div>
    </div>
  );
};

export default TimeControls;
