import { useTranslation } from 'react-i18next';

import { AppAlert } from '@/components/feedback/AppAlert';
import { tKey } from '@/features/communication/i18n';

import type { Readiness } from '../domain/agentDomain';
import type { AgentChannel } from '../types';

/** Provider readiness exactly as the server reported it. Never optimistic. */
export function ReadinessNotice({ channel, readiness }: { channel: AgentChannel; readiness: Readiness }) {
  const { t } = useTranslation();
  const prefix = channel === 'call' ? 'call' : 'sms';

  if (readiness.state === 'checking') {
    return <AppAlert tone="info" message={t('aiAgent.readiness.checking')} />;
  }
  if (readiness.state === 'ready') {
    return <AppAlert tone="success" message={t(`aiAgent.readiness.${prefix}Ready`)} />;
  }
  if (readiness.state === 'unknown') {
    const key = readiness.forbidden ? `${prefix}UnknownForbidden` : `${prefix}Unknown`;
    return <AppAlert tone="warning" message={tKey(t, `aiAgent.readiness.${key}`)} />;
  }
  const reason = tKey(t, `aiAgent.readiness.reasons.${readiness.reason ?? 'unknown'}`, {
    defaultValue: t('aiAgent.readiness.reasons.unknown'),
  });
  return (
    <AppAlert
      tone="destructive"
      message={t(channel === 'call' ? 'aiAgent.readiness.callNotReady' : 'aiAgent.readiness.smsNotReady', {
        reason,
      })}
    />
  );
}
