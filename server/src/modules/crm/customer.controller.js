import customerService from './customer.service.js';

class CustomerController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const customer = await customerService.create(req.body, req.user._id, meta);
      return res.success({ data: customer, message: 'Customer created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await customerService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const customer = await customerService.getById(req.params.id);
      return res.success({ data: customer });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const customer = await customerService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: customer, message: 'Customer updated successfully' });
    } catch (err) { next(err); }
  }

  async archive(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await customerService.archive(req.params.id, req.user._id, meta);
      return res.success({ message: 'Customer archived successfully' });
    } catch (err) { next(err); }
  }

  async search(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await customerService.search(query.q, query.limit);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async checkDuplicates(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await customerService.checkDuplicates(query.name, query.postalCode);
      return res.success({ data: result });
    } catch (err) { next(err); }
  }

  async merge(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await customerService.merge(req.body.sourceId, req.body.targetId, req.user._id, meta);
      return res.success({ message: 'Customers merged successfully' });
    } catch (err) { next(err); }
  }

  async bulkUpdate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await customerService.bulkUpdate(req.body.ids, req.body.data, req.user._id, meta);
      return res.success({ data: result, message: `${result.modifiedCount} customer(s) updated` });
    } catch (err) { next(err); }
  }

  async bulkDeactivate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await customerService.bulkDeactivate(req.body.ids, req.user._id, meta);
      return res.success({ data: result, message: `${result.deactivatedCount} customer(s) deactivated` });
    } catch (err) { next(err); }
  }

  async exportCsv(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const { format, ...filters } = query;
      const csv = await customerService.exportCsv(filters);
      const filename = `customers-${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csv);
    } catch (err) { next(err); }
  }

  async getActivity(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await customerService.getActivity(req.params.id, query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }
}

const customerController = new CustomerController();
export default customerController;
