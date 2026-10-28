import { expect, it, jest } from '@jest/globals';
import { PairedPhoneProvider } from '../../src/modules/aiCalling/providers/pairedPhone.provider.js';

it('does not queue a phone dial unless a real voice worker claimed the room', async () => {
  const endCall = jest.fn(async () => ({}));
  const p = new PairedPhoneProvider({ dispatchAgent: async () => ({ outcome: 'accepted' }), waitForAgentWorker: async () => 'no_worker', endCall });
  const r = await p.createOutboundCall({ roomName: 'test-room', internalCallId: 'test', callRecordId: 'not-written', pairedDeviceId: 'owner-device' });
  expect(r.outcome).toBe('rejected');
  expect(r.errorCode).toBe('AGENT_NOT_READY');
  expect(endCall).toHaveBeenCalledWith({ roomName: 'test-room' });
});
