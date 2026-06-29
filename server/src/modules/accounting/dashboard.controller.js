import accountingDashboardService from './dashboard.service.js';

class AccountingDashboardController {
  async getSnapshot(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const snapshot = await accountingDashboardService.getSnapshot(query);
      return res.success({ data: snapshot });
    } catch (err) { next(err); }
  }
}

const accountingDashboardController = new AccountingDashboardController();
export default accountingDashboardController;
