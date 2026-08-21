import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { soundManager } from '../../utils/soundManager';
import {
  CloudRain, CloudSun, Crown, Eye, EyeOff, Flower2, Leaf, Moon, Music, Music2,
  Snowflake, Sun, Sunrise, Sunset, Users, Volume2, VolumeX,
} from 'lucide-react';

const timeIcons = {
  dawn: <Sunrise size={16} className="text-amber-300" />,
  day: <Sun size={16} className="text-yellow-300" />,
  dusk: <Sunset size={16} className="text-orange-400" />,
  night: <Moon size={16} className="text-blue-300" />,
};

const seasonIcons = {
  spring: <Flower2 size={16} className="text-pink-300" />,
  summer: <Sun size={16} className="text-yellow-300" />,
  autumn: <Leaf size={16} className="text-orange-400" />,
  winter: <Snowflake size={16} className="text-cyan-300" />,
};

const TopBar = () => {
  const { population, year, day, season, timeOfDay, weather, kingdoms } = useGameStore();
  const showUnitIcons = useGameStore((state) => state.showUnitIcons);
  const toggleUnitIcons = useGameStore((state) => state.toggleUnitIcons);
  const [muted, setMuted] = useState(false);
  const [music, setMusic] = useState(false);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundManager.setMuted(next);
    if (next) soundManager.stopRain();
  };

  const toggleMusic = () => {
    const next = !music;
    setMusic(next);
    if (next) soundManager.startMusic();
    else soundManager.stopMusic();
  };

  return (
    <div className="ui-topbar fixed top-2 left-1/2 -translate-x-1/2 flex items-center gap-x-3 gap-y-1 flex-wrap justify-center max-w-[min(46rem,calc(100vw-2rem))] bg-secondary/90 backdrop-blur px-4 py-1.5 rounded-2xl shadow-lg text-xs sm:text-sm text-foreground border border-muted/40">
      <span className="flex items-center gap-1.5" title="World population">
        <Users size={16} className="text-emerald-300" />
        {population}
      </span>

      {kingdoms.length > 0 && (
        <>
          <span className="w-px h-4 bg-muted/60" />
          <span className="flex items-center gap-1.5" title="Kingdoms">
            <Crown size={16} className="text-amber-300" />
            {kingdoms.length}
          </span>
        </>
      )}

      <span className="w-px h-4 bg-muted/60" />
      <span className="flex items-center gap-1.5 capitalize whitespace-nowrap" title={`Year ${year}, ${season}, day ${day}`}>
        {seasonIcons[season]}
        <span className="hidden sm:inline">Year </span>{year}
        <span className="hidden sm:inline"> · {season}, Day {day}</span>
      </span>

      <span className="w-px h-4 bg-muted/60" />
      <span className="flex items-center gap-1.5 capitalize" title={`Time of day: ${timeOfDay}`}>
        {timeIcons[timeOfDay]}
        <span className="hidden sm:inline">{timeOfDay}</span>
      </span>

      <span className="w-px h-4 bg-muted/60" />
      <span className="flex items-center gap-1.5 capitalize" title={`Weather: ${weather}`}>
        {weather === 'clear'
          ? <CloudSun size={16} className="text-slate-300" />
          : <CloudRain size={16} className="text-blue-300" />}
        <span className="hidden sm:inline">{weather}</span>
      </span>

      <span className="w-px h-4 bg-muted/60" />
      <button
        type="button"
        title={showUnitIcons ? 'Hide the icons above creatures' : 'Show what each creature is doing'}
        className={`tool-btn ${showUnitIcons ? 'text-emerald-300' : 'text-muted-foreground'} hover:text-foreground`}
        onClick={toggleUnitIcons}
      >
        {showUnitIcons ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>
      <button
        type="button"
        title={music ? 'Stop the ambient score' : 'Play an ambient score'}
        className={`tool-btn ${music ? 'text-amber-200' : 'text-muted-foreground'} hover:text-foreground`}
        onClick={toggleMusic}
      >
        {music ? <Music size={16} /> : <Music2 size={16} />}
      </button>
      <button
        type="button"
        title={muted ? 'Unmute sounds' : 'Mute sounds'}
        className="tool-btn text-muted-foreground hover:text-foreground"
        onClick={toggleMute}
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
    </div>
  );
};

export default TopBar;
