import accountingEntityService from './accountingEntity.service.js';

class AccountingEntityController {
  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const entities = await accountingEntityService.list(query);
      return res.success({ data: entities });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const entity = await accountingEntityService.getById(req.params.id);
      return res.success({ data: entity });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const entity = await accountingEntityService.create(req.body, req.user?._id, meta);
      return res.success({ data: entity, message: 'Accounting entity created', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const entity = await accountingEntityService.update(req.params.id, req.body, req.user?._id, meta);
      return res.success({ data: entity, message: 'Accounting entity updated' });
    } catch (err) { next(err); }
  }

  async activate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const entity = await accountingEntityService.setStatus(req.params.id, 'ACTIVE', req.user?._id, meta);
      return res.success({ data: entity, message: 'Accounting entity activated' });
    } catch (err) { next(err); }
  }

  async deactivate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const entity = await accountingEntityService.setStatus(req.params.id, 'INACTIVE', req.user?._id, meta);
      return res.success({ data: entity, message: 'Accounting entity deactivated' });
    } catch (err) { next(err); }
  }
}

const accountingEntityController = new AccountingEntityController();
export default accountingEntityController;
