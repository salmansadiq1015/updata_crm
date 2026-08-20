import orderService from './order.service.js';
import invoiceService from './invoice.service.js';

class OrderController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const order = await orderService.create(req.body, req.user._id, meta);
      return res.success({ data: order, message: 'Order created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await orderService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const order = await orderService.getById(req.params.id);
      return res.success({ data: order });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const order = await orderService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: order, message: 'Order updated successfully' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await orderService.softDelete(req.params.id, req.user._id, meta);
      return res.success({ message: 'Order deleted successfully' });
    } catch (err) { next(err); }
  }

  async transitionStatus(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const { targetStatus, reason } = req.body;
      const result = await orderService.transitionStatus(
        req.params.id,
        targetStatus,
        { reason },
        req.user._id,
        meta,
      );
      return res.success({ data: result, message: 'Order status updated successfully' });
    } catch (err) { next(err); }
  }

  async getInvoices(req, res, next) {
    try {
      const { default: invoiceRepository } = await import('./invoice.repository.js');
      const invoices = await invoiceRepository.findByOrderId(req.params.id);
      return res.success({ data: invoices });
    } catch (err) { next(err); }
  }

  async generateDocument(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await orderService.generateDocument(req.params.id, req.user._id, meta);
      return res.success({ data: result, message: 'Order confirmation generated successfully' });
    } catch (err) { next(err); }
  }

  async createProject(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const project = await orderService.createProject(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: project, message: 'Project opened from order', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getHistory(req, res, next) {
    try {
      const { default: documentStatusLogService } = await import('./documentStatusLog.service.js');
      const history = await documentStatusLogService.getHistory('order', req.params.id);
      return res.success({ data: history });
    } catch (err) { next(err); }
  }

  async getBillingPlan(req, res, next) {
    try {
      const plan = await invoiceService.getBillingPlan(req.params.id);
      return res.success({ data: plan });
    } catch (err) { next(err); }
  }
}

const orderController = new OrderController();
export default orderController;
