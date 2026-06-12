import { jest, describe, expect, test } from '@jest/globals';

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function loadReminderSettingsService({ leanResult, leanError } = {}) {
  jest.resetModules();

  const lean = jest.fn(async () => {
    if (leanError) throw leanError;
    return leanResult;
  });
  const ReminderSettings = {
    findOneAndUpdate: jest.fn(() => ({ lean })),
  };
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  jest.unstable_mockModule('../../src/modules/qop/reminderSettings.model.js', () => ({
    default: ReminderSettings,
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: logger,
  }));

  const service = (await import('../../src/modules/qop/reminderSettings.service.js')).default;
  return { service, ReminderSettings, logger };
}

async function loadAppointmentReminderService({ existingReminder = { _id: 'reminder-1' }, listDocs = [] } = {}) {
  jest.resetModules();

  const appointmentReminderRepository = {
    create: jest.fn(async (data) => ({ _id: 'reminder-new', ...data })),
    findById: jest.fn(async () => existingReminder),
    updateStatus: jest.fn(async (id, data) => ({ _id: id, ...data })),
    findPendingForDispatch: jest.fn(async () => []),
  };
  const chain = {
    populate: jest.fn(() => chain),
    sort: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    lean: jest.fn(async () => listDocs),
  };
  const AppointmentReminder = {
    find: jest.fn(() => chain),
  };

  jest.unstable_mockModule('../../src/modules/qop/appointmentReminder.repository.js', () => ({
    default: appointmentReminderRepository,
  }));
  jest.unstable_mockModule('../../src/modules/qop/appointmentReminder.model.js', () => ({
    default: AppointmentReminder,
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));

  const service = (await import('../../src/modules/qop/appointmentReminder.service.js')).default;
  return {
    service,
    appointmentReminderRepository,
    AppointmentReminder,
    chain,
  };
}

describe('QOP reminder settings', () => {
  test('updates reminder settings with normalized ordering', async () => {
    const { service, ReminderSettings } = await loadReminderSettingsService({
      leanResult: {
        key: 'default',
        appointmentReminderHours: [48, 24, 2],
        quotationFollowupDays: [7, 14, 21],
        quotationExpiryWarnDays: 5,
        defaultAppointmentChannel: 'email',
        defaultLanguage: 'de',
      },
    });

    await service.updateSettings({
      appointmentReminderHours: [2, 48, 24, 2],
      quotationFollowupDays: [21, 7, 14, 7],
      quotationExpiryWarnDays: 5,
      defaultAppointmentChannel: 'email',
      defaultLanguage: 'de',
    }, '64f000000000000000000001');

    expect(ReminderSettings.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'default' },
      expect.objectContaining({
        $set: expect.objectContaining({
          appointmentReminderHours: [48, 24, 2],
          quotationFollowupDays: [7, 14, 21],
          quotationExpiryWarnDays: 5,
        }),
      }),
      expect.objectContaining({ upsert: true, runValidators: true }),
    );
  });

  test('falls back to env defaults when runtime settings cannot be loaded', async () => {
    const previous = {
      appointment: process.env.APPOINTMENT_REMINDER_HOURS,
      followup: process.env.QUOTATION_FOLLOWUP_INTERVALS,
      expiry: process.env.QUOTATION_EXPIRY_WARN_DAYS,
    };
    process.env.APPOINTMENT_REMINDER_HOURS = '12,4';
    process.env.QUOTATION_FOLLOWUP_INTERVALS = '9,5';
    process.env.QUOTATION_EXPIRY_WARN_DAYS = '6';

    const { service, logger } = await loadReminderSettingsService({
      leanError: new Error('db unavailable'),
    });

    const settings = await service.getEffectiveSettings();

    expect(settings.appointmentReminderHours).toEqual([12, 4]);
    expect(settings.quotationFollowupDays).toEqual([5, 9]);
    expect(settings.quotationExpiryWarnDays).toBe(6);
    expect(logger.warn).toHaveBeenCalled();

    restoreEnv('APPOINTMENT_REMINDER_HOURS', previous.appointment);
    restoreEnv('QUOTATION_FOLLOWUP_INTERVALS', previous.followup);
    restoreEnv('QUOTATION_EXPIRY_WARN_DAYS', previous.expiry);
  });
});

describe('QOP manual appointment reminders', () => {
  test('creates manual reminders with message content', async () => {
    const { service, appointmentReminderRepository } = await loadAppointmentReminderService();

    await service.create({
      appointmentId: '64f000000000000000000100',
      customerId: '64f000000000000000000200',
      channel: 'email',
      language: 'de',
      scheduledAt: new Date('2026-06-20T10:00:00.000Z'),
      messageContent: 'Call before arrival',
      status: 'PENDING',
    }, '64f000000000000000000001');

    expect(appointmentReminderRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'email',
      messageContent: 'Call before arrival',
      status: 'PENDING',
    }));
  });

  test('lists reminders with status filter and a bounded limit', async () => {
    const { service, AppointmentReminder, chain } = await loadAppointmentReminderService({
      listDocs: [{ _id: 'reminder-1', status: 'PENDING' }],
    });

    const reminders = await service.list({ status: 'PENDING', limit: 25 });

    expect(AppointmentReminder.find).toHaveBeenCalledWith({ status: 'PENDING' });
    expect(chain.limit).toHaveBeenCalledWith(25);
    expect(reminders).toHaveLength(1);
  });

  test('allows admins to cancel pending reminders manually', async () => {
    const { service, appointmentReminderRepository } = await loadAppointmentReminderService();

    await service.updateStatus('reminder-1', 'CANCELLED');

    expect(appointmentReminderRepository.updateStatus)
      .toHaveBeenCalledWith('reminder-1', { status: 'CANCELLED' });
  });
});

describe('QOP appointment reminder events', () => {
  test('creates configured reminder windows when an appointment is confirmed', async () => {
    jest.resetModules();
    const handlers = {};
    const appointmentReminderService = {
      create: jest.fn(async (data) => ({ _id: `reminder-${data.scheduledAt.toISOString()}`, ...data })),
    };

    jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
      default: { on: jest.fn((type, handler) => { handlers[type] = handler; }) },
    }));
    jest.unstable_mockModule('../../src/shared/events/eventTypes.js', () => ({
      default: {
        CUSTOMER_UPDATED: 'customer.updated',
        SCHEDULE_APPOINTMENT_CONFIRMED: 'appointment.confirmed',
        SCHEDULE_APPOINTMENT_RESCHEDULED: 'appointment.rescheduled',
        SCHEDULE_APPOINTMENT_CANCELLED: 'appointment.cancelled',
      },
    }));
    jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({
      default: { del: jest.fn() },
    }));
    jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
      default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    }));
    jest.unstable_mockModule('../../src/modules/qop/appointmentReminder.service.js', () => ({
      default: appointmentReminderService,
    }));
    jest.unstable_mockModule('../../src/modules/qop/reminderSettings.service.js', () => ({
      default: {
        getEffectiveSettings: jest.fn(async () => ({
          appointmentReminderHours: [48, 2],
          defaultAppointmentChannel: 'email',
          defaultLanguage: 'de',
        })),
      },
    }));

    const { registerQopEvents } = await import('../../src/modules/qop/qop.events.js');
    registerQopEvents();

    await handlers['appointment.confirmed']({
      payload: {
        appointmentId: '64f000000000000000000100',
        customerId: '64f000000000000000000200',
        scheduledDate: '2026-06-20T10:00:00.000Z',
      },
    });

    expect(appointmentReminderService.create).toHaveBeenCalledTimes(2);
    expect(appointmentReminderService.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      scheduledAt: new Date('2026-06-18T10:00:00.000Z'),
      channel: 'email',
      language: 'de',
    }));
    expect(appointmentReminderService.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      scheduledAt: new Date('2026-06-20T08:00:00.000Z'),
    }));
  });
});
