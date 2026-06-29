import budgetService from './budget.service.js';

class BudgetController {
  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const budgets = await budgetService.list(query);
      return res.success({ data: budgets });
    } catch (err) { next(err); }
  }

  async summary(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const summary = await budgetService.summary(query);
      return res.success({ data: summary });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const budget = await budgetService.create(req.body, req.user._id, meta);
      return res.success({ data: budget, message: 'Budget created', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const budget = await budgetService.getById(req.params.id);
      return res.success({ data: budget });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const budget = await budgetService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: budget, message: 'Budget updated' });
    } catch (err) { next(err); }
  }

  async approve(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const budget = await budgetService.approve(req.params.id, req.user._id, meta);
      return res.success({ data: budget, message: 'Budget approved' });
    } catch (err) { next(err); }
  }

  async lock(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const budget = await budgetService.lock(req.params.id, req.user._id, meta);
      return res.success({ data: budget, message: 'Budget locked' });
    } catch (err) { next(err); }
  }

  async variance(req, res, next) {
    try {
      const variance = await budgetService.variance(req.params.id);
      return res.success({ data: variance });
    } catch (err) { next(err); }
  }
}

const budgetController = new BudgetController();
export default budgetController;
