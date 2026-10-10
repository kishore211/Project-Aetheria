import { Gamepad2 } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { worldAccess } from '../../utils/worldAccess';

/**
 * Says who you are wearing and how to drive them.
 *
 * Possession changes what four keys and the space bar do, which is exactly
 * the kind of mode a player forgets they are in. The banner stays up for as
 * long as the mode does.
 */
const PossessionBanner = () => {
  const possessedId = useGameStore((state) => state.possessedId);
  if (!possessedId) return null;
  const creature = worldAccess.current?.entities().find(entity => entity.id === possessedId);
  return (
    <div className="possession-banner" role="status">
      <Gamepad2 size={15} />
      <span className="possession-name">{creature ? creature.name : 'A creature'}</span>
      <span className="possession-keys">
        <kbd>WASD</kbd> walk <kbd>Space</kbd> strike <kbd>Esc</kbd> let go
      </span>
    </div>
  );
};

export default PossessionBanner;
