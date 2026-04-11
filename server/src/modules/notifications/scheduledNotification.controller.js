import scheduledNotificationService from './scheduledNotification.service.js';

class ScheduledNotificationController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const scheduled = await scheduledNotificationService.create(req.body, req.user._id, meta);
      return res.success({ data: scheduled, message: 'Scheduled notification created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const scheduled = await scheduledNotificationService.getById(req.params.id);
      return res.success({ data: scheduled });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await scheduledNotificationService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const scheduled = await scheduledNotificationService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: scheduled, message: 'Scheduled notification updated successfully' });
    } catch (err) { next(err); }
  }

  async remove(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await scheduledNotificationService.remove(req.params.id, req.user._id, meta);
      return res.success({ data: result, message: 'Scheduled notification deleted successfully' });
    } catch (err) { next(err); }
  }

  async cancel(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await scheduledNotificationService.cancel(req.params.id, req.user._id, meta);
      return res.success({ data: result, message: 'Scheduled notification cancelled successfully' });
    } catch (err) { next(err); }
  }

  async pause(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await scheduledNotificationService.pause(req.params.id, req.user._id, meta);
      return res.success({ data: result, message: 'Scheduled notification paused successfully' });
    } catch (err) { next(err); }
  }

  async resume(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await scheduledNotificationService.resume(req.params.id, req.user._id, meta);
      return res.success({ data: result, message: 'Scheduled notification resumed successfully' });
    } catch (err) { next(err); }
  }
}

const scheduledNotificationController = new ScheduledNotificationController();
export default scheduledNotificationController;
