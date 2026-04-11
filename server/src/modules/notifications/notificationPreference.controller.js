import notificationPreferenceService from './notificationPreference.service.js';

class NotificationPreferenceController {
  async getPreferences(req, res, next) {
    try {
      const preferences = await notificationPreferenceService.getPreferences(req.user._id);
      return res.success({ data: preferences });
    } catch (err) { next(err); }
  }

  async updatePreferences(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const preferences = await notificationPreferenceService.updatePreferences(req.user._id, req.body, meta);
      return res.success({ data: preferences, message: 'Preferences updated successfully' });
    } catch (err) { next(err); }
  }
}

const notificationPreferenceController = new NotificationPreferenceController();
export default notificationPreferenceController;
