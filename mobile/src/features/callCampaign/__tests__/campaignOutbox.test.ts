import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError } from '@/services/api/apiErrors';

import {
  flushCampaignOutboxWrites,
  MAX_TRIES,
  useCampaignOutbox,
  type Sender,
} from '../store/campaignOutbox';

const store = () => useCampaignOutbox.getState();
const complete = (attemptId: string) => ({
  kind: 'complete' as const,
  taskId: 't1',
  campaignId: 'c1',
  attemptId,
  body: { attemptId, outcome: 'answered' as const },
});
const answers = (attemptId: string) => ({
  kind: 'answers' as const,
  taskId: 't1',
  campaignId: 'c1',
  attemptId,
  body: { answers: [{ fieldKey: 'interest', status: 'answered' as const, value: 'high' }] },
});
const sender = (impl: Partial<Sender> = {}): Sender => ({
  answers: jest.fn(async () => ({})),
  complete: jest.fn(async () => ({})),
  ...impl,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  await store().activate('u1');
});

describe('campaign outbox', () => {
  it('persists per user and survives a restart', async () => {
    store().enqueue(complete('a1'));
    store().saveDraft('a2', { taskId: 't2', campaignId: 'c1', notes: 'half typed' });
    await flushCampaignOutboxWrites();
    store().deactivate();
    await store().activate('u2');
    expect(Object.keys(store().items)).toHaveLength(0); // another account never sees it
    await store().activate('u1');
    expect(Object.keys(store().items)).toEqual(['complete:a1']);
    expect(store().drafts.a2!.notes).toBe('half typed');
  });

  it('a completion supersedes pending answers for the same attempt', () => {
    store().enqueue(answers('a1'));
    store().enqueue(complete('a1'));
    store().enqueue(answers('a1'));
    expect(Object.keys(store().items)).toEqual(['complete:a1']);
  });

  it('sends answers before completions and removes them once the server confirms', async () => {
    const order: string[] = [];
    store().enqueue(complete('a1'));
    store().enqueue(answers('a2'));
    store().saveDraft('a1', { taskId: 't1', campaignId: 'c1', notes: 'x' });
    const send = sender({
      answers: jest.fn(async () => void order.push('answers')),
      complete: jest.fn(async () => void order.push('complete')),
    });
    const res = await store().flush(send);
    expect(order).toEqual(['answers', 'complete']);
    expect(res.sent).toBe(2);
    expect(store().items).toEqual({});
    expect(store().drafts.a1).toBeUndefined(); // the confirmed attempt's draft is cleared
  });

  it('keeps work through network errors with bounded backoff, then marks it failed', async () => {
    store().enqueue(complete('a1'));
    const send = sender({
      complete: jest.fn(async () => {
        throw new ApiError({ kind: 'network', message: 'offline' });
      }),
    });
    let now = 1_000_000;
    const first = await store().flush(send, now);
    expect(first.deferred).toBe(1);
    expect(store().items['complete:a1']).toMatchObject({ status: 'pending', tries: 1 });
    // Not retried before its backoff.
    await store().flush(send, now + 1_000);
    expect(store().items['complete:a1']!.tries).toBe(1);
    for (let i = 0; i < MAX_TRIES; i += 1) {
      now += 10 * 60_000;
      await store().flush(send, now);
    }
    expect(store().items['complete:a1']).toMatchObject({ status: 'failed' });
  });

  it('surfaces conflicts and validation errors instead of discarding them', async () => {
    store().enqueue(complete('a1'));
    store().enqueue(answers('a2'));
    const send = sender({
      complete: jest.fn(async () => {
        throw new ApiError({ kind: 'http', status: 409, code: 'SIM_CALL_OUTCOME_CONFLICT', message: 'x' });
      }),
      answers: jest.fn(async () => {
        throw new ApiError({
          kind: 'http',
          status: 400,
          message: 'bad',
          details: [{ field: 'interest', message: 'Interest: invalid' }],
        });
      }),
    });
    const res = await store().flush(send);
    expect(res).toMatchObject({ conflicts: 1, failed: 1 });
    expect(store().items['complete:a1']).toMatchObject({
      status: 'conflict',
      error: 'SIM_CALL_OUTCOME_CONFLICT',
    });
    expect(store().items['answers:a2']).toMatchObject({ status: 'failed', error: 'Interest: invalid' });
    store().retryItem('complete:a1');
    expect(store().items['complete:a1']).toMatchObject({ status: 'pending', tries: 0 });
  });

  it('stops on an expired session and keeps everything', async () => {
    store().enqueue(complete('a1'));
    store().enqueue(complete('a2'));
    const send = sender({
      complete: jest.fn(async () => {
        throw new ApiError({ kind: 'http', status: 401, message: 'expired' });
      }),
    });
    const res = await store().flush(send);
    expect(res.unauthorized).toBe(true);
    expect(send.complete).toHaveBeenCalledTimes(1);
    expect(Object.keys(store().items)).toHaveLength(2);
  });
});
