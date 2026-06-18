import { describe, expect, it } from 'vitest';
import {
  isPreferenceEnabled,
  normalizeNotificationPreferences,
  setPreferenceEnabled,
  toNotificationPreferencesPayload,
} from '../utils/notification-preferences';

describe('notification preference utils', () => {
  it('normalizes quiet hours and preference arrays from API envelopes', () => {
    const normalized = normalizeNotificationPreferences({
      data: {
        preferences: [{ notificationType: 'task_assigned', channel: 'PUSH', enabled: false }],
        quiet_hours: { enabled: true, start: '21:00', end: '06:30' },
      },
    });

    expect(normalized.preferences).toHaveLength(1);
    expect(normalized.quietHours).toMatchObject({
      enabled: true,
      startTime: '21:00',
      endTime: '06:30',
      timezone: 'Europe/Zurich',
      bypassCritical: true,
    });
  });

  it('treats missing entries as enabled and updates explicit channel entries', () => {
    expect(isPreferenceEnabled([], 'task_assigned', 'PUSH')).toBe(true);

    const disabled = setPreferenceEnabled([], 'task_assigned', 'PUSH', false);
    expect(disabled).toEqual([{ notificationType: 'task_assigned', channel: 'PUSH', enabled: false }]);
    expect(isPreferenceEnabled(disabled, 'task_assigned', 'PUSH')).toBe(false);

    const enabled = setPreferenceEnabled(disabled, 'task_assigned', 'PUSH', true);
    expect(isPreferenceEnabled(enabled, 'task_assigned', 'PUSH')).toBe(true);
  });

  it('keeps mandatory notifications enabled in client state', () => {
    const entries = setPreferenceEnabled([], 'maintenance_escalated', 'PUSH', false);

    expect(entries).toEqual([{ notificationType: 'maintenance_escalated', channel: 'PUSH', enabled: true }]);
    expect(isPreferenceEnabled(entries, 'maintenance_escalated', 'PUSH')).toBe(true);
  });

  it('emits the canonical server payload shape', () => {
    const payload = toNotificationPreferencesPayload({
      preferences: [{ notificationType: 'chat_message', channel: 'IN_APP', enabled: false }],
      quietHours: { enabled: true, startTime: '22:00', endTime: '05:00' },
    });

    expect(payload).toMatchObject({
      preferences: [{ notificationType: 'chat_message', channel: 'IN_APP', enabled: false }],
      quietHours: { enabled: true, startTime: '22:00', endTime: '05:00' },
    });
  });
});
