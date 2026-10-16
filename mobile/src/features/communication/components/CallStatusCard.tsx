import { AlertTriangle, PhoneCall, PhoneOff, Radio } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppBadge } from '@/components/ui/AppBadge';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { IconContainer } from '@/components/ui/IconContainer';

import { formatElapsed, observeCall } from '../domain/callEvidence';
import type { LocalOperation } from '../domain/operations';

/**
 * What the device observed — and only that. Android cannot tell us that the lead
 * answered, so the card never says "connected"; it shows off-hook time with that caveat.
 */
export function CallStatusCard({
  op,
  monitoringAvailable,
}: {
  op: LocalOperation;
  monitoringAvailable: boolean;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const observation = observeCall(op.callEvents, op.dispatchedAt, now);
  const live = op.phase === 'in_progress' && observation.phase !== 'ended';

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);

  const routeLabel =
    op.route === 'telecom_direct'
      ? t('communication.route.telecom_direct', { sim: op.sim?.label ?? t('communication.defaultSim') })
      : t('communication.route.dialer_handoff');

  const stateLabel = !monitoringAvailable
    ? t('communication.observed.unavailable')
    : observation.phase === 'waiting'
      ? t('communication.observed.waiting')
      : observation.phase === 'off_hook'
        ? t('communication.observed.offHook', { elapsed: formatElapsed(observation.offhookMs ?? 0) })
        : observation.phase === 'ended'
          ? t('communication.observed.ended', { elapsed: formatElapsed(observation.offhookMs ?? 0) })
          : t('communication.observed.notStarted');

  return (
    <AppCard className="gap-3">
      <View className="flex-row items-center gap-3">
        <IconContainer
          icon={
            observation.phase === 'ended' ? PhoneOff : observation.phase === 'off_hook' ? PhoneCall : Radio
          }
          tone={observation.phase === 'off_hook' ? 'primary' : 'muted'}
          size="md"
          round
        />
        <View className="flex-1 gap-1">
          <AppText variant="label" accessibilityLiveRegion="polite">
            {stateLabel}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {routeLabel}
          </AppText>
          <View className="flex-row">
            <AppBadge
              label={t(`communication.phase.${op.phase}`)}
              variant={op.phase === 'in_progress' ? 'default' : 'muted'}
              dot
            />
          </View>
        </View>
      </View>
      {monitoringAvailable && observation.phase !== 'not_observed' ? (
        <AppText variant="caption" tone="muted" className="border-t border-border pt-3">
          {t('communication.observed.caveat')}
        </AppText>
      ) : null}
      {observation.incomingInterference ? (
        <View className="flex-row items-start gap-2 rounded-xl bg-warning/10 p-3">
          <Icon icon={AlertTriangle} size="sm" color="warning" />
          <AppText variant="caption" className="flex-1">
            {t('communication.observed.interference')}
          </AppText>
        </View>
      ) : null}
    </AppCard>
  );
}
