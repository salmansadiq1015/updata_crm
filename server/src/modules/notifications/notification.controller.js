import notificationService from './notification.service.js';

class NotificationController {
  async create(req, res, next) {
    try {
      const notification = await notificationService.create(req.body);
      return res.success({ data: notification, message: 'Notification created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const notification = await notificationService.getById(req.params.id);
      return res.success({ data: notification });
    } catch (err) { next(err); }
  }

  async search(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await notificationService.search(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async history(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await notificationService.searchHistory(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async exportHistory(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const csv = await notificationService.exportHistory(query);
      const filename = `notification-history-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(csv);
    } catch (err) { next(err); }
  }

  async anonymizeHistory(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await notificationService.anonymizeRecipientHistory(req.body, req.user._id, meta);
      return res.success({ data: result, message: 'Notification history anonymized successfully' });
    } catch (err) { next(err); }
  }

  async flagStaleDeliveries(req, res, next) {
    try {
      const result = await notificationService.flagStaleDeliveryCallbacks(req.body);
      return res.success({ data: result, message: 'Stale delivery callbacks flagged for review' });
    } catch (err) { next(err); }
  }
}

const notificationController = new NotificationController();
export default notificationController;
