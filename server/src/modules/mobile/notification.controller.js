import notificationService from './notification.service.js';

class NotificationController {
  async registerDevice(req, res, next) {
    try {
      const device = await notificationService.registerDevice(req.user._id, req.body);
      return res.success({ data: device, message: 'Device registered successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async removeDevice(req, res, next) {
    try {
      await notificationService.removeDevice(req.params.deviceId);
      return res.success({ message: 'Device removed successfully' });
    } catch (err) { next(err); }
  }

  async listNotifications(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await notificationService.listNotifications(req.user._id, {
        limit: query.limit ? Number(query.limit) : undefined,
        cursor: query.cursor || undefined,
      });
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async markRead(req, res, next) {
    try {
      const data = await notificationService.markRead(req.params.id, req.user._id);
      return res.success({ data, message: 'Notification marked as read' });
    } catch (err) { next(err); }
  }

  async getPreferences(req, res, next) {
    try {
      const data = await notificationService.getPreferences(req.user._id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async updatePreferences(req, res, next) {
    try {
      const data = await notificationService.updatePreferences(req.user._id, req.body);
      return res.success({ data, message: 'Preferences updated successfully' });
    } catch (err) { next(err); }
  }
}

const notificationController = new NotificationController();
export default notificationController;
