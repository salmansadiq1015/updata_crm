import {
  newOperation,
  recoverOnLaunch,
  type LocalOperation,
} from '@/features/communication/domain/operations';
import type { CompletePayload } from '@/features/communication/types';

import {
  advance,
  attachOperation,
  createQueue,
  currentItem,
  endQueue,
  isFinished,
  markCallRequested,
  markIneligible,
  nextStep,
  progress,
  reconcile,
  setPaused,
  skipItem,
  summarize,
  type CallQueue,
} from '../domain/queue';

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const C = 'c'.repeat(24);
const LEADS = [
  { id: A, name: 'Acme AG' },
  { id: B, name: 'Beta GmbH' },
  { id: C, name: 'Gamma SA' },
];

function queue(): CallQueue {
  return createQueue({ id: 'q1', userId: 'u1', leads: LEADS, now: 1_000 });
}

function op(id: string, leadId: string, change: Partial<LocalOperation> = {}): LocalOperation {
  return {
    ...newOperation({
      operationId: id,
      userId: 'u1',
      leadId,
      leadName: 'x',
      channel: 'phone',
      destinationField: 'phone',
      sim: null,
      now: 2_000,
    }),
    serverConfirmed: true,
    phase: 'in_progress',
    ...change,
  };
}

function payload(
  disposition: CompletePayload['outcome']['disposition'],
  extra: Partial<CompletePayload['outcome']> = {},
  answers = 0,
): CompletePayload {
  return {
    outcome: { disposition, connected: 'yes', notes: 'n', ...extra },
    ...(answers > 0
      ? {
          qualification: {
            answers: Array.from({ length: answers }, (_, i) => ({
              fieldKey: `f${i}`,
              label: 'L',
              value: 'v',
              status: 'answered' as const,
              source: 'user' as const,
              evidence: null,
              confidence: null,
            })),
          },
        }
      : {}),
  };
}

describe('createQueue', () => {
  it('keeps the given order, drops duplicates, and makes the first lead current', () => {
    const q = createQueue({
      id: 'q',
      userId: 'u1',
      leads: [...LEADS, { id: A, name: 'Acme again' }],
      now: 1,
    });
    expect(q.leadIds).toEqual([A, B, C]);
    expect(q.items.map((item) => item.state)).toEqual(['current', 'pending', 'pending']);
    expect(nextStep(q, {})).toEqual({ kind: 'call', item: q.items[0] });
  });

  it('an empty selection is an empty queue', () => {
    expect(nextStep(createQueue({ id: 'q', userId: 'u', leads: [], now: 1 }), {})).toEqual({
      kind: 'empty',
    });
  });
});

describe('next / skip / progress', () => {
  it('skipping moves the pointer to the next pending lead', () => {
    const q = skipItem(queue(), A);
    expect(q.items[0]).toMatchObject({ state: 'skipped', skipReason: 'user' });
    expect(currentItem(q)?.leadId).toBe(B);
    expect(progress(q)).toMatchObject({ total: 3, skipped: 1, finished: 1, remaining: 2, position: 2 });
  });

  it('an ineligible lead is skipped with the CRM reasons', () => {
    const q = markIneligible(queue(), A, ['PHONE_SUPPRESSED']);
    expect(q.items[0]).toMatchObject({ state: 'skipped', skipReason: 'PHONE_SUPPRESSED' });
    expect(currentItem(q)?.leadId).toBe(B);
  });

  it('cannot skip a lead that is already done', () => {
    const done = reconcile(attachOperation(queue(), A, 'op1'), {
      op1: op('op1', A, { phase: 'done', completePayload: payload('interested') }),
    });
    expect(skipItem(done, A)).toBe(done);
  });

  it('pause stops the "call" step; resume brings it back', () => {
    const paused = setPaused(queue(), true);
    expect(nextStep(paused, {}).kind).toBe('paused');
    expect(nextStep(setPaused(paused, false), {}).kind).toBe('call');
  });

  it('finishes when every lead is done, skipped or failed, or when ended', () => {
    let q = queue();
    q = skipItem(q, A);
    q = skipItem(q, B);
    expect(isFinished(q)).toBe(false);
    q = skipItem(q, C);
    expect(isFinished(q)).toBe(true);
    expect(nextStep(q, {})).toEqual({ kind: 'finished' });
    expect(isFinished(endQueue(queue(), 5))).toBe(true);
  });

  it('advance never moves past an existing current lead', () => {
    const q = queue();
    expect(advance(q)).toBe(q);
  });
});

describe('reconcile with the outbox', () => {
  it('marks the lead done from a submitted outcome and moves to the next lead', () => {
    let q = attachOperation(queue(), A, 'op1');
    const ops = {
      op1: op('op1', A, {
        phase: 'submitting',
        completePayload: payload('callback_requested', { followUpAt: '2026-10-20T09:00:00Z' }, 2),
      }),
    };
    q = reconcile(q, ops);
    expect(q.items[0]).toMatchObject({
      state: 'done',
      disposition: 'callback_requested',
      followUpAt: '2026-10-20T09:00:00Z',
      answersCount: 2,
    });
    expect(currentItem(q)?.leadId).toBe(B);
    // The next lead is only "ready to call": the user still taps Call and Start call.
    expect(nextStep(q, ops)).toMatchObject({ kind: 'call', item: { leadId: B } });
  });

  it('keeps the lead current while its call is open', () => {
    const q = attachOperation(queue(), A, 'op1');
    const ops = { op1: op('op1', A, { phase: 'in_progress' }) };
    const next = reconcile(q, ops);
    expect(next.items[0]!.state).toBe('current');
    expect(nextStep(next, ops)).toEqual({ kind: 'record_outcome', item: next.items[0], operationId: 'op1' });
  });

  it('a call that could not be placed marks the lead failed', () => {
    const q = reconcile(attachOperation(queue(), A, 'op1'), {
      op1: op('op1', A, { phase: 'dispatch_failed' }),
    });
    expect(q.items[0]!.state).toBe('failed');
    expect(currentItem(q)?.leadId).toBe(B);
  });

  it('links a call started from the queue even if its id was never attached', () => {
    const q = markCallRequested(queue(), A, 1_500);
    const ops = {
      older: op('older', A, { createdAt: 1_000, phase: 'done', completePayload: payload('busy') }),
      op1: op('op1', A, { createdAt: 2_000, phase: 'in_progress' }),
    };
    const next = reconcile(q, ops);
    expect(next.items[0]).toMatchObject({ state: 'current', operationId: 'op1' });
  });

  it('a removed operation (nothing placed) lets the lead be called again', () => {
    const q = reconcile(attachOperation(queue(), A, 'gone'), {});
    expect(q.items[0]).toMatchObject({ state: 'current', operationId: null });
    expect(nextStep(q, {}).kind).toBe('call');
  });
});

describe('resume after restart', () => {
  it.each(['in_progress', 'dispatching'] as const)(
    'an open call (%s) stays current with "record outcome" as the step — never "call"',
    (phase) => {
      const q = attachOperation(markCallRequested(queue(), A, 1_500), A, 'op1');
      // What the outbox does at launch: dispatching becomes dispatch_unknown.
      const recovered = recoverOnLaunch(op('op1', A, { phase }));
      const ops = { op1: recovered };
      const resumed = reconcile(JSON.parse(JSON.stringify(q)) as CallQueue, ops);
      expect(resumed.items[0]!.state).toBe('current');
      expect(currentItem(resumed)?.leadId).toBe(A);
      const step = nextStep(resumed, ops);
      expect(step.kind).toBe('record_outcome');
      expect(step.kind).not.toBe('call');
    },
  );

  it('an open call wins over pause: the outcome is still asked for', () => {
    const q = setPaused(attachOperation(queue(), A, 'op1'), true);
    const ops = { op1: op('op1', A, { phase: 'dispatch_unknown' }) };
    expect(nextStep(q, ops).kind).toBe('record_outcome');
  });
});

describe('summarize', () => {
  it('counts outcomes, callbacks, answers and the leads not called', () => {
    let q = attachOperation(queue(), A, 'op1');
    const ops: Record<string, LocalOperation> = {
      op1: op('op1', A, { phase: 'done', completePayload: payload('interested', {}, 3) }),
    };
    q = reconcile(q, ops);
    q = attachOperation(q, B, 'op2');
    ops.op2 = op('op2', B, {
      phase: 'needs_attention',
      completePayload: payload('callback_requested'),
    });
    q = reconcile(q, ops);
    q = endQueue(q, 9);
    const summary = summarize(q);
    expect(summary).toMatchObject({
      total: 3,
      called: 2,
      skipped: 0,
      notCalled: 1,
      callbacks: 1,
      answers: 3,
    });
    expect(summary.byDisposition).toEqual(
      expect.arrayContaining([
        { disposition: 'interested', count: 1 },
        { disposition: 'callback_requested', count: 1 },
      ]),
    );
  });
});
