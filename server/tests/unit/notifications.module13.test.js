import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

const templateRepository = {
  findActive: jest.fn(),
  findById: jest.fn(),
  findMaxVersion: jest.fn(),
  create: jest.fn(),
  deactivateOthers: jest.fn(),
  findAll: jest.fn(),
  softDelete: jest.fn(),
};

const notificationDeliveryRepository = {
  searchHistory: jest.fn(),
  findHistoryForExport: jest.fn(),
  anonymizeRecipientHistory: jest.fn(),
  markStaleSentForReview: jest.fn(),
  countReviewRequired: jest.fn(),
};

const deviceTokenModel = {
  find: jest.fn(),
  updateMany: jest.fn(),
};

const cacheManager = {
  getOrSet: jest.fn((key, factory) => factory()),
  del: jest.fn(),
};

const auditService = { logEvent: jest.fn() };
const eventBus = { publish: jest.fn() };
const queueManager = { addJob: jest.fn() };
const logger = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};

jest.unstable_mockModule('../../src/modules/notifications/notificationTemplate.repository.js', () => ({
  default: templateRepository,
}));

jest.unstable_mockModule('../../src/modules/notifications/notificationDelivery.repository.js', () => ({
  default: notificationDeliveryRepository,
}));

jest.unstable_mockModule('../../src/modules/notifications/notification.repository.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({
  default: cacheManager,
}));

jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
  default: auditService,
}));

jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
  default: eventBus,
}));

jest.unstable_mockModule('../../src/shared/events/eventTypes.js', () => ({
  default: {
    NOTIFICATION_QUEUED: 'notification.queued',
    NOTIFICATION_SENT: 'notification.sent',
    NOTIFICATION_FAILED: 'notification.failed',
    NOTIFICATION_DELIVERED: 'notification.delivered',
    NOTIFICATION_BOUNCED: 'notification.bounced',
  },
}));

jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
  default: queueManager,
}));

jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
  default: logger,
}));

jest.unstable_mockModule('../../src/modules/mobile/deviceToken.model.js', () => ({
  default: deviceTokenModel,
}));

jest.unstable_mockModule('../../src/shared/socket/socketServer.js', () => ({
  isUserOnline: jest.fn(() => false),
}));

const notificationTemplateService = (await import('../../src/modules/notifications/notificationTemplate.service.js')).default;
const notificationService = (await import('../../src/modules/notifications/notification.service.js')).default;
const { PushAdapter } = await import('../../src/modules/notifications/adapters/push.adapter.js');

describe('module 13 notification service hardening', () => {
  const originalFetch = global.fetch;
  const originalAppId = process.env.ONESIGNAL_APP_ID;
  const originalApiKey = process.env.ONESIGNAL_REST_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager.getOrSet.mockImplementation((key, factory) => factory());
    process.env.ONESIGNAL_APP_ID = 'test-onesignal-app-id';
    process.env.ONESIGNAL_REST_API_KEY = 'test-onesignal-api-key';
    delete global.io;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalAppId === undefined) {
      delete process.env.ONESIGNAL_APP_ID;
    } else {
      process.env.ONESIGNAL_APP_ID = originalAppId;
    }
    if (originalApiKey === undefined) {
      delete process.env.ONESIGNAL_REST_API_KEY;
    } else {
      process.env.ONESIGNAL_REST_API_KEY = originalApiKey;
    }
  });

  test('renders templates with version metadata for queued delivery history', async () => {
    templateRepository.findActive.mockResolvedValue({
      _id: 'template-1',
      version: 7,
      subjectTemplate: 'Hello {{firstName}}',
      bodyTemplate: 'Appointment {{appointment.date}}',
      bodyHtmlTemplate: '<p>{{appointment.date}}</p>',
    });

    const rendered = await notificationTemplateService.render('appointment_reminder', 'EMAIL', 'de', {
      firstName: 'Ada',
      appointment: { date: '2026-06-23' },
    });

    expect(rendered).toEqual({
      subject: 'Hello Ada',
      body: 'Appointment 2026-06-23',
      bodyHtml: '<p>2026-06-23</p>',
      templateId: 'template-1',
      templateVersion: 7,
    });
  });

  test('serializes masked notification history with lifecycle timeline', async () => {
    const createdAt = new Date('2026-06-22T08:00:00.000Z');
    const sentAt = new Date('2026-06-22T08:00:03.000Z');
    const deliveredAt = new Date('2026-06-22T08:00:04.000Z');

    notificationDeliveryRepository.searchHistory.mockResolvedValue({
      data: [{
        _id: { toString: () => 'delivery-1' },
        notificationId: { toString: () => 'notification-1' },
        recipientId: { toString: () => 'user-1' },
        recipientEmail: 'Customer@example.com',
        recipientPhone: '+41791234567',
        channel: 'EMAIL',
        status: 'DELIVERED',
        renderedSubject: 'Appointment reminder',
        renderedBody: 'Your appointment is tomorrow.',
        templateId: { toString: () => 'template-1' },
        templateVersion: 2,
        createdAt,
        sentAt,
        deliveredAt,
        notification: {
          type: 'appointment_reminder',
          category: 'SCHEDULING',
          status: 'COMPLETED',
          sourceModule: 'qop',
          sourceEvent: 'appointment.created',
        },
      }],
      pagination: { hasNext: false, nextCursor: null, limit: 50 },
    });

    const result = await notificationService.searchHistory({ limit: 50, search: 'customer' });

    expect(result.data[0]).toMatchObject({
      deliveryId: 'delivery-1',
      notificationId: 'notification-1',
      type: 'appointment_reminder',
      channel: 'EMAIL',
      recipient: {
        email: 'C***@example.com',
        phone: '+41** *** ** 67',
      },
      content: {
        subject: 'Appointment reminder',
        templateId: 'template-1',
        templateVersion: 2,
      },
    });
    expect(result.data[0].statusTimeline.map((item) => item.status)).toEqual(['PENDING', 'SENT', 'DELIVERED']);
    expect(notificationService._getRetryDelay('PUSH', 1)).toBe(10000);
    expect(notificationService._getRetryDelay('EMAIL', 5)).toBe(3600000);
  });

  test('sends push notification via OneSignal API targeting external_user_id', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 'onesignal-msg-1',
        recipients: 1,
      }),
    }));

    const adapter = new PushAdapter();
    const result = await adapter.send(
      {
        _id: 'delivery-1',
        notificationId: { toString: () => 'notification-1' },
        recipientId: { toString: () => 'user-1' },
      },
      {
        subject: 'Dispatch',
        body: 'Assigned task',
        category: 'TASK',
        priority: 'HIGH',
        deepLink: '/tasks/1',
      },
    );

    expect(result).toMatchObject({
      success: true,
      provider: 'onesignal',
      providerMessageId: 'onesignal-msg-1',
      targetCount: 1,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.onesignal.com/notifications',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Key test-onesignal-api-key',
          'Content-Type': 'application/json',
        }),
      }),
    );

    // Verify the request body contains the external_user_id
    const fetchCall = global.fetch.mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1].body);
    expect(requestBody.app_id).toBe('test-onesignal-app-id');
    expect(requestBody.include_external_user_ids).toEqual(['user-1']);
    expect(requestBody.headings).toEqual({ en: 'Dispatch' });
    expect(requestBody.contents).toEqual({ en: 'Assigned task' });
    expect(requestBody.data.deepLink).toBe('/tasks/1');
  });
});
