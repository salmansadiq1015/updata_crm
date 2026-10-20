// One cycle of the SIM SMS agent transport on this phone. Pure orchestration over
// injected dependencies (API + native module), so every safety rule is unit-tested:
//
// 1. Reconcile the native journal first: report each finished send (sent / failed /
//    unknown) and delivery; an attempt that never got a SENT callback becomes
//    `unknown` (it may have reached the lead — the server never auto-resends it).
// 2. Upload replies the native receiver kept (watched numbers only), then ack them.
// 3. Refresh the watch list.
// 4. Lease at most one message. Send it ONLY after the server confirmed
//    `attempting` (lease still ours). The native layer journals before SmsManager
//    and refuses a message id it already attempted, so a message is transmitted at
//    most once even across crashes, retries and duplicate cycles.
import type { InboundSms, SendSmsRequest, SmsJournalEntry } from '@/services/telephony/types';

import type { LeaseResult } from '../types';

export const RESULT_TIMEOUT_MS = 10 * 60_000; // no SENT callback within this → unknown
export const DELIVERY_WAIT_MS = 24 * 3600_000; // keep the journal entry for a late delivery report
export const MIN_DELAY_MS = 5_000;
export const MAX_DELAY_MS = 15 * 60_000;
export const ERROR_DELAY_MS = 30_000;

export type RunnerApi = {
  lease(deviceId: string): Promise<LeaseResult>;
  attempting(messageId: string, deviceId: string): Promise<{ proceed: boolean }>;
  result(
    messageId: string,
    body: {
      deviceId: string;
      status: 'sent' | 'failed' | 'unknown';
      errorCode?: string | null;
      at?: string | null;
    },
  ): Promise<void>;
  delivery(messageId: string, body: { deviceId: string; at?: string | null }): Promise<void>;
  watchList(): Promise<string[]>;
  inbound(body: {
    deviceId: string;
    deviceMessageKey: string;
    from: string;
    matchedTo: string | null;
    body: string;
    receivedAt: string;
  }): Promise<unknown>;
};

export type RunnerNative = {
  sendSms(request: SendSmsRequest): Promise<{ parts: number }>;
  getSmsJournal(): Promise<SmsJournalEntry[]>;
  ackSmsJournal(ids: string[]): Promise<void>;
  getInboundSms(): Promise<InboundSms[]>;
  ackInboundSms(keys: string[]): Promise<void>;
  setWatchedNumbers(numbers: string[]): Promise<void>;
};

export type RunnerDeps = {
  api: RunnerApi;
  native: RunnerNative;
  deviceId: string;
  /** False when SEND_SMS is not granted: replies are still uploaded, nothing is sent. */
  canSend: boolean;
  now?: () => number;
  log?: (event: string, context?: Record<string, unknown>) => void;
};

export type CycleResult = {
  nextDelayMs: number;
  reported: number;
  uploaded: number;
  sent: string | null;
  error: string | null;
};

type HttpLike = { status?: number | null; kind?: string };
/** 4xx (except 408/429) = the server rejected this item for good: stop re-reporting it. */
const isFinalRejection = (error: unknown) => {
  const status = (error as HttpLike)?.status ?? null;
  return status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429;
};
const iso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null);
const clamp = (ms: number) => Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, Math.round(ms)));

async function reconcileJournal(deps: RunnerDeps, now: number): Promise<number> {
  const { api, native, deviceId } = deps;
  const ack: string[] = [];
  let reported = 0;
  for (const entry of await native.getSmsJournal()) {
    let status: 'sent' | 'failed' | 'unknown' | null = null;
    let errorCode = entry.errorCode;
    if (entry.status === 'attempting') {
      if (now - entry.startedAt < RESULT_TIMEOUT_MS) continue; // still waiting for the modem
      status = 'unknown';
      errorCode = 'NO_SENT_CALLBACK';
    } else {
      status = entry.status;
    }
    try {
      await api.result(entry.messageId, { deviceId, status, errorCode, at: iso(entry.finishedAt) });
      reported += 1;
    } catch (error) {
      if (!isFinalRejection(error)) throw error; // network: keep it, retry next cycle
    }
    if (entry.deliveredAt) {
      await api
        .delivery(entry.messageId, { deviceId, at: iso(entry.deliveredAt) })
        .catch((error: unknown) => {
          if (!isFinalRejection(error)) throw error;
        });
      ack.push(entry.messageId);
    } else if (status !== 'sent' || now - (entry.finishedAt ?? entry.startedAt) > DELIVERY_WAIT_MS) {
      ack.push(entry.messageId); // no delivery report will (or still) come
    }
  }
  await native.ackSmsJournal(ack);
  return reported;
}

async function uploadInbound(deps: RunnerDeps): Promise<number> {
  const { api, native, deviceId } = deps;
  const done: string[] = [];
  for (const sms of await native.getInboundSms()) {
    try {
      await api.inbound({
        deviceId,
        deviceMessageKey: sms.key,
        from: sms.from,
        matchedTo: sms.matchedTo || null,
        body: sms.body,
        receivedAt: new Date(sms.receivedAt).toISOString(),
      });
      done.push(sms.key);
    } catch (error) {
      if (isFinalRejection(error)) {
        done.push(sms.key);
        continue;
      }
      await native.ackInboundSms(done);
      throw error;
    }
  }
  await native.ackInboundSms(done);
  return done.length;
}

async function sendOne(deps: RunnerDeps, lease: LeaseResult): Promise<string | null> {
  const { api, native, deviceId, log } = deps;
  const message = lease.message;
  if (!message) return null;
  // Point of no return on the server: from here the message is never re-leased.
  let attempt: { proceed: boolean };
  try {
    attempt = await api.attempting(message.id, deviceId);
  } catch (error) {
    if (isFinalRejection(error)) {
      log?.('sms_agent.lease_lost', { messageId: message.id });
      return null;
    }
    throw error;
  }
  if (!attempt.proceed) return null;
  try {
    await native.sendSms({
      messageId: message.id,
      to: message.to,
      body: message.body,
      subscriptionId: message.subscriptionId ?? null,
    });
    return message.id;
  } catch (error) {
    const code = (error as { code?: string })?.code ?? 'SEND_ERROR';
    if (code === 'ALREADY_ATTEMPTED') return null; // the journal owns this message's outcome
    // Rejected before the modem got anything (permission, invalid number, no telephony,
    // or SmsManager threw synchronously — the native journal recorded it as failed).
    await api.result(message.id, { deviceId, status: 'failed', errorCode: code }).catch(() => undefined);
    log?.('sms_agent.send_rejected', { messageId: message.id, code });
    return null;
  }
}

/** Run one cycle; never throws — failures come back as `error` + a backoff delay. */
export async function runCycle(deps: RunnerDeps): Promise<CycleResult> {
  const now = deps.now?.() ?? Date.now();
  // Without SEND_SMS nothing is leased, but replies are still collected every minute.
  const result: CycleResult = {
    nextDelayMs: deps.canSend ? MAX_DELAY_MS : 60_000,
    reported: 0,
    uploaded: 0,
    sent: null,
    error: null,
  };
  try {
    result.reported = await reconcileJournal(deps, now);
    result.uploaded = await uploadInbound(deps);
    const numbers = await deps.api.watchList();
    await deps.native.setWatchedNumbers(numbers);
    if (deps.canSend) {
      const lease = await deps.api.lease(deps.deviceId);
      if (lease.message) {
        // Watch the destination before sending so a fast reply is never missed.
        await deps.native.setWatchedNumbers([...new Set([...numbers, lease.message.to])]);
      }
      result.sent = await sendOne(deps, lease);
      result.nextDelayMs = clamp(lease.retryAfterMs);
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    result.nextDelayMs = ERROR_DELAY_MS;
    deps.log?.('sms_agent.cycle_failed', { error: result.error });
  }
  return result;
}
