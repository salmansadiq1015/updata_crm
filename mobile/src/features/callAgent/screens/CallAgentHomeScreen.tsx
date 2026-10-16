import { Bot, FlaskConical, ListChecks, MessageSquare, PhoneCall } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { Appear } from '@/components/motion/Appear';
import { AppAlert } from '@/components/feedback/AppAlert';
import { AppButton } from '@/components/ui/AppButton';
import { AppPressableCard } from '@/components/ui/AppCard';
import { AppEmptyState } from '@/components/ui/AppEmptyState';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { CampaignStatusBadge } from '@/features/aiAgent/components/StatusBadges';
import { callReadiness, smsReadiness } from '@/features/aiAgent/domain/agentDomain';
import {
  useAgentCampaigns,
  useAgentLanguages,
  useMessagingHealth,
  useTelephonyHealth,
} from '@/features/aiAgent/hooks/useAiAgent';
import { rowCounts } from '@/features/aiAgent/screens/AiAgentCampaignsScreen';
import { ACTIVE_CAMPAIGN_STATUSES } from '@/features/aiAgent/types';
import type { MainTabScreenProps } from '@/navigation/navigationTypes';
import { formatRelative } from '@/utils/date';

import { ActionTile } from '../components/ActionTile';
import { AgentHero } from '../components/AgentHero';
import { ReadinessCard } from '../components/ReadinessCard';
import { formFromDefaults } from '../domain/agentSettings';
import { useAgentDefaults, useSettingsFallbacks } from '../hooks/useCallAgent';

const RECENT_CAMPAIGNS = 3;
/** Campaigns that still need attention: running, waiting, or paused by the user. */
const OPEN_STATUSES = [...ACTIVE_CAMPAIGN_STATUSES, 'paused'];

/** "Updata Call Agent" hub: agent identity, live readiness, quick actions, campaign summary. */
export function CallAgentHomeScreen({ navigation }: MainTabScreenProps<'CallAgent'>) {
  const { t, i18n } = useTranslation();
  const defaults = useAgentDefaults();
  const fallbacks = useSettingsFallbacks();
  const languages = useAgentLanguages();
  const telephony = useTelephonyHealth();
  const messaging = useMessagingHealth();
  const campaigns = useAgentCampaigns();

  const agent = useMemo(() => formFromDefaults(defaults.data ?? null, fallbacks), [defaults.data, fallbacks]);
  const language = languages.data?.languages.find(
    (item) => item.code.toLowerCase() === agent.language.toLowerCase(),
  );
  const languageLabel = language
    ? language.code === 'auto'
      ? t('callAgent.hero.autoLanguage')
      : language.nativeName || language.name
    : agent.language;

  const callReady = callReadiness(telephony);
  const smsReady = smsReadiness(messaging);
  const rows = campaigns.data ?? [];
  const openCount = rows.filter((row) => OPEN_STATUSES.includes(row.campaign.status)).length;

  const refreshing =
    defaults.isRefetching || telephony.isRefetching || messaging.isRefetching || campaigns.isRefetching;
  const refresh = () => {
    void defaults.refetch();
    void telephony.refetch();
    void messaging.refetch();
    void campaigns.refetch();
  };

  const pick = (purpose: 'call' | 'sms') => navigation.navigate('CallAgentLeadPicker', { purpose });

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} contentClassName="gap-5 pt-3">
      <Appear>
        <AgentHero
          name={agent.agentName}
          languageLabel={languageLabel}
          voice={agent.voice}
          configured={Boolean(defaults.data)}
          onEdit={() => navigation.navigate('CallAgentSettings')}
        />
      </Appear>
      {defaults.isError ? <AppAlert tone="warning" message={t('callAgent.defaultsFailed')} /> : null}

      <Appear index={1}>
        <View className="gap-2">
          <SectionHeader title={t('callAgent.readiness.title')} />
          <ReadinessCard
            channel="call"
            icon={PhoneCall}
            title={t('callAgent.readiness.calls')}
            readiness={callReady}
          />
          <ReadinessCard
            channel="sms"
            icon={MessageSquare}
            title={t('callAgent.readiness.sms')}
            readiness={smsReady}
          />
        </View>
      </Appear>

      <Appear index={2}>
        <View className="gap-3">
          <SectionHeader title={t('callAgent.actions.title')} />
          <ActionTile
            icon={PhoneCall}
            title={t('callAgent.actions.call')}
            hint={t('callAgent.actions.callHint')}
            note={
              callReady.state === 'ready' || callReady.state === 'checking'
                ? null
                : t('callAgent.actions.callDraftOnly')
            }
            onPress={() => pick('call')}
          />
          <ActionTile
            icon={MessageSquare}
            tone="info"
            title={t('callAgent.actions.sms')}
            hint={t('callAgent.actions.smsHint')}
            onPress={() => pick('sms')}
          />
          <ActionTile
            icon={FlaskConical}
            tone="success"
            title={t('callAgent.actions.test')}
            hint={t('callAgent.actions.testHint')}
            onPress={() => navigation.navigate('CallAgentTest')}
          />
          <ActionTile
            icon={ListChecks}
            tone="accent"
            title={t('callAgent.actions.campaigns')}
            hint={
              campaigns.data
                ? t('callAgent.campaigns.open', { count: openCount })
                : t('callAgent.actions.campaignsHint')
            }
            onPress={() => navigation.navigate('AiAgentCampaigns')}
          />
        </View>
      </Appear>

      <Appear index={3}>
        <View className="gap-3">
          <SectionHeader
            title={t('callAgent.campaigns.title')}
            right={
              rows.length > 0 ? (
                <AppButton
                  title={t('callAgent.campaigns.seeAll')}
                  variant="ghost"
                  size="sm"
                  onPress={() => navigation.navigate('AiAgentCampaigns')}
                />
              ) : null
            }
          />
          {campaigns.isError ? (
            <AppAlert tone="warning" message={t('callAgent.campaigns.loadFailed')} />
          ) : campaigns.isPending ? (
            <AppText tone="muted">{t('common.loading')}</AppText>
          ) : rows.length === 0 ? (
            <AppEmptyState
              icon={Bot}
              size="inline"
              title={t('aiAgent.campaigns.emptyTitle')}
              description={t('callAgent.campaigns.none')}
            />
          ) : (
            rows.slice(0, RECENT_CAMPAIGNS).map((row) => {
              const counts = rowCounts(row);
              const kind =
                row.kind === 'call' ? t('aiAgent.campaigns.kindCall') : t('aiAgent.campaigns.kindSms');
              const created = formatRelative(row.campaign.createdAt, i18n.language);
              return (
                <AppPressableCard
                  key={`${row.kind}-${row.campaign.id}`}
                  accessibilityLabel={`${kind}, ${row.campaign.name}`}
                  onPress={() =>
                    navigation.navigate('AiAgentCampaignDetail', {
                      kind: row.kind,
                      campaignId: row.campaign.id,
                    })
                  }
                  className="gap-2"
                >
                  <View className="flex-row items-center gap-2">
                    <Icon
                      icon={row.kind === 'call' ? PhoneCall : MessageSquare}
                      size="sm"
                      color="mutedForeground"
                    />
                    <AppText variant="caption" tone="muted" className="flex-1" numberOfLines={1}>
                      {created ? `${kind} · ${created}` : kind}
                    </AppText>
                    <CampaignStatusBadge status={row.campaign.status} />
                  </View>
                  <AppText variant="title" numberOfLines={1}>
                    {row.campaign.name}
                  </AppText>
                  <AppText variant="caption" tone="muted">
                    {t('aiAgent.campaigns.counts', counts)}
                  </AppText>
                </AppPressableCard>
              );
            })
          )}
        </View>
      </Appear>
    </Screen>
  );
}
