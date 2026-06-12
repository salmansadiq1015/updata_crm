import ReminderSettings from './reminderSettings.model.js';
import logger from '../../shared/logger/index.js';

const SETTINGS_KEY = 'default';

function parseIntegerList(raw, fallback, { min, max }) {
  const parsed = String(raw || '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= min && value <= max);
  return parsed.length > 0 ? [...new Set(parsed)].sort((a, b) => b - a) : fallback;
}

function parseInteger(raw, fallback, { min, max }) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function envDefaults() {
  return {
    appointmentReminderHours: parseIntegerList(
      process.env.APPOINTMENT_REMINDER_HOURS,
      [48, 24, 2],
      { min: 1, max: 720 },
    ),
    quotationFollowupDays: parseIntegerList(
      process.env.QUOTATION_FOLLOWUP_INTERVALS,
      [7, 14, 21],
      { min: 1, max: 365 },
    ).sort((a, b) => a - b),
    quotationExpiryWarnDays: parseInteger(
      process.env.QUOTATION_EXPIRY_WARN_DAYS,
      3,
      { min: 1, max: 90 },
    ),
    defaultAppointmentChannel: 'email',
    defaultLanguage: 'de',
  };
}

function normalizeSettings(settings) {
  const data = settings?.toObject ? settings.toObject() : settings;
  const defaults = envDefaults();
  return {
    ...defaults,
    ...(data || {}),
    appointmentReminderHours: Array.isArray(data?.appointmentReminderHours)
      && data.appointmentReminderHours.length > 0
      ? [...new Set(data.appointmentReminderHours)].sort((a, b) => b - a)
      : defaults.appointmentReminderHours,
    quotationFollowupDays: Array.isArray(data?.quotationFollowupDays)
      && data.quotationFollowupDays.length > 0
      ? [...new Set(data.quotationFollowupDays)].sort((a, b) => a - b)
      : defaults.quotationFollowupDays,
  };
}

class ReminderSettingsService {
  async getSettings() {
    const defaults = envDefaults();
    const settings = await ReminderSettings.findOneAndUpdate(
      { key: SETTINGS_KEY },
      { $setOnInsert: { key: SETTINGS_KEY, ...defaults } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    return normalizeSettings(settings);
  }

  async updateSettings(data, userId) {
    const update = {
      appointmentReminderHours: [...new Set(data.appointmentReminderHours)].sort((a, b) => b - a),
      quotationFollowupDays: [...new Set(data.quotationFollowupDays)].sort((a, b) => a - b),
      quotationExpiryWarnDays: data.quotationExpiryWarnDays,
      defaultAppointmentChannel: data.defaultAppointmentChannel,
      defaultLanguage: data.defaultLanguage,
      updatedBy: userId,
    };

    const settings = await ReminderSettings.findOneAndUpdate(
      { key: SETTINGS_KEY },
      { $set: update, $setOnInsert: { key: SETTINGS_KEY } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();

    logger.info('QOP reminder settings updated', {
      module: 'qop',
      action: 'reminderSettings.update',
      updatedBy: userId,
    });

    return normalizeSettings(settings);
  }

  async getEffectiveSettings() {
    try {
      return await this.getSettings();
    } catch (err) {
      logger.warn('Falling back to env reminder settings', {
        module: 'qop',
        action: 'reminderSettings.fallback',
        error: err.message,
      });
      return normalizeSettings(null);
    }
  }
}

const reminderSettingsService = new ReminderSettingsService();
export default reminderSettingsService;
