import quotationService from './quotation.service.js';

class QuotationController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const quotation = await quotationService.create(req.body, req.user._id, meta);
      return res.success({ data: quotation, message: 'Quotation created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await quotationService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const quotation = await quotationService.getById(req.params.id);
      return res.success({ data: quotation });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const quotation = await quotationService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: quotation, message: 'Quotation updated successfully' });
    } catch (err) { next(err); }
  }

  async delete(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await quotationService.softDelete(req.params.id, req.user._id, meta);
      return res.success({ message: 'Quotation deleted successfully' });
    } catch (err) { next(err); }
  }

  async duplicate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const quotation = await quotationService.duplicate(req.params.id, req.user._id, meta);
      return res.success({ data: quotation, message: 'Quotation duplicated successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async transitionStatus(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const quotation = await quotationService.transitionStatus(
        req.params.id,
        req.body.targetStatus,
        { reason: req.body.reason },
        req.user._id,
        meta,
      );
      return res.success({ data: quotation, message: 'Status updated successfully' });
    } catch (err) { next(err); }
  }

  async send(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const quotation = await quotationService.send(req.params.id, req.user._id, meta);
      return res.success({ data: quotation, message: 'Quotation sent successfully' });
    } catch (err) { next(err); }
  }

  async convert(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const { selectedLineItemIds } = req.body || {};
      const order = await quotationService.convertToOrder(
        req.params.id,
        { selectedLineItemIds },
        req.user._id,
        meta,
      );
      return res.success({ data: order, message: 'Quotation converted to order successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getDocuments(req, res, next) {
    try {
      const { default: generatedDocumentRepository } = await import('../doctpl/generatedDocument.repository.js');
      const documents = await generatedDocumentRepository.findBySource('qop', req.params.id);
      return res.success({ data: documents });
    } catch (err) { next(err); }
  }

  async generateDocument(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await quotationService.generateDocument(req.params.id, req.user._id, meta);
      return res.success({ data: result, message: 'Quotation document generated successfully' });
    } catch (err) { next(err); }
  }

  async getHistory(req, res, next) {
    try {
      const { default: documentStatusLogService } = await import('./documentStatusLog.service.js');
      const history = await documentStatusLogService.findByDocument('quotation', req.params.id);
      return res.success({ data: history });
    } catch (err) { next(err); }
  }

  async listReminders(req, res, next) {
    try {
      const { default: quotationReminderService } = await import('./quotationReminder.service.js');
      const { status, limit } = req.query;
      const reminders = await quotationReminderService.list({ status, limit: limit ? Number(limit) : 50 });
      return res.success({ data: reminders });
    } catch (err) { next(err); }
  }

  async snoozeReminder(req, res, next) {
    try {
      const { default: quotationReminderService } = await import('./quotationReminder.service.js');
      const reminder = await quotationReminderService.snooze(
        req.params.remId,
        req.body.snoozedUntil,
        req.user._id,
      );
      return res.success({ data: reminder, message: 'Reminder snoozed successfully' });
    } catch (err) { next(err); }
  }
}

const quotationController = new QuotationController();
export default quotationController;
