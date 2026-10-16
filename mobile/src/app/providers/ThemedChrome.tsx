import { StatusBar } from 'expo-status-bar';
import { Toaster } from 'sonner-native';

import { useTheme } from '@/theme/ThemeProvider';

/** System chrome that follows the active theme: status bar icons and the toast host. */
export function ThemedChrome() {
  const { scheme, colors } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Toaster
        theme={scheme}
        position="top-center"
        richColors
        duration={4000}
        visibleToasts={3}
        toastOptions={{
          style: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
          titleStyle: { fontFamily: 'Geist-Medium', color: colors.foreground },
          descriptionStyle: { fontFamily: 'Geist-Regular', color: colors.mutedForeground },
        }}
      />
    </>
  );
}
