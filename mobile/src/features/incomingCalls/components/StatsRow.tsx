import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';

import type { InboundStats } from '../types';

/** Today's counts, straight from GET /inbound-calls/stats. */
export function StatsRow({ stats, loading }: { stats: InboundStats | undefined; loading: boolean }) {
  const { t } = useTranslation();
  if (loading && !stats) return <AppSkeleton className="h-20 rounded-2xl" />;
  if (!stats) return null;
  const items = [
    { key: 'total', value: stats.total },
    { key: 'ai', value: stats.answeredByAi },
    { key: 'missed', value: stats.missed },
    { key: 'newLeads', value: stats.newLeads },
  ] as const;
  return (
    <View className="flex-row gap-2">
      {items.map((item) => (
        <View
          key={item.key}
          className="flex-1 items-center gap-0.5 rounded-2xl border border-border bg-card px-1 py-3"
          accessible
          accessibilityLabel={`${t(`incomingCalls.stats.${item.key}`)}: ${item.value}`}
        >
          <AppText variant="h2" tone={item.key === 'missed' && item.value > 0 ? 'destructive' : 'default'}>
            {String(item.value)}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1} adjustsFontSizeToFit>
            {t(`incomingCalls.stats.${item.key}`)}
          </AppText>
        </View>
      ))}
    </View>
  );
}
