import cashManagementService from './cashManagement.service.js';

class CashManagementController {
  async getBalances(req, res, next) {
    try {
      const data = await cashManagementService.getBalances();
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getForecast(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const days = query.days ? Number(query.days) : 90;
      const data = await cashManagementService.getForecast({ days });
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async updateManualBalance(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await cashManagementService.updateManualBalance(
        req.body.bankAccountId,
        req.body.balance,
        req.body.date,
        req.user._id,
        meta,
      );
      return res.success({ data: result, message: 'Balance updated successfully' });
    } catch (err) { next(err); }
  }
}

const cashManagementController = new CashManagementController();
export default cashManagementController;
