import { useEffect, useRef } from 'react';
import { Trophy, X } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { ACHIEVEMENTS_BY_ID } from '../../utils/achievements';

/**
 * Watches the world for milestones and pops a toast when one is reached.
 * Kept out of the simulation on purpose: it only reads published state, so an
 * achievement can never change how the world behaves.
 */
const AchievementWatcher = () => {
  const population = useGameStore((state) => state.population);
  const kingdoms = useGameStore((state) => state.kingdoms);
  const events = useGameStore((state) => state.events);
  const unlock = useGameStore((state) => state.unlockAchievement);
  const possessedId = useGameStore((state) => state.possessedId);
  const latest = useGameStore((state) => state.latestAchievement);
  const dismiss = useGameStore((state) => state.dismissAchievementToast);

  const peakPopulation = useRef(0);
  const lastSeenEventId = useRef(0);

  useEffect(() => {
    unlock('first-world');
  }, [unlock]);

  useEffect(() => {
    if (population > 0) unlock('first-life');
    if (population >= 100) unlock('menagerie');
    peakPopulation.current = Math.max(peakPopulation.current, population);
    if (peakPopulation.current >= 20 && population === 0) unlock('extinction');
  }, [population, unlock]);

  useEffect(() => {
    if (kingdoms.length > 0) unlock('civilisation');
    if (kingdoms.some((kingdom) => kingdom.villages >= 3)) unlock('empire');
    if (kingdoms.some((kingdom) => kingdom.population >= 40)) unlock('dynasty');
    if (kingdoms.some((kingdom) => kingdom.atWarWith.length > 0)) unlock('warmonger');
  }, [kingdoms, unlock]);

  useEffect(() => {
    if (possessedId) unlock('puppeteer');
  }, [possessedId, unlock]);

  useEffect(() => {
    // Only inspect entries added since the last render
    const fresh = events.filter((event) => event.id > lastSeenEventId.current);
    if (fresh.length === 0) return;
    lastSeenEventId.current = Math.max(...events.map((event) => event.id));

    for (const event of fresh) {
      const message = event.message.toLowerCase();
      if (message.includes('meteor')) unlock('cataclysm');
      if (message.includes('fire ignites')) unlock('inferno');
      if (message.includes('blessing')) unlock('benevolent');
      if (message.includes('razed')) unlock('conqueror');
      if (message.includes('old age')) unlock('elder');
      if (message.includes('set sail')) unlock('seafarers');
      if (message.includes('come ashore')) unlock('landfall');
      if (message.includes('land rises out of the water')) unlock('archipelago');
      if (message.includes('second sun')) unlock('second-sun');
      if (message.includes('no longer there')) unlock('absence');
      if (message.includes('tornado drops')) unlock('twister');
      if (message.includes('climbs out of it, burning')) unlock('hot-spot');
      if (message.includes('rises again')) unlock('patient-zero');
      if (message.includes('could rule itself')) unlock('kingmaker');
      if (message.includes('voice in the ruler')) unlock('whisperer');
      if (message.includes('nobody can remember what the quarrel was')) unlock('peacemaker');
      if (message.includes('a second of itself')) unlock('double');
      if (message.includes('cannot quite remember who they were')) unlock('lethe');
      if (message.includes('handsome stranger')) unlock('strangers');
    }
  }, [events, unlock]);

  useEffect(() => {
    if (!latest) return;
    const timer = window.setTimeout(dismiss, 5200);
    return () => window.clearTimeout(timer);
  }, [latest, dismiss]);

  if (!latest) return null;
  const achievement = ACHIEVEMENTS_BY_ID.get(latest.id);
  if (!achievement) return null;

  return (
    <div className="ui-modal fixed bottom-24 left-1/2 -translate-x-1/2 z-30 flex items-start gap-3 bg-secondary/95 backdrop-blur border border-amber-300/50 rounded-lg shadow-xl px-4 py-3 max-w-xs">
      <Trophy size={20} className="text-amber-300 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-amber-300/80">Milestone</p>
        <p className="font-semibold text-foreground text-sm">{achievement.title}</p>
        <p className="text-xs text-muted-foreground">{achievement.description}</p>
      </div>
      <button type="button" onClick={dismiss} className="text-muted-foreground hover:text-foreground shrink-0">
        <X size={14} />
      </button>
    </div>
  );
};

export default AchievementWatcher;
