import type { Theme } from '@react-navigation/native';

import type { ColorScheme, SemanticColors } from '@/theme/colors';

/** React Navigation chrome (headers, tab bar, transitions) from the same tokens. */
export function navigationTheme(scheme: ColorScheme, colors: SemanticColors): Theme {
  return {
    dark: scheme === 'dark',
    colors: {
      primary: colors.primary,
      background: colors.background,
      card: colors.card,
      text: colors.foreground,
      border: colors.border,
      notification: colors.destructive,
    },
    fonts: {
      regular: { fontFamily: 'Geist-Regular', fontWeight: '400' },
      medium: { fontFamily: 'Geist-Medium', fontWeight: '500' },
      bold: { fontFamily: 'Geist-SemiBold', fontWeight: '600' },
      heavy: { fontFamily: 'Geist-Bold', fontWeight: '700' },
    },
  };
}
