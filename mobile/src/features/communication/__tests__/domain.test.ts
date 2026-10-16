import { ApiError } from '@/services/api/apiErrors';

import { observeCall, formatElapsed } from '../domain/callEvidence';
import {
  afterReceipt,
  afterSyncFailure,
  classifySyncError,
  hasUnsyncedWork,
  needsSync,
  newOperation,
  nextRetryDelay,
  recoverOnLaunch,
  withCallEvents,
  withEvent,
  type LocalOperation,
} from '../domain/operations';
import { analyzeSms } from '../domain/smsEncoding';
import { findUnresolvedTokens, leadTemplateVariables, renderTemplate } from '../domain/templates';
import { receiptStatus, type Receipt } from '../types';

const base = (): LocalOperation =>
  newOperation({
    operationId: 'op-1',
    userId: 'u1',
    leadId: 'l1',
    leadName: 'Acme',
    channel: 'phone',
    destinationField: 'phone',
    sim: null,
    now: 1_000,
  });

describe('analyzeSms', () => {
  it('uses GSM-7 for plain text and counts single-segment capacity', () => {
    const info = analyzeSms('Hello Acme, thanks for your time.');
    expect(info.encoding).toBe('GSM-7');
    expect(info.segments).toBe(1);
    expect(info.remainingInSegment).toBe(160 - info.units);
  });

  it('counts GSM-7 extension characters as two septets', () => {
    expect(analyzeSms('{}').units).toBe(4);
    expect(analyzeSms('€').encoding).toBe('GSM-7');
  });

  it('splits long GSM-7 text at 153 septets per part', () => {
    expect(analyzeSms('a'.repeat(160)).segments).toBe(1);
    expect(analyzeSms('a'.repeat(161)).segments).toBe(2);
    expect(analyzeSms('a'.repeat(306)).segments).toBe(2);
    expect(analyzeSms('a'.repeat(307)).segments).toBe(3);
  });

  it.each([
    ['Arabic', 'مرحبا بكم'],
    ['Urdu', 'آپ کا شکریہ'],
    ['emoji', 'Thanks 👍'],
    ['backtick (ASCII not in GSM-7)', 'use `code`'],
  ])('switches to UCS-2 for %s', (_label, text) => {
    expect(analyzeSms(text).encoding).toBe('UCS-2');
  });

  it('splits UCS-2 at 70 / 67 units and counts emoji as two units', () => {
    expect(analyzeSms('ا'.repeat(70)).segments).toBe(1);
    expect(analyzeSms('ا'.repeat(71)).segments).toBe(2);
    expect(analyzeSms('👍').units).toBe(2);
  });

  it('keeps only the accents GSM-7 actually has (ô and lowercase ç are not)', () => {
    expect(analyzeSms('Merci, à bientôt é è').encoding).toBe('UCS-2'); // ô is not GSM-7
    expect(analyzeSms('Merci, à très bientôt').encoding).toBe('UCS-2');
    expect(analyzeSms('Bonjour, réponse reçue à midi').encoding).toBe('UCS-2'); // ç (lowercase) is not GSM-7
    expect(analyzeSms('Ça marche, é è à ù').encoding).toBe('GSM-7');
  });

  it('reports zero segments for an empty message', () => {
    expect(analyzeSms('').segments).toBe(0);
  });
});

describe('renderTemplate', () => {
  const lead = {
    name: 'Muster Heizungen',
    type: 'business' as const,
    email: null,
    phone: '+41 44 000 00 00',
    mobile: null,
    address: { city: 'Zürich' },
    assignedTo: { name: 'Ana Agent' },
  };

  it('substitutes allowed variables from the lead', () => {
    const result = renderTemplate('Hi {{ businessName }} in {{city}}', leadTemplateVariables(lead));
    expect(result).toEqual({ text: 'Hi Muster Heizungen in Zürich', missing: [], unsupported: [], ok: true });
  });

  it('blocks a template whose variable has no value instead of sending a hole', () => {
    const result = renderTemplate('Mail us: {{email}}', leadTemplateVariables(lead));
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['email']);
    expect(result.text).toContain('{{email}}');
  });

  it('uses template fallbacks for empty values', () => {
    const result = renderTemplate('Hi {{email}}', leadTemplateVariables(lead), { email: 'there' });
    expect(result).toMatchObject({ text: 'Hi there', ok: true });
  });

  it('rejects variables outside the CRM allowlist', () => {
    const result = renderTemplate('{{password}}', leadTemplateVariables(lead));
    expect(result.unsupported).toEqual(['password']);
    expect(result.ok).toBe(false);
  });

  it('finds tokens left in edited text', () => {
    expect(findUnresolvedTokens('Hello {{firstName}} and {{ city }}')).toEqual(['firstName', 'city']);
  });
});

describe('observeCall', () => {
  it('is not observed before dispatch and waiting after', () => {
    expect(observeCall([], null).phase).toBe('not_observed');
    expect(observeCall([], 100).phase).toBe('waiting');
  });

  it('measures off-hook time, never calling it talk time', () => {
    const result = observeCall(
      [
        { state: 'idle', at: 9_000 }, // state at registration, before dispatch
        { state: 'offhook', at: 10_500 },
        { state: 'idle', at: 70_500 },
      ],
      10_000,
    );
    expect(result).toMatchObject({ phase: 'ended', offhookAt: 10_500, endedAt: 70_500, offhookMs: 60_000 });
  });

  it('flags an incoming ringing call as interference', () => {
    const result = observeCall(
      [
        { state: 'offhook', at: 11_000 },
        { state: 'ringing', at: 12_000 },
      ],
      10_000,
      20_000,
    );
    expect(result.incomingInterference).toBe(true);
    expect(result).toMatchObject({ phase: 'off_hook', offhookMs: 9_000 });
  });

  it('ignores an idle that precedes any off-hook', () => {
    expect(observeCall([{ state: 'idle', at: 11_000 }], 10_000).phase).toBe('waiting');
  });

  it('formats elapsed time', () => {
    expect(formatElapsed(65_000)).toBe('1:05');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
  });
});

describe('operations', () => {
  it('numbers events from 1 (seq 0 belongs to the server)', () => {
    const op = withEvent(
      withEvent(base(), 'dispatch_requested', 'app', 2_000),
      'dispatched',
      'native',
      2_100,
    );
    expect(op.pendingEvents.map((event) => event.seq)).toEqual([1, 2]);
    expect(op.nextSeq).toBe(3);
  });

  it('merges live and persisted native events without duplicates or foreign operations', () => {
    const live = {
      operationId: 'op-1',
      state: 'offhook' as const,
      at: 5_000,
      source: 'telephony_callback' as const,
    };
    let op = withCallEvents(base(), [live]);
    op = withCallEvents(op, [
      live,
      { ...live, state: 'idle', at: 9_000 },
      { ...live, operationId: 'other', at: 6_000 },
    ]);
    expect(op.callEvents).toEqual([
      { state: 'offhook', at: 5_000 },
      { state: 'idle', at: 9_000 },
    ]);
    expect(op.pendingEvents.map((event) => event.type)).toEqual(['call_state_offhook', 'call_state_idle']);
  });

  it('recovers a crash during dispatch as unknown, never as safe to dial again', () => {
    expect(recoverOnLaunch({ ...base(), phase: 'dispatching' }).phase).toBe('dispatch_unknown');
    expect(recoverOnLaunch({ ...base(), phase: 'preparing' }).phase).toBe('abandoned');
    expect(recoverOnLaunch({ ...base(), phase: 'submitting' }).phase).toBe('submitting');
    expect(recoverOnLaunch({ ...base(), phase: 'in_progress' }).phase).toBe('in_progress');
  });

  it('classifies errors so only transient ones are retried', () => {
    const http = (status: number) => new ApiError({ kind: 'http', status, message: 'x' });
    expect(classifySyncError(new ApiError({ kind: 'network', message: 'x' })).kind).toBe('transient');
    expect(classifySyncError(new ApiError({ kind: 'timeout', message: 'x' })).kind).toBe('transient');
    expect(classifySyncError(http(503)).kind).toBe('transient');
    expect(classifySyncError(http(429)).kind).toBe('transient');
    expect(classifySyncError(http(403)).kind).toBe('forbidden');
    expect(classifySyncError(http(404)).kind).toBe('not_found');
    expect(classifySyncError(http(409)).kind).toBe('conflict');
    expect(
      classifySyncError(
        new ApiError({ kind: 'http', status: 409, code: 'COMPLETION_IN_PROGRESS', message: 'x' }),
      ).kind,
    ).toBe('transient');
    expect(classifySyncError(http(400)).kind).toBe('invalid');
  });

  it('backs off exponentially with jitter, capped at five minutes', () => {
    expect(nextRetryDelay(1, () => 0)).toBe(1_000);
    expect(nextRetryDelay(1, () => 1)).toBe(2_000);
    expect(nextRetryDelay(4, () => 1)).toBe(16_000);
    expect(nextRetryDelay(50, () => 1)).toBe(300_000);
  });

  it('pauses on non-transient failures and surfaces them for the user', () => {
    const submitting = { ...base(), serverConfirmed: true, phase: 'submitting' as const };
    const conflicted = afterSyncFailure(
      submitting,
      { kind: 'conflict', code: 'ALREADY_COMPLETED', status: 409 },
      0,
    );
    expect(conflicted.phase).toBe('needs_attention');
    expect(conflicted.sync.paused).toBe(true);
    expect(needsSync(conflicted, Date.now())).toBe(false);

    const transient = afterSyncFailure(
      submitting,
      { kind: 'transient', code: null, status: null },
      0,
      () => 0,
    );
    expect(transient.phase).toBe('submitting');
    expect(transient.sync).toMatchObject({ attempts: 1, nextAttemptAt: 1_000, paused: false });
    expect(needsSync(transient, 500)).toBe(false);
    expect(needsSync(transient, 1_000)).toBe(true);
  });

  it('never syncs an operation the CRM has not accepted', () => {
    const op = withEvent(base(), 'dispatch_requested', 'app', 1);
    expect(needsSync(op, 0)).toBe(false);
    expect(needsSync({ ...op, serverConfirmed: true }, 0)).toBe(true);
  });

  it('treats a receipt with a failed step as partial success, not failure', () => {
    const ok = { status: 'ok' as const, error: null, at: null };
    const partial: Receipt = {
      steps: {
        outcome: ok,
        contactLog: ok,
        leadContact: ok,
        statusChange: { ...ok, status: 'failed', error: 'x' },
        qualification: ok,
        suppression: { ...ok, status: 'skipped' },
      },
      completedAt: null,
    };
    expect(receiptStatus(partial)).toBe('partial');
    expect(afterReceipt({ ...base(), phase: 'submitting' }, partial).phase).toBe('needs_attention');
    const complete: Receipt = { ...partial, steps: { ...partial.steps, statusChange: ok } };
    expect(afterReceipt({ ...base(), phase: 'submitting' }, complete).phase).toBe('done');
  });

  it('reports unsynced work for sign-out warnings', () => {
    expect(hasUnsyncedWork({ ...base(), phase: 'abandoned' })).toBe(false);
    expect(hasUnsyncedWork({ ...base(), phase: 'done' })).toBe(false);
    expect(hasUnsyncedWork({ ...base(), phase: 'submitting' })).toBe(true);
    expect(hasUnsyncedWork({ ...base(), phase: 'in_progress' })).toBe(true);
  });
});
