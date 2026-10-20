// The single SMS-agent loop of this app process. Started by the Headless JS task
// that the native foreground service runs (so it keeps going with the screen off);
// the UI only kicks it. Starting it again while it runs returns the same promise,
// so the service being restarted can never create a second loop.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';

import { logger } from '@/services/logging/logger';
import { telephony } from '@/services/telephony/telephonyService';
import type { TelephonyCapabilities } from '@/services/telephony/types';

import { simSmsApi } from '../api/simSmsApi';
import { runCycle, type CycleResult } from './runner';

const DEVICE_KEY = 'updata.smsAgent.deviceId.v1';
const ACTIVE_RECHECK_MS = 2 * 60_000;

export type LoopStatus = {
  running: boolean;
  lastCycleAt: number | null;
  lastResult: CycleResult | null;
  canSend: boolean;
};

type Listener = (status: LoopStatus) => void;

/** The phone can transmit right now: SMS allowed, radio on, SIM ready. */
export function canSendNow(caps: TelephonyCapabilities): boolean {
  return caps.directSmsSupported && !caps.airplaneMode && caps.simState === 'ready';
}

let deviceIdPromise: Promise<string> | null = null;
/** Stable per-install id the server binds message leases to. Not sensitive. */
export function getDeviceId(): Promise<string> {
  deviceIdPromise ??= (async () => {
    const existing = await AsyncStorage.getItem(DEVICE_KEY).catch(() => null);
    if (existing) return existing;
    const id = `android-${randomUUID()}`;
    await AsyncStorage.setItem(DEVICE_KEY, id).catch(() => undefined);
    return id;
  })();
  return deviceIdPromise;
}

class AgentLoop {
  private current: Promise<void> | null = null;
  private stopRequested = false;
  private wake: (() => void) | null = null;
  private listeners = new Set<Listener>();
  private status: LoopStatus = { running: false, lastCycleAt: null, lastResult: null, canSend: false };
  private activeCheckedAt = 0;
  private active = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  getStatus(): LoopStatus {
    return this.status;
  }

  private publish(patch: Partial<LoopStatus>) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((l) => l(this.status));
  }

  /** Wake the loop now (new reply, send result, campaign started, app foregrounded). */
  kick() {
    this.activeCheckedAt = 0;
    this.wake?.();
  }

  stop() {
    this.stopRequested = true;
    this.wake?.();
  }

  /**
   * Is there anything to do: a running campaign, or results/replies not yet uploaded?
   * While messages are flowing the "running campaigns" answer is cached; after an
   * idle cycle it is re-checked so the loop (and its foreground service) ends promptly.
   */
  private async hasWork(lastCycleSent: boolean): Promise<boolean> {
    const [journal, inbound] = await Promise.all([telephony.getSmsJournal(), telephony.getInboundSms()]);
    if (journal.length || inbound.length) return true;
    if (!lastCycleSent || Date.now() - this.activeCheckedAt > ACTIVE_RECHECK_MS) {
      this.active = (await simSmsApi.campaigns('running').catch(() => [{}])).length > 0; // unknown → keep going
      this.activeCheckedAt = Date.now();
    }
    return this.active;
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.wake = null;
        resolve();
      }, ms);
      this.wake = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
    });
  }

  /** Runs until stopped or idle. Concurrent callers share one run. */
  run(): Promise<void> {
    if (this.current) return this.current;
    this.stopRequested = false;
    this.current = (async () => {
      this.publish({ running: true });
      const deviceId = await getDeviceId();
      try {
        while (!this.stopRequested) {
          const caps = await telephony.getCapabilities();
          const result = await runCycle({
            api: simSmsApi,
            native: telephony,
            deviceId,
            // Offline (airplane mode / no SIM): lease nothing, so no attempt is wasted.
            canSend: canSendNow(caps),
            log: (event, context) => logger.info(event, context),
          });
          this.publish({ lastCycleAt: Date.now(), lastResult: result, canSend: canSendNow(caps) });
          if (this.stopRequested || !(await this.hasWork(result.sent !== null).catch(() => true))) break;
          await this.sleep(result.nextDelayMs);
        }
      } finally {
        this.current = null;
        this.publish({ running: false });
      }
    })();
    return this.current;
  }
}

export const smsAgentLoop = new AgentLoop();
