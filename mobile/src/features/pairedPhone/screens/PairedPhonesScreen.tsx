import { AlertTriangle, CheckCircle2, CircleDashed, Pause, Play, Smartphone } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { QueryState } from '@/components/feedback/QueryState';
import { Screen } from '@/components/layout/Screen';
import { usePullRefresh } from '@/components/layout/usePullRefresh';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppEmptyState } from '@/components/ui/AppEmptyState';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import type { RootScreenProps } from '@/navigation/navigationTypes';

import { deviceChecks, deviceHeadline, type DeviceHeadline } from '../domain/pairedPhoneDomain';
import {
  useClearDevice,
  usePairedDevices,
  useSetVoicePaused,
  useVoiceSettings,
} from '../hooks/usePairedPhone';
import type { PairedDevice } from '../types';

const HEADLINE_VARIANT: Record<DeviceHeadline, 'success' | 'warning' | 'destructive' | 'info' | 'muted'> = {
  ready: 'success',
  notReady: 'warning',
  attention: 'destructive',
  inCall: 'info',
  offline: 'muted',
};

/**
 * Paired phones: status of the laptop gateway, ESP32 board, dial key, Bluetooth link and the
 * audio check for each device, plus the global voice kill switch. Setup itself (pairing code,
 * key provisioning, audio test) happens on the laptop and the web app.
 */
export function PairedPhonesScreen(_props: RootScreenProps<'PairedPhones'>) {
  const { t } = useTranslation();
  const devices = usePairedDevices();
  const voice = useVoiceSettings();
  const setPaused = useSetVoicePaused();
  const [confirmPause, setConfirmPause] = useState(false);
  const { refreshing, onRefresh } = usePullRefresh(devices.isFetching, () => {
    void devices.refetch();
    void voice.refetch();
  });
  const paused = voice.data?.voicePaused ?? false;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} contentClassName="gap-4 pt-1 pb-10">
      {voice.data ? (
        <AppCard className="gap-2">
          <View className="flex-row items-center justify-between gap-2">
            <AppText variant="title">{t('pairedPhone.voice.title')}</AppText>
            <AppBadge
              label={paused ? t('pairedPhone.voice.paused') : t('pairedPhone.voice.active')}
              variant={paused ? 'destructive' : 'success'}
              dot
            />
          </View>
          <AppText tone="muted">
            {paused ? t('pairedPhone.voice.pausedHint') : t('pairedPhone.voice.activeHint')}
          </AppText>
          {voice.data.pausedByEnv ? (
            <AppText tone="muted">{t('pairedPhone.voice.byServer')}</AppText>
          ) : (
            <AppButton
              title={paused ? t('pairedPhone.voice.resume') : t('pairedPhone.voice.stop')}
              leftIcon={paused ? Play : Pause}
              variant={paused ? 'primary' : 'destructive'}
              loading={setPaused.isPending}
              onPress={() => (paused ? setPaused.mutate(false) : setConfirmPause(true))}
            />
          )}
        </AppCard>
      ) : null}

      <QueryState
        query={devices}
        loading={<AppSkeleton className="h-48 rounded-2xl" />}
        isEmpty={(devices.data ?? []).length === 0}
        empty={
          <AppEmptyState
            icon={Smartphone}
            title={t('pairedPhone.empty.title')}
            description={t('pairedPhone.empty.body')}
          />
        }
      >
        <View className="gap-3">
          {(devices.data ?? []).map((d) => (
            <DeviceCard key={d.id} device={d} />
          ))}
        </View>
      </QueryState>

      <ConfirmDialog
        visible={confirmPause}
        title={t('pairedPhone.voice.stopTitle')}
        description={t('pairedPhone.voice.stopBody')}
        confirmLabel={t('pairedPhone.voice.stop')}
        destructive
        loading={setPaused.isPending}
        onConfirm={() => setPaused.mutate(true, { onSettled: () => setConfirmPause(false) })}
        onCancel={() => setConfirmPause(false)}
      />
    </Screen>
  );
}

function DeviceCard({ device: d }: { device: PairedDevice }) {
  const { t } = useTranslation();
  const clear = useClearDevice(t('pairedPhone.cleared'));
  const [confirmClear, setConfirmClear] = useState(false);
  const headline = deviceHeadline(d);
  return (
    <AppCard className="gap-3">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <AppText variant="title" numberOfLines={1}>
            {d.name}
          </AppText>
          {d.phoneLabel ? (
            <AppText tone="muted" numberOfLines={1}>
              {d.phoneLabel}
            </AppText>
          ) : null}
        </View>
        <AppBadge label={t(`pairedPhone.headline.${headline}`)} variant={HEADLINE_VARIANT[headline]} />
      </View>

      {d.attention ? (
        <View className="gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <View className="flex-row gap-2">
            <Icon icon={AlertTriangle} color="destructive" size="sm" />
            <AppText className="flex-1">{d.attention.reason}</AppText>
          </View>
          <AppButton
            title={t('pairedPhone.clear')}
            variant="outline"
            size="sm"
            onPress={() => setConfirmClear(true)}
          />
        </View>
      ) : null}

      <View className="gap-1.5">
        {deviceChecks(d).map((c) => (
          <View
            key={c.key}
            className="flex-row items-center gap-2"
            accessibilityLabel={`${t(`pairedPhone.check.${c.key}`)}: ${c.ok ? t('pairedPhone.done') : t('pairedPhone.notYet')}`}
          >
            <Icon
              icon={c.ok ? CheckCircle2 : CircleDashed}
              color={c.ok ? 'success' : 'mutedForeground'}
              size="sm"
            />
            <AppText tone={c.ok ? undefined : 'muted'}>{t(`pairedPhone.check.${c.key}`)}</AppText>
          </View>
        ))}
      </View>

      {!d.readiness.ok && d.online && !d.attention && d.readiness.reasons.length ? (
        <AppText tone="muted">
          {t('pairedPhone.waiting', {
            reasons: d.readiness.reasons
              .map((r) => t(`pairedPhone.reason.${r}`, { defaultValue: r }))
              .join(' · '),
          })}
        </AppText>
      ) : null}
      {d.usage ? (
        <AppText tone="muted">
          {t('pairedPhone.usage', {
            hour: d.usage.callsLastHour,
            maxHour: d.limits.maxCallsPerHour,
            day: d.usage.callsToday,
            maxDay: d.limits.maxCallsPerDay,
          })}
        </AppText>
      ) : null}

      <ConfirmDialog
        visible={confirmClear}
        title={t('pairedPhone.clearTitle')}
        description={t('pairedPhone.clearBody')}
        confirmLabel={t('pairedPhone.clear')}
        loading={clear.isPending}
        onConfirm={() => clear.mutate(d.id, { onSettled: () => setConfirmClear(false) })}
        onCancel={() => setConfirmClear(false)}
      />
    </AppCard>
  );
}
