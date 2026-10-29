// Sends the device heartbeat to the CRM (SMS device dashboard). No timer of its own:
// it rides on the agent loop's cycles, the app coming to the foreground and the
// headless task start, throttled to the server's cadence (~5 min).
//
// Resync: when the CRM asks for it, the phone re-uploads what it holds (send results
// in the native journal, kept replies) through the normal runner path with sending
// DISABLED (`canSend: false`) — a resync never transmits an SMS.
import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getEnv } from '@/config/env';
import { logger } from '@/services/logging/logger';
import { telephony } from '@/services/telephony/telephonyService';

import { simSmsApi } from '../api/simSmsApi';
import { getDeviceId, smsAgentLoop, type LoopStatus } from '../domain/agentLoop';
import {
  applyCycle,
  buildHeartbeatPayload,
  EMPTY_ACTIVITY,
  HEARTBEAT_CADENCE_MS,
  shouldSendHeartbeat,
  type BuildProfile,
  type DeviceActivity,
  type HeartbeatInputs,
  type HeartbeatPayload,
  type HeartbeatTrigger,
} from '../domain/heartbeat';
import { runCycle } from '../domain/runner';
import type { HeartbeatResponse } from '../types';

export type HeartbeatDeps = {
  collect: () => Promise<Omit<HeartbeatInputs, 'activity' | 'resyncCompleted' | 'trigger' | 'agent'>>;
  post: (payload: HeartbeatPayload) => Promise<HeartbeatResponse | null>;
  /** Re-upload journal results + kept replies without sending anything. */
  uploadOnly: (deviceId: string) => Promise<void>;
  loopStatus: () => LoopStatus;
  kickLoop: () => void;
  now: () => number;
};

type Listener = (response: HeartbeatResponse | null) => void;

export function createHeartbeatSender(deps: HeartbeatDeps) {
  let lastSentAt: number | null = null;
  let cadenceMs = HEARTBEAT_CADENCE_MS;
  let unsupported = false;
  let inFlight: Promise<HeartbeatResponse | null> | null = null;
  let activity: DeviceActivity = EMPTY_ACTIVITY;
  let lastCycleAt: number | null = null;
  // Resync requested while the loop was running: the loop's next cycle does the upload.
  let resyncViaLoop = false;
  let latest: HeartbeatResponse | null = null;
  const listeners = new Set<Listener>();

  const publish = (response: HeartbeatResponse | null) => {
    latest = response;
    listeners.forEach((l) => l(response));
  };

  async function send(trigger: HeartbeatTrigger, { force = false, resyncCompleted = false } = {}) {
    if (unsupported) return null;
    if (!shouldSendHeartbeat(trigger, lastSentAt, deps.now(), { force, cadenceMs })) return null;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const status = deps.loopStatus();
        const base = await deps.collect();
        const payload = buildHeartbeatPayload({
          ...base,
          activity,
          agent: { running: status.running, lastCycleAt: status.lastCycleAt },
          resyncCompleted,
          trigger,
        });
        lastSentAt = deps.now();
        const response = await deps.post(payload);
        if (!response) {
          unsupported = true; // older server: stop trying for this app session
          return null;
        }
        if (response.nextHeartbeatMs && response.nextHeartbeatMs > 0) cadenceMs = response.nextHeartbeatMs;
        publish(response);
        if (response.resyncRequested && !resyncCompleted) await resync(payload.deviceId);
        return response;
      } catch (error) {
        logger.warn('sms_agent.heartbeat_failed', {
          message: error instanceof Error ? error.message : String(error),
        });
        return null;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  async function resync(deviceId: string) {
    if (deps.loopStatus().running) {
      resyncViaLoop = true;
      deps.kickLoop();
      return;
    }
    await deps.uploadOnly(deviceId);
    inFlight = null;
    await send('manual', { force: true, resyncCompleted: true });
  }

  /** Feed every agent-loop status change; a finished cycle may trigger a heartbeat. */
  function onLoopStatus(status: LoopStatus) {
    if (!status.lastCycleAt || status.lastCycleAt === lastCycleAt || !status.lastResult) return;
    lastCycleAt = status.lastCycleAt;
    activity = applyCycle(activity, status.lastResult, status.lastCycleAt, status.canSend);
    if (resyncViaLoop && !status.lastResult.error) {
      resyncViaLoop = false;
      void send('loop', { force: true, resyncCompleted: true });
      return;
    }
    void send('loop');
  }

  return {
    send,
    onLoopStatus,
    getLatest: () => latest,
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Test hook. */
    __state: () => ({ lastSentAt, unsupported, activity, cadenceMs, resyncViaLoop }),
  };
}

// ------------------------------------------------------------------ app wiring
function buildProfile(): BuildProfile {
  return getEnv().distribution;
}

async function collect() {
  const deviceId = await getDeviceId();
  const constants = (Platform.constants ?? {}) as { Manufacturer?: string; Model?: string; Release?: string };
  const [caps, sims, net, journal, inbound] = await Promise.all([
    telephony.getCapabilities(),
    telephony.getActiveSims().catch(() => []),
    NetInfo.fetch().catch(() => null),
    telephony.getSmsJournal(),
    telephony.getInboundSms(),
  ]);
  const batteryOptimizationIgnored = telephony.isAvailable()
    ? await telephony.isIgnoringBatteryOptimizations()
    : null;
  return {
    deviceId,
    platform: {
      manufacturer: constants.Manufacturer ?? null,
      model: constants.Model ?? null,
      osVersion: constants.Release ?? (Platform.Version != null ? String(Platform.Version) : null),
      sdkInt: typeof Platform.Version === 'number' ? Platform.Version : null,
    },
    appVersion: Constants.expoConfig?.version ?? null,
    buildNumber:
      Constants.expoConfig?.android?.versionCode != null ? String(Constants.expoConfig.android.versionCode) : null,
    buildProfile: buildProfile(),
    caps,
    batteryOptimizationIgnored,
    sims,
    network: net
      ? { type: net.type ?? null, isConnected: net.isConnected ?? null, isInternetReachable: net.isInternetReachable ?? null }
      : null,
    journal,
    inboundPending: inbound.length,
  };
}

export const deviceHeartbeat = createHeartbeatSender({
  collect,
  post: (payload) => simSmsApi.heartbeat(payload),
  uploadOnly: async (deviceId) => {
    await runCycle({
      api: simSmsApi,
      native: telephony,
      deviceId,
      canSend: false, // resync uploads results/replies; it never sends
      log: (event, context) => logger.info(event, context),
    });
  },
  loopStatus: () => smsAgentLoop.getStatus(),
  kickLoop: () => smsAgentLoop.kick(),
  now: () => Date.now(),
});

let installed: (() => void) | null = null;
/** Heartbeats follow the agent loop (company build only). Idempotent. */
export function installDeviceHeartbeat(): void {
  if (installed || getEnv().distribution !== 'private') return;
  installed = smsAgentLoop.subscribe((status) => deviceHeartbeat.onLoopStatus(status));
}

export function sendDeviceHeartbeat(trigger: HeartbeatTrigger): Promise<HeartbeatResponse | null> {
  if (getEnv().distribution !== 'private') return Promise.resolve(null);
  installDeviceHeartbeat();
  return deviceHeartbeat.send(trigger);
}
