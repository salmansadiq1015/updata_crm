import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

import { OfflineBanner } from '@/components/feedback/OfflineBanner';
import { useTheme } from '@/theme/ThemeProvider';
import { cn } from '@/utils/cn';

import { ScreenHeader, type ScreenHeaderProps } from './ScreenHeader';
import { usePullRefresh } from './usePullRefresh';

export type ScreenProps = {
  children: ReactNode;
  /** Renders the standard header. Omit when the navigator draws one. */
  header?: ScreenHeaderProps;
  /**
   * `scroll` wraps content in a ScrollView; `keyboard` additionally keeps the
   * focused input above the keyboard (forms); `static` is for screens that own a
   * FlatList.
   */
  mode?: 'scroll' | 'keyboard' | 'static';
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Safe-area edges to pad. Tab screens skip `bottom` (the tab bar handles it). */
  edges?: Edge[];
  contentClassName?: string;
};

export function Screen({
  children,
  header,
  mode = 'scroll',
  refreshing = false,
  onRefresh,
  edges = ['top'],
  contentClassName,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Only a user pull shows the spinner; background refetches stay silent.
  const pull = usePullRefresh(refreshing, onRefresh);
  const contentClasses = cn('grow px-4 pb-8', contentClassName);
  const refreshControl = pull.onRefresh ? (
    <RefreshControl
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
      colors={[colors.primary]}
      tintColor={colors.primary}
      progressBackgroundColor={colors.card}
    />
  ) : undefined;

  return (
    // Insets are applied as plain padding (not a native SafeAreaView) so the first
    // block can never slide under the status bar on edge-to-edge Android.
    <View
      className="flex-1 bg-background"
      style={{
        paddingTop: edges.includes('top') ? insets.top : 0,
        paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
        paddingLeft: edges.includes('left') ? insets.left : 0,
        paddingRight: edges.includes('right') ? insets.right : 0,
      }}
    >
      <OfflineBanner />
      {header ? <ScreenHeader {...header} /> : null}
      {mode === 'static' ? (
        <View className="flex-1">{children}</View>
      ) : mode === 'keyboard' ? (
        <KeyboardAwareScrollView
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName={contentClasses}
        >
          {children}
        </KeyboardAwareScrollView>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
          contentContainerClassName={contentClasses}
        >
          {children}
        </ScrollView>
      )}
    </View>
  );
}
