// The CRM's health verdict for this phone and the leads who asked (by SMS) to be called back.
import { PhoneCall, ShieldCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { AppBadge, type BadgeVariant } from '@/components/ui/AppBadge';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { tKey } from '@/features/communication/i18n';
import { formatDateTime } from '@/utils/date';

import { useDeviceHealth, useSmsCallbacks } from '../hooks/useSmsDeviceOps';
import type { SmsCallback } from '../types';

const STATUS_VARIANT: Record<string, BadgeVariant> = { online: 'success', warning: 'warning', offline: 'destructive' };
const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

export function DeviceHealthCard() {
  const { t } = useTranslation();
  const latest = useDeviceHealth();
  const health = latest?.health;
  if (!health) return null;
  const reasons = [...health.reasons]
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3))
    .slice(0, 3);
  return (
    <AppCard className="gap-2">
      <View className="flex-row items-center gap-2">
        <Icon icon={ShieldCheck} color="primary" size="sm" />
        <AppText variant="label" className="flex-1">
          {t('smsAgent.deviceHealth.title')}
        </AppText>
        <AppBadge
          size="sm"
          variant={STATUS_VARIANT[health.status] ?? 'muted'}
          label={tKey(t, `smsAgent.deviceHealth.status.${health.status}`, { defaultValue: health.status })}
        />
      </View>
      {reasons.map((reason) => (
        <AppText key={reason.code} variant="caption" tone={reason.severity === 'critical' ? 'destructive' : 'muted'}>
          {tKey(t, `smsAgent.deviceHealth.reasons.${reason.code}`, { defaultValue: reason.code })}
        </AppText>
      ))}
    </AppCard>
  );
}

function CallbackRow({ item, onOpenLead }: { item: SmsCallback; onOpenLead: (leadId: string) => void }) {
  const { t, i18n } = useTranslation();
  const due = item.needsTime || !item.dueAt ? null : formatDateTime(item.dueAt, i18n.language);
  const words = item.evidence || item.requestedTimeText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.leadName ?? t('smsAgent.callbacks.unknownLead')}
      disabled={!item.leadId}
      onPress={() => onOpenLead(item.leadId)}
      className="gap-0.5 rounded-lg border border-border px-3 py-2"
    >
      <View className="flex-row items-center gap-2">
        <AppText variant="title" className="flex-1" numberOfLines={1}>
          {item.leadName ?? t('smsAgent.callbacks.unknownLead')}
        </AppText>
        <AppBadge
          size="sm"
          variant={due ? 'primary' : 'warning'}
          label={due ?? t('smsAgent.callbacks.needsTime')}
        />
      </View>
      {words ? (
        // The lead's own words (Urdu / Roman Urdu / English): direction follows the text.
        <AppText variant="caption" tone="muted" style={{ writingDirection: 'auto', textAlign: 'auto' }}>
          {`“${words}”`}
        </AppText>
      ) : null}
    </Pressable>
  );
}

export function SmsCallbacksCard({ onOpenLead }: { onOpenLead: (leadId: string) => void }) {
  const { t } = useTranslation();
  const query = useSmsCallbacks();
  const items = query.data ?? [];
  if (!items.length) return null;
  return (
    <AppCard className="gap-2">
      <View className="flex-row items-center gap-2">
        <Icon icon={PhoneCall} color="primary" size="sm" />
        <AppText variant="label" className="flex-1">
          {t('smsAgent.callbacks.title')}
        </AppText>
        <AppBadge size="sm" variant="primary" label={String(items.length)} />
      </View>
      <AppText variant="caption" tone="muted">
        {t('smsAgent.callbacks.help')}
      </AppText>
      {items.slice(0, 10).map((item) => (
        <CallbackRow key={item.id} item={item} onOpenLead={onOpenLead} />
      ))}
    </AppCard>
  );
}
