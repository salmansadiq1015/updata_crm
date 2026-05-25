import accountService from './account.service.js';

class AccountController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const account = await accountService.create(req.body, req.user._id, meta);
      return res.success({ data: account, message: 'Account created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await accountService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const account = await accountService.getById(req.params.id);
      return res.success({ data: account });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const account = await accountService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: account, message: 'Account updated successfully' });
    } catch (err) { next(err); }
  }

  async getBalance(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const balance = await accountService.getBalance(req.params.id, query);
      return res.success({ data: balance });
    } catch (err) { next(err); }
  }

  async getOverview(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const overview = await accountService.getOverview(req.params.id, query);
      return res.success({ data: overview });
    } catch (err) { next(err); }
  }

  async exportOverviewCsv(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const csv = await accountService.exportOverviewCsv(req.params.id, query);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="account-${req.params.id}-overview.csv"`);
      return res.send(csv);
    } catch (err) { next(err); }
  }
}

const accountController = new AccountController();
export default accountController;
