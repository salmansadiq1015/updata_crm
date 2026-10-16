import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import type { SemanticColors } from '@/theme/colors';
import type { IconSize } from '@/theme/tokens';
import { cn } from '@/utils/cn';

import { Icon } from './Icon';

// One look for every icon tile: tinted square-ish container, icon in the tone colour.
const TONES = {
  primary: { box: 'bg-primary/10', fg: 'primary' },
  accent: { box: 'bg-accent', fg: 'accentForeground' },
  info: { box: 'bg-info/10', fg: 'info' },
  success: { box: 'bg-success/10', fg: 'success' },
  warning: { box: 'bg-warning/15', fg: 'warning' },
  destructive: { box: 'bg-destructive/10', fg: 'destructive' },
  muted: { box: 'bg-muted', fg: 'mutedForeground' },
  solid: { box: 'bg-primary', fg: 'primaryForeground' },
  /** On a gradient/hero surface. */
  inverse: { box: 'bg-white/15 border border-white/20', fg: 'primaryForeground' },
} as const satisfies Record<string, { box: string; fg: keyof SemanticColors }>;

const SIZES = {
  sm: { box: 'h-8 w-8 rounded-lg', icon: 'xs' },
  md: { box: 'h-10 w-10 rounded-xl', icon: 'sm' },
  lg: { box: 'h-12 w-12 rounded-2xl', icon: 'md' },
  xl: { box: 'h-16 w-16 rounded-3xl', icon: 'lg' },
} as const satisfies Record<string, { box: string; icon: IconSize }>;

export type IconContainerTone = keyof typeof TONES;

export type IconContainerProps = {
  icon: LucideIcon;
  tone?: IconContainerTone;
  size?: keyof typeof SIZES;
  /** Fully round instead of the rounded-square tile. */
  round?: boolean;
  flipRtl?: boolean;
  className?: string;
};

/** Decorative icon tile; the meaning is always carried by adjacent text. */
export function IconContainer({
  icon,
  tone = 'accent',
  size = 'md',
  round,
  flipRtl,
  className,
}: IconContainerProps) {
  const t = TONES[tone];
  const s = SIZES[size];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn('items-center justify-center', s.box, round && 'rounded-full', t.box, className)}
    >
      <Icon icon={icon} size={s.icon} color={t.fg} flipRtl={flipRtl} />
    </View>
  );
}
