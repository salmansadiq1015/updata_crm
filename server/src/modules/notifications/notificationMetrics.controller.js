import notificationMetricsService from './notificationMetrics.service.js';

class NotificationMetricsController {
  async getMetrics(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await notificationMetricsService.getMetrics(query);
      return res.success({ data });
    } catch (err) { next(err); }
  }
}

const notificationMetricsController = new NotificationMetricsController();
export default notificationMetricsController;
