import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { AppAlert } from '@/components/feedback/AppAlert';
import { tKey } from '@/features/communication/i18n';

import type { Readiness } from '../domain/agentDomain';
import type { AgentChannel } from '../types';

export type ReadinessMessage = { tone: 'info' | 'success' | 'warning' | 'destructive'; message: string };

/** The provider status sentence exactly as the server reported it. Never optimistic. */
export function readinessMessage(
  t: TFunction,
  channel: AgentChannel,
  readiness: Readiness,
): ReadinessMessage {
  const prefix = channel === 'call' ? 'call' : 'sms';
  if (readiness.state === 'checking') return { tone: 'info', message: t('aiAgent.readiness.checking') };
  if (readiness.state === 'ready') {
    return { tone: 'success', message: tKey(t, `aiAgent.readiness.${prefix}Ready`) };
  }
  if (readiness.state === 'unknown') {
    const key = readiness.forbidden ? `${prefix}UnknownForbidden` : `${prefix}Unknown`;
    return { tone: 'warning', message: tKey(t, `aiAgent.readiness.${key}`) };
  }
  const reason = tKey(t, `aiAgent.readiness.reasons.${readiness.reason ?? 'unknown'}`, {
    defaultValue: t('aiAgent.readiness.reasons.unknown'),
  });
  return {
    tone: 'destructive',
    message: t(channel === 'call' ? 'aiAgent.readiness.callNotReady' : 'aiAgent.readiness.smsNotReady', {
      reason,
    }),
  };
}

export function ReadinessNotice({ channel, readiness }: { channel: AgentChannel; readiness: Readiness }) {
  const { t } = useTranslation();
  const { tone, message } = readinessMessage(t, channel, readiness);
  return <AppAlert tone={tone} message={message} />;
}
