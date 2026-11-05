import { FileText } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/layout/Screen';
import { usePullRefresh } from '@/components/layout/usePullRefresh';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import type { RootScreenProps } from '@/navigation/navigationTypes';

import { ActiveCallCard } from '../components/ActiveCallCard';
import { AiStatusBadge, CallerHeader, CallStatusBadge } from '../components/CallBadges';
import { useInboundCall, useInboundRealtime, useLiveInboundCalls } from '../hooks/useIncomingCalls';

/**
 * One call while it rings or runs: who is calling, call / AI / audio state, the controls, the
 * transcript tail and what the AI has collected. Once the call leaves the live list it shows
 * the final state and links to the full details.
 */
export function LiveIncomingCallScreen({ navigation, route }: RootScreenProps<'IncomingCallLive'>) {
  const { t } = useTranslation();
  const { id } = route.params;
  const connected = useInboundRealtime();
  const live = useLiveInboundCalls(connected);
  const call = live.data?.find((c) => c.id === id) ?? null;
  // Not (or no longer) live: load the stored call to show how it ended.
  const ended = useInboundCall(id, connected, live.isSuccess && !call);
  const { refreshing, onRefresh } = usePullRefresh(live.isRefetching, () => live.refetch());
  const openDetail = () => navigation.navigate('IncomingCallDetail', { id });

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} contentClassName="gap-4 pt-1 pb-10">
      {call ? (
        <ActiveCallCard call={call} />
      ) : live.isPending || (live.isSuccess && ended.isPending) ? (
        <AppSkeleton className="h-64 rounded-2xl" />
      ) : live.isError && !live.data ? (
        <AppErrorState error={live.error} retrying={live.isRefetching} onRetry={() => void live.refetch()} />
      ) : ended.data ? (
        <AppCard className="gap-3">
          <CallerHeader call={ended.data} />
          <AppText tone="muted">{t('incomingCalls.ended')}</AppText>
          <CallStatusBadge status={ended.data.status} />
          <AiStatusBadge aiStatus={ended.data.aiStatus} />
        </AppCard>
      ) : ended.isError ? (
        <AppErrorState
          error={ended.error}
          retrying={ended.isRefetching}
          onRetry={() => void ended.refetch()}
        />
      ) : null}
      <AppButton
        title={t('incomingCalls.openDetail')}
        variant="outline"
        leftIcon={FileText}
        onPress={openDetail}
      />
    </Screen>
  );
}
