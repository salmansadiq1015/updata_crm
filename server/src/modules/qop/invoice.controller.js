import invoiceService from './invoice.service.js';

class InvoiceController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const invoice = await invoiceService.create(req.body, req.user._id, meta);
      return res.success({ data: invoice, message: 'Invoice created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async createAdvance(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const invoice = await invoiceService.createAdvanceInvoice(req.body, req.user._id, meta);
      return res.success({ data: invoice, message: 'Advance invoice created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async createFinal(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const invoice = await invoiceService.createFinalInvoice(req.body, req.user._id, meta);
      return res.success({ data: invoice, message: 'Final invoice created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await invoiceService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const invoice = await invoiceService.getById(req.params.id);
      return res.success({ data: invoice });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const invoice = await invoiceService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: invoice, message: 'Invoice updated successfully' });
    } catch (err) { next(err); }
  }

  async transitionStatus(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const { targetStatus, reason } = req.body;
      const result = await invoiceService.transitionStatus(
        req.params.id,
        targetStatus,
        { reason },
        req.user._id,
        meta,
      );
      return res.success({ data: result, message: 'Invoice status updated successfully' });
    } catch (err) { next(err); }
  }

  async finalize(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const invoice = await invoiceService.finalize(req.params.id, req.user._id, meta);
      return res.success({ data: invoice, message: 'Invoice finalized successfully' });
    } catch (err) { next(err); }
  }

  async send(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const invoice = await invoiceService.send(req.params.id, req.user._id, meta);
      return res.success({ data: invoice, message: 'Invoice sent successfully' });
    } catch (err) { next(err); }
  }

  async recordPayment(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const invoice = await invoiceService.recordPayment(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: invoice, message: 'Payment recorded successfully' });
    } catch (err) { next(err); }
  }

  async getPayments(req, res, next) {
    try {
      const payments = await invoiceService.getPayments(req.params.id);
      return res.success({ data: payments });
    } catch (err) { next(err); }
  }

  async generateDocument(req, res, next) {
    try {
      // Placeholder for document generation
      return res.success({ data: null, message: 'Document generation not yet implemented' });
    } catch (err) { next(err); }
  }

  async getHistory(req, res, next) {
    try {
      const { default: documentStatusLogService } = await import('./documentStatusLog.service.js');
      const history = await documentStatusLogService.getHistory('invoice', req.params.id);
      return res.success({ data: history });
    } catch (err) { next(err); }
  }
}

const invoiceController = new InvoiceController();
export default invoiceController;
