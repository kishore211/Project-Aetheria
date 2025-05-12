import React from 'react';
import { Pause, Play, FastForward, FastForwardIcon } from 'lucide-react';
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
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-secondary px-4 py-2 rounded-md flex items-center space-x-4">
      {/* Time controls */}
      <div className="flex items-center space-x-2">
        <button
          onClick={togglePause}
          className="w-10 h-10 flex items-center justify-center bg-muted rounded-full hover:bg-muted/80"
          title={isGamePaused ? "Play" : "Pause"}
        >
          {isGamePaused ? <Play size={18} /> : <Pause size={18} />}
        </button>
        
        <button
          onClick={() => setGameSpeed(1)}
          className={`w-10 h-10 flex items-center justify-center rounded-full 
            ${gameSpeed === 1 && !isGamePaused ? "bg-accent text-accent-foreground" : "bg-muted hover:bg-muted/80"}`}
          title="Normal Speed"
        >
          <FastForward size={18} />
        </button>
        
        <button
          onClick={() => setGameSpeed(2)}
          className={`w-10 h-10 flex items-center justify-center rounded-full 
            ${gameSpeed === 2 && !isGamePaused ? "bg-accent text-accent-foreground" : "bg-muted hover:bg-muted/80"}`}
          title="Fast Speed"
        >
          <div className="flex">
            <FastForward size={18} />
            <FastForward size={18} className="-ml-3" />
          </div>
        </button>
        
        <button
          onClick={() => setGameSpeed(3)}
          className={`w-10 h-10 flex items-center justify-center rounded-full 
            ${gameSpeed === 3 && !isGamePaused ? "bg-accent text-accent-foreground" : "bg-muted hover:bg-muted/80"}`}
          title="Ultra Speed"
        >
          <div className="flex">
            <FastForward size={18} />
            <FastForward size={18} className="-ml-3" />
            <FastForward size={18} className="-ml-3" />
          </div>
        </button>
      </div>
      
      {/* Time information */}
      <div className="text-foreground text-sm">
        <span className="mr-3">Year: {year}</span>
        <span className="capitalize">{season}</span>
      </div>
    </div>
  );
};

export default TimeControls;
