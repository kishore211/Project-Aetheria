import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { soundManager } from '../../utils/soundManager';
import { Users, CloudRain, Sun, Sunrise, Sunset, Moon, Snowflake, Flower2, Leaf, CloudSun, Volume2, VolumeX } from 'lucide-react';

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
  const { population, year, day, season, timeOfDay, weather } = useGameStore();
  const [muted, setMuted] = useState(false);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundManager.setMuted(next);
    if (next) soundManager.stopRain();
  };

  return (
    <div className="ui-topbar fixed top-3 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-secondary/90 backdrop-blur px-5 py-2 rounded-full shadow-lg text-sm text-foreground border border-muted/40">
      <span className="flex items-center gap-1.5" title="World population">
        <Users size={16} className="text-emerald-300" />
        {population}
      </span>
      <span className="w-px h-4 bg-muted/60" />
      <span className="flex items-center gap-1.5 capitalize" title="Season">
        {seasonIcons[season]}
        Year {year} · {season}, Day {day}
      </span>
      <span className="w-px h-4 bg-muted/60" />
      <span className="flex items-center gap-1.5 capitalize" title="Time of day">
        {timeIcons[timeOfDay]}
        {timeOfDay}
      </span>
      <span className="w-px h-4 bg-muted/60" />
      <span className="flex items-center gap-1.5 capitalize" title="Weather">
        {weather === 'clear'
          ? <CloudSun size={16} className="text-slate-300" />
          : <CloudRain size={16} className="text-blue-300" />}
        {weather}
      </span>
      <span className="w-px h-4 bg-muted/60" />
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
