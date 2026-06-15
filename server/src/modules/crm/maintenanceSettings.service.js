import MaintenanceSettings from './maintenanceSettings.model.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const SETTINGS_KEY = 'default';
const MIN_ESCALATION_DAYS = 1;
const MAX_ESCALATION_DAYS = 365;

function normalizeEscalationDays(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 30;
  return Math.min(Math.max(parsed, MIN_ESCALATION_DAYS), MAX_ESCALATION_DAYS);
}

function defaultSettings() {
  return {
    escalationDays: normalizeEscalationDays(config.maintenance?.escalationDays),
  };
}

function normalizeSettings(settings) {
  const data = settings?.toObject ? settings.toObject() : settings;
  return {
    ...defaultSettings(),
    ...(data || {}),
    escalationDays: normalizeEscalationDays(data?.escalationDays ?? defaultSettings().escalationDays),
  };
}

class MaintenanceSettingsService {
  async getSettings() {
    const defaults = defaultSettings();
    const settings = await MaintenanceSettings.findOneAndUpdate(
      { key: SETTINGS_KEY },
      { $setOnInsert: { key: SETTINGS_KEY, ...defaults } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).lean();
    return normalizeSettings(settings);
  }

  async updateSettings(data, userId) {
    const update = {
      escalationDays: data.escalationDays,
      updatedBy: userId,
    };

    const settings = await MaintenanceSettings.findOneAndUpdate(
      { key: SETTINGS_KEY },
      { $set: update, $setOnInsert: { key: SETTINGS_KEY } },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
    ).lean();

    logger.info('Maintenance settings updated', {
      module: 'crm',
      action: 'maintenanceSettings.update',
      updatedBy: userId,
      escalationDays: settings.escalationDays,
    });

    return normalizeSettings(settings);
  }

  async getEscalationDays() {
    try {
      const settings = await this.getSettings();
      return settings.escalationDays;
    } catch (err) {
      const fallbackDays = defaultSettings().escalationDays;
      logger.warn('Falling back to configured maintenance escalation days', {
        module: 'crm',
        action: 'maintenanceSettings.fallback',
        error: err.message,
        escalationDays: fallbackDays,
      });
      return fallbackDays;
    }
  }
}

const maintenanceSettingsService = new MaintenanceSettingsService();
export default maintenanceSettingsService;
