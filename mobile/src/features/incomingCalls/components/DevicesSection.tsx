import { Bluetooth, CheckCircle2, CircleDashed, CreditCard, Settings, Smartphone } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SectionHeader } from '@/components/layout/SectionHeader';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppEmptyState } from '@/components/ui/AppEmptyState';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { openAppSettings } from '@/services/permissions/permissionsService';

import { simDisplay } from '../domain/simReport';
import { useInboundDevices } from '../hooks/useIncomingCalls';
import { useThisPhoneSims, type SimSyncState } from '../hooks/useThisPhoneSims';
import type { InboundDevice } from '../types';

/**
 * Each paired phone: online, Bluetooth link, AI-answering readiness (with reasons), agent and its
 * SIM cards. SIMs are reported by the Updata app running on that phone (see useThisPhoneSims).
 */
export function DevicesSection() {
  const { t } = useTranslation();
  const devices = useInboundDevices();
  const list = devices.data ?? [];
  const sims = useThisPhoneSims(devices.data);
  return (
    <View className="gap-3">
      <SectionHeader title={t('incomingCalls.devices.title')} />
      {devices.isPending ? (
        <AppSkeleton className="h-28 rounded-2xl" />
      ) : devices.isError ? (
        <AppErrorState
          error={devices.error}
          size="inline"
          retrying={devices.isRefetching}
          onRetry={() => void devices.refetch()}
        />
      ) : list.length === 0 ? (
        <AppEmptyState
          icon={Smartphone}
          size="inline"
          title={t('incomingCalls.devices.emptyTitle')}
          description={t('incomingCalls.devices.emptyBody')}
        />
      ) : (
        list.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            isThisPhone={device.id === sims.thisPhoneId}
            canChoose={list.length > 1}
            sync={sims.state.deviceId === device.id ? sims.state : null}
            onReportSims={() => void sims.reportFromTap(device)}
          />
        ))
      )}
    </View>
  );
}

function DeviceCard({
  device: d,
  isThisPhone,
  canChoose,
  sync,
  onReportSims,
}: {
  device: InboundDevice;
  isThisPhone: boolean;
  canChoose: boolean;
  sync: SimSyncState | null;
  onReportSims: () => void;
}) {
  const { t } = useTranslation();
  const linked = d.bluetooth === 'slc';
  return (
    <AppCard variant="outline" className="gap-2">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <AppText variant="title" numberOfLines={1}>
            {d.name}
          </AppText>
          {d.phoneLabel ? (
            <AppText variant="caption" tone="muted" numberOfLines={1}>
              {d.phoneLabel}
            </AppText>
          ) : null}
        </View>
        <AppBadge
          label={d.online ? t('incomingCalls.devices.online') : t('incomingCalls.devices.offline')}
          variant={d.online ? 'success' : 'muted'}
          dot
          size="sm"
        />
      </View>
      <View className="flex-row flex-wrap gap-1.5">
        <AppBadge
          icon={Bluetooth}
          label={linked ? t('incomingCalls.devices.btConnected') : t('incomingCalls.devices.btDisconnected')}
          variant={linked ? 'info' : 'muted'}
          size="sm"
        />
        {d.inCall ? <AppBadge label={t('incomingCalls.devices.inCall')} variant="primary" size="sm" /> : null}
        {isThisPhone ? (
          <AppBadge
            icon={Smartphone}
            label={t('incomingCalls.devices.thisPhoneBadge')}
            variant="primary"
            size="sm"
          />
        ) : null}
      </View>
      <SimList device={d} />
      <View className="flex-row items-center gap-2">
        <Icon
          icon={d.aiAnswering.ready ? CheckCircle2 : CircleDashed}
          size="sm"
          color={d.aiAnswering.ready ? 'success' : 'warning'}
        />
        <AppText className="flex-1" tone={d.aiAnswering.ready ? 'success' : 'default'}>
          {d.aiAnswering.ready ? t('incomingCalls.devices.ready') : t('incomingCalls.devices.notReady')}
        </AppText>
      </View>
      {!d.aiAnswering.ready && d.aiAnswering.reasons.length > 0 ? (
        <View className="gap-0.5 ps-7">
          {d.aiAnswering.reasons.map((reason) => (
            <AppText key={reason} variant="caption" tone="muted">
              {`• ${t(`incomingCalls.devices.reason.${reason}`, { defaultValue: reason.replace(/_/g, ' ') })}`}
            </AppText>
          ))}
        </View>
      ) : null}
      <AppText variant="caption" tone="muted">
        {d.agent?.name
          ? t('incomingCalls.devices.agent', { name: d.agent.name })
          : t('incomingCalls.devices.noAgent')}
        {` · ${t('incomingCalls.devices.last24h', { calls: d.last24h.calls, ai: d.last24h.answeredByAi })}`}
      </AppText>
      <SimSyncNotice sync={sync} onAllow={onReportSims} />
      {canChoose && !isThisPhone ? (
        <AppButton
          title={t('incomingCalls.devices.thisPhone')}
          leftIcon={Smartphone}
          variant="soft"
          size="sm"
          loading={sync?.status === 'working'}
          onPress={onReportSims}
        />
      ) : null}
    </AppCard>
  );
}

function SimList({ device }: { device: InboundDevice }) {
  const { t } = useTranslation();
  if (!device.simsReportedAt) {
    return (
      <AppText variant="caption" tone="muted">
        {t('incomingCalls.devices.simsUnknown')}
      </AppText>
    );
  }
  if (device.sims.length === 0) {
    return (
      <AppText variant="caption" tone="muted">
        {t('incomingCalls.devices.simsNone')}
      </AppText>
    );
  }
  return (
    <View className="gap-1">
      {device.sims.map((sim) => (
        <View key={sim.slot} className="flex-row items-center gap-2">
          <Icon icon={CreditCard} size="xs" color="mutedForeground" />
          <AppText variant="caption">{simDisplay(sim)}</AppText>
        </View>
      ))}
    </View>
  );
}

/** Result of reading/reporting this phone's SIMs; permission problems are explained, never thrown. */
function SimSyncNotice({ sync, onAllow }: { sync: SimSyncState | null; onAllow: () => void }) {
  const { t } = useTranslation();
  switch (sync?.status) {
    case 'working':
      return (
        <AppText variant="caption" tone="muted" accessibilityLiveRegion="polite">
          {t('incomingCalls.devices.simsChecking')}
        </AppText>
      );
    case 'reported':
      return (
        <AppText variant="caption" tone="success" accessibilityLiveRegion="polite">
          {t('incomingCalls.devices.simsUpdated')}
        </AppText>
      );
    case 'needsPermission':
      return (
        <View className="gap-2 rounded-xl bg-muted/60 p-3">
          <AppText variant="caption">{t('incomingCalls.devices.simPermission')}</AppText>
          <AppButton
            title={t('incomingCalls.devices.simAllow')}
            variant="outline"
            size="sm"
            onPress={onAllow}
          />
        </View>
      );
    case 'blocked':
      return (
        <View className="gap-2 rounded-xl bg-muted/60 p-3">
          <AppText variant="caption">{t('incomingCalls.devices.simBlocked')}</AppText>
          <AppButton
            title={t('incomingCalls.devices.openSettings')}
            leftIcon={Settings}
            variant="outline"
            size="sm"
            onPress={() => void openAppSettings()}
          />
        </View>
      );
    case 'unavailable':
      return (
        <AppText variant="caption" tone="muted">
          {t('incomingCalls.devices.simUnavailable')}
        </AppText>
      );
    case 'error':
      return (
        <AppText variant="caption" tone="destructive">
          {t('incomingCalls.devices.simError')}
        </AppText>
      );
    default:
      return null;
  }
}
