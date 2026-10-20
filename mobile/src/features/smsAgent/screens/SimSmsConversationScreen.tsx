import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { Screen } from '@/components/layout/Screen';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppText } from '@/components/ui/AppText';
import { Loading } from '@/features/aiAgent/components/ReviewPanels';
import { tKey } from '@/features/communication/i18n';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { formatDateTime } from '@/utils/date';

import { useResolveConversation, useSimConversation } from '../hooks/useSmsAgent';
import type { SimMessage } from '../types';
import { STATE_VARIANT } from './SimSmsCampaignDetailScreen';

const show = (value: unknown) =>
  Array.isArray(value)
    ? value.join(', ')
    : value === true
      ? '✓'
      : value === false
        ? '✗'
        : String(value ?? '');

/** The full SMS exchange with one lead and the answers the server extracted from it. */
export function SimSmsConversationScreen({ route }: RootScreenProps<'SimSmsConversation'>) {
  const { t, i18n } = useTranslation();
  const query = useSimConversation(route.params.conversationId);
  const resolve = useResolveConversation();
  const act = useSingleFlight(async (action: 'resend' | 'mark_sent' | 'cancel') => {
    await resolve.mutateAsync({ id: route.params.conversationId, action });
  });

  if (query.isPending) return <Loading label={t('common.loading')} />;
  if (query.isError)
    return (
      <AppErrorState error={query.error} retrying={query.isRefetching} onRetry={() => void query.refetch()} />
    );
  const { conversation, messages, answers } = query.data;

  return (
    <Screen
      mode="scroll"
      edges={['bottom']}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      contentClassName="gap-4 px-4 pb-8 pt-3"
    >
      <View className="flex-row items-center gap-2">
        <AppText variant="h3" className="flex-1">
          {conversation.lead.name ?? conversation.destinationMasked ?? '—'}
        </AppText>
        <AppBadge
          label={tKey(t, `smsAgent.state.${conversation.state}`, { defaultValue: conversation.state })}
          variant={STATE_VARIANT[conversation.state] ?? 'muted'}
        />
      </View>

      {conversation.state === 'needs_attention' ? (
        <AppCard className="gap-3">
          <AppAlert
            tone="warning"
            title={t('smsAgent.conversation.attentionTitle')}
            message={t('smsAgent.conversation.attentionBody')}
          />
          <View className="flex-row flex-wrap gap-2">
            <AppButton
              size="sm"
              title={t('smsAgent.conversation.markSent')}
              variant="outline"
              disabled={resolve.isPending}
              onPress={() => void act('mark_sent')}
            />
            <AppButton
              size="sm"
              title={t('smsAgent.conversation.resend')}
              variant="soft"
              disabled={resolve.isPending}
              onPress={() => void act('resend')}
            />
            <AppButton
              size="sm"
              title={t('smsAgent.conversation.stopConversation')}
              variant="ghost"
              disabled={resolve.isPending}
              onPress={() => void act('cancel')}
            />
          </View>
        </AppCard>
      ) : null}

      <AppCard className="gap-2">
        <AppText variant="label">{t('smsAgent.conversation.answers')}</AppText>
        {answers.length === 0 ? <AppText tone="muted">{t('smsAgent.conversation.noAnswers')}</AppText> : null}
        {answers.map((a) => (
          <View key={a.fieldKey} className="flex-row gap-3">
            <AppText tone="muted" className="flex-1">
              {a.label}
            </AppText>
            <AppText className="flex-1 text-right">
              {a.validation === 'valid'
                ? show(a.normalizedValue)
                : a.validation === 'unknown'
                  ? t('smsAgent.answerUnknown')
                  : t('smsAgent.answerInvalid')}
            </AppText>
          </View>
        ))}
      </AppCard>

      <AppText variant="label">{t('smsAgent.conversation.transcript')}</AppText>
      <View className="gap-2">
        {messages.map((m) => (
          <Bubble key={m.id} message={m} language={i18n.language} />
        ))}
      </View>
    </Screen>
  );
}

function Bubble({ message, language }: { message: SimMessage; language: string }) {
  const { t } = useTranslation();
  const outbound = message.direction === 'outbound';
  const when = formatDateTime(message.receivedAt ?? message.sentAt ?? message.createdAt, language);
  const status = !outbound
    ? null
    : message.status === 'sent'
      ? message.deliveredAt
        ? t('smsAgent.conversation.delivered')
        : t('smsAgent.conversation.you')
      : message.status === 'failed'
        ? t('smsAgent.conversation.notSent', { code: message.failureCode ?? '' })
        : message.status === 'unknown'
          ? t('smsAgent.conversation.unknown')
          : message.status === 'cancelled'
            ? null
            : t('smsAgent.conversation.pending');
  if (outbound && message.status === 'cancelled') return null;
  return (
    <View className={outbound ? 'items-end' : 'items-start'}>
      <View className={`max-w-[85%] rounded-2xl px-3 py-2 ${outbound ? 'bg-primary/10' : 'bg-muted'}`}>
        <AppText>{message.body}</AppText>
      </View>
      <AppText variant="caption" tone="muted">
        {[outbound ? status : t('smsAgent.conversation.lead'), when].filter(Boolean).join(' · ')}
      </AppText>
    </View>
  );
}
