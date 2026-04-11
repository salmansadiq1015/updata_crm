import taskDashboardService from './taskDashboard.service.js';

class TaskDashboardController {
  async getDashboard(req, res, next) {
    try {
      const data = await taskDashboardService.getDashboard(req.user._id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getStats(req, res, next) {
    try {
      const data = await taskDashboardService.getStats(req.user._id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getProjectTasks(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await taskDashboardService.getProjectTasks(req.params.projectId, query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getProjectTaskSummary(req, res, next) {
    try {
      const data = await taskDashboardService.getProjectTaskSummary(req.params.projectId);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getOrderTasks(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await taskDashboardService.getOrderTasks(req.params.orderId, query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getCrossProjectReport(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await taskDashboardService.getCrossProjectReport(query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getSyncChanges(req, res, next) {
    try {
      const { since } = req._validatedQuery || req.query;
      const data = await taskDashboardService.getSyncChanges(req.user._id, since);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async pushSyncChanges(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const data = await taskDashboardService.pushSyncChanges(req.user._id, req.body.changes, meta);
      return res.success({ data, message: 'Sync changes processed successfully' });
    } catch (err) { next(err); }
  }

  async getUserReminderDefaults(req, res, next) {
    try {
      const taskReminderService = (await import('./taskReminder.service.js')).default;
      const data = await taskReminderService.getUserDefaults(req.user._id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async setUserReminderDefaults(req, res, next) {
    try {
      const taskReminderService = (await import('./taskReminder.service.js')).default;
      const data = await taskReminderService.setUserDefaults(req.user._id, req.body);
      return res.success({ data, message: 'Reminder defaults updated successfully' });
    } catch (err) { next(err); }
  }
}

const taskDashboardController = new TaskDashboardController();
export default taskDashboardController;
