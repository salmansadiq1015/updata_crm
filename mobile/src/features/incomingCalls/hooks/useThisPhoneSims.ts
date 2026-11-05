import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PermissionsAndroid } from 'react-native';

import { queryKeys } from '@/constants/queryKeys';
import { i18next } from '@/i18n';
import { checkPermission, ensurePermission } from '@/services/permissions/permissionsService';
import { preferencesStorage } from '@/services/storage/preferencesStorage';
import { telephony, TelephonyError } from '@/services/telephony/telephonyService';
import { showApiErrorToast, showSuccessToast } from '@/utils/toast';

import { incomingCallsApi } from '../api/incomingCallsApi';
import { buildSimPayload, needsSimReport } from '../domain/simReport';
import type { InboundDevice, ReportedSim } from '../types';

/** Which paired device is this phone, when the owner has several (chosen with "This is my phone"). */
export const THIS_PHONE_DEVICE_KEY = 'incomingCalls.thisPhoneDeviceId';
const LOCAL_SIMS_KEY = ['incoming-calls', 'this-phone-sims'] as const;
const READ_PHONE_STATE = PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE;

export type SimSyncStatus =
  | 'idle'
  | 'working'
  | 'upToDate'
  | 'reported'
  | 'needsPermission'
  | 'blocked'
  | 'unavailable'
  | 'error';
export type SimSyncState = { status: SimSyncStatus; deviceId: string | null };

type LocalSims = { kind: 'ok'; sims: ReportedSim[] } | { kind: 'needsPermission' | 'unavailable' | 'error' };

/** This phone's SIM cards, read WITHOUT showing a permission dialog. */
async function readLocalSims(): Promise<LocalSims> {
  if (!telephony.isAvailable()) return { kind: 'unavailable' };
  const permission = await checkPermission(READ_PHONE_STATE);
  if (permission === 'unavailable') return { kind: 'unavailable' };
  if (permission !== 'granted') return { kind: 'needsPermission' };
  try {
    return { kind: 'ok', sims: buildSimPayload(await telephony.getActiveSims()) };
  } catch (error) {
    return {
      kind:
        error instanceof TelephonyError && error.code === 'PERMISSION_DENIED' ? 'needsPermission' : 'error',
    };
  }
}

const reportKey = (deviceId: string, sims: ReportedSim[]) => `${deviceId}:${JSON.stringify(sims)}`;

/**
 * Keeps the SIM list of THIS phone on its paired device (HFP cannot tell which SIMs a phone has).
 * - One paired device: it is this phone; its SIMs are compared and reported when the screen opens.
 * - Several: the owner taps "This is my phone" once; that device is remembered and kept in sync.
 * The automatic check never shows a permission dialog: without READ_PHONE_STATE it explains and
 * offers a button, and only that explicit tap asks Android.
 */
export function useThisPhoneSims(devices: InboundDevice[] | undefined) {
  const client = useQueryClient();
  const list = useMemo(() => devices ?? [], [devices]);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [chosenLoaded, setChosenLoaded] = useState(false);
  const [tapped, setTapped] = useState<SimSyncState | null>(null);
  const reported = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.resolve(preferencesStorage.getItem(THIS_PHONE_DEVICE_KEY)).then((value: string | null) => {
      if (!alive) return;
      setChosenId(value || null);
      setChosenLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const thisPhoneId =
    list.length === 1 ? list[0]!.id : chosenId && list.some((d) => d.id === chosenId) ? chosenId : null;
  const thisPhone = list.find((d) => d.id === thisPhoneId) ?? null;

  const local = useQuery({
    queryKey: LOCAL_SIMS_KEY,
    queryFn: readLocalSims,
    enabled: chosenLoaded && Boolean(thisPhoneId),
    staleTime: 0,
    gcTime: 0,
  });

  const report = useMutation({
    mutationFn: ({ deviceId, sims }: { deviceId: string; sims: ReportedSim[] }) =>
      incomingCallsApi.reportSims(deviceId, sims),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.incomingCalls.devices }),
  });
  const { mutate: reportAuto, mutateAsync: reportNow } = report;

  // Automatic: this phone's SIMs differ from what its device has (or were never reported).
  const localSims = local.data?.kind === 'ok' ? local.data.sims : null;
  useEffect(() => {
    if (!thisPhone || !localSims || !needsSimReport(thisPhone, localSims)) return;
    const k = reportKey(thisPhone.id, localSims);
    if (reported.current === k) return;
    reported.current = k;
    reportAuto({ deviceId: thisPhone.id, sims: localSims });
  }, [thisPhone, localSims, reportAuto]);

  /** Explicit tap ("This is my phone" / "Allow SIM detection"): may ask for the permission. */
  const reportFromTap = useCallback(
    async (device: InboundDevice) => {
      const set = (status: SimSyncStatus) => setTapped({ status, deviceId: device.id });
      if (!telephony.isAvailable()) return set('unavailable');
      set('working');
      const permission = await ensurePermission(READ_PHONE_STATE, {
        title: i18next.t('incomingCalls.devices.simRationaleTitle'),
        message: i18next.t('incomingCalls.devices.simRationaleBody'),
        buttonPositive: i18next.t('common.continue'),
        buttonNegative: i18next.t('common.cancel'),
      });
      if (permission === 'blocked') return set('blocked');
      if (permission === 'unavailable') return set('unavailable');
      if (permission !== 'granted') return set('needsPermission');
      const read = await client.fetchQuery({
        queryKey: LOCAL_SIMS_KEY,
        queryFn: readLocalSims,
        staleTime: 0,
      });
      if (read.kind !== 'ok') return set(read.kind);
      if (list.length > 1) {
        setChosenId(device.id);
        await preferencesStorage.setItem(THIS_PHONE_DEVICE_KEY, device.id);
      }
      if (!needsSimReport(device, read.sims)) return set('upToDate');
      reported.current = reportKey(device.id, read.sims);
      try {
        await reportNow({ deviceId: device.id, sims: read.sims });
        set('reported');
        showSuccessToast(i18next.t('incomingCalls.devices.simsUpdated'));
      } catch (error) {
        set('error');
        showApiErrorToast(error);
      }
    },
    [client, list.length, reportNow],
  );

  // What to show, per device: the last tap wins; otherwise the automatic check of this phone.
  const autoState: SimSyncState | null = !thisPhoneId
    ? null
    : report.isPending
      ? { status: 'working', deviceId: report.variables?.deviceId ?? thisPhoneId }
      : report.isSuccess
        ? { status: 'reported', deviceId: report.variables?.deviceId ?? thisPhoneId }
        : report.isError
          ? { status: 'error', deviceId: report.variables?.deviceId ?? thisPhoneId }
          : local.data && local.data.kind !== 'ok' && local.data.kind !== 'unavailable'
            ? { status: local.data.kind, deviceId: thisPhoneId }
            : null;
  const state = tapped ?? autoState ?? { status: 'idle' as const, deviceId: null };

  return { state, thisPhoneId, reportFromTap };
}
