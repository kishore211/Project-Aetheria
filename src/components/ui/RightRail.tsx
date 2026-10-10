import Minimap from './Minimap';
import InfoPanel from './InfoPanel';
import KingdomsPanel from './KingdomsPanel';
import EventLog from './EventLog';

/**
 * The right-hand HUD column. Stacking these in one flex rail (rather than
 * pinning each panel to a corner) keeps them from overlapping on short or
 * narrow windows: everything flows down from the minimap and scrolls if the
 * window is small. It stops short of the bottom so it never sits on top of the
 * power bar, which owns that strip.
 */
const RightRail = () => (
  <div className="fixed right-2 sm:right-3 top-[3.4rem] sm:top-14 bottom-28 sm:bottom-26 w-56 sm:w-72 max-w-[calc(100vw-1rem)] flex flex-col gap-2 pointer-events-none overflow-y-auto no-scrollbar">
    <Minimap />
    <InfoPanel />
    <KingdomsPanel />
    <EventLog />
  </div>
);

export default RightRail;
