import fiscalPeriodService from './fiscalPeriod.service.js';

class FiscalPeriodController {
  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const periods = await fiscalPeriodService.list(query);
      return res.success({ data: periods });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const period = await fiscalPeriodService.create(req.body, req.user._id, meta);
      return res.success({ data: period, message: 'Fiscal period created', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const period = await fiscalPeriodService.getById(req.params.id);
      return res.success({ data: period });
    } catch (err) { next(err); }
  }

  async close(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const period = await fiscalPeriodService.close(req.params.id, req.body.reason, req.user._id, meta);
      return res.success({ data: period, message: 'Fiscal period closed' });
    } catch (err) { next(err); }
  }

  async reopen(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const period = await fiscalPeriodService.reopen(req.params.id, req.body.reason, req.user._id, meta);
      return res.success({ data: period, message: 'Fiscal period reopened' });
    } catch (err) { next(err); }
  }
}

const fiscalPeriodController = new FiscalPeriodController();
export default fiscalPeriodController;
