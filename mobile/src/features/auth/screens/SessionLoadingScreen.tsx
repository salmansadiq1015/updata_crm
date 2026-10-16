import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { Appear } from '@/components/motion/Appear';
import { AppText } from '@/components/ui/AppText';
import { BrandMark } from '@/components/ui/BrandMark';
import { GradientSurface } from '@/components/ui/GradientSurface';

/** While a stored session is verified with the server (launch, or retry after a failure). */
export function SessionLoadingScreen() {
  const { t } = useTranslation();
  return (
    <GradientSurface className="flex-1">
      <StatusBar style="light" />
      <View className="flex-1 items-center justify-center gap-8 px-6" accessibilityLiveRegion="polite">
        <Appear variant="fade">
          <View className="items-center gap-4">
            <BrandMark size={72} tone="light" />
            <AppText
              variant="h2"
              className="text-white"
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              {t('common.appName')}
            </AppText>
          </View>
        </Appear>
        <View className="items-center gap-3">
          <ActivityIndicator color="#FFFFFF" />
          <AppText className="text-white/80">{t('auth.restoring')}</AppText>
        </View>
      </View>
    </GradientSurface>
  );
}
