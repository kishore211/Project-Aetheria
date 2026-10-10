import { bannerDataUrl } from '../../utils/heraldry';

/**
 * A kingdom's banner, or its colour swatch when there is no canvas to draw on.
 * Pixel art, so it is scaled with nearest-neighbour rather than smoothed.
 */
const Banner = ({ id, color, race, height = 16, className = '' }: {
  id: string; color: string; race: string; height?: number; className?: string;
}) => {
  const url = bannerDataUrl(id, color, race);
  if (!url) {
    return (
      <span
        className={`inline-block shrink-0 rounded-xs border border-black/30 ${className}`}
        style={{ backgroundColor: color, width: height * 0.75, height: height * 0.75 }}
      />
    );
  }
  return (
    <img
      src={url}
      alt=""
      aria-hidden
      className={`inline-block shrink-0 ${className}`}
      style={{ height, width: height * 0.75, imageRendering: 'pixelated' }}
    />
  );
};

export default Banner;
