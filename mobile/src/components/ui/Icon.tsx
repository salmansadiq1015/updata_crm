// The one way to render an icon: Lucide (same library as the web CRM), sized
// from the token scale and coloured from the theme. Decorative by default.
import type { LucideIcon } from 'lucide-react-native';
import { I18nManager } from 'react-native';

import type { SemanticColors } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import { iconSizes, type IconSize } from '@/theme/tokens';

export type IconProps = {
  icon: LucideIcon;
  size?: IconSize;
  color?: keyof SemanticColors;
  /** Mirror direction-bearing icons (chevrons, arrows) in right-to-left layouts. */
  flipRtl?: boolean;
  strokeWidth?: number;
};

export function Icon({
  icon: Glyph,
  size = 'md',
  color = 'foreground',
  flipRtl,
  strokeWidth = 2,
}: IconProps) {
  const { colors } = useTheme();
  return (
    <Glyph
      size={iconSizes[size]}
      color={colors[color]}
      strokeWidth={strokeWidth}
      style={flipRtl && I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
