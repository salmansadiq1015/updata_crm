import { Image } from 'react-native';

// The Updata logo tile (same artwork as client/public/updata-mark.svg). It carries
// its own navy gradient, so it reads the same on light, dark and brand surfaces.
const MARK = require('../../../assets/brand-mark.png');

export function BrandMark({
  size = 48,
}: {
  size?: number;
  /** Kept for existing call sites; the tile needs no per-surface variant. */
  tone?: 'auto' | 'light' | 'dark';
}) {
  return (
    <Image
      source={MARK}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="Updata"
    />
  );
}
