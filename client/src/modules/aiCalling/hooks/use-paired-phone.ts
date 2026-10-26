'use client';

import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { onSocketConnect } from '@/lib/socket/client';
import { showError, showSuccess } from '@/lib/toast';
import { pairedPhoneApi } from '../services/paired-phone-api';
import type { DeviceLimits } from '../types/ai-calling-types';

export const pairedKeys = {
  devices: ['paired-phone', 'devices'] as const,
  voice: ['ai-calling', 'voice-settings'] as const,
};

const errMessage = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: { message?: string } } }; message?: string })?.response?.data?.error?.message
  || (e as { message?: string })?.message || fallback;

/** Devices with live status: socket pushes on every heartbeat, a slow poll as the backstop. */
export function usePairedDevices(enabled = true) {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => qc.invalidateQueries({ queryKey: pairedKeys.devices }), 600);
    };
    const refreshCalls = () => qc.invalidateQueries({ queryKey: ['ai-calling', 'active-calls'] });
    const attached = new Set<Socket>();
    const unsubscribe = onSocketConnect((socket: Socket) => {
      socket.off('paired-phone:device', refresh);
      socket.on('paired-phone:device', refresh);
      socket.off('paired-phone:call-audio', refreshCalls);
      socket.on('paired-phone:call-audio', refreshCalls);
      attached.add(socket);
    });
    return () => {
      unsubscribe();
      for (const socket of attached) {
        socket.off('paired-phone:device', refresh);
        socket.off('paired-phone:call-audio', refreshCalls);
      }
      if (timer.current) clearTimeout(timer.current);
    };
  }, [qc, enabled]);
  return useQuery({ queryKey: pairedKeys.devices, queryFn: () => pairedPhoneApi.devices(), enabled, refetchInterval: 15_000, retry: false });
}

export function usePairedDeviceMutations() {
  const qc = useQueryClient();
  const done = (message: string) => () => {
    qc.invalidateQueries({ queryKey: pairedKeys.devices });
    showSuccess(message);
  };
  const failed = (fallback: string) => (e: unknown) => showError(errMessage(e, fallback));
  return {
    pairingCode: useMutation({ mutationFn: pairedPhoneApi.pairingCode, onError: failed('Could not create a pairing code') }),
    update: useMutation({
      mutationFn: ({ id, ...input }: { id: string; name?: string; phoneLabel?: string; limits?: Partial<DeviceLimits> }) => pairedPhoneApi.update(id, input),
      onSuccess: done('Device updated'), onError: failed('Could not update the device'),
    }),
    revoke: useMutation({ mutationFn: (id: string) => pairedPhoneApi.revoke(id), onSuccess: done('Device revoked'), onError: failed('Could not revoke the device') }),
    verifyAudio: useMutation({
      mutationFn: ({ id, ...input }: { id: string; inboundPhraseHeard: boolean; outboundPhraseHeard: boolean; note: string }) => pairedPhoneApi.verifyAudio(id, input),
      onSuccess: done('Two-way call audio verified'), onError: failed('Could not record the verification'),
    }),
    rotateKey: useMutation({ mutationFn: (id: string) => pairedPhoneApi.rotateKey(id), onSuccess: done('New dial key issued; provision it on the ESP32'), onError: failed('Could not rotate the key') }),
    clear: useMutation({ mutationFn: (id: string) => pairedPhoneApi.clear(id), onSuccess: done('Device cleared'), onError: failed('Could not clear the device') }),
  };
}

export function useCallControl() {
  const qc = useQueryClient();
  const after = (message: string) => () => {
    qc.invalidateQueries({ queryKey: ['ai-calling', 'active-calls'] });
    showSuccess(message);
  };
  return {
    takeover: useMutation({ mutationFn: (recordId: string) => pairedPhoneApi.takeover(recordId), onSuccess: after('Takeover requested: the call moves to the phone'), onError: (e) => showError(errMessage(e, 'Takeover failed')) }),
    hangup: useMutation({ mutationFn: (recordId: string) => pairedPhoneApi.hangup(recordId), onSuccess: after('Hang-up requested'), onError: (e) => showError(errMessage(e, 'Hang-up failed')) }),
  };
}

export function useVoiceSettings() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: pairedKeys.voice, queryFn: () => pairedPhoneApi.voiceSettings(), retry: false });
  const toggle = useMutation({
    mutationFn: (paused: boolean) => pairedPhoneApi.setVoicePaused(paused, paused ? 'Paused from the CRM' : ''),
    onSuccess: (data) => {
      qc.setQueryData(pairedKeys.voice, data);
      showSuccess(data.voicePaused ? 'AI voice calling paused' : 'AI voice calling resumed');
    },
    onError: () => showError('Only administrators can change this'),
  });
  return { query, toggle };
}
