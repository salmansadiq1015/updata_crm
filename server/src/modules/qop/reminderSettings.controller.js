import reminderSettingsService from './reminderSettings.service.js';

class ReminderSettingsController {
  async get(req, res, next) {
    try {
      const settings = await reminderSettingsService.getSettings();
      return res.success({ data: settings });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const settings = await reminderSettingsService.updateSettings(req.body, req.user._id);
      return res.success({ data: settings, message: 'Reminder settings updated successfully' });
    } catch (err) { next(err); }
  }
}

const reminderSettingsController = new ReminderSettingsController();
export default reminderSettingsController;
