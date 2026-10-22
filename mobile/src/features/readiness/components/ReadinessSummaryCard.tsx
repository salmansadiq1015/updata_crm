import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleSlash,
  Loader,
  Smartphone,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppPressableCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';

import { useMobileReadiness } from '../hooks/useMobileReadiness';

const LOOK = {
  checking: { icon: Loader, color: 'mutedForeground' },
  ready: { icon: CheckCircle2, color: 'success' },
  attention: { icon: AlertTriangle, color: 'warning' },
  blocked: { icon: CircleSlash, color: 'destructive' },
} as const;

/** One-line status of calling from this phone's SIM; opens the full readiness screen. */
export function ReadinessSummaryCard({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { summary } = useMobileReadiness();
  const look = LOOK[summary.state];
  const status = t(`readiness.summary.${summary.state}`, { count: summary.attention });
  return (
    <AppPressableCard
      accessibilityLabel={`${t('readiness.title')}: ${status}`}
      accessibilityHint={t('readiness.open')}
      onPress={onPress}
      className="flex-row items-center gap-3"
    >
      <Icon icon={Smartphone} size="sm" color="primary" />
      <View className="flex-1 gap-1">
        <AppText variant="label">{t('readiness.title')}</AppText>
        <View className="flex-row items-center gap-2">
          <Icon icon={look.icon} size="sm" color={look.color} />
          <AppText tone="muted" className="flex-1">
            {status}
          </AppText>
        </View>
      </View>
      <Icon icon={ChevronRight} size="sm" color="mutedForeground" />
    </AppPressableCard>
  );
}
