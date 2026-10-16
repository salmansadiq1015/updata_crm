import { MessageSquare, Phone } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SectionHeader } from '@/components/layout/SectionHeader';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import { IconContainer } from '@/components/ui/IconContainer';
import { cn } from '@/utils/cn';
import { formatDate, formatRelative } from '@/utils/date';

import { formatElapsed } from '../domain/callEvidence';
import type { LocalOperation } from '../domain/operations';
import { useCommunicationHistory } from '../hooks/useCommunication';
import { receiptStatus, type Communication } from '../types';

/** Server-confirmed history (shared with the web CRM) plus this device's unfinished attempts. */
export function CommunicationHistory({
  leadId,
  openOperations,
  onResume,
}: {
  leadId: string;
  openOperations: LocalOperation[];
  onResume: (op: LocalOperation) => void;
}) {
  const { t, i18n } = useTranslation();
  const history = useCommunicationHistory(leadId);
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <View className="gap-1.5">
      <SectionHeader title={t('communication.history.title')} size="group" />
      <AppCard variant="outline" className="gap-3 py-3">
        {openOperations.map((op) => (
          <View key={op.operationId} className="gap-3 rounded-xl border border-warning/35 bg-warning/5 p-3">
            <View className="flex-row items-center gap-2.5">
              <IconContainer
                icon={op.channel === 'sms' ? MessageSquare : Phone}
                tone="warning"
                size="sm"
                round
              />
              <AppText variant="label" className="flex-1">
                {t(`communication.phase.${op.phase}`)}
              </AppText>
              <AppText variant="caption" tone="muted">
                {formatRelative(new Date(op.createdAt), i18n.language)}
              </AppText>
            </View>
            <AppButton
              title={t('communication.history.resume')}
              size="sm"
              variant="outline"
              onPress={() => onResume(op)}
            />
          </View>
        ))}

        {history.isPending ? (
          <AppSkeleton className="h-14 w-full rounded-xl" />
        ) : history.isError ? (
          <AppText tone="muted">{t('communication.history.loadFailed')}</AppText>
        ) : items.length === 0 ? (
          <AppText tone="muted">{t('communication.history.empty')}</AppText>
        ) : (
          items.map((item, index) => (
            <HistoryItem key={item.id} item={item} language={i18n.language} first={index === 0} />
          ))
        )}
        {history.hasNextPage ? (
          <AppButton
            title={t('communication.history.more')}
            variant="ghost"
            size="sm"
            loading={history.isFetchingNextPage}
            onPress={() => void history.fetchNextPage()}
          />
        ) : null}
      </AppCard>
    </View>
  );
}

function HistoryItem({ item, language, first }: { item: Communication; language: string; first: boolean }) {
  const { t } = useTranslation();
  const status = item.state === 'completed' ? receiptStatus(item.receipt) : null;
  const offhook = item.observed?.offhookDurationSec;

  return (
    <View className={cn('gap-1', !first && 'border-t border-border pt-3')}>
      <View className="flex-row items-center gap-2.5">
        <IconContainer icon={item.channel === 'sms' ? MessageSquare : Phone} tone="muted" size="sm" round />
        <AppText variant="label" className="flex-1">
          {item.outcome
            ? t(`communication.disposition.${item.outcome.disposition}`)
            : t(`communication.serverState.${item.state}`)}
        </AppText>
        {status === 'partial' ? (
          <AppBadge label={t('communication.history.partial')} variant="warning" />
        ) : null}
      </View>
      <AppText variant="caption" tone="muted">
        {[formatDate(item.createdAt, language), item.createdBy, t(`communication.routeShort.${item.route}`)]
          .filter(Boolean)
          .join(' · ')}
      </AppText>
      {item.channel === 'phone' ? (
        <AppText variant="caption" tone="muted">
          {typeof offhook === 'number'
            ? t('communication.history.offhook', { elapsed: formatElapsed(offhook * 1000) })
            : t('communication.history.noEvidence')}
          {item.outcome
            ? ` · ${t('communication.history.connected', { value: t(`communication.connected.${item.outcome.connected}`) })}`
            : ''}
        </AppText>
      ) : item.sms ? (
        <AppText variant="caption" tone="muted">
          {t(`communication.smsStatus.${item.sms.sendStatus}`)}
          {item.sms.segments ? ` · ${t('communication.history.segments', { count: item.sms.segments })}` : ''}
        </AppText>
      ) : null}
      {item.outcome?.notes ? (
        <AppText numberOfLines={3} selectable>
          {item.outcome.notes}
        </AppText>
      ) : null}
    </View>
  );
}
