// Pure rules for the SMS agent screens (readiness + campaign payload). Tested
// without React Native.
import { defaultStatusRules, toQuestionnaire } from '@/features/aiAgent/domain/agentDomain';
import type { AgentQuestion } from '@/features/aiAgent/types';
import type { Distribution } from '@/config/env';
import type { TelephonyCapabilities } from '@/services/telephony/types';

import type { SimCampaignInput, SimCampaignStatus } from '../types';

export type ReadinessItem = 'smsPermission' | 'notifications' | 'battery';
export type SmsAgentReadiness = {
  /** A hard block: nothing can be sent from this binary/device. */
  blocked: 'unsupported' | 'noTelephony' | null;
  /** Steps the user can fix with a tap. `battery` is advisory, the rest required. */
  missing: ReadinessItem[];
  /** Sending can start (battery exemption is recommended, not required). */
  canStart: boolean;
};

export function smsAgentReadiness(
  distribution: Distribution,
  caps: TelephonyCapabilities | undefined,
  batteryUnrestricted: boolean,
): SmsAgentReadiness {
  if (distribution !== 'private' || (caps && !caps.smsPermissionsDeclared)) {
    return { blocked: 'unsupported', missing: [], canStart: false };
  }
  if (!caps) return { blocked: null, missing: [], canStart: false };
  if (!caps.hasTelephony || caps.simState === 'absent')
    return { blocked: 'noTelephony', missing: [], canStart: false };
  const missing: ReadinessItem[] = [];
  if (!caps.sendSmsGranted || !caps.receiveSmsGranted) missing.push('smsPermission');
  if (!caps.notificationsGranted) missing.push('notifications');
  if (!batteryUnrestricted) missing.push('battery');
  return { blocked: null, missing, canStart: !missing.includes('smsPermission') };
}

export type SimLaunchForm = {
  name: string;
  leadIds: readonly string[];
  questions: readonly AgentQuestion[];
  agentName: string;
  organization: string;
  windowStart: string;
  windowEnd: string;
  timezone: string;
  reminders: boolean;
  isTest: boolean;
  subscriptionId: number | null;
};

/** Server payload (POST /sim-sms/campaigns). SMS sending is paced and capped server-side. */
export function toSimCampaignInput(form: SimLaunchForm): SimCampaignInput {
  return {
    name: form.name,
    leadIds: [...new Set(form.leadIds)],
    isTest: form.isTest,
    questionnaire: toQuestionnaire(form.questions) as SimCampaignInput['questionnaire'],
    statusRules: defaultStatusRules(form.questions) as SimCampaignInput['statusRules'],
    agent: { agentName: form.agentName.trim() || 'Assistant', organizationName: form.organization.trim() },
    settings: {
      timezone: form.timezone,
      sendWindow: { start: form.windowStart, end: form.windowEnd },
      daysOfWeek: [1, 2, 3, 4, 5, 6],
      maxReminders: form.reminders ? 1 : 0,
      replyTimeoutHours: 48,
      minSecondsBetweenSends: 20,
    },
    subscriptionId: form.subscriptionId,
  };
}

/** Lifecycle actions the server accepts from each status (mirrors simSms.service transitions). */
export function simCampaignActions(status: SimCampaignStatus | string): ('start' | 'pause' | 'cancel')[] {
  const actions: ('start' | 'pause' | 'cancel')[] = [];
  if (status === 'draft' || status === 'paused') actions.push('start');
  if (status === 'running') actions.push('pause');
  if (['draft', 'running', 'paused'].includes(status)) actions.push('cancel');
  return actions;
}
