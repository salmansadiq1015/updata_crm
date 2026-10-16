import { vars } from 'nativewind';
import { createContext, use, useMemo, type ReactNode } from 'react';
import { useColorScheme, View } from 'react-native';

import { usePreferencesStore } from '@/store/preferencesStore';

import { palettes, toCssVariables, type ColorScheme, type SemanticColors } from './colors';
import { heroGradient, primaryGlow, shadows } from './tokens';

type ThemeValue = {
  scheme: ColorScheme;
  colors: SemanticColors;
  shadows: (typeof shadows)[ColorScheme];
  /** Brand hero gradient stops for the active scheme. */
  gradient: (typeof heroGradient)[ColorScheme];
  /** Glow under filled primary actions (undefined in dark mode). */
  glow: (typeof primaryGlow)[ColorScheme];
};

// Built once: the CSS variables every `bg-primary`-style class reads.
const schemeVariables = {
  light: vars(toCssVariables(palettes.light)),
  dark: vars(toCssVariables(palettes.dark)),
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = usePreferencesStore((state) => state.theme);
  const system = useColorScheme();
  const scheme: ColorScheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo<ThemeValue>(
    () => ({
      scheme,
      colors: palettes[scheme],
      shadows: shadows[scheme],
      gradient: heroGradient[scheme],
      glow: primaryGlow[scheme],
    }),
    [scheme],
  );

  return (
    <ThemeContext value={value}>
      <View style={[{ flex: 1, backgroundColor: value.colors.background }, schemeVariables[scheme]]}>
        {children}
      </View>
    </ThemeContext>
  );
}

/** Raw token values for APIs that cannot take a class (icons, navigation, status bar). */
export function useTheme(): ThemeValue {
  const value = use(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}
