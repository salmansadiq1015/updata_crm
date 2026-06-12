import { jest, describe, expect, test, beforeEach } from '@jest/globals';

const createOrderMock = jest.fn(async () => ({
  _id: 'order1',
  orderNumber: 'ORD-001',
  customerName: 'Muller AG',
  status: 'CONFIRMED',
}));

const transitionStatusMock = jest.fn(async () => ({
  orderId: 'order1',
  fromStatus: 'CONFIRMED',
  toStatus: 'COMPLETED',
}));

jest.unstable_mockModule('../../src/modules/qop/order.service.js', () => ({
  default: {
    create: createOrderMock,
    transitionStatus: transitionStatusMock,
  },
}));

jest.unstable_mockModule('../../src/modules/qop/order.repository.js', () => ({
  default: {
    updateById: jest.fn(async () => ({})),
  },
}));

jest.unstable_mockModule('../../src/modules/crm/customer.service.js', () => ({
  default: {
    search: jest.fn(async () => [{ _id: 'cust1', name: 'Muller AG' }]),
    update: jest.fn(async () => ({ _id: 'cust1', name: 'Muller AG' })),
  },
}));

describe('AI action dispatcher', () => {
  let dispatcher;

  beforeEach(async () => {
    jest.resetModules();
    createOrderMock.mockClear();
    transitionStatusMock.mockClear();
    ({ default: dispatcher } = await import('../../src/modules/ai/ai.actionDispatcher.service.js'));
  });

  test('creates order from voice session entities', async () => {
    const session = {
      _id: 'sess1',
      intentName: 'create_order',
      language: 'de-CH',
      correctedTranscript: 'Neuer Auftrag fuer Muller',
      audioFileUrl: 'https://files/audio.webm',
      entities: [
        {
          entityType: 'CUSTOMER_NAME',
          value: 'Muller',
          normalizedValue: 'Muller AG',
          resolvedId: 'cust1',
          confidence: 0.9,
        },
        {
          entityType: 'DESCRIPTION',
          value: 'Heizung defekt',
          confidence: 0.85,
        },
      ],
    };

    const result = await dispatcher.dispatch(session, 'user1', {});
    expect(result.action).toBe('create_order');
    expect(result.recordId).toBe('order1');
    expect(result.message).toContain('ORD-001');
  });

  test('updates current order status from voice command target', async () => {
    const session = {
      _id: 'sess2',
      intentName: 'update_status',
      contextRecordType: 'order',
      contextRecordId: 'order1',
      commandActionTarget: 'status:completed',
      rawTranscript: 'status erledigt',
      entities: [],
    };

    const result = await dispatcher.dispatch(session, 'user1', { ipAddress: '127.0.0.1' });

    expect(result.action).toBe('update_status');
    expect(result.recordType).toBe('order');
    expect(result.recordId).toBe('order1');
    expect(transitionStatusMock).toHaveBeenCalledWith(
      'order1',
      'COMPLETED',
      { reason: 'Voice assistant status update' },
      'user1',
      expect.objectContaining({ source: 'ai-voice', voiceSessionId: 'sess2' }),
    );
  });
});
