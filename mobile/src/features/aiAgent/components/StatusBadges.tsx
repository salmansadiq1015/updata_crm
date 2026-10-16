import { useTranslation } from 'react-i18next';

import { AppBadge, type BadgeVariant } from '@/components/ui/AppBadge';
import { tKey } from '@/features/communication/i18n';

const CAMPAIGN_VARIANT: Record<string, BadgeVariant> = {
  draft: 'muted',
  scheduled: 'info',
  queued: 'info',
  running: 'primary',
  paused: 'warning',
  completed: 'success',
  cancelled: 'muted',
  failed: 'destructive',
};

/** Campaign status as the server reports it; unknown values are shown verbatim. */
export function CampaignStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <AppBadge
      label={tKey(t, `aiAgent.status.${status}`, { defaultValue: status })}
      variant={CAMPAIGN_VARIANT[status] ?? 'outline'}
    />
  );
}

const RECIPIENT_VARIANT: Record<string, BadgeVariant> = {
  completed: 'success',
  delivered: 'success',
  read: 'success',
  sent: 'info',
  accepted: 'info',
  in_progress: 'primary',
  dialing: 'primary',
  submitting: 'primary',
  failed: 'destructive',
  undelivered: 'destructive',
  exhausted: 'warning',
  unknown: 'warning',
  retry_scheduled: 'warning',
  suppressed: 'muted',
  ineligible: 'muted',
  cancelled: 'muted',
};

/** Per-lead state: call recipient state or SMS message status, verbatim-mapped. */
export function RecipientStateBadge({ kind, state }: { kind: 'call' | 'sms'; state: string }) {
  const { t } = useTranslation();
  const key = kind === 'call' ? `aiAgent.recipientState.${state}` : `aiAgent.messageStatus.${state}`;
  return (
    <AppBadge label={tKey(t, key, { defaultValue: state })} variant={RECIPIENT_VARIANT[state] ?? 'outline'} />
  );
}
