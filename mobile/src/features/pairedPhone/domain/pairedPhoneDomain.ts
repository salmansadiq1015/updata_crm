import type { Readiness } from '@/features/aiAgent/domain/agentDomain';

import type { ActiveCall, PairedDevice } from '../types';

export type CheckKey = 'gateway' | 'board' | 'key' | 'phone' | 'audio';
export type DeviceHeadline = 'offline' | 'attention' | 'inCall' | 'ready' | 'notReady';

/** Setup checks, only from what the gateway actually reported. */
export function deviceChecks(d: PairedDevice): { key: CheckKey; ok: boolean }[] {
  return [
    { key: 'gateway', ok: d.online },
    { key: 'board', ok: d.online && d.board.connected },
    { key: 'key', ok: d.keyState === 'provisioned' && d.board.keyProvisioned },
    { key: 'phone', ok: d.online && d.board.connected && d.state.hfp === 'slc' },
    { key: 'audio', ok: d.audioVerified },
  ];
}

export function deviceHeadline(d: PairedDevice): DeviceHeadline {
  if (!d.online) return 'offline';
  if (d.attention) return 'attention';
  if (d.currentCallId) return 'inCall';
  return d.readiness.ok ? 'ready' : 'notReady';
}

export type CallAudioView = 'waiting' | 'dialing' | 'live' | 'lost' | 'takenOver';

export function callAudioView(call: ActiveCall): CallAudioView {
  const g = call.gateway;
  if (!g) return 'waiting';
  if (g.takenOver) return 'takenOver';
  if (g.audioLost) return 'lost';
  if (g.audioOpen) return 'live';
  if (g.state === 'claimed' || g.state === 'dialing') return 'dialing';
  return 'waiting';
}

/** Audio levels older than this are not shown as live. */
export const STATS_STALE_SECONDS = 6;
export const statsFresh = (call: ActiveCall) =>
  call.gateway?.audioAgeSeconds != null && call.gateway.audioAgeSeconds <= STATS_STALE_SECONDS;

export const canTakeOver = (call: ActiveCall) =>
  Boolean(call.gateway?.audioOpen && !call.gateway.takenOver && !call.gateway.command);
export const canHangUp = (call: ActiveCall) => call.gateway?.command !== 'hangup';

type DevicesQuery = { data?: PairedDevice[]; isPending: boolean; isError: boolean };

/**
 * Can a paired-phone campaign be started? Same rule as the server: the device exists, is not
 * revoked, and its two-way call audio was verified. Offline / cooldown / Bluetooth are not
 * blockers here: the campaign simply waits for the phone.
 */
export function pairedCampaignReadiness(query: DevicesQuery, deviceId: string | null | undefined): Readiness {
  if (query.isError) return { state: 'unknown', forbidden: false };
  if (query.isPending || !query.data) return { state: 'checking' };
  const device = query.data.find((d) => d.id === deviceId && !d.revoked);
  if (!device) return { state: 'not_ready', reason: 'paired_device_missing' };
  if (!device.audioVerified) return { state: 'not_ready', reason: 'audio_not_verified' };
  return { state: 'ready' };
}
