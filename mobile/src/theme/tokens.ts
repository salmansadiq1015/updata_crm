// Non-colour tokens that need raw values in JS (styles NativeWind cannot express,
// icon sizes, navigation chrome, motion). Spacing, radius and type scales live in
// tailwind.config.js and are used through classes.
import type { ViewStyle } from 'react-native';

import { brand, type ColorScheme } from './colors';

type ShadowLevel = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Soft, layered elevation (a tight contact shadow plus a wide ambient one), tinted
 * with the brand navy in light mode so cards lift without looking grey. Dark mode
 * leans on borders and a deeper ambient shadow instead.
 */
export const shadows: Record<ColorScheme, Record<ShadowLevel, ViewStyle>> = {
  light: {
    sm: { boxShadow: '0px 1px 2px rgba(16, 42, 86, 0.04), 0px 1px 3px rgba(16, 42, 86, 0.04)' },
    md: { boxShadow: '0px 1px 2px rgba(16, 42, 86, 0.04), 0px 6px 16px rgba(16, 42, 86, 0.06)' },
    lg: { boxShadow: '0px 2px 6px rgba(16, 42, 86, 0.05), 0px 12px 28px rgba(16, 42, 86, 0.09)' },
    xl: { boxShadow: '0px 4px 10px rgba(16, 42, 86, 0.06), 0px 24px 48px rgba(16, 42, 86, 0.16)' },
  },
  // Dark: resting surfaces are separated by their hairline border only (shadows read
  // as muddy halos on near-black); floating layers (sheets, dialogs) keep depth.
  dark: {
    sm: {},
    md: {},
    lg: { boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.35), 0px 12px 28px rgba(0, 0, 0, 0.40)' },
    xl: { boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.40), 0px 24px 48px rgba(0, 0, 0, 0.55)' },
  },
};

/** Coloured glow under filled primary actions (light only; dark stays flat). */
export const primaryGlow: Record<ColorScheme, ViewStyle | undefined> = {
  light: { boxShadow: '0px 1px 2px rgba(16, 42, 86, 0.10), 0px 6px 14px rgba(28, 56, 142, 0.22)' },
  dark: undefined,
};

/** Brand hero gradient (dashboard, auth, lead header). Stops run top-start → bottom-end. */
export const heroGradient: Record<ColorScheme, readonly [string, string, string]> = {
  light: [brand.navyDeep, brand.navy, brand[700]],
  dark: ['#081428', brand.navyDeep, brand[800]],
};

export const iconSizes = { xs: 14, sm: 16, md: 20, lg: 24, xl: 32 } as const;
export type IconSize = keyof typeof iconSizes;

/** Minimum touch target (Android accessibility guidance: 48dp). */
export const MIN_TOUCH_TARGET = 48;

/**
 * Motion rules: short, restrained, never decorative loops (except skeleton shimmer).
 * Every animation is skipped when the OS "reduce motion" setting is on.
 */
export const motion = {
  duration: { instant: 90, fast: 160, base: 220, slow: 320 },
  /** Press feedback: buttons and cards shrink slightly, chips a touch more. */
  pressScale: { button: 0.97, card: 0.985, chip: 0.95 },
  /** Stagger between list/card entrances; capped so long lists never wait. */
  stagger: 45,
  maxStaggerItems: 8,
  shimmerDuration: 1300,
} as const;

/**
 * Layout rhythm (4/8pt grid). Classes are the source of truth on screens; these
 * mirror them for raw-style call sites and document the rules in one place:
 * - screen gutter 16 (`px-4`), section gap 20 (`gap-5`), related blocks 12 (`gap-3`)
 * - card padding 16 (`p-4`, dense cards `p-3.5`), card radius 16 (`rounded-2xl`),
 *   hero radius 20 (`rounded-3xl`)
 * - list row gap 8 (`h-2` separator); rows stay ≥ 48dp tall
 * - large title 28/34 with 8 above and 12 below; pushed screens start content 12 below the bar
 */
export const layout = {
  gutter: 16,
  sectionGap: 20,
  blockGap: 12,
  cardPadding: 16,
  rowGap: 8,
  cardRadius: 16,
  heroRadius: 20,
} as const;
