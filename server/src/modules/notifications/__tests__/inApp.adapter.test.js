import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const create = jest.fn();
const countDocuments = jest.fn();

jest.unstable_mockModule('../inAppNotification.model.js', () => ({
  default: {
    create,
    countDocuments,
  },
}));

jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

let adapter;

beforeAll(async () => {
  adapter = (await import('../adapters/inApp.adapter.js')).default;
});

beforeEach(() => {
  jest.clearAllMocks();
  delete global.io;
  create.mockImplementation(async (data) => ({
    _id: { toString: () => 'in-app-1' },
    ...data,
  }));
});

describe('inAppAdapter', () => {
  it('creates an in-app notification with a subject fallback when body is missing', async () => {
    const result = await adapter.send(
      {
        recipientId: 'user-1',
        notificationId: 'notification-1',
      },
      {
        subject: 'Assignment updated',
        body: '',
        category: 'SCHEDULING',
      },
    );

    expect(result).toMatchObject({
      success: true,
      delivered: true,
      provider: 'in_app',
      providerMessageId: 'in-app-1',
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Assignment updated',
      body: 'Assignment updated',
      category: 'SCHEDULING',
    }));
  });

  it('uses a safe body fallback even when all content fields are blank', async () => {
    await adapter.send(
      {
        recipientId: 'user-1',
        notificationId: 'notification-1',
      },
      {
        subject: '   ',
        body: '',
        bodyHtml: '',
      },
    );

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Notification',
      body: 'Notification',
    }));
  });
});
