import recurringTransactionService from './recurringTransaction.service.js';

function requestMeta(req) {
  return { ipAddress: req.ip, userAgent: req.get('user-agent') };
}

class RecurringTransactionController {
  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const transactions = await recurringTransactionService.list(query);
      return res.success({ data: transactions });
    } catch (err) { next(err); }
  }

  async summary(req, res, next) {
    try {
      const summary = await recurringTransactionService.summary();
      return res.success({ data: summary });
    } catch (err) { next(err); }
  }

  async runs(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const runs = await recurringTransactionService.runs(query);
      return res.success({ data: runs });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const transaction = await recurringTransactionService.create(req.body, req.user._id, requestMeta(req));
      return res.success({ data: transaction, message: 'Recurring transaction created', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const transaction = await recurringTransactionService.getById(req.params.id);
      return res.success({ data: transaction });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const transaction = await recurringTransactionService.update(req.params.id, req.body, req.user._id, requestMeta(req));
      return res.success({ data: transaction, message: 'Recurring transaction updated' });
    } catch (err) { next(err); }
  }

  async activate(req, res, next) {
    try {
      const transaction = await recurringTransactionService.activate(req.params.id, req.user._id, requestMeta(req));
      return res.success({ data: transaction, message: 'Recurring transaction activated' });
    } catch (err) { next(err); }
  }

  async pause(req, res, next) {
    try {
      const transaction = await recurringTransactionService.pause(req.params.id, req.user._id, requestMeta(req));
      return res.success({ data: transaction, message: 'Recurring transaction paused' });
    } catch (err) { next(err); }
  }

  async archive(req, res, next) {
    try {
      const transaction = await recurringTransactionService.archive(req.params.id, req.user._id, requestMeta(req));
      return res.success({ data: transaction, message: 'Recurring transaction archived' });
    } catch (err) { next(err); }
  }

  async runOne(req, res, next) {
    try {
      const result = await recurringTransactionService.runOne(req.params.id, req.body, req.user._id, requestMeta(req));
      return res.success({ data: result, message: 'Recurring transaction executed' });
    } catch (err) { next(err); }
  }

  async runDue(req, res, next) {
    try {
      const result = await recurringTransactionService.runDue(req.body, req.user._id, requestMeta(req));
      return res.success({ data: result, message: 'Due recurring transactions executed' });
    } catch (err) { next(err); }
  }
}

const recurringTransactionController = new RecurringTransactionController();
export default recurringTransactionController;
