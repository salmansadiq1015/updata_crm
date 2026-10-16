import { FlaskConical, PhoneCall, Users } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { Screen } from '@/components/layout/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard, AppPressableCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { IconContainer } from '@/components/ui/IconContainer';
import { CampaignStatusBadge } from '@/features/aiAgent/components/StatusBadges';
import { TestConversation } from '@/features/aiAgent/components/TestConversation';
import { useAgentCampaigns } from '@/features/aiAgent/hooks/useAiAgent';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { formatDate } from '@/utils/date';

import { formFromDefaults, testDraftInput } from '../domain/agentSettings';
import { useAgentDefaults, useCreateTestDraft, useSettingsFallbacks } from '../hooks/useCallAgent';

const MAX_DRAFTS = 5;

/**
 * Text test of the agent. The server simulates a conversation only for an existing
 * campaign (POST /ai-calling/campaigns/:id/simulate), and creates a campaign only
 * for at least one lead. So a test either uses an existing call draft or creates an
 * `isTest` draft from the saved settings for one chosen lead. Nothing is started
 * here and no call is placed.
 */
export function CallAgentTestScreen({ route, navigation }: RootScreenProps<'CallAgentTest'>) {
  const { t, i18n } = useTranslation();
  const leadId = route.params?.leadId ?? null;
  const defaults = useAgentDefaults();
  const fallbacks = useSettingsFallbacks();
  const campaigns = useAgentCampaigns();
  const create = useCreateTestDraft();
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);

  const drafts = (campaigns.data ?? [])
    .filter((row) => row.kind === 'call' && row.campaign.status === 'draft')
    .slice(0, MAX_DRAFTS);

  const createDraft = useSingleFlight(async () => {
    if (!leadId) return;
    const form = formFromDefaults(defaults.data ?? null, fallbacks);
    const name = t('callAgent.test.draftName', { date: formatDate(new Date(), i18n.language) ?? '' });
    const campaign = await create.mutateAsync(testDraftInput(form, leadId, name));
    setTarget({ id: campaign.id, name: campaign.name });
  });

  if (target) {
    return (
      <Screen edges={['bottom']} mode="keyboard" contentClassName="gap-4 pt-4">
        <AppAlert tone="info" message={t('callAgent.test.testing', { name: target.name })} />
        <TestConversation key={target.id} campaignId={target.id} />
        <AppButton title={t('callAgent.test.another')} variant="outline" onPress={() => setTarget(null)} />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']} contentClassName="gap-4 pt-4">
      <AppAlert tone="info" message={t('callAgent.test.explain')} />

      <AppCard className="gap-3">
        <View className="flex-row items-center gap-3">
          <IconContainer icon={FlaskConical} tone="success" size="lg" />
          <AppText variant="title" className="flex-1">
            {t('callAgent.test.fromDefaults')}
          </AppText>
        </View>
        <AppText tone="muted">{t('callAgent.test.createFor')}</AppText>
        {leadId ? (
          <AppButton
            title={t('callAgent.test.create')}
            loading={create.isPending}
            disabled={defaults.isPending}
            onPress={createDraft}
            fullWidth
          />
        ) : (
          <AppButton
            title={t('callAgent.test.chooseLead')}
            leftIcon={Users}
            onPress={() => navigation.navigate('CallAgentLeadPicker', { purpose: 'test' })}
            fullWidth
          />
        )}
      </AppCard>

      {drafts.length > 0 ? (
        <View className="gap-3">
          <AppText variant="title">{t('callAgent.test.existing')}</AppText>
          {drafts.map((row) => (
            <AppPressableCard
              key={row.campaign.id}
              accessibilityLabel={t('callAgent.test.useDraftA11y', { name: row.campaign.name })}
              onPress={() => setTarget({ id: row.campaign.id, name: row.campaign.name })}
              className="flex-row items-center gap-3"
            >
              <Icon icon={PhoneCall} size="sm" color="mutedForeground" />
              <AppText className="flex-1" numberOfLines={1}>
                {row.campaign.name}
              </AppText>
              <CampaignStatusBadge status={row.campaign.status} />
            </AppPressableCard>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
