import accountingReportsService from './reports.service.js';

class AccountingReportsController {
  async getProfitLoss(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const report = await accountingReportsService.getProfitLoss(query);
      return res.success({ data: report });
    } catch (err) { next(err); }
  }

  async exportProfitLossCsv(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const csv = await accountingReportsService.exportProfitLossCsv(query);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="profit_loss.csv"');
      return res.send(csv);
    } catch (err) { next(err); }
  }
}

const accountingReportsController = new AccountingReportsController();
export default accountingReportsController;
