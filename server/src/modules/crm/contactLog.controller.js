import contactLogService from './contactLog.service.js';

class ContactLogController {
  // Central view: every exchange logged for a customer.
  async listByCustomer(req, res, next) {
    try {
      const { limit, skip, ...filters } = req.query;
      const result = await contactLogService.list(
        { customerId: req.params.customerId }, filters, { limit, skip },
      );
      return res.success({ data: result.items, pagination: { total: result.total, limit, skip } });
    } catch (err) { next(err); }
  }

  // Scoped view: the exchanges naming one object / project / order / assignment.
  async list(req, res, next) {
    try {
      const { limit, skip, customerId, siteId, projectId, orderId, assignmentId, ...filters } = req.query;
      const result = await contactLogService.list(
        { customerId, siteId, projectId, orderId, assignmentId }, filters, { limit, skip },
      );
      return res.success({ data: result.items, pagination: { total: result.total, limit, skip } });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      return res.success({ data: await contactLogService.getById(req.params.id) });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const entry = await contactLogService.create(req.params.customerId, req.body, req.user._id, meta);
      return res.success({ data: entry, message: 'Contact entry created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const entry = await contactLogService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: entry, message: 'Contact entry updated successfully' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await contactLogService.delete(req.params.id, req.user._id, meta);
      return res.success({ message: 'Contact entry deleted successfully' });
    } catch (err) { next(err); }
  }
}

const contactLogController = new ContactLogController();
export default contactLogController;
