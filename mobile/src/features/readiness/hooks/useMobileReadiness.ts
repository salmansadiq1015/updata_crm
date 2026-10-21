import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, PermissionsAndroid } from 'react-native';

import { getEnv } from '@/config/env';
import { queryKeys } from '@/constants/queryKeys';
import {
  checkPermission,
  openAppSettings,
  requestPermission,
} from '@/services/permissions/permissionsService';
import {
  requestCallingPermissions,
  requestSmsAgentPermissions,
  telephony,
} from '@/services/telephony/telephonyService';

import { checkServer } from '../api';
import {
  buildReadiness,
  summarize,
  type ReadinessAction,
  type ReadinessInput,
} from '../domain/mobileReadiness';

type BlockedKey = 'phone' | 'sms' | 'microphone' | 'notifications';

/** Gathers the phone's and the CRM's state for the readiness screen and runs its fix actions. */
export function useMobileReadiness() {
  const { t } = useTranslation();
  const distribution = getEnv().distribution;
  const caps = useQuery({
    queryKey: queryKeys.communication.capabilities,
    queryFn: () => telephony.getCapabilities(),
  });
  const sims = useQuery({
    queryKey: queryKeys.communication.sims,
    queryFn: () => telephony.getActiveSims().catch(() => []),
  });
  const microphone = useQuery({
    queryKey: queryKeys.readiness.microphone,
    queryFn: () => checkPermission(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO),
  });
  const battery = useQuery({
    queryKey: queryKeys.readiness.battery,
    queryFn: () => telephony.isIgnoringBatteryOptimizations(),
    enabled: distribution === 'private',
  });
  const server = useQuery({
    queryKey: queryKeys.readiness.server,
    queryFn: ({ signal }) => checkServer(signal),
  });
  const [blocked, setBlocked] = useState<ReadonlySet<BlockedKey>>(new Set());

  const { refetch: refetchCaps } = caps;
  const { refetch: refetchSims } = sims;
  const { refetch: refetchMic } = microphone;
  const { refetch: refetchBattery } = battery;
  const { refetch: refetchServer } = server;
  const refresh = useCallback(async () => {
    await Promise.all([refetchCaps(), refetchSims(), refetchMic(), refetchBattery(), refetchServer()]);
  }, [refetchCaps, refetchSims, refetchMic, refetchBattery, refetchServer]);

  // Coming back from Android Settings may have changed any answer.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const input: ReadinessInput = {
    caps: caps.data ?? null,
    sims: sims.data ?? null,
    distribution,
    microphone: microphone.data ?? null,
    batteryUnrestricted: distribution === 'private' ? (battery.data ?? null) : null,
    blockedPermissions: blocked,
    server: server.data ?? { state: 'checking' },
  };
  const items = buildReadiness(input);
  const summary = summarize(items);

  const markBlocked = (key: BlockedKey, isBlocked: boolean) =>
    setBlocked((current) => {
      const next = new Set(current);
      if (isBlocked) next.add(key);
      else next.delete(key);
      return next;
    });

  const run = useCallback(
    async (action: ReadinessAction) => {
      if (action === 'openSettings') await openAppSettings();
      else if (action === 'retry') await refetchServer();
      else if (action === 'allowBackground') await telephony.requestIgnoreBatteryOptimizations();
      else if (action === 'allowPhone') {
        const result = await requestCallingPermissions({
          callPhone: {
            title: t('communication.permissions.callTitle'),
            message: t('communication.permissions.callMessage'),
            buttonPositive: t('common.continue'),
          },
          phoneState: {
            title: t('communication.permissions.stateTitle'),
            message: t('communication.permissions.stateMessage'),
            buttonPositive: t('common.continue'),
          },
        });
        markBlocked('phone', result.callPhone === 'blocked' || result.phoneState === 'blocked');
      } else if (action === 'allowSms' || action === 'allowNotifications') {
        const result = await requestSmsAgentPermissions({
          sendSms: {
            title: t('smsAgent.permission.sendTitle'),
            message: t('smsAgent.permission.sendBody'),
            buttonPositive: t('smsAgent.permission.allow'),
            buttonNegative: t('smsAgent.permission.deny'),
          },
          receiveSms: {
            title: t('smsAgent.permission.receiveTitle'),
            message: t('smsAgent.permission.receiveBody'),
            buttonPositive: t('smsAgent.permission.allow'),
            buttonNegative: t('smsAgent.permission.deny'),
          },
          notifications: {
            title: t('smsAgent.permission.notifyTitle'),
            message: t('smsAgent.permission.notifyBody'),
            buttonPositive: t('smsAgent.permission.allow'),
            buttonNegative: t('smsAgent.permission.deny'),
          },
        });
        markBlocked('sms', result.sendSms === 'blocked' || result.receiveSms === 'blocked');
        markBlocked('notifications', result.notifications === 'blocked');
      } else if (action === 'allowMicrophone') {
        const result = await requestPermission(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
          title: t('readiness.micTitle'),
          message: t('readiness.micMessage'),
          buttonPositive: t('common.continue'),
        });
        markBlocked('microphone', result === 'blocked');
      }
      await refresh();
    },
    [t, refresh, refetchServer],
  );

  const checking = caps.isFetching || server.isFetching;
  return { items, summary, run, refresh, checking };
}
