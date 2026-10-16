import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '@/app/queryClient';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { AppErrorBoundary } from './AppErrorBoundary';
import { ThemedChrome } from './ThemedChrome';

/** The single provider tree. Order matters: gestures and safe areas wrap everything that renders UI. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <AppErrorBoundary>{children}</AppErrorBoundary>
              <ThemedChrome />
            </ThemeProvider>
          </QueryClientProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
