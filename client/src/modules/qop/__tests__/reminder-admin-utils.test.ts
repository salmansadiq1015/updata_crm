import { describe, expect, test } from 'vitest';
import {
  buildReminderStats,
  filterAndSortReminders,
  parseNumberList,
  validateManualReminderForm,
  validateSettingsForm,
} from '../utils/reminder-admin-utils';

describe('reminder admin utilities', () => {
  test('parses bounded unique number lists with deterministic sorting', () => {
    expect(parseNumberList('2, 48, 24, 2, 0, 721', { min: 1, max: 720, sort: 'desc' }))
      .toEqual([48, 24, 2]);
    expect(parseNumberList('21, 7, 14, 7', { min: 1, max: 365, sort: 'asc' }))
      .toEqual([7, 14, 21]);
  });

  test('validates settings before calling the API', () => {
    expect(validateSettingsForm({
      appointmentReminderHours: '48, 24, 2',
      quotationFollowupDays: '7, 14, 21',
      quotationExpiryWarnDays: '3',
      defaultAppointmentChannel: 'both',
      defaultLanguage: 'de',
    }).value).toEqual({
      appointmentReminderHours: [48, 24, 2],
      quotationFollowupDays: [7, 14, 21],
      quotationExpiryWarnDays: 3,
      defaultAppointmentChannel: 'both',
      defaultLanguage: 'de',
    });

    expect(validateSettingsForm({
      appointmentReminderHours: '0',
      quotationFollowupDays: '7',
      quotationExpiryWarnDays: '3',
      defaultAppointmentChannel: 'email',
      defaultLanguage: 'de',
    }).errorKey).toBe('qop.reminders.settings.invalidAppointmentHours');
  });

  test('validates manual reminder payloads including ids and future schedule', () => {
    const futureSchedule = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    expect(validateManualReminderForm({
      appointmentId: '64f000000000000000000100',
      customerId: '64f000000000000000000200',
      scheduledAt: futureSchedule,
      channel: 'both',
      language: 'en',
      messageContent: 'Bring service documents.',
    }).value).toMatchObject({
      appointmentId: '64f000000000000000000100',
      customerId: '64f000000000000000000200',
      channel: 'both',
      language: 'en',
      messageContent: 'Bring service documents.',
      status: 'PENDING',
    });

    expect(validateManualReminderForm({
      appointmentId: 'bad-id',
      customerId: '64f000000000000000000200',
      scheduledAt: futureSchedule,
      channel: 'email',
      language: 'de',
      messageContent: '',
    }).errorKey).toBe('qop.reminders.manual.invalidIds');
  });

  test('builds queue stats and attention filters from reminders', () => {
    const now = new Date('2026-07-01T10:00:00.000Z');
    const reminders = [
      { _id: '1', status: 'PENDING', scheduledAt: '2026-07-01T09:00:00.000Z', customerId: { name: 'Alpha' } },
      { _id: '2', status: 'PENDING', scheduledAt: '2026-07-01T11:00:00.000Z', customerId: { name: 'Beta' } },
      { _id: '3', status: 'FAILED', scheduledAt: '2026-07-01T08:00:00.000Z', customerId: { name: 'Gamma' } },
      { _id: '4', status: 'DELIVERED', scheduledAt: '2026-07-01T07:00:00.000Z', customerId: { name: 'Delta' } },
    ];

    expect(buildReminderStats(reminders, now)).toMatchObject({
      total: 4,
      pending: 2,
      failed: 1,
      successful: 1,
      overdue: 1,
      successRate: 25,
      nextReminder: reminders[1],
    });

    expect(filterAndSortReminders(reminders, {
      statusFilter: 'attention',
      searchTerm: '',
      sortKey: 'newest',
    }, now).map((item) => item._id)).toEqual(['1', '3']);

    expect(filterAndSortReminders(reminders, {
      statusFilter: 'all',
      searchTerm: 'beta',
      sortKey: 'customer',
    }, now).map((item) => item._id)).toEqual(['2']);
  });
});
