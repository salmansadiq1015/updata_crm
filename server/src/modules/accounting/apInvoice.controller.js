import apInvoiceService from './apInvoice.service.js';
import paymentBatchRepository from './paymentBatch.repository.js';

class ApInvoiceController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const invoice = await apInvoiceService.create(req.body, req.user._id, meta);
      return res.success({ data: invoice, message: 'AP invoice created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await apInvoiceService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const invoice = await apInvoiceService.getById(req.params.id);
      return res.success({ data: invoice });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const invoice = await apInvoiceService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: invoice, message: 'AP invoice updated successfully' });
    } catch (err) { next(err); }
  }

  async approve(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const invoice = await apInvoiceService.approve(req.params.id, req.user._id, meta);
      return res.success({ data: invoice, message: 'AP invoice approved' });
    } catch (err) { next(err); }
  }

  async secondApprove(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const invoice = await apInvoiceService.secondApprove(req.params.id, req.user._id, meta);
      return res.success({ data: invoice, message: 'AP invoice second approval completed' });
    } catch (err) { next(err); }
  }

  async dispute(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const invoice = await apInvoiceService.dispute(req.params.id, req.body.reason, req.user._id, meta);
      return res.success({ data: invoice, message: 'AP invoice disputed' });
    } catch (err) { next(err); }
  }

  async getDocument(req, res, next) {
    try {
      const invoice = await apInvoiceService.getById(req.params.id);
      return res.success({ data: { documentId: invoice.documentId } });
    } catch (err) { next(err); }
  }

  async getOpenPayables(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await apInvoiceService.getOpenPayables(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getAging(req, res, next) {
    try {
      const data = await apInvoiceService.getAgingReport();
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getSummary(req, res, next) {
    try {
      const data = await apInvoiceService.getSummary();
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async createPaymentBatch(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const batch = await apInvoiceService.createPaymentBatch(
        req.body.invoiceIds,
        req.body.bankAccountId,
        req.user._id,
        meta,
      );
      return res.success({ data: batch, message: 'Payment batch created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getPaymentBatch(req, res, next) {
    try {
      const batch = await paymentBatchRepository.findById(req.params.batchId);
      if (!batch) {
        const { NotFoundError } = await import('../../shared/errors/AppError.js');
        throw new NotFoundError('PaymentBatch', req.params.batchId);
      }
      return res.success({ data: batch });
    } catch (err) { next(err); }
  }

  async exportPaymentBatchPain001(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const file = await apInvoiceService.exportPaymentBatchPain001(req.params.batchId, req.user._id, meta);
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      return res.status(200).send(file.xml);
    } catch (err) { next(err); }
  }
}

const apInvoiceController = new ApInvoiceController();
export default apInvoiceController;
