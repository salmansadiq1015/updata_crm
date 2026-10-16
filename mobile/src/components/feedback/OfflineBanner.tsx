import { WifiOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { cn } from '@/utils/cn';

/** Shown above content while offline; cached data stays visible but is labelled as stale. */
export function OfflineBanner({ className }: { className?: string } = {}) {
  const { t } = useTranslation();
  const online = useIsOnline();
  if (online) return null;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={cn(
        'mx-4 mb-1 mt-1 flex-row items-center gap-2.5 rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-2.5',
        className,
      )}
    >
      <View className="h-6 w-6 items-center justify-center rounded-full bg-warning/20">
        <Icon icon={WifiOff} size="xs" color="foreground" />
      </View>
      <AppText variant="label" className="flex-1">
        {t('common.offline')}
      </AppText>
    </View>
  );
}
