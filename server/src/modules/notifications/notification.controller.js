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
}

const notificationController = new NotificationController();
export default notificationController;
