import AsyncStorage from '@react-native-async-storage/async-storage';

import { authApi } from '@/features/auth/api/authApi';
import { signOut } from '@/features/auth/services/session';
import { useSessionStore } from '@/features/auth/store/sessionStore';
import { newOperation } from '@/features/communication/domain/operations';
import { useOperationsStore } from '@/features/communication/store/operationsStore';

import { createQueue, skipItem } from '../domain/queue';
import { syncCallQueue } from '../hooks/useCallQueueRuntime';
import { flushCallQueueWrites, queueStorageKey, useCallQueueStore } from '../store/callQueueStore';

jest.mock('@/features/auth/api/authApi', () => ({ authApi: { logout: jest.fn() } }));

const LEADS = [
  { id: 'a'.repeat(24), name: 'Acme AG' },
  { id: 'b'.repeat(24), name: 'Beta GmbH' },
];

const queueFor = (userId: string, id = `q-${userId}`) => createQueue({ id, userId, leads: LEADS, now: 1 });

function signIn(id: string) {
  useSessionStore.getState().setAuthenticated({
    id,
    email: `${id}@example.com`,
    firstName: null,
    lastName: null,
    fullName: id,
    phone: null,
    language: null,
    avatarUrl: null,
    roleName: null,
    status: null,
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useCallQueueStore.getState().deactivate();
  useOperationsStore.getState().deactivate();
});

describe('call queue store', () => {
  it('persists per user and reloads only that user’s queue', async () => {
    await useCallQueueStore.getState().activate('u1');
    useCallQueueStore.getState().start(queueFor('u1'));
    useCallQueueStore.getState().change((q) => skipItem(q, LEADS[0]!.id));
    await flushCallQueueWrites();

    await useCallQueueStore.getState().activate('u2');
    expect(useCallQueueStore.getState().queue).toBeNull();

    await useCallQueueStore.getState().activate('u1');
    const restored = useCallQueueStore.getState().queue;
    expect(restored?.id).toBe('q-u1');
    expect(restored?.items[0]?.state).toBe('skipped');
  });

  it('never accepts a queue that belongs to another user', async () => {
    await useCallQueueStore.getState().activate('u1');
    useCallQueueStore.getState().start(queueFor('u2'));
    expect(useCallQueueStore.getState().queue).toBeNull();

    // A tampered/foreign record under u1's key is ignored on load.
    await AsyncStorage.setItem(queueStorageKey('u1'), JSON.stringify({ version: 1, queue: queueFor('u2') }));
    await useCallQueueStore.getState().activate('u1');
    expect(useCallQueueStore.getState().queue).toBeNull();
  });

  it('a late load for a previous user does not land in the new session', async () => {
    await useCallQueueStore.getState().activate('u1');
    useCallQueueStore.getState().start(queueFor('u1'));
    await flushCallQueueWrites();
    useCallQueueStore.getState().deactivate();

    const first = useCallQueueStore.getState().activate('u1');
    const second = useCallQueueStore.getState().activate('u2');
    await Promise.all([first, second]);
    expect(useCallQueueStore.getState().userId).toBe('u2');
    expect(useCallQueueStore.getState().queue).toBeNull();
  });

  it('clear removes the stored queue', async () => {
    await useCallQueueStore.getState().activate('u1');
    useCallQueueStore.getState().start(queueFor('u1'));
    useCallQueueStore.getState().clear();
    await flushCallQueueWrites();
    expect(await AsyncStorage.getItem(queueStorageKey('u1'))).toBeNull();
  });

  it('sign-out purges the signed-in user’s queue (other users keep theirs)', async () => {
    await useCallQueueStore.getState().activate('u2');
    useCallQueueStore.getState().start(queueFor('u2'));
    await flushCallQueueWrites();

    signIn('u1');
    await useOperationsStore.getState().activate('u1');
    await useCallQueueStore.getState().activate('u1');
    useCallQueueStore.getState().start(queueFor('u1'));
    await flushCallQueueWrites();
    expect(await AsyncStorage.getItem(queueStorageKey('u1'))).not.toBeNull();

    await signOut();
    expect(authApi.logout).toHaveBeenCalled();
    expect(useCallQueueStore.getState().queue).toBeNull();
    expect(useCallQueueStore.getState().userId).toBeNull();
    expect(await AsyncStorage.getItem(queueStorageKey('u1'))).toBeNull();
    expect(await AsyncStorage.getItem(queueStorageKey('u2'))).not.toBeNull();
  });
});

describe('syncCallQueue', () => {
  it('waits for the same user’s outbox before reconciling (never resets an open call)', async () => {
    await useCallQueueStore.getState().activate('u1');
    const q = queueFor('u1');
    q.items[0] = { ...q.items[0]!, operationId: 'op1' };
    useCallQueueStore.getState().start(q);

    // Outbox not loaded yet: nothing changes (the operation would look "missing").
    syncCallQueue();
    expect(useCallQueueStore.getState().queue?.items[0]?.operationId).toBe('op1');

    await useOperationsStore.getState().activate('u1');
    useOperationsStore.getState().put({
      ...newOperation({
        operationId: 'op1',
        userId: 'u1',
        leadId: LEADS[0]!.id,
        leadName: 'Acme AG',
        channel: 'phone',
        destinationField: 'phone',
        sim: null,
        now: 2,
      }),
      phase: 'in_progress',
    });
    syncCallQueue();
    expect(useCallQueueStore.getState().queue?.items[0]).toMatchObject({
      state: 'current',
      operationId: 'op1',
    });
  });
});
