import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENDPOINTS } from '@/lib/api/endpoints';
import {
  buildHistoryFilters,
  buildNotificationAdminOverview,
  buildSchedulePayload,
  buildTemplatePayload,
  hasAnonymizeTarget,
  normalizeMetrics,
  toggleChannel,
  withDefaultScheduleTime,
} from '../utils/notification-admin-utils';

const apiClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock('@/lib/api/client', () => ({
  default: apiClient,
}));

const { notificationAdminService } = await import('../services/notification-admin-service');

describe('notification admin utilities', () => {
  it('builds canonical notification history filters and keeps preference endpoint aligned', () => {
    expect(ENDPOINTS.NOTIFICATIONS.PREFERENCES).toBe('/users/me/notification-preferences');

    expect(buildHistoryFilters({
      cursor: 'abc',
      search: '  customer@example.com  ',
      channel: 'EMAIL',
      status: 'FAILED',
    })).toEqual({
      limit: 50,
      cursor: 'abc',
      search: 'customer@example.com',
      channel: 'EMAIL',
      deliveryStatus: 'FAILED',
    });

    expect(buildHistoryFilters({ channel: 'ALL', status: 'ALL' })).toEqual({ limit: 50 });
  });

  it('normalizes template and schedule form payloads before API submission', () => {
    const template = buildTemplatePayload({
      type: ' appointment_reminder ',
      channel: 'EMAIL',
      language: 'de',
      subjectTemplate: 'Hello {{customer.name}}',
      bodyTemplate: 'Body {{appointment.date}}',
      bodyHtmlTemplate: '',
      whatsappTemplateId: '',
      variables: '{"customer.name":"string"}',
    });

    expect(template.payload).toEqual({
      type: 'appointment_reminder',
      channel: 'EMAIL',
      language: 'de',
      subjectTemplate: 'Hello {{customer.name}}',
      bodyTemplate: 'Body {{appointment.date}}',
      variables: { 'customer.name': 'string' },
    });

    const channels = toggleChannel(['IN_APP'], 'PUSH');
    const schedule = buildSchedulePayload(withDefaultScheduleTime({
      notificationType: 'daily_reminder',
      category: 'SYSTEM',
      scheduleType: 'ONE_TIME',
      recipientIds: 'user-1, user-1, user-2',
      channels,
      priority: 'NORMAL',
      title: 'Reminder',
      body: 'Complete reports',
      payloadJson: '{"source":"admin"}',
    }));

    expect(schedule.payload).toMatchObject({
      notificationType: 'daily_reminder',
      category: 'SYSTEM',
      scheduleType: 'ONE_TIME',
      recipientIds: ['user-1', 'user-2'],
      channels: ['IN_APP', 'PUSH'],
      payload: { title: 'Reminder', body: 'Complete reports', source: 'admin' },
    });
    expect(schedule.payload.scheduledAt).toMatch(/T/);
  });

  it('normalizes all-channel and single-channel metrics', () => {
    expect(normalizeMetrics({
      totals: { sent: 10, delivered: 7, failed: 2, bounced: 1 },
      channels: {
        EMAIL: { sent: 5, delivered: 4, failed: 1, reviewRequired: 2 },
        PUSH: { sent: 5, delivered: 3, bounced: 1, reviewRequired: 0 },
      },
    })).toMatchObject({
      totals: { sent: 10, delivered: 7, failed: 2, bounced: 1, reviewRequired: 2 },
      channels: [
        { channel: 'EMAIL', sent: 5 },
        { channel: 'PUSH', sent: 5 },
      ],
    });

    expect(normalizeMetrics({
      channel: 'EMAIL',
      stats: { sent: 3, delivered: 2, failed: 1, reviewRequired: 1 },
    })).toMatchObject({
      totals: { sent: 3, delivered: 2, failed: 1, reviewRequired: 1 },
      channels: [{ channel: 'EMAIL', sent: 3 }],
    });
  });

  it('builds the admin overview without coupling the UI to raw API envelopes', () => {
    const overview = buildNotificationAdminOverview({
      metrics: {
        totals: { sent: 20, delivered: 16, failed: 3, bounced: 1 },
        channels: {
          EMAIL: { sent: 10, delivered: 8, failed: 2, reviewRequired: 1 },
          IN_APP: { sent: 10, delivered: 8, failed: 1, bounced: 1, reviewRequired: 0 },
        },
      },
      templates: { items: [{ isActive: true }, { isActive: false }] },
      schedules: { items: [{ status: 'ACTIVE' }, { status: 'PAUSED' }, { status: 'ACTIVE' }] },
    });

    expect(overview).toMatchObject({
      sent: 20,
      delivered: 16,
      failed: 3,
      bounced: 1,
      reviewRequired: 1,
      deliveryRate: 80,
      failureRate: 20,
      channelCount: 2,
      templateCount: 2,
      activeTemplateCount: 1,
      scheduleCount: 3,
      activeScheduleCount: 2,
      pausedScheduleCount: 1,
    });
  });

  it('guards anonymization until at least one recipient target exists', () => {
    expect(hasAnonymizeTarget({ recipientId: '', email: '', phone: '' })).toBe(false);
    expect(hasAnonymizeTarget({ recipientId: '', email: 'customer@example.com', phone: '' })).toBe(true);
  });
});

describe('notification admin service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses centralized notification admin endpoints', async () => {
    apiClient.get.mockResolvedValueOnce({
      data: [{ deliveryId: 'd1' }],
      pagination: { hasNext: false, nextCursor: null },
    });

    await expect(notificationAdminService.getHistory({ limit: 50 })).resolves.toEqual({
      items: [{ deliveryId: 'd1' }],
      pagination: { hasNext: false, nextCursor: null },
    });
    expect(apiClient.get).toHaveBeenCalledWith('/notifications/history', { params: { limit: 50 } });

    apiClient.get.mockResolvedValueOnce({ data: new Blob(['csv']) });
    await notificationAdminService.exportHistory({ channel: 'EMAIL' });
    expect(apiClient.get).toHaveBeenLastCalledWith('/notifications/history/export', {
      params: { channel: 'EMAIL' },
      responseType: 'blob',
    });

    apiClient.post.mockResolvedValueOnce({ data: { subject: 'Preview' } });
    await notificationAdminService.previewTemplate('template-1', { firstName: 'Ada' });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/admin/notification-templates/template-1/preview',
      { sampleData: { firstName: 'Ada' } },
    );

    apiClient.post.mockResolvedValueOnce({ data: { modifiedCount: 2 } });
    await notificationAdminService.flagStaleDeliveries({ olderThanMinutes: 60 });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/notifications/deliveries/flag-stale',
      { olderThanMinutes: 60 },
    );
  });
});
