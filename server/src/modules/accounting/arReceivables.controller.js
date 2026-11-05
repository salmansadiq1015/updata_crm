import arReceivablesService from './arReceivables.service.js';

class ArReceivablesController {
  async getOpenReceivables(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await arReceivablesService.getOpenReceivables(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getAging(req, res, next) {
    try {
      const data = await arReceivablesService.getAgingReport(req._validatedQuery || req.query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getSummary(req, res, next) {
    try {
      const data = await arReceivablesService.getSummary(req._validatedQuery || req.query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async exportReceivables(req, res, next) {
    try {
      const { format } = req.body;
      const result = await arReceivablesService.exportReceivables(format);
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="receivables.csv"');
        return res.send(result);
      }
      return res.success({ data: result });
    } catch (err) { next(err); }
  }

  async writeOff(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await arReceivablesService.writeOff(req.params.id, req.body.reason, req.user._id, meta);
      return res.success({ data: result, message: 'Invoice written off successfully' });
    } catch (err) { next(err); }
  }

  async recordPayment(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const payment = await arReceivablesService.recordPayment(req.body, req.user._id, meta);
      return res.success({ data: payment, message: 'Payment recorded successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async allocatePayment(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await arReceivablesService.allocatePayment(req.params.id, req.body.allocations, req.user._id, meta);
      return res.success({ data: result, message: 'Payment allocated successfully' });
    } catch (err) { next(err); }
  }

  async importPayments(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await arReceivablesService.importPayments(req.body.payments, req.user._id, meta);
      return res.success({ data: result, message: `${result.length} payment(s) imported`, statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getPaymentById(req, res, next) {
    try {
      const payment = await arReceivablesService.getPaymentById(req.params.id);
      return res.success({ data: payment });
    } catch (err) { next(err); }
  }

  async getCustomerCreditBalance(req, res, next) {
    try {
      const data = await arReceivablesService.getCustomerCreditBalance(req.params.customerId);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async listPayments(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await arReceivablesService.listPayments(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getOverdue(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await arReceivablesService.getOverdueForDunning(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async generateDunning(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await arReceivablesService.generateDunningLettersWithOutput(
        req.body.invoiceIds,
        req.body.level,
        {
          format: req.body.format,
          sendEmail: req.body.sendEmail === true,
          recipientEmail: req.body.recipientEmail,
        },
        req.user._id,
        meta,
      );
      return res.success({ data: result, message: 'Dunning letters generated successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getDunningTemplates(req, res, next) {
    try {
      const templates = await arReceivablesService.getDunningTemplates();
      return res.success({ data: templates });
    } catch (err) { next(err); }
  }

  async updateDunningTemplate(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const template = await arReceivablesService.updateDunningTemplate(Number(req.params.level), req.body, req.user._id, meta);
      return res.success({ data: template, message: 'Dunning template updated successfully' });
    } catch (err) { next(err); }
  }
}

const arReceivablesController = new ArReceivablesController();
export default arReceivablesController;
