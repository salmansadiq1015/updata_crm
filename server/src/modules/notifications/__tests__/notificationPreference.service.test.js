import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const findByUserId = jest.fn();
const upsert = jest.fn();
const cacheGetOrSet = jest.fn((_key, fn) => fn());
const cacheDel = jest.fn();
const auditLogEvent = jest.fn();

jest.unstable_mockModule('../userNotificationPreference.repository.js', () => ({
  default: { findByUserId, upsert },
}));

jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: { getOrSet: cacheGetOrSet, del: cacheDel },
}));

jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: auditLogEvent },
}));

jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let service;

beforeEach(async () => {
  jest.clearAllMocks();
  service = (await import('../notificationPreference.service.js')).default;
});

describe('notificationPreferenceService', () => {
  it('respects disabled non-critical channel preferences', async () => {
    findByUserId.mockResolvedValue({
      preferences: [{ notificationType: 'task_assigned', channel: 'PUSH', enabled: false }],
      quietHours: { enabled: false },
    });

    await expect(service.isChannelEnabled('user-1', 'task_assigned', 'PUSH', 'NORMAL')).resolves.toBe(false);
  });

  it('keeps critical and mandatory notification types enabled', async () => {
    findByUserId.mockResolvedValue({
      preferences: [
        { notificationType: 'maintenance_escalated', channel: 'PUSH', enabled: false },
        { notificationType: 'task_assigned', channel: 'PUSH', enabled: false },
      ],
      quietHours: { enabled: false },
    });

    await expect(service.isChannelEnabled('user-1', 'task_assigned', 'PUSH', 'CRITICAL')).resolves.toBe(true);
    await expect(service.isChannelEnabled('user-1', 'maintenance_escalated', 'PUSH', 'NORMAL')).resolves.toBe(true);
  });

  it('normalizes mandatory preferences to enabled on update', async () => {
    const saved = {
      preferences: [{ notificationType: 'maintenance_escalated', channel: 'PUSH', enabled: true }],
      quietHours: { enabled: false },
    };
    upsert.mockResolvedValue(saved);

    const result = await service.updatePreferences('user-1', {
      preferences: [{ notificationType: 'maintenance_escalated', channel: 'PUSH', enabled: false }],
    });

    expect(upsert).toHaveBeenCalledWith('user-1', {
      preferences: [{ notificationType: 'maintenance_escalated', channel: 'PUSH', enabled: true }],
    });
    expect(result).toBe(saved);
  });
});
