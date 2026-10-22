// The two contact workflows (SIM call, SMS composer) as explicit steps:
//   1. persist a local operation with a stable id
//   2. CRM authorises it (eligibility, suppression) and returns the number it holds
//   3. persist "dispatching", THEN invoke the side effect exactly once
//   4. record what was observed; the user records the outcome; sync to the CRM
// No step here retries a dial or a composer launch.
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';

import { telephony, TelephonyError } from '@/services/telephony/telephonyService';
import type { SimInfo } from '@/services/telephony/types';
import { logger } from '@/services/logging/logger';

import { communicationApi } from '../api/communicationApi';
import { newOperation, withCallEvents, withEvent, type LocalOperation } from '../domain/operations';
import type { SmsEncoding } from '../domain/smsEncoding';
import { flushOperationsWrites, getOperation, useOperationsStore } from '../store/operationsStore';
import type {
  Channel,
  CompletePayload,
  Connected,
  Disposition,
  DestinationField,
  QualificationAnswer,
  SmsSendStatus,
} from '../types';
import { flushOutbox } from './outboxSync';
import { queueSmsId } from '@/services/telephony/smsIds';
import { analyzeSms } from '../domain/smsEncoding';

export class ContactFlowError extends Error {
  constructor(
    readonly code: string,
    override readonly cause?: unknown,
  ) {
    super(code);
    this.name = 'ContactFlowError';
  }
}

type LeadRef = { id: string; name: string };

function device() {
  const constants = Platform.constants as { Model?: string; Release?: string };
  return {
    platform: 'android' as const,
    osVersion: String(constants.Release ?? Platform.Version),
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    model: constants.Model ?? null,
  };
}

function simLabel(sim: SimInfo): string {
  return sim.displayName || sim.carrierName || `SIM ${sim.slotIndex + 1}`;
}

/** Steps 1–2 shared by both channels. Returns the confirmed operation and the CRM's number. */
async function authorise(input: {
  userId: string;
  lead: LeadRef;
  channel: Channel;
  destinationField: DestinationField;
  route: 'telecom_direct' | 'dialer_handoff' | 'sms_composer' | 'sms_direct';
  mode: 'manual' | 'assisted';
  sim: SimInfo | null;
  link?: LinkRequest | null;
}): Promise<{ operationId: string; dialNumber: string; linkUrl: string | null }> {
  const store = useOperationsStore.getState();
  const operationId = randomUUID();
  const now = Date.now();
  store.put(
    newOperation({
      operationId,
      userId: input.userId,
      leadId: input.lead.id,
      leadName: input.lead.name,
      channel: input.channel,
      destinationField: input.destinationField,
      sim: input.sim
        ? {
            subscriptionId: input.sim.subscriptionId,
            slotIndex: input.sim.slotIndex,
            label: simLabel(input.sim),
          }
        : null,
      now,
    }),
  );

  let dialNumber: string | null;
  let linkUrl: string | null = null;
  try {
    const created = await communicationApi.create(input.lead.id, {
      operationId,
      channel: input.channel,
      route: input.route,
      mode: input.mode,
      destinationField: input.destinationField,
      sim: input.sim
        ? {
            subscriptionId: input.sim.subscriptionId,
            slotIndex: input.sim.slotIndex,
            carrierName: input.sim.carrierName,
            displayName: input.sim.displayName,
            isEmbedded: input.sim.isEmbedded,
            originNumber: input.sim.number,
            originNumberSource: input.sim.number ? 'sim_reported' : null,
          }
        : null,
      device: device(),
      startedAt: new Date(now).toISOString(),
      ...(input.link
        ? { linkCampaignId: input.link.campaignId, linkPurpose: input.link.purpose ?? 'initial' }
        : {}),
    });
    dialNumber = created.dialNumber;
    linkUrl = created.link?.url ?? null;
  } catch (error) {
    // Not authorised (or unreachable): nothing is dialed. The CRM decides, not the device.
    store.update(operationId, (op) => ({ ...op, phase: 'abandoned', dispatchError: 'NOT_AUTHORISED' }));
    throw new ContactFlowError('NOT_AUTHORISED', error);
  }
  if (!dialNumber) {
    store.update(operationId, (op) => ({
      ...op,
      serverConfirmed: true,
      phase: 'abandoned',
      dispatchError: 'NO_DESTINATION',
    }));
    throw new ContactFlowError('NO_DESTINATION');
  }

  store.update(operationId, (op) =>
    withEvent(
      { ...op, serverConfirmed: true, route: input.route, phase: 'dispatching' },
      'dispatch_requested',
      'app',
      Date.now(),
    ),
  );
  // The "dispatching" marker must be on disk before the side effect, so a crash between
  // here and the dial is recovered as dispatch_unknown — never as "safe to dial again".
  await flushOperationsWrites();
  return { operationId, dialNumber, linkUrl };
}

/** SMS link assistant: which link campaign the SMS belongs to (first send or reminder). */
export type LinkRequest = { campaignId: string; purpose?: 'initial' | 'reminder' };

export const LINK_PLACEHOLDER = '{link}';

/**
 * Put the personal link into the text. A text that needs a link but did not get one is
 * never sent with a raw "{link}" in it.
 */
export function withLink(body: string, linkUrl: string | null): string {
  if (!body.includes(LINK_PLACEHOLDER)) return body;
  if (!linkUrl) throw new ContactFlowError('LINK_NOT_ISSUED');
  return body.split(LINK_PLACEHOLDER).join(linkUrl);
}

function abandonOnMissingLink(operationId: string, body: string, linkUrl: string | null): string {
  try {
    return withLink(body, linkUrl);
  } catch (error) {
    useOperationsStore
      .getState()
      .update(operationId, (op) => ({ ...op, phase: 'abandoned', dispatchError: 'LINK_NOT_ISSUED' }));
    throw error;
  }
}

export async function startCall(input: {
  userId: string;
  lead: LeadRef;
  destinationField: DestinationField;
  sim: SimInfo | null;
  canPlaceDirect: boolean;
  mode: 'manual' | 'assisted';
}): Promise<string> {
  const route = input.canPlaceDirect ? 'telecom_direct' : 'dialer_handoff';
  const { operationId, dialNumber } = await authorise({ ...input, channel: 'phone', route });
  const store = useOperationsStore.getState();

  const monitoring = await telephony.startMonitoring(operationId);
  const requestedAt = Date.now();
  try {
    const result = await telephony.placeCall({
      number: dialNumber,
      subscriptionId: input.canPlaceDirect ? input.sim?.subscriptionId : undefined,
      operationId,
    });
    store.update(operationId, (op) =>
      withEvent(
        { ...op, phase: 'in_progress', dispatchedAt: requestedAt, route: result.route },
        'dispatched',
        'native',
        Date.now(),
        {
          route: result.route,
          subscriptionApplied: result.subscriptionApplied,
          monitoring,
        },
      ),
    );
  } catch (error) {
    const code = error instanceof TelephonyError ? error.code : 'CALL_FAILED';
    logger.warn('communication.dispatch_failed', { code });
    if (monitoring) await telephony.stopMonitoring();
    store.update(operationId, (op) =>
      withEvent(
        { ...op, phase: 'dispatch_failed', dispatchError: code },
        'dispatch_failed',
        'native',
        Date.now(),
        { code },
      ),
    );
  }
  void flushOutbox();
  return operationId;
}

export async function startSms(input: {
  userId: string;
  lead: LeadRef;
  destinationField: DestinationField;
  body: string;
  templateId: string | null;
  link?: LinkRequest | null;
}): Promise<string> {
  const { operationId, dialNumber, linkUrl } = await authorise({
    ...input,
    channel: 'sms',
    route: 'sms_composer',
    mode: 'manual',
    sim: null,
  });
  const store = useOperationsStore.getState();
  const body = abandonOnMissingLink(operationId, input.body, linkUrl);
  store.update(operationId, (op) => ({ ...op, smsBody: body, smsTemplateId: input.templateId }));
  const launched = await telephony.openSmsComposer(dialNumber, body);
  store.update(operationId, (op) =>
    launched
      ? withEvent(
          { ...op, phase: 'in_progress', dispatchedAt: Date.now() },
          'composer_opened',
          'native',
          Date.now(),
        )
      : withEvent(
          { ...op, phase: 'dispatch_failed', dispatchError: 'NO_ACTIVITY' },
          'dispatch_failed',
          'native',
          Date.now(),
          {
            code: 'NO_ACTIVITY',
          },
        ),
  );
  void flushOutbox();
  return operationId;
}

/** How long to wait for Android's SENT result before recording the send as unknown. */
const DIRECT_SMS_RESULT_TIMEOUT_MS = 60_000;

/**
 * Send one SMS from this phone's SIM without the composer (client "shared" / company builds).
 * The CRM authorises it first (eligibility, suppression, number), the "dispatching" marker is
 * on disk before the radio call, and the outcome is the phone's own SENT result: transmission by
 * the SIM, never delivery. A send whose result never arrives is recorded as unknown, not resent.
 */
export async function startDirectSms(input: {
  userId: string;
  lead: LeadRef;
  destinationField: DestinationField;
  body: string;
  templateId: string | null;
  sim: SimInfo | null;
  link?: LinkRequest | null;
}): Promise<{ operationId: string; status: 'sent' | 'failed' | 'unknown'; errorCode: string | null }> {
  const { operationId, dialNumber, linkUrl } = await authorise({
    ...input,
    channel: 'sms',
    route: 'sms_direct',
    mode: 'manual',
  });
  const store = useOperationsStore.getState();
  const body = abandonOnMissingLink(operationId, input.body, linkUrl);
  store.update(operationId, (op) => ({ ...op, smsBody: body, smsTemplateId: input.templateId }));
  const messageId = queueSmsId(operationId);

  type Result = { status: 'sent' | 'failed' | 'unknown'; errorCode: string | null };
  const result = new Promise<Result>((resolve) => {
    const timer = setTimeout(() => {
      sub?.remove();
      resolve({ status: 'unknown', errorCode: null });
    }, DIRECT_SMS_RESULT_TIMEOUT_MS);
    const sub = telephony.addSmsStatusListener((event) => {
      if (event.messageId !== messageId || event.status === 'delivered') return;
      clearTimeout(timer);
      sub?.remove();
      resolve({ status: event.status, errorCode: event.errorCode ?? null });
    });
  });

  let status: Result['status'];
  let errorCode: string | null = null;
  try {
    await telephony.sendSms({
      messageId,
      to: dialNumber,
      body,
      subscriptionId: input.sim?.subscriptionId ?? null,
    });
    store.update(operationId, (op) =>
      withEvent(
        { ...op, phase: 'in_progress', dispatchedAt: Date.now() },
        'dispatched',
        'native',
        Date.now(),
      ),
    );
    ({ status, errorCode } = await result);
  } catch (error) {
    // SmsManager refused before anything left the phone (permission, no SIM): nothing was sent.
    status = 'failed';
    errorCode = error instanceof Error ? error.message.slice(0, 60) : 'SEND_FAILED';
    store.update(operationId, (op) =>
      withEvent({ ...op, phase: 'in_progress' }, 'dispatch_failed', 'native', Date.now(), {
        code: errorCode,
      }),
    );
  }
  const sms = analyzeSms(body);
  await submitOutcome(operationId, {
    disposition: status === 'sent' ? 'sent' : status === 'failed' ? 'not_sent' : 'unknown',
    connected: 'unknown',
    notes: '',
    followUpAt: null,
    followUpTimezone: null,
    statusChange: null,
    doNotContact: false,
    answers: [],
    sms: {
      sendStatus: status === 'sent' ? 'device_sent' : status === 'failed' ? 'device_failed' : 'unknown',
      encoding: sms.encoding,
      segments: sms.segments,
    },
  });
  // A sent SMS stays in the native journal until its delivery report arrives (or times out):
  // collectQueueDeliveries turns that report into an event for the CRM.
  if (status !== 'sent') await telephony.ackSmsJournal([messageId]);
  return { operationId, status, errorCode };
}

/** Pull native events persisted while JS was not listening (backgrounded, process death). */
export async function reconcileCallEvents(operationId: string): Promise<void> {
  const op = getOperation(operationId);
  if (!op || op.channel !== 'phone') return;
  const events = await telephony.getPersistedEvents(operationId);
  if (events.length > 0)
    useOperationsStore.getState().update(operationId, (current) => withCallEvents(current, events));
}

export function recordAppEvent(
  operationId: string,
  type: 'app_backgrounded' | 'app_foregrounded' | 'composer_returned' | 'notes_edited',
) {
  useOperationsStore
    .getState()
    .update(operationId, (op) =>
      op.phase === 'in_progress' || op.phase === 'dispatch_unknown'
        ? withEvent(op, type, 'app', Date.now())
        : op,
    );
}

export function saveDraft(operationId: string, change: Partial<LocalOperation['draft']>) {
  useOperationsStore.getState().update(operationId, (op) => ({ ...op, draft: { ...op.draft, ...change } }));
}

/** The user states the outcome after a dispatch_unknown (we never guess it). */
export function resolveUnknownDispatch(operationId: string) {
  useOperationsStore.getState().update(operationId, (op) =>
    op.phase === 'dispatch_unknown'
      ? withEvent({ ...op, phase: 'in_progress' }, 'disposition_selected', 'user', Date.now(), {
          resolvedUnknownDispatch: true,
        })
      : op,
  );
}

export async function submitOutcome(
  operationId: string,
  input: {
    disposition: Disposition;
    connected: Connected;
    notes: string;
    followUpAt: string | null;
    followUpTimezone: string | null;
    statusChange: string | null;
    doNotContact: boolean;
    answers: QualificationAnswer[];
    sms?: { sendStatus: SmsSendStatus; encoding: SmsEncoding; segments: number };
  },
): Promise<void> {
  await reconcileCallEvents(operationId);
  const op = getOperation(operationId);
  if (!op) throw new ContactFlowError('NOT_FOUND');
  if (op.completePayload) return; // already submitted: the outbox owns it now
  if (op.channel === 'phone') {
    await telephony.stopMonitoring();
  }

  const payload: CompletePayload = {
    outcome: {
      disposition: input.disposition,
      connected: input.connected,
      notes: input.notes.trim(),
      followUpAt: input.followUpAt,
      followUpTimezone: input.followUpAt ? input.followUpTimezone : null,
      statusChange: input.statusChange,
      doNotContact: input.doNotContact || input.disposition === 'do_not_contact',
    },
    ...(op.channel === 'sms' && input.sms
      ? {
          sms: {
            templateId: op.smsTemplateId,
            body: op.smsBody ?? '',
            encoding: input.sms.encoding,
            segments: input.sms.segments,
            sendStatus: input.sms.sendStatus,
          },
        }
      : {}),
    ...(input.answers.length > 0 ? { qualification: { answers: input.answers } } : {}),
  };

  useOperationsStore.getState().update(operationId, (current) => {
    let next = withEvent(current, 'disposition_selected', 'user', Date.now(), {
      disposition: input.disposition,
    });
    if (input.answers.length > 0) {
      next = withEvent(next, 'qualification_reviewed', 'user', Date.now(), { answers: input.answers.length });
    }
    next = withEvent(next, 'submitted', 'app', Date.now());
    return { ...next, completePayload: payload, phase: 'submitting' };
  });
  await flushOperationsWrites();
  if (op.channel === 'phone') await telephony.clearPersistedEvents(operationId);
  await flushOutbox();
}

/** Remove a local record that holds no unsynced work (abandoned / failed before dispatch / done). */
export function dismissOperation(operationId: string) {
  const op = getOperation(operationId);
  if (!op) return;
  const removable =
    op.pendingEvents.length === 0 &&
    (op.phase === 'abandoned' || op.phase === 'dispatch_failed' || op.phase === 'done');
  if (removable) useOperationsStore.getState().remove(operationId);
}
