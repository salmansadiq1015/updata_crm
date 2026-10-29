// Device heartbeat for the CRM's SMS device dashboard (POST /sim-sms/devices/heartbeat).
// Pure: everything the phone reports is assembled here from injected inputs so the
// privacy rules (never a full phone number) and the counting rules are unit-tested.
import { isQueueSmsId } from '@/services/telephony/smsIds';
import type { SimInfo, SmsJournalEntry, TelephonyCapabilities } from '@/services/telephony/types';

import type { CycleResult } from './runner';

export type HeartbeatTrigger = 'loop' | 'foreground' | 'headless' | 'manual' | 'interval';
export type BuildProfile = 'play' | 'shared' | 'private' | 'development';

/** What the agent did lately on this phone (updated from every loop cycle). */
export type DeviceActivity = {
  sendAt: number | null;
  inboundAt: number | null;
  leaseAt: number | null;
  resultPostAt: number | null;
  lastSubscriptionId: number | null;
  lastError: { code: string; message: string; at: number } | null;
};

export const EMPTY_ACTIVITY: DeviceActivity = {
  sendAt: null,
  inboundAt: null,
  leaseAt: null,
  resultPostAt: null,
  lastSubscriptionId: null,
  lastError: null,
};

/** Fold one finished agent cycle into the activity record. */
export function applyCycle(
  activity: DeviceActivity,
  cycle: CycleResult,
  at: number,
  canSend: boolean,
): DeviceActivity {
  const next = { ...activity };
  if (cycle.error) {
    next.lastError = { code: 'CYCLE_FAILED', message: cycle.error.slice(0, 300), at };
    return next;
  }
  if (canSend) next.leaseAt = at;
  if (cycle.sent) next.sendAt = at;
  if (cycle.reported > 0) next.resultPostAt = at;
  if (cycle.uploaded > 0) next.inboundAt = at;
  return next;
}

/** '•••• 1234' — the only form of a SIM number that ever leaves the phone. */
export function maskSimNumber(number: string | null | undefined): string | null {
  const digits = String(number ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : '••••';
}

export type HeartbeatInputs = {
  deviceId: string;
  platform: { manufacturer: string | null; model: string | null; osVersion: string | null; sdkInt: number | null };
  appVersion: string | null;
  buildNumber: string | null;
  buildProfile: BuildProfile;
  caps: TelephonyCapabilities;
  batteryOptimizationIgnored: boolean | null;
  sims: SimInfo[];
  network: { type: string | null; isConnected: boolean | null; isInternetReachable: boolean | null } | null;
  journal: SmsJournalEntry[];
  inboundPending: number;
  activity: DeviceActivity;
  agent: { running: boolean; lastCycleAt: number | null };
  resyncCompleted: boolean;
  trigger: HeartbeatTrigger;
};

export type HeartbeatPayload = ReturnType<typeof buildHeartbeatPayload>;

const iso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null);
const MAX_JOURNAL = 100;

export function buildHeartbeatPayload(input: HeartbeatInputs) {
  const { caps } = input;
  // SMS-queue sends (one-way texts typed by the user) are not agent work.
  const journal = input.journal.filter((entry) => !isQueueSmsId(entry.messageId));
  const count = (status: SmsJournalEntry['status']) => journal.filter((e) => e.status === status).length;
  const selected = input.activity.lastSubscriptionId;
  const hasPreference = selected != null && input.sims.some((s) => s.subscriptionId === selected);
  return {
    deviceId: input.deviceId,
    platform: 'android' as const,
    manufacturer: input.platform.manufacturer,
    model: input.platform.model,
    osVersion: input.platform.osVersion,
    sdkInt: input.platform.sdkInt ?? (caps.sdkInt || null),
    appVersion: input.appVersion,
    buildNumber: input.buildNumber,
    buildProfile: input.buildProfile,
    permissions: {
      smsDeclared: caps.smsPermissionsDeclared,
      sendSms: caps.sendSmsGranted,
      receiveSms: caps.receiveSmsGranted,
      readPhoneState: caps.readPhoneStateGranted,
      postNotifications: caps.notificationsGranted,
      batteryOptimizationIgnored: input.batteryOptimizationIgnored,
    },
    simState: caps.simState,
    sims: input.sims.slice(0, 4).map((sim) => ({
      subscriptionId: sim.subscriptionId,
      slotIndex: sim.slotIndex,
      carrierName: sim.carrierName,
      displayName: sim.displayName,
      countryIso: sim.countryIso,
      isDefaultSms: sim.isDefaultSms,
      // The SIM the agent sends from: the campaign's SIM when one was leased, else the system SMS SIM.
      selected: hasPreference ? sim.subscriptionId === selected : sim.isDefaultSms,
      numberMasked: maskSimNumber(sim.number),
    })),
    selectedSubscriptionId: hasPreference ? selected : (input.sims.find((s) => s.isDefaultSms)?.subscriptionId ?? null),
    network: {
      type: input.network?.type ?? null,
      connected: input.network?.isConnected ?? null,
      internetReachable: input.network?.isInternetReachable ?? null,
      airplaneMode: caps.airplaneMode,
    },
    queue: {
      // One message is leased at a time and attempted immediately; nothing waits leased.
      pending: 0,
      attempting: count('attempting'),
      unknown: count('unknown'),
      failed: count('failed'),
      inboundPending: input.inboundPending,
    },
    last: {
      sendAt: iso(input.activity.sendAt),
      inboundAt: iso(input.activity.inboundAt),
      leaseAt: iso(input.activity.leaseAt),
      resultPostAt: iso(input.activity.resultPostAt),
    },
    lastError: input.activity.lastError
      ? {
          code: input.activity.lastError.code,
          message: input.activity.lastError.message,
          at: iso(input.activity.lastError.at),
        }
      : null,
    agent: { running: input.agent.running, lastCycleAt: iso(input.agent.lastCycleAt) },
    journal: journal.slice(0, MAX_JOURNAL).map((entry) => ({
      messageId: entry.messageId,
      status: entry.status,
      finishedAt: iso(entry.finishedAt),
    })),
    resyncCompleted: input.resyncCompleted,
    trigger: input.trigger,
  };
}

export const HEARTBEAT_CADENCE_MS = 5 * 60_000;
export const HEARTBEAT_MIN_GAP_MS = 60_000;

/**
 * Throttle: loop cycles report at the server's cadence (~5 min); foreground/headless
 * starts at most once a minute; `force` (a completed resync) always goes out.
 */
export function shouldSendHeartbeat(
  trigger: HeartbeatTrigger,
  lastSentAt: number | null,
  now: number,
  { force = false, cadenceMs = HEARTBEAT_CADENCE_MS }: { force?: boolean; cadenceMs?: number } = {},
): boolean {
  if (force || lastSentAt == null) return true;
  const gap = trigger === 'loop' || trigger === 'interval' ? Math.max(HEARTBEAT_MIN_GAP_MS, cadenceMs) : HEARTBEAT_MIN_GAP_MS;
  return now - lastSentAt >= gap;
}
