import { CloudOff, MessageSquare, Phone } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppEmptyState } from '@/components/ui/AppEmptyState';
import { AppText } from '@/components/ui/AppText';
import { IconContainer } from '@/components/ui/IconContainer';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { formatRelative } from '@/utils/date';

import type { LocalOperation } from '../domain/operations';
import { useAllOperations } from '../hooks/useCommunication';
import { dismissOperation } from '../services/contactFlows';
import { flushOutbox, retryOperation } from '../services/outboxSync';

/** Sync queue: every contact attempt on this device and what the CRM has confirmed. */
export function CommunicationQueueScreen({ navigation }: RootScreenProps<'CommunicationQueue'>) {
  const { t } = useTranslation();
  const operations = useAllOperations();
  const [syncing, setSyncing] = useState(false);

  const open = (op: LocalOperation) =>
    navigation.navigate(op.channel === 'sms' ? 'SmsCompose' : 'CallSession', {
      leadId: op.leadId,
      operationId: op.operationId,
    });

  return (
    <Screen
      edges={[]}
      contentClassName="gap-2 pt-3 pb-10"
      refreshing={syncing}
      onRefresh={() => {
        setSyncing(true);
        void flushOutbox().finally(() => setSyncing(false));
      }}
    >
      {operations.length === 0 ? (
        <AppEmptyState
          icon={CloudOff}
          title={t('communication.queue.emptyTitle')}
          description={t('communication.queue.emptyBody')}
        />
      ) : (
        operations.map((op) => <QueueItem key={op.operationId} op={op} onOpen={() => open(op)} />)
      )}
    </Screen>
  );
}

function QueueItem({ op, onOpen }: { op: LocalOperation; onOpen: () => void }) {
  const { t, i18n } = useTranslation();
  const variant =
    op.phase === 'done'
      ? 'success'
      : op.phase === 'needs_attention' || op.phase === 'dispatch_unknown'
        ? 'warning'
        : op.phase === 'abandoned' || op.phase === 'dispatch_failed'
          ? 'muted'
          : 'info';
  const pending = op.pendingEvents.length;
  const removable =
    pending === 0 && (op.phase === 'done' || op.phase === 'abandoned' || op.phase === 'dispatch_failed');

  return (
    <AppCard className="gap-2 px-3.5 py-3">
      <View className="flex-row items-center gap-3">
        <IconContainer icon={op.channel === 'sms' ? MessageSquare : Phone} tone="muted" size="sm" round />
        <AppText variant="title" className="flex-1" numberOfLines={1}>
          {op.leadName}
        </AppText>
        <AppBadge label={t(`communication.phase.${op.phase}`)} variant={variant} dot />
      </View>
      <AppText variant="caption" tone="muted" className="ms-11">
        {[
          formatRelative(new Date(op.createdAt), i18n.language),
          pending > 0 ? t('communication.queue.pendingEvents', { count: pending }) : null,
          op.sync.lastError
            ? t(`communication.syncError.${op.sync.lastError.kind}`, { code: op.sync.lastError.code ?? '' })
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </AppText>
      <View className="ms-11 flex-row flex-wrap gap-2">
        <AppButton title={t('communication.queue.open')} size="sm" variant="outline" onPress={onOpen} />
        {op.sync.paused || op.phase === 'needs_attention' ? (
          <AppButton
            title={t('communication.receipt.retry')}
            size="sm"
            variant="outline"
            onPress={() => void retryOperation(op.operationId)}
          />
        ) : null}
        {removable ? (
          <AppButton
            title={t('communication.queue.remove')}
            size="sm"
            variant="ghost"
            onPress={() => dismissOperation(op.operationId)}
          />
        ) : null}
      </View>
    </AppCard>
  );
}
