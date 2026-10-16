import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OfflineBanner } from '@/components/feedback/OfflineBanner';
import { Appear } from '@/components/motion/Appear';
import { AppText } from '@/components/ui/AppText';
import { BrandMark } from '@/components/ui/BrandMark';
import { GradientSurface } from '@/components/ui/GradientSurface';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Shared frame for signed-out screens: a brand-navy gradient hero with the logo,
 * and the form on a raised card that overlaps it. Mirrors the web (auth) layout.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background" style={{ backgroundColor: colors.background }}>
      {/* Light status-bar icons over the navy hero; restored when signed-out screens unmount. */}
      <StatusBar style="light" />
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 32 }}
      >
        <GradientSurface
          className="rounded-b-4xl px-6"
          style={{ paddingTop: insets.top + 36, paddingBottom: 72 }}
        >
          <View className="w-full max-w-md flex-row items-center gap-3 self-center">
            <BrandMark size={44} tone="light" />
            <AppText
              variant="h3"
              className="text-white"
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              {t('common.appName')}
            </AppText>
          </View>
        </GradientSurface>

        <View className="-mt-12 px-4">
          <Appear>
            <View
              style={shadows.xl}
              className="w-full max-w-md self-center rounded-3xl border border-border bg-card p-6"
            >
              <OfflineBanner className="mx-0 mb-5 mt-0" />
              <View className="mb-6 gap-2">
                <AppText variant="h2">{title}</AppText>
                {subtitle ? <AppText tone="muted">{subtitle}</AppText> : null}
              </View>
              {children}
            </View>
          </Appear>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
