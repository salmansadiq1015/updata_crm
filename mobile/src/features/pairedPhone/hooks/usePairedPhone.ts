import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/queryKeys';
import { showApiErrorToast, showSuccessToast } from '@/utils/toast';

import { pairedPhoneApi } from '../api/pairedPhoneApi';

export function usePairedDevices(enabled = true) {
  return useQuery({
    queryKey: queryKeys.pairedPhone.devices,
    queryFn: ({ signal }) => pairedPhoneApi.devices(signal),
    enabled,
    refetchInterval: 10_000,
  });
}

export function useVoiceSettings() {
  return useQuery({
    queryKey: queryKeys.pairedPhone.voice,
    queryFn: ({ signal }) => pairedPhoneApi.voiceSettings(signal),
    retry: false,
  });
}

export function useSetVoicePaused() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (paused: boolean) => pairedPhoneApi.setVoicePaused(paused),
    onSuccess: (data) => client.setQueryData(queryKeys.pairedPhone.voice, data),
    onError: showApiErrorToast,
  });
}

export function useClearDevice(successMessage: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pairedPhoneApi.clear(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.pairedPhone.devices });
      showSuccessToast(successMessage);
    },
    onError: showApiErrorToast,
  });
}

/** Live calls of a running call campaign (3 s poll while the screen is open). */
export function useActiveCalls(campaignId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.pairedPhone.activeCalls(campaignId),
    queryFn: ({ signal }) => pairedPhoneApi.activeCalls(campaignId, signal),
    enabled: enabled && Boolean(campaignId),
    refetchInterval: enabled ? 3_000 : false,
  });
}

export function useCallControl(campaignId: string, successMessage: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ recordId, action }: { recordId: string; action: 'takeover' | 'hangup' }) =>
      action === 'takeover' ? pairedPhoneApi.takeover(recordId) : pairedPhoneApi.hangup(recordId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.pairedPhone.activeCalls(campaignId) });
      showSuccessToast(successMessage);
    },
    onError: showApiErrorToast,
  });
}
