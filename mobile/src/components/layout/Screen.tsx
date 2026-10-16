import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { OfflineBanner } from '@/components/feedback/OfflineBanner';
import { useTheme } from '@/theme/ThemeProvider';
import { cn } from '@/utils/cn';

import { ScreenHeader, type ScreenHeaderProps } from './ScreenHeader';

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
  const contentClasses = cn('grow px-4 pb-8', contentClassName);
  const refreshControl = onRefresh ? (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={[colors.primary]}
      tintColor={colors.primary}
      progressBackgroundColor={colors.card}
    />
  ) : undefined;

  return (
    <SafeAreaView edges={edges} className="flex-1 bg-background">
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
    </SafeAreaView>
  );
}
