import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { queryKeys } from '@/constants/queryKeys';
import { aiAgentApi } from '@/features/aiAgent/api/aiAgentApi';
import {
  defaultQuestions,
  deviceTimezone,
  type DefaultQuestionTexts,
} from '@/features/aiAgent/domain/agentDomain';
import type { CallCampaignInput } from '@/features/aiAgent/types';
import { showApiErrorToast } from '@/utils/toast';

import { callAgentApi } from '../api/callAgentApi';
import type { SettingsFallbacks } from '../domain/agentSettings';
import type { AgentDefaultsInput } from '../types';

export const callAgentKeys = {
  defaults: ['call-agent', 'defaults'] as const,
};

/** The saved AI agent defaults (null = never configured). */
export function useAgentDefaults() {
  return useQuery({
    queryKey: callAgentKeys.defaults,
    queryFn: ({ signal }) => callAgentApi.defaults(signal),
    staleTime: 60_000,
  });
}

export function useSaveAgentDefaults() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: ['call-agent', 'save-defaults'],
    mutationFn: (input: AgentDefaultsInput) => callAgentApi.saveDefaults(input),
    onSuccess: (saved) => client.setQueryData(callAgentKeys.defaults, saved),
    onError: showApiErrorToast,
  });
}

/** Creates an `isTest` draft for the text test. Never starts it. */
export function useCreateTestDraft() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CallCampaignInput & { isTest: true }) => aiAgentApi.createCallCampaign(input),
    onSuccess: (campaign) => {
      client.setQueryData(queryKeys.aiAgent.campaign('call', campaign.id), campaign);
      void client.invalidateQueries({ queryKey: queryKeys.aiAgent.campaigns });
    },
    onError: showApiErrorToast,
  });
}

/** The localized texts the app proposes when the user saved nothing. */
export function useDefaultQuestionTexts(): DefaultQuestionTexts {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      decision_authority: {
        label: t('aiAgent.defaults.decision_authority.label'),
        text: t('aiAgent.defaults.decision_authority.text'),
      },
      need: { label: t('aiAgent.defaults.need.label'), text: t('aiAgent.defaults.need.text') },
      interest: { label: t('aiAgent.defaults.interest.label'), text: t('aiAgent.defaults.interest.text') },
      timeline: { label: t('aiAgent.defaults.timeline.label'), text: t('aiAgent.defaults.timeline.text') },
      callback_time: {
        label: t('aiAgent.defaults.callback_time.label'),
        text: t('aiAgent.defaults.callback_time.text'),
      },
    }),
    [t],
  );
}

/** Standard values used wherever the user has not saved a default. */
export function useSettingsFallbacks(): SettingsFallbacks {
  const { t, i18n } = useTranslation();
  const texts = useDefaultQuestionTexts();
  return useMemo(
    () => ({
      disclosure: t('aiAgent.call.disclosure'),
      questions: defaultQuestions(texts),
      timezone: deviceTimezone(),
      // The app language is always in the server's agent language list.
      language: i18n.language || 'en',
    }),
    [t, texts, i18n.language],
  );
}
