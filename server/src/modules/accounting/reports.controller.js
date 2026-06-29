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

  async getBalanceSheet(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const report = await accountingReportsService.getBalanceSheet(query);
      return res.success({ data: report });
    } catch (err) { next(err); }
  }

  async getTrialBalance(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const report = await accountingReportsService.getTrialBalance(query);
      return res.success({ data: report });
    } catch (err) { next(err); }
  }

  async getCashFlow(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const report = await accountingReportsService.getCashFlow(query);
      return res.success({ data: report });
    } catch (err) { next(err); }
  }

  async getGeneralLedger(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const report = await accountingReportsService.getGeneralLedger(query);
      return res.success({
        data: report.data,
        pagination: report.pagination,
        meta: {
          period: report.period,
          currency: report.currency,
          scope: report.scope,
        },
      });
    } catch (err) { next(err); }
  }
}

const accountingReportsController = new AccountingReportsController();
export default accountingReportsController;
