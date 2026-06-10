import dashboardService from './dashboard.service.js';

class DashboardController {
  async summary(req, res, next) {
    try {
      const { date } = req.query;
      const data = await dashboardService.getSummary(date);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async utilization(req, res, next) {
    try {
      const { startDate, endDate, employeeIds } = req.query;
      const empIds = employeeIds ? employeeIds.split(',').filter(Boolean) : [];
      const data = await dashboardService.getUtilization(startDate, endDate, empIds);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async alerts(req, res, next) {
    try {
      const data = await dashboardService.getAlerts();
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async unassigned(req, res, next) {
    try {
      const data = await dashboardService.getUnassignedOrders(req.query.limit);
      return res.success({ data });
    } catch (err) { next(err); }
  }
}

const dashboardController = new DashboardController();
export default dashboardController;
